/* run_pwr2_turbine.js — Layer 5 gate: the turbine and generator. (#479)
 *
 * WHAT IS ACTUALLY AT RISK HERE, because it is not what a turbine gate would normally guard.
 *
 * There is exactly ONE free number in this file — `eta_cycle` — and it is not free: it is
 * `mwe_rated / mwt_rated`, the plant's own ruled identity, computed rather than stored. So the
 * gate's job is not to pin a constant. It is to pin the THREE CONSISTENCY RELATIONS that make the
 * turbine agree with the rest of the plant, each of which can break silently:
 *
 *   1. THE DEMAND AND THE OUTPUT MUST INVERT EACH OTHER. `steamDemand` asks for the flow that will
 *      produce a load; `stepTurbine` converts a flow into a load. If they use different enthalpies
 *      the turbine asks for steam that does not deliver what it asked for, and the error is a few
 *      percent — small enough to read as physics.
 *   2. THE TURBINE AND THE STEAM GENERATOR MUST AGREE ON RATED FLOW. They compute it by different
 *      routes: the SG from 300 MWt / (h_g - h_feed), the turbine from 100 MWe / (eta * (h_g -
 *      h_feed)). Those are the same number ONLY IF eta is the plant's true efficiency. This is
 *      checked across modules for the same reason the kinetics gate loads pwr2_fuel.
 *   3. OUTPUT MUST FOLLOW THE STEAM ADMITTED, NOT THE LOAD DEMANDED. The current engine's #284 is
 *      the record of what the other choice costs: a load rejection showed full electrical output
 *      while the dump vented the difference — the operator asked for 50 MWe and the gauge read 99.
 *
 * ⚠ AND ONE THING THIS GATE CANNOT DO. `eta_cycle` is corroborated by Ginna UFSAR ch10 Table
 * 10.1-1 (32.96 % guaranteed, 34.53 % verified) but is DERIVED from this plant's ruled rating, so
 * no check written here can falsify the rating itself. What the checks below can do is prove the
 * efficiency is the ratio it claims to be and not a number typed in beside it.
 *
 * Run: node test/run_pwr2_turbine.js
 */
'use strict';
var fs = require('fs'), path = require('path');
var E = path.join(__dirname, '..', 'engines', 'pwr2');
var LIB = path.join(E, 'pwr2_turbine.js');
var SRC = fs.readFileSync(LIB, 'utf8').replace(/\r\n/g, '\n');
['pwr2_water', 'pwr2_vtable', 'pwr2_geometry', 'pwr2_core', 'pwr2_loop',
 'pwr2_sources', 'pwr2_sg'].forEach(function (f) { require(path.join(E, f + '.js')); });
/* pwr2_sg is loaded ONLY for the cross-module rated-flow check — relation 2 above. */
var RD = globalThis.RD.pwr2, W = RD.water, G = RD.sg;

function loadFrom(src) {
  var root = { RD: { pwr2: { water: RD.water, vtable: RD.vtable } } };
  var body = src.replace("(typeof globalThis !== 'undefined' ? globalThis : this)", '(RD_ROOT)') +
             '\nreturn RD_ROOT.RD.pwr2.turbine;';
  return new Function('RD_ROOT', body)(root);
}

/* THE SOURCE, RETYPED INDEPENDENTLY of the engine's copy — the ECCS discipline.
 * Ginna UFSAR ch10 (ML20339A040) Table 10.1-1 and §10.1.2.1. */
var DOC = {
  rpm: 1800,
  guaranteed_kW: 585000, guaranteed_mwt: 1775,      /* -> 32.96 % */
  verified_kW: 612855,                              /* -> 34.53 % */
  min_load_pct: 12.8, max_load_pct: 100.0, step_pct: 10.0, ramp_pct_per_min: 5.0
};
var MWE_RATED = 100.0, MWT_RATED = 300.0, P_NOM = 5.688;

