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

  // Longest SIM time protection may go un-evaluated (#153). Trips, actuations,
  // interlocks and alarms used to be evaluated exactly ONCE per broadcast, so the
  // interval between two protection evaluations was `timeAcceleration × broadcastMs`
  // — a plant property set by a UI speed button. Measured full stack (PWR
  // `50_percent`, `continuous_rod_withdrawal` sev 1.0, seed 42): indicated flux sits
  // above its 120 % setpoint for only 8.74 sim s, so at 1×/10×/60× the plant tripped
  // on `power_range high` at 9.1 s; at 256× and 600× that trip was MISSED and the
  // plant tripped 16.5 s / 50.9 s late on `primary_pressure high` — a slower
  // parameter that merely happened to still be over when the evaluation landed; and
  // at 700× and above, including the 3600× the speed selector ships, NOTHING fired:
  // one evaluation every 360 sim s, the whole 135.9 % excursion inside a single
  // broadcast, `scrammed` still false on the far side of it.
  //
  // 0.1 s is chosen so 1× is BYTE-IDENTICAL to the old path: a 1× broadcast is
  // 0.1 sim s = 5 steps, the accumulator reaches the cap exactly on the final step,
  // and the `i < steps - 1` guard below hands that evaluation to the existing
  // post-loop call. Above 1× it is the point of the fix.
  //
  // The attention-stop dropout is NOT a substitute and never could be: it is computed
  // in `_assembleWithInstructor`, from the snapshot assembled AFTER the cycle has
  // already run, so it drops the clock one full broadcast late — at 3600× that is six
  // plant-minutes after the excursion it was meant to catch.
  //
  // Cost is not the objection it was recorded as. Measured: `layer.evaluate` 7.85 µs
  // against `engine.step` 18.80 µs, so a 3600× cycle (18 000 steps, 338 ms of step)
  // pays +1.4 ms, **+0.4 %**. Evaluating every step would be +42 % and buys nothing —
  // instrument lag is coarser than 0.1 s.
  var PROTECTION_DT = 0.1;

  // ---------------------------------------------------- FINE CHART SAMPLING (2026-08-05)
  // The strip chart used to see exactly ONE sample per broadcast, so its resolution in SIM
  // time was `timeAcceleration × broadcastMs` — 0.1 s at 1×, but 6 s at 60× and 360 s at
  // 3600×. Measured against the chart's own geometry (344 buckets across the window), that
  // is 4.36 samples per plot pixel at 1× and **0.15 at 60×**: one vertex every seven pixels,
  // with the polyline interpolating straight through everything between. A relief-valve lift
  // lasting three seconds fell entirely between two samples and left no mark at all.
  //
  // The fix is to sample where the fine time actually exists. This loop already steps at
  // PHYSICS_DT and already evaluates protection on a SIM-time cadence for exactly the same
  // reason (#153 — the reactor gets the same protection at 3600× as at 1×); the chart now
  // rides that seam. The UI registers a sampler, the service calls it on a fixed sim-time
  // interval, and the samples are handed over with the broadcast.
  //
  // WALL-CLOCK GATING WAS CONSIDERED AND IS WORSE, which is worth recording because it is
  // the intuitive answer: sampling every N ms of wall time gives FEWER samples per sim
  // second as acceleration rises — half the resolution at 10× and a quarter at 60× against
  // this scheme. The ceiling was never the gate, it was the broadcast.
  var CHART_FINE_SEC = 0.2;        // sim-time interval between fine samples — matches the UI's grid
  var CHART_FINE_MAX = 60;         // …but never more than this many per broadcast (see below)
  // MIN/MAX BANDING. Point sampling aliases: a fine sample every 6 s of sim (3600×) still
  // steps straight over a three-second relief lift. So each emitted bucket carries the
  // EXTREMES over its interval, not just one instant — the chart draws the band and the
  // transient is visible however fast the plant is being run.
  //
  // Bounded by a TOTAL per broadcast rather than a count per bucket, because the per-bucket
  // form multiplies: 8 sub-samples × 60 buckets is 480 sampler calls per broadcast, and the
  // sampler walks every series in the profile. A flat ceiling keeps the cost the same at
  // 3600× as at 60× and simply gives coarser extremes where there is more sim time to cover.
  var CHART_SUB_MAX = 240;         // sampler calls per broadcast, total, across all buckets

  // Fold one sampler reading into a bucket accumulator. GENERIC over the reading's shape —
  // it walks whatever side-dicts the sampler returned ({v, tv} today) and tracks the last
  // value plus the extremes per key, so the service never learns what a "series" is and a
  // new plotted quantity needs no change here. Keys that are null (a series with no reading
  // on that side) stay out of the extremes entirely rather than poisoning them with nulls.
  function foldExtremes(acc, one) {
    if (!one) return acc;
    if (!acc) {
      acc = { t: 0, v: like(one.v), tv: like(one.tv), lo: like(one.v), hi: like(one.v),
              tlo: like(one.tv), thi: like(one.tv) };
    }
    foldSide(one.v, acc.v, acc.lo, acc.hi);
    foldSide(one.tv, acc.tv, acc.tlo, acc.thi);
    return acc;
  }
  // An empty accumulator of the same SHAPE as the reading — a NaN-filled typed array of the
  // same width for a packed side, a plain dict for a keyed one. The genericity above is what
  // is being preserved: the service still never learns what a series is, it only matches the
  // container the sampler handed it. (The UI packs its rows into Float64Arrays; see chartBuf
  // in ui/app.js for why.)
  function like(src) {
    if (!src) return {};
    if (ArrayBuffer.isView(src)) { var a = new Float64Array(src.length); a.fill(NaN); return a; }
    return {};
  }
  function foldSide(src, last, lo, hi) {
    if (!src) return;
    if (ArrayBuffer.isView(src)) {
      for (var i = 0; i < src.length; i++) {
        var y = src[i];
        if (!isFinite(y)) continue;              // NaN = this series has no reading on this side
        last[i] = y;
        // Written as NEGATED comparisons on purpose: `lo[i]` starts as NaN and every
        // comparison against NaN is false, so `y < lo[i]` would never seed the first value.
        if (!(y >= lo[i])) lo[i] = y;
        if (!(y <= hi[i])) hi[i] = y;
      }
      return;
    }
    for (var k in src) {
      if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
      var x = src[k];
      if (x == null || !isFinite(x)) continue;
      last[k] = x;
      if (lo[k] === undefined || x < lo[k]) lo[k] = x;
      if (hi[k] === undefined || x > hi[k]) hi[k] = x;
    }
  }

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
    this._fineSampler = null;   // set by setFineSampler(); see the CHART note above
    this._fineBuf = [];

    this.engine = null;
    this.layer = null;                 // M4
    this.activePlantId = null;
    this.activeDesignVersion = null;
    this.activeRegister = 'learning';

    this.simTime = 0;
    this._fineBuf = [];   // timeline moved — stale sub-samples must not splice in
    this.timeAcceleration = 1.0;
    // True while the CURRENT acceleration was requested by a scenario beat (an
    // authored fast-forward), false once the user touches the speed control. A
    // beat-authored FF must ride THROUGH the alarm cascade of a scripted transient
    // (TMI-2's subcooling/level alarms) instead of snapping back on every new
    // annunciator — see _assembleWithInstructor's attention-stop below.
    this._authoredSpeed = false;
    // Attention stops on/off (Settings → Fast-forward). A player who wants the clock
    // to keep running through a casualty turns this off; scram, failures and alarms
    // then annunciate as normal but never touch the acceleration.
    this.attentionStops = opts.attention_stops !== false;
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
    this._rewindCursor = null;         // last rewound-to index; walks consecutive beat rewinds back
    this._lastSandboxCpMs = null;      // wall clock of the last free-play checkpoint (#137)

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
    this._fineBuf = [];   // timeline moved — stale sub-samples must not splice in
    this._prevTrueState = null;
    this._prevAlarms = null;
    this._prevScrammed = false;
    this._prevFailureIds = null;
    this.broadcastMs = NORMAL_MS;
    this.checkpoints = [];             // a fresh plant invalidates the rewind ring
    this._rewindCursor = null;
    this._lastSandboxCpMs = null;
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
    // PHYSICS COST, measured here because only this function knows where the step loop
    // begins and ends. Recorded on the SERVICE INSTANCE, deliberately not on the snapshot:
    // the snapshot is a contract (CONTEXT.md §6.3, gated by run_contract) and a profiling
    // number has no business in it. The UI reads `_perfStepMs` if it cares; nothing breaks
    // if it does not. Two clock reads per broadcast — see ui/perf.js on why this has to be
    // cheap enough not to appear in its own measurement.
    var _perfT0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
    var steps = this._stepsPerBroadcast();
    var sinceEval = 0;
    // Fine chart sampling. The interval is the LARGER of the fixed sim-time grid and what
    // fits in the per-broadcast cap, so resolution is constant in sim time at ordinary
    // speeds and degrades gracefully instead of exploding at extreme ones: at 60× the
    // broadcast carries 6 s of sim and yields 30 samples at 0.2 s; at 3600× it carries 360 s
    // and yields 60 at 6 s — still ~1 per plot pixel on the widest window, where the OLD
    // path gave one sample per 360 s. Cost is bounded by CHART_FINE_MAX at any acceleration.
    var fineEvery = 0, subEvery = 0;
    if (this._fineSampler) {
      var simPerBroadcast = steps * PHYSICS_DT;
      fineEvery = Math.max(CHART_FINE_SEC, simPerBroadcast / CHART_FINE_MAX);
      subEvery = Math.max(PHYSICS_DT, simPerBroadcast / CHART_SUB_MAX);
      if (subEvery > fineEvery) subEvery = fineEvery;   // at least one sample per bucket
    }
    var sinceFine = 0, sinceSub = 0, acc = null;
    for (var i = 0; i < steps; i++) {
      // Automation channels run in-stack at physics rate (fixed sim-time
      // cadence inside), reading the previous step's instruments — so
      // controllers behave identically at any time acceleration.
      if (this.layer.stepAutomation) this.layer.stepAutomation(PHYSICS_DT);
      this.engine.step(PHYSICS_DT);
      // Protection is on a SIM-time cadence, not a per-broadcast one (#153): the
      // reactor gets the same protection at 3600× as at 1×. The last step is left
      // to the post-loop call below so the evaluation the snapshot is assembled
      // from is always the one taken on the final readings — that also makes 1×
      // (5 steps, cap reached exactly at i = 4) identical to the old single call.
      // `getInstruments()` is a pure read of `instruments.reading`; the noise PRNG
      // advances inside `engine.step`, so evaluating more often perturbs no stream.
      sinceEval += PHYSICS_DT;
      // Fine chart sample. Taken INSIDE the step loop, after the step, so it sees the plant
      // at that sim instant rather than only at broadcast boundaries. The sampler is the
      // UI's, and it returns whatever small object it needs — the service never learns what
      // a "series" is. Skipped on the last step: the post-loop broadcast carries that
      // instant anyway, and sampling it twice would double-weight it in the chart's buckets.
      sinceFine += PHYSICS_DT;
      sinceSub += PHYSICS_DT;
      if (subEvery && sinceSub >= subEvery - 1e-9) {
        acc = foldExtremes(acc, this._fineSampler(
          this.engine.getInstruments(), this.engine.getTrueState(),
          this.engine.getControlState ? this.engine.getControlState() : null));
        sinceSub = 0;
      }
      if (fineEvery && acc && sinceFine >= fineEvery - 1e-9 && i < steps - 1) {
        acc.t = this.simTime + (i + 1) * PHYSICS_DT;
        this._fineBuf.push(acc);
        acc = null;
        sinceFine = 0;
      }
      if (sinceEval >= PROTECTION_DT && i < steps - 1) {
        // `sinceEval` is the SIM time this evaluation covers, and it is passed so the alarm
        // minimum on-time accrues in plant seconds rather than in evaluations. That is what
        // makes the hold identical at 1x and at 3600x — the same property #153 established
        // for the protection cadence itself, and for the same reason.
        this.layer.evaluate(this.engine.getInstruments(), sinceEval);
        sinceEval = 0;
      }
    }
    // The final evaluation covers whatever sim time has accrued since the last one — NOT
    // PROTECTION_DT, which would over-count at 1x where the loop above never fires.
    this.layer.evaluate(this.engine.getInstruments(), sinceEval);   // trips/actuations/alarms on the new readings (HR1)
    this.simTime += steps * PHYSICS_DT;

    // Stop the clock BEFORE broadcasting: subscribers run synchronously inside _broadcast,
    // so timing past this point would fold the UI's render into the physics figure and
    // make every transient look compute-bound. Separating the two stages is the whole
    // reason the measurement exists.
    if (_perfT0) {
      this._perfStepMs = performance.now() - _perfT0;
      this._perfSteps = steps;
    }

    var snap = this._assembleWithInstructor();
    this._broadcast(snap);
    this._updateCadence(snap);
    this._maybeSandboxCheckpoint();
    return snap;
  };

  // Sandbox rewind (free play): with no scenario/walkthrough loaded the ring
  // fills on a fixed cadence instead of beat boundaries, so the player can
  // always jump back. Never runs while the Instructor owns the ring — an
  // authored rewind's step arithmetic depends on exact ring contents.
  //
  // The cadence is REAL time, not sim time (#137, OWNER 2026-07-31: "The rewind
  // cadence should be 20 seconds real time not sim time."). A sim-time cadence
  // made the ring span REWIND_CAP × spacing of *sim* seconds at every
  // acceleration, so the faster you ran the less of your own life you could go
  // back through — measured, the whole 32-slot ring covered 465.9 s of real time
  // at 1× but only 3.1 s at 600×, which is precisely the case (a long
  // fast-forward) where the player needs to reach back. On a wall clock the ring
  // always spans about REWIND_CAP × 20 s ≈ 10.7 minutes of the player's life,
  // and each slot covers more sim the faster you run.
  //
  // Measured off tick(), not off a timer, so a throttled or backgrounded tab
  // simply lays the checkpoint on its first tick after the interval rather than
  // losing it. `_now` is a seam so tests can drive the clock (a headless runner
  // burns no wall time, so a real Date.now() cadence would never fire).
  var SANDBOX_CP_SPACING_MS = 20000;
  SimulationService.prototype._now = function () { return Date.now(); };
  SimulationService.prototype._maybeSandboxCheckpoint = function () {
    if (this.instructor && this.instructor.mode) return;
    var now = this._now();
    if (this._lastSandboxCpMs != null && now - this._lastSandboxCpMs < SANDBOX_CP_SPACING_MS) return;
    this._lastSandboxCpMs = now;
    this._pushCheckpoint();
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
    // A newly-firing alarm normally snaps FF back so the operator can react — but a
    // scenario that AUTHORED this fast-forward (beat.speed) is deliberately running
    // through a scripted transient whose whole point is a cascade of alarms; letting
    // each one drop the clock made authored skips stutter to a halt (issue #105).
    // A genuine scram or new failure still hard-stops even under an authored FF.
    if (stop === 'alarm' && this._authoredSpeed) stop = null;
    if (stop && this.timeAcceleration > 1) {
      this.timeAcceleration = 1.0;
      this._authoredSpeed = false;
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
    if (sp != null) { this.timeAcceleration = sp; this._authoredSpeed = (sp > 1); }
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
      // Consecutive rewinds with no new progress between them (no checkpoint
      // pushed) walk back one boundary each. Without this, the broadcasts that
      // tick in between defeat the exact-time guard above and every one restores
      // the same newest checkpoint — the state could never be escaped.
      //
      // This is now a BEAT-path guard only. Every player-facing rewind is a pick
      // (`exact`) since #137, so no repeated single press reaches here; what does
      // is two `rewind:` beats firing with no beat between them, because a rewind
      // beat deliberately does not also checkpoint (instructor_layer :295-299).
      if (this._rewindCursor != null && idx >= this._rewindCursor) idx = this._rewindCursor - 1;
    }
    var target = idx >= 0 ? this.checkpoints[idx] : null;
    if (!target) return null;
    this.checkpoints.length = idx + 1;
    this._rewindCursor = idx;
    // The rewound-to moment is the new present: restart the free-play cadence from
    // here, so the next sandbox checkpoint lands a full interval later instead of
    // immediately on top of the target.
    this._lastSandboxCpMs = this._now();
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
        attention_stops: this.attentionStops,    // Settings → does an event drop fast-forward?
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
      // Live interlock state (#306) — display-only, so a board can report a STANDING block
      // instead of only the refusal you get by running into one. Not serialized: the kernel
      // owns `interlockActive` and re-latches it from instruments on restore.
      interlocks: this.layer.getInterlockState ? this.layer.getInterlockState() : [],
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
  /* Attention stop — the events that drop fast-forward back to real time.
     A scram and a newly-arrived failure are discrete, once-only events and always
     stop the clock.

     An ALARM only stops it on an otherwise QUIET BOARD. This is what an annunciator
     is actually for: it draws the eye to a new condition on a normal board. Once the
     board is lit and the operator is inside a casualty working procedures, the alarms
     that follow are the consequences they are already handling — and stopping for each
     one made fast-forward unusable exactly when it is most wanted (a large-break LOCA
     dropped the clock 5 times in its first 3 minutes, a loss of feedwater 6 times).
     Under this rule the same LOCA stops once, on the scram.

     Standing alarms therefore suppress alarm-stops for as long as they stand — during
     a cooldown, or a Mode 5 heatup with low-pressure alarms latched in, which is
     precisely when a long fast-forward is the point. A scram or a new failure still
     gets through regardless. */
  SimulationService.prototype._attentionStop = function (snap) {
    if (!this._prevTrueState) return null;
    if (!this.attentionStops) return null;          // operator turned dropouts off (Settings)
    if (this._snapScrammed(snap) && !this._prevScrammed) return 'scram';
    if (this._anyNewFailure(snap.active_failures)) return 'failure';
    // …and the arrival has to be one that ASKS for something. A status-class tile
    // arrives already acknowledged (#240 follow-up ruling) because it reports a
    // lineup, not a casualty — yanking the clock out of fast-forward and toasting
    // "new alarm" for one would contradict the tile it just drew. The transient
    // cadence flip above is deliberately left alone: a shorter broadcast interval
    // costs the operator nothing.
    if (this._boardQuiet(this._prevAlarms) && this._anyAlarmNewlyFiring(snap.alarms, this._prevAlarms, true)) return 'alarm';
    return null;
  };

  // No alarm annunciating (acknowledged or not) as of the previous broadcast.
  SimulationService.prototype._boardQuiet = function (alarms) {
    if (!alarms) return true;
    for (var i = 0; i < alarms.length; i++) if (alarms[i].state !== 'clear') return false;
    return true;
  };

  // Scrammed if the protection latched (rps) OR the engine is actually shut down.
  //
  // The second read is NOT what this comment used to claim. It said "a manual scram
  // never sets rps" — that stopped being true when `control_kernel.js:204-207` began
  // latching `rps.scrammed` + reason 'manual scram' on an operator scram, and the
  // stale comment survived the change (#158). Corrected rather than collapsed: the
  // two reads still differ under an ATWS, where the kernel asserts `rps.scrammed`
  // while the engine stays unscrammed, and the `||` keeps this true for both that
  // case and any path that shuts the engine down without the kernel seeing it.
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

  // `requireUnacked`: count only arrivals that reach the board UNACKNOWLEDGED.
  // Nothing but the control layer can produce a clear→acknowledged transition in
  // one broadcast (an operator ack takes a cycle of its own), so that is exactly
  // the set of alarms the plant answered on the operator's behalf.
  SimulationService.prototype._anyAlarmNewlyFiring = function (now, prev, requireUnacked) {
    if (!prev) return false;
    var prevState = {};
    for (var i = 0; i < prev.length; i++) prevState[prev[i].id] = prev[i].state;
    for (var j = 0; j < now.length; j++) {
      var a = now[j];
      var wasClear = !prevState[a.id] || prevState[a.id] === 'clear';
      if (!wasClear || a.state === 'clear') continue;
      if (requireUnacked && a.state !== 'active_unacknowledged') continue;
      return true;
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
      case 'set_speed': this.timeAcceleration = command.value; this._authoredSpeed = false; return null;
      case 'set_attention_stops': this.attentionStops = !!command.value; return null;
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
        this._lastSandboxCpMs = null;   // free play resumes — lay slot 0 on the next tick
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
  // Register the strip chart's sampler. `fn(instruments, true_state, control_state)` is
  // called on a fixed SIM-time interval inside tick() and should return a small plain object
  // — the service stores it verbatim and hands it over with the next broadcast. Pass null to
  // stop sampling; with no sampler registered the loop does no extra work at all, which is
  // what keeps every headless runner and every test harness on the old cost.
  SimulationService.prototype.setFineSampler = function (fn) {
    this._fineSampler = (typeof fn === 'function') ? fn : null;
    if (!this._fineSampler) this._fineBuf = [];
  };

  // Take the fine samples accrued since the last call, and clear. Deliberately NOT part of
  // the snapshot: snapshots are checkpointed into the rewind ring and saved, and an array of
  // sub-samples riding along would bloat both for a purely visual concern. The UI pulls this
  // in its broadcast handler; anything that does not pull simply never accumulates, because
  // nothing registers a sampler.
  SimulationService.prototype.takeFine = function () {
    if (!this._fineBuf.length) return null;
    var out = this._fineBuf;
    this._fineBuf = [];
    return out;
  };

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
    this._lastSandboxCpMs = null;
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
    this._fineBuf = [];   // timeline moved — stale sub-samples must not splice in
    this.timeAcceleration = m.time_acceleration;
    this._authoredSpeed = false;
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
  //
  // *** n IS CYCLES, NOT SECONDS. *** One cycle is `_stepsPerBroadcast()` physics
  // steps = timeAcceleration × (broadcastMs / 1000) of SIM TIME — 0.1 s at the 10 Hz
  // default, and only 0.05 s once `_updateCadence` decides it is in a transient
  // (NORMAL_MS 100 → TRANSIENT_MS 50). So the sim time a cycle buys you is NOT
  // constant within a single run, and `advanceCycles(400)` is 40 s at 1×, not 400 s.
  //
  // If you want a duration, DRIVE OFF `simTime` — `var t = svc.simTime + secs; while
  // (svc.simTime < t) svc.advanceCycles(1);` — do not divide seconds by an assumed
  // cycle length. Two gates were wrong about this: #194 read a settled equilibrium off
  // an 83 s control loop after 40 s and filed a plant defect that did not exist (a
  // non-defect that reached an owner ruling before anyone checked PHYSICS_DT), and
  // #261/run_autoctl's `run(simSeconds)` looped cycles on a "~1 s per cycle at 10×"
  // assumption and delivered 91.7 % of its requested sim time, every shortfall landing
  // inside the transients it was there to measure. See also #245, the same "gate
  // running below its declared sim rate" failure reached through timeAcceleration.
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
