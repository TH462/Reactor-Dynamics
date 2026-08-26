/* run_pwr2_perf.js — the END-TO-END step-cost gate. (#514)
 *
 * WHY THIS EXISTS. The design spine budgeted 16 us/step (D1 §26 — Blueprint/PWR2_DESIGN.md)
 * and recorded "118,600 steps/s, stop condition CLEARED" (§28.1). That figure was Layer 4
 * alone; the full Layer 5/6 engine was never re-measured, and it shipped at 1,090 us/step —
 * 51x the old engine, compute-bound above ~18x fast-forward of the 3600x the UI offers.
 * The only timing in the suite (run_pwr2_vtable) extrapolates from property-call cost and
 * bears no relation to the shipped step, which is exactly how the deficit went unseen.
 * #514 took the step to ~85 us (the vtable actually wired everywhere, T_from_h/P_sat
 * tabulated, two solves warm-started); this gate is what keeps it there.
 *
 * RATIO, NOT ABSOLUTE — run_pwr2_vtable's reasoning, verbatim: run_all executes 10-way
 * parallel and an absolute wall-clock threshold reddens under contention. Both engines
 * slow down together, so PWR2-step / PWR1-step survives load. The absolute numbers are
 * REPORTED for the record, never asserted.
 *
 * THE BOUND: PWR2 <= 8x the old engine per step. Measured 2026-08-25 after #514: 4.0x
 * (85 vs 21.5 us). 8 is two-fold headroom over that — far under the 51x defect class this
 * exists to catch, far over machine-to-machine noise.
 *
 * Run: node test/run_pwr2_perf.js
 */
'use strict';
var path = require('path');
var E = path.join(__dirname, '..', 'engines', 'pwr2');
var ROOT = path.join(__dirname, '..');

var rec = [];
function ckT(name, cond, note) {
  rec.push({ name: name, ok: !!cond });
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (note ? '  -- ' + note : ''));
}

/* ---- 1. THE LAZY BUILD (#514) ---------------------------------------------------------
 * pwr2_vtable's ~0.5 s table build used to run at SCRIPT LOAD, paid by every shell.html
 * open — plain-PWR players included. It now builds on first use. The probe is
 * deterministic, not a timing: buildGrid() is the only writer of GRID.P, so a zero first
 * element IS the unbuilt state. (If the grid scheme ever changes such that a built table
 * legitimately holds P[0] === 0, this check — not the laziness — is what to fix.) */
['pwr2_water', 'pwr2_vtable'].forEach(function (f) { require(path.join(E, f + '.js')); });
var VT = globalThis.RD.pwr2.vtable;
ckT('the vtable does NOT build at require (lazy since #514)', VT.GRID.P[0] === 0,
    'GRID.P[0] = ' + VT.GRID.P[0] + ' before any call');
VT.rho_from_h(1300, 15.41);
ckT('…and the first call builds it', VT.GRID.P[0] > 0,
    'GRID.P[0] = ' + VT.GRID.P[0].toFixed(4) + ' after one rho_from_h');

/* ---- 2. LOAD THE REST OF BOTH ENGINES -------------------------------------------------- */
['pwr2_geometry', 'pwr2_core', 'pwr2_loop', 'pwr2_kinetics', 'pwr2_fuel', 'pwr2_reactor',
 'pwr2_sources', 'pwr2_sg', 'pwr2_turbine', 'pwr2_relief', 'pwr2_condenser', 'pwr2_cvcs',
 'pwr2_eccs', 'pwr2_afw', 'pwr2_damage', 'pwr2_protection', 'pwr2_pressurizer',
 'pwr2_dumpctl', 'pwr2_break', 'pwr2_containment', 'pwr2_rhr', 'pwr2_true_state',
 'pwr2_instruments', 'pwr2_feedwater', 'pwr2_engine'
].forEach(function (f) { require(path.join(E, f + '.js')); });
['engines/load_mode.js', 'engines/pwr/pwr_config.js', 'layers/control/pwr_control.js',
 'engines/pwr/pwr_thermal.js', 'engines/pwr/pwr_pressurizer.js',
 'engines/pwr/pwr_pressurizer2.js', 'engines/pwr/pwr_primary.js',
 'engines/pwr/pwr_steam_generator.js', 'engines/pwr/pwr_instruments.js',
 'engines/pwr/pwr_engine.js'
].forEach(function (f) { require(path.join(ROOT, f)); });

