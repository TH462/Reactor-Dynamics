/*
 * pwr_chain_reaction.js — The Chain Reaction (campaign Act I, mission 3).
 *
 * First contact with reactor physics, at hot_zero_power: the core is quiet
 * but never dead (the neutron source and subcritical multiplication), rods
 * are the throttle, criticality is a balance — not a switch — and the
 * startup-rate meter is how you read the balance. The player takes the core
 * critical with their own hands, watches a gentle rise, then puts it back.
 *
 * The mission is gated to rod commands only (novice's first drive). The rise
 * phase runs at modest acceleration so a textbook-gentle startup rate still
 * reads as motion on the gauges. Honesty beat: real plants watch this on
 * dedicated source-range instruments; our power_range meter covers the span.
 */
;(function (RD) {
  'use strict';

  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.pwr_chain_reaction = {
    id: 'pwr_chain_reaction',
    title: 'The Chain Reaction',
    plant_id: 'pwr',
    design_version: null,
    initial_state: 'hot_zero_power',
    mode: 'guided',
    description: 'Take the core critical with your own hands — and learn why it is a balance, not a switch.',
    beats: [

      { id: 'intro',
        trigger: { type: 'time', value: 2.0 },
        commentary: {
          learning: 'The reactor is shut down — and yet your power meter is not reading zero. Look closely: a tiny trickle. A built-in neutron source keeps a faint drizzle of neutrons alive in the core, and each one triggers a short, dying family of fissions. That floor of activity is deliberate: it means the instruments can always see the core, and a startup is never a blind leap.',
          industry: 'Hot zero power, subcritical. Indicated flux is source-driven subcritical multiplication (P ≈ S·Λ/−ρ) — the design guarantee that startup is instrumented, never source-blind. Note the startup-rate meter at zero.',
        },
        gate: { allow_actions: ['rod_start', 'rod_stop', 'rod_nudge', 'scram', 'manual_scram', 'acknowledge_alarm', 'acknowledge_all_alarms'],
                message: 'Rods only for this lesson — everything else is locked.' },
        advance: 'wait_for_trigger' },

      { id: 'pull_rods',
        trigger: { type: 'delay', value: 12.0 },
        commentary: {
          learning: 'The control rods are neutron sponges pushed down into the core. HOLD the rod WITHDRAW control (on the Reactor card) and keep it held. As the sponges lift out, each neutron family lives a little longer, and the trickle multiplies. Watch two readings while you pull: POWER, and STARTUP RATE — the small readout on the Reactor card that tells you how fast power is changing. When it swings clearly positive, the chain reaction has become self-sustaining. That moment is called criticality.',
          industry: 'Withdraw the control bank continuously. Monitor SUR (Reactor card readout, or Tools → Reactivity Computer): subcritical multiplication lengthens as ρ → 0; sustained positive SUR marks criticality. Target a controlled positive SUR, not a step.',
        },
        highlight: { control_label: 'Control Bank', instrument_id: null },
        advance: 'wait_for_trigger' },

      { id: 'critical',
        trigger: { type: 'instrument', instrument: 'power_range', direction: 'above', value: 1.0 },
        commentary: {
          learning: 'THERE — the power meter just came alive and crossed one percent, and it is CLIMBING. While the rods were rising you saw little blips on the startup-rate meter — the source trickle multiplying, then dying back each time you stopped. This is different: the chain reaction is feeding itself now. You just took a nuclear reactor critical. STOP the rods and watch — the climb continues without you.',
          industry: 'Power through 1% and rising on its own period — critical (with the coarse lumped bank, expect overshoot; a real approach uses fine control near ρ=0). Stop rod motion and observe the self-sustained rise.',
        },
        // Real time here on purpose: this is the mission's climax card, and the
        // 1% → 3% climb is its reading window (playtest: at 5× it lasted ~4 s).
        speed: 1,
        advance: 'wait_for_trigger' },

      { id: 'reinsert',
        trigger: { type: 'any', triggers: [
          { type: 'instrument', instrument: 'power_range', direction: 'above', value: 3.0 },
          { type: 'delay', value: 120.0 },
        ] },
        commentary: {
          learning: 'Power has climbed whole decades from that quiet floor — a hundred-thousand-fold, and rising after your hands left the controls. That is the signature of criticality: the rise sustains itself. (Feel it wanting to overshoot? This trainer’s rods are deliberately coarse — real startups creep up on this moment.) Now take it away: HOLD rod INSERT and push the sponges back in. Watch power turn around and fall — but never to zero. The source never sleeps.',
          industry: 'Multi-decade self-sustained rise demonstrated. Insert the bank: power turns over and decays toward the source-driven subcritical floor — not zero. Note the floor for your 1/M intuition.',
        },
        speed: 5,
        advance: 'wait_for_trigger' },

      { id: 'complete',
        trigger: { type: 'all', triggers: [
          { type: 'instrument', instrument: 'power_range', direction: 'below', value: 0.5 },
          { type: 'delay', value: 10.0 },
        ] },
        commentary: {
          learning: 'Subcritical again — the families of fissions are dying out faster than they are born, and power is sliding back down toward that quiet source-fed floor. One honest note: a real control room watches a startup on dedicated source-range and intermediate-range detectors; this simulator shows you the same physics on a single wide-range meter. You have now seen the full heartbeat: source → critical → rise → shutdown.',
          industry: 'Negative SUR confirmed; power decaying to the subcritical floor. Model note: source/intermediate/power ranges are collapsed into one wide-range channel here — the physics (1/M, period, SUR) is unchanged. Startup fundamentals complete.',
        },
        speed: 1,
        level_complete: {
          title: 'The Chain Reaction — Mastered',
          outcome_learning: 'You took a reactor critical, watched it climb on its own rhythm, and put it back to sleep — and its instruments never went dark.',
          outcome_industry: 'Criticality approach, stable-period rise, and return to subcritical demonstrated with SUR as the primary indication.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },
    ],
  };

})(globalThis.RD || (globalThis.RD = {}));
