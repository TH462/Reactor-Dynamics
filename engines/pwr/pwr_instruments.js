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
  };

  function PWRInstruments(config, seed) {
    this.cfg = config;
    this.specs = config.instruments;
    this.swell_factor = 0.8; // SG level shrink-and-swell [tune]
    this.defaults = config.physics_failures;
    this.seed = (seed >>> 0) || 0x9E3779B9;
    this._rng = mulberry32(this.seed);
    this._rngState = this.seed;
    this.lagged = {};   // first-order lag buffers, per id
    this.reading = {};  // final indicated values, per id (what the UI/M4 read)
    this.failed = {};   // active instrument failures, per id
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

  // Initialize every reading to the (noise-free) true value — no startup transient.
  // Log instruments (spec.log — the source/intermediate-range nuclear detectors)
  // keep their LAG BUFFER in log10 domain, so lag and noise act per decade.
  PWRInstruments.prototype.reset = function (trueState, extras) {
    this.lagged = {}; this.reading = {}; this.failed = {};
    for (var id in SOURCE) {
      var v = trueState[SOURCE[id]];
      var spec = this.specs[id];
      this.lagged[id] = (spec && spec.log) ? Math.log10(Math.max(v, spec.range[0])) : v;
      this.reading[id] = (spec && spec.log) ? clip(v, spec.range[0], spec.range[1]) : v;
    }
    this.reading.porv_indicator = (extras && extras.porv_commanded_open) ? 'open' : 'closed';
    this.reading.subcooling_margin = T_sat(this.reading.primary_pressure) - this.reading.tavg;
    this._copyStatus(extras);
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
        val = clip(Math.pow(10, this._gauss(this.lagged[id], spec.noise)), spec.range[0], spec.range[1]);
      } else {
        // First-order lag (§8.1).
        var alpha = dt / (spec.lag + dt);
        this.lagged[id] += alpha * (trueVal - this.lagged[id]);

        // Noise (§8.2), then range peg (§8.3).
        val = this._gauss(this.lagged[id], spec.noise);
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
    this.reading.subcooling_margin = clip(
      T_sat(this.reading.primary_pressure) - this.reading.tavg,
      this.specs.subcooling_margin.range[0], this.specs.subcooling_margin.range[1]);

    this._copyStatus(extras);
    return this.reading;
  };

  PWRInstruments.prototype._applyFailure = function (id, val, trueVal, spec, dt) {
    var f = this.failed[id];
    if (!f) return val;
    switch (f.mode) {
      case 'stuck': return f.value;                      // frozen at injection value
      case 'drift': f.offset += f.rate * dt; return trueVal + f.offset; // sim-time correct (HR6)
      case 'noisy': return spec.log
        ? clip(Math.pow(10, this._gauss(this.lagged[id], spec.noise * f.scale)), spec.range[0], spec.range[1])
        : clip(this._gauss(this.lagged[id], spec.noise * f.scale), spec.range[0], spec.range[1]);
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
    };
  };
  PWRInstruments.prototype.load = function (s) {
    this.lagged = Object.assign({}, s.lagged);
    this.reading = Object.assign({}, s.reading);
    this.failed = JSON.parse(JSON.stringify(s.failed));
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
