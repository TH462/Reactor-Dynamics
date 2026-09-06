/* run_pwr2_dumpctl.js — Layer 5 gate: the steam dump control system (built 2026-08-19 against
 * the ruled §42 criterion A).
 *
 * WHAT THIS GATE PINS: the sourced constants against independent literals (WTSM 11.2 deadband
 * and interlock thresholds, WAT 05 output bands); the Tref program's endpoints; each of the
 * three controllers at its own actuation arithmetic through a stub; the C-7 detector on BOTH
 * sides of both thresholds — an exact 10 % step must NOT arm (the source's "greater than"),
 * 12 % must, a 4 %/min sustained ramp must not, 6 %/min must — because C-7 staying quiet on
 * dispatch moves IS criterion A's mechanism; C-8's auto-selection and self-arming; C-9
 * blocking actuation while the controller output stays visible (the WAT 05 indication lesson);
 * and the pressure mode arming by selection.
 *
 * The plant-coupled acceptance (the criterion-A sweep, the 50 % rejection, the turbine trip)
 * lives in run_pwr2_loadfollow, where the full plant already is.
 *
 * Run: node test/run_pwr2_dumpctl.js
 */
'use strict';
var path = require('path');
var MUT = require('./mut_flags.js');   /* --no-mutations / --mut= / --grp= (#602) */
var SRC = path.join(__dirname, '..', 'engines', 'pwr2');
var fs = require('fs');

function loadAll(dcSource) {
  /* pwr2_water + pwr2_vtable stay CACHED across replays (#513): never this gate's
   * mutation target, and a re-execute discards the vtable's lazily-built ~0.5 s GRID
   * per replay — see run_pwr2_engine.js's loadAll for the full note. The plain
   * require is a no-op once loaded, which is the point. */
  ['pwr2_water', 'pwr2_vtable'].forEach(function (f) {
    require(path.join(SRC, f + '.js'));
  });
  if (dcSource === undefined) {
    delete require.cache[require.resolve(path.join(SRC, 'pwr2_dumpctl.js'))];
    require(path.join(SRC, 'pwr2_dumpctl.js'));
  } else {
    (0, eval)(dcSource);
  }
  return globalThis.RD.pwr2;
}

