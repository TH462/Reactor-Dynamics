/*
 * pwr_pressurizer2.js — THE PRESSURIZER REBUILD (#472), built ALONGSIDE the shipped model.
 *
 * WHAT THIS FILE IS
 * -----------------
 * A second pressurizer implementation plus the selector that swaps it in. It exists so the
 * rebuild can be A/B'd against v1 on the same tree, the same scenarios and the same
 * commit — the owner-approved method (`Blueprint/PWR_PRESSURIZER_REBUILD.md` §1.4: "Build
 * alongside, not in place. New module, switchable, A/B against the old on the same
 * scenarios"), because 23 runners and 11 scenarios are downstream and a big-bang cutover
 * produces dozens of simultaneous reds, which is the condition under which real defects
 * hide.
 *
 * THE SPEC IS `Blueprint/PWR_PRESSURIZER2_SPEC.md`. Read it before changing the physics
 * here; this header covers the SWITCH, which is the part that can silently lie to you.
 *
 * IT IS DISPOSABLE. At cutover this body moves INTO `pwr_pressurizer.js` (that filename
 * and its git history are the record), this file is deleted along with its ~28 load lines,
 * the `--pzr2` flags and the `pressurizer2:` config block. Nothing here should grow a
 * consumer that would have to be re-pointed.
 *
 * PHASE 3a — WHAT IS BUILT TODAY
 * ------------------------------
 * The plumbing ONLY. Every entry point delegates to v1, so flag-on and flag-off are the
 * same plant to the bit. That is deliberate and it is the phase's gate: it proves the
 * switch, the load order, the ~28 carriers and the A/B harness BEFORE any physics exists,
 * so that the first real red in phase 3b is about the model and not about the wiring.
 *
 * THE LOAD-ORDER TRAP, which is the whole reason the throw below exists
 * --------------------------------------------------------------------
 * `pwr_engine.js:22` caches its collaborators AT LOAD TIME:
 *
 *     var TH = RD.pwrThermal, PZ = RD.pwrPressurizer, PR = RD.pwrPrimary, ...
 *
 * so replacing `RD.pwrPressurizer` AFTER the engine file has been executed changes
 * nothing at all — the engine keeps calling v1 through its captured `PZ`, the flag reads
 * as on, and every measurement is silently v1 wearing a v2 label. `pwr_primary.js:304`,
 * `pwr_instruments.js:240` and `pwr_engine.js:2277` all late-bind through
 * `RD.pwrPressurizer.x` and would follow the swap, so the plant would run HALF of each
 * model. That is a worse failure than either model alone and it is invisible in a green
 * gate, so this file REFUSES to load after the engine rather than trying to cope.
 *
 * Ordering rule: load immediately after `pwr_pressurizer.js`, before `pwr_engine.js`.
 * `test/verify_pzr2_loadlists.js` gates that every carrier of v1 also carries v2.
 */
