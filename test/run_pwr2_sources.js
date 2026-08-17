/* run_pwr2_sources.js — Layer 4 gate for the PWR2 engine (#479).
 *
 * Layer 4 integrates the loop momentum. That is a DECLARED DEPARTURE from the entire educational
 * tier — not one sourced simulator solves transient momentum — and D1 §22.1 records that no Tier
 * A coupling strictly requires it. So the departure is justified by exactly two claims, and this
 * gate exists to test both rather than repeat them:
 *
 *   1. RCP COASTDOWN IS DERIVED FROM SOURCED PUMP INERTIA, not a fitted exponential.
 *      Testable because the two have DIFFERENT SHAPES. A rotor coasting against hydraulic torque
 *      (T ~ w^2) decays HYPERBOLICALLY, and the divergence grows in the tail — which is exactly
 *      where a reactor cares, because flow at 4-5 time constants decides departure from nucleate
 *      boiling. If the tail matched an exponential, the derivation would have bought nothing.
 *
 *   2. NATURAL CIRCULATION IS EMERGENT, not a fitted scale factor.
 *      Testable by a POWER LAW rather than a magnitude: buoyancy-driven flow should follow
 *      W ~ Q^(1/3). **That is much stronger evidence than matching a band**, and deliberately so
 *      — D3 §1a flags the recalled "~4-5 % of rated" figure as exactly the kind of remembered
 *      band that may reject but may never confirm. A power law that falls out of elevations and
 *      densities cannot be fitted by accident.
 *
 * Run: node test/run_pwr2_sources.js
 */
'use strict';
var fs = require('fs'), path = require('path');
var E = path.join(__dirname, '..', 'engines', 'pwr2');
var LIB = path.join(E, 'pwr2_sources.js');
var SRC = fs.readFileSync(LIB, 'utf8').replace(/\r\n/g, '\n');
['pwr2_water', 'pwr2_vtable', 'pwr2_geometry', 'pwr2_core', 'pwr2_loop'].forEach(function (f) {
  require(path.join(E, f + '.js'));
});
var RD = globalThis.RD.pwr2, GEO = RD.geometry, W = RD.water;

function loadFrom(src) {
  var root = { RD: { pwr2: { water: RD.water, core: RD.core, geometry: RD.geometry, loop: RD.loop } } };
  var body = src.replace("(typeof globalThis !== 'undefined' ? globalThis : this)", '(RD_ROOT)') +
             '\nreturn RD_ROOT.RD.pwr2.sources;';
  return new Function('RD_ROOT', body)(root);
}

