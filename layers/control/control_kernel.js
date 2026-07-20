/*
 * control_kernel.js — the Control Layer kernel (M4's general machinery).
 *
 * General machinery that sits directly above the physics engine: the plant's
 * automation (reactor protection trips, engineered-safety actuation, alarms) and
 * the scenario's failures (injection + command interception). It contains NO
 * plant-specific literals — every setpoint, threshold, and failure definition is
 * DATA it consumes from the per-plant control module (layers/control/<plant>_control.js,
 * reached through the engine's protection config; HR3). Its rules read INSTRUMENT
 * readings, never true state (HR1), bar the documented `__true_flow__` exception.
 *
 * Commands descend through this layer (HR5): an auto-actuation or a trip scram is
 * issued through the SAME handleCommand path as an operator command, so a
 * command-override failure (e.g. a stuck-open PORV) intercepts the plant's own
 * close command just as it intercepts the operator's — the mechanism the TMI
 * scenario is built on.
 *
 * This layer has no scenario tests of its own; its correctness is integration
 * correctness, validated by the Test Runner (M7). Attaches RD.ControlLayer
 * (and RD.ControlFailureLayer as a compatibility alias).
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

  function clip(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }
  function rodGroup(ctx, fn) {
    var gs = ctx.control_state && ctx.control_state.rod_groups || [];
    for (var i = 0; i < gs.length; i++) if (gs[i].function === fn) return gs[i];
    return null;
  }
  function rodGroupById(ctx, id) {
    var gs = ctx.control_state && ctx.control_state.rod_groups || [];
    for (var i = 0; i < gs.length; i++) if (gs[i].id === id) return gs[i];
    return null;
  }

  // Maps a value-bearing command to its parameter field (they differ by action).
  function valueFieldFor(action) {
    switch (action) {
      case 'set_feedwater_flow': case 'set_recirc_flow': case 'set_channel_flow': case 'set_afw_flow':
      case 'set_feed_pump_speed': case 'set_rhr_hx': return 'pct';
      case 'feed_pump_nudge': return 'delta_pct';
      case 'set_hpi': case 'set_afw': case 'set_rcic': case 'set_hpci':
      case 'set_dhr': case 'set_rhr': case 'set_eps_bypass': return 'active';
      case 'set_charging_flow': case 'set_letdown_flow': return 'normalized';
      case 'set_steam_demand': case 'set_turbine_load': case 'set_load_target': return 'mwe';
      case 'set_load_mode': return 'mode';
      case 'set_heater': return 'power_pct';
      case 'set_spray': return 'open';
      case 'rod_nudge': return 'steps';
      default: return null;
    }
  }

  function ControlLayer(engine, config) {
    this.engine = engine;
    this.config = config || (engine.getProtectionConfig && engine.getProtectionConfig());
    this.register = 'learning';
    this.rps = { scrammed: false, last_trip_reason: null };
    this.activeFailures = [];               // { id, def, severity|null }
    this.lastInstruments = {};
    this._buildAlarmModel();
    this.actuationFired = (this.config.actuations || []).map(function () { return false; });
    this.interlockActive = (this.config.interlocks || []).map(function () { return false; });
    // Automation channel runtime (M4b automation): per-plant channel defs are config data.
    this.channels = [];
    this.byId = {};
    this._autoT = 0;          // automation clock, sim-s since plant selection (saved)
    this._autoAcc = 0;        // sim-s accumulated toward the next channel evaluation
    this._internal = false;   // true while a channel/actuation output is descending
    var chDefs = this.config.channels || [];
    for (var ci = 0; ci < chDefs.length; ci++) {
      var ch = { def: chDefs[ci], engaged: false, sp: null, spEff: null, I: 0, lastAct: null,
                 lastSent: null, note: '', bangMode: 'idle', pvF: null, pvNow: null, rate: null };
      this.channels.push(ch);
      this.byId[chDefs[ci].id] = ch;
    }
    // ESF AUTO/MAN arms (M4b ESF arms): each configured system starts ARMED for its
    // auto-actuations; an OPERATOR command listed on the system flips it to
    // MANUAL (the plant's own actuations are _internal and don't). A plant that
    // initializes with a standing actuation condition already met (a depressurized
    // cold-shutdown lineup, where low-pressure SI would fire) starts that ESF in
    // MANUAL — the real lineup has it blocked (P-11) — re-armed with set_esf_auto.
    this.esfAuto = this._initialEsfArms();
    // Manual trip blocks (M4b trip blocks): trip id → true while blocked (P-10 gated).
    // A plant AT POWER starts with the blockable startup trips already blocked
    // (the real at-power lineup — they were blocked at P-10 on the way up);
    // auto-reinstate re-arms them the moment power falls below the permissive.
    this.tripBlocks = this._initialTripBlocks();
  }

  // Initial ESF arm state. Armed by default; disarm any system whose ACTIVATING
  // auto-actuation trigger is already satisfied at plant init — a standing
  // condition at start-up is an intentional lineup (cold shutdown, depressurized),
  // not an emergency, so the operator's lineup has that ESF blocked (the P-11 SI
  // block). Behaviour is unchanged for every hot initial state (no trigger met at
  // NOP), so at-power scenarios — TMI included — are untouched.
  ControlLayer.prototype._initialEsfArms = function () {
    var arms = {}, esf = this.config.esf_systems || [];
    for (var i = 0; i < esf.length; i++) arms[esf[i].id] = true;
    var ins = (this.engine && this.engine.getInstruments) ? this.engine.getInstruments() : {};
    var acts = this.config.actuations || [];
    for (var a = 0; a < acts.length; a++) {
      var act = acts[a];
      if (!act.arm || arms[act.arm] === false || act.active !== true) continue;   // only ACTIVATING actuations
      var gateOk = !act.condition || this._evaluateCondition(act.condition, ins);
      if (gateOk && crossed(ins[act.instrument], act.direction, act.setpoint)) arms[act.arm] = false;
    }
    return arms;
  };

  // A blockable trip starts BLOCKED when its permissive is already satisfied at plant
  // init — the at-power lineup blocks the startup trips (P-10), and a depressurized
  // cold-shutdown lineup blocks the low-pressure / low-flow trips (P-11 / P-7). Each
  // re-arms via _autoReinstateTripBlocks when its permissive drops.
  ControlLayer.prototype._initialTripBlocks = function () {
    var blocks = {};
    var ins = (this.engine && this.engine.getInstruments) ? this.engine.getInstruments() : {};
    var tps = this.config.trips || [];
    for (var ti = 0; ti < tps.length; ti++) {
      var t = tps[ti];
      if (t.blockable && t.id && this._permTest(this._tripPermissive(t), ins)) blocks[t.id] = true;
    }
    return blocks;
  };

  // Precompute alarm lifecycle slots and lo/lo_lo escalation pairs (§5).
  ControlLayer.prototype._buildAlarmModel = function () {
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
  ControlLayer.prototype.handleCommand = function (command) {
    if (!command || !command.action) return { type: 'error', code: 'COMMAND_ERROR', message: 'no action', received: command };
    switch (command.action) {
      case 'acknowledge_alarm':        return this.acknowledgeAlarm(command.alarm_id);
      case 'acknowledge_all_alarms':   return this.acknowledgeAllAlarms();
      case 'inject_failure':           return this.injectFailure(command);
      case 'clear_failure':            return this.clearFailure(command.failure_id);
      case 'clear_all_failures':       return this.clearAllFailures();
      case 'set_register':             this.register = command.value; return null;
      case 'set_auto_channel':         return this.setAutoChannel(command.channel_id, command.engaged);
      case 'set_auto_setpoint':        return this.setAutoSetpoint(command.channel_id, command.value);
      case 'set_esf_auto':             return this.setEsfAuto(command.system, command.auto);
      case 'set_trip_block':           return this.setTripBlock(command.trip_id, command.blocked);
      case 'set_instrument_failure':
      case 'clear_instrument_failure': return this.engine.applyCommand(command);
    }

    // A manual (operator) reactor trip latches the RPS exactly as an automatic
    // trip does — the same trip breakers open (C4). Without this, rps_state.scrammed
    // lagged an operator scram while the engine's true_state.scrammed and the
    // rps_scrammed instrument already reflected it, so any consumer reading
    // rps_state.scrammed alone mislabelled the plant. Latched BEFORE interception,
    // matching the automatic path in _evalTrips: an ATWS that blocks the rods still
    // shows the asserted trip signal (rps.scrammed) with the engine unscrammed.
    // Internal (trip-driven) scrams already set this and their real trip reason.
    if (!this._internal && command.action === 'scram' && !this.rps.scrammed) {
      this.rps.scrammed = true;
      this.rps.last_trip_reason = 'manual scram';
    }

    // Manual override (M4b automation): an OPERATOR command listed in a channel's
    // manual_overrides disengages that channel — taking the control by hand
    // kicks its automation to MAN (self-issued channel outputs are exempt).
    // Likewise an operator command on an ESF system disarms its auto (M4b ESF arms).
    if (!this._internal) { this._manualOverrideScan(command); this._esfManualScan(command); }

    // Interlocks (M4 §4b): condition-latched command blocks that read instruments
    // (HR1) and are pure config data (HR3) — e.g. the PWR rod-withdrawal block
    // on high startup rate. Distinct from failures: the plant is protecting
    // itself, not malfunctioning, so the caller gets a labelled refusal.
    var il = this._interlockBlocking(command);
    if (il) {
      return { type: 'blocked', code: 'INTERLOCK',
               message: (this.register === 'industry' ? il.message_industry : il.message_learning) || 'Blocked by a plant interlock.' };
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
      break;   // matched, no transform → pass through ('block' is the only real override effect)
    }
    return this.engine.applyCommand(cmd);
  };

  ControlLayer.prototype._withValue = function (command, f, value) {
    var field = valueFieldFor(command.action);
    var out = {}; for (var k in command) out[k] = command[k];
    var v = value;
    if (f.def.severity_scales) v = value * (f.severity != null ? f.severity : 1.0);
    if (field) out[field] = v;
    return out;
  };

  // Default severity from slider metadata — the SAME normalization the UI's
  // slider uses ((default − min)/(max − min), clamped), so an unspecified
  // severity means "the slider's default position" whether it arrives from the
  // Failures tab or a bare inject_failure. Handles inverted metas (min > max).
  function severityFromMeta(meta) {
    if (!meta || meta.max === meta.min) return 1.0;
    return clip((meta.default - meta.min) / (meta.max - meta.min), 0, 1);
  }

  // ----------------------------------------------------------------- failures (§6)
  ControlLayer.prototype.injectFailure = function (command) {
    var id = command.failure_id, def = this.config.failures[id];
    if (!def) return { type: 'error', code: 'COMMAND_ERROR', message: 'unknown failure', received: command };
    var sev = def.severity_scales ? (command.severity != null ? command.severity : severityFromMeta(def.severity_meta)) : null;
    var existing = this._findFailure(id);
    if (existing) { existing.severity = sev; }                      // re-inject = severity update (in place)
    else { this.activeFailures.push({ id: id, def: def, severity: sev }); }
    // Forward to the engine so its persistent effect takes hold (see seam note).
    // The layer-held and engine-applied severity must be the SAME number — a
    // defaulted severity used to forward 1.0 while the layer held default/max.
    this.engine.applyCommand({ action: 'inject_failure', failure_id: id,
                               severity: sev != null ? sev : (command.severity != null ? command.severity : 1.0) });
    return null;
  };

  ControlLayer.prototype.clearFailure = function (id) {
    var idx = -1;
    for (var i = 0; i < this.activeFailures.length; i++) if (this.activeFailures[i].id === id) { idx = i; break; }
    if (idx !== -1) this.activeFailures.splice(idx, 1);
    this.engine.applyCommand({ action: 'clear_failure', failure_id: id });
    return null;
  };

  ControlLayer.prototype.clearAllFailures = function () {
    var ids = this.activeFailures.map(function (f) { return f.id; });
    for (var i = 0; i < ids.length; i++) this.clearFailure(ids[i]);
    return null;
  };

  ControlLayer.prototype._findFailure = function (id) {
    for (var i = 0; i < this.activeFailures.length; i++) if (this.activeFailures[i].id === id) return this.activeFailures[i];
    return null;
  };
  ControlLayer.prototype._severityOf = function (id) {
    var f = this._findFailure(id); return f ? f.severity : null;
  };

  // ============================================================== evaluate (§9)
  ControlLayer.prototype.evaluate = function (instruments) {
    this.lastInstruments = instruments || this.engine.getInstruments();
    this._evalTrips(this.lastInstruments);
    this._evalActuations(this.lastInstruments);
    this._evalInterlocks(this.lastInstruments);
    this._evalAlarms(this.lastInstruments);
    return this.getSnapshotSections();
  };

  // Responsibility 1 — trips (§3). Any firing scrams; reads instruments (HR1)
  // except the documented __true_flow__ exception. Extensions (M4b trip blocks):
  //   condition  — the trip evaluates only while the condition holds (e.g. the
  //                SR high-flux trip only while the detector is energized);
  //   blockable  — the trip can be manually blocked (set_trip_block) while the
  //                config's trip_block_permissive is satisfied (P-10); blocks
  //                AUTO-CLEAR (reinstate) when the permissive drops.
  ControlLayer.prototype._evalTrips = function (ins) {
    var trips = this.config.trips || [];
    this._autoReinstateTripBlocks(ins);
    for (var i = 0; i < trips.length; i++) {
      var t = trips[i];
      if (t.condition && !this._evaluateCondition(t.condition)) continue;
      if (t.blockable && t.id && this.tripBlocks[t.id]) continue;
      var value = (t.instrument === '__true_flow__')
        ? this.engine.getTrueState().pump_flow_pct / 100   // HR1 exception: no flow instrument
        : ins[t.instrument];
      if (crossed(value, t.direction, t.setpoint) && !this.rps.scrammed) {
        this.rps.scrammed = true;
        this.rps.last_trip_reason = t.instrument + ' ' + t.direction;
        this._sendInternal({ action: 'scram' });          // descends through interception (ATWS-aware)
      }
    }
  };

  // The permissive gating a trip's block: its own `block_permissive` when it carries
  // one (e.g. the P-11 pressure bypass / P-7 low-power bypass for the cold/shutdown
  // regime), else the plant-wide `trip_block_permissive` (P-10 at-power).
  ControlLayer.prototype._tripPermissive = function (t) {
    return (t && t.block_permissive) ? t.block_permissive : this.config.trip_block_permissive;
  };
  ControlLayer.prototype._permTest = function (perm, ins) {
    if (!perm) return true;
    return crossed(ins[perm.instrument], perm.direction, perm.setpoint);
  };
  ControlLayer.prototype._permissiveSatisfied = function (ins) {   // the plant-wide permissive (P-10)
    return this._permTest(this.config.trip_block_permissive, ins);
  };

  // Westinghouse auto-reinstate: a trip block clears itself the moment ITS permissive
  // is no longer satisfied — the startup net re-arms below P-10 on the way down, and
  // the cold-regime P-11/P-7 bypasses re-arm above their permissive on the way up.
  ControlLayer.prototype._autoReinstateTripBlocks = function (ins) {
    if (!this._anyTripBlocks()) return;
    var tps = this.config.trips || [];
    for (var i = 0; i < tps.length; i++) {
      var t = tps[i];
      if (t.id && this.tripBlocks[t.id] && !this._permTest(this._tripPermissive(t), ins)) delete this.tripBlocks[t.id];
    }
  };
  ControlLayer.prototype._anyTripBlocks = function () {
    for (var k in this.tripBlocks) return true;
    return false;
  };

  ControlLayer.prototype.setTripBlock = function (tripId, blocked) {
    var trips = this.config.trips || [], t = null;
    for (var i = 0; i < trips.length; i++) if (trips[i].id === tripId && trips[i].blockable) { t = trips[i]; break; }
    if (!t) return { type: 'error', code: 'COMMAND_ERROR', message: 'unknown or unblockable trip', received: tripId };
    if (blocked) {
      if (!this._permTest(this._tripPermissive(t), this.lastInstruments)) {
        return { type: 'blocked', code: 'INTERLOCK',
                 message: this.register === 'industry'
                   ? 'TRIP BLOCK REFUSED: block permissive not satisfied.'
                   : 'Trip block refused — the plant is outside this trip’s block permissive (e.g. P-10 at-power, or P-11/P-7 for the low-pressure/low-flow trips).' };
      }
      this.tripBlocks[tripId] = true;
    } else {
      delete this.tripBlocks[tripId];
    }
    return null;
  };

  // Responsibility 2 — engineered-safety actuation (§4). Each issues a command
  // through handleCommand, so a command-override failure intercepts it too.
  // Actuations carrying an `arm` tag evaluate only while that ESF system is in
  // AUTO (M4b ESF arms) — a disarmed system neither fires nor resets.
  ControlLayer.prototype._evalActuations = function (ins) {
    var acts = this.config.actuations || [];
    for (var i = 0; i < acts.length; i++) {
      var act = acts[i];
      if (act.arm && this.esfAuto[act.arm] === false) continue;
      var value = ins[act.instrument];
      var gateOk = !act.condition || this._evaluateCondition(act.condition, ins);
      if (gateOk && crossed(value, act.direction, act.setpoint) && !this.actuationFired[i]) {
        this.actuationFired[i] = true;
        this._sendInternal(this._actuationCommand(act, false));
      }
      // Reset when the value returns to the SAFE side of reset_below: below it
      // for a high-direction actuation, above it for a low one. (Was inverted —
      // `value > reset_below` made the PORV actuation fire-and-reset in the same
      // pass, flapping open/close every evaluate while pressure stayed high.)
      if (act.reset_below !== undefined && this.actuationFired[i] && value != null) {
        var safe = act.direction === 'high' ? value < act.reset_below : value > act.reset_below;
        if (safe) {
          this.actuationFired[i] = false;
          if (act.reset_action) this._sendInternal(this._actuationCommand(act, true));
        }
      }
    }
  };

  // Responsibility 2b — interlocks (M4 §4b). Condition-latched (with hysteresis)
  // blocks on operator commands, from config data: engage when the INSTRUMENT
  // (HR1) crosses the setpoint, clear when it returns past clears_below/above.
  // `withdrawal_only` blocks only outward rod motion — insertion always works.
  ControlLayer.prototype._evalInterlocks = function (ins) {
    var ils = this.config.interlocks || [];
    for (var i = 0; i < ils.length; i++) {
      var il = ils[i], v = ins[il.instrument];
      if (v == null) continue;
      if (!this.interlockActive[i]) {
        if (crossed(v, il.direction, il.setpoint)) {
          this.interlockActive[i] = true;
          if (il.on_engage) this._sendInternal(il.on_engage);   // e.g. stop rods already in motion
        }
      } else {
        var cleared = il.direction === 'high'
          ? v < (il.clears_below != null ? il.clears_below : il.setpoint)
          : v > (il.clears_above != null ? il.clears_above : il.setpoint);
        if (cleared) this.interlockActive[i] = false;
      }
    }
  };

  ControlLayer.prototype._interlockBlocking = function (cmd) {
    var ils = this.config.interlocks || [];
    for (var i = 0; i < ils.length; i++) {
      if (!this.interlockActive[i]) continue;
      var il = ils[i];
      if (!il.blocks || il.blocks.indexOf(cmd.action) === -1) continue;
      if (il.withdrawal_only) {
        if (cmd.action === 'rod_start' && !(cmd.direction > 0)) continue;
        if (cmd.action === 'rod_nudge' && !(cmd.steps > 0)) continue;
      }
      // Parameter predicate (M4b trip blocks): block only a specific form of the command
      // (e.g. only set_sr_detector {on:false} — de-energizing — is P-6 gated).
      if (il.blocks_when && cmd[il.blocks_when.field] !== il.blocks_when.equals) continue;
      return il;
    }
    return null;
  };

  ControlLayer.prototype._actuationCommand = function (act, isReset) {
    var cmd = { action: isReset ? act.reset_action : act.action };
    if (isReset) { if (act.reset_active !== undefined) cmd.active = act.reset_active; }
    else {
      if (act.active !== undefined) cmd.active = act.active;
      if (act.params) for (var k in act.params) cmd[k] = act.params[k];   // general parameter carry (M4b trip blocks)
    }
    return cmd;
  };

  // Condition gates read INSTRUMENTS only (HR1) — a `*_unavailable` condition
  // may derive from its `*_running` status instrument. There is NO true-state
  // fallback: every condition a plant module references must be exposed as a
  // status instrument (the M7 config-consistency suite asserts this), and an
  // unresolvable condition evaluates NOT-met rather than silently arming.
  ControlLayer.prototype._evaluateCondition = function (cond, ins) {
    // Callers that hold the current instrument map pass it explicitly (the setpoint
    // crossing on the same line reads the same map). Without it we fall back to the
    // last evaluated cycle — but at plant init lastInstruments is still empty ({}),
    // so _initialEsfArms MUST pass `ins` or a conditioned actuation's gate is dead.
    ins = ins || this.lastInstruments;
    if (cond in ins) return !!ins[cond];
    if (/_unavailable$/.test(cond)) {
      var base = cond.replace(/_unavailable$/, '_running');
      if (base in ins) return !ins[base];
    }
    return false;
  };

  // Responsibility 3 — alarms (§5). Reads instruments; advances each lifecycle.
  ControlLayer.prototype._alarmRaw = function (alarm, ins) {
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

  ControlLayer.prototype._evalAlarms = function (ins) {
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

  ControlLayer.prototype.acknowledgeAlarm = function (alarmId) {
    if (this.alarmStates[alarmId] === 'active_unacknowledged') this.alarmStates[alarmId] = 'active_acknowledged';
    return null;
  };
  ControlLayer.prototype.acknowledgeAllAlarms = function () {
    for (var id in this.alarmStates) if (this.alarmStates[id] === 'active_unacknowledged') this.alarmStates[id] = 'active_acknowledged';
    return null;
  };

  // ------------------------------------------------------- snapshot sections (§9.5)
  ControlLayer.prototype.getAlarms = function () {
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

  ControlLayer.prototype.getActiveFailures = function () {
    return this.activeFailures.map(function (f) { return { id: f.id, severity: f.severity }; });
  };

  ControlLayer.prototype.getRpsState = function () {
    return { scrammed: this.rps.scrammed, last_trip_reason: this.rps.last_trip_reason,
             trip_blocks: Object.assign({}, this.tripBlocks) };
  };

  ControlLayer.prototype.getSnapshotSections = function () {
    return {
      rps_state: this.getRpsState(),
      alarms: this.getAlarms(),
      active_failures: this.getActiveFailures(),
    };
  };

  // Failure catalog for the UI Failures tab (§10): rebuilt per plant change.
  ControlLayer.prototype.getFailureCatalog = function () {
    var failures = this.config.failures || {}, out = [];
    for (var id in failures) {
      var def = failures[id];
      var entry = { id: id, display: def.display, category: def.category || 'safety_system' };
      if (def.severity_meta) entry.severity_meta = def.severity_meta;
      out.push(entry);
    }
    return out;
  };

  // ============================================================ automation (M4b automation)
  // The operator-automation channel runtime (formerly layers/auto_control.js, a
  // UI-side synthetic operator stepped per broadcast). It runs INSIDE the
  // control layer at a fixed sim-time cadence, so controllers behave identically
  // at any time acceleration, and their state travels with the plant through
  // save/restore and rewind. Channel definitions are per-plant DATA
  // (config.channels — HR3); every controller reads INSTRUMENTS (HR1); every
  // output descends through this.handleCommand, so failure interception and
  // interlocks apply to automation exactly as to the operator (HR5) — a stuck
  // sensor fools the automation just like it fools a human, which is the
  // educational point.
  //
  // Channel kinds:
  //   mode — passthrough toggle for automation the ENGINE carries (heater/spray
  //          auto, CVCS make-up, steam-dump auto, load-follow). Engage/disengage
  //          send the mode commands once; displayed state derives from
  //          control_state, so the toggle follows the plant's truth.
  //   pid  — PI controller on an instrument reading driving a setpoint command
  //          (feedforward, bumpless transfer, anti-windup, deadband, min action
  //          period + min output delta for a sparse command stream).
  //   rods — discrete rod control: damped error → a bounded rod_nudge.
  //   bang — boron trim (PWR): bang-bang with hysteresis on control-rod position.
  //
  // Channel-def callbacks (pv/ff/trim/isOn/engage/disengage/defaultOn/standby/
  // init/sp.capture) receive a snapshot-shaped ctx assembled from the engine —
  // { instruments, control_state, true_state, rps_state, metadata } — so the
  // defs read the same vocabulary the UI does.
  var AUTO_DT = 0.1;   // sim-s between channel evaluations (the 1× broadcast rate of the old UI-side layer)

  ControlLayer.prototype._ctx = function () {
    return {
      instruments: this.engine.getInstruments(),
      control_state: this.engine.getControlState(),
      true_state: this.engine.getTrueState(),
      rps_state: { scrammed: this.rps.scrammed },
      metadata: { sim_time: this._autoT },
    };
  };

  ControlLayer.prototype._sendInternal = function (cmd) {
    var was = this._internal;
    this._internal = true;
    try { return this.handleCommand(cmd); }
    finally { this._internal = was; }
  };

  // Engaged truth for display/master logic: mode channels read the plant.
  ControlLayer.prototype._isEngaged = function (c, ctx) {
    if (c.def.kind === 'mode') return ctx && ctx.control_state ? !!c.def.isOn(ctx.control_state) : c.engaged;
    return c.engaged;
  };

  // ESF AUTO/MAN (M4b ESF arms): systems as data — { id, label, commands:[actions] }.
  // Operator action on a listed command → that system to MANUAL; set_esf_auto
  // re-arms it (clearing its actuation latches so a STANDING condition
  // re-fires — the point of re-arming).
  ControlLayer.prototype._esfManualScan = function (cmd) {
    var esf = this.config.esf_systems || [];
    for (var i = 0; i < esf.length; i++) {
      if (esf[i].commands && esf[i].commands.indexOf(cmd.action) !== -1) this.esfAuto[esf[i].id] = false;
    }
  };

  ControlLayer.prototype.setEsfAuto = function (system, auto) {
    if (!(system in this.esfAuto)) return { type: 'error', code: 'COMMAND_ERROR', message: 'unknown esf system', received: system };
    this.esfAuto[system] = !!auto;
    if (auto) {
      // Re-arm: clear this system's fired latches so its actuations re-evaluate.
      var acts = this.config.actuations || [];
      for (var i = 0; i < acts.length; i++) if (acts[i].arm === system) this.actuationFired[i] = false;
    }
    return null;
  };

  ControlLayer.prototype._manualOverrideScan = function (cmd) {
    for (var i = 0; i < this.channels.length; i++) {
      var c = this.channels[i], def = c.def;
      if (!c.engaged || !def.manual_overrides) continue;
      if (def.manual_overrides.indexOf(cmd.action) === -1) continue;
      // Rod commands only override the channel driving that rod group.
      if ((cmd.action === 'rod_nudge' || cmd.action === 'rod_start' || cmd.action === 'rod_stop') &&
          def.group_id && cmd.group_id && cmd.group_id !== def.group_id) continue;
      this._toggleChannel(c, false);
      c.note = 'off — manual control taken';
    }
  };

  ControlLayer.prototype.setAutoChannel = function (id, engaged) {
    if (id === 'all') {
      var ctx = this._ctx();
      for (var i = 0; i < this.channels.length; i++) {
        var c = this.channels[i];
        if (this._isEngaged(c, ctx) !== !!engaged) this._toggleChannel(c, !!engaged, ctx);
      }
      return null;
    }
    var ch = this.byId[id];
    if (!ch) return { type: 'error', code: 'COMMAND_ERROR', message: 'unknown channel_id', received: id };
    this._toggleChannel(ch, !!engaged);
    return null;
  };

  ControlLayer.prototype.setAutoSetpoint = function (id, value) {
    var c = this.byId[id];
    if (!c || !c.def.sp || value == null || !isFinite(value)) return null;
    c.sp = clip(value, c.def.sp.min, c.def.sp.max);
    return null;
  };

  ControlLayer.prototype._toggleChannel = function (c, on, ctx) {
    ctx = ctx || this._ctx();
    var def = c.def, i;
    if (def.kind === 'mode') {
      var cmds = on ? def.engage(ctx) : def.disengage(ctx);
      for (i = 0; i < cmds.length; i++) this._sendInternal(cmds[i]);
      c.engaged = !!on;
      return;
    }
    c.engaged = !!on;
    c.note = '';
    if (on) {
      // Setpoint captures the CURRENT reading (hold the plant where the
      // operator had it); integrator preload = bumpless transfer.
      if (def.sp) { var cap = def.sp.capture(ctx); c.sp = cap != null && isFinite(cap) ? clip(cap, def.sp.min, def.sp.max) : def.sp.min; }
      c.spEff = c.sp;
      c.I = def.init ? (def.init(ctx) || 0) : 0;
      c.lastAct = null; c.lastSent = null; c.bangMode = 'idle'; c.concMode = 'hold';
      c.pvF = null; c.rate = null;
    } else {
      // Leave the plant exactly where automation had it — plus safe stand-down.
      if (def.kind === 'rods') this._sendInternal({ action: 'rod_stop', group_id: def.group_id });
      if (def.kind === 'bang') { this._sendInternal({ action: 'set_boron_adjust', rate: 0 }); c.bangMode = 'idle'; }
      if (def.kind === 'conc') { this._sendInternal({ action: 'set_boron_adjust', rate: 0 }); c.concMode = 'hold'; }
      c.pvNow = null;
    }
  };

  // Default lineup for a freshly selected plant (free play / reset — NOT
  // instructed content, which starts from a clean board and applies its own
  // auto_channels preset): engage every channel whose defaultOn(ctx) says the
  // plant normally runs it automatic in this state. M5 calls this.
  ControlLayer.prototype.engageDefaults = function () {
    if (!this.channels.length) return;
    var ctx = this._ctx();
    for (var i = 0; i < this.channels.length; i++) {
      var c = this.channels[i];
      if (c.def.defaultOn && !c.engaged && c.def.defaultOn(ctx)) this._toggleChannel(c, true, ctx);
    }
  };

  // Called by M5 once per PHYSICS STEP (before engine.step). Channels evaluate
  // on a fixed sim-time cadence (AUTO_DT) using the previous step's readings —
  // standard explicit coupling; cheap early-return between evaluations.
  ControlLayer.prototype.stepAutomation = function (dt) {
    this._autoT += dt;
    if (!this.channels.length) return;
    this._autoAcc += dt;
    if (this._autoAcc < AUTO_DT) return;
    var step = this._autoAcc;
    this._autoAcc = 0;
    var ctx = this._ctx();
    var t = this._autoT;
    // No core-damage instrument exists, so the "core destroyed" stand-down reads
    // true_state.melted (a known HR1 exception; a damage instrument is post-ship).
    var dead = !!(ctx.true_state && ctx.true_state.melted);
    // A protection trip OR a manual scram both latch rps now (C4), so the latch is
    // the single source of truth for scram — no true_state.scrammed fallback needed.
    var scrammed = this.rps.scrammed;
    for (var i = 0; i < this.channels.length; i++) {
      var c = this.channels[i], def = c.def;
      if (def.kind === 'mode') continue;                    // the engine runs these
      if (!c.engaged) continue;
      if (dead || (scrammed && def.offOnScram)) {           // stand down, visibly
        this._toggleChannel(c, false, ctx);
        c.note = dead ? 'off — core destroyed' : 'off — reactor scrammed';
        continue;
      }
      if (def.requires && !(this.byId[def.requires] && this.byId[def.requires].engaged)) {
        var req = this.byId[def.requires];
        c.note = 'idle — needs ' + (req ? req.def.label : def.requires);   // guard a mis-referenced channel id
        continue;
      }
      this._trackChannel(c, ctx, step);
      if (def.kind === 'pid') this._stepPid(c, ctx, t, step);
      else if (def.kind === 'rods') this._stepRods(c, ctx, t, step);
      else if (def.kind === 'bang') this._stepBang(c, ctx, t);
      else if (def.kind === 'conc') this._stepConc(c, ctx, t);
    }
  };

  // Shared per-evaluation tracking for pid/rods: slew the working setpoint
  // toward the user's, low-pass the PV against instrument noise, and keep a
  // damped PV rate for derivative (anticipation) action.
  ControlLayer.prototype._trackChannel = function (c, ctx, dt) {
    var def = c.def;
    if (def.sp && c.sp != null) {
      if (c.spEff == null) c.spEff = c.sp;
      if (def.spSlew && dt > 0) {
        var d = c.sp - c.spEff;
        c.spEff += clip(d, -def.spSlew * dt, def.spSlew * dt);
      } else c.spEff = c.sp;
    }
    if (def.pv) {
      var pv = def.pv(ctx);
      if (pv == null || !isFinite(pv)) return;
      c.pvNow = pv;
      // Time-based low-pass (pvTau seconds of sim time): filters instrument
      // noise without going stale under acceleration.
      var a = def.pvTau ? dt / (def.pvTau + dt) : 1.0;
      var prev = c.pvF;
      c.pvF = (prev == null || a >= 1) ? pv : prev + a * (pv - prev);
      if (dt > 0 && prev != null) {
        // Time-based low-pass on the derivative too (~2 s): the raw
        // difference quotient scales its noise with 1/dt, so a per-sample
        // smoothing factor would make the damping term cadence-dependent
        // (probed: at 0.1 s evaluation the kd term drowned the rod error).
        var r = (c.pvF - prev) / dt;
        var ar = dt / (2.0 + dt);
        c.rate = c.rate == null ? r : c.rate + ar * (r - c.rate);
      }
    }
  };

  ControlLayer.prototype._stepPid = function (c, ctx, t, dt) {
    var def = c.def;
    if (c.pvF == null) return;
    var pv = c.pvF;
    var ff = def.ff ? def.ff(ctx) : 0;
    var trim = def.trim ? def.trim(ctx) : 0;   // e.g. three-element feed: steam−feed mismatch
    if (c.I == null) c.I = def.init ? (def.init(ctx) || 0) : 0;   // post-restore re-init
    var e = (c.spEff != null ? c.spEff : c.sp) - pv;
    // Integrate in sim time, but never more than a few design periods per
    // evaluation — a giant sample must not carry a giant integral kick.
    // Anti-windup is CONDITIONAL integration (skip the increment when it would
    // push the output further past a bound) — hard-clamping I to the bound
    // instead RATCHETS it: at an output floor with the level high (e < 0) the
    // clamp forces I = uMin − kp·e > 0, and instrument-noise excursions then
    // trickle positive output forever (probed: the default-engaged feed channel
    // slowly overfilled a zero-steam-draw SG at hot zero power).
    if (Math.abs(e) > def.db) {   // freeze in the deadband (no creep)
      var di = (def.ki || 0) * e * Math.min(dt, 3 * def.period);
      var uTest = ff + trim + def.kp * e + c.I + di;
      if (!(uTest > def.uMax && di > 0) && !(uTest < def.uMin && di < 0)) c.I += di;
    }
    var u = clip(ff + trim + def.kp * e + c.I, def.uMin, def.uMax);
    c.outNow = u;
    if (c.lastSent != null && Math.abs(e) <= def.db) { c.note = 'holding'; return; }
    if (c.lastAct != null && t - c.lastAct < def.period) return;
    if (c.lastSent != null && Math.abs(u - c.lastSent) < (def.minDelta || 0)) return;
    var r = this._sendInternal(def.cmd(u));
    c.note = (r && r.type === 'blocked') ? '⛔ ' + (r.message || 'blocked') : '';
    c.lastSent = u; c.lastAct = t;
  };

  ControlLayer.prototype._stepRods = function (c, ctx, t, dt) {
    var def = c.def;
    if (c.pvF == null) return;
    if (def.standby && def.standby(ctx, this)) { c.note = def.standbyNote || 'standing by'; return; }
    // Damped error: back off while the PV is already moving toward the setpoint
    // (kd seconds of anticipation, plus an optional plant-specific trim term) —
    // the lumped rod group is coarse and the instruments lag, so undamped
    // stepping limit-cycles.
    var e = (c.spEff != null ? c.spEff : c.sp) - c.pvF;
    var eEff = e + (def.trim ? def.trim(ctx) : 0) - (def.kd || 0) * (c.rate || 0);
    if (Math.abs(e) <= def.db) { c.note = 'holding'; return; }
    if (c.lastAct != null && t - c.lastAct < def.period) return;
    var g = rodGroupById(ctx, def.group_id) || rodGroup(ctx, 'control');
    var steps = clip(Math.round(def.gain * eEff), -def.maxStep, def.maxStep);
    if (!steps) return;
    if (steps > 0 !== e > 0) { c.note = 'damping'; return; }   // never step against the raw error
    if (g) {
      if (steps < 0 && g.at_insertion_limit) { c.note = 'at insertion limit'; return; }
      if (steps > 0 && g.steps >= g.max_steps) { c.note = 'rods fully withdrawn'; return; }
      if (steps < 0 && g.steps <= 0) { c.note = 'rods fully inserted'; return; }
    }
    // Variable rod speed: a `speeds` ladder ([{above, speed}], ascending —
    // Westinghouse-style error-proportional drive) when the def carries one,
    // else the two-speed fastAt threshold.
    var speed = 'slow';
    if (def.speeds) {
      for (var si = 0; si < def.speeds.length; si++) {
        if (Math.abs(eEff) >= def.speeds[si].above) speed = def.speeds[si].speed;
      }
    } else if (Math.abs(eEff) >= def.fastAt) speed = 'normal';
    var r = this._sendInternal({ action: 'rod_nudge', group_id: def.group_id, steps: steps, speed: speed });
    c.note = (r && r.type === 'blocked') ? '⛔ ' + (r.message || 'withdrawal blocked') : (steps > 0 ? 'withdrawing' : 'inserting');
    c.lastAct = t;
  };

  // Boron trim: bang-bang with hysteresis on the control bank's position so the
  // rod channel keeps authority. Dilute (−, +ρ) walks the rods back IN from the
  // top of travel; borate (+, −ρ) lets them come back OUT of the deep band.
  ControlLayer.prototype._stepBang = function (c, ctx, t) {
    var def = c.def;
    var g = rodGroup(ctx, 'control');
    if (!g) return;
    var pos = g.position_pct;
    c.pvNow = pos;
    var want = c.bangMode;
    if (c.bangMode === 'idle') {
      if (pos >= def.hi) want = 'dilute';
      else if (pos <= def.lo) want = 'borate';
    } else if (c.bangMode === 'dilute' && pos <= def.hiStop) want = 'idle';
    else if (c.bangMode === 'borate' && pos >= def.loStop) want = 'idle';
    if (want === c.bangMode) {
      // busyNote: optional per-plant status suffix (HR3 — no plant fields here).
      c.note = c.bangMode === 'idle' ? 'in band' : (c.bangMode + '…' +
        (def.busyNote ? def.busyNote(ctx) : ''));
      return;
    }
    var rate = want === 'borate' ? def.rate : want === 'dilute' ? -def.rate : 0;
    var r = this._sendInternal({ action: 'set_boron_adjust', rate: rate });
    if (r && r.type === 'blocked') { c.note = '⛔ ' + (r.message || 'blocked'); return; }
    c.bangMode = want;
    c.lastAct = t;
    c.note = want === 'idle' ? 'in band' : want + '…';
  };

  // Boron CONCENTRATION seek: bang-bang toward a boron_analyzer setpoint (ppm) via
  // set_boron_adjust — borate below the target, dilute above, hold inside the deadband.
  // Reads the boron ANALYZER (HR1), so a failed/lagging analyzer fools it like the
  // operator. Needs the charging pump running (the adjust rate rides charging flow).
  ControlLayer.prototype._stepConc = function (c, ctx, t) {
    var def = c.def;
    var pv = c.pvF != null ? c.pvF : c.pvNow;
    if (pv == null && def.pv) pv = def.pv(ctx);
    if (pv == null || !isFinite(pv)) return;
    c.pvNow = pv;
    var sp = c.spEff != null ? c.spEff : c.sp;
    if (sp == null) return;
    var pumpOff = ctx.control_state && ctx.control_state.charging_pump_running === false;
    if (pumpOff) {
      if (c.concMode !== 'hold') { this._sendInternal({ action: 'set_boron_adjust', rate: 0 }); c.concMode = 'hold'; }
      c.note = 'idle — charging pump OFF';
      return;
    }
    var e = sp - pv;   // +e → concentration too low → borate
    var want = Math.abs(e) <= (def.db || 0) ? 'hold' : (e > 0 ? 'borate' : 'dilute');
    if (want === c.concMode) { c.note = want === 'hold' ? 'in band' : want + '…'; return; }
    if (c.lastAct != null && def.period && t - c.lastAct < def.period) return;
    var rate = want === 'borate' ? def.rate : want === 'dilute' ? -def.rate : 0;
    var r = this._sendInternal({ action: 'set_boron_adjust', rate: rate });
    if (r && r.type === 'blocked') { c.note = '⛔ ' + (r.message || 'blocked'); return; }
    c.concMode = want; c.lastAct = t;
    c.note = want === 'hold' ? 'in band' : want + '…';
  };

  // The snapshot's automation section (M5 assembles it every cycle): channel
  // identity + live state, enough for the Automate tab to be a pure face.
  ControlLayer.prototype.getAutomationState = function () {
    if (!this.channels.length) return { channels: [] };
    var ctx = this._ctx();
    var out = [];
    for (var i = 0; i < this.channels.length; i++) {
      var c = this.channels[i], def = c.def;
      var pv = c.pvNow != null ? c.pvNow : (def.pv ? def.pv(ctx) : null);
      if (pv != null && !isFinite(pv)) pv = null;
      var entry = {
        id: def.id, group: def.group, label: def.label, hint: def.hint || '', kind: def.kind,
        engaged: this._isEngaged(c, ctx),
        setpoint: c.sp,
        pv: pv,
        note: c.note || '',
        standby: !!(c.engaged && def.standby && def.standby(ctx, this)),
      };
      if (def.sp) {
        entry.setpoint_meta = { min: def.sp.min, max: def.sp.max, unit: def.sp.unit || '',
                                dp: def.sp.dp != null ? def.sp.dp : 0, step: def.sp.step || 1,
                                dim: def.sp.dim || null };
      }
      out.push(entry);
    }
    var result = { channels: out };
    if ((this.config.esf_systems || []).length) {
      result.esf = {};
      for (var ei = 0; ei < this.config.esf_systems.length; ei++) {
        var sys = this.config.esf_systems[ei];
        result.esf[sys.id] = this.esfAuto[sys.id] ? 'auto' : 'manual';
      }
    }
    return result;
  };

  ControlLayer.prototype._saveAutomation = function () {
    var ch = {};
    for (var i = 0; i < this.channels.length; i++) {
      var c = this.channels[i];
      ch[c.def.id] = { engaged: c.engaged, sp: c.sp, spEff: c.spEff, I: c.I, lastAct: c.lastAct,
                       lastSent: c.lastSent, note: c.note, bangMode: c.bangMode, pvF: c.pvF, rate: c.rate };
    }
    return { t: this._autoT, acc: this._autoAcc, channels: ch, esf: Object.assign({}, this.esfAuto),
             trip_blocks: Object.assign({}, this.tripBlocks) };
  };

  ControlLayer.prototype._loadAutomation = function (au) {
    this._autoT = au && au.t != null ? au.t : 0;
    this._autoAcc = au && au.acc != null ? au.acc : 0;
    for (var i = 0; i < this.channels.length; i++) {
      var c = this.channels[i];
      var sv = au && au.channels ? au.channels[c.def.id] : null;   // keyed by id — order-insensitive
      if (sv) {
        c.engaged = !!sv.engaged; c.sp = sv.sp != null ? sv.sp : null;
        c.spEff = sv.spEff != null ? sv.spEff : c.sp;
        c.I = sv.I != null ? sv.I : 0;
        c.lastAct = sv.lastAct != null ? sv.lastAct : null;
        c.lastSent = sv.lastSent != null ? sv.lastSent : null;
        c.note = sv.note || ''; c.bangMode = sv.bangMode || 'idle';
        c.pvF = sv.pvF != null ? sv.pvF : null; c.rate = sv.rate != null ? sv.rate : null;
      } else {
        c.engaged = false; c.sp = null; c.spEff = null; c.I = 0; c.lastAct = null;
        c.lastSent = null; c.note = ''; c.bangMode = 'idle'; c.pvF = null; c.rate = null;
      }
      c.pvNow = null;
    }
    for (var id in this.esfAuto) {
      this.esfAuto[id] = (au && au.esf && id in au.esf) ? !!au.esf[id] : true;   // absent = armed (the safe default)
    }
    // Absent in an old save → re-derive the at-power lineup from the restored
    // instruments (a pre-NIS save at full power must not insta-trip on load).
    this.tripBlocks = (au && au.trip_blocks) ? Object.assign({}, au.trip_blocks) : this._initialTripBlocks();
  };

  // -------------------------------------------------------------- save / restore
  // Serializes this layer's runtime state only (the kernel holds no plant config
  // of its own; the engine restores its own failure effects). M5 coordinates both
  // (§10). The latch arrays are hardened against config-shape drift: a save made
  // against an older actuation/interlock list restores to default-false latches
  // (re-derivable from instrument state; worst case a one-shot actuation
  // re-fires) rather than misaligning by index.
  ControlLayer.prototype.saveState = function () {
    return {
      register: this.register,
      rps: { scrammed: this.rps.scrammed, last_trip_reason: this.rps.last_trip_reason },
      activeFailures: this.activeFailures.map(function (f) { return { id: f.id, severity: f.severity }; }),
      alarmStates: Object.assign({}, this.alarmStates),
      actuationFired: this.actuationFired.slice(),
      interlockActive: this.interlockActive.slice(),
      automation: this._saveAutomation(),
    };
  };
  ControlLayer.prototype.loadState = function (st) {
    this.register = st.register;
    this.rps = { scrammed: st.rps.scrammed, last_trip_reason: st.rps.last_trip_reason };
    this.activeFailures = [];
    for (var i = 0; i < st.activeFailures.length; i++) {
      var f = st.activeFailures[i], def = this.config.failures[f.id];
      if (def) this.activeFailures.push({ id: f.id, def: def, severity: f.severity });
    }
    this.alarmStates = Object.assign({}, st.alarmStates);
    var nActs = (this.config.actuations || []).length;
    var nIls = (this.config.interlocks || []).length;
    this.actuationFired = (st.actuationFired && st.actuationFired.length === nActs)
      ? st.actuationFired.slice()
      : (this.config.actuations || []).map(function () { return false; });
    this.interlockActive = (st.interlockActive && st.interlockActive.length === nIls)
      ? st.interlockActive.slice()
      : (this.config.interlocks || []).map(function () { return false; });
    this._loadAutomation(st.automation);   // absent in old saves → all channels MAN
  };

  RD.ControlLayer = ControlLayer;
  RD.ControlFailureLayer = ControlLayer;   // compatibility alias (pre-split name)

})(globalThis.RD || (globalThis.RD = {}));
