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
var MUT = require('./mut_flags.js');   /* --no-mutations / --mut= / --grp= (#602) */
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
    /* pwr2_water + pwr2_vtable stay CACHED across replays (#513): never this gate's
     * mutation target, and a re-execute discards the vtable's lazily-built ~0.5 s GRID
     * per replay. Kept as a pair (the vtable closes over RD.pwr2.water at load) —
     * see run_pwr2_engine.js's loadAll for the full note. */
    if (f !== 'pwr2_water' && f !== 'pwr2_vtable')
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

/* runSuite(SH, rec, quiet, only) — `only` scopes a MUTATION REPLAY to the section group that
 * can see that mutation (#513, the run_pwr2_engine idiom): 'A' the surface + the command
 * partition + commands-land (three sections sharing one engine), 'B' the two banks, 'D' the
 * casualty rows, 'D3' the board rails, 'E' the electrical pair, 'F' the SGTR row, 'G' the
 * wave-6 levers, 'H' the ICs through the class, 'I' the rod limit, 'J' the RCP handswitch,
 * 'K' the shutdown preset, 'S' the save contract, 'T' the AFW throttle on a real drain
 * (#582 — full channel runtime under the control kernel). The CLEAN pass runs everything;
 * each named group is preflighted ALONE on the clean build before the replays. */
