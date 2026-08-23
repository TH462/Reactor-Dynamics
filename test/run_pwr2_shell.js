/* run_pwr2_shell.js — the PWR2Engine shell class's gate (Option B stage B2, 2026-08-20).
 *
 * WHAT IT PINS: the full RD.PWREngine-shaped surface; the REUSED pwr_instruments member fed
 * by the B1-completed contract; THE COMMAND PARTITION — every action in the CURRENT engine's
 * own applyCommand switch (parsed from its source, so a new old-engine action cannot appear
 * unaccounted) is in exactly one of MAPPED/REHOMED/REFUSED, refusals carry reasons and THROW;
 * and the save contract — schema pwr2-1.0 only (pwr-1.0 refused with the D4 §5 reason), with
 * BIT-EXACT round trips over both true_state and the instrument readings.
 *
 * Run: node test/run_pwr2_shell.js
 */
'use strict';
var path = require('path');
var fs = require('fs');
var SRC = path.join(__dirname, '..', 'engines', 'pwr2');

function loadAll(shellSource) {
  require(path.join(__dirname, '..', 'engines', 'load_mode.js'));
  require(path.join(__dirname, '..', 'engines', 'pwr', 'pwr_config.js'));
  require(path.join(__dirname, '..', 'layers', 'control', 'control_kernel.js'));
  require(path.join(__dirname, '..', 'layers', 'control', 'pwr_control.js'));
  require(path.join(__dirname, '..', 'engines', 'pwr', 'pwr_instruments.js'));
  ['pwr2_water', 'pwr2_vtable', 'pwr2_geometry', 'pwr2_core', 'pwr2_loop', 'pwr2_kinetics',
   'pwr2_fuel', 'pwr2_reactor', 'pwr2_sources', 'pwr2_sg', 'pwr2_turbine', 'pwr2_relief',
   'pwr2_condenser', 'pwr2_cvcs', 'pwr2_eccs', 'pwr2_afw', 'pwr2_damage', 'pwr2_protection',
   'pwr2_pressurizer', 'pwr2_dumpctl', 'pwr2_break', 'pwr2_containment', 'pwr2_rhr',
   'pwr2_true_state', 'pwr2_instruments', 'pwr2_feedwater', 'pwr2_engine'].forEach(function (f) {
    delete require.cache[require.resolve(path.join(SRC, f + '.js'))];
    require(path.join(SRC, f + '.js'));
  });
  if (shellSource === undefined) {
    delete require.cache[require.resolve(path.join(SRC, 'pwr2_shell.js'))];
    require(path.join(SRC, 'pwr2_shell.js'));
  } else {
    (0, eval)(shellSource);
  }
  return globalThis.RD.pwr2.shell;
}

var DT = 0.02;

