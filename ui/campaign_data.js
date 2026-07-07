/*
 * campaign_data.js — training campaign definitions (Blueprint/pwr_training_campaign.md).
 *
 * A campaign is a progression wrapper over the existing content artifacts:
 * missions reference scenarios (RD.SCENARIOS) or walkthrough procedures
 * (RD.MANUAL_PROCEDURES) by id — titles and descriptions live on those
 * artifacts (single source of truth); `teaches` is the one-line curriculum
 * hook shown in the campaign syllabus. Missions unlock sequentially; bonus
 * missions unlock with the final act. Completion state derives from the
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
      ] },
      { id: 'act3', title: 'Act III — The Craft', missions: [
        { kind: 'procedure', id: 'pwr_raise_power', teaches: 'Coordinated power escalation.' },
        { kind: 'procedure', id: 'pwr_pressure_control', teaches: 'Heaters and spray: pressure is the subcooling guarantee.' },
        { kind: 'procedure', id: 'pwr_sg_level', teaches: 'Feeding the boilers; shrink and swell.' },
        { kind: 'scenario', id: 'pwr_load_follow', teaches: 'Follow the grid with the load-mode controls.' },
        { kind: 'procedure', id: 'pwr_lower_power', teaches: 'Coming down under control.' },
        { kind: 'procedure', id: 'pwr_shutdown', teaches: 'To Hot Standby — decay heat never sleeps.' },
      ] },
      { id: 'act4', title: 'Act IV — When Things Go Wrong', missions: [
        { kind: 'scenario', id: 'pwr_protection', teaches: 'The reactor protection system, and how to read an alarm flood.' },
        { kind: 'procedure', id: 'pwr_loss_of_feedwater', teaches: 'Losing the heat sink — AFW to the rescue.' },
        { kind: 'procedure', id: 'pwr_rcp_trip', teaches: 'Losing forced flow — natural circulation.' },
        { kind: 'procedure', id: 'pwr_stuck_porv', teaches: 'The stuck relief valve — your TMI rehearsal.' },
      ] },
      { id: 'act5', title: 'Act V — The Reckoning', missions: [
        { kind: 'scenario', id: 'pwr_tmi', teaches: 'Three Mile Island. Believe the physics, not one light.' },
        { kind: 'scenario', id: 'pwr_qualify', teaches: 'Station blackout, no hints. Qualify.' },
      ] },
    ],
    bonus: [
      { kind: 'scenario', id: 'pwr_sg_flood', teaches: 'A flooding steam generator — what control did you forget?' },
    ],
  };

})(globalThis.RD || (globalThis.RD = {}));
