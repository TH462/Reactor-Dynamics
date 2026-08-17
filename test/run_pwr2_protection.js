/* run_pwr2_protection.js — Layer 5 gate: the reactor protection system. (#479)
 *
 * THE CLAIM THIS LAYER MAKES: every setpoint is a row of Ginna UFSAR ch15 Table 15.0-6, retyped
 * here rather than imported, and every delay is that row's own analysis delay. Nothing is chosen.
 *
 * WHAT THIS GATE MUST BE MOST CAREFUL ABOUT is the opposite of the other Layer 5 gates. Those
 * check that a system DOES something. A protection system's characteristic failure is doing
 * something it should not — tripping a healthy plant — and its other characteristic failure is
 * being wired in and never firing. **Both directions are checked for every function**, because a
 * trip asserted only in the direction that trips is a trip nobody has seen hold its fire.
 *
 * ⚠ AND THE DELAY IS WHERE THIS KIND OF MODEL ACTUALLY BREAKS. The existing engine's #433/#403
 * is the worked case: a no-dt harness made a `held_within_s` latch PERMANENT (age `0 <= 60` for
 * ever), so THREE GREEN PROBES certified a steam-line isolation that never fired. Every delay
 * check here is therefore driven with a real dt and checks BOTH that the delay elapses and that
 * an interrupted assertion RESTARTS it.
 *
 * Run: node test/run_pwr2_protection.js
 */
'use strict';
var fs = require('fs'), path = require('path');
var E = path.join(__dirname, '..', 'engines', 'pwr2');
var LIB = path.join(E, 'pwr2_protection.js');
var SRC = fs.readFileSync(LIB, 'utf8').replace(/\r\n/g, '\n');

/* pwr2_protection.js reads NOTHING else in the engine — it takes plain readings and compares them
 * to sourced numbers. That independence is deliberate: a protection system that needed the plant
 * object could not be reasoned about without it. */
function loadFrom(src) {
  var root = { RD: { pwr2: {} } };
  var body = src.replace("(typeof globalThis !== 'undefined' ? globalThis : this)", '(RD_ROOT)') +
             '\nreturn RD_ROOT.RD.pwr2.protection;';
  return new Function('RD_ROOT', body)(root);
}

/* THE SOURCE, RETYPED INDEPENDENTLY of the engine's copy — the house discipline. Importing the
 * constants and comparing them to themselves is vacuous.
 *
 * Ginna UFSAR ch15 (ML20339A101) Table 15.0-6, "Summary of RPS and ESFAS Functions Actuated":
 *   "High-Pressurizer Pressure Reactor Trip           2425 psia   2.0"
 *   "Low-Pressurizer Pressure Reactor Trip            1775 psia   2.0"   (Table 15.0-7)
 *   "Power-Range High Neutron Flux Reactor Trip (Low Setting)   35%   0.5"
 *   "Power-Range High Neutron Flux Reactor Trip (High Setting)  118% (high setting)   0.5"
 *   "Low RCL Flow Reactor Trip                        87%    1.0"
 *   "Low-Pressurizer Pressure Safety Injection        1715.0 psia"
 *   "Low Steam Pressure Safety Injection (SI) Setpoint   327.7 psia (lead/lag=12/2)   2.0"
 *   "High-High Steam Flow Setpoint                    155% of nominal   2.0"
 */
var DOC = {
  hi_pzr_psia: 2425, lo_pzr_psia: 1775,
  flux_lo: 0.35, flux_hi: 1.18,
  lo_flow: 0.87,
  si_pzr_psia: 1715.0, si_steam_psia: 327.7,
  steam_flow: 1.55,
  lead_s: 12.0, lag_s: 2.0,
  d_press: 2.0, d_flux: 0.5, d_flow: 1.0,
  psia_per_mpa: 145.0377,
  p10_frac: 0.08
};
var DT = 0.02;

/* A HEALTHY PLANT AT RATED, in the readings this layer takes. Every "does not trip" check is
 * driven from this, and every "does trip" check perturbs exactly one of them. */
