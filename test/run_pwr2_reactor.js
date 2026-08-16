/* run_pwr2_reactor.js — Layer 5 gate: kinetics and fuel, COUPLED. (#479)
 *
 * THE CLAIM THIS FILE MAKES IS THAT THE LOOP IS CLOSED — that temperature can move power without
 * anybody typing a number. Every other pwr2 gate can be satisfied by a component that is correct in
 * isolation; this one cannot, because the thing under test is the connection.
 *
 * So the checks are built as SELF-REGULATION tests rather than value comparisons:
 *
 *   1. THE PLANT MUST HOLD. A critical reactor with a matched heat sink stays at power and returns
 *      to zero net reactivity. A loop with a sign error passes a one-step check and diverges here.
 *   2. FEEDBACK MUST BE NEGATIVE, IN BOTH DIRECTIONS. Raise the sink and power must RISE to meet
 *      it; cut it and power must FALL. One direction alone is satisfied by a monotone drift.
 *   3. POWER MUST TRACK THE SINK, not merely move the right way. The reactor is not being told what
 *      power to make — it finds it. That is the A1 coupling in its simplest form.
 *   4. THE HEAT PATH MUST NOT DOUBLE-COUNT, and this is the trap the file exists around: Layer 4
 *      merges `heats` and `corePower` ADDITIVELY, so feeding both is silently survivable — the
 *      plant just settles hotter and still balances.
 *
 * ⚠ WHAT THIS GATE DOES NOT PROVE. It imposes the steam-generator duty as a NUMBER. That is the
 * right boundary condition for testing the reactivity loop in isolation, and it is the WRONG one
 * for the A1 load-follow coupling, where the temperature rise is the mechanism rather than a
 * consequence: a real load drop raises SG pressure, which raises primary temperature, which is what
 * pushes power down. With the duty imposed directly the SG is bypassed and the coolant temperature
 * barely moves — MEASURED, 0.28 degC across a 20 % power swing. A1 needs pwr2_sg in the loop and is
 * recorded as owed, not claimed here.
 *
 * Run: node test/run_pwr2_reactor.js
 */
'use strict';
var fs = require('fs'), path = require('path');
var E = path.join(__dirname, '..', 'engines', 'pwr2');
var LIB = path.join(E, 'pwr2_reactor.js');
var SRC = fs.readFileSync(LIB, 'utf8').replace(/\r\n/g, '\n');
['pwr2_water', 'pwr2_vtable', 'pwr2_geometry', 'pwr2_core', 'pwr2_loop', 'pwr2_sources',
 'pwr2_kinetics', 'pwr2_fuel'].forEach(function (f) { require(path.join(E, f + '.js')); });
var RD = globalThis.RD.pwr2, W = RD.water, S = RD.sources, K = RD.kinetics, F = RD.fuel;

function loadFrom(src) {
  var root = { RD: { pwr2: { water: RD.water, vtable: RD.vtable, core: RD.core,
                             geometry: RD.geometry, loop: RD.loop, sources: RD.sources,
                             kinetics: RD.kinetics, fuel: RD.fuel } } };
  var body = src.replace("(typeof globalThis !== 'undefined' ? globalThis : this)", '(RD_ROOT)') +
             '\nreturn RD_ROOT.RD.pwr2.reactor;';
  return new Function('RD_ROOT', body)(root);
}

var RATED = 300000, TREF = 304.5, P0 = 15.41;

