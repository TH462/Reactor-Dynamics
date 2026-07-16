/*
 * pwr_boron.js — The Long Game (campaign Act II, mission 7).
 *
 * Boron vs rods: two throttles for the same physics on very different
 * clocks. Because steady-state power is slaved to steam demand, reactivity
 * moves show up in Tavg — so the player dilutes to RAISE the loop
 * temperature a notch, then borates it back, and contrasts that slow uniform
 * chemistry with the instant local bite of a rod nudge. Gated to CVCS boron
 * + rod nudges. Honesty: real boration/dilution moves ppm over hours; the
 * mission runs time-compressed.
 *
 * Playtest hardening: compression is 8× (30× made "patient chemistry" look
 * instant, and a mis-press dug an unrecoverable hole); each prompt beat
 * parks the CVCS on HOLD via commands so reading time is never penalized;
 * and both task beats carry a scram branch to the `overdone` failure card —
 * previously a high-flux trip left the mission softlocked under a stale
 * prompt.
 */
;(function (RD) {
  'use strict';

  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.pwr_boron = {
    id: 'pwr_boron',
    title: 'The Long Game',
    plant_id: 'pwr',
    design_version: null,
    initial_state: '50_percent',
    mode: 'guided',
    description: 'Rods are the hands; boron is the spine. Learn the slow chemistry that really steers a PWR.',
    beats: [

      { id: 'intro',
        trigger: { type: 'time', value: 2.0 },
        commentary: {
          learning: 'Look at the CVCS panel on the diagram — the little chemistry plant hanging off the loop. Dissolved in every liter of reactor water is BORON, a neutron absorber, like a rod smeared perfectly evenly through the core. Right now there are hundreds of parts per million of it (the boron analyzer shows the number). Rods move reactivity in seconds; boron moves it over minutes and hours — but it moves the WHOLE core at once, with no distortion. Operators use rods for the moment, boron for the day.',
          industry: '50% steady. CVCS boron: soluble absorber, spatially uniform worth, adjusted via charging/letdown chemistry. Fast/local (rods) vs slow/uniform (boron) division of labor. Analyzer reading is your ppm indication.',
        },
        gate: { allow_actions: ['set_boron_adjust', 'rod_nudge', 'rod_start', 'rod_stop', 'scram', 'manual_scram', 'acknowledge_alarm', 'acknowledge_all_alarms'],
                message: 'Reactivity controls only — rods and boron chemistry.' },
        advance: 'wait_for_trigger' },

      { id: 'dilute_task',
        trigger: { type: 'delay', value: 24.0 },
        commentary: {
          learning: 'Your task: warm the loop about two degrees using chemistry alone. Press DIL (dilute) — the CVCS starts swapping borated water for clean water, and the ppm begins to fall. Watch three things: the boron analyzer creeping down, power blipping up as absorber leaves, and T-avg drifting upward as the loop banks the extra reactivity as heat. I will speed the clock — chemistry is patient work, even hurried.',
          industry: 'Dilute via CVCS (boron_adjust negative — the DIL button). Expect: ppm ramp down, small power excursion re-converging to demand, Tavg rising to a new equilibrium ~+2 °C. Time compressed 8×; monitor the analyzer trend.',
        },
        highlight: { control_label: 'Boron', instrument_id: null },
        speed: 8,
        branches: [
          { trigger: { type: 'scram' }, goto: 'overdone' },
          { trigger: { type: 'all', triggers: [
              { type: 'operator_action', command: 'set_boron_adjust' },
              { type: 'instrument', instrument: 'tavg', direction: 'above', value: 288.5 },
            ] }, goto: 'borate_task' },
        ] },

      { id: 'borate_task',
        trigger: { type: 'delay', value: 2.0 },
        // Park the chemistry while the player reads — at compressed time a
        // running dilution punishes every second of reading (playtest).
        commands: [{ action: 'set_boron_adjust', rate: 0 }],
        commentary: {
          learning: 'Feel how DIFFERENT that was from a rod pull? No jolt — just a slow, even warming as the poison drained out of the whole core at once. I have parked the chemistry on HOLD while you read. Notice power barely changed in the end: the steam side still takes the same megawatts, so your chemistry bought TEMPERATURE. Now undo it: press BOR (borate) and put the absorber back. The loop will cool the same gentle way.',
          industry: 'Tavg up on dilution with power re-slaved to demand — the reactivity went into loop temperature, as expected. CVCS on HOLD. Now borate to restore: boron_adjust positive (the BOR button), watch ppm and Tavg walk back down.',
        },
        speed: 8,
        branches: [
          { trigger: { type: 'scram' }, goto: 'overdone' },
          { trigger: { type: 'all', triggers: [
              { type: 'operator_action', command: 'set_boron_adjust', params: { rate: 2 } },
              { type: 'instrument', instrument: 'tavg', direction: 'below', value: 287.3 },
            ] }, goto: 'complete' },
        ] },

      { id: 'complete',
        trigger: { type: 'delay', value: 1.5 },
        commentary: {
          learning: 'Back where you started — via chemistry, both ways. Here is why this matters beyond today: as fuel burns up over a YEAR, the core slowly loses reactivity, and it is boron — diluted a little every day, thousands of ppm down to nearly zero — that pays that long bill. Rods stay parked near the top, ready for the fast moves. Hands for the moment, spine for the year. One honest note: real boration and dilution take hours per move; we ran your shift at 8× so you could feel the shape of it.',
          industry: 'Tavg restored by boration. Operational context: boron letdown compensates cycle burnup (BOL ~1500+ ppm → EOL ~0), leaving rods for maneuvering and trip margin. Model note: CVCS chemistry time-compressed 8× here.',
        },
        speed: 1,
        commands: [{ action: 'set_boron_adjust', rate: 0 }],
        level_complete: {
          title: 'The Long Game — Played',
          outcome_learning: 'You steered a reactor with chemistry: two degrees up, two degrees back, no rods required. Boron is the quiet hand on the wheel.',
          outcome_industry: 'Dilution/boration round trip demonstrated; Tavg as the reactivity observable; burnup-compensation role established.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },

      { id: 'overdone',
        trigger: { type: 'delay', value: 1.5 },
        speed: 1,
        commands: [{ action: 'set_boron_adjust', rate: 0 }],
        commentary: {
          learning: 'WHOA — too much reactivity, too fast: the protection tripped the reactor. Chemistry moves the WHOLE core at once, and on this compressed clock a few seconds in the wrong direction is a real excursion. No harm done — that is exactly what the trip is for. Rewind or Retry, and this time steer by the analyzer trend and T-avg, not the clock.',
          industry: 'Reactor trip during the boron evolution — reactivity insertion rate excessive under time compression. Protection response nominal; CVCS secured. Rewind/Retry; pace adjustments off the analyzer trend and Tavg.',
        },
        level_complete: {
          title: 'The Long Game — Tripped on Chemistry',
          outcome_learning: 'The quiet hand on the wheel still turns the whole car. Gently, this time.',
          outcome_industry: 'Boron evolution terminated by reactor trip. Re-run with bounded adjustment periods.',
          actions: ['continue', 'retry', 'rewind'],
        },
        advance: 'end' },
    ],
  };

})(globalThis.RD || (globalThis.RD = {}));
