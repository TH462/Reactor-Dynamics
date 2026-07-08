/*
 * bwr_qualify.js — BWR Operator Exam (BWR campaign finale).
 *
 * A precision power-maneuver examination on the recirc throttle — the one
 * BWR evolution where the operator's judgment (not the automatics) decides
 * the outcome in this engine: take the plant from 50% to the 75–85% band
 * and hold it, without overshooting past 95% (measured ladder: ask 25 →
 * ~71%, 28 → ~79%, 32 → ~89%, 40+ → 110%+ sustained overpower with no
 * high-flux trip — the candidate must respect the map, because the
 * protection here will not save them from a sloppy ask). free_response;
 * one briefing, then silence until the outcome.
 */
;(function (RD) {
  'use strict';

  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.bwr_qualify = {
    id: 'bwr_qualify',
    title: 'BWR Operator Exam',
    plant_id: 'bwr',
    design_version: null,
    initial_state: '50_percent',
    mode: 'free_response',
    description: 'Take her from 50% to the 75–85% band and hold it — on the pumps alone. Overshoot, and you fail.',
    beats: [

      { id: 'briefing',
        trigger: { type: 'time', value: 2.0 },
        commentary: {
          learning: 'Final exam, operator. The dispatcher wants this plant between 75 and 85 percent power, and you will take it there with the recirculation flow alone and HOLD it. Two hard rules: cross 95 percent, you fail — and know before you touch anything that the flow control is powerful and this plant will NOT trip itself to save you from a greedy ask. Small steps. Let the foam settle between moves. I will not speak again until it is decided.',
          industry: 'Examination: power ascension 50% → 75–85% band via recirculation flow, sustained hold. Failure criteria: >95% power (no protective backstop for flow-induced overpower in this trainer — deliberate exam hazard) or reactor trip. Recommend incremental flow steps with settling time. No further prompts.',
        },
        advance: 'wait_for_trigger' },

      { id: 'exam',
        trigger: { type: 'delay', value: 8.0 },
        branches: [
          { trigger: { type: 'instrument', instrument: 'power_range', direction: 'above', value: 95.0 }, goto: 'failed_over' },
          { trigger: { type: 'scram' }, goto: 'failed_trip' },
          { trigger: { type: 'all', triggers: [
              { type: 'delay', value: 240.0 },
              { type: 'instrument', instrument: 'power_range', direction: 'above', value: 74.0 },
              { type: 'instrument', instrument: 'power_range', direction: 'below', value: 86.0 },
            ] }, goto: 'passed' },
        ] },

      { id: 'passed',
        trigger: { type: 'delay', value: 2.0 },
        commentary: {
          learning: 'In the band, holding steady, rods never moved — a clean ascension on the pumps with the bubbles doing the fine control. You have now qualified on all three machines, and you have earned the three sentences that summarize them: the PWR follows its steam. The RBMK punishes the careless. The BWR follows its flow — and trusts its operator with the throttle. Congratulations, Senior Operator.',
          industry: 'Ascension to the 75–85% band achieved and held on recirculation control within all criteria. Tri-plant qualification complete: demand-following (PWR), administrative stability (RBMK), flow-control discipline (BWR).',
        },
        level_complete: {
          title: 'Qualified — BWR Senior Operator',
          outcome_learning: 'Three reactors, three philosophies, one operator who understands them all. The campaign is complete.',
          outcome_industry: 'Precision flow-control maneuver within band; full campaign qualification granted.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },

      { id: 'failed_over',
        trigger: { type: 'delay', value: 2.0 },
        commentary: {
          learning: 'Past 95 percent — the ask was too big and the plant gave you everything you asked for. Remember the briefing\'s warning: this machine\'s flow throttle is strong, and no automatic stepped in to save the sloppy hand. Real BWRs run to a flow MAP for exactly this reason. Rewind, and this time move in small steps and let each one settle.',
          industry: 'Overpower criterion violated (>95%). Flow-induced overpower unprotected in this trainer (high-flux trip cap — logged tuning gap doubles as exam hazard). Corrective: incremental asks, settle time, band discipline. Rewind available.',
        },
        level_complete: {
          title: 'Exam Failed — Overpower',
          outcome_learning: 'The throttle obeyed you perfectly — that was the problem. Small steps.',
          outcome_industry: 'Band overshoot >95%. Re-examine via Rewind.',
          actions: ['continue', 'retry', 'rewind'],
        },
        advance: 'end' },

      { id: 'failed_trip',
        trigger: { type: 'delay', value: 2.0 },
        commentary: {
          learning: 'The reactor tripped — the maneuver disturbed the plant enough that the protection ended your exam for you. A scram is always safe and never shameful... but the dispatcher is still waiting. Rewind and find the smoother path.',
          industry: 'Reactor trip during the maneuver — protection actuated on a transient the evolution induced. Review step sizes and settling. Rewind available.',
        },
        level_complete: {
          title: 'Exam Failed — Tripped',
          outcome_learning: 'Safe ending, failed exam. Smoother hands next time.',
          outcome_industry: 'Protective trip during ascension. Re-examine via Rewind.',
          actions: ['continue', 'retry', 'rewind'],
        },
        advance: 'end' },
    ],
  };

})(globalThis.RD || (globalThis.RD = {}));
