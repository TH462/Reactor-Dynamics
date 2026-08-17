/* run_pwr2_condenser.js — Layer 5 gate: the main condenser. (#479)
 *
 * THE CLAIM THIS LAYER MAKES is that the vacuum is a CONSEQUENCE, not a parameter — that
 * backpressure follows from circulating water temperature, flow and exchanger conductance, so a
 * player can lose it rather than being told it is lost. A model carrying a constant vacuum passes
 * every steady-state check and teaches nothing, so the gate is built around DEGRADATION: each
 * mechanism must move the backpressure, and each must move it for its own reason.
 *
 * ⚠ THE DEAD-CODE FAILURE THIS GATE EXISTS AFTER. The first version of the engine computed a
 * conductance `UA`, degraded it by fouling — and then never used it, because the temperature
 * closure carried a fixed terminal difference and a literal `Q / UA_kW * 0`. Fouling and air
 * binding both reported ZERO effect while the code that computed them ran every step. A check on
 * "does UA exist" or "is fouling applied" would have passed; only measuring the OUTPUT at two
 * fouling levels catches it. Every degradation check below is therefore a COMPARISON, never an
 * assertion about the code path.
 *
 * Run: node test/run_pwr2_condenser.js
 */
'use strict';
var fs = require('fs'), path = require('path');
var E = path.join(__dirname, '..', 'engines', 'pwr2');
var LIB = path.join(E, 'pwr2_condenser.js');
var SRC = fs.readFileSync(LIB, 'utf8').replace(/\r\n/g, '\n');
['pwr2_water', 'pwr2_vtable', 'pwr2_geometry', 'pwr2_core', 'pwr2_loop', 'pwr2_sources',
 'pwr2_turbine'].forEach(function (f) { require(path.join(E, f + '.js')); });
var RD = globalThis.RD.pwr2, W = RD.water;

function loadFrom(src) {
  var root = { RD: { pwr2: { water: RD.water, vtable: RD.vtable, turbine: RD.turbine } } };
  var body = src.replace("(typeof globalThis !== 'undefined' ? globalThis : this)", '(RD_ROOT)') +
             '\nreturn RD_ROOT.RD.pwr2.condenser;';
  return new Function('RD_ROOT', body)(root);
}

/* THE SOURCE, RETYPED INDEPENDENTLY — Ginna UFSAR ch10 §10.4.3 (ML20339A040):
 * "a heat transfer area of 125,000 ft2" per shell, TWO shells; "designed for a circulating water
 * temperature of 50F with an approximate 24.5F temperature rise"; C-9 "< 5 in. Hg backpressure",
 * removed at "7.6 in. Hg". */
var DOC = { area_per_shell_ft2: 125000, shells: 2, ginna_mwt: 1775,
            cw_in_f: 50.0, cw_rise_f: 24.5, c9_in_hg: 5.0, c9_out_in_hg: 7.6 };
var RATED_MWT = 300, REJECT_KW = 200000;      /* 300 MWt x (1 - 1/3) */

