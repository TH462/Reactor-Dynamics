/*
 * pwr_tmi2_p1.js — TMI-2 Part 1: "The Fog of War" (M5 TMI2 Spec §4).
 *
 * Realistic synoptic (quiet board), chat-mode dialogue, in-character Shift
 * Supervisor who never reveals truth the 1979 crew didn't have. The timeline
 * plays out per RD.TMI2; the ending is core damage, unsoftened (Spec §4 "do
 * not soften").
 *
 * GUIDED HANDS-ON (issue #105): the player is not a spectator. The supervisor
 * ORDERS the two pivotal historical actions and the player performs them with
 * their own hands on the board — securing High-Pressure Injection (the fatal
 * mistake), then closing the PORV block valve and restoring injection (the
 * recovery). If the player stalls, the supervisor takes the action himself, so
 * the outcome is always the historical one — the rails hold, but the trigger is
 * the player's. Between the two decisions the board is gated to on-order actions
 * only (a phase gate whose `until` opens each window), so the player can't undo
 * the mistake mid-draindown — the trap has to close.
 *
 * PACING (issue #105): no scripted fast-forward buttons. The long, uneventful
 * draindown to core damage is run at a modest authored acceleration (beat.speed)
 * and snaps back to 1× at each reveal — smooth, not a stutter of skip/resume. The
 * alarm-cascade-drops-FF bug is fixed in M5 (_authoredSpeed), so the compressed
 * stretch rides through the transient's alarms instead of halting on each one.
 * The historical elapsed-time labels (story_min anchors, the ~2 h 20 m divider)
 * are kept — compression erases the wait, not the numbers (Spec §2.2 guardrail).
 */
