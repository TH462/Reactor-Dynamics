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
          learning: 'Final exam. The board is verified in its normal lineup as the exam begins. Some time in the next few minutes, something on this plant will fail — and no one will announce it. Your instruments are your only truth; you have every control and every lesson from this campaign. Success means one thing: find it, stop it, and restore your margins. I will not speak again until it is over. Good luck, operator.',
          industry: 'Qualification scenario: board restored to normal lineup at commencement; unannounced malfunction, full board authority, no prompts. Success criteria: correct diagnosis, isolation of the fault, subcooling margin restored and held. Commencing.',
        },
        advance: 'wait_for_trigger' },

      // The fault: TMI mechanics, unannounced — the relief valve sticks open
      // while its indicator lies CLOSED. A sharp candidate may isolate on the
      // pressure trend alone (early branch); otherwise the PRESSURIZER GOING
      // SOLID arms the graded challenge. The isolation branches grade the
      // block valve's true STATE (block_valve_open), not the command — a press
      // made before this beat fires would be wiped from the instructor's
      // action memory and previously left the exam unfinishable (playtest).
      // `open_block_valve` at injection enforces the briefed normal lineup, so
      // pre-emptively isolating during the briefing cannot cheese the exam.
      //
      // THE ARMING CUE WAS `subcooling_low` UNTIL #347, and re-pointing it is a
      // correction to the exam, not a concession. That alarm described a plant that
      // discarded its ECCS overfill (#346) and therefore drained through a stuck-open
      // relief valve no matter what injection did. With that fixed, safety injection
      // matches the valve and holds the RCS: measured hands-off for 40 minutes, the
      // margin sits at 149 °F (83 °C) and never moves, so the graded window never armed
      // and the exam could not be failed OR passed. What the plant does instead is go
      // WATER-SOLID — inventory 109.3 %, level pegged, PZR LEVEL HIGH standing from
      // T+23 s on every path — while the relief line quietly passes water to
      // containment behind a light that reads CLOSED.
      //
      // That is a harder exam and the same lesson. Nothing screams the obvious
      // parameter; the candidate has to notice a solid pressurizer being held solid by
      // injection against an unisolated path, and the hot tailpipe behind a "shut"
      // valve. `pzr_level_high` is the alarm that says so, and it is annunciated.
      //
      // RE-KEYED A THIRD TIME at #419 wave 3, same reason class as both priors: the cue
      // described the previous plant. On the re-anchored plant the deception CRESTS ~65 %
      // and never reaches the 75 % annunciator (measured: dip to 36, rise through 58 at
      // ~32 min, crest 65 at ~45 min, collapse ~47) — so the alarm-keyed window never
      // armed and the exam could not complete. The arming cue is now the deception's own
      // STATE signature: level back above its 55 % nominal and rising while inventory
      // falls — unambiguous on the board, and the same lesson. The crest-vs-annunciator
      // gap itself is flagged owner-review on #418/#419 (the 75 % cue is currently
      // unreachable in free play).
      { id: 'fault',
        trigger: { type: 'delay', value: 25.0 },
        commands: [{ action: 'open_block_valve' }],
        inject_failures: ['stuck_porv_open', 'porv_indicator_stuck_closed'],
        branches: [
          { trigger: { type: 'true_state', field: 'block_valve_open', direction: 'is_false' }, goto: 'verify_early' },
          { trigger: { type: 'true_state', field: 'pzr_level_pct', direction: 'above', value: 58 }, goto: 'challenge' },
        ] },

      // Isolated before the plant goes solid — verify the recovery holds.
      { id: 'verify_early',
        trigger: { type: 'delay', value: 2.0 },
        branches: [
          { trigger: { type: 'all', triggers: [
              { type: 'delay', value: 180.0 },
              { type: 'instrument', instrument: 'subcooling_margin', direction: 'above', value: 11.5 },
            ] }, goto: 'passed' },
          { trigger: { type: 'true_state', field: 'pzr_level_pct', direction: 'above', value: 58 }, goto: 'challenge' },
        ] },

      // The plant is solid on injection against an unisolated relief path — the graded
      // window is open. Pass = valve isolated (true state) AND margin held, in either
      // order; frozen = five minutes with the relief path still open (was ten —
      // playtest: the silent fail ran 11+ real minutes past the mission budget).
      //
      // THE UNCOVERY BRANCH IS KEPT THOUGH IT IS NOW UNREACHABLE ON THIS PATH (#347).
      // With injection matching the valve the core cannot uncover here — measured, the
      // minimum inventory across a 40-minute hands-off run is 99.2 %. It stays because it
      // guards the direction that matters: anything that weakens injection, strengthens
      // the valve, or brings back the #346 discard makes it reachable again, and this is
      // the branch that must catch it. An unreachable failure branch costs nothing; a
      // missing one costs the exam its worst outcome. `failed_frozen` is the live failure.
      { id: 'challenge',
        trigger: { type: 'delay', value: 2.0 },
        branches: [
          { trigger: { type: 'true_state', field: 'core_inventory_pct', direction: 'below', value: 70.0 }, goto: 'failed_uncovered' },
          { trigger: { type: 'all', triggers: [
              { type: 'true_state', field: 'block_valve_open', direction: 'is_false' },
              { type: 'instrument', instrument: 'subcooling_margin', direction: 'above', value: 11.5 },
            ] }, goto: 'passed' },
          { trigger: { type: 'all', triggers: [
              { type: 'inaction', window: 300.0 },
              { type: 'true_state', field: 'block_valve_open', direction: 'is_true' },
            ] }, goto: 'failed_frozen' },
        ] },

      { id: 'passed',
        trigger: { type: 'delay', value: 2.0 },
        commentary: {
          learning: 'Exam over — you passed. A relief valve stuck open and its indicator lied to your face, exactly as it lied to the crew at Three Mile Island. Nothing screamed: your margins stayed comfortable the whole time, because the emergency pumps were quietly replacing every drop the valve threw away. You caught it anyway — a pressurizer that went solid and stayed there, a hot tailpipe behind a shut light — and you isolated it. There is nothing more this campaign can teach you.',
          industry: 'Unannounced stuck-open PORV with failed-closed indication: diagnosed without margin degradation — SI make-up masked the loss — on solid-plant indication and relief-line temperature, isolated via block valve. Examination standard met in full.',
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
          learning: 'Time. Nothing was screaming — and that was the exam. Your margins never moved, because the emergency pumps were making up every drop the relief valve threw away, and they will go on doing that until the tank they draw from is empty. What the board WAS telling you, for five minutes: a pressurizer gone solid and pegged there, injection running that nothing asked you to stop, and a discharge line hot behind a light that said CLOSED. You have seen this exact trap before, at Three Mile Island. Rewind, look at the pressurizer level right after the fault, and act on the physics this time.',
          industry: 'No corrective action within the graded window. Note the absence of margin degradation: SI make-up was masking the loss, and does so only while the RWST lasts. Available indications: PZR level pegged high (solid plant), unterminated SI, relief-line temperature elevated against a closed PORV indication. Rewind available.',
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
