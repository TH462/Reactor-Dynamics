/*
 * pwr_primary.js — primary coolant inventory and voiding, reactor coolant pumps
 * and flow coastdown, and high-pressure injection (M1 §6.5–6.6, §6.9). Pure
 * functions over engine state `s` and config `cfg`.
 *
 * Inventory is tracked as a fraction (1.0 = full) in s._mass and mirrored to the
 * contract field s.core_inventory_pct (0–120 %).
 *
 * Attaches RD.pwrPrimary.
 */
;(function (RD) {
  'use strict';

  function clip(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }
  function T_sat(P) { return 179.47 * Math.pow(Math.max(P, 1e-6), 0.239); }

  // Loop pressure distribution (M1 §6.5; loop-pressure rework 2026-07). The RCS is
  // incompressible liquid outside the pressurizer bubble, so there is ONE dynamic
  // pressure state (s.pressure_mpa, the pressurizer/hot-leg reference) plus a
  // QUASI-STATIC ΔP field: pump head vs. friction, both ∝ flow_frac² (form loss),
  // collapsing to a single pressure when the RCPs coast down. Writes the three node
  // pressures onto s each step; the systems tied into the loop read the node they
  // physically connect to (cold leg = ECCS/accumulators/letdown; hot leg = RHR
  // suction; suction = RCP cavitation). Called by the engine after stepPressure and
  // by _buildState so getTrueState is valid before the first step. NOT a new dynamic
  // state — pure algebra over pressure_mpa and flow_frac (no integration, no stiffness).
  function computeNodePressures(s, cfg) {
    var pr = cfg.primary;
    var ff2 = s.flow_frac * s.flow_frac;
    s.p_hotleg = s.pressure_mpa;                                    // surge line taps the hot leg
    s.p_pumpsuction = Math.max(0, s.pressure_mpa - pr.loop_dp_sg_rated * ff2);   // between SG and RCP (lowest); floored at 0 — absolute pressure, and cavitation already floors into T_sat's guard
    s.p_coldleg = s.pressure_mpa + pr.loop_dp_core_rated * ff2;     // RCP→RX pump discharge (highest)
  }

  // RCP cavitation (loop-pressure rework 2026-07). The pump suction is the
  // lowest-pressure node and sees cold-leg-temperature water, so it reaches
  // saturation first as the loop voids/depressurizes. suction_subcool_c =
  // Tsat(p_pumpsuction) − tcold is the NPSH-like margin; when it falls to
  // cavitation_onset_c the running pump begins to cavitate (severity ramps to
  // full over cavitation_band_c more), losing head/flow — the mechanical bite
  // applied in stepFlow. A stopped pump does not cavitate. Kept separate from the
  // bulk subcooling_margin instrument (the TMI deception). Called after
  // computeNodePressures; uses this step's p_pumpsuction and tcold.
  function stepCavitation(s, cfg) {
    var pr = cfg.primary;
    var psuc = (s.p_pumpsuction != null) ? s.p_pumpsuction : s.pressure_mpa;
    s.suction_subcool_c = T_sat(psuc) - (s.tcold_c != null ? s.tcold_c : s.tavg_c);
    var cav = 0;
    if (s.pump_running) {
      cav = clip((pr.cavitation_onset_c - s.suction_subcool_c) / pr.cavitation_band_c, 0, 1);
    }
    s.rcp_cavitation_frac = cav;
    s.rcp_cavitating = cav > (pr.cavitation_indicate_frac != null ? pr.cavitation_indicate_frac : 0.05);
  }

  // Emergency injection — ONE merged HPI/LPI system (one command, one flag,
  // one pump curve): a high-head/low-flow segment (shutoff 16.44 MPa — the
  // classic HPI charging-pump head) plus a low-head/high-flow segment (shutoff
  // 4.5 MPa — the LPI/RHR-pump head). Flow rises as pressure falls: at TMI
  // pressures only the high-head segment is in play (numerically identical to
  // the old standalone HPI — the flagship is untouched); in a large LOCA the
  // low-head segment dominates. degraded_hpi scales the whole curve.
  // Returns inventory-fraction/s for the mass balance; the exposed
  // s.hpi_flow_normalized is this over the combined rated total.
  function injectionFlowInv(s, cfg) {
    if (!s.hpi_active) return 0;
    var e = cfg.emergency;
    // ECCS discharges into the COLD leg (pump discharge), so injection works against
    // the cold-leg node — higher than the pressurizer reference at power, converging
    // on it as the RCPs coast down (when a LOCA has usually tripped them).
    var p_inj = (s.p_coldleg != null) ? s.p_coldleg : s.pressure_mpa;
    var q_hh = e.hpi_flow_max * clip((e.hpi_pressure_ref - p_inj) / e.hpi_pressure_ref, 0, 1);
    var q_lh = e.lpi_flow_max * e.lpi_inventory_gain * clip((e.lpi_pressure_ref - p_inj) / e.lpi_pressure_ref, 0, 1);
    return (q_hh + q_lh) * (s.hpi_flow_multiplier != null ? s.hpi_flow_multiplier : 1.0);
  }
  function injectionRatedInv(cfg) {
    var e = cfg.emergency;
    return e.hpi_flow_max + e.lpi_flow_max * e.lpi_inventory_gain;
  }

  // Passive accumulators: discharge into the cold leg once primary pressure drops
  // below the N2 cover pressure; finite borated capacity depletes as they inject
  // (accumulator_volume_pct → 0). Pressure-driven (the passive check valve), but ALSO
  // gated by the motor-operated discharge isolation valve in series with it: when the
  // operator has isolated the accumulators (accumulator_valve_open === false) nothing
  // flows at any pressure. That is how a normal cooldown depressurizes below the
  // check-valve setpoint without a spurious dump. Default aligned (valve open).
  function stepAccumulators(s, cfg, dt) {
    var e = cfg.emergency;
    var flow = 0;
    // Accumulators also discharge into the cold leg — pressure-driven off the cold-leg node.
    var aligned = (s.accumulator_valve_open !== false);   // isolation valve; default open
    var p_inj = (s.p_coldleg != null) ? s.p_coldleg : s.pressure_mpa;
    if (aligned && p_inj < e.accumulator_trip_mpa && s._accum_remaining > 1e-6) {
      var frac = clip((e.accumulator_trip_mpa - p_inj) / e.accumulator_trip_mpa, 0, 1);
      flow = e.accumulator_flow_max * frac;
      // Deplete finite capacity by the delivered inventory; do not overdraw the tank.
      var delivered = flow * e.accumulator_inventory_gain * dt;
      if (delivered > s._accum_remaining) { delivered = s._accum_remaining; flow = delivered / (e.accumulator_inventory_gain * dt); }
      s._accum_remaining = Math.max(0, s._accum_remaining - delivered);
    }
    s.accumulator_flow_normalized = flow;
    s.accumulators_discharging = flow > 1e-6;
    s.accumulator_volume_pct = clip(s._accum_remaining / e.accumulator_capacity * 100, 0, 100);
    return flow * e.accumulator_inventory_gain;   // inventory-fraction rate for the mass balance
  }

  // Two-orifice letdown flow: a pressure-driven bleed from the cold leg through
  // the in-service orifice(s) to the letdown HX / VCT. Each orifice passes
  // C·√(p_coldleg − backpressure); s.letdown_flow is the TRUE flow (what the
  // letdown_flow instrument reads), recomputed each step from the orifice lineup
  // and the current cold-leg pressure — so it tails off as RCS pressure falls
  // toward the backpressure on a cooldown, unlike the old commanded constant.
  function letdownFlow(s, cfg) {
    var rc = cfg.reactivity;
    var pd = (s.p_coldleg != null) ? s.p_coldleg : s.pressure_mpa;
    var sq = Math.sqrt(Math.max(0, pd - rc.letdown_backpressure_mpa));
    return (s.letdown_orifice_a ? rc.letdown_orifice_a_coeff : 0) * sq
         + (s.letdown_orifice_b ? rc.letdown_orifice_b_coeff : 0) * sq;
  }

  // Step 9 — primary inventory and voiding (CVCS charging/letdown + HPI/LPI/accumulator/SI − losses).
  function stepInventory(s, cfg, dt) {
    // Letdown first — the auto make-up law and the mass balance below both read it.
    s.letdown_flow = letdownFlow(s, cfg);
    var inj_inv = injectionFlowInv(s, cfg);
    s.hpi_flow_normalized = inj_inv / injectionRatedInv(cfg);   // 0–1 of combined HPI/LPI rated
    var accum_inv = stepAccumulators(s, cfg, dt);
    var rc = cfg.reactivity;
    // CVCS charging: AUTO make-up (opt-in) modulates the TRUE flow to track letdown
    // + an inventory deficit, up to charging_max, compensating identified leakage;
    // MANUAL tracks the operator setpoint. Either way s.charging_flow is the true
    // flow (what the charging_flow instrument reads); charging_setpoint is the command.
    if (s.cvcs_auto) {
      // AUTO make-up holds PROGRAMMED PZR LEVEL (real CVCS level control) while still
      // compensating a gross inventory deficit. charging = letdown + max(level-servo,
      // inventory-makeup): the level term (charging above/below letdown per % level
      // error, reading last step's indicated level) holds level through the thermal
      // shrink of a load change/cooldown; the inventory term still catches a leak that
      // has not yet shown up as a level drop (e.g. before voiding). Capped at charging_max.
      // Pure pressurizer-level control, exactly like the real CVCS: charging modulates
      // above/BELOW letdown to hold the programmed level, reading only the INDICATED level
      // (HR1 — no peeking at true mass or leak flow). A leak makes ITSELF up because it
      // lowers the level (see stepLevel: leak_flow is now an inventory-out term on the
      // level, as it physically is), so the servo charges up to hold level — no leak
      // detection needed. A HIGH level drives charging below letdown to bring it back down.
      var level_sp = cfg.pressurizer.pzr_level_nominal;
      var level_demand = (rc.cvcs_charge_per_level || 0.006) * (level_sp - (s.pzr_level_pct != null ? s.pzr_level_pct : level_sp));
      s.charging_flow = clip((s.letdown_flow || 0) + level_demand, 0, rc.charging_max != null ? rc.charging_max : 0.06);
    } else {
      s.charging_flow = s.charging_setpoint;
    }
    // Charging requires the charging pump; the accumulator inventory gain scales its
    // normalized flow into the same inventory-fraction units as the rest of the balance.
    var charging = (s.charging_pump_running === false) ? 0 : s.charging_flow;
    s._charging_actual = charging;   // pump-gated true charging, for the pzr level insurge term (stepLevel)
    var dm = (charging + inj_inv + accum_inv)
           - (s.letdown_flow + s.porv_flow + s.safety_flow + s.leak_flow);
    s._mass = clip(s._mass + dm * dt, 0.0, cfg.primary.mass_max);
    s.core_inventory_pct = s._mass * 100;

    // Boron transport on the emergency-injection path (HPI/LPI + accumulators carry
    // heavily borated RWST/SIT water at eccs_boron_ppm). Perfect-mixing update of the
    // core concentration: dC/dt = q_inj·(C_eccs − C)/m, so injected inventory raises
    // s.boron_ppm (negative reactivity) — the ECCS shutdown-margin role during a LOCA.
    // Losses (letdown/break/relief) leave at the current concentration and so do not
    // change it, and they already cancel in the mixing balance. CVCS borate/dilute is
    // a separate idealized channel added in pwr_engine step 13. Boil-off boron
    // concentration (steam carries no boron) is deliberately not modeled — the loss
    // term is lumped and does not distinguish boil-off from leakage.
    var eccs_inv = inj_inv + accum_inv;
    // Stash the cold-injection throughput (HPI/LPI + accumulators, inventory-frac/s) for
    // pwr_thermal.stepCoolant's quench term — it runs earlier in the step and reads this
    // one step late (explicit coupling, CONTEXT §11). RHR is not included (recirculation,
    // not cold make-up). Set every step so it falls to 0 when injection stops.
    s._eccs_inj_inv = eccs_inv;
    var c_eccs = cfg.emergency.eccs_boron_ppm;
    if (eccs_inv > 0 && c_eccs != null && s.boron_ppm != null) {
      var m_mix = s._mass > 0.05 ? s._mass : 0.05;   // floor to bound the mixing rate as inventory → 0
      s.boron_ppm += eccs_inv * (c_eccs - s.boron_ppm) / m_mix * dt;
    }

    // Two void mechanisms, kept in SEPARATE state (they have different physical effects
    // and calibrations, and TMI's erosion phase transiently drives the exit to saturation
    // — so combining them would let the flux term corrupt the TMI pressurizer deception):
    //
    //  (1) Inventory-driven (TMI) — primary_void_fraction: the bulk reaches saturation as
    //      inventory is lost (post-scram, low power). Void scales with the inventory deficit.
    //      This is the SOLE driver of the pressurizer sat-pull / void-surge (pwr_pressurizer),
    //      the calibrated TMI deception.
    var true_subcooling = T_sat(s.pressure_mpa) - s.tavg_c;
    s.primary_void_fraction = (true_subcooling <= 0 && s._mass < 1.0)
      ? clip((1.0 - s._mass) * cfg.primary.void_gain, 0, 1) : 0;
    //  (2) Flux-driven core boiling (steam-line-break / loss-of-flow AT POWER) —
    //      core_void_fraction: the core exit passes saturation and boils even at full
    //      inventory. Driven by the raw exit overshoot (pwr_thermal), relaxed with a time
    //      constant. Its physical bite is the DNB heat-transfer collapse (pwr_thermal
    //      hFcEffective); it is deliberately NOT wired into the pressurizer couplings above.
    //      Exposed for indication / scenario triggers; a dedicated pressure coupling is
    //      deferred to at-power-scenario tuning.
    var th = cfg.thermal;
    var overshoot = -(s._subcool_hot_c != null ? s._subcool_hot_c : 1);   // °C past saturation at the exit
    var core_void_eq = clip(overshoot * (th.void_flux_gain || 0), 0, th.void_flux_max != null ? th.void_flux_max : 0.8);
    s.core_void_fraction = clip((s.core_void_fraction || 0)
      + (core_void_eq - (s.core_void_fraction || 0)) / (th.void_flux_tau || 3.0) * dt, 0, 1);
  }

  // Step 10 — reactor coolant pumps and flow.
  function stepFlow(s, cfg, dt) {
    var pr = cfg.primary;
    if (s.pump_running) {
      // A cavitating pump loses head/flow: the delivered-flow target drops from
      // rated by cavitation_flow_loss × severity (the mechanical bite of a two-phase
      // suction). Uses this step's cavitation severity (stepCavitation, step 7c).
      var target = 1.0 - pr.cavitation_flow_loss * (s.rcp_cavitation_frac || 0);
      s.flow_frac += (target - s.flow_frac) / pr.pump_spinup_tau * dt;
    } else {
      s.flow_frac += (pr.natural_circ_flow - s.flow_frac) / pr.pump_coastdown_tau * dt;
    }
    s.flow_frac = clip(s.flow_frac, 0.0, 1.0);
    s.pump_flow_pct = s.flow_frac * 100;
  }

  RD.pwrPrimary = {
    computeNodePressures: computeNodePressures,
    stepCavitation: stepCavitation,
    letdownFlow: letdownFlow,
    injectionFlowInv: injectionFlowInv,
    stepInventory: stepInventory,
    stepFlow: stepFlow,
  };

})(globalThis.RD || (globalThis.RD = {}));
