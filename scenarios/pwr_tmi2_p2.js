/*
 * pwr_tmi2_p2.js — TMI-2 Part 2: "Under a Microscope" (M5 TMI2 Spec §5).
 *
 * The same RD.TMI2 timeline replayed on the LEARNING synoptic with the physics
 * overlay on — full color, true-position ghost animations, true inventory and
 * void numbers. Chief (the teaching voice, not an in-fiction character) walks
 * each Part 1 beat: what the board showed, what the plant was doing, and WHY
 * the two differed. HR1 is stated explicitly (Spec §8.7). Ends on the
 * Davis-Besse comparison and the hand-off into Part 3.
 */
;(function (RD) {
  'use strict';

  var T2 = RD.TMI2, PHYS = T2.PHYS, TRIG = T2.TRIG;
  function ack(delayS) {
    return { type: 'any', triggers: [{ type: 'manual' }, { type: 'delay', value: delayS || 150 }] };
  }

  RD.SCENARIOS = RD.SCENARIOS || {};
  RD.SCENARIOS.pwr_tmi2_p2 = {
    id: 'pwr_tmi2_p2',
    title: 'TMI-2 · Part 2 — Under a Microscope',
    plant_id: 'pwr',
    design_version: null,
    initial_state: 'hot_full_power',
    mode: 'guided',
    chat: true,
    description: 'The same night, replayed with the truth showing — what the board said vs. what the plant did.',
    ui_policy: { synoptic: 'learning', overlay: true, tag: 'afw_tag' },
    setup_commands: T2.PHYS.setup,

    interactions: {
      afw_tag: {
        request: {
          learning: 'That maintenance tag — this is the one from Part 1, isn\'t it?',
          industry: 'Confirming — this is the AFW clearance tag from Part 1?',
        },
        responses: [
          { speaker: 'chief',
            learning: 'That\'s the one. A cardboard tag, hung by the previous shift, covering the one indication that would have told them the emergency feed valves were shut. Remember where it hangs. In Part 3, the sooner it comes off, the more of this night you get to un-live.',
            industry: 'Affirmative. The surveillance clearance tag, occluding the AFW discharge valve position indication. Note its location — early removal is the highest-leverage action available in Part 3.' },
        ],
        repeat: [
          { speaker: 'chief',
            learning: 'Still just a tag. Still hiding the same valve. Keep it in mind.',
            industry: 'Unchanged. Same tag, same masked indication.' },
        ],
      },
    },

    beats: [

      { id: 'p2_b0',
        story_min: 0,
        trigger: { type: 'time', value: 1.5 },
        gate: {
          allow_actions: ['acknowledge_alarm', 'acknowledge_all_alarms'],
          message: {
            speaker: 'chief',
            learning: 'Not this time — this is a replay, not a shift. Your job here is to watch with the lights on. You get the controls back in Part 3.',
            industry: 'Replay mode — no manipulations. Controls return in Part 3.',
          },
        },
        dialogue: [
          { speaker: 'chief',
            learning: 'Chief again. Look at your board — same plant, same 4 AM, but I\'ve turned the lights on. Full color, flow animation, and the physics overlay: those extra numbers are the TRUE state of the plant, straight from the physics — core inventory, void fraction, things no gauge in a real control room ever shows you.',
            industry: 'Chief. Same plant, same initial condition — Learning synoptic active with the physics overlay: true core inventory, true void fraction, true valve positions. Ground truth alongside the indications.' },
          { speaker: 'chief',
            learning: 'One rule runs this whole simulator, and tonight is its showcase: every gauge, every alarm, every automatic protection system reads INSTRUMENTS — never the physics itself. When an instrument lies, everything built on it lies with it: the display, the annunciator, the operator, the procedure. That is the rule the industry calls out of Three Mile Island.',
            industry: 'The governing rule (HR1): all indications, alarms, and protection logic read instruments, never true state. A failed instrument therefore corrupts every layer above it — display, annunciation, operator action, procedure. TMI-2 is the canonical case.' },
          { speaker: 'chief',
            learning: 'Two honesty notes before we roll. First: this simulator compresses the physics — what took the real crew two hours and twenty minutes runs here in about twenty. The clock in this log keeps the REAL times, because the durations are part of the lesson. Second: this plant has one sensor per reading, no backups — a real plant votes two or three sensors, so one liar does less damage there than it does here. Keep both in mind.',
            industry: 'Model honesty: (1) the physics timeline is compressed ~7:1 — the transcript clock preserves historical times, which are themselves instructional. (2) No sensor redundancy is modeled — single-channel indication makes a failed sensor more consequential than in a voted plant.' },
        ],
        advance: 'wait_for_trigger' },

      { id: 'p2_b1',
        story_min: 7,
        trigger: ack(),
        chat_button: { style: 'ack', label_learning: 'Roll it.', label_industry: 'Commence replay.' },
        inject_failures: PHYS.lofw.inject_failures,
        highlight: { view: null, control_label: 'AFW', instrument_id: null },
        dialogue: [
          { speaker: 'chief',
            learning: 'Rolling. 04:00 — the condensate polishers choke, the feed pumps trip, and the steam generators start boiling dry. Now watch the emergency feedwater train, bottom of the diagram: the pump status says RUNNING — that\'s TRUE, the pumps really are spinning. But look at the pipe. No flow. The discharge valves behind that maintenance tag are shut, and the water is going nowhere.',
            industry: 'T+0: condensate polisher transient, main feedwater lost, SG inventory boiling off. Observe the AFW train: pump status RUNNING is a truthful indication — but delivered flow is zero. The tagged-shut discharge valves deadhead both pumps.' },
          { speaker: 'chief',
            learning: 'This is the first gap of the night: the board said "emergency feed is working" and the crew believed it — reasonably. The lie wasn\'t even a broken sensor this time. It was a true reading of the wrong thing: pump running is not water moving.',
            industry: 'Gap #1: indication semantics. AFW RUNNING reported pump state, not delivered flow. A truthful indication of the wrong variable — the crew\'s inference "AFW running ⇒ SGs fed" failed at the inference step.' },
        ],
        advance: 'wait_for_trigger' },

      { id: 'p2_b2',
        story_min: 8,
        trigger: TRIG.scram,
        commands: PHYS.porvLift.commands,
        dialogue: [
          { speaker: 'sys',
            learning: '*HORN* — REACTOR TRIP',
            industry: '*HORN* — REACTOR TRIP' },
          { speaker: 'chief',
            learning: 'Reactor trip — dry steam generators, no heat sink, the protection system does its job. And there goes the PORV, the relief valve on top of the pressurizer, venting the pressure bump from the trip. Watch the relief line on the diagram: that flashing flow is REAL steam leaving the REAL plant. Everything to this second is a machine working exactly as designed.',
            industry: 'Trip on low SG level — correct protective action. PORV lifts on the trip transient; the animated relief flow is actual discharge. To this point the plant response is entirely per design.' },
        ],
        advance: 'wait_for_trigger' },

      { id: 'p2_b3',
        story_min: 8,
        trigger: TRIG.reseatMoment,
        inject_failures: PHYS.porvStick.inject_failures,
        commands: PHYS.porvStick.commands,
        speed: 1,
        dialogue: [
          { speaker: 'chief',
            learning: 'FREEZE this moment in your head — 04:01, thirteen seconds after the valve lifted. The close signal just went out. The indicator light went dark. And the valve… look at the diagram. See the ghost flow still running through the relief line? The valve did NOT close. It is stuck open, and it will stay open for the next two hours and twenty minutes.',
            industry: '04:01 — the event\'s pivot. Close demand issued; indication extinguished; valve remains open. The Learning ghost animation shows continuing relief flow. This relief path stays open for the next ~2 h 20 m.' },
          { speaker: 'chief',
            learning: 'Why did the light lie? Because it never measured the valve. It was wired to the close SIGNAL — the electrical command — not to the valve stem. Signal sent, light out, "valve closed." The board displayed the plant\'s intention and called it reality. That\'s the instrument rule biting: the annunciator that says PORV OPEN reads that same indicator, so it stayed dark too. No alarm in that control room knew the valve was open, because no INSTRUMENT knew.',
            industry: 'The indication was demand-signal based — solenoid state, not stem position. Commanded state displayed as actual state. Per HR1, the PORV OPEN annunciator reads the same indication: with the indicator reporting closed, no alarm in the plant could annunciate the open valve. The failure was invisible to every automatic system.' },
        ],
        advance: 'wait_for_trigger' },

      { id: 'p2_b4',
        story_min: 11,
        trigger: TRIG.pzrLevelHigh,
        dialogue: [
          { speaker: 'chief',
            learning: 'Now the cruelest instrument of the night. The pressurizer level gauge is climbing — the crew is watching it climb right now — and look at the overlay: TRUE core inventory is FALLING. Both are happening at once. The system is boiling. Steam bubbles are forming in the loops and shoving water up into the pressurizer — the one tank the crew can see. The gauge isn\'t broken. It\'s reading displaced water and the crew read it as extra water.',
            industry: 'The critical divergence: PZR level rising while true RCS inventory falls — simultaneously. Loop voiding displaces liquid into the pressurizer (void-driven insurge). The level instrument is functioning correctly; the inference "level ⇒ inventory" is what failed. Overlay shows the true inventory trend.' },
          { speaker: 'chief',
            learning: 'And on that reading, the crew made the decision the whole industry now studies: they shut off the emergency injection. Watch — I\'m replaying it. Their training said never let the pressurizer go solid, and the gauge said solid was coming. Given what the board told them, it was a defensible call. Given what the plant was doing, it removed the one system that was saving the core. Both of those are true at once. That\'s the lesson.',
            industry: 'Replaying the historical action: HPI secured on high PZR level, per solid-plant avoidance training. Defensible against the indicated state; catastrophic against the true state. Both propositions hold — that is the case study.' },
        ],
        advance: 'wait_for_trigger' },

      { id: 'p2_b5',
        story_min: 13,
        trigger: ack(),
        chat_button: { style: 'ack', label_learning: 'Show me what it cost.', label_industry: 'Continue the replay.' },
        commands: PHYS.hpiSecure.commands,
        speed: 30,
        dialogue: [
          { speaker: 'chief',
            learning: 'Injection secured. Now I\'ll run the clock — watch the true inventory number on the overlay, nothing else. Every percent that ticks away is water leaving through a valve the board swears is shut. The crew watched this same stretch of time and saw a full pressurizer and a quiet board.',
            industry: 'HPI secured; accelerating time. Track true inventory on the overlay — the continuous loss is PORV discharge behind a closed-indicating valve. The indicated picture through this stretch: PZR level pegged high, board quiet.' },
        ],
        advance: 'wait_for_trigger' },

      { id: 'p2_b6',
        story_min: 60,
        trigger: { type: 'true_state', field: 'core_inventory_pct', direction: 'below', value: 50.0 },
        clear_failures: PHYS.afwRestore.clear_failures,
        speed: 1,
        dialogue: [
          { speaker: 'chief',
            learning: 'Stop. Look at the overlay: true inventory is under half. The top of the core is uncovering — fuel rods designed to live underwater are standing in steam right now. Meanwhile the crew HAS fixed one thing: around 04:08 they found the shut emergency feed valves — eight minutes of dry steam generators, traced back to that tag — and got feed going. It helped the secondary side. It could not refill the primary. The hole was still open.',
            industry: 'True inventory < 50 % — core uncovery in progress; clad-to-steam heat transfer collapsing. Historical parallel action: AFW discharge valves discovered shut at ~04:08 (the tagged lineup) and reopened — secondary heat sink restored. Irrelevant to primary inventory; the relief path remains open.' },
          { speaker: 'chief',
            learning: 'From here the fuel does what uncovered fuel does: it heats. Steadily, quietly, no alarm for it — there is no "core uncovering" gauge on this board or any 1979 board. The only witnesses are the subcooling margin, sitting at zero, and a tailpipe thermometer nobody has looked at yet.',
            industry: 'Uncovered fuel now heats on decay power. No direct uncovery indication exists — witnesses are the saturated subcooling margin and the unexamined PORV tailpipe temperature.' },
        ],
        advance: 'wait_for_trigger' },

      { id: 'p2_b7',
        story_min: 120,
        trigger: TRIG.fuelDamaged,
        speed: 1,
        dialogue: [
          { speaker: 'chief',
            learning: 'There. Right there — cladding just crossed its failure temperature. That is the moment Three Mile Island became a name everyone knows. Not the stuck valve at 04:01, not the secured injection at 04:05 — those set the trap. THIS is when the core itself began to fail, better than an hour later, while the board still showed a full pressurizer. Plenty of time to catch it. Nobody had the one number that mattered.',
            industry: 'Clad temperature has exceeded the failure threshold — fuel damage onset. Note the latency: the initiating failures occurred within the first five minutes; damage onset is over an hour later. The interval was recoverable throughout — the discriminating indication simply was not being read.' },
        ],
        advance: 'wait_for_trigger' },

      { id: 'p2_b8',
        story_min: 147,
        trigger: ack(),
        chat_button: { style: 'ack', label_learning: 'And the catch?', label_industry: 'Show the termination.' },
        commands: PHYS.isolate.commands,
        speed: 30,
        dialogue: [
          { speaker: 'chief',
            learning: '06:20. A fresh pair of eyes walks into the room, does what fresh eyes do — reads the board without last night\'s story in his head — and lands on the tailpipe temperature: 150 degrees downstream of a "closed" valve. Two minutes later the block valve is shut and the leak is over. I\'m replaying that now: block valve closed, injection back on. Watch the plant come back to life.',
            industry: '06:20 — shift change brings an unbiased read of the board. PORV tailpipe temperature: ~150 °C downstream of a closed-indicating valve. 06:22: block valve shut — event terminated. Replaying: isolation + HPI restored. Observe the recovery.' },
        ],
        advance: 'wait_for_trigger' },

      { id: 'p2_b9',
        story_min: 150,
        trigger: TRIG.subcoolRestored,
        speed: 1,
        dialogue: [
          { speaker: 'chief',
            learning: 'Pressure recovers, subcooling comes back, the core re-floods — in minutes. The same two actions at 04:10 instead of 06:22 and this is a footnote, not a chapter. Now, one more name for you: Davis-Besse. Eighteen months EARLIER, a nearly identical plant in Ohio had the exact same failure — same valve, same lying light, same climbing pressurizer. Their crew caught the tailpipe temperature in about twenty minutes and shut the block valve. Minor event, no damage, barely a headline. Same trap, twenty minutes versus eighty. The difference wasn\'t the hardware. It was whether anyone believed one hot pipe over one dark light.',
            industry: 'Isolation restores pressure and subcooling within minutes — the terminating pair (isolate + inject) was available from T+5 min. Precedent: Davis-Besse, Sept 1977 — same PORV failure mode, same misleading indication; tailpipe temperature identified in ~20 min, block valve shut, no damage. TMI-2 ran ~80 min to identification. Identical trap; the variable was indication interpretation, not equipment.' },
          { speaker: 'chief',
            learning: 'Two things this simulator does not show you, said plainly: the containment side of the accident — the hydrogen burn, the releases — is not modeled here; the story ends at fuel damage. And the melted fuel itself is a lump in this model — the real core damage was messier. What IS faithful is the physics of the trap. Which brings us to Part 3: same shift, same board, same lying light — and this time, YOUR hands. The goal isn\'t to spot the tricks. You know the tricks. The goal is to stabilize the plant. Go change history.',
            industry: 'Model boundaries, stated: containment phenomena (hydrogen combustion, releases) are not modeled — simulation terminates at fuel damage; the damage model is lumped. The trap physics are faithful. Part 3: identical scenario, full control authority. Objective: plant stabilization. Proceed.' },
        ],
        level_complete: {
          title: 'Part 2 — Under a Microscope',
          outcome_learning: 'The gaps, explained: a run light that wasn\'t a flow meter, a valve light wired to a signal, a level gauge reading displaced water — and every alarm downstream of them just as blind. Instruments, never truth. Part 3 gives you the same night with your hands on the board.',
          outcome_industry: 'Replay complete: indication-semantics failure (AFW), demand-signal indication (PORV), void-driven PZR level insurge, and HR1 propagation through annunciation. Davis-Besse precedent covered. Part 3 grants full control authority on the identical timeline.',
          actions: ['continue', 'retry'],
        },
        advance: 'end' },
    ],
  };

})(globalThis.RD || (globalThis.RD = {}));
