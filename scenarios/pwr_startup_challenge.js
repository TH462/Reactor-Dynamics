/*
 * pwr_startup_challenge.js — Criticality, Solo (campaign Act II capstone).
 *
 * The chain-reaction lesson, re-run as a checkpoint: the player takes the
 * core from hot-zero-power shutdown to CRITICAL and stabilizes between 1 %
 * and 10 % power — this time with the source-range counter live (the
 * chain-reaction mission secured it for them), so the SR→IR handoff is part
 * of the grade. One briefing card, one quiet word at criticality, then the
 * instruments do the talking (the pwr_qualify register).
 *
 * Probed calibration (scratchpad probe_startup1/2/3, seed 42):
 *   - HZP: SR reads ~5e2 cps, IR ~8e-9 A — P-6 is already satisfied, so
 *     set_sr_detector off is legal from the first second (the interlock only
 *     refuses in deep shutdown, IR < 1e-10 A).
 *   - SR left energized: its 1e5 cps trip ends the climb at t≈120 s
 *     (~0.017 % power); sr_energized stays TRUE after the scram (the auto
 *     re-energize actuation needs IR < 1e-10 A — hours away), so the
 *     diagnose beat can grade the handoff on true state.
 *   - Continuous pull reaches 1 % at ~157 s but the SUR interlock has
 *     already frozen the bank (2.5 DPM); the coast then runs 1 % → ~19 % in
 *     ~42 s and the IR trip (1.67e-3 A ≈ 20 %) scrams. On that runaway,
 *     power_range crosses 12 % a probed ~7 s before the trip — the
 *     overshoot branch always wins the race, so the excess-reactivity/IR-net
 *     lesson lives on the failed_high card; failed_trip catches the rest
 *     (manual scrams, pre-criticality trips).
 *   - Win line: stop the pull at 1 %, reinsert until SUR ≤ 0 (~6 steps of
 *     bank) — power then holds [1.0, 3.5] % for 6+ min. A lazy insert
 *     (SUR ~0.3) creeps through the band and out the top without tripping,
 *     which is why the overshoot branch and the time budget both exist
 *     (softlock-proofing: every trajectory reaches an endpoint).
 */
