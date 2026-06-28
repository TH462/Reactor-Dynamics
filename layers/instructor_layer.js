/*
 * instructor_layer.js — M6·PH, the Placeholder Instructor (temporary scaffold).
 *
 * A transparent pass-through occupying the Instructor's slot so the command path
 * is complete end-to-end (HR5) and the stack can be wired, run, and tested before
 * the real Instructor (M6) is designed. It implements exactly the interface M6
 * will implement, so M6 later replaces this file's internals with NO changes to
 * M5 (above) or M4 (below).
 *
 * Pure free-play: commands pass straight through (no gating), no beats run, no
 * commentary is emitted (`message: null`), no scenario logic, no failure
 * injection, and it never reads true state. Command INTERCEPTION still happens
 * below in M4 for active command-override failures — that is correct and not the
 * Instructor's concern (M6·PH §5).
 *
 * Attaches RD.InstructorLayer.
 */
;(function (RD) {
  'use strict';

  // controlFailureLayer (the M4 instance below) may be supplied at construction
  // or wired later via connect() — M5 rebuilds M4 on every plant change, so the
  // slot occupant is re-pointed at the new layer rather than reconstructed.
  function InstructorLayer(controlFailureLayer) {
    this.below = controlFailureLayer || null;
    this.register = 'learning';
  }

  // Re-point at the (possibly rebuilt) layer below. Carries no scenario state, so
  // this is all the rewiring a plant change needs.
  InstructorLayer.prototype.connect = function (controlFailureLayer) {
    this.below = controlFailureLayer;
  };

  // Transparent: no gating, no interception. Pass straight to the layer below and
  // return whatever it returns.
  InstructorLayer.prototype.handleCommand = function (command) {
    return this.below.handleCommand(command);
  };

  // No beats, no commentary, no injection. Intentionally empty.
  InstructorLayer.prototype.step = function (snapshot, simTime) { /* placeholder */ };

  // The empty instructor block (CONTEXT §6.2): message always null in free-play.
  InstructorLayer.prototype.getMessage = function () {
    return { message: null, message_register: this.register };
  };

  InstructorLayer.prototype.setRegister = function (value) { this.register = value; };

  // Placeholder runs no scenarios — accept and ignore.
  InstructorLayer.prototype.load = function (scenario) { /* no-op */ };

  InstructorLayer.prototype.saveState = function () { return { register: this.register }; };
  InstructorLayer.prototype.loadState = function (state) {
    this.register = (state && state.register != null) ? state.register : 'learning';
  };

  RD.InstructorLayer = InstructorLayer;

})(globalThis.RD || (globalThis.RD = {}));
