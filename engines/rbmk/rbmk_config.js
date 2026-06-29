/*
 * rbmk_config.js — RBMK engine configuration (M2 §4, §20; HR3/HR8).
 *
 * One config family for the RBMK, carried as a shared BASE plus two version
 * overrides (pre_chernobyl / post_chernobyl) merged by forVersion(). The two
 * versions differ in a handful of values AND in two functional mechanisms — the
 * void coefficient strength (§5.3) and the control-rod insertion behaviour
 * (§5.4, k_disp) — but those are still expressed as data here; the general code
 * in the kinetics/rods modules reads them (HR3).
 *
 * SI throughout (CONTEXT §11): pressure MPa, temperature °C, void a 0–1
 * fraction, flow % of rated, ORM in equivalent rods. Reactivity is Δk/k
 * fraction; energy deposition stays in cal/g/s (the one SI carve-out, §11).
 * Values marked [tune] are starting points arbitrated by the §19 scenario suite.
 *
 * Global-namespace module: attaches RD.RBMK_CONFIG. Works as an ordered <script>
 * in the browser and via require() in Node (both share globalThis).
 */
;(function (RD) {
  'use strict';

  // ---- Six-group delayed-neutron parameters (U-235; fixed, do not change) ----
  // Identical groups to the other engines; the RBMK differs only in Λ (§3).
  var DELAYED = {
    beta_i:   [0.000215, 0.001424, 0.001274, 0.002568, 0.000748, 0.000273],
    lambda_i: [0.0124,   0.0305,   0.111,    0.301,    1.14,     3.01],
    beta: 0.006502,
    Lambda: 0.0005,             // RBMK prompt generation time (graphite) — fixed, short
  };

  // ---- Shared base (everything common to both versions) ----
  var BASE = {
    plant_id: 'rbmk',
    rated_mwt: 3200,

    kinetics: {
      delayed: DELAYED,
      // Decay heat: two-term exponential, same form as the other engines (§3).
      decay: { H1_0: 0.05, H2_0: 0.02, lambda_1: 0.0005, lambda_2: 0.00002 }, // s^-1 [tune]
      // Xenon / iodine (§5.5). fixed γ/λ; sigma_phi & xenon_worth [tune].
      xenon: {
        gamma_I: 0.061, gamma_X: 0.003,
        lambda_I: 2.87e-5, lambda_X: 2.09e-5,   // s^-1 (fixed)
        sigma_phi: 2.0e-5,                        // s^-1 [tune]
        xenon_worth: 0.025,                       // [tune]
      },
    },

    // ----------------------------------------------------------- reactivity fb
    reactivity: {
      alpha_D: -3.0e-5,           // Doppler, K^-1 [tune] (stabilizes full-power maneuvering)
      alpha_graphite: 1.5e-4,     // slow, slightly POSITIVE graphite feedback, K^-1 [tune]
      // References (Tf_ref / Tg_ref) are pinned at the full-power operating temps
      // at reset so Doppler/graphite net to zero there and are purely perturbative
      // on a transient (M1 D2 / Flag F1 pattern). graphite_temp_ref below is the
      // literal §5.2 starting value, retained for reference but superseded by the
      // pinned operating Tg (see rbmk_engine._computeRefs).
      graphite_temp_ref: 500.0,   // °C [tune]
      void_ref: 0.30,             // reference operating void [tune]
      // ORM stability penalty (§5.3) — orm_rated is the full-rod ORM ceiling.
      orm_instability_gain: 1.5, orm_critical_gain: 0.8, orm_rated: 70.0, // [tune]
      // Control-rod geometry (§5.4). rod depth z runs 0 (withdrawn) .. full_depth.
      z_water_m: 1.25, L_abs_m: 7.0,          // [tune] water column / absorber length
      rod_full_depth_m: 8.25,                  // z_water_m + L_abs_m
    },

    // ------------------------------------------------------------- thermal (§8)
    thermal: {
      mcp_spinup_tau: 5.0, mcp_coastdown_tau: 10.0,         // s [tune]
      void_scale_rbmk: 0.35, void_response_tau: 1.0,         // [tune] (void catches the spike)
      steam_gen_per_power: 1.0,
      K_drum_pressure: 0.0207, drum_p_rated: 7.0, drum_relief_mpa: 8.0,  // MPa [tune]
      relief_gain: 2.0,                                       // relief vent gain [tune]
      K_drum_level: 4.0, drum_level_nominal: 50.0,           // [tune]
      graphite_heat_frac: 0.05, h_graphite_coolant: 0.01, graphite_heat_capacity: 20.0, // [tune]
      h_fc_rbmk: 0.04, heat_gen_coeff_rbmk: 11.2,            // [tune] → ~565 °C fuel at rated
      dryout_void: 0.85, dryout_flow_pct: 30.0, dryout_h_fc_factor: 0.1, // §8.6
    },

    // -------------------------------------------------- destruction paths (§11)
    destruction: {
      melt_threshold_c: 2800.0,            // fixed — thermal-melt path
      steam_explosion_threshold: 280.0,    // cal/g/s [tune] — prompt path
      // Co-tuned with the threshold so the pre excursion crosses the steam-
      // explosion line a step BEFORE fuel reaches melt (the §19 requirement that
      // pre destroys by steam_explosion, not thermal_melt). Raised from the §11
      // starting 0.42 — see BUILD_DECISIONS M2 D-notes.
      energy_deposition_scale: 4.0,        // [tune]
      ema_tau: 0.5,                        // s — energy-deposition EMA window
    },

    // ------------------------------------------------------------------ rods
    rods: {
      max_steps: 228, total_rod_count: 211,
      // steps/s; same selectable speeds as the PWR.
      speeds: { slow: 0.133, normal: 0.8, fast: 1.2 },
      // Rod groups. INTERNAL convention (M2 §9/§14.1): steps = INSERTION depth
      // (0 = fully withdrawn, max = fully inserted) — the OPPOSITE of the PWR.
      // The contract position_pct (100 = withdrawn) is derived on the way out.
      // rod_count scales each group's total reactivity (lumped equivalent rods);
      // worth_pcm feeds the ORM rod-equivalent ratio (control/manual only).
      groups: [
        { id: 'control_rods',  name: 'Control Rods',  function: 'control',  rod_count: 1.0, worth_pcm: 8000, displacer: true },
        { id: 'shutdown_rods', name: 'Emergency Protection (AZ)', function: 'shutdown', rod_count: 0.2, worth_pcm: 0, displacer: false },
      ],
    },

    // -------------------------------------------------- §14.1 physics-fail [tune]
    physics_failures: {
      STUCK_ROD_MAX_FRAC: 0.4,       // fraction of control/manual rods stalled
      ROD_RUNAWAY_RATE_MAX: 6.0,     // steps/s of withdrawal
      PARTIAL_MCP_MAX_LOSS: 0.75,    // fraction of MCP speed lost at severity 1
      RUPTURE_VOID_RATE: 0.05,       // /s void rise at full break
      RUPTURE_LEVEL_RATE: 8.0,       // %/s drum-level fall
      RUPTURE_FLOW_RATE: 15.0,       // %/s channel-flow fall
      DEFAULT_DRIFT_RATE: 0.5,       // instrument drift units/s
      DEFAULT_NOISE_SCALE: 5.0,      // noisy-mode sigma multiplier
    },

    // ----------------------------------------------------------- instrument set
    // id → { measures, lag (s), noise sigma (instrument units), range[min,max] }.
    // orm_display is COMPUTED (no lag/noise) and routed through a failure override
    // (§13). Status booleans carry no lag/noise.
    instruments: {
      power_range:    { lag: 0.5, noise: 0.5,   range: [0, 120] },
      steam_pressure: { lag: 0.5, noise: 0.014, range: [0, 10.3] },
      drum_level:     { lag: 2.0, noise: 0.5,   range: [0, 100] },
      channel_flow:   { lag: 1.0, noise: 1.0,   range: [0, 120] },
      void_fraction:  { lag: 1.0, noise: 0.01,  range: [0, 1.0] },
      fuel_temp:      { lag: 4.0, noise: 5.0,   range: [0, 2000] },
      orm_display:    { lag: 0.0, noise: 0.0,   range: [0, 211], computed: true },
      status: ['rps_scrammed', 'eps_bypassed', 'orm_alarm_active'],
    },

    // ---------------------------------------------------------- named init states
    // power normalized (1.0 = rated). orm_target sets the control-group insertion
    // (ORM ≈ orm_target). flow_pct = channel flow setpoint. xenon_factor = X/X_eq.
    initial_states: {
      full_power:     { power: 1.0,  orm_target: 70.0, flow_pct: 100.0, xenon_factor: 1.0 },
      low_power_xenon:{ power: 0.07, orm_target: 7.5,  flow_pct: 60.0,  xenon_factor: 1.35 },
    },
  };

  // ---- Version overrides (deep-merged onto BASE) ----
  var PRE = {
    design_version: 'pre_chernobyl',
    kinetics: { MAX_PROMPT_GROWTH: 80.0 },                  // violent excursion allowed
    reactivity: {
      alpha_void_base: 0.0025,                               // positive; stable at full power,
                                                             // amplified into runaway at accident conditions
      alpha_void_low_power_gain: 2.5, alpha_void_xenon_gain: 0.8, alpha_void_high_void_gain: 1.2,
      orm_min: 15.0,                                         // pre minimum (violated at the accident)
      k_disp: 0.05,     // graphite displacer → positive scram effect [tune]
                        // (peak−start Δρ ≈ k_disp·0.34 must clear β by enough to spike
                        //  power hard while ORM is still low — before the rods exit the
                        //  water column and the displacer fades)
      k_abs:  0.085,    // absorber worth gradient [tune]
    },
    rods: { scram_time_s: 18.0 },                            // slow magnetic jack
  };
  var POST = {
    design_version: 'post_chernobyl',
    kinetics: { MAX_PROMPT_GROWTH: 5.0 },                   // kept numerically tame
    reactivity: {
      alpha_void_base: 0.001,                                // reduced, still positive
      alpha_void_low_power_gain: 0.8, alpha_void_xenon_gain: 0.3, alpha_void_high_void_gain: 0.4,
      orm_min: 43.0,                                         // raised, enforced
      k_disp: 0.0,      // NO positive region — monotonic-negative insertion
      k_abs:  0.085,
    },
    rods: { scram_time_s: 12.0 },                            // improved drive
  };

  // ---- deep merge (objects only; arrays/scalars replace) ----
  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function merge(a, b) {
    var out = {}, k;
    for (k in a) out[k] = isObj(a[k]) ? merge(a[k], {}) : a[k];
    for (k in b) out[k] = (isObj(a[k]) && isObj(b[k])) ? merge(a[k], b[k]) : (isObj(b[k]) ? merge(b[k], {}) : b[k]);
    return out;
  }

  var RBMK_CONFIG = {
    base: BASE, pre: PRE, post: POST,
    forVersion: function (version) {
      var over = (version === 'post_chernobyl') ? POST : PRE;
      var cfg = merge(BASE, over);
      cfg.design_version = over.design_version;
      // Protection is attached per-version by rbmk_protection.js.
      cfg.protection = RD.RBMK_PROTECTION ? RD.RBMK_PROTECTION.forVersion(over.design_version) : null;
      return cfg;
    },
  };

  RD.RBMK_CONFIG = RBMK_CONFIG;

})(globalThis.RD || (globalThis.RD = {}));