function healthy() {
  return { pressure_mpa: 15.41, power_frac: 1.0, flow_frac: 1.0,
           steam_pressure_mpa: 5.688, steam_flow_frac: 1.0 };
}
/* ⚠ A PLANT AT POWER HAS THE LOW FLUX TRIP BLOCKED, and a fixture must SAY SO rather than
 * inherit it. The Power Range Neutron Flux-LOW setting is 35 % RTP — a plant at 100 % is
 * permanently past it, and a real plant blocks it during the startup once P-10 permits. So
 * every at-power fixture here creates protection with the block REQUESTED. The first version of
 * this gate used the default (not requested) and twelve checks went red on a correct model,
 * which is #460's lesson exactly: the probe was inheriting a lineup instead of stating one. */

function runSuite(P, rec, quiet) {
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

  /* ride(pr, readings, secs) — hold a set of readings for a real duration at the house dt. */
  function ride(pr, readings, secs) {
    var r = null, n = Math.max(1, Math.round(secs / DT));
    for (var i = 0; i < n; i++) r = P.stepProtection(pr, DT, readings);
    return r;
  }
  function fn(r, id) {
    for (var i = 0; i < r.functions.length; i++) if (r.functions[i].id === id) return r.functions[i];
    return null;
  }
  function withReading(k, v) { var s = healthy(); s[k] = v; return s; }
  /* protection lined up as a plant AT POWER is: the low flux block requested. */
  function atPower() { return P.createProtection({ blockLowFlux: true }); }

  /* ---- CONSTRUCTION, WRITTEN FIRST (D1 §31) ----------------------------------------------- */
  head('CONSTRUCTION  [a caller argument that never arrives is invisible to a physics check]');
  ckT('a fresh protection system is UNTRIPPED and carries no cause',
      P.createProtection({}).reactor_trip === false && P.createProtection({}).si === false &&
      P.createProtection({}).trip_cause === null,
      'a default of tripped would make every probe that omits this report a scrammed plant');
  ckT('the low-flux block reaches the plant, and defaults to UNBLOCKED',
      P.createProtection({ blockLowFlux: true }).blockLowFlux === true &&
      P.createProtection({}).blockLowFlux === false,
      'unblocked is the conservative default — a blocked-by-default trip is one nobody remembers ' +
      'is disabled');

  /* ---- THE SETPOINTS ARE THE DOCUMENT'S ---------------------------------------------------- */
  head('SETPOINTS  [retyped from Ginna UFSAR ch15 Table 15.0-6, not imported]');
  ck('high pressurizer pressure', P.RPS.hi_pzr_press_psia, DOC.hi_pzr_psia, 0, 'psia');
  ck('low pressurizer pressure', P.RPS.lo_pzr_press_psia, DOC.lo_pzr_psia, 0, 'psia');
  ck('power-range high flux, low setting', P.RPS.hi_flux_lo_frac, DOC.flux_lo, 1e-12, 'frac');
  ck('power-range high flux, high setting', P.RPS.hi_flux_hi_frac, DOC.flux_hi, 1e-12, 'frac');
  ck('low reactor coolant loop flow', P.RPS.lo_flow_frac, DOC.lo_flow, 1e-12, 'frac');
  ck('safety injection on low pressurizer pressure', P.ESFAS.si_lo_pzr_press_psia,
     DOC.si_pzr_psia, 0, 'psia');
  ck('safety injection on low steam pressure', P.ESFAS.si_lo_steam_press_psia,
     DOC.si_steam_psia, 0, 'psia');
  ck('high-high steam flow', P.ESFAS.hi_hi_steam_flow_frac, DOC.steam_flow, 1e-12, 'frac');
  ck('the lead/lag is the table\'s 12/2', P.LEADLAG.lead_s / P.LEADLAG.lag_s,
     DOC.lead_s / DOC.lag_s, 1e-12, '(ratio)');
  /* THE CONVERSION HAPPENS ONCE AND MUST BE RIGHT. A psia setpoint compared against an MPa
   * reading is the unit trap this engine has already paid for elsewhere. */
  ck('the high-pressure setpoint converts to MPa correctly',
     P.functions().filter(function (f) { return f.id === 'hi_pzr_press'; })[0].sp,
     DOC.hi_pzr_psia / DOC.psia_per_mpa, 1e-9, 'MPa');
  ckT('...and it lands ABOVE the plant\'s 15.41 MPa operating pressure, or it would trip at rated',
      DOC.hi_pzr_psia / DOC.psia_per_mpa > 15.41,
      (DOC.hi_pzr_psia / DOC.psia_per_mpa).toFixed(3) + ' MPa against 15.41 operating');

  /* ---- THE HEALTHY PLANT DOES NOT TRIP — the direction that matters most ------------------- */
  head('A HEALTHY PLANT DOES NOT TRIP  [the failure a protection model makes first]');
  var prH = atPower();
  var rH = ride(prH, healthy(), 60);
  ckT('no function asserts at rated conditions, held for a full minute',
      rH.functions.every(function (f) { return f.asserted === false; }),
      rH.functions.filter(function (f) { return f.asserted; }).map(function (f) {
        return f.id; }).join(',') || 'none of ' + rH.functions.length);
  ckT('...so nothing latches', rH.reactor_trip === false && rH.si === false, '');
  /* ⚠ THE LOW FLUX SETTING IS LEGITIMATELY PAST ITS SETPOINT AT RATED, and saying so is more
   * honest than a blanket "everything has margin". Its setpoint is 35 % RTP; a plant at 100 % is
   * permanently past it and is protected by the HIGH setting instead — which is what the Bases
   * says in as many words: *"Above the P-10 setpoint, positive reactivity additions are mitigated
   * by the Power Range Neutron Flux-High trip Function."* */
  ckT('every function EXCEPT the blocked low flux setting has positive margin',
      rH.functions.every(function (f) {
        return !f.available || f.id === 'hi_flux_lo' || f.margin > 0; }),
      'margins: ' + rH.functions.map(function (f) {
        return f.id + ' ' + (f.margin === undefined ? 'n/a' : f.margin.toFixed(2)); }).join(', '));
  ckT('...and the low flux setting IS past its setpoint, and is blocked rather than ignored',
      fn(rH, 'hi_flux_lo').margin < 0 && rH.low_flux_blocked === true &&
      fn(rH, 'hi_flux_lo').asserted === false,
      'margin ' + fn(rH, 'hi_flux_lo').margin.toFixed(2) + ' — a model that simply never ' +
      'asserted it would look identical here and be wrong the moment power fell below P-10');

  /* ---- EVERY FUNCTION TRIPS, ONE AT A TIME ------------------------------------------------- */
  head('EVERY FUNCTION TRIPS  [and only the one perturbed — a trip nobody has seen fire is not one]');
  var CASES = [
    ['hi_pzr_press',      'pressure_mpa',       DOC.hi_pzr_psia / DOC.psia_per_mpa + 0.5, 'rps'],
    ['lo_pzr_press',      'pressure_mpa',       DOC.lo_pzr_psia / DOC.psia_per_mpa - 0.5, 'rps'],
    ['hi_flux_hi',        'power_frac',         DOC.flux_hi + 0.05,                       'rps'],
    ['lo_flow',           'flow_frac',          DOC.lo_flow - 0.05,                       'rps'],
    ['si_lo_pzr_press',   'pressure_mpa',       DOC.si_pzr_psia / DOC.psia_per_mpa - 0.5, 'esfas'],
    ['hi_hi_steam_flow',  'steam_flow_frac',    DOC.steam_flow + 0.05,                    'esfas']
  ];
  CASES.forEach(function (c) {
    var pr = atPower();
    var r = ride(pr, withReading(c[1], c[2]), 10);
    var f = fn(r, c[0]);
    ckT(c[0] + ' trips when its own reading crosses', f && f.tripping === true,
        f ? (f.value.toFixed(3) + ' against ' + f.setpoint.toFixed(3) + ' ' + f.unit +
             ', held ' + f.held_s.toFixed(1) + ' s') : 'FUNCTION MISSING');
    ckT('...and it latches the right system, ' + c[3],
        c[3] === 'rps' ? (r.reactor_trip === true && r.trip_cause === c[0])
                       : (r.si === true && r.si_cause === c[0]),
        'trip_cause=' + r.trip_cause + ' si_cause=' + r.si_cause);
  });
  /* THE LOW FLUX SETTING NEEDS ITS OWN CASE, because the healthy plant sits at 100 % — ABOVE its
   * 35 % setpoint. It is a STARTUP trip, and at power it is asserted continuously and blocked. */
  var prLF = P.createProtection({});
  var rLF = ride(prLF, withReading('power_frac', 0.40), 5);
  ckT('the low flux setting asserts at 40 % power, where the high setting does not',
      fn(rLF, 'hi_flux_lo').asserted === true && fn(rLF, 'hi_flux_hi').asserted === false,
      'this is a STARTUP trip: 0.35 low against 1.18 high');
  var prB = P.createProtection({ blockLowFlux: true });
  var rB = ride(prB, withReading('power_frac', 0.40), 5);
  ckT('...and the block suppresses it WITHOUT touching the high setting',
      fn(rB, 'hi_flux_lo').asserted === false && rB.reactor_trip === false,
      'a block that suppressed both would disable the at-power flux trip and nothing would say so');
  var rB2 = ride(P.createProtection({ blockLowFlux: true }), withReading('power_frac', 1.25), 5);
  ckT('...and with the block IN, the high setting still trips',
      rB2.reactor_trip === true && rB2.trip_cause === 'hi_flux_hi',
      'blocking the startup trip must not blind the plant at power');

  /* ---- P-10, AND ITS ASYMMETRY IS THE POINT ---------------------------------------------
   * Ginna TS Bases B 3.3.1: the block is MANUAL and only PERMITTED above ~8 % RTP; the unblock
   * is AUTOMATIC below it. A symmetric model — an operator switch that simply holds — would be a
   * DEFEATABLE REACTOR TRIP, which is what this engine's predecessor shipped and had to have
   * superseded (#295 F1/F2). Both directions are checked, and so is the revocation. */
  head('P-10  [the block is permissive-gated and ALWAYS auto-reinstates -- never defeatable]');
  ck('the permissive setpoint is the sourced 8 % RTP', P.P10.frac, DOC.p10_frac, 1e-12, 'frac');
  var prP = P.createProtection({ blockLowFlux: true });
  var rAbove = ride(prP, withReading('power_frac', 0.40), 1);
  ckT('a block requested ABOVE the permissive takes effect',
      rAbove.p10_met === true && rAbove.low_flux_blocked === true, '');
  var rBelow = ride(prP, withReading('power_frac', DOC.p10_frac - 0.01), 1);
  ckT('...and falling BELOW the permissive unblocks it automatically',
      rBelow.p10_met === false && rBelow.low_flux_blocked === false,
      'the operator has no say in the unblock — that is what makes it not defeatable');
  ckT('...and the REQUEST itself is revoked, so it does not silently re-arm on the way back up',
      prP.blockLowFlux === false, '');
  var rBack = ride(prP, withReading('power_frac', 0.40), 1);
  ckT('...so returning above the permissive leaves it UNBLOCKED until asked again',
      rBack.low_flux_blocked === false,
      'a stale request that re-armed by itself is the defeatable-trip shape the sources do not have');
  var prLow = P.createProtection({ blockLowFlux: true });
  var rLowOnly = ride(prLow, withReading('power_frac', 0.03), 1);
  ckT('a block requested BELOW the permissive never takes effect at all',
      rLowOnly.low_flux_blocked === false && fn(rLowOnly, 'hi_flux_lo').asserted === false,
      'at 3 % power it is below the 35 % trip too, so the trip is not asserted for its own reason');
  /* AND THE BLOCK MUST NOT REACH THE OTHER FUNCTIONS. Only the low flux setting is blockable. */
  var prOnly = P.createProtection({ blockLowFlux: true });
  var rOnly = ride(prOnly, withReading('pressure_mpa',
                   DOC.hi_pzr_psia / DOC.psia_per_mpa + 0.5), 5);
  ckT('the block reaches ONLY the low flux setting -- pressure still trips with it in',
      rOnly.reactor_trip === true && rOnly.trip_cause === 'hi_pzr_press', '');

  /* ---- THE DELAY IS REAL, AND IT RESTARTS -------------------------------------------------
   * This is where #433/#403 went wrong in the other engine: a degenerate latch reads exactly
   * like a working feature. Both halves are checked. */
  head('THE DELAY  [a degenerate latch reads exactly like a working feature — #433]');
  var prD = atPower();
  var hot = withReading('pressure_mpa', DOC.hi_pzr_psia / DOC.psia_per_mpa + 0.5);
  var rShort = ride(prD, hot, DOC.d_press - 0.5);
  ckT('a function held for LESS than its sourced delay does NOT trip',
      rShort.reactor_trip === false && fn(rShort, 'hi_pzr_press').asserted === true,
      'asserted at ' + fn(rShort, 'hi_pzr_press').held_s.toFixed(2) + ' s against a ' +
      DOC.d_press + ' s delay — asserted but not tripping is the state that must exist');
  var rLong = ride(prD, hot, 1.0);
  ckT('...and trips once the delay elapses', rLong.reactor_trip === true,
      'held ' + fn(rLong, 'hi_pzr_press').held_s.toFixed(2) + ' s');
  /* THE RESTART. A channel that crosses, clears, and crosses again must start its delay over —
   * otherwise a plant that flickers past a setpoint accumulates its way to a trip it never had. */
  var prR = atPower();
  ride(prR, hot, DOC.d_press - 0.5);
  var rClear = ride(prR, healthy(), 0.5);
  ckT('clearing the condition RESETS the accumulated hold to zero',
      fn(rClear, 'hi_pzr_press').held_s === 0 && rClear.reactor_trip === false, '');
  var rAgain = ride(prR, hot, DOC.d_press - 0.5);
  ckT('...so a flickering signal never accumulates its way to a trip it did not earn',
      rAgain.reactor_trip === false,
      'two sub-delay excursions totalling ' + (2 * (DOC.d_press - 0.5)).toFixed(1) +
      ' s, past the ' + DOC.d_press + ' s delay, and it has NOT tripped');
  /* AND THE DELAYS DIFFER BY FUNCTION, which is only visible if they are compared. */
  var prF = atPower();
  var rFlux = ride(prF, withReading('power_frac', DOC.flux_hi + 0.05), 0.7);
  ckT('the 0.5 s flux delay trips where the 2.0 s pressure delay would not have',
      rFlux.reactor_trip === true,
      'the table gives every function its own delay; one shared number would lose that');

  /* ---- THE LATCH -------------------------------------------------------------------------- */
  head('THE LATCH  [a reactor trip does not un-happen when the plant recovers]');
  var prL = atPower();
  ride(prL, hot, 5);
  var rRec = ride(prL, healthy(), 30);
  ckT('recovering the plant does NOT clear the trip', rRec.reactor_trip === true,
      'cause still ' + rRec.trip_cause);
  ckT('...but ASSERTED-NOW goes false, so a consumer can tell latched from still-crossing',
      rRec.rps_asserted_now === false && rRec.reactor_trip === true,
      'reporting only the latch would make a recovered plant indistinguishable from one still ' +
      'past its setpoint');
  ckT('...and only an explicit reset clears it',
      P.reset(prL).reactor_trip === false &&
      P.stepProtection(prL, DT, healthy()).reactor_trip === false, '');
  /* THE FIRST CAUSE IS KEPT. A cascade trips several functions; the one that got there first is
   * the one that tells you what happened. */
  /* ⚠ THE CASCADE NEEDS TWO FUNCTIONS ON *EACH* SYSTEM, or first-vs-last is invisible. The first
   * version crossed one reading that tripped one RPS and one ESFAS function — with only one
   * candidate per system, "keeps the last" and "keeps the first" give the same answer and the
   * injection self-test said so. A real cascade trips several. */
  /* ⚠ THE CASCADE TOOK THREE ATTEMPTS AND THE INJECTION SELF-TEST REFUSED ALL THREE. Worth the
   * space, because the reason is not obvious and it generalises.
   *
   *   1. One reading crossing one RPS and one ESFAS function. With a single candidate per system,
   *      "keeps the first" and "keeps the last" give the same answer.
   *   2. Two ESFAS functions crossed SIMULTANEOUSLY. They trip on the same step, so the first in
   *      table order is also the last one seen. Same answer again.
   *   3. Staged in time, but with the later function LATER IN THE TABLE. Still the same answer,
   *      because the cause is selected by scanning the function table each step — so on the final
   *      step the earlier-in-table function is picked whether the code keeps first or last.
   *
   * THE ARRANGEMENT THAT ACTUALLY DISCRIMINATES: the function that arrives SECOND IN TIME must sit
   * EARLIER IN THE TABLE. Then "first in time" and "first in table order on the last step" are
   * different functions, and only then does the latch's `!pr.si` guard carry any weight.
   * Generalised: **a check on ordering is vacuous unless the two orderings disagree.** */
  var prC = atPower();
  /* stage 1 — low loop flow (5th in the table) and high steam flow (8th) */
  var stage1 = healthy();
  stage1.flow_frac = DOC.lo_flow - 0.05;
  stage1.steam_flow_frac = DOC.steam_flow + 0.10;
  ride(prC, stage1, 5);
  /* stage 2 — pressure falls, adding low pressurizer pressure (2nd) and its injection (6th),
   * both EARLIER in the table than what already tripped */
  var stage2 = healthy();
  stage2.flow_frac = stage1.flow_frac;
  stage2.steam_flow_frac = stage1.steam_flow_frac;
  stage2.pressure_mpa = DOC.lo_pzr_psia / DOC.psia_per_mpa - 0.5;
  var rC = ride(prC, stage2, 5);
  ckT('a staged cascade trips more than one function on each system', (function () {
        var n = rC.functions.filter(function (f) { return f.tripping; });
        return n.filter(function (f) { return f.kind === 'rps'; }).length >= 2 &&
               n.filter(function (f) { return f.kind === 'esfas'; }).length >= 2;
      })(),
      'tripping: ' + rC.functions.filter(function (f) { return f.tripping; })
        .map(function (f) { return f.id; }).join(', '));
  ckT('...and each system keeps the cause that arrived FIRST IN TIME, not first in the table',
      rC.trip_cause === 'lo_flow' && rC.si_cause === 'hi_hi_steam_flow',
      'trip_cause=' + rC.trip_cause + ', si_cause=' + rC.si_cause +
      ' — both arrived first in TIME and sit LAST in the table, so a latch that re-wrote itself ' +
      'each step would report the pressure functions instead')

  /* ---- THE LEAD/LAG ON LOW STEAM PRESSURE ------------------------------------------------- */
  head('LEAD/LAG  [the compensation is part of the setpoint, and dropping it cost #433 an isolation]');
  var spSteam = DOC.si_steam_psia / DOC.psia_per_mpa;
  /* A FAST fall must trip EARLIER than the raw crossing, because the lead term drives the
   * compensated signal below the raw one while the input is falling. */
  var prFast = atPower(), tFast = null, t = 0;
  for (var i = 0; i < 5000 && tFast === null; i++) {
    var pFast = 5.688 - 0.05 * t;                       /* 0.05 MPa/s — a break */
    var rf = P.stepProtection(prFast, DT, withReading('steam_pressure_mpa', Math.max(0.1, pFast)));
    if (rf.si) tFast = t;
    t += DT;
  }
  var rawFast = (5.688 - spSteam) / 0.05;
  ckT('a FAST steam pressure fall trips the safety injection EARLIER than the raw crossing',
      tFast !== null && tFast < rawFast,
      'compensated at ' + (tFast === null ? 'never' : tFast.toFixed(1) + ' s') +
      ' against a raw crossing at ' + rawFast.toFixed(1) + ' s');
  /* A SLOW drift must NOT be pulled forward much — that is the discrimination the compensation
   * exists for, and a lead/lag that fires early on everything is just a lower setpoint. */
  var prSlow = atPower(), tSlow = null; t = 0;
  for (i = 0; i < 400000 && tSlow === null; i++) {
    var pSlow = 5.688 - 0.0005 * t;                     /* 0.0005 MPa/s — a hundredth the rate */
    var rs = P.stepProtection(prSlow, DT, withReading('steam_pressure_mpa', Math.max(0.1, pSlow)));
    if (rs.si) tSlow = t;
    t += DT;
  }
  var rawSlow = (5.688 - spSteam) / 0.0005;
  ckT('...while a SLOW drift is barely pulled forward at all',
      tSlow !== null && (rawSlow - tSlow) < (rawFast - tFast) * 3,
      'slow: ' + (rawSlow - tSlow).toFixed(1) + ' s early of ' + rawSlow.toFixed(0) +
      '; fast: ' + (rawFast - tFast).toFixed(1) + ' s early of ' + rawFast.toFixed(1) +
      ' — only a RATE-sensitive channel can tell a break from a drift');

  /* ---- WHAT IS NOT AVAILABLE IS SAID, NOT ASSUMED SAFE ------------------------------------ */
  head('MISSING READINGS  [an absent secondary must not read as a secondary that is fine]');
  var prN = atPower();
  var bare = { pressure_mpa: 15.41, power_frac: 1.0, flow_frac: 1.0 };
  var rN = P.stepProtection(prN, DT, bare);
  ckT('the secondary functions report UNAVAILABLE when no secondary reading is supplied',
      fn(rN, 'si_lo_steam_press').available === false &&
      fn(rN, 'hi_hi_steam_flow').available === false,
      'available:false is a measurement of ignorance; asserted:false would be a claim');
  ckT('...and they report no margin rather than a comfortable one',
      fn(rN, 'si_lo_steam_press').margin === undefined, '');
  ckT('...while the primary functions still work on the readings that ARE there',
      fn(rN, 'hi_pzr_press').available === true && rN.reactor_trip === false, '');

  /* ---- REFUSALS ---------------------------------------------------------------------------- */
  head('REFUSALS  [this layer will not report a plant un-tripped on a reading it never had]');
  ['pressure_mpa', 'power_frac', 'flow_frac'].forEach(function (k) {
    ckT('omitting ' + k + ' throws rather than assuming the plant is fine', (function () {
      var d = { pressure_mpa: 15.41, power_frac: 1.0, flow_frac: 1.0 };
      delete d[k];
      try { P.stepProtection(P.createProtection({}), DT, d); return false; }
      catch (e) { return new RegExp(k).test(e.message); }
    })(), '');
  });
}

