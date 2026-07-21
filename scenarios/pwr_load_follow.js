/*
 * pwr_load_follow.js — Follow the Grid (campaign Act III, mission 11).
 *
 * The evening-ramp story, played on the Turbine-Generator card: Manual mode
 * down to 80 MWe for the night lull, hold while the THREE-ELEMENT feed
 * channel (auto_channels: feed_sg — the plant's normal free-play lineup)
 * holds SG level through the whole shift, morning pickup back to rated, then
 * hand the plant back to Follow. Teaches the load-mode controls end to end
 * and cements the Act II lesson: demand leads, the reactor follows.
 *
 * Probed on this lineup (2026-07): the 80 ask is DELIVERED (~80 ±4 MWe
 * wander, no restoring force in Manual); Tavg parks ~322 °C (+18) with HI
 * TAVG in at 312 °C; the steam dump never lifts (the feed channel keeps the
 * secondary in balance — the old coupled-feed lineup parked at ~840 on the
 * dump ceiling instead); SG level pinned ~65 % while the pump walks 100→~80 %.
 * And NO load step trips the unit any more — even 1000→0 rides — so the
 * grid_lost branch is the scram catch (manual scram / off-script hands), not
 * a load-rejection story.
 */
;(function (RD) {
  'use strict';

  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.pwr_load_follow = {
    id: 'pwr_load_follow',
    title: 'Follow the Grid',
    plant_id: 'pwr',
    design_version: null,
    initial_state: 'hot_full_power',
    mode: 'guided',
    description: 'Run the evening shift: ramp down for the night, hold steady, and pick the grid back up at dawn.',
    // The plant's normal lineup: the three-element feed channel minds SG level.
    auto_channels: ['feed_sg'],
    beats: [

      { id: 'intro',
        trigger: { type: 'time', value: 2.0 },
        commentary: {
          learning: 'Evening shift. The city is going to bed and the grid needs less power — and it is YOUR job to give it less without upsetting anything. Find the Turbine-Generator card: Load mode is in FOLLOW, meaning the turbine simply takes what the reactor makes. And check the Steam & Flow card: the Feed control readout says "AUTO — three-element" — the feed controller is minding steam-generator level for you, tonight and every night. (With no channel engaged it would fall back to the old load coupling — "coupled (tracks load)".) Tonight you drive by hand.',
          industry: 'Load-follow evolution. Turbine-Generator card: mode FOLLOW (turbine slaved to reactor thermal output). Feedwater: three-element channel in service (Feed control readout AUTO — three-element; legacy load coupling is the fallback only when no channel is engaged). Task: manual dispatch per the evening curve.',
        },
        highlight: { control_label: 'Mode', instrument_id: null },
        advance: 'wait_for_trigger' },

      // Prompt + branch watch: the 80 MW step leads on; the scram branch is
      // the softlock-proof catch. Probed: with the three-element feed engaged
      // the unit RIDES even a deep dispatch step (1000→0 tested) — a trip
      // here means a manual scram or hands on something off-script.
      { id: 'ramp_down',
        trigger: { type: 'delay', value: 26.0 },
        commentary: {
          learning: 'Switch Load to MANUAL and bring the slider down to 80 MW — one step, not a plunge; the grid dims gently and so should you. (If you forget the mode switch, the slider engages Manual by itself.) Then look at the Steam & Flow card while the governor throttles steam: the feed CONTROLLER sees the draw change and walks the pump down to match — element one is SG level, elements two and three are the steam-versus-feed mismatch, anticipating the move before level ever drifts. The Feed control readout says "AUTO — three-element", and level barely moves. The reactor, meanwhile, eases off on feedback alone — no rods.',
          industry: 'Manual mode, target 80 MWe (bounded step). Coupled response: governor → steam flow → reactor power via MTC. Three-element feedwater (level + steam/feed mismatch) drives pump speed to the new draw; SG level constant at setpoint. Single-input dispatch.',
        },
        branches: [
          { trigger: { type: 'scram' }, goto: 'grid_lost' },
          { trigger: { type: 'all', triggers: [
              { type: 'operator_action', command: 'set_load_target' },
              { type: 'instrument', instrument: 'mwe_output', direction: 'below', value: 95.5 },
            ] }, goto: 'hold' },
        ] },

      { id: 'hold',
        trigger: { type: 'delay', value: 2.0 },
        commentary: {
          learning: 'Settling out — read your board carefully, because the plant is talking. The governor DELIVERED your cut: output settles around 800 and breathes a few tens of megawatts either side — Manual mode has no restoring force, so it wanders. But look at T-avg: it climbed almost twenty degrees to carry the mismatch, because without rods the core can only meet a smaller steam draw by running hotter. At the top of that climb the HI TAVG annunciator came in, amber. Acknowledge it, and understand it: nothing is broken. The plant is telling you, in lights, that a cut this deep wants RODS or BORON alongside the slider — and tonight, deliberately, we gave it neither. And the steam generators? The three-element controller walked the pump from 100% down to about 80 and pinned level on its setpoint — the flood and the boil-dry of the old coupled-feed boards simply never happen, and the steam dump never had to lift. Night watch now: do NOTHING more, but stay awake to T-avg and to the Pump speed and Feed control readouts on the Steam card. I will run the night at 10× — watch your board.',
          industry: 'Delivered ~80 MWe (±4 MWe wander — manual dispatch has no restoring force). Tavg up ~+18 °C absorbing the mismatch; HI TAVG annunciates at 312 °C — acknowledge. Three-element feedwater: pump speed ~80 %, SG level held at setpoint; steam dump remained closed. Full reduction requires coordinated reactivity control, deliberately withheld tonight. Monitoring: Tavg, pump speed, Feed control readout. Night compressed 10×.',
        },
        speed: 10,
        advance: 'wait_for_trigger' },

      { id: 'ramp_up',
        trigger: { type: 'delay', value: 300.0 },
        commentary: {
          learning: 'Dawn. Alarm clocks, toasters, trains — the grid is waking up hungry. Take the slider back up to 1000 MW. Watch the same chain run in reverse: more steam drawn, cold-leg cools a touch, the core wakes up to meet it — and on the Steam & Flow card the feed controller walks the pump back up as the steam draw grows. Smooth hands — the plant likes gradual asks, and the last hundred megawatts take the longest.',
          industry: 'Morning pickup: target 100 MWe. Reverse coupling: increased steam draw → cooler return → +ρ via MTC → power ascension to rated (expect several minutes on the final approach). Feedwater tracks via the three-element channel.',
        },
        speed: 1,
        branches: [
          { trigger: { type: 'scram' }, goto: 'grid_lost' },
          { trigger: { type: 'all', triggers: [
              { type: 'operator_action', command: 'set_load_target' },
              { type: 'instrument', instrument: 'mwe_output', direction: 'above', value: 99 },
            ] }, goto: 'restore_follow' },
        ] },

      { id: 'restore_follow',
        trigger: { type: 'delay', value: 2.0 },
        commentary: {
          learning: 'Full output. Last move of the shift: put Load mode back to FOLLOW — hand the wheel back to the plant. A day of dispatching, and you never touched a control rod.',
          industry: 'Rated output restored. Return load mode to FOLLOW to close out the manual dispatch window.',
        },
        speed: 1,
        advance: 'wait_for_trigger' },

      { id: 'complete',
        trigger: { type: 'operator_action', command: 'set_load_mode', params: { mode: 'follow' } },
        commentary: {
          learning: 'Shift complete. You just did what real PWR crews do through every summer evening: followed the grid down, held the night, and brought the morning back — with feedback doing the heavy lifting and the three-element feed controller minding the steam generators behind you. The reactor follows steam demand. Now it follows YOU.',
          industry: 'Load-follow evolution complete: down-ramp, hold, up-ramp, mode restoration. SG level held on setpoint by the three-element feedwater channel throughout.',
        },
        level_complete: {
          title: 'Follow the Grid — Shift Complete',
          outcome_learning: 'Down for the night, up for the dawn — one slider, zero rod motion, a city kept lit.',
          outcome_industry: 'Manual dispatch cycle 100→80→100 MWe under three-element feedwater control; SG level stable throughout.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },

      { id: 'grid_lost',
        trigger: { type: 'delay', value: 1.5 },
        speed: 1,
        commentary: {
          learning: 'The plant tripped — and on this lineup that takes some doing: with the three-element feed minding the steam generators, the machine rides even a deep dispatch step. A trip mid-shift means a hand on something it should not have been on — rods, the feed pump, the scram button itself. The city is fine; the grid has other plants. Rewind (or Retry) and run the shift with the load slider alone.',
          industry: 'Reactor trip during manual dispatch. With three-element feedwater in service the unit tolerates large load steps; trip attribution: manual scram or off-dispatch manipulation. Protection response nominal. Rewind/Retry with the dispatch slider only.',
        },
        level_complete: {
          title: 'Follow the Grid — Tripped on Shift',
          outcome_learning: 'The shift asked for one slider. The trip came from somewhere else — run it clean.',
          outcome_industry: 'Unit tripped during the dispatch window. Re-run using load-mode/target commands only.',
          actions: ['continue', 'retry', 'rewind'],
        },
        advance: 'end' },
    ],
  };

})(globalThis.RD || (globalThis.RD = {}));
