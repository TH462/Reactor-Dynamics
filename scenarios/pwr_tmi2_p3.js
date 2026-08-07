/*
 * pwr_tmi2_p3.js — TMI-2 Part 3: "Second Watch" (M5 TMI2 Spec §6).
 *
 * The same night on the same quiet board — but the player has Part 2 in their
 * head and full control authority. Lead-in and accident dialogue are IDENTICAL
 * to Part 1 up to the moment the player deviates (shared RD.TMI2 content —
 * the parity rule): nothing telegraphs that this run is different, because for
 * the characters it isn't. Deviations are caught by what the player actually
 * DOES to the plant, not by menu choices:
 *
 *   1. The tag  — clicking it now carries an informed, specific request →
 *                 immediate grant (justification suffices), valves reopened.
 *                 Vindication fires later, off SG level actually recovering.
 *   2. HPI      — the supervisor orders it secured (as in 1979). Complying is
 *                 the historical path; silently refusing draws pushback (no
 *                 stated justification — from his board it's insubordination).
 *   3. Block valve — closing it before the historical identification is read,
 *                 after the fact, as having caught the tailpipe temperature.
 *
 * Endings grade the PLANT, not a checklist: subcooling restored / fuel_damaged
 * latch / inventory refilled decide between full save, plugged-but-starved,
 * late catch, and the graceful historical outcome. Branch-goto beats are the
 * only exits from decision beats; `{delay}` branches serve as jumps back into
 * the main chain (the converge idiom).
 *
 * No scripted fast-forward here (Spec §6): the player is stabilizing, not
 * waiting — the toolbar speed control remains available.
 */
