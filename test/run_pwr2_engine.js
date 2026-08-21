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
  'pwr2_protection', 'pwr2_pressurizer', 'pwr2_dumpctl', 'pwr2_break', 'pwr2_containment', 'pwr2_rhr',
  'pwr2_true_state', 'pwr2_instruments', 'pwr2_feedwater'];

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

/* runSuite(RD, rec, quiet, only) — `only` scopes a MUTATION REPLAY to the section group that
 * can see that mutation: 'A' equivalence/door/pushbutton (one engine chain), 'B' the
 * P-9/lying-channel family (eng4-6), 'C' the runback (eng7), 'D' the break + drain (eng2-3),
 * 'E' the AFW starts, 'F' the feed train.
 * The CLEAN pass runs everything. Measured before this existed: 17 mutations x the whole
 * suite = 1074 s of contention in the aggregate gate — the replay cost scales with every
 * fixture ever added, and a mutation only needs the checks built to see it. */
function runSuite(RD, rec, quiet, only) {
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
  function grp(g) { return only === undefined || only === g; }
  function run(eng, secs) {
    var ts = null;
    for (var i = 0; i < secs / DT; i++) ts = EN.step(eng, DT);
    return ts;
  }

  var SETTLE = quiet ? 120 : 300;

  if (grp('A')) {
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

  }

  if (grp('D')) {
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
  var latchA = false, threwA = null, qoxSeen = false;
  try {
    for (var kk = 0; kk < 180 / DT; kk++) {
      tsB = EN.step(eng2, DT);
      /* the oxidation WIRING's designed observable: once the damage layer reports heat, the
       * reactor must RECEIVE it next step (eng._Qox is that wire). Chaos used to catch the
       * zeroed-wire mutation incidentally; this sees it deterministically. */
      if (eng2.dm && eng2._Qox > 0) qoxSeen = true;
      if (eng2.sys.beyond_model) { latchA = true; break; }
    }
  } catch (eA) { threwA = eA.message; }
  ckT('...ridden deeper the plant DECLARES beyond-model and holds — no NaN (#499)',
      /* EITHER guard family may latch. Measured (2026-08-20g): since the RPS moved to
       * instruments this trajectory's escape is a KINETICS RUNAWAY (power 7.5e51 while every
       * node h sits inside the envelope — no clamp, no floor pin, so no inner latch), and the
       * facade screen is the guard family that covers it. A `!_dead` condition here asserted
       * inner-only and redded on the clean build. The guard MUTATIONS stay discriminated by
       * their other observables (maxStep pins the root-jump; the SI/finite checks move). */
      latchA && threwA === null &&
      isFinite(tsB.pressure_mpa) && isFinite(tsB.fuel_temp_c),
      threwA ? ('THREW: ' + threwA.slice(0, 60)) :
      ('latched ' + latchA + ' at ' + tsB.sim_time_s.toFixed(1) + ' s, P ' +
       (tsB.pressure_mpa * 145.04).toFixed(1) + ' psia — 46.9 s truth-fed, ~168 s since the ' +
       'RPS moved to instruments (the switchover shifted the trajectory; latch+finite is the claim)'));
  ckT('...and the oxidation heat the damage layer reported REACHED the reactor on the way down',
      qoxSeen, 'eng._Qox > 0 observed during the ride — the wiring, seen directly');

  }

  if (grp('B')) {
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
  /* THE LADDER'S WIRE, probed with a HIGH lie: the startup dip keeps true P ~72 psi below
   * the setpoint for ~330 s (PWR2_VALIDATION.md §43), so a LOW lie cannot discriminate — the
   * truth-fed ladder has the heaters legitimately full there too, which kept the wire-cut
   * mutation blind through two fixture attempts. Spray and the PORV answer only a HIGH
   * error: on the lie they open; on truth (below setpoint) they cannot. */
  EN.command(eng5, 'instrument_fail', { id: 'primary_pressure', mode: 'high' });
  var tsH = run(eng5, 1);
  ckT('...and SPRAY + PORV open on a HIGH lie, pre-trip (the ladder reads the instrument)',
      tsH.spray_flow_pct > 50 && tsH.porv_open === true,
      'spray ' + tsH.spray_flow_pct.toFixed(0) + ' %, PORV ' + tsH.porv_open +
      ' — true P below the setpoint the whole time');
  EN.command(eng5, 'instrument_restore', 'primary_pressure');
  EN.command(eng5, 'reset_protection', true);   /* hi_pzr may have latched on the railed lie */
  run(eng5, quiet ? 5 : 10);
  var trueP = eng5.sys.P;
  EN.command(eng5, 'instrument_fail', { id: 'primary_pressure', mode: 'low' });
  run(eng5, 10);
  ckT('the RPS trips and injects on the LYING channel, the plant itself healthy',
      eng5.pt.reactor_trip === true && eng5.pt.trip_cause === 'lo_pzr_press' &&
      eng5.pt.si === true && trueP > 14.5,
      'cause ' + eng5.pt.trip_cause + ', SI ' + eng5.pt.si + ', true P was ' +
      (trueP * 145.04).toFixed(0) + ' psia when the channel failed');

  /* the DUMP side of the switchover: a lying-high Tavg opens the dumps on a healthy plant —
   * and the common-mode tail is DECLARED, not hidden: the same lumped channel feeds OTdT,
   * whose setpoint collapses on the railed reading, so the plant also trips (the TS Bases'
   * own control/protection-interaction discussion; a real plant's 2/4 channel logic keeps a
   * single failure from doing this, and this model has one lumped channel per parameter). */
  /* The dump controller's wire, seen through a STUCK channel — measured: a fail-high lie
   * cannot discriminate here (OTdT trips on the same railed channel within 2 s and the C-8
   * controller then opens the dumps with or without the Tavg wire; the pre-trip window is
   * shorter than C-7's arming). A STUCK channel through a turbine trip is the clean case:
   * C-8 chases the stuck 578 degF reading and drags the TRUE plant to 406 degF — 150 degF
   * past the no-load program, an instrument-driven overcooling casualty — where the wire-cut
   * mutant walks honestly to ~555 and closes the dumps. */
  var eng6 = EN.createEngine({});
  run(eng6, quiet ? 20 : 60);
  EN.command(eng6, 'instrument_fail', { id: 'tavg', mode: 'stuck' });
  EN.command(eng6, 'turbine_trip', true);
  var ts6 = run(eng6, quiet ? 180 : 240);
  ckT('a STUCK Tavg channel makes the dumps OVERCOOL the true plant far past the program',
      (ts6.tavg_c * 1.8 + 32) < 500 && ts6.steam_dump_valve_pct > 30,
      'true Tavg ' + (ts6.tavg_c * 1.8 + 32).toFixed(1) + ' degF vs the 557 program, dumps ' +
      ts6.steam_dump_valve_pct.toFixed(0) + ' % chasing a reading stuck at ' +
      (eng6.ins.reading.tavg * 1.8 + 32).toFixed(1));

  }

  if (grp('C')) {
  /* ---- 2e. THE RUNBACK AND THE ROD STOP (ch7 sec 7.2.3.2.1, the full sourced loop) ---------
   * A quasi-static dilution (-1 ppm per 5 s of the CVCS's own boron field — a STEP of any
   * size prompt-jumps power into the hi-flux trip, measured at -15 ppm already) walks the
   * OTdT margin into the 3 % band at ~+193 s. Then the sourced sequence: the runback nibbles
   * the turbine, the rod stop refuses OUTWARD motion, the operator's "appropriate
   * adjustments" (rods IN — always allowed) recover the margin, the signal clears, and NO
   * trip comes. Measured plant identity, recorded: WITHOUT the operator, this rods-MANUAL
   * plant trips ~51 s after onset anyway — the runback's load cut raises Tavg ~1.1 degF/MWe
   * (the load-follow character) and erodes the setpoint via K3 faster than the delta-T term
   * recovers. The runback buys the operator TIME on this plant; it does not buy an
   * equilibrium. That is the source's own framing, measured. */
  head('THE RUNBACK  [3 % from the OTdT trip: nibble the turbine, hold the rods, no trip]');
  var eng7 = EN.createEngine({});
  run(eng7, quiet ? 30 : 60);
  var onset7 = false, ts7 = null;
  for (var d7 = 0; d7 < 60 && !onset7; d7++) {
    eng7.cv.boron_ppm -= 2;         /* quasi-static: -2 ppm per 2.5 s (a bigger step
                                     * prompt-jumps power toward the hi-flux trip) */
    for (var k7 = 0; k7 < 2.5 / DT; k7++) {
      ts7 = EN.step(eng7, DT);
      if (ts7.runback_signal) { onset7 = true; break; }
    }
  }
  ckT('the approach signal asserts on a slow dilution, before any trip',
      onset7 && ts7.scrammed === false, 'after ' + (2 * d7) + ' ppm of dilution');
  /* TIMING [measured]: with no operator action this rods-MANUAL plant trips ~51 s after
   * onset (the runback's load cut RAISES Tavg ~1.1 degF/MWe — the load-follow character —
   * and erodes the setpoint via K3 faster than the delta-T term recovers; the runback buys
   * TIME here, not an equilibrium). So: rod-stop test in the first ~5 s, rods-in at ~+8 s. */
  EN.command(eng7, 'rod_target', 199.0);
  run(eng7, 2);                                  /* inward: always allowed */
  var rodsIn = eng7.rodSteps;
  EN.command(eng7, 'rod_target', 200);
  run(eng7, 3);                                  /* outward: refused while the signal stands */
  ckT('the ROD STOP: inward moves, outward is refused while the signal stands',
      rodsIn < 199.5 && eng7.rodSteps <= rodsIn + 1e-9,
      'in to ' + rodsIn.toFixed(1) + ', then held at ' + eng7.rodSteps.toFixed(1));
  /* the operator's half [sourced: "appropriate adjustments"]: rods IN. The runback's first
   * 1.5 s pulse has already nibbled ~5 MWe by now; margin recovery then clears the signal. */
  var load0 = eng7.tb.load_target_mwe;
  EN.command(eng7, 'rod_target', 188);
  var clear7 = false, trip7 = false, minLoad7 = 1e9;
  for (k7 = 0; k7 < (quiet ? 120 : 240) / DT; k7++) {
    ts7 = EN.step(eng7, DT);
    if (eng7.tb.load_target_mwe < minLoad7) minLoad7 = eng7.tb.load_target_mwe;
    if (!ts7.runback_signal) clear7 = true;
    if (ts7.scrammed) { trip7 = true; break; }
  }
  ckT('the RUNBACK nibbled the turbine: 200 %/min for 1.5 s per 30 s window',
      minLoad7 <= 100 - 4,
      '100 -> ' + minLoad7.toFixed(1) + ' MWe (load0 at rods-in ' + load0.toFixed(1) + ')');
  ckT('rods in + the runback recover the margin: the signal CLEARS and no trip comes',
      clear7 && !trip7,
      'the sourced purpose verbatim: "gives the operator the opportunity to make ' +
      'appropriate adjustments before a reactor trip occurs"');

  }

  if (grp('D')) {
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
      latch3 && threw3 === null && maxStep < 2.0 &&
      ts3 !== null && isFinite(ts3.pressure_mpa),
      threw3 ? ('THREW: ' + threw3.slice(0, 60)) :
      ('latched ' + latch3 + ', max |dP|/step ' + maxStep.toFixed(3) + ' MPa, P ' +
       (ts3 === null ? '?' : (ts3.pressure_mpa * 145.04).toFixed(0)) + ' psia'));
  }

  if (grp('E')) {
  /* ---- 4. THE AFW STARTS (2026-08-20) — protection latch to pump to SG water ---------------
   * The layer gate proves the latches; THIS section proves the caller's half: the latch starts
   * the real pumps, the pumps' water reaches the real SG, and the operator's switches obey the
   * latch discipline. The lying-gauge route is the only one that can reach lo-lo today — the
   * feed ≡ steam construction freezes true SG mass, a DECLARED gap the feed-train work order
   * owns — which is also why it is the right probe: HR1's both-ways payoff, same as eng5. */
  head('THE AFW STARTS  [a lying gauge starts real pumps; the cold water is real water]');
  var eng8 = EN.createEngine({});
  run(eng8, quiet ? 20 : 60);
  ckT('settled: both pumps secured, nothing latched',
      eng8.aw.mdafwRunning === false && eng8.aw.tdafwRunning === false &&
      eng8.pt.afas_mdafw === false && eng8.pt.afas_tdafw === false, '');
  var sgM0 = eng8.sg.mass;
  EN.command(eng8, 'instrument_fail', { id: 'sg_level', mode: 'low' });
  var ts8 = run(eng8, 5);
  ckT('a failed-LOW SG level channel starts BOTH pumps and trips the reactor, all on the lie',
      eng8.aw.mdafwRunning === true && eng8.aw.tdafwRunning === true &&
      eng8.pt.reactor_trip === true && eng8.pt.trip_cause === 'sg_lolo_level' &&
      ts8.afw_pump_running === true && ts8.afw_flow_normalized > 0.99,
      'cause ' + eng8.pt.trip_cause + ', flow ' + ts8.afw_flow_normalized.toFixed(2) +
      ', true level was healthy the whole time');
  /* isolate MAIN feed for the mass window: since the feed train landed (2026-08-21) the
   * three-element controller believes the same lying gauge and drives the valve full open —
   * measured +11,558 kg in 60 s with main feed swamping the AFW term this check names.
   * (That response is itself correct physics — the controller-believes-the-lie payoff.) */
  EN.command(eng8, 'isolate_feedwater', true);
  /* 5 pump taus: the valve was RAILED open on the lie (capacity 1.2 = 198 kg/s), and a 20 s
   * drain left a ~130 kg decaying tail inside the window — measured as "AFW delivered 440
   * of 326". The tail is the module's own 8 s lag working; the fixture just has to outwait it. */
  run(eng8, 40);
  var sgMafter5 = eng8.sg.mass, steamKg = 0, ts8x = null;
  for (var k8 = 0; k8 < 60 / DT; k8++) {
    ts8x = EN.step(eng8, DT);
    steamKg += (ts8x.steam_out_total || 0) * eng8.rated_steam * DT;   /* the dump draw */
  }
  var dM60 = eng8.sg.mass - sgMafter5;
  EN.command(eng8, 'isolate_feedwater', false);
  /* rated AFW: (170 + 340) gpm x 300/1775 = 86.2 gpm = 5.44 kg/s -> ~326 kg in 60 s. The
   * window measures NET mass, and post-trip the dumps still draw (measured +144 net under
   * ~180 kg of dump steam), so the AFW term is net + steam — asserted directly. */
  ckT('...and the AFW water is REAL: net mass + the dump draw equals the rated delivery',
      Math.abs(dM60 + steamKg - 326) < 60,
      'net +' + dM60.toFixed(0) + ' kg, dumps drew ' + steamKg.toFixed(0) +
      ' kg -> AFW delivered ~' + (dM60 + steamKg).toFixed(0) + ' of ~326 expected');
  EN.command(eng8, 'afw', false);
  run(eng8, 1);
  ckT('the operator CANNOT secure an actuated pump while the latch stands',
      eng8.aw.mdafwRunning === true, 'the level-held SI pattern, same law');
  EN.command(eng8, 'instrument_restore', 'sg_level');
  run(eng8, quiet ? 5 : 10);
  EN.command(eng8, 'reset_protection', true);
  run(eng8, 1);
  ckT('reset clears the start latches but does NOT secure the pumps',
      eng8.pt.afas_mdafw === false && eng8.pt.afas_tdafw === false &&
      eng8.aw.mdafwRunning === true && eng8.aw.tdafwRunning === true,
      'clearing a latch is not securing a pump');
  EN.command(eng8, 'afw', false);
  var threwT = null;
  try { EN.command(eng8, 'afw_tdafw', false); } catch (eT) { threwT = eT.message; }
  var ts8b = run(eng8, 5);
  ckT('...then each pump\'s own switch secures it (TS Bases: one switch per pump)',
      threwT === null && eng8.aw.mdafwRunning === false && eng8.aw.tdafwRunning === false &&
      ts8b.afw_pump_running === false && eng8.pt.afas_mdafw === false,
      threwT ? ('THREW: ' + threwT.slice(0, 60)) : 'secured, and no re-latch on the healed gauge');
  /* SI's start, through the facade: the eng5 lying-pressure casualty gains its sourced AFW leg */
  var eng9 = EN.createEngine({});
  run(eng9, quiet ? 20 : 40);
  EN.command(eng9, 'instrument_fail', { id: 'primary_pressure', mode: 'low' });
  run(eng9, 10);
  ckT('a safety injection starts the motor-driven pump ONLY (ch10\'s distinction, kept)',
      eng9.pt.si === true && eng9.aw.mdafwRunning === true && eng9.aw.tdafwRunning === false,
      'si ' + eng9.pt.si + ', mdafw ' + eng9.aw.mdafwRunning + ', tdafw ' + eng9.aw.tdafwRunning);
  /* ...and the same SI, held the sourced 32 s, ISOLATES main feed (Table 15.0-6; the delay
   * itself is pinned at the module gate — here the WIRE) */
  run(eng9, 40);
  ckT('...and the held SI isolates main feedwater through the facade wire',
      eng9.fw.isolated === true && eng9.fw.feed_frac < 0.05,
      'isolated ' + eng9.fw.isolated + ', delivered ' + eng9.fw.feed_frac.toFixed(3));
  }

  if (grp('F')) {
  /* ---- 5. THE FEED TRAIN (2026-08-21) — feed ≡ steam retired, the casualties end to end ----
   * The R6 arc: real feed dynamics move the TRUE mass ledger. Rides are long because a
   * boil-down is long; the quiet replays shorten the settle, not the casualty. */
  head('THE FEED TRAIN  [the mass ledger is finally driven; the feed casualties run whole]');
  var engA = EN.createEngine({});
  var tsA = run(engA, SETTLE);
  ckT('the three-element controller HOLDS the ruled 65 % program at power',
      Math.abs(tsA.sg_level_pct - 65) < 3 && Math.abs(tsA.fw_flow_normalized - 1.0) < 0.06 &&
      engA.fw.valve > 0.6 && engA.fw.valve < 1.0,
      'level ' + tsA.sg_level_pct.toFixed(1) + ' %, fw ' + tsA.fw_flow_normalized.toFixed(2) +
      ', valve ' + engA.fw.valve.toFixed(2));
  /* THE LOAD SWING — the exact A/B ride (100 -> 70 MWe). The TRUE level must transient and
   * return: the R6 divergence PWR2 used to suppress by construction. */
  EN.command(engA, 'load_mwe', 70);
  var lmin = 100, lmax = 0, tsw = null;
  for (var kf = 0; kf < (quiet ? 300 : 600) / DT; kf++) {
    tsw = EN.step(engA, DT);
    if (tsw.sg_level_pct < lmin) lmin = tsw.sg_level_pct;
    if (tsw.sg_level_pct > lmax) lmax = tsw.sg_level_pct;
  }
  ckT('a 30 MWe swing moves the TRUE level several points and the controller brings it home',
      (lmax - lmin) > 3 && Math.abs(tsw.sg_level_pct - 65) < 4,
      'range ' + lmin.toFixed(1) + '-' + lmax.toFixed(1) + ' %, settled ' +
      tsw.sg_level_pct.toFixed(1) + ' — feed ≡ steam read a flat line here');
  /* ONE PUMP: the ch10 60 % ceiling against 100 % steaming — a real boil-down to the lo-lo
   * bistable, the trip + both AFW starts arriving on PHYSICS for the first time (until now
   * only a lying gauge could reach 17 %). */
  var engB = EN.createEngine({});
  run(engB, SETTLE);
  EN.command(engB, 'feed_pump_a', false);
  var tTripB = null, tsB = null;
  for (var kb = 0; kb < 200 / DT; kb++) {
    tsB = EN.step(engB, DT);
    if (tTripB === null && engB.pt.reactor_trip) { tTripB = kb * DT; }
  }
  ckT('one feed pump at full power boils the SG down to a REAL lo-lo trip + both AFW starts',
      tTripB !== null && engB.pt.trip_cause === 'sg_lolo_level' &&
      engB.pt.afas_mdafw === true && engB.aw.mdafwRunning === true &&
      engB.aw.tdafwRunning === true,
      'trip at ' + (tTripB === null ? 'never' : tTripB.toFixed(1) + ' s') + ' (measured 97.6 s ' +
      'from the settled plant), cause ' + engB.pt.trip_cause);
  run(engB, quiet ? 100 : 200);
  ckT('...and the recovery does NOT overfill — the anti-windup pair holds the refill honest',
      engB.sg.mass < 15000,
      'SG mass ' + engB.sg.mass.toFixed(0) + ' kg (the pre-fix windup refilled to 17,033)');
  /* BOTH PUMPS: the sourced chain whole — "the turbine will be tripped and the MDAFW will
   * start automatically. If the reactor is operating above 50% of full power at this time,
   * the reactor will trip" — turbine trip, P-9 reactor trip, MDAFW on the loss. */
  var engC = EN.createEngine({});
  run(engC, quiet ? 60 : SETTLE);
  EN.command(engC, 'feed_pump_a', false); EN.command(engC, 'feed_pump_b', false);
  var tsC = run(engC, 5);
  ckT('loss of BOTH pumps: turbine trips, P-9 trips the reactor, the MDAFW starts on the loss',
      engC.tb.tripped === true && engC.pt.reactor_trip === true &&
      engC.pt.trip_cause === 'turbine_trip' &&
      engC.pt.afas_mdafw === true && engC.pt.afas_mdafw_cause === 'loss_of_main_feed',
      'the whole ch10 sentence, executed');
  /* HI-HI: an overfeed walks the level to the P-14 class function — main feed isolated AND
   * the turbine tripped (moisture carryover), while the AFW path stays open. */
  var engD = EN.createEngine({});
  run(engD, quiet ? 60 : SETTLE);
  EN.command(engD, 'feed_manual_frac', 1.2);
  var tFwi = null, tsD = null;
  for (var kd = 0; kd < 400 / DT; kd++) {
    tsD = EN.step(engD, DT);
    if (tFwi === null && engD.pt.fwi) { tFwi = kd * DT; break; }
  }
  ckT('a manual overfeed reaches hi-hi: fwi latches, main feed isolates, the turbine trips',
      tFwi !== null && engD.fw.isolated === true && engD.tb.tripped === true &&
      engD.pt.fwi_cause === 'hi_hi_sg_level',
      tFwi === null ? 'never reached hi-hi in 400 s'
                    : 'fwi at ' + tFwi.toFixed(1) + ' s, indicated level ' +
                      (engD.ins.reading.sg_level || 0).toFixed(1) + ' %');
  /* THE SHRINK, on the indicated channel only: at engC's trip the power collapse shifts the
   * INDICATED level below TRUE (swell_factor x power rate, the adopted instrument-side
   * term) — the mass ledger does not move that fast. */
  var engE2 = EN.createEngine({});
  run(engE2, quiet ? 60 : 120);
  EN.command(engE2, 'scram', true);
  var maxGap = 0;
  for (var ke = 0; ke < 10 / DT; ke++) {
    var tsE2 = EN.step(engE2, DT);
    var gap = tsE2.sg_level_pct - engE2.ins.reading.sg_level;
    if (gap > maxGap) maxGap = gap;
  }
  ckT('a scram SHRINKS the indicated level below true — the downcomer effect, instrument-side',
      maxGap > 3,
      'max true-minus-indicated ' + maxGap.toFixed(1) + ' points in the first 10 s — A9\'s ' +
      'effect reproduced on PWR2\'s own channel');
  }

  if (grp('G')) {
  /* ---- 6. THE HOT STANDBY IC (2026-08-21, #479 more starting conditions) -------------------
   * Mode 3: hot, pressurized, shut down, turbine off, dumps in pressure mode on the sourced
   * no-load setpoint. Three claims: the state LANDS on its anchors, it HOLDS (stability
   * bands, not endpoints — the #447 lesson), and criticality is reachable on rods alone —
   * the startup the IC exists to teach. Numbers from the 2026-08-21 probe rides
   * (PWR2_VALIDATION.md §65): Tavg 546.7-547.6 degF over a 2-h hold, critical at 53.7/200
   * steps, 1 % power 4.5 min after the pull begins. */
  var engG = EN.createEngine({ initial_state: 'hot_zero_power' });
  var tsG = EN.step(engG, DT);
  ck('hot standby lands at the no-load saturation temperature', tsG.tavg_c,
     W.T_sat(G.SG.P_noload), 0.6, 'degC (547 degF)');
  ck('primary at operating pressure', tsG.pressure_mpa, 15.41, 0.1, 'MPa (2235 psia)');
  ck('SG at the sourced no-load pressure', tsG.steam_pressure_mpa, G.SG.P_noload, 0.06,
     'MPa (1005 psig)');
  ck('pressurizer level on the no-load program', tsG.pzr_level_pct, 25, 1.5, '%');
  ck('SG level on the program', tsG.sg_level_pct, 65, 2.5, '%');
  ck('fission power sits on the source floor', tsG.power_pct,
     RD.kinetics.SOURCE.floor_frac * 100, 1e-12, '%');
  /* rated_steam is the steam_flow_frac / feed-controller NORMALIZATION — a constant of the
   * plant, not of the IC's turbine (whose own demand at hot standby is 0). The revert is
   * nearly silent in behavior (clips bound the damage), so the claim is pinned directly. */
  ck('rated_steam is the RATED point\'s demand — a plant constant, IC-independent',
     engG.rated_steam, EN.createEngine({}).rated_steam, 1e-9, 'kg/s');
  ckT('Mode 3, bank in, turbine off, low-flux trip armed',
      tsG.plant_mode === 3 && tsG.rod_steps === 0 && tsG.turbine_tripped === true &&
      tsG.scrammed === false && engG.pt.blockLowFlux === false,
      'mode ' + tsG.plant_mode + ', rods ' + tsG.rod_steps + ', blockLowFlux ' +
      engG.pt.blockLowFlux);
  ckT('the trimmed shutdown margin: ~1000 pcm below critical with the bank in',
      tsG.reactivity_pcm > -1400 && tsG.reactivity_pcm < -800,
      tsG.reactivity_pcm.toFixed(0) + ' pcm (trim residual: the zero-power solve omits the ' +
      'void half — measured -1137)');
  /* the HOLD — bands over the whole ride, because a limit cycle passes any endpoint check */
  var bandG = { tLo: 1e9, tHi: -1e9, pLo: 1e9, pHi: -1e9, zLo: 1e9, zHi: -1e9, sLo: 1e9, sHi: -1e9 };
  var holdN = Math.round((quiet ? 120 : 300) / DT);
  for (var gh = 0; gh < holdN; gh++) {
    tsG = EN.step(engG, DT);
    if (tsG.tavg_c < bandG.tLo) bandG.tLo = tsG.tavg_c;
    if (tsG.tavg_c > bandG.tHi) bandG.tHi = tsG.tavg_c;
    if (tsG.pressure_mpa < bandG.pLo) bandG.pLo = tsG.pressure_mpa;
    if (tsG.pressure_mpa > bandG.pHi) bandG.pHi = tsG.pressure_mpa;
    if (tsG.pzr_level_pct < bandG.zLo) bandG.zLo = tsG.pzr_level_pct;
    if (tsG.pzr_level_pct > bandG.zHi) bandG.zHi = tsG.pzr_level_pct;
    if (tsG.sg_level_pct < bandG.sLo) bandG.sLo = tsG.sg_level_pct;
    if (tsG.sg_level_pct > bandG.sHi) bandG.sHi = tsG.sg_level_pct;
  }
  ckT('the hold is LIVE and quiet: no trip, no SI, not a held beyond-model state',
      engG._dead !== true && engG.pt.reactor_trip === false && engG.pt.si === false, '');
  ckT('hold bands: Tavg within 545-550 degF, pressure 2190-2255 psia',
      bandG.tLo > 285.0 && bandG.tHi < 287.8 && bandG.pLo > 15.10 && bandG.pHi < 15.55,
      'Tavg ' + (bandG.tLo * 1.8 + 32).toFixed(1) + '-' + (bandG.tHi * 1.8 + 32).toFixed(1) +
      ' degF, P ' + (bandG.pLo * 145.038).toFixed(0) + '-' + (bandG.pHi * 145.038).toFixed(0) +
      ' psia');
  ckT('hold bands: pressurizer level 22-29 %, SG level 61-70 % — the controllers hold, not drift',
      bandG.zLo > 22 && bandG.zHi < 29 && bandG.sLo > 61 && bandG.sHi < 70,
      'pzr ' + bandG.zLo.toFixed(1) + '-' + bandG.zHi.toFixed(1) + ' %, SG ' +
      bandG.sLo.toFixed(1) + '-' + bandG.sHi.toFixed(1) + ' %');
  /* the STARTUP — criticality on rods alone, partway up the bank */
  EN.command(engG, 'rod_target', 200);
  var critSteps = null;
  var pullN = Math.round(200 / DT);
  for (var gp = 0; gp < pullN; gp++) {
    tsG = EN.step(engG, DT);
    if (critSteps === null && tsG.reactivity_pcm >= 0) {
      critSteps = engG.rodSteps;
      EN.command(engG, 'rod_target', Math.min(200, engG.rodSteps + 5));
      break;
    }
  }
  ckT('criticality is reachable on rods alone, mid-bank',
      critSteps !== null && critSteps > 20 && critSteps < 120,
      critSteps === null ? 'never critical in 200 s of pull'
                         : 'critical at ' + critSteps.toFixed(1) + '/200 steps');
  var climbN = Math.round((quiet ? 240 : 420) / DT);
  for (var gc = 0; gc < climbN; gc++) tsG = EN.step(engG, DT);
  ckT('...and power CLIMBS from the source floor on a delayed-critical period',
      tsG.power_pct > 1e-3 && engG.pt.reactor_trip === false && engG._dead !== true,
      'power ' + tsG.power_pct.toExponential(2) + ' % ' + (quiet ? 240 : 420) +
      ' s after the pull (measured: 1 % at 4.5 min, self-limiting near 10 % on moderator ' +
      'feedback)');
  }
}

