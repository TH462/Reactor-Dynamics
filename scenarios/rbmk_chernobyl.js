/*
 * rbmk_chernobyl.js — Chernobyl (RBMK campaign, Act III boss — a witnessing).
 *
 * 01:23 AM, April 26 1986, recreated from the low_power_xenon state the
 * engine's flagship suite validates: 7% power, deep xenon, ORM below eight
 * rods, void gain amplified. On the pre-1986 design this state is beyond
 * saving — the engine runs away within seconds whether or not AZ-5 is
 * pressed (pressing it makes the finish worse: the graphite tips). The
 * scenario embraces that truth: this is a WITNESSING, not a puzzle. The
 * player's playable rematch is the next mission, on the rebuilt machine.
 *
 * Beat timing is tight by physics (destruction ~13 s in): short live beats,
 * with the full teaching carried by the aftermath commentary.
 */
;(function (RD) {
  'use strict';

  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.rbmk_chernobyl = {
    id: 'rbmk_chernobyl',
    title: 'Chernobyl — 01:23:40',
    plant_id: 'rbmk',
    design_version: 'pre_chernobyl',
    initial_state: 'low_power_xenon',
    mode: 'demonstration',
    description: 'April 26, 1986. The die is already cast. Watch the last thirteen seconds of Reactor Number Four.',
    beats: [

      { id: 'intro',
        trigger: { type: 'time', value: 0.6 },
        commentary: {
          learning: 'Unit 4, 01:23 AM. Look at your board and read the trap: power seven percent, the core drowning in xenon, and the ORM gauge — under eight rods, half the legal minimum, because the crew pulled almost everything out to fight the poison. The turbine test has begun; pump flow is falling; the bubbles are growing. Everything you have learned is on this board. There is nothing anyone can do from here. Watch.',
          industry: '01:23:04–01:23:40 reconstruction: ~200 MWt (7%), deep xenon pit, ORM < 8 rods (limit 15), rundown test in progress, coolant flow decaying, void gain at maximum. No recovery exists from this configuration. Observe.',
        },
        advance: 'wait_for_trigger' },

      { id: 'runaway',
        trigger: { type: 'true_state', field: 'power_pct', direction: 'above', value: 12.0 },
        commentary: {
          learning: 'It begins — the bubbles are making power and the power is making bubbles. The circle you felt at half power, with no brakes left to catch it.',
          industry: 'Void-power excursion initiating: +void → +ρ with no compensating absorber inventory. Divergent.',
        },
        advance: 'wait_for_trigger' },

      { id: 'az5',
        trigger: { type: 'true_state', field: 'power_pct', direction: 'above', value: 40.0 },
        // Deliberately terse: this card lives ~1 second before the explosion
        // replaces it (playtest). The graphite-tip mechanism is taught in the
        // aftermath card, which stays on screen.
        commentary: {
          learning: 'AZ-5! — the operator slams the scram button. Watch the power JUMP.',
          industry: 'AZ-5 at 01:23:40. Positive scram effect initiating — see aftermath analysis.',
        },
        commands: [{ action: 'scram' }],
        advance: 'wait_for_trigger' },

      { id: 'destroyed',
        trigger: { type: 'true_state', field: 'melted', direction: 'is_true' },
        commentary: {
          learning: 'Steam explosion. The core is gone — power spiked to something like a hundred times rated in under four seconds, the water flashed, and the reactor tore itself apart. And the trigger was the shutdown button itself: the pre-1986 rods enter GRAPHITE TIP FIRST, displacing water — adding reactivity — at the bottom of the core before any boron arrives. For two seconds, the brake pedal was an accelerator. Now breathe, and understand what you watched. The explosion took seconds, but it was BUILT over hours: a test delayed into the night shift; power allowed to slump into the xenon pit; rods pulled far past the ORM floor to drag it back; safety systems disabled one by one because each seemed to stand in the test\'s way. Every step made the next one look reasonable. Two honest notes about this simulation: it treats the core as one lump — the real excursion began in one corner of a 7-meter core, which is worse; and it ends at the destruction — the graphite fire, the releases, the human cost that followed are history\'s to tell, not this trainer\'s. There is no Rewind that saves Unit 4 from 01:23. The rescue happened — or did not — at 00:28, when the ORM crossed fifteen rods. Machines fail at the speed of physics, but they are doomed at the speed of decisions. Continue: the next machine you stand in front of is the one they rebuilt.',
          industry: 'Prompt-critical excursion, ~100× rated in <4 s, steam explosion, core destroyed. Causal chain: schedule pressure → xenon pit entry → ORM violation (<8 vs 15) → EPS/protection defeats → maximum-void-gain configuration → positive scram effect as initiator-of-record. Model notes: point kinetics (real event was spatially localized — more severe), simulation terminates at destruction (fire/release/consequence not modeled). No recovery branch exists by design; the decision surface closed at the ORM floor. Post-1986 design review follows.',
        },
        level_complete: {
          title: 'Chernobyl — Witnessed',
          outcome_learning: 'Thirteen seconds of physics, built by six hours of decisions. You saw both.',
          outcome_industry: '1986 excursion reproduced: xenon pit + ORM violation + positive void gain + positive scram effect. Root causes reviewed.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },
    ],
  };

})(globalThis.RD || (globalThis.RD = {}));