function runSuite(SH, rec, quiet, only) {
  /* THE BANK'S OWN CURRENCY (#602 phase 2) — the same helpers the engine gate carries, for the
   * same reason: every step count in this file was a FRACTION of a 200-step bank spelled as an
   * absolute, and they all became wrong at once when the scale moved to the sourced 627. A
   * literal here is now a claim that the number does NOT scale, which is true of none of them. */
  var bank = function () { return globalThis.RD.pwr2.kinetics.RODS.max_steps; };
  var frac = function (f) { return Math.round(f * bank()); };
  function grp(g) { return only === undefined || only === g; }
  function ck(name, cond, note) {
    rec.push({ name: name, ok: !!cond });
    if (!quiet) console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (note ? '  -- ' + note : ''));
  }
  function head(s) { if (!quiet) console.log('\n' + s); }
  function run(e, secs) { var t; for (var i = 0; i < secs / DT; i++) t = e.step(DT); return t; }

  if (grp('A')) {
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
  /* set_boron_adjust LANDS (#510 M-8): the wave-1 repair shipped with NO gate ever issuing
   * the action through the shell — the reviewer reverted the handler and the suite scored
   * its full baseline. Both payload shapes: a rate reaches the engine's rate actuator, a
   * mode reaches the makeup door, and rate 0 idles it again. */
  ck('set_boron_adjust lands: rate -> boron_rate_cmd, mode -> makeupSource, 0 idles',
     (function () {
       eng.applyCommand({ action: 'set_boron_adjust', rate: -0.5 });
       if (eng.eng.cv.boron_rate_cmd !== -0.5) return false;
       eng.applyCommand({ action: 'set_boron_adjust', rate: 0 });
       if (eng.eng.cv.boron_rate_cmd !== 0) return false;
       eng.applyCommand({ action: 'set_boron_adjust', mode: 'borate' });
       return eng.eng.cv.makeupSource === 'borate';
     })(),
     'the #507 wave-1 fix finally has a gate that would red on its revert');
  eng.applyCommand({ action: 'set_boron_adjust', mode: 'match' });   /* restore the lineup */
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
  /* ---- THE BANK SCALE REACHES THE BOARD (#602 phase 1) -------------------------------------
   * The engine half is in run_pwr2_engine; this is the surface half. `max_steps` and
   * `position_pct` are what the board draws the rod readout from, and BOTH carried their own
   * literal 200 — so a plant whose bank moved would have published a position percentage
   * computed against a scale it no longer had, which is a wrong number that still renders.
   * Functional, like the engine half: the constant is moved and the publication is read back. */
  (function () {
    var RODS = globalThis.RD.pwr2.kinetics.RODS, was = RODS.max_steps, PROBE = 313;
    try {
      RODS.max_steps = PROBE;
      var eS = new SH.PWR2Engine({ initial_state: 'hot_full_power' });
      eS.step(0.02);
      var g = eS.getControlState().rod_groups;
      ck('the published rod groups carry the plant bank scale, not a copy of it',
         g[0].max_steps === PROBE && g[1].max_steps === PROBE,
         'max_steps ' + g[0].max_steps + ' / ' + g[1].max_steps + ' at a scale of ' + PROBE);
      ck('...and position_pct is computed against THAT scale — a stale divisor still renders',
         Math.abs(g[0].position_pct - 100) < 0.5 && Math.abs(g[1].position_pct - 100) < 0.5,
         'fully-withdrawn bank reads ' + g[0].position_pct.toFixed(1) + ' % / ' +
         g[1].position_pct.toFixed(1) + ' % (a stale 200 divisor would say ' +
         (100 * PROBE / 200).toFixed(1) + ' %)');
    } finally { RODS.max_steps = was; }
  })();
  var cs = eng.getControlState();
  ck('getControlState carries EVERY key the diagram reads (16 measured across ui/diagram)',
     cs.rod_groups.length === 2 &&
     cs.rod_groups[0].id === 'control_rods' && cs.rod_groups[1].id === 'shutdown_rods' &&
     typeof cs.rod_groups[0].steps === 'number' &&
     cs.rod_groups[0].max_steps === globalThis.RD.pwr2.kinetics.RODS.max_steps &&
     typeof cs.rod_groups[0].position_pct === 'number' &&
     typeof cs.pressure_setpoint === 'number' && typeof cs.steam_dump_pct === 'number' &&
     cs.steam_dump_setpoint > 6 && cs.steam_dump_setpoint < 8 &&
     cs.pumps.length === 1 && typeof cs.pumps[0].flow_pct === 'number' &&
     isFinite(cs.pumps[0].flow_pct) &&                       /* the board SPINS on this — a
                                                              * missing field was NaN and froze
                                                              * the RCP impeller (#506.5) */
     typeof cs.letdown_orifice_a === 'boolean' && typeof cs.letdown_orifice_b === 'boolean' &&
     /* the protective isolate is its OWN field (#624 item 14) — a shut orifice lineup and an
      * isolated plant are indistinguishable on the two lamps above */
     typeof cs.letdown_isolated === 'boolean' &&
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
  var baseAlarms = globalThis.RD.PWR_CONFIG.protection.alarms;
  /* ONE override since #500 closed (2026-08-29) — was two. `rod_limit_approach` 40 -> 10 (the
   * sourced RIL+10 in this bank's own step currency) is the survivor; every other row must
   * stay shared BY REFERENCE, and a second silent divergence reds here.
   *
   * ⚠ THE #500 OVERRIDE IS GONE AND THAT IS THE POINT OF THIS CHANGE, not an omission. It
   * rebuilt `pzr_level_low` at 17 % because the shared table's FIXED 25.0 % is this plant's
   * own sourced no-load level program point, so a healthy Mode 3, Hot Standby plant rode its
   * indicated level on the annunciator (measured: hot zero power settles 23.6-26.4 % over an
   * hour). The ruling reversed the SHAPE rather than the number *(OWNER RULING, 2026-08-28:
   * "go with as recommended for all")*: the shared row now reads `pzr_level_dev` at -20 points
   * and is correct on BOTH plants, so there is nothing left to override. Asserting the row is
   * shared by reference is therefore a real claim here — re-introducing a per-plant copy reds
   * it — and the second clause below pins the shape so "shared" cannot mean "shared and
   * absolute again". */
  var alarmsOk = Array.isArray(pc.alarms) && pc.alarms.length === baseAlarms.length &&
    pc.alarms.every(function (a, i) {
      return a.id === 'rod_limit_approach'
        ? (a.setpoint === 10 && baseAlarms[i].id === 'rod_limit_approach' && baseAlarms[i].setpoint === 40)
        : a === baseAlarms[i];
    }) &&
    (function () {
      var lo = pc.alarms.filter(function (a) { return a.id === 'pzr_level_low'; })[0];
      var dev = pc.alarms.filter(function (a) { return a.id === 'pzr_level_dev_low'; })[0];
      /* the two-rung deviation ladder: both on the program-relative channel, the warning
       * DEEPER than the caution, and the absolute rung retired. `pzr_level_lolo` stays
       * absolute on purpose — a hard inventory floor is not a program question. */
      return !!lo && !!dev && lo.instrument === 'pzr_level_dev' &&
             dev.instrument === 'pzr_level_dev' && lo.setpoint < dev.setpoint &&
             lo.priority === 'warning' && dev.priority === 'caution';
    })();
  /* channels carries EXACTLY the boron batch-dose panel since #507 wave 1 — its whole
   * vocabulary (set_boron_adjust {rate}, take_boron_sample, boron_analyzer) is real on this
   * plant now; every other pwr channel stays out (their actuators are internal) */
  ck('getProtectionConfig is PWR2 OWN config: acting parts empty EXCEPT the boron channel',
     pc !== globalThis.RD.PWR_CONFIG.protection &&
     pc.trips.length === 0 && pc.actuations.length === 0 &&
     /* TWO channels since #562, and they are NAMED rather than counted: the point of this
      * clause is that PWR2 admits pwr channels ONE AT A TIME, by an explicit criterion (its
      * whole vocabulary is a command PWR2 has, its input is live). A count would let a third
      * arrive unexamined, which is the thing the emptying rationale exists to prevent.
      * `boron_conc` rides BY REFERENCE off the pwr table; `afw_level` is PWR2's own def,
      * held in pwr2_shell because the retired engine already holds level inside its engine
      * and a second authority over one valve is the duplicate-authority veto. */
     pc.channels.length === 2 &&
     pc.channels.map(function (ch) { return ch.id; }).sort().join(',') === 'afw_level,boron_conc' &&
     pc.channels.filter(function (ch) { return ch.id === 'boron_conc'; })[0] === globalThis.RD.PWR_CONFIG.protection.channels.filter(function (ch) { return ch.id === 'boron_conc'; })[0] &&
     globalThis.RD.PWR_CONFIG.protection.channels.filter(function (ch) { return ch.id === 'afw_level'; }).length === 0 &&
     pc.interlocks.length === 0 && pc.runbacks.length === 0 &&
     alarmsOk &&
     Object.keys(pc.failures).length === 22 &&
     !!pc.failures.stuck_porv_open && !!pc.failures.rcp_trip && !!pc.failures.turbine_trip &&
     /* #515 — the P-9 channel failure (pwr2_only: the old engine's catalog hides it) */
     !!pc.failures.anticipatory_trip_failure &&
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
     'M4 gets a shape it can hold; the level ladder is program-relative on both plants ' +
     '(#500) so no alarm row is overridden but rod_limit_approach; boron_conc by reference');
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
       return a && a.esf && a.esf.afw === 'auto' && a.channels.length === 2 &&
              a.channels.map(function (c) { return c.id; }).sort().join(',') === 'afw_level,boron_conc';
     })(),
     'the board\'s STANDBY word reads this dict, nothing else');
  ck('getStartupLineup/getActiveFailures exist and answer',
     Array.isArray(eng.getStartupLineup()) && Array.isArray(eng.getActiveFailures()) &&
     eng.getActiveFailures().length === 0, '');
  }

  if (grp('B')) {
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
       /* FRACTIONS OF TRAVEL, not steps (#602): at t+1.0 s a 2.5 s ramp has 60 % left and a
        * 2.0 s ramp 50 %. The old 80-140 / 60-120 windows were those fractions of a 200-step
        * bank; the bands travel with the scale, the claim does not move. */
       g[0].steps > frac(0.40) && g[0].steps < frac(0.70) &&
       g[1].steps > frac(0.30) && g[1].steps < frac(0.60) &&
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
       g3[1].steps < bank() && g3[0].steps === bank(),
       'control ' + g3[0].steps + ', shutdown ' + g3[1].steps);
  })();
  }

  if (grp('C')) {
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
    ck('ALIGN refuses at power (permissive) and with injection pumps running (the ruled ' +
       'lineup message — #510 LOW: it no longer asserts "(SI actuated)" over a manual pump ' +
       'start); ISOLATE never',
       msgP !== null && /425 psig/.test(msgP) &&
       msgSI !== null && /injection pumps are running/.test(msgSI) &&
       !/interlock/i.test(msgSI) && !/SI actuated/.test(msgSI) &&
       isoOk,
       'power: "' + (msgP || '').slice(0, 40) + '…"; pumps: "' + (msgSI || '').slice(0, 40) + '…"');
  })();
  }

  if (grp('D')) {
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

    /* THE ALL-CLEAR CLEARS EVERYTHING (#510 M-3): pile the wave-3/4/6 levers on top of the
     * three rows already standing, clear all, and the ENGINE-DERIVED list — the same
     * detector the sweep now iterates — must read empty, with the levers measurably reset
     * (the old three-command clear left nine of these standing behind a green "all clear"). */
    e5.applyCommand({ action: 'inject_failure', failure_id: 'failure_to_scram' });
    e5.applyCommand({ action: 'inject_failure', failure_id: 'failed_pzr_heaters' });
    e5.applyCommand({ action: 'inject_failure', failure_id: 'afw_failure' });
    e5.applyCommand({ action: 'inject_failure', failure_id: 'sg_overfeed' });
    e5.applyCommand({ action: 'inject_failure', failure_id: 'loss_of_offsite_power' });
    e5.step(0.02);
    e5.applyCommand({ action: 'clear_all_failures' });
    for (i = 0; i < 5; i++) e5.step(0.02);
    var actClr = e5.getActiveFailures();
    ck('clear_all_failures clears EVERY standing row through its own per-id clear — the ' +
       'derived list reads empty and the levers are genuinely reset (#510 M-3)',
       actClr.length === 0 && e5.eng.scramBlocked !== true && !e5.eng.pzDrivers.heaters_failed &&
       e5.eng.aw.blocked !== true && e5.eng.fw.overfeed !== true && e5.eng.ec.hhsiAvail === 1 &&
       e5.eng.cwPumps === true && e5.eng.elec.offsite === true && (!e5.eng.brk || !e5.eng.brk.open),
       'active after clear-all: [' + actClr.join(',') + ']');
  })();
  }

  if (grp('D2')) {
  /* ---- 1d2. THE OVERFEED SEAT (#510 M-12) --------------------------------------------------- */
  (function () {
    var eO = new SH.PWR2Engine({});
    for (var i = 0; i < 100; i++) eO.step(0.02);
    eO.applyCommand({ action: 'set_feedwater_flow', pct: 50 });      /* MANUAL at 0.5 */
    for (i = 0; i < 50; i++) eO.step(0.02);
    var man0 = eO.eng.fw.manual_frac, auto0 = eO.eng.fw.auto;
    eO.applyCommand({ action: 'inject_failure', failure_id: 'sg_overfeed' });
    for (i = 0; i < 1500; i++) eO.step(0.02);
    var duringOk = eO.eng.fw.feed_frac > 1.1 && eO.eng.fw.manual_frac === man0 &&
                   eO.eng.fw.auto === auto0 &&
                   eO.getActiveFailures().indexOf('sg_overfeed') !== -1;
    eO.applyCommand({ action: 'clear_failure', failure_id: 'sg_overfeed' });
    for (i = 0; i < 1500; i++) eO.step(0.02);
    ck('sg_overfeed is its own SEAT (#510 M-12): a failed-open valve feeds 1.2x while the ' +
       'operator\'s MANUAL 0.5 lineup stands untouched, reports as active, and the clear ' +
       'releases the valve back to the standing lineup — never force-selecting AUTO',
       duringOk && eO.eng.fw.auto === auto0 && eO.eng.fw.manual_frac === man0 &&
       Math.abs(eO.eng.fw.feed_frac - man0) < 0.1 &&
       eO.getActiveFailures().indexOf('sg_overfeed') === -1,
       'feed ' + eO.eng.fw.feed_frac.toFixed(2) + ' after clear against manual ' + man0 +
       ' (the old row rewrote the demand and the clear flipped the selector)');
  })();
  }

  if (grp('D3')) {
  /* ---- 1d3. THE BOARD RAILS TOO (#510 M-5) --------------------------------------------------- */
  (function () {
    var eR = new SH.PWR2Engine({});
    for (var i = 0; i < 100; i++) eR.step(0.02);
    eR.applyCommand({ action: 'set_instrument_failure', instrument_id: 'primary_pressure',
                      mode: 'fail_low' });
    eR.step(0.02); eR.step(0.02);
    var spec = eR.eng.ins.channels.primary_pressure.spec;
    ck('fail_low rails the BOARD layer at the channel\'s own range floor (#510 M-5: the old ' +
       '`ch.range` read undefined on every internal channel and the board froze at its ' +
       'healthy reading while the RPS channel railed)',
       eR.instruments.reading.primary_pressure === spec.range[0] &&
       eR.eng.ins.reading.primary_pressure < 0.5,
       'board ' + eR.instruments.reading.primary_pressure + ' vs range floor ' + spec.range[0]);
  })();

  /* ---- 1d3b. EVERY PANEL ROW CAN ACTUALLY BE FAILED (#563 item 1) ----------------------------
   * The advanced instrument-failure panel is the Hard Rule 1 teaching tool, and physics.html
   * sells it. It refused 35 of its own 50 rows with a raw module string until 2026-08-30,
   * because the mirror-only path was hard-coded to ONE id. The regression was invisible to
   * every gate here: the partition check compares the shell's action list against the RETIRED
   * engine's, and `set_instrument_failure` is present in both, so nothing asked whether the
   * ids it accepts are the ids the panel offers.
   *
   * Three separate claims, because they fail separately: the command is accepted; a genuinely
   * unknown id is STILL refused (the property that stops a typo landing silently); and the
   * reading MOVES, which is the only one that cannot be satisfied by a dark wire. */
  (function () {
    var specs = globalThis.RD.PWR_CONFIG.instruments;
    var e0 = new SH.PWR2Engine({});
    var rows = Object.keys(e0.getInstruments()).filter(function (id) { return specs[id]; });

    var threw = [];
    rows.forEach(function (id) {
      var eF = new SH.PWR2Engine({});
      for (var i = 0; i < 20; i++) eF.step(0.02);
      try { eF.applyCommand({ action: 'set_instrument_failure', instrument_id: id, mode: 'dead' }); }
      catch (err) { threw.push(id); }
    });
    ck('every row of the advanced panel accepts an instrument failure — all ' + rows.length +
       ' of them (#563 item 1: 35 threw `pwr2_instruments: no channel "<id>"` at the player, ' +
       'because only porv_indicator was allowed down the mirror-only path)',
       threw.length === 0, threw.length + ' refused' + (threw.length ? ': ' + threw.slice(0, 6).join(', ') : ''));

    var unknownRefused = false;
    var eU = new SH.PWR2Engine({});
    try { eU.applyCommand({ action: 'set_instrument_failure', instrument_id: 'not_a_channel', mode: 'dead' }); }
    catch (err) { unknownRefused = true; }
    ck('...and an id that is not a board channel is STILL refused — the generalised guard tests ' +
       'the numeric channel map, not merely "the engine has never heard of it"',
       unknownRefused, 'accepted a typo');

    /* THE EFFECT, NOT THE WRITE. A count, not one channel: a single hand-picked id is one
     * refactor away from being the only one that works. 21 of the 50 legitimately do not move
     * under `dead` at hot full power — they already read their own range floor there (hpi_flow,
     * afw_flow, adv_valve and friends at zero flow), plus six DERIVED channels recomputed after
     * _applyFailure that are dark on the retired engine too (subcooling_margin, the OT-delta-T and OP-delta-T pairs,
     * tavg_rate, pzr_level_dev, rod_limit_margin — pre-existing, shared, and NOT fixed here).
     * MEASURED 2026-08-30 over the same 50 rows: retired 28 move, PWR2 29. */
    var moved = 0;
    rows.forEach(function (id) {
      var a = new SH.PWR2Engine({}), b = new SH.PWR2Engine({});
      for (var i = 0; i < 100; i++) { a.step(0.02); b.step(0.02); }
      try { b.applyCommand({ action: 'set_instrument_failure', instrument_id: id, mode: 'dead' }); }
      catch (err) { return; }
      for (i = 0; i < 5; i++) { a.step(0.02); b.step(0.02); }
      if (a.getInstruments()[id] !== b.getInstruments()[id]) moved++;
    });
    ck('...and the BOARD READING actually moves for at least as many rows as the retired ' +
       'engine managed — 28 of 50 there, measured; accepting the command is not the claim',
       moved >= 28, moved + ' of ' + rows.length + ' rows changed under `dead`');
  })();

  /* ---- 1d3c. AUXILIARY SPRAY HAS A DOOR (#563 item 2) ----------------------------------------
   * Built at stage 2c, gated in run_pwr2_pressurizer, mutation-tested — and in NONE of MAPPED,
   * REHOMED or REFUSED, so the partition this file asserts was satisfied by an action that did
   * not exist rather than by one that worked. That is the hole a new capability falls through:
   * the partition is checked against the RETIRED engine's action list, and the retired engine
   * never had auxiliary spray.
   *
   * THE EFFECT, NOT THE WRITE, and it takes a real ride: the claim is depressurization
   * authority with the reactor coolant pumps secured, which is the Mode 4 cooldown regime. */
  (function () {
    function ride(pct) {
      var e = new SH.PWR2Engine({ initial_state: 'hot_zero_power' });
      e.applyCommand({ action: 'set_rcp', running: false });
      if (pct !== null) e.applyCommand({ action: 'set_aux_spray', pct: pct });
      for (var i = 0; i < 30000; i++) e.step(0.02);          /* 600 s */
      return e;
    }
    var eOff = ride(null), eOn = ride(100);
    var pOff = eOff.eng.sys.P * 145.038, pOn = eOn.eng.sys.P * 145.038;
    ck('set_aux_spray is a REAL door: 100 % with every reactor coolant pump secured takes the ' +
       'plant down ~890 psi in 600 s where the shut leg holds — the normal spray draws its ' +
       'motive head from the loop, so this is the only way down that does not lift the PORV',
       pOff - pOn > 700 && pOn < 1600,
       'shut ' + pOff.toFixed(0) + ' psia vs aux ' + pOn.toFixed(0) + ' psia (' +
       (pOff - pOn).toFixed(0) + ' psi)');

    /* the READBACK, because the board's own box reads this field and a demand the plant does
     * not publish is a box that snaps back to zero under the player's fingers */
    var eR = new SH.PWR2Engine({ initial_state: 'hot_zero_power' });
    for (var k = 0; k < 50; k++) eR.step(0.02);
    var before = eR.getControlState().aux_spray_pct;
    eR.applyCommand({ action: 'set_aux_spray', pct: 60 });
    eR.step(0.02);
    var after = eR.getControlState().aux_spray_pct;
    ck('...and the control state publishes the standing DEMAND back, so the board box holds ' +
       'what the operator typed (0 -> 60)',
       before === 0 && Math.abs(after - 60) < 1e-6,
       'before ' + before + ', after ' + after);
  })();
  }

  if (grp('D4')) {
  /* ---- 1d4. HR1 ON THE RHR PERMISSIVE (#510 M-2) --------------------------------------------- */
  (function () {
    var eP = new SH.PWR2Engine({ initial_state: 'hot_shutdown' });
    for (var i = 0; i < 100; i++) eP.step(0.02);
    eP.applyCommand({ action: 'set_rhr', active: false });        /* start unaligned */
    eP.applyCommand({ action: 'set_instrument_failure', instrument_id: 'primary_pressure',
                      mode: 'fail_high' });
    eP.step(0.02); eP.step(0.02);
    var refused = false, msgP = '';
    try { eP.applyCommand({ action: 'set_rhr', active: true }); }
    catch (e2) { refused = true; msgP = e2.message || ''; }
    ck('the RHR permissive reads the INSTRUMENT and the refusal quotes the INDICATED value ' +
       '(#510 M-2 — HR1: a rail-high channel refuses the align on a genuinely depressurized ' +
       'plant; the old form read AND quoted true pressure)',
       refused && /indicates/.test(msgP) && eP.eng.sys.P * 145.038 - 14.7 < 425,
       'true ' + (eP.eng.sys.P * 145.038 - 14.7).toFixed(0) + ' psig; ' + msgP.slice(0, 70));
  })();
  }

  if (grp('E')) {
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
    /* THROUGH THE FACADE WIRE (#510 LOW rebuild): the old form called stepAFW itself with
     * mdafw_power_ok hand-forced at dt = 0 — proving the MODULE, not the wiring. The
     * contract's own afw_flow_normalized = 0.667 IS the claim: both pumps demanded, only
     * the steam-driven one delivering, through the engine's own power wire. */
    ck('an SBO: ac_available false on the contract, heaters DEAD, and the contract reads ' +
       'afw 0.667 — the demanded MDAFW delivers nothing while the steam-driven TDAFW ' +
       'carries the plant THROUGH THE FACADE WIRE (WTSM 5.7.5)',
       ts7.ac_available === false && ts7.station_blackout === true &&
       (e7.eng._pzr.heater_kW || 0) === 0 &&
       e7.eng.aw.mdafwRunning === true &&
       Math.abs(ts7.afw_flow_normalized - 2 / 3) < 0.01 &&
       act7.indexOf('station_blackout') !== -1,
       'afw ' + ts7.afw_flow_normalized.toFixed(3) + ' (TDAFW-only fraction); active [' +
       act7.join(',') + ']');
    e7.applyCommand({ action: 'clear_failure', failure_id: 'station_blackout' });
    e7.step(0.02); var ts7b = e7.getTrueState();
    ck('clearing the SBO restores both buses on the contract (pumps stay where physics left them)',
       ts7b.ac_available === true && ts7b.station_blackout === false &&
       e7.eng.sys.pumpTripped === true, '');

    /* THE LAYERED CLEAR (#510 M-13): a blackout injected ON TOP of a standing LOOP restores
     * only what the blackout took — the diesels answer, the grid is STILL down, and the
     * engine-derived failure list agrees with the ledger the player is looking at. The old
     * unconditional offsite=true made the LOOP vanish from the engine while the Failures tab
     * kept drawing it. */
    var e7c = new SH.PWR2Engine({});
    for (i = 0; i < 100; i++) e7c.step(0.02);
    e7c.applyCommand({ action: 'inject_failure', failure_id: 'loss_of_offsite_power' });
    for (i = 0; i < 50; i++) e7c.step(0.02);
    e7c.applyCommand({ action: 'inject_failure', failure_id: 'station_blackout' });
    for (i = 0; i < 50; i++) e7c.step(0.02);
    e7c.applyCommand({ action: 'clear_failure', failure_id: 'station_blackout' });
    e7c.step(0.02);
    var ts7c = e7c.getTrueState(), act7c = e7c.getActiveFailures();
    ck('clearing an SBO that arrived ON a standing LOOP restores the DIESELS ONLY: the grid ' +
       'stays down, ac_available true (vital buses), and the LOOP row still reports',
       ts7c.station_blackout === false && ts7c.ac_available === true &&
       e7c.eng.elec.offsite === false &&
       act7c.indexOf('loss_of_offsite_power') !== -1,
       'active [' + act7c.join(',') + '], offsite ' + e7c.eng.elec.offsite);
    e7c.applyCommand({ action: 'clear_failure', failure_id: 'loss_of_offsite_power' });
    e7c.step(0.02);
    ck('...and clearing the LOOP afterwards restores the grid (the layered recovery lands)',
       e7c.eng.elec.offsite === true &&
       e7c.getActiveFailures().indexOf('loss_of_offsite_power') === -1, '');
  })();

  /* ---- 1e-i. THE TURBINE LATCH (#551, #559) --------------------------------------------------
   * Nothing in the shipped command surface un-latched the turbine: both mappers hard-coded
   * `true`, connect_grid and set_load_mode were REFUSED, and 896 command/payload combinations
   * were fired at a tripped plant without clearing `tb.tripped`. ONE SCRAM ENDED ELECTRICAL
   * GENERATION FOR THE SESSION, while load_target_mwe read back the MWe the operator typed.
   *
   * The half that matters most here is the REFUSAL. A bare un-latch would be accepted and then
   * overwritten on the next step by whichever of the six level-holds is standing — the #509 §79
   * defect, where the plant agrees and nothing happens — so these checks assert the refusal by
   * NAME, not just that a latch sometimes works. ---- */
  head('THE TURBINE LATCH  [#551/#559 — and it must REFUSE rather than be overwritten]');
  (function () {
    var eL = new SH.PWR2Engine({ initial_state: '50_percent' });
    for (i = 0; i < 9000; i++) eL.step(0.02);
    /* P-9 defeated so the turbine trip does not take the reactor with it — above P-9 a turbine
     * trip IS a reactor trip [sourced], and P-9 is met at the 50 % IC too, so this menu row is
     * the only way to reach a turbine trip on a critical plant. */
    eL.applyCommand({ action: 'inject_failure', failure_id: 'anticipatory_trip_failure' });
    eL.applyCommand({ action: 'trip_turbine' });
    for (i = 0; i < 6000; i++) eL.step(0.02);
    var tsL = eL.getTrueState();
    ck('a turbine trip on a CRITICAL plant is the fixture — 0 MWe with the reactor up',
       tsL.turbine_tripped === true && tsL.mwe_output < 0.01 && tsL.scrammed === false,
       'MWe ' + tsL.mwe_output.toFixed(2) + ', scrammed ' + tsL.scrammed);
    eL.applyCommand({ action: 'latch_turbine' });
    eL.applyCommand({ action: 'set_load_target', mwe: 50 });
    for (i = 0; i < 3000; i++) eL.step(0.02);
    var tsL2 = eL.getTrueState();
    ck('#551: latch_turbine brings the machine back — MWe, rpm and the governor all return',
       tsL2.turbine_tripped === false && tsL2.mwe_output > 45 && tsL2.turbine_rpm > 1700,
       'MWe ' + tsL2.mwe_output.toFixed(2) + ' at ' + tsL2.turbine_rpm.toFixed(0) + ' rpm');
    for (i = 0; i < 30000; i++) eL.step(0.02);
    ck('...and it HOLDS for 600 s — a latch that is overwritten next step is the #509 defect',
       eL.getTrueState().turbine_tripped === false && eL.getTrueState().mwe_output > 45,
       'MWe ' + eL.getTrueState().mwe_output.toFixed(2) + ' at t+600 s');

    /* THE REFUSAL, per standing condition. Each of the six level-holds must NAME itself. */
    var eR = new SH.PWR2Engine({});
    for (i = 0; i < 3000; i++) eR.step(0.02);
    eR.applyCommand({ action: 'scram' });
    for (i = 0; i < 3000; i++) eR.step(0.02);
    var msg = null;
    try { eR.applyCommand({ action: 'latch_turbine' }); } catch (eX) { msg = eX.message; }
    ck('#559: a latch under a STANDING reactor trip REFUSES, and names it',
       msg !== null && /reactor trip is LATCHED/.test(msg), msg ? msg.slice(0, 90) : 'ACCEPTED!');
    ck('...and the refusal carries the SOURCED recipe order — reset first, then latch',
       msg !== null && /reset the protection/.test(msg), '');
    eR.applyCommand({ action: 'reset_rps' });
    for (i = 0; i < 500; i++) eR.step(0.02);
    var msg2 = null;
    try { eR.applyCommand({ action: 'latch_turbine' }); } catch (eX2) { msg2 = eX2.message; }
    ck('...and once the protection is reset the same command is ACCEPTED',
       msg2 === null, msg2 ? msg2.slice(0, 80) : 'accepted');

    /* THE MSIV LEG — a condition the operator can actually clear, so the refusal is not
     * just a post-scram special case. */
    var eM = new SH.PWR2Engine({});
    for (i = 0; i < 3000; i++) eM.step(0.02);
    eM.applyCommand({ action: 'close_msiv' });
    for (i = 0; i < 3000; i++) eM.step(0.02);
    var msg3 = null;
    try { eM.applyCommand({ action: 'latch_turbine' }); } catch (eX3) { msg3 = eX3.message; }
    ck('a shut MSIV names ITSELF in the refusal — the six holds are enumerated, not lumped',
       msg3 !== null && /main steam isolation valve/.test(msg3), msg3 ? msg3.slice(0, 80) : 'ACCEPTED!');

    /* THE CASUALTY SEAT — #551's buried half. */
    var eF = new SH.PWR2Engine({});
    for (i = 0; i < 3000; i++) eF.step(0.02);
    eF.applyCommand({ action: 'inject_failure', failure_id: 'turbine_trip' });
    for (i = 0; i < 250; i++) eF.step(0.02);
    ck('#551: an INJECTED turbine trip appears in the failures list — it never did, so the ' +
       'instructor could inject a casualty that was invisible AND unclearable',
       eF.getActiveFailures().indexOf('turbine_trip') !== -1,
       '[' + eF.getActiveFailures().join(',') + ']');
    var msg4 = null;
    try { eF.applyCommand({ action: 'latch_turbine' }); } catch (eX4) { msg4 = eX4.message; }
    ck('...the operator cannot latch away an instructor casualty',
       msg4 !== null && /injected casualty/.test(msg4), msg4 ? msg4.slice(0, 80) : 'ACCEPTED!');
    eF.applyCommand({ action: 'clear_failure', failure_id: 'turbine_trip' });
    ck('...and clear_failure clears it, without THROWING (a clear is not an operator latch)',
       eF.getActiveFailures().indexOf('turbine_trip') === -1, '');
  })();

  /* ---- 1e-ib. THE ROD DRIVE UNDER A LATCHED TRIP (#545) --------------------------------------
   * THE SAME LATCH-INTEGRITY CLASS AS THE BLOCK ABOVE, one system over, and it lives HERE
   * because the operator's rod verbs are the SHELL's — `rod_start`, `rod_nudge`, `rod_stop`
   * and `rod_stop_all` all funnel into the engine's two bank doors and the board sends only
   * these four. run_pwr2_engine proves the doors and the hold; nothing there can tell you the
   * board's own verbs reach them, which is the layer mistake #562 shipped through.
   *
   * [sourced] Ginna TS Bases B 3.3.1 (ML20339A221): "Opening of the RTBs interrupts power to
   * the CRDMs". Measured pre-fix through THIS facade: scram, then `rod_start {direction: 1}`
   * on both groups returned {"ok":true} and the plant went 0/0 -> 200/200 and 2.71 -> 61.18 %
   * true power with SCRAMMED lit on the true state, the instrument and the kernel at once. */
  head('THE ROD DRIVE  [#545 — a latched trip is the breakers open; the board\'s own verbs]');
  (function () {
    var eD = new SH.PWR2Engine({});
    for (i = 0; i < 3000; i++) eD.step(0.02);
    eD.applyCommand({ action: 'scram' });
    for (i = 0; i < 500; i++) eD.step(0.02);
    var s0 = eD.eng.rodSteps, sd0 = eD.eng.sdSteps;
    /* THE BOARD'S OWN PAYLOADS (pwr_board_wiring's startHoldRod): rod_start on press,
     * rod_stop on release, per group_id. A synthetic payload would test a command no
     * player can send. */
    var mW = null, mS = null;
    try { eD.applyCommand({ action: 'rod_start', group_id: 'control_rods', direction: 1, speed: 'fast' }); }
    catch (x1) { mW = x1.message; }
    try { eD.applyCommand({ action: 'rod_start', group_id: 'shutdown_rods', direction: 1, speed: 'fast' }); }
    catch (x2) { mS = x2.message; }
    ck('#545: WITHDRAW on the control bank REFUSES under a latched trip, and names the breakers',
       mW !== null && /ROD DRIVE BLOCKED/.test(mW) && /trip breakers are open/.test(mW),
       mW ? mW.slice(0, 90) : 'ACCEPTED! (the shipped defect)');
    ck('#545: ...and so does the SHUTDOWN bank — group_id is routed, not dropped (#506.3)',
       mS !== null && /ROD DRIVE BLOCKED/.test(mS), mS ? mS.slice(0, 60) : 'ACCEPTED!');
    ck('...and the refusal names the way out, so the operator is not left guessing',
       mW !== null && /Reset the RPS/.test(mW), '');
    /* rod_stop is sent on EVERY button release and its mapper sets target := position. If the
     * guard refused the PRESS rather than the MOTION, letting go would be an error. */
    var mStop = null;
    try {
      eD.applyCommand({ action: 'rod_stop', group_id: 'control_rods' });
      eD.applyCommand({ action: 'rod_stop', group_id: 'shutdown_rods' });
      eD.applyCommand({ action: 'rod_stop_all' });
    } catch (x3) { mStop = x3.message; }
    ck('...while rod_stop and rod_stop_all still take — a refused RELEASE would be a new defect',
       mStop === null, mStop ? ('THREW: ' + mStop.slice(0, 60)) : 'all three accepted');
    for (i = 0; i < 45000; i++) eD.step(0.02);      /* 900 s */
    var tsD = eD.getTrueState(), insD = eD.getInstruments();
    ck('...and 900 s later NEITHER bank has moved and the core is still down (pre-fix: ' +
       '200/200 at 61.18 % with SCRAMMED lit everywhere)',
       eD.eng.rodSteps === s0 && eD.eng.sdSteps === sd0 && tsD.power_pct < 0.5 &&
       tsD.scrammed === true && insD.rps_scrammed === true,
       'rods ' + eD.eng.rodSteps.toFixed(1) + '/' + eD.eng.sdSteps.toFixed(1) + ', power ' +
       tsD.power_pct.toFixed(2) + ' %');
    /* THE WAY OUT WORKS, and leaves no standing demand behind it (Manuals/03 §3.5.1). */
    var mR = null;
    try { eD.applyCommand({ action: 'reset_rps' }); } catch (x4) { mR = x4.message; }
    ck('...the reset is ACCEPTED with the rods in, and snaps both demands to position',
       mR === null && eD.eng.pt.reactor_trip === false &&
       eD.eng.rodTarget === eD.eng.rodSteps && eD.eng.sdTarget === eD.eng.sdSteps,
       mR ? ('THREW: ' + mR.slice(0, 60)) : 'targets ' + eD.eng.rodTarget.toFixed(1) + '/' +
       eD.eng.sdTarget.toFixed(1));
    for (i = 0; i < 1500; i++) eD.step(0.02);
    ck('...and NOTHING moves on its own after it — the reset re-closes breakers, it does not ' +
       'withdraw rods',
       eD.eng.rodSteps === s0 && eD.eng.sdSteps === sd0,
       eD.eng.rodSteps.toFixed(1) + '/' + eD.eng.sdSteps.toFixed(1) + ' after 30 s idle');
    eD.applyCommand({ action: 'rod_start', group_id: 'control_rods', direction: 1, speed: 'fast' });
    for (i = 0; i < 1500; i++) eD.step(0.02);
    ck('...and the board\'s WITHDRAW works again once the breakers are shut — 30 s at fast ' +
       'is ~31.6 steps',
       eD.eng.rodSteps > 28 && eD.eng.rodSteps < 35,
       eD.eng.rodSteps.toFixed(1) + ' steps (1.053/s x 30 s)');

    /* THE ATWS PAIR — the shutdown bank stuck OUT is the one state where `rods_fully_in`
     * being control-bank-only was observable, and where the facade reset had no guard at
     * all. Measured pre-fix: rods 0/200 published `rods_fully_in: true`, and reset_rps at
     * 200/200 returned {"ok":true} and cleared the latch. */
    var eA2 = new SH.PWR2Engine({});
    for (i = 0; i < 3000; i++) eA2.step(0.02);
    eA2.applyCommand({ action: 'inject_failure', failure_id: 'failure_to_scram' });
    eA2.applyCommand({ action: 'scram' });
    for (i = 0; i < 500; i++) eA2.step(0.02);
    var mIn = null;
    try { eA2.applyCommand({ action: 'rod_start', group_id: 'control_rods', direction: -1, speed: 'fast' }); }
    catch (x5) { mIn = x5.message; }
    ck('ATWS: INSERT is refused too — with the breakers open the drive has no power either way ' +
       '(OWNER RULING 2026-08-28, "Refuse both directions")',
       mIn !== null && /ROD DRIVE BLOCKED/.test(mIn) && eA2.eng.rodSteps === bank(),
       mIn ? ('rods held at ' + eA2.eng.rodSteps.toFixed(0)) : 'ACCEPTED!');
    var mRA = null;
    try { eA2.applyCommand({ action: 'reset_rps' }); } catch (x6) { mRA = x6.message; }
    ck('#545: the FACADE reset is refused with the rods out — it had NO guard, only the kernel ' +
       'permissive did',
       mRA !== null && /RPS RESET BLOCKED/.test(mRA) && eA2.eng.pt.reactor_trip === true,
       mRA ? mRA.slice(0, 95) : 'ACCEPTED! (the shipped defect)');
    /* rods_fully_in is the kernel's RODS_NOT_INSERTED permissive input. Drive the control
     * bank to 0 with the shutdown bank still out — the exact state the missing `every`
     * published as `true`. */
    eA2.eng.rodSteps = 0; eA2.eng.rodTarget = 0;
    eA2.step(0.02);
    ck('#545: rods_fully_in is BOTH banks — a control bank at 0 with the shutdown bank OUT is ' +
       'not "rods in" (the retired engine\'s `.every()`, lost in the second copy)',
       eA2.getInstruments().rods_fully_in === false && eA2.eng.sdSteps === bank(),
       'control 0, shutdown ' + eA2.eng.sdSteps.toFixed(0) + ' -> rods_fully_in ' +
       eA2.getInstruments().rods_fully_in);
    eA2.applyCommand({ action: 'clear_failure', failure_id: 'failure_to_scram' });
  })();

  /* ---- 1e-ic. THE RESET'S OTHER PERMISSIVE (#571) --------------------------------------------
   * `control_kernel.rpsResetBlock` refuses a reset against a live trip signal by iterating
   * `this.config.trips` — and `getProtectionConfig` hands PWR2 an EMPTY trips list, correctly,
   * because this plant's protection lives in the engine (#546/#547, §98). So the loop ran ZERO
   * times, TRIP_SIGNAL_PRESENT could never be returned, and `Manuals/03` §3.5.1 documented it
   * as one of TWO live permissives with its own board caption ("TRIP SIGNAL STANDING") that
   * nothing could light. MEASURED before the fix: a large LOCA holding lo_pzr_press at
   * 1074 psia against 1775 psia, asserted and tripping — rpsResetBlock() null, resetRps() null,
   * the latch cleared, and ONE 0.1 s protection step later it re-latched on the same signal.
   *
   * BOTH PATHS ARE CHECKED because they are different consumers of one derivation: the kernel
   * reads the published instrument (which is what paints the caption BEFORE the press), the
   * facade reads standingTrip() directly (which is what a dev-channel session and any harness
   * reach). They cannot drift — there is one derivation — but each can be wired wrong. */
  head('THE RESET PERMISSIVE  [#571 — a breaker will not hold in against a live trip signal]');
  (function () {
    function kern(e) { return new globalThis.RD.ControlLayer(e, e.getProtectionConfig(), { register: 'learning' }); }
    function ridek(e, k, secs) {
      var acc = 0;
      for (var j = 0, n = Math.round(secs / 0.02); j < n; j++) {
        e.step(0.02); acc += 0.02;
        if (acc >= 0.1 - 1e-9) { k.evaluate(e.getInstruments(), acc); acc = 0; }
      }
    }
    function facReset(e) {
      try { e.applyCommand({ action: 'reset_rps' }); return null; } catch (x) { return x.message; }
    }

    /* A. THE ORDINARY RECOVERY IS UNTOUCHED — the check that would have caught the first draft.
     * Written against the SHARED instrument status list, `no_trip_signal_standing` never reached
     * the reading, `crossed(undefined, 'is_true')` is FALSE, and EVERY reset was refused
     * including this one. A silent-undefined that reads exactly like a working interlock. */
    var eP = new SH.PWR2Engine({}), kP = kern(eP);
    ridek(eP, kP, 60);
    eP.applyCommand({ action: 'scram' });
    ridek(eP, kP, 30);
    ck('a CLEAN scram still resets — no rps row is asserted at Hot Standby, so the new ' +
       'permissive is satisfied and the ordinary post-trip recovery is untouched',
       eP.getInstruments().no_trip_signal_standing === true &&
       kP.rpsResetBlock(eP.getInstruments()) === null && kP.resetRps() === null &&
       eP.eng.pt.reactor_trip === false,
       'no_trip_signal_standing ' + eP.getInstruments().no_trip_signal_standing +
       ', latch ' + eP.eng.pt.reactor_trip);

    /* B. A STANDING SIGNAL BLOCKS BOTH PATHS. */
    var eQ = new SH.PWR2Engine({}), kQ = kern(eQ);
    ridek(eQ, kQ, 60);
    eQ.applyCommand({ action: 'inject_failure', failure_id: 'large_loca', severity: 0.35 });
    for (i = 0; i < 20 && !eQ.eng.pt.reactor_trip; i++) ridek(eQ, kQ, 10);
    ridek(eQ, kQ, 60);
    var live = (eQ.eng.rpsReport.functions || []).filter(function (f) { return f.kind === 'rps' && f.asserted; });
    ck('the fixture is honest: a trip signal IS standing with the rods seated (lo_pzr_press ' +
       'well under its setpoint), which is the state the manual describes',
       live.length > 0 && eQ.eng.rodSteps === 0 && eQ.eng.sdSteps === 0,
       live.map(function (f) { return f.id + ' ' + (f.value * 145.038).toFixed(0) + ' vs ' +
         (f.setpoint * 145.038).toFixed(0) + ' psia'; }).join(', ') || 'NO SIGNAL — bad fixture');
    var blkQ = kQ.rpsResetBlock(eQ.getInstruments());
    ck('#571: the KERNEL now refuses with TRIP_SIGNAL_PRESENT — the reason the board\'s ' +
       '"TRIP SIGNAL STANDING" caption has been wired for and never received',
       !!blkQ && blkQ.reason === 'TRIP_SIGNAL_PRESENT' && !!blkQ.message,
       blkQ ? blkQ.reason : 'ACCEPTED! (the shipped defect)');
    var rQ = kQ.resetRps();
    ck('...and resetRps() hands back the blocked shape the scanner bar renders, leaving the ' +
       'latch STANDING (pre-fix it cleared and re-latched one 0.1 s step later)',
       !!rQ && rQ.type === 'blocked' && rQ.code === 'INTERLOCK' &&
       rQ.reason === 'TRIP_SIGNAL_PRESENT' && eQ.eng.pt.reactor_trip === true,
       rQ ? (rQ.type + '/' + rQ.reason) : 'null — ACCEPTED');
    var mQ = facReset(eQ);
    ck('...and the FACADE refuses too, naming the channel, its value and its setpoint — the ' +
       'detail a static permissive row cannot carry',
       mQ !== null && /RPS RESET BLOCKED/.test(mQ) && /trip signal is still asserted/.test(mQ) &&
       /Low pressurizer pressure/.test(mQ),
       mQ ? mQ.slice(0, 95) : 'ACCEPTED!');

    /* C. ORDER IS THE MESSAGE: with the rods ALSO out, the trip signal is named first — the
     * kernel's own reasoning, "a breaker will not hold in against a live trip signal ... the
     * most fundamental refusal, so it is checked first". */
    var eR = new SH.PWR2Engine({}), kR = kern(eR);
    ridek(eR, kR, 60);
    eR.applyCommand({ action: 'inject_failure', failure_id: 'failure_to_scram' });
    eR.applyCommand({ action: 'inject_failure', failure_id: 'large_loca', severity: 0.35 });
    for (i = 0; i < 20 && !eR.eng.pt.reactor_trip; i++) ridek(eR, kR, 10);
    ridek(eR, kR, 40);
    var blkR = kR.rpsResetBlock(eR.getInstruments());
    ck('with BOTH permissives failing the trip signal is named FIRST, not rod bottom',
       eR.getInstruments().rods_fully_in === false &&
       eR.getInstruments().no_trip_signal_standing === false &&
       !!blkR && blkR.reason === 'TRIP_SIGNAL_PRESENT',
       'rods_fully_in false, reason ' + (blkR ? blkR.reason : 'null'));

    /* D. IT IS A PERMISSIVE, NOT A WALL — and the release is the operator's own sourced P-11
     * cooldown action, which is also the proof that the GATE is honoured. The derivation reads
     * `asserted`, and `asserted` is already false under a block, so the shell and the kernel's
     * own version agree by construction rather than by a second copy of the gate tests. */
    ck('blocking the low-pressure trip (P-11, the sourced cooldown action) RELEASES the ' +
       'permissive — the derivation honours the gate, so no second copy of the block test',
       (function () {
         eQ.applyCommand({ action: 'set_trip_block', trip_id: 'lo_press', blocked: true });
         ridek(eQ, kQ, 2);
         return eQ.getInstruments().no_trip_signal_standing === true &&
                kQ.rpsResetBlock(eQ.getInstruments()) === null && facReset(eQ) === null;
       })(), 'blocked -> released, reset accepted');
    ridek(eQ, kQ, 5);
    ck('...and it STAYS reset — the pre-fix accepted reset re-latched within one protection step',
       eQ.eng.pt.reactor_trip === false, 'latch ' + eQ.eng.pt.reactor_trip + ' 5 s on');
  })();

  /* ---- 1e-ii. THE AUX FEED COMMAND SURFACE (#541, #562) -------------------------------------
   * THE REACHABILITY CLAIMS, and they live here because the SHELL's registry is what makes a
   * capability reachable. run_pwr2_engine has always proved the two facade doors and passed
   * green while `afw_tdafw` was in NO shell registry — `applyCommand` threw "unknown action",
   * the board's one panel sent `set_afw`, that returned {ok:true}, cleared both actuation
   * latches and secured only the motor-driven pump. Measured on a loss of offsite power: the
   * generator held 52,643 lbm (186.8 % of nominal) one hour AFTER the operator pressed STOP,
   * run lamp lit. A check at the wrong layer (CLAUDE.md trap 4). ---- */
  head('THE AUX FEED COMMAND SURFACE  [#541 per-pump reach, #562 the throttle]');
  (function () {
    var eA = new SH.PWR2Engine({});
    for (i = 0; i < 100; i++) eA.step(0.02);
    eA.applyCommand({ action: 'inject_failure', failure_id: 'loss_of_offsite_power' });
    for (i = 0; i < 6000; i++) eA.step(0.02);
    ck('the actuation starts BOTH pumps [sourced ch10] — the fixture the stop must clear',
       eA.eng.aw.mdafwRunning === true && eA.eng.aw.tdafwRunning === true, '');
    eA.applyCommand({ action: 'set_afw', active: false });
    ck('#541: ONE board STOP secures BOTH pumps — the turbine-driven pump is reachable at all',
       eA.eng.aw.mdafwRunning === false && eA.eng.aw.tdafwRunning === false,
       'md ' + eA.eng.aw.mdafwRunning + ', td ' + eA.eng.aw.tdafwRunning);
    eA.applyCommand({ action: 'set_afw', active: true, pump: 'tdafw' });
    ck('...and the per-pump discriminator reaches ONLY the pump it names [TS Bases B 3.3.2(a), ' +
       '"one switch for each pump"]',
       eA.eng.aw.mdafwRunning === false && eA.eng.aw.tdafwRunning === true, '');
    var badPump = null;
    try { eA.applyCommand({ action: 'set_afw', active: false, pump: 'lpsi' }); }
    catch (ep) { badPump = ep.message; }
    ck('...and an unknown pump name REFUSES out loud rather than silently securing both',
       badPump !== null && /lpsi/.test(badPump), badPump ? badPump.slice(0, 70) : 'accepted!');

    /* #562: the payload key. `pct` is what control_kernel declares, CONTEXT.md names and
     * ui/app.js sends — and the shell read only `c.normalized`, so `{pct: 0}` fell to its
     * `: 1` default, evaluated `1 > 0` = true and RE-ASSERTED the pump. The payload-key
     * mismatch class from #506 / #507 wave 6, on the plant the site runs. */
    eA.applyCommand({ action: 'set_afw', active: true });
    eA.applyCommand({ action: 'set_afw_flow', pct: 0 });
    eA.step(0.02);
    ck('#562: set_afw_flow {pct:0} SHUTS the valve — the declared payload key, which the shell ' +
       'used to ignore in favour of `normalized` (so {pct:0} re-STARTED the pump)',
       eA.getControlState().afw_throttle_pct === 0 &&
       eA.getTrueState().afw_flow_normalized === 0,
       'throttle ' + eA.getControlState().afw_throttle_pct + ' %, delivered ' +
       eA.getTrueState().afw_flow_normalized);
    ck('...and the pumps are still RUNNING behind it — throttling is delivery, not securing ' +
       '(#200); a shut valve that secured them would heal on the next START',
       eA.eng.aw.mdafwRunning === true && eA.eng.aw.tdafwRunning === true &&
       eA.getTrueState().afw_pump_running === true, '');
    eA.applyCommand({ action: 'set_afw_flow', pct: 60 }); eA.step(0.02);
    ck('the readback is the VALVE, in the same currency as the command — it used to be ' +
       '`running ? 100 : 0`, a second name for the run lamp',
       Math.abs(eA.getControlState().afw_throttle_pct - 60) < 1e-9 &&
       Math.abs(eA.getTrueState().afw_flow_normalized - 0.6) < 1e-9, '');
    eA.applyCommand({ action: 'set_afw_flow', normalized: 0.25 }); eA.step(0.02);
    ck('...and the legacy `normalized` key still lands, so nothing that spoke it breaks',
       Math.abs(eA.getControlState().afw_throttle_pct - 25) < 1e-9, '');

    /* THE CHANNEL IS PART OF THE SURFACE: the kernel only runs channels the plant's config
     * lists, and PWR2's getProtectionConfig admits them one at a time by name. */
    var pcA = eA.getProtectionConfig();
    ck('#562: the afw_level channel is in PWR2\'s config, and its command is one PWR2 HAS',
       pcA.channels.filter(function (c) { return c.id === 'afw_level'; }).length === 1 &&
       pcA.channels.filter(function (c) { return c.id === 'afw_level'; })[0]
         .cmd(50).action === 'set_afw_flow',
       'a channel whose cmd the shell REFUSES would throw inside the service tick — the ' +
       'reason every other pwr channel is excluded');
  })();

  /* ---- THE BREAK-SIZE LABEL TELLS THE TRUTH (#580 stage 1) ---------------------------------
   *
   * The slider's unit read "% of a full pipe shear" while severity 1.0 opened 20 cm2 — 0.75 %
   * of this plant's own double-ended cold leg. Nothing in the tree asserted it: grep of test/
   * for "pipe shear" and "Break Size" returned zero, so the label and the plant were free to
   * mean different things for as long as nobody read both.
   *
   * ASSERT THE EFFECT, NOT THE STRING. The unit's number is parsed out and compared against
   * the area the shell ACTUALLY OPENS at severity 1.0, taken off the live break object. A
   * check that merely grepped for the new wording would pass on a rescaled plant with a stale
   * label — the exact defect, one wording later. And the shear reference is computed from
   * pwr2_geometry rather than retyped, so the manual's "0.75 % of a shear" cannot drift either. */
  (function () {
    var meta = globalThis.RD.PWR_CONFIG.protection.failures.large_loca.severity_meta;
    var m = /(\d+(?:\.\d+)?)\s*cm/.exec(meta.unit);
    var eB = new SH.PWR2Engine({});
    for (var i = 0; i < 50; i++) eB.step(0.02);
    eB.applyCommand({ action: 'inject_failure', failure_id: 'large_loca', severity: 1.0 });
    eB.step(0.02);
    var area = eB.eng && eB.eng.brk ? eB.eng.brk.area_m2 : null;
    ck('#580: the Break Size unit states the area severity 1.0 actually opens',
       !!m && area !== null && Math.abs(parseFloat(m[1]) - area * 1e4) < 0.05,
       'unit "' + meta.unit + '" vs ' + (area === null ? 'no break' : (area * 1e4).toFixed(2) + ' cm2 opened'));
    /* the claim the OLD unit made, measured against the geometry it was making it about */
    var G = globalThis.RD.pwr2.geometry;
    var nCL = G.NODES.filter(function (n) { return n.id === 'cold_leg'; })[0];
    var degM2 = 2 * (nCL.V / G.LOOP.cold_leg.L);
    ck('...and it no longer claims a pipe shear, which is 130x larger than what it opens',
       !/shear/i.test(meta.unit) && area !== null && degM2 / area > 100,
       'double-ended cold leg ' + (degM2 * 1e4).toFixed(0) + ' cm2 = ' +
       (degM2 / area).toFixed(0) + 'x the slider top (' + (100 * area / degM2).toFixed(2) + ' % of a shear)');
  })();
  }

  if (grp('F')) {
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
  }

  if (grp('G')) {
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

    /* failure_to_scram — the latch stands, the rods do not move, the plant self-limits.
     * ⚠ A 10 s WINDOW pins the MECHANISM only (#510 M-7 class): the divergence this
     * casualty can reach starts at ~110 s (the dry-SG wedge, #510 H-1) and lives in
     * run_pwr2_endurance's 300 s ride — do not read this check as "the ATWS is survivable". */
    var eS = new SH.PWR2Engine({});
    for (i = 0; i < 100; i++) eS.step(0.02);
    eS.applyCommand({ action: 'inject_failure', failure_id: 'failure_to_scram' });
    eS.applyCommand({ action: 'scram' });
    for (i = 0; i < 500; i++) eS.step(0.02);
    var tsS = eS.getTrueState();
    ck('failure_to_scram MECHANISM (10 s window — the long ride is run_pwr2_endurance\'s): ' +
       'the trip LATCHES (turbine trips with it) while the rods STAY FULLY OUT and the core ' +
       'keeps running — measured 76 % at 10 s, feedback-limited, unscripted',
       eS.eng.pt.reactor_trip === true && eS.eng.rodSteps === bank() &&
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

    /* anticipatory_trip_failure (#515) — the P-9 turbine-trip channel failed: a turbine
     * trip at 100 % leaves the reactor running; the clear re-arms the trip, which then fires
     * on the next step because the turbine is still tripped above P-9 — the wire both ways. */
    var eA = new SH.PWR2Engine({});
    for (i = 0; i < 100; i++) eA.step(0.02);
    eA.applyCommand({ action: 'inject_failure', failure_id: 'anticipatory_trip_failure' });
    eA.applyCommand({ action: 'inject_failure', failure_id: 'turbine_trip' });
    for (i = 0; i < 100; i++) eA.step(0.02);
    var noTripA = eA.eng.pt.reactor_trip === false && eA.eng.tb.tripped === true &&
                  eA.getActiveFailures().indexOf('anticipatory_trip_failure') !== -1;
    eA.applyCommand({ action: 'clear_failure', failure_id: 'anticipatory_trip_failure' });
    eA.step(0.02);
    ck('anticipatory_trip_failure (#515): with the P-9 channel failed a turbine trip at 100 % ' +
       'leaves the reactor RUNNING (2 s), the row reports active, and the clear re-arms the ' +
       'trip — which fires on the next step, turbine still tripped above P-9',
       noTripA && eA.eng.p9Defeated === false && eA.eng.pt.reactor_trip === true &&
       eA.getActiveFailures().indexOf('anticipatory_trip_failure') === -1,
       'no-trip ' + noTripA + ', trip after clear ' + eA.eng.pt.reactor_trip);

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

    /* porv_indicator_stuck_closed — the mirror-only channel: board-layer only, no throw.
     * THE DECEPTION IS THE CLAIM (#510 LOW rebuild): "reads closed" on a healthy plant is
     * healthy-plant-TRUE (the valve IS closed), so the old check's central clause could
     * never fail — the lamp must read "closed" while the valve is GENUINELY OPEN. */
    var eL = new SH.PWR2Engine({});
    for (i = 0; i < 100; i++) eL.step(0.02);
    eL.applyCommand({ action: 'inject_failure', failure_id: 'porv_indicator_stuck_closed' });
    eL.applyCommand({ action: 'inject_failure', failure_id: 'stuck_porv_open' });
    eL.applyCommand({ action: 'open_porv_manual' });   /* the stick is a LATCH: it needs a lift */
    for (i = 0; i < 50; i++) eL.step(0.02);
    var tsL = eL.getTrueState();
    /* ⚠ AND THE DECEPTION CLAUSE IS NOW LOAD-BEARING (#552, 2026-08-28). The rebuild above
     * fixed the wrong half: "closed over a genuinely open valve" was STILL an identity here,
     * because `open_porv_manual` never reached the lamp at all — measured, with this
     * injection REMOVED the lamp read "closed" over porv_open true just the same, so the
     * failure contributed nothing but its own bookkeeping. What separates the deception from
     * the plant is the DEMAND: the operator asked for open, control_state says open, and the
     * lamp still says closed. Remove the injection now and porv_demand's 'open' makes this
     * clause fail, which is what the honest-lamp check below independently proves. */
    var lampOk = eL.instruments.reading.porv_indicator === 'closed' &&
                 tsL.porv_open === true &&
                 eL.getControlState().porv_demand === 'open' &&
                 !!eL.instruments.failed.porv_indicator &&
                 eL.getActiveFailures().indexOf('instrument:porv_indicator') !== -1;
    eL.applyCommand({ action: 'clear_failure', failure_id: 'stuck_porv_open' });
    eL.applyCommand({ action: 'clear_failure', failure_id: 'porv_indicator_stuck_closed' });
    eL.step(0.02);
    ck('porv_indicator_stuck_closed is the TMI-2 lamp: it reads "closed" over a valve that ' +
       'is GENUINELY OPEN (board-layer only — the internal numeric table cannot host a ' +
       'string lamp, mirror-only, declared), reports active, and clears without a throw',
       lampOk && !eL.instruments.failed.porv_indicator &&
       eL.getActiveFailures().indexOf('instrument:porv_indicator') === -1,
       'lamp "closed" over porv_open ' + tsL.porv_open + ' — the deception, not the healthy state');

  /* THE HONEST LAMP (#552) — the case that could not exist before the fix, and the one that
   * makes the deception above mean something. No failure injected: the operator opens the
   * PORV by hand, and the demand-side surfaces must all say so. Shipped behaviour was lamp
   * "closed" / porv_demand "shut" over a 1,145 psi (7.90 MPa) blowdown — a lie for free, on
   * a plant whose instruments were healthy, which also made the Indications pane flag a
   * permanent indicated-vs-true divergence and left the PORV OPEN annunciator dark. */
  var eH = new SH.PWR2Engine({});
  for (i = 0; i < 100; i++) eH.step(0.02);
  eH.applyCommand({ action: 'open_porv_manual' });
  for (i = 0; i < 50; i++) eH.step(0.02);
  var tsH = eH.getTrueState(), csH = eH.getControlState();
  ck('a hand-opened PORV reaches the LAMP and the demand readback — no failure injected, ' +
     'so nothing here is allowed to lie',
     eH.instruments.reading.porv_indicator === 'open' && csH.porv_demand === 'open' &&
     tsH.porv_open === true && !eH.instruments.failed.porv_indicator,
     'lamp ' + eH.instruments.reading.porv_indicator + ', porv_demand ' + csH.porv_demand +
     ', truth ' + tsH.porv_open + ' — shipped: closed / shut / true');
  ck('porv_demand speaks the CONTRACT\'s words ("open" | "closed", §6.3), not "shut"',
     csH.porv_demand === 'open' &&
     new SH.PWR2Engine({}).getControlState().porv_demand === 'closed',
     'a shut valve reads "' + new SH.PWR2Engine({}).getControlState().porv_demand +
     '" — the retired plant and WIRING_REFERENCE both say "closed"');

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
  }

  if (grp('H')) {
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
    /* RE-AIMED 2026-08-31 (#524): cold_shutdown exists — the refusal claim keeps its
     * mechanism on a name no registry carries, and the new preset's round trip is asserted. */
    var thrIC = false;
    try { new SH.PWR2Engine({ initial_state: '5_percent' }); }
    catch (e2) { thrIC = /unknown initial_state/.test(e2.message); }
    ck('a preset the engine does not carry throws through the class too — the #502 rule ' +
       '(an accepted-then-ignored preset is a menu that lies)', thrIC === true, '');
    (function () {
      var e5 = new SH.PWR2Engine({ initial_state: 'cold_shutdown' });
      var t5 = e5.step(DT);            /* the class step returns the true state directly */
      ck('cold_shutdown boots THROUGH THE CLASS at Mode 5 (#524) — the picker\'s fifth row ' +
         'is a state the plant actually loads',
         t5.plant_mode === 5 && Math.abs(t5.tavg_c - 50) < 2, 'mode ' + t5.plant_mode +
         ' at ' + (t5.tavg_c * 9 / 5 + 32).toFixed(1) + ' degF');
      /* THE COLD BOARD SHOWS A SHUT ORIFICE LINEUP **AND** LETDOWN FLOWING (#624 items 14/25).
       * That pair is the whole split at the surface: the orifices are OUT (the source's own
       * shutdown lineup) while the RHR cross-connect carries the flow, so a board built on
       * `letdownOpen x rated` painted 0 gpm on a plant passing the full normal magnitude. */
      var cs5 = e5.getControlState();
      ck('the cold board shows the orifices OUT and letdown STILL FLOWING (the cross-connect)',
         cs5.letdown_orifice_a === false && cs5.letdown_orifice_b === false &&
         cs5.letdown_flow_normalized > 0 && cs5.letdown_isolated === false,
         'A ' + cs5.letdown_orifice_a + ' / B ' + cs5.letdown_orifice_b + ', flow ' +
         (cs5.letdown_flow_normalized * 450000).toFixed(2) + ' gpm — the lineup-derived form ' +
         'read 0.00 gpm here');
    })();

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
    /* ⚠ THE EXAMPLE HAD TO MOVE (#601). This used `ir_high` as "a trip this RPS does not
     * carry" — true when it was written, and false the moment the intermediate-range trip was
     * built. `lo_flow` is the honest example now and a better one: the plant DOES carry that
     * trip, it simply has no OPERATOR block for it, because WTSM 12.2 §12.2.3.12 makes the
     * low-flow block automatic below P-7. A refusal must distinguish "no such trip" from "not
     * yours to block", and the message names what IS blockable rather than what is not. */
    var rNo = kl.handleCommand({ action: 'set_trip_block', trip_id: 'lo_flow', blocked: true });
    ck('...and a block this RPS does not give the OPERATOR comes back as a REASONED error, ' +
       'not a silence',
       rNo && rNo.type === 'error' && /low-flux/.test(rNo.message) &&
       /intermediate-range/.test(rNo.message), rNo ? rNo.message : 'no error at all');
    /* AND THE ONE IT DOES CARRY NOW LANDS — the flip side, or the check above passes on a
     * plant with no intermediate-range block at all (the absence-that-pins-a-non-event trap). */
    var rIr = kl.handleCommand({ action: 'set_trip_block', trip_id: 'ir_high', blocked: true });
    var irReq = eB.eng.pt.blockIrHigh;
    ck('...while the INTERMEDIATE RANGE block IS the operator action, and reaches the engine (#601)',
       rIr === null && irReq === true &&
       rps0.trip_block_status.ir_high && rps0.trip_block_status.ir_high.setpoint === 25,
       'request ' + irReq + ', published setpoint ' +
       (rps0.trip_block_status.ir_high ? rps0.trip_block_status.ir_high.setpoint : 'ABSENT'));
  })();
  }

  if (grp('I')) {
  /* ---- 1i. THE ROD INSERTION LIMIT SURFACES (#507 §B, wave 8) ------------------------------- */
  head('THE ROD LIMIT SURFACES  [live control-state fields, the margin channel, the 10-step row]');
  (function () {
    var eR = new SH.PWR2Engine({});
    /* ⚠ 4 s WAS INSIDE THE INITIAL-CONDITION TRANSIENT, and the check was passing on its edge.
     * The rod insertion limit is a straight function of power, so sampling before the plant has
     * settled samples the boot ramp: measured 2026-08-28, the DRY plant reads RIL 137 at 4 s —
     * the bottom of this check's own 137-141 band — climbing through 138 at 20 s to 139 at 60 s
     * where it stays. #574's metal walls lengthen that ramp slightly (97.19 % against 97.47 % at
     * 4 s) and took it to 136, one step under.
     * The band was never the problem: 60 s reads 139 on BOTH plants, mid-band, which is what
     * "the LIVE limit, ~139 steps" was always meant to be about. A settled plant is the subject. */
    for (var i = 0; i < 3000; i++) eR.step(0.02);
    var gs = eR.getControlState().rod_groups;
    ck('the control group carries the LIVE limit (a ~70 %-withdrawn floor, not at limit) and ' +
       'the shutdown group stays exempt (its evolutions are deliberate)',
       /* THE LIMIT IS A PERCENTAGE (#602) — RIL is (lo + (hi-lo)*f)/100 * BANK and always
        * was. 137-141 was 69 % of a 200-step bank written as steps. */
       gs[0].insertion_limit_steps >= frac(0.685) && gs[0].insertion_limit_steps <= frac(0.705) &&
       gs[0].at_insertion_limit === false &&
       gs[1].insertion_limit_steps === null && gs[1].at_insertion_limit === false,
       'RIL ' + gs[0].insertion_limit_steps + ' (' +
       (100 * gs[0].insertion_limit_steps / bank()).toFixed(1) + ' % of ' + bank() + ')');
    ck('the board layer\'s rod_limit_margin channel tracks the engine (was pinned at its ' +
       '912 default)',
       Math.abs(eR.instruments.reading.rod_limit_margin - eR.eng._rodLimitMargin) < 1e-9 &&
       eR.instruments.reading.rod_limit_margin < frac(0.5),
       'margin ' + eR.instruments.reading.rod_limit_margin);
    var rowLO = (eR.getProtectionConfig().alarms || []).filter(function (a) {
      return a.id === 'rod_limit_approach';
    })[0];
    ck('ROD LIMIT LO alarms at the sourced RIL+10 in THIS bank\'s own steps — the shared ' +
       'row\'s 40 is the same physical number in pwr1\'s fine-step currency (4 fine/step)',
       rowLO && rowLO.setpoint === 10, 'setpoint ' + (rowLO && rowLO.setpoint));
  })();
  }

  if (grp('J')) {
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
  }

  if (grp('K')) {
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
  }

  if (grp('A')) {
  /* ---- THE HEATER CURRENCY (#538) — set and get must speak the same units ------------------
   * The board's percent box is ONE widget: `set` sends power_pct, `get` reads
   * heater_power_pct. When those disagree the control fights its own indication, and its
   * MANUAL button — which captures the readback as the new demand — becomes a ratchet.
   * Shipped: type 40 %, read back 9.2 %, and four MANUAL presses walked 14.45 kW to 0.04 kW.
   * The round trip is asserted at a value that is neither 0 nor 100 on purpose: 100 was the
   * one point that round-tripped correctly, by accident of a `=== 1` special case, and it is
   * exactly the value the pre-existing checks in this suite happened to use. */
  head('THE HEATER CURRENCY  [one widget, one currency — the round trip is the claim]');
  var eHC = new SH.PWR2Engine({});
  for (i = 0; i < 100; i++) eHC.step(0.02);
  eHC.applyCommand({ action: 'set_heater', power_pct: 37 });
  for (i = 0; i < 25; i++) eHC.step(0.02);
  var hc1 = eHC.getControlState().heater_power_pct;
  ck('what the board types is what the board reads back (37 %, not 0 and not 100)',
     Math.abs(hc1 - 37) < 1e-9,
     'set 37 % -> read ' + hc1.toFixed(3) + ' % (shipped: 8.53 %, a 4.34x prop-bank/total split)');
  /* the MANUAL button, reproduced exactly: pwr_board_wiring re-sends the READBACK as demand */
  eHC.applyCommand({ action: 'set_heater', power_pct: eHC.getControlState().heater_power_pct });
  for (i = 0; i < 25; i++) eHC.step(0.02);
  var hc2 = eHC.getControlState().heater_power_pct;
  eHC.applyCommand({ action: 'set_heater', power_pct: eHC.getControlState().heater_power_pct });
  for (i = 0; i < 25; i++) eHC.step(0.02);
  var hc3 = eHC.getControlState().heater_power_pct;
  ck('pressing MANUAL is a FIXED POINT, not a ratchet — the capture cannot walk the bank down',
     Math.abs(hc2 - 37) < 1e-9 && Math.abs(hc3 - 37) < 1e-9,
     '37 -> ' + hc2.toFixed(3) + ' -> ' + hc3.toFixed(3) + ' % (shipped: 37 -> 8.53 -> 1.97)');
  /* the SECOND caller of the same set path — the automation's disengage, whose own hint
   * promises "Manual = both freeze at their current output" */
  var eBL = new SH.PWR2Engine({});
  for (i = 0; i < 200; i++) eBL.step(0.02);
  var blAuto = eBL.getTrueState().pzr_heater_kw;
  eBL.applyCommand({ action: 'set_heater', power_pct: eBL.getControlState().heater_power_pct });
  for (i = 0; i < 100; i++) eBL.step(0.02);
  ck('the AUTO -> MANUAL hand-back is BUMPLESS, which is what pwr_control\'s own hint promises',
     Math.abs(eBL.getTrueState().pzr_heater_kw - blAuto) < 0.5,
     'heaters ' + blAuto.toFixed(3) + ' -> ' + eBL.getTrueState().pzr_heater_kw.toFixed(3) +
     ' kW across the transfer (shipped: 36.400 -> 8.397)');
  /* ⚠ AND THE ROUND TRIP MUST SURVIVE AN UNCOVERED BANK (#573). The two checks above run at
   * program level, where the heater elevation derate is inert — so they would pass against a
   * plant that published DELIVERED power and walked the demand down the moment the bank went
   * partly dry. That is #538 arriving by a new road, and the only probe that can see it is one
   * standing where the derate bites. The level channel is stuck HIGH so the 17 % bistable does
   * not fire and take the heaters out from under the test. */
  var eUC = new SH.PWR2Engine({});
  for (i = 0; i < 100; i++) eUC.step(0.02);
  eUC.applyCommand({ action: 'set_instrument_failure', instrument_id: 'pzr_level',
                     mode: 'stuck', value: 55 });
  /* Drop the TRUE level into the band by scaling the vessel's LIQUID MASS — the shortest path
   * to the state; draining through the CVCS would take plant-minutes and would measure the
   * charging controller instead of the currency. ⚠ NOT by assigning `pz.V_liq`: that is DERIVED
   * from the masses at the end of every step, so the assignment survives one step and the check
   * silently reverts to measuring a covered bank. The wetted fraction is asserted below, not
   * assumed, for exactly that reason. */
  var PZM = globalThis.RD.pwr2.pressurizer, band = PZM.HEATERS;
  var midPct = (band.elev_bot_pct + band.elev_top_pct) / 2;
  eUC.applyCommand({ action: 'set_heater', power_pct: 40 });
  for (i = 0; i < 25; i++) eUC.step(0.02);
  var ratio = midPct / (100 * eUC.eng.pz.V_liq / PZM.GEOM.V_pzr_m3);
  eUC.eng.pz.m_sub *= ratio; eUC.eng.pz.m_sat *= ratio;
  /* ⚠ ADVANCE UNTIL IT ARRIVES, and assert THERE. The state does not hold: taking the liquid
   * out drops RCS pressure, the subcooled loop expands and the vessel refills within a couple
   * of steps (a pressurizer genuinely sitting in the heater band means a genuinely drained
   * RCS — the LOCA regime, far more plant than this seam needs). A fixed step count would rot
   * the moment the propagation delay changed; this fails loudly if it never arrives. */
  var uc1 = null, ucWet = 1;
  for (i = 0; i < 20 && uc1 === null; i++) {
    eUC.step(0.02);
    if (eUC.eng._pzr.heater_wetted_frac < 0.9) {
      ucWet = eUC.eng._pzr.heater_wetted_frac;
      uc1 = eUC.getControlState().heater_power_pct;
    }
  }
  ck('...the bank really does uncover (the premise, MEASURED — the level is derived state)',
     uc1 !== null && ucWet > 0.05 && ucWet < 0.9,
     'wetted ' + ucWet.toFixed(3) + (uc1 === null ? ' — NEVER REACHED' : ''));
  ck('...and the readback is STILL 40 % with the bank part uncovered — the gauge is electrical',
     uc1 !== null && Math.abs(uc1 - 40) < 1e-9,
     'set 40 % -> reads ' + (uc1 === null ? '?' : uc1.toFixed(3)) + ' % at wetted ' +
     ucWet.toFixed(3) + '; publishing DELIVERED power here would read ' +
     (40 * ucWet).toFixed(1) + ' %, and the MANUAL capture would shrink it again every press');
  /* Read here, not from the module-level SHSRC — that is assigned AFTER runSuite returns.
   * COMMENTS ARE STRIPPED FIRST: the fix's own comment names the retired literal, and a scan
   * that cannot tell prose from code would forbid explaining what was fixed. */
  var shCode = fs.readFileSync(path.join(SRC, 'pwr2_shell.js'), 'utf8')
                 .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  /* the manual's own documented payload key, which the plant was dropping — the Mode 1
   * pressure-control procedure sends {open:true} and used to get AUTO for it */
  var eSO = new SH.PWR2Engine({});
  for (i = 0; i < 50; i++) eSO.step(0.02);
  eSO.applyCommand({ action: 'set_spray', open: true });
  var soOpen = eSO.getControlState().spray_auto === false;
  eSO.applyCommand({ action: 'set_spray', open: false });
  for (i = 0; i < 5; i++) eSO.step(0.02);
  ck('set_spray reads the {open} key Manuals/03 documents — it does not silently mean AUTO',
     soOpen && eSO.getControlState().spray_auto === false,
     '{open:true} -> manual demand (spray_auto false), {open:false} -> manual zero; shipped: ' +
     'both fell through to null and re-selected AUTO');
  ck('the total bank capacity is DERIVED in code, never a second typed copy of the constants',
     shCode.indexOf('157.8') === -1,
     'the literal 157.8 is prop_kW + backup_kW written down twice — the cadence failure mode');

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
  /* THE CIRCULATING-WATER SINK (#591 item 1) — the door built after the owner's playtest found
   * the box did nothing. It is checked HERE, at the shell, because the defect was never in the
   * physics: pwr2_condenser has computed the vacuum from this temperature since it was written,
   * and the action sat in REFUSED carrying the RETIRED plant's reason. So the claim is the WIRE
   * and the CLAMP, and the assertion is the EFFECT (a landed field is the dark-wire shape #540
   * shipped). Measured through this door, hot full power: 50 degF -> 2.400 in Hg, 92 -> 7.442,
   * 93 -> the C-9 removal turbine trip. */
  (function () {
    var cwE = new SH.PWR2Engine({ initial_state: 'hot_full_power' });
    var f2cL = function (f) { return (f - 32) * 5 / 9; };
    var base = run(cwE, 200).condenser_vacuum_kpa;
    cwE.applyCommand({ action: 'set_condenser_cw_temp', c: f2cL(90) });
    var warm = run(cwE, 200).condenser_vacuum_kpa;
    ck('set_condenser_cw_temp MOVES THE VACUUM (not just a landed field)',
       base - warm > 10,
       'design 50 degF ' + base.toFixed(2) + ' kPa -> 90 degF ' + warm.toFixed(2) + ' kPa');
    cwE.applyCommand({ action: 'set_condenser_cw_temp', c: f2cL(500) });
    var CDmod = globalThis.RD.pwr2.condenser;
    ck('...and the shell CLAMPS to the condenser’s own band, never its own copy of it',
       Math.abs(cwE.eng.cd.cw_inlet_c - f2cL(CDmod.COND.cw_max_f)) < 1e-9,
       'asked 500 degF, landed ' + (cwE.eng.cd.cw_inlet_c * 9 / 5 + 32).toFixed(1) + ' degF');
    cwE.applyCommand({ action: 'set_condenser_cw_temp', c: null });
    ck('...and a null payload leaves the sink where it was rather than clamping it to a bound',
       Math.abs(cwE.eng.cd.cw_inlet_c - f2cL(CDmod.COND.cw_max_f)) < 1e-9, '');
    var csCw = cwE.getControlState();
    /* The band must come from the MODULE, never be retyped here or in the board — that is the
     * whole #557 law. It happens to be the same 35-85 degF the retired engine clipped to, and
     * that is not an inherited constant: the ceiling is sourced (Ginna TS Bases B 3.7.8) and the
     * floor is a standing owner directive. So the claim is PROVENANCE, not a different number. */
    ck('the control state publishes the sink AND its band, read from the condenser module',
       Math.abs(csCw.cw_inlet_temp_c - cwE.eng.cd.cw_inlet_c) < 1e-12 &&
       csCw.cw_inlet_range_c && csCw.cw_inlet_range_c.length === 2 &&
       Math.abs(csCw.cw_inlet_range_c[0] - f2cL(CDmod.COND.cw_min_f)) < 1e-9 &&
       Math.abs(csCw.cw_inlet_range_c[1] - f2cL(CDmod.COND.cw_max_f)) < 1e-9,
       'band ' + csCw.cw_inlet_range_c.map(function (c) { return (c * 9 / 5 + 32).toFixed(0); }).join('-') +
       ' degF, taken from pwr2_condenser.COND rather than restated');
    ck('...and `condenser_cw_temp_fixed` is GONE — the flag that darkened the box',
       csCw.condenser_cw_temp_fixed === undefined, '');
  })();
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
  }

  if (grp('S')) {
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

  /* ---- THE RESTORE, AS THE SERVICE ACTUALLY DOES IT (#553/#554/#555/#548/#563 item 3) ------
   * Everything above reloads into the SAME instance, at hot_full_power, on a settled fixture.
   * SimulationService._restore does none of those three: it builds a FRESH shell, and a
   * player can start on any of four presets. Five defects lived in that gap, all invisible
   * to a green 77-check gate. Each check below is written against the FRESH-instance,
   * non-hot-full-power path, because that is the path the plant is restored on. */
  head('THE RESTORE  [a FRESH shell, and a preset that is not Hot Full Power]');
  var SET4 = quiet ? 60 : 120;
  var m4 = new SH.PWR2Engine({ initial_state: 'hot_shutdown' });
  run(m4, SET4);
  var s4 = m4.saveState();

  /* #555 — JSON writes a non-finite reading out as null and isFinite(null) is TRUE, so a
   * restored channel read as a hard ZERO that the three-element feed controller's flow element
   * accepted: a standing -0.0750 error that drove the regulating valve shut. The save NAMES
   * the non-finite ids; the load puts the NaN back. Asserted BEFORE any step — the instrument
   * guard re-latches a stray null on the next update, and a check that stepped first would
   * pass over a broken save.
   *
   * THE NaN IS INJECTED, not borrowed from the fixture (re-written 2026-08-27, #539). This
   * check used to lean on Mode 4 carrying a permanently-NaN `steam_flow`, which it did only
   * because that preset's rated_steam was 0 and pwr2_true_state's truthiness guard therefore
   * never published the driver. #539 froze the scale, the driver came back, the preset has no
   * dead channel left — and the check went red on a plant that got BETTER. A regression pin
   * must assert its own mechanism, not depend on some preset happening to be broken. */
  var m4nan = new SH.PWR2Engine({ initial_state: 'hot_shutdown' });
  run(m4nan, quiet ? 30 : 60);
  m4nan.eng.ins.reading.steam_flow = NaN;                /* a channel that lost its driver */
  var sNan = m4nan.saveState();
  var nf = (sNan.state.ins && sNan.state.ins.nonFinite) || [];
  var jsonRT = JSON.parse(JSON.stringify(sNan));         /* the file path, byte for byte */
  var fresh4 = new SH.PWR2Engine({});                    /* what _restore always constructs */
  fresh4.loadState(jsonRT);
  var rSF = fresh4.eng.ins.reading.steam_flow;
  ck('a non-finite reading is NAMED in the save and comes back NaN — not the 0 a JSON null reads as',
     nf.indexOf('steam_flow') >= 0 &&
     jsonRT.state.ins.reading.steam_flow === null &&      /* JSON really did destroy it */
     typeof rSF === 'number' && isNaN(rSF),
     'nonFinite ' + JSON.stringify(nf) + ', JSON carried ' +
     jsonRT.state.ins.reading.steam_flow + ', restored ' + rSF);
  fresh4.loadState(s4);                                  /* back to the plain Mode 4 save */

  /* #563 item 3 — rated_steam is every normalization's denominator and M_nominal is
   * core_inventory_pct's. Both are IC-derived and the service rebuilds at hot_full_power, so
   * before the fix a Mode 4 restore wore Hot Full Power's constants over its own saved mass:
   * M_nominal 19,889 -> 16,337 kg (43,849 -> 36,016 lb; 23,234 -> 18,876 before #583 took the
   * phantom pressurizer node out of both) and the CORE INVENTORY indication
   * stepped 100.0 -> 123.1 % on a rewind that moved true mass -0.7 kg (-1.5 lb). */
  /* THE DISCRIMINATOR IS M_nominal (re-pointed 2026-08-27, #539). It was rated_steam, on the
   * reasoning that Mode 4's scale differed from Hot Full Power's — true then, and it is the
   * whole point of #539 that it is no longer: the rated scale is now FROZEN, one number for
   * every preset, so "differs from the constructor's" stopped discriminating anything.
   * M_nominal is the constant that legitimately varies by preset (a cold plant holds more
   * water: 19,889 kg / 43,849 lb against 16,337 kg / 36,016 lb hot), so it is what proves the
   * restore wore the SAVED plant's constants rather than the fresh one's. rated_steam stays in
   * the equality arms — it must still ride the save, it just cannot tell the two apart. */
  var hfpNominal = new SH.PWR2Engine({}).eng.M_nominal;
  var invBefore = m4.getTrueState().core_inventory_pct;
  var invAfter = fresh4.getTrueState().core_inventory_pct;
  ck('the initial-condition SCALES ride the save — a restore wears the SAVED plant\'s constants',
     fresh4.eng.rated_steam === s4.state.scalars.rated_steam &&
     fresh4.eng.M_nominal === s4.state.scalars.M_nominal &&
     Math.abs(fresh4.eng.M_nominal - hfpNominal) > 1000 &&
     Math.abs(invAfter - invBefore) < 0.1,
     'M_nominal ' + fresh4.eng.M_nominal.toFixed(1) + ' kg (a fresh hot shell would be ' +
     hfpNominal.toFixed(1) + '), rated_steam ' + fresh4.eng.rated_steam.toFixed(4) +
     ', core inventory ' + invBefore.toFixed(3) + ' -> ' + invAfter.toFixed(3) + ' %');

  /* the whole restore, end to end: the same save, run forward in both plants. Feed-valve
   * position is IN the sample because it is what the two defects above actually moved. */
  var N4 = quiet ? 250 : 500, A4 = [], B4 = [];
  var m4b = new SH.PWR2Engine({ initial_state: 'hot_shutdown' });
  run(m4b, SET4);
  var s4b = m4b.saveState();
  for (i = 0; i < N4; i++) { var t4a = m4b.step(DT);
    A4.push([t4a.pressure_mpa, t4a.tavg_c, t4a.pzr_level_pct, m4b.eng.fw.valve,
             m4b.getInstruments().sg_level].join('|')); }
  var m4c = new SH.PWR2Engine({});
  m4c.loadState(s4b);
  for (i = 0; i < N4; i++) { var t4b = m4c.step(DT);
    B4.push([t4b.pressure_mpa, t4b.tavg_c, t4b.pzr_level_pct, m4c.eng.fw.valve,
             m4c.getInstruments().sg_level].join('|')); }
  var d4 = -1; for (i = 0; i < N4; i++) { if (A4[i] !== B4[i]) { d4 = i; break; } }
  ck('Mode 4, Hot Shutdown -> save -> load into a FRESH shell -> ' + N4 +
     ' steps: BIT-EXACT, feed valve included',
     d4 === -1,
     d4 === -1 ? 'feed valve ' + (+B4[N4 - 1].split('|')[3]).toFixed(6) + ' both sides'
               : 'first divergence at step ' + d4 + ': ' + A4[d4] + '  vs  ' + B4[d4]);

  /* #548 — TWO smoothers share the name _pwrRate. The one in `scalars` is the inner engine's;
   * the SHELL's own is the only driver of the board instrument layer's shrink-and-swell term,
   * and it was never saved. The fixture is a save taken 1.0 s into a scram because that is
   * where the term is load-bearing: a settled plant has _pwrRate ~0 and cannot tell the two
   * builds apart. Measured before the fix: 7.4771 points of narrow range HIGH — optimistic —
   * at t+2.44 s. After: 0.000000. */
  var SETP = quiet ? 120 : 300, NP = quiet ? 200 : 400;
  var pa = new SH.PWR2Engine({});
  run(pa, SETP);
  pa.applyCommand({ action: 'scram' });
  run(pa, 1.0);
  var rateAtSave = pa._pwrRate;
  var pb = new SH.PWR2Engine({});
  pb.loadState(pa.saveState());
  var rateAfterLoad = pb._pwrRate;      /* read it HERE — the ride below moves both copies */
  var worstSg = 0, worstAt = 0;
  for (i = 0; i < NP; i++) {
    pa.step(DT); pb.step(DT);
    var errSg = Math.abs(pa.getInstruments().sg_level - pb.getInstruments().sg_level);
    if (errSg > worstSg) { worstSg = errSg; worstAt = (i + 1) * DT; }
  }
  ck('the BOARD layer\'s shrink-and-swell driver survives a restore taken inside a scram',
     Math.abs(rateAfterLoad - rateAtSave) < 1e-9 && worstSg < 0.5,
     '_pwrRate ' + rateAtSave.toFixed(4) + ' %/s at the save, ' + rateAfterLoad.toFixed(4) +
     ' after the load; worst sg_level error ' + worstSg.toFixed(6) +
     ' % NR at t+' + worstAt.toFixed(2) + ' s');

  /* THE MIGRATION, asserted rather than asserted-in-prose. Four fields joined pwr2-1.0 in the
   * #534 save-path cluster and each is documented as absent-tolerant; that is a claim, and a
   * claim about a save format is exactly the kind that rots silently — nothing else in the
   * tree reads an old payload. Strip all four and load: it must not throw, the constants must
   * land on the CONSTRUCTOR's values (the pre-fix behaviour, not a zero), and the plant must
   * step. Same shape as the #511 and #515 migrations above, which have no such check. */
  var mg = new SH.PWR2Engine({});
  run(mg, quiet ? 60 : 120);
  var old = mg.saveState();
  delete old.state.shell;
  delete old.state.ins.nonFinite;
  delete old.state.scalars.rated_steam;
  delete old.state.scalars.M_nominal;
  var mgB = new SH.PWR2Engine({}), mgThrew = '';
  try { mgB.loadState(old); } catch (e) { mgThrew = e.message; }
  var ctorRated = new SH.PWR2Engine({}).eng.rated_steam;
  var mgRate = mgB._pwrRate;          /* AT the load — the ride below moves it (see above) */
  var tsMg = mgThrew ? null : run(mgB, 10);
  ck('a PRE-CLUSTER pwr2-1.0 save still loads, on the constructor\'s values',
     !mgThrew && mgB.eng.rated_steam === ctorRated && mgRate === 0 &&
     !!tsMg && isFinite(tsMg.pressure_mpa) && isFinite(mgB.getInstruments().tavg),
     mgThrew ? 'THREW: ' + mgThrew
             : 'rated_steam ' + mgB.eng.rated_steam.toFixed(4) + ', _pwrRate 0, plant at ' +
               (tsMg.pressure_mpa * 145.038).toFixed(1) + ' psia after 10 s');

  /* #544: a PRE-AIR-LEDGER save carries the containment ledger water-only under its old name.
   * Hand-build that shape (the rename makes it detectable), load, and require the SAME
   * containment temperature on the next step — the migration reconstructs the total at the
   * saved T, so continuity is exact, not approximate. Without the air term the migrated
   * plant re-solves ~90 degF hot on a mid-blowdown state. */
  var cg = new SH.PWR2Engine({});
  cg.applyCommand({ action: 'inject_failure', failure_id: 'primary_leak', severity: 0.5 });
  run(cg, quiet ? 30 : 60);
  var cgSave = cg.saveState();
  var cgT0 = cg.getTrueState().containment_temp_c;
  var cgCt = cgSave.state.ctm;
  cgCt.U_water_kJ = cgCt.U_total_kJ -
                    cgCt.m_air * 0.718 * (cgCt.T_c + 273.15);  /* the old water-only ledger */
  delete cgCt.U_total_kJ;
  var cgB = new SH.PWR2Engine({});
  cgB.loadState(cgSave);
  var cgT1 = cgB.step(DT).containment_temp_c;
  ck('a PRE-AIR-LEDGER containment save migrates onto the SAME temperature',
     Math.abs(cgT1 - cgT0) < 0.5 && cgB.eng.ctm.U_total_kJ !== undefined &&
     cgB.eng.ctm.U_water_kJ === undefined,
     'saved ' + (cgT0 * 9 / 5 + 32).toFixed(1) + ' degF, migrated re-solves ' +
     (cgT1 * 9 / 5 + 32).toFixed(1) + ' degF (air term dropped: ~+90 degF)');
  }

  if (grp('T')) {
  /* ---- 5. THE AFW THROTTLE ON A REAL POST-TRIP DRAIN (#582 item 2) ---------------------------
   * #562 landed the flow control valves and the afw_level channel SHIPS ENGAGED; #391's question
   * — is the auxiliary-feed delivery floor derived, or a fixture? — moved to that channel the
   * day it landed, and nothing exercised it in AUTO on a falling level. MEASURED first
   * (2026-08-29, the 30-min decay-heat drain): level falls through the 38 -> 28 % band with the
   * channel opening 0 -> 0.64 -> 1.00 ahead of the pumps; AFAS starts both pumps at lo-lo; full
   * flow recovers the level into the band; and the channel settles at ~36 % NR holding
   * ~0.41-0.46 of rated — which is exactly ff 100 + kp 20 against the decay-heat boil-off,
   * i.e. THE FLOOR IS DERIVED (the P-controller's line meets the boil-off), not a fixture.
   * This fixture shortens the wait by draining at POWER: feed isolated, the boil-off at
   * 300 MWt crashes the level, sg_lolo trips the reactor and starts the pumps for real. */
  head('THE AFW THROTTLE  [#582: full channel runtime on a real drain — the floor is DERIVED]');
  (function () {
    var eT = new SH.PWR2Engine({});
    var layT = new globalThis.RD.ControlLayer(eT, eT.getProtectionConfig());
    layT.engageDefaults();
    function runAuto(secs) {
      var out = null;
      for (var i = 0; i < Math.round(secs / DT); i++) {
        layT.stepAutomation(DT); out = eT.step(DT);
      }
      return out;
    }
    runAuto(10);
    /* trip, isolate main feed, and start BOTH pumps by hand — the drain then approaches the
     * band from ABOVE at decay heat, which is the regime where every claim below is live at
     * once: valve shut above the band with the pumps running, taper across it, settle where
     * the controller's line meets the boil-off. (The AFAS-start variant of this fixture was
     * measured too — the deep drain recovers railed for 15+ min and asserts less.) */
    eT.applyCommand({ action: 'scram' });
    eT.applyCommand({ action: 'isolate_feedwater', value: true });
    eT.applyCommand({ action: 'set_afw', on: true });
    var t = 0, worstFlowAbove = 0, sawAbove = false, sawTaper = false, ts = null;
    while (t < 1100) {
      layT.stepAutomation(DT); ts = eT.step(DT); t += DT;
      var lvl = eT.getInstruments().sg_level;
      /* 20 s of grace for the controller's first periods, then: above the band the pumps run
       * and the VALVE holds the delivery at zero — throttling is not securing (#562) */
      if (t > 20 && lvl > 40 && ts.afw_pump_running) {
        sawAbove = true;
        if (ts.afw_flow_normalized > worstFlowAbove) worstFlowAbove = ts.afw_flow_normalized;
      }
      if (lvl < 37.5 && lvl > 33 && ts.afw_flow_normalized > 0.02 &&
          ts.afw_flow_normalized < 0.98) sawTaper = true;
    }
    var lvlEnd = eT.getInstruments().sg_level, flowEnd = ts.afw_flow_normalized;
    ck('above the band the pumps RUN and the valve delivers NOTHING — throttled shut, not secured',
       sawAbove && worstFlowAbove < 0.05 && ts.afw_pump_running === true,
       'max delivered above 40 % NR: ' + worstFlowAbove.toFixed(3) + ' of rated');
    ck('the delivery TAPERS across the sourced 33 +/- 5 % NR band — a ramp, not a step',
       sawTaper, 'partial flow observed inside the band on the way down');
    ck('the drain settles INSIDE the band with the flow throttled off both rails — the ' +
       'delivered floor is DERIVED (the kp 20 / ff 100 line meets decay-heat boil-off), ' +
       'not a fixture (#391\'s question, answered)',
       lvlEnd > 28 && lvlEnd < 40 && flowEnd > 0.1 && flowEnd < 0.9,
       'level ' + lvlEnd.toFixed(1) + ' % NR, flow ' + flowEnd.toFixed(2) +
       ' of rated (measured 0.41-0.46 at the 30-min settle of the AFAS variant)');
  })();
  }
}

