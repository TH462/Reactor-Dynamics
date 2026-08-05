/*
 * ops_harness.js — shared harness for the external OPERATIONS test suites
 * (test/ops_pwr.js, ops_rbmk.js, ops_bwr.js; run via test/run_ops.js).
 *
 * These suites are distinct from each engine's §14/§18/§19 acceptance gate:
 * the engine suites prove the physics in isolation (engine-direct, no layers);
 * the ops suites measure how the sim BEHAVES WHEN OPERATED — realistic plant
 * evolutions and player-abuse sequences — to arbitrate the "realistic but
 * forgiving" tuning. They therefore run each engine UNDER the real Control &
 * Failure Layer (M4), so trips, auto-actuation, interlocks, command
 * interception, and alarms behave exactly as in the assembled sim.
 *
 * M5 parity: physics always steps at the fixed 0.02 s dt (M5 deviation note —
 * acceleration is MORE steps per broadcast, never a bigger dt), and protection
 * evaluates on a SIM-time cadence capped at M5's PROTECTION_DT (0.1 s) — so the
 * harness evaluates M4 every 5 physics steps at EVERY acceleration, reproducing
 * what a player gets. Until #153 this read `accel·5` steps, mirroring an M5 that
 * evaluated once per broadcast; that made protection latency a function of the UI
 * speed button, and above 600× the PWR's 120 % high-flux trip was never evaluated
 * while the excursion was happening. `accel` still varies command timing and the
 * automation/evaluation interleave, so it is not a no-op parameter.
 *
 * Recorder: every sample interval (0.5 sim-s default) the harness updates
 * min/max for every numeric true_state field, captures first-activation times
 * for every alarm id, the first RPS trip, engine scram/melt, and the first
 * non-finite value anywhere in true_state (numerical-stability guard).
 *
 * Attaches RD.OpsHarness and RD.OpsTest helpers.
 */