;(function (RD) {
  'use strict';

  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.pwr_startup_challenge = {
    id: 'pwr_startup_challenge',
    title: 'Criticality, Solo',
    plant_id: 'pwr',
    design_version: null,
    initial_state: 'hot_zero_power',
    mode: 'free_response',
    description: 'The Mode 3 → Mode 2 startup is yours alone: source to the band, handoff on the way, and nobody to catch you.',
    beats: [

      { id: 'briefing',
        trigger: { type: 'time', value: 2.0 },
        commentary: {
          learning: 'Your board, your startup. The reactor is shut down: control bank full in, the source-range counter alive at a few hundred counts. The exam is one clean solo startup — take the core critical and stabilize anywhere between 1 and 10 percent power, without a trip. Two protections are waiting to grade you. The source-range counter trips at 100,000 counts — barely 0.02 percent power — so secure it before your climb gets there; the intermediate range is already on scale to carry the watch. Above the band, the intermediate-range trip ends careless overshoots. Your startup-rate meter is the truth: pull gently, and remember that rods ADD reactivity only rods take back — the withdrawal interlock can freeze your hand, but it cannot subtract. The 1/M plot is there if you want it. One quiet word at criticality; after that, the instruments do the talking.',
          industry: 'Startup examination, solo. IC: HZP, control bank 0 steps, SR energized (~5e2 cps), IR on scale (P-6 satisfied). Task: establish criticality and stabilize in the 1–10 % band, executing the SR→IR handoff (de-energize SR before 1e5 cps) en route; no protective actuation. SUR withdrawal inhibit 2.5/1.5 DPM active; IR high-flux trip 1.67e-3 A (≈20 %). Single criticality acknowledgment; no further coaching. Commencing.',
        },
        advance: 'wait_for_trigger' },

      // Silent pre-criticality watch. Arms 45 s in (reading time for the
      // briefing card; the fastest possible SR trip is t≈120 s — probed, so
      // nothing gradeable can happen before the watch opens).
      { id: 'exam',
        trigger: { type: 'delay', value: 45.0 },
        branches: [
          { trigger: { type: 'scram' }, goto: 'diagnose' },
          { trigger: { type: 'instrument', instrument: 'power_range', direction: 'above', value: 1.0 }, goto: 'critical_marker' },
          { trigger: { type: 'time', value: 1800.0 }, goto: 'time_up' },
        ] },

      // The one quiet word. The graded hold: 120 s after this fires, in band
      // with the SR secured, in either order of achievement. The 12 % branch
      // intercepts every runaway (probed ~7 s ahead of the IR trip) AND the
      // slow creep that exits the band top without ever tripping.
      { id: 'critical_marker',
        trigger: { type: 'delay', value: 1.0 },
        commentary: {
          learning: 'Criticality — noted. The rest is yours: level the rise inside the band and hold it there.',
          industry: 'Sustained positive period through 1 % PR. Grading window open: stabilize 1–10 %.',
        },
        branches: [
          { trigger: { type: 'instrument', instrument: 'power_range', direction: 'above', value: 12.0 }, goto: 'failed_high' },
          { trigger: { type: 'scram' }, goto: 'diagnose' },
          { trigger: { type: 'all', triggers: [
              { type: 'delay', value: 120.0 },
              { type: 'instrument', instrument: 'power_range', direction: 'above', value: 1.0 },
              { type: 'instrument', instrument: 'power_range', direction: 'below', value: 10.0 },
              { type: 'true_state', field: 'sr_energized', direction: 'is_false' },
            ] }, goto: 'passed' },
          { trigger: { type: 'time', value: 1800.0 }, goto: 'time_up' },
        ] },

      // Post-scram diagnosis on true state: the SR switch position names the
      // likely killer. Probed stable for minutes either way (no re-energize
      // race — the P-6 auto re-energize needs IR < 1e-10 A).
      { id: 'diagnose',
        trigger: { type: 'delay', value: 1.5 },
        branches: [
          { trigger: { type: 'true_state', field: 'sr_energized', direction: 'is_true' }, goto: 'failed_sr' },
          { trigger: { type: 'true_state', field: 'sr_energized', direction: 'is_false' }, goto: 'failed_trip' },
        ] },

      { id: 'passed',
        trigger: { type: 'delay', value: 2.0 },
        commentary: {
          learning: 'Exam over — passed. You woke a dead-quiet core, walked it through criticality, and parked it inside the band with the source-range counter secured before its gate could object. The handoff happened when it had to, the rate never ran away from you, and the protection stayed a spectator. That is the whole craft of a startup: reactivity in small honest amounts, instruments believed, trips never consulted.',
          industry: 'Solo startup complete: criticality established, SR de-energized ahead of the 1e5 cps gate, power stabilized 1–10 % with zero protective actuations. Examination standard met in full.',
        },
        level_complete: {
          title: 'Criticality, Solo — Clean Startup',
          outcome_learning: 'Source to the band, handoff on time, trips left untouched. A startup with your name on it.',
          outcome_industry: 'Graded solo startup: criticality, SR→IR handoff, and band stabilization demonstrated without protective actuation.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },

      { id: 'failed_sr',
        trigger: { type: 'delay', value: 1.5 },
        speed: 1,
        commentary: {
          learning: 'A trip — and the source-range counter was still energized when it came. Its gate sits at 100,000 counts, about two-hundredths of one percent power: it ends every climb that forgets it. That is not a nuisance — at shutdown that counter is the only protection that can see the core at all. The handoff discipline: confirm the intermediate range is on scale (here it is, from the first second), secure the source range, THEN climb. Rewind and run it again.',
          industry: 'Reactor trip with SR channel energized — SR high-flux (1e5 cps ≈ 2e-4 rated power). Required sequence: verify IR on scale (P-6 satisfied), de-energize SR, then continue the ascent. Re-examination via Rewind/Retry.',
        },
        level_complete: {
          title: 'Startup Ended — Source Range Trip',
          outcome_learning: 'The counter you forgot was the one watching. Secure it before the climb, not after.',
          outcome_industry: 'SR high-flux trip during ascent: SR→IR handoff omitted. Re-run required.',
          actions: ['continue', 'retry', 'rewind'],
        },
        advance: 'end' },

      { id: 'failed_trip',
        trigger: { type: 'delay', value: 1.5 },
        speed: 1,
        commentary: {
          learning: 'A trip, with the handoff already done — so the machine caught you on the physics, not the counter. The sobering arithmetic of startup rate: at two decades per minute, one percent becomes twenty in under a minute, and the intermediate-range net waits exactly there. The withdrawal interlock froze your bank when the rate hit 2.5 DPM, but an interlock cannot subtract reactivity — only insertion can. Stop pulling the moment power comes alive, and kill the rate before it kills the run.',
          industry: 'Reactor trip during the graded startup with SR secured. Review: SUR management — terminate withdrawal at criticality, insert to null SUR inside the band; the withdrawal inhibit (≥2.5 DPM) limits addition but removes nothing. Re-examination via Rewind/Retry.',
        },
        level_complete: {
          title: 'Startup Ended — Tripped on the Climb',
          outcome_learning: 'The interlock held your hand; it could not take back what you had already added. Insert early.',
          outcome_industry: 'Protective/manual trip during ascent. Re-run with SUR nulled on band entry.',
          actions: ['continue', 'retry', 'rewind'],
        },
        advance: 'end' },

      { id: 'failed_high',
        trigger: { type: 'delay', value: 1.5 },
        speed: 1,
        commentary: {
          learning: 'You made criticality — and then let the rise slide past the top of the band. Above ten percent this exam is over, and on a trajectory like this the intermediate-range trip at twenty percent is only seconds behind. The rise feels gentle right up until the decades start arriving; what parks a startup is insertion, early and unhurried, the moment power enters the band. Rewind and put the brakes on sooner.',
          industry: 'PR > 12 % — grading ceiling (10 %) exceeded; IR high-flux (1.67e-3 A ≈ 20 %) imminent on the observed trajectory. Examination terminated. Corrective: null SUR by insertion on band entry; excess reactivity from the pull must be removed, not ridden.',
        },
        level_complete: {
          title: 'Startup Ended — Band Overshot',
          outcome_learning: 'Critical, yes — controlled, no. The band is the exam; hold the rise inside it.',
          outcome_industry: 'Band ceiling exceeded post-criticality. Re-run with earlier insertion.',
          actions: ['continue', 'retry', 'rewind'],
        },
        advance: 'end' },

      { id: 'time_up',
        trigger: { type: 'delay', value: 1.5 },
        speed: 1,
        commentary: {
          learning: 'Time. The window closed with the reactor not where it was asked to be — still asleep below the band, or parked stubbornly above it. A startup is a finite evolution: a steady pull to criticality, a measured rise, insertion to level it, and done. Rewind, and this time drive it all the way into the band and hold.',
          industry: 'Examination window (30 min) expired without a stabilized 1–10 % hold. Review withdrawal pacing and band-entry insertion. Re-examination via Rewind/Retry.',
        },
        level_complete: {
          title: 'Startup Ended — Window Closed',
          outcome_learning: 'The core will wait forever; the exam will not. Into the band, level, hold.',
          outcome_industry: 'Time budget expired without band stabilization. Re-run required.',
          actions: ['continue', 'retry', 'rewind'],
        },
        advance: 'end' },
    ],
  };

})(globalThis.RD || (globalThis.RD = {}));
