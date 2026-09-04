/* run_warp_tier.js — THE TWO PACING TIERS (#625, 2026-09-04)
 *
 * The service runs PLAY (1x..60x) at PHYSICS_DT = 0.02 s, bit-identical at every speed
 * (run_service_invariance), and WARP (600x and up) at WARP_DT = 0.5 s — the SAME physics at a
 * coarser step, a DECLARED fidelity departure *(OWNER RULING, 2026-09-04: "Yes")*. This gate is
 * what bounds the departure and what proves the tier lets go when it must.
 *
 * FOUR CLAIMS, each with the check that can fail it:
 *   1. FIDELITY.  One sim hour on WARP lands inside a band of the PLAY reference at matched
 *      minutes, in five regimes: steady full power; a scram then decay heat + xenon; hot zero
 *      power; hot shutdown (Mode 4, pumps off, RHR); cold shutdown (Mode 5). The bands are
 *      2x the worst deviation MEASURED 2026-09-04 over 2 h (inbox/625/dt_scan.js) — inside the
 *      instrument noise band on every channel.
 *   2. THE CLIFF IS REAL.  The same leg at a 1.0 s step must BLOW the band — at 1.0 s the quiet
 *      plant trips itself at 18 min. A band that cannot fail is not a band (#485).
 *   3. THE LOCKOUT.  A large break under WARP drops the tier INSIDE the broadcast (steps_done <
 *      steps_requested), credits only the stepped sim time, lands at 60x or below, and refuses
 *      a re-request until the quiet timer runs. A pure rate excursion (no trip, no failure) also
 *      drops it. An authored beat speed never enters WARP.
 *   4. THE STEP BUDGET.  Armed on the timer path, a wall budget stops the loop early and credits
 *      only what it stepped — and the plant is BIT-IDENTICAL with the budget on and off at every
 *      matched instant, because the budget moves broadcast instants and nothing else.
 *   plus THE CADENCE FIX that came with it: `_isRapidChange` is a rate per SIM second, so a quiet
 *      plant at 600x sits on the 100 ms cadence (it sat on 50 ms before — measured).
 *
 * Mutations replay claims 3, 4 and the cadence (cheap); the fidelity legs run once.
 *
 * Run: node test/run_warp_tier.js            (~3 min: the five PLAY reference hours dominate)
 *      node test/run_warp_tier.js --no-mutations
 */
'use strict';
var fs = require('fs'), path = require('path');
var MUT = require('./mut_flags.js');
var R = path.join(__dirname, '..');
var SRC = path.join(R, 'engines', 'pwr2');
if (typeof global.window === 'undefined') global.window = global;
var SVC_PATH = path.join(R, 'layers', 'simulation_service.js');
var SVC_SRC = fs.readFileSync(SVC_PATH, 'utf8').replace(/\r\n/g, '\n');

var loadedOnce = false;
function loadAll(svcSrc) {
  if (!loadedOnce) {
    ['engines/load_mode.js', 'engines/pwr/pwr_config.js', 'layers/control/control_kernel.js',
     'layers/control/pwr_control.js', 'engines/pwr/pwr_instruments.js'].forEach(function (f) {
      require(path.join(R, f));
    });
    ['pwr2_water', 'pwr2_vtable', 'pwr2_geometry', 'pwr2_core', 'pwr2_loop', 'pwr2_sources',
     'pwr2_kinetics', 'pwr2_fuel', 'pwr2_reactor', 'pwr2_sg', 'pwr2_turbine', 'pwr2_relief',
     'pwr2_dumpctl', 'pwr2_condenser', 'pwr2_feedwater', 'pwr2_afw', 'pwr2_cvcs', 'pwr2_eccs',
     'pwr2_rhr', 'pwr2_pressurizer', 'pwr2_break', 'pwr2_containment', 'pwr2_damage',
     'pwr2_protection', 'pwr2_instruments', 'pwr2_true_state', 'pwr2_engine', 'pwr2_shell'
    ].forEach(function (f) { require(path.join(SRC, f + '.js')); });
    require(path.join(R, 'layers', 'instructor_layer.js'));
    loadedOnce = true;
  }
  (0, eval)(svcSrc === undefined ? SVC_SRC : svcSrc);          // eslint-disable-line no-eval
  return globalThis.RD;
}

