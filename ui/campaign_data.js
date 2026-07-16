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
        { kind: 'scenario', id: 'pwr_hook', teaches: 'The scram button — and that failure here is safe.' },
        { kind: 'scenario', id: 'pwr_tour', teaches: 'The energy journey: fission → steam → grid, and why the primary must never boil.' },
        { kind: 'scenario', id: 'pwr_chain_reaction', teaches: 'Criticality, the neutron source, startup rate and period.' },
      ] },
      { id: 'act2', title: 'Act II — The Physics', missions: [
        { kind: 'procedure', id: 'pwr_startup', teaches: 'Take the reactor critical yourself — the real procedure.' },
        { kind: 'scenario', id: 'pwr_feedback', teaches: 'Doppler and moderator feedback: the reactor pushes back.' },
        { kind: 'scenario', id: 'pwr_xenon', teaches: 'Xenon-135: the poison that rises after shutdown — and the dead time it enforces.' },
        { kind: 'scenario', id: 'pwr_boron', teaches: 'Boron vs rods — chemistry for the long game.' },
        { kind: 'scenario', id: 'pwr_startup_challenge', teaches: 'CHECKPOINT — criticality, solo: no script, just you and the neutrons.' },
      ] },
      { id: 'act3', title: 'Act III — The Controls', missions: [
        { kind: 'procedure', id: 'pwr_pressure_control', teaches: 'Heaters and spray: pressure is the subcooling guarantee.' },
        { kind: 'procedure', id: 'pwr_sg_level', teaches: 'Feeding the boilers by hand; shrink and swell.' },
        { kind: 'scenario', id: 'pwr_feed_pump', teaches: 'The feed pump and its three-element controller — who is minding the level?' },
        { kind: 'scenario', id: 'pwr_rod_auto', teaches: 'Rod control in AUTO: T-avg hold, the T-ref capture trap, and manual override.' },
        { kind: 'procedure', id: 'pwr_raise_power', teaches: 'Coordinated power escalation.' },
        { kind: 'scenario', id: 'pwr_load_follow', teaches: 'Follow the grid with the load-mode controls — three-element feed minding the boilers.' },
        { kind: 'scenario', id: 'pwr_automation', teaches: 'The Automate tab: put the plant on automatic and be the dispatcher.' },
        { kind: 'scenario', id: 'pwr_shift_exam', teaches: 'CHECKPOINT — the evening shift, your tools, your call. Graded.' },
        { kind: 'procedure', id: 'pwr_lower_power', teaches: 'Coming down under control.' },
        { kind: 'procedure', id: 'pwr_shutdown', teaches: 'To Hot Standby — decay heat never sleeps.' },
      ] },
      { id: 'act4', title: 'Act IV — When Things Go Wrong', missions: [
        { kind: 'scenario', id: 'pwr_protection', teaches: 'The reactor protection system, and how to read an alarm flood.' },
        { kind: 'scenario', id: 'pwr_esf', teaches: 'The AUTO/MAN arms: safety systems that fire themselves — until you touch them.' },
        { kind: 'procedure', id: 'pwr_loss_of_feedwater', teaches: 'Losing the heat sink — AFW to the rescue.' },
        { kind: 'procedure', id: 'pwr_rcp_trip', teaches: 'Losing forced flow — natural circulation.' },
        { kind: 'scenario', id: 'pwr_lof', teaches: 'Loss of flow: the hot channel boils, and the trip that has to be fast.' },
        { kind: 'scenario', id: 'pwr_slb', teaches: 'A steam line break — why cooling the plant can raise its power.' },
        { kind: 'scenario', id: 'pwr_msiv', teaches: 'Bottle the boiler: the MSIV, the code safeties, and a two-minute clock.' },
        { kind: 'procedure', id: 'pwr_stuck_porv', teaches: 'The stuck relief valve — your TMI rehearsal.' },
      ] },
      { id: 'act5_tmi2', title: 'Act V — Three Mile Island', missions: [
        { kind: 'scenario', id: 'pwr_tmi2_p1', teaches: 'Live the 1979 night shift exactly as the crew did — no hindsight, no mercy.' },
        { kind: 'scenario', id: 'pwr_tmi2_p2', teaches: 'The replay: what the board said, what the plant did, and why they differed.' },
        { kind: 'scenario', id: 'pwr_tmi2_p3', teaches: 'Same shift, same board — but this time you know. Change history.' },
      ] },
      // id stays 'act5' although the TMI-2 act displaced it to Act VI: act ids
      // key saved campaign progress (rd_progress) — renaming would orphan it.
      { id: 'act5', title: 'Act VI — The Reckoning', missions: [
        { kind: 'scenario', id: 'pwr_tmi', teaches: 'Three Mile Island, compressed: believe the physics, not one light.' },
        { kind: 'scenario', id: 'pwr_qualify', teaches: 'A leaking plant, a lying light, no hints. Qualify.' },
      ] },
    ],
    bonus: [
      { kind: 'scenario', id: 'pwr_sg_flood', teaches: 'A flooding steam generator — what control did you forget?' },
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
