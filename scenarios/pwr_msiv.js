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
          learning: 'Shut. The turbine tripped the instant the valve swung — MSIV SHUT and the turbine-trip annunciators are lighting together — and with the turbine gone, the main feed just died too. The boiler is sealed: full power steaming into a closed bottle. Watch the steam pressure.',
          industry: 'MSIV closed with the generator loaded → turbine trip (MSIV SHUT + TURB TRIP annunciators). Coupled feed collapses with the turbine. SG bottled at ~100 % power — steam pressure rising toward the code safety band.',
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
          learning: 'SG PRESS HI at 9.0 — and there go the code safeties at 9.31: spring valves the control layer pops off the steam-pressure gauge and reseats at 9.0. The bottle is holding. But watch the level — with the feed dead, this boiler is draining.',
          industry: 'SG code safeties lifted ~7 s post-closure — a control-layer actuation on the steam_pressure instrument (open 9.31 / reseat 9.0 MPa; SG PRESS HI alarm at 9.0). Feed flow zero; SG inventory draining while the safeties pass the steaming.',
        },
        advance: 'wait_for_trigger' },

      // THE DECISION, in real time: the drain crosses ~70 % indicated around
      // 28 s after closure; the low-level trip lands at ~50 s. The scram branch
      // catches both the automatic trip (inaction) and a manual trip — the
      // bottled aftermath is the same either way.
      { id: 'decision',
        trigger: { type: 'all', triggers: [
          { type: 'instrument', instrument: 'sg_level', direction: 'below', value: 70.0 },
          { type: 'delay', value: 14.0 },
        ] },
        commentary: {
          learning: 'Decision, and the clock is real: the level is falling toward the 12 percent trip — well under a minute away. Reopen the MSIV and give this steam somewhere useful to go, or leave the bottle shut and let the trip end it. Choose.',
          industry: 'SG inventory falling toward the 12 % low-level trip (~50 s post-closure, probed). Options: open_msiv — restore the dump path (a shrink-driven trip follows anyway, but the safeties reseat) — or hold and take the bottled trip.',
        },
        highlight: { control_label: 'MSIV', instrument_id: 'sg' },
        branches: [
          { trigger: { type: 'operator_action', command: 'open_msiv' }, goto: 'reopened' },
          { trigger: { type: 'scram' }, goto: 'rode_down' },
        ] },

      // ---- reopen branch ---------------------------------------------------
      { id: 'reopened',
        trigger: { type: 'delay', value: 0.5 },
        commentary: {
          learning: 'Open — and feel the catch: the instant the bottle uncorked, the rush of steam pulled the level DOWN. Shrink. The low-level trip is going to get there first no matter what you do now. That is fine. Watch what you bought.',
          industry: 'MSIV reopened: bulk steam draw → level shrink accelerates — the 12 % trip is unavoidable (probed: reopening at any time still trips). The gain is downstream: dump path restored; safeties will reseat post-trip.',
        },
        advance: 'wait_for_trigger' },

      { id: 'trip_recovery',
        trigger: { type: 'all', triggers: [
          { type: 'scram' },
          { type: 'delay', value: 12.0 },
        ] },
        commentary: {
          learning: 'SCRAM on low level — and now the difference you made: pressure is falling to the steam dump’s setpoint, the code safeties have reseated, and decay heat is flowing to the condenser like it should. AFW is refilling the boiler. Fast clock while she comes back.',
          industry: 'Low-SG trip. Post-trip lineup with the MSIV open: steam dump (~8.2 MPa no-load setpoint) carries decay heat to the condenser; SG safeties reseated; AFW refilling to its hold. Time 10× through recovery.',
        },
        speed: 10,
        advance: 'wait_for_trigger' },

      { id: 'recovered',
        trigger: { type: 'all', triggers: [
          { type: 'instrument', instrument: 'sg_level', direction: 'above', value: 20.0 },
          { type: 'delay', value: 40.0 },
        ] },
        commentary: {
          learning: 'Real time. Level at the AFW hold, safeties quiet, decay heat going where it belongs. You could not beat the level trip — nobody could; the shrink saw to that — but reopening was still the right call: a shutdown plant resting on its condenser instead of on its last-resort valves.',
          industry: 'Time 1×. Terminal state: AFW hold (~24 %), SG safeties reseated, decay heat via steam dump to the condenser. The reopen did not prevent the trip (shrink-driven, unavoidable) — it determined the post-trip heat path.',
        },
        speed: 1,
        level_complete: {
          title: 'Bottle the Boiler — Dump Path Restored',
          outcome_learning: 'The trip got there first — it always does — but you gave the decay heat a path to the condenser and took the boiler off its code safeties.',
          outcome_industry: 'MSIV reopened before the trip: shrink-accelerated low-level scram, then steam dump carried decay heat and the safeties reseated. Correct recovery despite the unavoidable trip.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },

      // ---- bottled branch (automatic trip or manual scram) -------------------
      { id: 'rode_down',
        trigger: { type: 'delay', value: 0.5 },
        commentary: {
          learning: 'The trip ended it — rods in, power gone, boiler still sealed. Now look at the steam pressure: decay heat has nowhere to go but the code safeties, popping at 9.31 and reseating at 9.0, over and over. They will do that all night if you let them. Fast clock while AFW refills the hold.',
          industry: 'Reactor trip with the MSIV shut: decay heat relieved only by the SG code safeties (9.31 / 9.0 cycling — indefinitely, probed). AFW recovering level to its hold. Time 10× through the refill.',
        },
        speed: 10,
        advance: 'wait_for_trigger' },

      { id: 'bottled',
        trigger: { type: 'all', triggers: [
          { type: 'instrument', instrument: 'sg_level', direction: 'above', value: 20.0 },
          { type: 'delay', value: 40.0 },
        ] },
        commentary: {
          learning: 'Real time. Level is back at the AFW hold — safe, stable... and listen: the safeties are still cycling, because the boiler is still a bottle. Nothing broke. But an operating crew would never park here: code safeties are the LAST line, not a service valve. The reopen is still waiting to be done — that is the lesson to carry out of this one.',
          industry: 'Time 1×. Terminal state: AFW hold with the MSIV shut — SG code safeties cycling 9.31 / 9.0 on decay heat as the only heat path. Stable but non-conforming lineup; restoring the dump path (open_msiv) remains the required recovery action.',
        },
        speed: 1,
        level_complete: {
          title: 'Bottle the Boiler — Riding the Safeties',
          outcome_learning: 'The level trip shut it down with the bottle still corked — safe, but the plant is living on its last-resort valves until someone reopens the MSIV.',
          outcome_industry: 'Trip with main steam isolated: decay heat on cycling SG code safeties. Endpoint teaches the cost of the unopened dump path; reopening remained the correct follow-up.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },

      // ---- cold-feet catch ---------------------------------------------------
      { id: 'cold_feet',
        trigger: { type: 'delay', value: 1.0 },
        commentary: {
          learning: 'You tripped the reactor before the experiment began — cautious, but the lesson went home unlearned: the MSIV never moved, so you never saw the bottle, the safeties, or the race with the level trip. Retry and close the valve this time — the plant survives it, I promise.',
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
