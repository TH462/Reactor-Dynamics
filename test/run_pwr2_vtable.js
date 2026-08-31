/* run_pwr2_vtable.js — gate for the ruled (quality, P) specific-volume table. (#479)
 *
 * The table exists for one reason — D1 §26 measured the stack missing its own performance stop
 * condition by 103x, with the entire deficit in `rho_from_h`. So this gate asserts the two things
 * that reason implies, and one that it does not:
 *
 *   1. IT IS FAST ENOUGH TO CLEAR THE STOP CONDITION. Not "faster" — fast enough, measured
 *      against the budget the design set for itself.
 *   2. IT IS ACCURATE INSIDE THE DECLARED ENVELOPE. Reported by region, because a single
 *      worst-case number hides which regime is weak.
 *   3. **IT CANNOT DRIFT FROM THE CORRELATIONS.** The table is generated from Layer 0 at load, so
 *      the gate proves the generation is live rather than a stale copy pasted in. A stored table
 *      that silently disagreed with its own source would be the second-source-of-truth failure
 *      this engine keeps designing against.
 *
 * Run: node test/run_pwr2_vtable.js
 */
'use strict';
var fs = require('fs'), path = require('path');
var E = path.join(__dirname, '..', 'engines', 'pwr2');
var LIB = path.join(E, 'pwr2_vtable.js');
var SRC = fs.readFileSync(LIB, 'utf8').replace(/\r\n/g, '\n');
require(path.join(E, 'pwr2_water.js'));
var W = globalThis.RD.pwr2.water;

function loadFrom(src) {
  var root = { RD: { pwr2: { water: W } } };
  var body = src.replace("(typeof globalThis !== 'undefined' ? globalThis : this)", '(RD_ROOT)') +
             '\nreturn RD_ROOT.RD.pwr2.vtable;';
  return new Function('RD_ROOT', body)(root);
}

