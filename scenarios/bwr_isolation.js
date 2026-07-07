/*
 * bwr_isolation.js — Cut Off (BWR campaign, Act II mission 5).
 *
 * MSIV closure at full power: the plant loses its steam path, trips itself,
 * and the mission teaches the BWR's famous instrumentation trap on the way
 * down — level SHRINK (the gauge plunges as voids collapse, while actual
 * inventory barely moved), then the steam-driven systems quietly take over.
 * Demonstration; the beats ride the measured trajectory (trip <10 s,
 * indicated level dip to ~28%, recovery through the 60s by RCIC/HPCI).
 */
;(function (RD) {
  'use strict';

  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.bwr_isolation = {
    id: 'bwr_isolation',
    title: 'Cut Off',
    plant_id: 'bwr',
    design_version: null,
    initial_state: 'full_power',
    mode: 'demonstration',
    description: 'Slam the main steam valves shut at full power — and learn why BWR operators distrust their level gauge for the next sixty seconds.',
    beats: [

      { id: 'intro',
        trigger: { type: 'time', value: 2.0 },
        commentary: {
          learning: 'Full power, one loop — which means one PIPE. Everything this reactor makes leaves through the main steam lines, and those lines have guillotine valves: the MSIVs, built to slam shut in seconds if the plant ever needs to wall itself off from the outside world. Closing them at full power is one of the roughest things you can do to a BWR. So naturally, I am about to do it. Eyes on POWER, PRESSURE, and especially the LEVEL gauge — it is going to lie to you, and I want you to catch it.',
          industry: 'MSIV isolation transient from rated power, demonstration. Watch sequence: isolation → pressure transient → reactor trip → level shrink (instrumentation artifact) → steam-driven makeup recovery. Level indication behavior is the teaching point.',
        },
        advance: 'wait_for_trigger' },

      { id: 'slam',
        trigger: { type: 'delay', value: 12.0 },
        commentary: {
          learning: 'MSIVs CLOSED. A gigawatt of steam just hit a wall. Watch the dominoes — pressure kicks up, and the protection system does not wait to see how it ends.',
          industry: 'MSIV closure injected. Anticipate immediate scram (isolation trip) and pressure transient bounded by relief capacity.',
        },
        inject_failures: ['msiv_closure'],
        advance: 'wait_for_trigger' },

      { id: 'shrink',
        trigger: { type: 'all', triggers: [
          { type: 'scram' },
          { type: 'instrument', instrument: 'vessel_level', direction: 'below', value: 38.0 },
        ] },
        commentary: {
          learning: 'SCRAMMED — and LOOK AT THE LEVEL GAUGE. It just plunged twenty points in seconds. Did the water actually go anywhere? Almost none of it. When the reactor tripped, the bubbles that filled half the core COLLAPSED — the foam settled like a shaken soda going flat — and the indicated line dropped with the froth. That is SHRINK. A BWR operator who chases this gauge in the first minute makes everything worse. Watch it climb back as the makeup systems catch up.',
          industry: 'Level shrink on trip: void collapse compresses the two-phase column; indicated (and true collapsed) level steps down with minimal inventory change. Classic post-trip trap — do not chase level in the shrink window. RCIC/HPCI initiating on the real signal.',
        },
        advance: 'wait_for_trigger' },

      { id: 'recovery',
        trigger: { type: 'instrument', instrument: 'vessel_level', direction: 'above', value: 58.0 },
        commentary: {
          learning: 'And there is the recovery — level restored and rising, fed by pumps that need NO electricity from outside: RCIC and HPCI run on the reactor\'s own steam, sipping from the very decay heat they are there to manage. The plant is sealed off from the world, tripped, and completely self-sufficient. Remember this sight: steam-driven pumps holding the level line alone. At Fukushima, machines exactly like these were the last systems standing — for a while.',
          industry: 'Level recovered through the band on steam-driven injection (RCIC/HPCI — turbine-driven, DC-controlled, AC-independent). Isolation event stabilized without offsite support. Direct Fukushima setup: these systems and their support dependencies are Act III.',
        },
        advance: 'wait_for_trigger' },

      { id: 'complete',
        trigger: { type: 'delay', value: 45.0 },
        commentary: {
          learning: 'Isolated, tripped, stable — the whole event handled by automatics in about a minute, with the only human skill required being the WISDOM TO WAIT through the shrink. That is the mature form of operating a BWR: know which gauge is lying, know which pumps are breathing steam, and keep your hands still while the design does its job. Next: the day the design ran out of support.',
          industry: 'Isolation transient complete: trip, shrink, steam-driven recovery, stable hot shutdown. Operator discipline point: recognize shrink/swell artifacts before acting. Proceed to shutdown practice, then the Fukushima study.',
        },
        level_complete: {
          title: 'Cut Off — Read Correctly',
          outcome_learning: 'You watched the gauge lie, knew why, and kept your hands still. That is BWR literacy.',
          outcome_industry: 'MSIV transient observed end-to-end; shrink artifact and steam-driven recovery identified.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },
    ],
  };

})(globalThis.RD || (globalThis.RD = {}));