console.log('\nPWR2 -- THE SHELL CLASS (Option B stage B2): the surface the stack holds');
var rec = [];
runSuite(loadAll(), rec, false);
var pass = rec.filter(function (r) { return r.ok; }).length, fail = rec.length - pass;

var SHSRC = fs.readFileSync(path.join(SRC, 'pwr2_shell.js'), 'utf8').replace(/\r\n/g, '\n');
/* Each entry's trailing { grp } names the section group that can SEE it (#513) — the replay
 * runs only that group, and the BLIND check still reds the runner if the tag is wrong. */
var NL_ = '\n';   /* the two-char escape a multi-line anchor needs */
var MUTATIONS = [
  /* THE LETDOWN SURFACE (#624 items 14/25). The first is the SHIPPED form restored: a board
   * flow derived from the operator's LINEUP rather than from what the plant stepped. It reads
   * 0 gpm on a cold plant passing the full normal magnitude through the RHR cross-connect, and
   * it would read normal through a 17 % protective isolate — wrong in both directions, and
   * invisible while every fixture booted with the orifices already in. */
  ['the board derives letdown flow from the LINEUP again (a cold plant reads 0 gpm while ' +
   'passing full letdown)',
   '      letdown_flow_normalized: RD.cvcs.kgsToGpm(e._letdownKgs || 0) / 450000,',
   '      letdown_flow_normalized: e.cv.letdownOpen *\n                               (RD.cvcs.CVCS.charging_normal_gpm() + RD.cvcs.sealInjectionGpm()) / 450000,',
   { grp: 'H' }],
  ['control_state loses the protective isolate (a shut lineup and an isolated plant look ' +
   'identical on the two lamps)',
   '      letdown_isolated: e.cv.letdownIsolated === true,', '', { grp: 'A' }],
  /* #591 item 1 — the circulating-water sink. TWO anchors because the halves fail separately:
   * sever the door and the vacuum stops answering (the defect the owner actually found), while
   * publishing the RETIRED plant's band leaves the sink working but puts the C-9 removal point
   * outside the box the player types into — a control that works everywhere except the casualty
   * it exists to teach. */
  ['the CW sink door drops its payload (the dark wire, restored)',
   "    set_condenser_cw_temp: function (e, c) { EN.command(e, 'cw_inlet_temp', c.c); },",
   '    set_condenser_cw_temp: function (e, c) { },', { grp: 'A' }],
  ['the published band is RETYPED instead of read from the condenser module',
   '      cw_inlet_range_c: [(CD.COND.cw_min_f - 32) * 5 / 9, (CD.COND.cw_max_f - 32) * 5 / 9],',
   '      cw_inlet_range_c: [4.4444, 37.7778],', { grp: 'A' }],
  /* #571, the three wires behind ONE derivation. They are separately anchored because they
   * fail separately: kill the derivation and both paths go quiet; kill the status-list entry
   * and only the KERNEL path does (silently, reading `undefined`); kill the permissive row and
   * the board's caption goes dark while the facade still refuses. That last pair is the whole
   * argument for checking both paths — a fix that reddens neither would have shipped. */
  ['the standing-trip derivation always says CLEAR (the #571 dead permissive, restored)',
   "      if (fns[i].kind === 'rps' && fns[i].asserted) return fns[i];",
   '', { grp: 'E' }],
  ['the instrument is published but never named in the status list (it reads undefined)',
   "        status: (this.instruments.specs.status || []).concat(['no_trip_signal_standing'])",
   '        status: (this.instruments.specs.status || [])', { grp: 'E' }],
  /* DROPS the row rather than inverting it: an inverted direction blocks EVERY reset, which
   * reds the clean-recovery check for the opposite reason and would pass as "caught" while
   * proving nothing. Dropped, the FACADE still refuses and only the kernel path — the caption's
   * path — goes quiet, which is the discrimination this mutation exists to make. */
  ['the kernel loses its reset permissive row (the board caption goes dark again)',
   '        }].concat(base.rps_reset_permissive || []),',
   '        }].slice(0, 0).concat(base.rps_reset_permissive || []),', { grp: 'E' }],
  ['a REFUSED command is silently swallowed (reads exactly like a plant that survived it)',
   "    if (REFUSED[a] !== undefined) {\n      throw new Error('pwr2_shell: \"' + a + '\" REFUSED — ' + REFUSED[a]);\n    }",
   '    if (REFUSED[a] !== undefined) { return { ok: true, action: a }; }', { grp: 'A' }],
  ['loadState accepts a pwr-1.0 save (node state invented from lumped values)',
   "    if (!saved || saved.schema !== 'pwr2-1.0') {",
   "    if (false) {", { grp: 'S' }],
  ['the readings dict is not saved (one post-load step of truth-fed control)',
   '             reading: insReading, nonFinite: insNonFinite },',
   '             reading: {}, nonFinite: insNonFinite },', { grp: 'S' }],
  ['the pressurizer seat is never re-linked on load (the vessel falls off the plant)',
   '    e.sys.extraMass = PZ.extraMassFn(e.pz);',
   '', { grp: 'S' }],
  /* the three #534 save-path fixes, each with its own revert — a restore is the one path
   * where a dropped field is invisible until the plant has already been handed back */
  ['the initial-condition scales leave the save again (a Mode 4 restore wears HFP constants)',
   '        rated_steam: e.rated_steam, M_nominal: e.M_nominal',
   '        _icScalesNotSaved: 0', { grp: 'S' }],
  ['the non-finite readings are not re-installed (a dead channel comes back a hard zero)',
   '    (st.ins.nonFinite || []).forEach(function (id) { e.ins.reading[id] = NaN; });',
   '', { grp: 'S' }],
  ['the shell shrink-and-swell driver is dropped on load (the board reads level optimistic)',
   '    this._pwrRate = (st.shell && typeof st.shell._pwrRate === \'number\') ? st.shell._pwrRate : 0;',
   '', { grp: 'S' }],
  /* #552 — the PORV demand channel had NO mutation of any kind before 2026-08-28: deleting
   * or corrupting either publish site was caught by nothing, which is how the operator's own
   * lever stayed missing from it. One per site, plus the contract word. */
  /* #538 — the currency, mutated two ways on purpose: a WRONG divisor (which the numeric
   * round trip catches) and the RETYPED literal (which only the source scan catches), so
   * neither check can stand in for the other. */
  ['the heater readback is a fraction of the PROPORTIONAL bank (#538 — a third currency)',
   'ts.pzr_heater_kw / (PZ.HEATERS.prop_kW + PZ.HEATERS.backup_kW) : 0,',
   'ts.pzr_heater_kw / PZ.HEATERS.prop_kW : 0,', { grp: 'A' }],
  /* NO mutation for the retyped-literal case, deliberately: that check reads the file from
   * DISK while this harness mutates an in-memory copy, so a replay can never move it. It is
   * a static drift guard, hand-verified by restoring the literal (red) and removing it
   * (green) — recorded here so the absence reads as a decision, not an oversight. */
  ['set_spray drops the documented {open} key again (the manual\'s step selects AUTO)',
   'if (p === undefined && c.open !== undefined) p = c.open ? 100 : 0;',
   '', { grp: 'A' }],
  ['the PORV lamp loses the OPERATOR again (#552 — a hand-opened valve reads CLOSED)',
   'ex.porv_commanded_open = !!(e.pz.porvOpen || e.pz.porvManual);',
   'ex.porv_commanded_open = !!e.pz.porvOpen;', { grp: 'G' }],
  ['porv_demand loses the OPERATOR again (the control-state readback half)',
   "porv_demand: (e.pz.porvOpen || e.pz.porvManual) ? 'open' : 'closed',",
   "porv_demand: e.pz.porvOpen ? 'open' : 'closed',", { grp: 'G' }],
  ['porv_demand speaks a word the contract does not have ("shut")',
   "porv_demand: (e.pz.porvOpen || e.pz.porvManual) ? 'open' : 'closed',",
   "porv_demand: (e.pz.porvOpen || e.pz.porvManual) ? 'open' : 'shut',", { grp: 'G' }],
  ['the containment ledger migration is severed (#544 — an old save loads water-only)',
   '    root.RD.pwr2.containment.migrateState(e.ctm);',
   '', { grp: 'S' }],
  ['the shell instruments are never updated after construction (every gauge frozen at t=0)',
   '    this.instruments.update(this._ts, dt, this._instrExtras());',
   '', { grp: 'A' }],
  ['the extras dict is dropped again (the shipped B2 defect: all 35 status readings undefined)',
   '    this.instruments.update(this._ts, dt, this._instrExtras());',
   '    this.instruments.update(this._ts, dt, {});', { grp: 'A' }],
  ['the rod groups revert to the one-entry id:\'control\' shape (both board readouts at 0)',
   "        { id: 'control_rods', name: 'Control Rods', function: 'control',",
   "        { id: 'control', name: 'Control Rods', function: 'control',", { grp: 'A' }],
  ['the REFUSED registry is emptied (39 refusals become unknown-action errors with no reasons)',
   'var REFUSED = {',
   'var REFUSED = {}; var REFUSED_gone = {', { grp: 'A' }],
  /* RE-POINTED for #562 (2026-08-27): the filter gained `.concat([AFW_LEVEL_CHANNEL])`, so the
   * old one-line anchor no longer exists and this went BLIND. The runner said ANCHOR MISS,
   * which is the only reason it was caught — a mutation whose anchor a refactor moved reports
   * as "caught" nowhere and quietly stops guarding anything. */
  ['the pwr automation channels LEAK into the config (M4 would command a plant it does not know)',
   "(base.channels || []).filter(function (ch) { return ch.id === 'boron_conc'; })",
   '(base.channels || [])', { grp: 'A' }],
  ['PWR2 own afw_level channel is dropped from the config (#562 — the level hold never runs, ' +
   'and the AFW panel AUTO button goes back to meaning nothing)',
   '.concat([AFW_LEVEL_CHANNEL])', '.concat([])', { grp: 'A' }],
  ['the throttle program moves off the sourced 33 % NR — the settle point is the claim (#582)',
   'program: function () { return 33; },',
   'program: function () { return 70; },', { grp: 'T' }],
  ['the throttle proportional gain is zeroed — the valve never tapers off the rail (#582)',
   'uMin: 0, uMax: 100, kp: 20, ki: 0, db: 0.5, minDelta: 1.0, period: 3.0, pvTau: 1.5,',
   'uMin: 0, uMax: 100, kp: 0, ki: 0, db: 0.5, minDelta: 1.0, period: 3.0, pvTau: 1.5,',
   { grp: 'T' }],
  ['the charging setter reads the currency as a demand fraction again (any setpoint ~= zero flow)',
   '      var gpm = (c.normalized !== undefined ? c.normalized : c.value) * 450000;\n      e.cv.chargingDemand = Math.max(0, Math.min(1, gpm / RD.cvcs.CVCS.charging_max_gpm()));',
   '      e.cv.chargingDemand = Math.max(0, Math.min(1, c.normalized !== undefined ? c.normalized : c.value));',
   { grp: 'A' }],
  ['the control-state charging setpoint reverts to a raw demand fraction (reads ~180,000 gpm)',
   '      charging_flow_normalized: (e.cv.chargingDemand === null ? 0 : e.cv.chargingDemand) *\n                                RD.cvcs.CVCS.charging_max_gpm() / 450000,',
   '      charging_flow_normalized: e.cv.chargingDemand === null ? 0 : e.cv.chargingDemand,',
   { grp: 'A' }],
  ['the afw esf arm is dropped again (the AUX FEED tile reads SECURED over an armed AFAS)',
   "        esf_systems: [{ id: 'afw', label: 'Auxiliary feedwater', commands: [] }],",
   '        esf_systems: [],', { grp: 'A' }],
  ['the afw arm grows a command list (the kernel\'s manual scan could flip a lie into the word)',
   "        esf_systems: [{ id: 'afw', label: 'Auxiliary feedwater', commands: [] }],",
   "        esf_systems: [{ id: 'afw', label: 'Auxiliary feedwater', commands: ['set_afw'] }],",
   { grp: 'A' }],
  /* #563 item 2 RETURNS, as the SEAT rather than the action: the door still exists and still
   * accepts, and lands the demand nowhere — which is the shape the original defect would most
   * plausibly have been "fixed" into, and the one a check that only asserted acceptance would
   * pass. Reds the ride and the readback together. */
  ['the aux-spray door accepts and drops the demand on the floor (a door onto a wall)',
   "      EN.command(e, 'aux_spray', Math.max(0, Math.min(1, v)));",
   '      EN.command(e, \'aux_spray\', 0);', { grp: 'D3' }],
  /* #563 item 1 RETURNS: the mirror-only path is hard-coded back to the single id it carried
   * until 2026-08-30. Reds the "every panel row accepts" check (35 of 50 refuse again) and the
   * "reading moves" check with it, while leaving the unknown-id refusal green — which is the
   * discrimination that says the guard was narrowed rather than deleted. */
  ['the mirror-only path is hard-coded to porv_indicator again (35 of the 50 panel rows throw)',
   '      if (!e.ins.channels[id] && boardNumericChannel(id)) return;',
   "      if (!e.ins.channels[id] && id === 'porv_indicator') return;", { grp: 'D3' }],
  /* anchor grew with the wave-6 modes; the claim is the same collapse */
  ['the instrument-failure command maps every mode to STUCK',
   "      var mode = c.mode === 'fail_low' ? 'low' : c.mode === 'fail_high' ? 'high'\n               : c.mode === 'noisy' ? 'noisy' : c.mode === 'drift' ? 'drift'\n               : c.mode === 'dead' ? 'dead' : 'stuck';",
   "      var mode = 'stuck';", { grp: 'D3' }],
  /* ⚠ INVERTED AT #500's CLOSE (2026-08-29), and it had to be. The old mutation DELETED the
   * pzr_level_low override to prove the override existed; the override is now retired, so that
   * anchor is gone and a mutation whose anchor no longer matches is BLIND, not passing. The
   * claim inverted with it — what must not happen now is a per-plant ABSOLUTE row coming back,
   * so the mutation ADDS one. It reds both halves: the shared-by-reference sweep and the
   * ladder-shape clause beside it. */
  ['a per-plant ABSOLUTE pzr_level_low override is re-introduced (the #500 shape undone)',
   "          return a.id === 'rod_limit_approach'\n            ? Object.assign({}, a, { setpoint: 10 })\n            : a;",
   "          return a.id === 'pzr_level_low'\n            ? Object.assign({}, a, { instrument: 'pzr_level', setpoint: 17.0 })\n            : a.id === 'rod_limit_approach'\n            ? Object.assign({}, a, { setpoint: 10 })\n            : a;", { grp: 'A' }],
  ['the shutdown group reverts to the pre-#506 snap (200 -> 0 in one frame on scram)',
   "          steps: Math.round(e.sdSteps), max_steps: bankSteps()," + NL_ +
   "          position_pct: 100 * e.sdSteps / bankSteps(),",
   "          steps: ts.scrammed ? 0 : bankSteps(), max_steps: bankSteps()," + NL_ +
   "          position_pct: ts.scrammed ? 0 : 100,", { grp: 'B' }],
  ['the rcp pump record loses flow_pct again (the board animation computes NaN and freezes)',
   "      pumps: [{ id: 'rcp', running: !e.sys.pumpTripped,\n                flow_pct: ts.pump_flow_pct !== undefined ? ts.pump_flow_pct\n                          : (e.sys.pumpTripped ? 0 : 100) }]",
   "      pumps: [{ id: 'rcp', running: !e.sys.pumpTripped }]", { grp: 'A' }],
  ['the LOOP row regresses to the wave-3 pump-trip-only shape (#507 wave 4)',
   "        EN.command(e, 'offsite_power', false);",
   "        EN.command(e, 'pump_trip', true);", { grp: 'E' }],
  ['the sgtr row is routed to the cold leg (a tube rupture wearing a LOCA\'s plumbing)',
   "        EN.command(e, 'break_open', { area_m2: Math.max(1e-6, sevT * 4.33e-4),\n                                      node: 'sg_primary' });",
   "        EN.command(e, 'break_open', { area_m2: Math.max(1e-6, sevT * 4.33e-4),\n                                      node: 'cold_leg' });", { grp: 'F' }],
  ['the advanced panel\'s value key is dropped again (#507 wave 6 latent fix 3 reverted)',
   '      var val = c.stuck_value !== undefined ? c.stuck_value : c.value;',
   '      var val = c.stuck_value;', { grp: 'G' }],
  ['degraded_hpi reverts to the INERT seat (writes a field the physics never reads)',
   "        e.ec.hhsiAvail = Math.max(0, 1 - (c.severity !== undefined ? c.severity : 0.5));",
   "        e.ec.avail = Math.max(0, 1 - (c.severity !== undefined ? c.severity : 0.5));",
   { grp: 'D' }],
  ['the seal-leak slider is discarded again (#507 wave 6 latent fix 2 reverted)',
   "        EN.command(e, 'break_open', { area_m2: Math.max(1e-6, sevS * 1.2e-5), node: 'rcp' });",
   "        EN.command(e, 'break_open', { area_m2: 8e-6, node: 'rcp' });", { grp: 'G' }],
  ['the block mapping is severed (the board button reaches a wire that goes nowhere) -- #507 wave 7',
   "        EN.command(e, 'low_flux_block', c.blocked !== false);",
   '', { grp: 'H' }],
  ['the engine-owned block surface loses its setpoint (the power tile paints the static 25 %)',
   '          setpoint: sp',
   '          setpoint: undefined', { grp: 'H' }],
  /* THE ROD INSERTION LIMIT (#507 §B, wave 8) */
  ['the control-state limit fields revert to the pinned nulls',
   '          insertion_limit_steps: e._rilSteps === undefined ? null : e._rilSteps,\n          at_insertion_limit: e._rodAtLimit === true },',
   '          insertion_limit_steps: null, at_insertion_limit: false },', { grp: 'I' }],
  ['the margin channel is severed (the board reads the healthy default for ever)',
   '    ex.rod_limit_margin = e._rodLimitMargin === undefined ? bankSteps() : e._rodLimitMargin;',
   '    ex.rod_limit_margin = bankSteps();', { grp: 'I' }],
  /* THE HOIST ITSELF (#602 phase 1) — the surface half. A stale divisor does not throw and
   * does not blank the readout: it renders a fully-withdrawn 313-step bank as 156.5 %
   * withdrawn, a wrong number that still draws. That is why the check beside it reads
   * position_pct and not only max_steps. */
  ['position_pct keeps its own stale 200 divisor (a full bank renders over 100 %)',
   '          position_pct: 100 * e.rodSteps / bankSteps(),',
   '          position_pct: 100 * e.rodSteps / 200,', { grp: 'A' }],
  ['the ROD LIMIT LO override is dropped (the row fires at 40 of this bank\'s steps — 4x early)',
   /* anchor re-cut when #500's override left the map (2026-08-29) — it used to open with the
    * `: ` that chained off the pzr_level_low arm, and an anchor that no longer matches is a
    * BLIND mutation, not a passing one. The runner's ANCHOR MISS report is what caught it. */
   "          return a.id === 'rod_limit_approach'\n            ? Object.assign({}, a, { setpoint: 10 })\n            : a;",
   '          return a;', { grp: 'I' }],
  ['the SECURED latch is dropped (an operator-stopped pump reads LOST) -- #507 wave 9',
   "        e._rcpSecured = true;               /* the OPERATOR stopped it — the handswitch\n                                             * reads SECURED, not LOST (#200's split) */",
   '', { grp: 'J' }],
  ['the P-11 pair mapping is severed (the cooldown blocks are board-unreachable) -- #507 wave 10',
   "      } else if (c.trip_id === 'lo_press') {\n        /* the P-11 pair (#507 wave 10) — the pwr1 board's own ids for the cooldown blocks */\n        EN.command(e, 'lo_press_trip_block', c.blocked !== false);\n      } else if (c.trip_id === 'si_trip') {\n        EN.command(e, 'si_block', c.blocked !== false);\n      }",
   '      }', { grp: 'K' }]
];

