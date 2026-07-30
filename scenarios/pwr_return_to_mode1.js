/*
 * pwr_return_to_mode1.js — "Cold to Power" (campaign Act III, closing the loop).
 *
 * The complete startup Mode 5, Cold Shutdown → Mode 4 → Mode 3 → Mode 2, Startup
 * → Mode 1, At Power, driven from the genuine cold_shutdown board on integrated
 * physics. It is the round-trip's other half: having taken a plant cold in
 * "Cooling Down", you now bring one all the way back to power. Pressurize, start
 * the pumps, hand over the nuclear instruments, take the core critical, and ride
 * a low power up in temperature — but this time you do NOT stop at Hot Standby:
 * you keep the reactor making power and cross NOP into Mode 1, At Power.
 *
 * Honesty: the wall clock is compressed (time acceleration). The heat source is NOT
 * fictional — this mission drives the heatup on fission because it is going straight
 * on to power and the criticality is the point, but the plant no longer needs it to:
 * since #251 pump heat alone makes Hot Standby in 10.71 plant-hours with the reactor
 * subcritical, which is what `pwr_mode5_to_mode3` now teaches.
 */
;(function (RD) {
  'use strict';

  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.pwr_return_to_mode1 = {
    id: 'pwr_return_to_mode1',
    title: 'Cold to Power — Mode 5 to Mode 1',
    plant_id: 'pwr',
    design_version: null,
    initial_state: 'cold_shutdown',
    mode: 'guided',
    // No setup commands: the cold_shutdown IC now spawns OFF LINE (#251), so the
    // `disconnect_grid` that used to sit here is a no-op. No dump-setpoint override
    // either — the config default IS the no-load anchor (FG-2).
    setup_commands: [],
    description: 'The full startup Mode 5, Cold Shutdown → Mode 2, Startup → Mode 1, At Power: heat the cold plant, take it critical, and ride the power up past 5 % into power operation — the other half of the round trip.',
    beats: [

      { id: 'from_mode5',
        trigger: { type: 'time', value: 2.0 },
        commentary: {
          learning: 'Back on the cold board — Mode 5, Cold Shutdown. In "Cooling Down" you brought a plant here from power; now you close the loop and take one all the way back UP. The first half is the heatup you learned in "The Big Warm-Up" — but this time you will not stop at Hot Standby. You will keep the reactor making power and cross into Mode 1, At Power. One difference from "The Big Warm-Up": there you let the pumps do the heating and never started the reactor. Here you are going to power anyway, so you take it critical early and heat on fission — faster, and the criticality is the point.',
          industry: 'Mode 5, Cold Shutdown. Objective: full startup to Mode 1, At Power (> 5 % at NOP). Unlike pwr_mode5_to_mode3 (pump-heat heatup, subcritical throughout) this one goes critical during the heatup and continues into power ascension. Wall clock compressed via time acceleration.',
        },
        highlight: { control_label: null, instrument_id: 'tavg' },
        advance: 'wait_for_trigger' },

      { id: 'warm_up',
        trigger: { type: 'delay', value: 8.0 },
        commentary: {
          learning: 'Bring the plant up: START THE REACTOR COOLANT PUMPS, raise the PRESSURIZER PRESSURE SETPOINT to 15.4 MPa, and hand over the nuclear instruments (SOURCE-RANGE detector OFF once the intermediate range is on scale). Then ease the CONTROL BANK out to take the core just critical and let ~10 % power warm the coolant. Go gently on the startup rate, and keep trimming the bank out as the temperature defect eats your reactivity — ride the power up in temperature toward NOP.',
          industry: 'Start RCPs; pressurize to NOP; SR→IR handoff. Approach criticality gently (watch SUR); hold ~10 % for nuclear heatup, trimming the bank against the temperature defect. Drive Tavg toward 300 °C. Turbine offline — SG bottles to the no-load dump setpoint.',
        },
        highlight: { control_label: 'Control Bank', instrument_id: 'tavg' },
        speed: 20,
        advance: 'wait_for_trigger' },

      { id: 'past_five',
        trigger: { type: 'all', triggers: [
          { type: 'true_state', field: 'tavg_c', direction: 'above', value: 250 },
          { type: 'true_state', field: 'power_pct', direction: 'above', value: 5.0 },
        ] },
        commentary: {
          learning: 'Watch the power meter: you are critical, hot, and making more than five percent power. By definition that is the boundary — below 5 % and critical is Mode 2, Startup; above it, with the plant hot, you are in Mode 1, At Power. Hold the reactor here and let the temperature finish climbing to NOP. From here a real crew rolls the turbine and picks up electrical load — you can put the turbine on line to close the energy path, or simply hold power and confirm the plant is stable at operating temperature.',
          industry: 'Critical, hot, power > 5 % — crossing the Mode 2 / Mode 1 boundary into power operation. Hold power and complete the ride to NOP temperature. Turbine roll / load pickup is the next step (reconnect grid) but not required to declare Mode 1.',
        },
        highlight: { control_label: 'Turbine Load', instrument_id: 'power' },
        speed: 10,
        advance: 'wait_for_trigger' },

      { id: 'arrive_mode1',
        // Tavg gate 296 (was 298, 2026-07-23): the no-load dump anchor is Tsat(dump
        // setpoint) ≈ 297 °C, so a ~10 % nuclear-heatup hold rides at ~297.5–298.0 and
        // only power spikes flickered past 298 — a razor edge that made completion
        // trajectory-dependent. 296 matches the "hot" criterion used everywhere else
        // (anchor − 1; pwr_mode5_to_mode3 gates its Hot Standby card at 295).
        trigger: { type: 'all', triggers: [
          { type: 'true_state', field: 'tavg_c', direction: 'above', value: 296 },
          { type: 'true_state', field: 'power_pct', direction: 'above', value: 5.0 },
        ] },
        commentary: {
          learning: 'That is Mode 1, At Power: critical, hot at normal operating temperature, sustaining real power. You have driven the whole arc — cold and dead to warm, critical, and on line — and together with "Cooling Down" you have closed the full commercial loop: Mode 5 to Mode 1 and back. Everything else in this campaign happens on this board.',
          industry: 'Mode 1, At Power reached: critical, NOP temperature, power > 5 %. Full Mode 5 → Mode 1 startup complete on integrated physics; with pwr_mode3_to_mode5 this closes the Mode 5 ↔ Mode 1 round trip.',
        },
        highlight: { control_label: null, instrument_id: 'power' },
        level_complete: {
          title: 'At Power — Mode 1 Reached',
          outcome_learning: 'You started a cold, dead reactor and drove it all the way to power: pressurized, pumped, critical, and up through the temperature to Mode 1, At Power. With the cooldown, you have run the entire commercial loop end to end.',
          outcome_industry: 'Mode 5 → Mode 1 startup complete: pressurization, RCP start, SR→IR handoff, approach to criticality, nuclear heatup, and power ascension past the 5 % boundary to Mode 1, At Power.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },
    ],
  };

})(globalThis.RD || (globalThis.RD = {}));
