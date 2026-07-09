/*
 * pwr_tmi2_p1.js — TMI-2 Part 1: "The Fog of War" (M5 TMI2 Spec §4).
 *
 * Realistic synoptic (quiet board), chat-mode dialogue, in-character Shift
 * Supervisor who never reveals truth the 1979 crew didn't have. The player
 * watches, acknowledges, and is denied everything else (gate). The timeline
 * plays out per RD.TMI2 regardless of clicks; the ending is core damage,
 * unsoftened (Spec §4 "do not soften").
 *
 * Pacing gates are `any(manual, delay)` — the ack button carries the pacing,
 * the delay is the walk-away/softlock guard (and the headless driver's path).
 */
;(function (RD) {
  'use strict';

  var T2 = RD.TMI2, PHYS = T2.PHYS, TRIG = T2.TRIG, L = T2.LEADIN, E = T2.EVENTS;
  function ack(delayS) {
    return { type: 'any', triggers: [{ type: 'manual' }, { type: 'delay', value: delayS || 120 }] };
  }

  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.pwr_tmi2_p1 = {
    id: 'pwr_tmi2_p1',
    title: 'TMI-2 · Part 1 — The Fog of War',
    plant_id: 'pwr',
    design_version: null,
    initial_state: 'hot_full_power',
    mode: 'demonstration',
    chat: true,
    description: 'March 28, 1979, 4 AM — the night shift, exactly as the crew lived it. No hindsight.',
    ui_policy: { synoptic: 'realistic', overlay: false, tag: 'afw_tag' },
    setup_commands: T2.PHYS.setup,

    interactions: {
      afw_tag: {
        request: {
          learning: 'Permission to pull the maintenance tag on the emergency feedwater valve and check the lineup?',
          industry: 'Request permission to lift the clearance tag on AFW discharge valve 3-1 and verify the lineup.',
        },
        request_repeat: {
          learning: 'That tag on the emergency feedwater valve — I\'d still like to check behind it.',
          industry: 'Renewing the request on the AFW 3-1 clearance tag.',
        },
        responses: [
          { speaker: 'supx',
            learning: 'Negative. That tag\'s not mine to pull — it belongs to the surveillance crew\'s paperwork. Lineup was signed off an hour ago. Stay on your gauges.',
            industry: 'Negative. That clearance belongs to the surveillance test — lineup verified and signed off at turnover. Remain on your panel.' },
        ],
        repeat: [
          { speaker: 'supx',
            learning: 'Still no. Paperwork says that train is squared away, and paperwork beats a hunch at four in the morning. Gauges.',
            industry: 'Negative again. The completed surveillance record governs. Man your indications.' },
          { speaker: 'supx',
            learning: 'Focus. The tag stays until I say otherwise.',
            industry: 'The tag stays. Attend your board.' },
        ],
      },
    },

    beats: [

      // ------------------------------------------------------ pre-accident lead-in
      { id: 'b0_scene',
        story_min: 0,   // in-fiction clock anchor (03:53 + N min — historical timing)
        trigger: { type: 'time', value: 1.5 },
        dialogue: L.open,
        gate: {
          allow_actions: ['acknowledge_alarm', 'acknowledge_all_alarms'],
          message: {
            speaker: 'supx',
            learning: 'Hands off the board tonight — you\'re here to watch and learn the watch. Acknowledge your alarms; the controls are mine.',
            industry: 'No manipulations this watch — observe and acknowledge. Board actions are mine.',
          },
        },
        advance: 'wait_for_trigger' },

      { id: 'b1_turnover',
        story_min: 2,   // in-fiction clock anchor (03:53 + N min — historical timing)
        trigger: ack(90),
        chat_button: { style: 'ack', label_learning: 'Go ahead.', label_industry: 'Ready for turnover.' },
        dialogue: L.turnover,
        advance: 'wait_for_trigger' },

      { id: 'b2_smalltalk',
        story_min: 5,   // in-fiction clock anchor (03:53 + N min — historical timing)
        trigger: ack(90),
        chat_button: { style: 'ack', label_learning: 'Got it. Tag noted.', label_industry: 'Turnover acknowledged.' },
        dialogue: L.smalltalk,
        advance: 'wait_for_trigger' },

      // ------------------------------------------------------ T+0 — the interruption
      // Fires ten seconds into the small talk — the plant does not wait for a
      // clean end of scene (Spec §2.1).
      { id: 'b3_lofw',
        story_min: 7,   // in-fiction clock anchor (03:53 + N min — historical timing)
        trigger: { type: 'delay', value: 10.0 },
        inject_failures: PHYS.lofw.inject_failures,
        dialogue: E.lofw,   // shared with Part 3 (Spec §6 parity)
        advance: 'wait_for_trigger' },

      { id: 'b4_cascade',
        story_min: 7,   // in-fiction clock anchor (03:53 + N min — historical timing)
        trigger: { type: 'delay', value: 7.0 },
        dialogue: E.cascade,   // shared with Part 3 (Spec §6 parity)
        advance: 'wait_for_trigger' },

      { id: 'b5_scram',
        story_min: 8,   // in-fiction clock anchor (03:53 + N min — historical timing)
        trigger: TRIG.scram,
        commands: PHYS.porvLift.commands,
        dialogue: E.scram,   // shared with Part 3 (Spec §6 parity)
        advance: 'wait_for_trigger' },

      // ---------------------------------------------- ~T+26 — the lie begins
      { id: 'b6_reseat',
        story_min: 8,   // in-fiction clock anchor (03:53 + N min — historical timing)
        trigger: TRIG.reseatMoment,
        inject_failures: PHYS.porvStick.inject_failures,
        commands: PHYS.porvStick.commands,
        dialogue: E.reseat,   // shared with Part 3 (Spec §6 parity)
        advance: 'wait_for_trigger' },

      { id: 'b7_confusion',
        story_min: 9,   // in-fiction clock anchor (03:53 + N min — historical timing)
        trigger: TRIG.subcoolAlarm,
        dialogue: E.confusion,   // shared with Part 3 (Spec §6 parity)
        advance: 'wait_for_trigger' },

      { id: 'b8_hpi',
        story_min: 9,   // in-fiction clock anchor (03:53 + N min — historical timing)
        trigger: TRIG.hpiAuto,
        dialogue: E.hpiAuto,   // shared with Part 3 (Spec §6 parity)
        advance: 'wait_for_trigger' },

      // ---------------------------------------------- THE trap — §8.3, deepest beat
      { id: 'b9_throttle_call',
        story_min: 11,   // in-fiction clock anchor (03:53 + N min — historical timing)
        trigger: TRIG.pzrLevelHigh,
        speed: 1,
        dialogue: E.throttlePrefix.concat([
          { speaker: 'sup',
            learning: 'It\'s the injection — we\'re pumping the thing full faster than it can settle, that\'s your level. The gauge is telling me we have plenty of water and too much of it. I\'m not going to sit here and watch us go solid. Securing High-Pressure Injection.',
            industry: 'Injection inflow explains the level. Indication says inventory is high and rising. I am not riding this into a solid plant. Securing HPI.' },
        ]),
        advance: 'wait_for_trigger' },

      { id: 'b10_secure',
        story_min: 12,   // in-fiction clock anchor (03:53 + N min — historical timing)
        trigger: ack(90),
        chat_button: { style: 'ack', label_learning: '…Understood. Securing injection.', label_industry: 'Acknowledged. Securing HPI.' },
        commands: PHYS.hpiSecure.commands,
        dialogue: [
          { speaker: 'sup',
            learning: 'Injection\'s secured. Level should settle now. For the record: rising level, low pressure, valve shut — everything on that board says we\'re full of water. If any of that was wrong, we\'d be making a mistake right now. But you go with your instruments — that\'s the job.',
            industry: 'HPI secured. Expect level to stabilize. Basis for the action: level high and rising, PORV indicating shut. The board says high inventory. We act on indications — that is the job.' },
          { speaker: 'aux',
            learning: '…Logged. HPI secured on high pressurizer level.',
            industry: 'Logged: HPI secured, basis high PZR level.' },
        ],
        advance: 'wait_for_trigger' },

      { id: 'b11_lull',
        story_min: 13,   // in-fiction clock anchor (03:53 + N min — historical timing)
        trigger: { type: 'delay', value: 30.0 },
        dialogue: [
          { speaker: 'sup',
            learning: 'Alright. Nothing new to report — we\'re just watching it now. Pressure\'s wandering along low but flat, level\'s pegged high, generators are dry but the emergency pumps show running. We hold, we watch, we wait for it to make sense.',
            industry: 'Status hold. Pressure low but stable, PZR level pegged high, SGs dry with AFW showing running. We monitor and wait for the picture to reconcile.' },
          { speaker: 'aux',
            learning: 'Watching a board that doesn\'t add up. My favorite way to spend a night.',
            industry: 'Monitoring a non-reconciling board. Outstanding.' },
        ],
        advance: 'wait_for_trigger' },

      // ---------------------------------------------- ~T+8 min — the valves are found
      { id: 'b12_afw_found',
        story_min: 15,   // in-fiction clock anchor (03:53 + N min — historical timing)
        trigger: TRIG.afwDiscovery,
        chat_button: { style: 'skip', label_learning: 'Wait', label_industry: 'Stand by', speed: 60 },
        speed: 1,
        clear_failures: PHYS.afwRestore.clear_failures,
        dialogue: [
          { speaker: 'aux',
            learning: 'Boss! Boss — the emergency feedwater block valves. They\'re SHUT. Both of them. The pumps have been running against closed valves this whole time — that\'s why the generators went dry! I\'m opening them now — feed\'s going in.',
            industry: 'Supervisor — AFW discharge block valves are SHUT, both trains. Pumps have been deadheading since the trip. Opening now — feed restored to both SGs.' },
          { speaker: 'sup',
            learning: 'Shut?! …The surveillance test. They never re-opened them after the test. That\'s eight minutes those boilers sat dry. Get water in, gently — cold water on hot, dry metal is its own accident.',
            industry: 'Shut— the surveillance lineup. Never restored post-test. Eight minutes dry. Re-feed gently — thermal shock on dry tube bundles is a real concern.' },
          { speaker: 'aux',
            learning: 'Feeding. Levels are coming back… there. So that mystery\'s solved. Doesn\'t explain the pressure, though, does it.',
            industry: 'Feeding. SG levels recovering. That closes the feed anomaly. It does not explain the pressure behavior.' },
          { speaker: 'sup',
            learning: 'No. It doesn\'t.',
            industry: 'No. It does not.' },
        ],
        advance: 'wait_for_trigger' },

      { id: 'b13_lull2',
        story_min: 20,   // in-fiction clock anchor (03:53 + N min — historical timing)
        trigger: { type: 'delay', value: 40.0 },
        dialogue: [
          { speaker: 'sup',
            learning: 'Steam generators are recovering, and the primary still refuses to make sense. Pressure low. Level pegged. Subcooling margin reading zero — zero, meaning the coolant\'s sitting right at boiling. And the loops have started thumping — you feel that? Nothing to do but keep watching it.',
            industry: 'SGs recovering. Primary still non-reconciling: pressure low, level pegged, subcooling margin indicating zero — saturated. RCP cavitation noise developing. We continue to monitor.' },
          { speaker: 'aux',
            learning: 'Thumping means bubbles somewhere, boss. Pumps don\'t like it either.',
            industry: 'Cavitation implies voiding somewhere in the loops. Pumps are objecting.' },
          { speaker: 'sup',
            learning: 'I know what it means. I just can\'t make it agree with a shut relief valve and a full pressurizer. Keep watching.',
            industry: 'Understood. It doesn\'t reconcile with a shut PORV and a full pressurizer. Maintain the watch.' },
        ],
        advance: 'wait_for_trigger' },

      // ---------------------------------------------- identification (~2 hrs in-story)
      { id: 'b14_ident',
        time_skip: true,   // authored compressed stretch — the ONLY place the elapsed-time divider renders
        story_min: 147,   // in-fiction clock anchor (03:53 + N min — historical timing)
        trigger: TRIG.identification,
        chat_button: { style: 'skip', label_learning: 'Wait', label_industry: 'Stand by', speed: 60 },
        speed: 1,
        dialogue: [
          { speaker: 'aux',
            learning: 'Boss… come look at this one number with me. Tailpipe temperature — the pipe on the *downstream* side of the relief valve. It reads 150 degrees. That pipe runs about 80 when the valve\'s shut. It\'s been cooking this whole time.',
            industry: 'Supervisor — PORV tailpipe temperature. Reading 150 °C against a ~80 °C baseline. It has been elevated the entire event.' },
          { speaker: 'sup',
            learning: '…Wait a minute. Wait a minute — a shut valve doesn\'t heat its tailpipe. Steam does. Flowing steam. That valve never reseated. The light went out because the *signal* went out — the valve\'s been wide open for two hours. We\'ve been bleeding the reactor out the top of the pressurizer all night.',
            industry: '…Stand by. A seated PORV doesn\'t heat the discharge line — flow does. The valve never reseated; we lost the solenoid signal, not the valve. It\'s been open on the order of two hours. We\'ve had an open relief path on the RCS this entire event.' },
          { speaker: 'aux',
            learning: 'Two hours… that\'s tens of thousands of gallons. A third of the primary, gone to the drain tank. And we *turned off* the injection.',
            industry: 'Two hours of relief flow — tens of thousands of gallons, roughly a third of RCS inventory to the drain tank. And injection was secured on top of it.' },
          { speaker: 'sup',
            learning: 'The level gauge… the water wasn\'t rising because we were full. It was rising because the system\'s boiling underneath it and shoving water up the one tank we can see. Every read we made tonight was off that one lying light. There\'s a block valve under the PORV — a manual gate, upstream. We close it, the hole\'s plugged, lie or no lie.',
            industry: 'The PZR level rise was void-driven insurge — the system boiling below and displacing water into the one vessel we meter, not excess inventory. Every decision keyed off one failed indication. The PORV block valve is upstream of it — closing it isolates the relief path regardless of the PORV.' },
        ],
        advance: 'wait_for_trigger' },

      { id: 'b15_isolate',
        story_min: 149,   // in-fiction clock anchor (03:53 + N min — historical timing)
        trigger: ack(90),
        chat_button: { style: 'ack', label_learning: 'Close the block valve.', label_industry: 'Shut the block valve. Restore HPI.' },
        commands: PHYS.isolate.commands,
        speed: 30,
        dialogue: [
          { speaker: 'sup',
            learning: 'Block valve driving shut — NOW. And injection back on, full flow, and it does not come off again while I\'m standing here. Refill the primary. I\'m running the clock forward while we recover — watch the pressure and the subcooling number climb back to sanity.',
            industry: 'Block valve shut. HPI restored, full flow, locked in service. Refilling the RCS. Accelerating through the recovery — watch pressure and subcooling margin restore.' },
          { speaker: 'sys',
            learning: '*chime* — EMERGENCY COOLING ACTIVE',
            industry: '*chime* — HPI ACTIVE' },
        ],
        advance: 'wait_for_trigger' },

      { id: 'b16_recovered',
        story_min: 165,   // in-fiction clock anchor (03:53 + N min — historical timing)
        trigger: TRIG.subcoolRestored,
        speed: 1,
        dialogue: [
          { speaker: 'aux',
            learning: 'Pressure\'s rebuilding… subcooling margin\'s back above the alarm. The water\'s water again, boss. It\'s holding.',
            industry: 'Pressure recovering, subcooling margin restored above setpoint. RCS is subcooled and stable.' },
          { speaker: 'sup',
            learning: 'Holding. Two hours and twenty minutes after the polishers hiccuped. One stuck valve, one honest-looking light… and every right decision we made off it was wrong.',
            industry: 'Stable. Two hours twenty from the initiating event. One stuck valve behind one demand-signal light — and every procedurally sound decision keyed to it was wrong.' },
        ],
        advance: 'wait_for_trigger' },

      { id: 'b17_end',
        story_min: 170,   // in-fiction clock anchor (03:53 + N min — historical timing)
        trigger: { type: 'delay', value: 14.0 },
        dialogue: [
          { speaker: 'sup',
            learning: 'Don\'t celebrate. The core ran partially uncovered while we argued with a level gauge. Fuel doesn\'t forgive that — cladding temperatures went where cladding fails. We damaged this core tonight. That\'s going in my log in plain words, because it\'s true, and because someone will need to learn from it.',
            industry: 'Hold the relief. The core sustained a period of uncovery during the event. Peak clad temperatures exceeded failure limits — we have core damage. It will be logged in exactly those words.' },
          { speaker: 'chief',
            learning: 'And someone will. This is Chief — I\'ve been watching the whole shift from back here. You just lived the real morning of March 28, 1979, the way the real crew did: good people, trained procedures, and a board that lied to them. When you\'re ready, come with me. We\'re going to run the whole night again — and this time you get to see what the plant was actually doing.',
            industry: 'Chief here — I monitored the full evolution. That was March 28, 1979 as the crew experienced it: qualified operators, sound procedures, failed indication. Next session is the replay with ground truth displayed. Debrief when ready.' },
        ],
        level_complete: {
          title: 'Part 1 — The Fog of War',
          outcome_learning: 'The historical outcome: a stuck-open relief valve behind a lying indicator drained the core for over two hours. The crew\'s decisions were reasonable — and wrong. The core was damaged. Part 2 shows you why.',
          outcome_industry: 'Historical outcome reproduced: stuck-open PORV masked by demand-signal indication; HPI secured on misleading PZR level; ~2 h 20 m to isolation. Core damage sustained. Part 2 is the ground-truth replay.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },
    ],
  };

})(globalThis.RD || (globalThis.RD = {}));
