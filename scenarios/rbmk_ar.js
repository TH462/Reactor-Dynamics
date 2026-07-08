/*
 * rbmk_ar.js — The Steady Hand (RBMK campaign, Act II mission 1).
 *
 * The Automatic Regulator, met by hand: the AR has been holding power all
 * along (the auto_channels preset engages it); the player takes MANUAL control
 * of it (driving the AR flips its channel to MAN), feels power sag with nobody
 * catching it, restores it, and hands it back to the machine. The closing card
 * points straight at Act III: manual AR control at low power is the seat the
 * Chernobyl operators were sitting in.
 *
 * Deliberately UNGATED: the AR automation itself issues rod commands down this
 * same path — a gate that admits the player would have to admit the machine,
 * so gates would only add noise here.
 */
;(function (RD) {
  'use strict';

  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.rbmk_ar = {
    id: 'rbmk_ar',
    title: 'The Steady Hand',
    plant_id: 'rbmk',
    design_version: 'pre_chernobyl',
    initial_state: '50_percent',
    mode: 'guided',
    description: 'Meet the Automatic Regulator — the rods that hold power for you. Then take them by hand, and learn what "manual control" cost in 1986.',
    // Engaged by the UI on start (stand-down first, then this preset): the AR
    // holds 50% from the first second, and the re-center channel backs it.
    auto_channels: ['rods_power', 'ar_recenter'],
    beats: [

      { id: 'intro',
        trigger: { type: 'time', value: 2.0 },
        commentary: {
          learning: 'Look at the rod controls: there are THREE groups on this machine. The manual bank you know. The shutdown bank you hope never to need. And between them — the AR, the Automatic Regulator: a small group of fine rods, about a fiftieth of a manual step\'s worth each, that has been quietly holding your power at 50% since you sat down. Watch its card: AUTO is lit. Every little twitch of the reactor — a bubble here, xenon creeping there — the AR answers before you would even notice. That is the machine\'s steady hand.',
          industry: 'Rod complement: manual bank (coarse, ~35 pcm/step), Automatic Regulator (~2 pcm/step, closed-loop on power — currently AUTO at 50% setpoint), AZ shutdown group. AR compensates minor reactivity perturbations (void/xenon drift) continuously.',
        },
        highlight: { control_label: 'AR Rods (Auto Regulator)', instrument_id: null },
        advance: 'wait_for_trigger' },

      { id: 'take_manual',
        trigger: { type: 'delay', value: 14.0 },
        commentary: {
          learning: 'Now take it from the machine. HOLD the AR\'s Insert button and drive it in — a second or two. The moment you touch the drive, its card flips to MAN: the steady hand lets go, and the reactor is yours alone. Watch POWER as you do it.',
          industry: 'Take manual control of the AR (drive Insert; the AUTO channel disengages on manual rod motion). Insert a small amount and observe the uncorrected power response.',
        },
        highlight: { control_label: 'AR Rods (Auto Regulator)', instrument_id: null },
        branches: [
          { trigger: { type: 'scram' }, goto: 'tripped' },
          { trigger: { type: 'all', triggers: [
              { type: 'any', triggers: [
                { type: 'operator_action', command: 'rod_start', params: { group_id: 'auto_rods' } },
                { type: 'operator_action', command: 'rod_nudge', params: { group_id: 'auto_rods' } },
              ] },
              { type: 'instrument', instrument: 'power_range', direction: 'below', value: 48.0 },
            ] }, goto: 'sag_observed' },
        ] },

      { id: 'sag_observed',
        trigger: { type: 'delay', value: 2.0 },
        commentary: {
          learning: 'Power sagged — and STAYED sagged. Nobody is catching it now; that dip is yours until you fix it. This is what "the AR is in manual" means: a human doing, by eye and by hand, what the machine did every second without being thanked. Now bring it back — withdraw the AR gently until power reads 50% again. Feel how fine these steps are: this is a scalpel, not the manual bank\'s crowbar.',
          industry: 'Uncorrected sag persists under manual AR control. Restore: withdraw the AR to recover ~50% indicated power. Note the fine step worth relative to the manual bank.',
        },
        highlight: { control_label: 'AR Rods (Auto Regulator)', instrument_id: null },
        branches: [
          { trigger: { type: 'scram' }, goto: 'tripped' },
          { trigger: { type: 'all', triggers: [
              { type: 'any', triggers: [
                { type: 'operator_action', command: 'rod_start', params: { group_id: 'auto_rods' } },
                { type: 'operator_action', command: 'rod_nudge', params: { group_id: 'auto_rods' } },
              ] },
              { type: 'instrument', instrument: 'power_range', direction: 'above', value: 49.3 },
            ] }, goto: 'hand_back' },
        ] },

      { id: 'hand_back',
        trigger: { type: 'delay', value: 2.0 },
        commentary: {
          learning: 'Good. Now give it back: press AUTO on the AR card (or in the Automate tab). It will capture the power you are holding right now and keep it — the setpoint is always "where you left it", never a number someone typed last week. When AUTO is lit again, press Next ▶.',
          industry: 'Return the AR to AUTO (card or Automate tab; the channel captures current indicated power as its setpoint). Acknowledge with Next when re-engaged.',
        },
        highlight: { control_label: 'AR Rods (Auto Regulator)', instrument_id: null },
        // Branches are a beat's ONLY exits (house semantics): the Continue
        // press is a `manual` branch, alongside the scram catch.
        branches: [
          { trigger: { type: 'scram' }, goto: 'tripped' },
          { trigger: { type: 'manual' }, goto: 'complete' },
        ] },

      { id: 'complete',
        trigger: { type: 'delay', value: 1.0 },
        commentary: {
          learning: 'The steady hand is back on the wheel. Remember tonight\'s lesson in your hands: with the AR in AUTO the reactor tends itself; in MAN, every drift waits for a human to notice. In April 1986 the regulators had been driven to the stops fighting the xenon pit — the crew was flying Unit 4 BY HAND, at seven percent power, on the twitchiest machine ever built. You have now sat in that seat for three minutes at a calm fifty percent. Hold onto how much attention it took.',
          industry: 'AR re-engaged (capture-current setpoint). Operational takeaway: manual AR regulation transfers the full fine-control burden to the operator — the 1986 crew configuration (ARs saturated/withdrawn, manual regulation at ~200 MWt in the xenon pit). Act III examines that configuration.',
        },
        level_complete: {
          title: 'The Steady Hand — Met',
          outcome_learning: 'You took the regulator from the machine, held the reactor by hand, and gave it back. The 1986 crew never got to give it back.',
          outcome_industry: 'AR manual-control exercise complete: take-over, uncorrected response, restoration, AUTO re-engagement.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },

      { id: 'tripped',
        trigger: { type: 'delay', value: 1.5 },
        speed: 1,
        commentary: {
          learning: 'The reactor tripped — a heavy hand on a fine instrument. The AR is a scalpel; driven too far too fast, the power swing outran you. No harm done. Retry, and this time a touch: a second of Insert, watch, breathe, correct.',
          industry: 'Protective trip during the manual-AR exercise (excessive insertion/withdrawal rate for the regime). Re-run with a bounded manual adjustment.',
        },
        level_complete: {
          title: 'The Steady Hand — Fumbled',
          outcome_learning: 'Manual control punishes impatience. Gentler this time.',
          outcome_industry: 'Trip during manual AR regulation. Repeat with smaller increments.',
          actions: ['continue', 'retry', 'rewind'],
        },
        advance: 'end' },
    ],
  };

})(globalThis.RD || (globalThis.RD = {}));
