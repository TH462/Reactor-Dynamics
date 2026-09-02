/* run_service_invariance.js — IS THE PLANT THE SAME PLANT AT EVERY TIME ACCELERATION? (#588)
 *
 * `layers/simulation_service.js` makes this claim twice, in its own comments:
 *
 *   :333  "Automation channels run in-stack at physics rate (fixed sim-time cadence inside),
 *          reading the previous step's instruments — so controllers behave identically at any
 *          time acceleration."
 *   :337  "Protection is on a SIM-time cadence, not a per-broadcast one (#153): the reactor
 *          gets the same protection at 3600x as at 1x."
 *
 * NOTHING CHECKED EITHER OF THEM. This runner does.
 *
 * ⚠ AND IT SETTLED A QUESTION IN THE OPPOSITE DIRECTION TO THE ONE IT WAS BUILT FOR. #588 was
 * filed believing acceleration perturbed the plant ~1 % and that the perturbation picked the
 * branch at the blowdown cliff. Measured here at MATCHED SIM INSTANTS — before and after the
 * cadence fix — the trajectories are identical to 0.000e+0 at every shared instant. The "~1 %"
 * was an endpoint artefact (see the note on walk()/compare() below). What WAS real is narrower
 * and is now fixed: the protection EVALUATION RATE varied with acceleration, 10.85 per sim-s at
 * 1x in a transient against 10.00 above it. The browser/Node cliff difference #588 records is
 * therefore still UNEXPLAINED, and this gate is the instrument that rules acceleration out.
 *
 * ⚠ WHY THE CLAIM MATTERS RATHER THAN BEING A TIDINESS POINT. A player who fast-forwards a
 * casualty must be operating the SAME plant as one who watches it in real time. If not, the
 * gates (which run at 10x and above) certify a plant the 1x player never gets — the shape
 * CLAUDE.md already records for the protection cadence: "1x is byte-identical by construction,
 * which is why a divergence hides at the speed you are most likely to test at."
 *
 * Gate semantics (STRICT XFAIL, same as run_meltdown / run_behavior / run_procedures):
 *   - check passes, not in XFAIL  -> PASS   (green)
 *   - check fails,  in XFAIL      -> XFAIL  (yellow, known and tracked — gate stays green)
 *   - check fails,  NOT in XFAIL  -> FAIL   (red, a real regression)
 *   - check passes, in XFAIL      -> XPASS  (red — the gap closed; delete the XFAIL entry)
 *
 * Run: node test/run_service_invariance.js
 */
'use strict';
var fs = require('fs'), path = require('path');
var MUT = require('./mut_flags.js');   /* --no-mutations / --mut= / --grp= (#602) */
var R = path.join(__dirname, '..');
var SRC = path.join(R, 'engines', 'pwr2');
if (typeof global.window === 'undefined') global.window = global;

var SVC_PATH = path.join(R, 'layers', 'simulation_service.js');
var SVC_SRC = fs.readFileSync(SVC_PATH, 'utf8').replace(/\r\n/g, '\n');

/* ---- THE KNOWN GAPS. Each names the issue, the measurement, and what closes it. --------- */
/* ---- NO KNOWN GAPS. All three xfails this file shipped with on 2026-08-28 are gone, and
 * the reasons differ — which is the point of having had them separately:
 *   SI-2 CLOSED BY A FIX. `tick()`'s `sinceEval` now carries on the instance and the post-loop
 *        evaluation obeys the cadence, so the rate is 10.00/sim-s at every acceleration (it was
 *        10.85 at 1x in a transient).
 *   SI-6 CLOSED BY THE SAME FIX — and its first form was itself defective: it scanned the raw
 *        source for `var sinceEval = 0;` and went on failing afterwards because the FIX'S OWN
 *        COMMENT quotes the line it replaced. Comments are stripped now and it asserts the
 *        positive.
 *   SI-4 WAS NEVER A REAL FAILURE. It compared the two legs at their STOPPING POINTS, which
 *        differ by up to one broadcast — 200.02 s against 200.00 s — and on a blowdown moving
 *        ~128 psi/s that reads as 267.31 vs 269.87 psi, "0.96 %". Measured at matched instants,
 *        before AND after the fix, the trajectories are identical to 0.000e+0. The service's
 *        trajectory-invariance claim was true all along; only the evaluation RATE was not.
 * A gap that closes for a reason is worth more than one that closes. */
