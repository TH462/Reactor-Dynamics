/*
 * pwr_feed_pump.js — Feeding the Boilers (PWR training, feedwater control).
 *
 * The one control surface the campaign never isolates: the feed pump. Starts
 * on the legacy load coupling ("coupled (tracks load)" on the Steam & Flow
 * card), takes it MANUAL, and makes the player hold SG level by hand through
 * a load reduction before handing the job to the three-element channel
 * (`feed_sg`) and watching it carry the restore.
 *
 * Probed physics (seed 42, hot_full_power): SG level nominal 65.1%; with the
 * pump held at 100% and load at 950 MWe the level climbs ~0.25%/s — crosses
 * 67% at ~17 s and the 75% HI alarm at ~52 s, so the trim window is real but
 * fair. A trim to the low 90s reverses the trend (~0.3%/s down at −6%
 * mismatch); too deep a cut dives through the band (88% took level to 42% in
 * ~70 s — the "full-time job" lesson). feed_sg captures its setpoint from the
 * CURRENT indicated level on engage and rides the 1000 MWe restore clean
 * (mwe > 985 in ~130 s, level flat, "holding").
 *
 * Softlock-proofing: both task beats are prompt-with-branches; every watch
 * carries a scram catch, and the level-high alarm lands on its own failure
 * card. The AUTO ride carries a delay-420 fallback so a sluggish restore can
 * never strand the mission.
 */
