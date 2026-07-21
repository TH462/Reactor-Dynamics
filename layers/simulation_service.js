/*
 * simulation_service.js — M5, the Simulation Service & Runtime.
 *
 * The conductor: it drives the engine + Control & Failure Layer each cycle,
 * assembles and broadcasts the snapshot, owns the lifecycle (play/pause/reset/
 * speed), selects the plant, and serializes/restores the whole simulation. It
 * computes no physics, evaluates no protection, scripts no content — it
 * orchestrates (CONTEXT §4–5, M5).
 *
 * Stack it builds and drives from above:
 *   SimulationService → Instructor slot (M6·PH / M6) → Control & Failure (M4) → Engine (M1–M3)
 * Plant commands descend through that whole path (HR5); snapshots ascend.
 *
 * No scenario tests of its own (M7 validates the assembled stack). Attaches
 * RD.SimulationService.
 *
 * --- Deviation note (acceleration & stability) --------------------------------
 * CONTEXT §4 / M5 §3 hand the engine `dt_effective = 0.02·time_acceleration`.
 * M1's explicit-Euler kinetics is only proven stable at 0.02 s and DIVERGES at
 * large dt (verified: dt=1.2 s / 60× blows up). So this service always steps the
 * engine at the fixed 0.02 s dt and realizes acceleration as MORE physics steps
 * per broadcast — every step stays stable and deterministic, and at 1× the
 * behavior is identical to the literal spec (25 steps × 0.02 s per 500 ms). HR6
 * still holds: all time constants are sim-time, so lag/decay/battery timelines
 * are acceleration-correct (more sim time elapses per broadcast at higher accel).
 */