var XFAIL = {};

/* ---- LOAD ------------------------------------------------------------------------------ */
function loadAll(svcSrc) {
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
  /* the service comes from SOURCE so the injection self-test can mutate it */
  delete require.cache[require.resolve(SVC_PATH)];
  if (svcSrc === undefined) { require(SVC_PATH); }
  else { (0, eval)(svcSrc); }                                       // eslint-disable-line no-eval
  return globalThis.RD;
}

/* ---- THE DRIVE ------------------------------------------------------------------------- */
/* Drive off simTime, never a cycle count — CLAUDE.md's own rule, and the reason #194 filed a
 * plant defect that did not exist. `evals` counts what the invariance claim is ABOUT.
 *
 * ⚠⚠ AND COMPARE AT MATCHED SIM INSTANTS, NEVER AT THE ENDPOINT. `while (simTime < target)`
 * overshoots by up to one broadcast, and a broadcast is 0.02-0.1 s at 1x against 1 s at 10x.
 * Comparing the two stopping points therefore compares the plant at two DIFFERENT TIMES: on a
 * blowdown moving ~128 psi/s that reads as 267.31 psi against 269.87 — "0.96 % divergence" —
 * on trajectories that are in fact IDENTICAL. That artefact was filed as a defect on #588,
 * twice, and both times the number came from the endpoint. `walk()` below records every
 * instant and `compare()` intersects the two grids; the intersection size is asserted, so a
 * comparison that met nowhere cannot pass by having nothing to disagree about. */
/* every broadcast instant on the way to `target`, keyed by sim time */
function walk(RD, speed, target, casualty) {
  var svc = new RD.SimulationService({ seed: 0x1234 });
  svc.selectPlant('pwr2', 'hot_full_power', null, undefined);
  if (casualty) {
    casualty.forEach(function (id) {
      svc.handleCommand({ action: 'inject_failure', failure_id: id, severity: 1 });
    });
  }
  var evals = 0, _ev = svc.layer.evaluate.bind(svc.layer);
  svc.layer.evaluate = function (ins, dt) { evals++; return _ev(ins, dt); };
  svc.handleCommand({ action: 'set_speed', value: speed });
  var at = {}, guard = 0;
  while (svc.simTime < target && guard++ < 500000) {
    var s = svc.advanceCycles(1), ts = s.true_state;
    /* ⚠ THE COMPARED FIELDS DECIDE WHAT THIS GATE CAN SEE. Pressure, inventory and core
     * temperature are what a BREAK moves; `sg_level_pct` and `boron_ppm` are what the
     * AUTOMATION moves, and without them the "automation lumped into one call per broadcast"
     * mutation came back BLIND — the gate was measuring the plant the casualty drives and
     * calling it the plant. */
    at[svc.simTime.toFixed(2)] = { P: ts.pressure_mpa, inv: ts.core_inventory_pct,
                                   Tcore: ts.t_core_exit_c, sg: ts.sg_level_pct,
                                   boron: ts.boron_ppm };
  }
  return { at: at, evals: evals, simTime: svc.simTime, rate: evals / svc.simTime };
}

/* worst relative difference over the instants BOTH legs actually landed on */
function compare(a, b) {
  var n = 0, worst = 0, at = null;
  Object.keys(a.at).forEach(function (k) {
    var x = a.at[k], y = b.at[k];
    if (!y) return;
    n++;
    [['P', x.P, y.P], ['inv', x.inv, y.inv], ['Tcore', x.Tcore, y.Tcore],
     ['sg_level', x.sg, y.sg], ['boron', x.boron, y.boron]].forEach(function (f) {
      if (typeof f[1] !== 'number' || typeof f[2] !== 'number') return;
      var d = Math.abs(f[1] - f[2]) / Math.max(1e-12, Math.abs(f[2]));
      if (d > worst) { worst = d; at = k + ' s (' + f[0] + ')'; }
    });
  });
  return { n: n, worst: worst, at: at };
}

