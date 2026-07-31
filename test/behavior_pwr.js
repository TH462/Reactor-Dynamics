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
    'TR-1': 'probe (FULL load rejection — the ride-out, past the dump\'s stop)',
    'TR-1g': 'probe (50 % loss of load — the real Westinghouse design case, 40 % dump)',
    'TR-1b': 'probe (turbine trip → P-9 scram, #216)',
    'TR-1c': 'probe (sub-threshold rejection — the arm cliff, declared §8.21, #219)',
    'TR-1d': 'probe (PLANNED OFFLINE is not a turbine trip — #230)',
    'TR-1e': 'probe (grid holds the rotor at zero load; MWe follows the turbine — #284)',
    'TR-1f': 'probe (P-9 reads the NIS channel, not truth — #220)',
    'TR-2': 'probe', 'TR-3': 'probe',
    'TR-4': 'probe (lumped-RCP model: total-loss trip; P-8 single-loop needs multi-loop model)',
    'TR-5': 'probe', 'TR-6': 'existing:run_ops grid step + steam_dump_capacity_cap',
    'TR-7': 'probe', 'TR-8': 'probe',
    'TR-9': 'existing:run_ops sg_overfeed_p14 + run_pwr feedwater_isolation',
    'TR-14': 'probe (LOFW drain rate vs Ginna UFSAR Table 15.2-4 — the SOURCED anchor, #135)',
    // TR-11: the catalog row ("heaters lose, low-P trip unless isolated") predates
    // the P5 spray capacity cap — measured under the cap the heaters WIN, and the
    // probe pins that end state. See the probe comment and Diagnostic/TUNING_LOG.md.
    'TR-10': 'probe', 'TR-11': 'probe (end-state pin) + existing:run_ops heaters vs spray fight',
    'TR-12': 'probe + run_campaign pwr_slb', 'TR-12b': 'probe (MSIV isolates a downstream break, #199)',
    'TR-13': 'probe + ops SGTR single-SG EOP', 'TR-13b': 'probe',
    'SS-9': 'probe (cold thermal stability)', 'SS-10': 'probe (severity clamp)',
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
    'PI-1': 'probe:TR-1', 'PI-2': 'probe:TR-2', 'PI-3': 'probe (blocked-case legs + P-11 permissive)',
    'PI-4': 'probe:TR-8 (AFW on MFW loss at power)', 'PI-5': 'probe:CC-3', 'PI-6': 'RETIRED (single-loop plant)',
    'PI-7': 'probe', 'PI-7-reset': 'existing:run_ops abuse scram-then-withdraw (reset leg added P4)',
    'PI-8': 'probe (setpoint + ordering) + probe:CA-4 (both behaviour legs)',
    'PI-9': 'probe — RETIRED 2026-07-25 by owner ruling (#199); the probe fences the absence, catalog §10',
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
          h.cmd('rod_nudge', { group_id: 'control_rods', steps: -4 });
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

    /* TR-1 RE-BANDED 2026-07-31 for the 40 % dump *(OWNER RULING: "Let's change it to
     * 40%.")*. The old bands were minted at the P4 freeze from a 105 % dump and encoded a
     * plant where the dump could swallow a full rejection on its own: "dump carries
     * near-full power (90..103 %)", "Tavg swells only gently (300..312)", "no PORV lift".
     * At the prototypical capacity none of those describe the event any more, and the
     * event they described was a non-event — measured at 1.05, Tavg reached 305.3 °C and
     * power held 97.5 %, i.e. the plant barely noticed a total loss of load.
     *
     * WHAT THIS PROBE ASSERTS NOW is the DEFENCE-IN-DEPTH LADDER running in order, which
     * is the thing a 40 % dump makes visible and a 105 % dump hides: the dump saturates at
     * its stop, the core self-throttles to match, the PORV lifts as the designed backstop,
     * and the pressurizer safety never has to. FG-4 is unchanged and still checked first —
     * NO SCRAM, and the operator still walks it down at their own pace.
     *
     * A real Westinghouse plant does not ride a full rejection either (its design case is
     * a 50 % loss of load), so the relief lifts here are prototypical rather than a
     * defect. The 50 % case is the one that must stay clean, and TR-1g pins it. */
    'TR-1': function () {
      return test('TR-1 load rejection @100% — RIDE-OUT: the ladder runs in order, no scram', function (ck) {
        var h = H('hot_full_power');
        h.run(30);
        // Full load rejection: demand to zero with the turbine still on line.
        h.cmd('set_load_target', { mwe: 0 });
        // Phase 1 — hands-off ride. The dump opens to its stop and STAYS there; from that
        // point the reactor itself has to shed the difference, through MTC. That handover
        // is the lesson, and at 105 % it never happened.
        h.run(180);
        var mid = h.ts();
        var cap = 100 * RD.PWR_CONFIG.steam_generator.steam_dump_max;
        ck('no scram through the hands-off ride', h.tripReason || 'none', h.tripTime == null, 'none');
        ck('the dump SATURATES — it is a finite resource now', fmt(h.range('steam_dump_valve_pct').max, 0),
          h.range('steam_dump_valve_pct').max >= cap - 1, '≥ ' + fmt(cap - 1, 0) + ' % (its cap)');
        ck('so the CORE sheds the rest — self-throttles toward the dump (40..55 %)', fmt(mid.power_pct, 0),
          mid.power_pct > 40 && mid.power_pct < 55, '40..55');
        ck('Tavg swells hard but stays under the 335 °C scram', fmt(mid.tavg_c, 1),
          mid.tavg_c > 312 && mid.tavg_c < 335, '312..335');
        // Phase 2 — the operator recovers at their own pace: rods walk the
        // plant down to the no-load point on the dump.
        var guard = 0;
        while (h.ts().power_pct > 10 && guard++ < 40 && h.tripTime == null) {
          h.cmd('rod_nudge', { group_id: 'control_rods', steps: -8 });
          h.run(20);
        }
        h.run(240);
        var t = h.ts();
        ck('no scram through the recovery either', h.tripReason || 'none', h.tripTime == null, 'none');
        ck('Tavg settled to the no-load anchor (297 ±5 °C)', fmt(t.tavg_c, 1), near(t.tavg_c, 297, 5), '297 ±5');
        // The PORV is SUPPOSED to lift here — it is the next rung once the dump is at its
        // stop. Asserted positively, so that a future change quietly restoring enough dump
        // capacity to suppress it has to come and edit this line.
        ck('the PORV lifts — the designed backstop, not a defect', fmt(h.range('pressure_mpa').max, 2),
          h.range('pressure_mpa').max >= 16.20, '≥ 16.20 MPa');
        ck('…and the pressurizer SAFETY never has to (17.13)', fmt(h.range('pressure_mpa').max, 2),
          h.range('pressure_mpa').max < 17.13, '< 17.13 MPa');
        ck('SG never approached the lo-lo trip (min ≥ 25 %)', fmt(h.range('sg_level_pct').min, 1),
          h.range('sg_level_pct').min >= 25, '≥ 25');
        ck.info('peak Tavg during the ride', fmt(h.range('tavg_c').max, 1) + ' °C');
        ck.info('peak SG pressure (safeties at 9.31)', fmt(h.range('steam_pressure_mpa').max, 2) + ' MPa');
        T.checkSanity(ck, h);
      });
    },

    /* TR-1g (NEW 2026-07-31, with the 40 % dump) — THE REAL DESIGN CASE, and the one that
     * justifies the capacity. Westinghouse sizes a 40 % dump so that a **50 % loss of
     * load** needs no reactor trip: *"the Turbine Bypass System, designed for 40 percent
     * of rated steam flow, is provided to give a maximum load rejection capability, in
     * conjunction with a 10 percent reactor power decrease, of 50 percent rated steam flow
     * without a trip"* (STPEGS UFSAR §10.4.4, ML22140A078); *"The Westinghouse design
     * criterion is that load rejections up to 50% should not require a reactor trip"*
     * (Vogtle LAR, ML072470691).
     *
     * Measured, this plant reproduces the documented SPLIT, not just the outcome: the dump
     * saturates at 40 % and the core runs back to 89.3 % — a 10.7 % step, against the real
     * plant's 10 % from rod control. Ours comes from MTC rather than the rod controller,
     * which is a mechanism difference worth knowing, but the division of labour is the
     * same and that is what the capacity is sized for.
     *
     * This is the check that says 40 % is ENOUGH. TR-1 says what happens past it. Without
     * this one, lowering the dump further would go unnoticed until a full rejection. */
    'TR-1g': function () {
      return test('TR-1g 50% loss of load — the real design case: no trip, no relief lift', function (ck) {
        var h = H('hot_full_power');
        h.run(30);
        h.cmd('set_load_target', { mwe: 50 });
        h.run(600);
        var t = h.ts();
        var cap = 100 * RD.PWR_CONFIG.steam_generator.steam_dump_max;
        ck('no reactor trip — the design criterion', h.tripReason || 'none', h.tripTime == null, 'none');
        ck('no PORV lift', fmt(h.range('pressure_mpa').max, 2),
          h.range('pressure_mpa').max < 16.20, '< 16.20 MPa');
        ck('no SG safety lift (the other thing 40 % is sized for)', fmt(h.range('steam_pressure_mpa').max, 2),
          h.range('steam_pressure_mpa').max < 9.31, '< 9.31 MPa');
        ck('the dump is AT its stop — 40 % is doing all it can', fmt(h.range('steam_dump_valve_pct').max, 0),
          h.range('steam_dump_valve_pct').max >= cap - 1, '≥ ' + fmt(cap - 1, 0) + ' %');
        // The documented split: dump 40 % + a ~10 % reactor step = 50 % of load absorbed.
        ck('…and the core takes the documented ~10 % step (85..93 %)', fmt(t.power_pct, 1),
          t.power_pct > 85 && t.power_pct < 93, '85..93 %');
        ck('Tavg swells modestly and holds (300..315)', fmt(h.range('tavg_c').max, 1),
          h.range('tavg_c').max > 300 && h.range('tavg_c').max < 315, '300..315');
        T.checkSanity(ck, h);
      });
    },

    /* TR-1b (#216, owner ruling 2026-07-26) — the other half of the split. Above P-9
     * (~50 % power) a turbine trip scrams the reactor, prototypical Westinghouse: the
     * stop valves slam and the heat sink is gone, so protection anticipates rather than
     * waiting for a process limit. The plant then rides its OWN decay heat out on the
     * dump. Contrast TR-1 (load rejection, turbine stays on line → no scram) and TR-8
     * (turbine trip with the condenser LOST → no dump, so a genuine-limit trip). */
    'TR-1b': function () {
      return test('TR-1b turbine trip @100% — P-9 scrams the reactor, dump takes the decay heat', function (ck) {
        var h = H('hot_full_power');
        h.run(30);
        var t0 = h.t;
        h.cmd('inject_failure', { failure_id: 'turbine_trip' });
        var dt = h.runUntil(function (ts, ins, hh) { return hh.tripTime != null; }, 120);
        ck('the reactor trips on the turbine trip', dt >= 0 ? fmt(dt, 0) + ' s — ' + (h.tripReason || '?') : 'no trip in 120 s',
          dt >= 0 && /turbine_tripped/.test(h.tripReason || ''), 'turbine_tripped is_true');
        ck('it is ANTICIPATORY — inside 5 s, not waiting for a process limit',
          dt >= 0 ? fmt(dt, 1) + ' s' : 'never', dt >= 0 && dt <= 5, '≤ 5 s');
        h.run(600);
        var t = h.ts();
        ck('the dump carries decay heat to the condenser', fmt(h.range('steam_dump_valve_pct').max, 0),
          h.range('steam_dump_valve_pct').max >= 20, '≥ 20 %');
        ck('SG code safeties never lift (the dump got there first)', String(!!t.sg_safety_open),
          h.range('steam_pressure_mpa').max < 9.31, 'no lift (< 9.31 MPa)');
        ck('no PORV lift on the primary side', fmt(h.range('pressure_mpa').max, 2),
          h.range('pressure_mpa').max < 16.20, '< 16.20');
        ck('settles at the no-load anchor (297 ±6 °C)', fmt(t.tavg_c, 1), near(t.tavg_c, 297, 6), '297 ±6');
        ck('SG level held well clear of the lo-lo trip', fmt(h.range('sg_level_pct').min, 1),
          h.range('sg_level_pct').min >= 25, '≥ 25 %');
        ck('core intact', fmt(h.range('fuel_temp_c').max, 0), h.range('fuel_temp_c').max < 1200, '< 1200 °C');
        T.checkSanity(ck, h);
      });
    },

    /* TR-1d (#230, owner ruling 2026-07-28) — the third member of the TR-1 family, and
     * the one that says what `disconnect_grid` MEANS. Taking the generator off line is a
     * planned evolution, not a turbine trip: the breaker opens, the stop valves do not
     * slam, nothing latches, and P-9 is therefore never armed. Contrast TR-1 (load
     * rejection, ride-out) and TR-1b (turbine trip → P-9 scram).
     *
     * This asserts the CLAIM, not the code (HR10). Every check below FAILS on the
     * pre-#230 engine, where disconnect_grid called SG.tripTurbine: phase 1 scrammed
     * instantly on `turbine_tripped is_true`, and phase 2 latched a turbine trip at 5 %
     * power that armed P-9 for the rest of the evolution. Verified by running this probe
     * against the old mapping before the fix landed. */
    /* TR-1e (#284) — THE GRID HOLDS THE ROTOR, AND THE GAUGE READS THE TURBINE.
     * Two defects that shared a file and a cause, both invisible to 34 green runners.
     *
     * (1) The rated-speed hold asked `generator_load > 0` instead of asking whether the
     *     BREAKER was closed, so an operator sliding the Manual load target to 0 MWe while
     *     synchronised fell into the OFFLINE coastdown branch: measured, 1800 -> 0 rpm over
     *     ~5 plant-minutes with `turbine_tripped` false and the unit still on line. A
     *     synchronous machine tied to the grid spins at rated at ANY load, including zero.
     * (2) `mwe_output` was derived from `power_pct` — the heat the REACTOR makes — so it
     *     ignored both the governor and the steam dump. Measured, a 50 MWe ask at hot full
     *     power settled at 98.8 MWe indicated with the dump venting 48 % to the condenser.
     *     The operator asked for 50 and the gauge said 99.
     *
     * WHY THIS PROBE AND NOT A UNIT TEST: nothing in the suite compared what the turbine
     * was ADMITTED against what the reactor MADE. Every existing check runs at states where
     * the two agree (steady power, or a trip that zeroes both), which is exactly why a 2x
     * error on a board gauge survived. The third leg pins #235's fix from the other side —
     * off line the rotor MUST still coast, or this fix has traded one bug for the old one.
     *
     * VERIFIED BY INJECTION, not by writing it beside the fix: with both engine lines
     * reverted this probe fails 3 checks — the rotor pair reads 0 rpm (end and minimum),
     * and the rejection leg reads 98.78 MWe against its 50 ±3 band. The other legs stay
     * green on the old engine BY DESIGN: leg C and leg D are the two things this fix must
     * NOT change, so a red there would mean the fix broke something, not that it worked. */
    'TR-1e': function () {
      return test('TR-1e synchronised at zero load — the grid holds the rotor; MWe follows the turbine', function (ck) {
        // ---- leg A: Manual load target 0 MWe while ON LINE. The rotor must not slow.
        var z = H('hot_full_power');
        z.run(30);
        z.cmd('set_load_target', { mwe: 0 });
        z.run(600);                                  // 10 plant-min — 2x the old decay time
        var tz = z.ts();
        ck('still on line — the breaker never opened', String(tz.load_mode),
          tz.load_mode === 'manual', 'manual');
        ck('and not tripped', String(!!tz.turbine_tripped), !tz.turbine_tripped, 'false');
        ck('the grid holds the rotor at rated (was 0 rpm — #284)', fmt(tz.turbine_rpm, 0),
          near(tz.turbine_rpm, 1800, 20), '1800 ±20 rpm');
        ck('rotor never sagged at any point in the run', fmt(z.range('turbine_rpm').min, 0),
          z.range('turbine_rpm').min >= 1780, '≥ 1780 rpm');
        ck('zero load asked, zero output delivered', fmt(tz.mwe_output, 2),
          tz.mwe_output < 1, '< 1 MWe');

        // ---- leg B: the gauge must read the TURBINE, not the core. Above the C-7 arm the
        // dump carries the rejection and the reactor stays up — the one state where the two
        // numbers disagree by 2x, and the state the old formula got wrong.
        var d = H('hot_full_power');
        d.run(30);
        d.cmd('set_load_target', { mwe: 50 });
        d.run(600);
        var td = d.ts();
        ck('the dump is carrying the rejection', fmt(td.steam_dump_valve_pct, 0),
          td.steam_dump_valve_pct > 30, '> 30 %');
        // 90 -> 85 with the 40 % dump (2026-07-31): at a prototypical capacity the dump
        // saturates on a 50 % rejection and the core takes the documented ~10 % step, so it
        // settles at 89.3 % rather than 98.8 %. What this leg needs is only that the core
        // stays HIGH while the generator reads 50 — 89.3 vs 50 is still a 1.8x disagreement,
        // so the check discriminates exactly as well as it did at 2x.
        ck('the reactor is still up near full power', fmt(td.power_pct, 1),
          td.power_pct > 85, '> 85 %');
        ck('but the generator delivers what was ASKED, not what the core makes (was 98.8)',
          fmt(td.mwe_output, 2), near(td.mwe_output, 50, 3), '50 ±3 MWe');

        // ---- leg C: #235 must stay fixed. OFF line, the rotor still coasts to rest.
        var o = H('hot_full_power');
        o.run(30);
        o.cmd('disconnect_grid', {});
        o.run(600);
        ck('off line the rotor still coasts down (#235 not re-broken)', fmt(o.ts().turbine_rpm, 0),
          o.ts().turbine_rpm < 100, '< 100 rpm');

        // ---- leg D: rated calibration is untouched. steam_flow_rated is 1.0 in these
        // normalized units, so the new form is bit-identical to the old at 100 % power —
        // if this moves, the swap was not calibration-preserving after all.
        var r = H('hot_full_power');
        r.run(300);
        ck('rated output unchanged by the reformulation', fmt(r.ts().mwe_output, 2),
          near(r.ts().mwe_output, 100, 0.5), '100 ±0.5 MWe');
        T.checkSanity(ck, z);
      });
    },

    /* TR-1f (#220) — the P-9 permissive is an INSTRUMENT reading. The real one is
     * derived from the nuclear instrumentation and nothing else: *"The Power Range
     * Neutron Flux, P-9 interlock is actuated at approximately 50% power as determined
     * by two-out-of-four NIS power range detectors."* (NUREG-1431 Rev 4 Bases B 3.3.1,
     * ML12100A228). Ours read `s.power_pct` — TRUE power — so a permissive that gates
     * two reactor trips and an AFW auto-start could not be fooled by the channel it is
     * supposed to be reading. HR1, in the one place it is most expensive.
     *
     * Asserts the CLAIM, not the code (HR10). Verified by injection: on the pre-fix
     * engine leg B FAILS — the plant scrams on P-9 with the power-range channel reading
     * 40 %. Legs A and C are the calibration pins: with a healthy channel NOTHING moves,
     * which is what makes this a sensing fix rather than a protection change.
     *
     * DECLARED DEPARTURE (§8.11): one channel, not two-out-of-four, so a single failed
     * channel defeats the permissive here where a real plant out-votes it. That is the
     * lesson, not a defect — and it is the ONLY way the difference is observable. */
    'TR-1f': function () {
      return test('TR-1f P-9 reads the NIS channel — a failed power range defeats the permissive', function (ck) {
        // ---- leg A: healthy channel, the TR-1b behaviour must be untouched.
        var a = H('hot_full_power');
        a.run(30);
        ck('indicated power tracks truth when the channel is healthy',
          fmt(a.ins().power_range, 1) + ' vs ' + fmt(a.ts().power_pct, 1),
          Math.abs(a.ins().power_range - a.ts().power_pct) < 10, 'within 10 %');
        a.cmd('inject_failure', { failure_id: 'turbine_trip' });
        var dtA = a.runUntil(function (ts, ins, hh) { return hh.tripTime != null; }, 120);
        ck('turbine trip still scrams on P-9 (TR-1b unmoved)',
          dtA >= 0 ? fmt(dtA, 1) + ' s — ' + (a.tripReason || '?') : 'no trip in 120 s',
          dtA >= 0 && dtA <= 5 && /turbine_tripped/.test(a.tripReason || ''), '≤ 5 s on turbine_tripped');

        // ---- leg B: the channel fails LOW, below the 50 % setpoint, while the reactor
        // is genuinely at full power. P-9 must de-arm — the permissive believes its
        // instrument. Above P-10 (10 %) deliberately, so the IR/SR trips stay bypassed
        // and the only thing this leg can be measuring is P-9.
        var b = H('hot_full_power');
        b.run(30);
        b.cmd('set_instrument_failure', { instrument_id: 'power_range', mode: 'stuck', value: 40.0 });
        b.run(20);
        ck('channel stuck below the P-9 setpoint', fmt(b.ins().power_range, 1), b.ins().power_range < 50, '< 50 %');
        ck('while the reactor is really at power', fmt(b.ts().power_pct, 1), b.ts().power_pct > 90, '> 90 %');
        ck('not already scrammed by something else', String(!!b.ts().scrammed), !b.ts().scrammed, 'false');
        b.cmd('inject_failure', { failure_id: 'turbine_trip' });
        var dtB = b.runUntil(function (ts, ins, hh) { return hh.tripTime != null; }, 300);
        ck('P-9 is DE-ARMED — no anticipatory scram (was: scram at +0.5 s)',
          dtB >= 0 ? 'scram at +' + fmt(dtB, 1) + ' s on ' + b.tripReason : 'no scram in 300 s',
          dtB < 0, 'no scram');
        // …and the plant is then exactly the TR-1 ride-out case: dump to its stop, core
        // sheds the rest, PORV as the backstop. Re-banded 2026-07-31 with the 40 % dump —
        // what this leg needs is that the plant SURVIVES the un-anticipated turbine trip,
        // not that it survives it quietly.
        ck('the dump goes to its stop instead', fmt(b.range('steam_dump_valve_pct').max, 0),
          b.range('steam_dump_valve_pct').max >= 100 * RD.PWR_CONFIG.steam_generator.steam_dump_max - 1,
          '≥ its cap');
        ck('and the pressurizer safety never lifts (PORV holds it)', fmt(b.range('pressure_mpa').max, 2),
          b.range('pressure_mpa').max < 17.13, '< 17.13 MPa');

        // ---- leg C: the OTHER P-9 consumer, the SG hi-hi (P-14) reactor trip. Same
        // failed channel: the hi-hi must still isolate feed and trip the turbine, but
        // must NOT scram, because P-9 is what arms that leg.
        var c = H('hot_full_power');
        c.run(30);
        c.cmd('set_instrument_failure', { instrument_id: 'power_range', mode: 'stuck', value: 40.0 });
        c.run(20);
        c.cmd('inject_failure', { failure_id: 'sg_overfeed' });
        // The hi-hi's un-gated half fires first: isolate feed + trip the turbine. Catch it
        // there, because the feed isolation carries `reset_below: 85` and has already let
        // go by the end of the run — asserting it at the end pins a transient that is gone.
        var dtIso = c.runUntil(function (ts) { return !!ts.turbine_tripped; }, 600);
        ck('hi-hi still did its un-gated half — turbine tripped',
          dtIso >= 0 ? '+' + fmt(dtIso, 1) + ' s' : 'never', dtIso >= 0, 'yes');
        ck('…and the reactor was NOT scrammed at that moment (P-14 is P-9-gated)',
          String(!!c.ts().scrammed), !c.ts().scrammed, 'false');
        var dtC = c.runUntil(function (ts, ins, hh) { return hh.tripTime != null; }, 600);
        // The P-14 leg is `sg_level high`. What DOES happen is the sub-P-9 behaviour —
        // hi-hi isolates feed and trips the turbine, and the plant then trips ~2.5 min
        // later on `sg_level low`, a genuine limit reached by draining the bottled SG.
        // Measured: +153.0 s. That is the ride-out plant's honest failure path (FG-4),
        // and it is what "anticipation removed" is supposed to look like.
        ck('the P-14 leg did NOT scram — P-9 is what arms it',
          dtC >= 0 ? 'scram at +' + fmt(dtC, 1) + ' s on ' + c.tripReason : 'no scram in 600 s',
          !/sg_level high/.test(c.tripReason || ''), 'not sg_level high');
        T.checkSanity(ck, a);
      });
    },

    'TR-1d': function () {
      return test('TR-1d planned offline — breaker opens, turbine NOT tripped, no reactor trip', function (ck) {
        // ---- phase 1: at power. The dangerous case: pre-#230 this scrammed on P-9.
        var h = H('hot_full_power');
        h.run(30);
        h.cmd('disconnect_grid', {});
        h.run(300);
        var t = h.ts();
        ck('no reactor trip on a planned offline at 100 %', h.tripReason || 'none', h.tripTime == null, 'none');
        ck('the turbine is NOT flagged tripped', String(!!t.turbine_tripped), !t.turbine_tripped, 'false');
        ck('the unit is off line', String(t.load_mode), t.load_mode === 'disconnected', 'disconnected');
        ck('the breaker is open — no electrical output', fmt(t.mwe_output, 1), t.mwe_output < 1, '≈ 0 MWe');
        // A planned offline at 100 % IS a full load rejection, so it lands in TR-1's
        // territory: dump to its stop, core sheds the rest, PORV as the backstop. Re-banded
        // 2026-07-31 with the 40 % dump. TR-1d's CLAIM is about `disconnect_grid` not being
        // a turbine trip (#230) — those four checks above are the ones that carry it, and
        // they are untouched. These two only have to confirm it stayed survivable.
        ck('the dump goes to its stop', fmt(h.range('steam_dump_valve_pct').max, 0),
          h.range('steam_dump_valve_pct').max >= 100 * RD.PWR_CONFIG.steam_generator.steam_dump_max - 1,
          '≥ its cap');
        ck('the pressurizer safety never lifts', fmt(h.range('pressure_mpa').max, 2),
          h.range('pressure_mpa').max < 17.13, '< 17.13');
        ck('SG never approached the lo-lo trip', fmt(h.range('sg_level_pct').min, 1),
          h.range('sg_level_pct').min >= 25, '≥ 25 %');
        // The machine must be RE-SYNCHRONISABLE — a planned offline is reversible, which
        // is most of the point of not tripping.
        h.cmd('connect_grid', {});
        h.run(120);
        ck('connect_grid puts it back on line in follow', String(h.ts().load_mode),
          h.ts().load_mode === 'follow' && !h.ts().turbine_tripped, 'follow, not tripped');

        // ---- phase 2: the heatup case #230 was actually filed for. Off line at low
        // power must not leave a latched trip lying in wait for the P-9 crossing.
        var g = H('5_percent');
        g.run(60);
        g.cmd('disconnect_grid', {});
        g.run(900);
        ck('offline at ~5 % leaves no latched turbine trip after 900 s',
          String(!!g.ts().turbine_tripped), !g.ts().turbine_tripped, 'false');
        ck('and no reactor trip', g.tripReason || 'none', g.tripTime == null, 'none');
        T.checkSanity(ck, h);
      });
    },

    /* TR-14 (#135) — HOW FAST DOES THE SG ACTUALLY DRAIN? The sourced anchor for
     * `K_sg_level`, and the gate that did not exist when it mattered.
     *
     * WHY THIS PROBE EXISTS AT ALL. `K_sg_level` was moved 5.0 → 1.37 — a 3.6× change to a
     * physics constant — and **every one of the 32 gates stayed green**. Nothing in the
     * suite asserted how fast a steam generator empties, so the constant could sit at a
     * value that drained the entire narrow range in twenty seconds of full-power steaming,
     * and could drift straight back tomorrow with nothing to say so. That is the HR10 case
     * in its purest form: a green suite was not evidence, it was silence.
     *
     * THE SOURCE — Ginna UFSAR Chapter 15, Table 15.2-4, "TIME SEQUENCE OF EVENTS FOR LOSS
     * OF NORMAL FEEDWATER FLOW" (NRC ADAMS ML20339A101, Rev 29 11/2020, p.102 of 276):
     *     Main feedwater flow stops                          20 s
     *     Low-low steam generator water level trip setpoint   55 s
     *     Rod motion begins and turbine tripped               57 s
     * 35 s from feed loss to the lo-lo trip. The plant used to do it in 12.9 s.
     *
     * The band is deliberately WIDE (25–60 s). What is being pinned is that this plant
     * drains on a real plant's timescale, not that a single-loop 100 MWe teaching PWR
     * reproduces Ginna to the second — it has its own narrow-range span and level program,
     * and claiming otherwise would be the false precision HR12 exists to stop. A band this
     * wide still fails hard on the old value: 12.9 s is less than half the floor.
     *
     * The window check is the ISSUE's actual complaint (#135: "~4 s, too short to read the
     * alarm and act"). Note what it does NOT assert — that the transient becomes savable.
     * Measured: clearing the failure the instant the alarm comes in still trips, at 40.6 s.
     * That is correct and prototypical; a real loss of normal feedwater trips the reactor
     * on lo-lo level, and it is the credited trip in the analysis above. The window is for
     * reading the board, not for preventing the trip. */
    'TR-14': function () {
      return test('TR-14 loss of feedwater — SG drains on a real plant timescale (Ginna Tbl 15.2-4)', function (ck) {
        var h = H('hot_full_power');
        h.run(30);
        var t0 = h.t();
        h.cmd('inject_failure', { failure_id: 'loss_of_feedwater', severity: 1.0 });
        // Sample finely enough to catch the alarm crossing: at the OLD drain rate the whole
        // warning-to-trip leg was under 3 s, so a coarse sweep would have missed it entirely.
        var warnAt = null, prev = h.ins().sg_level;
        for (var i = 0; i < 4000 && h.tripTime == null; i++) {
          h.run(0.5);
          var v = h.ins().sg_level;
          if (warnAt == null && prev >= 30 && v < 30) warnAt = h.t() - t0;
          prev = v;
        }
        var tripAt = h.tripTime == null ? null : h.tripTime - t0;

        ck('the plant trips on SG level, not on something else',
          h.tripReason || 'none', /sg_level/.test(h.tripReason || ''), 'sg_level low');
        ck('feed loss → lo-lo trip is on a real timescale (Ginna: 35 s)',
          tripAt == null ? 'never' : fmt(tripAt, 1) + ' s',
          tripAt != null && tripAt >= 25 && tripAt <= 60, '25–60 s');
        ck('the low-level warning arrives before the trip',
          warnAt == null ? 'never' : fmt(warnAt, 1) + ' s', warnAt != null && tripAt != null && warnAt < tripAt,
          'warning first');
        // #135's complaint, pinned. 2.9 s measured before the fit; ~11.6 s after.
        ck('warning-to-trip window is long enough to read the board (#135)',
          (warnAt == null || tripAt == null) ? 'n/a' : fmt(tripAt - warnAt, 1) + ' s',
          warnAt != null && tripAt != null && (tripAt - warnAt) >= 7, '≥ 7 s');
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

    /* TR-1c (#219, owner ruling 2026-07-27) — THE ARM IS A CLIFF, AND THAT IS DECLARED.
     * The fast-open dump must be armed: measured, an unarmed Tavg-error dump vents ~6.5 %
     * at steady full power forever and opens into a deliberate rod withdrawal hard enough
     * to run power to 114 %. Any armed system has a threshold, and any threshold is a
     * discontinuity — so a rejection just UNDER `dump_load_reject_mwe` is a manoeuvre the
     * operator has to handle, and hands-off it ends at the PORV. That is a named
     * simplification (DESIGN_COMPANION §8.21), not a defect, and this probe pins BOTH sides
     * of the cliff so it cannot move silently. Lowering the arm is not the fix: an arm low
     * enough to catch an ordinary 15 MWe dispatch cut leaves the dump venting the difference
     * forever, holding the reactor at 100 % and destroying the EV-11 load-follow lesson. */
    'TR-1c': function () {
      return test('TR-1c sub-threshold load rejection — the C-7 arm is a cliff (declared, §8.21)', function (ck) {
        var arm = RD.PWR_CONFIG.steam_generator.dump_load_reject_mwe;
        ck.info('arm threshold under test', fmt(arm, 0) + ' MWe');

        // --- just UNDER the arm: no fast dump, operator's problem, PORV is the backstop
        var lo = H('hot_full_power');
        lo.run(30);
        lo.cmd('set_load_target', { mwe: 100 - (arm - 1) });     // 39 MWe rejected
        var loArmed = false;
        for (var i = 0; i < 180; i++) { lo.run(5); if (lo.eng.s.dump_reject_mode) loArmed = true; }
        ck('under the arm the fast dump never arms', String(loArmed), loArmed === false, 'false');
        ck('so Tavg climbs well past program (> 315 °C)', fmt(lo.range('tavg_c').max, 1),
          lo.range('tavg_c').max > 315, '> 315');
        ck('and hands-off it ends at the PORV — the declared backstop',
          fmt(lo.range('pressure_mpa').max, 2), lo.range('pressure_mpa').max >= 16.20, '≥ 16.20');

        // --- just OVER the arm: caught, and Tavg stays on program
        var hi = H('hot_full_power');
        hi.run(30);
        hi.cmd('set_load_target', { mwe: 100 - (arm + 1) });     // 41 MWe rejected
        var hiArmed = false;
        for (var j = 0; j < 180; j++) { hi.run(5); if (hi.eng.s.dump_reject_mode) hiArmed = true; }
        ck('one MWe over the arm, the fast dump arms', String(hiArmed), hiArmed === true, 'true');
        ck('the dump carries it (peak ≥ 30 %)', fmt(hi.range('steam_dump_valve_pct').max, 1),
          hi.range('steam_dump_valve_pct').max >= 30, '≥ 30');
        ck('Tavg stays on program (< 310 °C)', fmt(hi.range('tavg_c').max, 1),
          hi.range('tavg_c').max < 310, '< 310');
        ck('no PORV lift on this side of the cliff', fmt(hi.range('pressure_mpa').max, 2),
          hi.range('pressure_mpa').max < 16.20, '< 16.20');
        // The programmed reference (#219) is what keeps the caught side proportional: with
        // the old fixed no-load anchor the demand saturated and MTC ran power to 102.7 %.
        ck('and the catch does not overcool into a power runup (< 101 %)',
          fmt(hi.range('power_pct').max, 1), hi.range('power_pct').max < 101, '< 101');
        T.checkSanity(ck, hi);
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

    // TR-11 END-STATE PIN (#131): the catalog row predates the P5 spray capacity
    // cap and reads "heaters lose, low-P trip unless isolated". Measured under the
    // cap, the opposite is true and that IS the end state: a spray valve stuck
    // fully open is a NUISANCE, not a casualty. The valve sits at its ~12 % cap,
    // pressure droops ~0.08 MPa and parks there, and the auto heaters hold it at
    // roughly a third of their duty — no trip, no alarm, indefinitely.
    // Now driven through the two command forms that used to SILENTLY DEFEAT the
    // failure (#200, fixed): the override was written into the operator's demand
    // (spray_override), so SPRAY AUTO or the % slider simply overwrote it and the
    // stuck valve healed itself. A stuck valve is mechanical — it is now s.spray_stuck
    // in the engine and pressurize() forces the valve open past both the auto
    // controller and any operator demand, mirroring porv_stuck. Driving the failure
    // through those forms makes this test the regression guard for that fix.
    'TR-11': function () {
      return test('TR-11 spray valve stuck open — the capped spray loses to the heaters', function (ck) {
        var h = H('hot_full_power');
        h.run(30);
        var p0 = h.ts().pressure_mpa;
        h.cmd('inject_failure', { failure_id: 'stuck_open_spray' });
        h.cmd('set_spray', { pct: 0 });             // slider to zero — used to clear the failure (#200)
        h.cmd('set_spray', { auto: true });         // SPRAY AUTO — used to clear the failure (#200)
        h.run(1800);
        var t = h.ts(), c = h.ctl();
        var cap = h.eng.cfg.pressurizer.spray_flow_max * 100;
        ck('the stuck valve sits at the spray capacity cap', fmt(c.spray_valve_pct, 1) + ' vs cap ' + fmt(cap, 1),
          c.spray_valve_pct >= cap - 0.5, '≈ ' + fmt(cap, 1) + ' %');
        ck('pressure droops less than 0.3 MPa and parks (≥ 15.1)',
          fmt(p0, 2) + ' → ' + fmt(t.pressure_mpa, 2) + ' (min ' + fmt(h.range('pressure_mpa').min, 2) + ')',
          h.range('pressure_mpa').min >= 15.1, '≥ 15.1');
        ck('the heaters win it without saturating (< 90 % duty)', fmt(c.heater_power_pct, 1),
          c.heater_power_pct < 90, '< 90');
        ck('no low-pressure trip in 30 min', h.tripReason || 'none', h.tripTime == null, 'none');
        ck('subcooling never threatened', fmt(h.range('subcooling_c').min, 1),
          h.range('subcooling_c').min > 20, '> 20');
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
        h.cmd('inject_failure', { failure_id: 'sgtr', severity: 0.012 });   // leak 3.6e-4 frac/s (severity ×4 with the 0.12→0.03 leak_scale — same absolute leak)
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

    // TR-12 (FG-6): steam line break at power with the REAL-strength MTC (−20
    // pcm/°C, 6× the old coefficient). The overcooling inserts 6× the positive
    // reactivity it used to — this pin holds the line: the excursion stays
    // bounded, protection ends it, and the scrammed core does NOT walk back to
    // criticality as the blowdown keeps cooling (the shutdown margin covers the
    // MTC insertion — the classic SLB analysis question).
    'TR-12': function () {
      return test('TR-12 steam line break @100% — bounded excursion, no post-trip return to power', function (ck) {
        var h = H('hot_full_power');
        h.run(30);
        h.cmd('inject_failure', { failure_id: 'steam_line_break', severity: 0.8 });
        var dt = h.runUntil(function (ts, ins, hh) { return hh.tripTime != null; }, 300);
        ck('protection ends it', dt >= 0 ? fmt(dt, 0) + ' s — ' + (h.tripReason || '?') : 'no trip', dt >= 0, 'trips');
        ck('power excursion bounded (< 130 %)', fmt(h.range('power_pct').max, 1),
          h.range('power_pct').max < 130, '< 130');
        h.run(900);
        ck('no return to power on the continuing cooldown (post-trip max < 5 %)',
          fmt(h.ts().power_pct, 2), h.ts().power_pct < 5, '< 5');
        ck('no fuel damage', String(!!h.ts().fuel_damaged), !h.ts().fuel_damaged, 'false');
        T.checkSanity(ck, h);
      });
    },

    // TR-12b (#199): the MSIV is the operator's one lever on a steam line break,
    // and until 2026-07-25 it was decorative — the break sink ignored valve
    // position entirely, so the manual's "MSIV Close if it terminates break (as
    // modeled)" and the catalog's "MSIV limits" were both false. Now the break's
    // LOCATION decides it. Both legs run the same severity and the same command;
    // only the side of the valve the pipe failed on differs.
    'TR-12b': function () {
      return test('TR-12b steam line break — the MSIV ends a downstream break, and cannot touch an upstream one', function (ck) {
        function run(failure) {
          var h = H('hot_full_power');
          h.run(30);
          h.cmd('inject_failure', { failure_id: failure, severity: 0.8 });
          h.run(60);
          var atClose = h.ts().steam_pressure_mpa;
          h.cmd('close_msiv');
          h.cmd('close_msiv');                      // two-press arm/confirm
          h.run(900);
          return { h: h, atClose: atClose, t: h.ts() };
        }
        var d = run('steam_line_break');
        ck('MSIV shut', String(d.t.msiv_open), d.t.msiv_open === false, 'false');
        ck('DOWNSTREAM: isolating ends the blowdown — the bottled SG re-pressurizes',
          fmt(d.atClose, 2) + ' → ' + fmt(d.t.steam_pressure_mpa, 2) + ' MPa',
          d.t.steam_pressure_mpa > d.atClose + 1.0, 'rises ≥ 1 MPa');
        ck('and the overcooling is arrested (Tavg back near the no-load anchor)',
          fmt(d.t.tavg_c, 1), d.t.tavg_c > 280, '> 280 °C');
        ck('the bottled generator lifts its code safeties, as in TR-5',
          String(d.t.sg_safety_open), !!d.t.sg_safety_open, 'true');

        var u = run('steam_line_break_upstream');
        ck('UPSTREAM: the same command changes nothing — the break is on the wrong side',
          fmt(u.atClose, 2) + ' → ' + fmt(u.t.steam_pressure_mpa, 2) + ' MPa',
          u.t.steam_pressure_mpa < 1.0, '< 1.0 (still blown down)');
        ck('so the plant overcools regardless of the operator',
          fmt(u.t.tavg_c, 1), u.t.tavg_c < 150, '< 150 °C');
        ck('neither leg damages fuel', String(!!d.t.fuel_damaged) + ' / ' + String(!!u.t.fuel_damaged),
          !d.t.fuel_damaged && !u.t.fuel_damaged, 'false / false');
      });
    },

    // SS-9 (new, P6 edge-case sweep): cold-plant thermal stability. The reverse
    // SG→primary heat path is damped to 5 % conductance (sg_reverse_frac) — this
    // pins that a hands-off cold shutdown neither runs away warming (the old
    // infinite-reservoir artifact) nor drifts unphysically, for half an hour.
    'SS-9': function () {
      return test('SS-9 cold shutdown hands-off — thermally quiet for 30 min', function (ck) {
        var h = H('cold_shutdown');
        var t0 = h.ts().tavg_c;
        h.run(1800);
        var t = h.ts();
        ck('Tavg drift bounded (±5 °C over 30 min)', fmt(t0, 1) + ' → ' + fmt(t.tavg_c, 1),
          Math.abs(t.tavg_c - t0) <= 5, '±5');
        ck('no trip / no spurious ESF', (h.tripReason || 'none') + ' / hpi=' + t.hpi_active,
          h.tripTime == null && !t.hpi_active, 'quiet');
        ck('pressure stayed in the cold band (< 4 MPa)', fmt(h.range('pressure_mpa').max, 2),
          h.range('pressure_mpa').max < 4, '< 4');
        T.checkSanity(ck, h);
      });
    },

    // TR-13b (P6 edge-case sweep): the ΔP-scaled SGTR survives save/load. The
    // leak base and its to-SG flag are engine state — a save taken mid-casualty
    // must restore a leak that still flows AND still dies with the ΔP.
    'TR-13b': function () {
      return test('TR-13b SGTR save/load — the ΔP-scaled leak survives a restore', function (ck) {
        var h = H('hot_full_power');
        h.run(30);
        h.cmd('inject_failure', { failure_id: 'sgtr', severity: 0.5 });
        h.run(30);
        var leakBefore = h.ts().leak_flow;
        ck('leak flowing before the save', fmt(leakBefore, 4), leakBefore > 0.01, '> 0.01');
        var save = h.eng.saveState();
        var h2 = H('hot_full_power');
        h2.eng.loadState(save);
        h2.run(10);
        var leakAfter = h2.ts().leak_flow;
        ck('leak still flowing after the restore', fmt(leakAfter, 4), leakAfter > 0.01, '> 0.01');
        ck('restored leak still ΔP-scaled (base survives)', fmt(h2.eng.s._leak_base || 0, 3),
          (h2.eng.s._leak_base || 0) > 0.012 && h2.eng.s._leak_to_sg === true, 'base ≈ 0.015, to_sg');
      });
    },

    // Severity-bounds robustness (P6): a scenario author passing meta-units
    // (40 meaning "40 %") must not inject a physically absurd casualty — the
    // engine clamps severity to [0,1].
    'SS-10': function () {
      return test('SS-10 severity clamp — out-of-range injection is bounded', function (ck) {
        var h = H('hot_full_power');
        h.run(10);
        h.cmd('inject_failure', { failure_id: 'sgtr', severity: 40 });
        h.run(2);
        ck('severity 40 clamps to a full rupture, not 40 of them',
          fmt(h.eng.s._leak_base, 3), h.eng.s._leak_base <= 0.031, '≤ 0.031');
      });
    },

    // TR-13 (FG-6 ladder; anchor re-derived for the P7 CVCS retune): a FULL tube
    // rupture (leak = 0.03 inventory-frac/s ≈ ½ HPI's high-head rated flow)
    // OVERWHELMS the CVCS — its make-up authority is charging_max ·
    // cvcs_inventory_gain ≈ 7.2e-4 frac/s, ~40× smaller — so level and pressure
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
        var rc = h.eng.cfg.reactivity;
        var makeup = (rc.charging_max || 0.06) * (rc.cvcs_inventory_gain != null ? rc.cvcs_inventory_gain : 1);
        ck('full-severity BASE leak dwarfs CVCS make-up authority (≥ 10×)',
          fmt(base, 3) + ' vs make-up ' + fmt(makeup, 4),
          base > 10 * makeup, '> ' + fmt(10 * makeup, 3));
        var dt = h.runUntil(function (ts, ins, hh) { return hh.tripTime != null; }, 900);
        ck('CVCS cannot hold it — the plant trips', dt >= 0 ? fmt(dt, 0) + ' s — ' + (h.tripReason || '?') : 'no trip',
          dt >= 0, 'trips');
        var ds = h.runUntil(function (ts) { return ts.hpi_active; }, 600);
        ck('SI actuates on the continuing depressurization', ds >= 0 ? fmt(ds, 0) + ' s after trip' : 'no SI',
          ds >= 0, 'SI');
        h.run(300);
        var t = h.ts();
        // The delivered leak is ΔP-MODULATED (base · clip((P_rcs − P_sg)/dp_ref)).
        // Post-retune the hands-off anatomy changed: trip + SI hold the primary
        // subcooled at pressure (heaters out-muscle the smaller leak) while the
        // overcooled secondary sags, so ΔP can sit at/above rated — the delivered
        // leak is NOT necessarily below base. Assert the MECHANISM tracks;
        // the ΔP-collapse OUTCOME (walk-down kills the leak) is proven by the
        // ops single-SG EOP scenario.
        var dpRef = h.eng.cfg.primary.sgtr_dp_ref || 9.8;
        var dpFrac = Math.min(1.2, Math.max(0, (t.pressure_mpa - t.steam_pressure_mpa) / dpRef));
        var expect = base * dpFrac;
        ck('delivered leak tracks the ΔP modulation (base · clip(ΔP/ref))',
          fmt(t.leak_flow, 3) + ' vs expected ' + fmt(expect, 3) + ' (ΔP frac ' + fmt(dpFrac, 2) + ')',
          Math.abs(t.leak_flow - expect) <= Math.max(0.15 * expect, 1e-4), '±15 %');
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
        // MANUAL max charging with letdown ISOLATED. The isolation is now commanded
        // explicitly (#209): this probe always said "letdown off", but it used to get
        // that for free from a bare harness lineup. The shipped board opens Orifice A
        // (engine.getStartupLineup()), which drains 0.030 against 0.060 of charging —
        // half the fill rate, and the overfill no longer reaches PI-8 inside 300 s.
        h.cmd('set_letdown_orifices', { a: false, b: false });
        h.cmd('set_charging_flow', { normalized: 0.06 });
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
        // Threshold 95 → 85 (#209). This leg deliberately keeps the SHIPPED lineup —
        // CVCS in AUTO with letdown Orifice A open is the board a player is handed —
        // so the overfill it drives is bounded by that 0.030 drain: measured 87.3 %
        // TRUE level against 110.8 % inventory. The lesson is unchanged and arguably
        // sharper: the stuck-low sensor walks the plant far above its program and
        // parks it just UNDER the 97 % PI-8 backstop, with nothing annunciating.
        ck('TRUE level driven far above program', fmt(t2.pzr_level_pct, 1), t2.pzr_level_pct >= 85, '≥ 85');
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
        h.cmd('inject_failure', { failure_id: 'sgtr', severity: 0.008 });   // leak 2.4e-4 frac/s — inside CVCS make-up authority by design (severity ×4 with the 0.12→0.03 leak_scale)
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
        h.cmd('inject_failure', { failure_id: 'sgtr', severity: 0.008 });   // leak 2.4e-4 frac/s — inside CVCS make-up authority by design (severity ×4 with the 0.12→0.03 leak_scale)
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
        h.cmd('inject_failure', { failure_id: 'sgtr', severity: 0.024 });   // leak 7.2e-4 frac/s; CVCS stays MANUAL: nothing makes it up (severity ×4 with the 0.12→0.03 leak_scale)
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

    // PI-3 (feel-plan P4, probe written #131): reactor trip on safety injection.
    // The rule keys on the SAME low-pressure signal as the SI ESF (SI_MPA 12.4)
    // and sits 0.01 MPa under the lo_press trip (12.41), so on any depressurization
    // both assert together and the reason string ('primary_pressure low') cannot
    // tell them apart. What makes PI-3 real — and testable — is the BLOCKED case:
    // block lo_press alone and the plant still scrams, which is exactly why the
    // cooldown procedure has to block BOTH. Third leg: the P-11 permissive
    // auto-blocks both at a depressurized init and auto-reinstates them on heatup.
    'PI-3': function () {
      return test('PI-3 trip on SI — si_trip scrams with lo_press blocked; a cooldown must block both', function (ck) {
        // ---- leg 1: lo_press blocked, si_trip live → the depressurization still scrams.
        var h = H('hot_full_power');
        h.run(30);
        h.cmd('set_trip_block', { trip_id: 'lo_press', blocked: true });
        ck('lo_press took a manual block at power (P-10 satisfied)',
          String(h.rps().trip_blocks.lo_press), h.rps().trip_blocks.lo_press === true, 'true');
        h.cmd('inject_failure', { failure_id: 'stuck_porv_open' });
        h.cmd('open_porv');
        h.cmd('close_porv');                        // intercepted — the valve stays open
        var dt = h.runUntil(function (ts, ins, hh) { return hh.tripTime != null; }, 300);
        ck('si_trip scrammed it anyway (the only pressure trip left)',
          dt >= 0 ? fmt(dt, 1) + ' s — ' + (h.tripReason || '?') : 'no trip in 300 s',
          dt >= 0 && /primary_pressure low/.test(h.tripReason || ''), 'primary_pressure low');
        ck('level was nowhere near its own trip (not a level scram in disguise)',
          fmt(h.ins().pzr_level, 1), h.ins().pzr_level > 30, '> 30 % (trip is 12)');
        ck('SI actuated with it', String(h.ts().hpi_active), !!h.ts().hpi_active, 'true');

        // ---- leg 2: BOTH blocked — the cooldown lineup. Pressure walks through
        // the SI setpoint with no reactor trip, but the ESF is untouched.
        var h2 = H('hot_full_power');
        h2.run(30);
        h2.cmd('set_trip_block', { trip_id: 'lo_press', blocked: true });
        h2.cmd('set_trip_block', { trip_id: 'si_trip', blocked: true });
        h2.cmd('inject_failure', { failure_id: 'stuck_porv_open' });
        h2.cmd('open_porv');
        h2.cmd('close_porv');
        var dt2 = h2.runUntil(function (ts, ins) { return ins.primary_pressure < 12.0; }, 300);
        ck('with both blocked, pressure crossed 12.4 MPa unscrammed',
          dt2 >= 0 ? fmt(h2.ins().primary_pressure, 2) + ' MPa, rps.scrammed=' + h2.rps().scrammed : 'never got there',
          dt2 >= 0 && h2.rps().scrammed === false, 'below 12.4, no scram');
        ck('blocking the TRIP did not disable the SI ESF', String(h2.ts().hpi_active),
          !!h2.ts().hpi_active, 'true');

        // ---- leg 3: the P-11 permissive — auto-blocked cold, auto-reinstated hot.
        var h3 = H('cold_shutdown');
        h3.run(5);
        ck('si_trip auto-blocked at the depressurized init (P-11)',
          String(h3.rps().trip_blocks.si_trip), h3.rps().trip_blocks.si_trip === true, 'true');
        h3.cmd('set_pressure_setpoint', { mpa: 15.4 });
        var dt3 = h3.runUntil(function (ts, ins) { return ins.primary_pressure > 13.8; }, 3000);
        h3.run(10);
        ck('and auto-reinstated on the heatup past 13.6 MPa',
          dt3 >= 0 ? fmt(h3.ins().primary_pressure, 2) + ' MPa → blocked=' + !!h3.rps().trip_blocks.si_trip
                   : 'never repressurized',
          dt3 >= 0 && !h3.rps().trip_blocks.si_trip, 'not blocked');
      });
    },

    // PI-8 (feel-plan P4/P5, probe written #131): the going-solid backstop. CA-4
    // pins the two BEHAVIOURS (a sensed overfill trips; a stuck-low sensor defeats
    // it); this pins the NUMBER and the ordering — 97 % read off the INDICATED
    // level (HR1, not truth), the 75 % caution well ahead of it, and enough
    // headroom above the ride-out swell that FG-4 keeps its no-scram character.
    'PI-8': function () {
      return test('PI-8 high-level trip — 97 % on the indicated channel, alarm first, ride-out clears it', function (ck) {
        var h = H('hot_full_power');
        h.run(30);
        h.cmd('set_charging_flow', { normalized: 0.06 });     // MANUAL max charging, letdown off
        var ind = null, tru = null;
        var dt = h.runUntil(function (ts, ins, hh) {
          if (hh.tripTime != null && ind == null) { ind = ins.pzr_level; tru = ts.pzr_level_pct; }
          return hh.tripTime != null;
        }, 900);
        ck('tripped on high pressurizer level', dt >= 0 ? fmt(dt, 0) + ' s — ' + (h.tripReason || '?') : 'no trip',
          dt >= 0 && /pzr_level high/.test(h.tripReason || ''), 'pzr_level high');
        // Tolerance is 3x the channel's own noise sigma, not a fixed 0.5. A trip on a
        // NOISY rising channel fires on the first excursion across the setpoint, which
        // precedes the mean crossing — so the reading sampled at the trip sits a little
        // BELOW the setpoint by construction, and by more when the channel is noisier.
        // The old ±0.5 was silently calibrated to an effective sigma of 0.125 (the
        // retired global 0.25 scaler); at the per-indication sigma of 0.5 (#217) that
        // band is ±1σ and would fail on noise ordering alone. The assertion's PURPOSE
        // is unchanged — it proves the trip reads the INDICATED channel, and truth is
        // several points away from this band either way.
        ck('the setpoint is read off the INDICATED level (97 ±1.5 %)', fmt(ind, 2),
          near(ind, 97.0, 1.5), '97 ±1.5 (3σ)');
        // The substantive claim is "not solid yet". The ORDERING claim (true above
        // indicated, because the channel lags) is real but NOT resolvable from a single
        // sample here: level is rising ~0.08 %/s, so a 2 s lag separates them by only
        // ~0.16 % — well inside the channel's own noise. Asserting an unresolvable
        // ordering makes the probe a coin-flip on noise ordering, so it is bounded by
        // the noise instead of pretending to see through it. If the lag itself needs
        // pinning, it wants a windowed comparison, not a point sample.
        ck('true level still short of solid, indication tracking it', fmt(tru, 2),
          tru < 100 && Math.abs(tru - ind) < 1.5, '< 100, within 1.5 % of indicated');
        var lead = h.alarmFirst['pzr_level_high'] != null ? h.tripTime - h.alarmFirst['pzr_level_high'] : -1;
        ck('the 75 % caution led the trip by ≥ 60 s', lead >= 0 ? fmt(lead, 0) + ' s' : 'alarm never fired',
          lead >= 60, '≥ 60 s');
        // Headroom: the FG-4 ride-out must not clip the backstop. Driven by a LOAD
        // REJECTION since #216 — a turbine trip above P-9 now scrams (TR-1b), so it no
        // longer produces a ride-out swell to measure. The load rejection is the event
        // that still holds the plant at power, which is what this headroom is for.
        var h2 = H('hot_full_power');
        h2.run(30);
        h2.cmd('set_load_target', { mwe: 0 });
        h2.run(300);
        // Re-banded 2026-07-31 with the 40 % dump: the bigger Tavg swell drives a bigger
        // insurge, so the ride-out peak went 88.x -> 95.6 % against the 97 % going-solid
        // trip. It still does NOT trip, which is the claim — but the margin is now ~1.4
        // points, and that is deliberately reported rather than hidden inside a band, so
        // the next person tightening this knob can see how close it runs.
        ck('the ride-out swell does NOT reach the going-solid trip', fmt(h2.range('pzr_level_pct').max, 1),
          h2.range('pzr_level_pct').max < 97 && h2.tripTime == null, '< 97, no scram');
        ck.info('margin to the 97 % trip on a full rejection',
          fmt(97 - h2.range('pzr_level_pct').max, 1) + ' points');
      });
    },

    // PI-9 — RETIRED by owner ruling 2026-07-25 (#199), and this probe is the
    // fence that keeps it retired. There is no steam_pressure row in
    // PWR_ACTUATIONS, so no SI on low steam-line pressure, and the SLB produces
    // none by the back door either — the pressurizer holds the primary at
    // ~15.3 MPa while the loop crash-cools, so the 12.4 MPa actuation never sees
    // its setpoint. The ruling rested on three measurements: the core cannot
    // return to power (ρ ≤ −9,604 pcm even with the MAXIMUM stuck rod, so the
    // interlock's reactivity job does not exist here); a prototype actuation
    // pegged inventory at the 120 % tank cap injecting into an intact primary;
    // and the severe case already gets borated water from the accumulators.
    // Adding the interlock reddens this probe — which is the point: it re-opens
    // the ruling deliberately instead of drifting past it. Catalog §10.
    'PI-9': function () {
      return test('PI-9 SLB gate — RETIRED: no low-steam-line-pressure SI, and none needed (#199)', function (ck) {
        var h = H('hot_full_power');
        h.run(30);
        h.cmd('inject_failure', { failure_id: 'steam_line_break', severity: 0.8 });
        var dt = h.runUntil(function (ts, ins, hh) { return hh.tripTime != null; }, 300);
        var siEver = false;
        h.run(900, function (hh) { if (hh.ts().hpi_active) siEver = true; });
        var t = h.ts();
        ck('protection ends the event', dt >= 0 ? fmt(dt, 0) + ' s — ' + (h.tripReason || '?') : 'no trip',
          dt >= 0, 'trips');
        ck('the secondary blows down far below the classic 4.1 MPa SI setpoint',
          fmt(h.range('steam_pressure_mpa').min, 2), h.range('steam_pressure_mpa').min < 1.0, '< 1.0');
        ck('NO safety injection anywhere in the event (the verified gap)',
          String(siEver) + ' / hpi_flow max ' + fmt(h.range('hpi_flow_normalized').max, 4),
          !siEver && h.range('hpi_flow_normalized').max < 0.001, 'never');
        ck('the primary never reached the 12.4 MPa SI actuation either',
          fmt(h.range('pressure_mpa').min, 2), h.range('pressure_mpa').min > 12.4, '> 12.4');
        ck('nothing to inject: inventory intact and deeply subcooled',
          fmt(t.core_inventory_pct, 1) + ' % / ' + fmt(t.subcooling_c, 0) + ' °C sub',
          t.core_inventory_pct > 98 && t.subcooling_c > 50, '> 98 %, subcooled');
        ck.info('end state — a cold primary held at pressure (PTS, unmodelled)',
          fmt(t.tavg_c, 1) + ' °C at ' + fmt(t.pressure_mpa, 2) + ' MPa');
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
