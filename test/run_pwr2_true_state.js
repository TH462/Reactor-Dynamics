/* run_pwr2_true_state.js — Layer 5 gate: the contract shim. (#479)
 *
 * THE ONE THING THIS GATE EXISTS TO PREVENT is a fabricated value.
 *
 * Roughly two-thirds of the §6.3 contract is blocked behind systems PWR2 does not have. The
 * tempting shim returns `0` for those and reports "109/109 fields supplied". That number would be
 * a lie of exactly the kind D4 §23.4 catalogues: **a consumer cannot tell an unbuilt system from a
 * quiet one.** A containment at 0 MPa reads precisely like a containment that is fine, and every
 * downstream gate would go green over it.
 *
 * So the gate's central assertion is not about coverage. It is that **every field is in exactly one
 * of two states** — supplied with a real value, or ABSENT and declared in `MISSING` with a reason
 * and an owning system — and that the third state, a field nobody has thought about, is EMPTY.
 * That third number is the only one that can be a defect.
 *
 * ⚠ AND THE COVERAGE FRACTION IS NOT A SCORE. 37/109 is not a grade to improve by writing more
 * mappings; it is a measurement of how much plant exists. It rises when a SYSTEM is built, and any
 * other way of raising it is the fabrication this gate forbids.
 *
 * Run: node test/run_pwr2_true_state.js
 */
'use strict';
var fs = require('fs'), path = require('path');
var E = path.join(__dirname, '..', 'engines', 'pwr2');
var LIB = path.join(E, 'pwr2_true_state.js');
var SRC = fs.readFileSync(LIB, 'utf8').replace(/\r\n/g, '\n');
['pwr2_water', 'pwr2_vtable', 'pwr2_geometry', 'pwr2_core', 'pwr2_loop', 'pwr2_sources',
 'pwr2_kinetics', 'pwr2_fuel', 'pwr2_reactor', 'pwr2_sg', 'pwr2_turbine', 'pwr2_relief',
 'pwr2_cvcs', 'pwr2_eccs', 'pwr2_rhr'].forEach(function (f) { require(path.join(E, f + '.js')); });
var RD = globalThis.RD.pwr2, W = RD.water, S = RD.sources;

function loadFrom(src) {
  var root = { RD: { pwr2: { water: RD.water, vtable: RD.vtable, core: RD.core,
                             geometry: RD.geometry, loop: RD.loop, sources: RD.sources,
                             sg: RD.sg } } };
  var body = src.replace("(typeof globalThis !== 'undefined' ? globalThis : this)", '(RD_ROOT)') +
             '\nreturn RD_ROOT.RD.pwr2.trueState;';
  return new Function('RD_ROOT', body)(root);
}

/* THE CONTRACT, PARSED THE WAY run_contract.js PARSES IT — deliberately the same code path.
 * A hand-rolled scan of the same section returned 17 fields on the first attempt (D4 §28.1); using
 * the gate's own extraction is what makes this list the same list the project is judged against. */
