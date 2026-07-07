/*
 * pwr_feedback.js — The Reactor That Pushes Back (campaign Act II, mission 5).
 *
 * Negative reactivity feedback at power, in two demonstrations the player
 * performs personally:
 *   1. Nudge the rods OUT at 50% power — power blips up, then the plant
 *      shoulders it back: hot fuel absorbs more neutrons (Doppler) and hot
 *      water moderates less (MTC). The lasting result is a slightly hotter
 *      loop, not runaway power.
 *   2. Ask the grid side for more megawatts without touching the rods —
 *      power RISES to meet the demand, because colder return water adds
 *      reactivity. The reactor follows steam demand.
 *
 * Observables are chosen for the load-follow reality: steady-state power is
 * slaved to steam demand, so reactivity moves show up in Tavg; demand moves
 * show up in power. Honesty: lumped kinetics — feedback is real but has
 * spatial structure this model deliberately averages away.
 */
;(function (RD) {
  'use strict';

  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.pwr_feedback = {
    id: 'pwr_feedback',
    title: 'The Reactor That Pushes Back',
    plant_id: 'pwr',
    design_version: null,
    initial_state: '50_percent',
    mode: 'guided',
    description: 'Poke the core and watch it push back — the negative feedback that makes a PWR self-stabilizing.',
    beats: [

      { id: 'intro',
        trigger: { type: 'time', value: 2.0 },
        commentary: {
          learning: 'Half power, everything steady. Here is the deepest fact about this machine: it fights back. Make it hotter and it makes itself less reactive — hot fuel soaks up more neutrons before they can cause fissions (the Doppler effect), and hot water is a worse neutron slower-downer (the moderator effect). Both push AGAINST whatever you did. You are about to feel that push.',
          industry: '50% steady state. Lesson: net negative reactivity coefficients — Doppler broadening of U-238 resonance capture plus negative MTC. Both oppose power/temperature excursions; you will demonstrate each.',
        },
        advance: 'wait_for_trigger' },

      { id: 'nudge_task',
        trigger: { type: 'delay', value: 12.0 },
        commentary: {
          learning: 'Give the core a shove: NUDGE the rods OUT a few steps (the +1 button — press it three times). That adds reactivity, so power will rise... but watch what happens next. Keep your eyes on POWER and on T-avg, the loop temperature.',
          industry: 'Insert +ρ: three outward nudges on the control bank. Anticipate: prompt power rise, then feedback arrest. Track power and Tavg through the transient.',
        },
        highlight: { control_label: 'Nudge', instrument_id: null },
        advance: 'wait_for_trigger' },

      { id: 'stabilized',
        trigger: { type: 'all', triggers: [
          { type: 'operator_action', command: 'rod_nudge' },
          { type: 'delay', value: 75.0 },
        ] },
        commentary: {
          learning: 'Watch the story the gauges just told: power jumped when you pulled the rods — then slid back close to where it started, all by itself. Nobody pushed the rods back in. The extra reactivity got spent making the loop a little HOTTER: look at T-avg sitting slightly above where it was. The steam side is still taking the same megawatts, so power returns to match it — your rod pull bought temperature, not lasting power. That self-arrest is Doppler and the moderator effect doing their silent job, every second, forever.',
          industry: 'Classic PWR response: prompt jump, feedback arrest, power re-converges to steam demand; the added ρ is absorbed as a higher Tavg equilibrium. Rods position the temperature program; demand positions power.',
        },
        advance: 'wait_for_trigger' },

      { id: 'demand_demo',
        trigger: { type: 'delay', value: 10.0 },
        commentary: {
          learning: 'Now the reverse experiment — I will ask the turbine for 100 more megawatts and NOBODY will touch the rods. Watch power climb to meet the demand on its own: drawing more steam cools the return water, cooler water slows neutrons better, reactivity appears exactly where needed. The reactor follows steam demand. This is why operators say the turbine drives the reactor in a PWR.',
          industry: 'Demand step: +100 MWe via load target, rods untouched. Colder cold-leg return adds ρ (negative MTC working in your favor); power rises to the new demand. Demonstrates demand-following without control action.',
        },
        commands: [
          { action: 'set_load_mode', mode: 'manual' },
          { action: 'set_load_target', mwe: 600 },
        ],
        speed: 10,
        advance: 'wait_for_trigger' },

      { id: 'complete',
        trigger: { type: 'instrument', instrument: 'mwe_output', direction: 'above', value: 520 },
        commentary: {
          learning: 'There it is — output climbing to meet the ask, and the control rods never moved. (It will settle short of the full 600: the loop cools as it works harder, and the physics strikes its bargain partway — the same negotiation you saw with the rods, running in reverse.) One honest note: this simulator treats the whole core as one lump, so feedback looks perfectly smooth; in a real core it varies region by region. But the principle you just proved twice is exactly real, and it is the reason a PWR is one of the most stable machines humans have built: push it, and it pushes back.',
          industry: 'Power converged to the raised demand with zero rod motion. Model note: point kinetics — no spatial flux/feedback distribution. Negative-coefficient stability demonstrated in both directions.',
        },
        speed: 1,
        commands: [{ action: 'set_load_mode', mode: 'follow' }],
        level_complete: {
          title: 'The Reactor That Pushes Back — Understood',
          outcome_learning: 'You shoved the core and it shoved back; you asked for megawatts and it delivered them unasked. Negative feedback is your co-pilot now.',
          outcome_industry: 'Doppler/MTC arrest and demand-following both demonstrated at 50–60% power.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },
    ],
  };

})(globalThis.RD || (globalThis.RD = {}));
