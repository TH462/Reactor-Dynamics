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
  // DNB is judged at the HOT LEG (core exit) — the hot channel dries out first — using
  // the exit margin computed last step (explicit coupling, CONTEXT §11); this is what
  // makes DNB reachable at power (steam-line-break / loss-of-flow), where the bulk Tavg
  // never approaches saturation. Falls back to the bulk margin before the first step.
  function hFcEffective(s, cfg) {
    var t = cfg.thermal;
    var margin = (s._subcool_hot_c != null) ? s._subcool_hot_c : trueSubcooling(s);
    var h = (margin <= t.dnb_margin_c) ? t.h_fc_dnb : t.h_fc;     // DNB near the exit saturation
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

  // Step 6 — coolant average temperature (two-node) and hot/cold legs.
  function stepCoolant(s, cfg, dt) {
    var t = cfg.thermal;
    var h_eff = s._h_fc_eff != null ? s._h_fc_eff : t.h_fc;
    var Q_fuel_to_coolant = h_eff * (s.fuel_temp_c - s.tavg_c);
    // Secondary temperature from the previous step (explicit coupling, CONTEXT §11).
    // Pure ΔT coupling, NO load gate: at no load the secondary saturates up until
    // tsec ≈ tavg (steam pressure rises to the no-load point, held by the steam
    // dump), so heat transfer dies away naturally; drawing steam lowers tsec and
    // opens the ΔT — the real PWR secondary characteristic. (The old binary
    // idle-gate slammed a rated-capacity sink onto the core at 1% power — the
    // quench-cooldown/pzr-level trip that made low-power work feel booby-trapped.)
    var Q_coolant_to_sg = t.h_sg * s.flow_frac * (s.tavg_c - s.t_secondary_c);
    s._Q_coolant_to_sg = Q_coolant_to_sg;
    // Residual Heat Removal (RHR, §6.1): a low-pressure decay-heat cooldown loop,
    // alignable only below the permissive pressure with condenser cooling available.
    // When active and permitted it draws heat from the coolant node toward the
    // cooldown sink; dormant (no effect) at operating pressure.
    var e = cfg.emergency, Q_rhr = 0;
    if (s.rhr_active && s.pressure_mpa < e.rhr_permissive_mpa && s.condenser_cooling_available) {
      Q_rhr = e.rhr_gain * Math.max(0, s.tavg_c - e.rhr_sink_c);
    }
    // RCP heat: pump shaft work deposited in the coolant, scaled by flow — the
    // real no-load heat source (heats the plant if the heat sink is isolated),
    // and its loss slightly speeds a post-trip cooldown.
    var Q_pump = t.heat_gen_coeff * (t.pump_heat_frac || 0) * s.flow_frac;
    var dTavg = (Q_fuel_to_coolant + Q_pump - Q_coolant_to_sg - Q_rhr) / t.coolant_heat_capacity;
    s.tavg_c += dTavg * dt;
    s._dTavg_dt = dTavg; // pressurizer surge uses this (thermal expansion)

    // Hot/cold leg split. The RAW enthalpy rise (∝ power/flow) can exceed what
    // subcooled liquid can carry — at very low flow it is nonphysically large. The
    // core exit therefore pins at saturation (Tsat): the split is capped at the value
    // that puts thot exactly there, keeping both legs consistent around tavg, while the
    // raw exit overshoot (below) is carried as the DNB / core-boiling driver.
    var Tsat = T_sat(s.pressure_mpa);
    var delta_T_raw = t.delta_T_rated * s.power_pct / 100 / Math.max(s.flow_frac, t.flow_floor);
    var thot_raw = s.tavg_c + delta_T_raw / 2.0;
    s._subcool_hot_c = Tsat - thot_raw;                     // exit margin to saturation (may go < 0)
    var delta_T = Math.min(delta_T_raw, Math.max(2 * (Tsat - s.tavg_c), 0));
    s.thot_c = s.tavg_c + delta_T / 2.0;                    // = min(thot_raw, Tsat)
    s.tcold_c = s.tavg_c - delta_T / 2.0;

    s.subcooling_c = trueSubcooling(s); // true diagnostic value (bulk; mirrors the instrument)
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
    stepFuel: stepFuel,
    stepCoolant: stepCoolant,
    checkDamage: checkDamage,
  };

})(globalThis.RD || (globalThis.RD = {}));
