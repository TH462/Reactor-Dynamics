/*
 * pwr_slb.js — Main Steam Line Break, a PWR "when things go wrong" scenario
 * (Act IV). An accident of REACTIVITY delivered from the secondary side.
 *
 * The lesson is counterintuitive: a broken *steam* pipe raises *reactor* power.
 * The break blows the secondary down, the primary overcools, and the negative
 * moderator temperature coefficient turns that cooldown into positive reactivity
 * — power climbs with no rod motion at all. The trained response is to trip and
 * isolate; the protection system also catches it (low pressurizer level as the
 * cooling primary shrinks). Either way the plant stays safe: in this engine the
 * scram dominates the cooldown, so there is no return to power to reproduce.
 *
 * Two branches at the decision point — trip manually (the craft) or wait (the
 * automatics catch it) — both reaching a level_complete with advance:"end" so a
 * finished path never falls through into the other.
 *
 * Probed trajectory (seed 42, severity 1.0, full M5 stack): power 100→113 % over
 * ~60 s while Tavg falls 304→284 °C; subcooling margin WIDENS (overcooling, no
 * DNB, core_void stays 0); auto-trip on pzr-level-low at ~66 s. Beats trigger on
 * that real response.
 *
 * Honesty acknowledgments voiced (M6 §13): real safety injection is borated (this
 * model's HPI adds inventory, not boron) and a real plant guards against
 * pressurized thermal shock — neither is modeled; the reactivity rise and the trip
 * are faithful. Authentic-units note (§13.1) in the intro.
 */