;(function (RD) {
  'use strict';

  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.pwr_feed_pump = {
    id: 'pwr_feed_pump',
    title: 'Feeding the Boilers',
    plant_id: 'pwr',
    design_version: null,
    initial_state: 'hot_full_power',
    mode: 'guided',
    description: 'Take the feed pump off its crutch and hold steam generator level by hand — then meet the three-element controller that does it for a living.',
    beats: [

      { id: 'intro',
        trigger: { type: 'time', value: 2.0 },
        commentary: {
          learning: 'Find the Steam & Flow card and read two lines: "Pump speed" — the feed pump pushing water into the steam generators — and "Feed control", which right now says "coupled (tracks load)". That coupling is a convenience, not a controller: the pump speed simply copies the turbine slider, and nobody is actually watching the LEVEL in those boilers. Level is the thing that matters — run it low and the tube bundle starts to dry out toward a trip; run it high and water climbs toward the steam lines. The SG gauge shows it near 65%. Today you take that job by hand — and then meet the machine that does it for a living.',
          industry: 'Steam & Flow card: feed-pump speed command (▼/▲ nudge, Set %) and the feed-control mode readout — currently "coupled (tracks load)", pump slaved to the load slider with no level feedback. SG level nominal 65%. Limits: SG LVL HI caution 75%, LO LO trip 12%. Exercise: manual level control through a load change, then the three-element channel.',
        },
        highlight: { control_label: 'Feed Pump', instrument_id: 'sg' },
        advance: 'wait_for_trigger' },

      // Prompt + branch watch: any manual pump command flips the readout to
      // MANUAL and leads on; a scram at any point lands on the trip card.
      { id: 'take_manual',
        trigger: { type: 'delay', value: 30.0 },
        commentary: {
          learning: 'Take the pump by hand. On the Feed pump row, press Set % with the box at 100 — or just tap the ▲ or ▼ arrow once. The instant your command lands, "Feed control" flips to MANUAL: the coupling lets go, and from that moment the pump does exactly what you say and nothing else. Which means the level is YOURS — nobody else is watching it now.',
          industry: 'Issue any manual pump command (set_feed_pump_speed / feed_pump_nudge). The load coupling drops out — feed control: MANUAL. Pump speed holds the last command; SG level regulation is now on the operator.',
        },
        highlight: { control_label: 'Feed Pump', instrument_id: null },
        branches: [
          { trigger: { type: 'scram' }, goto: 'tripped' },
          { trigger: { type: 'any', triggers: [
              { type: 'operator_action', command: 'set_feed_pump_speed' },
              { type: 'operator_action', command: 'feed_pump_nudge' },
            ] }, goto: 'load_drop' },
        ] },

      // The instructor's move: steam draw falls, the pump doesn't. Level
      // climbs ~0.25%/s (probed) — the 67% crossing opens the trim task, the
      // 75% alarm is the failure branch, ~35 s apart.
      { id: 'load_drop',
        trigger: { type: 'delay', value: 3.0 },
        commands: [{ action: 'set_load_target', mwe: 950 }],
        commentary: {
          learning: 'MANUAL — good. Now I am easing the turbine back to 950 MW. Steam draw falls... but your pump has no idea: it keeps pushing the same water in. Eyes on SG level — watch it start to climb.',
          industry: 'Load reduced to 950 MWe (instructor). Steam flow down ~5%; feed fixed at your last command — level rising ~0.25%/s. Stand by to trim.',
        },
        branches: [
          { trigger: { type: 'scram' }, goto: 'tripped' },
          { trigger: { type: 'alarm', alarm_id: 'sg_level_high' }, goto: 'overfed' },
          { trigger: { type: 'instrument', instrument: 'sg_level', direction: 'above', value: 67.0 }, goto: 'trim_now' },
        ] },

      { id: 'trim_now',
        trigger: { type: 'delay', value: 1.0 },
        commentary: {
          learning: 'There it goes — 67 and climbing, and the HI LEVEL alarm lives at 75. Pull the pump back: ▼ a few taps, or Set % into the low 90s — just UNDER the steam flow — and let the level drift back down. Park it in the mid-60s: 64 to 66 is home. And gently: cut too deep and the level will dive on you just as fast.',
          industry: 'SG level 67% and rising. Reduce pump speed below steam flow (low-90s %) to reverse the trend; recapture the 64–66% band, then match flows to hold. SG LVL HI annunciates at 75%.',
        },
        highlight: { control_label: 'Feed Pump', instrument_id: 'sg' },
        branches: [
          { trigger: { type: 'scram' }, goto: 'tripped' },
          { trigger: { type: 'alarm', alarm_id: 'sg_level_high' }, goto: 'overfed' },
          { trigger: { type: 'all', triggers: [
              { type: 'any', triggers: [
                { type: 'operator_action', command: 'set_feed_pump_speed' },
                { type: 'operator_action', command: 'feed_pump_nudge' },
              ] },
              { type: 'delay', value: 8.0 },
              { type: 'instrument', instrument: 'sg_level', direction: 'below', value: 66.5 },
              { type: 'instrument', instrument: 'sg_level', direction: 'above', value: 61.0 },
            ] }, goto: 'engage_auto' },
        ] },

      { id: 'engage_auto',
        trigger: { type: 'delay', value: 3.0 },
        commentary: {
          learning: 'Back in the band — and feel how much attention that took? A hair under to bring it down, a hair over to hold it... that is a full-time job, and real plants staff it with a controller. Open Tools → Automate, group Secondary: "Feed pump → SG level (three-element)". Engage it. Three elements: the LEVEL itself, plus steam flow out and feed flow in — so it corrects the mismatch before the level even moves. The moment it takes over, the Feed control readout shows "AUTO — three-element".',
          industry: 'Band recaptured. Engage the three-element feedwater channel (Automate → Secondary → feed_sg): element 1 SG level, elements 2/3 steam−feed mismatch anticipation driving pump speed. Setpoint captures the current indicated level on engage. Feed control readout: AUTO — three-element.',
        },
        branches: [
          { trigger: { type: 'scram' }, goto: 'tripped' },
          { trigger: { type: 'operator_action', command: 'set_auto_channel',
                       params: { channel_id: 'feed_sg', engaged: true } }, goto: 'auto_ride' },
        ] },

      // Payoff: the controller carries the restore the player just sweated
      // through by hand. Probed ~130 s to mwe > 985; the delay-420 branch is
      // the can't-strand fallback.
      { id: 'auto_ride',
        trigger: { type: 'delay', value: 3.0 },
        commands: [{ action: 'set_load_target', mwe: 1000 }],
        commentary: {
          learning: 'It has the pump — the channel reads "holding". Now watch a professional work: I am taking the turbine back to 1000 MW, the same move that just made you sweat. Steam draw rises, the channel feels the mismatch through its flow elements, and it walks the pump up almost before the level twitches. Hands off — watch the level trace stay flat while half the secondary reorganizes underneath it.',
          industry: 'Load restored to 1000 MWe under automatic feed. Expect feedforward response: pump speed tracks steam flow, level deviation minimal. Monitor the channel status and SG level through the ramp.',
        },
        branches: [
          { trigger: { type: 'scram' }, goto: 'tripped' },
          { trigger: { type: 'all', triggers: [
              { type: 'delay', value: 40.0 },
              { type: 'instrument', instrument: 'mwe_output', direction: 'above', value: 985 },
            ] }, goto: 'complete' },
          { trigger: { type: 'delay', value: 420.0 }, goto: 'complete' },
        ] },

      { id: 'complete',
        trigger: { type: 'delay', value: 2.0 },
        commentary: {
          learning: 'Full power, level flat, and you never touched the pump. That is the division of labor on the secondary side: the three-element controller holds the boilers all day, every day — and the moment you do not like its judgment, one manual pump command takes it straight back. The channel drops to MAN, exactly the way the coupling let go for you. You now own both ends of that handshake.',
          industry: 'Evolution complete: manual SG level control exercised through a load swing; three-element channel engaged and validated through the restore. Any manual pump command (set/nudge) returns the channel to MAN.',
        },
        level_complete: {
          title: 'Feeding the Boilers — Level Held',
          outcome_learning: 'You held the boilers by hand through a load swing, then handed the job to the specialist — and learned it hands the pump right back the moment you speak up.',
          outcome_industry: 'Manual feedwater control and three-element channel engagement validated through a 1000→950→1000 MWe swing; SG level held within band.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },

      { id: 'overfed',
        trigger: { type: 'delay', value: 1.5 },
        commands: [{ action: 'set_feed_coupled', active: true }],
        commentary: {
          learning: 'The HI LEVEL annunciator — 75% and still filling. In a real plant that is water creeping toward the steam lines, and moisture in the turbine is how you wreck a set of blades; the protection would trip the machine before letting it get there. No shame — level control looks easy right up until it is not. I have put the pump back on the coupling to steady things. Rewind or Retry, and this time cut the pump the moment the trend turns against you.',
          industry: 'SG LVL HI (75%) — overfeed. Moisture-carryover risk to the main turbine; hi-hi level feedwater isolation / turbine trip territory in a real unit. Pump recoupled to load. Re-run: trim below steam flow as level crosses the high 60s.',
        },
        level_complete: {
          title: 'Feeding the Boilers — Overfed',
          outcome_learning: 'The boilers filled faster than your hands moved. Trim on the trend, not the number.',
          outcome_industry: 'SG level exceeded the high alarm during manual feed control. Re-run with earlier, bounded trims.',
          actions: ['continue', 'retry', 'rewind'],
        },
        advance: 'end' },

      { id: 'tripped',
        trigger: { type: 'delay', value: 1.5 },
        speed: 1,
        commentary: {
          learning: 'The reactor tripped out from under the exercise. On the secondary side that is usually the level protection: starve the boilers down to 12% and the plant shuts down rather than gamble on dry tubes. That is what the nets are for — no harm done. Rewind or Retry, smaller corrections this time: the pump is powerful, and the boilers are smaller than they look.',
          industry: 'Reactor trip during the feed evolution (SG level protection reached, or manual trip). Protection response nominal. Re-run with bounded pump corrections (±5–10% about steam flow).',
        },
        level_complete: {
          title: 'Feeding the Boilers — Tripped',
          outcome_learning: 'The level ran away faster than the trim came in. Small moves, steady eyes.',
          outcome_industry: 'Trip during manual feedwater control. Re-run with bounded corrections.',
          actions: ['continue', 'retry', 'rewind'],
        },
        advance: 'end' },
    ],
  };

})(globalThis.RD || (globalThis.RD = {}));
