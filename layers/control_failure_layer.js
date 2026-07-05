/*
 * control_failure_layer.js — M4, the Control & Failure Layer.
 *
 * General machinery that sits directly above the physics engine: the plant's
 * automation (reactor protection trips, engineered-safety actuation, alarms) and
 * the scenario's failures (injection + command interception). It contains NO
 * plant-specific literals — every setpoint, threshold, and failure definition is
 * DATA it consumes from the active engine's protection config (HR3). Its rules
 * read INSTRUMENT readings, never true state (HR1), bar the documented
 * `__true_flow__` exception.
 *
 * Commands descend through this layer (HR5): an auto-actuation or a trip scram is
 * issued through the SAME handleCommand path as an operator command, so a
 * command-override failure (e.g. a stuck-open PORV) intercepts the plant's own
 * close command just as it intercepts the operator's — the mechanism the TMI
 * scenario is built on.
 *
 * This layer has no scenario tests of its own; its correctness is integration
 * correctness, validated by the Test Runner (M7). Attaches RD.ControlFailureLayer.
 *
 * --- M1/M4 seam note ----------------------------------------------------------
 * M1's engine implements the persistent STATE of every failure (physics flags,
 * instrument failures, and the persistent effects of command-override failures
 * such as main_feedwater_available / porv_stuck / hpi_flow_multiplier — the
 * "hooks these effects need", M1 §9). This layer therefore FORWARDS each
 * inject/clear to the engine so those persistent effects take hold, and
 * ADDITIONALLY holds command-override failures to intercept commands in flight
 * (transform/block/severity-fold) — including the plant's own auto-actuation and
 * scram commands, which the engine state alone cannot catch. The two are
 * complementary, never contradictory.
 */
