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
 'pwr2_afw', 'pwr2_damage', 'pwr2_protection', 'pwr2_pressurizer', 'pwr2_feedwater'
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
    /* the feed train at its own steady point: on-program level, feed matching steam */
    var fwf = RD.feedwater.stepFeedwater(RD.feedwater.createFeedwater({}), 0.02,
      { sg_level_pct: 65.0, steam_flow_frac: 1.0, fw_flow_frac: 1.0, si_active: false });
    /* DAMAGE, driven at the plant's OWN temperatures -- a healthy core, so every latch reads
     * false because it EARNED false and not because nothing was wired. The damaged branch is
     * exercised separately below. */
    var dmg = RD.damage.stepDamage(RD.damage.createDamage({}), 0.02,
      { cladTemp_c: r.T_clad_c, fuelTemp_c: r.T_fuel_c });
    /* PROTECTION at the plant's OWN readings, lined up as a plant AT POWER is -- the low flux
     * block requested, which P-10 permits at 100 %. A healthy plant, so `scrammed` reads false
     * because it EARNED false. */
    var prt = RD.protection.stepProtection(
      RD.protection.createProtection({ blockLowFlux: true }), 0.02,
      { pressure_mpa: sys.P, power_frac: r.power_pct / 100,
        flow_frac: sys.mdot_loop / 1630, steam_pressure_mpa: sr.P_sec, steam_flow_frac: 1.0 });
    /* The pressurizer, stepped at the plant's own state like every other system — a healthy
     * plant near setpoint, so the flags it supplies read false because they EARNED false. */
    var pzo = RD.pressurizer.createPressurizer({});
    var pzr = RD.pressurizer.stepPressurizer(pzo, sys, 0.02, {});
    var ctx = { sys: sys, reactor: r, sg: sr, turbine: tr, relief: rr, cvcs: cv, rhr: rh,
                break_: brk, containment: ctr, condenser: cnd, eccs: ecc, afw: awf,
                feedwater: fwf,
                damage: dmg, protection: prt, pressurizer: pzr,
                boron_ppm: 700, rated_steam_kgs: rated, mdot_rated: 1630, natcirc_frac: 0.15,
                M_nominal: sys.M_total,
                /* stage B1 ctx (the facade supplies these live) */
                load_target_mwe: 100, turbine_tripped: false, condenser_available: true,
                pump_running: true, tavg_rate_c_per_hr: 0 };
    return { ts: TS.buildTrueState(ctx), ctx: ctx, sys: sys, r: r, sr: sr, tr: tr, rr: rr,
             brk: brk, ctr: ctr, cnd: cnd, ecc: ecc, awf: awf, dmg: dmg, prt: prt, pzr: pzr };
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
  /* the live registry is EMPTY since stage B1 completed the contract, so the declared bucket
   * gets a synthetic entry for the duration of this machinery check */
  TS.MISSING.__synthetic_declared__ = { system: 'test', reason: 'machinery check only' };
  var synth = TS.coverage({ pressure_mpa: 15.41 },
                          ['pressure_mpa', '__synthetic_declared__', 'a_field_nobody_declared']);
  delete TS.MISSING.__synthetic_declared__;
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
  /* TURNED AROUND (stage B1, owner ruling "Next: option B"): the shell contract needs every
   * field EMITTED. Spray/fans/recombiners are REGISTERED STATICS — constants stating the
   * systems' absence — and the sump is SUPPLIED from the containment's real tracked mass
   * through a declared display scale (100 % = the whole primary inventory). */
  ck('containment ESF fields are REGISTERED STATICS, and the sump is SUPPLIED from real mass',
     ts.ctmt_spray_active === false && !!TS.STATIC.ctmt_spray_active &&
     ts.containment_sump_pct !== undefined && !TS.STATIC.containment_sump_pct,
     'a static false states the system does not exist; the sump percentage tracks water that ' +
     'is really there');
  /* TURNED AROUND (same rule as the scrammed check below): this asserted the pressurizer was
   * ABSENT ("a level of 0 would be a fabricated TMI trainer") until pwr2_pressurizer.js landed
   * (owner ruling 2026-08-18 "Option 1"). It now guards the repair: a REAL level from the
   * vessel's own split, a REAL earned-false PORV — and it must be earned, so the level has to
   * be plant-sized, not a zero wearing a supplied name. */
  ck('the pressurizer level is SUPPLIED, plant-sized, with an earned-false PORV',
     ts.pzr_level_pct > 20 && ts.pzr_level_pct < 90 && ts.porv_open === false,
     ts.pzr_level_pct !== undefined ? ts.pzr_level_pct.toFixed(1) + ' %, porv_open ' +
     ts.porv_open : 'ABSENT -- the fabricated-trainer worry now points the other way');
  /* ⚠ TURNED AROUND, NOT RE-BANDED. This check used to assert `scrammed` was ABSENT, with the
   * note "reporting 'not scrammed' from an engine with no protection layer is the worst case: it
   * is the reassuring answer, and it is unearned". That was right, and it stopped being right the
   * moment `pwr2_protection.js` landed — a check still asserting the absence would now be
   * asserting the ABSENCE OF THE FIX. When the thing a check pins gets repaired, the check has to
   * be turned around to guard the repair, exactly as run_pwr2_fuel's Doppler-reference check was.
   *
   * The unearned-false worry does not go away, it just moves: a supplied `false` is only worth
   * anything if the field can also be TRUE, so both are checked. */
  ck('scram state is SUPPLIED now, and reads false on a healthy plant',
     ts.scrammed === false && ts.scrammed === B.prt.reactor_trip,
     'supplied-and-false is a MEASUREMENT that no trip function is past its setpoint; absent ' +
     'would mean no protection system, and the two must not read alike');
  var tsTrip = TS.buildTrueState({
    sys: B.sys, reactor: B.r,
    protection: RD.protection.stepProtection(RD.protection.createProtection({}), 5.0,
      { pressure_mpa: 20.0, power_frac: 1.0, flow_frac: 1.0 })
  });
  ck('...and TRUE on a plant past a sourced setpoint, so the false above is earned',
     tsTrip.scrammed === true,
     'driven past the 2425 psia high-pressure trip for longer than its 2.0 s delay, on a context ' +
     'carrying ONLY sys, reactor and protection');

  /* ---- EVERY DECLARED GAP CARRIES ITS REASON ------------------------------------------- */
  head('EVERY DECLARED GAP CARRIES A REASON AND AN OWNER');
  var thin = Object.keys(TS.MISSING).filter(function (f) {
    var m = TS.MISSING[f];
    return !m || !m.system || !m.reason || m.reason.length < 25;
  });
  ck('each MISSING entry names a system and gives a reason', thin.length === 0,
     thin.length ? 'THIN: ' + thin.join(', ') : Object.keys(TS.MISSING).length + ' entries');
  /* TURNED AROUND, not deleted (the protection-block precedent): this check used to pin that
   * the pressurizer gap named #472 as its owner. pwr2_pressurizer.js now exists (owner ruling
   * 2026-08-18 "Option 1"), so the check guards the REPAIR — the level is supplied, it traces
   * to the vessel's own derived split, and the four fields that STAY missing name their own
   * blocking machinery rather than a lane. */
  /* ⚠ THE TRACE IS CHECKED ON AN OFF-DEFAULT VESSEL, deliberately: the build fixture sits at
   * the 61.5 % program point, so a shim fabricating a healthy 61.5 agrees with it EXACTLY and
   * a trace check there is blind by coincidence — the same lesson as the quality/void 40 %
   * fixture. A vessel drained to 40 % separates the reading from the brochure. */
  var pzOff = RD.pressurizer.createPressurizer({ level_frac: 0.40 });
  var pzOffR = RD.pressurizer.stepPressurizer(pzOff, B.sys, 0.02, {});
  var tsOff = TS.buildTrueState({ sys: B.sys, pressurizer: pzOffR });
  ck('pzr_level_pct is SUPPLIED and traces to the pressurizer\'s own split',
     ts.pzr_level_pct !== undefined && Math.abs(ts.pzr_level_pct - B.pzr.level_pct) < 1e-12 &&
     Math.abs(tsOff.pzr_level_pct - pzOffR.level_pct) < 1e-12 && tsOff.pzr_level_pct < 50,
     ts.pzr_level_pct.toFixed(1) + ' % at program, ' + tsOff.pzr_level_pct.toFixed(1) +
     ' % drained -- a fabricated healthy constant reads 61.5 in both and reds');
  /* TURNED AROUND A SECOND TIME (stage 2b): three of the four then-missing fields are real now
   * — the PORV can stick (the TMI-2 failure lever), the block valve isolates it, the tailpipe
   * has a temperature. Only spray_stuck remains declared, and its reason must say WHY it alone
   * survives (no spray failure lever exists). */
  ck('the TMI relief-path fields are SUPPLIED with earned-healthy values',
     ts.porv_stuck === false && ts.block_valve_open === true &&
     typeof ts.porv_tailpipe_temp_c === 'number' && ts.porv_tailpipe_temp_c < 100,
     'stuck ' + ts.porv_stuck + ', block ' + ts.block_valve_open + ', tailpipe ' +
     (typeof ts.porv_tailpipe_temp_c === 'number' ? ts.porv_tailpipe_temp_c.toFixed(0) : '?') +
     ' degC cold on a healthy plant — a PORV that has never passed has a cold pipe');
  ck('...and spray_stuck, the one survivor, is a REGISTERED STATIC that says why',
     ts.spray_stuck === false && !!TS.STATIC.spray_stuck &&
     /no failure lever/.test(TS.STATIC.spray_stuck.reason),
     'a reason that names the machinery outlives a reason that names a lane');

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
  /* THE VOID FIELDS ARE VOID FRACTION, NOT QUALITY (#490, audit #488 E16.1). The rated fixture
   * cannot tell them apart (both read 0 subcooled); a 1.53 % quality core can — it is 8.4 %
   * void by volume at design pressure, and the shipped shim published 0.0153 under the
   * contract's void-fraction name. Reference is independent algebra on Layer 0's saturated
   * volumes, so this reds even if the shim and W.voidFraction go wrong together. */
  var sysQ = S.createPlant({ h: W.h_l(304.5, 15.41), P: 15.41 });
  for (var qv = 0; qv < sysQ.nodes.length; qv++) {
    if (sysQ.nodes[qv].id === 'core') {
      sysQ.nodes[qv].h = W.h_f(15.41) + 0.0153 * (W.h_g(15.41) - W.h_f(15.41));
      break;
    }
  }
  var tsQ = TS.buildTrueState({ sys: sysQ });
  var vfV = 1 / W.rho_l(W.T_sat(15.41), 15.41), vgV = 1 / W.rho_v_sat(15.41);
  var alphaV = 0.0153 * vgV / (0.0153 * vgV + (1 - 0.0153) * vfV);
  ck('core_void_fraction is the VOLUME fraction, not the 1.53 % quality',
     Math.abs(tsQ.core_void_fraction - alphaV) < 1e-9 && tsQ.core_void_fraction > 0.06,
     (100 * tsQ.core_void_fraction).toFixed(2) + ' % against algebra ' +
     (100 * alphaV).toFixed(2) + ' % -- publishing quality reads 1.53 and reds');
  /* steam_dump_valve_pct is the POSITION pwr2_relief reports, not a flow re-derivation. The
   * discriminating fixture is a commanded-open dump with the condenser UNAVAILABLE: the flow is
   * 0 there, so the shipped version — 100*dump_kgs/(rated*0.28), the current engine's capacity
   * constant retyped untagged — read 0 % on a 40 %-open valve (#491, audit #488 E16.2). */
  var rlD = RD.relief.stepRelief(RD.relief.createRelief({}), 6.0, 0.02,
    { rated_steam_kgs: 130, dump_demand: 0.4, condenser_available: false });
  var tsD = TS.buildTrueState({ sys: B.sys, relief: rlD, rated_steam_kgs: 130 });
  ck('steam_dump_valve_pct is the commanded POSITION, not the flow over a retyped capacity',
     Math.abs(tsD.steam_dump_valve_pct - 40) < 1e-9 && rlD.dump_kgs === 0,
     tsD.steam_dump_valve_pct.toFixed(1) + ' % open with the condenser unavailable and 0 kg/s ' +
     'passing -- a flow-derived position reads 0 here and reds');

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
  /* TURNED AROUND (stage B1): discharge = min(dead-head, system P) while running — with flow
   * the discharge sits at the injection point; against a shut check valve it sits at the
   * sourced 9.58 MPa shutoff head. This fixture's sys is at 15.41, so the pump dead-heads. */
  ck('hpi_discharge_pressure_mpa is SUPPLIED: dead-head against a shut check valve here',
     Math.abs(tsLow.hpi_discharge_pressure_mpa - 9.58) < 1e-9 &&
     ts.hpi_discharge_pressure_mpa === 0,
     tsLow.hpi_discharge_pressure_mpa.toFixed(2) + ' MPa injecting-side, 0 on the healthy ' +
     'plant whose pumps are in standby');
  ck('AFW pump-running and flow-normalized are SUPPLIED once a train is lined up',
     ts.afw_pump_running === true && ts.afw_active === true &&
     ts.afw_flow_normalized !== undefined && ts.afw_flow_normalized > 0,
     'normalized=' + ts.afw_flow_normalized.toFixed(3));
  /* THE DEMAND/DELIVERY SPLIT (2026-08-20, the house idiom #200/#329/#332): before it, both
   * keys read total_kgs > 0, so a demanded pump with avail 0 reported SECURED — the
   * de-energization written into the demand, healing itself. */
  ck('a DEMANDED pump with zero availability reads RUNNING with no flow — never SECURED',
     (function () {
       var dead = RD.afw.stepAFW(RD.afw.createAFW({ mdafwRunning: true, mdafwAvail: 0 }), 0.02);
       var t2 = TS.buildTrueState(Object.assign({}, B.ctx, { afw: dead }));
       return t2.afw_pump_running === true && t2.afw_active === false &&
              t2.afw_flow_normalized === 0;
     })(),
     'run light = demand, flow = delivery');
  /* THE #408 CURRENCY (2026-08-21): the contract's CVCS flow fields read gpm / 450,000 —
   * the consumers' literal (board GPM_CHARGING; the CHG FLOW HI annunciator at 8.0e-5 =
   * 36 gpm). The shipped B1 form published kg/s, which read as ~343,000 gpm and stood the
   * annunciator permanently — the finish list's "120 gpm balance" was THIS, not physics. */
  ck('CVCS actual flows are in the #408 currency — the 450,000 literal recovers true gpm',
     (function () {
       var gpmC = B.ctx.cvcs.charging_kgs * 60 * 264.172 / 1000;
       var gpmL = B.ctx.cvcs.letdown_kgs * 60 * 264.172 / 1000;
       return Math.abs(ts.charging_flow_actual * 450000 - gpmC) < 0.05 &&
              Math.abs(ts.letdown_flow_actual * 450000 - gpmL) < 0.05;
     })(),
     'charging reads ' + (ts.charging_flow_actual * 450000).toFixed(1) + ' gpm, letdown ' +
     (ts.letdown_flow_actual * 450000).toFixed(1) + ' gpm on the consumers own conversion');
  ck('...and the normal point sits BELOW the 36 gpm annunciator (the standing CHG FLOW HI cleared)',
     ts.charging_flow_actual < 8.0e-5 && ts.letdown_flow_actual < 8.0e-5,
     'a healthy plant cannot exceed it: max charging is the sourced-scaled 29.4 gpm');

  /* THE FEED REWIRE (2026-08-21): fw_flow used to BE steam_out_total by construction — a
   * half-flow feedwater result must now read ~0.5 while the steam side stays where it is,
   * or the shim is still wearing the retired identity. */
  ck('fw_flow_normalized reads the FEED MODULE, not the steam side (feed ≡ steam retired)',
     (function () {
       var half = { feed_frac: 0.5, demand_frac: 0.5, valve: 0.4, capacity_frac: 1.2,
                    isolated: false, main_feed_lost: false };
       var t3 = TS.buildTrueState(Object.assign({}, B.ctx, { feedwater: half }));
       return Math.abs(t3.condensate_flow_normalized - 0.5) < 1e-9 &&
              t3.fw_flow_normalized > 0.5 &&          /* + the fixture's running AFW train */
              Math.abs(t3.steam_out_total - B.ts.steam_out_total) < 1e-9;
     })(),
     'feed half, steam whole — two different numbers at last');
  ck('afw_blocked is a REGISTERED STATIC; afw_discharge is SUPPLIED at the SG it feeds',
     ts.afw_blocked === false && !!TS.STATIC.afw_blocked &&
     ts.afw_discharge_pressure_mpa !== undefined &&
     Math.abs(ts.afw_discharge_pressure_mpa - Math.min(8.3, ts.steam_pressure_mpa)) < 1e-9,
     ts.afw_discharge_pressure_mpa.toFixed(2) + ' MPa -- the delivering pump sits at the SG ' +
     'pressure it injects against, capped at its [open] 8.3 MPa dead-head');

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
  /* TURNED AROUND (stage B1): a DECLARED HEM PROXY now — D4 sec 8 UPHELD this field as a
   * proxy, meaning A/B divergence here is predicted, not feared. The homogeneous model has no
   * free surface; sustained high core void is the nearest honest stand-in, and the earned pair
   * below proves it can read nonzero. */
  ck('core_uncovered_frac is SUPPLIED as the declared HEM proxy: zero on a covered core',
     ts.core_uncovered_frac === 0, 'void ' + (ts.core_void_fraction * 100).toFixed(1) + ' %');
  var sysVoid = { P: 7.0, M_total: 1, expansion: [], simTime: 0,
    nodes: B.sys.nodes.map(function (n) {
      return { id: n.id, V: n.V, h: n.id === 'core' ? RD.water.h_g(7.0) - 50 : n.h };
    }), mdot_loop: B.sys.mdot_loop };
  var tsVoid = TS.buildTrueState({ sys: sysVoid });
  ck('...and reads NONZERO on a high-void core, so the zero above is earned',
     tsVoid.core_uncovered_frac > 0 && tsVoid.core_uncovered_frac <= 1,
     (tsVoid.core_uncovered_frac * 100).toFixed(0) + ' % at near-saturated-steam core enthalpy');

  /* ---- THE DECLARED SIMPLIFICATION IS VISIBLE ------------------------------------------ */
  head('THE ONE-PRESSURE SIMPLIFICATION IS VISIBLE, NOT HIDDEN');
  ck('hot, cold and suction pressures are the SAME number',
     ts.p_hotleg === ts.p_coldleg && ts.p_coldleg === ts.p_pumpsuction,
     'Layer 3 carries one system pressure; three fields agreeing exactly is the honest ' +
     'presentation of that, not three measurements that happen to coincide');

  /* ---- STAGE B1: THE CONTRACT COMPLETED, AND THE STATICS REGISTRY -------------------------- */
  head('THE STATICS REGISTRY  [a constant that states the model\'s truth, never a faked gauge]');
  var statThin = Object.keys(TS.STATIC).filter(function (f) {
    var e = TS.STATIC[f];
    return !e || !e.system || !e.reason || e.reason.length < 25;
  });
  ck('every STATIC names its system and carries a real reason', statThin.length === 0,
     statThin.length ? 'THIN: ' + statThin.join(', ')
                     : Object.keys(TS.STATIC).length + ' statics registered');
  var statDrift = Object.keys(TS.STATIC).filter(function (f) { return ts[f] !== TS.STATIC[f].value; });
  ck('every registered static is EMITTED at exactly its registered value', statDrift.length === 0,
     statDrift.length ? 'DRIFTED: ' + statDrift.join(', ') : '');
  /* statics must NOT move when the plant does — compared across the healthy fixture and the
   * wrecked/voided ones already built above */
  var statMoved = Object.keys(TS.STATIC).filter(function (f) {
    return tsHot[f] !== ts[f] || tsVoid[f] !== ts[f];
  });
  ck('no static moves when the plant does -- across healthy, wrecked and voided fixtures',
     statMoved.length === 0, statMoved.length ? 'MOVED: ' + statMoved.join(', ') : '');
  var statOffContract = Object.keys(TS.STATIC).filter(function (f) {
    return CONTRACT.indexOf(f) < 0;
  });
  ck('every registered static IS a contract field -- a static for a name nobody documented is dead',
     statOffContract.length === 0,
     statOffContract.length ? 'OFF-CONTRACT: ' + statOffContract.join(', ') : '');
  ck('coverage() reports the statics as their own view of supplied',
     cov.statics.length === Object.keys(TS.STATIC).length - statOffContract.length &&
     cov.statics.every(function (f) { return cov.supplied.indexOf(f) >= 0; }),
     cov.statics.length + ' statics inside supplied');

  head('B1 DERIVATIONS  [adopted gauge scales over real state, each earned both ways]');
  ck('SG level lands at the plant\'s own nominal through the ADOPTED sourced map',
     ts.sg_level_pct > 57 && ts.sg_level_pct < 73 && ts.sg_level_wide_pct > 50 &&
     ts.sg_level_wide_pct < 70,
     ts.sg_level_pct.toFixed(1) + ' % narrow / ' + ts.sg_level_wide_pct.toFixed(1) +
     ' % wide -- the same Ginna 85,359 lbm nominal both engines, so the same 65 % indication');
  var tsDrySG = TS.buildTrueState({ sys: B.sys, sg: { mass_frac: 0.5 } });
  ck('...and a half-drained SG READS drained through the same map, so the map is live',
     tsDrySG.sg_level_wide_pct > 30 && tsDrySG.sg_level_wide_pct < 42 &&
     tsDrySG.sg_level_pct < 20,
     tsDrySG.sg_level_wide_pct.toFixed(1) + ' % wide / ' + tsDrySG.sg_level_pct.toFixed(1) +
     ' % narrow at half mass');
  ck('plant mode reads At Power on the healthy fixture and Hot Standby past a trip',
     ts.plant_mode === 1 && /At Power/.test(ts.plant_mode_name) && tsTrip.plant_mode === 3,
     'mode ' + ts.plant_mode + ' / ' + tsTrip.plant_mode + ' -- the two modes this engine has');
  ck('the SR channel is DE-ENERGIZED at power and the IR reads its adopted scale',
     ts.sr_energized === false && ts.sr_counts_cps === 0 &&
     Math.abs(ts.ir_amps - 8.333e-3 * ts.power_pct / 100) < 1e-9,
     'SR protected above the P-6 class point; IR ' + ts.ir_amps.toExponential(2) + ' A tracks ' +
     ts.power_pct.toFixed(0) + ' % through the adopted k_ir');
  ck('the governor IS the steam demand and the stop valve is the trip',
     ts.governor_valve_pct > 90 && ts.stop_valve_pct === 100,
     'governor ' + ts.governor_valve_pct.toFixed(1) + ' %, stop 100 -- and a tripped turbine ' +
     'would read 0/0 (the facade gate rides that path)');
  var tsSump = TS.buildTrueState({ sys: B.sys,
    containment: { m_sump_kg: 0.3 * B.sys.M_total, m_air: 3.0e5, m_vapour_kg: 100 },
    M_nominal: B.sys.M_total });
  ck('the sump percentage MOVES with the containment\'s tracked water, on its declared ruler',
     Math.abs(tsSump.containment_sump_pct - 30) < 1e-9 && ts.containment_sump_pct < 1,
     tsSump.containment_sump_pct.toFixed(1) + ' % with 30 % of the primary inventory down, ' +
     ts.containment_sump_pct.toExponential(1) + ' % healthy');
  ck('hydrogen is the DAMAGE MODEL\'s own oxidation through mole-fraction arithmetic',
     ts.ctmt_h2_pct !== undefined && ts.ctmt_h2_pct >= 0 && ts.ctmt_h2_pct < 0.01 &&
     tsHot.ctmt_h2_pct === undefined,
     ts.ctmt_h2_pct.toExponential(2) + ' % healthy; the wrecked fixture carries no ' +
     'containment ctx, so its H2 is honestly ABSENT there rather than defaulted');

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
  ['the CVCS currency conversion is dropped (kg/s published as the #408 fraction again)',
   "    put('charging_flow_actual', cv.charging_kgs * FRAC_PER_KGS);",
   "    put('charging_flow_actual', cv.charging_kgs);"],
  ['a static drifts from its registered value (the registry lies about what is emitted)',
   "    Object.keys(STATIC).forEach(function (sf) { ts[sf] = STATIC[sf].value; });",
   "    Object.keys(STATIC).forEach(function (sf) { ts[sf] = STATIC[sf].value; });\n    ts.msiv_open = false;"],
  ['the SG level map is DELETED (a drained SG reads the healthy nominal)',
   "      put('sg_level_wide_pct', clip(wide, 0, 100));",
   "      put('sg_level_wide_pct', 59.25);"],
  ['the core-uncovery proxy is pinned to zero (an uncovered core reads covered)',
   "    put('core_uncovered_frac', clip((aCore - 0.5) / 0.5, 0, 1));",
   "    put('core_uncovered_frac', 0);"],
  ['the sump reads a constant instead of the tracked mass',
   "      put('containment_sump_pct', clip(100 * ct.m_sump_kg / ctx.M_nominal, 0, 100));",
   "      put('containment_sump_pct', 0);"],

  ['scram state is never wired through, so a tripped plant reads as no protection system',
   "    put('scrammed', pt.reactor_trip);", ''],
  ['scram state is fabricated as FALSE rather than read from the protection system',
   "    put('scrammed', pt.reactor_trip);", "    put('scrammed', false);"],
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
  /* RETIRED (stage B1): core_uncovered_frac is SUPPLIED as a declared HEM proxy now; the
   * stale-reason discipline this mutation guarded lives on in the proxy-pinned-zero mutation
   * above, which is caught. */
  /* RETIRED AS A PROVEN NO-OP (stage B1, this gate's own house precedent): the MISSING
   * registry is empty since the contract completed, so fabricating "every declared gap"
   * fabricates nothing and the mutation can never red. The discipline it guarded — a constant
   * wearing a supplied name — is carried by the static-drift, proxy-pinned-zero, SG-map and
   * sump mutations, each of which is caught. */
  /* RETIRED, not lost: the mutation here injected `ts.scrammed = false` right after the first
   * put, pinning "do not fabricate a scram from an engine with no protection layer". There IS
   * a protection layer now and the real assignment happens LATER, overwriting the injection —
   * so the mutation became a NO-OP that still reported as caught. That is a mutation testing
   * nothing while looking like coverage, which is the thing this file's own header warns
   * about. Its intent is carried by the two scram mutations above, which fabricate at the
   * real assignment site instead. */
  /* RETARGETED #507 wave 4: this mutation pinned the 'electrical' declareStatic, which
   * retired when ac_available/station_blackout went live — the same thin-reason class now
   * rides the surviving MSIV static. */
  ['a STATIC loses its reason (the registry stops saying why a constant is honest)',
   "  declareStatic('steam lines', 'no MSIV model — the line is genuinely always open',",
   "  declareStatic('steam lines', 'x',"],
  /* RETARGETED 2026-08-18: this mutation used to blank the "#472 owns it" lane attribution,
   * whose anchor text left with the old declared-missing block when pwr2_pressurizer.js landed.
   * The same failure class now lives in the SUPPLIED side: a level published as a constant
   * instead of read from the vessel's own split. */
  ['pzr_level_pct is fabricated as a healthy constant instead of read from the vessel',
   "    put('pzr_level_pct',     pz.level_pct);",
   "    put('pzr_level_pct',     61.5);"],
  ['coverage() counts DECLARED gaps as supplied, inflating the fraction',
   '      if (ts[f] !== undefined) {',
   '      if (ts[f] !== undefined || MISSING[f]) {'],
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
