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

  // ------------------------------------------------------------------ the model
  //
  // PHASE 3a: pure delegation. Each function is listed explicitly rather than copied with
  // a loop, because the export list IS the interface contract with the engine — a spread
  // would let v1 grow a function that silently appears here without anyone deciding it
  // belongs in the rebuilt model.
  var PZ2 = {
    // correlations
    P_sat_from_T:     function (T_c)          { return V1.P_sat_from_T(T_c); },
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
