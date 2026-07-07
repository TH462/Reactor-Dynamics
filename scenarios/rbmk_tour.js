/*
 * rbmk_tour.js — The Other Machine (RBMK campaign, Act I mission 1).
 *
 * Orientation at 50% on the pre-1986 design: pressure tubes instead of a
 * vessel, graphite doing the moderating, water boiling INSIDE the core, and
 * the consequence that defines everything — in this reactor, losing water
 * ADDS reactivity. Observation mission (time-chained beats); the player's
 * hands-on proof comes next in "The Wrong-Way Machine".
 */
;(function (RD) {
  'use strict';

  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.rbmk_tour = {
    id: 'rbmk_tour',
    title: 'The Other Machine',
    plant_id: 'rbmk',
    design_version: 'pre_chernobyl',
    initial_state: '50_percent',
    mode: 'demonstration',
    description: 'Same atom, opposite philosophy: meet the reactor that boils in its core and moderates with graphite.',
    beats: [

      { id: 'intro',
        trigger: { type: 'time', value: 2.0 },
        commentary: {
          learning: 'Forget the PWR for a minute — this machine answers every design question differently. There is no giant steel vessel: the fuel sits in nearly 1,700 separate pressure TUBES, each one a little reactor channel with water flowing up through it. Around the tubes stands a colossal block of GRAPHITE — over a thousand tons of it. This is an RBMK, the reactor of Soviet scale: big, cheap to fuel, refuelable while running. And it is the machine that failed at Chernobyl. By the end of this act you will understand exactly why.',
          industry: 'RBMK-1000 orientation, pre-1986 configuration, 50% power. Channel-type design: ~1,660 pressure tubes in a graphite stack; no pressure vessel, no Western-style containment; online refueling. Design lineage context: Chernobyl unit type.',
        },
        advance: 'wait_for_trigger' },

      { id: 'boiling',
        trigger: { type: 'delay', value: 26.0 },
        commentary: {
          learning: 'Watch the VOID FRACTION gauge — around a third of the water in those channels is steam bubbles RIGHT NOW. In your PWR, boiling in the core was forbidden; here it is the whole idea: the water boils in the channels, steam drums separate it, and it drives the turbines directly. No steam generators, no second loop. Efficient — and it puts bubbles right next to the fuel, which is about to matter enormously.',
          industry: 'Direct-cycle boiling channels: ~30–40% exit void at power, steam separated in drums, direct to turbines. No SG barrier. Core void is a first-order reactivity actor — next beat.',
        },
        advance: 'wait_for_trigger' },

      { id: 'roles',
        trigger: { type: 'delay', value: 28.0 },
        commentary: {
          learning: 'Here is the sentence that explains 1986 — read it twice. In your PWR, water did TWO jobs: it slowed neutrons down (making fission possible) and it carried heat. Lose the water there, and the chain reaction starves. In the RBMK, the GRAPHITE does the slowing — the water mostly just carries heat... and absorbs a few neutrons while doing it. So when RBMK water turns to steam bubbles, the reactor does not lose its moderator. It loses an ABSORBER. Less absorber means MORE power. More power boils MORE water. In the wrong conditions, that circle feeds itself.',
          industry: 'The defining physics: graphite moderation decouples moderation from coolant. Coolant is a parasitic absorber → void displaces absorption → positive void coefficient of reactivity. Void→power→void loop is conditionally stable (strongly power- and configuration-dependent).',
        },
        advance: 'wait_for_trigger' },

      { id: 'orm_intro',
        trigger: { type: 'delay', value: 24.0 },
        commentary: {
          learning: 'One more gauge before your hands-on: the ORM — Operating Reactivity Margin. It counts how many control rods\' worth of shutdown authority you are holding in reserve, and right now it reads a healthy number. Soviet rules said never drop below 15 effective rods. Remember this gauge. At Chernobyl, in the small hours of April 26th, it read less than eight — and every one of those missing rods was a piece of the brake pedal the crew had already spent.',
          industry: 'ORM (operational reactivity margin, effective-rod units) — the RBMK\'s licensed shutdown-authority bookkeeping. Procedural floor: 15 rods (post-accident: hard interlock). ORM erosion via xenon compensation is the accident precondition to watch in Act III.',
        },
        advance: 'wait_for_trigger' },

      { id: 'complete',
        trigger: { type: 'delay', value: 20.0 },
        commentary: {
          learning: 'That is the machine: seventeen hundred boiling tubes in a graphite mountain, no second loop, a reactivity coefficient pointing the wrong way, and a margin gauge that is really a promise. Next mission, you will push on that wrong-way physics with your own hands — gently, and at a power level where it is tame.',
          industry: 'Orientation complete: channel design, direct cycle, positive void coefficient, ORM discipline. Proceed to the interactive void-coefficient demonstration.',
        },
        level_complete: {
          title: 'The Other Machine — Oriented',
          outcome_learning: 'You can now read the RBMK\'s board — and you know which of its numbers points the wrong way.',
          outcome_industry: 'RBMK design rationale and void-coefficient physics briefed at 50% power.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },
    ],
  };

})(globalThis.RD || (globalThis.RD = {}));
