/*
 * pwr_shift_exam.js — The Evening Shift, Checked Out (campaign Act III capstone).
 *
 * The load-follow shift, re-run as a checkpoint: drive the evening curve
 * (100 → 85 MWe, stable hold, back to ~100) with ANY tools — manual
 * dispatch like pwr_load_follow, or automation channels like
 * pwr_automation. The board starts CLEAN (no auto_channels preset): choosing
 * tools is part of the exam. One briefing, quiet phase markers, graded
 * outcome (the pwr_qualify register).
 *
 * Probed calibration (re-probed 2026-07-20 under the sliding-Tavg program,
 * placeholder anchors — scratchpad probe_shift2, seed 42; thresholds get a
 * final re-probe in feel-plan Phase 3 when this plant's anchors are picked):
 *   - MANUAL, fallback coupling: an 85 ask walks down monotonically,
 *     crosses 90.5 and settles ~89.5 — the old undershoot-
 *     through-870 is gone (the program-consistent secondary no longer drags
 *     output below the ask; Tavg mismatch still annunciates HI TAVG, which
 *     the hold card acknowledges). Return ask crosses 98.5 and settles ~99.6.
 *   - CHANNELS (rods_tavg + feed_sg engaged by the player): the 85 ask
 *     tracks near the ask (rods trim Tavg to the program); crosses the
 *     down-marker with margin; return crosses 98.5 quickly.
 *   - TRIP route (the failure card): a clean-board 100 → 50 ask scrams
 *     on SG LOW LEVEL — the fallback feed lets the SG drain on a deep
 *     step. "Forgot the feed" is literal.
 *   - Thresholds: down-marker mwe < 90.5 (manual dwells ~89.5; channels
 *     park lower), hold credit 180 s with mwe < 91 (~1 MWe over the
 *     probed wander top ~90), return mwe > 98.5, SG sane band 40–80 %
 *     graded at the settled finish (mid-run excursions deep enough to
 *     matter end at the 12 % trip → the tripped card).
 *   - Every phase watches for scram; a 50-min time budget ends any parked
 *     or out-of-band shift at the shift_over card (softlock-proofing).
 */
