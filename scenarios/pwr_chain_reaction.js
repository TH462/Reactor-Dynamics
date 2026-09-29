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
    description: 'From Mode 3, Hot Standby, take the core critical with your own hands to Mode 2, Startup — and learn why it is a balance, not a switch.',
    // NO SETUP (rc8f, 2026-09-27). This mission used to secure the source-range counter before
    // the lesson with `set_sr_detector`, which the shipped plant REFUSES — under the owner's
    // 2026-09-26 ruling "B" the SR detector's high voltage goes with the P-6 trip block, and P-6
    // (1e-10 A intermediate range) is NOT met at hot zero power (measured on the shipped engine:
    // 1.6e-11 A, SR ~500 cps). Unblocked, a held pull trips on SOURCE RANGE HIGH FLUX (1e5 cps)
    // before power reaches 1 %. So the player takes the block at P-6 — the p6_block beat.
    beats: [

      { id: 'intro',
        trigger: { type: 'time', value: 2.0 },
        commentary: {
          learning: 'The reactor is shut down — and yet your power meter is not reading zero. Look closely: a tiny trickle. A built-in neutron source keeps a faint drizzle of neutrons alive in the core, and each one triggers a short, dying family of fissions. That floor of activity is deliberate: it means the instruments can always see the core, and a startup is never a blind leap.',
          industry: 'Hot zero power, subcritical. Indicated flux is source-driven subcritical multiplication (P ≈ S·Λ/−ρ) — the design guarantee that startup is instrumented, never source-blind. Note the startup-rate meter at zero.',
        },
        gate: { allow_actions: ['rod_start', 'rod_stop', 'rod_nudge', 'set_trip_block', 'set_sr_detector', 'scram', 'manual_scram', 'acknowledge_alarm', 'acknowledge_all_alarms'],
                message: { learning: 'Rods (and the one trip block you will be asked for) only for this lesson — everything else is locked.',
                           industry: 'Rod controls and the P-6 source-range block only for this evolution; all other panels are gated.' } },
        advance: 'wait_for_trigger' },

      { id: 'pull_rods',
        trigger: { type: 'delay', value: 12.0 },
        commentary: {
          learning: 'The control rods are neutron sponges pushed down into the core. HOLD the rod WITHDRAW control (on the Reactor card) and keep it held. As the sponges lift out, each neutron family lives a little longer, and the trickle multiplies. Watch two readings while you pull: POWER, and STARTUP RATE — the small readout on the Reactor card that tells you how fast power is changing. When it swings clearly positive, the chain reaction has become self-sustaining. That moment is called criticality.',
          industry: 'Withdraw the control bank continuously. Monitor SUR (Reactor card readout, or Tools → Reactivity Computer): subcritical multiplication lengthens as ρ → 0; sustained positive SUR marks criticality. Target a controlled positive SUR, not a step.',
        },
        highlight: { control_label: 'Control Bank', instrument_id: null },
        advance: 'wait_for_trigger' },

      // P-6 (OWNER RULING 2026-09-26, "B"): the intermediate range comes on scale partway up
      // the approach, and the source-range trip must be BLOCKED before 1e5 cps or it ends the
      // climb. Keyed on the EFFECT (the SR detector de-energized), which the block produces on
      // the shipped engine and `set_sr_detector` produces on the retired one.
      { id: 'p6_block',
        trigger: { type: 'all', triggers: [
          { type: 'delay', value: 3.0 },
          { type: 'instrument', instrument: 'intermediate_range', direction: 'above', value: 1e-10 },
        ] },
        speed: 1,
        commentary: {
          learning: 'Pause the pull for a moment. The INTERMEDIATE RANGE — the second, less sensitive neutron gauge on the Power card — has just come on scale. That is the P-6 permissive, and it lets you do one thing: open TRIP BLOCKS and press BLOCK on SOURCE RANGE HIGH FLUX. The source-range counter is so sensitive it trips the reactor at 100,000 counts, long before one percent power; blocking it switches its detector off and hands the watch to the intermediate range. Block it, then keep pulling.',
          industry: 'P-6 (IR ≥ 1E-10 A). Block the source-range high-flux trip (TRIP BLOCKS → SOURCE RANGE HIGH FLUX → BLOCK); detector high voltage is removed with the block. The SR trip (1E5 cps) will otherwise terminate the approach. Resume withdrawal after the block.',
        },
        branches: [
          { trigger: { type: 'true_state', field: 'sr_energized', direction: 'is_false' }, goto: 'p6_taken' },
          { trigger: { type: 'scram' }, goto: 'tripped_sr' },
        ] },

      { id: 'p6_taken',
        trigger: { type: 'delay', value: 1.0 },
        commentary: {
          learning: 'Blocked — the source-range counter now reads a dash, and the intermediate range carries the watch. Back to the rods: HOLD WITHDRAW and watch the startup rate.',
          industry: 'SR blocked at P-6; IR carrying the watch. Resume withdrawal; monitor SUR.',
        },
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
          learning: 'Subcritical again — the families of fissions are dying out faster than they are born, and power is sliding back down toward that quiet source-fed floor. One honest note: a real startup is watched on dedicated source-range and intermediate-range detectors, with a handoff between them on the way up — this plant has both (the NIS block on the Power card), and you made that handoff yourself when you blocked the source range at P-6. The full by-the-book startup, handoff included, is in the operating procedures. You have now seen the full heartbeat: source → critical → rise → shutdown.',
          industry: 'Negative SUR confirmed; power decaying to the subcritical floor. SR→IR handoff executed at P-6 (SR high-flux trip, 1E5 cps, blocked; detector de-energized). Startup fundamentals complete.',
        },
        speed: 1,
        level_complete: {
          title: 'The Chain Reaction — Mastered',
          outcome_learning: 'You took a reactor critical, watched it climb on its own rhythm, and put it back to sleep — and its instruments never went dark.',
          outcome_industry: 'Criticality approach, stable-period rise, and return to subcritical demonstrated with SUR as the primary indication.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },

      { id: 'tripped_sr',
        trigger: { type: 'delay', value: 1.5 },
        speed: 1,
        commentary: {
          learning: 'A trip — the source-range counter saw the rise and did its job. It trips the reactor at 100,000 counts, a tiny fraction of one percent power, unless you block it once the intermediate range is on scale (P-6). Retry, and when I call P-6, take the block before you keep pulling.',
          industry: 'Reactor trip on SR high flux (1E5 cps): the P-6 block was not taken. Retry; block the SR trip at P-6 before continuing the approach.',
        },
        level_complete: {
          title: 'The Chain Reaction — Source Range Trip',
          outcome_learning: 'The counter you did not block was the one watching. Block it at P-6, then climb.',
          outcome_industry: 'SR high-flux trip during the approach: P-6 block omitted.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },
    ],
  };

})(globalThis.RD || (globalThis.RD = {}));
