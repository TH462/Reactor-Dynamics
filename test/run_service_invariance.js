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
 * NOTHING CHECKED EITHER OF THEM. This runner does, and it is the check that would have found
 * #588 without a browser: a large break with the station blacked out ends the session at one
 * acceleration and not at another, because the endgame sits on a cliff and ~1 % of perturbation
 * picks the branch. The perturbation comes from here.
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
var R = path.join(__dirname, '..');
var SRC = path.join(R, 'engines', 'pwr2');
if (typeof global.window === 'undefined') global.window = global;

var SVC_PATH = path.join(R, 'layers', 'simulation_service.js');
var SVC_SRC = fs.readFileSync(SVC_PATH, 'utf8').replace(/\r\n/g, '\n');

/* ---- THE KNOWN GAPS. Each names the issue, the measurement, and what closes it. --------- */
var XFAIL = {
  'SI-2': '#588 — protection is evaluated at the BROADCAST rate whenever a broadcast is ' +
          'shorter than PROTECTION_DT. `sinceEval` is a per-tick local in `tick()`, so the ' +
          'sim-time cadence does not carry across broadcasts: at 1x under the transient ' +
          'cadence (50 ms) the in-loop `sinceEval >= PROTECTION_DT` never fires and the ' +
          'post-loop call evaluates every 0.05 s. Measured 10.85 evaluations/sim-s at 1x ' +
          'against 10.00 at 10x and 60x. Closes by carrying `sinceEval` on the instance.',
  'SI-4': '#588 — the same defect, seen as a trajectory. Measured on a large break with the ' +
          'station blacked out: 267.31 psi at 200.0 s at 1x against 269.87 at 10x (0.96 %). ' +
          'Small, and it is the whole ballgame at the blowdown cliff — it decides whether the ' +
          'beyond-model latch fires at ~396 s or the plant recovers and runs for hours.',
  'SI-6': '#588 — the MECHANISM behind SI-2 and SI-4, asserted against the source rather than ' +
          'inferred from a trajectory. `tick()` declares `var sinceEval = 0;` as a per-tick ' +
          'local, so the accumulated sim time since the last protection evaluation is thrown ' +
          'away at every broadcast boundary. Closes by carrying it on the instance — at which ' +
          'point SI-2 and SI-4 should close with it, and all three XFAIL entries come out ' +
          'together. If one closes without the others, that is information.'
};

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
 * plant defect that did not exist. `evals` counts what the invariance claim is ABOUT. */