function runSuite(R, rec, quiet) {
  function ck(name, got, want, tol, unit) {
    var d = Math.abs(got - want), ok = d <= tol && isFinite(got);
    rec.push({ name: name, ok: ok });
    if (!quiet) console.log((ok ? '  PASS  ' : '  FAIL  ') + name.padEnd(56) +
      'got ' + got.toFixed(3) + ' want ' + want.toFixed(3) + ' (tol ' + tol + ') ' + (unit || ''));
  }
  function ckT(name, cond, note) {
    rec.push({ name: name, ok: !!cond });
    if (!quiet) console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (note ? '  -- ' + note : ''));
  }
  function head(s) { if (!quiet) console.log('\n' + s); }

  /* COST ASYMMETRY (D1 §31), budgeted as each check was written. A full ride is 15 000 steps of a
   * plant with the conservation core underneath; the mutation replay runs that per mutation. Every
   * mutation here shows itself within a few seconds of plant — a double-counted heat path, a lost
   * decay fraction, a wrong node — so the replay horizon is short and only the SETTLING claims get
   * the long one. MEASURED: 4 s clean, ~40 s for the replay. */
  var SETTLE = quiet ? 1500 : 15000;      /* 30 s vs 300 s */
  var STEP   = quiet ? 1500 : 6000;       /* 30 s vs 120 s */

  /* A reactor critical AT ITS OWN CONDITION. rho_excess puts the plant critical at the HZP anchor
   * with zero xenon; at rated power with equilibrium xenon present the boron must be trimmed, and
   * doing that here rather than assuming it is what keeps the fixture a PLANT rather than a
   * shutdown reactor being measured for dynamics it cannot show. */
  function fixture(opts) {
    opts = opts || {};
    var sys = S.createPlant({ h: W.h_l(TREF, P0), P: P0 });
    var rx  = R.createReactor({ P: opts.P === undefined ? 1.0 : opts.P, coolTemp_c: TREF });
    var B   = K.criticalBoron(rx.kin, TREF, P0, null, rx.kin.X / rx.kin.X_eq_full);
    return { sys: sys, rx: rx, B: B };
  }
  function ride(f, n, dutyOf, rods) {
    var last = null, t = 0;
    for (var i = 0; i < n; i++) {
      last = R.stepReactor(f.rx, f.sys, 0.02, { boron_ppm: f.B, rodGroups: rods || null });
      S.stepPlant(f.sys, 0.02, { heats: last.heats, sgDuty: dutyOf ? dutyOf(t) : RATED });
      t += 0.02;
    }
    return last;
  }

  /* ---- CONSTRUCTION, WRITTEN FIRST (D1 §31) ---------------------------------------------- */
  head('CONSTRUCTION  [a caller argument that never arrives is invisible to a physics check]');
  ck('caller initial power reaches the kinetics it builds',
     R.createReactor({ P: 0.25 }).kin.P, 0.25, 1e-12, '');
  ck('caller rated power reaches the reactor',
     R.createReactor({ rated_thermal_kW: 4242 }).rated_thermal_kW, 4242, 1e-12, 'kW');
  ckT('caller coolant temperature reaches the fuel it settles',
      Math.abs(R.createReactor({ coolTemp_c: 200 }).fuel.T_fuel_c -
               R.createReactor({ coolTemp_c: 300 }).fuel.T_fuel_c) > 50,
      'the fuel is settled AGAINST that coolant, so the two must differ');
  /* THE INITIAL CONDITION IS A SOLVE, NOT A GUESS. A reactor created at rated power with fuel at
   * some default temperature spends ~15 s dumping the difference into the coolant, which reads as
   * a physics defect and is purely an IC error. */
  ckT('fuel is initialised ON its steady solve, so the plant does not lurch at t=0',
      Math.abs(R.createReactor({ P: 1.0, coolTemp_c: TREF }).fuel.T_fuel_c -
               F.steadyFuelTemp(F.deriveGeometry(), RATED, TREF)) < 0.5,
      'created at ' + R.createReactor({ P: 1.0, coolTemp_c: TREF }).fuel.T_fuel_c.toFixed(1) +
      ' degC against a solve of ' + F.steadyFuelTemp(F.deriveGeometry(), RATED, TREF).toFixed(1));
  ckT('...and a reactor built at PART power settles its fuel lower',
      R.createReactor({ P: 0.5, coolTemp_c: TREF }).fuel.T_fuel_c <
      R.createReactor({ P: 1.0, coolTemp_c: TREF }).fuel.T_fuel_c - 100,
      'the IC follows the power it is built at, not a fixed number');

  /* ---- THE LOOP HOLDS --------------------------------------------------------------------- */
  head('THE LOOP HOLDS  [a sign error passes one step and diverges over three hundred seconds]');
  var hold = ride(fixture(), SETTLE);
  ckT('a critical reactor with a matched sink stays at power',
      hold.power_pct > 95 && hold.power_pct < 105,
      hold.power_pct.toFixed(2) + ' % after ' + (SETTLE * 0.02) + ' s');
  ckT('...and settles at ZERO net reactivity, which is what critical MEANS',
      Math.abs(hold.rho_pcm) < 5, hold.rho_pcm.toFixed(2) + ' pcm');
  ckT('...with the fuel hot and the coolant near its reference',
      hold.T_fuel_c > 500 && hold.T_fuel_c < 650 && Math.abs(hold.coolTemp_c - TREF) < 5,
      'fuel ' + hold.T_fuel_c.toFixed(1) + ' degC, coolant ' + hold.coolTemp_c.toFixed(2));
  ckT('nothing in the ride is NaN — the coupling does not lose a value',
      isFinite(hold.power_pct) && isFinite(hold.T_fuel_c) && isFinite(hold.rho_pcm) &&
      isFinite(hold.heats.core), '');

  /* ---- FEEDBACK IS NEGATIVE, BOTH WAYS ---------------------------------------------------- */
  head('SELF-REGULATION  [both directions: one alone is satisfied by a monotone drift]');
  var up   = ride(fixture(), STEP, function (t) { return t < 20 ? RATED : RATED * 1.10; });
  var down = ride(fixture(), STEP, function (t) { return t < 20 ? RATED : RATED * 0.90; });
  ckT('raising the heat sink RAISES power', up.power_pct > 104,
      up.power_pct.toFixed(2) + ' % against a +10 % sink — the plant cools, reactivity goes up');
  ckT('cutting the heat sink LOWERS power', down.power_pct < 96,
      down.power_pct.toFixed(2) + ' % against a -10 % sink');
  /* NOT MERELY THE RIGHT DIRECTION — THE RIGHT SIZE. Nobody told the reactor what power to make. */
  ck('power TRACKS the raised sink rather than merely drifting up',
     up.core_heat_pct, 110, 2.0, '%');
  ck('power TRACKS the cut sink', down.core_heat_pct, 90, 2.0, '%');
  ckT('the fuel temperature moves WITH power, which is the Doppler lever arm',
      up.T_fuel_c > hold.T_fuel_c + 15 && down.T_fuel_c < hold.T_fuel_c - 15,
      up.T_fuel_c.toFixed(1) + ' / ' + hold.T_fuel_c.toFixed(1) + ' / ' +
      down.T_fuel_c.toFixed(1) + ' degC at +10 / 0 / -10 %');
  ckT('both excursions return to CRITICAL, not to some other reactivity',
      Math.abs(up.rho_pcm) < 15 && Math.abs(down.rho_pcm) < 15,
      'a self-regulating plant ends at rho = 0 whatever power it found; got ' +
      up.rho_pcm.toFixed(1) + ' and ' + down.rho_pcm.toFixed(1) + ' pcm');

  /* ---- THE HEAT PATH ---------------------------------------------------------------------- */
  head('HEAT PATH  [Layer 4 merges heats and corePower ADDITIVELY -- double-counting survives]');
  ckT('the reactor returns a heats map and NOT a corePower',
      hold.heats && typeof hold.heats.core === 'number' && hold.corePower === undefined,
      'supplying both would double the core power and merely settle hotter — silently');
  /* TOLERANCE 10 kW = 3e-5 of rating. MEASURED, the residual here is 2.4 kW and it is the fuel
   * storing or releasing energy as power drifts on the slow xenon timescale — the plant is at
   * rho = 0.03 pcm but not frozen. A 1 kW tolerance failed on that, which is a test asking for
   * exactness from a quantity that is still physically moving. The mutation this check exists for
   * — corePower supplied alongside heats — misses by ~300 000 kW. */
  ck('at steady state the heat delivered equals the heat generated',
     hold.heats.core, hold.Q_core_kW, 10.0, 'kW');
  ckT('the delivered heat is plant-sized, not a fraction or a duplicate',
      hold.heats.core > 0.9 * RATED && hold.heats.core < 1.15 * RATED,
      hold.heats.core.toFixed(0) + ' kW against a ' + RATED + ' kW rating');

  /* ---- THE SPLIT --------------------------------------------------------------------------- */
  head('FISSION vs TOTAL  [equal at steady state, APART the moment the rods drop]');
  ck('fission and total heat agree at steady state', hold.power_pct, hold.core_heat_pct, 0.5, '%');
  /* ⚠ `steps` IS STEPS WITHDRAWN, and the first version of this fixture had it backwards.
   * rodReactivity computes `withdrawn = steps/max_steps` and takes scruve(1 - withdrawn), so
   * 228 steps is ALL RODS OUT and worth ZERO, while 0 steps is fully inserted at -4068 pcm.
   * Driving "the scram" to 228 inserted nothing, and three checks reported that the reactor
   * ignored a scram when what they had actually measured was a fully withdrawn bank behaving
   * correctly. Read the convention at the site rather than assuming the intuitive direction. */
  var rods = [{ steps: 228, max_steps: 228, worth: 0.04068 }];   /* start ALL OUT */
  var f2 = fixture();
  ride(f2, 200, null, rods);                        /* settle briefly, rods out */
  rods[0].steps = 0;                                /* SCRAM: fully inserted */
  /* ⚠ A SHORT WINDOW, AND THE REASON IS A REAL COUPLING RATHER THAN A TEST CONVENIENCE.
   *
   * The first version rode 60 s after the rod drop with the heat sink still at RATED, and the
   * checks failed reporting the reactor had ignored the scram: fission back at 100 %, rho at
   * +15 pcm. It had not ignored it. Removing 300 MW from a plant that has stopped making 300 MW
   * cools it hard, and at -23.4 pcm/degC the moderator hands back positive reactivity faster than
   * the bank holds it down — 4068 pcm of rod worth is only 174 degC of cooling. THE PLANT
   * GENUINELY RETURNS TO CRITICAL, which is exactly why a real scram trips the turbine and is a
   * coupling worth being able to show rather than a defect to tune away.
   *
   * So the prompt behaviour is measured in the 10 s where it lives, and the recovery is asserted
   * separately below as the finding it is. */
  /* THREE SAMPLE POINTS, because the three claims live on three different timescales and reading
   * them all at one horizon is what made the first two versions fail. The recovery is FAST — the
   * bank is already down to -991 pcm by 10 s — so "the rods inserted" has to be read while they
   * are still holding, not after the moderator has taken most of it back. */
  var scrEarly = ride(f2, 50, null, rods);          /* 1 s — the insertion itself */
  var scr = ride(f2, quiet ? 250 : 450, null, rods);
  ckT('a scram makes fission and total DIVERGE, where steady state had them equal',
      scr.core_heat_pct - scr.power_pct > 3,
      'fission ' + scr.power_pct.toFixed(3) + ' % against total ' + scr.core_heat_pct.toFixed(3) +
      ' % — the difference is the decay tail, and a model reporting one number cannot show it');
  ckT('...and the decay tail is the reason', scr.decay_pct > 2 && scr.decay_pct < 8,
      scr.decay_pct.toFixed(2) + ' % decay heat');
  ckT('...and the fuel COOLS toward the decay-heat rise', scr.T_fuel_c < hold.T_fuel_c - 150,
      scr.T_fuel_c.toFixed(1) + ' degC against ' + hold.T_fuel_c.toFixed(1) + ' at power');
  ckT('rod insertion drives reactivity strongly negative', scrEarly.rho_pcm < -3000,
      scrEarly.rho_pcm.toFixed(0) + ' pcm one second after the drop, against a 4068 pcm bank');
  /* THE RECOVERY, asserted rather than avoided. Keep removing rated heat from a scrammed plant and
   * the cooling walks reactivity back up through the bank. This is the moderator coefficient doing
   * what it is for, and a plant that could NOT do it would have a feedback sign error. */
  var scrLong = ride(f2, quiet ? 1500 : 4000, null, rods);
  ckT('...and holding a RATED sink on a scrammed plant walks it back toward critical',
      scrLong.rho_pcm > scrEarly.rho_pcm + 2000 && scrLong.coolTemp_c < scr.coolTemp_c,
      'rho ' + scrEarly.rho_pcm.toFixed(0) + ' -> ' + scrLong.rho_pcm.toFixed(0) + ' pcm as the coolant ' +
      'falls ' + scr.coolTemp_c.toFixed(1) + ' -> ' + scrLong.coolTemp_c.toFixed(1) +
      ' degC — 4068 pcm of bank is only ~174 degC of cooling, which is why a scram trips the turbine');

  /* ---- THE LAYERS BELOW NO LONGER THROW ---------------------------------------------------- */
  head('THE CONNECTION  [both lower layers refuse to invent these; supplying them is the job]');
  ckT('kinetics is given a fuel temperature it did not have to invent', (function () {
        try { K.stepKinetics(K.createKinetics({}), S.createPlant({ h: W.h_l(TREF, P0), P: P0 }),
                             0.02, {}); return false; }
        catch (e) { return /fuelTemp_c/.test(e.message); }
      })(), 'it still throws when called bare — the reactor is what stops that happening');
  ckT('fuel is given a core power it did not have to invent', (function () {
        try { F.stepFuel(F.createFuel({}), 0.02, { coolTemp_c: TREF }); return false; }
        catch (e) { return /Q_core_kW/.test(e.message); }
      })(), '');
  ckT('the reactor reads the CORE node, not whichever node comes first',
      Math.abs(R.coreTemp(S.createPlant({ h: W.h_l(TREF, P0), P: P0 })) - TREF) < 2,
      'got ' + R.coreTemp(S.createPlant({ h: W.h_l(TREF, P0), P: P0 })).toFixed(2) + ' degC');
}