function runSuite(T, rec, quiet) {
  function ck(name, got, want, tol, unit) {
    var d = Math.abs(got - want), ok = d <= tol && isFinite(got);
    rec.push({ name: name, ok: ok });
    if (!quiet) console.log((ok ? '  PASS  ' : '  FAIL  ') + name.padEnd(48) +
      'got ' + got.toExponential(3) + ' (tol ' + tol + ') ' + (unit || ''));
  }
  function ckT(name, cond, note) {
    rec.push({ name: name, ok: !!cond });
    if (!quiet) console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (note ? '  -- ' + note : ''));
  }
  /* worst relative error against the DIRECT Layer 0 path, optionally restricted to the
   * temperature range the liquid correlations actually claim */
  function worst(xlo, xhi, plo, phi, envOnly) {
    var w = 0, at = null;
    for (var pi = 0; pi < 50; pi++) {
      var P = plo * Math.pow(phi / plo, (pi + 0.37) / 50);
      var hf = W.h_f(P), hg = W.h_g(P);
      for (var xi = 0; xi < 70; xi++) {
        var x = xlo + (xhi - xlo) * (xi + 0.41) / 70, h = hf + x * (hg - hf);
        if (envOnly && W.T_from_h(h, P) < 20.5) continue;
        var a = W.rho_from_h(h, P), b = T.rho_from_h(h, P), e = 100 * (b - a) / a;
        if (Math.abs(e) > Math.abs(w)) { w = e; at = { P: P, x: x }; }
      }
    }
    return { w: w, at: at };
  }

  /* ---- 1. FAST ENOUGH TO CLEAR THE STOP CONDITION ------------------------------------ */
  if (!quiet) console.log('\nSPEED  [D1 §26: the stack missed its budget by 103x, all of it here]');
  /* #514 made the table build LAZY (first use, not load) — trigger it OUTSIDE the timed
   * window, or the ~0.5 s build lands inside the 400k-call loop and reads as ~1230 ns/call
   * of phantom property cost (measured: the ratio check reported 18x on a table that was
   * still 267x). The claim under test is the steady-state call cost, unchanged. */
  T.rho_from_h(1300, 15.41);
  var N = 400000, t0 = process.hrtime.bigint();
  for (var i = 0; i < N; i++) T.rho_from_h(1300 + i % 400, 15.41);
  var ns = Number(process.hrtime.bigint() - t0) / N;
  var t1 = process.hrtime.bigint(), M = 3000;
  for (var j = 0; j < M; j++) W.rho_from_h(1300 + j % 400, 15.41);
  var nsDirect = Number(process.hrtime.bigint() - t1) / M;
  ckT('the table is at least 100x faster than the direct path', nsDirect / ns > 100,
      ns.toFixed(0) + ' ns vs ' + nsDirect.toFixed(0) + ' ns = ' + (nsDirect / ns).toFixed(0) + 'x');
  /* ⚠ THE BUDGET FIGURE IS REPORTED, NOT ASSERTED, AND THAT IS DELIBERATE.
   * An absolute wall-clock threshold is FLAKY IN THIS SUITE: run_all executes 10-way parallel,
   * and CLAUDE.md already records that "per-runner times in a parallel run are CONTENTION times,
   * not costs". Asserted, this check passed standalone and FAILED inside run_all on the very
   * first aggregate run — a gate that reddens because the machine was busy teaches nothing and
   * trains people to ignore it.
   * The RATIO above is the contention-robust form of the same claim: both paths slow down
   * together, so their ratio survives load. The absolute number belongs in a dedicated
   * performance measurement, not in a gate. */
  var stepsPerSec = 1e9 / (ns * 132);
  if (!quiet) {
    console.log('        REPORTED (not asserted -- contention-sensitive): ' +
      stepsPerSec.toFixed(0) + ' steps/s from property cost alone, i.e. 12 plant-hours in ' +
      (2160000 / stepsPerSec).toFixed(1) + ' s against a 35 s budget');
  }
  /* MEMORY IS A MEASURED SIZE, NOT A GENEROUS ONE.
   * `NH` sat at 2000 with a comment claiming it was "where the accuracy lives". An adversarial
   * mutation cut it to 200 and reddened NOTHING -- and the measurement that followed showed
   * accuracy is FLAT from 100 to 4000 in every region, because it is carried by the correction
   * passes, not the grid. So the surviving mutation was right and the comment was wrong.
   *
   * The honest close is not a check pinning resolution for accuracy's sake -- there is nothing
   * there to protect. It is a check on the thing that DOES change, so a future inflation has to
   * justify itself in the same terms. This engine loads in a browser; 5x the array for no
   * measured gain is a cost with no counterpart. */
  ckT('the table is held to its MEASURED size, not a generous one',
      T.footprintBytes() < 260 * 1024,
      (T.footprintBytes() / 1024).toFixed(1) + ' kB -- NH=400 on the measured asymptote; at ' +
      'NH=2000 this reads ' + ((T.footprintBytes() + 1600 * 6 * 8) / 1024).toFixed(1) +
      ' kB for a 4th-decimal accuracy change');

  ckT('property cost is no longer the binding constraint it was',
      nsDirect / ns > 100 && ns < 5000,
      'at ' + ns.toFixed(0) + ' ns/call the 31,500 ns direct path is gone as the bottleneck');

  /* ---- 2. ACCURATE INSIDE THE DECLARED ENVELOPE -------------------------------------- */
  if (!quiet) console.log('\nACCURACY BY REGION  [ruled 0.06 %; reported per regime, not as one number]');
  var op = worst(-1.2, 1.2, 5, 17, true);
  ckT('OPERATING envelope (5-17 MPa) meets the ruled 0.06 %', Math.abs(op.w) < 0.06,
      op.w.toFixed(4) + ' %');
  var dome = worst(0, 1, 0.1, 18, false);
  ckT('two-phase dome is near-exact', Math.abs(dome.w) < 0.02, dome.w.toFixed(4) + ' %');
  var sub = worst(-2.0, -0.01, 0.1, 18, true);
  ckT('subcooled, inside the 20 degC liquid floor', Math.abs(sub.w) < 0.12, sub.w.toFixed(4) + ' %');
  var sup = worst(1.01, 1.5, 0.1, 18, false);
  ckT('superheat', Math.abs(sup.w) < 0.12, sup.w.toFixed(4) + ' %');
  var deep = worst(1.5, 2.5, 0.1, 18, false);
  ckT('deep superheat is the loosest region, and DECLARED', Math.abs(deep.w) < 1.0,
      deep.w.toFixed(4) + ' % at x > 1.5 -- very dry steam, severe-accident territory');

  /* ---- 2b. THE DERIVATIVE, WHICH IS WHAT THE SOLVER ACTUALLY READS -------------------
   * ADDED after the first wiring attempt was reverted (D1 §27). The table met the ruled 0.06 %
   * on rho and its d(rho)/dP was **57 % wrong at the scale a timestep moves pressure** — and all
   * 17 checks here passed anyway, because every one of them asserted a VALUE.
   *
   * **AN ACCURACY TARGET ON A VALUE SAYS NOTHING ABOUT ITS DERIVATIVE.** The pressure solve reads
   * dF/dP = SUM V*d(rho)/dP, so a 57 % error there is a 57 % error in the plant's pressure
   * RESPONSE — which is Tier A coupling A3, "pressure follows temperature". The level was right
   * and the response was not.
   *
   * Probed at +/-0.02 MPa deliberately: that is the scale a step moves pressure, and it is far
   * finer than the grid. A probe wide enough to span a grid interval reads the interval AVERAGE
   * and hides exactly this defect — measured, the same table read -0.1 % at +/-0.40 MPa while
   * being -57 % wrong at the scale that matters. */
  if (!quiet) console.log('\nd(rho)/dP  [probed at the scale a TIMESTEP moves pressure, not a grid interval]');
  [[1250, 15.41], [1362, 15.41], [1300, 15.41], [700, 1.0], [400, 5.0]].forEach(function (c) {
    var e = 0.02;
    var dD = (W.rho_from_h(c[0], c[1] + e) - W.rho_from_h(c[0], c[1] - e)) / (2 * e);
    var dT = (T.rho_from_h(c[0], c[1] + e) - T.rho_from_h(c[0], c[1] - e)) / (2 * e);
    ck('d(rho)/dP at h=' + c[0] + ', P=' + c[1] + ' (rel)', dT / dD, 1.0, 0.06, '(ratio)');
  });
  var eD = 0.02, hm = W.h_f(7) + 0.3 * (W.h_g(7) - W.h_f(7));
  var dDm = (W.rho_from_h(hm, 7 + eD) - W.rho_from_h(hm, 7 - eD)) / (2 * eD);
  var dTm = (T.rho_from_h(hm, 7 + eD) - T.rho_from_h(hm, 7 - eD)) / (2 * eD);
  ck('d(rho)/dP inside the dome (rel)', dTm / dDm, 1.0, 0.06, '(ratio)');

  /* ---- 3. THE RULING'S CORE PROPERTY: EXACT IN QUALITY ------------------------------- */
  if (!quiet) console.log('\nLINEAR IN QUALITY  [why the ruling says tabulate v and not rho]');
  [1.0, 7.0, 15.41].forEach(function (P) {
    var vf = T.v_from_x(0, P), vg = T.v_from_x(1, P);
    var wq = 0;
    for (var x = 0.05; x < 1; x += 0.05) {
      var lin = vf + x * (vg - vf), got = T.v_from_x(x, P);
      wq = Math.max(wq, Math.abs(got - lin) / lin);
    }
    ck('v is linear in x at ' + P + ' MPa', wq, 0, 1e-12, '(rel)');
  });
  /* A rho-table would NOT be linear here, and the ruling records that it is 762 % wrong at
   * 0.12 MPa. Demonstrate the size of what tabulating the wrong variable would have cost. */
  var Pd = 0.12, vf0 = T.v_from_x(0, Pd), vg0 = T.v_from_x(1, Pd);
  var vMid = T.v_from_x(0.5, Pd), rhoMid = 1 / vMid;
  var rhoLinear = 0.5 * (1 / vf0) + 0.5 * (1 / vg0);
  ckT('a rho-table would be grossly wrong at 0.12 MPa (the ruling says 762 %)',
      Math.abs(rhoLinear - rhoMid) / rhoMid > 3,
      'linear-in-rho gives ' + rhoLinear.toFixed(2) + ' against the correct ' + rhoMid.toFixed(2) +
      ' kg/m3 = ' + (100 * (rhoLinear - rhoMid) / rhoMid).toFixed(0) + ' % high');

  /* ---- 4. THE KINK IS ON A GRID LINE AND SURVIVES ------------------------------------ */
  if (!quiet) console.log('\nTHE KINK  [x = 0 and x = 1 are grid lines so it is reproduced, not averaged]');
  [1.0, 7.0, 15.41].forEach(function (P) {
    var e = 1e-6;
    var below = (T.v_from_x(-e, P) - T.v_from_x(-2 * e, P)) / e;
    var above = (T.v_from_x(e, P) - T.v_from_x(0, P)) / e;
    /* The jump size is v_g/v_f, which COLLAPSES toward the critical point — ~1600x at 0.1 MPa
     * but only ~6x at 15.41. A fixed 10x threshold asserted something false at high pressure;
     * the physical claim is that the slope jumps by the volume ratio, so test against that. */
    var ratio = T.v_from_x(1, P) / T.v_from_x(0, P);
    ckT('dv/dx jumps at x = 0 by the volume ratio (' + P + ' MPa)',
        Math.abs(above) > Math.abs(below) * Math.min(10, ratio * 0.6),
        'slope ' + below.toExponential(2) + ' -> ' + above.toExponential(2) +
        '  (v_g/v_f = ' + ratio.toFixed(1) + ')');
  });

  /* ---- 5. IT CANNOT DRIFT FROM THE CORRELATIONS -------------------------------------- */
  if (!quiet) console.log('\nNO SECOND SOURCE OF TRUTH  [the table is GENERATED, not stored]');
  /* NOT "exact at grid points" — that over-claims, and the first draft of this check asserted it
   * and failed. The 1-D saturation tables run on a 400-point grid and the 2-D wing table on a
   * coarser one, so a 2-D grid point still reconstructs through a 1-D interpolation. What IS true,
   * and is what matters, is that every value traces to Layer 0 through v_exact with no stored
   * constants in between. */
  var gw = 0;
  (function () {
    var Pg = T.GRID.P, Xg = T.GRID.X;
    for (var a = 5; a < T.GRID.NP; a += 17) {
      for (var b = 2; b < T.GRID.NX; b += 23) {
        var ex = T.v_exact(Xg[b], Pg[a]), tb = T.v_from_x(Xg[b], Pg[a]);
        gw = Math.max(gw, Math.abs(tb - ex) / ex);
      }
    }
  })();
  ckT('the table tracks Layer 0 at its own grid points', gw < 2e-3,
      (100 * gw).toFixed(4) + ' % worst, sampled across the grid');
  ckT('v_exact is Layer 0 unchanged, so the two cannot disagree by construction',
      Math.abs(T.v_exact(0.5, 7.0) - 1 / W.rho_from_h(W.h_f(7) + 0.5 * (W.h_g(7) - W.h_f(7)), 7)) < 1e-12);
  ckT('the table is a sane size', T.bytes() / 1024 > 20 && T.bytes() / 1024 < 600,
      (T.bytes() / 1024).toFixed(0) + ' kB');
}