function runSuite(SH, rec, quiet) {
  function ck(name, cond, note) {
    rec.push({ name: name, ok: !!cond });
    if (!quiet) console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (note ? '  -- ' + note : ''));
  }
  function head(s) { if (!quiet) console.log('\n' + s); }
  function run(e, secs) { var t; for (var i = 0; i < secs / DT; i++) t = e.step(DT); return t; }

  /* ---- 1. THE SURFACE ----------------------------------------------------------------------- */
  head('THE SURFACE  [every method the M4/M5 stack calls on an engine]');
  var eng = new SH.PWR2Engine({});
  var ts = run(eng, quiet ? 30 : 60);
  ck('step/getTrueState: the plant runs and publishes the completed contract',
     ts.pressure_mpa > 14 && ts.power_pct > 90 && ts.plant_mode === 1 &&
     ts.ac_available === true,
     (ts.pressure_mpa * 145.04).toFixed(0) + ' psia, ' + ts.power_pct.toFixed(1) + ' %');
  var rd = eng.getInstruments();
  ck('getInstruments()/instruments.reading are the SAME dict (control_kernel reads it directly)',
     rd === eng.instruments.reading && typeof rd === 'object', '');
  var nan = Object.keys(rd).filter(function (k) {
    return typeof rd[k] === 'number' && !isFinite(rd[k]);
  });
  ck('every reused-instrument reading is FINITE (reset() primes the lag buffers — measured ' +
     'NaN across all 45 channels without it)', nan.length === 0,
     nan.length ? 'NaN: ' + nan.slice(0, 5).join(', ') : Object.keys(rd).length + ' channels');
  ck('the indicated tavg TRACKS the plant through the reused layer',
     Math.abs(rd.tavg - ts.tavg_c) < 2.0,
     'ind ' + rd.tavg.toFixed(2) + ' vs true ' + ts.tavg_c.toFixed(2) + ' degC');
  /* _copyStatus reads ONLY the extras dict — with {} passed (the shipped B2 defect) all 35
   * status readings were undefined and every board status word defaulted: the RCP handswitch
   * lit OFF over a running pump, AUX FEED read SECURED, the polisher STANDBY (measured on the
   * 2026-08-21 screenshot). boron_sample is LIVE since #507 wave 1 (a standing lab number at
   * boot, the mid-shift-handover convention) — undefined is the defect either way. */
  /* the boron lab, through the shell (#507 wave 1): a standing number at boot, PENDING on a
   * request, a fresh result (seq bumps) when the lab clock expires. The timer is shortened
   * white-box — riding the real 1800 s at shell dt would be a 90 s gate for a counter. */
  ck('the boron lab sample is LIVE: standing number, pending on request, posts with a new seq',
     (function () {
       var rd0 = eng.instruments.reading;
       if (typeof rd0.boron_sample !== 'number' || rd0.boron_sample_seq !== 1) return false;
       eng.applyCommand({ action: 'take_boron_sample' });
       eng.step(0.02);
       if (eng.instruments.reading.boron_sample_pending !== true) return false;
       eng.eng.cv._sample_timer = 0.01;
       eng.step(0.02);
       var r2 = eng.instruments.reading;
       return r2.boron_sample_pending === false && r2.boron_sample_seq === 2 &&
              typeof r2.boron_sample === 'number';
     })(),
     'request -> SAMPLING… -> a rounded ppm with seq 2');
  var STAT = eng.instruments.specs.status;
  var statMiss = STAT.filter(function (k) { return rd[k] === undefined; });
  ck('all ' + STAT.length + ' STATUS passthroughs are populated at power (the extras dict)',
     statMiss.length === 0 && rd.rcp_running === true && rd.condensate_pump_running === true &&
     rd.rps_scrammed === false && rd.msiv_open === true && rd.above_p9 === true,
     statMiss.length ? 'undefined: ' + statMiss.slice(0, 6).join(', ')
                     : STAT.length + ' populated, rcp_running/above_p9 true at power');
  /* the deviation gauge measures against PWR2's OWN program line (extras.level_program_fn) —
   * against the old engine's program it read a standing +6.4 % on a settled on-program plant.
   * Asserted as CONSISTENCY (dev == level − PWR2's program at the INDICATED tavg) because it
   * must hold at any fixture time: a near-zero assertion here would sit inside the boot
   * transient (measured: dev −9.5 % at 30 s, −5.9 % at 60 s, then 0.15 % once settled at
   * 900 s — the plant converges to its own program; the early dip is the known settle). */
  var expDev = rd.pzr_level - 100 * globalThis.RD.pwr2.pressurizer.levelProgram(rd.tavg);
  ck('pzr_level_dev measures against PWR2\'s OWN program line, at the INDICATED tavg (HR1)',
     typeof rd.pzr_level_dev === 'number' && Math.abs(rd.pzr_level_dev - expDev) < 0.2,
     'dev ' + rd.pzr_level_dev.toFixed(2) + ' % vs own-program ' + expDev.toFixed(2) + ' %');
  var cs = eng.getControlState();
  ck('getControlState carries EVERY key the diagram reads (16 measured across ui/diagram)',
     cs.rod_groups.length === 2 &&
     cs.rod_groups[0].id === 'control_rods' && cs.rod_groups[1].id === 'shutdown_rods' &&
     typeof cs.rod_groups[0].steps === 'number' && cs.rod_groups[0].max_steps === 200 &&
     typeof cs.rod_groups[0].position_pct === 'number' &&
     typeof cs.pressure_setpoint === 'number' && typeof cs.steam_dump_pct === 'number' &&
     cs.steam_dump_setpoint > 6 && cs.steam_dump_setpoint < 8 &&
     cs.pumps.length === 1 && typeof cs.pumps[0].flow_pct === 'number' &&
     isFinite(cs.pumps[0].flow_pct) &&                       /* the board SPINS on this — a
                                                              * missing field was NaN and froze
                                                              * the RCP impeller (#506.5) */
     typeof cs.letdown_orifice_a === 'boolean' && typeof cs.letdown_orifice_b === 'boolean' &&
     typeof cs.feed_pump_speed_pct === 'number' &&
     typeof cs.cvcs_auto === 'boolean' && typeof cs.heater_auto === 'boolean' &&
     typeof cs.porv_block_open === 'boolean' && typeof cs.spray_valve_pct === 'number' &&
     typeof cs.charging_flow_normalized === 'number' && cs.load_mode !== undefined &&
     typeof cs.accumulator_valve_open === 'boolean' &&
     typeof cs.condensate_pump_running === 'boolean',
     Object.keys(cs).length + ' keys; feed speed tracks the coupled train at ' +
     cs.feed_pump_speed_pct.toFixed(0) + ' %');
  /* TURNED AROUND (stage B3): B2 built this as the courier — hand back
   * RD.PWR_CONFIG.protection itself, D4's reading — and B3 SUPERSEDED it with the measured
   * reason: the pwr config's automation channels issue commands PWR2 REFUSES, each refusal
   * throwing inside the service tick. The check now guards the supersession: the ACTING
   * parts empty (trips/actuations/channels/interlocks/ESF/runbacks are the engine's own),
   * the annunciator shape adopted, the failures menu exactly the injectable levers. */
  var pc = eng.getProtectionConfig();
  /* the alarms row is a COPY with exactly ONE override since #500 (2026-08-22): every row
   * rides through by reference except pzr_level_low, rebuilt at 17 % — 25.0 was this
   * plant's own sourced no-load program point, a standing annunciator on a healthy Mode 3 */
  var baseAlarms = globalThis.RD.PWR_CONFIG.protection.alarms;
  /* TWO overrides since #507 wave 8 (was one, #500): pzr_level_low 25 -> 17 and
   * rod_limit_approach 40 -> 10 (the sourced RIL+10 in this bank's own step currency);
   * every other row must stay shared BY REFERENCE — a third silent divergence reds here. */
  var alarmsOk = Array.isArray(pc.alarms) && pc.alarms.length === baseAlarms.length &&
    pc.alarms.every(function (a, i) {
      return a.id === 'pzr_level_low'
        ? (a.setpoint === 17.0 && baseAlarms[i].id === 'pzr_level_low' && baseAlarms[i].setpoint === 25.0)
        : a.id === 'rod_limit_approach'
        ? (a.setpoint === 10 && baseAlarms[i].id === 'rod_limit_approach' && baseAlarms[i].setpoint === 40)
        : a === baseAlarms[i];
    });
  /* channels carries EXACTLY the boron batch-dose panel since #507 wave 1 — its whole
   * vocabulary (set_boron_adjust {rate}, take_boron_sample, boron_analyzer) is real on this
   * plant now; every other pwr channel stays out (their actuators are internal) */
  ck('getProtectionConfig is PWR2 OWN config: acting parts empty EXCEPT the boron channel',
     pc !== globalThis.RD.PWR_CONFIG.protection &&
     pc.trips.length === 0 && pc.actuations.length === 0 &&
     pc.channels.length === 1 && pc.channels[0].id === 'boron_conc' &&
     pc.channels[0] === globalThis.RD.PWR_CONFIG.protection.channels.filter(function (ch) { return ch.id === 'boron_conc'; })[0] &&
     pc.interlocks.length === 0 && pc.runbacks.length === 0 &&
     alarmsOk &&
     Object.keys(pc.failures).length === 21 &&
     !!pc.failures.stuck_porv_open && !!pc.failures.rcp_trip && !!pc.failures.turbine_trip &&
     !!pc.failures.loss_of_feedwater &&
     /* #507 wave 3 — the rows existing machinery honestly injects */
     !!pc.failures.sg_overfeed && !!pc.failures.loss_of_offsite_power &&
     !!pc.failures.loss_of_condenser_vacuum && !!pc.failures.degraded_hpi &&
     !!pc.failures.large_loca && !!pc.failures.rcp_seal_leak &&
     !!pc.failures.pzr_level_sensor_stuck && !!pc.failures.pzr_level_sensor_low &&
     /* #507 wave 4 — the electrical pair; wave 5 — the tube rupture */
     !!pc.failures.station_blackout && !!pc.failures.sgtr &&
     /* #507 wave 6 — the failure levers + the two unlocked instrument rows */
     !!pc.failures.afw_failure && !!pc.failures.failure_to_scram &&
     !!pc.failures.failed_pzr_heaters && !!pc.failures.stuck_open_spray &&
     !!pc.failures.continuous_rod_withdrawal &&
     !!pc.failures.tavg_sensor_failure && !!pc.failures.porv_indicator_stuck_closed,
     'M4 gets a shape it can hold; pzr_level_low 25 -> 17 (the sourced heater-cutoff level), ' +
     'every other alarm row shared by reference; boron_conc by reference from the pwr table');
  /* THE ONE ESF ENTRY (2026-08-20, the AFAS build). The board's AUX FEED word needs
   * automation.esf.afw === 'auto' to say STANDBY, and the kernel only emits that for a
   * listed system — before this entry the tile read SECURED over an armed AFAS. commands
   * MUST stay empty: a listed command would let the kernel's manual-override scan flip the
   * arm to MANUAL, a state the engine's own AFAS (not defeatable, pwr2_protection SGLL)
   * would immediately make a lie. */
  ck('esf_systems carries exactly the afw arm, and it is UNDISARMABLE (commands empty)',
     pc.esf_systems.length === 1 && pc.esf_systems[0].id === 'afw' &&
     Array.isArray(pc.esf_systems[0].commands) && pc.esf_systems[0].commands.length === 0,
     'the arm is display-true because nothing can flip it');
  /* THE SEAM THE HEADLESS PASS CAUGHT (2026-08-20): the kernel's channel-less fast path in
   * getAutomationState returned {channels: []} WITHOUT the esf dict — a path only PWR2's
   * config (esf_systems, no channels) reaches, so no PWR1 gate could ever see it and the
   * AUX FEED word read SECURED over an armed AFAS. Pinned here at the exact stack seam the
   * shell ships through: the kernel over THIS engine's config. */
  /* With the boron channel present (#507 wave 1) the kernel takes its FULL path, not the
   * channel-less fast path this check was written against — the esf dict must survive the
   * route change (the 2026-08-20 defect was esf missing on ONE of the two paths). */
  ck('the kernel emits automation.esf.afw = \'auto\' over PWR2\'s config (full path, 1 channel)',
     (function () {
       var lay = new globalThis.RD.ControlLayer(eng, eng.getProtectionConfig());
       var a = lay.getAutomationState();
       return a && a.esf && a.esf.afw === 'auto' && a.channels.length === 1 &&
              a.channels[0].id === 'boron_conc';
     })(),
     'the board\'s STANDBY word reads this dict, nothing else');
  ck('getStartupLineup/getActiveFailures exist and answer',
     Array.isArray(eng.getStartupLineup()) && Array.isArray(eng.getActiveFailures()) &&
     eng.getActiveFailures().length === 0, '');

  /* ---- 1b. TWO REAL BANKS (#506.3) ----------------------------------------------------------
   * The shutdown group used to be a fabrication: `scrammed ? 0 : 200`, a one-frame snap
   * beside the control bank's ramp — the owner's "shutdown rods moved too fast on scram",
   * verbatim. Both banks are the engine's now, each with its own ramp (control 2.5 s,
   * shutdown 2.0 s) and its own group-routed drive. Sampled MID-RAMP, where the snap and
   * the ramp disagree most. */
  (function () {
    var e2 = new SH.PWR2Engine({});
    for (var i = 0; i < 100; i++) e2.step(0.02);            /* 2 s of settle */
    e2.applyCommand({ action: 'scram' });
    for (i = 0; i < 50; i++) e2.step(0.02);                 /* 1.0 s into the ramps */
    var g = e2.getControlState().rod_groups;
    ck('mid-scram, BOTH banks are ramping — shutdown ahead of control, neither snapped',
       g[0].steps > 80 && g[0].steps < 140 &&               /* 2.5 s ramp: ~120 at t+1.0 */
       g[1].steps > 60 && g[1].steps < 120 &&               /* 2.0 s ramp: ~100 at t+1.0 */
       g[1].steps < g[0].steps,
       'control ' + g[0].steps + ', shutdown ' + g[1].steps + ' at t+1.0 s (snap read 0)');
    for (i = 0; i < 150; i++) e2.step(0.02);
    var g2 = e2.getControlState().rod_groups;
    ck('...and both reach 0', g2[0].steps === 0 && g2[1].steps === 0,
       g2[0].steps + '/' + g2[1].steps);
    /* the shutdown drive is GROUP-ROUTED: before #506 group_id was dropped and this command
     * drove the CONTROL bank (the board's shutdown Withdraw silently moved the wrong bank) */
    var e3 = new SH.PWR2Engine({});
    for (i = 0; i < 50; i++) e3.step(0.02);
    e3.applyCommand({ action: 'rod_nudge', group_id: 'shutdown_rods', steps: -5 });
    for (i = 0; i < 500; i++) e3.step(0.02);
    var g3 = e3.getControlState().rod_groups;
    ck('a shutdown-group nudge moves the SHUTDOWN bank and leaves the control bank alone',
       g3[1].steps < 200 && g3[0].steps === 200,
       'control ' + g3[0].steps + ', shutdown ' + g3[1].steps);
  })();

  /* ---- 1c. THE RHR ALIGN REFUSALS (#507 wave 2, the #458 ruled shape) -----------------------
   * A refusal, NOT an interlock *(OWNER RULING, 2026-08-12: "A'")*: the message says
   * "lineup", ISOLATE is never refused, and the SI case carries the ruled industry text.
   * Both surfaced to the player by the #505 click path. */
  (function () {
    var e4 = new SH.PWR2Engine({});
    for (var i = 0; i < 100; i++) e4.step(0.02);
    var msgP = null, msgSI = null, isoOk = false;
    try { e4.applyCommand({ action: 'set_rhr', active: true }); }
    catch (ep) { msgP = String(ep.message); }
    e4.eng.ec.hhsiRunning = true;
    try { e4.applyCommand({ action: 'set_rhr', active: true }); }
    catch (es) { msgSI = String(es.message); }
    e4.eng.ec.hhsiRunning = false;
    try { e4.applyCommand({ action: 'set_rhr', active: false }); isoOk = true; } catch (ei) {}
    ck('ALIGN refuses at power (permissive) and under SI (the ruled lineup message); ISOLATE never',
       msgP !== null && /425 psig/.test(msgP) &&
       msgSI !== null && /ECCS injection lineup/.test(msgSI) && !/interlock/i.test(msgSI) &&
       isoOk,
       'power: "' + (msgP || '').slice(0, 40) + '…"; SI: "' + (msgSI || '').slice(0, 40) + '…"');
  })();

  /* ---- 1d. THE CASUALTY ROWS (#507 wave 3) --------------------------------------------------
   * Every new menu row injected against the live shell, each with its OBSERVABLE effect —
   * a menu entry for a lever that does nothing would be a lie wearing a casualty's name.
   * The instrument rows are the two-layer claim: the failure must land on the BOARD's
   * reused layer (this.instruments) as well as the internal RPS channels — measured before
   * the mirror, an injected failure was invisible on the board. */
  (function () {
    var e5 = new SH.PWR2Engine({});
    for (var i = 0; i < 100; i++) e5.step(0.02);
    e5.applyCommand({ action: 'inject_failure', failure_id: 'pzr_level_sensor_low' });
    e5.step(0.02); e5.step(0.02);
    var boardStuck = e5.instruments.reading.pzr_level === 20 &&
                     Math.abs(e5.eng.ins.reading.pzr_level - 20) < 0.5 &&
                     e5.getTrueState().pzr_level_pct > 40;
    e5.applyCommand({ action: 'clear_failure', failure_id: 'pzr_level_sensor_low' });
    for (i = 0; i < 5; i++) e5.step(0.02);
    var healed = Math.abs(e5.instruments.reading.pzr_level - e5.getTrueState().pzr_level_pct) < 5;
    ck('pzr_level_sensor_low sticks BOTH instrument layers at 20 % over healthy truth, and clears',
       boardStuck && healed,
       'board ' + e5.instruments.reading.pzr_level.toFixed(1) + ' after clear; the pre-mirror defect ' +
       'was a board that never saw the failure');
    e5.applyCommand({ action: 'inject_failure', failure_id: 'degraded_hpi', severity: 0.5 });
    e5.applyCommand({ action: 'inject_failure', failure_id: 'loss_of_condenser_vacuum' });
    e5.applyCommand({ action: 'inject_failure', failure_id: 'rcp_seal_leak' });
    var d0 = e5.eng.brk.discharged_kg;
    for (i = 0; i < 500; i++) e5.step(0.02);
    var leakRate = (e5.eng.brk.discharged_kg - d0) / 10;
    var act = e5.getActiveFailures();
    /* wave 6 (#507): degraded_hpi writes hhsiAvail — the seat the PHYSICS reads. Wave 3
     * wrote ec.avail, which stepECCS never consults, so the row was INERT on flow through
     * two green gate runs; the flow itself is now the assertion (at a pressure below the
     * shutoff head, half availability must deliver half the flow). */
    ck('degraded_hpi halves the SI FLOW the physics delivers, vacuum row secures CW, the ' +
       'seal leak is HOLDABLE — all reported',
       e5.eng.ec.hhsiAvail === 0.5 && e5.eng.cwPumps === false &&
       (function () {
         var full = globalThis.RD.pwr2.eccs.stepECCS(
           { hhsiRunning: true, lhsiRunning: false, hhsiAvail: 1, lhsiAvail: 1, injected_kg: 0 },
           { P: 5.0, nodes: e5.eng.sys.nodes }, 0).hhsi_kgs;
         var half = globalThis.RD.pwr2.eccs.stepECCS(
           { hhsiRunning: true, lhsiRunning: false, hhsiAvail: e5.eng.ec.hhsiAvail,
             lhsiAvail: 1, injected_kg: 0 },
           { P: 5.0, nodes: e5.eng.sys.nodes }, 0).hhsi_kgs;
         return full > 0 && Math.abs(half / full - 0.5) < 1e-9;
       })() &&
       leakRate > 0.5 && leakRate < 1.85 &&
       act.indexOf('degraded_hpi') !== -1 && act.indexOf('loss_of_condenser_vacuum') !== -1 &&
       act.indexOf('rcp_seal_leak') !== -1,
       'leak ' + leakRate.toFixed(2) + ' kg/s vs 1.85 max charging; active [' + act.join(',') + ']');
  })();

  /* ---- 1e. THE ELECTRICAL PAIR (#507 wave 4) ------------------------------------------------ */
  head('THE ELECTRICAL PAIR  [LOOP kills the nonvital bus and clears; SBO kills the vital one too]');
  (function () {
    var e6 = new SH.PWR2Engine({});
    for (var i = 0; i < 100; i++) e6.step(0.02);
    e6.applyCommand({ action: 'inject_failure', failure_id: 'loss_of_offsite_power' });
    /* 30 s: the feed module's 8 s pump lag must decay (measured 0.535 of rated at 5 s) */
    for (i = 0; i < 1500; i++) e6.step(0.02);
    var ts6 = e6.getTrueState(), act6 = e6.getActiveFailures();
    var loopOk = ts6.ac_available === true && ts6.station_blackout === false &&
                 e6.eng.sys.pumpTripped === true &&
                 e6.eng.fw.pumpA === true && e6.eng.fw.feed_frac < 0.05 &&
                 e6.eng._cdAvail === false &&
                 e6.eng.pt.afas_tdafw === true &&
                 act6.indexOf('loss_of_offsite_power') !== -1;
    ck('a LOOP: RCP tripped, feed dead with its selectors ON, condenser lost, AFW started, ' +
       'vital bus still up — and the row reports active',
       loopOk, 'ac ' + ts6.ac_available + ', feed ' + e6.eng.fw.feed_frac.toFixed(3) +
       ' (pumpA ' + e6.eng.fw.pumpA + '), afas_td cause ' + e6.eng.pt.afas_tdafw_cause);
    ck('...and the heaters SHED on the LOOP (NUREG-0737 latch), with the vital bus alive',
       e6.eng.pz.heatersShed === true && e6.eng.pz.shedLatch === true, '');
    e6.applyCommand({ action: 'clear_failure', failure_id: 'loss_of_offsite_power' });
    for (i = 0; i < 100; i++) e6.step(0.02);
    var cleared = e6.getActiveFailures().indexOf('loss_of_offsite_power') === -1 &&
                  e6.eng._cdAvail === true && e6.eng.sys.pumpTripped === true &&
                  e6.eng.pz.heatersShed === true;
    ck('the clear is the GRID: condenser back, RCPs stay tripped, the shed stays latched ' +
       'until the operator touches the heater control',
       cleared, '');
    e6.applyCommand({ action: 'set_heater', auto: true });
    e6.step(0.02);
    ck('...and the heater command IS the re-load (the old set_heater convention)',
       e6.eng.pz.shedLatch === false, '');

    var e7 = new SH.PWR2Engine({});
    for (i = 0; i < 100; i++) e7.step(0.02);
    e7.applyCommand({ action: 'inject_failure', failure_id: 'station_blackout' });
    for (i = 0; i < 1500; i++) e7.step(0.02);
    var ts7 = e7.getTrueState(), act7 = e7.getActiveFailures();
    var awr7 = globalThis.RD.pwr2.afw.stepAFW(e7.eng.aw, 0, { mdafw_power_ok: false });
    ck('an SBO: ac_available false on the contract, heaters DEAD, the demanded MDAFW delivers ' +
       'nothing while the steam-driven TDAFW carries the plant (WTSM 5.7.5)',
       ts7.ac_available === false && ts7.station_blackout === true &&
       (e7.eng._pzr.heater_kW || 0) === 0 &&
       e7.eng.aw.mdafwRunning === true && awr7.mdafw_kgs === 0 && awr7.tdafw_kgs > 3 &&
       act7.indexOf('station_blackout') !== -1,
       'td ' + awr7.tdafw_kgs.toFixed(2) + ' kg/s; active [' + act7.join(',') + ']');
    e7.applyCommand({ action: 'clear_failure', failure_id: 'station_blackout' });
    e7.step(0.02); var ts7b = e7.getTrueState();
    ck('clearing the SBO restores both buses on the contract (pumps stay where physics left them)',
       ts7b.ac_available === true && ts7b.station_blackout === false &&
       e7.eng.sys.pumpTripped === true, '');
  })();

  /* ---- 1f. THE SGTR ROW (#507 wave 5) -------------------------------------------------------- */
  head('THE SGTR ROW  [a break at the tube node, routed into the SG, reported by name]');
  (function () {
    var e8 = new SH.PWR2Engine({});
    for (var i = 0; i < 100; i++) e8.step(0.02);
    e8.applyCommand({ action: 'inject_failure', failure_id: 'sgtr' });
    for (i = 0; i < 250; i++) e8.step(0.02);
    var actT = e8.getActiveFailures();
    ck('the sgtr row opens the tube-node break at the default 40 % severity and reports ' +
       'as ITSELF (not primary_leak), with the SG receiving the stream',
       e8.eng.brk && e8.eng.brk.node === 'sg_primary' &&
       Math.abs(e8.eng.brk.area_m2 - 0.4 * 4.33e-4) < 1e-9 &&
       e8.eng._sgtrKgs > 10 && actT.indexOf('sgtr') !== -1 &&
       actT.indexOf('primary_leak') === -1,
       'leak ' + e8.eng._sgtrKgs.toFixed(1) + ' kg/s; active [' + actT.join(',') + ']');
    e8.applyCommand({ action: 'clear_failure', failure_id: 'sgtr' });
    e8.step(0.02); e8.step(0.02);
    ck('...and the clear shuts the tube', e8.eng.brk.open === false && e8.eng._sgtrKgs === 0, '');
  })();

  /* ---- 1g. THE WAVE-6 ROWS (#507) — each lever with its measured, observable effect ---------- */
  head('THE WAVE-6 ROWS  [failure levers: block, ATWS, dead bank, stuck spray, runaway, drift]');
  (function () {
    /* afw_failure — the TMI-2 tagged-shut valves */
    var eA = new SH.PWR2Engine({});
    for (var i = 0; i < 100; i++) eA.step(0.02);
    eA.applyCommand({ action: 'set_afw', running: true });
    for (i = 0; i < 100; i++) eA.step(0.02);
    eA.applyCommand({ action: 'inject_failure', failure_id: 'afw_failure' });
    for (i = 0; i < 100; i++) eA.step(0.02);
    var tsA = eA.getTrueState();
    ck('afw_failure: the pumps stay RUNNING, delivery dies, afw_blocked reads true — the ' +
       'TMI-2 shape on the contract',
       tsA.afw_pump_running === true && tsA.afw_active === false && tsA.afw_blocked === true &&
       eA.getActiveFailures().indexOf('afw_failure') !== -1, '');
    eA.applyCommand({ action: 'clear_failure', failure_id: 'afw_failure' });
    for (i = 0; i < 100; i++) eA.step(0.02);
    ck('...and clearing the tags restores delivery at the standing demand',
       eA.getTrueState().afw_active === true, '');

    /* failure_to_scram — the latch stands, the rods do not move, the plant self-limits */
    var eS = new SH.PWR2Engine({});
    for (i = 0; i < 100; i++) eS.step(0.02);
    eS.applyCommand({ action: 'inject_failure', failure_id: 'failure_to_scram' });
    eS.applyCommand({ action: 'scram' });
    for (i = 0; i < 500; i++) eS.step(0.02);
    var tsS = eS.getTrueState();
    ck('failure_to_scram: the trip LATCHES (turbine trips with it) while the rods stand at ' +
       '200 and the core keeps running — measured 76 % at 10 s, feedback-limited, unscripted',
       eS.eng.pt.reactor_trip === true && eS.eng.rodSteps === 200 &&
       eS.eng.tb.tripped === true && tsS.power_pct > 50 &&
       eS.getActiveFailures().indexOf('failure_to_scram') !== -1,
       'power ' + tsS.power_pct.toFixed(1) + ' % with the trip annunciated — the ATWS');

    /* failed_pzr_heaters — dead elements under a standing demand */
    var eH = new SH.PWR2Engine({});
    for (i = 0; i < 100; i++) eH.step(0.02);
    var kw0 = eH.eng._pzr.heater_kW;
    eH.applyCommand({ action: 'inject_failure', failure_id: 'failed_pzr_heaters' });
    for (i = 0; i < 10; i++) eH.step(0.02);
    ck('failed_pzr_heaters: the bank goes from real watts to 0 with nothing shed and the ' +
       'demand standing (measured −31.5 psi over 300 s unattended)',
       kw0 > 10 && eH.eng._pzr.heater_kW === 0 && eH.eng.pz.heatersShed === false &&
       eH.getActiveFailures().indexOf('failed_pzr_heaters') !== -1,
       kw0.toFixed(0) + ' kW -> 0');

    /* stuck_open_spray — the porv_stick twin; the plant depressurizes against its heaters */
    var eP = new SH.PWR2Engine({});
    for (i = 0; i < 100; i++) eP.step(0.02);
    var pP0 = eP.getTrueState().pressure_mpa;
    eP.applyCommand({ action: 'inject_failure', failure_id: 'stuck_open_spray' });
    for (i = 0; i < 6000; i++) eP.step(0.02);
    var tsP = eP.getTrueState();
    ck('stuck_open_spray: full spray against the demand, spray_stuck on the contract, and ' +
       'the plant loses >100 psi in 120 s with the heaters fighting (measured 247 psi)',
       eP.eng._pzr.spray_frac === 1 && tsP.spray_stuck === true &&
       (pP0 - tsP.pressure_mpa) * 145.038 > 100 &&
       eP.getActiveFailures().indexOf('stuck_open_spray') !== -1,
       ((pP0 - tsP.pressure_mpa) * 145.038).toFixed(0) + ' psi down');
    eP.applyCommand({ action: 'clear_failure', failure_id: 'stuck_open_spray' });
    for (i = 0; i < 50; i++) eP.step(0.02);
    ck('...and the cleared valve obeys its controller again', eP.eng._pzr.spray_frac < 1, '');

    /* continuous_rod_withdrawal — needs inserted rods (the shipped IC parks the bank at
     * 200/200, declared); the drive faults outward and the rod levers are REFUSED */
    var eR = new SH.PWR2Engine({});
    for (i = 0; i < 100; i++) eR.step(0.02);
    eR.applyCommand({ action: 'set_load_target', mwe: 60 });
    for (i = 0; i < 6000; i++) eR.step(0.02);
    eR.applyCommand({ action: 'rod_nudge', steps: -25 });
    for (i = 0; i < 3000; i++) eR.step(0.02);
    var st0 = eR.eng.rodSteps, pw0 = eR.getTrueState().power_pct;
    eR.applyCommand({ action: 'inject_failure', failure_id: 'continuous_rod_withdrawal' });
    for (i = 0; i < 500; i++) eR.step(0.02);
    var thrR = false;
    try { eR.applyCommand({ action: 'rod_nudge', steps: -10 }); } catch (e2) { thrR = /REFUSED/.test(e2.message); }
    ck('continuous_rod_withdrawal: the bank drives OUT at the adopted fraction-of-travel ' +
       'rate, power rises, and the rod levers are REFUSED out loud (measured 175->200, ' +
       '78.1->83.7 %)',
       eR.eng.rodSteps > st0 + 10 && eR.getTrueState().power_pct > pw0 + 1 && thrR === true &&
       eR.getActiveFailures().indexOf('continuous_rod_withdrawal') !== -1,
       st0.toFixed(0) + ' -> ' + eR.eng.rodSteps.toFixed(1) + ' steps');
    eR.applyCommand({ action: 'clear_failure', failure_id: 'continuous_rod_withdrawal' });
    var stC = eR.eng.rodSteps;
    for (i = 0; i < 100; i++) eR.step(0.02);
    ck('...and the clear HOLDS position (the latched demand followed the fault — no snap-back)',
       Math.abs(eR.eng.rodSteps - stC) < 0.5 && eR.eng.runaway === null, '');

    /* tavg_sensor_failure — the drift lands on BOTH layers and mis-programs the dumps */
    var eD = new SH.PWR2Engine({});
    for (i = 0; i < 100; i++) eD.step(0.02);
    eD.applyCommand({ action: 'inject_failure', failure_id: 'tavg_sensor_failure' });
    for (i = 0; i < 1500; i++) eD.step(0.02);
    var tsD = eD.getTrueState();
    var offI = eD.eng.ins.reading.tavg - tsD.tavg_c, offS = eD.instruments.reading.tavg - tsD.tavg_c;
    ck('tavg_sensor_failure: BOTH layers drift off truth together at the adopted 0.5/s — ' +
       'and the lying channel drags the TRUE plant down through the dump controller ' +
       '(measured −25 degC of real overcooling in 60 s)',
       offI > 10 && offS > 10 && Math.abs(offI - offS) < 3 && tsD.tavg_c < 300,
       'internal +' + offI.toFixed(1) + ', board +' + offS.toFixed(1) + ' over a true ' +
       tsD.tavg_c.toFixed(1) + ' degC');

    /* porv_indicator_stuck_closed — the mirror-only channel: board-layer only, no throw */
    var eL = new SH.PWR2Engine({});
    for (i = 0; i < 100; i++) eL.step(0.02);
    eL.applyCommand({ action: 'inject_failure', failure_id: 'porv_indicator_stuck_closed' });
    for (i = 0; i < 10; i++) eL.step(0.02);
    var lampOk = eL.instruments.reading.porv_indicator === 'closed' &&
                 !!eL.instruments.failed.porv_indicator &&
                 eL.getActiveFailures().indexOf('instrument:porv_indicator') !== -1;
    eL.applyCommand({ action: 'clear_failure', failure_id: 'porv_indicator_stuck_closed' });
    eL.step(0.02);
    ck('porv_indicator_stuck_closed rides the BOARD layer alone (the internal numeric table ' +
       'cannot host a string lamp — mirror-only, declared), reports active, and clears ' +
       'without a throw',
       lampOk && !eL.instruments.failed.porv_indicator &&
       eL.getActiveFailures().indexOf('instrument:porv_indicator') === -1,
       'the TMI-2 lamp: stuck at "closed" whatever the valve does');

    /* the advanced panel's `value` key (latent fix 3) and the seal-leak slider (fix 2) */
    var eV = new SH.PWR2Engine({});
    for (i = 0; i < 100; i++) eV.step(0.02);
    eV.applyCommand({ action: 'set_instrument_failure', instrument_id: 'tavg', mode: 'stuck',
                      value: 250 });
    eV.step(0.02);
    ck('a typed freeze-at value arrives under the advanced panel\'s `value` key on BOTH ' +
       'layers (it was silently dropped — every panel freeze landed at the current reading)',
       eV.eng.ins.reading.tavg === 250 && eV.instruments.reading.tavg === 250, '');
    var eW = new SH.PWR2Engine({});
    eW.applyCommand({ action: 'inject_failure', failure_id: 'rcp_seal_leak', severity: 0.25 });
    var a25 = eW.eng.brk.area_m2;
    eW.applyCommand({ action: 'inject_failure', failure_id: 'rcp_seal_leak', severity: 1.0 });
    ck('the seal-leak slider is HONORED — linear in area, sev 1.0 at the edge of charging ' +
       '(measured 0.45 / 1.21 / 1.81 kg/s at sev 0.25 / 0.67 / 1.0 vs 1.85 max charging)',
       Math.abs(a25 - 0.25 * 1.2e-5) < 1e-12 &&
       Math.abs(eW.eng.brk.area_m2 - 1.2e-5) < 1e-12,
       'wave 3 rendered the slider and discarded it');
  })();

  /* ---- 1h. THE INITIAL CONDITIONS THROUGH THE CLASS (#507 §F, wave 7) ----------------------- */
  head('THE ICs THROUGH THE CLASS  [the menu\'s presets are real; the block button reaches the RPS]');
  (function () {
    var e9 = new SH.PWR2Engine({ initial_state: '50_percent' });
    var ts9 = null;
    for (var i = 0; i < 1500; i++) ts9 = e9.step(0.02);
    ck('initial_state rides the service\'s own constructor path: the 50 % preset opens and ' +
       'holds through the class (measured 49.2 % / 50.0 MWe at 30 s)',
       ts9.power_pct > 48 && ts9.power_pct < 51 && Math.abs(ts9.mwe_output - 50) < 1.5,
       ts9.power_pct.toFixed(1) + ' % / ' + ts9.mwe_output.toFixed(1) + ' MWe');
    var thrIC = false;
    try { new SH.PWR2Engine({ initial_state: 'cold_shutdown' }); }
    catch (e2) { thrIC = /unknown initial_state/.test(e2.message); }
    ck('a preset the engine does not carry throws through the class too — the #502 rule ' +
       '(an accepted-then-ignored preset is a menu that lies)', thrIC === true, '');

    /* the block button's whole path: board -> kernel (empty trips -> FORWARD) -> shell ->
     * engine request; the kernel snapshot carries the ENGINE's own 35 % setpoint */
    var eB = new SH.PWR2Engine({ initial_state: 'hot_zero_power' });
    var kl = new (globalThis.RD.ControlLayer)(eB, eB.getProtectionConfig());
    for (i = 0; i < 100; i++) eB.step(0.02);
    var rps0 = kl.getRpsState();
    ck('the kernel\'s rps snapshot MERGES the engine-owned block surface: pr_low_setpoint ' +
       'present, unblocked, with the engine\'s own 35 % setpoint (not the static table\'s 25)',
       rps0.trip_blocks.pr_low_setpoint === false &&
       rps0.trip_block_status.pr_low_setpoint &&
       rps0.trip_block_status.pr_low_setpoint.setpoint === 35 &&
       rps0.trip_block_status.pr_low_setpoint.can_block === false,
       'can_block false at source level — P-10 gates it');
    var rF = kl.handleCommand({ action: 'set_trip_block', trip_id: 'pr_low_setpoint', blocked: true });
    var reqNow = eB.eng.pt.blockLowFlux;
    eB.step(0.02);
    ck('the kernel FORWARDS set_trip_block to the engine (empty trips list — the request ' +
       'lands) and P-10 revokes it below 8 % on the next step (the sourced asymmetric gate)',
       rF === null && reqNow === true && eB.eng.pt.blockLowFlux === false, '');
    var rIr = kl.handleCommand({ action: 'set_trip_block', trip_id: 'ir_high', blocked: true });
    ck('...and a trip this RPS does not carry comes back as a REASONED error, not a silence',
       rIr && rIr.type === 'error' && /low-flux/.test(rIr.message), '');
  })();

  /* ---- 1i. THE ROD INSERTION LIMIT SURFACES (#507 §B, wave 8) ------------------------------- */
  head('THE ROD LIMIT SURFACES  [live control-state fields, the margin channel, the 10-step row]');
  (function () {
    var eR = new SH.PWR2Engine({});
    for (var i = 0; i < 200; i++) eR.step(0.02);
    var gs = eR.getControlState().rod_groups;
    ck('the control group carries the LIVE limit (~139 steps, not at limit) and the ' +
       'shutdown group stays exempt (its evolutions are deliberate)',
       gs[0].insertion_limit_steps >= 137 && gs[0].insertion_limit_steps <= 141 &&
       gs[0].at_insertion_limit === false &&
       gs[1].insertion_limit_steps === null && gs[1].at_insertion_limit === false,
       'RIL ' + gs[0].insertion_limit_steps);
    ck('the board layer\'s rod_limit_margin channel tracks the engine (was pinned at its ' +
       '912 default)',
       Math.abs(eR.instruments.reading.rod_limit_margin - eR.eng._rodLimitMargin) < 1e-9 &&
       eR.instruments.reading.rod_limit_margin < 100,
       'margin ' + eR.instruments.reading.rod_limit_margin);
    var rowLO = (eR.getProtectionConfig().alarms || []).filter(function (a) {
      return a.id === 'rod_limit_approach';
    })[0];
    ck('ROD LIMIT LO alarms at the sourced RIL+10 in THIS bank\'s own steps — the shared ' +
       'row\'s 40 is the same physical number in pwr1\'s fine-step currency (4 fine/step)',
       rowLO && rowLO.setpoint === 10, 'setpoint ' + (rowLO && rowLO.setpoint));
  })();

  /* ---- 1j. THE RCP HANDSWITCH (#507 wave 9) -------------------------------------------------- */
  head('THE RCP HANDSWITCH  [OFF secures, ON restarts, a casualty trip reads LOST not SECURED]');
  (function () {
    var eC = new SH.PWR2Engine({});
    for (var i = 0; i < 100; i++) eC.step(0.02);
    eC.applyCommand({ action: 'set_rcp', running: false });
    for (i = 0; i < 10; i++) eC.step(0.02);
    ck('OFF trips the pump AND latches the SECURED word — the operator stopped it',
       eC.eng.sys.pumpTripped === true && eC.instruments.reading.rcp_secured === true, '');
    eC.applyCommand({ action: 'set_rcp', running: true });
    for (i = 0; i < 750; i++) eC.step(0.02);
    ck('ON is a REAL restart: the motor brings flow back (measured >90 % in ~10 s from ' +
       'rest) and the secured word clears',
       eC.eng.sys.pumpTripped === false && eC.getTrueState().pump_flow_pct > 80 &&
       eC.instruments.reading.rcp_secured === false,
       'flow ' + eC.getTrueState().pump_flow_pct.toFixed(0) + ' %');
    var eD = new SH.PWR2Engine({});
    for (i = 0; i < 100; i++) eD.step(0.02);
    eD.applyCommand({ action: 'inject_failure', failure_id: 'rcp_trip' });
    for (i = 0; i < 10; i++) eD.step(0.02);
    ck('a CASUALTY trip reads LOST, never SECURED — the handswitch tells the truth about ' +
       'who stopped the pump',
       eD.eng.sys.pumpTripped === true && eD.instruments.reading.rcp_secured === false, '');
  })();

  /* ---- 1k. THE SHUTDOWN PRESET THROUGH THE CLASS (#507 wave 10) ----------------------------- */
  head('MODE 4 THROUGH THE CLASS  [held, blocked, secured; the P-11 pair on the kernel snapshot]');
  (function () {
    var eE = new SH.PWR2Engine({ initial_state: 'hot_shutdown' });
    var kE = new (globalThis.RD.ControlLayer)(eE, eE.getProtectionConfig());
    for (var i = 0; i < 250; i++) eE.step(0.02);
    var tsE = eE.getTrueState();
    var rpsE = kE.getRpsState();
    ck('the Mode 4 preset opens held through the class — no trip, no SI, the pumps read ' +
       'SECURED (the cooldown stopped them), and the kernel snapshot carries BOTH cooldown ' +
       'blocks with can_clear',
       tsE.plant_mode === 4 && /Hot Shutdown/.test(tsE.plant_mode_name) &&
       tsE.scrammed === false && eE.eng.pt.si === false &&
       eE.instruments.reading.rcp_secured === true &&
       rpsE.trip_blocks.lo_press === true && rpsE.trip_blocks.si_trip === true &&
       rpsE.trip_block_status.si_trip.can_clear === true,
       'mode ' + tsE.plant_mode + ', blocks ' + JSON.stringify(rpsE.trip_blocks));
    var rSiB = kE.handleCommand({ action: 'set_trip_block', trip_id: 'si_trip', blocked: false });
    eE.step(0.02);
    var cleared = eE.eng.pt.blockSI === false;
    kE.handleCommand({ action: 'set_trip_block', trip_id: 'si_trip', blocked: true });
    eE.step(0.02);
    ck('the P-11 pair round-trips through the kernel forward: un-block clears the engine ' +
       'request, re-block below P-11 lands',
       (rSiB === null || rSiB === undefined) && cleared && eE.eng.pt.blockSI === true, '');
  })();

  /* ---- 2. THE COMMAND PARTITION -------------------------------------------------------------- */
  head('THE PARTITION  [every old-engine action in exactly one registry, refusals reasoned]');
  var oldSrc = fs.readFileSync(path.join(__dirname, '..', 'engines', 'pwr', 'pwr_engine.js'), 'utf8');
  var actions = {}, m, re = /case '([a-z_0-9]+)'/g;
  while ((m = re.exec(oldSrc)) !== null) actions[m[1]] = true;
  var names = Object.keys(actions);
  var unhomed = names.filter(function (a) {
    return !SH.MAPPED[a] && !SH.REHOMED[a] && SH.REFUSED[a] === undefined;
  });
  ck('every action in the CURRENT engine\'s own switch is in exactly one registry (' +
     names.length + ' actions)', unhomed.length === 0,
     unhomed.length ? 'UNHOMED: ' + unhomed.join(', ') : '');
  var doubled = names.filter(function (a) {
    var n = (SH.MAPPED[a] ? 1 : 0) + (SH.REHOMED[a] ? 1 : 0) + (SH.REFUSED[a] !== undefined ? 1 : 0);
    return n > 1;
  });
  ck('...and in only one', doubled.length === 0, doubled.join(', '));
  var thin = Object.keys(SH.REFUSED).filter(function (a) { return SH.REFUSED[a].length < 20; });
  ck('every refusal carries a real reason', thin.length === 0, thin.join(', '));
  var threw = false;
  try { eng.applyCommand({ action: 'set_containment_spray', enabled: true }); }
  catch (e) { threw = /REFUSED/.test(e.message) && /unmodeled/.test(e.message); }
  ck('a REFUSED command THROWS with its reason — never a silent swallow', threw === true, '');
  var threwU = false;
  try { eng.applyCommand({ action: 'no_such_action' }); } catch (e) { threwU = /unknown/.test(e.message); }
  ck('an unknown action throws too', threwU === true, '');

  /* ---- 3. COMMANDS LAND THROUGH THE CLASS ---------------------------------------------------- */
  head('COMMANDS LAND  [the class is a real door, not a shape]');
  eng.applyCommand({ action: 'set_load_target', mwe: 80 });
  var t80 = run(eng, quiet ? 40 : 60);
  ck('set_load_target moves the plant', Math.abs(t80.mwe_output - 80) < 2,
     t80.mwe_output.toFixed(1) + ' MWe');
  /* THE FEED LEVERS (2026-08-21) — refusals retired; the wire proven with one round trip.
   * pct 50 = 0.5 of rated through the old payload shape; re-coupled after so the rest of
   * the suite inherits the AUTO lineup it states. */
  eng.applyCommand({ action: 'set_feed_pump_speed', pct: 50 });
  var tFd = run(eng, 20);
  ck('set_feed_pump_speed lands: manual 50 % delivers ~0.5 and leaves auto',
     eng.eng.fw.auto === false && Math.abs(eng.eng.fw.feed_frac - 0.5) < 0.05,
     'delivered ' + eng.eng.fw.feed_frac.toFixed(3) + ', auto ' + eng.eng.fw.auto);
  eng.applyCommand({ action: 'set_feed_coupled', active: true });
  run(eng, quiet ? 20 : 40);
  ck('set_feed_coupled restores the three-element controller',
     eng.eng.fw.auto === true, '');
  /* THE #408 CURRENCY (2026-08-21) — the CVCS balance-point finding. The shipped B1/B2 forms
   * published kg/s into charging_flow_actual (read as ~343,000 gpm; the CHG FLOW HI
   * annunciator at 8.0e-5 = 36 gpm stood permanently — the finish list's "120 gpm balance")
   * and read the board setter's gpm/450,000 as a 0..1 demand (any dialed setpoint became
   * ~zero flow). The plant physics was RIGHT all along: the settled balance is the
   * sourced-scaled charging 7.5 + seal 5 = letdown 12.5 gpm. */
  var rdC = eng.getInstruments();
  ck('the CHG FLOW HI annunciator input is CLEAR — a healthy plant cannot reach 36 gpm',
     typeof rdC.charging_flow === 'number' && rdC.charging_flow < 8.0e-5 &&
     rdC.charging_flow > 0,
     'charging_flow ' + (rdC.charging_flow * 450000).toFixed(1) +
     ' gpm against the 36 gpm setpoint (max charging is the sourced-scaled 29.4)');
  eng.applyCommand({ action: 'set_charging_flow', normalized: 20 / 450000 });
  var tCur = run(eng, 30);
  ck('the board charging setter ROUND-TRIPS the currency: 20 gpm dialed = 20 gpm delivered',
     Math.abs(tCur.charging_flow_actual * 450000 - 20) < 1.0 &&
     Math.abs(eng.getControlState().charging_flow_normalized * 450000 - 20) < 1.0,
     'delivered ' + (tCur.charging_flow_actual * 450000).toFixed(1) + ' gpm, setpoint reads ' +
     (eng.getControlState().charging_flow_normalized * 450000).toFixed(1));
  eng.applyCommand({ action: 'set_cvcs_auto', enabled: true });
  run(eng, quiet ? 10 : 20);
  ck('...and the reused gauges FOLLOW the maneuver (a frozen t=0 gauge reads the old point)',
     Math.abs(eng.getInstruments().tavg - t80.tavg_c) < 2.0,
     'ind ' + eng.getInstruments().tavg.toFixed(2) + ' vs true ' + t80.tavg_c.toFixed(2) +
     ' degC after the load change moved Tavg');
  eng.applyCommand({ action: 'set_instrument_failure', instrument: 'primary_pressure', mode: 'fail_low' });
  var tF = run(eng, 10);
  ck('an instrument failure through the CLASS reaches the internal RPS — the lying channel trips',
     tF.scrammed === true && eng.eng.pt.trip_cause === 'lo_pzr_press',
     'cause ' + eng.eng.pt.trip_cause + ' — the HR1 chain end to end through applyCommand');
  ck('...and getActiveFailures reports it', eng.getActiveFailures().length > 0,
     eng.getActiveFailures().join(', '));
  eng.applyCommand({ action: 'clear_all_failures' });
  ck('clear_all_failures clears the ledger', eng.getActiveFailures().length === 0, '');
  eng.reset();
  var tR = eng.getTrueState();
  ck('reset() is a fresh plant', tR.scrammed === false && tR.sim_time_s < 1,
     't = ' + tR.sim_time_s.toFixed(2) + ' s, scrammed ' + tR.scrammed);

  /* ---- 4. THE SAVE CONTRACT ------------------------------------------------------------------ */
  head('THE SAVE  [pwr2-1.0 only, and the round trip is BIT-EXACT]');
  var eng2 = new SH.PWR2Engine({});
  /* the save fixture settles 700 s — MEASURED, not guessed: at 400 s the plant is still in
   * its startup-dip recovery with the prop ladder RAILED full on truth and indication alike
   * (htr 157.8 kW, err -21 psi), so a mutant that hands the post-load step truth instead of
   * readings moves NOTHING and is blind. At 700 s the ladder is partial (26.9 kW, 2231 psia)
   * — the indicated-vs-truth difference is load-bearing and the same mutant diverges at
   * step 1. A fixture's operating point is part of what a check asserts. */
  run(eng2, 700);
  var refusedOld = false;
  try { eng2.loadState({ schema: 'pwr-1.0', state: {} }); }
  catch (e) { refusedOld = /pwr2-1\.0/.test(e.message) && /fabrication/.test(e.message); }
  ck('a pwr-1.0 save is REFUSED with the D4 §5 reason — inventing node state is fabrication',
     refusedOld === true, '');
  var save = eng2.saveState();
  ck('the save declares its schema and survives JSON (serializability is proven, not hoped)',
     save.schema === 'pwr2-1.0' && JSON.parse(JSON.stringify(save)).schema === 'pwr2-1.0', '');
  var N = quiet ? 250 : 500, A = [], B = [];
  for (var i = 0; i < N; i++) {
    var ta = eng2.step(DT);
    A.push(ta.pressure_mpa + '|' + ta.tavg_c + '|' + ta.pzr_level_pct + '|' +
           eng2.getInstruments().tavg + '|' + eng2.getInstruments().primary_pressure);
  }
  eng2.loadState(save);
  for (i = 0; i < N; i++) {
    var tb = eng2.step(DT);
    B.push(tb.pressure_mpa + '|' + tb.tavg_c + '|' + tb.pzr_level_pct + '|' +
           eng2.getInstruments().tavg + '|' + eng2.getInstruments().primary_pressure);
  }
  var firstDiff = -1;
  for (i = 0; i < N; i++) { if (A[i] !== B[i]) { firstDiff = i; break; } }
  ck('save -> run ' + N + ' steps -> load -> run again: BIT-EXACT, physics AND instruments',
     firstDiff === -1,
     firstDiff === -1 ? 'every sampled field identical over ' + N + ' steps'
                      : 'first divergence at step ' + firstDiff);
}

