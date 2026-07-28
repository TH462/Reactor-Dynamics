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
  // Integral rod-worth S-curve. K (0..1) flattens the sinusoidal term toward a straight
  // line — lowering the mid-core differential-worth peak while preserving the endpoints
  // (scruve(0)=0, scruve(1)=1), i.e. the TOTAL worth is unchanged. K defaults to 1 (the
  // textbook S-curve) so external callers (RD.pwrScruve) are unaffected.
  function scruve(pos_norm, K) {
    if (K == null) K = 1;
    return pos_norm - K * Math.sin(2 * Math.PI * pos_norm) / (2 * Math.PI);
  }

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
        velocity: 0, step_accumulator: 0, nudge_target: null, coast_remaining_s: 0, worth: this.cfg.reactivity.rod_worth_total,
        insertion_limit_steps: null,   // power-dependent; recomputed every tick
        at_insertion_limit: false },
      { id: 'shutdown_rods', name: 'Shutdown Rods', function: 'shutdown',
        steps: r.max_steps, max_steps: r.max_steps, position_pct: 100,
        moving: false, direction: 0, speed: 'normal', scrammed: false,
        velocity: 0, step_accumulator: 0, nudge_target: null, coast_remaining_s: 0, worth: this.cfg.reactivity.rod_worth_shutdown,
        insertion_limit_steps: null, at_insertion_limit: false },
    ];
  };

  PWREngine.prototype._controlGroup = function () { return this.rod_groups[0]; };
  PWREngine.prototype._shutdownGroup = function () { return this.rod_groups[1]; };

  // ----------------------------------------------------------- reactivity (§4)
  PWREngine.prototype._rodReactivity = function () {
    var rho = 0;
    var K = this.cfg.reactivity.rod_worth_curve_flatten;   // undefined ⇒ default (textbook S-curve)
    for (var i = 0; i < this.rod_groups.length; i++) {
      var g = this.rod_groups[i];
      var withdrawn = g.steps / g.max_steps;
      rho += -g.worth * scruve(1.0 - withdrawn, K);
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
    // Reactivity follows the mixing-lagged core boron (see boron_mix_tau_s), so power tracks
    // the indicated level instead of leading it. Falls back to boron_ppm before the lag state
    // exists (first step / a migrated save).
    var rho_boron = -rc.boron_worth_per_ppm * (s.boron_reactive != null ? s.boron_reactive : s.boron_ppm);
    var X_eq = this._X_eq;
    var rho_xenon = -this.cfg.kinetics.xenon.xenon_worth * (s._X / X_eq);
    return rc.rho_excess + rho_rods + rho_doppler + rho_mtc + rho_boron + rho_xenon;
  };

  // ----------------------------------------------------- point kinetics (§3)
  PWREngine.prototype._stepKinetics = function (rho, dt) {
    var s = this.s, d = this.cfg.kinetics.delayed;
    var sumLC = 0;
    for (var i = 0; i < 6; i++) sumLC += d.lambda_i[i] * s._C[i];
    // The constant neutron source gives the subcritical core its 1/M behavior:
    // P_eq = S·Λ/(−ρ), so power visibly climbs as the operator approaches
    // criticality instead of sitting dark until it is too late (the teaching cue
    // real source-range instruments provide). Negligible at power.
    var dP = ((rho - d.beta) / d.Lambda) * s._P + sumLC + (this.cfg.kinetics.source || 0);
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
      // Coast-to-stop after an operator release (rod_stop): keep driving at the current
      // velocity for stop_coast_s, then latch. Skipped while scrammed (scram owns motion).
      if (!g.scrammed && g.coast_remaining_s > 0) {
        g.coast_remaining_s -= dt;
        if (g.coast_remaining_s <= 0) { g.coast_remaining_s = 0; g.velocity = 0; }
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

  // Power-dependent rod insertion limit (RIL), in steps, for the control group —
  // null when the limit does not apply (below min_power_pct, i.e. a startup, where
  // the bank is deliberately deep and boron plus the shutdown bank hold the margin).
  // See the [tune] block in pwr_config.js §rods for why this is a curve and not a
  // fixed floor (issue #202).
  PWREngine.prototype._insertionLimitSteps = function (g) {
    var r = this.cfg.rods;
    if (r.insertion_limit_min_power_pct == null) return null;
    var P = (this.s && isFinite(this.s.power_pct)) ? this.s.power_pct : 0;
    var P0 = r.insertion_limit_min_power_pct;
    if (P <= P0) return null;
    var f = (P - P0) / (100 - P0);
    if (f > 1) f = 1;
    var pct = r.insertion_limit_lo_pct + (r.insertion_limit_hi_pct - r.insertion_limit_lo_pct) * f;
    return Math.round(pct / 100 * g.max_steps);
  };

  PWREngine.prototype._updateRodDerived = function (g) {
    g.position_pct = g.steps / g.max_steps * 100;
    // Only the control group carries an insertion limit; the shutdown bank is
    // parked withdrawn and has none (its steps stay null).
    if (g.function === 'control') {
      g.insertion_limit_steps = this._insertionLimitSteps(g);
      g.at_insertion_limit = g.insertion_limit_steps != null && g.steps <= g.insertion_limit_steps;
    }
  };

  PWREngine.prototype._loadModeOpts = function () {
    var cfg = this.cfg;
    return {
      mweRated: cfg.turbine.mwe_rated,
      // Cap the coupled feed demand at rated (issue #130). The governor below clamps
      // steam to 1.0, so anything above that is feed the plant can never boil off —
      // a permanent imbalance that walks SG level into the high-level scram. The
      // pump's own 0..120 % runout clamp in setFeed is separate and stays.
      maxCoupledFeedFrac: 1.0,
      // Follow mode draws the reactor's THERMAL output, not its flux (#229): with
      // decay heat a separate lagging source, a runback leaves a ~2-5 % residual
      // above fission power for tens of minutes, and a pressure-mode follow
      // governor takes that steam like any other. Q ≡ P at steady state, so
      // nothing moves outside transients.
      extractFrac: function (s) { return s._Q_total != null ? s._Q_total : (s._P || 0); },
      setLoad: function (s, mwe, rated) {
        s.steam_demand_mwe = mwe;
        s.turbine_demand_frac = clip(mwe / rated, 0, 1.2);
        s.generator_load = s.turbine_demand_frac;
      },
      setFeed: function (s, frac) {
        // Coupling drives the FEED PUMP's commanded speed; the pump's inertia
        // (stepSecondary) carries it into delivered flow.
        if (s.main_feedwater_available) s.feed_pump_speed_pct = clip(frac * 100, 0, 120);
      },
      tripFn: SG.tripTurbine,
    };
  };

  PWREngine.prototype._stepLoadMode = function (dt) {
    RD.LoadMode.step(this.s, dt, this._loadModeOpts());
  };

  // ====================================================== the per-step compute
  PWREngine.prototype.step = function (dt_effective) {
    var s = this.s;
    var dt = dt_effective != null ? dt_effective : this.dt_nominal;

    // Stash the PREVIOUS step's instrument readings the in-plant regulators
    // sense from (HR1): the AFW level-hold valve senses SG level through its
    // level instrument, and the SG-imbalance annunciator reads indicated power.
    // Explicit coupling — one step of lag, same as every other feedback.
    var insPrev = this.instruments && this.instruments.reading;
    s._ins_sg_level = insPrev && insPrev.sg_level != null ? insPrev.sg_level : null;
    s._ins_power_pct = insPrev && insPrev.power_range != null ? insPrev.power_range : null;
    // The CVCS auto make-up senses pressurizer level through its LEVEL INSTRUMENT (HR1) —
    // a lagged/stuck/failed pzr-level sensor fools the charging control exactly as it fools
    // the operator (a false-high level makes it back off charging → real inventory loss).
    s._ins_pzr_level = insPrev && insPrev.pzr_level != null ? insPrev.pzr_level : null;
    // The CVCS level PROGRAM reads indicated Tavg (HR1) — its setpoint card tracks the
    // same thermal-expansion line the derived level rides (pwr_primary/pwr_pressurizer).
    s._ins_tavg = insPrev && insPrev.tavg != null ? insPrev.tavg : null;
    // The steam dump's Tavg reference is PROGRAMMED ON TURBINE LOAD (#219), and it reads
    // that load through the steam-flow instrument — the same instrument the rod channel's
    // Tref program reads (pwr_control.js trefFromLoad). HR1: an automatic control senses
    // through indications, so a failed steam-flow instrument mis-programs the dump exactly
    // as it mis-programs the rods. NOT a new instrument — just a stash of an existing
    // reading, so it adds no draw to the instrument PRNG stream (see pwr_config.js).
    s._ins_steam_flow = insPrev && insPrev.steam_flow != null ? insPrev.steam_flow : null;
    // Full-power equilibrium Tavg — the anchor of the level base line. Lazy so
    // loaded saves (which lack the stash) recompute it once.
    if (s._tavg_fp == null) s._tavg_fp = this._computeEquilibriumTemps(1.0).Tavg;

    // 0. Rod motion (incl. runaway) before reactivity reads positions.
    this._stepRods(dt);
    // 1. Total reactivity from current (previous-step) state — explicit coupling.
    var rho = this._totalReactivity();
    s._rho = rho;
    // 2. Point kinetics → new power.
    this._stepKinetics(rho, dt);
    // 3. Xenon / iodine.
    this._stepXenon(dt);
    // 4. Heat generation (#229/#132). Total thermal = PROMPT fission power + decay
    //    heat, unconditionally: _P is scaled by (1 − f0), f0 = H1_0 + H2_0, and the
    //    tracked decay inventory is always added. At every steady state this is
    //    exactly _P (P·(1−f0) + f0·P), so all calibrations are unchanged; with
    //    fission collapsed (scram, or an unscrammed uncovery/void-out — the MD-5
    //    ATWS-during-LOCA case) it reduces to the decay tail, same as before. What
    //    changes is the TRANSIENT: through a fast un-scrammed runback the decay
    //    inventory lags on its τ≈33 min tail, so the ~5 % residual above the new
    //    equilibrium is now counted instead of vanishing the instant the rods move —
    //    the previous form treated decay as "embedded in P" at power, which is only
    //    true in steady state, and its P-vs-decay switch also stepped Q_total
    //    discontinuously when P crossed the decay floor. Both artifacts gone.
    this._stepDecay(dt);
    var _dc0 = this.cfg.kinetics.decay;
    s._Q_total = s._P * (1 - (_dc0.H1_0 + _dc0.H2_0)) + (s._H1 + s._H2);
    // Emergency injection multiplier already on state; HPI flow computed in §9.
    // 5–6. Fuel and coolant temperatures (legs, true subcooling).
    TH.stepFuel(s, this.cfg, dt);
    TH.stepCoolant(s, this.cfg, dt);
    // 7. Primary pressure (pressurizer).
    PZ.stepPressure(s, this.cfg, dt);
    // 7b. Loop pressure distribution — quasi-static node pressures (cold leg / hot
    //     leg / pump suction) from pressure_mpa and the PREVIOUS step's flow_frac
    //     (explicit coupling). Computed BEFORE stepInventory so injection/accumulators
    //     read the cold-leg node this step.
    PR.computeNodePressures(s, this.cfg);
    // 7c. RCP cavitation from the suction-node subcooling — before stepFlow (10)
    //     applies its flow degradation. Uses this step's p_pumpsuction and tcold.
    PR.stepCavitation(s, this.cfg);
    // 9. Primary inventory and voiding (HPI/leak/relief) — before the pzr level
    //    surge so void_surge reflects this step's voiding.
    PR.stepInventory(s, this.cfg, dt);
    // 9b. RHR hot-leg suction valve interlock + ECCS mode indication. The valve
    //     AUTO-CLOSES if pressure has climbed back above the 400 psi interlock
    //     (e.g. a repressurization while aligned); rhr_active mirrors the valve.
    //     eccs_mode drives the single ECCS card: RHR when the valve is open, else
    //     HPI/LPI by pressure regime (LPI = the low-head/high-flow regime below the
    //     LPI pump shutoff head, the state a LOCA depressurizes into).
    if (s.rhr_valve_open && s.pressure_mpa > this.cfg.emergency.rhr_valve_interlock_mpa) {
      s.rhr_valve_open = false;
    }
    s.rhr_active = !!s.rhr_valve_open;
    s.eccs_mode = s.rhr_valve_open ? 'RHR'
      : (s.hpi_active ? (s.pressure_mpa < this.cfg.emergency.lpi_pressure_ref ? 'LPI' : 'HPI') : 'off');
    // 8. Pressurizer level (the TMI deception) and SG level (in §11).
    PZ.stepLevel(s, this.cfg, dt);
    // 8b. PORV tailpipe / quench-tank line temperature (relief-flow tell).
    PZ.stepTailpipe(s, this.cfg, dt);
    // 10. Flows — pumps, coastdown.
    PR.stepFlow(s, this.cfg, dt);
    // 10b. Load mode — turbine load + coupled feedwater track reactor (or manual/disconnected).
    this._stepLoadMode(dt);
    // 11. SG steam pressure/flow, feedwater/AFW.
    SG.stepSecondary(s, this.cfg, dt);
    // 12. Turbine / condenser.
    SG.stepTurbine(s, this.cfg, dt);
    // 13. Boron chemistry (CVCS): borate/dilute change concentration directly (needs
    //     the charging pump); decoupled from the net inventory balance.
    if (s.charging_pump_running !== false) s.boron_ppm += (s.boron_adjust || 0) * dt;
    if (s.boron_ppm < 0) s.boron_ppm = 0;
    // Mixing/transport lag: the CORE boron that drives reactivity follows the injected
    // concentration through a first-order filter (boron_mix_tau_s), so a borate/dilute changes
    // power over ~a loop transit — tracking the indication rather than jolting instantly.
    if (s.boron_reactive == null) s.boron_reactive = s.boron_ppm;
    var btau = this.cfg.reactivity.boron_mix_tau_s || 0;
    s.boron_reactive += (btau > 0 ? dt / (btau + dt) : 1) * (s.boron_ppm - s.boron_reactive);
    // 13b. Boron grab sample: lab turnaround, then the result posts — the MIXED
    // (reactive) concentration at analysis time, rounded to 1 ppm. Deterministic
    // (no PRNG draw — the instrument noise stream must not shift).
    if (s._boron_sample_timer > 0) {
      s._boron_sample_timer -= dt;
      if (s._boron_sample_timer <= 0) {
        s._boron_sample_timer = 0;
        s.boron_sample_ppm = Math.round(s.boron_reactive != null ? s.boron_reactive : s.boron_ppm);
        s.boron_sample_seq = (s.boron_sample_seq || 0) + 1;
      }
    }
    // 14. Partial-uncovery hot node (#213), then fuel damage / melt at the peak.
    TH.stepCladding(s, this.cfg, dt);
    TH.checkDamage(s, this.cfg);

    // Smoothed power rate for shrink-and-swell.
    var raw_rate = (s.power_pct - s._prev_power_pct) / dt;
    var a = dt / (2.0 + dt);
    s._power_rate = s._power_rate + a * (raw_rate - s._power_rate);
    s._prev_power_pct = s.power_pct;

    // 14b. Nuclear instrumentation sources (startup ranges): detector signals
    // proportional to normalized power. The SR counter only counts while its
    // high voltage is energized (set_sr_detector).
    var nis = this.cfg.nis;
    s.sr_counts_cps = s.sr_energized ? nis.k_sr * s._P : 0;
    s.ir_amps = nis.k_ir * s._P;

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
      above_p9: (s.power_pct || 0) > 50,   // P-9 permissive: gates the high-high SG (P-14) reactor trip
      rod_at_limit: this._controlGroup().at_insertion_limit,
      sr_energized: !!s.sr_energized,
      msiv_open: s.msiv_open !== false,
      sg_safety_open: !!s.sg_safety_open,
      // §8.8 synoptic status — copied into instruments.reading each step (HR1).
      afw_active: s.afw_active,
      afw_pump_running: !!s.afw_pump_demand,
      afw_block_open: !s.afw_blocked,   // AFW discharge/block valve open? (independent of pump demand)
      rhr_active: s.rhr_active,
      rhr_valve_open: !!s.rhr_valve_open,
      accumulators_discharging: s.accumulators_discharging,
      condenser_cooling_available: s.condenser_cooling_available,
      safety_relief_active: s.safety_open || s.safety_flow > 0,
      rcp_cavitating: !!s.rcp_cavitating,
      condensate_pump_running: s.condensate_pump_running !== false,
      // Reactor/turbine load imbalance — the SG filling/draining annunciator (#211).
      // Already computed HR1-correctly in load_mode.js from INDICATED power vs the
      // load target, > 4 % of rated. It was reaching true_state and getControlState
      // but never the instrument layer, so no alarm could read it.
      sg_imbalance_active: !!s.sg_imbalance_active,
      // Turbine trip status, for the P-9 reactor trip on turbine trip (default-off;
      // see pwr_control.js). Status pass-through — no lag, no noise, no PRNG draw.
      turbine_tripped: !!s.turbine_tripped,
      // RCS boron grab sample: last lab result + pending flag + result counter
      // (status pass-through — no lag/noise; the lab turnaround IS the lag).
      boron_sample: s.boron_sample_ppm,
      boron_sample_pending: s._boron_sample_timer > 0,
      boron_sample_seq: s.boron_sample_seq || 0,
    };
  };

  // Derived plant MODE (commercial numbering, M1/manual 05 §2). A classification
  // of the *true* plant condition — reactivity, thermal power, and RCS temperature
  // class — used for the Mode indicator on the board and the Mode 5↔1 transition
  // teaching. Temperature classes: hot ≥ 177 °C (350 °F), cold ≤ 93 °C (200 °F),
  // intermediate between. Mode 6 (Refueling) is out of scope. NOTE: during the
  // nuclear heatup this trainer takes the core critical below the hot band (real
  // plants reach hot standby before criticality), so a critical core at an
  // intermediate temperature reads Mode 4 by its temperature class.
  function plantModeOf(power_pct, reactivity_pcm, tavg_c) {
    var hot = tavg_c >= 177, cold = tavg_c <= 93;
    // "Critical" for classification = at/near criticality, OR clearly at power
    // (> 5 %). The power clause keeps a plant making real power in Mode 1/2 through
    // a momentary reactivity dip; below 5 %, reactivity distinguishes Mode 2
    // (critical) from Mode 3 (subcritical — e.g. residual power decaying after a
    // return to subcritical Hot Standby).
    var critical = reactivity_pcm > -200 || power_pct > 5;
    if (power_pct > 5 && hot) return { mode: 1, name: 'At Power' };
    if (critical && hot) return { mode: 2, name: 'Startup' };          // critical, ≤ 5 %, hot
    if (hot) return { mode: 3, name: 'Hot Standby' };                  // subcritical, hot
    if (cold) return { mode: 5, name: 'Cold Shutdown' };               // subcritical, cold
    return { mode: 4, name: 'Hot Shutdown' };                          // subcritical, intermediate
  }

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
    // Live down into the source range (the startup teaching band): with the
    // neutron source the subcritical floor is ~1e-4 %, so a 1e-6 % floor keeps
    // SUR defined through the whole approach to criticality.
    if (p > 1e-6) { sur = 26.06 * (pr / p); period = Math.abs(pr) > 1e-8 ? p / pr : Infinity; }
    return {
      power_pct: s.power_pct, tavg_c: s.tavg_c, thot_c: s.thot_c, tcold_c: s.tcold_c,
      pressure_mpa: s.pressure_mpa, pzr_level_pct: s.pzr_level_pct, sg_level_pct: s.sg_level_pct,
      // Wide-range SG level (whole-vessel column, tube sheet → separators). This is the
      // integrated inventory state; the narrow (working) range above is derived as its
      // sg_wr_lo..sg_wr_hi window (pwr_steam_generator.js). Wide keeps reading when narrow
      // pegs on an overfill/dryout — feeds the SG vessel water column in the UI.
      sg_level_wide_pct: s.sg_level_wide_pct,
      // Loop pressure distribution (true state; the single primary_pressure
      // instrument still reads pressure_mpa — no per-node gauges). Cold leg = pump
      // discharge (highest, ECCS/letdown datum); pump suction = between SG and RCP
      // (lowest, RCP-cavitation datum); hot leg = pressurizer reference.
      p_coldleg: s.p_coldleg, p_hotleg: s.p_hotleg, p_pumpsuction: s.p_pumpsuction,
      // RCP cavitation: suction-node subcooling margin (°C), severity (0–1), and the
      // annunciated flag — the physics behind the TMI-2 "the pumps are objecting" noise.
      suction_subcool_c: s.suction_subcool_c, rcp_cavitation_frac: s.rcp_cavitation_frac,
      rcp_cavitating: !!s.rcp_cavitating,
      steam_flow_normalized: s.steam_flow_normalized, fw_flow_normalized: s.fw_flow_normalized,
      // TOTAL steam leaving the SG (turbine + dump + safeties) — the source behind the
      // `sg_steam_flow` main-steam-line instrument, and the flow feed regulation must
      // actually match. `steam_flow_normalized` above is turbine flow ALONE, which
      // reads ~0 whenever the dump is carrying the plant. Defaulted rather than left
      // undefined: an undefined instrument source latches NaN in the lag buffer.
      steam_out_total: (s.steam_out_total != null ? s.steam_out_total : (s.steam_flow_normalized || 0)),
      steam_pressure_mpa: s.steam_pressure_mpa,   // secondary SG pressure (additive; for the UI diagram)
      mwe_output: s.mwe_output, subcooling_c: s.subcooling_c, core_inventory_pct: s.core_inventory_pct,
      core_void_fraction: s.core_void_fraction,   // flux-driven core boiling (DNB at power); 0 in TMI/normal ops
      primary_void_fraction: s.primary_void_fraction,   // inventory-driven (TMI) void — the FG-3 deception gate

      fuel_temp_c: s.fuel_temp_c, decay_heat_pct: s.decay_heat_pct, xenon_pct_eq: s.xenon_pct_eq,
      clad_temp_c: s.clad_temp_c,   // PEAK exposed-clad temp — the partial-uncovery damage driver (#213)
      boron_ppm: s.boron_ppm, porv_open: s.porv_open, porv_stuck: s.porv_stuck, spray_stuck: !!s.spray_stuck,
      block_valve_open: s.block_valve_open,   // scenario-trigger hook (memory-free isolation grading)
      porv_tailpipe_temp_c: s.tailpipe_temp_c,   // PORV discharge-line temperature (feeds instruments.porv_tailpipe_temp)
      fuel_damaged: s.fuel_damaged,              // latched at fuel_damage_c — scenario outcome-grading hook
      hpi_active: s.hpi_active, hpi_flow_normalized: s.hpi_flow_normalized, afw_active: s.afw_active,
      afw_pump_running: !!s.afw_pump_demand,   // pump demand (run lights) — distinct from delivered flow (TMI-2)
      afw_blocked: !!s.afw_blocked,            // AFW block/discharge valve shut (operator or TMI-2 tag-out)
      afw_flow_normalized: s.afw_flow_normalized || 0,   // TRUE delivered AFW flow (throttle × level hold; 0 when blocked)
      // ECCS/feedwater discharge-pressure + condensate indications (feed instruments).
      // HPI/charging pump develops head above the RCS it injects into (clamped to shutoff);
      // afw_discharge_pressure_mpa + condensate_flow_normalized are set in stepSecondary.
      hpi_discharge_pressure_mpa: s.hpi_active
        ? clip(s.pressure_mpa + this.cfg.emergency.hpi_discharge_margin_mpa, 0, this.cfg.emergency.hpi_shutoff_mpa) : 0,
      afw_discharge_pressure_mpa: s.afw_discharge_pressure_mpa || 0,
      condensate_flow_normalized: s.condensate_flow_normalized || 0,
      condensate_pump_running: s.condensate_pump_running !== false,
      pump_running: s.pump_running, pump_flow_pct: s.pump_flow_pct, station_blackout: s.station_blackout,
      turbine_rpm: s.turbine_rpm, condenser_vacuum_kpa: s.condenser_vacuum_kpa,
      cw_inlet_temp_c: s.cw_inlet_temp_c,
      condenser_cooling_available: s.condenser_cooling_available,
      scrammed: s.scrammed, melted: s.melted,
      destruction_cause: s.destruction_cause,   // 'none' | 'thermal_melt' — outcome-grading hook (sibling of fuel_damaged/melted)
      steam_demand_mwe: s.steam_demand_mwe,
      load_mode: s.load_mode, load_target_mwe: s.load_target_mwe,
      load_imbalance_mwe: s.load_imbalance_mwe, sg_imbalance_active: s.sg_imbalance_active,
      reactivity_pcm: (s._rho || 0) * 1e5, startup_rate_dpm: sur, reactor_period_s: period,
      // Derived plant MODE (1–6) + name, and the RCS heatup/cooldown rate (°C/hr)
      // for the Mode 5↔1 transition indications.
      plant_mode: plantModeOf(p, (s._rho || 0) * 1e5, s.tavg_c).mode,
      plant_mode_name: plantModeOf(p, (s._rho || 0) * 1e5, s.tavg_c).name,
      tavg_rate_c_per_hr: (s._dTavg_dt || 0) * 3600,
      // Nuclear instrumentation (startup ranges): SR counts (0 when de-energized), IR chamber current.
      sr_counts_cps: s.sr_counts_cps || 0, ir_amps: s.ir_amps || 0, sr_energized: !!s.sr_energized,
      // Main steam isolation + SG code safeties (upstream of the MSIV).
      msiv_open: s.msiv_open !== false, sg_safety_open: !!s.sg_safety_open,
      // §8.8 instrument sources — TRUE sim flows/positions (indications ≠ command setpoints):
      charging_flow_actual: (s.charging_pump_running === false ? 0 : s.charging_flow),
      letdown_flow_actual: s.letdown_flow, steam_dump_valve_pct: s.steam_dump_frac * 100,
      turbine_tripped: !!s.turbine_tripped,
      leak_flow: s.leak_flow,
      // §7 true_state additions (governor / accumulators / RHR):
      governor_valve_pct: s.governor_valve_pct,
      accumulators_discharging: s.accumulators_discharging,
      accumulator_flow_normalized: s.accumulator_flow_normalized,
      accumulator_volume_pct: s.accumulator_volume_pct,
      // N2 cover-gas pressure (indication only — see pwr_primary.stepAccumulators). Falls as
      // the tank empties; the board reads this for the SIT pressure readout.
      accumulator_pressure_mpa: s.accumulator_pressure_mpa,
      rhr_active: s.rhr_active,
      accumulator_valve_open: s.accumulator_valve_open !== false,   // discharge isolation valve position
      // RHR hot-leg suction valve + ECCS mode (HPI/LPI/RHR/off) for the ECCS card.
      rhr_valve_open: !!s.rhr_valve_open, eccs_mode: s.eccs_mode || 'off',
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
      // Auto/manual mode of the pressurizer pressure controls (null override =
      // the engine's proportional auto) — surfaced for the UI's Automate tab,
      // mirroring the steam_dump_auto precedent below.
      heater_auto: s.heater_override == null,
      spray_auto: s.spray_override == null,
      pressure_setpoint: (s.pressure_setpoint != null ? s.pressure_setpoint : this.cfg.pressurizer.P_setpoint),
      // CVCS commands: charging_flow_normalized is the operator SETPOINT (what the
      // charging valve is commanded to), NOT the true flow — under AUTO make-up the
      // true flow (instruments.charging_flow) modulates away from this setpoint.
      charging_flow_normalized: s.charging_setpoint,
      // Letdown orifice lineup (the command surface) + the resulting TRUE flow
      // (readout; pressure-driven, not a setpoint).
      letdown_orifice_a: !!s.letdown_orifice_a, letdown_orifice_b: !!s.letdown_orifice_b,
      letdown_flow_normalized: s.letdown_flow,
      charging_pump_running: s.charging_pump_running, cvcs_auto: s.cvcs_auto, boron_adjust: s.boron_adjust,
      condensate_pump_running: s.condensate_pump_running !== false,   // operator-controlled; gates main feed
      feed_pump_speed_pct: s.feed_pump_speed_pct,           // commanded pump speed (set_feed_pump_speed / nudge / coupling)
      feedwater_flow_pct: s.feedwater_demand_frac * 100,    // deprecated mirror (pump delivery %) — kept one release
      feed_auto_coupled: s.feed_auto_coupled,
      steam_demand_mwe: s.steam_demand_mwe,
      load_mode: s.load_mode,
      load_target_mwe: s.load_target_mwe,
      sg_imbalance: s.sg_imbalance_active
        ? (s.load_imbalance_mwe > 0 ? 'filling' : 'draining') : 'balanced',
      cw_inlet_temp_c: s.cw_inlet_temp_c,   // circ-water inlet setting (set_condenser_cw_temp)
      steam_dump_pct: s.steam_dump_frac * 100,
      steam_dump_auto: s.steam_dump_override == null,
      steam_dump_setpoint: (s.steam_dump_setpoint != null ? s.steam_dump_setpoint : this.cfg.steam_generator.steam_dump_setpoint),
      governor_valve_pct: s.governor_valve_pct,   // turbine admission valve (engine-driven; read-only)
      hpi_active: s.hpi_active, rhr_active: s.rhr_active, rhr_valve_open: !!s.rhr_valve_open,
      rhr_hx_fraction: (s.rhr_hx_fraction != null ? s.rhr_hx_fraction : 1),   // HX flow split (set_rhr_hx), 0–1
      eccs_mode: s.eccs_mode || 'off',                                        // HPI | LPI | RHR | off
      // SI accumulator discharge isolation valve — the operator command surface
      // (open_/close_accumulator_valve). Mirrors porv_block_open/msiv_open: the
      // board reads the clickable valve's position + ARMED/ISOLATED status from
      // control_state, so it must live here as well as in true_state.
      accumulator_valve_open: s.accumulator_valve_open !== false,
      afw_throttle_pct: (s.afw_throttle_frac != null ? s.afw_throttle_frac : 1.0) * 100,
      sr_energized: !!s.sr_energized,   // SR detector switch position
      msiv_open: s.msiv_open !== false, // main steam isolation valve position
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
          // A command to a bank at rest starts its travel from a clean fraction —
          // otherwise the leftover accumulator from the previous move (up to ~1 full
          // step) lands the first step almost immediately and the selected speed is
          // ignored. A bank still in motion keeps its fraction (it is mid-step).
          if (!g.velocity) g.step_accumulator = 0;
          g.coast_remaining_s = 0;   // a fresh nudge cancels any coast-to-stop in flight
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
          if (!g.velocity) g.step_accumulator = 0;   // see rod_nudge
          g.coast_remaining_s = 0;   // a fresh hold-drive cancels any coast-to-stop in flight
          var v = this.cfg.rods.speeds[g.speed] || this.cfg.rods.speeds.normal;
          g.velocity = (cmd.direction >= 0 ? 1 : -1) * v;
          g.moving = true;
        }
        break;
      case 'rod_stop':
        g = this._group(cmd.group_id);
        if (g && !g.scrammed) {
          g.nudge_target = null;
          // A moving bank coasts to a stop (the latch catches a beat after release);
          // a bank already at rest stops immediately. _stepRods runs the countdown.
          var coast = this.cfg.rods.stop_coast_s || 0;
          if (g.velocity && coast > 0) { g.coast_remaining_s = coast; }
          else { g.velocity = 0; g.moving = false; g.coast_remaining_s = 0; }
        }
        break;
      case 'rod_stop_all':
        this.rod_groups.forEach(function (gr) { if (!gr.scrammed) { gr.velocity = 0; gr.moving = false; gr.nudge_target = null; } });
        break;
      case 'scram':
        if (!s.scram_blocked) this._scram();
        break;
      case 'reset_rps':
        // PI-7 scram recovery (C3): the trip breakers reset only with the rods
        // fully inserted (the physical interlock — resetting re-closes the
        // breakers; the rods stay in until deliberately withdrawn, and the
        // startup net governs the re-ascent). The control layer refuses the
        // reset while any trip signal still stands; this is the engine half.
        if (s.scrammed && this.rod_groups.every(function (g) { return g.position_pct <= 2.0; })) {
          s.scrammed = false;
          this.rod_groups.forEach(function (g) { g.scrammed = false; g.moving = false; g.velocity = 0; g.nudge_target = null; g.coast_remaining_s = 0; });
        }
        break;
      case 'set_load_mode':
        RD.LoadMode.setMode(s, cmd.mode, { tripFn: SG.tripTurbine, rated: this.cfg.turbine.mwe_rated });
        break;
      case 'set_load_target':
        s.load_mode = 'manual';
        s.load_target_mwe = cmd.mwe;
        break;
      case 'disconnect_grid':
        RD.LoadMode.disconnect(s, SG.tripTurbine);
        break;
      case 'connect_grid':
        RD.LoadMode.setMode(s, 'follow', { rated: this.cfg.turbine.mwe_rated });
        if (s.condenser_vacuum_kpa >= this.cfg.turbine.vacuum_trip_kpa) s.turbine_tripped = false;
        break;
      case 'set_steam_demand':
        s.load_mode = 'manual';
        s.load_target_mwe = cmd.mwe;
        s.steam_demand_mwe = cmd.mwe;
        s.turbine_demand_frac = clip(cmd.mwe / this.cfg.turbine.mwe_rated, 0, 1.2);
        s.generator_load = s.turbine_demand_frac;
        if (s.turbine_demand_frac > 0 && s.condenser_vacuum_kpa >= this.cfg.turbine.vacuum_trip_kpa) s.turbine_tripped = false;
        break;
      case 'set_feedwater_flow':        // deprecated PWR alias — now drives the feed pump
      case 'set_feed_pump_speed':
        s.feed_auto_coupled = false;
        s.feed_pump_speed_pct = clip(cmd.pct, 0, 120);
        break;
      case 'feed_pump_nudge':
        // Manual feed-pump control: nudge the commanded speed up/down.
        s.feed_auto_coupled = false;
        s.feed_pump_speed_pct = clip((s.feed_pump_speed_pct || 0) + (cmd.delta_pct || 0), 0, 120);
        break;
      case 'set_feed_coupled':
        // Re-couple feedwater to load (the init default; set_feedwater_flow
        // uncouples). Used by the operator-automation layer during fast-forward.
        s.feed_auto_coupled = !!cmd.active;
        break;
      case 'set_heater':
        // {auto:true} returns to the proportional auto-control; {power_pct} is a manual override.
        s.heater_override = cmd.auto ? null : clip(cmd.power_pct / 100, 0, 1);
        break;
      case 'set_spray':
        // {auto:true} → auto; {pct} → manual valve %; {open} → back-compat boolean.
        // The DEMAND always moves — but it is ineffective while spray_stuck, exactly
        // as close_porv is while porv_stuck: pressurize() forces the valve open. The
        // controller genuinely returns to AUTO (spray_auto reads true) while the valve
        // sits open regardless — that gap is the lesson, not a bug (HR1).
        s.spray_override = cmd.auto ? null : (cmd.pct != null ? clip(cmd.pct / 100, 0, 1) : (cmd.open ? 1 : 0));
        break;
      case 'set_pressure_setpoint':
        // Operator pressure-control target (MPa) the heaters/spray hold. Ramped up
        // during heatup (draw/grow the bubble to NOP) and down during cooldown.
        // Clamped to the physical relief band so it can't command past the safeties.
        s.pressure_setpoint = clip(cmd.mpa, 0.1, this.cfg.pressurizer.safety_open_mpa);
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
      case 'open_accumulator_valve':
        // Align the SI accumulators to inject (discharge isolation valve open).
        s.accumulator_valve_open = true;
        break;
      case 'close_accumulator_valve':
        // Isolate the accumulators (motor-operated discharge valve shut) — blocks
        // injection at any pressure, so a cooldown can depressurize below the
        // check-valve setpoint without a spurious dump.
        s.accumulator_valve_open = false;
        break;
      case 'set_hpi':
      case 'set_lpi':   // set_lpi: deprecated alias — HPI and LPI are one merged "HPI/LPI" system
        s.hpi_active = !!cmd.active;
        break;
      case 'set_afw':
        // Pump demand vs delivered flow (TMI-2): the AFW PUMPS start on demand —
        // and their run indication is honest — but flow reaches the SGs only if
        // the discharge valves are open (afw_blocked models the tagged-shut
        // valves). Demand latches through a block so clearing the block restores
        // flow with the pumps already running, as in 1979.
        s.afw_pump_demand = !!cmd.active;
        s.afw_active = s.afw_pump_demand && !s.afw_blocked;
        break;
      case 'set_afw_block':
        // Operator AFW block / discharge valve — INDEPENDENT of the pump START/STOP. Closed
        // means the pumps may run (demand + run lights honest) but NO flow reaches the SG:
        // the TMI-2 tagged-shut discharge valves nobody noticed. Same latch as the failure
        // path, just operator-driven.
        s.afw_blocked = (cmd.open === false);
        s.afw_active = s.afw_pump_demand && !s.afw_blocked;
        break;
      case 'set_afw_flow':
        // AFW throttle: scales delivered AFW flow (0–100 % of capacity).
        s.afw_throttle_frac = clip((cmd.pct != null ? cmd.pct : 100) / 100, 0, 1);
        break;
      case 'trip_turbine':
        // Turbine protection lives in the control layer (low vacuum / overspeed
        // actuations reading instruments); this is the command it lands on.
        if (!s.turbine_tripped) SG.tripTurbine(s);
        break;
      case 'open_pzr_safety':
        s.safety_open = true;
        break;
      case 'close_pzr_safety':
        s.safety_open = false;
        break;
      case 'open_sg_safety':
        s.sg_safety_open = true;
        break;
      case 'close_sg_safety':
        s.sg_safety_open = false;
        break;
      case 'open_msiv':
        s.msiv_open = true;
        break;
      case 'close_msiv':
        // Isolating main steam with the turbine loaded trips it (real plants:
        // MSIV closure = turbine trip) — the SG then bottles up to its safeties.
        s.msiv_open = false;
        if (!s.turbine_tripped && s.generator_load > 0) SG.tripTurbine(s);
        break;
      case 'set_sr_detector':
        // Source-range detector high voltage on/off. The P-6 interlock (control
        // layer) refuses de-energizing until the IR is on scale, and refuses
        // re-energizing at high flux (detector protection).
        s.sr_energized = !!cmd.on;
        break;
      case 'set_steam_dump':
        // mode: 'auto' (null override) | 'open' (full) | 'closed' | a manual pct.
        if (cmd.mode === 'auto') s.steam_dump_override = null;
        else if (cmd.mode === 'open') s.steam_dump_override = 1.0;
        else if (cmd.mode === 'closed') s.steam_dump_override = 0.0;
        else if (cmd.pct != null) s.steam_dump_override = clip(cmd.pct / 100, 0, 1);
        break;
      case 'set_rhr':
      case 'set_dhr':   // set_dhr: one-release alias for save/restore compatibility (RHR was DHR)
        // The RHR hot-leg suction valve. Opening is honored only below the 400 psi
        // (rhr_valve_interlock_mpa) interlock — above it the open is refused and a
        // standing-open valve auto-closes each step (see step()). Closing is always
        // honored. rhr_active mirrors the valve (RHR is aligned iff the valve is open).
        if (cmd.active) {
          if (s.pressure_mpa <= this.cfg.emergency.rhr_valve_interlock_mpa) s.rhr_valve_open = true;
          // else: interlock refuses the open (valve stays shut)
        } else {
          s.rhr_valve_open = false;
        }
        s.rhr_active = !!s.rhr_valve_open;
        break;
      case 'set_rhr_hx':
        // RHR heat-exchanger flow split (0–1): fraction of the constant RHR loop
        // flow routed through the HX vs. bypassed. Scales heat removed (cooldown
        // rate); total loop flow — and thus inventory behavior — is unchanged.
        // Accepts { fraction: 0–1 } or { pct: 0–100 }.
        s.rhr_hx_fraction = clip(cmd.fraction != null ? cmd.fraction
          : (cmd.pct != null ? cmd.pct / 100 : 1), 0, 1);
        break;
      case 'set_charging_flow':
        // Manual charging: set BOTH the operator setpoint and the true flow, and
        // leave AUTO make-up (which would otherwise modulate the true flow).
        s.charging_setpoint = cmd.normalized; s.charging_flow = cmd.normalized; s.cvcs_auto = false;
        break;
      case 'set_letdown_orifices':
        // The real letdown control: each orifice independently in/out (off / A / B /
        // A+B). Flow is pressure-driven off the lineup (pwr_primary.letdownFlow).
        if (cmd.a != null) s.letdown_orifice_a = !!cmd.a;
        if (cmd.b != null) s.letdown_orifice_b = !!cmd.b;
        break;
      case 'set_letdown_flow':
        // Deprecated alias (pre-two-orifice saves/callers): map a requested
        // normalized flow to the nearest orifice lineup by NOP-flow. off / A(≈0.03) /
        // B(≈0.04) / A+B(≈0.07). The true flow is then pressure-driven like any lineup.
        var _n = cmd.normalized || 0;
        var _opts = [[false, false, 0], [true, false, 0.030], [false, true, 0.040], [true, true, 0.070]];
        var _best = _opts[0], _bd = Infinity;
        for (var _i = 0; _i < _opts.length; _i++) {
          var _d = Math.abs(_opts[_i][2] - _n);
          if (_d < _bd) { _bd = _d; _best = _opts[_i]; }
        }
        s.letdown_orifice_a = _best[0]; s.letdown_orifice_b = _best[1];
        break;
      case 'set_charging_pump':
        s.charging_pump_running = !!cmd.running;
        break;
      case 'set_rcp':
        // Reactor coolant pumps on/off. Secured in cold shutdown (RHR provides
        // forced circulation) and started during heatup to add pump heat and
        // couple the SG. Blocked while the station is blacked out (no AC power).
        if (!s.station_blackout) s.pump_running = !!cmd.running;
        break;
      case 'set_condensate_pump':
        // Condensate pump on/off. It feeds the feed-pump suction, so securing it
        // drops MAIN feedwater to zero (AFW is unaffected — separate train). Blocked
        // while blacked out (no AC power). See stepSecondary (condOK gate).
        if (!s.station_blackout) s.condensate_pump_running = !!cmd.running;
        break;
      // Circulating-water inlet temperature (°C). Not a plant control in the sense of a
      // switch the operator throws — it is the heat sink the site is given, exposed so the
      // effect is demonstrable: warm water costs vacuum, costs output, and raises the floor
      // an RHR cooldown can reach. Clipped to the modelled range.
      case 'set_condenser_cw_temp':
        if (cmd.c == null || !isFinite(cmd.c)) break;
        s.cw_inlet_temp_c = clip(cmd.c,
          this.cfg.turbine.cw_inlet_min_c != null ? this.cfg.turbine.cw_inlet_min_c : 4.4,
          this.cfg.turbine.cw_inlet_max_c != null ? this.cfg.turbine.cw_inlet_max_c : 37.8);
        break;
      case 'set_steam_dump_setpoint':
        // Operator no-load steam-dump target (MPa). Lowered during a cooldown so the
        // AUTO dump vents the secondary down, cooling the primary through the SG;
        // raised back toward the config no-load point on heatup. Clamped to the SG
        // safety band so it can't be set above the code-safety pop.
        s.steam_dump_setpoint = clip(cmd.mpa, 0.2, this.cfg.steam_generator.sg_safety_open_mpa);
        break;
      case 'set_cvcs_auto':
        // Bumpless AUTO→MANUAL transfer: leaving AUTO, the manual charging setpoint
        // picks up the current true charging flow (a real M/A station tracks the auto
        // output). Without this, MANUAL snapped charging to a STALE setpoint — 0 at
        // init — so a single toggle to manual left letdown running against zero
        // charging and drained the RCS. Capture only on the true→false edge so a
        // fresh operator setpoint is never clobbered.
        if (!cmd.active && s.cvcs_auto) s.charging_setpoint = s.charging_flow;
        s.cvcs_auto = !!cmd.active;   // auto make-up: charging modulates to hold inventory
        break;
      case 'isolate_feedwater':
        // P-14 main-feedwater isolation (control-layer actuation on high-high SG
        // level). Stops MAIN feed only; AFW is added downstream of this gate and
        // keeps flowing. Latches until an operator restore ({ active: false }).
        s.feedwater_isolated = (cmd.active !== false);
        break;
      case 'set_boron_adjust':
        // ppm/s: + borate, − dilute, 0 hold (needs the charging pump running)
        s.boron_adjust = cmd.rate || 0;
        break;
      case 'take_boron_sample':
        // Draw an RCS grab sample; the result posts after the lab turnaround
        // (boron_sample_lab_s). A sample already in the lab is not re-drawn.
        if (!(s._boron_sample_timer > 0)) {
          s._boron_sample_timer = this.cfg.reactivity.boron_sample_lab_s || 60;
        }
        break;
      case 'inject_failure':
        // Unknown ids must be loud: a silent no-op here let a test believe its
        // "LOCA" was running for months (effect names are not failure ids).
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

  PWREngine.prototype._group = function (id) {
    for (var i = 0; i < this.rod_groups.length; i++) if (this.rod_groups[i].id === id) return this.rod_groups[i];
    return null;
  };

  PWREngine.prototype._scram = function () {
    this.s.scrammed = true;
    // Reactor trip → turbine trip / load rejection (realistic interlock).
    RD.LoadMode.disconnect(this.s, SG.tripTurbine);
    // Decay heat is tracked continuously (it already holds the equilibrium value
    // for the power just before scram); it now persists and decays as P collapses.
    this.rod_groups.forEach(function (g) {
      // A stuck control rod holds out; M4/§9.1 model the held worth in reactivity,
      // but the group still "scrams" (drives in) — the held worth is added back.
      g.scrammed = true; g.moving = true; g.nudge_target = null; g.coast_remaining_s = 0;
    });
  };

  // ------------------------------------------------------- failure dispatch
  PWREngine.prototype._injectFailure = function (id, severity) {
    var def = this.cfg.protection.failures[id];
    if (!def) return;
    // Severity is a 0–1 fraction everywhere (the UI slider sends value/100).
    // Clamp defensively: a scenario author passing meta-units (e.g. 40 for
    // "40 %") would otherwise inject a physically absurd casualty.
    if (severity != null) severity = clip(severity, 0, 1);
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
        case 'failure_to_scram': s.scram_blocked = true; break;
        // A stuck valve is a persistent PHYSICAL state, not a value written into the
        // operator's demand — writing spray_override meant the next set_spray (AUTO
        // button or % slider) simply overwrote the failure and cleared it (#200).
        case 'stuck_open_spray': s.spray_stuck = true; break;
        case 'failed_pzr_heaters': s.heater_override = 0; break;
        case 'sg_overfeed': s.feed_auto_coupled = false; s.feed_pump_speed_pct = 120; s.feedwater_demand_frac = 1.2; break;
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
        case 'degrade_hpi': s.hpi_flow_multiplier = clip(1 - severity, 0, 1); break;
        case 'block_afw': s.afw_blocked = true; s.afw_active = false; break;   // pump demand persists (run lights stay honest)
        case 'primary_leak':
          var meta = def.severity_meta;
          // % rated flow → inventory-fraction/s. A tube rupture (SGTR) is a small
          // orifice primary→secondary: the raw "% rated flow" drains the whole primary
          // in seconds if taken as inventory-frac/s directly, so a leak_scale converts
          // it to a realistic slow drain (tens of minutes) that the EOP can out-inject.
          // A large-break LOCA carries no scale (leak_scale = 1) and drains fast.
          s.leak_flow = severity * (meta ? meta.max / 100 : 0.05) * (def.leak_scale != null ? def.leak_scale : 1);
          // SGTR leaks flow primary→secondary through the ruptured tube, so they
          // scale with the pressure DIFFERENCE across it (feel-plan P5): stash the
          // base rate and let stepInventory modulate it by ΔP each step. This is
          // what makes the single-SG EOP physical — depressurize the primary to
          // SG pressure and the leak STOPS. Containment-side leaks stay static.
          s._leak_to_sg = !!def.leak_to_sg;
          s._leak_base = s.leak_flow;
          break;
        case 'rod_withdrawal_runaway':
        case 'stuck_control_rod':
        case 'secondary_depressurize':
        case 'secondary_depressurize_upstream':
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
      // Break LOCATION relative to the MSIV decides whether the operator can end it
      // (#199). Downstream (turbine hall) — the MSIV stands between the SG and the
      // break, so shutting it isolates the generator and the blowdown STOPS.
      // Upstream (inside containment, between SG and valve) — nothing on this
      // single-loop plant can isolate it; the SG blows down whatever you do. The
      // steam-line rupture that a multi-loop crew answers by isolating the faulted
      // SG and steaming the intact ones has no counterpart here — say so, don't fake it.
      case 'secondary_depressurize': s._fail.steam_break = { active: true, size: severity, upstream: false }; break;
      case 'secondary_depressurize_upstream': s._fail.steam_break = { active: true, size: severity, upstream: true }; break;
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
        case 'failure_to_scram': s.scram_blocked = false; break;
        case 'stuck_open_spray': s.spray_stuck = false; break;   // the operator's own demand is left as they set it
        case 'failed_pzr_heaters': s.heater_override = null; break;
      }
      return;
    }
    if (def.type === 'physics_parameter') {
      switch (def.effect) {
        case 'coast_down_pumps': case 'stop_pump': break; // pumps stay off until restarted
        case 'full_blackout': s.station_blackout = false; s.condenser_cooling_available = true; s.main_feedwater_available = true; break;
        case 'vacuum_decay': s.condenser_cooling_available = true; break;
        case 'degrade_hpi': s.hpi_flow_multiplier = 1.0; break;
        case 'block_afw': s.afw_blocked = false; s.afw_active = !!s.afw_pump_demand; break;   // valves reopened: flow resumes if the pumps are demanded
        case 'primary_leak': s.leak_flow = 0; s._leak_base = 0; s._leak_to_sg = false; break;
        case 'rod_withdrawal_runaway': s._fail.rod_runaway = { active: false, rate: 0 }; break;
        case 'stuck_control_rod': s._fail.stuck_rod = { active: false, worth_held: 0 }; break;
        case 'secondary_depressurize':
        case 'secondary_depressurize_upstream':
          s._fail.steam_break = { active: false, size: 0, upstream: false }; break;
      }
    }
  };

  // Full-power equilibrium temperatures (P0=1) — reference for MTC/Doppler and HZP pinning.
  PWREngine.prototype._computeEquilibriumTemps = function (P0) {
    var cfg = this.cfg;
    var Tsec = TH.T_sat(cfg.steam_generator.steam_p_rated);
    // Core heat + RCP pump heat (full flow) both cross the SG at equilibrium.
    var Tavg = Tsec + (P0 * cfg.thermal.heat_gen_coeff
      + cfg.thermal.heat_gen_coeff * (cfg.thermal.pump_heat_frac || 0)) / cfg.thermal.h_sg;
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
    this._initialStateName = name;
    this.rod_groups = this._makeRodGroups();
    this.active_failures = [];
    this.s = this._buildState(name);
    // Reference temps = full-power equilibrium (fixed for MTC/Doppler, M1 §10).
    this._ensureHfpRefs();
    this.T_fuel_ref = this._hfp_refs.Tf;
    this.T_coolant_ref = this._hfp_refs.Tavg;
    this._trimToCritical(name);
    // Post an initial RCS chemistry grab-sample result. A real plant always has a
    // last lab boron number standing on the board; opening free-play startups with
    // "—" (never sampled) is the unrealistic state. The lab number IS the settled
    // reactive concentration the trim just solved, rounded to 1 ppm — so the CHEM
    // readout shows the current boron from the first frame, and the conc channel
    // latches this seq without treating it as a fresh (re-baselining) result.
    this.s.boron_sample_ppm = Math.round(this.s.boron_reactive != null ? this.s.boron_reactive : this.s.boron_ppm);
    this.s.boron_sample_seq = 1;
    this.s._boron_sample_timer = 0;
    this.instruments.reset(this.getTrueState(), this._instrExtras());
  };

  // Free-play preset lineup (applied by the service in selectPlant, NOT for instructed
  // content). Engine-side control_state that has no automation channel to carry it —
  // today just the letdown orifice alignment. Hot presets run a single letdown orifice
  // (A, 3 %); the cold/depressurized lineup keeps letdown isolated (RHR letdown regime),
  // which is the base default, so no command. ESF arms, trip blocks, charging/boron auto,
  // steam dump, turbine follow and feed auto are handled by the control layer / engine
  // defaults; this only fills the letdown gap.
  PWREngine.prototype.getStartupLineup = function () {
    var name = this._initialStateName || 'hot_full_power';
    if (name === 'cold_shutdown') return [];   // letdown isolated when depressurized
    var lineup = [{ action: 'set_letdown_orifices', a: true, b: false }];   // Orifice A (3 %)
    // Mode 1 (power operation) free-play start: put the generator load in MANUAL
    // rather than load-follow, so the operator drives generator load explicitly.
    if (name === 'hot_full_power' || name === '50_percent') lineup.push({ action: 'set_load_mode', mode: 'manual' });
    return lineup;
  };

  PWREngine.prototype._buildState = function (name) {
    var cfg = this.cfg, init = cfg.initial_states[name] || cfg.initial_states.hot_full_power;
    var P0 = init.power;

    // Sliding Tavg program (SS-2, catalog §8.1). Tavg is anchored to the load-
    // programmed reference — a LINEAR interpolation in load between the no-load
    // anchor (Tsat of the steam-dump setpoint — this plant: 297 °C) and the full-power coolant
    // equilibrium (~304-306 °C) — instead of the old flat-secondary anchor (which
    // pinned the secondary pressure and let Tavg SAG with load, the SS-2/SS-3
    // defect). The secondary saturation temperature is then DERIVED from the steady
    // heat balance at this power (Tavg − Tsec = heat in / h_sg), so each init state
    // is a TRUE steady state: the boron trim (below) pins Tavg here via the MTC, and
    // the derived steam pressure means the secondary does not have to drift to a new
    // equilibrium after reset. At full power the program top equals the old value, so
    // the MTC/Doppler reference temps and the full-power operating point are unchanged.
    var TavgMinusTsec = (P0 * cfg.thermal.heat_gen_coeff
      + cfg.thermal.heat_gen_coeff * (cfg.thermal.pump_heat_frac || 0)) / cfg.thermal.h_sg;   // heat in (core + RCP) / h_sg
    var Tnl = TH.T_sat(cfg.steam_generator.steam_dump_setpoint);           // program bottom: no-load Tavg
    var Tfp = this._computeEquilibriumTemps(1.0).Tavg;                     // program top: full-power equilibrium
    var Tavg = Tnl + (Tfp - Tnl) * clip(P0, 0, 1);                         // Tref(load), linear
    var Tsec = Tavg - TavgMinusTsec;                                       // derived secondary saturation temp
    var steam_p = PZ.P_sat_from_T(Tsec);                                  // derived secondary pressure (a true steady state)
    var Tfuel = Tavg + P0 * cfg.thermal.heat_gen_coeff / cfg.thermal.h_fc;
    var delta_T = cfg.thermal.delta_T_rated * P0 / 1.0;

    this._X_eq = this._computeXeq(1);        // full-power equilibrium: the 100 % xenon reference (normalizer)
    var X_eq0 = this._computeXeq(P0);        // THIS state's equilibrium xenon (SS-6: 5 % starts at 5 % xenon)
    var I_eq0 = this._I_eq(P0);

    var d = cfg.kinetics.delayed;
    var C = [];
    // Precursors at equilibrium with P0 for every state — a subcritical core
    // holding source equilibrium included (with the source term, HZP's P0 IS the
    // −margin equilibrium: P_eq = S·Λ/margin), so nothing drifts at reset.
    for (var i = 0; i < 6; i++) C[i] = (d.beta_i[i] / d.lambda_i[i]) * P0 / d.Lambda;

    var s = {
      sim_time: 0,
      _P: P0, power_pct: P0 * 100, _prev_power_pct: P0 * 100, _power_rate: 0, _rho: 0,
      _C: C, _I: init.subcritical ? 0 : I_eq0, _X: init.subcritical ? 0 : X_eq0,
      // Decay heat pre-loaded to the equilibrium fraction for this power (a
      // reactor that has been running a while), ~0 for a subcritical cold start.
      _H1: init.subcritical ? 0 : cfg.kinetics.decay.H1_0 * P0,
      _H2: init.subcritical ? 0 : cfg.kinetics.decay.H2_0 * P0,
      decay_heat_pct: init.subcritical ? 0 : (cfg.kinetics.decay.H1_0 + cfg.kinetics.decay.H2_0) * P0 * 100,
      xenon_pct_eq: init.subcritical ? 0 : (X_eq0 / this._X_eq) * 100,   // % of full-power equilibrium xenon
      boron_ppm: 800,

      fuel_temp_c: Tfuel, tavg_c: Tavg, thot_c: Tavg + delta_T / 2, tcold_c: Tavg - delta_T / 2,
      t_secondary_c: Tsec, subcooling_c: TH.T_sat(cfg.pressurizer.P_equilibrium) - Tavg,
      _subcool_hot_c: TH.T_sat(cfg.pressurizer.P_equilibrium) - (Tavg + delta_T / 2), core_void_fraction: 0,
      _Q_total: P0, _Q_coolant_to_sg: P0 * cfg.thermal.heat_gen_coeff, _dTavg_dt: 0, _h_fc_eff: cfg.thermal.h_fc,

      pressure_mpa: cfg.pressurizer.P_equilibrium,
      // Loop pressure nodes — finalized by computeNodePressures() below (after the
      // at_operating_temp / cold overrides settle pressure_mpa and flow_frac).
      p_coldleg: cfg.pressurizer.P_equilibrium, p_hotleg: cfg.pressurizer.P_equilibrium,
      p_pumpsuction: cfg.pressurizer.P_equilibrium,
      // Operator pressure-control setpoint (the target heaters/spray hold). Default
      // is normal operating pressure; the cold-shutdown / heatup / cooldown path
      // moves it across the range so pressure holds where it is placed instead of
      // snapping to NOP (M1 §6.4; Mode 5↔1 rework 2026-07).
      pressure_setpoint: cfg.pressurizer.P_setpoint,
      _pressure_sp_eff: cfg.pressurizer.P_setpoint,   // slewed effective target (seeded = commanded, see pwr_pressurizer.effectiveSetpoint)
      heater_power_frac: 0, spray_flow_frac: 0, heater_override: null, spray_override: null, spray_stuck: false,
      porv_demand: 'closed', porv_open: false, porv_stuck: false, safety_open: false,
      block_valve_open: true,                 // PORV isolation/block valve (B1; default open)
      porv_flow: 0, safety_flow: 0,
      tailpipe_temp_c: cfg.pressurizer.tailpipe_ambient_c,   // PORV discharge line (warm baseline: leaky seat)
      // DERIVED level at init: on the thermal-expansion base line at nominal mass —
      // so every state starts exactly where stepLevel will hold it (SS-5: partial-
      // load states init at their programmed level, not a flat nominal).
      _tavg_fp: Tfp,
      pzr_level_pct: clip(cfg.pressurizer.pzr_level_nominal
        + cfg.pressurizer.level_per_tavg * (Tavg - Tfp), cfg.pressurizer.level_prog_floor, 100),

      _mass: 1.0, core_inventory_pct: 100, primary_void_fraction: 0,
      // Letdown: two independent orifices (off / A / B / A+B). letdown_flow is the
      // TRUE pressure-driven flow, recomputed each step from the lineup (pwr_primary).
      charging_flow: 0, charging_setpoint: 0, letdown_flow: 0, leak_flow: 0,
      letdown_orifice_a: false, letdown_orifice_b: false,
      charging_pump_running: true, cvcs_auto: false, boron_adjust: 0,   // CVCS
      // RCS boron grab sample (take_boron_sample): last lab result (ppm; null =
      // never sampled), lab-turnaround countdown, and a result sequence counter.
      boron_sample_ppm: null, _boron_sample_timer: 0, boron_sample_seq: 0,
      // Merged HPI/LPI emergency injection (one flag, two-segment pump curve)
      // + passive accumulators (ECCS, §6.2/§6.3).
      hpi_active: false, hpi_flow_normalized: 0, hpi_flow_multiplier: 1.0,
      accumulators_discharging: false, accumulator_flow_normalized: 0,
      _accum_remaining: cfg.emergency.accumulator_capacity, accumulator_volume_pct: 100,
      accumulator_pressure_mpa: cfg.emergency.accumulator_trip_mpa,   // full tank = charge pressure
      accumulator_valve_open: true,           // motor-operated discharge isolation valve (default aligned)
      _eccs_inj_inv: 0,                       // cold-injection throughput for the stepCoolant quench term
      flow_frac: 1.0, pump_flow_pct: 100, pump_running: true, station_blackout: false,
      // RCP cavitation (suction-node subcooling; pwr_primary.stepCavitation).
      suction_subcool_c: 0, rcp_cavitation_frac: 0, rcp_cavitating: false,
      // Nuclear instrumentation: SR energized only where the state says so (startup lineup).
      sr_energized: !!init.sr_on,
      sr_counts_cps: init.sr_on ? cfg.nis.k_sr * P0 : 0,
      ir_amps: cfg.nis.k_ir * P0,

      sg_level_pct: cfg.steam_generator.sg_level_nominal,
      // Wide-range inventory state (integrated); narrow is derived from it in stepSecondary.
      // Seed so the derived narrow == sg_level_nominal at init (nominal sits in the window).
      sg_level_wide_pct: cfg.steam_generator.sg_wr_lo +
        (cfg.steam_generator.sg_wr_hi - cfg.steam_generator.sg_wr_lo) * cfg.steam_generator.sg_level_nominal / 100,
      steam_pressure_mpa: steam_p,   // derived from the Tavg program (SS-2), not the flat rated value
      msiv_open: true, sg_safety_open: false, sg_safety_flow: 0,   // main steam isolation + SG code safeties
      steam_flow_normalized: P0, fw_flow_normalized: P0,
      // Total SG draw (turbine + dump + safeties). Recomputed every SG step, but it
      // MUST exist from tick zero: the `sg_steam_flow` instrument sources it, and an
      // undefined source poisons that instrument's first-order lag buffer with NaN
      // permanently. Old saves are defaulted in _migrateState for the same reason.
      steam_out_total: P0,
      // Condensate pump (feeds the feed-pump suction — gates MAIN feed) + the flow/
      // discharge-pressure indication fields (computed in stepSecondary / getTrueState).
      condensate_pump_running: true, condensate_flow_normalized: P0,
      afw_discharge_pressure_mpa: 0,
      steam_dump_override: null, steam_dump_frac: 0,   // B2 (null = auto)
      // Operator steam-dump pressure setpoint (the no-load secondary target the
      // AUTO dump holds). Default is the config no-load point; lowered during a
      // cooldown so the secondary — and with it the primary through the SG — cools.
      steam_dump_setpoint: cfg.steam_generator.steam_dump_setpoint,
      feedwater_demand_frac: P0, feed_pump_speed_pct: P0 * 100, feedwater_flow: P0, main_feedwater_available: true,
      feedwater_isolated: false,   // P-14 main-feedwater isolation latch (AFW unaffected)
      afw_active: false, afw_pump_demand: false, afw_blocked: false, rhr_active: false,
      // RHR / LPI: hot-leg suction valve (interlocked) + HX flow split + ECCS mode.
      rhr_valve_open: false, rhr_hx_fraction: 1.0, eccs_mode: 'off',
      afw_throttle_frac: 1.0, afw_flow_normalized: 0,   // AFW throttle (set_afw_flow) + delivered flow

      // Rotor at rated only when the state spawns with the generator carrying real
      // load; the subcritical states (Modes 3/5, P0 = 1e-6) spawn with the turbine
      // at rest — no admission steam and nothing to hold it at speed (#235).
      turbine_rpm: P0 > 0.01 ? cfg.turbine.rpm_rated : 0, condenser_vacuum_kpa: cfg.turbine.vacuum_rated,
      // Circulating-water inlet temperature. Defaults to the reference the vacuum model is
      // calibrated at, so an untouched plant behaves exactly as it did before CW temperature
      // was modelled (see turbine.cw_inlet_ref_c).
      cw_inlet_temp_c: cfg.turbine.cw_inlet_ref_c != null ? cfg.turbine.cw_inlet_ref_c : 26.7,
      generator_load: P0, turbine_demand_frac: P0, turbine_tripped: false,
      // Turbine governor valve tracks load demand (% open); starts matched to P0 so
      // steam_flow = (gov/100)·(P/Prated) reproduces the P0 steady state at reset.
      governor_valve_pct: clip(P0, 0, 1) * 100,
      condenser_cooling_available: true, steam_demand_mwe: P0 * cfg.turbine.mwe_rated,
      mwe_output: P0 * cfg.turbine.mwe_rated,
      load_mode: 'follow', load_target_mwe: P0 * cfg.turbine.mwe_rated,
      load_follow_tau: RD.LoadMode.DEFAULT_TAU, feed_auto_coupled: true,
      load_imbalance_mwe: 0, sg_imbalance_active: false,

      scrammed: false, melted: false, fuel_damaged: false, destruction_cause: 'none',
      scram_blocked: false,
      _fail: {
        rod_runaway: { active: false, rate: 0 },
        stuck_rod: { active: false, worth_held: 0 },
        steam_break: { active: false, size: 0, upstream: false },
      },
    };

    // Place the control group at this state's operating position (% withdrawn),
    // per-state data so the rods track the starting power; boron (below) closes
    // the reactivity balance. Falls back to the plant operating position.
    var cg = this.rod_groups[0];
    var opPct = (init.rod_op_pct != null) ? init.rod_op_pct : cfg.rods.control_op_position_pct;
    cg.steps = Math.round(opPct / 100 * cg.max_steps);
    this._updateRodDerived(cg);

    // Hot standby: hold no-load temperature/pressure (M1 §10) — the SELF-
    // CONSISTENT no-load equilibrium: the secondary saturates at the steam-dump
    // setpoint (its pressure-mode no-load point), tavg sits at that saturation
    // temperature with no hot/cold split (no power), and heat transfer is ~zero.
    // Starting exactly here means no reset transient — nothing drifts.
    if (init.at_operating_temp) {
      var Tnl = TH.T_sat(cfg.steam_generator.steam_dump_setpoint);
      s.tavg_c = Tnl;
      s.thot_c = Tnl;
      s.tcold_c = Tnl;
      s.t_secondary_c = Tnl;
      s.steam_pressure_mpa = cfg.steam_generator.steam_dump_setpoint;
      s.fuel_temp_c = Tnl;       // negligible fission: fuel near coolant (decay preloaded below)
      s.subcooling_c = TH.T_sat(cfg.pressurizer.P_equilibrium) - Tnl;
      s._subcool_hot_c = TH.T_sat(cfg.pressurizer.P_equilibrium) - Tnl; // no hot/cold split at no load
      s._Q_coolant_to_sg = 0;
      s._dTavg_dt = 0;
      // Recent-shutdown decay maintains hot loop while subcritical (not scrammed — HZP lineup).
      var dh = cfg.kinetics.decay;
      s._H1 = dh.H1_0 * 0.07;
      s._H2 = dh.H2_0 * 0.07;
      s.decay_heat_pct = (s._H1 + s._H2) * 100;
      // Shutdown bank stays parked withdrawn at HZP (see SHUTDOWN_DRIVE hint); control bank is fully inserted.
    }

    // Mode 5, Cold Shutdown: override to a self-consistent COLD, depressurized,
    // RHR-cooled equilibrium (the manual's Mode 5). Distinct from at_operating_temp
    // (which pins the HOT no-load point): here the RCS is genuinely cold, the SG is
    // decoupled (RCPs secured → flow_frac 0, so the coolant↔SG term vanishes), RHR
    // holds the cold sink, and there is ~0 decay heat. The operator drives the
    // Mode 5→4→3 heatup out of this state by pressurizing, starting RCPs, isolating
    // RHR, and withdrawing rods / diluting boron.
    if (init.cold) {
      var e = cfg.emergency;
      var Tcold = (init.cold_tavg_c != null) ? init.cold_tavg_c : e.rhr_sink_c;
      var Pcold = (init.cold_pressure_mpa != null) ? init.cold_pressure_mpa : 2.5;
      s.tavg_c = Tcold; s.thot_c = Tcold; s.tcold_c = Tcold; s.fuel_temp_c = Tcold;
      s.pressure_mpa = Pcold; s.pressure_setpoint = Pcold; s._pressure_sp_eff = Pcold;
      s.subcooling_c = TH.T_sat(Pcold) - Tcold;
      s._subcool_hot_c = TH.T_sat(Pcold) - Tcold;
      s._Q_coolant_to_sg = 0; s._dTavg_dt = 0;
      // No decay heat — a core shut down long enough to be cold (overrides the
      // subcritical preload above, which is already ~0, and is explicit here).
      s._H1 = 0; s._H2 = 0; s.decay_heat_pct = 0;
      // RCPs secured; RHR forced circulation provides flow. flow_frac 0 decouples
      // the SG from the primary (heat path is RHR, not the steam generator).
      s.pump_running = false; s.flow_frac = 0; s.pump_flow_pct = 0;
      // RHR aligned for shutdown cooling (the low pressure satisfies the interlock).
      s.rhr_valve_open = true; s.rhr_active = true; s.rhr_hx_fraction = 1.0; s.eccs_mode = 'RHR';
      // Secondary secured, cold and depressurized (indicated near atmospheric — the
      // SG is decoupled by flow_frac 0, so this is an indication only, not a heat
      // path). Keep the no-load steam-dump target so a later heatup can bottle the
      // SG up to it in the usual way.
      s.steam_pressure_mpa = 0.1;
      s.t_secondary_c = TH.T_sat(0.1);
      s.steam_dump_setpoint = cfg.steam_generator.steam_dump_setpoint;
      s.msiv_open = true;
      // Pressurizer level at a cold band. With DERIVED level, an IC level implies a
      // mass surplus over nominal (a cold plant really does hold more mass): invert
      // level = floor + level_per_mass_surplus·(mass − 1) for the cold base line.
      if (init.cold_pzr_level != null) {
        s._mass = clip(1.0 + (init.cold_pzr_level - cfg.pressurizer.level_prog_floor)
          / cfg.pressurizer.level_per_mass_surplus, 0, cfg.primary.mass_max);
        s.core_inventory_pct = s._mass * 100;
        s.pzr_level_pct = init.cold_pzr_level;
      }
      // Heaters/spray in auto tracking the cold setpoint (holds Pcold); turbine off.
      s.heater_override = null; s.spray_override = null;
      // SI accumulators ISOLATED — the real Mode 5 lineup. Cold shutdown sits below the
      // accumulator cover-gas pressure (Pcold ≈ 2.5 MPa < accumulator_trip_mpa 4.14 MPa), so an
      // aligned tank would dump cold borated water and hold the plant subcritical/cold. The
      // discharge isolation valves are shut in cold shutdown and re-aligned during heatup once
      // RCS pressure exceeds the accumulator pressure (see _driveHeatup / _driveCooldown).
      s.accumulator_valve_open = false;
    }

    if (name === 'hot_full_power' && !this._hfp_refs) {
      this._hfp_refs = { Tf: Tfuel, Tavg: Tavg };
    }
    // Finalize the loop pressure nodes from the settled pressure_mpa / flow_frac.
    PR.computeNodePressures(s, cfg);
    return s;
  };

  // Equilibrium xenon / iodine at normalized power P (default full power). Iodine
  // I_eq = γ_I·P/λ_I; xenon X_eq = P·(γ_I+γ_X)/(λ_X+σφ·P). Parameterizing by P lets a
  // partial-power init START at ITS equilibrium xenon instead of the full-power value —
  // the SS-6 fix: a plant sitting at steady 5 % carries 5 %-equilibrium xenon, so it does
  // not suffer a spurious post-downpower xenon in-growth (I decaying into X) that droops
  // power to ~1 % over 30 min. The normalizer this._X_eq stays the P=1 value (the "100 %
  // xenon" reference for xenon_pct_eq and the rho_xenon worth).
  PWREngine.prototype._computeXeq = function (P) {
    var x = this.cfg.kinetics.xenon;
    if (P == null) P = 1;
    var I_eq = x.gamma_I * P / x.lambda_I;
    return (x.lambda_I * I_eq + x.gamma_X * P) / (x.lambda_X + x.sigma_phi * P);
  };
  PWREngine.prototype._I_eq = function (P) {
    var x = this.cfg.kinetics.xenon; return x.gamma_I * (P == null ? 1 : P) / x.lambda_I;
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
    s.boron_reactive = s.boron_ppm;   // the mixing lag starts settled at the trimmed concentration
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
    this._migrateState(this.s);
    this.rod_groups = JSON.parse(JSON.stringify(st.rod_groups));
    // Fine-step drive migration (228 → 912, 2026-07-23): saves written on a
    // different step scale rescale position by the ratio — same fraction of
    // travel, so rod reactivity is unchanged on load.
    var cfgMax = this.cfg.rods.max_steps;
    for (var gi = 0; gi < this.rod_groups.length; gi++) {
      var g = this.rod_groups[gi];
      if (g.max_steps !== cfgMax && g.max_steps > 0) {
        var ratio = cfgMax / g.max_steps;
        g.steps = Math.round(g.steps * ratio);
        g.max_steps = cfgMax;
        // insertion_limit_steps needs no rescale — _updateRodDerived below
        // recomputes it from power against the new max_steps.
        g.nudge_target = null; g.step_accumulator = 0; g.velocity = 0; g.coast_remaining_s = 0;
        this._updateRodDerived(g);
      }
    }
    this.active_failures = st.active_failures.slice();
    this.instruments.load(st.instruments);
    this.T_fuel_ref = st.refs.Tf; this.T_coolant_ref = st.refs.Tavg;
    this._X_eq = st.refs.X_eq; this._hfp_refs = st.refs.hfp;
  };
  // Fill defaults for state fields added after a save was written (each entry
  // documents the release that introduced it). Old fields are left in place —
  // extra keys in `s` are harmless.
  PWREngine.prototype._migrateState = function (s) {
    // HPI/LPI merge: lpi_active folded into the one hpi_active flag.
    if (s.lpi_active) { s.hpi_active = true; }
    delete s.lpi_active; delete s.lpi_flow_normalized;
    // RHR hot-leg suction valve + HX flow split (RHR/LPI rework). Older saves have
    // only rhr_active; the valve mirrors it and the HX split defaults to full flow.
    if (s.rhr_valve_open == null) s.rhr_valve_open = !!s.rhr_active;
    if (s.rhr_hx_fraction == null) s.rhr_hx_fraction = 1.0;
    if (s.eccs_mode == null) s.eccs_mode = 'off';
    // Spray valve stuck open (#200, 2026-07-27). The failure used to be encoded by
    // writing `spray_override = true` — a boolean shoved into the OPERATOR'S demand
    // field, which is exactly why any later set_spray overwrote and cleared it. It is
    // now its own physical flag. Convert the legacy encoding: only a literal `true`
    // is the old failure (a genuine manual demand is a 0..1 fraction), and the demand
    // goes back to auto since the operator never set it.
    if (s.spray_stuck == null) {
      s.spray_stuck = (s.spray_override === true);
      if (s.spray_override === true) s.spray_override = null;
    }
    // Total SG draw, added with the `sg_steam_flow` main-steam-line instrument
    // (2026-07-26). Recomputed on the first SG step, but it must be a NUMBER before
    // the first instrument read or the lag buffer latches NaN. Seed it from the
    // turbine flow the save does carry — correct whenever the dump is shut, and
    // corrected within one step regardless.
    if (s.steam_out_total == null) s.steam_out_total = s.steam_flow_normalized || 0;
    // AFW throttle (added with the ESF AUTO/MAN arms).
    if (s.afw_throttle_frac == null) s.afw_throttle_frac = 1.0;
    if (s.afw_flow_normalized == null) s.afw_flow_normalized = 0;
    // Condensate pump + ECCS/feed discharge-pressure indications (2026-07). Older saves
    // ran with the condensate pump implicitly on; default it on so main feed is unchanged.
    if (s.condensate_pump_running == null) s.condensate_pump_running = true;
    if (s.condensate_flow_normalized == null) s.condensate_flow_normalized = s.fw_flow_normalized || 0;
    if (s.afw_discharge_pressure_mpa == null) s.afw_discharge_pressure_mpa = 0;
    // Wide-range SG level (integrated inventory state). Older saves have only the narrow
    // sg_level_pct — seed wide from it via the window so the derived narrow is unchanged.
    if (s.sg_level_wide_pct == null) {
      var sgw = this.cfg.steam_generator;
      s.sg_level_wide_pct = sgw.sg_wr_lo + (sgw.sg_wr_hi - sgw.sg_wr_lo) * (s.sg_level_pct != null ? s.sg_level_pct : sgw.sg_level_nominal) / 100;
    }
    // Accumulator discharge isolation valve + cold-injection thermal coupling (2026-07).
    // Older saves have no isolation valve — default aligned (open) so behavior is
    // unchanged; the quench throughput recomputes on the first step.
    if (s.accumulator_valve_open == null) s.accumulator_valve_open = true;
    if (s._eccs_inj_inv == null) s._eccs_inj_inv = 0;
    // Feed pump (replaced direct feedwater-flow demand).
    if (s.feed_pump_speed_pct == null) s.feed_pump_speed_pct = (s.feedwater_demand_frac || 0) * 100;
    // Nuclear instrumentation (SR/IR detectors).
    if (s.sr_energized == null) s.sr_energized = false;
    if (s.sr_counts_cps == null) s.sr_counts_cps = 0;
    if (s.ir_amps == null) s.ir_amps = 0;
    // MSIV + SG safeties.
    if (s.msiv_open == null) s.msiv_open = true;
    // Steam-break LOCATION (2026-07-25, #199): pre-MSIV-gate saves carry
    // `_fail.steam_break = {active, size}` with no location. Default DOWNSTREAM
    // (isolable) — that is what the plain `steam_line_break` id now means, and a
    // save can only hold that one, since the upstream variant did not exist. A
    // restored mid-break save therefore gains a working MSIV, which is the fix.
    if (s._fail && s._fail.steam_break && s._fail.steam_break.upstream == null) {
      s._fail.steam_break.upstream = false;
    }
    if (s.sg_safety_open == null) s.sg_safety_open = false;
    if (s.sg_safety_flow == null) s.sg_safety_flow = 0;
    // Boron grab sample (2026-07-23 batch-dose rework). Older saves have never
    // sampled — null result, no lab work pending.
    if (s.boron_sample_ppm === undefined) s.boron_sample_ppm = null;
    if (s._boron_sample_timer == null) s._boron_sample_timer = 0;
    if (s.boron_sample_seq == null) s.boron_sample_seq = 0;
    // Operator pressure setpoint + lowerable steam-dump setpoint (Mode 5↔1 rework).
    // Older saves default to NOP pressure and the config no-load dump setpoint.
    if (s.pressure_setpoint == null) s.pressure_setpoint = this.cfg.pressurizer.P_setpoint;
    // Setpoint-pressurization slew (2026-07-23): older saves have no effective-target
    // state — seed it at the commanded setpoint (the save is settled there).
    if (s._pressure_sp_eff == null) s._pressure_sp_eff = s.pressure_setpoint;
    if (s.steam_dump_setpoint == null) s.steam_dump_setpoint = this.cfg.steam_generator.steam_dump_setpoint;
    // Saves that predate the CW-temperature model restore at the reference temperature, so
    // they replay with exactly the vacuum behaviour they were recorded under.
    if (s.cw_inlet_temp_c == null) {
      s.cw_inlet_temp_c = this.cfg.turbine.cw_inlet_ref_c != null ? this.cfg.turbine.cw_inlet_ref_c : 26.7;
    }
    // Loop pressure nodes (loop-pressure rework 2026-07). Recomputed each step from
    // pressure_mpa/flow_frac, but seed them so getTrueState is valid pre-first-step.
    if (s.p_coldleg == null || s.p_hotleg == null || s.p_pumpsuction == null) {
      RD.pwrPrimary.computeNodePressures(s, this.cfg);
    }
    // Two-orifice letdown (letdown rework 2026-07). Older saves stored letdown_flow
    // as a commanded constant; derive the equivalent orifice lineup by nearest NOP-flow
    // so intent carries over (letdown_flow is then recomputed pressure-driven each step).
    if (s.letdown_orifice_a == null || s.letdown_orifice_b == null) {
      var _lf = s.letdown_flow || 0;
      s.letdown_orifice_a = _lf > 0.015;              // A in service above a small threshold
      s.letdown_orifice_b = _lf > 0.050;              // B (larger) added toward the max lineup
    }
    // RCP cavitation (loop-pressure rework 2026-07). Recomputed each step; seed for
    // pre-first-step getTrueState on an old save.
    if (s.rcp_cavitation_frac == null) { s.rcp_cavitation_frac = 0; s.rcp_cavitating = false; }
    if (s.suction_subcool_c == null) RD.pwrPrimary.stepCavitation(s, this.cfg);
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
    // Emulate M4's mechanical-protection actuations (relief valves + turbine
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
    var pz = cfg.pressurizer, sg = cfg.steam_generator, tb = cfg.turbine;
    if (!s.safety_open && ins.primary_pressure > pz.safety_open_mpa) eng.applyCommand({ action: 'open_pzr_safety' });
    else if (s.safety_open && ins.primary_pressure < pz.safety_reseat_mpa) eng.applyCommand({ action: 'close_pzr_safety' });
    if (!s.sg_safety_open && ins.steam_pressure > sg.sg_safety_open_mpa) eng.applyCommand({ action: 'open_sg_safety' });
    else if (s.sg_safety_open && ins.steam_pressure < sg.sg_safety_reseat_mpa) eng.applyCommand({ action: 'close_sg_safety' });
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
  // Run until pred(true_state, instruments) is true or timeout; returns seconds elapsed.
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

  // ---- Mode 5 ↔ Mode 1 procedural drivers (used by the round-trip test) --------
  // Simplified "operator" scripts that drive the plant across the full heatup /
  // cooldown on the engine's real physics, issuing only real engine commands and
  // reading the TRUE state (deterministic — no instrument noise in the control
  // path). They are NOT the control layer; they stand in for a trained operator so
  // the §14 gate can assert the transition is physically achievable end to end.
  function _pzrTrim(h) {                        // hold pzr level in band (letdown/charging)
    var l = h.ts().pzr_level_pct;
    // Level high → open both letdown orifices (max drain); low → charge and isolate
    // letdown; in band → both off. Letdown flow is pressure-driven from the lineup.
    if (l > 62) { h.cmd({ action: 'set_letdown_orifices', a: true, b: true }); h.cmd({ action: 'set_charging_flow', normalized: 0 }); }
    else if (l < 50) { h.cmd({ action: 'set_charging_flow', normalized: 0.06 }); h.cmd({ action: 'set_letdown_orifices', a: false, b: false }); }
    else { h.cmd({ action: 'set_letdown_orifices', a: false, b: false }); h.cmd({ action: 'set_charging_flow', normalized: 0 }); }
  }
  function _feedHold(h) {                        // hold SG level ~65 % on the feed pump
    var sgL = h.ts().sg_level_pct;
    h.cmd({ action: 'set_feed_pump_speed', pct: Math.max(0, Math.min(100, 40 + 3 * (65 - sgL))) });
  }
  // Heatup: Mode 5, Cold Shutdown → Mode 1, At Power. Pressurize + draw the loop up
  // (RCPs on, RHR auto-closes above the interlock), turbine offline so the SG bottles
  // to no-load, then a gentle SUR-limited control-bank withdrawal takes the core
  // critical and holds ~10 % fission power, heating the RCS to NOP and on past 5 %.
  function _driveHeatup(h, maxSec) {
    maxSec = maxSec || 6000;
    var minSub = 1e9, maxFuel = 0, critAt = -1, hotAt = -1, mode1At = -1, t;
    h.cmd({ action: 'set_rcp', running: true });
    h.cmd({ action: 'disconnect_grid' });                     // turbine offline → SG bottles to no-load
    // Bottle the SG to the configured no-load anchor (Tsat(setpoint) = no-load Tavg);
    // "hot" for the Mode-3/1 criteria below is derived from the same anchor.
    var dumpSp = h.eng.cfg.steam_generator.steam_dump_setpoint;
    var T_hot = TH.T_sat(dumpSp) - 1;
    h.cmd({ action: 'set_steam_dump_setpoint', mpa: dumpSp });
    for (var p = 3; p <= 15.41; p += 2) { h.cmd({ action: 'set_pressure_setpoint', mpa: Math.min(p, 15.41) }); h.run(40); }
    h.cmd({ action: 'set_pressure_setpoint', mpa: 15.41 }); h.run(60);
    // RCS is now above the accumulator cover-gas pressure — re-align the SI accumulators
    // (isolated in the cold-shutdown lineup) so they are operable for the at-power Modes.
    h.cmd({ action: 'open_accumulator_valve' });
    h.cmd({ action: 'set_feed_pump_speed', pct: 20 });
    var elapsed = 0, dt = 5;
    while (elapsed < maxSec) {
      t = h.ts();
      minSub = Math.min(minSub, t.subcooling_c); maxFuel = Math.max(maxFuel, t.fuel_temp_c);
      if (critAt < 0 && t.reactivity_pcm > -30 && t.power_pct > 0.5) critAt = elapsed;
      if (hotAt < 0 && t.tavg_c >= T_hot) hotAt = elapsed;
      var Pt = (t.tavg_c < T_hot - 3) ? 10 : 12;
      if (t.power_pct > Pt * 1.3 || t.startup_rate_dpm > 1.5 || t.fuel_temp_c > 500) h.cmd({ action: 'rod_nudge', group_id: 'control_rods', steps: -8, speed: 'normal' });
      else if (t.power_pct < Pt * 0.8 && t.startup_rate_dpm < 1.0) h.cmd({ action: 'rod_nudge', group_id: 'control_rods', steps: 4, speed: 'slow' });
      _feedHold(h);
      h.run(dt); elapsed += dt;
      if (t.tavg_c >= T_hot && t.power_pct > 5 && hotAt >= 0 && elapsed > hotAt + 200) { mode1At = elapsed; break; }
    }
    return { critAt: critAt, hotAt: hotAt, mode1At: mode1At, maxFuel: maxFuel, minSub: minSub };
  }
  // Cooldown: (Mode 1 →) Mode 3 → Mode 5, Cold Shutdown. Trip, borate for cold
  // shutdown margin (cooling adds +reactivity via MTC), ramp the secondary down so
  // the SG cools the primary, depressurize in step (subcooling-guarded), then below
  // the interlock place RHR and secure RCPs so RHR alone draws the RCS cold.
  function _driveCooldown(h, maxSec) {
    maxSec = maxSec || 12000;
    var minSub = 1e9, coldAt = -1, t, below276 = false, elapsed = 0, dt = 10, k = 0;
    h.cmd({ action: 'scram' });
    h.cmd({ action: 'set_afw', active: true });
    while (elapsed < maxSec) {
      t = h.ts();
      minSub = Math.min(minSub, t.subcooling_c);
      h.cmd({ action: 'set_steam_dump_setpoint', mpa: Math.max(0.3, h.eng.cfg.steam_generator.steam_dump_setpoint - k * 0.03) });
      var satGuard = Math.pow(Math.max(t.tavg_c + 25, 1) / 179.47, 1 / 0.239);
      var psp = Math.max(satGuard, 15.41 - k * 0.02);
      h.cmd({ action: 'set_pressure_setpoint', mpa: psp });
      if (t.pressure_mpa < 2.6) h.cmd({ action: 'set_spray', pct: 0 });
      else if (psp < t.pressure_mpa - 0.2) h.cmd({ action: 'set_spray', pct: 60 });
      else h.cmd({ action: 'set_spray', auto: true });
      // Isolate the SI accumulators just ABOVE the ~4.14 MPa (600 psi) check-valve setpoint, so an
      // intentional cooldown shuts the discharge valve BEFORE pressure reaches the arming point and
      // the accumulators never fire (unlike a LOCA, where the valve stays open and they dump at the
      // setpoint). Margin is ~0.35 MPa (isolate near ~650 psi), tracking the config setpoint.
      if (t.pressure_mpa < h.eng.cfg.emergency.accumulator_trip_mpa + 0.35) h.cmd({ action: 'close_accumulator_valve' });
      if (!below276 && t.pressure_mpa < 2.76) { below276 = true; h.cmd({ action: 'set_rhr', active: true }); h.cmd({ action: 'set_rhr_hx', pct: 100 }); h.cmd({ action: 'set_rcp', running: false }); }
      h.cmd({ action: 'set_boron_adjust', rate: t.reactivity_pcm < -1500 ? 0 : 3.0 });
      _pzrTrim(h); _feedHold(h);
      h.run(dt); elapsed += dt; k++;
      if (t.tavg_c <= 55 && t.pressure_mpa < 2.76 && t.rhr_valve_open) { coldAt = elapsed; break; }
    }
    return { coldAt: coldAt, minSub: minSub };
  }

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
        // No-load Tavg is the BOTTOM of the sliding Tavg program (FG-2): Tsat of the
        // steam-dump setpoint — this plant's anchor 297 °C (feel-plan P3).
        var Tnl = TH.T_sat(h.eng.cfg.steam_generator.steam_dump_setpoint);
        ck('Tavg ≈ no-load anchor (' + Tnl.toFixed(0) + ' °C) at reset', t0.tavg_c.toFixed(2), near(t0.tavg_c, Tnl, 3), Tnl.toFixed(0) + ' ±3');
        ck('control bank fully inserted', h.eng.getControlState().rod_groups[0].position_pct.toFixed(1), near(h.eng.getControlState().rod_groups[0].position_pct, 0, 1), '0 ±1');
        ck('pressure ≈ 15.41 MPa', t0.pressure_mpa.toFixed(3), near(t0.pressure_mpa, 15.41, 0.25), '15.41 ±0.25');
        h.run(100);
        var t = h.ts();
        ck('Tavg holds the no-load anchor (idle HZP)', t.tavg_c.toFixed(2), near(t.tavg_c, Tnl, 4), Tnl.toFixed(0) + ' ±4');
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

    steady_five_percent: function () {
      return test('Steady operation — 5_percent (low-power Mode 1, At Power)', function (ck) {
        var h = new Harness('5_percent');
        var t0 = h.ts();
        ck('reads Mode 1, At Power', t0.plant_mode + ' ' + t0.plant_mode_name, t0.plant_mode === 1, 'Mode 1');
        h.run(300);
        var t = h.ts();
        ck('power holds low (~5–6 %)', t.power_pct.toFixed(2), near(t.power_pct, 5.5, 1.5), '5.5 ±1.5');
        ck('stays in Mode 1 (> 5 %)', t.plant_mode + ' ' + t.plant_mode_name, t.plant_mode === 1, 'Mode 1');
        ck('stable pressure', t.pressure_mpa.toFixed(3), near(t.pressure_mpa, 15.41, 0.3), '15.41 ±0.3');
        // Low-power heat-balance Tavg sits below full-power NOP (no Tavg program in
        // this lumped model), but well within the hot Mode-1 temperature class.
        ck('Tavg hot (Mode-1 class)', t.tavg_c.toFixed(1), t.tavg_c > 250 && t.tavg_c < 310, '250–310 °C');
        ck('not scrammed', t.scrammed, t.scrammed === false, false);
        ck('reactivity ≈ critical', h.eng.s._rho.toExponential(2), Math.abs(h.eng.s._rho) < 5e-4, '|ρ|<5e-4');
      });
    },

    cold_shutdown_hold: function () {
      return test('Mode 5, Cold Shutdown — cold, subcritical, RHR-cooled, holds', function (ck) {
        var h = new Harness('cold_shutdown');
        var t0 = h.ts();
        ck('reads Mode 5, Cold Shutdown', t0.plant_mode + ' ' + t0.plant_mode_name, t0.plant_mode === 5, 'Mode 5');
        ck('cold at reset (Tavg ≤ 93 °C)', t0.tavg_c.toFixed(1), t0.tavg_c <= 93, '≤ 93');
        ck('depressurized below RHR interlock', t0.pressure_mpa.toFixed(2), t0.pressure_mpa <= 2.76, '≤ 2.76 MPa');
        ck('subcritical', t0.reactivity_pcm.toFixed(0), t0.reactivity_pcm < 0, '< 0 pcm');
        ck('RHR aligned (hot-leg suction open)', t0.rhr_valve_open, t0.rhr_valve_open === true, true);
        ck('ECCS card shows RHR', t0.eccs_mode, t0.eccs_mode === 'RHR', 'RHR');
        ck('SR energized (shutdown monitoring)', t0.sr_energized, t0.sr_energized === true, true);
        ck('healthy subcooling (no boiling cold)', t0.subcooling_c.toFixed(0), t0.subcooling_c > 50, '> 50 °C');
        ck('~zero decay heat (long-shut core)', t0.decay_heat_pct.toFixed(3), t0.decay_heat_pct < 0.1, '< 0.1 %');
        h.run(1200);
        var t = h.ts();
        ck('Tavg holds cold over 20 min', t.tavg_c.toFixed(1), t.tavg_c <= 93, '≤ 93 °C');
        ck('pressure holds', t.pressure_mpa.toFixed(2), near(t.pressure_mpa, t0.pressure_mpa, 0.5), '≈ start ±0.5');
        ck('still subcritical', t.reactivity_pcm.toFixed(0), t.reactivity_pcm < 0, '< 0 pcm');
        ck('power did not run away', t.power_pct.toExponential(2), t.power_pct < 1.0, '< 1 %');
      });
    },

    mode5_to_mode1_roundtrip: function () {
      return test('Mode 5 ↔ Mode 1 round trip — cold→hot→cold on integrated physics', function (ck) {
        var h = new Harness('cold_shutdown');
        // --- Heatup: Mode 5 → Mode 3 → Mode 1 ---
        var up = _driveHeatup(h, 6000);
        var mid = h.ts();
        ck('reached criticality on the way up', up.critAt, up.critAt >= 0, 'critAt ≥ 0 s');
        ck('RCS heated to the no-load anchor (≥ 296 °C)', mid.tavg_c.toFixed(1), mid.tavg_c >= 296, '≥ 296 °C');
        ck('mode indicator reached Mode 1', mid.plant_mode + ' ' + mid.plant_mode_name, mid.plant_mode === 1, 'Mode 1');
        ck('Mode 1 reached — critical, > 5 % power', mid.power_pct.toFixed(1), up.mode1At >= 0 && mid.power_pct > 5, '> 5 % at NOP');
        ck('no fuel damage during heatup', up.maxFuel.toFixed(0), up.maxFuel < 1200 && !h.eng.s.fuel_damaged, '< 1200 °C');
        ck('stayed subcooled during heatup', up.minSub.toFixed(0), up.minSub > 0, '> 0 °C');
        // --- Cooldown: Mode 1 → Mode 3 → Mode 5 ---
        var down = _driveCooldown(h, 12000);
        var end = h.ts();
        ck('cooled back to Mode 5 (≤ 93 °C)', end.tavg_c.toFixed(1), end.tavg_c <= 93, '≤ 93 °C');
        ck('depressurized below RHR interlock', end.pressure_mpa.toFixed(2), end.pressure_mpa < 2.76, '< 2.76 MPa');
        ck('RHR aligned for cold cooling', end.rhr_valve_open, end.rhr_valve_open === true, true);
        ck('subcritical at cold', end.reactivity_pcm.toFixed(0), end.reactivity_pcm < 0, '< 0 pcm');
        ck('mode indicator returned to Mode 5', end.plant_mode + ' ' + end.plant_mode_name, end.plant_mode === 5, 'Mode 5');
        ck('stayed subcooled during cooldown', down.minSub.toFixed(0), down.minSub > 0, '> 0 °C');
        ck('returned to cold shutdown', down.coldAt, down.coldAt >= 0, 'coldAt ≥ 0 s');
      });
    },

    control_response: function () {
      return test('Control response — rod withdraw/insert', function (ck) {
        var h = new Harness('hot_full_power');
        h.run(30);
        var p_before = h.ts().power_pct;
        // Real-like MTC (−20 pcm/°C, P4/P5 recalibration): the coolant fights a
        // small withdrawal hard, so the settled rise is ~0.1 % — direction is the
        // physics being pinned, not magnitude.
        h.cmd({ action: 'rod_nudge', group_id: 'control_rods', steps: 32 }); // withdraw
        h.run(120);
        var p_with = h.ts().power_pct;
        ck('power rises on withdraw', p_with.toFixed(2), p_with > p_before + 0.05, '> ' + p_before.toFixed(2));
        ck('re-settles (stable)', h.eng.s._rho.toExponential(2), Math.abs(h.eng.s._rho) < 1e-3, 'near critical');
        var p_mid = h.ts().power_pct;
        h.cmd({ action: 'rod_nudge', group_id: 'control_rods', steps: -32 }); // insert back
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
        ck('load disconnected on scram', h.eng.s.load_mode, h.eng.s.load_mode === 'disconnected', 'disconnected');
        ck('steam demand zero', t.steam_demand_mwe.toFixed(0), t.steam_demand_mwe === 0, '0');
      });
    },

    load_mode_follow: function () {
      return test('Load mode — follow reactor keeps SG balanced on rod insert', function (ck) {
        var h = new Harness('hot_full_power');
        h.run(10);
        ck('default follow mode', h.eng.s.load_mode, h.eng.s.load_mode === 'follow', 'follow');
        ck('feed coupled', h.eng.s.feed_auto_coupled, h.eng.s.feed_auto_coupled === true, 'true');
        // Real-like MTC: 60 fine steps in (= old 15) sheds less settled power (the
        // coolant cools and gives reactivity back) — ~91-92 % vs the old ~88.
        h.cmd({ action: 'rod_nudge', group_id: 'control_rods', steps: -60 });
        h.run(180);
        var t = h.ts();
        ck('power fell', t.power_pct.toFixed(1), t.power_pct < 96, '< 96%');
        // Banded against RATED, not a literal: this read "< 950 MWe", left over from
        // the ~1000 MWe plant, and has been vacuously true since the rescale to 100.
        var ratedF = RD.PWR_CONFIG.turbine.mwe_rated;
        ck('load target tracked down', h.eng.s.load_target_mwe.toFixed(0),
          h.eng.s.load_target_mwe < ratedF * 0.95, '< ' + (ratedF * 0.95).toFixed(0) + ' MWe');
        ck('load target tracks power (follow mode)', h.eng.s.load_target_mwe.toFixed(1),
          near(h.eng.s.load_target_mwe, t.power_pct / 100 * ratedF, ratedF * 0.05), '≈ power ±5% rated');
        ck('SG level stable (no runaway fill)', t.sg_level_pct.toFixed(0), t.sg_level_pct < 88, '< 88%');
      });
    },

    // Regression pin for the feed/steam clip asymmetry (issue #130). The governor
    // clamps steam to rated, so an above-rated load ask used to boil 1.0 while the
    // coupled feed drove 1.2 — a permanent imbalance that walked SG level 65 → 89 %
    // and scrammed on sg_level high 36-112 s later, with no visible link back to the
    // slider that caused it. The ask must instead simply saturate at what the plant
    // can deliver.
    load_above_rated_hold: function () {
      return test('Load mode — a sustained above-rated ask saturates, it does not flood the SG', function (ck) {
        var rated = RD.PWR_CONFIG.turbine.mwe_rated;
        var h = new Harness('hot_full_power');
        h.run(60);
        h.cmd({ action: 'set_load_mode', mode: 'manual' });
        h.cmd({ action: 'set_load_target', mwe: rated * 1.3 });
        var peak = 0;
        for (var i = 0; i < 180; i++) {          // 30 min at 10 s/step
          h.run(10);
          if (h.ts().sg_level_pct > peak) peak = h.ts().sg_level_pct;
        }
        var t = h.ts();
        // Band the peak against the SHIPPING high-SG trip setpoint rather than a
        // literal: this harness is the bare engine, so the RPS is not in the loop and
        // a `scrammed` check here would be vacuous — but crossing that setpoint is
        // exactly what scrams the plant once M4 is. Margin, not just "didn't trip".
        var sgHi = h.eng.getProtectionConfig().trips.filter(function (tr) {
          return tr.instrument === 'sg_level' && tr.direction === 'high';
        })[0];
        ck('shipping table has the high-SG trip', sgHi ? sgHi.setpoint : 'missing', !!sgHi, 'sg_level high present');
        ck('SG level stays well clear of the high-SG trip (' + (sgHi ? sgHi.setpoint : '?') + '%)',
          peak.toFixed(1), sgHi && peak < sgHi.setpoint - 10, '< setpoint − 10%');
        ck('SG level settles at the working level', t.sg_level_pct.toFixed(1),
          near(t.sg_level_pct, 65, 8), '65 ±8');
        // The ask saturates at what the turbine can actually take — asking for more
        // than rated must not deliver more than rated, but must still deliver rated.
        ck('output saturates at rated, not above', t.mwe_output.toFixed(1),
          near(t.mwe_output, rated, rated * 0.05), rated.toFixed(0) + ' ±5%');
        // Sub-rated coupling is untouched by the clip — the EV-11 mismatch behaviour
        // on an ordinary slider move must still be there.
        var h2 = new Harness('hot_full_power');
        h2.run(60);
        h2.cmd({ action: 'set_load_mode', mode: 'manual' });
        h2.cmd({ action: 'set_load_target', mwe: rated * 0.85 });
        h2.run(1800);
        var t2 = h2.ts();
        ck('sub-rated ask still tracks (coupling not disabled)', t2.mwe_output.toFixed(1),
          near(t2.mwe_output, rated * 0.85, rated * 0.06), (rated * 0.85).toFixed(0) + ' ±6%');
        ck('sub-rated SG level still drifts up a little (EV-11 mismatch intact)',
          t2.sg_level_pct.toFixed(1), t2.sg_level_pct > 65.5 && t2.sg_level_pct < 75,
          '65.5 < lvl < 75');
      });
    },

    transient_loss_feedwater: function () {
      return test('Transient — loss of main feedwater', function (ck) {
        var h = new Harness('hot_full_power');
        h.run(10);
        // Read the lo-lo setpoint from the SHIPPING trip table (17% since the
        // P-14 rework) instead of hardcoding — and assert the sg_level trip
        // SPECIFICALLY: rpsWouldTrip ignores P-10 blocks, so at power the
        // IR/PR trips always report and `length > 0` was a tautology.
        var sgTrip = h.eng.getProtectionConfig().trips.filter(function (t) {
          return t.instrument === 'sg_level' && t.direction === 'low';
        })[0];
        ck('shipping table has the low-SG trip', sgTrip ? sgTrip.setpoint : 'missing', !!sgTrip, 'sg_level low present');
        ck('no low-SG trip before the failure', rpsWouldTrip(h.eng).indexOf('sg_level low') === -1,
          rpsWouldTrip(h.eng).indexOf('sg_level low') === -1, 'true');
        h.cmd({ action: 'inject_failure', failure_id: 'loss_of_feedwater' });
        var t = h.runUntil(function (ts, ins) { return ins.sg_level <= sgTrip.setpoint; }, 600);
        ck('SG level falls to the trip setpoint (' + (sgTrip ? sgTrip.setpoint : '?') + '%)',
          t >= 0 ? t.toFixed(1) + 's' : 'never', t >= 0, 'reaches setpoint');
        var reasons = rpsWouldTrip(h.eng);
        ck('RPS would trip on sg_level low', reasons.join(','), reasons.indexOf('sg_level low') >= 0, 'includes sg_level low');
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
        // The trip actuation reads the vacuum INSTRUMENT (lag 5 s), so allow it
        // to catch up to the truth before asserting. (getTrueState has no
        // turbine_tripped field — the old predicate read undefined and never
        // fired, so the timing claim was untested; read the engine directly.)
        var tt = h.runUntil(function () { return h.eng.s.turbine_tripped === true; }, 30);
        ck('turbine trips within 30 s of vacuum loss (harness actuation)',
          tt >= 0 ? tt.toFixed(1) + 's' : 'never', tt >= 0, 'tripped ≤ 30 s');
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
        im.cmd({ action: 'rod_nudge', group_id: 'control_rods', steps: 40 });
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

    msiv_closure_at_power: function () {
      return test('MSIV closure at power — SG bottles to its safeties, plant stabilizes', function (ck) {
        var h = new Harness('hot_full_power');
        var sg = h.eng.cfg.steam_generator;
        h.run(10);
        h.cmd({ action: 'close_msiv' });
        var t0 = h.ts();
        ck('turbine tripped on isolation', t0.msiv_open === false && h.eng.s.turbine_tripped, h.eng.s.turbine_tripped === true, 'tripped');
        // Bottled SG: pressure climbs past the (isolated) dump toward the safeties.
        var tLift = h.runUntil(function (ts) { return h.eng.s.sg_safety_open; }, 300);
        ck('SG safeties lift', tLift >= 0 ? tLift.toFixed(0) + ' s' : 'never', tLift >= 0, 'within 300 s');
        h.run(120);
        var t = h.ts();
        ck('secondary held in the safety band', t.steam_pressure_mpa.toFixed(2),
          t.steam_pressure_mpa > sg.sg_safety_reseat_mpa - 0.3 && t.steam_pressure_mpa < sg.sg_safety_open_mpa + 0.4,
          (sg.sg_safety_reseat_mpa - 0.3).toFixed(1) + '–' + (sg.sg_safety_open_mpa + 0.4).toFixed(1) + ' MPa');
        ck('no steam past the MSIV', t.steam_flow_normalized.toFixed(3), t.steam_flow_normalized === 0, '0');
        // The main feed pumps are steam-driven off the line downstream of the
        // MSIV (feel-plan P4) — closing it starves them, so the SG DRAINS while
        // the safeties keep drawing. (In the assembled stack the low-SG trip
        // then scrams the plant; the engine alone finds the relief-fed
        // equilibrium — physics, not protection.)
        ck('SG draining toward the level trip (feed pumps starved)', t.sg_level_pct.toFixed(1), t.sg_level_pct < 55, '< 55 % and falling');
        ck('fuel intact', String(t.melted), t.melted === false, 'false');
        // Reopen: the dump path is live again (relief no longer alone).
        h.cmd({ action: 'open_msiv' });
        h.run(60);
        ck('reopen restores the dump path', h.eng.s.steam_dump_frac.toFixed(3), h.eng.s.steam_dump_frac > 0, '> 0');
      });
    },

    merged_injection_curve: function () {
      return test('Merged HPI/LPI — two-segment injection curve', function (ck) {
        var h = new Harness('hot_full_power');
        var e = h.eng.cfg.emergency;
        var rated = e.hpi_flow_max + e.lpi_flow_max * e.lpi_inventory_gain;
        var s = h.eng.s;
        // At operating pressure with injection OFF: zero.
        ck('off → no flow', s.hpi_flow_normalized.toFixed(4), s.hpi_flow_normalized === 0, '0');
        // High-head-only regime (TMI pressures): identical to the old standalone
        // HPI — the low-head segment shuts off above 4.5 MPa.
        h.cmd({ action: 'set_hpi', active: true });
        // Injection now works against the COLD-LEG node (pump discharge), so the
        // expectation reads the p_coldleg the step actually produced, not pressure_mpa.
        s.pressure_mpa = 8.0; h.eng.step(0.02);
        var expectHH = e.hpi_flow_max * (e.hpi_pressure_ref - s.p_coldleg) / e.hpi_pressure_ref / rated;
        ck('8 MPa (cold leg) → high-head only', s.hpi_flow_normalized.toFixed(4), near(s.hpi_flow_normalized, expectHH, 0.01), expectHH.toFixed(4) + ' ±0.01');
        // Low-head regime: combined flow approaches rated as pressure → 0.
        s.pressure_mpa = 1.0; h.eng.step(0.02);
        ck('1 MPa → low-head dominates', s.hpi_flow_normalized.toFixed(3), s.hpi_flow_normalized > 0.7, '>0.7 of combined rated');
        // The set_lpi alias drives the same merged system.
        h.cmd({ action: 'set_hpi', active: false });
        h.cmd({ action: 'set_lpi', active: true });
        ck('set_lpi alias → hpi_active', h.eng.s.hpi_active, h.eng.s.hpi_active === true, 'true');
        // degraded_hpi scales the whole curve.
        h.cmd({ action: 'inject_failure', failure_id: 'degraded_hpi', severity: 0.5 });
        h.eng.step(0.02);
        var pc = s.p_coldleg;
        var full = e.lpi_flow_max * e.lpi_inventory_gain * (e.lpi_pressure_ref - pc) / e.lpi_pressure_ref
                 + e.hpi_flow_max * (e.hpi_pressure_ref - pc) / e.hpi_pressure_ref;
        ck('degraded_hpi scales the combined curve', s.hpi_flow_normalized.toFixed(3),
          near(s.hpi_flow_normalized, 0.5 * full / rated, 0.02), (0.5 * full / rated).toFixed(3) + ' ±0.02');
      });
    },

    rhr_valve_and_mode: function () {
      return test('RHR hot-leg valve interlock, HX split, ECCS mode', function (ck) {
        var h = new Harness('hot_full_power');
        var s = h.eng.s;
        // Interlock: the open is refused above the 400 psi (2.76 MPa) interlock.
        h.cmd({ action: 'set_rhr', active: true });
        ck('open refused above interlock', s.rhr_valve_open, s.rhr_valve_open === false, 'false');
        // Below the interlock the valve opens, RHR aligns, mode reads RHR.
        s.pressure_mpa = 2.0; h.cmd({ action: 'set_rhr', active: true }); h.eng.step(0.02);
        ck('valve opens below interlock', s.rhr_valve_open, s.rhr_valve_open === true, 'true');
        ck('rhr_active mirrors the valve', s.rhr_active, s.rhr_active === true, 'true');
        ck('ECCS mode = RHR when valve open', s.eccs_mode, s.eccs_mode === 'RHR', 'RHR');
        // Autoclosure: a repressurization above the interlock shuts the valve.
        s.pressure_mpa = 5.0; h.eng.step(0.02);
        ck('valve auto-closes on repressurization', s.rhr_valve_open, s.rhr_valve_open === false, 'false');
        // HX flow split scales heat removal — compare °C removed over one 1 s step
        // at full vs. quarter split from two identical fresh plants.
        function cooldownOverStep(frac) {
          var hh = new Harness('hot_full_power'), ss = hh.eng.s;
          ss.pressure_mpa = 2.0; ss.tavg_c = 150; ss.condenser_cooling_available = true;
          hh.cmd({ action: 'set_rhr', active: true });
          hh.cmd({ action: 'set_rhr_hx', fraction: frac });
          var before = ss.tavg_c; hh.eng.step(1.0); return before - ss.tavg_c;
        }
        var dFull = cooldownOverStep(1.0), dQuarter = cooldownOverStep(0.25);
        ck('more HX flow removes more heat', dFull.toFixed(3) + ' vs ' + dQuarter.toFixed(3),
          dFull > dQuarter, 'full > quarter');
        // With the valve shut, mode reflects HPI vs LPI by pressure regime.
        h.cmd({ action: 'set_rhr', active: false });
        h.cmd({ action: 'set_hpi', active: true });
        s.pressure_mpa = 8.0; h.eng.step(0.02);
        ck('HPI mode above the LPI shutoff head', s.eccs_mode, s.eccs_mode === 'HPI', 'HPI');
        s.pressure_mpa = 2.0; h.eng.step(0.02);
        ck('LPI mode in the low-head regime', s.eccs_mode, s.eccs_mode === 'LPI', 'LPI');
      });
    },

    rcp_cavitation: function () {
      return test('RCP cavitation — suction voiding degrades pump flow', function (ck) {
        var h = new Harness('hot_full_power');
        h.run(10);
        var t0 = h.ts();
        // Steady full power: the suction node is deeply subcooled — no cavitation.
        ck('no cavitation at steady full power', t0.rcp_cavitating, t0.rcp_cavitating === false, 'false');
        ck('healthy suction subcooling', t0.suction_subcool_c.toFixed(0), t0.suction_subcool_c > 20, '> 20 °C');
        ck('flow at rated', t0.pump_flow_pct.toFixed(0), near(t0.pump_flow_pct, 100, 1), '~100 %');
        // Depressurize the hot RCS (hold it low via the setpoint so it can't recover):
        // the suction node reaches saturation and the running pump cavitates.
        h.cmd({ action: 'set_pressure_setpoint', mpa: 8.0 });
        h.eng.s.pressure_mpa = 8.0;
        h.run(15);
        var t = h.ts();
        ck('suction subcooling collapsed past onset', t.suction_subcool_c.toFixed(1), t.suction_subcool_c < 8, '< 8 °C (onset)');
        ck('RCP cavitating', t.rcp_cavitating, t.rcp_cavitating === true, 'true');
        ck('cavitation severity high', t.rcp_cavitation_frac.toFixed(2), t.rcp_cavitation_frac > 0.5, '> 0.5');
        ck('delivered flow degraded below rated', t.pump_flow_pct.toFixed(0), t.pump_flow_pct < 80, '< 80 %');
        // A stopped pump cannot cavitate (the effect is gated on pump_running).
        h.cmd({ action: 'inject_failure', failure_id: 'rcp_trip' });
        h.run(20);
        ck('stopped pump does not cavitate', h.ts().rcp_cavitating, h.ts().rcp_cavitating === false, 'false');
      });
    },

    // Borated emergency injection: HPI/LPI and the accumulators carry heavily
    // borated RWST/SIT water (eccs_boron_ppm), which mixes into the core boron and
    // adds negative reactivity — the ECCS shutdown-margin role during a LOCA. Guards
    // pwr_primary.stepInventory's perfect-mixing transport.
    eccs_boration: function () {
      return test('Borated ECCS injection — HPI/accumulators raise core boron', function (ck) {
        var C = new Harness('hot_full_power').eng.cfg.emergency.eccs_boron_ppm;
        // (A) SGTR with safety injection: core boron rises toward the RWST source.
        // (sgtr, not the large break: at SGTR pressures the accumulators stay
        // shut, so the boron seen is the HPI/RWST path alone. The original test
        // injected the nonexistent id 'primary_leak' — an EFFECT name — which
        // silently no-opped, so its "LOCA" never ran; inject_failure now errors
        // on unknown ids, see the leak-check below.)
        var h = new Harness('hot_full_power'); h.run(10);
        var b0 = h.ts().boron_ppm;
        h.cmd({ action: 'scram' });
        var rInj = h.cmd({ action: 'inject_failure', failure_id: 'sgtr', severity: 1.0 });
        ck('failure accepted (real id) and leaking', (rInj == null) + '/' + (h.eng.s.leak_flow > 0),
          rInj == null && h.eng.s.leak_flow > 0, 'true/true');
        h.cmd({ action: 'set_hpi', active: true });
        h.run(200);
        var b1 = h.ts().boron_ppm;
        ck('HPI injection raises core boron', b0.toFixed(0) + ' → ' + b1.toFixed(0), b1 > b0 + 200, '> baseline + 200 ppm');
        ck('boron never overshoots the ECCS source', b1.toFixed(0), b1 <= C + 1, '≤ ' + C + ' ppm');
        // (B) Control: the same leak with NO injection leaves boron unchanged
        // (mass-only losses leave at the current concentration; accumulators
        // stay isolated above their 4.14 MPa arming pressure).
        var h2 = new Harness('hot_full_power'); h2.run(10);
        var c0 = h2.ts().boron_ppm;
        h2.cmd({ action: 'scram' });
        h2.cmd({ action: 'inject_failure', failure_id: 'sgtr', severity: 1.0 });
        h2.run(200);
        ck('no injection → boron unchanged', c0.toFixed(1) + ' → ' + h2.ts().boron_ppm.toFixed(1),
          near(h2.ts().boron_ppm, c0, 1.0), c0.toFixed(1) + ' ±1');
        ck('control actually lost inventory (leak is real)', h2.eng.s._mass.toFixed(3),
          h2.eng.s._mass < 0.995, '< 0.995');
        // Unknown ids are rejected loudly — the API softness that let the old
        // tautology pass for months.
        var rBad = h2.cmd({ action: 'inject_failure', failure_id: 'primary_leak' });
        ck('unknown failure_id is a COMMAND_ERROR', rBad && rBad.code, !!(rBad && rBad.code === 'COMMAND_ERROR'), 'COMMAND_ERROR');
        // (C) Accumulator discharge also borates. Unit-test the mixing path directly
        // (accumulators only arm at low pressure, awkward to reach through the full
        // pressure model) with a crafted low-pressure state.
        var cfg = new Harness('hot_full_power').eng.cfg;
        var s = { pressure_mpa: 0.8, p_coldleg: 0.8, tavg_c: 120, _subcool_hot_c: 5,
          _mass: 0.6, boron_ppm: 800, hpi_active: false, cvcs_auto: false,
          charging_pump_running: false, charging_setpoint: 0, charging_flow: 0,
          letdown_orifice_a: false, letdown_orifice_b: false,
          porv_flow: 0, safety_flow: 0, leak_flow: 0, core_void_fraction: 0,
          _accum_remaining: cfg.emergency.accumulator_capacity };
        for (var i = 0; i < 10; i++) RD.pwrPrimary.stepInventory(s, cfg, 0.5);
        ck('accumulators discharge at low pressure', s.accumulators_discharging, s.accumulators_discharging === true, 'true');
        ck('accumulator injection borates the core', '800 → ' + s.boron_ppm.toFixed(0), s.boron_ppm > 850, '> 850 ppm');
      });
    },

    // Cold-injection quench + accumulator isolation valve. (A) HPI/LPI/accumulator water
    // enters below Tavg and removes sensible heat (pwr_thermal.stepCoolant's mixing term,
    // driven by the throughput stashed in stepInventory). (B) The motor-operated discharge
    // isolation valve hard-gates accumulator flow, so a cooldown can depressurize below the
    // check-valve setpoint without a spurious dump.
    eccs_cold_injection: function () {
      return test('ECCS cold-injection quench + accumulator isolation valve', function (ck) {
        var cfg = new Harness('hot_full_power').eng.cfg;
        var e = cfg.emergency;
        // (A) Two identical HOT coolant states through stepCoolant — one with injection
        // throughput, one without. flow_frac 0 and matched temps zero every other term,
        // so the difference isolates the cold-injection quench exactly.
        function craft(qinj) {
          return { fuel_temp_c: 300, tavg_c: 300, _h_fc_eff: cfg.thermal.h_fc,
            t_secondary_c: 300, flow_frac: 0, power_pct: 0, pressure_mpa: 2.0,
            rhr_active: false, condenser_cooling_available: false, _eccs_inj_inv: qinj };
        }
        var hot = craft(0.2), ctl = craft(0);
        RD.pwrThermal.stepCoolant(hot, cfg, 1.0);
        RD.pwrThermal.stepCoolant(ctl, cfg, 1.0);
        ck('injection cools the coolant node', ctl.tavg_c.toFixed(2) + ' → ' + hot.tavg_c.toFixed(2),
          hot.tavg_c < ctl.tavg_c - 1, 'injecting state cooler');
        var expected = e.eccs_cooling_gain * 0.2 * (e.eccs_temp_c - 300);   // °C over dt = 1 s
        ck('quench matches the mixing rate', (hot.tavg_c - ctl.tavg_c).toFixed(2),
          near(hot.tavg_c - ctl.tavg_c, expected, 0.5), expected.toFixed(2) + ' °C');
        ck('no injection → no quench', ctl.tavg_c.toFixed(2), near(ctl.tavg_c, 300, 1e-6), '300 (unchanged)');
        // Self-limiting: with every other term zeroed (no fuel coupling), sustained
        // injection pulls Tavg toward — but never past — the RWST/SIT temperature.
        var deep = craft(1.0); deep.tavg_c = e.eccs_temp_c + 5; deep.fuel_temp_c = e.eccs_temp_c; deep._h_fc_eff = 0;
        for (var i = 0; i < 50; i++) RD.pwrThermal.stepCoolant(deep, cfg, 1.0);
        ck('quench cannot undershoot the RWST temperature', deep.tavg_c.toFixed(1),
          deep.tavg_c >= e.eccs_temp_c - 0.5, '≥ ' + e.eccs_temp_c + ' °C');

        // (B) Accumulator isolation valve: below the check-valve setpoint the aligned
        // accumulators discharge; with the valve shut nothing flows at any pressure.
        function accumState(valveOpen) {
          return { pressure_mpa: 0.8, p_coldleg: 0.8, tavg_c: 120, _subcool_hot_c: 5,
            _mass: 0.6, boron_ppm: 800, hpi_active: false, cvcs_auto: false,
            charging_pump_running: false, charging_setpoint: 0, charging_flow: 0,
            letdown_orifice_a: false, letdown_orifice_b: false,
            porv_flow: 0, safety_flow: 0, leak_flow: 0, core_void_fraction: 0,
            accumulator_valve_open: valveOpen,
            _accum_remaining: cfg.emergency.accumulator_capacity };
        }
        var open = accumState(true), shut = accumState(false);
        for (var j = 0; j < 10; j++) { RD.pwrPrimary.stepInventory(open, cfg, 0.5); RD.pwrPrimary.stepInventory(shut, cfg, 0.5); }
        ck('aligned accumulators discharge below the setpoint', open.accumulators_discharging, open.accumulators_discharging === true, 'true');
        ck('isolated accumulators do not discharge', shut.accumulators_discharging, shut.accumulators_discharging === false, 'false');
        ck('isolation valve preserves the full tank', shut.accumulator_volume_pct.toFixed(1), near(shut.accumulator_volume_pct, 100, 0.1), '100 %');
        ck('isolation valve blocks boration', shut.boron_ppm.toFixed(1), near(shut.boron_ppm, 800, 0.5), '800 ppm (unchanged)');
      });
    },

    // Loop pressure distribution: one dynamic pressure state (pressurizer/hot-leg
    // reference) plus a quasi-static ΔP field. Guards computeNodePressures — every
    // loop-tied system (ECCS/accumulators/letdown on the cold leg, RHR on the hot
    // leg, cavitation on the suction) reads these nodes, so the invariant is shared.
    loop_pressure_nodes: function () {
      return test('Loop pressure distribution — node ordering, flow² scaling, coastdown collapse', function (ck) {
        var h = new Harness('hot_full_power'); h.run(10);
        var s = h.eng.s, pr = h.eng.cfg.primary, ff2 = s.flow_frac * s.flow_frac;
        // At power the pump discharge (cold leg) is the highest node and the suction
        // (between SG and RCP) the lowest; the hot leg is the pressurizer reference.
        ck('cold leg is the highest node', s.p_coldleg.toFixed(3) + ' > ' + s.p_hotleg.toFixed(3), s.p_coldleg > s.p_hotleg, 'cold > hot');
        ck('suction is the lowest node', s.p_pumpsuction.toFixed(3) + ' < ' + s.p_hotleg.toFixed(3), s.p_pumpsuction < s.p_hotleg, 'suction < hot');
        ck('hot leg = the pressurizer reference', s.p_hotleg.toFixed(4), near(s.p_hotleg, s.pressure_mpa, 1e-6), s.pressure_mpa.toFixed(4));
        // Offsets scale with flow_frac²; at (near) rated flow they equal the config ΔP.
        ck('cold-leg offset = core ΔP · flow²', (s.p_coldleg - s.pressure_mpa).toFixed(4),
          near(s.p_coldleg - s.pressure_mpa, pr.loop_dp_core_rated * ff2, 1e-3), (pr.loop_dp_core_rated * ff2).toFixed(4));
        ck('suction offset = SG ΔP · flow²', (s.pressure_mpa - s.p_pumpsuction).toFixed(4),
          near(s.pressure_mpa - s.p_pumpsuction, pr.loop_dp_sg_rated * ff2, 1e-3), (pr.loop_dp_sg_rated * ff2).toFixed(4));
        // Coastdown: trip the pumps, flow decays to natural circulation (v1 = 0), and
        // the three nodes collapse onto the single pressure state.
        h.cmd({ action: 'inject_failure', failure_id: 'rcp_trip' });
        h.run(120);
        var s2 = h.eng.s;
        ck('flow decayed off rated', s2.flow_frac.toFixed(3), s2.flow_frac < 0.2, '< 0.2');
        ck('nodes collapse to one pressure on coastdown',
          'Δcold=' + (s2.p_coldleg - s2.pressure_mpa).toFixed(3) + ' Δsuc=' + (s2.pressure_mpa - s2.p_pumpsuction).toFixed(3),
          near(s2.p_coldleg, s2.pressure_mpa, 0.05) && near(s2.p_pumpsuction, s2.pressure_mpa, 0.05), 'both ≈ pressure_mpa');
      });
    },

    // Two-orifice letdown: a pressure-driven bleed from the cold-leg node through the
    // in-service orifice(s). Guards pwr_primary.letdownFlow (the √ΔP flow law and the
    // four-state lineup) and the deprecated set_letdown_flow alias.
    letdown_orifice_lineup: function () {
      return test('Two-orifice letdown — pressure-driven lineup, tail-off, alias', function (ck) {
        var h = new Harness('hot_full_power'); h.run(5);
        var s = h.eng.s;
        function lineup(a, b) { h.cmd({ action: 'set_letdown_orifices', a: a, b: b }); h.eng.step(0.02); return s.letdown_flow; }
        var off = lineup(false, false), A = lineup(true, false), B = lineup(false, true), AB = lineup(true, true);
        ck('off → no letdown', off.toFixed(4), off === 0, '0');
        ck('A orifice ≈ 3% of rated', A.toFixed(4), near(A, 0.030, 0.004), '0.030 ±0.004');
        ck('B orifice ≈ 4% (larger than A)', B.toFixed(4), near(B, 0.040, 0.004) && B > A, '0.040 ±0.004, > A');
        ck('A+B lineup = sum of both orifices', AB.toFixed(4), near(AB, A + B, 1e-4), (A + B).toFixed(4));
        ck('A+B (≈7%) is a net drain vs nominal charging (6%)', AB.toFixed(4), AB > 0.06, '> 0.06');
        // Pressure-driven: flow ∝ √(p_coldleg − backpressure), so it tails off as RCS
        // pressure falls toward the backpressure setpoint on a cooldown.
        h.cmd({ action: 'set_letdown_orifices', a: true, b: true });
        h.eng.s.pressure_mpa = 15.41; h.eng.step(0.02); var hi = s.letdown_flow;
        h.eng.s.pressure_mpa = 5.0;   h.eng.step(0.02); var lo = s.letdown_flow;
        ck('letdown tails off as RCS pressure falls', lo.toFixed(4) + ' < ' + hi.toFixed(4), lo < hi && lo > 0, 'lo < hi');
        // Deprecated alias maps a requested normalized flow to the nearest lineup.
        h.cmd({ action: 'set_letdown_flow', normalized: 0.0 });
        ck('alias 0.0 → both orifices shut', !s.letdown_orifice_a && !s.letdown_orifice_b, !s.letdown_orifice_a && !s.letdown_orifice_b, 'off');
        h.cmd({ action: 'set_letdown_flow', normalized: 0.07 });
        ck('alias 0.07 → both orifices open', s.letdown_orifice_a && s.letdown_orifice_b, s.letdown_orifice_a && s.letdown_orifice_b, 'A+B');
      });
    },

    // Save-format migration: a save written before the recent reworks must load and
    // gain the new fields with their documented defaults. Guards _migrateState — the
    // save contract (README DoD: old saves must still migrate).
    save_migration: function () {
      return test('Save migration — legacy saves gain new fields with documented defaults', function (ck) {
        var h = new Harness('hot_full_power'); h.run(5);
        var save = h.eng.saveState();
        // Simulate a PRE-rework save: strip the fields added since and restore the old
        // shapes — a commanded letdown_flow constant and the split lpi_active flag.
        var legacy = save.s;
        delete legacy.pressure_setpoint; delete legacy.steam_dump_setpoint;
        delete legacy.letdown_orifice_a; delete legacy.letdown_orifice_b;
        delete legacy.p_coldleg; delete legacy.p_hotleg; delete legacy.p_pumpsuction;
        delete legacy.rhr_valve_open; delete legacy.eccs_mode;
        delete legacy.hpi_active; legacy.lpi_active = true;   // old split-flag form → hpi
        legacy.letdown_flow = 0.030;                          // old commanded constant → lineup A
        // Pre-#199 steam break: no location field (the sink ignored the MSIV).
        legacy._fail.steam_break = { active: true, size: 0.4 };
        // Pre-#200 stuck-open spray: encoded as a boolean in the operator's demand field.
        delete legacy.spray_stuck; legacy.spray_override = true;
        // Load into a fresh engine; its cfg supplies the migration defaults.
        var h2 = new Harness('hot_full_power');
        h2.eng.loadState({ schema: save.schema, s: legacy, rod_groups: save.rod_groups,
          active_failures: save.active_failures, instruments: save.instruments, refs: save.refs });
        var s = h2.eng.s, cfg = h2.eng.cfg;
        ck('pressure_setpoint ← NOP default', s.pressure_setpoint,
          s.pressure_setpoint === cfg.pressurizer.P_setpoint, String(cfg.pressurizer.P_setpoint));
        ck('steam_dump_setpoint ← no-load default', s.steam_dump_setpoint,
          s.steam_dump_setpoint === cfg.steam_generator.steam_dump_setpoint, String(cfg.steam_generator.steam_dump_setpoint));
        ck('legacy letdown_flow 0.030 → orifice A only', s.letdown_orifice_a + ' / ' + s.letdown_orifice_b,
          s.letdown_orifice_a === true && s.letdown_orifice_b === false, 'A on / B off');
        ck('lpi_active folds into hpi_active', s.hpi_active + ' / lpi=' + s.lpi_active,
          s.hpi_active === true && s.lpi_active === undefined, 'hpi true, lpi gone');
        var nodesOk = [s.p_coldleg, s.p_hotleg, s.p_pumpsuction].every(function (x) { return typeof x === 'number' && isFinite(x); });
        ck('loop pressure nodes seeded on load', nodesOk, nodesOk, 'all finite');
        ck('legacy steam break gains a location — DOWNSTREAM, so the MSIV now works on it',
          'upstream=' + s._fail.steam_break.upstream + ' size=' + s._fail.steam_break.size,
          s._fail.steam_break.upstream === false && s._fail.steam_break.size === 0.4, 'upstream=false, size kept');
        ck('legacy stuck-open spray survives as a physical flag, demand back to auto',
          'spray_stuck=' + s.spray_stuck + ' override=' + s.spray_override,
          s.spray_stuck === true && s.spray_override === null, 'stuck=true, override=null');
        // A half-migrated state must step cleanly (no NaN leaking from a missing field).
        h2.run(2);
        var t = h2.ts();
        ck('migrated state steps without NaN', isFinite(t.pressure_mpa) && isFinite(t.boron_ppm),
          isFinite(t.pressure_mpa) && isFinite(t.boron_ppm), 'finite');
      });
    },

    // Mode-5 / transition control primitives in isolation (the round-trip test
    // exercises them together; this pins each one's behavior so a regression points
    // at the specific control): the operator pressure setpoint, the lowerable
    // steam-dump setpoint, and RCP start/stop.
    mode5_controls: function () {
      return test('Mode-5 controls — pressure setpoint, RCP start/stop, steam-dump setpoint', function (ck) {
        // (1) set_pressure_setpoint: heaters/spray hold the operator's target.
        var h = new Harness('hot_full_power'); h.run(10);
        var p0 = h.ts().pressure_mpa;
        h.cmd({ action: 'set_pressure_setpoint', mpa: 13.0 });
        h.run(300);
        var p1 = h.ts().pressure_mpa;
        ck('pressure tracks a lowered setpoint', p0.toFixed(2) + ' → ' + p1.toFixed(2),
          p1 < p0 - 1 && near(p1, 13.0, 1.0), '≈ 13.0 (±1)');
        h.cmd({ action: 'set_pressure_setpoint', mpa: 15.41 });
        h.run(300);
        ck('pressure recovers to a raised setpoint', p1.toFixed(2) + ' → ' + h.ts().pressure_mpa.toFixed(2),
          h.ts().pressure_mpa > p1 + 1, '> lowered');

        // (2) set_rcp: stopping the pumps coasts flow down (natural circ = 0 in v1);
        // restarting spins them back up.
        var r = new Harness('hot_full_power'); r.run(10);
        ck('pumps running at power', r.ts().pump_flow_pct.toFixed(0), r.ts().pump_flow_pct > 95, '~100 %');
        r.cmd({ action: 'set_rcp', running: false });
        r.run(60);
        ck('stopping the RCPs coasts flow down', r.ts().pump_flow_pct.toFixed(1), r.ts().pump_flow_pct < 10, '→ ~0 %');
        r.cmd({ action: 'set_rcp', running: true });
        r.run(30);
        ck('restarting the RCPs restores flow', r.ts().pump_flow_pct.toFixed(0), r.ts().pump_flow_pct > 90, '~100 %');

        // (3) set_steam_dump_setpoint: with the turbine offline the SG bottles to the
        // no-load dump target; lowering it cools the secondary and, via the SG, the
        // primary. Scrammed so there is no turbine load fighting the dump.
        var d = new Harness('hot_full_power');
        d.cmd({ action: 'scram' });
        d.cmd({ action: 'disconnect_grid' });
        d.run(60);
        var sp0 = d.ts().steam_pressure_mpa, tavg0 = d.ts().tavg_c;
        d.cmd({ action: 'set_steam_dump_setpoint', mpa: 5.0 });
        d.run(400);
        ck('lowering the steam-dump setpoint cools the secondary',
          sp0.toFixed(2) + ' → ' + d.ts().steam_pressure_mpa.toFixed(2), d.ts().steam_pressure_mpa < sp0 - 0.5, 'steam pressure falls');
        ck('secondary cooldown pulls the primary down too',
          tavg0.toFixed(1) + ' → ' + d.ts().tavg_c.toFixed(1), d.ts().tavg_c < tavg0 - 1, 'tavg falls');
      });
    },

    // CVCS charging/letdown authority over indicated PZR level + AUTO level-hold.
    // Guards the level-control rework: charging raises level, and AUTO make-up holds
    // level against a letdown drain. The TMI void-surge deception (level rises as
    // inventory falls, charging isolated) is guarded separately by flagship_tmi — with
    // DERIVED level the void lift (level_per_void·void_gain) outweighs the mass term.
    cvcs_level_control: function () {
      return test('CVCS — charging controls pzr level; AUTO holds level', function (ck) {
        // (1) Charging has authority over indicated level (the new insurge term).
        var h = new Harness('hot_full_power');
        h.run(20);
        var l0 = h.ts().pzr_level_pct;
        h.cmd({ action: 'set_charging_flow', normalized: 0.06 });   // MANUAL max charging, letdown off
        h.run(60);
        ck('charging raises pzr level', l0.toFixed(1) + ' → ' + h.ts().pzr_level_pct.toFixed(1),
          h.ts().pzr_level_pct > l0 + 3, '> ' + (l0 + 3).toFixed(1));
        // (2) AUTO make-up holds level against a letdown drain (B ≈ 4 %, < charging_max).
        var h2 = new Harness('hot_full_power');
        h2.run(20);
        h2.cmd({ action: 'set_cvcs_auto', active: true });
        h2.cmd({ action: 'set_letdown_orifices', a: false, b: true });
        h2.run(400);
        ck('AUTO holds level near nominal despite letdown', h2.ts().pzr_level_pct.toFixed(1),
          near(h2.ts().pzr_level_pct, 55, 6), '55 ±6');
        ck('AUTO charging modulated up to match the drain', h2.eng.s.charging_flow.toFixed(3),
          h2.eng.s.charging_flow > 0.03, '> 0.03');
        // The TMI void-surge deception (charging isolated → void lift dominates the level)
        // is guarded by flagship_tmi; charging moves level only through the mass balance.
      });
    },

    // Pressure model saturation robustness — spray floor + no impossible superheat.
    // Guards the pressurizer fixes: spray cannot pull pressure below the saturation
    // pressure of the hottest coolant (Psat(Thot), core-exit boiling onset), and the
    // coolant never reports impossible negative subcooling (a liquid cannot superheat).
    pressure_saturation_bounds: function () {
      return test('Pressure — spray floor + holds saturation (no superheat)', function (ck) {
        var h = new Harness('hot_full_power');
        h.cmd({ action: 'set_heater', power_pct: 100 });
        h.cmd({ action: 'set_spray', pct: 100 });
        var pmin = 99, submin = 99;
        for (var i = 0; i < 1200; i++) {
          h.eng.step(0.5);
          if (h.eng.s.pressure_mpa < pmin) pmin = h.eng.s.pressure_mpa;
          var sub = h.ts().subcooling_c;
          if (sub < submin) submin = sub;
        }
        ck('full spray does not crash pressure to the containment floor', pmin.toFixed(2),
          pmin > 6.0, '> 6.0 MPa');
        ck('coolant never impossibly superheats (subcooling bounded)', submin.toFixed(1),
          submin > -5, '> -5 °C');
      });
    },

    // Accumulator arming boundary + break-size discrimination. Pins the restored
    // 4.14 MPa (600 psi) CFT/SIT setpoint (096f574) — the earlier unit tests
    // crafted 0.8 MPa states that passed identically at the stale 1.5 MPa value,
    // so the entire rationale for the restore was unpinned. (A) the boundary
    // itself, (B) the blowdown model's design point: a full SGTR pins the
    // saturation plateau ABOVE the setpoint (tanks stay shut), a large LOCA
    // flash-cools below it (tanks dump).
    accumulator_arming_boundary: function () {
      return test('Accumulators — 4.14 MPa arming boundary + break-size discrimination', function (ck) {
        var cfg = new Harness('hot_full_power').eng.cfg;
        var sp = cfg.emergency.accumulator_trip_mpa;
        ck('config setpoint is the real 600 psi', sp.toFixed(2), near(sp, 4.14, 0.01), '4.14 MPa');
        function craft(p) {
          var s = { pressure_mpa: p, p_coldleg: p, tavg_c: 200, _subcool_hot_c: 5,
            _mass: 0.7, boron_ppm: 800, hpi_active: false, cvcs_auto: false,
            charging_pump_running: false, charging_setpoint: 0, charging_flow: 0,
            letdown_orifice_a: false, letdown_orifice_b: false,
            porv_flow: 0, safety_flow: 0, leak_flow: 0, core_void_fraction: 0,
            _accum_remaining: cfg.emergency.accumulator_capacity };
          for (var i = 0; i < 10; i++) RD.pwrPrimary.stepInventory(s, cfg, 0.5);
          return s;
        }
        var above = craft(sp + 0.3), below = craft(sp - 0.3);
        ck('just ABOVE the setpoint: no discharge', String(above.accumulators_discharging),
          above.accumulators_discharging === false, 'false at ' + (sp + 0.3).toFixed(2));
        ck('just BELOW the setpoint: discharging', String(below.accumulators_discharging),
          below.accumulators_discharging === true, 'true at ' + (sp - 0.3).toFixed(2));
        // (B) Small break: full-severity SGTR, hands off post-scram — the sat
        // plateau holds above the setpoint and the tanks NEVER dump.
        var h = new Harness('hot_full_power'); h.run(10);
        h.cmd({ action: 'scram' });
        h.cmd({ action: 'inject_failure', failure_id: 'sgtr', severity: 1.0 });
        var pminS = 99;
        for (var i = 0; i < Math.round(600 / h.dt); i++) {
          h.eng.step(h.dt);
          if (h.eng.s.pressure_mpa < pminS) pminS = h.eng.s.pressure_mpa;
        }
        ck('SGTR plateau stays above the arming pressure', pminS.toFixed(2), pminS > sp, '> ' + sp);
        ck('SGTR leaves the accumulators full', h.eng.s.accumulator_volume_pct.toFixed(1),
          h.eng.s.accumulator_volume_pct > 99.9, '100%');
        // Large break: blowdown flash-cooling drops the plateau through the
        // setpoint and the tanks dump.
        var h2 = new Harness('hot_full_power'); h2.run(10);
        h2.cmd({ action: 'scram' });
        h2.cmd({ action: 'inject_failure', failure_id: 'large_loca', severity: 1.0 });
        var pminL = 99, dumped = false;
        for (var j = 0; j < Math.round(600 / h2.dt); j++) {
          h2.eng.step(h2.dt);
          if (h2.eng.s.pressure_mpa < pminL) pminL = h2.eng.s.pressure_mpa;
          if (h2.eng.s.accumulators_discharging) dumped = true;
        }
        ck('large LOCA falls below the arming pressure', pminL.toFixed(2), pminL < sp, '< ' + sp);
        ck('large LOCA dumps the accumulators', dumped + '/' + h2.eng.s.accumulator_volume_pct.toFixed(1) + '%',
          dumped === true && h2.eng.s.accumulator_volume_pct < 99, 'discharging, tanks drawn down');
      });
    },

    // Steam-dump capacity cap (e28f7b0): a full-open dump is limited to
    // steam_dump_max (~50% of rated steam flow) on BOTH the manual override and
    // the auto demand — deleting the cap previously failed nothing.
    steam_dump_capacity_cap: function () {
      return test('Steam dump — capacity capped at steam_dump_max on manual full-open', function (ck) {
        var h = new Harness('hot_full_power');
        var cap = h.eng.cfg.steam_generator.steam_dump_max;
        // FG-4 ride-out plant (feel-plan P4): the dump swallows a full load
        // rejection with a small margin — ~105 % of rated steam flow.
        ck('cap is the ride-out capacity (~1.05 of rated)', cap.toFixed(2), cap >= 1.0 && cap <= 1.15, '1.00..1.15');
        h.run(5);
        h.cmd({ action: 'set_steam_dump', mode: 'open' });
        var maxFrac = 0;
        for (var i = 0; i < Math.round(30 / h.dt); i++) {
          h.eng.step(h.dt);
          if (h.eng.s.steam_dump_frac > maxFrac) maxFrac = h.eng.s.steam_dump_frac;
        }
        ck('manual full-open never exceeds the cap', maxFrac.toFixed(3), maxFrac <= cap + 1e-9, '≤ ' + cap);
        // The manual override commands 0..1 of valve travel (1.0 = full open);
        // the 1.05 cap is auto-demand headroom above rated, so full-open flows 1.0.
        ck('dump is actually flowing near rated at full-open', maxFrac.toFixed(3), maxFrac > 0.95, '> 0.95');
      });
    },

    // P-14 main-feedwater isolation (engine surface): the isolate_feedwater
    // command latches feedwater_isolated, which gates MAIN feed only — AFW is
    // added downstream of the gate and keeps feeding (the P-14 design point).
    // The trip/actuation halves live in M4 (ops_pwr ops_sg_overfeed_p14).
    feedwater_isolation: function () {
      return test('P-14 feedwater isolation — main feed gated, AFW passes through', function (ck) {
        var h = new Harness('hot_full_power'); h.run(10);
        var lvl0 = h.ts().sg_level_pct;
        h.cmd({ action: 'isolate_feedwater', active: true });
        ck('isolation latch set', h.eng.s.feedwater_isolated, h.eng.s.feedwater_isolated === true, 'true');
        h.run(8);
        var lvl1 = h.ts().sg_level_pct;
        ck('SG boils down with main feed isolated', lvl0.toFixed(1) + ' → ' + lvl1.toFixed(1),
          lvl1 < lvl0 - 3 && lvl1 > 0, 'falls > 3% (not yet dry)');
        // The full P-14 response: turbine trip + reactor trip (P-9), then AFW
        // carries decay heat — AFW is added DOWNSTREAM of the isolation gate
        // and must still deliver against the latch.
        h.cmd({ action: 'inject_failure', failure_id: 'turbine_trip' });
        h.cmd({ action: 'scram' });
        h.cmd({ action: 'set_afw', active: true });
        // The post-trip cooldown to the (FG-2 program) no-load Tavg ≈ 297 °C dumps the
        // primary's stored sensible heat into the SG: the auto steam dump vents that burst
        // and the narrow SG level dips hard before AFW — added DOWNSTREAM of the isolation
        // gate — arrests the drain and recovers the SG to its regulation band. The point of
        // the test is that AFW keeps delivering THROUGH THE LATCH; the recovery proves it.
        // (Deeper/slower than the pre-program transient, when no-load Tavg ≈ 303 meant almost
        // no post-trip cooldown — a downstream ripple of the Tavg program, catalog §8.1.)
        h.run(600);
        ck('AFW still delivers through the isolation', h.eng.s.afw_flow_normalized.toFixed(3),
          h.eng.s.afw_flow_normalized > 0.02, '> 0.02 (downstream of the gate)');
        var lvl2 = h.ts().sg_level_pct;
        ck('AFW recovers the SG to its regulation band', lvl1.toFixed(1) + ' → ' + lvl2.toFixed(1),
          lvl2 > 18, '> 18% (AFW hold target band)');
        h.cmd({ action: 'isolate_feedwater', active: false });
        ck('operator restore clears the latch', h.eng.s.feedwater_isolated, h.eng.s.feedwater_isolated === false, 'false');
      });
    },
  };

  PWRScenarioTests.runAll = function () {
    var order = ['steady_full_power', 'hot_zero_power_standby', 'steady_50_percent', 'steady_five_percent',
      'cold_shutdown_hold', 'mode5_to_mode1_roundtrip', 'control_response', 'shutdown_scram',
      'load_mode_follow', 'load_above_rated_hold',
      'transient_loss_feedwater', 'transient_rcp_trip', 'transient_turbine_trip',
      'transient_loss_vacuum', 'flagship_tmi', 'physics_failures', 'save_restore',
      'merged_injection_curve', 'rhr_valve_and_mode', 'msiv_closure_at_power', 'rcp_cavitation',
      'eccs_boration', 'eccs_cold_injection', 'loop_pressure_nodes', 'letdown_orifice_lineup', 'save_migration', 'mode5_controls',
      'cvcs_level_control', 'pressure_saturation_bounds', 'feedwater_isolation',
      'accumulator_arming_boundary', 'steam_dump_capacity_cap'];
    var results = [];
    for (var i = 0; i < order.length; i++) results.push(PWRScenarioTests[order[i]]());
    return results;
  };

  RD.PWRScenarioTests = PWRScenarioTests;

})(globalThis.RD || (globalThis.RD = {}));
