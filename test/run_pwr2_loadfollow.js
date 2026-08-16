/* run_pwr2_loadfollow.js — THE ACCEPTANCE TEST. (#479)
 *
 * This is the bar the whole port was aimed at: Tier A coupling A1 — "power follows load" — with
 * the rods in MANUAL, driven entirely by temperature feedback. Nothing tells the reactor what
 * power to make. Steam demand falls, secondary pressure rises, primary temperature rises, and the
 * negative moderator and Doppler coefficients push power down until it matches the new demand.
 *
 * Every other pwr2 gate tests a piece. This one tests whether the pieces make a PLANT.
 *
 * ---------------------------------------------------------------------------------------
 * THE COMPARISON POINTS ARE REPORTED, NOT FITTED. `PWR2_VALIDATION.md` records the first engine's
 * A1: 100 -> 57.5 % power with Tavg 579.3 -> 602.1 degF. PWR2 is a from-scratch reformulation whose
 * moderator coefficient reads real Layer 0 density (-23.4 pcm/degC against the first engine's
 * -26.8, a change PWR2_PLANT.md ASKED FOR) and whose fuel rise is derived rather than tuned
 * (277 degC against 389). The two engines are therefore NOT expected to agree exactly, and a check
 * that forced them to would be fitting PWR2 to a plant it was built to replace. The bands below
 * are wide enough to admit the physics difference and tight enough that a broken coupling fails.
 *
 * MEASURED, this engine:  99.6 -> 54.7 %,  Tavg 577.75 -> 598.0 degF  (+20.3 against +22.8)
 *
 * ---------------------------------------------------------------------------------------
 * ⚠ THE BORON TRIM MUST USE THE FUEL TEMPERATURE. `criticalBoron` defaults the fuel to the
 * moderator temperature, which is the ZERO-POWER case. Omitting it at rated is a 693 pcm error,
 * and it fails SILENTLY: the plant starts subcritical, dips to 43 %, buys the reactivity back by
 * cooling 16 degC, and settles stable and self-consistent at a Tavg 29 degF below design. Every
 * absolute temperature in this file would have been wrong with nothing red. See D1 and the note
 * in pwr2_kinetics.js.
 *
 * Run: node test/run_pwr2_loadfollow.js
 */
'use strict';
var fs = require('fs'), path = require('path');
var E = path.join(__dirname, '..', 'engines', 'pwr2');
/* THE MUTATION TARGET IS THE STEAM GENERATOR. The reactivity loop itself is covered by
 * run_pwr2_reactor; what is NEW in this configuration is the SG standing between steam demand and
 * primary temperature, so that is the file whose breakage this gate must be able to see. */
var LIB = path.join(E, 'pwr2_sg.js');
var SRC = fs.readFileSync(LIB, 'utf8').replace(/\r\n/g, '\n');
['pwr2_water', 'pwr2_vtable', 'pwr2_geometry', 'pwr2_core', 'pwr2_loop', 'pwr2_sources',
 'pwr2_kinetics', 'pwr2_fuel', 'pwr2_reactor'].forEach(function (f) { require(path.join(E, f + '.js')); });
var RD = globalThis.RD.pwr2, W = RD.water, S = RD.sources, K = RD.kinetics, R = RD.reactor;

function loadFrom(src) {
  var root = { RD: { pwr2: { water: RD.water, vtable: RD.vtable, core: RD.core,
                             geometry: RD.geometry, loop: RD.loop, sources: RD.sources } } };
  var body = src.replace("(typeof globalThis !== 'undefined' ? globalThis : this)", '(RD_ROOT)') +
             '\nreturn RD_ROOT.RD.pwr2.sg;';
  return new Function('RD_ROOT', body)(root);
}

/* THE FIRST ENGINE'S A1, RETYPED from PWR2_VALIDATION.md — comparison points, not targets. */
var A1 = { power_from: 100, power_to: 57.5, tavg_from_f: 579.3, tavg_to_f: 602.1 };
var TREF = 304.5, P0 = 15.41, RATED = 300000;
function degF(c) { return c * 9 / 5 + 32; }

