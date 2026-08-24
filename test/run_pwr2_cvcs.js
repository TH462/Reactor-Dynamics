/* run_pwr2_cvcs.js — Layer 5 gate: charging, letdown and boron. (#479)
 *
 * THIS GATE WAS WRITTEN AFTER §31, AND IT SHOWS. Every other PWR2 gate had its mutation set
 * written from "what is this layer FOR?" and every one of them turned out blind to CONSTRUCTION —
 * ignored options, aliased tables, seeds that heal in one step, defaults nothing pinned. Fourteen
 * survivors across seven layers. So this suite carries a construction section from the first
 * commit rather than acquiring one after somebody attacks it.
 *
 * What it asserts, in order of how much it would hurt to get wrong:
 *
 *   1. LETDOWN IS AN ORIFICE. Flow must FALL as the plant depressurises. A constant-flow letdown
 *      teaches the opposite of the real coupling, and the check is a comparison across two
 *      pressures rather than a band at one.
 *   2. BORON IS A MASS BALANCE. Dilution must be slow at high concentration and fast at low,
 *      because letdown carries the RCS concentration away. That SHAPE is the evidence the balance
 *      is real; a fitted ppm/min ramp would match a magnitude and get the shape wrong.
 *   3. THE SCALING BASIS IS DECLARED AND BOTH ALTERNATIVES ARE REPORTED. The engine picks volume;
 *      power would give a 21 % different pump. The gate prints both so the choice stays visible
 *      instead of hardening into a number nobody remembers choosing.
 *   4. CONSTRUCTION. Every option a caller can pass must reach the plant.
 *
 * Run: node test/run_pwr2_cvcs.js
 */
'use strict';
var fs = require('fs'), path = require('path');
var E = path.join(__dirname, '..', 'engines', 'pwr2');
var LIB = path.join(E, 'pwr2_cvcs.js');
var SRC = fs.readFileSync(LIB, 'utf8').replace(/\r\n/g, '\n');
['pwr2_water', 'pwr2_vtable', 'pwr2_geometry', 'pwr2_core', 'pwr2_loop',
 'pwr2_sources'].forEach(function (f) { require(path.join(E, f + '.js')); });
var RD = globalThis.RD.pwr2, W = RD.water, S = RD.sources, GEO = RD.geometry;

function loadFrom(src) {
  var root = { RD: { pwr2: { water: RD.water, core: RD.core, geometry: RD.geometry,
                             loop: RD.loop, sources: RD.sources } } };
  var body = src.replace("(typeof globalThis !== 'undefined' ? globalThis : this)", '(RD_ROOT)') +
             '\nreturn RD_ROOT.RD.pwr2.cvcs;';
  return new Function('RD_ROOT', body)(root);
}

