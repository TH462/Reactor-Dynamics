/*
 * bwr_recirc.js — The Flow Throttle (BWR campaign, Act I mission 3).
 *
 * The player drives power with the recirculation pumps: throttle up from
 * 50% toward ~70% (measured: recirc ask 25 → ~71% power), watch the voids
 * sweep out, then throttle back down. The RBMK mirror is drawn explicitly —
 * the same flow knob, the opposite sign, and this time the feedback is a
 * safety feature. Gated to recirc control.
 */
;(function (RD) {
  'use strict';

  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.bwr_recirc = {
    id: 'bwr_recirc',
    title: 'The Flow Throttle',
    plant_id: 'bwr',
    design_version: null,
    initial_state: '50_percent',
    mode: 'guided',
    description: 'Drive a reactor with pump speed: sweep the bubbles out and the power follows your hand.',
    beats: [

      { id: 'intro',
        trigger: { type: 'time', value: 2.0 },
        commentary: {
          learning: 'Half power, rods parked, and they will STAY parked — today you drive with the pumps. Remember the RBMK experiment: you cut flow there and power rose against your instincts. Same knob here, opposite machine: raise the recirculation flow, the bubbles get swept out of the core, the water moderates better — and power RISES to your hand, then holds itself there. The negative feedback that terrified nobody.',
          industry: 'Recirc maneuvering exercise from 50%, control rods static (BWR practice). Expected response: flow ↑ → void sweep-out → +ρ → power rise to a new self-stabilized point. Deliberate contrast with the RBMK flow experiment.',
        },
        gate: { allow_actions: ['set_recirc_flow', 'scram', 'manual_scram', 'acknowledge_alarm', 'acknowledge_all_alarms'],
                message: 'Recirculation flow only — the rods stay parked, like a real BWR at power.' },
        advance: 'wait_for_trigger' },

      { id: 'up_task',
        trigger: { type: 'delay', value: 18.0 },
        commentary: {
          learning: 'Take the RECIRC DRIVE up — a modest step, aim the DIAL around 25 — and then hands off. One heads-up: the drive dial and the flow gauge speak different units — set 25 on the dial and the Recirculation Flow gauge will read about 60%. That is normal. Watch three gauges tell one story: recirculation flow up, VOID FRACTION down, POWER up. Aim to land around 70% power.',
          industry: 'Raise the recirc drive setting to ~25 (dial units; ≈62% indicated loop flow — the scales differ). Anticipate ~70% power equilibrium. Track flow / void / power coupling; no rod motion.',
        },
        advance: 'wait_for_trigger' },

      { id: 'down_task',
        trigger: { type: 'all', triggers: [
          { type: 'operator_action', command: 'set_recirc_flow' },
          { type: 'instrument', instrument: 'power_range', direction: 'above', value: 66.0 },
        ] },
        commentary: {
          learning: 'Feel that? Look where power stopped — no rods, no trip, it found its own ceiling: the moment power outran the flow, fresh bubbles formed and braked it. (Asked for more than 25? Then it parked higher — the brake scales with the ask.) You cannot easily run away in this machine; the foam always votes against you. One professional caution while you are proud of yourself: real BWR operators still respect a flow map — certain low-flow/high-power corners invite power oscillations even here. Now throttle back: return the dial toward 19 and watch the foam take the power back down.',
          industry: 'Power self-stabilized on void feedback alone at the flow-determined equilibrium. Caveat for realism: operating map exclusion regions (thermal-hydraulic instability at low-flow/high-power) still apply in real plants — not modeled here. Reduce the drive setting to ~19; expect return toward 50%.',
        },
        advance: 'wait_for_trigger' },

      { id: 'complete',
        trigger: { type: 'all', triggers: [
          { type: 'operator_action', command: 'set_recirc_flow' },
          { type: 'instrument', instrument: 'power_range', direction: 'below', value: 55.0 },
        ] },
        commentary: {
          learning: 'Back down to half power, smooth as a dimmer switch. You have now driven the same physics three ways: the PWR followed its steam demand, the RBMK fought your expectations, and the BWR follows your pumps — because in each case the DESIGN decided what the bubbles and the temperature would do to the neutrons. That is reactor engineering in one sentence.',
          industry: 'Bidirectional flow-control maneuver complete (50→70→50%). Comparative takeaway: demand-following (PWR), positive-void hazard (RBMK), flow-control (BWR) are all consequences of moderator/coolant architecture.',
        },
        level_complete: {
          title: 'The Flow Throttle — Licensed',
          outcome_learning: 'Twenty percent of a gigawatt, moved with a pump setting and no rods. The foam is on your side here.',
          outcome_industry: 'Recirc power maneuvering demonstrated both directions with void-feedback stabilization.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },
    ],
  };

})(globalThis.RD || (globalThis.RD = {}));
