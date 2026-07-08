/*
 * load_mode.js — shared turbine/load + coupled feedwater logic (Load Mode).
 *
 * One operator mental model: "how hard are we pushing the generator?" Feedwater
 * auto-tracks load in follow/manual when feed_auto_coupled is true.
 *
 * Modes: follow (default) | manual | disconnected
 *
 * Attaches RD.LoadMode.
 */
;(function (RD) {
  'use strict';

  var DEFAULT_TAU = 45; // seconds — turbine governor / operator lag
  var IMBALANCE_MW = 40;  // annunciator threshold

  function clip(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }

  function powerFrac(s) {
    if (s._P != null) return s._P;
    return (s.power_pct || 0) / 100;
  }

  function initState(s, P0, mweRated) {
    if (s.load_mode == null) s.load_mode = 'follow';
    if (s.load_target_mwe == null) s.load_target_mwe = P0 * mweRated;
    if (s.load_follow_tau == null) s.load_follow_tau = DEFAULT_TAU;
    if (s.feed_auto_coupled == null) s.feed_auto_coupled = true;
  }

  // opts: { mweRated, setLoad(s, mwe, rated), setFeed(s, frac), tripTurbine?(s) }
  function step(s, dt, opts) {
    var tau = s.load_follow_tau != null ? s.load_follow_tau : DEFAULT_TAU;
    var alpha = dt / (tau + dt);
    var rated = opts.mweRated;
    var powerMwe = powerFrac(s) * rated;

    if (s.load_mode === 'disconnected') {
      s.load_target_mwe = 0;
      opts.setLoad(s, 0, rated);
      if (s.feed_auto_coupled) opts.setFeed(s, 0);
    } else if (s.load_mode === 'follow') {
      s.load_target_mwe += alpha * (powerMwe - s.load_target_mwe);
      opts.setLoad(s, s.load_target_mwe, rated);
      if (s.feed_auto_coupled) opts.setFeed(s, clip(s.load_target_mwe / rated, 0, 1.2));
    } else {
      // manual — load_target_mwe is the operator setpoint (slider)
      opts.setLoad(s, s.load_target_mwe, rated);
      if (s.feed_auto_coupled) opts.setFeed(s, clip(s.load_target_mwe / rated, 0, 1.2));
    }

    s.load_imbalance_mwe = powerMwe - s.load_target_mwe;
    s.sg_imbalance_active = Math.abs(s.load_imbalance_mwe) > IMBALANCE_MW;
  }

  function disconnect(s, tripFn) {
    s.load_mode = 'disconnected';
    s.load_target_mwe = 0;
    if (tripFn) tripFn(s);
  }

  function setMode(s, mode, opts) {
    if (mode !== 'follow' && mode !== 'manual' && mode !== 'disconnected') return;
    s.load_mode = mode;
    if (mode === 'disconnected' && opts && opts.tripFn) disconnect(s, opts.tripFn);
    if (mode === 'follow' && opts && opts.rated) {
      s.load_target_mwe = powerFrac(s) * opts.rated;
    }
  }

  RD.LoadMode = {
    DEFAULT_TAU: DEFAULT_TAU,
    IMBALANCE_MW: IMBALANCE_MW,
    initState: initState,
    step: step,
    disconnect: disconnect,
    setMode: setMode,
    clip: clip,
  };
})(globalThis.RD || (globalThis.RD = {}));