function runSuite(RD, rec, quiet) {
  var DC = RD.dumpctl;
  var DT = 0.02;

  function ck(name, got, want, tol, unit) {
    var d = Math.abs(got - want), ok = d <= tol && isFinite(got);
    rec.push({ name: name, ok: ok });
    if (!quiet) console.log((ok ? '  PASS  ' : '  FAIL  ') + name.padEnd(58) +
      'got ' + (typeof got === 'number' ? got.toFixed(4) : got) + ' want ' + want +
      ' (tol ' + tol + ') ' + (unit || ''));
  }
  function ckT(name, cond, note) {
    rec.push({ name: name, ok: !!cond });
    if (!quiet) console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (note ? '  -- ' + note : ''));
  }
  function head(s) { if (!quiet) console.log('\n' + s); }

  /* drive the controller with a load SCHEDULE for `secs`, everything else steady */
  function drive(dc, secs, loadOf, extra) {
    var r = null, t = 0;
    for (var i = 0; i < secs / DT; i++) {
      r = DC.stepDumpCtl(dc, DT, Object.assign({
        tavg_c: 304.5, load_frac: loadOf(t), turbine_tripped: false,
        condenser_available: true }, extra || {}));
      t += DT;
    }
    return r;
  }

  head('SOURCED CONSTANTS  [independent literals]');
  ck('the loss-of-load deadband is 5 degF', DC.DUMP.deadband_c * 1.8, 5, 1e-9, 'degF');
  ck('loss-of-load full output at 16.4 degF', DC.DUMP.lol_full_c * 1.8, 16.4, 1e-9, 'degF');
  /* ⚠ THE TURBINE-TRIP BAND IS NO LONGER THE SOURCE'S 27.7 degF *(OWNER RULING, 2026-09-06:
   * "A" — keep the full-power knot at this plant's own 580.1 degF and re-derive the dependents
   * from its span)*, #647. In WAT 05 the band and the Tavg program are ONE object — that plant's
   * program runs 557 - 584.7 degF and its turbine-trip controller reaches full output at
   * 584.7 - 557 = 27.7 — so importing 27.7 alone imported the WAT plant's SPAN as if it were a
   * gain. This plant's span is 547 -> 580.1 degF. The three checks below are the decision, in
   * the order it was made: the full-power knot (a bare literal, and it must stay one — it is
   * this plant's #479 heat-balance design point, not a citation), the IDENTITY that makes the
   * band that span, and the number that falls out. */
  ck('the full-power Tavg knot is this plant\'s own design point, 580.1 degF (#479 heat balance)',
     DC.DUMP.tavg_full_c, 304.5, 1e-9, 'degC');
  ckT('the turbine-trip band IS this plant\'s program span, DERIVED — not a typed copy of it ' +
      '(the structure WAT 05 itself uses)',
      DC.DUMP.tt_full_c === DC.DUMP.tavg_full_c - DC.DUMP.tavg_noload_c,
      'band ' + (DC.DUMP.tt_full_c * 1.8).toFixed(3) + ' degF vs span ' +
      ((DC.DUMP.tavg_full_c - DC.DUMP.tavg_noload_c) * 1.8).toFixed(3) + ' degF');
  ck('...so full output arrives AT full-power Tavg, 33.10 degF above no load',
     DC.DUMP.tt_full_c * 1.8, 33.102, 1e-9, 'degF');
  ck('C-7 ramp threshold is 5 %/min', DC.DUMP.c7_ramp_frac_per_min, 0.05, 0, '-');
  ck('C-7 step threshold is 10 %', DC.DUMP.c7_step_frac, 0.10, 0, '-');
  /* ⚠ THIS CHECK IS THE DECISION, WHICH IS WHY IT IS A BARE LITERAL AND MUST STAY ONE. It used
   * to read 291.67 degC (557 degF), the WTSM/WAT 4-loop plant's figure. RE-ANCHORED to GINNA's
   * 547 degF *(OWNER RULING, 2026-09-05: "547 °F — re-anchor to Ginna")*, #508/#634 — Ginna
   * UFSAR ch15 (ML20339A101) Table 15.0-3 note d: "All analyses assumed a programmed no-load
   * TAVG of 547F." The module header carries the measurements the ruling was made on. */
  ck('the no-load Tavg is Ginna\'s PROGRAMMED 547 degF (ML20339A101 Tbl 15.0-3 note d)',
     DC.DUMP.tavg_noload_c, 286.11, 1e-9, 'degC');
  /* ...AND IT IS THE PLANT'S OWN NO-LOAD STEAM SIDE, which is the defect #508 fixed: every
   * no-load initial condition boots at Tsat(1005 psig) and the program used to start 10.01 degF
   * above it, leaving BOTH Tavg-mode controllers dead at Hot Standby. Asserting the constant
   * alone cannot see that; asserting the AGREEMENT can. Band 0.2 degC, not equality: 547 degF
   * is a rounded programmed value and Tsat is solved. */
  ck('...and it AGREES with the no-load steam side the engine boots every no-load IC at',
     DC.DUMP.tavg_noload_c,
     RD.water.T_sat(DC.createDumpCtl({}).pressure_setpoint_mpa), 0.2, 'degC');
  /* THE DERIVED LAG: 0.10 step / 120 s = exactly the 5 %/min ramp threshold, so the two sourced
   * criteria stay DISTINCT. A shorter lag reads a clean step as a ramp (measured: 30 s read a
   * 10 % step as 20 %/min and armed on the first dispatch move). */
  ckT('the rate unit\'s lag keeps the two C-7 criteria distinct: step/tau == ramp threshold',
      Math.abs(DC.DUMP.c7_step_frac / DC.C7DET.rate_tau_s * 60 -
               DC.DUMP.c7_ramp_frac_per_min) < 1e-12,
      DC.C7DET.rate_tau_s + ' s -- derived from the thresholds\' mutual consistency, not chosen');

  head('THE TREF PROGRAM  [turbine load -> desired Tavg, the plant\'s own span]');
  /* ⚠ RE-POINTED AT THE CONSTANT, NOT RE-BANDED (#508, 2026-09-05). This read `291.67` — a
   * SECOND copy of the anchor, in the check that exists to say the program STARTS at the anchor.
   * The claim was never stale; only the duplicate literal was, and it went red on the re-anchor
   * for a reason that had nothing to do with what it asserts. Reading DUMP.tavg_noload_c makes
   * the check say what its name says and makes it impossible to go stale again; the LITERAL
   * lives once, in the check above, which is where the decision belongs. */
  ck('Tref at zero load is the no-load Tavg', DC.tref(0), DC.DUMP.tavg_noload_c, 1e-12, 'degC');
  ck('Tref at full load is the design Tavg', DC.tref(1), 304.5, 1e-12, 'degC');
  ckT('...and clamps beyond both ends', DC.tref(-0.2) === DC.tref(0) && DC.tref(1.3) === DC.tref(1), '');

  head('C-7  [both sides of both thresholds -- staying quiet on dispatch IS criterion A]');
  /* ⚠ HOT TAVG ON BOTH SIDES OF THE KNIFE-EDGE, so the latch cannot mask the detector: with a
   * flat Tavg the demand is zero and an over-eager arm CLEARS the same tick it sets, hiding a
   * greater-or-equal defect behind the honest disarm. With demand alive, a false arm LATCHES
   * and the check can see it. */
  var dc1 = DC.createDumpCtl({});
  var r1 = drive(dc1, 60, function (t) { return t < 10 ? 1.0 : 0.90; }, { tavg_c: 308 });
  ckT('an EXACT 10 % step does NOT arm -- the source says "greater than 10%"',
      r1.c7 === false && r1.dump_demand === 0,
      'the knife-edge the sweep rides; strict inequality on both detectors, demand alive');
  var dcNA = DC.createDumpCtl({});
  var rNA = drive(dcNA, 30, function () { return 0.95; }, { tavg_c: 310 });
  ckT('DEMAND WITHOUT ARMING moves nothing -- the interlock structure is the mechanism',
      rNA.controller_output > 0.5 && rNA.armed === false && rNA.dump_demand === 0,
      'controller asks ' + rNA.controller_output.toFixed(2) + ', valves get 0 -- no C-7 event ' +
      'has occurred, however hot the plant');
  /* ⚠ the arming fixture must also CREATE DEMAND, or the latch correctly clears the same
   * tick it sets ("within 5 degF of Tref the dumps are fully closed") -- the first version
   * held Tavg flat, armed, and disarmed in one step, and the check read that honest sequence
   * as a failure. A rejection RAISES Tavg; the fixture now says so. */
  var dc2 = DC.createDumpCtl({});
  var r2 = drive(dc2, 60, function (t) { return t < 10 ? 1.0 : 0.88; }, { tavg_c: 308 });
  ckT('a 12 % step ARMS -- and holds while the hot plant keeps the demand alive',
      r2.c7 === true && r2.dump_demand > 0, 'demand ' + r2.dump_demand.toFixed(2));
  var dc3 = DC.createDumpCtl({});
  var r3 = drive(dc3, 300, function (t) { return Math.max(0.7, 1.0 - 0.04 / 60 * t); });
  ckT('a sustained 4 %/min ramp does NOT arm', r3.c7 === false, 'below the sourced threshold');
  var dc4 = DC.createDumpCtl({});
  var r4 = drive(dc4, 300, function (t) { return Math.max(0.5, 1.0 - 0.08 / 60 * t); });
  ckT('a sustained 8 %/min ramp ARMS', r4.c7 === true, 'above it');
  /* the disarm: latched while demand exists, cleared when the dumps have fully closed */
  var dc5 = DC.createDumpCtl({});
  var r5a = drive(dc5, 30, function (t) { return t < 10 ? 1.0 : 0.85; },
                  { tavg_c: 310 });                      /* hot: demand exists */
  var r5b = drive(dc5, 30, function () { return 0.85; },
                  { tavg_c: DC.tref(0.85) + 1 });        /* back inside the deadband */
  ckT('C-7 stays latched while loss-of-load demand exists, clears when the dumps close',
      r5a.c7 === true && r5b.c7 === false,
      '"within 5 degF of Tref, the steam dumps are fully closed" (WAT 05)');

  head('THE THREE CONTROLLERS  [each at its own arithmetic]');
  var dcA = DC.createDumpCtl({});
  drive(dcA, 30, function (t) { return t < 10 ? 1.0 : 0.80; });        /* armed via 20 % step */
  var mid = DC.stepDumpCtl(dcA, DT, { tavg_c: DC.tref(0.80) + (5 + (16.4 - 5) / 2) / 1.8,
    load_frac: 0.80, turbine_tripped: false, condenser_available: true });
  ck('loss-of-load: halfway through the 5..16.4 degF band gives HALF demand',
     mid.dump_demand, 0.5, 0.02, '-');
  ckT('...and inside the 5 degF deadband gives ZERO -- the rod system\'s first-response margin',
      DC.stepDumpCtl(dcA, DT, { tavg_c: DC.tref(0.80) + 4 / 1.8, load_frac: 0.80,
        turbine_tripped: false, condenser_available: true }).controller_output === 0, '');
  /* load_frac 0.8, not 0: at zero load Tref IS the no-load Tavg and a controller wired to the
   * wrong reference would read identically. The lagging-impulse instant is where they differ. */
  /* ⚠ THE FIXTURE WAS BUILT AT THE LITERAL ANCHOR — `291.67 + 27.7/2/1.8` — so it was standing
   * ON the very constant it was probing (#508, 2026-09-05). Re-anchored to 547 degF the fixture
   * stayed at the old temperature while the controller's zero moved, and the check read a demand
   * of 0.861 against an expected 0.5 and looked like a controller defect. It was not: the
   * controller is exactly right and the FIXTURE moved out from under it. This is the
   * fixture-built-at-an-envelope-wall trap (#524's P_MIN, #588's blowdown ulp). Re-expressed
   * RELATIVE to the constant, the check asserts what it always meant — half the sourced 27.7 degF
   * band above the controller's own zero gives half demand — and it cannot be moved by an anchor
   * change again. Verified BOTH ways: 0.500 at 291.67 and 0.500 at 286.11. */
  var dcB = DC.createDumpCtl({});
  var tt = DC.stepDumpCtl(dcB, DT, {
    tavg_c: DC.DUMP.tavg_noload_c + DC.DUMP.tt_full_c / 2, load_frac: 0.8,
    turbine_tripped: true, condenser_available: true });
  ckT('C-8 auto-selects the turbine-trip controller AND arms -- half of 27.7 degF, half demand',
      tt.controller === 'turbine_trip' && tt.armed === true &&
      Math.abs(tt.dump_demand - 0.5) < 0.02,
      'demand ' + tt.dump_demand.toFixed(3) + ' against the no-load Tavg, no deadband');
  var dcC = DC.createDumpCtl({ mode: 'pressure', pressure_setpoint_mpa: 7.03 });
  var pm = DC.stepDumpCtl(dcC, DT, { steam_pressure_mpa: 7.33, load_frac: 0,
    turbine_tripped: false, condenser_available: true });
  ckT('pressure mode: selecting it IS the arming, and over-pressure opens the dumps',
      pm.controller === 'pressure' && pm.armed === true && pm.dump_demand > 0.3,
      pm.dump_demand.toFixed(2) + ' demand at 0.3 MPa over the setpoint -- the cooldown tool');

  head('C-9 AND THE INDICATION  [a demand with no path must stay visible]');
  var dcD = DC.createDumpCtl({});
  drive(dcD, 30, function (t) { return t < 10 ? 1.0 : 0.80; });
  var noCond = DC.stepDumpCtl(dcD, DT, { tavg_c: 310, load_frac: 0.80,
    turbine_tripped: false, condenser_available: false });
  ckT('C-9 false: dump_demand is ZERO but the CONTROLLER OUTPUT is not',
      noCond.dump_demand === 0 && noCond.controller_output > 0.5 && noCond.c9 === false,
      'WAT 05: "a demand indication does not necessarily mean that the steam dumps are ' +
      'opening" -- the indication survives, the flow does not');
  var dcE = DC.createDumpCtl({ mode: 'off' });
  ckT('mode OFF: disarmed, no demand, whatever the temperature does',
      DC.stepDumpCtl(dcE, DT, { tavg_c: 320, load_frac: 1.0, turbine_tripped: false,
        condenser_available: true }).dump_demand === 0, '');
}