console.log('\nPWR2 -- the ruled (quality, P) specific-volume table');
var T = loadFrom(SRC), rec = [];
runSuite(T, rec, false);
var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;

var MUTATIONS = [
  ['tabulate rho instead of v (the ruling\'s named error)',
   'return vf + x * (vg - vf);                       /* EXACT in x */',
   'return 1 / ((1 - x) / vf + x / vg);'],
  ['dome no longer spanned by its edges',
   'if (x >= 0 && x <= 1) {', 'if (false) {'],
  ['the x = 1 normalisation boundary broken again',
   'var edge = Xg[j] >= 1 ? vg0 : vf0;', 'var edge = Xg[j] > 1 ? vg0 : vf0;'],
  ['saturation line dropped back onto the coarse grid', 'var NP1 = 400;', 'var NP1 = 12;'],
  ['wings stop normalising to their edge', 'Math.log(v / edge)', 'Math.log(v)'],
  ['pressure grid made linear instead of logarithmic',
   'Pg[i] = Math.exp(lnPmin + (lnPmax - lnPmin) * i / (NP - 1));',
   'Pg[i] = P_MIN + (P_MAX - P_MIN) * i / (NP - 1);'],
  ['x = 0 and x = 1 no longer exact grid lines (kink averaged away)',
   'for (i = 0; i < NDOME; i++) Xg[k++] = i / (NDOME - 1);',
   'for (i = 0; i < NDOME; i++) Xg[k++] = -0.017 + 1.031 * i / (NDOME - 1);'],
  ['the wing reconstruction loses its saturation edge',
   'return ratio * interp1(x > 1 ? LNVG : LNVF, P);', 'return ratio;'],
  ['subcooled pressure dependence goes back through the 2-D wing (kills d(rho)/dP)',
   'if (h < s.hf) return rho_sub(h, P);          /* analytic in P -- see the note above */', ''],
  ['the analytic compressibility term dropped',
   'return rs * (1 + (P - ps) / B);', 'return rs;'],
  ['the compressed-liquid enthalpy correction dropped',
   'var hs = h - lin(KCMP_H, ix) * (P - lin(PSAT_H, ix));', 'var hs = h;'],
  /* The engine's own comment claims the SECOND correction pass is load-bearing -- that it is the
   * difference between -0.0674 % and 0.0072 % against a ruled 0.06 %. A claim in a comment is an
   * unmeasured claim until something can make it fail (HR10), and the pass above only proves the
   * FIRST correction matters: neutering it leaves the second one to re-correct, which is exactly
   * the one-pass form. This mutation is the other half. */
  ['the SECOND correction pass dropped (one-pass form, the 12 % near-miss)',
   '    hs = h - lin(KCMP_H, ix) * (P - lin(PSAT_H, ix));\n    ix = hIndex(hs);\n    var rs =',
   '    var rs =']
,
  /* An adversarial pass shrank NH 2000 -> 200 and NOTHING reddened, because accuracy does not
   * live there (see the engine's own table). The honest close is therefore NOT a check pinning
   * the resolution for accuracy's sake -- it is a check on the thing that DOES change, memory,
   * so a future inflation back to 2000 has to justify itself. */
  ['the subcooled table silently inflated 5x in memory',
   'var NH = 400;', 'var NH = 2000;']];

