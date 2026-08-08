/*
 * pwr_sg_flood.js — bonus micro-scenario: SG floods because the feed pump was
 * left in MANUAL while power came down (nobody minding level).
 *
 * Re-premised for the modern plant (2026-07): normal level control is the
 * THREE-ELEMENT feed channel (feed_sg). Here the pump sits in MANUAL at 100 %
 * speed (setup_commands — the readout shows MANUAL) while a rod trim eases
 * power to ~93 %; steam draw shrinks, feed stays pinned, and the drum fills.
 * The fix is EITHER re-engaging the feed channel OR cutting the pump speed —
 * both accepted. Probed fill (rod_nudge −10, pump 100 %): level 75 % at
 * ~63 s, 85 % at ~96 s, 96 % at ~132 s; no automatic trip ever comes (level
 * just parks at 100 %), so the failure endpoint is the 96 % threshold.
 * Channel re-engage at high level starts from the 80 % setpoint clip and the
 * #355 program then walks it back toward 65 %; crests ~+9 % on pump inertia,
 * then recovers; a pump cut turns level immediately (a runaway fall ends at
 * the 17 % low-low — AFW start and reactor trip on the same signal, #380).
 */
;(function (RD) {
  'use strict';

  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.pwr_sg_flood = {
    id: 'pwr_sg_flood',
    title: 'SG Flooded — What Control Did You Forget?',
    plant_id: 'pwr',
    design_version: null,
    initial_state: 'hot_full_power',
    mode: 'guided',
    description: 'The feed pump was left in MANUAL at full speed while power comes down — nobody is minding SG level.',
    setup_commands: [
      { action: 'set_feed_pump_speed', pct: 100 },                         // pump to MANUAL, pinned high
      { action: 'rod_nudge', group_id: 'control_rods', steps: -40 },       // the dispatch trim already underway
    ],
    beats: [

      // Prompt-with-branches: the level watch is this beat's only exit (plus
      // the scram catch), so a trip can never strand the mission.
      { id: 'brief',
        trigger: { type: 'time', value: 2.0 },
        commentary: {
          learning: 'A handover gift. The last shift trimmed the control bank for a dispatch reduction — power is easing into the low nineties — and somewhere in the changeover the feed pump was left in MANUAL at full speed. Look at the Steam & Flow card: the Feed control readout says MANUAL, and the pump is pushing 100% while the steam draw shrinks. Now watch the SG level gauge and think about who, exactly, is minding it. (Answer: nobody.)',
          industry: 'Turnover condition: control bank inserted for a load reduction (~93 % power), feed pump in MANUAL at 100 % speed — Feed control readout MANUAL. No level controller in service. Monitor SG level.',
        },
        highlight: { view: null, control_label: 'Feed Pump', instrument_id: 'sg' },
        branches: [
          { trigger: { type: 'scram' }, goto: 'flooded' },
          { trigger: { type: 'instrument', instrument: 'sg_level', direction: 'above', value: 75 }, goto: 'rising' },
        ] },

      { id: 'rising',
        trigger: { type: 'delay', value: 2.0 },
        commentary: {
          learning: 'There it is — SG level through 75% and the amber SG LVL HI annunciator is in. Steam out is falling with power; feed in is pinned at 100%; the difference is stacking up in the drum. So: what control did you forget?',
          industry: 'SG level > 75 % — SG LVL HI annunciated. Steam flow decreasing with reactor power; feed flow constant at the manual pump demand. Level unattended.',
        },
        highlight: { view: null, control_label: 'Feed Pump', instrument_id: 'sg' },
        advance: 'wait_for_trigger' },

      // The fix prompt carries the branch watch (softlock-proof idiom): either
      // accepted action leads on; the 96 % line or a trip lands on the card.
      { id: 'fix',
        trigger: { type: 'delay', value: 13.0 },
        commentary: {
          learning: 'Two good answers — pick either. One: give the pump back to the machine. Press STEAM GEN FEED → AUTO on the board; the controller reads level plus the steam−feed mismatch and will haul the pump down itself. Two: fly it by hand — cut the feed pump speed well below the steam draw and stop the fill. Choose before the drum reaches the steam nozzles.',
          industry: 'Corrective options: (1) engage the three-element feedwater channel (STEAM GEN FEED → AUTO) — controller recaptures level; (2) manual feed pump speed reduction below current steam flow. Act before gross level excursion (≥ 96 %).',
        },
        highlight: { view: null, control_label: 'Feed Pump', instrument_id: 'sg' },
        branches: [
          { trigger: { type: 'any', triggers: [
              { type: 'operator_action', command: 'set_auto_channel', params: { channel_id: 'feed_sg', engaged: true } },
              { type: 'operator_action', command: 'set_feed_pump_speed' },
              { type: 'operator_action', command: 'feed_pump_nudge' },
              { type: 'operator_action', command: 'set_feedwater_flow' },
            ] }, goto: 'recovering' },
          { trigger: { type: 'scram' }, goto: 'flooded' },
          { trigger: { type: 'instrument', instrument: 'sg_level', direction: 'above', value: 96 }, goto: 'flooded' },
        ] },

      // Watch the fix bite. Probed: channel engage crests ~+9 % (pump inertia)
      // then recovers through 85 % within ~40 s; a pump cut turns level in
      // seconds. A wrong move (pump raised) parks level high — the 180 s
      // still-high check is the honest failure exit.
      { id: 'recovering',
        trigger: { type: 'delay', value: 2.0 },
        commentary: {
          learning: 'Action taken — now watch it bite. The pump has seconds of inertia, so the level crests before it turns. If you engaged the channel, it pulls level back toward its band. If you cut the pump by hand, you now OWN that level: bring feed back up to match steam once the flood is off, or you will ride it down into the 17 % low-low — which starts AFW and scrams the reactor on the same signal.',
          industry: 'Feed correction in progress (pump inertia τ≈8 s — expect crest, then turnaround). Channel fix: level returns to the setpoint band. Manual fix: re-establish steam–feed match after recovery or expect the 17 % low-low — AFW start and reactor trip together (single-signal).',
        },
        branches: [
          { trigger: { type: 'all', triggers: [
              { type: 'delay', value: 20.0 },
              { type: 'instrument', instrument: 'sg_level', direction: 'below', value: 85 },
            ] }, goto: 'fixed' },
          { trigger: { type: 'scram' }, goto: 'flooded' },
          { trigger: { type: 'all', triggers: [
              { type: 'delay', value: 180.0 },
              { type: 'instrument', instrument: 'sg_level', direction: 'above', value: 90 },
            ] }, goto: 'flooded' },
        ] },

      { id: 'fixed',
        trigger: { type: 'delay', value: 2.0 },
        commentary: {
          learning: 'Level crested and came back — the steam generator is a boiler again, not a bathtub. The lesson travels: every controller you park in MANUAL becomes YOUR job, and the plant will not remind you until an annunciator does. The lasting fix is the three-element channel — level, steam flow, feed flow: three elements, no forgetting.',
          industry: 'SG level recovered below 85 % and trending to band. Root cause: feedwater in manual, unsupervised, during a power reduction. Standing lineup: three-element feedwater channel engaged (the free-play default).',
        },
        level_complete: {
          title: 'What You Forgot — Level Control',
          outcome_learning: 'MANUAL means you. Hand the pump to the three-element channel, or mind it yourself — but somebody minds it.',
          outcome_industry: 'SG level excursion arrested (channel re-engage or manual pump reduction); level restored below 85 %.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },

      { id: 'flooded',
        trigger: { type: 'delay', value: 1.5 },
        commentary: {
          learning: 'The drum is at the steam nozzles — on a real unit the turbine would have tripped on moisture carryover long before this, water slugging toward blades spinning at 1800 rpm. (If the plant tripped under you instead: same lesson, louder bell.) The level had no keeper — the pump was in MANUAL, and MANUAL means you. Retry, and this time either hand the pump to the three-element channel or cut its speed yourself, early.',
          industry: 'SG level ≥ 96 % (or unit trip) with feedwater unattended in manual — high-level turbine-protection territory (moisture carryover). Re-run: engage the three-element channel or reduce pump speed promptly.',
        },
        level_complete: {
          title: 'SG Flooded — Nobody Was Minding Level',
          outcome_learning: 'A pump in MANUAL does exactly what you last told it — forever. Somebody has to mind the level.',
          outcome_industry: 'Secondary inventory excursion to the high-level region with feedwater in manual. Corrective: three-element channel or prompt manual reduction.',
          actions: ['continue', 'retry', 'rewind'],
        },
        advance: 'end' },
    ],
  };
})(globalThis.RD || (globalThis.RD = {}));
