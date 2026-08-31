/*
 * pwr_instruments.js — the PWR instrument model (M1 §8), a built-in plant
 * system that sits between true state and what the operator sees. Trips,
 * alarms, gauges, and scenario triggers all read THESE, never true state (HR1).
 *
 * It advances inside the engine step with dt_effective (HR6), so lag is in
 * simulated time and stays correct under time acceleration. Every lag buffer,
 * every active instrument failure, and the noise PRNG state are part of
 * save/restore (§13) — omitting any of them would make a restore diverge.
 *
 * Attaches RD.PWRInstruments.
 */
;(function (RD) {
  'use strict';

  // ---- Seedable PRNG (mulberry32): state is a single uint32, fully saveable --
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clip(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }

  // Local saturation correlation (°C from MPa) — see pwr_thermal.js; duplicated
  // here so the derived subcooling margin has no cross-file load dependency.
  function T_sat(P_MPa) { return 179.47 * Math.pow(Math.max(P_MPa, 1e-6), 0.239); }

  // Mapping of instrument id → true_state field that feeds it. New §8.8 ids are
  // APPENDED (JS preserves key-insertion order): the existing instruments still
  // draw their noise first, so their PRNG sequences are unchanged. Flow sources
  // are the TRUE sim quantities (e.g. charging_flow_actual is 0 with the pump off
  // and the AUTO-modulated value, not the setpoint), so indications ≠ commands.
  var SOURCE = {
    power_range: 'power_pct', tavg: 'tavg_c', thot: 'thot_c', tcold: 'tcold_c',
    primary_pressure: 'pressure_mpa', pzr_level: 'pzr_level_pct', sg_level: 'sg_level_pct',
    steam_flow: 'steam_flow_normalized', fw_flow: 'fw_flow_normalized', mwe_output: 'mwe_output',
    turbine_rpm: 'turbine_rpm', condenser_vacuum: 'condenser_vacuum_kpa',
    charging_flow: 'charging_flow_actual', letdown_flow: 'letdown_flow_actual',
    steam_pressure: 'steam_pressure_mpa', boron_analyzer: 'boron_ppm',
    governor_valve: 'governor_valve_pct',
    hpi_flow: 'hpi_flow_normalized',   // merged HPI/LPI line (renamed in place from lpi_flow — same map position ⇒ PRNG order preserved)
    accumulator_flow: 'accumulator_flow_normalized', steam_dump_valve: 'steam_dump_valve_pct',
    primary_leak_flow: 'leak_flow',
    startup_rate: 'startup_rate_dpm',   // SUR rate meter (appended — PRNG order preserved)
    porv_tailpipe_temp: 'porv_tailpipe_temp_c',   // PORV discharge/quench-tank line temp (appended — PRNG order preserved)
    source_range: 'sr_counts_cps',          // SR proportional counter, cps (log; appended)
    intermediate_range: 'ir_amps',          // IR compensated ion chamber, amps (log; appended last)
    // ECCS/feedwater flow + discharge-pressure sources (appended — PRNG order preserved)
    afw_flow: 'afw_flow_normalized',
    afw_discharge_pressure: 'afw_discharge_pressure_mpa',
    hpi_discharge_pressure: 'hpi_discharge_pressure_mpa',
    condensate_flow: 'condensate_flow_normalized',
    sg_level_wide: 'sg_level_wide_pct',   // whole-vessel wide-range level (appended — PRNG order preserved)
    // TOTAL steam leaving the SG — turbine + steam dump + safeties. `steam_flow`
    // above is the GOVERNOR (turbine) flow only, which is the right signal for
    // load-following consumers (the Tavg program, the rod channel) but wrong for
    // feed regulation: with the turbine offline or tripped the dump carries the
    // steam and `steam_flow` reads ~0 while the generator drains. A real plant
    // measures this in the main steam line, upstream of where the dump taps off,
    // so the transmitter sees everything leaving the SG. Appended — PRNG order
    // preserved. See pwr_steam_generator.js `steam_out_total`.
    sg_steam_flow: 'steam_out_total',
    // Circulating-water inlet temperature — the heat sink the condenser (and the RHR
    // exchanger) has to work against. Appended last, so PRNG order is preserved.
    cw_inlet_temp: 'cw_inlet_temp_c',
    // RCS LOOP FLOW, % of rated — the elbow-tap flow channel that feeds the low-flow
    // reactor trip (#247). Until 2026-07-29 that trip read `pump_flow_pct` out of true
    // state through a `__true_flow__` sentinel, because this instrument did not exist;
    // it was the plant's largest HR1 hole and made the trip unteachable. Appended last,
    // so every instrument above still draws its noise first and the PRNG order of the
    // existing set is unchanged. See pwr_config.js `rcs_flow` for the sourcing.
    rcs_flow: 'pump_flow_pct',
    // DELIVERED pressurizer spray flow, % of maximum (#350 item 1). Appended last, so every
    // instrument above still draws its noise first and the PRNG order of the existing set is
    // unchanged — the same rule sg_steam_flow, cw_inlet_temp and rcs_flow were added under.
    pzr_spray_flow: 'spray_flow_pct',
    // Containment (#386 stage 1): building pressure (ABSOLUTE MPa internally — the
    // board's psig conversion is display), atmosphere temperature, and sump level.
    // Appended LAST, noise: 0 + noise_failure in the specs, same rule as above.
    containment_pressure: 'containment_pressure_mpa',
    containment_temp: 'containment_temp_c',
    containment_sump_level: 'containment_sump_pct',
    // Atmospheric dump valve position, % (#371). Appended last for the same reason
    // as the four above — the PRNG draw order of every existing instrument stays put.
    // MERGE NOTE (2026-08-06): #371 and #386 stage 1 each appended to this tail in
    // their own lane, so both claim to be last. Order between them is arbitrary and
    // costs nothing — all four ship `noise: 0`, and _noise() returns BEFORE drawing
    // when sigma <= 0, so none of them draws from the PRNG stream at all and the
    // existing sequence is byte-identical whichever way round they sit.
    adv_valve: 'adv_valve_pct',
    // Core-exit temperature (#407) — the NUREG-0737 II.F.2 ICC channel. Appended
    // LAST, noise 0 (see the spec comment): PRNG order of everything above is
    // byte-identical, and the subcooling margin below takes max(tavg, this).
    core_exit_temp: 't_core_exit_c',
    // Containment H2 concentration, v/o (#386 stage 3) — the NUREG-0737 II.F.1
    // monitor. Appended LAST, noise 0 + noise_failure, same rule as everything
    // in this tail: no PRNG draw, stream byte-identical.
    ctmt_h2: 'ctmt_h2_pct',
  };

  function PWRInstruments(config, seed) {
    this.cfg = config;
    this.specs = config.instruments;
    // Global scale on indicated noise (config.instrument_noise_scale; default 1). Applied
    // to the per-instrument sigma at read time — halving it cuts gauge jitter in half
    // without touching PRNG draw order (still one draw per instrument), so saves/rewinds
    // and the scenario suite stay deterministic.
    this.noiseScale = (config.instrument_noise_scale != null) ? config.instrument_noise_scale : 1;
    // Default noise correlation time (s). Per-instrument override: spec.noise_tau.
    this.noiseTau = (config.instrument_noise_tau_s != null) ? config.instrument_noise_tau_s : 8;
    this.swell_factor = 0.8; // SG level shrink-and-swell [tune]
    this.defaults = config.physics_failures;
    this.seed = (seed >>> 0) || 0x9E3779B9;
    this._rng = mulberry32(this.seed);
    this._rngState = this.seed;
    this.lagged = {};   // first-order lag buffers, per id
    this.reading = {};  // final indicated values, per id (what the UI/M4 read)
    this.failed = {};   // active instrument failures, per id
    this._noiseState = {};  // AR(1) noise walk, per id (see _noise)
  }

  // Box-Muller using the saveable PRNG; advances and records the state each draw.
  PWRInstruments.prototype._gauss = function (mean, sigma) {
    if (sigma <= 0) return mean;
    // Re-derive the generator from the recorded state so save/restore is exact.
    var u1 = this._draw(), u2 = this._draw();
    if (u1 < 1e-12) u1 = 1e-12;
    return mean + sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };
  PWRInstruments.prototype._draw = function () {
    // Advance mulberry32 by one step on the explicit saved state.
    var a = this._rngState | 0;
    a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    this._rngState = a >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // ---------------------------------------------------------------------------
  // INSTRUMENT NOISE (#233) — two properties, both about how the board FEELS.
  //
  // 1. It DRIFTS. White noise re-drawn every step made every reading jump the full
  //    width of its band between samples: an instant bam-bam from limit to limit,
  //    which reads twitchy rather than alive. Real transmitter noise is band-limited
  //    — it wanders. This is an AR(1) / Ornstein-Uhlenbeck walk with correlation time
  //    `noise_tau` seconds. It leaves the STATIONARY sigma exactly as configured, so
  //    every amplitude decision in pwr_config still means what it says; it only slows
  //    how fast the reading crosses that band.
  //
  // 2. It SCALES WITH SIGNAL where zero means off. A constant absolute sigma made a
  //    secured pump's flow indication wander around ±1 gpm instead of sitting on zero,
  //    which is the single biggest source of "everything on this board twitches".
  //    `noise_ref` = the reading at which the FULL sigma applies; below it the sigma
  //    tapers linearly to nothing, so a process that is genuinely off indicates a
  //    still zero. This is the signal-dependent model the #217 note asked for, and it
  //    is why power_range can now be quiet at 1 % and lively at 100 % with one number.
  //
  // PRNG SAFETY: the draw is taken at the FULL configured sigma and scaled afterwards,
  // never by passing a smaller sigma to _gauss. _gauss returns without drawing when
  // sigma <= 0, so scaling the sigma would change the DRAW COUNT as a pump started and
  // stopped, and the instrument PRNG is one continuous cross-step stream — every
  // downstream instrument's noise would shift mid-run. One _gauss (two draws) per
  // instrument per step, exactly as before.
  // ---------------------------------------------------------------------------
  PWRInstruments.prototype._noise = function (id, spec, dt, trueVal) {
    var sigma = spec.noise * this.noiseScale;
    if (!(sigma > 0)) return 0;                       // no draw — matches the old behaviour
    var raw = this._gauss(0, sigma);
    var tau = spec.noise_tau != null ? spec.noise_tau : this.noiseTau;
    var prev = this._noiseState[id] || 0;
    var n;
    if (tau > 0 && dt > 0) {
      // rho = exp(-dt/tau); the sqrt(1-rho^2) factor is what holds the stationary
      // sigma at `sigma` instead of letting the walk shrink toward zero.
      var rho = Math.exp(-dt / tau);
      n = rho * prev + Math.sqrt(Math.max(0, 1 - rho * rho)) * raw;
    } else {
      n = raw;
    }
    this._noiseState[id] = n;
    // Signal taper. Applied to the OUTPUT, not the sigma (see PRNG SAFETY above).
    if (spec.noise_ref > 0) {
      var f = Math.abs(trueVal) / spec.noise_ref;
      n *= (f < 0 ? 0 : f > 1 ? 1 : f);
    }
    return n;
  };

  // Initialize every reading to the (noise-free) true value — no startup transient.
  // Log instruments (spec.log — the source/intermediate-range nuclear detectors)
  // keep their LAG BUFFER in log10 domain, so lag and noise act per decade.
  PWRInstruments.prototype.reset = function (trueState, extras) {
    this.lagged = {}; this.reading = {}; this.failed = {}; this._noiseState = {};
    for (var id in SOURCE) {
      var v = trueState[SOURCE[id]];
      var spec = this.specs[id];
      this.lagged[id] = (spec && spec.log) ? Math.log10(Math.max(v, spec.range[0])) : v;
      this.reading[id] = (spec && spec.log) ? clip(v, spec.range[0], spec.range[1]) : v;
    }
    this.reading.porv_indicator = (extras && extras.porv_commanded_open) ? 'open' : 'closed';
    this.reading.subcooling_margin = T_sat(this.reading.primary_pressure) - this.reading.tavg;
    this.reading.pzr_level_dev = this._levelDev(extras);
    this.reading.rod_limit_margin = this._rodLimitMargin(extras);
    this._deltaTChannels(extras);
    if (this.specs.tavg_rate) this.reading.tavg_rate = 0;   // #375: a fresh plant has no trend
    this._copyStatus(extras);
  };

  // Steps of control-bank travel remaining above the rod insertion limit (#306). A
  // passthrough of the engine's own subtraction rather than a second computation of it —
  // `insertion_limit_steps` is power-dependent and re-derived every tick, and a copy here
  // would be a second place for the RIL curve to live. Clipped to the declared range so a
  // fine-step retune cannot push the reading past its own instrument span.
  PWRInstruments.prototype._rodLimitMargin = function (extras) {
    var sp = this.specs.rod_limit_margin, v = (extras || {}).rod_limit_margin;
    if (v == null || !isFinite(v)) return sp.range[1];
    return clip(v, sp.range[0], sp.range[1]);
  };

  // Pressurizer level deviation from PROGRAM (#262), in % of span. Derived from the
  // INDICATED level and the INDICATED Tavg, so it inherits their lag and any failure on
  // them — a stuck Tavg transmitter corrupts the program here exactly as it would on a
  // real board. Same construction as subcooling_margin, for the same HR1 reason.
  //
  // Calls the plant's OWN levelBase() rather than restating the program line: the two must
  // not be able to drift apart, and this file already carries one deliberate formula
  // duplication (T_sat) which is enough. `tavg_fp` is the full-power Tavg the program is
  // anchored to — computed at init rather than a config constant, so the engine stashes it
  // on state and hands it over in extras.
  PWRInstruments.prototype._levelDev = function (extras) {
    // levelPROGRAM, not levelBase (#289): above the program ceiling the two are different
    // lines on purpose, and this gauge reports the CONTROL deviation — level against what the
    // CVCS is holding it to. Reading the physics line here would peg PZR LVL DEV LO at ~−39 %
    // for the whole of a load rejection while the controller sat exactly on its setpoint.
    // A host plant may hand in ITS OWN program line (extras.level_program_fn, %-returning):
    // the PWR2 shell reuses this layer over a plant whose program is a different sourced
    // line, and measuring its level against THIS plant's program read a standing +6.4 %
    // deviation on a plant sitting exactly on its own program. HR1 is kept either way — the
    // program is still evaluated at the INDICATED Tavg, so a stuck transmitter corrupts it
    // here exactly as before. The current engine passes nothing and is unchanged.
    var exFn = (extras || {}).level_program_fn;
    var lb = RD.pwrPressurizer && RD.pwrPressurizer.levelProgram;
    if (!exFn && !lb) return 0;
    var prog = exFn ? exFn(this.reading.tavg)
                    : lb({ tavg_c: this.reading.tavg, _tavg_fp: (extras || {}).tavg_fp }, this.cfg);
    var spec = this.specs.pzr_level_dev, dev = this.reading.pzr_level - prog;
    return spec ? clip(dev, spec.range[0], spec.range[1]) : dev;
  };

  // ---------------------------------------------------------------------------
  // OTΔT / OPΔT protection channels (#311). Five derived readings, all in % OF
  // RATED ΔT, computed from INDICATED thot/tcold/tavg/primary_pressure — so each
  // inherits those channels' lag and any injected failure. Same construction as
  // subcooling_margin and pzr_level_dev, for the same HR1 reason: a real
  // protection rack computes this setpoint from transmitters, and a drifting Tavg
  // transmitter moves the trip line. That is the teaching case, not a defect.
  //
  //   OTΔT_sp = 100 · f · 2·( T_sat(P) − dnb_margin_c − Tavg ) / ΔT₀
  //   OPΔT_sp = 100 · ( K4 − K6·max(0, Tavg − T″) )
  //   margin  = setpoint − loop ΔT      (trip low at 0; rod stop low at 3)
  //
  // OTΔT reads the ENGINE'S OWN DNB criterion, scaled by the margin factor — it is
  // not a linearization with stored K1/K2/K3, and that is deliberate. Writing the
  // gradients down would put this plant's DNB physics in a second place, where a
  // retune of `dnb_margin_c` or `delta_T_rated` would silently leave the trip line
  // behind. Computing it here means the limit line tracks the physics it limits.
  // The equivalent K1/K2/K3 (for comparison with published real values) are worked
  // out in the `otdt_opdt` block comment in pwr_config.js.
  //
  // T_sat is the same correlation the thermal model uses — already duplicated at the
  // top of this file for the subcooling margin, for the same no-cross-file-dependency
  // reason, so this adds no new copy.
  // ---------------------------------------------------------------------------
  PWRInstruments.prototype._deltaTChannels = function (extras) {
    var o = this.cfg.otdt_opdt, sp = this.specs;
    if (!o || !sp.loop_delta_t) return;
    var ex = extras || {};
    /* THE RUNNING PLANT'S OWN SETPOINT EQUATION, when it supplies one (#561).
     *
     * This layer is REUSED by both engines (D4), and its delta-T channels were fitted to the
     * retired thermal model: rated loop delta-T 33.0 degC, DNB margin 8.0 degC and margin factor
     * 0.60 (both [tune]/UNVERIFIED), against a local saturation correlation. PWR2's rated split
     * is 31.1 degC (56 degF) and its overtemperature/overpower TRIPS use the sourced Ginna UFSAR
     * Table 15.0-7 coefficients — so the gauge and the trip disagreed in LEVEL and in PRESSURE
     * SENSITIVITY at once. MEASURED on a 1,240 s depressurization at full power: the tile went
     * RED at t = 616 s with the plant's own overtemperature margin still +13.70 %, and the trip
     * did not arrive until t = 972 s — 356 s later — while the "OTdT ROD STOP" annunciator, which
     * reads this same channel, latched 436 s early.
     *
     * A CONSTANT SWAP WOULD NOT HAVE FIXED IT: the two sides differ in equation FORM. The one
     * below is a DNB surface, 0.6*2*(T_sat(P) - 8 degC - Tavg)/33.0; the sourced trip is
     * k1 + k2*(P - P') - k3*(T - T'). So the plant passes its own form through, the same way
     * `tavg_fp` and the pressurizer level program already ride this dict — one supplier, no
     * second copy. Absent it, every line below is byte-identical to what it always was.
     *
     * HR1 is unchanged: the form is fed the INDICATED Tavg and pressure, so the gauge still shows
     * what the operator's instruments say, not what the plant is. The declared lead/lag
     * compensation gap (and OP's K5 rate term, which lives in the COLR) belongs to the TRIP
     * channel and is a different, still-open item. */
    var form = ex.otdt_form;
    var dt0 = (form && form.delta_t_rated_c) || this.cfg.thermal.delta_T_rated;   // °C at rated
    var Tpp = ex.tavg_fp;                                     // T″ = full-power Tavg (OPΔT only)
    if (Tpp == null) Tpp = this.reading.tavg;                  // pre-init fallback: zero penalty
    var T = this.reading.tavg, P = this.reading.primary_pressure;
    var dT = 100 * (this.reading.thot - this.reading.tcold) / dt0;
    // This plant's DNB-limiting ΔT at the INDICATED T and P, scaled by the margin factor.
    var ot = (form && form.otSp)
      ? 100 * form.otSp(T, P)
      : 100 * o.dnb_margin_factor * 2 * (T_sat(P) - this.cfg.thermal.dnb_margin_c - T) / dt0;
    var op = (form && form.opSp)
      ? 100 * form.opSp(T)
      : 100 * (o.K4 - (o.K6_per_c || 0) * Math.max(0, T - Tpp));
    this.reading.loop_delta_t  = clip(dT, sp.loop_delta_t.range[0], sp.loop_delta_t.range[1]);
    this.reading.otdt_setpoint = clip(ot, sp.otdt_setpoint.range[0], sp.otdt_setpoint.range[1]);
    this.reading.opdt_setpoint = clip(op, sp.opdt_setpoint.range[0], sp.opdt_setpoint.range[1]);
    // Margins read the CLIPPED setpoint and the CLIPPED ΔT, so what the trip sees is
    // what the gauge shows — an operator can always reproduce the trip's arithmetic
    // from the board, which is not true if the trip reads an unclipped intermediate.
    this.reading.otdt_margin = clip(this.reading.otdt_setpoint - this.reading.loop_delta_t,
      sp.otdt_margin.range[0], sp.otdt_margin.range[1]);
    this.reading.opdt_margin = clip(this.reading.opdt_setpoint - this.reading.loop_delta_t,
      sp.opdt_margin.range[0], sp.opdt_margin.range[1]);
  };

  PWRInstruments.prototype._copyStatus = function (extras) {
    var st = this.specs.status, ex = extras || {};
    for (var i = 0; i < st.length; i++) this.reading[st[i]] = ex[st[i]];
  };

  // Advance every instrument one step from the new true state (§8, last in the
  // engine step). extras carries non-true-state inputs: porv_commanded_open,
  // power_rate (smoothed dPower for swell), and the status booleans.
  PWRInstruments.prototype.update = function (trueState, dt, extras) {
    extras = extras || {};
    for (var id in SOURCE) {
      var spec = this.specs[id];
      var trueVal = trueState[SOURCE[id]];

      // Shrink-and-swell: SG level indication moves the wrong way on a fast
      // power change, then the lag filter lets it fade (§8.4).
      if (id === 'sg_level') {
        trueVal = trueVal + this.swell_factor * (extras.power_rate || 0);
      }

      var val;
      if (spec.log) {
        // Log-scale detector (SR/IR): lag + noise act on log10(value) — a
        // decade of lag is a decade at any level, noise sigma is in decades.
        var lv = Math.log10(Math.max(trueVal, spec.range[0]));
        if (this.lagged[id] == null || !isFinite(this.lagged[id])) this.lagged[id] = lv;
        var alphaL = dt / (spec.lag + dt);
        this.lagged[id] += alphaL * (lv - this.lagged[id]);
        val = clip(Math.pow(10, this.lagged[id] + this._noise(id, spec, dt, trueVal)), spec.range[0], spec.range[1]);
      } else {
        // First-order lag (§8.1).
        var alpha = dt / (spec.lag + dt);
        this.lagged[id] += alpha * (trueVal - this.lagged[id]);

        // Noise (§8.2), then range peg (§8.3).
        val = this.lagged[id] + this._noise(id, spec, dt, trueVal);
        val = clip(val, spec.range[0], spec.range[1]);
      }

      // Apply an active instrument failure (§8.7) over the top.
      val = this._applyFailure(id, val, trueVal, spec, dt);

      this.reading[id] = val;
    }

    // PORV indicator reports COMMANDED state, not actual — the TMI deception (§8.5).
    var ind = extras.porv_commanded_open ? 'open' : 'closed';
    if (this.failed.porv_indicator) ind = this.failed.porv_indicator.value;
    this.reading.porv_indicator = ind;

    // Derived subcooling margin from INSTRUMENT P and T (HR1, §8.6) — inherits
    // their lag and any failure; this is what tells the truth at TMI.
    // Since #407 the datum is the HOTTER of the bulk and the core-exit channel —
    // NUREG-0737 II.F.2 Attachment 1 (2)(b): the displayed value is "the highest of
    // all operable thermocouples". On a covered core the two channels lag the same
    // source with the same τ, so the max IS the bulk, byte-identical (CA-21 fence);
    // over a dry core the exit channel reads superheat and the margin goes negative
    // — which is the post-TMI point of the instrument. Null-guarded so a rig-built
    // reading set without the appended channel keeps the bulk datum.
    var cetInd = this.reading.core_exit_temp;
    var tHotSide = (cetInd != null && cetInd > this.reading.tavg) ? cetInd : this.reading.tavg;
    this.reading.subcooling_margin = clip(
      T_sat(this.reading.primary_pressure) - tHotSide,
      this.specs.subcooling_margin.range[0], this.specs.subcooling_margin.range[1]);

    // Level deviation from program (#262) — the inventory cue. See _levelDev.
    this.reading.pzr_level_dev = this._levelDev(extras);
    this.reading.rod_limit_margin = this._rodLimitMargin(extras);
    this._deltaTChannels(extras);

    // Cooldown/heatup rate from INDICATED tavg (#375) — see the spec comment.
    // Filter state rides in `lagged` (keyed writes), so save/restore carries it
    // and a restored save resumes its trend instead of spiking.
    var rSpec = this.specs.tavg_rate;
    if (rSpec) {
      var tNow = this.reading.tavg;
      var tPrev = this.lagged.tavg_rate_prev != null ? this.lagged.tavg_rate_prev : tNow;
      this.lagged.tavg_rate_prev = tNow;
      var rRaw = dt > 0 ? (tNow - tPrev) * 3600 / dt : 0;
      if (this.lagged.tavg_rate == null) this.lagged.tavg_rate = 0;
      this.lagged.tavg_rate += (dt / ((rSpec.rate_tau || 45) + dt)) * (rRaw - this.lagged.tavg_rate);
      this.reading.tavg_rate = clip(this.lagged.tavg_rate, rSpec.range[0], rSpec.range[1]);
    }

    this._copyStatus(extras);
    return this.reading;
  };

  PWRInstruments.prototype._applyFailure = function (id, val, trueVal, spec, dt) {
    var f = this.failed[id];
    if (!f) return val;
    // Sigma a `noisy` failure scales. Normally the instrument's own sigma — but an
    // instrument shipped at noise 0 (the rule for every APPENDED instrument, since a
    // baseline draw would shift the cross-step PRNG stream) would make `noisy` a silent
    // no-op, because _gauss returns without drawing at sigma 0. `noise_failure` is the
    // declared fallback for those. It draws only while a failure is ACTIVE, which no
    // baseline run has, so the existing noise sequence is untouched (#247).
    var fSigma = spec.noise > 0 ? spec.noise : (spec.noise_failure || 0);
    switch (f.mode) {
      case 'stuck': return f.value;                      // frozen at injection value
      case 'drift': f.offset += f.rate * dt; return trueVal + f.offset; // sim-time correct (HR6)
      case 'noisy': return spec.log
        ? clip(Math.pow(10, this._gauss(this.lagged[id], fSigma * f.scale)), spec.range[0], spec.range[1])
        : clip(this._gauss(this.lagged[id], fSigma * f.scale), spec.range[0], spec.range[1]);
      case 'dead':  return spec.range[0];                // bottoms out
      default:      return val;
    }
  };

  // set_instrument_failure {instrument_id, mode, value} (§8.7).
  PWRInstruments.prototype.setFailure = function (id, mode, value) {
    if (id === 'porv_indicator') {
      this.failed[id] = { mode: 'stuck', value: value != null ? value : this.reading.porv_indicator };
      return;
    }
    if (mode === 'stuck') {
      this.failed[id] = { mode: 'stuck', value: value != null ? value : this.reading[id] };
    } else if (mode === 'drift') {
      this.failed[id] = { mode: 'drift', offset: 0, rate: value != null ? value : this.defaults.DEFAULT_DRIFT_RATE };
    } else if (mode === 'noisy') {
      this.failed[id] = { mode: 'noisy', scale: value != null ? value : this.defaults.DEFAULT_NOISE_SCALE };
    } else if (mode === 'dead') {
      this.failed[id] = { mode: 'dead' };
    }
  };

  PWRInstruments.prototype.clearFailure = function (id) { delete this.failed[id]; };

  // ---- save / restore: lag buffers, failures, PRNG state (§13) ----
  PWRInstruments.prototype.save = function () {
    return {
      lagged: Object.assign({}, this.lagged),
      reading: Object.assign({}, this.reading),
      failed: JSON.parse(JSON.stringify(this.failed)),
      rngState: this._rngState,
      seed: this.seed,
      // The AR(1) walk carries state ACROSS steps, so a restore that skipped it would
      // resume from zero noise and diverge from the run it restored — same class of bug
      // as omitting a lag buffer. Old saves have no field; {} is the correct migration
      // (it means "start the walk from rest", which is what reset() does).
      noiseState: Object.assign({}, this._noiseState),
    };
  };
  PWRInstruments.prototype.load = function (s) {
    this.lagged = Object.assign({}, s.lagged);
    this.reading = Object.assign({}, s.reading);
    this.failed = JSON.parse(JSON.stringify(s.failed));
    this._noiseState = Object.assign({}, s.noiseState || {});
    // Rename-in-place migrations (old saves): lpi_flow → hpi_flow (HPI/LPI merge).
    ['lagged', 'reading', 'failed'].forEach(function (k) {
      var o = this[k];
      if (o && o.lpi_flow !== undefined && o.hpi_flow === undefined) { o.hpi_flow = o.lpi_flow; delete o.lpi_flow; }
    }, this);
    this._rngState = s.rngState >>> 0;
    this.seed = s.seed >>> 0;
  };

  RD.PWRInstruments = PWRInstruments;

})(globalThis.RD || (globalThis.RD = {}));
