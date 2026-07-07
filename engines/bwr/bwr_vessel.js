/*
 * bwr_vessel.js — vessel pressure, water level + boiloff, boiling/void, fuel
 * temperature with core-uncovery heat-transfer collapse, and the fuel-damage
 * endpoint (M3 §6, §7.3). Pure functions over engine state `s` and config `cfg`,
 * called in the §5 order. SI throughout (°C, MPa, void fraction, normalized flow).
 *
 * Attaches RD.bwrVessel.
 */
;(function (RD) {
  'use strict';

  function clip(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }

  // Saturation temperature, °C from MPa — the coolant temperature (the core
  // water boils at vessel pressure; ~286 °C at 7.03 MPa).
  function T_sat(P_MPa) { return 179.47 * Math.pow(Math.max(P_MPa, 1e-6), 0.239); }
  function coolantTemp(s) { return T_sat(s.vessel_pressure_mpa); }

  // §6.3 — void fraction (drives the NEGATIVE feedback). Rises with power, falls
  // with core flow.
  function stepVoid(s, cfg, dt) {
    var v = cfg.vessel;
    var flow_frac = Math.max(s.core_flow_pct / 100.0, 1e-3);
    var void_target = clip(s._P / flow_frac * v.void_scale_factor, 0.0, 0.95);
    s.core_void_fraction += (void_target - s.core_void_fraction) / v.void_response_tau_bwr * dt;
    s.core_void_fraction = clip(s.core_void_fraction, 0.0, 0.95);
  }

  // §6.1 — vessel pressure, with the §7.3 turbine-trip void collapse and the
  // §13.1 stuck-relief blowdown. steam_gen tracks total heat (Q_total), so a
  // scrammed core still boils (decay) and pressurizes into the reliefs.
  function stepVesselPressure(s, cfg, dt) {
    var v = cfg.vessel;
    var steam_gen_rate = s._Q_total * v.steam_gen_per_power_bwr;
    var relief_flow = s.vessel_pressure_mpa > v.relief_setpoint_mpa
      ? (s.vessel_pressure_mpa - v.relief_setpoint_mpa) * v.relief_gain : 0.0;
    s._relief_flow = relief_flow;
    // Turbine bypass / steam dump to the main condenser: holds vessel pressure on
    // a load rejection / turbine trip. AUTO opens proportionally above its setpoint
    // (a manual override wins) — but ONLY when the condenser is available (needs
    // AC), so it is inert during station blackout and the SRVs alone hold pressure
    // (keeping RCIC's steam drive alive — the Fukushima story is unchanged).
    var dump = 0;
    if (s.condenser_cooling_available) {
      dump = (s.steam_dump_override != null) ? s.steam_dump_override
        : clip((s.vessel_pressure_mpa - v.steam_dump_setpoint) / v.steam_dump_band, 0, 1) * v.steam_dump_max;
    }
    s.steam_dump_frac = dump;
    var dP = (steam_gen_rate - s.steam_flow_normalized - dump - relief_flow) * v.K_vessel_pressure;
    s.vessel_pressure_mpa = Math.max(v.P_ambient, s.vessel_pressure_mpa + dP * dt);

    // §13.1 stuck-relief blowdown (independent of ADS): continuous depressurize.
    if (s._fail.srv_stuck_open.active) {
      var a = s._fail.srv_stuck_open.area;
      var blow = cfg.safety.SRV_BLOWDOWN_COEFF * a * (s.vessel_pressure_mpa - v.P_ambient);
      s.vessel_pressure_mpa = Math.max(v.P_ambient, s.vessel_pressure_mpa - blow * dt);
    }

    // §7.3 turbine-trip transient: rising pressure collapses voids → collapsing
    // voids add reactivity (negative void coefficient in reverse) → brief power
    // rise (emerges automatically through ρ_void next step).
    if (s.vessel_pressure_mpa > v.vessel_p_rated) {
      var collapse = (s.vessel_pressure_mpa - v.vessel_p_rated) * v.void_collapse_coeff;
      s.core_void_fraction = clip(s.core_void_fraction - collapse * dt, 0.0, 0.95);
    }
  }

  // §6.2 — vessel water level + boiloff. boiloff (decay-heat boiling, active once
  // scrammed) is the inventory threat after RCIC fails; at power the normal
  // steam/feedwater balance holds level (boiloff gated off). The §13.1 stuck-SRV
  // adds an inventory sink.
  function stepVesselLevel(s, cfg, dt) {
    var v = cfg.vessel;
    var boiloff = s.scrammed ? (s._H1 + s._H2) / (v.latent_heat_bwr * v.vessel_water_mass) : 0.0;
    // Isolation Condenser returns its condensate by gravity, so while it condenses the
    // vessel inventory is conserved (no net boiloff) — the passive core-cover path.
    if (s.ic_condensing) boiloff = 0;
    s._boiloff_rate = boiloff;
    var srv_sink = s._fail.srv_stuck_open.active ? cfg.safety.SRV_INVENTORY_RATE * s._fail.srv_stuck_open.area : 0.0;
    var dLevel = (s.feedwater_normalized + s.rcic_flow + s.hpci_flow + s.lpci_flow + (s.lpcs_flow || 0)
      - s.steam_flow_normalized - boiloff - srv_sink) * v.K_vessel_level;
    s.vessel_level_pct = clip(s.vessel_level_pct + dLevel * dt, 0, 100);
  }

  // §6.4 — fuel temperature. Heat source = fission + decay (Q_total). When the
  // core uncovers (low level) the fuel→coolant coupling collapses, so decay heat
  // accumulates and fuel heats toward damage (the uncovery endpoint).
  function stepFuel(s, cfg, dt) {
    var v = cfg.vessel, Tcool = coolantTemp(s);
    var h_fc = v.h_fc_bwr;
    if (s.vessel_level_pct < v.uncover_level_pct) {
      var f = s.vessel_level_pct / v.uncover_level_pct;     // 0..1
      h_fc = v.h_fc_bwr * Math.max(v.h_fc_uncover_floor, f * f);
    }
    s._h_fc_eff = h_fc;
    var dTf = s._Q_total * v.heat_gen_coeff_bwr - h_fc * (s.fuel_temp_c - Tcool);
    s.fuel_temp_c += dTf * dt;
  }

  // §6.5 — fuel damage / melt (thresholds fixed). BWR reaches this only via the
  // Fukushima uncovery path (no prompt excursion).
  function checkDamage(s, cfg) {
    var v = cfg.vessel;
    if (s.fuel_temp_c > v.fuel_damage_c) s.fuel_damaged = true;
    if (s.fuel_temp_c > v.fuel_melt_c) {
      s.melted = true;
      if (s.destruction_cause === 'none') s.destruction_cause = 'thermal_melt';
    }
  }

  // Balance-of-plant — turbine / condenser / generator (behavioral, mirroring the
  // PWR §6.8). Direct cycle: steam_flow_normalized is the steam drawn by the
  // turbine, so electrical output tracks it. Grid holds a synced machine at rated
  // speed; a tripped/isolated one coasts down on windage.
  function stepTurbine(s, cfg, dt) {
    var tb = cfg.turbine;
    if (!tb) return;
    var target = s.condenser_cooling_available ? tb.vacuum_rated : tb.vacuum_lost;
    var tau = s.condenser_cooling_available ? tb.vacuum_restore_tau : tb.vacuum_decay_tau;
    s.condenser_vacuum_kpa += (target - s.condenser_vacuum_kpa) / tau * dt;

    if (s.condenser_vacuum_kpa < tb.vacuum_trip_kpa && !s.turbine_tripped) tripTurbine(s);

    var load = s.steam_flow_normalized;
    var synced = !s.turbine_tripped && !s.turbine_blocked && load > 1e-4
      && s.condenser_vacuum_kpa >= tb.vacuum_trip_kpa;
    if (synced) {
      s.turbine_rpm += (tb.rpm_rated - s.turbine_rpm) / 0.5 * dt;
    } else {
      var drive = load * tb.torque_per_flow * tb.rpm_rated;
      var brake = tb.windage * s.turbine_rpm;
      s.turbine_rpm += (drive - brake) / tb.turbine_inertia * dt;
      if (s.turbine_rpm < 0) s.turbine_rpm = 0;
      if (s.turbine_rpm > tb.rpm_overspeed_trip && !s.turbine_tripped) tripTurbine(s);
    }

    s.mwe_output = load * cfg.mwe_rated * (s.turbine_rpm / tb.rpm_rated)
      * (s.condenser_vacuum_kpa / tb.vacuum_rated);
    if (s.mwe_output < 0) s.mwe_output = 0;
  }

  function tripTurbine(s) {
    s.turbine_tripped = true;
    s.steam_flow_normalized = 0;
    s.turbine_load_frac = 0;
    s.load_mode = 'disconnected';
    s.load_target_mwe = 0;
  }

  RD.bwrVessel = {
    T_sat: T_sat, coolantTemp: coolantTemp,
    stepVoid: stepVoid, stepVesselPressure: stepVesselPressure,
    stepVesselLevel: stepVesselLevel, stepFuel: stepFuel, checkDamage: checkDamage,
    stepTurbine: stepTurbine, tripTurbine: tripTurbine,
  };

})(globalThis.RD || (globalThis.RD = {}));
