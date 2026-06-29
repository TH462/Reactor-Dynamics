/*
 * bwr_instruments.js — the BWR instrument model (M3 §11), a built-in plant system
 * between true state and what the operator sees. Trips, alarms, gauges, and
 * scenario triggers all read THESE, never true state (HR1). Advanced inside the
 * engine step with dt_effective (HR6). Lag buffers, active failures, and the
 * noise PRNG state are part of save/restore (§17).
 *
 * Vessel-level shrink-and-swell: the level indication transiently moves the WRONG
 * way on a rapid pressure/power change (a pressure rise collapses voids, dropping
 * apparent level) — modeled by adding swell·power_rate before the lag (§11). A
 * stuck level sensor (vessel_level_sensor_failure) hides a falling level during
 * uncovery — the BWR's headline information failure.
 *
 * Attaches RD.BWRInstruments.
 */
;(function (RD) {
  'use strict';

  function clip(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }

  var SOURCE = {
    power_range: 'power_pct', vessel_pressure: 'vessel_pressure_mpa', vessel_level: 'vessel_level_pct',
    recirc_flow: 'recirc_flow_pct', steam_flow: 'steam_flow_normalized', fw_flow: 'fw_flow_normalized',
    core_void_fraction: 'core_void_fraction',
  };

  function BWRInstruments(config, seed) {
    this.cfg = config;
    this.specs = config.instruments;
    this.swell_factor = 1.2;        // BWR vessel level shrink-and-swell [tune]
    this.defaults = config.physics_failures;
    this.seed = (seed >>> 0) || 0x9E3779B9;
    this._rngState = this.seed;
    this.lagged = {}; this.reading = {}; this.failed = {};
  }

  BWRInstruments.prototype._draw = function () {
    var a = this._rngState | 0;
    a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    this._rngState = a >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  BWRInstruments.prototype._gauss = function (mean, sigma) {
    if (sigma <= 0) return mean;
    var u1 = this._draw(), u2 = this._draw();
    if (u1 < 1e-12) u1 = 1e-12;
    return mean + sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };

  BWRInstruments.prototype.reset = function (trueState, extras) {
    this.lagged = {}; this.reading = {}; this.failed = {};
    for (var id in SOURCE) {
      var v = trueState[SOURCE[id]];
      this.lagged[id] = v; this.reading[id] = v;
    }
    this.reading.rcic_status = !!(extras && extras.rcic_running);
    this._copyStatus(extras);
  };

  BWRInstruments.prototype._copyStatus = function (extras) {
    var st = this.specs.status, ex = extras || {};
    for (var i = 0; i < st.length; i++) this.reading[st[i]] = ex[st[i]];
  };

  BWRInstruments.prototype.update = function (trueState, dt, extras) {
    extras = extras || {};
    for (var id in SOURCE) {
      var spec = this.specs[id];
      var trueVal = trueState[SOURCE[id]];

      // Vessel-level shrink-and-swell: indication moves the wrong way on a fast
      // power/pressure change, then the lag lets it fade (§11).
      if (id === 'vessel_level') {
        trueVal = trueVal + this.swell_factor * (extras.power_rate || 0);
      }

      var alpha = dt / (spec.lag + dt);
      this.lagged[id] += alpha * (trueVal - this.lagged[id]);
      var val = this._gauss(this.lagged[id], spec.noise);
      val = clip(val, spec.range[0], spec.range[1]);
      val = this._applyFailure(id, val, trueVal, spec, dt);
      this.reading[id] = val;
    }

    var rcic = !!extras.rcic_running;
    if (this.failed.rcic_status) rcic = this.failed.rcic_status.value;
    this.reading.rcic_status = rcic;

    this._copyStatus(extras);
    return this.reading;
  };

  BWRInstruments.prototype._applyFailure = function (id, val, trueVal, spec, dt) {
    var f = this.failed[id];
    if (!f) return val;
    switch (f.mode) {
      case 'stuck': return f.value;
      case 'drift': f.offset += f.rate * dt; return trueVal + f.offset;
      case 'noisy': return clip(this._gauss(this.lagged[id], spec.noise * f.scale), spec.range[0], spec.range[1]);
      case 'dead':  return spec.range[0];
      default:      return val;
    }
  };

  BWRInstruments.prototype.setFailure = function (id, mode, value) {
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

  BWRInstruments.prototype.clearFailure = function (id) { delete this.failed[id]; };

  BWRInstruments.prototype.save = function () {
    return {
      lagged: Object.assign({}, this.lagged),
      reading: Object.assign({}, this.reading),
      failed: JSON.parse(JSON.stringify(this.failed)),
      rngState: this._rngState, seed: this.seed,
    };
  };
  BWRInstruments.prototype.load = function (s) {
    this.lagged = Object.assign({}, s.lagged);
    this.reading = Object.assign({}, s.reading);
    this.failed = JSON.parse(JSON.stringify(s.failed));
    this._rngState = s.rngState >>> 0; this.seed = s.seed >>> 0;
  };

  RD.BWRInstruments = BWRInstruments;

})(globalThis.RD || (globalThis.RD = {}));