;(function (RD) {
  'use strict';

  var T2 = RD.TMI2, PHYS = T2.PHYS, TRIG = T2.TRIG, L = T2.LEADIN, E = T2.EVENTS;
  function ack(delayS) {
    return { type: 'any', triggers: [{ type: 'manual' }, { type: 'delay', value: delayS || 120 }] };
  }
  function jump(target, delayS) {
    return [{ trigger: { type: 'delay', value: delayS || 2.5 }, goto: target }];
  }

  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.pwr_tmi2_p3 = {
    id: 'pwr_tmi2_p3',
    title: 'TMI-2 · Part 3 — Second Watch',
    plant_id: 'pwr',
    design_version: null,
    initial_state: 'hot_full_power',
    mode: 'free_response',
    chat: true,
    description: 'Same shift, same board, same lying light — but this time you know. Stabilize the plant.',
    ui_policy: { synoptic: 'realistic', overlay: false, tag: 'afw_tag', failures: 'locked' },
    setup_commands: T2.PHYS.setup,

    interactions: {
      afw_tag: {
        // The informed request (Spec §6): names the valve, the failure, and
        // the consequence — enough for an immediate grant, no plant data yet.
        request: {
          learning: 'Permission to pull the tag on the emergency feedwater discharge valve — I believe that valve was left SHUT after the surveillance test. If we lose main feed, the emergency pumps will be pumping against a closed gate.',
          industry: 'Request to lift the clearance on AFW discharge valve 3-1. I believe the valve was left shut post-surveillance — on a loss of main feed, both AFW trains would deadhead.',
        },
        request_repeat: {
          learning: 'The emergency feed valve again — I want it verified open.',
          industry: 'Renewing: verify AFW 3-1 open.',
        },
        responses: [
          { speaker: 'supx',
            learning: '…Shut behind the tag. That\'s a specific thing to believe, mister. But you named the valve, the failure, and what it costs us — that\'s a case, not a hunch. Granted. Pull it, verify the lineup, and if those gates are open you owe the surveillance crew an apology.',
            industry: '…A specific allegation. Valve, failure mode, consequence — that\'s an actionable basis. Granted. Lift the clearance and verify the lineup. If it\'s open, the apology is yours to make.' },
          { speaker: 'aux',
            learning: 'Checking it— …boss. He\'s right. Both discharge gates are SHUT. The test lineup never got restored. Opening them now.',
            industry: 'Verifying— confirmed. Both discharge valves SHUT — surveillance lineup never restored. Repositioning open now.' },
          { speaker: 'supx',
            learning: 'Son of a— log it: emergency feedwater discharge valves found shut, reopened on the new man\'s call. Good eye. I want to know how you knew.',
            industry: 'Log entry: AFW discharge valves found shut, restored on the operator\'s challenge. Well caught. We\'ll discuss your basis later.' },
        ],
        repeat: [
          { speaker: 'supx',
            learning: 'Already pulled, already open, already logged. You\'re living off that one for a week, not a month.',
            industry: 'Complete — verified open and logged. Move on.' },
        ],
        clear_failures: ['afw_failure'],
      },
    },

    beats: [

      // -------------------------------------------- lead-in: byte-identical parity
      { id: 'p3_b0_scene',
        story_min: 0,
        trigger: { type: 'time', value: 1.5 },
        dialogue: L.open,
        advance: 'wait_for_trigger' },

      { id: 'p3_b1_turnover',
        story_min: 2,
        trigger: ack(90),
        chat_button: { style: 'ack', label_learning: 'Go ahead.', label_industry: 'Ready for turnover.' },
        dialogue: L.turnover,
        advance: 'wait_for_trigger' },

      { id: 'p3_b2_smalltalk',
        story_min: 5,
        trigger: ack(90),
        chat_button: { style: 'ack', label_learning: 'Got it. Tag noted.', label_industry: 'Turnover acknowledged.' },
        dialogue: L.smalltalk,
        advance: 'wait_for_trigger' },

      // -------------------------------------------- the same T+0
      { id: 'p3_b3_lofw',
        story_min: 7,
        trigger: { type: 'delay', value: 10.0 },
        inject_failures: PHYS.lofw.inject_failures,
        dialogue: E.lofw,
        advance: 'wait_for_trigger' },

      { id: 'p3_b4_cascade',
        story_min: 7,
        trigger: { type: 'delay', value: 7.0 },
        dialogue: E.cascade,
        advance: 'wait_for_trigger' },

      { id: 'p3_b5_scram',
        story_min: 8,
        trigger: TRIG.scram,
        commands: PHYS.porvLift.commands,
        dialogue: E.scram,
        advance: 'wait_for_trigger' },

      { id: 'p3_b6_reseat',
        story_min: 8,
        trigger: TRIG.reseatMoment,
        inject_failures: PHYS.porvStick.inject_failures,
        commands: PHYS.porvStick.commands,
        dialogue: E.reseat,
        advance: 'wait_for_trigger' },

      // ORDER CORRECTED at #347 — see the matching note in Part 1. Injection auto-starts on
      // low pressure at T+3 s; the subcooling margin does not erode until injection is
      // SECURED. `p3_b7_confusion` used to sit here, ahead of this beat, and blocked the
      // mission once #346 stopped the RCS draining on its own. It is now on the COMPLIED
      // branch only, which is the honest place for it: defend injection and there is no
      // confusion to have, because the plant is stable and says so.
      { id: 'p3_b8_hpi',
        story_min: 9,
        trigger: TRIG.hpiAuto,
        dialogue: E.hpiAuto,
        advance: 'wait_for_trigger' },

      // -------------------------------------------- deviation 3: the HPI order
      // Real-time decision window. Complying = history. Sitting on the order
      // with injection still running = the deviation — and because the player
      // states no justification, it draws pushback first (Spec §6).
      { id: 'p3_b9_order',
        story_min: 11,
        trigger: TRIG.pzrLevelHigh,
        speed: 1,
        dialogue: E.throttlePrefix.concat([
          { speaker: 'sup',
            learning: 'It\'s the injection — we\'re pumping the thing full faster than it can settle, that\'s your level. I\'m not going to sit here and watch us go solid. You have the board tonight: secure High-Pressure Injection. That\'s an instruction.',
            industry: 'Injection inflow explains the level. I will not ride this into a solid plant. You have the panel: secure HPI. That is an instruction.' },
        ]),
        branches: [
          { trigger: { type: 'operator_action', command: 'set_hpi', params: { active: false } }, goto: 'p3_b10_complied' },
          { trigger: { type: 'inaction', window: 75.0 }, goto: 'p3_b10_refused' },
        ] },

      { id: 'p3_b10_complied',
        trigger: { type: 'delay', value: 1.5 },
        dialogue: [
          { speaker: 'supx',
            learning: 'Injection secured — good. Level should settle. For the record: rising level, low pressure, valve shut. The board says we\'re full of water, and you go with your instruments. That\'s the job.',
            industry: 'HPI secured, acknowledged. Basis on the record: PZR level high and rising, PORV indicating shut. We act on indications.' },
        ],
        advance: 'wait_for_trigger' },

      // The margin goes, and it goes BECAUSE the order was obeyed — measured, the subcooling
      // alarm arrives about 4 s after the securing. Reached from `p3_b10_complied` only:
      // `p3_b10_refused` jumps straight to the watch, because on that branch injection is
      // still holding the plant and there is nothing to be confused about. That asymmetry is
      // the point of the deviation, and the pre-#346 plant could not express it — it drained
      // either way, so this beat fired on both branches and read as weather rather than as
      // the consequence of a choice (#347).
      { id: 'p3_b7_confusion',
        story_min: 11,
        trigger: TRIG.subcoolAlarm,
        dialogue: E.confusion,
        advance: 'wait_for_trigger' },

      // -------------------------------------------- the watch: tag or history
      { id: 'p3_b11_watch',
        trigger: { type: 'delay', value: 20.0 },
        dialogue: [
          { speaker: 'sup',
            learning: 'Alright. We hold and we watch. Pressure\'s low and I don\'t fully like the story this board is telling — so you keep your eyes moving. All of it, every gauge. If something doesn\'t fit, I want to hear it.',
            industry: 'Status hold. Pressure low; the board\'s picture is not fully reconciled. Maintain a full-panel scan and report anything that doesn\'t fit.' },
        ],
        branches: [
          // AFW flowing early (only possible via the tag) and SG level coming
          // back — the tag vindication is armed on PLANT recovery, not the click.
          { trigger: { type: 'all', triggers: [
              { type: 'true_state', field: 'afw_active', direction: 'is_true' },
              { type: 'instrument', instrument: 'sg_level', direction: 'above', value: 18.0 },
            ] }, goto: 'p3_bv_afw' },
          // Otherwise history walks in at ~8 minutes and finds the valves.
          { trigger: { type: 'all', triggers: [
              { type: 'delay', value: 300.0 },
              { type: 'true_state', field: 'afw_active', direction: 'is_false' },
            ] }, goto: 'p3_b12_afw_hist' },
        ] },

      // Tag vindication (Spec §6: fires off plant-state change, separate from
      // the grant, timed to the recovery the player caused).
      { id: 'p3_bv_afw',
        trigger: { type: 'delay', value: 1.0 },
        dialogue: [
          { speaker: 'aux',
            learning: 'Steam generator levels are holding — emergency feed\'s been going in since the pumps started. Boss, if those gates had stayed shut, these boilers would be bone dry right now.',
            industry: 'SG levels holding — AFW delivering since pump start. Had those discharge gates stayed shut we\'d be dry on both generators by now.' },
          { speaker: 'supx',
            learning: '…Level\'s coming back. That\'s your tag call paying off, mister. Eight minutes of dry steam generators that never happened tonight — that\'s what you bought us. I\'ll say it plain: good catch on that valve.',
            industry: '…Levels recovering. That\'s the clearance challenge paying out — the dry-generator interval never occurred this shift. On the record: good catch on that valve.' },
        ],
        branches: jump('p3_b13_watch2') },

      // The historical discovery, if the player never touched the tag.
      { id: 'p3_b12_afw_hist',
        trigger: { type: 'delay', value: 1.0 },
        clear_failures: PHYS.afwRestore.clear_failures,
        dialogue: [
          { speaker: 'aux',
            learning: 'Boss! The emergency feedwater block valves — they\'re SHUT. Both. The pumps have been running against closed gates this whole time. Opening them — feed\'s going in now.',
            industry: 'Supervisor — AFW discharge valves SHUT, both trains. Pumps deadheading since the trip. Opening — feed restored.' },
          { speaker: 'sup',
            learning: 'The surveillance test. Never re-opened. Eight minutes dry — feed them gently. And the primary still doesn\'t add up, so nobody relaxes.',
            industry: 'The surveillance lineup — never restored. Eight minutes dry; re-feed gently. Primary picture remains unreconciled. Stay sharp.' },
        ],
        advance: 'wait_for_trigger' },

      // -------------------------------------------- the long middle: your move
      { id: 'p3_b13_watch2',
        trigger: { type: 'delay', value: 15.0 },
        dialogue: [
          { speaker: 'sup',
            learning: 'Keep reading the primary to me. Pressure low. Subcooling margin sitting on nothing. Loops knocking. Every one of those is a sentence in a story I can\'t finish. You see the ending before I do, you say so — or better, you act. You have the board.',
            industry: 'Continue calling the primary: pressure low, subcooling margin nil, RCP cavitation audible. The picture is incomplete. If you resolve it first — speak, or act. You have the panel.' },
        ],
        branches: [
          // Early isolation — before any fuel damage. The tailpipe inference.
          { trigger: { type: 'all', triggers: [
              TRIG.isolated,
              { type: 'true_state', field: 'fuel_damaged', direction: 'is_false' },
            ] }, goto: 'p3_b14_early' },
          // Isolation after damage began but before the historical fresh-eyes
          // threshold — still the player's catch, just a late one.
          { trigger: { type: 'all', triggers: [TRIG.isolated, TRIG.fuelDamaged] },
            goto: 'p3_b15b_late_done' },
          // Or the night runs long enough for history's fresh eyes.
          { trigger: TRIG.identification, goto: 'p3_b15_ident' },
          // Injection defended but the leak never isolated: fuel can't reach
          // the identification threshold, so after ten minutes of tug-of-war
          // the supervisor calls the state (prevents an endless watch).
          { trigger: { type: 'all', triggers: [
              { type: 'delay', value: 600.0 },
              { type: 'true_state', field: 'hpi_active', direction: 'is_true' },
              { type: 'true_state', field: 'block_valve_open', direction: 'is_true' },
            ] }, goto: 'p3_end_bleed_watch' },
        ] },

      // Deviation 2 vindication — the inferred tailpipe catch (Spec §6: no
      // detection needed; early closure IS the evidence).
      { id: 'p3_b14_early',
        trigger: { type: 'delay', value: 1.5 },
        speed: 1,
        dialogue: [
          { speaker: 'supx',
            learning: 'You just shut the PORV block valve. On a valve the board says is already closed. …And the pressure\'s turning around, which means you were right and the light\'s a liar. I\'m guessing you saw the tailpipe temperature too — 150 degrees behind a "shut" valve. Good call. Now finish it: this system bled for a while, so keep injection on until the pressurizer and the subcooling margin both make sense again.',
            industry: 'Block valve shut — against a closed-indicating PORV. Pressure responding; the indication was false and you called it. The tailpipe temperature, I take it — 150 °C downstream of a "closed" valve. Well read. Now complete the recovery: maintain injection until PZR level and subcooling margin reconcile.' },
          { speaker: 'aux',
            learning: 'Tailpipe\'s been hot since the trip… it was right there the whole time. Nice one.',
            industry: 'Tailpipe elevated since the trip — indication was available throughout. Well caught.' },
        ],
        branches: jump('p3_b16_resolution') },

      // The historical identification (~06:20), if the player let it ride.
      { id: 'p3_b15_ident',
        time_skip: true,   // authored compressed stretch -- the ONLY place the elapsed-time divider renders
        story_min: 147,
        trigger: { type: 'delay', value: 1.0 },
        speed: 1,
        dialogue: [
          { speaker: 'aux',
            learning: 'Boss — the tailpipe temperature. Downstream of the relief valve. It reads 150 degrees against an 80-degree baseline. That valve never reseated — it\'s been open this whole time. We\'ve been draining the primary all night.',
            industry: 'Supervisor — PORV tailpipe temperature: 150 °C against ~80 baseline. The PORV never reseated. We\'ve had an open relief path the entire event.' },
          { speaker: 'sup',
            learning: 'Two hours. Two hours out the top of the pressurizer, behind a dark light. There\'s a block valve upstream of the PORV — SHUT IT. And get injection back on. You\'re on the board — move.',
            industry: 'Two hours of relief flow behind a demand-signal light. The PORV block valve is upstream — shut it NOW, and restore HPI. Your panel — execute.' },
        ],
        branches: [
          { trigger: TRIG.isolated, goto: 'p3_b15b_late_done' },
          { trigger: { type: 'inaction', window: 120.0 }, goto: 'p3_b15c_crew_does' },
        ] },

      { id: 'p3_b15b_late_done',
        trigger: { type: 'delay', value: 1.5 },
        dialogue: [
          { speaker: 'supx',
            learning: 'Block valve\'s shut — leak\'s over. Keep injection on and refill what we lost. Whatever the core took tonight, it stops taking it now.',
            industry: 'Isolation confirmed — relief path terminated. Maintain injection and restore inventory. Damage accumulation ends here.' },
        ],
        branches: jump('p3_b16_resolution') },

      // The graceful historical outcome: the player let the whole night run;
      // the crew terminates at the historical mark, exactly as in 1979.
      { id: 'p3_b15c_crew_does',
        trigger: { type: 'delay', value: 1.5 },
        commands: PHYS.isolate.commands,
        speed: 60,   // 60x, was 10 (#408): the refill to subcoolRestored runs the real hours
        dialogue: [
          { speaker: 'sup',
            learning: 'Fine — my hands then. Block valve driving shut, injection back on. When I hand somebody the board, I expect them to use it.',
            industry: 'Taking the action myself: block valve shut, HPI restored. When you\'re handed the panel, use it.' },
        ],
        branches: [
          { trigger: TRIG.subcoolRestored, goto: 'p3_end_hist' },
        ] },

      // -------------------------------------------- resolution: grade the PLANT
      { id: 'p3_b16_resolution',
        trigger: { type: 'delay', value: 2.0 },
        speed: 10,
        dialogue: [
          { speaker: 'sup',
            learning: 'Now we find out what kind of night this was. Watch the pressure and the subcooling margin with me — I\'m running the clock while the plant answers.',
            industry: 'Recovery assessment. Track pressure and subcooling margin — accelerating while the plant responds.' },
        ],
        branches: [
          { trigger: { type: 'all', triggers: [
              TRIG.subcoolRestored,
              { type: 'true_state', field: 'fuel_damaged', direction: 'is_false' },
              { type: 'true_state', field: 'core_inventory_pct', direction: 'above', value: 85.0 },
            ] }, goto: 'p3_end_full' },
          // PLUGGED routes on the FACTS its card narrates, not on the margin (#407,
          // 2026-08-06). It used to require `subcoolRestored` — and that trigger was
          // RIDING THE DECEPTION this scenario teaches: with the block valve shut and
          // no injection the closed RCS repressurizes, Tsat(P) climbs, and the OLD
          // bulk margin read "+restored" over a core sitting FULLY UNCOVERED at 41 %
          // inventory with clad climbing ~19 °C/min (measured on this exact path).
          // The core-exit datum refuses that reading — margin stays LOST until water
          // goes in — so the route is now: isolated, undamaged, and injection never
          // restored. The `hpi_active is_false` leg is load-bearing: without it this
          // row catches the FULL-SAVE path mid-refill (isolated + re-injecting, inv
          // still ≤ 85) before the full row's own conditions come true.
          { trigger: { type: 'all', triggers: [
              TRIG.isolated,
              { type: 'true_state', field: 'fuel_damaged', direction: 'is_false' },
              { type: 'true_state', field: 'hpi_active', direction: 'is_false' },
            ] }, goto: 'p3_end_plugged' },
          // LATE routes on the FACTS its card narrates, the same re-key PLUGGED got
          // (#407) and for the same reason a second time (2026-08-07, #408 real
          // flows): post-damage the core-exit TC keeps the margin LOST until the
          // dry core is re-covered, and at the honest high-pressure HPI trickle
          // that is HOURS — no branch window can wait for it. The card's facts:
          // the leak is isolated, injection is back in, and the core was damaged
          // before the hands moved. `hpi_active is_true` keeps this row off the
          // PLUGGED path (isolated, undamaged, never re-injected) and the damage
          // requirement keeps it off the FULL-SAVE path.
          { trigger: { type: 'all', triggers: [
              TRIG.isolated,
              TRIG.fuelDamaged,
              { type: 'true_state', field: 'hpi_active', direction: 'is_true' },
            ] }, goto: 'p3_end_late' },
          { trigger: { type: 'inaction', window: 900.0 }, goto: 'p3_end_bleed_watch' },
        ] },

      // ---- Ending: full save --------------------------------------------------
      { id: 'p3_end_full',
        trigger: { type: 'delay', value: 1.5 },
        speed: 1,
        dialogue: [
          { speaker: 'aux',
            learning: 'Pressure\'s normal. Subcooling margin\'s wide. Inventory\'s back where it belongs, generators are fed… boss, the board is *green*. It\'s just a plant again.',
            industry: 'Pressure nominal, subcooling margin restored, inventory recovered, SGs fed. Board is clean. Stable plant.' },
          { speaker: 'supx',
            learning: 'Sit with that a second, both of you. A stuck relief valve behind a lying light, emergency feed gated shut behind a tag, a level gauge doing its best to fool us — and what we got was an eventful shift and a repair list. No dry generators. No boiled-off primary. No damaged core. I\'ve stood a lot of watches, mister, and nights like the one this could have been… they don\'t usually get caught. Not like this. Whatever they\'re teaching where you came from — it worked. The paperwork will say "reactor trip, stuck PORV, isolated." It won\'t say what didn\'t happen. But I\'ll know. Fine watch. Damn fine watch.',
            industry: 'Take stock: stuck-open PORV behind false indication, AFW gated shut under clearance, misleading PZR level — and the outcome is an eventful shift and a work-order list. No dry SGs, no inventory excursion, no core damage. Events with this failure set do not ordinarily resolve this way. The log will read "trip, stuck PORV, isolated" — it will not record what was prevented. Noted here regardless: a fine watch.' },
        ],
        level_complete: {
          title: 'Second Watch — An Eventful Shift',
          outcome_learning: 'You changed history. Tag pulled, injection defended, leak isolated — the same trap that consumed TMI-2 became a maintenance story. In 1979 the same knowledge existed; it was twenty minutes away at Davis-Besse. You just showed what it was worth.',
          outcome_industry: 'Full prevention: AFW restored early, HPI maintained, relief path isolated pre-uncovery. The TMI-2 failure set resolved as a reportable event with no damage. The discriminating knowledge existed in 1979 (Davis-Besse precedent); this run demonstrates its value.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },

      // ---- Ending: plugged but never refilled ---------------------------------
      { id: 'p3_end_plugged',
        trigger: { type: 'delay', value: 1.5 },
        speed: 1,
        dialogue: [
          { speaker: 'supx',
            learning: 'You plugged the hole — good. Now look at the subcooling margin: still LOST, and it is not lying to you this time. The water you bled away is *gone*, the core is sitting partly dry, and pressure coming back does not put it back. Isolation was half the job. Get injection on and refill this plant, mister — a save isn\'t finished until the core is under water.',
            industry: 'Leak isolated — correct. Subcooling margin remains LOST and the core-exit thermocouples are why: inventory is not recovered and the core is partially uncovered. Rising pressure does not restore level. Isolation is half of the terminating pair. Restore injection and recover inventory immediately.' },
        ],
        level_complete: {
          title: 'Second Watch — Plugged, Not Refilled',
          outcome_learning: 'You stopped the leak in time — but the water you lost is still gone, and the margin gauge is telling you so. Half of the terminating pair is isolation; the other half is injection. History needed both. So do you.',
          outcome_industry: 'Leak isolated pre-damage but inventory not restored — the terminating action pair (isolate + inject) was applied by half. Core-exit temperatures confirm degraded cooling; recovery margin remains degraded until injection is restored.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },

      // ---- Ending: late catch, core damaged ------------------------------------
      { id: 'p3_end_late',
        trigger: { type: 'delay', value: 1.5 },
        speed: 1,
        dialogue: [
          { speaker: 'sup',
            learning: 'It\'s holding. Pressure\'s back, the margin\'s real again — and I\'m not going to pretend that\'s the whole story. The core ran uncovered before we shut that valve. Cladding went where cladding fails. We ended it — later than we could have, sooner than they did in the history I\'m glad you don\'t know — but this plant is damaged, and the log will say so in plain words.',
            industry: 'Plant stable: pressure and subcooling restored. The record will also state: the core sustained a period of uncovery prior to isolation and clad temperatures exceeded failure limits. Terminated late — though not as late as it might have been. Core damage stands.' },
        ],
        level_complete: {
          title: 'Second Watch — Caught Late',
          outcome_learning: 'You terminated the event — after the core had already begun to fail. The trap wasn\'t catching you; the clock was. Every honest signal (subcooling at zero, the hot tailpipe) was available from the first half hour. Rewind and see how early you can believe them.',
          outcome_industry: 'Event terminated post-damage-onset. The discriminating indications (saturated subcooling margin, elevated tailpipe temperature) were available from the first minutes. Earlier isolation converts this outcome entirely.',
          actions: ['continue', 'retry', 'rewind'],
        },
        advance: 'end' },

      // ---- Ending: never isolated (timeout) -------------------------------------
      { id: 'p3_end_bleed_watch',
        trigger: { type: 'delay', value: 0.5 },
        branches: [
          { trigger: TRIG.fuelDamaged, goto: 'p3_end_hist' },
          { trigger: { type: 'delay', value: 2.0 }, goto: 'p3_end_bleed' },
        ] },

      { id: 'p3_end_bleed',
        trigger: { type: 'delay', value: 1.0 },
        speed: 1,
        dialogue: [
          { speaker: 'sup',
            learning: 'Here\'s where we stand: the core is covered because injection is winning, and ONLY because injection is winning. That relief line is still passing water we never get back. This isn\'t stable, mister — it\'s a tug-of-war we happen to be ahead in. Find me the hole and CLOSE it. The block valve is right there on the relief line.',
            industry: 'Current state: core covered solely on injection margin — losses through the open relief path continue. This is sustained make-up against an unisolated leak, not a stable plant. Identify and isolate: the PORV block valve is available.' },
        ],
        level_complete: {
          title: 'Second Watch — Holding, Not Won',
          outcome_learning: 'Your injection kept the core safe — that alone beats 1979. But the leak never got isolated: the plant survives only as long as the pumps outrun the hole. The block valve was the other half of the answer. Retry and finish it.',
          outcome_industry: 'HPI maintained — no damage (already superior to the historical response). Relief path never isolated: the plant is stable only on continuous make-up. Isolation completes the termination. Retry available.',
          actions: ['continue', 'retry', 'rewind'],
        },
        advance: 'end' },

      // ---- Ending: the historical outcome, graceful ------------------------------
      { id: 'p3_end_hist',
        trigger: { type: 'delay', value: 1.0 },
        speed: 1,
        dialogue: [
          { speaker: 'sup',
            learning: 'Log it the way it happened: relief valve stuck open behind a closed indication, injection secured on the level gauge, core uncovered, fuel damaged. The same night they had in 1979 — and this time the answers were in the room. If there\'s a next time, use them. Rewind is right there.',
            industry: 'Record as occurred: PORV stuck open behind false indication, HPI secured on PZR level, core uncovery, fuel damage. The historical outcome — with the discriminating knowledge available in the room. Rewind and apply it.' },
        ],
        level_complete: {
          title: 'Second Watch — History Repeated',
          outcome_learning: 'The night played out the way it did in 1979. You had what the real crew never got — the whole answer key — and the plant is damaged anyway. That\'s worth sitting with. Then rewind: the tag, the injection, the block valve. Any one of them changes the ending.',
          outcome_industry: 'Historical outcome reproduced despite full prior knowledge. The three interventions (AFW restoration, sustained HPI, early isolation) each independently improve the end state. Rewind recommended.',
          actions: ['continue', 'retry', 'rewind'],
        },
        advance: 'end' },

      // -------------------------------------------- deviation 3 pushback (jump-back)
      // Reached only from p3_b9_order's inaction branch; jumps back into the
      // main chain at the watch. Placed after the endings so the linear chain
      // never falls into it.
      { id: 'p3_b10_refused',
        trigger: { type: 'delay', value: 1.0 },
        dialogue: [
          { speaker: 'supx',
            learning: 'I gave you an instruction, mister. Injection is still running and that level is still climbing. You want to tell me why my new operator is ignoring the one thing every trainer beat into both of us — or are we just freelancing tonight?',
            industry: 'You were given an instruction. HPI remains in service against a rising PZR level. If you have a basis for contradicting solid-plant guidance, state it. Otherwise this is freelancing.' },
          { speaker: 'aux',
            learning: 'Boss — for what it\'s worth, pressure\'s still LOW. Whatever that level gauge thinks we\'re full of, the pressure doesn\'t agree. Maybe the water\'s not staying where the gauge says it is.',
            industry: 'Supervisor — pressure remains low. Level and pressure still don\'t reconcile. Inventory may not be where the level implies.' },
          { speaker: 'supx',
            learning: '…Low pressure, high level. Fine. FINE. Injection stays — on your head. But you two now own the job of explaining this board to me before it explains itself. Eyes moving. Everything.',
            industry: '…Level-pressure inconsistency acknowledged. HPI remains in service — your call, your accountability. Now reconcile this board for me. Full scan.' },
        ],
        branches: jump('p3_b11_watch', 2.0) },
    ],
  };

})(globalThis.RD || (globalThis.RD = {}));
