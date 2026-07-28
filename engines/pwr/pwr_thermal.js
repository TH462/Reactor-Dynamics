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
    // SG tube-bundle uncovery (TR-3 / the TMI dryout mechanism, feel-plan P5):
    // heat transfer needs wetted tubes. As the WIDE-range level falls below the
    // uncovery threshold the bundle progressively dries and Q collapses toward a
    // small steam-side residual — a dry SG is NOT a heat sink, which is exactly
    // what turns a blocked-AFW loss of feed into the TMI repressurization. Normal
    // ops (wide ≈ 55-65) and the AFW hold (wide ≈ 40) sit above the threshold.
    // The steam-side residual itself DEPLETES when the bundle stays dry and unfed
    // (s.sg_dry_deplete, stepped by pwr_steam_generator; previous step — explicit
    // coupling): a sustained total loss of feed genuinely loses the heat sink
    // (MD-6), while a fed dry transit (TR-2, AFW running) keeps the full residual.
    var _wide = s.sg_level_wide_pct != null ? s.sg_level_wide_pct : 50;
    var _wet = _wide >= (t.sg_dryout_wide_pct || 30) ? 1
             : Math.max(0, _wide / (t.sg_dryout_wide_pct || 30));
    var _resid = (t.sg_dryout_residual || 0.05) * (1 - (s.sg_dry_deplete || 0));
    var _dry_factor = _resid + (1 - _resid) * _wet;
    var Q_coolant_to_sg = t.h_sg * s.flow_frac * _dry_factor * (s.tavg_c - s.t_secondary_c);
    // REVERSE flow (SG hotter than the primary — e.g. a cold RCS with the
    // secondary at atmospheric saturation ~100 °C) transfers poorly: the
    // boiling regime that gives the SG its rated conductance only exists
    // primary→secondary; backwards it is condensate-film/natural convection.
    // Without this, starting RCPs on a cold plant let the Tsat-floored
    // secondary back-heat the primary at ~1 °C/s forever (an infinite-
    // reservoir artifact the old fire-hose spray masked as a pressure spike).
    if (Q_coolant_to_sg < 0) Q_coolant_to_sg *= (t.sg_reverse_frac || 0.05);
    s._Q_coolant_to_sg = Q_coolant_to_sg;
    // Residual Heat Removal (RHR, §6.9): the low-pressure shutdown-cooling loop.
    // Active = the hot-leg suction valve is open (s.rhr_active; the valve interlock
    // already guarantees pressure is within the RHR band, so no pressure gate here).
    // Heat removed scales with the HX flow split (set_rhr_hx): the operator throttles
    // cooldown rate by routing more/less of the constant loop flow through the heat
    // exchanger vs. the bypass. Draws the coolant node toward the cooldown sink.
    var e = cfg.emergency, Q_rhr = 0;
    if (s.rhr_active && s.condenser_cooling_available) {
      var hxFrac = (s.rhr_hx_fraction != null ? s.rhr_hx_fraction : 1);
      // The RHR heat exchanger rejects to the same circulating water the condenser uses, so
      // its sink temperature moves with the CW inlet: warm circ water raises the floor a
      // cooldown can reach and slows the approach to it. Referenced to cw_inlet_ref_c so the
      // default is the calibrated rhr_sink_c exactly.
      var tbc = (cfg.turbine || {});
      var cwRef = tbc.cw_inlet_ref_c != null ? tbc.cw_inlet_ref_c : 26.7;
      var cwNow = s.cw_inlet_temp_c != null ? s.cw_inlet_temp_c : cwRef;
      var sink = e.rhr_sink_c + (cwNow - cwRef);
      Q_rhr = e.rhr_gain * hxFrac * Math.max(0, s.tavg_c - sink);
    }
    // RCP heat: pump shaft work deposited in the coolant, scaled by flow — the
    // real no-load heat source (heats the plant if the heat sink is isolated),
    // and its loss slightly speeds a post-trip cooldown.
    var Q_pump = t.heat_gen_coeff * (t.pump_heat_frac || 0) * s.flow_frac;
    var dTavg = (Q_fuel_to_coolant + Q_pump - Q_coolant_to_sg - Q_rhr) / t.coolant_heat_capacity;
    // Cold ECCS injection quench (§6.2/§6.3): HPI/LPI and the accumulators inject borated
    // RWST/SIT water well below Tavg, removing sensible heat as it mixes — the thermal
    // shock of a large-break accumulator dump. Perfect-mixing pull of Tavg toward
    // eccs_temp_c at the injection throughput rate stashed by stepInventory (inventory-
    // frac/s, PREVIOUS step — explicit coupling), scaled by eccs_cooling_gain. Added as a
    // direct °C/s contribution (already a fractional-throughput × ΔT rate, so NOT divided
    // by coolant_heat_capacity like the power terms). Self-limiting: cools no further than
    // eccs_temp_c, and is exactly 0 when no injection is flowing. RHR is not here — it is
    // recirculation (Q_rhr above), not cold make-up.
    var q_inj = s._eccs_inj_inv || 0;
    if (q_inj > 0 && e.eccs_temp_c != null) {
      dTavg += (e.eccs_cooling_gain != null ? e.eccs_cooling_gain : 0) * q_inj * (e.eccs_temp_c - s.tavg_c);
    }
    // Break blowdown flash-cooling (§6.2/§6.3): coolant leaving a primary break (s.leak_flow)
    // carries enthalpy, and the remaining inventory flashes to replace it, removing latent heat.
    // Self-limiting perfect-mixing pull of Tavg toward blowdown_sink_c (containment saturation)
    // at the break throughput rate, scaled by blowdown_gain — the SAME form as the ECCS quench
    // above. This is what makes the saturation plateau respond to break size (small break: decay
    // heat dominates, Tavg holds high, Psat pins pressure > 600 psi; large break: this dominates,
    // Tavg falls toward containment, pressure follows Psat(tavg) below the accumulator setpoint).
    // Keyed on leak_flow ONLY (a stuck-open PORV vents the steam space, leak_flow=0 → no effect,
    // so the flagship TMI path is untouched). Cannot cool below blowdown_sink_c; exactly 0 with
    // no break.
    var q_leak = s.leak_flow || 0;
    if (q_leak > 0 && t.blowdown_gain) {
      dTavg += t.blowdown_gain * q_leak * ((t.blowdown_sink_c != null ? t.blowdown_sink_c : 100) - s.tavg_c);
    }
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

  // Step 14a — partial-uncovery hot node (#213): peak cladding temperature of the
  // exposed (uppermost) fuel region. The bulk fuel node above averages the WHOLE
  // core, so a core held partially uncovered (inventory between significant_uncover
  // and core_top_uncover) read as fully cooled and could sit there forever — while
  // at TMI-2 exactly that condition (top ~half exposed under an hour) failed the
  // cladding and melted part of the core. Exposed clad is steam-cooled only: it
  // heats at the local decay-heat rate (lumped: total heat × uncovered fraction)
  // against weak convection toward Tsat. When the core re-covers, the node quenches
  // back to the wetted-core temperature on the reflood timescale. Below
  // significant_uncover the fraction saturates at 1 and this node keeps cooking
  // alongside the existing bulk h_fc collapse — one consistent story, no handoff.
  function stepCladding(s, cfg, dt) {
    var t = cfg.thermal, p = cfg.primary;
    if (s.clad_temp_c == null) s.clad_temp_c = (s.thot_c != null ? s.thot_c : s.tavg_c); // lazy init (new field; old saves)
    var mass = s.core_inventory_pct / 100;
    var f_unc = (p.core_top_uncover - mass) / (p.core_top_uncover - p.significant_uncover);
    f_unc = f_unc < 0 ? 0 : (f_unc > 1 ? 1 : f_unc);
    if (f_unc > 0) {
      var heat = (t.clad_heat_gain || 0) * (s._Q_total || 0) * f_unc;
      var cool = (t.clad_steam_h || 0) * (s.clad_temp_c - T_sat(s.pressure_mpa));
      s.clad_temp_c += (heat - cool) * dt;
    } else {
      var wet = (s.thot_c != null ? s.thot_c : s.tavg_c);
      s.clad_temp_c += (wet - s.clad_temp_c) * dt / ((t.clad_quench_tau || 120) + dt);
    }
    // The bulk node can outrun the hot node on a fast deep uncovery (h_fc collapse
    // heats the average core directly) — the PEAK clad is never cooler than that.
    if (s.clad_temp_c < s.fuel_temp_c) s.clad_temp_c = s.fuel_temp_c;
  }

  // Step 14 — fuel damage / melt endpoint (thresholds fixed). Judged at the PEAK
  // clad/fuel temperature: the hot node fails first on partial uncovery (#213),
  // the bulk node on whole-core loss of cooling — damage is local before it is
  // average, so the max of the two is the physical criterion.
  function checkDamage(s, cfg) {
    var t = cfg.thermal;
    var peak = (s.clad_temp_c != null && s.clad_temp_c > s.fuel_temp_c) ? s.clad_temp_c : s.fuel_temp_c;
    if (peak > t.fuel_damage_c) s.fuel_damaged = true;
    if (peak > t.fuel_melt_c) {
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
    stepCladding: stepCladding,
    checkDamage: checkDamage,
  };

})(globalThis.RD || (globalThis.RD = {}));