function runSuite(T, rec, quiet) {
  function ck(name, got, want, tol, unit) {
    var d = Math.abs(got - want), ok = d <= tol && isFinite(got);
    rec.push({ name: name, ok: ok });
    if (!quiet) console.log((ok ? '  PASS  ' : '  FAIL  ') + name.padEnd(58) +
      'got ' + got.toFixed(4) + ' want ' + want.toFixed(4) + ' (tol ' + tol + ') ' + (unit || ''));
  }
  function ckT(name, cond, note) {
    rec.push({ name: name, ok: !!cond });
    if (!quiet) console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (note ? '  -- ' + note : ''));
  }
  function head(s) { if (!quiet) console.log('\n' + s); }
  var HF = G.SG.h_feed;

  /* ---- CONSTRUCTION, WRITTEN FIRST (D1 §31) ---------------------------------------------- */
  head('CONSTRUCTION  [a caller argument that never arrives is invisible to a physics check]');
  ck('caller load target reaches the turbine',
     T.createTurbine({ load_target_mwe: 42 }).load_target_mwe, 42, 1e-12, 'MWe');
  ckT('caller trip state reaches the turbine', T.createTurbine({ tripped: true }).tripped === true, '');
  ck('caller rating reaches the turbine', T.createTurbine({ mwe_rated: 250 }).mwe_rated, 250,
     1e-12, 'MWe');
  ck('caller generated total reaches the turbine',
     T.createTurbine({ generated_kJ: 777 }).generated_kJ, 777, 1e-12, 'kJ');
  ckT('the default lineup is AT RATED, not tripped and not at zero',
      T.createTurbine({}).load_target_mwe === MWE_RATED && T.createTurbine({}).tripped === false,
      'a default of tripped would make every probe that omits it measure a dead machine');

  /* ---- THE EFFICIENCY IS A RATIO, NOT A NUMBER -------------------------------------------- */
  head('EFFICIENCY  [one free number, and it is not free -- it is the plant identity]');
  ck('eta_cycle is exactly the rating ratio', T.etaCycle(), MWE_RATED / MWT_RATED, 1e-15, '');
  ckT('...and that is a THIRD, not a fitted decimal',
      Math.abs(T.etaCycle() - 1 / 3) < 1e-15, T.etaCycle().toFixed(9));
  /* The source cannot pin our rating, but it CAN say the efficiency is a plausible one. */
  ckT('it sits between the source\'s guaranteed and verified figures',
      T.etaCycle() > DOC.guaranteed_kW / (DOC.guaranteed_mwt * 1000) &&
      T.etaCycle() < DOC.verified_kW / (DOC.guaranteed_mwt * 1000),
      (T.etaCycle() * 100).toFixed(2) + ' % against Ginna guaranteed ' +
      (DOC.guaranteed_kW / (DOC.guaranteed_mwt * 1000) * 100).toFixed(2) + ' % and verified ' +
      (DOC.verified_kW / (DOC.guaranteed_mwt * 1000) * 100).toFixed(2) + ' %');

  /* ---- SOURCED CONSTANTS ------------------------------------------------------------------ */
  head('SOURCED  [retyped independently of the engine\'s copy]');
  ck('turbine speed matches the source', T.TURB.rpm_rated, DOC.rpm, 1e-12, 'rpm');
  ck('the envelope\'s lower bound matches the source', T.ENVELOPE.min_load_pct, DOC.min_load_pct,
     1e-12, '%');
  ck('the envelope\'s upper bound matches the source', T.ENVELOPE.max_load_pct, DOC.max_load_pct,
     1e-12, '%');
  ck('the sourced step allowance', T.ENVELOPE.step_pct, DOC.step_pct, 1e-12, '%');
  ck('the sourced ramp allowance', T.ENVELOPE.ramp_pct_per_min, DOC.ramp_pct_per_min,
     1e-12, '%/min');

  /* ---- RELATION 1: DEMAND AND OUTPUT INVERT EACH OTHER ------------------------------------ */
  head('SELF-CONSISTENCY  [ask for a load, get exactly that load -- at ANY pressure]');
  var worst = 0;
  [4.0, 5.0, P_NOM, 6.5, 7.0, 8.5].forEach(function (P) {
    [100, 60, 25].forEach(function (L) {
      var tb = T.createTurbine({ load_target_mwe: L });
      var m = T.steamDemand(tb, P, HF);
      var o = T.stepTurbine(tb, 1, { steam_kgs: m, P_mpa: P, h_feed: HF });
      var err = Math.abs(o.mwe_output - L);
      if (err > worst) worst = err;
    });
  });
  ckT('the flow the turbine ASKS for delivers the load it asked for, across 18 cases',
      worst < 1e-9, 'worst error ' + worst.toExponential(2) + ' MWe over 4.0-8.5 MPa x 100/60/25 MWe');
  /* THE COMPENSATION IS REAL, not a constant that happens to invert. h_g FALLS with pressure, so
   * the SAME load needs MORE steam at higher pressure — and a model ignoring pressure would pass
   * the inversion check above while failing this one. */
  ckT('higher secondary pressure needs MORE steam for the same load',
      T.steamDemand(T.createTurbine({}), 8.5, HF) >
      T.steamDemand(T.createTurbine({}), 4.0, HF) * 1.01,
      T.steamDemand(T.createTurbine({}), 4.0, HF).toFixed(2) + ' -> ' +
      T.steamDemand(T.createTurbine({}), 8.5, HF).toFixed(2) + ' kg/s as h_g falls ' +
      W.h_g(4.0).toFixed(1) + ' -> ' + W.h_g(8.5).toFixed(1) + ' kJ/kg');

  /* ---- RELATION 2: THE TURBINE AND THE SG AGREE ON RATED FLOW ----------------------------- */
  head('CROSS-MODULE  [two routes to rated steam flow, and they must be the same number]');
  var sgRated = MWT_RATED * 1000 / (W.h_g(P_NOM) - HF);
  var tbRated = T.steamDemand(T.createTurbine({}), P_NOM, HF);
  ck('turbine demand at rated equals the SG\'s own rated flow', tbRated, sgRated, 1e-9, 'kg/s');
  ckT('...and it is a plant-sized flow, not a coincidence of small numbers',
      tbRated > 100 && tbRated < 250, tbRated.toFixed(2) + ' kg/s');

  /* ---- RELATION 3: OUTPUT FOLLOWS THE STEAM ADMITTED -------------------------------------- */
  head('ADMITTED, NOT DEMANDED  [#284: the operator asked for 50 and the gauge read 99]');
  var tbR = T.createTurbine({ load_target_mwe: 100 });
  var mFull = T.steamDemand(tbR, P_NOM, HF);
  var half = T.stepTurbine(tbR, 1, { steam_kgs: mFull * 0.5, P_mpa: P_NOM, h_feed: HF });
  ck('half the steam makes half the load, whatever was demanded', half.mwe_output, 50, 1e-9, 'MWe');
  ck('...and the shortfall is REPORTED as a deficit', half.deficit_mwe, 50, 1e-9, 'MWe');
  ckT('a turbine given all it asked for reports NO deficit',
      Math.abs(T.stepTurbine(T.createTurbine({}), 1,
        { steam_kgs: mFull, P_mpa: P_NOM, h_feed: HF }).deficit_mwe) < 1e-9, '');
  ckT('no steam means no output', T.stepTurbine(T.createTurbine({}), 1,
        { steam_kgs: 0, P_mpa: P_NOM, h_feed: HF }).mwe_output === 0, '');

  /* ---- TRIP, ENERGY, ENVELOPE ------------------------------------------------------------- */
  head('TRIP AND REPORTING');
  var trp = T.stepTurbine(T.createTurbine({ tripped: true }), 1,
                          { steam_kgs: mFull, P_mpa: P_NOM, h_feed: HF });
  ckT('a tripped turbine makes nothing even with full steam admitted',
      trp.mwe_output === 0 && trp.rpm === 0 && trp.load_target_mwe === 0, '');
  ckT('a tripped turbine asks for no steam',
      T.steamDemand(T.createTurbine({ tripped: true }), P_NOM, HF) === 0, '');
  var acc = T.createTurbine({});
  T.stepTurbine(acc, 10, { steam_kgs: mFull, P_mpa: P_NOM, h_feed: HF });
  ck('generated energy accumulates at the rated rate', acc.generated_kJ, 100000 * 10, 1e-6, 'kJ');
  ckT('the sourced envelope is reported at its boundary, not near it', (function () {
        function pct(L) {
          var t = T.createTurbine({ load_target_mwe: L });
          return T.stepTurbine(t, 1, { steam_kgs: T.steamDemand(t, P_NOM, HF), P_mpa: P_NOM,
                                       h_feed: HF }).within_envelope;
        }
        return pct(100) && pct(60) && pct(12.8) && !pct(12.0) && !pct(101);
      })(), '12.8 % is IN and 12.0 % is OUT — the boundary itself, not a value either side of it');
  /* ⚠ REPORTED, NOT ENFORCED (HR5) — and the flag check above CANNOT see the difference. A
   * version that zeroed output below the envelope floor still sets `within_envelope` correctly
   * and passed every other check here; the injection self-test caught it as a blind spot. What
   * distinguishes reporting from enforcing is that the plant STILL DOES THE THING while saying it
   * is outside the envelope. Rate and load limiting are control-layer actuations — the current
   * engine puts `load_rate_pct_per_min` in config and enforces it in `load_mode.js`, which is the
   * control side, and that division is the house rule. */
  ckT('a load BELOW the sourced envelope is still delivered, only flagged', (function () {
        var t = T.createTurbine({ load_target_mwe: 8 });          /* 8 % — well under 12.8 */
        var o = T.stepTurbine(t, 1, { steam_kgs: T.steamDemand(t, P_NOM, HF), P_mpa: P_NOM,
                                      h_feed: HF });
        return Math.abs(o.mwe_output - 8) < 1e-9 && o.within_envelope === false;
      })(), 'this layer says "outside the envelope"; it does not refuse the load');
  ckT('specific work is the enthalpy drop times the efficiency, and is plant-sized',
      Math.abs(half.specific_work_kJ_per_kg - (W.h_g(P_NOM) - HF) * T.etaCycle()) < 1e-9 &&
      half.specific_work_kJ_per_kg > 400 && half.specific_work_kJ_per_kg < 800,
      half.specific_work_kJ_per_kg.toFixed(1) + ' kJ/kg');

  /* ---- REFUSALS --------------------------------------------------------------------------- */
  head('REFUSALS  [this layer reads its output off the steam, and will not guess either input]');
  ckT('omitting the admitted steam throws rather than reading the demand', (function () {
        try { T.stepTurbine(T.createTurbine({}), 1, { P_mpa: P_NOM }); return false; }
        catch (e) { return /steam_kgs/.test(e.message); }
      })(), 'the whole point of #284 is that these two are different numbers');
  ckT('omitting the pressure throws rather than assuming one', (function () {
        try { T.stepTurbine(T.createTurbine({}), 1, { steam_kgs: 1 }); return false; }
        catch (e) { return /P_mpa/.test(e.message); }
      })(), '');
}