var LOCA = ['large_loca', 'station_blackout'];

/* ---- THE SUITE ------------------------------------------------------------------------- */
function runSuite(RD, rec, quiet) {
  function ck(id, name, cond, note) {
    rec.push({ id: id, name: name, ok: !!cond, note: note || '' });
    if (!quiet) {
      var v = cond ? 'PASS' : (XFAIL[id] ? 'XFAIL' : 'FAIL');
      console.log('  ' + v.padEnd(6) + id + '  ' + name + (note ? '  -- ' + note : ''));
    }
  }
  function head(s) { if (!quiet) console.log('\n' + s); }
  function rel(a, b) { return Math.abs(a - b) / Math.max(1e-12, Math.abs(a)); }

  /* ---- 1. A QUIET PLANT. The claim must hold where nothing is happening, or it holds
   * nowhere. Compared at MATCHED SIM INSTANTS — see the note on walk()/compare(). */
  head('QUIET PLANT  [200 s at power — the claim where nothing is moving]');
  var q1 = walk(RD, 1, 200, null), q10 = walk(RD, 10, 200, null), q60 = walk(RD, 60, 200, null);
  var qc = compare(q1, q10);
  ck('SI-0', 'the two legs actually MET — a comparison over an empty intersection cannot fail',
     qc.n >= 100,
     qc.n + ' shared sim instants (1x ran to ' + q1.simTime.toFixed(2) + ' s, 10x to ' +
     q10.simTime.toFixed(2) + ')');
  ck('SI-1', 'protection is evaluated at the SAME rate per sim second at every acceleration',
     Math.abs(q1.rate - q10.rate) < 0.05 && Math.abs(q1.rate - q60.rate) < 0.05,
     q1.rate.toFixed(2) + ' / ' + q10.rate.toFixed(2) + ' / ' + q60.rate.toFixed(2) +
     ' per sim-s at 1x / 10x / 60x');
  ck('SI-3', 'the plant is BIT-FOR-BIT the same plant at 1x and 10x, at every shared instant',
     qc.worst < 1e-9,
     'worst relative difference ' + qc.worst.toExponential(3) +
     (qc.at ? ' at ' + qc.at : '') + ' over ' + qc.n + ' instants');

  /* ---- 2. A TRANSIENT. The regime the claim is FOR — nobody fast-forwards a steady plant,
   * and a quiet plant turned out to be too insensitive to catch a cadence mutation at all
   * (the injection self-test below is what showed that, not a guess). */
  head('TRANSIENT  [large break + station blackout — the regime the claim exists for]');
  var t1 = walk(RD, 1, 200, LOCA), t10 = walk(RD, 10, 200, LOCA), t60 = walk(RD, 60, 200, LOCA);
  var tc = compare(t1, t10), tc6 = compare(t10, t60);
  ck('SI-5', 'the transient legs actually MET, at enough instants to be worth comparing',
     tc.n >= 30 && tc6.n >= 30,
     '1x/10x share ' + tc.n + ' instants, 10x/60x share ' + tc6.n);
  ck('SI-2', 'protection is evaluated at the same rate per sim second IN A TRANSIENT',
     Math.abs(t1.rate - t10.rate) < 0.05,
     t1.rate.toFixed(2) + ' vs ' + t10.rate.toFixed(2) + ' per sim-s — the broadcast cadence ' +
     'halves to 50 ms in a transient, which is BELOW PROTECTION_DT (0.1 s) at 1x');
  ck('SI-4', 'the plant is BIT-FOR-BIT the same plant at 1x and 10x THROUGH A CASUALTY',
     tc.worst < 1e-9,
     'worst relative difference ' + tc.worst.toExponential(3) + (tc.at ? ' at ' + tc.at : '') +
     ' over ' + tc.n + ' instants');
  ck('SI-7', '...and at 10x against 60x, through the same casualty',
     tc6.worst < 1e-9,
     'worst relative difference ' + tc6.worst.toExponential(3) + (tc6.at ? ' at ' + tc6.at : '') +
     ' over ' + tc6.n + ' instants');

  /* ---- 3. THE MECHANISM, NAMED. A trajectory check says something is wrong; this says
   * WHERE. `sinceEval` is a local in `tick()`, re-initialised to 0 every broadcast, so the
   * "sim-time cadence" cannot carry across broadcasts and degenerates to the broadcast rate
   * once a broadcast is shorter than PROTECTION_DT. Asserted against the SOURCE, because the
   * defect is structural and a trajectory can only ever be evidence for it. */
  head('THE MECHANISM  [named in the source, not inferred from a trajectory]');
  /* ⚠ COMMENTS ARE STRIPPED FIRST, and that is not fussiness — the first version of this check
   * matched `/var\s+sinceEval\s*=\s*0\s*;/` against the raw source and went on failing after the
   * fix landed, because the fix's OWN COMMENT quotes the defective line it replaced. A source
   * scan that cannot tell code from prose reports the thing it is describing. It also asserts
   * the POSITIVE now (the accumulator is read from the instance AND written back), because
   * "the bad line is absent" is satisfied by deleting the mechanism altogether. */
  var tickAt = SVC_SRC.indexOf('SimulationService.prototype.tick =');
  var tickBody = SVC_SRC.slice(tickAt, tickAt + 12000)
                        .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  var reads = /var\s+sinceEval\s*=\s*this\._sinceEval\s*\|\|\s*0\s*;/.test(tickBody);
  var writes = /this\._sinceEval\s*=\s*sinceEval\s*;/.test(tickBody);
  var perTick = /var\s+sinceEval\s*=\s*0\s*;/.test(tickBody);
  ck('SI-6', '`sinceEval` carries ACROSS broadcasts — a per-tick local cannot hold a sim-time cadence',
     reads && writes && !perTick,
     perTick ? 'still declared `var sinceEval = 0;` inside tick() — resets every broadcast (#588)'
             : (reads && writes ? 'read from the instance and written back'
                                : 'reads=' + reads + ' writes=' + writes + ' — the accumulator ' +
                                  'does not round-trip, so the cadence cannot carry'));
}

