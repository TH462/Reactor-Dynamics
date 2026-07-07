/*
 * pwr_hook.js — "The Hook", the first-run onboarding scenario (Gameplay §7.1).
 *
 * In medias res: the player is dropped into a healthy PWR at full power, told
 * something is about to go wrong, and invited to press the one button everyone
 * knows — SCRAM. Then time is REWOUND (world scope: the plant rolls back, the
 * Instructor narrates on) to show what the trip protected, introducing the
 * Rewind mechanic as the game's core learning loop.
 *
 * Checkpoint arithmetic for the rewind beat: the ring holds
 *   cp0 (scenario load) · cp1 (press_it fires — PRE-scram) · cp2 (tripped) ·
 *   cp3 (what_happened) — so rewind {steps:3} lands on cp1, just before the
 * press. Beats that carry `rewind` do not push their own checkpoint.
 */
;(function (RD) {
  'use strict';

  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.pwr_hook = {
    id: 'pwr_hook',
    title: 'Welcome to the Control Room',
    plant_id: 'pwr',
    design_version: null,
    initial_state: 'hot_full_power',
    mode: 'guided',
    description: 'The 60-second intro: one dramatic button, one rewind.',
    beats: [

      { id: 'press_it',
        trigger: { type: 'time', value: 1.5 },
        commentary: {
          learning: 'This is a nuclear power plant at full power — and something is about to go wrong. You have one job: press the big red SCRAM button. Now.',
          industry: 'PWR at 100%. Initiate a manual reactor trip: SCRAM. Now.',
        },
        highlight: { view: null, control_label: 'SCRAM', instrument_id: null },
        // Everything except the trip (and alarm acks) is gated off — one button.
        gate: { allow_actions: ['scram', 'manual_scram', 'acknowledge_alarm', 'acknowledge_all_alarms'], until: { type: 'scram' } },
        advance: 'wait_for_trigger' },

      { id: 'tripped',
        trigger: { type: 'scram' },
        commentary: {
          learning: 'BANG — the control rods just dropped into the core under gravity. Watch the power gauge collapse — and notice the turbine load drops to zero too. A real reactor trip rejects generator load automatically.',
          industry: 'Manual trip. Rods inserted; power collapsing to decay heat. Turbine load rejected (disconnected). Annunciators active — expected response.',
        },
        advance: 'wait_for_trigger' },

      { id: 'what_happened',
        trigger: { type: 'delay', value: 10.0 },
        commentary: {
          learning: 'The reactor is shut down, but look — it is still making heat. That glow is decay heat: a few percent of full power that no button can turn off. Everything else in this control room exists to keep carrying that heat away. That is the whole game.',
          industry: 'Post-trip state: decay heat on the primary, ~2% and falling. Heat-sink management is now the mission — as it always is.',
        },
        advance: 'wait_for_trigger' },

      { id: 'rewind_time',
        trigger: { type: 'delay', value: 10.0 },
        rewind: { steps: 3 },   // → cp1: the moment before the press
        commentary: {
          learning: 'Now watch this: we just REWOUND TIME. The reactor is running again — it is a second before you pressed the button. In here, mistakes are never final: the ⏪ Rewind button takes you back to any decision. Experiment. Break things. Rewind.',
          industry: 'World-state rewound to the pre-trip checkpoint. The Rewind control restores any prior checkpoint — instruments, PRNG and all. Use it freely.',
        },
        advance: 'wait_for_trigger' },

      { id: 'go_play',
        trigger: { type: 'delay', value: 8.0 },
        commentary: {
          learning: 'You are free. Press SCRAM again, or just watch it run. When you want more: the Training tab has scenarios — including the night at Three Mile Island — and the Operator\'s Manual walks you through running this plant for real.',
          industry: 'Free play. Training tab: authored scenarios (TMI flagship). Manual: validated operating procedures with Instructor follow.',
        },
        level_complete: {
          title: 'Welcome to the Control Room',
          outcome_learning: 'You tripped a reactor and rewound time. The Training tab is open whenever you are.',
          outcome_industry: 'Intro complete: manual trip + checkpoint rewind demonstrated. Scenarios and procedure follows are on the Training tab.',
          actions: ['continue'],
        },
        advance: 'end' },
    ],
  };

})(globalThis.RD || (globalThis.RD = {}));