function contractFields() {
  var md = fs.readFileSync(path.join(__dirname, '..', 'Blueprint', 'CONTEXT.md'), 'utf8');
  var SECTION = '### 6.3 true_state fields, per plant';
  var at = md.indexOf(SECTION);
  if (at < 0) return null;
  var end = md.slice(at + SECTION.length).search(/\n#{1,3} /);
  var sec = end < 0 ? md.slice(at) : md.slice(at, at + SECTION.length + end);
  var rest = sec.slice(sec.indexOf('PWR'));
  var open = rest.indexOf('```');
  var body = rest.slice(open + 3);
  body = body.slice(0, body.indexOf('```'));
  var keys = {}, m, re = /"([A-Za-z0-9_]+)"\s*:/g;
  body.split('\n').forEach(function (line) {
    var code = line.replace(/\/\/.*$/, '');
    while ((m = re.exec(code)) !== null) keys[m[1]] = true;
  });
  delete keys.true_state;                 /* the container, not a field */
  return Object.keys(keys).sort();
}
var CONTRACT = contractFields();

function runSuite(TS, rec, quiet) {
  function ck(name, cond, note) {
    rec.push({ name: name, ok: !!cond });
    if (!quiet) console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (note ? '  -- ' + note : ''));
  }
  function head(s) { if (!quiet) console.log('\n' + s); }

  function build() {
    var sys = S.createPlant({ h: W.h_l(304.5, 15.41), P: 15.41 });
    var rx = RD.reactor.createReactor({ P: 1.0, coolTemp_c: 304.5 });
    var sg = RD.sg.createSG({}), tb = RD.turbine.createTurbine({}), rl = RD.relief.createRelief({});
    var rated = RD.turbine.steamDemand(tb, sg.P, RD.sg.SG.h_feed);
    var r = RD.reactor.stepReactor(rx, sys, 0.02, { boron_ppm: 700 });
    var sr = RD.sg.stepSG(sg, 304.5, 0.02, { feed: rated, steam: rated });
    var tr = RD.turbine.stepTurbine(tb, 0.02, { steam_kgs: rated, P_mpa: sr.P_sec,
                                                h_feed: RD.sg.SG.h_feed });
    var rr = RD.relief.stepRelief(rl, sg.P, 0.02, { rated_steam_kgs: rated });
    var cv = RD.cvcs.stepCVCS(RD.cvcs.createCVCS({}), sys, 0.02);
    var rh = RD.rhr.stepRHR(RD.rhr.createRHR({}), sys, 0.02, {});
    var ctx = { sys: sys, reactor: r, sg: sr, turbine: tr, relief: rr, cvcs: cv, rhr: rh,
                boron_ppm: 700, rated_steam_kgs: rated, mdot_rated: 1630, natcirc_frac: 0.15,
                M_nominal: sys.M_total };
    return { ts: TS.buildTrueState(ctx), ctx: ctx, sys: sys, r: r, sr: sr, tr: tr, rr: rr };
  }
  var B = build(), ts = B.ts;

  /* ---- THE CENTRAL ASSERTION ---------------------------------------------------------- */
  head('EVERY FIELD IS IN EXACTLY ONE STATE  [supplied, or DECLARED missing -- never neither]');
  var cov = TS.coverage(ts, CONTRACT);
  ck('the contract parsed and is plant-sized', CONTRACT && CONTRACT.length > 100,
     CONTRACT ? CONTRACT.length + ' documented fields' : 'PARSE FAILED');
  ck('NOTHING is unaccounted for', cov.unaccounted.length === 0,
     cov.supplied.length + ' supplied, ' + cov.declared.length + ' declared missing, ' +
     cov.unaccounted.length + ' unaccounted -- the third number is the only one that is a defect');
  ck('the two states do not overlap',
     cov.supplied.every(function (f) { return !TS.MISSING[f]; }),
     'a field cannot be both supplied and declared missing');
  /* ⚠ THE COUNTER ITSELF MUST NOT BE ABLE TO LIE, and the injection self-test proved it could.
   * A coverage() that pushed unaccounted fields into `declared` made "NOTHING is unaccounted"
   * pass vacuously -- the central assertion of this gate defeated by one word. So the DECLARED
   * list is checked against the MISSING registry rather than trusted, and the three buckets are
   * required to partition the contract exactly. */
  ck('every DECLARED field is actually in the MISSING registry',
     cov.declared.every(function (f) { return !!TS.MISSING[f]; }),
     'a field counted as a declared gap without an entry is an unaccounted field wearing a label');
  ck('the three buckets PARTITION the contract -- no double-counting, nothing lost',
     cov.supplied.length + cov.declared.length + cov.unaccounted.length === CONTRACT.length,
     cov.supplied.length + ' + ' + cov.declared.length + ' + ' + cov.unaccounted.length +
     ' = ' + CONTRACT.length);

  /* ⚠ AND THE COUNTER IS TESTED ON A FIXTURE THAT HAS AN UNACCOUNTED FIELD, because on the real
   * contract it does not. 37 supplied + 72 declared = 109, so `unaccounted` is EMPTY in the clean
   * run -- and a mutation redirecting unaccounted fields into `declared` therefore moves nothing
   * and stays invisible. Same vacuity that hid the steam-mass mutation in run_pwr2_loadfollow:
   * a check cannot see a bucket the live case never fills. */
  var synth = TS.coverage({ pressure_mpa: 15.41 },
                          ['pressure_mpa', 'containment_pressure_mpa', 'a_field_nobody_declared']);
  ck('coverage() REPORTS a field that is neither supplied nor declared',
     synth.unaccounted.length === 1 && synth.unaccounted[0] === 'a_field_nobody_declared',
     'given one supplied, one declared and one unknown, it must put the unknown in its own bucket ' +
     '-- the live contract never exercises this, so it is tested on a fixture that does');
  ck('...and still sorts the other two correctly',
     synth.supplied.length === 1 && synth.declared.length === 1, '');

  /* ---- NOTHING IS FABRICATED ----------------------------------------------------------- */
  head('NOTHING IS FABRICATED  [the defect this file exists to prevent]');
  var fabricated = Object.keys(TS.MISSING).filter(function (f) { return ts[f] !== undefined; });
  ck('no DECLARED-MISSING field appears in the output at all', fabricated.length === 0,
     fabricated.length ? 'FABRICATED: ' + fabricated.join(', ')
                       : Object.keys(TS.MISSING).length + ' declared gaps, none of them emitted');
  ck('containment is ABSENT, not zero', ts.containment_pressure_mpa === undefined,
     'a containment at 0 MPa reads exactly like a containment that is fine');
  ck('the pressurizer is ABSENT, not zero', ts.pzr_level_pct === undefined &&
     ts.porv_open === undefined, '#472 owns it; a level of 0 would be a fabricated TMI trainer');
  ck('scram state is ABSENT, not false', ts.scrammed === undefined,
     'reporting "not scrammed" from an engine with no protection layer is the worst case: it is ' +
     'the reassuring answer, and it is unearned');

  /* ---- EVERY DECLARED GAP CARRIES ITS REASON ------------------------------------------- */
  head('EVERY DECLARED GAP CARRIES A REASON AND AN OWNER');
  var thin = Object.keys(TS.MISSING).filter(function (f) {
    var m = TS.MISSING[f];
    return !m || !m.system || !m.reason || m.reason.length < 25;
  });
  ck('each MISSING entry names a system and gives a reason', thin.length === 0,
     thin.length ? 'THIN: ' + thin.join(', ') : Object.keys(TS.MISSING).length + ' entries');
  ck('the pressurizer gap names the lane that owns it',
     /472/.test(TS.MISSING.pzr_level_pct.reason),
     'an unbuilt system owned elsewhere is a different fact from one nobody has designed');

  /* ---- SUPPLIED VALUES COME FROM THE LAYERS, NOT FROM CONSTANTS ------------------------ */
  head('SUPPLIED VALUES TRACE TO THEIR LAYER');
  ck('pressure is the plant pressure', Math.abs(ts.pressure_mpa - B.sys.P) < 1e-12,
     ts.pressure_mpa.toFixed(3) + ' MPa');
  ck('fuel temperature is the reactor\'s', Math.abs(ts.fuel_temp_c - B.r.T_fuel_c) < 1e-12,
     ts.fuel_temp_c.toFixed(1) + ' degC');
  ck('reactivity is the reactor\'s', Math.abs(ts.reactivity_pcm - B.r.rho_pcm) < 1e-12,
     ts.reactivity_pcm.toFixed(1) + ' pcm');
  ck('secondary pressure is the SG\'s', Math.abs(ts.steam_pressure_mpa - B.sr.P_sec) < 1e-12, '');
  ck('electrical output is the turbine\'s', Math.abs(ts.mwe_output - B.tr.mwe_output) < 1e-12,
     ts.mwe_output.toFixed(2) + ' MWe');
  ck('...and they are plant-sized, not placeholders',
     ts.pressure_mpa > 10 && ts.fuel_temp_c > 400 && ts.mwe_output > 50,
     'a shim that returned zeros would pass every equality above');

  /* ---- THE DECLARED SIMPLIFICATION IS VISIBLE ------------------------------------------ */
  head('THE ONE-PRESSURE SIMPLIFICATION IS VISIBLE, NOT HIDDEN');
  ck('hot, cold and suction pressures are the SAME number',
     ts.p_hotleg === ts.p_coldleg && ts.p_coldleg === ts.p_pumpsuction,
     'Layer 3 carries one system pressure; three fields agreeing exactly is the honest ' +
     'presentation of that, not three measurements that happen to coincide');

  /* ---- REFUSAL ------------------------------------------------------------------------- */
  head('REFUSAL  [this layer translates a plant; it does not build one]');
  ck('building without a plant throws', (function () {
       try { TS.buildTrueState({}); return false; }
       catch (e) { return /ctx.sys/.test(e.message); }
     })(), '');
  ck('an absent Layer 5 system yields ABSENT fields, not zeros', (function () {
       var only = TS.buildTrueState({ sys: B.sys });
       return only.mwe_output === undefined && only.fuel_temp_c === undefined &&
              only.pressure_mpa !== undefined;
     })(), 'given only a plant, the primary fields appear and everything downstream does not');
}