/* ---- the drive ---------------------------------------------------------------------------- */
function mk(RD, ic, opts) {
  var svc = new RD.SimulationService({ seed: 0x1234 });
  svc.selectPlant('pwr2', ic, null, undefined);
  svc.configurePacing(Object.assign({ warp: true }, opts || {}));
  return svc;
}
function runTo(svc, t, each) { var s = null; var g = 0; while (svc.simTime < t && g++ < 2e6) { s = svc.advanceCycles(1); if (each) each(s); } return s; }
/* the fresh plant rings for ~20 s while its lineup engages (inbox/625/probe.js) — settle first */
function settle(svc, secs) { svc.handleCommand({ action: 'set_speed', value: 10 }); runTo(svc, secs); }

var FIELDS = ['pressure_mpa', 'tavg_c', 'pzr_level_pct', 'power_pct', 'decay_heat_pct',
              'xenon_pct_eq', 'sg_level_pct', 'subcooling_c', 'steam_pressure_mpa'];
/* 2x the worst deviation measured 2026-09-04 over 2 h at 0.5 s (three regimes), in the field's
 * own units. For scale: the pressure channel's noise sigma is 0.02 MPa, level channels 0.3 %. */
var BAND = { pressure_mpa: 0.07, tavg_c: 0.10, pzr_level_pct: 0.70, power_pct: 0.20, decay_heat_pct: 0.01,
             xenon_pct_eq: 0.01, sg_level_pct: 0.60, subcooling_c: 1.00, steam_pressure_mpa: 0.02 };
/* subcooling_c: 0.40 -> 1.00 on the first run. Modes 4 and 5 measured 0.50 / 0.49 degC — the SAME
 * 0.022 MPa (3 psi) pressure deviation as everywhere else, read through the saturation curve at
 * 2.5 MPa where dTsat/dP is ~15 degC/MPa (0.33 degC) plus the 0.07 degC of Tavg. 1.0 degC
 * (1.8 degF) against a Mode 4/5 margin of ~58 degC is what the band now says is harmless.
 * *(OWNER RULING, 2026-09-04: "1A" — keep 1.0 degC, over pressure-only or a Mode 4/5 exemption.)* */

/* one leg: PLAY reference (60x) and WARP (3600x), sampled at every sim minute, worst |diff| */
function leg(RD, ic, hours, scramAt, warpDt) {
  function walk(speed, dtOpt) {
    var svc = mk(RD, ic, dtOpt ? { warpDt: dtOpt } : null);
    settle(svc, 120);
    /* The scram is commanded on PLAY and the plant given `scramAt` seconds to come off its
     * cascade BEFORE the timed hour, so both legs start the hour from the SAME post-trip state.
     * (The first cut scrammed inside the hour on a broadcast boundary — 60 s into the PLAY leg,
     * 360 s into the WARP one — and compared a tripped plant to one still at power.) */
    if (scramAt != null) { svc.handleCommand({ action: 'scram' }); runTo(svc, svc.simTime + scramAt); }
    var t0 = svc.simTime;
    svc.handleCommand({ action: 'set_speed', value: speed });
    var at = {}, lastMin = -1, stops = 0;
    runTo(svc, t0 + hours * 3600, function (s) {
      if (s.metadata.speed_snap) { stops++; svc.handleCommand({ action: 'set_speed', value: speed }); }
      var min = Math.floor((svc.simTime - t0) / 60 + 1e-9);
      if (min !== lastMin) { lastMin = min; var row = {}; FIELDS.forEach(function (f) { row[f] = s.true_state[f]; }); at[min] = row; }
    });
    return { at: at, stops: stops, tier: svc._tier };
  }
  var ref = walk(60), wrp = walk(3600, warpDt);
  var worst = {};
  FIELDS.forEach(function (f) {
    var w = 0, wm = null;
    Object.keys(ref.at).forEach(function (m) {
      var a = ref.at[m][f], b = wrp.at[m] && wrp.at[m][f];
      if (typeof a !== 'number' || typeof b !== 'number') return;
      var d = Math.abs(a - b); if (d > w) { w = d; wm = m; }
    });
    worst[f] = { d: w, min: wm };
  });
  return { worst: worst, refStops: ref.stops, warpStops: wrp.stops, warpTier: wrp.tier };
}

/* ---- the suite ----------------------------------------------------------------------------- */
var rec = [];
function ck(id, name, cond, note) {
  rec.push({ id: id, name: name, ok: !!cond });
  console.log('  ' + (cond ? 'PASS' : 'FAIL') + '  ' + id + '  ' + name + (note ? '  -- ' + note : ''));
}
function head(s) { console.log('\n' + s); }

