/*
 * pwr_config.js — PWR engine configuration (M1, HR3/HR8).
 *
 * All PWR parameters as a structured data object: the [tune] physics
 * coefficients, the operating points, the instrument set, and the named
 * initial states. The protection/alarm/failure definitions (also data) live
 * in layers/control/pwr_control.js, which attaches them onto
 * PWR_CONFIG.protection when it loads (after this file).
 *
 * Units are SI throughout (CONTEXT §11): pressure MPa, temperature °C, level
 * and power %, flows normalized to rated. Values marked [tune] are starting
 * points arbitrated by the PHYSICS ACCEPTANCE SUITES — run_pwr, run_behavior,
 * run_ops — which state intended plant behaviour independently of any story.
 * Campaign missions, procedures and checklists are NOT arbiters of tuning
 * (CONTEXT §3 HR9): they observe the plant. If one breaks after a change here,
 * the presumption is that the CONTENT is stale. Un-marked values are fixed.
 *
 * Global-namespace module: attaches RD.PWR_CONFIG. Works as an ordered
 * <script> tag in the browser and via require() in Node (both share globalThis).
 */
;(function (RD) {
  'use strict';

  // ---- Six-group delayed-neutron parameters (U-235; fixed, do not change) ----
  var DELAYED = {
    beta_i:   [0.000215, 0.001424, 0.001274, 0.002568, 0.000748, 0.000273],
    lambda_i: [0.0124,   0.0305,   0.111,    0.301,    1.14,     3.01],
    // beta = 0.006502 (sum); Lambda = 0.01 s (PWR prompt generation time; fixed)
    beta: 0.006502,
    Lambda: 0.01,
  };

  var PWR_CONFIG = {
    plant_id: 'pwr',

    // ------------------------------------------------- plant identity & ratings
    // Catalog v3 rulings (2026-07-21): its own plant — a compact single-loop
    // experimental PWR. Engine internals stay normalized; this table is the ONE
    // place human-facing absolute ratings live (UI readouts, manuals, instructor
    // text, battery band checks). The name is the owner's call.
    identity: {
      // Renamed SLX-100 -> SLS-100 (OWNER DIRECTIVE, 2026-08-04, issue #328: "Rename the
      // plant the 'Single Loop Simulated - 100MWt' AKA 'SLS-100'."). The 100 is the
      // ELECTRICAL rating, not the thermal one — the core is 300 MWt — so the expansion
      // reads MWe (OWNER RULING, 2026-08-04: selected "SLS-100 = 100 MWe" from three
      // options put to him — 100 MWe, SLS-300 = 300 MWt, or no number; a selection, not
      // verbatim words). Naming it 100 MWt would have contradicted `mwt_rated` below and
      // every manual rating table by 3x.
      name: 'SLS-100',                  // Single Loop Simulated, 100 MWe (owner, 2026-08-04)
      plant_class: 'single-loop experimental pressurized water reactor',
      mwt_rated: 300.0,                 // core thermal rating, MW
      mwe_rated: 100.0,                 // gross electrical rating, MW (= turbine.mwe_rated)
      loops: 1, steam_generators: 1, rcps: 1,
      // Display conversions for normalized flows (manual/UI flavor, [tune]).
      //
      // NOT READ BY ANY CODE — the live scale is `GPM_CHARGING` / `GPM_LETDOWN` / `GPM_AFW`
      // in `ui/diagram/board/pwr_board_wiring.js`, which is what the board actually renders.
      // This block is documentation for the manual, and it MUST track those constants. It
      // did not: charging read 40 and letdown 20 here (a 666.7 gpm-per-normalized-unit
      // scale) while the board has always used a single 1000 full-scale for CVCS and feed
      // alike — so the board showed a 0–60 gpm charging box and a 30 gpm orifice-A letdown
      // while `Manuals/12` quoted 40 and 20. A 1.5× split on numbers the player can read in
      // both places. Corrected to the board's scale; `test/run_manual_units.js` now
      // cross-checks the two files so it cannot drift again.
      //
      // Since #408 wave 1 the RCS-side gpm figures are LITERAL: one declared volume
      // (~7,500 gal), one conversion (gpm = frac/s × 450,000), CVCS and accident flows on
      // the same real currency. The paragraph this replaces disclaimed the opposite —
      // "pacing flavour … NO single RCS volume makes both true" (#194/#261) — which was
      // true of the retired two-scale split and is exactly what #408 removed.
      rcs_flow_gpm: 24000,              // rated RCS flow (not displayed — the board shows % of rated)
      charging_max_gpm: 60,             // = charging_max 1.33333e-4 frac/s × 450,000 (#408 — literal)
      letdown_normal_gpm: 30,           // = orifice A ≈ 6.7e-5 frac/s at NOP × 450,000 (#408 — literal)
      afw_gpm: 100,                     // = afw_flow_frac 0.15 normalized × GPM_AFW 640 ≈ 96
    },

    // ---------------------------------------------------------------- kinetics
    kinetics: {
      delayed: DELAYED,
      // Constant neutron source (normalized power/s): gives the subcritical core
      // its 1/M multiplication — P_eq = source·Λ/(−ρ) — so the approach to
      // criticality is VISIBLE (power and SUR respond to every rod step) instead
      // of silent until prompt-critical. Sized so the hot_zero_power margin
      // (−1000 pcm) equilibrates at exactly the state's P0 = 1e-6. [tune]
      source: 1.0e-6,
      // DECAY HEAT — FOUR exponential groups, FITTED TO A SOURCED CURVE (#364, 2026-08-05).
      // NOT `[tune]`: these are a fit to a published standard, not free parameters. Do not
      // nudge them to make a scenario behave; if a scenario needs different pacing, that is a
      // scenario problem.
      //
      // WHAT THEY REPLACED, and why it had to move. Two groups at tau 2000 s and 13.9 h, with
      // nothing faster — so the curve was flat exactly where a real one falls fastest.
      // MEASURED against the target below: **142.5 % maximum relative error**, worst at
      // t = 794 s, i.e. the model carried ~2.4x the real decay heat through the ten-minutes-to-
      // half-hour band that every casualty in this trainer plays out in. Ruled a refit rather
      // than a declared departure *(OWNER RULING, 2026-08-05: "I think we should re-fit the
      // decay heat curve for several reasons one this is going to be used to train engineers
      // and some of them are nuclear engineers and will nitpick this if it's not correct two I
      // need to redo all of the missions anyway they need a complete redo so I am not worried
      // about it messing up missions.")*.
      //
      // THE TARGET — two independent NRC primaries, which CROSS-CHECK:
      //   FISSION PRODUCTS — ML050910161 (WCOBRA/TRAC ch. 8) Table 8-3, "Decay Heat Standard
      //     Data for U-235 Thermal Fission", ANSI/ANS 5.1-1971 in closed form over
      //     0.1 s .. 2e8 s:  DH(t) = A·t^B, with (A, B) = (0.07236, −0.0639) for t < 10 s,
      //     (0.09192, −0.181) to 150 s, (0.156, −0.283) to 4e6 s, (0.3192, −0.335) beyond.
      //     The table states it "includes 20% required Appendix K uncertainty".
      //   ACTINIDES — ML021720702 ("Attachment 1, Appendix K Decay Heat Standards") Table 2
      //     column 0 is (fission products + actinides) x 1.2, so the actinide term is that
      //     column minus Table 8-3. Measured 0.18..0.34 % of rated across the band; carried as
      //     the power law 5.401e-3·t^-0.0984 that fits those seven points.
      //   THE CROSS-CHECK IS THE POINT: two documents, different authors, different methods,
      //     and their difference is a physically sensible actinide contribution rather than
      //     noise. Either alone would have been one source.
      //
      // DIVIDED BY 1.2, deliberately. That multiplier is a LICENSING margin — the document
      // calls it "the maximum positive value from the uncertainty table … for shutdown times
      // less than 10^7 seconds" — and it belongs in an ECCS evaluation model, not in a
      // simulator claiming to show what a plant actually does. We model the plant.
      //
      // THE FIT: amplitudes by relative-error least squares on a fixed lambda ladder, lambdas
      // by grid search then coordinate descent, over 1 s .. 1e5 s (27.8 h) — the window every
      // casualty and every long ride in this trainer lives in. Four groups is the knee:
      // 3 groups 11.8 %, **4 groups 4.86 %**, 5 groups 3.31 %. Beyond 1e5 s the fit
      // EXTRAPOLATES; the sourced fission-product law runs to 2e8 s but the actinide power law
      // is fitted only to 1e4 s, so do not quote this curve past ~28 h as sourced.
      //
      // f0 IS DERIVED FROM THESE, NOT SEPARATE: pwr_engine step 4 computes
      // `_Q_total = _P·(1 − sum H_0) + sum H`, so the sum below IS the fraction of rated power
      // that is decay heat at equilibrium. It moves 0.0700 -> 0.06248, which is the sourced
      // curve's own t->0 value and is why full-power core heat still normalizes to 1.0.
      decay: {
        H1_0: 0.0268319, lambda_1: 0.0303948,    // tau     33 s
        H2_0: 0.0193747, lambda_2: 0.00130630,   // tau    766 s
        H3_0: 0.00772324, lambda_3: 0.0000794659, // tau  12584 s
        H4_0: 0.00855037, lambda_4: 0.00000287062, // tau 348357 s
      },
      // Xenon / iodine (normalized to equilibrium xenon at full power).
      xenon: {
        gamma_I: 0.061, gamma_X: 0.003,
        lambda_I: 2.87e-5, lambda_X: 2.09e-5, // s^-1 (fixed)
        sigma_phi: 2.0e-5,                    // s^-1 [tune]
        xenon_worth: 0.025,                   // [tune]
      },
    },

    // ----------------------------------------------------------- reactivity fb
    reactivity: {
      alpha_D: -2.5e-5,            // Doppler, K^-1 (defect ≈ 970 pcm over the 389 °C fuel rise — realistic) [tune]
      // ---------------------------------------------------------------------
      // MODERATOR REACTIVITY — density-shaped and boron-scaled (#260).
      //
      // History. This was a single constant `alpha_MTC`, recalibrated −3.3e-5 →
      // −2.0e-4 K^-1 (owner ruling 2026-07-21, teaching goal) because at the old
      // value an un-trimmed 15 % load cut parked Tavg +18 °C; −20 pcm/°C delivers
      // the ask exactly and parks it +7 °C. That number was right AT POWER and it
      // survives here (see `mod_*` below — the sourced curve reproduces it to
      // within 10 % at the operating point, which is the strongest argument for
      // this shape). What it could not do was hold at COLD conditions: applied
      // uniformly from 122 °F to 579 °F it integrated to a −4944 pcm moderator
      // defect over the Mode 5→3 heatup (494 ppm of dilution to buy back), where a
      // real plant at this boron charges roughly −1700 pcm and almost none of it
      // below 274 °F. Consequence the owner hit in free play: critical boron fell
      // 819 → 263 ppm across the heatup, so 600 ppm — a number that looks safe next
      // to the hot end — was CRITICAL at 274 °F, and the SR high-flux trip fired.
      //
      // The model. Moderator reactivity tracks moderator DENSITY, not temperature:
      //    ρ_mod(T,B) = mod_coeff · (1 − B/mod_boron_zero_ppm) · (d(T) − d(T_ref))
      // where d(T) is relative water density. MTC = dρ_mod/dT then steepens with
      // temperature on its own, because the density derivative does. Sourced to
      // WTSM 2.1 Reactor Physics Review (ML11223A207) §2.1.6.2 / Figure 2.1-8:
      //   "Moderator density changes are not linear. At high temperatures an
      //    increase in the moderator temperature causes a larger reduction in
      //    density than an identical increase at low moderator temperatures."
      //   "using the 0 ppm curve, if the moderator temperature is initially at
      //    500°F and its temperature is increased by 1°F, -17 pcm of reactivity
      //    would be added to the core."                      → the anchor below
      //   "At boric acid concentrations greater than approximately 1400 ppm, the
      //    MTC is positive."                                 → the crossover below
      //
      // Two things fall out that used to be missing, and neither is fitted:
      //   - differential boron worth is LARGER cold (13.8 pcm/ppm at 122 °F vs
      //     10.0 at power) — denser water carries more boron atoms per cm³;
      //   - MTC weakens toward zero as boron rises, the real BOL/positive-MTC
      //     mechanism. Our plant peaks ~1100 ppm so it never goes positive.
      //
      // NOTE the source disagrees with itself on how strong the boron term is: the
      // 500 ppm / −8 pcm figure reading implies MTC = 0 at ~944 ppm, while the text
      // says ~1400 ppm. We take 1400 (an explicit statement beats a figure
      // reading); the residual is that we give −10.9 pcm/°F at 500 °F/500 ppm where
      // the figure reads −8. Owner ruling 2026-07-29. [tune]
      // --- SHAPE: measured. SCALE: ruled. The two come from different places, and
      //     which is which matters, so it is stated here rather than inferred (#263).
      //
      // The boron crossover is the MEASURED one. BEAVRS / Watts Bar U1 Cycle 1 HZP
      // physics tests, Table IV of the Polaris-PARCS benchmark (OSTI 1991715) — three
      // *measured* isothermal temperature coefficients at three boron concentrations,
      // all at the HZP no-load temperature:
      //     ARO   975 ppm   ITC -1.75 pcm/°F
      //     D in  902 ppm   ITC -4.65 pcm/°F
      //     C in  810 ppm   ITC -8.01 pcm/°F
      // Those fit a straight line in boron to within 0.09 pcm/°F. ITC = MTC + the fuel
      // (Doppler) coefficient, so removing our alpha_D puts the MTC zero crossing at
      // **986 ppm**. This SETTLES the contradiction recorded below: WTSM 2.1's figure
      // reading implied ~944 ppm and its text said ~1400. The figure was right.
      //
      // We shipped 1400 for a day (#260) and it was wrong: it gave -7.52 pcm/°F at
      // BEAVRS's ARO condition against a measured -1.75, **4.3× too negative**, and the
      // error shrank as boron fell — the signature of this exact parameter being off.
      mod_boron_zero_ppm: 986.0,   // MEASURED (BEAVRS ITC fit); was 1400 (#260 → #263)
      //
      // The scale is now MEASURED too *(OWNER RULING, 2026-07-30: "for 263 item 1 fit
      // the measurement.")*. Both parameters are least-squares fitted to the same three
      // BEAVRS ITCs: the line through them is ITC(B) = 0.03788·B − 38.730 pcm/°F, which
      // after removing alpha_D gives a 0-ppm curve of −37.34 pcm/°F at 557 °F and a
      // crossover at 985.8 ppm — the crossover the previous fit already had, now
      // confirmed by a two-parameter fit rather than assumed. Expressed at this block's
      // 500 °F anchor through the density shape, that is −31.43 pcm/°F.
      //
      // WHAT THIS RULING COST AND BOUGHT, because it overturned an earlier one. It
      // SUPERSEDES the owner's 2026-07-21 ruling that the coefficient at the full-power
      // reference should be -2.0e-4 K⁻¹: the plant now runs **-2.68e-4 K⁻¹
      // (-26.8 pcm/°C)** there, 34 % stronger, so the core tracks load more tightly and
      // an un-trimmed cut parks Tavg less high than the 2026-07-21 write-up describes.
      // In exchange the model stops disagreeing with the measurement: residuals against
      // all three points fall from 0.05 / 0.88 / 1.64 pcm/°F to ≤0.09. The previous
      // calibration's "known residual" note is gone because the residual is gone.
      // Re-solve BOTH if alpha_D or the ITC data changes; test/run_reactivity.js pins it.
      mod_anchor_pcm_per_f: -31.43, // 0-ppm MTC at mod_anchor_temp_f; MEASURED (fitted)
      mod_anchor_temp_f: 500.0,
      // Compressed-liquid water density at ~15.5 MPa (2250 psi), kg/m³, as a cubic
      // in °C — least-squares over IAPWS-IF97 from 20–340 °C, max residual
      // 3.1 kg/m³. Only the SHAPE is load-bearing (the coefficient above carries
      // the reactivity scale), but keep it honest: it is a real density curve.
      mod_density_cubic: [1.017739e3, -4.939192e-1, 2.496834e-4, -5.916719e-6],
      // ---------------------------------------------------------------------
      boron_worth_per_ppm: 1.0e-4, // DIRECT term only; the density coupling above
                                   // adds the temperature dependence [tune]
      // Boron mixing/transport lag (s): borated/diluted water must circulate the RCS loop and
      // homogenize before it changes CORE reactivity, so reactivity follows a first-order-lagged
      // concentration, not the instantaneous injected value. Without it, power moved the moment
      // you borated while the (sample-lagged) analyzer trailed ~45 s behind — power appeared to
      // respond to the boron INPUT rather than the indicated level. ~one loop transit; brings
      // power's response into step with the indication. Scenarios that steer on boron (pwr_boron)
      // must allow for the resulting inertia (gentle rates, room to overshoot). [tune]
      boron_mix_tau_s: 30.0,
      // Rod worths recalibrated to real measured values (#260/#238, owner ruling
      // 2026-07-29). Was 8500 (control) + 10000 (shutdown) = 18 500 pcm, which is
      // 2.4–2.9× every real number we can source and was the single biggest
      // distortion in the reactivity balance: with a 8500 pcm control bank, critical
      // boron with the bank inserted fell to 263 ppm at HZP against ~975 ARO, so
      // every rods-in state sat at an absurdly low boron.
      // WTSM 2.2 Reactivity Balance Calculations (ML11216A051) Table 2.2-1, a real
      // Westinghouse 4-loop at 100 EFPD:
      //   Worth of all RCCAs           (-)7744 pcm
      //   Worth of all Control Banks   (-)4068 pcm
      //   Worth of all Shutdown Banks  (-)3676 pcm
      //   Worth of most reactive rod   (+)1040 pcm
      // Cross-check, BEAVRS / Watts Bar U1 Cycle 1 HZP physics tests (OSTI 1991715,
      // measured): control banks D+C+B+A = 788+1203+1171+548 = 3710 pcm, all banks
      // 6466 pcm. We take the WTSM values; both land in the same place and neither
      // is anywhere near 18 500. One lumped bank still carries the whole control
      // worth that a real plant spreads over four banks — that simplification stays.
      rod_worth_total: 0.04068,    // control-group worth (4068 pcm) [tune]
      // Integral-worth-curve flattening (owner, low-power feel). The rod worth follows an
      // S-curve (scruve); its differential worth peaks 2× the average at mid-core, so near
      // the startup critical band a 1-step move inserted ~48 pcm (peak ~74) and power ran on
      // any small withdrawal (low power has no Doppler/MTC to damp it). This factor scales
      // the S-curve's sinusoidal term: 1.0 = textbook S-curve, <1 flattens the peak toward a
      // straight line, cutting the peak/mid differential worth while KEEPING the total worth
      // (so the Mode-5→1 heatup still reaches power). 0.8 here ≈ 10 % gentler peak — the strongest the tuned Mode-5→1 startup tolerates.
      // (Per-step pcm numbers above are on the old 228-step drive; the 912-step fine drive
      // is ×4 finer — see rods.max_steps.) [tune]
      rod_worth_curve_flatten: 0.8,
      rod_worth_shutdown: 0.03676, // shutdown-group worth (3676 pcm) [tune]
      // Core excess reactivity, held down by boron/rods/xenon at the operating
      // point. The reference temps (T_fuel_ref/T_coolant_ref) are set at init to
      // the settled hot_full_power temps, so the Doppler/moderator feedbacks are
      // zero there and purely perturbative+stabilizing on a transient (M1 §4);
      // boron is then trimmed to make the net reactivity critical.
      //
      // 0.10 → 0.086776 (#260) → 0.087557 → 0.087544 (#263, re-solved again when the moderator SCALE was fitted to the measurement too): this constant has no direct observable, so it is
      // SOLVED rather than tuned — it is whatever makes HZP ARO critical boron come
      // out at the one real number we have measured startup data for. BEAVRS /
      // Watts Bar U1 Cycle 1 HZP physics tests (OSTI 1991715): **HZP ARO critical
      // boron 975 ppm** (BOL, zero xenon). Re-solve it if alpha_D, the moderator
      // block, the rod worths or boron_worth_per_ppm move — see the derivation in
      // Diagnostic/TUNING_LOG.md 2026-07-29 and test/run_reactivity.js, which pins
      // the 975 ppm target so this cannot drift silently. [tune]
      // 0.087544 → 0.087354 at #419 wave 3: the solve's quote temperature DECOUPLED from
      // the plant's no-load anchor. The 975-ppm ARO measurement is at the WBN HZP
      // (557 °F = 291.67 °C); the old solve evaluated it at this plant's then-anchor 297 °C
      // (benign 5 °C conflation), and the Ginna re-anchor to 286 °C forced the honest split.
      // Solved: bAro(291.67 °C) = 975.00. Downstream, the ICs trim at the plant's own
      // anchor: HZP now ships ≈ 704.8 ppm with criticality back at ≈ step 319.
      rho_excess: 0.087354,        // [tune]
      // Chemical & Volume Control System (CVCS). Boron chemistry is decoupled from
      // net charging−letdown: borate/dilute change concentration at boron_adjust_rate
      // (needs the charging pump). Charging/letdown control primary INVENTORY; auto
      // mode makes up identified leakage by modulating charging up to charging_max.
      //
      // REAL-TIME CEILING since #419 wave 1 *(OWNER RULING, 2026-08-07: "D3: go real")* —
      // was 2.0 and UNENFORCED (no engine read; a dead constant while raw `set_boron_adjust`
      // commands could drive any rate — one fixture ran 3.0 ppm/s). The engine now CLAMPS
      // the commanded rate to ±this. Both automation channels (`boron_conc` batch dose,
      // `boron_trim` bang) meter at 0.05 beneath it and are unaffected. Derived from WTSM
      // 4.1 (ML11223A214) on this plant's declared RCS currency: boric acid stored at
      // "approximately 4 weight percent (7000 ppm)" (:595), the blender's boric-acid valve
      // limited to ~10 gpm (:771) and total blended makeup ~80 gpm (:730); the declared RCS
      // is ≈ 7,467 gal (the #408 currency: porv_flow_max 2.5e-4 frac/s ≡ 112 gpm). Boration
      // at max boric-acid flow: 10/(7467·60) × (7000−800) ≈ 0.138 ppm/s; dilution at the
      // 80 gpm blend from ~800 ppm: 80/(7467·60) × 800 ≈ 0.143 ppm/s — one class, 0.14.
      boron_adjust_rate: 0.14,     // ppm/s CEILING on set_boron_adjust (engine clamps) [derived — see above]
      // RCS boron grab sample (take_boron_sample): lab turnaround before the
      // result posts. REAL-TIME since #419 wave 1 (same ruling): "real labs run ~30–60
      // min" (this comment's own admission since it was written) — 1800 s is the bottom
      // of that class. The result is the mixed (reactive) concentration rounded to 1 ppm
      // — authoritative, deterministic (no PRNG draw). [tune]
      boron_sample_lab_s: 1800.0,
      // CVCS↔inventory coupling (P7 drain-rate retune, 2026-07-22). Charging and
      // letdown are TENS of gpm against the whole RCS, so their normalized flows
      // (sized for the gauges/lineup: orifice A ≈ 0.030 ≡ 20 gpm) must NOT enter
      // the mass balance 1:1 like the accident-scale flows do — that read a 20 gpm
      // bleed as ~3 %/s of total inventory and drained the pressurizer in seconds.
      // This gain converts CVCS normalized flow → inventory-fraction/s; leak/ECCS/
      // relief keep the lumped fast scale (accident pacing is tuned there).
      //
      // THE TWO RATES BELOW ARE PRODUCTS OF `level_per_mass`, which #330 moved 100 → 776,
      // so both were 7.76× stale from that day until 2026-08-05 (#365 — the same drift as
      // the τ note below). MEASURED off the shipped config, not recited: an uncompensated
      // orifice-A drain walks pzr level down 16.8 %/min (0.030·gain·level_per_mass) and
      // max manual charging fills 33.5 %/min in the going-solid regime (charging_max·gain·
      // level_per_mass_surplus; CA-4's PI-8 backstop still fires in ~3 min). The drain is
      // no longer "minutes to respond" — it is the ruled #330 trade, and `ops_pwr.js`
      // `ops_cvcs_pzr_drain_rate` is red against its 2026-07-22 feel target BY DESIGN
      // (OWNER RULING, 2026-08-04: "A"). The letdown-isolation interlock and the low-level
      // trip are what bound it. [tune]
      cvcs_inventory_gain: 1.0,    // #408 ruling 1(a): CVCS joins the real scale — the two-scale split collapses; flows below are true frac/s of the declared 7,500 gal RCS
      // AUTO make-up: charging above letdown per % PZR-level deficit (the error is
      // damped through cvcs_level_filter_tau first — the M/A station's damping —
      // so this can be stiff without chasing gauge noise, CA-3). Loop
      // τ = 1/(0.01·cvcs_inventory_gain·level_per_mass) = 10.7 s, MEASURED off the
      // shipped config — this said "≈ 83 s" from v1 until 2026-08-05 (#365), which was
      // the τ at the pre-#330 deficit slope of 100 and has been wrong since #330 raised
      // it to 776. #330's own note (see `level_per_mass_surplus`) already recorded the
      // new figure and that BOTH branches now share it; this line was simply not updated
      // with it. The parked offset is independent of that slope and is unchanged: a leak
      // L parks the level (L/cvcs_inventory_gain)/0.01 % below setpoint (a 2.4e-4 leak →
      // 2.00 %, visible but held — CC-8/CC-10). [tune]
      cvcs_charge_per_level: 2.217e-5,  // = old 0.01 x (1.33e-4/0.06): same fractional authority per % of level error on the real scale (#408; stack-level servo re-solve owed)
      cvcs_level_filter_tau: 20.0, // s — first-order damping on the servo's level error [tune]
      charging_max: 1.33333e-4,   // == exactly 60 gpm / 7,500 gal       // max charging flow, frac/s == 60 gpm / 7,500 gal — the board display becomes literally true (#408) [tune]
      // Letdown: TWO fixed orifices, each independently in/out (four states: off /
      // A / B / A+B). Letdown is a pressure-driven bleed from the cold leg through
      // an orifice to the letdown HX / VCT — so flow ∝ √(p_coldleg − backpressure),
      // NOT a commanded constant (pwr_primary.stepInventory). The backpressure is the
      // downstream letdown-backpressure-control-valve setpoint (2.4 MPa ≈ 350 psig,
      // real Westinghouse), which keeps the letdown coolant subcooled and makes flow
      // tail off toward zero as RCS pressure approaches it on a cooldown. Coefficients
      // are normalized flow per √MPa, sized so at NOP (p_coldleg ≈ 15.71 MPa): orifice
      // A ≈ 0.030 (normal letdown), B ≈ 0.040, A+B ≈ 0.070 (max — exceeds charging_max,
      // a net drain for level reduction / depressurization). [tune]
      letdown_backpressure_mpa: 2.4,
      letdown_orifice_a_coeff: 1.8656e-5,   // == exactly 30 gpm at NOP   // = old 0.00822 x (6.7e-5/0.030): orifice A == 30 gpm at NOP on the real scale (#408)
      letdown_orifice_b_coeff: 2.4874e-5,   // == exactly 40 gpm at NOP   // scaled with A (#408): orifice B == 40 gpm at NOP
    },

    // ------------------------------------------------------------------ thermal
    thermal: {
      // Fuel node: dTf = (Q*heat_gen_coeff - h_fc_eff*(Tf-Tavg))*dt.
      // heat_gen_coeff ≈ h_fc * 389 → ~389 °C fuel-above-coolant at rated. [tune]
      heat_gen_coeff: 19.45,
      h_fc: 0.05,                  // fuel→coolant, s^-1 (normal) [tune]
      h_fc_dnb: 0.004,             // during DNB, s^-1 [tune]
      // Coolant node: dTavg = (Q_fuel_to_coolant - Q_coolant_to_sg)/C_cool *dt.
      h_sg: 0.6,                   // coolant→SG, s^-1 [tune] (balances the energy in/out at rated)
      // 20.0 → 15.0 (#418 wave B1, 2026-08-07): the SG tube-bundle share moved OUT of
      // this node and into `sg_tube_capacity` (15 + 5 = the same 20 the loop always
      // carried). Adding the tube node ON TOP would have — and briefly did, measured —
      // slowed the pump-heat Mode 5→3 heatup by ~25 % (the chain arrived at 260.7 °C
      // instead of ~285), silently reopening the RULED Mode 5↔1 pace identity the
      // #408/#418 fence protects. The SPLIT is the physical statement: this constant is
      // the loop water OUTSIDE the tube bundle; total loop capacity is unchanged, so
      // every no-sink heatup/cooldown rate is preserved by construction, while the
      // coolant node alone answers transients ~25 % faster (re-measured: run_otdt,
      // TR-1i's ±5 °F duty, SS-1, TR-7b all green on the split).
      coolant_heat_capacity: 15.0, // loop water outside the SG tubes [tune — see split note]
      // RCP heat: the pumps' shaft work ends up in the coolant (~15–20 MW for a
      // 4-loop plant ≈ 0.55 % of rated core heat), scaled by flow. Matters at
      // no-load (heats the plant with the heat sink isolated) and post-trip. [tune]
      pump_heat_frac: 0.0055,      // fraction of rated core heat at full flow
      delta_T_rated: 33.0,         // hot/cold leg split at rated, °C [tune]
      flow_floor: 0.015,           // delta_T saturates: max(flow_frac, 0.015) [tune]
      // DNB / core-exit boiling (steam-line-break / loss-of-flow AT POWER). The hot
      // leg (core exit) is the DNB datum: subcooled liquid cannot superheat, so thot
      // is clamped at Tsat and the raw enthalpy rise beyond saturation drives core
      // boiling instead of more sensible temperature. Heat transfer collapses to
      // h_fc_dnb once the exit margin to saturation falls to dnb_margin_c (real DNB
      // — DNBR<1.3 — occurs subcooled, before bulk boiling). Distinct regime from the
      // inventory-driven void (post-scram, primary.void_gain); combined by max, so
      // neither perturbs the other. All [tune] — the at-power scenarios arbitrate.
      //
      // THE DATUM IS THE MIXED-MEAN EXIT, NOT THE LIMITING ASSEMBLY (#368). A real DNBR
      // is evaluated at the hot channel, which runs hotter than the mixed mean by the
      // nuclear enthalpy-rise hot-channel factor, so this margin is measured on a cooler
      // number than a real one is — i.e. this threshold stands in for peaking implicitly,
      // and that is the reason it is `[tune]` and scenario-arbitrated rather than sourced.
      // The factor itself is UNSOURCED; see pwr_thermal.hFcEffective for the accessions
      // that do not carry it. Do not re-derive this constant without one.
      dnb_margin_c: 8.0,           // MIXED-MEAN core-exit subcooling (°C) at which DNB begins [tune]
      // SG tube-bundle uncovery (TR-3/TMI dryout, feel-plan P5): heat transfer
      // scales to a small steam-side residual as the WIDE-range level falls below
      // the threshold. Residual sized BELOW post-trip decay heat so a dry SG
      // genuinely stops being a heat sink (the primary heats to saturation and
      // repressurizes to the PORV — the TMI mechanism). [tune]
      // Time-dependent dryout DEPLETION (2026-07-24, meltdown battery MD-6): the
      // residual above is the conductance of a freshly-dried bundle (film moisture,
      // steam-side convection). If the bundle stays dry AND UNFED, that film boils
      // off and the residual itself decays away (τ = deplete_tau) — a *sustained*
      // total loss of feed+AFW genuinely loses its heat sink and the primary heats
      // to the PZR safeties (MD-6, TMI without recovery). Any feedwater reaching
      // the SG (main or AFW ≥ feed_eps) rewets the bundle (τ = rewet_tau) — which
      // is why a RECOVERABLE loss of MFW (TR-2: AFW auto-starts ~13 s in, level
      // transits 0 for a minute) keeps the full residual through its brief dip and
      // its 15.88 MPa peak, while the same dip with AFW blocked depletes and
      // repressurizes to the PORV (TR-3/MD-6). This is the structural fix for the
      // old MD-6 known gap — no single constant residual could satisfy both
      // (TR-2 needed ≥ 0.015, MD-6 needed ≤ 0.006).
      sg_dryout_wide_pct: 30.0,
      sg_dryout_residual: 0.02,
      sg_dryout_deplete_tau: 300.0, // s — dry+unfed bundle's residual film boils off [tune]
      sg_dryout_rewet_tau: 45.0,    // s — feed restores the bundle film [tune]
      sg_dryout_feed_eps: 0.01,     // normalized feed that counts as wetting the bundle
      // ---- SG TUBE NODE + LOOP TRANSPORT (#418 wave B1, 2026-08-07) ----------------
      // The single h_sg conductance splits into a SERIES pair around a tube-bundle
      // node t_sg_c: coolant → tube at h_sg/split, tube → secondary at h_sg/(1−split).
      // THE INVARIANCE RULE (the design's spine — do not break it): both branches
      // carry the SAME flow_frac × dryout factors and the conductances satisfy
      // 1/h1 + 1/h2 = 1/h_sg for ANY split, so at every steady state the crossing
      // heat is EXACTLY the legacy h_sg·f·dry·(Tavg − Tsec) — the four sites that
      // spell Tavg = Tsat(P_sec) + Q/h_sg (pwr_control TAVG_FULLPOWER, the dump's
      // t_fullpower, both engine IC derivations) hold unchanged, every preset is
      // still a true steady state, and the natural-circ / dryout / reverse-flow
      // regimes survive by construction. What the node ADDS is dynamics only: the
      // bundle's thermal mass buffers primary↔secondary transients (τ ≈
      // C_tube/(2·h_sg·f) ≈ 2.1 s at full flow, ~60 s at natural-circ flows —
      // the SG goes sluggish at low flow, which is physical).
      // The LEGS become first-order states lagging their algebraic targets
      // (tau/flow_frac — transport is faster at higher loop flow): the same-step
      // leg algebra the compressed plant published moved 27.5 °F of cold leg in
      // 2 s on an MSIV closure (#418's founding measurement). The DNB datum and
      // the Tsat cap keep reading the RAW same-step algebra (_subcool_hot_c) —
      // deliberately untransported, per the #368 record.
      sg_tube_capacity: 5.0,       // tube-bundle water+metal heat capacity, same units as
                                   // coolant_heat_capacity (~25 % of it) [tune pending WTSM §5.1-class data]
      sg_tube_split: 0.5,          // h1 share of the series pair (0.5 → h1 = h2 = 2·h_sg) [tune]
      // Loop transport (#418 B1) — UNVERIFIED-source: no document in any lane's corpus
      // gives a transit/circulation time (find_source swept 2026-08-08, every phrasing
      // exits 1). Scale check against the plant's OWN declared geometry: 7,500 gal at
      // 24,000 gpm rated = one full loop turnover every ~19 s, so seconds-order lags at
      // full flow are the right family, and ÷flow makes natural circ honestly sluggish.
      // Post-trip pace verdict (owner-directed investigation, 2026-08-08, #422): trip
      // from 100 % reaches no-load in ~3 min here vs ~2.5–3 min on the sourced HRTD
      // 4-loop trace (ML11216A094 Transient 5.11), with our first-minute fall ~3× GENTLER
      // (14 vs ~40 °F/min; our dump is Ginna's 28 % vs their 40 %). The loop does NOT
      // cool too fast — do not slow these constants on feel.
      tau_hotleg_s: 1.5,           // s at full flow — core exit → SG inlet transport [tune]
      tau_coldleg_s: 4.0,          // s at full flow — SG outlet → core inlet transport [tune]
      void_flux_gain: 0.02,        // equilibrium core void per °C of exit overshoot [tune]
      void_flux_max: 0.8,          // ceiling on flux-driven void fraction [tune]
      void_flux_tau: 3.0,          // s — flux void grows/recovers with this tau [tune]
      fuel_damage_c: 1200.0,       // cladding failure (fixed)
      fuel_melt_c: 2800.0,         // melt (fixed)
      // PARTIAL-uncovery hot node (#213, pwr_thermal.stepCladding): peak cladding
      // temperature of the exposed (uppermost) fuel. Between core_top_uncover (0.70)
      // and significant_uncover (0.50) the top of the core is steam-cooled only: the
      // hot node heats at the decay-heat rate scaled by the uncovered fraction and
      // is cooled weakly toward Tsat — TMI-2's actual damage mechanism (top ~half
      // uncovered under an hour → clad failure and local melt while the BULK coolant
      // stayed unremarkable). The bulk h_fc collapse below 0.50 is unchanged; this
      // node covers the band above it that previously had zero consequence.
      clad_heat_gain: 15.0,        // °C/s of exposed-clad heatup per unit total heat (_Q_total is FRACTIONAL, 1.0 = rated) at full uncovery — ~0.9 °C/s at early (6 %) decay heat, the observed TMI/severe-accident order [tune]
      // 1/s — steam-convection cooling of the exposed clad toward Tsat. Sets the EQUILIBRIUM
      // GRADIENT of the hot node: clad_eq − Tsat = clad_heat_gain·Q·f_unc / clad_steam_h, so
      // this constant is what decides which uncoveries damage (grazing uncovery late in decay
      // stabilizes below damage; deep or early uncovery runs away). [tune]
      //
      // RE-SOLVED 1.0e-4 -> 4.0e-5 FOR THE #364 DECAY REFIT (2026-08-05). It sits on the
      // COOLING side of a balance whose HEATING side is decay heat, and the refit cut decay
      // heat ~2.4x in the band this node lives in — so the line it draws moved, and a core
      // held in the 50–70 % band stopped damaging at all. MEASURED before the re-solve: held
      // at 60 % inventory, the clad climbed 698 -> 1109 °C and DECELERATED below the 1200 °C
      // threshold, never damaging even at 40 000 s (11 h).
      //
      // 2.5x DOWN AGAINST A 2.4x DROP IN THE HEAT INPUT — i.e. the coefficient tracks the
      // change on the other side of its own balance, which is the derivation and not a fit to
      // a probe. Swept, held-at-60 % branch, time to clad damage:
      //     1.0e-4  never (peak 1109)   8.0e-5  8990 s      6.0e-5  6855 s
      //     5.0e-5  6215 s              **4.0e-5  5710 s**  3.0e-5  5300 s   2.0e-5  4950 s
      // The PROMPT-REFLOOD branch is protected at EVERY value in that sweep (peak 592 °C), so
      // the discrimination this constant exists for is not what the choice within the range
      // is about — inventory recovery protects that case, not this coefficient. What the
      // choice sets is the damage TIMING on the held branch, and 4.0e-5 puts it at 95 min,
      // inside the TMI-2 window MD-9 asserts (core damage there began around 2.5 h).
      //
      // perturb_sweep BEFORE the move (house rule): ±30 % flips NO verdict in either the §14
      // scenario suite or the behaviour battery, so the blast radius is genuinely local.
      clad_steam_h: 4.0e-5,
      clad_quench_tau: 120.0,      // s — reflood/rewet relaxation of the hot node back to the wetted-core temperature (quench-front timescale, minutes) [tune]
      // ZIRCONIUM-STEAM OXIDATION on the exposed-clad hot node (#238, built 2026-08-03).
      // Zr + 2H2O -> ZrO2 + 2H2. See pwr_thermal.stepCladding for the form and why it is
      // Arrhenius + parabolic rather than the linear multiplier #238 originally sketched.
      //
      // PROVENANCE, PER CONSTANT - and read the classes, they are NOT the same. Relabelled
      // 2026-08-03 after an audit: the first version called this "three of four SOURCED",
      // and only one was anchored to a primary that had actually been retrieved.
      //   REGULATORY PRIMARY - retrieved and quoted;
      //   SECONDARY          - widely reproduced, primary named but NOT retrieved;
      //   [tune]             - ours, with whatever corroboration is stated.
      //
      // CHOOSING Baker-Just is not a judgement call: 10 CFR 50 Appendix K para 5 REQUIRES
      // it - "The rate of energy release, hydrogen generation, and cladding oxidation from
      // the metal/water reaction shall be calculated using the Baker-Just equation (Baker,
      // L., Just, L.C., ... ANL-6548, page 7, May 1962)". REGULATORY PRIMARY (govinfo,
      // CFR-2011-title10-vol1-part50-appK). Appendix K incorporates ANL-6548 BY REFERENCE
      // and does not print its constants - which is why the numbers below are a weaker
      // class than the choice of correlation is.
      zirc: {
        // Baker-Just: w^2 = 33.3e6 * t * exp(-45500/RT), w in mg/cm^2, R = 1.987 cal/mol/K,
        // so 45500 / 1.987 = 22898 K. SECONDARY - ANL-6548 is mandated and named by
        // Appendix K but was not retrieved; these constants come from a reproduction. The
        // risk is low (Baker-Just is among the most-reproduced correlations in the field)
        // and that is still not the same as having read it. Upgrade if ANL-6548 is fetched.
        ea_over_r_k: 22898,
        // 2200 F - the 10 CFR 50.46(b)(1) peak-cladding-temperature limit: "The calculated
        // maximum fuel element cladding temperature shall not exceed 2200 F". REGULATORY
        // PRIMARY, retrieved (govinfo, CFR-2011-title10-vol1-sec50-46).
        ref_temp_c: 1204,
        // Oxidation heat at ref_temp_c, as a fraction of RATED core heat. SECONDARY, and it
        // is the LOAD-BEARING one - the whole calibration hangs off it. The claim is that at
        // ~2200 F the oxidation heat equals the decay heat 8 hours after shutdown, and no
        // primary for it was retrieved. The RATIO is still unsourced; what changed is what it
        // is applied to.
        //
        // RE-DERIVED 2026-08-05 FOR THE #364 REFIT, which is what the previous note here
        // instructed ("re-derive this if the decay groups are re-fitted") and why that note
        // was written. This plant's 8-hour decay heat was **1.1243 %** of rated on the old
        // two-group curve and is **0.8658 %** on the sourced four-group one, so the same claim
        // now transfers onto a decay model that tracks a published standard within ~4 % rather
        // than one running ~2.4x high. The warning the old note carried — "if our 8-hour decay
        // heat is unrepresentative the absolute oxidation heat inherits that" — is materially
        // weaker now, and that is the whole benefit: the inherited error is gone even though
        // the ratio itself is no better sourced than before.
        // MEASURED full stack, scram at 30 s: 8 h = 0.8658 % (sourced target 0.8750 %, -1.1 %).
        // The melt timings remain an output CONDITIONAL on this number.
        q_ref: 0.008658,
        // s - time to grow the reference oxide at ref_temp_c; sets how fast the protective
        // layer throttles the reaction. [tune]. Corroboration: Baker-Just reaches 17 % ECR -
        // the 10 CFR 50.46(b)(2) limit, REGULATORY PRIMARY - in ~80 s at 1204 C for typical
        // Zircaloy geometry. The GEOMETRY in that check (0.057 cm wall, 6.56 g/cm^3, oxygen
        // gain 32/91.22 of the metal) is RECALLED, not sourced, so treat it as an
        // order-of-magnitude sanity check rather than a derivation.
        tau_ref_s: 80.0,
        // NOT steam-limited - and that is the REQUIRED assumption, not a shortcut we are
        // declaring. Appendix K para 5: "The reaction shall be assumed not to be steam
        // limited." The first write-up listed steam starvation among our simplifications;
        // it is the regulatory model.
      },
      // Break blowdown flash-cooling (pwr_thermal.stepCoolant). Coolant leaving a primary
      // break (s.leak_flow) carries enthalpy, and the remaining inventory flashes to replace
      // it — removing latent heat as the break vents. Modeled as a self-limiting perfect-mixing
      // pull of Tavg toward blowdown_sink_c (containment saturation) at the break throughput
      // rate, scaled by blowdown_gain (same dimensionless form as the ECCS cold-injection
      // quench). This makes the saturation plateau RESPOND to break size, which is the physical
      // small-vs-large discriminator: a SMALL break — decay heat dominates the weak cooling, so
      // Tavg holds the hot plateau; a LARGE break — this term dominates decay heat, Tavg falls
      // toward containment, and Psat(tavg) (and thus pressure, via the two-phase sat-pull) drops
      // through the ECCS/accumulator band. Keyed on leak_flow ONLY — a stuck-open PORV/safety
      // vents the steam space (K_porv_relief) and leaves leak_flow=0, so the flagship TMI path is
      // untouched. SATURATION-GATED since #363: flashing removes latent heat only at saturation,
      // and the gate lives at the term (pwr_thermal.stepCoolant) with the derivation.
      //
      // WHAT THIS PARAGRAPH USED TO CLAIM, AND WHY IT WAS WRONG. It said of a small break that
      // "Psat(tavg) pins RCS pressure well above 600 psi (the TMI inventory/void lesson)".
      // MEASURED full stack on a 2 % break (#363): at 20 min Tavg is 240.9 F (116.1 C), so
      // Psat(Tavg) is about 25 psi (0.17 MPa) — it pins NOTHING. Pressure is above 600 psi
      // because the PRESSURIZER HEATERS are winning against the break (K_heater 0.55 MPa/s
      // against K_leak_depressurize · leak_flow ≈ 0.21 MPa/s). Right behaviour, wrong mechanism,
      // which is worth more than a wrong number: the sat-pull only pins pressure once the plant
      // IS saturated, and on a small break with make-up available it never gets there.
      //
      // THE TUNING CRITERION STILL HOLDS AND IS UNMOVED BY THE GATE, re-measured rather than
      // assumed: ≤8 % SGTR holds the plateau (2267 psi / 15.63 MPa at 8 %, against the >600 psi
      // criterion) and the 20 % large-LOCA default still crosses below the 4.14 MPa accumulator
      // setpoint (3.98 MPa, against 4.00 MPa before the gate). SGTR is unaffected to three
      // significant figures, because that path stays subcooled and the term was barely active on
      // it. So neither constant below was retuned. [tune]
      blowdown_gain: 0.25,         // dimensionless scale on the break flash-cooling mixing term — re-solved x12.5 with the #408 re-clock (leak currency shrank ~12x; solved against the anchored DEG arc) [tune]
      blowdown_sink_c: 110.0,      // °C — containment-saturation floor the blowdown pulls Tavg toward [tune]
    },

    // -------------------------------------------------------------- pressurizer
    // Pressures in MPa. Gains re-derived for the MPa scale (the M1 snippet
    // constants 2235/2350/2485/2400 were psia residue; converted to MPa here).
    pressurizer: {
      P_equilibrium: 15.41,        // MPa (operating primary pressure)
      P_setpoint: 15.41,           // heater/spray control target, MPa (2235 psia)
      // Proportional bands (M1 §6.4: "Bands 0.207/0.345 MPa").
      heater_band_mpa: 0.207,
      spray_band_mpa: 0.345,
      // Low-level heater cutoff, % INDICATED pressurizer level (#334, 2026-08-04).
      // NOT [tune] — it is the source's own number, not a fitted one. WTSM 10.3
      // (ML11223A290) §10.3.4.1: "This bistable provides a low level interlock at 17%
      // level in the pressurizer … and turns off all pressurizer heaters. … the heater
      // cutoff protects the heaters which would be damaged if operated in a steam
      // environment." Sits below the existing `pzr_level_low` alarm (25 %, which is also
      // WTSM 10.3's low level setpoint) and above `pzr_level_lolo` (12 %), so the operator
      // gets the warning first and the CRITICAL alarm is still the one that means trouble.
      heater_cutoff_level_pct: 17.0,
      // …and the RESET differential, % INDICATED level (#348, 2026-08-04). Also not [tune]:
      // it is taken from this plant's own model of the OTHER half of the same bistable —
      // `pzr_level` low 17.0 with `reset_below: 20.0` in `pwr_control.js` PWR_ACTUATIONS,
      // the letdown isolation. WTSM 10.3 §10.3.4.1 describes ONE bistable at 17 % doing both
      // jobs, so the two outputs cannot reset differently, and the heater half had no
      // differential at all. Measured without it, on a 10 % break with a full manual demand
      // standing: the indicated level dithers across the setpoint and the heater bank flickers
      // on for **35 % of every sample below 17 %**, in runs of up to 8, all between 16.3 and
      // 17.0 %. A ~1 MW load cycling at the evaluation cadence — the #306 alarm-chatter defect
      // one system over. With the latch, zero.
      heater_restore_level_pct: 20.0,
      // Pressure-balance gains (MPa-rate units) [tune].
      // PORV/safety relief gains are large: the valves vent the pressurizer STEAM
      // space, so a small mass flow has a big pressure effect — which is why the
      // inventory-loss gain (porv_flow_max) and the pressure gain are decoupled.
      // K_heater — SOURCED CEILING, FITTED VALUE, AND THE GAP IS DECLARED (#337).
      //
      // WTSM 3.2 (ML11223A213, p. 3.2-9) gives this authority directly, in rate units:
      // "There are 78 heaters installed for a total capacity of 1794 kW. … The heaters are
      // capable of raising the temperature of the pressurizer and its contents at
      // approximately 55 EF/hr." Along the saturation line at 2235 psia the sim's own T_sat
      // correlation gives dP/dT = 0.18686 MPa/°C, so 55 °F/hr = 30.56 °C/hr = 8.488e-3 °C/s
      // is 1.586e-3 MPa/s of pressure — the REAL-TIME full-heater authority.
      //
      // The ×12.6 Mode 5↔1 compression is RETIRED (#419 wave 1, 2026-08-07 pace ruling), so
      // `setpoint_pressurize_slew_mpa_s` now IS this real-time 1.586e-3 — the config still
      // states the same physical quantity twice, and the cross-check now closes at the REAL
      // value instead of the compressed 0.020. Against the real authority the shipped 0.55 is
      // ~347× (0.55 / 1.586e-3), where the §12.15 departure used to read 27× against the
      // compression-consistent figure. The DEPARTURE'S SIZE changed on paper only — the
      // behavioral wall below (TR-1h / TR-11) is what rules it, and was re-measured
      // 2026-08-07 (the #419 audit) on the post-#418 plant.
      //
      // 0.55 WAS 27× ABOVE THE COMPRESSED FIGURE, and the consequence is #337: the heaters could hold nominal
      // pressure against ANY surge this plant can produce, so an SGTR that took the
      // pressurizer 55.0 → 15.7 % and scrammed the reactor moved pressure 5 psi (0.034 MPa) and
      // subcooling 0.2 °F (0.1 °C). Adding the missing mass-surge driver alone changed that by
      // 9 psi — measured — because the heater simply rebalanced against it.
      //
      // IT STAYS AT 0.55, RULED *(OWNER RULING, 2026-08-04: "F14 go with the recommendation.")*,
      // on the recommendation below: the lesson is DIRECTION AND ORDERING — level first, then
      // pressure, then subcooling — and since #337 the player gets all three. The magnitude is a
      // declared departure at `Manuals/12` §12.15, not a defect to be fixed later. Closing the gap
      // would trade the ride-out character the plant is built around for a sharper version of a
      // coupling it now has. Do not re-open this as a tuning task. Measured full stack, `run_behavior`
      // red count and the subcooling cue from a leak that drives the pressurizer to the 17 %
      // heater cutoff (SGTR sev 0.02), everything else held:
      //
      //     K_heater   subcooling cue   full (100 %) load rejection    run_behavior
      //       0.55       −0.7 °F          no scram                      48 pass   <- shipped
      //       0.35       −1.1 °F          no scram                      47 pass
      //       0.20       −1.2 °F          no scram                      44 pass
      //       0.10       −3.1 °F          no scram                      43 pass
      //       0.05       −8.5 °F          SCRAM 122 s, otdt_margin low     —
      //       0.02       −9.4 °F          SCRAM 103 s, otdt_margin low     —
      //
      // The wall between 0.10 and 0.05 is TR-1h: "no scram" on a full load rejection is this
      // plant's ride-out character — a ruled departure from the Westinghouse 50 % criterion —
      // and OTΔT is what binds it (the #311 trap, from the other side). Below 0.20 the
      // pressurizer also stops winning against its own spray, so TR-11's stuck-open spray
      // valve depressurizes the plant to the containment floor instead of parking. Both are
      // real plant behaviours, and the ruling above chose the present ones.
      K_heater: 0.55,
      K_spray: 1.7,
      // K_porv_relief / K_safety_relief — RE-SOLVED 300 → 600 with #337 F15, ruled
      // *(OWNER RULING, 2026-08-04: "Do f15 how you recommend.")*. ONE constant applied twice:
      // both valves vent the same saturated steam from the same steam space, so the pressure
      // per unit vented mass is the same and only the FLOW capacities differ (porv_flow_max /
      // safety_flow_max). They must move together.
      //
      // WHY THEY MOVED. #337 gave the pressurizer a general mass→surge law, and
      // `K_surge_level · level_per_mass` = 310 — within 3 % of the 300 these gains carried.
      // That is not a coincidence: these two constants WERE the mass→pressure coupling, fitted
      // per path before a general law existed. Relief is excluded from the surge driver now
      // (pwr_primary.stepInventory — the valves discharge STEAM from the bubble, which never
      // crosses the surge line), so the gain has to carry the whole effect again, and 300 was
      // fitted to a plant where ECCS could NOT push back on pressure. Since #337 injection is an
      // insurge, so the same valve achieves less depressurization and needs more gain.
      //
      // HOW 600 WAS CHOSEN, and the honest part is what did NOT work. The sourced criterion —
      // WTSM 3.2 (ML11223A213, p. 3.2-11), "The PORVs are designed to limit the pressure in the
      // pressurizer to a value below the high pressure reactor trip setpoint for design
      // transients up to and including a 50-percent step load decrease with full steam dump
      // actuation" — is SATISFIED AT EVERY VALUE TESTED and therefore does not solve it:
      // measured on a full load rejection, peak pressure is 2364..2372 psi across 300..1200
      // against a 2384 psi trip, because the PORV setpoint and the trip are only 0.24 MPa apart
      // and spray holds the gap regardless. It is a necessary condition this plant already meets.
      //
      // A first-principles solve does not close either, and that is worth knowing before anyone
      // tries: venting `porv_flow_max` 0.0035 frac/s as SATURATED STEAM would empty a 560 ft³
      // bubble in under two seconds (1554 lbm/s against a real PORV's 210,000 lb/hr = 58 lbm/s),
      // so `porv_flow_max` and this gain are a matched FITTED pair with no clean physical
      // decomposition. Deriving one requires re-deriving the other, and `porv_flow_max` is
      // explicitly tuned for the TMI flagship's pacing.
      //
      // So it is solved against BEHAVIOUR: 600 excluded reproduces the total authority the plant
      // was calibrated with (300 direct + 310 surge), and measured, it restores `run_meltdown`
      // to 12 pass and `run_scenarios` to 3/3 — the two suites that hold this plant's relief
      // ladder, and which BOTH go red at 300..450. What changed is that the constant now means
      // what it says instead of being silently doubled.
      //
      // THE STRUCTURAL REASON THE TWO ARE NOT INTERCHANGEABLE, and it is the finding worth
      // keeping: the surge term is gated `saturated ? 0` (a voided loop is pinned to Psat(Tavg),
      // so the subcooled-liquid terms are suppressed). Routing relief through it therefore made
      // a relief valve DOUBLE-strength while subcooled and HALF-strength once the plant voided —
      // and voided is exactly the regime the meltdown paths, the TMI flagship and TR-15 live in.
      // A valve vents steam regardless of what the bulk coolant is doing, so it must not inherit
      // that gate. That, not the arithmetic, is the real argument for the exclusion.
      //
      // KNOWN COST, left red on purpose: `run_behavior` TR-15 leg E ("with the heat sink gone
      // the plant is still lost — circulation is not cooling") now fails, at EVERY gain tested
      // from 400 to 600 — Tavg 482 / 455 / 448 / 447 °F, monotone, core undamaged. With relief
      // no longer losing authority in saturation, the plant rides out a lost heat sink on relief
      // bleed. Whether that is right is a PLANT question (`porv_flow_max` and this gain are a
      // matched fitted pair, and preserving leg E means moving both), so it belongs with the
      // TMI-2 trajectory re-author rather than being tuned away here. [tune]
      //
      // RE-SOLVED 600 -> 3144 with the 2026-08-07 proportional-valve ruling (see
      // porv_flow_max above), preserving the PORV's full-open PRESSURE AUTHORITY exactly:
      // 600 x 1.31e-3 = 3144 x 2.5e-4 = 0.786 MPa/s. This is the matched-pair rule the
      // paragraph above states, applied in the other direction — the valve's MASS now runs
      // on the real #408 accident clock while its pressure/energy authority keeps the
      // compressed-clock duty (the transient backstop TR-1k measures, and the blowdown
      // pacing every relief-ladder suite was calibrated against). The safeties inherit the
      // shared K (F15: one steam-venting physics, capacities differ), so their authority
      // rises 1.32 -> 2.52 MPa/s — their old capacity was UNVERIFIED recall, and the
      // sourced 3.2 flow ratio is now what sets it.
      //
      // RE-SOLVED 3144 -> 2500 [derived-net, F14-COUPLED] at #419 wave 2 (2026-08-07). Both
      // of 3144's pins had dissolved (the TR-1k doorstep went thermal at #418 B1; the 0.786
      // preserve was the ×12.6 pace duty, retired at wave 1), so the constant was re-derived
      // from physics — and the measurement that followed is the anchor:
      //
      // K_phys ≈ 304 (the K_steam_pressure C_eff method, ONE basis — the declared RCS
      // currency IS power-scaled Ginna to 1.3 %: 38,323 gal × 300/1520 ≈ 7,467 gal):
      //   pzr = Ginna ~747 ft³ (TS Bases B 3.4.10: 650 ft³ = 87 %) × 300/1520 = 4.13 m³,
      //   60/40 split; C_eff = dome V_s·dρg/dP (≈16 kg/MPa) + liquid flash m_l·cp·(dTsat/dP)
      //   /h_fg (≈52) ≈ 68 kg/MPa; full-open 5.13 kg/s → 0.076 MPa/s → K ≈ 304 — within 2 %
      //   of the pre-F15 original 300. The same C_eff method run on TMI-2's real geometry
      //   gives ~5.3 min to saturation against the historical ~6 — the method validates.
      //
      // MEASURED AT 304: run_meltdown 12/12, run_scenarios 3/3 — but the TMI ARC RE-ORDERS.
      // The ruled F14 heater (0.55 MPa/s, ~347× real) out-muscles the physical relief
      // authority (0.076), so a stuck-open PORV cannot depressurize the loop: the heaters
      // hold pressure while the valve drains the pressurizer to 0 % (measured — level
      // 55 → 28 → 0 in 8 min, heater cutoff, then an 8.6↔15.4 MPa limit cycle). Level
      // CRASHES instead of RISING: the TMI deception — Tier-A content and historical fact —
      // never forms. K=3144 was implicitly the second half of the F14 pair (0.786 > 0.55).
      //
      // THE RESOLUTION: preserve this plant's OWN physical NET depressurization under the
      // ruled heater — K×2.5e-4 − K_heater(0.55) = K_phys−heater_real = 0.0744 MPa/s
      // → K = 2498 ≈ 2500. Anchored, not fitted: the free parameter is F14, which is RULED
      // (re-affirmed 2026-08-07). If F14 ever moves, re-solve this with it — they are one
      // pair through the stuck-PORV race. Measured at 2500: saturation ~5 min (TMI-2: ~6),
      // the deception level rise crosses the 75 % annunciator at ~25 min and reaches 100 %
      // by 50 min on a quasi-stable 8.1–8.25 MPa ride; TMI campaign cluster 8/8, qualify
      // 5/5, meltdown/scenarios green. Safeties inherit the shared K (F15): bank authority
      // 2500 × 8.0e-4 = 2.0 MPa/s.
      K_porv_relief: 2500.0, K_safety_relief: 2500.0,
      // CC-5 spray FLOW CAP (catalog v3 FG-6, feel-plan P5): spray is sized for
      // step insurges, NOT for a loss-of-heat-sink repressurization — capped at
      // this fraction of full spray flow (auto demand AND operator override), the
      // TMI opener's heat-up outruns it and the PORV lifts at 16.20 as canon
      // requires. Cooldowns still get real depressurization authority.
      spray_flow_max: 0.12,        // [tune] — binds below the TR-2 insurge equilibrium (~0.23 demand)
      spray_floor_band: 3.0,       // MPa — spray authority tapers to 0 across this band above Psat(THOT), the core-exit leg (see pwr_pressurizer spray_floor); floor is the hottest leg so spray can't pull below core-exit saturation (P6)
      // Pressurizer SURGE gain — MPa/s of pressure per %/s of pressurizer LEVEL rate.
      //
      // Was `K_surge: 1.0` in °C/s of Tavg until #337. The CURRENCY is the point: a surge is a
      // volume displacement of the pressurizer, so inventory drives it as well as thermal
      // expansion, and stating it per unit LEVEL rate is what lets one law carry both (see
      // pwr_pressurizer.stepPressure for the law and the WTSM 3.2 quote). 1.0 / level_per_tavg
      // (2.5) = 0.4 would have been the byte-identical thermal response in the new units.
      //
      // 0.032 SINCE #419 WAVE 1 — the ×12.6 compression retired *(OWNER RULING, 2026-08-07:
      // "D2: move it.")*, the value keeps its fitted POSITION in the sourced band.
      // Derived from the same WTSM 3.2 number that bounds K_heater below: 1794 kW ⇒ 55 °F/hr
      // is 8.842e-7 MPa/s per kW at NOP. One %/s of level is 12.44 ft³/s of bubble growth
      // (#249's fit: 45 points of level = the 0.40 × 1,400 ft³ steam space), which at
      // v_g = 0.1955 ft³/lbm and h_fg = 361 Btu/lbm is 63.6 lbm/s of steam = 24,240 kW of
      // flashing demand. That lands at 0.0214 MPa/s if the vessel METAL participates (the
      // effective heat capacity the source's own 55 °F/hr implies) and 0.0502 if only the
      // pressurizer liquid does — a real spread, because a fast surge does not reach the
      // metal. THAT band (0.0214–0.0502) is now the operative one; the shipped 0.032 =
      // 0.4 ÷ 12.6, the old fit's mid-band position un-compressed.
      //
      // History: the pre-#419 value was 0.4, mid-band of the ×12.6-multiplied range
      // 0.27–0.63, and 0.27 was once refused because a 1.5× weaker insurge kept TR-1c's
      // sub-arm rejection off the PORV (the §8.21 backstop). That objection is SUPERSEDED:
      // the §8.21 cliff went THERMAL at #418 B1, and the #419 stage-1 sweep measured 0.27
      // and 0.05 flipping the SAME five checks (TR-1's lift claim, CA-21's dry-core
      // fixture) — both re-derived in this wave, neither a ruled behavior. [tune]
      K_surge_level: 0.032,
      // solid_bulk_mpa — the WATER-SOLID surge gain (#346), MPa of primary pressure per
      // unit RCS inventory FRACTION. `K_surge_level` above is the gain of a pressurizer
      // that still has a steam bubble; this is the gain once the bubble is gone.
      // pwr_pressurizer.stepPressure converts it into the shared level currency by
      // dividing by `level_per_mass` (the comment here named `level_per_mass_surplus`
      // until 2026-08-08 — that constant was retired at #365; the two slopes were equal
      // and one name survives), so the two are stated in the units their own
      // derivations come in and neither has to be re-solved when the other moves.
      //
      // THIS IS A PHYSICAL CONSTANT, NOT A FIT. A water-solid RCS is a fixed volume of
      // liquid: dP = B·dρ/ρ = B·dm/m, so the gain per inventory fraction IS the isothermal
      // bulk modulus of the coolant. For water at ~300 °C / 15.5 MPa that is ≈ 1.3 GPa
      // (it falls steeply with temperature from ≈ 2.2 GPa cold — the hot value is the one
      // that matters, because every path that fills this plant solid is hot).
      //
      // THE INTERNAL CHECK, and it is worth more than the number. The same argument run on
      // the STEAM side has to reproduce `K_surge_level`, and it does: compressing the bubble
      // isothermally gives dP/P = −dV_s/V_s = −(V_RCS/V_steam)·dm/m, and #249's own geometry
      // (BVPS-2 UFSAR Tbl 5.1-1 RCS 9,650 ft³; WTSM 3.2 Tbl 3.2-2 full-power steam volume
      // 720 ft³) makes that 15.4 × 9650/720 = 206 MPa/frac against the shipped
      // K_surge_level·level_per_mass_surplus = 310. Same order from an independent route,
      // so the RATIO the plant actually feels — solid ≈ 4× stiffer than bubbled — is not an
      // artifact of picking one of the two numbers.
      //
      // THE §12.4c REGIME LEDGER (Manuals/12 §12.4c; comment re-swept 2026-08-08 — it
      // still declared all three terms deferred two waves after two of them shipped):
      // SPRAY is zeroed at solid (#347, load-bearing — credited spray pinned pressure
      // 164 psi under the code safeties); RELIEF steps to this same bulk modulus at
      // solid (2026-08-07, #408 wave 1 — at real valve mass flows the bubbled gain
      // could not pass unterminated ECCS and inventory walked to the `mass_max` clip
      // by a fourth road); the HEATERS alone keep their bubbled gain — unobservable at
      // solid (pressure sits above their setpoint) and ruled (F14).
      //
      // THE HISTORICAL CAUTION STANDS, ON ITS OWN SCALE. On the pre-#408 valve scale,
      // folding relief into the SURGE DRIVER (a different edit than the K-step above)
      // dropped the relieving equilibrium ~145 psi (1 MPa), put the plant further below
      // `hpi_pressure_ref`, injection out-ran the PORV, and inventory walked back to
      // the `mass_max` clip — the defect this constant exists to fix, returning by
      // another road. Relief stays OUT of the surge driver (F15); what changed in #408
      // is the PER-UNIT-MASS GAIN its own flow term uses when solid. [tune]
      solid_bulk_mpa: 1300.0,
      P_restore_rate_gain: 0.02, // gentle stabilization only (heater regulates)
      // Operator-setpoint pressurization slew — REAL-TIME since #419 wave 1 *(OWNER RULING,
      // 2026-08-07: "D2: move it. D3: go real. Stage 2: go with recommendation." — the pace
      // ruling; the ×12.6 Mode 5↔1 compression is RETIRED, acceleration carries pacing)*.
      // K_heater (0.55 MPa/s at full power) is the CONTROL authority for holding pressure
      // against transients — but it made a RAISED operator setpoint arrive near-instantly.
      // Physically, heating a big subcooled pressurizer to a higher saturation point takes
      // time regardless of heater margin, and the honest rate is the sourced full-heater
      // authority derived in the K_heater block: WTSM 3.2's 1794 kW ⇒ 55 °F/hr ⇒
      // 1.586e-3 MPa/s along the saturation line. Cold→NOP is now ≈ 2.26 plant-hours
      // ((15.41 − 2.5)/1.586e-3 ≈ 8,140 s — was ≈ 11 min at the compressed 0.02); ride it
      // at time acceleration. A LOWERED setpoint still takes effect immediately
      // (depressurization is spray/cooling-limited on its own), and disturbance response at
      // a FIXED setpoint is untouched. [derived — see K_heater block]
      setpoint_pressurize_slew_mpa_s: 1.586e-3,
      // When the primary voids it is two-phase: pressure is pulled to the
      // saturation pressure of Tavg (so subcooling → 0). [tune]
      // Since #384 stage 4 the pull is scaled ·(1−void) WHEN A LOOP BREAK IS FLOWING
      // (pwr_pressurizer.stepPressure) — closed-system flashing cannot hold pressure in
      // a vented RCS. The PORV/SGTR/no-break paths keep the full pull, path-scoped.
      K_sat_pull: 1.5,
      // /(MPa·frac/s·s) — the OPEN-SYSTEM half of the two-phase regime (#384 stage 4):
      // with a loop break flowing and the primary voided, steam leaves through the hole
      // and pressure decays toward the LIVE containment backpressure at rate
      // K_break_vent·leak_flow·void·(P − P_ctmt). Path-scoped (never SGTR, never the
      // relief path) and ·void, so it is identically zero when solid — it cannot reach
      // CA-19's throughput equilibrium or CA-15's arrest. Sized against the WTSM 5.0
      // blowdown-ends-at-containment shape on a full-size break while the sev-0.05
      // family's plateau grading survives; CA-20 pins the shape. [tune]
      K_break_vent: 5.0,
      // Break blowdown: a primary break (LOCA/SGTR, s.leak_flow) vents the coolant
      // to containment and depressurizes the RCS — unlike CVCS letdown, which is a
      // controlled inventory bleed at pressure. This is what pushes a LARGE break
      // below saturation (voiding → sat-pull takes over) and into the ECCS/accumulator
      // band; a small PORV break floors higher (TMI). Zero when no break.
      //
      // THIS TERM AND `thermal.blowdown_gain` ARE THE TWO HALVES OF ONE BREAK, and until
      // #363 only this half knew what regime it was in: `stepPressure` gates this on
      // `saturated`, while the temperature half ran on `leak_flow > 0` alone and went on
      // "flash"-cooling a plant that had stopped boiling. They are gated on the same test
      // now, spelled in each file's own currency (see pwr_thermal.stepCoolant for the
      // algebra showing the two spellings are inverses, not opinions).
      //
      // The gate did NOT change what this constant does, and the small-break pressure is
      // still held ABOVE the accumulator band — but by the HEATERS, not by the sat-pull the
      // old `blowdown_gain` comment credited. Measured on a 2 % break: K_heater 0.55 MPa/s
      // against this term's 0.21 MPa/s at that leak rate. [tune]
      K_leak_depressurize: 60.0,
      // PORV: auto-open 16.20 MPa (2350 psia), command-close 15.86 MPa (2300 psia).
      porv_open_mpa: 16.20, porv_close_mpa: 15.86,
      // PROPORTIONAL relief, not fleet-absolute *(OWNER RULING, 2026-08-07: "Why not go
      // with the proportional valve other than redoing some scenarios and trainings?
      // The plant comes first, then the training, documentation follow.")* — reversing
      // the wave-1 fleet-standard 1.31e-3, which sized a 2,900 MWt plant's valve onto a
      // 300 MWt RCS and (measured) out-bled full ECCS 6x, made feed-and-bleed unviable
      // (MD-10), and put every TMI clock ~5x fast. A real plant sizes relief to ITS
      // rating; the per-unit hardware that genuinely stays absolute is the SG tube and
      // the RCP seal, not a spec'd valve.
      //   Sizing (Ginna is the same-document ratio base, ~152 lbm/MWt like this plant's
      //   149): 210,000 lb/hr valve class x (300/1,520 MWt) = 41,400 lb/hr = 11.5 lbm/s
      //   / 44,600 lbm = 2.58e-4; BVPS fractional parity gives 1.0e-4; adopted 2.5e-4
      //   (~112 gpm equivalent). Full-open ~= TMI-2's own single-PORV fraction (1.1e-4
      //   on 540,000 lbm) x2.3 — same decade, where the fleet valve was 12x.
      //   The TMI draindown with injection secured is ~2-2.5 h now (net ~1.2e-4 against
      //   auto charging), i.e. the 1979 clock — was "~20-25 min" under the fleet valve.
      porv_flow_max: 2.5e-4,       // normalized inventory loss, one plant-sized valve (#408 + 2026-08-07 ruling) [tune]
      // Spring safety valves: mechanical open 17.13 MPa (2485), reseat 16.55 (2400).
      safety_open_mpa: 17.13, safety_reseat_mpa: 16.55,
      safety_flow_max: 8.0e-4,     // safeties:PORV = 3.2 sourced (#349's 3.0-3.3 band; Ginna 2x345k vs 2x210k lb/hr = 3.29 per-valve-bank) x 2.5e-4 — closes #349's 28.6x finding; was 2.2e-3 UNVERIFIED recall (#408) [tune]
      P_containment: 0.103,        // MPa backpressure [tune]
      P_flow_ref: 15.41,           // reference ΔP for relief-flow sqrt scaling, MPa
      // Pressurizer level — DERIVED (catalog v3 FG-3 / CC-10 rework, 2026-07-21).
      // Level is a pure function of state, not an integrator:
      //   level = base(Tavg) + level_per_mass·(mass − 1) + level_per_void·void
      // base(Tavg) is the thermal-expansion line anchored at pzr_level_nominal for
      // the full-power equilibrium Tavg, floored below the program band (cold modes:
      // the normalized mass bookkeeping doesn't model the real cold-plant mass
      // surplus, so the floor stands in for CVCS keeping the pzr on span). The void
      // term is the TMI deception, active ONLY when the primary actually voids
      // (saturation-gated in pwr_primary): 3·level_per_void > level_per_mass, so in
      // any voided state indicated level RISES as inventory falls — and nowhere else.
      level_per_tavg: 1.62,        // % level per °C Tavg — RE-DERIVED at #419 wave 3 for the steep Ginna
                                   // program: (55 − 25) / 18.5 °C span puts the no-load program level at
                                   // the real plant's 25 % (WTSM §10.3, ML11223A290: heatup "assumption
                                   // that the level in the pressurizer is 25%"). History: 2.0 originally,
                                   // steepened to 2.5 for the retired shallow 297→304 program (which
                                   // needed the help to keep a visible span); at 2.5 the steep program
                                   // would have parked no-load level at 8.7 % — under the 17 % heater
                                   // cutoff. K_surge_level is per-LEVEL-rate and keeps its own sourced
                                   // band unchanged; the thermal surge conversion moves with this
                                   // geometry honestly. [derived — see above]
      // % level per inventory-fraction DEFICIT below nominal.
      //
      // THE SAME NUMBER AS THE SURPLUS BRANCH, and #330 is the record of what it cost to
      // have them differ. This was 100.0 — "a deficit draws down the whole loop" — from v1
      // until 2026-08-04. That sentence is not true of a subcooled PWR, and the surplus
      // comment directly below has always said why: the pressurizer steam space is "the only
      // compressible volume". A solid RCS is incompressible liquid EVERYWHERE else, so
      // inventory taken out of it comes out of the PRESSURIZER and the bubble grows to fill
      // the space — at exactly the rate a surplus packs into it. The geometry does not know
      // which way the flow is going. Two slopes meant two contradictory statements about the
      // same pressurizer, and the shallow one is the one that was wrong.
      //
      // WHAT IT COST — measured full stack, `hot_full_power`, `cvcs_makeup` stood down and
      // nothing else touched (#330). At 100.0 the plant drained 37.5 % of the RCS through a
      // 3 % letdown orifice and MELTED THE CORE at 22.1 min, un-scrammed, with primary
      // pressure, Tavg and subcooling margin DEAD FLAT at nominal and the cladding at
      // 24,958 °F (13,848 °C). The reason nothing caught it: the low-pzr-level letdown
      // isolation fired at 20 % indicated and parked the level at 17.5 %, which is 5.5 points
      // ABOVE the 12 % lo-lo scram — so the one protective actuation in the path removed the
      // last indication that would have tripped the plant. #330 called that "the protective
      // actuation is what destroys the core", and it was right, but the actuation is not the
      // defect: it fired at the correct level and by then the loop had lost seven times more
      // inventory than that level implied.
      //
      // AT 776 THE SAME ACTUATION PROTECTS. Measured on the identical rig: letdown isolates
      // at ~2m30s with inventory at 95.10 %, level parks at 16.97 %, and the plant sits there
      // to 40 min — core covered, no damage, no melt, no scram needed. The cue the player
      // gets is a pressurizer level that moves the way a real one does.
      //
      // KNOCK-ON, DECLARED: the CVCS level loop is 7.76× stiffer on the deficit side, so its
      // time constant 1/(cvcs_charge_per_level·cvcs_inventory_gain·level_per_mass) goes
      // 83 s → 10.7 s. That is NOT a new number in this plant — it is exactly the surplus-side
      // τ #249 measured and accepted ("the servo is simply faster on the surplus side now
      // (27.8 → 10.7 s); measured, it does not hunt"). The two branches now share one τ, which
      // is one fewer asymmetry, not one more. `cvcs_charge_per_level` was deliberately NOT
      // scaled to hold 83 s: that would restore the split this change exists to remove. [tune]
      level_per_mass: 776.0,
      // `level_per_mass_surplus` WAS HERE AND IS RETIRED (#365, collapsed 2026-08-05 on
      // OWNER RULING: "365: collapse."). It was 776.0 — the SAME value as `level_per_mass`
      // since #330 — so the piecewise branch that chose between them returned one number on
      // both legs, in two places (pwr_pressurizer's `levelRaw` mass term and `stepPressure`'s
      // `surge_rate`), and in a third as the solid-gain denominator.
      //
      // WHY IT COULD NOT JUST BE LEFT: a fork whose branches are identical can never be
      // exercised apart, so no gate can see a future edit to one and not the other — the
      // plant would then behave two ways in two places with every runner green. That is
      // #315's shape, and it is why this was a maintenance hazard rather than a spare knob.
      // The physics is `level_per_mass`'s own note: the pressurizer steam space is the only
      // compressible volume in a subcooled loop, so it absorbs a deficit at the rate it
      // absorbs a surplus — the geometry does not know which way the flow is going.
      //
      // To re-split it, restore the branch AND derive the second slope; do not reintroduce a
      // second name holding the same number.
      // % level per void-fraction — the TMI lift. Calibrated so the story-clock void
      // (~0.2 as HPI fires) lifts level past the 75 % high alarm (the "going solid" call
      // that throttles HPI), and deep voiding pegs the gauge high (historical).
      // ×void_gain 3 ⇒ net +350 %/frac against the mass term: any voided state on the
      // RELIEF/steam-space path deceives. Since #385 stage 2 the term is weighted by
      // `void_weight_surge_ref` below — a LOOP break suppresses it (the displacement
      // discharges through the hole, not up the surge line); leak_flow = 0 keeps the
      // full calibrated lift, so everything in this comment block is about that path.
      //
      // THIS AND `level_per_mass` ARE A MATCHED PAIR — the deception is their DIFFERENCE,
      // so neither can move alone. 150.0 was the value paired with the old mass slope of
      // 100 (3×150 − 100 = +350). When #330 corrected the mass slope to 776 and this was
      // left at 150, the net went to 3×150 − 776 = −326: level FELL as the primary voided
      // and the TMI deception — the single lesson this plant is built around — inverted.
      // Measured, that is exactly what happened: `run_pwr flagship_tmi` "pzr level rises as
      // inventory falls" read 0.0 against a 48.6 threshold, and `pwr_tmi2_p3` stopped
      // reaching `level_complete`.
      //
      // RE-SOLVED, NOT RE-GUESSED: both documented targets above are held fixed and the
      // constant falls out of them. net = void_gain·level_per_void − level_per_mass = +350
      // ⇒ level_per_void = (350 + 776)/3 = 375.33. The independent check is the other
      // target: at the story-clock void of 0.2 the gauge reads 78.3 %, still past the 75 %
      // high alarm it was originally calibrated against.
      //
      // NOT scaled proportionally (150 × 7.76 = 1164), which is the obvious move and is
      // wrong: it takes the net to +2716 %/frac and PEGS the gauge at 100 % almost
      // immediately, destroying the graded "level looks fine, then looks too good" arc the
      // TMI beats are written against. The deception is a difference, so it is solved from
      // the difference. [tune]
      level_per_void: 375.33,
      // frac/s — the surge-line share of the void-displacement split (#385 stage 2,
      // pwr_pressurizer.levelRaw): the void term is weighted w = ref/(ref + leak_flow).
      // A LOOP break gives the displaced liquid a second exit, so the TMI lift is
      // suppressed in the ratio of the two paths' flows; leak_flow = 0 → w = 1.0
      // EXACTLY, which is what keeps the calibrated stuck-PORV/no-break arc above
      // byte-identical. Sized against the #385 severity sweep: at the board default
      // (leak ~0.076 frac/s) w ≈ 0.12, which takes TRUE level at core-top uncovery
      // from a pegged 100.0 to empty; at a seal-leak trickle (0.005) w ≈ 0.67 and the
      // deception survives, which is right — a trickle does not re-plumb the surge
      // line. SOURCED direction (not magnitude — the split ratio is this plant's):
      // WCAP-16009-NP-A §11-4-5, the pressurizer's 2-phase surge-line DISCHARGE
      // during blowdown. CA-18 pins the algebra and both fences. [tune]
      void_weight_surge_ref: 0.01,
      level_prog_floor: 28.0,      // % — base(Tavg) floor below the program band; 3 % above the
                                   // pzr_level_low alarm (25) so no-load/sagged states don't sit in alarm [tune]
      // % — the CVCS level program's MAXIMUM (pwr_pressurizer.levelProgram). NOT a physics
      // clamp: levelBase is unbounded upward, because the coolant really does expand.
      //
      // SOURCED (#289): WTSM 10.3 Pressurizer Level Control System (ML11223A290) — "both
      // minimum and maximum level limitations are placed on the level program", low 25 % /
      // high 61.5 %. The ceiling's stated purpose is exactly our failure: "This high level
      // setpoint (61.5%) is low enough to ensure that the pressurizer does not go solid
      // following a turbine trip from 100% power without a direct reactor trip, assuming no
      // operator action and NO RESPONSE BY THE AUTOMATIC CONTROL SYSTEMS (the rod control and
      // steam dump control systems)." Rod control in MANUAL is our shipped free-play lineup,
      // so this is the case the real design guarantees and we did not. Without it the program
      // chased Tavg to ~94 % on a load rejection and scrammed the plant on the 97 % going-
      // solid trip with inventory CORRECT (pzr_level_dev NEGATIVE — holding less water than
      // its own program demanded). Measured: 6-11 MWe tripped 6/6 seeds before, 0/42 after.
      //
      // WHY 61.5 AND NOT 55 (my call, not an owner ruling — the number over the rule). The
      // real 61.5 % IS their full-power program value, so the structural rule is "ceiling =
      // program level at full-power Tavg", which here would be pzr_level_nominal = 55. That
      // was tried and is WRONG for this plant: at 55 the ceiling sits ON the normal operating
      // point, so ordinary Tavg noise is clipped on its upper half and the setpoint is biased
      // low all the time — measured, it shifted parked CVCS inventory 0.15 % and reddened
      // run_e2e_controls' derived droop equilibrium (98.85 vs 99.00). A program MAXIMUM should
      // be a limit, not part of the normal control law: at 61.5 it binds only when Tavg parks
      // abnormally high, which is the whole job. Program-to-trip margin is 97 − 61.5 = 35.5 %
      // here against the real design's 92 − 61.5 = 30.5 %, so the bound is not looser than
      // theirs. [tune]
      level_prog_ceiling: 61.5,
      pzr_level_nominal: 55.0,     // % at hot_full_power (the base-line anchor)
      // PORV tailpipe / quench-tank temperature (the discharge line downstream of
      // the PORV and code safeties). Reads WARM at baseline — the seat has always
      // leaked a little (historically true at TMI-2, and why the crew discounted a
      // hot tailpipe) — and heats toward the flowing-discharge temperature whenever
      // relief flow passes. Cools slowly after isolation (a hot pipe stays hot).
      tailpipe_ambient_c: 82.0,    // baseline with seat leakage [tune]
      tailpipe_hot_c: 150.0,       // flowing-discharge temperature [tune]
      tailpipe_heat_tau: 30.0,     // s — heats fast once flow starts [tune]
      tailpipe_cool_tau: 900.0,    // s — cools slowly after the line is isolated [tune]
    },

    // ------------------------------------------------------------------ primary
    primary: {
      void_gain: 3.0,              // [tune]
      // Uncovery thresholds (fraction of full inventory). BOTH are live —
      // `core_top_uncover` in pwr_primary/stepCladding, `significant_uncover` in
      // pwr_thermal.hFcEffective — which is what made the third member of this set
      // dangerous rather than merely dead: `void_onset: 0.85` sat here from v1 to
      // 2026-08-05 with ZERO readers repo-wide (#366), looking like a working
      // threshold because of the company it kept. It also misdescribed the physics
      // it appeared to set. Voiding does not begin at 85 % inventory: the void line
      // (pwr_primary, stepInventory) engages at ANY inventory deficit once the bulk
      // reaches saturation, and is zero above saturation at any inventory —
      //     void = (trueSubcooling <= 0 && _mass < 1) ? clip((1 − _mass)·void_gain, 0, 1) : 0
      // — so there is no inventory onset threshold in this model to tune. Someone
      // moving 0.85 would have been tuning nothing, with no feedback saying so.
      // A real inventory-keyed onset is a physics question, not a restore of the
      // constant; file it if it is wanted.
      core_top_uncover: 0.70, significant_uncover: 0.50,
      pump_spinup_tau: 3.0, pump_coastdown_tau: 8.0, // s [tune]
      // ----------------------------------------------------------------- NATURAL CIRCULATION
      // (#325, ruled 2026-08-04. `natural_circ_flow: 0.0` lived here from v1 to 2026-08-04
      // and was the whole of the departure DESIGN_COMPANION §8.6 declared.)
      //
      // SOURCED MECHANISM — WTSM 3.2.6.3 (ML11223A213, p. 3.2-26): "It is essential to
      // ensure sufficient flow to remove reactor decay heat even when reactor coolant pumps
      // are not operating. The higher elevation of the steam generators relative to the
      // reactor vessel produces a THERMAL DRIVING HEAD to establish and maintain flow in the
      // RCS when heat is removed from the steam generators by dumping steam. Natural
      // circulation flow is sufficient only for DECAY HEAT REMOVAL of a shutdown reactor,
      // not for power operation."
      //
      // THE LAW. Buoyancy head ∝ ΔH·β·ΔT; loop resistance ∝ W². So W = C·√ΔT — the standard
      // single-phase relation, and the elevation/geometry terms are all folded into C because
      // this plant has no loop geometry to carry them separately. The core rise is itself
      // ΔT = delta_T_rated·Q/W (pwr_thermal, the #315 form), so the loop CLOSES:
      //
      //     W = C·√(delta_T_rated·Q/W)   ⇒   W³ = C²·delta_T_rated·Q   ⇒   W ∝ Q^(1/3)
      //
      // Solved rather than iterated, for two reasons that are not style: the fixed-point
      // form would read a ΔT that `flow_floor` CLAMPS below 10 % flow — exactly the band
      // natural circulation lives in — and a lagged self-referential flow term rings. The
      // cube root is not a fudge; it is the classic natural-circulation result, and getting
      // it out of two independently-motivated relations is the internal check on both.
      //
      // C IS FITTED, AND THE 2–5 % FIGURE THIS REPO USED TO QUOTE IS UNVERIFIED. Every
      // outbound attempt at a primary for the MAGNITUDE failed from this environment
      // (nrc.gov 403s; the ERG/EOP verification criteria are not public), and the "2–5 %"
      // in the old §8.6 and Manuals/01 was inherited prose with no citation — so it is NOT
      // being used as an anchor. C is fitted so the plant lands where its OWN energy balance
      // says it must. The claim being made is the SHAPE (W ∝ Q^⅓, and "decay heat only")
      // which is sourced; the SCALE is this plant's, and is marked as such in §8.6's
      // replacement row.
      //
      // C IS UNCHANGED BY THE #364 DECAY REFIT, AND THAT IS DELIBERATE — but the numbers it
      // was justified with have moved, so the justification is restated rather than left to
      // rot. C is a HYDRAULIC constant: it encodes loop geometry and resistance in
      // W = C·√ΔT, and it does not depend on how much decay heat there is. What depends on
      // decay heat is where the plant LANDS, and that moves on its own through W ∝ Q^⅓.
      //
      // The old note read "~4 % flow against ~5 % decay heat a few minutes post-trip …
      // a loop split of ~41 °C (74 °F), larger than the 33 °C (59 °F) rated split". That
      // anchor was measured against the pre-#364 curve and was ~1.7x high: the sourced curve
      // puts a few minutes post-trip at ~3 % of rated, not 5 %. Re-derived on the same two
      // relations at Q = 0.03: W = (C²·delta_T_rated·Q)^⅓ = **3.4 %** of rated flow, and
      // ΔT = delta_T_rated·Q/W = **29 °C (53 °F)**. Note the split is now slightly BELOW the
      // rated 33 °C rather than above it — flow falls as the cube root of heat, so it does not
      // fall as far as the heat does, and the old "must be larger" reasoning only held while
      // the decay heat was overstated. TR-15 leg A's 1–8 % band still contains it.
      natural_circ_coeff: 6.228e-3,   // C in W = C·√ΔT  [tune] — see the fit above
      natural_circ_max: 0.08,         // hard cap, frac of rated. WTSM: "not for power operation" [tune]
      // VOID CUTOFF. Natural circulation needs a CONTINUOUS LIQUID PATH; once the loop
      // voids the driving column is gone and flow stops — which is why tripping the pumps
      // into a voided loop at TMI-2 did not establish it. Ramps to zero across this void
      // fraction rather than switching, so a partially-voided loop circulates weakly.
      // NOT a second heat-sink gate: losing the SG raises Tavg, boils the core and voids
      // the loop, so the sink dependence WTSM names arrives through this one term.
      natural_circ_void_cutoff: 0.25, // primary void fraction at which circulation is lost [tune]
      // Threshold for CLAIMING natural circulation is established (frac of rated), same
      // idiom as `cavitation_indicate_frac` above. It is not zero because
      // `primary_void_fraction` is a threshold function of subcooling and CHATTERS as the
      // bulk crosses saturation — measured, a fully-voided loop still leaks ~0.03 % through
      // the 8 s coastdown τ between flickers. The weakest real circulation this plant can
      // make is ~1.9 % (a fully decayed core), so 1 % excludes the residue without ever
      // suppressing the real thing.
      natural_circ_indicate_frac: 0.01,   // [tune]
      low_flow_trip: 0.25,         // true-flow trip (documented HR1 exception)
      // NUMERICAL GUARD, NOT A PHYSICAL CEILING — and it must stay UNREACHABLE (#361).
      //
      // It has never been derived from anything, and it should not be: there is no vessel
      // volume at which an RCS stops accepting mass, only a pressure at which the relief path
      // opens. 1.2 is simply far enough above the physical settling point to be out of the way.
      // THAT point IS derived, by the level geometry: the plant is solid where the level line
      // reaches 100, i.e. m = 1 + (100 − base(Tavg))/level_per_mass_surplus, which on a quenched
      // large break (base at the 28 % floor) is 1 + 72/776 = **1.0928**. MEASURED 109.3 % against
      // 109.28 % predicted, ~10.7 points clear of this clip.
      //
      // WHEN IT IS REACHED, IT IS A BUG BY DEFINITION, and it hides itself: `stepInventory`
      // clips `m_surge` here too, so `_dmass_dt` goes to zero at the ceiling and the surge
      // driver stops seeing the very mass that is piling up (#346's defect, and #361 walked
      // back into it from the other side — a liquid break double-counted through
      // `K_leak_depressurize` held pressure 2000 psi below the relief ladder, so injection
      // never terminated and inventory reached 120.00 % at 21 min and pinned).
      // RAISING IT IS NOT A FIX AND WAS MEASURED: at 3.0 the plant runs to 300 % inventory with
      // pressure still parked in the PORV band (#346). CA-12 leg C asserts the peak stays below
      // 119.0 for exactly this reason — the ceiling must never be the thing that stops the fill.
      mass_max: 1.2,               // clip ceiling for primary_mass — see above; keep unreachable
      // ------------------------------------------------- BREAK DISCHARGE (#334 item 2, 2026-08-04)
      // A LOCA break used to flow at a CONSTANT rate, set once when the failure was
      // injected and never varying — so the same break discharged identically at 2235 psi
      // and at 14.5 psi, and an RCS already at zero mass went on "leaking" at full rate
      // forever. Only the SGTR path was ΔP-modulated (`sgtr_dp_ref`, below in
      // pwr_primary.stepInventory); the comment there said in as many words that
      // "containment-side leaks stay static", which is the defect written down.
      //
      // SOURCED SHAPE: 10 CFR 50 Appendix K, I.C.1.b "Discharge Model" — "For all times
      // after the discharging fluid has been calculated to be two-phase in composition, the
      // discharge rate shall be calculated by use of the Moody model (F.J. Moody, 'Maximum
      // Flow Rate of a Single Component, Two-Phase Mixture' … 1965). The calculation shall
      // be conducted with at least three values of a DISCHARGE COEFFICIENT APPLIED TO THE
      // POSTULATED BREAK AREA, these values spanning the range from 0.6 to 1.0."
      // Two things follow, and both are what this change implements: the break is an AREA
      // with a coefficient, not a flow, and its discharge is a CRITICAL-FLOW function of the
      // upstream fluid state — never a constant.
      //
      // DECLARED SIMPLIFICATION: this is the incompressible ORIFICE law, W ∝ √Δp, not Moody.
      // Moody's critical mass flux is a function of stagnation pressure AND enthalpy, and
      // this plant has one lumped primary node with no quality tracked at the break, so
      // there is nothing to evaluate it against. √Δp is the same form `letdownFlow` already
      // uses a few hundred lines up for orifice discharge out of the same RCS, it is
      // derivable rather than fitted, and it has the right monotonic shape. It falls off
      // FASTER than Moody does in the two-phase regime, so a real break stays stronger
      // longer than this one — stated in Manuals/12 rather than left for someone to find.
      //
      // `break_p_ref_mpa` is the pressure at which a break's configured size EQUALS its old
      // constant rate, so every existing severity keeps its calibration at nominal and only
      // the depressurized end of the curve moves. It is the operating point, not a [tune].
      break_p_ref_mpa: 15.41,      // RCS pressure at which break size == its rated flow
      break_backpressure_mpa: 0.1, // containment (atmospheric); flow stops when the RCS reaches it
      sgtr_dp_ref: 9.8,            // MPa — SGTR dP normalization; folded into config by #408 (was a || 9.8 fallback in 3 files)
      // Discharge COMPOSITION (#408 wave 1, two-regime — see pwr_primary.stepInventory
      // for the full rationale): the mass ledger discharges
      //   leak_flow × (bsf + (1−bsf)·max(entrain, spill))
      // entrain = clip(Δp/break_entrain_ref_mpa) — blowdown entrainment carries liquid
      // while Δp lasts; spill = clip((mass−lo)/(hi−lo)) — after Δp collapses the
      // cold-leg nozzle ELEVATION rules, and it sits above the core top, so the spill
      // band is the long-term injection≈spillage equilibrium with the core COVERED.
      // Steam mass flux ~an order under liquid's (UNVERIFIED recall, Moody-class);
      // band placement is elevation-derived (nozzle above core top — recall, declare).
      // The pressure/venting half keeps the full open-area flow. All [tune], solved
      // against the sourced DEG arc (WCAP-16009 §12-4-3 / Ginna T15.6-15).
      break_steam_mass_frac: 0.05,
      break_entrain_ref_mpa: 4.0,  // Δp above which discharge is fully liquid/two-phase — at 2.0 the (Δp/ref)² tail at mid-Δp still balanced the whole real-scale ECCS and parked sev 0.1-0.4 breaks partially uncovered forever (measured); 4.0 lets the mid-family refill while the DEG blowdown (Δp 4-15 MPa) still drains full-bore [tune]
      break_spill_lo: 0.72,        // inventory frac — below: break passes steam only. SITS ABOVE core_top_uncover 0.70: the cold-leg nozzle is above the core top, so the spill equilibrium leaves the core COVERED (#408) [tune]
      break_spill_hi: 0.85,        // inventory frac — above: full liquid spill [tune]
      break_entrain_floor: 0.55,   // inventory frac at which entrained liquid carry-off dies entirely — standing mid-dP entrainment below the break elevation is not physical (#408; measured: without it sev 0.1 parks at 40 % forever) [tune]
      // Loop pressure distribution (pwr_primary.computeNodePressures). The primary
      // is incompressible liquid except for the pressurizer bubble, so there is ONE
      // dynamic pressure state (pressure_mpa, the pressurizer/hot-leg reference) plus
      // a QUASI-STATIC ΔP field set by pump head vs. friction. Both offsets scale
      // with flow_frac² (form loss) and collapse to zero when the RCPs coast down:
      //   p_hotleg      = pressure_mpa                             (surge line taps here)
      //   p_pumpsuction = pressure_mpa − loop_dp_sg_rated·ff²      (between SG and RCP — lowest)
      //   p_coldleg     = pressure_mpa + loop_dp_core_rated·ff²    (RCP→RX pump discharge — highest)
      // Implied pump head at rated = loop_dp_core_rated + loop_dp_sg_rated ≈ 0.55 MPa
      // (~80 psi, a 4-loop RCP). ECCS/accumulators/letdown inject/draw at the cold
      // leg; RCP cavitation keys off the suction node. [tune]
      loop_dp_core_rated: 0.30,    // MPa — cold leg (pump discharge) above hot leg at rated flow
      loop_dp_sg_rated: 0.25,      // MPa — pump suction below hot leg at rated flow
      // RCP cavitation (pwr_primary.stepCavitation). Keys off the SUCTION-node
      // subcooling margin Tsat(p_pumpsuction) − tcold — the lowest-pressure node, so
      // it saturates first as the loop voids/depressurizes (the TMI-2 mechanism: the
      // pumps "objected" with loud cavitation as the RCS went two-phase). Distinct from
      // the bulk subcooling_margin instrument (the flagship deception signal). Severity
      // ramps 0→1 as the suction margin falls from onset to onset−band; a running RCP
      // then loses up to cavitation_flow_loss of its delivered flow (a real mechanical
      // effect, not just an indication). Only a RUNNING pump cavitates. [tune]
      cavitation_onset_c: 8.0,     // suction subcooling (°C) at which cavitation begins
      cavitation_band_c: 8.0,      // ...ramping to full cavitation over this many °C more
      cavitation_flow_loss: 0.7,   // fraction of delivered flow lost at full cavitation
      cavitation_indicate_frac: 0.05, // severity above which the cavitation status/alarm annunciates
    },

    // ------------------------------------------------- steam generator / second
    steam_generator: {
      // Heat that makes one unit of steam. The SG normalizes on NSSS RATED HEAT —
      // this × (1 + thermal.pump_heat_frac), i.e. rated core heat PLUS full-flow RCP
      // pump heat — so steam_generation_rate is 1.0 at 100 % core power with all pumps
      // running, and rated steam flow is the flow that heat actually makes (#251).
      // Do not read this constant alone as "the rated heat": the pump-heat factor is
      // applied at the use site, pwr_steam_generator stepSecondary. [tune]
      latent_heat_secondary: 19.45,
      // FEEDWATER ENTHALPY SPLIT (#372, audit #297 F4). The 19.45 above is the heat
      // that makes one unit of steam FROM FEED AS DELIVERED — physically it was
      // always sensible + latent, and until #372 the model spent all of it as
      // latent, so feed TEMPERATURE could not matter and overfeeding produced zero
      // thermal response (measured: digit-identical to 4 s.f. at +15 %). The split
      // keeps 19.45 and its calibration exactly (the use site is algebraically
      // identical at the rated point) and only distributes it:
      //   at 819.5 psi (5.65 MPa), Tsat ≈ 271.5 °C: h_f ≈ 1193 kJ/kg,
      //   h_fg ≈ 1597 kJ/kg; feed at 224 °C ≈ 963 kJ/kg
      //   → sensible 230 of 1813 kJ/kg total = 0.127.
      // feedwater_temp_c is the FINAL feed temperature after the (unmodelled)
      // regenerative heater train — SOURCED as a band since #418 wave A1
      // (2026-08-07): Ginna UFSAR Table 15.0-3 gives final feedwater temperature
      // "390 to 435 °F" (also T15.6-12 and the SG performance cases at :463-481).
      // 224 °C = 435.2 °F, the top of the band — the prior 227 °C (440.6 °F) sat
      // ABOVE the sourced ceiling. The old UNVERIFIED flag closes; the split
      // fraction re-derives with it (0.119 → 0.127) so the rated-point identity
      // is preserved by the same construction as before (TR-1e leg D pins it).
      // afw_temp_c IS sourced as a band: AFW
      // design feedwater temperature 40–120 °F (WTSM §5.7, ML11223A229, system
      // design data) — 104 °F (40 °C) chosen inside it, matching the constant the
      // physics already injects ECCS/RWST water at. Cold AFW therefore removes
      // real heat now: at decay-heat power the sensible demand of full AFW flow
      // exceeds the heat crossing the tubes, steam generation clamps at zero, and
      // the SG depressurizes — which is what "AFW is a heat sink" means.
      feed_sensible_frac: 0.127,   // of latent_heat_secondary, at the rated point [tune]
      feedwater_temp_c: 224,       // °C final feed = 435 °F, top of Ginna's sourced 390–435 °F band
      afw_temp_c: 40,              // °C — inside the sourced 40–120 °F design band (WTSM §5.7)
      // K_sg_level FITTED TO A REAL LOSS-OF-FEEDWATER TRANSIENT (#135), 5.0 -> 1.37.
      //
      // The level integrates the feed/steam imbalance: d(level)/dt = K_sg_level x
      // (feedwater_flow - steam_out), both normalized to rated. So with feed lost and steam
      // at rated, K IS the drain rate in %/s -- and at 5.0 the entire narrow range held
      // TWENTY SECONDS of full-power steaming. Measured full-stack: true level 64.5 % ->
      // 3.1 % in 13 s, lo-lo reactor trip 12.9 s after the failure.
      //
      // SOURCE -- Ginna UFSAR Chapter 15, Table 15.2-4, "TIME SEQUENCE OF EVENTS FOR LOSS OF
      // NORMAL FEEDWATER FLOW" (NRC ADAMS ML20339A101, Rev 29 11/2020, p.102 of 276):
      //     Main feedwater flow stops                            20 s
      //     Low-low steam generator water level trip setpoint     55 s
      //     Rod motion begins and turbine tripped                 57 s
      // i.e. 35 s from feed loss to the lo-lo trip. The sim was ~2.7x too fast.
      //
      // THE FIT: this plant runs 65 % nominal and trips at 17 %, so 48 points of span must
      // take 35 s -> 48/35 = 1.371 %/s. Measured after: trip at 40.5 s (the extra ~5 s is
      // this sim's 8 s feed-pump coastdown, where the analysis stops flow instantly).
      // What is fitted is the TIME, not the geometry -- Ginna's narrow-range span and level
      // program are its own, and no claim is made that they match this single-loop plant.
      //
      // CONTROL GOT BETTER, NOT WORSE -- measured, full stack, before/after: steady-state
      // hold over 30 min 2.35 -> 2.11 points of band; a 100 -> 80 MWe ramp swings 9.8 -> 5.4
      // points and settles 64.38 -> 65.12 against a 65 nominal. Lower level-per-imbalance
      // gain means less level swing for the same flow mismatch, so the feed controller did
      // NOT need retuning.
      //
      // What this does NOT buy is a savable transient: clearing the failure the instant the
      // alarm comes in still trips, at 40.6 s. That is correct -- a real loss of normal
      // feedwater DOES trip the reactor on lo-lo level (it is the credited trip in the Ginna
      // analysis above). The window is for reading the board, not for preventing the trip.
      // THE LEVEL GAIN RETIRED INTO A MASS LEDGER (#418 wave A2, 2026-08-07).
      // K_sg_level 1.37 %/s is not a constant any more — it is the middle SEGMENT of the
      // level-geometry map below, preserved exactly. What forced the ledger: the two Ginna
      // anchors cannot share one linear gain. The 35-s trip EVENT above fits 48 narrow
      // points in 35 s (1.371 %/s — the #135 fit), but Ginna's SG carries 85,359 lbm
      // nominal (UFSAR T15.6-1) against ~3.95e6 lb/hr rated steaming = ~78 s to FULL
      // boil-dry — and the old single gain implied ~162 s. Both are same-document Ginna;
      // the reconciliation is GEOMETRY (level per unit mass is not constant over the
      // vessel — the narrow-range band lives where level moves fastest per pound), which
      // is what the piecewise map encodes.
      //
      // THE LEDGER: sg_mass_frac integrates (feed − steam_out)/sg_mass_boil_tau_s —
      // 1.0 = the nominal secondary mass (12,785 kg = 85,359 lbm × the 0.3302 per-MWt
      // scale), and tau 77.5 s [derived] is that mass over rated steam flow (165.3 kg/s).
      // Level DERIVES from mass through sg_mass_map: [m, wide-%] knots, piecewise linear,
      // monotone, invertible. THE DESIGN RULE: the calibrated level slope holds across the
      // ENTIRE narrow window (wide 30–75), not just below nominal — the first cut anchored
      // only the drain side and the overfill leg (narrow 65→100) ran 1.7× slow, which
      // parked pwr_sg_flood's 75 % watch (measured, 2026-08-07). Constant in-window slope
      // 47.83 wide-%/m ÷ 77.5 s ÷ 0.45 window = 1.371 narrow-%/s — the retired K to three
      // decimals, BOTH directions. Knots:
      //   (0, 0)          dry vessel
      //   (0.38845, 30)   narrow-window BOTTOM (narrow 0). From nominal at unit drain the
      //                   window bottom arrives at (1 − 0.38845)×77.5 = 47.4 s — the same
      //                   dryout-onset the old gain gave, preserved exactly; the sub-window
      //                   region below is where the ledger runs FASTER than the old linear
      //                   gain (total boil-dry 77.5 s vs the old implied ~162)
      //   (0.5484, 37.65) the lo-lo trip point (narrow 17) — collinear with its neighbors
      //                   by construction; kept as the documented #135 anchor: the 65→17
      //                   narrow drain spends 0.4516 of nominal mass in the Ginna 35 s
      //   (1.0, 59.25)    nominal: narrow 65 at the sg_level_nominal operating point
      //   (1.32929, 75)   narrow-window TOP (narrow 100) — same slope up: the overfill
      //                   probes (75 % @ ~63 s, 96 % @ ~132 s) hold
      //   (2.45, 100)     flood-solid: total shell volume over nominal liquid volume
      //                   (Ginna 4,512.7 ft³ shell — the same volume the K_steam_pressure
      //                   derivation uses; one sourced geometry, two clocks)
      sg_mass_boil_tau_s: 77.5,     // s — nominal mass / rated steam flow [derived — see above]
      sg_mass_map: [[0, 0], [0.38845, 30], [0.5484, 37.65], [1.0, 59.25], [1.32929, 75], [2.45, 100]],
      // K_steam_pressure DERIVED FROM THE PLANT'S OWN STEAM-SPACE PHYSICS (#418 wave A1,
      // 2026-08-07), 2.0 -> 0.30. The old 2.0 was fitted with no mass basis, and it made a
      // bottled SG at full generation rise 223 psi in the FIRST SECOND (measured, full
      // stack) — Ginna UFSAR Table 15.2-1's bounding total-loss-of-load lifts the MSSVs at
      // 7.0–9.4 s over ~755→1085 psia, i.e. 35–47 psi/s at sustained full power. The
      // secondary's pressure clock was ~5–6× compressed; #408 removed exactly this class of
      // clock from the primary.
      //
      // THE DERIVATION (Ginna anchor, per-MWt scale s = 300/908.5 = 0.3302 — one Ginna SG
      // carries 1817/2 MWt):
      //   SG secondary liquid mass  85,359 lbm/SG nominal (UFSAR Table 15.6-1, the Nominal
      //     column; the 94,000/70,000 columns are declared conservatisms) × s = 12,785 kg.
      //   Shell volume 4,512.7 ft³ (UFSAR §15.6.3) − liquid ⇒ steam space ~2,700 ft³ × s
      //     = 25.2 m³.
      //   Rated steam flow from the energy balance: 301.65 MW / (h_g − h_feed) = 165.3 kg/s
      //     (cross-checks the per-MWt scaling of Ginna's 3.7–3.95e6 lb/hr per SG).
      //   Pressurizing a BOTTLED SG forces the whole saturated liquid up the Tsat line, so
      //   the capacitance is NOT the dome alone. Per MPa at 5.65 MPa (Tsat 271.6 °C,
      //   dTsat/dP ≈ 11.7 °C/MPa, dρg/dP ≈ 5.47 kg/m³·MPa, h_fg ≈ 1600 kJ/kg):
      //     liquid sensible   12,785 kg × 5.2 kJ/kg·K × 11.7 K  ≈ 778 MJ
      //     boil-up (densify) 25.2 m³ × 5.47 kg/m³ × 1600 kJ/kg ≈ 221 MJ
      //     dome vapor heating                                  ≈  26 MJ
      //     C_P ≈ 1,025 MJ/MPa  (tube/shell METAL excluded — declared; including a scaled
      //     ~45 t of steel gives ~1,290 ⇒ K 0.23. Band 0.23–0.33; the WTSM §5.1 fetch
      //     arbitrates. Dome-only C_P gives K = 1.19, REJECTED: predicts a 3.1-s pop,
      //     outside the Ginna class — the liquid's thermal inertia IS the pressure clock.)
      //   K = Q_NSSS,rated / C_P = 301.65 MW / 1,025 MJ/MPa = 0.294 → 0.30.
      //
      // PREDICTED AND THEN MEASURED: bottled first second +43 psi (inside 35–47); sustained
      // full generation reaches the Psat(Tavg) cap (9.08 MPa at rated Tavg — NOTE the cap
      // binds BELOW the 9.31 pop) at ~11.6 s and rides primary heatup to the pop at ~14 s.
      // The RATE is the sourced claim; the extra time over Ginna's 7.0–9.4 s is this
      // plant's RULED ladder span (3.66 MPa from operating to pop, vs Ginna's 2.28) — the
      // ladder is identity (2026-08-07 ruling) and does not move with the clock.
      K_steam_pressure: 0.30,      // MPa/s per unit net normalized flow [derived — see above]
      steam_p_rated: 5.69,         // MPa = Ginna's 810 psig full-load SG outlet at 576 °F Tavg (UFSAR ch 10 §10.3.2.2) — was 5.65 [tune], moved 0.6 % onto the citation at #419 wave 3 [sourced]
      steam_flow_rated: 1.0,       // rated steam flow, in those normalized units [tune]
      sg_level_nominal: 65.0,      // % at hot_full_power
      // Wide-range level window: the whole-vessel wide range is the integrated inventory
      // (clamped only at the physical vessel bounds 0/100); the NARROW working range is the
      // sg_wr_lo..sg_wr_hi sub-band of it, mapped to narrow 0–100 %. So when the narrow gauge
      // pegs (overfill/dryout) the wide range keeps reading. The board SG component mirrors
      // this window (comp_steam_generator.js SG_WR_LO/HI) to place its narrow gauge.
      sg_wr_lo: 30.0, sg_wr_hi: 75.0,
      feed_pump_tau: 8.0,          // s — feed-pump speed→flow inertia (set_feed_pump_speed) [tune]
      // SG code safety valves — upstream of the MSIV, above the steam dump's
      // steam_dump_setpoint anchor: the backstop when the SG is bottled (MSIV
      // shut). Self-actuating on TRUE pressure in the engine since #369 — the
      // pop is not an instrument decision and cannot be failed from the
      // Failures tab, which is the point. [tune]
      //
      // PROVENANCE (#374 evidence pass, 2026-08-05): the FUNCTION is sourced —
      // the dump is sized so it *"avoids the lifting of steam generator safety
      // valves following a turbine trip and reactor trip from 100% power"*
      // (WTSM §11.2, ML11223A294) — re-measured on the Ginna ladder at #419 wave 3.
      //
      // THE LADDER IS GINNA'S OWN SINCE #419 WAVE 3 (2026-08-07, the tier-3 stage-1
      // sign-off — the option-C re-anchor the tier-2 ruling had deferred). Every rung
      // is sourced or rule-derived, which RETIRES the old "the ladder itself is not
      // sourced" departure (DESIGN_COMPANION §8.34): pop = **1085 psig (7.58 MPa)**,
      // Ginna's first-lift MSSV (UFSAR ch 10 §10.3.2.4: "The first valve lifts at 1085
      // psig and the remaining three valves are set to lift at 1140 psig"); this
      // single-valve model keeps the sourced BANK capacity (0.84× rated, below) at the
      // first-lift setpoint — the modeling choice, stated. Reseat = **1048 psig
      // (7.33 MPa)** [derived — the pre-existing 3.3 % blowdown class retained].
      // History: the pre-#419 ladder ran 1194/1272/1350 psi, every rung ~110 psi high,
      // tied to the retired 297 °C feel anchor.
      sg_safety_open_mpa: 7.58,    // pop = Ginna 1085 psig first-lift [sourced — see above]
      sg_safety_reseat_mpa: 7.33,  // reseat [derived — 3.3 % blowdown class]
      // CAPACITY SOURCED (#418 wave A3, 2026-08-07), 1.2 → 0.84: Ginna's MSSV
      // bank is 4 valves/SG at 1085 + 3×1140 psig passing 797,700 + 3×837,600
      // lbm/hr = 3.31e6 lbm/hr per SG (UFSAR Table 15.6-12) against ~3.95e6
      // lb/hr rated steam flow = 0.84× rated — corroborated by ch. 10 §10.3.2.4
      // ("minimum total relieving capacity 6.58e6 lbm/hr" for both SGs). The
      // 4-loop WTSM plant runs 1.09× (20 valves, 16.47e6 lbm/hr, "109% of
      // full-power steam flow", §7.1) — the anchor plant's ratio is the method's
      // choice. Capacity below full generation is safe HERE because generation
      // dies at the Psat(Tavg) cap (the bottled SG cannot out-boil the primary
      // that heats it); what changes is duty shape — fewer, longer lifts on the
      // slower re-climb (TR-1h/TR-17 re-measured with the A-wave clock).
      sg_safety_flow_max: 0.84,    // × rated steam flow at full lift [sourced — see above]
      // ---- ATMOSPHERIC DUMP VALVES (ADV) — #371, audit #297 F3 -------------
      // The condenser-independent steam path. Until #371 the ONLY controllable
      // secondary heat sink was dump-to-condenser, so losing the condenser left
      // no cooldown path at all: measured, four plant-hours flat at 304–305 °C
      // with the safeties chattering and RHR entry unreachable. ADVs are
      // UPSTREAM of the MSIV, like the code safeties, and OUTSIDE the C-9
      // condenser-available interlock — which is the one thing here the corpus
      // does source, since WTSM §11.2 (ML11223A294) puts the condenser dump
      // squarely behind that interlock and calls the whole system *"not
      // required for the safe shutdown of the reactor"*, i.e. something else
      // does the safety-grade job.
      //
      // NOW SOURCED — WTSM §7.1 *Main and Auxiliary Steam Systems* (ML11223A244)
      // §7.1.3.3, fetched 2026-08-06. This block used to say "EXISTENCE, PURPOSE,
      // CAPACITY AND SETPOINT ARE ALL UNVERIFIED. **No document in any lane's
      // corpus contains 'atmospheric' in a steam-relief sense**". That was FALSE
      // WHEN WRITTEN: ML11223A293 (WTSM §11.1) had been sitting in the develop
      // lane's inbox since 2026-08-04 naming "the steam generator atmospheric
      // relief valve", and §7.1 carries a whole subsection on it. The corpus is
      // three lanes and nobody greps all three — see tools/find_source.js.
      //
      // The document settles the NAME first, and it is the answer to "why is this
      // not a PORV": *"The PORV (also called an atmospheric relief valve or
      // atmospheric dump valve) in each steam line is a 6-in. air-operated,
      // spring-opposed globe valve"*. It IS a PORV — one valve, three names.
      //
      // adv_max 0.10 — SOURCED, and it lands exactly where the sizing exercise
      // put it: *"capable of relieving approximately 10% of the rated steam flow
      // at no-load pressure from each steam generator (2.5% of the total steam
      // system flow)"*. The parenthetical is a FOUR-LOOP plant; this plant models
      // ONE generator, so the per-SG figure — 10 % — is the one that maps, not
      // the 2.5 %. Independently sized here against two duties and both still
      // hold: it clears the decay-heat hold 6.9× at an hour (#364 refit), and it
      // reaches the RHR block-open permissive (2.76 MPa, Tavg ≈ 193 °C) on a
      // timescale where the ~55 °C/hr technical-specification cooldown limit is
      // achievable AND exceedable — full open runs −352 °C/hr, 6.4× the limit.
      // That second half is the point: #375 gave the board a cooldown-rate meter
      // and ±100 °F/hr annunciators, and a valve that cannot exceed the limit
      // turns holding it into a formality rather than a skill.
      //
      // adv_setpoint 7.31 (#419 wave 3) — the PLACEMENT RULE is sourced, the number is
      // this plant's arithmetic on it: *"Each PORV has a nominal setpoint of 1125
      // psig, which is approximately half the difference between the no-load
      // steam generator pressure and the lowest set pressure of the safety
      // valves."* (WTSM §7.1.3.3 — that section's own 1125 psig is the 4-loop
      // plant's number; the RULE is what transfers.) On the Ginna ladder that is
      // (7.03 no-load anchor + 7.58 pop) / 2 = 7.305 ≈ **7.31 MPa (1060 psi ≈
      // 1045 psig)** — and Ginna's own ARV solenoid band, 1005–1060 psig (UFSAR
      // ch 10 §10.3.2.5/T10.1-1), brackets it: rule and anchor plant agree.
      // adv_band 0.25 → **0.12** [derived]: full-open must sit below the pop with
      // proportional margin on the 2.3×-narrower Ginna span — 7.31 + 0.12 = 7.43,
      // 0.15 MPa under the 7.58 pop (the old 0.25 band would have put full-open
      // 0.02 under it). History: 8.60 → 8.77 (2026-08-06, onto the rule) →
      // 7.31 (the ladder re-anchor). The old "the ladder itself is not sourced"
      // paragraph that lived here is RETIRED — every rung is now sourced or
      // rule-derived (see sg_safety_open_mpa). [tune]
      adv_setpoint: 7.31, adv_band: 0.12, adv_max: 0.10,
      // AFW capacity vs the real plant, worked (#374 evidence pass): the real
      // system is three pumps — two motor-driven at 440 gpm, one turbine-driven
      // at 880 gpm (WTSM §5.7, ML11223A229, §5.7.3.1–.2) — and §19.0
      // (ML11223A342) anchors one motor-driven pump at *"only about two percent
      // of rated feed flow"*, so the full real lineup works out to ≈8 % of
      // rated feed. Ours is 15 %: UNVERIFIED, a stated scaling choice rather
      // than a citation — one lumped SG must out-run its own boil-off for the
      // TR-2 recoverable ride-out, where the real figure splits across four
      // generators. Its upper bound is honest since #375 (steam generation is
      // energy- and pressure-limited, not a free boil). [tune]
      afw_flow_frac: 0.15,         // AFW capacity, normalized to rated feed [tune]
      // Auto-start CONDITION sourced — SG lo-lo level is condition 1 of the real
      // five (WTSM §5.7, ML11223A229; full list quoted at the pwr_control lo-lo
      // trip), and since #380 (2026-08-08) the actuation sits on the SAME signal
      // and setpoint as the reactor trip — the single-signal real design. The
      // setpoint is control-layer data (pwr_control PWR_ACTUATIONS); a duplicate
      // `afw_start_level` lived here until #380 with ZERO readers, and a dead
      // constant that can silently disagree with the live one is worse than none.
      // AFW LATCHES (owner ruling, #207): the pump demand set by the M4 actuation has no
      // reset, so it stands until the operator secures it — as in a real plant, where AFW
      // auto-starts on low level and runs until someone stops it.
      //
      // The hold target was 20 with the same 8 % band, i.e. full flow below 20 tapering to
      // zero at 28 — a control band lying ENTIRELY inside the amber caution zone (17–30 %).
      // So an AFW-only generator parked at 25.1 % with SG LVL LO standing indefinitely: the
      // plant was latched into a permanent alarm by design. Now 32/8 — full flow below 32,
      // zero at 40 — which settles at 37.1 % against decay-heat steam draw: comfortably
      // GREEN, 7 points clear of the 30 % boundary so transients do not dip back into amber,
      // and far below the 75 % HI caution. Measured on a scram + feedwater isolation held
      // 2 h; note the approach is slow (AFW is only 0.15 of rated), so a short probe window
      // will catch it still climbing. [tune]
      afw_level_target: 32.0,      // % — built-in proportional level hold: full flow below this... [tune]
      afw_level_band: 8.0,         // % — ...tapering to zero across this band above it [tune]
      // AFW pump discharge-pressure indication (MPa). A motor/turbine-driven AFW pump
      // develops head above the SG it feeds; deadheaded (discharge valve shut) it sits
      // at shutoff head. 0 when the pumps are not demanded. [tune]
      afw_shutoff_mpa: 10.34,      // ≈ 1500 psi pump shutoff head
      afw_discharge_margin_mpa: 1.0, // head above SG pressure while delivering
      // B2 steam dump / turbine bypass (auto opens above setpoint, to condenser).
      // The setpoint is the NO-LOAD secondary pressure, and it is the BOTTOM ANCHOR
      // of the sliding Tavg program (catalog v3 FG-2): Tsat(setpoint) = the no-load
      // Tavg. THE ANCHOR IS GINNA'S OWN SINCE #419 WAVE 3 (2026-08-07): no-load SG
      // pressure **1005 psig = 7.03 MPa** [sourced — Ginna TS Bases Rev 101 B 3.3.2:
      // "steam line breaks occurring from no load conditions (1005 psig)"], and
      // Tsat(7.03) through this plant's own correlation = **546.9 °F (286.0 °C)** —
      // Ginna's sourced no-load Tavg 547 °F (UFSAR ch 10 §10.3.1) to 0.1 °F: pressure
      // and temperature anchors agree through the sim's own physics. The program is
      // now STEEP (286.0 no-load → ~304.5 full power, ~33 °F span vs Ginna's real 29;
      // the 4 °F top gap is the fixed Q/h_sg identity, declared not chased). History:
      // Psat(297 °C) ≈ 8.23 was the 2026-07-21 feel-plan anchor, retired by the
      // tier-3 sign-off; its shallow ~7 °C program went with it. With no steam draw the
      // secondary saturates up to the setpoint and the dump holds it there, so hot
      // standby holds its own temperature. On a turbine trip the pressure rise above
      // the setpoint opens the dump proportionally across the band. The program top
      // is the full-power coolant equilibrium; _buildState interpolates linearly in
      // load and DERIVES each state's secondary pressure to be a true steady state.
      // steam_dump_max 0.40 — THE PROTOTYPICAL CAPACITY *(OWNER RULING, 2026-07-31:
      // "Let's change it to 40%.")*. Was 1.05 from 2026-07-21 (feel-plan P4) until #220's
      // evidence pass sourced the real number and the coherence problem behind it.
      //
      // *"The capacity of the steam dump system depends on the individual plant's load
      // rejection capability. In most Westinghouse units the capacity of the steam dump
      // system is 40%."* (NRC Westinghouse Technology Systems Manual §11.2, ML11223A294).
      // It is sized for a **50 % loss of load** — 40 % dump plus a 10 % step from rod
      // control (STPEGS UFSAR §10.4.4, ML22140A078) — and to keep the SG safety valves
      // seated on a trip from 100 %.
      //
      // MEASURED on this plant at 0.40, which is why 0.40 and not something between:
      //   · 50 % loss of load  → no trip, no relief lift; the dump SATURATES at 40 % and
      //     the core self-throttles to 89.3 % — a 10.7 % step. That is the documented
      //     40 %+10 % split reproduced, by MTC here rather than by rod control.
      //   · turbine trip @100 % → indistinguishable from 1.05 (P-9 scrams at +0.5 s and
      //     decay heat is ~6 %, so the cap is never approached). SG pressure peaks at
      //     8.08 MPa, well under the 9.31 safety — the real design intent, met.
      //   · full 100 % rejection → still NO scram (FG-4 ride-out intact), but Tavg
      //     reaches 321.2 °C and the ladder runs: dump saturates, core runs back to
      //     46.3 %, PORV lifts at 16.37, SG safeties graze 9.32. A real Westinghouse
      //     plant does not ride a full rejection either — it is beyond the 50 % design
      //     case — so the noise is prototypical, not a defect.
      //
      // WHY IT MATTERS BEYOND THE NUMBER: at 105 % the P-9 reactor trip's own premise was
      // false here — *"Above the P-9 setpoint, a turbine trip will cause a load rejection
      // beyond the capacity of the Steam Dump System"* (NUREG-1431 Rev 4 Bases, Function
      // 16, ML12100A228) — so the interlock was something the student had to be TOLD.
      // At 40 % it is demonstrable. The dump is also a finite resource again: it can be
      // driven to its stop, which is where the division of labour between dump and
      // reactor becomes visible. Both are the teaching goal, not a tuning preference.
      //
      // Still unavailable when the condenser is lost (vacuum/SBO) — see the C-9 note in
      // pwr_steam_generator.js. The stored-heat burst still swings Tavg visibly before
      // settling (tempo principle), and rather more so now.
      // steam_dump_max 0.40 → 0.28 at #419 wave 3 *(OWNER RULING, 2026-08-07: "D1: measure
      // first." — adopt Ginna's 28 % if the full-load-rejection ride-out survives at it, else
      // keep the ruled 40 %)*. MEASURED: the ride-out SURVIVES at 28 % — no scram, the dump
      // pegs at its cap and the core self-throttles deeper (~80 % vs ~91 at the cap instant).
      // Sourced: *"eight steam dump valves that are capable of passing up to approximately
      // 28% rated steam flow"*, and the same 50 % load-rejection claim "in conjunction with
      // the rod control system" (Ginna UFSAR ch 10 §10.4, ML20339A040). This supersedes the
      // 2026-07-31 "Let's change it to 40%" ruling by the owner's own D1 decision rule; the
      // WTSM §11.2 40 % remains the fleet-typical figure, recorded above. Costs measured and
      // re-derived at this wave: the §8.21-class cliff span narrows (~7 → ~4 °C) and TR-1k's
      // non-monotonicity margin shrinks — the honest Ginna-class plant, bands re-derived.
      steam_dump_setpoint: 7.03, steam_dump_band: 0.25, steam_dump_max: 0.28, // 7.03 [sourced] = Ginna 1005 psig no-load; 0.28 [sourced] = Ginna ch 10 (D1 measured)
      // LOAD-REJECTION arm for the fast-open (Tavg-error) dump mode — the C-7 class
      // interlock. The fast mode used to arm on `turbine_tripped` ALONE, even though its
      // own comment said it was for "a turbine trip / load rejection" and that the
      // pressure-only wait "spiked the primary on every load rejection". A rejection
      // where the turbine stays on line therefore never got it.
      //
      // It arms on `load_rejected_mwe` (load_mode.js), NOT on the power/load mismatch —
      // an earlier cut armed on the mismatch and, because the mismatch is equally
      // positive when the operator deliberately RAISES power, it opened the dump into a
      // dilution and tripped pwr_boron. (This comment described that abandoned design
      // until #219; it is corrected here.)
      //
      // WHAT THE NUMBER MEANS. `load_rejected_mwe` is a washout (high-pass) of the load
      // target with a 60 s reference, so this threshold is really a RATE threshold, and
      // the pair (40 MWe, 60 s) encodes two specs at once:
      //   * a STEP drop must exceed  40 MWe  (40 % of rated) to arm;
      //   * a RAMP down must exceed  ~40 MWe/min  to arm.
      // That makes it C-7 class in structure — rate-based, cannot fire at steady load
      // however large. It has to sit clear of dispatch: an arm low enough to catch an
      // ordinary 15 MWe slider cut leaves the dump venting the difference forever,
      // holding the reactor at 100 % and defeating the load-follow lesson EV-11 teaches
      // (measured: power ends 99.7 % instead of 85 %).
      //
      // HONEST LIMITS, measured (#219) — the value is a judgement call, not a derivation:
      //   * it is a CLIFF. A 39 MWe rejection does not arm and lifts the PORV (Tavg
      //     318.9 °C, 16.24 MPa); 41 MWe arms and is caught (Tavg 304.5, no lift).
      //   * it is BLIND TO STAIRCASES. The same 60 MWe rejected in four 15 MWe steps
      //     never arms at all (Tavg 319.0) — each step is under the rate threshold.
      // Both follow from any bistable arm and are not fixed by moving the number — an arm
      // low enough to catch a 15 MWe cut vents forever (above). RULED 2026-07-27 (#219,
      // owner): KEEP 40 MWe and DECLARE the cliff. The sub-threshold rejection is a
      // manoeuvre the operator handles, and the PORV is the honest backstop when they
      // don't. Recorded as a named simplification, DESIGN_COMPANION §8.21, catalog TR-1c,
      // and pinned BOTH SIDES by behaviour probe TR-1c so it cannot move silently. [tune]
      dump_load_reject_mwe: 40.0,
      // ...and the mismatch below which the latch RESETS: the reactor has come back to
      // meet the load, so the ride-out is over and pressure-mode has it again. [tune]
      //
      // DEPARTURE IN KIND, not merely an unsourced number (#374 evidence pass):
      // the real loss-of-load arming *"remains armed until the loss-of-load
      // signal is manually reset by a control room operator"* (mode selector to
      // RESET, spring return — WTSM §11.2, ML11223A294, §11.2.2.3). There is no
      // automatic clear to source a value FOR; this auto-clear stands in for a
      // reset control the board does not carry. The real ARM is also far more
      // sensitive — *"a ramp load decrease at a rate greater than 5%/min, or a
      // step load decrease of greater than 10%"* — and the operator-reset
      // design is WHY it can be that sensitive without venting forever, which
      // is the exact trade the §8.21 ruling (#219) weighed from the other side.
      // Value UNVERIFIED.
      dump_reject_clear_mwe: 10.0,
    },

    // ------------------------------------------------------ turbine / condenser
    turbine: {
      torque_per_flow: 1.0, torque_per_load: 1.0,
      turbine_inertia: 50.0,       // coasts slowly [tune]
      rpm_rated: 1800.0, rpm_overspeed_trip: 1980.0,
      sync_tau: 0.5,               // s grid pull-in to rated speed when synced
      coastdown_tau: 40.0,         // s rotor coastdown to rest after a trip/disconnect [tune]
      vacuum_rated: 96.5, vacuum_lost: 16.9,   // kPa [tune]
      vacuum_restore_tau: 10.0, vacuum_decay_tau: 30.0, // s [tune]
      // ---- circulating-water temperature → achievable vacuum -------------------------
      // The condenser can only pull the steam down to saturation at whatever temperature
      // the cooling water can hold, so warm circ water means less vacuum, less output at
      // the same steam flow, and a shorter walk to vacuum_trip_kpa. This is the summer
      // derate, and it is the reason RHR shutdown cooling has a floor (see rhr_sink_c).
      //
      // Formulated as a DELTA against a reference so it is calibration-preserving: at
      // cw_inlet_ref_c the target is EXACTLY vacuum_rated, bit-identical to the two-point
      // model it replaces. Only departures from the reference move anything, so every
      // existing scenario, IC and save behaves as before.
      // Reference circ-water inlet = 80 °F, which is the board box's default, so typing the
      // default back in reproduces the reference condition instead of nudging it.
      cw_inlet_ref_c: 26.6667,
      cw_range_c: 10.0,            // CW temperature rise across the condenser at full load [tune]
      cw_ttd_c: 3.0,               // terminal difference: condensing steam above CW outlet [tune]
      cw_inlet_min_c: 4.4, cw_inlet_max_c: 37.8,   // operator range, 40–100 °F
      // Cold circ water buys vacuum ABOVE the rated value — the winter uprate is real, and
      // capping the gain at vacuum_rated would leave the whole cold half of the operator's
      // range doing nothing, which reads as a broken control. Ceiling is the practical
      // condenser floor (~1.8 kPa absolute), not the thermodynamic 101.3. At 40 °F this
      // yields ~29.3 inHg and a couple of percent above nameplate, which is what a real
      // plant does in winter. Nothing in the default lineup reaches it: the reference
      // condition still lands exactly on vacuum_rated.
      vacuum_max_kpa: 99.5,
      // Turbine trip on low vacuum: the MECHANISM is sourced — the auto-stop oil
      // system *"provides turbine trips on low lube oil pressure, low vacuum,
      // thrust bearing wear, and overspeed"* (WTSM §7.3, ML11223A247) — the
      // VALUE is not: no setpoint anywhere in the corpus. UNVERIFIED (#374).
      vacuum_trip_kpa: 74.5,       // turbine trip setpoint (actuated by the control layer) [tune]
      mwe_rated: 100.0,            // MWe — THIS PLANT'S RATING (identity below; feel-plan P6) [tune]
      // OPERATOR LOAD RATE, % of rated per minute. Real turbine control is rate-limited
      // (WTSM 11.3, ML11223A295: the operator sets a target and a rate on a thumbwheel and
      // the EHC ramps between them), so an instantaneous load step is not a manoeuvre a real
      // operator can make. This plant used to permit one, and that was measurable: a 70 -> 100
      // MW step peaked loop dT at 109.1 % of rated, within 0.51 of the OPdT trip and
      // indistinguishable from a 15 % steam line break at 109.8 %.
      //
      // 10 %/min is NOT invented and NOT taken from the source. `Manuals/09` §8.0 already
      // documents "Power ramp ceiling ~10 %/min class where achievable" as this plant's
      // authored operator limit — so the turbine now ENFORCES a limit the manual already
      // stated. MEASURED sweep: at 100 %/min (the old behaviour) the OPdT margin bottoms at
      // 2.07 and the runback fires on a normal ramp; at 10 %/min it is 4.57 and the runback
      // stays silent; 5 %/min buys only 4.72 for double the wait. The source's own 1 %/min is
      // an EXAMPLE of a selectable rate, not a maximum, so it is not a candidate.
      //
      // OFF *(OWNER DIRECTIVE, 2026-08-03: "I dont like the new load increase rate limite;
      // turn it off.")*. 0 disables it: `load_mode.js` gates the ramp on `rate > 0` and
      // otherwise assigns the commanded load straight through, which is the pre-#318 path
      // and the one RBMK/BWR have always taken (the option is absent there). The machinery
      // stays because the sourcing is good and re-enabling it is this one number.
      //
      // WHAT TURNING IT OFF COSTS, measured rather than assumed — the excursion above is
      // real and comes back: an instantaneous 70 -> 100 MW step is again available to the
      // player, and it again takes loop dT to within ~0.5 of the OPdT trip. That is a trip
      // the player can walk into with one box entry. It is the owner's call and it is not a
      // defect; note it here so the next agent does not "fix" the excursion by restoring
      // the limit.
      //
      // AND IT RE-OPENED A SQUEEZE IN ANOTHER FILE'S CONSTANT (#379): the runback dwell
      // `persist_s` in pwr_control.js was sized citing this limit as its complement ("a gap
      // two orders of magnitude wide"), and with the limit off that argument is void — the
      // real gap, re-measured 2026-08-06, is 2.8x (normal-step peak dwell 3.0 s vs the 8.5 s
      // requirement; a 15 % steam line break engages at 40 s). The two constants are a PAIR:
      // whoever moves this one re-measures that one's gap, and vice versa. The full
      // accounting lives at the `persist_s` comment.
      load_rate_pct_per_min: 0,      // [tune] — 0 = no limit; 10.0 was the #318 value
      // Turbine governor / control valve: EHC load-control mode — the valve
      // TARGET is pressure-compensated (demand ÷ P/P_rated, clamped fully open)
      // so steady-state delivered steam equals the load demand at any secondary
      // pressure; the position itself strokes with a first-order lag and
      // modulates steam flow together with SG pressure. [tune]
      governor_tau: 2.0,           // s valve response time constant
      // Turbine stop (throttle) valves — the TRIP-closure path (#373, audit #297
      // F5). *"If a turbine trip signal is present, the high pressure hydraulic
      // fluid will be dumped from the throttle valves. The dumping of the high
      // pressure fluid allows spring force to rapidly close the throttle valves.
      // Since all turbine valves close on a turbine trip, the throttle valves and
      // governor valves provide redundant isolation of steam flow to the high
      // pressure turbine."* (WTSM §7.3, ML11223A247). Until #373 a tripped
      // turbine kept drawing steam on governor_tau alone — 2.138 flow-seconds of
      // rated steam through a "shut" machine, because one constant was doing two
      // jobs (load control AND trip closure) that the real machine does with two
      // different valves. The MECHANISM is sourced above; the closure constant
      // itself is not — WTSM says "rapidly close" and gives no number, so 0.15 s
      // is UNVERIFIED [tune]: sub-second per the spring-slam description, and
      // fast enough that the stop valve, not the governor, bounds trip steam
      // (measured: 0.127 flow-s drawn vs 2.138 at governor_tau alone). The
      // reopen tau is the relatch after a trip reset — deliberately slower, and
      // inert in practice because the governor is at 0 demand at re-sync. [tune]
      stop_valve_tau: 0.15,        // s — spring closure on trip (UNVERIFIED value, sourced mechanism)
      stop_valve_reopen_tau: 5.0,  // s — reopen after the trip latch clears
    },

    // ----------------------------------------------------------- emergency cool
    emergency: {
      // Merged HPI/LPI emergency injection on a DEDICATED ECCS pump train (this
      // plant's ECCS has its own pump, RWST-sourced — separate from the CVCS
      // charging pump; owner ruling 2026-07-22, and why HPI flow sits on a much
      // larger scale than CVCS charging — see reactivity.cvcs_inventory_gain).
      // ONE system, one command (set_hpi), a two-segment pump curve
      // (pwr_primary.injectionFlowInv):
      //   high-head/low-flow segment  — hpi_flow_max (inventory-frac/s at 0 MPa),
      //                                 shutoff head hpi_pressure_ref;
      //   low-head/high-flow segment  — lpi_flow_max × lpi_inventory_gain
      //                                 (inventory-frac/s at 0 MPa), shutoff
      //                                 head lpi_pressure_ref.
      // s.hpi_flow_normalized = delivered / combined rated (0–1). [tune]
      hpi_flow_max: 2.0e-4,        // high-head segment, inventory-frac/s — #408 wave 1 REAL scale: Ginna 300-600 gpm HHSI / 38,323 gal (T15.6-10/17); was 0.06 (~300x real) [tune]
      hpi_pressure_ref: 18.4,      // MPa; high-head flow → 0 as P approaches this — CCP shutoff 2,670 psig, WTSM 5.2 T5.2-3 (#408) [tune]
      lpi_pressure_ref: 1.5,       // MPa low-head shutoff head — RHR ~200 psid (WTSM 5.2), Ginna LHSI dead-heads ~215 psia (T15.6-17) (#408)
      lpi_flow_max: 1.0,           // normalized rated low-head flow
      lpi_inventory_gain: 5.2e-4,  // inventory frac/s per unit normalized low-head flow — Ginna 1,200 gpm LHSI / 38,323 gal (#408; was 0.10, ~190x real)
      // ECCS pump discharge-pressure indication (MPa): the head the running
      // pump develops against the RCS it injects into (system pressure + line margin,
      // clamped to shutoff head). 0 when HPI is not active. [tune]
      hpi_shutoff_mpa: 18.4,       // ≈ 2,670 psig — CCP shutoff head (WTSM 5.2 T5.2-3), tracks hpi_pressure_ref (#408)
      hpi_discharge_margin_mpa: 0.4, // head above RCS pressure while injecting
      // Accumulators: passive borated tanks that discharge into the cold leg once
      // primary pressure falls below the arming pressure; finite capacity depletes.
      // Same normalization convention as LPI. Set to the real B&W core-flood-tank /
      // Westinghouse SIT cover-gas pressure (~4.14 MPa / 600 psi). This value is now
      // physically meaningful because the break blowdown flash-cooling term
      // (thermal.blowdown_gain) makes the saturation plateau respond to break size: a
      // SMALL break holds the hot plateau well ABOVE 600 psi (decay heat keeps the coolant
      // hot — as at TMI-2, where operators had to deliberately depressurize to reach CFT
      // pressure), so it never spuriously refills and the inventory/void lesson is intact;
      // only a genuine LARGE break cools the RCS below Tsat(4.14 MPa) ≈ 252 °C and arms the
      // accumulators. (Was detuned to 1.5 MPa under a stale premise — see BUILD_DECISIONS /
      // CHANGELOG 2026-07-17; the old model pinned Tavg regardless of break size and used
      // K_leak_depressurize to force pressure below saturation, which never reached 1.5.) [tune]
      accumulator_trip_mpa: 4.14,  // arming pressure — real CFT/SIT cover-gas setpoint (600 psi)
      accumulator_flow_max: 1.0,   // normalized rated accumulator flow
      accumulator_inventory_gain: 0.012, // inventory frac/s per unit normalized flow — Ginna dump 0.435 RCS in ~36 s (T15.6-15) (#408; was 0.12)
      accumulator_capacity: 0.40,  // total deliverable inventory fractions (finite) — Ginna 2x1,115 ft3 / 5,123 ft3 = 0.435 same-document (#408; was 2.5, ~6x real)
      // N2 cover-gas volume as a fraction of the initial WATER volume, used to drive the
      // tank-pressure indication as the accumulator empties. A real SIT is ~1350 ft³ holding
      // ~1000 ft³ of borated water, so the gas space is ~0.35 of the water volume. The gas
      // expands isothermally as water discharges (P·V constant), so a full tank indicates the
      // charge pressure and a fully-dumped one decays to ~0.26 of it (~155 psi) — which is why
      // accumulators stop injecting well before they are empty. Indication only; the injection
      // driving head remains accumulator_trip_mpa. [tune]
      accumulator_gas_frac: 0.35,
      // Boron concentration of ALL emergency-injection water (RWST-sourced HPI/LPI
      // and the SIT accumulators). Real RWST/SIT boron runs ~2000–2700 ppm, sized so
      // the core stays subcritical when reflooded cold. Injected inventory mixes into
      // s.boron_ppm (pwr_primary.stepInventory, perfect mixing), so ECCS/accumulator
      // injection RAISES core boron and adds negative reactivity — the shutdown-margin
      // role of borated safety injection during a LOCA. CVCS borate/dilute is a
      // separate, idealized direct-rate channel (pwr_engine step 13). [tune]
      eccs_boron_ppm: 2500,        // ppm; RWST/accumulator boron concentration [tune]
      // Cold-injection thermal quench. Emergency-injection water enters the cold leg
      // well below Tavg (RWST/SIT held at containment/aux-building ambient), so it
      // removes SENSIBLE heat as it mixes into the coolant node — the thermal shock
      // that accompanies a large-break accumulator dump (and any HPI/LPI make-up).
      // pwr_thermal.stepCoolant pulls Tavg toward eccs_temp_c at the injection
      // throughput rate (HPI/LPI + accumulators, inventory-frac/s from stepInventory),
      // scaled by eccs_cooling_gain. RHR is EXCLUDED — it recirculates RCS water, not
      // cold RWST make-up (its heat removal is the separate Q_rhr term). The gain is a
      // dimensionless tuning scale: the raw inventory-frac rates are tuned for the
      // mass/void balance, so decoupling the thermal coupling keeps the quench
      // dramatic-but-observable (~°C/s) rather than an instantaneous single-step
      // crash. The mixing form is self-limiting — it cannot cool below eccs_temp_c. [tune]
      eccs_temp_c: 40.0,           // °C — RWST / SIT injection temperature (~104 °F) [tune]
      eccs_cooling_gain: 1.0,      // dimensionless scale on the cold-injection mixing term — at REAL rates the physical value of this mixing form IS 1.0 (true enthalpy mixing); the 0.08 divider existed only to decouple the compressed rate (#408) [tune]
      // Residual Heat Removal (RHR, formerly DHR): the low-pressure shutdown-cooling
      // loop that doubles as LPI. Suction is taken from the HOT LEG through a valve
      // interlocked to primary pressure. Aligned = suction valve open (rhr_active).
      // It recirculates coolant hot leg → HX → cold leg (no net inventory change —
      // the LPI/RHR pump moves RCS water, not RWST make-up), removing heat toward
      // rhr_sink_c. Cooldown rate is throttled by the HX flow split (set_rhr_hx):
      // the operator routes more/less of the constant loop flow through the heat
      // exchanger vs. the bypass. Dormant at power. [tune]
      //
      // TWO SETPOINTS, NOT ONE (#288). The block-open permissive and the autoclosure
      // interlock are separate values with ~175 psi between them, and the autoclose
      // sits ABOVE the open block. Both are sourced — NUREG-0933 Issue 99, "RCS/RHR
      // Suction Line Valve Interlock on PWRs" (Rev. 3): "Two basic features are
      // incorporated in the interlock design: (1) an automatic closure signal on high
      // RCS pressure (typically 600 psig), and (2) a block of the manual open signal
      // at a lower RCS pressure (typically 425 psig)." Westinghouse Technology Systems
      // Manual §5.1 (ADAMS ML11223A219) gives the same structure for valves 8701/8702,
      // open block 425 psig against an autoclose at ~585 psig.
      //
      // This plant used ONE constant for both jobs until 2026-07-31, so the deadband
      // was ZERO and the valve chattered across the boundary. Paired with the one-shot
      // entry permissive kept by #287, the first chatter was PERMANENT: measured, a
      // cooldown whose pressure-control setpoint sat at 409 psi (2.82 MPa) — just over
      // the interlock — aligned RHR, rebounded, auto-closed, and never recovered.
      // Do NOT re-merge these. Do NOT raise the open permissive to widen the band:
      // 400 psi is what the manual, procedures 04/05 and the campaign all quote, and
      // it is inside the sourced range for a block-open setpoint.
      rhr_valve_interlock_mpa: 2.76, // MPa (400 psi) — hot-leg suction valve OPEN permissive (block-open)
      rhr_autoclose_mpa: 4.14,       // MPa (600 psig) — autoclosure interlock: a standing-open valve shuts above this
      rhr_sink_c: 50.0,            // °C cooldown sink target
      rhr_gain: 0.03,              // heat-removal gain at full HX flow (Q per °C above sink)
    },

    // ------------------------------------------------------------------ containment
    // #386 stage 1 (2026-08-05) — the containment BUILDING as a lumped receiving
    // volume. Before this, containment was two constants and a declared exclusion
    // (Manuals/12 §13.0): the break discharged into a fixed 0.1 MPa
    // (primary.break_backpressure_mpa) and the relief valves into a fixed 0.103
    // (pressurizer.P_containment), forever. Both constants REMAIN, as the initial /
    // fallback backpressure — the live state starts there and rig-built states
    // without containment fields fall back to them — but the running plant now
    // discharges into a volume whose pressure RISES, and the break/relief √Δp laws
    // read that live pressure in their numerators. The spans stay config-fixed:
    // the orifice coefficient is a rated-flow-at-rated-Δp calibration, not a
    // function of where the discharge lands.
    //
    // MODEL. One steam inventory (_ctmt_steam, normalized RCS-mass units — the same
    // currency leak_flow and the ECCS curve use) behind three terms:
    //   in:   break liquid × a FLASH FRACTION + relief flow at 1.0 (already steam)
    //   out:  _ctmt_steam / passive_sink_tau_s (condensation on structures → sump)
    //   P  =  ambient_pressure_mpa (air partial, fixed) + press_gain · _ctmt_steam
    // The flash fraction is cp·(T_source − T_sat(P_ctmt))/h_fg ≈ (Tavg − T_sat)/540:
    // liquid discharged from a hot RCS flashes partly to steam; liquid at or below
    // the containment saturation temperature rains into the sump and moves pressure
    // NOT AT ALL. That gate is what makes the model behave, and the Q0 sweep below
    // is why: with unlimited RWST a LOCA is sustained feed-and-bleed, discharging
    // 36–229 RCS masses in 30 min (severity 0.05–1.0) — unbounded in time — but the
    // FLASH-WEIGHTED steam yield is bounded and severity-compressed, 3.3–5.2 units,
    // saturating in 5–10 min as the ECCS quench takes the source below flashing.
    // Containment pressure therefore peaks on the hot early blowdown and then
    // decays on the passive sink while cold spill runs to the sump — which is the
    // real shape of a LOCA containment response.
    //
    // SOURCES (fetched, inbox/sources/). Setpoint anchors for stage 2, quoted here
    // because they SIZE stage 1's gain: WTSM 12.3 (ML11223A310): SI actuation on
    // high containment pressure "The setpoint for this protection signal is
    // 3.5 psig … cannot be blocked by the operator"; containment spray on hi-hi,
    // "The setpoint is 30 psig." WTSM 5.0 (ML11223A218): spray actuates "when
    // containment pressure reaches approximately half of design pressure" — with
    // spray at 30 psig that puts DESIGN PRESSURE ≈ 60 psig = 0.515 MPa abs, the
    // only design-pressure statement in any lane's corpus (a citable inference,
    // and design_pressure_mpa below carries it). NO document in the corpus gives
    // free volume, so press_gain is FITTED. MEASURED at 0.08 (full stack, hot full
    // power, TUNING_LOG 2026-08-05-develop-a): full-size break peaks 0.384 MPa abs
    // (41 psig) at ~2 min — ⅔ of design pressure, the licensing-margin shape (a
    // real DBA calculated peak sits UNDER design, that being what the margin is
    // for) — and the stage-2 setpoints grade correctly: every containment-side
    // break crosses 3.5 psig within minutes (severity 0.05 in under 2 min), while
    // only large breaks reach the 30 psig spray point (severity 0.5 peaks 33 psig,
    // 0.2 peaks 25 psig), matching WTSM 12.3's "a very high containment pressure
    // is indicative of a large line break".
    containment: {
      ambient_pressure_mpa: 0.1013, // MPa abs — air partial pressure; fixed, NOT [tune]
      ambient_temp_c: 38.0,         // °C (~100 °F) — normal containment ambient
      // Design pressure, abs. Sourced by inference (see header): 60 psig.
      // Structural reference for indication/probes — nothing clips to it.
      design_pressure_mpa: 0.515,
      // MPa of steam partial pressure per normalized unit of steam inventory.
      // FITTED (no sourced free volume exists): full-size break peaks at ~design
      // pressure. Q0: yield 5.2 units → 0.08. [tune]
      press_gain: 2.3,             // #408 wave 1 REFIT (was 0.08, fitted to the compressed 36-229-RCS-mass throughput): re-solved against the sourced grading on REAL discharge — DBA peaks 38.2 psig (~2/3 of 60 psig design), 30-psig spray point reached only at sev >= 0.25, every containment-side break crosses 3.5 psig inside a minute [tune]
      // Flash-fraction span, °C: fraction = (T_source − T_sat(P_ctmt)) / this.
      // h_fg/cp at ~atmospheric ≈ 2257/4.18 ≈ 540 — a PHYSICAL ratio, not a fit.
      flash_span_c: 540.0,
      // Passive heat-sink condensation time constant (walls, structures, coolers
      // OFF — stage 2 adds the active systems). Sets both the no-spray decay after
      // a blowdown and the equilibrium a sustained hot leak parks at. [tune]
      passive_sink_tau_s: 220.0,   // #408 refit (was 1800): the sink must bite SLOW discharges harder than the blowdown pulse or the family's peaks read flat — this is what grades sev 0.05 (22.9 psig) under the spray point while the DBA pulse keeps its peak [tune]
      // ---- stage 2 (#386): ACTIVE heat removal — AUTO-ONLY by ruling (owner,
      // 2026-08-08: "Can we make the system automated for now and not reveal the
      // controls to the player yet?") — no board card, no player-facing spray
      // control; the command surface exists for the actuation rows, tests and the
      // future board card.
      // Actuation setpoints — SOURCED, NOT [tune] (both ML11223A310, WTSM 12.3):
      // SI backup "The setpoint for this protection signal is 3.5 psig. This SI
      // actuation signal cannot be blocked by the operator." (:219); spray hi-hi
      // "The setpoint is 30 psig." (:394), which also isolates main steam (:468).
      // Gauge → abs on this plant's own ambient (0.1013): 3.5 psig = 0.1254,
      // 30 psig = 0.3081. Instrument range [0, 0.8] already holds both strictly
      // inside (stage 1 pre-sized it; run_reachability Part A).
      si_hi_pressure_mpa: 0.1254,
      spray_hihi_pressure_mpa: 0.3081,
      // Active-sink taus: NO document in any lane's corpus carries a spray or fan
      // heat-removal capacity (find_source 2026-08-08 — every capacity phrasing
      // exits 1), so both are FITTED like press_gain, sized in the stage-2 Q0
      // sweep. Spray is the fast knockdown train (Ginna TS B 3.6.6: CS = two
      // 100 % trains on Hi-Hi, RWST-fed); the CRFC realign is the slower diverse
      // one (same source: four fans, ~2 running normally, auto-start on SI) — the
      // NORMAL-mode fans are folded into passive_sink_tau_s by declaration, this
      // term is only the SI-realign increment. [tune] both.
      spray_sink_tau_s: 240.0,     // s — condensation tau with spray delivering [tune]
      fan_sink_tau_s: 750.0,       // s — additional CRFC safety-realign tau [tune]
      // Spray water reaching the sump while spray runs, normalized RCS-mass
      // units/s — sump indication only (no RWST inventory node exists; declared,
      // same family as stage 1's sump). [tune]
      spray_sump_rate: 0.02,
      // Upstream-SLB containment source: converts s.steam_break_flow (fraction of
      // RATED STEAM FLOW, the secondary's currency) into this ledger's normalized
      // RCS-mass units. FITTED (no sourced conversion exists — the two ledgers
      // deliberately run their own currencies); Q0-sized so the sourced HELB case
      // behaves: an upstream break crosses the 3.5 psig backup signal promptly
      // (WTSM 12.3 names any high-energy line break inside containment), and only
      // a large one approaches the spray point. Downstream breaks discharge to
      // the turbine building — no containment term, the isolable/non-isolable
      // teaching split. [tune]
      // Q0-sized (2026-08-08): at 0.004 the full-break peak sat 0.7 % under design
      // pressure — a knife-edge that flips on any retune (#418's TR-3 lesson).
      // 0.0035 keeps MSLB the LIMITING containment case (real-plant ordering: it
      // bounds the DBA LOCA's 38 psig) at ~88 % of design. Full break: crosses SI
      // 3.5 psig ≈ 13 s, spray 30 psig ≈ 46-60 s, peak ~2.5 min, spray knockdown
      // from there.
      slb_ctmt_gain: 0.0035,
      // Normalized discharged-liquid units at 100 % indicated sump level. Sizing:
      // the full-break 30-min ride discharges ~229 units → reads ~76 %; an RCP seal
      // leak creeps. Indication only — no recirculation (no RWST inventory exists
      // to swap from; declared, Manuals/12 §13.0). [tune]
      sump_ref: 3.0,               // #408 refit (was 300, on 229 discharged RCS masses): a real 30-min full-break ride discharges ~2-3 — sump reads 58 % on the DBA, graded to 36 % at sev 0.05 [tune]
    },

    // ------------------------------------------------------------------ rods
    rods: {
      // Fine-step drive (rod-granularity retune 2026-07-23). The single lumped bank
      // carries the FULL control worth (~8500 pcm) that a real plant spreads over
      // ~4 banks × 228 steps of travel — at 228 steps one step near the startup
      // critical band inserted ~36 pcm (~5.5 ¢): criticality arrived in ~40 pcm
      // lurches and one tap at the point of adding heat jumped power ~+4 % (peak
      // ~10 %). 912 steps (= 4 × 228, the real total-travel equivalent) puts one
      // step at ~9 pcm (~1.4 ¢) in the critical band — real bank-D differential
      // worth. Speeds are ×4 in steps/s so travel in %/s (and every tuned
      // evolution) is unchanged; only the quantum is finer. [tune]
      max_steps: 912,
      // Selectable speeds (steps/s): slow 32/min, normal 192/min, fast 288/min —
      // the same fraction-of-travel rates as the old 8/48/72 on 228 steps.
      speeds: { slow: 0.533, normal: 3.200, fast: 4.800 },
      // On release the drive de-energizes but the bank overruns briefly before the
      // latch catches — a slight coast (this many seconds of continued travel at the
      // current speed, then stop). Time-based, so a fast drive overruns ~4–5 fine
      // steps while a slow crawl stops almost at once (momentum feel, not an abrupt halt). [tune]
      stop_coast_s: 1.0,
      scram_time_control_s: 2.5,   // full-travel insertion time [tune]
      scram_time_shutdown_s: 2.0,  // slightly faster (pre-loaded) [tune]
      control_op_position_pct: 92.0, // control group operating position (% withdrawn)
      // Rod insertion limit (RIL) for the control group — the % withdrawn floor the
      // bank is expected to stay above. It drives the ROD INS LIMIT alarm and stops
      // the automatic rod channel from inserting further.
      //
      // It is POWER-DEPENDENT, and that matters: the limit exists to preserve
      // shutdown margin and to cap ejected-rod worth AT POWER. During a startup the
      // bank is deliberately deep — boron and the shutdown bank hold the margin —
      // so a fixed floor annunciates continuously through every ascent and says
      // nothing. Below `min_power_pct` the limit does not apply at all; above it the
      // floor ramps linearly from `lo_pct` to `hi_pct` at 100 % power. The bank sits
      // at 92 % withdrawn across the whole load range, so `hi_pct` 70 leaves ~22
      // points of margin at full power and the alarm means "you are driving the bank
      // abnormally deep for this power", which is what it is for. [tune]
      insertion_limit_min_power_pct: 5.0,
      insertion_limit_lo_pct: 5.0,
      insertion_limit_hi_pct: 70.0,
    },

    // -------------------------------------------------- §9.1 physics-fail [tune]
    physics_failures: {
      ROD_RUNAWAY_RATE_MAX: 24.0,  // steps/s (fine steps — same fraction-of-travel/s as 6.0 on 228)
      STUCK_ROD_MAX_FRAC: 0.4,     // fraction of rod_worth_total
      // Break strength AS A MASS FLOW — the break's OWN constant since #418 wave A1
      // (2026-08-07). History: #370a converted the break from a bare dP/dt sink to a
      // mass flow, but expressed it as STEAM_BREAK_RATE (1.5 MPa/s) divided by
      // K_steam_pressure at the use site so the old pressure effect was reproduced
      // exactly. That division made the break's MASS inversely proportional to the
      // pressure-clock constant — re-deriving K_steam_pressure 2.0 → 0.30 (see the
      // steam_generator block) would have silently QUINTUPLED every steam-break mass
      // flow, pegged the sg_steam_flow instrument (range [0, 2.0]), saturated the
      // three-element feed channel's ff clip, and trivialized the MSLI flow leg. So
      // the flow is now stated directly: 0.75 = the exact value the old pair produced
      // (1.5 / 2.0), byte-identical mass flow at every size and pressure. What CHANGED
      // is the break's pressure effect, deliberately: 0.75 × K(0.30) = 0.225 MPa/s at
      // full size, so a full MSLB now blows the header down over ~25 s instead of ~4 —
      // the depressurization runs on the real steam-space capacitance like every other
      // flow. [tune] pending a sourced Moody critical-flow number (stage-0 fetch).
      STEAM_BREAK_FLOW_FRAC: 0.75, // fraction of rated steam flow at full break size, at rated pressure
      DEFAULT_DRIFT_RATE: 0.5,     // instrument drift units/s
      DEFAULT_NOISE_SCALE: 5.0,    // noisy-mode sigma multiplier
    },

    // Global multiplier on every instrument's noise sigma. RETIRED to 1.0 (#217):
    // noise is now set PER INDICATION below, which is what the original complaint
    // actually called for.
    //
    // History worth keeping. This was introduced at 0.5 and halved again to 0.25 within
    // a day, because "the readouts were jittering more than wanted". The complaint was
    // real, but the instrument was wrong: measured, only about NINE indications were
    // misbehaving, and a global scaler punished all twenty-five. The ones that were
    // already right got dragged to frozen.
    //
    // What actually governs "dancing" is noise relative to the readout's DISPLAY STEP,
    // not absolute sigma. `fw_flow` and `steam_flow` were at sigma = 10x their 1 gpm
    // display step; `boron_analyzer` 4x; `hpi_flow`, `steam_pressure` and
    // `porv_tailpipe_temp` ~3x. Meanwhile `pzr_level`/`sg_level` (0.5), `tavg` (0.36 F)
    // and the valve positions (0.3) were already in the sweet spot — and `power_range`,
    // `mwe_output` and `condenser_vacuum` were already too QUIET.
    //
    // The sigmas below are therefore chosen so that visible jitter lands near
    // 0.3-0.6 x the display step: the last digit moves occasionally, which reads as a
    // live instrument, rather than churning every frame or sitting frozen. Per class,
    // because real signals differ — flows (turbulence, pulsation) 0.6, levels and
    // pressures 0.5, nuclear 0.4, temperatures (RTD thermal inertia) and valve
    // position feedback 0.3.
    //
    // Keep this at 1.0. If the board still feels wrong, move the ONE indication that
    // is wrong, not all of them.
    instrument_noise_scale: 1.0,

    // Noise correlation time, seconds (#233/#234). PROCESS vs MEASUREMENT noise — the split
    // that decides whether a number belongs here or in the HMI:
    //
    //   MEASUREMENT noise (the sensor wobbles; the process is steady) stays WHITE here, at 0.
    //   What makes a real board look calm is not a quiet transmitter, it is the INDICATOR's
    //   own damping — and that is a display property, not a plant one. It lives in
    //   pwr_board_wiring.js DISPLAY_DAMP. Correlating it here instead moved what the
    //   CONTROLLERS act on, which is how #234 reddened two control-loop gates: an 8 s
    //   correlation sits inside the CVCS servo's 20 s filter passband, so the servo started
    //   chasing gauge noise it had previously been designed to reject.
    //
    //   PROCESS noise (the thing genuinely is moving) belongs HERE and stays correlated,
    //   because a controller really does see it — see `sg_level`'s own `noise_tau` below.
    //   Damping that at the indicator would be lying about the plant.
    //
    // Per-instrument override: `noise_tau`. Default 0 = white.
    instrument_noise_tau_s: 0,

    // RESOLVED (#233): `power_range` noise is no longer a constant absolute value. The note
    // that stood here said a sigma sized to look live at 100 % power is ruinous at 1 %,
    // where the same absolute number swamps a startup — so it was pinned at the quiet end
    // (0.2) for the low-power case and could never be right at both. `noise_ref` is the
    // signal-proportional model it asked for: full sigma at the reference reading, tapering
    // to nothing below it. Both ends can now be right with one number, which is also what
    // stops a shut-down plant's indications twitching.
    // ----------------------------------------------------------- instrument set
    // id → { measures, lag (s), noise sigma (instrument units), range[min,max] }.
    // Status booleans (no lag/noise) are listed under `status`.
    instruments: {
      // power_range top-of-range must exceed the 120% trip setpoint: a reading
      // pegged at exactly the setpoint never satisfies a strict crossed() compare,
      // so the high-flux trip could never fire (same fix as the RBMK meter).
      // noise_ref 25 %: excore NI is a counting instrument, so its jitter is proportional to
      // flux. Full sigma from a quarter power up; below that it tapers, so a startup at 1 %
      // is quiet and a shut-down reactor indicates a still zero instead of hunting.
      power_range:       { lag: 0.1, noise: 0.2,   range: [0, 200], noise_ref: 25 },
      // Range spans cold shutdown → hot: the meter must read true down in the cold band
      // (Mode 5 ~50 °C) instead of flooring at the at-power operating minimum. The UI Tavg
      // gauge auto-ranges its DISPLAY scale (fine operating band when hot, wide when cold).
      // RCS temperature sigmas 0.17 → 0.05 °C (#231). At 0.17 the board's Tavg tile jittered
      // ±1.2 °F peak-to-peak with the last digit changing ~3.6 times a SECOND, which is not
      // what a real Tavg does: these are RTDs in a damped bypass manifold and they sit very
      // steady — ±0.2 °F is the honest number, and 0.05 °C ≈ 0.09 °F sigma lands there.
      // All three move together because they are the same manifold and the board shows all
      // of them: Tavg, T-hot, T-cold and ΔTavg (thot − tcold) are four tiles on one screen,
      // so a steady average over two jumpy legs would be arithmetically impossible. Nothing
      // in the control layer or any gate reads thot/tcold — they are display + pipe colour.
      // Knock-on: subcooling_margin is DERIVED (Tsat(P) − tavg, noise 0), so its jitter was
      // tavg's; it falls with it. Sigma changes draw no extra PRNG numbers, so the
      // instrument noise SEQUENCE is unchanged — only its amplitude (cf. the noise:0 rule
      // below, where adding a draw is what shifts everything downstream).
      tavg:              { lag: 4.0, noise: 0.17,  range: [30, 343] },
      thot:              { lag: 4.0, noise: 0.17,  range: [30, 343] },
      tcold:             { lag: 4.0, noise: 0.17,  range: [30, 343] },
      primary_pressure:  { lag: 0.5, noise: 0.0034, range: [0, 20.7] },
      // pzr_level 0.3 → 0.12 % (#231). Real pressurizer level indication is a steady
      // differential-pressure reading on a single large vessel — no boiling at the tap, no
      // shrink/swell — and holds to a few tenths of a percent. Deliberately NOT matched to
      // sg_level below, which keeps 0.3: narrow-range SG level genuinely bounces (boiling
      // plus shrink/swell make it one of the noisier indications in a plant), so the two
      // reading alike was the tell that 0.3 was a copied default rather than a measurement.
      pzr_level:         { lag: 2.0, noise: 0.3,   range: [0, 100] },
      // sg_level keeps the largest sigma on the board ON PURPOSE — narrow-range level really
      // does bounce (boiling plus shrink/swell). This is the one instrument whose noise is
      // PROCESS noise rather than measurement noise: the level genuinely is moving, the feed
      // controller genuinely sees it, and so it keeps a real correlation time here rather
      // than being damped at the indicator. That contrast is the reading, not an artefact.
      sg_level:          { lag: 3.0, noise: 0.3,   range: [0, 100], noise_tau: 2.5 },
      // Flow transmitters, normalized to rated. noise_ref ~2 % of rated: a dP cell across a
      // shut line has no flow to be noisy about, so a secured pump indicates a still zero
      // rather than hunting around it (#233 — the ECCS "1 gpm with the pump off" report).
      steam_flow:        { lag: 1.0, noise: 0.0006,  range: [0, 1.2], noise_ref: 0.02 },
      fw_flow:           { lag: 1.0, noise: 0.0006,  range: [0, 1.2], noise_ref: 0.02 },
      mwe_output:        { lag: 0.2, noise: 0.3,   range: [0, 130], noise_ref: 10 },   // noise/range scaled with the 100 MWe rating
      turbine_rpm:       { lag: 0.5, noise: 0.3,   range: [0, 2000], noise_ref: 200 },
      condenser_vacuum:  { lag: 5.0, noise: 1,  range: [0, 102] },
      // §8.8 synoptic additions — CVCS flows, SG pressure, chemistry, governor, ECCS
      // (LPI/accumulator), and Animation-HR1 helpers (steam dump, primary leak).
      // Sources track TRUE sim quantities, not command setpoints (see pwr_instruments SOURCE).
      // Re-currencied with the #408 real flows: full charging is 60 gpm = 1.333e-4
      // frac/s, so the old compressed declarations left a 42 gpm signal under a
      // ±270 gpm noise sigma and a span 900x the pump. Span = 120 gpm; sigma kept
      // at the same fraction of span (0.5 %), noise_ref at 3.3 %.
      charging_flow:     { lag: 2.0, noise: 1.3e-6, range: [0, 2.67e-4], noise_ref: 8.9e-6 },   // true CVCS charging (≠ setpoint under AUTO)
      letdown_flow:      { lag: 2.0, noise: 1.3e-6, range: [0, 2.67e-4], noise_ref: 8.9e-6 },   // true CVCS letdown
      steam_pressure:    { lag: 0.5, noise: 0.0034,  range: [0, 8.5] },   // SG secondary pressure, MPa (top of range = pop 7.58 + margin — narrowed from 10.5 with the #419 wave-3 ladder; run_reachability guards every threshold inside range)
      boron_analyzer:    { lag: 45,  noise: 0.3,   range: [0, 2500] },   // chemistry sample — slow (Realistic-only boron readout)
      governor_valve:    { lag: 0.3, noise: 0.3,   range: [0, 100], noise_ref: 5 },    // turbine admission valve %
      hpi_flow:          { lag: 1.0, noise: 0.001, range: [0, 1.2], noise_ref: 0.02 },    // merged HPI/LPI injection line, normalized to combined rated (renamed in place from lpi_flow — PRNG order preserved)
      accumulator_flow:  { lag: 0.5, noise: 0.001, range: [0, 1.2], noise_ref: 0.02 },    // passive accumulator injection, normalized
      steam_dump_valve:  { lag: 0.3, noise: 0.3,   range: [0, 100], noise_ref: 5 },    // turbine bypass valve % (Animation HR1)
      primary_leak_flow: { lag: 0.2, noise: 3e-5, range: [0, 0.06], noise_ref: 6e-4 },    // LOCA/SGTR break flow, frac/s (Animation HR1) — #408 real currency: DEG peak ~0.047, sigma ~0.06 % of it as before
      startup_rate:      { lag: 2.0, noise: 0.004,  range: [-5, 10] },    // SUR (dpm) — startup-range rate meter; feeds the rod-withdrawal interlock
      porv_tailpipe_temp:{ lag: 10.0, noise: 0.17,  range: [0, 250] },    // PORV discharge/quench-tank line temperature — the unalarmed indication that reveals a stuck-open PORV (TMI-2)
      // Nuclear instrumentation (startup ranges) — LOG-scale detectors (lag +
      // noise act per decade; noise sigma in decades). Appended to SOURCE last.
      source_range:      { lag: 0.5, noise: 0.02,  range: [1, 1e6],     log: true },   // proportional counter, counts/s; de-energized reads the range floor
      intermediate_range:{ lag: 0.5, noise: 0.02,  range: [1e-11, 2e-3], log: true },  // compensated ion chamber, AMPS — calibrated band tops out ~1e-3 A (≈12 % power, "maxes out around 10 %"); physical over-range to 2e-3 so the high-flux trip (1.67e-3 ≈ 20 %) is reachable
      // ECCS / feedwater flow + discharge-pressure indications. noise:0 is DELIBERATE:
      // these are appended to SOURCE, and the instrument PRNG is a continuous cross-step
      // stream, so any noise draw here would shift every downstream instrument's noise and
      // silently move marginal campaign endpoints. Zero sigma → _gauss returns without a
      // draw, so the existing RNG sequence is byte-identical. Lag (deterministic) stays.
      afw_flow:                { lag: 1.0, noise: 0, range: [0, 1.2] },   // TRUE delivered AFW flow (= afw_flow_normalized)
      afw_discharge_pressure:  { lag: 0.5, noise: 0, range: [0, 12] },    // AFW pump discharge head, MPa
      hpi_discharge_pressure:  { lag: 0.5, noise: 0, range: [0, 18] },    // HPI/charging pump discharge head, MPa
      condensate_flow:         { lag: 1.0, noise: 0, range: [0, 1.2] },   // condensate/main-feed flow (0 when the condensate pump is off)
      sg_level_wide:           { lag: 4.0, noise: 0, range: [0, 100] },   // whole-vessel wide-range level (slower than narrow; noise:0 per the rule above)
      // Main-steam-line flow transmitter: TOTAL SG draw (turbine + dump + safeties).
      // Same lag/range as `steam_flow` — it is the same class of instrument, just
      // tapped where it also sees the dump. noise:0 per the rule above, and it is
      // not optional: shipping this at noise 0.01 cost one extra PRNG draw PER STEP,
      // which shifted every downstream instrument's noise from that step on and moved
      // three marginal endpoints (run_behavior TR-12b's SG safety lift 9.31 → 9.24 MPa,
      // run_campaign pwr_rod_auto's override, run_m5's second alarm). Physically it is
      // also the right call: this transmitter measures the same steam as `steam_flow`,
      // so giving it an independent jitter would double-count the same noise source.
      // SPAN WIDENED 1.2 → 2.0 (2026-08-05, #370c). This is the transmitter the
      // automatic steam line isolation reads, and at 1.2 it SATURATED during exactly
      // the casualty it discriminates: true total draw on a full-area break is ~1.75
      // rated (turbine 1.0 + break 0.75), so every break from ~40 % upward read the
      // same pegged 1.200 and the gauge could not tell a nuisance from a rupture.
      // Measured consequence at the old span: the 30 % break peaked 1.149 against a
      // 1.15 setpoint — one thousandth of margin, i.e. a coin toss deciding whether
      // an OTΔT measurement baseline isolates. Widening costs nothing elsewhere: the
      // reading only differs where it used to peg, noise is 0 so no PRNG draw moves,
      // and the sole other consumer (the three-element feed channel) clips its own
      // output at 120 % regardless.
      sg_steam_flow:           { lag: 1.0, noise: 0, range: [0, 2.0] },
      // Circulating-water inlet temperature, °C. Slow (a river/tower inlet does not move
      // fast) and noise:0 per the rule above — appended last, so the RNG sequence is
      // byte-identical to before this instrument existed.
      cw_inlet_temp:           { lag: 20.0, noise: 0, range: [0, 45] },
      // ---------------------------------------------------------- RCS loop flow (#247)
      // The elbow-tap flow channel that feeds the LOW-FLOW REACTOR TRIP. Built
      // 2026-07-29; before that the trip read true `pump_flow_pct` through a
      // `__true_flow__` sentinel and could not be fooled, lag or drift — the plant's
      // most safety-significant unteachable trip.
      //
      // SOURCED (evidence pass 2026-07-29, WTSM 3.2 "Reactor Coolant System",
      // ML11223A213 §3.2.3 "RCS Flow"):
      //   · "Elbow taps are used in the RCS to indicate the status of the reactor
      //     coolant flow… The elbow flow instrument measures the differential pressure
      //     between the inner and outer radius of the intermediate leg piping elbow."
      //     ΔP/ΔP0 = (ω/ω0)² — a dP cell, same class as steam_flow/fw_flow, hence the
      //     same 1.0 s lag. No component is inserted in the flowpath.
      //   · "The expected absolute accuracy of the channel is within ±10% and field
      //     results have shown the repeatability of the trip point to be within ±1%.
      //     The accident analysis for a loss-of-flow transient assumes an
      //     instrumentation error of ±3%."  The ±1 % repeatability is the SHORT-TERM
      //     jitter figure and is what `noise_failure` below is anchored to; the ±10 %
      //     is calibration bias, which is what an injected `drift` failure models.
      //
      // Reads in % OF RATED FLOW, not normalized, because that is the unit the real
      // trip is stated in ("< 90 % of rated flow") and what an operator reads.
      //
      // noise: 0 is DELIBERATE and is the rule for every appended instrument — the
      // instrument PRNG is one continuous CROSS-STEP stream, so one extra draw per step
      // shifts every instrument's noise from that step on (it has already moved three
      // marginal endpoints; see sg_steam_flow above). `noise_failure` is the sigma an
      // INJECTED `noisy` failure uses instead, which draws only while a failure is
      // active — no baseline run has one, so the existing sequence is byte-identical.
      // Without it a `noisy` flow-transmitter failure would be silently inert, and
      // failure injection on this channel is the entire reason to build it.
      rcs_flow:                { lag: 1.0, noise: 0, noise_failure: 0.5, range: [0, 120] },
      // Pressurizer spray flow, % of the spray line's maximum (#350 item 1). Same appended-
      // instrument rule as rcs_flow above: noise 0 so the cross-step PRNG sequence is
      // byte-identical, with `noise_failure` carrying the sigma an injected `noisy` failure
      // uses — without it that failure would be silently inert on this channel.
      pzr_spray_flow:          { lag: 1.0, noise: 0, noise_failure: 2.0, range: [0, 110] },
      // Containment (#386 stage 1) — building pressure in ABSOLUTE MPa (the board
      // shows psig; the conversion is display-side), atmosphere temperature, sump
      // level. Same appended-instrument rule as rcs_flow/pzr_spray_flow: noise 0
      // keeps the cross-step PRNG stream byte-identical, noise_failure carries the
      // sigma an injected `noisy` failure would use. Pressure range [0, 0.8] holds
      // the stage-2 protection setpoints (0.125 SI, 0.308 spray) and the 0.515
      // design pressure STRICTLY inside — the run_reachability Part A requirement.
      // The temperature channel is slow (a containment RTD reads a building, not a
      // pipe); the sump channel is a float gauge.
      containment_pressure:    { lag: 1.0,  noise: 0, noise_failure: 0.007, range: [0, 0.8] },
      containment_temp:        { lag: 10.0, noise: 0, noise_failure: 0.5,   range: [0, 200] },
      containment_sump_level:  { lag: 5.0,  noise: 0, noise_failure: 1.0,   range: [0, 100] },
      // CORE-EXIT temperature (#407, cluster stage 5) — the post-TMI inadequate-core-
      // cooling channel. RANGE IS SOURCED: NUREG-0737 (ML051400209) Item II.F.2
      // Attachment 1 item (2)(c) — "The range should extend from 200°F (or less) to
      // 1800°F (or more)" → 93–982 °C. Lag matches `tavg` (4.0 s) DELIBERATELY: on a
      // covered core the source equals the bulk exactly, and identical lag on identical
      // input keeps `max(tavg_ind, core_exit_ind)` byte-identical to `tavg_ind` — the
      // covered-core fence CA-21 asserts. Appended LAST, noise 0 + noise_failure, the
      // standing PRNG rule (the stream is byte-identical; a `noisy` failure still bites).
      core_exit_temp:          { lag: 4.0,  noise: 0, noise_failure: 0.17,  range: [93, 982] },
      // porv_indicator (boolean) and subcooling_margin (derived) handled specially.
      subcooling_margin: { lag: 0,   noise: 0,     range: [-28, 83], derived: true },
      // Pressurizer level DEVIATION from its program, % (#262). Derived from the INDICATED
      // level and the INDICATED Tavg, so it inherits both channels' lag and any failure on
      // them — the same construction as subcooling_margin, for the same HR1 reason.
      //
      // WHY A DEVIATION AND NOT A LOW-LEVEL SETPOINT. Level is programmed against Tavg, so
      // it legitimately moves a long way on a load change. MEASURED over a 100 → 90 MWe
      // ramp: indicated level went 55.00 → 63.26 % (+8.26) while the program went +8.25, so
      // the deviation stayed at 0.01. It is therefore an INVENTORY signal by construction —
      // the mass term is the only thing that can move it — and an absolute low-level alarm
      // set tight enough to see a small leak would fire on every load change instead.
      //
      // Range ±40 covers the program floor clip at the bottom of a cooldown without pegging.
      // Not in SOURCE, so it draws no PRNG number and the cross-step noise stream is
      // unchanged (the appended-instrument rule).
      pzr_level_dev:     { lag: 0,   noise: 0,     range: [-40, 40], derived: true },
      // Control-bank steps remaining ABOVE the rod insertion limit — the authority-remaining
      // signal the ROD LIMIT LO annunciator reads (#306). Range top is `rods.max_steps`, which
      // is also the value the engine reports when the limit does not apply; `run_m4` pins the
      // two together so the fine-step retune cannot silently peg this at 912 (they were 228
      // before 2026-07-23). Not in SOURCE, so it draws no PRNG number and the cross-step noise
      // stream is unchanged (the appended-instrument rule).
      rod_limit_margin:  { lag: 0,   noise: 0,     range: [0, 912],  derived: true },
      // ------------------------------------------------ cooldown/heatup rate (#375)
      // Tavg RATE from the INDICATED tavg — the 100 °F/hr Tech-Spec-class limit had
      // no instrument at all: the true-state trend existed, the board had nothing to
      // alarm on, and audit #297 F7 measured a one-entry dump cooldown at 1939 °F/hr
      // with no cue anywhere. Derived like subcooling_margin, so it inherits tavg's
      // lag and failures (HR1). rate_tau is the meter's damping, and its SIZE is the
      // alarm's spurious-actuation guard (the audit's standing question 3, applied
      // to this very alarm): a °F-per-HOUR limit wants hourly-scale damping. At
      // 45 s the normal post-trip Tavg settle (≈7 °C over ~90 s) read ≈ −200 °C/hr
      // and fired COOLDOWN RATE HI on every reactor trip; at 600 s it reads ≈ −39
      // (quiet), while a genuine F7-scale blowdown still crosses −55.6 within
      // ~40 s — crossing time scales inversely with severity, which is the right
      // shape for a rate alarm. Not in SOURCE, so it draws no PRNG number and the
      // cross-step noise stream is unchanged (the appended-instrument rule).
      tavg_rate:         { lag: 0,   noise: 0,     range: [-300, 300], rate_tau: 600, derived: true },
      // ------------------------------------------------ OTΔT / OPΔT channels (#311)
      // The loop-ΔT protection set. All five are DERIVED from indicated `thot`,
      // `tcold`, `tavg` and `primary_pressure`, so each inherits those channels' lag
      // and any failure injected on them — the same construction as subcooling_margin,
      // for the same HR1 reason. A drifting Tavg transmitter moves the COMPUTED
      // SETPOINT here exactly as it does in a real protection rack, which is the
      // teaching point #220 established on P-9.
      //
      // Not in SOURCE, so none of them draws a PRNG number and the cross-step noise
      // stream is byte-identical to before they existed (the appended-instrument rule).
      // What they DO inherit is the noise on thot and tcold — and ΔT is a DIFFERENCE
      // of two noisy channels, so its sigma is ~√2× either one. MEASURED at steady
      // hot full power over 3 seeds × 30 min: mean 100.00 %, σ 0.72 %, peak 102.6 %.
      // That noise band is the floor under any setpoint here and it is why the
      // %-of-rated normalization is the useful one — see `otdt_opdt` below.
      loop_delta_t:      { lag: 0,   noise: 0,     range: [-20, 250], derived: true },   // indicated Thot−Tcold, % of ΔT rated
      otdt_setpoint:     { lag: 0,   noise: 0,     range: [-400, 1500], derived: true }, // computed OTΔT trip line, % of ΔT rated
      opdt_setpoint:     { lag: 0,   noise: 0,     range: [-400, 1500], derived: true }, // computed OPΔT trip line, % of ΔT rated
      // The TRIP CHANNELS: setpoint − ΔT. Trip low at 0, rod stop low at the sourced
      // 3 % offset. Range is symmetric and wide enough that neither the trip setpoint
      // (0) nor the rod stop (3) can sit on a clamp — `run_reachability` Part A
      // requires every threshold STRICTLY inside its instrument's range, and Part B
      // requires the channel to actually get there.
      otdt_margin:       { lag: 0,   noise: 0,     range: [-500, 1500], derived: true },
      opdt_margin:       { lag: 0,   noise: 0,     range: [-500, 1500], derived: true },
      // ADV position (#371). APPENDED LAST and noise: 0, both deliberately — the
      // instrument PRNG is one continuous cross-step stream, so a single extra
      // draw shifts every downstream reading from that step on (the sg_steam_flow
      // comment above names three marginal endpoints that moved for exactly one).
      // Appending keeps the draw order of everything already here. noise_failure
      // sized like containment_sump_level's 1.0 on the identical [0, 100] span
      // (#387 — it shipped without one, so a `noisy` failure was silently inert).
      adv_valve:         { lag: 0.3, noise: 0, noise_failure: 1.0, range: [0, 100] },
      porv_indicator:    { boolean: true },
      status: ['rps_scrammed', 'rcp_running',
               // RCPs stopped by an operator lineup decision, not by a trip/
               // coastdown/blackout; and the declared plant MODE (1–6). Both feed
               // alarm condition processing (#240) — see the `reclassify` rules in
               // pwr_control.js. Status passthroughs, so neither draws a PRNG
               // number and the instrument noise stream is unchanged.
               'rcp_secured', 'plant_mode',
               'hpi_active', 'station_blackout',
               'steam_demand_low', 'rod_at_limit', 'sr_energized', 'msiv_open', 'sg_safety_open',
               // Rod bottom (#75) — read by the RPS-reset permissive in pwr_control.js, so
               // the board can say whether a reset will be accepted before it is attempted.
               'rods_fully_in',
               // P-9 permissive (≥50 % power) that gates the high-high SG (P-14) reactor
               // trip — read as a condition by the p14_reactor_trip trip.
               'above_p9',
               // Turbine trip status — read by the P-9 reactor trip on turbine trip
               // (see pwr_control.js). A STATUS passthrough, so it draws no PRNG
               // number and cannot shift the instrument noise stream.
               'turbine_tripped',
               // Reactor/turbine load imbalance > 4 % of rated — the SG filling/draining
               // annunciator (#211). Computed from INDICATED power in load_mode.js.
               'sg_imbalance_active',
               // §8.8 synoptic status — system-active booleans the diagram animates from (HR1)
               'afw_active', 'afw_pump_running', 'afw_block_open', 'rhr_active', 'rhr_valve_open', 'accumulators_discharging',
               // SI accumulator discharge isolation valve position (#273) — what the
               // `accum_aligned` annunciator is gated on. Position, not flow: by the time
               // `accumulators_discharging` goes true the tanks are already emptying.
               'accum_valve_open',
               'condenser_cooling_available', 'safety_relief_active', 'rcp_cavitating',
               // condensate pump run status (operator-controlled; gates main feedwater)
               'condensate_pump_running',
               // MAIN FEEDWATER ISOLATION VALVE POSITION (#247) — shut/open. A real
               // plant indicates MFIV position from limit switches in the control room
               // (Westinghouse: a feedwater isolation signal "causes automatic closure
               // of all feed regulating and bypass valves… and main feedwater isolation
               // valves" and overrides the SG level control system — WTSM 11.1 §11.1.4,
               // ML11223A293). The three-element feed channel stands down on THIS, not
               // on true state: it used to read `true_state.feedwater_isolated`, a field
               // getTrueState() never exposed, so the stand-down could never fire.
               // Status passthrough — no lag/noise, no PRNG draw.
               'mfw_isolated',
               // RCS boron grab sample (take_boron_sample): last lab RESULT (ppm,
               // null before the first sample), lab-pending flag, and a result
               // sequence counter consumers use to spot a fresh result. Passed
               // through as status (no PRNG draw — the noise stream must not shift).
               'boron_sample', 'boron_sample_pending', 'boron_sample_seq',
               // #386 stage 2: containment active-train DELIVERY status (demand is
               // control-surface state, these are what the trains are doing). The
               // fan-realign actuation keys on hpi_active (already above); these two
               // feed the annunciators. Status passthroughs — no PRNG draw.
               'ctmt_spray_active', 'ctmt_fan_active'],
    },

    // ---------------------------------------------------------- named init states
    // Target setpoints for the engine's initial-state builder (M1 §10).
    // rod_op_pct = control-group operating position (% withdrawn, contract
    // convention: 100 = fully out). Per-state so the starting rod position tracks
    // the starting power: at 50 % the control bank sits visibly deeper than at
    // full power (the balance of the trim is boron, re-solved per state). Falls
    // back to rods.control_op_position_pct when omitted.
    // ------------------------------------------ nuclear instrumentation scaling
    // Detector currents/counts are proportional to normalized power P (1.0 = rated).
    //   SR:  cps  = k_sr · P  → HZP source equilibrium (P = 1e-6) reads ~500 cps;
    //        full scale 1e6 cps at ~0.2 % power (secure the SR before then).
    //   IR:  amps = k_ir · P  → full scale 1e-3 A at ~12 % power ("maxes out ~10 %");
    //        the P-6 threshold 1e-10 A ≈ 1.2e-8 normalized power.
    nis: {
      k_sr: 5.0e8,                 // cps per unit normalized power [tune]
      k_ir: 8.333e-3,              // amps per unit normalized power [tune]
    },

    // ------------------------------------------------- optional protective functions
    // Switches for protective functions whose PRESENCE is a live design question, so the
    // answer is a flag rather than a fork. See the block comment in pwr_control.js.
    protection_options: {
      // Reactor Trip on Turbine Trip above P-9 (~50 % power) — prototypical Westinghouse.
      // It was absent here for historical reasons that did not survive audit, and was
      // ADOPTED 2026-07-26 (#216, commit 2fb0b78): this plant now scrams on a turbine trip
      // above P-9. TR-1/TR-8 and the `pwr_msiv` mission moved with it — content following
      // the plant under HR9, not a regression.
      //
      // The comment here used to say "Default OFF preserves today's behaviour", which stayed
      // put when the value was flipped and then read as documentation that the plant does NOT
      // carry this trip. It does. A turbine trip at power scrams; a load rejection does not,
      // and a planned offline (`disconnect_grid`, #230) is not a turbine trip at all.
      // Documented in Manuals 09 §2.0, 06 PWR-A22 and 07 PWR-E03.
      turbine_trip_reactor_trip: true,
      // ---- Overtemperature ΔT / Overpower ΔT reactor trips (#311) — DEFAULT OFF ----
      // Two of the four Westinghouse reactor trips, absent from this plant until now.
      // The owner RULED them in, in reduced form *(OWNER RULING, 2026-08-02: "311: a.")*
      // — no axial-offset (ΔI) term, because a one-node core cannot produce an honest
      // axial offset and synthesizing one would be a fabricated instrument (HR1/HR9).
      //
      // SHIPPED OFF, and that is not the ruling being ignored — it is the #216 pattern
      // the comment above describes: built default-OFF first so the blast radius could
      // be MEASURED by flipping one flag rather than guessed at. Two of the constants
      // below (K1, K4) could not be SOURCED in the session that built this — nrc.gov
      // and every mirror are blocked by this environment's egress policy, so
      // ML11223A301 could not be fetched and the evidence-pass SOP could not run. They
      // are fitted to THIS plant's measured behaviour instead, which is defensible on
      // its own terms (see below) but is not the same thing as sourced.
      //
      // ON as of 2026-08-03 *(OWNER RULING, 2026-08-03: "Let's go with your recommendations
      // for all these items", approving "turn it on, after the board wiring")*. Three things
      // changed since it was written off:
      //   1. THE EVIDENCE PASS RAN. ML11223A301 was fetched and read (#311 comment). It
      //      settles the EQUATION FORM, T' = 584.7 °F, P' = 2235 psig, the 3 % rod stop and
      //      "No Interlocks". It does NOT contain K1-K6 or the tau's — they are "manually
      //      adjusted preset" plant Tech Spec values and Table 12.2-1 lists both setpoints as
      //      "Variable (calculated)". So the comment above that says turning this on waits on
      //      "the document" was waiting for something the document never had.
      //   2. THE OBSERVABILITY GAP IS CLOSED. `bdDtMargin` puts the binding margin on the
      //      board (NIS card corner). Before that, flipping this gave the player two reactor
      //      trips and a rod-withdrawal block driven by a number nowhere on the diagram.
      //   3. #314 LANDED FIRST, deliberately, so `pwr_lof` is already re-authored around the
      //      RCP breaker trip — which catches that casualty at 23.0 s against OPΔT's 24.5 s,
      //      so this flip does not re-break the mission. The trips stay UNSOURCED in their
      //      intercepts and that is recorded in `otdt_opdt` below, not hidden by the flag.
      otdt_opdt_trips: true,
    },

    // ------------------------------------------- OTΔT / OPΔT setpoint equations (#311)
    // The REDUCED FORM ruled on 2026-08-02. Setpoints are in % OF RATED ΔT, computed
    // from INDICATED Tavg and pressure (HR1) and compared against INDICATED loop ΔT.
    //
    //   OTΔT_sp[%] = 100 · dnb_margin_factor · ΔT_DNB(Tavg, P) / ΔT₀
    //   OPΔT_sp[%] = 100 · ( K4 − K6·max(0, Tavg − T″) )
    //
    // OTΔT IS A SCALED COPY OF THIS PLANT'S OWN DNB SURFACE, and that construction is
    // the whole design — read this before touching it, because the obvious alternative
    // is what was built first and it was WRONG.
    //
    // `pwr_thermal.hFcEffective` collapses heat transfer when hot-leg subcooling falls
    // to `thermal.dnb_margin_c`, and Thot = Tavg + ΔT/2, so the DNB-limiting ΔT is
    // exactly, in closed form:
    //     ΔT_DNB = 2·( T_sat(P) − dnb_margin_c − Tavg )
    // The trip line is that surface multiplied by a margin factor < 1 — conceptually
    // what DNBR margin does to a real plant's limit line. Because it SCALES the surface
    // rather than re-anchoring it, both compensation gradients follow from the factor:
    //     K2 = f·2/ΔT₀             = 0.0364 /°C  = 0.0202 /°F
    //     K3 = f·2·(dT_sat/dP)/ΔT₀ = 0.1946 /MPa = 0.001342 /psi
    // and both land INSIDE the ranges real Westinghouse units publish (K2 0.015–0.028
    // /°F, K3 0.00079–0.00143 /psi). That is corroboration, not sourcing — but it is
    // the strongest evidence available here that the shape is right, and it is not
    // something the construction was fitted to produce.
    //
    // THE FIRST CUT ROTATED THE LINE INSTEAD OF SCALING IT, and it nuisance-tripped the
    // plant's defining behaviour. It took the DNB surface's SLOPE (K2 = 2/ΔT₀ = 0.0606
    // /°C, the unscaled gradient) and paired it with a fitted intercept of 1.20 — a line
    // with boiling-onset steepness through a point far below boiling onset. MEASURED: a
    // full load rejection raises Tavg ~16 °C, which at that slope drops the trip line by
    // 97 points, from 120 % to 23 %, against a ΔT of ~46 %. The plant SCRAMMED at 55.0 s
    // on `otdt_margin low` — a plant that is built to ride a rejection out, whose steam
    // dump was resized to 40 % specifically to make that ride-out teachable (TR-1/TR-1g,
    // owner ruling 2026-07-31). Scaling instead of rotating fixes it because the line
    // and the plant's actual DNB margin then move together, which is what a limit line
    // is supposed to do. The unscaled gradients were also 1.5–2× steeper than any
    // published real value; that was the tell, and it was visible before the measurement.
    //
    // WHAT IS MEASURED AND WHAT IS NOT. `dnb_margin_factor` and K4 are the fitted, and
    // therefore UNSOURCED, half — in a real plant these embed DNBR margin and instrument
    // uncertainty, which is why the real K1 (1.117–1.31) sits far below the physical
    // boiling point. This plant's raw DNB-onset intercept, measured, is 1.97–2.18, so a
    // limit taken from boiling onset alone would be no protection at all. The numbers
    // came from MEASUREMENT of this plant's own separation instead (HR12; full survey in
    // Diagnostic/TUNING_LOG.md 2026-08-03a), indicated loop ΔT as % of rated:
    //
    //   steady hot full power, 3 seeds × 30 min      max 102.6   (mean 100.00, σ 0.72)
    //   load ramps 3 %/min and 5 %/min, both ways    max 102.6
    //   50 → 100 % INSTANTANEOUS load step           max 104.5   (power overshoots 103.3 %)
    //   ── the gap ──
    //   steam line break 15 %  (sustained 107.8 %)   peak 111.1  ← NO TRIP TODAY
    //   continuous rod withdrawal at HFP (~17 s)     peak 114.8  ← NO TRIP TODAY
    //   steam line break 30 %  (sustained 114.2 %)   peak 117.8  ← NO TRIP TODAY
    //
    // Any setpoint in 105–111 separates normal operation from every un-tripped casualty.
    // K4 = 1.08 sits in the middle of that window with 3.5 % below and 3.1 % above — and
    // 1.08 is ALSO the prototypical Westinghouse OPΔT intercept, which is again
    // corroboration and not sourcing: the number was chosen from the measurement and
    // then found to agree, not the other way round. `dnb_margin_factor` 0.60 puts OTΔT
    // at 119.8 % of rated ΔT at nominal T and P — above OPΔT, preserving the real
    // ordering (real units run K1 1.117–1.31 against K4 1.08–1.089), and just above the
    // 120 % power-range trip, which is correct for a plant whose DNB line is measured at
    // ~2× rated ΔT: OTΔT is not meant to bind at nominal. It binds when Tavg climbs or
    // pressure falls — exactly the condition no single-parameter trip sees.
    //
    // DECLARED DEPARTURES (DESIGN_COMPANION §8.23):
    //   · no f(ΔI) axial-offset term — the ruling;
    //   · no lead-lag on (Tavg − T′) and no rate term on OPΔT. The real equations carry
    //     (1+τ₁s)/(1+τ₂s) and τ₃s/(1+τ₃s). This used to say the τ values "are in
    //     ML11223A301, which could not be fetched"; the document HAS been read since
    //     (2026-08-03) and it is wrong on both halves. The τ's are NAMED AND NEVER
    //     VALUED there — they are plant Tech Spec / COLR numbers — so the departure is
    //     PERMANENT unless a plant-specific source turns up, not a pending fetch. An
    //     INVENTED time constant on a protection channel is still worse than a declared
    //     absence, so the compensation stays static. The cost is that OTΔT does not
    //     ANTICIPATE a fast Tavg ramp — it responds to one.
    //     WHAT THE PRIMARY DOES SETTLE, and it decided #315 §6: BOTH compensations are
    //     on TAVG — "the lead-lag controller for Tavg dynamic compensation" and "the
    //     rate-lag controller for Tavg dynamic compensation". NOTHING compensates the
    //     measured ΔT, and the document carries no RTD, thermowell or transport-lag
    //     term at all: it calls loop ΔT "a measure of reactor power" and reads it
    //     directly. That is why the leg split is driven by total core heat rather than
    //     by the lagging fuel→coolant flux (see pwr_thermal.js stepCoolant).
    //   · one channel, not 2/4 — consistent with every other protection function here
    //     (same reasoning as the low-flow trip's recorded departure).
    otdt_opdt: {
      // T″ is NOT a constant: it is the plant's own full-power Tavg, computed at init
      // (`_tavg_fp`, the same anchor the pressurizer level program uses) and handed to
      // the instrument model in extras. Measured 304.1 °C (579.3 °F). OTΔT needs no
      // such anchor — it reads the DNB surface directly, so its T′/P′ dependence is
      // the T_sat correlation rather than a stored operating point.
      dnb_margin_factor: 0.60,     // fraction of the plant's own DNB-limiting ΔT — UNVERIFIED, fitted (see above)
      K4: 1.08,                    // OPΔT intercept — UNVERIFIED, fitted; agrees with the prototypical 1.08
      K6_per_c: 0.00138 * 9 / 5,   // OPΔT Tavg penalty above T″, per °C — UNVERIFIED (real units publish 0.00138/°F)
      // Rod stop / turbine runback offset below the trip line. SOURCED — this one is,
      // and from the issue's own evidence: WTSM 8.1 §8.1.7.3 (ML11223A252) lists
      // *"OTΔT rod stop and runback, 2/4, loop ΔT > (OTΔT trip setpoint − 3 %)"* and
      // the same for OPΔT. The same section is why the stop blocks WITHDRAWAL ONLY:
      // *"These interlocks or rod stops only prevent outward rod motion. The rods can
      // always be inserted into the core using either manual or automatic rod control."*
      rod_stop_offset_pct: 3.0,
    },

    initial_states: {
      hot_full_power: { power: 1.0,  scrammed: false, rod_op_pct: 92.0 },
      hot_zero_power: { power: 1e-6, scrammed: false, subcritical: true, rod_op_pct: 0.0,
        at_operating_temp: true, sr_on: true },   // Hot standby: NOP T/P, control bank fully inserted, SR energized
      // Low-power Mode 1, At Power: critical at ~6 % — just above the 5 % Startup/
      // At-Power boundary (manual 05 §2: Mode 1 is > 5 %, Mode 2 is ≤ 5 %), the
      // "just entered the power range" anchor for low-power practice.
      '5_percent':    { power: 0.06, scrammed: false, rod_op_pct: 62.0 },
      '50_percent':   { power: 0.5,  scrammed: false, rod_op_pct: 78.0 },
      // Mode 5, Cold Shutdown: subcritical, RCS cold (~50 °C) and depressurized
      // (~2.5 MPa, below the 400 psi RHR interlock), RHR in service holding the
      // cold sink, RCPs secured (RHR provides forced circulation), pressurizer
      // bubble at the cold setpoint, SR energized, ~0 decay heat (long-shut core).
      // The Mode 5↔1 heatup/cooldown path is driven from here (see _buildState).
      cold_shutdown:  { power: 1e-6, scrammed: false, subcritical: true, cold: true,
        rod_op_pct: 0.0, sr_on: true, rcp_off: true,
        // cold_pzr_level 60 → 30 with the derived-level rework: an IC level implies a
        // mass surplus (level = floor 28 + 100·(mass−1)); 30 % ⇒ mass 1.02, inside both
        // the 1.2 tank cap and the m5 suite's ≤105 % cold-init sanity bound.
        cold_tavg_c: 50.0, cold_pressure_mpa: 2.5, cold_pzr_level: 30.0 },
    },
  };

  RD.PWR_CONFIG = PWR_CONFIG;

})(globalThis.RD || (globalThis.RD = {}));
