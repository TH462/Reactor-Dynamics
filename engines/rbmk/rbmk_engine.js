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
      if (g.function === 'control' || g.function === 'manual') return g;
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
      if (g.function === 'control' || g.function === 'manual') {
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
    // 8. Steam-drum pressure and level.
    TH.stepDrumPressure(s, cfg, dt);
    if (s.feedwater_blocked) s.feedwater_normalized = 0;  // loss_of_feedwater persists
    TH.stepDrumLevel(s, cfg, dt);
    // 9. Channel flow — MCP / coastdown.
    TH.stepChannelFlow(s, cfg, dt);
    // 9b. Channel rupture (after void / drum-level / flow updates, §14.1).
    TH.applyChannelRupture(s, cfg, dt);
    // 10. ORM from rod positions.
    s.orm_equiv_rods = Rods.getOrm(this.rod_groups, cfg);
    s.orm_alarm_active = s.orm_equiv_rods < cfg.reactivity.orm_min;
    // 11. Energy-deposition rate; check destruction (both paths).
    K.stepEnergyDeposition(s, cfg, dt);
    K.checkDestruction(s, cfg);
    if (s.melted) s._scram_complete = true;

    // 12. Update instruments from the new true state (incl. computed orm_display).
    this.instruments.update(this.getTrueState(), dt, this._instrExtras());

    s.sim_time += dt;
  };

  RBMKEngine.prototype._instrExtras = function () {
    var s = this.s;
    return {
      orm_true: s.orm_equiv_rods,
      rps_scrammed: s.scrammed,
      eps_bypassed: s.eps_bypassed,
      orm_alarm_active: s.orm_alarm_active,
    };
  };

  // ============================================================ contract surface
  RBMKEngine.prototype.getTrueState = function () {
    var s = this.s;
    return {
      power_pct: s.power_pct, fuel_temp_c: s.fuel_temp_c, void_fraction_avg: s.void_fraction_avg,
      steam_pressure_mpa: s.steam_pressure_mpa, drum_level_pct: s.drum_level_pct, channel_flow_pct: s.channel_flow_pct,
      graphite_temp_avg_c: s.graphite_temp_avg_c, decay_heat_pct: s.decay_heat_pct, xenon_pct_eq: s.xenon_pct_eq,
      orm_equiv_rods: s.orm_equiv_rods, orm_alarm_active: s.orm_alarm_active, eps_bypassed: s.eps_bypassed,
      scrammed: s.scrammed, melted: s.melted, destruction_cause: s.destruction_cause,
      steam_explosion_occurred: s.steam_explosion_occurred, energy_deposition_rate: s.energy_deposition_rate,
      design_version: this.version,
      reactivity_pcm: (s._rho || 0) * 1e5,
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
      eps_bypassed: s.eps_bypassed,
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
      case 'set_feedwater_flow':
        if (!s.feedwater_blocked) s.feedwater_normalized = clip(cmd.pct / 100, 0, 1.5);
        break;
      case 'set_eps_bypass':
        s.eps_bypassed = !!cmd.active;
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

  RBMKEngine.prototype._scram = function () {
    this.s.scrammed = true;
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

    var C = [];
    for (var i = 0; i < 6; i++) C[i] = (d.beta_i[i] / d.lambda_i[i]) * P0 / d.Lambda;

    var void0 = clip(P0 / (init.flow_pct / 100.0) * t.void_scale_rbmk, 0, 0.90);

    var s = {
      sim_time: 0,
      _P: P0, power_pct: P0 * 100, _rho: 0,
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
      _h_fc_eff: t.h_fc_rbmk, _h_fc_dryout_factor: null, _Q_total: P0, _relief_flow: 0,

      orm_equiv_rods: 0, orm_alarm_active: false,
      eps_bypassed: false, scrammed: false, scram_blocked: false, _scram_complete: false,
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
  }
  Harness.prototype.run = function (seconds) {
    var n = Math.round(seconds / this.dt);
    for (var i = 0; i < n; i++) this.eng.step(this.dt);
    return this;
  };
  // Run while tracking peak power; returns { peak, melted_at }.
  Harness.prototype.runTrack = function (seconds) {
    var n = Math.round(seconds / this.dt), peak = 0, melted_at = -1, t = 0;
    for (var i = 0; i < n; i++) {
      this.eng.step(this.dt); t += this.dt;
      var p = this.eng.s.power_pct; if (p > peak) peak = p;
      if (melted_at < 0 && this.eng.s.melted) melted_at = t;
    }
    return { peak: peak, melted_at: melted_at };
  };
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
      ck('low_power ORM ≈ 7.5 (below min)', hl.ts().orm_equiv_rods.toFixed(1), hl.ts().orm_equiv_rods < orm_min, '< ' + orm_min);
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

      // eps_bypass disables auto trips (rpsWouldTrip returns nothing even past setpoint).
      var eb = new Harness(version, 'full_power'); eb.run(5);
      eb.cmd({ action: 'inject_failure', failure_id: 'eps_bypass' });
      ck('eps_bypass: auto trips disabled', String(eb.ts().eps_bypassed), eb.ts().eps_bypassed === true && rpsWouldTrip(eb.eng).length === 0, 'bypassed');

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
    save_restore_pre: function () { return saveRestoreTest('pre_chernobyl'); },
    save_restore_post: function () { return saveRestoreTest('post_chernobyl'); },
  };

  RBMKScenarioTests.runAll = function () {
    var order = ['steady_pre', 'steady_post', 'control_pre', 'control_post', 'shutdown_pre', 'shutdown_post',
      'orm_pre', 'orm_post', 'rods_pre', 'rods_post', 'flagship_pre', 'flagship_post', 'flagship_comparison',
      'failures_pre', 'failures_post', 'stuck_rod', 'save_restore_pre', 'save_restore_post'];
    var results = [];
    for (var i = 0; i < order.length; i++) results.push(RBMKScenarioTests[order[i]]());
    return results;
  };

  RD.RBMKScenarioTests = RBMKScenarioTests;

})(globalThis.RD || (globalThis.RD = {}));
