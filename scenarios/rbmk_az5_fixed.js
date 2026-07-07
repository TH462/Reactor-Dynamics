/*
 * rbmk_az5_fixed.js — The Rebuilt Machine (RBMK campaign, Act III finale).
 *
 * The player's rematch: the SAME low_power_xenon trap, but on the
 * post-1986 design — faster rods without graphite tips, added fixed
 * absorbers, enriched fuel, an enforced ORM floor. Probed truth: AZ-5
 * within the first seconds shuts this core down cleanly (power collapses,
 * no excursion); hesitation still lets the runaway win. One button, a few
 * seconds, and the entire meaning of "design matters" in the player's own
 * reflexes. Honesty beat covers the trainer's remaining gap (a real
 * post-1986 core should not be steam-explodable from here at all — logged
 * engine tuning target).
 */
;(function (RD) {
  'use strict';

  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.rbmk_az5_fixed = {
    id: 'rbmk_az5_fixed',
    title: 'The Rebuilt Machine',
    plant_id: 'rbmk',
    design_version: 'post_chernobyl',
    initial_state: 'low_power_xenon',
    mode: 'free_response',
    description: 'Same trap. Same button. The machine they rebuilt after 1986 — you have seconds. Prove the fix.',
    beats: [

      { id: 'intro',
        trigger: { type: 'time', value: 0.5 },
        commentary: {
          learning: 'SAME BOARD — seven percent power, xenon pit, margin gone. But this is the RBMK they rebuilt after 1986: faster rods with the graphite tips cut off, extra absorbers bolted into the lattice, hotter fuel enrichment to blunt the void feedback. The runaway is already stirring. You have seconds. SLAM THE SCRAM BUTTON — NOW.',
          industry: 'Post-1986 configuration in the identical low-power/xenon/low-ORM state: tip-less fast rods (~12 s vs 18 s), fixed absorbers, 2.4% enrichment, reduced void gain. Excursion onset imminent. Immediate manual AZ-5 required.',
        },
        advance: 'wait_for_trigger' },

      { id: 'act',
        trigger: { type: 'delay', value: 0.3 },
        branches: [
          { trigger: { type: 'operator_action', command: 'scram' }, goto: 'saved' },
          { trigger: { type: 'true_state', field: 'melted', direction: 'is_true' }, goto: 'lost' },
        ] },

      { id: 'saved',
        trigger: { type: 'instrument', instrument: 'power_range', direction: 'below', value: 2.0 },
        commentary: {
          learning: 'Rods in — CLEAN. Power collapsing, void folding away, ORM climbing back as boron floods the lattice. Press pause on that feeling: in the OLD machine, the button you just pressed was the murder weapon; in this one it is a brake again, because engineers took the graphite tips off the rods and made them fall faster. Same trap, same hand, same button — different DESIGN, different century. That is the whole lesson of this campaign: physics does not negotiate, so the design must.',
          industry: 'AZ-5 effective: sub-2% and falling, no positive scram effect (displacers removed), shutdown authority restored. The 1986 initiator is engineered out; the identical operator action now terminates the identical precondition. Design-basis lesson complete.',
        },
        level_complete: {
          title: 'The Rebuilt Machine — The Fix Held',
          outcome_learning: 'You pressed the same button they pressed at 01:23:40 — and this time it was a brake. Design is destiny.',
          outcome_industry: 'Post-1986 AZ-5 demonstrated effective from the accident precondition. RBMK campaign complete.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },

      { id: 'lost',
        trigger: { type: 'delay', value: 1.0 },
        commentary: {
          learning: 'Too slow — the circle closed before the rods could. One honest admission from your trainer: a real post-1986 RBMK carries enough fixed absorber that this state should not be reachable at all, let alone explosive; this simulator still lets the runaway win if you stand still, and we have logged that gap. But the reflex this mission wanted from you is real and it is yours to keep: when an RBMK is low, poisoned, and stripped of margin, the only correct action is IMMEDIATE shutdown. Rewind. The button is waiting.',
          industry: 'Excursion completed before manual trip. Model note: post-1986 fixed-absorber inventory should preclude this configuration entirely (steam explosion from the pit violates design intent — logged engine tuning target, ops report). Training point stands: immediate AZ-5 on low-power/low-ORM/xenon entry. Rewind available.',
        },
        level_complete: {
          title: 'The Rebuilt Machine — Too Slow',
          outcome_learning: 'The fix needs a hand on the button. Rewind — you know which one.',
          outcome_industry: 'Manual trip not issued within the excursion window. Retry via Rewind.',
          actions: ['continue', 'retry', 'rewind'],
        },
        advance: 'end' },
    ],
  };

})(globalThis.RD || (globalThis.RD = {}));