;(function (RD) {
  'use strict';

  var PHYSICS_DT = 0.02;            // 50 Hz physics (fixed; see deviation note)
  // Broadcast cadence. CONTEXT §4's stated cadence is 2 Hz / 5 Hz; we render
  // faster (10 Hz normal, 20 Hz transient) for a smoother live UI — cheap, since
  // the per-step work is tiny. The data is identical; only the frame rate changes.
  // The transient thresholds (§7) are scaled by the interval so the *rate* that
  // flips into transient mode is unchanged.
  var NORMAL_MS = 100;             // 10 Hz broadcast
  var TRANSIENT_MS = 50;           // 20 Hz during an active transient (§7)
  var CADENCE_REF_MS = 500;        // thresholds were defined against this interval
  var DEFAULT_SEED = 0x1A2B3C4D;

  // Plant id → engine constructor. RBMK/BWR register when M2/M3 land.
  function engineCtor(plantId) {
    if (plantId === 'pwr') return RD.PWREngine;
    if (plantId === 'rbmk') return RD.RBMKEngine;
    if (plantId === 'bwr') return RD.BWREngine;
    return null;
  }

  // The plant's primary pressure field, for transient detection (§7).
  function primaryPressure(trueState) {
    if (trueState.pressure_mpa != null) return trueState.pressure_mpa;          // PWR
    if (trueState.steam_pressure_mpa != null) return trueState.steam_pressure_mpa; // RBMK
    if (trueState.vessel_pressure_mpa != null) return trueState.vessel_pressure_mpa; // BWR
    return 0;
  }

  // ----- Default pass-through occupant of the Instructor slot ------------------
  // A dependency-free fallback mirroring M6·PH (RD.InstructorLayer), used only if
  // instructor_layer.js is not loaded — so M5 runs and tests standalone without
  // caring which implementation occupies the slot. When M6·PH/M6 is present it is
  // preferred (see the constructor). Same interface either way.
  function DefaultInstructor(below) { this.below = below || null; this.register = 'learning'; }
  DefaultInstructor.prototype.connect = function (layer) { this.below = layer; };
  DefaultInstructor.prototype.handleCommand = function (cmd) { return this.below.handleCommand(cmd); };
  DefaultInstructor.prototype.step = function () { /* no beats */ };
  DefaultInstructor.prototype.getMessage = function () { return { message: null, message_register: this.register }; };
  DefaultInstructor.prototype.setRegister = function (v) { this.register = v; };
  DefaultInstructor.prototype.load = function () { /* no-op */ };
  DefaultInstructor.prototype.saveState = function () { return { register: this.register }; };
  DefaultInstructor.prototype.loadState = function (s) { this.register = (s && s.register != null) ? s.register : 'learning'; };

  // ============================================================ the service
  function SimulationService(opts) {
    opts = opts || {};
    this.seed = opts.seed != null ? opts.seed : DEFAULT_SEED;
    // Prefer an injected instructor; else the real M6·PH (RD.InstructorLayer) if
    // loaded; else the dependency-free fallback. M5 does not care which (§5).
    this.instructor = opts.instructor
      || (RD.InstructorLayer ? new RD.InstructorLayer(null) : new DefaultInstructor(null));
    this.subscribers = [];

    this.engine = null;
    this.layer = null;                 // M4
    this.activePlantId = null;
    this.activeDesignVersion = null;
    this.activeRegister = 'learning';

    this.simTime = 0;
    this.timeAcceleration = 1.0;
    this.running = false;
    this.broadcastMs = NORMAL_MS;
    this._prevTrueState = null;
    this._prevAlarms = null;
    this._prevScrammed = false;        // attention-stop edge detection (auto-decelerate)
    this._prevFailureIds = null;
    this._timer = null;
    // Rewind ring (Gameplay §7.2): in-memory checkpoints pushed when the
    // Instructor requests one (scenario load, beat fire, follow-step advance).
    // Each entry is a full saveState() — engine + instruments (lag/PRNG) + M4 +
    // instructor progress — so a rewind is a bit-exact, deterministic restore.
    this.checkpoints = [];
    this._rewindCursor = null;         // last rewound-to index; walks repeated ⏪ presses back

    if (opts.plant_id) {
      this.selectPlant(opts.plant_id, opts.initial_state || 'hot_full_power', opts.design_version || null);
    }
  }

  // ------------------------------------------------- plant selection / reset (§6)
  // opts.noDefaults: skip the plant's normal automation lineup (engageDefaults) —
  // instructed content (start_scenario / start_follow) starts from a clean board
  // and applies its own authored auto_channels preset instead.
  SimulationService.prototype.selectPlant = function (plantId, initialState, designVersion, opts) {
    var Ctor = engineCtor(plantId);
    if (!Ctor) return { type: 'error', code: 'COMMAND_ERROR', message: 'unknown plant_id', received: plantId };

    // 0. A plant reset ends any running scenario/walkthrough — stale Instructor
    //    progress must not outlive its plant. (start_scenario loads AFTER this.)
    if (this.instructor.unload) this.instructor.unload();
    // 1. Construct the engine and extract its protection config.
    this.engine = new Ctor({ initial_state: initialState, design_version: designVersion || null, seed: this.seed });
    var config = this.engine.getProtectionConfig();
    // 2. (Re)build the Control Layer for this plant (the kernel holds no plant state).
    this.layer = new RD.ControlLayer(this.engine, config);
    // 3. Wire the Instructor slot to the new layer.
    if (this.instructor.connect) this.instructor.connect(this.layer);
    // 4. Initial state already loaded by the engine constructor; reset run state.
    this.activePlantId = plantId;
    this.activeDesignVersion = designVersion || null;
    this.simTime = 0;
    this._prevTrueState = null;
    this._prevAlarms = null;
    this._prevScrammed = false;
    this._prevFailureIds = null;
    this.broadcastMs = NORMAL_MS;
    this.checkpoints = [];             // a fresh plant invalidates the rewind ring
    this._rewindCursor = null;
    // Restore the selected register into the rebuilt layer/instructor.
    this.layer.handleCommand({ action: 'set_register', value: this.activeRegister });
    if (this.instructor.setRegister) this.instructor.setRegister(this.activeRegister);
    // The plant's normal automation lineup (e.g. the RBMK AR in AUTO at power).
    if (!(opts && opts.noDefaults) && this.layer.engageDefaults) this.layer.engageDefaults();
    // Engine-side free-play preset lineup (control_state with no automation channel to
    // carry it, e.g. the PWR letdown orifice alignment). Free play only — instructed
    // content (noDefaults) applies its own setup_commands instead.
    if (!(opts && opts.noDefaults) && this.engine.getStartupLineup) {
      var lineup = this.engine.getStartupLineup() || [];
      for (var li = 0; li < lineup.length; li++) this.handleCommand(lineup[li]);
    }

    // Assemble + broadcast the initial snapshot so the UI renders the start state.
    var snap = this._assembleWithInstructor();
    this._broadcast(snap);
    return snap;
  };

  // ----------------------------------------------------------- the step loop (§3)
  // One broadcast cycle: inner physics steps (fixed dt), evaluate, assemble, emit.
  SimulationService.prototype.tick = function () {
    if (!this.running || !this.engine) return null;
    var steps = this._stepsPerBroadcast();
    for (var i = 0; i < steps; i++) {
      // Automation channels run in-stack at physics rate (fixed sim-time
      // cadence inside), reading the previous step's instruments — so
      // controllers behave identically at any time acceleration.
      if (this.layer.stepAutomation) this.layer.stepAutomation(PHYSICS_DT);
      this.engine.step(PHYSICS_DT);
    }
    this.layer.evaluate(this.engine.getInstruments());      // trips/actuations/alarms on the new readings (HR1)
    this.simTime += steps * PHYSICS_DT;

    var snap = this._assembleWithInstructor();
    this._broadcast(snap);
    this._updateCadence(snap);
    this._maybeSandboxCheckpoint();
    return snap;
  };

  // Sandbox rewind (free play): with no scenario/walkthrough loaded the ring
  // fills on a fixed sim-time cadence instead of beat boundaries, so the player
  // can always jump back. Never runs while the Instructor owns the ring — an
  // authored rewind's step arithmetic depends on exact ring contents.
  var SANDBOX_CP_SPACING_S = 15;
  SimulationService.prototype._maybeSandboxCheckpoint = function () {
    if (this.instructor && this.instructor.mode) return;
    var last = this.checkpoints[this.checkpoints.length - 1];
    if (!last || this.simTime - last.metadata.sim_time >= SANDBOX_CP_SPACING_S) this._pushCheckpoint();
  };

  SimulationService.prototype._stepsPerBroadcast = function () {
    // Acceleration = more fixed-dt steps per broadcast (see deviation note).
    return Math.max(1, Math.round(this.timeAcceleration * (this.broadcastMs / 1000) / PHYSICS_DT));
  };

  // Assemble the snapshot, then let the Instructor evaluate it and fold its
  // message in (its commands, if any, take effect next cycle) — §3.
  SimulationService.prototype._assembleWithInstructor = function () {
    var snap = this.assembleSnapshot();
    if (this.instructor.step) this.instructor.step(snap, this.simTime);
    // Service the Instructor's consume-flags (no upward callbacks — M5 polls).
    // A beat-driven world rewind rebuilds the plant, so reassemble afterwards.
    if (this._serviceInstructorRequests()) snap = this.assembleSnapshot();
    // Attention stop: a real plant event the operator must address snaps
    // fast-forward back to real time. Applied AFTER the Instructor's speed request
    // so a genuine trip/failure wins over a beat that asked for FF — and stamped
    // BEFORE time_acceleration below so THIS snapshot (the one carrying the SCRAM)
    // already reads 1×, with no one-broadcast lag.
    var stop = this._attentionStop(snap);
    if (stop && this.timeAcceleration > 1) {
      this.timeAcceleration = 1.0;
      snap.metadata.speed_snap = { reason: stop };
    }
    // A beat's speed request takes effect from THIS broadcast — keep it honest.
    snap.metadata.time_acceleration = this.timeAcceleration;
    snap.instructor = this._instructorBlock();
    return snap;
  };

  SimulationService.prototype._serviceInstructorRequests = function () {
    var i = this.instructor;
    if (i.consumeCheckpointRequest && i.consumeCheckpointRequest()) this._pushCheckpoint();
    var rewound = false;
    var rw = i.consumeRewindRequest ? i.consumeRewindRequest() : null;
    // silent: this runs INSIDE _assembleWithInstructor (instructor.step already
    // fired this tick and set the rewind), and the outer path reassembles + tick()
    // rebroadcasts. A broadcasting/instructor-stepping _restore here would step the
    // Instructor twice and emit two snapshots per tick (the double-step could
    // prematurely advance the post-rewind beat against the rolled-back state).
    if (rw) rewound = !!this._rewind(rw.steps || 1, rw.scope || 'world', false, true);
    // Speed applies AFTER a rewind so a beat's speed wins over the checkpoint's
    // stored acceleration (fast-forward in, snap back to real time at set points).
    var sp = i.consumeSpeedRequest ? i.consumeSpeedRequest() : null;
    if (sp != null) this.timeAcceleration = sp;
    return rewound;
  };

  // Authored automation preset (scenario.auto_channels / procedure.auto_channels):
  // engage the listed channels after the content's plant reset.
  SimulationService.prototype._applyAutoPreset = function (ids) {
    if (!ids || !ids.length || !this.layer) return;
    for (var i = 0; i < ids.length; i++) {
      this.layer.handleCommand({ action: 'set_auto_channel', channel_id: ids[i], engaged: true });
    }
  };

  var REWIND_CAP = 32;
  SimulationService.prototype._pushCheckpoint = function () {
    if (!this.engine) return;
    this.checkpoints.push(this.saveState());
    if (this.checkpoints.length > REWIND_CAP) this.checkpoints.shift();
    this._rewindCursor = null;         // new progress resets the repeated-press walk-back
  };

  // Rewind `steps` checkpoints back. scope 'full' restores everything including
  // Instructor progress (RETRY a decision — its beats re-arm); scope 'world'
  // restores the plant but the teacher remembers (narrated "watch that again").
  // The target checkpoint stays on the ring so it can be rewound to again.
  // `exact` (rewind-pick): the caller names a specific checkpoint — skip both
  // press-semantics guards below and restore precisely what was asked for.
  SimulationService.prototype._rewind = function (steps, scope, exact, silent) {
    var idx = this.checkpoints.length - steps;
    if (!exact) {
      // If the newest checkpoint IS the current moment (a beat just fired here,
      // or we already rewound to it in this same broadcast), rewinding must
      // reach strictly earlier state.
      if (idx === this.checkpoints.length - 1 && idx >= 0 &&
          Math.abs(this.checkpoints[idx].metadata.sim_time - this.simTime) < 1e-9) idx--;
      // Repeated presses with no new progress since the last rewind (no
      // checkpoint pushed) walk back one boundary each. Without this, the
      // broadcasts that tick between two ⏪ presses defeat the exact-time guard
      // above and every press restores the same newest checkpoint — a failure
      // card could never be escaped back to its decision point (playtest).
      if (this._rewindCursor != null && idx >= this._rewindCursor) idx = this._rewindCursor - 1;
    }
    var target = idx >= 0 ? this.checkpoints[idx] : null;
    if (!target) return null;
    this.checkpoints.length = idx + 1;
    this._rewindCursor = idx;
    return this._restore(target, scope === 'world', silent);
  };

  // The snapshot's instructor block: the extended shape (M6 getSnapshotBlock —
  // ui_policy/highlight/follow/level_complete) when the occupant provides it,
  // else the classic message-only block (placeholder / DefaultInstructor / mocks).
  SimulationService.prototype._instructorBlock = function () {
    return this.instructor.getSnapshotBlock
      ? this.instructor.getSnapshotBlock()
      : this.instructor.getMessage();
  };

  // ------------------------------------------------------------- snapshot (§4)
  SimulationService.prototype.assembleSnapshot = function () {
    return {
      type: 'state',
      schema_version: '1.0',
      metadata: {
        sim_time: this.simTime,
        running: this.running,
        time_acceleration: this.timeAcceleration,
        wall_time: new Date().toISOString(),     // display-only; never in physics (§9)
        plant_id: this.activePlantId,
        design_version: this.activeDesignVersion,
      },
      true_state: this.engine.getTrueState(),
      instruments: this.engine.getInstruments(),
      control_state: this.engine.getControlState(),
      rps_state: this.layer.getRpsState(),
      alarms: this.layer.getAlarms(),
      active_failures: this.layer.getActiveFailures(),
      automation: this.layer.getAutomationState ? this.layer.getAutomationState() : { channels: [] },
      instructor: this._instructorBlock(),
    };
  };

  // ---------------------------------------------------- transient cadence (§7)
  SimulationService.prototype._updateCadence = function (snap) {
    var transient = this._isActiveTransient(snap);
    this.broadcastMs = transient ? TRANSIENT_MS : NORMAL_MS;
    this._prevTrueState = snap.true_state;
    this._prevAlarms = snap.alarms;
    this._prevScrammed = this._snapScrammed(snap);
    this._prevFailureIds = this._failureIdSet(snap.active_failures);
    if (this.running && this._timer != null) this._reschedule();
  };

  SimulationService.prototype._isActiveTransient = function (snap) {
    if (this._isRapidChange(snap)) return true;
    return this._anyAlarmNewlyFiring(snap.alarms, this._prevAlarms);
  };

  // Rapid power/pressure excursion vs. the previous broadcast, thresholds scaled
  // to the actual cadence so the *rate* that trips is frequency-independent (§7).
  // Shared by the transient-cadence flip and the attention stop.
  SimulationService.prototype._isRapidChange = function (snap) {
    var prev = this._prevTrueState;
    if (!prev) return false;
    var k = this.broadcastMs / CADENCE_REF_MS;
    if (Math.abs(snap.true_state.power_pct - prev.power_pct) > 1.0 * k) return true;
    if (Math.abs(primaryPressure(snap.true_state) - primaryPressure(prev)) > 0.14 * k) return true;
    return false;
  };

  // Attention stop: return a reason string for the FIRST event on this
  // broadcast that the operator must address, else null. Edge-triggered against
  // the previous broadcast so a latched condition fires once, not every cycle.
  // Null while there is no previous broadcast (fresh plant / just-loaded save) so
  // a reset never reads as an event. See _assembleWithInstructor for the snap-back.
  //
  // NOTE: deliberately does NOT include _isRapidChange. A rapid excursion that
  // genuinely needs attention already trips an alarm (caught above); a COMMANDED
  // ramp — an operator or auto-channel power maneuver — is expected change, and
  // snapping to 1× on it would make fast-forwarding through any startup/load ramp
  // impossible. _isRapidChange stays as the transient-broadcast-cadence signal only.
  SimulationService.prototype._attentionStop = function (snap) {
    if (!this._prevTrueState) return null;
    if (this._snapScrammed(snap) && !this._prevScrammed) return 'scram';
    if (this._anyNewFailure(snap.active_failures)) return 'failure';
    if (this._anyAlarmNewlyFiring(snap.alarms, this._prevAlarms)) return 'alarm';
    return null;
  };

  // Scrammed if the protection latched (rps) OR the operator manually scrammed
  // (true_state only — a manual scram never sets rps; see control_kernel §trip).
  SimulationService.prototype._snapScrammed = function (snap) {
    return !!((snap.rps_state && snap.rps_state.scrammed) ||
              (snap.true_state && snap.true_state.scrammed));
  };

  SimulationService.prototype._failureIdSet = function (failures) {
    var set = {};
    if (failures) for (var i = 0; i < failures.length; i++) set[failures[i].id] = true;
    return set;
  };

  SimulationService.prototype._anyNewFailure = function (failures) {
    if (!failures || !this._prevFailureIds) return false;
    for (var i = 0; i < failures.length; i++) {
      if (!this._prevFailureIds[failures[i].id]) return true;
    }
    return false;
  };

  SimulationService.prototype._anyAlarmNewlyFiring = function (now, prev) {
    if (!prev) return false;
    var prevState = {};
    for (var i = 0; i < prev.length; i++) prevState[prev[i].id] = prev[i].state;
    for (var j = 0; j < now.length; j++) {
      var a = now[j];
      var wasClear = !prevState[a.id] || prevState[a.id] === 'clear';
      if (wasClear && a.state !== 'clear') return true;
    }
    return false;
  };

  // ---------------------------------------------------------- command routing (§5)
  SimulationService.prototype.handleCommand = function (command) {
    if (!command || !command.action) return { type: 'error', code: 'COMMAND_ERROR', message: 'no action', received: command };
    switch (command.action) {
      case 'play':  this.start(); return null;
      case 'pause': this.stop(); return null;
      case 'reset': return this.selectPlant(command.plant_id, command.initial_state, command.design_version || null);
      case 'set_speed': this.timeAcceleration = command.value; return null;
      case 'save_state': return this.saveState();
      case 'load_state': return this.loadState(command.state);
      case 'set_register':
        // Dispatched to both consuming layers; also recorded for the UI (§5).
        this.activeRegister = command.value;
        if (this.instructor.setRegister) this.instructor.setRegister(command.value);
        if (this.layer) this.layer.handleCommand(command);
        return null;
      // ---- scenario lifecycle (M6 §2): reset to the scenario's plant/state,
      // then hand the scenario to the Instructor. Beats fire on later ticks.
      case 'start_scenario': {
        var sc = RD.SCENARIOS ? RD.SCENARIOS[command.scenario_id] : null;
        if (!sc) return { type: 'error', code: 'COMMAND_ERROR', message: 'unknown scenario_id', received: command };
        // Clean automation board (noDefaults), then the authored preset:
        // a mission hands the player one or two controls, the rest go on auto.
        var reset = this.selectPlant(sc.plant_id, sc.initial_state, sc.design_version || null, { noDefaults: true });
        if (reset && reset.type === 'error') return reset;
        if (this.instructor.load) this.instructor.load(sc);
        if (sc.setup_commands) {
          for (var si = 0; si < sc.setup_commands.length; si++) this.handleCommand(sc.setup_commands[si]);
        }
        this._applyAutoPreset(sc.auto_channels);
        var snap = this._assembleWithInstructor();
        this._broadcast(snap);
        return snap;
      }
      // ---- Path 2 walkthroughs: the Instructor runs a manual procedure from
      // RD.MANUAL_PROCEDURES (the single validated artifact — CONTEXT §12).
      // M5 resolves the profile key because only it knows the active plant, and
      // resets the plant to the procedure's authored `from` state — every
      // walkthrough starts where its steps (and the validation harness) assume.
      case 'start_follow': {
        if (!this.engine) return { type: 'error', code: 'COMMAND_ERROR', message: 'no active plant', received: command };
        var key = this.activePlantId === 'rbmk'
          ? (this.activeDesignVersion === 'post_chernobyl' ? 'rbmk_post' : 'rbmk_pre')
          : this.activePlantId;
        var pool = (RD.MANUAL_PROCEDURES || {})[key] || [];
        var proc = null;
        for (var pi = 0; pi < pool.length; pi++) if (pool[pi].id === command.procedure_id) { proc = pool[pi]; break; }
        if (!proc || !this.instructor.loadProcedure) {
          return { type: 'error', code: 'COMMAND_ERROR', message: 'unknown procedure_id', received: command };
        }
        if (proc.from) {
          var reset2 = this.selectPlant(this.activePlantId, proc.from, this.activeDesignVersion, { noDefaults: true });
          if (reset2 && reset2.type === 'error') return reset2;
        } else if (this.layer.setAutoChannel) {
          this.layer.setAutoChannel('all', false);   // clean board even without a plant reset
        }
        this.instructor.loadProcedure(proc, { procedure_id: proc.id, profile_key: key });
        this._applyAutoPreset(proc.auto_channels);
        var fsnap = this._assembleWithInstructor();
        this._broadcast(fsnap);
        return fsnap;
      }
      // ---- Path 3 auto-checklists: the SAME procedure artifact run as a passive
      // checklist against the LIVE plant — no reset, no auto preset, no gating.
      // The Instructor grades steps off the instruments; the UI renders bubbles.
      case 'start_checklist': {
        if (!this.engine) return { type: 'error', code: 'COMMAND_ERROR', message: 'no active plant', received: command };
        var ckey = this.activePlantId === 'rbmk'
          ? (this.activeDesignVersion === 'post_chernobyl' ? 'rbmk_post' : 'rbmk_pre')
          : this.activePlantId;
        var cpool = (RD.MANUAL_PROCEDURES || {})[ckey] || [];
        var cproc = null;
        for (var cpi = 0; cpi < cpool.length; cpi++) if (cpool[cpi].id === command.procedure_id) { cproc = cpool[cpi]; break; }
        if (!cproc || !this.instructor.loadChecklist) {
          return { type: 'error', code: 'COMMAND_ERROR', message: 'unknown procedure_id', received: command };
        }
        this.instructor.loadChecklist(cproc, { procedure_id: cproc.id, profile_key: ckey });
        var cksnap = this._assembleWithInstructor();
        this._broadcast(cksnap);
        return cksnap;
      }
      case 'stop_checklist': {
        if (this.instructor.stopChecklist) this.instructor.stopChecklist();
        var cssnap = this._assembleWithInstructor();
        this._broadcast(cssnap);
        return cssnap;
      }
      case 'checklist_check': {
        if (this.instructor.checklistCheck) this.instructor.checklistCheck(command.index);
        var ccsnap = this._assembleWithInstructor();
        this._broadcast(ccsnap);
        return ccsnap;
      }
      case 'stop_scenario':
      case 'stop_follow': {
        if (this.instructor.unload) this.instructor.unload();
        this.checkpoints = [];
        this._rewindCursor = null;
        var snap2 = this._assembleWithInstructor();
        this._broadcast(snap2);
        return snap2;
      }
      // Rewind (Gameplay §7.2): pop back to an in-memory checkpoint. Distinct
      // from file save/load — this is the constructive-failure loop.
      case 'rewind': {
        var rsnap = this._rewind(command.steps || 1, command.scope || 'full', !!command.exact);
        if (!rsnap) return { type: 'error', code: 'COMMAND_ERROR', message: 'no checkpoint to rewind to', received: command };
        return rsnap;
      }
      default:
        // Plant / operator commands descend the stack from the Instructor slot (HR5).
        if (!this.engine) return { type: 'error', code: 'COMMAND_ERROR', message: 'no active plant', received: command };
        return this.instructor.handleCommand(command);
    }
  };

  // ------------------------------------------------------------- lifecycle (§6)
  SimulationService.prototype.start = function () {
    if (this.running) return;
    this.running = true;
    this._reschedule();
  };
  SimulationService.prototype.stop = function () {
    this.running = false;
    if (this._timer != null) { clearTimeout(this._timer); this._timer = null; }
  };
  // Self-rescheduling timer so a cadence change takes effect on the next tick.
  // (Browser/Node both have setTimeout; tests drive tick() directly instead.)
  SimulationService.prototype._reschedule = function () {
    if (!this.running) return;
    if (this._timer != null) clearTimeout(this._timer);
    var self = this;
    this._timer = setTimeout(function () { self.tick(); self._reschedule(); }, this.broadcastMs);
  };

  // ----------------------------------------------------------- broadcast (§10)
  SimulationService.prototype.subscribe = function (cb) {
    this.subscribers.push(cb);
    var self = this;
    return function () { var i = self.subscribers.indexOf(cb); if (i !== -1) self.subscribers.splice(i, 1); };
  };
  SimulationService.prototype._broadcast = function (snap) {
    for (var i = 0; i < this.subscribers.length; i++) this.subscribers[i](snap);
  };

  // ------------------------------------------------------------- save/restore (§8)
  SimulationService.prototype.saveState = function () {
    return {
      schema_version: '1.0',
      metadata: {
        sim_time: this.simTime, time_acceleration: this.timeAcceleration,
        plant_id: this.activePlantId, design_version: this.activeDesignVersion,
        register: this.activeRegister,
      },
      engine: this.engine.saveState(),                 // physics + instrument lag + PRNG (the bulk)
      control_failure: this.layer.saveState(),         // active failures, alarm states, rps
      instructor: this.instructor.saveState(),         // beat/scenario progress (trivial for the default)
    };
  };

  SimulationService.prototype.loadState = function (state) {
    if (!state || !state.metadata) return { type: 'error', code: 'COMMAND_ERROR', message: 'bad save state', received: state };
    if (!engineCtor(state.metadata.plant_id)) return { type: 'error', code: 'COMMAND_ERROR', message: 'unknown plant_id in save', received: state.metadata.plant_id };
    this.checkpoints = [];             // a user file-load invalidates the rewind ring
    this._rewindCursor = null;
    return this._restore(state, false);
  };

  // Shared restore core (file load + rewind). skipInstructor = the 'world'
  // rewind scope: the plant rolls back, the Instructor keeps its progress —
  // its time anchors are rebased so delay/time triggers don't chase a future
  // timestamp.
  SimulationService.prototype._restore = function (state, skipInstructor, silent) {
    var m = state.metadata;
    var Ctor = engineCtor(m.plant_id);
    // Reconstruct the right engine + config for this plant, then restore each layer.
    this.engine = new Ctor({ initial_state: 'hot_full_power', design_version: m.design_version || null, seed: this.seed });
    this.layer = new RD.ControlLayer(this.engine, this.engine.getProtectionConfig());
    if (this.instructor.connect) this.instructor.connect(this.layer);

    this.engine.loadState(state.engine);
    this.layer.loadState(state.control_failure);
    if (!skipInstructor) {
      this.instructor.loadState(state.instructor);
      this.activeRegister = m.register || 'learning';
    }

    this.activePlantId = m.plant_id;
    this.activeDesignVersion = m.design_version || null;
    this.simTime = m.sim_time;
    this.timeAcceleration = m.time_acceleration;
    this._prevTrueState = null;
    this._prevAlarms = null;
    this._prevScrammed = false;
    this._prevFailureIds = null;
    this.broadcastMs = NORMAL_MS;
    if (skipInstructor && this.instructor.rebaseTime) this.instructor.rebaseTime(this.simTime);

    // silent (in-tick instructor rewind): do NOT step the Instructor or broadcast
    // again — the caller (_assembleWithInstructor) reassembles and tick() broadcasts
    // once. Assemble without stepping so the return value is a valid rolled-back snap.
    if (silent) return this.assembleSnapshot();

    var snap = this._assembleWithInstructor();
    this._broadcast(snap);
    return snap;
  };

  // Convenience for tests / headless drivers: advance N broadcast cycles
  // synchronously (no timers), honoring play/pause via `running`.
  SimulationService.prototype.advanceCycles = function (n) {
    var last = null;
    var wasRunning = this.running;
    this.running = true;
    for (var i = 0; i < n; i++) last = this.tick();
    this.running = wasRunning;
    return last;
  };

  RD.SimulationService = SimulationService;
  RD.DefaultInstructor = DefaultInstructor;

})(globalThis.RD || (globalThis.RD = {}));
