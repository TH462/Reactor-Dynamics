/* pwr2_condenser.js — Layer 5: THE MAIN CONDENSER. (#479)
 *
 * The steam dump's destination, and the reason it can be taken away. `pwr2_relief.js` currently
 * takes `condenser_available` as a DRIVER — a boolean somebody hands it — so a loss of vacuum
 * cannot drive this plant onto the relief ladder the way it drives a real one. This computes the
 * vacuum instead, so that availability becomes a consequence rather than an assertion.
 *
 * It also unlocks four instrument channels (D4 §30.1): `condenser_vacuum`, `cw_inlet_temp`,
 * `condensate_flow`, `fw_flow` — the joint-largest block of the twenty-four still blocked.
 *
 * ---------------------------------------------------------------------------------------
 * SOURCED, all Ginna UFSAR ch10 §10.4.3 (ML20339A040) — this plant's anchor:
 *
 *   *"Each condenser has a heat transfer area of 125,000 ft2 of 1-in. O.D. No. 22 BWG type 316
 *   stainless steel tubes. The tubes are 40 ft long… The condensers are designed for a circulating
 *   water temperature of 50F with an approximate 24.5F temperature rise… The condensers contain a
 *   total of 24,004 tubes."*
 *
 *   TWO SHELLS, so 250,000 ft2 at Ginna's 1775 MWt. Power-scaled to this plant's 300 MWt that is
 *   42,254 ft2 — the POWER basis, because a condenser is sized to reject heat and heat rejection
 *   is a power quantity. (`run_pwr2_bases.js` pins which system uses which basis and why; this is
 *   the same reasoning ECCS and RHR use.)
 *
 *   C-9 INTERLOCK, from the same corpus: the permissive needs *"two of two condenser vacuum
 *   switches… shut (< 5 in. Hg backpressure)"*, and *"if backpressure in the condenser increases
 *   to 7.6 in. Hg, then the C-9 interlock is removed."* Both are REPORTED here, never enforced —
 *   an interlock is a control-layer actuation on an instrument (HR5).
 *
 * ---------------------------------------------------------------------------------------
 * THE MODEL
 *
 *     T_cw_out   = T_cw_in + Q / (m_cw * cp)      circulating water carries the heat away
 *     T_cond     = T_cw_out + Q / UA               the gap the exchanger needs to pass Q
 *     P_cond     = P_sat(T_cond)                   SATURATION sets the vacuum
 *     vacuum     = P_atm - P_cond
 *
 * ⚠ Q IS THE CYCLE'S REJECTED HEAT AND THE CALLER SUPPLIES IT. The first version computed it as
 * `steam_kgs * h_fg(P_cond)` and got 395 MW out of a 300 MWt plant -- because steam arriving at a
 * condenser has ALREADY done work in the turbine, and the feedwater heating that returns it to
 * h_feed happens downstream. The heat actually rejected is what the cycle did not convert,
 * Q_in * (1 - eta) = 200 MW, and the layer that knows both is the turbine. So this layer takes it
 * rather than deriving it, the same refusal every other pwr2 layer makes.
 *
 * **The vacuum is not a parameter; it is a saturation temperature.** That is the whole point of
 * building this rather than carrying a constant: a condenser fouls, loses circulating water, or is
 * handed warmer lake water, and the backpressure follows — which is what makes the C-9 permissive
 * something the player can lose rather than something the scenario asserts.
 *
 * ⚠ DECLARED SIMPLIFICATIONS:
 *   NO AIR IN-LEAKAGE OR EJECTOR MODEL. A real vacuum is held by air ejectors against in-leakage;
 *   losing them raises backpressure independently of the circulating water. This model has only
 *   the thermal path, so `air_binding_frac` is offered as a DRIVER — a caller can degrade the
 *   effective area — and the mechanism behind it is not modelled.
 *   NO HOTWELL LEVEL. The source describes 2.5 minutes of storage and a level control loop;
 *   condensate inventory is not tracked here.
 */
