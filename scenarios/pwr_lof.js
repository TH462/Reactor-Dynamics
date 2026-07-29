/*
 * pwr_lof.js — Loss of Coolant Flow, a PWR "when things go wrong" scenario
 * (Act IV). The scenario that exercises the hot-leg DNB / core-boiling physics.
 *
 * A reactor coolant pump trips at full power AND its flow channel sticks at 100 %.
 * Forced flow coasts down, each pass through the core heats the coolant more, and the
 * core exit climbs to saturation: departure from nucleate boiling (DNB),
 * core_void_fraction rises, fuel→coolant heat transfer collapses, the fuel heats up.
 * The low-flow trip never fires, because as far as it can tell the flow is fine.
 *
 * WHY THE STUCK CHANNEL IS THE SCENARIO, rewritten 2026-07-29 (#248). Two changes
 * landed under this lesson and both invalidated it:
 *   · #247 gave the low-flow trip a real instrument. It had read TRUE flow through a
 *     `__true_flow__` sentinel, and these beats TAUGHT that as a virtue ("a lagging
 *     meter would arrive too late"). That was a justification for an unbuilt
 *     instrument, written into training content.
 *   · #248 moved the setpoint from an unsourced 25 % to the real 90 % of rated. At
 *     90 % a healthy channel trips the reactor in 1.8 s and NOTHING HAPPENS —
 *     measured: peak core_void 0.000, fuel never leaves 693 °C. The old lesson
 *     ("hesitate and it boils") became unreachable, and correctly so: a real plant
 *     does not let flow coast to a quarter of rated before tripping.
 * What remains worth teaching is not the reflex — it is that the reflex has to be
 * driven by the PLANT, because the trip has one channel and that channel can lie.
 *
 * Measured trajectory (seed 42, through the full M5 stack, both failures at once):
 * DNB onset ~9 s, core_void peaks 0.60, fuel 693 → 930 °C (damage is 1200 °C, so the
 * core survives), indicated subcooling bottoms at 6.2 °C — below the 11 °C caution,
 * and the indication that is still telling the truth. RCS Flow - Low never actuates;
 * the reactor is finally caught at ~35 s by primary_pressure HIGH. A manual scram in
 * the first seconds holds fuel at 693 °C with core_void 0. Beats trigger on that real
 * response: the "you waited" branch fires on core_void_fraction crossing 0.02 (a
 * true_state author hook — the PWR has no void gauge), the recovery on the scram.
 *
 * Honesty acknowledgment voiced (M6 §13): v1 does not credit natural circulation, so
 * with the pumps off the flow reads zero — in a real plant, buoyancy-driven flow
 * would keep removing decay heat after the trip. The DNB heatup and the trip are
 * faithful. Authentic-units note (§13.1) in the intro.
 */
