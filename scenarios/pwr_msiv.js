/*
 * pwr_msiv.js — Bottle the Boiler (PWR safety-systems teaching scenario).
 *
 * The MSIV, taught by closing it at full power: turbine trip on closure, the
 * SG bottling up to its code safeties (control-layer actuation on the
 * steam_pressure instrument: pop 9.31 / reseat 9.0 MPa), the coupled feed
 * dying with the turbine, and the race between reopening the valve and the
 * low-SG-level trip.
 *
 * Probed timeline (seed 42, clean scenario board, times from closure):
 * turbine trips instantly; SG PRESS HI at ~5 s (9.0 MPa); safeties lift at
 * ~7 s (9.31); feed collapses with the turbine and the SG drains; AFW
 * auto-starts at ~48 s (20 %); the 12 % low-level trip scrams at ~50 s.
 * Reopening does NOT beat that trip — at ANY reopen time the level trip still
 * fires (early: the drain gets there at ~50 s anyway; late: the bulk steam
 * draw on reopening shrinks the level through the setpoint immediately). What
 * reopening DOES buy is the aftermath: with the MSIV open the steam dump
 * (~8.2 MPa no-load setpoint) carries decay heat to the condenser and the
 * safeties reseat for good; with it shut the code safeties cycle 9.31/9.0 on
 * decay heat indefinitely. Both endpoints teach; the cards say exactly this.
 * AFW refills either way to its ~24 % hold by ~4 min after closure.
 */