function runSuite(C, rec, quiet) {
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
  function at(opts, drv) {
    return C.stepCondenser(C.createCondenser(opts || {}), 0.02,
                           Object.assign({ duty_kW: REJECT_KW }, drv || {}));
  }

  /* ---- CONSTRUCTION, WRITTEN FIRST (D1 §31) ---------------------------------------------- */
  head('CONSTRUCTION  [a caller argument that never arrives is invisible to a physics check]');
  ck('caller circulating-water inlet reaches the plant',
     C.createCondenser({ cw_inlet_c: 22 }).cw_inlet_c, 22, 1e-12, 'degC');
  ck('caller fouling reaches the plant', C.createCondenser({ fouling: 0.3 }).fouling, 0.3,
     1e-12, '');
  ck('caller CW flow reaches the plant', C.createCondenser({ cw_flow_kgs: 999 }).cw_flow_kgs, 999,
     1e-12, 'kg/s');
  ck('caller rating reaches the plant',
     C.createCondenser({ rated_thermal_kW: 4242 }).rated_thermal_kW, 4242, 1e-12, 'kW');
  ckT('the default lineup is CLEAN and at the sourced design inlet',
      C.createCondenser({}).fouling === 0 &&
      Math.abs(C.createCondenser({}).cw_inlet_c - (DOC.cw_in_f - 32) * 5 / 9) < 1e-9,
      'a default of fouled would make every probe that omits it run a degraded condenser');

  /* ---- SOURCED ---------------------------------------------------------------------------- */
  head('SOURCED  [Ginna ch10 §10.4.3, retyped independently of the engine copy]');
  ck('the anchor area is two shells of the sourced area', C.COND.ginna_area_ft2,
     DOC.area_per_shell_ft2 * DOC.shells, 1e-9, 'ft2');
  ck('the design CW inlet matches the source', C.COND.cw_design_in_f, DOC.cw_in_f, 1e-12, 'degF');
  ck('the design CW rise matches the source', C.COND.cw_design_rise_f, DOC.cw_rise_f, 1e-12, 'degF');
  ck('the C-9 permissive matches the source', C.COND.c9_permissive_in_hg, DOC.c9_in_hg,
     1e-12, 'in Hg');
  ck('the C-9 removal point matches the source', C.COND.c9_removed_in_hg, DOC.c9_out_in_hg,
     1e-12, 'in Hg');
  ck('area is POWER-scaled to this plant', C.areaM2() * 10.7639,
     DOC.area_per_shell_ft2 * DOC.shells * RATED_MWT / DOC.ginna_mwt, 5, 'ft2');
  ckT('...on the POWER basis, not the volume one — a condenser rejects HEAT',
      Math.abs(C.COND.POWER_SCALE - RATED_MWT / DOC.ginna_mwt) < 1e-12,
      'run_pwr2_bases pins which system uses which basis; this is ECCS and RHR reasoning');

  /* ---- THE DESIGN POINT ROUND-TRIPS ------------------------------------------------------- */
  head('THE DESIGN POINT  [CW flow was DERIVED from the sourced rise, so the rise must come back]');
  var d = at({}, {});
  ck('at design duty the CW rise reproduces the sourced 24.5 degF', d.cw_rise_c * 9 / 5,
     DOC.cw_rise_f, 0.05, 'degF');
  ckT('...and that is a ROUND TRIP, not an independent check',
      Math.abs(C.cwFlowKgs(300000) - REJECT_KW / (4.18 * DOC.cw_rise_f * 5 / 9)) < 1,
      'the flow was solved FROM the rise, so agreement proves the arithmetic closes and nothing ' +
      'more — an independent check would need a sourced flow, which the corpus does not give');
  /* ⚠ AND IT MUST SCALE WITH THE RATING. The round-trip above compares the flow against the same
   * formula that produced it, so a HARDCODED 3515 -- which is exactly the derived value at 300 MWt
   * -- satisfies it identically. The injection self-test found that. A derivation is only
   * distinguishable from a constant that happens to equal it by moving the input. */
  ckT('CW flow SCALES with the plant rating, so it is a derivation and not a constant',
      Math.abs(C.cwFlowKgs(600000) - 2 * C.cwFlowKgs(300000)) < 1e-6 &&
      C.cwFlowKgs(600000) > C.cwFlowKgs(300000) + 1,
      C.cwFlowKgs(300000).toFixed(0) + ' -> ' + C.cwFlowKgs(600000).toFixed(0) +
      ' kg/s at double the rating');
  ck('the duty is the CYCLE rejection, not the reactor output', d.duty_kW, REJECT_KW, 1e-9, 'kW');
  ckT('backpressure at design is plant-plausible', d.backpressure_in_hg > 1 &&
      d.backpressure_in_hg < 3.5,
      d.backpressure_in_hg.toFixed(2) + ' in Hg — a real PWR runs 1.5-3');

  /* ---- THE VACUUM IS A SATURATION PRESSURE ------------------------------------------------ */
  head('THE VACUUM IS A SATURATION PRESSURE  [not a parameter]');
  ck('condenser pressure IS P_sat at the condensing temperature', d.P_cond_mpa,
     W.P_sat(d.T_cond_c), 1e-12, 'MPa');
  ck('vacuum is atmospheric less the condenser pressure', d.condenser_vacuum_kpa,
     C.P_ATM_KPA - d.P_cond_mpa * 1000, 1e-9, 'kPa');
  ckT('the condensing temperature sits ABOVE the CW outlet, by the exchanger gap',
      d.T_cond_c > d.cw_outlet_c && d.T_cond_c - d.cw_outlet_c < 25,
      (d.T_cond_c - d.cw_outlet_c).toFixed(2) + ' degC = Q/UA — there is no fixed terminal ' +
      'difference constant, which is what makes fouling matter');

  /* ---- DEGRADATION: EVERY MECHANISM MUST MOVE THE ANSWER ---------------------------------- */
  head('DEGRADATION  [comparisons, never assertions -- the dead-UA defect passed every assertion]');
  var warm = at({ cw_inlet_c: 25 }, {});
  var foul = at({ fouling: 0.4 }, {});
  var air  = at({}, { air_binding_frac: 0.5 });
  var trip = at({}, { cw_pumps_running: false });
  ckT('WARMER circulating water raises backpressure',
      warm.backpressure_in_hg > d.backpressure_in_hg * 1.5,
      d.backpressure_in_hg.toFixed(2) + ' -> ' + warm.backpressure_in_hg.toFixed(2) + ' in Hg at 25 degC inlet');
  ckT('FOULING raises backpressure', foul.backpressure_in_hg > d.backpressure_in_hg * 1.3,
      d.backpressure_in_hg.toFixed(2) + ' -> ' + foul.backpressure_in_hg.toFixed(2) +
      ' in Hg at 40 % fouled — this is the one the dead-UA version reported as UNCHANGED');
  ckT('AIR BINDING raises backpressure', air.backpressure_in_hg > d.backpressure_in_hg * 1.3,
      d.backpressure_in_hg.toFixed(2) + ' -> ' + air.backpressure_in_hg.toFixed(2) + ' in Hg');
  ckT('losing the circulating water pumps destroys the vacuum outright',
      trip.backpressure_in_hg > 20 && trip.available === false,
      trip.backpressure_in_hg.toFixed(1) + ' in Hg');
  ckT('the four mechanisms are INDEPENDENT, not one knob wearing four names',
      Math.abs(warm.backpressure_in_hg - foul.backpressure_in_hg) > 0.2 &&
      Math.abs(foul.backpressure_in_hg - air.backpressure_in_hg) > 0.2,
      'warm ' + warm.backpressure_in_hg.toFixed(2) + ', fouled ' + foul.backpressure_in_hg.toFixed(2) +
      ', air ' + air.backpressure_in_hg.toFixed(2) + ' — they must not coincide');
  ckT('a heavier heat load raises backpressure too',
      at({}, { duty_kW: REJECT_KW * 1.3 }).backpressure_in_hg > d.backpressure_in_hg * 1.1, '');

  /* ---- C-9 IS REPORTED, NEVER ENFORCED ---------------------------------------------------- */
  head('C-9  [reported, never enforced -- an interlock is a control-layer actuation, HR5]');
  ckT('at design the permissive is met', d.c9_permissive_met === true && d.c9_removed === false, '');
  ckT('...and it is LOST before the interlock is removed, in that order',
      warm.backpressure_in_hg > DOC.c9_in_hg && warm.backpressure_in_hg < DOC.c9_out_in_hg &&
      warm.c9_permissive_met === false && warm.c9_removed === false,
      'warm water at ' + warm.backpressure_in_hg.toFixed(2) + ' in Hg sits BETWEEN the two ' +
      'sourced thresholds — the band exists and the plant can be in it');
  ckT('losing the permissive does NOT stop the condenser working',
      warm.duty_kW === REJECT_KW && warm.condenser_vacuum_kpa > 0,
      'this layer reports the interlock state; it does not act on it');

  /* ---- REFUSAL ---------------------------------------------------------------------------- */
  head('REFUSAL  [the heat to reject belongs to the cycle, not to this layer]');
  ckT('omitting the duty throws rather than deriving it from a steam flow', (function () {
        try { C.stepCondenser(C.createCondenser({}), 0.02, {}); return false; }
        catch (e) { return /duty_kW/.test(e.message); }
      })(), 'the first version derived it as steam x h_fg and got 395 MW out of a 300 MWt plant');
}

