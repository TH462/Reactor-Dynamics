/* run_pwr2_kinetics.js — Layer 5 gate: point kinetics, decay heat and xenon. (#479)
 *
 * The claim this layer makes is that **analytic integration is not an optimisation, it is the only
 * thing that works** — so the checks are built as CONTRASTS, never as bands:
 *
 *   1. THE STABILITY CLAIM NEEDS ITS COUNTEREXAMPLE. "The analytic advance is stable" is satisfied
 *      by any integrator that happens not to blow up on the case you chose. The check therefore
 *      runs EXPLICIT EULER at the same real Lambda and requires it to DIVERGE. Without that half,
 *      the claim is unfalsifiable and the ruling it rests on is untested.
 *   2. THE PROMPT JUMP IS AN INDEPENDENT WITNESS. beta/(beta-rho) is nowhere in the engine. If the
 *      matrix exponential reproduces it, the solver is right for a reason this suite did not
 *      supply — which is worth more than matching a number the design document already published.
 *   3. THE POWER SPLIT MUST DIVERGE ON A SCRAM. Equal at every steady state, and apart the moment
 *      the rods drop. A check that only looks at steady state cannot tell the two quantities apart.
 *   4. CONSTRUCTION, written first (D1 §31).
 *   5. THE OPEN CONSTANTS ARE ASSERTED TO STILL BE FLAGGED. This gate goes green while the port is
 *      knowingly incomplete; it must therefore say so out loud rather than let three [tune]
 *      placeholders fade into the sourced set.
 *
 * Run: node test/run_pwr2_kinetics.js
 */
'use strict';
var fs = require('fs'), path = require('path');
var MUT = require('./mut_flags.js');   /* --no-mutations / --mut= / --grp= (#602) */
var E = path.join(__dirname, '..', 'engines', 'pwr2');
var LIB = path.join(E, 'pwr2_kinetics.js');
var SRC = fs.readFileSync(LIB, 'utf8').replace(/\r\n/g, '\n');
['pwr2_water', 'pwr2_vtable', 'pwr2_geometry', 'pwr2_core', 'pwr2_loop',
 'pwr2_sources', 'pwr2_fuel', 'pwr2_kinetics', 'pwr2_reactor'].forEach(function (f) { require(path.join(E, f + '.js')); });
/* pwr2_fuel is loaded ONLY to cross-check the Doppler reference, and pwr2_reactor ONLY for its
 * RATED_THERMAL_KW — the neutron source is derived from this plant's rated power and that number
 * lives in the reactor module (#536). The engine files stay independent of each other; it is the
 * GATE that ties them together, which is the right place for a consistency claim spanning two
 * modules. The globals they install are NOT what the suite runs: `loadFrom` builds an isolated
 * copy of the kinetics module, which is what makes the mutation replay meaningful. */
var RD = globalThis.RD.pwr2, W = RD.water, S = RD.sources;

function loadFrom(src) {
  var root = { RD: { pwr2: { water: RD.water, vtable: RD.vtable, core: RD.core,
                             geometry: RD.geometry, loop: RD.loop, sources: RD.sources } } };
  var body = src.replace("(typeof globalThis !== 'undefined' ? globalThis : this)", '(RD_ROOT)') +
             '\nreturn RD_ROOT.RD.pwr2.kinetics;';
  return new Function('RD_ROOT', body)(root);
}

/* THE SOURCE, RETYPED INDEPENDENTLY of the engine's copy — the ECCS discipline. The U-235 six-group
 * set and the ANSI/ANS 5.1-1971 decay fit, so a transcription slip cannot pass by equalling itself. */
var DOC = {
  beta_i:  [0.000215, 0.001424, 0.001274, 0.002568, 0.000748, 0.000273],
  lambda_i:[0.0124,   0.0305,   0.111,    0.301,    1.14,     3.01],
  beta: 0.006502,
  decayH0:     [0.0268319, 0.0193747, 0.00772324, 0.00855037],
  decayLambda: [0.0303948, 0.00130630, 0.0000794659, 0.00000287062],
  f0: 0.06248,
  lambda_I: 2.87e-5, lambda_X: 2.09e-5,
  mod_boron_zero_ppm: 986.0, mod_anchor_pcm_per_F: -31.43,
  /* RETYPED, because comparing the solve against the engine's OWN HZP block is circular:
   * moving the anchor moves the target with it and the check passes at any value. The
   * injection self-test caught exactly that. BEAVRS / Watts Bar U1 Cycle 1, OSTI 1991715. */
  hzp_boron_ppm: 975.0, hzp_temp_c: 291.67, boron_worth_pcm_per_ppm: 10.0,
  /* pwr2_fuel.steadyFuelTemp at 300 MWt / 304.5 degC — cross-checked against the module below. */
  t_fuel_ref_c: 684.2,
  rod_worth_control: 0.04068, rod_worth_shutdown: 0.03676,
  /* THE NEUTRON SOURCE's derivation inputs (#536), retyped from WTSM 2.1 (ML11223A207): nu = 2.43
   * for U-235 (Table 2.1-2, :1653) and "roughly 200 MeV per fission" (:227). `installed_n_per_s`
   * is the module's own OPEN value, read back rather than retyped — it is the one input that has
   * NO source, so a "retyped" copy of it would be theatre; what this gate can check is that the
   * published constant IS the derivation applied to it. */
  nu: 2.43, mev_per_fission: 200.0, joules_per_mev: 1.602e-13
};

