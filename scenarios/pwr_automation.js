/*
 * pwr_automation.js — Hands Off (PWR campaign, Act III closer).
 *
 * Plant automation, taught the way the user meets it: every plant control on
 * automatic EXCEPT grid demand (the auto_channels preset below), and the
 * player becomes the grid dispatcher — swing demand down and up and watch the
 * rod, feedwater, pressurizer, and dump channels fly the plant. The closing
 * card is honest about the division of labor: the plant's own feedbacks do
 * the heavy lifting; the channels trim.
 *
 * Deliberately UNGATED: the engaged automation issues its commands down this
 * same path — a gate that admits the player would have to admit the machine.
 */
;(function (RD) {
  'use strict';

  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.pwr_automation = {
    id: 'pwr_automation',
    title: 'Hands Off',
    plant_id: 'pwr',
    initial_state: 'hot_full_power',
    mode: 'guided',
    description: 'Put the whole plant on automatic except one slider — grid demand — and be the dispatcher. Watch the machine answer you.',
    // Everything on auto EXCEPT the grid: the player owns steam demand.
    auto_channels: ['rods_tavg', 'boron_trim', 'pzr_pressure', 'cvcs_makeup', 'feed_sg', 'steam_dump'],
    beats: [

      { id: 'intro',
        trigger: { type: 'time', value: 2.0 },
        commentary: {
          learning: 'Read the AUTO lights across the board: rods holding Tavg (ROD AUTO), boron trimming behind them (BORON), pressurizer pressure, inventory make-up (CHARGING), feedwater (STEAM GEN FEED), steam dump — every controller engaged. Every channel except one: the grid. Today you are not the operator; you are the DISPATCHER. Your only control is how much electricity the city asks for — and the plant\'s job is to answer without you touching anything else.',
          industry: 'Automation lineup: rod control (Tavg program), boron trim, PZR pressure, CVCS make-up, SG level (three-element), steam dump — all engaged. Load demand in MANUAL: dispatcher exercise. All other controls remain available but should be unnecessary.',
        },
        highlight: { control_label: 'Turbine Load', instrument_id: null },
        advance: 'wait_for_trigger' },

      { id: 'drop_load',
        trigger: { type: 'delay', value: 14.0 },
        commentary: {
          learning: 'The evening peak just ended: put the turbine in MANUAL and take the LOAD down to 70 MW — the move you learned in the load-follow shift. Then fold your arms and watch the cascade — steam draw falls, the primary warms, the rod channel feels Tavg rise and trickles the bank in, feedwater follows the shrinking steam flow, the pressurizer channel swallows the pressure swell. Four systems answering one slider.',
          industry: 'Select MANUAL load mode and reduce demand to 70 MWe. Observe the automatic response chain: governor/steam draw ↓ → Tavg ↑ → auto rod insertion → power coast-down; feedwater tracks steam flow; PZR spray absorbs the insurge. No other manual action expected.',
        },
        highlight: { control_label: 'Turbine Load', instrument_id: null },
        branches: [
          { trigger: { type: 'scram' }, goto: 'tripped' },
          { trigger: { type: 'all', triggers: [
              { type: 'any', triggers: [
                { type: 'operator_action', command: 'set_load_target' },
                { type: 'operator_action', command: 'set_steam_demand' },
              ] },
              { type: 'true_state', field: 'power_pct', direction: 'below', value: 85.0 },
            ] }, goto: 'watch_settle' },
        ] },

      { id: 'watch_settle',
        trigger: { type: 'delay', value: 30.0 },
        commentary: {
          learning: 'Look at the rod card now: ROD AUTO still lit, Tavg pinned back on its setpoint — the plant found its new level without a single command from you. One honest note: most of what you just watched was the PHYSICS — Doppler and the moderator coefficient pulled power toward the new demand on their own, like they always do. The channels did the trimming: the last degree of Tavg, the last percent of level. Automation on this machine is a fine-tip pen over self-stabilizing physics. Now the morning ramp: take the load back up to 100 MW.',
          industry: 'Settled at reduced load: Tavg restored to program, SG level on setpoint, channels quiescent ("holding"). Attribution note: inherent feedback (Doppler/MTC) provides the coarse load-follow; automation supplies fine trim. Restore demand to 100 MWe.',
        },
        highlight: { control_label: 'Turbine Load', instrument_id: null },
        branches: [
          { trigger: { type: 'scram' }, goto: 'tripped' },
          { trigger: { type: 'all', triggers: [
              { type: 'any', triggers: [
                { type: 'operator_action', command: 'set_load_target' },
                { type: 'operator_action', command: 'set_steam_demand' },
              ] },
              { type: 'true_state', field: 'power_pct', direction: 'above', value: 92.0 },
            ] }, goto: 'complete' },
        ] },

      { id: 'complete',
        trigger: { type: 'delay', value: 10.0 },
        commentary: {
          learning: 'Back at full power, and your hands never left the one slider. Two things to keep. First: this is how the real plant runs on a normal day — operators supervise automation, and the skill is knowing WHEN to take a channel to MAN and fly it yourself, which is exactly what every mission before this one taught you. Second: automation reads the same instruments you do. A lying gauge lies to the machine too — put a channel on AUTO against a stuck sensor and it will walk the plant into trouble with perfect confidence. The Failures tab is waiting when you want to see that with your own eyes.',
          industry: 'Dispatcher exercise complete: bidirectional load swing on demand alone. Supervisory-control doctrine: automation handles steady-state trim; the operator owns mode selection and off-normal response. Caveat: channels are instrument-driven (HR1) — sensor failures propagate into automatic action; instrument-failure drills recommended.',
        },
        level_complete: {
          title: 'Hands Off — Dispatched',
          outcome_learning: 'You swung a gigawatt plant with one finger. The machine — and the physics under it — did the rest.',
          outcome_industry: 'Full-plant automation exercise complete: load swing 100→70→100 MWe under automatic regulation.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },

      { id: 'tripped',
        trigger: { type: 'delay', value: 1.5 },
        speed: 1,
        commentary: {
          learning: 'The plant tripped — with everything on automatic, that takes either a very hard demand swing or a helping hand on the manual controls. The channels can trim; they cannot catch a cliff. Retry, and move the demand like a dispatcher, not like a breaker fault.',
          industry: 'Protective trip during the automation exercise — demand transient exceeded the trim authority of the engaged channels (or manual interference). Re-run with bounded demand steps.',
        },
        level_complete: {
          title: 'Hands Off — Tripped',
          outcome_learning: 'Automation trims; it does not perform miracles. Gentler with the grid this time.',
          outcome_industry: 'Trip during the dispatcher exercise. Repeat with moderated demand steps.',
          actions: ['continue', 'retry', 'rewind'],
        },
        advance: 'end' },
    ],
  };

})(globalThis.RD || (globalThis.RD = {}));
