/*
 * bwr_recirculation.js — recirculation drive flow, jet pumps, natural
 * circulation, and the pump-coastdown transient (M3 §7.1–7.2). Pure functions
 * over engine state `s` and config `cfg`.
 *
 * Core flow exceeds the recirc drive flow because the jet pumps entrain
 * additional flow (core ≈ (1+m)·drive). On loss of forced flow the pumps coast
 * down and natural circulation takes over (reduced flow, not zero) — the
 * safety-relevant behavior the §18 natural-circ test confirms.
 *
 * Attaches RD.bwrRecirc.
 */
;(function (RD) {
  'use strict';

  function clip(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }

  // §7.2 — natural circulation: meaningful flow by convection without pumps, at
  // reduced power.
  function naturalCircFlow(P, cfg) {
    var r = cfg.recirc;
    return clip(r.natural_circ_coeff * Math.sqrt(Math.max(P, 0)) * 100.0, 0.0, r.natural_circ_max);
  }

  // §7.1 — core flow via jet pumps, with coastdown to natural circulation on loss
  // of recirc. `drive_flow_pct` tracks the operator setpoint; on a pump trip it
  // coasts down over tau, after which natural circulation governs.
  function stepCoreFlow(s, cfg, dt) {
    var r = cfg.recirc;
    if (s.recirc_pump_running) {
      // Drive flow RAMPS toward the setpoint (pump/flow inertia). An instantaneous
      // jump would swing the void hard enough to push ρ→β in one step — physically
      // wrong and numerically violent; the ramp keeps flow maneuvering gradual.
      s.drive_flow_pct += (s.recirc_setpoint_pct - s.drive_flow_pct) / r.tau_recirc * dt;
      s.core_flow_pct = clip(s.drive_flow_pct / 100.0 * (1.0 + r.jet_pump_m_ratio) * 100.0, 0.0, 120.0);
    } else {
      // Coast the drive flow down, then natural circulation sets the floor.
      s.drive_flow_pct += (0.0 - s.drive_flow_pct) / r.tau_coastdown * dt;
      var forced = s.drive_flow_pct / 100.0 * (1.0 + r.jet_pump_m_ratio) * 100.0;
      var natural = naturalCircFlow(s._P, cfg);
      s.core_flow_pct = clip(Math.max(forced, natural), 0.0, 120.0);
    }
  }

  RD.bwrRecirc = {
    naturalCircFlow: naturalCircFlow,
    stepCoreFlow: stepCoreFlow,
  };

})(globalThis.RD || (globalThis.RD = {}));
