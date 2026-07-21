/*
 * behavior_pwr.js — PWR BEHAVIOR BATTERY (spec layer, run by test/run_behavior.js).
 *
 * One probe per Blueprint/PWR_BEHAVIOR_CATALOG.md entry (v2.0, frozen 2026-07-20).
 * Unlike the engine/ops suites, which regress the sim against itself, every check
 * here asserts a band taken FROM THE CATALOG — i.e. from real-Westinghouse
 * behavior. Known defects are declared in XFAIL below (strict: an XFAIL that
 * starts passing reddens the gate until its entry is removed — same convention
 * as run_procedures KNOWN_FAILS), so the gate stays green-with-yellow while the
 * tuning pass burns the list down.
 *
 * COVERAGE maps every catalog ID to its probe here, to an existing suite that
 * already pins it, or to 'todo' — the runner prints the todo list so nothing is
 * silently uncovered.
 */
;(function (RD) {
  'use strict';

  var T = RD.OpsTest, test = T.test, near = T.near, fmt = T.fmt;

  function H(initial, opts) {
    opts = opts || {};
    opts.plant = 'pwr';
    opts.initial = initial;
    return new RD.OpsHarness(opts);
  }

  // ------------------------------------------------------------- XFAIL (strict)
  // id → why it is expected to fail today (catalog §8 decision that will fix it).
  var XFAIL = {
    'SS-5': 'no pzr level program — constant 55% setpoint (catalog §8.7)',
    'TR-1': 'no reactor-trip-on-turbine-trip above P-9 (PI-1, catalog §8.2)',
    'TR-2': 'spray uncapped + missing PI-1/PI-2 — PORV never lifts on loss of feed (#22)',
    'CC-3': 'no post-trip feedwater isolation / AFW handoff (P-4 analog, catalog §8.4)',
    'CC-5': 'spray capacity uncapped — suppresses loss-of-heat-sink repressurization (#22/#23)',
    'CC-10': 'pzr level and RCS mass are decoupled integrators — CVCS holds level while true inventory winds to the tank cap (catalog §8.5)',
  };

  // -------------------------------------------------------------- COVERAGE map
  var COVERAGE = {
    'SS-1': 'probe', 'SS-2': 'probe', 'SS-3': 'probe:SS-2', 'SS-4': 'probe:SS-2',
    'SS-5': 'probe', 'SS-6': 'probe', 'SS-7': 'existing:run_pwr cold_shutdown_hold',
    'SS-8': 'probe',
    'EV-1': 'existing:run_pwr mode5_to_mode1_roundtrip', 'EV-2': 'existing:run_ops cooldown + run_pwr rhr_valve_and_mode',
    'EV-3': 'todo (re-band after SS-2 tuning)', 'EV-4': 'existing:run_ops load follow (re-band after SS-2)',
    'EV-5': 'existing:run_campaign pwr_boron', 'EV-6': 'probe', 'EV-7': 'probe:EV-6',
    'EV-8': 'existing:run_ops xenon 8h', 'EV-9': 'existing:run_campaign startup ×2',
    'EV-10': 'existing:run_pwr transient_loss_vacuum',
    'TR-1': 'probe', 'TR-2': 'probe', 'TR-3': 'todo (needs TR-2 tuned first)',
    'TR-4': 'probe (lumped-RCP model: total-loss trip; P-8 single-loop needs multi-loop model)',
    'TR-5': 'probe', 'TR-6': 'existing:run_ops grid step + steam_dump_capacity_cap',
    'TR-7': 'probe', 'TR-8': 'existing:run_pwr transient_loss_vacuum (dump-unavailable pin: todo)',
    'TR-9': 'existing:run_ops sg_overfeed_p14 + run_pwr feedwater_isolation',
    'TR-10': 'probe', 'TR-11': 'existing:run_ops heaters vs spray fight (end-state pin: todo)',
    'TR-12': 'existing:run_campaign pwr_slb', 'TR-13': 'existing:run_ops SGTR stabilize',
    'TR-14': 'existing:campaign SBO fact (document in manual)',
    'CA-1': 'existing:run_campaign tmi2 p1-p3 (re-validate after tuning)',
    'CA-2': 'existing:run_pwr merged_injection_curve + accumulator_arming_boundary',
    'CA-3': 'probe', 'CA-4': 'todo (needs PI-8 high-level trip first)',
    'CA-5': 'existing:run_autoctl HR1 probes', 'CA-6': 'existing:run_pwr NIS suite',
    'CC-1': 'existing:run_autoctl rod auto probes (re-work with SS-2)',
    'CC-2': 'existing:run_autoctl PID stays engaged', 'CC-3': 'probe', 'CC-4': 'existing:run_autoctl',
    'CC-5': 'probe', 'CC-6': 'probe', 'CC-7': 'existing:run_pwr steam_dump_capacity_cap',
    'CC-8': 'probe', 'CC-9': 'existing:run_pwr + run_campaign pwr_esf',
    'CC-10': 'probe',
    'PI-1': 'probe:TR-1', 'PI-2': 'probe:TR-2', 'PI-3': 'todo (with interlock build)',
    'PI-4': 'todo (with interlock build)', 'PI-5': 'probe:CC-3', 'PI-6': 'todo (needs multi-loop model)',
    'PI-7': 'probe', 'PI-7-reset': 'todo (RPS reset path, C3 — with interlock build)',
    'PI-8': 'todo (with interlock build)', 'PI-9': 'todo (verify SLB path)',
  };

  var PROBES = {

    // ============================================== 1. steady-state operating map

    'SS-1': function () {
      return test('SS-1 100% snapshot vs Westinghouse map', function (ck) {
        var h = H('hot_full_power');
        h.run(600);
        var t = h.ts();
        ck('Tavg 303..309 °C', fmt(t.tavg_c, 1), t.tavg_c > 303 && t.tavg_c < 309, '303..309');
        ck('loop ΔT 30..36 °C', fmt(t.thot_c - t.tcold_c, 1),
          (t.thot_c - t.tcold_c) > 30 && (t.thot_c - t.tcold_c) < 36, '30..36');
        ck('pzr pressure 15.30..15.55 MPa', fmt(t.pressure_mpa, 2),
          t.pressure_mpa > 15.30 && t.pressure_mpa < 15.55, '15.30..15.55');
        ck('pzr level 50..60 %', fmt(t.pzr_level_pct, 1), t.pzr_level_pct > 50 && t.pzr_level_pct < 60, '50..60');
        ck('SG pressure 5.4..6.0 MPa', fmt(t.steam_pressure_mpa, 2),
          t.steam_pressure_mpa > 5.4 && t.steam_pressure_mpa < 6.0, '5.4..6.0');
        ck('steam ≈ feed (±3% of rated)', fmt(t.steam_flow_normalized, 3) + ' vs ' + fmt(t.fw_flow_normalized, 3),
          Math.abs(t.steam_flow_normalized - t.fw_flow_normalized) < 0.03, 'match');
        ck('no trip, no alarms', (h.tripReason || 'none') + ' / ' + (Object.keys(h.alarmFirst).join(',') || 'none'),
          h.tripTime == null && Object.keys(h.alarmFirst).length === 0, 'none');
        T.checkSanity(ck, h);
      });
    },

    // Also covers SS-3 (50% point) and SS-4 (HZP point).
    'SS-2': function () {
      return test('SS-2 Tavg program — rises with load (292 → 306 °C)', function (ck) {
        var hz = H('hot_zero_power'); hz.run(300);
        var h5 = H('50_percent');     h5.run(600);
        var hf = H('hot_full_power'); hf.run(300);
        var t0 = hz.ts().tavg_c, t50 = h5.ts().tavg_c, t100 = hf.ts().tavg_c;
        ck('no-load Tavg 290..294 °C', fmt(t0, 1), t0 > 290 && t0 < 294, '290..294');
        ck('50% Tavg 296..302 °C (SS-3)', fmt(t50, 1), t50 > 296 && t50 < 302, '296..302');
        ck('program rises ≥ 8 °C no-load → full', fmt(t100 - t0, 1), (t100 - t0) >= 8, '≥ 8');
        ck('monotonic: no-load < 50% < 100%', fmt(t0, 1) + ' < ' + fmt(t50, 1) + ' < ' + fmt(t100, 1),
          t0 < t50 && t50 < t100, 'monotonic');
      });
    },

    'SS-5': function () {
      return test('SS-5 pzr level program — level rises with Tavg', function (ck) {
        var hz = H('hot_zero_power'); hz.run(300);
        var hf = H('hot_full_power'); hf.run(300);
        var l0 = hz.ts().pzr_level_pct, l100 = hf.ts().pzr_level_pct;
        ck('no-load level ≤ 40 %', fmt(l0, 1), l0 <= 40, '≤ 40');
        ck('full-power level 50..62 %', fmt(l100, 1), l100 > 50 && l100 < 62, '50..62');
        ck('program rises ≥ 15 % no-load → full', fmt(l100 - l0, 1), (l100 - l0) >= 15, '≥ 15');
      });
    },

    'SS-6': function () {
      return test('SS-6 5% steady — stable indefinitely on the dump', function (ck) {
        var h = H('5_percent');
        h.run(1200);
        var p1 = h.ts().power_pct;
        h.run(600);
        var p2 = h.ts().power_pct;
        ck('power still 5 ±2 % after 30 min hands-off', fmt(p2, 1), p2 > 3 && p2 < 7, '3..7');
        ck('no continuing droop over the last 10 min (±0.5 %)', fmt(p1, 2) + ' → ' + fmt(p2, 2),
          Math.abs(p2 - p1) <= 0.5, 'flat');
        ck('no trip over 30 min', h.tripReason || 'none', h.tripTime == null, 'none');
        ck.info('lowest power seen (at s)', fmt(h.range('power_pct').min, 2) + ' @ ' + fmt(h.range('power_pct').tmin, 0));
        T.checkSanity(ck, h);
      });
    },

    'SS-8': function () {
      return test('SS-8 heat-balance closure at 100%', function (ck) {
        var h = H('hot_full_power');
        h.run(600);
        var t = h.ts();
        ck('charging ≈ letdown (±0.01)', fmt(t.charging_flow_actual, 3) + ' vs ' + fmt(t.letdown_flow_actual, 3),
          Math.abs(t.charging_flow_actual - t.letdown_flow_actual) < 0.01, 'match');
        ck('steam ≈ feed (±3%)', fmt(t.steam_flow_normalized, 3) + ' vs ' + fmt(t.fw_flow_normalized, 3),
          Math.abs(t.steam_flow_normalized - t.fw_flow_normalized) < 0.03, 'match');
        ck('electrical ≈ rated (1000 ±50 MWe)', fmt(t.mwe_output, 0), near(t.mwe_output, 1000, 50), '1000 ±50');
        T.checkSanity(ck, h);
      });
    },

    // ======================================================= 2. normal evolutions

    // Also covers EV-7. Regression insurance for closed #25.
    'EV-6': function () {
      return test('EV-6 slow stepwise rod insertion at 100% — no SCRAM', function (ck) {
        var h = H('hot_full_power');
        h.run(60);
        for (var i = 0; i < 6; i++) {
          h.cmd('rod_nudge', { group_id: 'control_rods', steps: -1 });
          h.run(120);
        }
        var t = h.ts();
        ck('no trip through 6 slow steps', h.tripReason || 'none', h.tripTime == null, 'none');
        ck('power still ≥ 80 %', fmt(t.power_pct, 1), t.power_pct >= 80, '≥ 80');
        ck('Tavg still on span', fmt(t.tavg_c, 1), t.tavg_c > 293 && t.tavg_c < 312, '293..312');
        T.checkSanity(ck, h);
      });
    },

    // =================================================== 3. anticipated transients

    'TR-1': function () {
      return test('TR-1 turbine trip @100% — anticipatory reactor trip (P-9)', function (ck) {
        var h = H('hot_full_power');
        h.run(30);
        h.cmd('inject_failure', { failure_id: 'turbine_trip' });
        var dt = h.runUntil(function (ts, ins, hh) { return hh.tripTime != null; }, 120);
        ck('reactor trips within 5 s of turbine trip', dt >= 0 ? fmt(dt, 1) + ' s' : 'no trip in 120 s',
          dt >= 0 && dt <= 5, '≤ 5 s');
        ck.info('peak pressure after TT', fmt(h.range('pressure_mpa').max, 2) + ' MPa');
        ck.info('peak Tavg after TT', fmt(h.range('tavg_c').max, 1) + ' °C');
      });
    },

    'TR-2': function () {
      return test('TR-2 loss of main feedwater @100% — the TMI opener', function (ck) {
        var h = H('hot_full_power');
        h.run(30);
        h.cmd('inject_failure', { failure_id: 'loss_of_feedwater' });
        var dt = h.runUntil(function (ts, ins, hh) { return hh.tripTime != null; }, 300);
        ck('reactor trips ≤ 90 s (lo-lo SG or anticipatory)', dt >= 0 ? fmt(dt, 1) + ' s' : 'no trip in 300 s',
          dt >= 0 && dt <= 90, '≤ 90 s');
        h.run(300);
        ck('turbine tripped with/after the reactor', String(h.ts().mwe_output < 50),
          h.ts().mwe_output < 50, 'true');
        ck('primary pressure reaches PORV lift 16.20 MPa', fmt(h.range('pressure_mpa').max, 2),
          h.range('pressure_mpa').max >= 16.20, '≥ 16.20');
        ck('PORV lifted', h.alarmFired('porv_open') ? 'lifted' : 'never lifted',
          h.alarmFired('porv_open'), 'lifted');
        ck('AFW auto-started', String(!!h.ts().afw_active), !!h.ts().afw_active, 'true');
        T.checkSanity(ck, h);
      });
    },

    // Lumped-RCP model: a "pump trip" is the whole forced-flow supply; the plant
    // must trip promptly on low flow. (P-8 single-loop selectivity: PI-6 todo.)
    'TR-4': function () {
      return test('TR-4 RCP trip @100% — prompt low-flow reactor trip', function (ck) {
        var h = H('hot_full_power');
        h.run(30);
        h.cmd('inject_failure', { failure_id: 'rcp_trip' });
        var dt = h.runUntil(function (ts, ins, hh) { return hh.tripTime != null; }, 120);
        ck('reactor trips ≤ 15 s on coastdown', dt >= 0 ? fmt(dt, 1) + ' s' : 'no trip in 120 s',
          dt >= 0 && dt <= 15, '≤ 15 s');
        h.run(300);
        ck('no fuel damage (natural circulation carries decay heat)',
          String(h.meltTime == null), h.meltTime == null, 'true');
        T.checkSanity(ck, h);
      });
    },

    'TR-5': function () {
      return test('TR-5 MSIV closure @100% — trip, bottled SG, inventory retained', function (ck) {
        var h = H('hot_full_power');
        h.run(30);
        h.cmd('close_msiv');
        var dt = h.runUntil(function (ts, ins, hh) { return hh.tripTime != null; }, 120);
        ck('reactor trips ≤ 60 s', dt >= 0 ? fmt(dt, 1) + ' s' : 'no trip', dt >= 0 && dt <= 60, '≤ 60 s');
        h.run(900);
        ck('SG bottles to safeties, ≤ 9.6 MPa', fmt(h.range('steam_pressure_mpa').max, 2),
          h.range('steam_pressure_mpa').max <= 9.6, '≤ 9.6');
        ck('pzr level never below 15 % (no draining — #34)', fmt(h.range('pzr_level_pct').min, 1),
          h.range('pzr_level_pct').min >= 15, '≥ 15');
        ck('primary inventory retained ≥ 85 %', fmt(h.range('core_inventory_pct').min, 1),
          h.range('core_inventory_pct').min >= 85, '≥ 85');
        T.checkSanity(ck, h);
      });
    },

    'TR-7': function () {
      return test('TR-7 manual reactor trip from 100% — clean post-trip picture', function (ck) {
        var h = H('hot_full_power');
        h.run(30);
        h.cmd('scram');
        h.run(1200);
        var t = h.ts();
        ck('turbine unloaded (< 50 MWe)', fmt(t.mwe_output, 0), t.mwe_output < 50, '< 50');
        ck('outsurge dip bounded ≥ 13.5 MPa', fmt(h.range('pressure_mpa').min, 2),
          h.range('pressure_mpa').min >= 13.5, '≥ 13.5');
        ck('pressure recovering (≥ 14.8 MPa at +20 min)', fmt(t.pressure_mpa, 2),
          t.pressure_mpa >= 14.8, '≥ 14.8');
        ck('pzr level never off-span low (≥ 12 %)', fmt(h.range('pzr_level_pct').min, 1),
          h.range('pzr_level_pct').min >= 12, '≥ 12');
        ck('no safety injection on a clean trip', fmt(h.range('hpi_flow_normalized').max, 4),
          h.range('hpi_flow_normalized').max < 0.001, '~0');
        T.checkSanity(ck, h);
      });
    },

    'TR-10': function () {
      return test('TR-10 stuck-open PORV @100% — SBLOCA protection chain', function (ck) {
        var h = H('hot_full_power');
        h.run(30);
        h.cmd('open_porv');
        h.run(1500);
        ck('low-pressure reactor trip fired', h.tripReason || 'none',
          h.tripTime != null, 'trip');
        ck('safety injection came in', fmt(h.range('hpi_flow_normalized').max, 4),
          h.range('hpi_flow_normalized').max > 0.001, '> 0');
        ck('PORV-open alarm annunciated', String(h.alarmFired('porv_open')),
          h.alarmFired('porv_open'), 'true');
        ck('no fuel damage in 25 min', String(h.meltTime == null), h.meltTime == null, 'true');
        T.checkSanity(ck, h);
      });
    },

    // ============================================ 4/5. casualties + control channels

    'CA-3': function () {
      return test('CA-3 pzr level sensor stuck + leak — CVCS is honestly fooled', function (ck) {
        var h = H('hot_full_power');
        h.cmd('set_cvcs_auto', { active: true });
        h.run(60);
        var inv0 = h.ts().core_inventory_pct;
        h.cmd('inject_failure', { failure_id: 'pzr_level_sensor_stuck' });
        h.cmd('inject_failure', { failure_id: 'sgtr', severity: 0.15 });
        var ind0 = h.ins().pzr_level;
        h.run(600);
        var t = h.ts();
        ck('indicated level frozen by the stuck sensor (±0.5 %)',
          fmt(ind0, 1) + ' → ' + fmt(h.ins().pzr_level, 1),
          Math.abs(h.ins().pzr_level - ind0) <= 0.5, 'frozen');
        ck('charging did NOT chase truth (follows the stuck instrument)',
          fmt(h.range('charging_flow_actual').max, 3) + ' vs letdown ' + fmt(t.letdown_flow_actual, 3),
          h.range('charging_flow_actual').max <= t.letdown_flow_actual + 0.012, 'no make-up response');
        ck('truth diverged from indication (inventory moved ≥ 1.5 % while the gauge held still)',
          fmt(t.core_inventory_pct - inv0, 2), Math.abs(t.core_inventory_pct - inv0) >= 1.5, '|Δ| ≥ 1.5');
        T.checkSanity(ck, h);
      });
    },

    'CC-3': function () {
      return test('CC-3 post-trip feedwater — MFW isolates, AFW takes the SGs', function (ck) {
        var h = H('hot_full_power');
        h.run(30);
        h.cmd('scram');
        h.run(600);
        var t = h.ts();
        ck('main feed isolated once Tavg is at no-load (fw_flow < 0.05)',
          fmt(t.fw_flow_normalized, 3), t.fw_flow_normalized < 0.05, '< 0.05');
        ck('SG level held by AFW band (≥ 15 %)', fmt(h.range('sg_level_pct').min, 1),
          h.range('sg_level_pct').min >= 15, '≥ 15');
      });
    },

    // The #22/#23 pin: heat-sink loss with spray in AUTO must still lift the PORV.
    'CC-5': function () {
      return test('CC-5 spray capacity — cannot suppress loss-of-heat-sink spike', function (ck) {
        var h = H('hot_full_power');
        h.run(30);
        h.cmd('inject_failure', { failure_id: 'turbine_trip' });
        h.cmd('inject_failure', { failure_id: 'loss_of_feedwater' });
        h.run(600);
        ck('pressure reaches PORV lift 16.20 MPa despite spray AUTO',
          fmt(h.range('pressure_mpa').max, 2), h.range('pressure_mpa').max >= 16.20, '≥ 16.20');
        ck('PORV lifted', h.alarmFired('porv_open') ? 'lifted' : 'never lifted',
          h.alarmFired('porv_open'), 'lifted');
        ck.info('observed peak pressure', fmt(h.range('pressure_mpa').max, 2) + ' MPa');
      });
    },

    'CC-6': function () {
      return test('CC-6 heaters recover a spray-forced outsurge', function (ck) {
        var h = H('hot_full_power');
        h.run(60);
        h.cmd('set_spray', { pct: 100 });
        h.run(60);
        h.cmd('set_spray', { auto: true });
        var dip = h.range('pressure_mpa').min;
        var dt = h.runUntil(function (ts) { return ts.pressure_mpa >= 15.30; }, 900);
        ck('pressure dipped under forced spray', fmt(dip, 2), dip < 15.35, '< 15.35');
        ck('heaters restore ≥ 15.30 MPa within 15 min', dt >= 0 ? fmt(dt, 0) + ' s' : 'not recovered',
          dt >= 0, '≤ 900 s');
        T.checkSanity(ck, h);
      });
    },

    'CC-8': function () {
      return test('CC-8 CVCS make-up vs a small leak — level trend is the leak indication', function (ck) {
        var h = H('hot_full_power');
        h.cmd('set_cvcs_auto', { active: true });
        h.run(60);
        h.cmd('inject_failure', { failure_id: 'sgtr', severity: 0.1 });
        h.run(900);
        var t = h.ts();
        ck('charging rose above letdown to make up the leak',
          fmt(t.charging_flow_actual, 3) + ' vs ' + fmt(t.letdown_flow_actual, 3),
          t.charging_flow_actual > t.letdown_flow_actual + 0.003, 'charging > letdown');
        ck('pzr level held ≥ 40 %', fmt(h.range('pzr_level_pct').min, 1),
          h.range('pzr_level_pct').min >= 40, '≥ 40');
        ck('no trip while CVCS carries it', h.tripReason || 'none', h.tripTime == null, 'none');
        T.checkSanity(ck, h);
      });
    },

    // Discovered by this battery's first run (2026-07-20): because pzr level and RCS
    // mass are separate integrators, the CVCS level servo can hold level at 55 %
    // while TRUE inventory winds up to the 120 % tank cap (or the 0 % floor). Mass
    // must be conserved: with charging balancing a small leak, inventory stays ~100 %.
    'CC-10': function () {
      return test('CC-10 level↔mass coupling — CVCS holds level WITHOUT inventory windup', function (ck) {
        var h = H('hot_full_power');
        h.cmd('set_cvcs_auto', { active: true });
        h.run(60);
        h.cmd('inject_failure', { failure_id: 'sgtr', severity: 0.1 });
        h.run(900);
        var t = h.ts();
        ck('pzr level held near program (50..60 %)', fmt(t.pzr_level_pct, 1),
          t.pzr_level_pct > 50 && t.pzr_level_pct < 60, '50..60');
        ck('true inventory conserved 97..103 % (no silent windup)',
          fmt(h.range('core_inventory_pct').min, 1) + '..' + fmt(h.range('core_inventory_pct').max, 1),
          h.range('core_inventory_pct').min >= 97 && h.range('core_inventory_pct').max <= 103, '97..103');
      });
    },

    // ====================================================== 6. protection plumbing

    // C4 (manual scram not latching RPS) verified RESOLVED by this battery's first
    // run 2026-07-20 — latching now passes. The C3 half (an RPS *reset* path for
    // scram recovery) is still absent: coverage todo PI-7-reset, lands with the
    // interlock build.
    'PI-7': function () {
      return test('PI-7 scram bookkeeping — manual scram latches RPS', function (ck) {
        var h = H('hot_full_power');
        h.run(30);
        h.cmd('scram');
        h.run(30);
        ck('engine latched the scram', String(h.ts().scrammed), !!h.ts().scrammed, 'true');
        ck('RPS state shows scrammed after a MANUAL scram (C4 — resolved)', String(h.rps().scrammed),
          h.rps().scrammed === true, 'true');
      });
    },
  };

  RD.BehaviorPWR = {
    probes: PROBES,
    XFAIL: XFAIL,
    COVERAGE: COVERAGE,
    runAll: function () {
      return Object.keys(PROBES).map(function (id) {
        var r = PROBES[id]();
        r.id = id;
        return r;
      });
    },
  };

})(globalThis.RD || (globalThis.RD = {}));