/* ---- RUN ------------------------------------------------------------------------------- */
console.log('\nPWR2 service — TIME-ACCELERATION INVARIANCE (#588)');
var RD = loadAll(undefined), rec = [];
runSuite(RD, rec, false);

var nPass = 0, nXfail = 0, nFail = 0, nXpass = 0;
rec.forEach(function (r) {
  if (r.ok && !XFAIL[r.id]) nPass++;
  else if (!r.ok && XFAIL[r.id]) nXfail++;
  else if (!r.ok) nFail++;
  else nXpass++;
});

if (nXfail) {
  console.log('\nKNOWN GAPS (xfail) — tracked, not regressions:');
  rec.forEach(function (r) {
    if (!r.ok && XFAIL[r.id]) console.log('  ' + r.id + ': ' + XFAIL[r.id]);
  });
}
if (nXpass) {
  console.log('\n** XPASS — a gap closed and its XFAIL entry is now stale. Delete it. **');
  rec.forEach(function (r) { if (r.ok && XFAIL[r.id]) console.log('  ' + r.id); });
}

/* ---- INJECTION SELF-TEST ----------------------------------------------------------------
 * A check written beside its own subject is not green until it has been made to go red. The
 * mutations break the invariance DELIBERATELY; each must redden a check that is not already
 * an xfail, or this gate is measuring nothing. */
