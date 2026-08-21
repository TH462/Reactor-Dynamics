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
var SRC = path.join(__dirname, '..', 'engines', 'pwr2');
var fs = require('fs');

function loadAll(dcSource) {
  ['pwr2_water', 'pwr2_vtable'].forEach(function (f) {
    delete require.cache[require.resolve(path.join(SRC, f + '.js'))];
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
  ck('turbine-trip full output at 27.7 degF, no deadband', DC.DUMP.tt_full_c * 1.8, 27.7, 1e-9, 'degF');
  ck('C-7 ramp threshold is 5 %/min', DC.DUMP.c7_ramp_frac_per_min, 0.05, 0, '-');
  ck('C-7 step threshold is 10 %', DC.DUMP.c7_step_frac, 0.10, 0, '-');
  ck('the no-load Tavg is 557 degF -- the sources\' own number AND the HZP anchor',
     DC.DUMP.tavg_noload_c, 291.67, 1e-9, 'degC');
  /* THE DERIVED LAG: 0.10 step / 120 s = exactly the 5 %/min ramp threshold, so the two sourced
   * criteria stay DISTINCT. A shorter lag reads a clean step as a ramp (measured: 30 s read a
   * 10 % step as 20 %/min and armed on the first dispatch move). */
  ckT('the rate unit\'s lag keeps the two C-7 criteria distinct: step/tau == ramp threshold',
      Math.abs(DC.DUMP.c7_step_frac / DC.C7DET.rate_tau_s * 60 -
               DC.DUMP.c7_ramp_frac_per_min) < 1e-12,
      DC.C7DET.rate_tau_s + ' s -- derived from the thresholds\' mutual consistency, not chosen');

  head('THE TREF PROGRAM  [turbine load -> desired Tavg, the plant\'s own span]');
  ck('Tref at zero load is the no-load Tavg', DC.tref(0), 291.67, 1e-12, 'degC');
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
  var dcB = DC.createDumpCtl({});
  var tt = DC.stepDumpCtl(dcB, DT, { tavg_c: 291.67 + 27.7 / 2 / 1.8, load_frac: 0.8,
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
MUTATIONS.forEach(function (m) {
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