console.log('\nPWR2 Layer 5 -- THE MAIN CONDENSER');
var C = loadFrom(SRC), rec = [];
runSuite(C, rec, false);
var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;

var MUTATIONS = [
  ['the exchanger gap is dropped — fouling and air binding go INERT (the original defect)',
   '      T_cond   = T_cw_out + Q / UA_kW;', '      T_cond   = T_cw_out + 3.0;'],
  ['fouling stops degrading the conductance',
   '    var degrade = 1 - Math.min(1, Math.max(0, cd.fouling) +',
   '    var degrade = 1 - Math.min(1, 0 * Math.max(0, cd.fouling) +'],
  ['air binding stops degrading the conductance',
   '                                  Math.max(0, Math.min(1, drivers.air_binding_frac || 0)));',
   '                                  0 * Math.max(0, Math.min(1, drivers.air_binding_frac || 0)));'],
  ['the circulating water stops carrying heat away (inlet temperature ignored)',
   '      T_cw_out = cd.cw_inlet_c + Q / (cw * cp);', '      T_cw_out = 10 + Q / (cw * cp);'],
  ['condenser pressure stops being a SATURATION pressure',
   '      P_cond   = W.P_sat(T_cond);', '      P_cond   = 0.00813;'],
  ['vacuum is measured from zero instead of atmospheric',
   '    var vacuum_kPa = P_ATM_KPA - P_cond_kPa;', '    var vacuum_kPa = P_cond_kPa;'],
  ['CW flow is a typed number instead of deriving from the sourced rise',
   '    return rated_thermal_kW * (1 - eta) / (cp * dT);', '    return 3515;'],
  ['the CW flow forgets the cycle rejects only what it did not convert',
   '    return rated_thermal_kW * (1 - eta) / (cp * dT);',
   '    return rated_thermal_kW / (cp * dT);'],
  ['the area stops being power-scaled', 'POWER_SCALE: 300 / 1775,', 'POWER_SCALE: 1.0,'],
  ['the sourced anchor area moves', 'ginna_area_ft2:   250000,', 'ginna_area_ft2:   125000,'],
  ['the sourced design CW rise moves', 'cw_design_rise_f: 24.5,', 'cw_design_rise_f: 15.0,'],
  ['the C-9 permissive moves off its sourced setpoint', 'c9_permissive_in_hg: 5.0,',
   'c9_permissive_in_hg: 3.0,'],
  ['the C-9 thresholds are swapped, so removal precedes loss of the permissive',
   '      c9_permissive_met: backpressure_in_hg < COND.c9_permissive_in_hg,\n' +
   '      c9_removed:        backpressure_in_hg >= COND.c9_removed_in_hg,',
   '      c9_permissive_met: backpressure_in_hg < COND.c9_removed_in_hg,\n' +
   '      c9_removed:        backpressure_in_hg >= COND.c9_permissive_in_hg,'],
  ['the interlock is ENFORCED rather than reported (protection in the wrong layer)',
   '      duty_kW:              Q,',
   '      duty_kW:              backpressure_in_hg < COND.c9_permissive_in_hg ? Q : 0,'],
  ['losing the CW pumps no longer removes the flow',
   '    if (!running) cw = 0;', ''],
  /* CONSTRUCTION */
  ['caller CW inlet ignored at construction',
   'cw_inlet_c: opts.cw_inlet_c === undefined ? f2c(COND.cw_design_in_f) : opts.cw_inlet_c,',
   'cw_inlet_c: f2c(COND.cw_design_in_f),'],
  ['caller fouling ignored at construction',
   'fouling: opts.fouling === undefined ? 0 : opts.fouling,', 'fouling: 0,'],
  ['caller CW flow ignored at construction',
   'cw_flow_kgs: opts.cw_flow_kgs === undefined ? null : opts.cw_flow_kgs,', 'cw_flow_kgs: null,'],
  ['the default lineup ships FOULED',
   'fouling: opts.fouling === undefined ? 0 : opts.fouling,',
   'fouling: opts.fouling === undefined ? 0.5 : opts.fouling,']
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
console.log('  run_pwr2_condenser: ' + pass + ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit((fail > 0 || blind > 0) ? 1 : 0);
