/*
 * pwr_pressurizer.js — pressurizer pressure, heater/spray, PORV + spring safety
 * valves, and the surge-line level behavior that produces the TMI deception
 * (M1 §6.4). Pure functions over the engine state `s` and config `cfg`.
 *
 * HR2: the engine makes no control decisions. The PORV reflects its COMMANDED
 * demand (set by open_porv/close_porv, which in the real stack come from M4's
 * actuation) and the stuck-open failure; only the spring safety valves act on
 * pressure directly, because they are purely mechanical (HR7 physics).
 *
 * Attaches RD.pwrPressurizer.
 */
;(function (RD) {
  'use strict';

  function clip(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }

  // Inverse of T_sat: saturation pressure (MPa) for a temperature (°C).
  function P_sat_from_T(T_c) { return Math.pow(Math.max(T_c, 1e-6) / 179.47, 1 / 0.239); }

  // Heater/spray proportional auto-control (§6.4); operator/failure overrides win.
  function autoControl(s, cfg) {
    var p = cfg.pressurizer;
    if (s.heater_override != null) { s.heater_power_frac = s.heater_override; }
    else {
      var err = p.P_setpoint - s.pressure_mpa;
      s.heater_power_frac = err > 0 ? clip(err / p.heater_band_mpa, 0, 1) : 0;
    }
    if (s.spray_override != null) { s.spray_flow_frac = +s.spray_override; }  // fraction (or boolean → 0/1)
    else {
      var err2 = p.P_setpoint - s.pressure_mpa;
      s.spray_flow_frac = err2 < 0 ? clip(-err2 / p.spray_band_mpa, 0, 1) : 0;
    }
  }

  // Resolve actual valve positions and relief flows.
  function relief(s, cfg) {
    var p = cfg.pressurizer;
    // PORV actual position: commanded demand, unless stuck open (a command-level failure).
    s.porv_open = s.porv_stuck || (s.porv_demand === 'open');
    var dP_ratio = Math.sqrt(Math.max(0, (s.pressure_mpa - p.P_containment) / p.P_flow_ref));
    // The PORV block (isolation) valve is upstream of the PORV. Closing it stops
    // ALL flow through the PORV line — relief AND inventory loss — regardless of
    // PORV position. This is the key TMI recovery action (isolate a stuck-open
    // PORV the indicator falsely reads "closed"). Default open.
    var isolated = (s.block_valve_open === false);
    s.porv_flow = (s.porv_open && !isolated) ? p.porv_flow_max * dP_ratio : 0;

    // Spring safety valves: purely mechanical — open at 17.13, reseat at 16.55 MPa.
    if (s.pressure_mpa > p.safety_open_mpa) s.safety_open = true;
    else if (s.pressure_mpa < p.safety_reseat_mpa) s.safety_open = false;
    s.safety_flow = s.safety_open ? p.safety_flow_max * dP_ratio : 0;
  }

  // Step 7 — primary pressure.
  function stepPressure(s, cfg, dt) {
    var p = cfg.pressurizer;
    autoControl(s, cfg);
    relief(s, cfg);
    // Spray draws from the cold leg downstream of the Reactor Coolant Pump (RCP),
    // so its effectiveness scales with primary flow — no flow, no spray.
    var spray_eff = s.spray_flow_frac * clip(s.flow_frac != null ? s.flow_frac : 1, 0, 1);
    var dP = s.heater_power_frac * p.K_heater
           - spray_eff * p.K_spray
           - s.porv_flow * p.K_porv_relief
           - s.safety_flow * p.K_safety_relief
           - (p.K_leak_depressurize || 0) * (s.leak_flow || 0)  // break blowdown depressurizes the RCS
           + p.K_surge * (s._dTavg_dt || 0);              // thermal insurge raises pressure
    if (s.primary_void_fraction > 0) {
      // Two-phase: pressure collapses toward the saturation pressure of Tavg.
      dP += p.K_sat_pull * (P_sat_from_T(s.tavg_c) - s.pressure_mpa);
    } else {
      dP += p.P_restore_rate_gain * (p.P_equilibrium - s.pressure_mpa); // gentle self-restore
    }
    s.pressure_mpa = Math.max(0.1, s.pressure_mpa + dP * dt);
  }

  // PORV tailpipe / quench-tank line temperature. First-order pull toward the
  // flowing-discharge temperature while ANY relief flow passes (PORV or code
  // safeties share the discharge header), and a slow decay back toward the
  // warm-baseline (leaky-seat) temperature once the line is isolated or the
  // valve reseats. This is the honest-but-unalarmed indication that revealed
  // the stuck-open PORV at TMI-2 (~80 min) and Davis-Besse (~20 min).
  function stepTailpipe(s, cfg, dt) {
    var p = cfg.pressurizer;
    if (s.tailpipe_temp_c == null) s.tailpipe_temp_c = p.tailpipe_ambient_c;
    var flowing = (s.porv_flow + s.safety_flow) > 1e-6;
    var target = flowing ? p.tailpipe_hot_c : p.tailpipe_ambient_c;
    var tau = flowing ? p.tailpipe_heat_tau : p.tailpipe_cool_tau;
    s.tailpipe_temp_c += (target - s.tailpipe_temp_c) * (dt / (tau + dt));
  }

  // Step 8 (pzr part) — pressurizer level. void_surge pushes liquid INTO the
  // pressurizer as the primary voids, raising indicated level even as total
  // inventory falls: the TMI deception (§6.4).
  function stepLevel(s, cfg, dt) {
    var p = cfg.pressurizer;
    var thermal_surge = p.K_thermal_surge * (s._dTavg_dt || 0);
    var void_surge = p.K_void_surge * s.primary_void_fraction;
    var surge_in_rate = thermal_surge + void_surge;
    var dLevel = (surge_in_rate
                  - s.porv_flow * p.level_loss_per_flow
                  - s.safety_flow * p.level_loss_per_flow) * p.K_level;
    s.pzr_level_pct = clip(s.pzr_level_pct + dLevel * dt, 0, 100);
  }

  RD.pwrPressurizer = {
    P_sat_from_T: P_sat_from_T,
    autoControl: autoControl,
    relief: relief,
    stepPressure: stepPressure,
    stepLevel: stepLevel,
    stepTailpipe: stepTailpipe,
  };

})(globalThis.RD || (globalThis.RD = {}));
