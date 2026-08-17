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
 'pwr2_cvcs', 'pwr2_eccs', 'pwr2_rhr', 'pwr2_break', 'pwr2_containment', 'pwr2_condenser',
 'pwr2_afw', 'pwr2_damage'
].forEach(function (f) { require(path.join(E, f + '.js')); });
var RD = globalThis.RD.pwr2, W = RD.water, S = RD.sources;

function loadFrom(src) {
  /* eccs IS included -- buildTrueState() calls RD.eccs.hhsiFlow/lhsiFlow directly to normalize
   * hpi_flow_normalized, the same reason `sg` is here for RD.sg.primaryTavg. break_/containment/
   * condenser are NOT: the shim only reads their STEP RESULTS off ctx, never calls into them. */
  var root = { RD: { pwr2: { water: RD.water, vtable: RD.vtable, core: RD.core,
                             geometry: RD.geometry, loop: RD.loop, sources: RD.sources,
                             sg: RD.sg, eccs: RD.eccs } } };
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
    /* A SMALL LEAK, at full power, so leak_flow is a plausible small number rather than zero --
     * a break wired in but never exercised in the fixture would leave the wiring untested. */
    var brk = RD.break_.stepBreak(
      RD.break_.createBreak({ area_m2: 0.0001, cd: 1.0, node: 'cold_leg', open: true }), sys, 0.02, {});
    var ctm = RD.containment.createContainment({});
    var ctr = RD.containment.stepContainment(ctm, 0.02,
      brk.mdot_kgs > 0 ? { mdot_kgs: brk.mdot_kgs, h_kJkg: brk.source.h } : { mdot_kgs: 0 });
    var cnd = RD.condenser.stepCondenser(RD.condenser.createCondenser({}), 0.02, { duty_kW: 200000 });
    /* ECCS at the plant's OWN pressure (15.41 MPa) is above both shutoff heads -- zero flow, and
     * that IS the lesson pwr2_eccs.js's own header makes the point of. A second, LOW-pressure call
     * (not part of ctx) exercises the injecting branch separately, below. */
    var ecc = RD.eccs.stepECCS(RD.eccs.createECCS({ hhsiRunning: true, lhsiRunning: true }), sys, 0.02);
    var awf = RD.afw.stepAFW(RD.afw.createAFW({ mdafwRunning: true }), 0.02);
    /* DAMAGE, driven at the plant's OWN temperatures -- a healthy core, so every latch reads
     * false because it EARNED false and not because nothing was wired. The damaged branch is
     * exercised separately below. */
    var dmg = RD.damage.stepDamage(RD.damage.createDamage({}), 0.02,
      { cladTemp_c: r.T_clad_c, fuelTemp_c: r.T_fuel_c });
    var ctx = { sys: sys, reactor: r, sg: sr, turbine: tr, relief: rr, cvcs: cv, rhr: rh,
                break_: brk, containment: ctr, condenser: cnd, eccs: ecc, afw: awf,
                damage: dmg,
                boron_ppm: 700, rated_steam_kgs: rated, mdot_rated: 1630, natcirc_frac: 0.15,
                M_nominal: sys.M_total };
    return { ts: TS.buildTrueState(ctx), ctx: ctx, sys: sys, r: r, sr: sr, tr: tr, rr: rr,
             brk: brk, ctr: ctr, cnd: cnd, ecc: ecc, awf: awf, dmg: dmg };
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
                          ['pressure_mpa', 'containment_sump_pct', 'a_field_nobody_declared']);
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
  ck('containment SPRAY is ABSENT, not zero -- the sub-system that is genuinely unbuilt',
     ts.ctmt_spray_active === undefined && ts.containment_sump_pct === undefined,
     'spray/fans/recombiners/sump have no sourced capacity; containment pressure itself is now ' +
     'SUPPLIED, checked below');
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
  ck('startup_rate_dpm traces to the reactor\'s own signal, not re-derived here',
     ts.startup_rate_dpm === B.r.startup_rate_dpm, ts.startup_rate_dpm.toFixed(3) + ' dpm');
  ck('reactor_period_s is a real number (possibly Infinity), never dropped to undefined',
     typeof ts.reactor_period_s === 'number', ts.reactor_period_s + ' s');
  ck('secondary pressure is the SG\'s', Math.abs(ts.steam_pressure_mpa - B.sr.P_sec) < 1e-12, '');
  ck('electrical output is the turbine\'s', Math.abs(ts.mwe_output - B.tr.mwe_output) < 1e-12,
     ts.mwe_output.toFixed(2) + ' MWe');
  ck('...and they are plant-sized, not placeholders',
     ts.pressure_mpa > 10 && ts.fuel_temp_c > 400 && ts.mwe_output > 50,
     'a shim that returned zeros would pass every equality above');

  /* ---- THE NEWLY-WIRED SYSTEMS: break, containment, condenser, ECCS ---------------------- */
  head('BREAK / CONTAINMENT / CONDENSER / ECCS -- built earlier this session, wired NOW');
  ck('leak_flow is the break\'s own discharge, not re-derived',
     ts.leak_flow === B.brk.mdot_kgs && ts.leak_flow > 0,
     ts.leak_flow.toFixed(4) + ' kg/s -- a small leak at full power, not a placeholder');
  ck('containment pressure is SUPPLIED and near its sourced initial condition',
     ts.containment_pressure_mpa !== undefined &&
     Math.abs(ts.containment_pressure_mpa - B.ctr.containment_pressure_mpa) < 1e-12 &&
     ts.containment_pressure_mpa > 0.1 && ts.containment_pressure_mpa < 0.2,
     ts.containment_pressure_mpa.toFixed(4) + ' MPa -- one 0.02 s step off the 125 F/1.0 psig start');
  ck('containment temperature traces to the same step',
     ts.containment_temp_c === B.ctr.containment_temp_c, ts.containment_temp_c.toFixed(2) + ' degC');
  ck('condenser vacuum is SUPPLIED and plant-plausible',
     ts.condenser_vacuum_kpa !== undefined && ts.condenser_vacuum_kpa > 0,
     ts.condenser_vacuum_kpa.toFixed(2) + ' kPa');
  ck('condenser availability traces to the condenser\'s own C-9 read, not re-derived',
     ts.condenser_cooling_available === B.cnd.available, '');
  ck('ECCS at full power (above both shutoff heads) reports standby, not fabricated flow',
     ts.hpi_active === false && ts.eccs_mode === 'standby',
     'both HHSI (9.58 MPa) and LHSI (1.48 MPa) shutoff sit BELOW 15.41 MPa -- zero flow is the ' +
     'lesson pwr2_eccs.js exists to teach, not a wiring gap');

  /* ECCS INJECTING -- a second, low-pressure call, isolated from the steady-state ctx above so
   * that fixture stays internally consistent (build() is a full-power steady state). */
  var ecLow = RD.eccs.stepECCS(RD.eccs.createECCS({ hhsiRunning: true, lhsiRunning: true }),
                                { P: 1.0 }, 0.02);
  var tsLow = TS.buildTrueState({ sys: B.sys, eccs: ecLow });
  ck('below both shutoff heads, ECCS mode and normalized flow are DERIVED, not fabricated',
     tsLow.hpi_active === true && tsLow.eccs_mode === 'both' &&
     tsLow.hpi_flow_normalized > 0 && tsLow.hpi_flow_normalized <= 1,
     'mode=' + tsLow.eccs_mode + '  normalized=' + tsLow.hpi_flow_normalized.toFixed(3));
  ck('hpi_discharge_pressure_mpa stays declared-missing -- no pump curve gives it',
     tsLow.hpi_discharge_pressure_mpa === undefined && !!TS.MISSING.hpi_discharge_pressure_mpa,
     'wiring the flows must not tempt inventing the one field the curve does not supply');
  ck('AFW pump-running and flow-normalized are SUPPLIED once a train is lined up',
     ts.afw_pump_running === true && ts.afw_active === true &&
     ts.afw_flow_normalized !== undefined && ts.afw_flow_normalized > 0,
     'normalized=' + ts.afw_flow_normalized.toFixed(3));
  ck('afw_blocked and afw_discharge_pressure_mpa stay declared-missing -- no CST, no pump curve',
     ts.afw_blocked === undefined && ts.afw_discharge_pressure_mpa === undefined &&
     !!TS.MISSING.afw_blocked && !!TS.MISSING.afw_discharge_pressure_mpa, '');

  /* ---- CORE DAMAGE: five supplied, one still declared, and the reason CHANGED -------------
   * This block is the one this file's header warns about most directly. Five of these six were
   * declared missing under "no fuel-damage or clad-oxidation model" until the models landed, and
   * the registry had to be rewritten in the SAME commit or it would have gone on telling
   * consumers there was no model for a field a real, sourced one already answers. */
  head('CORE DAMAGE  [five landed today; the sixth is missing for a DIFFERENT reason than before]');
  ck('clad_temp_c is SUPPLIED, and it traces to the reactor rather than to the damage model',
     ts.clad_temp_c !== undefined && ts.clad_temp_c === B.r.T_clad_c,
     'the cladding is a thermal node in the plant energy balance; a damage model reporting its ' +
     'own clad temperature would report one the balance never saw');
  ck('...and it sits between the coolant and the fuel, as a node in that stack must',
     ts.clad_temp_c > ts.tavg_c && ts.clad_temp_c < ts.fuel_temp_c,
     'coolant ' + ts.tavg_c.toFixed(1) + ' < clad ' + ts.clad_temp_c.toFixed(1) +
     ' < fuel ' + ts.fuel_temp_c.toFixed(1) + ' degC');
  /* ⚠ THE BAR IS THE DECAY TAIL, NOT A SMALL-LOOKING NUMBER. The first version asked for
   * "< 1e-3 %" and measured 2.9e-3 — a threshold picked for how small it read. Stated against
   * something physical: this plant's decay heat never falls below ~0.5 % of rated, so anything
   * two orders below that is unmeasurable beside it. (The single first step from a PRISTINE
   * oxide is also the parabolic law's fastest instant — dw/dt = K/(2w) — so a one-step reading
   * overstates the sustained rate.) */
  ck('zirc_heat_pct is SUPPLIED and is negligible beside decay heat on a healthy core',
     ts.zirc_heat_pct !== undefined && ts.zirc_heat_pct >= 0 && ts.zirc_heat_pct < 0.01,
     'a supplied ' + ts.zirc_heat_pct.toExponential(2) + ' % is a MEASUREMENT of no reaction, ' +
     'two orders below the smallest decay heat this plant ever has; an absent field would mean ' +
     'no model, and the two must not read alike');
  /* ⚠ A LATCH REPORTING false ON A HEALTHY PLANT IS ONLY MEANINGFUL IF IT CAN REPORT true.
   * This gate's own header names the worst case exactly: reporting "not scrammed" from an engine
   * with no protection layer is "the reassuring answer, and it is unearned". So the false is
   * checked here AND the true is earned on a second fixture, or the pair proves nothing. */
  ck('the damage latches are SUPPLIED and read false on a healthy plant',
     ts.fuel_damaged === false && ts.melted === false && ts.destruction_cause === 'none',
     'supplied-and-false, not absent -- the engine has looked and found no damage');
  var dmgHot = RD.damage.createDamage({});
  var rHot = RD.damage.stepDamage(dmgHot, 0.02, { cladTemp_c: 1300, fuelTemp_c: 2900 });
  var tsHot = TS.buildTrueState({ sys: B.sys, reactor: B.r, damage: rHot });
  /* ⚠ THIS CONTEXT DELIBERATELY CARRIES NO AFW, NO SG, NO TURBINE — only a plant, a reactor and
   * a damage model. It is the check that catches the damage block being NESTED inside another
   * system's guard, which is how the first version of the shim wiring shipped: it landed inside
   * `if (aw.total_kgs !== undefined)`, so a caller with damage and no auxiliary feedwater got all
   * five fields dropped and read them as "no model". Every damage field is asserted HERE, on the
   * minimal context, and not only on the fully-populated fixture. */
  ck('...and they read TRUE on a wrecked core, so the false above is earned and not a default',
     tsHot.fuel_damaged === true && tsHot.melted === true &&
     tsHot.destruction_cause === 'thermal_melt' && tsHot.clad_temp_c !== undefined,
     'clad 1300 degC past the 2200 degF limit, fuel 2900 degC past the UO2 melting point — on a ' +
     'context carrying ONLY sys, reactor and damage, so no other system can be propping it up');
  ck('...and zirc_heat_pct is a REAL number there, not the healthy zero',
     tsHot.zirc_heat_pct > ts.zirc_heat_pct,
     tsHot.zirc_heat_pct.toExponential(2) + ' % against ' + ts.zirc_heat_pct.toExponential(2));
  /* THE SIXTH FIELD, AND ITS REASON IS THE POINT. It is not "no damage model" any more -- there
   * is one. It is that a LEVEL needs a free surface this engine has no phase separation to give,
   * and that machinery belongs to another lane. The gate checks the reason NAMES that lane, the
   * same way it does for the pressurizer. */
  ck('core_uncovered_frac is ABSENT, not zero -- an uncovered core must not read as covered',
     ts.core_uncovered_frac === undefined && !!TS.MISSING.core_uncovered_frac, '');
  ck('...and its reason names PHASE SEPARATION and the lane that owns it, not "no model"',
     /472/.test(TS.MISSING.core_uncovered_frac.reason) &&
     /separation/i.test(TS.MISSING.core_uncovered_frac.reason) &&
     !/no fuel-damage/.test(TS.MISSING.core_uncovered_frac.reason),
     'a stale reason is the defect this file exists to prevent, in the opposite direction');

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
  /* ---- CORE DAMAGE WIRING (2026-08-17). The first is the defect this commit actually made:
   * the damage block landed INSIDE the auxiliary-feedwater guard, so a caller with a damage
   * model and no AFW silently got no damage fields at all. It reads as "no model", which is
   * exactly what this file exists to stop, and it happened in the commit whose subject is not
   * doing that. */
  ['the damage block is nested inside ANOTHER system guard, so it vanishes without AFW',
   "    put('clad_temp_c',       rx.T_clad_c);",
   "    if (aw.total_kgs !== undefined) put('clad_temp_c', rx.T_clad_c);"],
  ['the damage latches are never wired through, so a wrecked core reads as no model',
   "    put('fuel_damaged',      dg.fuel_damaged);\n" +
   "    put('melted',            dg.melted);",
   ''],
  ['clad_temp_c is fabricated from the coolant instead of read from the clad NODE',
   "    put('clad_temp_c',       rx.T_clad_c);",
   "    put('clad_temp_c',       nodeT(sys, 'core'));"],
  ['core_uncovered_frac reverts to its STALE reason, which named a model that now exists',
   "    'core uncovery needs PHASE SEPARATION, not geometry: Layer 2 is homogeneous equilibrium ' +",
   "    'no fuel-damage or clad-oxidation model. ' +"],
  ['A DECLARED GAP IS FABRICATED AS ZERO -- the defect this file exists to prevent',
   '    function put(k, v) { if (v !== undefined && v !== null) ts[k] = v; }',
   '    function put(k, v) { if (v !== undefined && v !== null) ts[k] = v; }\n' +
   '    Object.keys(MISSING).forEach(function (f) { ts[f] = 0; });'],
  ['scram state is reported FALSE from an engine with no protection layer',
   "    put('pressure_mpa',  sys.P);", "    put('pressure_mpa',  sys.P);\n    ts.scrammed = false;"],
  ['a MISSING entry loses its reason',
   "  declareMissing('containment', 'pwr2_containment.js supplies pressure and temperature; spray, ' +\n" +
   "    'fan coolers, recombiners and hydrogen tracking are UNBUILT (their capacities are not in the ' +\n" +
   "    'corpus) and sump level needs a geometry map this engine does not have.',",
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