function runSuite(K, rec, quiet) {
  function ck(name, got, want, tol, unit) {
    var d = Math.abs(got - want), ok = d <= tol && isFinite(got);
    rec.push({ name: name, ok: ok });
    if (!quiet) console.log((ok ? '  PASS  ' : '  FAIL  ') + name.padEnd(54) +
      'got ' + got.toPrecision(7) + ' want ' + want.toPrecision(7) + ' ' + (unit || ''));
  }
  function ckT(name, cond, note) {
    rec.push({ name: name, ok: !!cond });
    if (!quiet) console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (note ? '  -- ' + note : ''));
  }
  function plant() { return S.createPlant({ h: W.h_l(304.5, 15.41), P: 15.41 }); }
  /* A CRITICAL plant: rho_excess cancels the equilibrium xenon so the reference condition is
   * exactly critical. Without it the fixture is a subcritical reactor and every dynamic check
   * measures a shutdown instead of the thing it names. */
  /* A CRITICAL plant AT THE REQUESTED POWER — and the first version was not.
   * It set rho_excess = xenon_worth, which cancels xenon only at FULL power where X = X_eq_full.
   * At 5 % power the xenon term is just -233 pcm, so the excess overwhelmed it and the "critical"
   * fixture was +2267 pcm = 3.49 beta — PROMPT SUPERCRITICAL. The probe that used it drove power
   * toward Infinity and hung the gate. Cancel the xenon that is actually present. */
  function critical(P0) {
    var P = P0 === undefined ? 1.0 : P0;
    var k0 = K.createKinetics({ P: P });
    return K.createKinetics({ P: P,
                              rho_excess: K.OPEN.xenon_worth.value * (k0.X / k0.X_eq_full) });
  }
  /* THE REFERENCE CONDITION, READ FROM THE PLANT RATHER THAN RESTATED.
   *
   * This was `{ fuelTemp_c: 693.0, ..., modTemp_c: 304.5 }` — literals that were correct when
   * written and silently stopped being so. When pwr2_fuel.js derived the fuel reference down to
   * 581.8, `critical()` — which cancels only the xenon term and ASSUMES every other term is zero —
   * was suddenly handing the plant -278 pcm of Doppler, and five checks went red claiming the
   * SOLVER was broken. The solver was fine; the fixture was describing a plant that no longer
   * existed.
   *
   * A fixture that means "at the reference condition" must SAY that, not repeat today's value of
   * it. Same defect class as the rod-lineup finding of 2026-08-11: a premise ages independently of
   * the thing that relies on it, and nothing re-checks it. */
  var _ref = K.createKinetics({});
  var REF = { fuelTemp_c: _ref.T_fuel_ref_c, boron_ppm: 0, modTemp_c: _ref.T_mod_ref_c };
  /* COST ASYMMETRY — the mutation replay runs short horizons, the live pass runs real ones.
   * 23 mutations x probes that simulate 60-300 s of plant is minutes of compute, and a gate that
   * expensive stops being run (D1 §31, and the same mistake made in CVCS and RHR before it).
   * Every mutation here shows up in the first seconds: a mistyped constant, a lost 1/Lambda, a
   * truncated Taylor series. Only the STEADY-STATE and SCRAM claims need the real horizon, and
   * they are the ones whose bands widen below. */
  var HOLD  = quiet ? 200 : 1500;     /* 4 s vs 30 s — a critical plant that holds 30 s holds */
  var SCRAM = quiet ? 800 : 3000;     /* 16 s vs 60 s — the split is grossly apart within a minute,
                                       * and 300 s of plant cost 227 s of wall clock for no extra
                                       * discrimination. The horizon is chosen from what the CHECK
                                       * needs, not from what looks thorough. */

  /* ---- 1. THE SOURCED CONSTANTS ARE THE DOCUMENT'S ------------------------------------ */
  if (!quiet) console.log('\nSOURCED CONSTANTS  [retyped independently of the engine\'s copy]');
  var badB = 0, badL = 0;
  for (var i = 0; i < 6; i++) {
    if (Math.abs(K.DELAYED.beta_i[i] - DOC.beta_i[i]) > 1e-12) badB++;
    if (Math.abs(K.DELAYED.lambda_i[i] - DOC.lambda_i[i]) > 1e-12) badL++;
  }
  ckT('the six delayed-group betas match the U-235 set', badB === 0, '6 groups');
  ckT('the six decay constants match', badL === 0, '0.0124 to 3.01 /s');
  /* A pre-summed total that disagrees with its own parts is a defect waiting to happen. */
  var sumB = K.DELAYED.beta_i.reduce(function (a, b) { return a + b; }, 0);
  ck('beta equals sum(beta_i), not a separately-typed total', K.DELAYED.beta, sumB, 1e-12, '');
  var badD = 0;
  for (var j = 0; j < 4; j++) {
    if (Math.abs(K.DECAY.H0[j] - DOC.decayH0[j]) > 1e-12) badD++;
    if (Math.abs(K.DECAY.lambda[j] - DOC.decayLambda[j]) > 1e-12) badD++;
  }
  ckT('the four decay-heat groups match the ANSI/ANS 5.1-1971 fit', badD === 0,
      'NRC ML050910161 Table 8-3 + ML021720702 actinides, /1.2 App-K margin');
  ck('f0, the equilibrium decay fraction', K.f0(), DOC.f0, 1e-5, '');
  ck('iodine-135 decay constant', K.XENON.lambda_I, DOC.lambda_I, 1e-12, '/s');
  ck('xenon-135 decay constant', K.XENON.lambda_X, DOC.lambda_X, 1e-12, '/s');
  ck('the BEAVRS moderator zero-feedback boron', K.MOD.boron_zero_ppm, DOC.mod_boron_zero_ppm, 1e-9, 'ppm');
  ck('the BEAVRS moderator anchor', K.MOD.anchor_pcm_per_F, DOC.mod_anchor_pcm_per_F, 1e-9, 'pcm/degF');
  ck('the MTC envelope is Ginna\'s +5 pcm/degF', K.MOD.mtc_max_pcm_per_F, 5.0, 0, 'pcm/degF');
  ck('control bank worth (WTSM 2.2)', K.RODS.worth_control, DOC.rod_worth_control, 1e-12, 'dk/k');
  ck('shutdown bank worth (WTSM 2.2)', K.RODS.worth_shutdown, DOC.rod_worth_shutdown, 1e-12, 'dk/k');
  /* Lambda is the one the OLD engine got wrong by being right-looking: 0.01 s is marked "fixed"
   * there and is 500x physical. A real Lambda is what forces analytic integration. */
  ckT('Lambda is the REAL prompt generation time, not the old stability crutch',
      K.DELAYED.Lambda < 1e-4,
      K.DELAYED.Lambda + ' s against the old engine\'s 0.01 s, which was marked "fixed" and is ' +
      '500x physical');

  /* ---- 2. THE STABILITY CLAIM, WITH ITS COUNTEREXAMPLE -------------------------------- */
  if (!quiet) console.log('\nINTEGRATION  [the analytic claim is worthless without the explicit contrast]');
  var beta = K.DELAYED.beta, Lam = K.DELAYED.Lambda;
  function eulerOneStep(rho, dt) {
    var P = 1, C = [];
    for (var q = 0; q < 6; q++) C.push((K.DELAYED.beta_i[q] / K.DELAYED.lambda_i[q]) * P / Lam);
    var sumLC = 0;
    for (var z = 0; z < 6; z++) sumLC += K.DELAYED.lambda_i[z] * C[z];
    return Math.max(0, P + (((rho - beta) / Lam) * P + sumLC) * dt);
  }
  var C0 = [];
  for (var c0 = 0; c0 < 6; c0++) C0.push((K.DELAYED.beta_i[c0] / K.DELAYED.lambda_i[c0]) * 1 / Lam);
  ckT('EXPLICIT Euler at the real Lambda DIVERGES in one 0.02 s step  [the counterexample]',
      eulerOneStep(-0.05, 0.02) === 0,
      'n = ' + eulerOneStep(-0.05, 0.02).toExponential(2) + ' — PWR2_PHYSICS §15 measured exactly ' +
      'this, and it is why the analytic form is ruled rather than preferred');
  /* ⚠ EVERY CHECK IN THIS SECTION PASSES S = 0 EXPLICITLY, AND THAT IS THE POINT (#536).
   * These are claims about the SOLVER — that the analytic form is stable where explicit Euler
   * is not — and they must stay testable at 1e-9 now that the plant carries a neutron source.
   * The source makes an exactly critical reactor CREEP, which is a claim about the PLANT and is
   * asserted in its own section below. Widening this band to swallow the creep would have
   * destroyed the integrator claim to make room for a different one; they are separate, and
   * running the homogeneous case here also validates the 8x8 augmentation against the 7x7
   * behaviour it replaced (HR10: passing on BOTH is what makes it a better test). */
  var critStep = K.advance(1, C0, 0, 0.02, 0);
  ck('...while ANALYTIC holds a critical reactor critical, exactly', critStep.P, 1.0, 1e-9, '');
  var scram = K.advance(1, C0, -0.05, 0.02, 0);
  ckT('...and is stable scrammed, in ONE step', scram.P > 0.05 && scram.P < 0.5,
      'n = ' + scram.P.toFixed(6) + ' where explicit Euler returned zero');
  /* §15's own published figure, at the rho that reproduces it. */
  var s15 = K.advance(1, C0, -0.001008, 0.02, 0);
  ck('reproduces PWR2_PHYSICS §15\'s published n at -101 pcm', s15.P, 0.865167, 2e-5, '');

  /* THE INDEPENDENT WITNESS. beta/(beta-rho) appears NOWHERE in the engine. If the matrix
   * exponential lands on it, the solver is right for a reason this suite did not supply. */
  if (!quiet) console.log('\nPROMPT JUMP  [an independent witness -- this formula is not in the engine]');
  var pjBad = 0, pjWorst = 0;
  [-0.002, -0.005, -0.01, -0.025, -0.05].forEach(function (rho) {
    var got = K.advance(1, C0, rho, 0.02, 0).P, want = beta / (beta - rho);
    var rel = Math.abs(got - want) / want;
    if (rel > pjWorst) pjWorst = rel;
    if (rel > 0.06) pjBad++;
  });
  ckT('the analytic advance reproduces beta/(beta-rho) across five insertions', pjBad === 0,
      'worst ' + (100 * pjWorst).toFixed(2) + ' % — the prompt-jump approximation emerges from the ' +
      'matrix exponential without being coded');

  /* ---- 2a. THE NEUTRON SOURCE (#536) ---------------------------------------------------
   * WHAT WAS WRONG. There was no source term, so a subcritical core was a pure decaying
   * exponential: measured on the shipped shell at hot zero power, untouched for 300 s, power
   * fell 3.6031e-5 % -> 6.3798e-8 % (a factor of 568) while the board read a steady -0.341 dpm
   * and a -76 s period on a plant nobody was touching, and an hour after a scram it still read
   * -0.322 dpm / -81 s. WTSM 2.1 §2.1.10 (ML11223A207:1464) is the authority these checks are
   * written against: "the neutron population of a subcritical reactor does not decrease to 0; it
   * reaches an equilibrium value which depends on the source neutron strength and the value of
   * Keff" — N = S/(1 - Keff), which in this file's normalisation is P_eq = S·Lambda/(-rho).
   *
   * ⚠ NOT ONE OF THESE CHECKS IS THE ONE THE OLD GATE WOULD HAVE NEEDED. It scored 50/50 with
   * 25/25 mutations while the direct boron term did not exist, and it would have done the same
   * here: mutation testing perturbs code that EXISTS and is structurally blind to a term nobody
   * wrote. Same lesson, same file, second time (HR10). */
  if (!quiet) console.log('\nNEUTRON SOURCE  [a subcritical core LEVELS OFF -- it does not decay to nothing]');
  var SRC_S = K.OPEN.source.value, Lam2 = K.DELAYED.Lambda;
  /* 1. THE CONSTANT IS ITS OWN DERIVATION, and the rated power comes from the OTHER module —
   *    the two cannot drift apart without this failing. */
  var nRated = DOC.nu * (globalThis.RD.pwr2.reactor.RATED_THERMAL_KW * 1000 /
                         (DOC.mev_per_fission * DOC.joules_per_mev)) * Lam2;
  ck('the rated neutron population is nu x fission rate x Lambda, from pwr2_reactor\'s own rating',
     K.OPEN.source.N_rated / nRated, 1.0, 2e-3, '');
  ck('...and the source constant IS that derivation applied to the installed strength',
     SRC_S, K.OPEN.source.installed_n_per_s / nRated, 1e-9, '/s');
  ckT('the installed strength is FLAGGED as the one unsourced input, not buried in the number',
      /installed source STRENGTH is not/.test(K.OPEN.source.why) &&
      K.OPEN.source.installed_n_per_s > 0,
      K.OPEN.source.installed_n_per_s.toExponential(1) + ' n/s — DOE-HDBK-1019 NP-02 gives Cf-252 ' +
      'per GRAM and describes Sb-Be sources, but no corpus document gives an assembly total');
  /* 2. THE AUGMENTED VARIABLE MUST COME BACK EXACTLY 1. It is the multiplier on the source; if it
   *    drifts, the source silently scales with it and every equilibrium below moves together —
   *    which would look like a consistent plant rather than a defect. */
  ckT('the augmented constant propagates as EXACTLY 1, at every reactivity',
      [-0.05, -0.01, 0, 0.001].every(function (r) { return K.advance(1, C0, r, 0.02).one === 1; }),
      'the eighth state is the source multiplier — a drifting one rescales the source invisibly');
  /* 3. sourceLevel IS the sourced relation, and REFUSES where there is no equilibrium. */
  var slBad = 0;
  [-0.05, -0.011372, -0.001, -0.0001].forEach(function (r) {
    if (Math.abs(K.sourceLevel(r) - SRC_S * Lam2 / (-r)) > 1e-30) slBad++;
  });
  ckT('sourceLevel is N = S/(1-Keff) in this file\'s normalisation, S·Lambda/(-rho)', slBad === 0,
      'four margins from -5000 to -10 pcm');
  ckT('...and returns NaN at or above critical, where there is no equilibrium to report',
      isNaN(K.sourceLevel(0)) && isNaN(K.sourceLevel(0.001)),
      'a plausible number here would seed a critical plant from a meaningless one');
  /* 4. THE DEFECT ITSELF: a subcritical core seeded at its equilibrium STAYS THERE. The old
   *    engine fell 568x over this horizon. */
  var HOLDSUB = quiet ? 2500 : 15000;        /* 50 s vs 300 s — the issue's own horizon */
  (function () {
    var rho = -0.011372;                     /* the hot-zero-power initial condition's margin */
    var Peq = K.sourceLevel(rho), P = Peq, C = [];
    for (var i = 0; i < 6; i++) C.push((K.DELAYED.beta_i[i] / K.DELAYED.lambda_i[i]) * P / Lam2);
    for (var n = 0; n < HOLDSUB; n++) { var a = K.advance(P, C, rho, 0.02); P = a.P; C = a.C; }
    ckT('a subcritical core HOLDS its source level instead of decaying to nothing',
        Math.abs(P / Peq - 1) < 0.01,
        'P/P_eq = ' + (P / Peq).toFixed(5) + ' after ' + (HOLDSUB * 0.02) + ' s at -1137 pcm — ' +
        'the sourceless engine fell by a factor of 568 over 300 s here');
  })();
  /* 5. AND IT IS AN ATTRACTOR, NOT A FIXTURE. Seeding at equilibrium and finding it still there
   *    is satisfied by a frozen number; the claim is that the plant CONVERGES on it. Approach
   *    from both sides, because a one-sided approach is satisfied by a floor or a ceiling. */
  (function () {
    var rho = -0.011372, Peq = K.sourceLevel(rho), worst = 0;
    [10, 0.1].forEach(function (f) {
      var P = Peq * f, C = [];
      for (var i = 0; i < 6; i++) C.push((K.DELAYED.beta_i[i] / K.DELAYED.lambda_i[i]) * P / Lam2);
      for (var n = 0; n < HOLDSUB; n++) { var a = K.advance(P, C, rho, 0.02); P = a.P; C = a.C; }
      var d = Math.abs(P / Peq - 1);
      if (d > worst) worst = d;
    });
    ckT('...and it is an ATTRACTOR — the level converges on it from ABOVE and from BELOW',
        worst < (quiet ? 0.45 : 0.02),
        'worst departure ' + (100 * worst).toFixed(2) + ' % after ' + (HOLDSUB * 0.02) + ' s from ' +
        '10x and 0.1x — a frozen number would pass the previous check and fail this one');
  })();
  /* 6. 1/M — THE INVERSE COUNT RATE, which is what makes an approach to criticality readable and
   *    which was unrepresentable before this term existed. 1/P_eq = (-rho)/(S·Lambda) is a
   *    STRAIGHT LINE THROUGH THE ORIGIN in reactivity; WTSM §2.1.10: "because the source range CR
   *    gets infinitely large as Keff approaches 1.0 ... the inverse of CR is plotted. As
   *    criticality is approached, 1/CR approaches zero." */
  (function () {
    var slope = null, bad = 0;
    [-0.011372, -0.008, -0.004, -0.002, -0.001, -0.0005].forEach(function (r) {
      var s = (1 / K.sourceLevel(r)) / (-r);
      if (slope === null) slope = s;
      else if (Math.abs(s / slope - 1) > 1e-12) bad++;
    });
    ckT('1/M is LINEAR in reactivity and extrapolates to zero at criticality', bad === 0,
        'slope ' + slope.toExponential(4) + ' = 1/(S·Lambda) across six margins from -1137 to ' +
        '-50 pcm — the inverse-count-rate technique the campaign teaches');
  })();
  /* 7. THE INDEPENDENT WITNESS, and it is a conservation identity that appears NOWHERE in the
   *    engine. Summing the seven equations, d/dt(P + sum C) = rho/Lambda·P + S — so at exactly
   *    critical the TOTAL neutron-plus-precursor inventory grows at precisely S, whatever the
   *    split between them does. If the matrix exponential lands on that, the source is entering
   *    the system correctly for a reason this suite did not supply.
   *
   *    IT IS ALSO WHY THE CRITICAL-HOLD CHECK ABOVE SURVIVES: the inventory is ~4,240x the power,
   *    so the power's own creep is buffered by that factor — measured 1.6e-8 over 30 s, not the
   *    S·t = 3.3e-5 a naive reading predicts. The plant creeps; it does not ramp. */
  (function () {
    var P = 1, C = [], t0 = 1, N2 = quiet ? 300 : 1500;
    for (var i = 0; i < 6; i++) {
      C.push((K.DELAYED.beta_i[i] / K.DELAYED.lambda_i[i]) / Lam2); t0 += C[i];
    }
    for (var n = 0; n < N2; n++) { var a = K.advance(P, C, 0, 0.02); P = a.P; C = a.C; }
    var t1 = P; for (i = 0; i < 6; i++) t1 += C[i];
    ck('at EXACTLY critical the neutron+precursor inventory grows at precisely S  [identity]',
       (t1 - t0) / (SRC_S * N2 * 0.02), 1.0, 0.01, '');
    ckT('...while POWER only creeps, buffered by that inventory — it does not ramp at S',
        (P - 1) < SRC_S * N2 * 0.02 * 0.01 && P > 1,
        'power +' + (P - 1).toExponential(3) + ' over ' + (N2 * 0.02) + ' s against S·t = ' +
        (SRC_S * N2 * 0.02).toExponential(3) + ' — the source is inconsequential at criticality ' +
        '(WTSM §2.1.10), which is exactly why a source sized to the RETIRED plant\'s level would ' +
        'have been wrong: 5.7e-4 /s there would ramp this reactor at 0.05 %/s from nothing');
  })();
  /* 8. THE POST-TRIP SYMPTOM, which is the one a player sees. WTSM §2.1.10 describes both halves:
   *    the level "begins to decrease exponentially with a startup rate of -1/3 decade per minute"
   *    — which this plant already did — and then "the neutron population eventually levels off,
   *    because at equilibrium the addition of source neutrons just makes up for the losses". It
   *    was the LEVELLING that was missing: -0.322 dpm and -81 s for every hour of a 20 h ride,
   *    until kin.P underflowed to exactly 0.0 at 16.62 h and the board read "steady" on a core
   *    with an identically zero neutron population. */
  (function () {
    var rho = -0.0645, Peq = K.sourceLevel(rho);
    var P = Peq * 100, C = [], sur = null;
    for (var i = 0; i < 6; i++) C.push((K.DELAYED.beta_i[i] / K.DELAYED.lambda_i[i]) * P / Lam2);
    var steps = quiet ? 5000 : 15000, prev = P;
    for (var n = 0; n < steps; n++) { prev = P; var a = K.advance(P, C, rho, 0.02); P = a.P; C = a.C; }
    var ratio = P / prev, per = (ratio > 0 && ratio !== 1) ? 0.02 / Math.log(ratio) : Infinity;
    sur = isFinite(per) ? (60 / Math.LN10) / per : 0;
    ckT('a scrammed core LEVELS OFF at source level — startup rate goes to zero, not -1/3 dpm ' +
        'for ever', Math.abs(P / Peq - 1) < 0.02 && Math.abs(sur) < 0.02,
        'P/P_eq = ' + (P / Peq).toFixed(4) + ', SUR = ' + sur.toFixed(5) + ' dpm after ' +
        (steps * 0.02) + ' s from 100x equilibrium; the sourceless plant read -0.322 dpm and ' +
        '-81 s at every sample of a 20 h ride and underflowed to 0.0 at 16.62 h');
  })();

  /* ---- 2b. THE MIDPOINT RAMP CORRECTION, WHICH NOTHING GUARDED -----------------------
   * The first implementation of midpoint-rho was a NO-OP: it took a trial half-step and rebuilt a
   * state whose xenon line read `half.P >= 0 ? kin.X : kin.X` — both branches identical — so the
   * midpoint equalled the start-of-step value exactly and an entire matrix exponential was computed
   * and discarded. NO CHECK IN THIS SUITE COULD SEE IT: the physics was right either way, because a
   * no-op midpoint is just frozen-rho, which is §15's own fallback. Only a COST measurement exposed
   * it (72.8 -> 35.1 us per step).
   *
   * So the replacement gets a check that can fail. It must (a) do nothing when rho is steady, which
   * is when there is no ramp to correct, and (b) genuinely lead a RAMPING rho. */
  if (!quiet) console.log('\nMIDPOINT RHO  [a ramp correction -- the first attempt was a silent no-op]');
  var sysR = plant();
  var kSteady = critical(1.0), rS1 = null, rS2 = null;
  rS1 = K.stepKinetics(kSteady, sysR, 0.02, REF);
  rS2 = K.stepKinetics(kSteady, sysR, 0.02, REF);
  ckT('with rho STEADY the correction is inert, as it should be',
      Math.abs(rS2.rho - rS1.rho) < 1e-12,
      'no ramp means no correction — degrading to frozen-rho here is correct, not a failure');
  /* A RAMP: walk the rods in a little each step and watch the midpoint LEAD the raw value. */
  var kRamp = critical(1.0), leads = 0, sysR2 = plant();
  var prevRaw = null;
  for (var rr = 1; rr <= 12; rr++) {
    var g = [{ steps: 912 - rr * 6, max_steps: 912, worth: DOC.rod_worth_control }];
    var rrres = K.stepKinetics(kRamp, sysR2, 0.02, { fuelTemp_c: REF.fuelTemp_c, boron_ppm: 0,
                                                    modTemp_c: 304.5, rodGroups: g });
    /* kin.rho_last holds the RAW reactivity; the reported rho is the midpoint estimate. */
    if (prevRaw !== null && rrres.rho < kRamp.rho_last - 1e-12) leads++;
    prevRaw = kRamp.rho_last;
  }
  ckT('...and on a rod RAMP the midpoint LEADS the raw value  [it is doing something]',
      leads >= 8,
      leads + ' of 11 ramping steps had the midpoint ahead of the raw reactivity — a frozen-rho ' +
      'scheme would have led on NONE');

  /* THE HANG GUARD, CHECKED BY ASSERTION RATHER THAN BY MUTATION.
   * expm locked the process forever on a non-finite norm: Math.log2(Infinity/0.5) is Infinity, so
   * the squaring loop had no terminating bound. That is reachable physics — a prompt-supercritical
   * excursion drives power toward Infinity in a few steps at the real Lambda. It is checked here
   * and carries NO MUTATION, deliberately: a mutation that reintroduces a non-terminating loop
   * would hang this suite rather than redden it, and a self-test that can hang is worse than one
   * blind spot. A HANG IS WORSE THAN A WRONG ANSWER — a wrong answer reaches a check. */
  /* 8x8 since #536 — and sizing this 49 would have "passed" for the WRONG REASON: indices past
   * the array's end read undefined, the row sums go NaN, and the non-finite branch fires on the
   * short buffer rather than on the Infinity this check is about. Sized off the module. */
  var bad = new Float64Array(K.expm(new Float64Array(64)).length); bad[0] = Infinity;
  var t0 = Date.now(), badE = K.expm(bad), ms = Date.now() - t0;
  ckT('a non-finite matrix RETURNS rather than hanging', ms < 500 && !isFinite(badE[0]),
      'returned in ' + ms + ' ms as NaN; the first version never returned at all');

  /* ---- 3. PRECURSOR INITIALISATION ----------------------------------------------------- */
  if (!quiet) console.log('\nINITIALISATION  [get the 1/Lambda convention wrong and every IC jumps]');
  var k5 = K.createKinetics({ P: 0.05 });
  var expectC0 = (K.DELAYED.beta_i[0] / K.DELAYED.lambda_i[0]) * 0.05 / Lam;
  ck('precursors start at equilibrium WITH the 1/Lambda scaling', k5.C[0], expectC0, 1e-6, '');
  var kq = critical(0.05);   /* via the helper — an inline rho_excess here was the
                              * prompt-supercritical fixture that hung the gate */
  var sysq = plant(), rq = null;
  for (var q5 = 0; q5 < (quiet ? 100 : 500); q5++) rq = K.stepKinetics(kq, sysq, 0.02, REF);
  ckT('...so a 5 % initial condition does NOT jump on the first steps',
      Math.abs(rq.power - 0.05) / 0.05 < 0.02,
      'power ' + rq.power.toFixed(5) + ' after 10 s from a 0.05 start');
  ckT('a 5 % plant carries 5 % xenon, not full-power xenon',
      k5.X < K.xenonEq(1.0) * 0.5 && k5.X > 0,
      'X/X_eq_full = ' + (k5.X / k5.X_eq_full * 100).toFixed(1) + ' %');

  /* ---- 4. THE POWER SPLIT ------------------------------------------------------------- */
  if (!quiet) console.log('\nFISSION vs TOTAL  [equal at steady state; APART the moment rods drop]');
  var kc = critical(1.0), sysc = plant(), rc = null;
  for (var t = 0; t < HOLD; t++) rc = K.stepKinetics(kc, sysc, 0.02, REF);
  ck('a critical plant holds power', rc.power, 1.0, 1e-4, '');
  ck('...at zero net reactivity', rc.rho_pcm, 0, 1e-6, 'pcm');
  ckT('fission and TOTAL are equal at steady state',
      Math.abs(rc.fission_frac - rc.Q_total_frac) < 1e-6,
      'both ' + rc.power.toFixed(6) + ' — this is why no calibration moves');
  var ks = critical(1.0), syss = plant(), rs = null;
  var rods = [{ steps: 0, max_steps: 912, worth: DOC.rod_worth_control }];
  var dScram = { fuelTemp_c: REF.fuelTemp_c, boron_ppm: 0, modTemp_c: REF.modTemp_c, rodGroups: rods };
  for (var u = 0; u < SCRAM; u++) rs = K.stepKinetics(ks, syss, 0.02, dScram);
  ckT('after a scram they DIVERGE, and by a plant-sized amount',
      rs.Q_total_frac - rs.power > (quiet ? 0.005 : 0.01) && rs.power < (quiet ? 0.2 : 0.01),
      'fission ' + (rs.power * 100).toFixed(4) + ' % against TOTAL ' +
      (rs.Q_total_frac * 100).toFixed(3) + ' % — reading fission as core heat is wrong from the ' +
      'instant of a scram');
  /* FROZEN DECAY HEAT LOOKS EXACTLY LIKE A DECAY TAIL, because it is frozen AT the equilibrium
   * value. The only thing that distinguishes an integrating ladder from a constant is that it
   * FALLS after the fission source is removed. */
  ckT('...and the decay heat FALLS after the scram, rather than sitting at equilibrium',
      rs.decay_frac < K.f0() * 0.995 && rs.decay_frac > 0,
      (rs.decay_frac * 100).toFixed(3) + ' % against the ' + (K.f0() * 100).toFixed(3) +
      ' % equilibrium — a ladder that stopped integrating would still read equilibrium and still ' +
      'look like a tail');
  ckT('the decay tail is the difference, not an extra term',
      Math.abs((rs.Q_total_frac - rs.power * (1 - K.f0())) - rs.decay_frac) < 1e-9,
      'Q_total = P*(1-f0) + sum(H) exactly');

  /* ---- 5. FEEDBACK ------------------------------------------------------------------- */
  if (!quiet) console.log('\nFEEDBACK  [moderator reads REAL L0 density; boron appears TWICE]');
  var mtc0 = K.moderatorReactivity(305.5, 304.5, 0, 15.41) * 1e5;
  var mtc700 = K.moderatorReactivity(305.5, 304.5, 700, 15.41) * 1e5;
  ckT('the moderator coefficient is NEGATIVE', mtc0 < 0, mtc0.toFixed(1) + ' pcm/degC at 0 ppm');
  ckT('...and boron WEAKENS it, which is the second place boron acts',
      mtc700 > mtc0 && mtc700 < 0,
      mtc700.toFixed(1) + ' pcm/degC at 700 ppm against ' + mtc0.toFixed(1) + ' at zero — porting ' +
      'only the direct worth term would lose this half');
  /* SIGN, BORON-WEAKENING AND ZERO-AT-REFERENCE ARE ALL TRUE OF ANY LINEAR STAND-IN. The claim
   * this layer actually makes is that the moderator reads the SAME WATER the loop circulates, so
   * the check recomputes the expected feedback from Layer 0 directly. A fixed-slope density would
   * pass every other moderator check in this file and fail this one. */
  /* READ THE SAME PATH THE ENGINE READS. The first version used the direct correlations while the
   * engine uses the vtable fast path, and they differ by the table's interpolation error — 8.8e-5
   * relative, which is the table doing exactly what it is specified to do. Comparing across the two
   * paths measures the table, not the composition this check is about. */
  /* REFIT 2026-08-26 (#515 Build 3, declared): the expectation used to run the enthalpy round
   * trip rho_from_h(h_l(T, P), P) — the very path that returns a two-phase MIXTURE for the
   * reference below 9.145 MPa (defect 1 in the module header). The moderator now reads LIQUID
   * density (K.liqRho: Layer 0's compressed-liquid form on the tabulated saturation line), and
   * the identity is asserted against Layer 0's own W.rho_l — the same form through the
   * bisected saturation line — to the two lines' 1e-9 MPa disagreement. It fails the OLD build
   * by 6e-6 dk/k: that was the round trip being wrong, not the check. */
  var dRhoReal = RD.water.rho_l(320, 15.41) - RD.water.rho_l(304.5, 15.41);
  var wantMod = K.modCoeff() * (1 - 700 / K.MOD.boron_zero_ppm) * dRhoReal;
  ck('the moderator term equals L0 LIQUID density x the calibrated coefficient',
     K.moderatorReactivity(320, 304.5, 700, 15.41), wantMod, 1e-8, 'dk/k');
  ck('...liqRho IS Layer 0\'s rho_l (tabulated saturation line vs the bisection)',
     K.liqRho(320, 15.41), RD.water.rho_l(320, 15.41), 0.05, 'kg/m3');
  ckT('...and the density span it uses is a REAL one, not a linear slope',
      Math.abs(dRhoReal) > 25 && Math.abs(dRhoReal) < 200,
      'rho(320 degC) - rho(304.5 degC) = ' + dRhoReal.toFixed(2) + ' kg/m3 from Layer 0');
  ckT('feedback is ZERO at the reference condition, by construction',
      Math.abs(K.moderatorReactivity(304.5, 304.5, 700, 15.41)) < 1e-15,
      'both feedbacks are perturbative about the reference, not absolute');

  /* ---- THE TWO DEFECTS OF 2026-08-26 (#515 Build 3, D5 §87) ------------------------------- */
  /* `if (!quiet)` like every other banner — without it this one printed once per MUTATION,
   * interleaved through the injection self-test's own output. */
  if (!quiet) console.log('\nTHE VOIDED CORE IS SUBCRITICAL AT ANY BORON  [the reference is liquid; the boron factor is bounded]');
  var cal = K.calibration();
  ckT('the calibration is STATE-INDEPENDENT: one coefficient, whatever pressure a caller passes ' +
      '(it used to cache the first caller\'s — 13.4x apart between 0.5 and 15.5 MPa)',
      Math.abs(K.modCoeff(0.5) / K.modCoeff(15.5) - 1) < 1e-15 && K.MOD.cal_P_mpa === K.HZP.P_mpa,
      'K ' + cal.K.toExponential(4) + ' dk/k per kg/m3 at ' + K.MOD.cal_T_c + ' degC / ' +
      K.MOD.cal_P_mpa + ' MPa; g_min ' + cal.g_min.toFixed(4) + ', B_cap ' + cal.B_cap.toFixed(0) + ' ppm');
  /* defect 1: saturated legs below 9.145 MPa read the LIQUID cooldown insertion, not a
   * two-phase reference (today +6,688 / +9,761 pcm at 5 / 0.5 MPa; liquid +901 / +2,489) */
  var m5 = K.moderatorReactivity(RD.water.T_sat(5), 304.5, 700, 5) * 1e5;
  var m05 = K.moderatorReactivity(RD.water.T_sat(0.5), 304.5, 700, 0.5) * 1e5;
  var want5 = K.modCoeff() * K.boronFactor(700) * (RD.water.rho_l(RD.water.T_sat(5), 5) - RD.water.rho_l(304.5, 5)) * 1e5;
  ckT('saturated legs at 5 and 0.5 MPa read the LIQUID cooldown insertion (0..1,500 / 0..3,500 pcm) ' +
      '— the two-phase reference read +6,688 / +9,761',
      m5 > 0 && m5 < 1500 && m05 > 0 && m05 < 3500 && Math.abs(m5 - want5) < 1,
      m5.toFixed(0) + ' pcm at 5 MPa (liquid form ' + want5.toFixed(0) + '), ' + m05.toFixed(0) + ' at 0.5');
  /* the envelope: the local MTC over B 0-2500 ppm x T 100-330 degC */
  var mtcMax = -1e9, mtcMin = 1e9, mtcMinB500 = 1e9, argMax = '', argMin = '';
  for (var Bs = 0; Bs <= 2500; Bs += 100) {
    for (var Ts = 100; Ts <= 330; Ts += 5) {
      var mtc = (K.moderatorReactivity(Ts + 0.5, 304.5, Bs, 15.5) -
                 K.moderatorReactivity(Ts - 0.5, 304.5, Bs, 15.5)) * 1e5 * 5 / 9;   /* pcm/degF */
      if (mtc > mtcMax) { mtcMax = mtc; argMax = Bs + ' ppm/' + Ts + ' C'; }
      if (mtc < mtcMin) { mtcMin = mtc; argMin = Bs + ' ppm/' + Ts + ' C'; }
      if (Bs >= 500 && mtc < mtcMinB500) mtcMinB500 = mtc;
    }
  }
  ckT('the local MTC never exceeds the sourced +5 pcm/degF over 0-2,500 ppm x 100-330 degC ' +
      '(the unfloored factor reached a positive MTC of unbounded size at 2,271 ppm)',
      mtcMax <= 5.0 + 1e-9, 'max ' + mtcMax.toFixed(2) + ' pcm/degF at ' + argMax);
  ckT('...and stays above -35 pcm/degF for B >= 500 ppm (the -35 side is RECORDED, not applied: ' +
      'the fit\'s own 0-ppm intercept is -37.3, exceeding it only below ~460 ppm hot — no IC lives there)',
      mtcMinB500 >= -35, 'min ' + mtcMin.toFixed(1) + ' pcm/degF at ' + argMin + ' (' +
      mtcMinB500.toFixed(1) + ' for B >= 500 ppm)');
  /* defect 2: the theorem, void + bor <= void(0) at every state; and the dry core negative */
  var thm = true, worst = 0, worstAt = '';
  [0.5, 8.8, 15.5].forEach(function (P) {
    var hf = RD.water.h_f(P), hg = RD.water.h_g(P);
    [0.1, 0.5, 1.0].forEach(function (x) {
      var h = x >= 1 ? RD.water.h_v(400, P) : hf + x * (hg - hf);
      var v0 = K.voidReactivity(h, P, 0);
      [700, 986, 1500, 2271, 2500].forEach(function (Bb) {
        var vb = K.voidReactivity(h, P, Bb) - 1e-4 * Bb;
        if (vb > v0 + 1e-12) thm = false;
        if (vb - v0 > worst) { worst = vb - v0; worstAt = P + ' MPa, x ' + x + ', ' + Bb + ' ppm'; }
      });
    });
  });
  ckT('THE THEOREM: void + boron reactivity <= the UNBORATED voided core, at every (h, P, B) — boron ' +
      'can never make a voided core less subcritical than no boron at all',
      thm, thm ? 'holds at 45 states' : 'violated by ' + (worst * 1e5).toFixed(0) + ' pcm at ' + worstAt);
  var dry05 = K.voidReactivity(RD.water.h_v(400, 0.5), 0.5, 2500) * 1e5;
  var dry88 = K.voidReactivity(RD.water.h_v(400, 8.8), 8.8, 1500) * 1e5;
  var dry155 = (K.voidReactivity(RD.water.h_v(400, 15.5), 15.5, 2500) - 0.25) * 1e5;
  ckT('a DRY core reads negative at 2,500 ppm / 0.5 MPa and 1,500 ppm / 8.8 MPa on the void term ' +
      'alone (the old form: +52,010 and +13,057), and with its boron at 15.5 MPa',
      dry05 < -5000 && dry88 < 0 && dry155 < 0,
      dry05.toFixed(0) + ', ' + dry88.toFixed(0) + ', ' + dry155.toFixed(0) + ' pcm');
  /* the bounded positive regime above B_cap — sourced in sign, capped in size */
  var hx = RD.water.h_f(8.827) + 0.0153 * (RD.water.h_g(8.827) - RD.water.h_f(8.827));
  var pos = K.voidReactivity(hx, 8.827, 2500) * 1e5, peak = -1e9;
  for (var xq = 0.02; xq <= 1.0; xq += 0.02) {
    var hq = RD.water.h_f(8.827) + xq * (RD.water.h_g(8.827) - RD.water.h_f(8.827));
    var vq = K.voidReactivity(hq, 8.827, 2500) * 1e5; if (vq > peak) peak = vq;
  }
  ckT('above B_cap the void term is BOUNDED positive (WTSM 2.1.6.3\'s "positive or negative ... ' +
      'depending on boron"): 0 < 400 pcm at 1.5 % quality, peak <= 1,800, the old form +7,060 there',
      pos > 0 && pos < 400 && peak <= 1800,
      pos.toFixed(0) + ' pcm at 18.8 % void, peak ' + peak.toFixed(0) + ' over quality at 2,500 ppm');
  ckT('the small-void coefficient at 700 ppm is UNCHANGED by the bounds (the fit inside its range)',
      Math.abs(K.voidReactivity(hx, 8.827, 700) * 1e5 / 18.8 - (-70.9)) < 1.0,
      (K.voidReactivity(hx, 8.827, 700) * 1e5 / 18.8).toFixed(1) + ' pcm per % void');
  ckT('criticalBoron returns NaN for a plant that cannot go critical, not a negative ppm',
      isNaN(K.criticalBoron(K.createKinetics({ rho_excess: -0.2 }), 291.67, 15.5, null, 0)), '');

  /* ---- THE VOID HALF OF THE DENSITY COUPLING (added 2026-08-17) ---------------------------
   *
   * The section above says the moderator coefficient "reads real density from L0". It reads a
   * density RECONSTRUCTED FROM A TEMPERATURE via the liquid branch, which is the same number only
   * while the core is subcooled. A boiling core was invisible to it and there was no void
   * coefficient at all — so on a depressurising plant, whose coolant follows saturation DOWN, the
   * term read "colder moderator, therefore denser" and inserted POSITIVE reactivity while the
   * water was actually leaving. MEASURED on a 0.005 m2 (50 cm2) break at full power: +3433 pcm at
   * t = 60 s, five times prompt critical, power 0.8 % -> 4.7e+12 in ONE step.
   *
   * A PWR is undermoderated: voiding the core shuts it down. The engine had the opposite sign. */
  var hf = W.h_f(8.827), hg = W.h_g(8.827);
  function atQuality(x) { return hf + x * (hg - hf); }
  ckT('a SUBCOOLED core contributes EXACTLY zero — an exact branch, not zero-to-roundoff',
      K.voidReactivity(W.h_l(300, 15.41), 15.41, 700) === 0 &&
      K.voidReactivity(W.h_l(200, 8.827), 8.827, 700) === 0 &&
      K.voidReactivity(hf - 0.001, 8.827, 700) === 0,
      'this is what makes it safe to add to a calibrated balance: rho_excess and the ' +
      'critical-boron solve cannot move');
  ckT('...and a BOILING core contributes a strongly NEGATIVE one',
      K.voidReactivity(atQuality(0.0153), 8.827, 700) < -0.005,
      (K.voidReactivity(atQuality(0.0153), 8.827, 700) * 1e5).toFixed(0) +
      ' pcm at 1.53 % quality');
  /* NORMALISED ON VOID FRACTION BY VOLUME, and the distinction is worth 12x here. At 1.53 %
   * quality the volume void is 18.8 %; dividing by quality instead puts the coefficient at
   * -1100 pcm per "% void", far outside every published range, and invites re-tuning a term that
   * is correct. The conversion is written out here rather than taken from the engine. */
  var xq = 0.0153, rf = W.rho_l(W.T_sat(8.827), 8.827), rg = W.rho_v_sat(8.827);
  var alph = (xq / rg) / ((xq / rg) + ((1 - xq) / rf));
  var pcmPerPct = K.voidReactivity(atQuality(xq), 8.827, 700) * 1e5 / (alph * 100);
  ckT('...sized like a real PWR void coefficient, per % void BY VOLUME',
      pcmPerPct > -250 && pcmPerPct < -20,
      (alph * 100).toFixed(1) + ' % void by volume -> ' + pcmPerPct.toFixed(1) +
      ' pcm per % void, against a real-PWR range of roughly -100 to -250');
  ckT('it is MONOTONE in void — more steam is always less reactivity',
      K.voidReactivity(atQuality(0.5), 8.827, 700) < K.voidReactivity(atQuality(0.1), 8.827, 700) &&
      K.voidReactivity(atQuality(1.0), 8.827, 700) < K.voidReactivity(atQuality(0.5), 8.827, 700),
      'a term that saturates or turns over would let a dry core come back critical');
  /* ⚠ THE FULLY-VOIDED CASE IS THE ONE THAT MATTERS AND THE ONE THE FIRST VERSION GOT WRONG.
   * Referencing "liquid at the node's own temperature" collapses at low pressure — T_from_h
   * clamps a dry node to the vapour ceiling, h_l clamps that back to 358, and the result is itself
   * two-phase — so the term reported -7.6 pcm on a completely dry core at 0.1 MPa. A void
   * coefficient that switches itself off in a voided core is worse than not having one. */
  ckT('a DRY core at the bottom of a blowdown is held deeply subcritical, not released',
      K.voidReactivity(W.h_v(400, 0.1), 0.1, 700) * 1e5 < -5000,
      (K.voidReactivity(W.h_v(400, 0.1), 0.1, 700) * 1e5).toFixed(0) +
      ' pcm at 0.1 MPa, dry — the first version read -7.6 here');
  ckT('boron scales it, the same way it scales the temperature half',
      Math.abs(K.voidReactivity(atQuality(0.5), 8.827, 0)) >
      Math.abs(K.voidReactivity(atQuality(0.5), 8.827, 700)),
      'less boron, more moderator worth to lose');

  /* ⚠ AND IT HAS TO BE ASSERTED THROUGH `stepKinetics`, NOT ONLY ON THE FUNCTION. Every check
   * above calls `voidReactivity` directly, so all of them survive the term being dropped from the
   * reactivity sum, or `stepKinetics` failing to find the `core` node at all — the injection
   * self-test found exactly those two blind spots. A term that is correct and not WIRED IN is the
   * same defect as a term that is wrong, and it is the one this engine keeps producing: the
   * missing direct boron term above, and four caller-options-silently-dropped defects before it.
   *
   * TWO IDENTICAL PLANTS, differing ONLY in the core node's enthalpy, stepped through the real
   * entry point. Everything else — legs, pressure, boron, fuel temperature, rods — is held, so
   * the reactivity difference can only be the void term. */
  function plantWithCore(h_core) {
    var p = S.createPlant({ h: W.h_l(300, 8.827), P: 8.827 });
    for (var i = 0; i < p.nodes.length; i++) {
      if (p.nodes[i].id === 'core') { p.nodes[i].h = h_core; break; }
    }
    return p;
  }
  var kSub  = K.createKinetics({}), kVoid = K.createKinetics({});
  var drv   = { fuelTemp_c: 684.2, boron_ppm: 700, rodGroups: null, modTemp_c: 300 };
  var rSub  = K.stepKinetics(kSub,  plantWithCore(W.h_l(300, 8.827)), 0.02, drv);
  var rVoid = K.stepKinetics(kVoid, plantWithCore(atQuality(0.5)),    0.02, drv);
  ckT('the void term is WIRED IN — a boiling core node moves rho through stepKinetics itself',
      (rVoid.rho_pcm - rSub.rho_pcm) < -3000,
      'subcooled core ' + rSub.rho_pcm.toFixed(0) + ' pcm, half-void core ' +
      rVoid.rho_pcm.toFixed(0) + ' pcm, difference ' +
      (rVoid.rho_pcm - rSub.rho_pcm).toFixed(0) + ' pcm — same plant, same legs, same boron');
  ckT('...and the SUBCOOLED plant is unmoved, so the wiring cannot be a blanket offset',
      Math.abs(rSub.rho_pcm -
               K.stepKinetics(K.createKinetics({}), plantWithCore(W.h_l(300, 8.827)), 0.02, drv)
                .rho_pcm) < 1e-9,
      'the term is present and contributing exactly nothing on a single-phase core');

  /* ---- THE DIRECT BORON TERM — the half this section NAMED and did not check.
   *
   * This gate scored 50/50 with 25/25 mutations while `rho_bor` did not exist. The section header
   * above says "boron appears TWICE"; every check under it exercised the moderator coupling, and
   * the direct worth term was absent from the engine entirely. MEASURED before the fix: boron
   * moved reactivity by 0.00 pcm at 0, 500, 975 AND 2000 ppm at the reference temperature — i.e.
   * at the condition the plant actually runs at, boron was inert.
   *
   * The lesson is about mutation testing, not about boron: a self-test perturbs code that EXISTS.
   * It cannot report a term nobody wrote. A section header naming two mechanisms and checking one
   * is the only thing that would have caught this, and it has to be read by a person. */
  var kRef = K.createKinetics({});
  function rhoAt(B, T) { return K.reactivity(kRef, T === undefined ? 304.5 : T,
                                             kRef.T_fuel_ref_c, B, null, 15.41); }
  ckT('boron has worth AT THE REFERENCE TEMPERATURE, where the density coupling gives nothing',
      Math.abs(rhoAt(1000) - rhoAt(0)) > 1e-3,
      'the moderator half is identically zero here, so this measures the direct term alone: ' +
      ((rhoAt(1000) - rhoAt(0)) * 1e5).toFixed(1) + ' pcm over 1000 ppm');
  ck('differential boron worth at rated equals the sourced 10 pcm/ppm',
     (rhoAt(1000) - rhoAt(0)) * 1e5 / 1000, -10.0, 1e-9, 'pcm/ppm');
  ckT('boron is a POISON — more boron is always less reactivity',
      rhoAt(2000) < rhoAt(975) && rhoAt(975) < rhoAt(0), '');
  ckT('differential worth is LARGER COLD, because both halves grow',
      Math.abs(rhoAt(1000, 150) - rhoAt(0, 150)) > Math.abs(rhoAt(1000) - rhoAt(0)) * 1.3,
      ((rhoAt(1000, 150) - rhoAt(0, 150)) * 1e5 / 1000).toFixed(2) + ' pcm/ppm at 150 degC ' +
      'against -10.00 at rated — the operator sees the sum of both mechanisms');

  /* ---- rho_excess IS A SOLVE, AND THIS IS WHERE IT IS PINNED ------------------------------
   * It has no direct observable, so the only check possible is that it lands the plant critical
   * at the one startup condition a real measurement exists for. Re-solving is required whenever
   * alpha_D, the moderator block, the boron worth or either reference moves — all four moved in
   * this port, which is why the number is 0.090139 against the first engine's 0.087354. */
  ck('the solve lands ARO critical boron on the BEAVRS / Watts Bar measurement',
     K.criticalBoron(K.createKinetics({}), DOC.hzp_temp_c, K.HZP.P_mpa, null, 0),
     DOC.hzp_boron_ppm, 1e-6, 'ppm');
  ck('the anchor the engine carries IS the measurement', K.HZP.boron_ppm,
     DOC.hzp_boron_ppm, 1e-9, 'ppm');
  ckT('rho_excess DEFAULTS to the solve rather than to zero',
      Math.abs(K.createKinetics({}).rho_excess - K.solveRhoExcess()) < 1e-15 &&
      K.createKinetics({}).rho_excess > 0.05,
      'a zero default is a core with ~9750 pcm of unopposed boron that cannot go critical at any ' +
      'concentration — a silent way to ship a plant that will not start up');
  /* ---- THE CROSS-MODULE TIE. Nothing else in this gate can see the fuel reference change:
   * REF now derives from the plant, so moving the reference moves the fixture with it and every
   * check stays self-consistently wrong. The injection self-test caught that — a mutation
   * reverting the reference to the first engine's 693 was invisible to 59 checks. The only
   * external witness is pwr2_fuel, which is where the number comes from in the first place. */
  var FUEL = globalThis.RD.pwr2.fuel;
  var fuelDerived = FUEL.steadyFuelTemp(FUEL.deriveGeometry(), 300000, 304.5);
  ck('the Doppler reference IS what pwr2_fuel derives, not a carried-over number',
     K.createKinetics({}).T_fuel_ref_c, fuelDerived, 0.1, 'degC');
  ck('...and equals the retyped value, so both modules drifting together cannot hide it',
     K.createKinetics({}).T_fuel_ref_c, DOC.t_fuel_ref_c, 0.1, 'degC');
  ckT('the quote temperature is WATTS BAR\'S, not this plant\'s no-load anchor',
      Math.abs(K.HZP.temp_c - 291.67) < 1e-9,
      '975 ppm was measured at 557 degF; conflating it with this plant\'s 286 degC anchor is a ' +
      'trap the first engine fell into and had to correct');
  ckT('critical boron FALLS as the plant heats  [negative moderator coefficient]',
      K.criticalBoron(kRef, 150, 15.41, null, 0) > K.criticalBoron(kRef, 291.67, 15.41, null, 0) &&
      K.criticalBoron(kRef, 291.67, 15.41, null, 0) > K.criticalBoron(kRef, 304.5, 15.41, null, 0),
      'heating adds negative reactivity, so less boron is needed to stay critical');
  /* CALL IT WITHOUT THE ARGUMENT, on an object carrying rated-power xenon. The pair of
   * explicit calls below never exercises the default branch, so the mutation that made the
   * default inherit `kin.X` was invisible to them -- the self-test said so. */
  ckT('omitting the xenon argument means ZERO xenon, not the object inventory',
      Math.abs(K.criticalBoron(kRef, DOC.hzp_temp_c, K.HZP.P_mpa) -
               K.criticalBoron(kRef, DOC.hzp_temp_c, K.HZP.P_mpa, null, 0)) < 1e-9,
      'kRef is built at rated power and carries equilibrium xenon; the default must ignore it');
  ckT('xenon is an EXPLICIT argument to criticalBoron, not read from the object',
      Math.abs(K.criticalBoron(kRef, 291.67, 15.41, null, 0) -
               K.criticalBoron(kRef, 291.67, 15.41, null, 1)) > 100,
      'the 975 ppm anchor is a ZERO-XENON measurement; inheriting a rated-power object\'s xenon ' +
      'shifts it ~228 ppm and reads as a failed solve when it is a failed comparison');
  /* THE ENDPOINTS ARE THE SAME FOR A STRAIGHT LINE — scruve(0)=0 and scruve(1)=1 hold for a linear
   * ramp too, so checking them proves nothing about the curve. What distinguishes an S-curve is
   * that DIFFERENTIAL worth varies across the band: near-zero at the ends, peaked mid-core. That
   * variation is the whole reason the control layer schedules its loop gain on it. */
  ckT('rod worth is normalised: no worth out, full worth fully in',
      Math.abs(K.scruve(1, 0.8) - 1) < 1e-12 && Math.abs(K.scruve(0, 0.8)) < 1e-12,
      'true for ANY K — and for a straight line, which is why the next check exists');
  var slopeMid = K.scruveSlope(0.5, 0.8), slopeEnd = K.scruveSlope(0, 0.8);
  ckT('...and DIFFERENTIAL worth peaks mid-core  [a linear ramp would be flat]',
      slopeMid / slopeEnd > 3 && Math.abs(K.scruve(0.25, 0.8) - 0.25) > 0.05,
      'slope ' + slopeMid.toFixed(3) + ' mid against ' + slopeEnd.toFixed(3) + ' at the stop, a ' +
      (slopeMid / slopeEnd).toFixed(1) + 'x range; a straight line gives 1.0 everywhere');
  ckT('scruve and scruveSlope are EXPORTED  [the control layer schedules loop gain on them]',
      typeof K.scruve === 'function' && typeof K.scruveSlope === 'function',
      'the dependency runs control -> engine; dropping these breaks the rod channel gain schedule');

  /* ---- 6. XENON ---------------------------------------------------------------------- */
  if (!quiet) console.log('\nXENON  [a slow, invisible reactivity load -- A7]');
  ck('equilibrium xenon normalises to 100 % at full power',
     K.createKinetics({ P: 1.0 }).X / K.xenonEq(1.0) * 100, 100, 1e-6, '%');
  ckT('xenon worth is negative reactivity', K.OPEN.xenon_worth.value > 0,
      'entered as a positive worth and subtracted');

  /* ---- 7. CONSTRUCTION  [written first -- D1 §31] ------------------------------------- */
  if (!quiet) console.log('\nCONSTRUCTION  [§31: written first, not acquired after an attack]');
  var opt = K.createKinetics({ P: 0.3, I: 7, X: 9, T_fuel_ref_c: 600, T_mod_ref_c: 300,
                               rho_excess: 0.011 });
  ck('caller power reaches the state', opt.P, 0.3, 1e-12, '');
  ck('caller iodine reaches the state', opt.I, 7, 1e-12, '');
  ck('caller xenon reaches the state', opt.X, 9, 1e-12, '');
  ck('caller fuel reference reaches the state', opt.T_fuel_ref_c, 600, 1e-12, 'degC');
  ck('caller moderator reference reaches the state', opt.T_mod_ref_c, 300, 1e-12, 'degC');
  ck('caller rho_excess reaches the state', opt.rho_excess, 0.011, 1e-12, '');
  ckT('omitting power gives rated, and precursors follow IT rather than a fixed default',
      Math.abs(K.createKinetics({}).P - 1) < 1e-12 &&
      Math.abs(K.createKinetics({ P: 0.5 }).C[0] / K.createKinetics({ P: 1.0 }).C[0] - 0.5) < 1e-9,
      'half the power, half the precursor inventory');
  /* THE HOOK THAT MUST NOT BE INERT. `drivers.decayHeat_kW` on stepRHR was documented and never
   * read; this layer refuses rather than inventing a fuel temperature Doppler would then use. */
  ckT('it REFUSES to run without a fuel temperature rather than inventing one', (function () {
        try { K.stepKinetics(critical(1), plant(), 0.02, { boron_ppm: 0 }); return false; }
        catch (e) { return /fuelTemp_c/.test(e.message); }
      })(), 'pwr2_fuel.js is not built; a default here would be a silent wrong answer for Doppler');

  /* ---- 8. THE PORT IS KNOWINGLY INCOMPLETE, AND SAYS SO ------------------------------- */
  if (!quiet) console.log('\nOPEN CONSTANTS  [this gate goes green while the port is unfinished]');
  var openKeys = Object.keys(K.OPEN);
  /* 3 until #536 added the neutron source, whose DERIVATION is sourced and whose installed
   * STRENGTH is not. The count going UP is honest — a newly declared gap, not a regression —
   * and it is pinned so the entry cannot be quietly dropped or quietly promoted. */
  ckT('the open constants are STRUCTURALLY SEPARATE from the sourced ones', openKeys.length === 4,
      openKeys.join(', ') + ' — carried as flagged placeholders, not mixed into the sourced set');
  ckT('...and every one states the evidence work it owes',
      openKeys.every(function (k) { return K.OPEN[k].why && K.OPEN[k].why.length > 40; }),
      'a green gate with entries here means KNOWN INCOMPLETE, not fine');
  ckT('no sourced block silently contains an open value',
      K.MOD.anchor_pcm_per_F !== K.OPEN.alpha_D.value &&
      typeof K.OPEN.alpha_D.value === 'number',
      'when the evidence pass lands, entries move UP and this count falls');
}