/* ---- THE CLEAN-RUN GUARD --------------------------------------------------------------
 * A MUTATION SELF-TEST IS ONLY MEANINGFUL IF THE UNMUTATED SUITE IS GREEN. If any check fails in
 * the clean run it fails in every mutant too, so `f2 > 0` holds unconditionally and EVERY mutation
 * is reported as caught. Coverage then reads 25/25 while the suite is measuring nothing.
 *
 * MEASURED in run_pwr2_kinetics.js, 2026-08-16: a fixture producing NaN made one check fail in the
 * clean run. The self-test reported 23/25. Fixing that ONE check dropped it to 21/25 -- the two
 * extra "caught" mutations had never been caught by anything, and both were genuinely blind.
 *
 * So the tally is REFUSED, not annotated, when the clean run is red. */
if (fail > 0) {
  /* PRINT THE SCORE FIRST. run_all parses this line to report drift; exiting without it
   * makes a legitimately-failing gate read as `score ?`, which is LESS informative than
   * before the guard existed. The guard refuses the MUTATION TALLY, not the tally line. */
  console.log('  ' + require('path').basename(__filename, '.js') + ': ' + pass +
              ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
  console.log('  MUTATION SELF-TEST SKIPPED -- ' + fail + ' check(s) failed in the CLEAN run.');
  console.log('  A failing check fails in every mutant too, so every mutation would report as');
  console.log('  caught and the coverage number would be a lie. Fix the check first.');
  process.exit(1);
}

console.log('\n' + '='.repeat(70));
console.log('  INJECTION SELF-TEST -- every mutation MUST redden at least one check');
console.log('='.repeat(70));
var blind = 0;
MUTATIONS.forEach(function (m) {
  if (SRC.indexOf(m[1]) === -1) { console.log('  ERROR   anchor not found: ' + m[0]); blind++; return; }
  var r2 = [];
  try { runSuite(loadFrom(SRC.split(m[1]).join(m[2])), r2, true); }
  catch (e) { r2.push({ name: 'threw', ok: false }); }
  var f2 = r2.filter(function (r) { return !r.ok; }).length;
  if (f2 === 0) { blind++; console.log('  BLIND TO  ' + m[0] + '   <-- THIS GATE CANNOT SEE IT'); }
  else console.log('  caught    ' + m[0].padEnd(56) + f2 + ' red');
});

console.log('\n' + '='.repeat(70));
console.log('  injection self-test: ' + (MUTATIONS.length - blind) + '/' + MUTATIONS.length +
  ' mutations caught' + (blind ? '  ** ' + blind + ' BLIND SPOTS -- GATE FAILS **' : ', no blind spots'));
console.log('  run_pwr2_vtable: ' + pass + ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit((fail > 0 || blind > 0) ? 1 : 0);