;(function (RD) {
  'use strict';

  function crossed(value, direction, setpoint) {
    if (value == null) return false;
    if (direction === 'high') return value > setpoint;
    if (direction === 'low') return value < setpoint;
    return false;
  }

  // Maps a value-bearing command to its parameter field (they differ by action).
  function valueFieldFor(action) {
    switch (action) {
      case 'set_feedwater_flow': case 'set_recirc_flow': case 'set_channel_flow': return 'pct';
      case 'set_hpi': case 'set_afw': case 'set_rcic': case 'set_hpci':
      case 'set_dhr': case 'set_rhr': case 'set_lpi': case 'set_eps_bypass': return 'active';
      case 'set_charging_flow': case 'set_letdown_flow': return 'normalized';
      case 'set_steam_demand': case 'set_turbine_load': return 'mwe';
      case 'set_heater': return 'power_pct';
      case 'set_spray': return 'open';
      case 'rod_nudge': return 'steps';
      default: return null;
    }
  }

  function ControlFailureLayer(engine, config) {
    this.engine = engine;
    this.config = config || (engine.getProtectionConfig && engine.getProtectionConfig());
    this.register = 'learning';
    this.rps = { scrammed: false, last_trip_reason: null };
    this.activeFailures = [];               // { id, def, severity|null }
    this.lastInstruments = {};
    this._buildAlarmModel();
    this.actuationFired = (this.config.actuations || []).map(function () { return false; });
  }

  // Precompute alarm lifecycle slots and lo/lo_lo escalation pairs (§5).
  ControlFailureLayer.prototype._buildAlarmModel = function () {
    var alarms = this.config.alarms || [];
    this.alarmStates = {};
    for (var i = 0; i < alarms.length; i++) this.alarmStates[alarms[i].id] = 'clear';
    // For each low alarm, find a less-extreme low sibling on the same instrument;
    // an alarm with one is an escalation (lo_lo) and fires only with its lo active.
    this._loSibling = {};
    for (var a = 0; a < alarms.length; a++) {
      var A = alarms[a];
      if (A.direction !== 'low') continue;
      var sib = null;
      for (var b = 0; b < alarms.length; b++) {
        var B = alarms[b];
        if (B === A || B.instrument !== A.instrument || B.direction !== 'low') continue;
        if (B.setpoint > A.setpoint && (!sib || B.setpoint < sib.setpoint)) sib = B; // nearest above
      }
      if (sib) this._loSibling[A.id] = sib;
    }
  };

  // ============================================================ command path (§7)
  ControlFailureLayer.prototype.handleCommand = function (command) {
    if (!command || !command.action) return { type: 'error', code: 'COMMAND_ERROR', message: 'no action', received: command };
    switch (command.action) {
      case 'acknowledge_alarm':        return this.acknowledgeAlarm(command.alarm_id);
      case 'acknowledge_all_alarms':   return this.acknowledgeAllAlarms();
      case 'inject_failure':           return this.injectFailure(command);
      case 'clear_failure':            return this.clearFailure(command.failure_id);
      case 'clear_all_failures':       return this.clearAllFailures();
      case 'set_register':             this.register = command.value; return null;
      case 'set_instrument_failure':
      case 'clear_instrument_failure': return this.engine.applyCommand(command);
    }

    // Plant commands pass through interception — at most ONE command_override
    // applies, in injection order (first wins, §7 precedence).
    var cmd = command;
    for (var i = 0; i < this.activeFailures.length; i++) {
      var f = this.activeFailures[i], def = f.def;
      if (def.type !== 'command_override' || !def.intercepts || def.intercepts.indexOf(cmd.action) === -1) continue;
      if (def.effect === 'block') return null;                          // DROP (ATWS / ADS-fail / LPCI-fail)
      if (def.override) { cmd = { action: def.override }; break; }      // e.g. close_porv → open_porv
      if ('override_value' in def) { cmd = this._withValue(cmd, f, def.override_value); break; }
      if (def.effect) return this._applyFailureEffect(f);               // non-block effect (none in PWR)
      break;                                                            // matched, no transform → pass through
    }
    return this.engine.applyCommand(cmd);
  };

  ControlFailureLayer.prototype._withValue = function (command, f, value) {
    var field = valueFieldFor(command.action);
    var out = {}; for (var k in command) out[k] = command[k];
    var v = value;
    if (f.def.severity_scales) v = value * (f.severity != null ? f.severity : 1.0);
    if (field) out[field] = v;
    return out;
  };

  ControlFailureLayer.prototype._applyFailureEffect = function (f) {
    // command_override "block" is short-circuited above; any other effect is a no-op
    // here for the PWR. (Engine-owned effects arrive as physics_parameter forwards.)
    return null;
  };

  // ----------------------------------------------------------------- failures (§6)
  ControlFailureLayer.prototype.injectFailure = function (command) {
    var id = command.failure_id, def = this.config.failures[id];
    if (!def) return { type: 'error', code: 'COMMAND_ERROR', message: 'unknown failure', received: command };
    var sev = def.severity_scales ? (command.severity != null ? command.severity : (def.severity_meta ? def.severity_meta.default / (def.severity_meta.max || 1) : 1.0)) : null;
    var existing = this._findFailure(id);
    if (existing) { existing.severity = sev; }                      // re-inject = severity update (in place)
    else { this.activeFailures.push({ id: id, def: def, severity: sev }); }
    // Forward to the engine so its persistent effect takes hold (see seam note).
    this.engine.applyCommand({ action: 'inject_failure', failure_id: id, severity: command.severity != null ? command.severity : 1.0 });
    return null;
  };

  ControlFailureLayer.prototype.clearFailure = function (id) {
    var idx = -1;
    for (var i = 0; i < this.activeFailures.length; i++) if (this.activeFailures[i].id === id) { idx = i; break; }
    if (idx !== -1) this.activeFailures.splice(idx, 1);
    this.engine.applyCommand({ action: 'clear_failure', failure_id: id });
    return null;
  };

  ControlFailureLayer.prototype.clearAllFailures = function () {
    var ids = this.activeFailures.map(function (f) { return f.id; });
    for (var i = 0; i < ids.length; i++) this.clearFailure(ids[i]);
    return null;
  };

  ControlFailureLayer.prototype._findFailure = function (id) {
    for (var i = 0; i < this.activeFailures.length; i++) if (this.activeFailures[i].id === id) return this.activeFailures[i];
    return null;
  };
  ControlFailureLayer.prototype._severityOf = function (id) {
    var f = this._findFailure(id); return f ? f.severity : null;
  };

  // ============================================================== evaluate (§9)
  ControlFailureLayer.prototype.evaluate = function (instruments) {
    this.lastInstruments = instruments || this.engine.getInstruments();
    this._evalTrips(this.lastInstruments);
    this._evalActuations(this.lastInstruments);
    this._evalAlarms(this.lastInstruments);
    return this.getSnapshotSections();
  };

  // Responsibility 1 — trips (§3). Any firing scrams; reads instruments (HR1)
  // except the documented __true_flow__ exception.
  ControlFailureLayer.prototype._evalTrips = function (ins) {
    var trips = this.config.trips || [];
    for (var i = 0; i < trips.length; i++) {
      var t = trips[i];
      var value = (t.instrument === '__true_flow__')
        ? this.engine.getTrueState().pump_flow_pct / 100   // HR1 exception: no flow instrument
        : ins[t.instrument];
      if (crossed(value, t.direction, t.setpoint) && !this.rps.scrammed) {
        this.rps.scrammed = true;
        this.rps.last_trip_reason = t.instrument + ' ' + t.direction;
        this.handleCommand({ action: 'scram' });            // descends through interception (ATWS-aware)
      }
    }
  };

  // Responsibility 2 — engineered-safety actuation (§4). Each issues a command
  // through handleCommand, so a command-override failure intercepts it too.
  ControlFailureLayer.prototype._evalActuations = function (ins) {
    var acts = this.config.actuations || [];
    for (var i = 0; i < acts.length; i++) {
      var act = acts[i];
      var value = ins[act.instrument];
      var gateOk = !act.condition || this._evaluateCondition(act.condition);
      if (gateOk && crossed(value, act.direction, act.setpoint) && !this.actuationFired[i]) {
        this.actuationFired[i] = true;
        this.handleCommand(this._actuationCommand(act, false));
      }
      if (act.reset_below !== undefined && this.actuationFired[i] && value != null && value > act.reset_below) {
        this.actuationFired[i] = false;
        if (act.reset_action) this.handleCommand(this._actuationCommand(act, true));
      }
    }
  };

  ControlFailureLayer.prototype._actuationCommand = function (act, isReset) {
    var cmd = { action: isReset ? act.reset_action : act.action };
    if (isReset) { if (act.reset_active !== undefined) cmd.active = act.reset_active; }
    else { if (act.active !== undefined) cmd.active = act.active; }
    return cmd;
  };

  ControlFailureLayer.prototype._evaluateCondition = function (cond) {
    if (cond in this.lastInstruments) return !!this.lastInstruments[cond];
    var ts = this.engine.getTrueState();
    if (cond in ts) return !!ts[cond];
    if (/_unavailable$/.test(cond)) {
      var base = cond.replace(/_unavailable$/, '_running');
      if (base in ts) return !ts[base];
    }
    return true; // permissive default (PWR uses no gate conditions)
  };

  // Responsibility 3 — alarms (§5). Reads instruments; advances each lifecycle.
  ControlFailureLayer.prototype._alarmRaw = function (alarm, ins) {
    var v = ins[alarm.instrument];
    switch (alarm.direction) {
      case 'high':     return v > alarm.setpoint;
      case 'low':      return v < alarm.setpoint;
      case 'is_true':  return v === true;
      case 'is_false': return v === false;
      case 'is_open':  return v === 'open';
      default:         return false;
    }
  };

  ControlFailureLayer.prototype._evalAlarms = function (ins) {
    var alarms = this.config.alarms || [];
    for (var i = 0; i < alarms.length; i++) {
      var alarm = alarms[i];
      var active = this._alarmRaw(alarm, ins);
      // lo_lo escalation: fires only once its lo sibling's condition holds.
      var sib = this._loSibling[alarm.id];
      if (active && sib) active = active && this._alarmRaw(sib, ins);
      var st = this.alarmStates[alarm.id];
      if (active) {
        if (st === 'clear') st = 'active_unacknowledged';
        // active_unacknowledged / active_acknowledged persist while condition holds
      } else {
        st = 'clear';
      }
      this.alarmStates[alarm.id] = st;
    }
  };

  ControlFailureLayer.prototype.acknowledgeAlarm = function (alarmId) {
    if (this.alarmStates[alarmId] === 'active_unacknowledged') this.alarmStates[alarmId] = 'active_acknowledged';
    return null;
  };
  ControlFailureLayer.prototype.acknowledgeAllAlarms = function () {
    for (var id in this.alarmStates) if (this.alarmStates[id] === 'active_unacknowledged') this.alarmStates[id] = 'active_acknowledged';
    return null;
  };

  // ------------------------------------------------------- snapshot sections (§9.5)
  ControlFailureLayer.prototype.getAlarms = function () {
    var alarms = this.config.alarms || [], out = [], reg = this.register;
    for (var i = 0; i < alarms.length; i++) {
      var a = alarms[i];
      out.push({
        id: a.id,
        state: this.alarmStates[a.id],
        priority: a.priority,
        panel: a.panel,
        tile_label: reg === 'industry' ? a.label_industry : a.label_learning,
      });
    }
    return out;
  };

  ControlFailureLayer.prototype.getActiveFailures = function () {
    return this.activeFailures.map(function (f) { return { id: f.id, severity: f.severity }; });
  };

  ControlFailureLayer.prototype.getRpsState = function () {
    return { scrammed: this.rps.scrammed, last_trip_reason: this.rps.last_trip_reason };
  };

  ControlFailureLayer.prototype.getSnapshotSections = function () {
    return {
      rps_state: this.getRpsState(),
      alarms: this.getAlarms(),
      active_failures: this.getActiveFailures(),
    };
  };

  // Failure catalog for the UI Failures tab (§10): rebuilt per plant change.
  ControlFailureLayer.prototype.getFailureCatalog = function () {
    var failures = this.config.failures || {}, out = [];
    for (var id in failures) {
      var def = failures[id];
      var entry = { id: id, display: def.display, category: def.category || 'safety_system' };
      if (def.severity_meta) entry.severity_meta = def.severity_meta;
      out.push(entry);
    }
    return out;
  };

  // -------------------------------------------------------------- save / restore
  // Serializes this layer's runtime state only (M4 holds no plant config of its
  // own; the engine restores its own failure effects). M5 coordinates both (§10).
  ControlFailureLayer.prototype.saveState = function () {
    return {
      register: this.register,
      rps: { scrammed: this.rps.scrammed, last_trip_reason: this.rps.last_trip_reason },
      activeFailures: this.activeFailures.map(function (f) { return { id: f.id, severity: f.severity }; }),
      alarmStates: Object.assign({}, this.alarmStates),
      actuationFired: this.actuationFired.slice(),
    };
  };
  ControlFailureLayer.prototype.loadState = function (st) {
    this.register = st.register;
    this.rps = { scrammed: st.rps.scrammed, last_trip_reason: st.rps.last_trip_reason };
    this.activeFailures = [];
    for (var i = 0; i < st.activeFailures.length; i++) {
      var f = st.activeFailures[i], def = this.config.failures[f.id];
      if (def) this.activeFailures.push({ id: f.id, def: def, severity: f.severity });
    }
    this.alarmStates = Object.assign({}, st.alarmStates);
    this.actuationFired = st.actuationFired.slice();
  };

  RD.ControlFailureLayer = ControlFailureLayer;

})(globalThis.RD || (globalThis.RD = {}));
