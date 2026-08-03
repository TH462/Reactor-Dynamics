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
 * RE-PREMISED A THIRD TIME, 2026-08-03 (#314) — and that is worth reading before you
 * author anything here. The plant gained the REAL Westinghouse RCP breaker-position
 * reactor trip (WTSM 12.2 §12.2.3.12 item 2, ML11223A301: *"The reactor trips if at
 * least two reactor coolant pump breakers open"*), because it had one loss-of-flow trip
 * where a real plant has four. That trip reads a CONTACT, not a process measurement, so
 * the stuck flow channel cannot touch it. Measured: the reactor now trips at 23.0 s —
 * ONE SECOND after the pump — with peak core void 0.000 and fuel unmoved at 1280 °F
 * (693 °C), against 58.5 s / 0.628 / 1713 °F (934 °C) before.
 *
 * So the old lesson is gone, and correctly so: the boil-off was only reachable because
 * two of the three real trips were missing. What is left is BETTER and it is a coupling
 * rather than a deception — DIVERSE PROTECTION. The gauge still lies. The trip assigned
 * to this event still never fires. And the reactor trips anyway, in one second, because
 * a real plant senses the same casualty four different ways on four different physical
 * signals. Under DESIGN_CRITERIA §6 that is Tier A material; "the gauge lied" is the
 * Tier C payoff riding on top of it, not the subject.
 *
 * THE MISSION LOST ITS BRANCH, deliberately. It was a decision scenario ("trip it
 * yourself, or wait?") and the decision window is now one second, so there is nothing to
 * decide — it is a demonstration. Flagged for the owner rather than papered over: this
 * premise has now been invalidated THREE times by fidelity work (#248, #248 again, #314),
 * which is a reasonable argument for retiring the mission rather than re-premising it a
 * fourth time. Kept for now because the diverse-protection lesson is real and nothing
 * else in the campaign teaches it.
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
 * Measured trajectory (seed 42, full M5 stack, both failures at t=22 s): reactor trip at
 * 23.0 s on `rcp_running is_false` — the breaker contact. RCS Flow - Low never actuates
 * and never would; its channel reads 100 % throughout. Peak core void 0.000, fuel never
 * leaves 693 °C, no DNB at any point. The flow indication is STILL pegged at 100 % after
 * the trip, with the pump breaker open and the rods on the bottom, which is the tell the
 * closing beat asks the player to read.
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
          learning: 'Your reactor coolant pump just tripped — breaker open, motor spinning down. Now look at the RCS flow gauge: still sitting on 100 %. Only one of those can be true, and it is not the gauge. Watch what happens next, because it happens in about a second.',
          industry: 'RCP trip, coincident with a stuck flow channel indicating 100 %. Forced flow is coasting down (τ≈8 s). The RCS Flow - Low trip is single-channel and is being fed a healthy signal, so it will not actuate. Observe the protection response.',
        },
        // The pump trips AND its flow channel sticks at 100 %. Both, together: the stuck
        // channel is what makes the point, because it takes the ASSIGNED trip out of the
        // picture entirely and leaves the diverse one to do the work. Measured: reactor
        // trip at 23.0 s on `rcp_running is_false`, one second after the pump, with the
        // flow gauge still reading 100 % and peak core void 0.000.
        commands: [
          { action: 'set_instrument_failure', instrument_id: 'rcs_flow', mode: 'stuck', value: 100 },
          { action: 'inject_failure', failure_id: 'rcp_trip' },
        ],
        advance: 'wait_for_trigger' },

      { id: 'auto_tripped',
        trigger: { type: 'scram' },
        commentary: {
          learning: 'One second. Now read the reason on the trip, because it is the whole lesson: NOT low flow. The reactor tripped on the pump BREAKER — a contact on the switchgear that closes a circuit when the breaker opens. And look at your flow gauge: still 100 %, right now, with the rods on the bottom. The trip that was supposed to handle a loss of flow never fired and never would have; it reads that gauge. What saved the core was a completely different signal — not a measurement of the coolant at all, but a piece of metal moving. That is why a real plant senses this one casualty four separate ways: low flow, breaker position, bus voltage, bus frequency. Four physical signals, so that no single failure can take the protection away.',
          industry: 'Reactor trip on RCP breaker position (`rcp_running is_false`) at ≈1 s — NOT on RCS Flow - Low, which never actuated and could not: its channel is stuck at 100 % and remains so post-trip. Peak core_void 0.000, fuel unchanged at ≈693 °C, no DNB at any point. WTSM 12.2 §12.2.3.12 (ML11223A301) gives four diverse loss-of-flow trips — low loop flow (2/3 per loop), breaker position, RCP bus under-voltage, RCP bus under-frequency; this plant models the first two and declares the two bus trips as departures (`12` §10.7, DESIGN_COMPANION §8.24), because it does not model an RCP bus. Diversity of SIGNAL, not redundancy of channel, is what defeats a stuck transmitter. Model honesty (M6 §13): natural circulation is not modeled, so true flow goes to zero with the pump off.',
        },
        level_complete: {
          title: 'Loss of Flow — Caught by a Contact',
          outcome_learning: 'The flow gauge said 100 % and never stopped saying it. The low-flow trip never fired. The reactor tripped anyway, in one second, on a breaker contact — a different signal, of a different kind, that a failed transmitter cannot reach.',
          outcome_industry: 'Reactor trip on RCP breaker position ≈1 s after the pump trip; no DNB, peak core_void 0.000. RCS Flow - Low never actuated (single channel, stuck at 100 %). Protection was preserved by signal diversity rather than channel redundancy.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },
    ],
  };

})(globalThis.RD || (globalThis.RD = {}));