;(function (RD) {
  'use strict';

  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.pwr_lof = {
    id: 'pwr_lof',
    title: 'Loss of Coolant Flow',
    plant_id: 'pwr',
    design_version: null,
    initial_state: 'hot_full_power',
    mode: 'demonstration',
    description: 'A tripped pump, a flow gauge that says otherwise, and a protection trip that never comes.',
    beats: [

      { id: 'intro',
        trigger: { type: 'time', value: 2.0 },
        commentary: {
          learning: 'A pressurized water reactor at full power. Forced flow from the reactor coolant pump is what carries the core’s heat away fast enough to keep the water from boiling. Keep four things in view, because in a moment they are going to disagree with each other: the RCS flow indication, the pump itself, the average coolant temperature (Tavg), and the subcooling margin — how far the coolant is from boiling. One note: this is a US plant read in psia and °F in its real control room; your display follows whichever units you have chosen.',
          industry: 'PWR at 100 % power, steady. Forced circulation carries core power to the SGs. Watch RCS flow, RCP status, Tavg and subcooling margin — and be ready to cross-check them against each other rather than trusting any one of them. Plant-authentic units are US customary; the display follows your Units setting.',
        },
        advance: 'wait_for_trigger' },

      { id: 'pump_trips',
        trigger: { type: 'delay', value: 20.0 },
        commentary: {
          learning: 'Your reactor coolant pump just tripped. Its breaker is open, its motor is spinning down — and yet the RCS flow gauge is still sitting on 100 %. Only one of those can be true. Forced flow is coasting down right now, so each pass of water through the core is picking up more heat and the coolant leaving the core is climbing toward the boiling point. This is a FAST transient. The reactor has a low-flow trip that should catch it in about two seconds — but that trip reads the same gauge you are looking at. Do you trip the reactor yourself, or wait for automatics that are being told the flow is fine?',
          industry: 'RCP trip, coincident with a stuck flow channel indicating 100 %. Forced flow is coasting down (τ≈8 s) and core ΔT is rising, driving the core exit toward saturation; the RCS Flow - Low trip is single-channel and is being fed a healthy signal, so it will not actuate. Cross-check the pump breaker, Tavg and subcooling margin against the flow indication. Decision: manual trip, or rely on the RPS?',
        },
        // The pump trips AND its flow channel sticks at 100 %. Both, together: with a
        // healthy channel the low-flow trip fires in 1.8 s and there is no transient to
        // teach (measured — peak core_void 0.000, fuel never leaves 693 °C). The lesson
        // is not "flow fell", it is "the one instrument standing between you and DNB
        // told you nothing was wrong".
        commands: [
          { action: 'set_instrument_failure', instrument_id: 'rcs_flow', mode: 'stuck', value: 100 },
          { action: 'inject_failure', failure_id: 'rcp_trip' },
        ],
        branches: [
          { trigger: { type: 'operator_action', command: 'scram' }, goto: 'tripped_fast' },
          { trigger: { type: 'true_state', field: 'core_void_fraction', direction: 'above', value: 0.02 }, goto: 'boiling' },
        ] },

      // ---- craft branch: trip before the coolant boils --------------------
      { id: 'tripped_fast',
        trigger: { type: 'delay', value: 3.0 },
        commentary: {
          learning: 'Tripped. Power collapsed to decay heat before the coolant could reach boiling — the core exit stayed subcooled and you never got near departure from nucleate boiling. Notice what you did there: you acted on the pump, on Tavg, on subcooling margin — on the plant — and not on the one gauge that was lying to you. The automatic trip never came, and it was never going to: its flow channel is stuck at 100 %. A protection system is exactly as trustworthy as the instrument feeding it, and this one had a single channel.',
          industry: 'Manual trip inside the coastdown. Power → decay heat before the core exit reached saturation: no DNB, core_void stayed 0. The RCS Flow - Low trip did not and would not actuate — its single channel is stuck at 100 %. Correct response: trip on the corroborating indications rather than waiting on one signal.',
        },
        level_complete: {
          title: 'Loss of Flow — Tripped in Time',
          outcome_learning: 'You tripped on what the plant was doing, not on what one gauge said. The core exit never reached saturation — and the automatic trip you did not wait for never fired at all.',
          outcome_industry: 'Immediate manual trip collapsed power ahead of the coastdown; the core exit stayed subcooled and DNB was avoided entirely. The stuck flow channel defeated the automatic trip for the whole event.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },

      // ---- automatics branch: the hot channel boils first -----------------
      { id: 'boiling',
        trigger: { type: 'delay', value: 0.5 },
        commentary: {
          learning: 'You waited — and now watch the core outlet. Flow has fallen far enough that the hot channel has reached saturation and is boiling: this is departure from nucleate boiling, DNB. The steam film chokes heat out of the fuel, so fuel temperature is climbing. And look at the flow gauge: still 100 %. The low-flow trip is not late. It is not coming. It has one channel, that channel is stuck, and as far as the protection system knows this plant is running normally. Your subcooling margin is collapsing — that is the indication still telling you the truth.',
          industry: 'Held. Core exit reached saturation — DNB onset, core_void rising, fuel→coolant heat transfer degrading, fuel heating. RCS Flow indication remains pegged at 100 %, so the RCS Flow - Low trip is not armed against the real condition and will not actuate at all. Subcooling margin is the surviving indication; it falls below the caution threshold during this window.',
        },
        advance: 'wait_for_trigger' },

      { id: 'auto_tripped',
        trigger: { type: 'scram' },
        commentary: {
          learning: 'The reactor finally tripped — but read the reason. Not low flow. The core boiled for half a minute, the heat had nowhere to go, primary pressure climbed, and the HIGH-PRESSURE trip caught it. A completely different protection channel, on a completely different instrument, arriving long after the one that was supposed to handle this. The core survived — the fuel got hot but never reached damage — and none of that was the flow protection working. It was a backup catching a consequence. This is what a single-channel trip with a stuck transmitter costs you, and it is why real plants put three flow detectors on every loop and trip on two of them agreeing.',
          industry: 'Reactor trip on primary_pressure high — NOT on RCS Flow - Low, which never actuated. Sequence: DNB onset ≈9 s after the pump trip, peak core_void 0.60, peak fuel ≈930 °C (below the 1200 °C damage threshold), scram ≈35 s on high primary pressure with the flow indication still reading 100 %. A defence-in-depth backstop terminated the event; the function assigned to it did not. Real plants take 2-of-3 per loop for exactly this reason — this plant runs one channel, a declared departure (see `12` §10.7). Model honesty (M6 §13): natural circulation is not modeled, so flow reads zero with the pump off; the DNB heatup and the trips are faithful.',
        },
        level_complete: {
          title: 'Loss of Flow — Caught by a Backup Trip',
          outcome_learning: 'The hot channel boiled for half a minute and the core was saved by the high-pressure trip, not the low-flow trip. The protection you were relying on never fired, because its one transmitter said the flow was fine.',
          outcome_industry: 'DNB was terminated by primary_pressure high ≈35 s in, with peak core_void 0.60 and peak fuel ≈930 °C — no fuel damage. RCS Flow - Low never actuated: single channel, stuck at 100 %.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },
    ],
  };

})(globalThis.RD || (globalThis.RD = {}));
