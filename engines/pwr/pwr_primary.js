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

  // HPI flow: injects against pressure, so flow falls as primary pressure rises
  // toward the shutoff head. Decisive in TMI (§6.9). degraded_hpi scales it.
  function hpiFlow(s, cfg) {
    if (!s.hpi_active) return 0;
    var e = cfg.emergency;
    var frac = clip((e.hpi_pressure_ref - s.pressure_mpa) / e.hpi_pressure_ref, 0, 1);
    return e.hpi_flow_max * frac * (s.hpi_flow_multiplier != null ? s.hpi_flow_multiplier : 1.0);
  }

  // Step 9 — primary inventory and voiding (CVCS charging/letdown + HPI/SI − losses).
  function stepInventory(s, cfg, dt) {
    s.hpi_flow_normalized = hpiFlow(s, cfg);
    var rc = cfg.reactivity;
    // CVCS auto make-up (opt-in): charging tracks letdown + an inventory deficit, up
    // to charging_max, to compensate identified leakage and hold inventory ~full.
    if (s.cvcs_auto) {
      s.charging_flow = clip((s.letdown_flow || 0) + (rc.cvcs_makeup_gain || 3) * (1.0 - s._mass), 0, rc.charging_max != null ? rc.charging_max : 0.06);
    }
    // Charging requires the charging pump.
    var charging = (s.charging_pump_running === false) ? 0 : s.charging_flow;
    var dm = (charging + s.hpi_flow_normalized + s.safety_injection_flow)
           - (s.letdown_flow + s.porv_flow + s.safety_flow + s.leak_flow);
    s._mass = clip(s._mass + dm * dt, 0.0, cfg.primary.mass_max);
    s.core_inventory_pct = s._mass * 100;

    // Voiding forms when the primary reaches saturation (TRUE values) and
    // inventory is dropping (§6.5).
    var true_subcooling = T_sat(s.pressure_mpa) - s.tavg_c;
    s.primary_void_fraction = (true_subcooling <= 0 && s._mass < 1.0)
      ? clip((1.0 - s._mass) * cfg.primary.void_gain, 0, 1) : 0;
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
    hpiFlow: hpiFlow,
    stepInventory: stepInventory,
    stepFlow: stepFlow,
  };

})(globalThis.RD || (globalThis.RD = {}));
