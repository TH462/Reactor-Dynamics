/*
 * rbmk_engine.js — the RBMKEngine class (M2) and RBMKScenarioTests (§19).
 *
 * Carries the RBMK's own per-step orchestration over its kinetics core (with the
 * prompt fast-path), reactivity feedbacks (the nonlinear amplified void term with
 * the ORM penalty, the version-specific rod/displacer reactivity, Doppler,
 * graphite, xenon), the boiling pressure-tube thermal-hydraulics, the ORM, the
 * two destruction paths, and the instrument model — then exposes the contract
 * surface consumed by M4/M5 (§17).
 *
 * Two versions in one engine (pre_chernobyl / post_chernobyl) via design_version
 * (§4). HR2: the engine makes no control decisions; trips/alarms are M4's job —
 * this engine only defines them as data (rbmk_protection.js).
 *
 * INTERNAL rod convention (§9/§14.1): group.steps = INSERTION depth (0 withdrawn,
 * max inserted) — the opposite of the PWR. The contract position_pct (100 =
 * withdrawn) and a withdrawn-based `steps` are derived in getControlState.
 *
 * RBMKScenarioTests (the §19 acceptance gate) lives at the bottom and calls the
 * engine directly, bypassing every layer above (integration is M7's job).
 *
 * Attaches RD.RBMKEngine and RD.RBMKScenarioTests.
 */
