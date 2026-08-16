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
 * THE COMPARISON POINT IS THE CURRENT ENGINE AS IT IS TODAY, and which reference applies depends
 * entirely on the LINEUP. That is the lesson of #484, and it cost a retracted claim to learn.
 *
 *   MEASURED 2026-08-16, both plants, 100 -> 60 MWe, rods MANUAL, dump modulating on pressure:
 *
 *                        current engine      PWR2
 *       Tavg                593.0 degF     592.95 degF     <- 0.05 degF
 *       dump position        14.7 %         15.00 %        <- 0.3 points
 *       power                76.8 %         73.74 %        <- 3.1 points
 *       safety valves        shut           shut
 *
 * ⚠ THE PRE-#460 CURRICULUM FIGURE (57.5 %, 602.1 degF) IS RECORDED AND NOT ASSERTED. It was
 * measured with rods in AUTO: the controller walks Tavg back to program, secondary pressure falls,
 * the dump reseats. PWR2 has no rod controller and cannot get there.
 *
 * AN EARLIER VERSION OF THIS GATE DID MATCH IT, TO 0.4 POINTS — and that agreement depended on
 * PWR2 having no SAFETY VALVES. Once pwr2_relief.js modelled them they lift on the pressure
 * excursion and the closed-relief answer moved 57.9 -> 70.7 %. The check was passing for a reason
 * that had nothing to do with the mechanism it claimed to test, which is exactly what HR10 names.
 * D4 section 23 carries the full account.
 *
 * PWR2 is a from-scratch reformulation whose moderator coefficient reads real Layer 0 density
 * (-23.4 pcm/degC against -26.8) and whose fuel rise is derived rather than tuned (379.7 degC
 * against 389, from a gap conductance solved against a sourced Doppler defect). The two are NOT
 * expected to agree exactly, and a check forcing them to would be fitting PWR2 to the plant it was
 * built to replace.
 *
 * ⚠ READ AT t + 150 s, AND THE PLANT IS STILL MOVING THERE. The thermal transient settles in 60 s;
 * xenon runs for hours. 150 s is a DECLARED SAMPLE POINT, not an equilibrium — D4 section 20.6 on
 * why an untimed (power, Tavg) pair under-specifies A1.
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
 'pwr2_kinetics', 'pwr2_fuel', 'pwr2_reactor', 'pwr2_turbine', 'pwr2_relief'].forEach(function (f) { require(path.join(E, f + '.js')); });
var RD = globalThis.RD.pwr2, W = RD.water, S = RD.sources, K = RD.kinetics, R = RD.reactor,
    TB = RD.turbine, RL = RD.relief;

function loadFrom(src) {
  var root = { RD: { pwr2: { water: RD.water, vtable: RD.vtable, core: RD.core,
                             geometry: RD.geometry, loop: RD.loop, sources: RD.sources } } };
  var body = src.replace("(typeof globalThis !== 'undefined' ? globalThis : this)", '(RD_ROOT)') +
             '\nreturn RD_ROOT.RD.pwr2.sg;';
  return new Function('RD_ROOT', body)(root);
}

/* THE CURRENT ENGINE'S A1, RETYPED from CURRICULUM.md — comparison points, not targets. */
/* TWO reference points, and which one applies depends on the LINEUP -- that is the whole lesson
 * of #484 and of section 23 below.
 *   A1_NOW    the current engine MEASURED 2026-08-16, rods MANUAL, dump modulating: the state
 *             this plant is actually in today, and the only one PWR2 can be compared against
 *             without a rod controller.
 *   A1_DOC    CURRICULUM.md's pre-#460 figure, measured with rods in AUTO. Reproducing it needs
 *             rod control to walk Tavg back to program so the dump reseats -- PWR2 has no rod
 *             controller, so it is recorded here and NOT asserted. */
var A1_NOW = { power_to: 76.81, tavg_to_f: 593.00, dump_frac: 0.1475, sgP: 7.067 };
var A1_DOC = { power_to: 57.5, tavg_from_f: 579.3, tavg_to_f: 602.1 };
var A1 = A1_DOC;
/* The current engine's steady-state dump law, RETYPED from pwr_config: proportional across a band
 * above the Ginna 1005 psig no-load pressure. Commanding a dump position is control-layer work by
 * owner ruling and PWR2 has no control layer, so this gate stands in for one -- declared here
 * rather than smuggled into the engine. */
