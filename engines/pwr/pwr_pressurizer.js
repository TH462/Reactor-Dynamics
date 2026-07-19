/*
 * pwr_pressurizer.js — pressurizer pressure, heater/spray, PORV + spring safety
 * valves, and the surge-line level behavior that produces the TMI deception
 * (M1 §6.4). Pure functions over the engine state `s` and config `cfg`.
 *
 * HR2: the engine makes no control decisions. The PORV reflects its COMMANDED
 * demand (set by open_porv/close_porv, which in the real stack come from M4's
 * actuation) and the stuck-open failure. The spring safety valves likewise
 * reflect commanded state (open_pzr_safety/close_pzr_safety — M4's actuation
 * reads the pressure INSTRUMENT against safety_open_mpa/safety_reseat_mpa):
 * per the 2026-07 design ruling, even mechanical relief logic lives in the
 * control layer so it can be manipulated and failed like everything else.
 * The engine keeps only the valve hydraulics (flow while open).
 *
 * Attaches RD.pwrPressurizer.
 */
;(function (RD) {
  'use strict';

  function clip(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }

  // Inverse of T_sat: saturation pressure (MPa) for a temperature (°C).
  function P_sat_from_T(T_c) { return Math.pow(Math.max(T_c, 1e-6) / 179.47, 1 / 0.239); }

  // Heater/spray proportional auto-control (§6.4); operator/failure overrides win.
  // The control target is the operator setpoint (s.pressure_setpoint) — normally
  // NOP (P_setpoint) but moved across the range on the Mode 5↔1 heatup/cooldown
  // path; falls back to the config NOP setpoint for pre-setpoint saves.
  function autoControl(s, cfg) {
    var p = cfg.pressurizer;
    var setpoint = (s.pressure_setpoint != null) ? s.pressure_setpoint : p.P_setpoint;
    if (s.heater_override != null) { s.heater_power_frac = s.heater_override; }
    else {
      var err = setpoint - s.pressure_mpa;
      s.heater_power_frac = err > 0 ? clip(err / p.heater_band_mpa, 0, 1) : 0;
    }
    if (s.spray_override != null) { s.spray_flow_frac = +s.spray_override; }  // fraction (or boolean → 0/1)
    else {
      var err2 = setpoint - s.pressure_mpa;
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

    // Spring safety valves: COMMANDED state (open_pzr_safety/close_pzr_safety —
    // the control layer's actuation pops them at safety_open_mpa and reseats at
    // safety_reseat_mpa, reading the pressure instrument). Flow is hydraulics.
    s.safety_flow = s.safety_open ? p.safety_flow_max * dP_ratio : 0;
  }

  // Step 7 — primary pressure.
  function stepPressure(s, cfg, dt) {
    var p = cfg.pressurizer;
    autoControl(s, cfg);
    relief(s, cfg);
    // Spray draws from the cold leg downstream of the Reactor Coolant Pump (RCP),
    // so its effectiveness scales with primary flow — no flow, no spray.
    // Spray condenses the pressurizer steam bubble to control pressure, but it cannot
    // pull the LOOP below the saturation pressure of the HOTTEST coolant (Thot, the
    // core exit): below that the exit flashes to steam (pwr_thermal clamps the leg
    // split at Tsat) and boiling — not pressure control — takes over. Taper the spray's
    // authority to zero across a band above Psat(thot), so full heaters vs. full spray
    // floors just at the onset of core-exit boiling instead of running the primary down
    // to the containment floor. This is self-limiting: once thot pins to Tsat(P) the
    // floor equals P and spray stops. On a real cooldown Thot falls too, so the floor
    // tracks down and spray keeps depressurizing as fast as the plant actually cools.
    var spray_floor = P_sat_from_T(s.thot_c != null ? s.thot_c : s.tavg_c);
    var spray_authority = clip((s.pressure_mpa - spray_floor) / (p.spray_floor_band || 1.0), 0, 1);
    var spray_eff = s.spray_flow_frac * clip(s.flow_frac != null ? s.flow_frac : 1, 0, 1) * spray_authority;
    // Break blowdown depressurizes the RCS — but ONLY while subcooled. Subcooled blowdown
    // (liquid out, bubble collapse) drives pressure directly down to saturation; once the
    // primary voids, the break vents steam that decay heat re-boils, so further depressurization
    // is governed by how fast the coolant COOLS (thermal.blowdown_gain → Tavg → the sat-pull
    // below), NOT this direct term. Gating it to the subcooled regime keeps pressure slaved to
    // Psat(tavg) in two-phase — thermodynamically consistent — instead of forcing impossible
    // superheat (pressure far below Psat(tavg) while Tavg stays hot).
    var leak_depress = (s.primary_void_fraction > 0) ? 0 : (p.K_leak_depressurize || 0) * (s.leak_flow || 0);
    var dP = s.heater_power_frac * p.K_heater
           - spray_eff * p.K_spray
           - s.porv_flow * p.K_porv_relief
           - s.safety_flow * p.K_safety_relief
           - leak_depress
           + p.K_surge * (s._dTavg_dt || 0);              // thermal insurge raises pressure
    if (s.primary_void_fraction > 0) {
      // Two-phase: pressure collapses toward the saturation pressure of Tavg.
      dP += p.K_sat_pull * (P_sat_from_T(s.tavg_c) - s.pressure_mpa);
    } else {
      // Gentle self-restore toward the operator setpoint (heaters/charging holding
      // pressure). Tracks s.pressure_setpoint so a cold/depressurized plant holds
      // its low pressure instead of being dragged back to NOP.
      var setpoint = (s.pressure_setpoint != null) ? s.pressure_setpoint : p.P_equilibrium;
      dP += p.P_restore_rate_gain * (setpoint - s.pressure_mpa);
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
    // CVCS net make-up: charging adds liquid to the primary (insurge → level up),
    // letdown bleeds it (level down). This is what gives charging real authority over
    // indicated level so AUTO make-up can hold it. Small gain, bounded by
    // charging_max/letdown (~0.07), so it never competes with the fast void_surge that
    // drives the TMI deception (where charging is isolated anyway).
    var cvcs_surge = ((s._charging_actual || 0) - (s.letdown_flow || 0)) * p.K_cvcs_level;
    var surge_in_rate = thermal_surge + void_surge + cvcs_surge;
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
