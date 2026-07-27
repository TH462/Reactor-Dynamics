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

  // Effective control target: the operator setpoint (s.pressure_setpoint), but a
  // RAISED setpoint is slewed — the effective target (s._pressure_sp_eff) walks up
  // at setpoint_pressurize_slew_mpa_s so a big upward step pressurizes at the
  // plant's deliberate heatup pace instead of at full heater authority (~3 s for
  // 350→600 psi pre-fix). A LOWERED setpoint takes effect immediately. Disturbance
  // response at a fixed setpoint keeps the full proportional authority.
  function effectiveSetpoint(s, cfg, dt) {
    var p = cfg.pressurizer;
    var sp = (s.pressure_setpoint != null) ? s.pressure_setpoint : p.P_setpoint;
    var slew = p.setpoint_pressurize_slew_mpa_s;
    if (slew == null || dt == null) return sp;                    // no slew configured
    if (s._pressure_sp_eff == null) s._pressure_sp_eff = sp;      // seed (migrated save / first step)
    if (sp <= s._pressure_sp_eff) s._pressure_sp_eff = sp;        // down: immediate
    else {
      // Up: only the portion ABOVE current pressure slews — the target may catch
      // up to where pressure already is instantly (an operator freezing a
      // descent at "current + a little" must stop the pull-down NOW; only
      // commanding pressure to places it hasn't been is heater-paced).
      var base = Math.max(s._pressure_sp_eff, Math.min(sp, s.pressure_mpa));
      s._pressure_sp_eff = Math.min(sp, base + slew * dt);
    }
    return s._pressure_sp_eff;
  }

  // Heater/spray proportional auto-control (§6.4); operator/failure overrides win.
  // The control target is the (slewed) operator setpoint — normally NOP
  // (P_setpoint) but moved across the range on the Mode 5↔1 heatup/cooldown
  // path; falls back to the config NOP setpoint for pre-setpoint saves.
  function autoControl(s, cfg, setpointEff) {
    var p = cfg.pressurizer;
    var setpoint = (setpointEff != null) ? setpointEff
                 : (s.pressure_setpoint != null) ? s.pressure_setpoint : p.P_setpoint;
    var spCmd = (s.pressure_setpoint != null) ? s.pressure_setpoint : p.P_setpoint;
    if (s.heater_override != null) { s.heater_power_frac = s.heater_override; s._heater_dp_frac = s.heater_override; }
    else {
      // Indicated heater power reads against the COMMANDED setpoint (during a
      // slewed pressurization the heaters run hard, like a real pressurizer
      // heatup); the pressure-rate term uses the slewed effective target, so the
      // RATE stays at the heatup pace while the indication is honest.
      var errInd = spCmd - s.pressure_mpa;
      s.heater_power_frac = errInd > 0 ? clip(errInd / p.heater_band_mpa, 0, 1) : 0;
      var err = setpoint - s.pressure_mpa;
      s._heater_dp_frac = err > 0 ? clip(err / p.heater_band_mpa, 0, 1) : 0;
    }
    // A spray valve stuck open is mechanical: it beats BOTH the auto controller and
    // any operator demand, the way porv_stuck beats porv_demand in relief() (#200).
    if (s.spray_stuck) { s.spray_flow_frac = 1; }
    else if (s.spray_override != null) { s.spray_flow_frac = +s.spray_override; }  // fraction (or boolean → 0/1)
    else {
      var err2 = setpoint - s.pressure_mpa;
      s.spray_flow_frac = err2 < 0 ? clip(-err2 / p.spray_band_mpa, 0, 1) : 0;
    }
    // Physical spray capacity (CC-5): the spray line can only pass so much — the
    // cap binds auto demand and operator override alike, so a loss-of-heat-sink
    // repressurization outruns it (the PORV does its job) while a step insurge
    // is still arrested.
    if (p.spray_flow_max != null) s.spray_flow_frac = clip(s.spray_flow_frac, 0, p.spray_flow_max);
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
    var spEff = effectiveSetpoint(s, cfg, dt);
    autoControl(s, cfg, spEff);
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
    // Saturated regime = the primary voids OR Tavg is at/above Tsat(P) (Psat(Tavg) ≥ P).
    // There, pressure is slaved to Psat(Tavg) by flashing (the sat-pull below), so the
    // subcooled-LIQUID terms — the break depressurization and the thermal expansion/
    // contraction surge — are suppressed: a rapid cooldown (e.g. an HPI cold quench)
    // must NOT crash pressure via K_surge below saturation; the vapour space compensates
    // and pressure just tracks Psat(Tavg) down as the coolant cools.
    var p_sat_tavg = P_sat_from_T(s.tavg_c);
    var saturated = s.primary_void_fraction > 0 || p_sat_tavg > s.pressure_mpa;
    var leak_depress = saturated ? 0 : (p.K_leak_depressurize || 0) * (s.leak_flow || 0);
    var dP = (s._heater_dp_frac != null ? s._heater_dp_frac : s.heater_power_frac) * p.K_heater
           - spray_eff * p.K_spray
           - s.porv_flow * p.K_porv_relief
           - s.safety_flow * p.K_safety_relief
           - leak_depress
           + (saturated ? 0 : p.K_surge * (s._dTavg_dt || 0));   // thermal surge — subcooled liquid only
    if (saturated) {
      // Two-phase OR superheated: a liquid cannot superheat — as pressure falls to the
      // saturation pressure of Tavg the coolant flashes, and that flashing PINS pressure
      // AT Psat(Tavg) rather than letting it crash below (which would report impossible
      // negative subcooling). The operator depressurizes by COOLING (Tavg down → Psat
      // down), which this tracks. Also engages when the primary voids (TMI erosion). The
      // superheat branch is independent of the void bookkeeping, so a depressurization at
      // FULL/overfilled inventory (e.g. an SGTR EOP on HPI) still holds saturation without
      // touching primary_void_fraction (and thus the calibrated pressurizer void-surge).
      dP += p.K_sat_pull * (p_sat_tavg - s.pressure_mpa);
    } else {
      // Gentle self-restore toward the (slewed) operator setpoint (heaters/charging
      // holding pressure). Tracks the effective setpoint so a cold/depressurized
      // plant holds its low pressure instead of being dragged back to NOP — and a
      // raised setpoint pressurizes at the slew pace, not at restore-gain speed.
      dP += p.P_restore_rate_gain * (spEff - s.pressure_mpa);
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

  // The thermal-expansion base line: where TRUE level sits at nominal inventory
  // for a given Tavg. Anchored at pzr_level_nominal for the full-power equilibrium
  // Tavg (s._tavg_fp, stashed by the engine), floored below the program band —
  // the CVCS level program (pwr_primary) targets this same line, so setpoint and
  // physics agree by construction and thermal expansion never reads as a leak.
  function levelBase(s, cfg) {
    var p = cfg.pressurizer;
    var tref = (s._tavg_fp != null) ? s._tavg_fp : 304.0;
    var base = p.pzr_level_nominal + p.level_per_tavg * (s.tavg_c - tref);
    return clip(base, p.level_prog_floor, 100);
  }

  // Step 8 (pzr part) — pressurizer level, DERIVED from state (CC-10 rework):
  //   level = base(Tavg) + level_per_mass·(mass − 1) + level_per_void·void
  // No integrator: level and inventory cannot silently drift apart. The void term
  // pushes liquid INTO the pressurizer as the primary voids, raising indicated
  // level even as total inventory falls — the TMI deception (§6.4) — and it is
  // active ONLY when the primary actually saturates (primary_void_fraction is
  // saturation-gated in pwr_primary). Relief/leak/charging flows act on level
  // through the MASS balance (stepInventory), not through separate level terms.
  function stepLevel(s, cfg, dt) {
    var p = cfg.pressurizer;
    var dm = (s._mass != null ? s._mass : 1.0) - 1.0;
    // Piecewise mass term: a DEFICIT draws down the whole loop (shallow); a
    // SURPLUS packs into the pressurizer steam space — the only compressible
    // volume — so it reads ~3× steeper (the "going solid" regime).
    var mass_term = dm < 0 ? p.level_per_mass * dm : p.level_per_mass_surplus * dm;
    var level = levelBase(s, cfg)
              + mass_term
              + p.level_per_void * (s.primary_void_fraction || 0);
    s.pzr_level_pct = clip(level, 0, 100);
  }

  RD.pwrPressurizer = {
    P_sat_from_T: P_sat_from_T,
    effectiveSetpoint: effectiveSetpoint,
    autoControl: autoControl,
    relief: relief,
    stepPressure: stepPressure,
    levelBase: levelBase,
    stepLevel: stepLevel,
    stepTailpipe: stepTailpipe,
  };

})(globalThis.RD || (globalThis.RD = {}));