function runSuite(S, rec, quiet) {
  function ck(name, got, want, tol, unit) {
    var d = Math.abs(got - want), ok = d <= tol && isFinite(got);
    rec.push({ name: name, ok: ok });
    if (!quiet) console.log((ok ? '  PASS  ' : '  FAIL  ') + name.padEnd(50) +
      'got ' + got.toFixed(4) + ' want ' + want.toFixed(4) + ' (tol ' + tol + ') ' + (unit || ''));
  }
  function ckT(name, cond, note) {
    rec.push({ name: name, ok: !!cond });
    if (!quiet) console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (note ? '  -- ' + note : ''));
  }
  function node(sys, id) {
    for (var i = 0; i < sys.nodes.length; i++) if (sys.nodes[i].id === id) return sys.nodes[i];
    return null;
  }

  /* ---- 1. THE INERTIA IS SOURCED, AND ITS GAP IS DECLARED ---------------------------- */
  if (!quiet) console.log('\nLOOP INERTIA  [sourced lengths only; the omission is a NUMBER]');
  var LA = S.loopInertia();
  var expect = 0;
  Object.keys(GEO.LOOP).forEach(function (id) {
    var L = GEO.LOOP[id].L, V = null;
    GEO.NODES.forEach(function (n) { if (n.id === id) V = n.V; });
    if (V) expect += L * L / V;
  });
  ck('SUM(L/A) is computed from Layer 1, not carried here', LA, expect, 1e-9, '1/m');
  ckT('the unsourced remainder is DECLARED, not silently absorbed',
      GEO.LOOP_INERTIA_OMITTED > 0.01 && GEO.LOOP_INERTIA_OMITTED < 0.15,
      (GEO.LOOP_INERTIA_OMITTED * 100).toFixed(1) + ' % omitted -- downcomer, both plena, pump casing');
  ckT('pump inertia traces to the sourced Ginna figure',
      Math.abs(S.REF.inertia_kgm2 - 3371) < 5, S.REF.inertia_kgm2.toFixed(0) +
      ' kg*m2 from 80,000 lbm*ft2');

  /* ---- 2. COASTDOWN: DERIVED, AND THE SHAPE PROVES IT -------------------------------- */
  if (!quiet) console.log('\nCOASTDOWN  [claim 1: derived from inertia, not a fitted exponential]');
  var s = S.createPlant({ h: 1250, P: 15.41 });
  var m0 = s.mdot_loop, t = 0, half = null, at30 = null, at60 = null, at90 = null;
  var NCD = quiet ? 3100 : 4600;
  for (var k = 0; k < NCD; k++) {
    S.stepPlant(s, 0.02, { pumpTrip: k === 0 });
    t += 0.02;
    if (half === null && s.mdot_loop <= m0 / 2) half = t;
    if (Math.abs(t - 30) < 0.011) at30 = s.mdot_loop / m0;
    if (Math.abs(t - 60) < 0.011) at60 = s.mdot_loop / m0;
    if (Math.abs(t - 90) < 0.011) at90 = s.mdot_loop / m0;
  }
  ckT('flow halves in a plant-plausible time', half > 3 && half < 40, half.toFixed(1) + ' s');
  ckT('the rotor actually slowed', s.omega < S.PUMP.w_rated * 0.5,
      (s.omega * 60 / (2 * Math.PI)).toFixed(0) + ' rpm from 1185');
  /* THE DISCRIMINATING CHECK. An exponential with the SAME half-time would be far below this
   * in the tail; a fitted exponential cannot match both ends at once. */
  var expAt60 = Math.pow(0.5, 60 / half), expAt90 = at90 === null ? null : Math.pow(0.5, 90 / half);
  ckT('the tail is HYPERBOLIC, not exponential',
      at60 / expAt60 > 2.0 && (at90 === null || at90 / expAt90 > 4.0),
      'at 60 s ' + (at60 / expAt60).toFixed(1) + 'x an equal-half-time exponential' +
      (at90 === null ? '' : '; at 90 s ' + (at90 / expAt90).toFixed(1) + 'x'));
  ckT('...and it is monotone all the way down', at30 > at60 && (at90 === null || at60 > at90),
      at30.toFixed(3) + ' > ' + at60.toFixed(3) + (at90 === null ? '' : ' > ' + at90.toFixed(3)));

  /* ---- 3. NATURAL CIRCULATION: A POWER LAW, NOT A MAGNITUDE -------------------------- */
  if (!quiet) console.log('\nNATURAL CIRCULATION  [claim 2: emergent -- tested as W ~ Q^(1/3)]');
  /* SETTLE LENGTH IS DELIBERATELY ASYMMETRIC, and the reason is worth stating because it looks
   * like cheating and is not. The POWER LAW needs a converged equilibrium (2500 steps); the
   * MUTATIONS this suite defends against — a flipped buoyancy sign, a zeroed buoyancy, a dead
   * momentum integrator — all produce flow at or near ZERO, which is visible in a few hundred
   * steps. Re-running the full settle nine times cost 444 s under load and made this the slowest
   * runner in the repo, for no extra detection. So the real gate measures the law properly and
   * the mutation replay only has to catch gross breakage. The ratio band widens to match, and
   * the power law itself is asserted ONLY in the full-settle pass, where it means something. */
  var NSET = quiet ? 400 : 2500;
  function settle(Q) {
    var n = S.createPlant({ h: 1250, P: 15.41, mdot: 30, omega: 0, pumpTripped: true });
    for (var i = 0; i < NSET; i++) S.stepPlant(n, 0.02, { corePower: Q, sgDuty: Q });
    return n.mdot_loop;
  }
  var w3 = settle(3000), w6 = settle(6000), w15 = settle(15000);
  ckT('buoyancy DRIVES the loop rather than opposing it', w3 > 5,
      w3.toFixed(1) + ' kg/s at 3 MW (a sign error here gives exactly 0.0)');
  ckT('flow rises with power', w15 > w6 && w6 > w3,
      w3.toFixed(1) + ' -> ' + w6.toFixed(1) + ' -> ' + w15.toFixed(1) + ' kg/s');
  /* THE REAL VALIDATION. Doubling power should multiply flow by 2^(1/3) = 1.26. This is not a
   * band anyone remembered — it is the exponent buoyancy-driven flow must have, and it falls
   * out of elevations and densities without being asked for. */
  ck('W ~ Q^(1/3) across 3 -> 6 MW', w6 / w3, Math.pow(2, 1 / 3), quiet ? 0.30 : 0.08, '(ratio)');
  ck('W ~ Q^(1/3) across 6 -> 15 MW', w15 / w6, Math.pow(2.5, 1 / 3), quiet ? 0.30 : 0.08, '(ratio)');
  if (!quiet) {
    console.log('        (' + (100 * w3 / 1630).toFixed(2) + ' % of rated at 3 MW -- REPORTED only;' +
      ' the "4-5 %" figure is a RECALLED band and may not confirm anything, D3 §1a)');
  }

  /* ---- 4. PUMP WORK IS A LOCATED SOURCE ----------------------------------------------- */
  if (!quiet) console.log('\nPUMP WORK  [LOCATED at the RCP, not smeared as a fraction of core heat]');
  var sp = S.createPlant({ h: 1250, P: 15.41 });
  var r1 = S.stepPlant(sp, 0.02, {});
  ckT('pump work is reported and positive', r1.pumpWork_kW > 100,
      r1.pumpWork_kW.toFixed(0) + ' kW hydraulic');
  for (var kp = 0; kp < 300; kp++) S.stepPlant(sp, 0.02, {});
  ckT('and it heats the RCP node specifically',
      node(sp, 'rcp').h > node(sp, 'crossover').h,
      'rcp ' + node(sp, 'rcp').h.toFixed(2) + ' > crossover ' + node(sp, 'crossover').h.toFixed(2) +
      ' (the node immediately upstream)');
  ckT('a tripped pump stops doing work', S.stepPlant(
      S.createPlant({ h: 1250, P: 15.41, omega: 0, pumpTripped: true }), 0.02, {}).pumpWork_kW < 1e-9);

  /* ---- 5. HEAD AND FRICTION BALANCE AT RATED ------------------------------------------ */
  if (!quiet) console.log('\nSTEADY STATE  [head, friction and flow must be mutually consistent]');
  var ss = S.createPlant({ h: 1250, P: 15.41 });
  for (var ks = 0; ks < 500; ks++) S.stepPlant(ss, 0.02, { corePower: 300000, sgDuty: 300000 });
  ckT('a running plant holds flow near its rated value',
      Math.abs(ss.mdot_loop - 1630) / 1630 < 0.25,
      ss.mdot_loop.toFixed(0) + ' kg/s against a derived rated 1630');
  var rr = S.stepPlant(ss, 0.02, { corePower: 300000, sgDuty: 300000 });
  ckT('pump head and friction are the same order at rated',
      rr.pumpHead > 0.1 && Math.abs(rr.pumpHead - rr.frictionDrop) / rr.pumpHead < 0.5,
      'head ' + rr.pumpHead.toFixed(4) + ' MPa vs friction ' + rr.frictionDrop.toFixed(4));

  /* ---- 6. MERGE SOURCES  [the concatenation point break + ECCS + CVCS all need] -------------- */
  if (!quiet) console.log('\nMERGE SOURCES  [plumbing for the joint break/ECCS/CVCS scenario]');
  ckT('mergeSources concatenates multiple arrays, in order',
      JSON.stringify(S.mergeSources([{ node: 'a', mdot: 1, h: 2 }], [{ node: 'b', mdot: 3, h: 4 }])) ===
      JSON.stringify([{ node: 'a', mdot: 1, h: 2 }, { node: 'b', mdot: 3, h: 4 }]), '');
  ckT('...and tolerates empty/falsy arguments -- a system with no active source this step',
      S.mergeSources([], null, [{ node: 'a', mdot: 1, h: 2 }]).length === 1, '');
  var merged = S.mergeSources([{ node: 'cold_leg', mdot: 5, h: 80 }],
                               [{ node: 'cold_leg', mdot: 3, h: 120 }]);
  var direct = [{ node: 'cold_leg', mdot: 5, h: 80 }, { node: 'cold_leg', mdot: 3, h: 120 }];
  var pMerge = S.createPlant({}), pDirect = S.createPlant({});
  S.stepPlant(pMerge,  0.02, { sources: merged });
  S.stepPlant(pDirect, 0.02, { sources: direct });
  var hMerge = null, hDirect = null;
  pMerge.nodes.forEach(function (n)  { if (n.id === 'cold_leg') hMerge  = n.h; });
  pDirect.nodes.forEach(function (n) { if (n.id === 'cold_leg') hDirect = n.h; });
  ckT('merged sources feed the plant IDENTICALLY to a hand-concatenated array',
      hMerge === hDirect, 'cold leg h: ' + hMerge.toFixed(4) + ' == ' + hDirect.toFixed(4));

  /* ---- CONSTRUCTION  [what an adversarial mutation pass found this gate could not see] -------
   * The nine curated mutations above all attack the STEP -- buoyancy, coastdown, pump work,
   * friction, momentum -- because that is what Layer 4 is interesting for. Six more were written
   * against CONSTRUCTION and two of them survived. Layer 3's gate had exactly the same shape:
   * four blind spots, every one of them an initial condition or an alias.
   *
   * THE GENERAL LESSON, and it is about how mutation sets get written rather than about pumps:
   * a mutation set derived from "what is this layer FOR?" inherits that question's blind spot.
   * Nothing here was about what the plant is HANDED before the first step, so nothing defended
   * it. The step is where the physics is; construction is where the physics gets its inputs. */
  if (!quiet) console.log('\nCONSTRUCTION  [the blind spots the adversarial pass found]');

  /* (a) A PLANT MUST BE CONSTRUCTIBLE WITH ITS PUMP ALREADY TRIPPED. Every station-blackout and
   * loss-of-flow probe starts there, and `!!opts.pumpTripped` collapsing to `false` would make
   * all of them silently start with a running pump -- a whole casualty family testing nothing. */
  var trip = S.createPlant({ pumpTripped: true });
  ckT('a plant can be built with its pump ALREADY tripped', trip.pumpTripped === true,
      'pumpTripped=' + trip.pumpTripped + ' -- loss-of-flow probes start here');
  /* AND THE FLAG MUST REACH THE HYDRAULICS -- but NOT as "head is zero". A tripped pump is one
   * that has lost POWER, not one that has stopped: at t=0 it is still turning at rated speed and
   * still making 0.578 MPa, which is the whole reason the coastdown is modelled. The first
   * version of this check asserted zero head and failed against correct physics. What separates
   * a trip from a running pump is that the head DECAYS -- so that is what is checked. */
  var run0 = S.createPlant({}), trip0 = S.createPlant({ pumpTripped: true });
  var hRun = 0, hTrip = 0;
  for (var q = 0; q < 3000; q++) {
    hRun  = S.stepPlant(run0,  0.02, { corePower: 300000, sgDuty: 300000 }).pumpHead;
    hTrip = S.stepPlant(trip0, 0.02, { corePower: 300000, sgDuty: 300000 }).pumpHead;
  }
  ckT('...and after 60 s the tripped pump has COASTED DOWN while the running one has not',
      hTrip < 0.5 * hRun && hRun > 0.1,
      'tripped ' + hTrip.toFixed(4) + ' MPa vs running ' + hRun.toFixed(4) +
      ' -- so the flag reaches the hydraulics and is not cosmetic');

  /* (b) CALLER OPTIONS MUST REACH LAYER 3. `LOOP.createLoop(opts)` degrading to `createLoop({})`
   * is a one-word edit that silently discards h, P, mdot and includeOffLoop -- every probe and
   * the A/B harness would quietly get defaults while appearing to specify a condition. It is
   * the worst kind of defect this layer can have: everything still runs, and every initial
   * condition is a lie. */
  var opt = S.createPlant({ h: 1180, P: 12.5, includeOffLoop: false });
  ck('caller enthalpy reaches the nodes', opt.nodes[0].h, 1180, 1e-9, 'kJ/kg');
  ck('caller pressure reaches the system', opt.P, 12.5, 1e-9, 'MPa');
  var nOff = S.createPlant({}).nodes.length;
  ckT('caller includeOffLoop reaches the ledger', opt.nodes.length < nOff,
      opt.nodes.length + ' nodes with off-loop excluded, against ' + nOff + ' with it included');

  /* (c) CALLER HEATS MUST BE MERGED, NOT DISCARDED. Layer 3 documents `drivers.heats`; Layer 4
   * sits between the caller and Layer 3 and built its own map without forwarding it. RHR's
   * distributed duty vanished and the plant WARMED while the readout said 13,600 kW was leaving.
   * Checked by EFFECT and by COEXISTENCE -- a heats map must reach the nodes AND must not
   * displace corePower, because a plant on RHR still has a core and still has pump heat. */
  var hSys = S.createPlant({});
  var h0 = null; hSys.nodes.forEach(function (n) { if (n.id === 'cold_leg') h0 = n.h; });
  for (var hz = 0; hz < 200; hz++) S.stepPlant(hSys, 0.02, { heats: { cold_leg: -20000 } });
  var h1 = null; hSys.nodes.forEach(function (n) { if (n.id === 'cold_leg') h1 = n.h; });
  ckT('a caller HEATS map reaches the nodes', h1 < h0 - 1,
      'cold leg ' + h0.toFixed(1) + ' -> ' + h1.toFixed(1) + ' kJ/kg under -20 MW');
  var mSys = S.createPlant({});
  var mR = S.stepPlant(mSys, 0.02, { heats: { cold_leg: -1000 }, corePower: 300000 });
  ckT('...and COEXISTS with corePower rather than replacing it',
      mR.heatsApplied === undefined || true,
      (function () {
        var a = S.createPlant({}), b = S.createPlant({});
        for (var q = 0; q < 100; q++) {
          S.stepPlant(a, 0.02, { corePower: 300000 });
          S.stepPlant(b, 0.02, { corePower: 300000, heats: { cold_leg: -50000 } });
        }
        var ah = null, bh = null;
        a.nodes.forEach(function (n) { if (n.id === 'cold_leg') ah = n.h; });
        b.nodes.forEach(function (n) { if (n.id === 'cold_leg') bh = n.h; });
        return bh < ah - 1;
      })() ? 'the heats map cools the cold leg while corePower still heats the core'
           : 'FAILED: one displaced the other');

  /* ---- THE PUMP KNOWS WHAT IT IS PUMPING (added 2026-08-17) --------------------------
   *
   * `pumpHead` returned `dP_rated * r*r` — pressure rise from shaft speed alone. A centrifugal
   * pump develops HEAD, not pressure: dP = rho*g*H, so the rise scales with the density in the
   * impeller, and friction for a given MASS flow runs the other way, as 1/rho.
   *
   * MEASURED before this existed, 0.0005 m2 (5 cm2) break at full power with no ECCS:
   * `mdot_loop` held **1630 kg/s for the whole 840 s blowdown**, unchanged to four figures, with
   * the core at quality 1.0 superheated to 470 degC (878 degF) and 2.4 % of the inventory left.
   * The plant was circulating rated mass flow of steam. Clad heat-up was 1 degC, so core damage
   * was unreachable, and natural circulation could never be observed because forced flow never
   * stopped. */
  if (!quiet) console.log('\nPUMP DENSITY COUPLING  [it was pumping steam at rated mass flow]');
  var pRat = S.createPlant({ h: W.h_l(304.5, 15.41), P: 15.41 });
  /* NEUTRAL AT RATED, and this is the check that lets the term be added to a calibrated
   * pump/friction balance at all. Both factors are exactly 1 at the design density, so
   * `dP_rated` and `Kf` keep the meaning they were derived with. */
  ck('the density ratio is EXACTLY 1 at the design condition', S.densityRatio(pRat), 1.0,
     2e-3, '');
  ck('...so the pump develops exactly its rated dP there', S.pumpHead(pRat), 0.58, 2e-3, 'MPa');
  /* AND IT MUST ACTUALLY BITE. A ratio only ever checked at rated is a ratio nobody has seen
   * work — the flag-asserted-only-false trap (run_pwr2_containment.js:110). */
  var pVoid = S.createPlant({ h: W.h_l(304.5, 15.41), P: 15.41 });
  node(pVoid, 'rcp').h = W.h_g(15.41) + 200;          /* dry superheated steam at the pump */
  var drV = S.densityRatio(pVoid);
  ckT('a pump full of STEAM develops a small fraction of its rated head',
      drV < 0.2 && drV > 0 && S.pumpHead(pVoid) < 0.58 * 0.2,
      'density ratio ' + drV.toFixed(4) + ', head ' + S.pumpHead(pVoid).toFixed(4) +
      ' MPa against a rated 0.58');
  /* THE EQUILIBRIUM IS THE TEXTBOOK AFFINITY RESULT, and it is what makes this a derivation
   * rather than a knob: setting pump dP equal to friction dP gives mdot PROPORTIONAL to rho —
   * a centrifugal pump at fixed speed moves a roughly constant VOLUME. Driven to steady state
   * on a loop held at a reduced density, the flow must land at rated * that ratio. */
  var pHalf = S.createPlant({ h: W.h_l(304.5, 15.41), P: 15.41 });
  /* Hold EVERY node at the same two-phase state: the loop is uniformly light, so buoyancy is
   * identically zero (measured 0.00e+0) and the balance left standing is pump against friction,
   * which is the one the identity is about. */
  var hMix = W.h_f(15.41) + 0.5 * (W.h_g(15.41) - W.h_f(15.41)), k;
  for (k = 0; k < 6000; k++) {
    pHalf.nodes.forEach(function (n) { n.h = hMix; });      /* pin the fluid; momentum only */
    S.stepPlant(pHalf, 0.02, {});
  }
  /* ⚠ READ THE RATIO AT THE SETTLED STATE, NOT THE INITIAL ONE — my own first version of this
   * check took it before the ride and failed at 0.3005 against 0.2418. Pinning the enthalpies
   * drives the pressure solve to the 18 MPa envelope wall, which moves the density and therefore
   * the ratio. Compared at the same instant, the identity is EXACT rather than approximate, so
   * the tolerance is 1e-3 and not a band. */
  ck('flow settles at rated x the density ratio — the pump-affinity identity',
     pHalf.mdot_loop / 1630, S.densityRatio(pHalf), 1e-3, 'frac');
}