;(function (RD) {
  'use strict';

  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.pwr_shift_exam = {
    id: 'pwr_shift_exam',
    title: 'The Evening Shift — Checked Out',
    plant_id: 'pwr',
    design_version: null,
    initial_state: 'hot_full_power',
    mode: 'free_response',
    description: 'Run the evening curve with any tools you choose. The grade reads outcomes, not methods.',
    beats: [

      { id: 'intro',
        trigger: { type: 'time', value: 2.0 },
        commentary: {
          learning: 'Evening watch, and tonight you are checked out: no coaching, no highlights — the shift is yours. The curve: take the grid down to 85 megawatts for the night lull, hold it steady, then bring it back to a hundred for the morning. HOW is up to you. Drive the board by hand the way you ran your load-follow shift, or put the AUTO controls to work — STEAM GEN FEED, ROD AUTO, BORON — the examiners only read the outcome. Three things decide the grade: both moves completed, no reactor trip, and steam-generator level inside its sane band — 40 to 80 percent — when the work is judged. Small asks, settled plant, feed never forgotten. I will mark the phases quietly as you pass them.',
          industry: 'Shift examination: dispatch curve 100 → 85 MWe (stable hold) → ~100 MWe. Control method unrestricted: manual dispatch and/or the automation channels on the board (all channels start in MAN). Grading: curve completed, zero protective actuations, SG level 40–80 % at judgment. Phase markers only; no procedural coaching. Commencing.',
        },
        advance: 'wait_for_trigger' },

      // Silent reduction watch (45 s arming = briefing reading time; the
      // fastest probed gradeable event, a deep-ask trip, lands at t≈180 s).
      { id: 'watch_down',
        trigger: { type: 'delay', value: 45.0 },
        branches: [
          { trigger: { type: 'scram' }, goto: 'tripped' },
          { trigger: { type: 'instrument', instrument: 'mwe_output', direction: 'below', value: 90.5 }, goto: 'hold_marker' },
          { trigger: { type: 'time', value: 3000.0 }, goto: 'shift_over' },
        ] },

      // Phase 1 credited. Hold credit: 180 s after this fires with output
      // still down (< 910 covers the probed manual wander to ~899).
      { id: 'hold_marker',
        trigger: { type: 'delay', value: 1.0 },
        commentary: {
          learning: '85 on the curve — hold here. If the board is grumbling about coolant temperature, that is the mismatch a slider-only cut leaves behind: your call whether to live with it or trim it away. Keep one eye on steam-generator level; the night is not long.',
          industry: 'Reduction phase credited (output below 90.5 MWe on the evening curve). Note: uncompensated dispatch parks Tavg high (possible HI TAVG — informational). Hold and monitor SG level; pickup call to follow.',
        },
        branches: [
          { trigger: { type: 'scram' }, goto: 'tripped' },
          { trigger: { type: 'all', triggers: [
              { type: 'delay', value: 180.0 },
              { type: 'instrument', instrument: 'mwe_output', direction: 'below', value: 91 },
            ] }, goto: 'pickup_call' },
          { trigger: { type: 'time', value: 3000.0 }, goto: 'shift_over' },
        ] },

      // Hold credited — the dawn call. Grade needs settled output AND a sane
      // SG at least 30 s after the call (reading time; both probed routes
      // deliver 985+ well clear of the band edges).
      { id: 'pickup_call',
        trigger: { type: 'delay', value: 1.0 },
        commentary: {
          learning: 'The lull is over — dispatch calls for the morning pickup. Bring it back to a hundred and settle it there; the grade is read at the finish.',
          industry: 'Hold phase credited. Restore ~100 MWe. Grading at the settled finish: output > 98.5 MWe, SG level 40–80 %.',
        },
        branches: [
          { trigger: { type: 'scram' }, goto: 'tripped' },
          { trigger: { type: 'all', triggers: [
              { type: 'delay', value: 30.0 },
              { type: 'instrument', instrument: 'mwe_output', direction: 'above', value: 98.5 },
              { type: 'instrument', instrument: 'sg_level', direction: 'above', value: 40.0 },
              { type: 'instrument', instrument: 'sg_level', direction: 'below', value: 80.0 },
            ] }, goto: 'graded' },
          { trigger: { type: 'time', value: 3000.0 }, goto: 'shift_over' },
        ] },

      { id: 'graded',
        trigger: { type: 'delay', value: 2.0 },
        commentary: {
          learning: 'Shift complete — full marks. Down the curve, a steady night, back up for the morning: no trip, steam generators fed and level, every ask sized to what the machine could carry. And you chose your own tools, which was the real exam — knowing WHAT must happen matters more than which handle makes it happen. That is a dispatcher’s shift, run like a licensed one.',
          industry: 'Examination complete: bidirectional dispatch curve executed, zero protective actuations, SG level in band at judgment. Method (manual/automated) at examinee discretion per brief. Full marks.',
        },
        level_complete: {
          title: 'The Evening Shift — Full Marks',
          outcome_learning: 'The city dimmed and woke again, and the plant never noticed the difference. Your tools, your call, your shift.',
          outcome_industry: 'Dispatch curve 100→85→100 MWe completed without protective actuation; SG level maintained. Examination passed.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },

      { id: 'tripped',
        trigger: { type: 'delay', value: 1.5 },
        speed: 1,
        commentary: {
          learning: 'The unit tripped, and the shift examination with it. Two classic ways to lose this one: an ask so deep the turbine rejected the load outright, or a steam generator quietly draining toward its trip while every eye was on megawatts — on this board the deep step does both at once, and the low-level trip usually wins the race. Rewind and run the curve again: bounded steps, and the feed never out of your scan.',
          industry: 'Reactor trip during the dispatch curve — load-rejection transient or the SG low-low level scram (17 % indicated; true level dips lower behind the 3 s instrument lag on a fast drain) from unattended feedwater on a deep step (probed: 100→50 trips on SG level at ~180 s). Re-run with bounded steps (~10–15 MWe); engaging the feedwater channel is an accepted method.',
        },
        level_complete: {
          title: 'The Evening Shift — Unit Trip',
          outcome_learning: 'The grid asks gently and the feed follows the story. Smaller steps, wider scan.',
          outcome_industry: 'Protective trip during dispatch. Re-examine with bounded steps and SG level monitoring.',
          actions: ['continue', 'retry', 'rewind'],
        },
        advance: 'end' },

      { id: 'shift_over',
        trigger: { type: 'delay', value: 1.5 },
        speed: 1,
        commentary: {
          learning: 'The shift ended and the curve never closed. The grade sheet shows what is missing: the reduction, the steady hold, or a settled finish back near a thousand with the steam generators inside their band. This exam is not about speed — but the evening only lasts so long, and a dispatcher who never answers the call has failed it too. Rewind and drive the whole curve, end to end.',
          industry: 'Examination window (50 min) expired with the curve incomplete or final conditions out of band (required: reduction credited, 180 s hold, > 98.5 MWe with SG 40–80 %). Re-examination via Rewind/Retry.',
        },
        level_complete: {
          title: 'The Evening Shift — Curve Missed',
          outcome_learning: 'The grid kept asking; the answer never fully came. Run it end to end.',
          outcome_industry: 'Dispatch curve incomplete within the examination window. Re-run required.',
          actions: ['continue', 'retry', 'rewind'],
        },
        advance: 'end' },
    ],
  };

})(globalThis.RD || (globalThis.RD = {}));