function runSuite(C, rec, quiet) {
  function ck(name, got, want, tol, unit) {
    var d = Math.abs(got - want), ok = d <= tol && isFinite(got);
    rec.push({ name: name, ok: ok });
    if (!quiet) console.log((ok ? '  PASS  ' : '  FAIL  ') + name.padEnd(52) +
      'got ' + got.toFixed(4) + ' want ' + want.toFixed(4) + ' (tol ' + tol + ') ' + (unit || ''));
  }
  function ckT(name, cond, note) {
    rec.push({ name: name, ok: !!cond });
    if (!quiet) console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (note ? '  -- ' + note : ''));
  }
  function plant() { return S.createPlant({ h: W.h_l(304.5, 15.41), P: 15.41 }); }
  /* THE MUTATION REPLAY RUNS SHORT LOOPS; THE LIVE MEASUREMENT RUNS FULL ONES.
   *
   * MEASURED, and it is why this exists: this gate reached **25 minutes standalone**. Its boron
   * checks each simulate 10-20 plant-minutes at dt = 0.02 s, and the self-test replays the WHOLE
   * suite once per mutation -- twenty of them. That is hours of simulated plant per run, for a
   * suite whose slowest genuine measurement takes seconds.
   *
   * Same asymmetry Layer 4 and RHR use, for the same reason: the LAW being measured (ppm/min is
   * proportional to concentration; boration approaches the tank and stops) needs a real horizon,
   * while every mutation here -- a dropped transport term, a scaled seal, an unfloored demand --
   * shows up grossly in a fraction of it. The RATIO check that carries the boron claim is asserted
   * with a wider band in quiet mode and its full band in the live pass, where it means something. */
  var SCALE = quiet ? 0.15 : 1;
  var N = function (n) { return Math.max(200, Math.round(n * SCALE)); };
  var GPM = function (kgs) { return kgs / 1000 * 264.172 * 60; };

  /* ---- 1. THE SOURCED ANCHORS SURVIVED THE SCALING ------------------------------------ */
  if (!quiet) console.log('\nSOURCED ANCHORS  [Ginna charging; the scaling basis is DECLARED]');
  ck('Ginna RCS volume is the sourced 5123 ft3', C.GINNA_RCS_M3, 5123 * 0.0283168466, 1e-9, 'm3');
  var vs = C.volumeScale();
  ckT('the volume scale is DERIVED from Layer 1, not written down',
      Math.abs(vs - C.rcsVolume() / C.GINNA_RCS_M3) < 1e-12 && vs > 0.1 && vs < 0.25,
      'x' + vs.toFixed(4) + ' from ' + C.rcsVolume().toFixed(2) + ' m3 against Ginna ' +
      C.GINNA_RCS_M3.toFixed(2));
  /* THE CHOICE, REPORTED. Volume and power bases disagree by 21 % here because this plant carries
   * 17 % less water per MWt than Ginna. Printing both keeps the decision visible. */
  var powerScale = 300 / 1520;
  if (!quiet) {
    console.log('        BASIS (D-CVCS): volume x' + vs.toFixed(4) + ' -> charging max ' +
      C.CVCS.charging_max_gpm().toFixed(1) + ' gpm  |  power x' + powerScale.toFixed(4) +
      ' would give ' + (180 * powerScale).toFixed(1) + ' gpm -- ' +
      (100 * (180 * powerScale) / C.CVCS.charging_max_gpm() - 100).toFixed(0) + ' % apart');
  }
  ckT('charging max is the sourced 180 gpm, volume-scaled',
      Math.abs(C.CVCS.charging_max_gpm() - 180 * vs) < 1e-9,
      C.CVCS.charging_max_gpm().toFixed(1) + ' gpm (Ginna 180 gpm max)');
  ckT('normal charging is the sourced 46 gpm, same basis',
      Math.abs(C.CVCS.charging_normal_gpm() - 46 * vs) < 1e-9,
      C.CVCS.charging_normal_gpm().toFixed(1) + ' gpm (Ginna 46 gpm normal)');
  /* SEAL INJECTION IS UNSCALED, and this check has to live HERE as well as in the cross-file
   * bases gate. The mutation that scales it belongs to this file's self-test, and a self-test can
   * only see what its own suite asserts -- a property checked exclusively in another gate is
   * invisible to this one's mutations. The duplication is the price of that, and it is small. */
  ckT('seal injection is the sourced per-pump figure with NO scale factor',
      Math.abs(C.sealInjectionGpm() - 5 * C.CVCS.rcp_count) < 1e-12 &&
      Math.abs(C.sealInjectionGpm() - 5 * C.CVCS.rcp_count * vs) > 1,
      C.sealInjectionGpm().toFixed(1) + ' gpm = WTSM 5 gpm/RCP x ' + C.CVCS.rcp_count +
      ' pump; scaled it would be ' + (5 * C.CVCS.rcp_count * vs).toFixed(1) +
      ' -- a seal does not shrink because the PLANT is smaller (owner ruling 2026-08-15)');
  ckT('the boric acid tank sits inside the sourced RWST band',
      C.CVCS.boric_acid_ppm >= 2000 && C.CVCS.boric_acid_ppm <= 2500,
      C.CVCS.boric_acid_ppm + ' ppm; ML11223A220 gives 2,000-2,500');

  /* ---- 2. LETDOWN IS AN ORIFICE ------------------------------------------------------- */
  if (!quiet) console.log('\nLETDOWN  [an ORIFICE: flow must FALL as the plant depressurises]');
  var sysN = plant(), cvN = C.createCVCS({});
  var rN = C.stepCVCS(cvN, sysN, 0.02);
  /* LETDOWN CARRIES CHARGING **PLUS SEAL INJECTION**, which is the balance WTSM §4.1 states:
   * "This flow, plus the 55 gpm normal charging, results in a total of 75 gpm returning to the
   * RCS, matching the letdown flow." Seal injection is an inflow the operator does not command,
   * so letdown has to carry it or inventory climbs on its own. */
  ck('at NOP the orifice passes charging PLUS seal injection', GPM(rN.letdown_kgs),
     C.CVCS.charging_normal_gpm() + C.sealInjectionGpm(), 1e-6, 'gpm');
  ckT('...and charging balances it, so inventory holds', Math.abs(rN.net_kgs) < 1e-9,
      'net ' + rN.net_kgs.toExponential(2) + ' kg/s at the normal lineup');
  /* THE COMPARISON, not a band. Half the pressure difference is 1/sqrt(2) of the flow. */
  var sysLo = plant(); sysLo.P = 8.74;   /* dP halved: (15.41-2.07)/2 + 2.07 */
  var cvLo = C.createCVCS({}), rLo = C.stepCVCS(cvLo, sysLo, 0.02);
  ck('halving the pressure difference gives 1/sqrt(2) of the flow',
     rLo.letdown_kgs / rN.letdown_kgs, Math.SQRT1_2, 1e-6, '(ratio)');
  ckT('letdown WEAKENS on a depressurisation  [the teachable coupling]',
      rLo.letdown_kgs < rN.letdown_kgs * 0.75,
      GPM(rLo.letdown_kgs).toFixed(2) + ' gpm at 1268 psia against ' +
      GPM(rN.letdown_kgs).toFixed(2) + ' at 2235 -- so a set-and-forget lineup OVER-CHARGES ' +
      'during a cooldown');
  var sysBP = plant(); sysBP.P = 1.0;    /* below the letdown backpressure */
  ckT('below its own backpressure the orifice STOPS, it does not reverse',
      C.stepCVCS(C.createCVCS({}), sysBP, 0.02).letdown_kgs === 0,
      'a sqrt of a negative dP would be NaN, and a signed one would run letdown backwards');
  ckT('an isolated orifice passes nothing',
      C.stepCVCS(C.createCVCS({ letdownOpen: 0 }), plant(), 0.02).letdown_kgs === 0,
      'letdownOpen = 0');

  /* ---- 2b. THE RHR LOW-PRESSURE LETDOWN PATH (#510 H-2, owner-ruled 2026-08-23) --------
   * Sourced at the code: on shutdown cooling, letdown comes FROM the RHR system through the
   * HCV-128 cross-connect (WTSM ch.19 / §4.1.4.5; NUREG-1431 Bases' "low pressure letdown
   * control"), bypassing the orifice's 300 psi backpressure — which is what stranded the
   * Mode 4 preset's 5 gpm of seal injection and sent it water-solid at 75 min. */
  var sysRl = plant(); sysRl.P = 1.0;                    /* below the orifice backpressure */
  var rRl = C.stepCVCS(C.createCVCS({}), sysRl, 0.02, { rhr_letdown_ok: true });
  ckT('below the orifice backpressure the RHR path letdowns at the NORMAL magnitude',
      Math.abs(rRl.letdown_kgs - C.normalLetdownKgs()) < 1e-9,
      GPM(rRl.letdown_kgs).toFixed(2) + ' gpm at 145 psia with the RHR suction open');
  ckT('...only WHILE the RHR suction is open — the driver absent means the old orifice law',
      C.stepCVCS(C.createCVCS({}), (function () { var s = plant(); s.P = 1.0; return s; })(),
                 0.02).letdown_kgs === 0,
      'same 145 psia plant, no rhr_letdown_ok: letdown 0 (the pre-#510 shape, kept at power)');
  ckT('...and the operator\'s letdown fraction still owns the path',
      C.stepCVCS(C.createCVCS({ letdownOpen: 0 }), sysRl, 0.02,
                 { rhr_letdown_ok: true }).letdown_kgs === 0,
      'letdownOpen 0 passes nothing through either path');
  ckT('at power the two paths agree — the RHR driver moves NOTHING at 2235 psia',
      Math.abs(C.stepCVCS(C.createCVCS({}), plant(), 0.02, { rhr_letdown_ok: true }).letdown_kgs -
               C.stepCVCS(C.createCVCS({}), plant(), 0.02).letdown_kgs) < 1e-12,
      'the orifice is calibrated to the normal flow at operating pressure, so max() is a tie');

  /* ---- 2c. THE REGENERATIVE HX (#510 H-2): letdown pre-heats the return ---------------- */
  var sysRg = plant();
  function coldNode(sy) {
    for (var q = 0; q < sy.nodes.length; q++) if (sy.nodes[q].id === 'cold_leg') return sy.nodes[q];
  }
  var rRg = C.stepCVCS(C.createCVCS({}), sysRg, 0.02);
  var rIso = C.stepCVCS(C.createCVCS({ letdownOpen: 0 }), plant(), 0.02);
  ckT('with letdown in service the return arrives NEAR the cold leg (regen recovery), and ' +
      'with letdown isolated it arrives COLD',
      rRg.sources[0].h > 0.8 * coldNode(sysRg).h && rIso.sources[0].h < 0.5 * coldNode(sysRg).h,
      'in-service h ' + rRg.sources[0].h.toFixed(0) + ' vs isolated h ' +
      rIso.sources[0].h.toFixed(0) + ' kJ/kg against a ' + coldNode(sysRg).h.toFixed(0) +
      ' kJ/kg cold leg — the ~10 % residual cold-injection effect is the real one');

  /* ---- 3. BORON IS A MASS BALANCE, AND THE SHAPE PROVES IT ---------------------------- */
  if (!quiet) console.log('\nBORON  [a mass balance -- the SHAPE is the evidence, not the rate]');
  function dilute(from, minutes) {
    var sys = plant(), cv = C.createCVCS({ boron_ppm: from, makeupSource: 'dilute' });
    for (var i = 0; i < N(minutes * 3000); i++) C.stepCVCS(cv, sys, 0.02);
    return from - cv.boron_ppm;
  }
  var dHi = dilute(1400, 10), dLo = dilute(350, 10);
  ckT('dilution REMOVES boron', dHi > 0 && dLo > 0,
      dHi.toFixed(1) + ' ppm in 10 min from 1400; ' + dLo.toFixed(1) + ' from 350');
  /* THE DISCRIMINATING CHECK. Letdown carries the RCS concentration out, so ppm/min is
   * proportional to the concentration itself: 4x the boron, ~4x the removal rate. A fitted ramp
   * would remove the same ppm/min at both ends. */
  ck('ppm/min is PROPORTIONAL to concentration  [4x boron -> 4x rate]',
     dHi / dLo, 4.0, quiet ? 1.2 : 0.35, '(ratio)');
  var cvB = C.createCVCS({ boron_ppm: 700, makeupSource: 'borate' });
  var sysB = plant();
  for (var b = 0; b < N(30000); b++) C.stepCVCS(cvB, sysB, 0.02);
  ckT('boration RAISES boron toward the boric acid tank, never past it',
      cvB.boron_ppm > 700 && cvB.boron_ppm < C.CVCS.boric_acid_ppm,
      cvB.boron_ppm.toFixed(1) + ' ppm after 10 min against a ' + C.CVCS.boric_acid_ppm +
      ' ppm source');
  /* SAFETY INJECTION CARRIES RWST BORON (#510 M-1): the sourced 2,500 ppm concentration was
   * defined and read by NOTHING — thousands of kg injected moved the RCS boron by zero. The
   * caller hands the injected stream to this ledger; injection AT the RCS's own concentration
   * is neutral (the discriminator that separates the term from a fitted ramp). */
  ckT('SI RAISES boron toward the RWST concentration — and SI at the RCS\'s own ppm is ' +
      'NEUTRAL (#510 M-1)',
      (function () {
        var s1 = plant(), c1 = C.createCVCS({ boron_ppm: 700 });
        var s2 = plant(), c2 = C.createCVCS({ boron_ppm: 700 });
        var s3 = plant(), c3 = C.createCVCS({ boron_ppm: 700 });
        for (var q = 0; q < N(3000); q++) {
          C.stepCVCS(c1, s1, 0.02, { si_kgs: 5, si_ppm: 2500 });
          C.stepCVCS(c2, s2, 0.02);
          C.stepCVCS(c3, s3, 0.02, { si_kgs: 5, si_ppm: 700 });
        }
        return c1.boron_ppm > c2.boron_ppm + 15 && c1.boron_ppm < 2500 &&
               Math.abs(c3.boron_ppm - c2.boron_ppm) < 0.5;
      })(), '60 s at 5 kg/s of 2,500 ppm RWST water against the untouched twin');
  /* A MATCHED LINEUP MUST HOLD BORON **WHILE INVENTORY IS CHANGING** -- and that is the only
   * place the re-concentration term is observable. Adding water at the RCS's own concentration
   * cannot shift concentration, so the transport term (+C*dM/M) and the re-concentration term
   * (-C*dM/M) must cancel EXACTLY. The first version of this check ran the balanced lineup, where
   * dM = 0 and both terms are zero -- it passed with the re-concentration term deleted, because
   * there was nothing for it to do. A conservation check on a system with no net flow is a check
   * on nothing. */
  var cvM = C.createCVCS({ boron_ppm: 700, makeupSource: 'match',
                           chargingDemand: 1, letdownOpen: 0 });
  var sysM = plant();
  for (var m = 0; m < N(30000); m++) {
    var rM = C.stepCVCS(cvM, sysM, 0.02);
    S.stepPlant(sysM, 0.02, { corePower: 300000, sgDuty: 300000, sources: rM.sources });
  }
  ck('a MATCHED lineup holds boron WHILE inventory changes', cvM.boron_ppm, 700, 1e-6, 'ppm');
  /* BORON CANNOT REACH ZERO, AND THAT IS THE BALANCE'S DOING, NOT THE CLIP'S. dC/dt is
   * proportional to -C, so dilution decays ASYMPTOTICALLY: from 5 ppm, 20 minutes of maximum
   * charging with letdown open bottoms out at 4.385 ppm, and even an absurd 50-second step from
   * 1e-9 ppm stays positive. The engine's `if (cv.boron_ppm < 0)` clip is therefore UNREACHABLE
   * under any lineup this layer can produce -- deleting it reddens nothing, and it was measured
   * rather than assumed (D1 §31.1d: a surviving mutation may mean the gate is blind OR the
   * mutated thing does not matter, and only measurement separates them).
   *
   * The clip stays as a guard against a FUTURE step-change source -- an ECCS or RHR slug large
   * enough to overshoot in one step -- and carries no mutation, because a mutation that cannot
   * fail is noise in a self-test that exists to prove things CAN. */
  ckT('dilution decays asymptotically -- the floor is the PHYSICS, not a clip',
      (function () {
        var sy = plant(), cv = C.createCVCS({ boron_ppm: 5, makeupSource: 'dilute',
                                              chargingDemand: 1, letdownOpen: 1 });
        var lo = 1e9;
        for (var q = 0; q < N(60000); q++) { C.stepCVCS(cv, sy, 0.02); if (cv.boron_ppm < lo) lo = cv.boron_ppm; }
        return lo > 0 && isFinite(lo);
      })(), 'bottoms at 4.385 ppm from 5 over 20 min at max charge -- proportional decay, so ' +
      'zero is approached and never crossed');

  /* ---- 3b. THE RATE ACTUATOR (#507 wave 1) --------------------------------------------
   * A commanded ppm/s realized as a BLENDER: the step inverts the balance for the blend
   * concentration, clamped to [0, tank]. THE CLAMP IS THE CEILING — no ppm/s constant —
   * so the achievable rate is inFlow*(C_tank − C)/M and the sourced slow-at-high dilution
   * shape survives the actuator. */
  if (!quiet) console.log('\nRATE ACTUATOR  [a commanded ppm/s, blender-shaped, tank-clamped]');
  ckT('rate 0 is bit-identical to a never-commanded lineup',
      (function () {
        var s1 = plant(), s2 = plant();
        var c1 = C.createCVCS({}), c2 = C.createCVCS({});
        c2.boron_rate_cmd = 0;
        for (var q = 0; q < N(3000); q++) { C.stepCVCS(c1, s1, 0.02); C.stepCVCS(c2, s2, 0.02); }
        return c1.boron_ppm === c2.boron_ppm;
      })(), 'the actuator idles out of the balance entirely at rate 0');
  var cvR = C.createCVCS({ boron_ppm: 700, chargingDemand: 0.5, letdownOpen: 1 });
  cvR.boron_rate_cmd = 0.02;
  var sysR = plant();
  for (var r2 = 0; r2 < N(6000); r2++) C.stepCVCS(cvR, sysR, 0.02);
  ck('an unclamped mid-range command is METERED exactly (ppm/s achieved)',
     (cvR.boron_ppm - 700) / (N(6000) * 0.02), 0.02, 0.001, 'ppm/s');
  /* the ceiling: a firehose demand achieves exactly what tank concentration and the current
   * lineup can carry — measured against the closed form, not a remembered number */
  var cvF = C.createCVCS({ boron_ppm: 700, chargingDemand: 0.5, letdownOpen: 1 });
  cvF.boron_rate_cmd = 99;
  var sysF = plant();
  var res0 = C.stepCVCS(cvF, sysF, 0.02);
  var Mf = 0;
  for (var kf = 0; kf < sysF.nodes.length; kf++) Mf += sysF.nodes[kf].V * W.rho_from_h(sysF.nodes[kf].h, sysF.P);
  var ceil = (res0.charging_kgs + res0.seal_kgs) * (C.CVCS.boric_acid_ppm - 700) / Mf;
  var cF0 = cvF.boron_ppm;
  for (r2 = 0; r2 < N(3000); r2++) C.stepCVCS(cvF, sysF, 0.02);
  ck('a firehose demand is CLAMPED to the tank-and-lineup ceiling',
     (cvF.boron_ppm - cF0) / (N(3000) * 0.02), ceil, ceil * 0.05, 'ppm/s');
  ckT('a firehose DILUTION keeps the sourced slow-at-high shape through the actuator',
      (function () {
        function rate(ppm) {
          var cv = C.createCVCS({ boron_ppm: ppm, chargingDemand: 0.5, letdownOpen: 1 });
          cv.boron_rate_cmd = -99;
          var sy = plant(), p0 = cv.boron_ppm;
          for (var q = 0; q < N(3000); q++) C.stepCVCS(cv, sy, 0.02);
          return (p0 - cv.boron_ppm) / (N(3000) * 0.02);
        }
        var hi = rate(1400), lo = rate(350);
        return hi / lo > 3.4 && hi / lo < 4.6;      /* ~4x, the balance's own proportionality */
      })(), 'C_in clamps at 0, so dilution rate stays proportional to concentration');
  /* the lab sample: request -> pending -> posts with a new seq; a pending sample is not
   * re-drawn (the timer is shortened white-box — 1800 s is a counter, not physics) */
  ckT('the lab sample posts on expiry and a pending sample is not re-drawn',
      (function () {
        var cv = C.createCVCS({ boron_ppm: 712 }), sy = plant();
        if (cv.sample_seq !== 1 || typeof cv.sample_ppm !== 'number') return false;
        C.requestBoronSample(cv);
        if (!(cv._sample_timer > 0)) return false;
        cv._sample_timer = 100;
        C.requestBoronSample(cv);                    /* must NOT reset to 1800 */
        if (cv._sample_timer !== 100) return false;
        cv._sample_timer = 0.01;
        C.stepCVCS(cv, sy, 0.02);
        return cv._sample_timer === 0 && cv.sample_seq === 2 && cv.sample_ppm === Math.round(cv.boron_ppm);
      })(), 'seeded seq 1 at boot; request; expiry posts the rounded RCS ppm as seq 2');

  /* ---- 4. IT DRIVES THE REAL LOOP ----------------------------------------------------- */
  if (!quiet) console.log('\nINVENTORY  [the sources go straight into Layer 3, unmodified]');
  /* MEASURE THE LEDGER, NOT THE RECONSTRUCTION -- and this cost a blind spot to learn.
   *
   * There are two ways to ask what a plant weighs. `sys.M_total` is the LEDGER: Layer 2 moves it
   * only by boundary sources, so it tracks charging and letdown exactly. `SUM V*rho(h,P)` is
   * RECONSTRUCTED from the state, and a rigid loop pins V -- so it can only represent inventory
   * the property table has a PRESSURE for.
   *
   * Measured, with letdown's sign flipped so 61 kg goes the wrong way:
   *     clean     P 2608 psia   M_total -30.7 kg   SUM V*rho 16917.6
   *     MUTATED   P 2611 psia   M_total +31.0 kg   SUM V*rho 16918.0   <-- unchanged
   * 2611 psia is 18.0 MPa, the property table's ceiling EXACTLY. The mutated plant pegged there
   * and the two mass measures silently diverged by 61 kg. The ledger caught the defect perfectly;
   * the reconstruction could not, and it was the reconstruction being checked.
   *
   * This is the third time this session a probe read numbers from a plant outside its valid
   * regime (D1 §29.5, §31.1b). The regime is now ASSERTED rather than assumed. */
  var sysI = plant();
  var cvI = C.createCVCS({ chargingDemand: 1, letdownOpen: 0 });   /* max charge, no letdown */
  /* TEN SECONDS, NOT SIXTY, AND THE REASON IS THE ENVELOPE. This probe drives 300 MW into a loop
   * whose sink is a fixed number rather than a modelled SG, so pressure climbs on the thermal
   * imbalance alone -- 2235 -> 2602 psia in 5 s before charging contributes anything. At 15 s it
   * reaches 2611 psia, which is 18.0 MPa, the property table's ceiling, and from there the ledger
   * and the reconstruction part company: 0.0012 % at 10 s, 0.44 % at 60 s.
   *
   * The first version ran 60 s and read the reconstruction, so it was reporting a plant that had
   * been pinned at the ceiling for three quarters of the run. FOURTH unphysical fixture this
   * session. The window is now inside the envelope and the guard below ASSERTS that it is. */
  var M0 = sysI.M_total;
  var rI = null;
  for (var t = 0; t < 500; t++) {
    rI = C.stepCVCS(cvI, sysI, 0.02);
    S.stepPlant(sysI, 0.02, { corePower: 300000, sgDuty: 300000, sources: rI.sources });
  }
  var M1 = sysI.M_total;
  var recon = 0; sysI.nodes.forEach(function (n) { recon += n.V * W.rho_from_h(n.h, sysI.P); });
  ckT('max charging with letdown isolated ADDS inventory through the loop', M1 > M0,
      (M1 - M0).toFixed(1) + ' kg in 10 s at ' + C.CVCS.charging_max_gpm().toFixed(1) +
      ' gpm  [the LEDGER, not the reconstruction]');
  /* THE SATURATION GUARD. Ledger and reconstruction must agree, or the plant has left the
   * envelope the property table can represent and every number read from it is suspect. Nothing
   * reported this when it happened -- the run looked entirely normal. */
  ckT('the ledger and the reconstructed inventory still AGREE  [envelope guard]',
      Math.abs(M1 - recon) / M1 < 1e-3,
      'ledger ' + M1.toFixed(1) + ' vs reconstructed ' + recon.toFixed(1) + ' kg (' +
      (100 * Math.abs(M1 - recon) / M1).toFixed(4) + ' %) -- a plant pinned at the table ceiling ' +
      'reads a plausible mass and is not one');
  /* AND THE OTHER DIRECTION, because the fill probe isolates letdown and so never exercises its
   * SIGN. Letdown enters Layer 3 as a NEGATIVE source; flipped positive it would add inventory
   * while the readout still called it letdown -- and nothing above would have noticed. */
  var sysD = plant();
  var cvD = C.createCVCS({ chargingDemand: 0, letdownOpen: 1 });
  var D0 = sysD.M_total;
  for (var td = 0; td < 500; td++) {
    var rD = C.stepCVCS(cvD, sysD, 0.02);
    S.stepPlant(sysD, 0.02, { corePower: 300000, sgDuty: 300000, sources: rD.sources });
  }
  var D1 = sysD.M_total;
  ckT('letdown with charging secured REMOVES inventory  [the sign, through the loop]', D1 < D0,
      (D1 - D0).toFixed(1) + ' kg in 10 s -- a positive-signed letdown would ADD here while ' +
      'still reading as letdown');

  ckT('the fill rate is REPORTED, never banded',
      isFinite(C.maxFillRateFracPerMin(sysI)) && C.maxFillRateFracPerMin(sysI) > 0,
      (100 * C.maxFillRateFracPerMin(sysI)).toFixed(2) + ' %/min of RCS mass -- NO BAND ' +
      'ASSERTED; the pressurizer level this becomes is #472\'s, not this layer\'s');
  /* CHARGING MUST BE COLDER THAN **THE NODE IT ENTERS** -- not colder than some fixed reference.
   * The first version compared against h_l(304.5 degC), a constant, and it caught the "charging
   * arrives at loop temperature" mutation only because a 60-second run had heated the plant past
   * that constant. Shortening the window to stay inside the envelope made the same check go
   * BLIND: at 10 s the cold leg is 289 degC, below the constant, so the mutated value passed.
   *
   * A check whose subject is a RELATIONSHIP ("colder than the loop") must compare against the
   * loop, or it is measuring the fixture's history instead of the property. */
  var coldLegH = null;
  sysI.nodes.forEach(function (n) { if (n.id === 'cold_leg') coldLegH = n.h; });
  ckT('charging arrives COLDER THAN THE NODE IT ENTERS  [a local cooldown, not just a fill]',
      rI.sources[0].h < coldLegH - 100,
      rI.sources[0].h.toFixed(0) + ' kJ/kg into a cold leg at ' + coldLegH.toFixed(0) +
      ' -- teachable, and the reason charging moves a cold-leg temperature the operator sees');

  /* ---- 5. CONSTRUCTION  [written FIRST this time -- §31] ------------------------------- */
  if (!quiet) console.log('\nCONSTRUCTION  [§31: every other layer was blind here. Written first.]');
  var opt = C.createCVCS({ chargingDemand: 0.25, letdownOpen: 0.5, boron_ppm: 1234,
                           makeupSource: 'borate', isolated: true, K: 0.017 });
  ck('caller chargingDemand reaches the plant', opt.chargingDemand, 0.25, 1e-12, '');
  ck('caller letdownOpen reaches the plant', opt.letdownOpen, 0.5, 1e-12, '');
  ck('caller boron reaches the plant', opt.boron_ppm, 1234, 1e-12, 'ppm');
  ck('caller orifice coefficient reaches the plant', opt.K, 0.017, 1e-12, '');
  ckT('caller makeupSource reaches the plant', opt.makeupSource === 'borate', opt.makeupSource);
  ckT('caller isolation reaches the plant AND stops charging', opt.isolated === true &&
      C.stepCVCS(C.createCVCS({ chargingDemand: 1, isolated: true }), plant(), 0.02)
        .charging_kgs === 0,
      'isolated with full demand delivers 0 kg/s -- the flag is not cosmetic');
  /* THE VITAL BUS (#507 wave 4): the charging pump is a motor load and asks ac_available;
   * letdown is an orifice against system pressure and keeps flowing -- DECLARED. */
  var rSbo = C.stepCVCS(C.createCVCS({ chargingDemand: 1, letdownOpen: 1 }), plant(), 0.02,
                        { ac_available: false });
  ckT('a dead vital bus stops charging AND seal injection at full demand',
      rSbo.charging_kgs === 0 && rSbo.seal_kgs === 0,
      'demand stands (the #200 split) -- restored power gives the pump back');
  ckT('...while LETDOWN keeps flowing (an orifice, not a motor load -- declared)',
      rSbo.letdown_kgs > 0, rSbo.letdown_kgs.toFixed(3) + ' kg/s out with the bus dead');
  ckT('absent drivers mean POWERED -- every fixture above holds (acAvailable convention)',
      C.stepCVCS(C.createCVCS({ chargingDemand: 1 }), plant(), 0.02).charging_kgs > 0, '');
  ckT('omitting chargingDemand gives the SOURCED normal flow, not zero and not maximum',
      Math.abs(GPM(C.stepCVCS(C.createCVCS({}), plant(), 0.02).charging_kgs) -
               C.CVCS.charging_normal_gpm()) < 1e-6,
      GPM(C.stepCVCS(C.createCVCS({}), plant(), 0.02).charging_kgs).toFixed(2) +
      ' gpm -- a default of 0 or 1 would make every probe that omits it test a lineup ' +
      'no plant runs');
  ckT('demand is clamped to 0..1 rather than trusted',
      C.stepCVCS(C.createCVCS({ chargingDemand: 9 }), plant(), 0.02).charging_kgs <=
      C.gpmToKgs(C.CVCS.charging_max_gpm(), 1000) + 1e-12 &&
      C.stepCVCS(C.createCVCS({ chargingDemand: -3 }), plant(), 0.02).charging_kgs === 0,
      'demand 9 delivers max, demand -3 delivers nothing');
}