var RD = globalThis.RD;
var EN = RD.pwr2.engine, DT = 0.02;

/* median of batches — one GC pause or scheduler stall lands in one batch, not the verdict */
function sampleUs(fn, batch) {
  var a = process.hrtime.bigint();
  for (var i = 0; i < batch; i++) fn();
  return Number(process.hrtime.bigint() - a) / 1e3 / batch;
}
function usPerCall(fn, batch, reps) {
  var t = [];
  for (var r = 0; r < reps; r++) t.push(sampleUs(fn, batch));
  return Math.min.apply(null, t);
}

/* ---- INTERLEAVED, AND THE MINIMUM — BOTH HALVES ARE LOAD-BEARING (#519) ---------------------
 * ⛔ THE RATIO DOES NOT SURVIVE LOAD, AND THE GATE'S OWN HEADER CLAIMED IT DID: "Both engines
 * slow down together, so PWR2-step / PWR1-step survives load." That is true only if they are
 * measured through the SAME weather, and they were not — the shipped shape timed all seven pwr2
 * reps, then all seven pwr1 reps. On a 3-way-parallel CI runner a heavy neighbour can start and
 * finish inside one of those two windows.
 *
 * MEASURED, reproducing the CI failure deliberately (12 spinners raised for the pwr2 block only,
 * dropped before the pwr1 block):
 *
 *     sequential  median  8.80x  (183.2 / 20.8)   <- the shipped shape. CI read 8.3x (178.7/20.5)
 *     sequential  min     7.56x  (150.8 / 20.0)
 *     interleaved median  3.44x  (183.6 / 53.3)
 *     interleaved min     3.71x  ( 75.2 / 20.3)   <- adopted; idle truth is 3.74-3.91x
 *
 * ⚠ AND SUSTAINED LOAD WAS THE WRONG HYPOTHESIS — worth recording, because it is the obvious one
 * and it is safe. Load across BOTH blocks slows both engines and drives the ratio DOWN (4.00 ->
 * 2.90), so it can never redden this gate. Only load ALIGNED WITH ONE BLOCK inflates it. A fix
 * aimed at "CI is busy" would have changed nothing.
 *
 * MINIMUM rather than median: contention and garbage collection can only ever make a sample
 * SLOWER, so the fastest rep is the least-corrupted estimate of the underlying cost. Note the
 * interleaved MEDIAN also recovers the ratio — interleaving is what fixes the verdict — but its
 * absolutes stay inflated (183.6 us), and this file REPORTS those numbers. */
function usPerCallPair(fnA, batchA, fnB, batchB, reps) {
  var a = [], b = [];
  for (var r = 0; r < reps; r++) { a.push(sampleUs(fnA, batchA)); b.push(sampleUs(fnB, batchB)); }
  return [Math.min.apply(null, a), Math.min.apply(null, b)];
}

/* ---- 3. THE RATIO ----------------------------------------------------------------------
 * Both plants settled at hot full power, both stepped at the service's own PHYSICS_DT. */
var eng2 = EN.createEngine({});
for (var i = 0; i < 120 / DT; i++) EN.step(eng2, DT);
var eng1 = new RD.PWREngine();
for (i = 0; i < 120 / DT; i++) eng1.step(DT);

var step2 = function () { EN.step(eng2, DT); }, step1 = function () { eng1.step(DT); };
usPerCall(step2, 300, 3);                                   /* warm both paths */
usPerCall(step1, 1000, 3);
var pair = usPerCallPair(step2, 500, step1, 2000, 7);       /* #519 — same weather, both engines */
var us2 = pair[0], us1 = pair[1];
var ratio = us2 / us1;

