/*
 * rbmk_thermal.js — boiling pressure-tube thermal-hydraulics (M2 §8): channel
 * flow + MCP coupling, void fraction, steam-drum pressure/level, graphite
 * temperature, fuel temperature with dryout, and the channel-rupture failure
 * term (§14.1). Pure functions over engine state `s` and config `cfg`, called in
 * the §6 order. SI throughout (°C, MPa, void fraction, flow % rated).
 *
 * The runaway chain this models: reduced flow → more boiling → higher void →
 * (positive void coefficient) → more reactivity → more power → more boiling.
 *
 * Attaches RD.rbmkThermal.
 */
;(function (RD) {
  'use strict';

  function clip(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }

  // Saturation temperature, °C from MPa — same correlation as the other engines.
  // At 7.0 MPa → ~286 °C (the channel/coolant temperature the RBMK runs at).
  function T_sat(P_MPa) { return 179.47 * Math.pow(Math.max(P_MPa, 1e-6), 0.239); }

  // Coolant (channel water) temperature — saturated at the drum pressure.
  function coolantTemp(s) { return T_sat(s.steam_pressure_mpa); }

  // §8.1 — channel flow and MCP coupling. mcp_running false ⇒ coastdown to 0;
  // running ⇒ spin toward the MCP speed setpoint.
  function stepChannelFlow(s, cfg, dt) {
    var t = cfg.thermal;
    if (s.mcp_running) {
      s.channel_flow_pct += (s.mcp_speed_pct - s.channel_flow_pct) / t.mcp_spinup_tau * dt;
    } else {
      s.channel_flow_pct += (0.0 - s.channel_flow_pct) / t.mcp_coastdown_tau * dt;
    }
    s.channel_flow_pct = clip(s.channel_flow_pct, 0.0, 120.0);
  }

  // §8.2 — void fraction. Rises with power, falls with flow (boiling balance).
  function stepVoid(s, cfg, dt) {
    var t = cfg.thermal;
    var flow_frac = Math.max(s.channel_flow_pct / 100.0, 1e-3);
    var void_target = clip(s._P / flow_frac * t.void_scale_rbmk, 0.0, 0.90);
    s.void_fraction_avg += (void_target - s.void_fraction_avg) / t.void_response_tau * dt;
    s.void_fraction_avg = clip(s.void_fraction_avg, 0.0, 0.90);
  }

  // §8.3 — steam-drum pressure (the RBMK's pressure-setting component). Steam
  // generated tracks power; the turbine draw (steam_to_turbine) is a slower load,
  // so an excursion outruns it and pressure rises until the reliefs vent.
  function stepDrumPressure(s, cfg, dt) {
    var t = cfg.thermal;
    var steam_gen_rate = s._P * t.steam_gen_per_power;
    var relief_flow = s.steam_pressure_mpa > t.drum_relief_mpa
      ? (s.steam_pressure_mpa - t.drum_relief_mpa) * t.relief_gain : 0.0;
    s._relief_flow = relief_flow;
    var dDrumP = (steam_gen_rate - s.steam_to_turbine - relief_flow) * t.K_drum_pressure;
    s.steam_pressure_mpa = Math.max(0.1, s.steam_pressure_mpa + dDrumP * dt);
  }

  // §8.4 — steam-drum level (feedwater vs steam draw).
  function stepDrumLevel(s, cfg, dt) {
    var t = cfg.thermal;
    var dDrumLevel = (s.feedwater_normalized - s.steam_to_turbine) * t.K_drum_level;
    s.drum_level_pct = clip(s.drum_level_pct + dDrumLevel * dt, 0, 100);
  }

  // §8.5 — graphite temperature (large thermal mass, slow). Feeds ρ_graphite.
  function stepGraphite(s, cfg, dt) {
    var t = cfg.thermal, Tcool = coolantTemp(s);
    var dGraphiteT = (s._P * t.graphite_heat_frac
      - t.h_graphite_coolant * (s.graphite_temp_avg_c - Tcool)) / t.graphite_heat_capacity;
    s.graphite_temp_avg_c += dGraphiteT * dt;
  }

  // §8.6 — fuel temperature with dryout. Excessive flow reduction or the
  // excursion itself collapses heat transfer → fuel temperature rises sharply.
  // The channel_dryout failure forces the collapse via s._h_fc_dryout_factor.
  function stepFuel(s, cfg, dt) {
    var t = cfg.thermal, Tcool = coolantTemp(s);
    var h_fc = t.h_fc_rbmk;
    if (s.void_fraction_avg > t.dryout_void && s.channel_flow_pct < t.dryout_flow_pct) {
      h_fc *= t.dryout_h_fc_factor;  // dryout — transfer collapses
    }
    if (s._h_fc_dryout_factor != null) h_fc *= s._h_fc_dryout_factor; // channel_dryout failure
    s._h_fc_eff = h_fc;
    // Heat source: fission embedded in P during operation; decay added once
    // scrammed (the residual source), mirroring the PWR's Q_total handling.
    var Q_total = s._P + (s.scrammed ? (s._H1 + s._H2) : 0);
    s._Q_total = Q_total;
    var dTf = Q_total * t.heat_gen_coeff_rbmk - h_fc * (s.fuel_temp_c - Tcool);
    s.fuel_temp_c += dTf * dt;
  }

  // §14.1 — channel (pressure-tube) rupture: local flashing → void up, inventory
  // lost → drum level down, coolant diverted → flow down. Applied AFTER the void,
  // drum-level, and channel-flow updates.
  function applyChannelRupture(s, cfg, dt) {
    if (!s._fail.channel_rupture.active) return;
    var pf = cfg.physics_failures, size = s._fail.channel_rupture.size;
    s.void_fraction_avg = Math.min(0.90, s.void_fraction_avg + pf.RUPTURE_VOID_RATE * size * dt);
    s.drum_level_pct    = Math.max(0, s.drum_level_pct - pf.RUPTURE_LEVEL_RATE * size * dt);
    s.channel_flow_pct  = Math.max(0, s.channel_flow_pct - pf.RUPTURE_FLOW_RATE * size * dt);
  }

  RD.rbmkThermal = {
    T_sat: T_sat,
    coolantTemp: coolantTemp,
    stepChannelFlow: stepChannelFlow,
    stepVoid: stepVoid,
    stepDrumPressure: stepDrumPressure,
    stepDrumLevel: stepDrumLevel,
    stepGraphite: stepGraphite,
    stepFuel: stepFuel,
    applyChannelRupture: applyChannelRupture,
  };

})(globalThis.RD || (globalThis.RD = {}));
