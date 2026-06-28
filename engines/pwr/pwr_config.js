/*
 * pwr_config.js — PWR engine configuration (M1, HR3/HR8).
 *
 * All PWR parameters as a structured data object: the [tune] physics
 * coefficients, the operating points, the instrument set, and the named
 * initial states. The protection/alarm/failure definitions (also data) live
 * in pwr_protection.js and are attached onto PWR_CONFIG.protection here.
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
      boron_rate: 5.0,             // ppm/s per unit (charging-letdown) [tune]
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
      delta_T_rated: 33.0,         // hot/cold leg split at rated, °C [tune]
      flow_floor: 0.1,             // delta_T saturates: max(flow_frac, 0.1)
      fuel_damage_c: 1200.0,       // cladding failure (fixed)
      fuel_melt_c: 2800.0,         // melt (fixed)
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
      K_surge: 1.0, P_restore_rate_gain: 0.02, // gentle stabilization only (heater regulates)
      // When the primary voids it is two-phase: pressure is pulled to the
      // saturation pressure of Tavg (so subcooling → 0). [tune]
      K_sat_pull: 1.5,
      // PORV: auto-open 16.20 MPa (2350 psia), command-close 15.86 MPa (2300 psia).
      porv_open_mpa: 16.20, porv_close_mpa: 15.86,
      porv_flow_max: 0.0035,       // normalized inventory loss (slow, TMI-realistic) [tune]
      // Spring safety valves: mechanical open 17.13 MPa (2485), reseat 16.55 (2400).
      safety_open_mpa: 17.13, safety_reseat_mpa: 16.55,
      safety_flow_max: 0.10,       // [tune]
      P_containment: 0.103,        // MPa backpressure [tune]
      P_flow_ref: 15.41,           // reference ΔP for relief-flow sqrt scaling, MPa
      // Pressurizer level (the TMI deception).
      K_thermal_surge: 12.0, K_void_surge: 40.0, // strong: pzr level rises as voiding begins [tune]
      level_loss_per_flow: 8.0, K_level: 1.0,    // [tune]
      pzr_level_nominal: 55.0,     // % at hot_full_power
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
    },

    // ------------------------------------------------- steam generator / second
    steam_generator: {
      latent_heat_secondary: 19.45, // normalizes steam_generation_rate to ~1.0 at rated [tune]
      K_sg_level: 5.0, K_steam_pressure: 2.0, // [tune]
      steam_p_rated: 5.65,         // MPa secondary operating pressure [tune]
      steam_flow_rated: 1.0,       // [tune]
      sg_level_nominal: 65.0,      // % at hot_full_power
      afw_flow_frac: 0.15, afw_start_level: 20.0, // % [tune]
    },

    // ------------------------------------------------------ turbine / condenser
    turbine: {
      torque_per_flow: 1.0, torque_per_load: 1.0,
      turbine_inertia: 50.0,       // coasts slowly [tune]
      rpm_rated: 1800.0, rpm_overspeed_trip: 1980.0,
      vacuum_rated: 96.5, vacuum_lost: 16.9,   // kPa [tune]
      vacuum_restore_tau: 10.0, vacuum_decay_tau: 30.0, // s [tune]
      vacuum_trip_kpa: 74.5,       // turbine trips below this
      mwe_rated: 1000.0,           // MWe [tune]
    },

    // ----------------------------------------------------------- emergency cool
    emergency: {
      hpi_flow_max: 0.06,          // normalized, falls as pressure rises [tune]
      hpi_pressure_ref: 16.44,     // MPa; HPI flow → 0 as P approaches this [tune]
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
      power_range:       { lag: 0.1, noise: 0.2,   range: [0, 120] },
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
      // porv_indicator (boolean) and subcooling_margin (derived) handled specially.
      subcooling_margin: { lag: 0,   noise: 0,     range: [-28, 83], derived: true },
      porv_indicator:    { boolean: true },
      status: ['rps_scrammed', 'rcp_running', 'hpi_active', 'station_blackout',
               'steam_demand_low', 'rod_at_limit'],
    },

    // ---------------------------------------------------------- named init states
    // Target setpoints for the engine's initial-state builder (M1 §10).
    initial_states: {
      hot_full_power: { power: 1.0, scrammed: false },
      hot_zero_power: { power: 1e-6, scrammed: false, subcritical: true },
      '50_percent':   { power: 0.5, scrammed: false },
    },
  };

  RD.PWR_CONFIG = PWR_CONFIG;

})(globalThis.RD || (globalThis.RD = {}));
