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
    // Emptied 2026-07-21 (feel-plan P5): TR-2/CC-5 left with the spray cap +
    // trip-open dump + TR-3 re-spec; TR-1/CC-3 left with the P4 ride-out and
    // P-4 handoff; SS-5/CC-10 left with the P2 derived-level rework.
  };

  // -------------------------------------------------------------- COVERAGE map
  var COVERAGE = {
    'SS-1': 'probe', 'SS-2': 'probe', 'SS-3': 'probe:SS-2', 'SS-4': 'probe:SS-2',
    'SS-5': 'probe', 'SS-6': 'probe', 'SS-7': 'existing:run_pwr cold_shutdown_hold',
    'SS-8': 'probe',
    'EV-1': 'existing:run_pwr mode5_to_mode1_roundtrip', 'EV-2': 'existing:run_ops cooldown + run_pwr rhr_valve_and_mode',
    'EV-3': 'probe', 'EV-11': 'probe', 'EV-4': 'existing:run_ops load follow (re-band after SS-2)',
    'EV-5': 'existing:run_campaign pwr_boron', 'EV-6': 'probe', 'EV-7': 'probe:EV-6',
    'EV-8': 'existing:run_ops xenon 8h', 'EV-9': 'existing:run_campaign startup ×2',
    'EV-10': 'existing:run_pwr transient_loss_vacuum',
    'TR-1': 'probe', 'TR-2': 'probe', 'TR-3': 'probe',
    'TR-4': 'probe (lumped-RCP model: total-loss trip; P-8 single-loop needs multi-loop model)',
    'TR-5': 'probe', 'TR-6': 'existing:run_ops grid step + steam_dump_capacity_cap',
    'TR-7': 'probe', 'TR-8': 'probe',
    'TR-9': 'existing:run_ops sg_overfeed_p14 + run_pwr feedwater_isolation',
    'TR-10': 'probe', 'TR-11': 'existing:run_ops heaters vs spray fight (end-state pin: todo)',
    'TR-12': 'existing:run_campaign pwr_slb', 'TR-13': 'probe + ops SGTR single-SG EOP',
    'TR-14': 'existing:campaign SBO fact (document in manual)',
    'CA-1': 'existing:run_campaign tmi2 p1-p3 (re-validate after tuning)',
    'CA-2': 'existing:run_pwr merged_injection_curve + accumulator_arming_boundary',
    'CA-3': 'probe', 'CA-4': 'probe',
    'CA-5': 'existing:run_autoctl HR1 probes', 'CA-6': 'existing:run_pwr NIS suite',
    'CC-1': 'existing:run_autoctl rod auto probes (re-work with SS-2)',
    'CC-2': 'existing:run_autoctl PID stays engaged', 'CC-3': 'probe', 'CC-4': 'existing:run_autoctl',
    'CC-5': 'probe', 'CC-6': 'probe', 'CC-7': 'existing:run_pwr steam_dump_capacity_cap',
    'CC-8': 'probe', 'CC-9': 'existing:run_pwr + run_campaign pwr_esf',
    'CC-10': 'probe', 'CC-10b': 'probe',
    'PI-1': 'probe:TR-1', 'PI-2': 'probe:TR-2', 'PI-3': 'todo (with interlock build)',
    'PI-4': 'probe:TR-8 (AFW on MFW loss at power)', 'PI-5': 'probe:CC-3', 'PI-6': 'RETIRED (single-loop plant)',
    'PI-7': 'probe', 'PI-7-reset': 'existing:run_ops abuse scram-then-withdraw (reset leg added P4)',
    'PI-8': 'todo (with interlock build)', 'PI-9': 'todo (verify SLB path)',
  };

  var PROBES = {

    // ============================================== 1. steady-state operating map

    'SS-1': function () {
      return test('SS-1 100% snapshot — the SLX-100 operating point', function (ck) {
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
      // This plant's program (feel-plan P3): shallow 297 → ~304 °C — a small plant
      // with a generously-sized SG needs less ΔT growth with load. The monotonic
      // rise is the [I] invariant; the anchor numbers are this plant's character.
      return test('SS-2 Tavg program — rises with load (297 → ~304 °C)', function (ck) {
        var hz = H('hot_zero_power'); hz.run(300);
        var h5 = H('50_percent');     h5.run(600);
        var hf = H('hot_full_power'); hf.run(300);
        var t0 = hz.ts().tavg_c, t50 = h5.ts().tavg_c, t100 = hf.ts().tavg_c;
        ck('no-load Tavg 295..299 °C', fmt(t0, 1), t0 > 295 && t0 < 299, '295..299');
        ck('50% Tavg 299..303 °C (SS-3)', fmt(t50, 1), t50 > 299 && t50 < 303, '299..303');
        ck('program rises ≥ 5 °C no-load → full', fmt(t100 - t0, 1), (t100 - t0) >= 5, '≥ 5');
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
        ck('electrical ≈ rated (100 ±5 MWe)', fmt(t.mwe_output, 0), near(t.mwe_output, 100, 5), '100 ±5');
        T.checkSanity(ck, h);
      });
    },

    // ======================================================= 2. normal evolutions

    // FG-2: a stepped load ramp completes with no trip and power follows the
    // demand down. At ENGINE level (no rods_tavg channel) Tavg RISES to carry the
    // mismatch — the MTC sheds the power thermally; that is the honest rod-less
    // physics. The program-TRACKING version of this ramp (Tref slides, rods walk
    // Tavg down) is pinned in run_autoctl's demand-swing suite.
    'EV-3': function () {
      return test('EV-3 load ramp (rod-less) — power follows, Tavg carries the mismatch, no trip', function (ck) {
        var h = H('hot_full_power');
        h.run(60);
        var t0 = h.ts().tavg_c;
        for (var i = 1; i <= 6; i++) {           // 100 → 70 MWe in 5 MWe steps, ~5 %/min
          h.cmd('set_load_target', { mwe: 100 - i * 5 });
          h.run(60);
        }
        h.run(300);
        var t = h.ts();
        ck('no trip through the ramp', h.tripReason || 'none', h.tripTime == null, 'none');
        ck('power followed the demand down (≤ 80 %)', fmt(t.power_pct, 1), t.power_pct <= 80, '≤ 80');
        ck('Tavg rose to carry the rod-less mismatch (MTC self-regulation)',
          fmt(t0, 1) + ' → ' + fmt(t.tavg_c, 1), t.tavg_c > t0 + 5, 'rises');
        ck('bounded below the high-Tavg backstop (335)', fmt(t.tavg_c, 1), t.tavg_c < 330, '< 330');
        T.checkSanity(ck, h);
      });
    },

    // FG-2 / EV-11 (owner ruling 2026-07-21, re-calibrated with the real-like MTC):
    // manual slider-only dispatch SHOWS ITS COSTS — the strong moderator feedback
    // delivers the ask almost exactly, but the price is Tavg parked ~+7 °C above
    // the program (the coolant carries the un-trimmed mismatch, real-core style).
    // Teaching behavior, not defects. (The mind-the-feed half of EV-11 — SG parking
    // low on the M5 fallback coupling — is pinned by the pwr_shift_exam gates.)
    'EV-11': function () {
      return test('EV-11 manual dispatch shows its costs (slider-only ask)', function (ck) {
        var h = H('hot_full_power');
        h.run(60);
        h.cmd('set_load_target', { mwe: 85 });
        h.run(900);
        var t = h.ts();
        ck('no trip — the plant carries a slider-only cut', h.tripReason || 'none', h.tripTime == null, 'none');
        ck('output tracks the ask closely (85 ±2 — the MTC delivers)',
          fmt(t.mwe_output, 0) + ' vs ask 85', near(t.mwe_output, 85, 2), '85 ±2');
        ck('but Tavg parks HIGH of program (~+7 °C un-trimmed mismatch)',
          fmt(t.tavg_c, 1), t.tavg_c > 305 && t.tavg_c < 316, '305..316');
        T.checkSanity(ck, h);
      });
    },

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

    // Re-authored for the RIDE-OUT ruling (catalog v3 FG-4, feel-plan P4): this
    // plant's ~105 % dump swallows a full load rejection — a turbine trip is a
    // transient the operator manages, NOT a scram. The v2.0 anticipatory-trip
    // expectation (P-9) is retired with the ruling.
    'TR-1': function () {
      return test('TR-1 turbine trip @100% — RIDE-OUT: dump catches, operator recovers, no scram', function (ck) {
        var h = H('hot_full_power');
        h.run(30);
        h.cmd('inject_failure', { failure_id: 'turbine_trip' });
        // Phase 1 — hands-off ride: the TRIP-OPEN dump (Tavg-error fast-open,
        // real Westinghouse behavior) catches the rejected load immediately —
        // the reactor keeps making near-full power straight into the condenser
        // with only a gentle Tavg swell. Graceful catch, then YOUR recovery.
        h.run(180);
        var mid = h.ts();
        ck('no scram through the hands-off ride', h.tripReason || 'none', h.tripTime == null, 'none');
        ck('dump carries near-full power (90..103 %)', fmt(mid.power_pct, 0),
          mid.power_pct > 90 && mid.power_pct < 103, '90..103');
        ck('Tavg swells only gently (300..312)', fmt(mid.tavg_c, 1),
          mid.tavg_c > 300 && mid.tavg_c < 312, '300..312');
        // Phase 2 — the operator recovers at their own pace: rods walk the
        // plant down to the no-load point on the dump.
        var guard = 0;
        while (h.ts().power_pct > 10 && guard++ < 40 && h.tripTime == null) {
          h.cmd('rod_nudge', { group_id: 'control_rods', steps: -2 });
          h.run(20);
        }
        h.run(240);
        var t = h.ts();
        ck('no scram through the recovery either', h.tripReason || 'none', h.tripTime == null, 'none');
        ck('Tavg settled to the no-load anchor (297 ±5 °C)', fmt(t.tavg_c, 1), near(t.tavg_c, 297, 5), '297 ±5');
        ck('no PORV lift anywhere in the event', fmt(h.range('pressure_mpa').max, 2),
          h.range('pressure_mpa').max < 16.20, '< 16.20');
        ck('dump carried the rejected load (peak ≥ 55 %)', fmt(h.range('steam_dump_valve_pct').max, 0),
          h.range('steam_dump_valve_pct').max >= 55, '≥ 55');
        ck('SG never approached the lo-lo trip (min ≥ 25 %)', fmt(h.range('sg_level_pct').min, 1),
          h.range('sg_level_pct').min >= 25, '≥ 25');
        ck.info('peak Tavg during the ride', fmt(h.range('tavg_c').max, 1) + ' °C');
        T.checkSanity(ck, h);
      });
    },

    // TR-8 (FG-4, owner ruling 2026-07-21): loss of condenser vacuum — turbine
    // trips on the vacuum limit, the dump is UNAVAILABLE (no condenser), the
    // condensate path dies so main feed is lost, and the untended plant trips
    // later on a GENUINE limit (SG lo-lo / pressure) — physics, not anticipation.
    'TR-8': function () {
      return test('TR-8 loss of vacuum @100% — dump unavailable, genuine-limit trip', function (ck) {
        var h = H('hot_full_power');
        h.run(30);
        h.cmd('inject_failure', { failure_id: 'loss_of_condenser_vacuum' });
        var dt = h.runUntil(function (ts, ins, hh) { return hh.tripTime != null; }, 900);
        var t = h.ts();
        ck('turbine tripped on the vacuum limit', String(t.turbine_tripped), !!t.turbine_tripped, 'true');
        ck('steam dump unavailable with the condenser lost (max ≈ 0 %)',
          fmt(h.range('steam_dump_valve_pct').max, 1), h.range('steam_dump_valve_pct').max < 5, '< 5');
        ck('reactor tripped later on a genuine limit (not anticipation)',
          dt >= 0 ? fmt(dt, 0) + ' s — ' + (h.tripReason || '?') : 'no trip in 900 s',
          dt >= 8, '≥ 8 s (no anticipatory trip), then a real limit');
        ck.info('trip cause', h.tripReason || 'none');
      });
    },

    // Re-specified 2026-07-21 (P5): in this plant's lumped SG the first-seconds
    // pressure wave is caught by the trip-open dump for ANY load rejection, so
    // the canon PORV lift lives where TMI's actually did — in the DRYOUT phase
    // with AFW unavailable (TR-3/CC-5 below). TR-2 with AFW available is the
    // saved case: AFW carries the SGs, no PORV, trip on the genuine lo-lo limit.
    'TR-2': function () {
      return test('TR-2 loss of main feedwater @100% — AFW carries it, lo-lo trips it', function (ck) {
        var h = H('hot_full_power');
        h.run(30);
        h.cmd('inject_failure', { failure_id: 'loss_of_feedwater' });
        var dt = h.runUntil(function (ts, ins, hh) { return hh.tripTime != null; }, 300);
        ck('reactor trips ≤ 90 s on the genuine lo-lo limit', dt >= 0 ? fmt(dt, 1) + ' s' : 'no trip in 300 s',
          dt >= 0 && dt <= 90, '≤ 90 s');
        h.run(300);
        ck('turbine tripped with/after the reactor', String(h.ts().mwe_output < 5),
          h.ts().mwe_output < 5, 'true');
        ck('AFW auto-started and carries the SGs (no dryout)', String(!!h.ts().afw_active),
          !!h.ts().afw_active, 'true');
        ck('with AFW available the PORV is NOT needed', fmt(h.range('pressure_mpa').max, 2),
          h.range('pressure_mpa').max < 16.20, '< 16.20');
        T.checkSanity(ck, h);
      });
    },

    // TR-3 / the CC-5 canon pin: loss of feed WITH AFW blocked (the actual TMI-2
    // lineup) — the SG dries out, decay heat has nowhere to go, the primary heats
    // to saturation and repressurizes over ~10-20 min, and the capped spray CANNOT
    // stop it: the PORV lifts. This is the sim-honest home of the canon PORV lift
    // (the first-seconds wave is caught by the trip-open dump on every rejection).
    'TR-3': function () {
      return test('TR-3 loss of feed + AFW blocked — dryout repressurization lifts the PORV', function (ck) {
        var h = H('hot_full_power');
        h.run(30);
        h.cmd('inject_failure', { failure_id: 'afw_failure' });
        h.cmd('inject_failure', { failure_id: 'loss_of_feedwater' });
        var dt = h.runUntil(function (ts, ins, hh) { return hh.tripTime != null; }, 300);
        ck('reactor trips on the lo-lo limit first', dt >= 0 ? fmt(dt, 0) + ' s' : 'no trip', dt >= 0, 'trips');
        var dl = h.runUntil(function (ts) { return ts.porv_open; }, 1800);
        ck('the dry-SG repressurization lifts the PORV (spray loses)',
          dl >= 0 ? fmt(dl, 0) + ' s after trip' : 'no lift in 30 min — peak ' + fmt(h.range('pressure_mpa').max, 2),
          dl >= 0, 'PORV lifts');
        ck.info('peak pressure', fmt(h.range('pressure_mpa').max, 2) + ' MPa');
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
        h.cmd('inject_failure', { failure_id: 'sgtr', severity: 0.003 });   // = old 0.15 pre-rescale (leak_scale 0.03 -> 1.5)
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

    // TR-13 (FG-6 ladder, owner-ruled rescale): a FULL tube rupture (leak ≈ 0.12
    // normalized ≈ 2× charging_max) OVERWHELMS the CVCS — level and pressure
    // fall through the trip + SI no matter what auto make-up does. That is the
    // whole reason the EOP exists. And because the leak is ΔP-scaled, the
    // depressurization SELF-LIMITS it — pinned here, driven to termination in
    // the ops single-SG EOP scenario.
    'TR-13': function () {
      return test('TR-13 full SGTR — overwhelms charging, forces trip + SI', function (ck) {
        var h = H('hot_full_power');
        h.cmd('set_cvcs_auto', { active: true });
        h.run(30);
        h.cmd('inject_failure', { failure_id: 'sgtr', severity: 1.0 });
        h.run(1);
        var base = h.eng.s._leak_base;
        ck('full-severity BASE leak exceeds charging capacity (~2×)', fmt(base, 3) + ' vs max 0.06',
          base > 0.06, '> 0.06');
        var dt = h.runUntil(function (ts, ins, hh) { return hh.tripTime != null; }, 900);
        ck('CVCS cannot hold it — the plant trips', dt >= 0 ? fmt(dt, 0) + ' s — ' + (h.tripReason || '?') : 'no trip',
          dt >= 0, 'trips');
        var ds = h.runUntil(function (ts) { return ts.hpi_active; }, 600);
        ck('SI actuates on the continuing depressurization', ds >= 0 ? fmt(ds, 0) + ' s after trip' : 'no SI',
          ds >= 0, 'SI');
        h.run(300);
        var t = h.ts();
        ck('ΔP scaling limits the delivered leak below the base rate',
          fmt(t.leak_flow, 3) + ' vs base ' + fmt(base, 3), t.leak_flow < base * 0.9, '< 0.9 × base');
        T.checkSanity(ck, h);
      });
    },

    // CA-4 (FG-3/FG-7, feel-plan P4/P5): the going-solid backstop and its honest
    // limit. Leg 1: a SENSED overfill (operator floods with max charging) trips
    // PI-8 at 97 % before the plant goes water-solid. Leg 2: the same overfill
    // behind a level sensor failed LOW is INVISIBLE to the single-channel trip —
    // charging chases the stuck-low reading to the tank cap and nothing scrams.
    // That deception-defeats-the-backstop is the teaching point (real plants vote
    // 2-of-3 channels for exactly this reason).
    'CA-4': function () {
      return test('CA-4 overfill backstop — PI-8 trips a sensed overfill; a stuck-low sensor defeats it', function (ck) {
        var h = H('hot_full_power');
        h.run(30);
        h.cmd('set_charging_flow', { normalized: 0.06 });     // MANUAL max charging, letdown off
        var dt = h.runUntil(function (ts, ins, hh) { return hh.tripTime != null; }, 300);
        ck('PI-8 tripped the sensed overfill', dt >= 0 ? fmt(dt, 0) + ' s — ' + (h.tripReason || '?') : 'no trip',
          dt >= 0 && /pzr_level high/.test(h.tripReason || ''), 'pzr_level high');
        var h2 = H('hot_full_power');
        h2.cmd('set_cvcs_auto', { active: true });
        h2.run(30);
        h2.cmd('inject_failure', { failure_id: 'pzr_level_sensor_low' });
        h2.run(300);
        var t2 = h2.ts();
        ck('charging flooded the plant chasing the stuck-low reading',
          fmt(t2.core_inventory_pct, 1) + ' %', t2.core_inventory_pct > 110, '> 110');
        ck('TRUE level at/near solid', fmt(t2.pzr_level_pct, 1), t2.pzr_level_pct >= 95, '≥ 95');
        ck('the single-channel trip was FOOLED (no scram — the CA-4 deception)',
          h2.tripReason || 'none', h2.tripTime == null, 'none');
        T.checkSanity(ck, h2);
      });
    },

    'CC-3': function () {
      return test('CC-3 post-trip feedwater — MFW isolates, AFW takes the SGs', function (ck) {
        var h = H('hot_full_power');
        h.run(30);
        h.cmd('scram');
        h.run(600);
        var t = h.ts();
        // condensate_flow reads MAIN feed only (fw_flow includes AFW downstream
        // of the isolation gate — the P-14 design point).
        ck('main feed isolated once Tavg is at no-load (condensate_flow ≈ 0)',
          fmt(t.condensate_flow_normalized, 3), t.condensate_flow_normalized < 0.02, '< 0.02');
        ck('AFW auto-started for the handoff', String(t.afw_active), !!t.afw_active, 'true');
        // The dip depth here is the TR-15 shrink taste knob (current tuning
        // ~13-14 % min): hard enough to get attention, recovery assured by AFW.
        ck('SG dip bounded through the handoff (min ≥ 8 %)', fmt(h.range('sg_level_pct').min, 1),
          h.range('sg_level_pct').min >= 8, '≥ 8');
        ck('AFW recovered the SG by the end (≥ 15 %)', fmt(t.sg_level_pct, 1),
          t.sg_level_pct >= 15, '≥ 15');
      });
    },

    // The #22/#23 pin, re-specified (P5): the spray line has a PHYSICAL capacity
    // cap — an operator (or the auto servo) commanding full spray gets the cap,
    // not the fire hose. The "spray loses the repressurization race" half of the
    // old CC-5 lives in TR-3 (the sim-honest dryout path).
    'CC-5': function () {
      return test('CC-5 spray capacity — the flow cap binds every demand', function (ck) {
        var h = H('hot_full_power');
        h.run(30);
        h.cmd('set_spray', { pct: 100 });
        h.run(30);
        var cap = h.eng.cfg.pressurizer.spray_flow_max;
        ck('a full-open command delivers only the cap', fmt(h.eng.s.spray_flow_frac, 2) + ' vs cap ' + fmt(cap, 2),
          h.eng.s.spray_flow_frac <= cap + 1e-9, '≤ ' + fmt(cap, 2));
        ck('capped spray still depressurizes (step-insurge authority is real)',
          fmt(h.ts().pressure_mpa, 2), h.ts().pressure_mpa < 15.35, '< 15.35');
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
        h.cmd('inject_failure', { failure_id: 'sgtr', severity: 0.002 });   // = old 0.1 pre-rescale (stays inside CVCS capacity by design)
        h.run(900);
        var t = h.ts();
        // With DERIVED level the servo settles at charging = letdown + leak EXACTLY
        // (the old +0.003 margin was the mass-windup drift, not physics) — the spec
        // is only that charging clearly rose to carry the leak.
        ck('charging rose above letdown to make up the leak',
          fmt(t.charging_flow_actual, 3) + ' vs ' + fmt(t.letdown_flow_actual, 3),
          t.charging_flow_actual > t.letdown_flow_actual + 0.0005, 'charging > letdown');
        ck('pzr level held ≥ 40 %', fmt(h.range('pzr_level_pct').min, 1),
          h.range('pzr_level_pct').min >= 40, '≥ 40');
        ck('no trip while CVCS carries it', h.tripReason || 'none', h.tripTime == null, 'none');
        T.checkSanity(ck, h);
      });
    },

    // Discovered by this battery's first run (2026-07-20), fixed by the derived-level
    // rework (2026-07-21): level is a pure function of inventory + expansion + void,
    // so the CVCS servo holding level IS holding inventory — no silent windup possible.
    'CC-10': function () {
      return test('CC-10 level↔mass coupling — CVCS holds level WITHOUT inventory windup', function (ck) {
        var h = H('hot_full_power');
        h.cmd('set_cvcs_auto', { active: true });
        h.run(60);
        h.cmd('inject_failure', { failure_id: 'sgtr', severity: 0.002 });   // = old 0.1 pre-rescale (stays inside CVCS capacity by design)
        h.run(900);
        var t = h.ts();
        ck('pzr level held near program (50..60 %)', fmt(t.pzr_level_pct, 1),
          t.pzr_level_pct > 50 && t.pzr_level_pct < 60, '50..60');
        ck('true inventory conserved 97..103 % (no silent windup)',
          fmt(h.range('core_inventory_pct').min, 1) + '..' + fmt(h.range('core_inventory_pct').max, 1),
          h.range('core_inventory_pct').min >= 97 && h.range('core_inventory_pct').max <= 103, '97..103');
      });
    },

    // The catalog v3 FG-3 boundary invariant [I]: the level gauge is honest outside
    // void regimes. A subcooled inventory loss LOWERS true level (tracking the mass),
    // and the TMI rise appears ONLY once the primary saturates and voids. Permanent
    // regression fence around the deception boundary.
    'CC-10b': function () {
      return test('CC-10b deception boundary — subcooled loss lowers level; only voiding raises it', function (ck) {
        var h = H('hot_full_power');
        h.run(30);
        var l0 = h.ts().pzr_level_pct, inv0 = h.ts().core_inventory_pct;
        h.cmd('inject_failure', { failure_id: 'sgtr', severity: 0.006 });   // = old 0.3 pre-rescale; CVCS stays MANUAL: nothing makes it up
        h.run(120);
        var t = h.ts();
        ck('still subcooled through the early drain', fmt(t.subcooling_c, 1), t.subcooling_c > 0, '> 0');
        ck('no void yet (deception gated on saturation)', fmt(t.primary_void_fraction, 3),
          t.primary_void_fraction === 0, '0');
        ck('true level FELL with the inventory (honest gauge while subcooled)',
          fmt(l0, 1) + ' → ' + fmt(t.pzr_level_pct, 1) + ' (inv ' + fmt(inv0, 1) + ' → ' + fmt(t.core_inventory_pct, 1) + ')',
          t.pzr_level_pct < l0 - 1 && t.core_inventory_pct < inv0 - 1, 'both fall');
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
