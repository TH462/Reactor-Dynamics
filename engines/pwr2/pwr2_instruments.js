/* pwr2_instruments.js — THE INSTRUMENT LAYER: what the plant SAYS, between what it IS and
 * everyone who reads it (Hard Rule 1). Built 2026-08-20 under the owner's ruling "Do option 1"
 * on #479's drained owed list.
 *
 * WHAT IT MODELS, per channel: a first-order sensing lag (a second cascaded lag where the
 * source gives one), band-limited AR(1) noise, and operator-injectable failures. Consumers —
 * the RPS drivers in pwr2_engine, the preview page's readouts — read `ins.reading[id]`;
 * NOTHING in here writes physics, and true_state stays truth (the contract is unchanged).
 *
 * SOURCED where the corpus gives a number, and the two that are sourced matter most:
 *   - RTD lag 2.0 s and the HOT-LEG measurement filter 3.5 s — Ginna UFSAR ch15
 *     (ML20339A101) Table 15.0-6 footnote b, verbatim: "a time constant (first order lag) of
 *     2.0 seconds for the RTDs and a filter (lag) of 3.5 (or 6.0) seconds on the hot-leg
 *     temperature measurement". The 3.5/6.0 pair's LOWER member is taken (the higher is the
 *     more conservative analysis case; a simulator wants the nominal instrument, and the
 *     choice is declared here rather than silent).
 *   - Every other tau and every sigma is [open] — plausible transmitter-class values, waiting
 *     on sources; each is a named constant, none is load-bearing for a safety claim.
 *
 * THE ANALYSIS' OWN DELAY BECOMES EMERGENT: the OT delta-T channel's effective delay is now
 * RTD lag + hot-leg filter + the RPS's sourced 2.0 s hold — the same pieces footnote b sums
 * to its 7.0 s figure. The lead/lag COMPENSATION that undoes sensing lag in a real setpoint
 * chain stays out (its constants are COLR-resident, pwr2_protection.js declares it), which
 * matches footnote b's own conservative modelling: the analysis does not credit it either.
 *
 * PER-CHANNEL INDEPENDENT PRNG STREAMS — a deliberate design departure from pwr_instruments.js,
 * whose single cross-step stream makes channel ORDER load-bearing: every appended channel there
 * must ship noise:0 or shift every stream after it (the appended-instrument-PRNG trap, worked
 * repeatedly). Here each channel's stream is seeded from a hash of its OWN id: adding, removing
 * or reordering channels cannot move any other channel's noise, and the gate proves it by
 * injection. Determinism per channel is exact, so gates and A/B rides are reproducible.
 *
 * FAILURE MODES (operator/instructor-injectable through the facade's one door):
 *   'stuck'  — the reading freezes where it is (the TMI class: a healthy-looking liar)
 *   'low'    — rails to the channel's range floor
 *   'high'   — rails to the channel's range ceiling
 *   'noisy'  — sigma multiplied by NOISY_MULT (a failing transmitter, still roughly right)
 * A failed channel keeps its lag state current so a 'restore' heals to a sane value, not to
 * a stale buffer.
 *
 * NOT HERE, deliberately: save/restore (PWR2 has no snapshot layer yet — Option B's), alarm
 * logic (a consumer's job), and the control systems' switchover — in this stage the RPS and
 * the page read instruments; the CONTROL loops (dump controller, pressurizer level/pressure
 * control) still read truth, because each switchover changes a control loop's stability under
 * lag and noise and owes its own measured pass. Declared in PWR2_VALIDATION.md §54.
 */
