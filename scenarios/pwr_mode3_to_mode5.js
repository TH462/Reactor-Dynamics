/*
 * pwr_mode3_to_mode5.js — "Cooling Down" (campaign Act III, the Mode 1→5 close).
 *
 * The controlled cooldown Mode 3, Hot Standby → Mode 4, Hot Shutdown → Mode 5,
 * Cold Shutdown, driven on integrated physics (the engine now models a genuine
 * cold end state). The reactor is subcritical throughout; the craft is thermal:
 * borate for cold-shutdown margin (cooling ADDS reactivity through the hot-
 * referenced MTC/Doppler), cool the secondary so the steam generators pull the
 * primary down, depressurize in step to hold subcooling, then place Residual
 * Heat Removal below its 400 psi interlock and secure the reactor coolant pumps
 * so RHR draws the plant cold.
 *
 * Honesty: the cooldown RATE is time-compressed (this lumped model is not wall-
 * clock accurate). Safety Injection is placed in the blocked lineup at setup —
 * the real P-11 permissive — so it does not spuriously inject as pressure falls.
 * That block covers the SI PUMPS ONLY; the passive accumulators are isolated by
 * the operator in their own beat on the way down (#273).
 */
;(function (RD) {
  'use strict';

  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.pwr_mode3_to_mode5 = {
    id: 'pwr_mode3_to_mode5',
    title: 'Cooling Down — Mode 3 to Mode 5',
    plant_id: 'pwr',
    design_version: null,
    initial_state: 'hot_zero_power',
    mode: 'guided',
    description: 'The controlled cooldown Mode 3, Hot Standby → Mode 4, Hot Shutdown → Mode 5, Cold Shutdown: borate, cool the secondary, depressurize, place RHR, secure the pumps.',
    // Block Safety Injection for the cooldown (the real P-11 lineup) so it does
    // not fire as we take the plant below its 11 MPa actuation on the way down.
    setup_commands: [{ action: 'set_esf_auto', system: 'hpi', auto: false }],
    beats: [

      { id: 'intro',
        trigger: { type: 'time', value: 2.0 },
        commentary: {
          learning: 'The plant is in Mode 3, Hot Standby: subcritical and hot, ~304 °C at 15.4 MPa, decay heat still flowing into the coolant. Our job is to take it all the way to Mode 5, Cold Shutdown — cold, depressurized, on Residual Heat Removal. One honesty note up front: the real cooldown is a many-hour job held to strict rate limits; here it is compressed, but every step is the real step. I have placed Safety Injection in its blocked lineup so it will not fire as we depressurize.',
          industry: 'Mode 3, Hot Standby. Objective: controlled cooldown/depressurization to Mode 5, Cold Shutdown on RHR. Cooldown rate is time-compressed (lumped model). SI blocked per the P-11 cold-lineup — the depressurization crosses the 11.03 MPa SI setpoint.',
        },
        highlight: { control_label: null, instrument_id: 'tavg' },
        advance: 'wait_for_trigger' },

      { id: 'borate_and_cool',
        trigger: { type: 'delay', value: 8.0 },
        commentary: {
          learning: 'Start two things together. First BORATE — cooling a core makes it MORE reactive (the cold moderator is denser), so you must add boron to keep your shutdown margin as the temperature falls. Second, COOL THE SECONDARY: lower the steam-dump setpoint so the dump vents the steam generators down, and with them the primary drops through the SG. Keep feeding the SGs to hold their level, and watch Tavg start to fall.',
          industry: 'Commence boration (cold-shutdown margin — the temperature defect is positive). Lower the steam-dump pressure setpoint to draw the secondary down; the coolant→SG heat path takes the primary with it. Maintain SG level on feed/AFW. Target a controlled Tavg reduction.',
        },
        highlight: { control_label: 'Steam Dump', instrument_id: 'tavg' },
        speed: 60,
        advance: 'wait_for_trigger' },

      { id: 'depressurize',
        trigger: { type: 'true_state', field: 'tavg_c', direction: 'below', value: 240 },
        commentary: {
          learning: 'Good — the plant is coming down. Now DEPRESSURIZE in step with the cooldown: lower the pressurizer pressure setpoint (spray helps bring it down), but never faster than the temperature — keep a healthy subcooling margin so the coolant stays liquid. Make up pressurizer level with charging as the water shrinks. Bring pressure down toward the 400 psi (2.76 MPa) RHR permissive.',
          industry: 'Mode 4, Hot Shutdown. Depressurize tracking the cooldown, subcooling-guarded (spray + lowered pzr setpoint). Charging makes up the thermal shrink. Drive pressure toward the 2.76 MPa RHR autoclosure interlock.',
        },
        highlight: { control_label: null, instrument_id: 'press' },
        speed: 60,
        advance: 'wait_for_trigger' },

      // #273. The cooldown used to walk straight past the accumulators' 600 psi
      // (4.14 MPa) cover-gas pressure with their discharge valve still open, so all
      // four dumped into the RCS: measured endpoint accum_vol 0.0 %, boron 2310 ppm
      // against a 2500 ppm charge, inventory pegged at the mass clip. Nothing caught
      // it because indicated pzr level could not reach its 97 % trip (#249) — the
      // "arrived UNscrammed" check was passing for the wrong reason.
      //
      // 1000 psi (6.895 MPa) is where a real plant stops requiring them, so it is
      // where the isolation belongs: NUREG-1431 Rev 4.0 LCO 3.5.1 APPLICABILITY is
      // "MODES 1 and 2, MODE 3 with RCS pressure > [1000] psig", and LTOP LCO 3.4.12
      // requires the LTOP system operable "with ... the accumulators isolated"
      // (SR 3.4.12.3 "Verify each accumulator is isolated"). It also leaves a clean
      // 2.75 MPa of margin above this plant's arming pressure, so a player who does
      // the step on cue never sees a discharge at all.
      { id: 'isolate_accumulators',
        trigger: { type: 'true_state', field: 'pressure_mpa', direction: 'below', value: 6.895 },
        commentary: {
          learning: 'Stop and ISOLATE THE ACCUMULATORS before you go any lower. Those are passive tanks of borated water held under a nitrogen blanket at 600 psi (4.14 MPa) — nothing switches them on, they simply dump the moment RCS pressure falls below their cover gas. That is exactly what you want in a Loss-Of-Coolant Accident and exactly what you do not want on a planned cooldown: you would flood the reactor coolant system with 2500 ppm borated water, empty every tank, and arrive at Cold Shutdown with no passive injection left. Blocking Safety Injection at the start did not cover these — SI is pumps, and these are pressure and a check valve. Close the accumulator discharge valve now.',
          industry: 'Isolate the SI accumulators. Below 1000 psi (6.895 MPa) they are no longer required OPERABLE (NUREG-1431 LCO 3.5.1), and the LTOP lineup requires them isolated (LCO 3.4.12 / SR 3.4.12.3). Passive injection is not covered by the P-11 SI block: discharge is check-valve driven off the 4.14 MPa cover gas. Close the motor-operated discharge isolation valve before the depressurization reaches it.',
        },
        highlight: { control_label: 'Accumulator valve', instrument_id: 'press' },
        speed: 60,
        advance: 'wait_for_trigger' },

      { id: 'place_rhr',
        trigger: { type: 'true_state', field: 'pressure_mpa', direction: 'below', value: 2.76 },
        commentary: {
          learning: 'You are below the 400 psi interlock — Residual Heat Removal can go in service now. Open the RHR hot-leg suction (Emergency Cooling card, RHR tab), then SECURE the reactor coolant pumps: RHR provides the circulation from here, and with the pumps off the steam generators stop feeding heat back in, so RHR can pull the plant the rest of the way to cold. Keep RHR heat-exchanger flow up for the fastest safe cooldown.',
          industry: 'Below the 2.76 MPa RHR permissive: align RHR (hot-leg suction open). Secure RCPs — RHR forced circulation takes over and decouples the SG (flow→0). Maximize RHR HX flow split for cooldown rate.',
        },
        highlight: { control_label: 'Residual Heat Removal (RHR)', instrument_id: null },
        speed: 60,
        advance: 'wait_for_trigger' },

      { id: 'arrive_mode5',
        trigger: { type: 'true_state', field: 'tavg_c', direction: 'below', value: 95 },
        commentary: {
          learning: 'That is Mode 5, Cold Shutdown: the coolant is below ~93 °C, the plant is depressurized, RHR is carrying the decay heat, and the reactor is deeply subcritical on boron. This is the board a real crew hands over at the end of a shutdown — and the exact state the "Cold Shutdown" free-play condition starts you in. From here the only way is up: refuel, or bring it back to power.',
          industry: 'Mode 5, Cold Shutdown reached: RCS ≤ ~93 °C, depressurized, RHR in service, deeply subcritical. Matches the cold_shutdown initial condition. Cooldown evolution complete.',
        },
        highlight: { control_label: null, instrument_id: 'tavg' },
        level_complete: {
          title: 'Cold Shutdown — Reached',
          outcome_learning: 'You took a hot, pressurized reactor all the way to cold shutdown: borated for margin, cooled through the steam generators, depressurized on subcooling, and put RHR in service. That is the deepest a plant goes without opening it up.',
          outcome_industry: 'Mode 3 → Mode 5 cooldown complete on integrated physics: boration, secondary-led cooldown, subcooling-guarded depressurization, RHR placement, RCP securing.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },
    ],
  };

})(globalThis.RD || (globalThis.RD = {}));