function runFidelity(RD) {
  head('FIDELITY  [one sim hour on WARP vs the PLAY reference, five regimes]');
  var LEGS = [['hot_full_power', null], ['hot_full_power', 120], ['hot_zero_power', null],
              ['hot_shutdown', null], ['cold_shutdown', null]];
  LEGS.forEach(function (L, i) {
    var r = leg(RD, L[0], 1, L[1]);
    var over = FIELDS.filter(function (f) { return r.worst[f].d > BAND[f]; });
    var note = FIELDS.map(function (f) { return f + ' ' + r.worst[f].d.toFixed(4) + '/' + BAND[f]; }).join(', ');
    ck('WT-1' + String.fromCharCode(97 + i), 'WARP stays inside the band: ' + L[0] + (L[1] != null ? ', scrammed ' + L[1] + ' s before the hour' : ''),
       over.length === 0 && r.warpTier === 'warp',
       (over.length ? 'OVER: ' + over.join(', ') + ' — ' : '') + 'worst/band ' + note + '; warp stops ' + r.warpStops + ', ended on ' + r.warpTier);
  });
  /* THE CLIFF: the band must be able to fail. 1.0 s trips the quiet plant. */
  var c = leg(RD, 'hot_full_power', 1, null, 1.0);
  var overC = FIELDS.filter(function (f) { return c.worst[f].d > BAND[f]; });
  ck('WT-2', 'the band CAN fail: a 1.0 s step blows it (the cliff between 0.5 and 1.0 s is real)',
     overC.length >= 3,
     overC.length + ' fields over the band at 1.0 s: ' + overC.map(function (f) { return f + ' ' + c.worst[f].d.toFixed(3); }).join(', '));
}