console.log('\nPWR2 -- THE ENGINE FACADE: one door, the gates\' wiring written once');
var rec = [];
runSuite(loadAll(), rec, false);
var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;

var ENSRC = fs.readFileSync(path.join(SRC, 'pwr2_engine.js'), 'utf8').replace(/\r\n/g, '\n');
var MUTATIONS = [
  ['the pressurizer relief sink is dropped (mass relieves without leaving)',
   "srcs.push({ node: 'hot_leg', mdot: -eng._pzRelief, h: eng._pzReliefH });",
   '', { grp: 'A' }],
  ['the level controller is unhooked from charging',
   'eng.cv.chargingDemand = pzr.charging_demand;',
   '', { grp: 'A' }],
  ['the scram-on-trip is deleted (the RPS reports into a void)',
   "if (ptr.reactor_trip && !eng._lastTrip) { eng.rodTarget = 0; eng._scramT = 0; }",
   '', { grp: 'A' }],
  ['SI never starts the ECCS',
   'if (ptr.si) { eng.ec.hhsiRunning = true; eng.ec.lhsiRunning = true; }',
   '', { grp: 'D' }],
  ['the oxidation heat is never fed back',
   'eng._Qox = dr.Q_ox_kW;',
   'eng._Qox = 0;', { grp: 'D' }],
  ['the rod slew is deleted (commands teleport the bank)',
   '      eng.rodSteps += move;',
   '      eng.rodSteps = eng.rodTarget;', { grp: 'A' }],
  ['the dump controller never reaches the relief valves',
   'dump_demand: dcr.dump_demand,',
   'dump_demand: 0,', { grp: 'A' }],
  ['the manual-trip pushbutton wire is cut before the RPS',
   'manual_trip: eng._manualTrip',
   'manual_trip: false', { grp: 'A' }],
  ['the turbine flag never reaches the RPS (P-9 watches a wire that is not connected)',
   /* the SAME line exists in the dumpctl drivers EARLIER in the file, and a bare anchor cut
    * THAT one for two sessions while the full-suite replay's side effects hid it — the
    * scoped replay exposed the mis-anchor. Two-line anchor, unique to the RPS block. */
   "turbine_tripped: eng.tb.tripped,\n      steam_dumps_available: eng._cdAvail !== false,",
   "turbine_tripped: false,\n      steam_dumps_available: eng._cdAvail !== false,", { grp: 'B' }],
  ['the runback never reaches the turbine (the RPS warns into a void)',
   "        eng.tb.load_target_mwe = Math.max(0,\n          eng.tb.load_target_mwe - (2.0 * MWE_RATED / 60) * dt);",
   '', { grp: 'C' }],
  ['the rod stop never blocks (outward motion continues at 3 % from the trip)',
   '      if (eng._rodStopSig && move > 0) move = 0;',
   '', { grp: 'C' }],
  ['the pressurizer ladder wire is cut (control reads truth again; no lie can drive the heaters)',
   'indicated_pressure_mpa: eng.ins.reading.primary_pressure,',
   '', { grp: 'B' }],
  ['the dump controller wire is cut (a lying Tavg can no longer open the dumps)',
   "      tavg_c: eng.ins.reading.tavg !== undefined ? eng.ins.reading.tavg : tavg,\n      load_frac:",
   '      tavg_c: tavg,\n      load_frac:', { grp: 'B' }],
  ['the loop delta-T never reaches the RPS (both delta-T trips silently unavailable)',
   /* the first version replaced only the ternary CONDITION, leaving the truth branch live —
    * it built a truth-wire, not an absence, and nothing can see a truth-wire at steady state */
   "      delta_t_frac: rd.thot !== undefined ? (rd.thot - rd.tcold) / DT0_C\n                    : (tLeg(sys, 'hot_leg') - tLeg(sys, 'cold_leg')) / DT0_C,",
   '      delta_t_frac: undefined,', { grp: 'B' }],
  ['the RPS reads TRUTH, not the instruments (a failed channel can no longer lie to it)',
   'pressure_mpa: rd.primary_pressure !== undefined ? rd.primary_pressure : sys.P,',
   'pressure_mpa: sys.P,', { grp: 'B' }],
  /* The two INNER-GUARD core mutations MIGRATED to run_pwr2_core (2026-08-20g): the
   * control/instrument switchovers moved this gate's trajectories — both now escape through
   * the kinetics-runaway family first, so the inner thermodynamic guards never fire here and
   * the mutations went blind. The guards are pwr2_core's; they are now exercised there on
   * direct synthetic states (measure at the probe's own layer). The loadAll coreSource
   * machinery stays for future core mutations. */
  /* THE AFW STARTS (2026-08-20) */
  ['the facade never consumes the MDAFW start latch (the RPS reports, nobody acts)',
   '    if (ptr.afas_mdafw) eng.aw.mdafwRunning = true;',
   '', { grp: 'E' }],
  ['the facade never consumes the TDAFW start latch',
   '    if (ptr.afas_tdafw) eng.aw.tdafwRunning = true;',
   '', { grp: 'E' }],
  ['the AFW stream never reaches the SG — reported, hydraulically inert (the pre-build wiring)',
   'afw_kgs: awr.total_kgs, afw_h: awr.h_kJkg });',
   'afw_kgs: 0, afw_h: 0 });', { grp: 'E' }],
  ['the protection never sees the SG level channel',
   '      sg_level_frac: rd.sg_level !== undefined ? rd.sg_level / 100 : undefined,',
   '      sg_level_frac: undefined,', { grp: 'E' }],
  ['reset_protection leaves the AFW-start latches standing (the pumps can never be secured)',
   '        eng.pt.afas_mdafw = false; eng.pt.afas_mdafw_cause = null;\n        eng.pt.afas_tdafw = false; eng.pt.afas_tdafw_cause = null;',
   '', { grp: 'E' }],
  ['the TDAFW switch is disconnected (one switch per pump, minus one)',
   "      case 'afw_tdafw':      eng.aw.tdafwRunning = !!value; break;",
   '', { grp: 'E' }],
  /* THE FEED TRAIN (2026-08-21) */
  ['feed ≡ steam quietly restored (the module computed, the SG fed what leaves it)',
   'var sr = G.stepSG(eng.sg, tavg, dt, { feed: fwr.feed_frac * eng.rated_steam, steam: out,',
   'var sr = G.stepSG(eng.sg, tavg, dt, { feed: out, steam: out,', { grp: 'F' }],
  ['loss of both pumps no longer trips the turbine (half the ch10 sentence)',
   '    if (fwr.main_feed_lost) eng.tb.tripped = true;',
   '', { grp: 'F' }],
  ['the fwi latch is never consumed (hi-hi reports into a void)',
   '    if (ptr.fwi) { eng.fw.isolated = true; eng.tb.tripped = true; }',
   '', { grp: 'F' }],
  ['the SI wire to the feed module is cut (no isolation ever arrives)',
   '      si_active: eng.pt.si\n    });\n    /* [sourced ch10]: "If both main feedwater pumps fail, the turbine will be tripped" —',
   '      si_active: false\n    });\n    /* [sourced ch10]: "If both main feedwater pumps fail, the turbine will be tripped" —',
   { grp: 'E' }],
  ['the shrink/swell shift is dropped from the internal channel',
   "    IN.stepInstruments(eng.ins, dt, ts, { shift: { sg_level: 0.8 * (eng._pwrRate || 0) } });",
   '    IN.stepInstruments(eng.ins, dt, ts);', { grp: 'F' }],
  /* THE HOT STANDBY IC (2026-08-21) */
  ['the bank is left withdrawn in a shut-down plant (the #468 class defect)',
   'rodTarget: hzp ? 0 : 200, rodSteps: hzp ? 0 : 200, rodBank: rodBank,',
   'rodTarget: 200, rodSteps: 200, rodBank: rodBank,', { grp: 'G' }],
  ['the shutdown-margin trim is dropped (boron lands at rods-in critical, not 1000 pcm below)',
   '      + (hzp ? 0.01 / RD.kinetics.BORON.worth_per_ppm : 0);',
   '      + 0;', { grp: 'G' }],
  ['the turbine comes up untripped at hot standby (100 MWe drawn from a shut-down plant)',
   "    var tb = TB.createTurbine(hzp ? { load_target_mwe: 0, tripped: true }\n                                  : { load_target_mwe: MWE_RATED });",
   '    var tb = TB.createTurbine({ load_target_mwe: MWE_RATED });', { grp: 'G' }],
  ['rated_steam reverts to the IC turbine\'s own demand (zero in three denominators)',
   "      rated_steam: TB.steamDemand(TB.createTurbine({ load_target_mwe: MWE_RATED }),\n                                  G.createSG({}).P, G.SG.h_feed),",
   '      rated_steam: TB.steamDemand(tb, sg.P, G.SG.h_feed),', { grp: 'G' }],
  ['hot standby comes up on the at-power feed lineup (full feed into a no-load SG)',
   '      fw: FWM.createFeedwater(hzp ? { at_power: false, pumpB: false } : {}),',
   '      fw: FWM.createFeedwater({}),', { grp: 'G' }]
];
var CORESRC = fs.readFileSync(path.join(SRC, 'pwr2_core.js'), 'utf8').replace(/\r\n/g, '\n');

console.log('\ninjection self-test (' + MUTATIONS.length + ' mutations):');
var blind = 0;
MUTATIONS.forEach(function (m) {
  var isCore = m[3] === 'core';
  var opts = m[m.length - 1];
  var grpTag = (opts && opts.grp) || undefined;
  var base = isCore ? CORESRC : ENSRC;
  var mutated = base.replace(m[1], m[2]);
  if (mutated === base) { console.log('  ANCHOR MISS ' + m[0]); blind++; return; }
  var rec2 = [];
  try {
    runSuite(isCore ? loadAll(undefined, mutated) : loadAll(mutated), rec2, !process.env.MUTDBG, grpTag);
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