console.log('\nPWR2 Layer 5 -- PROTECTION: the sourced trip table, and it does not enforce');
var P = loadFrom(SRC), rec = [];
runSuite(P, rec, false);
var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;

var MUTATIONS = [
  ['a healthy plant TRIPS -- the comparison direction is inverted',
   '        asserted = f.dir > 0 ? (value >= f.sp) : (value <= f.sp);',
   '        asserted = f.dir > 0 ? (value <= f.sp) : (value >= f.sp);'],
  ['the delay is ignored, so any momentary excursion trips',
   '      var tripping = asserted && pr.held_s[f.id] >= f.delay;',
   '      var tripping = asserted;'],
  ['the hold ACCUMULATES instead of restarting (the #433 degenerate latch)',
   '      pr.held_s[f.id] = asserted ? pr.held_s[f.id] + (dt > 0 ? dt : 0) : 0;',
   '      pr.held_s[f.id] = pr.held_s[f.id] + (dt > 0 ? dt : 0);'],
  ['the delay never elapses, so nothing ever trips',
   '      var tripping = asserted && pr.held_s[f.id] >= f.delay;',
   '      var tripping = false;'],
  ['the reactor trip does not LATCH -- it clears when the plant recovers',
   '    if (anyRps && !pr.reactor_trip) { pr.reactor_trip = true; pr.trip_cause = anyRps; }',
   '    pr.reactor_trip = !!anyRps;'],
  ['the SI latch keeps the LAST cause, not the first',
   '    if (anyEsfas && !pr.si) { pr.si = true; pr.si_cause = anyEsfas; }',
   '    if (anyEsfas) { pr.si = true; pr.si_cause = anyEsfas; }'],
  ['the reactor-trip latch keeps the LAST cause, not the first',
   '    if (anyRps && !pr.reactor_trip) { pr.reactor_trip = true; pr.trip_cause = anyRps; }',
   '    if (anyRps) { pr.reactor_trip = true; pr.trip_cause = anyRps; }'],
  ['ASSERTED-NOW is reported as the latch, so a recovered plant looks still-tripping',
   '      rps_asserted_now: !!anyRps,', '      rps_asserted_now: pr.reactor_trip,'],
  ['the lead/lag is dropped -- the channel stops being rate sensitive (#433 exactly)',
   '        if (f.leadlag) value = leadLag(pr, raw, dt);', ''],
  ['the lead and lag are transposed (2/12 instead of 12/2)',
   '  var LEADLAG = { kind: \'[sourced]\', lead_s: 12.0, lag_s: 2.0,',
   '  var LEADLAG = { kind: \'[sourced]\', lead_s: 2.0, lag_s: 12.0,'],
  ['a missing reading reads as NOT ASSERTED instead of UNAVAILABLE',
   '      var available = raw !== undefined && isFinite(raw);',
   '      var available = true;'],
  ['the low-flux BLOCK suppresses every function, not just the blockable one',
   '        if (f.blockable && blockEffective) asserted = false;',
   '        if (blockEffective) asserted = false;'],
  ['the high-pressure setpoint moved off its sourced value',
   '    hi_pzr_press_psia:  2425,', '    hi_pzr_press_psia:  2600,'],
  ['the low-pressure setpoint moved off its sourced value',
   '    lo_pzr_press_psia:  1775,', '    lo_pzr_press_psia:  1500,'],
  ['the flux settings are swapped (the startup trip becomes the at-power one)',
   '    hi_flux_lo_frac:    0.35,\n    hi_flux_hi_frac:    1.18,',
   '    hi_flux_lo_frac:    1.18,\n    hi_flux_hi_frac:    0.35,'],
  ['the low-flow setpoint moved off its sourced value',
   '    lo_flow_frac:       0.87,', '    lo_flow_frac:       0.50,'],
  ['the safety-injection steam setpoint moved off its sourced value',
   '    si_lo_steam_press_psia: 327.7,', '    si_lo_steam_press_psia: 200.0,'],
  ['the psia->MPa conversion is dropped, so a psia setpoint is compared to an MPa reading',
   '        sp: RPS.hi_pzr_press_psia / PSIA_PER_MPA, unit: \'MPa\', read: \'pressure_mpa\',',
   '        sp: RPS.hi_pzr_press_psia, unit: \'MPa\', read: \'pressure_mpa\','],
  ['the margin FLOORS at zero, hiding how far past a setpoint a plant went',
   '        margin: available ? (f.dir > 0 ? f.sp - value : value - f.sp) : undefined',
   '        margin: available ? Math.max(0, f.dir > 0 ? f.sp - value : value - f.sp) : undefined'],
  ['falling below P-10 does not REVOKE the request, so it silently re-arms on the way up',
   '    if (!p10Met && pr.blockLowFlux) pr.blockLowFlux = false;', ''],
  ['the P-10 setpoint moved off its sourced 8 %', '    frac: 0.08,', '    frac: 0.50,'],
  /* CONSTRUCTION */
  ['caller blockLowFlux ignored at construction',
   '      blockLowFlux: !!opts.blockLowFlux,', '      blockLowFlux: false,'],
  ['a fresh protection system is created ALREADY TRIPPED',
   '      reactor_trip: false,                  /* LATCHED */',
   '      reactor_trip: true,'],
  ['reset does not actually clear the latch',
   '    pr.reactor_trip = false; pr.si = false;', '    pr.si = false;']
];

/* ---- THE CLEAN-RUN GUARD ---------------------------------------------------------------- */
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
console.log('  run_pwr2_protection: ' + pass + ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit((fail > 0 || blind > 0) ? 1 : 0);
