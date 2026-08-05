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

  // Take ROD CONTROL to MANUAL on a harness that otherwise keeps the shipped lineup.
  //
  // WHY THIS EXISTS (2026-08-01, #289). `rods_tavg` became `defaultOn` at power *(OWNER
  // RULING, 2026-08-01: "Let's start the rods in auto. Might as well, everything else starts
  // in auto.")*, so the shipped free-play plant now answers a load change with the rod
  // controller. Several probes here are ABOUT the rod-less plant by name and by intent —
  // EV-3 "(rod-less)", EV-11 "slider-only ask", TR-1's MTC handover past the dump's stop,
  // TR-1c's hands-off ride to the PORV, and TR-1e leg B, which needs core and generator to
  // DISAGREE by ~2x or it stops discriminating at all.
  //
  // Those probes assert the underlying physics (MTC self-regulation, the relief ladder, the
  // gauge source). The lineup changing must not silently convert them into something else,
  // so they say "rods in manual" out loud instead of inheriting it. The SHIPPED-lineup
  // answer to a load change is pinned separately, by TR-1g (50 % design case) and TR-1h
  // (full rejection) — which is the division this change is built around.
  //
  // NOT `noDefaults`: these want the rest of the shipped lineup (feed_sg, cvcs_makeup,
  // boron_conc). Only the rod channel stands down.
  function rodsManual(h) {
    h.cmd('set_auto_channel', { channel_id: 'rods_tavg', engaged: false });
    return h;
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
    'TR-1h': 'probe (full rejection on the SHIPPED lineup — rods AUTO + clamped level program, #289)',
    'TR-1i': 'probe (load-follow tracking vs the WTSM ±5 °F duty — the rate comparator, #306)',
    'TR-1b': 'probe (turbine trip → P-9 scram, #216)',
    'TR-1c': 'probe (sub-threshold rejection — the arm cliff, declared §8.21, #219)',
    'TR-1d': 'probe (PLANNED OFFLINE is not a turbine trip — #230)',
    'TR-1e': 'probe (grid holds the rotor at zero load; MWe follows the turbine — #284)',
    'TR-1f': 'probe (P-9 reads the NIS channel, not truth — #220)',
    'TR-2': 'probe', 'TR-3': 'probe',
    'TR-4': 'probe (lumped-RCP model: total-loss trip; P-8 single-loop needs multi-loop model)',
    'TR-5': 'probe', 'TR-6': 'existing:run_ops grid step + steam_dump_capacity_cap',
    'TR-7': 'probe', 'TR-8': 'probe',
    'TR-7b': 'probe (post-trip leg ΔT vs the energy balance — the split read FISSION power, #315)',
    'TR-9': 'existing:run_ops sg_overfeed_p14 + run_pwr feedwater_isolation',
    'TR-14': 'probe (LOFW drain rate vs Ginna UFSAR Table 15.2-4 — the SOURCED anchor, #135)',
    'TR-15': 'probe (natural circulation — W ∝ Q^⅓, void-gated; LOOP/SBO survivable, WTSM 3.2.6.3)',
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
    'CA-7': 'probe (pzr heaters are an AC load — dead in SBO, alive in LOOP; 10 CFR 50.2 + NUREG-0737 II.E.3.1)',
    'CA-8': 'probe (the AC-load roster — CVCS + ECCS die in SBO, AFW + accumulators survive; WTSM 4.1 + 5.7)',
    'CA-9': 'probe (loss of CVCS make-up — the pzr level cue and the letdown isolation; #330)',
    'CA-10': 'probe (the 17 % low-level heater cutoff — WTSM 10.3 §10.3.4.1; #334)',
    'CA-11': 'probe (break discharge follows RCS pressure — 10 CFR 50 App K I.C.1.b; #334)',
    'CA-12': 'probe (a water-solid RCS repressurizes and relieves — mass_max no longer discards; #346)',
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
      return test('SS-1 100% snapshot — the SLS-100 operating point', function (ck) {
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
        var h = rodsManual(H('hot_full_power'));   // rod-less BY NAME — see rodsManual (#289)
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
        var h = rodsManual(H('hot_full_power'));   // "slider-only" means slider only (#289)
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
        // Rod-less on purpose: this probe is the MTC handover past the dump's stop and the
        // relief ladder behind it (#289). TR-1h is the same event on the shipped auto lineup.
        var h = rodsManual(H('hot_full_power'));
        h.run(30);
        // Full load rejection: demand to zero with the turbine still on line.
        // `immediate` — a load REJECTION is an EVENT: the grid or the machine throwing load off.
        // It is NOT the operator walking the EHC reference down at the unit's load rate, which is
        // what turbine.load_rate_pct_per_min (10 %/min) governs. A rejection has to arrive at once
        // or it is not a rejection. Without the flag these probes measured a leisurely ramp and
        // this plant's defining ride-out disappeared — 5 red, caught by the gate, not the author.
        h.cmd('set_load_target', { immediate: true, mwe: 0 });
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
     * RE-AUTHORED 2026-08-01 (#289) — and the old form was WRONG about the mechanism, not
     * merely stale. It ran rod-less (the lineup of the day) and asserted the core PARKED at
     * 85..93 % with the dump held at its 40 % stop for the whole 600 s, calling that "the
     * documented ~10 % step". WTSM 11.2 (ML11223A294) says the dump is TRANSIENT and says so
     * twice: *"The increased steam flow from the steam generators dissipates the excess energy
     * of the reactor coolant **until the power in the reactor is reduced to the same value as
     * the secondary load**"*, and *"the steam dumps act as an alternate heat sink (load)
     * **until the rod control system returns Tavg to within 5°F of Tref**"*. A dump pinned at
     * its stop forever is the signature of rod control NOT ACTING — it was an artefact of the
     * shipped lineup, pinned as if it were the design case.
     *
     * So the 40 %+10 % split is the INSTANTANEOUS accommodation of the step, not an
     * equilibrium, and this probe now asserts both halves on the SHIPPED lineup (rods AUTO
     * since #289): the dump reaches its stop on the way through, then comes OFF it as the rod
     * controller walks the core down to the secondary load and Tavg back to program.
     *
     * Measured: dump 40.00 % at 1 min, backing off by 2 min, fully closed by 3 min; core
     * settles 46.5 % against a 50 MWe ask; Tavg 303.3 °C. Verified as a MECHANISM test, not
     * refitted — on the pre-#289 rods-manual plant the three new checks all go red (dump ends
     * at 40 %, core parks 89.3 %, Tavg parks 320 °C).
     *
     * This is still the check that says 40 % is ENOUGH. TR-1 says what happens past it
     * rod-less; TR-1h is the full rejection on this same shipped lineup. */
    'TR-1g': function () {
      return test('TR-1g 50% loss of load — the real design case: dump carries it, then rods take it', function (ck) {
        var h = H('hot_full_power');            // SHIPPED lineup — rod control in AUTO (#289)
        h.run(30);
        // `immediate`: a load REJECTION is an event, not an operator ramp — see TR-1.
        h.cmd('set_load_target', { immediate: true, mwe: 50 });
        h.run(600);
        var t = h.ts();
        var cap = 100 * RD.PWR_CONFIG.steam_generator.steam_dump_max;
        ck('no reactor trip — the design criterion', h.tripReason || 'none', h.tripTime == null, 'none');
        ck('no PORV lift', fmt(h.range('pressure_mpa').max, 2),
          h.range('pressure_mpa').max < 16.20, '< 16.20 MPa');
        ck('no SG safety lift (the other thing 40 % is sized for)', fmt(h.range('steam_pressure_mpa').max, 2),
          h.range('steam_pressure_mpa').max < 9.31, '< 9.31 MPa');
        ck('the dump reaches its stop on the way through — 40 % is doing all it can',
          fmt(h.range('steam_dump_valve_pct').max, 0),
          h.range('steam_dump_valve_pct').max >= cap - 1, '≥ ' + fmt(cap - 1, 0) + ' %');
        // The sourced half the old probe had backwards: the dump is an ALTERNATE HEAT SINK
        // "until the rod control system returns Tavg", so it must come back OFF its stop.
        ck('…then COMES OFF it — the dump is transient, not the new steady state (WTSM 11.2)',
          fmt(t.steam_dump_valve_pct, 1), t.steam_dump_valve_pct < 5, '< 5 %');
        ck('the core is reduced to the SECONDARY LOAD, not parked high', fmt(t.power_pct, 1),
          t.power_pct > 40 && t.power_pct < 55, '40..55 % (ask = 50)');
        // RE-BANDED 2026-08-02 (#306) to the SOURCED criterion. WTSM 11.2 says the dump is an
        // alternate heat sink *"until the rod control system returns Tavg to within 5°F of
        // Tref"*, so ±5 °F of the LOAD PROGRAM is the number — not a hardcoded 299..308, which
        // was one-sided (it allowed +7.5 °C of swell but only −1.5 °C of undershoot) and was
        // written around the old proportional trim's overshoot.
        //
        // THIS IS A TIGHTENING, AND IT FAILS ON THE OLD PLANT — say so rather than imply the
        // check is neutral (HR10). Measured at this sample point: the pre-#306 proportional
        // trim leaves Tavg at +5.24 °F, OUTSIDE the criterion it is supposed to satisfy; the
        // rate comparator lands at −2.06 °F. Both converge to program by 2 h, so what moved is
        // how fast the dump's own stated end condition is reached.
        var tref50 = RD.PWR_CONTROL.trefProgram(Math.max(0, Math.min(1, h.ins().steam_flow)));
        // MARGIN, MEASURED (2026-08-03, #321 sweep): 0.40 °F of headroom — a 3 % nudge to
        // `thermal.h_sg` takes it −4.60 → −5.25 °F. Same rule as TR-1i below: the ±5 °F is
        // sourced (WTSM 11.2), so diagnose the change, do not widen the band.
        ck('and Tavg is back within the sourced ±5 °F of program (WTSM 11.2), not left swollen',
          fmt((t.tavg_c - tref50) * 9 / 5, 2) + ' °F', Math.abs(t.tavg_c - tref50) * 9 / 5 < 5.0,
          '|dev| < 5 °F of ' + fmt(tref50, 1) + ' °C');
        ck('Tavg never swelled past the catalog band on the way (300..315)',
          fmt(h.range('tavg_c').max, 1),
          h.range('tavg_c').max > 300 && h.range('tavg_c').max < 315, '300..315');
        T.checkSanity(ck, h);
      });
    },

    /* TR-1h (NEW 2026-08-01, #289) — the FULL rejection on the SHIPPED lineup, which is the
     * event this issue was actually filed on and which nothing asserted.
     *
     * #289 reported that a 0 MWe ask parked the plant with the dump saturated at 40 % and the
     * SG code safeties passing steam to atmosphere INDEFINITELY, core stuck at 46 %. Two
     * things were wrong and both are fixed: the pressurizer level program had no ceiling (it
     * chased Tavg to ~94 % and scrammed the plant on the 97 % going-solid trip with inventory
     * CORRECT), and rod control was not in the shipped lineup, so nothing brought the core
     * down to what the dump could carry.
     *
     * WHAT THIS DOES NOT CLAIM, because the first draft got it wrong: the relief ladder still
     * RUNS on a full rejection — measured, the PORV lifts (16.36 MPa) and the SG safeties just
     * crack (9.32 vs the 9.31 setpoint). That is TR-1's already-recorded position: a real
     * Westinghouse plant does not ride out a full rejection either, its design case is the
     * 50 % loss of load (TR-1g), so relief here is prototypical rather than a defect. The
     * first version of this probe asserted the safeties "NEVER lift" on the strength of a
     * 150-second sampling grid, which simply missed the peak — `h.range()` sees every step.
     *
     * THE DEFECT #289 FILED WAS PERMANENCE, and that is what this pins: the dump comes back
     * off its stop, the safeties RESEAT, the core is run back and Tavg returns to the no-load
     * anchor, instead of parking at 46 % with the safeties passing to atmosphere forever.
     * Measured: dump peaks at its 40 % stop then falls to ~6 %, safeties shut, core < 5 %,
     * Tavg 299 °C, pzr peaks 91.9 % against the 97 % trip (the ceiling's 5 % of margin).
     * TR-1 is the same event ROD-LESS and still pins the ladder itself. */
    /* TR-1i (NEW 2026-08-02, #306) — LOAD-FOLLOW TRACKING against the real design duty, and
     * the first probe here to assert the ±5 °F criterion at all.
     *
     * WTSM 8.1 §8.1.1 (ML11223A252) is the spec: the rod control system handles *"a 10% step
     * load increase or decrease, a 5% per minute ramp load increase or decrease, or a 50% step
     * load decrease with the aid of the steam dump system"*, and on the first two *"the average
     * temperature of the reactor coolant remains within ±5°F of the temperature program."*
     * TR-1g already covers the 50 % case; nothing covered the other two.
     *
     * The mechanism under test is the power-mismatch RATE comparator. Ours was PROPORTIONAL to
     * the standing steam-vs-nuclear mismatch, which is exactly what the real circuit's rate
     * comparator exists to avoid — *"prevents the power mismatch circuit from responding to
     * steady state calibration differences between nuclear and turbine power"* (§8.1.4.2).
     * Measured on the old form, mid-ramp the standing term grew until it cancelled the
     * temperature error outright and the channel commanded ZERO steps with Tavg 8.6 °F off
     * program; the ramp peaked at 12.55 °F, 2.5× the duty.
     *
     * Injection-verified, not refitted: restoring the proportional trim reddens the DUTY check
     * (12.55 °F against ≤ 5) and both mechanism checks (`trimSlow` is never populated).
     *
     * A first draft of the mechanism check counted how often the bank was STALLED while Tavg
     * was off program. It measured 34 % on BOTH trims and so proved nothing — the cancellation
     * is intermittent, and the channel still nudges whenever the residual clears the gain. It
     * reads the controller's own follower state instead. */
    'TR-1i': function () {
      return test('TR-1i load-follow tracking — the WTSM ±5 °F duty on a 10 % step and a 5 %/min ramp', function (ck) {
        var TREF = RD.PWR_CONTROL.trefProgram;
        function devF(h) {
          var ins = h.ins();
          return Math.abs((ins.tavg - TREF(Math.max(0, Math.min(1, ins.steam_flow)))) * 9 / 5);
        }
        function ctlGroup(h) {
          var rg = h.ctl().rod_groups || [];
          for (var i = 0; i < rg.length; i++) if (rg[i].id === 'control_rods') return rg[i];
          return null;
        }
        // Rod position is NOT in true_state, so h.range() cannot see it — track it here.
        function peak(h, seconds, driver) {
          var mx = 0;
          h._rodMin = 999;
          h.run(seconds, function (hh, t) {
            if (driver) driver(hh, t);
            var d = devF(hh); if (d > mx) mx = d;
            var g = ctlGroup(hh); if (g && g.position_pct < hh._rodMin) hh._rodMin = g.position_pct;
          });
          return mx;
        }

        // --- 10 % step DOWN, 100 → 90 MWe. The dump must stay shut: WTSM is explicit that
        // "As long as Tavg is within its program the steam dump system will not actuate."
        var a = H('hot_full_power');            // SHIPPED lineup — rod control in AUTO
        a.run(60);
        ck('IC assert — the rig is on the hot plant', fmt(a.ts().pressure_mpa, 2),
          a.ts().pressure_mpa > 15.0 && a.ts().power_pct > 95, '> 15.0 MPa, > 95 %');
        a.cmd('set_load_target', { mwe: 90 });
        var pa = peak(a, 900);
        ck('10 % step down — no reactor trip', a.tripReason || 'none', a.tripTime == null, 'none');
        ck('…the steam dump never actuates (WTSM: it does not, while Tavg is in program)',
          fmt(a.range('steam_dump_valve_pct').max, 1), a.range('steam_dump_valve_pct').max < 1.0, '< 1 %');
        ck('…and Tavg comes back ONTO program, not merely near it', fmt(devF(a), 2), devF(a) < 1.5, '< 1.5 °F');

        // --- 5 %/min ramp DOWN, 100 → 50 MWe over 600 s, then a soak. THE duty case, and the
        // one the proportional trim failed by 2.5×.
        var c = H('hot_full_power');
        c.run(60);
        var t0 = c.t();
        var pc = peak(c, 1500, function (hh, t) {
          var el = t - t0;
          if (el <= 600) hh.cmd('set_load_target', { mwe: Math.max(50, 100 - 5 * (el / 60)) });
        });
        ck('5 %/min ramp down — no reactor trip', c.tripReason || 'none', c.tripTime == null, 'none');
        // MARGIN, MEASURED (2026-08-03, #321 sweep): this band is TIGHT and it is the
        // most likely source of a puzzling red. A 3 % nudge to `thermal.h_sg` or
        // `thermal.coolant_heat_capacity` — neither of which this check names — takes it
        // 4.77 → 5.02 / 5.12 °F against the ±5 °F limit, i.e. 0.23 °F of headroom (4.6 %).
        // If this reddens, ask what you changed that touches SG heat transfer or coolant
        // heat capacity BEFORE hunting the rod channel. Do NOT widen it: ±5 °F is the
        // SOURCED WTSM 8.1.1 duty, and a thin margin is a fact about the plant.
        ck('Tavg holds within the ±5 °F DUTY through the ramp (was 12.55 °F proportional)',
          fmt(pc, 2), pc <= 5.0, '≤ 5.00 °F');
        ck('…and the dump stays shut throughout', fmt(c.range('steam_dump_valve_pct').max, 1),
          c.range('steam_dump_valve_pct').max < 1.0, '< 1 %');
        ck('…rods did the work — the bank walked well in', fmt(c._rodMin, 1),
          c._rodMin < 80, '< 80 % withdrawn');

        // --- THE MECHANISM, read off the controller's OWN state rather than inferred from
        // the plant. `trimSlow` is the rate comparator's slow follower: it tracks the STANDING
        // part of the steam-vs-nuclear mismatch, and what the controller actually sees is
        // 1.25 x (d - trimSlow). Through a steady ramp the RAW mismatch d grows large while the
        // washout output stays near zero — that gap IS the rate comparator working.
        //
        // This replaced a "how often was the bank stalled?" check, which MEASURED THE SAME on
        // both trims (34 % stalled either way) and so proved nothing: the cancellation is
        // intermittent, and the channel still nudges whenever the residual clears the gain.
        // Reading trimSlow inverts cleanly instead — on the proportional form it is never even
        // populated.
        var d = H('hot_full_power');
        d.run(60);
        function rodChan(h) {
          var a = h.cfl.channels || [];
          for (var i = 0; i < a.length; i++) if (a[i].def && a[i].def.id === 'rods_tavg') return a[i];
          return null;
        }
        var t1 = d.t(), maxRaw = 0, maxOut = 0, sawSlow = false;
        d.run(700, function (hh, t) {
          var el = t - t1;
          if (el <= 600) hh.cmd('set_load_target', { mwe: Math.max(50, 100 - 5 * (el / 60)) });
          var cc = rodChan(hh), ins = hh.ins();
          if (!cc || !cc.engaged) return;
          var raw = ins.steam_flow * 100 - ins.power_range;
          if (Math.abs(raw) > maxRaw) maxRaw = Math.abs(raw);
          if (cc.trimSlow == null) return;
          sawSlow = true;
          var out = Math.abs(raw - cc.trimSlow);
          if (out > maxOut) maxOut = out;
        });
        ck('the rate comparator keeps its slow follower (a proportional trim has none)',
          String(sawSlow), sawSlow === true, 'true');
        ck('the ramp really did build a standing mismatch (else the next check is vacuous)',
          fmt(maxRaw, 2), maxRaw > 3.0, '> 3 % power');
        // `sawSlow &&` is load-bearing: with no follower, maxOut stays 0 and `0 < maxRaw/2`
        // would pass VACUOUSLY on the very trim this check exists to reject. Caught by
        // injection — the first form went green on the proportional trim.
        ck('…and the controller sees only a FRACTION of it — the standing part is washed out',
          sawSlow ? (fmt(maxOut, 2) + ' of ' + fmt(maxRaw, 2)) : 'no follower',
          sawSlow && maxOut < maxRaw / 2, '< half the raw mismatch');

        // --- Steady state must still land on program. A rate comparator that leaked a bias
        // would show here, and the real deadband is ±1.5 °F.
        var e = H('hot_full_power');
        e.cmd('set_load_target', { mwe: 75 });
        e.run(7200);
        ck('2 h soak at 75 % load settles ON program, inside the real ±1.5 °F deadband',
          fmt(devF(e), 2), devF(e) < 1.5, '< 1.5 °F');
        T.checkSanity(ck, c);
      });
    },

    'TR-1h': function () {
      return test('TR-1h full rejection on the SHIPPED lineup — rods take it back, relief RESEATS', function (ck) {
        var h = H('hot_full_power');            // rods AUTO + the clamped level program
        h.run(30);
        // `immediate`: a load REJECTION is an event, not an operator ramp — see TR-1.
        h.cmd('set_load_target', { immediate: true, mwe: 0 });
        h.run(900);
        var t = h.ts();
        var cap = 100 * RD.PWR_CONFIG.steam_generator.steam_dump_max;
        ck('no scram — the whole point of #289', h.tripReason || 'none', h.tripTime == null, 'none');
        ck('the dump did its transient job (reached its stop)',
          fmt(h.range('steam_dump_valve_pct').max, 0),
          h.range('steam_dump_valve_pct').max >= cap - 1, '≥ ' + fmt(cap - 1, 0) + ' %');
        ck('…and came back OFF it — not parked on the stop forever (#289)',
          fmt(t.steam_dump_valve_pct, 1), t.steam_dump_valve_pct < 15, '< 15 %');
        // THE #289 PIN — permanence, not occurrence. The filed defect was a relieving state
        // that never ended, so what matters is that the safeties RESEAT and the plant comes
        // off the stop. Asserted at the end of a 15-minute ride, with the peaks reported.
        ck('the SG code safeties are SHUT again — the relieving is transient, not permanent',
          String(!!t.sg_safety_open), !t.sg_safety_open, 'false');
        ck('steam pressure is back below the reseat setpoint, not sitting on it',
          fmt(t.steam_pressure_mpa, 2),
          t.steam_pressure_mpa < RD.PWR_CONFIG.steam_generator.sg_safety_reseat_mpa,
          '< ' + fmt(RD.PWR_CONFIG.steam_generator.sg_safety_reseat_mpa, 2) + ' MPa');
        ck('the core is run back — no 46 % plateau against a saturated dump',
          fmt(t.power_pct, 2), t.power_pct < 5, '< 5 %');
        ck('Tavg returns to the no-load anchor (297 ±6 °C)', fmt(t.tavg_c, 1),
          near(t.tavg_c, 297, 6), '297 ±6');
        // The level-program ceiling half of #289: the program can no longer chase Tavg into
        // the going-solid trip. 91.9 measured against 97 — banded at 95 so the ~5 % of margin
        // the ceiling bought has to actually be there, and eroding it reddens this line.
        ck('pzr level stays clear of the going-solid trip (97 %) — the ceiling holds',
          fmt(h.range('pzr_level_pct').max, 1),
          h.range('pzr_level_pct').max < 95, '< 95 %');
        ck.info('peak SG pressure (safeties 9.31 / reseat 9.00)',
          fmt(h.range('steam_pressure_mpa').max, 2) + ' MPa — brief lift is prototypical past the design case, see TR-1');
        ck.info('peak pressurizer pressure (PORV 16.20)', fmt(h.range('pressure_mpa').max, 2) + ' MPa');
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
        // `immediate`: a load REJECTION is an event, not an operator ramp — see TR-1.
        z.cmd('set_load_target', { immediate: true, mwe: 0 });
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
        // Rods MANUAL for this leg (#289): the whole point is a state where the core and the
        // generator disagree. On the shipped auto lineup the rods run the core down to the
        // turbine (46 % vs 50 MWe — they AGREE), and the leg would stop discriminating.
        var d = rodsManual(H('hot_full_power'));
        d.run(30);
        // `immediate`: a 50 % load REJECTION is an event, not an operator ramp — see TR-1.
        d.cmd('set_load_target', { immediate: true, mwe: 50 });
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

        // ---- leg E: the SAME predicate, at the third site. `close_msiv` decided whether
        // to trip the turbine with `generator_load > 0` — so isolating main steam while
        // synchronised at a 0 MWe target left the machine UNtripped and still on line,
        // and leg A's fix then held its rotor at rated with no admission steam at all: a
        // generator motoring on the grid. Measured on the unfixed handler, that state ran
        // 77 s until an unrelated `sg_level low` scram ended it. TR-5 never saw this
        // because it isolates at 100 % load, where the load test and the breaker test
        // agree — the same blind spot that hid legs A and B.
        var m = H('hot_full_power');
        m.run(30);
        m.cmd('set_load_target', { mwe: 0 });
        m.run(240);                                  // on line, synchronised, zero load
        m.cmd('close_msiv');
        m.run(10);
        var tm = m.ts();
        ck('no steam past the MSIV', fmt(tm.steam_flow_normalized, 3),
          tm.steam_flow_normalized === 0, '0');
        ck('isolating main steam trips the turbine at ZERO load too', String(!!tm.turbine_tripped),
          tm.turbine_tripped === true, 'true');
        ck('and the breaker opens with the trip', String(tm.load_mode),
          tm.load_mode === 'disconnected', 'disconnected');
        ck('so the rotor coasts — it does not motor on the grid (was 1800 rpm)',
          fmt(tm.turbine_rpm, 0), tm.turbine_rpm < 1790, '< 1790 rpm and falling');
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
    /* TR-7b — the post-trip half of TR-7, which nothing asserted (#315, 2026-08-03).
     *
     * THE CLAIM IS AN ENERGY BALANCE, not an observation: heat removed from the core
     * equals flow × the leg ΔT, so a core rejecting X % of rated heat through Y of rated
     * flow develops (X / Y) of the rated leg ΔT. It holds at power, and it does not stop
     * holding when the rods drop — decay heat is still heat and it still leaves through
     * the legs. That is what makes this catalog-level rather than regression: the band
     * below is computed from `core_heat_pct` and `pump_flow_pct` every time it runs, so
     * a retune of `delta_T_rated`, of the decay fractions or of `flow_floor` moves the
     * expectation with the plant instead of stranding a transcribed number.
     *
     * WHY IT DID NOT EXIST. The split read `power_pct` — FISSION power — and fission and
     * total heat are equal by construction in steady state, so every probe that measures
     * at or near equilibrium agreed with a formula that is wrong everywhere else. The gap
     * was proved by injection before this was written: restoring `power_pct` moves the
     * post-trip ΔT by up to 41 °F and the indicated sign from right to a coin flip, and
     * the OTHER 44 probes stay green.
     *
     * Leg C is the calibration guard and passes on BOTH forms deliberately — at rated,
     * _Q_total is exactly 1.0, and a future edit that gets the normaliser wrong would
     * break the at-power split silently otherwise. */
    'TR-7b': function () {
      return test('TR-7b post-trip leg ΔT — decay heat still leaves through the legs (#315)', function (ck) {
        var dt0 = RD.PWR_CONFIG.thermal.delta_T_rated;              // °C at rated
        var floor = RD.PWR_CONFIG.thermal.flow_floor;
        var F = function (c) { return c * 9 / 5; };                 // ΔT: ×9/5, NO offset

        // ---- leg A: scram from HFP, RCPs left running. The energy balance, twice.
        var a = H('hot_full_power');
        a.run(30);
        a.cmd('scram');
        a.run(180);
        var expA = dt0 * (a.ts().core_heat_pct / 100) / Math.max(a.ts().pump_flow_pct / 100, floor);
        var obsA = a.ts().thot_c - a.ts().tcold_c;
        ck('t+3 min: the core is still making decay heat', fmt(a.ts().core_heat_pct, 2) + ' % of rated',
          a.ts().core_heat_pct > 5 && a.ts().core_heat_pct < 9, '5–9 %');
        ck('…and flow is unchanged', fmt(a.ts().pump_flow_pct, 0) + ' %', a.ts().pump_flow_pct > 95, '> 95 %');
        ck('t+3 min: leg ΔT matches the heat being removed',
          fmt(F(obsA), 2) + ' °F vs ' + fmt(F(expA), 2) + ' °F expected',
          expA > 0 && Math.abs(obsA / expA - 1) < 0.05, 'within 5 % of Q/flow');

        a.run(1620);                                                // out to t+30 min
        var expA2 = dt0 * (a.ts().core_heat_pct / 100) / Math.max(a.ts().pump_flow_pct / 100, floor);
        var obsA2 = a.ts().thot_c - a.ts().tcold_c;
        ck('t+30 min: still matches as the decay tail falls',
          fmt(F(obsA2), 2) + ' °F vs ' + fmt(F(expA2), 2) + ' °F expected',
          expA2 > 0 && Math.abs(obsA2 / expA2 - 1) < 0.05, 'within 5 % of Q/flow');

        // ---- leg B: what the OPERATOR sees. The split has to clear instrument noise,
        // or the board shows a hot leg colder than the cold leg — which is what it did.
        var b = H('hot_full_power');
        b.run(30);
        b.cmd('scram');
        b.run(300);                                                 // settle past the trip transient
        var inverted = 0, samples = 0, sum = 0;
        for (var i = 0; i < 250; i++) {
          b.run(6);
          var d = b.ins().thot - b.ins().tcold;
          samples++; sum += d; if (d < 0) inverted++;
        }
        ck('indicated ΔT stays POSITIVE for 25 min after the trip',
          inverted + ' of ' + samples + ' samples read the cold leg hotter',
          inverted === 0, '0 inversions');
        ck('…and the signal clears the noise rather than sitting in it',
          fmt(F(sum / samples), 2) + ' °F mean', F(sum / samples) > 2.0, '> 2 °F');

        // ---- leg C: THE CALIBRATION GUARD. Passes on the old form too, by design —
        // at rated, fission and total heat are equal, and that identity is what lets
        // delta_T_rated stay a directly-meaningful number.
        var c = H('hot_full_power');
        c.run(60);
        ck('at power the split is still exactly rated (nothing moved)',
          fmt(F(c.ts().thot_c - c.ts().tcold_c), 2) + ' °F', near(c.ts().thot_c - c.ts().tcold_c, dt0, 0.5),
          fmt(F(dt0), 1) + ' °F ± 0.9');

        // ---- leg D: the flow term. Lose the pumps after the trip and the same heat has
        // to leave through less flow, so the split OPENS.
        //
        // RE-AUTHORED 2026-08-04 (#325), and the reason is the HR10 case this file keeps
        // meeting. This leg used to assert *"flow is at or below the modelling floor"* and
        // compute its expectation as `Q / floor`. Both were only true because the plant had
        // NO NATURAL CIRCULATION: losing the pumps drove flow to zero, so the floor was
        // always what divided. It was pinning the absence of the mechanism #325 built.
        //
        // The claim that survives is the ENERGY BALANCE — the same one legs A and A2 make —
        // so it now divides by `max(flow, floor)` exactly as they do, and it passes on the
        // OLD plant too (flow → 0 there, so the max picks the floor and the arithmetic is
        // the previous check verbatim). The check BELOW it is the new assertion and fails on
        // the old plant by construction: flow lands in the natural-circulation band instead
        // of at zero. Two checks, one that got better and one that is genuinely new, rather
        // than one refitted.
        var d = H('hot_full_power');
        d.run(30);
        d.cmd('scram');
        d.run(60);
        d.cmd('set_rcp', { running: false });
        d.run(240);
        var flowD = d.ts().pump_flow_pct / 100;
        var expD = dt0 * (d.ts().core_heat_pct / 100) / Math.max(flowD, floor);
        var obsD = d.ts().thot_c - d.ts().tcold_c;
        ck('losing forced flow OPENS the split — same heat, less flow',
          fmt(F(obsD), 1) + ' °F vs ' + fmt(F(expD), 1) + ' °F expected',
          expD > 0 && Math.abs(obsD / expD - 1) < 0.05, 'within 5 % of Q/flow');
        // The flow the split is dividing by is BUOYANCY-DRIVEN, not a stopped rotor (#325).
        // Banded above the floor deliberately: `flow_floor` is set BELOW the weakest natural
        // circulation this plant can make (~1.9 % at a fully-decayed core), so a reading
        // inside the band proves the floor is not what is holding the number up.
        ck('…and the flow it divides by is NATURAL CIRCULATION, not a stopped rotor',
          fmt(d.ts().pump_flow_pct, 2) + ' % of rated', flowD > floor * 1.5 && flowD < 0.08,
          '> ' + fmt(floor * 150, 1) + ' %, < 8 %');
        T.checkSanity(ck, a);
      });
    },

    /* TR-15 — NATURAL CIRCULATION (#325, ruled 2026-08-04: "Go with one B").
     *
     * Until 2026-08-04 `natural_circ_flow` was 0.0 and a loss of offsite power was
     * TERMINAL on this plant: measured, damage at 30 min and melt at 45 min, and starting
     * AFW moved melt to 50 min and nothing else. That is not conservatism, it is a missing
     * heat-transport path — and it made two Tier C CORE casualties (E04/E05) evolutions in
     * which nothing the player does matters.
     *
     * SOURCED — WTSM 3.2.6.3 (ML11223A213, p. 3.2-26): "The higher elevation of the steam
     * generators relative to the reactor vessel produces a thermal driving head to establish
     * and maintain flow in the RCS when heat is removed from the steam generators by dumping
     * steam. Natural circulation flow is sufficient only for decay heat removal of a
     * shutdown reactor, not for power operation."
     *
     * WHAT IS SOURCED AND WHAT IS NOT, because they are different claims. The SHAPE is:
     * buoyancy head ∝ ΔT, resistance ∝ W², so W = C·√ΔT, and closing that against the core
     * rise ΔT = delta_T_rated·Q/W gives W ∝ Q^⅓. Leg B asserts that exponent. The SCALE (C)
     * is FITTED — every attempt at a primary for the magnitude failed from this environment,
     * and the "2–5 %" this repo used to quote in §8.6 and Manuals/01 was uncited inherited
     * prose, so it is deliberately NOT used as the anchor and no leg here asserts it.
     *
     * LEG C IS THE ONE THAT MAKES THIS PHYSICS RATHER THAN A FLOOR. A constant floor was
     * measured first and rejected: it circulates through a FULLY VOIDED loop
     * (`primary_void_fraction` 1.00 reading 3 % flow, driving Tavg to 245 °F while the clad
     * melted at 3827 °F). Natural circulation needs a continuous liquid column — which is
     * why tripping the pumps into a voided loop at TMI-2 established nothing.
     *
     * LEG E EXISTS SO THIS DOES NOT READ AS IMMUNITY. Natural circulation moves heat to the
     * steam generator; it does not remove it. Take the secondary heat sink away and the
     * plant must still be lost, or the change has traded one wrong lesson for another. */
    'TR-15': function () {
      return test('TR-15 natural circulation — decay heat rides out a LOOP, and a voided loop does not', function (ck) {
        var cfgP = RD.PWR_CONFIG.primary;
        var F = function (c) { return c * 9 / 5; };

        // ---- leg A: the headline. LOOP at power, AFW on, ride it out.
        var a = H('hot_full_power');
        a.run(60);
        a.cmd('inject_failure', { failure_id: 'loss_of_offsite_power' });
        a.run(120);
        a.cmd('set_afw', { active: true });
        a.run(3600);                                        // out to t+60 min — the pre-#325 plant melted at 45
        var ta = a.ts();
        ck('the RCPs are stopped', String(ta.pump_running), ta.pump_running === false, 'false');
        ck('but flow does NOT decay to zero — buoyancy takes over',
          fmt(ta.pump_flow_pct, 2) + ' % of rated',
          ta.pump_flow_pct > 1.0 && ta.pump_flow_pct < 8.0, '1–8 %');
        ck('…and the plant says so', String(ta.natural_circulation), ta.natural_circulation === true, 'true');
        // The pre-#325 plant reached damage at 30 min and melt at 45 min on this exact rig.
        ck('an hour in, the core is intact', 'damaged ' + String(ta.fuel_damaged) + ', melted ' + String(ta.melted),
          ta.fuel_damaged !== true && ta.melted !== true, 'neither');
        ck('and Tavg is being HELD, not merely rising slowly',
          fmt(F(a.range('tavg_c').max - ta.tavg_c), 1) + ' °F below the peak, ' + fmt(ta.tavg_c * 9 / 5 + 32, 0) + ' °F',
          ta.tavg_c < 310, '< 590 °F (310 °C)');

        // ---- leg B: THE LAW. W ∝ Q^⅓. Sampled at two points down the decay tail and
        // compared as a RATIO, so it tests the exponent rather than the fitted scale —
        // a linear law (W ∝ Q) would give 2.46 where this expects 1.35 on the same data.
        var b = H('hot_full_power');
        b.run(30);
        b.cmd('scram');
        b.cmd('set_rcp', { running: false });
        b.cmd('set_afw', { active: true });
        b.run(900);
        var q1 = b.ts().core_heat_pct, w1 = b.ts().pump_flow_pct;
        b.run(2700);                                        // ~t+60 min, decay tail well down
        var q2 = b.ts().core_heat_pct, w2 = b.ts().pump_flow_pct;
        var predicted = Math.pow(q1 / q2, 1 / 3), observed = w1 / w2;
        ck('the decay tail actually fell between the samples (or the ratio is vacuous)',
          fmt(q1, 2) + ' % → ' + fmt(q2, 2) + ' %', q1 / q2 > 1.5, 'ratio > 1.5');
        ck('flow follows the CUBE ROOT of core heat (W ∝ Q^⅓, WTSM 3.2.6.3 driving head)',
          'observed ' + fmt(observed, 3) + ' vs predicted ' + fmt(predicted, 3),
          Math.abs(observed / predicted - 1) < 0.05, 'within 5 %');

        // ---- leg C: A VOIDED LOOP DOES NOT CIRCULATE. The TMI-2 discriminator, and the
        // check that separates this from a constant floor.
        var c = H('hot_full_power');
        c.run(60);
        c.cmd('inject_failure', { failure_id: 'station_blackout' });
        c.cmd('inject_failure', { failure_id: 'large_loca', severity: 0.3 });
        c.run(600);
        var tc = c.ts();
        ck('the loop really is voided', fmt(tc.primary_void_fraction, 2) + ' void fraction',
          tc.primary_void_fraction > (cfgP.natural_circ_void_cutoff || 0.25), '> cutoff');
        // Banded rather than exactly zero, and the reason is worth knowing:
        // `primary_void_fraction` is a THRESHOLD function of subcooling, so it chatters as
        // the bulk crosses saturation, and each flicker lets the 8 s coastdown τ leak a
        // little flow back. Measured residue ~0.03 %; the rejected constant-floor design
        // read 3.00 % here, so 0.5 % still discriminates by two orders of magnitude.
        ck('so there is NO liquid column to drive — circulation is lost',
          fmt(tc.pump_flow_pct, 3) + ' % of rated', tc.pump_flow_pct < 0.5, '< 0.5 % (residue only)');
        ck('…and the plant does not claim natural circulation it does not have',
          String(tc.natural_circulation), tc.natural_circulation === false, 'false');

        // ---- leg D: SBO. AFW is turbine-driven (#332 leg D / WTSM 5.7.5) and the CVCS
        // and ECCS pump are dead, so this is natural circulation carrying the plant with
        // NOTHING electrical helping it.
        var d = H('hot_full_power');
        d.run(60);
        d.cmd('inject_failure', { failure_id: 'station_blackout' });
        d.run(120);
        d.cmd('set_afw', { active: true });
        d.run(3600);
        var td = d.ts();
        ck('every ac bus is dead (so no charging, no SI — #332)', String(td.ac_available),
          td.ac_available === false, 'false');
        ck('natural circulation still carries the core through an SBO',
          String(td.natural_circulation) + ', ' + fmt(td.pump_flow_pct, 2) + ' %',
          td.natural_circulation === true && td.fuel_damaged !== true, 'true, undamaged');

        // ---- leg E: IT IS NOT IMMUNITY. Natural circulation MOVES heat to the steam
        // generator; the secondary still has to remove it. Same LOOP as leg A with AFW
        // blocked — if this passes, the change has traded one wrong lesson for another.
        var e = H('hot_full_power');
        e.run(60);
        e.cmd('inject_failure', { failure_id: 'loss_of_offsite_power' });
        e.cmd('inject_failure', { failure_id: 'afw_failure' });
        // LOAD-BEARING RIDE — trimmed to 60 min first and the leg went red at Tavg 660 °F
        // still climbing. Natural circulation distributes the heat while it has somewhere to
        // put it, so losing the sink takes LONGER to reach damage than the pre-#325 plant's
        // 30 minutes. Do not shorten this to save gate time.
        //
        // 90 → 120 min at #330. The 90 was a KNIFE EDGE, not a measurement: A/B'd full stack
        // across the #330 constants, the old plant read clad 2180 °F at 90 min and the new
        // one 2068 °F — both undamaged, both still climbing, and both reaching damage at
        // ~100 min. The old value passed only because it sat a few degrees the right side of
        // the threshold, so ANY change touching the inventory path tipped it. #330's does:
        // the corrected level slope holds more inventory through the pre-void phase (96.2 %
        // vs 85.9 % at 40 min), so uncovery and the heat-up that follows both arrive later.
        // The leg's CLAIM is unchanged and true on both plants; only the window was wrong.
        //
        // ECCS IS DEFEATED HERE SINCE #346, and that is a correction to the leg rather than a
        // concession to a change. The leg's claim is about CIRCULATION — it moves heat to the
        // steam generator and does not remove it — so anything else that removes heat has to
        // be out of the picture or the leg is measuring the wrong system. It was not: with
        // the overfill path fixed the plant survives this event, and measurement says
        // circulation has nothing to do with it. What saves it is ECCS running unterminated
        // into a relieving RCS, i.e. automatic feed-and-bleed, cooling the plant 660 → 443 °F
        // over three hours with the PORV at ~45 % duty. Defeat the injection and it is lost at
        // 94 min — and MEASURED IDENTICALLY on the pre-#346 engine, damage at 94 min, peak clad
        // 5072 °F both sides. So this passes on the old plant too: it is the same claim,
        // finally isolated to the mechanism it names (HR10), rather than a band moved to fit.
        //
        // The survival it used to assert away was NOT circulation immunity; it was the
        // pressurizer discarding ECCS mass at `mass_max` (#346), which let cold RWST water
        // quench the plant through a sink with no outlet. See CA-12.
        e.cmd('inject_failure', { failure_id: 'degraded_hpi', severity: 1.0 });
        e.run(7200);
        var te = e.ts();
        ck('with the heat sink gone AND no injection the plant is still lost — circulation is not cooling',
          'damaged ' + String(te.fuel_damaged) + ' @ Tavg ' + fmt(te.tavg_c * 9 / 5 + 32, 0) + ' °F',
          te.fuel_damaged === true, 'damaged');
        T.checkSanity(ck, a);
      });
    },

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
        // Both legs rod-less (#289): this probe pins the ARM discontinuity, and "hands-off"
        // is its premise. On the shipped auto lineup rod control absorbs a sub-arm rejection
        // the way the real one does, which MITIGATES this declared cliff — recorded in the
        // §8.21 write-up rather than smuggled in here by deleting the mechanism test.
        var lo = rodsManual(H('hot_full_power'));
        lo.run(30);
        // `immediate`: a load REJECTION is an event, not an operator ramp — see TR-1.
        lo.cmd('set_load_target', { immediate: true, mwe: 100 - (arm - 1) });     // 39 MWe rejected
        var loArmed = false;
        for (var i = 0; i < 180; i++) { lo.run(5); if (lo.eng.s.dump_reject_mode) loArmed = true; }
        ck('under the arm the fast dump never arms', String(loArmed), loArmed === false, 'false');
        ck('so Tavg climbs well past program (> 315 °C)', fmt(lo.range('tavg_c').max, 1),
          lo.range('tavg_c').max > 315, '> 315');
        ck('and hands-off it ends at the PORV — the declared backstop',
          fmt(lo.range('pressure_mpa').max, 2), lo.range('pressure_mpa').max >= 16.20, '≥ 16.20');

        // --- just OVER the arm: caught, and Tavg stays on program
        var hi = rodsManual(H('hot_full_power'));
        hi.run(30);
        // `immediate`: a load REJECTION is an event, not an operator ramp — see TR-1.
        hi.cmd('set_load_target', { immediate: true, mwe: 100 - (arm + 1) });     // 41 MWe rejected
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
        // THE THRESHOLD WAS A FIXTURE, and #334 moved the plant under it. A severity-0.5
        // SGTR empties the pressurizer inside 40 s (level 0 %), so the 17 % heater cutoff
        // now de-energizes the heaters, primary pressure falls further, and this ΔP-scaled
        // leak legitimately shrinks — 0.0122 → 0.0067 at the sample point. That is the
        // plant getting MORE right, not less: a real 17 % bistable cuts the heaters here,
        // and depressurizing to reduce the break flow is the single-SG EOP's whole
        // strategy. So the magnitude fixture is relaxed to "a leak is flowing at all" and
        // the probe now asserts THE CLAIM IN ITS OWN TITLE, which it never did: that the
        // leak SURVIVES THE RESTORE, i.e. before ≈ after. Both new forms pass on the
        // pre-#334 engine too (0.0122 vs 0.0122), so this is a better test, not a refit.
        var leakBefore = h.ts().leak_flow;
        ck('leak flowing before the save', fmt(leakBefore, 4), leakBefore > 0.001, '> 0.001');
        var save = h.eng.saveState();
        var h2 = H('hot_full_power');
        h2.eng.loadState(save);
        h2.run(10);
        var leakAfter = h2.ts().leak_flow;
        ck('leak still flowing after the restore', fmt(leakAfter, 4), leakAfter > 0.001, '> 0.001');
        // Compare the BASE rate, not the instantaneous flow. The instantaneous value is
        // ΔP-scaled and this scenario is violently transient at the sample point (primary
        // swinging 15.4 → 8.6 → 15.4 MPa as ECCS cycles), so a before/after magnitude
        // comparison measures which phase of that swing each side landed on — 0.0067 vs
        // 0.0022, and neither number is wrong. `_leak_base` is the invariant the restore
        // actually has to carry, so that is what "survives" means here.
        ck('…and it is the SAME leak — the ΔP-scaled BASE survived the round trip',
          fmt(h.eng.s._leak_base || 0, 4) + ' → ' + fmt(h2.eng.s._leak_base || 0, 4),
          (h.eng.s._leak_base || 0) > 0 &&
          Math.abs((h2.eng.s._leak_base || 0) - (h.eng.s._leak_base || 0)) < 1e-9, 'identical');
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
        var h2n = 0, h2porv = 0;
        h2.run(300, function (hh) { h2n++; if (hh.ts().porv_open) h2porv++; });
        var t2 = h2.ts();
        // RE-AUTHORED at #346, and the old form was pinning that change's defect. It read
        // `core_inventory_pct > 110`, a magnitude only reachable while the RCS would accept
        // unbounded mass: `_mass` clipped at 1.2 and the surplus was DISCARDED, so charging
        // could walk past the water-solid point without the plant noticing. Now the fill
        // arrests where the geometry says it must (measured 105.8 % against the old 110.8 %),
        // and the number the leg was reading is gone.
        //
        // What it was really claiming — the plant is FLOODED — is unchanged and is asserted
        // directly instead of through a proxy magnitude: true level pinned at the top of the
        // vessel with inventory above nominal is what "flooded" means. Measured 100.0 % on
        // BOTH engines, so this passes on the old one too (HR10 — a better statement of the
        // same claim, not a re-band to fit the change).
        // The PEAK, not the closing sample. Once the plant is solid the relief valve cycles it
        // across the boundary, so a single end-of-run read is a knife edge — it landed on
        // 99.85 % and reddened a claim that was true throughout (the TR-15 90-minute trap, in
        // one line). "Was driven solid" is a claim about the run, so `range()` is what states
        // it; the closing inventory carries the other half.
        ck('charging flooded the plant water-solid, chasing the stuck-low reading',
          fmt(h2.range('pzr_level_pct').max, 1) + ' % peak TRUE level at ' +
          fmt(t2.core_inventory_pct, 1) + ' % inventory',
          h2.range('pzr_level_pct').max >= 99.9 && t2.core_inventory_pct > 103, 'solid, > 103 % inventory');
        // NEW at #346, and it FAILS ON THE OLD ENGINE — 0.0 % duty, pressure flat at 2238 psi
        // for the whole five minutes. A deceived level channel no longer means the plant is
        // silent: the water it cannot see still has to go somewhere, and the relief path is
        // where it goes. That is the honest cue behind the lying gauge, and the PI-8 trip is
        // still fooled either way (the check below is unchanged).
        ck('…and the overfill announces itself on the RELIEF path, which the sensor cannot lie about',
          fmt(100 * h2porv / h2n, 1) + ' % PORV duty, peak ' +
          fmt(h2.range('pressure_mpa').max * 145.038, 0) + ' psi (pre-#346: 0.0 %, 2238 psi flat)',
          h2porv > 0 && h2.range('pressure_mpa').max * 145.038 > 2300, 'PORV lifts above 2300 psi');
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

    // CA-7 — THE HEATERS ARE AN AC LOAD, AND A BLACKOUT HAS NO AC (2026-08-03).
    //
    // Reported from free play: the pressurizer heaters were still running after a
    // station blackout was injected. Measured full stack from hot_full_power, SBO at
    // t = 60 s: heater power reached 100.0 % at 17m15s and 68.5 % at 18m00s, with every
    // AC bus in the plant dead. With the operator calling for heat it is worse and
    // immediate — 100 % from the moment the button is pressed, pressure walked to
    // 2352 psi (16.22 MPa), and a SPURIOUS `pzr_level low` reactor trip at 5m27s driven
    // entirely by phantom heat boiling liquid out of the pressurizer.
    //
    // SOURCED. 10 CFR 50.2 defines the event as "the complete loss of alternating
    // current (ac) electric power to the essential and nonessential switchgear buses in
    // a nuclear power plant (i.e., loss of offsite electric power system concurrent with
    // turbine trip and unavailability of the onsite emergency ac power system)", and it
    // "does not include the loss of available ac power to buses fed by station batteries
    // through inverters" — the vital instrument AC, which is why the board keeps reading
    // while ~1 MW of resistance heating does not run off an inverter.
    //
    // WHY IT SURVIVED 36 GREEN RUNNERS, and it is the #315 shape: the heaters are only
    // DEMANDED when pressure is below setpoint, and an SBO on this plant REPRESSURIZES.
    // Measured, the Mode 3 blackout A/Bs byte-identical across the fix because the auto
    // controller never asked for a single percent in an hour. The defect is only
    // reachable once the code safeties have cycled pressure back down — or the instant
    // an operator reaches for the heater controls, which is what free play found.
    //
    // LEG C IS THE ONE THAT MAKES THIS A TEST RATHER THAN A TRANSCRIPT. NUREG-0578 Item
    // 2.1.1 / NUREG-0737 Item II.E.3.1 put the minimum heater group on redundant
    // emergency diesel-backed buses precisely so it SURVIVES a loss of offsite power;
    // the blackout is the event that takes the diesels too. So a plain LOOP must leave
    // the heaters at FULL authority, and any "simplification" of the guard to a proxy
    // that is also true in a LOOP — the pumps being stopped, the turbine tripped, the
    // reactor scrammed — reddens leg C while legs A and B stay green.
    //
    // Injection-verified against the pre-fix engine: legs A and B go red (100.0 % with
    // no AC, and the spurious level trip arrives), leg C passes on BOTH, which is what
    // makes it the discriminator rather than a second copy of leg A.
    'CA-7': function () {
      return test('CA-7 station blackout — no AC, no pressurizer heaters (LOOP keeps them)', function (ck) {
        // --- leg A: the operator calls for heat with every AC bus dead.
        // Driven through set_heater DELIBERATELY. The obvious fix — writing
        // heater_override = 0 when the blackout is injected — is defeated by the very
        // next press of HEATER AUTO or the % box, which is exactly the defect #200 found
        // in stuck_open_spray. De-energization is a physical fact about the plant, not a
        // value parked in the operator's demand, so this probe is that fix's guard too.
        // heater_power_pct is CONTROL_STATE, and the harness recorder only watches
        // numeric true_state fields — h.range() would hand back a silent NaN, and
        // `NaN < 0.01` is false, so the check would fail for the wrong reason rather
        // than pass vacuously. Sample it through the run callback instead.
        var peak = 0, peakAt = -1;
        function watchHeater(hh, tsec) {
          var v = hh.ctl().heater_power_pct || 0;
          if (v > peak) { peak = v; peakAt = tsec; }
        }
        var h = H('hot_zero_power');
        h.run(60);
        h.cmd('inject_failure', { failure_id: 'station_blackout' });
        h.cmd('set_heater', { power_pct: 100 });     // full manual demand, no AC to answer it
        h.run(600, watchHeater);
        var c = h.ctl(), t = h.ts();
        ck('the blackout is actually in effect', String(t.station_blackout), t.station_blackout === true, 'true');
        ck('heater power stays at ZERO for the whole blackout',
          'peak ' + fmt(peak, 1) + ' %' + (peakAt >= 0 ? ' @ ' + fmt(peakAt, 0) + ' s' : ''),
          peak < 0.01, '0 %');
        // The operator's SELECTOR is untouched — heater_auto false means the manual
        // demand is still latched exactly where it was set. What went to zero is the
        // power delivered, not the command; restoring AC must give the heaters back
        // without the operator re-selecting anything.
        ck('the operator\'s manual demand is still latched (selector not rewritten)',
          'heater_auto ' + String(c.heater_auto), c.heater_auto === false, 'false');
        ck('no phantom-heat pressurization', fmt(h.range('pressure_mpa').max, 2) + ' MPa max',
          h.range('pressure_mpa').max < 15.7, '< 15.7');
        ck('no spurious low-level trip driven by boiling the pzr dry',
          h.tripReason || 'none', h.tripTime == null, 'none');

        // --- leg B: same, but the heaters left in AUTO with pressure BELOW setpoint,
        // so the auto controller is genuinely asking. Without this leg the probe only
        // covers the manual path and a guard placed after the override branch would pass.
        var h2 = H('hot_zero_power');
        h2.run(60);
        h2.cmd('inject_failure', { failure_id: 'station_blackout' });
        h2.cmd('set_heater', { auto: true });
        h2.cmd('set_pressure_setpoint', { mpa: 16.5 });   // setpoint above pressure → auto demands heat
        peak = 0; peakAt = -1;
        h2.run(600, watchHeater);
        ck('AUTO cannot energize them either (setpoint 16.5 MPa, pressure below it)',
          'peak ' + fmt(peak, 1) + ' % at ' + fmt(h2.ts().pressure_mpa, 2) + ' MPa',
          peak < 0.01 && h2.ts().pressure_mpa < 16.5, '0 %');

        // --- leg C: A LOSS OF OFFSITE POWER IS NOT A BLACKOUT. The diesels are running,
        // and II.E.3.1's heater group is on them. Full authority, same demand, same rig.
        // OBSERVED WHILE THE PRESSURIZER IS STILL COVERED, and the reason is a SECOND
        // interlock, not a weakening of this one. Since #334 the heaters also cut out
        // below 17 % indicated level (WTSM 10.3 §10.3.4.1), and measured, this LOOP walks
        // pzr level 38.0 % → 18.0 % in the TWENTY SECONDS after the LOOP, as inventory
        // sags ~2.6 % against #330's 776 %-per-frac deficit slope — and then it PARKS at
        // 15–18 %, chattering across the cutoff. So the old 300 s sample had the level
        // interlock firing and MASKING the thing this leg exists to show, 60 s lands
        // within 0.3 % of the setpoint and 30 s lands BELOW it. 10 s is the only sample
        // with real margin (28.9 %), and it is also the right place to ask the question:
        // an AC guard is INSTANTANEOUS, so a wrong one — e.g. keyed on `!s.pump_running`
        // — has already fired by then, and this leg discriminates exactly as before.
        var h3 = H('hot_zero_power');
        h3.run(60);
        h3.cmd('inject_failure', { failure_id: 'loss_of_offsite_power' });
        h3.cmd('set_heater', { power_pct: 100 });
        h3.run(10);
        ck('LOOP is NOT a blackout — the flag stays clear', String(h3.ts().station_blackout),
          h3.ts().station_blackout !== true, 'false');
        ck('the pressurizer is still covered, so this leg is asking the AC question',
          fmt(h3.ins().pzr_level, 1) + ' % indicated',
          h3.ins().pzr_level > RD.PWR_CONFIG.pressurizer.heater_cutoff_level_pct + 3, '> 20 %');
        ck('and the diesel-backed heaters answer at FULL power (II.E.3.1)',
          fmt(h3.ctl().heater_power_pct, 1) + ' %', h3.ctl().heater_power_pct > 99, '100 %');
        // …and when they DO stop later in this same run, say which interlock did it — the
        // two are separately sourced and must not be allowed to blur into each other.
        // Sampled ACROSS the window, not at an instant, because the level parks ON the
        // setpoint and the cutoff chatters in THIS RIG.
        //
        // WHAT THAT CHATTER IS, corrected 2026-08-04d. The #334 write-up first blamed a
        // missing letdown-isolation half of the same bistable. Both halves of that were
        // wrong. The isolation EXISTS (pwr_control.js, `pzr_level` low 17.0 ->
        // set_letdown_orifices, latched at reset_below 20.0) and measured, letdown reads
        // a flat ZERO through this whole window — it fired and latched, so it could not
        // have been what was missing. The real driver is THIS PROBE'S OWN RIG: it holds a
        // full MANUAL 100 % heater demand indefinitely, which at no load walks pressure
        // past the 16.20 MPa PORV setpoint. Measured, porv_open goes true at 16.29 MPa;
        // the PORV takes mass out, level falls through the cutoff, the heaters drop,
        // pressure falls, the PORV reseats, charging refills and the heaters come back.
        // That is a correct plant answering an incorrect operator action, not a defect —
        // and without the manual demand a LOOP shows no chatter at all (level holds
        // 38-41 %, inventory 100.00 %). Left as-is deliberately: the rig has to hold the
        // demand to prove the AC point, and the cycling is what the plant should do.
        var lacAlive = true, lcutSeen = false;
        h3.run(330, function (hh) {
          if (hh.ts().ac_available === false) lacAlive = false;
          if ((hh.ctl().heater_power_pct || 0) < 0.01 &&
              hh.ins().pzr_level < RD.PWR_CONFIG.pressurizer.heater_cutoff_level_pct) lcutSeen = true;
        });
        ck('AC never went away on a LOOP — the diesels carried the 1E buses throughout',
          String(lacAlive), lacAlive === true, 'true');
        ck('the later cut-out is the LEVEL interlock, not the AC one',
          lcutSeen ? 'heaters off with AC up and level below cutoff' : 'never observed',
          lcutSeen === true, 'observed');
      });
    },

    // CA-8 — THE AC-LOAD ROSTER (2026-08-03, #332). CA-7's general case.
    //
    // #329 fixed the pressurizer heaters. #332 filed the rest: the plant had no concept
    // of AC availability at all, so every motor added since kept turning through a
    // blackout. Measured full stack before this fix, `hot_zero_power`, SBO at t = 60 s:
    //
    //   letdown pinned at 0.0297 for THREE HOURS, charging modulating against pzr level
    //   exactly as it does with the grid up, and inventory bled 100 % -> 76.55 % through
    //   a system with no motive power. Separately, with the SBO in and the operator
    //   pressing SI, the DEAD ECCS pump injected the RCS from 100 % to 120 % — solid —
    //   in under five minutes. That one is not in the issue; it turned up measuring it.
    //
    // SOURCED, and the sources changed the SHAPE of the fix twice.
    //
    //  (1) WTSM 4.1.3.4 (ML11223A214, p. 4.1-16): "Two of the pumps are single-speed,
    //      horizontal centrifugal pumps powered from vital (Class 1E) ac power" — so the
    //      charging pump is unambiguously an AC load, and "The centrifugal charging pumps
    //      also serve as the high head safety injection pumps of the emergency core
    //      cooling systems", which puts SI on the same bus.
    //  (2) WTSM 4.1.3.1 (same doc, p. 4.1-7), letdown orifice isolation interlock 2: "At
    //      least one charging pump must be running in order to open any letdown orifice
    //      isolation valve. IF THE RUNNING CHARGING PUMP(S) IS LOST, THEN THE LETDOWN
    //      ORIFICE ISOLATION VALVES CLOSE." Letdown is therefore gated on the PUMP, not
    //      on the blackout flag — which is leg C, and it is a second defect the issue did
    //      not know about: see below.
    //  (3) WTSM 5.7.5 (ML11223A229, p. 5.7-6): "A station blackout fails all ac power
    //      except the vital Class IE ac busses from the dc invertors. All decay heat
    //      removal systems, EXCEPT THE TURBINE-DRIVEN AFW PUMP, also fail." That single
    //      sentence is legs A/B/D together — everything motor-driven stops, AFW does not.
    //
    // LEG C IS THE ONE THAT EARNED ITS KEEP. Gating letdown on `ac_available` directly
    // would have passed legs A, B, D and E and left a REAL defect standing: measured with
    // the grid fully up, securing the charging pump left letdown flowing and drained
    // 100 % -> 79.5 % of inventory in 13 minutes, until the low-pzr-level isolation (the
    // other real interlock, in pwr_control) caught it at 17 %. The sourced interlock fixes
    // both with one guard; a blackout-shaped guard fixes one and hides the other.
    //
    // LEG E is CA-7 leg C's argument applied to the whole roster: a LOOP keeps the 1E
    // buses on the diesels, so any proxy that is also true in a LOOP — pumps stopped,
    // turbine tripped, reactor scrammed — reddens E while A-D stay green.
    //
    // LEG D asserts the SURVIVORS POSITIVELY, and that is deliberate. Three of the four
    // legs here say "this went to zero"; a suite of only-zero checks is satisfied by
    // gating the entire plant on the blackout flag, which would be a much worse model
    // than the one it replaced. AFW must still deliver and the accumulators must still
    // dump, with every bus dead.
    'CA-8': function () {
      return test('CA-8 station blackout — the AC-load roster (CVCS + ECCS die, AFW + accumulators live)', function (ck) {
        // h.range() spans the WHOLE run, and every leg here settles the plant before it
        // injects anything — so a bare range() peak reports the healthy pre-event flow and
        // the check fails against its own fixture. (It did, on the first draft, for both
        // CVCS fields.) peakAfter() records only the window the callback is attached to.
        function peakAfter(field) {
          var p = 0;
          var fn = function (hh) { var v = hh.ts()[field] || 0; if (v > p) p = v; };
          fn.peak = function () { return p; };
          return fn;
        }

        // --- leg A: the CVCS through a three-hour blackout.
        //
        // THE OPERATOR IS ASKING FOR CHARGING, in MANUAL, and that is load-bearing rather
        // than colour. With the CVCS left in AUTO the charging guard is INVISIBLE: the
        // auto law targets `letdown_flow + level_demand`, letdown is already zero on the
        // interlock, and an SBO repressurizes so the level servo asks for nothing either —
        // measured by injection, reverting the mass-balance guard alone left all 47 probes
        // green. `set_charging_flow` parks a real demand in `charging_setpoint` and that
        // is what the guard has to refuse. It is the #200 shape as well: the demand stays
        // latched and only DELIVERED flow goes to zero.
        var h = H('hot_zero_power');
        h.run(60);
        h.cmd('inject_failure', { failure_id: 'station_blackout' });
        h.cmd('set_charging_flow', { normalized: 0.05 });   // operator calls for charging, no AC to answer
        var wLet = peakAfter('letdown_flow_actual'), wChg = peakAfter('charging_flow_actual');
        h.run(3600, function (hh, ts) { wLet(hh, ts); wChg(hh, ts); });
        var t = h.ts(), c = h.ctl();
        ck('the blackout is actually in effect', 'ac_available ' + String(t.ac_available),
          t.ac_available === false && t.station_blackout === true, 'false');
        ck('letdown ISOLATES — no orifice bleed with the charging pump de-energized',
          'peak ' + fmt(wLet.peak(), 4), wLet.peak() < 1e-4, '0');
        ck('the charging pump delivers NOTHING (Class 1E ac load, WTSM 4.1.3.4)',
          'peak ' + fmt(wChg.peak(), 4), wChg.peak() < 1e-4, '0');
        // The pre-fix plant reached 76.55 % over three hours; one hour of it is ~92 %.
        // Banded well inside that, so this fails loudly on the old engine rather than
        // squeaking past on a slow leak.
        ck('and inventory does not bleed away through a dead system',
          fmt(h.range('core_inventory_pct').min, 2) + ' % min', h.range('core_inventory_pct').min > 99.5, '> 99.5 %');
        // BOTH DIRECTIONS, because there are TWO guards and one check only sees one of
        // them. The indication guard (`charging_flow_actual`) is what the check above
        // reads; the MASS-BALANCE guard is a different line, and with the demand latched
        // at 0.05 a dead pump that still moved water would push inventory UP. Measured by
        // injection: without this check, reverting the mass-balance guard left all 47
        // probes green — the defect was real, unobserved, and one assertion away.
        ck('nor is it pumped UP by a dead pump answering a latched 0.05 demand',
          fmt(h.range('core_inventory_pct').max, 2) + ' % max', h.range('core_inventory_pct').max < 100.5, '< 100.5 %');
        // The SELECTOR is untouched — same #200 guard as CA-7 leg A. What went to zero
        // is delivered flow, not the operator's lineup, so restoring AC gives the CVCS
        // back with nothing to re-select.
        ck('the operator\'s charging-pump switch is still in RUN (selector not rewritten)',
          'charging_pump_running ' + String(c.charging_pump_running), c.charging_pump_running !== false, 'true');
        ck('and their manual charging demand is still latched at 0.05 — only DELIVERY died',
          'charging_flow_normalized ' + fmt(c.charging_flow_normalized, 3),
          c.charging_flow_normalized > 0.04, '0.05');

        // --- leg B: the operator presses SI with every bus dead. A dead pump makes no
        // flow AND no head, so the discharge gauge must read the RCS, not a pump curve.
        var h2 = H('hot_zero_power');
        h2.run(60);
        h2.cmd('inject_failure', { failure_id: 'station_blackout' });
        h2.cmd('set_hpi', { active: true });
        h2.run(1200);
        var t2 = h2.ts();
        ck('SI is DEMANDED (the run lights stay honest — demand is not the same as flow)',
          String(t2.hpi_active), t2.hpi_active === true, 'true');
        ck('but the de-energized ECCS pump injects NOTHING',
          'peak ' + fmt(h2.range('hpi_flow_normalized').max, 4), h2.range('hpi_flow_normalized').max < 1e-4, '0');
        ck('and develops no head — discharge pressure is not a pump curve',
          fmt(h2.range('hpi_discharge_pressure_mpa').max, 2) + ' MPa max',
          h2.range('hpi_discharge_pressure_mpa').max < 1e-6, '0 MPa');
        ck('so the RCS is not pumped solid by a pump with no electricity',
          fmt(h2.range('core_inventory_pct').max, 2) + ' % max', h2.range('core_inventory_pct').max < 101, '< 101 %');

        // --- leg C: THE GRID IS UP. Secure the charging pump and letdown must isolate
        // on the sourced interlock alone (WTSM 4.1.3.1 #2). This is what distinguishes
        // the pump interlock from a blackout-shaped guard.
        var h3 = H('hot_zero_power');
        h3.run(60);
        h3.cmd('set_charging_pump', { running: false });
        var wLet3 = peakAfter('letdown_flow_actual');
        h3.run(1200, wLet3);
        ck('AC is available throughout leg C (no blackout involved)',
          'ac_available ' + String(h3.ts().ac_available), h3.ts().ac_available === true, 'true');
        ck('losing the charging pump ISOLATES letdown (WTSM 4.1.3.1 interlock 2)',
          'peak ' + fmt(wLet3.peak(), 4), wLet3.peak() < 1e-4, '0');
        ck('so securing the pump does not quietly drain the RCS',
          fmt(h3.range('core_inventory_pct').min, 2) + ' % min', h3.range('core_inventory_pct').min > 99.5, '> 99.5 %');

        // --- leg D: THE SURVIVORS. AFW is turbine-driven and the accumulators are
        // pressurized N2 behind a check valve; neither owes the switchgear anything.
        // Driven on a LOCA so the accumulators actually reach their setpoint.
        //
        // AFW IS ASSERTED ON DISCHARGE PRESSURE, NOT DELIVERED FLOW, AND THAT IS NOT A
        // WEAKENING — delivered flow is UNREACHABLE here, for #325's reason. Measured, a
        // blackout at full power parks SG level at 61.6 % and holds it there for 25
        // minutes: with the RCPs stopped there is no core->SG heat path, so the generator
        // never boils down and the level-hold valve correctly throttles AFW shut. An
        // `afw_flow_normalized > 0` check would pin a NON-EVENT and go green the day
        // natural circulation is built. Discharge pressure is the honest observable: it
        // is driven by `afw_pump_demand` alone (pwr_steam_generator, stepSecondary), so it
        // reads 159.5 psi (1.10 MPa) with every bus dead and would collapse to 0 the
        // moment someone gated the AFW pump on ac_available. Its contrast partner is the
        // check below it — the ECCS pump, one line of code away, reading exactly zero.
        var h4 = H('hot_full_power');
        h4.run(60);
        h4.cmd('inject_failure', { failure_id: 'station_blackout' });
        h4.cmd('inject_failure', { failure_id: 'large_loca', severity: 0.3 });
        h4.cmd('set_hpi', { active: true });
        h4.cmd('set_afw', { active: true });
        var wAfwP = peakAfter('afw_discharge_pressure_mpa'), wHpi4 = peakAfter('hpi_flow_normalized');
        h4.run(600, function (hh, ts) { wAfwP(hh, ts); wHpi4(hh, ts); });
        ck('every bus is still dead through leg D', 'ac_available ' + String(h4.ts().ac_available),
          h4.ts().ac_available === false, 'false');
        ck('the TURBINE-DRIVEN AFW pump still makes head (WTSM 5.7.5 — the one survivor)',
          fmt(wAfwP.peak(), 2) + ' MPa', wAfwP.peak() > 0.5, '> 0.5 MPa');
        ck('the PASSIVE accumulators still dump — no pump, no bus, no permission needed',
          fmt(h4.range('accumulator_volume_pct').min, 1) + ' % remaining',
          h4.range('accumulator_volume_pct').min < 50, '< 50 %');
        ck('while the motor-driven ECCS pump beside them stays dead',
          'peak ' + fmt(wHpi4.peak(), 4), wHpi4.peak() < 1e-4, '0');

        // --- leg E: A LOSS OF OFFSITE POWER IS NOT A BLACKOUT (CA-7 leg C's argument,
        // applied to the roster). The diesels carry the 1E buses, so the CVCS and the
        // ECCS pump both keep working. Any proxy for "no AC" that is also true in a LOOP
        // reddens THIS leg and nothing else here.
        var h5 = H('hot_zero_power');
        h5.run(60);
        h5.cmd('inject_failure', { failure_id: 'loss_of_offsite_power' });
        h5.run(300);
        h5.cmd('set_hpi', { active: true });
        h5.run(300);
        ck('LOOP leaves the 1E buses energized (the diesels have them)',
          'ac_available ' + String(h5.ts().ac_available), h5.ts().ac_available === true, 'true');
        ck('so letdown keeps flowing through a LOOP',
          fmt(h5.range('letdown_flow_actual').max, 4), h5.range('letdown_flow_actual').max > 0.01, '> 0.01');
        ck('the charging pump keeps running through a LOOP',
          fmt(h5.range('charging_flow_actual').max, 4), h5.range('charging_flow_actual').max > 0.01, '> 0.01');
        ck('and SI injects when asked — a LOOP is not a loss of the ECCS pump',
          fmt(h5.range('hpi_flow_normalized').max, 4), h5.range('hpi_flow_normalized').max > 0.001, '> 0.001');
      });
    },

    // CA-9 — LOSING CVCS MAKE-UP (2026-08-04, #330). The pressurizer level IS the cue.
    //
    // #330: stand down the `cvcs_makeup` automation channel at hot full power, touch
    // nothing else, and the core MELTED at 22.1 min — un-scrammed, with primary pressure,
    // Tavg and subcooling margin dead flat at nominal and the cladding at 24,958 °F
    // (13,848 °C). Two caution/warning annunciators on one level channel were the entire
    // indication that the core was being destroyed. It is reachable today: `cvcs_makeup`
    // is `defaultOn` and has an AUTO/MAN button on the board.
    //
    // THE ROOT CAUSE IS A GEOMETRY ERROR, not a missing alarm and not a missing trip.
    // `level_per_mass` was 100 %/frac against `level_per_mass_surplus` 776 — two different
    // slopes for the same pressurizer. A subcooled RCS is incompressible liquid everywhere
    // except the pressurizer bubble (the surplus branch's own comment says so: "the only
    // compressible volume"), so inventory leaving it comes out of the PRESSURIZER at
    // exactly the rate a surplus packs into it. The geometry does not know which way the
    // flow is going. At the shallow slope the loop could shed 37.5 % of its mass while the
    // gauge still read 17.5 %.
    //
    // LEG C IS THE ONE THAT EARNED ITS KEEP, and it is #330's sharpest finding turned
    // into a number. The low-pzr-level letdown isolation is not broken and never was — it
    // fires at 20 % indicated on both plants. What changed is the INVENTORY it fires at:
    // 65 % before (core already uncovered — the issue's "the protective actuation is what
    // destroys the core"), 95.5 % after. An assertion that the isolation *fired* passes on
    // both and proves nothing; the inventory at which it fired is the whole defect.
    //
    // LEG D PASSES ON THE OLD PLANT DELIBERATELY. It is the false-positive guard: the
    // SHIPPED lineup must be untouched by this. A change that made the level line stiffer
    // could easily make a healthy plant twitch, and nothing else here would notice.
    /* CA-10 (#334) — THE 17 % LOW-LEVEL HEATER CUTOFF, and the deadlock it removes.
     *
     * SOURCED, setpoint and all: WTSM 10.3 *Pressurizer Level Control System*
     * (ML11223A290) §10.3.4.1 — "This bistable provides a low level interlock at 17% level
     * in the pressurizer … and turns off all pressurizer heaters. … the heater cutoff
     * protects the heaters which would be damaged if operated in a steam environment."
     * They are damageable because they are direct-immersion elements in the lower vessel
     * (WTSM 3.2, ML11223A213).
     *
     * WHAT IT COST TO NOT HAVE IT. Measured full stack on a 5 %-of-max cold-leg LOCA: ECCS
     * refilled the RCS to 120 %, quenched it to ~100 °C, and then the heaters — at 92 %
     * with the pressurizer indicating a flat 0 % — drove pressure back to 2207 psi
     * (15.22 MPa) with the coolant 240 °C SUBCOOLED. No thermodynamic source produces
     * that; it is heater power alone. At 15.5 MPa the pressure-driven ECCS curve delivers
     * 0.0034 frac/s against a 0.050 leak, so injection is DEADHEADED, the core drains and
     * stays dry, and heater ≈ break is a STABLE equilibrium.
     *
     * THE SYMPTOM THAT GOT IT FILED WAS NON-MONOTONICITY, which is what leg E pins: a
     * 10 % break destroyed the core while a 20 % and a 30 % break were fully survivable.
     * After the fix the survival boundary is `hpi_flow_max + lpi_flow_max·lpi_inventory_gain`
     * = 0.160 frac/s exactly — a number DERIVED from the ECCS capacity rather than an
     * artifact, so leg E computes it from config instead of transcribing it.
     *
     * Leg D is the one that makes this an INTERLOCK rather than a truth read (HR1).
     */
    'CA-10': function () {
      return test('CA-10 the 17 % low-level heater cutoff — sourced, instrument-driven, and it breaks the LOCA deadlock', function (ck) {
        var pz = RD.PWR_CONFIG.pressurizer;
        var CUT = pz.heater_cutoff_level_pct;
        ck('the cutoff is configured at the SOURCE\'s setpoint (WTSM 10.3 §10.3.4.1)',
          CUT + ' %', Math.abs(CUT - 17.0) < 0.001, '17 %');

        // ---- leg A: it must not fire in normal operation. A cutoff that trips at power
        // would be worse than the defect it fixes.
        var a = H('hot_full_power');
        var aMinHeat = 1e9, aSawDemand = false;
        a.run(300, function (hh) {
          var lvl = hh.ins().pzr_level;
          if (lvl > 40) { var v = hh.ctl().heater_power_pct; if (v != null) { aSawDemand = true; if (v < aMinHeat) aMinHeat = v; } }
        });
        ck('normal operation stays well above the cutoff',
          fmt(a.range('pzr_level_pct').min, 1) + ' % min level',
          a.range('pzr_level_pct').min > CUT + 20, '> ' + (CUT + 20) + ' %');
        ck('the heater channel is alive at power (leg A observed it)',
          aSawDemand ? 'observed' : 'NEVER OBSERVED', aSawDemand === true, 'observed');

        // ---- leg B: the interlock itself. Drain the pressurizer with a small break and a
        // FULL MANUAL heater demand standing, then require that NO sample below the cutoff
        // ever delivers heater power. Driven through set_heater deliberately — the #200
        // rule: de-energization is physical, not a value parked in the operator's demand.
        var b = H('hot_full_power');
        b.run(60);
        b.cmd('inject_failure', { failure_id: 'large_loca', severity: 0.10 });
        b.cmd('set_heater', { power_pct: 100 });
        // THE LAG IS HANDLED BY RUN LENGTH, NOT BY A MARGIN (re-authored 2026-08-04, #348).
        // The interlock reads the PREVIOUS step's indication (instruments are step 15,
        // autoControl is step 7 — CONTEXT §11 explicit coupling), so on the step where level
        // crosses down through the setpoint the heaters are still acting on an above-cutoff
        // reading. This used to be absorbed by banding at CUT − 1 and demanding zero
        // violations, on a measurement of "2 samples out of 1369, both at 16.3 %".
        //
        // That margin was really a proxy for HOW FAST the level crosses, and #337 changed
        // exactly that — the pressurizer surge now moves level with pressure, so the crossing
        // is quicker and the lagged sample lands DEEPER: measured, one violation at 15.9 %,
        // 0.1 point under a 16.0 band. Chasing it with a wider margin would be tuning the
        // fudge, and the next change to the inventory path would move it again.
        //
        // So the claim is asserted the way the check's own title states it — SETTLED operation
        // below the cutoff. A one-step lag cannot produce CONSECUTIVE violating samples; a
        // broken interlock produces hundreds. That is a property of the mechanism rather than
        // of how fast this particular transient happens to cross, so it does not need
        // re-tuning the next time something moves the inventory path.
        //
        // THE CUT − 1 BAND STAYS, and it is now carrying a DIFFERENT fact — worth knowing
        // before anyone "simplifies" it away. Widening it to the real setpoint was tried:
        // it reports 499 violations with a longest run of EIGHT, worst 100 % at 16.5 %. That
        // is not the lag, it is the cutoff CHATTERING — the level parks around the setpoint
        // and the interlock has no deadband, which is #334's own documented follow-up (the
        // same zero-deadband shape as #288's RHR valve). This leg is about whether the
        // interlock de-energizes the heaters, not about whether it chatters, so the band
        // deliberately sits clear of that region and the chatter stays filed where it belongs.
        var bViol = 0, bBelow = 0, bWorst = 0, bWorstLvl = -1, bRun = 0, bMaxRun = 0;
        b.run(1500, function (hh) {
          var lvl = hh.ins().pzr_level, hp = hh.ctl().heater_power_pct || 0;
          if (lvl != null && lvl < CUT - 1.0) {
            bBelow++;
            if (hp > 0.01) {
              bViol++; bRun++; if (bRun > bMaxRun) bMaxRun = bRun;
              if (hp > bWorst) { bWorst = hp; bWorstLvl = lvl; }
            } else bRun = 0;
          }
        });
        ck('the run actually went below the cutoff (or leg B proves nothing)',
          bBelow + ' samples below ' + fmt(CUT - 1.0, 0) + ' %', bBelow > 10, '> 10 samples');
        ck('heater power is ZERO whenever level is settled below the cutoff, with a 100 % demand standing',
          bViol + ' violations, longest run ' + bMaxRun +
          (bViol ? ' (worst ' + fmt(bWorst, 1) + ' % at ' + fmt(bWorstLvl, 1) + ' % level)' : ''),
          bMaxRun <= 1, 'no CONSECUTIVE violating samples (a one-step lag cannot make two)');
        ck('the operator\'s DEMAND is untouched — only delivered power went to zero',
          fmt(b.ctl().heater_power_pct, 1) + ' % delivered, selector ' + String(b.ctl().heater_auto),
          b.ctl().heater_auto === false, 'still in MANUAL where the operator put it');

        // ---- leg C: THE REPORTED DEFECT. The pathological state is an EMPTY RCS held at
        // high pressure — that combination is what deadheads the ECCS. Assert it never
        // occurs, rather than asserting an outcome a tuning could reach another way.
        var c = H('hot_full_power');
        c.run(60);
        c.cmd('inject_failure', { failure_id: 'large_loca', severity: 0.10 });
        // PERSISTENCE, not occurrence — the TR-1h trap. A LOCA blowdown legitimately
        // TRANSITS "low inventory at pressure" on its way down (measured, 7 samples
        // peaking at 9.63 MPa), so a bare "never happened" check pins a transient the
        // plant is entitled to. What defined the defect was that the state was a STABLE
        // EQUILIBRIUM — heater power balancing the break's own depressurization at 15.22
        // MPa, indefinitely. So this measures the longest UNBROKEN stretch: on the
        // pre-#334 engine it is the whole remainder of the run.
        var cBad = 0, cWorstP = 0, cStreak = 0, cMaxStreak = 0, cSamples = 0;
        c.run(1800, function (hh) {
          var t = hh.ts();
          cSamples++;
          if (t.core_inventory_pct < 5 && t.pressure_mpa > 8.0) {
            cBad++; cStreak++;
            if (cStreak > cMaxStreak) cMaxStreak = cStreak;
            if (t.pressure_mpa > cWorstP) cWorstP = t.pressure_mpa;
          } else cStreak = 0;
        });
        var tc = c.ts();
        var cFrac = cSamples ? cMaxStreak / cSamples : 0;
        ck('the empty-and-pressurized state is a TRANSIENT, not the equilibrium',
          fmt(cFrac * 100, 1) + ' % of the run in the longest unbroken stretch (' +
          cMaxStreak + '/' + cSamples + ' samples, ' + cBad + ' total, worst ' + fmt(cWorstP, 2) + ' MPa)',
          cFrac < 0.05, '< 5 % of the run');
        ck('…and the plant is not sitting in it at the end',
          fmt(tc.core_inventory_pct, 1) + ' % at ' + fmt(tc.pressure_mpa, 2) + ' MPa',
          !(tc.core_inventory_pct < 5 && tc.pressure_mpa > 8.0), 'not deadheaded');
        ck('a 10 %-of-max break recovers inventory instead of draining dry',
          fmt(tc.core_inventory_pct, 1) + ' %', tc.core_inventory_pct > 50, '> 50 %');
        ck('…and the core is not damaged', String(tc.fuel_damaged), tc.fuel_damaged === false, 'false');

        // ---- leg D: HR1. The bistable is fed by a LEVEL TRANSMITTER, and WTSM 10.3 names
        // the channel assignment twice over. `pzr_level_sensor_low` sticks the indication
        // at 20 % — ABOVE the 17 % cutoff — so with true level below it the heaters must
        // STAY ENERGIZED. This is what separates an instrument-driven interlock from a
        // read of truth, and it is the check that fails if someone "simplifies" the guard
        // to s.pzr_level_pct.
        var d = H('hot_full_power');
        d.run(60);
        d.cmd('inject_failure', { failure_id: 'pzr_level_sensor_low' });   // stuck at 20 %
        d.cmd('inject_failure', { failure_id: 'large_loca', severity: 0.10 });
        d.cmd('set_heater', { power_pct: 100 });
        // SUSTAINED, not "ever" — and this is the trap worth keeping. The first draft set a
        // boolean on any single sample with true level below the cutoff and heaters lit,
        // and it PASSED against the truth-reading injection: because autoControl (step 7)
        // reads state that pzr_level_pct (step 8) has not yet updated, even a truth-read
        // guard leaves one lagging sample, which is enough to trip a bare "ever" flag. The
        // discriminating claim is that a stuck transmitter keeps the heaters energized for
        // essentially the WHOLE excursion, not for one step of coupling lag.
        var dLow = 0, dFooledN = 0;
        d.run(900, function (hh) {
          var t = hh.ts(), hp = hh.ctl().heater_power_pct || 0;
          if (t.pzr_level_pct < CUT) { dLow++; if (hp > 50) dFooledN++; }
        });
        var dFrac = dLow ? dFooledN / dLow : 0;
        ck('true level really went below the cutoff on the failed-sensor leg',
          fmt(d.range('pzr_level_pct').min, 1) + ' % true min, ' + dLow + ' samples',
          dLow > 100, '> 100 samples below ' + CUT + ' %');
        ck('a transmitter stuck at 20 % DEFEATS the cutoff throughout — it reads the instrument (HR1)',
          fmt(dFrac * 100, 1) + ' % of the low-level samples kept full heater power (' + dFooledN + '/' + dLow + ')',
          dFrac > 0.5, '> 50 %');

        // ---- leg E: the fix is not a blanket rescue.
        //
        // RE-AUTHORED for #334 item 2, and the reason is that its old criterion stopped
        // being true of the plant. It used to compare the break's rate against the ECCS
        // capacity — `hpi_flow_max + lpi_flow_max·lpi_inventory_gain` — and require
        // anything above that ceiling to destroy the core. That is a valid STEADY-STATE
        // argument only while break flow is CONSTANT, which it was: leak > injection
        // forever, so the core could never be recovered. Now that discharge follows the
        // upstream pressure (10 CFR 50 App K I.C.1.b), a break that starts above the
        // ceiling ends below it as the RCS blows down, and the comparison decides nothing.
        // Measured: at severity 1.0, the largest break there is, the core uncovers fully
        // at 90 s and is then refilled by the accumulators and ECCS with peak clad at
        // 773.9 °C — the design-basis success path, which is what ECCS is FOR.
        //
        // So the guard is re-pointed at what must still be true: ECCS is the thing that
        // saves it. Defeat the injection and the same break must still destroy the core.
        // That fails on any change which makes a LOCA unconditionally survivable, which is
        // the property the old leg was really protecting.
        var em = RD.PWR_CONFIG.emergency;
        var ceiling = em.hpi_flow_max + em.lpi_flow_max * em.lpi_inventory_gain;
        var sevMax = 50 / 100;                                        // large_loca meta.max/100
        var survivable = (ceiling / sevMax) * 0.85;
        function outcome(sev, secs, killEccs) {
          var h = H('hot_full_power');
          h.run(60);
          if (killEccs) {
            h.cmd('set_eccs_armed', { armed: false });
            h.cmd('inject_failure', { failure_id: 'degraded_hpi', severity: 1.0 });
            h.cmd('set_hpi', { active: false });
          }
          h.cmd('inject_failure', { failure_id: 'large_loca', severity: sev });
          h.run(secs);
          return h.ts();
        }
        var eIn = outcome(survivable, 2100, false);
        ck('a break inside the ECCS capacity is survivable WITH injection (sev ' + fmt(survivable, 3) + ')',
          fmt(eIn.core_inventory_pct, 1) + ' %, damaged ' + String(eIn.fuel_damaged),
          eIn.fuel_damaged === false && eIn.core_inventory_pct > 50, 'intact');
        var eOut = outcome(survivable, 2100, true);
        ck('…and the SAME break destroys the core with ECCS defeated — injection is what saves it',
          fmt(eOut.core_inventory_pct, 1) + ' %, damaged ' + String(eOut.fuel_damaged),
          eOut.fuel_damaged === true, 'damaged');
      });
    },

    /* CA-11 (#334 item 2) — A BREAK IS A HOLE, NOT A PUMP.
     *
     * `leak_flow` for a LOCA was set ONCE when the failure was injected and never varied,
     * so the same break discharged identically at 2235 psi and at 14.5 psi, and an RCS
     * clipped at zero mass went on "leaking" at full rate indefinitely. Only the SGTR path
     * was ΔP-modulated; `stepInventory`'s own comment said "containment-side leaks stay
     * static", which is the defect written down in the source.
     *
     * SOURCED: 10 CFR 50 Appendix K I.C.1.b "Discharge Model" — the discharge rate is a
     * critical-flow function of the upstream state, with "a discharge coefficient applied
     * to the postulated break AREA". A break is an area, not a flow.
     *
     * WHAT THIS PROBE IS FOR. Legs A–C pin the LAW, computed from config rather than
     * transcribed, so a re-reference of `break_p_ref_mpa` moves the expectation with the
     * plant. Leg D exists because the fix restructured the branch that SGTR also runs
     * through, and leg E is the consequence worth teaching: with the break decaying as the
     * plant blows down, a large-break LOCA becomes the design-basis event it should be —
     * uncover, accumulator injection, reflood — instead of an unrecoverable drain.
     */
    'CA-11': function () {
      return test('CA-11 break discharge follows RCS pressure — a break is a hole, not a pump (#334)', function (ck) {
        var pri = RD.PWR_CONFIG.primary;
        var pRef = pri.break_p_ref_mpa, pBack = pri.break_backpressure_mpa;
        ck('the discharge reference is the operating point, not a fitted number',
          pRef + ' MPa ref, ' + pBack + ' MPa backpressure',
          Math.abs(pRef - 15.41) < 0.01 && pBack > 0 && pBack < 0.5, '15.41 / ~0.1');

        // ---- leg A: CALIBRATION IS PRESERVED AT NOMINAL. This is what lets every severity
        // keep the tuning it was arbitrated with — at rated pressure the factor is exactly
        // 1, so the configured size still means its old rate and only the depressurized
        // end of the curve is new. If this drifts, every pre-#334 LOCA number is stale.
        // RE-FIXTURED 2026-08-04 (#348) — the claim is unchanged, the plant it is measured on
        // is not. This ran a 0.20 break for 2 s and called that "before the RCS has moved".
        // Since #337 a break DEPRESSURISES the RCS through the pressurizer surge, and measured,
        // a 0.20 break takes it 15.41 → 8.80 MPa in HALF A SECOND — so at the 2 s sample the
        // factor is legitimately 0.743 and the probe read a working break as under-flowing.
        // The trajectory: ratio 0.999 at t+0.02 s, 0.915 at t+0.1, 0.754 at t+0.5.
        //
        // A SMALL break holds the plant AT the reference pressure, which is what the claim is
        // actually about — "at rated pressure the factor is exactly 1, so the configured size
        // still means its old rate". Measured, sev 0.002 sits at ratio 0.996..1.000 for 30 s
        // instead of surviving for one engine step, and it passes on the pre-#337 engine too.
        var SEV = 0.20, RATED = SEV * 0.5;                       // severity · (meta.max/100)
        var SEV_CAL = 0.002, RATED_CAL = SEV_CAL * 0.5;
        var cal = H('hot_full_power');
        cal.run(30);
        cal.cmd('inject_failure', { failure_id: 'large_loca', severity: SEV_CAL });
        var calWorst = 0, calAtP = 0;
        cal.run(30, function (hh) {
          var t = hh.ts();
          var err = Math.abs(t.leak_flow - RATED_CAL) / RATED_CAL;
          if (err > calWorst) { calWorst = err; calAtP = t.pressure_mpa; }
        });
        ck('at nominal pressure the break flows its RATED size (old calibration intact)',
          'worst ' + fmt(calWorst * 100, 2) + ' % off rated over 30 s, at ' + fmt(calAtP, 2) + ' MPa',
          calWorst < 0.06, 'within 6 %');

        var a = H('hot_full_power');
        a.run(30);
        a.cmd('inject_failure', { failure_id: 'large_loca', severity: SEV });
        // ONE STEP, taken by hand, and it is the high end of the exponent solve. `run`'s
        // callback fires on the SAMPLE interval, not per step, so its first sample lands at
        // ~0.5 s — by which time this break has already taken the RCS to 8.80 MPa. Seeding the
        // high point from an explicit first step gives a Δp span of 15.28 → 3.78 (ratio 4.0)
        // instead of 8.70 → 3.80 (ratio 2.3), which is the difference between a conditioned
        // log-log solve and one sitting 15 % above its own floor.
        a.run(0.02);
        var t0 = a.ts();
        var hi0 = t0.leak_flow > 0 ? { dp: t0.pressure_mpa - pBack, q: t0.leak_flow } : null;

        // ---- leg B: THE LAW. Sample the same break across the blowdown and check every
        // sample against √((P−Pb)/(Pref−Pb)) recomputed from that sample's own pressure.
        // This is the whole assertion of item 2 and it is checked pointwise, not at ends.
        // SAMPLING STARTS AT THE INJECTION, not 2 s after it — the same #337 depressurization
        // that broke leg A was also skipping the entire high-pressure end of the blowdown.
        var worst = 0, worstAt = 0, n = 0, hi = hi0, lo = null;
        a.run(242, function (hh) {
          var t = hh.ts();
          if (t.pressure_mpa > pBack + 0.05) {
            var want = RATED * Math.sqrt(Math.max(0, (t.pressure_mpa - pBack) / (pRef - pBack)));
            var err = Math.abs(t.leak_flow - want) / Math.max(want, 1e-6);
            n++;
            if (err > worst) { worst = err; worstAt = t.pressure_mpa; }
            // Two widely separated operating points for the EXPONENT check below. Taken as the
            // FIRST and LAST flowing samples and conditioned on their Δp RATIO, not on hardcoded
            // pressures: the old form wanted a sample above 10 MPa and one below 3, and since
            // #337 this break is under 10 MPa within 0.1 s and floors at 3.87 (ECCS and the
            // accumulators balance a break that now self-limits), so it could reach NEITHER.
            // A ratio keeps the log-log solve conditioned without pinning a pressure the plant
            // may no longer visit. Measured span: 15.28 → 3.78 MPa, a ratio of 4.0.
            if (t.leak_flow > 0) {
              if (hi === null) hi = { dp: t.pressure_mpa - pBack, q: t.leak_flow };
              lo = { dp: t.pressure_mpa - pBack, q: t.leak_flow };
            }
          }
        });
        ck('the blowdown was actually sampled (or leg B proves nothing)',
          n + ' samples', n > 200, '> 200');
        ck('break flow tracks √Δp against the RCS pressure at every sample',
          'worst error ' + fmt(worst * 100, 2) + ' % at ' + fmt(worstAt, 2) + ' MPa',
          worst < 0.02, '< 2 %');
        // THE SHAPE, MEASURED — because the check above recomputes the engine's own formula
        // and so cannot fail while the formula merely has the wrong CONSTANTS in it. This
        // one takes two widely separated points off the real blowdown and solves for the
        // exponent: n = ln(q2/q1) / ln(Δp2/Δp1). A constant break gives n = 0, a linear one
        // n = 1, an orifice n = 0.5. Same idiom as TR-15's cube root (#325), and it is what
        // reddens if someone "simplifies" the law back to either neighbour.
        ck('the blowdown spanned both ends (needed to solve for the exponent)',
          hi && lo ? fmt(hi.dp, 2) + ' → ' + fmt(lo.dp, 2) + ' MPa, ratio ' +
            fmt(hi.dp / lo.dp, 2) : 'MISSING',
          !!(hi && lo) && hi.dp / lo.dp > 2, 'Δp ratio > 2');
        if (hi && lo) {
          var nExp = Math.log(lo.q / hi.q) / Math.log(lo.dp / hi.dp);
          ck('the measured exponent is the ORIFICE one — not constant (0) and not linear (1)',
            'n = ' + fmt(nExp, 3), Math.abs(nExp - 0.5) < 0.05, '0.5 ± 0.05');
        }

        // ---- leg C: a depressurized RCS STOPS discharging. The pre-#334 engine kept
        // flowing at the full rated rate here — including with the vessel already empty,
        // which is the piece of #334 that read wrong on the board.
        // RE-BANDED 2 → 4.5 MPa (#348), and it IS a loosening — say so rather than imply it is
        // neutral (HR10). The RCS no longer reaches 2 MPa on this break: measured, it floors at
        // 3.87 MPa and stays there, because since #337 the break self-limits (√Δp against a
        // pressure the break itself is pulling down) while ECCS and the accumulators inject
        // against it — the accumulator setpoint is 4.14 MPa, so the floor sits just under it and
        // that is the balance point, not a stall. 4.5 still proves the low end this leg needs,
        // and it passes on the pre-#337 engine, which goes well below 2.
        var tc = a.ts();
        ck('the RCS really did depressurize (leg C needs the low end)',
          fmt(tc.pressure_mpa, 2) + ' MPa', tc.pressure_mpa < 4.5, '< 4.5 MPa');
        ck('a depressurized break flows a small fraction of its rated size',
          fmt(tc.leak_flow, 4) + ' vs ' + fmt(RATED, 4) + ' rated',
          tc.leak_flow < RATED * 0.55, '< 55 % of rated');

        // ---- leg D: SGTR IS UNTOUCHED. The fix restructured the branch SGTR runs through,
        // and its law references SECONDARY pressure, not containment — so if the two ever
        // got crossed, an SGTR would taper against the wrong reference and the single-SG
        // EOP would stop working. Cheapest possible guard on that.
        var d = H('hot_full_power');
        d.run(30);
        d.cmd('inject_failure', { failure_id: 'sgtr', severity: 0.5 });
        d.run(30);
        var td = d.ts();
        var dpRef = pri.sgtr_dp_ref || 9.8;
        var wantSg = (d.eng.s._leak_base || 0) *
          Math.max(0, Math.min(1.2, (td.pressure_mpa - td.steam_pressure_mpa) / dpRef));
        ck('SGTR still scales on PRIMARY−SECONDARY ΔP, not on containment',
          fmt(td.leak_flow, 5) + ' vs ' + fmt(wantSg, 5) + ' expected (ΔP ' +
          fmt(td.pressure_mpa - td.steam_pressure_mpa, 2) + ' MPa)',
          wantSg > 0 && Math.abs(td.leak_flow - wantSg) / wantSg < 0.02, 'within 2 %');

        // ---- leg E: the consequence. A full-size break is now the DESIGN-BASIS event —
        // it uncovers the core, the accumulators dump, and the core refloods. Before the
        // fix the same break drained to zero and melted, which is why nothing in this suite
        // had ever exercised accumulator injection on a LOCA at all.
        var e = H('hot_full_power');
        e.run(60);
        e.cmd('inject_failure', { failure_id: 'large_loca', severity: 1.0 });
        var sawUncover = false, minAccum = 200;
        e.run(600, function (hh) {
          var t = hh.ts();
          if (t.core_uncovered_frac >= 0.99) sawUncover = true;
          if (t.accumulator_volume_pct < minAccum) minAccum = t.accumulator_volume_pct;
        });
        var te = e.ts();
        ck('the core really does uncover first — this is not immunity',
          sawUncover ? 'fully uncovered' : 'never uncovered', sawUncover === true, 'uncovered');
        ck('the ACCUMULATORS discharge — the passive stage nothing here used to reach',
          fmt(minAccum, 1) + ' % remaining', minAccum < 50, '< 50 %');
        ck('and the core refloods and is not damaged',
          fmt(te.core_inventory_pct, 1) + ' %, damaged ' + String(te.fuel_damaged),
          te.fuel_damaged === false && te.core_inventory_pct > 90, 'intact');
        ck('peak cladding stays below the damage threshold through the transient',
          fmt(e.range('clad_temp_c').max, 0) + ' °C',
          e.range('clad_temp_c').max < RD.PWR_CONFIG.thermal.fuel_damage_c, '< 1200 °C');
      });
    },

    'CA-9': function () {
      return test('CA-9 loss of CVCS make-up — the level cue is real and the isolation protects', function (ck) {
        var pz = RD.PWR_CONFIG.pressurizer;

        // Stand down make-up the way the board does: the automation channel off AND the
        // CVCS out of AUTO. Channel alone is not enough — `set_cvcs_auto` is a separate
        // command and #330's reproduction issues both.
        function noMakeup(h) {
          h.cmd('set_auto_channel', { channel_id: 'cvcs_makeup', engaged: false });
          h.cmd('set_cvcs_auto', { active: false });
          return h;
        }

        // ---- leg A: the headline. #330's reproduction, run well past its 22.1 min melt.
        var a = noMakeup(H('hot_full_power'));
        a.run(2400);                                   // 40 min — the pre-#330 plant melted at 22.1
        var ta = a.ts();
        ck('letdown really is draining the loop (or this proves nothing)',
          fmt(a.range('letdown_flow_actual').max, 4), a.range('letdown_flow_actual').max > 0.01, '> 0.01');
        // The pre-#330 plant reached 62.55 % — far below core_top_uncover (0.70).
        ck('the core never uncovers — inventory holds well above the uncovery threshold',
          fmt(a.range('core_inventory_pct').min, 2) + ' % min',
          a.range('core_inventory_pct').min > 90, '> 90 %');
        ck('so there is no core damage and no melt (pre-#330: melted at 22.1 min)',
          'damaged ' + String(ta.fuel_damaged) + ', melted ' + String(ta.melted),
          ta.fuel_damaged !== true && ta.melted !== true, 'neither');
        // The cue the player actually gets. Not "an alarm exists" — the GAUGE moves, a long
        // way, and parks there. pzr_level_low is 25 %, so this is annunciated and stays so.
        ck('and the pressurizer level gives an unmissable cue — parked deep in alarm',
          fmt(ta.pzr_level_pct, 2) + ' %', ta.pzr_level_pct < 25, '< 25 % (in alarm)');

        // ---- leg B: THE LAW. The pressurizer does not know which way the flow is going,
        // so a deficit and a surplus of the SAME size must move the level the same distance.
        // Measured off the engine's own level line rather than read out of the config, so it
        // catches a divergence introduced anywhere between the constant and the gauge.
        var lvlAt = function (dm) {
          var probe = { tavg_c: 304.0, _tavg_fp: 304.0, _mass: 1.0 + dm, primary_void_fraction: 0 };
          RD.pwrPressurizer.stepLevel(probe, RD.PWR_CONFIG, 0.1);
          return probe.pzr_level_pct;
        };
        var dm = 0.02, base = lvlAt(0), down = base - lvlAt(-dm), up = lvlAt(dm) - base;
        ck('a deficit moves the level as far as an equal surplus (one pressurizer, one slope)',
          fmt(down, 2) + ' points down vs ' + fmt(up, 2) + ' up, on ±' + fmt(dm, 2) + ' inventory',
          Math.abs(down - up) < 0.05 * Math.max(down, up), 'equal within 5 %');
        // …and it is the SOURCED number, not merely self-consistent: 45 points of span over
        // the 0.0580 pressurizer steam-space fraction (#249, BVPS-2 UFSAR + WTSM 3.2).
        ck('and that slope is the sourced pressurizer geometry (45 / 0.0580)',
          fmt(pz.level_per_mass, 1) + ' %/frac', Math.abs(pz.level_per_mass - 776) < 20, '776 ± 20');

        // ---- leg C: the isolation fires while the core is still COVERED. #330's finding,
        // inverted. Catch the inventory at the moment letdown actually shuts.
        var c = noMakeup(H('hot_full_power'));
        var invAtIso = null;
        c.run(1200, function (hh) {
          if (invAtIso == null && (hh.ts().letdown_flow_actual || 0) < 1e-6 && hh.t() > 30) {
            invAtIso = hh.ts().core_inventory_pct;
          }
        });
        ck('the low-level letdown isolation does fire (the actuation is not the defect)',
          invAtIso == null ? 'never' : 'at ' + fmt(invAtIso, 2) + ' % inventory',
          invAtIso != null, 'fires');
        // 65 % before, 95.5 % after. THE ACTUATION IS IDENTICAL — only the inventory it
        // corresponds to moved, which is why "did it fire?" cannot see this defect.
        ck('…and it fires with the core still covered, not after it is lost',
          invAtIso == null ? 'n/a' : fmt(invAtIso, 2) + ' % inventory (pre-#330: 65 %)',
          invAtIso != null && invAtIso > 90, '> 90 %');

        // ---- leg D: THE SHIPPED PLANT IS UNTOUCHED. Passes on the old engine too — this
        // is the calibration guard, not a claim about the fix.
        var d = H('hot_full_power');
        d.run(2400);
        ck('with make-up in AUTO the plant holds inventory indefinitely',
          fmt(d.range('core_inventory_pct').min, 2) + ' % min', d.range('core_inventory_pct').min > 99, '> 99 %');
        ck('…and the level sits on program, not near an alarm',
          fmt(d.ts().pzr_level_pct, 2) + ' %',
          d.ts().pzr_level_pct > 45 && d.ts().pzr_level_pct < 65, '45..65 %');

        // ---- leg E: a leak BEYOND CVCS authority reaches the lo-lo scram. The other half
        // of the same geometry error: at the shallow slope the level fell 7.76x too slowly
        // to reach its own trip, which is what run_reachability B2 asserts statically. Here
        // it is the casualty — an unheld leak must end in a trip, not a slow silent drain.
        var e = H('hot_full_power');
        e.run(60);
        // The PRE-EVENT reference, taken here and not from `range()`. Both halves of that
        // matter and the first draft got the second one wrong: `range()` spans the WHOLE run,
        // and this event RECOVERS hard once the rods are in — subcooling comes back to 86 °F
        // on ECCS, above where it started. Measuring the loss against `range().max` therefore
        // scored the recovery, and read −15.1 °F on the OLD engine, where the true loss is
        // −2.05 °F: the check passed against the very plant it exists to exclude.
        var eSub0 = e.ts().subcooling_c;
        e.cmd('inject_failure', { failure_id: 'sgtr', severity: 0.03 });
        // Sample the PRE-TRIP window explicitly, for the same reason in the other direction.
        var ePmin = null, eSubMin = null;
        e.run(900, function (hh) {
          if (hh.tripTime != null) return;
          var ts = hh.ts();
          if (ePmin == null || ts.pressure_mpa < ePmin) ePmin = ts.pressure_mpa;
          if (eSubMin == null || ts.subcooling_c < eSubMin) eSubMin = ts.subcooling_c;
        });
        // Banded on TRUE level at 20 %, not at the 12 % setpoint, and deliberately: the
        // trip reads the INSTRUMENT (HR1), so true level troughs just past it — measured
        // 12.10 % against a trip that had already fired off the indicated channel. Pinning
        // true level below 12 would be asserting the lag is zero. What discriminates is the
        // DISTANCE travelled: at the pre-#330 slope this leak moves the gauge 7.76x less
        // and parks it near 50 % — nowhere near an alarm, let alone a trip.
        ck('an unheld leak drives the pressurizer down hard — past the lo alarm to its trip',
          fmt(e.range('pzr_level_pct').min, 2) + ' % min', e.range('pzr_level_pct').min < 20, '< 20 %');
        // RE-AUTHORED 2026-08-04 (#337), and this is a WIDENING — say so rather than imply it
        // is neutral (HR10). It read `/pzr_level/` and named the trip. That was correct on a
        // plant where losing inventory could not move pressure: the level channel was the ONLY
        // instrument that responded, so it was also the only path to a scram. Since #337 the
        // same leak drops pressure too, and OTΔT — a DNB protection reading ΔT against
        // pressure — gets there first (174 s, with the level trip following). Both are
        // inventory-driven, so the claim this leg makes is intact; what is no longer true is
        // that only one path exists. Enumerated rather than dropped, so a scram from something
        // genuinely incidental (a secondary upset, a flux trip) still reddens it, and it
        // passes on the OLD engine as well, where the answer is `pzr_level`.
        ck('…and the plant scrams on an INVENTORY-driven path, not on something incidental',
          e.tripReason || 'never',
          /pzr_level|otdt_margin|primary_pressure/.test(e.tripReason || ''),
          'pzr_level | otdt_margin | primary_pressure');
        // NEW with #337, and it FAILS ON THE OLD ENGINE — the point of the change. Before it,
        // this leak took the pressurizer from 55.0 % to its trip while primary pressure moved
        // 5 psi (0.03 MPa) and the subcooling margin moved 0.2 °F (0.1 °C): the PWR's primary
        // "are we still safe" parameter could not degrade from a loss of inventory at all.
        // Banded between the two measured values — OLD −2.05 °F, NEW −8.95 °F from the same
        // 73.75 °F start — so it pins the MECHANISM being present, not one tuning of it.
        ck('…and the PRIMARY parameters degrade with it — subcooling is no longer blind to inventory',
          fmt((eSubMin - eSub0) * 9 / 5, 1) + ' °F from ' + fmt(eSub0 * 9 / 5, 1) +
          ' °F (pre-#337: −2.1 °F)',
          (eSub0 - eSubMin) * 9 / 5 > 5.0, '> 5 °F of margin lost');
        ck('…and pressure with it (pre-#337: 5 psi across the whole event)',
          fmt(ePmin * 145.038, 0) + ' psi min', ePmin * 145.038 < 2175, '< 2175 psi (nominal 2235)');
        T.checkSanity(ck, a);
      });
    },

    /* CA-12 — A WATER-SOLID RCS REPRESSURIZES, AND RELIEF IS WHAT ENDS IT (#346, 2026-08-04).
     *
     * THE DEFECT. `_mass` was clipped at `primary.mass_max` (1.2) and, since #337, the surge
     * driver was clipped with it — deliberately, so a pinned plant would report "zero surge
     * instead of a phantom insurge it has nowhere to put". Both of those options are wrong.
     * A solid RCS being injected into with no relief path does not absorb the mass and does
     * not ignore it: it RELIEVES. Measured full stack before the fix, LOOP + `afw_failure`:
     * inventory pinned at exactly 120.00 % while ECCS injected for 45 minutes, pressure flat
     * at 2232 psi (15.39 MPa), no PORV lift, no safety lift, and cold RWST water quenching
     * the plant 660 → 447 °F through a mass sink with no outlet.
     *
     * WHY NOTHING CAUGHT IT. Before #337 inventory could not move pressure at all, so the
     * clip was unobservable — the #315 shape: a term that is an identity in the regime the
     * gates live in. #337 made the coupling real and made this boundary load-bearing.
     *
     * THE FIX IS A REGIME, NOT A CEILING. Raising `mass_max` was tried first and is NOT the
     * answer: measured at 3.0 the plant simply ran to 300 % inventory with pressure still
     * parked in the PORV band, because the surge gain in use is the one for a pressurizer
     * that still HAS a steam bubble. The bubble is the RCS's only compressible volume; once
     * the level line reaches 100 % it is gone and the same displacement compresses liquid,
     * so the gain steps to the bulk modulus (`solid_bulk_mpa`). `mass_max` then stops being
     * reachable on this path, which is what leg C asserts.
     *
     * LEG B IS THE ONE THAT MAKES IT PHYSICS RATHER THAN A NUMBER. The settling inventory is
     * not transcribed — it is COMPUTED here from the same geometry the engine uses, so a
     * retune of `level_per_mass_surplus` or `level_prog_floor` moves the expectation with the
     * plant instead of leaving a stale constant behind. */
    'CA-12': function () {
      return test('CA-12 a water-solid RCS repressurizes — mass_max stops discarding ECCS overfill', function (ck) {
        var pz = RD.PWR_CONFIG.pressurizer, pr = RD.PWR_CONFIG.primary;

        // ---- leg A: THE REPORTED CASE. Lose the heat sink, let the plant boil down, let
        // ECCS actuate and refill it solid, then ride. The pre-#346 engine sits here flat.
        var a = H('hot_full_power');
        a.run(60);
        a.cmd('inject_failure', { failure_id: 'loss_of_offsite_power' });
        a.cmd('inject_failure', { failure_id: 'afw_failure' });
        // TWO SEGMENTS, and the split is what makes the leg discriminate. The first ~100
        // minutes are the boil-down, the uncovery and the ECCS refill — a violent transit in
        // which the PORV lifts at 55 % duty and pressure swings 160 psi ON BOTH PLANTS. Only
        // the SETTLED overfill after it separates them. Measured, the first draft ran one
        // segment over the whole ride and the pre-#346 engine passed every leg-A check: they
        // were answered by the uncovery, not by the thing under test. A 2400 s window at
        // t+80 min was still contaminated (the pin completes at ~85 min: 1.1 % duty,
        // 161 psi). At t+100 min the two plants are 0.0 % vs 18.0 % duty and 1.8 vs 126 psi.
        //
        // "LEVEL == 100" IS ALSO NOT THE GATE, for the same reason one layer down. The void
        // term pegs the SAME gauge at 100 % on a boiling, half-empty core — that is the TMI
        // deception, the exact opposite of solid. Solid means the gauge at the top AND
        // overfilled AND no void, so all three are required below.
        var aInvMax = 0;
        var seen = function (hh) { var v = hh.ts().core_inventory_pct; if (v > aInvMax) aInvMax = v; };
        a.run(6000, seen);                                  // through the transit
        var aN = 0, aSolid = 0, aInjWhileSolid = 0, aPorv = 0, aPmin = 1e9, aPmax = -1e9;
        a.run(3600, function (hh) {                         // the settled overfill
          var t = hh.ts();
          seen(hh); aN++;
          if (!(t.pzr_level_pct >= 99.99 && t.core_inventory_pct > 100 && !(t.primary_void_fraction > 0))) return;
          aSolid++;
          if (t.hpi_flow_normalized > 0.001) aInjWhileSolid++;
          if (t.porv_open) aPorv++;
          if (t.pressure_mpa < aPmin) aPmin = t.pressure_mpa;
          if (t.pressure_mpa > aPmax) aPmax = t.pressure_mpa;
        });
        ck('the plant really is solid and still being injected into (or leg A proves nothing)',
          aSolid + '/' + aN + ' settled samples solid, injecting on ' + aInjWhileSolid,
          aSolid > 500 && aInjWhileSolid > 500, '> 500 samples of each');
        // POSITIVE, not "pressure was not flat" — the absence-assertion trap. Pre-#346 this
        // reads 2232..2233 psi (15.39..15.40 MPa) across the whole hour of injection.
        ck('pressure RESPONDS to the injection instead of sitting flat',
          fmt((aPmax - aPmin) * 145.038, 0) + ' psi of swing while solid (' +
          fmt(aPmin * 145.038, 0) + '..' + fmt(aPmax * 145.038, 0) + ' psi; pre-#346: 2 psi)',
          (aPmax - aPmin) * 145.038 > 50, '> 50 psi');
        // …and the relief valve is what ends it. Also positive, and stated as a DUTY rather
        // than a sample count: pre-#346 the PORV does not lift once in the settled hour.
        ck('…and it lifts the PORV — relief is what terminates the fill',
          fmt(100 * aPorv / Math.max(aSolid, 1), 1) + ' % relieving duty while solid (pre-#346: 0.0 %)',
          aPorv / Math.max(aSolid, 1) > 0.05, '> 5 % duty');

        // ---- leg B: THE BOUNDARY IS THE GEOMETRY. Solid is where the level line reaches
        // 100 %, so the settling inventory falls out of the same three constants stepLevel
        // uses. Computed, never transcribed.
        var ta = a.ts();
        // `levelBase` is called on the ENGINE'S OWN state rather than re-derived from the
        // true-state snapshot, for two reasons: the thermal-expansion reference `_tavg_fp` is
        // engine-internal and not published, and a second copy of the line here would be a
        // formula that does not move when the engine's does (the #315 lesson, and why
        // `levelRaw` itself has one definition and two consumers).
        var base = RD.pwrPressurizer.levelBase(a.eng.s, RD.PWR_CONFIG);
        var mSolid = 1 + (100 - base) / pz.level_per_mass_surplus;
        ck('inventory settles at the SOLID point the level geometry predicts',
          fmt(ta.core_inventory_pct, 2) + ' % vs ' + fmt(mSolid * 100, 2) + ' % predicted from ' +
          'base ' + fmt(base, 1) + ' % / ' + fmt(pz.level_per_mass_surplus, 0) + ' %/frac',
          Math.abs(ta.core_inventory_pct - mSolid * 100) < 1.0, 'within 1 point');

        // ---- leg C: MASS IS NO LONGER DISCARDED. The clip is a far-away numerical guard
        // again (#330's words for it), and this is the check that says so. Pre-#346 the peak
        // is exactly mass_max × 100 — 120.00 %, to the last digit, which is the fingerprint
        // of a clip rather than of any physical settling point.
        ck('inventory never reaches the mass_max clip — the ceiling is not the physics',
          fmt(aInvMax, 2) + ' % peak vs the ' + fmt(pr.mass_max * 100, 2) + ' % ceiling',
          aInvMax < pr.mass_max * 100 - 1.0, '> 1 point clear of ' + fmt(pr.mass_max * 100, 0) + ' %');

        // ---- leg D: THE CALIBRATION GUARD, and it PASSES ON THE OLD ENGINE deliberately.
        // A normally-bubbled plant must be untouched: the stiff gain applies only where the
        // bubble is gone, so hot full power has to A/B identically. Without this leg, raising
        // the gain everywhere would satisfy legs A–C while wrecking every pressure transient
        // in the suite. (The rest of the battery would catch that; saying it here is what
        // makes the SCOPE of the change an assertion rather than an accident.)
        var d = H('hot_full_power');
        d.run(600);
        var td = d.ts();
        ck('a bubbled plant is untouched — level well off solid at steady power',
          fmt(td.pzr_level_pct, 1) + ' %', td.pzr_level_pct > 45 && td.pzr_level_pct < 65, '45..65 %');
        ck('…and pressure is still on programme there',
          fmt(td.pressure_mpa * 145.038, 0) + ' psi',
          td.pressure_mpa > 15.30 && td.pressure_mpa < 15.55, '2219..2255 psi');

        // ---- leg E: IT IS NOT A RESCUE. Relief terminating the fill must not turn into
        // immunity — defeat the injection and the same event must still destroy the core.
        // Measured identical pre- and post-#346 (damage at 94 min), which is the point: this
        // change moves the OVERFILL path and nothing else.
        var e = H('hot_full_power');
        e.run(60);
        e.cmd('inject_failure', { failure_id: 'loss_of_offsite_power' });
        e.cmd('inject_failure', { failure_id: 'afw_failure' });
        e.cmd('inject_failure', { failure_id: 'degraded_hpi', severity: 1.0 });
        e.run(7200);
        var te = e.ts();
        ck('with ECCS defeated the same event still destroys the core',
          'damaged ' + String(te.fuel_damaged) + ', melted ' + String(te.melted),
          te.fuel_damaged === true, 'damaged');
        T.checkSanity(ck, d);
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
        // THE SETUP IS THE COOLDOWN'S, and until 2026-08-02 it was not: this probe blocked
        // lo_press straight from hot full power and its own label said "P-10 satisfied",
        // which is the wrong permissive — lo_press and si_trip carry their OWN P-11 pressure
        // permissive, not the plant-wide P-10. It passed because the kernel accepted a block
        // outside the permissive at all (#295 F1, fixed). The behaviour under test is
        // unchanged; only the way the plant is brought to it is, and it is now the way the
        // PWR-N15 cooldown does it — Pressure SP down inside P-11 FIRST, then block.
        var h = H('hot_zero_power');
        h.run(30);
        h.cmd('set_pressure_setpoint', { mpa: 13.11 });        // 1901 psi — inside P-11 (1972 psi / 13.6 MPa)
        h.runUntil(function (ts, ins) { return ins.primary_pressure < 13.5; }, 900);
        h.cmd('set_trip_block', { trip_id: 'lo_press', blocked: true });
        ck('lo_press takes the block once inside P-11 (' + fmt(h.ins().primary_pressure, 2) + ' MPa)',
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
        var h2 = H('hot_zero_power');
        h2.run(30);
        h2.cmd('set_pressure_setpoint', { mpa: 13.11 });
        h2.runUntil(function (ts, ins) { return ins.primary_pressure < 13.5; }, 900);
        h2.cmd('set_trip_block', { trip_id: 'lo_press', blocked: true });
        h2.cmd('set_trip_block', { trip_id: 'si_trip', blocked: true });
        h2.cmd('inject_failure', { failure_id: 'stuck_porv_open' });
        h2.cmd('open_porv');
        h2.cmd('close_porv');
        // RE-AUTHORED 2026-08-04 (#337). This ran to `primary_pressure < 12.0` and asserted no
        // scram there. It could only ever get to 12.0 because SI COULD NOT PUSH BACK: injection
        // added mass with no path to pressure, so the depressurization walked straight through
        // its own actuation setpoint. Since #337 mass drives the pressurizer surge in BOTH
        // directions, so unthrottled SI arrests the fall at 12.47 MPa and then takes the plant
        // solid — measured, `pzr_level high` at 57 s with inventory 111.1 % — which is the
        // real behaviour operators throttle SI to avoid, and the mirror image of the TMI lesson.
        //
        // The claim this leg makes is about the BLOCKS, not about how far pressure travels, so
        // it is asserted at the actuation itself: the plant reaches the SI setpoint with both
        // pressure trips still blocked and no reactor trip. That passes on the OLD engine too
        // (which also actuates SI there, unscrammed) — the 12.0 MPa target was the part that
        // depended on the defect, not the assertion.
        var dt2 = h2.runUntil(function (ts) { return !!ts.hpi_active; }, 300);
        ck('with both blocked, pressure reached the SI actuation unscrammed',
          dt2 >= 0 ? fmt(h2.ins().primary_pressure, 2) + ' MPa, rps.scrammed=' + h2.rps().scrammed : 'SI never actuated',
          dt2 >= 0 && h2.rps().scrammed === false, 'SI actuates, no scram');
        ck('…and the blocks HELD through the crossing (neither auto-reinstated)',
          'lo_press=' + h2.rps().trip_blocks.lo_press + ', si_trip=' + h2.rps().trip_blocks.si_trip,
          h2.rps().trip_blocks.lo_press === true && h2.rps().trip_blocks.si_trip === true, 'both true');
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
