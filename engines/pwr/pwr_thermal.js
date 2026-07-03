/*
 * pwr_thermal.js — fuel and coolant temperatures, true subcooling, DNB, and the
 * fuel-damage / melt endpoint (M1 §6.1–6.3, §6.10). Pure functions over the
 * engine's true-physics state `s` and config `cfg`; the engine calls them in the
 * §5 dependency order. SI throughout (°C, MPa).
 *
 * Attaches RD.pwrThermal.
 */
;(function (RD) {
  'use strict';

  // Saturation temperature, °C from MPa. The M1 §6.3 snippet's /145.038 and
  // -273.15 were psia/Kelvin residue; 179.47·P^0.239 (P in MPa) returns °C and
  // matches steam tables to ±2 °C over 5–17 MPa (e.g. 15.41 MPa → 345 °C).
  function T_sat(P_MPa) { return 179.47 * Math.pow(Math.max(P_MPa, 1e-6), 0.239); }

  // True subcooling (physics) — drives voiding (§6.5). Uses TRUE P and Tavg.
  function trueSubcooling(s) { return T_sat(s.pressure_mpa) - s.tavg_c; }

  // Effective fuel→coolant coupling: degrades on DNB and on core uncovery (§6.1, §6.5).
  function hFcEffective(s, cfg) {
    var t = cfg.thermal;
    var h = (trueSubcooling(s) <= 0) ? t.h_fc_dnb : t.h_fc;       // DNB at saturation
    var mass = s.core_inventory_pct / 100;
    if (mass < cfg.primary.significant_uncover) {                  // < 0.50: heat transfer collapses → 0
      h = Math.min(h, t.h_fc * (mass / cfg.primary.significant_uncover));
    }
    return h;
  }

  // Step 5 — fuel temperature. Heat source is total heat (fission + decay), so
  // post-scram decay heat keeps the fuel hot (the TMI uncovery heatup).
  function stepFuel(s, cfg, dt) {
    var t = cfg.thermal;
    var h_eff = hFcEffective(s, cfg);
    s._h_fc_eff = h_eff; // remembered for the coolant node (energy-consistent)
    var Q_total = s._Q_total; // P_fission + H_total, set by the engine (step 4)
    var dTf = Q_total * t.heat_gen_coeff - h_eff * (s.fuel_temp_c - s.tavg_c);
    s.fuel_temp_c += dTf * dt;
  }

  // Secondary heat-sink demand: idle hot standby (near-zero power, no steam) has no SG load;
  // at-power operation keeps full coupling (the pre-HZP-fix behavior).
  function sgThermalLoad(s) {
    var decay = (s._H1 || 0) + (s._H2 || 0);
    if (!s.scrammed && s.power_pct < 1.0 && (s.steam_flow_normalized || 0) < 0.05 && decay < 0.01) return 0;
    var load = Math.max(s.steam_flow_normalized || 0, s.feedwater_flow || 0, s.power_pct / 100);
    if (s.scrammed) load = Math.max(load, decay);
    if (s.afw_active) load = Math.max(load, 0.08);
    return Math.max(load, 1.0);
  }

  // Step 6 — coolant average temperature (two-node) and hot/cold legs.
  function stepCoolant(s, cfg, dt) {
    var t = cfg.thermal;
    var h_eff = s._h_fc_eff != null ? s._h_fc_eff : t.h_fc;
    var Q_fuel_to_coolant = h_eff * (s.fuel_temp_c - s.tavg_c);
    // Secondary temperature from the previous step (explicit coupling, CONTEXT §11).
    var Q_coolant_to_sg = t.h_sg * s.flow_frac * sgThermalLoad(s) * (s.tavg_c - s.t_secondary_c);
    s._Q_coolant_to_sg = Q_coolant_to_sg;
    var dTavg = (Q_fuel_to_coolant - Q_coolant_to_sg) / t.coolant_heat_capacity;
    s.tavg_c += dTavg * dt;
    s._dTavg_dt = dTavg; // pressurizer surge uses this (thermal expansion)

    var delta_T = t.delta_T_rated * s.power_pct / 100 / Math.max(s.flow_frac, t.flow_floor);
    s.thot_c = s.tavg_c + delta_T / 2.0;
    s.tcold_c = s.tavg_c - delta_T / 2.0;

    s.subcooling_c = trueSubcooling(s); // true diagnostic value
  }

  // Step 14 — fuel damage / melt endpoint (thresholds fixed).
  function checkDamage(s, cfg) {
    var t = cfg.thermal;
    if (s.fuel_temp_c > t.fuel_damage_c) s.fuel_damaged = true;
    if (s.fuel_temp_c > t.fuel_melt_c) {
      s.melted = true;
      if (s.destruction_cause === 'none') s.destruction_cause = 'thermal_melt';
    }
  }

  RD.pwrThermal = {
    T_sat: T_sat,
    trueSubcooling: trueSubcooling,
    hFcEffective: hFcEffective,
    sgThermalLoad: sgThermalLoad,
    stepFuel: stepFuel,
    stepCoolant: stepCoolant,
    checkDamage: checkDamage,
  };

})(globalThis.RD || (globalThis.RD = {}));
