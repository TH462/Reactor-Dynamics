/*
 * pwr_steam_generator.js — secondary side: SG heat transfer, level, steam
 * pressure/flow, feedwater + auxiliary feedwater, and the behavioral
 * turbine/condenser (M1 §6.7–6.8). Pure functions over engine state `s`/`cfg`.
 *
 * Attaches RD.pwrSteamGenerator.
 */
;(function (RD) {
  'use strict';

  function clip(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }
  function T_sat(P) { return 179.47 * Math.pow(Math.max(P, 1e-6), 0.239); }

  // Step 11 — SG level, secondary pressure/flow, feedwater + AFW.
  function stepSecondary(s, cfg, dt) {
    var sg = cfg.steam_generator;

    // FEED PUMP: the commanded speed (operator nudge/set, the three-element
    // channel, or the load coupling — whoever wrote feed_pump_speed_pct last)
    // reaches delivered demand through the pump's first-order inertia.
    if (s.feed_pump_speed_pct != null) {
      s.feedwater_demand_frac += ((s.feed_pump_speed_pct / 100) - s.feedwater_demand_frac)
        / sg.feed_pump_tau * dt;
    }

    // Feedwater: lost on the loss_of_feedwater failure; AFW backs up low SG level
    // (auto-start reads the instrument in M4; the engine exposes the effect).
    // AFW delivery = capacity × operator throttle (set_afw_flow) × a built-in
    // proportional level hold: full flow below the hold target, tapering to zero
    // across the band above it (replaces the old hard `level < 20` cutoff — the
    // same equilibrium, without the on/off chatter, and the throttle lets the
    // operator take the flow anywhere below that).
    var feedwater_flow = s.main_feedwater_available ? s.feedwater_demand_frac : 0.0;
    var afw_flow = 0;
    if (s.afw_active) {
      var hold = clip((sg.afw_level_target + sg.afw_level_band - s.sg_level_pct) / sg.afw_level_band, 0, 1);
      afw_flow = sg.afw_flow_frac * (s.afw_throttle_frac != null ? s.afw_throttle_frac : 1.0) * hold;
    }
    s.afw_flow_normalized = afw_flow;
    feedwater_flow += afw_flow;
    s.feedwater_flow = feedwater_flow;
    s.fw_flow_normalized = feedwater_flow;

    // Secondary temperature already used by the coolant node this step (explicit
    // coupling). Q_sg = the coolant→SG heat computed in pwr_thermal (§6.2).
    s.t_secondary_c = T_sat(s.steam_pressure_mpa);
    var Q_sg = s._Q_coolant_to_sg != null
      ? s._Q_coolant_to_sg
      : cfg.thermal.h_sg * s.flow_frac * (s.tavg_c - s.t_secondary_c);
    var steam_generation_rate = Q_sg / sg.latent_heat_secondary;

    // B2 — steam dump / turbine bypass: vents steam straight to the condenser,
    // bypassing the turbine, to control SG pressure on a turbine trip / load
    // rejection without overpressuring the secondary. AUTO opens proportionally
    // above a pressure setpoint (a basic relief to condenser, like the pzr
    // heater/spray auto-control); a manual override (0..1) wins. Removed steam is
    // additional steam-out in the pressure + level balance.
    var dump = (s.steam_dump_override != null)
      ? s.steam_dump_override
      : clip((s.steam_pressure_mpa - sg.steam_dump_setpoint) / sg.steam_dump_band, 0, 1) * sg.steam_dump_max;
    s.steam_dump_frac = dump;
    var steam_out = s.steam_flow_normalized + dump;

    // SG level (the true level; shrink/swell is added in the instrument model §8.4).
    var dSGLevel = (feedwater_flow - steam_out) * sg.K_sg_level;
    s.sg_level_pct = clip(s.sg_level_pct + dSGLevel * dt, 0, 100);

    // Secondary pressure and steam flow.
    var dSteamP = (steam_generation_rate - steam_out) * sg.K_steam_pressure;
    s.steam_pressure_mpa += dSteamP * dt;

    // §9.1 main steam line break: blows the secondary down (overcooling).
    if (s._fail.steam_break.active) {
      s.steam_pressure_mpa -= cfg.physics_failures.STEAM_BREAK_RATE * s._fail.steam_break.size * dt;
    }
    s.steam_pressure_mpa = Math.max(0.1, s.steam_pressure_mpa);

    // Turbine governor / control valve (§6.4) — EHC LOAD-CONTROL mode. The valve
    // target is PRESSURE-COMPENSATED (demand ÷ upstream pressure ratio, clamped
    // to fully open), so at steady state the delivered steam equals the demand
    // at ANY secondary pressure — the valve strokes open as pressure falls and
    // closes down as it rises, like a real governor holding load. (The previous
    // open-loop valve = demand overdelivered by P/P_rated: a 700 MWe ask at held
    // Tavg ran the SG to ~6.3 MPa and delivered ~785 MWe.) At rated pressure the
    // two forms are identical. The valve stroke keeps its first-order lag, and
    // instruments.governor_valve follows the position.
    var p_comp = sg.steam_p_rated / Math.max(s.steam_pressure_mpa, 0.5);
    var gov_target = clip(clip(s.turbine_demand_frac, 0, 1) * p_comp, 0, 1) * 100;
    var galpha = dt / (cfg.turbine.governor_tau + dt);
    s.governor_valve_pct += galpha * (gov_target - s.governor_valve_pct);
    s.steam_flow_normalized = (s.governor_valve_pct / 100) * sg.steam_flow_rated
      * (s.steam_pressure_mpa / sg.steam_p_rated);
  }

  // Step 12 — turbine and condenser (behavioral).
  function stepTurbine(s, cfg, dt) {
    var tb = cfg.turbine;

    // Vacuum: restores toward rated when condenser cooling is available, else
    // decays slowly toward the lost value (a realistic lag).
    var target = s.condenser_cooling_available ? tb.vacuum_rated : tb.vacuum_lost;
    var tau = s.condenser_cooling_available ? tb.vacuum_restore_tau : tb.vacuum_decay_tau;
    s.condenser_vacuum_kpa += (target - s.condenser_vacuum_kpa) / tau * dt;

    // Turbine trip on low condenser vacuum.
    if (s.condenser_vacuum_kpa < tb.vacuum_trip_kpa && !s.turbine_tripped) tripTurbine(s);

    var synced = !s.turbine_tripped && s.generator_load > 0
      && s.condenser_vacuum_kpa >= tb.vacuum_trip_kpa;
    if (synced) {
      // Grid holds the synchronous generator at rated speed.
      s.turbine_rpm += (tb.rpm_rated - s.turbine_rpm) / 0.5 * dt;
    } else {
      // Free: coast down on lost steam, or spin up toward overspeed if steam
      // keeps flowing with the load gone.
      var net_torque = s.steam_flow_normalized * tb.torque_per_flow
                     - s.generator_load * tb.torque_per_load;
      s.turbine_rpm += (net_torque / tb.turbine_inertia) * dt;
      if (s.turbine_rpm < 0) s.turbine_rpm = 0;
      if (s.turbine_rpm > tb.rpm_overspeed_trip && !s.turbine_tripped) tripTurbine(s);
    }

    s.mwe_output = (s.power_pct / 100) * tb.mwe_rated
      * (s.turbine_rpm / tb.rpm_rated) * (s.condenser_vacuum_kpa / tb.vacuum_rated);
    if (s.mwe_output < 0) s.mwe_output = 0;
  }

  function tripTurbine(s) {
    s.turbine_tripped = true;
    s.generator_load = 0;
    s.turbine_demand_frac = 0;
    s.steam_demand_mwe = 0;
    s.load_mode = 'disconnected';
    s.load_target_mwe = 0;
  }

  RD.pwrSteamGenerator = {
    stepSecondary: stepSecondary,
    stepTurbine: stepTurbine,
    tripTurbine: tripTurbine,
  };

})(globalThis.RD || (globalThis.RD = {}));
