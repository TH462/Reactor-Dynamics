/* run_pwr2_engine.js — the facade gate (2026-08-19, owner ruling "A": the preview-page route).
 *
 * THE CENTRAL CLAIM is equivalence: pwr2_engine assembles and steps the SAME plant the gates
 * wire by hand, so its settled state must match a hand-wired ride to tight tolerance — the
 * facade proven against the independent wiring, not against itself. After that: every command
 * reaches its system with an observable effect; the caller-half of HR5 (a protection trip
 * inserts the rods with no command; SI starts the ECCS lineup); and the wiring mutations a
 * facade makes possible for the first time (drop the relief sink, unhook the level controller,
 * delete the scram-on-trip) each red.
 *
 * Run: node test/run_pwr2_engine.js
 */
'use strict';
var path = require('path');
var SRC = path.join(__dirname, '..', 'engines', 'pwr2');
var fs = require('fs');
var ORDER = ['pwr2_water', 'pwr2_vtable', 'pwr2_geometry', 'pwr2_core', 'pwr2_loop',
  'pwr2_kinetics', 'pwr2_fuel', 'pwr2_reactor', 'pwr2_sources', 'pwr2_sg', 'pwr2_turbine',
  'pwr2_relief', 'pwr2_condenser', 'pwr2_cvcs', 'pwr2_eccs', 'pwr2_afw', 'pwr2_damage',
  'pwr2_protection', 'pwr2_pressurizer', 'pwr2_dumpctl', 'pwr2_break', 'pwr2_containment',
  'pwr2_true_state', 'pwr2_instruments'];

function loadAll(engSource, coreSource) {
  ORDER.forEach(function (f) {
    if (f === 'pwr2_core' && coreSource !== undefined) { (0, eval)(coreSource); return; }
    delete require.cache[require.resolve(path.join(SRC, f + '.js'))];
    require(path.join(SRC, f + '.js'));
  });
  if (engSource === undefined) {
    delete require.cache[require.resolve(path.join(SRC, 'pwr2_engine.js'))];
    require(path.join(SRC, 'pwr2_engine.js'));
  } else {
    (0, eval)(engSource);
  }
  return globalThis.RD.pwr2;
}

