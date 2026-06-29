/*
 * rbmk_instruments.js — the RBMK instrument model (M2 §13), a built-in plant
 * system between true state and what the operator sees. Trips, alarms, gauges,
 * and scenario triggers all read THESE, never true state (HR1). Advanced inside
 * the engine step with dt_effective (HR6), so lag is in simulated time. Every lag
 * buffer, active instrument failure, and the noise PRNG state are part of
 * save/restore (§18).
 *
 * The ORM display is a COMPUTED reading (from rod positions, §9) with no
 * lag/noise — but it is routed through a failure override AFTER computation so it
 * can still be stuck/drift/dead/noisy (the Chernobyl information failure). The
 * physics keeps using the TRUE ORM (§5.3, §9); only the display is corrupted.
 *
 * Attaches RD.RBMKInstruments.
 */
;(function (RD) {
  'use strict';

  function clip(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }

  // id → true_state field that feeds the lagged/noisy instruments (orm_display is
  // handled specially — computed, not lagged).
  var SOURCE = {
    power_range: 'power_pct', steam_pressure: 'steam_pressure_mpa', drum_level: 'drum_level_pct',
    channel_flow: 'channel_flow_pct', void_fraction: 'void_fraction_avg', fuel_temp: 'fuel_temp_c',
  };

  function RBMKInstruments(config, seed) {
    this.cfg = config;
    this.specs = config.instruments;
    this.defaults = config.physics_failures;
    this.seed = (seed >>> 0) || 0x9E3779B9;
    this._rngState = this.seed;
    this.lagged = {};   // first-order lag buffers, per id
    this.reading = {};  // final indicated values, per id (what the UI/M4 read)
    this.failed = {};   // active instrument failures, per id
  }

  // Box-Muller using the saveable PRNG (mulberry32 advanced on the explicit
  // saved state, so save/restore is bit-exact).
  RBMKInstruments.prototype._draw = function () {
    var a = this._rngState | 0;
    a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    this._rngState = a >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  RBMKInstruments.prototype._gauss = function (mean, sigma) {
    if (sigma <= 0) return mean;
    var u1 = this._draw(), u2 = this._draw();
    if (u1 < 1e-12) u1 = 1e-12;
    return mean + sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };

  // Initialize every reading to the (noise-free) true value — no startup transient.
  RBMKInstruments.prototype.reset = function (trueState, extras) {
    this.lagged = {}; this.reading = {}; this.failed = {};
    for (var id in SOURCE) {
      var v = trueState[SOURCE[id]];
      this.lagged[id] = v;
      this.reading[id] = v;
    }
    this.reading.orm_display = (extras && extras.orm_true != null) ? extras.orm_true : 0;
    this._copyStatus(extras);
  };

  RBMKInstruments.prototype._copyStatus = function (extras) {
    var st = this.specs.status, ex = extras || {};
    for (var i = 0; i < st.length; i++) this.reading[st[i]] = ex[st[i]];
  };

  // Advance every lagged instrument one step from the new true state (last in the
  // engine step, §6.12). extras carries non-true-state inputs: orm_true (the
  // computed ORM) and the status booleans.
  RBMKInstruments.prototype.update = function (trueState, dt, extras) {
    extras = extras || {};
    for (var id in SOURCE) {
      var spec = this.specs[id];
      var trueVal = trueState[SOURCE[id]];
      // First-order lag (§13).
      var alpha = dt / (spec.lag + dt);
      this.lagged[id] += alpha * (trueVal - this.lagged[id]);
      // Noise, then range peg.
      var val = this._gauss(this.lagged[id], spec.noise);
      val = clip(val, spec.range[0], spec.range[1]);
      // Active instrument failure over the top (§13).
      val = this._applyFailure(id, val, trueVal, spec, dt);
      this.reading[id] = val;
    }

    // ORM display — computed, no lag/noise, then failure override (§13).
    var orm = (extras.orm_true != null) ? extras.orm_true : 0;
    this.reading.orm_display = this.applyFailureOverride('orm_display', orm, dt);

    this._copyStatus(extras);
    return this.reading;
  };

  RBMKInstruments.prototype._applyFailure = function (id, val, trueVal, spec, dt) {
    var f = this.failed[id];
    if (!f) return val;
    switch (f.mode) {
      case 'stuck': return f.value;                                   // frozen at injection value
      case 'drift': f.offset += f.rate * dt; return trueVal + f.offset; // sim-time correct (HR6)
      case 'noisy': return clip(this._gauss(this.lagged[id], spec.noise * f.scale), spec.range[0], spec.range[1]);
      case 'dead':  return spec.range[0];                             // bottoms out
      default:      return val;
    }
  };

  // Failure override for the computed orm_display (and any non-lagged reading):
  // stuck freezes at the value at injection time, drift accumulates an offset,
  // noisy adds scaled noise, dead bottoms out. The TRUE ORM is unaffected.
  RBMKInstruments.prototype.applyFailureOverride = function (id, computed, dt) {
    var f = this.failed[id];
    if (!f) return computed;
    var spec = this.specs[id];
    switch (f.mode) {
      case 'stuck': return f.value != null ? f.value : computed;
      case 'drift': f.offset += f.rate * (dt || 0); return computed + f.offset;
      case 'noisy': return this._gauss(computed, (spec && spec.noise ? spec.noise : 1) * f.scale);
      case 'dead':  return spec ? spec.range[0] : 0;
      default:      return computed;
    }
  };

  // set_instrument_failure {instrument_id, mode, value} (§13). For stuck, freeze
  // at the current reading (stuck-at-current) when no value is supplied.
  RBMKInstruments.prototype.setFailure = function (id, mode, value) {
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

  RBMKInstruments.prototype.clearFailure = function (id) { delete this.failed[id]; };

  // ---- save / restore: lag buffers, failures, PRNG state (§13, §18) ----
  RBMKInstruments.prototype.save = function () {
    return {
      lagged: Object.assign({}, this.lagged),
      reading: Object.assign({}, this.reading),
      failed: JSON.parse(JSON.stringify(this.failed)),
      rngState: this._rngState,
      seed: this.seed,
    };
  };
  RBMKInstruments.prototype.load = function (s) {
    this.lagged = Object.assign({}, s.lagged);
    this.reading = Object.assign({}, s.reading);
    this.failed = JSON.parse(JSON.stringify(s.failed));
    this._rngState = s.rngState >>> 0;
    this.seed = s.seed >>> 0;
  };

  RD.RBMKInstruments = RBMKInstruments;

})(globalThis.RD || (globalThis.RD = {}));
