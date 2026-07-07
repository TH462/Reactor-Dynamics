/*
 * pwr_sg_flood.js — micro-scenario: SG flooded because load stayed high (Phase C).
 *
 * Teaches Load Mode: player starts in Manual at full turbine load, inserts rods,
 * and watches SG level climb while the instructor asks what control they forgot.
 */
;(function (RD) {
  'use strict';

  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.pwr_sg_flood = {
    id: 'pwr_sg_flood',
    title: 'SG Flooded — What Control Did You Forget?',
    plant_id: 'pwr',
    design_version: null,
    initial_state: 'hot_full_power',
    mode: 'guided',
    description: 'Manual load left high while power falls — secondary inventory stacks.',
    setup_commands: [
      { action: 'set_load_mode', mode: 'manual' },
      { action: 'set_load_target', mwe: 1000 },
    ],
    beats: [
      { id: 'setup',
        trigger: { type: 'time', value: 1.0 },
        commentary: {
          learning: 'You are at full power with the turbine on MANUAL load at 1000 MWe. Feedwater is auto-tracking that load. Insert control rods to pull power down — but leave the turbine load alone.',
          industry: 'HFP, manual turbine load 1000 MWe, coupled feed. Reduce reactor power via control-bank insertion; hold turbine load constant.',
        },
        highlight: { view: null, control_label: 'Control Bank', instrument_id: null },
        advance: 'wait_for_trigger' },

      { id: 'insert',
        trigger: { type: 'delay', value: 8.0 },
        commentary: {
          learning: 'Insert rods now. Watch the SG level card — when reactor power drops but turbine load stays high, steam generation falls while feed demand stays up… or the imbalance reverses. Either way, level drifts wrong.',
          industry: 'Insert control bank. Monitor SG level vs turbine load mismatch.',
        },
        advance: 'wait_for_trigger' },

      { id: 'imbalance',
        trigger: { type: 'instrument', instrument_id: 'sg_level', direction: 'high', setpoint: 75 },
        commentary: {
          learning: 'SG level is climbing. Reactor power fell but you never reduced turbine load — or switched back to Follow Reactor. What control did you forget?',
          industry: 'SG level high with reduced core power — load rejection / turbine load not matched to generation. Correct: Follow mode or reduce manual load.',
        },
        highlight: { view: null, control_label: 'Turbine Load', instrument_id: 'sg_level' },
        advance: 'wait_for_trigger' },

      { id: 'fix',
        trigger: { type: 'delay', value: 15.0 },
        commentary: {
          learning: 'Fix it: set Load Mode to Follow Reactor (or slide manual load down to match power). On a real SCRAM, load rejects automatically — we model that too.',
          industry: 'Restore balance: Follow Reactor or reduce manual MWe setpoint. Reactor trip auto-disconnects load in this sim.',
        },
        level_complete: {
          title: 'Load Mode',
          outcome_learning: 'Turbine load and feed must track reactor power. Follow Reactor is the default; SCRAM trips load to zero.',
          outcome_industry: 'Secondary inventory excursion from decoupled load — remedied by load-mode follow or manual load reduction.',
          actions: ['continue'],
        },
        advance: 'end' },
    ],
  };
})(globalThis.RD || (globalThis.RD = {}));