function runSuite(RD, rec, quiet) {
  var EN = RD.engine, W = RD.water, S = RD.sources, G = RD.sg, TB = RD.turbine,
      RL = RD.relief, CD = RD.condenser, DC = RD.dumpctl, PZ = RD.pressurizer,
      K = RD.kinetics, R = RD.reactor;
  var DT = 0.02;

  function ck(name, got, want, tol, unit) {
    var d = Math.abs(got - want), ok = d <= tol && isFinite(got);
    rec.push({ name: name, ok: ok });
    if (!quiet) console.log((ok ? '  PASS  ' : '  FAIL  ') + name.padEnd(58) +
      'got ' + (typeof got === 'number' ? got.toFixed(3) : got) + ' want ' + want +
      ' (tol ' + tol + ') ' + (unit || ''));
  }
  function ckT(name, cond, note) {
    rec.push({ name: name, ok: !!cond });
    if (!quiet) console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (note ? '  -- ' + note : ''));
  }
  function head(s) { if (!quiet) console.log('\n' + s); }
  function run(eng, secs) {
    var ts = null;
    for (var i = 0; i < secs / DT; i++) ts = EN.step(eng, DT);
    return ts;
  }

  var SETTLE = quiet ? 120 : 300;

  /* ---- 1. EQUIVALENCE: the facade against the gates' own hand wiring ----------------------- */
  head('EQUIVALENCE  [the facade must BE the hand wiring, proven against it]');
  var eng = EN.createEngine({});
  var tsE = run(eng, SETTLE);
  /* the hand-wired plant, retyped from run_pwr2_loadfollow's ride() — the independent copy */
  var pz = PZ.createPressurizer({});
  var sys = S.createPlant({ h: W.h_l(304.5, 15.41), P: 15.41, extraMass: PZ.extraMassFn(pz) });
  var rx = R.createReactor({ P: 1.0, coolTemp_c: 304.5 });
  var B = K.criticalBoron(rx.kin, 304.5, 15.41, null, rx.kin.X / rx.kin.X_eq_full,
                          rx.fuel.T_fuel_c);
  var sg = G.createSG({}), tb = TB.createTurbine({ load_target_mwe: 100 });
  var rl = RL.createRelief({}), cd = CD.createCondenser({}), dc = DC.createDumpCtl({});
  var rated = TB.steamDemand(tb, sg.P, G.SG.h_feed);
  var rH = null;
  for (var i = 0; i < SETTLE / DT; i++) {
    var steam = TB.steamDemand(tb, sg.P, G.SG.h_feed);
    var cr = CD.stepCondenser(cd, DT, {
      duty_kW: steam * (W.h_g(sg.P) - G.SG.h_feed) * (1 - TB.etaCycle()),
      cw_pumps_running: true });
    var dcr = DC.stepDumpCtl(dc, DT, { tavg_c: G.primaryTavg(sys), load_frac: 1,
      turbine_tripped: false, condenser_available: cr.available });
    var rr = RL.stepRelief(rl, sg.P, DT, { rated_steam_kgs: rated,
      dump_demand: dcr.dump_demand, condenser_available: cr.available });
    var out = steam + rr.total_kgs;
    var sr = G.stepSG(sg, G.primaryTavg(sys), DT, { feed: out, steam: out });
    TB.stepTurbine(tb, DT, { steam_kgs: steam, P_mpa: sr.P_sec, h_feed: G.SG.h_feed });
    rH = R.stepReactor(rx, sys, DT, { boron_ppm: B, rodGroups: null });
    S.stepPlant(sys, DT, { heats: rH.heats, sgDuty: sr.duty_kW });
    PZ.stepPressurizer(pz, sys, DT, {});
  }
  /* ⚠ NOT EXACT, and the differences are DECLARED, each one a facade feature: the facade runs
   * CVCS (letdown/charging/seal reshape the inventory), a 200-step rod bank at its own worth,
   * and its boron trim solves against that lineup. The claim is same-plant-same-regime, bands
   * a facade wiring error (a dropped system, a doubled heat) blows through. */
  ckT('the settled facade sits in the hand-wired plant\'s regime',
      Math.abs(tsE.pressure_mpa - sys.P) < 0.15 &&
      Math.abs(tsE.tavg_c - G.primaryTavg(sys)) < 1.5 &&
      Math.abs(tsE.power_pct - rH.power_pct) < 2.0,
      'P ' + tsE.pressure_mpa.toFixed(3) + ' vs ' + sys.P.toFixed(3) + ' MPa, Tavg ' +
      tsE.tavg_c.toFixed(2) + ' vs ' + G.primaryTavg(sys).toFixed(2) + ' degC, power ' +
      tsE.power_pct.toFixed(1) + ' vs ' + rH.power_pct.toFixed(1) + ' %');
  ckT('...critical, at pressure, subcooled, level near program — the §43 plant through one door',
      Math.abs(tsE.reactivity_pcm) < 15 && tsE.pressure_mpa > 15.2 &&
      tsE.subcooling_c > 10 && Math.abs(tsE.pzr_level_pct - 61.5) < 8,
      tsE.reactivity_pcm.toFixed(1) + ' pcm, ' + (tsE.pressure_mpa * 145.04).toFixed(0) +
      ' psia, subcool ' + (tsE.subcooling_c * 1.8).toFixed(1) + ' degF, level ' +
      tsE.pzr_level_pct.toFixed(1) + ' %');
  ckT('the true_state passes through whole — the shim fields a page will read are all present',
      typeof tsE.thot_c === 'number' && typeof tsE.steam_pressure_mpa === 'number' &&
      typeof tsE.mwe_output === 'number' && tsE.scrammed === false &&
      tsE.porv_stuck === false && typeof tsE.core_void_fraction === 'number',
      '');

  /* ---- 2. EVERY COMMAND REACHES ITS SYSTEM -------------------------------------------------- */
  head('THE ONE DOOR  [each command lands with an observable effect]');
  EN.command(eng, 'load_mwe', 80);
  var t80 = run(eng, quiet ? 60 : 120);
  ckT('load_mwe moves the turbine and the plant follows',
      Math.abs(t80.mwe_output - 80) < 1 && t80.power_pct < 97, 'MWe ' +
      t80.mwe_output.toFixed(1) + ', power ' + t80.power_pct.toFixed(1) + ' %');
  EN.command(eng, 'rod_target', 190);
  var tRod = run(eng, 5);
  ckT('rod_target SLEWS — five seconds moves about five steps, not the whole demand',
      Math.abs(tRod.rod_steps - 195) < 1.5,
      tRod.rod_steps.toFixed(1) + ' steps from 200 toward 190 — instant rods are a lever no ' +
      'real plant has');
  EN.command(eng, 'rod_target', 200); run(eng, quiet ? 20 : 40);
  EN.command(eng, 'aux_spray', 0.5);
  var tAux = run(eng, 1);
  ckT('aux_spray reaches the vessel', tAux.spray_flow_pct !== undefined &&
      eng._pzr.aux_spray_frac === 0.5, 'aux frac ' + eng._pzr.aux_spray_frac);
  EN.command(eng, 'aux_spray', 0);
  EN.command(eng, 'porv_stick', true);
  var tStick = run(eng, 1);
  ckT('porv_stick reaches the vessel and the contract reports it',
      tStick.porv_stuck === true && tStick.porv_open === true, '');
  EN.command(eng, 'block_valve', false);
  var tBlock = run(eng, 1);
  ckT('block_valve isolates the stuck valve', tBlock.block_valve_open === false &&
      eng._pzr.relief_kgs === 0, '');
  EN.command(eng, 'porv_stick', false); EN.command(eng, 'block_valve', true);
  ckT('an unknown command THROWS — one door, spelled right',
      (function () { try { EN.command(eng, 'porv_stik', true); return false; }
                     catch (e) { return /unknown command/.test(e.message); } })(), '');

  /* ---- 2b. A MANUAL SCRAM IS A REACTOR TRIP -------------------------------------------------
   * Both checks REDDED on the pre-fix build (measured 2026-08-19): 'scram' bypassed the RPS
   * (scrammed stayed false, cause null), the turbine kept pulling 100 MWe from a 2 % core, the
   * -240 F/min cooldown drained the pressurizer at 1724 psia and the plant NaN'd at t=54.5 s
   * (#499 thread). Sources: manual trip = Ginna TS Bases B 3.3.1 Fn 1 (ML20339A221); turbine
   * trip on reactor trip = Ginna UFSAR ch15 (ML20339A101), "zero delay is assumed". */
  head('THE PUSHBUTTON  [a manual scram latches the RPS and trips the turbine]');
  EN.command(eng, 'scram', true);
  var tsS = run(eng, 10);
  ckT('scram latches the RPS (cause: manual) and the turbine trips with it, zero delay',
      tsS.scrammed === true && eng.pt.trip_cause === 'manual' &&
      tsS.turbine_tripped === true && tsS.rod_steps === 0,
      'cause ' + eng.pt.trip_cause + ', turbine_tripped ' + tsS.turbine_tripped +
      ', rods ' + tsS.rod_steps);
  tsS = run(eng, quiet ? 120 : 240);
  ckT('...and the tripped plant rides to no-load on the steam dumps, finite',
      isFinite(tsS.pressure_mpa) && tsS.power_pct < 1.0 &&
      Math.abs((tsS.tavg_c * 1.8 + 32) - 557) < 6,
      'Tavg ' + (tsS.tavg_c * 1.8 + 32).toFixed(1) + ' degF vs no-load 557, power ' +
      tsS.power_pct.toFixed(2) + ' %, P ' + (tsS.pressure_mpa * 145.04).toFixed(0) + ' psia');

  /* ---- 3. THE CALLER-HALF OF HR5 ------------------------------------------------------------ */
  head('THE CALLER\'S HALF  [the RPS reports; THIS file inserts the rods]');
  var eng2 = EN.createEngine({});
  run(eng2, quiet ? 60 : 120);
  EN.command(eng2, 'break_open', { area_m2: 0.004, node: 'cold_leg' });
  /* 30 s: the trip (lo_pzr 1775 psia) and SI (1715) both latch inside ~5 s on a 40 cm2 break —
   * the CALLER-HALF claim needs the latching window, not the endgame. Riding deeper finds a
   * REAL engine defect outside this gate's subject: with the FULL lineup (ECCS + CVCS fighting
   * the blowdown) the plant oscillates h between the envelope walls near-but-not-AT the floor
   * (~0.115 MPa) and NaNs at ~68 s — the #487 class at a pressure the beyond-model latch's
   * flooredLow condition cannot see. Filed as #499; not this gate's to fix. */
  var tsB = run(eng2, 30);
  ckT('a 40 cm2 break trips the plant and the FACADE scrams the rods, uncommanded',
      tsB.scrammed === true && tsB.rod_steps === 0 && eng2.pt.trip_cause !== null,
      'trip on ' + eng2.pt.trip_cause + ', rods ' + tsB.rod_steps + ' — pwr2_protection only ' +
      'reports; the caller half lived nowhere until this file');
  ckT('...and the SI latch STARTS the ECCS lineup, uncommanded',
      eng2.pt.si === true && eng2.ec.hhsiRunning === true && eng2.ec.lhsiRunning === true,
      'SI on ' + eng2.pt.si_cause);
  ckT('...and the plant is finite through the latching window, ECCS answering',
      isFinite(tsB.pressure_mpa) && isFinite(tsB.fuel_temp_c) &&
      tsB.core_inventory_pct > 30,
      (tsB.pressure_mpa * 145.04).toFixed(0) + ' psia, inventory ' +
      tsB.core_inventory_pct.toFixed(1) + ' % at 30 s');
  /* #499 first instance, now GUARDED: ridden deeper, the near-floor h-oscillation (nodes
   * pinned on BOTH envelope walls at once) must latch beyond_model and hold — the pre-guard
   * build threw NaN out of pwr2_damage at t = 68.5 s. Measured post-guard: latches 46.9 s. */
  var latchA = false, threwA = null;
  try {
    for (var kk = 0; kk < 120 / DT; kk++) {
      tsB = EN.step(eng2, DT);
      if (eng2.sys.beyond_model) { latchA = true; break; }
    }
  } catch (eA) { threwA = eA.message; }
  ckT('...ridden deeper the plant DECLARES beyond-model and holds — no NaN (#499)',
      latchA && threwA === null && isFinite(tsB.pressure_mpa) && isFinite(tsB.fuel_temp_c),
      threwA ? ('THREW: ' + threwA.slice(0, 60)) :
      ('latched ' + latchA + ' at ' + tsB.sim_time_s.toFixed(1) + ' s, P ' +
       (tsB.pressure_mpa * 145.04).toFixed(1) + ' psia'));

  /* ---- 2c. P-9 THROUGH THE DOOR --------------------------------------------------------------
   * The setpoint logic (50 %/8 % by dump availability, the no-trip band) is gated at the
   * protection layer's own gate; THIS check is the wiring claim — turbine_tripped and dump
   * availability actually reach the RPS from the facade. */
  head('P-9 THROUGH THE DOOR  [a commanded turbine trip at power IS a reactor trip]');
  var eng4 = EN.createEngine({});
  run(eng4, quiet ? 60 : 120);   /* the margin check needs the SETTLED split: at t = 5 s the
                                  * startup transient has delta-T 27 % over design and the
                                  * margin reads 0.013 — measured, not a wiring defect */
  /* the delta-T pair's WIRING half (their setpoint logic is run_pwr2_protection's): the
   * facade computes delta_t_frac and tavg_c, so the rows must be AVAILABLE with a sane
   * at-power margin — measured 0.305 at the settled design point, ~0.29 this early. */
  var fRep = null;
  eng4.rpsReport.functions.forEach(function (f) { if (f.id === 'ot_delta_t') fRep = f; });
  ckT('overtemperature delta-T is LIVE through the facade wiring, margin at power ~0.3',
      fRep !== null && fRep.available === true && fRep.margin > 0.15 && fRep.margin < 0.45,
      fRep === null ? 'row missing' : ('margin ' + fRep.margin.toFixed(3)));

  EN.command(eng4, 'turbine_trip', true);
  var ts4 = run(eng4, 5);
  ckT('the turbine trip reaches the RPS and the reactor trips with it (TS Bases B 3.3.1 Fn 14)',
      ts4.scrammed === true && eng4.pt.trip_cause === 'turbine_trip',
      'cause ' + eng4.pt.trip_cause + ', scrammed ' + ts4.scrammed);
  /* ---- 2d. HARD RULE 1'S PAYOFF: THE RPS BELIEVES THE INSTRUMENTS ---------------------------
   * Fail the pressure channel LOW on a HEALTHY plant: the RPS must trip and inject on the
   * lying channel (measured: lo_pzr_press + SI within seconds, true pressure untouched at
   * ~2224 psia until the trip's own contraction moves it). To test an HR1 wiring you have to
   * FAIL the channel — a healthy instrument is indistinguishable from truth (#220's lesson,
   * and the reads-truth mutation is exactly the wiring this check exists to red). */
  head('THE LYING CHANNEL  [a failed-low pressure channel trips a healthy plant]');
  /* a FRESH plant — eng4 is post-trip by now, and this check's whole point is that the
   * PLANT is healthy while the channel lies */
  var eng5 = EN.createEngine({});
  run(eng5, quiet ? 20 : 60);
  var trueP = eng5.sys.P;
  EN.command(eng5, 'instrument_fail', { id: 'primary_pressure', mode: 'low' });
  run(eng5, 10);
  ckT('the RPS trips and injects on the LYING channel, the plant itself healthy',
      eng5.pt.reactor_trip === true && eng5.pt.trip_cause === 'lo_pzr_press' &&
      eng5.pt.si === true && trueP > 14.5,
      'cause ' + eng5.pt.trip_cause + ', SI ' + eng5.pt.si + ', true P was ' +
      (trueP * 145.04).toFixed(0) + ' psia when the channel failed');

  /* ---- 3b. THE DRAIN ROOT-JUMP (#499 second instance) ---------------------------------------
   * The pre-fix facade let a scram leave the turbine loaded; the -240 F/min cooldown drained
   * the pressurizer at 54 kg/s and ONE step teleported the solve 1724 -> 2611 psia (surge
   * +20,085 kg/s). The facade fix makes that unreachable through the door, so this fixture
   * FORCES the pre-fix wiring (tb.tripped = false every step) to keep the trajectory reachable
   * — the subject is pwr2_core's root-tracking limit, which must REFUSE the far root and
   * declare beyond_model. maxStep pins the teleport itself: with the limit deleted, some step
   * moves > 2 MPa whether or not a later latch fires. */
  head('THE DRAIN ROOT-JUMP  [a vanished near root is declared, never adopted]');
  var eng3 = EN.createEngine({});
  run(eng3, 36);
  EN.command(eng3, 'scram', true);
  var latch3 = false, threw3 = null, ts3 = null, maxStep = 0, Pp3 = eng3.sys.P;
  try {
    for (kk = 0; kk < 120 / DT; kk++) {
      eng3.tb.tripped = false;                 /* the PRE-FIX wiring, forced */
      ts3 = EN.step(eng3, DT);
      var d3 = Math.abs(eng3.sys.P - Pp3); if (d3 > maxStep) maxStep = d3;
      Pp3 = eng3.sys.P;
      if (eng3.sys.beyond_model) { latch3 = true; break; }
    }
  } catch (e3) { threw3 = e3.message; }
  ckT('a fast drain whose near root VANISHES is refused and declared — never teleported',
      latch3 && threw3 === null && maxStep < 2.0 && ts3 !== null && isFinite(ts3.pressure_mpa),
      threw3 ? ('THREW: ' + threw3.slice(0, 60)) :
      ('latched ' + latch3 + ', max |dP|/step ' + maxStep.toFixed(3) + ' MPa, P ' +
       (ts3 === null ? '?' : (ts3.pressure_mpa * 145.04).toFixed(0)) + ' psia'));
}