console.log('        REPORTED (contention-sensitive, never asserted): pwr2 ' + us2.toFixed(1) +
  ' us/step, pwr1 ' + us1.toFixed(1) + ' us/step; 60x fast-forward = ' +
  (us2 * 300 / 1000).toFixed(1) + ' ms of a 100 ms broadcast');
ckT('pwr2 steps within 8x of the engine it replaces (was 51x before #514)', ratio <= 8,
    ratio.toFixed(1) + 'x  (' + us2.toFixed(1) + ' vs ' + us1.toFixed(1) + ' us)');

/* ---- 4. INJECTION SELF-TEST ------------------------------------------------------------
 * A perf gate can go vacuous two ways: the harness mismeasures (a batch too small to see
 * the work), or the bound drifts meaningless. Prove the harness would CATCH the defect
 * class this file exists for: wrap the step in ~10 old-engine-steps of busy work — the
 * pre-#514 deficit's scale — and require the measured ratio to blow the same bound. */
var burn = Math.max(1, Math.round(us1 * 10));
function slowedStep() {
  EN.step(eng2, DT);
  var end = process.hrtime.bigint() + BigInt(burn * 1000);
  while (process.hrtime.bigint() < end) { /* the injected regression */ }
}
var usSlow = usPerCall(slowedStep, 100, 3);
ckT('injection self-test: a 51x-class regression reads over the bound', usSlow / us1 > 8,
    (usSlow / us1).toFixed(1) + 'x with ' + burn + ' us of injected work');

/* ---- 5. THE INTERLEAVE ITSELF IS TESTED (#519) -------------------------------------------
 * The fix above is a claim about SAMPLING, so it needs its own evidence — and a real load
 * generator inside a gate that runs 3-way parallel on CI would be the very disease. This
 * reproduces the geometry deterministically instead: a burst of extra cost that expires after a
 * fixed number of CALLS, shared by whichever function is running.
 *
 * That geometry is the whole point. Sequential sampling runs all of A's reps first, so A eats the
 * entire burst and B sees none of it — the CI signature. Interleaved sampling hands both
 * functions the same share. The two engines here are synthetic and equal-cost by construction, so
 * the TRUE ratio is 1.0 and any departure is the sampler's error, not the plant's. */
(function () {
  var callsLeft = 900;                       /* the burst, in calls, not seconds */
  function busy(us) {
    var end = process.hrtime.bigint() + BigInt(Math.round(us * 1000));
    while (process.hrtime.bigint() < end) { /* spin */ }
  }
  function underBurst() { return callsLeft-- > 0; }
  function synthA() { busy(6); if (underBurst()) busy(24); }
  function synthB() { busy(6); if (underBurst()) busy(24); }

  var seq = [[], []];
  for (var r = 0; r < 7; r++) seq[0].push(sampleUs(synthA, 100));
  for (r = 0; r < 7; r++) seq[1].push(sampleUs(synthB, 100));
  var seqRatio = Math.min.apply(null, seq[0]) / Math.min.apply(null, seq[1]);

  callsLeft = 900;                           /* same burst, same size, different geometry */
  var il = usPerCallPair(synthA, 100, synthB, 100, 7);
  var ilRatio = il[0] / il[1];

  ckT('interleaving is what keeps the ratio honest when load lands on ONE block',
      ilRatio < 1.6 && seqRatio > ilRatio,
      'true ratio 1.00 (equal-cost twins) — interleaved reads ' + ilRatio.toFixed(2) +
      'x, sequential reads ' + seqRatio.toFixed(2) + 'x. On the plant the same geometry took ' +
      'the shipped gate to 8.80x against an idle truth of 3.7-4.0x, which is the CI red this ' +
      'fixes (#519: CI 8.3x, 178.7/20.5 us)');
})();

var passed = rec.filter(function (r) { return r.ok; }).length;
console.log('\n======================================================================');
console.log('  run_pwr2_perf: ' + passed + ' passed, ' + (rec.length - passed) + ' failed  (' +
            rec.length + ' checks)');
console.log('======================================================================');
process.exit(passed === rec.length ? 0 : 1);
