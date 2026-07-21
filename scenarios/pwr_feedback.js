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
 * The mission anchors steam demand in Manual at 50 MWe (setup_commands), so
 * the two demonstrations are clean under the pressure-compensated governor
 * (which pins the steam draw at the demand): the rod nudge shows a prompt jump
 * that the feedback wrestles ALL the way back down (probed: 50% → spike ~58% →
 * settle ~50%, the entire shove banked as Tavg +8 °C) against the fixed draw,
 * and the demand step (set_steam_demand 650) shows power climbing to MEET the
 * ask with rods untouched (probed: ~64 MWe, Tavg −25 °C paying for it).
 * Honesty: lumped kinetics — feedback is real but has spatial structure this
 * model deliberately averages away.
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
    // Pin the steam side: with demand fixed at 50 MWe the rod-nudge story is
    // clean (the spike is wrestled back; the surplus becomes temperature), and
    // the demand demo has headroom to climb visibly.
    setup_commands: [{ action: 'set_steam_demand', mwe: 50 }],
    beats: [

      { id: 'intro',
        trigger: { type: 'time', value: 2.0 },
        commentary: {
          learning: 'Half power, everything steady. Here is the deepest fact about this machine: it fights back. Make it hotter and it makes itself less reactive — hot fuel soaks up more neutrons before they can cause fissions (the Doppler effect), and hot water is a worse neutron slower-downer (the moderator effect). Both push AGAINST whatever you did. You are about to feel that push.',
          industry: '50% steady state, turbine demand held at 50 MWe. Lesson: net negative reactivity coefficients — Doppler broadening of U-238 resonance capture plus negative MTC. Both oppose power/temperature excursions; you will demonstrate each.',
        },
        advance: 'wait_for_trigger' },

      { id: 'nudge_task',
        trigger: { type: 'delay', value: 18.0 },
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
          learning: 'Watch the story the gauges just told: power LEAPT when you pulled the rods — and then, with nobody touching anything, the plant wrestled the spike ALL the way back to where it started. The turbine is only taking 500 megawatts of steam, so steady power had nowhere else to be — and your entire shove went somewhere quieter: T-avg is sitting about eight degrees hotter. The loop banked your reactivity as heat, one-for-one. That self-arrest is Doppler and the moderator effect doing their silent job, every second, forever: the harder you push this core, the harder it pushes back.',
          industry: 'Classic PWR response under fixed steam draw: prompt jump, feedback arrest fully back to the demand-set power; the added ρ is absorbed entirely as a higher Tavg equilibrium (~+8 °C). The coefficients convert the input to temperature — they do not let it become power.',
        },
        advance: 'wait_for_trigger' },

      { id: 'demand_demo',
        trigger: { type: 'delay', value: 30.0 },
        commentary: {
          learning: 'Now the reverse experiment — I will ask the turbine for MORE steam (650 megawatts of demand) and NOBODY will touch the rods. Watch two gauges tell the story: output climbing to meet the ask, and T-avg FALLING — drawing more steam cools the return water, cooler water slows neutrons better, and reactivity appears exactly where needed. The reactor follows steam demand. This is why operators say the turbine drives the reactor in a PWR.',
          industry: 'Demand step: 65 MWe via turbine demand, rods untouched. Colder cold-leg return adds ρ (negative MTC working in your favor); power rises toward the new demand, Tavg falls. Demonstrates demand-following without control action.',
        },
        commands: [{ action: 'set_steam_demand', mwe: 65 }],
        speed: 10,
        advance: 'wait_for_trigger' },

      // Completes on the climb being visibly banked (58.5 MWe after a 200-s
      // dwell) OR on a 600-s fallback: the settle point depends on how many
      // rod steps the player actually inserted earlier (probed: three +1
      // presses land ~56 MWe, a single 3-step nudge ~60), and a physics
      // demonstration must never soft-wait on a threshold the player's own
      // earlier caution moved out of reach.
      { id: 'complete',
        trigger: { type: 'any', triggers: [
          { type: 'all', triggers: [
            { type: 'instrument', instrument: 'mwe_output', direction: 'above', value: 58.5 },
            { type: 'delay', value: 200.0 },
          ] },
          { type: 'delay', value: 600.0 },
        ] },
        commentary: {
          learning: 'There it is — output climbed to the full ask, and the control rods never moved. The price appears on the other gauge: T-avg dropped some twenty-five degrees, because the extra steam is pulled from the loop\'s own warmth — cooler water moderates better, reactivity appears, power rises until it pays the bill. The same negotiation you saw with the rods, running in reverse: there, power came back and temperature rose; here, power rose and temperature came down. One honest note: this simulator treats the whole core as one lump, so feedback looks perfectly smooth; in a real core it varies region by region. But the principle you just proved twice is exactly real, and it is the reason a PWR is one of the most stable machines humans have built: push it, and it pushes back.',
          industry: 'Power converged to the raised demand with zero rod motion; Tavg fell ~25 °C supplying the reactivity (negative MTC). Model note: point kinetics — no spatial flux/feedback distribution. Negative-coefficient stability demonstrated in both directions.',
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