console.log('\nPWR2 Layer 5 -- STEAM DUMP CONTROL: three controllers, three arming signals');
var rec = [];
runSuite(loadAll(), rec, false);
var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;

var DCSRC = fs.readFileSync(path.join(SRC, 'pwr2_dumpctl.js'), 'utf8').replace(/\r\n/g, '\n');
var MUTATIONS = [
  ['C-7 always armed (the dumps become the old engine\'s hidden parallel sink)',
   'if (c7Event) dc.c7Armed = true;\n        else if (demand <= 0) dc.c7Armed = false;',
   'dc.c7Armed = true;'],
  ['C-7 never arms (a 50 % rejection gets no dump)',
   'if (c7Event) dc.c7Armed = true;',
   'if (false) dc.c7Armed = true;'],
  ['the 5 degF deadband is deleted',
   'var over = (tavg - tr) - DUMP.deadband_c;',
   'var over = (tavg - tr);'],
  /* the >-vs->= distinction sits below the detector's own discretisation (the reference
   * updates before the comparison, so the exact peak is never seen) -- the FIREABLE defect
   * in this class is the threshold drifting, which is what the mutation now injects. */
  ['the step threshold drifts 10 -> 8 % (ordinary dispatch steps arm the dumps)',
   'c7_step_frac: 0.10,',
   'c7_step_frac: 0.08,'],
  ['the rate unit\'s lag collapses to 30 s (a clean step reads as a 20 %/min ramp)',
   'rate_tau_s: 120',
   'rate_tau_s: 30'],
  /* #647: the ruling is that the band is DERIVED. A typed copy is the failure mode it was
   * ruled against — it is how the constant went out of step with the program in the first
   * place — so the injection puts the old literal back. */
  ['the turbine-trip band is TYPED again (the WAT plant\'s 27.7 degF span as a gain)',
   'DUMP.tt_full_c = DUMP.tavg_full_c - DUMP.tavg_noload_c;',
   'DUMP.tt_full_c = 27.7 / 1.8;'],
  ['the turbine-trip controller references Tref instead of the no-load Tavg',
   'demand = clip((tavg - DUMP.tavg_noload_c) / DUMP.tt_full_c, 0, 1);',
   'demand = clip((tavg - tref(load)) / DUMP.tt_full_c, 0, 1);'],
  ['C-9 is ignored (the dumps actuate into an unavailable condenser)',
   'dump_demand: armed && c9 ? demand : 0,',
   'dump_demand: armed ? demand : 0,'],
  ['arming is ignored (controller output goes straight to the valves)',
   'dump_demand: armed && c9 ? demand : 0,',
   'dump_demand: c9 ? demand : 0,']
];

console.log('\ninjection self-test (' + MUTATIONS.length + ' mutations):');
var blind = 0;
MUT.select(MUTATIONS).forEach(function (m) {
  var mutated = DCSRC.replace(m[1], m[2]);
  if (mutated === DCSRC) {
    console.log('  ANCHOR MISS ' + m[0]);
    blind++;
    return;
  }
  var rec2 = [];
  try { runSuite(loadAll(mutated), rec2, true); } catch (e) { /* a crash counts as caught */ }
  var f2 = rec2.length ? rec2.filter(function (r) { return !r.ok; }).length : 1;
  if (f2 === 0) { console.log('  BLIND TO  ' + m[0] + '   <-- THIS GATE CANNOT SEE IT'); blind++; }
  else console.log('  caught    ' + m[0].padEnd(72) + f2 + ' checks red');
});
loadAll();

console.log('\n' + '='.repeat(70));
console.log('  injection self-test: ' + (MUTATIONS.length - blind) + '/' + MUTATIONS.length +
  ' mutations caught' + (blind ? '  ** ' + blind + ' BLIND SPOTS -- GATE FAILS **' : ', no blind spots'));
console.log('  run_pwr2_dumpctl: ' + pass + ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit(fail > 0 || blind > 0 ? 1 : 0);
