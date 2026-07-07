/*
 * pwr_tour.js — The Energy Journey (campaign Act I, mission 2).
 *
 * A guided walk down the energy path at full power: fission heat → primary
 * loop → steam generator boundary → turbine/generator → condenser → back to
 * the SG — then the pressurizer as the guardian of the liquid state. The
 * player's hands-on proof: throttle the generator to 900 MW in Manual and
 * watch the whole chain respond, then hand it back to Follow.
 *
 * Highlights point at synoptic cards/instruments (Gameplay §5); triggers are
 * instrument-based (HR1). Thresholds tuned against test/run_campaign.js.
 */
;(function (RD) {
  'use strict';

  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.pwr_tour = {
    id: 'pwr_tour',
    title: 'The Energy Journey',
    plant_id: 'pwr',
    design_version: null,
    initial_state: 'hot_full_power',
    mode: 'demonstration',
    description: 'Follow the heat from fission to the grid — and learn why the primary loop must never boil.',
    beats: [

      { id: 'intro',
        trigger: { type: 'time', value: 2.0 },
        commentary: {
          learning: 'This plant is making a thousand megawatts right now, and every watt starts in the reactor vessel on the left: uranium atoms are splitting, and each split heats the water around the fuel. Follow the glowing hot leg from the reactor — that water is carrying the heat away. It is at about 320 °C, far above normal boiling, and it stays liquid only because the loop is squeezed to about 155 times atmospheric pressure.',
          industry: 'PWR at 100% rated. Energy path orientation, primary side first: core → hot leg at ~320 °C, single-phase because the RCS is held at ~15.5 MPa. Trace the loop on the synoptic.',
        },
        highlight: { control_label: null, instrument_id: 'power' },
        advance: 'wait_for_trigger' },

      { id: 'boundary',
        trigger: { type: 'delay', value: 18.0 },
        commentary: {
          learning: 'The hot water flows into the Steam Generator — thousands of thin tubes in a tall shell. On the other side of those tube walls is a second, completely separate water system at lower pressure, and THAT water boils. The two never mix: reactor water stays in its loop, and only clean steam leaves the building. This barrier is the whole reason a PWR has two loops.',
          industry: 'SG = primary/secondary boundary. Primary stays liquid inside the U-tubes; secondary boils on the shell side at ~6.9 MPa. Radiological barrier and the plant’s defining design decision.',
        },
        advance: 'wait_for_trigger' },

      { id: 'turbine',
        trigger: { type: 'delay', value: 16.0 },
        commentary: {
          learning: 'The steam crosses the hall and spins the turbine — that spinning shaft IS the thousand megawatts, handed to the generator and out to the grid. Below it, the condenser turns the used steam back into water so the feed pumps can send it to the steam generators again. One loop of heat, around and around.',
          industry: 'Steam → HP/LP turbine → generator (1000 MWe nominal) → condenser at vacuum → condensate/feed back to the SGs. Closed secondary cycle.',
        },
        advance: 'wait_for_trigger' },

      { id: 'pressurizer',
        trigger: { type: 'delay', value: 16.0 },
        commentary: {
          learning: 'One more stop: the tank standing on the hot leg — the pressurizer. It is half water, half steam, and it sets the pressure for the entire primary loop with electric heaters and a cold-water spray. Find the SUBCOOLING MARGIN readout: it says how many degrees the primary water is below boiling. That number is the plant’s life insurance. If it ever reaches zero, the reactor water starts boiling around the fuel.',
          industry: 'PZR: two-phase vessel on the hot leg; heaters raise pressure, spray lowers it. Subcooling margin = Tsat(P) − Thot: the single most safety-significant derived indication on the board.',
        },
        highlight: { control_label: null, instrument_id: 'subcool' },
        advance: 'wait_for_trigger' },

      { id: 'act_load',
        trigger: { type: 'delay', value: 14.0 },
        commentary: {
          learning: 'Your turn. Prove the chain is real: on the Turbine-Generator card, switch Load to MANUAL and slide the target down to 900 MW. You are asking the grid side for less power — watch what happens upstream: steam flow drops, and the reactor quietly follows. Go ahead.',
          industry: 'Operator action: Turbine-Generator card → Load mode MANUAL, target 900 MWe. Observe steam flow and reactor power tracking the reduced demand — no rod motion required.',
        },
        highlight: { control_label: 'Mode', instrument_id: null },
        advance: 'wait_for_trigger' },

      { id: 'act_restore',
        trigger: { type: 'all', triggers: [
          { type: 'operator_action', command: 'set_load_target' },
          { type: 'instrument', instrument: 'mwe_output', direction: 'below', value: 985 },
        ] },
        commentary: {
          learning: 'See it? Less steam drawn, and the reactor answered by making less heat — nobody touched the control rods. Notice it did not fall all the way to your 900: the loop warmed a few degrees and the physics found its own bargain in the 970s. To go lower a crew would bring in rods or boron — the sliders ask, the reactor negotiates. Now hand control back: set Load mode to FOLLOW and the plant returns to full power on its own.',
          industry: 'Demand reduction propagated up the chain: governor → steam flow → primary ΔT → power, rods untouched. Note the equilibrium lands above the target (Tavg rises ~+5 °C absorbing the difference) — full reduction requires reactivity support. Restore load mode FOLLOW; expect ~1000 MWe.',
        },
        advance: 'wait_for_trigger' },

      { id: 'complete',
        trigger: { type: 'all', triggers: [
          { type: 'operator_action', command: 'set_load_mode', params: { mode: 'follow' } },
          { type: 'instrument', instrument: 'mwe_output', direction: 'above', value: 990 },
        ] },
        commentary: {
          learning: 'Full power again. You now know the whole journey: fission heat, a sealed hot loop that must never boil, a boundary where clean steam is made, a turbine that turns heat into electricity, and a pressurizer standing guard over it all.',
          industry: 'Back at rated output in Follow. Energy path, two-loop rationale, and subcooling significance covered.',
        },
        level_complete: {
          title: 'The Energy Journey — Complete',
          outcome_learning: 'You traced a watt from a splitting atom to the grid, and bent the whole chain with one slider.',
          outcome_industry: 'Energy path and load-demand coupling demonstrated end to end at rated power.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },
    ],
  };

})(globalThis.RD || (globalThis.RD = {}));