;(function (RD) {
  'use strict';

  var T2 = RD.TMI2, PHYS = T2.PHYS, TRIG = T2.TRIG, L = T2.LEADIN, E = T2.EVENTS;
  function ack(delayS) {
    return { type: 'any', triggers: [{ type: 'manual' }, { type: 'delay', value: delayS || 120 }] };
  }
  function jump(target, delayS) {
    return [{ trigger: { type: 'delay', value: delayS || 2.0 }, goto: target }];
  }
  // Phase gate: on-order actions only. `until` is the trigger that opens the next
  // action window (the gate splices out when it fires), so between windows the
  // player may only acknowledge alarms; when a window opens the ordered controls
  // become live. `msg` is the in-character refusal shown if the player jumps the gun.
  function watchGate(until, msg) {
    return {
      allow_actions: ['acknowledge_alarm', 'acknowledge_all_alarms'],
      until: until,
      message: msg || {
        speaker: 'supx',
        learning: 'Not yet. You act when I call for it, not before — acknowledge your alarms and stand by for my word.',
        industry: 'Stand by. Acknowledge only; await instruction.',
      },
    };
  }
  var HOLD_INJECTION_MSG = {
    speaker: 'supx',
    learning: 'Injection stays secured — that\'s the call and we hold it. If the level\'s high, more water is the last thing we want. Watch the board.',
    industry: 'HPI remains secured — that is the standing order. Do not re-initiate against a high level. Monitor.',
  };

  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.pwr_tmi2_p1 = {
    id: 'pwr_tmi2_p1',
    title: 'TMI-2 · Part 1 — The Fog of War',
    plant_id: 'pwr',
    design_version: null,
    initial_state: 'hot_full_power',
    mode: 'demonstration',
    chat: true,
    description: 'March 28, 1979, 4 AM — the night shift, exactly as the crew lived it. No hindsight. You have the board.',
    ui_policy: { synoptic: 'realistic', overlay: false, tag: 'afw_tag', failures: 'locked' },
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
        // On-order actions only until the pressurizer-level decision opens the first
        // window (TRIG.pzrLevelHigh). The player watches, acknowledges, and stands by.
        gate: watchGate(TRIG.pzrLevelHigh, {
          speaker: 'supx',
          learning: 'Hands easy on the board — tonight you run it on my word, not ahead of it. Acknowledge your alarms and stand by; I\'ll call the actions.',
          industry: 'Operate on instruction only this watch. Acknowledge alarms and stand by; I will direct board actions.',
        }),
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
      // The supervisor orders it; YOUR hands secure the injection. Historical either
      // way — comply and it's your call, stall and he makes it — but this is the
      // moment the 1979 crew got wrong, and now you get to feel it as yours.
      { id: 'b9_throttle_call',
        story_min: 11,   // in-fiction clock anchor (03:53 + N min — historical timing)
        trigger: TRIG.pzrLevelHigh,
        speed: 1,
        dialogue: E.throttlePrefix.concat([
          { speaker: 'sup',
            learning: 'It\'s the injection — we\'re pumping the thing full faster than it can settle, that\'s your level. The gauge says we have plenty of water and too much of it, and I\'m not going to sit here and watch us go solid. You have the board: secure High-Pressure Injection. That\'s an instruction — do it now.',
            industry: 'Injection inflow explains the level. Indication says inventory is high and rising. I will not ride this into a solid plant. You have the panel: secure HPI. That is an instruction — execute.' },
        ]),
        branches: [
          { trigger: { type: 'operator_action', command: 'set_hpi', params: { active: false } }, goto: 'b10_secured' },
          { trigger: { type: 'inaction', window: 75.0 }, goto: 'b10_boss_secures' },
        ] },

      // The player pulled the trigger.
      { id: 'b10_secured',
        trigger: { type: 'delay', value: 1.5 },
        dialogue: [
          { speaker: 'sup',
            learning: 'Injection\'s secured — good hands. Level should settle now. For the record, so you learn how this call gets made: rising level, low pressure, valve shut. Everything on that board says we\'re full of water, and you go with your instruments. That\'s the job. If any of it was lying to us, we\'d be making a mistake right now — but that\'s not a thing a gauge lets you know.',
            industry: 'HPI secured — well executed. Expect level to stabilize. Basis on the record: level high and rising, PORV indicating shut. The board reads high inventory; we act on indications. That is the job.' },
          { speaker: 'aux',
            learning: '…Logged. HPI secured on high pressurizer level, by the new man\'s hand.',
            industry: 'Logged: HPI secured, basis high PZR level.' },
        ],
        // Jump PAST the boss-secures fallback (the very next array beat) into the watch.
        branches: jump('b11_lull') },

      // The player let the order sit — the supervisor makes the historical call himself.
      { id: 'b10_boss_secures',
        trigger: { type: 'delay', value: 1.5 },
        commands: PHYS.hpiSecure.commands,
        dialogue: [
          { speaker: 'sup',
            learning: 'You\'re frozen on it — fair, it doesn\'t sit right. My hands then: injection secured. For the record: rising level, low pressure, valve shut. The board says we\'re full of water, and we act on the board. That\'s the job. If any of it was wrong, we\'d be making a mistake right now — but a gauge doesn\'t tell you when it\'s lying.',
            industry: 'You\'re holding — understood. Taking it: HPI secured. Basis: level high and rising, PORV indicating shut. The board reads high inventory; we act on indications. That is the job.' },
          { speaker: 'aux',
            learning: '…Logged. HPI secured on high pressurizer level.',
            industry: 'Logged: HPI secured, basis high PZR level.' },
        ],
        branches: jump('b11_lull') },

      { id: 'b11_lull',
        trigger: { type: 'delay', value: 20.0 },
        speed: 6,   // begin the smooth compression of the long draindown (no skip button)
        // Injection is off the board for the draindown — the trap can't be undone from
        // here. On-order actions only again until the truth is identified.
        gate: watchGate(TRIG.identification, HOLD_INJECTION_MSG),
        dialogue: [
          { speaker: 'sup',
            learning: 'Alright. Injection secured, nothing new to report — we watch it now. Pressure\'s wandering along low but flat, level\'s pegged high, generators are dry but the emergency pumps show running. We hold, we watch, we wait for it to make sense.',
            industry: 'Status hold. HPI secured. Pressure low but stable, PZR level pegged high, SGs dry with AFW showing running. We monitor and wait for the picture to reconcile.' },
          { speaker: 'aux',
            learning: 'Watching a board that doesn\'t add up. My favorite way to spend a night.',
            industry: 'Monitoring a non-reconciling board. Outstanding.' },
        ],
        advance: 'wait_for_trigger' },

      // ---------------------------------------------- ~T+8 min — the valves are found
      { id: 'b12_afw_found',
        trigger: TRIG.afwDiscovery,
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
        trigger: { type: 'delay', value: 40.0 },
        dialogue: [
          { speaker: 'sup',
            learning: 'Steam generators are recovering, and the primary still refuses to make sense. And look at that — the pressurizer\'s gone SOLID. Level pegged at the top, water clear to the roof, no steam bubble left. We secured injection to keep her off the top… and she went there anyway, with the pumps OFF. That should frighten me more than it does. Pressure\'s still low, subcooling reading zero — coolant sitting right at boiling — and the loops have started thumping. Nothing to do but keep watching it.',
            industry: 'SGs recovering. Primary still non-reconciling: pressurizer indicating SOLID — level pegged, no steam space — and it went solid with HPI secured, which should not happen on a shrinking inventory. Pressure low, subcooling margin zero (saturated), RCP cavitation developing. We continue to monitor.' },
          { speaker: 'aux',
            learning: 'Solid with the pumps off, and thumping loops. Bubbles somewhere, boss — and the pumps don\'t like it either.',
            industry: 'Solid with injection off, plus cavitation — implies voiding somewhere in the loops. Pumps are objecting.' },
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
        speed: 1,   // snap back to real time for the reveal
        dialogue: [
          { speaker: 'aux',
            learning: 'Boss… come look at this one number with me. Tailpipe temperature — the pipe on the *downstream* side of the relief valve. It\'s reading hot, way over its baseline, and it\'s been climbing all night. A shut valve\'s tailpipe runs cold.',
            industry: 'Supervisor — PORV tailpipe temperature. Reading well above baseline and elevated the entire event. A seated valve\'s discharge line runs cold.' },
          { speaker: 'sup',
            learning: '…Wait a minute. Wait a minute — a shut valve doesn\'t heat its tailpipe. Steam does. Flowing steam. That valve never reseated. The light went out because the *signal* went out — the valve\'s been wide open for two hours. We\'ve been bleeding the reactor out the top of the pressurizer all night.',
            industry: '…Stand by. A seated PORV doesn\'t heat the discharge line — flow does. The valve never reseated; we lost the solenoid signal, not the valve. It\'s been open on the order of two hours. We\'ve had an open relief path on the RCS this entire event.' },
          { speaker: 'aux',
            learning: 'Two hours… that\'s tens of thousands of gallons. A third of the primary, gone to the drain tank. And we *turned off* the injection.',
            industry: 'Two hours of relief flow — tens of thousands of gallons, roughly a third of RCS inventory to the drain tank. And injection was secured on top of it.' },
          { speaker: 'sup',
            learning: 'The level gauge… the water wasn\'t rising because we were full. It was rising because the system\'s boiling underneath it and shoving water up the one tank we can see. That\'s your "solid" pressurizer — void, not water. Every read we made tonight was off that one lying light. There\'s a block valve under the PORV — a manual gate, upstream. You close it, the hole\'s plugged, lie or no lie. Then injection back on. Your board — do it.',
            industry: 'The PZR level rise was void-driven insurge — the system boiling below and displacing water into the one vessel we meter, not excess inventory; that\'s the "solid" indication. Every decision keyed off one failed indication. The PORV block valve is upstream — shut it to isolate the relief path regardless of the PORV, then restore HPI. Your panel — execute.' },
        ],
        branches: [
          { trigger: TRIG.isolated, goto: 'b15_isolated' },
          { trigger: { type: 'inaction', window: 120.0 }, goto: 'b15_boss_isolates' },
        ] },

      // The player drove the block valve shut.
      { id: 'b15_isolated',
        story_min: 149,   // in-fiction clock anchor (03:53 + N min — historical timing)
        trigger: { type: 'delay', value: 1.5 },
        commands: PHYS.hpiRestore ? PHYS.hpiRestore.commands : [{ action: 'set_hpi', active: true }],
        speed: 6,
        dialogue: [
          { speaker: 'sup',
            learning: 'Block valve\'s shut — the hole\'s plugged. Injection back on, full flow, and it does not come off again while I\'m standing here. Good hands. Now we refill the primary — I\'m running the clock forward while we recover. Watch the pressure and the subcooling number climb back to sanity.',
            industry: 'Block valve confirmed shut — relief path isolated. HPI restored, full flow, locked in service. Well done. Refilling the RCS; accelerating through the recovery — watch pressure and subcooling margin restore.' },
          { speaker: 'sys',
            learning: '*chime* — EMERGENCY COOLING ACTIVE',
            industry: '*chime* — HPI ACTIVE' },
        ],
        // Jump PAST the boss-isolates fallback (the next array beat) into recovery.
        branches: jump('b16_recovered') },

      // The player didn't move on it — the supervisor drives it shut himself.
      { id: 'b15_boss_isolates',
        story_min: 149,   // in-fiction clock anchor (03:53 + N min — historical timing)
        trigger: { type: 'delay', value: 1.5 },
        commands: PHYS.isolate.commands,
        speed: 6,
        dialogue: [
          { speaker: 'sup',
            learning: 'You\'re still on it — my hands then. Block valve driving shut NOW, and injection back on, full flow, and it does not come off again. Refill the primary. I\'m running the clock forward while we recover — watch the pressure and the subcooling number climb back to sanity.',
            industry: 'Taking it: block valve shut, HPI restored full flow and locked in service. Refilling the RCS; accelerating through the recovery — watch pressure and subcooling margin restore.' },
          { speaker: 'sys',
            learning: '*chime* — EMERGENCY COOLING ACTIVE',
            industry: '*chime* — HPI ACTIVE' },
        ],
        branches: jump('b16_recovered'),
      },

      { id: 'b16_recovered',
        story_min: 165,   // in-fiction clock anchor (03:53 + N min — historical timing)
        trigger: TRIG.subcoolRestored,
        speed: 1,
        // Recovery is in hand — release the board to on-order-only through the debrief.
        gate: watchGate({ type: 'delay', value: 99999 }),
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
            learning: 'Don\'t celebrate. The core ran partially uncovered while we argued with a level gauge. Fuel doesn\'t forgive that — cladding temperatures went where cladding fails. We damaged this core tonight. That\'s going in my log in plain words, because it\'s true, and because someone will need to learn from it. Your hands were on this board tonight — sit with that. Not as blame; as the reason it matters.',
            industry: 'Hold the relief. The core sustained a period of uncovery during the event. Peak clad temperatures exceeded failure limits — we have core damage. It will be logged in exactly those words.' },
          { speaker: 'chief',
            learning: 'This is Chief — I\'ve been watching the whole shift from back here. You just lived the real morning of March 28, 1979, the way the real crew did: good people, trained procedures, and a board that lied to them — and you made the same calls with your own hands. When you\'re ready, come with me. We\'re going to run the whole night again — and this time you get to see what the plant was actually doing.',
            industry: 'Chief here — I monitored the full evolution. That was March 28, 1979 as the crew experienced it: qualified operators, sound procedures, failed indication. Next session is the replay with ground truth displayed. Debrief when ready.' },
        ],
        level_complete: {
          title: 'Part 1 — The Fog of War',
          outcome_learning: 'The historical outcome: a stuck-open relief valve behind a lying indicator drained the core for over two hours. The decisions were reasonable — and wrong — and tonight they were yours. The core was damaged. Part 2 shows you why.',
          outcome_industry: 'Historical outcome reproduced: stuck-open PORV masked by demand-signal indication; HPI secured on misleading PZR level; ~2 h 20 m to isolation. Core damage sustained. Part 2 is the ground-truth replay.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },
    ],
  };

})(globalThis.RD || (globalThis.RD = {}));