function ride(RD, speed, target, casualty) {
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
  var snap = null, guard = 0;
  while (svc.simTime < target && guard++ < 500000) snap = svc.advanceCycles(1);
  var ts = snap.true_state;
  return {
    speed: speed, simTime: svc.simTime, evals: evals, rate: evals / svc.simTime,
    P: ts.pressure_mpa, Tcore: ts.t_core_exit_c, inv: ts.core_inventory_pct,
    pwr: ts.power_pct, held: !!ts.model_held
  };
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
   * nowhere — and this is the half that PASSES, which is what makes the other half mean
   * something. Both legs land inside one 60x cycle of the target, so the comparison is at
   * matched sim time rather than at matched cycles. */
  head('QUIET PLANT  [200 s at power — the claim where nothing is moving]');
  var q1 = ride(RD, 1, 200, null), q10 = ride(RD, 10, 200, null), q60 = ride(RD, 60, 200, null);
  ck('SI-0', 'the legs land at comparable sim times, so the comparison is not vacuous',
     Math.abs(q1.simTime - q10.simTime) < 1.0 && q1.simTime >= 200 && q10.simTime >= 200,
     '1x ' + q1.simTime.toFixed(2) + ' s, 10x ' + q10.simTime.toFixed(2) +
     ' s, 60x ' + q60.simTime.toFixed(2) + ' s');
  ck('SI-1', 'protection is evaluated at the SAME rate per sim second at every acceleration',
     Math.abs(q1.rate - q10.rate) < 0.05 && Math.abs(q1.rate - q60.rate) < 0.05,
     q1.rate.toFixed(2) + ' / ' + q10.rate.toFixed(2) + ' / ' + q60.rate.toFixed(2) +
     ' per sim-s at 1x / 10x / 60x');
  ck('SI-3', 'the plant is the SAME plant at 1x and 10x (pressure, core temp, inventory)',
     rel(q1.P, q10.P) < 1e-3 && rel(q1.Tcore, q10.Tcore) < 1e-3 && rel(q1.inv, q10.inv) < 1e-3,
     'P ' + (q1.P * 145.038).toFixed(3) + ' vs ' + (q10.P * 145.038).toFixed(3) + ' psi (' +
     (100 * rel(q1.P, q10.P)).toFixed(4) + ' %)');

  /* ---- 2. A TRANSIENT. This is where it breaks, and it is the regime the claim is FOR:
   * nobody fast-forwards a steady plant. The casualty is the one #588 was found on. */
  head('TRANSIENT  [large break + station blackout — the regime the claim exists for]');
  var t1 = ride(RD, 1, 200, LOCA), t10 = ride(RD, 10, 200, LOCA);
  ck('SI-5', 'both transient legs land at comparable sim times',
     Math.abs(t1.simTime - t10.simTime) < 0.5,
     '1x ' + t1.simTime.toFixed(2) + ' s, 10x ' + t10.simTime.toFixed(2) + ' s');
  ck('SI-2', 'protection is evaluated at the same rate per sim second IN A TRANSIENT',
     Math.abs(t1.rate - t10.rate) < 0.05,
     t1.rate.toFixed(2) + ' vs ' + t10.rate.toFixed(2) + ' per sim-s — the broadcast cadence ' +
     'halves to 50 ms in a transient, which is BELOW PROTECTION_DT (0.1 s) at 1x');
  /* ⚠ AND ABOVE 1x IT HOLDS EXACTLY, which is what makes SI-2/SI-4 a bounded defect rather
   * than a vague one. 10x / 30x / 60x agree to every printed digit through the same casualty,
   * because a broadcast at those speeds covers >= PROTECTION_DT and the in-loop sim-time
   * cadence governs. The break binds at 1x-2x ONLY: the speed a player watches a casualty in,
   * and the speed no gate uses. This is a LIVE check on a MOVING plant — SI-3's quiet plant is
   * too insensitive to catch a cadence mutation, which the injection self-test below proves. */
  var t60 = ride(RD, 60, 198, LOCA), t10b = ride(RD, 10, 198, LOCA);
  ck('SI-7', 'above 1x the plant is BIT-FOR-BIT the same plant through a casualty (10x vs 60x)',
     rel(t10b.P, t60.P) < 1e-9 && rel(t10b.inv, t60.inv) < 1e-9 &&
     Math.abs(t10b.rate - t60.rate) < 1e-9 && Math.abs(t10b.simTime - t60.simTime) < 1e-9,
     'P ' + (t10b.P * 145.038).toFixed(4) + ' vs ' + (t60.P * 145.038).toFixed(4) + ' psi, ' +
     'inventory ' + t10b.inv.toFixed(4) + ' vs ' + t60.inv.toFixed(4) + ' %, both at ' +
     t10b.simTime.toFixed(2) + ' s');
  ck('SI-4', 'the plant is the SAME plant at 1x and 10x THROUGH A CASUALTY',
     rel(t1.P, t10.P) < 1e-3 && rel(t1.inv, t10.inv) < 1e-3,
     'P ' + (t1.P * 145.038).toFixed(2) + ' vs ' + (t10.P * 145.038).toFixed(2) + ' psi (' +
     (100 * rel(t1.P, t10.P)).toFixed(2) + ' %), inventory ' + t1.inv.toFixed(3) + ' vs ' +
     t10.inv.toFixed(3) + ' % (' + (100 * rel(t1.inv, t10.inv)).toFixed(2) + ' %)');

  /* ---- 3. THE MECHANISM, NAMED. A trajectory check says something is wrong; this says
   * WHERE. `sinceEval` is a local in `tick()`, re-initialised to 0 every broadcast, so the
   * "sim-time cadence" cannot carry across broadcasts and degenerates to the broadcast rate
   * once a broadcast is shorter than PROTECTION_DT. Asserted against the SOURCE, because the
   * defect is structural and a trajectory can only ever be evidence for it. */
  head('THE MECHANISM  [named in the source, not inferred from a trajectory]');
  var tickBody = SVC_SRC.slice(SVC_SRC.indexOf('SimulationService.prototype.tick ='),
                               SVC_SRC.indexOf('SimulationService.prototype.tick =') + 4000);
  ck('SI-6', '`sinceEval` carries ACROSS broadcasts — a per-tick local cannot hold a sim-time cadence',
     !/var\s+sinceEval\s*=\s*0\s*;/.test(tickBody),
     /var\s+sinceEval\s*=\s*0\s*;/.test(tickBody)
       ? 'declared `var sinceEval = 0;` inside tick() — resets every broadcast (#588)'
       : 'not a per-tick local');
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
var MUTATIONS = [
  ['protection evaluated once per BROADCAST instead of on its sim-time cadence',
   'if (sinceEval >= PROTECTION_DT', 'if (false && sinceEval >= PROTECTION_DT'],
  ['automation stepped once per broadcast instead of per physics step',
   'if (this.layer.stepAutomation) this.layer.stepAutomation(PHYSICS_DT);',
   'if (this.layer.stepAutomation && i === 0) this.layer.stepAutomation(PHYSICS_DT * steps);'],
  ['the fine-sample budget leaks into the step loop (a per-broadcast quantity reaching physics)',
   'this.engine.step(PHYSICS_DT);',
   'this.engine.step(PHYSICS_DT * (1 + 1e-9 * steps));']
];

/* ⚠ DECLARED, NOT HIDDEN: a mutation this gate cannot see WHILE #588's xfails stand, because
 * the only checks that would notice it are the ones already declared failing. It is named and
 * reported but not scored. A blind spot the gate creates for ITSELF is a gate failure; a blind
 * spot an open, named gap creates is a fact about the gap. Whoever closes #588 should promote
 * this into MUTATIONS and expect it to be caught. */
var MUTATIONS_BLOCKED = [
  ['the post-loop protection call over-counts with PROTECTION_DT instead of the accrued time',
   'only SI-2 / SI-4 (the 1x legs) can see a post-loop dt change, and both are xfail on #588']
];

console.log('\n' + '='.repeat(70));
console.log('  INJECTION SELF-TEST — every mutation MUST redden a check that is not an xfail');
console.log('='.repeat(70));
var blind = 0;
MUTATIONS.forEach(function (m) {
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
