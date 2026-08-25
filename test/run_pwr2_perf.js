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
function usPerCall(fn, batch, reps) {
  var t = [];
  for (var r = 0; r < reps; r++) {
    var a = process.hrtime.bigint();
    for (var i = 0; i < batch; i++) fn();
    t.push(Number(process.hrtime.bigint() - a) / 1e3 / batch);
  }
  t.sort(function (x, y) { return x - y; });
  return t[(t.length - 1) >> 1];
}

/* ---- 3. THE RATIO ----------------------------------------------------------------------
 * Both plants settled at hot full power, both stepped at the service's own PHYSICS_DT. */
var eng2 = EN.createEngine({});
for (var i = 0; i < 120 / DT; i++) EN.step(eng2, DT);
var eng1 = new RD.PWREngine();
for (i = 0; i < 120 / DT; i++) eng1.step(DT);

usPerCall(function () { EN.step(eng2, DT); }, 300, 3);      /* warm both paths */
usPerCall(function () { eng1.step(DT); }, 1000, 3);
var us2 = usPerCall(function () { EN.step(eng2, DT); }, 500, 7);
var us1 = usPerCall(function () { eng1.step(DT); }, 2000, 7);
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

var passed = rec.filter(function (r) { return r.ok; }).length;
console.log('\n======================================================================');
console.log('  run_pwr2_perf: ' + passed + ' passed, ' + (rec.length - passed) + ' failed  (' +
            rec.length + ' checks)');
console.log('======================================================================');
process.exit(passed === rec.length ? 0 : 1);
