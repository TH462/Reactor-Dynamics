/*
 * pwr_lof.js — Loss of Coolant Flow, a PWR "when things go wrong" scenario
 * (Act IV). The scenario that exercises the hot-leg DNB / core-boiling physics.
 *
 * A reactor coolant pump trips at full power. Forced flow coasts down, and with
 * less flow each pass through the core heats the coolant more — the core exit
 * (hot leg) climbs toward saturation. If nothing is done, the hot channel reaches
 * the boiling point: departure from nucleate boiling (DNB), core_void_fraction
 * rises, fuel→coolant heat transfer collapses and the fuel heats up — until the
 * low-flow trip scrams the reactor.
 *
 * That trip used to read TRUE coolant flow through a `__true_flow__` sentinel, and the
 * beats below used to TEACH that as a virtue ("a lagging meter would arrive too late").
 * It was not a virtue, it was an unbuilt instrument (#247): a trip that cannot be
 * fooled by a failed transmitter is a trip no one can be trained on. Since 2026-07-29
 * it reads the `rcs_flow` elbow-tap channel like every other trip on the plant.
 *
 * The interactive lesson is the reflex a loss of forced flow demands: trip FIRST.
 * A manual trip in the first few seconds collapses power before the coolant can
 * reach saturation — DNB is avoided entirely. Hesitate, and the hot channel boils
 * for a couple of seconds before the automatics catch it. Both outcomes are safe
 * (the core is never damaged); the difference is whether you reached boiling at all.
 *
 * Probed trajectory (seed 42, rcp_trip through the full M5 stack): flow coasts to
 * ~25 % over ~10 s; with no action thot pins at Tsat ~9 s in, core_void peaks 0.063,
 * fuel 693→786 °C, and the low-flow trip scrams at ~11 s. A manual
 * scram inside ~6 s holds fuel at 693 °C with core_void 0. Beats trigger on that
 * real response: the "you waited" branch fires on core_void_fraction crossing 0.02
 * (a true_state author hook — the PWR has no void gauge), the recovery on the scram.
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
    description: 'A tripped pump, a boiling hot channel, and the trip that has to be fast.',
    beats: [

      { id: 'intro',
        trigger: { type: 'time', value: 2.0 },
        commentary: {
          learning: 'A pressurized water reactor at full power. Forced flow from the reactor coolant pump is what carries the core’s heat away fast enough to keep the water from boiling. Keep three things in view: the pump / coolant-flow readout, the average coolant temperature (Tavg), and the subcooling margin — how far the coolant is from boiling. One note: this is a US plant read in psia and °F in its real control room; your display follows whichever units you have chosen.',
          industry: 'PWR at 100% power, steady. Forced circulation carries core power to the SGs. Watch coolant flow (pump_flow), Tavg, and subcooling margin. Plant-authentic units are US customary; the display follows your Units setting.',
        },
        advance: 'wait_for_trigger' },

      { id: 'pump_trips',
        trigger: { type: 'delay', value: 20.0 },
        commentary: {
          learning: 'Your reactor coolant pump just tripped. Forced flow is coasting down right now — watch the flow readout fall. With less flow, each pass of water through the core picks up more heat, and the coolant leaving the core is climbing toward the boiling point. This is a FAST transient. The trained reflex is to trip the reactor immediately and let it cool down in a controlled way. Do you trip now — or wait for the automatics?',
          industry: 'RCP trip. Forced flow coasting down; core ΔT rising as flow falls, driving the core exit toward saturation. Fast transient — the trained response is an immediate manual trip. Decision: trip now, or rely on the low-flow RPS trip?',
        },
        commands: [{ action: 'inject_failure', failure_id: 'rcp_trip' }],
        branches: [
          { trigger: { type: 'operator_action', command: 'scram' }, goto: 'tripped_fast' },
          { trigger: { type: 'true_state', field: 'core_void_fraction', direction: 'above', value: 0.02 }, goto: 'boiling' },
        ] },

      // ---- craft branch: trip before the coolant boils --------------------
      { id: 'tripped_fast',
        trigger: { type: 'delay', value: 3.0 },
        commentary: {
          learning: 'Tripped. Power collapsed to decay heat before the coolant could reach boiling — the core exit stayed subcooled and you never got near departure from nucleate boiling. That is exactly the reflex a loss of forced flow demands: trip first, ask questions after. The pumps are still coasting down, but a shut-down core makes almost no heat, so the reduced flow is no longer a threat.',
          industry: 'Manual trip inside the coastdown. Power → decay heat before the core exit reached saturation: no DNB, core_void stayed 0. Correct response to a loss of forced flow — trip immediately.',
        },
        level_complete: {
          title: 'Loss of Flow — Tripped in Time',
          outcome_learning: 'You tripped the moment the pump was lost, before the hot channel could boil. The core exit never reached saturation.',
          outcome_industry: 'Immediate manual trip collapsed power ahead of the coastdown; the core exit stayed subcooled and DNB was avoided entirely.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },

      // ---- automatics branch: the hot channel boils first -----------------
      { id: 'boiling',
        trigger: { type: 'delay', value: 0.5 },
        commentary: {
          learning: 'You waited — and now watch the core outlet. Flow has fallen far enough that the hot channel has reached saturation and is beginning to boil: this is departure from nucleate boiling, DNB. The steam film chokes heat transfer out of the fuel, so the fuel temperature is climbing. The reactor MUST trip on low flow now — and note what it is waiting on: the RCS flow indication, a transmitter like any other, with its own lag. The trip does not see the coolant. It sees a gauge.',
          industry: 'Held. Core exit reached saturation — DNB onset, core_void rising, fuel→coolant transfer degrading, fuel heating. The low-flow trip (reads the `rcs_flow` elbow-tap channel) must actuate now.',
        },
        advance: 'wait_for_trigger' },

      { id: 'auto_tripped',
        trigger: { type: 'scram' },
        commentary: {
          learning: 'There — the low-flow trip fired and scrammed the reactor. Power collapsed, the boiling cleared, the fuel is already cooling. The core was never damaged. But notice how close it ran: the hot channel boiled for a few seconds first, and everything that saved you was downstream of one flow transmitter. A trained operator trips on a pump loss without waiting for the automatics. One honest note: this simulation does not model natural circulation, so with the pumps off the flow reads zero — in a real plant, buoyancy would keep a slow flow moving to carry the decay heat away.',
          industry: 'RPS low-flow trip actuated; power → decay heat, core_void cleared, fuel cooling. Core undamaged. Trained response is still an immediate manual trip — the automatic trip is single-channel and arrives after DNB onset. Model honesty (M6 §13): natural circulation not modeled (flow reads 0 with pumps off); the DNB heatup and trip are faithful.',
        },
        level_complete: {
          title: 'Loss of Flow — Caught by the Low-Flow Trip',
          outcome_learning: 'The hot channel boiled briefly, then the low-flow trip scrammed the reactor and saved the core. Now you have seen how little margin that trip is working with — and that it is reading a gauge, not the coolant.',
          outcome_industry: 'DNB onset was terminated by the low-flow trip before fuel damage. Safe, but late — the trained response is an immediate manual trip on loss of forced flow.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },
    ],
  };

})(globalThis.RD || (globalThis.RD = {}));