console.log('\nPWR2 Layer 5 -- REACTOR: the reactivity loop, closed');
var R = loadFrom(SRC), rec = [];
runSuite(R, rec, false);
var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;

var MUTATIONS = [
  ['the heat path DOUBLE-COUNTS (corePower supplied alongside heats)',
   '      heats:          fr.heats,', '      heats: fr.heats, corePower: kr.Q_total_frac * rx.rated_thermal_kW,'],
  ['the decay fraction is lost — fuel driven by FISSION power instead of total core heat',
   '      Q_core_kW:  kr.Q_total_frac * rx.rated_thermal_kW,',
   '      Q_core_kW:  kr.power * rx.rated_thermal_kW,'],
  ['Doppler stops seeing the fuel (a constant temperature — the loop is cut)',
   '      fuelTemp_c: rx.fuel.T_fuel_c,', '      fuelTemp_c: 581.8,'],
  ['the coolant temperature handed to fuel is a constant (fuel cannot feel the plant)',
   '      coolTemp_c: cool', '      coolTemp_c: 304.5'],
  ['the reactor reads the wrong node for coolant temperature',
   "      if (sys.nodes[i].id === 'core') return W.T_from_h(sys.nodes[i].h, sys.P);",
   "      if (sys.nodes[i].id === 'hot_leg') return W.T_from_h(sys.nodes[i].h, sys.P);"],
  ['fuel is NOT initialised on its steady solve (a 15 s lurch at t=0 that looks like physics)',
   '                               T_fuel_c: F.steadyFuelTemp(geom, rated * kin.P, cool) });',
   '                               T_fuel_c: 693 });'],
  ['the initial fuel solve ignores the power it is built at',
   'F.steadyFuelTemp(geom, rated * kin.P, cool)', 'F.steadyFuelTemp(geom, rated, cool)'],
  ['boron never reaches kinetics (the operator control is inert)',
   '      boron_ppm:  drivers.boron_ppm,', '      boron_ppm:  0,'],
  ['rods never reach kinetics (a scram does nothing)',
   '      rodGroups:  drivers.rodGroups,', '      rodGroups:  null,'],
  ['the reported split collapses — fission reported as total',
   '      core_heat_pct:  kr.Q_total_frac * 100,', '      core_heat_pct:  kr.power * 100,'],
  ['the rating is wrong, so every power is scaled',
   '  var RATED_THERMAL_KW = 300000;', '  var RATED_THERMAL_KW = 400000;'],
  /* CONSTRUCTION */
  ['caller rated power ignored at construction',
   '    var rated = opts.rated_thermal_kW === undefined ? RATED_THERMAL_KW : opts.rated_thermal_kW;',
   '    var rated = RATED_THERMAL_KW;'],
  ['caller coolant temperature ignored at construction',
   '    var cool  = opts.coolTemp_c === undefined ? kin.T_mod_ref_c : opts.coolTemp_c;',
   '    var cool  = kin.T_mod_ref_c;'],
  ['caller options never reach the kinetics it builds',
   '    var kin   = K.createKinetics(opts);', '    var kin   = K.createKinetics({});']
];

/* ---- THE CLEAN-RUN GUARD --------------------------------------------------------------
 * A MUTATION SELF-TEST IS ONLY MEANINGFUL IF THE UNMUTATED SUITE IS GREEN. If any check fails in
 * the clean run it fails in every mutant too, so `f2 > 0` holds unconditionally and EVERY mutation
 * is reported as caught. Coverage then reads 14/14 while the suite is measuring nothing. */
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
  else console.log('  caught    ' + m[0].padEnd(72) + f2 + ' red');
});

console.log('\n' + '='.repeat(70));
console.log('  injection self-test: ' + (MUTATIONS.length - blind) + '/' + MUTATIONS.length +
  ' mutations caught' + (blind ? '  ** ' + blind + ' BLIND SPOTS -- GATE FAILS **' : ', no blind spots'));
console.log('  run_pwr2_reactor: ' + pass + ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit((fail > 0 || blind > 0) ? 1 : 0);