var DUMP_SP = 7.03, DUMP_BAND = 0.25, DUMP_MAX = 0.28;
/* ⚠ THE PROPORTIONAL TERM IS THE FLOW FRACTION, NOT A VALVE POSITION, and getting that backwards
 * cost a published false agreement. pwr_steam_generator.js:210 computes
 *     dump = clip((P - setpoint) / band, 0, 1)      then      dump = min(dump, steam_dump_max)
 * so the proportional output IS the share of RATED STEAM FLOW, and 0.28 CAPS it. The first version
 * here read it as a valve position and multiplied by 0.28 instead -- which is 3.57x shallower below
 * the cap, so the two plants settled at different secondary pressures and then agreed on dump
 * position (15.00 vs 14.75 %) BY COINCIDENCE at those different pressures.
 *
 * pwr2_relief takes a demand as a share of CAPACITY, hence the divide. With this corrected the
 * secondary pressures agree to 0.004 MPa (7.071 vs 7.067) and the power gap halves, 3.1 -> 1.7. */
function dumpLaw(P) {
  var d = (P - DUMP_SP) / DUMP_BAND;
  d = d < 0 ? 0 : (d > 1 ? 1 : d);
  return Math.min(d / DUMP_MAX, 1);
}
var TREF = 304.5, P0 = 15.41, RATED = 300000, MWE_RATED = 100.0, MWE_CUT = 60.0;
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
    var tb  = TB.createTurbine({ load_target_mwe: MWE_RATED });
    var rl  = RL.createRelief({});
    /* SEE THE HEADER: the fuel temperature is REQUIRED here, not optional. */
    var B   = K.criticalBoron(rx.kin, TREF, P0, null, rx.kin.X / rx.kin.X_eq_full, rx.fuel.T_fuel_c);
    return { sys: sys, rx: rx, sg: sg, tb: tb, rl: rl, B: B,
             rated_steam: TB.steamDemand(tb, sg.P, G.SG.h_feed) };
  }
  /* ⚠ THE DEMAND IS IN MEGAWATTS ELECTRICAL, and that is the whole point of this revision.
   *
   * This gate used to cut steam MASS FLOW to a fraction of rated, and compare the result against
   * CURRICULUM.md's A1 — which cuts ELECTRICAL DEMAND. Those are different experiments, and the
   * near-agreement of "57.5 %" with a steam-fraction result was a coincidence of two
   * similar-looking percentages (D4 §20.7, where the quantitative claim was withdrawn). With
   * pwr2_turbine.js the two engines can finally be handed the SAME command. */
  function ride(pl, n, demandOf, dumpLaw) {
    var r = null, sr = null, tr = null, t = 0;
    for (var i = 0; i < n; i++) {
      if (demandOf) pl.tb.load_target_mwe = demandOf(t);
      /* The turbine asks for the flow its load needs AT THE CURRENT SECONDARY PRESSURE; the SG
       * delivers it; the turbine's output is then read off what was actually admitted. */
      var steam = TB.steamDemand(pl.tb, pl.sg.P, G.SG.h_feed);
      /* RELIEF. `dumpLaw` is supplied by the CALLER because commanding a dump position is a
       * control-layer decision by owner ruling, and PWR2 has no control layer yet — so this gate
       * stands in for one, declared rather than smuggled. The law retyped here is the current
       * engine's steady-state form (pwr_config: setpoint 7.03 MPa = Ginna 1005 psig no-load,
       * band 0.25, max 0.28), so the two plants are given the same dump behaviour and not just
       * the same command. */
      var rr = RL.stepRelief(pl.rl, pl.sg.P, 0.02, {
        rated_steam_kgs: pl.rated_steam,
        dump_demand: dumpLaw ? dumpLaw(pl.sg.P) : 0
      });
      var out = steam + rr.total_kgs;
      sr = G.stepSG(pl.sg, G.primaryTavg(pl.sys), 0.02, { feed: out, steam: out });
      tr = TB.stepTurbine(pl.tb, 0.02, { steam_kgs: steam, P_mpa: sr.P_sec, h_feed: G.SG.h_feed });
      r  = R.stepReactor(pl.rx, pl.sys, 0.02, { boron_ppm: pl.B, rodGroups: null });
      S.stepPlant(pl.sys, 0.02, { heats: r.heats, sgDuty: sr.duty_kW });
      t += 0.02;
    }
    return { power: r.power_pct, tavg_c: G.primaryTavg(pl.sys), tavg_f: degF(G.primaryTavg(pl.sys)),
             sgP: sr.P_sec, duty: sr.duty_kW, fuel: r.T_fuel_c, rho: r.rho_pcm,
             mwe: tr.mwe_output, deficit: tr.deficit_mwe, steam: tr.steam_kgs,
             dumpFrac: rr.dump_kgs / pl.rated_steam, safetyOpen: rr.safety_open };
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
  ride(pl2, BASE, null, dumpLaw);
  var cut = ride(pl2, AFTER, function () { return MWE_CUT; }, dumpLaw);
  /* THE CHAIN, LINK BY LINK. Asserting only the endpoint would pass for a plant that got there
   * by some other route, and the point of this gate is the MECHANISM. */
  ckT('cutting steam demand RAISES secondary pressure', cut.sgP > base.sgP * 1.15,
      base.sgP.toFixed(3) + ' -> ' + cut.sgP.toFixed(3) + ' MPa — less steam drawn, so it backs up');
  ckT('...which RAISES primary Tavg', cut.tavg_f > base.tavg_f + 10,
      base.tavg_f.toFixed(2) + ' -> ' + cut.tavg_f.toFixed(2) + ' degF — a hotter sink removes less');
  ckT('...which LOWERS power, with no rod motion at all', cut.power < base.power - 20,
      base.power.toFixed(2) + ' -> ' + cut.power.toFixed(2) + ' % on temperature feedback alone');
  ckT('...and the fuel cools with it, which is the Doppler half of the feedback',
      cut.fuel < base.fuel - 80,
      base.fuel.toFixed(1) + ' -> ' + cut.fuel.toFixed(1) + ' degC');
  ckT('...and the plant is CRITICAL again at the new power', Math.abs(cut.rho) < 15,
      cut.rho.toFixed(2) + ' pcm — it found an equilibrium, it did not merely drift');

  /* THE NUMBERS, against the first engine. Bands admit the declared physics differences. */
  /* ---- AGAINST THE CURRENT ENGINE AS IT IS TODAY. Rods MANUAL, dump modulating on pressure,
   * safeties shut. This is the only A1 state PWR2 can be compared against without a rod
   * controller, and it is the state the plant is actually in. */
  ck('Tavg lands where the current engine lands', cut.tavg_f, A1_NOW.tavg_to_f, 2.0, 'degF');
  ck('the dump settles where the current engine settles', cut.dumpFrac, A1_NOW.dump_frac,
     0.02, 'frac');
  ck('power lands near the current engine', cut.power, A1_NOW.power_to, 4.0, '%');
  ckT('the safety valves stay SHUT, as they do on the current engine', cut.safetyOpen === false,
      'a dump doing its job keeps the secondary off the safeties — if they lift, the dump is ' +
      'either undersized or not being commanded');
  /* ---- ⚠ THE PRE-#460 CURRICULUM FIGURE IS NOT ASSERTED, AND THE REASON IS THE POINT.
   *
   * It records 57.5 % / 602.1 degF, measured when the shipped lineup had rods in AUTO: the
   * controller walks Tavg back to program, secondary pressure falls, and the dump reseats. PWR2
   * has NO ROD CONTROLLER, so it cannot get there.
   *
   * An earlier version of this gate DID match it, to 0.4 points — and that agreement turned out
   * to depend on PWR2 having no SAFETY VALVES either. Once pwr2_relief.js modelled them they lift
   * on the pressure excursion and the closed-relief answer moved 57.9 -> 70.7 %. The agreement was
   * an artifact of a missing model, which is exactly the failure HR10 names: a check can pass for
   * a reason that has nothing to do with the mechanism it claims to test. Recorded in D4 §23. */
  ckT('...and the plant is NOWHERE NEAR the pre-#460 figure, which needs rod control',
      Math.abs(cut.power - A1_DOC.power_to) > 8,
      'measured ' + cut.power.toFixed(2) + ' % against the pre-#460 ' + A1_DOC.power_to +
      ' % — asserting that number here would be asserting the absence of a rod controller');
  /* ⚠ THE DUTY IS NOT THE ELECTRICAL DEMAND, and this check used to assert it was. With a relief
   * path open the steam generator is unloading to the TURBINE AND THE DUMP, so its duty is the
   * sum. That is the whole mechanism behind #484's 76.8 % — the reactor matches total steam out,
   * not the load. What must still hold is that the TURBINE's share follows the demand. */
  ckT('turbine steam follows the ELECTRICAL demand, and the duty is turbine PLUS relief',
      Math.abs(cut.mwe - MWE_CUT) < 0.5 &&
      cut.duty / RATED > MWE_CUT / MWE_RATED + 0.05,
      'turbine ' + cut.mwe.toFixed(1) + ' MWe of a ' + MWE_CUT + ' MWe ask, while SG duty is ' +
      (cut.duty / 1000).toFixed(1) + ' MW = ' + (cut.duty / RATED * 100).toFixed(1) +
      ' % of rated — the difference is the dump at ' + (cut.dumpFrac * 100).toFixed(1) + ' %');

  /* ---- REVERSIBILITY ------------------------------------------------------------------------ */
  head('REVERSIBILITY  [a coupling that only works downward is a leak, not a feedback]');
  var pl3 = plant();
  ride(pl3, BASE);
  ride(pl3, AFTER, function () { return MWE_CUT; });
  var restored = ride(pl3, AFTER, function () { return MWE_RATED; });
  ckT('restoring demand brings power back up', restored.power > cut.power + 20,
      cut.power.toFixed(2) + ' -> ' + restored.power.toFixed(2) + ' %');
  ckT('...and Tavg back down', restored.tavg_f < cut.tavg_f - 10,
      cut.tavg_f.toFixed(2) + ' -> ' + restored.tavg_f.toFixed(2) + ' degF');
  ckT('...to near where it started, without anybody resetting anything',
      Math.abs(restored.power - base.power) < 6 && Math.abs(restored.tavg_f - base.tavg_f) < 6,
      'power ' + restored.power.toFixed(2) + ' % vs ' + base.power.toFixed(2) +
      ', Tavg ' + restored.tavg_f.toFixed(2) + ' vs ' + base.tavg_f.toFixed(2) + ' degF');

  /* ---- SECONDARY INVENTORY -----------------------------------------------------------------
   * ⚠ ADDED BECAUSE A MUTATION WENT VACUOUS. The ride always sets feed = steam, so `dM = feed -
   * steam` is identically ZERO in every case above — and a mutation replacing it with 0 therefore
   * changed nothing and reported as caught by nobody. The injection self-test found it; no amount
   * of reading the ride would have.
   *
   * A balanced harness cannot test an imbalance. So this exercises the term directly, which is
   * also the physics behind boil-dry: steam out with no feed in is what empties a steam generator. */
  head('SECONDARY INVENTORY  [a balanced ride cannot test an imbalance]');
  var sgI = G.createSG({});
  var m0 = sgI.mass;
  G.stepSG(sgI, TREF, 10, { feed: 0, steam: 50 });
  ckT('drawing steam with no feed REMOVES inventory', sgI.mass < m0 - 400,
      m0.toFixed(0) + ' -> ' + sgI.mass.toFixed(0) + ' kg after 10 s at 50 kg/s out');
  var sgJ = G.createSG({});
  var m1 = sgJ.mass;
  G.stepSG(sgJ, TREF, 10, { feed: 50, steam: 0 });
  ckT('...and feeding with no draw ADDS it', sgJ.mass > m1 + 400,
      m1.toFixed(0) + ' -> ' + sgJ.mass.toFixed(0) + ' kg');
  var sgK = G.createSG({});
  var m2 = sgK.mass;
  G.stepSG(sgK, TREF, 10, { feed: 50, steam: 50 });
  ckT('...and a BALANCED flow leaves it unchanged, which is why the ride above could not see this',
      Math.abs(sgK.mass - m2) < 1e-9,
      'exactly the case every A1 ride runs, and exactly why the mutation was invisible');

  /* ---- A5: THE SG IS THE ONLY HEAT SINK ----------------------------------------------------- */
  head('A5 -- THE SG IS THE ONLY HEAT SINK  [take it away and the plant has nowhere to put heat]');
  var pl4 = plant();
  ride(pl4, BASE);
  var starved = ride(pl4, quiet ? 2000 : 4000, function () { return 0.0; });
  /* ⚠ A5 CHANGED MEANING WHEN RELIEF WAS MODELLED, and the new meaning is the prototypical one.
   * This check asked for pressure to run away (>1.5x nominal). It cannot now: the safety valves
   * lift at 1085 psig and CAP it, which is what they are for. A plant whose secondary ran away
   * past its safeties would be the defect. So A5 becomes "remove the turbine sink and the plant
   * climbs the relief ladder until the safeties carry it" — which is a better demonstration than
   * an unbounded pressure rise, and it is the coupling the ladder exists to teach. */
  ckT('with no steam drawn the secondary pressurises onto the SAFETY VALVES',
      starved.sgP > base.sgP * 1.25 && starved.safetyOpen === true,
      base.sgP.toFixed(3) + ' -> ' + starved.sgP.toFixed(3) + ' MPa, safeties LIFTED');
  ckT('...and the safeties CAP it rather than letting it run away',
      starved.sgP < 8.0,
      'capped at ' + starved.sgP.toFixed(3) + ' MPa — a secondary that ran past its own safeties ' +
      'would be the defect, not the demonstration');
  ckT('...primary temperature climbs', starved.tavg_f > base.tavg_f + 15,
      base.tavg_f.toFixed(2) + ' -> ' + starved.tavg_f.toFixed(2) + ' degF');
  ckT('...and the reactor now matches the SAFETIES, having lost the turbine',
      starved.power > 40 && starved.power < 90,
      starved.power.toFixed(2) + ' % — with the turbine shut the safety valves are the heat sink, ' +
      'and the core matches whatever leaves the SG. A real plant SCRAMS here (the source: ' +
      '"complete loss of load, when operating above 50%, will cause a reactor trip"); PWR2 has no ' +
      'protection layer, so it rides it out on relief. Declared gap, not a passing grade.');
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