;(function (RD) {
  'use strict';

  var DT = 0.02;
  var BROADCAST_WALL_S = 0.1;   // M5 NORMAL_MS = 100 ms
  var PROTECTION_DT = 0.1;      // M5 PROTECTION_DT — protection's sim-time cadence cap (#153)

  function engineCtor(plant) {
    if (plant === 'pwr') return RD.PWREngine;
    if (plant === 'rbmk') return RD.RBMKEngine;
    if (plant === 'bwr') return RD.BWREngine;
    throw new Error('unknown plant: ' + plant);
  }

  function OpsHarness(opts) {
    opts = opts || {};
    this.plant = opts.plant;
    this.version = opts.version || null;
    var Ctor = engineCtor(opts.plant);
    this.eng = new Ctor({
      initial_state: opts.initial,
      design_version: opts.version || null,
      seed: opts.seed != null ? opts.seed : 0xC0FFEE,
    });
    this.cfl = new RD.ControlFailureLayer(this.eng, this.eng.getProtectionConfig());
    this.dt = DT;
    this.accel = opts.accel || 1;
    // M5 parity, post-#153: protection is on a SIM-time cadence capped at
    // PROTECTION_DT, so the interval no longer scales with `accel` at all. Keeping
    // the old `accel × broadcast` form here would leave the ops suites certifying a
    // plant no player can produce — the inverse of #209, and the same class of error.
    this.evalEvery = Math.max(1, Math.round(Math.min(this.accel * BROADCAST_WALL_S, PROTECTION_DT) / DT));
    this.sampleEvery = opts.sampleEvery != null ? opts.sampleEvery : 0.5;   // sim-s
    this._stepCount = 0;
    this._nextSample = 0;
    this.simTime = 0;

    // -------- recorder state --------
    this.watch = {};          // field -> { min, max, tmin, tmax }
    this.alarmFirst = {};     // alarm id -> first sim time seen active
    this.tripTime = null;     // first RPS trip (M4) time
    this.tripReason = null;
    this.scramTime = null;    // first engine s.scrammed time (manual or RPS)
    this.meltTime = null;
    this.firstNaN = null;     // { field, time }
    this.blockedCount = 0;    // interlock-refused commands
    this.cmdErrors = [];      // COMMAND_ERROR returns (always a test-authoring bug)

    // ---- THE SHIPPED LINEUP (issue #209) -------------------------------------
    // Mirror what M5 selectPlant does, in the same order (simulation_service.js
    // :152-159). Without this the harness runs a plant NO PLAYER CAN PRODUCE:
    // `engageDefaults()` and `stepAutomation()` have exactly one production caller
    // each, both in M5, so a harness that stops at M4 has the automation-channel
    // runtime never ticking and no channel ever engaged — while `feed_sg` (the
    // three-element controller that REPLACES coupled feed as the level backbone),
    // `cvcs_makeup` and `boron_conc` are all `defaultOn` in the shipped app.
    // `getStartupLineup()` is the engine-side half (PWR letdown Orifice A; load
    // mode MANUAL at the Mode-1 presets).
    //
    // opts.noDefaults reproduces the OLD bare lineup — and the campaign/walkthrough
    // one, since `start_scenario` passes noDefaults too. Probes that deliberately
    // test hand control should pass it and say why.
    this.noDefaults = !!opts.noDefaults;
    if (!this.noDefaults) {
      if (this.cfl.engageDefaults) this.cfl.engageDefaults();
      if (this.eng.getStartupLineup) {
        var lineup = this.eng.getStartupLineup() || [];
        for (var li = 0; li < lineup.length; li++) this.cfl.handleCommand(lineup[li]);
      }
    }

    this.cfl.evaluate(this.eng.getInstruments());
    this._sample();
  }

  // ---------------------------------------------------------------- accessors
  OpsHarness.prototype.ts  = function () { return this.eng.getTrueState(); };
  OpsHarness.prototype.ins = function () { return this.eng.getInstruments(); };
  OpsHarness.prototype.ctl = function () { return this.eng.getControlState(); };
  OpsHarness.prototype.rps = function () { return this.cfl.getRpsState(); };
  OpsHarness.prototype.alarms = function () { return this.cfl.getSnapshotSections().alarms; };
  OpsHarness.prototype.t = function () { return this.simTime; };

  // Command descends through M4 (interlocks + interception), exactly like the UI.
  OpsHarness.prototype.cmd = function (action, params) {
    var c = { action: action };
    if (params) for (var k in params) c[k] = params[k];
    var r = this.cfl.handleCommand(c);
    if (r && r.type === 'blocked') this.blockedCount++;
    // 'refused' (ACTION_LOCKED) is recorded alongside 'error' (#376): a lockout a
    // probe never meant to hit is the same authoring bug as a typo'd action, and it
    // was invisible to checkSanity's rejected-command guard — neither branch saw it.
    if (r && (r.type === 'error' || r.type === 'refused') && this.cmdErrors.length < 5) {
      this.cmdErrors.push(action + ': ' + (r.message || r.code || r.type));
    }
    return r;
  };

  // ------------------------------------------------------------------ stepping
  // run(seconds[, onSample]) — advance sim time; onSample(h, t) fires every
  // sample interval and is where scripted-operator logic lives.
  OpsHarness.prototype.run = function (seconds, onSample) {
    var n = Math.round(seconds / DT);
    for (var i = 0; i < n; i++) {
      // M5 tick order (simulation_service.js:172-179), and it matters: the channels
      // run at PHYSICS rate reading the PREVIOUS step's instruments, then the engine
      // steps, then M4 evaluates trips/alarms on the new readings once per broadcast.
      // Ticking automation here is the other half of #209 — engaging channels at
      // construction does nothing if their runtime never runs.
      if (!this.noDefaults && this.cfl.stepAutomation) this.cfl.stepAutomation(DT);
      this.eng.step(DT);
      this.simTime += DT;
      this._stepCount++;
      if (this._stepCount % this.evalEvery === 0) this.cfl.evaluate(this.eng.getInstruments());
      if (this.simTime >= this._nextSample - 1e-9) {
        this._sample();
        if (onSample) onSample(this, this.simTime);
      }
    }
    return this;
  };

  // runUntil(pred, maxSeconds[, onSample]) → sim-seconds elapsed in THIS call,
  // or -1 on timeout. pred(true_state, instruments, harness).
  OpsHarness.prototype.runUntil = function (pred, maxSeconds, onSample) {
    var n = Math.round(maxSeconds / DT), t0 = this.simTime;
    for (var i = 0; i < n; i++) {
      if (!this.noDefaults && this.cfl.stepAutomation) this.cfl.stepAutomation(DT);   // M5 tick order — see run()
      this.eng.step(DT);
      this.simTime += DT;
      this._stepCount++;
      if (this._stepCount % this.evalEvery === 0) this.cfl.evaluate(this.eng.getInstruments());
      if (this.simTime >= this._nextSample - 1e-9) {
        this._sample();
        if (onSample) onSample(this, this.simTime);
      }
      if (pred(this.eng.getTrueState(), this.eng.getInstruments(), this)) return this.simTime - t0;
    }
    return -1;
  };

  // ------------------------------------------------------------------ recorder
  OpsHarness.prototype._sample = function () {
    this._nextSample = this.simTime + this.sampleEvery;
    var ts = this.eng.getTrueState(), k, v;
    for (k in ts) {
      v = ts[k];
      if (typeof v !== 'number') continue;
      if (!isFinite(v)) {
        // reactor_period_s is legitimately Infinity at steady state — skip it.
        if (k !== 'reactor_period_s' && !this.firstNaN) this.firstNaN = { field: k, time: this.simTime };
        continue;
      }
      var w = this.watch[k];
      if (!w) this.watch[k] = { min: v, max: v, tmin: this.simTime, tmax: this.simTime };
      else {
        if (v < w.min) { w.min = v; w.tmin = this.simTime; }
        if (v > w.max) { w.max = v; w.tmax = this.simTime; }
      }
    }
    var st = this.cfl.alarmStates || {};
    for (k in st) {
      if (st[k] !== 'clear' && this.alarmFirst[k] == null) this.alarmFirst[k] = this.simTime;
    }
    if (this.tripTime == null && this.cfl.rps.scrammed) {
      this.tripTime = this.simTime;
      this.tripReason = this.cfl.rps.last_trip_reason;
    }
    if (this.scramTime == null && ts.scrammed) this.scramTime = this.simTime;
    if (this.meltTime == null && ts.melted) this.meltTime = this.simTime;
  };

  // Range of a watched field: h.range('power_pct').max etc. (null-safe).
  OpsHarness.prototype.range = function (field) {
    return this.watch[field] || { min: NaN, max: NaN, tmin: -1, tmax: -1 };
  };

  OpsHarness.prototype.alarmFired = function (id) { return this.alarmFirst[id] != null; };

  // ============================================================ test plumbing
  // Same result shape as the engine suites: { name, pass, checks: [...] }.
  function near(a, b, tol) { return Math.abs(a - b) <= tol; }

  function test(name, fn) {
    var checks = [];
    var ck = function (desc, observed, pass, expected) {
      checks.push({ desc: desc, observed: String(observed), expected: String(expected), pass: !!pass });
    };
    // info(desc, observed) — a measurement recorded for the tuning report; never fails.
    ck.info = function (desc, observed) {
      checks.push({ desc: desc, observed: String(observed), expected: 'recorded', pass: true, info: true });
    };
    try { fn(ck); } catch (e) { ck('threw: ' + (e && e.message), String(e && e.stack || e), false, 'no throw'); }
    var pass = checks.every(function (c) { return c.pass; });
    return { name: name, pass: pass, checks: checks };
  }

  // Standard no-corruption assertions every scenario should end with.
  function checkSanity(ck, h) {
    ck('no non-finite value in true_state',
      h.firstNaN ? (h.firstNaN.field + ' @ ' + h.firstNaN.time.toFixed(1) + 's') : 'none',
      !h.firstNaN, 'none');
    if (h.cmdErrors.length) {
      ck('no rejected commands (test-authoring guard)', h.cmdErrors.join(' | '), false, 'none');
    }
    // Physical invariants that must hold for ANY final state (guarded by field
    // presence so the RBMK/BWR probes, which lack these fields, skip them). These
    // are algebraic truths — a violation means a structural regression, so wiring
    // them here makes every ops probe a passive guard for the recent reworks.
    var t = h.ts();
    if (t.p_coldleg != null && t.p_hotleg != null && t.p_pumpsuction != null) {
      // Loop pressure distribution: pump discharge (cold) is the highest node and
      // pump suction the lowest; they collapse to equal on coastdown (hence ≤).
      ck('loop pressure nodes ordered (suction ≤ hot ≤ cold)',
        t.p_pumpsuction.toFixed(3) + ' ≤ ' + t.p_hotleg.toFixed(3) + ' ≤ ' + t.p_coldleg.toFixed(3),
        t.p_pumpsuction <= t.p_hotleg + 1e-6 && t.p_hotleg <= t.p_coldleg + 1e-6, 'ordered');
    }
    if (t.boron_ppm != null) {
      ck('boron concentration non-negative', t.boron_ppm.toFixed(1), t.boron_ppm >= 0, '≥ 0');
    }
    if (t.core_inventory_pct != null) {
      ck('primary inventory within tank bounds', t.core_inventory_pct.toFixed(1),
        t.core_inventory_pct >= -0.01 && t.core_inventory_pct <= 130, '0–130 %');
    }
  }

  function fmt(x, d) { return (x == null || !isFinite(x)) ? String(x) : x.toFixed(d != null ? d : 2); }

  RD.OpsHarness = OpsHarness;
  RD.OpsTest = { test: test, near: near, fmt: fmt, checkSanity: checkSanity };

})(globalThis.RD || (globalThis.RD = {}));
