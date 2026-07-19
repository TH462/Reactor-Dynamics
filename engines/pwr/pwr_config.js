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
 * points arbitrated by the §14 scenario suite; un-marked values are fixed.
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

    // ---------------------------------------------------------------- kinetics
    kinetics: {
      delayed: DELAYED,
      // Constant neutron source (normalized power/s): gives the subcritical core
      // its 1/M multiplication — P_eq = source·Λ/(−ρ) — so the approach to
      // criticality is VISIBLE (power and SUR respond to every rod step) instead
      // of silent until prompt-critical. Sized so the hot_zero_power margin
      // (−1000 pcm) equilibrates at exactly the state's P0 = 1e-6. [tune]
      source: 1.0e-6,
      // Decay heat: two-term exponential, initialized at scram (→ ~7% of rated).
      decay: {
        H1_0: 0.05, H2_0: 0.02,            // components at scram
        lambda_1: 0.0005, lambda_2: 0.00002, // s^-1 [tune]
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
      alpha_D: -2.5e-5,            // Doppler, K^-1 [tune]
      alpha_MTC: -3.3e-5,          // moderator temperature coeff, K^-1 [tune]
      boron_worth_per_ppm: 1.0e-4, // [tune]
      rod_worth_total: 0.085,      // total control-group worth (~8500 pcm) [tune]
      rod_worth_shutdown: 0.10,    // shutdown-group worth (shutdown margin) [tune]
      // Core excess reactivity, held down by boron/rods/xenon at the operating
      // point. The reference temps (T_fuel_ref/T_coolant_ref) are set at init to
      // the settled hot_full_power temps, so the Doppler/MTC feedbacks are zero
      // there and purely perturbative+stabilizing on a transient (M1 §4); boron
      // is then trimmed to make the net reactivity critical.
      rho_excess: 0.10,            // [tune]
      // Chemical & Volume Control System (CVCS). Boron chemistry is decoupled from
      // net charging−letdown: borate/dilute change concentration at boron_adjust_rate
      // (needs the charging pump). Charging/letdown control primary INVENTORY; auto
      // mode makes up identified leakage by modulating charging up to charging_max.
      boron_adjust_rate: 2.0,      // ppm/s while borating/diluting [tune]
      cvcs_makeup_gain: 3.0,       // auto-charging response to an inventory deficit [tune]
      cvcs_charge_per_level: 0.006,// AUTO make-up: charging above letdown per % PZR-level deficit [tune]
      charging_max: 0.06,          // max charging flow, normalized (normal makeup band) [tune]
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
      letdown_orifice_a_coeff: 0.00822,   // ≈ 0.030 normalized at NOP
      letdown_orifice_b_coeff: 0.01096,   // ≈ 0.040 normalized at NOP
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
      coolant_heat_capacity: 20.0, // sets the coolant thermal time constant [tune]
      // RCP heat: the pumps' shaft work ends up in the coolant (~15–20 MW for a
      // 4-loop plant ≈ 0.55 % of rated core heat), scaled by flow. Matters at
      // no-load (heats the plant with the heat sink isolated) and post-trip. [tune]
      pump_heat_frac: 0.0055,      // fraction of rated core heat at full flow
      delta_T_rated: 33.0,         // hot/cold leg split at rated, °C [tune]
      flow_floor: 0.1,             // delta_T saturates: max(flow_frac, 0.1)
      // DNB / core-exit boiling (steam-line-break / loss-of-flow AT POWER). The hot
      // leg (core exit) is the DNB datum: subcooled liquid cannot superheat, so thot
      // is clamped at Tsat and the raw enthalpy rise beyond saturation drives core
      // boiling instead of more sensible temperature. Heat transfer collapses to
      // h_fc_dnb once the exit margin to saturation falls to dnb_margin_c (real DNB
      // — DNBR<1.3 — occurs subcooled, before bulk boiling). Distinct regime from the
      // inventory-driven void (post-scram, primary.void_gain); combined by max, so
      // neither perturbs the other. All [tune] — the at-power scenarios arbitrate.
      dnb_margin_c: 8.0,           // hot-leg subcooling (°C) at which DNB begins [tune]
      void_flux_gain: 0.02,        // equilibrium core void per °C of exit overshoot [tune]
      void_flux_max: 0.8,          // ceiling on flux-driven void fraction [tune]
      void_flux_tau: 3.0,          // s — flux void grows/recovers with this tau [tune]
      fuel_damage_c: 1200.0,       // cladding failure (fixed)
      fuel_melt_c: 2800.0,         // melt (fixed)
      // Break blowdown flash-cooling (pwr_thermal.stepCoolant). Coolant leaving a primary
      // break (s.leak_flow) carries enthalpy, and the remaining inventory flashes to replace
      // it — removing latent heat as the break vents. Modeled as a self-limiting perfect-mixing
      // pull of Tavg toward blowdown_sink_c (containment saturation) at the break throughput
      // rate, scaled by blowdown_gain (same dimensionless form as the ECCS cold-injection
      // quench). This makes the saturation plateau RESPOND to break size, which is the physical
      // small-vs-large discriminator: a SMALL break — decay heat dominates the weak cooling, so
      // Tavg holds the hot plateau and Psat(tavg) pins RCS pressure well above 600 psi (the TMI
      // inventory/void lesson); a LARGE break — this term dominates decay heat, Tavg falls toward
      // containment, and Psat(tavg) (and thus pressure, via the two-phase sat-pull) drops through
      // the ECCS/accumulator band. Keyed on leak_flow ONLY — a stuck-open PORV/safety vents the
      // steam space (K_porv_relief) and leaves leak_flow=0, so the flagship TMI path is untouched.
      // Tuned so ≤8 % SGTR holds the plateau (>600 psi) while the 20 % large-LOCA default crosses
      // below the 4.14 MPa accumulator setpoint. [tune]
      blowdown_gain: 0.02,         // dimensionless scale on the break flash-cooling mixing term [tune]
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
      // Pressure-balance gains (MPa-rate units) [tune].
      // PORV/safety relief gains are large: the valves vent the pressurizer STEAM
      // space, so a small mass flow has a big pressure effect — which is why the
      // inventory-loss gain (porv_flow_max) and the pressure gain are decoupled.
      K_heater: 0.55, K_spray: 1.7, K_porv_relief: 300.0, K_safety_relief: 300.0,
      spray_floor_band: 3.0,       // MPa — spray authority tapers to 0 across this band above Psat(tcold) (P6)
      K_surge: 1.0, P_restore_rate_gain: 0.02, // gentle stabilization only (heater regulates)
      // When the primary voids it is two-phase: pressure is pulled to the
      // saturation pressure of Tavg (so subcooling → 0). [tune]
      K_sat_pull: 1.5,
      // Break blowdown: a primary break (LOCA/SGTR, s.leak_flow) vents the coolant
      // to containment and depressurizes the RCS — unlike CVCS letdown, which is a
      // controlled inventory bleed at pressure. This is what pushes a LARGE break
      // below saturation (voiding → sat-pull takes over) and into the ECCS/accumulator
      // band; a small PORV break floors higher (TMI). Zero when no break. [tune]
      K_leak_depressurize: 10.0,
      // PORV: auto-open 16.20 MPa (2350 psia), command-close 15.86 MPa (2300 psia).
      porv_open_mpa: 16.20, porv_close_mpa: 15.86,
      porv_flow_max: 0.0035,       // normalized inventory loss (slow, TMI-realistic) [tune]
      // Spring safety valves: mechanical open 17.13 MPa (2485), reseat 16.55 (2400).
      safety_open_mpa: 17.13, safety_reseat_mpa: 16.55,
      safety_flow_max: 0.10,       // [tune]
      P_containment: 0.103,        // MPa backpressure [tune]
      P_flow_ref: 15.41,           // reference ΔP for relief-flow sqrt scaling, MPa
      // Pressurizer level (the TMI deception).
      K_thermal_surge: 2.0, K_void_surge: 40.0,    // thermal out-surge on cooldown; was 12 — too aggressive on rod maneuvers [tune]
      level_loss_per_flow: 8.0, K_level: 1.0,    // [tune]
      // CVCS net make-up (charging − letdown) authority over indicated PZR level: a
      // slow insurge/outsurge that lets charging hold level over an evolution. Kept
      // small so it never competes with the fast void_surge (the TMI deception, where
      // charging is isolated anyway) — bounded by charging_max/letdown ≈ 0.07. [tune]
      K_cvcs_level: 6.0,
      pzr_level_nominal: 55.0,     // % at hot_full_power
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
      // Uncovery thresholds (fraction of full inventory).
      void_onset: 0.85, core_top_uncover: 0.70, significant_uncover: 0.50,
      pump_spinup_tau: 3.0, pump_coastdown_tau: 8.0, // s [tune]
      natural_circ_flow: 0.0,      // v1 does not model PWR natural circ [tune]
      low_flow_trip: 0.25,         // true-flow trip (documented HR1 exception)
      mass_max: 1.2,               // clip ceiling for primary_mass
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
      latent_heat_secondary: 19.45, // normalizes steam_generation_rate to ~1.0 at rated [tune]
      K_sg_level: 5.0, K_steam_pressure: 2.0, // [tune]
      steam_p_rated: 5.65,         // MPa secondary operating pressure [tune]
      steam_flow_rated: 1.0,       // [tune]
      sg_level_nominal: 65.0,      // % at hot_full_power
      feed_pump_tau: 8.0,          // s — feed-pump speed→flow inertia (set_feed_pump_speed) [tune]
      // SG code safety valves — upstream of the MSIV, above the 8.90 no-load
      // dump setpoint: the backstop when the SG is bottled (MSIV shut). [tune]
      sg_safety_open_mpa: 9.31,    // pop
      sg_safety_reseat_mpa: 9.0,   // reseat
      sg_safety_flow_max: 1.2,     // normalized relief capacity at full lift
      afw_flow_frac: 0.15,         // AFW capacity, normalized to rated feed [tune]
      afw_start_level: 20.0,       // % — M4 auto-start setpoint (pwr_control actuation reads the instrument)
      afw_level_target: 20.0,      // % — built-in proportional level hold: full flow below this... [tune]
      afw_level_band: 8.0,         // % — ...tapering to zero across this band above it [tune]
      // B2 steam dump / turbine bypass (auto opens above setpoint, to condenser).
      // The setpoint is the NO-LOAD secondary pressure (Tsat ≈ no-load Tavg
      // ~303 °C): with no steam draw the secondary saturates up to it and the
      // dump holds it there, so hot standby holds its own temperature — the real
      // PWR steam-dump-in-pressure-mode behavior. On a turbine trip the pressure
      // rise above the setpoint opens the dump proportionally across the band.
      steam_dump_setpoint: 8.90, steam_dump_band: 0.25, steam_dump_max: 0.5, // [tune]
    },

    // ------------------------------------------------------ turbine / condenser
    turbine: {
      torque_per_flow: 1.0, torque_per_load: 1.0,
      turbine_inertia: 50.0,       // coasts slowly [tune]
      rpm_rated: 1800.0, rpm_overspeed_trip: 1980.0,
      sync_tau: 0.5,               // s grid pull-in to rated speed when synced
      vacuum_rated: 96.5, vacuum_lost: 16.9,   // kPa [tune]
      vacuum_restore_tau: 10.0, vacuum_decay_tau: 30.0, // s [tune]
      vacuum_trip_kpa: 74.5,       // turbine trip setpoint (actuated by the control layer)
      mwe_rated: 1000.0,           // MWe [tune]
      // Turbine governor / control valve: EHC load-control mode — the valve
      // TARGET is pressure-compensated (demand ÷ P/P_rated, clamped fully open)
      // so steady-state delivered steam equals the load demand at any secondary
      // pressure; the position itself strokes with a first-order lag and
      // modulates steam flow together with SG pressure. [tune]
      governor_tau: 2.0,           // s valve response time constant
    },

    // ----------------------------------------------------------- emergency cool
    emergency: {
      // Merged HPI/LPI emergency injection — ONE system, one command (set_hpi),
      // a two-segment pump curve (pwr_primary.injectionFlowInv):
      //   high-head/low-flow segment  — hpi_flow_max (inventory-frac/s at 0 MPa),
      //                                 shutoff head hpi_pressure_ref;
      //   low-head/high-flow segment  — lpi_flow_max × lpi_inventory_gain
      //                                 (inventory-frac/s at 0 MPa), shutoff
      //                                 head lpi_pressure_ref.
      // s.hpi_flow_normalized = delivered / combined rated (0–1). [tune]
      hpi_flow_max: 0.06,          // high-head segment, inventory-frac/s [tune]
      hpi_pressure_ref: 16.44,     // MPa; high-head flow → 0 as P approaches this [tune]
      lpi_pressure_ref: 4.5,       // MPa low-head shutoff head
      lpi_flow_max: 1.0,           // normalized rated low-head flow
      lpi_inventory_gain: 0.10,    // inventory frac/s per unit normalized low-head flow
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
      accumulator_inventory_gain: 0.12, // inventory frac/s per unit normalized flow
      accumulator_capacity: 2.5,   // total deliverable inventory fractions (finite)
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
      eccs_cooling_gain: 0.08,     // dimensionless scale on the cold-injection mixing term [tune]
      // Residual Heat Removal (RHR, formerly DHR): the low-pressure shutdown-cooling
      // loop that doubles as LPI. Suction is taken from the HOT LEG through a valve
      // interlocked to primary pressure — it can be opened only below
      // rhr_valve_interlock_mpa (400 psi) and AUTO-CLOSES if pressure climbs back
      // above it (the Westinghouse RHR autoclosure interlock). Aligned = suction
      // valve open (rhr_active). It recirculates coolant hot leg → HX → cold leg
      // (no net inventory change — the LPI/RHR pump moves RCS water, not RWST
      // make-up), removing heat toward rhr_sink_c. Cooldown rate is throttled by the
      // HX flow split (set_rhr_hx): the operator routes more/less of the constant
      // loop flow through the heat exchanger vs. the bypass. Dormant at power. [tune]
      rhr_valve_interlock_mpa: 2.76, // MPa (400 psi) — hot-leg suction valve open-permissive & autoclosure interlock
      rhr_sink_c: 50.0,            // °C cooldown sink target
      rhr_gain: 0.03,              // heat-removal gain at full HX flow (Q per °C above sink)
    },

    // ------------------------------------------------------------------ rods
    rods: {
      max_steps: 228,
      // Selectable speeds (steps/s): slow 8/min, normal 48/min, fast 72/min.
      speeds: { slow: 0.133, normal: 0.800, fast: 1.200 },
      scram_time_control_s: 2.5,   // full-travel insertion time [tune]
      scram_time_shutdown_s: 2.0,  // slightly faster (pre-loaded) [tune]
      control_op_position_pct: 92.0, // control group operating position (% withdrawn)
      // Power-dependent insertion limit for the control group (% withdrawn floor).
      insertion_limit_pct: 30.0,
    },

    // -------------------------------------------------- §9.1 physics-fail [tune]
    physics_failures: {
      ROD_RUNAWAY_RATE_MAX: 6.0,   // steps/s
      STUCK_ROD_MAX_FRAC: 0.4,     // fraction of rod_worth_total
      STEAM_BREAK_RATE: 1.5,       // MPa/s at full break size
      DEFAULT_DRIFT_RATE: 0.5,     // instrument drift units/s
      DEFAULT_NOISE_SCALE: 5.0,    // noisy-mode sigma multiplier
    },

    // ----------------------------------------------------------- instrument set
    // id → { measures, lag (s), noise sigma (instrument units), range[min,max] }.
    // Status booleans (no lag/noise) are listed under `status`.
    instruments: {
      // power_range top-of-range must exceed the 120% trip setpoint: a reading
      // pegged at exactly the setpoint never satisfies a strict crossed() compare,
      // so the high-flux trip could never fire (same fix as the RBMK meter).
      power_range:       { lag: 0.1, noise: 0.2,   range: [0, 200] },
      tavg:              { lag: 4.0, noise: 0.2,   range: [232, 343] },
      thot:              { lag: 4.0, noise: 0.2,   range: [232, 343] },
      tcold:             { lag: 4.0, noise: 0.2,   range: [232, 343] },
      primary_pressure:  { lag: 0.5, noise: 0.014, range: [0, 20.7] },
      pzr_level:         { lag: 2.0, noise: 0.5,   range: [0, 100] },
      sg_level:          { lag: 3.0, noise: 0.5,   range: [0, 100] },
      steam_flow:        { lag: 1.0, noise: 0.01,  range: [0, 1.2] },
      fw_flow:           { lag: 1.0, noise: 0.01,  range: [0, 1.2] },
      mwe_output:        { lag: 0.2, noise: 1.0,   range: [0, 1300] },
      turbine_rpm:       { lag: 0.5, noise: 2.0,   range: [0, 2000] },
      condenser_vacuum:  { lag: 5.0, noise: 0.34,  range: [0, 102] },
      // §8.8 synoptic additions — CVCS flows, SG pressure, chemistry, governor, ECCS
      // (LPI/accumulator), and Animation-HR1 helpers (steam dump, primary leak).
      // Sources track TRUE sim quantities, not command setpoints (see pwr_instruments SOURCE).
      charging_flow:     { lag: 2.0, noise: 0.001, range: [0, 0.12] },   // true CVCS charging (≠ setpoint under AUTO)
      letdown_flow:      { lag: 2.0, noise: 0.001, range: [0, 0.12] },   // true CVCS letdown
      steam_pressure:    { lag: 0.5, noise: 0.02,  range: [0, 10.5] },   // SG secondary pressure, MPa (top of range = no-load saturation + margin)
      boron_analyzer:    { lag: 45,  noise: 4.0,   range: [0, 2500] },   // chemistry sample — slow (Realistic-only boron readout)
      governor_valve:    { lag: 0.3, noise: 0.3,   range: [0, 100] },    // turbine admission valve %
      hpi_flow:          { lag: 1.0, noise: 0.005, range: [0, 1.2] },    // merged HPI/LPI injection line, normalized to combined rated (renamed in place from lpi_flow — PRNG order preserved)
      accumulator_flow:  { lag: 0.5, noise: 0.005, range: [0, 1.2] },    // passive accumulator injection, normalized
      steam_dump_valve:  { lag: 0.3, noise: 0.3,   range: [0, 100] },    // turbine bypass valve % (Animation HR1)
      primary_leak_flow: { lag: 0.2, noise: 0.002, range: [0, 1.0] },    // LOCA/SGTR break flow, normalized (Animation HR1)
      startup_rate:      { lag: 2.0, noise: 0.02,  range: [-5, 10] },    // SUR (dpm) — startup-range rate meter; feeds the rod-withdrawal interlock
      porv_tailpipe_temp:{ lag: 10.0, noise: 1.5,  range: [0, 250] },    // PORV discharge/quench-tank line temperature — the unalarmed indication that reveals a stuck-open PORV (TMI-2)
      // Nuclear instrumentation (startup ranges) — LOG-scale detectors (lag +
      // noise act per decade; noise sigma in decades). Appended to SOURCE last.
      source_range:      { lag: 0.5, noise: 0.02,  range: [1, 1e6],     log: true },   // proportional counter, counts/s; de-energized reads the range floor
      intermediate_range:{ lag: 0.5, noise: 0.02,  range: [1e-11, 2e-3], log: true },  // compensated ion chamber, AMPS — calibrated band tops out ~1e-3 A (≈12 % power, "maxes out around 10 %"); physical over-range to 2e-3 so the high-flux trip (1.67e-3 ≈ 20 %) is reachable
      // porv_indicator (boolean) and subcooling_margin (derived) handled specially.
      subcooling_margin: { lag: 0,   noise: 0,     range: [-28, 83], derived: true },
      porv_indicator:    { boolean: true },
      status: ['rps_scrammed', 'rcp_running', 'hpi_active', 'station_blackout',
               'steam_demand_low', 'rod_at_limit', 'sr_energized', 'msiv_open', 'sg_safety_open',
               // P-9 permissive (≥50 % power) that gates the high-high SG (P-14) reactor
               // trip — read as a condition by the p14_reactor_trip trip.
               'above_p9',
               // §8.8 synoptic status — system-active booleans the diagram animates from (HR1)
               'afw_active', 'afw_pump_running', 'rhr_active', 'rhr_valve_open', 'accumulators_discharging',
               'condenser_cooling_available', 'safety_relief_active', 'rcp_cavitating'],
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
        cold_tavg_c: 50.0, cold_pressure_mpa: 2.5, cold_pzr_level: 60.0 },
    },
  };

  RD.PWR_CONFIG = PWR_CONFIG;

})(globalThis.RD || (globalThis.RD = {}));
