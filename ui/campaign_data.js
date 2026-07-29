/*
 * campaign_data.js — training campaign definitions (Blueprint/pwr_training_campaign.md).
 *
 * A campaign is a progression wrapper over the existing content artifacts:
 * missions reference scenarios (RD.SCENARIOS) or walkthrough procedures
 * (RD.MANUAL_PROCEDURES) by id — titles and descriptions live on those
 * artifacts (single source of truth); `teaches` is the one-line curriculum
 * hook shown in the campaign syllabus. Every mission is playable from the
 * start (user direction, 2026-07-07) — the act ordering is a recommended
 * path with progress markers, not a gate. Completion state derives from the
 * rd_progress localStorage record written by recordCompletion() in app.js.
 */
;(function (RD) {
  'use strict';

  RD.CAMPAIGNS = RD.CAMPAIGNS || {};

  RD.CAMPAIGNS.pwr = {
    id: 'pwr',
    title: 'PWR — Zero to Operator',
    tagline: 'From your first scram to a senior operator qualification.',
    acts: [
      { id: 'act1', title: 'Act I — The Machine', missions: [
        { kind: 'scenario', id: 'pwr_hook', teaches: 'Mode 1, At Power — the scram button, and that failure here is safe.' },
        { kind: 'scenario', id: 'pwr_tour', teaches: 'Mode 1, At Power — the energy journey: fission → steam → grid, and why the primary must never boil.' },
        { kind: 'scenario', id: 'pwr_chain_reaction', teaches: 'Mode 3 → Mode 2 — criticality, the neutron source, startup rate and period.' },
      ] },
      { id: 'act2', title: 'Act II — The Physics', missions: [
        { kind: 'scenario', id: 'pwr_mode5_to_mode3', teaches: 'Mode 5, Cold Shutdown → Mode 3, Hot Standby — the cold heatup: pressurize, take critical, ride the temperature up.' },
        { kind: 'procedure', id: 'pwr_startup', teaches: 'Mode 3, Hot Standby → Mode 1, At Power — take the reactor critical and put the unit on line, the real procedure.' },
        { kind: 'scenario', id: 'pwr_feedback', teaches: 'Mode 1, At Power — Doppler and moderator feedback: the reactor pushes back.' },
        { kind: 'scenario', id: 'pwr_xenon', teaches: 'After a Mode 1 trip — xenon-135: the poison that rises after shutdown, and the dead time it enforces.' },
        { kind: 'scenario', id: 'pwr_boron', teaches: 'Mode 1, At Power — boron vs rods: chemistry for the long game.' },
        { kind: 'scenario', id: 'pwr_startup_challenge', teaches: 'CHECKPOINT — Mode 3 → Mode 2, solo: no script, just you and the neutrons.' },
      ] },
      { id: 'act3', title: 'Act III — The Controls', missions: [
        { kind: 'procedure', id: 'pwr_pressure_control', teaches: 'Mode 1, At Power — heaters and spray: pressure is the subcooling guarantee.' },
        { kind: 'procedure', id: 'pwr_sg_level', teaches: 'Mode 1, At Power — feeding the boilers by hand; shrink and swell.' },
        { kind: 'scenario', id: 'pwr_feed_pump', teaches: 'Mode 1 — the feed pump and its three-element controller: who is minding the level?' },
        { kind: 'scenario', id: 'pwr_rod_auto', teaches: 'Mode 1 — rod control in AUTO: Tavg hold, the T-ref capture trap, and manual override.' },
        { kind: 'procedure', id: 'pwr_raise_power', teaches: 'Mode 1, At Power — coordinated power escalation.' },
        { kind: 'scenario', id: 'pwr_load_follow', teaches: 'Mode 1 — follow the grid with the load-mode controls; three-element feed minding the boilers.' },
        { kind: 'scenario', id: 'pwr_automation', teaches: 'Mode 1 — plant automation: put the plant on automatic and be the dispatcher.' },
        { kind: 'scenario', id: 'pwr_shift_exam', teaches: 'CHECKPOINT — Mode 1 dispatch, 85↔100 MWe: your tools, your call. Graded.' },
        { kind: 'procedure', id: 'pwr_lower_power', teaches: 'Mode 1, At Power — coming down under control.' },
        { kind: 'procedure', id: 'pwr_shutdown', teaches: 'Mode 1, At Power → Mode 3, Hot Standby — decay heat never sleeps.' },
        { kind: 'scenario', id: 'pwr_mode3_to_mode5', teaches: 'Mode 3, Hot Standby → Mode 5, Cold Shutdown — the controlled cooldown: borate, cool, depressurize, place RHR.' },
        { kind: 'scenario', id: 'pwr_return_to_mode1', teaches: 'Mode 5, Cold Shutdown → Mode 1, At Power — the full startup, closing the round trip.' },
      ] },
      { id: 'act4', title: 'Act IV — When Things Go Wrong', missions: [
        { kind: 'scenario', id: 'pwr_protection', teaches: 'Mode 1 upset — the reactor protection system, and how to read an alarm flood.' },
        { kind: 'scenario', id: 'pwr_esf', teaches: 'Mode 1 — the ESF AUTO/MAN arms: safety systems that fire themselves, until you touch them.' },
        { kind: 'procedure', id: 'pwr_loss_of_feedwater', teaches: 'Mode 1 — losing the heat sink; AFW to the rescue (→ Mode 3, Hot Standby if tripped).' },
        // "and natural circulation" removed 2026-07-29: this plant sets natural_circ_flow
        // to 0.0 and does not model it, so the mission promised a mechanism the sim has
        // never had. Say what it does teach.
        { kind: 'procedure', id: 'pwr_rcp_trip', teaches: 'Mode 1 — losing forced flow: the RCP trip, the fast scram that follows, and getting to a stable hot shutdown.' },
        { kind: 'scenario', id: 'pwr_lof', teaches: 'Mode 1 — a lost pump and a flow gauge that disagrees: the low-flow trip never comes, and why one channel is not enough.' },
        { kind: 'scenario', id: 'pwr_slb', teaches: 'Mode 1 — a steam line break: why cooling the plant can raise its power.' },
        { kind: 'scenario', id: 'pwr_msiv', teaches: 'Mode 1 — bottle the boiler: the MSIV, the code safeties, and a two-minute clock.' },
        { kind: 'procedure', id: 'pwr_stuck_porv', teaches: 'Mode 1 — the stuck relief valve: your TMI rehearsal.' },
      ] },
      { id: 'act5_tmi2', title: 'Act V — Three Mile Island', missions: [
        { kind: 'scenario', id: 'pwr_tmi2_p1', teaches: 'A Mode 1 night shift gone wrong — live 1979 exactly as the crew did; no hindsight, no mercy.' },
        { kind: 'scenario', id: 'pwr_tmi2_p2', teaches: 'The replay: what the board said, what the plant did, and why they differed.' },
        { kind: 'scenario', id: 'pwr_tmi2_p3', teaches: 'Same shift, same board — but this time you know. Change history.' },
      ] },
      // Renamed act5 -> act6 on 2026-07-27b (#158). The comment here used to say the
      // id had to stay 'act5' because "act ids key saved campaign progress
      // (rd_progress) — renaming would orphan it". That was not true: rd_progress
      // only ever holds completed_scenarios, completed_procedures and hook_done
      // (app.js recordCompletion/saveProgress), all keyed by SCENARIO id. Act ids
      // are used solely to iterate and render (app.js:1322, :1358) and are never
      // persisted, so there was nothing to orphan and nothing to migrate.
      { id: 'act6', title: 'Act VI — The Reckoning', missions: [
        { kind: 'scenario', id: 'pwr_tmi', teaches: 'Mode 1 event → recover to Mode 3 — Three Mile Island, compressed: believe the physics, not one light.' },
        { kind: 'scenario', id: 'pwr_qualify', teaches: 'Mode 1 event, recover to Mode 3 — a leaking plant, a lying light, no hints. Qualify.' },
      ] },
    ],
    bonus: [
      { kind: 'scenario', id: 'pwr_sg_flood', teaches: 'Mode 1 — a flooding steam generator with the feed left MANUAL: what control did you forget?' },
    ],
  };

  RD.CAMPAIGNS.rbmk = {
    id: 'rbmk',
    title: 'RBMK — The Other Path',
    tagline: 'The reactor that answered every question differently — and the night the answers came due.',
    acts: [
      { id: 'act1', title: 'Act I — The Other Machine', missions: [
        { kind: 'scenario', id: 'rbmk_tour', teaches: 'Pressure tubes, graphite, boiling channels — and the coefficient that points the wrong way.' },
        { kind: 'procedure', id: 'rbmk_startup', teaches: 'Approach to criticality — a familiar skill on an unfamiliar machine.' },
        { kind: 'scenario', id: 'rbmk_void', teaches: 'Cut the water, watch power RISE: the positive void coefficient, felt by hand.' },
      ] },
      { id: 'act2', title: 'Act II — The Knife\'s Edge', missions: [
        { kind: 'scenario', id: 'rbmk_ar', teaches: 'The Automatic Regulator: the rods that hold power for you — and what taking manual control means.' },
        { kind: 'procedure', id: 'rbmk_raise_power', teaches: 'Raise power the RBMK way — by reducing coolant flow.' },
        { kind: 'procedure', id: 'rbmk_mcp_trip', teaches: 'Losing a main circulation pump — the wrong-way physics under stress.' },
        { kind: 'procedure', id: 'rbmk_shutdown', teaches: 'A normal AZ-5 shutdown — the button, used the way it was meant.' },
      ] },
      { id: 'act3', title: 'Act III — 1986', missions: [
        { kind: 'scenario', id: 'rbmk_chernobyl', teaches: 'April 26, 01:23:40. Thirteen seconds of physics, six hours of decisions.' },
        { kind: 'scenario', id: 'rbmk_az5_fixed', teaches: 'The rebuilt machine: same trap, same button — you have seconds to prove the fix.' },
      ] },
    ],
    bonus: [],
  };

  RD.CAMPAIGNS.bwr = {
    id: 'bwr',
    title: 'BWR — One Loop',
    tagline: 'Boil it in the core, drive it with the pumps, defend one water line — through the longest night in nuclear history.',
    acts: [
      { id: 'act1', title: 'Act I — One Loop', missions: [
        { kind: 'scenario', id: 'bwr_tour', teaches: 'The direct cycle: radioactive steam, honest bubbles, and a level gauge that rules everything.' },
        { kind: 'procedure', id: 'bwr_startup', teaches: 'Approach to criticality, BWR style.' },
        { kind: 'scenario', id: 'bwr_recirc', teaches: 'Drive a gigawatt with pump speed — the flow throttle only a BWR has.' },
      ] },
      { id: 'act2', title: 'Act II — The Craft', missions: [
        { kind: 'procedure', id: 'bwr_raise_power', teaches: 'Power ascension on recirculation flow.' },
        { kind: 'scenario', id: 'bwr_isolation', teaches: 'MSIV slam at full power — and the level gauge\'s famous lie (shrink).' },
        { kind: 'procedure', id: 'bwr_shutdown', teaches: 'Normal shutdown; decay heat and the steam-driven systems.' },
      ] },
      { id: 'act3', title: 'Act III — 2011', missions: [
        { kind: 'scenario', id: 'bwr_fukushima', teaches: 'March 11: the accident of SUPPORT. One decision — the isolation condenser — buys hours.' },
        { kind: 'scenario', id: 'bwr_qualify', teaches: 'Final exam: a precision power maneuver on the pumps. No backstop, no hints.' },
      ] },
    ],
    bonus: [],
  };

})(globalThis.RD || (globalThis.RD = {}));