function runSuite(G, rec, quiet) {
  function ck(name, got, want, tol, unit) {
    var d = Math.abs(got - want), ok = d <= tol && isFinite(got);
    rec.push({ name: name, ok: ok });
    if (!quiet) console.log((ok ? '  PASS  ' : '  FAIL  ') + name.padEnd(56) +
      'got ' + got.toFixed(2) + ' want ' + want.toFixed(2) + ' (tol ' + tol + ') ' + (unit || ''));
  }
  function ckT(name, cond, note) {
    rec.push({ name: name, ok: !!cond });
    if (!quiet) console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (note ? '  -- ' + note : ''));
  }
  function head(s) { if (!quiet) console.log('\n' + s); }

  /* COST, budgeted as each check was written (D1 §31). MEASURED: 3 600 s of plant costs 70 s of
   * wall clock. The A1 transient SETTLES IN 60 SECONDS — the slow crawl after that is xenon
   * burning out, which is A7 and not this gate's subject — so the ride is 90 s of baseline plus
   * 150 s after the cut, and the whole suite runs in ~5 s. Choosing the horizon from what the
   * CHECK needs rather than from what looks thorough is the whole of the cost discipline. */
  var BASE = quiet ? 3000 : 4500;      /* 60 s vs 90 s */
  var AFTER = quiet ? 4000 : 7500;     /* 80 s vs 150 s */

  function plant() {
    var sys = S.createPlant({ h: W.h_l(TREF, P0), P: P0 });
    var rx  = R.createReactor({ P: 1.0, coolTemp_c: TREF });
    var sg  = G.createSG({});
    /* SEE THE HEADER: the fuel temperature is REQUIRED here, not optional. */
    var B   = K.criticalBoron(rx.kin, TREF, P0, null, rx.kin.X / rx.kin.X_eq_full, rx.fuel.T_fuel_c);
    var hg  = W.h_g(sg.P);
    return { sys: sys, rx: rx, sg: sg, B: B, rated_steam: RATED / (hg - G.SG.h_feed) };
  }
  function ride(pl, n, demandOf) {
    var r = null, sr = null, t = 0;
    for (var i = 0; i < n; i++) {
      var steam = pl.rated_steam * (demandOf ? demandOf(t) : 1.0);
      sr = G.stepSG(pl.sg, G.primaryTavg(pl.sys), 0.02, { feed: steam, steam: steam });
      r  = R.stepReactor(pl.rx, pl.sys, 0.02, { boron_ppm: pl.B, rodGroups: null });
      S.stepPlant(pl.sys, 0.02, { heats: r.heats, sgDuty: sr.duty_kW });
      t += 0.02;
    }
    return { power: r.power_pct, tavg_c: G.primaryTavg(pl.sys), tavg_f: degF(G.primaryTavg(pl.sys)),
             sgP: sr.P_sec, duty: sr.duty_kW, fuel: r.T_fuel_c, rho: r.rho_pcm };
  }

  /* ---- THE PLANT IS AT ITS DESIGN POINT BEFORE ANYTHING IS ASKED OF IT ---------------------- */
  head('BASELINE  [if the starting plant is not at its design point, nothing after this means anything]');
  var pl = plant();
  var base = ride(pl, BASE);
  ck('the steam generator is sized for its design duty at the design Tavg',
     G.ratedU() * G.createSG({}).area * (TREF - W.T_sat(G.createSG({}).P)) / 1000, 300, 3, 'MW');
  ckT('the plant holds full power', base.power > 95 && base.power < 105,
      base.power.toFixed(2) + ' %');
  ck('...at a Tavg within a couple of degrees of the first engine', base.tavg_f, A1.tavg_from_f,
     5.0, 'degF');
  ckT('...and at zero net reactivity', Math.abs(base.rho) < 5, base.rho.toFixed(2) + ' pcm');
  ckT('...with the secondary near its nominal pressure',
      Math.abs(base.sgP - G.createSG({}).P) / G.createSG({}).P < 0.05,
      base.sgP.toFixed(3) + ' MPa against a nominal ' + G.createSG({}).P.toFixed(3));

  /* ---- A1 ---------------------------------------------------------------------------------- */
  head('A1 -- POWER FOLLOWS LOAD  [rods in MANUAL: nothing moves them, and nothing sets power]');
  var pl2 = plant();
  ride(pl2, BASE);
  var cut = ride(pl2, AFTER, function () { return 0.575; });
  /* THE CHAIN, LINK BY LINK. Asserting only the endpoint would pass for a plant that got there
   * by some other route, and the point of this gate is the MECHANISM. */
  ckT('cutting steam demand RAISES secondary pressure', cut.sgP > base.sgP * 1.15,
      base.sgP.toFixed(3) + ' -> ' + cut.sgP.toFixed(3) + ' MPa — less steam drawn, so it backs up');
  ckT('...which RAISES primary Tavg', cut.tavg_f > base.tavg_f + 10,
      base.tavg_f.toFixed(2) + ' -> ' + cut.tavg_f.toFixed(2) + ' degF — a hotter sink removes less');
  ckT('...which LOWERS power, with no rod motion at all', cut.power < base.power - 30,
      base.power.toFixed(2) + ' -> ' + cut.power.toFixed(2) + ' % on temperature feedback alone');
  ckT('...and the fuel cools with it, which is the Doppler half of the feedback',
      cut.fuel < base.fuel - 80,
      base.fuel.toFixed(1) + ' -> ' + cut.fuel.toFixed(1) + ' degC');
  ckT('...and the plant is CRITICAL again at the new power', Math.abs(cut.rho) < 15,
      cut.rho.toFixed(2) + ' pcm — it found an equilibrium, it did not merely drift');

  /* THE NUMBERS, against the first engine. Bands admit the declared physics differences. */
  ck('power lands near the demand it was given', cut.power, 57.5, 5.0, '%');
  ck('...and near the first engine A1 endpoint', cut.power, A1.power_to, 5.0, '%');
  ck('Tavg lands near the first engine A1 endpoint', cut.tavg_f, A1.tavg_to_f, 8.0, 'degF');
  ck('the Tavg RISE is the right size', cut.tavg_f - base.tavg_f,
     A1.tavg_to_f - A1.tavg_from_f, 6.0, 'degF');
  ckT('the duty follows the demand', Math.abs(cut.duty / RATED - 0.575) < 0.05,
      (cut.duty / 1000).toFixed(1) + ' MW = ' + (cut.duty / RATED * 100).toFixed(1) + ' % of rated');

  /* ---- REVERSIBILITY ------------------------------------------------------------------------ */
  head('REVERSIBILITY  [a coupling that only works downward is a leak, not a feedback]');
  var pl3 = plant();
  ride(pl3, BASE);
  ride(pl3, AFTER, function () { return 0.575; });
  var restored = ride(pl3, AFTER, function () { return 1.0; });
  ckT('restoring demand brings power back up', restored.power > cut.power + 30,
      cut.power.toFixed(2) + ' -> ' + restored.power.toFixed(2) + ' %');
  ckT('...and Tavg back down', restored.tavg_f < cut.tavg_f - 10,
      cut.tavg_f.toFixed(2) + ' -> ' + restored.tavg_f.toFixed(2) + ' degF');
  ckT('...to near where it started, without anybody resetting anything',
      Math.abs(restored.power - base.power) < 6 && Math.abs(restored.tavg_f - base.tavg_f) < 6,
      'power ' + restored.power.toFixed(2) + ' % vs ' + base.power.toFixed(2) +
      ', Tavg ' + restored.tavg_f.toFixed(2) + ' vs ' + base.tavg_f.toFixed(2) + ' degF');

  /* ---- A5: THE SG IS THE ONLY HEAT SINK ----------------------------------------------------- */
  head('A5 -- THE SG IS THE ONLY HEAT SINK  [take it away and the plant has nowhere to put heat]');
  var pl4 = plant();
  ride(pl4, BASE);
  var starved = ride(pl4, quiet ? 2000 : 4000, function () { return 0.0; });
  ckT('with no steam drawn the secondary pressurises hard', starved.sgP > base.sgP * 1.5,
      base.sgP.toFixed(3) + ' -> ' + starved.sgP.toFixed(3) + ' MPa');
  ckT('...primary temperature climbs', starved.tavg_f > base.tavg_f + 15,
      base.tavg_f.toFixed(2) + ' -> ' + starved.tavg_f.toFixed(2) + ' degF');
  ckT('...and power is driven right down by its own feedback', starved.power < 25,
      starved.power.toFixed(2) + ' % — the plant shuts ITSELF down when the sink is removed, ' +
      'which is the coupling A5 exists to teach');
}

