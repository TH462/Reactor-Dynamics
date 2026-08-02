/*
 * control_kernel.js — the Control Layer kernel (M4's general machinery).
 *
 * General machinery that sits directly above the physics engine: the plant's
 * automation (reactor protection trips, engineered-safety actuation, alarms) and
 * the scenario's failures (injection + command interception). It contains NO
 * plant-specific literals — every setpoint, threshold, and failure definition is
 * DATA it consumes from the per-plant control module (layers/control/<plant>_control.js,
 * reached through the engine's protection config; HR3). Its rules read INSTRUMENT
 * readings, never true state (HR1) — with no exception since 2026-07-29, when the
 * low-flow trip's `__true_flow__` sentinel was retired against a real flow channel
 * (#247, which also closed the HR3 leak #228: the sentinel named a PWR-only field).
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
    // Boolean signal (a status passthrough, e.g. turbine_tripped) — `setpoint` is
    // unused. Already the alarm convention; trips gained it with the P-9 reactor
    // trip on turbine trip, which is keyed on a state, not a threshold.
    if (direction === 'is_true') return !!value;
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
    // Operator actions a scenario has withheld (#125). The layer is rebuilt on every
    // selectPlant, so this empty default IS the reset — leaving a scenario cannot
    // strand a lockout on a free-play board.
    this.actionLocks = {};
    var chDefs = this.config.channels || [];
    for (var ci = 0; ci < chDefs.length; ci++) {
      // `standDown` records WHY a disengaged channel is off ('condition' | 'scram' |
      // 'manual' | null), so a stand-down note can be retired when the thing that
      // caused it clears. Without it the note is write-once — see stepAutomation.
      var ch = { def: chDefs[ci], engaged: false, sp: null, spEff: null, I: 0, lastAct: null,
                 lastSent: null, note: '', standDown: null, sat: null, bangMode: 'idle', pvF: null, pvNow: null, rate: null,
                 concMode: 'hold', concBasis: null, concLastSp: null, concSampleSeq: null };
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
    // Manually-engaged trip blocks (a subset of tripBlocks). These survive
    // auto-reinstate — the automatic permissive blocks still reinstate, but a block
    // the operator set proactively persists until they clear it.
    this.manualTripBlocks = {};
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
    // Which of the currently-active alarms were acknowledged BY THE PLANT rather
    // than by the operator (#240) — see _evalAlarms. Cleared when the alarm clears.
    this.alarmAutoAcked = {};
    // For each low alarm, find a less-extreme low sibling on the same instrument;
    // an alarm with one is an escalation (lo_lo) and fires only with its lo active.
    this._loSibling = {};
    for (var a = 0; a < alarms.length; a++) {
      var A = alarms[a];
      if (A.direction !== 'low') continue;
      // A CONDITIONED alarm is never an escalation of a bare one (#273). Pairing is
      // "same instrument, less-extreme sibling", which reads a lineup-gated annunciator
      // deep on the scale as a lo_lo and would silently make it require its sibling's
      // condition too. Today that would be a no-op — the accumulator cue sits at
      // 6.895 MPa, far below the 12.41 MPa lo_lo — and a no-op coupling is exactly the
      // kind that rots unnoticed when a setpoint later moves.
      if (A.condition) continue;
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
      // Scenario-settable lockout of an OPERATOR ACTION (#125). Authored content sets it
      // in setup_commands; it is not an operator control and has no board button.
      //
      // The action is DATA (`action_id`), never a name in this file. The first cut wrote
      // `case 'open_porv_manual'` here and run_hr3 immediately failed it — a PWR command
      // name in the shared kernel is exactly the HR3 leak that guard exists for. Making it
      // generic is also just better: the repo had NO way for a scenario to withhold a
      // control, and now every plant has one.
      case 'set_action_lock': {
        var lockAct = command.action_id;
        if (!lockAct) {
          return { type: 'error', code: 'COMMAND_ERROR',
                   message: 'set_action_lock needs action_id', received: command };
        }
        if (command.locked === false) delete this.actionLocks[lockAct];
        else this.actionLocks[lockAct] = command.message || true;
        return null;
      }
      case 'reset_rps':
        if (!this._resettingRps) return this.resetRps();
        break;   // in-flight engine forward: fall through to interception + engine
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
    // A locked action is REFUSED, not silently dropped — a dead-looking control is the
    // failure mode this repo keeps finding. Operator commands only: the plant's own
    // actuations descend _internal and must never be lockable, or "withhold this control
    // from the student" would quietly mean "disable this protection".
    if (!this._internal && command && command.action && this.actionLocks[command.action]) {
      var lk = this.actionLocks[command.action];
      return { type: 'refused', code: 'ACTION_LOCKED',
               message: typeof lk === 'string' ? lk : 'That control is locked out for this exercise.' };
    }
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

  // Responsibility 1 — trips (§3). Any firing scrams; reads instruments (HR1),
  // with no exception. Extensions (M4b trip blocks):
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
      var value = ins[t.instrument];
      if (crossed(value, t.direction, t.setpoint) && !this.rps.scrammed) {
        this.rps.scrammed = true;
        this.rps.last_trip_reason = t.instrument + ' ' + t.direction;
        this._sendInternal({ action: 'scram' });          // descends through interception (ATWS-aware)
      }
    }
  };

  // PI-7 scram recovery (C3): reset the reactor-protection latch. Refused while
  // any live (unblocked, condition-satisfied) trip signal still stands — the
  // breakers will not hold in against an asserted trip. The engine half enforces
  // the rods-fully-inserted interlock; success is read back from engine truth so
  // an interception (ATWS-style) cannot leave the RPS state lying.
  // Why an RPS reset would be refused right now, or null if it would be accepted.
  // ONE evaluator, deliberately: it answers both the operator's press (resetRps below)
  // and the board's permissive indication (getRpsState), so the lamp and the button can
  // never disagree about whether a reset is available. Reads INSTRUMENTS only (HR1) and
  // is entirely config-driven (HR3) — the standing-trip scan comes from the plant's own
  // trip table, and everything else from its `rps_reset_permissive` list, so this stays
  // plant-agnostic even though only the PWR defines one today.
  //
  // Returns { reason, message } — `reason` is the machine-readable code, `message` is
  // register-aware operator text.
  ControlLayer.prototype.rpsResetBlock = function (ins) {
    if (!this.rps.scrammed) return null;
    ins = ins || this.lastInstruments || {};

    // A breaker will not hold in against a live trip signal — the most fundamental
    // refusal, so it is checked first. Blocked and condition-gated trips are skipped
    // exactly as they are when the trip is evaluated, or a blocked trip would keep the
    // plant latched on a signal the operator has already been allowed to dismiss.
    var trips = this.config.trips || [];
    for (var i = 0; i < trips.length; i++) {
      var t = trips[i];
      if (t.condition && !this._evaluateCondition(t.condition)) continue;
      if (t.blockable && t.id && this.tripBlocks[t.id]) continue;
      if (crossed(ins[t.instrument], t.direction, t.setpoint)) {
        // Name the CHANNEL, not its id, and never render the raw direction enum: an
        // `is_true` trip has no high/low to speak of, and "turbine_tripped is still
        // is_true" is not a sentence you show an operator.
        var name = (this.config.instrument_labels || {})[t.instrument] || t.instrument;
        // A measured trip reads "the low reactor coolant pressure trip"; a status trip
        // ('is_true') has no high/low and already names itself, so it stays "the turbine
        // trip" rather than gaining a second "trip".
        var meas = (t.direction === 'high' || t.direction === 'low');
        var phrase = meas ? (t.direction + ' ' + name + ' trip') : name;
        return { reason: 'TRIP_SIGNAL_PRESENT',
                 message: (this.register === 'industry'
                   ? 'RPS RESET BLOCKED — ' + phrase + ' still asserted'
                   : 'Cannot reset yet: the ' + phrase + ' is still asserted. It has to ' +
                     'clear before the breakers will hold in.') };
      }
    }

    var perms = this.config.rps_reset_permissive || [];
    for (var j = 0; j < perms.length; j++) {
      var p = perms[j];
      if (crossed(ins[p.instrument], p.direction, p.setpoint)) continue;
      return { reason: p.reason || 'PERMISSIVE_NOT_MET',
               message: (this.register === 'industry' ? p.message_industry : p.message_learning) ||
                        'Blocked by an RPS reset permissive.' };
    }
    return null;
  };

  ControlLayer.prototype.resetRps = function () {
    if (!this.rps.scrammed) return null;
    var block = this.rpsResetBlock(this.engine.instruments.reading || {});
    if (block) {
      // 'blocked' + INTERLOCK, NOT the old orphan `type: 'refused'`. That shape was
      // returned by exactly two lines in this file and read by NOTHING — not the
      // service, not the UI, not a test — so every refusal of an RPS reset was silently
      // swallowed and the operator got no feedback at all (#75, measured). This is the
      // plant protecting itself and handing back a labelled refusal, which is precisely
      // what the interlock contract above already means, so it reuses it and the UI's
      // existing scanner-bar path works with no change. `reason` keeps the specific code.
      return { type: 'blocked', code: 'INTERLOCK', reason: block.reason, message: block.message };
    }
    this._resettingRps = true;
    var engineResp;
    try { engineResp = this._sendInternal({ action: 'reset_rps' }); }
    finally { this._resettingRps = false; }
    // An engine that cannot perform the reset must SAY so. Its response used to be
    // discarded, and RODS_NOT_INSERTED below was then reached by INFERENCE from
    // `scrammed` still being true — so an engine with no handler at all produced a
    // refusal naming a precondition that was in fact satisfied. MEASURED before the fix
    // on RBMK and BWR with every rod at 0.0 %: engine returned COMMAND_ERROR 'unknown
    // action', operator was told "trip breakers reset only with all rods inserted"
    // (#228). Both engines implement it now, so this is a backstop rather than the live
    // path — which is precisely when a silent inference is most dangerous, because
    // nothing routine exercises it.
    if (engineResp && engineResp.type === 'error') return engineResp;
    var truth = this.engine.getTrueState();
    if (!truth.scrammed) {
      this.rps.scrammed = false;
      this.rps.last_trip_reason = null;
      return null;
    }
    // The permissive said yes and the engine still refused. That is not an operator
    // error — the engine's own rods-in interlock is the authority and this is the
    // backstop for an engine whose plant declares no `rps_reset_permissive` to mirror
    // it (RBMK/BWR today), or for an ATWS-style interception of the reset itself.
    return { type: 'blocked', code: 'INTERLOCK', reason: 'RODS_NOT_INSERTED',
             message: (this.register === 'industry'
               ? 'RPS RESET BLOCKED — rods not at bottom'
               : 'The trip breakers only reset with all rods inserted.') };
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
  // Is a trip currently asserted (would fire this instant if unblocked)? Same read
  // path as _evalTrips. Drives the manual block rule: block only while NOT asserted;
  // clearing is locked while asserted.
  ControlLayer.prototype._tripAsserted = function (t, ins) {
    if (t.condition && !this._evaluateCondition(t.condition)) return false;
    return crossed((ins || {})[t.instrument], t.direction, t.setpoint);
  };

  // Westinghouse auto-reinstate: a trip block clears itself the moment ITS permissive
  // is no longer satisfied — the startup net re-arms below P-10 on the way down, and
  // the cold-regime P-11/P-7 bypasses re-arm above their permissive on the way up.
  //
  // OPERATOR-SET BLOCKS REINSTATE TOO, and from 2026-07-24 to 2026-08-02 they did not
  // (audit #295 finding F2). `manualTripBlocks` used to exempt them here, so a block set
  // by hand outlived its permissive through every regime change: measured at full power,
  // re-setting the two auto blocks on the startup net and then scramming left
  // {ir_high, pr_low_setpoint} still blocked at 0.14 % power — a defeated startup net
  // carried into the next ascent, where an untouched plant correctly reinstates to {}.
  // A block is an ENABLE, not a latch: NUREG-1431 B 3.3.1 reinstates the IR and PR-low
  // trips automatically below P-10 regardless of who set them, and M4b §3c has no manual
  // exception. Both shipped procedures already taught the reinstating plant — the startup
  // checklist says "Both blocks auto-reinstate the moment power falls back below P-10"
  // and the cooldown says its block "stands until you clear it or pressure climbs back
  // above P-11 on the next heatup". `manualTripBlocks` survives as PROVENANCE only (who
  // set it, for the save format and the UI); it no longer changes behaviour.
  ControlLayer.prototype._autoReinstateTripBlocks = function (ins) {
    if (!this._anyTripBlocks()) return;
    var tps = this.config.trips || [];
    for (var i = 0; i < tps.length; i++) {
      var t = tps[i];
      if (t.id && this.tripBlocks[t.id] && !this._permTest(this._tripPermissive(t), ins)) {
        delete this.tripBlocks[t.id];
        delete this.manualTripBlocks[t.id];
      }
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
    var ins = this.lastInstruments;
    if (blocked) {
      // Engage rule: THE PERMISSIVE, and nothing else (M4b §3c — "refused … unless
      // `trip_block_permissive` is satisfied against the CURRENT instruments").
      //
      // From 2026-07-24 this also allowed a block proactively any time the trip was not
      // yet asserted, which was meant to let the operator block ahead of an evolution.
      // Audit #295 finding F1 measured what it actually bought: at hot full power,
      // 2235 psi (15.41 MPa), `lo_press`, `si_trip` and `lo_flow` were ALL accepted, so
      // the low-pressure reactor trip, the SI trip and the low-flow trip were defeatable
      // at 100 % power from the operator command path. Measured on a 20 %-of-max cold-leg
      // LOCA: baseline scrams at 4.2 s on `primary_pressure low` at 1782 psi (12.28 MPa);
      // with the three blocked it rode 64 s of unscrammed blowdown and finally scrammed
      // at 68.1 s on `pzr_level high` at 130 psi (0.90 MPa) — the accumulator refill, not
      // a function meant to catch this. The file's own comments claimed the opposite the
      // whole time (`pwr_control.js`: "At power the permissive is not satisfied, so the
      // trip is never blocked — a LOCA/TMI depressurization still trips").
      //
      // The proactive rule bought nothing the procedures need, because both put you INSIDE
      // the permissive first: the startup checklist blocks the net only after crossing P-10
      // ("the plant will not let you block them down there"), and the cooldown lowers the
      // Pressure SP to 1901 psi (13.11 MPa) — below P-11 — as the step "which is what makes
      // the next two steps possible". Real plant: the P-11 bypass is physically enabled only
      // below ~1970 psig (NUREG-1431 LCO 3.3.1/3.3.2 P-11 interlock).
      if (!this._permTest(this._tripPermissive(t), ins)) {
        return { type: 'blocked', code: 'INTERLOCK',
                 message: this.register === 'industry'
                   ? 'TRIP BLOCK REFUSED: block permissive not satisfied.'
                   : 'Trip block refused — the plant is not in the condition that allows this trip to be blocked.' };
      }
      this.tripBlocks[tripId] = true;
      this.manualTripBlocks[tripId] = true;   // provenance: operator-set rather than automatic
    } else {
      // Clearing is always allowed (like a real plant — remove the block and the trip
      // re-arms; it scrams immediately if it was being held off).
      delete this.tripBlocks[tripId];
      delete this.manualTripBlocks[tripId];
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
    // An ARRAY is an AND over its terms, and a leading `!` negates one (#287). Both
    // stay generic — the kernel still names no instrument (HR3); the plant supplies
    // the words, exactly like the `_unavailable` convention below. Added because the
    // RHR-not-in-service annunciator needs two facts at once ("the reactor is
    // tripped" AND "shutdown cooling is NOT aligned"), and a single truthy status
    // could express neither half.
    if (Array.isArray(cond)) {
      for (var ci = 0; ci < cond.length; ci++) if (!this._evaluateCondition(cond[ci], ins)) return false;
      return true;
    }
    if (typeof cond === 'string' && cond.charAt(0) === '!') return !this._evaluateCondition(cond.slice(1), ins);
    // { instrument, in: [...] } — that instrument's reading is one of the listed
    // values. Same shape the reclassify rules already use (#240), so a plant
    // expresses "while in these modes" the one way rather than two.
    if (cond && typeof cond === 'object' && cond.instrument) {
      if (!(cond.instrument in ins)) return false;
      return !!(cond.in && cond.in.indexOf(ins[cond.instrument]) !== -1);
    }
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
      // Optional LINEUP GATE (#273): an alarm may name a boolean indication that must
      // also hold. Same evaluator the trips and actuations use, so it reads INSTRUMENTS
      // (HR1) and the condition is plant DATA, not kernel knowledge (HR3). It can only
      // ever narrow — an unresolvable name evaluates false, so a missing indication
      // silences the alarm rather than firing it on a condition nobody checked.
      if (active && alarm.condition) active = this._evaluateCondition(alarm.condition, ins);
      // lo_lo escalation: fires only once its lo sibling's condition holds.
      var sib = this._loSibling[alarm.id];
      if (active && sib) active = active && this._alarmRaw(sib, ins);
      var st = this.alarmStates[alarm.id];
      if (active) {
        // A `status`-class annunciation reports a LINEUP, not a demand for action,
        // so the plant acknowledges it on the operator's behalf — it arrives lit
        // and steady rather than flashing with an ACK chore attached. Owner ruling
        // 2026-07-28 ("I want status-class alarms to spawn (and arrive)
        // pre-acknowledged"), on NUREG-0700 Rev 4 Table 4.1 Status-Alarm
        // Separation: "separates status annunciators from alarms that require
        // operator action." This is the whole class, not just #240's reclassified
        // tiles — an authored `status` alarm (hpi_active, RCIC RUNNING) has never
        // required action either, and used to demand an ACK anyway.
        //
        // The classification is the EFFECTIVE one, so a mode/lineup rule decides
        // it too. That still cannot suppress or delay anything: the clear→active
        // transition below is decided by the instrument condition alone.
        var isStatus = this._effectivePriority(alarm, ins) === 'status';
        if (st === 'clear') {
          st = isStatus ? 'active_acknowledged' : 'active_unacknowledged';
          if (isStatus) this.alarmAutoAcked[alarm.id] = true;
        } else if (this.alarmAutoAcked[alarm.id] && !isStatus) {
          // ESCALATION. The condition held, but it stopped being the planned state
          // of the plant (the mode moved on; a real trip landed on top of a
          // securing). What the plant acknowledged for the operator it must now
          // hand back — otherwise a genuine critical sits lit and steady, never
          // having flashed, which is the exact failure the ruling exists to avoid.
          // An OPERATOR ack is never undone: only auto-acked ids are tracked here.
          st = 'active_unacknowledged';
          delete this.alarmAutoAcked[alarm.id];
        }
        // active_unacknowledged / active_acknowledged persist while condition holds
      } else {
        st = 'clear';
        delete this.alarmAutoAcked[alarm.id];
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

  // Alarm CONDITION PROCESSING (#240) — an alarm's condition can be true and yet
  // mean something different depending on the plant's mode or the lineup of the
  // equipment it watches. `reclassify` is an ordered rule list on the alarm spec;
  // the FIRST matching rule supplies a replacement priority and (optionally)
  // replacement labels. Rules match on:
  //   instrument + in — that instrument's reading is one of the listed values
  //   condition       — that boolean status instrument reads true
  // Both may be given, in which case both must hold.
  //
  // HR3: the kernel names NO instrument here. Which instrument carries the mode,
  // and which values count as "cold", are the plant's data and live in its control
  // module — the first draft hardcoded `ins.plant_mode` and run_hr3 caught it.
  //
  // Sourced, not recalled (NUREG-0700 Rev 4, ML26022A094 — the NRC's HSI design
  // review guidelines):
  //   §4.1.2-7 Mode-Dependence Processing — "If a component's status or parameter
  //     value represents a fault in some plant modes and not others, it should be
  //     alarmed only in the appropriate modes."
  //   Table 4.1, Nuisance/Plant Mode Relationship + the class description — "the
  //     signal for a low-pressure condition may be eliminated during modes when
  //     this condition is expected, such as startup and cold shutdown, but be
  //     maintained when it is not expected, such as during normal operations."
  //     Our Mode-5 pressurizer alarms are literally that example.
  //   Table 4.1, Nuisance/Status-Alarm Separation — "separates status annunciators
  //     from alarms that require operator action" (RCP TRIP vs RCPs SECURED).
  //   §4.1.2-8 System Configuration Processing — a reading "may not be relevant
  //     when the fluid system is taken out of service" (the secured-RCP case).
  //
  // Deliberately RECLASSIFY, never delete: the guidelines also warn that "only
  // alarms that can be demonstrated to have no operational significance to users
  // should be filtered… Alarms that are considered redundant or lower priority
  // should be suppressed (where users can retrieve them) rather than filtered."
  // That is also what HR1 demands — the condition is real and stays on the board;
  // only its urgency, its wording, and (since the follow-up ruling) whether the
  // tile demands an ACK change. A reclassify rule can therefore never stop, delay
  // or invent an annunciation: _evalAlarms decides clear→active from the
  // instrument condition alone, and consults a rule only to classify what it has
  // already decided to raise.
  //
  // §4.3.6-3 cautions that personnel may misread an alarm if they do not realise a
  // mode-defined change has taken effect, so every reclassified label SAYS why
  // (e.g. "expected — plant is cold").
  ControlLayer.prototype._reclassify = function (a, ins) {
    var rules = a.reclassify;
    if (!rules || !rules.length) return null;
    ins = ins || this.lastInstruments || {};
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      // An unresolvable instrument NEVER matches: a rule can only ever soften an
      // alarm, so a missing reading must fall through to the authored priority
      // rather than silently demote it.
      if (r.instrument && (!(r.instrument in ins) || r.in.indexOf(ins[r.instrument]) === -1)) continue;
      if (r.condition && !this._evaluateCondition(r.condition, ins)) continue;
      return r;
    }
    return null;
  };

  // The priority the operator actually sees: the authored one unless a rule fired.
  ControlLayer.prototype._effectivePriority = function (a, ins) {
    var rc = this._reclassify(a, ins);
    return (rc && rc.priority) || a.priority;
  };

  // ------------------------------------------------------- snapshot sections (§9.5)
  ControlLayer.prototype.getAlarms = function () {
    var alarms = this.config.alarms || [], out = [], reg = this.register;
    for (var i = 0; i < alarms.length; i++) {
      var a = alarms[i];
      // Only an ACTIVE alarm is reclassified — a clear one has no presentation to
      // change, and resolving rules for it would only cost work per snapshot.
      var rc = (this.alarmStates[a.id] !== 'clear') ? this._reclassify(a) : null;
      var lrn = (rc && rc.label_learning) || a.label_learning;
      var ind = (rc && rc.label_industry) || a.label_industry;
      out.push({
        id: a.id,
        state: this.alarmStates[a.id],
        priority: (rc && rc.priority) || a.priority,
        // The authored classification, kept alongside so a consumer can tell that
        // a tile has been reclassified rather than authored this way (and so the
        // UI can say so). Absent when no rule fired.
        base_priority: rc ? a.priority : undefined,
        panel: a.panel,
        // System family, AUTHORED in the plant profile (#157). The UI used to derive
        // this by keyword-matching the alarm id, which made it silently wrong whenever
        // an id did not happen to contain the right word — measured, 13 of the PWR's 33
        // were wrong or arguable, e.g. `charging_high` fell through to 'safety_system'
        // because the word "flow" is in its LABEL (CHG FLOW HI) and the matcher reads ids.
        category: a.category,
        tile_label: reg === 'industry' ? ind : lrn,
      });
    }
    return out;
  };

  ControlLayer.prototype.getActiveFailures = function () {
    return this.activeFailures.map(function (f) { return { id: f.id, severity: f.severity }; });
  };

  ControlLayer.prototype.getRpsState = function () {
    // Per-trip block status for the UI: whether it's asserted now, and whether the
    // operator may block / clear it. Keeps the UI from re-deriving trip physics.
    //
    // The rule the two flags below actually implement — this comment said the OPPOSITE
    // of the code under it until 2026-08-01, and the board's inspection copy was written
    // from the comment (#220's lesson: the guard's own comment was the bug):
    //   block — allowed inside the trip's block permissive, and nowhere else (#295 F1).
    //           `can_block` MUST track `setTripBlock`'s engage rule exactly: the board
    //           greys the button off this flag, so a divergence hands the player a live
    //           button the command path refuses, or vice versa.
    //   clear — ALWAYS allowed, exactly like a real plant. Clearing a block that is
    //           holding a trip off scrams on the spot; nothing here prevents that, and
    //           `can_clear` is therefore just "is there a block to clear".
    var ins = this.lastInstruments, self = this, status = {};
    (this.config.trips || []).forEach(function (t) {
      if (!t.blockable || !t.id) return;
      var asserted = self._tripAsserted(t, ins), blocked = !!self.tripBlocks[t.id];
      status[t.id] = {
        blocked: blocked, asserted: asserted,
        can_block: !blocked && self._permTest(self._tripPermissive(t), ins),
        can_clear: blocked   // clearing a block is always allowed
      };
    });
    // RPS reset permissive for the UI (#75): can the operator reset the latch right now,
    // and if not, why. Same evaluator the command path uses, so the button's caption and
    // the refusal it would get are one fact rather than two that can drift apart. null
    // when not scrammed — there is nothing to reset.
    var resetBlock = this.rpsResetBlock(ins);
    return { scrammed: this.rps.scrammed, last_trip_reason: this.rps.last_trip_reason,
             trip_blocks: Object.assign({}, this.tripBlocks),
             manual_trip_blocks: Object.assign({}, this.manualTripBlocks),
             trip_block_status: status,
             reset_permitted: !!this.rps.scrammed && !resetBlock,
             reset_block: resetBlock };
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
  //   conc — boron batch dose (PWR): a target ppm meters a feedforward dose
  //          stopped by a flow totalizer (real makeup-panel semantics — see
  //          _stepConc), NOT a feedback seek on the lagged analyzer.
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
      c.standDown = 'manual';    // never auto-clears: the operator has the control until they hand it back
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
    c.standDown = null; c.sat = null;      // callers that stand a channel DOWN re-set this immediately below
    if (on) {
      // Setpoint captures the CURRENT reading (hold the plant where the
      // operator had it); integrator preload = bumpless transfer.
      if (def.sp) { var cap = def.sp.capture(ctx); c.sp = cap != null && isFinite(cap) ? clip(cap, def.sp.min, def.sp.max) : def.sp.min; }
      c.spEff = c.sp;
      c.I = def.init ? (def.init(ctx) || 0) : 0;
      c.lastAct = null; c.lastSent = null; c.bangMode = 'idle'; c.concMode = 'hold';
      // conc: open the books at the captured target — no dose pending on engage;
      // sample seq re-latches on the first evaluation (a stale result must not fire).
      c.concBasis = c.sp; c.concLastSp = c.sp; c.concSampleSeq = null;
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
      // A DISENGAGED channel is skipped below, so whatever note stood it down used to
      // freeze there for good. That was invisible while nothing rendered `note` (#214 —
      // the Automate tab that printed it was deleted), and becomes a false statement the
      // moment it is on screen. MEASURED before the fix: isolate feedwater and feed_sg
      // reads 'off — main feedwater isolated (AFW has the SGs)'; RESTORE feedwater and it
      // still reads exactly that, because this loop never looked at it again.
      // Retire the note when its cause clears — but NEVER re-engage here. Standing a
      // channel back up is the operator's call (that is the whole point of a stand-down),
      // so this clears the explanation and leaves the channel off.
      if (!c.engaged) {
        if (c.standDown === 'condition' && !(def.offWhen && def.offWhen(ctx))) { c.note = ''; c.standDown = null; }
        else if (c.standDown === 'scram' && !scrammed && !dead) { c.note = ''; c.standDown = null; }
        continue;
      }
      if (dead || (scrammed && def.offOnScram)) {           // stand down, visibly
        this._toggleChannel(c, false, ctx);
        c.note = dead ? 'off — core destroyed' : 'off — reactor scrammed';
        c.standDown = dead ? 'dead' : 'scram';              // 'dead' never clears — the core does not come back
        continue;
      }
      if (def.offWhen && def.offWhen(ctx)) {                // plant-condition stand-down (e.g. P-4 FWI)
        this._toggleChannel(c, false, ctx);
        c.note = def.offNote || 'off — plant condition';
        c.standDown = 'condition';
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
      else if (def.kind === 'conc') this._stepConc(c, ctx, t, step);
    }
  };

  // Shared per-evaluation tracking for pid/rods: slew the working setpoint
  // toward the user's, low-pass the PV against instrument noise, and keep a
  // damped PV rate for derivative (anticipation) action.
  ControlLayer.prototype._trackChannel = function (c, ctx, dt) {
    var def = c.def;
    // Programmed setpoint (e.g. the PWR rods_tavg Tref-on-load program, catalog §8.1):
    // the working setpoint is recomputed each evaluation from the plant state rather
    // than held at the value captured at engage, so it tracks load. spEff still slews
    // toward it below, so the programmed setpoint moves smoothly.
    if (def.program && def.sp) {
      var pg = def.program(ctx);
      if (pg != null && isFinite(pg)) c.sp = clip(pg, def.sp.min, def.sp.max);
    }
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
    // Cleared every evaluation and re-asserted only by the rail branch below. Latching
    // it would repeat the mistake the stand-down notes made: a saturation flag that
    // outlives the saturation is a board tile lying about the controller's authority.
    c.sat = null;
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
    // minDelta suppresses chatter in the INTERIOR of the output range. It must not
    // suppress the last small step onto a RAIL: with minDelta 1.0 a channel that
    // wants u = 0 but last sent 0.13 never sends again (|0 − 0.13| < 1.0), so a
    // stale trickle stands for the rest of the run. On the feed channel that is a
    // 0.13 % pump demand into a generator with NO steam leaving — measured, it
    // filled the SG 65.0 → 75.8 % across pwr_heatup's holds and then collapsed
    // through the lo-lo when the dump finally opened (#210). Same family as the
    // anti-windup ratchet noted above, by a different mechanism: reaching a bound
    // is a state change, not chatter, so it is always worth sending.
    var atRail = (u <= def.uMin + 1e-9 && c.lastSent > def.uMin + 1e-9) ||
                 (u >= def.uMax - 1e-9 && c.lastSent < def.uMax - 1e-9);
    if (c.lastSent != null && !atRail && Math.abs(u - c.lastSent) < (def.minDelta || 0)) {
      // Report honestly instead of leaving a stale note standing. `holding` above
      // means "error inside the deadband"; this is "error is real but I am not
      // moving", and if the output is pinned at a bound the operator needs to know
      // the channel is out of authority — a feed controller cannot pump water OUT.
      // `sat` is the same fact as a CODE, so a board tile can show it without matching
      // English against the strings above. The board needs this (#214) and prose is the
      // wrong contract for it — reword the note and a silent string match breaks.
      c.sat  = (u <= def.uMin + 1e-9) ? 'lo' : (u >= def.uMax - 1e-9) ? 'hi' : null;
      c.note = (u <= def.uMin + 1e-9) ? 'at minimum output — no authority to correct'
             : (u >= def.uMax - 1e-9) ? 'at maximum output — no authority to correct'
             : 'steady';
      return;
    }
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

  // Boron BATCH DOSE (real-plant makeup semantics — TUNING_LOG S8/S9): a target
  // ppm is converted to a metered dose — delta = target − the channel's BOOKKEPT
  // concentration — delivered at the makeup rate and stopped by the flow
  // TOTALIZER, never by chasing the boron analyzer (its ~loop-transit sample lag
  // made closed-loop seeking over-deliver ~rate×lag and spike power). The books
  // advance with the metered injection (feedforward, like a real batch
  // integrator counting gallons); the analyzer is consulted only when a NEW
  // target finds the books stale beyond def.reAnchorPpm (e.g. after ECCS
  // boration) — the "take a chemistry sample before computing the dose" step.
  // Any target change executes, however small (no deadband). Needs the charging
  // pump (the dose rides charging flow; the totalizer pauses with the pump off,
  // mirroring the engine's own injection gate). A side effect worth keeping:
  // a completed dose does NOT fight external boration (ECCS) back toward an old
  // target — the totalizer is spent, exactly like the real panel.
  ControlLayer.prototype._stepConc = function (c, ctx, t, step) {
    var def = c.def;
    var pv = c.pvF != null ? c.pvF : (def.pv ? def.pv(ctx) : null);
    if (pv != null && isFinite(pv)) c.pvNow = pv; else pv = null;
    var sp = c.sp;
    if (sp == null) return;
    // pausedWhen: the plant says when its metering path is unavailable, the same
    // way `busyNote` supplies the bang channel's status suffix (HR3 — no plant
    // fields in the kernel). This read `control_state.charging_pump_running`
    // directly, which is a PWR CVCS detail the generic conc machinery has no
    // business knowing.
    var paused = def.pausedWhen ? !!def.pausedWhen(ctx) : false;
    // Totalizer bookkeeping FIRST: the rate commanded at the previous evaluation
    // has been injecting for `step` sim-seconds (the engine applies the metered
    // rate only while the path is available — the same gate as `paused` here).
    if (!paused && c.concBasis != null) {
      if (c.concMode === 'borate') c.concBasis += def.rate * step;
      else if (c.concMode === 'dilute') c.concBasis -= def.rate * step;
    }
    // A NEW target = a new dose computation. Re-anchor the books from the
    // (filtered) analyzer only if they have clearly drifted — otherwise
    // sequential nudges meter exactly from where the last dose ended.
    if (sp !== c.concLastSp || c.concBasis == null) {
      if (c.concBasis == null || (pv != null && Math.abs(pv - c.concBasis) > (def.reAnchorPpm || 15))) {
        c.concBasis = pv != null ? pv : sp;
      }
      c.concLastSp = sp;
    }
    // Fresh lab RESULT (take_boron_sample, exposed as instruments.boron_sample/_seq —
    // like set_boron_adjust above, a conc-kind plant coupling): while IDLE, a new
    // result re-baselines the channel — books AND target snap to the lab number, so
    // the next dose is computed from reality without starting one now (the operator
    // dials the change from an honest baseline). Mid-dose results are latched but
    // not applied (the totalizer is already counting honest injection).
    var seq = ctx.instruments ? ctx.instruments.boron_sample_seq : null;
    if (seq != null) {
      if (c.concSampleSeq == null) c.concSampleSeq = seq;
      else if (seq !== c.concSampleSeq) {
        c.concSampleSeq = seq;
        var lab = ctx.instruments.boron_sample;
        if (c.concMode === 'hold' && lab != null && isFinite(lab)) {
          c.concBasis = lab;
          c.sp = def.sp ? clip(lab, def.sp.min, def.sp.max) : lab;
          c.concLastSp = c.sp;
          sp = c.sp;
        }
      }
    }
    var remaining = sp - c.concBasis;   // + → borate; the totalizer stop is |remaining| ≈ 0
    if (paused) {
      if (c.concMode !== 'hold') { this._sendInternal({ action: 'set_boron_adjust', rate: 0 }); c.concMode = 'hold'; }
      c.note = (def.pausedNote || 'idle — paused') +
        (Math.abs(remaining) > 0.1 ? ' (dose paused, ' + Math.abs(remaining).toFixed(1) + ' ' + (def.sp && def.sp.unit || '') + ' to go)' : '');
      return;
    }
    var want = remaining > 0.05 ? 'borate' : remaining < -0.05 ? 'dilute' : 'hold';
    if (want === 'hold' && c.concMode !== 'hold') {
      c.concBasis = sp;   // dose delivered — square the books
      // Confirmatory chemistry: draw the post-dose sample automatically, the way a
      // real crew samples after every planned boron change (result posts after the
      // lab turnaround and re-baselines above — normally a no-op confirmation).
      this._sendInternal({ action: 'take_boron_sample' });
    }
    var note = want === 'hold' ? 'idle'
      : (want === 'borate' ? 'borating' : 'diluting') + ' — ' + Math.abs(remaining).toFixed(1) + ' ppm to go';
    if (want === c.concMode) { c.note = note; return; }
    // Starting a dose respects the action period; STOPPING or reversing never
    // waits — a delayed stop is an overshoot.
    if (want !== 'hold' && c.concMode === 'hold' && c.lastAct != null && def.period && t - c.lastAct < def.period) return;
    var rate = want === 'borate' ? def.rate : want === 'dilute' ? -def.rate : 0;
    var r = this._sendInternal({ action: 'set_boron_adjust', rate: rate });
    if (r && r.type === 'blocked') { c.note = '⛔ ' + (r.message || 'blocked'); return; }
    c.concMode = want; c.lastAct = t;
    c.note = note;
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
        // pvDisplay:false — the channel still READS its pv internally, but the
        // snapshot doesn't surface it (e.g. the boron analyzer, removed from the
        // UI 2026-07-23 while remaining the conc channel's internal seed/re-anchor).
        pv: def.pvDisplay === false ? null : pv,
        note: c.note || '',
        // Machine-readable twin of the note, for surfaces that must not parse prose (#214).
        stand_down: c.standDown || null,
        saturated: c.engaged ? (c.sat || null) : null,
        standby: !!(c.engaged && def.standby && def.standby(ctx, this)),
      };
      if (def.sp) {
        entry.setpoint_meta = { min: def.sp.min, max: def.sp.max, unit: def.sp.unit || '',
                                dp: def.sp.dp != null ? def.sp.dp : 0, step: def.sp.step || 1,
                                dim: def.sp.dim || null };
      }
      // conc: signed batch-dose remaining (+ borate / − dilute), for totalizer readouts.
      if (def.kind === 'conc') {
        entry.dose_remaining = (c.engaged && c.sp != null && c.concBasis != null) ? c.sp - c.concBasis : null;
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
    // Actions this exercise has withheld (#125). Surfaced so the board can render a
    // control as LOCKED rather than dead — a button that silently does nothing is the
    // failure mode this repo keeps finding, not an acceptable way to disable something.
    result.action_locks = Object.keys(this.actionLocks);
    return result;
  };

  ControlLayer.prototype._saveAutomation = function () {
    var ch = {};
    for (var i = 0; i < this.channels.length; i++) {
      var c = this.channels[i];
      ch[c.def.id] = { engaged: c.engaged, sp: c.sp, spEff: c.spEff, I: c.I, lastAct: c.lastAct,
                       lastSent: c.lastSent, note: c.note, standDown: c.standDown, sat: c.sat, bangMode: c.bangMode, pvF: c.pvF, rate: c.rate,
                       concMode: c.concMode, concBasis: c.concBasis, concLastSp: c.concLastSp,
                       concSampleSeq: c.concSampleSeq };
    }
    return { t: this._autoT, acc: this._autoAcc, channels: ch, esf: Object.assign({}, this.esfAuto),
             action_locks: Object.assign({}, this.actionLocks),
             trip_blocks: Object.assign({}, this.tripBlocks),
             manual_trip_blocks: Object.assign({}, this.manualTripBlocks) };
  };

  ControlLayer.prototype._loadAutomation = function (au) {
    this._autoT = au && au.t != null ? au.t : 0;
    // Absent in a pre-#125 save: nothing locked, which is the free-play state.
    this.actionLocks = Object.assign({}, (au && au.action_locks) || {});
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
        // standDown absent = an OLD SAVE (pre-#214). Null is the safe migration: the
        // note simply keeps its saved text until the channel is next toggled, which is
        // exactly the pre-#214 behaviour, rather than being wrongly retired on load.
        c.note = sv.note || ''; c.standDown = sv.standDown || null; c.sat = sv.sat || null;
        c.bangMode = sv.bangMode || 'idle';
        c.pvF = sv.pvF != null ? sv.pvF : null; c.rate = sv.rate != null ? sv.rate : null;
        // conc batch state: an old save (pre-batch) has none — open the books at
        // the saved target so no phantom dose starts on load.
        c.concMode = sv.concMode || 'hold';
        c.concBasis = sv.concBasis != null ? sv.concBasis : c.sp;
        c.concLastSp = sv.concLastSp != null ? sv.concLastSp : c.sp;
        c.concSampleSeq = sv.concSampleSeq != null ? sv.concSampleSeq : null;   // null → latch on first evaluation
      } else {
        c.engaged = false; c.sp = null; c.spEff = null; c.I = 0; c.lastAct = null;
        c.lastSent = null; c.note = ''; c.standDown = null; c.sat = null; c.bangMode = 'idle'; c.pvF = null; c.rate = null;
        c.concMode = 'hold'; c.concBasis = null; c.concLastSp = null; c.concSampleSeq = null;
      }
      c.pvNow = null;
    }
    for (var id in this.esfAuto) {
      this.esfAuto[id] = (au && au.esf && id in au.esf) ? !!au.esf[id] : true;   // absent = armed (the safe default)
    }
    // Absent in an old save → re-derive the at-power lineup from the restored
    // instruments (a pre-NIS save at full power must not insta-trip on load).
    this.tripBlocks = (au && au.trip_blocks) ? Object.assign({}, au.trip_blocks) : this._initialTripBlocks();
    this.manualTripBlocks = (au && au.manual_trip_blocks) ? Object.assign({}, au.manual_trip_blocks) : {};   // old saves: none → all treated as auto
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
      alarmAutoAcked: Object.assign({}, this.alarmAutoAcked),
      actuationFired: this.actuationFired.slice(),
      interlockActive: this.interlockActive.slice(),
      // NOTE: trip blocks ride inside `automation` (_saveAutomation → trip_blocks /
      // manual_trip_blocks, restored by _loadAutomation). Do not add a second
      // top-level copy — they round-trip correctly today and two sources of truth
      // for the same state is how they would stop doing so.
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
    // Absent in saves made before #240's follow-up: an old save's acknowledgments
    // are all operator acknowledgments as far as we can tell, so nothing is
    // auto-acked and nothing gets handed back on escalation. That is the
    // conservative direction — the harmful error would be re-flashing a tile the
    // operator had already dealt with.
    this.alarmAutoAcked = Object.assign({}, st.alarmAutoAcked || {});
    var nActs = (this.config.actuations || []).length;
    var nIls = (this.config.interlocks || []).length;
    this.actuationFired = (st.actuationFired && st.actuationFired.length === nActs)
      ? st.actuationFired.slice()
      : (this.config.actuations || []).map(function () { return false; });
    this.interlockActive = (st.interlockActive && st.interlockActive.length === nIls)
      ? st.interlockActive.slice()
      : (this.config.interlocks || []).map(function () { return false; });
    this._loadAutomation(st.automation);   // absent in old saves → all channels MAN
                                           // (also restores tripBlocks/manualTripBlocks)
    // lastInstruments is the previous step's readings. It is DERIVED, so it is not
    // serialised — but it must not be left empty either: getRpsState() computes
    // every trip's `asserted` from it, and _evalInterlocks / command permissives
    // read it too. A restored layer with lastInstruments = {} reported every
    // blockable trip as NOT asserted until the next step, which is what made
    // rewind non-bit-exact (run_m5, #151) and would have briefly mis-enabled the
    // trip-block buttons after any restore. The engine is restored before the
    // layer (simulation_service loadState), so its readings are already correct.
    this.lastInstruments = (this.engine && this.engine.getInstruments)
      ? this.engine.getInstruments() : {};
  };

  RD.ControlLayer = ControlLayer;
  RD.ControlFailureLayer = ControlLayer;   // compatibility alias (pre-split name)

})(globalThis.RD || (globalThis.RD = {}));
