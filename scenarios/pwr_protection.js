/*
 * pwr_protection.js — The Plant Protects Itself (campaign Act IV, mission 14).
 *
 * The reactor protection system, taught by watching it win: a deliberate
 * turbine trip at full power, the automatic cascade (trip → scram → decay
 * heat → auxiliary systems), and the skill of READING an alarm flood instead
 * of fearing it. Player actions: acknowledge the flood, then confirm the
 * plant is stable in hot standby.
 */
;(function (RD) {
  'use strict';

  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.pwr_protection = {
    id: 'pwr_protection',
    title: 'The Plant Protects Itself',
    plant_id: 'pwr',
    design_version: null,
    initial_state: 'hot_full_power',
    mode: 'demonstration',
    description: 'Watch the protection system win a fight in three seconds — then learn to read the story it leaves behind.',
    beats: [

      { id: 'intro',
        trigger: { type: 'time', value: 2.0 },
        commentary: {
          learning: 'Everything you have learned so far assumed things go right. Now meet the layer that assumes they will not: the Reactor Protection System. Dozens of watchdogs stare at the gauges around the clock — pressure too high, water too low, power too fast — and any one of them can slam every rod into the core in about two seconds. No permission asked. You are about to see it act, because I am going to break something on purpose.',
          industry: 'RPS orientation: independent trip channels on the safety-significant parameters, one-out-logic here (no voting modeled), full rod insertion on any trip, ~2 s. A deliberate upset follows — observe the automatic sequence, hands off.',
        },
        advance: 'wait_for_trigger' },

      { id: 'trip_it',
        trigger: { type: 'delay', value: 14.0 },
        commentary: {
          learning: 'HANDS OFF THE BOARD. The turbine just tripped — its valves slammed shut and a thousand megawatts of steam suddenly has nowhere to go. Watch the dominoes: steam pressure spikes, the reactor loses its heat sink, and the protection system decides. You could not react this fast. Nobody could. That is the point.',
          industry: 'Turbine trip injected at 100%: load rejection, steam pressure transient, heat sink degradation. Anticipate reactor trip via the protection chain. Observe only.',
        },
        inject_failures: ['turbine_trip'],
        advance: 'wait_for_trigger' },

      { id: 'scrammed',
        trigger: { type: 'scram' },
        commentary: {
          learning: 'SCRAM — every rod dropped, the chain reaction is dead, and the whole fight took seconds with your hands in your lap. Now look at the board: alarms everywhere. Do not fear the wall of lights — it is a STORY written in the order things happened: turbine trip, pressure spike, reactor trip, levels swinging. Real operators read alarm floods like sentences.',
          industry: 'Reactor trip complete; rods on the bottom. Annunciator flood present — triage by sequence and system, not by count: initiator (turbine), primary response (trip), secondary effects (SG level/pressure transients).',
        },
        advance: 'wait_for_trigger' },

      { id: 'ack_task',
        trigger: { type: 'delay', value: 12.0 },
        commentary: {
          learning: 'Your move: press ACK ALL to acknowledge the flood — that silences the noise, but every light stays lit until its cause is actually gone. Acknowledging is not fixing; it is saying "I have read you." Then look at what the plant is doing all by itself: decay heat is still coming (it never stops instantly), and the steam dump is quietly carrying it to the condenser.',
          industry: 'Acknowledge the annunciators (Ack All). Note post-trip automatic lineup: decay heat removal via steam dump to condenser, feed maintaining SG level. Acknowledgment ≠ clearance.',
        },
        highlight: { control_label: null, instrument_id: null },
        advance: 'wait_for_trigger' },

      { id: 'stabilizing',
        trigger: { type: 'operator_action', command: 'acknowledge_all_alarms' },
        commentary: {
          learning: 'Board read and acknowledged. Now watch the plant settle into HOT STANDBY: power down to decay-heat levels, temperature and pressure drifting to their shutdown resting points, steam generators sipping just enough feed. The protection system bought the plant a safe outcome; the automatics are keeping it. Give it a minute at fast clock.',
          industry: 'Flood acknowledged. Plant stabilizing to hot standby: decay-heat power, no-load Tavg, SG levels recovering under auto feed. Time compressed through the settling phase.',
        },
        speed: 20,
        advance: 'wait_for_trigger' },

      { id: 'complete',
        trigger: { type: 'all', triggers: [
          { type: 'instrument', instrument: 'power_range', direction: 'below', value: 4.0 },
          { type: 'delay', value: 120.0 },
        ] },
        commentary: {
          learning: 'Stable. Decay heat only, temperatures parked, alarms telling yesterday’s story. Take the lesson with you: this machine is built to LOSE SAFELY. Every failure you will face from here on — lost pumps, lost feedwater, stuck valves — happens on top of a protection system that has already decided it would rather shut down a billion-dollar plant than risk the core. It is on your side. TMI will test whether you believe it.',
          industry: 'Hot standby achieved: decay-heat power, controlled SG heat removal. RPS demonstration complete — protection philosophy: fail toward shutdown, automatics before operators, alarms as sequence evidence.',
        },
        speed: 1,
        level_complete: {
          title: 'The Plant Protects Itself — Witnessed',
          outcome_learning: 'You watched the machine save itself in seconds, then read the story it wrote in lights. The protection system is your co-pilot too.',
          outcome_industry: 'Turbine trip → reactor trip → hot standby sequence observed; annunciator triage exercised.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },
    ],
  };

})(globalThis.RD || (globalThis.RD = {}));