console.log('\nPWR2 ACCEPTANCE -- A1: POWER FOLLOWS LOAD, rods in MANUAL');
var G = loadFrom(SRC), rec = [];
runSuite(G, rec, false);
var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;

var MUTATIONS = [
  ['the SG duty stops following primary temperature (the link from primary to secondary is cut)',
   'var Q = sg.U * sg.area * (primaryT - T_sec);', 'var Q = 300000;'],
  ['the secondary temperature stops tracking its pressure (no back-pressure on the duty)',
   'var T_sec = W.T_sat(sg.P);', 'var T_sec = 272.11;'],
  ['steam draw no longer removes energy (demand cannot be felt)',
   'var dH = Q + feed * SG.h_feed - steam * h_g;', 'var dH = Q + feed * SG.h_feed - steam * SG.h_feed;'],
  ['steam draw no longer removes mass', 'var dM = feed - steam;', 'var dM = 0;'],
  ['the secondary pressure never updates', '    updatePressure(sg);', ''],
  ['the duty is allowed to run backwards into the primary',
   'var Q = sg.U * sg.area * (primaryT - T_sec);',
   'var Q = sg.U * sg.area * (T_sec - primaryT);'],
  /* A GENUINE HALVING, not a thrown error. The first version of this mutation called an undefined
   * helper, so it was "caught" by crashing — which tests nothing about the physics. A mutation
   * that throws is always caught and is therefore worthless as coverage. */
  ['the heat-transfer conductance is halved (the SG is undersized)',
   'return 300000 / (SG.area_m2 * (T_prim - T_sec)); // kW/m2-K',
   'return 150000 / (SG.area_m2 * (T_prim - T_sec)); // kW/m2-K'],
  ['feedwater arrives at steam enthalpy (the secondary cannot be cooled by feed)',
   'var dH = Q + feed * SG.h_feed - steam * h_g;', 'var dH = Q + feed * h_g - steam * h_g;']
];

if (fail > 0) {
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
  else console.log('  caught    ' + m[0].padEnd(74) + f2 + ' red');
});

console.log('\n' + '='.repeat(70));
console.log('  injection self-test: ' + (MUTATIONS.length - blind) + '/' + MUTATIONS.length +
  ' mutations caught' + (blind ? '  ** ' + blind + ' BLIND SPOTS -- GATE FAILS **' : ', no blind spots'));
console.log('  run_pwr2_loadfollow: ' + pass + ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit((fail > 0 || blind > 0) ? 1 : 0);