(function (root) {
  'use strict';

  var RD = root.RD && root.RD.pwr2;
  var W  = RD && RD.water;

  var FT2_PER_M2 = 10.7639;
  var IN_HG_PER_KPA = 0.2953;
  var P_ATM_KPA = 101.325;

  var COND = {
    /* [sourced] 125,000 ft2 per shell x 2 shells at Ginna's 1775 MWt */
    ginna_area_ft2:   250000,
    ginna_mwt:        1775,
    /* [sourced] design circulating water inlet and its rise across the condenser */
    cw_design_in_f:   50.0,
    cw_design_rise_f: 24.5,
    /* [sourced] C-9 permissive and its removal point, in inches of mercury ABSOLUTE backpressure */
    c9_permissive_in_hg: 5.0,
    c9_removed_in_hg:    7.6,
    /* [derived] this plant against the anchor, on the POWER basis — a condenser rejects heat */
    POWER_SCALE: 300 / 1775,
    /* NO TERMINAL-TEMPERATURE-DIFFERENCE CONSTANT. The first version carried a recalled 3 degC
     * TTD, and it was both unsourced AND redundant: the gap between condensing steam and the
     * circulating water outlet IS Q/UA, which the model already has. A fixed TTD would also have
     * made fouling inert, because the thing fouling degrades is exactly that gap. */
    /* [recalled] overall heat-transfer coefficient, W/m2K, for a clean stainless condenser tube.
     * ALSO NOT SOURCED. It and the area appear only as their product, so an error in either is
     * indistinguishable from an error in the other — which is why the DESIGN POINT below is
     * checked rather than the coefficient. */
    U_w_m2k: 2800,
    /* THE OPERATOR'S RANGE for the circulating-water inlet (#591 item 1 / #592). The heat sink
     * the site is given, not a switch on the board — exposed so the coupling is demonstrable.
     *
     * ⚠ THESE ARE THE SAME TWO NUMBERS THE RETIRED ENGINE CLIPPED TO, AND THAT IS NOT AN
     * INHERITED CONSTANT — it is a SOURCED ceiling under a standing owner directive, and a
     * first draft of this change widened the ceiling to 95 degF before checking, on the
     * argument that the player should be able to reach the C-9 removal point. Wrong: the
     * source bounds the water, not the lesson.
     *   CEILING 85 degF [sourced] — Ginna TS Bases B 3.7.8 (ML20339A221 Rev 101): service-water
     *   OPERABILITY requires the screenhouse bay at "Temperature <= 85F", and the accident
     *   analyses bound the supply verbatim at "maximum ... 85F".
     *   FLOOR 35 degF *(OWNER DIRECTIVE, 2026-08-08: "lets make the floor 35F since its probably
     *   warmed some by the time tit gets to the condenser")* — the analyses' own bound is 30 degF,
     *   below freezing; the intake-transit warm-up is the owner's judgment and is UNVERIFIED.
     *
     * MEASURED across that band at hot full power, 600 s, DT 0.02 (backpressure in inches of
     * mercury absolute, the form both sourced C-9 numbers are in):
     *
     *   35 degF (floor)   1.526 in Hg   96.16 kPa vacuum
     *   50 degF (design)  2.400         93.20
     *   76 degF           4.943         the last step with C-9 MET
     *   77 degF           5.075         C-9 PERMISSIVE LOST (sourced, 5.0 in Hg)
     *   85 degF (ceiling) 5.977         81.09
     *
     * SO THE BAND REACHES THE PERMISSIVE AND STOPS SHORT OF THE REMOVAL POINT (7.6 in Hg, which
     * this model crosses at 93 degF). That is the correct answer and `Manuals/03` §13.1 already
     * says so in prose: lake temperature ALONE cannot take the condenser away from you. Losing
     * it is an equipment casualty — the circulating-water pumps, air binding, fouling — and all
     * three are levers this module already carries.
     *
     * ⚠ ONE CONSUMER ONLY, unlike the retired plant. This raises the CONDENSER's sink and
     * nothing else: pwr2_rhr carries its own component-cooling temperature (`ccw_temp_c`,
     * 95 degF) and does not read this, so a cooldown floor does NOT move with it here. */
    cw_min_f: 35.0,
    cw_max_f: 85.0,
    src: 'Ginna UFSAR ch10 §10.4.3 (ML20339A040); C-9 from the same corpus'
  };

  function areaM2() { return COND.ginna_area_ft2 * COND.POWER_SCALE / FT2_PER_M2; }
  function f2c(f) { return (f - 32) * 5 / 9; }
  function dF2dC(d) { return d * 5 / 9; }

  /* CIRCULATING WATER FLOW IS DERIVED FROM THE SOURCED RISE, not chosen. At the design duty the
   * source says the water warms 24.5 degF, so m_cw = Q_design / (cp * dT) and nothing about the
   * flow is free. */
  function cwFlowKgs(rated_thermal_kW) {
    var dT = dF2dC(COND.cw_design_rise_f);
    var cp = 4.18;                                   /* kJ/kgK, cold water */
    /* The condenser rejects the cycle's REJECTED heat, not the reactor's output: what the turbine
     * did not convert. eta_cycle is the turbine's, so rejection is (1 - eta). */
    var eta = RD.turbine ? RD.turbine.etaCycle() : (1 / 3);
    return rated_thermal_kW * (1 - eta) / (cp * dT);
  }

  /* THE ONE AUTHORITY for the operator range (#591 item 1). The engine's command door calls
   * this rather than restating the bounds: a second copy of a clamp is how a control and its
   * caption come to disagree, which is the defect class #516 item 11 was. */
  function clampCwInlet(c) {
    if (c == null || !isFinite(c)) return null;
    return Math.max(f2c(COND.cw_min_f), Math.min(f2c(COND.cw_max_f), c));
  }

  function createCondenser(opts) {
    opts = opts || {};
    return {
      cw_inlet_c: opts.cw_inlet_c === undefined ? f2c(COND.cw_design_in_f) : opts.cw_inlet_c,
      cw_flow_kgs: opts.cw_flow_kgs === undefined ? null : opts.cw_flow_kgs,
      fouling: opts.fouling === undefined ? 0 : opts.fouling,
      rated_thermal_kW: opts.rated_thermal_kW === undefined ? 300000 : opts.rated_thermal_kW
    };
  }

  /* stepCondenser(cd, dt, drivers) -> the vacuum, and what it permits.
   *
   *   drivers.steam_kgs        steam arriving from the turbine exhaust AND the dump
   *   drivers.cw_pumps_running default TRUE; false removes the circulating water entirely
   *   drivers.air_binding_frac 0..1, an unmodelled-mechanism handle — see the header
   */
  function stepCondenser(cd, dt, drivers) {
    drivers = drivers || {};
    if (drivers.duty_kW === undefined) {
      throw new Error('pwr2_condenser: drivers.duty_kW is REQUIRED — the heat to reject belongs ' +
                      'to the CYCLE and is computed by the turbine that did the work. This layer ' +
                      'will not derive it from a steam flow that has already expanded.');
    }
    var cw = cd.cw_flow_kgs !== null ? cd.cw_flow_kgs : cwFlowKgs(cd.rated_thermal_kW);
    var running = drivers.cw_pumps_running === undefined ? true : !!drivers.cw_pumps_running;
    if (!running) cw = 0;

    /* Effective conductance: area degraded by fouling and by whatever `air_binding_frac` stands
     * in for. Both are fractions REMOVED, so 0 is a clean condenser. */
    var degrade = 1 - Math.min(1, Math.max(0, cd.fouling) +
                                  Math.max(0, Math.min(1, drivers.air_binding_frac || 0)));
    if (degrade < 0) degrade = 0;
    var UA_kW = COND.U_w_m2k * areaM2() * degrade / 1000;

    /* THE LATENT LOAD. Steam arrives saturated and leaves as saturated liquid, so each kg gives up
     * h_fg at the condenser pressure — which depends on the answer, so it is evaluated at the
     * PREVIOUS pressure and converges in one step at this dt. */
    var T_cw_out, T_cond, P_cond;
    var cp = 4.18;
    var Q = drivers.duty_kW;
    if (cw > 0 && UA_kW > 0 && Q > 0) {
      /* No iteration is needed: with Q given, both temperature rises are explicit. */
      T_cw_out = cd.cw_inlet_c + Q / (cw * cp);
      T_cond   = T_cw_out + Q / UA_kW;
      P_cond   = W.P_sat(T_cond);
    } else if (cw <= 0) {
      /* NO CIRCULATING WATER — and this arm is reached WHATEVER Q IS (#560). It used to be
       * `else if (Q > 0)`, with the no-heat case falling through to the arm below, which pins
       * the shell to the circulating-water temperature. That arm is right for "no steam, water
       * flowing" and catastrophically wrong for "no steam, NO water" — and #510 M-6's turbine
       * trip on `condenser.available` makes the second case reachable IN ONE STEP, so the
       * genuine 0 kPa signal existed for 0.02 s against a 5.0 s instrument lag and the
       * indication never moved.
       *
       * MEASURED before the fix, injecting loss_of_condenser_vacuum at hot full power: true
       * vacuum settled at 100.12 kPa = 29.57 inHg, which is 2.04 inHg BETTER than the healthy
       * plant's 93.20 kPa, permanently — the gauge said the opposite of the truth about the
       * system that had just failed. Both COND VAC annunciators (84.7 and 74.5 kPa) were
       * unreachable across a 17-ride battery. Scope is wider than the menu row: a loss of
       * offsite power and a station blackout drop the circulating water too.
       *
       * With no water there is nothing removing heat, so the shell walks toward the turbine
       * exhaust condition whether or not steam is arriving this instant — a condenser without
       * cooling does not recover its vacuum by having nothing to condense. */
      T_cond = cd.cw_inlet_c + 90;
      P_cond = W.P_sat(T_cond);
      T_cw_out = cd.cw_inlet_c;
    } else {
      /* No heat to reject, water still flowing: the shell sits at the circulating water
       * temperature. Reachable now only with `cw > 0`, which is the case this arm describes. */
      T_cw_out = cd.cw_inlet_c;
      T_cond   = cd.cw_inlet_c;
      P_cond   = W.P_sat(T_cond);
    }

    var P_cond_kPa = P_cond * 1000;
    var vacuum_kPa = P_ATM_KPA - P_cond_kPa;
    if (vacuum_kPa < 0) vacuum_kPa = 0;
    var backpressure_in_hg = P_cond_kPa * IN_HG_PER_KPA;

    return {
      /* the indication the contract names */
      condenser_vacuum_kpa: vacuum_kPa,
      cw_inlet_temp_c:      cd.cw_inlet_c,
      /* the physics behind it, reported so a player can see WHY the vacuum moved */
      backpressure_in_hg:   backpressure_in_hg,
      P_cond_mpa:           P_cond,
      T_cond_c:             T_cond,
      cw_outlet_c:          T_cw_out,
      cw_rise_c:            T_cw_out - cd.cw_inlet_c,
      cw_flow_kgs:          cw,
      duty_kW:              Q,
      /* ⚠ THE C-9 PERMISSIVE IS REPORTED, NEVER ENFORCED (HR5). This layer says whether the
       * condenser is in a state the interlock would accept; the control layer decides what to do
       * about it, and pwr2_relief.js takes availability as a driver precisely so that decision
       * stays where it belongs. */
      c9_permissive_met: backpressure_in_hg < COND.c9_permissive_in_hg,
      c9_removed:        backpressure_in_hg >= COND.c9_removed_in_hg,
      /* The honest availability signal a caller can hand to pwr2_relief.js. */
      available:         backpressure_in_hg < COND.c9_removed_in_hg && cw > 0
    };
  }

  root.RD = root.RD || {};
  root.RD.pwr2 = root.RD.pwr2 || {};
  root.RD.pwr2.condenser = {
    COND: COND, areaM2: areaM2, cwFlowKgs: cwFlowKgs, clampCwInlet: clampCwInlet,
    createCondenser: createCondenser, stepCondenser: stepCondenser,
    P_ATM_KPA: P_ATM_KPA, IN_HG_PER_KPA: IN_HG_PER_KPA
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
