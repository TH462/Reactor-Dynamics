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
 * 'E' the AFW starts, 'F' the feed train, 'G' the electrical pair (#507 wave 4), 'H' the
 * SGTR (#507 wave 5), 'I' the failure levers (#507 wave 6), 'K' the initial conditions
 * (#507 §F, wave 7), 'L' the rod insertion limit (#507 §B, wave 8), 'M' the RCP restart
 * (#507 wave 9), 'N' the shutdown IC (#507 wave 10).
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
  /* the hand-wired plant, retyped from run_pwr2_loadfollow's ride() — the independent copy.
   * The IC comes from the facade's own designHmap (#502): the equivalence claim is about the
   * WIRING, so both sides must boot the same plant — a hand-typed scalar here would re-create
   * the isothermal-boot defect on one side only and turn the check into an IC comparison. */
  var pz = PZ.createPressurizer({});
  var sys = S.createPlant({ h: EN.designHmap(), P: 15.41, extraMass: PZ.extraMassFn(pz) });
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

  /* ---- 1b. THE IC IS SETTLED (#502) --------------------------------------------------------- */
  /* A FRESH engine, NO commands, 60 s. Before the design-point enthalpy map this red at
   * power min 76.6 % (t = 2.9 s) with Thot 580 -> 622 degF and a 64 psi sag — the isothermal
   * boot developing its own loop split on every free-play start. The bounds are the ring's
   * absence, not the design point itself (the settle drifts ~1.3 degC below the constants —
   * declared in designHmap's header). */
  head('SETTLED IC  [a no-command ride from construction does not ring]');
  var engIC = EN.createEngine({});
  var icMin = 1e9, icPMin = 1e9, icTs = null;
  for (var ici = 0; ici < 60 / DT; ici++) {
    icTs = EN.step(engIC, DT);
    if (icTs.power_pct < icMin) icMin = icTs.power_pct;
    if (icTs.pressure_mpa < icPMin) icPMin = icTs.pressure_mpa;
  }
  ckT('60 s untouched: power holds, legs near settled, pressure inside the park',
      icMin >= 97.0 && icPMin > 15.17 &&
      Math.abs(icTs.thot_c - 319.0) < 2.5 && Math.abs(icTs.tcold_c - 287.6) < 2.5,
      'power min ' + icMin.toFixed(1) + ' %, P min ' + (icPMin * 145.04).toFixed(0) +
      ' psia, legs ' + (icTs.thot_c * 1.8 + 32).toFixed(1) + '/' +
      (icTs.tcold_c * 1.8 + 32).toFixed(1) + ' degF');

  /* ---- 2. EVERY COMMAND REACHES ITS SYSTEM -------------------------------------------------- */
  head('THE ONE DOOR  [each command lands with an observable effect]');
  EN.command(eng, 'load_mwe', 80);
  var t80 = run(eng, quiet ? 60 : 120);
  ckT('load_mwe moves the turbine and the plant follows',
      Math.abs(t80.mwe_output - 80) < 1 && t80.power_pct < 97, 'MWe ' +
      t80.mwe_output.toFixed(1) + ', power ' + t80.power_pct.toFixed(1) + ' %');
  EN.command(eng, 'rod_target', 190);
  var tRod = run(eng, 5);
  ckT('rod_target SLEWS — five seconds at normal speed moves ~3.5 steps, not the whole demand',
      /* 0.702 steps/s = the sourced WTSM 8.1 normal class rate mapped onto the 200-step
       * bank (#506.4); the pre-#506 single rate (1.0 = always FAST) read ~5 here */
      Math.abs(tRod.rod_steps - (200 - 0.702 * 5)) < 1.0,
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

  /* ---- 1c. THE QUIET WIRES (#502 follow-through) --------------------------------------------
   * Three group-A mutations went BLIND the day the IC settled: the relief sink, the
   * level-controller charging hook and the dump-to-relief wire were only ever exercised by
   * the STARTUP RING — the defect's own transient was doing the gate's sensing. A settled
   * plant never lifts a relief, never corrects level, never opens a dump in these rides, so
   * each wire gets a deliberate probe. Bands from a measured healthy/mutated A/B
   * (2026-08-21): dM -136 vs -11 kg · |dDemand| 0.074 vs 0.000 · dump 75.7 vs 0.0 %.
   * (This block's first landing was inside the FIRST grp('D') section — the group order in
   * this file is A, D, B, C, D — where the three grp('A')-scoped replays never ran it and
   * they stayed blind; the group tag on the mutation and the block hosting its probe have
   * to agree, and the blind count is what says so.) */
  head('THE QUIET WIRES  [relief sink, level-to-charging, dump-to-relief — probed, not ridden]');
  var engQ1 = EN.createEngine({});
  run(engQ1, 30);
  var mQ0 = engQ1.sys.M_total;
  EN.command(engQ1, 'porv_stick', true);
  run(engQ1, 30);
  ckT('a stuck PORV takes REAL mass out of the loop (the relief sink is connected)',
      engQ1.sys.M_total - mQ0 < -80,
      'M_total ' + (engQ1.sys.M_total - mQ0).toFixed(1) + ' kg over 30 s (sink dropped: -11)');
  var engQ2 = EN.createEngine({});
  run(engQ2, 30);
  var cdQ0 = engQ2.cv.chargingDemand;
  EN.command(engQ2, 'letdown', 1.0);
  run(engQ2, 60);
  /* the note is NULL-SAFE on purpose: under the wire-cut mutation chargingDemand stays at
   * its construction value null, and a .toFixed on it THROWS — which aborts the replay with
   * every already-recorded check green, and the harness reads that as BLIND ("a crash counts
   * as caught" is only true when the crash lands before the first check records) */
  var cdFmt = function (v) { return v === null || v === undefined ? String(v) : v.toFixed(3); };
  ckT('the level controller MOVES charging when letdown drains the vessel (the hook exists)',
      engQ2.cv.chargingDemand !== null && cdQ0 !== null &&
      Math.abs(engQ2.cv.chargingDemand - cdQ0) > 0.03,
      'demand ' + cdFmt(cdQ0) + ' -> ' + cdFmt(engQ2.cv.chargingDemand) +
      ' — the claim is the WIRE, not the control law (that is run_pwr2_pressurizer\'s)');
  var engQ3 = EN.createEngine({});
  run(engQ3, 30);
  EN.command(engQ3, 'turbine_trip', true);
  var dumpQ = 0, steamQ = 0, tsQ = null;
  for (var q3 = 0; q3 < 30 / DT; q3++) {
    tsQ = EN.step(engQ3, DT);
    if (tsQ.steam_dump_valve_pct > dumpQ) dumpQ = tsQ.steam_dump_valve_pct;
    if (tsQ.steam_pressure_mpa > steamQ) steamQ = tsQ.steam_pressure_mpa;
  }
  ckT('a turbine trip OPENS the dumps — demand reaches the relief valves, steam stays bounded',
      dumpQ > 30 && steamQ < 7.75,
      'dump max ' + dumpQ.toFixed(1) + ' %, steam max ' + (steamQ * 145.04).toFixed(0) + ' psia');

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

  /* ---- 3c. THE RHR ALIGN, THROUGH THE PLANT (#507 wave 2) -----------------------------------
   * A 20 cm2 cold-leg break depressurizes below the sourced 425 psig suction permissive; the
   * align door opens the valve and the module's heats map MERGES into stepPlant (it used to
   * feed only true_state — an aligned system removed exactly zero heat, the Q4 orphan the
   * #458 ruling names). TRAJECTORY RE-MEASURED (#510 batch 1): with reverse SG transfer
   * signed instead of |Q|-removed, the hot secondary now SLOWS the blowdown — real
   * small-break physics — so the permissive crossing moved ~74 s → 187.5 s. Measured A/B at
   * t = 200.0 s: aligned tavg 205.7 degC vs secured 257.0 — the 51 degC gap is the wiring,
   * and the pinned band below is what the merge-dropped mutation reds against (its
   * removed_kJ ledger still climbs; only the PLANT tells the truth). */
  head('THE RHR ALIGN  [below the 425 psig permissive, the heat actually leaves the loop]');
  var engR = EN.createEngine({});
  run(engR, 10);
  EN.command(engR, 'break_open', { area_m2: 0.002, node: 'cold_leg' });
  var tsR = null, tR = 0, alignedR = false;
  while (tR < 200.001) {
    tsR = EN.step(engR, DT); tR += DT;
    if (!alignedR && (engR.sys.P * 145.038 - 14.7) < 420) {
      EN.command(engR, 'rhr_align', true); alignedR = true;
    }
    if (engR.sys.beyond_model) break;
  }
  ckT('aligned below the permissive: valve open, mode rhr, real energy removed, plant COOLER',
      alignedR && engR.rh.valve_open === true && tsR.eccs_mode === 'rhr' &&
      engR.rh.removed_kJ > 50000 && tsR.tavg_c < 230,
      'tavg ' + tsR.tavg_c.toFixed(1) + ' degC at t=200 (secured measures 257.0), removed ' +
      (engR.rh.removed_kJ / 1000).toFixed(0) + ' MJ, mode ' + tsR.eccs_mode);
  /* the door refuses an at-power align (the 425 psig permissive), and the autoclose is the
   * valve hardware: a valve forced open above 585 psig shuts on the next step */
  var engR2 = EN.createEngine({});
  run(engR2, 2);
  EN.command(engR2, 'rhr_align', true);
  var refusedAtPower = engR2.rh.valve_open === false;
  engR2.rh.valve_open = true;
  EN.step(engR2, DT);
  ckT('the door refuses an at-power align, and the 585 psig autoclose shuts a forced valve',
      refusedAtPower && engR2.rh.valve_open === false,
      'align at ~2220 psig refused (permissive 425); forced-open valve autoclosed in one step');

  }

  if (grp('B')) {
  /* ---- 2c. P-9 THROUGH THE DOOR --------------------------------------------------------------
   * The setpoint logic (50 %/8 % by dump availability, the no-trip band) is gated at the
   * protection layer's own gate; THIS check is the wiring claim — turbine_tripped and dump
   * availability actually reach the RPS from the facade. */
  head('P-9 THROUGH THE DOOR  [a commanded turbine trip at power IS a reactor trip]');
  var eng4 = EN.createEngine({});
  run(eng4, quiet ? 60 : 120);   /* the boron/xenon regime settle. (An older note here said
                                  * the margin check needed this to ride OUT the startup ring
                                  * — margin 0.013 at t = 5 s; since #502 the IC opens on its
                                  * split and the margin reads ~0.31 from the first seconds) */
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
  /* THE LADDER'S WIRE, probed with a HIGH lie. A LOW lie cannot discriminate whenever true
   * pressure sits at or below the setpoint — the truth-fed ladder has the heaters
   * legitimately full there too, which kept the wire-cut mutation blind through two fixture
   * attempts (originally via the startup dip's ~330 s at −72 psi; the settled IC (#502)
   * still parks a few psi under the setpoint, so the asymmetry stands). Spray and the PORV
   * answer only a HIGH error: on the lie they open; on truth they cannot. */
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
  for (var d7 = 0; d7 < 120 && !onset7; d7++) {
    eng7.cv.boron_ppm -= 1;         /* quasi-static: -1 ppm per 2.5 s. The old -2 ppm block
                                     * overshot the 3 % band WITHIN the detection block, so
                                     * the signal asserted with the OTdT margin already at
                                     * ~0 — on the settled IC (#502) that standing condition
                                     * matured its trip delay during the rod-stop test below,
                                     * which is a statement about the SCRIPT's dilution rate,
                                     * not the plant (a bigger step prompt-jumps power toward
                                     * the hi-flux trip; a finer one enters the band with the
                                     * margin the band is FOR) */
    for (var k7 = 0; k7 < 2.5 / DT; k7++) {
      ts7 = EN.step(eng7, DT);
      if (ts7.runback_signal) { onset7 = true; break; }
    }
  }
  ckT('the approach signal asserts on a slow dilution, before any trip',
      onset7 && ts7.scrammed === false, 'after ' + d7 + ' ppm of dilution');
  /* TIMING [measured]: with no operator action this rods-MANUAL plant trips within about a
   * minute of onset (the runback's load cut RAISES Tavg ~1.1 degF/MWe — the load-follow
   * character — and erodes the setpoint via K3 faster than the delta-T term recovers; the
   * runback buys TIME here, not an equilibrium). So: rod-stop test in the first ~3 s,
   * rods-in right after. */
  EN.command(eng7, 'rod_target', 199.0);
  run(eng7, 2);                                  /* inward: always allowed */
  var rodsIn = eng7.rodSteps;
  EN.command(eng7, 'rod_target', 200);
  run(eng7, 1);                                  /* outward: refused while the signal stands
                                                  * (refusal is immediate — one second shows
                                                  * zero motion; three bought nothing but
                                                  * trip-delay maturity) */
  ckT('the ROD STOP: inward moves, outward is refused while the signal stands',
      rodsIn < 199.5 && eng7.rodSteps <= rodsIn + 1e-9,
      'in to ' + rodsIn.toFixed(1) + ', then held at ' + eng7.rodSteps.toFixed(1));
  /* the operator's half [sourced: "appropriate adjustments"]: rods IN, at FAST, 18 steps.
   * Re-scripted with the two-bank build (#506.3): the control bank now carries its real
   * 4068 pcm worth — HALF the old lumped 8000 — so the pre-#506 "12 steps at the old
   * always-fast rate" buys half the reactivity and (measured, dt 0.02 only) the standing
   * OTdT condition matured its delay before the margin recovered. Same physical action,
   * real units: FAST (the sourced 72 steps/min class — what an operator staring at an
   * approach alarm selects) and ~2x the steps for the same pcm. Measured: clears at
   * +6.3 s (dt 0.02) / +2.8 s (0.05), no trip, both dt values. */
  var load0 = eng7.tb.load_target_mwe;
  EN.command(eng7, 'rod_speed', 'fast');
  EN.command(eng7, 'rod_target', 182);
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
  /* ---- 6. THE ELECTRICAL PAIR (#507 wave 4) — every wire its own probe (the 2026-08-21
   * lesson: fix the defect, and give each orphaned wire a probe of its own). Measured
   * fixture values 2026-08-22: LOOP at 120 s reads afw_flow_normalized 1.000 (both pumps),
   * SBO reads 0.667 — exactly the TDAFW-only fraction, which makes the ratio itself the
   * MDAFW power wire's gauge. ---- */
  head('THE ELECTRICAL PAIR  [LOOP: nonvital dead, vital alive; SBO: the TDAFW carries it]');
  var engL = EN.createEngine({});
  run(engL, quiet ? 20 : 30);
  EN.command(engL, 'offsite_power', false);
  var tsL = run(engL, 120);
  ckT('a LOOP kills every NONVITAL load with its selectors standing: RCPs tripped, feed 0 ' +
      'with both pumps selected, condenser lost — and ac_available stays TRUE (diesels)',
      engL.sys.pumpTripped === true && engL.fw.feed_frac < 0.01 &&
      engL.fw.pumpA === true && engL.fw.pumpB === true &&
      engL._cdAvail === false && tsL.ac_available === true && tsL.station_blackout === false,
      'feed ' + engL.fw.feed_frac.toFixed(4) + ', cd ' + engL._cdAvail);
  ckT('...starts BOTH AFW pumps on the sourced ch10 condition, delivering rated flow — and ' +
      'the MDAFW cause is loss_of_main_feed (the same-step race: the dead feed train reports ' +
      'first, which is ALSO the feed grid wire\'s own gauge)',
      engL.pt.afas_tdafw === true && engL.pt.afas_tdafw_cause === 'loss_of_offsite_power' &&
      engL.pt.afas_mdafw_cause === 'loss_of_main_feed' &&
      engL.aw.mdafwRunning === true && tsL.afw_flow_normalized > 0.99,
      'td cause ' + engL.pt.afas_tdafw_cause + ', md cause ' + engL.pt.afas_mdafw_cause +
      ', afw ' + tsL.afw_flow_normalized.toFixed(3));
  ckT('...and SHEDS the heaters on the NUREG-0737 latch, vital bus notwithstanding',
      engL.pz.shedLatch === true && (engL._pzr.heater_kW || 0) === 0, '');
  /* the operator re-loads the heaters DURING the LOOP: the vital bus carries them — this
   * pair (with the SBO twin below) is the ac_available wire's own gauge */
  EN.command(engL, 'pzr_heaters_manual', 1.0);
  var tsLh = run(engL, 5);
  ckT('the heater re-load during a LOOP delivers real watts — the vital bus is ALIVE',
      engL.pz.shedLatch === false && engL._pzr.heater_kW > 100,
      engL._pzr.heater_kW.toFixed(0) + ' kW on manual full');
  /* the charging pump through the facade wire, demand forced non-zero (the PLCS wants 0
   * here — level sits above the post-trip program, measured 40 % vs 25 — so the demand is
   * taken manual to make the probe non-vacuous) */
  engL._plcsAuto = false; engL.cv.chargingDemand = 1.0;
  var tsLc = run(engL, 2);
  ckT('...and full manual charging DELIVERS during the LOOP (vital bus, ~1.8 kg/s)',
      engL.cv.chargingDemand === 1.0 && tsLc.charging_flow_actual > 3e-5,
      'charging ' + tsLc.charging_flow_actual.toExponential(2) + ' frac/s');

  var engS = EN.createEngine({});
  run(engS, quiet ? 20 : 30);
  EN.command(engS, 'station_blackout', true);
  var tsS = run(engS, 120);
  ckT('an SBO reads on the contract (ac_available false, station_blackout true) and the ' +
      'demanded MDAFW delivers NOTHING while the steam-driven TDAFW carries the plant',
      tsS.ac_available === false && tsS.station_blackout === true &&
      engS.aw.mdafwRunning === true && engS.aw.tdafwRunning === true &&
      Math.abs(tsS.afw_flow_normalized - 2 / 3) < 0.01,
      'afw ' + tsS.afw_flow_normalized.toFixed(3) + ' = the TDAFW-only fraction');
  EN.command(engS, 'pzr_heaters_manual', 1.0);
  engS._plcsAuto = false; engS.cv.chargingDemand = 1.0;
  var tsSh = run(engS, 5);
  ckT('the SAME re-load and charging lineup under SBO delivers zero — the vital bus is DEAD',
      engS.pz.shedLatch === false && (engS._pzr.heater_kW || 0) === 0 &&
      engS.cv.chargingDemand === 1.0 && tsSh.charging_flow_actual === 0,
      'heaters 0 kW, charging 0 at full manual demand');
  EN.command(engS, 'station_blackout', false);
  var tsSr = run(engS, 5);
  ckT('clearing the SBO restores both buses: heaters live (latch was re-loaded), charging ' +
      'delivers at the standing demand, RCPs stay tripped',
      tsSr.ac_available === true && engS._pzr.heater_kW > 100 &&
      tsSr.charging_flow_actual > 3e-5 && engS.sys.pumpTripped === true, '');

  /* SI under blackout, on a plant whose pressure would otherwise take injection: the ECCS
   * wire's own probe — the module gate proves the module, THIS proves the facade passes it */
  var engB = EN.createEngine({});
  run(engB, quiet ? 20 : 30);
  EN.command(engB, 'break_open', { area_m2: 0.002, node: 'cold_leg' });
  var tsB = null, tSI = null;
  for (var kb = 0; kb < 240 / DT; kb++) {
    tsB = EN.step(engB, DT);
    if (tSI === null && tsB.hpi_flow_normalized > 0.05) { tSI = (kb + 1) * DT; break; }
  }
  ckT('fixture: the 20 cm2 break brings SI flow on its own', tSI !== null,
      tSI !== null ? ('flowing at t=' + tSI.toFixed(1) + ' s') : 'no SI flow in 240 s');
  EN.command(engB, 'station_blackout', true);
  var tsB2 = run(engB, 2);
  ckT('a station blackout STOPS the safety injection mid-LOCA (the facade\'s ECCS wire)',
      tsB2.hpi_flow_normalized === 0 && engB.ec.hhsiRunning === true,
      'flow 0 with the run flag standing');
  EN.command(engB, 'station_blackout', false);
  var tsB3 = run(engB, 2);
  ckT('...and restoring the buses resumes it at the standing lineup',
      tsB3.hpi_flow_normalized > 0.05, 'flow ' + tsB3.hpi_flow_normalized.toFixed(2));
  }

  if (grp('H')) {
  /* ---- 7. THE SGTR (#507 wave 5) — a break whose destination is the SG. Area [UNVERIFIED]
   * (no tube geometry in any lane's corpus): typical Westinghouse 0.75 in OD x 0.048 in wall,
   * double-ended 4.33e-4 m2. Measured 2026-08-22 at sev 0.4: initial 20.9 kg/s, 6.3 at
   * 300 s tracking the sqrt(dP) drive; OTdT trip 55.2 s, SI (lo pzr press) 69.7 s;
   * containment NEVER moves — the bypass signature. ---- */
  head('THE SGTR  [primary mass lands in the SG; containment sees nothing; the dP is the EOP]');
  var engT = EN.createEngine({});
  run(engT, quiet ? 20 : 30);
  var ctP0 = EN.step(engT, DT).containment_pressure_mpa;
  var dP0 = engT.sys.P - engT.sg.P;
  EN.command(engT, 'break_open', { area_m2: 0.4 * 4.33e-4, node: 'sg_primary' });
  run(engT, 1);
  var leak0 = engT._sgtrKgs;
  ckT('a 40 % double-ended tube rupture leaks primary water at the sourced-shape rate',
      leak0 > 15 && leak0 < 30, leak0.toFixed(1) + ' kg/s initial (full DER measures ~52 vs ' +
      'the 1982 Ginna event\'s ~48, with the break model\'s declared ~2x overstatement)');
  var tsT = run(engT, 300);
  var leak300 = engT._sgtrKgs, dP300 = engT.sys.P - engT.sg.P;
  ckT('the SG OVERFILLS on the leak — the sourced hazard (§15.6.3), mass frac > 1.1 at 300 s',
      tsT.sg_mass_frac > 1.1, 'mass frac ' + tsT.sg_mass_frac.toFixed(2));
  ckT('the plant answers unscripted: reactor trip and safety injection both latched',
      tsT.scrammed === true && engT.pt.si === true,
      'trip ' + engT.pt.trip_cause + ', SI ' + engT.pt.si_cause);
  ckT('CONTAINMENT NEVER MOVES — the bypass signature that diagnoses an SGTR',
      Math.abs(tsT.containment_pressure_mpa - ctP0) < 1e-6,
      'ctmt ' + (ctP0 * 145.038).toFixed(2) + ' psia before and after ' +
      engT.brk.discharged_kg.toFixed(0) + ' kg discharged');
  ckT('the leak TAPERS on the sqrt(dP) drive — depressurizing toward the ruptured SG is ' +
      'the sourced EOP, and the physics rewards it',
      Math.abs(leak300 / leak0 - Math.sqrt(dP300 / dP0)) < 0.1,
      'leak ratio ' + (leak300 / leak0).toFixed(3) + ' vs sqrt(dP ratio) ' +
      Math.sqrt(dP300 / dP0).toFixed(3));
  /* the one-break slot: a LOCA REPLACES the SGTR (declared — one break at a time) */
  EN.command(engT, 'break_open', { area_m2: 2e-4, node: 'cold_leg' });
  var tsT2 = run(engT, 5);
  ckT('a new break REPLACES the tube rupture (one-break slot, declared): the SGTR stream ' +
      'stops and containment starts receiving',
      engT.brk.node === 'cold_leg' && engT._sgtrKgs === 0 &&
      tsT2.containment_pressure_mpa > ctP0 + 1e-5,
      'ctmt now ' + (tsT2.containment_pressure_mpa * 145.038).toFixed(2) + ' psia');
  }

  if (grp('I')) {
  /* ---- 8. THE FAILURE LEVERS (#507 wave 6): the two that live in THIS file's caller's-half
   * and rod-drive logic — ATWS and the withdrawal runaway. The rows themselves ride the
   * shell gate; here the MECHANISM is pinned. ---- */
  head('THE FAILURE LEVERS  [ATWS: the latch stands, the rods do not; gravity beats a drive]');
  var engI = EN.createEngine({});
  run(engI, quiet ? 20 : 30);
  EN.command(engI, 'scram_block', true);
  EN.command(engI, 'scram');
  var tsI = run(engI, 5);
  ckT('a blocked scram LATCHES the trip — annunciated, turbine tripped — with the rods at 200',
      engI.pt.reactor_trip === true && engI.pt.trip_cause === 'manual' &&
      engI.tb.tripped === true && engI.rodSteps === 200 && tsI.scrammed === true,
      'the failure is the DROP, not the logic — which is what an ATWS is');
  EN.command(engI, 'scram_block', false);
  EN.command(engI, 'reset_protection', true);
  EN.command(engI, 'scram');
  run(engI, 5);
  ckT('...and after the block clears, reset + scram drops the rods (a fresh edge — the ' +
      'spent one is not retroactive, declared)',
      engI.rodSteps < 100 && engI.pt.reactor_trip === true, '');

  /* the fixture is the SHELL gate's measured one — 60 MWe, a shallow 25-step insert. The
   * first draft inserted 50 steps at FULL load and the RPS terminated the excursion mid-ride
   * (150 -> 0.0 measured): the plant answering an uncontrolled withdrawal is UFSAR 15.4's
   * own credited story, but it is a different claim than "the drive moves", and this check
   * asserts the drive. */
  var engJ = EN.createEngine({});
  run(engJ, quiet ? 20 : 30);
  EN.command(engJ, 'load_mwe', 60);
  run(engJ, 120);
  EN.command(engJ, 'rod_target', 175);
  run(engJ, 60);
  var sJ0 = engJ.rodSteps;
  EN.command(engJ, 'rod_runaway', 2.63);
  run(engJ, 10);
  var thrJ = false;
  try { EN.command(engJ, 'rod_target', 100); } catch (eJ) { thrJ = /REFUSED/.test(eJ.message); }
  ckT('a rod runaway drives OUTWARD at its own rate, target ignored, rod commands REFUSED',
      engJ.rodSteps > sJ0 + 20 && thrJ === true,
      sJ0.toFixed(0) + ' -> ' + engJ.rodSteps.toFixed(1) + ' steps in 10 s at 2.63/s');
  EN.command(engJ, 'scram');
  run(engJ, 5);
  ckT('...and a WORKING scram beats the drive: rods drop, the runaway clears',
      engJ.rodSteps < 50 && engJ.runaway === null, 'gravity wins');
  }

  if (grp('K')) {
  /* ---- 9. THE INITIAL CONDITIONS (#507 §F, wave 7) — each a SETTLED construction, each
   * ride measured 2026-08-22 before these checks were written. ---- */
  head('THE INITIAL CONDITIONS  [50 % and Hot Standby open settled; the startup is real]');
  var engK = EN.createEngine({ initial_state: '50_percent' });
  var tsK = EN.step(engK, DT);
  ckT('50 % opens ON its point: power 50, Tavg at the program\'s own 298.08 degC, 50 MWe, ' +
      'the secondary landed where the duty puts it',
      Math.abs(tsK.power_pct - 50) < 0.5 && Math.abs(tsK.tavg_c - 298.08) < 0.15 &&
      Math.abs(tsK.mwe_output - 50) < 1 &&
      engK.sg.P * 145.038 > 945 && engK.sg.P * 145.038 < 975 &&
      Math.abs(tsK.pzr_level_pct - 43.2) < 1.5,
      tsK.power_pct.toFixed(1) + ' %, ' + tsK.tavg_c.toFixed(2) + ' degC, SG ' +
      (engK.sg.P * 145.038).toFixed(0) + ' psia, level ' + tsK.pzr_level_pct.toFixed(1) + ' %');
  var minK = 101;
  for (var kk = 0; kk < (quiet ? 60 : 120) / DT; kk++) {
    tsK = EN.step(engK, DT);
    if (tsK.power_pct < minK) minK = tsK.power_pct;
  }
  ckT('...and rides untouched without a ring (measured 120 s: min 48.79 %, Tavg -0.9 degC)',
      minK > 48 && Math.abs(tsK.tavg_c - 298.08) < 1.8 && tsK.scrammed === false,
      'min ' + minK.toFixed(2) + ' %, Tavg ' + tsK.tavg_c.toFixed(2));

  var engH = EN.createEngine({ initial_state: 'hot_zero_power' });
  var tsH = EN.step(engH, DT);
  ckT('Hot Standby opens at the plant\'s OWN no-load point — Tsat of the sourced 1005 psig ' +
      '(547.9 degF, the Ginna pair; the 557 degF program anchor saturates ABOVE the 1085 ' +
      'psig MSSV pop, measured — the ICS header), level at the 25 % no-load program',
      tsH.power_pct < 1e-3 && Math.abs(tsH.tavg_c - 286.11) < 0.15 &&
      engH.sg.P * 145.038 > 1012 && engH.sg.P * 145.038 < 1028 &&
      Math.abs(tsH.pzr_level_pct - 25) < 1.0,
      tsH.tavg_c.toFixed(2) + ' degC, SG ' + (engH.sg.P * 145.038).toFixed(0) + ' psia, ' +
      'level ' + tsH.pzr_level_pct.toFixed(1) + ' %');
  ckT('...with the sourced no-load LINEUP: control bank IN, shutdown bank OUT (WTSM 8.1.1), ' +
      'dumps in STEAM PRESSURE mode at 1005 psig, feed at no-load, subcritical boron',
      engH.rodSteps === 0 && engH.sdSteps === 200 &&
      engH.dcDrivers.mode === 'pressure' &&
      Math.abs(engH.dcDrivers.pressure_setpoint_mpa - 7.03) < 1e-9 &&
      engH.fw.feed_frac === 0 && tsH.boron_ppm > 700 && tsH.boron_ppm < 740,
      'boron ' + tsH.boron_ppm.toFixed(0) + ' ppm (the 1000 pcm margin = +100 ppm)');
  var driftH = 0, tsH2 = tsH;
  for (kk = 0; kk < (quiet ? 60 : 120) / DT; kk++) {
    tsH2 = EN.step(engH, DT);
    if ((tsH2.sg_safety_kgs || 0) > driftH) driftH = tsH2.sg_safety_kgs;
  }
  ckT('...and HOLDS: power stays at source level, Tavg drift measured +0.05 degC/120 s ' +
      '(pump heat, the dumps carry it), the MSSVs never lift',
      tsH2.power_pct < 1e-2 && Math.abs(tsH2.tavg_c - 286.11) < 0.4 &&
      driftH === 0 && tsH2.scrammed === false,
      'Tavg ' + tsH2.tavg_c.toFixed(2) + ', safeties ' + driftH);

  /* the startup ACCIDENT: a continuous fast pull is uncontrolled withdrawal from
   * subcritical, and the 35 % low-flux trip terminates it (UFSAR 15.4.1's credited trip;
   * measured: 1 % -> 100.8 % inside the trip's own analysis delay — real and kept) */
  var engA2 = EN.createEngine({ initial_state: 'hot_zero_power' });
  EN.command(engA2, 'rod_speed', 'fast');
  EN.command(engA2, 'rod_target', 200);
  var tsA2 = null;
  for (kk = 0; kk < 200 / DT && !(tsA2 && tsA2.scrammed); kk++) tsA2 = EN.step(engA2, DT);
  ckT('a continuous fast pull from subcritical IS the startup accident, and the low-flux ' +
      'trip answers it',
      tsA2.scrammed === true && engA2.pt.trip_cause === 'hi_flux_lo',
      'cause ' + engA2.pt.trip_cause + ' at ' + tsA2.power_pct.toFixed(1) + ' % (the ' +
      'overshoot is the sourced 0.5 s delay at a fast period)');

  /* the CONTROLLED startup, the measured operator profile: critical ~84 steps (1.35 %),
   * block taken at 18 % (above P-10), stepped to 96 -> 42.6 % THROUGH the 35 % setpoint */
  var engS2 = EN.createEngine({ initial_state: 'hot_zero_power' });
  EN.command(engS2, 'rod_speed', 'normal');
  EN.command(engS2, 'rod_target', 84);
  var tsS2 = run(engS2, 180);
  var p84 = tsS2.power_pct;
  EN.command(engS2, 'rod_target', 86);
  tsS2 = run(engS2, 30);
  EN.command(engS2, 'low_flux_block', true);      /* above P-10 here — measured 18.2 % */
  var pBlk = tsS2.power_pct;
  tsS2 = run(engS2, 90);
  EN.command(engS2, 'rod_target', 96);
  tsS2 = run(engS2, 180);
  ckT('a CONTROLLED startup works end to end: critical partway up the bank, the block ' +
      'taken above P-10, and the ascension passes the 35 % setpoint UNTRIPPED',
      p84 > 0.2 && p84 < 8 && pBlk > 8 &&
      tsS2.power_pct > 36 && tsS2.scrammed === false &&
      engS2.rpsReport.low_flux_blocked === true,
      'critical leg ' + p84.toFixed(2) + ' %, blocked at ' + pBlk.toFixed(1) +
      ' %, now ' + tsS2.power_pct.toFixed(1) + ' % unscrammed');

  /* P-10 owns the request: a block taken at source level is revoked on the next step */
  var engR2 = EN.createEngine({ initial_state: 'hot_zero_power' });
  EN.step(engR2, DT);
  EN.command(engR2, 'low_flux_block', true);
  var reqAt = engR2.pt.blockLowFlux;
  EN.step(engR2, DT);
  ckT('below P-10 the block request is AUTO-REVOKED (the sourced asymmetric gate)',
      reqAt === true && engR2.pt.blockLowFlux === false, '');

  var threwIC = null;
  try { EN.createEngine({ initial_state: 'cold_shutdown' }); }
  catch (eIC) { threwIC = /unknown initial_state/.test(eIC.message); }
  ckT('an IC this engine does not carry THROWS (cold shutdown waits on an RCP restart — ' +
      'declared in the registry, not silently hot-full-power)',
      threwIC === true, '');
  }

  if (grp('L')) {
  /* ---- 10. THE ROD INSERTION LIMIT (#507 §B, wave 8) — display/annunciator only on this
   * plant. THE CURVE RECEDES WITH POWER by design (deep insertion is legal at low power),
   * so a plain insertion never closes the margin — measured: the honest approach is rods
   * IN while power is RESTORED (dilution), which is exactly the operational story the RIL
   * exists for. ---- */
  head('THE ROD INSERTION LIMIT  [null below 5 %; 70 % floor at rated; the margin closes on dilution]');
  ckT('the curve is the adopted pwr1 shape: null at and below 5 %, 140 steps at rated, ' +
      'monotone between',
      EN.insertionLimitSteps(0) === null && EN.insertionLimitSteps(5) === null &&
      EN.insertionLimitSteps(100) === 140 &&
      EN.insertionLimitSteps(50) > EN.insertionLimitSteps(20) &&
      Math.abs(EN.insertionLimitSteps(50) - 72) <= 1,
      '50 % -> ' + EN.insertionLimitSteps(50) + ' steps');
  var engL = EN.createEngine({});
  var tsL = run(engL, 20);
  ckT('at hot full power the limit is LIVE and generous: RIL ~139, margin ~60, not at limit',
      engL._rilSteps >= 137 && engL._rilSteps <= 141 &&
      engL._rodLimitMargin > 55 && engL._rodAtLimit === false,
      'RIL ' + engL._rilSteps + ', margin ' + engL._rodLimitMargin);
  var engZ = EN.createEngine({ initial_state: 'hot_zero_power' });
  EN.step(engZ, DT);
  ckT('at Hot Standby the limit does NOT APPLY — a bank parked at 0 stands NO limit alarm ' +
      '(the 5 % floor is what keeps every startup from opening annunciated)',
      engZ._rilSteps === null && engZ._rodAtLimit === false && engZ._rodLimitMargin === 200,
      '');
  /* the honest approach (measured 2026-08-23): insert to 145 (power sags to 85.8, the
   * limit recedes to 121 — margin OPENS to 24), then dilute: power recovers, the limit
   * climbs back, and the margin closes to <10 at +35 s; a 5-step insert at power reaches
   * the limit itself */
  EN.command(engL, 'rod_speed', 'fast');
  EN.command(engL, 'rod_target', 145);
  run(engL, 60);
  var openedTo = engL._rodLimitMargin;
  EN.command(engL, 'boron_rate', -0.10);
  var tL = 0;
  while (tL < 120 && engL._rodLimitMargin >= 10 && !tsL.scrammed) { tsL = run(engL, 5); tL += 5; }
  ckT('rods in + dilution restoring power CLOSES the margin below the sourced RIL+10 — ' +
      'the limit chased the power back up',
      openedTo > 15 && engL._rodLimitMargin < 10 && tsL.scrammed === false,
      'margin opened to ' + openedTo + ' on the insert, closed to ' + engL._rodLimitMargin +
      ' at t=+' + tL + ' s, power ' + tsL.power_pct.toFixed(1) + ' %');
  /* the dilution KEEPS RUNNING through the final insert — securing it first lets power sag
   * and the limit recede under the bank (measured 96.3 %/RIL 135 under 139 steps; the
   * first gate draft did exactly that and reddened on its own fixture, not the plant).
   * The limit then CLIMBS to meet the bank as power recovers — at-limit at +55 s measured. */
  EN.command(engL, 'rod_target', 139);
  var tL2 = 0;
  while (tL2 < 200 && !engL._rodAtLimit && !tsL.scrammed) { tsL = run(engL, 5); tL2 += 5; }
  ckT('...and five more steps with the dilution running reaches the LIMIT itself as power ' +
      'recovers (ROD LIMIT LO-LO\'s fact; measured at +55 s)',
      engL._rodAtLimit === true && tsL.power_pct > 90 && tsL.scrammed === false,
      'steps ' + engL.rodSteps.toFixed(0) + ' <= RIL ' + engL._rilSteps + ' at ' +
      tsL.power_pct.toFixed(1) + ' % (t=+' + tL2 + ' s)');
  }

  if (grp('M')) {
  /* ---- 11. THE RCP RESTART (#507 wave 9) — the one-way trip retired. Measured: from rest,
   * rated speed at +13 s, flow >90 % at +10 s — the real RCP start class. ---- */
  head('THE RCP RESTART  [the motor spins the coasted rotor back; the grid gates the start]');
  var engM = EN.createEngine({});
  run(engM, quiet ? 20 : 30);
  EN.command(engM, 'pump_trip', true);
  run(engM, 60);
  var flowLow = engM.sys.mdot_loop;
  EN.command(engM, 'rcp_start', true);
  var tM = 0;
  while (tM < 60 && engM.sys.mdot_loop < 0.9 * 1630) { run(engM, 1); tM += 1; }
  ckT('a coasted pump RESTARTS on the operator command: flow back above 90 % of rated ' +
      'inside the start class',
      flowLow < 0.5 * 1630 && engM.sys.mdot_loop > 0.9 * 1630 && tM <= 30,
      'coasted to ' + flowLow.toFixed(0) + ' kg/s, recovered at +' + tM + ' s');
  var engN = EN.createEngine({});
  run(engN, 2);
  EN.command(engN, 'station_blackout', true);
  EN.step(engN, DT);
  var thrM = false;
  try { EN.command(engN, 'rcp_start', true); } catch (eM) { thrM = /REFUSED/.test(eM.message); }
  EN.command(engN, 'station_blackout', false);
  EN.command(engN, 'rcp_start', true);
  ckT('the start is REFUSED out loud on a dead nonvital bus (WTSM 3.2 — no diesel feed) ' +
      'and LANDS once the grid is back: recovery hands back a stopped pump, the operator ' +
      'starts it',
      thrM === true && engN.sys.pumpTripped === false, '');
  }

  if (grp('N')) {
  /* ---- 12. THE SHUTDOWN IC (#507 wave 10) — Mode 4, Hot Shutdown: 250 degF / 350 psig,
   * RHR-held, RCPs secured, both banks in, the P-11 blocks taken. Mode 5 is deliberately
   * unbuilt (Layer 0's 0.1 MPa floor — Tsat 211 degF — see the ICS header). ---- */
  head('THE SHUTDOWN IC  [Mode 4 opens held; the #468 boron inversion cannot return; the heatup is real]');
  var engC = EN.createEngine({ initial_state: 'hot_shutdown' });
  var tsC = EN.step(engC, DT);
  ckT('opens ON its point: Mode 4 at 250 degF / 350 psig class, level 25 % (#510 batch 1, ' +
      'owner-ruled: the level PROGRAM\'s own value at 250 degF — the old 30 booted the ' +
      'controller 5 points above program), RCPs SECURED, ' +
      'RHR aligned with the HX throttled (a HOLD), the P-11 blocks taken, nothing latched',
      tsC.plant_mode === 4 && /Hot Shutdown/.test(tsC.plant_mode_name) &&
      Math.abs(tsC.tavg_c - 121.1) < 0.2 &&
      tsC.pressure_mpa * 145.038 > 358 && tsC.pressure_mpa * 145.038 < 370 &&
      Math.abs(tsC.pzr_level_pct - 25) < 1.5 &&
      engC.sys.pumpTripped === true && engC.sys.omega === 0 &&
      engC.rh.valve_open === true && engC.rh.hx_fraction === 0 &&
      engC.pt.blockLoPress === true && engC.pt.blockSI === true &&
      tsC.scrammed === false && engC.pt.si === false,
      tsC.tavg_c.toFixed(1) + ' degC / ' + (tsC.pressure_mpa * 145.038).toFixed(0) + ' psia');
  var bCold = tsC.boron_ppm;
  var engZ3 = EN.createEngine({ initial_state: 'hot_zero_power' });
  var bHzp = EN.step(engZ3, DT).boron_ppm;
  /* the DIRECT discriminator: what the INVERTED order would have produced is criticalBoron
   * at the AS-BUILT lineup (shutdown bank IN) + the margin — the bank's boron-equivalent at
   * cold is only ~84 ppm through the density coupling, which slid under this check's first
   * (+100 vs hot standby) form and made the inversion mutation BLIND; measured 999 correct
   * vs 915 inverted, so the gap is asserted against the model's own arithmetic, not a
   * remembered threshold */
  var K10 = globalThis.RD.pwr2.kinetics;
  var bInverted = K10.criticalBoron(engC.rx.kin, 121.1, 2.51, engC.rodBank,
                    engC.rx.kin.X / engC.rx.kin.X_eq_full, engC.rx.fuel.T_fuel_c) +
                  0.01 / K10.BORON.worth_per_ppm;
  ckT('THE #468 ORDER HOLDS: the cold boron is the trim-with-bank-OUT figure — measurably ' +
      'ABOVE what trimming with the bank IN would give (999 vs 915 measured), and above ' +
      'hot standby\'s (719): the bank\'s worth is margin in RODS, not paid in boron',
      bCold > bInverted + 40 && bCold > bHzp + 100,
      bCold.toFixed(0) + ' vs inverted-order ' + bInverted.toFixed(0) + ' vs HZP ' +
      bHzp.toFixed(0) + ' ppm');
  var tsC2 = run(engC, quiet ? 120 : 300);
  /* ⚠ THIS IS A BOOT CHECK, NOT A SETTLEDNESS CLAIM (#510 M-7): its first form was named
   * "HOLDS" off a 300 s Tavg band — the first 6 % of a monotone 75-minute transient the
   * band could never see. Settledness is run_pwr2_endurance's (equilibrium DERIVATIVES
   * over the ride's last window, ridden past the failure horizon); this window only pins
   * that the construction opens quiet. */
  ckT('...and the BOOT is quiet for 300 s: no trips, no SI, Mode 4 (settledness is ' +
      'run_pwr2_endurance\'s claim, not this window\'s)',
      Math.abs(tsC2.tavg_c - 121.1) < 2.5 && tsC2.scrammed === false &&
      engC.pt.si === false && tsC2.plant_mode === 4,
      'tavg ' + tsC2.tavg_c.toFixed(2));
  EN.command(engC, 'rcp_start', true);
  var tHeat0 = tsC2.tavg_c;
  var tsC3 = run(engC, quiet ? 300 : 600);
  var ratePerHr = (tsC3.tavg_c - tHeat0) * 9 / 5 * (3600 / (quiet ? 300 : 600));
  ckT('the HEATUP is real: pump heat alone warms the held plant in the sourced class ' +
      '(measured 92.8 degF/hr under the #510 batch-1 lineup — heaters AUTO ride along; ' +
      'was 87.9 with heaters manual-0 — under the 100 degF/hr limit), untripped, no SI',
      ratePerHr > 40 && ratePerHr < 110 && tsC3.scrammed === false &&
      engC.pt.si === false && engC.sys.beyond_model !== true,
      ratePerHr.toFixed(1) + ' degF/hr, flow ' + engC.sys.mdot_loop.toFixed(0) + ' kg/s');
  /* the unblock cascade: clearing the SI block at shutdown pressure INJECTS — the mirror
   * of the board's unblock-at-power scram, and the reason the blocks are procedure */
  var engU = EN.createEngine({ initial_state: 'hot_shutdown' });
  EN.step(engU, DT);
  EN.command(engU, 'si_block', false);
  EN.command(engU, 'lo_press_trip_block', false);
  var tsU = run(engU, 10);
  ckT('clearing the P-11 blocks at 350 psig CASCADES: the low-pressure trip and SI both ' +
      'latch and the pumps start — protection working, and why the blocks are a procedure',
      tsU.scrammed === true && engU.pt.si === true && engU.ec.hhsiRunning === true, '');
  var thrP11 = false;
  try { EN.command(EN.createEngine({}), 'si_block', true); }
  catch (eP) { thrP11 = /P-11/.test(eP.message); }
  ckT('engaging either block ABOVE P-11 is REFUSED (the #295 defeatable-trip lesson)',
      thrP11 === true, '');
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
  /* anchor moved with the wave-6 ATWS gate (#507): the caller's half grew !scramBlocked */
  ['the scram-on-trip is deleted (the RPS reports into a void)',
   "if (ptr.reactor_trip && !eng._lastTrip && !eng.scramBlocked) {\n      eng.rodTarget = 0; eng._scramT = 0; eng.runaway = null;\n    }",
   '', { grp: 'A' }],
  ['SI never starts the ECCS',
   'if (ptr.si) { eng.ec.hhsiRunning = true; eng.ec.lhsiRunning = true; }',
   '', { grp: 'D' }],
  ['the oxidation heat is never fed back',
   'eng._Qox = dr.Q_ox_kW;',
   'eng._Qox = 0;', { grp: 'D' }],
  ['the RHR heats merge is dropped (an aligned system removes zero heat — the #458 orphan)',
   "    var heats = rrx.heats;\n    if (rhrR.duty_kW > 0) {\n      heats = Object.assign({}, rrx.heats);\n      Object.keys(rhrR.heats).forEach(function (n) { heats[n] = (heats[n] || 0) + rhrR.heats[n]; });\n    }",
   '    var heats = rrx.heats;', { grp: 'D' }],
  ['the align door ignores the 425 psig permissive (a valve that opens at power)',
   'else if (eng.sys.P * 145.038 - 14.7 < RD.rhr.RHR.permissive_open_psig) eng.rh.valve_open = true;',
   'else eng.rh.valve_open = true;', { grp: 'D' }],
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
   /* anchor re-pointed #507 wave 5: the SG drivers grew the tube-leak pair after afw_h */
   'afw_kgs: awr.total_kgs, afw_h: awr.h_kJkg,',
   'afw_kgs: 0, afw_h: 0,', { grp: 'E' }],
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
  /* anchor re-pointed #507 wave 4: the drivers object grew power_ok after si_active */
  ['the SI wire to the feed module is cut (no isolation ever arrives)',
   '      si_active: eng.pt.si,\n      /* main feed pumps are NONVITAL loads',
   '      si_active: false,\n      /* main feed pumps are NONVITAL loads',
   { grp: 'E' }],
  ['the shrink/swell shift is dropped from the internal channel',
   "    IN.stepInstruments(eng.ins, dt, ts, { shift: { sg_level: 0.8 * (eng._pwrRate || 0) } });",
   '    IN.stepInstruments(eng.ins, dt, ts);', { grp: 'F' }],
  /* THE ELECTRICAL PAIR (#507 wave 4) — one mutation per wire */
  ['the AFAS LOOP-start driver is cut (the sourced ch10 start never fires)',
   '      loss_of_offsite: !offsiteOk,',
   '      loss_of_offsite: false,', { grp: 'G' }],
  ['the feed train\'s grid wire is cut (blacked-out feed pumps keep feeding)',
   '      power_ok: offsiteOk\n    });',
   '      power_ok: true\n    });', { grp: 'G' }],
  ['the condenser\'s grid wire is cut (CW pumps spin with no electricity)',
   '      cw_pumps_running: eng.cwPumps && offsiteOk',
   '      cw_pumps_running: eng.cwPumps', { grp: 'G' }],
  /* anchor re-pointed #510 batch 1: the CVCS call grew the rhr_letdown_ok driver */
  ['the CVCS and ECCS vital-bus wires are cut (charging and SI survive the blackout)',
   "    var cvr = CV.stepCVCS(eng.cv, sys, dt, { ac_available: acAvail, rhr_letdown_ok: eng.rh.valve_open });\n    var ecr = EC.stepECCS(eng.ec, sys, dt, { ac_available: acAvail });",
   '    var cvr = CV.stepCVCS(eng.cv, sys, dt, { rhr_letdown_ok: eng.rh.valve_open });\n    var ecr = EC.stepECCS(eng.ec, sys, dt);', { grp: 'G' }],
  ['the pressurizer\'s electrical drivers are cut (the wire that was dark before wave 4)',
   '      ac_available: acAvail,\n      offsite_ok: offsiteOk\n    }, eng.pzDrivers));',
   '    }, eng.pzDrivers));', { grp: 'G' }],
  ['the MDAFW power wire is cut (a blacked-out motor pump keeps pumping)',
   "    var awr = AW.stepAFW(eng.aw, dt, { mdafw_power_ok: acAvail });",
   '    var awr = AW.stepAFW(eng.aw, dt, {});', { grp: 'G' }],
  /* NO blackout-forgets-offsite mutation: `offsiteOk = offsite && !blackout` already makes
   * that write redundant, so the mutation could never red — the hollow-mutation trap the
   * house rule forbids. The write stays in the command as documented intent. */
  /* THE SGTR (#507 wave 5) — one mutation per seam */
  ['the SGTR backpressure driver is cut (the tube discharges against containment pressure)',
   'toSG ? { backpressure_mpa: sr.P_sec } : {}) : null;',
   '{}) : null;', { grp: 'H' }],
  ['the SGTR stash is severed (primary water leaves and never reaches the SG)',
   '    eng._sgtrKgs = toSG && br ? br.mdot_kgs : 0;',
   '    eng._sgtrKgs = 0;', { grp: 'H' }],
  ['the SG never consumes the stream (the old engine\'s own defect: mass landed nowhere)',
   '                                          tube_leak_kgs: eng._sgtrKgs || 0,',
   '                                          tube_leak_kgs: 0,', { grp: 'H' }],
  ['the containment exclusion is dropped (a tube rupture pressurizes containment)',
   '    var ctIn = (br && !toSG ? br.mdot_kgs : 0) + (eng._pzRelief > 0 ? eng._pzRelief : 0);',
   '    var ctIn = (br ? br.mdot_kgs : 0) + (eng._pzRelief > 0 ? eng._pzRelief : 0);',
   { grp: 'H' }],
  /* THE FAILURE LEVERS (#507 wave 6) */
  ['the ATWS gate is severed (a blocked scram drops the rods anyway)',
   'if (ptr.reactor_trip && !eng._lastTrip && !eng.scramBlocked) {\n      eng.rodTarget = 0; eng._scramT = 0; eng.runaway = null;\n    }',
   'if (ptr.reactor_trip && !eng._lastTrip) {\n      eng.rodTarget = 0; eng._scramT = 0; eng.runaway = null;\n    }',
   { grp: 'I' }],
  ['the runaway never drives (an injected withdrawal fault does nothing)',
   '      eng.rodSteps = Math.min(200, eng.rodSteps + eng.runaway.rate * dt);',
   '', { grp: 'I' }],
  ['the rod-command refusal is severed (a faulted drive quietly obeys the lever)',
   "        if (eng.runaway) {\n          throw new Error('pwr2_engine: rod command REFUSED — continuous withdrawal failure ' +\n            'active; clear the failure first');\n        }",
   '', { grp: 'I' }],
  /* THE INITIAL CONDITIONS (#507 §F, wave 7) */
  ['the 50 % secondary lands at the full-power literal (an IC whose SG fights its plant)',
   "    var sg = ic.pf === 1 ? G.createSG({})\n           : G.createSG({ P: W.P_sat(tavg0 - ic.pf * (TREF - W.T_sat(G.createSG({}).P))) });",
   '    var sg = G.createSG({});', { grp: 'K' }],
  ['the kinetics seed at full power regardless of the IC (the SS-6 class, re-armed)',
   '    var powf = ic.pf > 0 ? ic.pf : 1e-6;',
   '    var powf = 1.0;', { grp: 'K' }],
  ['the subcritical margin is dropped (an HZP that detonates on the first pull)',
   '    if (ic.subcritical) boron0 += 0.01 / RD.kinetics.BORON.worth_per_ppm;',
   '', { grp: 'K' }],
  /* anchor grew the cold branch in wave 10 */
  ['the no-load anchor reverts to the program\'s 557 degF (saturates above the MSSV pop)',
   "    var tavg0 = ic.cold ? ic.tavg_c\n              : ic.pf > 0 ? DC.tref(ic.load_mwe / MWE_RATED) : W.T_sat(G.SG.P_noload);",
   '    var tavg0 = ic.cold ? ic.tavg_c : DC.tref(ic.load_mwe / MWE_RATED);', { grp: 'K' }],
  /* anchor grew the cold branch in wave 10 */
  ['the HZP dump lineup is dropped (nothing holds the no-load plant)',
   "      dcDrivers: ic.pf > 0 ? {}\n               : ic.cold ? { mode: 'off' }\n               : { mode: 'pressure', pressure_setpoint_mpa: G.SG.P_noload },",
   "      dcDrivers: ic.cold ? { mode: 'off' } : {},", { grp: 'K' }],
  /* THE ROD INSERTION LIMIT (#507 §B, wave 8) */
  ['the RIL curve is deleted (no limit at any power)',
   '    if (!(P_pct > RIL.min_power_pct)) return null;',
   '    return null;\n    if (!(P_pct > RIL.min_power_pct)) return null;', { grp: 'L' }],
  ['the applicability floor is deleted (a Hot Standby bank at 0 stands LO-LO forever)',
   '    if (!(P_pct > RIL.min_power_pct)) return null;',
   '    if (false) return null;', { grp: 'L' }],
  ['at-limit is never computed (the LO-LO fact pinned false)',
   '    eng._rodAtLimit = ril !== null && eng.rodSteps <= ril;',
   '    eng._rodAtLimit = false;', { grp: 'L' }],
  ['the margin is pinned wide (the LO approach can never annunciate)',
   "    eng._rodLimitMargin = ril === null ? 200 : Math.max(0, Math.round(eng.rodSteps - ril));",
   '    eng._rodLimitMargin = 200;', { grp: 'L' }],
  /* THE RCP RESTART (#507 wave 9) */
  ['the start\'s electrical gate is severed (a blacked-out bus starts a 6,000 hp motor)',
   '        if (!(eng.elec.offsite && !eng.elec.blackout)) {',
   '        if (false) {', { grp: 'M' }],
  /* THE SHUTDOWN IC (#507 wave 10) */
  ['the #468 order is INVERTED (the bank inserts before the trim; the margin is paid in boron)',
   '    var boron0 = RD.kinetics.criticalBoron(rx.kin, tavg0, icP, rodBank,',
   '    if (ic.cold) rodBank[1].steps = 0;\n    var boron0 = RD.kinetics.criticalBoron(rx.kin, tavg0, icP, rodBank,',
   { grp: 'N' }],
  ['the cold boot forgets the P-11 blocks (the shutdown plant injects at construction)',
   '      pt: PT.createProtection({ blockLowFlux: ic.pf >= 0.1,\n                                blockLoPress: !!ic.cold, blockSI: !!ic.cold }),',
   '      pt: PT.createProtection({ blockLowFlux: ic.pf >= 0.1 }),', { grp: 'N' }],
  ['the RHR hold throttle is dropped (the "held" plant cools at 560 degF/hr and drains)',
   '      eng.rh.hx_fraction = 0;',
   '      eng.rh.hx_fraction = 0.5;', { grp: 'N' }],
  ['the P-11 engage refusal is severed on the SI block (an at-power bypass)',
   "          if (pInd2 >= PT.P11.mpa) {",
   '          if (false) {', { grp: 'N' }]
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
  var rec2 = [], crashed = false;
  try {
    runSuite(isCore ? loadAll(undefined, mutated) : loadAll(mutated), rec2, !process.env.MUTDBG, grpTag);
  } catch (e) { crashed = true; }
  /* A crash counts as caught NO MATTER how many checks recorded first. The old form
   * (`rec2.length ? fails : 1`) was only right for a crash BEFORE the first check: a
   * mutation that crashed mid-group left every already-recorded check green and read as
   * BLIND — measured 2026-08-21, a null-crash in a probe's own note string wore the
   * blind-spot verdict through two full reruns. */
  var f2 = crashed ? 1 : (rec2.length ? rec2.filter(function (r) { return !r.ok; }).length : 1);
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