function runMechanics(RD, quiet) {
  var out = [];
  function ck2(id, name, cond, note) { out.push({ id: id, ok: !!cond }); if (!quiet) ck(id, name, cond, note); }
  if (!quiet) head('THE LOCKOUT  [a large break under WARP]');
  var svc = mk(RD, 'hot_full_power');
  settle(svc, 120);
  svc.handleCommand({ action: 'set_speed', value: 3600 });
  var s = svc.advanceCycles(1);
  ck2('WT-3a', 'a settled plant ENTERS WARP: tier warp, 0.5 s step, the whole broadcast stepped',
      svc._tier === 'warp' && svc._dt === 0.5 && s.metadata.pacing.steps_done === s.metadata.pacing.steps_requested && s.metadata.pacing.steps_requested === 720,
      'tier ' + svc._tier + ', dt ' + svc._dt + ', ' + s.metadata.pacing.steps_done + '/' + s.metadata.pacing.steps_requested + ' steps');
  var tBefore = svc.simTime;
  svc.handleCommand({ action: 'inject_failure', failure_id: 'large_loca', severity: 1 });
  s = svc.advanceCycles(1);
  var p = s.metadata.pacing, credited = svc.simTime - tBefore;
  ck2('WT-3b', 'the loop STOPS inside the broadcast on the break — steps_done < requested',
      p.steps_done < p.steps_requested && p.steps_done >= 1,
      p.steps_done + ' of ' + p.steps_requested + ' steps');
  ck2('WT-3c', 'and credits ONLY the stepped sim time', Math.abs(credited - p.steps_done * 0.5) < 1e-9,
      credited.toFixed(3) + ' s credited for ' + p.steps_done + ' x 0.5 s');
  ck2('WT-3d', 'the tier is PLAY at 0.02 s and the clock is at 60x or below, with a reason on the snapshot',
      svc._tier === 'play' && svc._dt === 0.02 && svc.timeAcceleration <= 60 && !!s.metadata.speed_snap,
      'tier ' + svc._tier + ', ' + svc.timeAcceleration + 'x, speed_snap ' + JSON.stringify(s.metadata.speed_snap || null));
  /* attention stops OFF for the re-request, or the break's alarm cascade drops the clock to 1x
   * on the same broadcast and its speed_snap masks the refusal this check is about */
  svc.handleCommand({ action: 'set_attention_stops', value: false });
  svc.handleCommand({ action: 'set_speed', value: 3600 });
  s = svc.advanceCycles(1);
  ck2('WT-3e', 'a WARP re-request while locked lands at 60x and says why',
      svc.timeAcceleration === 60 && svc._tier === 'play' && s.metadata.speed_snap && s.metadata.speed_snap.reason === 'warp_locked' && s.metadata.pacing.warp_available === false,
      svc.timeAcceleration + 'x, snap ' + JSON.stringify(s.metadata.speed_snap || null) + ', warp_available ' + s.metadata.pacing.warp_available);

  /* a pure RATE excursion — no trip, no failure, no alarm: the watch's own rate branch. The
   * truth is faked to ramp power 3 %/s so the branch is isolated from what the plant would do
   * (which would be to trip, and prove the wrong branch). */
  var r = mk(RD, 'hot_full_power');
  settle(r, 120);
  r.handleCommand({ action: 'set_speed', value: 3600 });
  r.advanceCycles(1);
  var realTS = r.engine.getTrueState.bind(r.engine), n = 0, base = realTS().power_pct;
  r.engine.getTrueState = function () { var ts = Object.assign({}, realTS()); ts.power_pct = base - 1.5 * (n++); return ts; };
  s = r.advanceCycles(1);
  ck2('WT-3f', 'a pure rate excursion (power 3 %/s, nothing tripped) drops WARP with the rate named',
      r._tier === 'play' && s.metadata.speed_snap && s.metadata.speed_snap.reason === 'transient' && /power moving/.test(s.metadata.speed_snap.detail || ''),
      'tier ' + r._tier + ', snap ' + JSON.stringify(s.metadata.speed_snap || null));

  /* authored speed never warps */
  var a = mk(RD, 'hot_full_power');
  settle(a, 60);
  var once = true;
  a.instructor.consumeSpeedRequest = function () { if (once) { once = false; return 3600; } return null; };
  a.advanceCycles(1);
  ck2('WT-3g', 'an AUTHORED 3600x (a beat) stays on PLAY — scripted skips keep the bit-identical plant',
      a._tier === 'play' && a.timeAcceleration === 3600 && a._authoredSpeed === true,
      'tier ' + a._tier + ' at ' + a.timeAcceleration + 'x, authored ' + a._authoredSpeed);

  if (!quiet) head('THE STEP BUDGET  [timer path, faked clock]');
  /* The budgeted leg runs at 600x with a fake clock that advances 5 ms per read: the loop reads
   * it every 25 steps, so the 40 ms budget cuts at the 9th read — 225 steps, 4.5 s — and the
   * instants land on the half-second grid. The reference runs the same plant at 10x (1.0 s per
   * broadcast, no budget); the two share every whole-second instant that is a multiple of 4.5. */
  function budgeted(withBudget) {
    var b = mk(RD, 'hot_full_power', { warp: false, stepBudgetMs: withBudget ? 40 : 0 });
    settle(b, 60);
    b.handleCommand({ action: 'set_speed', value: withBudget ? 600 : 10 });
    var calls = 0; b._perfNow = function () { return 5 * (calls++); };   // 5 ms per read
    var at = {}, first = null;
    b.running = true;
    var t0 = b.simTime;
    while (b.simTime < t0 + 120) {
      b._budgetArmed = true;
      var s2 = b.tick();
      b._budgetArmed = false;
      if (!first) first = { done: s2.metadata.pacing.steps_done, req: s2.metadata.pacing.steps_requested, credited: b.simTime - t0 };
      at[b.simTime.toFixed(2)] = { P: s2.true_state.pressure_mpa, T: s2.true_state.tavg_c, L: s2.true_state.pzr_level_pct };
    }
    return { first: first, at: at };
  }
  var on = budgeted(true), off = budgeted(false);
  ck2('WT-4a', 'with a 40 ms budget the loop stops early and credits only what it stepped',
      on.first.done < on.first.req && Math.abs(on.first.credited - on.first.done * 0.02) < 1e-9,
      on.first.done + ' of ' + on.first.req + ' steps, ' + on.first.credited.toFixed(2) + ' s credited');
  ck2('WT-4b', 'without one, the whole request is stepped', off.first.done === off.first.req && off.first.req === 50, off.first.done + ' of ' + off.first.req);
  var shared = 0, worst = 0;
  Object.keys(on.at).forEach(function (k) {
    if (!off.at[k]) return; shared++;
    ['P', 'T', 'L'].forEach(function (f) { var d = Math.abs(on.at[k][f] - off.at[k][f]); if (d > worst) worst = d; });
  });
  ck2('WT-4c', 'the plant is BIT-IDENTICAL with the budget on and off at every shared instant',
      shared >= 10 && worst === 0, shared + ' shared instants, worst |diff| ' + worst.toExponential(2));

  if (!quiet) head('THE CADENCE  [a quiet plant at 600x on PLAY stays on the 100 ms broadcast]');
  /* 10 s of settle, not 60: the wall-scaled defect showed on the fresh plant's first minutes
   * (its lineup-engagement ring drifts ~10 psi per plant-minute, over the OLD 0.028 MPa per
   * broadcast and nowhere near the rate form's 40 psi/s), so this is where the mutation below
   * has to be visible. A fully settled plant drifts under both forms and would prove nothing. */
  var q = mk(RD, 'hot_full_power', { warp: false });
  settle(q, 10);
  q.handleCommand({ action: 'set_speed', value: 600 });
  var hist = {};
  runTo(q, q.simTime + 600, function () { hist[q.broadcastMs] = (hist[q.broadcastMs] || 0) + 1; });
  ck2('WT-5', '`_isRapidChange` is a rate per SIM second: quiet at 600x never flips the cadence',
      !hist[50] && hist[100] > 0, 'cadence histogram ' + JSON.stringify(hist) + ' (was {"50":all} with the wall-scaled form)');
  return out;
}

