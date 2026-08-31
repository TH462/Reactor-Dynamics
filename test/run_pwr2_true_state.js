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
   * has a temperature. AND A THIRD TIME (#507 wave 6): spray_stick is a real lever, so the
   * last survivor's static retired too — the check turned around AGAIN to guard the repair. */
  ck('the TMI relief-path fields are SUPPLIED with earned-healthy values',
     ts.porv_stuck === false && ts.block_valve_open === true &&
     typeof ts.porv_tailpipe_temp_c === 'number' && ts.porv_tailpipe_temp_c < 100,
     'stuck ' + ts.porv_stuck + ', block ' + ts.block_valve_open + ', tailpipe ' +
     (typeof ts.porv_tailpipe_temp_c === 'number' ? ts.porv_tailpipe_temp_c.toFixed(0) : '?') +
     ' degC cold on a healthy plant — a PORV that has never passed has a cold pipe');
  ck('...and spray_stuck is LIVE (#507 wave 6): false from the vessel, TRUE through a stuck ' +
     'valve, and no longer in the statics registry',
     ts.spray_stuck === false && TS.STATIC.spray_stuck === undefined &&
     (function () {
       var rStk = RD.pressurizer.stepPressurizer(RD.pressurizer.createPressurizer({}), B.sys,
                                                 0.02, { spray_stick: true });
       var tStk = TS.buildTrueState(Object.assign({}, B.ctx, { pressurizer: rStk }));
       return tStk.spray_stuck === true;
     })(),
     'the field follows the lever, not a registered constant');

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
  /* #550: the SHARED #408 currency (inventory-frac/s), same conversion as the CVCS flows —
   * the raw-kg/s form this check used to PIN pegged the [0, 0.06] instrument at top of
   * scale for every injectable break (27,000 gpm for a 2.4 gpm seal leak). Reds on it. */
  ck('leak_flow is the break\'s own discharge in the SHARED currency (frac/s, not kg/s)',
     Math.abs(ts.leak_flow - B.brk.mdot_kgs * (60 * 264.172 / 1000 / 450000)) < 1e-15 &&
     ts.leak_flow > 0,
     (ts.leak_flow * 450000).toFixed(1) + ' gpm from ' + B.brk.mdot_kgs.toFixed(3) +
     ' kg/s -- a small leak at full power, on the instrument\'s own scale');
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
  ck('afw_blocked is LIVE (#507 wave 6: the TMI-2 tagged-shut valves are real state); ' +
     'afw_discharge is SUPPLIED at the SG it feeds',
     ts.afw_blocked === false && TS.STATIC.afw_blocked === undefined &&
     (function () {
       var blk = RD.afw.stepAFW(RD.afw.createAFW({ mdafwRunning: true, blocked: true }), 0.02);
       var tB = TS.buildTrueState(Object.assign({}, B.ctx, { afw: blk }));
       return tB.afw_blocked === true && tB.afw_active === false && tB.afw_pump_running === true;
     })() &&
     ts.afw_discharge_pressure_mpa !== undefined &&
     Math.abs(ts.afw_discharge_pressure_mpa - Math.min(8.3, ts.steam_pressure_mpa)) < 1e-9,
     ts.afw_discharge_pressure_mpa.toFixed(2) + ' MPa -- and a blocked system reads RUNNING, ' +
     'not delivering, blocked: the three facts separated');

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

  /* ---- SUPERHEAT: THE PROXY NO LONGER SATURATES (#517) --------------------------------------
   * The defect this pair pins is not that the proxy was wrong — it is that it STOPPED CARRYING
   * INFORMATION. Measured on a 5 cm2 unmitigated break: `core_uncovered_frac` reached 100 % at
   * 580 s and then reported the identical number for 1,220 s, while the core dried from 0 to
   * 131 degC of superheat and the clad climbed 555 -> 677 degF. Two cores 200 kJ/kg apart in
   * dryness are the same reading to every consumer, which is what the drying half fixes. */
  head('SUPERHEAT  [void clips at 1; above h_g this is the only quantity that still moves]');
  function coreAt(h, P) {
    return TS.buildTrueState({ sys: { P: P, M_total: 1, expansion: [], simTime: 0,
      nodes: B.sys.nodes.map(function (n) {
        return { id: n.id, V: n.V, h: n.id === 'core' ? h : n.h };
      }), mdot_loop: B.sys.mdot_loop } });
  }
  var P517 = 226 / 145.038;                       /* the measured plateau, 226 psia */
  var tsWet = coreAt(RD.water.h_f(P517) + 10, P517);
  var tsDry = coreAt(RD.water.h_g(P517) + 5, P517);
  var tsDrier = coreAt(RD.water.h_g(P517) + 298, P517);   /* the ride's own plateau, h = 3090 */
  ck('core_superheat_c is 0 on a two-phase core — 0 through every normal evolution',
     tsWet.core_superheat_c === 0 && ts.core_superheat_c === 0,
     'two-phase ' + tsWet.core_superheat_c + ', at-power ' + ts.core_superheat_c);
  /* RE-ANCHORED TO THE SOURCE, 2026-08-29 (#586), AND THAT IS THE POINT OF THE CHANGE. This
   * asserted `128 +/- 3` — the model's OWN output when the check was written, which is the
   * trap HR10 names: a check written from observed behaviour can only confirm that behaviour,
   * including its error. The #586 vapour refit moved it to 123.3 and this check went red for
   * being RIGHT. IAPWS-95 (NIST SRD 69, fetched 2026-08-29): h = 3090 kJ/kg at 1.5582 MPa is
   * 324.07 degC, T_sat is 200.29, so the TRUE superheat is 123.78 degC. The old fit was 4.2
   * degC out; the refit is 0.5. The band is now +/- 3 degC around the SOURCED value, so it
   * fails if the library drifts away from IAPWS rather than away from its old self. */
  ck('...and reads the SOURCED plateau on a dry one (IAPWS-95, not the model\'s own old output)',
     Math.abs(tsDrier.core_superheat_c - 123.78) < 3,
     tsDrier.core_superheat_c.toFixed(1) + ' degC at h = 3090, 226 psia — IAPWS-95 says 123.78 ' +
     '(324.07 degC less T_sat 200.29); the pre-#586 fit read 128, 4.2 degC out');
  /* THE BLIND SPOT, ASSERTED DIRECTLY — void is identical at both dryness levels. Without this
   * the check above could pass against a field nothing needed. */
  ck('void_fraction is IDENTICAL at both, so superheat is the only discriminator',
     tsDry.core_void_fraction === 1 && tsDrier.core_void_fraction === 1 &&
     tsDrier.core_superheat_c - tsDry.core_superheat_c > 100,
     'void 1.0 both; superheat ' + tsDry.core_superheat_c.toFixed(0) + ' -> ' +
     tsDrier.core_superheat_c.toFixed(0) + ' degC');
  ck('...and core_uncovered_frac SEPARATES them instead of pinning at 100 %',
     tsDrier.core_uncovered_frac > tsDry.core_uncovered_frac &&
     tsDrier.core_uncovered_frac <= 1 && tsDry.core_uncovered_frac >= 0.9,
     (tsDry.core_uncovered_frac * 100).toFixed(1) + ' % -> ' +
     (tsDrier.core_uncovered_frac * 100).toFixed(1) + ' % — both were 100.0 % before #517');

  /* ---- THE HELD PLANT SAYS SO (#517) --------------------------------------------------------
   * `sys.beyond_model` lived on `sys` and NOTHING published it: no true_state key matched, and
   * `grep beyond_model ui layers` returned zero hits. The player got a plausible, internally
   * consistent, completely static plant that went on accepting commands — 160 minutes of it on
   * the TMI ride. A simulator that has stopped simulating must say so. */
  head('THE HELD PLANT  [a frozen model that reports itself running is the worst case]');
  ck('a running plant reports model_held false with reason "none"',
     ts.model_held === false && ts.model_held_why === 'none',
     'and "none" rather than null, because `put` drops null and the field would vanish');
  var tsHeld = TS.buildTrueState({ sys: B.sys, beyond_model: true,
                                   held_why: 'floor guard: pinned at 0.1 MPa' });
  ck('...and a held plant reports model_held true, carrying the CAUSE',
     tsHeld.model_held === true && /floor guard/.test(tsHeld.model_held_why),
     tsHeld.model_held_why);
  ck('...with the reason still present when the caller supplies none',
     TS.buildTrueState({ sys: B.sys, beyond_model: true }).model_held_why === 'none',
     'a held plant with no stated cause is still HELD — the flag never depends on the string');

  /* ---- THE COLD LEG HAS A VOID TOO (#516 item 7) --------------------------------------------
   * The hot leg published one and the cold leg did not, which left every consumer unable to tell
   * the two apart once the loop saturated — and once it does, TEMPERATURE cannot: both legs sit
   * at T_sat(P) by definition. Measured on a 20 cm2 break, `thot` and `tcold` are equal to the
   * decimal for the whole ride while the legs differ by up to 0.35 in quality. */
  head('THE COLD-LEG VOID  [once the loop saturates, temperature stops telling the legs apart]');
  ck('the cold leg publishes its own void fraction, beside the hot leg it always had',
     typeof ts.cold_leg_void_fraction === 'number' && isFinite(ts.cold_leg_void_fraction) &&
     typeof ts.primary_void_fraction === 'number',
     'cold ' + ts.cold_leg_void_fraction + ', hot ' + ts.primary_void_fraction);
  /* THE DISCRIMINATOR: it must read the COLD leg's node, not echo the hot one. Built by voiding
   * one leg and not the other, so a copy-paste that publishes the hot value twice reddens. */
  var sysCV = JSON.parse(JSON.stringify(B.sys));
  (function () {
    var Wv = RD.water, P = sysCV.P;
    for (var i = 0; i < sysCV.nodes.length; i++)
      if (sysCV.nodes[i].id === 'hot_leg') sysCV.nodes[i].h = Wv.h_g(P);   /* hot leg all vapour */
  })();
  var tsCV = TS.buildTrueState({ sys: sysCV });
  ck('...and it reads the COLD leg, not a second copy of the hot one',
     tsCV.primary_void_fraction > 0.5 && tsCV.cold_leg_void_fraction < 0.5,
     'hot leg voided to ' + tsCV.primary_void_fraction.toFixed(3) +
     ' while the cold leg stays at ' + tsCV.cold_leg_void_fraction.toFixed(3));

  /* ---- WHICH SIDE OF THE VALIDATED RANGE (#516 item 9) --------------------------------------
   * Layer 0 carries a SOURCED ideal-gas branch above IAPWS-95's 1000 degC limit so the
   * core-damage chain can run to its own end. That branch is DECLARED, not validated, and the
   * difference has to reach the player — the same argument `model_held` above rests on, one step
   * further out. Published rather than merely defined, because a `waterRegime()` with no consumer
   * is `wallLumps` again. */
  head('THE WATER REGIME  [an extension the player is not told about is a quiet softening]');
  ck('a normal plant reports water_regime "ok" — every node inside the validated range',
     ts.water_regime === 'ok', 'got "' + ts.water_regime + '"');
  /* A node ON the extension: h above the validated ceiling but below the extended one. Built
   * from Layer 0's own limits rather than a typed enthalpy, so it tracks a moved boundary. */
  var Wq = RD.water, Pq = B.sys.P;
  var hExt = 0.5 * (Wq.h_v(Wq.LIMITS.TV_MAX, Pq) + Wq.h_v(Wq.LIMITS.TV_EXT_MAX, Pq));
  var sysExt = JSON.parse(JSON.stringify(B.sys));
  sysExt.nodes[0].h = hExt;
  ck('...and ONE node out on the sourced ideal-gas branch reports "extended"',
     TS.buildTrueState({ sys: sysExt }).water_regime === 'extended',
     'node 0 at ' + hExt.toFixed(0) + ' kJ/kg, between the validated ' +
     Wq.LIMITS.TV_MAX + ' degC ceiling and the ' + Wq.LIMITS.TV_EXT_MAX + ' degC extension');

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
     'mode ' + ts.plant_mode + ' / ' + tsTrip.plant_mode);
  /* the LADDER's cold rungs (#507 wave 10): Mode 4 to 350 degF, Mode 5 below 200 degF —
   * the Mode 5 rung exists for the day Layer 0 extends below its 0.1 MPa floor */
  var W2m = globalThis.RD.pwr2.water;
  var tsM4 = TS.buildTrueState({ sys: globalThis.RD.pwr2.sources.createPlant(
    { h: W2m.h_l(120, 2.5), P: 2.5 }) });
  var tsM5 = TS.buildTrueState({ sys: globalThis.RD.pwr2.sources.createPlant(
    { h: W2m.h_l(80, 1.0), P: 1.0 }) });
  ck('...and the cold rungs read by Tavg: 248 degF is Mode 4 Hot Shutdown, 176 degF is ' +
     'Mode 5 Cold Shutdown',
     tsM4.plant_mode === 4 && /Hot Shutdown/.test(tsM4.plant_mode_name) &&
     tsM5.plant_mode === 5 && /Cold Shutdown/.test(tsM5.plant_mode_name),
     tsM4.plant_mode + '/' + tsM5.plant_mode);
  ck('the SR channel is DE-ENERGIZED at power and the IR reads its adopted scale',
     ts.sr_energized === false && ts.sr_counts_cps === 0 &&
     Math.abs(ts.ir_amps - 8.333e-3 * ts.power_pct / 100) < 1e-9,
     'SR protected above the P-6 class point; IR ' + ts.ir_amps.toExponential(2) + ' A tracks ' +
     ts.power_pct.toFixed(0) + ' % through the adopted k_ir');
  /* ---- THE SOURCE-RANGE SCALE IS THIS PLANT'S, NOT THE RETIRED PLANT'S (#536) -------------
   * k_sr was 5.0e8, inherited from `pwr_config`'s nis block where it had been sized against a
   * subcritical level that engine produced with a 500x-inflated prompt generation time. PWR2
   * runs the real Lambda, so its source-held level is ~500x lower and the SAME scale read the
   * shutdown plant at 0.5 cps, pinned on a display floor. Re-anchored so hot standby reads the
   * "~500 cps class at HZP source equilibrium" that `Manuals/09` §9.0 already documents.
   * The two levels below are MEASURED off the engine (pwr2_engine, 2026-08-28), not invented. */
  var HZP_FRAC = 1.9325e-9;      /* hot standby, -1137.2 pcm  */
  var TRIP_FRAC = 3.4068e-10;    /* settled post-trip, -6450 pcm */
  function atFlux(frac) {
    return TS.buildTrueState(Object.assign({}, B.ctx, {
      reactor: Object.assign({}, B.r, { power_pct: frac * 100 }) }));
  }
  var tsHZP = atFlux(HZP_FRAC), tsTripped = atFlux(TRIP_FRAC);
  ck('the shutdown plant indicates in the hundreds of counts per second, as the manual says',
     tsHZP.sr_energized === true && tsHZP.sr_counts_cps > 300 && tsHZP.sr_counts_cps < 1000,
     tsHZP.sr_counts_cps.toFixed(0) + ' cps at the hot-standby source level — the retired ' +
     'plant\'s k_sr read this plant 0.5 cps there');
  /* A FLOOR IS INVISIBLE UNTIL SOMETHING SITS UNDER IT, which is why this compares two levels
   * rather than checking one. Both channels carried Math.max(pFrac, 1e-9): under it every
   * reading collapses to the same number and the gauge stops carrying information. */
  ck('there is NO display floor — a deeper-subcritical plant reads LOWER, in exact proportion',
     Math.abs((tsTripped.sr_counts_cps / tsHZP.sr_counts_cps) / (TRIP_FRAC / HZP_FRAC) - 1) < 1e-9 &&
     Math.abs((tsTripped.ir_amps / tsHZP.ir_amps) / (TRIP_FRAC / HZP_FRAC) - 1) < 1e-9,
     'settled post-trip reads ' + tsTripped.sr_counts_cps.toFixed(0) + ' cps / ' +
     tsTripped.ir_amps.toExponential(2) + ' A against hot standby\'s ' +
     tsHZP.sr_counts_cps.toFixed(0) + ' / ' + tsHZP.ir_amps.toExponential(2) +
     ' — the floor pinned both at 0.5 cps and 8.3e-12 A');
  /* THE TEST THAT PICKED THE SOURCE STRENGTH, asserted rather than left in a comment: the
   * SOURCED P-6 permissive (5e-11 A, Ginna TS Bases; PWR2_VALIDATION §34) must be UNMET on a
   * plant at hot standby and met partway up the approach — which is where a real startup meets
   * it. A stronger installed source puts the plant over P-6 before the operator touches a rod. */
  ck('the sourced P-6 permissive is UNMET at hot standby and comes in during the approach',
     tsHZP.ir_amps < 5.0e-11 && atFlux(2.19e-8).ir_amps > 5.0e-11,
     tsHZP.ir_amps.toExponential(2) + ' A at hot standby, ' +
     atFlux(2.19e-8).ir_amps.toExponential(2) + ' A at -100 pcm, against P-6 at 5.0e-11 A');
  /* THE SECURING CUE IS THE SETPOINT, NOT A POWER LITERAL. `Manuals/03` §4.3: "Secure SR during
   * power rise BEFORE SR high-flux trip (1e5 cps)". Written against 1e5 the rule survives a
   * scale change; written as `pFrac < 1e-3` — what it was — it silently became four decades
   * past the gauge's own 1e6 range top the moment k_sr moved. */
  ck('the SR de-energizes at its own 1e5 cps cue, so the rule cannot drift from the scale again',
     atFlux(3.8e-7).sr_energized === true && atFlux(3.9e-7).sr_energized === false,
     'live at ' + atFlux(3.8e-7).sr_counts_cps.toExponential(2) + ' cps, secured just ' +
     'past 1e5 — a `pFrac < 1e-3` rule would have kept indicating to 2.6e8 cps');
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
  /* #516 item 7: the cold-leg void becomes a second copy of the hot leg's, so the two legs stop
   * being distinguishable in the one quantity that still separates them once the loop is
   * saturated and temperature no longer can. */
  ['the cold-leg void echoes the HOT leg (the legs stop being distinguishable)',
   "put('cold_leg_void_fraction', nodeAlpha(nd, sys.P, 'cold_leg'));",
   "put('cold_leg_void_fraction', nodeAlpha(nd, sys.P, 'hot_leg'));"],
  /* #516 item 9: the regime reporter goes back to scanning the KEYED lookup, whose `.length` is
   * undefined — so the loop runs zero times and every plant reports 'ok'. This is the defect the
   * check caught on its first outing, and it is the dangerous shape: a reporter that always says
   * "fine" is indistinguishable from a plant that is. */
  ['the water-regime scan iterates the keyed lookup (zero times) — every plant reads "ok"',
   'for (var i = 0; i < sys.nodes.length; i++) {',
   'for (var i = 0; i < nd.length; i++) {'],
  /* ---- THE NIS GAUGE SCALES (#536) ---- */
  ['k_sr reverts to the RETIRED plant\'s scale (the shutdown board reads half a count)',
   '    var K_SR = 2.6e11;', '    var K_SR = 5.0e8;'],
  ['the display floors come back (every deeply subcritical state reads the same number)',
   "    put('sr_counts_cps', srOn ? K_SR * pFrac : 0);\n    put('ir_amps',       K_IR * pFrac);",
   "    put('sr_counts_cps', srOn ? K_SR * Math.max(pFrac, 1e-9) : 0);\n" +
   "    put('ir_amps',       K_IR * Math.max(pFrac, 1e-9));"],
  ['the SR securing cue goes back to a power literal instead of its own setpoint',
   '    var srOn = pFrac * K_SR < SR_SECURE_CPS;', '    var srOn = pFrac < 1e-3;'],
  ['k_ir drifts, moving the SOURCED intermediate-range rod stop with it',
   '    var K_IR = 8.333e-3;', '    var K_IR = 4.0e-3;'],
  ['the CVCS currency conversion is dropped (kg/s published as the #408 fraction again)',
   "    put('charging_flow_actual', cv.charging_kgs * FRAC_PER_KGS);",
   "    put('charging_flow_actual', cv.charging_kgs);"],
  ['the LEAK currency conversion is dropped (#550 — the gauge pegs at 27,000 gpm for any break)',
   "    put('leak_flow', (br.mdot_kgs || 0) * FRAC_PER_KGS);",
   "    put('leak_flow', br.mdot_kgs || 0);"],
  /* RETARGETED at #511: the drift target used to be msiv_open, which is a LIVE field now —
   * the drift moves to a SURVIVING static (the single-SG imbalance constant). */
  ['a static drifts from its registered value (the registry lies about what is emitted)',
   "    Object.keys(STATIC).forEach(function (sf) { ts[sf] = STATIC[sf].value; });",
   "    Object.keys(STATIC).forEach(function (sf) { ts[sf] = STATIC[sf].value; });\n    ts.sg_imbalance_active = true;"],
  ['the SG level map is DELETED (a drained SG reads the healthy nominal)',
   "      put('sg_level_wide_pct', clip(wide, 0, 100));",
   "      put('sg_level_wide_pct', 59.25);"],
  ['the core-uncovery proxy is pinned to zero (an uncovered core reads covered)',
   "    put('core_uncovered_frac',\n        clip(0.9 * (aCore - 0.5) / 0.5, 0, 0.9) + clip(0.1 * shCore / 150, 0, 0.1));",
   "    put('core_uncovered_frac', 0);"],
  /* ---- #517, the superheat wing + the held plant ---- */
  ['the uncovery proxy SATURATES again — the drying half deleted (the pre-#517 blind spot)',
   "clip(0.9 * (aCore - 0.5) / 0.5, 0, 0.9) + clip(0.1 * shCore / 150, 0, 0.1));",
   "clip((aCore - 0.5) / 0.5, 0, 1));"],
  ['core_superheat_c always reports 0 (void 1 is all a consumer can ever see)',
   "      return n ? W.superheat_c(n.h, sys.P) : undefined;",
   "      return n ? 0 : undefined;"],
  ['core_superheat_c reads the HOT LEG, not the core',
   "      var n = nd.core;\n      return n ? W.superheat_c(n.h, sys.P) : undefined;",
   "      var n = nd.hot_leg;\n      return n ? W.superheat_c(n.h, sys.P) : undefined;"],
  ['model_held is hard-wired false — a frozen plant reports itself running',
   "    put('model_held', ctx.beyond_model === true);",
   "    put('model_held', false);"],
  ['model_held_why goes back to null, which `put` DROPS (the field vanishes)',
   "    put('model_held_why', ctx.held_why || 'none');",
   "    put('model_held_why', ctx.held_why || null);"],
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
  /* RE-ANCHORED at #511: the 'steam lines' static retired with the MSIV build — the same
   * mutation now blanks a surviving static's reason. */
  ['a STATIC loses its reason (the registry stops saying why a constant is honest)',
   "  declareStatic('secondary', 'a single-SG plant cannot have an SG imbalance',",
   "  declareStatic('secondary', 'x',"],
  /* RETARGETED 2026-08-18: this mutation used to blank the "#472 owns it" lane attribution,
   * whose anchor text left with the old declared-missing block when pwr2_pressurizer.js landed.
   * The same failure class now lives in the SUPPLIED side: a level published as a constant
   * instead of read from the vessel's own split. */
  ['pzr_level_pct is fabricated as a healthy constant instead of read from the vessel',
   "    put('pzr_level_pct',     pz.level_pct);",
   "    put('pzr_level_pct',     61.5);"],
  ['the Mode 4 rung is deleted (a 250 degF shutdown plant reads Hot Standby) -- #507 wave 10',
   "             : (typeof tvM === 'number' && tvM < 176.7) ? 4\n             : 3;",
   '             : 3;'],
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
