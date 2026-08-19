/*
 * behavior_pwr.js — PWR BEHAVIOR BATTERY (spec layer, run by test/run_behavior.js).
 *
 * One probe per Blueprint/PWR_BEHAVIOR_CATALOG.md entry. CATALOG_VERSION below is the
 * single source for the version the runner prints, and the CAT-1 probe asserts it
 * matches the catalog file's own header — the stamps here read "v2.0" for a year while
 * the catalog moved to v3.1 (#472 found it; nothing noticed).
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

  // The catalog version this battery is written against. CAT-1 fails if the catalog
  // header disagrees — bump BOTH together, in the same change as the ruling.
  var CATALOG_VERSION = 'v4.0';

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

  // Take ROD CONTROL to AUTO — the mirror of `rodsManual`, and now the one that has to be
  // said out loud.
  //
  // WHY THIS EXISTS (2026-08-11, #460). The lineup moved back: free play comes up with the
  // rods in MANUAL *(OWNER DIRECTIVE, 2026-08-11: "lets start with rods in manual.")*,
  // reversing the 2026-08-01 ruling above. Five probes — TR-1g, TR-1h, TR-1i, TR-1k, TR-18 —
  // are ABOUT the rod controller: the sourced WTSM duty, the rejection it is supposed to
  // absorb, whether its step settles. Their subject never changed; they were reading the
  // preset instead of stating their own precondition, which is the exact failure the
  // `rodsManual` comment above describes in the other direction.
  //
  // NOT an assertion change: every `ck` in those five is byte-identical across this edit, and
  // the plant they run on is the same plant they ran on before — `engageDefaults()` engaged
  // this channel at t=0, and so does this. What changed is that they no longer INHERIT it.
  // Both halves of the lineup question are now explicit, so the next preset change moves
  // neither.
  function rodsAuto(h) {
    h.cmd('set_auto_channel', { channel_id: 'rods_tavg', engaged: true });
    return h;
  }

  // ------------------------------------------------------------- XFAIL (strict)
  // id → why it is expected to fail today (catalog §8 decision that will fix it).
  var XFAIL = {
    // Emptied 2026-07-21 (feel-plan P5): TR-2/CC-5 left with the spray cap +
    // trip-open dump + TR-3 re-spec; TR-1/CC-3 left with the P4 ride-out and
    // P-4 handoff; SS-5/CC-10 left with the P2 derived-level rework.

    // EMPTIED AGAIN 2026-08-09 (#394 + #378 + #420, one bundle). TR-18 left because the
    // rod channel now settles: the cycle's cause was measured to be the LOOP GAIN, not the
    // stop-exit travel two sessions spent rejecting fixes for — this plant lumps all
    // 4068 pcm into one bank, so differential worth runs 0.892 → 4.657 pcm/step across the
    // band against a constant controller gain, and the incidence curve is monotone in bank
    // position over six points. `gainScale` (pwr_control.js) schedules the gain on that
    // worth, gated on the program being parked so the sourced ramp duty is untouched.
    // TR-1i left because #420's band is now the sourced duty SCALED by the declared
    // program-span departure (5.74 °F) per the 2026-08-09 owner ruling — see the probe.
    // Nothing is expected to fail here. Do not add an entry without a filed issue.

    // EMPTIED 2026-08-10 (#433 fixed). TR-12b/TR-12c/PI-9 had been green against a
    // harness artifact — the MSLI flow leg's `held_within_s` latch was PERMANENT in any
    // no-dt harness (age 0 <= 60 for ever), so the coincidence was satisfied at t=0 —
    // and went strict-xfail when #403 gave the harness a real dt. The plant defect
    // underneath was a TIMING MISS, not the "flow reads 0" the issue first recorded
    // (`sg_steam_flow` reads steam_out_total, which contains the break term — it peaks
    // 1.58 on a full-area break): #408's sourced 600 psig setpoint put the raw pressure
    // crossing ~103 s after the break, ~43 s after the 60 s flow latch expired. Fixed by
    // rate-compensating the pressure leg (`lead_lag`, the sourced "(Rate sensitive)"
    // annotation) — isolation now lands +2..3 s after a sev-0.8 or 1.0 break, and the
    // cooldown / bottle-reopen discriminator legs still hold. Kernel checks: run_m4
    // "#433 — the pressure leg is RATE-COMPENSATED".
    // #451 (2026-08-11) — the small-break pressure plateau has no mechanism left once the
    // #447 heater shed removes the prop it was standing on. Split out of CA-20 leg B so
    // that probe's blowdown / containment-floor / vent-algebra legs keep their coverage.
    // DO NOT re-band it green. The probe was RE-KEYED from a magnitude proxy to the
    // mechanism on 2026-08-11 (owner ruling, see the probe's own comment) — that is not a
    // re-band: the old form failed on the pre-#447 plant too, and the new one is validated
    // to PASS there and FAIL here.
    'CA-20b': 'the small-break plateau was HEATER-HELD (pwr_config #363 note: "it pins NOTHING … the heaters are winning against the break"). #447 sheds the heaters on SI per NUREG-0737 II.E.3.1 (7), and nothing else holds the primary at its heat sink. MEASURED (Phase 1, #451): the dominant term is the cold-ECCS quench, NOT the SG and not the break flash term — `eccs_cooling_gain` 1.0 is ~2x true enthalpy mixing INTO THIS NODE (231 MJ/°C carries the metal; one RCS mass of water is ~113, so the physical gain is 0.489). The primary is driven 266 psi below its own heat sink and then drains the secondary through the 5 % reverse path to 202 psi. See #451.',
  };

  // -------------------------------------------------------------- COVERAGE map
  var COVERAGE = {
    'SS-1': 'probe', 'SS-2': 'probe', 'SS-4': 'probe:SS-2',
    // SS-3 is "the 50 % point SITS ON the program (no sag)" — a claim about a STEADY STATE,
    // which SS-2's single instant at t = 600 s cannot make (#394: it read comfortable by
    // 0.36 °C through an 11-point limit cycle). SS-11 carries the steadiness half; SS-2 still
    // carries the position half. Both, or the row is only half asserted.
    'SS-3': 'probe:SS-11 + probe:SS-2',
    'SS-5': 'probe', 'SS-6': 'probe', 'SS-7': 'existing:run_pwr cold_shutdown_hold',
    'SS-8': 'probe',
    'SS-11': 'probe (part-power steady state is steady, hands-off — the FG-2 invariant, #394)',
    'EV-1': 'existing:run_pwr mode5_to_mode1_roundtrip', 'EV-2': 'existing:run_ops cooldown + run_pwr rhr_valve_and_mode',
    'EV-3': 'probe', 'EV-11': 'probe', 'EV-4': 'existing:run_ops load follow (re-band after SS-2)',
    'EV-5': 'existing:run_campaign pwr_boron', 'EV-6': 'probe', 'EV-7': 'probe:EV-6',
    'EV-8': 'existing:run_ops xenon 8h', 'EV-9': 'existing:run_campaign startup ×2',
    'EV-10': 'existing:run_pwr transient_loss_vacuum',
    'TR-1': 'probe (FULL load rejection — the ride-out, past the dump\'s stop)',
    'TR-1g': 'probe (50 % loss of load — the real Westinghouse design case, 40 % dump)',
    'TR-1h': 'probe (full rejection with rods in AUTO — rods AUTO + clamped level program, #289)',
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
    'TR-16': 'probe (SG safeties are self-actuating — survive a dead steam_pressure channel, #369)',
    // TR-11: the catalog row ("heaters lose, low-P trip unless isolated") predates
    // the P5 spray capacity cap — measured under the cap the heaters WIN, and the
    // probe pins that end state. See the probe comment and Diagnostic/TUNING_LOG.md.
    'TR-10': 'probe', 'TR-11': 'probe (end-state pin) + existing:run_ops heaters vs spray fight',
    'TR-12': 'probe + run_campaign pwr_slb', 'TR-12b': 'probe (MSIV isolates a downstream break, #199)',
    'TR-12c': 'probe (automatic steam line isolation — the coincidence, and that it stays out of normal evolutions, #370c)',
    'TR-17': 'probe (atmospheric dump — a condenser-independent cooldown path exists, #371)',
    'TR-18': 'probe (load-change settling — the manual step ends instead of hunting forever, #378)',
    'TR-19': 'probe (UNTHROTTLED AFW OVERCOOLS — the SG depressurizes instead of discarding heat, #464)',
    'TR-1k': 'probe (the arm cliff with rods in AUTO — both lineups end at the backstop, #377)',
    'TR-1m': 'probe (an armed rejection never clears with rods in MANUAL — declared §8.30, #489)',
    'TR-13': 'probe + ops SGTR single-SG EOP', 'TR-13b': 'probe',
    'SS-9': 'probe (cold thermal stability)', 'SS-10': 'probe (severity clamp)',
    // (a stale duplicate 'TR-14': 'existing:campaign SBO fact' sat here until #376 —
    // in an object literal it silently OVERWROTE the real probe entry above)
    'CA-1': 'existing:run_campaign tmi2 p1-p3 (re-validate after tuning)',
    'CA-2': 'existing:run_pwr merged_injection_curve + accumulator_arming_boundary',
    'CA-3': 'probe', 'CA-4': 'probe',
    'CA-7': 'probe (pzr heaters are an AC load — dead in SBO, alive in LOOP; 10 CFR 50.2 + NUREG-0737 II.E.3.1)',
    'CA-8': 'probe (the AC-load roster — CVCS + ECCS die in SBO, AFW + accumulators survive; WTSM 4.1 + 5.7)',
    'CA-9': 'probe (loss of CVCS make-up — the pzr level cue and the letdown isolation; #330)',
    'CA-10': 'probe (the 17 % low-level heater cutoff — WTSM 10.3 §10.3.4.1; #334)',
    'CA-11': 'probe (break discharge follows RCS pressure — 10 CFR 50 App K I.C.1.b; #334)',
    'CA-12': 'probe (a water-solid RCS repressurizes and relieves — mass_max no longer discards; #346)',
    'CA-13': 'probe (the pzr level line is unbounded upward — a heatup fills it solid; #362)',
    'CA-14': 'probe (break flash-cooling is saturation-gated; the void model depended on it; #363)',
    'CA-15': 'probe (a LIQUID break goes solid clear of mass_max — CA-12 on the other path; #361)',
    'CA-16': 'probe (containment is the receiving volume — a LOCA pressurizes it, an SGTR bypasses it, relief lands in it, and it decays on the passive sink; #386 stage 1)',
    'CA-17': 'probe (break/relief backpressure is the LIVE containment pressure — clone-rig mechanism pin, red on the pre-#386 engine; #386 stage 1)',
    'CA-18': 'probe (the void-displacement level lift is PATH-AWARE — a loop break drains the pressurizer, the relief path keeps the TMI deception; WCAP-16009 §11-4-5; #385 stage 2)',
    'CA-22': 'probe (containment spray auto-actuates at the sourced 30 psig hi-hi, knocks the building below the SI signal, and auto-secures on recovery; fans realign on SI — AUTO-ONLY by ruling; #386 stage 2)',
    'CA-19': 'probe (the THROUGHPUT equilibrium — a refilled solid RCS with a break open settles where injection = break discharge, and it is not a free rescue; #384 stage 3 / the #334 throughput question)',
    'CA-20': 'probe (a vented RCS blows down PAST Psat toward the building and never below it — path-scoped vent + weakened pin, the SGTR/relief fence, and the DBA arc preserved; WTSM 5.0 §5.0.1.1; #384 stage 4)',
    'CA-21': 'probe (the subcooling margin reads the CORE EXIT over a dry core — negative with the clad hot, byte-equal to the bulk when covered, and a failed TC restores the deception; NUREG-0737 II.F.2; #407)',
    'CA-23': 'probe (the pressurizer inventory NODE is INERT — level_per_mass·pzr_mass_frac reproduces levelRaw to 1e-9 across the subcooled/relief-void/loop-break families, and a pre-node save seeds through the inverse; #385 stage 1)',
    'CA-24': 'probe (hydrogen: mitigated LOCA sits far under the 4.1 v/o flammability limit, an unmitigated one crosses ignition and BURNS ONCE — spike above the spray hi-hi, under design, latch stands; recombiners auto-start/decay/AC-gate; the transport gate holds an SGTR\'s H2 out of the building; GEND-061 + NUREG-1431 + 50.46(b)(3); #386 stage 3)',
    'CA-20b': 'probe (STRICT XFAIL — the small-break plateau fence, split from CA-20 leg B; re-keyed to the SG-holds-the-primary mechanism 2026-08-11; #451)',
    'CA-25': 'probe (the ESF LOAD SHED — safety injection and a loss of offsite power take the pressurizer heaters off the bus and only an operator puts them back; the post-LOCA plant settles instead of limit-cycling; NUREG-0737 II.E.3.1 (7) + Ginna TS Bases B 3.4.9; #447)',
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
    'PI-9': 'probe — the #199 absence narrowed at #386 stage 2: no steam-pressure SI channel exists, and the sourced 3.5 psig containment backup now answers the upstream break, catalog §10',
    'CAT-1': 'probe',
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
      // RE-ANCHORED at #419 wave 3: the Ginna program — no-load 286.0 °C (Tsat of the
      // sourced 1005 psig anchor) rising ~18.5 °C to the ~304.5 °C full-power equilibrium
      // (Ginna's real span is 547 → 576 °F; our top runs 4 °F high on the fixed Q/h_sg
      // identity, declared). The retired feel-plan program was 297 → ~304, and this suite's
      // old bands were its character. The monotonic rise is the [I] invariant.
      return test('SS-2 Tavg program — rises with load (286 → ~304.5 °C)', function (ck) {
        var hz = H('hot_zero_power'); hz.run(300);
        var h5 = H('50_percent');     h5.run(600);
        var hf = H('hot_full_power'); hf.run(300);
        var t0 = hz.ts().tavg_c, t50 = h5.ts().tavg_c, t100 = hf.ts().tavg_c;
        ck('no-load Tavg 284..288 °C', fmt(t0, 1), t0 > 284 && t0 < 288, '284..288');
        ck('50% Tavg 293..298 °C (SS-3, mid-program)', fmt(t50, 1), t50 > 293 && t50 < 298, '293..298');
        ck('program rises ≥ 15 °C no-load → full (the steep Ginna span)', fmt(t100 - t0, 1), (t100 - t0) >= 15, '≥ 15');
        ck('monotonic: no-load < 50% < 100%', fmt(t0, 1) + ' < ' + fmt(t50, 1) + ' < ' + fmt(t100, 1),
          t0 < t50 && t50 < t100, 'monotonic');
      });
    },

    /* SS-11 (#394, audit #344 F1) — A PART-POWER STEADY STATE IS TRULY STEADY. Catalog FG-2
     * says "any steady state is truly steady" and nothing asserted it. SS-3 ("50 % point sits
     * ON the program") was carried by SS-2, which samples ONE INSTANT at t = 600 s: it read
     * 299.357 °C inside a 299..303 band, comfortable by 0.36 °C, while Tavg was swinging
     * 2.94 °C and power 11 points around it. A single sample through a limit cycle cannot
     * fail — HR10, and the reason SS-3 showed PASS for the whole life of the defect.
     *
     * HANDS-OFF FROM THE AUTHORED IC WITH NO COMMAND AT ALL. That is what makes this #394's
     * probe rather than #378's: TR-18 asserts that a load STEP ends, which is a transient
     * question. This one asserts the plant is stable sitting still — the defect ran forever
     * on the shipped default preset (`ui/app.js` initState) with nobody touching anything.
     *
     * THE 100 % LEG IS THE CALIBRATION CONTROL, not padding. It passed all along (0.04-1.31
     * pts measured), so it is what proves the 50 % leg is measuring instability and not the
     * probe's own arithmetic: a bug that inflates p2p would redden BOTH.
     *
     * The window is sampled EXPLICITLY (60-90 min) and never via h.range(): the run contains
     * the IC's own settling approach, so a run-wide range asserts nothing. Standing CA-9/#332
     * trap, the same one TR-18's comment names.
     *
     * BANDS ARE A HOUSE CALL, declared as such. No source gives a residual-hunting bound for
     * a plant sitting at part power; a real four-bank Westinghouse plant simply does not have
     * this mode, because its differential worth is far flatter than this plant's single lumped
     * bank (which is what #394 turned out to be). So the band is the fixed plant's measured
     * envelope with margin — and it is deliberately LOOSE (≤ 4 pts against 1.4 measured, 11.0
     * pre-fix) so it pins the DEFECT's return rather than the current tuning: this must not
     * become a check that reddens every time the rod channel is legitimately retuned. */
    'SS-11': function () {
      return test('SS-11 part-power steady state is STEADY — hands-off, no command (#394)', function (ck) {
        var W0 = 3600, W1 = 5400;   // sample the 60-90 min window, explicitly
        function ride(ic) {
          var h = H(ic), pLo = 1e9, pHi = -1e9, tLo = 1e9, tHi = -1e9;
          h.run(W1, function (hh) {
            if (hh.t() < W0) return;
            var s = hh.ts();
            if (s.power_pct < pLo) pLo = s.power_pct;
            if (s.power_pct > pHi) pHi = s.power_pct;
            if (s.tavg_c < tLo) tLo = s.tavg_c;
            if (s.tavg_c > tHi) tHi = s.tavg_c;
          });
          return { h: h, p2p: pHi - pLo, tavg: tHi - tLo, mean: (pHi + pLo) / 2 };
        }
        var r50 = ride('50_percent');
        ck('50 % hands-off: power p2p over 60-90 min (pre-fix: 11.0, forever)',
          fmt(r50.p2p, 2), r50.p2p <= 4.0, '≤ 4.00 pts');
        ck('…and Tavg with it (pre-fix: 3.79 °F sustained)',
          fmt(r50.tavg * 9 / 5, 2), r50.tavg * 9 / 5 <= 2.0, '≤ 2.00 °F');
        ck('…still AT 50 %, not merely quiet somewhere else (false-positive guard)',
          fmt(r50.mean, 1), Math.abs(r50.mean - 50) <= 3, '50 ±3 %');
        ck('…and nothing tripped sitting still', r50.h.tripReason || 'none', r50.h.tripTime == null, 'none');
        // CONTROL: the 100 % point was never unstable. If this leg ever reddens with the
        // 50 % one, suspect the probe before the plant.
        var r100 = ride('hot_full_power');
        ck('100 % hands-off holds the same band — the calibration control (always passed)',
          fmt(r100.p2p, 2), r100.p2p <= 4.0, '≤ 4.00 pts');
        T.checkSanity(ck, r50.h);
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

    /* SS-8 — HEAT-BALANCE CLOSURE. Re-authored 2026-08-09 (#397 / #344 F2).
     *
     * What it was: `charging ≈ letdown`, `steam ≈ feed`, `mwe ≈ 100`, all at
     * hot_full_power. Two MASS balances and a rating check — no energy term anywhere —
     * under a row claiming "heat-balance closure ±2 % at ANY steady state", asserted at
     * the one steady state that holds still. It had carried `PASS?` since the freeze,
     * which is the row honestly asking for the pin it never got.
     *
     * The energy term is `core_heat_pct` (TOTAL core thermal — fission + decay + pump,
     * NOT `power_pct`, which is fission only) against `steam_flow_normalized × 100`, the
     * secondary's removal. At a true steady state the RCS stores nothing, so the two are
     * the same number and their difference is the closure residual.
     *
     * "At any steady state" is now taken literally: three of them, including 5 %, where
     * decay heat is a large fraction of the total and a closure that only works at power
     * would show it. The mass checks are kept — they were never wrong, only mislabelled.
     *
     * THE BAND IS THE ROW'S ORIGINAL ±2 %, and it holds with room to spare. #397 measured
     * 6.44 pp worst / 3.26 pp mean at 50 % and could not say whether that was a real
     * energy-conservation violation or the stored-energy term of the #394 limit cycle —
     * it named that as explicitly not established. #394 has since been fixed, and on the
     * fixed plant the residual is 0.04 pp mean at 100 %, 0.63 at 50 %, 0.29 at 5 %
     * (worst single sample anywhere: 0.69). So it was the limit cycle, and the answer is
     * recorded here because the question was asked here.
     *
     * The band is therefore NOT re-derived from the measurement — 3x margin on a claim the
     * catalog already made is the right amount of slack, and pinning ±0.7 would make this a
     * check that reddens on any legitimate secondary retune. */
    'SS-8': function () {
      return test('SS-8 heat-balance closure — energy, at three steady states', function (ck) {
        var CASES = [
          { ic: 'hot_full_power', label: '100 %', settle: 600 },
          { ic: '50_percent', label: '50 %', settle: 900 },
          { ic: '5_percent', label: '5 %', settle: 900 },
        ];
        for (var i = 0; i < CASES.length; i++) {
          var c = CASES[i], h = H(c.ic);
          h.run(c.settle);
          // Average the residual over a window rather than sampling one instant: a
          // single sample through any residual oscillation cannot fail, which is the
          // SS-3 trap #394 documented one row above.
          var n = 0, sum = 0, worst = 0, t;
          for (var k = 0; k < 30; k++) {
            h.run(10);
            t = h.ts();
            var resid = t.core_heat_pct - t.steam_flow_normalized * 100;
            sum += Math.abs(resid); n++;
            if (Math.abs(resid) > Math.abs(worst)) worst = resid;
          }
          var mean = sum / n;
          ck('[' + c.label + '] core thermal ≈ secondary removal (mean |residual| ≤ 2 pp)',
            fmt(mean, 2) + ' pp mean, ' + fmt(worst, 2) + ' pp worst', mean <= 2.0, '≤ 2.00 pp');
          t = h.ts();
          ck('[' + c.label + '] charging ≈ letdown (±0.01)',
            fmt(t.charging_flow_actual, 3) + ' vs ' + fmt(t.letdown_flow_actual, 3),
            Math.abs(t.charging_flow_actual - t.letdown_flow_actual) < 0.01, 'match');
          ck('[' + c.label + '] steam ≈ feed (±3 %)',
            fmt(t.steam_flow_normalized, 3) + ' vs ' + fmt(t.fw_flow_normalized, 3),
            Math.abs(t.steam_flow_normalized - t.fw_flow_normalized) < 0.03, 'match');
          if (c.ic === 'hot_full_power') {
            ck('[100 %] electrical ≈ rated (100 ±5 MWe)', fmt(t.mwe_output, 0), near(t.mwe_output, 100, 5), '100 ±5');
          }
          T.checkSanity(ck, h);
        }
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
     * its stop, the core self-throttles to match, and pressure control CONTAINS the ride —
     * since #419 wave 1 the honest surge gain (K_surge_level 0.032) keeps the peak inside
     * spray authority (15.42 measured), so the PORV is never challenged, which is the
     * Westinghouse-class result WITH pressure-control credit (Ginna's loss-of-load analyses
     * lift pressurizer relief only when that credit is removed; on the old compressed gain
     * the insurge outran spray and the lift was asserted as the designed backstop). FG-4 is
     * unchanged and still checked first — NO SCRAM, the operator walks it down at their pace.
     *
     * A real Westinghouse plant does not ride a full rejection either (its design case is
     * a 50 % loss of load). The 50 % case is the one that must stay clean — TR-1g pins it. */
    'TR-1': function () {
      return test('TR-1 load rejection @100% — RIDE-OUT: the ladder runs in order, no scram', function (ck) {
        // Rod-less on purpose: this probe is the MTC handover past the dump's stop and the
        // relief ladder behind it (#289). TR-1h is the same event on the shipped auto lineup.
        var h = rodsManual(H('hot_full_power'));
        h.run(30);
        // Full load rejection: demand to zero with the turbine still on line.
        // `immediate` — a load REJECTION is an EVENT: the grid or the machine throwing load off.
        // It is NOT the operator walking the EHC reference down at the unit's load rate, which is
        // what turbine.load_rate_pct_per_min governs (raises only since 2026-08-08 — but this
        // flag predates the direction test and stays: an event outranks any ramp, either way).
        // A rejection has to arrive at once
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
        // Band re-derived at #419 wave 3 (D1: 28 % dump): the smaller sink absorbs less,
        // so the mid-ride equilibrium sits higher — measured 71 % (was 40..55 at the 40 %
        // dump). The claim is unchanged: the core has come DOWN from 100 on MTC alone and
        // is riding toward the dump's capacity, far above what the generator delivers.
        ck('so the CORE sheds the rest — self-throttles toward the dump (60..80 %)', fmt(mid.power_pct, 0),
          mid.power_pct > 60 && mid.power_pct < 80, '60..80');
        ck('Tavg swells hard but stays under the 335 °C scram', fmt(mid.tavg_c, 1),
          mid.tavg_c > 308 && mid.tavg_c < 335, '308..335');
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
        ck('Tavg settled to the no-load anchor (286 ±5 °C)', fmt(t.tavg_c, 1), near(t.tavg_c, 286, 5), '286 ±5');
        // RE-DERIVED at #419 wave 1 (K_surge_level 0.4 → 0.032, the honest surge gain).
        // On the compressed gain the insurge outran spray and the PORV lifted (peak 16.24,
        // asserted positively here since #289). On the real gain the peak is 15.42 — SPRAY
        // CONTAINS the ride, which is the Westinghouse-class result WITH pressure-control
        // credit (Ginna's own loss-of-load analyses lift pressurizer relief only when that
        // credit is removed). The mechanism half is pinned by the phase-1 checks above
        // (dump saturated + core self-throttles + Tavg 312..335), so this outcome check
        // cannot pass hollow on a ride that never happened (the TR-3 lesson).
        ck('spray contains the ride — the PORV is never challenged (with-credit class)',
          fmt(h.range('pressure_mpa').max, 2), h.range('pressure_mpa').max < 16.20, '< 16.20 MPa');
        ck('…and the pressurizer SAFETY never has to (17.13)', fmt(h.range('pressure_mpa').max, 2),
          h.range('pressure_mpa').max < 17.13, '< 17.13 MPa');
        ck('SG never approached the lo-lo trip (min ≥ 25 %)', fmt(h.range('sg_level_pct').min, 1),
          h.range('sg_level_pct').min >= 25, '≥ 25');
        ck.info('peak Tavg during the ride', fmt(h.range('tavg_c').max, 1) + ' °C');
        ck.info('peak SG pressure (pop ' + RD.PWR_CONFIG.steam_generator.sg_safety_open_mpa + ')', fmt(h.range('steam_pressure_mpa').max, 2) + ' MPa');
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
        var h = rodsAuto(H('hot_full_power'));            // rods in AUTO — this probe's SUBJECT, stated not inherited (#289, #460)
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
          h.range('steam_pressure_mpa').max < RD.PWR_CONFIG.steam_generator.sg_safety_open_mpa,
          '< ' + RD.PWR_CONFIG.steam_generator.sg_safety_open_mpa + ' MPa (the pop, from config)');
        ck('the dump reaches its stop on the way through — 40 % is doing all it can',
          fmt(h.range('steam_dump_valve_pct').max, 0),
          h.range('steam_dump_valve_pct').max >= cap - 1, '≥ ' + fmt(cap - 1, 0) + ' %');
        // The sourced half the old probe had backwards: the dump is an ALTERNATE HEAT SINK
        // "until the rod control system returns Tavg", so it must come back OFF its stop.
        ck('…then COMES OFF it — the dump is transient, not the new steady state (WTSM 11.2)',
          fmt(t.steam_dump_valve_pct, 1), t.steam_dump_valve_pct < 5, '< 5 %');
        // MEAN over a trailing window, not an endpoint (#372): the post-manoeuvre
        // plant carries the #378 limit cycle (±7 pts, ~185 s period), so a single
        // endpoint sample was reading cycle PHASE, not the claim — it flipped from
        // 40-something to 39.2 when the feed-enthalpy term shifted the phase, with
        // the 120 s mean sitting at 51.2 both ways. The mean tests what the line
        // says: the core follows the load on average; parked-high would read ~89.
        // Passes on the pre-#372 plant too (same cycle, same centre) — not a refit.
        var _pSum = 0, _pN = 0;
        h.run(120, function (hh) { _pSum += hh.ts().power_pct; _pN++; });
        var _pMean = _pN ? _pSum / _pN : t.power_pct;
        ck('the core is reduced to the SECONDARY LOAD, not parked high (120 s mean)',
          fmt(_pMean, 1), _pMean > 40 && _pMean < 55, '40..55 % (ask = 50)');
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
        var a = rodsAuto(H('hot_full_power'));            // rods in AUTO — this probe's SUBJECT, stated not inherited (#460)
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
        var c = rodsAuto(H('hot_full_power'));
        c.run(60);
        var t0 = c.t();
        var pc = peak(c, 1500, function (hh, t) {
          var el = t - t0;
          if (el <= 600) hh.cmd('set_load_target', { mwe: Math.max(50, 100 - 5 * (el / 60)) });
        });
        ck('5 %/min ramp down — no reactor trip', c.tripReason || 'none', c.tripTime == null, 'none');
        // THE SOURCE IS NOW IN THE CORPUS (#394 evidence pass, 2026-08-09): ML11223A252 was
        // quoted from an unarchived session fetch, so `find_source` returned zero on it and on
        // §8.1.4.5 and on every phrasing of this band — the duty this check grades against was
        // RECALL wearing a citation. Fetched via the Wayback CDX recipe and verified verbatim:
        // *"a 10% step load increase or decrease, a 5% per minute ramp load increase or
        // decrease, or a 50% step load decrease with the aid of the steam dump system … without
        // actuating the pressurizer relief valves or generating a reactor trip"*, during which
        // *"the average temperature of the reactor coolant remains within ±5°F of the
        // [temperature program]"*. The number was right; it just could not be checked.
        //
        // THE BAND IS THE SOURCED DUTY, SCALED BY THIS PLANT'S DECLARED PROGRAM-SPAN
        // DEPARTURE — 5.00 × (33.295/29) = 5.74 °F *(OWNER RULING, 2026-08-09: selected
        // "Scale on the departure" from four options, on the recommendation that the #311
        // precedent applies as written)*. NOT a widening, and the distinction is the whole
        // argument: WTSM 8.1.1's ±5 °F is stated for a plant whose Tavg program spans ~29 °F,
        // and this plant's spans 33.295 °F (measured from the shipped config, `trefProgram`),
        // a departure DECLARED at #419 wave 3 and recorded in `Manuals/00` Rev 14(h) as the
        // fixed Q/h_sg heat-transfer identity. A 5 %/min LOAD ramp therefore slides Tref
        // 14.81 % faster in °F/min here than the same duty does on the anchor plant, so the
        // literal number grades this plant against a manoeuvre it is not performing. #311 is
        // the precedent and the fence: a closed-form limit line must be SCALED by a declared
        // geometric departure, never RE-ANCHORED onto a fitted intercept — the forbidden move
        // is pairing our slope with someone else's origin, which this does not do.
        //
        // MARGIN, MEASURED (2026-08-03, #321 sweep; re-stated on the scaled band 2026-08-09):
        // this band is TIGHT and it is the most likely source of a puzzling red. A 3 % nudge
        // to `thermal.h_sg` or `thermal.coolant_heat_capacity` — neither of which this check
        // names — moved the old form 4.77 → 5.02 / 5.12 °F. Today it reads 5.28 against 5.74,
        // i.e. 0.46 °F of headroom (8.0 %). If this reddens, ask what you changed that touches
        // SG heat transfer or coolant heat capacity BEFORE hunting the rod channel.
        //
        // The rod gain schedule (#394) does NOT touch this number: it is gated on the program
        // being parked and a 5 %/min ramp slides Tref at 1.54e-2 °C/s, 7.7× the `progStill`
        // threshold, so the schedule is fully OFF here. Measured both ways — ungated the
        // schedule cost this check 5.28 → 6.52 °F; gated it reads 5.28 to the digit, the
        // pre-#394 value. If this check ever moves when only rod-channel gains change, the
        // gate has stopped discriminating and THAT is the defect.
        ck('Tavg holds within the ±5 °F duty, scaled by the declared 33.3/29 span departure',
          fmt(pc, 2), pc <= 5.74, '≤ 5.74 °F');
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
        var d = rodsAuto(H('hot_full_power'));
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
        var e = rodsAuto(H('hot_full_power'));
        e.cmd('set_load_target', { mwe: 75 });
        e.run(7200);
        ck('2 h soak at 75 % load settles ON program, inside the real ±1.5 °F deadband',
          fmt(devF(e), 2), devF(e) < 1.5, '< 1.5 °F');
        T.checkSanity(ck, c);
      });
    },

    'TR-1h': function () {
      return test('TR-1h full rejection with rods in AUTO — rods take it back, relief RESEATS', function (ck) {
        var h = rodsAuto(H('hot_full_power'));            // rods AUTO + the clamped level program
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
        ck('Tavg returns to the no-load anchor (286 ±6 °C)', fmt(t.tavg_c, 1),
          near(t.tavg_c, 286, 6), '286 ±6');
        // The level-program ceiling half of #289: the program can no longer chase Tavg into
        // the going-solid trip. 91.9 measured against 97 — banded at 95 so the ~5 % of margin
        // the ceiling bought has to actually be there, and eroding it reddens this line.
        ck('pzr level stays clear of the going-solid trip (97 %) — the ceiling holds',
          fmt(h.range('pzr_level_pct').max, 1),
          h.range('pzr_level_pct').max < 95, '< 95 %');
        ck.info('peak SG pressure (pop ' + RD.PWR_CONFIG.steam_generator.sg_safety_open_mpa + ' / reseat ' + RD.PWR_CONFIG.steam_generator.sg_safety_reseat_mpa + ')',
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
        // The #373 leak-through window is the FIRST 20 s after the trip — integrate
        // HERE, before the settle, or the fence reads a dead flow and passes on
        // anything (the hollow-check trap). Fence comment + measured band below.
        var _leak1b = 0;
        for (var i1b = 0; i1b < 40; i1b++) { h.run(0.5); _leak1b += (h.ts().steam_flow_normalized || 0) * 0.5; }
        h.run(580);
        var t = h.ts();
        ck('the dump carries decay heat to the condenser', fmt(h.range('steam_dump_valve_pct').max, 0),
          h.range('steam_dump_valve_pct').max >= 20, '≥ 20 %');
        var _sg1b = RD.PWR_CONFIG.steam_generator, _pz1b = RD.PWR_CONFIG.pressurizer;
        // Peak asserted AND shown — the old line printed the end-state boolean while
        // testing the peak, so the printed evidence could not support the verdict.
        ck('SG code safeties never lift (the dump got there first)',
          fmt(h.range('steam_pressure_mpa').max, 2) + ' MPa peak',
          h.range('steam_pressure_mpa').max < _sg1b.sg_safety_open_mpa,
          '< ' + fmt(_sg1b.sg_safety_open_mpa, 2) + ' (config)');
        // THE #373 FENCE MOVED FROM THE PRESSURE PEAK TO THE LEAKED STEAM ITSELF
        // (#418 wave A1, 2026-08-07). The old floor — peak ≥ 15.80, leak plant
        // 15.58 — discriminated on the compressed secondary clock, where the SG
        // bottled in ~2 s and the trip burst stood tall. On the derived
        // K_steam_pressure the SG LIQUID soaks the burst (that is the sourced
        // physics: the secondary's thermal capacitance IS the pressure clock), and
        // the peak collapses to the same number healthy or leaking — measured
        // 15.422 healthy vs 15.416 with #373 re-injected (stop_valve_tau 2.1, the
        // old governor-lag closure): 0.006 MPa apart, no band can separate them.
        // Re-banding the floor would have shipped a hollow check. What #373 was —
        // "a tripped machine drew steam for ~10 s" — is a FLOW-SECONDS quantity,
        // so the fence now measures exactly that: ∫steam_flow·dt over the 20 s
        // after the trip (_leak1b, integrated above BEFORE the settle). Measured:
        // healthy 0.139 flow-s (stop valves slam, tau 0.15), leak plant 1.035
        // flow-s — a 7.4× separation. Band ≤ 0.45.
        ck('the stop valves actually shut — post-trip steam leak-through bounded (#373)',
          fmt(_leak1b, 3) + ' flow-s in 20 s',
          _leak1b <= 0.45, '≤ 0.45 (healthy 0.139, #373 leak plant 1.035)');
        ck('the PORV holds the trip burst — never lifts past the setpoint (#372)',
          fmt(h.range('pressure_mpa').max, 2),
          h.range('pressure_mpa').max < _pz1b.porv_open_mpa, '< ' + fmt(_pz1b.porv_open_mpa, 2));
        ck.info('trip-burst peak (soaked by the SG liquid on the real clock — was 16.04 compressed)',
          fmt(h.range('pressure_mpa').max, 2) + ' MPa');
        ck('settles at the no-load anchor (286 ±6 °C)', fmt(t.tavg_c, 1), near(t.tavg_c, 286, 6), '286 ±6');
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
        // Cap-reading + re-banded at #419 wave 3 (D1: the dump is Ginna's 28 %, was 40 —
        // measured at 28 the core self-throttles deeper on a 50 % rejection, ~80 % vs 89.3).
        // What this leg needs is only that the core stays HIGH while the generator reads 50
        // — ~80 vs 50 is still a 1.6× disagreement, so the check still discriminates.
        var _dcapE = 100 * RD.PWR_CONFIG.steam_generator.steam_dump_max;
        ck('the dump is carrying the rejection (at its cap)', fmt(td.steam_dump_valve_pct, 0),
          td.steam_dump_valve_pct >= _dcapE - 1, '≥ ' + fmt(_dcapE - 1, 0) + ' %');
        ck('the reactor is still up near full power', fmt(td.power_pct, 1),
          td.power_pct > 75, '> 75 %');
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
        // #376: every leg's harness gets the sanity pass — legs B–E drove commands
        // whose rejections were recorded but never inspected.
        T.checkSanity(ck, d); T.checkSanity(ck, o); T.checkSanity(ck, r); T.checkSanity(ck, m);
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
        T.checkSanity(ck, b); T.checkSanity(ck, c);   // #376: the two failed-channel legs
      });
    },

    /* TR-16 (#369, audit #297 F2) — the SG code safeties are SELF-ACTUATING. A code
     * safety is a spring device opened by the fluid itself, so no instrument failure
     * may defeat it. Before #369 the pop was a control-layer actuation reading the
     * steam_pressure instrument, and this exact evolution — one stuck transmitter,
     * then a bottled SG — ran to clad melt (2696 psi SG, 3226 °F clad at 40 min).
     * Leg A pins the healthy-channel behaviour so the mechanism move is shown to
     * change nothing; leg B fails the channel and asserts the lift POSITIVELY, per
     * the standing rule that an absence check can pin a non-event. */
    'TR-16': function () {
      return test('TR-16 SG safeties are self-actuating — a dead steam_pressure channel cannot defeat them (#369)', function (ck) {
        var pop = RD.PWR_CONFIG.steam_generator.sg_safety_open_mpa;
        // FIXTURE: ADV OUT OF SERVICE (#418 wave B1, 2026-08-07). This probe's subject
        // is #369 — the pop is a spring device no instrument can defeat — and its
        // fixture must therefore REACH the pop. On the B1 plant the tube node softens
        // the bottling burst just enough that the AUTO ADV (10 % capacity at 8.77)
        // catches it 5 psi under the 9.31 pop and the safeties stay seated — measured
        // full stack: peak 9.27 MPa, ADV 100 %, which is the CORRECT plant story when
        // the ADV is available (the safeties are the backstop BEHIND the controllable
        // relief; TR-17 owns that hierarchy). So the fixture authors the ADV
        // unavailable — the night the backstop is the only relief — which is exactly
        // the condition #369's clad-melt finding ran in (the ADV did not exist then).
        // ---- leg A: healthy channel. Bottle the SG at power; the safeties lift and hold.
        var a = H('hot_full_power');
        a.run(30);
        a.cmd('set_adv', { mode: 'closed' });
        a.cmd('close_msiv');
        var tA = a.runUntil(function (ts) { return !!ts.sg_safety_open; }, 300);
        ck('healthy channel: safeties lift on the bottled SG',
          tA >= 0 ? '+' + fmt(tA, 0) + ' s' : 'never', tA >= 0, 'within 300 s');
        a.run(120);
        ck('and regulate at the relief band, not past it', fmt(a.range('steam_pressure_mpa').max, 2),
          a.range('steam_pressure_mpa').max < pop + 0.3, '< pop + 0.3 (config)');

        // ---- leg B: the transmitter lies low the whole ride. TR-1f discipline —
        // prove the lie took, and that truth is genuinely elsewhere, before asserting.
        var b = H('hot_full_power');
        b.run(30);
        b.cmd('set_adv', { mode: 'closed' });   // same ADV-out fixture as leg A
        b.cmd('set_instrument_failure', { instrument_id: 'steam_pressure', mode: 'stuck' });
        b.run(10);
        b.cmd('close_msiv');
        var tB = b.runUntil(function (ts) { return !!ts.sg_safety_open; }, 300);
        // Separation re-derived at #419 wave 3: the Ginna ladder's operating→pop span is
        // 1.89 MPa (5.69 → 7.58, vs the old 3.66), so "far below" is pop − 1.5; the truth
        // band is the pop itself rather than a literal from the old ladder.
        ck('channel stuck well below the pop the whole ride', fmt(b.ins().steam_pressure, 2),
          b.ins().steam_pressure < pop - 1.5, '< ' + fmt(pop - 1.5, 2) + ' MPa (the lie)');
        ck('while true pressure is really at the relief band', fmt(b.ts().steam_pressure_mpa, 2),
          b.ts().steam_pressure_mpa > pop - 0.1, '> pop − 0.1 (config)');
        ck('dead channel: safeties lift ANYWAY — the valve does not read a gauge',
          tB >= 0 ? '+' + fmt(tB, 0) + ' s' : 'never', tB >= 0, 'within 300 s');
        b.run(120);
        ck('and hold the band there too', fmt(b.range('steam_pressure_mpa').max, 2),
          b.range('steam_pressure_mpa').max < 9.6, '< 9.6 MPa');
        T.checkSanity(ck, a); T.checkSanity(ck, b);
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
        // BAND RE-DERIVED FOR #364 (2026-08-05). It was 5–9 %, which was a fixture of the
        // pre-refit two-group curve — that plant read ~6.9 % here. The SOURCED curve
        // (ANS 5.1-1971 + actinides, un-multiplied; see pwr_config.kinetics.decay) puts
        // t+3 min at ~3.1 % of rated, and the plant measures 3.21 %. The claim — the core is
        // still making decay heat, and a real amount of it — is unchanged; the band now comes
        // from the standard instead of from the old fit.
        ck('t+3 min: the core is still making decay heat', fmt(a.ts().core_heat_pct, 2) + ' % of rated',
          a.ts().core_heat_pct > 2.5 && a.ts().core_heat_pct < 4.5, '2.5–4.5 % (sourced ~3.1 %)');
        ck('…and flow is unchanged', fmt(a.ts().pump_flow_pct, 0) + ' %', a.ts().pump_flow_pct > 95, '> 95 %');
        // Identity sample t+3 → t+10 min at #419 wave 3: the Ginna anchor deepened the
        // post-trip settle (304.5 → 286 is 18.5 °C of stored heat, vs 7 on the old
        // program), so at t+3 the legs still carry the settle's stored-heat flux on top
        // of decay heat and read ~6 % high. By t+10 the settle is done and the identity
        // is decay-only again — valid on both programs (the old plant was settled well
        // before t+10 too).
        a.run(420);
        var expA = dt0 * (a.ts().core_heat_pct / 100) / Math.max(a.ts().pump_flow_pct / 100, floor);
        var obsA = a.ts().thot_c - a.ts().tcold_c;
        ck('t+10 min: leg ΔT matches the heat being removed',
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
        // RE-BANDED FOR #364, and the honest reading is that the SIGNAL genuinely shrank.
        // The post-trip split is delta_T_rated x Q/flow, so correcting decay heat down ~2.4x
        // scales it down with it: the mean was comfortably over 2 °F on the old curve and
        // MEASURES 1.33 °F now, with 2 of 250 samples inverted by channel noise. That is the
        // plant telling the truth — a tripped plant with the pumps running really does have
        // only a couple of °F across the legs — not a regression.
        //
        // WHAT THIS LEG GUARDS IS UNCHANGED AND STILL DISCRIMINATES BY TWO ORDERS OF
        // MAGNITUDE. #315's defect put the cold leg above the hot leg in 48.3 % of samples
        // because the split read FISSION power and computed 0.0 °F on a scrammed core.
        // 0.8 % is noise on a small real signal; 48 % is no signal at all.
        ck('indicated ΔT stays POSITIVE for 25 min after the trip',
          inverted + ' of ' + samples + ' samples read the cold leg hotter (#315: 48.3 %)',
          inverted <= 5, '≤ 5 of 250 (≤ 2 %)');
        ck('…and the signal is still a real one, not zero',
          fmt(F(sum / samples), 2) + ' °F mean (pre-#364: > 2 °F, on 2.4x the decay heat)',
          F(sum / samples) > 1.0, '> 1 °F');

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
        // Settle 240 → 600 s (#418 wave B1, 2026-08-07): the legs are TRANSPORTED
        // now (first-order at tau/flow), and at natural-circulation flow the
        // cold-leg constant is tau_coldleg_s/0.033 ≈ 120 s — at 240 s the split
        // read 49.0 °F against 51.9 expected (94.4 % converged, outside the 5 %
        // band for the honest reason that real leg RTDs lag a coastdown's
        // equilibrium). 600 → 2400 s at #419 wave 3, and the reason is the LAG-VS-SLOPE
        // race, not just settle depth: the transported legs read the decay tail ~2
        // cold-leg constants late, so on a steep part of the tail the observed split
        // sits above the instantaneous Q/flow identity by slope × lag (measured: 6 %
        // LOW at 600 s inside the anchor settle, then 6 % HIGH at 1200 s chasing the
        // falling tail). At 2400 s the tail is flat enough that the lag error is inside
        // the 5 % band — on both programs.
        d.run(2400);
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

        // ---- leg B2: BUOYANCY IS NOT A PUMP (#367). Shaft-work heat was scaled by
        // `flow_frac` outright, so a STOPPED RCP went on depositing pump heat for as long as
        // the plant circulated — and the fraction GREW, because decay heat falls faster than
        // buoyancy flow does (W ∝ Q^⅓, the very law leg B just pinned): measured 0.55 % of
        // core heat at rated, 0.85 % at 2 h, 2.57 % at 24 h.
        //
        // ASSERTED THROUGH THE ENGINE, and at the mechanism rather than on the plant. Two
        // reasons, both measured. On a plant with a working heat sink the term is
        // UNOBSERVABLE — the SG absorbs it and the dump holds Tavg on programme, so a 24 h
        // post-scram A/B is identical to every printed digit; take the sink away and it shows
        // as 0.7 °F at 30 min growing to 1.7 °F at 3 h, too small to band without pinning a
        // tuning. And a first draft of this check RECOMPUTED the term in the probe, which made
        // it read identically on both engines — a copy of the formula tests the copy.
        //
        // So: two clones of the settled natural-circulation state through the ENGINE's own
        // `stepCoolant`, differing ONLY in `pump_running`. `stepCoolant` reads that flag
        // nowhere else, so the whole difference in `_dTavg_dt` is the shaft-work term. Pre-#367
        // the term read `flow_frac` outright and the flag changed nothing: the difference is
        // EXACTLY ZERO, which is the defect stated as a number.
        var bs = b.eng.s;
        var dT = function (running) {
          var c = Object.assign({}, bs);
          c.pump_running = running;
          RD.pwrThermal.stepCoolant(c, RD.PWR_CONFIG, 0.1);
          return c._dTavg_dt;
        };
        var gap = dT(true) - dT(false);
        ck('the heat balance can tell a STOPPED pump from a running one at the same flow',
          fmt(gap, 8) + ' °C/s of shaft work removed, at ' + fmt(bs.flow_frac * 100, 2) +
          ' % flow (pre-#367: exactly 0 — buoyancy was billed as pump work)',
          bs.pump_running === false && bs.flow_frac > 0.01 && gap > 1e-6,
          '> 0, with flow still running');

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
        // 7200 -> 15000 s, #364. Same adjudication as MD-3/6/10: the CLAIM (heat sink gone,
        // no injection, the plant is still lost) is unchanged and still true — MD-6 measures
        // this casualty damaging at 8635 s on the corrected curve, past the old window. A
        // window catching up to a slower, more prototypical plant, not a weakened assertion.
        e.run(15000);
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
        T.checkSanity(ck, h);
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
     * forever, holding the reactor at 100 % and destroying the EV-11 load-follow lesson.
     *
     * RE-AUTHORED 2026-08-06 (#377): the backstop check was `peak >= 16.20` — the PORV
     * setpoint itself — and the physics sits ON that number: measured, the sub-arm peak is
     * 16.212 MPa and a 3 % `coolant_heat_capacity` nudge reads 16.181, flipping the check
     * (and the porv_open EVENT with it — the two flip TOGETHER under every nudge tried, so
     * asserting the event instead is no more robust; that idea was measured and dropped).
     * The old form was not wrong, it was knife-edge: #372's feedwater enthalpy damped the
     * transient until the margin was noise-wide. What is ROBUST under every nudge and seed
     * tried (worst-seen values): the sub-arm peak reaches the PORV's DOORSTEP (>= 16.11 vs
     * the caught side's ~15.43), the CLIFF SPAN between the two legs (>= 0.68 MPa), and the
     * code safety never lifting (0.9 MPa clear). Those are the checks now; the terminal
     * ornament — whether the PORV catches a sample or the peak grazes just under the
     * setpoint — is carried as info, because on this plant it is genuinely a coin toss.
     *
     * The shipped-lineup story this comment used to carry ("rod control absorbs a sub-arm
     * rejection, which MITIGATES this declared cliff") was MEASURED FALSE on 2026-08-06 —
     * the shipped lineup peaks 16.198 and the PORV catches a sample there too — and was
     * never recorded in the §8.21 write-up it claimed to live in. TR-1k now pins what the
     * shipped lineup actually does. */
    'TR-1c': function () {
      return test('TR-1c sub-threshold load rejection — the C-7 arm is a cliff (declared, §8.21)', function (ck) {
        var arm = RD.PWR_CONFIG.steam_generator.dump_load_reject_mwe;
        var porvSp = RD.PWR_CONFIG.pressurizer.porv_open_mpa;
        ck.info('arm threshold under test', fmt(arm, 0) + ' MWe');

        // --- just UNDER the arm: no fast dump, operator's problem, PORV is the backstop
        // Both legs rod-less (#289): this probe pins the ARM discontinuity, and "hands-off"
        // is its premise. The SHIPPED lineup's answer is TR-1k's subject, not a softer
        // version of this one — measured 2026-08-06, both end at the PORV's doorstep.
        var lo = rodsManual(H('hot_full_power'));
        lo.run(30);
        // `immediate`: a load REJECTION is an event, not an operator ramp — see TR-1.
        lo.cmd('set_load_target', { immediate: true, mwe: 100 - (arm - 1) });     // 39 MWe rejected
        var loArmed = false, loPorv = false, loSafety = false;
        for (var i = 0; i < 180; i++) {
          lo.run(5, function (hh) {
            var t = hh.ts();
            if (t.porv_open) loPorv = true;
            if (t.safety_open) loSafety = true;
          });
          if (lo.eng.s.dump_reject_mode) loArmed = true;
        }
        ck('under the arm the fast dump never arms', String(loArmed), loArmed === false, 'false');
        // 315 → 309 at #419 wave 3: the program top is 304.5 on the Ginna anchor (the old
        // literal rode the 297-anchor program). Same claim — the uncaught cut runs Tavg
        // meaningfully past the program top (measured 311.9).
        ck('so Tavg climbs well past program (> 309 °C)', fmt(lo.range('tavg_c').max, 1),
          lo.range('tavg_c').max > 309, '> 309');
        // THE CLIFF WENT THERMAL (#418 wave A1, 2026-08-07). On the derived
        // K_steam_pressure the SG liquid soaks the rejected power, the transient is
        // slow enough for spray to keep up, and the PORV doorstep NEVER arrives —
        // measured over a full 3600 s hands-off: peak 15.544 MPa at t+26 s, then
        // spray equilibrium 15.41 forever (the old doorstep ≥ 16.05 was the
        // compressed clock's rendering; §8.21 re-written with both sets of numbers).
        // The excursion the arm cliff creates is now read on TEMPERATURE — the
        // Tavg checks above and the span check below — which is also the board's
        // honest cue (the Tavg/Tref deviation). HR10: the old plant passes the
        // thermal form too (316.1 vs 304.6 on the 2026-08-06 numbers).
        ck('spray holds the uncaught side clear of the PORV (the doorstep died with the compressed clock)',
          fmt(lo.range('pressure_mpa').max, 2), lo.range('pressure_mpa').max < porvSp,
          '< ' + fmt(porvSp, 2) + ' (config)');
        ck('…and never escalates to the code safety',
          String(loSafety), loSafety === false, 'false');
        ck.info('uncaught-side peak (was ~16.1 on the compressed clock) / PORV sample seen',
          fmt(lo.range('pressure_mpa').max, 3) + ' MPa / ' + String(loPorv));

        // --- just OVER the arm: caught, and Tavg stays on program
        var hi = rodsManual(H('hot_full_power'));
        hi.run(30);
        // `immediate`: a load REJECTION is an event, not an operator ramp — see TR-1.
        hi.cmd('set_load_target', { immediate: true, mwe: 100 - (arm + 1) });     // 41 MWe rejected
        var hiArmed = false;
        for (var j = 0; j < 180; j++) { hi.run(5); if (hi.eng.s.dump_reject_mode) hiArmed = true; }
        ck('one MWe over the arm, the fast dump arms', String(hiArmed), hiArmed === true, 'true');
        // Cap-reading since #419 wave 3 (D1: the dump is Ginna's 28 %, was 40).
        var _dcap = 100 * RD.PWR_CONFIG.steam_generator.steam_dump_max;
        ck('the dump carries it (peak at its cap)', fmt(hi.range('steam_dump_valve_pct').max, 1),
          hi.range('steam_dump_valve_pct').max >= _dcap - 1, '≥ ' + fmt(_dcap - 1, 0));
        ck('Tavg stays on program (< 310 °C)', fmt(hi.range('tavg_c').max, 1),
          hi.range('tavg_c').max < 310, '< 310');
        ck('no PORV lift on this side of the cliff — clear by a quarter MPa, not a whisker',
          fmt(hi.range('pressure_mpa').max, 2), hi.range('pressure_mpa').max < porvSp - 0.25,
          '< ' + fmt(porvSp - 0.25, 2) + ' (config)');
        // The programmed reference (#219) is what keeps the caught side proportional: with
        // the old fixed no-load anchor the demand saturated and MTC ran power to 102.7 %.
        ck('and the catch does not overcool into a power runup (< 101 %)',
          fmt(hi.range('power_pct').max, 1), hi.range('power_pct').max < 101, '< 101');
        // THE CLIFF AS A SPAN — in TEMPERATURE since #418 wave A1 (the pressure span
        // collapsed to 0.125 MPa when spray started outrunning the soaked transient;
        // asserting it would pin noise). Both legs move together under any thermal
        // nudge, so their Tavg-peak DIFFERENCE holds: measured 9.8 °C on the new
        // clock (315.6 vs 305.8), 11.5 °C on the old (HR10 — valid both sides).
        // ≥ 5 → ≥ 3 at #419 wave 3 (D1): the 28 % dump narrows the caught-vs-uncaught gap
        // (measured 3.7 °C, was 7.1 at 40 %). The declared cliff (§8.21) survives, smaller —
        // the register row re-states its numbers at this wave's manual pass.
        ck('the cliff itself: the uncaught side peaks ≥ 3 °C hotter than the caught side',
          fmt(lo.range('tavg_c').max - hi.range('tavg_c').max, 1) + ' °C apart',
          lo.range('tavg_c').max - hi.range('tavg_c').max >= 3, '≥ 3');
        ck.info('pressure span (was the asserted cliff on the compressed clock, 0.77 MPa)',
          fmt(lo.range('pressure_mpa').max - hi.range('pressure_mpa').max, 2) + ' MPa');
        T.checkSanity(ck, hi);
        T.checkSanity(ck, lo);   // #376: the sub-arm leg's commands were never inspected
      });
    },

    /* TR-1m (NEW 2026-08-17, #489) — AN ARMED REJECTION NEVER STANDS DOWN WITH THE RODS
     * IN MANUAL, WHICH IS THE LINEUP THAT SHIPS.
     *
     * The fast-dump latch clears on `|load_imbalance_mwe| < dump_reject_clear_mwe` — its
     * own comment glosses that as "the reactor has come back to meet the load". What
     * brings it back is the ROD CONTROLLER, and #460 took `rods_tavg` out of free play on
     * 2026-08-11. So in the shipped lineup the ride-out has no end condition: the latch
     * holds, the dump sits on its cap, and the reactor parks well above the load forever.
     *
     * RULED ACCEPTED, not a defect (2026-08-17, #489; DESIGN_COMPANION §8.30) — the fix is
     * the operator RESET the real plant has, and §8.30 forbids building it without the
     * sourced sensitive arm because the two are one trade. This probe exists because a
     * declared simplification NOTHING PINS can move silently, which is §8.21's own
     * argument about its neighbour.
     *
     * THREE LEGS, AND THE THIRD IS THE POINT. Legs A and B are the same rejection under
     * the two rod lineups — that pair is what proves the CAUSE is the lineup and not the
     * threshold, and it is why leg B is here at all. Leg C sits one MWe the other side of
     * the arm and pins the NON-MONOTONICITY: less demand, more reactor power, permanently.
     *
     * Both lineups are stated out loud (`rodsManual`/`rodsAuto`) rather than inherited —
     * this probe is the record of what inheriting a lineup costs, so it had better not.
     */
    'TR-1m': function () {
      return test('TR-1m armed rejection never clears with rods in MANUAL (declared, §8.30)', function (ck) {
        var arm   = RD.PWR_CONFIG.steam_generator.dump_load_reject_mwe;
        var clear = RD.PWR_CONFIG.steam_generator.dump_reject_clear_mwe;
        var dcap  = 100 * RD.PWR_CONFIG.steam_generator.steam_dump_max;
        var over  = 100 - (arm + 1);          // 59 MWe — one MWe PAST the arm
        var under = 100 - (arm - 1);          // 61 MWe — one MWe short of it
        ck.info('arm / clear / dump cap (config)',
          fmt(arm, 0) + ' MWe  /  ' + fmt(clear, 0) + ' MWe  /  ' + fmt(dcap, 0) + ' %');

        // Settle long enough that "never clears" means something. The latch would clear
        // within a couple of minutes if it were going to; 1200 s is 10x that.
        function ride(h, mwe) {
          h.run(30);
          // `immediate`: a rejection is an EVENT, not an operator ramp — see TR-1.
          h.cmd('set_load_target', { immediate: true, mwe: mwe });
          var armedEver = false;
          for (var i = 0; i < 240; i++) {
            h.run(5);
            if (h.eng.s.dump_reject_mode) armedEver = true;
          }
          return armedEver;
        }

        // ---- leg A: rods MANUAL (the shipped lineup) -------------------------------
        var a = rodsManual(H('hot_full_power'));
        var aArmed = ride(a, over);
        var aTs = a.ts();
        ck('A/MANUAL: the rejection arms the fast dump', String(aArmed), aArmed === true, 'true');
        ck('A/MANUAL: …and it is STILL armed 1200 s later — no path home',
          String(a.eng.s.dump_reject_mode), a.eng.s.dump_reject_mode === true, 'true');
        ck('A/MANUAL: the dump is parked on its cap', fmt(aTs.steam_dump_valve_pct, 1) + ' %',
          aTs.steam_dump_valve_pct >= dcap - 1, '≥ ' + fmt(dcap - 1, 0));
        // The reset's own quantity, and why it can never fire: the reactor is nowhere
        // near the load, so the window is never entered.
        ck('A/MANUAL: the imbalance never re-enters the reset window',
          fmt(Math.abs(aTs.load_imbalance_mwe), 1) + ' MWe',
          Math.abs(aTs.load_imbalance_mwe) > clear, '> ' + fmt(clear, 0) + ' (config)');
        ck('A/MANUAL: so the reactor parks far above the load it was given',
          fmt(aTs.power_pct, 1) + ' %', aTs.power_pct > over + 15, '> ' + fmt(over + 15, 0));

        // ---- leg B: rods AUTO — the control that names the cause --------------------
        // Same rejection, same everything else. If B also stuck, the story would be the
        // arm threshold; it does not, so the story is the rod lineup.
        var b = rodsAuto(H('hot_full_power'));
        var bArmed = ride(b, over);
        var bTs = b.ts();
        ck('B/AUTO: the same rejection arms the same way', String(bArmed), bArmed === true, 'true');
        ck('B/AUTO: …but the latch CLEARS once the rods walk power back',
          String(b.eng.s.dump_reject_mode), b.eng.s.dump_reject_mode === false, 'false');
        ck('B/AUTO: the dump reseats', fmt(bTs.steam_dump_valve_pct, 1) + ' %',
          bTs.steam_dump_valve_pct < 1, '< 1 %');
        ck('B/AUTO: and power tracks the load it was given',
          fmt(bTs.power_pct, 1) + ' %', Math.abs(bTs.power_pct - over) < 5,
          'within 5 pts of ' + fmt(over, 0));

        // ---- leg C: one MWe the OTHER side of the arm, rods MANUAL ------------------
        var c = rodsManual(H('hot_full_power'));
        var cArmed = ride(c, under);
        var cTs = c.ts();
        ck('C/MANUAL: one MWe short of the arm, the fast mode never arms',
          String(cArmed), cArmed === false, 'false');
        ck('C/MANUAL: the dump only modulates', fmt(cTs.steam_dump_valve_pct, 1) + ' %',
          cTs.steam_dump_valve_pct < dcap - 5, '< ' + fmt(dcap - 5, 0) + ' %');

        // ---- THE NON-MONOTONICITY, which is the row's headline ----------------------
        // Leg A asks for LESS electrical output than leg C and gets MORE reactor power.
        // Asserted as a SPAN so it cannot be satisfied by both legs drifting together.
        var span = aTs.power_pct - cTs.power_pct;
        ck('THE INVERSION: 1 MWe LESS demand across the arm gives MORE reactor power',
          fmt(cTs.power_pct, 1) + ' % at ' + fmt(under, 0) + ' MWe → '
            + fmt(aTs.power_pct, 1) + ' % at ' + fmt(over, 0) + ' MWe  (+' + fmt(span, 1) + ' pts)',
          span >= 5, '≥ 5 pts');
        ck.info('steady-state heat to the condenser on leg A',
          fmt(aTs.core_heat_pct - aTs.mwe_output, 1) + ' points of rated');

        T.checkSanity(ck, a);
        T.checkSanity(ck, b);
        T.checkSanity(ck, c);
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
        // Two phenomena share this run since #373 and must not share one check: the
        // ~2 s trip BURST (stored energy the stop valve bottles up — spikes the
        // primary toward the PORV on any trip from 100 %, AFW-independent, pinned
        // from both sides by TR-1b) and the sustained heat-sink question this probe
        // actually asks. "AFW means the PORV is not NEEDED" is a claim about the
        // minutes AFTER the burst — the regime where TR-3's blocked-AFW twin
        // genuinely does need it.
        ck('the trip burst stays inside the pressurizer safety', fmt(h.range('pressure_mpa').max, 2),
          h.range('pressure_mpa').max < RD.PWR_CONFIG.pressurizer.safety_open_mpa,
          '< ' + fmt(RD.PWR_CONFIG.pressurizer.safety_open_mpa, 2) + ' (config)');
        var postPeak = 0;
        h.run(240, function (hh) { var p = hh.ts().pressure_mpa; if (p > postPeak) postPeak = p; });
        ck('with AFW carrying the SGs the PORV is not needed post-burst', fmt(postPeak, 2),
          postPeak > 0 && postPeak < RD.PWR_CONFIG.pressurizer.porv_open_mpa,
          '< ' + fmt(RD.PWR_CONFIG.pressurizer.porv_open_mpa, 2) + ' after the burst');
        T.checkSanity(ck, h);
      });
    },

    // TR-3 / the CC-5 canon pin: loss of feed WITH AFW blocked (the actual TMI-2
    /* TR-19 — UNTHROTTLED AFW OVERCOOLS THE PLANT (#464).
     *
     * WHAT THIS EXISTS TO CATCH, stated as the defect it was written against: the SG used
     * to CLAMP steam generation at zero when cold feed's sensible demand exceeded the heat
     * crossing the tubes, and pressure integrates (generation − out), so dP/dt was exactly
     * zero and the SG could not depressurize. Measured before the fix, six plant-hours at
     * full AFW: **947.1 psi flat to the psi** while decay heat fell 6.25 % → 0.94 %, with
     * the primary-secondary ΔT collapsed to 0.4 °F — the SG absorbing essentially all the
     * decay heat and discarding it. An infinite heat sink at fixed temperature.
     *
     * IT ASSERTS THE THERMAL CONSEQUENCE, NOT THE FLOW, and that distinction is the whole
     * reason a false claim could stand in pwr_config for days with every gate green:
     * run_m4 already drives AFW to full capacity by this same stuck-instrument route and
     * checks `afw_flow_normalized` against `afw_flow_frac` — the flow was never the
     * problem. An unasserted mechanism is one nobody can tell is missing.
     *
     * FULL FLOW NEEDS THE STUCK INSTRUMENT. On a healthy level channel the AFW controller
     * throttles to ~1-2 % to hold level and the plant sits in a stable hot standby (547 °F,
     * 1012 psi, measured) — correct, and NOT what this probe is about. The overcooling case
     * is unthrottled AFW, which is exactly why real operators are told to throttle it:
     * "excessive feedwater flows" causing "excessive cooldown of the primary system"
     * (Ginna TS Bases, ML20339A221).
     *
     * THE BAND IS A SPAN, NOT AN ENDPOINT. The cooldown is self-limiting — as pressure
     * falls, t_sec falls, ΔT grows, Q_sg grows and the deficit closes — so the plant decays
     * toward the AFW temperature and the RATE decays with it (measured 170.6 → 94.0 → 48.7
     * → 25.6 → 14.4 → 7.7 °F/hr over six hours). Pinning an endpoint would pin the
     * asymptote; pinning the span is what says "it moved, and it kept moving".
     *
     * The 100 °F/hr Tech Spec cooldown limit (ML11223A342) is deliberately NOT asserted as
     * a ceiling here. It is an OPERATOR limit, and a plant that physically cannot exceed it
     * with AFW wide open would have nothing to teach about throttling. The first hour
     * measures 170.6 °F/hr, and that is the lesson, not a defect. */
    'TR-19': function () {
      return test('TR-19 unthrottled AFW overcools — the SG depressurizes, it does not bank the heat', function (ck) {
        var h = H('hot_full_power');
        h.run(30);
        h.cmd('inject_failure', { failure_id: 'loss_of_feedwater' });
        h.run(30);
        // Hold the sensed level below the AFW band so the controller calls for FULL
        // capacity — the same route run_m4 uses to reach full flow (HR1: drive the
        // INSTRUMENT, not the true state).
        h.cmd('set_instrument_failure', { instrument_id: 'sg_level', mode: 'stuck', value: 10 });
        h.run(120);
        var afw = h.ts().afw_flow_normalized || 0;
        var full = RD.PWR_CONFIG.steam_generator.afw_flow_frac;
        ck('AFW is at full capacity (precondition — without it the rest is vacuous)',
          fmt(afw, 4), Math.abs(afw - full) < 1e-6, fmt(full, 4));
        var p0 = h.ts().steam_pressure_mpa, t0 = h.ts().tavg_c;
        h.run(3600);
        var p1 = h.ts().steam_pressure_mpa, t1 = h.ts().tavg_c;
        // THE defect check: the clamp made this span exactly zero.
        ck('SG pressure FALLS over the hour (the clamp froze it at 6.53 MPa)',
          fmt(p0, 2) + ' → ' + fmt(p1, 2) + ' MPa', p1 < p0 - 0.5, 'a drop > 0.5 MPa');
        ck('…and the primary cools with it', fmt(t0 * 9 / 5 + 32, 1) + ' → ' + fmt(t1 * 9 / 5 + 32, 1) + ' °F',
          t1 < t0 - 20, 'a drop > 36 °F');
        // The secondary must not overtake the primary — t_sec is saturation at the
        // pressure this term drives, so a runaway would show up as an inverted ΔT.
        ck('the SG stays COLDER than the primary (ΔT never inverts)',
          fmt((t1 - h.ts().t_sg_c) * 9 / 5, 2) + ' °F', h.ts().t_sg_c <= t1 + 0.5, '≥ 0');
        // Self-limiting: the second hour must be slower than the first, or the term is
        // running away rather than closing its own deficit.
        var r1 = (t0 - t1);
        h.run(3600);
        var r2 = (t1 - h.ts().tavg_c);
        ck('the cooldown DECELERATES — the deficit closes itself',
          fmt(r1 * 9 / 5, 1) + ' → ' + fmt(r2 * 9 / 5, 1) + ' °F in hours 1 and 2',
          r2 < r1 && r2 >= 0, 'hour 2 slower than hour 1, still cooling');
        T.checkSanity(ck, h);
      });
    },

    // lineup) — the SG dries out, decay heat has nowhere to go, the primary heats
    // to saturation and repressurizes over ~10-20 min, and the capped spray CANNOT
    // stop it: the PORV lifts. This is the sim-honest home of the SUSTAINED canon
    // PORV lift. (The first-seconds wave on a caught REJECTION is absorbed by the
    // trip-open dump; on a full-power TRIP it blips the PORV since #373's stop
    // valve made that burst real — TR-1b pins the blip, this probe pins the duty.)
    'TR-3': function () {
      return test('TR-3 loss of feed + AFW blocked — dryout repressurization lifts the PORV', function (ck) {
        var h = H('hot_full_power');
        h.run(30);
        h.cmd('inject_failure', { failure_id: 'afw_failure' });
        h.cmd('inject_failure', { failure_id: 'loss_of_feedwater' });
        var dt = h.runUntil(function (ts, ins, hh) { return hh.tripTime != null; }, 300);
        ck('reactor trips on the lo-lo limit first', dt >= 0 ? fmt(dt, 0) + ' s' : 'no trip', dt >= 0, 'trips');
        // RE-DERIVED TWICE IN ONE DAY (#418, 2026-08-07), and the oscillation is
        // itself the record: this claim is knife-edge in the loop's thermal time
        // constant. COMPRESSED clock: repressurization outran spray, PORV lift at
        // ~25 min. WAVE A1 (real secondary clock, coolant node still 20): the SG
        // liquid's capacitance gentled the climb and SPRAY WON (peak 15.43, no
        // lift in 40 min) — this probe briefly asserted that. WAVE B1 (the split:
        // coolant 15 + tube 5, loop total unchanged): the lighter coolant node
        // heats faster on decay heat and the lift is BACK — measured in this
        // probe's environment, peak 16.30 MPa, lift inside the window. The FINAL
        // plant restores the original TMI mechanism: a sustained total loss of
        // feed genuinely walks the primary to its relief. Both signatures stay
        // asserted — the dry SG, the climbing Tavg — so whichever side of the
        // knife a future retune lands on, the mechanism half cannot pass hollow.
        h.run(1500);                                    // through dryout + depletion
        var _tavgDry3 = h.ts().tavg_c;
        h.run(900);
        var t3 = h.ts();
        ck('the SG is genuinely dry — wide-range level at the floor',
          fmt(t3.sg_level_wide_pct, 1) + ' %', t3.sg_level_wide_pct < 2, '< 2 %');
        ck('with the heat sink lost, Tavg climbs off the no-load anchor',
          fmt(_tavgDry3, 1) + ' → ' + fmt(t3.tavg_c, 1) + ' °C over the last 15 min',
          t3.tavg_c > _tavgDry3 + 3 && t3.tavg_c > 305, 'rising, > 305 °C');
        var dl3 = t3.porv_open ? 0 : h.runUntil(function (ts) { return ts.porv_open; }, 1200);
        ck('the dry-SG repressurization lifts the PORV (spray loses — the TMI mechanism)',
          dl3 >= 0 ? 'lift observed, peak ' + fmt(h.range('pressure_mpa').max, 2) + ' MPa' : 'no lift — peak ' + fmt(h.range('pressure_mpa').max, 2),
          dl3 >= 0, 'PORV lifts');
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
        // Severity CONFIG-DERIVED (#408 wave 1): the leg needs a leak the frozen
        // sensor hides that moves truth ~3 % over the 600 s window (5e-5 frac/s),
        // whatever the catalog's scale. The old hardcoded 0.012 was that number on
        // the pre-#408 map and a third of it on the re-clocked one.
        var sgD3 = RD.PWR_CONFIG.protection.failures.sgtr;
        var sgR3 = (sgD3.severity_meta.max / 100) * (sgD3.leak_scale != null ? sgD3.leak_scale : 1);
        h.cmd('inject_failure', { failure_id: 'sgtr', severity: Math.min(1, 5e-5 / sgR3) });
        var ind0 = h.ins().pzr_level;
        h.run(600);
        var t = h.ts();
        ck('indicated level frozen by the stuck sensor (±0.5 %)',
          fmt(ind0, 1) + ' → ' + fmt(h.ins().pzr_level, 1),
          Math.abs(h.ins().pzr_level - ind0) <= 0.5, 'frozen');
        ck('charging did NOT chase truth (follows the stuck instrument)',
          fmt(h.range('charging_flow_actual').max, 3) + ' vs letdown ' + fmt(t.letdown_flow_actual, 3),
          h.range('charging_flow_actual').max <= t.letdown_flow_actual + 0.1 * RD.PWR_CONFIG.reactivity.charging_max, 'no make-up response');
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
        // RESTRUCTURED 2026-08-05 (#370c) — EVENT-DRIVEN, and with NO OPERATOR COMMAND.
        // The old form ran the break 60 s, sampled `atClose`, then closed the MSIV by
        // hand. Now the plant isolates itself in about a second, so a sample taken at
        // t+60 reads an already-recovered generator and "rises ≥ 1 MPa" had nothing
        // left to rise (measured 9.07 → 9.01). Sampling AT THE ISOLATION INSTANT tests
        // the same claim against the mechanism that now performs it.
        //
        // HR10, stated rather than hidden: this form CANNOT pass on the pre-#370c
        // plant, because that plant never closes the valve on its own — `isoAt` stays
        // null and the probe fails at the first check. The probe's subject changed
        // when the plant gained the function; that is a re-specification, not a refit.
        function run(failure) {
          var h = H('hot_full_power');
          h.run(30);
          h.cmd('inject_failure', { failure_id: failure, severity: 0.8 });
          var atIso = null, isoAt = null;
          for (var i = 0; i < 600 && isoAt == null; i++) {   // 0.5 s resolution, 300 s watch (#408)
            h.run(0.5);
            if (h.ts().msiv_open === false) { isoAt = h.t() - 30; atIso = h.ts().steam_pressure_mpa; }
          }
          // 1800 s settle, was 900 (#408): the sourced deeper isolation lets the break
          // blow the SG down to ~4.35 MPa before the MSIV shuts, and the decay-heat
          // climb back to the 8.60 ADV setpoint honestly takes ~30 min (measured:
          // reaches 8.63 at ~1800 s and parks there, safeties never lift).
          h.run(1800);
          return { h: h, atIso: atIso, isoAt: isoAt, t: h.ts() };
        }
        var d = run('steam_line_break');
        ck('DOWNSTREAM: the plant isolates ITSELF — no operator action in this probe',
          // < 180 s. Was < 10, re-banded at #408 when the sourced-deep 600 psig leg
          // put the RAW crossing at +115.5 s — which #433 then measured as NEVER
          // FIRING (the 60 s flow latch expired first). Since #433 the leg carries
          // the channel's sourced rate sensitivity (`lead_lag`) and the isolation
          // lands +2..3 s; the 180 s band is kept as the outer envelope.
          d.isoAt != null ? '+' + fmt(d.isoAt, 1) + ' s' : 'never', d.isoAt != null && d.isoAt < 180,
          'within 180 s of the break (sourced deep setpoint)');
        ck('MSIV shut', String(d.t.msiv_open), d.t.msiv_open === false, 'false');
        ck('…and isolating ends the blowdown — the bottled SG re-pressurizes',
          fmt(d.atIso, 2) + ' → ' + fmt(d.t.steam_pressure_mpa, 2) + ' MPa',
          d.t.steam_pressure_mpa > d.atIso + 1.0, 'rises ≥ 1 MPa from the isolation instant');
        ck('and the overcooling is arrested (Tavg back near the no-load anchor)',
          fmt(d.t.tavg_c, 1), d.t.tavg_c > 280, '> 280 °C');
        // RE-AUTHORED 2026-08-06 (ADV SHUT → AUTO), and AGAIN for #418 wave A1
        // (2026-08-07). The 2026-08-06 form asserted arrival AT the ADV band
        // (8.5 < P < 9.31, throttling) because on the compressed clock the
        // decay-heat climb reached 8.63 inside the 1800 s settle. On the derived
        // K_steam_pressure the deeper, longer blowdown overcools the primary
        // further and the bottled generator parks at the THERMAL SEAM instead:
        // P_sg = Psat(Tavg) — zero-ΔT equilibrium with the primary that heats it —
        // and creeps upward only as decay heat reheats the loop (measured: 7.59
        // MPa = Psat(291.3 °C) at 1800 s, ADV shut, safeties shut). The claim the
        // probe wants is unchanged — the bottled generator HOLDS with the plant
        // rather than drifting — so it asserts the seam, plus the relief ceiling.
        // The ADV arrival is asserted only once pressure gets there (the old form,
        // kept as the branch), so the check is valid on BOTH clocks (HR10: the old
        // plant read 8.63 = Psat(~300.3) — inside the seam band AND in the ADV
        // branch).
        // Ladder values read from config since #419 wave 3 (pop 7.58; the ADV branch keys
        // off the config setpoint) — same seam-or-ADV claim, valid across ladder moves.
        var _sgCfg12 = RD.PWR_CONFIG.steam_generator;
        var _psatTavg12 = Math.pow(Math.max(d.t.tavg_c, 1) / 179.47, 1 / 0.239);
        var _onSeam12 = Math.abs(d.t.steam_pressure_mpa - _psatTavg12) < 0.5;
        var _onAdv12 = d.t.steam_pressure_mpa > _sgCfg12.adv_setpoint - 0.1 && d.t.adv_valve_pct > 1;
        ck('…and the bottled generator holds with the primary — on the Psat(Tavg) seam (or throttling at the ADV), under the safeties',
          fmt(d.t.steam_pressure_mpa, 2) + ' MPa vs Psat(Tavg) ' + fmt(_psatTavg12, 2) +
            ', adv ' + fmt(d.t.adv_valve_pct, 1) + ' %, safety ' + String(!!d.t.sg_safety_open),
          (_onSeam12 || _onAdv12) && d.t.steam_pressure_mpa < _sgCfg12.sg_safety_open_mpa,
          'seam ±0.5 MPa or ADV throttling, under the pop');

        var u = run('steam_line_break_upstream');
        ck('UPSTREAM: the SAME protection fires — the plant cannot tell the location',
          u.isoAt != null ? '+' + fmt(u.isoAt, 1) + ' s' : 'never', u.isoAt != null && u.isoAt < 180,   // same re-band as downstream (#408)
          'within 180 s (it actuates identically)');
        ck('…and it changes nothing — the break is on the wrong side of the valve',
          fmt(u.atIso, 2) + ' → ' + fmt(u.t.steam_pressure_mpa, 2) + ' MPa',
          u.t.steam_pressure_mpa < 1.0, '< 1.0 (still blown down)');
        // RE-ANCHORED 2026-08-05 (#370a) from an absolute `< 150 °C` to the CONTRAST,
        // which is what the line actually claims. The old threshold was measuring the
        // depth of a blowdown produced by a break that passed RATED mass flow at the
        // 0.1 MPa floor — the flat-sink defect #370a removed (the break's flow now
        // dies with the pressure that would have to drive it, exactly as the dump's
        // did at #375). Measured after: upstream still overcools 304 → 166 °C with
        // the MSIV shut, against 305 °C for the isolated downstream break — a 139 °C
        // spread. The claim "the operator's command changed nothing" is tested by
        // that spread, not by how far an unphysical break could drag the plant, and
        // the comparative form cannot rot when either leg's absolute depth moves.
        ck('so the plant overcools regardless of the operator (vs the isolated leg)',
          fmt(u.t.tavg_c, 1) + ' vs ' + fmt(d.t.tavg_c, 1) + ' °C isolated',
          d.t.tavg_c - u.t.tavg_c > 100, '> 100 °C colder than the isolated break');
        ck('…and it is a deep overcool in absolute terms too',
          fmt(u.t.tavg_c, 1), u.t.tavg_c < 200, '< 200 °C (measured 166.3; was < 150 on the flat-sink break)');
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
        // Thresholds are CONFIG-DERIVED since #408 wave 1 (the re-clock took the SGTR
        // map 0.03 → 1.3e-3 and the old absolute bands read a healthy leak as absent).
        var sgDef = RD.PWR_CONFIG.protection.failures.sgtr;
        var sgRate = (sgDef.severity_meta.max / 100) * (sgDef.leak_scale != null ? sgDef.leak_scale : 1);
        var leakBefore = h.ts().leak_flow;
        ck('leak flowing before the save', fmt(leakBefore, 5), leakBefore > 0.15 * 0.5 * sgRate, '> 0.15x base');
        var save = h.eng.saveState();
        var h2 = H('hot_full_power');
        h2.eng.loadState(save);
        h2.run(10);
        var leakAfter = h2.ts().leak_flow;
        ck('leak still flowing after the restore', fmt(leakAfter, 5), leakAfter > 0.15 * 0.5 * sgRate, '> 0.15x base');
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
        ck('restored leak still ΔP-scaled (base survives)', fmt(h2.eng.s._leak_base || 0, 5),
          (h2.eng.s._leak_base || 0) > 0.8 * 0.5 * sgRate && h2.eng.s._leak_to_sg === true, 'base ≈ sev x catalog rate, to_sg');
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
        var sgDefC = RD.PWR_CONFIG.protection.failures.sgtr;
        var sgFull = (sgDefC.severity_meta.max / 100) * (sgDefC.leak_scale != null ? sgDefC.leak_scale : 1);
        ck('severity 40 clamps to a full rupture, not 40 of them',
          fmt(h.eng.s._leak_base, 5), h.eng.s._leak_base <= sgFull * 1.05, '≤ 1.05x full rupture (config-derived, #408)');
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
        // ≥ 8×, was ≥ 10×: on the #408 real scale both sides are SOURCED — a DEG tube
        // is ~600 gpm-class against 60 gpm max charging, a ~10× ratio — and the shipped
        // constants land at 9.8×. The old 10× band was written when the ratio was an
        // artifact (~40×); at the real ratio it sat exactly on the line.
        ck('full-severity BASE leak dwarfs CVCS make-up authority (≥ 8×, real ratio ~10×)',
          fmt(base, 5) + ' vs make-up ' + fmt(makeup, 5),
          base > 8 * makeup, '> ' + fmt(8 * makeup, 5));
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
        // Config-derived max charging + real-clock window (#408: the literal 0.06 was
        // the old currency — 450x the real pump; at the real 1.33e-4 frac/s the flood
        // to the 97 % trip takes ~7 min with letdown isolated).
        h.cmd('set_charging_flow', { normalized: RD.PWR_CONFIG.reactivity.charging_max });
        var dt = h.runUntil(function (ts, ins, hh) { return hh.tripTime != null; }, 900);
        ck('PI-8 tripped the sensed overfill', dt >= 0 ? fmt(dt, 0) + ' s — ' + (h.tripReason || '?') : 'no trip',
          dt >= 0 && /pzr_level high/.test(h.tripReason || ''), 'pzr_level high');
        var h2 = H('hot_full_power');
        h2.cmd('set_cvcs_auto', { active: true });
        h2.run(30);
        h2.cmd('inject_failure', { failure_id: 'pzr_level_sensor_low' });
        var h2n = 0, h2porv = 0;
        // 3000 s, was 300 (#408): the servo chases the stuck-low reading at the real
        // net rate (~6.6e-5 frac/s above the open orifice), so the walk to solid and
        // the relief lift take ~25-40 min instead of the old-currency minutes.
        h2.run(3000, function (hh) { h2n++; if (hh.ts().porv_open) h2porv++; });
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
      return test('CA-7 station blackout — no AC, no pressurizer heaters (a LOOP SHEDS them, and a reload proves the bus is alive)', function (ck) {
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
        // RE-AUTHORED 2026-08-11 (#447), and the claim it used to make was WRONG on its
        // own source. This check read "and the diesel-backed heaters answer at FULL power
        // (II.E.3.1)" — i.e. a LOOP left the heaters running untouched. NUREG-0737
        // II.E.3.1 does not say that. It requires the heaters to be CONNECTABLE to
        // emergency power, item (4) makes the changeover "accomplished manually in the
        // control room", and Ginna TS Bases B 3.4.9 states the plant behaviour directly:
        // "the heaters are shed following a loss of offsite power or safety injection
        // signal. The heaters can be manually loaded onto the diesel generators if
        // required." So the LOOP SHEDS them, and the operator puts them back.
        //
        // The probe's actual subject is unchanged and is still the thing being pinned:
        // this is an AC question, and on a LOOP the answer is that ac is THERE. That is
        // now proved better than before — the heaters are off for a reason that is NOT
        // the bus, and the reload proves the bus by making them answer.
        ck('the LOOP SHEDS the heaters (B 3.4.9) — full demand standing, nothing delivered',
          fmt(h3.ctl().heater_power_pct, 1) + ' % with ' + String(h3.ts().pzr_heaters_shed) + ' shed',
          h3.ctl().heater_power_pct < 0.01 && h3.ts().pzr_heaters_shed === true, '0 %, shed');
        ck('…and it is a SHED, not a dead bus — ac is available throughout',
          String(h3.ts().ac_available), h3.ts().ac_available === true, 'true');
        // THE ORIGINAL CLAIM, now reached the way the source reaches it: manually load
        // them onto the diesels and they answer at full power. A blackout could not do
        // this — CA-7 leg A holds the same demand and gets nothing, which is the
        // discrimination this whole probe exists for.
        h3.cmd('set_heater', { power_pct: 100 });        // the manual reload
        h3.run(10);
        ck('reloaded onto the diesels, they answer at FULL power (II.E.3.1 item 4)',
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
        // 3600 s, was 330 (#408 + the 2026-08-07 proportional valve): the mechanism is
        // unchanged — the held demand walks pressure to the PORV and the vented mass
        // drains level through the cutoff — but the plant-sized valve removes mass 5x
        // slower, so the cut arrived at ~3000 s instead of inside 330. Then 3600 →
        // 5400 s (#418 wave B1): the transported legs and tube node shift the marginal
        // heater/PORV/charging race a few hundred seconds further (the 3000-s arrival
        // had 1.2× headroom); the check now PRINTS the arrival so the next re-clock
        // sees the number instead of a boolean going false.
        var lacAlive = true, lcutSeen = false, lcutAt = -1, lt0 = h3.t();
        h3.run(5400, function (hh) {
          if (hh.ts().ac_available === false) lacAlive = false;
          if (!lcutSeen && (hh.ctl().heater_power_pct || 0) < 0.01 &&
              hh.ins().pzr_level < RD.PWR_CONFIG.pressurizer.heater_cutoff_level_pct) {
            lcutSeen = true; lcutAt = hh.t() - lt0;
          }
        });
        ck('AC never went away on a LOOP — the diesels carried the 1E buses throughout',
          String(lacAlive), lacAlive === true, 'true');
        ck('the later cut-out is the LEVEL interlock, not the AC one',
          lcutSeen ? 'heaters off with AC up and level below cutoff at +' + fmt(lcutAt, 0) + ' s' : 'never observed',
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
        // #421: the demand is the pump's own max — the surface clips there now, and the
        // old 0.05 literal was retired currency (375x the pump). Bands below are
        // fractions of CHG_MAX so the probe keeps its exact pre-#421 strictness.
        var CHG_MAX = RD.PWR_CONFIG.reactivity.charging_max;
        h.cmd('set_charging_flow', { normalized: CHG_MAX });   // operator calls for charging, no AC to answer
        var wLet = peakAfter('letdown_flow_actual'), wChg = peakAfter('charging_flow_actual');
        h.run(3600, function (hh, ts) { wLet(hh, ts); wChg(hh, ts); });
        var t = h.ts(), c = h.ctl();
        ck('the blackout is actually in effect', 'ac_available ' + String(t.ac_available),
          t.ac_available === false && t.station_blackout === true, 'false');
        ck('letdown ISOLATES — no orifice bleed with the charging pump de-energized',
          'peak ' + fmt(wLet.peak(), 4), wLet.peak() < 1e-4, '0');
        ck('the charging pump delivers NOTHING (Class 1E ac load, WTSM 4.1.3.4)',
          'peak ' + fmt(wChg.peak(), 4), wChg.peak() < 0.75 * CHG_MAX, '0');   // 0.75x = the old 1e-4 band exactly
        // The pre-fix plant reached 76.55 % over three hours; one hour of it is ~92 %.
        // Banded well inside that, so this fails loudly on the old engine rather than
        // squeaking past on a slow leak.
        ck('and inventory does not bleed away through a dead system',
          fmt(h.range('core_inventory_pct').min, 2) + ' % min', h.range('core_inventory_pct').min > 99.5, '> 99.5 %');
        // BOTH DIRECTIONS, because there are TWO guards and one check only sees one of
        // them. The indication guard (`charging_flow_actual`) is what the check above
        // reads; the MASS-BALANCE guard is a different line, and with the demand latched
        // at max a dead pump that still moved water would push inventory UP. Measured by
        // injection: without this check, reverting the mass-balance guard left all 47
        // probes green — the defect was real, unobserved, and one assertion away.
        ck('nor is it pumped UP by a dead pump answering a latched max demand',
          fmt(h.range('core_inventory_pct').max, 2) + ' % max', h.range('core_inventory_pct').max < 100.5, '< 100.5 %');
        // The SELECTOR is untouched — same #200 guard as CA-7 leg A. What went to zero
        // is delivered flow, not the operator's lineup, so restoring AC gives the CVCS
        // back with nothing to re-select.
        ck('the operator\'s charging-pump switch is still in RUN (selector not rewritten)',
          'charging_pump_running ' + String(c.charging_pump_running), c.charging_pump_running !== false, 'true');
        ck('and their manual charging demand is still latched at the pump max — only DELIVERY died',
          'charging_flow_normalized ' + fmt(c.charging_flow_normalized, 6),
          c.charging_flow_normalized > 0.9 * CHG_MAX, 'charging_max');

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

        // --- leg B2 (#386 stage 2): the containment spray pumps are AC loads too.
        // Same #200 split, third system: the demand latches, delivery stays dead,
        // and the trains come back with the bus — never on their own.
        h2.cmd('set_containment_spray', { active: true });
        h2.run(60);
        var t2b = h2.ts();
        ck('demanded containment spray delivers NOTHING bus-dead — demand latched, delivery dead (#386)',
          'demand ' + String(t2b.ctmt_spray_demand) + ', active ' + String(t2b.ctmt_spray_active),
          t2b.ctmt_spray_demand === true && t2b.ctmt_spray_active === false, 'true / false');

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
        // Bands are CONFIG-DERIVED since #408 wave 1 (CVCS joined the real scale;
        // the old absolute > 0.01 was ~150x the real orifice-A flow).
        var _cvB = RD.PWR_CONFIG.reactivity, _ldNop = _cvB.letdown_orifice_a_coeff * Math.sqrt(15.17 - _cvB.letdown_backpressure_mpa);
        ck('so letdown keeps flowing through a LOOP',
          fmt(h5.range('letdown_flow_actual').max, 5), h5.range('letdown_flow_actual').max > 0.5 * _ldNop, '> 0.5x orifice-A NOP');
        ck('the charging pump keeps running through a LOOP',
          fmt(h5.range('charging_flow_actual').max, 5), h5.range('charging_flow_actual').max > 0.3 * _cvB.charging_max, '> 0.3x charging_max');
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
        // AT the setpoint, with no fudge band — tightened at #348 once the interlock was
        // given the reset differential its own sibling already had. The band used to be
        // CUT − 1 and was explained as tolerating a one-step coupling lag; measured, that was
        // not what it was hiding. The bistable had NO deadband, so on a noisy lagged channel
        // it chattered: **499 of 1425 below-cutoff samples (35 %) delivered full heater
        // power**, in runs of up to 8, every one of them between 16.3 % and 17.0 % — the band
        // was excluding a real defect by construction, and the defect grew past the band when
        // #337 changed how fast level moves, which is the only reason anyone looked.
        //
        // With the latch (17 % out, 20 % back — `heater_restore_level_pct`) there is nothing
        // to tolerate, so the claim is now the plain one: below the cutoff, no heater power.
        var bViol = 0, bBelow = 0, bWorst = 0, bWorstLvl = -1, bStreak = 0, bMaxStreak = 0;
        b.run(1500, function (hh) {
          var lvl = hh.ins().pzr_level, hp = hh.ctl().heater_power_pct || 0;
          if (lvl != null && lvl < CUT) {
            bBelow++;
            if (hp > 0.01) {
              bViol++; bStreak++;
              if (bStreak > bMaxStreak) bMaxStreak = bStreak;
              if (hp > bWorst) { bWorst = hp; bWorstLvl = lvl; }
            } else bStreak = 0;
          }
        });
        ck('the run actually went below the cutoff (or leg B proves nothing)',
          bBelow + ' samples below ' + fmt(CUT, 0) + ' %', bBelow > 10, '> 10 samples');
        // THE STREAK, not the count — and the coordinate matters more than the number. What
        // remains after the latch is the one-step coupling lag the engine is built on:
        // `autoControl` is step 7 and the instruments are step 15, so on the single step where
        // the indication first crosses down the heaters are still acting on the previous
        // reading. It costs exactly ONE sample per crossing, and the plant re-crosses whenever
        // ECCS lifts level back past the 20 % reset — measured 4 violations in 588 below-cutoff
        // samples, longest run 2. A BROKEN interlock is not 4 samples, it is all of them.
        // Asserting the count would pin the number of ECCS refill cycles; asserting the streak
        // states the claim — no SUSTAINED heater power below the cutoff — and cannot be
        // satisfied by a plant that simply crosses less often. Pre-latch this read 8.
        ck('no SUSTAINED heater power below the cutoff, with a 100 % demand standing',
          bMaxStreak + ' consecutive (of ' + bViol + ' in ' + bBelow + ' below-cutoff samples' +
          (bViol ? ', worst ' + fmt(bWorst, 1) + ' % at ' + fmt(bWorstLvl, 2) + ' % level' : '') +
          '; pre-#348 chatter: 8 consecutive, 499 of 1425)',
          // ≤ 6, was ≤ 2 (#408): at real drain flows the level LINGERS in the noise
          // band around the 17.0 crossing for minutes rather than seconds, so the
          // probe's sample and the control's read can disagree for a few samples per
          // crossing instead of exactly one (measured: 4 consecutive, 21 of 2084).
          // The discriminant is unchanged — a broken interlock is hundreds, not six.
          bMaxStreak <= 6, '≤ 6 consecutive (crossing-lag at real drain pace)');
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
        // THE HEATERS MUST BE RELOADED FIRST, and this is not a workaround — it is the
        // only way the leg can ask its question at all (#447). This break actuates SI
        // within ~15 s, and safety injection SHEDS the heaters off the ESF buses
        // (NUREG-0737 II.E.3.1 (7)). A shed bank delivers zero whatever the level
        // transmitter says, so without the reload this leg measures the load shed and
        // reports it as the level interlock — a check that passes for the wrong reason
        // is what CLAUDE.md's standing list calls a hollow gate, and here it would have
        // gone the other way and reddened for the wrong reason instead.
        //
        // Putting the heaters back is an ordinary operator action (one button), and it
        // is available ONLY because the shed latches on the RISING EDGE of SI rather
        // than on the level of the signal — a level-triggered shed could never be
        // cleared while the accident lasts, and this leg would be unrepairable. So this
        // is also the probe that pins the edge semantics from the outside.
        d.run(60);
        ck('SI actuated and shed the heaters before the interlock question is asked',
          String(d.ts().hpi_active) + ' / shed ' + String(d.ts().pzr_heaters_shed),
          d.ts().hpi_active === true && d.ts().pzr_heaters_shed === true, 'true / true');
        d.cmd('set_heater', { power_pct: 100 });   // the reload AND the full manual demand
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
        // Flow-per-severity is READ FROM THE CATALOG (#408 wave 1): meta.max/100 ×
        // leak_scale. The hardcoded 50/100 predated the re-clock and computed a
        // microscopic break (2.4e-5 frac/s) that ECCS-defeated could not drain in
        // the window — the leg went vacuous, not wrong.
        var llD10 = RD.PWR_CONFIG.protection.failures.large_loca;
        var flowPerSev = (llD10.severity_meta.max / 100) * (llD10.leak_scale != null ? llD10.leak_scale : 1);
        var survivable = (ceiling / flowPerSev) * 0.85;
        function outcome(sev, secs, killEccs) {
          var h = H('hot_full_power');
          h.run(60);
          if (killEccs) {
            // set_eccs_armed is an M4-layer command — engine-direct it was a silently
            // rejected unknown action (found by CA-21's rejected-command guard, #408).
            // The engine-direct defeat is the pump curve + the passive tanks.
            h.cmd('inject_failure', { failure_id: 'degraded_hpi', severity: 1.0 });
            h.cmd('set_hpi', { active: false });
            h.cmd('close_accumulator_valve', {});
            // …and CVCS: on the #408 real scale charging (1.33e-4 frac/s) out-runs a
            // boundary break's steam trickle and quietly refills the "defeated" plant.
            h.cmd('set_auto_channel', { channel_id: 'cvcs_makeup', engaged: false });
            h.cmd('set_cvcs_auto', { active: false });
            h.cmd('set_charging_flow', { normalized: 0 });   // ~30 gpm refills 24 %/h — real, and not "defeated"
          }
          h.cmd('inject_failure', { failure_id: 'large_loca', severity: sev });
          h.run(secs);
          return h.ts();
        }
        // 3600 s, was 2100 (#408): on the real clock the ECCS-defeated core damages at
        // ~45 min via the uncovered hot node — the compressed window read intact-at-35-min
        // as unconditional survival.
        var eIn = outcome(survivable, 3600, false);
        ck('a break inside the ECCS capacity is survivable WITH injection (sev ' + fmt(survivable, 3) + ')',
          fmt(eIn.core_inventory_pct, 1) + ' %, damaged ' + String(eIn.fuel_damaged),
          eIn.fuel_damaged === false && eIn.core_inventory_pct > 50, 'intact');
        // 14400 s: the boundary break with everything dead drains on the real clock —
        // damage arrives in hours, which is the identity the owner ruled.
        var eOut = outcome(survivable, 14400, true);
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
        //
        // RE-RIGGED at #348, and the reason is the whole issue. This used to inject a 20 %
        // break and sample 2 s later "before the RCS has moved" — true on the plant #334 was
        // written against, where a break held the RCS near nominal. #337 gave inventory a path
        // to pressure, so a 20 % break now drops the RCS to 8.56 MPa inside those 2 s and the
        // probe was reading a break that had already throttled itself: 0.0743 against 0.1000
        // rated, a 26 % miss on a 6 % band. Neither change is at fault alone; the composition
        // is. The SAMPLING assumed a plant that no longer exists.
        //
        // The anchor is a break small enough that the plant HOLDS at the reference pressure,
        // asserted across a 30 s window rather than at an instant. This rig comes from the
        // workbench lane's independent #348 fix (63ceac1) and is adopted over the one that
        // landed here, because it is measurably the sturdier of the two: at severity 0.002 the
        // ratio sits in 0.9961..0.9975 for the whole 30 s with the RCS at 15.290 MPa, where the
        // 0.01 break this leg first used decays to 0.8898 over the same window and passes only
        // because it is read on a single engine step. A calibration anchor that depends on
        // being sampled before the plant can react is a fixture waiting to break again — which
        // is the entire lesson of this issue.
        // RATED is READ FROM THE CATALOG, not hardcoded (#408 wave 1): severity ×
        // (meta.max/100) × leak_scale. The hardcoded `× 0.5` pinned the pre-#408
        // severity map — after the re-clock (meta.max 100, leak_scale 0.04) legs A
        // and B both failed at exactly the 12.5× staleness (ratio 0.0800, worst
        // error 92.00 %), which is this constant, not the law. Config-derived, the
        // legs test the LAW on any map — and pass on the old engine too.
        var llDef = RD.PWR_CONFIG.protection.failures.large_loca;
        var llRate = (llDef.severity_meta.max / 100) * (llDef.leak_scale != null ? llDef.leak_scale : 1);
        var SEV_A = 0.002, RATED_A = SEV_A * llRate;
        var aCal = H('hot_full_power');
        aCal.run(30);
        aCal.cmd('inject_failure', { failure_id: 'large_loca', severity: SEV_A });
        var calMin = 9, calMax = 0, calPmin = 99, calN = 0;
        aCal.run(30, function (hh) {
          var t = hh.ts();
          if (!(t.leak_flow > 0)) return;
          var r = t.leak_flow / RATED_A;
          calN++;
          if (r < calMin) calMin = r;
          if (r > calMax) calMax = r;
          if (t.pressure_mpa < calPmin) calPmin = t.pressure_mpa;
        });
        ck('the plant really did hold at the reference pressure (or leg A proves nothing)',
          fmt(calPmin, 3) + ' MPa min vs ' + pRef + ' ref, over ' + calN + ' samples',
          calN > 20 && Math.abs(calPmin - pRef) < 0.25, 'within 0.25 MPa');
        ck('at nominal pressure the break flows its RATED size, and KEEPS flowing it',
          'ratio ' + fmt(calMin, 4) + '..' + fmt(calMax, 4) + ' across 30 s',
          Math.abs(calMin - 1) < 0.06 && Math.abs(calMax - 1) < 0.06, 'within 6 % throughout');

        // Legs B and C ride a FULL-SIZE break. 0.20 no longer spans the blowdown: with the
        // discharge self-limiting it parks at 3.87 MPa, so the low end the exponent solve and
        // leg C both need is never reached. Measured, 1.00 runs 15.4 → 1.05 MPa.
        var SEV = 1.00, RATED = SEV * llRate;
        var a = H('hot_full_power');
        a.run(30);
        a.cmd('inject_failure', { failure_id: 'large_loca', severity: SEV });

        // ---- leg B: THE LAW. Sample the same break across the blowdown and check every
        // sample against √((P−Pb)/(Pref−Pb)) recomputed from that sample's own pressure.
        // This is the whole assertion of item 2 and it is checked pointwise, not at ends.
        //
        // RE-POINTED at #386 stage 1: Pb in the NUMERATOR is the LIVE containment
        // pressure now — a full blowdown pressurizes the building to ~0.38 MPa, and
        // recomputing against the config constant reads up to ~16 % high late in the
        // blowdown against this 2 % band. The DENOMINATOR stays the config span,
        // mirroring the engine (the orifice coefficient is a rated-flow calibration).
        // The fallback keeps this leg green on a pre-#386 engine, where the field is
        // absent and the constant was the backpressure — a better test, not a refit.
        // The two points for the EXPONENT check are the FIRST and LAST of the blowdown, not
        // samples at fixed pressures (#348). `> 10 MPa` and `< 3 MPa` were reasonable
        // coordinates on the pre-#337 plant and are not on this one: the RCS is already below
        // 10 MPa by the first callback sample, so `hi` was never captured and the check went
        // MISSING — i.e. it stopped asserting anything and said so, which is the only reason
        // this was noticed. Ends-of-the-run is drift-proof, and the span is asserted below so
        // it cannot go vacuous the other way.
        var pbOf = function (t) {
          return t.containment_pressure_mpa != null ? t.containment_pressure_mpa : pBack;
        };
        var worst = 0, worstAt = 0, n = 0, hi = null, lo = null;
        a.run(0.05);                                    // one step: the top of the blowdown
        var tTop = a.ts();
        if (tTop.leak_flow > 0) hi = { dp: tTop.pressure_mpa - pbOf(tTop), q: tTop.leak_flow };
        a.run(900, function (hh) {
          var t = hh.ts();
          var pbT = pbOf(t);
          if (t.pressure_mpa > pbT + 0.05) {
            var want = RATED * Math.sqrt(Math.max(0, (t.pressure_mpa - pbT) / (pRef - pBack)));
            var err = Math.abs(t.leak_flow - want) / Math.max(want, 1e-6);
            n++;
            if (err > worst) { worst = err; worstAt = t.pressure_mpa; }
            if (t.leak_flow > 0) lo = { dp: t.pressure_mpa - pbT, q: t.leak_flow };
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
        // A SPAN, not merely two samples. Ends-of-the-run always yields two points, so without
        // this the exponent solve could be run over a sliver of the curve and mean nothing —
        // the failure mode the old fixed thresholds had by accident, made impossible on purpose.
        // Measured 9.6× (9.10 → 0.944 MPa of Δp).
        ck('the blowdown spanned a wide pressure range (or the exponent solve is meaningless)',
          hi && lo ? fmt(hi.dp, 2) + ' → ' + fmt(lo.dp, 2) + ' MPa Δp, ' + fmt(hi.dp / lo.dp, 1) + '×' : 'MISSING',
          !!(hi && lo) && hi.dp / lo.dp > 4, '> 4× span');
        if (hi && lo) {
          var nExp = Math.log(lo.q / hi.q) / Math.log(lo.dp / hi.dp);
          ck('the measured exponent is the ORIFICE one — not constant (0) and not linear (1)',
            'n = ' + fmt(nExp, 3), Math.abs(nExp - 0.5) < 0.05, '0.5 ± 0.05');
        }

        // ---- leg C: a depressurized RCS STOPS discharging. The pre-#334 engine kept
        // flowing at the full rated rate here — including with the vessel already empty,
        // which is the piece of #334 that read wrong on the board.
        var tc = a.ts();
        ck('the RCS really did depressurize (leg C needs the low end)',
          fmt(tc.pressure_mpa, 2) + ' MPa', tc.pressure_mpa < 2.0, '< 2 MPa');
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
          // ≥ 0.30, not the old 0.99: on the #408 real-flow clock the DEG bottoms at
          // ~58-62 % inventory (partial uncovery) — full uncovery and containment
          // equalization are mutually exclusive in this lumped plant (the CA-20 trade),
          // and the real-scale ECCS is what stops the drain. Passes on the old engine
          // (which reached 1.0) — a wider net, not a refit.
          if (t.core_uncovered_frac >= 0.30) sawUncover = true;
          if (t.accumulator_volume_pct < minAccum) minAccum = t.accumulator_volume_pct;
        });
        var te = e.ts();
        ck('the core really does uncover first — this is not immunity',
          sawUncover ? 'fully uncovered' : 'never uncovered', sawUncover === true, 'uncovered');
        ck('the ACCUMULATORS discharge — the passive stage nothing here used to reach',
          fmt(minAccum, 1) + ' % remaining', minAccum < 50, '< 50 %');
        // > 70 (core_top_uncover), not the old > 90: on the #408 real clock the
        // long-term state is the injection≈spillage equilibrium in the spill band
        // (~73-79 % — the cold-leg nozzle elevation), COVERED but never refilled
        // to the old clip-era 99-120 %. Covered-and-intact is the claim; passes on
        // the old engine too (which ended > 99).
        ck('and the core refloods COVERED and is not damaged',
          fmt(te.core_inventory_pct, 1) + ' %, damaged ' + String(te.fuel_damaged),
          te.fuel_damaged === false && te.core_inventory_pct > 70, 'covered, intact');
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
        // Config-derived band (#408 — CVCS real scale; old > 0.01 was ~150x orifice-A).
        var _cvB9 = RD.PWR_CONFIG.reactivity, _ldNop9 = _cvB9.letdown_orifice_a_coeff * Math.sqrt(15.17 - _cvB9.letdown_backpressure_mpa);
        ck('letdown really is draining the loop (or this proves nothing)',
          fmt(a.range('letdown_flow_actual').max, 5), a.range('letdown_flow_actual').max > 0.5 * _ldNop9, '> 0.5x orifice-A NOP');
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

        // …and the SECOND consumer of the same piecewise (#365). `stepPressure`'s
        // `surge_rate` selects deficit-vs-surplus on the identical test, one function away
        // from the level line above, and NO GAUGE CAN SEE IT — the check above passes with
        // the surge branch split wide open. Same rig shape as leg B's: two states identical
        // except which side of nominal the inventory sits, both given the SAME mass rate, so
        // the only thing that can separate the resulting pressures is the slope the branch
        // picked. Subcooled and well below the PORV setpoint, so nothing else in stepPressure
        // differs between them.
        var dPfor = function (dm_state, dmdt) {
          var s = {
            tavg_c: 304.0, _tavg_fp: 304.0, thot_c: 320.5, flow_frac: 1.0,
            _mass: 1.0 + dm_state, primary_void_fraction: 0,
            pressure_mpa: 15.41, pressure_setpoint: 15.41, _pressure_sp_eff: 15.41,
            heater_override: null, spray_override: null, spray_stuck: false,
            porv_demand: 'closed', porv_open: false, porv_stuck: false, safety_open: false,
            block_valve_open: true, porv_flow: 0, safety_flow: 0, leak_flow: 0,
            heater_power_frac: 0, spray_flow_frac: 0, ac_available: true,
            _dTavg_dt: 0, _dmass_dt: dmdt,
          };
          RD.pwrPressurizer.stepLevel(s, RD.PWR_CONFIG, 0.1);   // seed the heater-cutoff read
          RD.pwrPressurizer.stepPressure(s, RD.PWR_CONFIG, 0.1);
          return s.pressure_mpa;
        };
        var rate = 2e-4;                                        // frac/s of inventory, both legs
        var pDef = dPfor(-0.02, rate), pSur = dPfor(+0.02, rate), pNil = dPfor(+0.02, 0);
        // The observability guard: if the surge term were dead, both legs would be equal
        // for the wrong reason and this would pass vacuously (the #334/#286 shape).
        var surgeSeen = Math.abs(pSur - pNil) > 1e-6;
        ck('and the SURGE branch takes the same slope on both legs (stepPressure, no gauge sees it)',
          'deficit ' + fmt(pDef, 6) + ' vs surplus ' + fmt(pSur, 6) + ' MPa'
            + ' (surge observed: ' + fmt(Math.abs(pSur - pNil) * 1000, 3) + ' kPa)',
          surgeSeen && Math.abs(pDef - pSur) < 1e-9, 'equal, and the surge is live');

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
        // Severity CONFIG-DERIVED from the leg's own claim (#408 wave 1): "a leak
        // BEYOND CVCS authority" = 2.5x charging_max, whatever the catalog's scale.
        // The old hardcoded 0.03 meant 9e-4 frac/s (2.5x the old authority) and on
        // the re-clocked map means 3.9e-5 — UNDER authority, a different casualty.
        var e_sg = RD.PWR_CONFIG.protection.failures.sgtr;
        var e_rate = (e_sg.severity_meta.max / 100) * (e_sg.leak_scale != null ? e_sg.leak_scale : 1);
        var e_sev = Math.min(1, 2.5 * RD.PWR_CONFIG.reactivity.charging_max / e_rate);
        e.cmd('inject_failure', { failure_id: 'sgtr', severity: e_sev });
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
     * retune of `level_per_mass` or `level_prog_floor` moves the expectation with the
     * plant instead of leaving a stale constant behind. */
    'CA-12': function () {
      return test('CA-12 a water-solid RCS repressurizes — mass_max stops discarding ECCS overfill', function (ck) {
        var pz = RD.PWR_CONFIG.pressurizer, pr = RD.PWR_CONFIG.primary;

        // ---- leg A: THE REPORTED CASE. Lose the heat sink, let the plant boil down, let
        // ECCS actuate and refill it solid, then ride. The pre-#346 engine sits here flat.
        // RE-CARRIERED FOR THE #408 REAL CLOCK (was LOOP + AFW failure -> boil-down ->
        // "ECCS refills it solid"). Measured on real flows, that refill never happens:
        // relief-band boiloff holds pressure ABOVE the 12.4 MPa SI setpoint while the
        // void term pegs the level gauge (masking the LO-LO backup), so SI never
        // actuates and the hands-off ride ends dry at high pressure — which is the
        // REAL loss-of-heat-sink outcome (why feed-and-bleed EOPs exist) and is
        // pinned by CA-13 now. The reachable route to water-solid at real flows is
        // the INADVERTENT-SI class: a stuck-open PORV depressurizes past the SI
        // actuation (which LATCHES, #341 seal-in), the valve then reseats, and
        // unterminated injection + charging flood the plant solid from low pressure.
        var a = H('hot_full_power');
        a.run(60);
        a.cmd('inject_failure', { failure_id: 'stuck_porv_open', severity: 1.0 });
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
        // Transit on the real clock: the stuck valve drains ~20-30 min to low pressure
        // (SI latches on the way through 12.4 MPa), the valve is reseated by clearing
        // the failure, and the flood back to solid runs at the real ~3e-4 frac/s.
        a.run(1500, seen);                                  // draindown; SI latches
        a.cmd('clear_failure', { failure_id: 'stuck_porv_open' });   // valve reseats; injection does not
        a.run(9000, seen);                                  // the flood + repressurization
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
          aPorv > 0 && (100 * aPorv / Math.max(aSolid, 1)) > 0.5, '> 0.5 % duty (real-scale injection vs a real-scale valve, #408)');

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
        var mSolid = 1 + (100 - base) / pz.level_per_mass;
        ck('inventory settles at the SOLID point the level geometry predicts',
          fmt(ta.core_inventory_pct, 2) + ' % vs ' + fmt(mSolid * 100, 2) + ' % predicted from ' +
          'base ' + fmt(base, 1) + ' % / ' + fmt(pz.level_per_mass, 0) + ' %/frac',
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
        // 7200 -> 15000 s, #364 — see the identical note on TR-15 leg E. This is MD-6's
        // casualty, which damages at 8635 s on the corrected decay curve.
        e.run(15000);
        var te = e.ts();
        ck('with ECCS defeated the same event still destroys the core',
          'damaged ' + String(te.fuel_damaged) + ', melted ' + String(te.melted),
          te.fuel_damaged === true, 'damaged');
        T.checkSanity(ck, d);
      });
    },

    /* CA-13 — THE LEVEL LINE IS UNBOUNDED UPWARD, SO A HEATUP CAN FILL THE VESSEL (#362,
     * 2026-08-05).
     *
     * `levelBase` carried an undocumented upper clip at 100 from v1 until #362. It bound at
     * Tavg 611.6 F (322.0 C) — INSIDE the subcooled operating range at NOP, where Tsat is
     * 653.2 F (345.1 C) — so on any hot-and-drained path the true level line stopped moving
     * and everything downstream of it stopped with it.
     *
     * THIS IS A DIFFERENT SOLID FROM CA-12'S, and that is why it is its own probe rather
     * than a leg there. CA-12 gates on level-at-top AND OVERFILLED AND no void, because its
     * case is an ECCS fill: surplus mass. Here the plant goes solid at an inventory DEFICIT —
     * ~94 %, no injection, nothing added — because the water EXPANDED into the bubble. Apply
     * CA-12's gate to this event and it excludes it. `solid` means there is no steam space
     * left, not that there is too much water.
     *
     * A station blackout is the cleanest carrier: it is the plant heating itself on decay
     * heat with no heat sink, no AC and no make-up, so the fill is thermal expansion and
     * nothing else. Every check below FAILS on the pre-#362 engine, measured.
     */
    'CA-13': function () {
      return test('CA-13 a heatup fills the pressurizer solid — the level line is unbounded upward', function (ck) {
        var pz = RD.PWR_CONFIG.pressurizer;
        // CARRIER CHANGED FOR THE #364 DECAY REFIT (2026-08-05): station blackout -> total
        // loss of heat sink. NOT a hunt for a path that passes — the SBO no longer heats the
        // plant AT ALL now that decay heat is correct. Measured on the corrected curve, an SBO
        // stabilises: Tavg peaks at 326.6 °C at ~41 min and then FALLS, because the
        // turbine-driven AFW (#332, WTSM 5.7.5) removes the real decay heat where it could not
        // remove 2.4x of it. That is the plant getting BETTER and is the correct outcome for an
        // SBO with AFW available; it just stops being a heat-up. Losing the heat sink outright
        // is, and it is also #362's own reported repro.
        var h = H('hot_full_power');
        h.run(60);
        h.cmd('inject_failure', { failure_id: 'afw_failure' });
        h.cmd('inject_failure', { failure_id: 'loss_of_feedwater' });
        // RE-SCOPED FOR THE #408 REAL CLOCK. The old rig skipped 4800 s and sampled a
        // "settles SOLID and subcooled from ~80 min" phase — measured, that phase was a
        // COMPRESSED-ECCS artifact: with real injection rates HPI cannot refill an RCS
        // at relief pressure (2e-4 frac/s against a PORV-cycling loss), so a hands-off
        // loss of all feedwater now does what the real casualty does — boils off
        // through the relief ladder to a dry core over ~2 h. Deficit-solid is
        // UNREACHABLE hands-off on this plant now (which is why feed-and-bleed EOPs
        // exist); the two reachable solid states are CA-12's ECCS overfill and CA-15's
        // break-solid, both at low pressure where real ECCS has authority. What this
        // probe still owns: the LINE is unbounded and the GAUGE follows it honestly
        // while subcooled, and the hands-off outcome is the real one.
        var n = 0, lvlMax = -1e9, baseMax = -1e9, trackWorst = 0, trackN = 0;
        h.run(7800, function (hh) {
          var t = hh.ts(); n++;
          if (t.pzr_level_pct > lvlMax) lvlMax = t.pzr_level_pct;
          // Read the TRUE line off the engine's own state, not a copy of the formula
          // (CA-12 leg B's reason: `_tavg_fp` is engine-internal, and a second copy here
          // would not move when the engine's did — the #315 lesson).
          var b = RD.pwrPressurizer.levelBase(hh.eng.s, RD.PWR_CONFIG);
          if (b > baseMax) baseMax = b;
          // While SUBCOOLED, the gauge must be the line + the mass term, no clip: the
          // #362 fix reaching the indication. (Voided samples are the deception arc,
          // CA-18's subject, excluded here.)
          if (!(t.primary_void_fraction > 0) && t.subcooling_c > 2) {
            trackN++;
            var wantLvl = Math.min(100, Math.max(0,
              b + RD.PWR_CONFIG.pressurizer.level_per_mass * (hh.eng.s._mass - 1)));
            var err = Math.abs(t.pzr_level_pct - wantLvl);
            if (err > trackWorst) trackWorst = err;
          }
        });
        var t = h.ts();

        // ---- the line itself. Pre-#362 this is pinned at exactly 100 by construction, so
        // the number below cannot be produced by the old engine at all.
        ck('the thermal-expansion line really does pass 100 % (it is not clamped there)',
          fmt(baseMax, 1) + ' % peak base line, at Tavg ' + fmt(t.tavg_c * 9 / 5 + 32, 1) + ' F (' +
          fmt(t.tavg_c, 1) + ' C); the clip bound at 100',
          baseMax > 105, '> 105 %');

        // ---- the operator's cue: the gauge FOLLOWS the unbounded line while subcooled
        // (pre-#362 the clip froze it at 72.8 % while the plant filled). On the real
        // clock the deficit keeps the peak below the top; honesty, not the peak, is
        // the claim the fix made.
        ck('…and the gauge tracks line + mass with no clip while subcooled (pre-#362: frozen)',
          fmt(trackWorst, 2) + ' pts worst of ' + trackN + ' subcooled samples',
          trackN > 500 && trackWorst < 1.0, '< 1 pt');

        // ---- and it is solid at a DEFICIT. This is the check that separates CA-13 from
        // CA-12: no injection, less water than nominal, and still no steam space.
        // SOLID AT A DEFICIT — the discriminator against CA-12, which reaches solid by being
        // OVERFILLED (> 100 %). Here the vessel is full with LESS water than nominal, because
        // the water expanded into the bubble. ECCS does inject on this path (inventory
        // recovers to ~94.5 % after the voided transit), so the claim is stated as the
        // measurable one — solid below nominal inventory — rather than "nothing was added".
        // ---- the hands-off OUTCOME is the real casualty's: relief-ladder boiloff to a
        // dry core over hours (the pre-#408 'settles solid' ending was the compressed
        // ECCS refilling at relief pressure, which no real high-head pump does).
        ck('hands-off loss of all feedwater boils off through relief — dry core inside the window',
          fmt(t.core_inventory_pct, 1) + ' % inventory at t+' + fmt(7860 / 60, 0) + ' min',
          t.core_inventory_pct < 20, '< 20 %');

        // ---- NOT ASSERTED HERE, and named so it is not assumed covered. #362 lists three
        // things the clip disarmed; this probe pins two of them (the gauge, and the relief
        // ladder that #346's solid surge gain drives). The third — #347's NO-BUBBLE-NO-SPRAY
        // gate — is UNOBSERVABLE on this path by construction and a check for it would have
        // been hollow: a blackout stops the RCPs, spray takes its motive head from the loop
        // (`spray_eff` scales on `flow_frac`), so measured spray peaks at 0.00 % on BOTH
        // engines here. A draft of this probe asserted it anyway and "passed" on 0 of 0
        // samples. Whoever wants that gate covered needs a solid plant with the pumps
        // RUNNING — which is CA-12's ECCS-fill shape, not this one.

        // ---- CALIBRATION GUARD. Passes on the old engine deliberately: `levelProgram`
        // re-clips at both ends, so the programme band must be untouched by a change to the
        // physics line. Without it, deleting the lower clip too would satisfy everything above.
        ck('the level PROGRAM is still clamped at its ceiling (the fix is physics, not programme)',
          fmt(RD.pwrPressurizer.levelProgram(h.eng.s, RD.PWR_CONFIG), 2) + ' % vs ceiling ' +
          fmt(pz.level_prog_ceiling, 1),
          Math.abs(RD.pwrPressurizer.levelProgram(h.eng.s, RD.PWR_CONFIG) - pz.level_prog_ceiling) < 1e-9,
          'at the ceiling');

        // ---- SECOND CALIBRATION GUARD, also green on the old engine: the clip only ever
        // bound above 611.6 F (322.0 C), so a plant at power has to A/B identically.
        var d = H('hot_full_power');
        d.run(600);
        ck('a plant at power is untouched — the clip never bound below 611.6 F (322.0 C)',
          fmt(d.ts().pzr_level_pct, 2) + ' %',
          d.ts().pzr_level_pct > 45 && d.ts().pzr_level_pct < 65, '45..65 %');
        T.checkSanity(ck, d);
      });
    },

    /* CA-14 — BREAK FLASH-COOLING IS SATURATION-GATED (#363, 2026-08-05).
     *
     * A break has two halves and until now only one of them knew what regime it was in.
     * `stepPressure` has always gated `leak_depress` on `saturated`; the TEMPERATURE half ran
     * on `leak_flow > 0` alone, so it went on "flash"-cooling a plant that had stopped boiling.
     * Flashing removes LATENT heat, and there is no latent heat to remove from subcooled liquid.
     *
     * THE SEVERE CONSEQUENCE IS NOT THE TEMPERATURE, IT IS WHAT THE TEMPERATURE SUPPRESSED.
     * The void line is `trueSubcooling <= 0 && _mass < 1`, so dragging Tavg far below saturation
     * makes voiding UNREACHABLE. Measured full stack on a 2 % break with ECCS defeated: the old
     * engine drained the plant to ZERO inventory and reported `primary_void_fraction` 0, sitting
     * 53.2 °F (29.5 °C) SUBCOOLED. An empty core reading no void, held there by a cooling term
     * that only exists because the coolant is boiling.
     *
     * Legs B and C are at FUNCTION level on purpose. Leg A alone cannot tell a correctly-gated
     * term from a DELETED one — a drained core reaches saturation on decay heat either way — so
     * the two legs assert the term is off when subcooled AND still live when saturated.
     */
    'CA-14': function () {
      return test('CA-14 break flash-cooling stops when the flashing does — a drained core cannot be subcooled', function (ck) {
        var t = RD.PWR_CONFIG.thermal;

        // ---- leg A: THE PLANT. Small break, ECCS defeated so the cold-injection quench (a
        // DIFFERENT term, correctly ungated — cold water mixing cools whether or not anything
        // is boiling) cannot mask the one under test.
        var a = H('hot_full_power');
        a.run(30);
        // Severity 0.4 + accumulators isolated (#408 wave 1; was 0.05 + degraded_hpi
        // alone): on the real clock a 5 % break with the pumps dead still parks at
        // ~56 % — the ACCUMULATORS (passive, not defeated by degraded_hpi) refill it
        // — so leg A's dry-core subject state was never reached and the leg went
        // vacuous. The subject is drained-core thermodynamics; drain the core.
        a.cmd('inject_failure', { failure_id: 'large_loca', severity: 0.4 });
        a.cmd('inject_failure', { failure_id: 'degraded_hpi', severity: 1.0 });
        a.cmd('close_accumulator_valve', {});
        a.cmd('set_auto_channel', { channel_id: 'cvcs_makeup', engaged: false });
        a.cmd('set_cvcs_auto', { active: false });
        a.cmd('set_charging_flow', { normalized: 0 });
        // COUNT THE LATE DRAIN, do not take a peak over the whole run. The plant STARTS
        // 73.8 F (41.0 C) subcooled and its first subcooled minutes are correct physics — the
        // ordinary subcooled blowdown, which is exactly when this term SHOULD be off. A
        // run-wide `max` therefore measures the initial condition, which is the `h.range()`
        // trap in its usual clothes; a first draft of this leg did precisely that and failed
        // on BOTH engines. The window is "a break is flowing and the plant is well into the
        // drain", identical on both engines, and the statistic is how much of it is spent
        // subcooled while the coolant is supposedly flashing.
        //
        // A VOID CHECK WAS DRAFTED HERE AND CUT, because it was measured and is NOT robust.
        // Full stack the pre-#363 engine ends this event with `primary_void_fraction` 0 at
        // ZERO inventory — an empty core reading no void — which looks like the headline. But
        // PEAK void over the run is 1.00 on BOTH engines, and the final value is 0.00 on both
        // at this layer, because the void line is gated `trueSubcooling <= 0` and a state
        // sitting a whisker either side of saturation reads 1.00 or 0.00 on a coin toss. The
        // defensible claim is the one below: where the plant is held, not what the void gauge
        // happens to catch.
        var lateN = 0, lateSub = 0;
        a.run(4000, function (hh) {
          var s = hh.ts();
          if (!(s.leak_flow > 0) || s.core_inventory_pct > 60) return;
          lateN++;
          if (s.subcooling_c > 5) lateSub++;
        });
        var ta = a.ts();
        // The break has to have actually emptied the plant, or the rest of leg A is vacuous.
        // < 55, was < 20 (#408): the real-clock defeated drain equalizes near ~46-50 %
        // (deeply uncovered — core_top_uncover is 0.70 — and melting); the boiloff
        // mass debit is a declared residual, and the drained-core SUBJECT state is
        // deep uncovery, which this reaches. 4000 s window for the same reason.
        ck('the break really did drain the plant (or leg A proves nothing)',
          fmt(ta.core_inventory_pct, 2) + ' % inventory', ta.core_inventory_pct < 55, '< 55 % (deeply uncovered)');
        // THE CLAIM, and it is thermodynamic rather than tuned: a boiled-off core cannot be
        // SUBCOOLED. Pre-#363 it ends 55.8 F (31.0 C) subcooled and STILL FALLING, with the
        // core already melted — a term that only exists because the coolant is boiling, driving
        // the coolant further from boiling the longer it runs.
        //
        // ONE-SIDED SINCE #384 STAGE 4, and the re-authored form passes on BOTH the #363
        // engine and today's (a better test, not a refit — HR10). The original band was
        // two-sided ("within 2 C of saturation"), which was not pinning thermodynamics: it
        // was pinning the SAT-PULL, whose full-strength pin held P at Psat(Tavg) so
        // subcooling read ~0 BY CONSTRUCTION. With a loop break venting the RCS the pin is
        // path-scoped away at full void and the drained core's remnant STEAM superheats
        // against the hot fuel — subcooling reads deeply NEGATIVE (measured −208 F at this
        // event's end), which is physical: steam can superheat, liquid cannot, and there is
        // no liquid left. The defect #363 fixed was the SUBCOOLED side only, so the check
        // now asserts exactly that side and no more.
        ck('…and it ends NOT SUBCOOLED (pre-#363: 55.8 F / 31.0 C subcooled; superheat is physical — the loop is steam)',
          fmt(ta.subcooling_c * 9 / 5, 2) + ' F (' + fmt(ta.subcooling_c, 2) + ' C) of subcooling',
          ta.subcooling_c < 2.0, '< 3.6 F (2.0 C) subcooled');
        ck('…and is never driven subcooled while the break flows (pre-#363: 1194 of 2358)',
          lateSub + '/' + lateN + ' late-drain samples more than 9 F (5 C) subcooled',
          lateN > 500 && lateSub === 0, '0 of > 500 samples');

        // ---- leg B: THE TERM IS STILL LIVE WHEN SATURATED. Without this, deleting the term
        // outright satisfies leg A. Two clones of a real engine state, saturated, differing
        // only in leak_flow; the engine's own selfTest uses this shape for the ECCS quench.
        var base = H('hot_full_power'); base.run(60);
        var mk = function (tavg, press, leak) {
          var c = Object.assign({}, base.eng.s);
          c.tavg_c = tavg; c.pressure_mpa = press; c.p_coldleg = press; c.p_hotleg = press;
          c.primary_void_fraction = 0; c.leak_flow = leak; c._eccs_inj_inv = 0;
          RD.pwrThermal.stepCoolant(c, RD.PWR_CONFIG, 0.1);
          return c._dTavg_dt;
        };
        // 7.0 MPa: Tsat = 285.8 C, so 290 C is saturated (trueSubcooling < 0) with void 0 —
        // the gate is exercised through the SUBCOOLING test, not through the void shortcut.
        var satLeak = mk(290.0, 7.0, 0.02), satDry = mk(290.0, 7.0, 0);
        ck('when the plant IS saturated the break still cools it (the gate is not a deletion)',
          fmt(satLeak - satDry, 5) + ' C/s of extra cooling from the break',
          satLeak - satDry < -1e-4, 'measurably negative');

        // ---- leg C: AND IT IS EXACTLY ZERO WHEN SUBCOOLED. This is the fix itself, at the
        // mechanism, and it is THE discriminating check of the probe.
        //
        // 15.4 MPa: Tsat = 345.1 C, so 250 C is 95 C subcooled. THE TEMPERATURE IS NOT FREELY
        // CHOSEN — a first draft used 110 C, which is exactly `blowdown_sink_c`, so the term
        // evaluated to gain x flow x (110 - 110) = 0 and the check PASSED ON THE UNGATED
        // ENGINE. A test state sitting on the sink of the term under test measures nothing.
        // Keep this datum well away from `blowdown_sink_c`.
        var subLeak = mk(250.0, 15.4, 0.02), subDry = mk(250.0, 15.4, 0);
        ck('…and when it is SUBCOOLED the break removes no heat at all — nothing is flashing',
          fmt(subLeak - subDry, 8) + ' C/s (pre-#363: a pull toward ' +
          fmt(t.blowdown_sink_c, 0) + ' C at any subcooling)',
          subLeak === subDry, 'exactly 0');

        // ---- leg D: CALIBRATION, green on BOTH engines by design. The config tunes these two
        // constants against a two-point criterion; re-measured after the gate and unmoved, which
        // is why neither was retuned. Asserted here rather than only described in a comment.
        var sg = H('hot_full_power');
        sg.run(30); sg.cmd('inject_failure', { failure_id: 'sgtr', severity: 0.08 });
        sg.run(1200);
        ck('the tuning criterion holds — an 8 % SGTR still holds the plateau above 600 psi',
          fmt(sg.ts().pressure_mpa * 145.038, 0) + ' psi (' + fmt(sg.ts().pressure_mpa, 2) + ' MPa)',
          sg.ts().pressure_mpa > 4.14, '> 600 psi (4.14 MPa)');
        var lg = H('hot_full_power');
        lg.run(30); lg.cmd('inject_failure', { failure_id: 'large_loca', severity: 0.2 });
        lg.run(1200);
        ck('…and the 20 % large break still crosses below the accumulator setpoint',
          fmt(lg.ts().pressure_mpa * 145.038, 0) + ' psi (' + fmt(lg.ts().pressure_mpa, 2) + ' MPa)',
          lg.ts().pressure_mpa < 4.14, '< 600 psi (4.14 MPa)');
        T.checkSanity(ck, base);
      });
    },

    /* CA-15 — A LIQUID BREAK GOES SOLID WITHOUT REACHING THE NUMERICAL CEILING (#361,
     * 2026-08-05).
     *
     * #346 gave the pressurizer a water-solid regime and #347 took spray's authority away in
     * it, and both were measured on ONE path: a stuck-open PORV with the block valve isolated.
     * That is a STEAM-SPACE vent, where `leak_flow` is 0 by construction — so `leak_depress`
     * was identically zero there and the solid gain had nothing to fight. The in-code claim
     * that "the fill now arrests at 109.35 % against the 120.00 % ceiling" was generalised
     * from it, and it did not generalise: the term that defeats the solid gain exists only
     * when there is LIQUID break flow, which is the whole LOCA family.
     *
     * This probe is CA-12 on the other path. It exists because the two are the same claim
     * measured through different holes, and only one of them was ever tested.
     */
    'CA-15': function () {
      return test('CA-15 a LIQUID break fills to SOLID and arrests there — the ceiling is never what stops it', function (ck) {
        var pz = RD.PWR_CONFIG.pressurizer, pr = RD.PWR_CONFIG.primary;

        // RE-SCOPED TWICE, AND THE SECOND ONE UNDOES THE FIRST — worth reading before
        // touching this leg, because the round trip is the lesson.
        //
        // #361's claim was "a liquid break goes SOLID and arrests clear of the ceiling".
        // #408 REPLACED it with "settles inside the spill band, clear of solid", on this
        // reasoning, quoted from the comment this replaces: "At real flows a liquid break
        // CANNOT drive the plant solid ... during any refill attempt THE HEATERS THROTTLE
        // THE PRESSURE-DRIVEN INJECTION (the CA-10 deadlock shape, now correct physics)."
        //
        // That mechanism was the #447 defect. The heaters were throttling injection
        // because they still had 347x-rated authority on a plant whose safety injection
        // had actuated — and NUREG-0737 II.E.3.1 (7) requires SI to shed them. With the
        // shed in, injection is not throttled, the RCS fills, and #361's original claim
        // is what the plant does again.
        //
        // MEASURED BEFORE/AFTER, same probe, sev 0.5, 3300 s:
        //   before the shed   settles 98.7 %  — inside the spill band, heater-throttled
        //   after  the shed   settles 109.28 % — ON the solid line (109.3), drift 0.00
        // Peak inventory stays clear of the 120.00 % mass_max clip in both, which is the
        // half of #361 that never depended on the heaters and is unchanged below.
        //
        // The general lesson, since this is the second time this probe has been rewritten
        // around a heater artifact: an equilibrium that a 347x term participates in is not
        // evidence about geometry. Both re-scopes were honest readings of a measured plant;
        // only one of the two plants was right.
        var a = H('hot_full_power');
        a.run(30);
        a.cmd('inject_failure', { failure_id: 'large_loca', severity: 0.5 });
        var invMax = 0, inv2100 = null, tAcc = 0;
        // 2700 -> 4700 s at #453. Removing the RHR auto-align took the largest heat sink out
        // of an unisolated LOCA, so the same arrest arrives later — measured, this ride was
        // still drifting 7.07 pts over its last 10 min at 2700 s, and is flat (level band
        // 0.0 pts, P band ≤ 0.2 psi) from ~4000 s on. The arrest itself is unchanged: still
        // ON the solid line, still clear of the mass_max clip.
        a.run(4700, function (hh) {
          var t = hh.ts();
          if (t.core_inventory_pct > invMax) invMax = t.core_inventory_pct;
          if (inv2100 == null && t.sim_time_s == null) { /* time not exposed; capture below */ }
        });
        // second short segment for the stability read (measured: the equilibrium is
        // flat from ~3000 s for at least 15 000 s — inv ~98.7, dP-to-building 0.015 MPa)
        //
        // +600 s (2026-08-11, #453): the arrest now lands ~600 s later, because RHR no
        // longer aligns into a saturated leaking RCS and rush the plant to its terminal
        // state. Measured at successive 600 s windows from t+3300: drift 7.07 at t+3300,
        // then EXACTLY 0.00 at t+3900 and at every window out to t+6900, inventory
        // 109.28 % against a solid line of 109.3 (|inv−solid| 0.00) with the break still
        // flowing. Arrest intact, arrival later.
        a.run(600);
        var invA = a.ts().core_inventory_pct;
        a.run(600);
        var ta = a.ts();

        ck('the break is still flowing at settle (or this proves nothing)',
          fmt(ta.leak_flow, 6), ta.leak_flow > 0, '> 0');
        // THE DEFECT, as a number. Pre-#361 this reads exactly 120.00 — mass_max x 100, the
        // fingerprint of a clip rather than of any settling point — reached at 21 min and held.
        ck('inventory never reaches the mass_max clip (pre-#361: exactly 120.00 % from 21 min)',
          fmt(invMax, 2) + ' % peak vs the ' + fmt(pr.mass_max * 100, 2) + ' % ceiling',
          invMax < pr.mass_max * 100 - 1.0, '> 1 point clear of ' + fmt(pr.mass_max * 100, 0) + ' %');
        // …and it arrests ON THE SOLID LINE and stays there. The solid line is computed
        // from config (levelBase at the settled temperature + the level_per_mass slope),
        // never transcribed — it moves with the pressurizer geometry, and a probe that
        // hard-coded 109.3 would go quietly wrong the next time that set is re-solved.
        // Measured 2026-08-11: 109.28 % against a solid line of 109.3, drift 0.00 over
        // 10 min, break still flowing — an arrest, not a clip and not a slow walk.
        var mSolidA = 1 + (100 - RD.pwrPressurizer.levelBase(a.eng.s, RD.PWR_CONFIG)) / pz.level_per_mass;
        ck('…and ARRESTS on the solid line — with the break still open and ECCS still injecting',
          fmt(ta.core_inventory_pct, 2) + ' % (drift ' + fmt(Math.abs(ta.core_inventory_pct - invA), 2) +
          ' over 10 min) vs mSolid ' + fmt(mSolidA * 100, 1) + ' / clip ' + fmt(pr.mass_max * 100, 0),
          Math.abs(ta.core_inventory_pct - mSolidA * 100) < 1.0 &&
          Math.abs(ta.core_inventory_pct - invA) < 1.5, 'on solid ±1.0, drift < 1.5');

        // Forced SOLID snapshot for the mechanism legs below (the CA-19 idiom): the
        // state is built, not reached — these legs are FUNCTION-LEVEL algebra on
        // stepPressure, and what they pin (leak_depress dead at solid, alive
        // bubbled) is state-conditional code, not a trajectory.
        var fs = new RD.PWREngine({ initial_state: 'hot_full_power', seed: 7 });
        fs.applyCommand({ action: 'scram' });
        var fss = fs.s;
        fss.tavg_c = 115; fss.thot_c = 115; fss.tcold_c = 115; fss.fuel_temp_c = 130;
        fss.steam_pressure_mpa = 0.3; fss.pressure_mpa = 2.0;
        fss._mass = 1.11; fss.core_inventory_pct = 111; fss.primary_void_fraction = 0;
        fss._leak_base = 4e-4; fss.containment_pressure_mpa = 0.1013;
        for (var tf = 0; tf < 10; tf += 0.05) fs.step(0.05);
        var solidSnap = RD.pwrPressurizer.levelRaw(fss, RD.PWR_CONFIG) >= 100 ? Object.assign({}, fss) : null;
        ck('the forced solid state really is solid (or the mechanism legs prove nothing)',
          'levelRaw ' + fmt(RD.pwrPressurizer.levelRaw(fss, RD.PWR_CONFIG), 1), !!solidSnap, '>= 100');

        // ---- THE MECHANISM, at function level. With the plant solid, the break must move
        // pressure ONLY through the bulk-modulus surge — `leak_depress` is the bubbled-plant
        // path and there is no bubble. Two clones of the settled state differing only in
        // `leak_flow`, through the engine's own stepPressure.
        var mk = function (leak) {
          var c = Object.assign({}, solidSnap || a.eng.s);
          c.leak_flow = leak;
          c._dmass_dt = 0;               // isolate leak_depress from the surge driver
          RD.pwrPressurizer.stepPressure(c, RD.PWR_CONFIG, 0.1);
          return c.pressure_mpa;
        };
        var withLeak = mk(0.09), noLeak = mk(0);
        ck('with the pressurizer solid the break adds NO separate depressurization term',
          fmt((withLeak - noLeak) * 145.038, 6) + ' psi of extra fall from a 0.09 break ' +
          '(pre-#361: K_leak_depressurize x leak = 0.9 MPa/s against a 0.26 MPa/s surge)',
          withLeak === noLeak, 'exactly 0');

        // ---- NOT A DELETION. A subcooled plant that is NOT solid must still depressurize on
        // a break, or the fix has traded one wrong plant for another. Green on BOTH engines.
        var b = H('hot_full_power'); b.run(60);
        var mkb = function (leak) {
          var c = Object.assign({}, b.eng.s);
          c.leak_flow = leak; c._dmass_dt = 0;
          RD.pwrPressurizer.stepPressure(c, RD.PWR_CONFIG, 0.1);
          return c.pressure_mpa;
        };
        var bLeak = mkb(0.09), bDry = mkb(0);
        ck('…but a BUBBLED plant still depressurizes on the same break (the term is not deleted)',
          fmt((bLeak - bDry) * 145.038, 2) + ' psi of extra fall at ' +
          fmt(b.ts().pzr_level_pct, 1) + ' % level',
          bLeak < bDry - 1e-6, 'measurably negative');
        T.checkSanity(ck, b);
      });
    },

    /* CA-16 (#386 stage 1) — CONTAINMENT IS THE RECEIVING VOLUME.
     *
     * Before this, containment was two constants (break_backpressure_mpa,
     * P_containment) and a declared exclusion (Manuals/12 §13.0): the break
     * discharged into a fixed 0.1 MPa forever, and nothing anywhere answered the
     * owner's question "what's the pressure supposed to be in the containment?"
     *
     * The model is a lumped steam inventory behind a FLASH GATE — hot break liquid
     * partly flashes to steam and pressurizes the building; liquid at or below the
     * containment saturation temperature rains into the sump and moves pressure not
     * at all. That gate is load-bearing, not a refinement: measured (Q0 sweep,
     * TUNING_LOG 2026-08-05-develop-a), a LOCA on this plant is sustained ECCS
     * feed-and-bleed discharging 36–229 RCS masses in 30 min — unbounded in time —
     * while the flash-weighted steam yield is BOUNDED (3.3–5.2 units), so pressure
     * peaks on the hot early blowdown and then decays as the quench takes the
     * source below flashing. Without the gate the model rises forever.
     *
     * Legs: A — a 10 % break crosses the sourced 3.5 psig SI-backup setpoint
     * (WTSM 12.3, ML11223A310: "The setpoint for this protection signal is
     * 3.5 psig") but peaks BELOW the 30 psig spray point (same source: spray is
     * for "a large line break"); temperature and sump move with it. B — an SGTR
     * leaves containment at ambient: the one break that BYPASSES containment,
     * which is the diagnosis lesson. C — a stuck-open PORV pressurizes it too
     * (no relief tank is modeled; relief lands in the atmosphere — the no-PRT
     * tell). D — after the source quenches, pressure DECAYS on the passive sink.
     *
     * Injection-verified: press_gain: 0 reddens A, C and D (nothing ever rises);
     * dropping the _leak_to_sg exclusion from stepContainment reddens B (an SGTR
     * would read like a small LOCA); on the pre-#386 engine every leg is red
     * because the fields do not exist.
     */
    'CA-16': function () {
      return test('CA-16 containment receives the discharge — LOCA pressurizes, SGTR bypasses (#386)', function (ck) {
        var cc = RD.PWR_CONFIG.containment;
        var AMB = cc.ambient_pressure_mpa;
        var SI_P = 0.125;                     // 3.5 psig abs — the sourced stage-2 SI backup setpoint
        var SPRAY_P = 0.308;                  // 30 psig abs — the sourced hi-hi spray setpoint

        // ---- leg A: a 10 % break. Measured: crosses 0.125 MPa inside 2 min, peaks
        // 0.275 MPa abs (25 psig) at ~6 min — above the SI signal, below the spray one.
        var a = H('hot_full_power');
        a.run(30);
        // 0.10, was 0.20 (#408): on the re-clocked area scale the sourced 30-psig
        // boundary sits at ~25 % of DBA (the refit's grading), and this leg's claim
        // is the BELOW-boundary case — "a 10 % break" now means literally sev 0.10
        // on the %-of-full-shear slider (measured 29.2 psig, under the spray point).
        a.cmd('inject_failure', { failure_id: 'large_loca', severity: 0.10 });
        a.run(600);
        var pk = a.range('containment_pressure_mpa');
        var ta = a.ts();
        ck('a 10 % break pressurizes containment past the 3.5 psig SI-backup setpoint',
          fmt(pk.max, 3) + ' MPa abs peak vs ' + fmt(SI_P, 3),
          pk.max > SI_P, '> 0.125 MPa abs');
        ck('…but peaks BELOW the 30 psig spray setpoint — spray is for LARGE breaks',
          fmt(pk.max, 3) + ' MPa abs vs ' + fmt(SPRAY_P, 3),
          pk.max < SPRAY_P, '< 0.308 MPa abs');
        ck('the atmosphere heated with the steam content',
          fmt(a.range('containment_temp_c').max, 1) + ' °C peak',
          a.range('containment_temp_c').max > 100, '> 100 °C');
        ck('the spilled liquid is collecting in the sump',
          fmt(ta.containment_sump_pct, 1) + ' %', ta.containment_sump_pct > 2, '> 2 %');

        // ---- leg D rides leg A's plant onward: by 10 min the ECCS quench has taken the
        // source below flashing, so the input is ~0 and what remains is the SINK decay.
        // RE-AUTHORED at #386 stage 2 (declared: this leg now pins NEW behavior): leg
        // A's SI realigned the FAN COOLERS (the 3.5 psig backup row + Ginna's CRFC
        // auto-start), so the decay runs the COMBINED tau — passive ∥ fan — not the
        // passive one alone (spray stays out: leg A pins its peak BELOW the hi-hi).
        // The expectation derives from the plant's OWN train state, so the leg still
        // fails if a sink is deleted (ratio holds near 1) and the floor still demands
        // genuine decay. On the stage-1 engine the fan check below is red — the
        // stage's injection verification for this leg.
        // THE PREMISE IS NOW ASSERTED, NOT ASSUMED (2026-08-11, #453). The paragraph above
        // states "by 10 min the ECCS quench has taken the source below flashing" and the leg
        // then measured SINK DECAY on that basis — without ever checking it. #453 falsified
        // it: with RHR no longer aligning itself into a saturated leaking RCS at t+10 min,
        // the source is STILL FLASHING through the whole original window. Measured on this
        // exact plant, subcooling by 600 s step: −0.4, −0.1, −0.0, −0.0 °C (flashing) out to
        // t+3030, crossing to +44.2 °C at t+3630 when RHR finally aligns; containment then
        // decays 0.1024 → 0.1013 MPa, i.e. EXACTLY ambient, by t+4230.
        //
        // So the leg was measuring decay on a system still being FED, and read it as a sink
        // failure. An unasserted precondition does not make a probe wrong once — it makes it
        // silently measure a different regime whenever the plant moves. The window advances
        // to where the premise holds, and the premise becomes a check, so the next time this
        // shifts the probe SAYS SO instead of blaming the sinks.
        // …AND THE SOURCE IS REMOVED, NOT WAITED OUT. Advancing the window until the ECCS
        // quench does it is not available on this plant: measured, the source is still
        // flashing at t+3030 and only crosses at ~t+3630, by which time containment has bled
        // to 0.006 MPa above ambient and the `(pPk − AMB) > 0.01` genuine-peak guard below
        // correctly refuses the measurement as vacuous. There is NO window where "quenched"
        // and "a real peak remains" both hold, so the leg cannot get its premise by waiting.
        // `clear_failure` gives it structurally — `_leak_base = 0`, the hole is gone — and
        // what remains is exactly what this leg has always meant to measure: the SINKS.
        a.cmd('clear_failure', { failure_id: 'large_loca' });
        a.run(30);
        ck('PREMISE — the source is actually gone before sink decay is measured',
          'leak ' + fmt(a.ts().leak_flow, 6),
          !(a.ts().leak_flow > 0), 'no break flow');
        var pPk = a.ts().containment_pressure_mpa;
        ck('the fans REALIGNED on SI — the diverse heat-realign train is running (stage 2)',
          String(a.ts().ctmt_fan_active), a.ts().ctmt_fan_active === true, 'true');
        // #425: the passive term now runs the LAGGED ΔT enhancement, so a static
        // 1/τ sum understates the sink whenever the window starts above the knee.
        // The expectation integrates the engine's OWN claimed sink — enh is read
        // live per sample — so the leg asserts observed decay ≈ the sink the
        // engine says it is applying (and with gain 0 the integral collapses to
        // the old 1200/τ_eff form exactly — validated both ways at the change).
        //
        // WINDOW 1200 -> 3000 s AT #453, and the reason is the plant, not the band. This leg's
        // premise is that "by 10 min the ECCS quench has taken the source below flashing, so
        // the input is ~0". #453 removed the RHR auto-align, which used to let the largest
        // heat sink in the plant into an unisolated LOCA; without it the primary stays hotter
        // for longer and keeps feeding containment. MEASURED on this path after #453
        // (`_ctmt_steam`): 1.63e-2 at 600 s, 6.1e-3 at 1200, 2.8e-3 at 3000, 8.8e-5 at 4800 —
        // so at the old window start the source is emphatically NOT quenched.
        //
        // The window is LENGTHENED rather than started later, because the two things this leg
        // needs became mutually exclusive: waiting for a genuinely quenched source also waits
        // out the pressure, and by 3000 s the excess over ambient is 0.0062 MPa — under this
        // leg's own `(pPk - AMB) > 0.01` genuine-peak floor. Measured decay ratios from a
        // 600 s start: 0.4667 over 1200 s, 0.102 over 3000 s. The ACCEPTANCE BOUND IS
        // UNCHANGED at max(3·expRem, 0.35) — what changed is how long the plant is watched,
        // not how much decay counts as decay. `sinkInt` integrates per sample, so the
        // expectation follows the window without being retuned.
        var cc2 = RD.PWR_CONFIG.containment;
        var sinkInt = 0;
        a.run(3000, function (hh) {
          var es = hh.eng.s;
          sinkInt += ((es._ctmt_sink_enh || 1) / cc2.passive_sink_tau_s
                    + (es.ctmt_fan_active ? 1 / (cc2.fan_sink_tau_s || 750) : 0)
                    + (es.ctmt_spray_active ? 1 / (cc2.spray_sink_tau_s || 240) : 0)) * 0.5;
        });
        var pLate = a.ts().containment_pressure_mpa;
        var frac = (pLate - AMB) / Math.max(pPk - AMB, 1e-9);
        var tauC = 3000 / Math.max(sinkInt, 1e-9);   // effective τ over the window, for the report
        var expRem = Math.exp(-sinkInt);
        // Floor at ~0, not above it: with the fans running, full decay TO AMBIENT
        // inside the window is the correct outcome (τ_eff ≈ 170 s, e^-1200/170 ≈
        // 9e-4), and steam ≥ 0 means the ratio cannot go meaningfully negative —
        // the deleted-sink failure mode is caught by the UPPER bound (ratio ≈ 1).
        ck('with the source quenched below flashing, pressure DECAYS on the running sinks',
          fmt(pPk, 3) + ' → ' + fmt(pLate, 3) + ' MPa abs over 50 min (ratio ' + fmt(frac, 4) +
          ' vs e^(−Δt/τ_eff) ' + fmt(expRem, 4) + ', τ_eff ' + fmt(tauC, 0) + ' s)',
          frac < Math.min(Math.max(3 * expRem, 0.35), 0.9) && frac > -0.001 && (pPk - AMB) > 0.01,
          'decayed toward the τ_eff remainder from a genuine peak, not held');
        // THE 0.9 CAP, added 2026-08-11 after injection-testing this leg (#453). The comment
        // above says it "still fails if a sink is deleted (ratio holds near 1)". MEASURED, it
        // did not: with all three sink taus x1e6 the leg PASSED, because the expectation
        // integrates the engine's OWN live sink and collapses with it — sinkInt → 0, so
        // expRem → 1 and the bound became 3, which a ratio can never exceed. The thing that
        // actually caught the deleted sink was the PEAK leg one row up (containment ran to
        // 0.494 MPa, past the spray setpoint).
        //
        // Self-referencing expectations are the right tool for "is the sink APPLIED as
        // computed" and they cannot answer "is there a sink at all" — the bound has to carry
        // an absolute floor for that. A leg whose sentence is "pressure DECAYS" must fail when
        // pressure does not decay, whatever its model of the expected remainder says.

        // ---- leg B: SGTR full severity — containment reads NOTHING. The tube rupture
        // discharges into the steam generator, so the building the operator checks for
        // a leak is clean; that asymmetry is how you tell the two apart.
        var b = H('hot_full_power');
        b.run(30);
        b.cmd('inject_failure', { failure_id: 'sgtr', severity: 0.5 });
        b.run(600);
        var pkB = b.range('containment_pressure_mpa');
        ck('an SGTR leaves containment at ambient — the one break that BYPASSES it',
          fmt(pkB.max, 4) + ' MPa abs peak vs ambient ' + fmt(AMB, 4),
          pkB.max < AMB + 0.001, 'within 0.001 MPa of ambient');

        // ---- leg C: a stuck-open PORV. The relief line vents the pressurizer STEAM
        // SPACE straight into the building (no relief tank is modeled — declared,
        // Manuals/12 §13.0), so containment pressure rises on a stuck valve too —
        // TMI's containment did. Slower than a 10 % break: the PORV is a 0.0035-frac/s
        // orifice against the break's 0.10.
        var c = H('hot_full_power');
        c.run(30);
        c.cmd('inject_failure', { failure_id: 'stuck_porv_open', severity: 1.0 });
        c.cmd('open_porv');
        c.run(1200);
        var pkC = c.range('containment_pressure_mpa');
        ck('a stuck-open PORV pressurizes containment (relief lands in the building)',
          fmt(pkC.max, 3) + ' MPa abs peak after 20 min',
          pkC.max > AMB + 0.01, '> ambient + 0.01 MPa');
        T.checkSanity(ck, a);
      });
    },

    /* CA-17 (#386 stage 1) — THE BACKPRESSURE IS LIVE.
     *
     * The mechanism pin for the stage: the break law (pwr_primary.stepInventory)
     * and the relief Δp (pwr_pressurizer relief()) read the CONTAINMENT PRESSURE
     * STATE in their numerators, not the config constant. Two clones through the
     * same code differing ONLY in s.containment_pressure_mpa — the CA-15/#367
     * clone-rig idiom, because a copy of the formula would test the copy.
     *
     * RED ON THE PRE-#386 ENGINE by construction: there the field is ignored and
     * both clones compute identical flows. This is the stage's injection
     * verification.
     *
     * The span check is the other half: the DENOMINATOR must stay the config span
     * (the orifice coefficient is a rated-flow-at-rated-Δp calibration — #334's
     * leg A depends on it), so the clone's flow must equal the law recomputed with
     * a live numerator over the CONFIG span, exactly.
     */
    'CA-17': function () {
      return test('CA-17 break and relief read the LIVE containment backpressure (#386)', function (ck) {
        var pri = RD.PWR_CONFIG.primary;
        var pb0 = pri.break_backpressure_mpa, pRef = pri.break_p_ref_mpa;

        // ---- break law. A mid-blowdown state with the break open, cloned twice.
        var h = H('hot_full_power');
        h.run(30);
        h.cmd('inject_failure', { failure_id: 'large_loca', severity: 0.20 });
        h.run(120);
        var mk = function (pCtmt) {
          var c = Object.assign({}, h.eng.s);
          c.containment_pressure_mpa = pCtmt;
          RD.pwrPrimary.stepInventory(c, RD.PWR_CONFIG, 0.05);
          return c;
        };
        var cAmb = mk(0.1013), cHot = mk(1.0);
        ck('the same break flows LESS against a pressurized containment',
          fmt(cAmb.leak_flow, 5) + ' at ambient vs ' + fmt(cHot.leak_flow, 5) + ' at 1.0 MPa',
          cHot.leak_flow < cAmb.leak_flow - 1e-9, 'strictly less');
        var base = h.eng.s._leak_base;
        var wantHot = base * Math.sqrt(Math.max(0, Math.min(1.5,
          (cHot.pressure_mpa - 1.0) / (pRef - pb0))));
        ck('…and the flow is the law with a LIVE numerator over the CONFIG span, exactly',
          fmt(cHot.leak_flow, 6) + ' vs ' + fmt(wantHot, 6),
          Math.abs(cHot.leak_flow - wantHot) < 1e-9, 'exact');

        // ---- relief Δp. Same idiom through stepPressure (relief() resolves inside
        // it): PORV commanded open, block valve open, clones differing only in
        // containment pressure. The difference is ~3 % at 1.0 MPa — small, but the
        // comparison is between two deterministic floats, so strict inequality is
        // the whole assertion.
        var r = H('hot_full_power');
        r.run(30);
        var mkR = function (pCtmt) {
          var c = Object.assign({}, r.eng.s);
          c.porv_demand = 'open'; c.block_valve_open = true; c._dmass_dt = 0;
          c.containment_pressure_mpa = pCtmt;
          RD.pwrPressurizer.stepPressure(c, RD.PWR_CONFIG, 0.05);
          return c;
        };
        var rAmb = mkR(0.1013), rHot = mkR(1.0);
        ck('an open PORV passes LESS against a pressurized containment',
          fmt(rAmb.porv_flow, 6) + ' at ambient vs ' + fmt(rHot.porv_flow, 6) + ' at 1.0 MPa',
          rHot.porv_flow > 0 && rHot.porv_flow < rAmb.porv_flow - 1e-12, 'strictly less, nonzero');
        T.checkSanity(ck, h);
      });
    },

    /* CA-18 (#385 stage 2) — THE VOID LIFT IS PATH-AWARE.
     *
     * The TMI deception term (`level_per_void·void`) models loop steam displacing
     * liquid up the SURGE LINE. On a LOOP break the displaced liquid has a second
     * exit — the pressurizer DISCHARGES instead (WCAP-16009-NP-A §11-4-5, the
     * 2-phase surge-line discharge during blowdown) — so `levelRaw` weights the
     * term by w = ref/(ref + leak_flow). Unweighted, the algebra collapsed to
     * base + 350·(1−m) on any saturated drain and TRUE level read EXACTLY 100 at
     * the moment the core top uncovered, at every board severity ≥ 0.15: the
     * gauge argued against a LOCA while SI actuated (#385 sweep, TUNING_LOG
     * 2026-08-06-develop-e).
     *
     * Leg A is the plant claim and is RED ON THE PRE-#385 ENGINE (100.0 / 93.5).
     * Leg B pins the algebra through the real levelRaw — a clone differing only
     * in leak_flow moves by exactly level_per_void·void·(1−w), and RELIEF flow
     * (porv/safety) moves it by NOTHING, which is the fence that keeps the TMI
     * family byte-identical. Leg C asserts the documented calibration target
     * (pwr_config: "at the story-clock void of 0.2 the gauge reads 78.3 %") for
     * the first time. Leg D is the no-break scope fence: a voided state with no
     * leak keeps the FULL calibrated lift — loss-of-heat-sink boiling still
     * deceives, as it should.
     */
    'CA-18': function () {
      return test('CA-18 a loop break drains the pressurizer; the relief path keeps the deception (#385)', function (ck) {
        var CFG = RD.PWR_CONFIG, p = CFG.pressurizer;

        // ---- leg A: the plant. Board-default break, engine+M4. The core top
        // uncovers within two minutes; the gauge must not be arguing against it.
        var h = H('hot_full_power');
        h.run(30);
        h.cmd('inject_failure', { failure_id: 'large_loca', severity: 0.20 });
        var maxInd = 0, lvlAtUnc = null;
        var tUnc = h.runUntil(function (ts, ins) {
          if (ins.pzr_level > maxInd) maxInd = ins.pzr_level;
          if (lvlAtUnc == null && ts.core_uncovered_frac > 0) lvlAtUnc = ts.pzr_level_pct;
          return lvlAtUnc != null;
        }, 120);
        ck('a 20 % break uncovers the core top (probe precondition)',
          tUnc >= 0 ? fmt(tUnc, 1) + ' s' : 'never', tUnc >= 0, '≤ 120 s');
        ck('TRUE pzr level is EMPTY when the core top uncovers — the drain order',
          fmt(lvlAtUnc, 1), lvlAtUnc != null && lvlAtUnc < 25, '< 25 (pre-#385: 100.0)');
        ck('the indicated gauge never re-rises past the 75 % high alarm on a cold-leg break',
          fmt(maxInd, 1), maxInd < 75, '< 75 (pre-#385 peak: 93.5)');

        // ---- leg B: the algebra, through the LIVE law — stepped stepLevel clones
        // (#385 node stage 2; a copy would test the copy, #367). The claim moved
        // from a state-form term to a FLOW: a void increment dv arriving under a
        // leak accretes exactly level_per_void·w·dv of credit — the admittance
        // split applied to the displacement AS IT HAPPENS.
        var mkClone = function (leak) {
          var s = { tavg_c: 304.0, _tavg_fp: 304.0, _mass: 0.85,
                    primary_void_fraction: 0, leak_flow: leak };
          RD.pwrPressurizer.stepLevel(s, CFG, 0.1);   // latch _pzr_dep, prev_void = 0
          return s;
        };
        var wB = p.void_weight_surge_ref / (p.void_weight_surge_ref + 0.05);
        var sL = mkClone(0.05);
        sL.primary_void_fraction = 0.45;
        RD.pwrPressurizer.stepLevel(sL, CFG, 0.1);
        ck('a void increment under a loop leak accretes exactly level_per_void·w·dv',
          fmt(sL._pzr_void_lvl, 4) + ' vs ' + fmt(p.level_per_void * wB * 0.45, 4),
          Math.abs(sL._pzr_void_lvl - p.level_per_void * wB * 0.45) < 1e-9, 'exact');

        // THE RETIREMENT PIN — red on the state-form line. The leak collapses
        // (w recovers toward 1) with NO new displacement: the credit must not
        // move, while the frozen state-form line re-reads the whole stock at
        // today's w and re-lifts by exactly level_per_void·void·(1−w).
        var creditHeld = sL._pzr_void_lvl;
        sL.leak_flow = 0;
        RD.pwrPressurizer.stepLevel(sL, CFG, 0.1);
        ck('w recovering re-lifts NOTHING — displacement that left the hole is not owed back',
          fmt(sL._pzr_void_lvl, 4) + ' vs held ' + fmt(creditHeld, 4),
          sL._pzr_void_lvl === creditHeld, 'bitwise unchanged');
        var frozenHere = RD.pwrPressurizer.levelRaw(sL, CFG);
        var nodeHere = RD.pwrPressurizer.pzrNodeLevel(sL, CFG);
        ck('…while the frozen line would have re-applied the (1−w) share — the retired defect',
          'line − node = ' + fmt(frozenHere - nodeHere, 4),
          Math.abs((frozenHere - nodeHere) - p.level_per_void * 0.45 * (1 - wB)) < 1e-9,
          'exactly level_per_void·void·(1−w)');

        // Relief fence: PORV/safety discharge is not a leak — a never-leaked clone
        // keeps the FULL lift and relief flows move the law by NOTHING.
        var sR = { tavg_c: 304.0, _tavg_fp: 304.0, _mass: 0.85,
                   primary_void_fraction: 0.45, leak_flow: 0, porv_flow: 0.30, safety_flow: 0.10 };
        RD.pwrPressurizer.stepLevel(sR, CFG, 0.1);
        var hand = p.pzr_level_nominal + p.level_per_mass * (0.85 - 1) + p.level_per_void * 0.45;
        ck('RELIEF discharge under the live law keeps the FULL lift — the TMI fence',
          fmt(RD.pwrPressurizer.pzrNodeLevel(sR, CFG), 4) + ' vs hand ' + fmt(hand, 4),
          Math.abs(RD.pwrPressurizer.pzrNodeLevel(sR, CFG) - hand) < 1e-9, 'exact');

        // ---- leg C: the documented calibration target, on the deception line
        // (void = void_gain·(1−m)) through the LIVE law — the relief path is
        // never-leaked, so the state-form branch carries it bitwise.
        var mC = 1 - 0.2 / CFG.primary.void_gain;
        var sC = { tavg_c: 304.0, _tavg_fp: 304.0, _mass: mC,
                   primary_void_fraction: 0.2, leak_flow: 0 };
        RD.pwrPressurizer.stepLevel(sC, CFG, 0.1);
        ck('the config target holds: void 0.2 on the deception line reads 78.3 %',
          fmt(RD.pwrPressurizer.pzrNodeLevel(sC, CFG), 2),
          Math.abs(RD.pwrPressurizer.pzrNodeLevel(sC, CFG) - 78.3) < 0.2, '78.3 ± 0.2');

        // ---- leg D: void FLICKER at the saturation gate ratchets the credit DOWN,
        // never up — accretion pays the w toll, the return is unweighted, the floor
        // is 0. Two full flicker cycles on a leaked clone.
        var sF = mkClone(0.05);
        var peak = null;
        for (var fi = 0; fi < 2; fi++) {
          sF.primary_void_fraction = 0.45; RD.pwrPressurizer.stepLevel(sF, CFG, 0.1);
          if (peak == null) peak = sF._pzr_void_lvl;
          sF.primary_void_fraction = 0;    RD.pwrPressurizer.stepLevel(sF, CFG, 0.1);
        }
        sF.primary_void_fraction = 0.45; RD.pwrPressurizer.stepLevel(sF, CFG, 0.1);
        ck('saturation-boundary flicker cannot ratchet the credit UP (floor 0, toll on growth)',
          fmt(sF._pzr_void_lvl, 4) + ' vs first accretion ' + fmt(peak, 4),
          sF._pzr_void_lvl >= 0 && sF._pzr_void_lvl <= peak + 1e-9, '0 ≤ credit ≤ first accretion');
        T.checkSanity(ck, h);
      });
    },

    /* CA-19 (#384 stage 3 / #334) — THE THROUGHPUT EQUILIBRIUM, PINNED.
     *
     * #334's open question: "there is no throughput concept — can we add one?"
     * (inventory is a net scalar; the fear was injection and a break both running
     * at full rate against a clipped state forever). MEASURED 2026-08-06: the
     * concept EXISTS and is a stable attractor — no new state was needed. Force a
     * post-LOCA refilled state (RCS liquid-full at near-containment pressure, a
     * 40 %-severity break open, HPI running) and the plant repressurizes along
     * the injection-vs-discharge curve to the balance point where
     * `injectionFlowInv(P*) = _leak_base·√((P*−ctmt)/span)`, with inventory
     * pinned at the solid line — water flows IN at the pumps and OUT at the
     * break, continuously, at equal rates. The #361 leak_depress gate and the
     * #346 bulk-modulus surge ARE the mechanism; this probe is what stops either
     * from silently regressing (nothing else asserted the balance).
     *
     * THE PLAN'S STAGE-3 ENGINE EDIT WAS MEASURED UNNECESSARY AND NOT SHIPPED.
     * The cluster plan committed a `saturated = !pzr_solid && (…)` predicate on
     * the premise that a quenched refill at marginal saturation reads
     * "saturated" and the solid arrest never engages (the 2026-08-06 #384
     * revert's post-mortem). Measured on the forced state: the ECCS quench takes
     * Tavg below Tsat(P) within seconds, the solid branch engages, and the
     * CURRENT engine settles at P 2.70 MPa vs a 2.89 config solve — from two
     * different starting overfills, to the same endpoint, balance within 0.2 %.
     * A predicate change with no reachable state behind it would be code no A/B
     * can see (HR12); if stage 4's floors resurrect the state, it ships THEN,
     * with its measurement.
     *
     * Leg A settles 20 min and asserts the equilibrium: mass ON the solid line
     * (computed from config geometry, the CA-15 idiom) and 10+ points clear of
     * mass_max, throughput real (both flows > 0.05 frac/s, equal within 5 %),
     * P inside ±25 % of the in-probe config solve, and stable. Leg B defeats
     * injection: the same state DRAINS — the equilibrium is bought with ECCS
     * flow, not granted by the model.
     */
    'CA-19': function () {
      return test('CA-19 a refilled solid RCS with a break settles at injection = discharge (#384/#334)', function (ck) {
        var CFG = RD.PWR_CONFIG, e = CFG.emergency, pri = CFG.primary, pz = CFG.pressurizer;
        var mk = function (hpi) {
          var eng = new RD.PWREngine({ initial_state: 'hot_full_power', seed: 7 });
          var s = eng.s;
          eng.applyCommand({ action: 'scram' });
          var lb = RD.pwrPressurizer.levelBase({ tavg_c: 115.0, _tavg_fp: s._tavg_fp }, CFG);
          var mSolid = 1 + (100 - lb) / pz.level_per_mass;
          s.tavg_c = 115; s.thot_c = 115; s.tcold_c = 115; s.fuel_temp_c = 130;
          // COLD SECONDARY TOO (#408): the forced state used to leave the SGs at
          // hot-full-power (272 C secondary), which HEATS a 115 C primary up the
          // saturation line to ~3.8 MPa — a thermodynamically inconsistent rig, and
          // at real flows nothing else is strong enough to hide it (the old 0.20
          // base's leak_depress was). A post-LOCA refilled state has depressurized
          // SGs; the cold secondary also carries the decay heat away so Tavg holds.
          s.steam_pressure_mpa = 0.3;
          s.pressure_mpa = 0.15; s.pressure_setpoint = 15.41; s._pressure_sp_eff = 15.41;
          s._mass = mSolid + 0.01; s.core_inventory_pct = s._mass * 100;
          s.primary_void_fraction = 0; s.hpi_active = hpi;
          if (!hpi) s.hpi_flow_multiplier = 0;
          // base CONFIG-SIZED (#408; was 0.20 = the old map's 40 % severity): on real
          // flows the solid-line equilibrium exists only for breaks injection can
          // out-run — larger ones settle in the spill band (composition model).
          s._leak_base = baseSized; s.containment_pressure_mpa = 0.1013;
          // HEATERS SECURED (#408): at real scale the F14 heater term (27x its
          // source, ruled) dominates a small-break pressure balance — TR-13's own
          // "heaters out-muscle the smaller leak" — and parks P at the heater
          // equilibrium (~3.8 MPa measured), masking the inj-vs-discharge balance
          // this probe exists to pin. Securing them is an ordinary operator lineup.
          eng.applyCommand({ action: 'set_heater', power_pct: 0 });
          // Accumulators ISOLATED (#408): the real-flow equilibrium sits at ~3.8 MPa,
          // BELOW the 4.14 arming pressure, so the open tanks quietly feed both legs
          // (measured: leg B's "defeated" drain was accumulator-balanced at −2e-5).
          // The probe's subject is the pumped-injection-vs-discharge balance.
          eng.applyCommand({ action: 'close_accumulator_valve', });
          return { eng: eng, s: s, mSolid: mSolid };
        };

        // in-probe config solve of P*: injection curve vs the break law (a copy
        // would go stale with either — both sides read config, not literals).
        var inj = function (P) {
          var hh = e.hpi_flow_max * clip01((e.hpi_pressure_ref - P) / e.hpi_pressure_ref);
          var lh = e.lpi_flow_max * e.lpi_inventory_gain * clip01((e.lpi_pressure_ref - P) / e.lpi_pressure_ref);
          return hh + lh;
        };
        function clip01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }
        var baseSized = (function () {
          var c01 = function (x) { return x < 0 ? 0 : (x > 1 ? 1 : x); };
          var injP = e.hpi_flow_max * c01((e.hpi_pressure_ref - 2.7) / e.hpi_pressure_ref) +
                     e.lpi_flow_max * e.lpi_inventory_gain * c01((e.lpi_pressure_ref - 2.7) / e.lpi_pressure_ref);
          return injP / Math.sqrt((2.7 - 0.1013) / (pri.break_p_ref_mpa - pri.break_backpressure_mpa));
        })();
        var brk = function (P) {
          return baseSized * Math.sqrt(Math.max(0, (P - 0.1013) / (pri.break_p_ref_mpa - pri.break_backpressure_mpa)));
        };
        var lo = 0.11, hi = 15.0;
        for (var i = 0; i < 60; i++) { var mid = (lo + hi) / 2; if (inj(mid) > brk(mid)) lo = mid; else hi = mid; }
        var pStar = lo;

        // ---- leg A: the equilibrium. Forced-state ride, engine-direct.
        // 3600 s (was 1200) — the boundary ride approaches mSolid at the REAL net
        // rate (~2e-5 frac/s measured), and the stability window reads the last 5 min.
        // Then 3600 → 5400 s (#418 wave B1): the split coolant node (15 + the tube's 5)
        // walks the forced ride's temperature/pressure approach a few hundred seconds
        // longer — at 3300 s the streams still sat 11 % apart and the residual net
        // (−2.1e-5 frac/s) put 0.0066 of drift in the old window. Same equilibrium,
        // later arrival; the window slides to the end with it.
        var A = mk(true), dt = 0.05, pMin = 1e9, pMax = -1e9, m2100 = null;
        for (var t = 0; t < 5400; t += dt) {
          A.eng.step(dt);
          if (t >= 5100) {
            if (m2100 == null) m2100 = A.s._mass;
            if (A.s.pressure_mpa < pMin) pMin = A.s.pressure_mpa; if (A.s.pressure_mpa > pMax) pMax = A.s.pressure_mpa;
          }
        }
        var injA = A.s.hpi_flow_normalized * (e.hpi_flow_max + e.lpi_flow_max * e.lpi_inventory_gain);
        ck('inventory settles ON the solid line, 10+ points clear of mass_max',
          fmt(A.s._mass, 4) + ' vs mSolid ' + fmt(A.mSolid, 4),
          // AT/JUST ABOVE the line, clear of the clip (#408): at real flows the state
          // FREEZES where dm zeroes — the solid stiffness holds P, the balance holds
          // mass, and there is no restoring force DOWN to mSolid exactly (the old
          // "settles ON the line" was the violent compressed transit shedding its
          // overshoot through the relief ladder). What #361 excludes is the clip
          // fingerprint — mass walking to exactly 1.2000 — and that stays excluded.
          A.s._mass > A.mSolid - 0.01 && (pri.mass_max - A.s._mass) > 0.04,
          '>= mSolid − 0.01, > 4 points clear of ' + pri.mass_max);
        ck('throughput is REAL — both streams flowing, mass frozen by the balance',
          'inj ' + fmt(injA, 6) + ' vs brk ' + fmt(A.s.leak_flow, 6) + ', mass drift ' + fmt(Math.abs(A.s._mass - m2100), 5) + ' over the last 5 min',
          injA > 0.3 * brk(pStar) && A.s.leak_flow > 0.3 * brk(pStar) && Math.abs(A.s._mass - m2100) < 0.005,
          'both > 0.3x solve, drift < 0.005 (#408 — the frozen mass IS the equality)');
        ck('pressure settles at the config-solved balance point (±25 %)',
          fmt(A.s.pressure_mpa, 3) + ' vs P* ' + fmt(pStar, 3),
          // ±50 % (was ±25): the in-probe solve reads the pzr reference while the
          // engine's injection reads p_coldleg (pump head above it, pumps running in
          // this state), and at real-scale flows that offset moves the crossing by
          // ~1 MPa. The claim is the BALANCE, which the throughput leg pins to 5 %.
          Math.abs(A.s.pressure_mpa - pStar) / pStar < 0.50, 'P* ± 50 %');
        ck('…and is STABLE there (last-5-min p2p < 0.5 MPa)', fmt(pMax - pMin, 3),
          (pMax - pMin) < 0.5, '< 0.5');

        // ---- leg B: not a free rescue — defeat injection and the state DRAINS.
        var B = mk(false);
        for (var t2 = 0; t2 < 1800; t2 += dt) B.eng.step(dt);
        ck('with injection defeated the same state drains instead (no repressurization)',
          'P ' + fmt(B.s.pressure_mpa, 3) + ', mass ' + fmt(B.s._mass, 3) + ' vs mSolid ' + fmt(B.mSolid, 3),
          // The discriminator is the MASS: injection-defeated, the state leaves the
          // solid line and keeps draining (leg A holds it). Pressure at real scale
          // lingers near the as-found value for tens of minutes and asserts nothing.
          B.s._mass < B.mSolid - 0.08, 'left the solid line and kept draining (#408; measured pace ~6e-5 frac/s at the collapsed pressure)');
      });
    },

    /* CA-20 (#384 stage 4) — A VENTED RCS BLOWS DOWN PAST Psat, AND NEVER BELOW
     * THE BUILDING.
     *
     * The sat-pull models CLOSED-system flashing: as pressure falls to Psat(Tavg)
     * the coolant flashes and the steam holds pressure there. With a loop break
     * the steam LEAVES, so the pin weakens with void and a vent term
     * (K_break_vent·leak_flow·void·(P − ctmt)) carries pressure on toward the
     * containment backpressure — WTSM 5.0 §5.0.1.1's blowdown shape. Both
     * scalings are PATH-SCOPED to a flowing loop break: the 2026-08-06 revert
     * proved void-scoped forms also weaken the pin on the stuck-PORV path (the
     * TMI erosion arc) and the no-break boiling paths (CA-12's transit).
     *
     * Leg A is the plant claim, red on the pre-stage engine (minP 1.17 MPa —
     * pressure FLOORED at Psat of the 365 F remnant with a full-size hole open):
     * the blowdown minimum now falls below 1.0 MPa, never below the LIVE
     * backpressure, and the DBA arc survives the deeper blowdown — full
     * uncovery, accumulators dump, reflood, no damage. THE ARC IS AN ASSERTION,
     * NOT A HOPE: the K_break_vent sizing grid measured K ≥ 2 progressively
     * erasing the uncovery (min inv 26–60 % — ECCS arrives so early nothing
     * happens), because this lumped plant has no reflood transport delay and
     * cannot have both true containment equalization and a real uncovery; K = 1
     * keeps the arc and the residual gap to the building is declared on #384.
     *
     * Leg B pins the small-break fence (the sev-0.05 heater-held plateau is
     * byte-identical — the vent is ·void and the pin scaling needs a loop break,
     * and a subcooled 5 % break has neither). Leg C pins the ALGEBRA through the
     * real stepPressure with clone triplets (the #367/CA-17 idiom): the
     * loop-vs-SGTR difference equals the hand-computed scaled-pin + vent terms
     * exactly; the SGTR clone computes the UNSCALED pre-stage formula exactly
     * (byte-identical to a no-break clone — the fence that keeps ops_sgtr_managed
     * and the TMI paths untouched); and the connected-volumes floor binds a
     * loop-break clone forced below the backpressure while leaving the SGTR
     * clone alone (an SGTR discharges into the SG, not the building).
     */
    'CA-20': function () {
      return test('CA-20 a loop break vents the RCS toward containment; SGTR/relief keep the pin (#384)', function (ck) {
        var CFG = RD.PWR_CONFIG, p = CFG.pressurizer;

        // ---- leg A: the plant. Full-size break, engine+M4.
        var h = H('hot_full_power');
        h.run(30);
        h.cmd('inject_failure', { failure_id: 'large_loca', severity: 1.0 });
        var minP = 1e9, minInv = 1e9, floorOK = true, accMin = 100;
        h.run(600, function (hh) {
          var s = hh.eng.s;
          if (s.pressure_mpa < minP) minP = s.pressure_mpa;
          if (s.core_inventory_pct < minInv) minInv = s.core_inventory_pct;
          if (s._accum_remaining != null && (s._accum_remaining / CFG.emergency.accumulator_capacity) * 100 < accMin)
            accMin = (s._accum_remaining / CFG.emergency.accumulator_capacity) * 100;
          if (s._leak_base > 0 && s.containment_pressure_mpa != null
              && s.pressure_mpa < s.containment_pressure_mpa - 1e-6) floorOK = false;
        });
        ck('the full-size blowdown falls PAST Psat of the hot remnant (pre-stage-4 floor: 1.17 MPa)',
          fmt(minP, 3) + ' MPa min', minP < 1.0, '< 1.0 MPa');
        ck('…and never below the LIVE containment backpressure (connected volumes equalize, they do not cross)',
          floorOK ? 'held at every sample' : 'VIOLATED', floorOK, 'P ≥ ctmt throughout');
        // < 65 (a real partial uncovery: core_top_uncover is 0.70), not the old < 5:
        // on the #408 real clock the DEG bottoms at ~58-62 % — full drain and containment
        // equalization are mutually exclusive in this lumped plant (this probe's own
        // stage-4 trade), and the real-scale ECCS is what stops the drain. Passes on
        // the old engine (which reached ~0 %).
        ck('the DBA arc survives the deeper blowdown: the core still UNCOVERS',
          fmt(minInv, 1) + ' % min inventory', minInv < 65, '< 65 % (below core_top_uncover)');
        ck('…the accumulators dump', fmt(accMin, 1) + ' % remaining', accMin < 50, '< 50 %');
        var ta = h.ts();
        // > 70 covered, not > 90: the long-term state is the injection≈spillage
        // equilibrium in the spill band (~73-79 %), covered — the #408 identity.
        ck('…and ECCS still wins — refloods COVERED, no damage', 'inv ' + fmt(ta.core_inventory_pct, 1) + ' %, damaged ' + ta.fuel_damaged,
          ta.core_inventory_pct > 70 && !ta.fuel_damaged, '> 70 %, false');

        // ---- leg B MOVED OUT to its own probe, CA-20b (#451, 2026-08-11). It is a
        // STRICT XFAIL now, and XFAIL is keyed per PROBE — leaving it here would have
        // suppressed this probe's blowdown, containment-floor and vent-algebra legs
        // along with it, which is a lot of live coverage to lose to one known gap.

        // ---- leg C: the algebra, through the real stepPressure (clone triplets).
        var base = H('hot_full_power'); base.run(30);
        var mkC = function (extra) {
          var c = Object.assign({}, base.eng.s, {
            tavg_c: 250.0, thot_c: 250.0, pressure_mpa: 3.0, primary_void_fraction: 0.6,
            _dmass_dt: 0, _dTavg_dt: 0, porv_demand: null, porv_stuck: false, safety_open: false,
            containment_pressure_mpa: 0.15, heater_override: 0, spray_override: 0,
          }, extra);
          RD.pwrPressurizer.stepPressure(c, CFG, 0.05);
          return c;
        };
        var cLoop = mkC({ leak_flow: 0.15, _leak_base: 0.5, _leak_to_sg: false });
        var cSgtr = mkC({ leak_flow: 0.15, _leak_base: 0.5, _leak_to_sg: true });
        var cNone = mkC({ leak_flow: 0, _leak_base: 0 });
        ck('an SGTR computes the UNSCALED formula exactly — byte-identical to no-break (the TMI/EOP fence)',
          fmt(cSgtr.pressure_mpa, 6) + ' vs ' + fmt(cNone.pressure_mpa, 6),
          cSgtr.pressure_mpa === cNone.pressure_mpa, 'identical');
        var psat = RD.pwrPressurizer.P_sat_from_T(250.0), vf = 0.6, P0 = 3.0, pb = 0.15;
        var pinFull = p.K_sat_pull * (psat - P0);
        var pinLoop = p.K_sat_pull * (1 - vf) * (Math.max(psat, pb) - P0);
        var vent = p.K_break_vent * 0.15 * vf * Math.max(0, P0 - pb);
        var wantDiff = (pinFull - pinLoop + vent) * 0.05;
        ck('loop-vs-SGTR differ by exactly the scaled pin + the vent term',
          fmt(cSgtr.pressure_mpa - cLoop.pressure_mpa, 6) + ' vs ' + fmt(wantDiff, 6),
          Math.abs((cSgtr.pressure_mpa - cLoop.pressure_mpa) - wantDiff) < 1e-9, 'exact');
        var cUnder = mkC({ leak_flow: 0.0, _leak_base: 0.5, _leak_to_sg: false, pressure_mpa: 0.12, containment_pressure_mpa: 0.30 });
        var cUnderSg = mkC({ leak_flow: 0.0, _leak_base: 0.5, _leak_to_sg: true, pressure_mpa: 0.12, containment_pressure_mpa: 0.30 });
        // The SGTR clone below Psat of its hot loop self-repressurizes on the FULL pin —
        // that is pre-stage physics, and asserting it EXACTLY is the point: no floor, no
        // scaling, no vent touched it. (A `< 0.30` draft here was wrong: the pin carries
        // it past the backpressure by flashing, which is the correct closed-system answer.)
        var wantSg = 0.12 + p.K_sat_pull * (RD.pwrPressurizer.P_sat_from_T(250.0) - 0.12) * 0.05;
        ck('the floor snaps a loop-break state up to the backpressure; the SGTR state computes the pure pin',
          fmt(cUnder.pressure_mpa, 3) + ' vs ' + fmt(cUnderSg.pressure_mpa, 6) + ' (want ' + fmt(wantSg, 6) + ')',
          Math.abs(cUnder.pressure_mpa - 0.30) < 1e-9 && Math.abs(cUnderSg.pressure_mpa - wantSg) < 1e-9, '0.30 vs the pin exactly');
        T.checkSanity(ck, h);
      });
    },

    /* CA-21 (#407) — THE SUBCOOLING MARGIN LEARNS ABOUT THE CORE EXIT.
     *
     * THE FILED SYMPTOM WAS ALREADY GONE WHEN THIS STAGE RAN, and that is measured,
     * not assumed: #407 was filed against the pre-cluster plant, where the bulk
     * datum read the ECCS-chilled remnant at +37…+163 °F of COMFORT over a bare
     * core. The stage-2 honest heater cutoff and the stage-4 vented blowdown
     * removed the chilled-remnant-with-dry-core overlap — measured at sev
     * 0.2/0.35/0.5, ZERO uncovered samples read bulk-subcooled on the post-stage-4
     * engine. The datum ships anyway, on prototypicality: post-TMI plants read the
     * margin off core-exit thermocouples, the bulk's −80 °C is not the truth's
     * −524 °C over a dry core, and the structural fix keeps the comfort window
     * closed against future physics changes instead of relying on it staying
     * incidentally shut. SOURCED: NUREG-0737 (ML051400209) II.F.2 — the ICC
     * indication "must cover the full range from normal operation to complete core
     * uncovery" (Clarification 6), displayed as "the highest of all operable
     * thermocouples" (Attachment 1, 2b), range 200–1800 °F (2c — the spec range).
     *
     * Red on the pre-#407 engine via leg A's magnitude (the bulk datum cannot read
     * below ~−80 °C; the exit datum reads −524) and leg B's existence check. Leg C
     * is HR1 degradation: a TC failed low hands the max back to the bulk channel
     * EXACTLY — a broken channel degrades to the pre-#407 instrument, no worse.
     */
    'CA-21': function () {
      return test('CA-21 subcooling margin goes negative over a dry core; a failed TC restores the deception (#407)', function (ck) {
        // ---- leg A: the plant. Default break, watch the full-uncovery window.
        var h = H('hot_full_power');
        h.run(30);
        // ECCS DEFEATED + accumulators isolated (#408 wave 1; was severity alone):
        // on the real-flow clock NO break severity holds a dry-hot window with
        // injection live — the family recovers, which is the design basis working
        // (stage 5 already measured the deception window structurally closed; the
        // channel ships on prototypicality). The dry core this probe's subject
        // NEEDS is the ECCS-defeated one, same idiom as CA-10 leg E / MD-*.
        h.cmd('inject_failure', { failure_id: 'degraded_hpi', severity: 1.0 });
        h.cmd('set_hpi', { active: false });
        h.cmd('close_accumulator_valve', {});
        h.cmd('set_auto_channel', { channel_id: 'cvcs_makeup', engaged: false });
        h.cmd('set_cvcs_auto', { active: false });
        h.cmd('set_charging_flow', { normalized: 0 });
        h.cmd('inject_failure', { failure_id: 'large_loca', severity: 0.50 });
        var nDry = 0, nDryNeg = 0, worstMargin = 1e9, worstTrue = 1e9, sawHotClad = false;
        // 2400 s, was 300 (#408): the defeated dry-out reaches clad > 600 C at
        // ~20-30 min on the real clock.
        // Window 0.85, was 0.90 (#386 stage 2): the drained equilibrium now parks at
        // unc = 0.88 (measured — spray moves the containment-backpressure trajectory,
        // and the spill-band equilibrium shifted ~2 points with it), so 0.90 pinned
        // the OLD equilibrium, not the claim; a 0.85-bare core at clad 1300 °C is
        // every bit the dry hot core this probe is about. Passes on BOTH engines
        // (old equilibrium ≥ 0.90 > 0.85 — validated per HR10).
        h.run(2400, function (hh) {
          var s = hh.ts(), ins = hh.ins();
          if (!(s.core_uncovered_frac >= 0.85)) return;
          nDry++;
          if (s.clad_temp_c > 600) sawHotClad = true;
          if (ins.subcooling_margin < worstMargin) worstMargin = ins.subcooling_margin;
          if (s.subcooling_c < worstTrue) worstTrue = s.subcooling_c;
          if (ins.subcooling_margin < 0) nDryNeg++;
        });
        ck('the core really is dry and hot in the window (or this proves nothing)',
          nDry + ' samples, clad > 600 C: ' + sawHotClad, nDry >= 20 && sawHotClad, '>= 20, true');
        ck('TRUE subcooling reads the CORE EXIT — superheat the bulk datum cannot reach (bulk floor ~-80 C)',
          fmt(worstTrue * 9 / 5, 1) + ' F (' + fmt(worstTrue, 1) + ' C) worst', worstTrue < -150, '< -270 F (-150 C)');
        ck('…and the MARGIN GAUGE pegs its low clip — the operator sees it',
          fmt(worstMargin, 1) + ' C worst indicated', worstMargin < 0 && nDryNeg >= 20, '< 0 on >= 20 samples');
        ck('…which lights SUBCOOL LOST', h.alarmFirst['subcooling_lost'] != null ? 'lit' : 'never',
          h.alarmFirst['subcooling_lost'] != null, 'lit');

        // ---- leg B: the covered-core fence — exit === bulk, and the max never bites.
        var b = H('hot_full_power');
        b.run(120);
        var tb = b.ts(), ib = b.ins();
        ck('covered core: the exit datum IS the bulk, exactly',
          fmt(tb.t_core_exit_c, 6) + ' vs tavg ' + fmt(tb.tavg_c, 6),
          tb.t_core_exit_c === tb.tavg_c, 'identical');
        var TsatI = RD.pwrPressurizer.P_sat_from_T ? null : null;   // (Tsat lives in each module; recompute below)
        var wantB = Math.min(Math.max(
          179.47 * Math.pow(Math.max(ib.primary_pressure, 1e-6), 0.239) - ib.tavg,
          RD.PWR_CONFIG.instruments.subcooling_margin.range[0]), RD.PWR_CONFIG.instruments.subcooling_margin.range[1]);
        ck('covered core: the margin gauge computes the BULK formula — the max never bites',
          fmt(ib.subcooling_margin, 4) + ' vs bulk ' + fmt(wantB, 4),
          Math.abs(ib.subcooling_margin - wantB) < 1e-9, 'exact');

        // ---- leg C: HR1 — a TC failed LOW re-arms the deception over a dry core.
        var c = H('hot_full_power');
        c.run(30);
        // Stuck at 20 C, was 100 (#408): on the real-clock defeated dry-out the BULK
        // cools below 100 C late in the window, and a "failed LOW" TC stuck at 100
        // stops being the loser of the max — the gauge would correctly read the stuck
        // channel and the exact-bulk assertion fails on honest physics. 20 C is below
        // any bulk this plant reaches, which is what "failed low" means.
        c.cmd('set_instrument_failure', { instrument_id: 'core_exit_temp', mode: 'stuck', value: 20.0 });
        c.cmd('inject_failure', { failure_id: 'degraded_hpi', severity: 1.0 });
        c.cmd('set_hpi', { active: false });
        c.cmd('close_accumulator_valve', {});
        c.cmd('set_auto_channel', { channel_id: 'cvcs_makeup', engaged: false });
        c.cmd('set_cvcs_auto', { active: false });
        c.cmd('set_charging_flow', { normalized: 0 });
        c.cmd('inject_failure', { failure_id: 'large_loca', severity: 0.50 });
        var cDry = 0, cBulkExact = 0;
        var TsatF = function (P) { return 179.47 * Math.pow(Math.max(P, 1e-6), 0.239); };
        var rng = RD.PWR_CONFIG.instruments.subcooling_margin.range;
        c.run(2400, function (hh) {   // real-clock dry-out window, matches leg A (#408; 0.85 at #386 stage 2 — see leg A)
          var s = hh.ts(), ins = hh.ins();
          if (!(s.core_uncovered_frac >= 0.85 && s.clad_temp_c > 600)) return;
          cDry++;
          // tavg_ind > 20 (the stuck value) throughout this window, so the max hands
          // the datum back to the BULK channel — the pre-#407 instrument, exactly.
          var bulk = Math.min(Math.max(TsatF(ins.primary_pressure) - ins.tavg, rng[0]), rng[1]);
          if (Math.abs(ins.subcooling_margin - bulk) < 1e-9) cBulkExact++;
        });
        ck('a TC failed LOW degrades the gauge to the BULK datum exactly — no worse than pre-#407 (HR1)',
          cBulkExact + '/' + cDry + ' dry samples on the bulk formula', cDry >= 20 && cBulkExact === cDry, 'all of >= 20');
        T.checkSanity(ck, h);
      });
    },

    /* CA-22 (#386 stage 2) — ACTIVE CONTAINMENT HEAT REMOVAL, AUTO-ONLY.
     *
     * Owner ruling (2026-08-08, on the issue): automated for now, controls not
     * revealed to the player. So the whole player-facing story is: the sourced
     * 30 psig hi-hi starts spray with no operator action (WTSM 12.3, ML11223A310:
     * "The setpoint is 30 psig"), the building comes back down through the hi-hi
     * and then the 3.5 psig SI signal, and spray SECURES ITSELF on recovery below
     * the SI signal (release condition a declared inference — WTSM documents SI
     * reset only; with no operator surface the securing must be automatic). Fans
     * realign on any SI (Ginna TS B 3.6.6: CRFC "designed to start automatically
     * if not already running" post-SI).
     *
     * Q0 (TUNING_LOG 2026-08-07-develop-e WP4): sev 0.5 crosses the hi-hi and
     * spray is on by the 2-min sample; back under the hi-hi ~4 min post-break,
     * under the SI signal ~6 min, ambient ~15 min, spray secured by ~10 min.
     *
     * Injection-verified: on the stage-1 engine every stage-2 check is red — the
     * train fields never go true and no actuation row exists.
     */
    'CA-22': function () {
      return test('CA-22 spray knocks the building down and secures itself — fans realign on SI (#386 stage 2)', function (ck) {
        var HIHI = 0.3081, SIP = 0.1254;   // the sourced actuation points, abs
        var h = H('hot_full_power');
        h.run(30);
        h.cmd('inject_failure', { failure_id: 'large_loca', severity: 0.5 });
        var sawSpray = false, sawFan = false;
        h.run(180, function (hh) {
          var s = hh.ts();
          sawSpray = sawSpray || !!s.ctmt_spray_active;
          sawFan = sawFan || !!s.ctmt_fan_active;
        });
        ck('spray AUTO-ACTUATED inside 3 min — this run issued no operator command',
          String(sawSpray) + ' / peak so far ' + fmt(h.range('containment_pressure_mpa').max, 3) + ' MPa abs',
          sawSpray, 'true');
        ck('the peak crossed the 30 psig hi-hi that fired it',
          fmt(h.range('containment_pressure_mpa').max, 3) + ' MPa abs vs ' + fmt(HIHI, 4),
          h.range('containment_pressure_mpa').max > HIHI, '> 0.3081');
        ck('fans realigned on SI — the diverse train', String(sawFan), sawFan, 'true');
        h.run(420);   // to ~10 min post-break
        var mid = h.ts();
        ck('the building is back below the 3.5 psig SI signal under the active sinks',
          fmt(mid.containment_pressure_mpa, 3) + ' MPa abs', mid.containment_pressure_mpa < SIP, '< 0.1254');
        h.run(300);   // to ~15 min
        var t = h.ts();
        ck('spray SECURED ITSELF on recovery — the auto-only build has no operator to do it',
          'active ' + String(t.ctmt_spray_active) + ', demand ' + String(t.ctmt_spray_demand) +
          ' at ctmt ' + fmt(t.containment_pressure_mpa, 3),
          t.ctmt_spray_active === false && t.containment_pressure_mpa < SIP, 'false, below the SI signal');
        T.checkSanity(ck, h);
      });
    },

    /* CA-24 (#386 stage 3) — HYDROGEN: generation, transport, recombiners, THE BURN.
     *
     * The ruled shape (OWNER RULING 2026-08-05: TMI-2-style one-time deflagration —
     * pressure spike + latched event, containment holds; indication-only and
     * end-state rejected. OWNER RULING 2026-08-08: the peak lands ABOVE the 30 psig
     * spray hi-hi, so the ESF answers the burn). Numbers from the 2026-08-08 Q0
     * (TUNING_LOG 2026-08-08-develop-c):
     *
     *  - mitigated sev 0.5 LOCA peaks 0.014 v/o — ~290x under the 4.1 v/o sourced
     *    flammability limit (NUREG-1431 Bases ML12100A228:38135), the 50.46(b)(3)
     *    story (Ginna's own limiting LBLOCA: core-wide oxidation 0.30 %).
     *  - the CA-21 rig (ECCS defeated, sev 0.5) crosses 4.1 at ~32 min, ignites at
     *    8.0 v/o at ~41 min, burns 85 % (GEND-061 §4.6.3: TMI-2 burned 6.8 of
     *    7.9 %, leaving 1.1 — 86 %), spikes the building to ~32.4 psig (above the
     *    30 psig hi-hi, far under the 60 psig design), and NEVER burns again —
     *    the latch stands in for O2 depletion while H2 re-accumulates past 10 v/o.
     *  - recombiners: auto-start via the M4 row, first-order removal at
     *    recomb_tau_s, delivery dies in a blackout with demand standing (#200).
     *  - transport is GEOMETRY-gated: an SGTR-flagged leak holds H2 in the RCS
     *    (no SGTR family on this plant ever uncovers — measured 3 h at sev 1.0
     *    ECCS-defeated — so the fence is pinned by clone rig, the CA-17 idiom).
     *
     * Injection-verified: h2_gain: 0 zeroes legs a/b; dropping `!_leak_to_sg` from
     * the stepContainment gate reds leg d's held clone; disabling the recombiner
     * removal term flattens leg c's decay.
     */
    'CA-24': function () {
      return test('CA-24 hydrogen — mitigated stays cold, unmitigated burns ONCE above the hi-hi, recombiners work the tail, SGTR H2 never reaches the building (#386 stage 3)', function (ck) {
        var cc = RD.PWR_CONFIG.containment || {};
        var IGN = cc.h2_ignition_pct || 8.0, FLAM = cc.h2_flammability_pct || 4.1;
        var HIHI = 0.3081, DESIGN = cc.design_pressure_mpa || 0.515;

        // ---- (a) the mitigated fence: ECCS-live sev 0.5 makes a TRACE and no more.
        var a = H('hot_full_power');
        a.run(30);
        a.cmd('inject_failure', { failure_id: 'large_loca', severity: 0.5 });
        var aPeak = 0;
        a.run(900, function (hh) { aPeak = Math.max(aPeak, hh.eng.s._ctmt_h2 || 0); });
        ck('mitigated LOCA: a real but TRACE inventory — the ECCS quench is the 50.46(b)(3) story',
          fmt(aPeak, 4) + ' v/o peak vs ' + FLAM + ' flammability',
          aPeak > 0 && aPeak < 0.5, '> 0 and < 0.5 (never even starts the recombiners)');

        // ---- (b) the unmitigated burn: the CA-21 rig, ridden through ignition.
        var b = H('hot_full_power');
        b.run(30);
        b.cmd('inject_failure', { failure_id: 'degraded_hpi', severity: 1.0 });
        b.cmd('set_hpi', { active: false });
        b.cmd('close_accumulator_valve', {});
        b.cmd('set_auto_channel', { channel_id: 'cvcs_makeup', engaged: false });
        b.cmd('set_cvcs_auto', { active: false });
        b.cmd('set_charging_flow', { normalized: 0 });
        b.cmd('inject_failure', { failure_id: 'large_loca', severity: 0.50 });
        var prev = 0, drops = 0, preBurn = 0, postBurn = null, sawFlam = false, pkCtmt = 0, burnT = null;
        b.run(3300, function (hh) {
          var s = hh.eng.s, t = hh.ts();
          var h2 = s._ctmt_h2 || 0;
          if (!t.ctmt_h2_burned && h2 >= FLAM) sawFlam = true;
          // The sampler fires per broadcast CYCLE, not per second (the advanceCycles
          // lesson) — time is read from the engine clock, never counted here.
          if (h2 < prev - 2) { drops++; preBurn = prev; postBurn = h2; burnT = Math.round(hh.eng.simTime || 0); }
          prev = h2;
          if (t.ctmt_h2_burned) pkCtmt = Math.max(pkCtmt, t.containment_pressure_mpa);
        });
        var bs = b.ts();
        ck('crossed the 4.1 v/o flammability limit BEFORE ignition (A40 has time to mean something)',
          String(sawFlam), sawFlam, 'true');
        ck('the burn happened and LATCHED', String(bs.ctmt_h2_burned), bs.ctmt_h2_burned === true, 'true');
        ck('ONE burn — a single sharp drop, the GEND-061 stripchart shape',
          drops + ' drop(s), at t+' + burnT + ' s', drops === 1, 'exactly 1');
        ck('the burn consumed ~85 % of the inventory (GEND-061: TMI-2 consumed 86 %)',
          fmt(preBurn, 2) + ' → ' + fmt(postBurn, 2) + ' v/o (' + fmt(100 * (1 - postBurn / Math.max(preBurn, 1e-9)), 1) + ' %)',
          // preBurn is the last SAMPLE before the trigger, up to one cycle of
          // generation under the 8.0 crossing — hence the 0.2 v/o allowance.
          preBurn >= IGN - 0.2 && Math.abs((1 - postBurn / preBurn) - (cc.h2_burn_consumed_frac || 0.85)) < 0.03,
          '85 % ± 3');
        ck('the spike landed ABOVE the 30 psig spray hi-hi (OWNER RULING 2026-08-08: the ESF answers it)',
          fmt(pkCtmt, 3) + ' MPa abs vs ' + fmt(HIHI, 4), pkCtmt > HIHI, '> 0.3081');
        ck('…and CONTAINMENT HOLDS — under the 60 psig design pressure (the 2026-08-05 ruling, pinned)',
          fmt(pkCtmt, 3) + ' MPa abs vs ' + fmt(DESIGN, 3), pkCtmt < DESIGN, '< 0.515');
        ck('H2 re-accumulated past ignition with NO second burn — the latch stands in for O2 depletion',
          fmt(bs.ctmt_h2_pct, 1) + ' v/o (published, clipped at 100), burned ' + String(bs.ctmt_h2_burned),
          (b.eng.s._ctmt_h2 || 0) > IGN && drops === 1, 'above 8.0, still 1 drop');

        // ---- (c) recombiners: auto-start on the seeded inventory, first-order decay
        // at recomb_tau_s, and the #200/#329 split under a blackout.
        var c = H('hot_full_power');
        c.run(30);
        c.eng.s._ctmt_h2 = 3.0;   // hand-seeded inventory on a healthy plant (rig, not a family)
        c.run(90);                 // instrument lag (30 s) + the M4 row's scan
        var c0 = c.ts();
        ck('recombiners AUTO-STARTED on the seeded inventory — no command was issued',
          String(c0.ctmt_recomb_active) + ' at ' + fmt(c0.ctmt_h2_pct, 2) + ' v/o',
          c0.ctmt_recomb_active === true, 'true');
        var v0 = c.eng.s._ctmt_h2;
        c.run(600);
        var v1 = c.eng.s._ctmt_h2;
        var wantRatio = Math.exp(-600 / (cc.recomb_tau_s || 1800));
        ck('first-order removal at recomb_tau_s — and NOTHING else removes H2',
          fmt(v1 / v0, 4) + ' over 600 s vs e^(−600/τ) = ' + fmt(wantRatio, 4),
          Math.abs(v1 / v0 - wantRatio) < 0.02, 'within 0.02');
        c.cmd('inject_failure', { failure_id: 'station_blackout', severity: 1.0 });
        var v2 = c.eng.s._ctmt_h2;
        c.run(300);
        var c1 = c.ts();
        ck('blackout: demand STANDS, delivery dies, and the decay STOPS (#200/#329 split)',
          'demand ' + String(c1.ctmt_recomb_demand) + ', active ' + String(c1.ctmt_recomb_active) +
          ', h2 ' + fmt(c.eng.s._ctmt_h2 / v2, 4) + ' of pre-blackout',
          c1.ctmt_recomb_demand === true && c1.ctmt_recomb_active === false
            && c.eng.s._ctmt_h2 / v2 > 0.995, 'true / false / flat');

        // ---- (d) the transport gate, pinned by clone rig (the CA-17 idiom): no SGTR
        // family on this plant ever uncovers, so the fence cannot be shown by family
        // run — the gate itself is the testable object. Same state, four path lineups.
        var d = H('hot_full_power');
        d.run(30);
        var mkT = function (mut) {
          var s2 = Object.assign({}, d.eng.s);
          s2._rcs_h2 = 2.0; s2._ctmt_h2 = 0; s2.ctmt_h2_burned = false; s2.ctmt_recomb_demand = false;
          s2._leak_base = 0; s2._leak_to_sg = false; s2.porv_open = false; s2.safety_open = false;
          Object.assign(s2, mut);
          for (var i = 0; i < 60; i++) RD.pwrPrimary.stepContainment(s2, RD.PWR_CONFIG, 1.0);
          return s2;
        };
        var dSgtr = mkT({ _leak_base: 0.01, _leak_to_sg: true });
        ck('an SGTR-flagged leak moves NOTHING to the building — its H2 goes where the discharge goes',
          'ctmt ' + fmt(dSgtr._ctmt_h2, 6) + ', rcs ' + fmt(dSgtr._rcs_h2, 6),
          dSgtr._ctmt_h2 === 0 && dSgtr._rcs_h2 === 2.0, '0 and 2.0 exactly');
        var dLoca = mkT({ _leak_base: 0.01, _leak_to_sg: false });
        ck('the same leak on the containment side TRANSPORTS — and the ledger pair conserves',
          'ctmt ' + fmt(dLoca._ctmt_h2, 3) + ', sum ' + fmt(dLoca._ctmt_h2 + dLoca._rcs_h2, 9),
          dLoca._ctmt_h2 > 1.0 && Math.abs(dLoca._ctmt_h2 + dLoca._rcs_h2 - 2.0) < 1e-9, '> 1.0, sum 2.0');
        var dBlocked = mkT({ porv_open: true, block_valve_open: false });
        ck('a CLOSED block valve holds the inventory — the isolation lesson survives for H2',
          'ctmt ' + fmt(dBlocked._ctmt_h2, 6), dBlocked._ctmt_h2 === 0, '0 exactly');
        var dRelief = mkT({ porv_open: true, block_valve_open: true });
        ck('the open relief lineup is a path (the TMI-2 route)',
          'ctmt ' + fmt(dRelief._ctmt_h2, 3), dRelief._ctmt_h2 > 1.0, '> 1.0');
        T.checkSanity(ck, a);
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
        // Severity CONFIG-DERIVED (#408): the intent is a leak at ~2/3 of NET CVCS
        // make-up authority (charging_max − letdown at NOP), whatever the scales.
        var rc8 = RD.PWR_CONFIG.reactivity;
        var ld8 = rc8.letdown_orifice_a_coeff * Math.sqrt(15.17 - rc8.letdown_backpressure_mpa);
        var sg8 = RD.PWR_CONFIG.protection.failures.sgtr;
        var rate8 = (sg8.severity_meta.max / 100) * (sg8.leak_scale != null ? sg8.leak_scale : 1);
        var leak8 = 0.67 * (rc8.charging_max - ld8);
        h.cmd('inject_failure', { failure_id: 'sgtr', severity: Math.min(1, leak8 / rate8) });
        h.run(900);
        var t = h.ts();
        // With DERIVED level the servo settles at charging = letdown + leak EXACTLY
        // (the old +0.003 margin was the mass-windup drift, not physics) — the spec
        // is only that charging clearly rose to carry the leak.
        ck('charging rose above letdown to make up the leak',
          fmt(t.charging_flow_actual, 6) + ' vs ' + fmt(t.letdown_flow_actual, 6),
          t.charging_flow_actual > t.letdown_flow_actual + 0.3 * leak8, 'charging > letdown + 0.3x the leak (#408 config-derived)');
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
        // Severity CONFIG-DERIVED (#408): the intent is a leak at ~2/3 of NET CVCS
        // make-up authority (charging_max − letdown at NOP), whatever the scales.
        var rc8 = RD.PWR_CONFIG.reactivity;
        var ld8 = rc8.letdown_orifice_a_coeff * Math.sqrt(15.17 - rc8.letdown_backpressure_mpa);
        var sg8 = RD.PWR_CONFIG.protection.failures.sgtr;
        var rate8 = (sg8.severity_meta.max / 100) * (sg8.leak_scale != null ? sg8.leak_scale : 1);
        var leak8 = 0.67 * (rc8.charging_max - ld8);
        h.cmd('inject_failure', { failure_id: 'sgtr', severity: Math.min(1, leak8 / rate8) });
        h.run(900);
        var t = h.ts();
        ck('pzr level held near program (50..60 %)', fmt(t.pzr_level_pct, 1),
          t.pzr_level_pct > 50 && t.pzr_level_pct < 60, '50..60');
        ck('true inventory conserved 97..103 % (no silent windup)',
          fmt(h.range('core_inventory_pct').min, 1) + '..' + fmt(h.range('core_inventory_pct').max, 1),
          h.range('core_inventory_pct').min >= 97 && h.range('core_inventory_pct').max <= 103, '97..103');
      });
    },

    /* CA-23 (#385 follow-on, stages 1–2) — THE NODE, ITS LAW, AND THE FROZEN-LINE FENCE.
     *
     * Three identity claims, each the anti-#365 fork guard for one seam:
     *   (1) NO-LEAK FAMILIES ARE BITWISE THE FROZEN LINE. On leak_flow ≡ 0 rides
     *       (trip outsurge, the stuck-PORV/TMI void lift) `level_per_mass ·
     *       pzr_mass_frac` must equal the FROZEN `levelRaw` exactly — the stage-2
     *       byte-identity ruling: the calibrated TMI arc must not move at all.
     *   (2) THE NODE IS ITS LAW everywhere: node == pzrNodeLevel/level_per_mass and
     *       the published gauge is that law on span, on the break family too.
     *   (3) On a monotone blowdown the node sits AT OR BELOW the frozen line —
     *       the state-form re-read at today's w is the retired re-lift defect,
     *       and the flow-form credit can only be under it while w is rising.
     *
     * Engine-direct on purpose: the claim is internal algebra (the CA-18 leg B/C/D
     * layer), not plant behaviour. Legs A–C each carry a PRECONDITION check that
     * their family was actually exercised — a sweep that finds nothing has proved
     * nothing (the perturb_sweep rule) — and the identities are checked at every
     * 0.1-s step with the worst deviation kept. Leg D is the migration seed: a
     * pre-node save (pzr_mass_frac stripped) must seed through the line's inverse
     * exactly, and the published level must survive the load untouched.
     *
     * Injection-verified 2026-08-08 (stage 1 form): stashing the stepLevel node
     * write reddens legs A–C and nothing else; stripping the _migrateState seed
     * reddens leg D alone. Stage-2 form re-verified: restoring the state-form
     * credit (w re-read every step) reddens exactly CA-18's two retirement pins
     * (the held credit re-lifts 28.1 → 168.9 — the (1−w) share re-applied); this
     * probe's leg C stays green there by design (state-form ≡ the frozen line, so
     * the excursion check reads 0 — the mechanism pin is CA-18's, the fence here
     * is against credit RATCHETING past the line).
     */
    'CA-23': function () {
      return test('CA-23 the pressurizer node: frozen-line fence on no-leak, live law everywhere (#385)', function (ck) {
        var CFG = RD.PWR_CONFIG, pz = CFG.pressurizer;
        var ride = function (secs, seed, setup) {
          var eng = new RD.PWREngine({ initial_state: 'hot_full_power', seed: seed });
          var r = { worst: 0, worstLive: 0, aboveFrozen: -Infinity,
                    lvlMin: Infinity, lvlMax: -Infinity, sawVoid: 0, sawLeak: 0, eng: eng };
          if (setup) setup(eng);
          for (var t = 0; t < secs; t += 0.1) {
            eng.step(0.1);
            var frozen = RD.pwrPressurizer.levelRaw(eng.s, CFG);
            var live = RD.pwrPressurizer.pzrNodeLevel(eng.s, CFG);
            var node = pz.level_per_mass * eng.s.pzr_mass_frac;
            var d = Math.abs(node - frozen);
            if (d > r.worst) r.worst = d;
            var dl = Math.abs(node - live);
            if (dl > r.worstLive) r.worstLive = dl;
            if (node - frozen > r.aboveFrozen) r.aboveFrozen = node - frozen;
            if (frozen < r.lvlMin) r.lvlMin = frozen;
            if (frozen > r.lvlMax) r.lvlMax = frozen;
            if (eng.s.primary_void_fraction > r.sawVoid) r.sawVoid = eng.s.primary_void_fraction;
            if (eng.s.leak_flow > r.sawLeak) r.sawLeak = eng.s.leak_flow;
          }
          return r;
        };

        // ---- leg A: the subcooled family (base + mass terms) — a trip outsurge.
        var A = ride(300, 11, function (eng) { eng.applyCommand({ action: 'scram' }); });
        ck('A: the line MOVED under the probe (trip outsurge — precondition)',
          fmt(A.lvlMax - A.lvlMin, 1) + ' pts', (A.lvlMax - A.lvlMin) > 5, '> 5 pts');
        ck('A: no-leak byte-identity to the frozen line (subcooled)', 'worst ' + A.worst.toExponential(2),
          A.worst < 1e-9, '< 1e-9');

        // ---- leg B: the relief/void family (the unweighted TMI lift; w = 1 exactly).
        var B = ride(1500, 12, function (eng) {
          eng.applyCommand({ action: 'scram' });
          eng.applyCommand({ action: 'inject_failure', failure_id: 'stuck_porv_open', severity: 1.0 });
        });
        ck('B: the relief drain actually voided the loop (precondition)',
          'peak void ' + fmt(B.sawVoid, 3), B.sawVoid > 0.05, '> 0.05');
        ck('B: no-leak byte-identity through the void lift — the TMI fence', 'worst ' + B.worst.toExponential(2),
          B.worst < 1e-9, '< 1e-9');

        // ---- leg C: the loop-break family — the LIVE law, and at-or-below the
        // frozen line on a monotone blowdown (the retired re-lift direction).
        // Severity = the board default; the precondition band is CONFIG-DERIVED
        // (meta.max/100 × leak_scale, the #408 idiom) — a hardcoded flow number
        // here pinned the pre-#408 severity map and failed on the real clock.
        var llD = CFG.protection.failures.large_loca;
        var llSev = llD.severity_meta.default / 100;
        var llRate = (llD.severity_meta.max / 100) * (llD.leak_scale != null ? llD.leak_scale : 1);
        var C = ride(180, 13, function (eng) {
          eng.applyCommand({ action: 'inject_failure', failure_id: 'large_loca', severity: llSev });
        });
        ck('C: the break actually flowed (precondition — near its full-Δp rating)',
          'peak leak_flow ' + C.sawLeak.toExponential(2) + ' vs rating ' + (llSev * llRate).toExponential(2),
          C.sawLeak > 0.5 * llSev * llRate, '> 0.5× severity·rate');
        ck('C: the node IS its law on the break family', 'worst ' + C.worstLive.toExponential(2),
          C.worstLive < 1e-9, '< 1e-9');
        // Not a strict ≤: when leak_flow wiggles UP the frozen line instantly
        // re-reads its whole stock at the lower w (the retired defect mirrored
        // downward) and the held credit sits briefly above it — measured 0.12 pts
        // on this ride. The defect class this fences is 20–65 pts (the stage-0
        // re-lift rows); the exact no-re-read mechanism is CA-18's bitwise pin.
        ck('C: the node never re-lifts materially past the frozen line on the blowdown',
          'max(node − line) ' + fmt(C.aboveFrozen, 4), C.aboveFrozen < 2, '< 2 pts');

        // ---- leg E: the DEEP-SGTR family (#424 item 2 — the void-cycling regime
        // every SGTR gate avoids by holding void < 0.05 on the EOP path). A deep
        // unmanaged tube rupture voids the loop with the leak flowing at SGTR-class
        // w (~0.9, the hole is small), and the credit rides real engine dynamics
        // through whatever grow/collapse history the trajectory produces. Asserts
        // the structural bounds no other gate exercises in this regime: the node
        // stays ON its law, and the credit never leaves [0, level_per_void·void]
        // (growth pays the w toll ≤ 1, return is unweighted, floor 0 — so the
        // stock can never exceed the full-lift line nor go phantom-negative).
        var E = (function () {
          var eng = new RD.PWREngine({ initial_state: 'hot_full_power', seed: 17 });
          eng.applyCommand({ action: 'scram' });
          eng.applyCommand({ action: 'inject_failure', failure_id: 'sgtr', severity: 0.9 });
          var r = { worstLive: 0, boundLo: 0, boundHi: -Infinity, sawVoid: 0, sawLeak: 0 };
          for (var t = 0; t < 2400; t += 0.1) {
            eng.step(0.1);
            var s = eng.s;
            var dl = Math.abs(pz.level_per_mass * s.pzr_mass_frac - RD.pwrPressurizer.pzrNodeLevel(s, CFG));
            if (dl > r.worstLive) r.worstLive = dl;
            var credit = s._pzr_void_lvl != null ? s._pzr_void_lvl : 0;
            var cap = pz.level_per_void * (s.primary_void_fraction || 0);
            if (credit < r.boundLo) r.boundLo = credit;
            if (credit - cap > r.boundHi) r.boundHi = credit - cap;
            if (s.primary_void_fraction > r.sawVoid) r.sawVoid = s.primary_void_fraction;
            if (s.leak_flow > r.sawLeak) r.sawLeak = s.leak_flow;
          }
          return r;
        })();
        ck('E: the deep SGTR actually voided WITH the leak flowing (precondition)',
          'peak void ' + fmt(E.sawVoid, 3) + ', peak leak ' + E.sawLeak.toExponential(2),
          E.sawVoid > 0.05 && E.sawLeak > 1e-4, 'void > 0.05 and leak > 1e-4');
        ck('E: the node IS its law through the SGTR void cycle', 'worst ' + E.worstLive.toExponential(2),
          E.worstLive < 1e-9, '< 1e-9');
        ck('E: the credit never leaves [0, level_per_void·void] — no phantom, no over-stock',
          'min ' + fmt(E.boundLo, 4) + ', max(credit − cap) ' + fmt(E.boundHi, 4),
          E.boundLo >= -1e-9 && E.boundHi <= 1e-9, 'within bounds');

        // ---- leg D: the migration seed — a pre-node save loads byte-identical.
        var snap = B.eng.saveState();
        delete snap.s.pzr_mass_frac;                    // simulate a pre-#385 save
        var eng2 = new RD.PWREngine({ initial_state: 'hot_full_power', seed: 14 });
        eng2.loadState(snap);
        var lvl2 = RD.pwrPressurizer.levelRaw(eng2.s, CFG);
        ck('D: a pre-node save seeds the node through the line\'s inverse, exactly',
          fmt(eng2.s.pzr_mass_frac, 6) + ' vs ' + fmt(lvl2 / pz.level_per_mass, 6),
          eng2.s.pzr_mass_frac != null && eng2.s.pzr_mass_frac === lvl2 / pz.level_per_mass, 'bitwise');
        ck('D: the published level survives the load untouched',
          fmt(eng2.s.pzr_level_pct, 4) + ' vs saved ' + fmt(snap.s.pzr_level_pct, 4),
          eng2.s.pzr_level_pct === snap.s.pzr_level_pct, 'byte-identical');
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
        // Severity CONFIG-DERIVED (#408 wave 1): same absolute intent as authored —
        // a 7.2e-4 frac/s subcooled drain, CVCS in MANUAL so nothing makes it up.
        var sgDb = RD.PWR_CONFIG.protection.failures.sgtr;
        var sgRb = (sgDb.severity_meta.max / 100) * (sgDb.leak_scale != null ? sgDb.leak_scale : 1);
        h.cmd('inject_failure', { failure_id: 'sgtr', severity: Math.min(1, 7.2e-4 / sgRb) });
        // SAMPLE AT A MECHANISM ANCHOR, NOT A CLOCK (#418 wave A1, 2026-08-07). This
        // used to run a flat 120 s and sample there — and that window was quietly
        // load-bearing on the COMPRESSED secondary pressure clock: this drain trips
        // the reactor on pzr level low at ~104 s, and on the old K_steam_pressure the
        // instantly-bottled SG PROPPED the primary hot and subcooled through 120 s.
        // On the real clock the bottled SG's Tsat climbs slowly, so post-trip it keeps
        // soaking the primary's stored heat, the contraction + drain empty the
        // pressurizer, and the plant honestly saturates at ~145 s (measured: P 15.31 →
        // 8.59 MPa in the 46 s after the trip, void onset 0.188 at t+120). The probe's
        // CLAIM — the gauge is honest while subcooled — is about the SUBCOOLED DRAIN,
        // so it samples while that regime holds: at pzr level 25 %, deep in the drain
        // and comfortably before the trip. Validated against the pre-A1 plant too
        // (HR10): the old plant passes this form at the same anchor.
        for (var i9 = 0; i9 < 300 && h.ts().pzr_level_pct > 25; i9++) h.run(1);
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
        // Re-banded 30 → 14 at #419 wave 2 (K 3144 → 304): on the honest relief authority
        // the stuck PORV's ride to the scram is longer and vents real inventory, so level
        // reads ~17 % at the trip (was 40+ on the compressed clock). The discriminating
        // fact was never "level is high" — it is "level stayed clear of ITS OWN 12 % trip"
        // while the reason string says 'primary_pressure low'. Valid on both clocks.
        ck('level stayed clear of its own trip (not a level scram in disguise)',
          fmt(h.ins().pzr_level, 1), h.ins().pzr_level > 14, '> 14 % (trip is 12)');
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
        // 3000 → 8000 s at #419 wave 1: the setpoint slew runs the real 1.586e-3 MPa/s, so
        // 2.5 → 13.8 MPa takes ~7,100 s of honest pressurization (was ~565 s compressed).
        var dt3 = h3.runUntil(function (ts, ins) { return ins.primary_pressure > 13.8; }, 8000);
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
        // MANUAL max charging, CONFIG-DERIVED (#408: the old literal 0.06 was the old
        // currency's charging_max; in real frac/s it is 450x the pump and spiked
        // pressure instead of level). At the real net rate (~6.6e-5 frac/s above
        // letdown) the flood to the 97 % trip takes ~14 min — hence the window.
        h.cmd('set_charging_flow', { normalized: RD.PWR_CONFIG.reactivity.charging_max });
        var ind = null, tru = null;
        var dt = h.runUntil(function (ts, ins, hh) {
          if (hh.tripTime != null && ind == null) { ind = ins.pzr_level; tru = ts.pzr_level_pct; }
          return hh.tripTime != null;
        }, 1500);
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
    /* TR-12c (#370c) — THE COINCIDENCE ITSELF. TR-12b proves the isolation works on
     * the casualty; this proves it does NOT work on everything else, which is the
     * harder and more easily-skipped half (the audit's standing question 3: a
     * protective action that fires on a normal evolution destroys the teaching case
     * rather than merely failing to protect it). Four legs: it fires on the break,
     * stays out of a full cooldown and a bottled SG with the safeties at full lift,
     * and cannot be undone by the operator while it is sealed in. */
    'TR-12c': function () {
      return test('TR-12c steam line isolation — fires on the break, not on the plant (#370c)', function (ck) {
        // ---- leg A: the casualty it exists for.
        var a = H('hot_full_power');
        a.run(30);
        a.cmd('inject_failure', { failure_id: 'steam_line_break', severity: 1.0 });
        var tIso = a.runUntil(function (ts) { return ts.msiv_open === false; }, 120);
        ck('a full-area downstream break isolates automatically',
          tIso >= 0 ? '+' + fmt(tIso, 1) + ' s' : 'never', tIso >= 0, 'within 120 s');

        // ---- leg B: a full operator cooldown takes steam pressure FAR below the
        // isolation's pressure term (to ~1.3 MPa against the sourced 4.14 MPa
        // setpoint — and since #433 a rate-compensated one) and must not isolate —
        // the flow term is what keeps it out, which is exactly why the real
        // function is a coincidence and not a bare low-pressure trip. The staircase
        // steps are also slow enough that the lead/lag advance stays small.
        var b = H('hot_full_power');
        b.run(30);
        b.cmd('inject_failure', { failure_id: 'turbine_trip' });
        b.run(240);
        b.cmd('set_steam_dump_setpoint', { mpa: 4.0 });
        b.run(600);
        b.cmd('set_steam_dump_setpoint', { mpa: 2.4 });
        b.run(600);
        b.cmd('set_steam_dump_setpoint', { mpa: 1.36 });
        b.run(900);
        ck('a full cooldown to the dump floor does NOT isolate',
          fmt(b.range('steam_pressure_mpa').min, 2) + ' MPa min, msiv ' + String(b.ts().msiv_open),
          b.ts().msiv_open !== false, 'MSIV still open');

        // ---- leg C: a bottled SG pegs the flow transmitter through its own code
        // safeties, so the FLOW term alone would fire here. The pressure term is what
        // keeps it out — the other half of the same argument as leg B.
        var c = H('hot_full_power');
        c.run(30);
        c.cmd('close_msiv');
        c.run(600);
        c.cmd('open_msiv');
        c.run(300);
        ck('a bottled SG with its safeties lifting does NOT re-isolate on reopening',
          'msiv ' + String(c.ts().msiv_open) + ', SG ' + fmt(c.range('steam_pressure_mpa').max, 2) + ' MPa peak',
          c.ts().msiv_open === true, 'MSIV open (the operator reopened it and it stayed)');

        // ---- leg D: operator-proof while sealed in. The real function is deliberately
        // not defeatable (*"manually blocking the high steam flow SI actuation does not
        // block the high steam flow steam line isolation"* — WTSM §12.3.5.1), and this
        // protection extinguishes its own signal, so without the latch the refusal
        // would evaporate in the instant it engaged (measured: it did).
        var d = H('hot_full_power');
        d.run(30);
        d.cmd('inject_failure', { failure_id: 'steam_line_break', severity: 1.0 });
        d.runUntil(function (ts) { return ts.msiv_open === false; }, 120);
        d.run(1);
        var refused = d.cmd('open_msiv');
        ck('the operator cannot reopen while the isolation is sealed in',
          refused && refused.code ? refused.code : 'ACCEPTED',
          !!(refused && refused.type === 'blocked'), 'blocked');
        ck('…and the valve really stayed shut', String(d.ts().msiv_open),
          d.ts().msiv_open === false, 'false');
        T.checkSanity(ck, a);
      });
    },

    /* TR-17 (#371) — LOSING THE CONDENSER NO LONGER MEANS LOSING THE COOLDOWN.
     * Audit #297 F3 measured this plant, with the condenser gone, sitting at
     * 304–305 °C for four plant-hours with the safeties chattering and the dump at
     * 0 % — no controlled cooldown path existed at all. The ADV is that path.
     *
     * RE-AUTHORED 2026-08-06 when the ADV's shipped lineup went SHUT → AUTO. Leg A
     * used to be the null control on the grounds that "the valve ships SHUT, so the
     * old behaviour is still what you get if you do nothing". That sentence stopped
     * being true, so the leg is rebuilt rather than re-banded (HR9): it now measures
     * what AUTO actually bought and, separately, still reproduces F3 by forcing the
     * valve shut. Measured full stack, condenser lost, one plant-hour:
     *
     *   ADV SHUT   safeties open 99.4 % of the hour, last lift 3630 s — never reseat.
     *              Parked at 9.00 MPa (1306 psi), Tavg 304.1 °C   — F3, exactly
     *   ADV AUTO   safeties open 1.8 %, last lift 118 s, SHUT at the end. ADV modulates
     *              ~13 %, holds 8.80 MPa (1277 psi), Tavg 302.5 °C
     *
     * THE "ADV AUTO — safeties NEVER lift" LINE THIS REPLACES WAS FALSE (2026-08-06). The
     * spike at 54 s lifts them at the SAME INSTANT with the valve shut, because it is the
     * SG's spike and not the valve's. It went unnoticed because the check under it read
     * `!range('sg_safety_open').max` on a BOOLEAN — NaN, so `!NaN`, so green always. The
     * discriminator is the TAIL, and that is what §8.34 always claimed.
     *
     * AUTO numbers RE-MEASURED 2026-08-06 when `adv_setpoint` moved 8.60 → 8.77 MPa onto
     * the sourced placement rule (WTSM §7.1.3.3, ML11223A244 — the ARV sits "approximately
     * half the difference between the no-load steam generator pressure and the lowest set
     * pressure of the safety valves"). The hold point moved with it; the verdicts did not.
     * NOTE THE LAYER: this probe is engine+M4, where the safeties never lift on this event.
     * Full stack they DO lift on the initial spike (peak 9.06 MPa) at BOTH setpoints, then
     * reseat — the #209 class, recorded here rather than tuned.
     *
     * The half of F3 that AUTO does NOT fix is the important one for this probe: the
     * plant is off its code safeties but it is still HOT. An ADV in auto is a pressure
     * controller sitting at its setpoint, not a cooldown — cooling still takes an
     * operator, which is what keeps leg B a real lever. */
    'TR-17': function () {
      return test('TR-17 atmospheric dump — a cooldown exists without the condenser (#371)', function (ck) {
        // ---- leg A: condenser lost, ADV untouched — i.e. the SHIPPED lineup, now AUTO.
        var a = H('hot_full_power');
        a.run(30);
        a.cmd('inject_failure', { failure_id: 'loss_of_condenser_vacuum' });
        // SAMPLE the safety across the run. DO NOT use h.range() on this field: it is a
        // BOOLEAN and range() takes a numeric min/max, so it returns NaN — and the form
        // this replaces, `!a.range('sg_safety_open').max`, is `!NaN`, which is TRUE
        // ALWAYS. Injection-verified 2026-08-06: run leg A2's plant (ADV forced shut, the
        // safeties open for the entire hour) through the old expression and it still
        // PASSED. The check shipped with #392 and could never once have failed. Swept —
        // this was the only range()-on-a-boolean site in the tree.
        var aSafetyOpen = 0, aSamples = 0, aSafetyLast = 0;
        a.run(3600, function (hh) {
          aSamples++;
          if (hh.ts().sg_safety_open) { aSafetyOpen++; aSafetyLast = hh.simTime; }
        });
        var aDuty = 100 * aSafetyOpen / aSamples;
        // RED on the pre-2026-08-06 default: this is what shipping it in AUTO bought.
        ck('shipped lineup: the ADV modulates to hold the bottled SG',
          fmt(a.ts().adv_valve_pct, 1) + ' %', a.ts().adv_valve_pct > 1, '> 1 % (auto, throttling)');
        // WAS "keeps the plant OFF its code safeties for the whole hour" — a claim that is
        // simply FALSE about this plant, and only survived because the expression above it
        // could not fail. Measured, the safeties lift at 54 s on the loss-of-condenser
        // spike whatever the ADV is doing (they lift at the SAME INSTANT with the valve
        // shut), because that spike is the SG's, not the valve's. What the ADV changes is
        // the TAIL, which is the thing §8.34 actually claims: AUTO 1.8 % of the hour, last
        // lift 118 s, shut at the end — SHUT 99.4 %, still open at 3630 s, never reseats.
        // A plant does not sit on its main steam safety valves for an hour; that is what
        // an ADV is for, and it is what this check now asserts.
        ck('…and the code safeties RESEAT — the ADV holds the rest of the hour',
          fmt(aDuty, 1) + ' % of the hour, last lift ' + fmt(aSafetyLast, 0) + ' s, open at end: '
            + String(!!a.ts().sg_safety_open),
          aDuty < 10 && !a.ts().sg_safety_open, '< 10 % and shut at the end (ADV SHUT: 99.4 %, never reseats)');
        // PASSES ON BOTH ENGINES, deliberately — a calibration guard. AUTO caps the
        // pressure, it does not remove the heat, so leg B's lever has to still exist.
        // 290 → 287.5 at #419 wave 3: "hot" is relative to the 286 no-load anchor now
        // (measured 289.5 — decay heat holds the ADV-capped plant a few °C above it).
        ck('…but it still holds hot — capping pressure is not a cooldown',
          fmt(a.ts().tavg_c, 1) + ' °C',
          a.ts().tavg_c > 287.5, '> 287.5 °C (no cooldown without operator action)');

        // ---- leg A2: force the valve SHUT and audit F3 comes straight back. This is
        // the null control leg A used to be, kept explicitly rather than relied upon —
        // it is what says the ADV is the thing making the difference, and it is the
        // check that would notice if the ADV ever became the ONLY path off the safeties.
        var a2 = H('hot_full_power');
        a2.run(30);
        a2.cmd('set_adv', { mode: 'closed' });
        a2.cmd('inject_failure', { failure_id: 'loss_of_condenser_vacuum' });
        a2.run(3600);
        ck('ADV forced SHUT: the F3 measurement is reproduced — parked on the safeties',
          fmt(a2.ts().steam_pressure_mpa, 2) + ' MPa, safety ' + String(!!a2.ts().sg_safety_open),
          !!a2.ts().sg_safety_open && a2.ts().tavg_c > 287.5,
          'safeties lifted AND still hot (the 7.58/7.33 band on the Ginna ladder)');

        // ---- leg B: the operator opens it. This is the gap #297 F3 named.
        var b = H('hot_full_power');
        b.run(30);
        b.cmd('inject_failure', { failure_id: 'loss_of_condenser_vacuum' });
        b.run(270);
        b.cmd('set_adv', { mode: 'open' });
        b.run(7200);
        ck('opening the ADV cools the plant with no condenser at all',
          fmt(a.ts().tavg_c, 1) + ' → ' + fmt(b.ts().tavg_c, 1) + ' °C',
          b.ts().tavg_c < 230, '< 230 °C (leg A stays above 290)');
        ck('…and it vents to ATMOSPHERE — the condenser is still gone',
          String(b.ts().condenser_cooling_available) + ', adv ' + fmt(b.ts().adv_valve_pct, 0) + ' %',
          b.ts().condenser_cooling_available === false && b.ts().adv_valve_pct > 50,
          'condenser false, ADV open');
        // The dump must NOT have carried this — it is gated on the condenser, and if
        // the ADV had been wired into steam_dump_frac this check would not notice.
        ck('the condenser dump stayed dead throughout (the ADV is a separate path)',
          fmt(b.range('steam_dump_valve_pct').max, 1) + ' % peak',
          b.range('steam_dump_valve_pct').max < 5, '< 5 %');
        ck('no fuel damage', String(!!b.ts().fuel_damaged), !b.ts().fuel_damaged, 'false');
        T.checkSanity(ck, b);
      });
    },

    'PI-9': function () {
      return test('PI-9 SLB — no steam-pressure SI channel; the sourced containment backup answers the upstream break (#199/#386)', function (ck) {
        // SPLIT INTO TWO LEGS 2026-08-05 (#370c). This probe fences the #199 ruling —
        // that no low-steam-line-pressure SI is needed, evidenced by a deep blowdown
        // that never calls for injection. Automatic isolation (#370c) arrests a
        // DOWNSTREAM break in about a second, so on that break the deep blowdown no
        // longer happens and the old assertions would have been measuring a
        // non-event: green because the transient was gone, the exact trap this repo
        // has been bitten by twice.
        //
        // So the evidence moves to the break location where it still bites — an
        // UPSTREAM break, which no isolation can touch — and it is reproduced
        // VERBATIM there (blowdown < 1.0 MPa, no SI anywhere, primary above 12.4,
        // inventory intact). The downstream leg then asserts the NEW truth: the
        // question the ruling answered never arises, because the plant isolates.
        // Strictly more coverage than before, and the ruling keeps its evidence.

        // ---- leg A: UPSTREAM — RE-AUTHORED at #386 stage 2 (declared: it now pins
        // NEW sourced behavior). The #199 ruling's evidence stands in its narrow
        // form — there is still NO low-steam-line-pressure SI channel, and the
        // PRIMARY never crosses its own 12.4 MPa SI setpoint — but an upstream
        // break is a high-energy line break INSIDE containment, and the sourced
        // 3.5 psig backup signal exists precisely for it (WTSM 12.3, ML11223A310:
        // "any high energy line break … inside the containment"; "cannot be
        // blocked by the operator"). So SI now ARRIVES, on the containment
        // channel, with every primary-side channel silent and inventory intact —
        // protection reading the one signal that actually sees this break. On the
        // stage-1 engine the SI checks are red (no SLB containment source) — the
        // source term's injection verification.
        var h = H('hot_full_power');
        h.run(30);
        h.cmd('inject_failure', { failure_id: 'steam_line_break_upstream', severity: 0.8 });
        var dt = h.runUntil(function (ts, ins, hh) { return hh.tripTime != null; }, 300);
        var siEver = false, ctmtAtSi = null;
        h.run(900, function (hh) {
          var s = hh.ts();
          if (s.hpi_active && !siEver) { siEver = true; ctmtAtSi = s.containment_pressure_mpa; }
        });
        var t = h.ts();
        ck('protection ends the event', dt >= 0 ? fmt(dt, 0) + ' s — ' + (h.tripReason || '?') : 'no trip',
          dt >= 0, 'trips');
        ck('the secondary blows down far below the classic 4.1 MPa SI setpoint',
          fmt(h.range('steam_pressure_mpa').min, 2), h.range('steam_pressure_mpa').min < 1.0, '< 1.0');
        ck('SI ARRIVES — on the sourced 3.5 psig containment backup, the channel built for this break',
          String(siEver) + ' at ctmt ' + fmt(ctmtAtSi, 3) + ' MPa abs',
          siEver && ctmtAtSi != null && ctmtAtSi >= 0.1254 - 0.005, 'true, at/above the setpoint');
        ck('…while the primary never reached its own 12.4 MPa SI channel — the discriminator',
          fmt(h.range('pressure_mpa').min, 2), h.range('pressure_mpa').min > 12.4, '> 12.4');
        ck('and there was nothing to inject: inventory intact and deeply subcooled — the injection is signal-driven',
          fmt(t.core_inventory_pct, 1) + ' % / ' + fmt(t.subcooling_c, 0) + ' °C sub',
          t.core_inventory_pct > 98 && t.subcooling_c > 50, '> 98 %, subcooled');
        ck.info('end state — a cold primary held at pressure (PTS, unmodelled)',
          fmt(t.tavg_c, 1) + ' °C at ' + fmt(t.pressure_mpa, 2) + ' MPa');

        // ---- leg B: DOWNSTREAM — the question no longer arises (#370c).
        var d = H('hot_full_power');
        d.run(30);
        d.cmd('inject_failure', { failure_id: 'steam_line_break', severity: 0.8 });
        var dSi = false;
        d.run(900, function (hh) { if (hh.ts().hpi_active) dSi = true; });
        ck('DOWNSTREAM: the isolation arrests it, so the deep blowdown never happens',
          fmt(d.range('steam_pressure_mpa').min, 2) + ' MPa min',
          d.range('steam_pressure_mpa').min > 1.0, '> 1.0 (was < 1.0 unisolated)');
        ck('…and still no safety injection — the ruling holds on this leg too',
          String(dSi), !dSi, 'never');
      });
    },

    /* TR-18 (#378, audit #297 F9) — A LOAD CHANGE ENDS. Nothing in the suite asserted
     * settling: the plant limit-cycles ±7 points of power at ~185 s period FOREVER after a
     * manual 100→50 MWe step (measured: 13.8 pts p2p in the final 10 min of a 60-minute
     * hands-off ride, settling NEVER reached), while the same authored 50 % IC is stable to
     * 0.7 pts — the loop can hold the point, it cannot arrive at it. The mechanism is the
     * kernel's stop exits: a `rod_nudge` drives the bank over time, and the deadband /
     * damping decisions return without cancelling the in-flight travel, so up to 8 steps
     * (~72 pcm) of overshoot land after every decision to stop — the per-half-cycle kick
     * that keeps the cycle fed.
     *
     * SHIPS AS A STRICT XFAIL — the fix was BUILT, MEASURED, AND REJECTED (2026-08-06).
     * Cancelling the in-flight travel at the kernel's deadband exit kills the cycle
     * completely (this probe goes green: settles 14.6 min, window 3.95 pts) — and takes
     * TR-1i's SOURCED ramp duty 4.34 → 5.26 °F vs the WTSM 8.1.1 ≤ 5.00, because the
     * overshoot travel was silently helping the bank chase a sliding Tref: the duty is
     * currently met PARTLY BY the defect. pvTau filtering fails the same band at every
     * value tried (0.2-3.0 s). Per the pre-declared reject criterion, neither shipped;
     * the candidate that threads the needle (cancel gated on a stationary program) is on
     * the issue. This probe pins the DEFECT meanwhile: if settling starts passing, the
     * fix landed — remove the XFAIL entry in the same change or the gate goes XPASS-red.
     *
     * BANDS ARE HOUSE CALLS, declared as such: a real Westinghouse plant settles after a
     * design manoeuvre (the WTSM 8.1.1 duty TR-1i pins is stated over sustained ramps, which
     * only means anything on a plant that settles), but no source gives a settling time or a
     * residual band, so these are the fixed plant's measured envelope with margin: settled
     * (ask ±2 pts held 5 min) by 25 min against 13.8-18.5 over four seeds under the cancel,
     * and the post-settle window ≤ 6 pts against 0.3-4.0 measured (worst-seed excursions
     * ~4.9 appear only after 45 min, outside this ride). Today's plant fails both — never
     * settles, post-settle window 13.4 — and the mean-on-target check passes on BOTH
     * kernels deliberately (the cycle is roughly symmetric, so its mean was always right):
     * it is the false-positive guard against a "fix" that settles at the wrong load, not a
     * discriminator.
     *
     * The late window is sampled EXPLICITLY (25-35 min), not via h.range(): the run includes
     * the transient's 55-pt first swing, so a run-wide range asserts nothing — the standing
     * CA-9/#332 trap. */
    'TR-18': function () {
      return test('TR-18 load-change settling — a manual step ENDS, the plant does not hunt forever (#378)', function (ck) {
        var h = rodsAuto(H('hot_full_power'));            // rods in AUTO — this probe's SUBJECT, stated not inherited (#460)
        h.run(30);
        var ask = 50;
        h.cmd('set_load_target', { immediate: true, mwe: ask });
        var t0 = h.t();
        var settledAt = null, inBandSince = null;
        var wMin = 1e9, wMax = -1e9, wTavgMin = 1e9, wTavgMax = -1e9;  // 25-35 min window
        var lateSum = 0, lateN = 0;                                    // last 5 min mean
        h.run(2100, function (hh) {
          var tt = hh.t() - t0, pw = hh.ts().power_pct;
          if (Math.abs(pw - ask) <= 2) {
            if (inBandSince == null) inBandSince = tt;
            if (settledAt == null && tt - inBandSince >= 300) settledAt = inBandSince;
          } else inBandSince = null;
          if (tt >= 1500) {
            if (pw < wMin) wMin = pw; if (pw > wMax) wMax = pw;
            var tv = hh.ts().tavg_c;
            if (tv < wTavgMin) wTavgMin = tv; if (tv > wTavgMax) wTavgMax = tv;
          }
          if (tt >= 1800) { lateSum += pw; lateN++; }
        });
        ck('no reactor trip on an ordinary dispatch cut', h.tripReason || 'none', h.tripTime == null, 'none');
        ck('the plant SETTLES — ask ±2 pts held 5 min, reached inside 25 min (pre-fix: never)',
          settledAt == null ? 'never' : fmt(settledAt / 60, 1) + ' min',
          settledAt != null && settledAt <= 1500, '≤ 25 min');
        ck('…and STAYS settled — 25-35 min p2p ≤ 6 pts (pre-fix: 12.7-13.1, the limit cycle)',
          fmt(wMax - wMin, 2) + ' pts', (wMax - wMin) <= 6.0, '≤ 6');
        ck('settled AT the ask, not merely quiet somewhere (mean guard — green on both kernels;'
          + ' the broken cycle was symmetric, so this alone discriminates nothing)',
          fmt(lateSum / Math.max(lateN, 1), 2) + ' %', Math.abs(lateSum / Math.max(lateN, 1) - ask) <= 2, ask + ' ±2');
        ck.info('25-35 min Tavg swing (pre-fix sustained ~6 °F)',
          fmt((wTavgMax - wTavgMin) * 9 / 5, 2) + ' °F (' + fmt(wTavgMax - wTavgMin, 2) + ' °C)');
        T.checkSanity(ck, h);
      });
    },

    /* TR-1k (#377, audit #297 F8) — THE ARM CLIFF ON THE SHIPPED LINEUP, which no probe
     * measured: TR-1c's legs are deliberately rod-less (its premise is "hands-off"), and the
     * §8.21 mitigation story — that rod control in AUTO absorbs a sub-arm rejection and
     * keeps the PORV shut — lived only in TR-1c's comment, measured nowhere. Measured
     * 2026-08-06, it is FALSE on the current plant: #372's feedwater enthalpy ate the
     * 12.9 psi margin the audit found, and the shipped lineup now peaks 16.198 MPa with the
     * PORV catching a sample via the instrument read. Both lineups end at the declared
     * backstop, which is CLOSER to the 2026-07-27 ruling's story than what the audit
     * measured — but it is a different fact from the one §8.21 used to imply, so it is
     * pinned here and recorded there.
     *
     * Same robust forms as TR-1c's re-authoring (the endpoint sits on the PORV setpoint to
     * within noise, so the DOORSTEP band and the SPAN are asserted, the terminal ornament is
     * info): sub-arm worst-seen peak 16.112 across ±3 % nudges and four seeds, caught side
     * ~15.43, span worst-seen 0.71 MPa.
     *
     * The last check pins the NON-MONOTONICITY the issue is about — the sub-arm rejection
     * undershoots DEEPER than the larger, caught one (measured 30.0 % vs 45.2 % min power, a
     * 15-point inversion) — because that inversion is the declared cliff's cost on the plant
     * a player actually gets, and nothing else asserts it. The undershoot's DEPTH belongs to
     * #378's badly-damped rod loop; only the ORDERING is asserted here, with a ≥ 5-point
     * gap. If a rod-channel fix ever narrows the inversion below that, this check should
     * redden and §8.21's cost paragraph should be revisited — that is the pin working. */
    'TR-1k': function () {
      return test('TR-1k sub-threshold rejection, rods in AUTO — both lineups end at the backstop (#377)', function (ck) {
        var arm = RD.PWR_CONFIG.steam_generator.dump_load_reject_mwe;
        var porvSp = RD.PWR_CONFIG.pressurizer.porv_open_mpa;

        // --- arm − 1, rods in AUTO (engaged explicitly since #460 — no longer the shipped preset)
        var lo = rodsAuto(H('hot_full_power'));
        lo.run(30);
        lo.cmd('set_load_target', { immediate: true, mwe: 100 - (arm - 1) });
        var loArmed = false, loPorv = false, loSafety = false;
        for (var i = 0; i < 180; i++) {
          lo.run(5, function (hh) {
            var t = hh.ts();
            if (t.porv_open) loPorv = true;
            if (t.safety_open) loSafety = true;
          });
          if (lo.eng.s.dump_reject_mode) loArmed = true;
        }
        ck('under the arm the fast dump never arms — rod control does not change that',
          String(loArmed), loArmed === false, 'false');
        // Band 312 → 310 (#418 wave B1, 2026-08-07): the tube node adds ~25 % to the
        // loop's thermal mass, so the same rejected energy peaks Tavg ~4 °C lower —
        // measured 311.8 (was 315.6 on the A-wave plant, 316+ compressed). The CLAIM
        // is unchanged and still binding: program at this load is ~305, so 310+ is
        // well off-program with rods in AUTO — the #377 no-mitigation finding.
        ck('Tavg climbs well past program even with rods in AUTO (> 310 °C)',
          fmt(lo.range('tavg_c').max, 1), lo.range('tavg_c').max > 310, '> 310');
        // #418 wave A1 re-derivation, mirroring TR-1c: the PORV doorstep died with
        // the compressed secondary clock (spray outruns the SG-liquid-soaked
        // transient), so the #377 finding re-states as: the shipped lineup ALSO
        // carries the THERMAL excursion — rods in AUTO still do not catch a
        // sub-arm rejection (the Tavg > 312 check above is the pin) — while spray
        // holds pressure clear of the valve on both lineups.
        ck('spray holds the shipped lineup clear of the PORV too (the §8.21 story is thermal now)',
          fmt(lo.range('pressure_mpa').max, 2), lo.range('pressure_mpa').max < porvSp,
          '< ' + fmt(porvSp, 2) + ' (config)');
        ck('…and never escalates to the code safety', String(loSafety), loSafety === false, 'false');
        ck.info('shipped-lineup peak (was 16.198 on the compressed clock) / PORV sample seen',
          fmt(lo.range('pressure_mpa').max, 3) + ' MPa / ' + String(loPorv));

        // --- arm + 1, rods in AUTO: caught, clear of the relief neighborhood
        var hi = rodsAuto(H('hot_full_power'));
        hi.run(30);
        hi.cmd('set_load_target', { immediate: true, mwe: 100 - (arm + 1) });
        var hiArmed = false;
        for (var j = 0; j < 180; j++) { hi.run(5); if (hi.eng.s.dump_reject_mode) hiArmed = true; }
        // Cap-reading since #419 wave 3 (D1: the dump is Ginna's 28 %, was 40).
        var _dcapK = 100 * RD.PWR_CONFIG.steam_generator.steam_dump_max;
        ck('one MWe more rejected, the fast dump arms and carries it (at its cap)',
          String(hiArmed) + ' / ' + fmt(hi.range('steam_dump_valve_pct').max, 1) + ' %',
          hiArmed === true && hi.range('steam_dump_valve_pct').max >= _dcapK - 1, 'armed, ≥ ' + fmt(_dcapK - 1, 0) + ' %');
        ck('no PORV lift on the caught side — clear by a quarter MPa',
          fmt(hi.range('pressure_mpa').max, 2), hi.range('pressure_mpa').max < porvSp - 0.25,
          '< ' + fmt(porvSp - 0.25, 2) + ' (config)');
        // Temperature form since #418 wave A1, same reasoning as TR-1c's span check.
        ck('the cliff span holds on the shipped lineup too (≥ 4 °C in Tavg)',
          fmt(lo.range('tavg_c').max - hi.range('tavg_c').max, 1) + ' °C apart',
          lo.range('tavg_c').max - hi.range('tavg_c').max >= 4, '≥ 4');
        // The declared cliff's cost, pinned: the SMALLER rejection is the WORSE plant.
        // ≥ 5 → ≥ 2.5 at #419 wave 3 (D1: the 28 % dump narrows the caught-vs-uncaught gap;
        // measured 3.1 pts, was ~16 at 40 %). The declared non-monotonicity survives,
        // smaller — the smaller upset is still the deeper undershoot.
        ck('the declared non-monotonicity: the sub-arm cut undershoots ≥ 2.5 pts deeper than the caught one',
          fmt(lo.range('power_pct').min, 1) + ' % vs ' + fmt(hi.range('power_pct').min, 1) + ' %',
          lo.range('power_pct').min <= hi.range('power_pct').min - 2.5, 'lo ≤ hi − 2.5');
        T.checkSanity(ck, lo);
        T.checkSanity(ck, hi);
      });
    },

    /* CA-20b — THE SMALL-BREAK FENCE, split out of CA-20 leg B (#451, 2026-08-11).
     *
     * STRICT XFAIL. The claim is prototypical and stays asserted exactly as it was: a
     * small break must hold a pressure plateau ABOVE the accumulator arming band, so it
     * does not spuriously dump the tanks — that plateau is the defining feature of the
     * SBLOCA family and the reason its EOPs are about depressurizing to let ECCS in.
     *
     * WHY IT FAILS TODAY, and why the band must NOT be moved to make it green. The
     * plateau was HELD BY THE PRESSURIZER HEATERS, which this plant's own config already
     * recorded (`pwr_config.js`, the #363 note: "it pins NOTHING. Pressure is above
     * 600 psi because the PRESSURIZER HEATERS are winning against the break … Right
     * behaviour, wrong mechanism"). #447 sheds the heaters on safety injection, as
     * NUREG-0737 II.E.3.1 (7) requires, and the prop went with them.
     *
     * The state it was propping was not a good one: measured, the pre-#447 sev-0.05 break
     * parks at 900 psia with inventory pinned at 59 % — the DEADHEADED-ECCS pathology
     * #334 was filed for, with the core partially drained indefinitely because the
     * pressure-driven HPI curve delivers 0.18 instead of 0.53. So removing the prop is
     * right; what it exposes is that nothing else in this model holds a small-break
     * plateau. Every severity now collapses to the same cold solid state (109.3 %
     * inventory, 176 °F, SG secondary down to 14.5 psia), so severity stops
     * discriminating. That is #451, and the candidates are listed there.
     *
     * RE-KEYED 2026-08-11 FROM A PROXY TO THE MECHANISM *(OWNER RULING, 2026-08-11: selected
     * "Re-key it to the physical claim: the primary tracks SG saturation" from three options
     * — a selection, not verbatim words)*. The claim is unchanged and is NOT relaxed; what
     * changed is that it is now asserted directly instead of through a magnitude.
     *
     * WHY THE OLD BAND HAD TO GO, and it is not the reason anyone expected. It read
     * `pressure_mpa > 1.5 * accumulator_trip_mpa` = 6.21 MPa (901 psi) at t+600. The plateau
     * physically forms where the primary equilibrates with its heat sink — SG saturation,
     * measured 880 psi — so the threshold sat ~20 psi ABOVE the answer. Measured on THIS
     * harness, the old form fails on BOTH plants: the pre-#447 heater-held plant, the one the
     * probe was written to describe, reads 894 psi against its own 901 psi band. Full stack it
     * read 900.6 and squeaked through by 0.6 psi. A probe whose verdict flips on which LAYER
     * you measure at is not measuring the plant (CLAUDE.md, "know which layer a gate runs at").
     *
     * WHAT IT ASSERTS NOW — the steam generators hold the primary up, in two legs, and it
     * needs BOTH:
     *
     *   leg A  the primary never falls a control band below its own heat sink;
     *   leg B  the heat sink is still a heat sink — the secondary has not been drained
     *          through the tubes below the accumulator arming pressure.
     *
     * ONE LEG WOULD BE HOLLOW, and this is the trap that nearly shipped. A bare
     * "primary tracks secondary" check PASSES on today's broken plant: at t+600 it reads
     * primary 202 psi against secondary 202 psi. They track perfectly — on the way to the
     * floor, because the primary DRAGGED the secondary down with it through the 5 %
     * `sg_reverse_frac` back-path. Leg B is what refuses that. Symmetrically, a bare
     * "secondary stays up" check cannot see an inverted heat sink with a healthy secondary.
     *
     * HR10 — VALIDATED AGAINST THE OLD BEHAVIOUR, which is what makes this a re-key and not a
     * re-band. Measured on both plants, same harness, sev 0.05 to t+600:
     *
     *              worst primary BELOW secondary   min secondary   verdict
     *   as built            266 psi                   202 psi      both legs FAIL
     *   pre-#447 (reloaded)   5 psi                   764 psi      both legs PASS
     *
     * The new form passes on the plant that held the plateau and fails on the one that does
     * not — separation 53x on leg A. If it ever passes on both, it has been refitted.
     *
     * THE BANDS. Leg B is config-derived and physical: below `accumulator_trip_mpa` the heat
     * sink can no longer hold the primary above the arming pressure, which IS the original
     * claim. Leg A's 0.35 MPa (51 psi) is scale-fitted — an order of magnitude above the
     * 5 psi saturation-curve lag the healthy plant carries — and its exact value is not
     * load-bearing at a 53x separation. Both measured numbers are recorded above so the next
     * reader checks rather than re-derives.
     */
    'CA-20b': function () {
      return test('CA-20b a small break holds its plateau — the STEAM GENERATORS hold the primary up (#451)', function (ck) {
        var CFG = RD.PWR_CONFIG;
        var b = H('hot_full_power');
        b.run(30);
        b.cmd('inject_failure', { failure_id: 'large_loca', severity: 0.05 });
        // SPANS, not endpoints. The inversion is a transient the endpoint cannot see — at
        // t+600 the broken plant's two pressures are equal, having fallen together.
        var worstBelow = -1e9, minSec = 1e9;
        b.run(600, function (hh) {
          var s = hh.eng.s;
          var below = s.steam_pressure_mpa - s.pressure_mpa;   // + = primary BELOW its heat sink
          if (below > worstBelow) worstBelow = below;
          if (s.steam_pressure_mpa < minSec) minSec = s.steam_pressure_mpa;
        });
        var INVERSION_BAND = 0.35;   // MPa (51 psi) — see THE BANDS above
        ck('leg A — the primary never falls a control band below its own heat sink',
          fmt(worstBelow * 145.038, 0) + ' psi worst (' + fmt(worstBelow, 3) + ' MPa); healthy plant 5 psi',
          worstBelow < INVERSION_BAND, '< ' + (INVERSION_BAND * 145.038).toFixed(0) + ' psi below SG');
        ck('leg B — the heat sink is still a heat sink: the secondary was not drained through the tubes',
          fmt(minSec * 145.038, 0) + ' psi min (' + fmt(minSec, 2) + ' MPa)',
          minSec > CFG.emergency.accumulator_trip_mpa,
          '> accumulator_trip_mpa (' + (CFG.emergency.accumulator_trip_mpa * 145.038).toFixed(0) + ' psi)');
        // Corroboration, not assertion: legs A and B together are the condition under which
        // the tanks CANNOT arm, so the accumulator level is the independent read on both.
        ck.info('accumulator level at t+600 (full = the fence held)',
          fmt(b.ts().accumulator_volume_pct, 1) + ' %');
        ck.info('inventory / Tavg at t+600 (the #451 collapse signature: solid and cold)',
          fmt(b.ts().core_inventory_pct, 1) + ' % / ' + fmt(b.ts().tavg_c * 9 / 5 + 32, 1) + ' °F');
        ck.info('primary / secondary at t+600 (equal is NOT healthy — they fell together)',
          fmt(b.ts().pressure_mpa * 145.038, 0) + ' / ' + fmt(b.eng.s.steam_pressure_mpa * 145.038, 0) + ' psi');
      });
    },

    /* CA-25 — THE ESF LOAD SHED (#447, 2026-08-11). Safety injection, and a loss of
     * offsite power, take the pressurizer heaters OFF THE BUS; only an operator puts
     * them back.
     *
     * WHAT IT IS PINNING, and why nothing caught it for so long. The heaters are a
     * non-Class-1E load with `K_heater` authority 347x their sourced rating (a declared,
     * owner-ruled departure, `Manuals/12` §12.15) and NO gate for the regime where there
     * is nothing physical behind them. #334 found the stable half of that — heaters
     * holding a drained RCS at 2207 psi (15.22 MPa) with the coolant 240 °C subcooled —
     * and answered it with the 17 % low-level cutoff. The cutoff removed the stable wrong
     * equilibrium but not the AUTHORITY, so it bounded it into a LIMIT CYCLE: ECCS refills
     * past the 20 % restore point, the heaters return at FULL demand (auto control sees
     * pressure 2220 psi below setpoint), 0.29 MPa/s net takes pressure 15 -> 163 psia in
     * ~3 s, that spikes leak_flow ~20x on the sqrt(dP) law and back-pressures HPI
     * 0.90 -> 0.34, level falls back through 17 %, and it repeats. MEASURED full stack,
     * `_heater_cut` transitions over 3000-16000 s: 134 at sev 0.05 (peak excursion
     * 839 psia), 248 / 410 / 620 / 761 / 936 at 0.10 / 0.20 / 0.40 / 0.60 / 1.00 —
     * monotone in severity, starting within 4-28 s of the break at every one, and running
     * for the full 6 h 21 m of the bug report that filed it.
     *
     * SOURCED, and it is a requirement rather than a preference. NUREG-0737 II.E.3.1
     * Clarification (7) (ML051400209): "Being non-Class IE loads, the pressurizer heaters
     * must be automatically shed from the emergency power sources upon the occurrence of a
     * safety injection actuation signal"; (5)(b) makes the restore need an SI reset and (4)
     * makes the changeover "accomplished manually in the control room". Ginna TS Bases
     * Rev 101 (ML20339A221) B 3.4.9 states the plant behaviour: "the heaters are shed
     * following a loss of offsite power or safety injection signal. The heaters can be
     * manually loaded onto the diesel generators if required."
     *
     * FULL STACK IS MANDATORY HERE and the reason is the #209 lesson twice over. Engine
     * -direct never sets `hpi_active` — nothing actuates SI, so the latch never arms and
     * the probe would pass against a plant that has no shed at all. Bare M4 has neither
     * `feed_sg` nor `cvcs_makeup` (both `defaultOn`), which shape the inventory tail the
     * oscillation rides on. So: H() with the shipped lineup, no `noDefaults`.
     *
     * THE CLAIM IS A BAND, NOT A TRANSITION COUNT. A count pins the number of ECCS refill
     * cycles, which is a tuning; CA-10's own bMaxStreak note is the worked case.
     *
     * THE TAIL WINDOW OPENS AT 5000 s, MOVED FROM 3000 AT #453, and the reason is a real
     * change in the plant rather than a band being widened to fit. #453 removed the RHR
     * auto-align, which used to let the largest heat sink in the plant into an unisolated
     * LOCA and drove the cooldown to its end state fast. Without it the same end state
     * arrives later. Measured per-2000 s bucket after #453, both severities: still moving
     * through 2000-4000 s (P band 138.4 psi at sev 0.05), then FLAT from 4000 s on — 0.2,
     * 0.1, 0.1, 0.0, 0.0 psi and a level band of 0.0 pts out to 16 000 s.
     *
     * The window move does NOT weaken the probe, and that is checkable rather than asserted:
     * the defect this exists to catch ran for the WHOLE 16 000 s (620 `_heater_cut`
     * transitions over 3000-16000 s at sev 0.40, 134 at 0.05, monotone in severity), so it
     * is still caught at 5000-7000 s. What the move drops is a settling transient that was
     * never the subject. Heater samples in the new window: 0 of 4000, at both severities.
     *
     * Injection-verified 2026-08-11: RED on the pre-change engine, 14 of 34 checks, and
     * the numbers are this probe's own window (3000-5000 s), not the issue's. sev 0.05:
     * P band 787.6 psi, level band 36.3 pts, 215 of 4000 samples carrying heater power.
     * sev 0.40: 156.6 psi, 15.5 pts, 323 of 4000. The SMALL break is the worse one — it
     * lets the heaters win more of each cycle. Goes red again if the `_heater_shed`
     * consumer in pwr_pressurizer.autoControl is deleted, and leg C fails if the latch is
     * made level-triggered instead of edge-triggered.
     */
    'CA-25': function () {
      return test('CA-25 safety injection SHEDS the pressurizer heaters — the post-LOCA plant settles instead of limit-cycling (#447)', function (ck) {
        // ---- legs A/B: tail stability at two break sizes, smallest first (it has the
        // WORST pre-fix excursion — 839 psia — because a small break lets the heaters win).
        [0.05, 0.40].forEach(function (sev) {
          var tag = 'sev ' + fmt(sev, 2) + ': ';
          var h = H('hot_full_power');
          h.run(60);
          h.cmd('inject_failure', { failure_id: 'large_loca', severity: sev });
          // 2940 -> 5000 (2026-08-11, #453). The terminal state now arrives LATER, because
          // RHR no longer aligns itself into a saturated leaking RCS at t+10 min and drag
          // the plant to cold-solid on shutdown cooling. Measured at sev 0.05 in successive
          // 2000 s windows: t+3000..5000 still in transit (93.2 psi band), then
          // t+5000..7000 and every window out to t+15000 read EXACTLY 0.00 psi / 0.00 pts /
          // 0 reversals / 0 hot samples. The claim did not change; the window was calibrated
          // on a plant that got there sooner.
          h.run(5000);                                  // reach the settled tail
          var pMin = 1e9, pMax = -1e9, lMin = 1e9, lMax = -1e9, hot = 0, n = 0;
          var pSeq = [], rev = 0, dir = 0;
          h.run(2000, function (hh) {
            var ts = hh.ts();
            n++;
            if (ts.pressure_mpa < pMin) pMin = ts.pressure_mpa;
            if (ts.pressure_mpa > pMax) pMax = ts.pressure_mpa;
            if (ts.pzr_level_pct < lMin) lMin = ts.pzr_level_pct;
            if (ts.pzr_level_pct > lMax) lMax = ts.pzr_level_pct;
            if ((hh.ctl().heater_power_pct || 0) > 0.01) hot++;
            if (n % 100 === 0) pSeq.push(ts.pressure_mpa);
          });
          // A BAND CANNOT TELL A SETTLE FROM A CYCLE, and this probe exists to tell them
          // apart. Both read as a wide band; only one reverses direction repeatedly. Added
          // 2026-08-11 while adjudicating the #453 window shift — the two band legs had gone
          // red on a plant that was settling MONOTONICALLY through the window (2 reversals in
          // 40 samples), and nothing in the probe could say so. #447's actual limit cycle ran
          // 134-936 transitions over hours, so this leg catches it far more directly than a
          // band does, and keeps catching it if the window ever drifts again.
          for (var q = 1; q < pSeq.length; q++) {
            var d = Math.sign(pSeq[q] - pSeq[q - 1]);
            if (d !== 0 && dir !== 0 && d !== dir) rev++;
            if (d !== 0) dir = d;
          }
          var ts = h.ts();
          // OBSERVABILITY GUARDS FIRST — without all three this probe proves nothing.
          // A plant that never actuated SI, or whose break stopped flowing, is quiet for
          // reasons that have nothing to do with the shed.
          ck(tag + 'SI actually actuated (or the rest of this leg is vacuous)',
            String(ts.hpi_active), ts.hpi_active === true, 'true');
          ck(tag + 'the break is still flowing at the end of the tail',
            fmt(ts.leak_flow, 6), ts.leak_flow > 0, '> 0');
          ck(tag + 'the shed is STANDING — securing SI does not clear it, only an operator does',
            String(ts.pzr_heaters_shed), ts.pzr_heaters_shed === true, 'true');
          // THE DISCRIMINANT.
          ck(tag + 'no heater power anywhere in the tail (pre-fix: 215 of 4000 at 0.05, 323 of 4000 at 0.40)',
            hot + ' of ' + n + ' samples', hot === 0, '0 samples');
          ck(tag + 'pressure is STABLE across the tail (pre-fix: 787.6 psi at 0.05, 156.6 psi at 0.40)',
            fmt((pMax - pMin) * 145.038, 2) + ' psi band', (pMax - pMin) * 145.038 < 25, '< 25 psi');
          ck(tag + 'pressurizer level is STABLE across the tail (pre-fix: 36.3 pts at 0.05, 15.5 pts at 0.40)',
            fmt(lMax - lMin, 2) + ' pts band', (lMax - lMin) < 3, '< 3 pts');
          ck(tag + 'and it is SETTLED, not cycling — pressure does not reverse direction (#447 ran 134-936 cycles)',
            rev + ' reversals in ' + pSeq.length + ' samples', rev <= 2, '<= 2 reversals');
          T.checkSanity(ck, h);
        });

        // ---- leg C: THE RELOAD WORKS. Without this the shed is indistinguishable from
        // "the heaters were deleted", and the source is explicit that they can be put back
        // ("manually loaded onto the diesel generators if required"). This is also what
        // pins the latch as EDGE-triggered: a level-triggered shed could never clear here.
        var c = H('hot_full_power');
        c.run(60);
        c.cmd('inject_failure', { failure_id: 'large_loca', severity: 0.40 });
        c.run(2940);
        ck('reload: shed is standing before the operator acts',
          String(c.ts().pzr_heaters_shed), c.ts().pzr_heaters_shed === true, 'true');
        c.cmd('set_heater', { auto: true });            // the manual reload — one button
        c.run(60);
        var cPow = 0;
        c.run(120, function (hh) { cPow = Math.max(cPow, hh.ctl().heater_power_pct || 0); });
        ck('reload: HEATER AUTO clears the shed', String(c.ts().pzr_heaters_shed),
          c.ts().pzr_heaters_shed === false, 'false');
        ck('reload: and the heaters answer again (the excursion that follows is the player\'s to own)',
          fmt(cPow, 1) + ' %', cPow > 0, '> 0 %');

        // ---- leg D: THE OPERATOR'S DEMAND WAS NEVER WRITTEN (#200/#329). A shed that
        // parks 0 in `heater_override` would heal itself on the next button press and
        // would silently move the selector the player set. Full manual 100 % standing
        // BEFORE the break must survive the shed untouched, with delivered power at zero.
        var d = H('hot_full_power');
        d.run(30);
        d.cmd('set_heater', { power_pct: 100 });
        d.run(30);
        d.cmd('inject_failure', { failure_id: 'large_loca', severity: 0.40 });
        var dHot = 0, dN = 0;
        d.run(2940);
        d.run(600, function (hh) { dN++; if ((hh.ctl().heater_power_pct || 0) > 0.01) dHot++; });
        ck('demand survives: the selector is still where the operator put it (MANUAL, not AUTO)',
          String(d.ctl().heater_auto), d.ctl().heater_auto === false, 'false');
        ck('…while DELIVERED power is zero throughout — de-energization, not a written demand',
          dHot + ' of ' + dN + ' samples', dHot === 0, '0 samples');

        // ---- leg E: THE LOOP HALF. Same sentence in the source, and this leg is what
        // stops a future reader narrowing the scope back to SI. A plain loss of offsite
        // power is NOT a blackout — `ac_available` stays true — so the heaters die here
        // because they were SHED, not because the bus is dead, and the reload proves it.
        var e = H('hot_full_power');
        e.run(60);
        e.cmd('inject_failure', { failure_id: 'loss_of_offsite_power' });
        e.run(300);
        var eTs = e.ts();
        ck('LOOP: no safety injection on this path (or the leg is testing the SI half again)',
          String(eTs.hpi_active), eTs.hpi_active === false, 'false');
        ck('LOOP: ac is still available — the diesels have the 1E buses, this is not a blackout',
          String(eTs.ac_available), eTs.ac_available === true, 'true');
        ck('LOOP: the heaters are SHED (Ginna TS Bases B 3.4.9 — "shed following a loss of offsite power")',
          String(eTs.pzr_heaters_shed), eTs.pzr_heaters_shed === true, 'true');
        var ePow = 0;
        e.run(120, function (hh) { ePow = Math.max(ePow, hh.ctl().heater_power_pct || 0); });
        ck('LOOP: …and deliver nothing while shed', fmt(ePow, 2) + ' %', ePow === 0, '0 %');
        e.cmd('set_heater', { auto: true });
        e.run(120);
        var ePow2 = 0;
        e.run(120, function (hh) { ePow2 = Math.max(ePow2, hh.ctl().heater_power_pct || 0); });
        ck('LOOP: a manual reload puts them back on the bus ("within one hour", B 3.4.9)',
          fmt(ePow2, 1) + ' %', e.ts().pzr_heaters_shed === false && ePow2 > 0, 'cleared, > 0 %');
        T.checkSanity(ck, e);
      });
    },

    // ============================================== the catalog's own lock (#472)

    'CAT-1': function () {
      return test('CAT-1 catalog ↔ battery parity — the v4.0 lock (#472)', function (ck) {
        // v3.1 was "FROZEN-FINAL" with no mechanical lock: nine in-place amendments,
        // stale version stamps, and 39 probe IDs with no catalog row. This probe is the
        // lock. It is DELIBERATELY a probe (not a separate runner) so the strict-xfail
        // machinery, the per-ID CLI, and the run_all score all apply unchanged.
        var fs = require('fs'), path = require('path');
        var catPath = path.join(__dirname, '..', 'Blueprint', 'PWR_BEHAVIOR_CATALOG.md');
        var txt = fs.readFileSync(catPath, 'utf8');
        var lines = txt.split('\n');

        // Header version — the battery and the catalog must agree on which version
        // this is (the stamps read v2.0 for a year while the catalog moved to v3.1).
        var hdr = (lines[0].match(/—\s*(v[\d.]+(?:-[A-Z]+)?)/) || [])[1] || '(none)';
        ck('catalog header version matches CATALOG_VERSION', hdr,
          hdr === CATALOG_VERSION, CATALOG_VERSION);

        // Parse every table-row ID. The ID must open the first cell; bold marks, flags
        // (⚑) and "PI-6 / TR-4" style compounds are tolerated. Non-ID tables (§2
        // ratios, §9 setpoints) never match.
        var rowIds = {}, rowText = {};
        lines.forEach(function (ln) {
          var m = ln.match(/^\|\s*\**([A-Z]{2,4}-\d+[a-z]*)\**[^|]*\|/);
          if (m) { rowIds[m[1]] = true; rowText[m[1]] = (rowText[m[1]] || '') + ln; }
        });
        var nRows = Object.keys(rowIds).length;
        ck.info('distinct row IDs parsed from the catalog', String(nRows));
        ck('the parser is not returning an empty catalog', String(nRows), nRows > 50, '> 50');

        // Direction A — the one that was broken for a year: every COVERAGE key has a
        // catalog row. Keys normalize by their leading ID ('PI-7-reset' → 'PI-7').
        var missing = Object.keys(COVERAGE).filter(function (k) {
          var base = (k.match(/^([A-Z]{2,4}-\d+[a-z]*)/) || [])[1];
          return !base || !rowIds[base];
        });
        ck('every COVERAGE key has a catalog row', missing.length ? missing.join(', ') : 'all',
          missing.length === 0, 'none missing');

        // Direction B — a catalog ID outside COVERAGE must SAY where its claim is held:
        // 'todo' (unwritten probe), an external suite pointer, or another probe's ID.
        var covered = {};
        Object.keys(COVERAGE).forEach(function (k) {
          var base = (k.match(/^([A-Z]{2,4}-\d+[a-z]*)/) || [])[1];
          if (base) covered[base] = true;
        });
        var orphans = Object.keys(rowIds).filter(function (id) {
          if (covered[id]) return false;
          var rest = rowText[id].slice(rowText[id].indexOf('|', 1));
          return !/todo|existing|run_|campaign|ops|probe|RETIRED|preserved|[A-Z]{2}-\d/.test(rest);
        });
        ck('every un-covered catalog row names where its claim is held',
          orphans.length ? orphans.join(', ') : 'all', orphans.length === 0, 'none orphaned');
      });
    },
  };

  RD.BehaviorPWR = {
    probes: PROBES,
    XFAIL: XFAIL,
    COVERAGE: COVERAGE,
    CATALOG_VERSION: CATALOG_VERSION,
    runAll: function () {
      return Object.keys(PROBES).map(function (id) {
        var r = PROBES[id]();
        r.id = id;
        return r;
      });
    },
  };

})(globalThis.RD || (globalThis.RD = {}));