console.log('\nPWR2 Layer 5 -- TURBINE: an electrical demand, at last');
var T = loadFrom(SRC), rec = [];
runSuite(T, rec, false);
var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;

/* MUTATIONS. Cost is negligible here — no plant is stepped, so the whole replay is well under a
 * second (D1 §31 still applies; it is just cheap to satisfy in this file). */
var MUTATIONS = [
  ['efficiency becomes a typed decimal instead of the rating ratio',
   'function etaCycle() { return TURB.mwe_rated / TURB.mwt_rated; }',
   'function etaCycle() { return 0.33; }'],
  ['efficiency inverts the ratio', 'return TURB.mwe_rated / TURB.mwt_rated;',
   'return TURB.mwt_rated / TURB.mwe_rated;'],
  ['the electrical rating moves off the plant identity', 'mwe_rated:    100.0,',
   'mwe_rated:    120.0,'],
  ['the thermal rating moves off the plant identity', 'mwt_rated:    300.0,',
   'mwt_rated:    250.0,'],
  ['OUTPUT READS THE DEMAND instead of the steam admitted (#284)',
   'var kW = tb.tripped ? 0 : drivers.steam_kgs * dh * etaCycle();',
   'var kW = tb.tripped ? 0 : tb.load_target_mwe * 1000;'],
  ['the demand stops compensating for pressure (fixed enthalpy)',
   'var dh = W.h_g(P_mpa) - h_feed;', 'var dh = W.h_g(5.688) - h_feed;'],
  ['the output stops compensating for pressure (fixed enthalpy)',
   'var dh = W.h_g(drivers.P_mpa) - h_feed;', 'var dh = W.h_g(5.688) - h_feed;'],
  ['feedwater enthalpy dropped from the demand (steam credited from zero)',
   'var dh = W.h_g(P_mpa) - h_feed;', 'var dh = W.h_g(P_mpa);'],
  ['feedwater enthalpy dropped from the output',
   'var dh = W.h_g(drivers.P_mpa) - h_feed;', 'var dh = W.h_g(drivers.P_mpa);'],
  ['the demand forgets the efficiency, so it asks for a third of the steam it needs',
   'return (tb.load_target_mwe * 1000) / (etaCycle() * dh);',
   'return (tb.load_target_mwe * 1000) / dh;'],
  ['a tripped turbine still makes power',
   'var kW = tb.tripped ? 0 : drivers.steam_kgs * dh * etaCycle();',
   'var kW = drivers.steam_kgs * dh * etaCycle();'],
  ['a tripped turbine still draws steam', '    if (tb.tripped) return 0;', ''],
  ['the deficit stops reporting the shortfall',
   'deficit_mwe:     (tb.tripped ? 0 : tb.load_target_mwe) - kW / 1000,', 'deficit_mwe:     0,'],
  ['generated energy stops accumulating', 'tb.generated_kJ += kW * dt;', ''],
  ['turbine speed moves off the sourced value', 'rpm_rated:    1800,', 'rpm_rated:    3600,'],
  ['the sourced envelope floor moves', 'min_load_pct: 12.8,', 'min_load_pct: 5.0,'],
  ['the sourced ramp allowance moves', 'ramp_pct_per_min: 5.0,', 'ramp_pct_per_min: 10.0,'],
  ['the envelope is ENFORCED rather than reported (protection in the wrong layer)',
   '    if (kW < 0) kW = 0;', '    if (kW < 0) kW = 0;\n    if (kW / 1000 < 12.8) kW = 0;'],
  /* CONSTRUCTION */
  ['caller load target ignored at construction',
   'load_target_mwe: opts.load_target_mwe === undefined ? TURB.mwe_rated : opts.load_target_mwe,',
   'load_target_mwe: TURB.mwe_rated,'],
  ['caller trip state ignored at construction',
   'tripped:         opts.tripped === undefined ? false : !!opts.tripped,', 'tripped:         false,'],
  ['caller rating ignored at construction',
   'mwe_rated:       opts.mwe_rated === undefined ? TURB.mwe_rated : opts.mwe_rated,',
   'mwe_rated:       TURB.mwe_rated,'],
  ['caller generated total ignored at construction',
   'generated_kJ:    opts.generated_kJ === undefined ? 0 : opts.generated_kJ',
   'generated_kJ:    0'],
  ['the default lineup ships TRIPPED',
   'tripped:         opts.tripped === undefined ? false : !!opts.tripped,',
   'tripped:         opts.tripped === undefined ? true : !!opts.tripped,']
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
  else console.log('  caught    ' + m[0].padEnd(72) + f2 + ' red');
});

console.log('\n' + '='.repeat(70));
console.log('  injection self-test: ' + (MUTATIONS.length - blind) + '/' + MUTATIONS.length +
  ' mutations caught' + (blind ? '  ** ' + blind + ' BLIND SPOTS -- GATE FAILS **' : ', no blind spots'));
console.log('  run_pwr2_turbine: ' + pass + ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit((fail > 0 || blind > 0) ? 1 : 0);