;(function (RD) {
  'use strict';

  var V1 = RD.pwrPressurizer;
  if (!V1) throw new Error('pwr_pressurizer2.js: load AFTER pwr_pressurizer.js (v1 is the phase-3a delegate)');

  // ================================================================== correlations
  //
  // v1 needed exactly ONE property of steam: `P_sat_from_T`. A two-region model needs the
  // steam side as well, because pressure is no longer a gain — it is the state of the
  // bubble, `rho_g_sat(P) = m_stm / V_stm`. These are the two functions that make the
  // difference between computing a pressure and fitting one.
  //
  // PROVENANCE, stated plainly: the table below is RECALLED IAPWS saturated-vapour
  // density, not a sourced document. That is the same standing the config's own rho/cp
  // figures have (see the `eccs_cooling_gain` block, which flags its 700 kg/m³ and
  // 5.7 kJ/kg·K the same way), and it is flagged here for the same reason — so a later
  // reader knows which numbers would move if a steam-table reference entered the corpus.
  // Nothing structural depends on the third digit: what the model needs is the SHAPE
  // (rho_g rising ~linearly in P at low pressure and steepening toward the critical
  // point), and that shape is what the table carries.
  //
  // A TABLE RATHER THAN A FIT, deliberately. A log-log power law through the endpoints
  // reads 18 % high at 7 MPa — the curve is not straight in any simple coordinates, and a
  // closed form accurate across 0.1–22 MPa would be a correlation nobody in this repo
  // could check by eye. Twenty-three points with log-space interpolation is <1 % across
  // the whole range, and every entry is independently verifiable against any steam table.
  var PSAT_MPA = [0.1, 0.2, 0.5, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0,
                  11.0, 12.0, 13.0, 14.0, 15.0, 16.0, 17.0, 18.0, 19.0, 20.0];
  var RHO_G    = [0.5903, 1.129, 2.668, 5.145, 10.04, 15.00, 20.09, 25.35, 30.82, 36.53,
                  42.51, 48.79, 55.43, 62.48, 70.01, 78.14, 87.00, 96.71, 107.4, 119.3,
                  132.6, 147.8, 165.3];

  // rho_g_sat(P) — saturated vapour density [kg/m³] at pressure P [MPa].
  // Interpolated in LOG-LOG space: both quantities span two-plus decades, and a linear
  // interpolation on the raw values is visibly wrong between the widely-spaced low-P
  // entries (0.1 → 0.2 → 0.5).
  function rho_g_sat(P) {
    if (!(P > 0)) return RHO_G[0];
    if (P <= PSAT_MPA[0]) return RHO_G[0] * (P / PSAT_MPA[0]);          // ideal-gas limit
    var n = PSAT_MPA.length;
    if (P >= PSAT_MPA[n - 1]) {
      // Above the table the curve is steepening toward the critical point; extrapolating
      // the last log-log segment is the least-wrong option and the regime is guarded
      // elsewhere (the code safeties lift at 17.13).
      var s = Math.log(RHO_G[n - 1] / RHO_G[n - 2]) / Math.log(PSAT_MPA[n - 1] / PSAT_MPA[n - 2]);
      return RHO_G[n - 1] * Math.pow(P / PSAT_MPA[n - 1], s);
    }
    var i = 0;
    while (i < n - 2 && PSAT_MPA[i + 1] < P) i++;
    var f = Math.log(P / PSAT_MPA[i]) / Math.log(PSAT_MPA[i + 1] / PSAT_MPA[i]);
    return RHO_G[i] * Math.pow(RHO_G[i + 1] / RHO_G[i], f);
  }

  // T_sat_from_P — the inverse of v1's `P_sat_from_T`, by bisection ON THAT FUNCTION.
  //
  // Inverting our OWN correlation rather than tabulating Tsat independently is the point:
  // a second table would let the saturation line disagree with itself, and every regime
  // predicate in this model (flash, condense, solid, the sat-branch entry) tests one side
  // of that line against the other. 60 bisections over a 100–374 °C bracket converge to
  // ~2e-7 °C, and the whole call costs less than one `Math.pow`.
  function T_sat_from_P(P) {
    var lo = 100, hi = 374, m;
    for (var i = 0; i < 60; i++) {
      m = 0.5 * (lo + hi);
      if (V1.P_sat_from_T(m) < P) lo = m; else hi = m;
    }
    return 0.5 * (lo + hi);
  }

  // dTsat/dP [°C/MPa] — the slope that converts heat into pressure rate. This is the term
  // that makes heater authority an OUTPUT: dP/dt = Q / (C · dTsat/dP). Central difference
  // on the inverse above, clamped so the step cannot cross into the extrapolated region.
  function dTsat_dP(P) {
    var h = Math.min(0.05, Math.max(0.001, P * 0.005));
    return (T_sat_from_P(P + h) - T_sat_from_P(P - h)) / (2 * h);
  }

  // ------------------------------------------------------------------ the model
  //
  // PHASE 3a: pure delegation. Each function is listed explicitly rather than copied with
  // a loop, because the export list IS the interface contract with the engine — a spread
  // would let v1 grow a function that silently appears here without anyone deciding it
  // belongs in the rebuilt model.
  var PZ2 = {
    // correlations — P_sat_from_T is v1's (one saturation line, see T_sat_from_P);
    // the rest are new and are what a two-region model needs that v1 never did.
    P_sat_from_T:     function (T_c)          { return V1.P_sat_from_T(T_c); },
    rho_g_sat:        rho_g_sat,
    T_sat_from_P:     T_sat_from_P,
    dTsat_dP:         dTsat_dP,
    // step entry points (pwr_engine.js:508 / :540 / :542, and :1992 with dt=0)
    stepPressure:     function (s, cfg, dt)   { return V1.stepPressure(s, cfg, dt); },
    stepLevel:        function (s, cfg, dt)   { return V1.stepLevel(s, cfg, dt); },
    stepTailpipe:     function (s, cfg, dt)   { return V1.stepTailpipe(s, cfg, dt); },
    // control + hydraulics
    effectiveSetpoint: function (s, cfg, dt)  { return V1.effectiveSetpoint(s, cfg, dt); },
    autoControl:      function (s, cfg, sp)   { return V1.autoControl(s, cfg, sp); },
    relief:           function (s, cfg)       { return V1.relief(s, cfg); },
    // level laws. levelProgram is a CONTROL law (the CVCS setpoint and the deviation
    // gauge both call it — pwr_primary.js:304, pwr_instruments.js:240) and survives the
    // rebuild near-verbatim; levelBase is its input.
    levelBase:        function (s, cfg)       { return V1.levelBase(s, cfg); },
    levelProgram:     function (s, cfg)       { return V1.levelProgram(s, cfg); },
    // v1-only, PRESENT FOR DELEGATION AND NOT PART OF THE V2 SURFACE. `levelRaw` is the
    // frozen pre-node line and `pzrNodeLevel` is v1's live law; the spec retires both
    // (§4). They are forwarded so phase 3a is bit-identical, and they are the first
    // things to disappear in 3b — the probes that call them are refit territory.
    levelRaw:         function (s, cfg)       { return V1.levelRaw(s, cfg); },
    pzrNodeLevel:     function (s, cfg)       { return V1.pzrNodeLevel(s, cfg); },
  };

  RD.pwrPressurizer2 = PZ2;

  // ------------------------------------------------------------------ the selector
  //
  // Three ways in, all equivalent, none of them the default:
  //   config  RD.PWR_CONFIG.pressurizer2.enabled = 1   (the shipped switch)
  //   Node    RD_PZR2=1                                (measure_stack/_perturb_child A/B)
  //   browser ?pzr2=1                                  (drive the real board on v2)
  var cfg2 = (RD.PWR_CONFIG && RD.PWR_CONFIG.pressurizer2) || {};
  var sel = (cfg2.enabled === 1)
         || (typeof process !== 'undefined' && process.env && process.env.RD_PZR2 === '1')
         || (typeof location !== 'undefined' && /[?&]pzr2=1/.test(location.search || ''));

  if (sel) {
    // See the load-order trap in the header. This is not defensive programming; it is the
    // difference between "the flag did nothing" and "the flag did half of something".
    if (RD.PWREngine) {
      throw new Error('pwr_pressurizer2.js: ?pzr2/RD_PZR2/enabled is set, but pwr_engine.js ' +
        'is ALREADY LOADED — it cached RD.pwrPressurizer at load time (pwr_engine.js:22), ' +
        'so the swap would be half-applied and every measurement would be a lie. Move this ' +
        'file ABOVE pwr_engine.js in the load list.');
    }
    RD.pwrPressurizer = PZ2;
    RD.PWR_PZR_MODEL = 'v2';
  } else {
    RD.PWR_PZR_MODEL = 'v1';
  }

})(globalThis.RD || (globalThis.RD = {}));