/* ⚠ EVERY MUTATION HERE IS A REAL DEFECT, and two that looked like defects were removed once
 * the gate showed they are not. Both came back BLIND and neither was a gate failure:
 *
 *   "automation stepped once per broadcast with the lumped dt" — EQUIVALENT. `stepAutomation`
 *   accumulates dt against its own sim-time cadence internally, exactly as `:333` claims, so
 *   delivering 5 x 0.02 s or 1 x 0.10 s produces the same plant. The mutation was testing the
 *   claim by breaking something that is not there to break.
 *
 *   "the post-loop call over-counts with PROTECTION_DT instead of the accrued time" — EQUIVALENT
 *   SINCE THE FIX. The post-loop call now only fires when `sinceEval >= PROTECTION_DT`, so the
 *   constant and the variable agree to the epsilon. It WAS a defect before the fix, and the fix
 *   is what retired it. Worth the four lines to say so: a mutation that stops being catchable
 *   because the code got better is the opposite of a blind spot, and it looks identical.
 *
 * The two replacements below re-introduce #588 itself, one half at a time — the strongest form
 * of regression guard there is for a fix, because each half alone must still be caught. */
var MUTATIONS = [
  ['the in-loop sim-time cadence is disabled (protection falls to the broadcast rate)',
   'if (sinceEval >= PROTECTION_DT - 1e-9 && i < steps - 1) {',
   'if (false && i < steps - 1) {'],
  ['#588 RETURNS, half one: the accumulator stops carrying across broadcasts',
   'this._sinceEval = sinceEval;', 'this._sinceEval = 0;'],
  ['#588 RETURNS, half two: the post-loop evaluation fires every broadcast again',
   'if (sinceEval >= PROTECTION_DT - 1e-9) {', 'if (true) {'],
  ['the fine-sample budget leaks into the step loop (a per-broadcast quantity reaching physics)',
   'this.engine.step(PHYSICS_DT);',
   'this.engine.step(PHYSICS_DT * (1 + 1e-9 * steps));']
];

/* This list held one mutation while SI-2/SI-4 were xfail, because the only checks that could
 * see it were the ones already declared failing. Both are live now and it has been PROMOTED
 * into MUTATIONS above. Kept as an empty seam with its history, because the rule it encodes is
 * the point: a blind spot the gate creates for ITSELF is a gate failure; a blind spot an open,
 * named gap creates is a fact about the gap, and it must be named rather than scored. */
var MUTATIONS_BLOCKED = [];

console.log('\n' + '='.repeat(70));
console.log('  INJECTION SELF-TEST — every mutation MUST redden a check that is not an xfail');
console.log('='.repeat(70));
var blind = 0;
MUT.select(MUTATIONS).forEach(function (m) {
  if (SVC_SRC.indexOf(m[1]) === -1) { console.log('  ERROR   anchor not found: ' + m[0]); blind++; return; }
  var r2 = [];
  try {
    var RD2 = loadAll(SVC_SRC.split(m[1]).join(m[2]));
    runSuite(RD2, r2, true);
  } catch (e) { r2.push({ id: 'threw', ok: false }); }
  var reddened = r2.filter(function (r) { return !r.ok && !XFAIL[r.id]; }).length;
  if (reddened === 0) { blind++; console.log('  BLIND TO  ' + m[0] + '   <-- THIS GATE CANNOT SEE IT'); }
  else console.log('  caught    ' + m[0].padEnd(62) + reddened + ' red');
});
MUTATIONS_BLOCKED.forEach(function (m) {
  console.log('  blocked   ' + m[0]);
  console.log('            (' + m[1] + ')');
});
loadAll(undefined);                                    /* restore the shipped service */

console.log('\n' + '='.repeat(70));
console.log('  injection self-test: ' + (MUTATIONS.length - blind) + '/' + MUTATIONS.length +
  ' mutations caught' + (blind ? '  ** ' + blind + ' BLIND SPOTS — GATE FAILS **' : ', no blind spots'));
console.log('  run_service_invariance: ' + nPass + ' passed, ' + nXfail + ' xfail, ' +
  nFail + ' failed' + (nXpass ? ', ' + nXpass + ' XPASS' : '') + '  (' + rec.length + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit((nFail > 0 || nXpass > 0 || blind > 0) ? 1 : 0);