;(function (RD) {
  'use strict';

  var CFG = RD.RBMK_CONFIG;
  var K = RD.rbmkKinetics, TH = RD.rbmkThermal, Rods = RD.rbmkRods;

  function clip(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }

  function loadModeOpts(cfg) {
    return {
      mweRated: cfg.turbine.mwe_rated,
      setLoad: function (s, mwe, rated) {
        s.steam_to_turbine = clip(mwe / rated, 0, 1.2);
        if (s.steam_to_turbine > 0 && s.condenser_vacuum_kpa >= cfg.turbine.vacuum_trip_kpa) s.turbine_tripped = false;
      },
      setFeed: function (s, frac) {
        if (!s.feedwater_blocked) s.feedwater_normalized = frac;
      },
      tripFn: TH.tripTurbine,
    };
  }

  // ====================================================================== engine
  function RBMKEngine(opts) {
    opts = opts || {};
    this.version = opts.design_version === 'post_chernobyl' ? 'post_chernobyl' : 'pre_chernobyl';
    this.cfg = CFG.forVersion(this.version);
    this.dt_nominal = 0.02;
    this.seed = opts.seed != null ? opts.seed : 0x9E3779B9;
    this.instruments = new RD.RBMKInstruments(this.cfg, this.seed);
    this.reset({ plant_id: 'rbmk', initial_state: opts.initial_state || 'full_power', design_version: this.version });
  }

  RBMKEngine.prototype._group = function (id) {
    for (var i = 0; i < this.rod_groups.length; i++) if (this.rod_groups[i].id === id) return this.rod_groups[i];
    return null;
  };
  RBMKEngine.prototype._controlGroup = function () {
    for (var i = 0; i < this.rod_groups.length; i++) {
      var g = this.rod_groups[i];
      if (g.function === 'control') return g;
    }
    return this.rod_groups[0];
  };

  // ------------------------------------------------------ reactivity (§5)
  // Total rod reactivity: control/manual via the version per-rod function (with
  // the §14.1 positional stall split), shutdown/AZ rods as pure absorbers.
  RBMKEngine.prototype._rodReactivity = function () {
    var s = this.s, cfg = this.cfg, rho = 0;
    var perRod = Rods.perRodFor(this.version, cfg);
    for (var i = 0; i < this.rod_groups.length; i++) {
      var g = this.rod_groups[i];
      var z_live = Rods.depthFromSteps(g.steps, cfg);
      if (g.function === 'control') {
        if (s._fail.stuck_rod.active) {
          var stalled = s._fail.stuck_rod.frac * g.rod_count;
          rho += stalled * perRod(s._fail.stuck_rod.z_stuck, cfg)
               + (g.rod_count - stalled) * perRod(z_live, cfg);
        } else {
          rho += g.rod_count * perRod(z_live, cfg);
        }
      } else {
        rho += g.rod_count * Rods.rhoRodPost(z_live, cfg); // shutdown — always pure absorber
      }
    }
    return rho;
  };

  RBMKEngine.prototype._totalReactivity = function () {
    var s = this.s, cfg = this.cfg, r = cfg.reactivity;
    var rho_rods = this._rodReactivity();
    var rho_doppler = r.alpha_D * (s.fuel_temp_c - this.Tf_ref);
    var rho_graphite = r.alpha_graphite * (s.graphite_temp_avg_c - this.Tg_ref);
    var xenon_fraction = s._X / s._X_eq;
    var rho_xenon = -cfg.kinetics.xenon.xenon_worth * xenon_fraction;
    var orm = Rods.getOrm(this.rod_groups, cfg);
    var rho_void = K.rhoVoid(s._P, xenon_fraction, s.void_fraction_avg, orm, cfg, this.void_ref);
    return (this.rho_excess || 0) + rho_rods + rho_doppler + rho_void + rho_xenon + rho_graphite;
  };

  // --------------------------------------------------------------- rods (§12)
  RBMKEngine.prototype._stepRods = function (dt) {
    var s = this.s, cg = this._controlGroup();

    // §14.1 continuous rod withdrawal: drive the control group OUT (decrease
    // insertion), overriding operator demand. A scram reverses it (the scram
    // velocity drives insertion up) — so skip the decrement once scrammed.
    if (s._fail.rod_runaway.active && !cg.scrammed) {
      cg.steps = Math.max(0, cg.steps - s._fail.rod_runaway.rate * dt);
      cg.moving = true; cg.direction = 1; // contract +1 = withdraw
    }

    for (var i = 0; i < this.rod_groups.length; i++) {
      var g = this.rod_groups[i];
      if (g.scrammed) {
        var t_scram = this.cfg.rods.scram_time_s;
        g.velocity = g.max_steps / t_scram; // + = inserting
      }
      if (!g.velocity) { g.moving = (g.velocity !== 0); this._updateRodDerived(g); continue; }
      g.moving = true;
      g.direction = g.velocity < 0 ? 1 : -1;          // contract: +1 withdraw, -1 insert
      g.step_accumulator += Math.abs(g.velocity) * dt;
      var dir = g.velocity > 0 ? 1 : -1;              // insertion-step direction
      while (g.step_accumulator >= 1.0) {
        g.steps = clip(g.steps + dir, 0, g.max_steps);
        g.step_accumulator -= 1.0;
        if (g.nudge_target != null && g.steps === g.nudge_target) { g.velocity = 0; g.moving = false; g.nudge_target = null; break; }
        if (g.steps === 0 || g.steps === g.max_steps) { g.velocity = 0; g.moving = false; g.nudge_target = null; break; }
      }
      this._updateRodDerived(g);
    }
  };

  RBMKEngine.prototype._updateRodDerived = function (g) {
    // position_pct uses the contract convention (100 = fully withdrawn).
    g.position_pct = (1 - g.steps / g.max_steps) * 100;
  };

  RBMKEngine.prototype._loadModeOpts = function () { return loadModeOpts(this.cfg); };
  RBMKEngine.prototype._stepLoadMode = function (dt) {
    RD.LoadMode.step(this.s, dt, this._loadModeOpts());
  };

  // ====================================================== the per-step compute (§6)
  RBMKEngine.prototype.step = function (dt_effective) {
    var s = this.s, cfg = this.cfg;
    var dt = dt_effective != null ? dt_effective : this.dt_nominal;

    // 0. Rod motion (runaway / scram / operator) before reactivity reads positions.
    this._stepRods(dt);

    if (!s.melted) {
      // 1. Total reactivity from current state (explicit coupling — void/temps
      //    from the previous step).
      var rho = this._totalReactivity();
      s._rho = rho;
      // 2. Point kinetics with the prompt fast-path → new power.
      K.stepKinetics(s, cfg, rho, dt);
      if (s._P > 1e9) s._P = 1e9;   // numeric backstop past destruction
      s.power_pct = s._P * 100;
      // 3. Xenon / iodine.
      K.stepXenon(s, cfg, dt);
    }

    // 4. Decay heat (heat-gen source folds into the fuel node).
    K.stepDecay(s, cfg, dt);
    // 5. Fuel temperature with dryout (uses Q_total = fission + decay).
    TH.stepFuel(s, cfg, dt);
    // 6. Graphite temperature.
    TH.stepGraphite(s, cfg, dt);
    // 7. Void fraction (from this step's power and last step's flow).
    TH.stepVoid(s, cfg, dt);
    // 7b. Load mode — turbine steam draw + coupled feedwater.
    this._stepLoadMode(dt);
    // 8. Steam-drum pressure and level.
    TH.stepDrumPressure(s, cfg, dt);
    if (s.feedwater_blocked) s.feedwater_normalized = 0;  // loss_of_feedwater persists
    TH.stepDrumLevel(s, cfg, dt);
    // 8b. Balance-of-plant: turbine / condenser / generator (electrical output).
    TH.stepTurbine(s, cfg, dt);
    // 9. Channel flow — MCP / coastdown.
    TH.stepChannelFlow(s, cfg, dt);
    // 9b. Channel rupture (after void / drum-level / flow updates, §14.1).
    TH.applyChannelRupture(s, cfg, dt);
    // 9c. ECCS — emergency core cooling: makes up drum level and holds a cooling-flow
    //     floor, arresting a pressure-tube-rupture drain / dryout.
    if (s.eccs_active) {
      s.drum_level_pct = clip(s.drum_level_pct + cfg.thermal.eccs_level_rate * dt, 0, 100);
      if (s.channel_flow_pct < cfg.thermal.eccs_flow_floor) s.channel_flow_pct = cfg.thermal.eccs_flow_floor;
    }
    // 10. ORM from rod positions.
    s.orm_equiv_rods = Rods.getOrm(this.rod_groups, cfg);
    s.orm_alarm_active = s.orm_equiv_rods < cfg.reactivity.orm_min;
    // 11. Energy-deposition rate; check destruction (both paths).
    K.stepEnergyDeposition(s, cfg, dt);
    K.checkDestruction(s, cfg);
    if (s.melted) s._scram_complete = true;

    // Smoothed power rate for the SUR / reactor-period proxies (§ getTrueState).
    var raw_rate = (s.power_pct - (s._prev_power_pct != null ? s._prev_power_pct : s.power_pct)) / dt;
    var a = dt / (2.0 + dt);
    s._power_rate = (s._power_rate || 0) + a * (raw_rate - (s._power_rate || 0));
    s._prev_power_pct = s.power_pct;

    // 12. Update instruments from the new true state (incl. computed orm_display).
    this.instruments.update(this.getTrueState(), dt, this._instrExtras());

    s.sim_time += dt;
  };

  RBMKEngine.prototype._instrExtras = function () {
    var s = this.s;
    // The exported ORM annunciator reads the ORM DISPLAY instrument (previous
    // step's reading): the Chernobyl orm_indicator_failure corrupts the
    // display, and the annunciator must follow the lie (HR1), not bypass it
    // with the truth. (true_state.orm_alarm_active stays the true version.)
    var rd = this.instruments && this.instruments.reading;
    var dispOrm = rd && rd.orm_display != null ? rd.orm_display : s.orm_equiv_rods;
    return {
      orm_true: s.orm_equiv_rods,
      rps_scrammed: s.scrammed,
      eps_bypassed: s.eps_bypassed,
      orm_alarm_active: dispOrm < this.cfg.reactivity.orm_min,
    };
  };

  // ============================================================ contract surface
  RBMKEngine.prototype.getTrueState = function () {
    var s = this.s;
    // Reactivity proxies (operator-facing, like the PWR): startup rate (dpm) and
    // reactor period from the smoothed power rate — well-defined above a small floor.
    var p = s.power_pct, pr = s._power_rate || 0, sur = 0, period = Infinity;
    // Live down into the source range (with the neutron source the subcritical
    // floor is ~5e-3 %), so SUR is defined through the approach to criticality.
    if (p > 1e-6) { sur = 26.06 * (pr / p); period = Math.abs(pr) > 1e-8 ? p / pr : Infinity; }
    return {
      power_pct: s.power_pct, fuel_temp_c: s.fuel_temp_c, void_fraction_avg: s.void_fraction_avg,
      steam_pressure_mpa: s.steam_pressure_mpa, drum_level_pct: s.drum_level_pct, channel_flow_pct: s.channel_flow_pct,
      graphite_temp_avg_c: s.graphite_temp_avg_c, decay_heat_pct: s.decay_heat_pct, xenon_pct_eq: s.xenon_pct_eq,
      orm_equiv_rods: s.orm_equiv_rods, orm_alarm_active: s.orm_alarm_active, eps_bypassed: s.eps_bypassed, eccs_active: s.eccs_active,
      scrammed: s.scrammed, melted: s.melted, destruction_cause: s.destruction_cause,
      steam_explosion_occurred: s.steam_explosion_occurred, energy_deposition_rate: s.energy_deposition_rate,
      design_version: this.version,
      reactivity_pcm: (s._rho || 0) * 1e5, startup_rate_dpm: sur, reactor_period_s: period,
      // Balance-of-plant (additive): turbine steam load + electrical output.
      steam_to_turbine: s.steam_to_turbine, mwe_output: s.mwe_output,
      turbine_rpm: s.turbine_rpm, condenser_vacuum_kpa: s.condenser_vacuum_kpa,
      turbine_tripped: s.turbine_tripped,
      load_mode: s.load_mode, load_target_mwe: s.load_target_mwe,
      load_imbalance_mwe: s.load_imbalance_mwe, sg_imbalance_active: s.sg_imbalance_active,
    };
  };

  RBMKEngine.prototype.getInstruments = function () { return this.instruments.reading; };

  RBMKEngine.prototype.getControlState = function () {
    var s = this.s;
    var groups = this.rod_groups.map(function (g) {
      // Convert INTERNAL insertion steps → contract (100 = fully withdrawn).
      var withdrawn_steps = g.max_steps - g.steps;
      return {
        id: g.id, name: g.name, function: g.function,
        steps: withdrawn_steps, max_steps: g.max_steps,
        position_pct: (withdrawn_steps / g.max_steps) * 100,
        moving: g.moving, direction: g.direction, speed: g.speed, scrammed: g.scrammed,
        insertion_limit_steps: g.insertion_limit_steps, at_insertion_limit: g.at_insertion_limit,
      };
    });
    return {
      rod_groups: groups,
      channel_flow_setpoint_pct: s.mcp_speed_pct,
      feedwater_flow_pct: s.feedwater_normalized * 100,
      feed_auto_coupled: s.feed_auto_coupled,
      eps_bypassed: s.eps_bypassed, eccs_active: s.eccs_active,
      load_mode: s.load_mode,
      load_target_mwe: s.load_target_mwe,
      sg_imbalance: s.sg_imbalance_active
        ? (s.load_imbalance_mwe > 0 ? 'filling' : 'draining') : 'balanced',
      // Balance-of-plant controls.
      turbine_load_mwe: s.steam_to_turbine * this.cfg.turbine.mwe_rated,
      steam_dump_pct: (s.steam_dump_frac || 0) * 100,
      steam_dump_auto: s.steam_dump_override == null,
    };
  };

  RBMKEngine.prototype.getActiveFailures = function () { return this.active_failures.slice(); };
  RBMKEngine.prototype.getProtectionConfig = function () { return this.cfg.protection; };

  // ================================================================== commands (§6.7)
  RBMKEngine.prototype.applyCommand = function (cmd) {
    var s = this.s, g;
    switch (cmd.action) {
      case 'rod_nudge':
        g = this._group(cmd.group_id);
        if (g && !(g === this._controlGroup() && s._fail.rod_runaway.active)) {
          // +steps = withdraw → DECREASE insertion (RBMK convention); move at speed.
          g.speed = cmd.speed || g.speed || 'normal';
          // A command to a bank at rest starts from a clean fraction — a leftover
          // accumulator would land the first step at once and ignore the speed.
          if (!g.velocity) g.step_accumulator = 0;
          g.nudge_target = clip(g.steps - cmd.steps, 0, g.max_steps);
          var nv = this.cfg.rods.speeds[g.speed] || this.cfg.rods.speeds.normal;
          g.velocity = (g.nudge_target >= g.steps ? 1 : -1) * nv;   // insertion velocity
          g.moving = g.nudge_target !== g.steps;
        }
        break;
      case 'rod_start':
        g = this._group(cmd.group_id);
        if (g && !(g === this._controlGroup() && s._fail.rod_runaway.active)) {
          g.speed = cmd.speed || 'normal'; g.nudge_target = null;
          if (!g.velocity) g.step_accumulator = 0;   // see rod_nudge
          var v = this.cfg.rods.speeds[g.speed] || this.cfg.rods.speeds.normal;
          // direction +1 = withdraw → negative insertion velocity.
          g.velocity = (cmd.direction >= 0 ? -1 : 1) * v;
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
      case 'manual_scram':
        if (!s.scram_blocked) this._scram();
        break;
      case 'set_channel_flow':
        s.mcp_speed_pct = clip(cmd.pct, 0, 120); s.mcp_running = true;
        break;
      case 'set_load_mode':
        RD.LoadMode.setMode(s, cmd.mode, { tripFn: TH.tripTurbine, rated: this.cfg.turbine.mwe_rated });
        break;
      case 'set_load_target':
        s.load_mode = 'manual';
        s.load_target_mwe = cmd.mwe;
        break;
      case 'disconnect_grid':
        RD.LoadMode.disconnect(s, TH.tripTurbine);
        break;
      case 'connect_grid':
        RD.LoadMode.setMode(s, 'follow', { rated: this.cfg.turbine.mwe_rated });
        if (s.condenser_vacuum_kpa >= this.cfg.turbine.vacuum_trip_kpa) s.turbine_tripped = false;
        break;
      case 'set_feedwater_flow':
        s.feed_auto_coupled = false;
        if (!s.feedwater_blocked) s.feedwater_normalized = clip(cmd.pct / 100, 0, 1.5);
        break;
      case 'set_feed_coupled':
        // Re-couple feedwater to load (the init default; set_feedwater_flow
        // uncouples). Used by the operator-automation layer during fast-forward.
        s.feed_auto_coupled = !!cmd.active;
        break;
      case 'set_turbine_load':
        // Two deliberate paths (parallel to the PWR's set_steam_demand vs
        // set_load_target): this legacy command writes steam_to_turbine
        // IMMEDIATELY (same-step effect; several suites and the UI rely on it),
        // while set_load_target defers to LoadMode.step, which re-applies the
        // manual target every step anyway — the two converge after one step.
        s.load_mode = 'manual';
        s.load_target_mwe = cmd.mwe;
        s.steam_to_turbine = clip(cmd.mwe / this.cfg.turbine.mwe_rated, 0, 1.2);
        if (s.steam_to_turbine > 0 && s.condenser_vacuum_kpa >= this.cfg.turbine.vacuum_trip_kpa) s.turbine_tripped = false;
        break;
      case 'trip_turbine':
        // Turbine protection lives in the control layer (low vacuum / overspeed
        // actuations reading instruments); this is the command it lands on.
        if (!s.turbine_tripped) TH.tripTurbine(s);
        break;
      case 'open_relief_valve':
        s.relief_open = true;    // drum relief — popped by the control layer's actuation
        break;
      case 'close_relief_valve':
        s.relief_open = false;   // reseat
        break;
      case 'set_steam_dump':
        // mode: 'auto' (null override) | 'open' (full) | 'closed' | a manual pct.
        if (cmd.mode === 'auto') s.steam_dump_override = null;
        else if (cmd.mode === 'open') s.steam_dump_override = 1.0;
        else if (cmd.mode === 'closed') s.steam_dump_override = 0.0;
        else if (cmd.pct != null) s.steam_dump_override = clip(cmd.pct / 100, 0, 1);
        break;
      case 'set_eps_bypass':
        s.eps_bypassed = !!cmd.active;
        break;
      case 'set_eccs':
        s.eccs_active = !!cmd.active;   // emergency core cooling
        break;
      case 'inject_failure':
        // Unknown ids must be loud (a silent no-op hides authoring typos).
        if (!this.cfg.protection.failures[cmd.failure_id])
          return { type: 'error', code: 'COMMAND_ERROR', message: 'unknown failure_id', received: cmd };
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

  RBMKEngine.prototype._scram = function () {
    this.s.scrammed = true;
    RD.LoadMode.disconnect(this.s, TH.tripTurbine);
    this.rod_groups.forEach(function (g) { g.scrammed = true; g.moving = true; g.nudge_target = null; });
  };

  // ------------------------------------------------------- failure dispatch
  RBMKEngine.prototype._injectFailure = function (id, severity) {
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
        case 'loss_of_feedwater': s.feedwater_blocked = true; s.feedwater_normalized = 0; break;
        case 'failure_to_scram':  s.scram_blocked = true; break;
      }
      return;
    }
    if (def.type === 'physics_parameter') {
      switch (def.effect) {
        case 'coast_down_mcp':    s.mcp_running = false; break;
        case 'disable_auto_trips': s.eps_bypassed = true; break;
        case 'reduce_h_fc':
          var meta = def.severity_meta, loss = severity * (meta ? meta.max / 100 : 0.9);
          s._h_fc_dryout_factor = clip(1 - loss, 0.05, 1.0);
          break;
        case 'partial_mcp_trip':
          s.mcp_speed_pct = 100.0 * (1.0 - this.cfg.physics_failures.PARTIAL_MCP_MAX_LOSS * severity);
          s.mcp_running = true;
          break;
        case 'stuck_control_rod':
          s._fail.stuck_rod = { active: true, frac: this.cfg.physics_failures.STUCK_ROD_MAX_FRAC * severity,
                                z_stuck: this.cfg.reactivity.z_water_m * 0.5 };
          break;
        case 'rod_withdrawal_runaway':
          s._fail.rod_runaway = { active: true, rate: this.cfg.physics_failures.ROD_RUNAWAY_RATE_MAX * severity };
          break;
        case 'channel_rupture':
          s._fail.channel_rupture = { active: true, size: severity };
          break;
        case 'trip_turbine': TH.tripTurbine(s); break;
        case 'vacuum_decay': s.condenser_cooling_available = false; break;
      }
      return;
    }
  };

  RBMKEngine.prototype._clearFailure = function (id) {
    var def = this.cfg.protection.failures[id];
    if (!def) return;
    var idx = this.active_failures.indexOf(id);
    if (idx !== -1) this.active_failures.splice(idx, 1);
    var s = this.s;
    if (def.type === 'instrument') { this.instruments.clearFailure(def.instrument_id); return; }
    if (def.type === 'command_override') {
      switch (id) {
        case 'loss_of_feedwater': s.feedwater_blocked = false; break;
        case 'failure_to_scram':  s.scram_blocked = false; break;
      }
      return;
    }
    if (def.type === 'physics_parameter') {
      switch (def.effect) {
        case 'coast_down_mcp':     break; // MCP stays off until restarted (set_channel_flow)
        case 'disable_auto_trips': s.eps_bypassed = false; break;
        case 'reduce_h_fc':        s._h_fc_dryout_factor = null; break;
        case 'partial_mcp_trip':   s.mcp_speed_pct = 100.0; s.mcp_running = true; break;
        case 'stuck_control_rod':  s._fail.stuck_rod = { active: false, frac: 0, z_stuck: 0 }; break;
        case 'rod_withdrawal_runaway': s._fail.rod_runaway = { active: false, rate: 0 }; break;
        case 'channel_rupture':    s._fail.channel_rupture = { active: false, size: 0 }; break;
        case 'trip_turbine':       s.turbine_tripped = false; break; // re-latches on set_turbine_load
        case 'vacuum_decay':       s.condenser_cooling_available = true; break;
      }
    }
  };

  // ================================================================ initial state (§15)
  RBMKEngine.prototype.reset = function (cmd) {
    var name = (cmd && cmd.initial_state) || 'full_power';
    if (cmd && cmd.design_version && cmd.design_version !== this.version) {
      this.version = cmd.design_version === 'post_chernobyl' ? 'post_chernobyl' : 'pre_chernobyl';
      this.cfg = CFG.forVersion(this.version);
      this.instruments.cfg = this.cfg; this.instruments.specs = this.cfg.instruments;
      this.instruments.defaults = this.cfg.physics_failures;
    }
    this.rod_groups = Rods.makeGroups(this.cfg);
    this.active_failures = [];
    this._computeRefs();
    this.s = this._buildState(name);
    // Pin the void reference at this state's operating void (see rhoVoid).
    this.void_ref = this.s.void_fraction_avg;
    this._trimToCritical();
    // Subcritical startup states: trim to critical at orm_target, THEN insert the
    // control group a fixed margin so it starts subcritical (no boron — the margin
    // is rod position). The operator withdraws the margin to reach criticality.
    var init = this.cfg.initial_states[name];
    if (init && init.subcritical && init.subcrit_margin_steps) {
      var cg = this._controlGroup();
      cg.steps = clip(cg.steps + init.subcrit_margin_steps, 0, cg.max_steps);
      this._updateRodDerived(cg);
      this.s.orm_equiv_rods = Rods.getOrm(this.rod_groups, this.cfg);
      this.s.orm_alarm_active = this.s.orm_equiv_rods < this.cfg.reactivity.orm_min;
      this.s._rho = this._totalReactivity();
      // Settle the kinetics on the SOURCE equilibrium for this margin
      // (P = S·Λ/(−ρ), precursors to match): the state holds its own level —
      // no reset free-fall, and every rod step shows as 1/M multiplication.
      // Decay heat is preloaded as a recent-shutdown residual (it, not fission,
      // carries the hot-standby heat), same treatment as the PWR's hot standby.
      var d0 = this.cfg.kinetics.delayed, S0 = this.cfg.kinetics.source || 0;
      if (S0 > 0 && this.s._rho < 0) {
        var Peq = S0 * d0.Lambda / (-this.s._rho);
        this.s._P = Peq; this.s.power_pct = Peq * 100; this.s._prev_power_pct = Peq * 100;
        for (var ci = 0; ci < 6; ci++) this.s._C[ci] = (d0.beta_i[ci] / d0.lambda_i[ci]) * Peq / d0.Lambda;
        var dh0 = this.cfg.kinetics.decay;
        this.s._H1 = dh0.H1_0 * 0.07; this.s._H2 = dh0.H2_0 * 0.07;
        this.s.decay_heat_pct = (this.s._H1 + this.s._H2) * 100;
      }
    }
    this.instruments.reset(this.getTrueState(), this._instrExtras());
  };

  // Doppler / graphite references pinned at the full-power operating temps
  // (deterministic from config), so both feedbacks net to zero at full power and
  // are purely perturbative on a transient (M1 D2 / Flag F1 pattern).
  RBMKEngine.prototype._computeRefs = function () {
    var t = this.cfg.thermal, Tcool = TH.T_sat(t.drum_p_rated);
    this.Tf_ref = Tcool + 1.0 * t.heat_gen_coeff_rbmk / t.h_fc_rbmk;
    this.Tg_ref = Tcool + 1.0 * t.graphite_heat_frac / t.h_graphite_coolant;
  };

  RBMKEngine.prototype._buildState = function (name) {
    var cfg = this.cfg, t = cfg.thermal, x = cfg.kinetics.xenon, d = cfg.kinetics.delayed;
    var init = cfg.initial_states[name] || cfg.initial_states.full_power;
    var P0 = init.power;
    var Tcool = TH.T_sat(t.drum_p_rated);
    var X_eq = K.computeXeq(cfg);

    // Position the control group for the target ORM (ORM = ins_frac · 211).
    var cg = this._controlGroup();
    cg.steps = Math.round(init.orm_target * cfg.rods.max_steps / cfg.rods.total_rod_count);
    cg.steps = clip(cg.steps, 0, cg.max_steps);
    this._updateRodDerived(cg);

    // Position the Automatic Regulator (AR) per state (0 = withdrawn when the
    // state omits it — startup / accident states). The AR is excluded from ORM
    // and its initial reactivity is absorbed by the per-state critical trim.
    for (var gi = 0; gi < this.rod_groups.length; gi++) {
      var ag = this.rod_groups[gi];
      if (ag.function !== 'auto') continue;
      ag.steps = clip(Math.round((init.ar_inserted_frac || 0) * ag.max_steps), 0, ag.max_steps);
      this._updateRodDerived(ag);
    }

    var C = [];
    for (var i = 0; i < 6; i++) C[i] = (d.beta_i[i] / d.lambda_i[i]) * P0 / d.Lambda;

    var void0 = clip(P0 / (init.flow_pct / 100.0) * t.void_scale_rbmk, 0, t.void_max);

    var s = {
      sim_time: 0,
      _P: P0, power_pct: P0 * 100, _rho: 0,
      _prev_power_pct: P0 * 100, _power_rate: 0,
      _C: C, _X_eq: X_eq,
      _I: x.gamma_I * P0 / x.lambda_I,
      _X: init.xenon_factor * X_eq,
      xenon_pct_eq: init.xenon_factor * 100,
      // Decay heat pre-loaded to the equilibrium fraction for this power.
      _H1: cfg.kinetics.decay.H1_0 * P0, _H2: cfg.kinetics.decay.H2_0 * P0,
      decay_heat_pct: (cfg.kinetics.decay.H1_0 + cfg.kinetics.decay.H2_0) * P0 * 100,

      fuel_temp_c: Tcool + P0 * t.heat_gen_coeff_rbmk / t.h_fc_rbmk,
      graphite_temp_avg_c: Tcool + P0 * t.graphite_heat_frac / t.h_graphite_coolant,
      void_fraction_avg: void0,
      steam_pressure_mpa: t.drum_p_rated, drum_level_pct: t.drum_level_nominal,
      channel_flow_pct: init.flow_pct, mcp_speed_pct: init.flow_pct, mcp_running: true,
      steam_to_turbine: P0, feedwater_normalized: P0, feedwater_blocked: false,
      _h_fc_eff: t.h_fc_rbmk, _h_fc_dryout_factor: null, _Q_total: P0,
      relief_open: false, _relief_flow: 0,   // drum relief: commanded state + flow hydraulics

      // Balance-of-plant (turbine / condenser / generator). Turbine load starts
      // matched to power; the generator is grid-synced at rated speed producing
      // P0·rated MWe; condenser vacuum at rated; steam dump auto (override null).
      steam_dump_frac: 0, steam_dump_override: null,
      turbine_rpm: cfg.turbine.rpm_rated, turbine_tripped: false,
      condenser_vacuum_kpa: cfg.turbine.vacuum_rated, condenser_cooling_available: true,
      mwe_output: P0 * cfg.turbine.mwe_rated,
      load_mode: 'follow', load_target_mwe: P0 * cfg.turbine.mwe_rated,
      load_follow_tau: RD.LoadMode.DEFAULT_TAU, feed_auto_coupled: true,
      load_imbalance_mwe: 0, sg_imbalance_active: false,

      orm_equiv_rods: 0, orm_alarm_active: false,
      eps_bypassed: false, eccs_active: false, scrammed: false, scram_blocked: false, _scram_complete: false,
      melted: false, destruction_cause: 'none', steam_explosion_occurred: false,
      energy_deposition_rate: P0 * cfg.destruction.energy_deposition_scale,

      _fail: {
        stuck_rod: { active: false, frac: 0, z_stuck: 0 },
        rod_runaway: { active: false, rate: 0 },
        channel_rupture: { active: false, size: 0 },
      },
    };
    s.orm_equiv_rods = Rods.getOrm(this.rod_groups, cfg);
    s.orm_alarm_active = s.orm_equiv_rods < cfg.reactivity.orm_min;
    return s;
  };

  // Trim the core excess reactivity so the initial operating point is exactly
  // critical (ρ_total = 0). The RBMK has no boron; rho_excess is the trimmed term
  // (M1 D2 / Flag F1 — reused here; resolves F1). Per-version because the rod and
  // void terms differ by design.
  RBMKEngine.prototype._trimToCritical = function () {
    this.rho_excess = 0;
    var partial = this._totalReactivity();   // sum of all terms with rho_excess = 0
    this.rho_excess = -partial;
    this.s._rho = 0;
  };

  // ================================================================== save/restore (§18)
  RBMKEngine.prototype.saveState = function () {
    return {
      schema: 'rbmk-1.0',
      version: this.version,
      s: JSON.parse(JSON.stringify(this.s)),
      rod_groups: JSON.parse(JSON.stringify(this.rod_groups)),
      active_failures: this.active_failures.slice(),
      instruments: this.instruments.save(),
      refs: { Tf: this.Tf_ref, Tg: this.Tg_ref, rho_excess: this.rho_excess, void_ref: this.void_ref },
    };
  };
  RBMKEngine.prototype.loadState = function (st) {
    if (st.version && st.version !== this.version) {
      this.version = st.version; this.cfg = CFG.forVersion(this.version);
      this.instruments.cfg = this.cfg; this.instruments.specs = this.cfg.instruments;
      this.instruments.defaults = this.cfg.physics_failures;
    }
    this.s = JSON.parse(JSON.stringify(st.s));
    this.rod_groups = JSON.parse(JSON.stringify(st.rod_groups));
    this.active_failures = st.active_failures.slice();
    this.instruments.load(st.instruments);
    this.Tf_ref = st.refs.Tf; this.Tg_ref = st.refs.Tg; this.rho_excess = st.refs.rho_excess;
    this.void_ref = st.refs.void_ref;
  };

  RD.RBMKEngine = RBMKEngine;

  // ========================================================================
  // §19 — RBMK Scenario Test Suite (the acceptance gate). Calls the engine
  // directly, bypassing every layer above. Run for BOTH versions. Each test
  // returns { name, pass, checks:[{desc, observed, expected, pass}] }.
  // ========================================================================
  function near(a, b, tol) { return Math.abs(a - b) <= tol; }

  function Harness(version, initial, seed) {
    this.eng = new RBMKEngine({ design_version: version, initial_state: initial || 'full_power', seed: seed });
    this.dt = 0.02;
    // Emulate M4's mechanical-protection actuations (drum relief valve + turbine
    // trips moved in-stack, 2026-07 ruling) so the engine-only physics tests
    // keep the assembled plant's protections. Reads INSTRUMENTS, like M4.
    this.autoM4 = true;
    this._m4Acc = 0;
  }
  Harness.prototype._stepM4 = function (dt) {
    this._m4Acc += dt;
    if (this._m4Acc < 0.1) return;          // M4-ish evaluation cadence
    this._m4Acc = 0;
    var eng = this.eng, cfg = eng.cfg, ins = eng.getInstruments(), s = eng.s;
    var th = cfg.thermal, tb = cfg.turbine;
    if (!s.relief_open && ins.steam_pressure > th.drum_relief_mpa) eng.applyCommand({ action: 'open_relief_valve' });
    else if (s.relief_open && ins.steam_pressure < th.drum_relief_reseat_mpa) eng.applyCommand({ action: 'close_relief_valve' });
    if (!s.turbine_tripped && (ins.condenser_vacuum < tb.vacuum_trip_kpa || ins.turbine_rpm > tb.rpm_overspeed_trip)) {
      eng.applyCommand({ action: 'trip_turbine' });
    }
  };
  Harness.prototype.run = function (seconds) {
    var n = Math.round(seconds / this.dt);
    for (var i = 0; i < n; i++) {
      if (this.autoM4) this._stepM4(this.dt);
      this.eng.step(this.dt);
    }
    return this;
  };
  // Run while tracking peak power; returns { peak, melted_at }.
  Harness.prototype.runTrack = function (seconds) {
    var n = Math.round(seconds / this.dt), peak = 0, melted_at = -1, t = 0;
    for (var i = 0; i < n; i++) {
      if (this.autoM4) this._stepM4(this.dt);
      this.eng.step(this.dt); t += this.dt;
      var p = this.eng.s.power_pct; if (p > peak) peak = p;
      if (melted_at < 0 && this.eng.s.melted) melted_at = t;
    }
    return { peak: peak, melted_at: melted_at };
  };
  Harness.prototype.runUntil = function (pred, maxSeconds) {
    var n = Math.round(maxSeconds / this.dt), t = 0;
    for (var i = 0; i < n; i++) {
      if (this.autoM4) this._stepM4(this.dt);
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

  // Minimal RPS emulator for the physics tests (the real RPS is M4): reads
  // instruments against the version trip table; honours eps_bypassed.
  function rpsWouldTrip(eng) {
    var ins = eng.getInstruments(), reasons = [];
    if (eng.s.eps_bypassed) return reasons;
    var trips = eng.getProtectionConfig().trips;
    for (var i = 0; i < trips.length; i++) {
      var tr = trips[i], v = ins[tr.instrument];
      if (v == null) continue;
      if (tr.direction === 'high' && v >= tr.setpoint) reasons.push(tr.instrument + ' high');
      if (tr.direction === 'low' && v <= tr.setpoint) reasons.push(tr.instrument + ' low');
    }
    return reasons;
  }

  function steadyTest(version) {
    return test('Steady operation — full_power (' + version + ')', function (ck) {
      var h = new Harness(version, 'full_power');
      var p0 = h.ts().power_pct;
      h.run(300);
      var t = h.ts();
      ck('power holds ~100%', t.power_pct.toFixed(2), near(t.power_pct, 100, 2.0), '100 ±2');
      ck('steam pressure holds ~7.0 MPa', t.steam_pressure_mpa.toFixed(3), near(t.steam_pressure_mpa, 7.0, 0.2), '7.0 ±0.2');
      ck('void stable ~0.35', t.void_fraction_avg.toFixed(3), near(t.void_fraction_avg, 0.35, 0.05), '0.35 ±0.05');
      ck('drum level stable', t.drum_level_pct.toFixed(1), near(t.drum_level_pct, 50, 5), '50 ±5');
      ck('not scrammed / not melted', t.scrammed + '/' + t.melted, !t.scrammed && !t.melted, 'false/false');
      ck('reactivity ≈ critical', h.eng.s._rho.toExponential(2), Math.abs(h.eng.s._rho) < 5e-4, '|ρ|<5e-4');
      ck('no power drift vs start', (t.power_pct - p0).toFixed(2), near(t.power_pct, p0, 2.0), '≈ start');
    });
  }

  function controlResponseTest(version) {
    return test('Control / void response (' + version + ')', function (ck) {
      var h = new Harness(version, 'full_power');
      h.run(20);
      var p_before = h.ts().power_pct;
      h.cmd({ action: 'set_channel_flow', pct: 80 });   // reduce flow → void up → power up
      h.run(60);
      var p_lowflow = h.ts().power_pct;
      ck('reducing flow raises power', p_lowflow.toFixed(2), p_lowflow > p_before + 0.3, '> ' + p_before.toFixed(2));
      ck('no runaway at normal conditions', p_lowflow.toFixed(1), p_lowflow < 130 && !h.ts().melted, 'bounded');
      h.cmd({ action: 'set_channel_flow', pct: 110 });  // raise flow → void down → power down
      h.run(60);
      var p_hiflow = h.ts().power_pct;
      ck('raising flow lowers power', p_hiflow.toFixed(2), p_hiflow < p_lowflow - 0.3, '< ' + p_lowflow.toFixed(2));
      // Rod motion changes power correctly (withdraw control → power up).
      var p_r0 = h.ts().power_pct;
      h.cmd({ action: 'rod_nudge', group_id: 'control_rods', steps: 6 }); // +6 = withdraw
      h.run(40);
      ck('rod withdraw raises power', h.ts().power_pct.toFixed(2), h.ts().power_pct > p_r0 + 0.2, '> ' + p_r0.toFixed(2));
    });
  }

  function shutdownTest(version) {
    return test('Shutdown (non-accident) (' + version + ')', function (ck) {
      var h = new Harness(version, 'full_power');
      h.run(10);
      var p0 = h.ts().power_pct;
      h.cmd({ action: 'manual_scram' });
      h.run(0.5);
      ck('power falling, not instant', h.ts().power_pct.toFixed(1), h.ts().power_pct < p0 && h.ts().power_pct > 2, '2..' + p0.toFixed(0));
      h.run(40);
      var t = h.ts();
      ck('fission collapsed', t.power_pct.toFixed(2), t.power_pct < 8, '< 8%');
      ck('not destroyed (safe shutdown)', t.melted, t.melted === false, false);
      ck('decay heat persists', t.decay_heat_pct.toFixed(2), t.decay_heat_pct > 3 && t.decay_heat_pct < 9, '3..9%');
      ck('control rods inserted', h.eng._controlGroup().steps.toString(), h.eng._controlGroup().steps > 200, '> 200 (of 228)');
    });
  }

  function ormTest(version) {
    return test('ORM — compute / alarm / coupling (' + version + ')', function (ck) {
      var orm_min = version === 'post_chernobyl' ? 43 : 15;
      var hf = new Harness(version, 'full_power');
      ck('full_power ORM ≈ rated', hf.ts().orm_equiv_rods.toFixed(1), near(hf.ts().orm_equiv_rods, 70, 5), '≈70');
      ck('full_power ORM not in alarm', String(hf.ts().orm_alarm_active), hf.ts().orm_alarm_active === false, 'false');
      ck('orm_display tracks true ORM', hf.ins().orm_display.toFixed(1), near(hf.ins().orm_display, hf.ts().orm_equiv_rods, 0.5), 'matches');

      var hl = new Harness(version, 'low_power_xenon');
      ck('low_power ORM ≈ 7.5 (below min)', hl.ts().orm_equiv_rods.toFixed(1),
        hl.ts().orm_equiv_rods < orm_min && near(hl.ts().orm_equiv_rods, 7.5, 2.5), '≈7.5, < ' + orm_min);
      ck('low_power ORM alarm active', String(hl.ts().orm_alarm_active), hl.ts().orm_alarm_active === true, 'true');

      // Coupling: low ORM amplifies the void feedback (§5.3) vs rated ORM.
      var cfg = hl.eng.cfg;
      var f_low = K.ormStabilityFactor(7.5, cfg);
      var f_rated = K.ormStabilityFactor(cfg.reactivity.orm_rated, cfg);
      ck('low ORM amplifies void feedback', f_low.toFixed(2) + ' vs ' + f_rated.toFixed(2), f_low > f_rated * 1.5, 'low ≫ rated');
    });
  }

  function rodBehaviorTest(version) {
    return test('Version-correct rod behavior (' + version + ')', function (ck) {
      var eng = new RBMKEngine({ design_version: version, initial_state: 'full_power' });
      var cfg = eng.cfg, perRod = Rods.perRodFor(version, cfg);
      // Trace per-rod reactivity vs insertion from fully withdrawn.
      var samples = [];
      for (var f = 0; f <= 1.0001; f += 0.05) {
        var z = f * cfg.reactivity.rod_full_depth_m;
        samples.push(perRod(z, cfg));
      }
      var maxEarly = Math.max.apply(null, samples.slice(0, 4)); // first ~15% insertion
      var deep = samples[samples.length - 1];
      if (version === 'pre_chernobyl') {
        ck('pre: initial POSITIVE region', maxEarly.toExponential(2), maxEarly > 0, '> 0 (displacer)');
        ck('pre: strongly negative when deep', deep.toExponential(2), deep < 0, '< 0 (absorber)');
      } else {
        ck('post: negative from the start', maxEarly.toExponential(2), maxEarly <= 0, '≤ 0');
        ck('post: monotonic negative deep', deep.toExponential(2), deep < maxEarly, 'deeper = more negative');
      }
    });
  }

  // Flagship — Chernobyl, both versions (the comparison). The most important test.
  function flagshipPre() {
    return test('Flagship — Chernobyl pre_chernobyl (excursion + steam explosion)', function (ck) {
      var h = new Harness('pre_chernobyl', 'low_power_xenon');
      h.cmd({ action: 'set_eps_bypass', active: true });
      h.run(2);
      var p_pre = h.ts().power_pct;
      h.cmd({ action: 'manual_scram' });   // AZ-5 from the accident preconditions
      var r = h.runTrack(20);
      var t = h.ts();
      ck('power excurses above pre-shutdown level', r.peak.toFixed(1) + '% (was ' + p_pre.toFixed(2) + '%)', r.peak > p_pre * 3, '≫ ' + p_pre.toFixed(2));
      ck('core destroyed', String(t.melted), t.melted === true, true);
      ck('destruction by steam explosion', t.destruction_cause, t.destruction_cause === 'steam_explosion', 'steam_explosion');
      ck('steam_explosion_occurred flag set', String(t.steam_explosion_occurred), t.steam_explosion_occurred === true, true);
    });
  }
  function flagshipPost() {
    return test('Flagship — Chernobyl post_chernobyl (safe shutdown)', function (ck) {
      var h = new Harness('post_chernobyl', 'low_power_xenon');
      h.cmd({ action: 'set_eps_bypass', active: true });
      h.run(2);
      var p_pre = h.ts().power_pct;
      h.cmd({ action: 'manual_scram' });
      var r = h.runTrack(20);
      var t = h.ts();
      ck('power falls (no excursion)', t.power_pct.toFixed(2) + '% (peak ' + r.peak.toFixed(1) + ')', t.power_pct < p_pre, '< ' + p_pre.toFixed(2));
      // Bound the PEAK too — final-power-only would pass a transient spike to
      // hundreds of percent that then decayed (the pre-1986 signature).
      ck('no transient excursion (peak bounded)', r.peak.toFixed(1) + '% vs pre ' + p_pre.toFixed(2) + '%',
        r.peak < p_pre * 2 + 1, '< 2× pre-scram + 1');
      ck('not destroyed', String(t.melted), t.melted === false, false);
      ck('no steam explosion', String(t.steam_explosion_occurred), t.steam_explosion_occurred === false, false);
    });
  }
  function flagshipComparison() {
    return test('Flagship — pre/post comparison (identical conditions, opposite outcomes)', function (ck) {
      var pre = new Harness('pre_chernobyl', 'low_power_xenon');
      pre.cmd({ action: 'set_eps_bypass', active: true }); pre.run(2);
      pre.cmd({ action: 'manual_scram' }); pre.runTrack(20);
      var post = new Harness('post_chernobyl', 'low_power_xenon');
      post.cmd({ action: 'set_eps_bypass', active: true }); post.run(2);
      post.cmd({ action: 'manual_scram' }); post.runTrack(20);
      ck('pre destroyed', String(pre.ts().melted), pre.ts().melted === true, true);
      ck('post safe', String(post.ts().melted), post.ts().melted === false, false);
      ck('divergent outcomes from the same scenario',
        'pre=' + pre.ts().destruction_cause + ', post=' + post.ts().destruction_cause,
        pre.ts().melted && !post.ts().melted, 'pre melt / post safe');
    });
  }

  function failuresTest(version) {
    return test('Physics-level failure behavior (' + version + ')', function (ck) {
      // mcp_trip: pumps coast, flow falls, void rises.
      var mt = new Harness(version, 'full_power'); mt.run(10);
      var flow0 = mt.ts().channel_flow_pct, void0 = mt.ts().void_fraction_avg;
      mt.cmd({ action: 'inject_failure', failure_id: 'mcp_trip' });
      mt.run(20);
      ck('mcp_trip: flow falls', mt.ts().channel_flow_pct.toFixed(1), mt.ts().channel_flow_pct < flow0 - 10, '< ' + flow0.toFixed(0));
      ck('mcp_trip: void rises', mt.ts().void_fraction_avg.toFixed(3), mt.ts().void_fraction_avg > void0, '> ' + void0.toFixed(3));

      // channel_dryout: heat transfer collapses, fuel temp rises.
      var dy = new Harness(version, 'full_power'); dy.run(10);
      var ft0 = dy.ts().fuel_temp_c;
      dy.cmd({ action: 'inject_failure', failure_id: 'channel_dryout', severity: 0.8 });
      dy.run(30);
      ck('channel_dryout: fuel temp rises', dy.ts().fuel_temp_c.toFixed(0), dy.ts().fuel_temp_c > ft0 + 20, '> ' + ft0.toFixed(0));

      // eps_bypass disables auto trips — WITH a positive control. The old check
      // ran at steady full power where nothing was past any setpoint, so
      // `length === 0` held with or without the bypass (tested nothing). Stick
      // the power_range meter past both versions' trip setpoints instead.
      var eb = new Harness(version, 'full_power'); eb.run(5);
      eb.cmd({ action: 'set_instrument_failure', instrument_id: 'power_range', mode: 'stuck', value: 130 });
      eb.run(1);
      ck('positive control: past-setpoint state WOULD trip un-bypassed', rpsWouldTrip(eb.eng).join(',') || 'none',
        rpsWouldTrip(eb.eng).indexOf('power_range high') !== -1, 'power_range high');
      eb.cmd({ action: 'inject_failure', failure_id: 'eps_bypass' });
      ck('eps_bypass silences the SAME past-setpoint state', String(eb.ts().eps_bypassed) + '/' + (rpsWouldTrip(eb.eng).join(',') || 'none'),
        eb.ts().eps_bypassed === true && rpsWouldTrip(eb.eng).length === 0, 'bypassed → no trip reasons');
      // The post-1986 additions have their own positive control: the 0.80 void
      // trip (absent pre-1986) reports on a stuck-high void instrument.
      if (version === 'post_chernobyl') {
        var vb = new Harness(version, 'full_power'); vb.run(5);
        vb.cmd({ action: 'set_instrument_failure', instrument_id: 'void_fraction', mode: 'stuck', value: 0.9 });
        vb.run(1);
        ck('post-1986 void trip fireable (0.80 setpoint)', rpsWouldTrip(vb.eng).join(',') || 'none',
          rpsWouldTrip(vb.eng).indexOf('void_fraction high') !== -1, 'void_fraction high');
      }

      // rod runaway: control position decreases (withdraws), ρ rises while ORM falls; scram reverses.
      var rr = new Harness(version, 'full_power'); rr.run(5);
      var ins0 = rr.eng._controlGroup().steps, orm0 = rr.ts().orm_equiv_rods;
      rr.cmd({ action: 'inject_failure', failure_id: 'continuous_rod_withdrawal', severity: 0.5 });
      rr.cmd({ action: 'rod_stop', group_id: 'control_rods' });
      rr.run(4);
      ck('rod runaway: insertion decreases (withdraws)', rr.eng._controlGroup().steps.toFixed(0) + ' < ' + ins0, rr.eng._controlGroup().steps < ins0, 'withdraws');
      ck('rod runaway: ORM falls', rr.ts().orm_equiv_rods.toFixed(1), rr.ts().orm_equiv_rods < orm0, '< ' + orm0.toFixed(1));
      rr.cmd({ action: 'manual_scram' }); rr.run(20);
      ck('scram reverses runaway (rods insert)', rr.eng._controlGroup().steps.toFixed(0), rr.eng._controlGroup().steps > 200, 'inserted');

      // channel rupture: void up, drum level + flow down.
      var cr = new Harness(version, 'full_power'); cr.run(5);
      var lvl0 = cr.ts().drum_level_pct, cflow0 = cr.ts().channel_flow_pct, cv0 = cr.ts().void_fraction_avg;
      cr.cmd({ action: 'inject_failure', failure_id: 'pressure_tube_rupture', severity: 0.5 });
      cr.run(6);
      ck('rupture: void rises', cr.ts().void_fraction_avg.toFixed(3), cr.ts().void_fraction_avg > cv0, '> ' + cv0.toFixed(3));
      ck('rupture: drum level falls', cr.ts().drum_level_pct.toFixed(1), cr.ts().drum_level_pct < lvl0, '< ' + lvl0.toFixed(1));
      ck('rupture: flow falls', cr.ts().channel_flow_pct.toFixed(1), cr.ts().channel_flow_pct < cflow0, '< ' + cflow0.toFixed(1));

      // ORM indicator failure: stick orm_display safe; drive true ORM low.
      var of = new Harness(version, 'full_power'); of.run(5);
      var held = of.ins().orm_display;
      of.cmd({ action: 'inject_failure', failure_id: 'orm_indicator_failure' });
      of.cmd({ action: 'rod_nudge', group_id: 'control_rods', steps: 40 }); // withdraw → true ORM drops
      of.run(10);
      ck('orm_display held while true ORM drops', of.ins().orm_display.toFixed(1) + ' (true ' + of.ts().orm_equiv_rods.toFixed(1) + ')',
        near(of.ins().orm_display, held, 0.5) && of.ts().orm_equiv_rods < held - 5, 'display frozen, true falls');

      // partial MCP trip: flow settles at a reduced level, not zero.
      var pm = new Harness(version, 'full_power'); pm.run(10);
      pm.cmd({ action: 'inject_failure', failure_id: 'partial_mcp_trip', severity: 0.5 });
      pm.run(30);
      ck('partial MCP: flow settles reduced, not zero', pm.ts().channel_flow_pct.toFixed(1), pm.ts().channel_flow_pct > 30 && pm.ts().channel_flow_pct < 90, '30..90%');
    });
  }

  function stuckRodTest() {
    return test('Stuck control rod on scram — pre worsens excursion, post merely reduced', function (ck) {
      // pre: a stalled fraction pinned at the displacer peak worsens the excursion
      // vs a clean scram from the accident preconditions.
      var clean = new Harness('pre_chernobyl', 'low_power_xenon');
      clean.cmd({ action: 'set_eps_bypass', active: true }); clean.run(2);
      clean.cmd({ action: 'manual_scram' }); var rc = clean.runTrack(20);
      var stuck = new Harness('pre_chernobyl', 'low_power_xenon');
      stuck.cmd({ action: 'set_eps_bypass', active: true }); stuck.run(2);
      stuck.cmd({ action: 'inject_failure', failure_id: 'stuck_rods_on_scram', severity: 1.0 });
      stuck.cmd({ action: 'manual_scram' }); var rs = stuck.runTrack(20);
      ck('pre: stuck-rod peak ≥ clean peak', rs.peak.toFixed(0) + ' vs ' + rc.peak.toFixed(0), rs.peak >= rc.peak, 'stuck ≥ clean');
      // The robust differentiator (both peaks saturate on MAX_PROMPT_GROWTH so
      // ≥ alone cannot distinguish "worsens" from "no effect"): the stuck-rod
      // core is destroyed SOONER than the clean scram.
      ck('pre: stuck rods melt SOONER than clean', rs.melted_at.toFixed(2) + 's vs ' + rc.melted_at.toFixed(2) + 's',
        rs.melted_at >= 0 && rc.melted_at >= 0 && rs.melted_at < rc.melted_at, 'stuck < clean');
      ck('pre: both destroyed', String(clean.ts().melted) + '/' + String(stuck.ts().melted), clean.ts().melted && stuck.ts().melted, 'true/true');

      // post: same stall is only reduced worth — reactor still shuts down safely.
      var post = new Harness('post_chernobyl', 'low_power_xenon');
      post.cmd({ action: 'set_eps_bypass', active: true }); post.run(2);
      post.cmd({ action: 'inject_failure', failure_id: 'stuck_rods_on_scram', severity: 1.0 });
      post.cmd({ action: 'manual_scram' }); post.runTrack(20);
      ck('post: still safe with stuck rods', String(post.ts().melted), post.ts().melted === false, false);
    });
  }

  function saveRestoreTest(version) {
    return test('Save and restore — exact fidelity (' + version + ')', function (ck) {
      // Mid-buildup with a failure active (channel rupture + a drift) — the way to
      // catch a missing _fail field, EMA state, or drift offset.
      var a = new Harness(version, 'full_power', 24680);
      a.run(8);
      a.cmd({ action: 'inject_failure', failure_id: 'pressure_tube_rupture', severity: 0.5 });
      a.cmd({ action: 'inject_failure', failure_id: 'stuck_rods_on_scram', severity: 0.6 });
      a.cmd({ action: 'set_instrument_failure', instrument_id: 'fuel_temp', mode: 'drift', value: 0.4 });
      a.run(5);
      var snap = a.eng.saveState();

      var b = new Harness(version, 'low_power_xenon', 999); // different state+seed; load overrides
      b.eng.loadState(snap);
      a.run(8); b.run(8);
      var ta = a.ts(), tb = b.ts(), ia = a.ins(), ib = b.ins();
      ck('power identical', tb.power_pct.toFixed(6), near(ta.power_pct, tb.power_pct, 1e-9), ta.power_pct.toFixed(6));
      ck('fuel temp identical', tb.fuel_temp_c.toFixed(6), near(ta.fuel_temp_c, tb.fuel_temp_c, 1e-9), ta.fuel_temp_c.toFixed(6));
      ck('void identical', tb.void_fraction_avg.toFixed(6), near(ta.void_fraction_avg, tb.void_fraction_avg, 1e-9), ta.void_fraction_avg.toFixed(6));
      ck('drum level identical (rupture state)', tb.drum_level_pct.toFixed(6), near(ta.drum_level_pct, tb.drum_level_pct, 1e-9), ta.drum_level_pct.toFixed(6));
      ck('energy-deposition EMA identical', tb.energy_deposition_rate.toFixed(9), near(ta.energy_deposition_rate, tb.energy_deposition_rate, 1e-9), ta.energy_deposition_rate.toFixed(9));
      ck('fuel_temp instrument identical (drift offset)', ib.fuel_temp.toFixed(6), near(ia.fuel_temp, ib.fuel_temp, 1e-9), ia.fuel_temp.toFixed(6));
      ck('noise sequence identical (PRNG)', ib.power_range.toFixed(6), near(ia.power_range, ib.power_range, 1e-9), ia.power_range.toFixed(6));
    });
  }

  // Balance-of-plant: turbine load control, electrical output, steam dump, and
  // the BOP failures — the full-scope-operation additions (parallel to the PWR).
  function bopTest(version) {
    return test('Balance of plant — turbine / electrical output (' + version + ')', function (ck) {
      // (A) Steady full power: rated electrical output, synced turbine, rated vacuum.
      var h = new Harness(version, 'full_power'); h.run(60);
      var t = h.ts();
      ck('full power ≈ rated MWe', t.mwe_output.toFixed(0), near(t.mwe_output, 1000, 30), '1000 ±30');
      ck('turbine synced ≈ 3000 rpm', t.turbine_rpm.toFixed(0), near(t.turbine_rpm, 3000, 20), '3000 ±20');
      ck('condenser vacuum ≈ rated', t.condenser_vacuum_kpa.toFixed(1), near(t.condenser_vacuum_kpa, 96.5, 2), '96.5 ±2');

      // (B) Turbine load reduction at constant reactor power → electrical output
      //     falls, and the steam dump absorbs the now-excess steam so drum pressure
      //     is held below the relief/trip (8.0) instead of over-pressurizing. (The
      //     drum-pressure gain is small, so this settles over minutes.)
      var lb = new Harness(version, 'full_power'); lb.run(10);
      lb.cmd({ action: 'set_turbine_load', mwe: 400 }); lb.run(120);
      ck('reducing load lowers MWe', lb.ts().mwe_output.toFixed(0), lb.ts().mwe_output < 600, '< 600');
      ck('steam dump opened to absorb excess', lb.eng.s.steam_dump_frac.toFixed(2), lb.eng.s.steam_dump_frac > 0.1, '> 0.1');
      ck('drum pressure held below relief (no trip)', lb.ts().steam_pressure_mpa.toFixed(2), lb.ts().steam_pressure_mpa < 8.0, '< 8.0');

      // (C) Turbine trip → electrical output collapses, turbine coasts down.
      var tt = new Harness(version, 'full_power'); tt.run(10);
      tt.cmd({ action: 'inject_failure', failure_id: 'turbine_trip' }); tt.run(30);
      ck('turbine trip → ~no MWe', tt.ts().mwe_output.toFixed(0), tt.ts().mwe_output < 50, '< 50');
      ck('turbine coasting down', tt.ts().turbine_rpm.toFixed(0), tt.ts().turbine_rpm < 2500, '< 2500');
      ck('drum pressure held below relief (dump)', tt.ts().steam_pressure_mpa.toFixed(2), tt.ts().steam_pressure_mpa < 8.0, '< 8.0');

      // (D) Partial-power operating state: stable at ~50%, ~half electrical output.
      var hp = new Harness(version, '50_percent'); hp.run(60);
      ck('50% state holds ~50% power', hp.ts().power_pct.toFixed(1), near(hp.ts().power_pct, 50, 4), '50 ±4');
      ck('50% state ≈ half MWe', hp.ts().mwe_output.toFixed(0), near(hp.ts().mwe_output, 500, 60), '500 ±60');
      ck('50% state stable (not scrammed/melted)', hp.ts().scrammed + '/' + hp.ts().melted, !hp.ts().scrammed && !hp.ts().melted, 'false/false');

      // (E) Loss of condenser vacuum → vacuum decays → turbine trips on low vacuum.
      var lv = new Harness(version, 'full_power'); lv.run(5);
      lv.cmd({ action: 'inject_failure', failure_id: 'loss_of_condenser_vacuum' }); lv.run(40);
      ck('vacuum decayed below trip', lv.ts().condenser_vacuum_kpa.toFixed(1), lv.ts().condenser_vacuum_kpa < 74.5, '< 74.5');
      ck('turbine tripped on low vacuum', String(lv.ts().turbine_tripped), lv.ts().turbine_tripped === true, 'true');
      ck('electrical output collapsed', lv.ts().mwe_output.toFixed(0), lv.ts().mwe_output < 50, '< 50');
    });
  }

  // Approach-to-criticality / startup from the subcritical hot_startup state.
  function startupTest(version) {
    return test('Startup — subcritical hold, then controlled ascension (' + version + ')', function (ck) {
      var h = new Harness(version, 'hot_startup');
      h.run(20);
      var a = h.ts();
      ck('starts subcritical (ρ < 0)', a.reactivity_pcm.toFixed(0) + ' pcm', a.reactivity_pcm < 0, '< 0');
      ck('near-zero power at hot standby', a.power_pct.toFixed(2) + '%', a.power_pct < 2, '< 2%');
      ck('not melted', String(a.melted), a.melted === false, 'false');
      // Withdraw the control group slowly toward/through criticality.
      var cg = h.eng._controlGroup();
      h.cmd({ action: 'rod_start', group_id: cg.id, direction: 1, speed: 'slow' });
      var pk = 0;
      for (var i = 0; i < 15000; i++) { h.eng.step(0.02); var pw = h.ts().power_pct; if (pw > pk) pk = pw; if (pw > 40) { h.cmd({ action: 'rod_stop', group_id: cg.id }); break; } }
      var b = h.ts();
      ck('rod withdrawal raises power (ascension)', b.power_pct.toFixed(1) + '%', pk > 5, 'rises > 5%');
      ck('positive startup rate during ascension', b.startup_rate_dpm.toFixed(1) + ' dpm', b.startup_rate_dpm > 0, '> 0');
      ck('controlled — no destruction on ascension', String(b.melted), b.melted === false, 'false');
    });
  }

  var RBMKScenarioTests = {
    near: near, Harness: Harness,
    steady_pre: function () { return steadyTest('pre_chernobyl'); },
    steady_post: function () { return steadyTest('post_chernobyl'); },
    control_pre: function () { return controlResponseTest('pre_chernobyl'); },
    control_post: function () { return controlResponseTest('post_chernobyl'); },
    shutdown_pre: function () { return shutdownTest('pre_chernobyl'); },
    shutdown_post: function () { return shutdownTest('post_chernobyl'); },
    orm_pre: function () { return ormTest('pre_chernobyl'); },
    orm_post: function () { return ormTest('post_chernobyl'); },
    rods_pre: function () { return rodBehaviorTest('pre_chernobyl'); },
    rods_post: function () { return rodBehaviorTest('post_chernobyl'); },
    flagship_pre: flagshipPre,
    flagship_post: flagshipPost,
    flagship_comparison: flagshipComparison,
    failures_pre: function () { return failuresTest('pre_chernobyl'); },
    failures_post: function () { return failuresTest('post_chernobyl'); },
    stuck_rod: stuckRodTest,
    bop_pre: function () { return bopTest('pre_chernobyl'); },
    bop_post: function () { return bopTest('post_chernobyl'); },
    startup_pre: function () { return startupTest('pre_chernobyl'); },
    startup_post: function () { return startupTest('post_chernobyl'); },
    eccs: function () {
      return test('ECCS — arrests a pressure-tube-rupture drain', function (ck) {
        var h = new Harness('pre_chernobyl', 'full_power'); h.run(5);
        var lvl0 = h.ts().drum_level_pct;
        h.cmd({ action: 'inject_failure', failure_id: 'pressure_tube_rupture', severity: 0.5 });
        h.run(8);
        var drained = h.ts().drum_level_pct;
        ck('rupture drains the steam drum', drained.toFixed(1) + '%', drained < lvl0, '< ' + lvl0.toFixed(1));
        h.cmd({ action: 'set_eccs', active: true });
        h.run(10);
        ck('ECCS recovers drum level', h.ts().drum_level_pct.toFixed(1) + '%', h.ts().drum_level_pct > drained, '> ' + drained.toFixed(1));
        ck('ECCS holds the cooling-flow floor', h.ts().channel_flow_pct.toFixed(1) + '%', h.ts().channel_flow_pct >= 44.5, '>= 45%');
        ck('ECCS active', String(h.ts().eccs_active), h.ts().eccs_active === true, 'true');
      });
    },
    save_restore_pre: function () { return saveRestoreTest('pre_chernobyl'); },
    save_restore_post: function () { return saveRestoreTest('post_chernobyl'); },
  };

  RBMKScenarioTests.runAll = function () {
    var order = ['steady_pre', 'steady_post', 'control_pre', 'control_post', 'shutdown_pre', 'shutdown_post',
      'orm_pre', 'orm_post', 'rods_pre', 'rods_post', 'flagship_pre', 'flagship_post', 'flagship_comparison',
      'failures_pre', 'failures_post', 'stuck_rod', 'bop_pre', 'bop_post', 'startup_pre', 'startup_post',
      'eccs', 'save_restore_pre', 'save_restore_post'];
    var results = [];
    for (var i = 0; i < order.length; i++) results.push(RBMKScenarioTests[order[i]]());
    return results;
  };

  RD.RBMKScenarioTests = RBMKScenarioTests;

})(globalThis.RD || (globalThis.RD = {}));