(function (root) {
  'use strict';

  var RD = root.RD && root.RD.pwr2;
  if (!RD || !RD.water) throw new Error('pwr2_instruments: load the pwr2 stack first');

  function clip(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }

  /* mulberry32 — one PRNG per channel, seeded from the channel id's own hash (fnv1a), so no
   * channel's stream depends on any other channel's existence. */
  function fnv1a(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
  }
  /* STATE-CARRYING mulberry32 (reworked for stage B2, 2026-08-20): the PRNG state is a plain
   * uint32 ON THE CHANNEL, advanced functionally — a closure-held state cannot ride a
   * saveState()/loadState() round trip, and re-seeding on load would silently rewind every
   * channel's noise phase. Same generator, same streams, bit-identical to the closure form. */
  function rngNext(state) {
    var a = (state + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return { state: a, value: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
  }

  var NOISY_MULT = 12;          /* 'noisy' failure: sigma multiplier [open] */
  var NOISE_TAU_S = 8;          /* AR(1) correlation time [open] — band-limited, the lesson
                                 * pwr_instruments learned the hard way: white noise re-drawn
                                 * every step reads twitchy, not alive */

  /* THE CHANNEL TABLE. src = the true_state field feeding it (the published contract — this
   * module consumes true_state exactly like an external reader, which is what makes it
   * testable standalone). tau_s = first-order sensing lag; tau2_s = a cascaded second lag
   * where the source names one. range = rail values for the 'low'/'high' failures and the
   * clip on every reading. sigma = stationary noise, in the channel's own unit. */
  var CHANNELS = [
    /* nuclear */
    { id: 'power_range',      src: 'power_pct',                tau_s: 0.2,  sigma: 0.3,  range: [0, 130] },      /* [open] ion chambers are fast */
    { id: 'startup_rate',     src: 'startup_rate_dpm',         tau_s: 2.0,  sigma: 0.05, range: [-4, 7] },       /* [open] rate meter smoothing */
    /* temperatures — the SOURCED pair */
    { id: 'tavg',             src: 'tavg_c',                   tau_s: 2.0,  sigma: 0.15, range: [0, 400] },      /* [sourced] RTD 2.0 s, 15.0-6 fn b */
    { id: 'thot',             src: 'thot_c',                   tau_s: 2.0,  tau2_s: 3.5, sigma: 0.2, range: [0, 400] },  /* [sourced] RTD + hot-leg filter */
    { id: 'tcold',            src: 'tcold_c',                  tau_s: 2.0,  sigma: 0.15, range: [0, 400] },      /* [sourced] RTD 2.0 s */
    /* primary */
    { id: 'primary_pressure', src: 'pressure_mpa',             tau_s: 0.5,  sigma: 0.02, range: [0, 20] },       /* [open] transmitter-class */
    { id: 'pzr_level',        src: 'pzr_level_pct',            tau_s: 1.0,  sigma: 0.3,  range: [0, 100] },      /* [open] dP cell */
    { id: 'loop_flow',        src: 'pump_flow_pct',            tau_s: 1.0,  sigma: 0.5,  range: [0, 120] },      /* [open] elbow-tap dP */
    { id: 'boron',            src: 'boron_ppm',                tau_s: 60.0, sigma: 2.0,  range: [0, 3000] },     /* [open] a SAMPLE analyzer — minutes, not seconds */
    { id: 'porv_tailpipe_temp', src: 'porv_tailpipe_temp_c',   tau_s: 5.0,  sigma: 0.5,  range: [0, 400] },      /* [open] pipe-clamp TC */
    /* secondary + BOP */
    { id: 'steam_pressure',   src: 'steam_pressure_mpa',       tau_s: 0.5,  sigma: 0.01, range: [0, 12] },       /* [open] */
    { id: 'steam_flow',       src: 'steam_flow_normalized',    tau_s: 1.0,  sigma: 0.01, range: [0, 2.5] },      /* [open] venturi dP */
    { id: 'sg_level',         src: 'sg_level_pct',             tau_s: 1.0,  sigma: 0.3,  range: [0, 100] },      /* [open] dP cell, pzr_level's class.
                                                                  NARROW range on purpose: the lo-lo function's sourced LSSS is "a percent of narrow
                                                                  range instrument span" (Ginna TS Bases B 3.3.2, ML20339A221). The downcomer
                                                                  shrink/swell SHIFT arrives via extras — see stepInstruments. */
    { id: 'fw_flow',          src: 'fw_flow_normalized',       tau_s: 1.0,  sigma: 0.01, range: [0, 2.5] },      /* [open] venturi dP, steam_flow's class —
                                                                  the three-element controller's element 3 (WTSM 11.1: flow error = steam − feed) */
    { id: 'mwe_output',       src: 'mwe_output',               tau_s: 0.5,  sigma: 0.2,  range: [0, 120] },      /* [open] wattmeter */
    /* containment */
    { id: 'containment_pressure', src: 'containment_pressure_mpa', tau_s: 1.0, sigma: 0.001, range: [0, 2] }     /* [open] */
  ];

  function createInstruments(opts) {
    opts = opts || {};
    var ins = {
      noiseScale: (opts.noise_scale !== undefined) ? +opts.noise_scale : 1,
      channels: {}, reading: {}, failure: {}
    };
    CHANNELS.forEach(function (c) {
      ins.channels[c.id] = {
        spec: c,
        lag1: null, lag2: null,            /* primed from the first true reading */
        noise: 0,
        rngState: fnv1a(c.id) | 0          /* the channel's OWN stream — see header */
      };
      ins.failure[c.id] = null;
    });
    return ins;
  }

  /* fail(ins, id, mode, value) / restore(ins, id) — mode: 'stuck' | 'low' | 'high' |
   * 'noisy' | 'drift' | 'dead'. Unknown channel or mode THROWS — a misspelled failure that
   * silently does nothing would read exactly like a plant surviving it. `value` (#507
   * wave 3): a STUCK channel freezes at it instead of the current reading — the CA-4 class
   * (a level sensor failed at 20 %, not wherever it happened to be) needs the value to be
   * the teaching point. For 'drift' (#507 wave 6), `value` is the RATE in the channel's own
   * units/s (default [adopted] the current engine's DEFAULT_DRIFT_RATE 0.5); the offset
   * accumulates in sim time (HR6) and rides the save as plain state. 'dead' rails the
   * channel at range[0], the current engine's bottoms-out semantic. */
  function fail(ins, id, mode, value) {
    if (!ins.channels[id]) throw new Error('pwr2_instruments: no channel "' + id + '"');
    if (['stuck', 'low', 'high', 'noisy', 'drift', 'dead'].indexOf(mode) < 0) {
      throw new Error('pwr2_instruments: no failure mode "' + mode + '"');
    }
    if (mode === 'drift') {
      ins.failure[id] = { mode: 'drift', offset: 0,
        rate: (value !== undefined && value !== null && isFinite(+value)) ? +value : 0.5 };
      return;
    }
    ins.failure[id] = { mode: mode,
      held: (mode === 'stuck' && value !== undefined && value !== null) ? value : ins.reading[id] };
  }
  function restore(ins, id) {
    if (id === undefined || id === null) {
      Object.keys(ins.failure).forEach(function (k) { ins.failure[k] = null; });
      return;
    }
    if (!ins.channels[id]) throw new Error('pwr2_instruments: no channel "' + id + '"');
    ins.failure[id] = null;
  }

  /* stepInstruments(ins, dt, ts, extras) — ts is a true_state-shaped object. Reads only.
   *
   * extras.shift (optional): { channelId: value } added to the TRUE value before the lag —
   * a MEASUREMENT-side displacement that is not instrument error and not in true_state.
   * Its one user (2026-08-21): sg_level's downcomer shrink/swell. WAT 05 §5.2.3: the
   * indicated (downcomer) level moves with steam-flow changes while inventory does not —
   * "the change in indicated level is not due to a change in steam generator inventory" —
   * and D3 §3 keeps the SG one lumped node, so the mass ledger cannot carry it. The
   * current engine models it the same way (pwr_instruments swell_factor, [tune] 0.8 —
   * ADOPTED by the facade), and the A/B pre-registration (A9) requires reproducing it as
   * an instrument-side effect. Shift BEFORE the lag, the current engine's order. */
  function stepInstruments(ins, dt, ts, extras) {
    var shift = extras && extras.shift;
    CHANNELS.forEach(function (c) {
      var ch = ins.channels[c.id];
      var truth = ts[c.src];
      if (shift && typeof shift[c.id] === 'number' && isFinite(shift[c.id]) &&
          typeof truth === 'number') {
        truth = truth + shift[c.id];
      }
      if (typeof truth !== 'number' || !isFinite(truth)) {
        /* a missing true field is a WIRING defect, not a plant condition — hold the last
         * reading rather than emit NaN into every consumer, and leave the lag state alone */
        if (ins.reading[c.id] === undefined) ins.reading[c.id] = NaN;
        return;
      }
      /* lag chain — primed to truth on the first step so a fresh plant does not spend its
       * first tau climbing from zero */
      if (ch.lag1 === null) { ch.lag1 = truth; ch.lag2 = truth; }
      var a1 = dt / Math.max(c.tau_s, dt);
      ch.lag1 += a1 * (truth - ch.lag1);
      var sensed = ch.lag1;
      if (c.tau2_s) {
        var a2 = dt / Math.max(c.tau2_s, dt);
        ch.lag2 += a2 * (ch.lag1 - ch.lag2);
        sensed = ch.lag2;
      }
      /* AR(1) noise: exact discrete update, stationary sigma = spec sigma x noiseScale */
      var f = ins.failure[c.id];
      var sig = c.sigma * ins.noiseScale * (f && f.mode === 'noisy' ? NOISY_MULT : 1);
      if (sig > 0) {
        var rho = Math.exp(-dt / NOISE_TAU_S);
        var r1 = rngNext(ch.rngState); var r2 = rngNext(r1.state);
        ch.rngState = r2.state;
        var u1 = Math.max(r1.value, 1e-12), u2 = r2.value;
        var gauss = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        ch.noise = rho * ch.noise + Math.sqrt(1 - rho * rho) * sig * gauss;
      } else {
        ch.noise = 0;
      }
      var value = sensed + ch.noise;
      /* failures override the healthy path — but the LAG STATE above stayed current, so a
       * restore heals to now, not to the moment of failure */
      if (f) {
        if (f.mode === 'stuck') value = f.held;
        else if (f.mode === 'low') value = c.range[0];
        else if (f.mode === 'high') value = c.range[1];
        else if (f.mode === 'drift') { f.offset += f.rate * dt; value = sensed + f.offset; }
        else if (f.mode === 'dead') value = c.range[0];
        /* 'noisy' already applied through sig */
      }
      ins.reading[c.id] = clip(value, c.range[0], c.range[1]);
    });
    return ins.reading;
  }

  root.RD.pwr2.instruments = {
    CHANNELS: CHANNELS,
    NOISY_MULT: NOISY_MULT,
    NOISE_TAU_S: NOISE_TAU_S,
    createInstruments: createInstruments,
    stepInstruments: stepInstruments,
    fail: fail,
    restore: restore
  };
})(globalThis);
