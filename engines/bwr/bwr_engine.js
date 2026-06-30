/*
 * bwr_engine.js — the BWREngine class (M3) and BWRScenarioTests (§18).
 *
 * Carries the BWR's own six-group point-kinetics core (no prompt fast-path — the
 * BWR never reaches prompt criticality), the reactivity feedbacks (negative void,
 * Doppler, SCRUVE rods, xenon), and the per-step orchestration over the vessel,
 * recirculation, and safety-system physics modules and the instrument model. It
 * then exposes the contract surface consumed by M4/M5 (§16).
 *
 * HR2: the engine makes no control decisions and never auto-starts the safety
 * systems — auto-actuation is M4 data (§13); the flagship test emulates it. This
 * engine computes physics, exposes direct controls + the safety-system effects,
 * and produces both true state and instrument readings.
 *
 * Rods are bottom-entry but use the standard contract convention (steps =
 * withdrawn, 100 = fully withdrawn) and SCRUVE worth, like the PWR.
 *
 * BWRScenarioTests (the §18 acceptance gate) lives at the bottom and calls the
 * engine directly, bypassing every layer above.
 *
 * Attaches RD.BWREngine and RD.BWRScenarioTests.
 */
;(function (RD) {
  'use strict';

  var CFG = RD.BWR_CONFIG;
  var V = RD.bwrVessel, RC = RD.bwrRecirc, SS = RD.bwrSafety;

  function clip(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }
  function scruve(pos_norm) { return pos_norm - Math.sin(2 * Math.PI * pos_norm) / (2 * Math.PI); }

  // ====================================================================== engine
  function BWREngine(opts) {
    opts = opts || {};
    this.cfg = CFG;
    this.dt_nominal = 0.02;
    this.seed = opts.seed != null ? opts.seed : 0x9E3779B9;
    this.instruments = new RD.BWRInstruments(this.cfg, this.seed);
    this.reset({ plant_id: 'bwr', initial_state: opts.initial_state || 'full_power' });
  }

  // ---------------------------------------------------------------- rod groups
  BWREngine.prototype._makeRodGroups = function () {
    var r = this.cfg.rods;
    return [
      { id: 'control_rods', name: 'Control Rods', function: 'control',
        steps: 0, max_steps: r.max_steps, position_pct: 0, moving: false, direction: 0,
        speed: 'normal', scrammed: false, velocity: 0, step_accumulator: 0, nudge_target: null,
        worth: this.cfg.reactivity.rod_worth_total, insertion_limit_steps: null, at_insertion_limit: false },
      { id: 'shutdown_rods', name: 'Shutdown Rods', function: 'shutdown',
        steps: r.max_steps, max_steps: r.max_steps, position_pct: 100, moving: false, direction: 0,
        speed: 'normal', scrammed: false, velocity: 0, step_accumulator: 0, nudge_target: null,
        worth: this.cfg.reactivity.rod_worth_shutdown, insertion_limit_steps: null, at_insertion_limit: false },
    ];
  };
  BWREngine.prototype._controlGroup = function () { return this.rod_groups[0]; };
  BWREngine.prototype._group = function (id) {
    for (var i = 0; i < this.rod_groups.length; i++) if (this.rod_groups[i].id === id) return this.rod_groups[i];
    return null;
  };

  // ----------------------------------------------------------- reactivity (§4)
  BWREngine.prototype._rodReactivity = function () {
    var rho = 0;
    for (var i = 0; i < this.rod_groups.length; i++) {
      var g = this.rod_groups[i];
      var withdrawn = g.steps / g.max_steps;
      rho += -g.worth * scruve(1.0 - withdrawn);
    }
    return rho;
  };

  BWREngine.prototype._totalReactivity = function () {
    var s = this.s, rc = this.cfg.reactivity;
    var rho_rods = this._rodReactivity();
    var rho_doppler = rc.alpha_D * (s.fuel_temp_c - this.Tf_ref);
    var rho_void = rc.alpha_void * (s.core_void_fraction - this.void_ref);
    var rho_xenon = -this.cfg.kinetics.xenon.xenon_worth * (s._X / s._X_eq);
    // Standby Liquid Control (D1): injected boron is a strong negative term that
    // shuts the reactor down independently of the rods (ATWS mitigation).
    var rho_slc = -this.cfg.safety.slc_worth * (s.slc_injected || 0);
    return (this.rho_excess || 0) + rho_rods + rho_doppler + rho_void + rho_xenon + rho_slc;
  };

  // ----------------------------------------------------- point kinetics (§3)
  // The BWR's Λ = 5e-5 is so small that the prompt mode decays at β/Λ ≈ 130 s⁻¹;
  // an EXPLICIT Euler prompt term is unstable at dt = 0.02 s (dt·β/Λ = 2.6 > 2 —
  // it blows up even at ρ = 0). So integrate the prompt term IMPLICITLY (the
  // prompt-jump form): P_new = (P + dt·ΣλC)/(1 − dt·(ρ−β)/Λ). Still first-order
  // Euler (CONTEXT §11 — not a higher-order method), and unconditionally stable
  // for ρ < β, which is the BWR's whole operating envelope (no prompt criticality,
  // §3). The denominator is floored so a transient ρ ≥ β can't divide by ~0.
  BWREngine.prototype._stepKinetics = function (rho, dt) {
    var s = this.s, d = this.cfg.kinetics.delayed;
    var sumLC = 0;
    for (var i = 0; i < 6; i++) sumLC += d.lambda_i[i] * s._C[i];
    var denom = 1 - dt * (rho - d.beta) / d.Lambda;       // ρ<β ⇒ denom>1 (stable)
    if (denom < 0.1) denom = 0.1;
    s._P = Math.max(0, (s._P + dt * sumLC) / denom);
    for (var j = 0; j < 6; j++) {
      var dC = (d.beta_i[j] / d.Lambda) * s._P - d.lambda_i[j] * s._C[j];
      s._C[j] += dC * dt;
    }
    s.power_pct = s._P * 100;
  };

  BWREngine.prototype._stepDecay = function (dt) {
    var s = this.s, dc = this.cfg.kinetics.decay;
    s._H1 += (dc.H1_0 * dc.lambda_1 * s._P - dc.lambda_1 * s._H1) * dt;
    s._H2 += (dc.H2_0 * dc.lambda_2 * s._P - dc.lambda_2 * s._H2) * dt;
    s.decay_heat_pct = (s._H1 + s._H2) * 100;
  };

  BWREngine.prototype._stepXenon = function (dt) {
    var s = this.s, x = this.cfg.kinetics.xenon, P = s._P;
    s._I += (x.gamma_I * P - x.lambda_I * s._I) * dt;
    s._X += (x.lambda_I * s._I + x.gamma_X * P - x.lambda_X * s._X - x.sigma_phi * P * s._X) * dt;
    s.xenon_pct_eq = (s._X / s._X_eq) * 100;
  };

  // --------------------------------------------------------------- rods (§10)
  BWREngine.prototype._stepRods = function (dt) {
    var s = this.s, r = this.cfg.rods;
    for (var i = 0; i < this.rod_groups.length; i++) {
      var g = this.rod_groups[i];
      if (g.scrammed) {
        var t_scram = g.function === 'shutdown' ? r.scram_time_shutdown_s : r.scram_time_control_s;
        g.velocity = -(g.steps / t_scram);  // fast hydraulic insertion
      }
      if (!g.velocity) { g.moving = (g.velocity !== 0); this._updateRodDerived(g); continue; }
      g.moving = true;
      g.direction = g.velocity > 0 ? 1 : -1;
      g.step_accumulator += Math.abs(g.velocity) * dt;
      var dir = g.direction;
      while (g.step_accumulator >= 1.0) {
        g.steps = clip(g.steps + dir, 0, g.max_steps);
        g.step_accumulator -= 1.0;
        if (g.nudge_target != null && g.steps === g.nudge_target) { g.velocity = 0; g.moving = false; g.nudge_target = null; break; }
        if (g.steps === 0 || g.steps === g.max_steps) { g.velocity = 0; g.moving = false; g.nudge_target = null; break; }
      }
      this._updateRodDerived(g);
    }
  };
  BWREngine.prototype._updateRodDerived = function (g) { g.position_pct = g.steps / g.max_steps * 100; };

  // ====================================================== the per-step compute (§5)
  BWREngine.prototype.step = function (dt_effective) {
    var s = this.s, cfg = this.cfg;
    var dt = dt_effective != null ? dt_effective : this.dt_nominal;

    this._stepRods(dt);
    // SLC (D1): while initiated and the tank has charge, boron mixes in (ramps the
    // injected fraction toward 1) and the tank drains. The injected boron's
    // negative reactivity persists (it stays in the core).
    if (s.slc_active && s.slc_tank_pct > 0) {
      s.slc_injected += (1 - s.slc_injected) / cfg.safety.slc_ramp_tau * dt;
      s.slc_tank_pct = Math.max(0, s.slc_tank_pct - 100 / cfg.safety.slc_tank_drain_s * dt);
    }
    if (!s.melted) {
      var rho = this._totalReactivity(); s._rho = rho;
      this._stepKinetics(rho, dt);
      this._stepXenon(dt);
    }
    // 4. Heat generation: fission embedded in P during operation; decay added as
    //    the residual once scrammed (the post-scram source).
    this._stepDecay(dt);
    s._Q_total = s._P + (s.scrammed ? (s._H1 + s._H2) : 0);
    // 5–10. Vessel / flow / safety physics in the §5 order.
    V.stepFuel(s, cfg, dt);
    RC.stepCoreFlow(s, cfg, dt);
    V.stepVoid(s, cfg, dt);
    V.stepVesselPressure(s, cfg, dt);     // incl. turbine-trip void collapse + SRV blowdown
    SS.stepSafety(s, cfg, dt);            // RCIC/HPCI/ADS/LPCI + battery; sets injection flows
    s.recirc_flow_pct = s.core_flow_pct;  // reported recirc/core flow
    if (s.feedwater_blocked) s.feedwater_normalized = 0;
    s.fw_flow_normalized = s.feedwater_normalized;
    V.stepVesselLevel(s, cfg, dt);
    V.checkDamage(s, cfg);

    // Smoothed power rate for vessel-level shrink-and-swell.
    var raw_rate = (s.power_pct - s._prev_power_pct) / dt;
    var a = dt / (2.0 + dt);
    s._power_rate = s._power_rate + a * (raw_rate - s._power_rate);
    s._prev_power_pct = s.power_pct;

    // 12. Update instruments from the new true state.
    this.instruments.update(this.getTrueState(), dt, this._instrExtras());
    s.sim_time += dt;
  };

  BWREngine.prototype._instrExtras = function () {
    var s = this.s;
    return {
      power_rate: s._power_rate,
      rps_scrammed: s.scrammed,
      station_blackout: s.station_blackout,
      battery_pct: s.battery_charge_pct,
      ads_open: s.ads_open,
      hpci_unavailable: SS.hpciUnavailable(s, this.cfg),
      rcic_running: s.rcic_running,
    };
  };

  // ============================================================ contract surface (§16)
  BWREngine.prototype.getTrueState = function () {
    var s = this.s;
    return {
      power_pct: s.power_pct, fuel_temp_c: s.fuel_temp_c, core_void_fraction: s.core_void_fraction,
      vessel_pressure_mpa: s.vessel_pressure_mpa, vessel_level_pct: s.vessel_level_pct,
      steam_flow_normalized: s.steam_flow_normalized, fw_flow_normalized: s.fw_flow_normalized,
      recirc_flow_pct: s.recirc_flow_pct, decay_heat_pct: s.decay_heat_pct, xenon_pct_eq: s.xenon_pct_eq,
      rcic_running: s.rcic_running, hpci_running: s.hpci_running, ads_open: s.ads_open, lpci_running: s.lpci_running,
      lpcs_running: s.lpcs_running, srv_manual_open: s.srv_manual_open,
      station_blackout: s.station_blackout, battery_charge_pct: s.battery_charge_pct,
      slc_active: s.slc_active, slc_tank_pct: s.slc_tank_pct,
      scrammed: s.scrammed, melted: s.melted, destruction_cause: s.destruction_cause,
      reactivity_pcm: (s._rho || 0) * 1e5,
    };
  };

  BWREngine.prototype.getInstruments = function () { return this.instruments.reading; };

  BWREngine.prototype.getControlState = function () {
    var s = this.s;
    var groups = this.rod_groups.map(function (g) {
      return {
        id: g.id, name: g.name, function: g.function, steps: g.steps, max_steps: g.max_steps,
        position_pct: g.position_pct, moving: g.moving, direction: g.direction, speed: g.speed,
        scrammed: g.scrammed, insertion_limit_steps: g.insertion_limit_steps, at_insertion_limit: g.at_insertion_limit,
      };
    });
    return {
      rod_groups: groups,
      recirc_flow_setpoint_pct: s.recirc_setpoint_pct,
      ads_armed: s.ads_open,
      slc_active: s.slc_active,
      feedwater_flow_pct: s.feedwater_normalized * 100,
    };
  };

  BWREngine.prototype.getActiveFailures = function () { return this.active_failures.slice(); };
  BWREngine.prototype.getProtectionConfig = function () { return this.cfg.protection; };

  // ================================================================== commands (§6.7)
  BWREngine.prototype.applyCommand = function (cmd) {
    var s = this.s, g;
    switch (cmd.action) {
      case 'rod_nudge':
        g = this._group(cmd.group_id);
        if (g) {
          g.speed = cmd.speed || g.speed || 'normal';
          g.nudge_target = clip(g.steps + cmd.steps, 0, g.max_steps);
          var nv = this.cfg.rods.speeds[g.speed] || this.cfg.rods.speeds.normal;
          g.velocity = (g.nudge_target >= g.steps ? 1 : -1) * nv;
          g.moving = g.nudge_target !== g.steps;
        }
        break;
      case 'rod_start':
        g = this._group(cmd.group_id);
        if (g) {
          g.speed = cmd.speed || 'normal'; g.nudge_target = null;
          var v = this.cfg.rods.speeds[g.speed] || this.cfg.rods.speeds.normal;
          g.velocity = (cmd.direction >= 0 ? 1 : -1) * v; g.moving = true;
        }
        break;
      case 'rod_stop':
        g = this._group(cmd.group_id);
        if (g && !g.scrammed) { g.velocity = 0; g.moving = false; g.nudge_target = null; }
        break;
      case 'rod_stop_all':
        this.rod_groups.forEach(function (gr) { if (!gr.scrammed) { gr.velocity = 0; gr.moving = false; gr.nudge_target = null; } });
        break;
      case 'scram':
        if (!s.scram_blocked) this._scram();
        break;
      case 'set_recirc_flow':
        s.recirc_setpoint_pct = clip(cmd.pct, 0, 48); s.recirc_pump_running = true;
        break;
      case 'set_feedwater_flow':
        if (!s.feedwater_blocked) s.feedwater_normalized = clip(cmd.pct / 100, 0, 1.5);
        break;
      case 'set_turbine_load':
        s.turbine_load_frac = clip(cmd.mwe / this.cfg.mwe_rated, 0, 1.2);
        s.steam_flow_normalized = s.turbine_load_frac;
        break;
      case 'trigger_ads':
        if (!s.ads_blocked) s.ads_open = true;
        break;
      case 'start_lpci':
        if (!s.lpci_blocked) s.lpci_running = true;
        break;
      case 'initiate_slc':
        s.slc_active = true;   // boron injection — shuts down even with rods stuck (ATWS)
        break;
      case 'stop_slc':
        s.slc_active = false;  // stop further injection (already-injected boron persists)
        break;
      case 'start_lpcs':
        if (!s.lpcs_blocked) s.lpcs_running = true;   // D4 core spray
        break;
      case 'stop_lpcs':
        s.lpcs_running = false;
        break;
      case 'open_srv_manual':
        s.srv_manual_open = true;    // D6 controlled manual depressurization
        break;
      case 'close_srv_manual':
        s.srv_manual_open = false;
        break;
      case 'set_rcic':
        s.rcic_running = !!cmd.active;
        break;
      case 'set_hpci':
        s.hpci_running = !!cmd.active;
        break;
      case 'inject_failure':
        this._injectFailure(cmd.failure_id, cmd.severity != null ? cmd.severity : 1.0);
        break;
      case 'clear_failure':
        this._clearFailure(cmd.failure_id);
        break;
      case 'clear_all_failures':
        this.active_failures.slice().forEach(this._clearFailure.bind(this));
        break;
      case 'set_instrument_failure':
        this.instruments.setFailure(cmd.instrument_id, cmd.mode, cmd.value);
        break;
      case 'clear_instrument_failure':
        this.instruments.clearFailure(cmd.instrument_id);
        break;
      default:
        return { type: 'error', code: 'COMMAND_ERROR', message: 'unknown action', received: cmd };
    }
    return null;
  };

  BWREngine.prototype._scram = function () {
    this.s.scrammed = true;
    this.rod_groups.forEach(function (g) { g.scrammed = true; g.moving = true; g.nudge_target = null; });
  };

  // ------------------------------------------------------- failure dispatch (§13)
  BWREngine.prototype._injectFailure = function (id, severity) {
    var def = this.cfg.protection.failures[id];
    if (!def) return;
    if (this.active_failures.indexOf(id) === -1) this.active_failures.push(id);
    var s = this.s;
    if (def.type === 'instrument') { this.instruments.setFailure(def.instrument_id, def.mode, def.stuck_value); return; }
    if (def.type === 'command_override') {
      switch (id) {
        case 'loss_of_feedwater': s.feedwater_blocked = true; s.feedwater_normalized = 0; break;
        case 'turbine_trip': case 'msiv_closure': s.turbine_load_frac = 0; s.steam_flow_normalized = 0; s.turbine_blocked = true; break;
        case 'failure_to_scram': s.scram_blocked = true; break;
        case 'ads_failure': s.ads_blocked = true; break;
        case 'lpci_failure': s.lpci_blocked = true; break;
      }
      return;
    }
    if (def.type === 'physics_parameter') {
      switch (def.effect) {
        case 'stop_rcic': s.rcic_running = false; s.rcic_failed = true; break;
        case 'stop_hpci': s.hpci_running = false; s.hpci_failed = true; break;
        case 'full_blackout_bwr':
          s.station_blackout = true; s.recirc_pump_running = false;
          s.feedwater_blocked = true; s.feedwater_normalized = 0;
          // MSIV closes on loss of power — steam isolated, so decay steam builds
          // vessel pressure (keeping RCIC's steam drive available).
          s.turbine_load_frac = 0; s.steam_flow_normalized = 0; s.turbine_blocked = true; break;
        case 'coast_down_recirc': s.recirc_pump_running = false; break;
        case 'stuck_relief_open': s._fail.srv_stuck_open = { active: true, area: severity }; break;
        case 'degrade_battery':
          s._fail.battery = { active: true, duration_factor: 1.0 - this.cfg.safety.BATTERY_MAX_DEGRADE * severity }; break;
      }
      return;
    }
  };

  BWREngine.prototype._clearFailure = function (id) {
    var def = this.cfg.protection.failures[id];
    if (!def) return;
    var idx = this.active_failures.indexOf(id);
    if (idx !== -1) this.active_failures.splice(idx, 1);
    var s = this.s;
    if (def.type === 'instrument') { this.instruments.clearFailure(def.instrument_id); return; }
    if (def.type === 'command_override') {
      switch (id) {
        case 'loss_of_feedwater': s.feedwater_blocked = false; break;
        case 'turbine_trip': case 'msiv_closure': s.turbine_blocked = false; break;
        case 'failure_to_scram': s.scram_blocked = false; break;
        case 'ads_failure': s.ads_blocked = false; break;
        case 'lpci_failure': s.lpci_blocked = false; break;
      }
      return;
    }
    if (def.type === 'physics_parameter') {
      switch (def.effect) {
        case 'stop_rcic': s.rcic_failed = false; break;       // stays stopped until restarted
        case 'stop_hpci': s.hpci_failed = false; break;
        case 'full_blackout_bwr': s.station_blackout = false; s.feedwater_blocked = false; break;
        case 'coast_down_recirc': s.recirc_pump_running = true; break;
        case 'stuck_relief_open': s._fail.srv_stuck_open = { active: false, area: 0 }; break;
        case 'degrade_battery': s._fail.battery = { active: false, duration_factor: 1 }; break;
      }
    }
  };

  // ================================================================ initial state (§14)
  BWREngine.prototype.reset = function (cmd) {
    var name = (cmd && cmd.initial_state) || 'full_power';
    this.rod_groups = this._makeRodGroups();
    this.active_failures = [];
    this._computeRefsAndExcess();
    this.s = this._buildState(name);
    this.instruments.reset(this.getTrueState(), this._instrExtras());
  };

  // References pinned at the full-power operating point (Flag F1 pattern); the
  // core excess reactivity is trimmed so full power is exactly critical and is
  // then a FIXED core constant (no boron), reused for every state — so
  // post_scram_sbo (rods fully in) comes out strongly subcritical.
  BWREngine.prototype._computeRefsAndExcess = function () {
    var cfg = this.cfg, v = cfg.vessel, rc = cfg.reactivity;
    var Tcool = V.T_sat(v.vessel_p_rated);
    this.Tf_ref = Tcool + 1.0 * v.heat_gen_coeff_bwr / v.h_fc_bwr;       // full-power fuel temp
    this.void_ref = 1.0 / 1.0 * v.void_scale_factor;                     // full-power operating void (~0.45)
    this._X_eq = this._computeXeq();
    // Non-excess reactivity at the full-power operating point (void/Doppler at
    // their refs → 0; rods at op position; equilibrium xenon).
    var cg = this.rod_groups[0];
    var op_steps = Math.round(cfg.rods.control_op_position_pct / 100 * cg.max_steps);
    var withdrawn = op_steps / cg.max_steps;
    var rho_rods = -rc.rod_worth_total * scruve(1 - withdrawn); // shutdown fully withdrawn → 0
    var rho_xenon = -cfg.kinetics.xenon.xenon_worth * 1.0;
    this.rho_excess = -(rho_rods + rho_xenon);
  };

  BWREngine.prototype._computeXeq = function () {
    var x = this.cfg.kinetics.xenon;
    var I_eq = x.gamma_I / x.lambda_I;
    return (x.lambda_I * I_eq + x.gamma_X) / (x.lambda_X + x.sigma_phi);
  };

  BWREngine.prototype._buildState = function (name) {
    var cfg = this.cfg, v = cfg.vessel, x = cfg.kinetics.xenon, d = cfg.kinetics.delayed;
    var init = cfg.initial_states[name] || cfg.initial_states.full_power;
    var P0 = init.power;
    var Tcool = V.T_sat(v.vessel_p_rated);
    var X_eq = this._X_eq;

    var sbo = !!init.station_blackout;
    var scrammed = !!init.scrammed;

    // Rod positions: operating (full power) or fully inserted (scrammed).
    var cg = this.rod_groups[0], sg = this.rod_groups[1];
    if (scrammed) { cg.steps = 0; sg.steps = 0; }
    else { cg.steps = Math.round(cfg.rods.control_op_position_pct / 100 * cg.max_steps); sg.steps = sg.max_steps; }
    this._updateRodDerived(cg); this._updateRodDerived(sg);
    if (scrammed) { cg.scrammed = true; sg.scrammed = true; }

    var C = [];
    for (var i = 0; i < 6; i++) C[i] = scrammed ? 0 : (d.beta_i[i] / d.lambda_i[i]) * P0 / d.Lambda;

    // Flow / void initial: full power forced flow ~100% → void ~0.45; scrammed
    // SBO has pumps off and ~no power → ~no void.
    var recirc_pump = !sbo;
    var recirc_setpoint = sbo ? 0 : cfg.recirc.recirc_op_setpoint_pct;
    var core_flow = recirc_pump ? clip(recirc_setpoint / 100 * (1 + cfg.recirc.jet_pump_m_ratio) * 100, 0, 120)
                                : RC.naturalCircFlow(P0, cfg);
    var void0 = clip(P0 / Math.max(core_flow / 100, 1e-3) * v.void_scale_factor, 0, 0.95);
    var steam = sbo ? 0 : P0, feed = sbo ? 0 : P0;

    var s = {
      sim_time: 0,
      _P: P0, power_pct: P0 * 100, _prev_power_pct: P0 * 100, _power_rate: 0, _rho: 0,
      _C: C, _X_eq: X_eq,
      _I: scrammed ? x.gamma_I / x.lambda_I : x.gamma_I * P0 / x.lambda_I,
      _X: X_eq, xenon_pct_eq: 100,
      _H1: cfg.kinetics.decay.H1_0 * (scrammed ? 1.0 : P0),   // post-scram from prior full power
      _H2: cfg.kinetics.decay.H2_0 * (scrammed ? 1.0 : P0),
      decay_heat_pct: (cfg.kinetics.decay.H1_0 + cfg.kinetics.decay.H2_0) * (scrammed ? 1.0 : P0) * 100,

      fuel_temp_c: Tcool + (scrammed ? 0.05 : P0) * v.heat_gen_coeff_bwr / v.h_fc_bwr,
      _Q_total: scrammed ? (cfg.kinetics.decay.H1_0 + cfg.kinetics.decay.H2_0) : P0, _h_fc_eff: v.h_fc_bwr,
      vessel_pressure_mpa: v.vessel_p_rated, vessel_level_pct: v.vessel_level_nominal,
      core_void_fraction: void0, core_flow_pct: core_flow, drive_flow_pct: recirc_setpoint,
      recirc_setpoint_pct: recirc_setpoint, recirc_pump_running: recirc_pump, recirc_flow_pct: core_flow,
      steam_flow_normalized: steam, turbine_load_frac: steam, turbine_blocked: false,
      feedwater_normalized: feed, fw_flow_normalized: feed, feedwater_blocked: sbo,
      _relief_flow: 0, _boiloff_rate: 0,

      // safety systems
      rcic_running: !!init.rcic_running, rcic_flow: 0, rcic_failed: false,
      hpci_running: false, hpci_flow: 0, hpci_failed: false,
      ads_open: false, ads_blocked: false, lpci_running: false, lpci_flow: 0, lpci_blocked: false,
      lpcs_running: false, lpcs_flow: 0, lpcs_blocked: false,   // D4 core spray
      srv_manual_open: false,                                    // D6 manual SRV
      station_blackout: sbo, sbo_elapsed: 0, battery_charge_pct: 100,
      slc_active: false, slc_injected: 0, slc_tank_pct: 100,   // Standby Liquid Control (D1)

      scrammed: scrammed, melted: false, fuel_damaged: false, destruction_cause: 'none', scram_blocked: false,
      _fail: { srv_stuck_open: { active: false, area: 0 }, battery: { active: false, duration_factor: 1 } },
    };
    return s;
  };

  // ================================================================== save/restore (§17)
  BWREngine.prototype.saveState = function () {
    return {
      schema: 'bwr-1.0',
      s: JSON.parse(JSON.stringify(this.s)),
      rod_groups: JSON.parse(JSON.stringify(this.rod_groups)),
      active_failures: this.active_failures.slice(),
      instruments: this.instruments.save(),
      refs: { Tf: this.Tf_ref, void_ref: this.void_ref, X_eq: this._X_eq, rho_excess: this.rho_excess },
    };
  };
  BWREngine.prototype.loadState = function (st) {
    this.s = JSON.parse(JSON.stringify(st.s));
    this.rod_groups = JSON.parse(JSON.stringify(st.rod_groups));
    this.active_failures = st.active_failures.slice();
    this.instruments.load(st.instruments);
    this.Tf_ref = st.refs.Tf; this.void_ref = st.refs.void_ref; this._X_eq = st.refs.X_eq; this.rho_excess = st.refs.rho_excess;
  };

  RD.BWREngine = BWREngine;

  // ========================================================================
  // §18 — BWR Scenario Test Suite (the acceptance gate). Calls the engine
  // directly, bypassing every layer above. Each test returns
  // { name, pass, checks:[{desc, observed, expected, pass}] }.
  // ========================================================================
  function near(a, b, tol) { return Math.abs(a - b) <= tol; }

  function Harness(initial, seed) {
    this.eng = new BWREngine({ initial_state: initial || 'full_power', seed: seed });
    this.dt = 0.02;
  }
  Harness.prototype.run = function (seconds) {
    var n = Math.round(seconds / this.dt);
    for (var i = 0; i < n; i++) this.eng.step(this.dt);
    return this;
  };
  // Emulate M4 auto-actuation while running for `seconds` (the engine makes no
  // control decisions, HR2 — the flagship drives the actuation table here).
  Harness.prototype.runActuated = function (seconds, opts) {
    opts = opts || {};
    var n = Math.round(seconds / this.dt), e = this.eng, cfg = e.cfg, sf = cfg.safety;
    for (var i = 0; i < n; i++) {
      e.step(this.dt);
      var ins = e.getInstruments();
      if (ins.vessel_level <= sf.rcic_start_level && !e.s.rcic_failed && e.s.battery_charge_pct > 0) {
        if (!e.s.rcic_running) e.applyCommand({ action: 'set_rcic', active: true });
      }
      if (opts.intervene && e.s.rcic_running === false && e.s.battery_charge_pct <= 0) {
        // After RCIC fails, actuate ADS then let LPCI arm below threshold.
        if (!e.s.ads_open) e.applyCommand({ action: 'trigger_ads' });
        if (e.s.vessel_pressure_mpa < sf.lpci_threshold_pressure && !e.s.lpci_running)
          e.applyCommand({ action: 'start_lpci' });
      }
      if (opts.stop && opts.stop(e)) return this;
    }
    return this;
  };
  Harness.prototype.cmd = function (c) { return this.eng.applyCommand(c); };
  Harness.prototype.ts = function () { return this.eng.getTrueState(); };
  Harness.prototype.ins = function () { return this.eng.getInstruments(); };

  function test(name, fn) {
    var checks = [];
    var ck = function (desc, observed, pass, expected) {
      checks.push({ desc: desc, observed: observed, expected: expected, pass: !!pass });
    };
    try { fn(ck); } catch (e) { ck('threw: ' + (e && e.message), String(e && e.stack || e), false, 'no throw'); }
    return { name: name, pass: checks.every(function (c) { return c.pass; }), checks: checks };
  }

  function rpsWouldTrip(eng) {
    var ins = eng.getInstruments(), trips = eng.getProtectionConfig().trips, reasons = [];
    for (var i = 0; i < trips.length; i++) {
      var t = trips[i], v = ins[t.instrument];
      if (v == null) continue;
      if (t.direction === 'high' && v >= t.setpoint) reasons.push(t.instrument + ' high');
      if (t.direction === 'low' && v <= t.setpoint) reasons.push(t.instrument + ' low');
    }
    return reasons;
  }

  var H = 3600; // seconds per hour

  var BWRScenarioTests = {
    near: near, Harness: Harness,

    steady_full_power: function () {
      return test('Steady operation — full_power', function (ck) {
        var h = new Harness('full_power');
        var p0 = h.ts().power_pct;
        h.run(300);
        var t = h.ts();
        ck('power holds ~100%', t.power_pct.toFixed(2), near(t.power_pct, 100, 2), '100 ±2');
        ck('vessel pressure ~7.03 MPa', t.vessel_pressure_mpa.toFixed(3), near(t.vessel_pressure_mpa, 7.03, 0.2), '7.03 ±0.2');
        ck('vessel level stable', t.vessel_level_pct.toFixed(1), near(t.vessel_level_pct, 50, 6), '50 ±6');
        ck('void stable ~0.45', t.core_void_fraction.toFixed(3), near(t.core_void_fraction, 0.45, 0.05), '0.45 ±0.05');
        ck('not scrammed/melted', t.scrammed + '/' + t.melted, !t.scrammed && !t.melted, 'false/false');
        ck('reactivity ≈ critical', h.eng.s._rho.toExponential(2), Math.abs(h.eng.s._rho) < 5e-4, '|ρ|<5e-4');
        ck('no power drift', (t.power_pct - p0).toFixed(2), near(t.power_pct, p0, 2), '≈ start');
      });
    },

    flow_control: function () {
      return test('Flow-control behavior (the BWR signature)', function (ck) {
        var h = new Harness('full_power');
        h.run(30);
        var p0 = h.ts().power_pct;
        h.cmd({ action: 'set_recirc_flow', pct: 48 });  // increase flow → sweep voids → power up
        h.run(90);
        var p_hi = h.ts().power_pct;
        ck('increase flow raises power', p_hi.toFixed(2), p_hi > p0 + 1, '> ' + p0.toFixed(2));
        // The BWR's flow-to-power coupling is strong (this is the control mechanism);
        // what matters is it SETTLES (no runaway), not the magnitude.
        ck('bounded / self-limiting', p_hi.toFixed(1), p_hi < 200 && !h.ts().melted, 'no runaway');
        ck('settled (stable)', h.eng.s._rho.toExponential(2), Math.abs(h.eng.s._rho) < 1e-3, 'near critical');
        var p_mid = h.ts().power_pct;
        h.cmd({ action: 'set_recirc_flow', pct: 30 });  // decrease flow → power down
        h.run(90);
        ck('decrease flow lowers power', h.ts().power_pct.toFixed(2), h.ts().power_pct < p_mid - 1, '< ' + p_mid.toFixed(2));
      });
    },

    natural_circ: function () {
      return test('Natural circulation on loss of forced flow', function (ck) {
        var h = new Harness('full_power');
        // Reduce power first (rods in a bit) so natural circ keeps the core cooled.
        h.cmd({ action: 'rod_nudge', group_id: 'control_rods', steps: -40 });
        h.run(60);
        h.cmd({ action: 'inject_failure', failure_id: 'recirc_pump_trip' });
        h.run(60);
        var t = h.ts();
        ck('core flow establishes at natural circ (not zero)', t.recirc_flow_pct.toFixed(1), t.recirc_flow_pct > 3, '> 3%');
        ck('core stays cooled (no melt)', t.melted, t.melted === false, false);
        ck('power runs back (void up)', t.power_pct.toFixed(1), t.power_pct < 100, '< 100%');
      });
    },

    turbine_trip: function () {
      return test('Turbine-trip transient (void collapse → brief power rise)', function (ck) {
        var h = new Harness('full_power');
        h.run(20);
        var p0 = h.ts().power_pct, v0 = h.ts().core_void_fraction;
        h.cmd({ action: 'inject_failure', failure_id: 'turbine_trip' });
        // Track the brief power rise over the next few seconds.
        var peak = 0;
        for (var i = 0; i < 250; i++) { h.eng.step(0.02); if (h.ts().power_pct > peak) peak = h.ts().power_pct; }
        ck('vessel pressure rises', h.ts().vessel_pressure_mpa.toFixed(2), h.ts().vessel_pressure_mpa > 7.03, '> 7.03');
        ck('voids collapse', h.ts().core_void_fraction.toFixed(3), h.ts().core_void_fraction < v0, '< ' + v0.toFixed(3));
        ck('brief power rise occurs', peak.toFixed(1), peak > p0 + 0.5, '> ' + p0.toFixed(1));
      });
    },

    shutdown_scram: function () {
      return test('Shutdown — fast scram + decay heat', function (ck) {
        var h = new Harness('full_power');
        h.run(10);
        h.cmd({ action: 'scram' });
        h.run(0.5);
        ck('power falling, not instant', h.ts().power_pct.toFixed(1), h.ts().power_pct < 100 && h.ts().power_pct > 2, '2..100');
        h.run(30);
        var t = h.ts();
        ck('fission collapsed', t.power_pct.toFixed(2), t.power_pct < 5, '< 5%');
        ck('decay heat persists', t.decay_heat_pct.toFixed(2), t.decay_heat_pct > 3 && t.decay_heat_pct < 9, '3..9%');
        ck('rods inserted', h.eng._controlGroup().steps.toString(), h.eng._controlGroup().steps < 20, 'control rods in');
      });
    },

    flagship_fukushima: function () {
      return test('Flagship — Fukushima (hold, then uncover vs intervene)', function (ck) {
        // From post_scram_sbo: RCIC holds the core covered for hours without AC.
        var h = new Harness('post_scram_sbo');
        h.run(2 * H);
        ck('RCIC holds level for hours (2 h)', h.ts().vessel_level_pct.toFixed(0) + '% @2h, rcic=' + h.ts().rcic_running,
          h.ts().vessel_level_pct > 30 && h.ts().rcic_running, 'level up, RCIC running');
        ck('no damage during grace window', h.ts().melted + '/' + h.eng.s.fuel_damaged, !h.ts().melted && !h.eng.s.fuel_damaged, 'covered');

        // Damage branch: run through battery depletion and the uncovery that follows.
        var dmg = new Harness('post_scram_sbo');
        dmg.runActuated(8.2 * H, {});       // RCIC holds, then battery depletes
        ck('battery depletes ~8 h → RCIC fails', String(dmg.eng.s.rcic_running) + ', batt=' + dmg.ts().battery_charge_pct.toFixed(0),
          dmg.eng.s.rcic_running === false && dmg.ts().battery_charge_pct <= 0, 'RCIC off');
        var t_uncover = -1;
        for (var step = 0; step < 6; step++) {
          dmg.runActuated(1 * H, { stop: function (e) { return e.s.vessel_level_pct < 20; } });
          if (dmg.ts().vessel_level_pct < 20) { t_uncover = 8.2 + step + 1; break; }
        }
        ck('core uncovers (<20%) within a few h of RCIC failure', dmg.ts().vessel_level_pct.toFixed(1) + '% by ~' + t_uncover + 'h',
          dmg.ts().vessel_level_pct < 20, 'uncovered');
        dmg.runActuated(6 * H, { stop: function (e) { return e.s.fuel_damaged; } });
        ck('fuel damage follows uncovery', dmg.ts().fuel_temp_c.toFixed(0) + '°C, damaged=' + dmg.eng.s.fuel_damaged,
          dmg.eng.s.fuel_damaged === true, 'fuel_damaged');

        // Intervention branch: same start, ADS+LPCI after RCIC fails → core saved.
        var iv = new Harness('post_scram_sbo');
        iv.runActuated(8.2 * H, {});        // RCIC holds then fails
        iv.runActuated(6 * H, { intervene: true, stop: function (e) { return e.s.fuel_damaged; } });
        ck('intervention: ADS actuated', String(iv.ts().ads_open), iv.ts().ads_open === true, 'ads_open');
        ck('intervention: LPCI restores level', iv.ts().vessel_level_pct.toFixed(1) + '%', iv.ts().vessel_level_pct > 20, 'level recovered');
        ck('intervention: core saved (no damage)', iv.ts().melted + '/' + iv.eng.s.fuel_damaged, !iv.eng.s.fuel_damaged && !iv.ts().melted, 'saved');
      });
    },

    physics_failures: function () {
      return test('Physics-level failure behavior', function (ck) {
        // station_blackout drops AC: recirc + feedwater lost, RCIC continues, battery starts.
        var sb = new Harness('full_power'); sb.run(5);
        sb.cmd({ action: 'scram' }); sb.run(5);
        sb.cmd({ action: 'inject_failure', failure_id: 'station_blackout' });
        sb.cmd({ action: 'set_rcic', active: true });
        sb.run(60);
        ck('SBO: recirc pumps lost', String(sb.eng.s.recirc_pump_running), sb.eng.s.recirc_pump_running === false, 'off');
        ck('SBO: battery timer running', sb.ts().battery_charge_pct.toFixed(2), sb.ts().battery_charge_pct < 100, '< 100');
        ck('SBO: RCIC still injecting', sb.eng.s.rcic_flow.toFixed(3), sb.eng.s.rcic_flow > 0, '> 0');

        // SRV stuck open: pressure + level fall; once pressure < rcic_min, RCIC flow ceases.
        var sv = new Harness('post_scram_sbo'); sv.run(60);
        var p0 = sv.ts().vessel_pressure_mpa;
        sv.cmd({ action: 'inject_failure', failure_id: 'srv_stuck_open', severity: 1.0 });
        sv.run(600);
        ck('SRV stuck: pressure falls', sv.ts().vessel_pressure_mpa.toFixed(2), sv.ts().vessel_pressure_mpa < p0, '< ' + p0.toFixed(2));
        ck('SRV stuck: RCIC flow ceases below cutoff', sv.eng.s.rcic_flow.toFixed(4),
          sv.ts().vessel_pressure_mpa < sv.eng.cfg.safety.rcic_min_pressure ? sv.eng.s.rcic_flow === 0 : true, 'RCIC stops at low P');

        // recirc pump trip at power: flow → natural circ, void up, power runs back.
        var rp = new Harness('full_power'); rp.run(20);
        var pwr0 = rp.ts().power_pct;
        rp.cmd({ action: 'inject_failure', failure_id: 'recirc_pump_trip' });
        rp.run(40);
        ck('recirc trip: power runs back', rp.ts().power_pct.toFixed(1), rp.ts().power_pct < pwr0, '< ' + pwr0.toFixed(1));

        // degrade battery: RCIC fails well before 8 h.
        var bd = new Harness('post_scram_sbo');
        bd.cmd({ action: 'inject_failure', failure_id: 'early_battery_failure', severity: 1.0 });
        bd.run(3 * H);
        ck('degraded battery: RCIC fails early (<8h)', String(bd.eng.s.rcic_running) + ' @3h', bd.eng.s.rcic_running === false, 'RCIC off by 3 h');

        // vessel level sensor stuck: reading frozen while true level falls (uncovery info failure).
        var ls = new Harness('post_scram_sbo'); ls.runActuated(8.2 * H, {});
        var held = ls.ins().vessel_level;
        ls.cmd({ action: 'inject_failure', failure_id: 'vessel_level_sensor_failure' });
        ls.runActuated(2 * H, { stop: function (e) { return e.s.vessel_level_pct < 30; } });
        ck('stuck level sensor: reading frozen while true falls', ls.ins().vessel_level.toFixed(1) + ' (true ' + ls.ts().vessel_level_pct.toFixed(1) + ')',
          near(ls.ins().vessel_level, held, 1.0) && ls.ts().vessel_level_pct < held - 5, 'frozen vs falling');
      });
    },

    actuation_gates: function () {
      return test('Actuation gates (ADS gated on hpci_unavailable, LPCI on ads_open)', function (ck) {
        // Drive level down with HPCI unavailable → ADS gate should be satisfiable.
        var h = new Harness('post_scram_sbo');
        h.cmd({ action: 'inject_failure', failure_id: 'hpci_failure' }); // HPCI unavailable
        h.runActuated(8.2 * H, {});           // RCIC holds then fails
        h.runActuated(4 * H, { stop: function (e) { return e.s.vessel_level_pct < 15; } });
        var ins = h.ins();
        ck('hpci_unavailable status true', String(ins.hpci_unavailable), ins.hpci_unavailable === true, 'true');
        ck('ads_open starts false (not yet triggered)', String(h.ts().ads_open), h.ts().ads_open === false, 'false');
        // With ads_failure injected, trigger_ads is blocked → ads_open stays false → LPCI never arms.
        h.cmd({ action: 'inject_failure', failure_id: 'ads_failure' });
        h.cmd({ action: 'trigger_ads' });     // blocked
        ck('ads_failure blocks trigger_ads', String(h.ts().ads_open), h.ts().ads_open === false, 'stays false');
        h.cmd({ action: 'start_lpci' });
        h.run(60);
        ck('LPCI cannot inject at high pressure (no ADS)', h.eng.s.lpci_flow.toFixed(3),
          h.ts().vessel_pressure_mpa >= h.eng.cfg.safety.lpci_threshold_pressure ? h.eng.s.lpci_flow === 0 : true, 'no LPCI flow');
      });
    },

    save_restore: function () {
      return test('Save and restore — exact fidelity', function (ck) {
        // Mid-blackout, RCIC running, battery partly depleted, with failures active.
        var a = new Harness('post_scram_sbo', 13579);
        a.run(1 * H);
        a.cmd({ action: 'inject_failure', failure_id: 'srv_stuck_open', severity: 0.4 });
        a.cmd({ action: 'inject_failure', failure_id: 'early_battery_failure', severity: 0.5 });
        a.cmd({ action: 'set_instrument_failure', instrument_id: 'vessel_pressure', mode: 'drift', value: 0.001 });
        a.run(600);
        var snap = a.eng.saveState();

        var b = new Harness('full_power', 999);
        b.eng.loadState(snap);
        a.run(600); b.run(600);
        var ta = a.ts(), tb = b.ts(), ia = a.ins(), ib = b.ins();
        ck('level identical', tb.vessel_level_pct.toFixed(6), near(ta.vessel_level_pct, tb.vessel_level_pct, 1e-9), ta.vessel_level_pct.toFixed(6));
        ck('pressure identical (SRV state)', tb.vessel_pressure_mpa.toFixed(6), near(ta.vessel_pressure_mpa, tb.vessel_pressure_mpa, 1e-9), ta.vessel_pressure_mpa.toFixed(6));
        ck('battery timer identical', tb.battery_charge_pct.toFixed(6), near(ta.battery_charge_pct, tb.battery_charge_pct, 1e-9), ta.battery_charge_pct.toFixed(6));
        ck('fuel temp identical', tb.fuel_temp_c.toFixed(6), near(ta.fuel_temp_c, tb.fuel_temp_c, 1e-9), ta.fuel_temp_c.toFixed(6));
        ck('instrument drift identical', ib.vessel_pressure.toFixed(6), near(ia.vessel_pressure, ib.vessel_pressure, 1e-9), ia.vessel_pressure.toFixed(6));
        ck('noise sequence identical (PRNG)', ib.power_range.toFixed(6), near(ia.power_range, ib.power_range, 1e-9), ia.power_range.toFixed(6));
      });
    },
  };

  BWRScenarioTests.runAll = function () {
    var order = ['steady_full_power', 'flow_control', 'natural_circ', 'turbine_trip', 'shutdown_scram',
      'flagship_fukushima', 'physics_failures', 'actuation_gates', 'save_restore'];
    var results = [];
    for (var i = 0; i < order.length; i++) results.push(BWRScenarioTests[order[i]]());
    return results;
  };

  RD.BWRScenarioTests = BWRScenarioTests;

})(globalThis.RD || (globalThis.RD = {}));
