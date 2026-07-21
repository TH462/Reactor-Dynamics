/*
 * pwr_mode5_to_mode3.js — "The Big Warm-Up" (campaign Act II, the cold start).
 *
 * The heatup Mode 5, Cold Shutdown → Mode 4, Hot Shutdown → Mode 3, Hot Standby,
 * driven on integrated physics from the genuine cold_shutdown board. The trainer
 * supplies the heatup with controlled low-power NUCLEAR heat (the lumped coolant
 * heat capacity makes pump heat impractically slow), so the craft is a careful
 * approach to criticality that you then ride UP in temperature: the temperature
 * defect keeps trimming your reactivity away, so you keep easing the bank out to
 * hold a low power while Tavg climbs to normal operating temperature. Then you
 * settle the reactor subcritical-but-hot: Mode 3, Hot Standby.
 *
 * Honesty: the heatup RATE is time-compressed, and real plants reach hot standby
 * on pump heat before criticality; here the heat source is controlled fission.
 */
;(function (RD) {
  'use strict';

  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.pwr_mode5_to_mode3 = {
    id: 'pwr_mode5_to_mode3',
    title: 'The Big Warm-Up — Mode 5 to Mode 3',
    plant_id: 'pwr',
    design_version: null,
    initial_state: 'cold_shutdown',
    mode: 'guided',
    // Pre-stage the secondary: turbine offline (no steam draw) so the steam
    // generators bottle up to the no-load setpoint as the plant heats.
    // No dump-setpoint override: the config default IS the no-load anchor (FG-2).
    setup_commands: [{ action: 'disconnect_grid' }],
    description: 'The heatup Mode 5, Cold Shutdown → Mode 4, Hot Shutdown → Mode 3, Hot Standby: pressurize, start the pumps, take the core critical at low power and ride the temperature up to normal operating conditions.',
    beats: [

      { id: 'intro',
        trigger: { type: 'time', value: 2.0 },
        commentary: {
          learning: 'Welcome to Mode 5, Cold Shutdown — a genuinely cold plant. Look at the board: Tavg near 50 °C, the primary depressurized, Residual Heat Removal carrying what little heat there is, the reactor deeply subcritical on boron. Your job is the heatup: all the way to Mode 3, Hot Standby at ~304 °C and 15.4 MPa. Honesty first: a real heatup is a many-hour job on pump heat, held to strict rate limits. Here it is compressed, and the heat comes from a little controlled fission — but every control you touch is the real one.',
          industry: 'Mode 5, Cold Shutdown: RCS ~50 °C, depressurized, RHR in service, deeply subcritical. Objective: heatup to Mode 3, Hot Standby (NOP T/P). Rate is time-compressed; heat source is controlled low-power fission (lumped heat capacity makes pump-heat heatup impractical). All controls are the real ones.',
        },
        highlight: { control_label: null, instrument_id: 'tavg' },
        advance: 'wait_for_trigger' },

      { id: 'pressurize',
        trigger: { type: 'delay', value: 8.0 },
        commentary: {
          learning: 'Start by drawing the plant up to pressure and getting the pumps turning. START THE REACTOR COOLANT PUMPS (their heat helps warm the loop, and the steam generators need the flow). Raise the PRESSURIZER PRESSURE SETPOINT toward 15.4 MPa — heaters will bring pressure up, and Residual Heat Removal auto-isolates as you climb past its 400 psi interlock. One more startup step before power moves: hand the nuclear instruments over — turn the SOURCE-RANGE detector OFF now that the intermediate range is on scale, so its high-flux trip will not cut your climb short.',
          industry: 'Start RCPs. Raise the pressurizer setpoint to NOP (15.41 MPa) — heaters pressurize; RHR autocloses above the 2.76 MPa interlock. Perform the SR→IR handoff (P-6 satisfied): de-energize the SR before power rises past its 1e5 cps high-flux trip.',
        },
        highlight: { control_label: 'Reactor Coolant Pumps (RCP)', instrument_id: 'press' },
        speed: 10,
        advance: 'wait_for_trigger' },

      { id: 'heat_up',
        trigger: { type: 'true_state', field: 'pressure_mpa', direction: 'above', value: 14.0 },
        commentary: {
          learning: 'At pressure with pumps running. Now the heatup itself: ease the CONTROL BANK out a little to take the reactor just critical, and let a low power — around 10 % — warm the coolant. Go gently: watch the STARTUP RATE and keep it low; small withdrawals, then wait. As the plant warms, the rising temperature quietly removes reactivity (the temperature defect), so power will sag and you keep easing the bank out to hold it — riding the temperature up. Take Tavg all the way to ~304 °C. Keep feeding the steam generators.',
          industry: 'Approach criticality on the control bank (gentle — watch SUR). Hold ~10 % power for nuclear heatup; the temperature defect trims reactivity as Tavg rises, so trim the bank out to hold power. Drive Tavg to NOP (~304 °C). Maintain SG level. Turbine stays offline — the SG bottles to the no-load dump setpoint.',
        },
        highlight: { control_label: 'Control Bank', instrument_id: 'tavg' },
        speed: 20,
        advance: 'wait_for_trigger' },

      { id: 'establish_standby',
        trigger: { type: 'true_state', field: 'tavg_c', direction: 'above', value: 295 },
        commentary: {
          learning: 'You are hot — normal operating temperature. Now settle the plant into Mode 3, Hot Standby: bring the reactor back subcritical while HOLDING the temperature. Insert the CONTROL BANK (and/or borate) until power falls back to essentially zero and the startup rate goes negative — the coolant stays hot on pump heat and residual decay, but the chain reaction is off. That subcritical-and-hot board is Hot Standby.',
          industry: 'At NOP temperature. Establish Mode 3, Hot Standby: insert the bank / borate to return subcritical at temperature. Power → ~0 on negative SUR; RCS held hot on pump heat. This is the Hot Standby lineup — the board pwr_startup begins from.',
        },
        highlight: { control_label: 'Control Bank', instrument_id: 'power' },
        speed: 5,
        advance: 'wait_for_trigger' },

      { id: 'arrive_mode3',
        trigger: { type: 'all', triggers: [
          { type: 'true_state', field: 'tavg_c', direction: 'above', value: 285 },
          { type: 'true_state', field: 'reactivity_pcm', direction: 'below', value: -300 },
          { type: 'true_state', field: 'power_pct', direction: 'below', value: 5.0 },
        ] },
        commentary: {
          learning: 'That is Mode 3, Hot Standby: hot at operating temperature and pressure, subcritical with margin, the plant poised to start. You just did the hard half of a startup — the cold-to-hot heatup that the "Chain Reaction" and "Reactor startup" lessons skip by beginning here. From this board, the approach to criticality and power ascension are the next steps.',
          industry: 'Mode 3, Hot Standby reached: NOP T/P, subcritical margin restored. This is the hot_zero_power board the startup missions begin from. Heatup evolution complete.',
        },
        highlight: { control_label: null, instrument_id: 'tavg' },
        level_complete: {
          title: 'Hot Standby — Reached',
          outcome_learning: 'You took a cold, dead plant and warmed it to life: pressurized, started the pumps, handed over the nuclear instruments, took it critical, and rode a low power up to operating temperature — then settled it at Hot Standby. That is the beginning of every startup.',
          outcome_industry: 'Mode 5 → Mode 3 heatup complete on integrated physics: pressurization, RCP start, SR→IR handoff, approach to criticality, nuclear heatup to NOP, and return to subcritical Hot Standby.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },
    ],
  };

})(globalThis.RD || (globalThis.RD = {}));
