/*
 * pwr_engine.js — the PWREngine class (M1). Carries the PWR's own copy of the
 * six-group point-kinetics integrator, the reactivity feedbacks, the rod system,
 * and the per-step orchestration (CONTEXT §4–5, M1 §3–7). It drives the thermal,
 * pressurizer, primary, and steam-generator physics modules and the instrument
 * model, then exposes the contract surface consumed by M4/M5 (M1 §12).
 *
 * HR2: the engine makes no control decisions and never reads its own instruments
 * to decide anything. It computes physics, exposes direct controls, and produces
 * BOTH true state and instrument readings. Trips/actuation/alarms are M4's job;
 * this engine only defines them as data (pwr_protection.js).
 *
 * PWRScenarioTests (the §14 acceptance gate) lives at the bottom of this file and
 * calls the engine directly, bypassing every layer above.
 *
 * Attaches RD.PWREngine and RD.PWRScenarioTests.
 */
;(function (RD) {
  'use strict';

  var CFG = RD.PWR_CONFIG;
  var TH = RD.pwrThermal, PZ = RD.pwrPressurizer, PR = RD.pwrPrimary, SG = RD.pwrSteamGenerator;

  function clip(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }

  // S-curve rod worth: rods least effective near fully in/out, most in the middle.
  // pos_norm: 0 = fully inserted, 1 = fully withdrawn.
  function scruve(pos_norm) { return pos_norm - Math.sin(2 * Math.PI * pos_norm) / (2 * Math.PI); }

  // ====================================================================== engine
  function PWREngine(opts) {
    opts = opts || {};
    this.cfg = CFG;
    this.dt_nominal = 0.02;
    this.instruments = new RD.PWRInstruments(this.cfg, opts.seed != null ? opts.seed : 0x9E3779B9);
    this.reset({ plant_id: 'pwr', initial_state: opts.initial_state || 'hot_full_power' });
  }

  // ---------------------------------------------------------------- rod groups
  PWREngine.prototype._makeRodGroups = function () {
    var r = this.cfg.rods;
    return [
      { id: 'control_rods', name: 'Control Rods', function: 'control',
        steps: 0, max_steps: r.max_steps, position_pct: 0,
        moving: false, direction: 0, speed: 'normal', scrammed: false,
        velocity: 0, step_accumulator: 0, nudge_target: null, worth: this.cfg.reactivity.rod_worth_total,
        insertion_limit_steps: Math.round(r.insertion_limit_pct / 100 * r.max_steps),
        at_insertion_limit: false },
      { id: 'shutdown_rods', name: 'Shutdown Rods', function: 'shutdown',
        steps: r.max_steps, max_steps: r.max_steps, position_pct: 100,
        moving: false, direction: 0, speed: 'normal', scrammed: false,
        velocity: 0, step_accumulator: 0, nudge_target: null, worth: this.cfg.reactivity.rod_worth_shutdown,
        insertion_limit_steps: null, at_insertion_limit: false },
    ];
  };

  PWREngine.prototype._controlGroup = function () { return this.rod_groups[0]; };
  PWREngine.prototype._shutdownGroup = function () { return this.rod_groups[1]; };

  // ----------------------------------------------------------- reactivity (§4)
  PWREngine.prototype._rodReactivity = function () {
    var rho = 0;
    for (var i = 0; i < this.rod_groups.length; i++) {
      var g = this.rod_groups[i];
      var withdrawn = g.steps / g.max_steps;
      rho += -g.worth * scruve(1.0 - withdrawn);
    }
    return rho;
  };

  PWREngine.prototype._totalReactivity = function () {
    var s = this.s, rc = this.cfg.reactivity;
    var rho_rods = this._rodReactivity();
    // §9.1 stuck rod on scram: adds held-out worth back, scaled by insertion.
    if (s._fail.stuck_rod.active) {
      var cg = this._controlGroup();
      var insertedFrac = 1.0 - cg.steps / cg.max_steps;
      rho_rods += s._fail.stuck_rod.worth_held * rc.rod_worth_total * insertedFrac;
    }
    var rho_doppler = rc.alpha_D * (s.fuel_temp_c - this.T_fuel_ref);
    var rho_mtc = rc.alpha_MTC * (s.tavg_c - this.T_coolant_ref);
    var rho_boron = -rc.boron_worth_per_ppm * s.boron_ppm;
    var X_eq = this._X_eq;
    var rho_xenon = -this.cfg.kinetics.xenon.xenon_worth * (s._X / X_eq);
    return rc.rho_excess + rho_rods + rho_doppler + rho_mtc + rho_boron + rho_xenon;
  };

  // ----------------------------------------------------- point kinetics (§3)
  PWREngine.prototype._stepKinetics = function (rho, dt) {
    var s = this.s, d = this.cfg.kinetics.delayed;
    var sumLC = 0;
    for (var i = 0; i < 6; i++) sumLC += d.lambda_i[i] * s._C[i];
    var dP = ((rho - d.beta) / d.Lambda) * s._P + sumLC;
    for (var j = 0; j < 6; j++) {
      var dC = (d.beta_i[j] / d.Lambda) * s._P - d.lambda_i[j] * s._C[j];
      s._C[j] += dC * dt;
    }
    s._P = Math.max(0, s._P + dP * dt);
    s.power_pct = s._P * 100;
  };

  // Decay heat — two-term model with a production term toward the equilibrium
  // fraction for the CURRENT power (H_0·P), so it builds up while the reactor
  // runs and persists/decays after scram. A reactor that has been at power a
  // while therefore already carries ~7% decay heat; a just-started (subcritical)
  // core carries ~none. Replaces the old "switch on only at scram" form (§3).
  PWREngine.prototype._stepDecay = function (dt) {
    var s = this.s, dc = this.cfg.kinetics.decay;
    s._H1 += (dc.H1_0 * dc.lambda_1 * s._P - dc.lambda_1 * s._H1) * dt;
    s._H2 += (dc.H2_0 * dc.lambda_2 * s._P - dc.lambda_2 * s._H2) * dt;
    s.decay_heat_pct = (s._H1 + s._H2) * 100;
  };

  // Xenon / iodine (§4).
  PWREngine.prototype._stepXenon = function (dt) {
    var s = this.s, x = this.cfg.kinetics.xenon, P = s._P;
    var dI = x.gamma_I * P - x.lambda_I * s._I;
    var dX = x.lambda_I * s._I + x.gamma_X * P - x.lambda_X * s._X - x.sigma_phi * P * s._X;
    s._I += dI * dt;
    s._X += dX * dt;
    s.xenon_pct_eq = (s._X / this._X_eq) * 100;
  };

  // --------------------------------------------------------------- rods (§7)
  PWREngine.prototype._stepRods = function (dt) {
    var s = this.s, r = this.cfg.rods;

    // §9.1 continuous rod withdrawal: drives the control group out, overriding
    // operator demand. Scram (shutdown group) still works.
    if (s._fail.rod_runaway.active) {
      var cg = this._controlGroup();
      cg.steps = Math.min(cg.max_steps, cg.steps + s._fail.rod_runaway.rate * dt);
      cg.moving = true; cg.direction = +1;
    }

    for (var i = 0; i < this.rod_groups.length; i++) {
      var g = this.rod_groups[i];
      if (g.scrammed) {
        // Scram: constant-rate gravity insertion — rods reach fully-in within the
        // scram time (linear, not asymptotic), so the motion is decisive/visible.
        var t_scram = g.function === 'shutdown' ? r.scram_time_shutdown_s : r.scram_time_control_s;
        g.velocity = -(g.max_steps / t_scram);
      }
      if (!g.velocity) { g.moving = (g.velocity !== 0); this._updateRodDerived(g); continue; }
      g.moving = true;
      g.direction = g.velocity > 0 ? 1 : -1;
      g.step_accumulator += Math.abs(g.velocity) * dt;
      var dir = g.direction;
      while (g.step_accumulator >= 1.0) {
        g.steps = clip(g.steps + dir, 0, g.max_steps);
        g.step_accumulator -= 1.0;
        // A nudge drives toward its target at the rod speed, then stops (so a
        // single-step nudge moves at the same rate as a held drive, not instantly).
        if (g.nudge_target != null && g.steps === g.nudge_target) { g.velocity = 0; g.moving = false; g.nudge_target = null; break; }
        if (g.steps === 0 || g.steps === g.max_steps) { g.velocity = 0; g.moving = false; g.nudge_target = null; break; }
      }
      this._updateRodDerived(g);
    }
  };

  PWREngine.prototype._updateRodDerived = function (g) {
    g.position_pct = g.steps / g.max_steps * 100;
    if (g.insertion_limit_steps != null) {
      g.at_insertion_limit = g.steps <= g.insertion_limit_steps;
    }
  };

  // ====================================================== the per-step compute
  PWREngine.prototype.step = function (dt_effective) {
    var s = this.s;
    var dt = dt_effective != null ? dt_effective : this.dt_nominal;

    // 0. Rod motion (incl. runaway) before reactivity reads positions.
    this._stepRods(dt);
    // 1. Total reactivity from current (previous-step) state — explicit coupling.
    var rho = this._totalReactivity();
    s._rho = rho;
    // 2. Point kinetics → new power.
    this._stepKinetics(rho, dt);
    // 3. Xenon / iodine.
    this._stepXenon(dt);
    // 4. Heat generation. Decay heat tracks power continuously (above). During
    //    operation it is embedded in P (rated = total thermal); after scram, as
    //    the fission term collapses, decay heat is the residual source.
    this._stepDecay(dt);
    s._Q_total = s._P + (s.scrammed ? (s._H1 + s._H2) : 0);
    // Emergency injection multiplier already on state; HPI flow computed in §9.
    // 5–6. Fuel and coolant temperatures (legs, true subcooling).
    TH.stepFuel(s, this.cfg, dt);
    TH.stepCoolant(s, this.cfg, dt);
    // 7. Primary pressure (pressurizer).
    PZ.stepPressure(s, this.cfg, dt);
    // 9. Primary inventory and voiding (HPI/leak/relief) — before the pzr level
    //    surge so void_surge reflects this step's voiding.
    PR.stepInventory(s, this.cfg, dt);
    // 8. Pressurizer level (the TMI deception) and SG level (in §11).
    PZ.stepLevel(s, this.cfg, dt);
    // 10. Flows — pumps, coastdown.
    PR.stepFlow(s, this.cfg, dt);
    // 11. SG steam pressure/flow, feedwater/AFW.
    SG.stepSecondary(s, this.cfg, dt);
    // 12. Turbine / condenser.
    SG.stepTurbine(s, this.cfg, dt);
    // 13. Boron chemistry (CVCS): borate/dilute change concentration directly (needs
    //     the charging pump); decoupled from the net inventory balance.
    if (s.charging_pump_running !== false) s.boron_ppm += (s.boron_adjust || 0) * dt;
    if (s.boron_ppm < 0) s.boron_ppm = 0;
    // 14. Fuel damage / melt.
    TH.checkDamage(s, this.cfg);

    // Smoothed power rate for shrink-and-swell.
    var raw_rate = (s.power_pct - s._prev_power_pct) / dt;
    var a = dt / (2.0 + dt);
    s._power_rate = s._power_rate + a * (raw_rate - s._power_rate);
    s._prev_power_pct = s.power_pct;

    // 15–16. Update instruments from the new true state (last), incl. derived
    // subcooling margin from instrument P and T.
    this.instruments.update(this.getTrueState(), dt, this._instrExtras());

    s.sim_time += dt;
  };

  PWREngine.prototype._instrExtras = function () {
    var s = this.s;
    return {
      porv_commanded_open: s.porv_demand === 'open',
      power_rate: s._power_rate,
      rps_scrammed: s.scrammed,
      rcp_running: s.pump_running,
      hpi_active: s.hpi_active,
      station_blackout: s.station_blackout,
      steam_demand_low: s.turbine_tripped || s.turbine_demand_frac < 0.05,
      rod_at_limit: this._controlGroup().at_insertion_limit,
    };
  };

  // ============================================================ contract surface
  PWREngine.prototype.getTrueState = function () {
    var s = this.s;
    // Reactivity proxies. Real PWRs have no direct ρ gauge: operators infer it
    // from neutron-flux trends (startup rate / reactor period). We expose the
    // engine's net reactivity (ρ, pcm) for an explicitly-labeled "reactivity
    // computer" (engineering tool), plus the operator-facing proxies SUR and
    // period derived from the smoothed power rate. SUR(dpm) = 26.06·(Ṗ/P);
    // period(s) = P/Ṗ. Both are well-defined only above a small power floor.
    var p = s.power_pct, pr = s._power_rate || 0;
    var sur = 0, period = Infinity;
    if (p > 0.1) { sur = 26.06 * (pr / p); period = Math.abs(pr) > 1e-6 ? p / pr : Infinity; }
    return {
      power_pct: s.power_pct, tavg_c: s.tavg_c, thot_c: s.thot_c, tcold_c: s.tcold_c,
      pressure_mpa: s.pressure_mpa, pzr_level_pct: s.pzr_level_pct, sg_level_pct: s.sg_level_pct,
      steam_flow_normalized: s.steam_flow_normalized, fw_flow_normalized: s.fw_flow_normalized,
      steam_pressure_mpa: s.steam_pressure_mpa,   // secondary SG pressure (additive; for the UI diagram)
      mwe_output: s.mwe_output, subcooling_c: s.subcooling_c, core_inventory_pct: s.core_inventory_pct,
      fuel_temp_c: s.fuel_temp_c, decay_heat_pct: s.decay_heat_pct, xenon_pct_eq: s.xenon_pct_eq,
      boron_ppm: s.boron_ppm, porv_open: s.porv_open, porv_stuck: s.porv_stuck,
      hpi_active: s.hpi_active, hpi_flow_normalized: s.hpi_flow_normalized, afw_active: s.afw_active,
      pump_running: s.pump_running, pump_flow_pct: s.pump_flow_pct, station_blackout: s.station_blackout,
      turbine_rpm: s.turbine_rpm, condenser_vacuum_kpa: s.condenser_vacuum_kpa,
      scrammed: s.scrammed, melted: s.melted, steam_demand_mwe: s.steam_demand_mwe,
      reactivity_pcm: (s._rho || 0) * 1e5, startup_rate_dpm: sur, reactor_period_s: period,
    };
  };

  PWREngine.prototype.getInstruments = function () { return this.instruments.reading; };

  PWREngine.prototype.getControlState = function () {
    var s = this.s;
    var groups = this.rod_groups.map(function (g) {
      return {
        id: g.id, name: g.name, function: g.function, steps: g.steps, max_steps: g.max_steps,
        position_pct: g.position_pct, moving: g.moving, direction: g.direction, speed: g.speed,
        scrammed: g.scrammed, insertion_limit_steps: g.insertion_limit_steps,
        at_insertion_limit: g.at_insertion_limit,
      };
    });
    return {
      rod_groups: groups,
      porv_demand: s.porv_demand,
      porv_block_open: s.block_valve_open,
      heater_power_pct: s.heater_power_frac * 100,
      spray_valve_pct: s.spray_flow_frac * 100,
      charging_flow_normalized: s.charging_flow, letdown_flow_normalized: s.letdown_flow,
      charging_pump_running: s.charging_pump_running, cvcs_auto: s.cvcs_auto, boron_adjust: s.boron_adjust,
      feedwater_flow_pct: s.feedwater_demand_frac * 100,
      steam_demand_mwe: s.steam_demand_mwe,
      steam_dump_pct: s.steam_dump_frac * 100,
      steam_dump_auto: s.steam_dump_override == null,
      hpi_active: s.hpi_active,
      pumps: [{ id: 'rcp', running: s.pump_running, flow_pct: s.pump_flow_pct }],
    };
  };

  PWREngine.prototype.getActiveFailures = function () { return this.active_failures.slice(); };
  PWREngine.prototype.getProtectionConfig = function () { return this.cfg.protection; };

  // ================================================================== commands
  PWREngine.prototype.applyCommand = function (cmd) {
    var s = this.s, g;
    switch (cmd.action) {
      case 'rod_nudge':
        // Move `steps` at the selected rod speed (drives to a target), not instantly.
        g = this._group(cmd.group_id);
        if (g && !(g.id === 'control_rods' && s._fail.rod_runaway.active)) {
          g.speed = cmd.speed || g.speed || 'normal';
          g.nudge_target = clip(g.steps + cmd.steps, 0, g.max_steps);
          var nv = this.cfg.rods.speeds[g.speed] || this.cfg.rods.speeds.normal;
          g.velocity = (g.nudge_target >= g.steps ? 1 : -1) * nv;
          g.moving = g.nudge_target !== g.steps;
        }
        break;
      case 'rod_start':
        g = this._group(cmd.group_id);
        if (g && !(g.id === 'control_rods' && s._fail.rod_runaway.active)) {
          g.speed = cmd.speed || 'normal'; g.nudge_target = null;   // continuous (held) — no target
          var v = this.cfg.rods.speeds[g.speed] || this.cfg.rods.speeds.normal;
          g.velocity = (cmd.direction >= 0 ? 1 : -1) * v;
          g.moving = true;
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
      case 'set_steam_demand':
        s.steam_demand_mwe = cmd.mwe;
        s.turbine_demand_frac = clip(cmd.mwe / this.cfg.turbine.mwe_rated, 0, 1.2);
        s.generator_load = s.turbine_demand_frac;
        break;
      case 'set_feedwater_flow':
        s.feedwater_demand_frac = clip(cmd.pct / 100, 0, 1.2);
        break;
      case 'set_heater':
        // {auto:true} returns to the proportional auto-control; {power_pct} is a manual override.
        s.heater_override = cmd.auto ? null : clip(cmd.power_pct / 100, 0, 1);
        break;
      case 'set_spray':
        // {auto:true} → auto; {pct} → manual valve %; {open} → back-compat boolean.
        s.spray_override = cmd.auto ? null : (cmd.pct != null ? clip(cmd.pct / 100, 0, 1) : (cmd.open ? 1 : 0));
        break;
      case 'open_porv':
        s.porv_demand = 'open';
        break;
      case 'close_porv':
        s.porv_demand = 'closed'; // ineffective while porv_stuck (relief() forces open)
        break;
      case 'open_block_valve':
        s.block_valve_open = true;
        break;
      case 'close_block_valve':
        // Isolate the PORV line (stops flow even if the PORV is stuck open).
        s.block_valve_open = false;
        break;
      case 'set_hpi':
        s.hpi_active = !!cmd.active;
        break;
      case 'set_afw':
        if (!s.afw_blocked) s.afw_active = !!cmd.active;
        break;
      case 'set_steam_dump':
        // mode: 'auto' (null override) | 'open' (full) | 'closed' | a manual pct.
        if (cmd.mode === 'auto') s.steam_dump_override = null;
        else if (cmd.mode === 'open') s.steam_dump_override = 1.0;
        else if (cmd.mode === 'closed') s.steam_dump_override = 0.0;
        else if (cmd.pct != null) s.steam_dump_override = clip(cmd.pct / 100, 0, 1);
        break;
      case 'set_dhr':
        s.dhr_active = !!cmd.active;
        break;
      case 'set_charging_flow':
        s.charging_flow = cmd.normalized; s.cvcs_auto = false;   // manual charging leaves auto make-up
        break;
      case 'set_letdown_flow':
        s.letdown_flow = cmd.normalized;
        break;
      case 'set_charging_pump':
        s.charging_pump_running = !!cmd.running;
        break;
      case 'set_cvcs_auto':
        s.cvcs_auto = !!cmd.active;   // auto make-up: charging modulates to hold inventory
        break;
      case 'set_boron_adjust':
        // ppm/s: + borate, − dilute, 0 hold (needs the charging pump running)
        s.boron_adjust = cmd.rate || 0;
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

  PWREngine.prototype._group = function (id) {
    for (var i = 0; i < this.rod_groups.length; i++) if (this.rod_groups[i].id === id) return this.rod_groups[i];
    return null;
  };

  PWREngine.prototype._scram = function () {
    this.s.scrammed = true;
    // Decay heat is tracked continuously (it already holds the equilibrium value
    // for the power just before scram); it now persists and decays as P collapses.
    this.rod_groups.forEach(function (g) {
      // A stuck control rod holds out; M4/§9.1 model the held worth in reactivity,
      // but the group still "scrams" (drives in) — the held worth is added back.
      g.scrammed = true; g.moving = true; g.nudge_target = null;
    });
  };

  // ------------------------------------------------------- failure dispatch
  PWREngine.prototype._injectFailure = function (id, severity) {
    var def = this.cfg.protection.failures[id];
    if (!def) return;
    if (this.active_failures.indexOf(id) === -1) this.active_failures.push(id);
    var s = this.s;
    if (def.type === 'instrument') {
      this.instruments.setFailure(def.instrument_id, def.mode, def.stuck_value);
      return;
    }
    if (def.type === 'command_override') {
      switch (id) {
        case 'stuck_porv_open': s.porv_stuck = true; break;
        case 'loss_of_feedwater': s.main_feedwater_available = false; break;
        case 'turbine_trip': SG.tripTurbine(s); break;
        case 'degraded_hpi': s.hpi_flow_multiplier = clip(1 - severity, 0, 1); break;
        case 'afw_failure': s.afw_blocked = true; s.afw_active = false; break;
        case 'failure_to_scram': s.scram_blocked = true; break;
        case 'stuck_open_spray': s.spray_override = true; break;
        case 'failed_pzr_heaters': s.heater_override = 0; break;
        case 'sg_overfeed': s.feedwater_demand_frac = 1.2; break;
      }
      return;
    }
    if (def.type === 'physics_parameter') {
      switch (def.effect) {
        case 'coast_down_pumps': s.pump_running = false; break;
        case 'stop_pump': s.pump_running = false; break;
        case 'full_blackout':
          s.station_blackout = true; s.pump_running = false;
          s.condenser_cooling_available = false; s.main_feedwater_available = false;
          break;
        case 'vacuum_decay': s.condenser_cooling_available = false; break;
        case 'primary_leak':
          var meta = def.severity_meta;
          s.leak_flow = severity * (meta ? meta.max / 100 : 0.05); // % rated flow → normalized
          break;
        case 'rod_withdrawal_runaway':
        case 'stuck_control_rod':
        case 'secondary_depressurize':
          this._applyPhysicsFailure(def.effect, severity);
          break;
      }
      return;
    }
  };

  // §9.1 physics-parameter failure effects.
  PWREngine.prototype._applyPhysicsFailure = function (effect, severity) {
    var s = this.s, pf = this.cfg.physics_failures;
    if (severity == null) severity = 1.0;
    switch (effect) {
      case 'rod_withdrawal_runaway': s._fail.rod_runaway = { active: true, rate: pf.ROD_RUNAWAY_RATE_MAX * severity }; break;
      case 'stuck_control_rod': s._fail.stuck_rod = { active: true, worth_held: pf.STUCK_ROD_MAX_FRAC * severity }; break;
      case 'secondary_depressurize': s._fail.steam_break = { active: true, size: severity }; break;
    }
  };

  PWREngine.prototype._clearFailure = function (id) {
    var def = this.cfg.protection.failures[id];
    if (!def) return;
    var idx = this.active_failures.indexOf(id);
    if (idx !== -1) this.active_failures.splice(idx, 1);
    var s = this.s;
    if (def.type === 'instrument') { this.instruments.clearFailure(def.instrument_id); return; }
    if (def.type === 'command_override') {
      switch (id) {
        case 'stuck_porv_open': s.porv_stuck = false; break;
        case 'loss_of_feedwater': s.main_feedwater_available = true; break;
        case 'degraded_hpi': s.hpi_flow_multiplier = 1.0; break;
        case 'afw_failure': s.afw_blocked = false; break;
        case 'failure_to_scram': s.scram_blocked = false; break;
        case 'stuck_open_spray': s.spray_override = null; break;
        case 'failed_pzr_heaters': s.heater_override = null; break;
      }
      return;
    }
    if (def.type === 'physics_parameter') {
      switch (def.effect) {
        case 'coast_down_pumps': case 'stop_pump': break; // pumps stay off until restarted
        case 'full_blackout': s.station_blackout = false; s.condenser_cooling_available = true; s.main_feedwater_available = true; break;
        case 'vacuum_decay': s.condenser_cooling_available = true; break;
        case 'primary_leak': s.leak_flow = 0; break;
        case 'rod_withdrawal_runaway': s._fail.rod_runaway = { active: false, rate: 0 }; break;
        case 'stuck_control_rod': s._fail.stuck_rod = { active: false, worth_held: 0 }; break;
        case 'secondary_depressurize': s._fail.steam_break = { active: false, size: 0 }; break;
      }
    }
  };

  // Full-power equilibrium temperatures (P0=1) — reference for MTC/Doppler and HZP pinning.
  PWREngine.prototype._computeEquilibriumTemps = function (P0) {
    var cfg = this.cfg;
    var Tsec = TH.T_sat(cfg.steam_generator.steam_p_rated);
    var Tavg = Tsec + (P0 * cfg.thermal.heat_gen_coeff) / cfg.thermal.h_sg;
    var delta_T = cfg.thermal.delta_T_rated * P0;
    return {
      Tavg: Tavg,
      Tfuel: Tavg + P0 * cfg.thermal.heat_gen_coeff / cfg.thermal.h_fc,
      Thot: Tavg + delta_T / 2,
      Tcold: Tavg - delta_T / 2,
      Tsec: Tsec,
    };
  };

  PWREngine.prototype._ensureHfpRefs = function () {
    if (this._hfp_refs) return;
    var eq = this._computeEquilibriumTemps(1.0);
    this._hfp_refs = { Tf: eq.Tfuel, Tavg: eq.Tavg };
  };

  // ================================================================ initial state
  PWREngine.prototype.reset = function (cmd) {
    var name = (cmd && cmd.initial_state) || 'hot_full_power';
    this.rod_groups = this._makeRodGroups();
    this.active_failures = [];
    this.s = this._buildState(name);
    // Reference temps = full-power equilibrium (fixed for MTC/Doppler, M1 §10).
    this._ensureHfpRefs();
    this.T_fuel_ref = this._hfp_refs.Tf;
    this.T_coolant_ref = this._hfp_refs.Tavg;
    this._trimToCritical(name);
    this.instruments.reset(this.getTrueState(), this._instrExtras());
  };

  PWREngine.prototype._buildState = function (name) {
    var cfg = this.cfg, init = cfg.initial_states[name] || cfg.initial_states.hot_full_power;
    var P0 = init.power;

    // Equilibrium temperatures from the steady heat balance (see derivation in
    // the module notes): full power → Tavg ≈ 304 °C, fuel ≈ +389 °C.
    var Tsec = TH.T_sat(cfg.steam_generator.steam_p_rated);
    var heatToCoolant = cfg.thermal.h_fc * (P0 * cfg.thermal.heat_gen_coeff / cfg.thermal.h_fc); // = P0*heat_gen
    var TavgMinusTsec = (P0 * cfg.thermal.heat_gen_coeff) / cfg.thermal.h_sg;
    var Tavg = Tsec + TavgMinusTsec;
    var Tfuel = Tavg + P0 * cfg.thermal.heat_gen_coeff / cfg.thermal.h_fc;
    var delta_T = cfg.thermal.delta_T_rated * P0 / 1.0;

    var X_eq = this._computeXeq();
    this._X_eq = X_eq;

    var d = cfg.kinetics.delayed;
    var C = [];
    for (var i = 0; i < 6; i++) C[i] = init.subcritical ? 0 : (d.beta_i[i] / d.lambda_i[i]) * P0 / d.Lambda;

    var s = {
      sim_time: 0,
      _P: P0, power_pct: P0 * 100, _prev_power_pct: P0 * 100, _power_rate: 0, _rho: 0,
      _C: C, _I: init.subcritical ? 0 : this._I_eq(), _X: init.subcritical ? 0 : X_eq,
      // Decay heat pre-loaded to the equilibrium fraction for this power (a
      // reactor that has been running a while), ~0 for a subcritical cold start.
      _H1: init.subcritical ? 0 : cfg.kinetics.decay.H1_0 * P0,
      _H2: init.subcritical ? 0 : cfg.kinetics.decay.H2_0 * P0,
      decay_heat_pct: init.subcritical ? 0 : (cfg.kinetics.decay.H1_0 + cfg.kinetics.decay.H2_0) * P0 * 100,
      xenon_pct_eq: init.subcritical ? 0 : 100,
      boron_ppm: 800,

      fuel_temp_c: Tfuel, tavg_c: Tavg, thot_c: Tavg + delta_T / 2, tcold_c: Tavg - delta_T / 2,
      t_secondary_c: Tsec, subcooling_c: TH.T_sat(cfg.pressurizer.P_equilibrium) - Tavg,
      _Q_total: P0, _Q_coolant_to_sg: P0 * cfg.thermal.heat_gen_coeff, _dTavg_dt: 0, _h_fc_eff: cfg.thermal.h_fc,

      pressure_mpa: cfg.pressurizer.P_equilibrium,
      heater_power_frac: 0, spray_flow_frac: 0, heater_override: null, spray_override: null,
      porv_demand: 'closed', porv_open: false, porv_stuck: false, safety_open: false,
      block_valve_open: true,                 // PORV isolation/block valve (B1; default open)
      porv_flow: 0, safety_flow: 0,
      pzr_level_pct: cfg.pressurizer.pzr_level_nominal,

      _mass: 1.0, core_inventory_pct: 100, primary_void_fraction: 0,
      charging_flow: 0, letdown_flow: 0, leak_flow: 0, safety_injection_flow: 0,
      charging_pump_running: true, cvcs_auto: false, boron_adjust: 0,   // CVCS
      hpi_active: false, hpi_flow_normalized: 0, hpi_flow_multiplier: 1.0,
      flow_frac: 1.0, pump_flow_pct: 100, pump_running: true, station_blackout: false,

      sg_level_pct: cfg.steam_generator.sg_level_nominal,
      steam_pressure_mpa: cfg.steam_generator.steam_p_rated,
      steam_flow_normalized: P0, fw_flow_normalized: P0,
      steam_dump_override: null, steam_dump_frac: 0,   // B2 (null = auto)
      feedwater_demand_frac: P0, feedwater_flow: P0, main_feedwater_available: true,
      afw_active: false, afw_blocked: false, dhr_active: false,

      turbine_rpm: cfg.turbine.rpm_rated, condenser_vacuum_kpa: cfg.turbine.vacuum_rated,
      generator_load: P0, turbine_demand_frac: P0, turbine_tripped: false,
      condenser_cooling_available: true, steam_demand_mwe: P0 * cfg.turbine.mwe_rated,
      mwe_output: P0 * cfg.turbine.mwe_rated,

      scrammed: false, melted: false, fuel_damaged: false, destruction_cause: 'none',
      scram_blocked: false,
      _fail: {
        rod_runaway: { active: false, rate: 0 },
        stuck_rod: { active: false, worth_held: 0 },
        steam_break: { active: false, size: 0 },
      },
    };

    // Place the control group at this state's operating position (% withdrawn),
    // per-state data so the rods track the starting power; boron (below) closes
    // the reactivity balance. Falls back to the plant operating position.
    var cg = this.rod_groups[0];
    var opPct = (init.rod_op_pct != null) ? init.rod_op_pct : cfg.rods.control_op_position_pct;
    cg.steps = Math.round(opPct / 100 * cg.max_steps);
    this._updateRodDerived(cg);

    // Hot standby: hold NOP temperature/pressure (M1 §10) — not the low-T power∝0 equilibrium.
    if (init.at_operating_temp) {
      var eq = this._computeEquilibriumTemps(1.0);
      s.tavg_c = eq.Tavg;
      s.thot_c = eq.Thot;
      s.tcold_c = eq.Tcold;
      s.t_secondary_c = eq.Tsec;
      s.fuel_temp_c = eq.Tavg;   // negligible fission: fuel near coolant (decay preloaded below)
      s.subcooling_c = TH.T_sat(cfg.pressurizer.P_equilibrium) - eq.Tavg;
      s._Q_coolant_to_sg = 0;
      s._dTavg_dt = 0;
      // Recent-shutdown decay maintains hot loop while subcritical (not scrammed — HZP lineup).
      var dh = cfg.kinetics.decay;
      s._H1 = dh.H1_0 * 0.07;
      s._H2 = dh.H2_0 * 0.07;
      s.decay_heat_pct = (s._H1 + s._H2) * 100;
    }

    if (name === 'hot_full_power' && !this._hfp_refs) {
      this._hfp_refs = { Tf: Tfuel, Tavg: Tavg };
    }
    return s;
  };

  PWREngine.prototype._computeXeq = function () {
    var x = this.cfg.kinetics.xenon;
    var I_eq = x.gamma_I / x.lambda_I;
    return (x.lambda_I * I_eq + x.gamma_X) / (x.lambda_X + x.sigma_phi);
  };
  PWREngine.prototype._I_eq = function () {
    var x = this.cfg.kinetics.xenon; return x.gamma_I / x.lambda_I;
  };

  // Trim boron so the net reactivity is exactly critical (ρ = 0) at the operating
  // point of a non-subcritical state; for hot_zero_power leave a subcritical margin.
  PWREngine.prototype._trimToCritical = function (name) {
    var s = this.s, rc = this.cfg.reactivity;
    if (this.T_fuel_ref == null) { this.T_fuel_ref = s.fuel_temp_c; this.T_coolant_ref = s.tavg_c; }
    var rho_rods = this._rodReactivity();
    var rho_doppler = rc.alpha_D * (s.fuel_temp_c - this.T_fuel_ref);
    var rho_mtc = rc.alpha_MTC * (s.tavg_c - this.T_coolant_ref);
    var rho_xenon = -this.cfg.kinetics.xenon.xenon_worth * (s._X / this._X_eq);
    var nonBoron = rc.rho_excess + rho_rods + rho_doppler + rho_mtc + rho_xenon;
    if (this.cfg.initial_states[name] && this.cfg.initial_states[name].subcritical) {
      // ρ_boron = -(nonBoron) - margin  → ρ_total = -margin (subcritical).
      var margin = 0.01;
      s.boron_ppm = Math.max(0, (nonBoron + margin) / rc.boron_worth_per_ppm);
    } else {
      s.boron_ppm = Math.max(0, nonBoron / rc.boron_worth_per_ppm);
    }
    s._rho = this._totalReactivity();
  };

  // ================================================================== save/restore
  PWREngine.prototype.saveState = function () {
    return {
      schema: 'pwr-1.0',
      s: JSON.parse(JSON.stringify(this.s)),
      rod_groups: JSON.parse(JSON.stringify(this.rod_groups)),
      active_failures: this.active_failures.slice(),
      instruments: this.instruments.save(),
      refs: { Tf: this.T_fuel_ref, Tavg: this.T_coolant_ref, X_eq: this._X_eq, hfp: this._hfp_refs },
    };
  };
  PWREngine.prototype.loadState = function (st) {
    this.s = JSON.parse(JSON.stringify(st.s));
    this.rod_groups = JSON.parse(JSON.stringify(st.rod_groups));
    this.active_failures = st.active_failures.slice();
    this.instruments.load(st.instruments);
    this.T_fuel_ref = st.refs.Tf; this.T_coolant_ref = st.refs.Tavg;
    this._X_eq = st.refs.X_eq; this._hfp_refs = st.refs.hfp;
  };

  RD.PWREngine = PWREngine;
  RD.pwrScruve = scruve;

  // ========================================================================
  // §14 — PWR Scenario Test Suite (the acceptance gate). Calls the engine
  // directly, bypassing every layer above (integration is M7's job). Each test
  // returns { name, pass, checks:[{desc, expected, observed, pass}] }.
  // ========================================================================
  function near(a, b, tol) { return Math.abs(a - b) <= tol; }

  function Harness(initial, seed) {
    this.eng = new PWREngine({ initial_state: initial || 'hot_full_power', seed: seed });
    this.dt = 0.02;
  }
  Harness.prototype.run = function (seconds) {
    var n = Math.round(seconds / this.dt);
    for (var i = 0; i < n; i++) this.eng.step(this.dt);
    return this;
  };
  // Run until pred(true_state, instruments) is true or timeout; returns seconds elapsed.
  Harness.prototype.runUntil = function (pred, maxSeconds) {
    var n = Math.round(maxSeconds / this.dt), t = 0;
    for (var i = 0; i < n; i++) {
      this.eng.step(this.dt); t += this.dt;
      if (pred(this.eng.getTrueState(), this.eng.getInstruments())) return t;
    }
    return -1;
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
    var pass = checks.every(function (c) { return c.pass; });
    return { name: name, pass: pass, checks: checks };
  }

  // A minimal RPS emulator for the physics tests (the real RPS is M4). Reads the
  // instrument values against the trip table and scrams; used only to demonstrate
  // that the physics reaches trip-worthy conditions.
  function rpsWouldTrip(eng) {
    var ins = eng.getInstruments(), ts = eng.getTrueState();
    var trips = eng.getProtectionConfig().trips, reasons = [];
    for (var i = 0; i < trips.length; i++) {
      var t = trips[i];
      var v = t.instrument === '__true_flow__' ? ts.pump_flow_pct / 100 : ins[t.instrument];
      if (v == null) continue;
      if (t.direction === 'high' && v >= t.setpoint) reasons.push(t.instrument + ' high');
      if (t.direction === 'low' && v <= t.setpoint) reasons.push(t.instrument + ' low');
    }
    return reasons;
  }

  var PWRScenarioTests = {
    near: near,
    Harness: Harness,

    steady_full_power: function () {
      return test('Steady operation — hot_full_power', function (ck) {
        var h = new Harness('hot_full_power');
        var p0 = h.ts().power_pct;
        h.run(300);
        var t = h.ts();
        ck('power holds ~100%', t.power_pct.toFixed(2), near(t.power_pct, 100, 1.5), '100 ±1.5');
        ck('pressure holds ~15.41 MPa', t.pressure_mpa.toFixed(3), near(t.pressure_mpa, 15.41, 0.25), '15.41 ±0.25');
        ck('Tavg holds ~304 °C', t.tavg_c.toFixed(2), near(t.tavg_c, 304, 3), '304 ±3');
        ck('pzr level stable', t.pzr_level_pct.toFixed(1), near(t.pzr_level_pct, 55, 6), '55 ±6');
        ck('SG level stable', t.sg_level_pct.toFixed(1), near(t.sg_level_pct, 65, 8), '65 ±8');
        ck('not scrammed', t.scrammed, t.scrammed === false, false);
        ck('reactivity ≈ critical', h.eng.s._rho.toExponential(2), Math.abs(h.eng.s._rho) < 5e-4, '|ρ|<5e-4');
        ck('no drift in power vs start', (t.power_pct - p0).toFixed(2), near(t.power_pct, p0, 1.5), '≈ start');
      });
    },

    hot_zero_power_standby: function () {
      return test('Hot zero power — NOP temperature (HZP)', function (ck) {
        var h = new Harness('hot_zero_power');
        var t0 = h.ts();
        ck('subcritical', t0.reactivity_pcm.toFixed(0), t0.reactivity_pcm < 0, '< 0');
        ck('Tavg ≈ 304 °C at reset', t0.tavg_c.toFixed(2), near(t0.tavg_c, 304, 3), '304 ±3');
        ck('pressure ≈ 15.41 MPa', t0.pressure_mpa.toFixed(3), near(t0.pressure_mpa, 15.41, 0.25), '15.41 ±0.25');
        h.run(100);
        var t = h.ts();
        ck('Tavg holds ~304 °C (idle HZP)', t.tavg_c.toFixed(2), near(t.tavg_c, 304, 4), '304 ±4');
        ck('still subcritical', t.reactivity_pcm.toFixed(0), t.reactivity_pcm < 0, '< 0');
      });
    },

    steady_50_percent: function () {
      return test('Steady operation — 50_percent', function (ck) {
        var h = new Harness('50_percent');
        h.run(300);
        var t = h.ts();
        ck('power holds ~50%', t.power_pct.toFixed(2), near(t.power_pct, 50, 1.5), '50 ±1.5');
        ck('stable pressure', t.pressure_mpa.toFixed(3), near(t.pressure_mpa, 15.41, 0.3), '15.41 ±0.3');
        ck('not scrammed', t.scrammed, t.scrammed === false, false);
        ck('reactivity ≈ critical', h.eng.s._rho.toExponential(2), Math.abs(h.eng.s._rho) < 5e-4, '|ρ|<5e-4');
      });
    },

    control_response: function () {
      return test('Control response — rod withdraw/insert', function (ck) {
        var h = new Harness('hot_full_power');
        h.run(30);
        var p_before = h.ts().power_pct;
        h.cmd({ action: 'rod_nudge', group_id: 'control_rods', steps: 8 }); // withdraw
        h.run(120);
        var p_with = h.ts().power_pct;
        ck('power rises on withdraw', p_with.toFixed(2), p_with > p_before + 0.5, '> ' + p_before.toFixed(2));
        ck('re-settles (stable)', h.eng.s._rho.toExponential(2), Math.abs(h.eng.s._rho) < 1e-3, 'near critical');
        var p_mid = h.ts().power_pct;
        h.cmd({ action: 'rod_nudge', group_id: 'control_rods', steps: -8 }); // insert back
        h.run(120);
        var p_back = h.ts().power_pct;
        ck('power falls on insert', p_back.toFixed(2), p_back < p_mid - 0.5, '< ' + p_mid.toFixed(2));
      });
    },

    shutdown_scram: function () {
      return test('Shutdown — scram dynamics + decay heat', function (ck) {
        var h = new Harness('hot_full_power');
        h.run(10);
        h.cmd({ action: 'scram' });
        // After ~0.5 s power should be falling but not yet zero (real over-time insertion).
        h.run(0.5);
        var p_mid = h.ts().power_pct;
        ck('power falling but not instant', p_mid.toFixed(1), p_mid < 100 && p_mid > 2, '2..100');
        h.run(60);
        var t = h.ts();
        ck('fission collapsed', t.power_pct.toFixed(3), t.power_pct < 5, '< 5%');
        ck('decay heat persists ~7%→', t.decay_heat_pct.toFixed(2), t.decay_heat_pct > 4 && t.decay_heat_pct < 8, '4..8%');
        ck('rods inserted', h.eng.s.power_pct >= 0, h.eng._controlGroup().steps < 30, 'control rods in');
      });
    },

    transient_loss_feedwater: function () {
      return test('Transient — loss of main feedwater', function (ck) {
        var h = new Harness('hot_full_power');
        h.run(10);
        h.cmd({ action: 'inject_failure', failure_id: 'loss_of_feedwater' });
        var t = h.runUntil(function (ts, ins) { return ins.sg_level <= 12; }, 600);
        ck('SG level falls to low-SG trip setpoint', t >= 0 ? t.toFixed(1) + 's' : 'never', t >= 0, 'reaches 12%');
        var reasons = rpsWouldTrip(h.eng);
        ck('RPS would trip (low SG level)', reasons.join(','), reasons.length > 0, 'a trip fires');
      });
    },

    transient_rcp_trip: function () {
      return test('Transient — RCP trip / loss of flow', function (ck) {
        var h = new Harness('hot_full_power');
        h.run(10);
        h.cmd({ action: 'inject_failure', failure_id: 'rcp_trip' });
        var t = h.runUntil(function (ts) { return ts.pump_flow_pct / 100 <= 0.25; }, 60);
        ck('flow coasts down below low-flow trip', t >= 0 ? t.toFixed(1) + 's' : 'never', t >= 0, '< 0.25');
        ck('coastdown not instantaneous (τ≈8s)', t.toFixed(1), t > 4, '> 4s');
      });
    },

    transient_turbine_trip: function () {
      return test('Transient — turbine trip', function (ck) {
        var h = new Harness('hot_full_power');
        h.run(10);
        var p0 = h.ts().steam_demand_mwe;
        h.cmd({ action: 'inject_failure', failure_id: 'turbine_trip' });
        h.run(5);
        var t = h.ts();
        ck('steam demand → 0', t.steam_demand_mwe.toFixed(0), t.steam_demand_mwe === 0, '0 (was ' + p0.toFixed(0) + ')');
        h.run(20);
        ck('secondary pressure rises', h.eng.s.steam_pressure_mpa.toFixed(2), h.eng.s.steam_pressure_mpa > 5.65, '> 5.65');
      });
    },

    transient_loss_vacuum: function () {
      return test('Transient — loss of condenser vacuum', function (ck) {
        var h = new Harness('hot_full_power');
        h.run(10);
        h.cmd({ action: 'inject_failure', failure_id: 'loss_of_condenser_vacuum' });
        var t = h.runUntil(function (ts) { return ts.condenser_vacuum_kpa < 74.5; }, 120);
        ck('vacuum decays below trip level', t >= 0 ? t.toFixed(1) + 's' : 'never', t >= 0, '< 74.5 kPa');
        h.run(2);
        ck('turbine trips', h.ts().turbine_rpm.toFixed(0), h.eng.s.turbine_tripped === true, 'tripped');
      });
    },

    flagship_tmi: function () {
      return test('Flagship — Three Mile Island', function (ck) {
        // Drive the §11 sequence directly (the test plays RPS + PORV actuation).
        var h = new Harness('hot_full_power');
        h.run(10);
        h.cmd({ action: 'inject_failure', failure_id: 'loss_of_feedwater' });
        // Reactor trips on low SG level (emulated RPS).
        h.runUntil(function (ts, ins) { return ins.sg_level <= 12; }, 600);
        h.cmd({ action: 'scram' });
        // Pressure rises → PORV auto-opens (emulated actuation); then it sticks.
        h.runUntil(function (ts, ins) { return ins.primary_pressure >= 16.20; }, 60);
        h.cmd({ action: 'open_porv' });
        h.cmd({ action: 'inject_failure', failure_id: 'stuck_porv_open' });
        h.cmd({ action: 'inject_failure', failure_id: 'porv_indicator_stuck_closed' });
        h.cmd({ action: 'close_porv' }); // operator "closes" it — but it's stuck open

        var inv0 = h.ts().core_inventory_pct, pzr0 = h.ts().pzr_level_pct;
        h.run(120);
        var t = h.ts(), ins = h.ins();
        ck('PORV truly open', t.porv_open, t.porv_open === true, true);
        ck('indicator reads CLOSED (the lie)', ins.porv_indicator, ins.porv_indicator === 'closed', 'closed');
        ck('inventory falls', t.core_inventory_pct.toFixed(1), t.core_inventory_pct < inv0 - 2, '< ' + inv0.toFixed(1));
        ck('pzr level rises as inventory falls', t.pzr_level_pct.toFixed(1), t.pzr_level_pct > pzr0, '> ' + pzr0.toFixed(1));
        ck('subcooling margin erodes toward 0', ins.subcooling_margin.toFixed(1), ins.subcooling_margin < 11, '< 11 °C');

        // Save the stuck-PORV condition, then branch.
        var snap = h.eng.saveState();

        // Damage branch: HPI off → inventory below 0.50 → heat transfer collapses
        // → fuel heats toward melt → core damage (the 1979 outcome).
        var hd = new Harness('hot_full_power'); hd.eng.loadState(snap);
        hd.cmd({ action: 'set_hpi', active: false });
        var dmgThreshold = hd.eng.cfg.thermal.fuel_damage_c;
        var tdmg = hd.runUntil(function (ts) { return ts.fuel_temp_c > dmgThreshold; }, 6000);
        var td = hd.ts();
        ck('damage branch: inventory uncovers core (< 50%)', td.core_inventory_pct.toFixed(1), td.core_inventory_pct < 50, '< 50%');
        ck('damage branch: fuel damage occurs (> 1200 °C)', tdmg >= 0 ? tdmg.toFixed(0) + 's, ' + td.fuel_temp_c.toFixed(0) + '°C' : 'never', tdmg >= 0 && td.fuel_temp_c > dmgThreshold, 'fuel_temp > 1200 °C');

        // Recovery branch: HPI run → inventory maintained, core stays covered.
        var hr = new Harness('hot_full_power'); hr.eng.loadState(snap);
        hr.cmd({ action: 'set_hpi', active: true });
        hr.run(600);
        var tr = hr.ts();
        ck('recovery branch: core stays covered', tr.core_inventory_pct.toFixed(1), tr.core_inventory_pct > 50, '> 50%');
        ck('recovery branch: not melted', tr.melted, tr.melted === false, false);
      });
    },

    physics_failures: function () {
      return test('Physics-parameter & instrument failures', function (ck) {
        // Continuous rod withdrawal: control group withdraws despite rod_stop; scram halts.
        var h = new Harness('hot_full_power');
        h.run(5);
        var steps0 = h.eng._controlGroup().steps;
        h.cmd({ action: 'inject_failure', failure_id: 'continuous_rod_withdrawal', severity: 0.5 });
        h.cmd({ action: 'rod_stop', group_id: 'control_rods' });
        h.run(5);
        var p_runaway = h.ts().power_pct;
        ck('rods withdraw despite stop', h.eng._controlGroup().steps > steps0, h.eng._controlGroup().steps > steps0, 'steps↑');
        ck('power rises on runaway', p_runaway.toFixed(1), p_runaway > 100.2, '> 100');
        h.cmd({ action: 'scram' });
        h.run(10);
        ck('scram halts the excursion', h.ts().power_pct.toFixed(1), h.ts().power_pct < 50, 'power↓');

        // Stuck rod on scram: shallower post-scram decay than a clean scram.
        var clean = new Harness('hot_full_power'); clean.run(5); clean.cmd({ action: 'scram' }); clean.run(8);
        var stuck = new Harness('hot_full_power'); stuck.run(5);
        stuck.cmd({ action: 'inject_failure', failure_id: 'stuck_rod_on_scram', severity: 1.0 });
        stuck.cmd({ action: 'scram' }); stuck.run(8);
        ck('stuck-rod residual power higher than clean scram',
          stuck.ts().power_pct.toFixed(3) + ' vs ' + clean.ts().power_pct.toFixed(3),
          stuck.ts().power_pct > clean.ts().power_pct, 'stuck > clean');

        // Steam line break: steam pressure and Tavg fall, ρ_MTC turns positive.
        var sb = new Harness('hot_full_power'); sb.run(5);
        var tavg0 = sb.ts().tavg_c;
        sb.cmd({ action: 'inject_failure', failure_id: 'steam_line_break', severity: 0.6 });
        sb.run(15);
        ck('steam pressure falls', sb.eng.s.steam_pressure_mpa.toFixed(2), sb.eng.s.steam_pressure_mpa < 5.0, '< 5.0');
        ck('Tavg falls (overcooling)', sb.ts().tavg_c.toFixed(2), sb.ts().tavg_c < tavg0, '< ' + tavg0.toFixed(2));

        // Instrument modes: stuck-at-current tavg holds while true Tavg moves.
        var im = new Harness('hot_full_power'); im.run(5);
        var held = im.ins().tavg;
        im.cmd({ action: 'set_instrument_failure', instrument_id: 'tavg', mode: 'stuck' });
        im.cmd({ action: 'rod_nudge', group_id: 'control_rods', steps: 10 });
        im.run(60);
        ck('stuck tavg instrument frozen', im.ins().tavg.toFixed(2), near(im.ins().tavg, held, 0.01), 'held=' + held.toFixed(2));
        ck('true Tavg moved', im.ts().tavg_c.toFixed(2), Math.abs(im.ts().tavg_c - held) > 0.2, 'diverged');

        // Drifting primary_pressure diverges linearly from steady truth.
        var dr = new Harness('hot_full_power'); dr.run(5);
        var pr0 = dr.ins().primary_pressure;
        dr.cmd({ action: 'set_instrument_failure', instrument_id: 'primary_pressure', mode: 'drift', value: 0.05 });
        dr.run(40);
        ck('drifting pressure diverges', dr.ins().primary_pressure.toFixed(2), Math.abs(dr.ins().primary_pressure - pr0) > 1.0, 'drifted');
      });
    },

    save_restore: function () {
      return test('Save and restore — exact fidelity', function (ck) {
        // Mid-transient with a failure active (steam line break) — the only way
        // to catch a missing _fail field or unsaved drift offset.
        var a = new Harness('hot_full_power', 12345);
        a.run(8);
        a.cmd({ action: 'inject_failure', failure_id: 'steam_line_break', severity: 0.5 });
        a.cmd({ action: 'set_instrument_failure', instrument_id: 'tavg', mode: 'drift', value: 0.03 });
        a.run(5);
        var snap = a.eng.saveState();

        var b = new Harness('hot_full_power', 999); // different seed; load must override
        b.eng.loadState(snap);

        // Continue both 10 s and compare — they must be identical.
        a.run(10); b.run(10);
        var ta = a.ts(), tb = b.ts(), ia = a.ins(), ib = b.ins();
        ck('power identical', tb.power_pct.toFixed(6), near(ta.power_pct, tb.power_pct, 1e-9), ta.power_pct.toFixed(6));
        ck('pressure identical', tb.pressure_mpa.toFixed(6), near(ta.pressure_mpa, tb.pressure_mpa, 1e-9), ta.pressure_mpa.toFixed(6));
        ck('Tavg identical', tb.tavg_c.toFixed(6), near(ta.tavg_c, tb.tavg_c, 1e-9), ta.tavg_c.toFixed(6));
        ck('steam pressure identical (failure state)', b.eng.s.steam_pressure_mpa.toFixed(6), near(a.eng.s.steam_pressure_mpa, b.eng.s.steam_pressure_mpa, 1e-9), a.eng.s.steam_pressure_mpa.toFixed(6));
        ck('instrument tavg identical (drift offset)', ib.tavg.toFixed(6), near(ia.tavg, ib.tavg, 1e-9), ia.tavg.toFixed(6));
        ck('noise sequence identical (PRNG)', ib.power_range.toFixed(6), near(ia.power_range, ib.power_range, 1e-9), ia.power_range.toFixed(6));
      });
    },
  };

  PWRScenarioTests.runAll = function () {
    var order = ['steady_full_power', 'hot_zero_power_standby', 'steady_50_percent', 'control_response', 'shutdown_scram',
      'transient_loss_feedwater', 'transient_rcp_trip', 'transient_turbine_trip',
      'transient_loss_vacuum', 'flagship_tmi', 'physics_failures', 'save_restore'];
    var results = [];
    for (var i = 0; i < order.length; i++) results.push(PWRScenarioTests[order[i]]());
    return results;
  };

  RD.PWRScenarioTests = PWRScenarioTests;

})(globalThis.RD || (globalThis.RD = {}));