console.log('\nPWR2 -- THE ENGINE FACADE: one door, the gates\' wiring written once');
var rec = [];
runSuite(loadAll(), rec, false);
var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;

var ENSRC = fs.readFileSync(path.join(SRC, 'pwr2_engine.js'), 'utf8').replace(/\r\n/g, '\n');
var MUTATIONS = [
  ['the pressurizer relief sink is dropped (mass relieves without leaving)',
   "srcs.push({ node: 'hot_leg', mdot: -eng._pzRelief, h: eng._pzReliefH });",
   ''],
  ['the level controller is unhooked from charging',
   'eng.cv.chargingDemand = pzr.charging_demand;',
   ''],
  ['the scram-on-trip is deleted (the RPS reports into a void)',
   "if (ptr.reactor_trip && !eng._lastTrip) { eng.rodTarget = 0; eng._scramT = 0; }",
   ''],
  ['SI never starts the ECCS',
   'if (ptr.si) { eng.ec.hhsiRunning = true; eng.ec.lhsiRunning = true; }',
   ''],
  ['the oxidation heat is never fed back',
   'eng._Qox = dr.Q_ox_kW;',
   'eng._Qox = 0;'],
  ['the rod slew is deleted (commands teleport the bank)',
   'eng.rodSteps += Math.max(-dS, Math.min(dS, eng.rodTarget - eng.rodSteps));',
   'eng.rodSteps = eng.rodTarget;'],
  ['the dump controller never reaches the relief valves',
   'dump_demand: dcr.dump_demand,',
   'dump_demand: 0,'],
  ['the manual-trip pushbutton wire is cut before the RPS',
   'manual_trip: eng._manualTrip',
   'manual_trip: false'],
  ['the turbine flag never reaches the RPS (P-9 watches a wire that is not connected)',
   'turbine_tripped: eng.tb.tripped,',
   'turbine_tripped: false,'],
  ['the loop delta-T never reaches the RPS (both delta-T trips silently unavailable)',
   "delta_t_frac: rd.thot !== undefined ? (rd.thot - rd.tcold) / DT0_C",
   'delta_t_frac: undefined ? 0'],
  ['the RPS reads TRUTH, not the instruments (a failed channel can no longer lie to it)',
   'pressure_mpa: rd.primary_pressure !== undefined ? rd.primary_pressure : sys.P,',
   'pressure_mpa: sys.P,'],
  /* CORE mutations — 4th element 'core' substitutes a mutated pwr2_core into the load order */
  ['the root-tracking limit is deleted (a vanished root is ADOPTED as a teleport)',
   'var P_JUMP_MAX = 2.0;',
   'var P_JUMP_MAX = 1e9;', 'core'],
  ['the both-walls latch is deleted (the near-floor oscillation runs unlatched)',
   'if (wallHi > 0 && wallLo > 0) sys.beyond_model = true;',
   '', 'core']
];
var CORESRC = fs.readFileSync(path.join(SRC, 'pwr2_core.js'), 'utf8').replace(/\r\n/g, '\n');