;(function (RD) {
  'use strict';

  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.pwr_slb = {
    id: 'pwr_slb',
    title: 'Steam Line Break',
    plant_id: 'pwr',
    design_version: null,
    initial_state: 'hot_full_power',
    mode: 'demonstration',
    description: 'A ruptured steam line — when cooling the plant makes it hotter.',
    beats: [

      { id: 'intro',
        trigger: { type: 'time', value: 2.0 },
        commentary: {
          learning: 'A pressurized water reactor at full power, steady. Keep three gauges in view: reactor power, the average coolant temperature (Tavg), and the steam pressure on the secondary side. One note: this is a US plant whose real control room reads pressure in psia and temperature in °F — your display follows whichever units you have chosen; both are fine.',
          industry: 'PWR at 100% power, steady state. Watch power_range, Tavg, and secondary (steam) pressure. Plant-authentic units are US customary (psia, °F); the display follows your Units setting.',
        },
        advance: 'wait_for_trigger' },

      { id: 'the_break',
        trigger: { type: 'delay', value: 20.0 },
        commentary: {
          learning: 'A main steam line has just ruptured. The secondary side is blowing down through the break — watch the steam pressure collapse. With the secondary suddenly cold, it is pulling heat out of the reactor coolant far faster than normal, and the average coolant temperature is starting to fall. Keep your eye on the reactor power.',
          industry: 'Main steam line break. Secondary depressurizing through the break; the SG is now an oversized heat sink. Tavg falling (overcooling). Watch power_range.',
        },
        // UPSTREAM of the MSIV — inside containment, between generator and valve
        // (#199). Deliberate: this scenario's whole arc is "you cannot stop the
        // cooldown, you can only shut the reactor down", and its `waiting` branch
        // needs the blowdown to keep draining the pressurizer to the low-level
        // trip. With the MSIV now able to end a DOWNSTREAM break, a player who
        // shut it mid-scenario would terminate the casualty and strand the story.
        // The physics is also the honest one for a single-generator plant: there
        // is no intact SG to fall back on, so an upstream break has no isolation.
        //
        // SEVERITY 1.0 → 0.30 (2026-08-05, #370c), and the reason is a PLANT change
        // rather than a tuning preference. Automatic steam line isolation now fires
        // on any break large enough to reach its flow setpoint — including an
        // upstream one, because the plant cannot tell where the break is — and
        // closing the MSIV trips the turbine, which above P-9 scrams the reactor.
        // At full area the plant therefore trips within seconds, and this beat's
        // decision ("power is climbing and nothing has tripped — do you scram, or
        // wait for the automatics?") became unreachable: the automatics had already
        // answered. That is PROTOTYPICAL — a real plant trips promptly on a large
        // steam line break — so the physics stands and the CONTENT moved (HR9).
        // A 30 % break stays under the isolation setpoint, still overcools hard
        // (Tavg to 214 °C measured), and still walks power up through the negative
        // MTC, so the authored lesson survives intact on a casualty the plant does
        // not short-circuit.
        commands: [{ action: 'inject_failure', failure_id: 'steam_line_break_upstream', severity: 0.30 }],
        advance: 'wait_for_trigger' },

      { id: 'reactivity_event',
        trigger: { type: 'instrument', instrument: 'power_range', direction: 'above', value: 103.0 },
        commentary: {
          learning: 'Look at the power — it is CLIMBING, and no one has touched a control rod. This is the whole lesson: cooling the water in the core added reactivity. The moderator temperature coefficient is negative, so colder coolant means MORE reactivity, and the chain reaction speeds up. A broken steam pipe on the outside has become a power excursion on the inside. The reactor has not tripped yet. Do you trip it now — or wait for the automatics?',
          industry: 'Power rising with no rod motion: the cooldown is inserting positive reactivity through the negative MTC. A secondary-side break is a reactivity transient. No trip yet. Decision: manual trip now, or rely on RPS?',
        },
        branches: [
          { trigger: { type: 'operator_action', command: 'scram' }, goto: 'operator_trip' },
          { trigger: { type: 'inaction', window: 20.0 }, goto: 'waiting' },
        ] },

      // ---- craft branch: the operator trips -------------------------------
      { id: 'operator_trip',
        trigger: { type: 'delay', value: 3.0 },
        commentary: {
          learning: 'Tripped. Power collapses to decay heat — you recognized a reactivity event coming from the secondary side and shut the reactor down, which is exactly the trained response to a steam line break. The next move in a real plant is to isolate the break, and here is why you cannot: this rupture is upstream of the main steam isolation valve — between the steam generator and the valve — so there is no valve on the wrong side of it to shut. A multi-loop plant isolates the faulted generator and keeps steaming the intact ones; this plant has exactly one generator. The break goes on cooling the plant, and a subcritical reactor is your answer to it. (Had the pipe failed downstream, in the turbine hall, shutting the MSIV would have ended the blowdown outright.) Two honest notes on this simulation: a real plant injects BORATED water to hold the core down against continued cooldown, and it guards against thermal shock to the vessel from that cold water — this model captures neither, but the reactivity rise and the trip you just made are faithful.',
          industry: 'Manual trip. Power → decay heat. Correct response to a steam line break: trip, then isolate. Isolation is unavailable here — the break is UPSTREAM of the MSIV on a single-generator plant, so no isolation reaches it (a downstream break is terminated by shutting the MSIV; a multi-loop plant isolates the faulted SG and steams the intact ones). Model honesty (M6 §13): real SI is borated (return-to-power protection) and PTS is a concern — neither modeled here; the MTC-driven excursion and the trip are faithful.',
        },
        level_complete: {
          title: 'Steam Line Break — Controlled',
          outcome_learning: 'You read the rising power as a reactivity event and tripped before the automatics had to. Cooling the plant raised its power — and you knew why.',
          outcome_industry: 'Early manual trip on the MTC-driven excursion. The overcooling continued but the scrammed core stayed safely subcritical.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },

      // ---- automatics branch: the operator waits --------------------------
      { id: 'waiting',
        trigger: { type: 'delay', value: 2.0 },
        commentary: {
          learning: 'You are holding off — so let us watch the protection system work. The power is still climbing on the overcooling, but something else is happening too: as the coolant cools it shrinks, and that draining is emptying the pressurizer. I am running time faster now — watch the pressurizer level fall toward its trip.',
          industry: 'Holding. Power still rising on the cooldown; the shrinking (contracting) primary is draining the pressurizer. Time accelerated — watch for the low-pressurizer-level trip.',
        },
        speed: 8,
        advance: 'wait_for_trigger' },

      { id: 'auto_tripped',
        trigger: { type: 'scram' },
        commentary: {
          learning: 'Back to real time. The reactor tripped itself — on low pressurizer level, as the cooling, contracting primary drained the pressurizer. The plant protected itself and stayed safe. But notice what it took: the trained operator does not wait for that. On a steam line break you trip immediately, then isolate the break if you can reach it. This one you cannot: it is upstream of the main steam isolation valve, on the generator side, so no valve stands between it and the steam generator. (A break downstream, out in the turbine hall, is a different casualty — shut the MSIV and the blowdown stops.) Two honest notes: a real plant would inject BORATED water to hold the core down against the continued cooldown, and would worry about thermal shock to the vessel — neither is modeled here, though the reactivity rise and the trip are faithful.',
          industry: 'Reactor trip on low pzr level (contracting primary drained the pressurizer). Plant safe, but late — the correct response is an immediate manual trip. Isolation is unavailable: the break is UPSTREAM of the MSIV (a downstream break IS terminated by shutting it). Model honesty (M6 §13): borated SI and PTS not modeled; the MTC excursion and trip are faithful.',
        },
        speed: 1,
        level_complete: {
          title: 'Steam Line Break — Caught by the Automatics',
          outcome_learning: 'The protection system tripped the reactor on low pressurizer level and kept the plant safe — but a steam line break is an immediate-trip event. Now you know why the power rose.',
          outcome_industry: 'RPS trip on low pzr level terminated the MTC-driven excursion. Safe, but the trained response is an immediate manual trip and steam-line isolation.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },
    ],
  };

})(globalThis.RD || (globalThis.RD = {}));
