/*
 * bwr_config.js — BWR engine configuration (M3, HR3/HR8).
 *
 * All BWR parameters as a structured data object: the [tune] physics
 * coefficients, the operating points, the instrument set, and the named initial
 * states. The protection/alarm/failure definitions (also data) live in
 * bwr_protection.js and are attached onto BWR_CONFIG.protection there.
 *
 * SI throughout (CONTEXT §11): pressure MPa, temperature °C, level/power %, void
 * a 0–1 fraction, flows normalized to rated (steam/feedwater/injection) or % of
 * rated (recirc demand). Values marked [tune] are starting points arbitrated by
 * the §18 scenario suite; un-marked values are fixed.
 *
 * Global-namespace module: attaches RD.BWR_CONFIG.
 */
;(function (RD) {
  'use strict';

  // ---- Six-group delayed-neutron parameters (U-235; fixed, do not change) ----
  var DELAYED = {
    beta_i:   [0.000215, 0.001424, 0.001274, 0.002568, 0.000748, 0.000273],
    lambda_i: [0.0124,   0.0305,   0.111,    0.301,    1.14,     3.01],
    beta: 0.006502,
    Lambda: 0.00005,            // BWR prompt generation time — shortest of the three; fixed
  };

  var BWR_CONFIG = {
    plant_id: 'bwr',
    rated_mwt: 3293,
    mwe_rated: 1100,             // MWe (for set_turbine_load mwe → steam fraction)

    // ---------------------------------------------------------------- kinetics
    kinetics: {
      delayed: DELAYED,
      // Decay heat: two-term exponential — the source that drives Fukushima after
      // scram. Getting its hours-scale magnitude roughly right is part of the
      // uncovery timeline.
      decay: { H1_0: 0.05, H2_0: 0.02, lambda_1: 0.0005, lambda_2: 0.00002 }, // s^-1 [tune]
      xenon: {
        gamma_I: 0.061, gamma_X: 0.003,
        lambda_I: 2.87e-5, lambda_X: 2.09e-5,   // s^-1 (fixed)
        sigma_phi: 2.0e-5,                        // s^-1 [tune]
        xenon_worth: 0.025,                       // [tune]
      },
    },

    // ----------------------------------------------------------- reactivity fb
    // No MTC, no boron, no graphite. The void feedback is NEGATIVE (the opposite
    // of the RBMK) — the basis of stable flow control. References (Tf_ref,
    // void_ref) are pinned at the operating point at reset (M1 D2 / Flag F1
    // pattern), and rho_excess is trimmed to criticality (no boron).
    reactivity: {
      alpha_D: -2.0e-5,            // Doppler, K^-1 [tune]
      alpha_void: -0.15,           // void coefficient (negative — stabilizing) [tune]
      void_ref: 0.40,              // reference operating void [tune] (pinned at reset)
      rod_worth_total: 0.10,       // control-group worth [tune]
      rod_worth_shutdown: 0.10,    // shutdown-group worth (margin) [tune]
    },

    // ------------------------------------------------------------- vessel (§6)
    vessel: {
      steam_gen_per_power_bwr: 1.0,
      // MPa-rate per imbalance [tune]. Kept modest so decay-heat steam pressurizes
      // slowly enough that ADS can actually depressurize against it (with K=2.5 the
      // decay steam outran ADS and pinned pressure at the relief setpoint).
      K_vessel_pressure: 0.5,
      vessel_p_rated: 7.03,        // MPa operating
      relief_setpoint_mpa: 7.58,   // relief/safety valves open
      relief_gain: 5.0,            // relief vent gain [tune]
      P_ambient: 0.103,            // MPa
      void_scale_factor: 0.45,     // rated power at rated flow → ~45% void [tune]
      void_response_tau_bwr: 1.5,  // s [tune]
      void_collapse_coeff: 0.145,  // per MPa — turbine-trip void collapse (§7.3) [tune]
      K_vessel_level: 5.0,         // [tune]
      latent_heat_bwr: 1.0, vessel_water_mass: 7.0,  // boiloff = H_total/(latent·mass) [tune]
      vessel_level_nominal: 50.0,  // % at full power / SBO start
      // Core-uncovery heat-transfer collapse (§6.4–6.5): below uncover_level the
      // fuel→coolant coupling fades, so decay heat accumulates and fuel heats
      // toward damage. Floor keeps it ~0 when fully uncovered.
      uncover_level_pct: 20.0, h_fc_uncover_floor: 0.00005,
      heat_gen_coeff_bwr: 15.0, h_fc_bwr: 0.05,  // → ~586 °C fuel at rated [tune]
      fuel_damage_c: 1200.0, fuel_melt_c: 2800.0, // fixed
    },

    // ------------------------------------------------- recirculation (§7)
    recirc: {
      jet_pump_m_ratio: 1.5,       // core flow ≈ (1+m)·drive = 2.5× drive [tune]
      tau_recirc: 8.0,             // s — drive-flow ramp toward setpoint (pump inertia) [tune]
      tau_coastdown: 6.0,          // s — recirc pump coastdown [tune]
      natural_circ_coeff: 0.30,    // √P natural circulation [tune]
      natural_circ_max: 40.0,      // % cap on natural circ
      recirc_op_setpoint_pct: 40.0, // full-power drive setpoint → core flow ~100%
    },

    // ----------------------------------------------------- safety systems (§9)
    safety: {
      rcic_flow_normalized: 0.01, rcic_steam_consumption: 0.002, pressure_sensitivity: 1.0,
      rcic_min_pressure: 0.69, rcic_start_level: 50.0,      // [tune]
      hpci_flow_normalized: 0.03, hpci_min_pressure: 0.69, hpci_start_level: 30.0, // [tune]
      // ADS blows the vessel down fast (multiple SRVs wide open). Must out-vent the
      // decay-heat steam even near the LPCI threshold, so the characteristic time is
      // short [tune] (the spec's 600 s stalls above 1.03 MPa against decay steam).
      ads_depressurization_tau: 120.0, ads_level: 15.0,     // ADS auto at level<15 (gated hpci_unavailable)
      lpci_threshold_pressure: 1.03, lpci_flow_normalized: 0.05, // [tune]
      battery_duration_hours: 8.0, battery_low_pct: 20.0,   // [tune]
      BATTERY_MAX_DEGRADE: 0.75,   // early_battery_failure max duration cut
      SRV_BLOWDOWN_COEFF: 0.5, SRV_INVENTORY_RATE: 0.02,    // stuck-relief blowdown [tune]
    },

    // ------------------------------------------------------------------ rods
    rods: {
      max_steps: 228,
      speeds: { slow: 0.133, normal: 0.800, fast: 1.200 },
      scram_time_control_s: 3.0,   // fast hydraulic scram [tune]
      scram_time_shutdown_s: 3.0,
      control_op_position_pct: 65.0, // control group operating position (% withdrawn)
    },

    // -------------------------------------------------- §13.1 physics-fail [tune]
    physics_failures: {
      DEFAULT_DRIFT_RATE: 0.5,
      DEFAULT_NOISE_SCALE: 5.0,
    },

    // ----------------------------------------------------------- instrument set
    // id → { measures, lag (s), noise sigma, range[min,max] }. Status booleans
    // carry no lag/noise.
    instruments: {
      power_range:        { lag: 0.1, noise: 0.2,   range: [0, 120] },
      vessel_pressure:    { lag: 0.5, noise: 0.014, range: [0, 10.3] },
      vessel_level:       { lag: 2.0, noise: 0.5,   range: [0, 100] },
      recirc_flow:        { lag: 1.0, noise: 1.0,   range: [0, 120] },
      steam_flow:         { lag: 1.0, noise: 0.01,  range: [0, 1.2] },
      fw_flow:            { lag: 1.0, noise: 0.01,  range: [0, 1.2] },
      core_void_fraction: { lag: 1.0, noise: 0.01,  range: [0, 1.0] },
      rcic_status:        { boolean: true },
      status: ['rps_scrammed', 'station_blackout', 'battery_pct', 'ads_open', 'hpci_unavailable'],
    },

    // ---------------------------------------------------------- named init states
    initial_states: {
      full_power:    { power: 1.0, scrammed: false },
      post_scram_sbo:{ power: 1e-6, scrammed: true, station_blackout: true, rcic_running: true },
    },
  };

  RD.BWR_CONFIG = BWR_CONFIG;

})(globalThis.RD || (globalThis.RD = {}));