console.log('\ninjection self-test (' + MUTATIONS.length + ' mutations):');
var blind = 0;
MUTATIONS.forEach(function (m) {
  var base = m[3] === 'core' ? CORESRC : ENSRC;
  var mutated = base.replace(m[1], m[2]);
  if (mutated === base) { console.log('  ANCHOR MISS ' + m[0]); blind++; return; }
  var rec2 = [];
  try {
    runSuite(m[3] === 'core' ? loadAll(undefined, mutated) : loadAll(mutated), rec2, true);
  } catch (e) { /* a crash counts as caught */ }
  var f2 = rec2.length ? rec2.filter(function (r) { return !r.ok; }).length : 1;
  if (f2 === 0) { console.log('  BLIND TO  ' + m[0] + '   <-- THIS GATE CANNOT SEE IT'); blind++; }
  else console.log('  caught    ' + m[0].padEnd(64) + f2 + ' checks red');
});
loadAll();

console.log('\n' + '='.repeat(70));
console.log('  injection self-test: ' + (MUTATIONS.length - blind) + '/' + MUTATIONS.length +
  ' mutations caught' + (blind ? '  ** ' + blind + ' BLIND SPOTS -- GATE FAILS **' : ', no blind spots'));
console.log('  run_pwr2_engine: ' + pass + ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit(fail > 0 || blind > 0 ? 1 : 0);
