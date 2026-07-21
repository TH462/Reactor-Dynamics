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
  var IMBALANCE_FRAC = 0.04;  // annunciator threshold, fraction of rated (plant-agnostic)

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
      // Coupled feed follows the ACTUAL total steam draw (turbine + dump +
      // safeties), not the (zero) load: after a turbine trip the steam dump
      // still draws from the SG, and any feed regulation matches steam flow —
      // so a ride-out (turbine trip, reactor at power on the dump) doesn't
      // silently drain the SG, and a post-trip SG holds level until the P-4
      // isolation hands off to AFW. Reads the previous step's total draw
      // (explicit coupling). The follow/manual branches below deliberately keep
      // feed on the load TARGET: the feed-vs-actual-steam mismatch on a slider
      // ask is the EV-11 / shift-exam teaching behavior.
      if (s.feed_auto_coupled) {
        // Pure flow-matching with the pump's lag systematically over/under-feeds
        // a moving draw (a declining draw slowly FILLS the SG into the P-14
        // isolation) — so the fallback carries a gentle single-element level
        // trim toward the normal working level, like any standing feed
        // regulation. Reads the SG level instrument (HR1), one step lagged.
        var lvl = s._ins_sg_level != null ? s._ins_sg_level : (s.sg_level_pct != null ? s.sg_level_pct : 65);
        var trim = 0.002 * (65 - lvl);
        opts.setFeed(s, clip((s.steam_out_total != null ? s.steam_out_total : 0) + trim, 0, 1.2));
      }
    } else if (s.load_mode === 'follow') {
      s.load_target_mwe += alpha * (powerMwe - s.load_target_mwe);
      opts.setLoad(s, s.load_target_mwe, rated);
      if (s.feed_auto_coupled) opts.setFeed(s, clip(s.load_target_mwe / rated, 0, 1.2));
    } else {
      // manual — load_target_mwe is the operator setpoint (slider)
      opts.setLoad(s, s.load_target_mwe, rated);
      if (s.feed_auto_coupled) opts.setFeed(s, clip(s.load_target_mwe / rated, 0, 1.2));
    }

    // The imbalance ANNUNCIATOR reads INDICATED power (the engine stashes the
    // previous step's power_range reading as s._ins_power_pct) — HR1: an
    // annunciator is an indication, not physics. The load-follow tracking
    // above stays on true power: the turbine extracts what the reactor makes.
    var indMwe = (s._ins_power_pct != null ? s._ins_power_pct / 100 : powerFrac(s)) * rated;
    s.load_imbalance_mwe = indMwe - s.load_target_mwe;
    s.sg_imbalance_active = Math.abs(s.load_imbalance_mwe) > IMBALANCE_FRAC * rated;
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
    IMBALANCE_FRAC: IMBALANCE_FRAC,
    initState: initState,
    step: step,
    disconnect: disconnect,
    setMode: setMode,
    clip: clip,
  };
})(globalThis.RD || (globalThis.RD = {}));