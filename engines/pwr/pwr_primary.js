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
    var q_hh = e.hpi_flow_max * clip((e.hpi_pressure_ref - s.pressure_mpa) / e.hpi_pressure_ref, 0, 1);
    var q_lh = e.lpi_flow_max * e.lpi_inventory_gain * clip((e.lpi_pressure_ref - s.pressure_mpa) / e.lpi_pressure_ref, 0, 1);
    return (q_hh + q_lh) * (s.hpi_flow_multiplier != null ? s.hpi_flow_multiplier : 1.0);
  }
  function injectionRatedInv(cfg) {
    var e = cfg.emergency;
    return e.hpi_flow_max + e.lpi_flow_max * e.lpi_inventory_gain;
  }

  // Passive accumulators: discharge into the cold leg once primary pressure drops
  // below the N2 cover pressure; finite borated capacity depletes as they inject
  // (accumulator_volume_pct → 0). No operator command — pressure-driven only.
  function stepAccumulators(s, cfg, dt) {
    var e = cfg.emergency;
    var flow = 0;
    if (s.pressure_mpa < e.accumulator_trip_mpa && s._accum_remaining > 1e-6) {
      var frac = clip((e.accumulator_trip_mpa - s.pressure_mpa) / e.accumulator_trip_mpa, 0, 1);
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

  // Step 9 — primary inventory and voiding (CVCS charging/letdown + HPI/LPI/accumulator/SI − losses).
  function stepInventory(s, cfg, dt) {
    var inj_inv = injectionFlowInv(s, cfg);
    s.hpi_flow_normalized = inj_inv / injectionRatedInv(cfg);   // 0–1 of combined HPI/LPI rated
    var accum_inv = stepAccumulators(s, cfg, dt);
    var rc = cfg.reactivity;
    // CVCS charging: AUTO make-up (opt-in) modulates the TRUE flow to track letdown
    // + an inventory deficit, up to charging_max, compensating identified leakage;
    // MANUAL tracks the operator setpoint. Either way s.charging_flow is the true
    // flow (what the charging_flow instrument reads); charging_setpoint is the command.
    if (s.cvcs_auto) {
      s.charging_flow = clip((s.letdown_flow || 0) + (rc.cvcs_makeup_gain || 3) * (1.0 - s._mass), 0, rc.charging_max != null ? rc.charging_max : 0.06);
    } else {
      s.charging_flow = s.charging_setpoint;
    }
    // Charging requires the charging pump; the accumulator inventory gain scales its
    // normalized flow into the same inventory-fraction units as the rest of the balance.
    var charging = (s.charging_pump_running === false) ? 0 : s.charging_flow;
    var dm = (charging + inj_inv + accum_inv + s.safety_injection_flow)
           - (s.letdown_flow + s.porv_flow + s.safety_flow + s.leak_flow);
    s._mass = clip(s._mass + dm * dt, 0.0, cfg.primary.mass_max);
    s.core_inventory_pct = s._mass * 100;

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
      s.flow_frac += (1.0 - s.flow_frac) / pr.pump_spinup_tau * dt;
    } else {
      s.flow_frac += (pr.natural_circ_flow - s.flow_frac) / pr.pump_coastdown_tau * dt;
    }
    s.flow_frac = clip(s.flow_frac, 0.0, 1.0);
    s.pump_flow_pct = s.flow_frac * 100;
  }

  RD.pwrPrimary = {
    injectionFlowInv: injectionFlowInv,
    stepInventory: stepInventory,
    stepFlow: stepFlow,
  };

})(globalThis.RD || (globalThis.RD = {}));
