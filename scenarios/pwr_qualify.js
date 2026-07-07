/*
 * pwr_qualify.js — Senior Operator Exam (campaign Act V, mission 19).
 *
 * The final exam runs on the plant's most-validated upset physics: a PORV
 * sticks open at power while its indicator reads CLOSED (the TMI mechanism,
 * proven by scenarios/pwr_tmi.js and the pwr_stuck_porv procedure) — but
 * this time there is NO narrator. One briefing beat, then silence until the
 * outcome. The candidate must recognize an invisible LOCA on instruments,
 * isolate it (PORV block valve), restore inventory (HPI as needed), and
 * hold subcooling margin.
 *
 * Grading is instrument-first (HR1): win/loss branches read the subcooling
 * margin the candidate can see; the core-inventory hard-fail is a documented
 * true_state backstop — by the time it fires, the board has told the story
 * a dozen ways. An inaction window catches the frozen candidate.
 *
 * Note: a station-blackout exam was designed first and abandoned — current
 * engine physics cannot survive an SBO under any operator strategy (SG level
 * pins at 20% under AFW, inventory drains through the PORV). Logged as a
 * tuning target; do not resurrect until the ops suite proves survivability.
 */
;(function (RD) {
  'use strict';

  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.pwr_qualify = {
    id: 'pwr_qualify',
    title: 'Senior Operator Exam',
    plant_id: 'pwr',
    design_version: null,
    initial_state: 'hot_full_power',
    mode: 'free_response',
    description: 'Something will go wrong. Nobody will tell you what. Qualify.',
    beats: [

      { id: 'briefing',
        trigger: { type: 'time', value: 2.0 },
        commentary: {
          learning: 'Final exam. Some time in the next few minutes, something on this plant will fail — and no one will announce it. Your instruments are your only truth; you have every control and every lesson from this campaign. Success means one thing: find it, stop it, and restore your margins. I will not speak again until it is over. Good luck, operator.',
          industry: 'Qualification scenario: unannounced malfunction, full board authority, no prompts. Success criteria: correct diagnosis, isolation of the fault, subcooling margin restored and held. Commencing.',
        },
        advance: 'wait_for_trigger' },

      // The fault: TMI mechanics, unannounced — the relief valve sticks open
      // while its indicator lies CLOSED. A sharp candidate may isolate on the
      // pressure trend alone (early branch); otherwise the eroding subcooling
      // margin arms the graded challenge.
      { id: 'fault',
        trigger: { type: 'delay', value: 25.0 },
        inject_failures: ['stuck_porv_open', 'porv_indicator_stuck_closed'],
        branches: [
          { trigger: { type: 'operator_action', command: 'close_block_valve' }, goto: 'verify_early' },
          { trigger: { type: 'alarm', alarm_id: 'subcooling_low' }, goto: 'challenge' },
        ] },

      // Isolated before the margin alarm — verify the recovery holds.
      { id: 'verify_early',
        trigger: { type: 'delay', value: 2.0 },
        branches: [
          { trigger: { type: 'all', triggers: [
              { type: 'delay', value: 180.0 },
              { type: 'instrument', instrument: 'subcooling_margin', direction: 'above', value: 11.5 },
            ] }, goto: 'passed' },
          { trigger: { type: 'alarm', alarm_id: 'subcooling_low' }, goto: 'challenge' },
        ] },

      // Margin eroding — the graded window is open.
      { id: 'challenge',
        trigger: { type: 'delay', value: 2.0 },
        branches: [
          { trigger: { type: 'true_state', field: 'core_inventory_pct', direction: 'below', value: 70.0 }, goto: 'failed_uncovered' },
          { trigger: { type: 'inaction', window: 600.0 }, goto: 'failed_frozen' },
          { trigger: { type: 'all', triggers: [
              { type: 'operator_action', command: 'close_block_valve' },
              { type: 'instrument', instrument: 'subcooling_margin', direction: 'above', value: 11.5 },
            ] }, goto: 'passed' },
        ] },

      { id: 'passed',
        trigger: { type: 'delay', value: 2.0 },
        commentary: {
          learning: 'Exam over — you passed. A relief valve stuck open and its indicator lied to your face, exactly as it lied to the crew at Three Mile Island. You read the pressure, believed the subcooling margin, isolated the block valve, and put the water back. There is nothing more this campaign can teach you.',
          industry: 'Unannounced stuck-open PORV with failed-closed indication: diagnosed on secondary indications, isolated via block valve, subcooling margin restored. Examination standard met in full.',
        },
        clear_failures: ['stuck_porv_open', 'porv_indicator_stuck_closed'],
        level_complete: {
          title: 'Qualified — Senior Reactor Operator',
          outcome_learning: 'An invisible LOCA, found and beaten on instruments alone. The campaign is complete: you understand this machine.',
          outcome_industry: 'Blind small-break LOCA isolated and recovered within all criteria. Qualification granted.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },

      { id: 'failed_frozen',
        trigger: { type: 'delay', value: 2.0 },
        commentary: {
          learning: 'Time. The board had been telling you for ten minutes: pressure sagging, subcooling margin bleeding away, a pressurizer behaving strangely — while one little light said CLOSED. You have seen this exact trap before, at Three Mile Island. Rewind, look at what the pressure did right after the fault, and act on the physics this time.',
          industry: 'No corrective action within the graded window despite converging indications of an open relief path. Review: PZR pressure trend, subcooling margin, PORV discharge indications. Rewind available.',
        },
        clear_failures: ['stuck_porv_open', 'porv_indicator_stuck_closed'],
        level_complete: {
          title: 'Exam Failed — The Board Was Speaking',
          outcome_learning: 'The instruments told the truth the whole time. Trust the margin, not the light.',
          outcome_industry: 'Inaction through the graded window. Re-examine via Rewind.',
          actions: ['continue', 'retry', 'rewind'],
        },
        advance: 'end' },

      { id: 'failed_uncovered',
        trigger: { type: 'delay', value: 2.0 },
        commentary: {
          learning: 'The water over the core fell too far — this is 1979 again, and this time you were in the room. The escape route was on your board the whole way: close the PORV block valve to plug the hole, high-pressure injection to refill. Rewind and change history — you have done it before.',
          industry: 'Core inventory criterion violated: uncorrected inventory loss through the open relief path. Required actions: block-valve isolation + HPI. Rewind to the challenge window available.',
        },
        clear_failures: ['stuck_porv_open', 'porv_indicator_stuck_closed'],
        level_complete: {
          title: 'Exam Failed — Core Uncovering',
          outcome_learning: 'The one unforgivable outcome — and the one you already know how to prevent. Isolate, inject, and the core keeps its blanket.',
          outcome_industry: 'Inventory challenge from an unisolated small-break LOCA. Standard remediation: isolate, restore inventory, verify margin.',
          actions: ['continue', 'retry', 'rewind'],
        },
        advance: 'end' },
    ],
  };

})(globalThis.RD || (globalThis.RD = {}));