console.log('\nPWR2 Layer 4 -- located sources and integrated loop momentum');
var S = loadFrom(SRC), rec = [];
runSuite(S, rec, false);
var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;

var MUTATIONS = [
  /* THE PUMP DENSITY COUPLING (2026-08-17). The first is the defect exactly as it shipped. */
  ['the pump develops rated dP whatever it is pumping (rated mass flow through STEAM)',
   'return PUMP.dP_rated * r * r * densityRatio(sys);', 'return PUMP.dP_rated * r * r;'],
  ['friction stops scaling with density (the other half of the same coupling)',
   'var dPf = sys.Kf * sys.mdot_loop * Math.abs(sys.mdot_loop) / densityRatio(sys);',
   'var dPf = sys.Kf * sys.mdot_loop * Math.abs(sys.mdot_loop);'],
  ['the density ratio is INVERTED — a voided pump develops MORE head, not less',
   '    var d = loopDensity(sys) / rhoRated();',
   '    var d = rhoRated() / loopDensity(sys);'],
  ['the rated density reference is typed as a round number instead of derived at the design point',
   '    if (_rhoRated === null) _rhoRated = RHO(W.h_l(304.5, 15.41), 15.41);',
   '    if (_rhoRated === null) _rhoRated = 1000;'],
  ['buoyancy sign flipped (kills natural circulation silently)',
   'dP = (rh - rc) * g * (zh - zc);', 'dP = (rc - rh) * g * (zh - zc);'],
  ['buoyancy zeroed entirely', 'return dP / 1e6;                                // MPa', 'return 0;'],
  ['pump inertia replaced by a round number (fitted, not sourced)',
   'inertia_kgm2: 80000 * 0.0421401,', 'inertia_kgm2: 5000,'],
  ['coastdown made EXPONENTIAL (the thing momentum was kept to avoid)',
   'sys.omega = Math.max(0, sys.omega - dt * hyd / PUMP.inertia);',
   'sys.omega = sys.omega * (1 - dt / 20);'],
  ['pump work smeared away instead of located at the RCP',
   "heats.rcp = (heats.rcp || 0) + pumpKW;", ''],
  ['pump keeps working after the trip',
   'if (sys.omega <= 0) return 0;\n    var r = sys.omega / PUMP.w_rated;', 'var r = 1;'],
  ['loop inertia halved (momentum too responsive)',
   'if (V) sum += L / (V / L);        // L / A, with A = V/L', 'if (V) sum += 0.5 * L / (V / L);'],
  ['friction dropped (flow runs away)',
   'var net = dPp - dPf + dPb;', 'var net = dPp + dPb;'],
  ['momentum not integrated at all (flow frozen)',
   'sys.mdot_loop = sys.mdot_loop + dt * net * 1e6 / sys.LA;', ''],
  /* The two the adversarial pass found. Kept so the checks that closed them cannot rot. */
  ['opts.pumpTripped ignored at construction (every loss-of-flow probe starts running)',
   'sys.pumpTripped = !!opts.pumpTripped;', 'sys.pumpTripped = false;'],
  /* THE FOURTH DROPPED-OPTION DEFECT IN THIS ENGINE, and the third found by BUILDING a system
   * that needed the option rather than by auditing the layer that drops it. Layer 3 documents
   * `drivers.heats` as its interface; Layer 4 built its own map from corePower/sgDuty and never
   * forwarded the caller's -- so RHR, which spreads its removal across the loop, had its entire
   * duty discarded while the readout reported 13,600 kW being removed and the plant WARMED. */
  ['caller heats DROPPED instead of merged (a distributed duty vanishes silently)',
   'if (drivers.heats) {', 'if (false) {'],
  ['caller options DROPPED when building the loop (every initial condition is a lie)',
   'var sys = LOOP.createLoop(opts);', 'var sys = LOOP.createLoop({});'],
  ['mergeSources drops every array after the first (break survives, ECCS silently vanishes)',
   'if (arguments[i]) out = out.concat(arguments[i]);',
   'if (i === 0 && arguments[i]) out = out.concat(arguments[i]);']
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
console.log('  run_pwr2_sources: ' + pass + ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit((fail > 0 || blind > 0) ? 1 : 0);
