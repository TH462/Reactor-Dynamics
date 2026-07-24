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
    // Main feedwater also needs the condensate pump (it feeds the feed-pump suction):
    // securing the condensate pump drops main feed to zero, exactly like the tagged-out
    // train it models. AFW draws from the condensate storage tank, so it is unaffected.
    // A LOST CONDENSER also takes the condensate path (TR-8): the pump draws from the
    // condenser hotwell, so no condenser → no suction → no main feed. And the main
    // feed pumps are STEAM-DRIVEN off the main line downstream of the MSIV — closing
    // the MSIV starves them (the pwr_msiv decision-clock physics: bottle the boiler
    // and the feed dies with the steam). Both close the chain: heat-sink loss → MFW
    // loss → SG inventory falls → lo-lo trip — the ride-out plant trips on a genuine
    // limit, never on anticipation (FG-4). A plain turbine trip keeps the MSIV open,
    // so the ride-out keeps its feed.
    var condOK = s.condensate_pump_running !== false && s.condenser_cooling_available !== false
              && s.msiv_open !== false;
    var main_feed = (s.main_feedwater_available && !s.feedwater_isolated && condOK) ? s.feedwater_demand_frac : 0.0;
    s.condensate_flow_normalized = main_feed;   // TRUE main-feed / condensate flow indication
    var feedwater_flow = main_feed;
    var afw_flow = 0;
    if (s.afw_active) {
      // The hold senses level through the SG LEVEL INSTRUMENT (previous step's
      // reading, stashed by the engine) — a failed level sensor fools the AFW
      // regulator exactly as it fools the operator (HR1).
      var lvl = s._ins_sg_level != null ? s._ins_sg_level : s.sg_level_pct;
      var hold = clip((sg.afw_level_target + sg.afw_level_band - lvl) / sg.afw_level_band, 0, 1);
      afw_flow = sg.afw_flow_frac * (s.afw_throttle_frac != null ? s.afw_throttle_frac : 1.0) * hold;
    }
    s.afw_flow_normalized = afw_flow;
    // AFW pump discharge-pressure indication (MPa): pumps demanded → develop head above
    // the SG (deadheaded at shutoff if the discharge is blocked); 0 when not demanded.
    if (s.afw_pump_demand) {
      s.afw_discharge_pressure_mpa = s.afw_blocked ? sg.afw_shutoff_mpa
        : clip(s.steam_pressure_mpa + sg.afw_discharge_margin_mpa, 0, sg.afw_shutoff_mpa);
    } else {
      s.afw_discharge_pressure_mpa = 0;
    }
    feedwater_flow += afw_flow;
    s.feedwater_flow = feedwater_flow;
    s.fw_flow_normalized = feedwater_flow;

    // Secondary temperature already used by the coolant node this step (explicit
    // coupling). Q_sg = the coolant→SG heat computed in pwr_thermal (§6.2).
    s.t_secondary_c = T_sat(s.steam_pressure_mpa);
    var Q_sg = s._Q_coolant_to_sg != null
      ? s._Q_coolant_to_sg
      : cfg.thermal.h_sg * s.flow_frac * (s.tavg_c - s.t_secondary_c);
    // RCP pump heat crosses the SG with the core heat, but the behavioral
    // turbine draws steam for the CORE power only — booking the extra ~0.55 %
    // as steam made the secondary pressure creep for hours until power sagged
    // out of band (probed). Net it out of the steam-side balance here (treat it
    // as SG blowdown/ambient losses); every primary-side pump-heat effect
    // (no-load heatup with the sink isolated, post-trip cooldown change) lives
    // in the coolant node and is unaffected.
    var Q_pump = cfg.thermal.heat_gen_coeff * (cfg.thermal.pump_heat_frac || 0) * s.flow_frac;
    var steam_generation_rate = Math.max(0, Q_sg - Q_pump) / sg.latent_heat_secondary;

    // B2 — steam dump / turbine bypass: vents steam straight to the condenser,
    // bypassing the turbine, to control SG pressure on a turbine trip / load
    // rejection without overpressuring the secondary. AUTO opens proportionally
    // above a pressure setpoint (a basic relief to condenser, like the pzr
    // heater/spray auto-control); a manual override (0..1) wins. Removed steam is
    // additional steam-out in the pressure + level balance.
    var dump_setpoint = (s.steam_dump_setpoint != null) ? s.steam_dump_setpoint : sg.steam_dump_setpoint;
    var dump = (s.steam_dump_override != null)
      ? s.steam_dump_override
      : clip((s.steam_pressure_mpa - dump_setpoint) / sg.steam_dump_band, 0, 1);
    // TRIP-OPEN mode (real Westinghouse behavior, feel-plan P5): on a turbine trip
    // the dump drives open on the Tavg error immediately — it does NOT wait for SG
    // pressure to climb to the no-load setpoint (that wait was a ~2.6 MPa bottling
    // window that spiked the primary on every load rejection). Self-limiting: as
    // Tavg approaches the no-load anchor the demand tapers and pressure-mode takes
    // over. This is what makes the FG-4 ride-out a graceful catch — and it is
    // exactly what CANNOT save a loss-of-feed event, where the drying SG stops
    // absorbing heat no matter what the dump vents (the TMI differentiator).
    if (s.steam_dump_override == null && s.turbine_tripped) {
      var tnl_dump = T_sat(dump_setpoint);
      var tavg_err = (s._ins_tavg != null ? s._ins_tavg : s.tavg_c) - tnl_dump;
      dump = Math.max(dump, clip(tavg_err / (sg.dump_trip_mode_band_c || 8.0), 0, 1));
    }
    // Physical capacity of the turbine-bypass/dump. THIS PLANT (FG-4 ride-out,
    // feel-plan P4): ~105 % of rated steam flow — a full load rejection is caught
    // by the dump alone (no anticipatory reactor trip exists). The cap still
    // rate-limits an operator slamming the dump open on a cooldown. Applies to
    // both the manual override and the auto proportional demand.
    dump = Math.min(dump, sg.steam_dump_max);
    // MSIV: both downstream paths (turbine steam + dump-to-condenser) are
    // behind the isolation valve; closing it bottles the steam generator.
    if (s.msiv_open === false) dump = 0;
    // No condenser, no bypass path (TR-8/CC-7): a lost condenser (vacuum decay,
    // SBO) removes the dump entirely — the SG falls back on its code safeties.
    if (s.condenser_cooling_available === false) dump = 0;
    s.steam_dump_frac = dump;

    // SG code safety valves — UPSTREAM of the MSIV, the relief that remains
    // when the SG is bottled. COMMANDED state (open_sg_safety/close_sg_safety):
    // the control layer's actuation pops them above sg_safety_open_mpa and
    // reseats below sg_safety_reseat_mpa reading the steam_pressure INSTRUMENT
    // (2026-07 ruling: relief logic lives in the control layer). The engine
    // keeps the hydraulics — proportional flow between reseat and pop once
    // open. Above the 8.90 MPa no-load dump setpoint, so the dump handles
    // normal duty and the safeties are the backstop.
    var sg_relief = s.sg_safety_open
      ? sg.sg_safety_flow_max * clip((s.steam_pressure_mpa - sg.sg_safety_reseat_mpa)
          / (sg.sg_safety_open_mpa - sg.sg_safety_reseat_mpa), 0, 1)
      : 0;
    s.sg_safety_flow = sg_relief;

    var steam_out = s.steam_flow_normalized + dump + sg_relief;
    // Total SG draw (turbine + dump + safeties) — the flow any feed regulation
    // actually matches. Exposed for the disconnected-mode feed coupling
    // (load_mode.js): after a turbine trip the dump still draws, and feed must
    // follow THAT or the ride-out silently drains the SG (FG-4, feel-plan P4).
    s.steam_out_total = steam_out;

    // SG level (the true level; shrink/swell is added in the instrument model §8.4).
    // WIDE range is the integrated inventory over the whole vessel, clamped only at the
    // physical bounds [0,100]. NARROW (working) range is derived as the sg_wr_lo..sg_wr_hi
    // window of it — so when narrow pegs on an overfill/dryout, wide keeps moving. The wide
    // gain is scaled from K_sg_level so the narrow reading's IN-WINDOW dynamics are identical
    // to the old direct-narrow integration (d(narrow) = K_sg_level·imbalance while unpegged).
    var wr_lo = sg.sg_wr_lo, wr_hi = sg.sg_wr_hi, wr_span = wr_hi - wr_lo;
    var dWide = (feedwater_flow - steam_out) * sg.K_sg_level * (wr_span / 100);
    s.sg_level_wide_pct = clip((s.sg_level_wide_pct != null ? s.sg_level_wide_pct : wr_lo + wr_span * s.sg_level_pct / 100) + dWide * dt, 0, 100);
    s.sg_level_pct = clip((s.sg_level_wide_pct - wr_lo) / wr_span * 100, 0, 100);

    // Tube-bundle dryout DEPLETION (MD-6 structural fix — see pwr_config sg_dryout_*):
    // a bundle that is below the uncovery threshold AND receiving no feed boils its
    // residual film off toward zero conductance (τ deplete); any feedwater ≥ feed_eps
    // rewets it (τ rewet) — AFW wets the tubes even while the pool level is still
    // rebuilding, which is what keeps a recoverable loss of MFW (TR-2) at the full
    // residual through its brief dry transit. pwr_thermal.stepCoolant reads this
    // NEXT step (explicit coupling, CONTEXT §11) and scales sg_dryout_residual by
    // (1 − deplete).
    var th = cfg.thermal;
    var dryUnfed = s.sg_level_wide_pct < (th.sg_dryout_wide_pct || 30)
                && feedwater_flow < (th.sg_dryout_feed_eps || 0.01);
    var dep = s.sg_dry_deplete || 0;
    var depTau = dryUnfed ? (th.sg_dryout_deplete_tau || 300) : (th.sg_dryout_rewet_tau || 45);
    s.sg_dry_deplete = clip(dep + ((dryUnfed ? 1 : 0) - dep) / depTau * dt, 0, 1);

    // Secondary pressure and steam flow.
    var dSteamP = (steam_generation_rate - steam_out) * sg.K_steam_pressure;
    s.steam_pressure_mpa += dSteamP * dt;

    // §9.1 main steam line break: blows the secondary down (overcooling).
    if (s._fail.steam_break.active) {
      s.steam_pressure_mpa -= cfg.physics_failures.STEAM_BREAK_RATE * s._fail.steam_break.size * dt;
    }
    // Thermodynamic bound (feel-plan P5): the secondary saturates from PRIMARY
    // heat, so it can never sit hotter than the coolant heating it — cap SG
    // pressure at Psat(Tavg). Kills the cold-SG pressurization runaway (a
    // marginal-ΔT bottling artifact where the integrating SG out-heated the
    // primary at ~1 °C/s and blew the RCS past the high-pressure trip during
    // every cold pressurization — previously masked by the fire-hose spray).
    var psat_tavg_cap = Math.pow(Math.max(s.tavg_c, 1) / 179.47, 1 / 0.239);
    if (s.steam_pressure_mpa > psat_tavg_cap) s.steam_pressure_mpa = psat_tavg_cap;
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
    if (s.msiv_open === false) s.steam_flow_normalized = 0;   // MSIV shut — no steam past it, whatever the governor asks
  }

  // Step 12 — turbine and condenser (behavioral).
  function stepTurbine(s, cfg, dt) {
    var tb = cfg.turbine;

    // Vacuum: restores toward rated when condenser cooling is available, else
    // decays slowly toward the lost value (a realistic lag).
    var target = s.condenser_cooling_available ? tb.vacuum_rated : tb.vacuum_lost;
    var tau = s.condenser_cooling_available ? tb.vacuum_restore_tau : tb.vacuum_decay_tau;
    s.condenser_vacuum_kpa += (target - s.condenser_vacuum_kpa) / tau * dt;

    // Turbine PROTECTION (low-vacuum trip, overspeed trip) lives in the control
    // layer, which reads the condenser_vacuum / turbine_rpm INSTRUMENTS and
    // issues trip_turbine (2026-07 ruling — HR7: a tripped turbine is a
    // command-level event). The engine only spins the machine.
    if (s.turbine_tripped) {
      // Tripped / disconnected: the stop valves are shut, so there is no admission
      // steam and the rotor coasts down on windage/bearing friction toward rest —
      // it does NOT hold rated (that was the "1800 rpm while off" bug).
      s.turbine_rpm += (0 - s.turbine_rpm) / (tb.coastdown_tau || 40) * dt;
      if (s.turbine_rpm < 1) s.turbine_rpm = 0;
    } else if (s.generator_load > 0) {
      // Synchronised to the grid: the grid holds the generator at rated speed
      // (a synchronous machine spins at rated at any load, incl. a light startup load).
      s.turbine_rpm += (tb.rpm_rated - s.turbine_rpm) / (tb.sync_tau || 0.5) * dt;
    } else {
      // Connected but unloaded (a load reject before the trip): admission steam with
      // the load gone accelerates the rotor toward the overspeed trip.
      var net_torque = s.steam_flow_normalized * tb.torque_per_flow
                     - s.generator_load * tb.torque_per_load;
      s.turbine_rpm += (net_torque / tb.turbine_inertia) * dt;
      if (s.turbine_rpm < 0) s.turbine_rpm = 0;
    }

    // A disconnected generator carries no grid load, so it produces no electrical
    // output regardless of shaft speed.
    s.mwe_output = s.turbine_tripped ? 0
      : (s.power_pct / 100) * tb.mwe_rated * (s.turbine_rpm / tb.rpm_rated) * (s.condenser_vacuum_kpa / tb.vacuum_rated);
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