console.log('\nPWR2 Layer 5 -- CVCS: charging, letdown and boron');
var C = loadFrom(SRC), rec = [];
runSuite(C, rec, false);
var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;

/* ---------------------------------------------------------------- INJECTION SELF-TEST */
var MUTATIONS = [
  ['the RHR letdown path severed (#510 H-2 re-armed: Mode 4 seal injection has no exit)',
   '? cv.letdownOpen * normalLetdownKgs() : 0;', '? 0 : 0;'],
  ['the regen recovery deleted (the return arrives cold; the closed loop stands ~200 kW of ' +
   'parasitic cooling)',
   'h_in = h_charge + CVCS.regen_effectiveness', 'h_in = h_charge + 0 * CVCS.regen_effectiveness'],
  ['letdown becomes a constant flow (the coupling is destroyed)',
   'cv.letdownOpen * cv.K * Math.sqrt(dP)', 'cv.letdownOpen * cv.K * Math.sqrt(13.34)'],
  ['the orifice runs backwards below its backpressure',
   '(cv.letdownOpen <= 0 || dP <= 0) ? 0 :', '(cv.letdownOpen <= 0) ? 0 :'],
  ['the SI boron term is dropped (#510 M-1 re-armed: injection dilutes instead of borating)',
   'var dC = (inFlow * C_in + si * C_si - letdown * cv.boron_ppm) / M;',
   'var dC = (inFlow * C_in - letdown * cv.boron_ppm) / M;'],
  ['letdown stops carrying the RCS concentration away (boron shape breaks)',
   'var dC = (inFlow * C_in + si * C_si - letdown * cv.boron_ppm) / M;',
   'var dC = (inFlow * C_in + si * C_si - letdown * 0) / M;'],
  ['the re-concentration term dropped (inventory change stops affecting ppm)',
   'cv.boron_ppm = cv.boron_ppm + dt * (dC - cv.boron_ppm * dM / M);',
   'cv.boron_ppm = cv.boron_ppm + dt * dC;'],
  /* SEAL INJECTION, ruled unscaled 2026-08-15. It is not a control -- it runs with the charging
   * pumps -- so the mutations are that it vanishes, that it gets scaled after all, and that
   * letdown stops carrying it. */
  ['seal injection dropped entirely (letdown then over-drains the plant)',
   'var seal = (cv.isolated || !powered) ? 0 : gpmToKgs(sealInjectionGpm(), 1000);',
   'var seal = 0;'],
  ['the charging power gate is severed (a blacked-out pump keeps charging) -- #507 wave 4',
   'var powered = !drivers || drivers.ac_available !== false;',
   'var powered = true;'],
  ['seal injection SCALED after all (a seal shrinks because the plant is smaller)',
   'return CVCS.seal_injection_gpm_per_pump * CVCS.rcp_count;',
   'return CVCS.seal_injection_gpm_per_pump * CVCS.rcp_count * volumeScale();'],
  ['letdown stops carrying seal injection (inventory climbs on its own)',
   'return gpmToKgs(CVCS.charging_normal_gpm() + sealInjectionGpm(), 1000);',
   'return gpmToKgs(CVCS.charging_normal_gpm(), 1000);'],
  ['the scale factor is written down instead of derived from Layer 1',
   'function volumeScale() { return rcsVolume() / GINNA_RCS_M3; }',
   'function volumeScale() { return 0.20; }'],
  ['charging scaled by POWER instead of the declared volume basis',
   'charging_max_gpm:    function () { return 180 * volumeScale(); },',
   'charging_max_gpm:    function () { return 180 * (300 / 1520); },'],
  ['the boric acid tank leaves the sourced RWST band',
   'boric_acid_ppm: 2500,', 'boric_acid_ppm: 3500,'],
  ['charging arrives at loop temperature instead of cold',
   'var h_charge = W.h_l(Math.min(60, W.T_from_h(node ? node.h : 1250, sys.P)), sys.P);',
   'var h_charge = node ? node.h : 1250;'],
  ['letdown leaves as a POSITIVE source (inventory runs away)',
   "{ node: 'cold_leg', mdot: -letdown,  h: h_node }",
   "{ node: 'cold_leg', mdot: letdown,  h: h_node }"],
  ['the orifice coefficient stops being calibrated at NOP',
   'return normalLetdownKgs() / Math.sqrt(dP);', 'return 0.02;'],
  /* CONSTRUCTION -- the class §31 found in every other layer */
  ['caller chargingDemand ignored at construction',
   'chargingDemand: opts.chargingDemand === undefined ? null : opts.chargingDemand,',
   'chargingDemand: null,'],
  ['caller letdownOpen ignored at construction',
   'letdownOpen: opts.letdownOpen === undefined ? 1 : opts.letdownOpen,', 'letdownOpen: 1,'],
  ['caller boron ignored at construction',
   'boron_ppm: opts.boron_ppm === undefined ? 700 : opts.boron_ppm,', 'boron_ppm: 700,'],
  ['caller makeupSource ignored at construction',
   "makeupSource: opts.makeupSource === undefined ? 'match' : opts.makeupSource,",
   "makeupSource: 'match',"],
  ['caller isolation ignored at construction', 'isolated: !!opts.isolated', 'isolated: false'],
  ['the default lineup becomes maximum charging instead of normal',
   'var demand = cv.chargingDemand === null\n      ? CVCS.charging_normal_gpm() / CVCS.charging_max_gpm()\n      : Math.max(0, Math.min(1, cv.chargingDemand));',
   'var demand = cv.chargingDemand === null ? 1 : Math.max(0, Math.min(1, cv.chargingDemand));'],
  ['demand no longer clamped (a caller can exceed the pumps)',
   'Math.max(0, Math.min(1, cv.chargingDemand))', 'cv.chargingDemand'],
  /* THE RATE ACTUATOR (#507 wave 1) */
  ['the blender inversion is deleted (a commanded rate falls through to the match lineup)',
   "    if (cv.boron_rate_cmd !== 0 && inFlow > 0 && M > 0) {",
   '    if (false) {'],
  ['the tank clamp is deleted (a firehose demand borates at any rate the caller likes)',
   '      C_in = Math.max(0, Math.min(CVCS.boric_acid_ppm,\n        cv.boron_ppm + cv.boron_rate_cmd * M / inFlow));',
   '      C_in = cv.boron_ppm + cv.boron_rate_cmd * M / inFlow;'],
  ['the lab result never posts (the sample clock counts to nothing)',
   '        cv.sample_ppm = Math.round(cv.boron_ppm);\n        cv.sample_seq = (cv.sample_seq || 0) + 1;',
   '']
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
MUTATIONS.forEach(function (m) {
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
console.log('  run_pwr2_cvcs: ' + pass + ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit((fail > 0 || blind > 0) ? 1 : 0);