/* ---- SCOPED-CLEAN-PASS PREFLIGHT (#513) ------------------------------------------------
 * Every group a mutation names must be GREEN when run alone on the clean build. In the replay
 * loop a crash counts as caught, so a group whose checks lean on another section's setup would
 * crash there and silently stand in for coverage; here, on the clean module, it fails loudly. */
var scopeBad = 0;
var SH0 = loadAll();
MUTATIONS.map(function (mt) { return mt[3] && mt[3].grp; })
  .filter(function (g, i, a) { return g && a.indexOf(g) === i; })
  .forEach(function (g) {
    var rg = [], threw = false;
    try { runSuite(SH0, rg, true, g); } catch (e) { threw = true; }
    var fg = rg.filter(function (r) { return !r.ok; }).length;
    if (threw || fg > 0) {
      scopeBad++;
      console.log('  SCOPE ' + g + (threw ? ' THREW' : ' RED (' + fg + ')') +
        ' on the CLEAN build -- the group cannot stand alone; GATE FAILS' +
        (fg ? ' -- ' + rg.filter(function (r) { return !r.ok; })
                         .map(function (r) { return r.name; }).join('; ') : ''));
    }
  });

console.log('\ninjection self-test (' + MUTATIONS.length + ' mutations):');
var blind = 0;
MUT.select(MUTATIONS).forEach(function (mt) {
  var grpTag = (mt[3] && mt[3].grp) || undefined;
  var mutated = SHSRC.replace(mt[1], mt[2]);
  if (mutated === SHSRC) { console.log('  ANCHOR MISS ' + mt[0]); blind++; return; }
  var rec2 = [], crashed = false;
  try { runSuite(loadAll(mutated), rec2, true, grpTag); }
  catch (e) { crashed = true; }
  /* A crash counts as caught no matter how many checks recorded first (the run_pwr2_engine
   * form) -- but a crash-only catch is REPORTED AS ITSELF rather than wearing a check's face. */
  var realReds = rec2.filter(function (r) { return !r.ok; }).length;
  var f2 = crashed ? 1 : (rec2.length ? realReds : 1);
  if (f2 === 0) { console.log('  BLIND TO  ' + mt[0] + '   <-- THIS GATE CANNOT SEE IT'); blind++; }
  else if (crashed && realReds === 0) {
    console.log('  caught    ' + mt[0].padEnd(70) + 'CRASH only -- no check red (coverage untested)');
  }
  else console.log('  caught    ' + mt[0].padEnd(70) + f2 + ' red');
});
loadAll();

console.log('\n' + '='.repeat(70));
console.log('  injection self-test: ' + (MUTATIONS.length - blind) + '/' + MUTATIONS.length +
  ' mutations caught' + (blind ? '  ** ' + blind + ' BLIND SPOTS -- GATE FAILS **' : ', no blind spots') +
  (scopeBad ? '  ** ' + scopeBad + ' GROUP(S) NOT SELF-STANDING **' : ''));
console.log('  run_pwr2_shell: ' + pass + ' passed, ' + fail + ' failed  (' + rec.length + ' checks)');
console.log('='.repeat(70) + '\n');
process.exit(fail > 0 || blind > 0 || scopeBad > 0 ? 1 : 0);
