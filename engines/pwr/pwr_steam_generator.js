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

  // Saturation pressure of water in kPa for 0–100 °C (Antoine, mmHg form).
  //
  // The plant-wide T_sat/P_sat_from_T pair is a power-law fitted to the 0.1–10 MPa range
  // the RCS and SG live in; down at condenser pressures (a few kPa) it is wrong by nearly
  // an order of magnitude — it puts Psat(32 °C) at 0.7 kPa against a true 4.75. The
  // condenser needs the low-temperature curve, so it gets its own. Checked: 32 °C → 4.74
  // (true 4.75), 45 °C → 9.56 (true 9.59), 66 °C → 26.1 (true 26.2).
  function pSatLowKpa(tC) {
    var t = clip(tC, 0, 100);
    return Math.pow(10, 8.07131 - 1730.63 / (233.426 + t)) * 0.1333224;   // mmHg → kPa
  }

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
    // loss → SG inventory falls → lo-lo trip — THESE paths trip on a genuine limit
    // rather than on anticipation (FG-4). Narrowed from "never on anticipation" (#220):
    // that was written before #216, and since then a turbine trip above P-9 IS an
    // anticipatory scram (TR-1b). What survives is the FG-4 claim about these two chains
    // specifically — a lost condenser or a bottled boiler kills the feed, and the plant
    // then trips on SG lo-lo, which no anticipatory signal covers. A plain turbine trip
    // keeps the MSIV open, so the load-rejection ride-out (TR-1) keeps its feed.
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
    // THE SG BOILS OFF WHATEVER HEAT CROSSES IT — core heat and RCP pump heat alike.
    // Rated steam flow is therefore the flow made by NSSS RATED HEAT (rated core heat
    // PLUS full-flow pump heat), not by core heat alone, which is how a real plant
    // rates its steam generators: NSSS thermal power, not core thermal power (a
    // Westinghouse 4-loop quotes core 3411 MWt / NSSS 3425 MWt — the difference IS
    // pump heat). Normalizing the generation rate on that is what lets this line carry
    // no correction term at all: pump heat gets a real steam sink at power, because the
    // follow governor's demand is normalized the same way (pwr_engine
    // `_loadModeOpts.extractFrac`), and a bottled SG at no load pressurizes on pump
    // heat exactly as a real one does.
    //
    // It used to be NETTED OUT here — `Math.max(0, Q_sg − Q_pump)`, booked in the
    // comment as "SG blowdown/ambient losses". It was not that: it was sized to cancel
    // pump heat identically at every flow, and it made a heatup on pump heat
    // MATHEMATICALLY IMPOSSIBLE. The steam side could not start boiling until Q_sg
    // exceeded Q_pump, but Q_sg = h_sg·(Tavg − Tsec) settles at exactly Q_pump and
    // stops — measured, a stable attractor at Tavg 218.69 °F (103.72 °C) with
    // ΔT = 0.321 °F = Q_pump/h_sg to three decimals, and it sits there forever. That
    // is why the Mode 5 → Mode 3 mission had to take the reactor critical to heat the
    // plant up. Issue #251.
    var steam_generation_rate = Q_sg / (sg.latent_heat_secondary * (1 + (cfg.thermal.pump_heat_frac || 0)));

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
    // ARMED, not continuously modulating — measured (#219). An unarmed Tavg-error dump
    // vents 6.5 % at steady full power forever, and opens into a deliberate rod
    // withdrawal hard enough that the overcool + MTC runs power to 114 %. So the arm is
    // real; only its threshold is a judgement call (see pwr_config dump_load_reject_mwe).
    //   ARM: a turbine trip, or `load_rejected_mwe` past dump_load_reject_mwe.
    //   RESET: when |load_imbalance_mwe| falls inside dump_reject_clear_mwe — the reactor
    //     has come back to meet the load, so the ride-out is over. It cannot reset on the
    //     arm signal itself, which decays in ~60 s while a ride-out lasts as long as the
    //     reactor is over the load.
    // `load_rejected_mwe` (load_mode.js) is a WASHOUT of the load target — a first-order
    // reference minus the target is a high-pass filter, i.e. a rate-of-decrease detector.
    // That is C-7 class in structure: it cannot fire at steady load however large, and it
    // does not fire when the operator RAISES load.
    var rejectMwe = s.load_rejected_mwe || 0;
    if (rejectMwe > (sg.dump_load_reject_mwe || Infinity)) s.dump_reject_mode = true;
    else if (Math.abs(s.load_imbalance_mwe || 0) < (sg.dump_reject_clear_mwe || 0)) s.dump_reject_mode = false;
    if (s.steam_dump_override == null && (s.turbine_tripped || s.dump_reject_mode)) {
      // Reference Tavg is PROGRAMMED ON TURBINE LOAD, not pinned to the no-load anchor
      // (#219). This is the same sliding program the rod controller already runs (SS-2,
      // catalog §8.1, `pwr_control.js trefProgram`): no-load Tsat(dump setpoint) at zero
      // load, the full-power coolant equilibrium at rated. Dump and rods therefore share
      // one reference, as a real plant's do, and the endpoints derive from the same config
      // so the two cannot drift apart.
      //
      // Why it matters: against the FIXED no-load anchor the error is ~13 °C at steady full
      // power against an 8 °C band — i.e. the demand is SATURATED whenever the plant is at
      // power, carrying no information about the size of the event. Every measured pathology
      // followed from that, and a mismatch-fraction cap had to be bolted on to put the size
      // information back. Programmed, the error is ~0 at any steady load and grows with the
      // size of the rejection, so the demand is proportional on its own and the cap is gone.
      // Measured on a 41 MWe rejection: capped, the dump overcooled and MTC ran power to
      // 102.7 %; programmed and uncapped, 99.2 %.
      //
      // On a turbine trip load goes to zero, so the program collapses to the no-load anchor
      // and the trip case is unchanged by construction.
      var tnl_dump = T_sat(dump_setpoint);
      var t_fullpower = T_sat(sg.steam_p_rated)
        + (cfg.thermal.heat_gen_coeff * (1 + (cfg.thermal.pump_heat_frac || 0))) / cfg.thermal.h_sg;
      // HR1: programmed on the steam-flow INSTRUMENT, like the rod channel's Tref and like
      // the instrumented Tavg below — an automatic control reads indications, not truth.
      var loadFrac = clip(s._ins_steam_flow != null ? s._ins_steam_flow : (s.steam_flow_normalized || 0), 0, 1);
      var tref_dump = tnl_dump + (t_fullpower - tnl_dump) * loadFrac;
      var tavg_err = (s._ins_tavg != null ? s._ins_tavg : s.tavg_c) - tref_dump;
      dump = Math.max(dump, clip(tavg_err / (sg.dump_trip_mode_band_c || 8.0), 0, 1));
    }
    // Physical capacity of the turbine-bypass/dump: **40 % of rated steam flow**, the
    // prototypical value *(OWNER RULING, 2026-07-31: "Let's change it to 40%.")* —
    // *"In most Westinghouse units the capacity of the steam dump system is 40%"* (NRC
    // Westinghouse Technology Systems Manual §11.2, ML11223A294). Sized in the real plant
    // for a 50 % loss of load (40 % dump + a 10 % rod step) and to keep the SG safeties
    // seated on a trip from 100 %; measured, this plant reproduces both. Derivation,
    // measurements and the teaching argument live at the constant, in `pwr_config.js`.
    //
    // THIS COMMENT HAS BEEN WRONG TWICE, which is worth a moment given what it guards.
    // It read "(no anticipatory reactor trip exists)" — true when written, FALSE from
    // 2026-07-26 when #216 turned Reactor Trip on Turbine Trip ON. Corrected by #220 to
    // say the 105 % capacity spoke only to the load-rejection case. Then the capacity
    // itself moved. A comment carrying a NUMBER and a CONSEQUENCE will rot at whichever
    // of the two changes first; keep the number where the constant is.
    //
    // What survives unchanged: a turbine trip above P-9 scrams (TR-1b) and a load
    // rejection with the turbine on line is ridden out (TR-1). Those are different design
    // cases in the real plant too, and the capacity only ever spoke to the second.
    //
    // The cap still rate-limits an operator slamming the dump open on a cooldown. Applies
    // to both the manual override and the auto proportional demand.
    dump = Math.min(dump, sg.steam_dump_max);
    // MSIV: both downstream paths (turbine steam + dump-to-condenser) are
    // behind the isolation valve; closing it bottles the steam generator.
    if (s.msiv_open === false) dump = 0;
    // No condenser, no bypass path (TR-8/CC-7): a lost condenser (vacuum decay,
    // SBO) removes the dump entirely — the SG falls back on its code safeties.
    if (s.condenser_cooling_available === false) dump = 0;
    s.steam_dump_frac = dump;

    // SG code safety valves — UPSTREAM of the MSIV, the relief that remains
    // when the SG is bottled. SELF-ACTUATING on TRUE steam pressure (#369): a
    // code safety is a spring-loaded ASME device opened by the fluid it
    // protects against — no instrument, no logic, no power in its path, and
    // that independence is the entire reason it is the backstop. The pop used
    // to be a control-layer actuation reading the steam_pressure INSTRUMENT;
    // the #297 audit measured one stuck transmitter carrying a survivable
    // MSIV closure to clad melt (2696 psi SG, 3226 °F clad at 40 min). Same
    // family as the RHR autoclosure and the accumulators: mechanical beats
    // command. Sits above the steam_dump_setpoint anchor, so the dump handles
    // normal duty and the safeties are the backstop.
    if (!s.sg_safety_open && s.steam_pressure_mpa > sg.sg_safety_open_mpa) s.sg_safety_open = true;
    else if (s.sg_safety_open && s.steam_pressure_mpa < sg.sg_safety_reseat_mpa) s.sg_safety_open = false;
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
    // The MSIV gates it, by break LOCATION (#199). A break DOWNSTREAM of the valve
    // (turbine hall) has the MSIV between it and the generator, so shutting the
    // valve isolates the SG and the blowdown stops dead — the operator's one real
    // lever on this casualty, and the reason the alarm-response card sends you to
    // the MSIV. A break UPSTREAM (inside containment, between SG and valve) is on
    // the wrong side of every isolation this single-loop plant owns: it blows the
    // generator down no matter what the operator shuts. Before this the sink ran
    // unconditionally, so closing the MSIV mid-break changed nothing at all while
    // the manual and the catalog both claimed it did.
    var brk = s._fail.steam_break;
    if (brk.active && (brk.upstream || s.msiv_open !== false)) {
      s.steam_pressure_mpa -= cfg.physics_failures.STEAM_BREAK_RATE * brk.size * dt;
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

    // Vacuum: restores toward the achievable value when condenser cooling is AVAILABLE,
    // else decays slowly toward the lost value (a realistic lag). Availability stays a
    // separate boolean — it is what the vacuum_decay and full_blackout malfunctions cut,
    // and losing circ water entirely is not the same thing as circ water being warm.
    //
    // When cooling IS available, how much vacuum you get is set by the circulating-water
    // temperature: the condenser pulls the exhaust down to saturation at the condensing
    // temperature, which sits a terminal difference above the CW outlet. Expressed as the
    // CHANGE in backpressure from the reference condition, so cw_inlet == cw_inlet_ref_c
    // reproduces vacuum_rated exactly.
    var target;
    if (s.condenser_cooling_available) {
      var cwRef = tb.cw_inlet_ref_c != null ? tb.cw_inlet_ref_c : 26.7;
      var cw = s.cw_inlet_temp_c != null ? s.cw_inlet_temp_c : cwRef;
      // Condensing temperature rises with CW inlet AND with load (more heat rejected =
      // bigger rise across the tubes), so the derate bites hardest at full power.
      var loadFrac = clip((s.power_pct || 0) / 100, 0, 1.2);
      var span = (tb.cw_range_c != null ? tb.cw_range_c : 10) * loadFrac + (tb.cw_ttd_c != null ? tb.cw_ttd_c : 3);
      var dP = pSatLowKpa(cw + span) - pSatLowKpa(cwRef + span);   // kPa of extra backpressure
      target = clip(tb.vacuum_rated - dP, tb.vacuum_lost,
        tb.vacuum_max_kpa != null ? tb.vacuum_max_kpa : tb.vacuum_rated);
    } else {
      target = tb.vacuum_lost;
    }
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
    } else if (RD.LoadMode.isOnLine(s)) {
      // Synchronised to the grid: the grid holds the generator at rated speed
      // (a synchronous machine spins at rated at any load, incl. a light startup load).
      //
      // The test is the BREAKER, not the load. It used to ask `generator_load > 0`, so
      // an operator sliding the Manual load target to 0 MWe while synchronised fell into
      // the offline branch below and coasted the rotor 1800 -> 0 rpm over ~5 plant-minutes
      // with the breaker still closed and `turbine_tripped` false — #284, measured. A
      // machine tied to the grid does not decelerate at zero load; it motors.
      s.turbine_rpm += (tb.rpm_rated - s.turbine_rpm) / (tb.sync_tau || 0.5) * dt;
    } else {
      // OFF LINE (breaker open, untripped): admission-steam torque against windage/
      // bearing friction — the same coastdown the tripped branch models, because an
      // unloaded rotor with no admission steam IS the tripped case physically.
      // Without the friction term this branch held any rpm forever at zero steam,
      // which is how Modes 3/5 (authored untripped, no load, no steam) pinned
      // 1800 rpm on a cold plant (#235) — those ICs are authored `disconnected`, so
      // they still land here after #284 moved the on-line case out. NOTE the steam term
      // is inert at the authored constants (torque_per_flow/inertia ≤ 0.02 rpm/s), so the
      // "accelerates toward overspeed" this branch once claimed never actually
      // happened — recorded in #238; reviving it is a tuning decision, not this fix.
      // A real unit holds rated on no-load steam ready to re-synchronise; this engine
      // has no no-load admission model, and that limitation is unchanged (see the note
      // over RD.LoadMode.disconnect).
      var net_torque = s.steam_flow_normalized * tb.torque_per_flow
                     - s.generator_load * tb.torque_per_load;
      s.turbine_rpm += (net_torque / tb.turbine_inertia
                        - s.turbine_rpm / (tb.coastdown_tau || 40)) * dt;
      if (s.turbine_rpm < 1) s.turbine_rpm = 0;
    }

    // A disconnected generator carries no grid load, so it produces no electrical
    // output regardless of shaft speed.
    //
    // Output follows the steam the TURBINE is admitted, not the heat the REACTOR makes
    // (#284). This used to read `power_pct / 100`, which ignores both the governor and
    // the steam dump — so during a load rejection, with the dump venting the difference
    // to the condenser, the board still read full electrical output: measured, a
    // `set_load_target 50 MWe` ask at hot full power settled at 98.8 MWe indicated with
    // the dump at 48 %. The operator asked for 50 and the gauge said 99.
    //
    // CALIBRATION IS PRESERVED EXACTLY: `steam_flow_rated` is 1.0 in these normalized
    // units and the governor sits at 100 % at rated pressure, so `steam_flow_normalized`
    // is 1.0 at rated and this is bit-identical to the old form at 100 % power. What
    // moves is every state where flux and turbine admission DISAGREE — a rejection ride-
    // out, an MSIV closure (steam_flow_normalized is forced to 0 above), and the decay-
    // heat tail after a trip.
    //
    // The pressure term is already inside `steam_flow_normalized`, so a plant that
    // over-delivers on stored SG energy walks back down as the secondary sags rather
    // than holding an unphysical output.
    s.mwe_output = s.turbine_tripped ? 0
      : s.steam_flow_normalized * tb.mwe_rated * (s.turbine_rpm / tb.rpm_rated) * (s.condenser_vacuum_kpa / tb.vacuum_rated);
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