console.log('\nPWR2 -- THE SHELL CLASS (Option B stage B2): the surface the stack holds');
var rec = [];
runSuite(loadAll(), rec, false);
var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;

var SHSRC = fs.readFileSync(path.join(SRC, 'pwr2_shell.js'), 'utf8').replace(/\r\n/g, '\n');
var MUTATIONS = [
  ['a REFUSED command is silently swallowed (reads exactly like a plant that survived it)',
   "    if (REFUSED[a] !== undefined) {\n      throw new Error('pwr2_shell: \"' + a + '\" REFUSED — ' + REFUSED[a]);\n    }",
   '    if (REFUSED[a] !== undefined) { return { ok: true, action: a }; }'],
  ['loadState accepts a pwr-1.0 save (node state invented from lumped values)',
   "    if (!saved || saved.schema !== 'pwr2-1.0') {",
   "    if (false) {"],
  ['the readings dict is not saved (one post-load step of truth-fed control)',
   '             reading: insReading },',
   '             reading: {} },'],
  ['the pressurizer seat is never re-linked on load (the vessel falls off the plant)',
   '    e.sys.extraMass = PZ.extraMassFn(e.pz);',
   ''],
  ['the shell instruments are never updated after construction (every gauge frozen at t=0)',
   '    this.instruments.update(this._ts, dt, this._instrExtras());',
   ''],
  ['the extras dict is dropped again (the shipped B2 defect: all 35 status readings undefined)',
   '    this.instruments.update(this._ts, dt, this._instrExtras());',
   '    this.instruments.update(this._ts, dt, {});'],
  ['the rod groups revert to the one-entry id:\'control\' shape (both board readouts at 0)',
   "        { id: 'control_rods', name: 'Control Rods', function: 'control',",
   "        { id: 'control', name: 'Control Rods', function: 'control',"],
  ['the REFUSED registry is emptied (39 refusals become unknown-action errors with no reasons)',
   'var REFUSED = {',
   'var REFUSED = {}; var REFUSED_gone = {'],
  ['the pwr automation channels LEAK into the config (M4 would command a plant it does not know)',
   "        channels: (base.channels || []).filter(function (ch) { return ch.id === 'boron_conc'; }),",
   '        channels: base.channels,'],
  ['the charging setter reads the currency as a demand fraction again (any setpoint ~= zero flow)',
   '      var gpm = (c.normalized !== undefined ? c.normalized : c.value) * 450000;\n      e.cv.chargingDemand = Math.max(0, Math.min(1, gpm / RD.cvcs.CVCS.charging_max_gpm()));',
   '      e.cv.chargingDemand = Math.max(0, Math.min(1, c.normalized !== undefined ? c.normalized : c.value));'],
  ['the control-state charging setpoint reverts to a raw demand fraction (reads ~180,000 gpm)',
   '      charging_flow_normalized: (e.cv.chargingDemand === null ? 0 : e.cv.chargingDemand) *\n                                RD.cvcs.CVCS.charging_max_gpm() / 450000,',
   '      charging_flow_normalized: e.cv.chargingDemand === null ? 0 : e.cv.chargingDemand,'],
  ['the afw esf arm is dropped again (the AUX FEED tile reads SECURED over an armed AFAS)',
   "        esf_systems: [{ id: 'afw', label: 'Auxiliary feedwater', commands: [] }],",
   '        esf_systems: [],'],
  ['the afw arm grows a command list (the kernel\'s manual scan could flip a lie into the word)',
   "        esf_systems: [{ id: 'afw', label: 'Auxiliary feedwater', commands: [] }],",
   "        esf_systems: [{ id: 'afw', label: 'Auxiliary feedwater', commands: ['set_afw'] }],"],
  /* anchor grew with the wave-6 modes; the claim is the same collapse */
  ['the instrument-failure command maps every mode to STUCK',
   "      var mode = c.mode === 'fail_low' ? 'low' : c.mode === 'fail_high' ? 'high'\n               : c.mode === 'noisy' ? 'noisy' : c.mode === 'drift' ? 'drift'\n               : c.mode === 'dead' ? 'dead' : 'stuck';",
   "      var mode = 'stuck';"],
  /* anchor grew with the wave-8 rod-limit override; the claim is the same */
  ['the #500 alarm override is dropped (pzr_level_low back to the plant\'s own program point)',
   "          return a.id === 'pzr_level_low'\n            ? Object.assign({}, a, { setpoint: 17.0 })\n            : a.id === 'rod_limit_approach'",
   "          return a.id === 'nope_pzr_level_low'\n            ? Object.assign({}, a, { setpoint: 17.0 })\n            : a.id === 'rod_limit_approach'"],
  ['the shutdown group reverts to the pre-#506 snap (200 -> 0 in one frame on scram)',
   "          steps: Math.round(e.sdSteps), max_steps: 200,\n          position_pct: 100 * e.sdSteps / 200,",
   '          steps: ts.scrammed ? 0 : 200, max_steps: 200,\n          position_pct: ts.scrammed ? 0 : 100,'],
  ['the rcp pump record loses flow_pct again (the board animation computes NaN and freezes)',
   "      pumps: [{ id: 'rcp', running: !e.sys.pumpTripped,\n                flow_pct: ts.pump_flow_pct !== undefined ? ts.pump_flow_pct\n                          : (e.sys.pumpTripped ? 0 : 100) }]",
   "      pumps: [{ id: 'rcp', running: !e.sys.pumpTripped }]"],
  ['the LOOP row regresses to the wave-3 pump-trip-only shape (#507 wave 4)',
   "        EN.command(e, 'offsite_power', false);",
   "        EN.command(e, 'pump_trip', true);"],
  ['the sgtr row is routed to the cold leg (a tube rupture wearing a LOCA\'s plumbing)',
   "        EN.command(e, 'break_open', { area_m2: Math.max(1e-6, sevT * 4.33e-4),\n                                      node: 'sg_primary' });",
   "        EN.command(e, 'break_open', { area_m2: Math.max(1e-6, sevT * 4.33e-4),\n                                      node: 'cold_leg' });"],
  ['the advanced panel\'s value key is dropped again (#507 wave 6 latent fix 3 reverted)',
   '      var val = c.stuck_value !== undefined ? c.stuck_value : c.value;',
   '      var val = c.stuck_value;'],
  ['degraded_hpi reverts to the INERT seat (writes a field the physics never reads)',
   "        e.ec.hhsiAvail = Math.max(0, 1 - (c.severity !== undefined ? c.severity : 0.5));",
   "        e.ec.avail = Math.max(0, 1 - (c.severity !== undefined ? c.severity : 0.5));"],
  ['the seal-leak slider is discarded again (#507 wave 6 latent fix 2 reverted)',
   "        EN.command(e, 'break_open', { area_m2: Math.max(1e-6, sevS * 1.2e-5), node: 'rcp' });",
   "        EN.command(e, 'break_open', { area_m2: 8e-6, node: 'rcp' });"],
  ['the block mapping is severed (the board button reaches a wire that goes nowhere) -- #507 wave 7',
   "        EN.command(e, 'low_flux_block', c.blocked !== false);",
   ''],
  ['the engine-owned block surface loses its setpoint (the power tile paints the static 25 %)',
   '          setpoint: sp',
   '          setpoint: undefined'],
  /* THE ROD INSERTION LIMIT (#507 §B, wave 8) */
  ['the control-state limit fields revert to the pinned nulls',
   '          insertion_limit_steps: e._rilSteps === undefined ? null : e._rilSteps,\n          at_insertion_limit: e._rodAtLimit === true },',
   '          insertion_limit_steps: null, at_insertion_limit: false },'],
  ['the margin channel is severed (the board reads the healthy default for ever)',
   '    ex.rod_limit_margin = e._rodLimitMargin === undefined ? 200 : e._rodLimitMargin;',
   '    ex.rod_limit_margin = 200;'],
  ['the ROD LIMIT LO override is dropped (the row fires at 40 of this bank\'s steps — 4x early)',
   "            : a.id === 'rod_limit_approach'\n            ? Object.assign({}, a, { setpoint: 10 })\n            : a;",
   '            : a;'],
  ['the SECURED latch is dropped (an operator-stopped pump reads LOST) -- #507 wave 9',
   "        e._rcpSecured = true;               /* the OPERATOR stopped it — the handswitch\n                                             * reads SECURED, not LOST (#200's split) */",
   ''],
  ['the P-11 pair mapping is severed (the cooldown blocks are board-unreachable) -- #507 wave 10',
   "      } else if (c.trip_id === 'lo_press') {\n        /* the P-11 pair (#507 wave 10) — the pwr1 board's own ids for the cooldown blocks */\n        EN.command(e, 'lo_press_trip_block', c.blocked !== false);\n      } else if (c.trip_id === 'si_trip') {\n        EN.command(e, 'si_block', c.blocked !== false);\n      }",
   '      }']
];

console.log('\ninjection self-test (' + MUTATIONS.length + ' mutations):');
var blind = 0;
MUTATIONS.forEach(function (mt) {
  var mutated = SHSRC.replace(mt[1], mt[2]);
  if (mutated === SHSRC) { console.log('  ANCHOR MISS ' + mt[0]); blind++; return; }
  var rec2 = [];
  try { runSuite(loadAll(mutated), rec2, true); } catch (e) { /* a crash counts as caught */ }
  var f2 = rec2.length ? rec2.filter(function (r) { return !r.ok; }).length : 1;
  if (f2 === 0) { console.log('  BLIND TO  ' + mt[0] + '   <-- THIS GATE CANNOT SEE IT'); blind++; }
  else console.log('  caught    ' + mt[0].padEnd(70) + f2 + ' red');
});
loadAll();

console.log('\n' + '='.repeat(70));
console.log('  injection self-test: ' + (MUTATIONS.length - blind) + '/' + MUTATIONS.length +
  ' mutations caught' + (blind ? '  ** ' + blind + ' BLIND SPOTS -- GATE FAILS **' : ', no blind spots'));
console.log('  run_pwr2_shell: ' + pass + ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit(fail > 0 || blind > 0 ? 1 : 0);
