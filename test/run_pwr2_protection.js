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
 *   "Low-Low Steam Generator Water Level Reactor Trip   0% NRS   2.0"       (15.2.6 LONF)
 *   "Low-Low Steam Generator Water Level AFW Pump Start 0% NRS   60.0"      (at-full-flow)
 *
 * Ginna UFSAR ch10 (ML20339A040) §10.5.3.1.3 — the INSTALLED lo-lo setpoint the engine carries
 * (the 0% NRS above is the analysis limit; the engine's SGLL block records the choice):
 *   "...will start if one steam generator level decreases to a low-low level of 17%"
 * Ginna TS Bases B 3.3.1 Function 13 (ML20339A221) — one bistable, two consumers:
 *   "This Function also performs the Engineered Safety Feature Actuation System (ESFAS)
 *    function of starting the AFW pumps on low low SG level."
 *
 * THE FEED-TRAIN FUNCTIONS (2026-08-21):
 * Ginna UFSAR ch10: "If both main feedwater pumps fail, the turbine will be tripped and the
 *   motor-driven auxiliary feedwater pumps (MDAFW) will start automatically."
 * Table 15.0-6: "High-High Steam Generator Water Level Feedwater Regulator Valve Closure
 *   100% NRS 22.0" (analysis); WTSM 3.2 (ML11223A213): "a high-high steam generator level
 *   turbine trip to protect the turbine against excessive moisture carryover". The INSTALLED
 *   0.90 is [adopted] from the current engine's P-14 value.
 */
var DOC = {
  hi_pzr_psia: 2425, lo_pzr_psia: 1775,
  flux_lo: 0.35, flux_hi: 1.18,
  lo_flow: 0.87,
  si_pzr_psia: 1715.0, si_steam_psia: 327.7,
  steam_flow: 1.55,
  lolo_frac: 0.17, d_lolo: 2.0, hihi_frac: 0.90, d_hihi: 2.0,
  hi_pzr_level: 0.87, p7_frac: 0.10,
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
           steam_pressure_mpa: 5.688, steam_flow_frac: 1.0, pzr_level_frac: 0.615,
           /* the plant's own settled narrow-range SG level (measured 2026-08-20: true 65.0 %,
            * indicated 64.7 % at the 900 s operating point) */
           sg_level_frac: 0.65 };
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
  ck('low-low SG water level is the INSTALLED 17 %, not the 0 % analysis limit',
     P.SGLL.lolo_frac, DOC.lolo_frac, 1e-12, 'frac');
  ck('...with the table\'s 2.0 s trip delay', P.DELAY.sg_lolo_level, DOC.d_lolo, 0, 's');
  ck('high-high SG water level is the adopted P-14 90 %', P.SGLL.hi_hi_frac, DOC.hihi_frac,
     1e-12, 'frac');
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
    ['hi_hi_steam_flow',  'steam_flow_frac',    DOC.steam_flow + 0.05,                    'esfas'],
    ['hi_pzr_level',      'pzr_level_frac',     DOC.hi_pzr_level + 0.05,                  'rps'],
    ['sg_lolo_level',     'sg_level_frac',      DOC.lolo_frac - 0.05,                     'rps']
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

  /* ---- THE AFW STARTS (2026-08-20) — one bistable, two consumers --------------------------
   * TS Bases B 3.3.1 Function 13: the lo-lo trip Function "also performs the ESFAS function of
   * starting the AFW pumps". So the SAME ride must latch the reactor trip AND both AFW starts,
   * SI must start the motor-driven pump ONLY (ch10), and reset must clear all of it. */
  head('THE AFW STARTS  [the lo-lo bistable\'s second consumer, and SI\'s MDAFW-only start]');
  var prA = atPower();
  var loloReading = withReading('sg_level_frac', DOC.lolo_frac - 0.05);
  var rA1 = ride(prA, loloReading, DOC.d_lolo - 0.5);
  ckT('below the sourced delay, lo-lo asserts but latches NOTHING — trip and starts alike',
      fn(rA1, 'sg_lolo_level').asserted === true && rA1.reactor_trip === false &&
      rA1.afas_mdafw === false && rA1.afas_tdafw === false,
      'held ' + fn(rA1, 'sg_lolo_level').held_s.toFixed(2) + ' s against ' + DOC.d_lolo + ' s');
  var rA2 = ride(prA, loloReading, 1.0);
  ckT('past the delay, ONE crossing latches the trip AND both AFW starts together',
      rA2.reactor_trip === true && rA2.trip_cause === 'sg_lolo_level' &&
      rA2.afas_mdafw === true && rA2.afas_mdafw_cause === 'sg_lolo_level' &&
      rA2.afas_tdafw === true && rA2.afas_tdafw_cause === 'sg_lolo_level',
      'one bistable, two consumers — the source\'s own wiring');
  var rA3 = ride(prA, healthy(), 30);
  ckT('the AFW starts LATCH — a recovered level does not un-start a pump demand',
      rA3.afas_mdafw === true && rA3.afas_tdafw === true, '');
  P.reset(prA);
  var rA4 = P.stepProtection(prA, DT, healthy());
  ckT('...and reset clears both AFW-start latches with the rest',
      rA4.afas_mdafw === false && rA4.afas_tdafw === false &&
      rA4.afas_mdafw_cause === null && rA4.afas_tdafw_cause === null, '');
  /* SI STARTS THE MOTOR-DRIVEN PUMPS ONLY [sourced ch10]: "Upon receipt of a safety injection
   * signal, the two motor-driven preferred auxiliary feedwater pumps will start". The TDAFW
   * start needs the lo-lo level; a mutation that cross-wires SI into it must redden HERE. */
  var prS = atPower();
  var rS = ride(prS, withReading('pressure_mpa', DOC.si_pzr_psia / DOC.psia_per_mpa - 0.5), 10);
  ckT('a safety injection starts the MDAFW (cause \'si\') and NOT the TDAFW',
      rS.si === true && rS.afas_mdafw === true && rS.afas_mdafw_cause === 'si' &&
      rS.afas_tdafw === false,
      'mdafw_cause=' + rS.afas_mdafw_cause + ' tdafw=' + rS.afas_tdafw);
  ckT('...and a healthy plant held a minute latches neither start',
      (function () { var r = ride(atPower(), healthy(), 60);
                     return r.afas_mdafw === false && r.afas_tdafw === false; })(), '');
  /* LOSS OF MAIN FEED [sourced ch10] — a STATE signal, so no delay row: the MDAFW start
   * arrives with the breaker fact. TDAFW is NOT in the source's sentence and must not start. */
  var prMF = atPower();
  var sMF = healthy(); sMF.main_feed_lost = true;
  var rMF = P.stepProtection(prMF, DT, sMF);
  ckT('both main feed pumps lost starts the MDAFW (cause \'loss_of_main_feed\'), not the TDAFW',
      rMF.afas_mdafw === true && rMF.afas_mdafw_cause === 'loss_of_main_feed' &&
      rMF.afas_tdafw === false,
      'a state signal — no analog channel, no hold time');
  /* LOSS OF OFFSITE POWER [sourced ch10: "All three preferred auxiliary feedwater pumps will
   * start on loss of offsite power"] — BOTH pumps on this plant's one-of-each lineup (#507
   * wave 4). Isolated from the main-feed path so a cross-wire cannot pass on its neighbour. */
  var prLO = atPower();
  var sLO = healthy(); sLO.loss_of_offsite = true;
  var rLO = P.stepProtection(prLO, DT, sLO);
  ckT('loss of offsite power starts BOTH AFW pumps (cause \'loss_of_offsite_power\')',
      rLO.afas_mdafw === true && rLO.afas_mdafw_cause === 'loss_of_offsite_power' &&
      rLO.afas_tdafw === true && rLO.afas_tdafw_cause === 'loss_of_offsite_power',
      'md cause=' + rLO.afas_mdafw_cause + ' td cause=' + rLO.afas_tdafw_cause);

  /* ---- P-11: THE SHUTDOWN PERMISSIVE (#507 wave 10) -------------------------------------- */
  head('P-11  [the cooldown\'s blocks: taken below it they gate; climbing above REVOKES them]');
  function shutdown() {
    return { pressure_mpa: 2.51, power_frac: 1e-8, flow_frac: 0,
             steam_pressure_mpa: 0.205, steam_flow_frac: 0, pzr_level_frac: 0.30,
             sg_level_frac: 0.65 };
  }
  var prSD = P.createProtection({ blockLoPress: true, blockSI: true });
  var rSD = ride(prSD, shutdown(), 30);
  ckT('a BLOCKED shutdown plant (350 psig, RCPs secured) latches NOTHING — no low-pressure ' +
      'trip, no SI from either pressure, no loss-of-flow trip (its sourced P-7 gate)',
      rSD.reactor_trip === false && rSD.si === false &&
      fn(rSD, 'lo_pzr_press').asserted === false &&
      fn(rSD, 'si_lo_pzr_press').asserted === false &&
      fn(rSD, 'lo_flow').asserted === false,
      'the cooldown\'s own lineup, held');
  var prSD2 = P.createProtection({});
  var rSD2 = ride(prSD2, shutdown(), 30);
  ckT('the SAME plant with the blocks NOT taken cascades — the low-pressure trip and the SI ' +
      'actuation both latch (which is why "block SI" is a cooldown procedure step)',
      rSD2.reactor_trip === true && rSD2.si === true,
      'trip ' + rSD2.trip_cause + ', si ' + rSD2.si_cause);
  var prSD3 = P.createProtection({ blockLoPress: true, blockSI: true });
  var rSD3 = ride(prSD3, Object.assign(shutdown(), { pressure_mpa: 14.0 }), 1);
  ckT('climbing above P-11 REVOKES both requests themselves (auto-reinstate — the stale ' +
      'request that re-arms on the next cooldown is the #295 defeatable-trip shape)',
      prSD3.blockLoPress === false && prSD3.blockSI === false &&
      rSD3.p11_permit === false, '');
  var prLF = atPower();
  var rLF = ride(prLF, withReading('flow_frac', 0.5), 10);
  ckT('...and lo_flow still trips AT POWER (the P-7 gate blocks it only below 10 %)',
      fn(rLF, 'lo_flow').asserted === true && rLF.reactor_trip === true, '');

  /* ---- HIGH-HIGH LEVEL -> FEEDWATER ISOLATION (kind \'fwi\' — its own latch) ------------- */
  head('THE HIGH-HIGH  [P-14 class: not a reactor trip, not SI — the fwi latch]');
  var prHH = atPower();
  var rHH1 = ride(prHH, withReading('sg_level_frac', DOC.hihi_frac + 0.05), DOC.d_hihi - 0.5);
  ckT('below the delay hi-hi asserts but latches nothing',
      fn(rHH1, 'hi_hi_sg_level').asserted === true && rHH1.fwi === false, '');
  var rHH2 = ride(prHH, withReading('sg_level_frac', DOC.hihi_frac + 0.05), 1.0);
  ckT('past the delay the fwi latch stands with its cause — and NEITHER trip system fired',
      rHH2.fwi === true && rHH2.fwi_cause === 'hi_hi_sg_level' &&
      rHH2.reactor_trip === false && rHH2.si === false,
      'a hi-hi is an actuation, not a scram; the turbine trip is the CALLER\'s half');
  var rHH3 = ride(prHH, healthy(), 10);
  ckT('the fwi LATCHES through recovery, and reset clears it',
      rHH3.fwi === true &&
      (function () { P.reset(prHH);
                     return P.stepProtection(prHH, DT, healthy()).fwi === false; })(), '');

  /* ---- THE HIGH-LEVEL TRIP AND P-7 (stage 2b, 2026-08-19) ---------------------------------
   * WTSM 10.3.4.3: an AT-POWER trip, "only active if either reactor power or turbine power is
   * 10% or greater". Ginna's 87 % setpoint (TS Bases B 3.4.9). Unlike P-10 there is no operator
   * request in P-7 -- a plain automatic gate -- so the two permissives are DIFFERENT shapes on
   * purpose, and the checks pin both sides of the gate plus graceful absence of the reading. */
  head('THE HIGH-LEVEL TRIP  [at-power via P-7 -- a plain gate, not a revoked request]');
  ck("the setpoint is Ginna's 87 %", P.RPS.hi_pzr_level_frac, DOC.hi_pzr_level, 0, 'frac');
  ck('P-7 is the sourced 10 %', P.P7.frac, DOC.p7_frac, 0, 'frac');
  var sHiL = withReading('pzr_level_frac', 0.92);
  sHiL.power_frac = 0.05;                              /* below P-7: the trip is NOT ACTIVE */
  var rP7lo = ride(P.createProtection({}), sHiL, 10);
  ckT('92 % level BELOW P-7 does not even assert -- the at-power gate is real',
      fn(rP7lo, 'hi_pzr_level').asserted === false && rP7lo.reactor_trip === false &&
      rP7lo.p7_met === false,
      "a solid-bound pressurizer at 5 % power is the LTOP/heatup regime, not this trip's");
  var sHiL2 = withReading('pzr_level_frac', 0.92);
  sHiL2.power_frac = 0.12;                             /* above P-7, below every flux setpoint */
  var rP7hi = ride(P.createProtection({}), sHiL2, 10);
  ckT('...and the SAME level at 12 % power trips, on this function and no other',
      rP7hi.reactor_trip === true && rP7hi.trip_cause === 'hi_pzr_level' && rP7hi.p7_met === true,
      'held ' + fn(rP7hi, 'hi_pzr_level').held_s.toFixed(1) + ' s past the 2.0 s [open] delay');
  var sNoL = healthy();
  delete sNoL.pzr_level_frac;
  var rNoL = ride(atPower(), sNoL, 5);
  ckT('a plant with NO level reading reports the function UNAVAILABLE, not untripped-forever',
      fn(rNoL, 'hi_pzr_level').available === false && rNoL.reactor_trip === false,
      'the optional-reading convention: absence is reported, never silently healthy');

  /* ---- P-10, AND ITS ASYMMETRY IS THE POINT ---------------------------------------------
   * Ginna TS Bases B 3.3.1: the block is MANUAL and only PERMITTED above ~8 % RTP; the unblock
   * is AUTOMATIC below it. A symmetric model — an operator switch that simply holds — would be a
   * DEFEATABLE REACTOR TRIP, which is what this engine's predecessor shipped and had to have
   * superseded (#295 F1/F2). Both directions are checked, and so is the revocation. */
  /* ---- P-9: THE TURBINE TRIP IS A REACTOR TRIP ONLY ABOVE IT (TS Bases B 3.3.1 Fn 14/18d) --
   * The permissive has TWO sourced values: ~50 % with the Steam Dump System available, ~8 %
   * without — the setpoint IS the dumps' load-rejection capacity margin. No below-8 % no-trip
   * case exists on this plant: under 8 % the P-10 block auto-revokes and the low-flux trip
   * (35 % setting) fires first, which is the plant working, not a gap in this table. */
  head('P-9  [a turbine trip trips the reactor only when the dumps cannot carry the rejection]');
  function withTT(power, dumps) {
    var d = healthy(); d.power_frac = power; d.turbine_tripped = true;
    if (dumps === false) d.steam_dumps_available = false;
    return d;
  }
  var prT1 = atPower();
  var rT1 = ride(prT1, withTT(1.0), 0.1);
  ckT('a turbine trip at 100 % IS a reactor trip, cause turbine_trip, no delay',
      rT1.reactor_trip === true && prT1.trip_cause === 'turbine_trip',
      'cause ' + prT1.trip_cause);
  var prT2 = atPower();
  var rT2 = ride(prT2, withTT(0.40), 30);
  ckT('at 40 % with the dumps AVAILABLE it is NOT — the dumps carry the rejection (30 s ride)',
      rT2.reactor_trip === false, 'trip ' + rT2.reactor_trip);
  var prT3 = atPower();
  var rT3 = ride(prT3, withTT(0.40, false), 0.1);
  ckT('the SAME 40 % with the dumps UNAVAILABLE trips — P-9 moves to its 8 % value',
      rT3.reactor_trip === true && prT3.trip_cause === 'turbine_trip',
      'cause ' + prT3.trip_cause);
  ckT('p9_met reports the selected value: false at 40 % available, true at 40 % unavailable',
      rT2.p9_met === false && rT3.p9_met === true, '');

  /* ---- OT/OP DELTA-T: A COMPUTED SETPOINT, EVERY COEFFICIENT Table 15.0-7's ---------------
   * OT: sp = K1 + K2*(P-P') - K3*(T-T'); OP: sp = K4 (K6 = 0.00 is the table's own value).
   * The f(delta-I) penalty is SOURCED ZERO here: the lumped core's delta-I is identically 0,
   * inside the table's -14/+6 % deadband. The measured full-chain validation (dilution at
   * rods-MANUAL 100 %: OTdT terminates it at t = 2246 s after exactly the 16.4 degF Tavg rise
   * K3's slope predicts) lives in the facade smoke record, PWR2_VALIDATION.md sec 53. */
  head('OT/OP DELTA-T  [the setpoint MOVES with Tavg and pressure -- Table 15.0-7]');
  function dtDrivers(dtFrac, tavgC, pMpa) {
    var d = healthy(); d.delta_t_frac = dtFrac; d.tavg_c = tavgC;
    if (pMpa !== undefined) d.pressure_mpa = pMpa;
    return d;
  }
  var T_REF_C = 304.5;                       /* T' in the engine's own units */
  var prD = atPower();
  var rD = ride(prD, dtDrivers(1.0, T_REF_C), 5);
  var fOT = fn(rD, 'ot_delta_t'), fOP = fn(rD, 'op_delta_t');
  ckT('at the reference point the pair are available and the plant does not trip',
      fOT.available && fOP.available && rD.reactor_trip === false,
      'OT sp ' + fOT.setpoint.toFixed(3) + ', OP sp ' + fOP.setpoint.toFixed(3));
  ck('...and the OT setpoint is K1 plus the P-P-prime correction alone (T at T-prime)',
     fOT.setpoint, 1.30 + 0.00093 * (15.41 * 145.03774 - 2250), 1e-3, 'frac');
  /* K3 BITES: +10 degC of Tavg lowers the setpoint by 0.0185/degF * 18 degF = 0.333 */
  var rD2 = ride(atPower(), dtDrivers(1.0, T_REF_C + 10), 5);
  ck('+10 degC of Tavg lowers the OT setpoint by K3 x 18 degF',
     fn(rD2, 'ot_delta_t').setpoint, fOT.setpoint - 0.0185 * 18, 1e-3, 'frac');
  /* K2 BITES. The reference fixture sits at healthy()'s 15.41 MPa = 2234.9 psia (not at
   * P-prime), so the drop to 2050 psia is 184.9 psi — the first version asserted K2 x 200
   * and redded on its own arithmetic. */
  var rD3 = ride(atPower(), dtDrivers(1.0, T_REF_C, 2050 / 145.03774), 5);
  ck('dropping pressure to 2050 psia lowers the OT setpoint by K2 x the actual 184.9 psi',
     fn(rD3, 'ot_delta_t').setpoint,
     fOT.setpoint - 0.00093 * (15.41 * 145.03774 - 2050), 1e-3, 'frac');
  /* THE TRIP: a hot, high-dT plant crosses the MOVED setpoint and holds through the delay */
  var prD4 = atPower();
  var rD4 = ride(prD4, dtDrivers(1.10, T_REF_C + 12), 3);
  ckT('a hot plant at 110 % delta-T trips OVERTEMPERATURE after its sourced 2 s hold',
      rD4.reactor_trip === true && prD4.trip_cause === 'ot_delta_t',
      'cause ' + prD4.trip_cause + ' (sp ' + fn(rD4, 'ot_delta_t').setpoint.toFixed(3) + ')');
  /* OP trips at the flat K4 even with Tavg AT reference (K6 = 0) */
  var prD5 = atPower();
  var rD5 = ride(prD5, dtDrivers(1.16, T_REF_C), 3);
  ckT('116 % delta-T at reference Tavg trips OVERPOWER (the flat K4 = 1.15)',
      rD5.reactor_trip === true && prD5.trip_cause === 'op_delta_t',
      'cause ' + prD5.trip_cause);
  /* MISSING INPUT: no tavg_c -> the pair are UNAVAILABLE, never silently static */
  var dNoT = healthy(); dNoT.delta_t_frac = 1.4;
  var rD6 = ride(atPower(), dNoT, 5);
  ckT('without Tavg the pair go UNAVAILABLE -- a computed setpoint never falls back to static',
      fn(rD6, 'ot_delta_t').available === false && fn(rD6, 'op_delta_t').available === false &&
      rD6.reactor_trip === false, '1.40 delta-T unseen, correctly');

  /* ---- THE DELTA-T APPROACH SIGNAL (rod stop + runback, ch7 sec 7.2.3.2.1) --------------- */
  head('THE APPROACH SIGNAL  [3 % below a delta-T setpoint: rod stop + runback, with hysteresis]');
  /* Tavg +10 degC drops the OT setpoint to ~0.953 — BELOW the OP band (1.115+), so these
   * fixtures exercise the OT row's band alone. The first version tested at T-prime, where
   * every point within OT's band is already past OP's whole SETPOINT — the signal held on
   * the other row and the clear-check redded on its own fixture. */
  var prA = atPower();
  var rA = ride(prA, dtDrivers(0.5, T_REF_C + 10), 1);
  var spA = fn(rA, 'ot_delta_t').setpoint;
  ckT('well below the band the signal is quiet', rA.runback === false && rA.rod_stop === false,
      'OT sp ' + spA.toFixed(3));
  rA = ride(prA, dtDrivers(spA - 0.028, T_REF_C + 10), 1);
  ckT('at 2.8 % below the setpoint BOTH consumers assert -- and nothing trips',
      rA.runback === true && rA.rod_stop === true && rA.reactor_trip === false, '');
  rA = ride(prA, dtDrivers(spA - 0.032, T_REF_C + 10), 1);
  ckT('backing off to 3.2 % the signal HOLDS -- the hysteresis rides over channel noise',
      rA.runback === true, 'assert 3.0, clear 3.5: measured without it, noise flicker ' +
      'restarted the pulse timer and the 1.5/30 duty cycle degenerated to continuous ramping');
  rA = ride(prA, dtDrivers(spA - 0.045, T_REF_C + 10), 1);
  ckT('...and at 4.5 % it CLEARS', rA.runback === false, '');

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
  ckT('...the lo-lo level row too, and an absent level latches NO AFW start',
      fn(rN, 'sg_lolo_level').available === false && rN.afas_mdafw === false &&
      rN.afas_tdafw === false,
      'a missing gauge that read as "level fine" would be the pre-B1 header\'s fear inverted');
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
  ['the OT setpoint temperature term is DROPPED (the setpoint never comes down to meet a hot plant)',
   "                        - OTDT.k3_per_f * ((d.tavg_c * 9 / 5 + 32) - OTDT.t_ref_f);",
   '                        - 0;'],
  ['the OT pressure term is DROPPED',
   'return OTDT.k1 + OTDT.k2_per_psi * (d.pressure_mpa * PSIA_PER_MPA - OTDT.p_ref_psia)',
   'return OTDT.k1 + 0 * (d.pressure_mpa * PSIA_PER_MPA - OTDT.p_ref_psia)'],
  ['a missing Tavg silently falls back to the STATIC setpoint instead of unavailable',
   '        if (spDyn === undefined) available = false;',
   '        if (spDyn === undefined) spDyn = f.sp;'],
  ['the K1 constant drifts 1.30 -> 1.60',
   '    k1:    1.30,',
   '    k1:    1.60,'],
  ['the approach signal is deleted (the RPS never warns, only trips)',
   "          of.value >= of.setpoint - (pr.dtApproach ? 0.035 : 0.03)) dtNear = true;",
   '          false) dtNear = true;'],
  ['the hysteresis is removed (the bistable chatters at the line)',
   '(pr.dtApproach ? 0.035 : 0.03)',
   '0.03'],
  ['the band widens 3 % -> 30 % (the warning fires half the operating map)',
   "          of.value >= of.setpoint - (pr.dtApproach ? 0.035 : 0.03)) dtNear = true;",
   "          of.value >= of.setpoint - (pr.dtApproach ? 0.305 : 0.30)) dtNear = true;"],
  ['the turbine-trip reactor trip is deleted (P-9 reports into a void)',
   "    if (drivers.turbine_tripped && drivers.power_frac >= p9frac && !pr.reactor_trip) {\n      pr.reactor_trip = true; pr.trip_cause = 'turbine_trip';\n    }",
   ''],
  ['P-9 ignores dump availability (the 8 % value is never selected)',
   "    var p9frac = drivers.steam_dumps_available === false ? P9.frac_no_dumps : P9.frac_dumps;",
   '    var p9frac = P9.frac_dumps;'],
  ['the P-9 gate is deleted (any turbine trip trips the reactor, dumps or no dumps)',
   'drivers.turbine_tripped && drivers.power_frac >= p9frac',
   'drivers.turbine_tripped'],
  ['the P-7 at-power gate is deleted (the high-level trip fires during heatup)',
   '        if (f.atPower && drivers.power_frac < P7.frac) asserted = false;',
   ''],
  ['the high-level setpoint drifts 87 -> 95 %',
   '    hi_pzr_level_frac:  0.87,',
   '    hi_pzr_level_frac:  0.95,'],
  ['the high-level trip function is deleted from the table',
   "      { id: 'hi_pzr_level', name: 'High pressurizer level', kind: 'rps', dir: +1,\n        sp: RPS.hi_pzr_level_frac, unit: 'frac', read: 'pzr_level_frac',\n        delay: DELAY.hi_pzr_level, atPower: true },",
   ''],
  ['a healthy plant TRIPS -- the comparison direction is inverted',
   '        asserted = f.dir > 0 ? (value >= sp) : (value <= sp);',
   '        asserted = f.dir > 0 ? (value <= sp) : (value >= sp);'],
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
   '        margin: available ? (f.dir > 0 ? sp - value : value - sp) : undefined',
   '        margin: available ? Math.max(0, f.dir > 0 ? sp - value : value - sp) : undefined'],
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
   '    pr.reactor_trip = false; pr.si = false;', '    pr.si = false;'],
  /* THE AFW STARTS (2026-08-20) */
  ['the lo-lo setpoint moved off the installed 17 % (toward the 0 % analysis limit)',
   '    lolo_frac: 0.17,', '    lolo_frac: 0.05,'],
  ['the lo-lo delay is zeroed (a degenerate latch reads exactly like a working feature)',
   '    sg_lolo_level: 2.0         /*', '    sg_lolo_level: 0.0         /*'],
  ['the lo-lo table row is DELETED — no trip, no starts, nothing says so',
   "      { id: 'sg_lolo_level', name: 'Low-low steam generator water level', kind: 'rps', dir: -1,\n        sp: SGLL.lolo_frac, unit: 'frac', read: 'sg_level_frac', delay: DELAY.sg_lolo_level },",
   ''],
  ['the bistable\'s second consumer is disconnected (trip fires, AFW never starts)',
   "        if (f.id === 'sg_lolo_level') sgLolo = true;   /* the bistable's second consumer */",
   ''],
  ['SI cross-wired into the TDAFW start (the source starts the motor-driven pumps only)',
   '    if (sgLolo && !pr.afas_tdafw) { pr.afas_tdafw = true; pr.afas_tdafw_cause = \'sg_lolo_level\'; }',
   '    if ((sgLolo || pr.si) && !pr.afas_tdafw) { pr.afas_tdafw = true; pr.afas_tdafw_cause = \'sg_lolo_level\'; }'],
  ['the SI->MDAFW start is dropped',
   "    if (pr.si && !pr.afas_mdafw) { pr.afas_mdafw = true; pr.afas_mdafw_cause = 'si'; }",
   ''],
  ['reset leaves the AFW-start latches standing',
   '    pr.afas_mdafw = false; pr.afas_tdafw = false;', ''],
  ['the loss-of-offsite-power start is dropped (the sourced LOOP start, #507 wave 4)',
   '    if (drivers.loss_of_offsite && !pr.afas_mdafw) {\n      pr.afas_mdafw = true; pr.afas_mdafw_cause = \'loss_of_offsite_power\';\n    }',
   ''],
  ['the LOOP start reaches only ONE pump (the source says all preferred pumps)',
   '    if (drivers.loss_of_offsite && !pr.afas_tdafw) {\n      pr.afas_tdafw = true; pr.afas_tdafw_cause = \'loss_of_offsite_power\';\n    }',
   ''],
  /* P-11 (#507 wave 10) */
  ['the P-11 revoke is deleted (a stale block re-arms itself on the next cooldown)',
   '    if (!p11Below) {\n      if (pr.blockLoPress) pr.blockLoPress = false;\n      if (pr.blockSI) pr.blockSI = false;\n    }',
   ''],
  ['the SI block gates nothing (a "blocked" shutdown plant injects anyway)',
   "        if (f.kind === 'esfas' && pr.blockSI) asserted = false;",
   ''],
  ['the low-pressure trip block gates nothing',
   "        if (f.id === 'lo_pzr_press' && pr.blockLoPress) asserted = false;",
   ''],
  ['lo_flow loses its P-7 gate (a shutdown plant with secured RCPs reads as a loss-of-flow accident)',
   "        sp: RPS.lo_flow_frac, unit: 'frac', read: 'flow_frac', delay: DELAY.lo_flow,\n        atPower: true },",
   "        sp: RPS.lo_flow_frac, unit: 'frac', read: 'flow_frac', delay: DELAY.lo_flow },"],
  /* THE FEED-TRAIN FUNCTIONS (2026-08-21) */
  ['the hi-hi setpoint moved off the adopted 90 %',
   '    hi_hi_frac: 0.90,', '    hi_hi_frac: 0.99,'],
  ['the hi-hi row is DELETED (nothing stops an overfeed)',
   "      { id: 'hi_hi_sg_level', name: 'High-high steam generator water level', kind: 'fwi', dir: +1,\n        sp: SGLL.hi_hi_frac, unit: 'frac', read: 'sg_level_frac', delay: DELAY.hi_hi_sg_level },",
   ''],
  ['the fwi latch is disconnected from its row',
   '    if (anyFwi && !pr.fwi) { pr.fwi = true; pr.fwi_cause = anyFwi; }', ''],
  ['the loss-of-main-feed start is dropped',
   "    if (drivers.main_feed_lost && !pr.afas_mdafw) {\n      pr.afas_mdafw = true; pr.afas_mdafw_cause = 'loss_of_main_feed';\n    }",
   ''],
  ['reset leaves the fwi latch standing',
   '    pr.fwi = false;', '']
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
