/*
 * pwr_load_follow.js — Follow the Grid (campaign Act III, mission 11).
 *
 * The evening-ramp story, played on the Turbine-Generator card: Manual mode
 * down to 800 MWe for the night lull, hold while watching feed auto-couple
 * and the SG balance annunciator, morning pickup back to rated, then hand
 * the plant back to Follow. Teaches the load-mode controls end to end and
 * cements the Act II lesson: demand leads, the reactor follows.
 */
;(function (RD) {
  'use strict';

  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.pwr_load_follow = {
    id: 'pwr_load_follow',
    title: 'Follow the Grid',
    plant_id: 'pwr',
    design_version: null,
    initial_state: 'hot_full_power',
    mode: 'guided',
    description: 'Run the evening shift: ramp down for the night, hold steady, and pick the grid back up at dawn.',
    beats: [

      { id: 'intro',
        trigger: { type: 'time', value: 2.0 },
        commentary: {
          learning: 'Evening shift. The city is going to bed and the grid needs less power — and it is YOUR job to give it less without upsetting anything. Find the Turbine-Generator card: Load mode is in FOLLOW, meaning the turbine simply takes what the reactor makes. Tonight you will drive by hand.',
          industry: 'Load-follow evolution. Turbine-Generator card: currently mode FOLLOW (turbine slaved to reactor thermal output). Task: manual dispatch per the evening curve.',
        },
        highlight: { control_label: 'Mode', instrument_id: null },
        advance: 'wait_for_trigger' },

      // Prompt + branch watch: the gentle 800 MW step leads on; a step big
      // enough to trip on load rejection lands on grid_lost (playtest fix —
      // a trip previously softlocked the shift under a stale prompt).
      { id: 'ramp_down',
        trigger: { type: 'delay', value: 14.0 },
        commentary: {
          learning: 'Switch Load to MANUAL and bring the slider down to 800 MW — one step, not a plunge; the grid dims gently and so should you. (If you forget the mode switch, the slider engages Manual by itself.) Then watch the machine reorganize: the governor throttles steam, the reactor eases off (feedback again — no rods), and the FEEDWATER follows the steam all by itself. The card says "auto (tracks load)" — one slider is really moving half the plant.',
          industry: 'Manual mode, target 800 MWe (bounded step; large rejections trip the unit). Observe coupled response: governor → steam flow → reactor power via MTC; feedwater auto-coupled to load. Single-input dispatch.',
        },
        branches: [
          { trigger: { type: 'scram' }, goto: 'grid_lost' },
          { trigger: { type: 'all', triggers: [
              { type: 'operator_action', command: 'set_load_target' },
              { type: 'instrument', instrument: 'mwe_output', direction: 'below', value: 955 },
            ] }, goto: 'hold' },
        ] },

      { id: 'hold',
        trigger: { type: 'delay', value: 2.0 },
        commentary: {
          learning: 'Settling out — and notice it will not reach 800 exactly: the loop warms up several degrees and holds the output in the 940s. Your slider ASKS; the physics ANSWERS; going all the way to 800 would take rods or boron alongside. Night watch now: do NOTHING, but stay awake to two indications — the Balance readout on the Steam card (steam vs feed) and T-avg. I will run the night at 10× — watch your board.',
          industry: 'Output settling ~940 MWe against an 800 target — Tavg rises ~+9 °C absorbing the mismatch; full reduction requires coordinated reactivity control (out of scope tonight). Monitoring phase: Balance readout (Steam card) and Tavg. Night compressed 10×.',
        },
        speed: 10,
        advance: 'wait_for_trigger' },

      { id: 'ramp_up',
        trigger: { type: 'delay', value: 300.0 },
        commentary: {
          learning: 'Dawn. Alarm clocks, toasters, trains — the grid is waking up hungry. Take the slider back up to 1000 MW. Watch the same chain run in reverse: more steam drawn, cold-leg cools a touch, the core wakes up to meet it. Smooth hands — the plant likes gradual asks.',
          industry: 'Morning pickup: target 1000 MWe. Reverse coupling: increased steam draw → cooler return → +ρ via MTC → power ascension to rated. Ramp, don’t step, in real practice.',
        },
        speed: 1,
        branches: [
          { trigger: { type: 'scram' }, goto: 'grid_lost' },
          { trigger: { type: 'all', triggers: [
              { type: 'operator_action', command: 'set_load_target' },
              { type: 'instrument', instrument: 'mwe_output', direction: 'above', value: 990 },
            ] }, goto: 'restore_follow' },
        ] },

      { id: 'restore_follow',
        trigger: { type: 'delay', value: 2.0 },
        commentary: {
          learning: 'Full output. Last move of the shift: put Load mode back to FOLLOW — hand the wheel back to the plant. A day of dispatching, and you never touched a control rod.',
          industry: 'Rated output restored. Return load mode to FOLLOW to close out the manual dispatch window.',
        },
        speed: 1,
        advance: 'wait_for_trigger' },

      { id: 'complete',
        trigger: { type: 'operator_action', command: 'set_load_mode', params: { mode: 'follow' } },
        commentary: {
          learning: 'Shift complete. You just did what real PWR crews do through every summer evening: followed the grid down, held the night, and brought the morning back — with feedback doing the heavy lifting and feedwater trailing your slider automatically. The reactor follows steam demand. Now it follows YOU.',
          industry: 'Load-follow evolution complete: down-ramp, hold, up-ramp, mode restoration. Feed auto-coupling and SG balance monitoring exercised.',
        },
        level_complete: {
          title: 'Follow the Grid — Shift Complete',
          outcome_learning: 'Down for the night, up for the dawn — one slider, zero rod motion, a city kept lit.',
          outcome_industry: 'Manual dispatch cycle 1000→800→1000 MWe executed with coupled feed and stable SG balance.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },

      { id: 'grid_lost',
        trigger: { type: 'delay', value: 1.5 },
        speed: 1,
        commentary: {
          learning: 'The plant tripped — the dispatch step was too big and the turbine rejected the load rather than ride the shock. The city is fine; the grid has other plants. But your shift just got a lot longer. Rewind (or Retry) and move the slider the way the machine likes it: one modest step, then let it settle.',
          industry: 'Reactor trip on load rejection during manual dispatch — step size exceeded transient capability. Protection response nominal. Rewind/Retry with bounded steps (~100–200 MWe).',
        },
        level_complete: {
          title: 'Follow the Grid — Load Rejected',
          outcome_learning: 'The grid asks gently, and so must you. Smaller steps.',
          outcome_industry: 'Dispatch step tripped the unit. Re-run with bounded load steps.',
          actions: ['continue', 'retry', 'rewind'],
        },
        advance: 'end' },
    ],
  };

})(globalThis.RD || (globalThis.RD = {}));
