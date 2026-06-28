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
  var NORMAL_MS = 500;             // 2 Hz broadcast
  var TRANSIENT_MS = 200;          // 5 Hz during an active transient (§7)
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
    this._timer = null;

    if (opts.plant_id) {
      this.selectPlant(opts.plant_id, opts.initial_state || 'hot_full_power', opts.design_version || null);
    }
  }

  // ------------------------------------------------- plant selection / reset (§6)
  SimulationService.prototype.selectPlant = function (plantId, initialState, designVersion) {
    var Ctor = engineCtor(plantId);
    if (!Ctor) return { type: 'error', code: 'COMMAND_ERROR', message: 'unknown plant_id', received: plantId };

    // 1. Construct the engine and extract its protection config.
    this.engine = new Ctor({ initial_state: initialState, design_version: designVersion || null, seed: this.seed });
    var config = this.engine.getProtectionConfig();
    // 2. (Re)build the Control & Failure Layer for this plant (M4 holds no plant state).
    this.layer = new RD.ControlFailureLayer(this.engine, config);
    // 3. Wire the Instructor slot to the new layer.
    if (this.instructor.connect) this.instructor.connect(this.layer);
    // 4. Initial state already loaded by the engine constructor; reset run state.
    this.activePlantId = plantId;
    this.activeDesignVersion = designVersion || null;
    this.simTime = 0;
    this._prevTrueState = null;
    this._prevAlarms = null;
    this.broadcastMs = NORMAL_MS;
    // Restore the selected register into the rebuilt layer/instructor.
    this.layer.handleCommand({ action: 'set_register', value: this.activeRegister });
    if (this.instructor.setRegister) this.instructor.setRegister(this.activeRegister);

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
    for (var i = 0; i < steps; i++) this.engine.step(PHYSICS_DT);
    this.layer.evaluate(this.engine.getInstruments());      // trips/actuations/alarms on the new readings (HR1)
    this.simTime += steps * PHYSICS_DT;

    var snap = this._assembleWithInstructor();
    this._broadcast(snap);
    this._updateCadence(snap);
    return snap;
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
    snap.instructor = this.instructor.getMessage();
    return snap;
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
      instructor: this.instructor.getMessage(),
    };
  };

  // ---------------------------------------------------- transient cadence (§7)
  SimulationService.prototype._updateCadence = function (snap) {
    var transient = this._isActiveTransient(snap);
    this.broadcastMs = transient ? TRANSIENT_MS : NORMAL_MS;
    this._prevTrueState = snap.true_state;
    this._prevAlarms = snap.alarms;
    if (this.running && this._timer != null) this._reschedule();
  };

  SimulationService.prototype._isActiveTransient = function (snap) {
    var prev = this._prevTrueState;
    if (!prev) return false;
    if (Math.abs(snap.true_state.power_pct - prev.power_pct) > 1.0) return true;
    if (Math.abs(primaryPressure(snap.true_state) - primaryPressure(prev)) > 0.14) return true;
    return this._anyAlarmNewlyFiring(snap.alarms, this._prevAlarms);
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
    var m = state.metadata;
    // Reconstruct the right engine + config for this plant, then restore each layer.
    var Ctor = engineCtor(m.plant_id);
    if (!Ctor) return { type: 'error', code: 'COMMAND_ERROR', message: 'unknown plant_id in save', received: m.plant_id };
    this.engine = new Ctor({ initial_state: 'hot_full_power', design_version: m.design_version || null, seed: this.seed });
    this.layer = new RD.ControlFailureLayer(this.engine, this.engine.getProtectionConfig());
    if (this.instructor.connect) this.instructor.connect(this.layer);

    this.engine.loadState(state.engine);
    this.layer.loadState(state.control_failure);
    this.instructor.loadState(state.instructor);

    this.activePlantId = m.plant_id;
    this.activeDesignVersion = m.design_version || null;
    this.activeRegister = m.register || 'learning';
    this.simTime = m.sim_time;
    this.timeAcceleration = m.time_acceleration;
    this._prevTrueState = null;
    this._prevAlarms = null;
    this.broadcastMs = NORMAL_MS;

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