console.log('\nPWR2 Layer 5 -- kinetics: analytic, and knowingly unfinished');
var K = loadFrom(SRC), rec = [];
runSuite(K, rec, false);
var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;

var MUTATIONS = [
  ['a delayed-group beta mistyped', '0.002568', '0.002200'],
  ['a delayed decay constant mistyped', '0.0305,   0.111', '0.0405,   0.111'],
  ['beta typed separately from its parts', 'beta:     0.006502,', 'beta:     0.006600,'],
  ['a decay-heat amplitude mistyped', '0.0268319', '0.0300000'],
  ['a decay-heat lambda mistyped', '0.00130630', '0.00230630'],
  ['Lambda reverts to the old engine\'s stability crutch', 'Lambda:   2.0e-5', 'Lambda:   0.01'],
  ['the matrix exponential loses its squaring phase',
   'for (var p = 0; p < sPow; p++) { matmulInto(out, out, _M2); for (q = 0; q < N * N; q++) out[q] = _M2[q]; }',
   ''],
  ['the Taylor core truncated far too early', 'k <= 12; k++', 'k <= 2; k++'],
  ['precursor production loses its 1/Lambda',
   'A[(1 + i) * N + 0] = DELAYED.beta_i[i] / DELAYED.Lambda;',
   'A[(1 + i) * N + 0] = DELAYED.beta_i[i];'],
  ['precursor INITIALISATION loses its 1/Lambda',
   'C.push((DELAYED.beta_i[i] / DELAYED.lambda_i[i]) * P0 / DELAYED.Lambda);',
   'C.push((DELAYED.beta_i[i] / DELAYED.lambda_i[i]) * P0);'],
  ['the power split drops the (1 - f0) scaling',
   'var Q_total = kin.P * (1 - f0()) + Hsum;', 'var Q_total = kin.P + Hsum;'],
  ['decay heat stops accumulating', 'kin.H[j] += (DECAY.H0[j] * DECAY.lambda[j] * kin.P - DECAY.lambda[j] * kin.H[j]) * dt;', ''],
  ['the moderator coefficient loses its boron scaling',
   'return modCoeff() * boronFactor(B_ppm) * dD;',
   'return modCoeff() * dD;'],
  ['the moderator reads a fixed density instead of Layer 0',
   'var dD = liqRho(T_c, P_mpa) - liqRho(T_ref_c, P_mpa);',
   'var dD = (T_ref_c - T_c) * 1.5;'],
  /* #515 Build 3 */
  ['the liquid branch reverts to the enthalpy round trip (a two-phase REFERENCE below 9.145 MPa)',
   'return W.rho_l_sat(T) * (1 + (P_mpa - PSAT(T)) / W.bulk_modulus(T));',
   'return RHO_W(W.h_l(T, P_mpa), P_mpa);'],
  ['the envelope floor is removed (the boron factor unbounded again)',
   'return g < gm ? gm : g;',
   'return g;'],
  ['the boron-worth cap is removed (boron leaving with the water without limit)',
   'return -K * deficit + (lost < cap ? lost : cap);',
   'return -K * deficit + lost;'],
  ['the calibration follows the caller\'s pressure again',
   'var Ta = MOD.cal_T_c, P = MOD.cal_P_mpa, e = 0.5;',
   'var Ta = MOD.cal_T_c, P = 0.5, e = 0.5;'],
  ['criticalBoron ignores the bracket sign (a negative ppm for a plant that cannot go critical)',
   'if (!(rlo >= 0) || !(rhi <= 0)) return NaN;',
   'if (false) return NaN;'],
  ['rod worth loses its sinusoid correction',
   'return pos - K * Math.sin(2 * Math.PI * pos) / (2 * Math.PI);', 'return pos;'],
  ['the BEAVRS moderator anchor moved', 'anchor_pcm_per_F: -31.43,', 'anchor_pcm_per_F: -20.00,'],
  ['a sourced rod worth moved', 'worth_control:  0.04068,', 'worth_control:  0.05000,'],
  ['xenon equilibrium loses its burnout term',
   '(XENON.lambda_X + OPEN.sigma_phi.value * P);', '(XENON.lambda_X);'],
  /* CONSTRUCTION */
  ['caller power ignored at construction', 'var P0 = opts.P === undefined ? 1.0 : opts.P;', 'var P0 = 1.0;'],
  ['caller rho_excess ignored at construction',
   '      rho_excess:   opts.rho_excess === undefined\n', '      rho_excess:   false\n'],
  /* ---- THE BORON TERM AND THE SOLVE. Both are NEW, and the reason they are worth a block of
   * their own is that the gate scored 50/50 with 25/25 mutations while the direct boron term was
   * MISSING ENTIRELY. Mutation testing perturbs code that exists; it is structurally blind to a
   * term that was never written. These mutations exist so that its removal is now visible. */
  ['the DIRECT boron term dropped again (boron inert at the reference temperature)',
   '    var rho_bor  = -BORON.worth_per_ppm * B_ppm;', '    var rho_bor  = 0;'],
  ['boron worth moved off its sourced 10 pcm/ppm', 'worth_per_ppm: 1.0e-4,',
   'worth_per_ppm: 5.0e-5,'],
  ['boron becomes a positive reactivity addition (sign inverted)',
   '    var rho_bor  = -BORON.worth_per_ppm * B_ppm;',
   '    var rho_bor  = BORON.worth_per_ppm * B_ppm;'],
  /* THE VOID HALF (2026-08-17). The fourth of these is the defect as it actually shipped:
   * a reference that is exact while subcooled and meaningless once the core is dry. */
  ['the void term is dropped from the reactivity sum (a voiding core reads as a COLD one)',
   '    var rho_void = voidReactivity(h_core, P_mpa, B_ppm);', '    var rho_void = 0;'],
  ['void reactivity inverted — voiding a PWR core RELEASES reactivity',
   '    return -K * deficit + (lost < cap ? lost : cap);',
   '    return K * deficit - (lost < cap ? lost : cap);'],
  ['the subcooled branch stops being exact (feedback leaks into a single-phase core)',
   '    if (h_core <= W.h_f(P_mpa)) return 0;        /* subcooled: no void, EXACTLY zero */',
   '    if (h_core <= W.h_f(P_mpa) * 0.5) return 0;'],
  ['the void reference reverts to liquid-at-the-node-temperature (dies in a DRY core)',
   '    var D_liq  = W.rho_l_sat(W.T_sat(P_mpa));    /* what a liquid-full core would have */',
   '    var D_liq  = RHO_W(W.h_l(W.T_from_h(h_core, P_mpa), P_mpa), P_mpa);'],
  ['stepKinetics never finds the core node, so the void term is permanently absent',
   "      if (sys.nodes[ci].id === 'core') { h_core = sys.nodes[ci].h; break; }",
   "      if (sys.nodes[ci].id === 'nosuchnode') { h_core = sys.nodes[ci].h; break; }"],
  ['the HZP critical-boron anchor moved off the BEAVRS measurement', 'boron_ppm: 975.0,',
   'boron_ppm: 800.0,'],
  ['the solve quote temperature reverts to this plant\'s anchor instead of Watts Bar\'s',
   'temp_c: 291.67,', 'temp_c: 286.0,'],
  ['rho_excess stops being solved and returns a fixed number',
   '    return -(rho_dop + rho_mod + rho_bor);', '    return 0.087354;'],
  ['the solve drops the Doppler term', '    var rho_dop = OPEN.alpha_D.value * (T - TfRef);',
   '    var rho_dop = 0;'],
  ['the solve drops the moderator term',
   '    var rho_mod = moderatorReactivity(T, TmRef, B, P);', '    var rho_mod = 0;'],
  ['criticalBoron silently inherits the object\'s xenon instead of taking it explicitly',
   '    if (xeFrac === undefined) xeFrac = 0;',
   '    if (xeFrac === undefined) xeFrac = kin.X / kin.X_eq_full;'],
  ['the derived fuel reference reverts to the first engine\'s 693',
   '  var DEFAULT_T_FUEL_REF = 684.2;', '  var DEFAULT_T_FUEL_REF = 581.8;'],
  ['caller fuel reference ignored at construction',
   'T_fuel_ref_c: opts.T_fuel_ref_c === undefined ? DEFAULT_T_FUEL_REF : opts.T_fuel_ref_c,',
   'T_fuel_ref_c: DEFAULT_T_FUEL_REF,'],
  ['the midpoint ramp correction reverts to frozen rho (the original no-op)',
   'var rhoMid = kin.rho_valid ? rhoNow + 0.5 * (rhoNow - kin.rho_last) : rhoNow;',
   'var rhoMid = rhoNow;'],
  ['the ramp correction stores the MIDPOINT instead of the raw value (compounding error)',
   'kin.rho_last = rhoNow;', 'kin.rho_last = rhoMid;'],
  ['the missing-fuel-temperature guard removed (Doppler silently reads a default)',
   "if (drivers.fuelTemp_c === undefined) {", "if (false) {"],
  /* ---- THE NEUTRON SOURCE (#536). Written knowing these mutations could not have caught the
   * defect they guard — the term did not exist, and mutation testing perturbs code that does.
   * They exist so that its REMOVAL, its mis-scaling and a broken augmentation are all visible,
   * which is the only thing this technique can offer for a missing term. */
  ['the source is dropped from the matrix (a subcritical core decays to nothing again)',
   '    _A[0 * N + (N - 1)] = S;', '    _A[0 * N + (N - 1)] = 0;'],
  ['the source is not scaled by dt with the rest of the matrix (wrong by 1/dt)',
   '    _A[0 * N + (N - 1)] = S;      /* the source, into the power equation and nothing else */\n' +
   '    for (q = 0; q < N * N; q++) _A[q] *= dt;',
   '    for (q = 0; q < N * N; q++) _A[q] *= dt;\n' +
   '    _A[0 * N + (N - 1)] = S;'],
  ['the augmented constant is seeded 0 instead of 1 (the source multiplied by nothing)',
   '    _v[N - 1] = 1;                /* the augmented constant */',
   '    _v[N - 1] = 0;'],
  ['the augmented row stops being zero, so the multiplier itself evolves',
   '    _A[0 * N + (N - 1)] = S;',
   '    _A[0 * N + (N - 1)] = S; _A[(N - 1) * N + (N - 1)] = 0.001;'],
  ['the installed source strength moved off the value the P-6 test picked',
   'installed_n_per_s: 5.0e8,', 'installed_n_per_s: 2.0e9,'],
  ['the published source constant stops agreeing with its own derivation',
   'value: 1.0988e-6,          // fraction of rated per second',
   'value: 5.7e-4,             // fraction of rated per second'],
  ['sourceLevel hands back a number at criticality instead of refusing',
   '    if (!(rho < 0)) return NaN;', '    if (false) return NaN;'],
  ['sourceLevel loses its Lambda (the level stops scaling with the generation time)',
   '    return S * DELAYED.Lambda / (-rho);', '    return S / (-rho);'],
  ['advance defaults to NO source, so only a caller that remembers gets one',
   '    if (S === undefined) S = OPEN.source.value;', '    if (S === undefined) S = 0;'],
  /* THE OPEN SET */
  /* The first version of this mutation replaced only the PREFIX of the justification, leaving the
   * rest of the string in place — so the length check still passed and the mutation was blind. It
   * has to remove the whole statement, which is what "losing its flag" would actually look like. */
  ['an open constant quietly loses its stated evidence work',
   'why: \'Equilibrium xenon worth. ~2700 pcm is a standard figure and should be sourceable.\'',
   'why: \'tbd\'']
];

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
MUT.select(MUTATIONS).forEach(function (m) {
  if (SRC.indexOf(m[1]) === -1) { console.log('  ERROR   anchor not found: ' + m[0]); blind++; return; }
  var r2 = [];
  try { runSuite(loadFrom(SRC.split(m[1]).join(m[2])), r2, true); }
  catch (e) { r2.push({ name: 'threw', ok: false }); }
  var f2 = r2.filter(function (r) { return !r.ok; }).length;
  if (f2 === 0) { blind++; console.log('  BLIND TO  ' + m[0] + '   <-- THIS GATE CANNOT SEE IT'); }
  else console.log('  caught    ' + m[0].padEnd(58) + f2 + ' red');
});

console.log('\n' + '='.repeat(70));
console.log('  injection self-test: ' + (MUTATIONS.length - blind) + '/' + MUTATIONS.length +
  ' mutations caught' + (blind ? '  ** ' + blind + ' BLIND SPOTS -- GATE FAILS **' : ', no blind spots'));
console.log('  run_pwr2_kinetics: ' + pass + ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit((fail > 0 || blind > 0) ? 1 : 0);
