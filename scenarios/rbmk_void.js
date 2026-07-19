/*
 * rbmk_void.js — The Wrong-Way Machine (RBMK campaign, Act I mission 3).
 *
 * The positive void coefficient, felt by hand at a power level where it is
 * tame: the player cuts channel flow at 50% — more boiling, more void, and
 * power RISES on its own (measured: 50% → ~53% for an 80→60% flow cut on
 * the pre-1986 design). Then restores it. The PWR comparison is drawn hard:
 * the same experiment there pushed power DOWN. Gated to flow control.
 */
;(function (RD) {
  'use strict';

  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.rbmk_void = {
    id: 'rbmk_void',
    title: 'The Wrong-Way Machine',
    plant_id: 'rbmk',
    design_version: 'pre_chernobyl',
    initial_state: '50_percent',
    mode: 'guided',
    description: 'Cut the cooling water and watch power RISE. Feel the positive void coefficient — while it is still tame.',
    beats: [

      { id: 'intro',
        trigger: { type: 'time', value: 2.0 },
        commentary: {
          learning: 'Time to feel the wrong-way physics yourself. The experiment: you will REDUCE the cooling water flowing through the channels. Think like a PWR operator first — less cooling should mean the reactor winds DOWN, right? Hotter water, worse moderation, power falls. That is what your instincts say. Now watch what THIS machine does with the same move.',
          industry: 'Interactive void-coefficient demonstration at 50% (tame regime). Planned evolution: channel flow reduction 80→~60%. PWR-trained expectation (negative MTC response) is about to be inverted.',
        },
        gate: { allow_actions: ['set_channel_flow', 'scram', 'manual_scram', 'acknowledge_alarm', 'acknowledge_all_alarms'],
                message: { learning: 'Channel flow only for this experiment — the point is what the reactor does on its own.',
                           industry: 'MCP/channel-flow controls only for this demonstration; observe the intrinsic response.' } },
        advance: 'wait_for_trigger' },

      // Prompt + branch watch (playtest pattern): the asked-for 80→60 cut leads
      // on; a manual AZ-5 — or the protection trip a deep cut provokes (probed:
      // flow 30 spikes the core to ~120% and trips) — lands on the overpowered
      // card instead of softlocking the mission.
      { id: 'cut_task',
        trigger: { type: 'delay', value: 16.0 },
        commentary: {
          learning: 'Take the CHANNEL FLOW down from 80% to 60%. Then hands off — and watch two gauges: VOID FRACTION and POWER.',
          industry: 'Reduce channel flow to ~60%. Observe void fraction and power response; no other action.',
        },
        highlight: { control_label: 'MCP / Channel Flow', instrument_id: null },
        branches: [
          { trigger: { type: 'scram' }, goto: 'overpowered' },
          { trigger: { type: 'all', triggers: [
              { type: 'operator_action', command: 'set_channel_flow' },
              { type: 'instrument', instrument: 'power_range', direction: 'above', value: 52.0 },
            ] }, goto: 'restore_task' },
        ] },

      { id: 'restore_task',
        trigger: { type: 'delay', value: 2.0 },
        commentary: {
          learning: 'THERE. Less water, more steam bubbles in the channels — and power went UP. Nobody touched a rod. (Cut deeper than asked? Then it leapt harder — the circle scales with the bubbles.) The bubbles displaced water that was quietly eating neutrons, and the chain reaction breathed easier. That is a POSITIVE void coefficient: the feedback circle points toward MORE. At this power it leans, and stops. Do not let that gentleness fool you: at low power, with the core full of xenon and the rods pulled out, this same circle has no brakes. Now put the flow back to 80% and watch the bubbles collapse.',
          industry: 'Positive void response confirmed: flow ↓ → void ↑ → +ρ → power ↑ (~+3% for the nominal cut; deeper cuts spike harder), self-limiting in this regime. The identical loop is divergent at low power / high void gain / degraded ORM — the Act III configuration. Restore flow to 80%.',
        },
        highlight: { control_label: 'MCP / Channel Flow', instrument_id: null },
        branches: [
          { trigger: { type: 'scram' }, goto: 'overpowered' },
          { trigger: { type: 'all', triggers: [
              { type: 'operator_action', command: 'set_channel_flow' },
              { type: 'instrument', instrument: 'power_range', direction: 'below', value: 51.0 },
            ] }, goto: 'complete' },
        ] },

      { id: 'complete',
        trigger: { type: 'delay', value: 1.5 },
        commentary: {
          learning: 'Flow restored, bubbles condensed, power settling back — the circle runs in reverse just as obediently. Carry this in your bones from now on: in a PWR, the physics is a hand pulling the plant back to center; in an RBMK, it is a hand pushing outward that the DESIGN must restrain — with flow rules, with rod rules, with the ORM floor. Every rule the Chernobyl crew broke was a finger of that restraining hand.',
          industry: 'Reverse response confirmed on restoration. Takeaway: RBMK stability is administrative + configurational, not intrinsic — flow maps, rod patterns, and the ORM floor substitute for the negative feedback a PWR gets free. Act III examines their removal.',
        },
        level_complete: {
          title: 'The Wrong-Way Machine — Felt',
          outcome_learning: 'You cut the water and the fire grew. Now you understand the sentence that explains 1986.',
          outcome_industry: 'Positive void coefficient demonstrated bidirectionally at 50%; stability caveats established.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },

      { id: 'overpowered',
        trigger: { type: 'delay', value: 1.5 },
        speed: 1,
        commentary: {
          learning: 'The reactor tripped — you just found the edge of "tame". Cut the water hard enough and the wrong-way circle outruns even half power: the spike climbed past rated before the protection slammed it shut. Remember the feel of that — at Chernobyl there was no margin left for the protection to save. No harm here. Rewind or Retry, and this time ease the flow to 60%, not off a cliff.',
          industry: 'Protective trip during the flow experiment — void-driven overpower from an excessive flow cut (or manual AZ-5). The demonstration regime is tame only for bounded cuts. Rewind/Retry with the 80→60% evolution.',
        },
        level_complete: {
          title: 'The Wrong-Way Machine — It Bit',
          outcome_learning: 'The circle points toward MORE, and you gave it room to run. Gentler this time.',
          outcome_industry: 'Trip during the void demonstration. Re-run with the bounded flow cut.',
          actions: ['continue', 'retry', 'rewind'],
        },
        advance: 'end' },
    ],
  };

})(globalThis.RD || (globalThis.RD = {}));