;(function (RD) {
  'use strict';

  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.pwr_msiv = {
    id: 'pwr_msiv',
    title: 'Bottle the Boiler',
    plant_id: 'pwr',
    design_version: null,
    initial_state: 'hot_full_power',
    mode: 'demonstration',
    description: 'Close the one valve between the boiler and everything else — then decide what to do with a bottled steam generator.',
    beats: [

      // Prompt-with-branches: the player closes the valve. A trip instead of
      // the closure lands on the cold-feet teaching card, not a softlock.
      { id: 'intro',
        trigger: { type: 'time', value: 2.0 },
        commentary: {
          learning: 'One valve on the Steam & Flow card matters more than all the rest: the MSIV — the main steam isolation valve, the single gate between the boiler and everything that uses its steam. Close it at power and the turbine loses its steam mid-spin, the feed train dies with the turbine, and a steam generator making a full plant’s worth of steam has nowhere to put it. Nobody does this at power on purpose — except in a simulator. Close the MSIV.',
          industry: 'MSIV — main steam isolation (Steam & Flow card). Closure at load: immediate turbine trip, loss of the coupled feed train, SG bottled against its code safeties. Drill: close_msiv at 100 % power and track the consequence chain.',
        },
        highlight: { control_label: 'MSIV', instrument_id: 'sg' },
        branches: [
          { trigger: { type: 'operator_action', command: 'close_msiv' }, goto: 'slammed' },
          { trigger: { type: 'scram' }, goto: 'cold_feet' },
        ] },

      { id: 'slammed',
        trigger: { type: 'delay', value: 1.0 },
        commentary: {
          learning: 'Shut — and look how much happened in one second. The turbine tripped the instant the valve swung, and the reactor tripped with it: above half power a turbine trip scrams the reactor deliberately, because losing the heat sink at full load is not something you wait out. That is the protection working, not failing. With the turbine gone the main feed died too, and the boiler is now sealed around a core making decay heat. Watch the steam pressure.',
          industry: 'MSIV closure at load → turbine trip → REACTOR TRIP via the P-9 anticipatory interlock (≥50 % power), all inside ~1 s. MSIV SHUT + TURB TRIP + reactor trip annunciators together. Coupled feed collapses with the turbine. SG now bottled against its code safeties with decay heat as the source.',
        },
        advance: 'wait_for_trigger' },

      // sg_safety_open is a status-boolean instrument; the safeties lift ~7 s
      // after closure. The delay leg keeps the slammed card readable.
      { id: 'safeties',
        trigger: { type: 'all', triggers: [
          { type: 'instrument', instrument: 'sg_safety_open', direction: 'is_true' },
          { type: 'delay', value: 14.0 },
        ] },
        commentary: {
          learning: 'SG PRESS HI at 9.0 — and there go the code safeties at 9.31: spring valves that pop off the steam-pressure gauge and reseat at 9.0. The bottle is holding. Understand what you are looking at, though: decay heat has exactly one way out of this plant right now, and it is through those valves. They are the last resort, and they are the only resort.',
          industry: 'SG code safeties lifted ~2 s post-trip — a control-layer actuation on the steam_pressure instrument (open 9.31 / reseat 9.0 MPa; SG PRESS HI alarm at 9.0). With the MSIV shut the dump path is isolated, so the safeties are the sole decay-heat relief. AFW feeding; main feed lost with the turbine.',
        },
        advance: 'wait_for_trigger' },

      // THE DECISION — re-authored 2026-07-26 (#218) for the P-9 reactor trip. This used
      // to be a race: the reactor was still critical, level was draining toward a 12 %
      // trip ~50 s out, and the branch on `scram` caught the player running out of clock.
      // With P-9 the scram now arrives at CLOSURE, so that branch fired immediately and
      // railroaded the mission to the bottled ending in 14 s no matter what the player
      // did — there was no decision left at all. There is also no longer a stopwatch:
      // the plant is already shut down and stable on its safeties, which makes this the
      // post-trip EOP question it always should have been. Inaction is now a real choice
      // with its own timer, not a failure to beat a clock.
      { id: 'decision',
        trigger: { type: 'delay', value: 10.0 },
        commentary: {
          learning: 'Now the real question, and you have time to think about it — the plant is shut down and it is not going anywhere. Decay heat is leaving through the code safeties, and they will keep popping and reseating all night if you let them. Those valves are meant for the worst day of the plant’s life, not for routine cooling. Reopen the MSIV and the steam dump takes the heat to the condenser instead. Or leave it bottled and watch what that actually costs.',
          industry: 'Post-trip decision, no time pressure: plant tripped and stable, decay heat relieved solely by the SG code safeties (9.31 / 9.0 cycling). Options: open_msiv restores the dump path to the condenser (pressure falls to the ~8.2 MPa no-load setpoint, safeties reseat), or hold and remain on the safeties indefinitely.',
        },
        highlight: { control_label: 'MSIV', instrument_id: 'sg' },
        branches: [
          { trigger: { type: 'operator_action', command: 'open_msiv' }, goto: 'reopened' },
          { trigger: { type: 'delay', value: 90.0 }, goto: 'rode_down' },
        ] },

      // ---- reopen branch ---------------------------------------------------
      { id: 'reopened',
        trigger: { type: 'delay', value: 0.5 },
        commentary: {
          learning: 'Open — and the bottle uncorks. Watch two things at once: the steam dump swinging wide to take the decay heat to the condenser, and the code safeties going quiet behind it. You will see the level dip as the pressure falls; that is shrink, and it is expected. Nothing here is a race. You have just moved the plant off its last-resort valves.',
          industry: 'MSIV reopened post-trip: dump path restored, dump drives to ~100 % on the Tavg error, SG pressure falls from the 9.31/9.0 safety band toward the ~8.2 MPa no-load dump setpoint. Brief level shrink on depressurization; AFW continues feeding. Measured: safeties reseat immediately on reopen and do not lift again.',
        },
        advance: 'wait_for_trigger' },

      // Re-keyed 2026-07-26 (#218): this beat used to wait on `{type:'scram'}`, which
      // with P-9 has ALREADY happened at closure — so it would have fired instantly and
      // narrated a trip the player had just watched. It now waits on the thing the
      // reopen actually causes: pressure coming off the safety band down to the dump
      // setpoint. That is the evidence the decision worked.
      { id: 'dump_restored',
        trigger: { type: 'all', triggers: [
          { type: 'instrument', instrument: 'steam_pressure', direction: 'below', value: 8.6 },
          { type: 'delay', value: 8.0 },
        ] },
        commentary: {
          learning: 'There it is. Pressure has come off the safety band and settled where the steam dump holds it, the safeties are shut, and decay heat is going to the condenser the way it should. AFW is refilling the boiler. Fast clock while she comes back.',
          industry: 'Steam pressure below the safety band, held at the dump setpoint (~8.2 MPa). SG code safeties reseated. Decay heat via steam dump to the condenser; AFW recovering level to its hold. Time 10× through recovery.',
        },
        speed: 10,
        advance: 'wait_for_trigger' },

      { id: 'recovered',
        trigger: { type: 'all', triggers: [
          { type: 'instrument', instrument: 'sg_level', direction: 'above', value: 20.0 },
          { type: 'delay', value: 40.0 },
        ] },
        commentary: {
          learning: 'Real time. Level back at the AFW hold, safeties quiet, temperature at the no-load point, decay heat going where it belongs. You never had a chance of saving the turbine — closing that valve tripped the plant in about a second, and it was supposed to. What you decided was what the plant would rest on afterwards: the condenser, or a pair of spring valves. That is the whole lesson.',
          industry: 'Time 1×. Terminal state: AFW hold, SG safeties reseated, Tavg at the ~297 °C no-load anchor, decay heat via steam dump to the condenser. The reactor trip was unavoidable and correct (P-9, anticipatory); the reopen determined the post-trip heat-removal path.',
        },
        speed: 1,
        level_complete: {
          title: 'Bottle the Boiler — Dump Path Restored',
          outcome_learning: 'The trip was never yours to prevent — it fired the moment the turbine did, on purpose. What you chose was where the decay heat goes, and you put it on the condenser instead of the code safeties.',
          outcome_industry: 'MSIV reopened post-trip: dump path restored, SG pressure off the safety band to the no-load setpoint, safeties reseated, Tavg at the no-load anchor. Correct post-trip heat-sink recovery.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },

      // ---- bottled branch (automatic trip or manual scram) -------------------
      { id: 'rode_down',
        trigger: { type: 'delay', value: 0.5 },
        commentary: {
          learning: 'You left it bottled — so this is what that looks like. Rods in, power gone, boiler still sealed, and the code safeties popping at 9.31 and reseating at 9.0, over and over. Eleven times in the first ten minutes, and they will keep going all night if nobody opens that valve. Fast clock while AFW refills the hold.',
          industry: 'Held with the MSIV shut: decay heat relieved ONLY by the SG code safeties, cycling 9.31 / 9.0 indefinitely (measured: 11 lifts in 600 s, no permanent reseat, SG pressure parked at 9.02, Tavg 305.6 °C). AFW recovering level. Time 10× through the refill.',
        },
        speed: 10,
        advance: 'wait_for_trigger' },

      { id: 'bottled',
        trigger: { type: 'all', triggers: [
          { type: 'instrument', instrument: 'sg_level', direction: 'above', value: 20.0 },
          { type: 'delay', value: 40.0 },
        ] },
        commentary: {
          learning: 'Real time. Level is back at the AFW hold — safe, stable... and listen: the safeties are still cycling, because the boiler is still a bottle. Nothing broke, and nothing is going to. But compare it with the other ending: reopen and the plant settles at the no-load temperature with the dump holding pressure and the safeties shut. Code safeties are the LAST line, not a service valve. The reopen is still waiting to be done — that is the lesson to carry out of this one.',
          industry: 'Time 1×. Terminal state: AFW hold with the MSIV shut — SG code safeties cycling 9.31 / 9.0 on decay heat as the only heat path, Tavg ~305 °C. Stable but non-conforming; contrast the reopen ending (dump holding ~8.2 MPa, safeties shut, Tavg at the ~297 °C no-load anchor). Restoring the dump path remains the required recovery action.',
        },
        speed: 1,
        level_complete: {
          title: 'Bottle the Boiler — Riding the Safeties',
          outcome_learning: 'You let it ride with the bottle corked — safe, but the plant is living on its last-resort valves until someone reopens the MSIV.',
          outcome_industry: 'Held with main steam isolated: decay heat on cycling SG code safeties. Endpoint teaches the cost of the unopened dump path; reopening remained the correct follow-up.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },

      // ---- cold-feet catch ---------------------------------------------------
      { id: 'cold_feet',
        trigger: { type: 'delay', value: 1.0 },
        commentary: {
          learning: 'You tripped the reactor before the experiment began — cautious, but the lesson went home unlearned: the MSIV never moved, so you never saw the bottle, the safeties, or the choice about where the heat goes. Retry and close the valve this time — the plant survives it, I promise.',
          industry: 'Reactor trip prior to MSIV closure — drill objective (isolation transient) not exercised. Retry: close_msiv at power; the transient is survivable and fully instrumented.',
        },
        level_complete: {
          title: 'Bottle the Boiler — Cold Feet',
          outcome_learning: 'The reactor is down and the valve never moved. Run it again and bottle the boiler for real.',
          outcome_industry: 'Manual/RPS trip before the isolation. Objective not met; retry the closure drill.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },
    ],
  };

})(globalThis.RD || (globalThis.RD = {}));