console.log('\nPWR2 Layer 5 -- THE CONTRACT SHIM');
var TS = loadFrom(SRC), rec = [];
runSuite(TS, rec, false);
var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;

var MUTATIONS = [
  ['A DECLARED GAP IS FABRICATED AS ZERO -- the defect this file exists to prevent',
   '    function put(k, v) { if (v !== undefined && v !== null) ts[k] = v; }',
   '    function put(k, v) { if (v !== undefined && v !== null) ts[k] = v; }\n' +
   '    Object.keys(MISSING).forEach(function (f) { ts[f] = 0; });'],
  ['scram state is reported FALSE from an engine with no protection layer',
   "    put('pressure_mpa',  sys.P);", "    put('pressure_mpa',  sys.P);\n    ts.scrammed = false;"],
  ['a MISSING entry loses its reason',
   "  declareMissing('containment', 'no containment model exists in PWR2.',",
   "  declareMissing('containment', '',"],
  ['a MISSING entry loses the lane that owns the pressurizer',
   "#472 is rebuilding the pressurizer on ", "the pressurizer is not built on "],
  ['coverage() counts DECLARED gaps as supplied, inflating the fraction',
   '      if (ts[f] !== undefined) supplied.push(f);',
   '      if (ts[f] !== undefined || MISSING[f]) supplied.push(f);'],
  ['coverage() stops reporting unaccounted fields',
   '      else unaccounted.push(f);', '      else declared.push(f);'],
  ['fuel temperature is read from the wrong layer',
   "    put('fuel_temp_c',    rx.T_fuel_c);", "    put('fuel_temp_c',    sg.T_sec);"],
  ['the one-pressure simplification is hidden by perturbing the three readings',
   "    put('p_pumpsuction', sys.P);", "    put('p_pumpsuction', sys.P * 0.98);"],
  ['the shim invents a plant instead of refusing',
   "      throw new Error('pwr2_true_state: ctx.sys is REQUIRED — this layer translates a plant, it ' +\n                      'does not build one.');",
   '      sys = { P: 15.41, nodes: [] };']
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
console.log('  run_pwr2_true_state: ' + pass + ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit((fail > 0 || blind > 0) ? 1 : 0);