/* ---- run ------------------------------------------------------------------------------------ */
var RD = loadAll(undefined);
runFidelity(RD);
runMechanics(RD, false);

/* ---- mutations: each must redden a mechanics check ------------------------------------------ */
var MUTATIONS = [
  ['the in-loop WARP watch is disabled (only the post-loop one remains)',
   "if (this._tier === 'warp') {\n          var why = this._warpWatch(covered);",
   "if (false) {\n          var why = this._warpWatch(covered);"],
  ['the clock credits the REQUEST, not what was stepped',
   'this.simTime += stepped * dt;', 'this.simTime += steps * dt;'],
  /* `broadcastMs / 1000`, not `/ 500`: the rates are 2x the old per-broadcast numbers
   * (1.0 % and 0.14 MPa per 0.5 s), so this divisor reproduces the shipped thresholds EXACTLY —
   * `/ 500` made a detector twice as deaf as the defect and the first run was BLIND to it. */
  ['the transient detector goes back to the wall-scaled form',
   'var span = this._lastSpanS > 0 ? this._lastSpanS : this.timeAcceleration * this.broadcastMs / 1000;',
   'var span = this.broadcastMs / 1000;'],
  ['authored beat speeds are allowed to warp',
   'var warp = this.pacing.warp && !this._authoredSpeed && this.timeAcceleration >= WARP_MIN_SPEED;',
   'var warp = this.pacing.warp && this.timeAcceleration >= WARP_MIN_SPEED;'],
  ['a WARP request is never refused',
   'if (why) {\n        v = Math.min(v, WARP_DROP_SPEED);', 'if (false) {\n        v = Math.min(v, WARP_DROP_SPEED);'],
  ['the rate branch of the watch is gone',
   "if (Math.abs(power - prev.power) / spanS > RAPID_POWER_PCT_PER_S) return 'power moving '",
   "if (false) return 'power moving '"],
];
console.log('\n' + '='.repeat(70));
console.log('  INJECTION SELF-TEST — every mutation MUST redden a mechanics check');
console.log('='.repeat(70));
var blind = 0;
MUT.select(MUTATIONS).forEach(function (m) {
  if (SVC_SRC.indexOf(m[1]) === -1) { console.log('  ERROR   anchor not found: ' + m[0]); blind++; return; }
  var r2;
  try { r2 = runMechanics(loadAll(SVC_SRC.split(m[1]).join(m[2])), true); }
  catch (e) { r2 = [{ id: 'threw', ok: false }]; }
  var red = r2.filter(function (x) { return !x.ok; });
  if (!red.length) { console.log('  BLIND     ' + m[0]); blind++; }
  else console.log('  caught    ' + m[0].padEnd(62) + red.length + ' red (' + red.map(function (x) { return x.id; }).join(' ') + ')');
});
loadAll(undefined);

var nFail = rec.filter(function (r) { return !r.ok; }).length;
console.log('\n' + '='.repeat(70));
console.log('  injection self-test: ' + (MUTATIONS.length - blind) + '/' + MUTATIONS.length + ' mutations caught' + (blind ? '  ** ' + blind + ' BLIND SPOTS — GATE FAILS **' : ', no blind spots'));
console.log('  run_warp_tier: ' + (rec.length - nFail) + ' passed, ' + nFail + ' failed  (' + rec.length + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit((nFail > 0 || blind > 0) ? 1 : 0);
