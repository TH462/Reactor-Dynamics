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
['pwr2_water', 'pwr2_geometry', 'pwr2_core', 'pwr2_loop'].forEach(function (f) {
  require(path.join(E, f + '.js'));
});
var RD = globalThis.RD.pwr2, GEO = RD.geometry;

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
}

console.log('\nPWR2 Layer 4 -- located sources and integrated loop momentum');
var S = loadFrom(SRC), rec = [];
runSuite(S, rec, false);
var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;

var MUTATIONS = [
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
   'sys.mdot_loop = sys.mdot_loop + dt * net * 1e6 / sys.LA;', '']
];

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
