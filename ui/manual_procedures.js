/*
 * ui/manual_procedures.js — authored operator procedures (→ RD.MANUAL_PROCEDURES),
 * keyed by profile (pwr / rbmk_pre / rbmk_post / bwr). SINGLE INTEGRATED VOICE.
 *
 * These are AUTHORED but ENGINE-VALIDATED, and they are the Instructor's (M6)
 * source of truth: `test/run_procedures.js` drives each procedure through its engine
 * and checks each step's `acc` (acceptance) predicate + the proc-level `guard`. The
 * same predicates are what the Instructor will gate and grade on — one artifact.
 *
 * Procedure: { id, category, title, purpose, from, prereq[], cautions[], steps[], guard, outcome }
 *   category: startup | power | control | shutdown | emergency | accident
 *   narrative:true  → an accident walkthrough; not run by the harness (the engine
 *                     flagship suite owns its physics, CONTEXT §9).
 * Step: { text, control, target, cmd, hold, acc, saw, note, ramp, why, accs, accs_ordered,
 *          wait_hint, wait_speed, overtaken, hl, hl_watch, press_expected, expect_alarms, past, story, crew,
 *          inject, clear,
 *          pause, wrong,
 *          wait_est_s }
 *   (THE DEBT #694 LEFT IS PAID (#755): all 24 names on that line are documented below. MEASURED
 *   on the built pool rather than counted by hand — which is how this note came to claim 12 of
 *   19, then 20 — 22 of them are in use; `clear` and `wrong` are implemented and unused. A step
 *   field not on this line does not exist; add yours here, with a paragraph, in the same change.)
 *   text    integrated-voice instruction     control  on-screen control to use
 *   target  the value/limit to drive to      cmd      command issued (rod group 'control'/'shutdown' resolved)
 *   hold    seconds to run after the command  acc      {p,op,v[,tol]} checked at END of the step
 *   saw     {p,op,v} true at least once during the step   note  caution / what to watch
 *   why     OPTIONAL layman's teaching prose (#244 items 2/9) — the card's collapsible
 *           fourth block. `text` stays the concise action; `why` carries the what-and-why
 *           for someone new to the sim. Never load-bearing: harnesses ignore it.
 *   hl      OPTIONAL array of control/indication labels the step glows on hover, when the
 *           step's own `control` isn't the (only) thing to look at. Falls back to `[control]`.
 *           IT MEANS "ACT ON THIS" (#685) — the active step draws it with the PULSING
 *           `.ckl-step-glow`, which is #607 item 3's ruling and stays.
 *   hl_watch OPTIONAL array, same vocabulary as `hl`, meaning "WATCH THIS WHILE YOU DO IT"
 *           *(OWNER, 2026-09-09, #675 section B: "Each step should highlight the important
 *           indications to watch with a non pulsing green glow.")*. The active step draws
 *           these with `.ckl-watch-glow` — steady, and a DASHED ring rather than the solid
 *           halo, because two treatments that differ only by animation are not a distinction a
 *           player can read on a board of 50+ elements (DESIGN_CRITERIA question 4, the veto).
 *           A label belongs in ONE of the two lists: both would draw two rings on one element,
 *           and `run_manual_controls` reddens on the overlap as well as on a label the board's
 *           vocabulary does not carry.
 *   press_expected OPTIONAL boolean — THIS STEP ASKS FOR A PRESS EVEN THOUGH NOTHING GRADES ONE
 *           *(OWNER RULING, 2026-09-15: "Move them to the watch ring"; #653 S-3b)*. The pulsing ring
 *           means "act on this", so `ui/app.js` only pulses a step that asks for a press: one
 *           with a `cmd`, or a `cmd`-kind check-off row. That rule is right for the VERIFY steps
 *           the ruling is about and wrong for the CONTINGENCY press — "Check SG FEED reads AUTO.
 *           If it does not, press AUTO" — which wants the ring and is graded on the plant.
 *           Nothing outside the step can tell those apart (the `text` is not parseable), so the
 *           step says so, the way `expect_alarms` does. Three steps in the shipped pool carry it
 *           and all three are conditional presses; `run_manual_controls` reddens on a pwr2 step
 *           that pulses a label without one. DO NOT use it to keep a ring on a pure
 *           verification — that is the defect the ruling exists to remove.
 *   expect_alarms OPTIONAL array of strings — THE ALARMS THIS STEP'S OWN EVOLUTION CAUSES,
 *           which therefore do not interrupt fast-forward *(OWNER RULING, 2026-09-14: "Only
 *           alarms the step is not expecting")*. The service drops the clock to 1x on the first
 *           warning or critical to arrive on a QUIET board (`_attentionStop` via
 *           `_newAlarmOfPriority`, layers/simulation_service.js); an id listed here, or a
 *           case-insensitive substring of the alarm's label, is skipped while THIS step is the
 *           active one. Ids are exact and are what you should write.
 *           ⚠ THE FAILURE MODE IS THE WHOLE FIELD: an alarm declared on a step that does not
 *           cause it is a REAL warning silently disabled, and nothing anywhere says so. So
 *           MEASURE IT — drive the leg, record the clear -> active transitions inside the step's
 *           own window, and declare only what you saw. Recall does not qualify and neither does
 *           another agent's list: the two declarations in this pool were both re-measured on
 *           2026-09-20 and one of the two REASONS that came with them was wrong (see step 11).
 *           Only `critical` and `warning` reach the drop at all (ALARM_DROP_PRIORITIES), so a
 *           `caution` or `status` id buys nothing and is still a claim about causation — do not
 *           list one. Scoped to the ACTIVE step deliberately: a declaration is a statement about
 *           ONE evolution, and letting it outlive the step turns it into a permanent exemption.
 *   past    OPTIONAL {p,op,v} or an array (OR) — "has the plant already done this", used only
 *           by catch-up on checklist load (#607): a player who already performed an early
 *           action is walked past a step whose prose no longer applies, rather than trapped
 *           on it. Read once, at load; the ACTIVE step still grades off `acc`/`saw`/`cmd`.
 *   story   OPTIONAL {clock, saw, knew, did} — the narrative walkthrough's per-step voice
 *           (#670): a story beat rather than an instruction. Published on the checklist
 *           snapshot's `story` block, ACTIVE STEP ONLY, so a gate or headless probe can see
 *           what the card is showing without re-resolving this artifact.
 *   crew    OPTIONAL boolean — this step narrates what the historical crew actually did, not
 *           a recommended action (#670); rendered with its own "as taken, not a recommendation"
 *           tag so a walkthrough can show a wrong decision without teaching it as correct.
 *   inject / clear   OPTIONAL arrays — failures this step fires behind the scenes the tick
 *           after it becomes active (#670 Phase 1): `inject: [{failure, severity, when}]`,
 *           `clear: [{failure, when}]` (or bare id strings). Descend through the SAME
 *           command path a beat's `inject_failures` takes (Hard Rule 7); a refusal is
 *           swallowed with a console warning. See `_checklistFire`
 *           (layers/instructor_layer.js) for the full firing/ordering contract.
 *   pause   OPTIONAL boolean, sibling of `inject`/`clear` (#694) — "for events that the user
 *           does not control... sim pauses" (owner, 2026-09-09). When THIS step's fire lands
 *           (the same tick something in `inject`/`clear` newly fires), the runtime also
 *           requests a service-level pause and marks the step done — the pause itself is the
 *           step's completion condition, in place of `acc`/`saw`/dwell, since sim time is
 *           exactly what a pause stops. Author it on the step that fires the event the player
 *           must SEE happen, not on the narration step before it. One event per step, matching
 *           the owner's own cascade example (polisher / feed pump / turbine as three steps,
 *           not three injects on one). Released by Continue, the checklist's own Rewind, or
 *           Stop — see `ui/app.js` `releaseHold('walkthrough')`.
 *   wrong   OPTIONAL {learning, industry} — overrides the generic "wrong action" commentary
 *           (`_wrongActionText`) shown when a follow-mode operator does something the step
 *           didn't ask for. Falls back to a step-generic template when absent.
 *   wait_est_s  OPTIONAL `false` — drops the "About N plant-minutes" span on a long step's
 *           speed-hint rung while KEEPING the rung itself, for a step whose duration is
 *           genuinely route-dependent rather than a fixed replay dwell. Deliberately separate
 *           from `wait_hint: false`, which drops the whole hint line (#628, #653 S9).
 *   accs    OPTIONAL array — MULTI-CHECK-OFF (#244 item 8). Entries are either
 *           {p,op,v[,tol],label} (an acceptance like `acc`, graded with the same
 *           debounce) or {cmd,label} (a command the operator must be SEEN to issue —
 *           the 1/M "point plotted" case; family-matched like the step's own `cmd`).
 *           The step completes when ALL entries are met. `label` is the card's line
 *           for that entry. When `accs` is present it REPLACES `acc` (author one or
 *           the other; `acc` remains the common single-check case) — and `run_checklist_pwr2`
 *           §2v reddens if a step authors both, because the `acc` is then never read (#739).
 *   accs[].ask  OPTIONAL per-entry INSTRUCTION (#741, the lettered-substep display). `label` is
 *           the DONE-WHEN — "Load target set to 30 MWe" — which is what the card drew for every
 *           entry; on a step that packs three actions into one line that told the player what
 *           the sim was watching for and never what to DO. `ask` carries the action in the
 *           imperative ("Set LOAD to 30 MWe") and the card then draws BOTH: the ask on the lit
 *           row, the done-when under it. Omit it on an entry that is a consequence rather than
 *           an action — a row reading "3b. Generator at 30 MWe" as if it were an instruction is
 *           the defect in the other direction. NO SI (owner ruling 2026-09-06); `run_style`'s
 *           `checklist_no_si` scans this field.
 *           ⚠ IT IS DISPLAY ONLY — nothing grades on it. Whether the letters are also a SEQUENCE
 *           is `accs_ordered`'s business, below; without that flag they are not, and the array
 *           order is only a drawing order. `pwr_startup` 14 ("press LATCH", then "set LOAD") was the
 *           standing example of an unordered step whose prose implied one; since 2026-09-23 it
 *           carries `accs_ordered`, because the second row cannot be true before the first.
 *   accs[].implied_by  OPTIONAL — the `p` of ANOTHER entry in the same `accs` array whose
 *           own threshold already answers this row. While that entry is met, this one latches
 *           too and is flagged `implied` so the card can say "covered by" instead of pretending
 *           the gauge read the number. *(OWNER RULING, 2026-09-18, option B: keep the INTER
 *           RANGE progress row on `pwr_startup` 9 — step 10 since the 2026-09-23 split — and close
 *           the soft-lock it opened.)*
 *           WHAT IT IS FOR: `accs` is a CONJUNCTION, so a row graded on an instrument the player
 *           can break takes the whole step with it — MEASURED, `set_instrument_failure
 *           {intermediate_range, dead}` publishes 1.0e-11 A against a true 8.3e-3 A and step 9
 *           stayed ungradeable with REACTOR POWER reading 99.6 %.
 *           WHAT IT IS NOT: a fail-open on a broken gauge. Nothing here asks whether the channel
 *           is healthy (nothing in the snapshot could answer — `active_failures` is empty under
 *           an instrument failure); it asks whether a NAMED sibling still asserts the step. So
 *           author it only where the implication is a property of the plant you can quote, and
 *           never on the row that carries the step's real acceptance — a step whose ONLY row is
 *           implied grades nothing at all. Ignored on an `accs_ordered` step, where position is
 *           meaning; `run_checklist_pwr2` §2ad reddens if one is authored there.
 *           TWO CONSTRAINTS ON THE SIBLING, neither of which any gate can enforce and both of
 *           which the one shipped instance satisfies (quality pass, 2026-09-18). (a) NAME A
 *           LATCHING SIBLING, not a `~` band or a `steady`/`stopped` row: those re-grade and can
 *           un-tick, and a latch taken by implication is never given back, so the implied row
 *           would stay ticked after the row that justified it had gone off. (b) DO NOT CHAIN. An
 *           implication resolves against the sibling's state in the same pass, so a row implied
 *           by a row that is ITSELF implied lands one broadcast late; author every `implied_by`
 *           against a row that grades its own predicate.
 *   accs_ordered OPTIONAL boolean, OPT-IN, meaningless without `accs` — THE ENTRIES BECOME
 *           LIVE ONE AT A TIME *(OWNER DIRECTIVE, 2026-09-15: "For the early-plot hole, we could
 *           have instructions for substeps not just one line of instruction then multiple
 *           substeps. We could give a line of instruction per substep. We instruct to pull rods to
 *           a count/however many steps. The next substep says to wait for the startup rate to
 *           stabilize. Once the startup rate hits a predetermined number that step checks off.
 *           Then have another substep to plot the 1/m point.")*. Entry `i` cannot LATCH until
 *           every entry before it is met; a cmd-kind entry is deaf to its command until then, so
 *           pressing Plot point before the counts have settled does nothing at all instead of
 *           banking a stale point (#741's standing hole, measured before the fix: the later entry
 *           latched with the earlier one false). Blocked entries still GRADE — `obs` updates and
 *           a `steady` ring fills from the step's start — only the latch waits. A latch already
 *           taken is NOT given back when a predecessor un-ticks, so a re-grading `steady` row that
 *           goes back off holds the STEP open without erasing work the player really did.
 *           DEFAULT OFF, and that is the whole design: most multi-check-off steps are genuinely
 *           unordered (two valves, either order), and making order the default would soft-lock
 *           every one of them whose author listed the rows by importance. The replay honours it
 *           too — `test/procedures_harness.js` issues an ordered step's cmd entries when their
 *           predecessors come true rather than all at step entry, so the gate drives the route
 *           the player has to take. `run_checklist_pwr2` §2x is the injection pair.
 *   accs[].latch  OPTIONAL boolean — A RE-GRADING ROW (`~`, `steady`, `stopped`) THAT LATCHES ONCE
 *           MET, like a `>` row. For the lettered substep whose tick is a MILESTONE the next substep
 *           is built on, when the next substep's own action would re-grade it: `pwr_startup` 9a
 *           (rods still 60 s) un-ticked on every tap 9b asks for, the active substep fell back to
 *           9a, and auto-speed forced 9a's 1× over the 10× wait 9b asks for — after EVERY tap
 *           (2026-09-23 layman playtest S-1, measured: met 100 -> 000 and the rung 10 -> 1 four
 *           seconds after each tap). LEGAL ONLY ON AN `accs_ordered` STEP, and only where a LATER
 *           row of the same step re-asserts the same hold (same `p` and `op`, `v` at least as
 *           long) without the flag — so the step still cannot COMPLETE unless the hold is true at
 *           the end; the latch only stops the drawn tick and the pacing from going backwards.
 *           `run_checklist_pwr2` §2ak gates both halves.
 *   accs[].cont  OPTIONAL boolean — ANOTHER CHECK-OFF OF THE PRECEDING (HEAD) ENTRY, not a
 *           substep of its own (the walkthrough-step-format project, `Blueprint/walkthrough_
 *           steps/02_mode3_to_mode1.md`: one lettered substep, more than one `()` row —
 *           e.g. "plot the point, THEN read the panel's printed prediction"). It draws — still
 *           graded, still its own ✓/○ and done-when — but carries NO letter and NO `ask`: it is
 *           found by walking back from it to the nearest entry that is not `cont`, and that HEAD
 *           entry is what owns the letter, the `ask`, and the three fields below. A one-substep
 *           step with two `cont` check-offs is still ONE part for the letter-suppression rule
 *           (`visN > 1`) — three `accs` rows, one letter's worth of substep.
 *   accs[].note  OPTIONAL string — THE SUBSTEP'S OWN NOTE, on its HEAD entry (never on a `cont`
 *           row — the head already carries it). Draws under the `ask`/done-when, same box as the
 *           step-level `note` in spirit but its own class (`.ckl-crit-note` in ui/shell.css) —
 *           the step-level `note` stays whatever it was; a step built entirely from per-substep
 *           notes simply authors none, and the renderer does not draw an empty one.
 *           Undyed on purpose: it takes whatever colour its row already has (live cobalt, met
 *           green, or the muted grey a not-yet-live `accs_ordered` row wears), so a substep the
 *           sequencer has not reached yet still shows its note — #756's "seeing what is coming"
 *           — quietly, with no second waiting-state style to invent. NO SI (owner ruling
 *           2026-09-06); `run_style`'s `checklist_no_si` scans this field.
 *   accs[].wait_speed  OPTIONAL number, on a HEAD entry — THE SUBSTEP'S OWN RUNG, same snap-to-
 *           the-ladder semantics as the step-level `wait_speed` above, but scoped to whichever
 *           substep is ACTIVE: the one holding the first unmet VISIBLE row (on an `accs_ordered`
 *           step that is exactly the blocking row; on an unordered step, the earliest row still
 *           open). While that substep is active its `wait_speed` WINS over the step's own; once
 *           every row is met, or while the plant is between substeps, the step-level `wait_speed`
 *           (or the 30 s/`hold` rule) takes back over. Absent on every entry ⇒ byte-identical to
 *           a pool that has never seen this field. `ui/app.js` `cklAccsHeadRung`/`cklRungFor`.
 *   accs[].speed_text  OPTIONAL string, on a HEAD entry — THE PROSE for the "Suggested time
 *           warp" line when a bare rung does not say enough (the 9b tap-and-wait substep: "10×
 *           while you wait; back to 1× before every tap"). The card draws "Suggested time warp:
 *           <speed_text, or the snapped wait_speed as N×>" under the substep's note; a substep
 *           with neither field draws no line at all. NO SI (owner ruling 2026-09-06); scanned by
 *           `checklist_no_si` the same way `note` is.
 *   wait_hint OPTIONAL string — rendered as a time-acceleration suggestion on long
 *           steps (#244 M5→3 item 5). Prose only; harnesses ignore it. `false` drops the
 *           generated ⏩ line entirely (#653 S9).
 *   wait_speed OPTIONAL number — THE RUNG THIS STEP IS PLAYED AT (#796), overriding the
 *           30 s rule `RD.CklSpeedHint` derives from `hold`. Since the walkthrough now sets
 *           the speed control itself (ui/app.js `syncCklAutoSpeed`), a step whose safe rung
 *           is NOT the smallest one that clears its dwell in 30 s has to be able to say so —
 *           pwr_startup steps 9 and 10 were the case (10 and 11 since the 2026-09-23 split),
 *           at a measured 10× and 5× against the rule's 60×. It decides the CLOCK only; `wait_hint` still decides the LINE, so a
 *           step may set the rung and keep its own note as the only sentence about it.
 *           Snapped DOWN to a real ladder rung by app.js — the number is a ceiling.
 *           Harnesses ignore it (the replay drives its own dwell).
 *           **DERIVE N, DO NOT PICK IT: `node tools/glance_rung.js <procedure_id> <step>`.**
 *           It reports #753's yardstick — the worst REACTOR POWER change inside one 2.5 s
 *           glance at each rung — over the window auto actually accelerates, plus the wall
 *           clock of any rod pull the step asks for. Picking a rung by eye is the HR12
 *           failure, and #653 S-9 is the record of what it costs.
 *   overtaken OPTIONAL {p,op,v[,tol],text[,industry]} — the plant condition under which
 *           this step NO LONGER APPLIES (#641): graded like `acc` while the step is active,
 *           and when it holds the live checklist checks the step off as 'overtaken', posts
 *           `text` as the instructor's comment and moves on. For a step whose evidence the
 *           plant can make impossible — the 1/M plot once the source range de-energizes.
 *           Replay-side it is ignored: the replay drives the step as authored.
 *   next    (procedure-level) OPTIONAL id of the chain's next checklist — the
 *           completion card offers "Next: <title> ▸ Start" (#244 the round trip).
 *   ramp    [{action, arg, points:[…]}] — a setpoint WALKED along a polyline across
 *           `hold` instead of stepped once: the operator holding the ▼ on a setpoint
 *           box, not typing one number (#310, first used by PWR-N15's cooldown legs).
 *           When present the step's `cmd` is NOT issued — `cmd` stays as the
 *           REPRESENTATIVE action the instructor watches for, and the ramp is what
 *           drives the plant. Replay-side only: the live checklist never issues `cmd`
 *           either (ui/app.js renders text + highlights and grades off `acc`), so a
 *           ramp costs the UI nothing. Both procedure gates implement it.
 *   NOTHING ELSE IS A STEP FIELD. `target` and `control` are the two-column lines above;
 *           `next`, `guard`, `precond`, `outcome`, `outcome_guard`, `prereq`, `cautions`,
 *           `from`, `category`, `manual_ref` and `narrative` are PROCEDURE-level, not per step.
 * guard: { never_melted, never:[{p,op,v}] } checked across the whole run.
 * precond: [{p, op, v, tol, text}] — ENTRY conditions (#395), the machine-checkable
 *   layer under the `prereq` prose: graded live, instrument-first, by the Instructor
 *   while a checklist runs (layers/instructor_layer.js _stepChecklist). Unmet rows
 *   WARN — a banner in the checklist panel plus one instructor comment — and NEVER
 *   block *(OWNER RULING, 2026-08-06: selected "Warn, never block" from three
 *   options put to him — a selection, not verbatim words)*. Distinct from `guard`
 *   (a whole-run invariant) and from `from:` (a harness/reset input, not a check).
 *   `text` is the banner's human line; verdicts ship in the snapshot, prose here.
 * op ∈ >,<,>=,<=,~ (~ within tol of v), and the two BAGGED ops `steady` and `stopped`.
 *   `stopped` — {p, op:'stopped', v:<seconds of no motion>} — "this CONTROL has not moved for
 *   `v` seconds" *(OWNER RULING, 2026-09-17; #761)*. Exact, not inferred: the bag remembers the
 *   last reading and the sim time it changed, and any change at all restarts the clock — there is
 *   deliberately no tolerance, because a tolerance turns a slow ramp into a parked control. LEGAL
 *   ONLY ON A CONTROL-CLASS PARAM (`InstructorLayer.isControlParam`: the rod banks, the flat
 *   `control_state` lineup fields, the operator's trip blocks), because it compares readings for
 *   EQUALITY and only those channels are exact; on a noisy gauge it would read false for ever.
 *   Use `steady` for "this INDICATION has settled". Same `acc`/`accs`-only rule, same re-grading
 *   (a hold claim), and `v` doubles as a minimum dwell from step entry. `run_checklist_pwr2`
 *   §2aa gates both halves. The evaluator is `InstructorLayer.gradeStopped`.
 *   `steady` — {p, op:'steady', v:<fractional drift>, window:<trailing seconds>} — "this
 *   indication has STOPPED MOVING" *(OWNER RULING, 2026-09-15; #755)*. The reading is sampled
 *   into a trailing ring and the mean of the window's older half is compared with the mean of
 *   its newer half; it holds when the relative difference is at or under `v`. The window must be
 *   fully covered before it can hold at all and the ring resets when the step changes, so the
 *   window is also a MINIMUM DWELL — a step carrying one cannot complete inside `window`
 *   seconds. It RE-GRADES rather than latching, like `~`, because "steady" is a hold claim.
 *   `v` is RELATIVE to the window mean (the channel it was built for spans decades); an author
 *   wanting an absolute band wants `~`. LEGAL IN `acc` AND `accs` ONLY — those are the two that
 *   own a per-step state bag; `run_checklist_pwr2` §2w reddens on one authored into `saw`,
 *   `overtaken`, `precond` or a `when` gate rather than letting it read false for ever. The
 *   evaluator is `InstructorLayer.gradeSteady` and BOTH the live runtime and the replay harness
 *   call that one static — see its header for why the halves are averaged.
 */
;(function (RD) {
  'use strict';

  // Reusable observation step (no command). `hl` = control/indication labels the UI
  // glows when the step is hovered in the live checklist (ui/app.js glowLabels).
  // `why` is the expandable details paragraph (#607 item 5); `past` is the catch-up
  // predicate (#607 item 7) — skip this confirm when the plant has already left it.
  /* THE 1/M STEPS ARE OVERTAKEN BY THE SOURCE RANGE SECURING (#641, owner playtest 2026-09-05).
   * PWR2 de-energizes the channel on flux alone at 1e5 cps (pwr2_true_state.js SR_SECURE_CPS,
   * no operator lever by #598 item 7); the plot tool refuses the press from that moment and
   * sends nothing, so a `plot_1m_point` entry can never latch again. Measured: a 49-step burst
   * at the last plot step crosses 20,000 cps and secures the channel 20 s later at 3 DPM, and
   * even the authored route peaks at 9.91e4 cps on the criticality step. One object, shared by
   * all six plot steps, so the wording cannot drift between them. `sr_energized` is a boolean
   * on the wire and `false < 1` is the same test the leg's own confirmation step uses. */
  var SR_OVERTAKEN = {
    p: 'sr_energized', op: '<', v: 1,
    label: 'too late to plot: SOURCE RANGE switched itself off above 1.0e5 counts a second',
    text: 'This point is overtaken: SOURCE RANGE switched itself off above 1.0e5 (100,000) counts a second, so the reactor is critical or about to be. Stop withdrawing and go to the criticality step.',
    industry: 'SOURCE RANGE DE-ENERGIZED ABOVE 1E5 CPS — 1/M APPROACH OVERTAKEN. Remaining plot steps skipped. Hold rods; STARTUP RATE under 1 DPM.',
  };

  function obs(text, acc, note, hl, why, past, hlWatch, extra) {
    var s = { text: text, acc: acc || null, note: note || null, hl: hl || null };
    if (why) s.why = why;
    if (past) s.past = past;
    if (hlWatch) s.hl_watch = hlWatch;   // #685 — "watch this", steady dashed ring
    // any remaining step field, so an `obs` step is not barred from one by arity (#653 S-3b).
    if (extra) for (var k in extra) s[k] = extra[k];
    return s;
  }

  // ---- PWR -----------------------------------------------------------------
  var PWR = [
    // PWR-N01 — commercial pump-heat heatup. Measured full-stack (cold_shutdown
    // IC, default lineup): settles 567.0 °F (297.2 °C) at ~12.3 plant-h (#419 real rates), ρ ≈ −2828
    // pcm, zero rod motion. The old nuclear-from-cold heatup path was removed —
    // not a commercial NOP (heatup is subcritical; approach is hot, N03).
    {
      id: 'pwr_heatup', category: 'startup', manual_ref: 'PWR-N01',
      title: 'Mode 5, Cold Shutdown → Mode 3, Hot Standby — plant heatup (pump heat)',
      purpose: 'Take the plant from Mode 5, Cold Shutdown to Mode 3, Hot Standby on reactor-coolant-pump heat alone: start the RCPs, pressurize to NOP, bottle the steam generator, re-align the SI accumulators, and ride temperature up with the reactor never critical. This is the commercial heatup and what mission "The Big Warm-Up" drives.',
      // #524 (2026-08-31): cold_shutdown is REAL again — the water-property floor moved
      // 0.002 MPa and PWR2 carries a Mode 5 IC (122 degF / 363 psia / 918 ppm). The #532
      // hot_shutdown fence this line wore for a day is retired with the wall that forced it.
      from: 'cold_shutdown',
      prereq: ['Plant in Mode 5, Cold Shutdown: cold (~122 °F / 50 °C), depressurized (~363 psi / 2.5 MPa), subcritical, RHR in service.', 'RCPs available to start (heat source).'],
      // #395 — machine-checkable entry conditions, MEASURED on the cold_shutdown
      // IC (tavg 50.0 °C, 2.50 MPa, power 0): every row reads MET on its own IC.
      precond: [
        { p: 'tavg_c', op: '<', v: 95, text: 'Plant cold — Mode 5 (Tavg ≈ 122 °F / 50 °C)' },
        { p: 'pressure_mpa', op: '<', v: 5, text: 'Depressurized (≈ 363 psi / 2.5 MPa)' },
        { p: 'power_pct', op: '<', v: 1, text: 'Reactor shut down' },
      ],
      cautions: [
        'This heatup runs on REAL rates (#419 wave 1 — the training compression is retired; time acceleration carries the pacing). Measured on THIS engine (2026-08-31, engine-direct): the pumps alone warm the Mode 5 plant at 94.9 °F/hr (52.7 °C/hr) over the first half hour, and at the rated rotor the pump-heat class runs up to 113.7 °F/hr (63.2 °C/hr) — ABOVE the 100 °F/hr administrative limit, so rate compliance is yours: trim the RHR heat exchanger to bleed the excess (the same lever the cooldown throttles). The Pressure SP walks at the sourced 0.23 psi/s heater class.',
        'The heat source is the reactor coolant pumps (pump_heat_frac 0.55 % of rated core heat at full flow) plus the pressurizer heaters. Do NOT pull the CONTROL bank or dilute — Hot Standby means hot AND subcritical, and the control bank stays at its cold-shutdown position the whole way. The SHUTDOWN bank is the exception and has its own step: Mode 5 ships with both banks inserted (measured on this engine: ρ = −5807 pcm on 918 ppm; the bank alone is worth 3676 pcm), and withdrawing the shutdown bank is a prerequisite for the approach to criticality, not part of it.',
        'The steam dump is a COARSE lever at these powers: measured, a 5 % manual dump demand is roughly ten times pump-heat generation and reverses the heatup at −263 °F/hr (−146 °C/hr) anywhere above about 302 °F (150 °C); below ~219.2 °F (104 °C) the same demand only ARRESTS the climb. To slow or hold a heatup, secure the RCP — measured, that takes the rate to 0.004 °F/hr.',
        'Keep the turbine OFF LINE and the dumps SHUT so the SG bottles: heat crossing the tubes then has nowhere to go but into secondary pressure, which rides up with Tavg. A turbine left in FOLLOW opens its governor and takes the whole heat source (~6 % open is enough on pump heat alone). The cold_shutdown IC spawns already off line (#251); the Disconnect Grid step confirms rather than changes.',
        'Step 7 (re-align the SI accumulators) is YOURS, nothing does it for you, and it belongs INSIDE step 6 rather than after it — on the real pressurization clock the compliant 600-to-1000 psi window is ~14 plant-minutes wide (measured: opens ~+9 min, shuts ~+23 min) and closes about an hour and a half before the full pressurization completes. The cold lineup ships them isolated — correct below their 600 psi (4.14 MPa) cover gas — and re-alignment is deliberately procedural *(OWNER RULING, 2026-07-30: "lets leave opening of the accumulators to the procedure instead of auto opening them.")*. Skip it and you reach Mode 1 with no passive injection; the SI ACCUM ALIGNED annunciator (PWR-A32) is silent on this case because shut tanks are what it clears on.',
        'Engage Feed AUTO at the start (step 4) while level is still at its cold 65 %. A standing manual feed demand fills a generator that is not yet boiling. On pump heat the SG barely boils, so AUTO simply holds the captured setpoint — measured, level stays ~65 % across the whole 12 plant-hour ride.'
      ],
      auto_channels: ['feed_sg'],
      steps: [
        obs('Confirm Mode 5, Cold Shutdown: Tavg ≈ 122 °F (50 °C), pressure ≈ 363 psi (2.5 MPa), reactivity well below zero, RHR aligned.', { p: 'tavg_c', op: '<', v: 95 }),
        { text: 'Start the Reactor Coolant Pumps (RCP card → Run). That is your heat source, and the steam generator needs the flow to see it. RHR auto-isolates as pressure rises past its 600 psi (4.14 MPa) AUTOCLOSURE interlock — a different setpoint from the 400 psi (2.76 MPa) block-open permissive that governs putting RHR in service (#288).',
          control: 'RCP ON/OFF', target: 'flow ~100 %',
          cmd: { action: 'set_rcp', running: true }, hold: 30,
          acc: { p: 'pump_flow_pct', op: '>', v: 90 },
          hl: ['Reactor Coolant Pumps (RCP)', 'RCP Run/Stop'] },
        /* ⚠ THE 912s IN THIS STEP ARE CORRECT — DO NOT "FIX" THEM TO 627 (#744). This is the
         * `pwr` pool, which runs against the RETIRED `RD.PWREngine`, and that plant's bank really
         * is 912 fine steps (`engines/pwr/pwr_config.js` rods.max_steps, subdivided x4 in
         * 2026-07-23). 627 is the SHIPPED pwr2 bank and it is already used throughout the `pwr2`
         * pool below. A sweep for the literal finds both and they mean different plants; changing
         * this one reds `run_procedures`, which drives this pool on the engine that owns it. */
        { text: 'Withdraw the SHUTDOWN BANK to fully out. Mode 5 holds both banks on the bottom, and the shutdown bank is worth 3676 pcm of the margin keeping you there — it is not a step toward criticality, it is the prerequisite for one, and every mode above this assumes it done. Drive it in manual bank control; full travel is 912 steps, about 3 plant-minutes at Fast.',
          control: 'Shutdown Bank', target: 'bank fully withdrawn, 912 / 912',
          note: 'Real practice: "The shutdown banks are always in the fully withdrawn position during power operations and are moved into this position at a fixed speed in manual bank control PRIOR TO CRITICALITY" (WTSM 8.1.1, ML11223A252). It is verified on the Mode 5 → 4 leg (App 19-1 A.12) and must be complete within 15 minutes of any control-bank withdrawal (App 19-1 C.7). What you are spending is time, not margin you will miss today: measured, an unattended dilution at the plant make-up rate takes 79 minutes to reach criticality with this bank IN and trips the source range inside the hour with it OUT. So withdraw it deliberately, and do not walk away from a dilution afterwards.',
          cmd: { action: 'rod_nudge', group_id: 'shutdown_rods', steps: 912, speed: 'fast' }, hold: 240,
          hl: ['Shutdown Bank'] },
        { text: 'Confirm the generator is off line: Disconnect Grid. A cold plant has no business following load — on pump heat alone a governor left in FOLLOW cracks open and drains the heatup.',
          control: 'Turbine Load', target: 'generator disconnected, governor shut',
          note: 'The cold_shutdown board SPAWNS off line (#251 — breaker open, rotor at rest, load mode disconnected). This step confirms rather than changes. Leave the turbine off until the end of the startup path.',
          cmd: { action: 'disconnect_grid' }, hold: 10,
          hl: ['Turbine Load'], hl_watch: ['Generator Output'] },
        { text: 'Put steam-generator level control in AUTO now, while level is still at its cold 65 % (STEAM GEN FEED → AUTO on the board). The three-element channel captures the level it finds as its setpoint.',
          control: 'Feed Pumps', target: 'Feed AUTO engaged, SG level ≈ 65 %',
          note: 'On pump heat the SG barely boils, so AUTO simply holds. What it prevents is a standing manual feed demand that keeps filling a generator nobody is boiling.',
          cmd: { action: 'set_auto_channel', channel_id: 'feed_sg', engaged: true }, hold: 5,
          hl: ['Feed Pumps', 'SG Level'] },
        { text: 'Set the Steam Dump Setpoint to the no-load anchor (1020 psi / 7.03 MPa — Ginna\'s sourced 1005 psig no-load point, #419 wave 3) so the secondary bottles with the heatup instead of dumping it. Leave the dump shut.',
          control: 'Dump SP', target: '1020 psi (7.03 MPa)',
          cmd: { action: 'set_steam_dump_setpoint', mpa: 7.03 }, hold: 5,
          hl: ['Dump Setpoint'], hl_watch: ['Steam Dump', 'Steam Dump Status'] },
        { text: 'Raise the Pressurizer Pressure Setpoint to 2235 psi (15.41 MPa). The setpoint walks up at the real full-heater pace — 0.23 psi/s (1.586e-3 MPa/s) — and measured full-stack, normal operating pressure arrives in about 1.8 plant-hours (#419 wave 1: the compressed clock is retired; ride it at time acceleration). The accumulator window in the next step opens and shuts inside this climb. Watch RHR isolate on the way past its 600 psi (4.14 MPa) autoclosure interlock (#288).',
          control: 'Pressure SP', target: '2235 psi (15.41 MPa)',
          cmd: { action: 'set_pressure_setpoint', mpa: 15.41 }, hold: 9000,
          acc: { p: 'pressure_mpa', op: '>', v: 15.0 },
          hl: ['Pressure SP', 'Plant Pressure'] },
        { text: 'Re-align the Safety Injection accumulators (isolated for the cold lineup) AS PRESSURE PASSES 600 psi (4.14 MPa) — do not wait for the previous step to finish. They must be aligned before 1000 psi (6.895 MPa), where LCO 3.5.1 requires them OPERABLE. On the real pressurization clock (#419 wave 1, measured full-stack) the window is ~14 plant-minutes wide: 600 psi at ~+9 min from the Pressure SP command, 1000 psi at ~+23 min, normal operating pressure at ~1.8 plant-hours — it closes about an hour and a half before the pressurization completes. Nothing opens them for you.',
          control: 'Accumulator valve', target: 'accumulators armed',
          note: 'Owner ruling 2026-07-30: re-alignment is procedural, no automatic open. Skip this and Mode 1 has no passive injection; PWR-A32 will not tell you.',
          cmd: { action: 'open_accumulator_valve' }, hold: 5,
          acc: { p: 'accumulator_valve_open', op: '>', v: 0 },
          hl: ['Accumulator valve'] },
        { text: 'Ride the heatup. Tavg climbs at roughly 30 °F/hr (16.7 °C/hr) on pump heat — about twelve plant-hours cold to the no-load anchor. Monitor Tavg and its rate, secondary pressure tracking Psat(Tavg), pressurizer level swelling on thermal expansion, and the reactor staying exactly where you left it. Do not pull rods. Do not dilute. If you need to slow down, secure an RCP.',
          control: '(observe)', target: 'Tavg ≥ 541.4 °F (283 °C), still subcritical',
          note: 'Measured full-stack with no rod motion (#419 wave 1, real rates): Mode 3 entry (~350 °F / 176.7 °C) at ~4.6 plant-h; 546.8 °F (286.0 °C) at ~11.3 plant-h; settles 567.0 °F (297.2 °C) at ~12.3 plant-h, ρ = −2828 pcm on 856.8 ppm. The first hour still reads faster because the heater/pressurization leg adds heat early, not because the pump-heat ramp is quick. Hold 42 000 s: the observe step starts after the ~1.8 plant-h pressurization leg, so ~9.7 h of ride remain to the 545 °F acceptance — the hold covers it with margin (#418 A1 set 42 000 on the derived secondary clock; re-checked at #419).',
          hold: 42000,
          saw: { p: 'tavg_c', op: '>', v: 150 },
          acc: { p: 'tavg_c', op: '>', v: 283 },
          hl: ['Tavg', 'Plant Pressure', 'SG Pressure'] },
        obs('Confirm Mode 3, Hot Standby: hot at the no-load band, pressurized, SUBCRITICAL with the control bank never moved. Ready for the approach to criticality (PWR-N03 / startup walkthrough).',
          { p: 'plant_mode', op: '~', v: 3, tol: 0.1 }),
        obs('Confirm the reactor stayed shut down: power near zero, reactivity deeply negative (measured arrival ρ ≈ −2828 pcm).',
          { p: 'reactivity_pcm', op: '<', v: -300 }),
        obs('Confirm power is still source-range — this heatup never made fission heat.',
          { p: 'power_pct', op: '<', v: 1 }),
      ],
      guard: {
        never_melted: true,
        never: [
          { p: 'fuel_temp_c', op: '>=', v: 1200 },
          // Pump-heat heatup must never take the core critical. A rod pull or a
          // dilution that crossed zero would mean this procedure has become the
          // nuclear variant by accident.
          { p: 'reactivity_pcm', op: '>', v: 0 },
          { p: 'power_pct', op: '>', v: 1 },
        ],
      },
      outcome: 'Plant at Mode 3, Hot Standby: hot, pressurized, subcritical with zero rod motion. NOT yet ready to pull rods: the heatup dilutes nothing, so you are still at cold-shutdown boron (~857 ppm) and criticality sits near 561 steps instead of the 319 the startup assumes. Work the estimated critical condition and dilute to it first — PWR-N02 step 15.',
    },
    {
      id: 'pwr_startup', category: 'startup', manual_ref: 'PWR-T03',
      title: 'Mode 3, Hot Standby → Mode 1, At Power — startup to power',
      purpose: 'Take the reactor from Mode 3, Hot Standby (subcritical, hot) through criticality (Mode 2, Startup), across the 5 % boundary into Mode 1, At Power, and put the turbine on line — the full startup. You will use the 1/M (inverse-count) plot to predict criticality, hand indication from the Source Range to the Intermediate Range, and watch the Startup Rate (SUR) and reactor period on the way up.',
      from: 'hot_zero_power',
      prereq: ['Plant at Mode 3, Hot Standby: subcritical, hot, at operating temperature/pressure.', 'Reactor Coolant Pumps (RCP) running — forced flow established.', 'Control bank inserted; shutdown bank parked withdrawn; boron high (the plant is held subcritical).'],
      // #395/#396 — machine-checkable entry conditions, MEASURED on hot_zero_power
      // (tavg 297.0 °C, 15.41 MPa, power 0, boron 682.9 ppm). The boron row is THE
      // heatup→startup seam (#396): a pump-heat heatup arrives at ≈ 857 ppm, where
      // criticality sits ≈ 561 steps instead of the 319 this checklist assumes —
      // 173.8 ppm outside the ±70 band, so the banner names it before a rod moves.
      // ±70 ppm ≈ the caution's ±750 pcm ECC acceptance band at ~10.6 pcm/ppm.
      precond: [
        { p: 'tavg_c', op: '~', v: 286, tol: 8, text: 'Hot Standby at the no-load temperature (≈ 546.8 °F / 286 °C)' },
        { p: 'pressure_mpa', op: '~', v: 15.41, tol: 0.5, text: 'At normal operating pressure (2235 psi / 15.41 MPa)' },
        { p: 'power_pct', op: '<', v: 1, text: 'Subcritical — the withdrawal starts from a shut-down core' },
        { p: 'boron_ppm', op: '~', v: 705, tol: 70, text: 'Boron at the estimated critical condition (≈ 705 ppm — PWR-N02 step 15; a pump-heat heatup leaves ≈ 857 ppm and criticality moves well outside the band)' },
        { p: 'scrammed', op: '<', v: 1, text: 'Reactor Protection System reset — not tripped (a fresh trip needs PWR-T06, post-trip response, first)' },
      ],
      cautions: ['Withdraw in small bursts, letting the count rate settle between them — target SUR ≤ 1 decade per minute (DPM) and reactor period ≥ 30 s. The SUR HI alarm comes in at 1 DPM and rod withdrawal is blocked at 1.5 DPM (clearing below 0.8); insertion is never blocked. The fine-step drive (912 steps full travel) puts one step at roughly 1 ¢ (6.5 pcm) near the critical band — single-step nudges at Slow for the final approach.', 'Plot ENOUGH 1/M points. The prediction always reads high early and walks down as you add points, so an early estimate is not a target — it is an upper bound. Two points predict ~step 711 against a true ~318; three still say ~484. It takes about six, with the bursts shrinking as you close in, to get within a couple of steps. Never withdraw straight to the predicted position — creep up on it.', 'Work out where criticality should be BEFORE you move a rod — an estimated critical condition, not a guess. The worksheet and the reference curves are in manual 09 §7.5: bank integral worth, differential boron worth at your Tavg, and critical boron by temperature and bank position. THIS CHECKLIST starts Mode 3 at ~705 ppm with the bank in (#419 wave 3: the Ginna anchor re-trimmed the reference boron; criticality stays near 319 steps — about 35 % withdrawn, comfortably inside the insertion limit). That is the answer for ONE boron, not a constant of the plant: a unit that came up on the pump-heat heatup is at ~857 ppm — ~150 ppm and roughly 240 steps out, beyond the acceptance band below. Dilute to the estimated critical boron first — PWR-N02 step 15. The prediction carries a ±750 pcm acceptance band (roughly 159 to 421 steps here); criticality outside it means the estimate was wrong, so stop and re-work it rather than continuing to pull. The 1/M plot is how you close on the prediction, not a substitute for having made one.', 'Secure the Source Range BEFORE its counts reach the amber high-flux caution (the SR high-flux trip at 1e5 cps will scram the ascent). Once the Intermediate Range is on scale, the handoff is safe.', 'Mind the Steam Generator. Below the point of adding heat it barely moves, but from the moment power starts warming the coolant the SG boils down, and on this ascent the turbine is still offline — the steam dump is drawing steam nobody is replacing. Hold level with the three-element Feed AUTO channel (step 3). If you let auxiliary feedwater take it instead, AFW parks the level at about 21 % — inside the amber band, four points above the low-low trip — and holds it there indefinitely.', 'Below the point of adding heat there is no temperature feedback to hold you anywhere — power goes wherever the reactivity you left in takes it, however small. Sustaining even a gentle 1 DPM ramp means carrying ~+200 pcm, and ALL of it has to come back out to level off. Take it out in one decisive drive, not in taps: the plant runs while you tap.'],
      steps: [
        { text: 'Confirm the plant is ready: subcritical — the Source Range count rate is steady, not climbing — hot (Tavg ≈ 546.8 °F / 286 °C, the no-load point), pressurized (≈ 2233 psi / 15.4 MPa), Reactor Coolant Pumps running.',
          control: '(observe)', target: 'subcritical, hot, pumps running', hold: 2,
          acc: { p: 'tavg_c', op: '~', v: 286, tol: 1.5 },
          hl: ['Source Range', 'Tavg', 'Plant Pressure', 'Reactor Coolant Pumps (RCP)'] },
        { text: 'Check the nuclear instruments (NIS): the Source Range (SR) counter reads a few hundred counts per second — the neutron source keeping the core visible — and the Intermediate Range (IR) is on scale (above the P-6 permissive). These are your eyes for the approach.',
          control: '(observe)', target: 'SR counting, IR on scale', hold: 2,
          acc: { p: 'sr_counts_cps', op: '>', v: 100 },
          hl: ['Source Range', 'Intermediate Range'] },
        { text: 'Set up the heat sink before you make any heat: put steam-generator level control in AUTO (STEAM GEN FEED → AUTO on the board). Level is at its nominal 65 % now, and the three-element channel captures that as its setpoint — so engage it HERE, while the number is right.',
          control: 'Feed Pumps', target: 'Feed AUTO engaged, SG level ≈ 65 %',
          note: 'Do this first and you will not think about it again. Skip it and nothing happens until the point of adding heat — then the generator starts boiling down with no regulator, auxiliary feedwater picks it up around 20 %, and the plant sits in the low amber band for the rest of the ascent. AFW is an emergency sink, not a level control system: it holds you off the trip, it does not put the level back. Note that any manual feed-pump command later takes this channel back to MAN.',
          cmd: { action: 'set_auto_channel', channel_id: 'feed_sg', engaged: true }, hold: 5,
          hl: ['Feed Pumps', 'SG Level'] },
        { text: 'Set the 1/M baseline BEFORE moving any rods: open the 1/M PLOT tool (diagram, lower-left) and press "Plot point". This captures the shutdown count rate as the 1.0 reference every later point is measured against.',
          control: '1/M Plot', target: 'baseline captured (point 1)',
          note: '1/M = C₀ / C. As you approach criticality the count rate C climbs, so 1/M falls toward zero — where the trend line crosses zero is the predicted critical rod position. The plot fits the LATEST three points, so the estimate keeps sharpening as you add more.',
          // The 1/M points live in the UI panel, not the snapshot, so there is no
          // instrument to grade — pressing "Plot point" IS the evidence. Not a plant
          // command: the instructor consumes it, the engine never sees it (#202).
          cmd: { action: 'plot_1m_point' },
          hl: ['1/M Plot Tool', 'Source Range'] },
        { text: 'First burst: withdraw the Control Bank at Norm, release to stop, let the count rate settle — then press "Plot point" again. Two points draw a line. Read where it crosses zero: it will predict criticality far PAST where the reactor actually goes critical, and that is normal. Down here the rods are in the flat toe of the worth curve, so the early trend is too shallow. Do not trust this number yet.',
          control: 'Control Bank', target: 'point 2 — first (over-)estimate',
          note: 'On the CONTROL GROUP card: set Rod Speed (S/M/F), then hold WITHDRAW; release to stop motion. Two points predict ~step 711 against a true ~318 — the error is ~390 steps, and always on the far side.',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 138, speed: 'normal' }, hold: 60,
          acc: { p: 'sr_counts_cps', op: '>', v: 550 },
          hl: ['Control Bank', '1/M Plot Tool', 'Source Range'] },
        { text: 'Second burst — smaller, because every point from here is worth more than the last. Withdraw, settle, plot. Three points now, and the prediction has pulled in a long way, but it is still tens of steps beyond the truth. This is the step most people stop at, and it is not close enough to withdraw against.',
          control: 'Control Bank', target: 'point 3 — still ~100 steps late',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 90, speed: 'normal' }, hold: 60,
          acc: { p: 'sr_counts_cps', op: '>', v: 850 },
          hl: ['Control Bank', '1/M Plot Tool', 'Source Range'] },
        { text: 'Third burst: withdraw, settle, plot. Point 4 — the fit is now working on points that sit on the steep part of the curve, and the prediction drops inside about twenty steps of actual. Keep the bursts shrinking as the estimate tightens.',
          control: 'Control Bank', target: 'point 4 — inside ~25 steps',
          note: 'Keep each burst small enough that the Startup Rate stays under 1 DPM. Bigger bursts raise the rate faster than the count rate settles, and the rod-withdrawal block will stop you at 1.5 DPM.',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 44, speed: 'normal' }, hold: 60,
          acc: { p: 'sr_counts_cps', op: '>', v: 1400 },
          hl: ['Control Bank', '1/M Plot Tool', 'Source Range', 'Startup Rate'] },
        { text: 'Fourth burst — small now. Withdraw, settle, plot. Point 5 lands the prediction within roughly ten steps, and the count rate is climbing visibly between plots. You are close.',
          control: 'Control Bank', target: 'point 5 — inside ~12 steps',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 22, speed: 'normal' }, hold: 60,
          acc: { p: 'sr_counts_cps', op: '>', v: 2250 },
          hl: ['Control Bank', '1/M Plot Tool', 'Source Range', 'Startup Rate'] },
        { text: 'Last plotted burst — a nudge. Withdraw, settle, plot. Point 6 is your working number: the prediction is now within a handful of steps and still reads slightly HIGH, which is the safe side. Stop here and take the rest by creeping — never withdraw straight to the predicted position.',
          control: 'Control Bank', target: 'point 6 — the working prediction',
          note: 'Six points get you inside ~8 steps of true criticality; three get you 79 steps past it. The extra plots cost a minute each and are the whole reason the method works.',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 12, speed: 'normal' }, hold: 60,
          acc: { p: 'sr_counts_cps', op: '>', v: 3500 },
          hl: ['Control Bank', '1/M Plot Tool', 'Source Range', 'Startup Rate'] },
        { text: 'Perform the SR→IR handoff: with the IR on scale, secure the Source Range detector (SR DET → off). Its high-flux trip (1e5 cps) would scram the ascent; the Intermediate Range carries the indication from here. Do this while SR counts are still below the amber caution.',
          control: 'SR detector', target: 'SR de-energized',
          cmd: { action: 'set_sr_detector', on: false }, hold: 5,
          acc: { p: 'sr_energized', op: '<', v: 1 },
          hl: ['SR detector'], hl_watch: ['Intermediate Range'] },
        { text: 'Creep up on criticality: withdraw at Slow in single steps. The reactor goes critical and power begins to climb — watch the Startup Rate (SUR) and keep the reactor period long.',
          control: 'Control Bank', target: 'critical, SUR ≤ 1 DPM, period ≥ 30 s',
          note: 'One fine step is ~1 ¢ (6.70 pcm) near the band. If the period drops below 30 s, stop or insert — the reactor is accelerating.',
          // WHERE 26 COMES FROM (#263 item 2). It was originally found by SWEEPING 22 / 26 / 30
          // and keeping the one that landed inside the authored 1–3 % band — refitting content
          // until the gate passes, which is what HR10 warns against. Derived 2026-07-30, and the
          // sweep's answer turns out to be the derived one. Every link measured:
          //
          //   the five plotted bursts sum to 138+90+44+22+12  = 306 steps
          //   critical position at the startup IC (683 ppm)   = 319 steps   [ρ(318) = −3.1,
          //                                                                  ρ(319) = +3.5 pcm]
          //   so reaching critical costs                        13 steps
          //
          //   power at the last plotted point (ρ = −90 pcm)  = 6.25e-4 %
          //   the level-off target, the point of adding heat  ≈ 1 %
          //   decades to cover  log10(1 / 6.25e-4)            = 3.20
          //   the authored hold before the level-off drive    = 600 s = 10 min
          //   ⇒ the ascent must average                         0.32 DPM
          //   ρ that produces 0.32 DPM (measured, held at a fixed position)
          //                                                   ≈ 85 pcm
          //   differential bank worth through the band        = 6.70 pcm/step (1.03 ¢)
          //   ⇒ steps of excess                                 85 / 6.70 ≈ 13
          //
          //   creep = 13 (to critical) + 13 (excess) = 26 steps.
          //
          // PRECISION — stated because that arithmetic reads cleaner than it is. Run as a script
          // rather than by hand, the excess comes out 14.7 steps, so the derivation predicts 27.7
          // against the 26 authored. It is good to about ±2 steps, NOT exact, and the reason is
          // that SUR is not constant at a fixed rod position: the same 13 steps above critical
          // measures 0.339 DPM at 120 s and 0.285 DPM at 240 s, so "the ρ that gives 0.32 DPM" is
          // a band rather than a number. The acceptance below is ±4 steps wide, so 26 sits inside
          // comfortably — but do not read this as a formula that returns 26 exactly.
          //
          // VALIDATED OUT OF SAMPLE — the HR10 "check it against the OLD behaviour too" test, and
          // the reason this is a derivation rather than a restatement of the sweep. The 600 s hold
          // PREDATES this creep and did not move when the plant did: before #260 the 1/M bursts
          // were 120+50+30+15+8 = 223 and the creep was ELEVEN steps, at the same 600 s. Running
          // the identical derivation against that plant — different boron (363 ppm), different
          // critical position (224), different differential worth (9.50 pcm/step) — predicts
          // 10.8 steps against the 11 that was authored. A relationship that lands on the authored
          // value for two different plants, one of which it was never fitted to, is doing real work.
          //
          // So the hold is NOT co-fitted with the creep, which was the obvious way this could have
          // been circular. It is still an AUTHORED number though: the manual's own low-power hold
          // (PWR-N04, `Manuals/04`) specifies no duration at all — its acceptance is "SUR near 0;
          // power stable ≤ 5 %". Nothing sources 600 s. What is derived is the creep GIVEN the
          // hold, and that is the honest claim.
          //
          // Confirmed at the layer this procedure actually runs at (full stack, via
          // test/measure_stack.js, not engine-direct — #266): ρ settles at +78 pcm after the
          // creep, SUR holds 0.27–0.30 DPM through the ascent, and the level-off lands at
          // 1.04 %. Engine-direct gives 80 pcm and 1.004 %; the layer moves nothing here.
          //
          // The sweep's neighbours fail for the reason the derivation predicts, not by accident:
          // 22 steps leaves 53 pcm and levels off at 0.10 % (short of the point of adding heat),
          // 30 leaves 107 pcm and reaches 3.40 % (past the band). The band is ~±4 steps wide.
          // MOVE THIS NUMBER ONLY WITH THE HOLD: 26 is tied to the 600 s hold below it, because
          // what is being fixed is decades-per-minute × minutes.
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 26, speed: 'slow' }, hold: 600,
          saw: { p: 'startup_rate_dpm', op: '>', v: 0 }, acc: { p: 'power_pct', op: '>', v: 0.2 },
          hl: ['Control Bank', 'Startup Rate', 'Intermediate Range'] },
        { text: 'Level off at the point of adding heat — the power where the core first warms the coolant, a few per cent. Do it in ONE decisive inward drive at Norm, released the moment the Startup Rate crosses zero. Do not tap the bank a step at a time: a 1 DPM ramp carries about +200 pcm, and trimming that out one step at a time lets power run away underneath you.',
          control: 'Control Bank', target: 'power steady, 1–3 % (still Mode 2, Startup)',
          note: 'This is the technique the whole evolution turns on. Measured on the recalibrated bank (#260): one continuous drive-in released on the rate null settles ~1.0 %. Removing the same reactivity as single taps settles far higher — the plant runs while you tap — and from a brisker approach it reaches the power-range setpoint and trips.',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: -8, speed: 'normal' }, hold: 150,
          acc: { p: 'power_pct', op: '<', v: 5 },
          hl: ['Control Bank', 'Startup Rate', 'Intermediate Range'] },
        { text: 'Now cross the 5 % boundary deliberately: withdraw a measured amount at Slow to raise power into the low teens, enough to carry the generator. Crossing into Mode 1, At Power is a decision you make — not something the ascent does to you.',
          control: 'Control Bank', target: '≈ 12 %, Mode 1, At Power',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 22, speed: 'slow' }, hold: 300,
          acc: { p: 'power_pct', op: '>', v: 5 },
          hl: ['Control Bank', 'Startup Rate', 'Intermediate Range'] },
        { text: 'You are now above P-10 (10 % power), which is the permissive that lets you block the two startup trips. Block the INTERMEDIATE RANGE HIGH trip first — its setpoint sits at about 20 % power, so it is the one you would hit next. On the TRIP BLOCKS panel, press IR HIGH.',
          control: 'Trip Blocks', target: 'IR HIGH blocked',
          note: 'These are startup protections, not nuisances: below P-10 they are your backstop against a runaway ascent, and the plant will not let you block them down there. Above P-10 the power range is on scale and takes over the job — so you block them deliberately, as a step, rather than discovering them at 20 %. Both blocks reinstate themselves once power has stayed below P-10 long enough to confirm the drop — a couple of seconds, so one noisy reading cannot clear a block you set.',
          /* "THE MOMENT POWER FALLS BACK BELOW P-10" WENT FALSE ON 2026-09-14 (#752, b2ddf12b).
           * The revoke now confirms over `config.trip_block_revoke_confirm_s` — 2.0 s in
           * `layers/control/pwr_control.js` — instead of acting on one sub-permissive instrument
           * sample, so the reinstate trails the true crossing by the dwell plus whatever the
           * ride-down covers in it. The commit's own measurement: at 5 %/min through 8 % the
           * block reinstates at 7.417 % true power against 7.500 % with a 1.0 s dwell. The
           * player-facing consequence is small and it is the SENSE that was wrong — "a moment"
           * told the player a dip clears the block, which is exactly the behaviour #752 removed.
           * `Manuals/03` reads true either way and was deliberately not touched. */
          cmd: { action: 'set_trip_block', trip_id: 'ir_high', blocked: true },
          hold: 5, hl: ['Trip Blocks', 'Intermediate Range'] },
        { text: 'Now block the POWER RANGE LOW SETPOINT trip — the 25 % startup setpoint, the backstop behind the IR trip. Press PR 25 % on the same panel. With both blocked the power-range 120 % trip is what protects you, and the ascent above 20 % is clear.',
          control: 'Trip Blocks', target: 'PR 25 % blocked',
          note: 'The startup net ladders P-10 (10 %) < IR high (20 %) < PR low setpoint (25 %). Miss either block and the net scrams you on the way up — which is the lesson, not a bug.',
          cmd: { action: 'set_trip_block', trip_id: 'pr_low_setpoint', blocked: true },
          hold: 5, hl: ['Trip Blocks'] },
        { text: 'Put the turbine on line: Connect Grid. The generator synchronizes and picks up load in FOLLOW mode — the reactor\'s heat now has somewhere to go besides the steam dump.',
          control: 'Turbine — Connect Grid', target: 'generator loaded',
          cmd: { action: 'connect_grid' }, hold: 180,
          acc: { p: 'mwe_output', op: '>', v: 10 },
          hl: ['Turbine Load'], hl_watch: ['Generator Output'] },
        { text: 'Take load control: put the turbine in MANUAL. It picked up load in FOLLOW, which was right for synchronising — the turbine chased the reactor while you got on line. From here you drive generator load yourself, and the setpoint stays where FOLLOW left it, already matched to the power you are making.',
          control: 'Turbine Load', target: 'MANUAL, setpoint matched to output',
          note: 'This is how the board is handed to you in free play, and it is the lineup the rest of the manual assumes. It also puts you in charge of a coupling worth understanding: in MANUAL the turbine sits at whatever load you last asked for, so if you change reactor power and leave the setpoint alone, the two diverge — LOAD IMBAL comes in at 4 MWe and the steam generator starts filling or draining. Matching them is the operator\'s job.',
          cmd: { action: 'set_load_mode', mode: 'manual' }, hold: 30,
          acc: { p: 'mwe_output', op: '>', v: 10 },
          hl: ['Turbine Load'] },
        { text: 'Confirm Mode 1, At Power: critical, at operating temperature, generator on line, power above 5 %. Hold here, or continue the power ascension (raise-power walkthrough).',
          control: '(observe)', target: 'Mode 1, At Power', hold: 2,
          acc: { p: 'plant_mode', op: '~', v: 1, tol: 0.1 },
          hl: ['Tavg', 'Turbine Load', 'SG Level'] },
      ],
      guard: { never_melted: true, never: [{ p: 'fuel_temp_c', op: '>=', v: 1200 }] },
      outcome: 'Reactor critical and in Mode 1, At Power with the generator on line; ready to continue the power ascension.',
    },
    {
      id: 'pwr_raise_power', category: 'power', manual_ref: 'PWR-N07',
      title: 'Mode 1, At Power — raise power',
      purpose: 'Increase reactor power and electrical output by withdrawing rods a little and letting the turbine take more load. Rods lead, turbine follows — the PWR two-step every crew drills until it is boring.',
      from: '50_percent',
      prereq: ['Reactor critical and stable at partial power.', 'Turbine on line.'],
      // #395 — measured on 50_percent (power 50.1 %, mwe 52.1). The power row is
      // what catches the audit's headline case: this evolution "completed" on a
      // subcritical Mode 3 plant and cooled it 21.8 °F (#344 F5).
      precond: [
        { p: 'power_pct', op: '>', v: 10, text: 'Reactor critical and at power (above the P-10 range)' },
        { p: 'mwe_output', op: '>', v: 5, text: 'Turbine on line, carrying load' },
      ],
      cautions: ['Keep the power ramp modest; let temperatures and xenon follow.'],
      steps: [
        { text: 'Withdraw the Control Rods a few steps to add reactivity (Rod Control card → set Rod Speed, then Withdraw in short bursts).', control: 'Rod Speed',
          target: 'small, steady power rise', cmd: { action: 'rod_nudge', group_id: 'control', steps: 24, speed: 'normal' }, hold: 60,
          acc: { p: 'power_pct', op: '>', v: 50.5 } },
        { text: 'Raise the Turbine Load to match the higher reactor power and send more electricity to the grid.', control: 'Turbine Load',
          target: '≈ 70 MWe', cmd: { action: 'set_steam_demand', mwe: 70 }, hold: 40, acc: { p: 'power_pct', op: '>', v: 52 } },
      ],
      guard: { never_melted: true },
      outcome: 'Power and electrical output settle at a higher point.',
    },
    {
      id: 'pwr_lower_power', category: 'power', manual_ref: 'PWR-N08',
      title: 'Mode 1, At Power — lower power',
      purpose: 'Reduce reactor power and load by inserting rods and reducing turbine demand. Turbine leads down, rods trim — the two-step in reverse.',
      from: 'hot_full_power',
      prereq: ['Reactor at power, turbine on line.'],
      precond: [   // #395 — measured on hot_full_power (power 100 %, mwe 100)
        { p: 'power_pct', op: '>', v: 10, text: 'Reactor critical and at power' },
        { p: 'mwe_output', op: '>', v: 5, text: 'Turbine on line, carrying load' },
      ],
      cautions: ['Watch that the Steam Generator (SG) level does not swell excessively as load drops.'],
      steps: [
        { text: 'Reduce the Turbine Load.', control: 'Turbine Load', target: '≈ 60 MWe', cmd: { action: 'set_steam_demand', mwe: 60 }, hold: 10 },
        { text: 'Insert the Control Rods a few steps to lower reactor power (Rod Control card → Insert in short bursts).', control: 'Rod Speed',
          target: 'power falling', cmd: { action: 'rod_nudge', group_id: 'control', steps: -40, speed: 'normal' }, hold: 90,
          acc: { p: 'power_pct', op: '<', v: 98 } },
      ],
      guard: { never_melted: true },
      outcome: 'Power settles at a lower point; the plant remains stable.',
    },
    {
      id: 'pwr_pressure_control', category: 'control', manual_ref: 'PWR-N10',
      title: 'Mode 1, At Power — pressurizer pressure control',
      purpose: 'Hold primary pressure at ≈ 2235 psi (15.41 MPa) using the Pressurizer (PZR) heaters (raise) and spray (lower). Pressure is the subcooling guarantee — lose it, and the primary flirts with boiling.',
      from: 'hot_full_power',
      prereq: ['Reactor at power, pressurizer at normal level.'],
      cautions: ['Low pressure erodes the subcooling margin toward boiling; high pressure approaches the relief setpoint (2350 psi / 16.20 MPa).'],
      steps: [
        obs('Read the primary pressure — normal is ≈ 2235 psi (15.41 MPa).', null, null, ['Plant Pressure']),
        { text: 'To LOWER pressure, open the Pressurizer spray — it condenses steam in the pressurizer. On the PZR Pressurizer card, raise Pressurizer Spray (PZR) → Set % (or command full open).', control: 'Pressurizer Spray (PZR)',
          target: 'pressure decreasing', cmd: { action: 'set_spray', open: true }, hold: 40, acc: { p: 'pressure_mpa', op: '<', v: 15.41 },
          note: 'Spray draws from the cold leg and needs Reactor Coolant Pump (RCP) flow. Return to Auto once pressure is where you want it.',
          hl: ['Pressurizer Spray (PZR)', 'Plant Pressure'] },
      ],
      guard: { never_melted: true },
      outcome: 'Primary pressure controllable via spray (down) and heaters (up).',
    },
    {
      id: 'pwr_sg_level', category: 'control', manual_ref: 'PWR-N12',
      title: 'Mode 1, At Power — steam generator level control',
      purpose: 'Control Steam Generator (SG) water level with the Feed Pump. The SGs are the heat sink; their level is its fuel gauge. Normally the three-element feedwater controller (STEAM GEN FEED → AUTO on the board) holds level for you; this procedure is the manual skill underneath it.',
      from: 'hot_full_power',
      prereq: ['Reactor at power, main feedwater available.'],
      cautions: ['On a fast power/level change the SG level indication briefly moves the WRONG way (shrink-and-swell) — do not overreact.',
                 'Any manual Feed Pump command takes the three-element controller to MANUAL — level is then yours to mind until you re-engage it.'],
      steps: [
        obs('Read SG level — normal is ≈ 65 %. Check the Feed control readout on the Steam & Flow card: "AUTO — three-element" means the controller is driving; MANUAL means you are.', null, null, ['SG Level', 'Feed Pump']),
        { text: 'Raise the Feed Pump speed to RAISE Steam Generator level. On the Steam & Flow card, use Feed pump → Set % (or the ▲ nudge). The readout flips to MANUAL — the pump now holds whatever speed you command.', control: 'Feed Pump', target: 'level rising',
          cmd: { action: 'set_feed_pump_speed', pct: 100 }, hold: 40, acc: { p: 'sg_level_pct', op: '>', v: 60 },
          note: 'When you are done, re-engage the three-element controller (STEAM GEN FEED → AUTO on the board) so level is minded continuously.',
          hl: ['Feed Pump', 'SG Level'] },
      ],
      guard: { never_melted: true },
      outcome: 'SG level responds to the feed pump as expected; the three-element controller is the normal driver.',
    },
    {
      id: 'pwr_shutdown', category: 'shutdown', manual_ref: 'PWR-N14',
      title: 'Mode 1, At Power → Mode 3, Hot Standby — normal shutdown',
      purpose: 'Shut the reactor down from Mode 1, At Power to Mode 3, Hot Standby: take the turbine off load, then insert the rods. Decay heat continues and must keep being removed.',
      from: 'hot_full_power',
      prereq: ['Reactor at power.'],
      precond: [   // #395 — a shutdown of an already-shut-down core is a no-op that "completes"
        { p: 'power_pct', op: '>', v: 10, text: 'Reactor at power — there is something to shut down' },
      ],
      cautions: ['Decay heat (~7 % of rated, decaying) persists after shutdown — maintain a heat sink.'],
      steps: [
        { text: 'Reduce Turbine Load toward zero.', control: 'Turbine Load', target: '0 MWe', cmd: { action: 'set_steam_demand', mwe: 0 }, hold: 10 },
        { text: 'Insert all rods (SCRAM) to shut the reactor down.', control: 'SCRAM', target: 'power collapsing',
          cmd: { action: 'scram' }, hold: 40, acc: { p: 'power_pct', op: '<', v: 5 } },
        obs('Confirm the chain reaction has stopped and decay heat remains — keep cooling.', { p: 'decay_heat_pct', op: '>', v: 3 }),
      ],
      guard: { never_melted: true },
      outcome: 'Reactor shut down at Mode 3, Hot Standby; decay heat being removed.',
    },
    // PWR-N15 — the controlled cooldown, and the first checklist to use RAMP steps
    // (#310). Every number below is MEASURED full stack from `hot_zero_power` on the
    // default lineup, seed 42, at the same 10x the gate runs: see the milestone table
    // in Manuals/04 PWR-N15 "Expected cooldown performance".
    //
    // WHY THE LEGS ARE RAMPS AND NOT SETPOINT STEPS. It was tried the cheap way first.
    // The steam dump's proportional band is 36 psi (0.25 MPa) against a 40 % capacity,
    // and the primary trails the secondary with a time constant of about 37 s, so a
    // step in the Dump SP bursts at roughly (step size)/tau. Measured: a 10 °C step
    // peaks at -1168 °F/hr (-649 °C/hr) over its first 30 s and is finished in four
    // minutes, after which the plant just sits — the average is on programme and the
    // ride is a sawtooth. Holding -90 °F/hr (-50 °C/hr) with discrete steps needs
    // them no bigger than ~1.4 °F (0.8 °C), i.e. about 250 of them. Four ramps do it.
    {
      id: 'pwr_cooldown', category: 'shutdown', manual_ref: 'PWR-N15',
      // Cannot be replayed below M4 — the board's only boron control is the
      // `boron_conc` channel target, so engine-direct runs it UNBORATED and the core
      // goes critical on the way down. See the `stack_only` note in run_procedures.js.
      stack_only: true,
      title: 'Mode 3, Hot Standby → Mode 5, Cold Shutdown — controlled cooldown',
      purpose: 'Take a hot, subcritical plant all the way to Mode 5, Cold Shutdown: borate for cold shutdown margin, block the protection that would trip you on the way down, walk the secondary down along the saturation curve so the steam generator draws the primary with it, isolate the accumulators before they can dump, then place Residual Heat Removal and secure the reactor coolant pumps so RHR carries the plant cold. This is PWR-N15 and the second half of master path PWR-T21.',
      from: 'hot_zero_power',
      prereq: [
        'Plant at Mode 3, Hot Standby: hot (546.8 °F / 286 °C), at normal operating pressure (2235 psi / 15.41 MPa), subcritical with the control bank in.',
        'Reactor coolant pumps running; steam generator level normal on the three-element feed channel.',
        'Condenser available — the steam dump is the heat sink for the first half of this evolution, and the RHR heat exchanger rejects to the same circulating water.',
      ],
      // #395 — measured on hot_zero_power (tavg 297.0 °C, 15.41 MPa, power 0). The
      // tavg row matters beyond its own IC: the ramp schedule's first leg starts at
      // 297 °C, so a plant arriving colder (the audit's chain hit this at 244 °C)
      // rides the first leg as a step, not a ramp.
      precond: [
        { p: 'tavg_c', op: '~', v: 286, tol: 8, text: 'Hot Standby at the no-load temperature (≈ 546.8 °F / 286 °C — the ramp schedule starts there)' },
        { p: 'pressure_mpa', op: '~', v: 15.41, tol: 0.5, text: 'At normal operating pressure (2235 psi / 15.41 MPa)' },
        { p: 'power_pct', op: '<', v: 1, text: 'Subcritical with the control bank in' },
      ],
      cautions: [
        'THE COOLDOWN IS A RAMP, NOT A CHASE. Walk the Dump SP down against a schedule and the dump only ever opens as far as it must to keep up. Chase it — retype the setpoint to track whatever Tavg reads right now — and you have built a positive feedback loop: a 55 psi (0.38 MPa) error is wider than the dump\'s 36 psi (0.25 MPa) proportional band, the dump saturates, and the plant free-falls. Measured with the setpoint driven to its 29 psi (0.2 MPa) stop: -2340 °F/hr (-1300 °C/hr), from 566.6 °F (297 °C) to 251.6 °F (122 °C) in eight plant-minutes.',
        'THREE THINGS WOULD TRIP YOU ON THE WAY DOWN AND ONLY ONE OF THEM IS "SI". The depressurization crosses the 1715 psi (11.824 MPa) SI actuation setpoint and the 1775 psi (12.24 MPa) low-pressure reactor trip. Taking HPI/LPI to OFF stops the PUMPS; it does NOT stop the RPS. Both the low-pressure trip and the reactor-trip-on-SI have to be BLOCKED by hand at the Trip Blocks panel, and neither block is available until pressure is inside the P-11 permissive (below 1972 psi / 13.6 MPa) — which is why step 3 lowers the Pressure SP before steps 4 and 5 block anything. Measured with the blocks missed: the plant scrams at 1800 psi about six plant-minutes into the first leg, the turbine trip drives the dump into its Tavg-error mode, and the cooldown runs away at -550.8 °F/hr (-306 °C/hr).',
        'The accumulators are PRESSURE and a check valve, not a pump — blocking SI does nothing to them. Isolate them at 1000 psi (6.895 MPa), where LCO 3.5.1 stops requiring them OPERABLE and 355 psi (2.45 MPa) above their 600 psi (4.14 MPa) cover gas. Miss it and all four dump into the RCS: empty tanks, boron dragged toward the 2500 ppm RWST charge, and a water-solid arrival at Mode 5.',
        'PLACE RHR WITH THE HEAT EXCHANGER THROTTLED, and set the split BEFORE you open the suction. The split arrives at 100 % from the at-power lineup; measured, opening the hot-leg suction at full split on a 379.4 °F (193 °C) plant takes the rate to -1517.4 °F/hr (-843 °C/hr). At the 7 % of step 12 the placement transient peaks at -171 °F/hr (-95 °C/hr) for about ten seconds and then settles back on programme.',
        'From the moment the pumps are secured the HX split IS the rate control, and it has to keep rising: RHR removes heat in proportion to (Tavg − sink), so a split that gives -90 °F/hr at 379 °F gives a third of that at 210 °F. Step 15 walks it 7 → 25 %. The sink is about 122 °F (50 °C) and moves with the circulating-water inlet temperature, so a warm summer river raises the floor this cooldown can reach.',
        'The programmed -90 °F/hr (-50 °C/hr) is THIS PLANT\'S TRAINING RATE and is UNVERIFIED as a commercial limit — no source for a real-plant cooldown-rate limit has been found for this manual set. Real Tech Spec limits come from the RCS pressure–temperature curves (NUREG-1431 LCO 3.4.3), which this plant does not model.',
      ],
      auto_channels: ['feed_sg', 'cvcs_makeup', 'boron_conc'],
      steps: [
        obs('Confirm Mode 3, Hot Standby: Tavg at the no-load anchor 546.8 °F (286 °C), pressure 2235 psi (15.41 MPa), reactor subcritical with the control bank in, RCPs running.',
          { p: 'tavg_c', op: '~', v: 286, tol: 3 }, null, ['Tavg', 'Plant Pressure', 'Reactor Coolant Pumps (RCP)']),
        { text: 'BORATE FIRST — nothing cools until this is done. Cooling a core makes it MORE reactive (the cold moderator is denser), so the shutdown margin you have at 546.8 °F is not the margin you will have at 199 °F. Set the boron target to 857 ppm on the board (BORON CONTROL): 806 ppm is critical cold with the bank in (09 §7.5) and the rest is margin. The makeup panel meters it as a batch dose at about 3 ppm/min, so 705 → 857 ppm takes roughly 50 plant-minutes.',
          control: 'Boron control', target: '857 ppm',
          note: 'This is the same 857 ppm the cold_shutdown initial condition ships, and it is why a plant that came down this way goes critical near step 561 on the next startup rather than the 319 the startup walkthrough assumes (#303).',
          cmd: { action: 'set_auto_setpoint', channel_id: 'boron_conc', value: 857 }, hold: 3600,
          acc: { p: 'boron_ppm', op: '>', v: 850 },
          hl: ['Boron Target'], hl_watch: ['Boron Status', 'Boron Concentration'] },
        { text: 'Lower the Pressurizer Pressure Setpoint to 1901 psi (13.11 MPa) — saturation for the temperature you are at plus the 63 °F (35 °C) of subcooling this cooldown holds throughout. It also puts you inside the P-11 permissive (below 1972 psi / 13.6 MPa), which is what makes the next two steps possible.',
          control: 'Pressure SP', target: '1901 psi (13.11 MPa), below P-11',
          cmd: { action: 'set_pressure_setpoint', mpa: 13.11 }, hold: 300,
          acc: { p: 'pressure_mpa', op: '<', v: 13.6 },
          hl: ['Pressure SP', 'Plant Pressure'] },
        { text: 'BLOCK the low-pressure reactor trip (Trip Blocks → PZR PRESS LO LO). It trips at 1775 psi (12.24 MPa) — the panel is captioned for the 1800 psi (12.41 MPa) ALARM, which is a different setpoint on the same channel — and you are about to drive straight through both. You could not have blocked it a step ago: the block is an ENABLE, not a switch, and P-11 is what enables it — which is why the Pressure SP came down first. It stands as long as you stay below P-11, and reinstates itself when pressure climbs back through P-11 on the next heatup, whoever set it.',
          control: 'Trip Blocks', target: 'lo-press trip BLOCKED',
          cmd: { action: 'set_trip_block', trip_id: 'lo_press', blocked: true }, hold: 10,
          hl: ['Trip Blocks'] },
        { text: 'BLOCK the reactor trip on safety injection as well (Trip Blocks). This is a SECOND trip on the same channel, armed at the 1715 psi (11.824 MPa) SI setpoint — a real casualty means the reactor does not stay up, and a planned cooldown is not one. THIS BLOCK IS ALSO WHAT STOPS THE INJECTION ITSELF: there is no ESF arm on this plant, so switching the pumps off in the next step secures them without stopping the actuation from starting them again.',
          control: 'Trip Blocks', target: 'SI reactor trip BLOCKED',
          note: 'Found by building this walkthrough: with only the low-pressure trip blocked the plant still scrams on the way down, because two entries in the trip table watch the same instrument in the same direction. Both blocks are needed and both are the operator\'s.',
          cmd: { action: 'set_trip_block', trip_id: 'si_trip', blocked: true }, hold: 10,
          hl: ['Trip Blocks'] },
        { text: 'Take HPI/LPI to OFF — the P-11 cold lineup. This SECURES THE PUMPS; it is the si_trip block above that stops the actuation, because this plant has no ESF arm to take to MANUAL. Left unblocked, the actuation reads the depressurization as a Loss-Of-Coolant Accident and injects 2500 ppm RWST water. Measured with it left in AUTO: boron ends at 2500 ppm instead of 857 and the cold injection cools the plant about ten times faster than you are asking for.',
          control: 'HPI/LPI', target: 'HPI/LPI in MANUAL, OFF',
          cmd: { action: 'set_hpi', active: false }, hold: 10,
          acc: { p: 'hpi_active', op: '<', v: 0.5 },
          hl: ['HPI/LPI', 'ECCS'] },
        { text: 'LEG 1 — start the cooldown. Walk the Dump SP down from 1020 psi to 814 psi (7.03 → 5.61 MPa) and the Pressure SP from 1901 psi to 1352 psi (13.11 → 9.32 MPa) TOGETHER, over the next 17 plant-minutes, tracking the saturation curve. That is about 12 psi/min on the dump (the walk is shorter than it used to be — the Ginna anchor starts 174 psi lower, #419 wave 3). The pair holds deep subcooling all the way down: the dump sets where the plant is going, the pressurizer keeps the coolant liquid while it gets there.',
          control: 'Dump SP', target: 'Tavg 519.8 °F (271 °C) at -90 °F/hr (-50 °C/hr)',
          note: 'Measured: -85 to -100 °F/hr (-47 to -56 °C/hr) through this leg, arriving 521.4 °F (271.9 °C). Do not retype the setpoint to match present Tavg — that is the chase the first caution describes.',
          cmd: { action: 'set_steam_dump_setpoint', mpa: 5.61 }, hold: 1200,
          ramp: [{ action: 'set_steam_dump_setpoint', arg: 'mpa', points: [7.03, 6.67, 6.32, 5.96, 5.61] },
                 { action: 'set_pressure_setpoint',   arg: 'mpa', points: [13.11, 12.07, 11.10, 10.18, 9.32] }],
          acc: { p: 'tavg_c', op: '~', v: 271, tol: 4 },
          hl: ['Dump Setpoint', 'Pressure SP'], hl_watch: ['Tavg', 'Steam Dump'] },
        { text: 'LEG 2 — continue to the accumulator isolation point. Dump SP 814 → 580 psi (5.61 → 4.00 MPa), Pressure SP 1352 → 1004 psi (9.32 → 6.92 MPa), over 25 plant-minutes. Watch the pressure: this leg ends AT 1000 psi, and the SI ACCUM annunciator comes in there.',
          control: 'Dump SP', target: 'pressure 1000 psi (6.895 MPa), Tavg 482 °F (250 °C)',
          cmd: { action: 'set_steam_dump_setpoint', mpa: 4.00 }, hold: 1512,
          ramp: [{ action: 'set_steam_dump_setpoint', arg: 'mpa', points: [5.61, 5.17, 4.75, 4.37, 4.00] },
                 { action: 'set_pressure_setpoint',   arg: 'mpa', points: [9.32, 8.67, 8.06, 7.47, 6.92] }],
          acc: { p: 'pressure_mpa', op: '<', v: 7.0 },
          hl: ['Dump SP', 'Pressure SP', 'Plant Pressure'] },
        { text: 'ISOLATE THE SI ACCUMULATORS now, at 1000 psi (6.895 MPa) — close the discharge valve. Below their 600 psi (4.14 MPa) cover gas they dump whether you meant it or not, and nothing automatic shuts them. Basis: NUREG-1431 LCO 3.5.1 (OPERABLE only above 1000 psig) and SR 3.4.12.3 (the LTOP lineup verifies each accumulator isolated).',
          control: 'Accumulator valve', target: 'discharge valve SHUT, tanks still 100 % full',
          cmd: { action: 'close_accumulator_valve' }, hold: 20,
          acc: { p: 'accumulator_valve_open', op: '<', v: 0.5 },
          hl: ['Accumulator valve'] },
        { text: 'LEG 3 — Dump SP 580 → 347 psi (4.00 → 2.39 MPa), Pressure SP 1004 → 641 psi (6.92 → 4.42 MPa), over 35 plant-minutes. Same programme, same subcooling. Somewhere in here the plant passes the 600 psi (4.14 MPa) accumulator cover gas with the valve already shut, which is the point of having shut it.',
          control: 'Dump SP', target: 'Tavg 429.8 °F (221 °C)',
          cmd: { action: 'set_steam_dump_setpoint', mpa: 2.39 }, hold: 2088,
          ramp: [{ action: 'set_steam_dump_setpoint', arg: 'mpa', points: [4.00, 3.54, 3.12, 2.73, 2.39] },
                 { action: 'set_pressure_setpoint',   arg: 'mpa', points: [6.92, 6.22, 5.57, 4.97, 4.42] }],
          acc: { p: 'tavg_c', op: '~', v: 221, tol: 4 },
          hl: ['Dump SP', 'Pressure SP', 'Tavg'] },
        { text: 'LEG 4 — the last secondary-led leg. Dump SP 347 → 197 psi (2.39 → 1.36 MPa), Pressure SP 641 → 395 psi (4.42 → 2.72 MPa), over 34 plant-minutes. You are driving to just under the 400 psi (2.76 MPa) RHR block-open permissive, because that is the only thing standing between you and shutdown cooling.',
          control: 'Dump SP', target: 'pressure below 400 psi (2.76 MPa), Tavg 379.4 °F (193 °C)',
          note: 'The dump on its own cannot take you much further: its setpoint clips at 29 psi (0.2 MPa), which is saturation for 251.6 °F (122 °C). Everything below that belongs to RHR.',
          cmd: { action: 'set_steam_dump_setpoint', mpa: 1.36 }, hold: 2016,
          ramp: [{ action: 'set_steam_dump_setpoint', arg: 'mpa', points: [2.39, 2.09, 1.82, 1.57, 1.36] },
                 { action: 'set_pressure_setpoint',   arg: 'mpa', points: [4.42, 3.94, 3.49, 3.09, 2.72] }],
          acc: { p: 'pressure_mpa', op: '<', v: 2.76 },
          hl: ['Dump SP', 'Pressure SP', 'Plant Pressure'] },
        { text: 'THROTTLE THE RHR HEAT EXCHANGER BEFORE YOU ALIGN IT: set the HX flow split to 7 % (RHR card). It is sitting at 100 % from the at-power lineup, and 100 % onto a 379.4 °F (193 °C) plant is a -1517.4 °F/hr (-843 °C/hr) shock.',
          control: 'Residual Heat Removal (RHR)', target: 'HX split 7 %',
          cmd: { action: 'set_rhr_hx', pct: 7 }, hold: 10,
          hl: ['Residual Heat Removal (RHR)'] },
        { text: 'Align RHR — open the hot-leg suction valve (RHR card → ALIGN). The engine refuses this above 425 psig (440 psi / 3.03 MPa) — the sourced WTSM 5.1 block-open permissive, which leg 4 already put you under. Note the two setpoints are not one number: the AUTOCLOSURE that would shut a standing-open valve is 585 psig (600 psi / 4.14 MPa), about 160 psi higher, so the valve does not chatter across a single boundary (#288; the 400/600 pair this step used to quote was the retired engine\'s).',
          control: 'Residual Heat Removal (RHR)', target: 'RHR aligned, ECCS mode RHR',
          cmd: { action: 'set_rhr', active: true }, hold: 20,
          acc: { p: 'rhr_active', op: '>', v: 0 },
          hl: ['Residual Heat Removal (RHR)', 'ECCS'] },
        { text: 'SECURE THE REACTOR COOLANT PUMPS. RHR provides the circulation from here, and with the pumps stopped the steam generator decouples (flow → 0) so it stops feeding heat back into the loop. Losing the pump heat helps too. Note the board reads this as a planned securing, not a casualty — RCP TRIP annunciates as a status, not a critical (#240).',
          control: 'RCP ON/OFF', target: 'pumps stopped, coasting down',
          cmd: { action: 'set_rcp', running: false }, hold: 20,
          acc: { p: 'pump_flow_pct', op: '<', v: 50 },
          hl: ['RCP Run/Stop', 'Reactor Coolant Pumps (RCP)'] },
        { text: 'RHR-LED COOLDOWN TO MODE 5. Walk the HX flow split up from 7 % to 25 % over the next two plant-hours and let the Pressure SP settle from 395 psi to 363 psi (2.72 → 2.50 MPa). The split has to keep rising because RHR removes heat in proportion to how far above its sink you are, and that gap is closing. Mode 4, Hot Shutdown is behind you at 350 °F (176.7 °C) and Mode 5, Cold Shutdown arrives at 199.4 °F (93 °C).',
          control: 'Residual Heat Removal (RHR)', target: 'Tavg below 199.4 °F (93 °C) — Mode 5',
          note: 'Measured: Mode 4 at 3.49 plant-h from the start, Mode 5 at 4.89 plant-h, 177 °F (80.5 °C) at the end of this step. Rate -65 to -118 °F/hr (-36 to -66 °C/hr) across the leg.',
          cmd: { action: 'set_rhr_hx', pct: 25 }, hold: 7200,
          ramp: [{ action: 'set_rhr_hx',            arg: 'pct', points: [7, 11.5, 16, 20.5, 25] },
                 { action: 'set_pressure_setpoint', arg: 'mpa', points: [2.72, 2.50] }],
          acc: { p: 'tavg_c', op: '<', v: 93 },
          hl: ['Residual Heat Removal (RHR)', 'Tavg', 'Plant Pressure'] },
        obs('Confirm Mode 5, Cold Shutdown: coolant below 199.4 °F (93 °C), pressure about 363 psi (2.50 MPa), RHR carrying the decay heat, pumps off.',
          { p: 'plant_mode', op: '~', v: 5, tol: 0.1 }, null, ['Tavg', 'Plant Pressure']),
        obs('Confirm the accumulators are still FULL and still isolated — 100 % inventory, discharge valve shut. They stay that way until PWR-N01 re-aligns them on the next heatup.',
          { p: 'accumulator_volume_pct', op: '>', v: 99 }, null, ['Accumulator valve']),
        obs('Confirm RHR is the heat sink and the suction valve is still open — this is the lineup the plant will sit in until it is either refuelled or brought back up.',
          { p: 'rhr_valve_open', op: '>', v: 0 }, null, ['Residual Heat Removal (RHR)']),
      ],
      guard: {
        never_melted: true,
        never: [
          { p: 'fuel_temp_c', op: '>=', v: 1200 },
          // Never uncover the core, never lose subcooling, never lift a relief — the
          // three things a cooldown must not do. Measured minima on the authored
          // ramps: inventory 100 %, subcooling 60.8 °F (33.8 °C), no lift.
          { p: 'core_inventory_pct', op: '<', v: 95 },
          { p: 'subcooling_c', op: '<', v: 5 },
          { p: 'sg_safety_open', op: '>', v: 0 },
          { p: 'porv_open', op: '>', v: 0 },
          // Never dump the accumulators. This is the #273 defect: the cooldown used to
          // walk past their 600 psi cover gas with the discharge valve open and empty
          // all four, and indicated pzr level could not reach its trip to say so.
          { p: 'accumulator_volume_pct', op: '<', v: 99 },
          // ON PROGRAMME, and LEFT AT -150 rather than tightened *(OWNER RULING,
          // 2026-08-02: "1 keep. 2. Keep. 3. Keep.")*. Tightening to ~-110 (15 % over the
          // worst authored transient) was offered and declined: it buys almost nothing and
          // risks flaking across instrument-noise seeds. Removing it was also offered —
          // measured, a staircase then scores 28/28 and nothing distinguishes it.
          // -150 °C/hr is not the programme (-50) — it is the line that
          // separates "a transient" from "the plant is running away", and it is set
          // where it is because the three ways this evolution is known to run away all
          // sit far beyond it: a missed trip block scrams and the dump goes to
          // Tavg-error mode (-306), a 10 °C setpoint STEP instead of a ramp (-649),
          // RHR aligned at a 100 % HX split (-843), and the setpoint driven to its
          // stop (-1300). The worst transient the authored ramps produce is -95, at
          // RHR placement, for about ten seconds.
          { p: 'tavg_rate_c_per_hr', op: '<', v: -150 },
        ],
      },
      outcome: 'Mode 5, Cold Shutdown, reached on integrated physics (#524, 2026-08-31): coolant below 199.4 degF (93 degC), depressurized to about 363 psi (2.50 MPa), RHR carrying the plant, reactor coolant pumps secured, accumulators full and isolated, boron at the cold shutdown margin. This is the state the `cold_shutdown` initial condition loads (its own shipped trim is 918 ppm). PWR-N01 takes it back up.',
    },
    // PWR-T06 — the post-trip response. Authored 2026-08-03 (#319): the procedure was
    // documented but had NO runnable checklist, while PWR-E03 (turbine trip) explicitly
    // sends the operator to it — *"Above P-9: confirm the automatic reactor trip and go to
    // the post-trip response."* A reactor trip is the most common significant event on a
    // plant and recovering from one was not an authored evolution.
    //
    // IT IS ALSO THE FIRST CONTENT ANYWHERE TO NAME `reset_rps`. That command has been
    // board-reachable since #75 and is required after EVERY scram, and no procedure,
    // mission or checklist mentioned it — the sharpest of the three orphaned operator
    // capabilities #319 found.
    //
    // MEASURED full stack, `hot_full_power`, shipped lineup, scram at t=60 s:
    //   t+1 s   power 33.4 % — reset REFUSED, `RODS_NOT_INSERTED`
    //   t+3 s   power 5.07 % — rods seated, reset ACCEPTED
    //   ~1 min  plant_mode 3; turbine tripped automatically
    //   ~3 min  main feedwater ISOLATED (restorable at SG FEED → RESTORE since #341/#319 item 2,
    //           but only after the RPS reset clears the trip half of the coincidence — see cautions)
    //   ~3 min  AFW auto-started; SG level 65 -> 36.6 % by t+7 min, then holds ~37 %
    //   settles 567.3 °F (297.4 °C) / 2235 psi (15.41 MPa) — hot, subcritical, Mode 3
    //
    // ACCEPTANCES ARE DELIBERATELY LAYER-ROBUST. AFW auto-start and the feedwater
    // isolation are M4 ACTUATIONS, so they do not happen in `run_procedures`, which is
    // engine-direct. Asserting `afw_active` here would pass under the stack and fail
    // engine-direct, and this procedure has no NON_ENGINE_ACTION to justify `stack_only`
    // with. So the AFW/MFW facts are carried as cautions and notes, and every `acc` is a
    // truth both layers produce: power, the scram latch, plant mode, no melt.
    {
      id: 'pwr_post_trip', category: 'emergency', manual_ref: 'PWR-T06',
      title: 'Post-trip response — Mode 1, At Power → Mode 3, Hot Standby',
      purpose: 'The reactor has tripped. Confirm the trip, reset the protection system, verify the plant has a heat sink, and stabilize hot and subcritical in Mode 3, Hot Standby. This is where PWR-E03 and the other at-power emergencies send you once the reactor is down.',
      from: 'hot_full_power',
      prereq: ['At-power operation, or any event that has just tripped the reactor.'],
      cautions: [
        'Reset the RPS only AFTER the rods are seated. The reset is refused with RODS_NOT_INSERTED while they are still travelling — measured, that is the first ~2 seconds, with power still around 33 %.',
        'Resetting the RPS re-closes the trip breakers. It does NOT withdraw the rods: the plant stays subcritical until you deliberately withdraw, and the startup net governs any re-ascent.',
        'MAIN FEEDWATER ISOLATES on the trip. Auxiliary feedwater is the heat sink from here — measured, AFW auto-starts and holds SG level near 37 %, and that is sufficient in Mode 3 indefinitely.',
        'Main feed can be restored at RESTORE on the SG FEED card, but the isolation SEALS IN: it is refused while the signal that closed it is still present. After a trip that means resetting the RPS first (step 2) — the low-Tavg isolation is a coincidence of low Tavg AND the trip latch. Restoring is optional here; a stable Hot Standby does not need main feed.',
        'If you do restore, set SG FEED RATE to match STEAM FLOW first. Main feed returns at whatever the pump was last commanded — measured, restoring into a generator that is already recovering drives level 36.6 % → 77 % in about two minutes and isolates you again at the 90 % high level.',
        'A reactor trip is not a cooldown. The plant stays HOT — measured, it settles at 567.3 °F (297.4 °C) and 2235 psi (15.41 MPa). Cooling down is PWR-N15, a separate evolution.',
      ],
      steps: [
        { text: 'Confirm the reactor is tripped — rods in, power collapsing. If it has not tripped and a trip is warranted, trip it manually: Reactor card → SCRAM.', control: 'SCRAM', target: 'power collapsing',
          cmd: { action: 'scram' }, hold: 30, acc: { p: 'power_pct', op: '<', v: 5 } },
        { text: 'Reset the Reactor Protection System. The SCRAM control now reads PRESS TO RESET — press it once the rods are seated. This clears the trip latch and re-closes the breakers; the rods stay in.', control: 'SCRAM', target: 'trip latch cleared',
          note: 'Refused with RODS_NOT_INSERTED if you try it while the rods are still travelling. Measured: refused at t+1 s, accepted at t+3 s.',
          cmd: { action: 'reset_rps' }, hold: 30, acc: { p: 'scrammed', op: '<', v: 1 } },
        { text: 'Verify the turbine is off the grid. A reactor trip trips the turbine, so the generator should already be disconnected — confirm it rather than assume it.', control: 'Main Breaker', target: 'turbine tripped, breaker open',
          hold: 60, acc: { p: 'turbine_tripped', op: '>', v: 0 } },
        { text: 'Verify the heat sink. Main feedwater has isolated; auxiliary feedwater should have started automatically and be holding steam generator level. Watch SG LEVEL stop falling.', control: 'AFW', target: 'SG level steadies',
          note: 'Measured under the shipped lineup: level falls 65 % → 36.6 % over about seven minutes, then holds near 37 %. Falling level early is expected — level that keeps falling is not.',
          hold: 420, acc: { p: 'melted', op: '<', v: 1 } },
        { text: 'Verify inventory and subcooling. The pressurizer should hold pressure with the heaters, and subcooling margin should stay positive — if it is eroding, you have a leak, not a plain trip.', control: 'Plant Pressure', target: 'subcooling positive',
          hold: 120, acc: { p: 'subcooling_c', op: '>', v: 0 } },
        obs('Declare Mode 3, Hot Standby: subcritical, rods in, RCS still hot and pressurized, heat sink established on AFW.',
          { p: 'plant_mode', op: '~', v: 3, tol: 0.5 },
          'From here the plant is stable indefinitely on decay heat. Going further down is PWR-N15 (cooldown to Mode 5); going back up is PWR-N03 (approach to criticality).',
          ['SCRAM', 'AFW', 'Tavg']),
      ],
      guard: { never_melted: true, never: [{ p: 'fuel_temp_c', op: '>=', v: 1200 }] },
      outcome: 'Mode 3, Hot Standby — subcritical with the trip latch reset, turbine off the grid, decay heat going to the steam generators on auxiliary feedwater, RCS hot at 567.3 °F (297.4 °C) and 2235 psi (15.41 MPa).',
    },
    {
      id: 'pwr_loss_of_feedwater', category: 'emergency', manual_ref: 'PWR-E01',
      title: 'Mode 1 emergency — loss of main feedwater',
      purpose: 'Main feedwater is gone and the Steam Generators (SG) are drying out. Trip the reactor and establish Auxiliary Feedwater (AFW) as the heat sink.',
      from: 'hot_full_power',
      prereq: ['At-power operation.'],
      cautions: ['Without a secondary heat sink, primary temperature and pressure rise quickly.'],
      steps: [
        { text: 'Confirm the loss of feedwater — Steam Generator level is falling. (Failures tab → inject Loss of Main Feedwater, or wait for the transient.)', control: '(observe SG level)', target: 'diagnose',
          cmd: { action: 'inject_failure', failure_id: 'loss_of_feedwater' }, hold: 20, acc: { p: 'sg_level_pct', op: '<', v: 65 } },
        { text: 'Trip the reactor to stop adding heat (this would also occur automatically on low SG level).', control: 'SCRAM',
          target: 'power collapsing', cmd: { action: 'scram' }, hold: 5 },
        { text: 'Take the turbine off load.', control: 'Turbine Load', target: '0 MWe', cmd: { action: 'set_steam_demand', mwe: 0 }, hold: 5 },
        { text: 'Start Auxiliary Feedwater (AFW) to restore the secondary heat sink (Emergency Cooling card → AFW → Start; on low SG level the armed AFW starts itself — starting it by hand also takes its arm to MANUAL).', control: 'AFW', target: 'core cooled',
          cmd: { action: 'set_afw', active: true }, hold: 120, acc: { p: 'power_pct', op: '<', v: 5 } },
        obs('Confirm the core is safe and decay heat is being removed.', { p: 'melted', op: '<', v: 1 }),
      ],
      guard: { never_melted: true, never: [{ p: 'fuel_temp_c', op: '>=', v: 1200 }] },
      outcome: 'Reactor tripped, secondary heat sink restored on AFW, core safe.',
    },
    {
      id: 'pwr_rcp_trip', category: 'emergency', manual_ref: 'PWR-E02',
      title: 'Mode 1 emergency — RCP trip / loss of flow',
      purpose: 'A Reactor Coolant Pump (RCP) has tripped and coolant flow is falling. Confirm the protective trip and stabilize.',
      from: 'hot_full_power',
      prereq: ['At-power operation.'],
      cautions: [
        'Low flow lets heat build locally — the low-flow trip protects the core, and at 90 % of rated flow it acts in about two seconds.',
        'RCS flow is a SINGLE channel. If the pump is gone and the flow indication disagrees, believe the pump: the trip reads that same channel and will not fire.',
      ],
      steps: [
        { text: 'The pump has tripped — coolant flow is coasting down. (Failures tab → inject RCP Trip.) The reactor trips automatically on low RCS flow, below 90 % of rated.', control: '(observe RCS flow)', target: 'reactor trips',
          cmd: { action: 'inject_failure', failure_id: 'rcp_trip' }, hold: 15 },
        { text: 'Trip the reactor if it has not already tripped, and remove turbine load.', control: 'SCRAM', target: 'power collapsing',
          cmd: { action: 'scram' }, hold: 30, acc: { p: 'power_pct', op: '<', v: 8 } },
        // "natural circulation" removed 2026-07-29: natural_circ_flow is 0.0 and this
        // plant does not model it, so the step asked the operator to confirm cooling by
        // a mechanism that does not exist. Decay-heat removal here is through the SGs.
        obs('Confirm shutdown, and decay heat going to the steam generators (AFW as required).', { p: 'melted', op: '<', v: 1 }),
      ],
      guard: { never_melted: true },
      outcome: 'Reactor safely shut down after loss of forced flow.',
    },
    {
      id: 'pwr_stuck_porv', category: 'emergency', manual_ref: 'PWR-E07',
      title: 'Mode 1 emergency — stuck-open PORV recover (small-break LOCA)',
      purpose: 'The Power-Operated Relief Valve (PORV) is stuck open — a small-break Loss-Of-Coolant Accident (LOCA) — while its indicator may read closed. Diagnose on the subcooling margin and ISOLATE with the block valve. This is the TMI recovery that was missed in 1979.',
      from: 'hot_full_power',
      prereq: ['At-power operation.'],
      cautions: ['Do NOT trust the PORV position light — it shows the command, not reality.', 'Do NOT throttle High-Pressure Injection (HPI) on a rising Pressurizer level; the level rises even as inventory is lost.'],
      steps: [
        { text: 'The PORV is stuck open and its indicator reads closed. (Failures tab → inject PORV Stuck Open.) Inventory is leaking. Diagnose it on the SUBCOOLING readout (Power & Reactivity card): it drops hard as coolant is lost. Watch what happens next, because it is the trap — emergency injection comes in by itself and the margin comes most of the way BACK, with the leak still running. A margin that recovers is not a leak that stopped.', control: '(observe subcooling)', target: 'recognize the leak',
          // `saw`, not `acc` (#245). The claim this step teaches is that inventory IS
          // being lost — which it is, from injection to about t=8 s. It is not a claim
          // about where inventory sits 30 s later, because by then automatic HPI has
          // come in on low pressure and refilled past nominal (measured under the
          // shipped lineup: 99.65 → 98.01 % by t=6, HPI actuates at 10.5 MPa, then
          // 117.6 % by t=16 with the pressurizer at 88 % and subcooling gone). That is
          // the plant doing the right thing — it is TMI's own trap, the solid
          // pressurizer that invites throttling injection, and this procedure's own
          // caution warns about it. An end-of-step `acc: core_inventory_pct < 100`
          // contradicted it, and only ever passed because the harness was starving the
          // run to ~3 s of sim time. The subcooling `acc` below is the diagnosis signal
          // the step's own text points the player at, and it holds at both ends.
          // BOTH claims are `saw`, and at #348 that stopped being a style choice. The step
          // used to close with `acc: subcooling_c < 20` — an END-of-hold value — and the two
          // layers no longer agree on any end-of-hold value at all. Measured at t+30 s:
          // engine-direct the margin closes at **−5.2 °C** with the plant boiling, and under
          // the stack safety injection catches it and it closes at **+36.6 °C**, recovered.
          // The `acc` passed engine-direct and failed under the stack, which is the #209 class
          // — an acceptance certifying a plant the player never gets.
          //
          // What is true at BOTH layers is the TRANSIENT: the margin dives to 20.9 °C or below
          // (from ~41 °C) and inventory dips under nominal, on every layer, every time. That is
          // also exactly what the step teaches — the leak announces itself and then hides again
          // behind the injection that answered it — so the honest form of the claim and the
          // layer-robust one are the same sentence. `saw` takes a list since this change.
          // hold 240, was 90 (#408), was 30 — the third re-clock of the same watch, same
          // claim each time. #419 wave 2 (K 3144 → 2500): the honest pressure authority
          // dives 41 → ~34 °C by 40 s, PLATEAUS ~37 °C while the post-scram settle fights
          // the leak (1m–2m30), then collapses through 25 °C at ~2m50s and saturates
          // (measured full stack). Also true at real flows and worth knowing:
          // injection no longer refills past nominal — a full-open PORV (1.31e-3 frac/s)
          // outruns full HPI (2.0e-4) on this plant, and inventory keeps falling with
          // injection in, so the deception below rides the void/level term alone.
          cmd: { action: 'inject_failure', failure_id: 'stuck_porv_open' }, hold: 240,
          saw: [{ p: 'core_inventory_pct', op: '<', v: 100 },
                { p: 'subcooling_c', op: '<', v: 25 }] },
        { text: 'Also mask the indicator, as at TMI: Failures tab → inject PORV Indicator Stuck Closed. Trust subcooling, not the PORV light.', control: '(observe PORV light vs subcooling)', target: 'trust subcooling, not the light',
          cmd: { action: 'inject_failure', failure_id: 'porv_indicator_stuck_closed' }, hold: 10 },
        { text: 'ISOLATE the leak: Relief Valves card → PORV Block Valve → Isolate. This stops the loss even though the PORV itself is stuck open.', control: 'PORV Block Valve', target: 'inventory stops falling',
          note: 'Click Isolate under PORV Block Valve. Then restore inventory and pressure with HPI / charging.',
          cmd: { action: 'close_block_valve' }, hold: 60, acc: { p: 'melted', op: '<', v: 1 } },
        obs('Confirm inventory has stabilized and the core stays covered.', { p: 'melted', op: '<', v: 1 }),
      ],
      guard: { never_melted: true, never: [{ p: 'fuel_temp_c', op: '>=', v: 1200 }] },
      outcome: 'Leak isolated with the block valve; core stays covered — the recovery TMI missed.',
    },
    // PWR-E03 — turbine trip. Authored 2026-08-03 (#319 item 1). Pairs with PWR-T06: E03 is the
    // procedure that SENDS you to the post-trip response, and until T06 was built there was
    // nothing at the other end of that pointer.
    //
    // MEASURED full stack, `hot_full_power`, shipped lineup, `trip_turbine` at t = 60 s:
    //   +31 s   reactor ALREADY SCRAMMED (P-9), MWe 0, steam dump SATURATED at 40.00 %
    //           — its entire capacity — SG level swelled 65 → 72.1 %, pzr level 55 → 61.6 %
    //   settles Tavg 567.5 °F (297.5 °C), SG level 36.5 %, pzr 38.6 %, dump modulating 4–9 %
    //
    // The dump pinning at exactly 40.00 % is the #220/40 % ruling made visible: this is the
    // event where the operator SEES the dump reach its stop and stay there. At the old 1.05
    // capacity it never saturated and the interlock could only be asserted, never demonstrated.
    //
    // STEP 2 CARRIES AN EXPLICIT SCRAM AND THE TEXT SAYS WHY. The P-9 reactor-trip-on-turbine-
    // trip is an M4 function, so `run_procedures` (engine-direct) has no RPS and will not trip
    // on its own — the same layer wall PWR-T06 and PWR-E06 hit. Rather than assert a trip the
    // engine-direct plant cannot produce, the step does what PWR-E03 step 2 and the chapter's
    // generic action 1 both say: CONFIRM the automatic trip, and manually scram if power should
    // be down and is not. On the shipped plant the confirm is all the player does.
    {
      id: 'pwr_turbine_trip', category: 'emergency', manual_ref: 'PWR-E03',
      title: 'Mode 1 emergency — turbine trip above P-9',
      purpose: 'The turbine has tripped at power. Above 50 % power that scrams the reactor automatically — your job is to confirm it happened, watch the steam dump take the heat the turbine is no longer taking, and hand over to the post-trip response.',
      from: 'hot_full_power',
      prereq: ['At-power operation above P-9 (≥ 50 % power).'],
      cautions: [
        'DO NOT PLAN TO RIDE OUT A TURBINE TRIP AT POWER. This plant carries Reactor Trip on Turbine Trip (P-9, ≥ 50 %). What it rides out is a LOAD REJECTION — the generator taking less load with the turbine still on line — which is a different event and does not arm P-9.',
        'A planned offline is not a turbine trip. Taking the generator off line with the OFF selector opens the breaker, leaves the stop valves open, latches nothing and never arms P-9. It is reversible; a trip is not.',
        'The steam dump is finite. Measured, it saturates at its full 40 % capacity in this transient and stays there — watch it reach the stop, because that is the plant telling you it has nothing left to give.',
      ],
      steps: [
        { text: 'The turbine trips. (Failures tab → inject Turbine Trip, or it arrives on its own.) Steam demand collapses to nothing and the generator drops off the grid.', control: '(observe MWe and turbine state)', target: 'turbine tripped, 0 MWe',
          cmd: { action: 'trip_turbine' }, hold: 20, acc: { p: 'turbine_tripped', op: '>', v: 0 } },
        { text: 'CONFIRM the reactor tripped. Above P-9 it goes automatically and immediately — you should be verifying a scram that has already happened, not causing one. If power is not collapsing, scram manually now.', control: 'SCRAM', target: 'reactor tripped, power collapsing',
          note: 'On the shipped plant the trip is automatic and arrives with the turbine trip, not after it. The SCRAM command here is the "if it did not" half of the procedure.',
          cmd: { action: 'scram' }, hold: 60, acc: { p: 'power_pct', op: '<', v: 5 },
          saw: { p: 'steam_dump_valve_pct', op: '>', v: 25 } },
        { text: 'Watch the steam dump. With the turbine gone it is the only path for the heat still coming out of the core, and it drives open on Tavg error. Measured, it goes to its stop — 28 % of rated steam flow, all of it (Ginna\'s own capacity, #419) — and holds there through the worst of the transient, with the atmospheric dump valve helping over the peak.', control: 'Steam Dump', target: 'dump at its stop',
          note: 'The saturation is EARLY — measured, the dump is at its 28 % stop about half a minute after the trip and backs off within minutes, so the assertion for it lives on the previous step. What you are watching here is it modulating back down as decay heat falls.',
          hold: 120, acc: { p: 'melted', op: '<', v: 1 } },
        { text: 'Control steam generator level through the swell. Losing steam demand swells the generator before decay heat brings it back down — the level you see first is not the level you will settle at.', control: 'SG Level', target: 'level swells then settles',
          note: 'Measured: SG level swells 65 → 72.1 % in the first half-minute, then falls away to about 36.5 % as the plant settles on decay heat and auxiliary feedwater.',
          hold: 300, acc: { p: 'melted', op: '<', v: 1 } },
        obs('Confirm the plant is stable, hot and subcritical — this is Mode 3, Hot Standby, and from here you are in the post-trip response (PWR-T06).',
          { p: 'plant_mode', op: '~', v: 3, tol: 0.5 },
          'Measured settled condition: Tavg 567.5 °F (297.5 °C), steam dump modulating a few per cent, SG level near 36.5 %. PWR-T06 picks up from exactly here — including the RPS reset, which this procedure does not do.',
          ['SCRAM', 'Steam Dump', 'Tavg']),
      ],
      guard: { never_melted: true, never: [{ p: 'fuel_temp_c', op: '>=', v: 1200 }] },
      outcome: 'Turbine trip absorbed: reactor tripped automatically on P-9, the steam dump carried the transient at its full 40 % capacity, and the plant is stable in Mode 3, Hot Standby ready for the post-trip response.',
    },
    // PWR-E13 — ATWS. Authored 2026-08-03 (#319 item 4). `stack_only`, and this is the first
    // procedure I have authored where the flag is genuinely EARNED rather than unavailable:
    // emergency boration is the whole response and it runs through `set_auto_setpoint` on the
    // `boron_conc` channel, which is an M4-only command. Below M4 there is no boration at all,
    // so replaying this engine-direct would not test a weaker ATWS — it would test one with no
    // response. That is exactly the PWR-N15 case the flag exists for.
    //
    // A CLAIM THIS REPO CARRIED IS WRONG, AND THIS PROCEDURE IS WHERE IT WAS CAUGHT.
    // `CLAUDE.md` says of the pressurizer code safeties that "a real transient cannot reach them
    // at all ... so only an ATWS or a failed instrument gets there", and I repeated the ATWS half
    // in my own voice when ruling Tier C. Measured 2026-08-03, three ways, full stack:
    //   ATWS from a turbine trip                    peak 2321 psi (16.00 MPa), safeties NEVER lift
    //   + total loss of feedwater                   peak 2293 psi (15.81 MPa), never lift
    //   + PORV block valve shut as well             pressure never approaches the pop either
    // The pop is 2484 psi (17.13 MPa). **An ATWS does not get there**, because the negative
    // moderator coefficient collapses power before pressure can run: 100 % -> 43.6 % in five
    // minutes with nobody touching anything. I have not proven NO ATWS could reach the safeties,
    // only that these three do not. The code safeties' reachability is back to being an open
    // question, and `CURRICULUM.md` no longer claims ATWS answers it.
    //
    // WHAT IT ACTUALLY TEACHES IS BETTER THAN WHAT I THOUGHT. This is A1 at its most dramatic —
    // the negative MTC is *the* reason a PWR ATWS is survivable — followed by A8: boron is what
    // finishes it. Measured mitigated, boron target to 1400 ppm at t+2 min:
    //   5 min   43.6 %   (MTC alone, no operator action)
    //   25 min  34.2 %   boron 684 ppm
    //   35 min   9.6 %   boron 714 ppm
    //   45 min   0.04 %  boron 744 ppm — subcritical
    // 126 ppm and about 44 minutes, with pressure never leaving 2235 psi (15.41 MPa).
    {
      id: 'pwr_atws', category: 'emergency', manual_ref: 'PWR-E13', stack_only: true,
      title: 'Mode 1 emergency — failure to scram (ATWS)',
      purpose: 'A trip is demanded and the rods do not go in. The reactor will not be shut down by the control rods, so it has to be shut down chemically — boration is the response, and the negative temperature coefficient of the plant itself buys you the time to do it.',
      from: 'hot_full_power',
      prereq: ['At-power operation.'],
      cautions: [
        'THE PLANT SAVES ITSELF FIRST. Measured, power falls 100 % → 43.6 % in five minutes with nobody doing anything — the negative moderator coefficient. That is the margin you are working inside; it is not a fix.',
        'BORATION IS THE ONLY REAL ACTION. Measured, 126 ppm over about 44 minutes takes it from full power to subcritical. Start it early: the clock is the response.',
        'Keep the heat sink. An ATWS with a dry steam generator is the catastrophic version — feed or AFW is not optional here.',
        'The pressurizer code safeties are NOT the story. Measured three ways, an ATWS peaks at 2321 psi (16.00 MPa) against a 2484 psi (17.13 MPa) pop and never lifts them.',
      ],
      steps: [
        { text: 'A trip is demanded — here by a turbine trip above P-9 — and the rods do not go in. (Failures tab → inject Failure to Scram first, then Turbine Trip.) The board shows the trip and power does not collapse.', control: '(observe rods and power)', target: 'trip demanded, power holding',
          cmd: { action: 'inject_failure', failure_id: 'failure_to_scram' }, hold: 20 },
        { text: 'Trip the turbine to remove load, which is what demands the reactor trip above P-9. Watch the demand arrive and the rods stay out.', control: 'Main Breaker', target: 'reactor trip demanded, rods stay out',
          cmd: { action: 'trip_turbine' }, hold: 60 },
        { text: 'Attempt the manual SCRAM again. It will not work — but confirming that is what tells you this is an ATWS and not a slow trip.', control: 'SCRAM', target: 'scram refused, rods stay out',
          cmd: { action: 'scram' }, hold: 240,
          note: 'Meanwhile the plant is already helping: power falls toward the low 70s on the moderator coefficient alone as Tavg rises — the MTC throttles the unscrammed core toward what the 28 % dump can carry (#419: the equilibrium sat near 43 % on the old 40 % dump; the smaller honest sink parks it higher). Do not mistake that for the trip working.',
          acc: { p: 'power_pct', op: '<', v: 78 } },
        { text: 'EMERGENCY BORATION — Boron control ON, target well above current. This is the actual shutdown mechanism: with the rods unavailable, boron is the only reactivity control you have left.', control: 'Boron control', target: 'boron rising toward shutdown',
          cmd: { action: 'set_auto_setpoint', channel_id: 'boron_conc', value: 1400 }, hold: 1500,
          note: 'Measured class (#419 anchor): roughly 130 ppm of boration over about three-quarters of an hour takes the core from full power to subcritical. It is slow by design — that is what the temperature coefficient is buying you.',
          acc: { p: 'boron_ppm', op: '>', v: 660 } },
        { text: 'Hold the heat sink while the boron works — auxiliary feedwater on the steam generator, steam dump carrying what the core is still making. An ATWS with a dry generator is the version that damages fuel.', control: 'AFW', target: 'heat sink maintained',
          cmd: { action: 'set_afw', active: true }, hold: 1200,
          acc: { p: 'power_pct', op: '<', v: 5 } },
        // hold added at #419 wave 3: the anchor re-solve moved hot critical boron up
        // ~22 ppm, so the same boration timeline arrives ~7 min later at the < 1 % mark
        // (measured 1.28 % at the old step end, still falling).
        { text: 'Confirm the core is subcritical on boron — power collapsing toward zero with the rods still out. The plant is shut down chemically, not mechanically, and it stays that way until the boron comes back out.',
          control: '(observe)', target: 'power < 1 %, rods still out', hold: 600,
          acc: { p: 'power_pct', op: '<', v: 1 },
          note: 'Measured end-state class: power well under 1 % with boration continuing toward the target, Tavg near the no-load anchor, pressure never leaving 2235 psi (15.41 MPa) — the code safeties are not part of this event.',
          hl: ['Boron control', 'SCRAM', 'AFW'] },
      ],
      guard: { never_melted: true, never: [{ p: 'fuel_temp_c', op: '>=', v: 1200 }] },
      outcome: 'Reactor shut down CHEMICALLY with the rods unavailable: the moderator coefficient held power down while ~130 ppm of boron over about three-quarters of an hour took the core subcritical, heat sink maintained throughout and the pressurizer safeties never challenged.',
    },
    // PWR-E17 — continuous rod withdrawal. Authored 2026-08-03 (#319 item 5). This one is the
    // direct BEFORE/AFTER for the #311 protection work, and it is worth having the pair:
    //   flag OFF (#311's own measurement): 114.8 % power held for ~17 s with NO TRIP, because
    //     the power-range high trip sits at 120 % and nothing else was watching.
    //   flag ON  (measured 2026-08-03, full stack, severity 0.5 = 3 steps/s):
    //     t+6.1 s  `opdt_approach` annunciates — 1.8 s of warning
    //     t+7.9 s  SCRAM, reason `opdt_margin low`, at 114.6 % power
    //   Same peak. The difference is that the plant STOPS there instead of riding it.
    //
    // THE ROD STOP NEVER ENGAGES, and that is the lesson rather than a defect. OPΔT's stop is
    // an INTERLOCK on `rod_start`/`rod_nudge` — it blocks the OPERATOR. A runaway is not an
    // operator, and `pwr_engine.js` refuses operator rod commands on the control bank outright
    // while the failure is active (`!(g.id === 'control_rods' && s._fail.rod_runaway.active)`).
    // So the control-grade defence is bypassed by construction and only the TRIP saves the core.
    // Measured, the 1.5 DPM startup-rate block (§8.18) does not fire either: SUR peaks at
    // 0.46 DPM, nowhere near it. At power, OPΔT is the whole defence.
    //
    // Step 2 has the operator try to insert AND EXPECT IT TO FAIL — that is PWR-E17 step 1 as
    // written, and the failed attempt is what teaches that this is not a control problem.
    // Step 3 carries an explicit scram for the usual layer reason: OPΔT is an M4 trip, so
    // `run_procedures` engine-direct has no RPS and would ride the transient.
    {
      id: 'pwr_rod_withdrawal', category: 'emergency', manual_ref: 'PWR-E17',
      title: 'Mode 1 emergency — continuous rod withdrawal',
      purpose: 'The control bank is withdrawing on its own and power is climbing. Try to insert against it, find that you cannot, and trip the reactor — the overpower protection is what actually stops this, not the rod controls.',
      from: 'hot_full_power',
      prereq: ['At-power operation.'],
      cautions: [
        'YOU CANNOT ROD YOUR WAY OUT OF THIS. A runaway ignores operator rod commands on the control bank outright — attempting Lower is a diagnostic, not a fix.',
        'The OPΔT ROD STOP will not save you either. It is an interlock on operator rod motion, and a runaway is not an operator. Only the trip stops it.',
        'The startup-rate block does not fire at power. Measured, the rate peaks near 0.46 DPM against a 1.5 DPM block — that interlock is a startup defence, not this one.',
        'Do not wait for the power-range high trip at 120 %. Measured, overpower ΔT trips first at about 114.6 %; without it this casualty rides above 114 % un-tripped.',
      ],
      steps: [
        { text: 'The bank starts withdrawing on its own. (Failures tab → inject Continuous Rod Withdrawal.) Watch STARTUP RATE go positive and power climb off 100 %.', control: '(observe rod position and power)', target: 'power climbing',
          cmd: { action: 'inject_failure', failure_id: 'continuous_rod_withdrawal', severity: 0.5 }, hold: 8,
          saw: { p: 'power_pct', op: '>', v: 104 } },
        { text: 'Try to insert against it — Reactor card → Control Bank → Lower, and hold. It will not work: the bank ignores you while the runaway is active. That failed attempt IS the diagnosis, and it tells you this is a protection problem, not a control problem.', control: 'Control Bank', target: 'insertion refused — rods keep going',
          note: 'The engine refuses operator rod commands on the control bank outright while this failure is active. Expect no response at all, not a slow one.',
          cmd: { action: 'rod_start', group_id: 'control', direction: -1 }, hold: 6,
          saw: { p: 'power_pct', op: '>', v: 108 } },
        { text: 'TRIP THE REACTOR. On the shipped plant overpower ΔT does it for you at about 114.6 % — you should be confirming a trip that has already happened, with the OPΔT approach alarm having come in a second or two before it. If power is still climbing, scram now.', control: 'SCRAM', target: 'power collapsing',
          note: 'Measured: OPDT APPROACH at t+6.1 s, scram at t+7.9 s on `opdt_margin low`. Without that protection the plant holds 114.8 % for ~17 s and never trips, because power-range high sits at 120 %.',
          cmd: { action: 'scram' }, hold: 60, acc: { p: 'power_pct', op: '<', v: 5 } },
        { text: 'Verify the rods went in. A runaway that also sticks on the scram is a different and much worse event — PWR-E18 — so confirm power is genuinely collapsing and not levelling off.', control: 'Control Bank', target: 'rods in, power collapsing',
          hold: 60, acc: { p: 'power_pct', op: '<', v: 1 } },
        obs('Stabilize on the heat sink: turbine off the grid, steam dump carrying decay heat, auxiliary feedwater holding steam generator level. This is Mode 3, Hot Standby — the post-trip response (PWR-T06) takes it from here.',
          { p: 'plant_mode', op: '~', v: 3, tol: 0.5 },
          'The rod withdrawal failure is still injected — clear it before attempting any restart, or the same thing happens on the way back up.',
          ['SCRAM', 'Control Bank', 'AFW']),
      ],
      guard: { never_melted: true, never: [{ p: 'fuel_temp_c', op: '>=', v: 1200 }] },
      outcome: 'Runaway terminated by the reactor trip — overpower ΔT on the shipped plant — with the core undamaged and the plant stable in Mode 3, Hot Standby.',
    },
    // PWR-E06 — SGTR. Authored 2026-08-03 (#319 item 2), AFTER #322 was investigated and ruled.
    //
    // THIS PROCEDURE WAS BLOCKED FOR A DAY BECAUSE TWO OF ITS SIX STEPS TAUGHT THINGS THE PLANT
    // DOES NOT DO, and the fix was to the MANUAL, not the physics *(OWNER RULING, 2026-08-03:
    // "Declare")*. Measured, and now declared at `DESIGN_COMPANION.md` §8.26:
    //   · SG level does NOT rise. The leak is a primary-side mass sink with ΔP modulation;
    //     `leak_to_sg` names the ΔP dependence and routes nothing, and the SG level integrator
    //     is `(feedwater_flow − steam_out)` with no leak term. Measured: level held 67.98 %
    //     CONSTANT for four minutes with feed, AFW and steam flow all zero.
    //   · The MSIV does not change the secondary pressure trend — 134.6 psi open vs 134.0 shut.
    //     SG pressure is capped at Psat(Tavg), so it follows primary TEMPERATURE.
    // So this checklist diagnoses on the PRIMARY side only, which is what the plant actually
    // gives you. The reason it is not worth building the secondary side is scope, not fidelity:
    // one steam generator is modelled, so "which generator is leaking" — the whole point of the
    // level cue on a real plant — cannot be taught here at any fidelity.
    //
    // WHAT DOES WORK IS THE GOOD HALF, and it is the reason the procedure exists. The leak is
    // ΔP-scaled, so depressurizing toward the secondary SELF-LIMITS it. Measured full stack,
    // severity 0.5: dropping the Pressure SP took the primary 2223 → 1433 psi (15.33 → 9.88 MPa)
    // and break flow 0.0129 → 0.0062 — a 52 % cut. That is Tier A A3 (pressure follows
    // temperature; subcooling is the margin) under casualty conditions.
    //
    // Step 2 SCRAMS EXPLICITLY rather than waiting for the automatic trip. E06 step 1 says
    // "SCRAM if not automatic", so that is faithful — and it is also what makes the run
    // layer-robust: the RPS is M4, so `run_procedures` (engine-direct) would never trip on its
    // own. Same lesson as PWR-E23: an acceptance has to be a truth BOTH layers produce.
    {
      id: 'pwr_sgtr', category: 'emergency', manual_ref: 'PWR-E06',
      title: 'Mode 1 emergency — steam generator tube rupture',
      purpose: 'A primary-to-secondary leak through a ruptured tube. It outruns charging, so the plant trips itself. Diagnose it on the PRIMARY side, then depressurize toward secondary pressure — the leak is driven by the pressure difference, so closing that difference is what shuts it down.',
      from: 'hot_full_power',
      prereq: ['At-power operation.'],
      cautions: [
        'THE STEAM GENERATOR WILL NOT CONFIRM THIS FOR YOU. SG level does not rise and the MSIV does not change the secondary pressure trend — a declared departure (DESIGN_COMPANION §8.26), because this trainer models one steam generator and the level cue exists on a real plant to tell you WHICH one is leaking.',
        'Diagnose on the primary: inventory falling with charging saturated, pressurizer level driving through the trip, subcooling eroding.',
        'Depressurize with subcooling in hand. The leak stops when the primary reaches secondary pressure — but a primary taken below saturation is a different emergency.',
        'Unlike a seal leak (PWR-E23), this one IS pressure-modulated. That is the whole strategy: you terminate it from the control room by closing the ΔP.',
      ],
      steps: [
        { text: 'The rupture opens. (Failures tab → inject Steam Generator Tube Rupture.) Primary inventory starts leaving through the tube into the secondary — charging comes up to meet it and cannot.', control: '(observe inventory and charging)', target: 'inventory falling',
          note: 'Measured at this severity (#408 real flows): break flow starts near 145 gpm (3.2e-4 inventory-frac/s), well beyond the 60 gpm (1.33e-4) maximum the charging pump can make up.',
          cmd: { action: 'inject_failure', failure_id: 'sgtr', severity: 0.25 }, hold: 90,
          saw: { p: 'core_inventory_pct', op: '<', v: 100 } },
        { text: 'Trip the reactor. On the real plant the low pressurizer level trip does it for you as make-up loses the race — do not wait for it if pressure and level are already going.', control: 'SCRAM', target: 'power collapsing',
          cmd: { action: 'scram' }, hold: 60, acc: { p: 'power_pct', op: '<', v: 5 } },
        { text: 'Establish the heat sink. Main feed is gone with the trip — start auxiliary feedwater and keep the steam generator wet, or the primary has nowhere to put decay heat while you are working the leak.', control: 'AFW', target: 'AFW delivering',
          cmd: { action: 'set_afw', active: true }, hold: 60, acc: { p: 'afw_active', op: '>', v: 0 } },
        { text: 'Ensure high-pressure injection is in. Charging has already lost this race — HPI is what keeps the core covered while you work the leak, and it is the difference between a stabilized plant and a damaged one.', control: 'HPI/LPI', target: 'HPI injecting',
          note: 'On the shipped plant HPI actuates itself on low pressure. Confirming it is a real step, not a formality — engine-direct, without it, this casualty takes fuel temperature past 2192 °F (1200 °C).',
          cmd: { action: 'set_hpi', active: true }, hold: 60, acc: { p: 'hpi_active', op: '>', v: 0 } },
        { text: 'Confirm the diagnosis on the PRIMARY side — inventory down, pressurizer level low, subcooling shrinking. Do not go looking for it on the steam generator; on this plant the secondary tells you nothing.', control: 'Plant Pressure', target: 'primary-side signature',
          // #408 RE-POINTED (was leak_flow > 0.004): engine-direct the post-scram drain takes
          // the primary THROUGH secondary pressure (P 8.8 vs SG 8.1 with the heater-cut latch
          // holding the pzr restore off), so a break-flow acceptance there is a coin toss
          // around dP = 0 — while under the stack it reads 1.56e-4. The step's own text names
          // the confirmation: the PRIMARY-side signature. Inventory is that signature in both
          // layers (95.7 engine-direct / 96.9 stack, vs 100 healthy).
          hold: 60, acc: { p: 'core_inventory_pct', op: '<', v: 98 } },
        { text: 'Secure high-pressure injection. Check your criteria FIRST — subcooling in hand, heat sink established, the core covered — because this is the step that makes the next one possible: injection is holding the primary up at pressure, and while it runs the Pressure SP does nothing at all and the leak does not move. KEEP WATCHING SUBCOOLING after you secure -- the criteria are a standing condition, not a one-time check (PWR-E06 step 3a/3b). If the margin reaches zero, restore high-pressure injection before you finish the depressurization, and verify it on HPI FLOW rather than the HPI ACTUATED light: that light is the safety-injection signal, so it stays dark when YOU restart the pumps.', control: 'HPI/LPI', target: 'HPI secured',
          note: 'RE-MEASURED at the #408 real flows, and the reason this step exists CHANGED with them. On the compressed plant, injection out-pressurized the setpoint channel and the SP walk-down cut break flow by 0 % until HPI was secured. Real HPI (2.0e-4 frac/s) cannot do that: measured, the walk-down works with injection still in — but the plant then climbs through 101 % inventory at ten minutes and keeps filling toward solid, which challenges the PORV. That overfill is exactly what the SI-termination criteria in every real SGTR procedure exist to prevent, and it is now the measured reason for this step. Check the criteria first: subcooling in hand, heat sink on AFW, core covered.',
          cmd: { action: 'set_hpi', active: false }, hold: 60,
          acc: { p: 'hpi_active', op: '<', v: 1 } },
        { text: 'Now close the pressure difference. Walk the PRESSURE SP down toward secondary pressure — the leak is driven by primary-minus-secondary ΔP, so every psi you come down is break flow you do not lose.', control: 'Pressure SP', target: 'break flow falling',
          note: 'Measured at this severity with injection secured at the previous step (#408 real flows): closing the gap took primary 1774 -> 1452 psi (12.23 -> 10.01 MPa) and cut break flow 1.36e-4 -> 6.2e-5, a 54 % reduction. It holds near 6.1e-5 (27 gpm) with inventory RECOVERING on charging alone - 97 -> 99.6 % over ten minutes - and peak fuel 581 F (305 C) against the 2192 F (1200 C) guard.',
          cmd: { action: 'set_pressure_setpoint', mpa: 10.0 }, hold: 60,
          acc: { p: 'leak_flow', op: '<', v: 1.0e-4 } },   // #408 re-band: discriminates — 1.36e-4 before the walk-down, 6.2e-5 after (was < 0.005, which real flows never exceed)
        obs('Confirm the leak is throttled and the core is still covered. The plant is not fixed — it is stabilized, with the leak held down by the pressure you are holding. A real recovery continues into a cooldown on the intact loop.',
          { p: 'melted', op: '<', v: 1 },
          'The break flow will creep back up as the secondary blows down and the ΔP reopens. That is the physics, not a failure of the action — it is why a real SGTR ends in a cooldown rather than a hold.',
          ['Pressure SP', 'Plant Pressure']),
      ],
      guard: { never_melted: true, never: [{ p: 'fuel_temp_c', op: '>=', v: 1200 }] },
      outcome: 'Reactor tripped, leak diagnosed on the primary side, and break flow cut by more than half by depressurizing toward the secondary — the ΔP strategy the procedure exists to teach.',
    },
    // PWR-E23 — the everyday leak. Authored 2026-08-03 (#319 item 3). This is the ONLY
    // abnormal procedure on the plant where nothing breaks: charging holds it indefinitely,
    // there is no trip, no ESF and no subcooling loss, and the whole lesson is that you have
    // to READ the board rather than react to it.
    //
    // `rcp_seal_leak` had NO test coverage of any kind before this — not a behaviour probe,
    // not a scenario, nothing. Every claim below was measured for the authoring.
    //
    // MEASURED full stack, `hot_full_power`, shipped lineup, severity 0.4 injected at t=120 s.
    // The manual's numbers are right in every particular, which is worth recording because it
    // is not the usual outcome of checking one:
    //   charging   0 -> 0.0417 and HOLDS, letdown steady at 0.0300
    //   pzr level  parks at 53.79-53.81 % — the manual says "around 52-54 %"
    //   subcooling 73.77 °F (40.99 °C), UNCHANGED from the pre-leak value
    //   inventory  settles 98.82 % — a standing deficit, not a descent
    //   no trip, power stays 100 %
    // ALARMS, measured against `.state` rather than presence (the `getAlarms()` trap):
    //   t+60 s   nothing active at all
    //   t+181 s  `charging_high` active — and it is the ONLY alarm that ever comes in
    //   PZR LVL LO (program - 20) and PZR LVL DEV LO never assert, exactly as the procedure warns
    //
    // Step 1 puts CVCS in AUTO explicitly — real procedure (confirm the lineup before you
    // judge a leak by how hard make-up is working).
    //
    // THE CHARGING CUE IS M4-DEPENDENT AND THE ACCEPTANCES HAD TO GIVE WAY TO THAT. I assumed
    // `set_cvcs_auto` being an ENGINE command would make the charging number layer-robust. It
    // does not: measured on the SAME leak (#408 real currency), charging settles at 9.4e-5
    // under the stack and 2.57e-5 engine-direct — apart because the `cvcs_makeup` M4 channel
    // (and its letdown lineup) is what actually drives make-up on the shipped plant. What IS
    // layer-robust is the OUTCOME: pzr level parks near 54 % and subcooling holds, in BOTH.
    // So the charging acceptance is only `> 1.5e-5` (make-up is running at all) and the tight
    // numbers live in the step notes. The #209 class — a gate certifying a lineup that does
    // not ship — is why this is written down rather than tuned until it passed.
    {
      id: 'pwr_seal_leak', category: 'emergency', manual_ref: 'PWR-E23',
      title: 'Mode 1 abnormal — reactor coolant pump seal leak',
      purpose: 'A small primary leak to containment. Charging makes it up and the plant stays at power — nothing forces your hand. Diagnose it from CHARGING FLOW, size it, and decide what to do on your own terms.',
      from: 'hot_full_power',
      prereq: ['At-power operation, CVCS available.'],
      cautions: [
        'PZR LVL LO does NOT come in. It sits 20 points below the programmed level and a held leak parks within a point or two of program — waiting for a level alarm means waiting all shift.',
        'PZR LVL DEV LO stays clear too. The deviation only opens when make-up STOPS holding, so its silence is information, not the absence of a problem.',
        'This leak is NOT pressure-modulated. Unlike an SGTR, depressurizing does nothing to it — you cannot terminate it from the control room.',
        'Rule out the impostors before believing the leak: isolated or throttled letdown, or a deliberate level-setpoint change, produce the same high-charging picture.',
      ],
      steps: [
        { text: 'Confirm the inventory lineup first: CVCS in AUTO, so charging is free to make up whatever is lost. You are about to judge a leak by how hard make-up is working — that only means anything if make-up is actually in control.', control: 'CVCS Inventory Control', target: 'CVCS in AUTO',
          cmd: { action: 'set_cvcs_auto', active: true }, hold: 30 },
        { text: 'The leak starts. (Failures tab → inject Reactor Coolant Pump Seal Leak.) Nothing dramatic happens — watch CHARGING FLOW rise and settle while LETDOWN stays where it was. That imbalance IS the leak.', control: 'CVCS Inventory Control', target: 'charging rises, letdown steady',
          note: 'Measured (#408 real flows): charging settles near 42 gpm against letdown’s 30 — the 12 gpm difference IS the leak. CHG FLOW HI (36 gpm) comes in a few minutes after the leak starts — it is the only alarm you will get.',
          cmd: { action: 'inject_failure', failure_id: 'rcp_seal_leak', severity: 0.4 }, hold: 300,
          acc: { p: 'charging_flow_actual', op: '>', v: 1.5e-5 } },   // #408 re-band: engine-direct settles 2.57e-5, full stack 9.4e-5 (the documented layer split); was > 0.005, which real charging (max 1.33e-4) never reaches
        { text: 'Now confirm the make-up is winning. Pressurizer level should sit a little BELOW program and hold there — stable, not falling. A level that is still descending means make-up is losing and this is no longer this procedure.', control: 'Pressurizer Heaters (PZR)', target: 'level stable just below program',
          hold: 300, acc: { p: 'pzr_level_pct', op: '~', v: 54, tol: 3 } },
        { text: 'Check subcooling. A leak this size costs you none of it — if subcooling is eroding, you have a bigger leak than a seal and you are heading for the loss-of-coolant response instead.', control: 'Plant Pressure', target: 'subcooling unchanged',
          hold: 120, acc: { p: 'subcooling_c', op: '>', v: 35 } },
        { text: 'Trend the charging demand at steady load. Flat means a stable leak you can plan a shutdown around; rising means it is growing and the decision gets made for you.', control: 'CVCS Inventory Control', target: 'charging flat',
          hold: 420, acc: { p: 'subcooling_c', op: '>', v: 35 } },
        obs('Confirm the plant is still where you left it: at power, no reactor trip, no safety injection, subcooling intact. The leak is identified and sized, and the shutdown decision is yours to make deliberately.',
          { p: 'scrammed', op: '<', v: 1 },
          'This is the acceptance the procedure asks for — a stable, alarm-quiet plant with a known leak, not a recovered casualty.',
          ['CVCS Inventory Control', 'Plant Pressure']),
      ],
      guard: { never_melted: true, never: [{ p: 'subcooling_c', op: '<', v: 5 }] },
      outcome: 'Leak identified from charging flow and trended flat, with the plant still at power — no trip, no ESF, and the decision to shut down made on the operator’s terms rather than forced.',
    },
    {
      id: 'pwr_tmi', category: 'accident', narrative: true, manual_ref: 'PWR-E08',
      title: 'Three Mile Island (1979) — an accident of information',
      purpose: 'The famous accident where an indicator said a valve was shut while it was stuck open — so the crew throttled the very injection that would have saved the core.',
      from: 'hot_full_power',
      steps: [
        obs('SETUP — Hot Full Power. Failures tab → Loss of Main Feedwater. The reactor trips; pressure rises and the Power-Operated Relief Valve (PORV) opens automatically (~2350 psi (16.2 MPa)).'),
        obs('Failures tab → PORV Stuck Open, then PORV Indicator Stuck Closed. The PORV is truly open but its indicator reads CLOSED — coolant leaks invisibly.'),
        obs('As coolant boils off, the Pressurizer (PZR) level RISES even as total inventory FALLS — the TMI trap that invites throttling High-Pressure Injection (HPI).'),
        obs('The truth-teller is SUBCOOLING on the Power & Reactivity card — it erodes toward zero. Trust it over the PORV indicator.'),
        obs('RECOVERY — PORV Block Valve → Isolate stops the leak (see procedure "Stuck-open relief valve"). Keep injection flowing; do not throttle HPI on a rising PZR level alone.'),
        obs('OUTCOME — isolate + inject: core stays covered (engine flagship recovery branch). Throttle injection as in 1979: uncovery and fuel damage (damage branch).'),
      ],
    },
  ];

  /* ---- PWR2 — THE SHIPPED PLANT'S OWN POOL (#244/#526, 2026-08-31) --------------------
   * Authored AGAINST PWR2 and measured on it (HR12: every number below is from a full-stack
   * ride on `RD.SimulationService` selectPlant('pwr2', …), 2026-08-31 — the ride record is
   * the #244 issue comment + TUNING_LOG). NOT a copy of the pwr pool: the two plants differ
   * in the load-bearing places —
   *   · the control bank is 0..627 steps (the SOURCED four-bank overlap scale, WTSM 8.1
   *     §8.1.5.4; differential 4.15 min / 6.49 mean / 8.82 peak pcm/step, inside the
 *     sourced 4-12 band), so the whole 1/M ladder re-derives (#602 phase 2);
   *   · the shell REFUSES connect_grid / set_load_mode / set_steam_demand /
   *     set_sr_detector — dispatch is `set_load_target`, reconnection is reset_rps +
   *     latch_turbine + set_load_target, and the SR channel auto-energizes (#529);
   *   · SG level AUTO is `set_feed_coupled` (the internal three-element controller), not a
   *     kernel channel — the kernel carries only boron_conc + afw_level;
   *   · the Pressure SP dial floors at the sourced 1700 psig board span, so the cooldown's
   *     low-pressure leg is heaters-0 + aux spray, not a dialed setpoint;
   *   · the accumulator valve carries a 1600 psig administrative power lock (TS Bases
   *     B 3.5.1), which times BOTH directions' accumulator steps.
   * The pwr pool above stays as-is — the retired-engine gates replay it. Chain: each entry
   * names `next`, so the finished-card handoff walks Mode 5 → full power → Mode 5. */
  var PWR2 = [
    {
      id: 'pwr_heatup', category: 'startup', manual_ref: 'PWR-N01', next: 'pwr_startup',
      title: 'Mode 5, Cold Shutdown → Mode 3, Hot Standby — plant heatup (pump heat)',
      purpose: 'Take the plant from Mode 5, Cold Shutdown to Mode 3, Hot Standby using the heat of the reactor coolant pumps alone. The reactor stays shut down the whole way. About 12 plant-hours.',
      from: 'cold_shutdown',
      prereq: ['Plant in Mode 5, Cold Shutdown: AVG COOLANT TEMPERATURE near 122 °F, PRIMARY PRESSURE near 363 psi, reactor shut down, residual heat removal (RHR) running (auto-checked).', 'Reactor coolant pumps stopped and ready to start. They are the heat source.'],
      precond: [
        { p: 'tavg_c', op: '<', v: 95, text: 'Plant cold: AVG COOLANT TEMPERATURE near 122 °F' },
        { p: 'pressure_mpa', op: '<', v: 5, text: 'Depressurized: PRIMARY PRESSURE near 363 psi' },
        { p: 'power_pct', op: '<', v: 1, text: 'Reactor shut down: REACTOR POWER 0 %' },
      ],
      steps: [
        /* ⚠ "RCP FLOW OFF", NOT the owner's "Reactor Coolant Pump (RCP) FLOW OFF" — THE ONE
         * CLAUSE OF HIS #755 EDIT NOT TAKEN, and it is flagged on the issue rather than silently
         * dropped. His spelled-out form is 23 words against `run_style`'s W2 cap of 20 (scored
         * since #692), and the pool's form is exactly 20. Relaxing W2 to fit one step would
         * quieten a gate to take a wording; the `why` below carries his spelled-out
         * "Residual Heat Removal (RHR)" gloss unchanged, which is the half of the edit that had
         * room. If he wants the full spelling, W2's cap is what moves, by his ruling. */
        obs('Verify the plant is cold and shut down: AVG COOLANT TEMPERATURE 122 °F, PRIMARY PRESSURE 363 psi, RCP FLOW OFF.',
          { p: 'plant_mode', op: '~', v: 5, tol: 0.1 },
          'Both rod positions read 0 of 627.', null,
          'In Cold Shutdown (Mode 5) the water is far below boiling, pressure is low, the Residual Heat Removal (RHR) loop is carrying the small amount of heat the fuel still makes, and both rod banks are fully inserted.',
          [{ p: 'pump_flow_pct', op: '>', v: 90 }, { p: 'shutdown_bank_pct', op: '>=', v: 98 }, { p: 'plant_mode', op: '<', v: 5 }],
          /* 'Primary Pressure', not 'Plant Pressure' — both resolve to `ims2immsvn6`, but the
           * board engraves PRIMARY PRESSURE and every other step in this leg uses that spelling
           * (#744 template pass). The two rod readouts are ringed because the step's own `note`
           * says "Both rod positions read 0 of 627" and neither was marked. */
          ['Tavg', 'Primary Pressure', 'Residual Heat Removal (RHR)',
           'Control Rod Position', 'Shutdown Rod Position']),
        { text: 'Start the reactor coolant pumps: press ON on the RCP FLOW card.',
          why: 'A shut-down reactor makes very little heat compared to a critical reactor, but the running pumps put about half a percent of full power into the water as friction. That is enough to warm the whole plant. Real crews heat up exactly this way, with the reactor never critical.',
          control: 'RCP ON/OFF', target: 'RCP FLOW above 90 %',
          cmd: { action: 'set_rcp', running: true }, hold: 30,
          acc: { p: 'pump_flow_pct', op: '>', v: 90 },
          /* NOT THE PUMP ITSELF — THE CARD AND THE ON BUTTON *(OWNER, 2026-09-14, #755 item 6:
           * "mode 5->3 step 2 shouldn't highlight the pump itself. it should highlight the pump
           * card and the on button")*. `hl_watch` carried 'Reactor Coolant Pumps (RCP)', which
           * resolves to `imrobpq4a70` — the pump ART on the schematic, i.e. exactly the element
           * he does not want ringed. It is dropped rather than replaced: the board's vocabulary
           * has no separate key for the ON button, because ON/OFF and the RCP FLOW readout live
           * in ONE element — 'RCP Run/Stop' and 'RCP ON/OFF' both resolve to `imrsjyqoq6t`, the
           * card — so the `hl` ring already covers the card and its ON button, and a second
           * label on the same id would draw two rings on one element and redden
           * run_manual_controls' overlap check. */
          hl: ['RCP Run/Stop'] },
        /* ONE CLICK, NOT A HOLD *(OWNER, 2026-09-03, #619 item 9: "you dont need to hold
         * withdraw. its set to go automatically on a click")*. Verified at the control:
         * `toggleLatchRod` (pwr_board_wiring.js:3585) issues `rod_start` and latches, and
         * `clearLatchIfDone` (:3598) issues `rod_stop` when the bank reaches its limit. The
         * text said "hold WITHDRAW", which is the retired board's momentary button. */
        { text: 'On the ROD CONTROL card press FAST, then click WITHDRAW under SHUTDOWN once.',
          /* "about 9 plant-minutes" is MEASURED, not scaled (#668): 627 steps at the sourced
           * fast drive of 72 steps/min is 522.5 s = 8.7 min, verified on the engine at 71.99
           * steps/min. It read "about 10" against the pre-#668 drive's 595.4 s. */
          note: 'One click starts the shutdown bank and it runs to 627 of 627 by itself, about 9 plant-minutes. Clicking WITHDRAW again stops it early. Watch SHUTDOWN ROD POSITION count up.',
          why: 'In a PWR, shutdown rod groups (shutdown banks) stay fully withdrawn during normal power operation. Their purpose is to supply a large, rapid insertion of negative reactivity on a reactor trip (SCRAM) so the core goes subcritical and stays that way. They are withdrawn first during startup and are not used for routine power or temperature (Tavg) control.',
          control: 'Shutdown Bank', target: 'SHUTDOWN ROD POSITION 627 of 627',
          cmd: { action: 'rod_nudge', group_id: 'shutdown_rods', steps: 627, speed: 'fast' }, hold: 660,
          /* CHECKED OFF ON THE BANK, NOT ON REACTIVITY *(OWNER, 2026-09-02 playtest / #607 item 4:
           * "the step should key on the rod position not reactivity")*. `>= 98 %` rather than
           * 100: a hold that lands one step short of the stop still did the action.
           *
           * ⚠ A DELIBERATE EXCEPTION to the rule the startup leg now follows — do not "fix" it to
           * an instrument cue (#618, owner-ruled 2026-09-03). The startup's 1/CR ladder dropped its
           * rod-position targets because the sourced procedure steers the approach to criticality on
           * the nuclear instruments; a FULL-WITHDRAWAL VERIFICATION is the opposite case and is
           * position-based in the source too. WTSM 19.0 (ML11223A342) Appendix 19-1 step 7:
           * "Verify all shutdown banks are fully withdrawn within 15 minutes of withdrawing control
           * banks." There is no instrument that tells you a bank is all the way out. */
          /* GRADED IN STEPS, NOT PERCENT — THE UNIT THE NAMED TILE PRINTS (#744). The owner's own
           * hand-edit of this step writes the done-when as "SHUTDOWN ROD POSITION = 627 steps";
           * `shutdown_bank_pct` rendered it "SHUTDOWN ROD POSITION ≥ 98 %", against a readout
           * that prints steps over a step denominator and never a percentage. Same param family,
           * same field on the same rod group (`ROD_PARAMS`, layers/instructor_layer.js) — only
           * the unit the player reads changes, so #607 item 4's position-not-reactivity ruling
           * above is untouched.
           *
           * 615 IS THE SAME THRESHOLD, NOT A NEW ONE: `steps` is rounded to an integer by the
           * shell, so `pct >= 98` of a 627-step bank is `steps >= 614.46`, i.e. `>= 615` exactly.
           * ⚠ It is the one place in this step that types a number derived from the bank size; if
           * the bank ever moves off 627, re-derive it here. `run_reactivity` pins `max_steps ===
           * 627` on both engines, so that change cannot land quietly. */
          acc: { p: 'shutdown_bank_steps', op: '>=', v: 615 },
          /* THE SPEED BUTTON IS PART OF THE PRESS (#735, owner playtest #724 item 1: "it should
           * glow the FAST button on the rod control panel since it has the user click it").
           * The step names two presses and glowed one. Every step in the pool that tells the
           * player to press SLOW / MED / FAST now names that button; a step that merely CONTINUES
           * at a speed already selected does not, or the ring would point at a button there is
           * nothing to do to — which is #724 item 3's complaint in reverse.
           *
           * AND THE INDICATION IT RUNS AGAINST IS WATCHED *(OWNER, 2026-09-13, #744: "walkthrough
           * Mode 5>3 step 3 should also highlight the SHUTDOWN ROD POSITION indication since thats
           * what we are watching")*. The step's own `note` already says "Watch SHUTDOWN ROD
           * POSITION count up" and nothing on the board was ringed when it did. 'Shutdown Rod
           * Position' is `imrpnzfsfcx`, a different element from both `hl` buttons — required,
           * because `applyCklWatchGlow` skips an element already carrying the pulsing glow. */
          hl: ['Rod Speed — Fast', 'Shutdown Bank — Withdraw'],
          hl_watch: ['Shutdown Rod Position'] },
        /* A VERIFICATION HOLDS FOR THE PLAYER (#660 item 4, owner playtest 2026-09-08: "skipped and
         * didn't have an acknowledge button"). With a `cmd` on it the step ticked itself on the
         * already-tripped turbine and advanced; without one it satisfies and waits, like the
         * other verifications. The cold plant boots tripped, so the replay ticks it on state. */
        /* ⚠ TRIP IS NOW A STEADY RING, NOT A PULSE *(OWNER RULING, 2026-09-15: "Move them to the
         * watch ring")*, on the 2026-09-15 layman playtest (#653 S-3b: the reviewer nearly pressed
         * TRIP). The defect, measured on the built pool: this step carries no `cmd`, and
         * `hl: ['Turbine — Trip']` resolved to the TRIP button's own box drawn with
         * `.ckl-step-glow` / `cklGlow` — the ACT-ON-THIS cue, identical to the one on a step that
         * really does want a press.
         *
         * THE RING STAYS, ONLY THE PULSE GOES, which is what keeps the OWNER'S OWN DRAWING intact
         * *(OWNER, 2026-09-13, #744: "[HIGHLIGHTED: TURBINE-GENERATOR CARD (steady), TRIP
         * (pulsing)]")*, recorded in `Blueprint/WALKTHROUGH_STEPS_OWNER.md` — all three elements
         * are still marked, on one treatment instead of two.
         *
         * THE MOVE NEEDED A CHANGE IN `ui/app.js` FIRST and could not be done from this file
         * alone: `stepHlLabels` fell back to the step's own `control` when `hl` was empty, and
         * this step's `control` is 'Turbine Load' — which is in `hl_watch` AND is itself workable,
         * so dropping `hl` swapped one pulsing control for another and reddened
         * `run_manual_controls`' distinct-element check. That fallback now asks
         * `stepAsksForPress` first; see the note on `stepHlLabels`. */
        { text: 'Verify the turbine is tripped, nothing to press: TRIP lit on the TURBINE-GENERATOR card, OUTPUT 0 MWe.',
          note: 'The ring on TRIP marks the lamp to read, not a button to push. If LOAD reads anything but 0, press UNLOAD. UNLOAD is not TRIP: UNLOAD walks the load setting to zero, TRIP shuts the steam valves.',
          why: 'The cold plant starts with the turbine tripped. It matters because a turbine taking any steam on pump heat would carry away the very heat you are trying to build up.',
          control: 'Turbine Load', target: 'TRIP lit, OUTPUT 0 MWe',
          hold: 10,
          acc: { p: 'turbine_tripped', op: '>', v: 0 },
          /* PULSE THE LAMP, RING THE CARD AND THE NUMBER *(OWNER, 2026-09-13, #744:
           * "[HIGHLIGHTED: TURBINE-GENERATOR CARD (steady), TRIP (pulsing)]")*. This read
           * `['Turbine Load', 'Main Breaker']` and BOTH labels resolve to `imro8k5pzem`, the card
           * — two labels, one ring, and the TRIP lamp the step names first was not marked at all.
           * The card and OUTPUT go to `hl_watch` (steady dashed) because this is a VERIFY step
           * and they are what is read; TRIP stays in `hl` because it is the thing the step is
           * about and the one control the player touches if the verification fails. All three
           * resolve to different elements, so no watch ring is skipped. */
          hl_watch: ['Turbine — Trip', 'Turbine Load', 'Generator Output'] },
        /* CONFIRM, THEN ACT *(OWNER, #724 item 3: "Walkthrough mode 5>3 step 5, the SG FEED AUTO
         * button is already [in AUTO]")*. Same shape as #619 item 16, which reworded the sibling
         * step in `pwr_startup`.
         *
         * THE FILED PREMISE DID NOT REPRODUCE FROM THIS LEG'S OWN INITIAL CONDITION, and that is
         * recorded here rather than acted on. MEASURED (full stack, `cold_shutdown`, driven step
         * by step to this step's entry at t = 549 s): `control_state.feed_coupled` reads FALSE,
         * feed pump speed 0 %, no `feed_sg` kernel channel on this plant at all — so the board's
         * SG FEED corner reads OFF and the AUTO lamp is dark. The instruction is correct on the
         * plant the leg boots.
         *
         * A player can still arrive with it already in AUTO (re-entering the leg, or coming round
         * the chain), and the acceptance already grades the LAMP rather than the press, so the
         * step self-ticks in that case. What was wrong was only the prose: it stated a press as
         * unconditional. Reworded so it is right either way — which costs nothing and removes the
         * one thing the report is unambiguously about. */
        /* ⚠ THE OWNER RE-CUT THIS STEP BY HAND, AND HIS VERSION IS SHORTER THAN #724's (#744,
         * 2026-09-13). He wrote it as a bare DO step — `Set SG FEED to AUTO.` with NO note at all
         * — which is the template this leg is now authored to: a DO step is one imperative naming
         * the card and the control, and a `note` has to earn its place rather than hedge.
         *
         * THIS DELIBERATELY UNDOES THE PROSE HALF OF #724 ITEM 3, so do not restore it as a
         * regression. The measurement that fix rested on is the reason it is safe to: from this
         * leg's own initial condition SG FEED reads OFF and the instruction is simply correct, and
         * for the player who arrives with it already lit the acceptance grades the LAMP, not the
         * press, so the step self-ticks with nothing to do. The hedge was covering a case the
         * grading already covered — which is what made it cuttable without changing behaviour. */
        { text: 'Set SG FEED to AUTO.',
          why: 'The steam generator is the boiler: reactor water heats it on one side and steam comes off the other. Nothing is boiling yet, so the feed pumps start out stopped. Putting level control in AUTO now, while the plant is quiet, means it is already holding level when the water starts to boil later in the heatup.',
          control: 'Feed Pumps', target: 'SG FEED reads AUTO, STEAM GENERATOR LEVEL near 65 %',
          cmd: { action: 'set_feed_coupled', active: true }, hold: 5,
          acc: { p: 'feed_coupled', op: '>', v: 0 },
          hl: ['SG Feed AUTO'], hl_watch: ['SG Level'] },
        /* A CONFIRMATION, NOT AN ACTION *(OWNER, 2026-09-02 playtest, #608 item 1: "doesnt make
         * sense, dump setpoint starts in mode 5 at the setpoint the step asks for. the step then
         * says to leave the dump shut. There is no 'dump shut' button so this is confusing. it
         * should say the exact button to press (if any)")*.
         *
         * Both halves were already true at boot, and the step named neither of them by the words
         * that are on the board. Measured on the Mode 5 initial condition: `steam_dump_setpoint`
         * boots at 7.03 MPa — the exact value this step commanded — so the command was a no-op.
         * And the shut affordance does exist: it is the CLOSE button on the STEAM DUMP card
         * (imrppqxggbj), already the lit one, with the status readout beside it saying MANUAL.
         * Three words on the board for one state, and the step used a fourth.
         *
         * THE SETPOINT IS ALSO INERT IN THIS MODE, which is why moving the initial condition to
         * give the step something to do was DECLINED *(owner ruling, 2026-09-02, choosing
         * "Rewrite as a confirmation" over "Change the Mode 5 dump setpoint")*: 7.03 MPa is the
         * plant's sourced Ginna 1005 psig no-load anchor and content does not drive physics (HR9)
         * — and the player would see no effect anyway. The cold plant boots `dump_mode: 'off'`
         * (pwr2_engine.js dcDrivers), and the setpoint is read ONLY in 'pressure' mode
         * (pwr2_dumpctl.js); nothing reachable from a cold start selects that mode, because the
         * shell maps set_steam_dump auto->'tavg' and closed->'off' only. So the box changes
         * nothing here whatever it is set to.
         *
         * Graded on `steam_dump_valve_pct`, the DEMAND the valve is actually carrying — not on
         * the setpoint, which this step no longer touches and which would check off identically
         * on a dumping plant. */
        /* Same shape as the turbine verify above (#653 S-3b), and moved by the same ruling
         * *(OWNER RULING, 2026-09-15: "Move them to the watch ring")*: no `cmd`, and
         * `hl: ['Steam Dump — Close']` pulsed the CLOSE button on a step whose text says there is
         * nothing to press. CLOSE keeps its ring — it is the owner's drawing (the #744 quote
         * below) — as the steady watch treatment. This step authors no `control` at all, so
         * unlike the turbine verify it needed nothing from `stepHlLabels`' fallback. */
        { text: 'Verify the STEAM DUMP is closed, nothing to press: CLOSE lit on the STEAM DUMP card, status reading MANUAL.',
          note: 'The ring on CLOSE marks the lamp to read, not a button to push.',
          why: 'The steam dump sends steam straight to the condenser instead of the turbine. Kept shut, the steam side bottles up and the pump heat stays in the plant. The DUMP SETPOINT box already reads 1020 psi, but that number does nothing until AUTO is pressed, which a later step does once the steam side is hot.',
          acc: { p: 'steam_dump_valve_pct', op: '<', v: 1 },
          /* THE LAMP PULSES, THE CARD AND THE VALVE ARE WATCHED *(OWNER, 2026-09-13, #744:
           * "[HIGHLIGHTED: STEAM DUMP CARD (steady), CLOSE (pulsing), the physical STEAM DUMP and
           * opening percentage (steady)]")*. This read `['Dump SP', 'Steam Dump']` and BOTH labels
           * resolve to `imrop5ouw7h`, the card — the same two-labels-one-ring defect as the
           * turbine step above, and CLOSE, the lamp the step names, was unmarked.
           *
           * 'Steam Dump Opening' is `imsgunuyvon`, the % tag beside the condenser dump valve on
           * the schematic, which is the board's rendering of `steam_dump_valve` — THE SAME SIGNAL
           * THIS STEP GRADES ON. That is the point of ringing it: the done-when says "STEAM DUMP
           * opening < 1 %" and this is where the player reads that number. (The old labelled
           * STEAM DUMP % tile `imrzmlyafa3` is in the board's DOC_REMOVE and is not on the canvas
           * — see the note in CONTROL_LABEL_MAP.) 'Steam Dump Valve' is the valve symbol itself,
           * the "physical STEAM DUMP" he asked for. Four distinct elements, so nothing is skipped. */
          hl_watch: ['Steam Dump — Close', 'Steam Dump', 'Steam Dump Status', 'Steam Dump Valve',
                     'Steam Dump Opening'] },
        /* THE LETDOWN TRANSFER (#624 items 14/25, 2026-09-04). The LETDOWN selector had never
         * changed anything a player could see, because every initial condition booted with the
         * orifices already in — an orphan control on a board whose plant was pre-lined-up. The
         * cold ICs now boot with them OUT (the source's own shutdown lineup: letdown on the RHR
         * cross-connect HCV-128), so this step is the control's job, and the leg has a real
         * consequence if it is skipped: the RHR suction autocloses at 585 psig on the next
         * step's climb, and from there a plant with the orifices shut has charging and seal
         * injection in and nothing out.
         *
         * THE EFFECT IS ASSERTED, not just the write — see the confirmation step after the
         * ride, which reads the flow AND the RHR lineup together. A `letdown_orifice_a` tick
         * alone would pass on a plant whose cross-connect was still carrying everything. */
        { text: 'Press A+B 7 % on the LETDOWN card to open the letdown path.',
          why: 'Water is always being pumped into the reactor loop (charging), so it always needs a way out (letdown). Right now letdown leaves through the RHR loop, and that path closes itself at 600 psi once the heaters start the pressure climb. The letdown orifices, two fixed holes, are the only way out after that; with them shut the plant would slowly fill solid.',
          control: 'Letdown Orifices (CVCS)', target: 'A+B 7 % lit; LETDOWN reads above 0 gpm',
          cmd: { action: 'set_letdown_orifices', a: true, b: true }, hold: 10,
          accs: [
            { p: 'letdown_orifice_a', op: '>', v: 0, label: 'Orifice A in service' },
            { p: 'letdown_orifice_b', op: '>', v: 0, label: 'Orifice B in service' },
          ],
          /* The `target` says "LETDOWN reads above 0 gpm" and there was no ring on that number
           * — the vocabulary had no key for it until #744. The orifice card is the press. */
          hl: ['Letdown Orifices (CVCS)'], hl_watch: ['Letdown Flow'] },
        /* PRESSURE CONTROL IN SERVICE (#624 / #619 item 14, 2026-09-04) *(OWNER, 2026-09-04:
         * "next", to the recommendation "measure the heaters-OFF drift from cold_shutdown and
         * land item 14's remaining halves")*. Mode 5 now boots with the heaters OFF and the
         * spray in hand and shut — the lineup `pwr_cooldown` leaves behind, so the picker's
         * plant and a player's own cooled-down plant finally agree.
         *
         * THE NEXT STEP WAS INERT WITHOUT THIS ONE — history since #755 item 11 split the two
         * cards apart (2026-09-15). It read: "measured, not argued: from the cold boot, dialling
         * the Pressure SP to 1700 psig with the heaters off moves the plant 0.048 psi in 10
         * plant-minutes at 0.0 kW, against +133.4 psi at 157.8 kW once AUTO is pressed." Both
         * numbers stand; the ARRANGEMENT they justified does not. The dial is gone, this step is
         * the SPRAY, and the step it precedes is the HEATER press, which needs nothing from it —
         * so deleting this step no longer reds a neighbour's acceptance. What deleting it costs
         * is the brake: the climb next door would run with the spray still in hand.
         *
         * ⚠ THE STEP IS NOT HERE BECAUSE THE BUBBLE BLEEDS. `pwr2_engine`'s old pzDrivers note
         * claimed a surge-line bleed of ~16 kW / -68 psi/hr and the build plan for this change
         * asked this paragraph to quote that rate. Measured 2026-09-04 it is FALSE on this
         * engine: 60 plant-minutes with the heaters off run 362.59 -> 362.85 psia, +0.3 psi/hr.
         * There is no standing conduction path out of the vessel in this model, so a still
         * isothermal plant has nothing to bleed. The prose below says what is true instead.
         *
         * THE TWO CARDS ARE NOW TWO STEPS, AND THE DIAL STEP IS RETIRED (#755 item 11)
         * *(OWNER RULING, 2026-09-15: selected "Floor the Mode 5 seed to 1700 psi" from three
         * options — "since i cant set the SET PZR PRESSURE box to below 1700, why dont we not
         * allow this number to go belopw 1700 psi. Then hen we activate the heater during
         * startup it will start raising pressure right away. this will require a rewrite of
         * these steps. we could have step 8 start the spray and step 9 start the heater and
         * increase pressure to 665 psi instead of upping the set pressure.")*.
         * `pwr2_engine` now seats the cold setpoint at `PZ.CONTROL.setpoint_min_mpa`, so the box
         * reads 1700 psi — inside the 1700-2500 span it publishes, which the old 362.6 psia seed
         * was not — and the heaters have somewhere to drive the moment AUTO is pressed. Nothing
         * in this leg types a pressure now until the second stage at 2235 psi.
         *
         * SPRAY FIRST, AND IT IS AN ARMING STEP — GRADED ON THE LAMP, WHICH IS HONEST.
         * MEASURED 2026-09-17, full stack from `cold_shutdown` with steps 1-7 replayed, SPRAY
         * AUTO pressed alone at the top of this step: 363.14 -> 363.19 psia over 10
         * plant-minutes, `spray_valve_pct` 0.00 on every sample — the same two numbers the plant
         * gives with NOTHING pressed. The valve cannot open: the spray ladder starts 25 psi
         * ABOVE setpoint and the cold plant sits ~1337 psi below it. So there is no effect to
         * grade, and the step says so in its own `note` rather than implying one.
         *
         * WHY SPRAY BEFORE HEAT: the spray is the only brake on the climb the next step starts,
         * so it goes in service while nothing is happening. That is also the lineup order
         * `pwr_cooldown` leaves the plant in (#624). */
        { text: 'On the PRESSURIZER (PZR) card press AUTO under SPRAY.',
          note: 'Nothing moves yet. The spray only opens when pressure runs above the SET PZR PRESSURE box, and the cold plant is about 1340 psi below it.',
          why: 'The pressurizer is a tank of half water, half steam that sets the pressure of the reactor loop: heaters inside the pressurizer boil water to create steam and raise pressure, spray condenses steam to lower it. The cold plant starts with both off. Spray goes in first because it is the only brake on the climb the next step starts, and a control you want in service before you need it is one you put in service while nothing is happening.',
          control: 'Pressurizer Spray (PZR)', target: 'AUTO lit under SPRAY',
          cmd: { action: 'set_spray', auto: true }, hold: 10,
          acc: { p: 'spray_auto', op: '>', v: 0 },
          /* No `hl_watch` on Primary Pressure here, deliberately: this step moves it 0.05 psi in
           * 10 plant-minutes, so pointing the player at the gauge would promise a change the
           * plant does not make. The NEXT step watches it, where it climbs 8 psi a minute. */
          hl: ['Pressurizer Spray (PZR)'] },
        /* ⚠ THE FOUR PARAGRAPHS THAT FOLLOW ARE THE RETIRED DIAL STEP'S RECORD, KEPT BECAUSE THE
         * RULINGS IN THEM STILL BIND THE STEP THAT REPLACED IT (#755 item 11, 2026-09-15). The
         * step below is no longer "Raise SET PZR PRESSURE to 1700 psi" — it is the HEATER press,
         * and it inherited BOTH of this step's acceptances unchanged: the action check-off (was
         * the setpoint dialled, now the AUTO lamp) and the 4.585 MPa cover-gas crossing. #608's
         * "not below the cover gas" and #627's "the tick and the clock hold are the same
         * crossing" therefore still hold, on the step that now carries them. Read on.
         *
         * "UP", NOT "DOWN" *(OWNER, 2026-09-02 playtest, #608 item 2: "Step 7 says to dial the
         * pressurizer pressure setpoint DOWN to its 1700 psig floor. the problem is the mode 5
         * pressure set point is 363 so you are actually driving it UP not down")*. Measured: the
         * Mode 5 initial condition seeds `pressure_setpoint` at 2.5 MPa = 363 psi, so the dial
         * goes UP by 1337 psi. The word was inherited from the COOLDOWN, where the plant genuinely
         * comes down onto the same floor — and the floor is why the seed can sit under it at all:
         * 363 psi is a constructor seed (a standing lineup), not a dialled value, so it never met
         * the clamp. Touch the dial once and you are inside the 1700-2500 psig span for good.
         *
         * AND THE ACCEPTANCE MOVED, 4.2 -> 4.7 MPa (609 -> 682 psia). This step used to check off
         * at 609 psia while the accumulator cover gas measures 665 psia, so a player who took the
         * tick as permission to do the next step opened the valve BELOW the cover gas — accepted,
         * no refusal, and measured over the following 5 plant-minutes: accumulator inventory
         * 100 % -> 97.2 % and boron 918 -> 940 ppm. An unplanned boration and an accumulator under
         * its inventory, by following the checklist. The replay never saw it because `hold: 2400`
         * dominates the acceptance. 4.7 MPa clears the measured cover gas by 17 psi.
         *
         * AND THEN THE 17 psi MARGIN BECAME A HOLD NOBODY COULD READ (#627, owner playtest,
         * 2026-09-04: "it holds the warp at 1x until pressure is over 682. it should not gate the
         * warp hold on the pressure, the warp hold should gate on the user setting the pressure.
         * thats the important part to wait for, not the pressure."). The #619 item 13 clock hold
         * rises at the cover gas, 665 psia; this step ticked at 682. For the 17 psi between, the
         * checklist showed THIS step waiting on a pressure while the plant refused fast time and
         * asked for the accumulators — the next step, greyed. Measured as a player at 600x: hold at
         * 667.9 psia, step tick at 691.6, and the hold chattered three times in between
         * (pwr2_engine.js has that half).
         *
         * TWO CHECK-OFFS NOW, and the acceptance moves to the cover gas itself. The first box is
         * the owner's "important part": the setpoint DIALLED, a cmd-kind entry that ticks the
         * moment the command is issued — the action is acknowledged before the ride starts. The
         * second is the pressure at 4.585 MPa — a hair above `RD.pwr2.eccs.ACC.p0_mpa` (4.583 MPa,
         * 664.7 psia, the cover gas the manuals print as 665), so 2e's strict "accepts ABOVE the
         * cover gas" still holds — the same crossing the hold rises on, so the step that is active while the clock is
         * held is the one that says open the valve. #608's rule survives with no margin needed:
         * at the cover gas the tank and the primary are at the same pressure, so opening on the
         * tick moves nothing (the 609 psia case was a 56 psi head into the tank). The replay still
         * dwells `hold: 2400`; `run_checklist_pwr2` 2j asserts the tick lands within 50 broadcasts
         * of the hold rising.
         *
         * THE HOLD AND THE ESTIMATE MOVED, 2400 -> 3000 s / "35" -> "44" plant-minutes (#679,
         * 2026-09-10). The CVCS volume-scale fix cut charging authority 14.6 % (30.1 -> 26.3 gpm),
         * so the same climb to 665 psia now takes longer — measured, full stack: 41.7 plant-minutes
         * still short (4.554 MPa), 45.0 plant-minutes past it (4.669 MPa). The crossing is a plant
         * fact, not a test fixture (Hard Rule 9): the step's authored dwell is what was stale, so
         * the step is what moved, not `run_checklist_pwr2`. */
        /* THE CLIMB STARTS HERE NOW, OFF THE HEATERS ALONE, AND NOTHING IS TYPED (#755 item 11).
         * MEASURED 2026-09-17, full stack from `cold_shutdown` with steps 1-7 replayed and the
         * floored seed: pressing AUTO under HEATER takes the bank to 100 % (157.8 kW) and holds
         * it there, and the plant crosses the 664.7 psia accumulator cover gas at t+37.5
         * plant-minutes (669.3 psia; mean 8.17 psi/plant-minute, read on 60 s broadcasts at
         * 600x, so +-0.5 min).
         *
         * ⚠ AND THE UNFLOORED PLANT IS WHY THIS STEP COULD NOT HAVE BEEN WRITTEN BEFORE. Same
         * press, same route, seed left at 2.5 MPa: 363.14 -> 375.12 psia in 130 plant-minutes
         * (0.092 psi/plant-minute) and the window is NEVER reached, because the heaters idle at
         * 11.3 % (17.8 kW) already on setpoint. A step whose stated effect depends on a
         * constructor seed is one line away from being a no-op that reads as an instruction.
         *
         * `hold: 3000 -> 2700` (50 -> 45 plant-minutes), by the same rule #679 used in the other
         * direction: the crossing is a plant fact and the authored dwell follows it, not the
         * reverse (Hard Rule 9). 2700 s clears the measured 37.5-minute crossing by 7.5 minutes
         * — more margin than the 5 minutes #679 left on its own 45.0-minute crossing — and the
         * generated ⏩ line now says "About 45 plant-minutes" instead of over-promising the wait
         * by a third. It is still a REPLAY DWELL, not a prediction (ui/app.js says so at the
         * wait-line); do not read it as one.
         *
         * TWO CHECK-OFFS, and BOTH are inherited, not new. The lamp ticks the moment AUTO is
         * pressed — the action acknowledged before the ride starts, which is #627's "important
         * part to wait for" now attached to a press instead of a dial. The pressure ticks at
         * 4.585 MPa, a hair above `RD.pwr2.eccs.ACC.p0_mpa` (4.583 MPa, 664.7 psia), so 2e's
         * strict "accepts ABOVE the cover gas" still holds and the step active while the clock
         * is held is still the one that says open the valve. Neither number is re-litigated
         * here — read the #608 and #627 paragraphs above before moving either. */
        { text: 'On the PRESSURIZER (PZR) card press AUTO under HEATER. PRIMARY PRESSURE climbs to 665 psi.',
          note: 'At 665 psi the clock drops to 1× by itself and stays there until the accumulator valve in the next step is open.',
          why: 'The heaters boil water in the pressurizer, and that steam sets the pressure of the whole reactor loop; the SET PZR PRESSURE box is already sitting at 1700 psi, the lowest it goes, so they go to full power and stay there until the plant gets near it. Pressure stops at 1700 rather than going straight to normal because of an automatic gate at 1972 psi: above that gate the emergency injection pumps re-arm, and with the steam side still cold they would fire on a healthy plant. On the way up the plant passes 665 psi, the accumulator window the next step needs.',
          control: 'Pressurizer Heaters (PZR)', target: 'AUTO lit under HEATER; PRIMARY PRESSURE climbing to 665 psi',
          cmd: { action: 'set_heater', auto: true }, hold: 2700,
          accs: [
            { p: 'heater_auto', op: '>', v: 0, label: 'AUTO lit under HEATER' },
            { p: 'pressure_mpa', op: '>', v: 4.585, label: 'PRIMARY PRESSURE at 665 psi, the accumulator window' },
          ],
          /* ⚠ THIS STEP'S OWN ALARM DOES NOT INTERRUPT FAST-FORWARD *(OWNER RULING, 2026-09-14:
           * "Only alarms the step is not expecting")*, and THE CASE THAT PRODUCED THE RULING IS
           * THIS STEP. Putting the heaters in AUTO drives PRIMARY PRESSURE up through the RHR
           * isolation interlock at 400 psi (2.76 MPa), the suction valve shuts, `rhr_active` goes
           * false while the plant is still in Mode 5 — and the board lights "Shutdown Cooling Not
           * In Service", a WARNING, on a plant that is doing exactly what the step asked.
           *
           * MEASURED ON THIS TREE, NOT READ OFF THE LABEL AND NOT INHERITED (2026-09-20, full
           * stack from `cold_shutdown`, seed 42, every step's cmd issued then held for its
           * authored `hold`, recording every alarm that goes clear -> active inside each step):
           *
           *   step 9 window   t = 725 -> 3424 s
           *   rhr_not_aligned  [warning]  t = 1817 s   <- inside this step, and nowhere else on the leg
           *   pzr_level_dev_high [caution] t = 3420.5 s
           *
           * IT IS THE ONLY FAST-FORWARD DROP ON THE WHOLE LEG. Driven again with `attentionStops`
           * LEFT ON and the accel restored after each drop so one cannot hide the next: ONE drop,
           * step 9, t = 1817 s, 10x -> 1x, reason `alarm`. Every other step: zero. And the board
           * is measured QUIET at that instant — no other warning or critical standing — so the
           * drop is this alarm's and this declaration is what removes it.
           *
           * INJECTION: leg driven with the declarations AS AUTHORED -> 0 drops; driven again with
           * every `expect_alarms` STRIPPED -> 1 drop, step 9, t = 1817 s. Seed 7 puts
           * `rhr_not_aligned` at t = 1817 s too and `low_tavg` at 20352.5 s, so neither is a
           * seed artefact.
           *
           * THE CAUTION IS NOT DECLARED. Only `critical` and `warning` are in
           * ALARM_DROP_PRIORITIES, so declaring `pzr_level_dev_high` would buy nothing and would
           * still be a claim about what this step causes. */
          expect_alarms: ['rhr_not_aligned'],
          hl: ['Pressurizer Heaters (PZR)'], hl_watch: ['Primary Pressure'] },
        /* THE WINDOW IS A TRANSIT, AND THE NUMBERS WERE STALE *(OWNER, 2026-09-02 playtest, #608
         * item 3, filed as a BLOCKER: "I couldnt open the valve, something was blocking it and the
         * step wasnt clear as to what i need to do")*.
         *
         * Two sourced numbers bound this window and BOTH STAY *(owner ruling, 2026-09-02, choosing
         * "Keep both numbers; fix content" over raising the lock or lowering the dial floor)*: the
         * 1600 psig power lock is Ginna TS Bases B 3.5.1 quoted verbatim in pwr2_shell.js, and the
         * 1700 psig dial floor is WTSM 10.2's operator span (ML11223A287), which already carries a
         * ruling that it stays. They are consistent in a real plant precisely BECAUSE a real crew
         * arms the accumulators during the climb rather than at the park point.
         *
         * What was wrong is that this step read as something you do once you have arrived. Measured
         * on the authored ride: the window opens at T+34.8 min (665 psia) and shuts at T+97.4 min
         * (1615 psia), and the plant then PARKS at 1713 psia — above the lock, permanently. The
         * step's own prose said "about 33 to about 104 plant-minutes", which is wrong at both ends,
         * and quoted a "600 psi cover gas" that is `p_min_mpa` in pwr2_eccs.js — a constant that is
         * READ NOWHERE. The tank's LIVE pressure comes from `p0_mpa` and measures 665 psia.
         *
         * The step states the measured 665 psia, and SO DOES THE MANUAL SET NOW *(OWNER RULING,
         * 2026-09-03, #609: "Change the manual to 665 psia")*. When this step was written the two
         * disagreed — the manuals documented a "600 psi cover gas" in eleven places across 04, 05
         * and 12, including 12's trust-class table where it was listed as a structural real-plant
         * setpoint — because that figure is `p_min_mpa`, the LCO MINIMUM, a constant read nowhere.
         * The tank runs on `p0_mpa`, the sourced 650 psig normal cover pressure (WTSM T5.2-2),
         * which this set prints absolute as 665 psia. Swept under Rev 17's pending row.
         *
         * The RHR suction valve's autoclosure interlock is ALSO 600 psi and is UNCHANGED — five
         * correct sites for every accumulator one, so do not sweep this number on the string.
         *
         * And measured across the whole climb, not one accumulator alarm comes in: the only alarm
         * between 665 and 1615 psia is rhr_not_aligned at 591 psia, and the existing accum_aligned
         * row is the opposite polarity (it fires when the valve is OPEN below 1000 psi), so it can
         * never say the window is closing. The board cue is the CLOCK (#619 item 13 / #627): the
         * plant drops to real time at the cover gas and refuses to accelerate until the valve is
         * open, and since #627 this step is the ACTIVE one while it does — its predecessor ticks
         * at the same crossing. The clock is still stated in that predecessor's `note`, because a
         * player reads it before the ride, not during it.
         *
         * (That predecessor was the SET PZR PRESSURE dial step until #755 item 11 retired it,
         * 2026-09-15. It is now the HEATER press, and the 4.585 MPa cover-gas acceptance moved
         * onto it unchanged — so #608's and #627's rulings still hold, on the step that carries
         * them now.) */
        /* NOT "the green ring" (#653 S-8, 2026-09-15 layman playtest): there is no green in the
         * highlight vocabulary — `hl` draws a CYAN pulsing halo, rgba(90,240,255,…), since #743.
         * Named by BEHAVIOUR rather than colour so a palette change cannot make it wrong again. */
        { text: 'Open the accumulator valve: click the valve symbol inside the pulsing ring while PRIMARY PRESSURE is 665 to 1615 psi.',
          note: 'Above 1615 psi the valve locks, and the ACCUMULATORS caution is expected until pressure passes 1000 psi. If the window is missed: press OFF under HEATER and MANUAL under SPRAY at 100 %, wait for PRIMARY PRESSURE below 1615 psi, open the valve, then put both back in AUTO.',
          why: 'The accumulators are tanks of borated water pushed by nitrogen gas at 665 psi. They fire by themselves if loop pressure ever falls below that pressure, which is why they are kept isolated while the plant is cold. Above 1615 psi the plant removes power from the valve, so it has to be opened before that point.',
          control: 'Accumulator valve', target: 'ACCUMULATORS tile no longer reads ISOLATED',
          cmd: { action: 'open_accumulator_valve' }, hold: 10,
          acc: { p: 'accumulator_valve_open', op: '>', v: 0 },
          hl: ['Accumulator valve'], hl_watch: ['Primary Pressure'] },
        /* THE TEMPERATURE IS IN THE LINE ITSELF *(OWNER, 2026-09-03, #619 item 15: "step 9 is
         * looking for a temperature that it does not specify")*. It was in `target` and in the
         * acceptance line, both of which render — but the numbered instruction, which is what a
         * player reads first, said only "watch Tavg". A step that waits on a number names it. */
        { text: 'Wait until AVG COOLANT TEMPERATURE reaches 542 °F. Do not move rods or change BORON.',
          why: 'The pumps are doing the work now. Watch AVG COOLANT TEMPERATURE, PRESSURIZER LEVEL rising as the water expands, and REACTOR POWER staying at zero. On the steam side, STEAM PRESS climbs toward 1020 psi as the water in the steam generator heats up; the next step hands that pressure to the steam dump to hold.',
          control: '(observe)', target: 'AVG COOLANT TEMPERATURE 542 °F or higher, REACTOR POWER still 0 %',
          wait_hint: true,
          hold: 40000,
          saw: { p: 'tavg_c', op: '>', v: 150 },
          acc: { p: 'tavg_c', op: '>', v: 283 },
          /* ⚠ AND THE LONG RIDE DECLARES THE ONE THE RIDE ITSELF CAUSES (same 2026-09-14 ruling).
           * This is the leg's longest hold — 40,000 s — i.e. exactly where the player is at 600x.
           *
           * THE CAUSATION IS MEASURED (2026-09-20, the same sweep as step 9): `low_tavg` [warning]
           * goes clear -> active at t = 20350 s, inside this step's t = 3434 -> 43419 s window, and
           * re-arrives five times over the following 25 s. It is `low_tavg` twice over: the alarm
           * is reclassified to `status` in Modes 4/5 (`pwr_control.js` COLD_MODES) so it is silent
           * while the plant is cold; THIS step carries the plant out of the cold modes with Tavg
           * still under the 278 degC (532.4 degF) setpoint, which un-reclassifies it to a WARNING
           * — and this step's own target, 542 degF (283 degC), is what clears it again. A warning
           * that arrives because the step is working and leaves when the step is done.
           *
           * ⚠ ITS SAVING IS UNPROVEN ON THIS ROUTE, AND THE REASON IS NOT THE ONE THAT WAS FILED.
           * The end-to-end run with `attentionStops` ON drops the clock exactly ONCE on this leg,
           * at step 9 — not here. A parked 2026-09-15 draft attributed that to `rhr_not_aligned`
           * still standing; MEASURED, IT IS NOT — that alarm is gated on `plant_mode in [4,5]` and
           * its condition has gone by the time this fires. What actually holds `_boardQuiet` false
           * at t = 20350 is THREE alarms that re-classified out of `status` when the plant left the
           * cold modes and so never transitioned clear -> active: `pzr_pressure_low` [warning],
           * `pzr_pressure_lolo` [critical] and `turbine_trip` [warning], all unacknowledged. They
           * are correct for a plant at 665 psi mid-heatup; pressure is not raised until step 14.
           *
           * SO WHY DECLARE IT. The ruling asks a step to declare what it CAUSES, and that is what
           * is measured. The route is one route: a player who acknowledges those three — which the
           * board invites — makes it quiet, and then each of the five `low_tavg` arrivals is a drop
           * on a 40,000 s ride. This declaration is the only thing standing between that player
           * and a 1x heatup. */
          expect_alarms: ['low_tavg'],
          /* ⚰ THE RHR WATCH IS GONE FROM THIS STEP *(OWNER, 2026-09-20, #796 item 1: "step 11 in
           * mode 5-3 walkthrough highlights the RHR card when its just a wait for coolant temp
           * step.")*, and the justification that stood here was about a DIFFERENT LEG'S STEP 11.
           *
           * It read: "The `note` makes COOLDOWN RATE on the RHR card the number to watch and names
           * HX SPLIT as this leg's only rate lever (#744 template pass)." Both halves are true of
           * `pwr_cooldown` step 11, which carries exactly that note and rings the RHR card. THIS
           * step has NO `note` at all, and this leg has no rate lever — the 100 °F/hr limit was
           * ruled OUT of the heatup (see the block below), because a heatup's rate is what pump
           * heat does whether the player likes it or not. A step-number collision between two legs
           * put a correct sentence on the wrong step, and the ring followed the sentence.
           *
           * RHR IS ALSO ALREADY SECURED BY THE TIME THIS STEP RUNS — the 585 psig autoclose fires
           * during the ride, which is what step 12's acceptance then asserts. So the cue pointed at
           * a system the player can neither read anything from nor act on.
           *
           * STEPS 1 AND 12 KEEP THEIRS, and the difference is the point: step 1 verifies the cold
           * lineup with RHR in service, and step 12 is graded on RHR being GONE. A watch ring has
           * to name something the step is actually about. */
          /* ⚠ THE 100 °F/hr HEATUP-RATE LIMIT IS OUT OF THIS LEG ON PURPOSE — DO NOT "RESTORE" IT
           * *(OWNER RULING, 2026-09-14/15, on options put as "put it back in a step / put it in a
           * note / leave it out": selected "Leave it out of the walkthrough")*.
           *
           * It used to live in this leg's `cautions[]`, and #755 item 2 retired that field from
           * the pwr2 pool entirely, so the limit went with it. The next reader will meet a heatup
           * walkthrough with no rate limit in it, check the cooldown leg, find one there, and
           * file a missing-content defect. It is not missing; it was ruled out. THE COOLDOWN LEG
           * KEEPS ITS 100 °F/hr — see `pwr_cooldown`'s HX SPLIT step — and that asymmetry is the
           * ruling, not an oversight: the cooldown's rate is something the player SETS with a
           * lever he is told to move, and this heatup's rate is what pump heat does whether he
           * likes it or not. `Manuals/` is unchanged and still carries the limit; a walkthrough
           * is not the manual. Same record in `Blueprint/WALKTHROUGH_STEPS_OWNER.md`. */
          hl_watch: ['Tavg', 'Primary Pressure', 'SG Pressure'] },
        /* THE EFFECT ACCEPTANCE FOR THE LETDOWN STEP (#624 item 25). The orifice step's own tick
         * reads the SELECTOR; this reads the PLANT, after the transfer has actually happened —
         * RHR gone (the 585 psig autoclose fired during the ride) and letdown still flowing,
         * which at this point can only be the orifices. Two entries, because either one alone
         * passes on the wrong plant: flow > 0 is satisfied by a cross-connect still in service,
         * and RHR out is satisfied by a plant with no letdown path at all. */
        { text: 'Verify ISOLATE is lit on the RHR card and LETDOWN reads above 0 gpm.',
          why: 'The Residual Heat Removal (RHR) suction valve shut itself when PRIMARY PRESSURE passed 600 psi during the climb; that is an interlock, not something you do. Letdown now leaves only through the orifices you opened earlier, about 11 gpm at this pressure. If it reads zero, water is going in and nothing is coming out.',
          accs: [
            { p: 'rhr_active', op: '<', v: 1, label: 'ISOLATE lit on the RHR card (the suction valve shut itself)' },
            { p: 'letdown_flow_actual', op: '>', v: 0, label: 'LETDOWN above 0 gpm' },
          ],
          /* A VERIFY STEP HAS NOTHING TO PRESS, SO IT PULSES NOTHING (#744 template pass). Both
           * cards were in `hl`, the "act on this" list, on a step whose whole content is two
           * readings — and whose `note` says to press A+B 7 % only IF letdown reads zero, which
           * is a conditional the pulsing ring cannot express. Steady on both. */
          hl_watch: ['Letdown Orifices (CVCS)', 'Residual Heat Removal (RHR)', 'Letdown Flow'] },
        /* THE HEAT SINK (#629, 2026-09-05). Filed by the owner as "the plant rides onto the
         * atmospheric dump valve and pressure stalls". The stall did not reproduce on this route
         * — pressure kept climbing at 26 psi/min straight through 1920 psia to the acceptance —
         * but the RIDE-ONTO-THE-ADV half is real and measured, and it was UNAVOIDABLE from the
         * board: `cold_shutdown` boots `dump_mode: 'off'` and the shell mapped AUTO to Tavg mode
         * unconditionally, so pressing AUTO changed nothing (measured: byte-identical trace, that
         * valve at 7.6 %, dumps 0.0 %) and the DUMP SETPOINT box was an orphan on every plant a
         * player heats up. The shell now selects steam-pressure mode when the turbine is tripped,
         * which is WTSM 11.2's own mode assignment.
         *
         * ⚠ #629's EXPLANATION FOR THE NO-OP IS REFUTED, re-measured 2026-09-08 (#646). It was
         * "the Tavg turbine-trip controller only opens above 557 °F (291.67 °C), ABOVE the
         * 1040 psig atmospheric dump valve". #508/#645 moved the anchor to 547 °F (286.11 °C),
         * 4.2 °F (2.3 °C) BELOW that valve's 551.2 °F (288.4 °C) saturation, and the ordering
         * inverted. The same heatup ride, three lineups, cold to Mode 3 + 2 plant-hours of park:
         *     pressure mode   547.2 °F / 1005 psig · valve SHUT  ·      0 lbm vented
         *     tavg mode       547.4 °F / 1006 psig · valve SHUT  ·      0 lbm vented
         *     never selected  551.6 °F / 1042 psig · valve 8.1 % · 11,005 lbm vented
         * So the press is NOT a no-op any more — it is worth 4.4 °F (2.4 °C), 37 psi and those
         * 11,005 lbm — but the mode it selects is no longer what buys that; PRESSING IT AT ALL is.
         * The step stays exactly where it is and for the SOURCED reason: pressure mode is the only
         * mode that reads the DUMP SETPOINT box, which is what the cooldown leg later walks down.
         *
         * WHY IT SITS HERE and not before the ride: in pressure mode the controller does nothing
         * until the secondary reaches the 7.03 MPa setpoint, which it does at the END of the ride,
         * so an earlier press has no observable effect for plant-hours. It also costs overshoot —
         * measured on pwr2_dumpctl directly over a 2.0 -> 7.6 MPa header ramp, selecting the mode
         * at 275 psig winds the PI integrator to its -30 clip and the dumps then do not crack
         * until 7.155 MPa (1023 psig), against 7.031 MPa (1005 psig) when the mode is selected at
         * the anchor. 18 psi of overshoot, still 17 psi under the atmospheric dump valve, so this
         * placement is a preference for an immediately observable press, not a safety necessity.
         *
         * THE RIDE'S OWN `hold: 40000` STILL TRANSITS THE VALVE in the replay (11.1 plant-hours
         * carries Tavg to 288.69 °C — re-measured 2026-09-08, unchanged), but its ACCEPTANCE
         * releases at 283 °C / 541.4 °F — 9.8 °F (5.4 °C) BELOW the 551.2 °F (288.4 °C)
         * saturation of the valve's 1040 psig setpoint. A player who follows the checklist gets
         * here first. That is #608's lesson read backwards: there a realistic hold MASKED an
         * unsafe acceptance; here an over-long one makes the replay the harder ride.
         *
         * Graded on the SELECTION (`steam_dump_auto`, control_state), because the dumps carry
         * 0.4-2.9 % once they are holding the anchor and the valve position cannot tell an
         * in-service controller from a shut one. The EFFECT is asserted in the Mode 3
         * confirmation below, which reads the atmospheric dump valve and the header pressure. */
        { text: 'Press AUTO on the STEAM DUMP card.',
          note: 'The dump now holds STEAM PRESS at the 1020 psi in the DUMP SETPOINT box.',
          why: 'From here the plant makes more heat than it needs, and the steam dump sends the excess to the condenser. Without it the steam side keeps climbing until the ATMOS DUMP valve opens and vents steam to the sky for the rest of the heatup. Real plants run the dump in this pressure-holding mode whenever the turbine is off.',
          control: 'Steam Dump', target: 'AUTO lit on the STEAM DUMP card, status reading PRESS',
          cmd: { action: 'set_steam_dump', mode: 'auto' }, hold: 10,
          acc: { p: 'steam_dump_auto', op: '>', v: 0 },
          /* THE BUTTON, NOT TWO NAMES FOR THE CARD (#744 template pass). 'Steam Dump' and
           * 'Dump SP' both resolve to `imrop5ouw7h` — the same two-labels-one-ring defect as the
           * VERIFY step earlier in this leg, here on the step that finally presses AUTO. The
           * status readout goes in the watch list because the step's own `target` names it
           * ("status reading PRESS") and it is the board's evidence the mode took. */
          hl: ['Steam Dump — Auto'],
          hl_watch: ['Steam Dump', 'Steam Dump Status', 'SG Pressure'] },
        { text: 'Raise SET PZR PRESSURE to 2235 psi, normal operating pressure.',
          why: 'The second stage of the pressurization. Crossing the 1972 psi gate re-arms the emergency injection, and that is safe now because the steam side is hot: STEAM PRESS sits near 1020 psi, far above the 328 psi that would trigger it. That is why this setting waited for the heatup to finish.',
          control: 'Pressure SP', target: 'PRIMARY PRESSURE above 2175 psi',
          /* THE AUTHORED HINT CONTRADICTED THE GENERATED SPAN, AND THE OWNER CAUGHT IT (#755
           * item 1, 2026-09-14, against this step: "WHICH IS IT, 1.5 PLANT HOURS OR 20
           * PLANT-MINUTES?"). The ⏩ line printed both — "About 1.5 plant-hours at 1×" off
           * `hold: 5400`, then this string's "About 20 plant-minutes on full heaters". The
           * authored half is the one that goes: `hold` is the dwell the replay proves the step
           * needs, so an authored number beside it is the same fact written twice. */
          cmd: { action: 'set_pressure_setpoint', mpa: 15.41 }, hold: 5400,
          acc: { p: 'pressure_mpa', op: '>', v: 15.0 },
          /* 'Primary Pressure' is an INDICATION and belongs in the steady list (#744 template
           * pass) — the sibling first-stage step in this same leg already has it that way, and
           * the two now agree. Only SET PZR PRESSURE is pressed. */
          hl: ['Pressure SP'], hl_watch: ['Primary Pressure'] },
        /* THE EFFECT ACCEPTANCE FOR THE STEAM DUMP STEP (#629), same shape as the letdown
         * transfer's. The dump step's own tick reads the SELECTION; these read the PLANT at the
         * end of the leg — the atmospheric dump valve SHUT and the header sitting on the anchor,
         * which together say the condenser is carrying the heat. Either alone passes on the wrong
         * plant: a shut valve is satisfied by a plant that has not got hot yet, and 7.03 MPa is
         * approached from below by any plant on its way up.
         *
         * ⚠ THE INJECTION THAT PROVED THEM LIVE HAS GONE HOLLOW, AND THE NEW ONE IS BELOW (#646,
         * 2026-09-08). The recorded one was "revert the shell's mode selection to the
         * unconditional 'tavg'": that used to read the valve at 8.60 % and the header at
         * 7.29 MPa (1042 psig) and redden EXACTLY these two. RE-RUN on this tree it reddens
         * NEITHER — 32/32 green — because after the #508/#645 re-anchor Tavg mode holds the plant
         * itself (valve 0.00 %, header 7.04 MPa). These two checks can no longer see WHICH mode
         * AUTO selected; they never could see it directly, they saw its consequence, and the
         * consequence is gone. That claim is gated where it belongs — `run_pwr2_shell` group M
         * asserts the published mode on BOTH branches and reds 161/162 under that same revert.
         *
         * INJECTION, CURRENT (HR10), measured 2026-09-08: DELETE this step's own `cmd` (the AUTO
         * press never issued, everything else untouched) and the valve reads 8.43 % with the
         * header at 7.29 MPa — EXACTLY these two go red, the other 30 stay green. That is the
         * defect this leg owns: whether the press reaches the plant and the plant answers over a
         * full heatup. The mode it selects is the shell's to prove. */
        { text: 'Verify Hot Standby: AVG COOLANT TEMPERATURE 547 °F, PRIMARY PRESSURE 2235 psi, CONTROL ROD POSITION still 0.',
          why: 'Hot Standby (Mode 3) is hot and at pressure with the reactor still shut down. The control bank never moved: the pumps did all the heating. STEAM PRESS holding near 1020 psi with the ATMOS DUMP shut says the steam dump is carrying the heat, not the sky.',
          /* THE MODE CONFIRMATION WAS A DEAD FIELD (#739, 2026-09-13). This step carried BOTH an
           * `acc` and an `accs`, and `instructor_layer.js` `_gradeStep` is
           * `if (st.accs && st.accs.length) {...} else if (st.acc) {...}` — the `accs` branch wins,
           * so the heatup leg's ONLY Mode 3, Hot Standby confirmation never graded and the step
           * ticked on the atmospheric dump valve and steam pressure alone.
           * FOLDED, not taught to the grader. Swept all five pools when the decision was taken (248 steps, 34 of them `accs`; 36 after this
           * change converted `pwr_cooldown` 7 and 10 from `acc`):
           * this was the ONLY step carrying both, so making `_gradeStep` honour both would change
           * the live grading of exactly one step while widening a schema whose own header says
           * "When `accs` is present it REPLACES `acc` (author one or the other)". The data fix is
           * local and the schema stays one-form; the class of defect is closed instead by
           * `run_checklist_pwr2` §2v, which now reddens on ANY step authoring both. */
          accs: [
            { p: 'plant_mode', op: '~', v: 3, tol: 0.1, label: 'Plant in Mode 3, Hot Standby' },
            { p: 'adv_valve_pct', op: '<', v: 1, label: 'ATMOS DUMP shut' },
            { p: 'steam_pressure_mpa', op: '~', v: 7.03, tol: 0.15, label: 'STEAM PRESS near 1020 psi' },
          ],
          /* The step line names CONTROL ROD POSITION as the third thing to read — "still 0", the
           * leg's whole claim that the pumps did the heating — and it was the one named tile with
           * no ring on it (#744 template pass). */
          hl_watch: ['Tavg', 'Primary Pressure', 'SG Pressure', 'Control Rod Position'] },
        /* #718 — THE DONE-WHEN NAMED A TAB, NOT A TILE. `acc` grades `reactivity_pcm`, and
         * `fmtPredicate` renders its own "When Net reactivity < -300 pcm" line under this step
         * from PRED_DISPLAY — there is no board tile for it (`ui/app.js:3939` labels it plainly,
         * correctly, and off-board) and the step text names two OTHER gauges instead, so a
         * player had no pointer to where the graded number actually lives. Swept the rest of the
         * pwr2 pool's `acc`/`accs`/`precond` params for the same shape (33 unique fields):
         * `plant_mode` already carries its own live-value note (`modeLiveNote`, #653 defect 4)
         * and every other one names a tile on the board. This is the only other case. */
        obs('Verify the reactor stayed shut down: SOURCE RANGE counts steady, STARTUP RATE near 0.00.',
          { p: 'reactivity_pcm', op: '<', v: -300 },
          /* THE DONE-WHEN LINE ON THIS STEP IS THE ONLY `pcm` IN EITHER LEG, AND IT IS NEVER
           * DEFINED (#653 S-9, 2026-09-15 layman playtest). The line itself is rendered by
           * `PRED_DISPLAY` in ui/app.js from `acc.p` — not authorable here — so the NOTE defines
           * the unit and says where the same fact shows on the board. The ACCEPTANCE IS
           * DELIBERATELY UNTOUCHED: the owner has separately asked for this step to grade on
           * SOURCE RANGE and STARTUP RATE instead of a physics quantity, and that is a grading
           * change owing its own measurement, not a wording fix. */
          'The done-when line reads NET REACTIVITY in pcm — hundredths of a percent of reactivity, a computed diagnostic on the Indications tab, not a board gauge. Below zero means shut down, and −300 pcm is a long way below. On the board the same fact is SOURCE RANGE steady and STARTUP RATE at 0.00.', null,
          'There is no gauge for "how shut down" a reactor is. The signs are SOURCE RANGE counts holding at a steady background instead of climbing, and STARTUP RATE sitting at zero. With the control bank in and boron at the cold concentration, the core is a long way from critical.',
          null, ['Source Range', 'Startup Rate']),
        /* #685 — THIS STEP GLOWED NOTHING. No `control` and no `hl`, on a "verify the
         * indication" step whose whole content is one gauge: one of four such steps measured in
         * the shipped pool. The two rod/boron labels are in the WATCH list, not the press list —
         * the step asks the player to act on neither, only to know where to look if the number
         * is not zero. 'Reactor Power' was added to the board vocabulary in the same change. */
        obs('Verify REACTOR POWER reads 0.0 %.',
          { p: 'power_pct', op: '<', v: 1 },
          'If it is not, stop and find out what moved: the control bank or BORON.', null,
          'Power at zero is the whole point of a pump-heat heatup: the friction of the running pumps warmed the plant, not a chain reaction. Power above 0% means something pulled the control bank or diluted the boron.',
          null, ['Reactor Power', 'Control Bank', 'Boron']),
      ],
      guard: {
        never_melted: true,
        never: [
          { p: 'fuel_temp_c', op: '>=', v: 1200 },
          { p: 'reactivity_pcm', op: '>', v: 0 },
          { p: 'power_pct', op: '>', v: 1 },
        ],
      },
      outcome: 'Plant at Mode 3, Hot Standby: hot, at pressure, reactor shut down, control bank never moved. Boron is still at the cold concentration near 918 ppm; the startup walkthrough begins by diluting it.',
    },
    {
      id: 'pwr_startup', category: 'startup', manual_ref: 'PWR-T03', next: 'pwr_raise_power',
      title: 'Mode 3, Hot Standby → Mode 1, At Power — startup to power',
      purpose: 'Start the reactor from Mode 3, Hot Standby: make it critical, bring power up past 5 % into Mode 1, At Power, and put the turbine on line. About 2 plant-hours.',
      from: 'hot_zero_power',
      prereq: ['Plant at Mode 3, Hot Standby: AVG COOLANT TEMPERATURE near 547 °F, PRIMARY PRESSURE 2235 psi, reactor shut down (auto-checked).', 'RCP FLOW on.', 'CONTROL ROD POSITION 0 of 627; SHUTDOWN ROD POSITION 627 of 627.'],
      /* MEASURED on hot_zero_power (2026-08-31, full stack): tavg 286.2 °C, 15.41 MPa,
       * boron 719 ppm, ρ −1,137 pcm, SR 502 cps. The boron row is the heatup→startup seam:
       * a pump-heat heatup arrives at ≈ 918 ppm — the dilution steps below are the remedy. */
      precond: [
        { p: 'tavg_c', op: '~', v: 286, tol: 8, text: 'Hot: AVG COOLANT TEMPERATURE 532 to 561 °F' },
        { p: 'pressure_mpa', op: '~', v: 15.41, tol: 0.5, text: 'At pressure: PRIMARY PRESSURE near 2235 psi' },
        { p: 'power_pct', op: '<', v: 1, text: 'Reactor shut down: REACTOR POWER 0 %' },
      ],
      steps: [
        /* ⚠ THE OWNER'S LINE IS 23 WORDS AND W2 CAPS IT AT 20 — SHORTENED, NOT WAIVED
         * (2026-09-18 reconcile of this leg to `Blueprint/walkthrough_steps/02_mode3_to_mode1.md`).
         * His edit spells the pump out — "RCP FLOW" -> "Reactor Coolant Pump (RCP) FLOW" — which
         * takes a line that was EXACTLY at the cap to 23 words, and `run_style`'s
         * `checklist_text_words` is a SCORED check that fails on any step over 20. The three words
         * cut are the filler "the plant is"; his addition is what stays, because it is the content
         * half of the edit. Same remedy and same precedent as Mode 5 -> 3 steps 4 and 6, recorded
         * in `Blueprint/WALKTHROUGH_STEPS_OWNER.md`: "Shortened, not waived."
         * DO NOT "restore" the longer line from his file without moving a clause to `note`. */
        /* ⚠ STEP NUMBERS IN THE COMMENTS OF THIS LEG (2026-09-23 reconcile to the owner's new-format
         * `Blueprint/walkthrough_steps/02_mode3_to_mode1.md`). The count is still 17, but the middle
         * moved: OLD step 9 (the creep onto criticality) is now TWO steps — 9, the approach (the
         * creep `cmd`, rods-stopped + STARTUP RATE rows) and 10, the climb from critical (the INTER
         * RANGE / REACTOR POWER rows, `implied_by` intact); OLD step 10 (power 0.5 %) is now 11; OLD
         * step 11 (the SOURCE RANGE hand-off confirm) is FOLDED into 11's note. Steps 1-8 and 12-17
         * keep their numbers. Comments dated BEFORE 2026-09-23 below use the OLD numbering and are
         * left as the record they are; read "step 9" in them as 9+10 and "step 10" as 11.
         *
         * THE FORMAT: each step's `text` is the owner's goal line, each lettered substep is one HEAD
         * `accs` entry (`ask` = its action, `note`, `wait_speed`/`speed_text` = its "Suggested time
         * warp"), each further `()` line is a `cont` row. `why` is his Background. Steps whose
         * substeps carry their own speed line set `wait_hint: false`, or the generated ⏩ line
         * would print the same rung a second time on the card. */
        /* STEP 1 GRADES HIS TWO BANDS, NOT THE OLD 532-561 °F (2026-09-23). The shipped acceptance
         * was `tavg_c ~ 286 ± 8` (532 to 561 °F) and no pressure row; his check-offs are
         * 544-549 °F and 2200-2270 psi. Both tiles print whole numbers, so each end is its render
         * band's EDGE (#749): 543.5 °F renders "544" and 549.48 °F still renders "549"; 2199.6 psi
         * renders "2200", 2270.4 psi "2270". MEASURED, full stack, `hot_zero_power`, seed 42,
         * 300 s at 10x: instrumented AVG COOLANT TEMPERATURE 546.3-548.2 °F, PRIMARY PRESSURE
         * 2235-2242 psi, both rows met on 296 of 300 broadcasts (the other four are the five-sample
         * debounce). Margin to the band: 1.3 °F on the hot side. */
        { text: 'Verify the plant is hot and shut down before any rod moves.',
          why: 'Hot Standby (Mode 3) is hot and at pressure with the reactor still shut down: the pumps are running, the shutdown rods are already fully out, and SOURCE RANGE counts sitting still means nothing is drifting toward critical yet.',
          past: { p: 'power_pct', op: '>', v: 1 },
          accs: [{ p: 'tavg_c', op: '~', v: 285.83, tol: 1.66,
                   ask: 'Read AVG COOLANT TEMPERATURE near 547 °F, PRIMARY PRESSURE near 2235 psi, and RCP FLOW on.',
                   note: 'SOURCE RANGE counts should be steady, not climbing. One alarm is already up and belongs here: Turbine Trip / Low Steam Demand on the ALARMS list, short form TURB TRIP. The turbine is off and the plant is making no steam. Press ACK on the ALARMS list and leave it.',
                   wait_speed: 1,
                   label: 'AVG COOLANT TEMPERATURE 544 to 549 °F' },
                 { cont: true, p: 'pressure_mpa', op: '~', v: 15.41, tol: 0.244,
                   label: 'PRIMARY PRESSURE 2200 to 2270 psi' }],
          hl_watch: ['Source Range', 'Tavg', 'Primary Pressure', 'Reactor Coolant Pumps (RCP)', 'Boron Concentration'] },
        /* THE NUMBER CAME OUT *(OWNER RULING, 2026-09-14/15: selected "Drop the number entirely")*.
         * This `why` said "boron is already near 719 ppm", which is true of ONE of the two routes
         * in and wrong about the other. MEASURED on this tree: the Hot Standby preset boots at
         * 718.9 ppm; the chained route — the Mode 5 to Mode 3 leg run first — arrives at
         * 917.8 ppm. A stated value is therefore wrong half the time, and a player who trusts it
         * never looks at the tile. The step now sends him to BORON CHEM, which is right on both
         * routes and is the habit the rest of the leg needs anyway. Step 2's own `why` keeps BOTH
         * numbers because it is comparing them (918 vs 719 against the bank position each
         * implies) — that is a contrast, not a claim about where this plant is.
         *
         * ⚠ THE BORON SENTENCES THIS PARAGRAPH DESCRIBES ARE NO LONGER ON STEP 1 (2026-09-18
         * reconcile to `Blueprint/walkthrough_steps/02_mode3_to_mode1.md`). His step 1 keeps the
         * alarm instruction and stops there, and its Background ends at the counts — the "BORON
         * CHEM is the live loop concentration…" tail and the "the next step trims whatever boron
         * the route in left behind" clause are BOTH gone, deleted because his file does not carry
         * them. The ruling that produced them is NOT reversed: no step names a starting boron
         * value, and step 2's own note still sends the player to BORON CHEM. Only step 1 lost it. */
        /* DO NOT RE-PRESS ON *(layman playtest 2026-09-07, #653 S1, measured on the full stack from
         * cold_shutdown)*: the channel boots engaged, and `set_auto_channel engaged:true` on an
         * engaged channel RE-CAPTURES the target to the analyzer (918), cancels the running dose,
         * and leaves the dilution running with the channel reading idle — 918 -> 565 ppm in four
         * plant-hours, never stopping. Setting the target alone delivers the dose and stops (at
         * 788, not 719 — the totalizer's own defect, filed separately). The four boron steps in the
         * chain now say to press ON only if it is not lit. */
        /* "UPDATES ONLY AFTER A SAMPLE" WENT STALE THE DAY #698 REMOVED THE SAMPLE BUTTON
         * (owner playtest 2026-09-12, #714: "mode 3> mode 1 step 2 walkthrough is broken.
         * its looking for a chemistry sample but that feature has been removed there is no
         * sample button any more."). `acc` here grades true `boron_ppm`, never a sample, so the
         * step was never mechanically blocked — the REPLAY (section 1) drove it to completion
         * every time. What was broken was this prose: it told the player to expect a delay and
         * a control that no longer exist. BORON CHEM is a live channel now (#698); say so. */
        /* ⚠ THIS `why` CARRIED THE LEG'S OLD CRITICAL POSITION AFTER #748 MOVED IT, AND BOTH ITS
         * CLAUSES WERE WRONG (#749, 2026-09-14). It said "230 of 627" while steps 9 and 10, edited
         * the same day, say the core goes critical around 205-215 — a contradiction inside one leg,
         * which is the class #748 was hired to remove. And its 918 ppm clause said the control bank
         * "cannot make the reactor critical at all", which is not what the plant does.
         *
         * ADJUDICATED BY MEASUREMENT (full stack, pwr2, `hot_zero_power`, boron and T-avg logged at
         * every sample so nothing else was moving). QUASI-STATIC sweep — one step at a time, 60 s
         * settle each, rods commanded on `control_rods` and the position read back off BOTH
         * `true_state.rod_steps` and `control_state.rod_groups[0].steps`, shutdown bank pinned at
         * 627, boron flat at 718.88 ppm, average coolant temperature 547.2-547.3 °F
         * (286.24-286.27 °C) throughout:
         *
         *     bank 205   ρ -16.59      bank 208   ρ  +5.80  <- FIRST whole step with ρ >= 0
         *     bank 206   ρ  -9.13      bank 209   ρ +13.31
         *     bank 207   ρ  -1.81      bank 210   ρ +21.50      (zero crossing at 207.2)
         *
         * THE METER DEFINITION LANDS ON THE SAME STEP. Rods stopped and held 900 s: at 203
         * (ρ −32) power plateaus at 6.6e-6 % and STARTUP RATE reaches 0.000; at 207 (ρ −1.9) the
         * rate DECAYS 0.112 → 0.020 and is still falling; at 208 it settles POSITIVE (0.033-0.043)
         * with power climbing 6.5e-6 → 3.8e-5 %. So "ρ crosses zero" and "self-sustaining on the
         * meters" give the same answer here — 208 — and 207 is the ambiguous step, not 226.
         * Corroborated on the AUTHORED route (every step's cmd issued and held as written, four
         * seeds 42/1/7/123): ρ crosses zero at bank 208, t = 672-673 s, inside step 9's burst.
         *
         * AND 918 ppm DOES GO CRITICAL: measured at 917.6 ppm (ρ = −3398.6 pcm with the bank in),
         * 50-step bursts to 450 then 2-step, the bank crosses zero at 490 of 627 (ρ −2.9 at 488,
         * +9.1 at 490). Boron differential worth over the pair: 11.38 pcm/ppm.
         *
         * WHERE 230 CAME FROM — A GATE STANDING AT THE WRONG TEMPERATURE, and my first answer to
         * this was wrong. I filed "one replay artifact, repeated"; the quality pass refuted it and
         * the refutation reproduces. `test/run_reactivity.js`'s startup block evaluated this plant
         * at `K2.HZP` — the BEAVRS / Watts Bar hot-zero-power physics-test anchor, 557.0 °F
         * (291.67 °C) / 15.5 MPa, which the kinetics model is CALIBRATED against and which no
         * initial condition occupies. The plant's no-load point is 547.0 °F (286.11 °C) /
         * 15.41 MPa and dρ/dT is −11.6 pcm/°F, so everything that block published was 10 °F hot:
         *
         *                     at K2.HZP (what shipped)      at the plant
         *   ρ @ 0, 719 ppm         −1257.2  ("−1257")          −1136.2
         *   critical, 719 ppm          223  ("223 steps")          207
         *   critical, 857 ppm          400  ("400 steps")          392
         *   ±750 pcm band          111/311  ("111–310")         88/297
         *   differential              8.06  ("8.1 / 1.24 ¢")    7.764  (1.19 ¢)
         *
         * ONLY 226-238 was the replay (step 10's 15 slow steps from 211, off the anchor's 223),
         * recorded at cd1cc20c (#602 phase 2) where `git log -S` also puts this step's 230. The
         * gate now reads its temperature from the §7.5 table it has just verified against the
         * plant. Re-run on scratch worktrees of cd1cc20c (2026-09-01) and 2b4ef9ed (2026-09-03,
         * the commit that wrote 223), the full-stack sweep gives 208 on both — so no plant change
         * is involved — and the retired engine is not the source either (320 of 912 at 705 ppm).
         *
         * ⚠ THE FIX EXPOSED A LADDER DEFECT THAT IS STILL OPEN: burst 5 (step 9) lands at bank 211,
         * ρ = +33 pcm, so the last 1/M point is plotted on a SUPERCRITICAL core, and the creep
         * leaves 148 pcm of excess. `run_reactivity` carries three reds for it (28/3 in BASELINES).
         * Not re-sized here — step 10 steers on the plot by ruling (#660), so it is a decision. */
        { text: 'Bring boron down to the estimated critical concentration, 719 ppm.',
          why: 'Boron dissolved in the water soaks up neutrons, so the control rods do not have to come as far out before the reactor goes critical. At 719 ppm it goes critical around 208 of 627 steps — low in the bank, with travel left. At 918 ppm the same bank has to come about four-fifths of the way out, around 490 steps.',
          control: 'Boron control', target: 'BORON box 719; BORON STATUS counting down; BORON CHEM tracking live',
          /* 90, not 65 (#749). MEASURED end to end on the full stack: 917.6 → 718.7 ppm takes
           * 88.4 plant-minutes (850 at +28.4, 800 at +50.0, 760 at +68.4, 740 at +78.4, 725 at
           * +85.0). Dilution is not linear and is not the boration rate read backwards — 857 → 719
           * averages 2.2 ppm/min against 3.0 borating the same span. The plant lands at
           * ρ = −1138.8 pcm, i.e. the same hold it boots at, so the number is the CLOCK and not a
           * different plant. */
          /* THE 600× IS NOW THE SUBSTEP'S RUNG, NOT A PROSE HINT (2026-09-23). From the Hot Standby
           * preset the row is met on arrival, so no substep is active and the rung never applies;
           * from the chained 918 ppm plant it is the 90-minute wash his line names. One number is
           * right on both routes, which is why `wait_speed` can be 600 with his two-route sentence
           * as the `speed_text`. */
          cmd: { action: 'set_auto_setpoint', channel_id: 'boron_conc', value: 719 }, hold: 60,
          accs: [{ p: 'boron_ppm', op: '~', v: 719, tol: 40,
                   ask: 'On the BORON card set 719 and press Enter.',
                   note: 'ON is normally already lit; press it only if it is not. BORON STATUS reads DILUTING while the dose runs and stops by itself; BORON CHEM is a live channel and tracks the loop as it falls. From the Hot Standby preset boron already reads 719 and this step ticks at once.',
                   wait_speed: 600,
                   speed_text: '1× from the Hot Standby preset. If BORON CHEM reads near 918 (you came here from the Mode 5 to Mode 3 walkthrough), 600× — the wash takes about 90 plant-minutes.',
                   label: 'BORON CHEM 679 to 759 ppm' }],
          hl: ['Boron Target'], hl_watch: ['Boron Status', 'Boron Concentration'] },
        /* CONFIRM, NOT ACT *(OWNER, 2026-09-03, #619 item 16: "mode 3 CL has me put SG feed in
         * AUTO but its already in AUTO when I get there")*. Both routes into this leg arrive
         * with feed already in AUTO — the Hot Standby preset boots it there, and a player who
         * came up the heatup did it themselves at PWR-N01 step 5. So the instruction was one the
         * plant had already carried out, which teaches the player that checklist steps are
         * decoration.
         *
         * The step STAYS, as a verification: SG feed in AUTO is a genuine prerequisite for
         * adding heat and a checklist that silently assumes it is worse than one that checks it.
         * `cmd` is kept so the replay still exercises the command path, and the text now says
         * what to do in the one case where it is NOT already set. */
        /* GRADED ON THE STATE, NOT THE PRESS (layman playtest 2026-09-07, #653 S5): a step with a
         * `cmd` and no predicate completes on the live checklist only when the command is SEEN
         * (instructor_layer `met = st.cmd ? c.cmdSeen`), so this check could not tick unless the
         * player pressed the button the text told them not to press. The `cmd` is gone and the
         * acceptance is the lamp; the replay's plant boots with feed in AUTO and ticks on it. */
        { text: 'Line up the heat sink before the reactor makes any heat.',
          why: 'The steam generator is the boiler: reactor water heats it on one side and steam comes off the other. Once the reactor starts making heat, that steam comes off fast, and AUTO on the feed system is what holds the level.',
          control: 'Feed Pumps', target: 'SG FEED reads AUTO, STEAM GENERATOR LEVEL near 65 %',
          hold: 5,
          accs: [{ p: 'feed_coupled', op: '>', v: 0,
                   ask: 'Check SG FEED reads AUTO. If it does not, press AUTO.',
                   wait_speed: 1, label: 'SG FEED reads AUTO' }],
          /* THE RING STAYS BECAUSE THE PRESS IS REAL, AND IT HAS TO SAY SO (#653 S-3b). The step is
           * graded on the LAMP, not on a command — a player who arrives with SG FEED already in
           * AUTO does nothing and the step self-ticks — so nothing in the step declares a press,
           * and since the 2026-09-15 ring ruling `ui/app.js` will not pulse a step that does not.
           * This one genuinely asks ("If it does not, press AUTO"), so it declares it. */
          press_expected: true,
          hl: ['SG Feed AUTO'], hl_watch: ['SG Level'] },
        /* THE INDICATION IS NAMED, AND SO IS ITS NOTATION *(OWNER, 2026-09-03, #619 item 19:
         * "It never says to look at the SOURCE RANGE indication for counts… SOURCE RANGE says
         * 7.0e2 but step says 700. a layman wont know this is equivalent")*. The counts are the
         * whole reactivity indication on this leg and no step said where to read them. The
         * meter is a LOG channel and prints its exponent (ui/app.js logSer), which is
         * prototypical and stays — so the checklist states the equivalence once, here, at the
         * first count target, and the per-step targets carry it in the always-visible line. */
        { text: 'Take the 1/M baseline point before any rod moves.',
          why: '1/M means one-over-multiplication: the plot divides the starting SOURCE RANGE count by the current one. As counts climb that number falls toward zero, and where the line would cross zero is the rod position at which the reactor goes critical. It fits the last three points, so each new point sharpens the prediction.',
          control: '1/M Plot', target: 'point 1 plotted',
          accs: [{ cmd: 'plot_1m_point',
                   ask: 'Press 1/M PLOT on the ROD CONTROL card, then press Plot point.',
                   note: 'This first point is the baseline. Every count target on this walkthrough is the SOURCE RANGE reading, printed in shorthand: 7.0e2 is 700 counts a second, 1.4e3 is 1,400, 7.0e3 is 7,000.',
                   wait_speed: 1, label: 'Baseline point plotted' }],
          overtaken: SR_OVERTAKEN,
          /* GLOW THE BUTTON, NOT THE BOX THAT OPENS IT (#735, owner playtest #724 items 4 and 5:
           * "the plot point in the 1/5 plot window should be glowing since the step asks the
           * user to press it"; "the 1/m plot button that opens the plot should not be glowing,
           * the plot point button on the plot window should be glowing"). Both labels used to
           * resolve to `bdOneOverM`, the board button that OPENS the plot — so every plot step
           * glowed the opener. `Plot point` now resolves to the panel's own button
           * (`[data-oom="plot"]`, ui/highlight_bus.js SHELL_TARGETS). THIS step is the one that
           * legitimately names both, because it is the one that opens the panel. */
          hl: ['1/M Plot Tool', 'Plot point'], hl_watch: ['Source Range'] },
        /* BURST SIZE, NOT BANK POSITION *(OWNER RULING, 2026-09-03, #619 item 20: "The mode 3>1
         * CLs should tell the user about how many steps to pull the rods for startup instead of
         * a 'long burst'. i have no idea how long a 'long burst' is." — scoped in the same
         * session to the burst MAGNITUDE only)*. A burst size is not the absolute bank position
         * #618 removed hours earlier: the step still steers on the count rate and the acceptance
         * is unchanged. The numbers are the replay's own `cmd.steps` — 94 / 63 / 31 / 14 / 9,
         * rounded — so they cannot drift from what the harness drives. */
        { text: 'Withdraw the control rod group and plot a second point on the 1/M plot to begin forming a fit line.',
          /* ⚠ "PLOT POINT DOES NOTHING UNTIL THE COUNTS ARE STEADY" WAS FALSE AND SHIPPED ON THIS
           * CARD (#759, verified 2026-09-15). MEASURED: pressing Plot point with rung 5c unmet
           * ADDS REAL POINTS — 1 -> 2 -> 3 SVG circles, the panel refitting each time — the rung
           * never ticks, and nothing on the card says a word. The junk points land at rod
           * position 0 inside the panel's trailing-three fit, and only `Clear` removes them.
           * `accs_ordered` gates the CHECK-OFF, not the button. *(OWNER RULING, 2026-09-15:
           * selected "Fix the text AND say why (Recommended)")* — this is the text half; the
           * card's one-line reason on an out-of-turn press is ui/app.js. */
          /* the step-level `note` moved into 5a's own `note` (2026-09-23 reconcile) — his 5a note is the one sentence below; the rod-speed and early-plot sentences it used to carry are NOT in his file and went with it (recorded in the step file's Notes). */
          why: 'The first two points always predict the criticality point too high: near the bottom the rods are worth little per step, so the line they draw crosses zero far past the real critical position. That is expected. While the reactor is shut down, SOURCE RANGE counts are the only thing that tells how close the core is; rod position does not.',
          control: 'Control Bank', target: 'SOURCE RANGE above 7.0e2 (700 counts a second); point 2 plotted',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 94, speed: 'normal' }, hold: 300,
          /* THE COUNT IS WRITTEN THE WAY THE METER WRITES IT *(OWNER, #724 item 6: "Whenever the
           * SOURCE RANGE is referenced it should be in the format of 7.0e2 not 700cps. this is
           * not consistant. it can still have '7.0e2 (700 counts per second)', this is
           * acceptable.")*. The step's `target` line already said 7.0e2; the CHECK-OFF line said
           * "700 cps", so the one number the player is hunting for appeared in two notations on
           * one card. `PRED_DISPLAY.sr_counts_cps` renders the done-when in the same form
           * (ui/app.js, the `sci` flag), which is the third place it was written differently. */
          /* THREE SUBSTEPS, IN ORDER (#756) *(OWNER DIRECTIVE, 2026-09-15: "For the early-plot
           * hole, we could have instructions for substeps not just one line of instruction then
           * multiple substeps. We could give a line of instruction per substep. We instruct to
           * pull rods to a count/however many steps. The next substep says to wait for the
           * startup rate to stabilize. Once the startup rate hits a predetermined number that
           * step checks off. Then have another substep to plot the 1/m point.")*. `accs_ordered`
           * makes the plot row unreachable until the settle row is met, so an early press cannot
           * CHECK THE ROW OFF — #755's standing hole.
           *
           * ⚠ IT DOES NOT MAKE THE BUTTON DEAF, AND THIS COMMENT SAID IT DID (#759, measured
           * 2026-09-15). `accs_ordered` gates the CHECK-OFF only: pressing Plot point with the
           * settle row unmet adds a real point to the plot (1 -> 2 -> 3 circles, the panel
           * refitting each time), at rod position 0, inside the trailing-three fit, removable
           * only with `Clear`. The claim was copied into the step's own note and shipped to the
           * player as fact; see the note above.
           *
           * ⚠ THE PLOT IS GATED ON ROD-STOP, THEN ON STARTUP RATE *(OWNER RULING, 2026-09-17: selected
           * "Gate on rods stopped + startup rate" from three options put to him — gate on rod-stop
           * plus startup rate, remove the steady row and keep startup rate alone, or keep the steady
           * row. A SELECTION, not verbatim words.)* Four rows: the owner's counts floor (the cue to
           * STOP pulling), then the rods have stopped, then STARTUP RATE back to zero, then plot.
           * The counts-steady row that used to sit third is GONE — see below for what it was doing.
           *
           * WHY THE STEADINESS ROW WENT. It was a PROXY for "the operator has stopped pulling", and
           * a slow dribble defeats a proxy. MEASURED (#761, hot_zero_power, one bank step withdrawn
           * every 20 s, the rung's own bank target): the counts-steady row latches with the bank
           * STILL MOVING at rung 5, and the startup-rate row does the same at rungs 5 AND 6 — rung 6
           * is inside the panel's trailing-three fit window. The arithmetic makes it inevitable:
           * 0.02 decades a minute is 9.6 % of drift over a 120 s window, so any climb between 3 %
           * and 9.6 % per two minutes reads settled to the rate row on any route. It also bought
           * 0.6 of a bank step (4.5 pcm at 7.58 pcm/step) for 445 s of waiting, against a ladder
           * whose own spread is 2 bank steps (`Diagnostic/ACCURACY_VS_WAIT_2026-09-17.md`).
           *
           * WHY 60 SECONDS OF NO ROD MOTION, AND NOT A ROUND NUMBER. MEASURED, rungs 5 and 6, taps
           * at 2 / 5 / 10 / 20 / 30 / 45 / 60 / 75 s: `stopped` latches while the bank is still
           * moving IF AND ONLY IF the tap cadence is at or above its `v`. So `v` is exactly "the
           * slowest tap cadence this rung refuses" and has no other free parameter. The dribble
           * family that defeated both shipped rows tops out at 20 s a tap; 60 s is three times
           * that, and it refuses a 45 s dribble (measured) as well.
           *
           * AND IT COSTS ALMOST NOTHING ON THE AUTHORED ROUTE, which is the other half of the
           * choice. MEASURED, the authored 94/63/31/14 bursts, seconds FROM ROD-STOP — the last
           * broadcast on which the bank moved, which is the reference point for every figure here:
           *
           *   rung   startup rate in band   rod-stop row met   whole rung met   cost of the row
           *     5            17 s                 64 s              64 s            +47 s
           *     6            62 s                 64 s              64 s             +2 s
           *     7           141 s                 64 s             141 s              0
           *     8           341 s                 64 s             341 s              0
           *
           * 49 s over the four rungs, 6 % of the 813 s the rate row alone would need. From rung 7
           * on, the startup rate is the long pole and the rod-stop row is free.
           *
           * ⚠ THE STARTUP-RATE BAND IS 0.02 DPM AND IT COMES FROM THE CHANNEL'S OWN SCATTER, not
           * from what a startup rate "ought" to read: the instrument's detrended standard deviation
           * over a settled 300 s tail is 0.0040-0.0043 DPM, so 0.02 is 5 sigma (3 sigma is 0.012).
           * 0.08 and 0.10 are DISQUALIFIED outright — on the first two rungs the rate never exceeds
           * 0.131 / 0.283 DPM, so those bands are satisfied 5 s after the burst, before the rods
           * have even stopped. Peak rate by rung: 0.131 / 0.283 / 0.458 / 0.552 DPM.
           * ⚠ `steady` ON THE RATE WOULD BE MEANINGLESS: `v` is RELATIVE to the window mean and this
           * channel settles to zero, so the metric reads 14 %, 410 %, 3,390 % on a plant that is not
           * moving. A two-sided `~` band is the right form for a hold claim on it.
           * ⚠ THE `hold` VALUES (300 / 300 / 420 / 600) ARE UNCHANGED and were re-measured against
           * the new rows: the rung is satisfied 181 / 143 / 197 / 350 s after the burst command, so
           * every hold clears its own step's acceptance by 1.66x to 2.13x and none reddens the
           * replay. Lowering them was measured and DECLINED here — see step 8. */
          /* ⚠ THE COUNT TARGET IS THE BOTTOM OF ITS OWN RENDER BAND, NOT THE MIDDLE OF IT
           * (#749 item 1, measured 2026-09-18). THIS RULE GOVERNS ALL FOUR RUNGS.
           *
           * The NIS card prints the source range through `fmtExp` (pwr_board_wiring):
           * `mantissa.toFixed(1) + 'e' + exponent`. So the string `1.4e3` is drawn for
           * ANYTHING in [1350, 1450) — the target the step tells the player to watch for is
           * the CENTRE of a 100-count band, and the tile reads it for fifty counts before the
           * old `> 1400` row could tick. Measured, the player's route (release WITHDRAW the
           * instant the tile first prints the target, `hot_zero_power`, seed 42): the release
           * lands at truth 1254 / instrument 1366, the old row closes 173.2 s later, and over
           * those 300 s the tile printed 1.4e3 or higher on 2,046 of 3,000 broadcasts.
           *
           * So every count threshold here is `>=` the band's LOWER EDGE, T − 0.05·10^E:
           *     7.0e2 -> 695      1.4e3 -> 1350      3.0e3 -> 2950      7.0e3 -> 6950
           * The edge value itself renders as the target string (`fmtExp(695)` is `7.0e2`,
           * `fmtExp(695 − ε)` is `6.9e2`), which is why the op is `>=` and not `>`.
           * `test/run_checklist_pwr2.js` §2ab re-derives all four out of `fmtExp` and reddens
           * if one drifts back to the centre.
           *
           * THE PLAYER STILL ONLY EVER SEES THE SHORTHAND *(OWNER, #724 item 6: "Whenever the
           * SOURCE RANGE is referenced it should be in the format of 7.0e2 not 700cps")* — the
           * edge number is never printed. It does not need to be: at the tick the tile IS
           * reading 7.0e2, which is what the label now says.
           *
           * THE OTHER HALF OF THE FIX IS THE CHANNEL, and it is in instructor_layer.js:
           * `sr_counts_cps` now maps to the `source_range` instrument, so the row grades the
           * same number the tile formats. Moving the edge without that leaves the two on
           * different channels and half the defect standing. */
          /* ⚰ ONE STEP PER PLOT POINT, WHICH IS WHERE THIS WAS BEFORE #756 *(OWNER, 2026-09-20,
           * #796 item 3: "Walkthrough mode 3-1 step 5 is broken. each of these checkoff should
           * have a white step text above it. go back to one step per plot point like we had
           * before. Same with step 6. remove the requirements for startup rate to fall back to
           * zero.")*. This SUPERSEDES #756, which was his own 2026-09-15 directive for a line of
           * instruction per substep.
           *
           * WHAT HE IS LOOKING AT, IN CSS TERMS: a step's instruction is `.ckl-txt`, white
           * (var(--text)); a lettered check-off row is `.ckl-crit`, cobalt (#7fa8dd). Four rows
           * meant four cobalt imperatives and no white instruction of their own, so the rung read
           * as four steps that were not steps. Collapsing to one step per point puts the whole
           * sequence back in the white line above the check-offs.
           *
           * THE ROD-STOP AND SETTLE ROWS GO; THE SETTLE ITSELF DOES NOT. It moves from a graded
           * row into the instruction and the note — which is exactly where it was before #756 —
           * so the requirement is lifted (his words) while the guidance stays. That distinction is
           * load-bearing, because the premise underneath it measures FALSE:
           *
           * ⚠ MEASURED 2026-09-20 (#796, seed 42, full stack, the same run sampled twice: at the
           * tick each rung's counts arrive, and again at the end of its hold). Plotting all four
           * rungs WITHOUT the settle predicts critical at step 213; WITH it, step 208. This plant
           * actually goes critical at step 207. So the settle is worth 5.1 steps of prediction,
           * and every bit of the error is on the DANGER side — a prediction that reads HIGH tells
           * the operator they have further to go than they have. His recollection that it "doesn't
           * have much affect on the final outcome" does not reproduce. The number is why the text
           * still says to wait for it, and why the `note` now carries the cost in rod steps.
           *
           * `accs_ordered` STAYS. With two rows it still does the one thing #756 bought that
           * nothing else does: a cmd-kind entry is deaf until the row above is met, so Plot point
           * cannot bank a stale point while the counts are still climbing. */
          accs_ordered: true,
          wait_hint: false,
          accs: [{ p: 'sr_counts_cps', op: '>=', v: 695,
                   ask: 'Hold WITHDRAW at MED until SOURCE RANGE passes 7.0e2. Let STARTUP RATE fall to zero.',
                   note: 'Stop when CONTROL ROD POSITION reads about 80 to 100.',
                   wait_speed: 5,
                   label: 'SOURCE RANGE reads 7.0e2 (700 counts per second) or more' },
                 { cmd: 'plot_1m_point', ask: 'Press Plot point to plot the second point.', wait_speed: 1,
                   label: 'Point plotted' }],
          overtaken: SR_OVERTAKEN,
          /* CONTROL ROD POSITION IS WHAT THE 1/M PANEL'S PREDICTION IS A NUMBER ON (#735, owner
           * playtest #724 item 10: "we should probably highlight CONTROL ROD POSITION in the
           * step the first time we mvoe the rods as well"). This is that first move. */
          hl: ['Rod Speed — Normal', 'Withdraw', 'Plot point'],
          hl_watch: ['Source Range', 'Startup Rate', 'Control Rod Position'] },
        { text: 'Withdraw again and plot a third point; the fit now prints its first prediction.',
          /* NO AUTHORED `wait_hint` (#653 S-5, 2026-09-15): `hold` is 300 s, so ui/app.js already
           * prints "About 5 plant-minutes at 1× — set the speed control to 10×." on this card, and
           * the authored string said 10× a SECOND time in the same line. Same defect on step 5.
           * An authored hint earns its place only by carrying a fact the generated line cannot —
           * step 7's rod-speed caution, step 8's "come back to 10× for the next step". */
          why: 'Each new point is taken closer to critical, where a step is worth more, so the line steepens and the predicted crossing walks in. The panel prints the crossing as a rod step with a marker on the plot. That number still reads high; it improves with every point.',
          control: 'Control Bank', target: 'SOURCE RANGE above 1.4e3 (1,400 counts a second); point 3 plotted',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 63, speed: 'normal' }, hold: 300,
          /* One step per plot point since #796 item 3 — the reasoning is on step 5. */
          accs_ordered: true,
          wait_hint: false,
          accs: [{ p: 'sr_counts_cps', op: '>=', v: 1350,   // the 1.4e3 band's lower edge — see step 5's RENDER BAND block
                   ask: 'Hold WITHDRAW until SOURCE RANGE passes 1.4e3. Let STARTUP RATE fall to zero.',
                   note: 'Stop when CONTROL ROD POSITION reads about 150 to 175 steps. Wait for the rate before you plot — see step 5.',
                   wait_speed: 5,
                   label: 'SOURCE RANGE reads 1.4e3 (1,400 counts per second) or more' },
                 { cmd: 'plot_1m_point', ask: 'Press Plot point, then read the predicted rod position the panel prints.', wait_speed: 1,
                   label: 'Point plotted' }],
          overtaken: SR_OVERTAKEN,
          hl: ['Withdraw', 'Plot point'],
          hl_watch: ['Source Range', 'Startup Rate', 'Control Rod Position'] },
        { text: 'Withdraw a shorter rung and plot a fourth point to tighten the prediction.',
          /* ⚠ "THE SETTLE TAKES LONGER AT EVERY RUNG" WAS AN UNMEASURED CLAIM IN PLAYER COPY
           * (#653 S-11, 2026-09-15). MEASURED on the built pool: all four settle rungs on steps
           * 5-8 carry IDENTICAL acceptances — the bank stopped for 60 s, then `startup_rate ~0
           * ±0.02`. The PLANT does take longer nearer criticality (the owner's own observation),
           * and since #761 the live durations ARE measured: the rung is met 64 / 64 / 141 / 341 s
           * after ROD-STOP, so the settle genuinely does stretch — but only from rung 7 on, where
           * the startup rate becomes the long pole. The removed sentence is still not restored
           * here, because it would be false of rungs 5 and 6. */
          /* THIS ONE KEEPS ITS `wait_hint`, AND IT SAYS THE OPPOSITE OF WHAT IT USED TO. `hold` is
           * 420 s here, so the generated line offers 60× — right for the settle, WRONG for the
           * pull this step opens with: the rung is only 25 steps wide (180 to 205) and MED is
           * 48 steps a MINUTE at 1×, i.e. 48 a SECOND at 60× (#653 S-5; the 48/min figure is the
           * pool's own, authored on step 5). The old string just said "10×" beside the app's
           * "60×" and left the player to pick. Same trap as step 9's note, two steps down. */
          /* ⚰ THE AUTHORED `wait_hint` IS GONE (2026-09-23): his 7a authors 10× for the pull-and-settle
           * substep and its note carries "watch the position, not the clock" — the rung the old
           * string argued for, now set rather than argued. */
          wait_hint: false,
          why: 'Each step now buys more reactivity than the last, so the pulls get smaller from here. The prediction is starting to be useful. STARTUP RATE still falling means the counts are still climbing, and a point taken then puts the predicted crossing too far out.',
          control: 'Control Bank', target: 'SOURCE RANGE above 3.0e3 (3,000 counts a second); point 4 plotted',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 31, speed: 'normal' }, hold: 420,
          accs_ordered: true,
          /* One step per plot point since #796 item 3 — the reasoning is on step 5. */
          accs: [{ p: 'sr_counts_cps', op: '>=', v: 2950,   // the 3.0e3 band's lower edge — see step 5's RENDER BAND block
                   ask: 'Hold WITHDRAW until SOURCE RANGE passes 3.0e3. Let STARTUP RATE fall to zero.',
                   note: 'Stop when CONTROL ROD POSITION reads about 180 to 205 steps. This rung is only 25 steps wide, so watch the position, not the clock.',
                   wait_speed: 10,
                   label: 'SOURCE RANGE reads 3.0e3 (3,000 counts per second) or more' },
                 { cmd: 'plot_1m_point', ask: 'Press Plot point, then read the prediction again.', wait_speed: 1,
                   label: 'Point plotted' }],
          overtaken: SR_OVERTAKEN,
          hl: ['Withdraw', 'Plot point'],
          hl_watch: ['Source Range', 'Startup Rate', 'Control Rod Position'] },
        /* THE LADDER ENDS HERE NOW — THE 2.0e4 BURST IS GONE *(OWNER RULING, 2026-09-14, #750:
         * "I think there's one too many 1/m plot steps. If we remove one it doesn't change the
         * indicated criticality rod step and it will let us slowly approach criticality for a
         * lower point which will help reduce overshoot.")*.
         *
         * The removed step was a sixth point taken at bank 211, where ρ = +33 pcm — criticality
         * is at 207-208, so the last point of the ladder was plotted on a core that was ALREADY
         * CRITICAL, which is the one thing a 1/CR approach exists to avoid (#749 measured it and
         * filed it as three tracked reds in `run_reactivity`). This step is now the last point,
         * and it is taken at bank 202, ρ −37.6 — SUBCRITICAL by five bank steps.
         *
         * MEASURED, full stack, `hot_zero_power`, the authored bursts each plotted after their
         * own hold, panel fit copied from ui/panels/one_over_m.js, four seeds:
         *
         *   seed    last point (bank / cps)   trailing-3 prediction   true critical
         *     7        202 /  8,660             210.6                 208
         *     1        202 /  9,640             212.1                 208
         *    42        202 /  9,355             210.3                 208
         *   123        202 /  9,633             211.1                 208
         *
         * against 211 / 31,838-34,722 cps and a prediction of 212.6-213.4 with the sixth point.
         * So the owner's condition holds to within the noise the fit already carries: the panel
         * reads "step 211" instead of "step 213", 2 steps LOWER and 2 steps CLOSER to the true
         * 208 — the conservative direction. The prediction's error falls from +5.1 steps to
         * +3.0, which is why the leg's third caution now says three rather than five.
         *
         * THE BAND IS NARROWED, which #749 declined to do when a sixth point followed this one.
         * It was 195-210, and 208-210 of that is at or above critical; with this step now the
         * LAST plotted point, a player who drives to the top of the old band plots exactly the
         * supercritical point the ruling removes. 205 is the highest bank in the band that is
         * still subcritical (ρ −12.5 static, −15 measured), so the band ends there. The cue is
         * unchanged and is still the count rate: 7,000 a second lands the authored burst at 202. */
        { text: 'Withdraw the last short rung and plot the final point the approach is built on.',
          wait_hint: false,
          why: 'This is the last plotted point: from here single steps beat one more fitted number, because another burst would land past critical. STARTUP RATE is the speedometer — 1.0 means power is multiplying by ten every minute, and any positive reading with the rods still means the chain reaction is growing. Under 1.0 is a comfortable climb; above it, nothing in the plant slows the rise yet.',
          control: 'Control Bank', target: 'SOURCE RANGE above 7.0e3 (7,000 counts a second); point 5 plotted; STARTUP RATE under 1.0',
          /* THE SETTLE IS 600 s, NOT 150 *(OWNER RULING, 2026-09-14/15, on options put as
           * "rewrite step 8's settle / rewrite step 9 / both": selected "Rewrite both")*.
           *
           * WHY. The final 1/M prediction's error is a SETTLING artifact, not a fit defect: the
           * source range has not finished rising when a 150 s hold expires, so C is low, 1/M =
           * C0/C reads high, the trailing-3 line is too shallow and its zero crossing lands too
           * far out. MEASURED on this tree, full stack, tick()-driven, the authored 94/63/31/14
           * ladder with the panel's own fit (ui/panels/one_over_m.js, FIT_WINDOW 3), four seeds
           * — and the TRUE critical bank re-measured at 208 of 627 the parked way (rho −1.44 at
           * 207, +6.19 at 208; 7.6 pcm/step):
           *
           *   step-8 hold    counts at the last plot     final prediction     error vs 208
           *       150 s          8,649 – 9,688            210.6 – 211.7       +2.6 to +3.7
           *       300 s         11,133 – 12,170           208.9 – 210.6       +0.9 to +2.6
           *      600 s (this)   13,242 – 15,306           208.0 – 209.0       +0.0 to +1.0
           *      1200 s         13,864 – 14,848           207.7 – 209.2       −0.3 to +1.2
           *
           * 600 s is where the curve flattens: it buys 2.6 steps of accuracy over 150 s, and the
           * next 600 s buys nothing (and starts letting the prediction read BELOW critical, which
           * is the danger side — the whole point of the trailing-3 fit is that it never does).
           * So this hold is the knee, not a round number.
           *
           * THE LIVE PLAYER IS HELD BY THE ROD-STOP ROW, NOT BY THE PROSE AND NOT BY THE COUNTS
           * *(OWNER RULING, 2026-09-17: selected "Gate on rods stopped + startup rate" from three
           * options put to him — gate on rod-stop plus startup rate, remove the steady row and keep
           * startup rate alone, or keep the steady row. A SELECTION, not verbatim words.)*
           *
           * The hold above governs the REPLAY. A live player's Continue used to light on
           * `sr_counts_cps > 7000` alone, which this route crosses 47 s after the rods stop with the
           * count still climbing hard. #755 closed that with a counts-STEADY row; #761 measured that
           * row and found it is a proxy a 20 s dribble defeats (see step 5's block), so the gate is
           * now the fact itself — the bank has not moved for 60 s — and then the startup rate.
           * The owner's 7,000 target is untouched and stands as the floor (his own authored number
           * in `Blueprint/WALKTHROUGH_STEPS_OWNER.md` step 8); the rod-stop row is added under it.
           *
           * ⚠ THE FLOOR'S LITERAL IS 6950 SINCE #749 AND THAT IS NOT A RETUNE OF HIS NUMBER. The
           * board prints 7.0e3 for anything in [6950, 7050) (`fmtExp`), so 6950 is the reading
           * "7.0e3" and 7000 was the middle of it — see the RENDER BAND block on step 5. His
           * target is what the player reads and it is unchanged in every visible string.
           *
           * ⚠ EVERY DURATION BELOW IS SECONDS FROM ROD-STOP — the last broadcast on which the
           * control bank moved — and the column SAYS SO (#761, 2026-09-17). It did not, and a
           * reader cannot tell a rod-stop figure from a burst-command figure by looking: this
           * rung's burst is 17 s of bank motion plus command latency. State the reference point on
           * any duration you add here.
           *
           *   accept condition                      settle from ROD-STOP   counts   1/M prediction
           *   counts > 7,000 alone (2 rulings ago)          47 s            7,025    213.7
           *   counts steady 3 % / 120 s (#755)             496 s           13,248    208.5
           *   rods stopped 60 s + rate ±0.02 (THIS)       333 s           ~12,900    ~208.4
           *   the ruled `hold: 600` above                  578 s           13,618    208.2
           *
           * The rod-stop row costs NOTHING here — the bank is still 60 s after rod-stop and the
           * startup rate does not fall into its band until 341 s, so the rate row is the gate on
           * this rung and the plot waits on the plant, not on a window. The player now plots 163 s
           * earlier than under the steadiness row, which `Diagnostic/ACCURACY_VS_WAIT_2026-09-17.md`
           * measured to be worth 0.6 of a bank step against a 2-step seed spread.
           *
           * ⚠ TRUE CRITICALITY IS 207.07 / 207.33 / 207.73 on seeds 42 / 7 / 1 (#761 re-measured it
           * from "208 of 627"), so the predictions above run ~1 step HIGH — the conservative side,
           * which is what the trailing-three fit exists to guarantee. The reference is maintained in
           * `Diagnostic/ACCURACY_VS_WAIT_2026-09-17.md`, not here.
           *
           * WHY `hold: 600` DOES NOT COME DOWN WITH THE ACCEPTANCE, although #761 §12.7 suggests a
           * column that would. Three reasons, and the first is the one that binds: 600 s is a RULED
           * ACCURACY number — the knee of the counts-versus-prediction curve in the table above this
           * one — not a dwell grown to cover the steadiness window, so lowering it re-decides a
           * ruling on accuracy grounds. Second, the replay still satisfies every row with room: the
           * whole rung is met 350 s after the burst command, 1.71x inside the hold. Third, `hold`
           * drives the GENERATED speed hint (>= 180 s offers a faster rung) and steps 6-8 carry
           * authored copy naming those speeds, so a hold change drags player text and the
           * `verify_e2e_ui` / `verify_flags_ui` / `run_oneoverm` / `run_reactivity` gates with it.
           * MEASURED if it is ever taken: holds of 240 / 200 / 260 / 600 satisfy every rung with
           * >= 1.27x margin and move the final prediction 208.24 -> 208.35, still above critical.
           *
           * ⚠ WHAT IT STILL DOES NOT FIX: a player may press Plot point before the rung's rows are
           * met. The press is not gated — `accs_ordered` (#756) stops the entry LATCHING out of
           * turn, and the unticked "Rods stopped" row is the cue not to plot yet, but an out-of-turn
           * press still puts a real point on the plot and only Clear takes it off (#759). */
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 14, speed: 'normal' }, hold: 600,
          accs_ordered: true,
          /* One step per plot point since #796 item 3 — the reasoning is on step 5. */
          accs: [{ p: 'sr_counts_cps', op: '>=', v: 6950,   // the 7.0e3 band's lower edge — see step 5's RENDER BAND block
                   ask: 'Hold WITHDRAW until SOURCE RANGE passes 7.0e3. Let STARTUP RATE fall all the way to zero.',
                   note: 'Stop when CONTROL ROD POSITION reads about 195 to 205 steps. This is the point the prediction is built on, so give it the time: STARTUP RATE takes about six plant-minutes to come back to zero here, and a point plotted before it does throws the predicted position further out than it is.',
                   wait_speed: 10,
                   label: 'SOURCE RANGE reads 7.0e3 (7,000 counts per second) or more' },
                 { cmd: 'plot_1m_point', ask: 'Press Plot point, then note the critical rod position the 1/M panel predicts.',
                   note: 'The reactor goes critical at that position or just below it, so the next step stops short of it and taps from there.',
                   wait_speed: 1, label: 'Point plotted' }],
          overtaken: SR_OVERTAKEN,
          hl: ['Withdraw', 'Plot point'],
          hl_watch: ['Source Range', 'Startup Rate', 'Control Rod Position'] },
        /* SPELL IT OUT *(OWNER, 2026-09-03, #619 item 21: "uses acronym (SUR) without spelling
         * it out, ie. STARTUP RATE (SUR)")*. The pool now expands it at its first appearance in
         * a visible line (the 7,000-count step) and says "startup rate" in full everywhere else;
         * `cautions` already carried the expansion but a caution is not where a player meets a
         * term for the first time. */
        /* NO SPEED HINT FROM HERE TO THE POINT OF ADDING HEAT (layman playtest 2026-09-07, #653
         * S9): the auto hint offered 60x for this step's then-400 s dwell, and at 60x REACTOR
         * POWER went 0.0 -> 3.4 % between two glances 2.5 s apart and 12.2 % before 1x could be
         * re-selected. `wait_hint: false` suppresses the generated line (ui/app.js). The dwell is
         * 1800 s since #750 and the argument only gets stronger with it. */
        /* USE THE PLOT *(OWNER, 2026-09-08, #660 item 8: "Step 10 should tell user to set rod
         * position to the critical position shown in the 1/m plot. Currently, there is nothing to
         * tell the user how to actually use the 1/m plot except plotting points.")*. This
         * supersedes the 2026-09-03 ruling that the approach carries no rod-position target: the
         * target is now the plot's, which is the plot's whole point.
         *
         * ⚠ THE DIRECTION OF THE PLOT'S ERROR WAS WRITTEN HERE BACKWARDS, AND THE STEP BEFORE IT
         * SAID THE OPPOSITE (#748, layman playthrough). This comment used to read "prediction runs
         * 264 -> 241 -> 217 -> 211 -> 213 over points 2..6 against a true critical of 223 — high
         * early, about ten steps LOW at the end", and this step's note said the reactor is "not
         * yet critical at that position" while the step before it said criticality "arrives a
         * little before the predicted position". Two player-facing fields, opposite directions.
         * The prediction reads HIGH, and criticality arrives BEFORE it. That is the danger side,
         * it is what the leg's third caution names, and it is why both fields say "stop short of
         * the prediction and tap". Do not "tidy" the text back to "to the predicted position".
         *
         * RE-MEASURED AFTER #750 REMOVED THE SIXTH POINT (full stack, PWR2, `hot_zero_power`, the
         * checklist's own 94/63/31/14-step bursts each plotted after its authored hold, panel fit
         * copied from ui/panels/one_over_m.js). FOUR SEEDS, and the answer does not move:
         *
         *   seed   last point   counts     trailing-3 prediction   TRUE critical (rho >= 0)
         *      7      202       8,660 cps         210.6            208 of 627
         *      1      202       9,640             212.1            208
         *     42      202       9,355             210.3            208
         *    123      202       9,633             211.1            208
         *
         * So the final prediction reads about THREE STEPS HIGH (it was five with the sixth point,
         * 212.6-213.4), and the plot is read at 211 rather than 213.
         *
         * ⚠ SUPERSEDED BY THE 600 s SETTLE (2026-09-15, the ruling recorded on step 8 above). The
         * three-step error was the 150 s hold's, and the step text no longer claims a SIZE at all
         * — it claims a DIRECTION. Re-measured on this tree with step 8 holding 600 s, same
         * ladder, same panel fit, four seeds: the final prediction is 208.0 to 209.0 against a
         * true critical of 208, i.e. 0 to 1 step high. The "stop three steps short of the
         * prediction and tap up" instruction therefore lands the player at about bank 205 —
         * three steps BELOW critical — instead of on it, which is what the line always meant.
         * Do NOT re-tidy the text back to a number: the error is a function of how long the
         * player waited, and only its sign is fixed (27 samples across two passes, never below).
         *
         * THE `cmd` NOW LANDS WHERE THE TEXT SENDS THE PLAYER, which it did not before. The old
         * form drove 15 SLOW steps from 211 to 226 — thirteen steps past a prediction of 213, a
         * gap this comment carried as ⚠ OPEN. From 202 the creep is ELEVEN steps to 213: the
         * player holds to just short of the prediction (211) and taps up, and 213 is two taps
         * past it, which is what "then tap single steps" is. The size is not a preference, it is
         * the derivation `run_reactivity.js` re-runs against the live pool on every gate —
         *     creep = (critical position − the plotted bursts) + the excess you want behind it
         * — and 11 is what leaves a SMALL excess: rho(213) − rho(207) = +46 pcm, against +148 for
         * the old 226 and a bound of 60 in the runner. Four creeps were measured full stack
         * before this one was chosen (seed 42, time from the creep press to REACTOR POWER 0.1 %):
         *
         *   creep   lands   excess pcm   to 0.1 % power
         *      9     211        31         2243 s        at the prediction, but a 37-minute wait
         *     10     212        38         1766 s
         *     11     213        46         1444 s        <- authored
         *     12     214        54         1214 s        90 % of the runner's own bound
         *   (15)    (226)     (148)        ( 305 s)      the pre-#750 route, three reds
         *
         * A smaller excess is a slower climb — that is the whole of the owner's "reduce
         * overshoot", and it is paid for in dwell. 11 keeps a quarter of the bound in hand rather
         * than sitting on the envelope wall, and costs four minutes against 12. THE HOLD FOLLOWS
         * THE EXCESS: the replay asserts `acc` at the END of `hold`, so 400 s would now assert on
         * a plant reading 1e-4 %. Measured across seeds 1/7/42/123 the crossing is at 1444, 1506,
         * 1650 and 1506 s; 1800 leaves 9 % over the worst. Move the creep and this hold moves. */
        { text: 'Bring the control rods to the edge of criticality without going past it.',
          /* ⚠ THE NOTE WAS 2,103 CHARACTERS AND THE PLAYER LOST THE ACTION IN IT (#653 S-12,
           * 2026-09-15 layman playtest). MEASURED on the built pool before this edit: note 2103
           * chars, `why` 502, `text` 107 — eleven numeric thresholds and three conditional
           * remedies at the same visual weight as the five actions. The reviewer read it twice,
           * retained the lesson ("watch INTER RANGE, not REACTOR POWER") and lost the instruction
           * ("stop 3 steps short"), which is the wrong half to lose.
           *
           * SPLIT BY KIND, NOT BY LENGTH: the note now carries only what the player DOES and the
           * readings that tell them to do something else; everything that explains the plant moved
           * into `why`, which the card draws as the BACKGROUND block — AS FAR AS THE STYLE GATE
           * ALLOWS. Nothing was deleted; every number in the old note is still on this step, and one
           * was ADDED (the low-side remedy).
           *
           * ⚠ THE LENGTH BARELY MOVED, AND THE REASON IS A GATE, NOT A CHOICE: 2,103 -> 2,023 chars.
           * `run_style`s W-detail check caps a step's details paragraph at THREE SENTENCES, so `why`
           * (502 -> 595) can hold only the core teaching; the rest had to stay in the note. What DID
           * change is the ORDER, which is what the reviewer actually lost: the five actions and the
           * four rate/PERIOD remedies come first, and the instrument teaching now sits behind
           * "Behind the readings:" at the end. A real shrink needs either the W-detail cap relaxed
           * (a style ruling) or the actions turned into `accs_ordered` rungs (a grading change).
           *
           * THE ADDED REMEDY IS THE LOW SIDE (#653 S-10). The note gave three remedies for a rate
           * too HIGH and none for too LOW: the reviewer settled at +0.01 DPM with PERIOD reading
           * 2,391 s and stalled, having to infer "tap more". On-plan figures inherited from the
           * pre-existing measurement on this step (~0.15 DPM settled, five steps above critical;
           * PERIOD 150 to 200 s; under 60 s means too far out); the stall figures are the
           * playtest's own. `target` widens 150 s -> 150 to 200 s to match.
           *
           * THE ACCEPTANCE IS UNTOUCHED — this is a copy change. `accs_ordered` was available and
           * deliberately not used: turning the single `acc` into a rung sequence is a GRADING
           * change and owes its own measurement.
           *
           * ⚠ AND IT IS NOW SETTLED THAT IT STAYS THAT WAY *(OWNER RULING, 2026-09-20: "A", on
           * drawn options — leave step 9 unordered and close the rungs item as superseded)*. The
           * 2026-09-15 ruling "Turn the actions into ordered rungs" was aimed at THIS step while
           * its acceptance was still a single `acc`; #749/option B then gave it a purpose-built
           * two-row `accs` with `implied_by: 'power_pct'` on 2026-09-18, three days later.
           *
           * THE TWO MECHANISMS ARE MUTUALLY EXCLUSIVE BY DESIGN AND THE EXCLUSION IS GATED:
           * `implied_by` is "Ignored on an `accs_ordered` step, where position is meaning", and
           * `run_checklist_pwr2` §2ad reddens if one is authored there — 2ad.3/4/5 are wired to
           * this step's exact two-row shape. So ordering costs the INTER RANGE soft-lock fix: a
           * dead INTER RANGE channel is reachable from the Failures tab and strands the step for
           * ever, and ordering makes it WORSE, because that rung would then block every rung
           * behind it. Trading a measured soft-lock fix for a display improvement is the wrong
           * way round. The parked draft also carried a last rung of `power_pct > 0.1`, the exact
           * threshold #749 moved to 0.05 because `digits: 1` renders 0.05 as "0.1".
           *
           * If the five actions are ever to be broken up, the cheap half needs no grading change
           * (split the note into per-row `ask` text); making BOTH work needs `implied_by` taught
           * to survive ordering, which is a design change to a freshly-ruled guard and owes its
           * own issue and its own measurement. Steps 5-8 keep their rungs and are unaffected.
           *
           * ⚠ "NOTHING WAS DELETED" AND "Behind the readings:" ARE BOTH STALE AS OF 2026-09-18.
           * The reconcile to `Blueprint/walkthrough_steps/02_mode3_to_mode1.md` took his note,
           * which ENDS at "press it before the rods will move again" — the whole instrument-teaching
           * tail is gone, 2,023 -> 1,222 chars, and there is no "Behind the readings:" block left to
           * find. Read the paragraphs above as the record of a previous edit, not as a description
           * of what ships. What the tail carried is not lost from the LEG: step 10's note still says
           * the plant behaves the same at any speed and that SOURCE RANGE hands over above 1.0e5,
           * step 11 still teaches the hand-over, and step 8's Background still defines the rate. */
          why: 'Critical means the chain reaction keeps itself going: power rises with the rods still, and a positive STARTUP RATE is the sign. Below about 1 % power — the point where the reactor starts warming the water — nothing in the plant takes extra reactivity back out, so how far past critical the rods stop is what sets how fast power climbs.',
          control: 'Control Bank', target: 'STARTUP RATE positive and steady around 0.15 with the rods stopped; PERIOD 150 to 200 s',
          /* THE DWELL GETS A SPEED, AND IT IS MEASURED *(OWNER, 2026-09-14: "We could mention that
           * dwell in the walkthrough and have the user put it at 5 or 10x speed. We should test this
           * region.")*. This step carried `wait_hint: false` and a note saying "stay at 1×", both from
           * the #653 S9 layman pass of 2026-09-07 — which measured the PRE-#750 leg, where the creep
           * left +148 pcm behind it and power ran to 12.2 %. #750 cut the creep to +46 pcm and the
           * climb now arrests on its own, so that finding does not reproduce and the hint is safe.
           *
           * MEASURED (#753): the same saved state at the creep press, driven through steps 8-11 at
           * 1× / 5× / 10× / 30× / 60×. The plant is INDISTINGUISHABLE at every speed — reactivity
           * crosses zero at t=703 s and bank 207 in all five, power reaches 0.1 % at 2109-2110 s,
           * peak power over the four steps is 4.0112-4.0113 %, and NOT ONE speed drop fires with the
           * attention-stop and speed-hold defaults ON: no new alarm, no warp refusal. What the speed
           * really costs is the player's eye. Worst REACTOR POWER change inside one 2.5 s glance:
           *   1× 0.020 %   5× 0.094 %   10× 0.186 %   60× 1.083 %
           * 10× is the recommendation; 60× is where a glance stops being a glance.
           *
           * IT IS IN THE `note`, NOT IN A `wait_hint`, AND THAT IS FORCED. `ui/app.js` prints its own
           * ⏩ line for any step with `hold >= 180` unless `wait_hint` is FALSE, and it picks the rung
           * itself: `RD.CklSpeedHint(1800)` against the ruled 30 s wall target returns 60×. So
           * authoring the string here would have printed "set the speed control to 60×" immediately
           * followed by my "use 10×" — the app contradicting the step in one line. `wait_hint: false`
           * suppresses the generated line entirely and there is no third state; an authorable CAP on
           * the rung is an app.js change and is filed rather than smuggled in here.
           *
           * THE THIRD STATE NOW EXISTS, AND IT HAD TO (#796, 2026-09-20). `wait_speed` is that cap.
           * Once the walkthrough started PRESSING the speed control for the player, `wait_hint:
           * false` alone meant "this step is played at 1x" — forcing real time on the step whose
           * own note says to put the clock on 10x, the rung #753 measured. `wait_speed` decides
           * the CLOCK, `wait_hint` still decides the LINE, so the app sets 10x and stays silent:
           * the note above teaches the speed in the step's own words and a second sentence from
           * the app is exactly the contradiction the paragraph above is about. */
          wait_hint: false,
          /* ---- THE BAND, THE PERIOD AND THE HANDOFF — ALL MEASURED ON THE AUTHORED ROUTE ----
           * *(OWNER RULING, 2026-09-14/15: "Rewrite both"; his diagnosis: "the rate the power
           * climbs seems to be is nothing until it suddenly shoots up in power if the user has
           * pulled the rods out too far. It could be we need to explain how to use the
           * intermediate range better.")*
           *
           * Full stack, `hot_zero_power`, seed 42, tick()-driven at 10x, the whole ladder driven
           * as authored (94/63/31/14 at MED with the new 600 s last settle) and then the creep at
           * SLOW. Both cases land with the rods STILL and nothing else touched. True critical is
           * bank 208 of 627, re-measured parked (rho −1.44 at 207, +6.19 at 208, 7.6 pcm/step).
           *
           *   t after the rods stop        +11 creep -> bank 213 (+5)      +19 creep -> 221 (+13)
           *     12 s   SUR / PERIOD             0.255 / 104 s                 0.568 /  46 s
           *    180 s                            0.182 / 142 s                 0.525 /  49 s
           *    600 s                            0.168 / 157 s                 0.256 / 102 s
           *   1200 s                            0.163 / 159 s                (levelled, 6.99 %)
           *   REACTOR POWER first reads 0.1 %   1396 s (23.3 min)             400 s (6.7 min)
           *   power it levels at                ~4 % (INHERITED, #753)        7.0 % (measured)
           *   INTER RANGE over the 0.0 % window 9.7e-10 -> 2.5e-6 A           3.3e-9 -> 5.7e-4 A
           *
           * WHAT THE STEP TEXT NOW SAYS, AND WHY EACH NUMBER IS THE ONE ABOVE: "around 0.15
           * settled" (0.163 at 10-20 plant-minutes) · "around 0.5 means about eight steps further
           * out" (0.525 at +13, which is eight steps past the authored +5) · "power arrives about
           * three times sooner" (1396 / 400 = 3.5) · "about 150 seconds on plan, under 60 says
           * you are out too far" (158 s vs 49 s) · "0.0 % for about twenty-five plant-minutes
           * while INTER RANGE climbs three decades" (23.3 minutes; 9.7e-10 to 2.5e-6 is 3.4).
           *
           * ⚠ TWO FIGURES FROM `Diagnostic/APPROACH_CONTROLLABILITY_2026-09-14.md` §6 ARE NOT IN
           * THE TEXT BECAUSE THEY DID NOT REPRODUCE, and both would have taught the wrong thing:
           *
           *   - "the first reading after a TAP is about SEVEN TIMES the settled value". Measured
           *     here on an actual single-step tap — plant still 1200 s at bank 212, then one tap
           *     to 213 — STARTUP RATE goes 0.137 before to a peak drawn reading of 0.187 and back
           *     to 0.16: **1.3x, not 7x**. The report's 1.15 DPM at 12 s was the tail of a
           *     CONTINUOUS withdrawal from bank 0, not a tap. After the authored 11-step creep it
           *     is 0.255 against 0.163 settled, 1.6x. So the honest sentence is "it runs high
           *     while a rod is moving and goes on falling for several minutes", which is what the
           *     note says; a "seven times" claim beside a tile reading 0.19 would read as broken.
           *   - "power will arrive SIX times sooner" at +13 steps. Measured 3.5x (1396 s vs
           *     400 s), and the report's own §4a/§4b tables say 1809 / 609 = 3.0x — its §6.1
           *     proposal disagreed with its own measurement. The text says "about three times".
           *
           * AND WHAT IS DELIBERATELY ABSENT: any suggestion that something stops you. There is NO
           * startup-rate rod withdrawal block on this plant (`pwr2_shell.js` hands the kernel
           * `interlocks: []`; measured with a positive control in APPROACH_CONTROLLABILITY §5a),
           * one was measured and recommended against, and the owner has not ruled for one. The
           * note's "over 1.0 with the rods already still, tap INSERT once and wait" is an
           * operator action, not a protection. */
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 11, speed: 'slow' }, hold: 480,
          /* ---- STEP 9 GRADES THE APPROACH, WHICH NOTHING DID BEFORE (2026-09-23 split) ----
           * His 9a is "Rods stopped 3 steps short of the 1/M prediction" and his 9b "STARTUP RATE
           * positive and steady with the rods stopped". Old step 9 graded neither — its rows were
           * the climb's (INTER RANGE / REACTOR POWER), which moved to step 10 below.
           *
           * ⚠ 9a's "3 SHORT" HALF IS UNGRADEABLE AND IS NOT GRADED. The 1/M prediction lives only in
           * the panel (ui/panels/one_over_m.js; layers/instructor_layer.js says so), never in the
           * snapshot, and grading against TRUE critical position would be grading truth, not an
           * instrument (Hard Rule 1, instruments versus truth). So 9a is the half that IS on the
           * board: the control bank has not moved for 60 s. Its label keeps his words; the row
           * ticks on ANY stop, including a player who never pulled (bank 202 ticks it 60 s after
           * the step opens). That is harmless only because 9b cannot follow it there — MEASURED
           * below, bank 202 never completes the step.
           *
           * 9b IS TWO GRADED ROWS AND ONE DRAWN LINE. His "wait about five plant-minutes, then
           * read" is a DWELL, and a rate band on its own cannot carry one: straight after a tap the
           * rate overshoots and falls for minutes, so a band alone ticks on the transient. So a
           * HIDDEN `stopped` row (300 s, his five minutes) sits between 9a and the drawn rate row;
           * `accs_ordered` means the rate row cannot latch until the rods have been still five
           * minutes, and a tap un-ticks both, which is his "repeat" loop. Hidden, not `cont`, so
           * his one `()` line stays one line; it is still graded, and the drawn rate row cannot
           * show ✓ while it is unmet (an ordered, re-grading row is held off by any unmet row
           * before it). The ACTIVE substep during the wait is therefore 9b — 10×, his rung.
           *
           * ⚠ 9a LATCHES (`latch: true`, 2026-09-23 layman playtest S-1). This paragraph used to end
           * "a tap hands the clock back to 9a's 1×, which is his 'back to 1× before every tap'" —
           * and that was AFTER the tap, not before it. MEASURED, live runtime, seed 42, stop at 207
           * then one tap per five minutes: every tap took the verdicts from 100 to 000 within 4 s,
           * the active substep fell to 9a (rung 1×), and 60 plant-s later 9a re-ticked and auto
           * forced 10× again — so the tap had already landed at whatever speed the player chose,
           * and the 1× that followed only cancelled the wait. The HOLD 9a re-graded is still graded
           * by the hidden 300 s row, which does not latch, so completion is unchanged.
           *
           * THE FLOOR IS 0.055, NOT 0.05 (S-2, same pass): the tile draws STARTUP RATE with
           * `toFixed(2)`, so 0.05 sat mid-way through the "+0.05" band — a reviewer read "+0.05" and
           * the row failed. 0.045 (the band's lower edge) completes the ρ +0.3 bank in the table below (INHERITED; a re-run at ρ −0.2 did not); 0.055 (its
           * upper edge) was re-measured on banks 205-207, seeds 42 and 7, 3600 s: never. It loses
           * seed 7's bank 208 (ρ +2.3 pcm, 0.056 at the dwell's end and 0.009 an hour later) — a
           * core that close to critical is one more tap in his loop, not a lost player.
           *
           * THE RATE BAND IS 0.05 TO 1.00 DPM, AND 0.05 IS A MEASURED LINE, not a round number. His
           * note calls 0.01 "stopped short" and 0.15 "as written"; the floor has to sit between.
           * MEASURED, full stack, `hot_zero_power`, the leg driven as authored to step 9's entry
           * (bank 202), then the bank stopped at a fixed position and the candidate grading run
           * every broadcast for 1800 s (ρ = true reactivity at the tick, recorded, not graded):
           *
           *   route                 stopped 300 + 0.05-1.00   stopped 300 + 0.045-1.00   stopped 240 + 0.045
           *   bank 202 (no pull)          never                      never                   never
           *   bank 206                    never                      never                   never
           *   bank 207  seed 42           never                   +352 s  ρ +0.3             +281 s  ρ  0.0
           *   bank 207  seed 7            never                      never                +281 s  ρ −5.1  ✗
           *   bank 208  seed 42        +349 s  ρ +7.9             +349 s                   +289 s
           *   bank 208  seed 7         +353 s  ρ +2.8             +349 s                   +289 s
           *   authored creep to 213    +383 s  ρ +46 (both seeds, STARTUP RATE 0.157-0.183)
           *
           * So a 240 s dwell ticks a SUBCRITICAL core (the ✗), and 300 s with a 0.05 floor never
           * does on either seed. A `steady` row on the rate was measured too and added nothing:
           * with the 300 s dwell in front of it the verdicts were identical or later, and without
           * the dwell it latched on subcritical banks 205-207 (a decaying rate is steady enough).
           * The top of the band is "over 1.0" in his note — 1.005 is the edge the tile draws as
           * "1.00" — so a rate the note says to INSERT on is never a check-off.
           *
           * THE HOLD IS 480 s AND STEP 10's IS 1320 s — the old 1800 split, not lengthened. The
           * authored route meets every row at +383 s (1.25x inside 480); REACTOR POWER 0.1 % came
           * at 1444-1650 s from the creep press across seeds 1/7/42/123 (INHERITED, the table
           * above), i.e. 964-1170 s into step 10, 1.13x inside 1320.
           *
           * ⚠ `overtaken` CLOSES A SOFT LOCK THE DWELL OPENS (quality pass, 2026-09-23, MEASURED,
           * full stack, the leg driven as authored to step 9's entry at bank 202, then one
           * continuous SLOW pull to a fixed bank and the note's policy after every five-minute
           * dwell: over 1.0 INSERT one, under 0.05 WITHDRAW one). A pull far enough out that power
           * reaches the heating range before the 300 s dwell ends leaves the rate FEEDBACK-limited
           * near zero, and every tap the note asks for is cancelled by the temperature coefficient
           * inside the next dwell — so the band row never meets again:
           *
           *   pull to   seed 42                               seed 7
           *   213       done +405 s (0.178 DPM)               done +404 s (0.162)
           *   225       done +495 s (0.691, power 0.72 %)     done +495 s (0.693, 0.37 %)
           *   230       done +532 s (0.095, power 8.7 %)      done +532 s (0.129, 7.9 %)
           *   235       NEVER in 3600 s — 10 taps, 0.023 DPM after the first dwell, bank 245,
           *             REACTOR POWER 18.7 % (both seeds)
           *   240, 250  the INTER RANGE rod stop (20 %) refuses the next tap; same dead step
           *
           * So the step is left to the plant once REACTOR POWER reads 0.5 % — step 11's own floor,
           * the band edge `toFixed(1)` draws as "0.5". Below it no lock exists: under the heating
           * range a positive reactivity keeps the rate up and one more tap lifts it (MEASURED: taps
           * one at a time from 205 complete at +2010 s seed 42, +2349 s seed 7; 0.000 % power
           * throughout). The authored route reads 0.000 % when step 9 completes, so the skip never
           * fires on it. It also relieves the dead-STARTUP RATE strand of the pinned HR1 set once
           * power arrives. `run_checklist_pwr2` §2aj drives the 235 pull and the authored creep. */
          overtaken: { p: 'power_pct', op: '>=', v: 0.45,
            text: 'This step is overtaken: REACTOR POWER already reads 0.5 %, so the reactor went critical and is carrying power. Leave the rods where they are and go on to the climb.',
            industry: 'REACTOR POWER 0.5 % — CRITICALITY APPROACH OVERTAKEN. Rods stopped; STARTUP RATE under 1 DPM.' },
          accs_ordered: true,
          accs: [{ p: 'control_bank_steps', op: 'stopped', v: 60, latch: true,   /* S-1, 2026-09-23: the hidden 300 s row carries the hold */
                   ask: 'Press SLOW, then hold WITHDRAW until CONTROL ROD POSITION is 3 steps short of the predicted position.',
                   note: 'The prediction reads HIGH, never low, so stopping short of it is the point.',
                   wait_speed: 1,
                   label: 'Rods stopped 3 steps short of the 1/M prediction' },
                 { p: 'control_bank_steps', op: 'stopped', v: 300, hidden: true,
                   label: 'Rods still for five plant-minutes (graded, not drawn — the dwell in 9b)' },
                 { p: 'startup_rate_dpm', op: '~', v: 0.53, tol: 0.475,   /* 0.055-1.005: both edges on the tile's toFixed(2) render band (S-2, 2026-09-23) */
                   ask: 'Tap WITHDRAW one step, wait about five plant-minutes, and read STARTUP RATE. Repeat until it reads positive with the rods still.',
                   note: 'Read the rate only once it has stopped falling, about five minutes after the last tap. Around 0.15, with PERIOD 150 to 200 seconds, is this approach going as written. Around 0.5, or PERIOD under 60 seconds, is about eight steps further out than you meant to be — power will arrive about three times sooner and level off higher. Over 1.0, tap INSERT once and wait. Near 0.01, with PERIOD in the thousands of seconds and nothing moving, means you have stopped short of critical — tap one more step out and wait.',
                   wait_speed: 10,
                   speed_text: '10× while you wait; back to 1× before every tap.',
                   label: 'STARTUP RATE positive and steady with the rods stopped' }],
          hl: ['Withdraw', 'Rod Speed — Slow'],
          hl_watch: ['Startup Rate', 'Reactor Period', 'Source Range', 'Control Rod Position'] },
        /* STEP 10 — THE CLIMB FROM CRITICAL (2026-09-23, split out of old step 9). Its two rows,
         * their render-band floors, the `implied_by` relief and every measurement in the comments
         * below came across UNCHANGED; only the hold (1800 -> 1320, see step 9) and the text moved.
         * `control` stays 'Control Bank' — the step's action is to leave that bank still, and
         * `verify_manual_follow`'s map keys on it. No `hl`: nothing is pressed here. */
        { text: 'Let the reactor carry power up from critical, reading INTER RANGE rather than REACTOR POWER.',
          why: 'INTER RANGE is a current, not a percentage, and it can read a climb three decades below the point where REACTOR POWER shows its first tenth of a percent. That is why STARTUP RATE, PERIOD and INTER RANGE are the ones to steer on from criticality up: the power meter only joins the picture at the end.',
          control: 'Control Bank', target: 'INTER RANGE 1.0e-7 A, then REACTOR POWER 0.1 %, rods still',
          wait_hint: false, wait_speed: 10, hold: 1320,
          /* 0.1, not 0.02: the done-when renders at the tile's resolution, and 0.02 drew "When
           * Reactor power ≥ 0 %" beside a tile reading 0.0 — true of every plant, unmet for four
           * minutes (layman playtest pass 2, #653 S-5). 0.1 is the first digit the tile shows.
           *
           * ⚠ AND 0.1 WAS THE MIDDLE OF THAT DIGIT, NOT THE START OF IT (#749 item 2, measured
           * 2026-09-18). REACTOR POWER is a `digits: 1` tile rendered `toFixed(1)`, so it prints
           * "0.1" for anything in [0.05, 0.15) — the same render-band trap as the source-range
           * count targets on steps 5-8 (the RENDER BAND block on step 5 states the rule). The
           * literal is therefore the band's LOWER EDGE, and the card's line does not change:
           * `fmtPredValue` rounds a power to one decimal, so 0.05 still draws "REACTOR POWER
           * > 0.1 %". The player-facing string is byte-identical; what moves is when it becomes
           * true of the board.
           *
           * MEASURED, full stack, `hot_zero_power`, seed 42, the authored route driven end to end
           * (this step becomes active at t = 1689.4 s):
           *   the tile first prints "0.1"                       +1307.5 s
           *   OLD  `power_range > 0.10` latched                 +1414.9 s   (107.4 s of dark
           *                                                                  Continue beside a
           *                                                                  tile reading 0.1)
           *   THIS `power_range > 0.05` latches                 +1306.4 s   (1.1 s BEFORE the
           *                                                                  first print — the
           *                                                                  board's own 2 s
           *                                                                  display damping,
           *                                                                  which #670 rules the
           *                                                                  acceptance does not
           *                                                                  read)
           *
           * WHAT THIS DOES NOT FIX, and the two things that were measured and NOT done. The stare
           * itself is 21.8 plant-minutes of "0.0" and it is the tile's one-decimal resolution, not
           * the threshold: only INTER RANGE moves during it (three decades), which is exactly what
           * this step's `note` and `why` already tell the player to watch, and they already state
           * the wait ("about twenty-five plant-minutes"; measured 21.8 to the first print, so the
           * copy is conservative, which is the right side). (1) GRADING THE STEP ON ITS OWN WORDS
           * — "STARTUP RATE positive with the rods stopped" — was measured and DECLINED: it is
           * satisfied at +0.4 s on this route, so it would tick the step the instant the creep
           * ends and relocate the identical stare onto the next step's `power_pct > 0.5`; worse,
           * `>` LATCHES, so the transient positive rate of a rod still moving would tick it for a
           * player who is not critical at all. (2) GRADING ON INTER RANGE, which is the honest
           * candidate, needs a `PRED_DISPLAY.ir_amps` entry in ui/app.js — there is none, and
           * §2d reddens on a predicate param the natural-language map does not cover.
           *
           * ⚠ (2) IS NOW DONE, AND IT SHIPPED ONLY BECAUSE IT WAS MEASURED FIRST. `accs` is a
           * CONJUNCTION, so an INTER RANGE row cannot shorten the wait by a second — the Continue
           * stays dark exactly as long. What it buys is that something on the card MOVES through
           * the stare, and that the card names a number the player can watch approach, which
           * "REACTOR POWER > 0.1 %" is not for 21.8 plant-minutes. MEASURED before authoring it,
           * authored route, seconds from this step becoming active:
           *
           *   seed        INTER RANGE row (1.0e-7 A)        REACTOR POWER row      through
           *     42            +742 s (12.4 min)               +1306 s (21.8)         57 %
           *      7            +851 s (14.2 min)               +1499 s (25.0)         57 %
           *
           * So the first row ticks 9.4 and 10.8 plant-minutes before the second, at 57 % of the
           * wait on BOTH seeds. Had it landed near the power row it would have been one more line
           * to read for nothing and DESIGN_CRITERIA Q4 would have vetoed it.
           *
           * THE THRESHOLD IS A DECLARED PROGRESS MILESTONE, NOT A PLANT SETPOINT, and saying so
           * is the point: there is no sourced setpoint in this window. P-6 is 1.0e-10 A (Ginna TS
           * Bases, via `pwr2_protection`) and this step OPENS at 4.7e-10, so the permissive is
           * already met and cannot serve. 1.0e-7 A is the round decade that lands mid-wait on
           * every route measured. It follows the same render-band rule as everything else here:
           * the tile draws `fmtExp(intermediate_range)`, and 1.0e-7 is the FIRST value drawn as
           * `1.0e-7` — one ulp below prints `10.0e-8`, which is the formatter's own quirk at a
           * mantissa of 10 and is why the edge coincides with the target for this one.
           *
           * ON A HEALTHY BOARD IT CANNOT GATE: `ir_amps` and `power_pct` are both `K × pFrac` of
           * the SAME flux (pwr2_true_state), so on TRUE STATE the rows are strictly ordered by
           * construction — 1.0e-7 A is about 0.001 % power, a factor of 47 below where the power
           * row sits, far outside the channels' 0.02-decade noise. Any route that reaches the
           * power row passed this one long before, and a route that reaches neither was
           * subcritical under the single `acc` too.
           *
           * ⚠ BUT BOTH ROWS ARE GRADED ON INSTRUMENTS, AND AN INSTRUMENT CAN BE FAILED — so
           * "it can never gate" is TRUE OF THE PLANT and FALSE OF THE BOARD, and the earlier
           * wording here claimed the second (quality pass, 2026-09-18). MEASURED: with
           * `set_instrument_failure {instrument_id:'intermediate_range', mode:'dead'}` — which
           * the Failures tab offers for this channel, `intermediate_range` being in the manual
           * profile's indications — the channel publishes its range floor, 1.0e-11 A, against a
           * true 8.3e-3 A, and this row reads `met:false` for ever while REACTOR POWER reads
           * 99.7 % and meets. The step then has no `overtaken`, so Continue stays dark.
           * The four 1/M count rungs acquired the same exposure in the same change (a `dead`
           * `source_range` publishes 1 cps against a true 501). That is the ordinary price of
           * Hard Rule 1 grading — every instrument-graded row in the pool carries it — and it is
           * NOT a reason to grade truth; it is a reason not to write "cannot" here. Tracked on
           * #772 with the rest of the #749 residuals. */
          accs: [{ p: 'ir_amps', op: '>=', v: 1e-7,
                   ask: 'Leave the rods still. Watch INTER RANGE and STARTUP RATE; REACTOR POWER stays at 0.0 % for a long while.',
                   note: 'REACTOR POWER reads 0.0 % for about twenty-five plant-minutes while INTER RANGE climbs three decades. Never 60×, where a 2 ½ second glance away is two and a half plant-minutes of reactor. If the reactor trips, the SCRAM button reads SCRAMMED / PRESS TO RESET; press it before the rods will move again.',
                   wait_speed: 10,
                   label: 'INTER RANGE reads 1.0e-7 A or more',
                   /* AND THE SOFT-LOCK THE PARAGRAPH ABOVE MEASURED IS CLOSED HERE *(OWNER
                    * RULING, 2026-09-18: option B of four — keep the row, close the soft-lock;
                    * reverting the row and building a separate non-grading "what to watch"
                    * affordance were both declined)*. `implied_by` says this row's question is
                    * already answered by the REACTOR POWER row's own threshold, so a player
                    * whose INTER RANGE channel is dead is not stranded on a step the board says
                    * is finished. It is an IMPLICATION, not a fail-open on a broken gauge: the
                    * relief needs a named sibling that still asserts the step, and that sibling
                    * is graded on an instrument too, so Hard Rule 1 is untouched.
                    *
                    * THE IMPLICATION IS ARITHMETIC ON THIS PLANT, not a fit. `pwr2_true_state`
                    * computes `ir_amps = 8.333e-3 x power_frac`, so REACTOR POWER above 0.05 %
                    * puts INTER RANGE at 4.17e-6 A — 41.7x this row's 1.0e-7 A. It can never
                    * fire on a healthy board (MEASURED, authored route: this row ticks at
                    * +742 s / +851 s, the power row at +1306 s / +1499 s, so this one is met
                    * long before the sibling that could imply it), which is exactly why it is
                    * safe. `run_checklist_pwr2` §2ad re-derives the ratio out of the engine and
                    * reddens if a retune closes it. */
                   implied_by: 'power_pct' },
                 { cont: true, p: 'power_pct', op: '>', v: 0.05,
                   /* "or more", to match the row above it and the four count rungs — and because
                    * the bare form was a claim the row outlives: it stays ticked at 0.3 %, where
                    * the tile reads 0.3 and "REACTOR POWER reads 0.1 %" is simply false. */
                   label: 'REACTOR POWER reads 0.1 % or more' }],
          /* THE HAND-OFF IS INSIDE THIS STEP, AND THE STEP DID NOT SAY SO (#735, owner playtest
           * #724 item 10: "In this step the SOURCE RANGE will shut off and the step doesnt address
           * it. We need a better handoff from SOURCE RANGE to INTER RANGE. users will be confuesd
           * in this step when their SOURCE RANGE indication shuts off and not know what they
           * should watch.").
           *
           * MEASURED on the authored route (full stack, `hot_zero_power`, every step driven as
           * written; re-measured after #750 shortened the ladder, seed 42): the channel secures
           * at t = 931 s with the control bank at 213 of 627 and REACTOR POWER still reading
           * 0.00004 % — this step is up from t = 665 s and the next does not start until
           * t = 2465 s. So the death of the instrument happens 266 s INSIDE this step (it was
           * 276 s before #750), and the only text that mentioned it was the next step's note,
           * one step too late.
           * RE-MEASURED after step 8's settle went to 600 s (2026-09-15, seed 42, authored route
           * driven end to end): it now secures **165 s** after the creep stops, earlier because
           * the counts enter this step already settled. Still inside the step, which is the claim
           * this paragraph exists to make.
           * INTER RANGE joins `hl_watch` here so the instrument that takes over is glowing while
           * the one being lost goes dark. CONTROL ROD POSITION joins it because that is the
           * number the 1/M panel's prediction is expressed in, which is the other half of the
           * same report. */
          /* REACTOR PERIOD JOINS THE WATCH LIST BECAUSE THE STEP NOW NAMES IT (2026-09-15). It
           * has been drawn under the NIS card in whole seconds the whole time and no step in the
           * pool mentioned it; `ui/highlight_bus.js` already carries the `period`
           * label, so this costs no new plumbing. (2026-09-23: step 10's list is his — the
           * climb's four readings; the rod and SOURCE RANGE rings stay on step 9.) */
          hl_watch: ['Startup Rate', 'Reactor Period', 'Intermediate Range', 'Reactor Power'] },
        /* INSTRUMENTS, NOT TAPS *(OWNER, 2026-09-08, #660 item 11: "Tapping withdraw 2 more times is
         * not always the best approach. The user will usually overshoot at this point. These steps
         * should take an instruments based approach. Usually waiting is best here if startup rate
         * is high.")*. The replay's +2 slow steps stay as its command; the text tells the player to
         * read STARTUP RATE and add a step only when it has come back to zero. */
        { text: 'Let power climb past the point of adding heat, tapping WITHDRAW only if the climb stalls.',
          why: 'With the reactor just critical, power climbs by itself and every extra rod step adds to a rise that is already under way. Below about 1 % the water is not yet warm enough to hold that climb back, which is why a high STARTUP RATE is a signal to wait, not to pull. The SOURCE RANGE detectors would wear out if they stayed on at power, so the plant switches them off by itself once INTER RANGE is reading.',
          control: 'Control Bank', target: 'REACTOR POWER rising past 1 %',
          /* THE NOTE'S OWN RUNG, NOW AUTHORED (#796, 2026-09-20). 5x is the note's number and its
           * reason is not fidelity — #753 measured the plant indistinguishable at every rung
           * through here — it is that this is the step that may want a TAP, and at 10x the tap
           * lands before the rate has been read. The 30 s rule would have returned 60x for a 900 s
           * dwell. Line still suppressed: the note says it better and in the step's own voice. */
          wait_hint: false, wait_speed: 5,
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 2, speed: 'slow' }, hold: 900,
          saw: { p: 'startup_rate_dpm', op: '>', v: 0 },
          /* 0.45, NOT 0.5 (2026-09-23): his check-off reads "REACTOR POWER reads 0.5 % or more", and a
           * `digits: 1` tile prints "0.5" from 0.45 — the render-band floor, same rule as step 10's
           * 0.05 (#749). MEASURED, authored route, seed 42: the row is met 1 s into the step (power
           * 0.83 % on arrival, the replay's 1320 s step 10 having already carried it there) and the
           * step ends at 3.98 %. On the player's route the step opens lower and the wait is real.
           *
           * OLD STEP 11's GRADING (`sr_energized < 1`, the hand-off confirm) IS FOLDED AWAY WITH ITS
           * TEXT, and nothing of it needs to survive here: the channel secures on flux alone at
           * 1.0e5 counts a second, which on this plant is far below 0.45 % power — INHERITED,
           * 2026-09-15, authored route: SOURCE RANGE secured 165 s after the creep stopped, i.e.
           * inside step 9/10, some 1,300 s before REACTOR POWER reads 0.1 %. So this step's own row
           * cannot be met with the channel still on; a second row would be one more line to read
           * for nothing. The operator ACTION it carried (close the 1/M PLOT window) is now prose in
           * this note, and it was never gradeable (a UI window is not a plant command). */
          accs: [{ p: 'power_pct', op: '>=', v: 0.45,
                   ask: 'While STARTUP RATE is positive, leave the rods alone. Only if it falls back to 0.00 with REACTOR POWER below 0.5 %, press SLOW, tap WITHDRAW once, and wait again.',
                   note: 'SOURCE RANGE switches itself off above 1.0e5 and INTER RANGE carries the reading from here; there is no button for it. Once it has gone, close the 1/M PLOT window with the ✕ in its corner — its work is done. About 15 plant-minutes.',
                   wait_speed: 5,
                   speed_text: '5×, back to 1× before a tap. The plant behaves the same at any speed, but this is the step that may want a tap, and at 10× a tap has landed before you have read the rate.',
                   label: 'REACTOR POWER reads 0.5 % or more' }],
          hl: ['Rod Speed — Slow', 'Withdraw'], hl_watch: ['Startup Rate', 'Intermediate Range', 'Source Range', 'Control Rod Position', '1/M Plot Tool'] },
        /* ⚰ OLD STEP 11 — "Verify SOURCE RANGE has switched itself off … Close the 1/M PLOT window" —
         * FOLDED INTO STEP 11's NOTE (2026-09-23, the owner's new-format file). Why its grading
         * does not survive is on step 11's `accs`. */
        /* THE ACCEPTANCE TESTED HALF OF WHAT THE STEP SAID (#748 wave 2). The line asks for two
         * things — "stops rising AND is below 5 %" — and `acc` graded only the second, so the
         * step ticked the instant power crossed 5 % on its way DOWN, with the bank still driving
         * in. MEASURED on this tree, full stack, `hot_zero_power`, the authored route (seed 42,
         * each step's cmd issued then held for its `hold`):
         *
         *   step 12 END   rod 228   power 10.68 %   STARTUP RATE -0.00
         *   step 13 +20s  rod 214   power  7.85 %   STARTUP RATE -0.308   (the -14 bank move done)
         *   step 13 +189s rod 214   power  4.98 %   STARTUP RATE -0.042   <- `power_pct < 5` first met
         *   step 13 END   rod 214   power  4.74 %   STARTUP RATE -0.039
         *   step 14 END   rod 227   power  9.95 %                          (the +13 WITHDRAW)
         *
         * On the REPLAY the bank stopped 189 s before the tick, so the defect is invisible there.
         * Played the PLAYER's way — release INSERT the moment the acceptance ticks — the release
         * lands about 18 steps deeper with the rate still steeply negative, and step 14's "about
         * 13 steps" then takes power DOWN instead of through 5 %. The fix is the acceptance, not
         * the 13: a rate term the player can read off the tile. -0.10 DPM sits clear of both
         * measured regimes (-0.308 while the bank drives, -0.031 to -0.045 once it is settled)
         * and is a number the STARTUP RATE tile prints. The replay meets both entries at +189 s,
         * 51 s inside its own 240 s hold.
         *
         * ⚠ THE OVERSHOOT THIS STEP CLEANED UP NO LONGER HAPPENS (#750, 2026-09-14). Every number
         * above belongs to the pre-#750 route, where the creep left +148 pcm and the climb blew
         * through Mode 1 to 10.68 %. With the ladder's last point moved down and the creep cut to
         * +46 pcm, the climb ARRESTS ON ITS OWN below 5 %. Measured, full stack, seed 42, rods
         * still at bank 215 from the end of step 10:
         *
         *   t = 3364   power 3.966 %   STARTUP RATE  0.002   rho  +0.7
         *   t = 3604   power 4.010 %   STARTUP RATE -0.001   rho  +0.2
         *   t = 4204   power 4.013 %   STARTUP RATE -0.000   rho  -0.3
         *   t = 4804   power 3.995 %   STARTUP RATE -0.002   rho  -0.3      T-avg 287.5 °C flat
         *
         * — 4.0 % and level for 24 plant-minutes with nothing touched. So the authored -14 INSERT
         * now drives a settled plant DOWN to 0.75 %, and the step after it can no longer reach
         * 5 %: measured on the re-authored leg before this edit, step 12 ended 0.751 % with
         * STARTUP RATE -0.130 (its own `> -0.1` entry unmet) and step 13 ended 2.614 %, short of
         * its `power_pct > 5`.
         *
         * THE STEP KEEPS ITS PLACE AND CHANGES ITS JOB, which is the honest read of what the
         * plant does here: the climb stops because the water warms and this core loses reactivity
         * as it warms — the moderator coupling, which this leg otherwise never demonstrates. The
         * INSERT stays in the text as the contingency it now is, and the `cmd` goes, because
         * driving 14 steps in is not what the line asks for on a plant that has already levelled.
         *
         * AND THE RATE ENTRY BECOMES TWO-SIDED, which is what "stops rising" actually claims.
         * `> -0.1` LATCHES (instructor_layer `_gradeAccs`: only `~` re-grades), so on the player's
         * route it is satisfied the moment the step opens with the rate still positive — it could
         * only ever have bitten the insert case. `~ 0.00 ± 0.10` re-grades every tick and is unmet
         * in BOTH the regimes this step exists to exclude. Injection-proven through the real
         * harness, three ways: as authored -0.0012 PASS · with the pre-#750 `cmd: -14` restored
         * -0.1298 FAIL · graded mid-climb +0.1828 FAIL.
         *
         * ⚠ THE TOLERANCE IS 0.10 BECAUSE THE PANEL ROUNDS TO ONE DECIMAL, not because 0.10 is the
         * tightest honest band. `fmtPredicate` prints a `~` entry as its two ENDS through
         * `fmtPredValue`, which rounds to 0.1 below 100 — and `Math.round(-0.5)` is `-0`, which
         * stringifies as "0". So a ±0.05 band draws as "STARTUP RATE 0 to 0.1 DPM": a player-facing
         * line that is not the acceptance. ±0.10 draws "-0.1 to 0.1 DPM", which is what it is. Any
         * future band on this tile must be a multiple of 0.1 for the same reason.
         *
         * AND THE BAND'S WIDTH IS WHY THE `target` SAYS "under 0.10" RATHER THAN "steady at 4 %".
         * MEASURED on the PLAYER's route — every step advanced the tick its acceptance is met,
         * which is NOT the replay's fixed holds (seed 42): step 9 ticks at t = 2110 (power 0.1 %,
         * bank 213), step 10 at t = 2293 (0.5 %, bank 215), and this step's pair first holds at
         * t = 2524 — power 1.94 % and STARTUP RATE 0.0974, still climbing. Power does not reach
         * its 4.0 % level until ~900 s later. So the check-off is "the rate has fallen to a tenth
         * of its climbing value", not "power has finished". A tighter band cannot be drawn (see
         * above) and a POWER band would soft-lock: step 10 tells the player to tap only if the
         * rate falls to 0.00, so a player who does not tap sits at bank 213 and levels near 3 %,
         * outside any band centred on the replay's 4 %. The `note` states the gap in the player's
         * own words rather than leaving the tick unexplained. */
        { text: 'Let power level itself off below 5 %.',
          why: 'Warmer water slows this reactor down, so the heat the climb makes is what stops the climb. Power finds a level for the rod position it was left at, and no further rod motion is needed to hold it. Below about 1 % that feedback was too weak to feel; from here it is what makes the plant steady.',
          control: 'Control Bank', target: 'REACTOR POWER below 5 % and levelling off; STARTUP RATE back under 0.10',
          /* THE `wait_hint: false` IS GONE, WHICH RESTORES THE RUNG *(OWNER, 2026-09-20, #796 item
           * 4: "walkthrough mnode 3-1 step 12 should suggest a higher warp setting than 1x to wait
           * for the startup rate to settle.")*. The suppression came from the #653 S-9 pass, which
           * applied it across this region because the hint was offering 60× on the 1800 s dwells
           * either side of it. THIS step holds 240 s, so the 30 s rule returns 10× — not 60× — and
           * it needs no cap: it is the wrong number on the neighbours that was the problem, never
           * the line.
           *
           * MEASURED 2026-09-20 (#796, seed 42, full stack, the shipped replay to step 11 then
           * 0.1 s samples), on #753's own yardstick — the worst REACTOR POWER change inside one
           * 2.5 s glance, i.e. 2.5×N plant-seconds at rung N:
           *
           *     rung   indicated   TRUE
           *       1×    0.150 %    0.002 %
           *       5×    0.177 %    0.009 %
           *      10×    0.191 %    0.012 %
           *      60×    0.185 %    0.038 %
           *
           * The plant is STANDING STILL here — 3.891 % to 4.118 % over the whole four minutes — so
           * the indicated column is this channel's own noise (sigma 0.3 %) and says nothing about
           * the rung; read the TRUE column. 10× moves 0.012 %, against the 0.186 % that was
           * ACCEPTED for step 9. Even 60× would be safe on movement alone; 10× is taken because
           * the step also authorises a corrective INSERT, and a rung is only as fast as the
           * fastest thing it asks you to do.
           *
           * ⚠ ON THE REPLAY ROUTE THIS STEP IS SATISFIED ON ARRIVAL: step 11's dwell settles the
           * rate, so both entries hold at t=0 (power 3.97 %, rate 0.006) and auto never accelerates
           * it at all. The wait is real on the PLAYER's route, where the rate is still positive
           * when the step opens — which is the route the owner is reporting from and the one the
           * rung is for. */
          hold: 240, wait_hint: false,
          accs: [{ p: 'power_pct', op: '<', v: 5,
                   ask: 'Leave the rods alone and watch REACTOR POWER stop rising on its own, near 4 %.',
                   note: 'The climb stops by itself about twenty plant-minutes after the rods stop, and STARTUP RATE comes back to 0.00 on the way. The step checks off once the rate is under 0.10, which comes about fifteen minutes before power finally levels — leave the rods alone and let it. If power instead runs past 5 %: come back to 1×, press MED and hold INSERT until it comes back — about 14 steps — then release and let the plant settle before you read it. While the bank is driving in, STARTUP RATE is well below zero and power has not finished falling.',
                   wait_speed: 10, speed_text: '10×; 1× if you have to insert.',
                   label: 'REACTOR POWER below 5 %' },
                 { cont: true, p: 'startup_rate_dpm', op: '~', v: 0, tol: 0.1, label: 'STARTUP RATE settled between -0.10 and 0.10' }],
          /* `press_expected` (#653 S-3b): both acceptances read the PLANT settling, and the two
           * pulsing labels are for the branch the text names — "If it does not, press MED and
           * hold INSERT". A real contingency press, so it is declared rather than demoted. */
          press_expected: true,
          hl: ['Rod Speed — Normal', 'Insert'], hl_watch: ['Startup Rate', 'Intermediate Range', 'Control Rod Position'] },
        /* ⚠ STILL THIRTEEN, AND #750 TRIED EIGHT FIRST — THE STEP AFTER NEXT IS WHAT DECIDES IT.
         * The 13 was measured from bank 214, where the -14 INSERT used to leave the plant; the leg
         * now arrives at bank 215 already making 4.0 %, and +8 SLOW from there lands bank 223 at
         * 8.06 % — this step's own authored target, in half the rod motion. It was authored that
         * way, and `run_checklist_pwr2` reddened THREE #731 checks a leg-and-a-half later:
         *
         *   +8  -> bank 223: TRIP BLOCKS step entered at 8.375 % power, block REFUSED, leg stalls
         *   +10 -> bank 225: entered at 9.096 %, completes
         *   +12 -> bank 227: entered at 10.060 %, completes   (the pre-#750 leg: 10.066 %)
         *   +13 -> bank 228: entered at 10.522 %, completes   <- authored
         *
         * ⚠ THE PERMISSIVE IS 8 %, NOT 10 %, AND NOTHING EVER REFUSES THE PRESS (#753, corrected
         * 2026-09-14 — this comment shipped 2026-09-13 with both halves wrong). It named
         * `PWR_TRIP_BLOCK_PERMISSIVE` in layers/control/pwr_control.js, `power_range` high at 10.0:
         * that constant is the RETIRED engine's kernel-trip datum and this plant never reads it —
         * `getProtectionConfig` hands the kernel an EMPTY trips list, so `set_trip_block` forwards
         * to the engine's own door. THE ENGINE'S P-10 IS 8 % (`P10.frac`, Ginna TS Bases B 3.3.1,
         * ML20339A221) and that door accepts the press at ANY power — measured, accepted at
         * 3.578 %, lamp lit — and then REVOKES the request on the next protection step while the
         * channel reads under 8 %. So "the plant refuses the press" was never the mechanism.
         *
         * WHAT DOES REFUSE IT IS THE BUTTON, and only below the permissive: the TRIP BLOCKS row
         * renders `disabled: can_block === false` (pwr_board_wiring), and `can_block` is
         * `!blocked && p10_met`. So below 8 % INDICATED the press cannot be made at all; from 8 %
         * up it can, and the plant then takes it away again. Two refusals at two layers, and the
         * step text has to name the one the player meets.
         *
         * WHY 8 % IS STILL NOT ENOUGH, MEASURED (#753, `low_power` plus a load sweep; the number is
         * the survival time of ONE press): the permissive reads the INSTRUMENTED power-range
         * channel (HR1), and that channel carries sigma = 0.3 % of noise with a 0.05 s correlation
         * time, sampled every 0.02 s protection step, with no 2-of-4 coincidence behind it:
         *
         *   true power   the block survives
         *      8.19 %         1 s
         *      8.72 %         4 s
         *      9.10 %       105 s
         *      9.36 %       > 900 s   (and every load above)
         *
         * The effective threshold is therefore a NOISE STATISTIC and not a setpoint — it is
         * wherever the chance of one sub-8 % sample crosses the observer's patience, which is what
         * the separately-filed "the block holds from 9.172 %" measured. Either way the leg's own
         * arrival at 10.5 % is clear of it, and 13 keeps that margin.
         *
         * SO THIS STEP IS SIZED BY THE PERMISSIVE, NOT BY ITS OWN TARGET. 12 reproduces the
         * pre-#750 arrival almost exactly and re-creates the same envelope wall; 13 puts half a
         * point of margin over P-10 and lands the bank at 228, which is where the pre-#750 leg's
         * own climb step already put it. Do not shorten this without re-running the #731 trio. */
        { text: 'Cross the 5 % line deliberately. That is Mode 1, At Power.',
          why: 'Mode 1, At Power, begins at 5 % power. The warming water now holds power back, so each rod step buys a new steady level rather than a runaway — about half a percent of power per step. The extra steps past 5 % are for the turbine: it needs REACTOR POWER above 10 % before the startup trips will stay switched off.',
          control: 'Control Bank', target: 'REACTOR POWER above 5 %, settling near 11 %',
          /* 5×, AND IT IS THE ROD PULL THAT DECIDES IT *(OWNER, 2026-09-20, #796 item 5:
           * "walkthrough mode 3-1 step 13 should also suggest a warp seting. probably 5x.")*. The
           * 30 s rule would return 60× for a 400 s dwell, which is why this step could not simply
           * have its `wait_hint: false` removed the way step 12 did — it needs the cap.
           *
           * MEASURED 2026-09-20 (#796, seed 42, full stack, 0.1 s samples). TWO numbers decide it,
           * and the second is the one that matters, because this is an ACTION step: the player is
           * holding WITHDRAW and has to let go.
           *
           *   worst REACTOR POWER change in one 2.5 s glance, over the window auto actually
           *   accelerates (see below) — 1× 0.083 %, 5× 0.379 %, 10× 0.677 % (true values)
           *
           *   the pull itself — 13 steps at SLOW is 97.3 plant-seconds, so ONE ROD STEP costs the
           *   player 7.49 s of wall clock at 1×, 1.50 s at 5×, 0.75 s at 10×, 0.12 s at 60×
           *
           * 1.50 s is a reaction window; 0.75 s is not, and 0.12 s is a step landing before the
           * eye has moved. That is the same failure #653 S-9 filed one region up ("at 60x the
           * reactor went 0 -> 12 % between two glances"), and it is why the owner's own 5× is
           * adopted rather than the rule's 60× — measured, not deferred to.
           *
           * THE ACCELERATED WINDOW IS 42 PLANT-SECONDS, NOT 400. `power_pct > 5` is met at
           * t = 4667.3 s against a step opening at 4625.6 — 0.7 plant-minutes in — and
           * `cklStepSpeed` drops the clock to 1× the instant an acceptance is met (#796). So the
           * rung governs the pull and nothing else; the run to 10.5 % that fills the rest of the
           * authored dwell is already at real time.
           *
           * `wait_est_s: false` FOR THAT SAME REASON: `hold` is 400 s and the acceptance lands in
           * 42, so printing "about 7 plant-minutes" would overstate the wait by a factor of ten.
           * The rung is right with no honest number beside it, which is exactly what the field is
           * for (#628). */
          wait_speed: 5, wait_est_s: false, wait_hint: false,
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 13, speed: 'slow' }, hold: 400,
          /* 5.05, NOT 5 (2026-09-23): "above 5 %" on a one-decimal tile is first TRUE of the board at
           * "5.1", from 5.05 — the render-band floor. MEASURED, authored route, seed 42: `> 5` at
           * +45 s, `>= 5.05` at +47 s; the step ends at 10.57 %. Two plant-seconds. */
          accs: [{ p: 'power_pct', op: '>=', v: 5.05,
                   ask: 'Press SLOW, then hold WITHDRAW until REACTOR POWER passes 5 %, about 13 steps.',
                   note: "Power settles near 11 % from here. It needs to: the turbine's startup trips cannot be blocked until REACTOR POWER is above 10 %.",
                   wait_speed: 5, label: 'REACTOR POWER above 5 %' }],
          hl: ['Rod Speed — Slow', 'Withdraw'], hl_watch: ['Startup Rate', 'Intermediate Range', 'Control Rod Position'] },
        { text: 'Put the turbine on line and let the reactor follow it up.',
          why: 'LATCH resets the turbine so it can take steam; LOAD is how much electricity the generator is asked for. As the generator picks up load, more steam is drawn, the water cools, and cooler water raises power — the reactor follows the turbine up to about 11 % by itself. That coupling is the central idea of this plant.',
          control: 'Turbine Load', target: 'OUTPUT near 10 MWe',
          cmd: { action: 'set_load_target', mwe: 10 }, hold: 240, wait_hint: false,
          /* ORDERED SINCE 2026-09-23: his 14a is LATCH and 14b is LOAD, and the second cannot be
           * true before the first — no generator makes MWe on an unlatched turbine — so the order
           * costs no route and cannot soft-lock one the unordered step allowed. The replay still
           * issues LOAD at step entry and LATCH on the first tick (the harness issues an ordered
           * cmd entry when its predecessors are met, and it has none). */
          accs_ordered: true,
          accs: [{ cmd: 'latch_turbine', ask: 'Press LATCH on the TURBINE-GENERATOR card.', wait_speed: 1,
                   label: 'Turbine latched' },
                 { p: 'mwe_output', op: '>', v: 8, ask: 'Set LOAD to 10 MWe.', wait_speed: 10,
                   label: 'Generator above 8 MWe' }],
          hl: ['Turbine — Latch', 'Load Setpoint'], hl_watch: ['Turbine Load', 'Generator Output'] },
        { text: 'Block the first startup trip once REACTOR POWER is above 10 %.',
          why: 'Two automatic shutdowns exist only to protect a startup, one at 25 % power and one at 35 %. Once power is up they would trip the reactor on the way to full power, so they are switched off one at a time. The plant keeps checking power is still up there, and switches them back on by itself if it falls, whoever switched them off.',
          control: 'Trip Blocks', target: 'IR HIGH FLUX lit on the TRIP BLOCKS panel',
          cmd: { action: 'set_trip_block', trip_id: 'ir_high', blocked: true }, hold: 10,
          /* GRADED ON THE LINEUP, NOT ON THE PRESS (#731, owner playtest #724 item 13). These two
           * steps carried a bare `cmd`, so the live checklist graded them on SEEING the command
           * descend while the step was active. Two ways that goes wrong, both measured on the
           * shipped plant: a player who blocks BOTH rows while step 16 is up leaves step 17
           * standing for ever (402 s of plant time, block already true), and an UNBLOCK ticked
           * the step off with the trip live at 9.9 % power. A block is a standing lineup the
           * board draws; grade it as one. `cmd` stays — it is the replay's action and the
           * follow-mode family. */
          accs: [{ p: 'ir_high_blocked', op: '>', v: 0,
                   ask: 'Press TRIP BLOCKS on the ROD CONTROL card, then BLOCK on the IR HIGH FLUX row.',
                   note: 'Do this the moment REACTOR POWER is above 10 %: at 25 % this trip fires. Below 8 % power the BLOCK button is dead and will not take the press at all; between there and about 9 ½ % it takes it and the block then goes out again by itself, because the permissive is read off the power-range meter, which wanders about ± 0.3 % and keeps dipping back under. If that happens, let power come up and press it again. The reactor keeps climbing while the panel is open.',
                   wait_speed: 1, label: 'IR HIGH FLUX lit on the TRIP BLOCKS panel' }],
          hl: ['Trip Blocks'] },
        { text: 'Block the second startup trip and close the panel.',
          why: 'The second startup shutdown fires at 35 % if it is still live. Above 10 % the shutdown at 118 % power takes over the job of catching a runaway. Two separate presses on purpose: on a real board, switching one off never quietly switches off the other.',
          control: 'Trip Blocks', target: 'PR HIGH (LOW SETPT) lit on the TRIP BLOCKS panel',
          cmd: { action: 'set_trip_block', trip_id: 'pr_low_setpoint', blocked: true }, hold: 10,
          accs: [{ p: 'pr_low_setpoint_blocked', op: '>', v: 0,   /* see step 15 — #731 */
                   ask: 'On the TRIP BLOCKS panel press BLOCK on the PR HIGH (LOW SETPT) row, then close the panel.',
                   note: 'This switches off the second startup shutdown, at 35 %. Check both rows read lit — IR HIGH FLUX and PR HIGH (LOW SETPT) — while the panel is still open, then close it with TRIP BLOCKS again: it covers the rod buttons.',
                   wait_speed: 1, label: 'PR HIGH (LOW SETPT) lit on the TRIP BLOCKS panel' }],
          hl: ['Trip Blocks'] },
        /* HIS TWO ROWS REPLACE `plant_mode ~ 1` (2026-09-23). Mode 1 is REACTOR POWER above 5 %, so
         * the power row implies it. Render-band floors again: "above 10 %" is first true of a
         * one-decimal tile at "10.1" (10.05); OUTPUT is drawn in whole MWe, so "near 10" is a
         * reading of 9 to 11, i.e. 8.51 to 11.49. MEASURED, authored route, seed 42, the 600 s
         * after step 16: instrumented REACTOR POWER 10.48-11.43 %, OUTPUT 8.65-10.92 MWe (still
         * climbing to its 10 MWe setpoint as the step opens), both rows met 5 s in. OUTPUT's low
         * edge sits 0.14 MWe under the lowest reading — on a player who arrives faster the row
         * waits for the turbine's own ramp, which is the plant finishing what step 14 asked. */
        { text: 'Verify Mode 1, At Power.',
          why: 'The reactor is critical, the generator is carrying load, and both startup shutdowns are switched off. The plant is in Mode 1, At Power. From here the climb to full power is rods leading and the turbine following.',
          accs: [{ p: 'power_pct', op: '>=', v: 10.05,
                   ask: 'Read REACTOR POWER above 10 % and OUTPUT near 10 MWe.',
                   note: 'IR HIGH FLUX and PR HIGH (LOW SETPT) were checked lit in the last step, before the TRIP BLOCKS panel was closed.',
                   wait_speed: 1, label: 'REACTOR POWER above 10 %' },
                 { cont: true, p: 'mwe_output', op: '~', v: 10, tol: 1.49, label: 'OUTPUT near 10 MWe' }],
          hl_watch: ['Reactor Power', 'Turbine Load', 'SG Level'] },
      ],
      guard: { never_melted: true, never: [{ p: 'fuel_temp_c', op: '>=', v: 1200 }] },
      outcome: 'Reactor critical in Mode 1, At Power, OUTPUT 10 MWe, IR HIGH FLUX and PR HIGH (LOW SETPT) both switched off. Ready for the power ascension.',
    },
    {
      id: 'pwr_raise_power', category: 'power', manual_ref: 'PWR-N07', next: 'pwr_lower_power',
      title: 'Mode 1, At Power — power ascension to 100 %',
      purpose: 'Take the plant from low power to full power in stages. Rods lead, turbine follows: pull rods, raise LOAD to match, then trim AVG COOLANT TEMPERATURE back into its band. About 1 plant-hour.',
      from: 'low_power',
      prereq: ['Reactor critical: REACTOR POWER above 9 % (auto-checked).', 'Turbine on line: OUTPUT above 5 MWe (auto-checked).', 'IR HIGH FLUX and PR HIGH (LOW SETPT) both lit on the TRIP BLOCKS panel, from the startup walkthrough.'],
      precond: [
        /* 10 -> 9 % (#732, 2026-09-12, owner playtest #724 item 15: "it gave me a flickering
         * warning that prerequisites for this checklist are not met since i think the reactor
         * power was on the line for these prerequisites. we should probably lower this
         * prerequisite to 9%").
         *
         * THE THRESHOLD SAT INSIDE THE PLANT'S OWN RIPPLE, not near it. MEASURED on `low_power`
         * — this leg's declared `from`, which is where `pwr_startup` hands the player over —
         * seed 42, 10x, 600 broadcasts (`inbox/724/m15.js`): `power_pct` runs **9.222 % to
         * 10.061 %, a 0.840 % span, mean 9.58 %**, and **crosses the 10 % line twice in 10
         * plant-minutes**. So the precondition was unmet more often than met, and it flipped.
         * 9 % sits below the whole measured band with 0.22 points of margin. `mwe_output`
         * (10.00 flat) and `control_bank_steps` (227) do not ripple and are unchanged.
         *
         * ⚠ THIS IS THE THRESHOLD HALF ONLY. The chatter itself is a missing latch in
         * `layers/instructor_layer.js` `_stepChecklist`: the precondition COMMENT is raised
         * under `anyUnmet && !precondMsg && !cklMoving`, but cleared under `!anyUnmet &&
         * precondMsg` with no `cklMoving` guard — so any predicate that oscillates re-raises it
         * once per crossing. That file is not this lane's to edit; raised with the coordinator. */
        { p: 'power_pct', op: '>', v: 9, text: 'Reactor at power: REACTOR POWER above 9 %' },
        { p: 'mwe_output', op: '>', v: 5, text: 'Turbine on line: OUTPUT above 5 MWe' },
        /* the power presets used to boot the bank on its top stop (627), where every WITHDRAW in
         * this leg was a no-op and step 8's "not pinned" check could only be met by INSERTING
         * (layman playtest 2026-09-07, #653 S3/S4). Since #704 they boot at 606 — still a preset,
         * still 378 steps above the 228 the startup hands over (227 until #750 moved the leg's
         * Mode 1 entry off the P-10 envelope wall), and still caught by this bound,
         * which now has 6 steps of margin instead of 27. A precondition warns; it never blocks. */
        { p: 'control_bank_steps', op: '<', v: 600, text: 'CONTROL ROD POSITION below 600 of 627: this walkthrough follows the startup walkthrough, not a power preset' },
      ],
      steps: [
        obs('Verify Mode 1, At Power: REACTOR POWER 10 %, SG FEED AUTO, both startup trips lit on TRIP BLOCKS.',
          /* THE OPENING CONFIRM NO LONGER GRADES ON THE TURBINE (#664, 2026-09-08). It used to
           * accept on `mwe_output > 5`, which is a dead end for the one player this leg most
           * needs to help: a turbine trip anywhere in the ascension leaves OUTPUT at 0.0 MWe and
           * an observation step cannot be acted on, so the checklist parked here for ever with
           * nothing to press. The turbine is now the NEXT step's subject, where it is an action.
           *
           * MODE 1, not `power_pct > 10`, and the difference is a MEASUREMENT: this step carries
           * no hold, so the replay grades it on the boot sample, and `low_power` boots at
           * 9.58 % — it settles through 10 % about 25 s later. A 10 % acceptance here reds the
           * gate on a plant that is doing nothing wrong. Mode 1, At Power is what "the plant the
           * startup hands over" actually means, it is true from the first broadcast, and the
           * 10 % row is already the leg's own precondition banner. */
          { p: 'plant_mode', op: '~', v: 1, tol: 0.1 },
          'The two rows are IR HIGH FLUX and PR HIGH (LOW SETPT), both lit by the startup walkthrough.', null,
          'This is the plant the startup hands over: critical, on the grid, feed holding level. Both startup shutdowns have to be switched off. With them on, the climb trips at 25 %, then 35 %.',
          { p: 'power_pct', op: '>', v: 40 },
          ['Reactor Power', 'SG Feed AUTO', 'Trip Blocks']),
        /* THE TURBINE IS THE THING THAT IS MISSING AFTER A TRIP (#664, filed off #663's
         * measurement; OWNER RULING, 2026-09-08, on #663: "C — leave the logic as sourced; fix
         * the checklist gap").
         *
         * `latch_turbine` occurred EXACTLY ONCE in the whole pwr2 pool — the startup leg's 8 %
         * step — and the pwr2 pool has no post-trip leg at all (six legs: heatup, startup,
         * raise power, lower power, shutdown, cooldown; `pwr_post_trip` is the RETIRED plant's
         * pool only). So a player whose turbine trips during the ascension had no procedure
         * anywhere that puts it back, and the plant scrams them at 50 % on P-9, the reactor
         * trip on turbine trip (`Manuals/09` §3.0: "Above P-9 a turbine trip scrams the reactor
         * immediately"). MEASURED, full stack from `low_power`, rods lead / load follows to
         * 40.16 % and then the turbine tripped:
         *   left tripped  — power settles 24.2 % on the dumps, the player keeps pulling, and
         *                   the reactor trips `turbine_trip` at a peak of 49.19 % (t=2662 s)
         *   LATCH + LOAD  — the same climb runs through 50 % to 70.9 %, no trip
         *   LATCH ALONE   — identical: 40.14 % and 40.0 MWe are back 240 s after the press, and
         *                   the climb reaches 70.9 %. The trip takes the DELIVERED power away
         *                   and leaves the operator's latched demand where he put it (the house
         *                   idiom), so the step's whole action is the press. LOAD is in the text
         *                   for the player who arrives with it already at zero — a shutdown leg
         *                   UNLOADs before it scrams.
         *
         * WHY HERE AND NOT IN A POST-TRIP LEG. There is no pwr2 post-trip leg to put it in, and
         * building one is a larger job than this defect (it owes a manual chapter). This IS the
         * leg the recovering player opens — its own prerequisite already names "Turbine on line",
         * as a banner that blocks nothing — and it is where the source puts the act: WTSM 19.0
         * Plant Operations (ML11223A342) Appendix 19-1 step 21, "Accelerate the main turbine to
         * 1800 rpm, and then synchronize the generator and connect it to the grid", immediately
         * before step 22's "Increase generator load at the desired rate" and long before the
         * 50 % calorimetric at step 28/29. The corpus carries no post-trip recovery procedure at
         * all (`find_source 'post-?trip recovery|recovery from a reactor trip|restart after a
         * trip'` → 0 hits across 39 documents in 3 lanes), so the placement rests on the startup
         * sequence, which §19.5 says a shutdown reverses.
         *
         * BOTH ACCEPTANCES ARE THE EFFECT, not the write, and neither is a cmd-kind entry on
         * purpose: a cmd-kind entry latches only on the command (`_accsCmdWatch`), so on a plant
         * whose turbine is already on line — every ordinary run of this leg — the player would
         * have no reason to press LATCH and the step would soft-lock. Graded on the plant, it
         * checks itself off instantly when there is nothing to do and waits for the two presses
         * when there is. */
        { text: 'Check the TURBINE-GENERATOR card is on line: LATCH lit and OUTPUT above 8 MWe.',
          note: 'If it reads TRIP, press LATCH; OUTPUT returns to the LOAD you last set. If OUTPUT stays at 0.0 MWe, set LOAD to 10 MWe. LATCH is refused while whatever tripped the turbine is still there, and the card names the reason.',
          /* THE A/B RIDE CAME OUT OF THE PLAYER TEXT (#653, both fresh-context reviews: development
           * evidence in player-facing prose). It is recorded here instead, because it is the reason
           * this step exists and deleting it would leave the claim unmeasured: from 40 %, left
           * tripped the climb scrams at 49.2 %; put back on line the same climb runs to 71 %. */
          why: 'A tripped turbine takes no steam, so LOAD does nothing and the heat you make goes to the steam dumps instead. The plant trips the reactor on a tripped turbine the moment REACTOR POWER passes 50 %, and at 8 % if the condenser is gone as well.',
          control: 'Turbine Load', target: 'OUTPUT above 8 MWe',
          cmd: { action: 'latch_turbine' }, hold: 240,
          accs: [{ p: 'turbine_tripped', op: '<', v: 1, label: 'Turbine latched, TRIP not lit' },
                 { p: 'mwe_output', op: '>', v: 8, label: 'Generator above 8 MWe' }],
          hl: ['Turbine Load'], hl_watch: ['Generator Output'] },
        { text: 'On the BORON card set 660 and press Enter.',
          note: 'Press ON only if it is not already lit. The dilution then runs in the background while you take the first stages.',
          /* ⚠ "ABOUT 3 ppm A MINUTE" WAS A CONSTANT WHERE THE PLANT HAS A CURVE (#752 fix 2).
           * MEASURED on this leg's own `low_power` IC, seed 42, full stack: the plant boots at
           * 683.8 ppm — not the 719 the old comment assumed — and this command's 23.8 ppm move
           * lands inside 602 s, i.e. TEN plant-minutes, at an average 2.37 ppm/min (the first
           * 10 ppm go in 247 s, 2.43 ppm/min). The rate is proportional to how far the number
           * you typed is from the number on the card, so it FALLS as the move closes: the
           * 10 ppm trim at the end of this leg takes about the same ten minutes for a third of
           * the distance (measured, 660 -> 650: 250 s to move 5 ppm, ~600 s to settle). Both
           * halves of the old sentence were wrong in the same direction — the rate was quoted
           * 25 % high AND the move does not need "the whole climb", it is done before the
           * second stage. */
          why: 'Every percent of power costs reactivity: the fuel heats up and the water thins out. Rods could pay for all of it but would end up deep in the core, so real plants dilute boron for the bulk and use rods for the fine trim. Dilution is not instant and it slows as it closes on the number you typed: this 24 ppm move takes about ten plant-minutes, and a 10 ppm trim later takes about the same again.',
          control: 'Boron control', target: 'BORON reads 660 ppm, ON lit',
          wait_hint: 'The dilution keeps working between stages. Start it now.',
          cmd: { action: 'set_auto_setpoint', channel_id: 'boron_conc', value: 660 }, hold: 30,
          /* THE STEP NOTHING CHECKED (#683). This carried `acc: ""` — no acceptance of any
           * kind — so a player who never touched the BORON card advanced straight past it, and
           * boron is the ONLY thing that decides where this leg ends up. Measured on the
           * continuous Mode 5 -> Mode 1 chain with this one step skipped: boron stays at the
           * cold plant's 917.8 ppm, the reactor never goes critical at all, and loading the
           * turbine on a subcritical core scrams it.
           *
           * A cmd-kind entry, not a `boron_ppm` predicate, and the difference is the whole
           * point: the dilution takes time (MEASURED #752: 683.8 -> 660 ppm in 602 s — the old
           * figure here, "~20 plant-minutes from 719 to 660", had both ends wrong: `low_power`
           * boots at 683.8 ppm, and the move is done in ten minutes, not twenty) and it runs
           * under the stages that follow. Grading the number here would stall the
           * climb waiting for chemistry the leg is designed to do in the background. What has to
           * be true NOW is that the operator set the setpoint; that the plant actually got there
           * is checked at the end of the climb, on the verify step. */
          accs: [{ cmd: { action: 'set_auto_setpoint', channel_id: 'boron_conc', value: 660 },
                   label: 'BORON set to 660 ppm' }],
          hl: ['Boron Target'], hl_watch: ['Boron Status', 'Boron Concentration'] },
        /* THE "DRAW A SAMPLE" STEP WAS DELETED HERE, 2026-09-11 *(OWNER RULING, 2026-09-10,
         * option B, #698)*. It read "Press SAMPLE on the BORON card…" and was graded
         * `accs: [{ cmd: 'take_boron_sample' }]`.
         *
         * The 2026-09-03 decline it was written under is REVERSED, and by a weighting change
         * rather than by new evidence: Ginna UFSAR §7.7 (ML20339A027) — "There is no provision
         * for a direct continuous visual display of primary coolant boron concentration" — is
         * untouched and still says what it said. The CHEM tile is now a live reading anyway, as
         * a DECLARED DEPARTURE recorded in Manuals/12 §12.22.
         *
         * IT IS DELETED, NOT REWORDED, AND THAT IS THE #641 RULE: a command-kind check-off is
         * only satisfiable while the plant still lets the player produce the command. The SAMPLE
         * button is gone from the board (DOC_REMOVE), so this step would have waited for a press
         * that can no longer be made — a soft lock in the middle of the power ascent, which is
         * exactly the shape #641 cost six steps of the 1/M leg.
         *
         * `test/manual_ui_map.js` is POSITIONAL: the rows below this step moved up one and were
         * MOVED rather than re-derived, per the warning that map carries. */
        /* "TRIM TAVG TO PROGRAM" IS JARGON *(OWNER, 2026-09-03, #619 item 26: "what does 'then
         * trim Tavg to program'. most people will not know what this means… It could say to look
         * at the vital gauge and move rods to move it in the green or something")*. The
         * instruction is now stated as the gauge and the direction, once, on the first trim leg;
         * the later legs then say "trim" against a term the player has met. The Tavg tile's
         * normal band already FOLLOWS the program (`trefProgram`, pwr_board_wiring.js:1965), so
         * "back inside the band" and "on program" are the same act — which is what makes the
         * plain-language version honest rather than a simplification. */
        { text: 'Hold WITHDRAW at MED about 30 steps, set LOAD to 30 MWe, then trim AVG COOLANT TEMPERATURE into its band.',
          note: 'MED is the middle rod speed on the ROD CONTROL card, 48 steps a minute. The green band on the tile is the temperature the plant is meant to hold at the power it is making, near 556 °F here. It rises with load, from 547 °F at no load to 578 °F at 100 %. Temperature below the band: withdraw. Above: insert. The plant trips on temperature before it trips on power: keep AVG COOLANT TEMPERATURE under 590 °F on every stage.',
          why: 'Pulling rods first raises power and warms the water; raising LOAD then draws more steam and cools it back. Doing it in that order means the temperature is approached from above rather than dragged from below.',
          control: 'Control Bank', target: 'OUTPUT 30 MWe; AVG COOLANT TEMPERATURE inside its band, near 556 °F',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 30, speed: 'normal' }, hold: 480,
          accs: [{ cmd: { action: 'set_load_target', mwe: 30 }, ask: 'Set LOAD to 30 MWe.', label: 'Load target set to 30 MWe' },
                 { p: 'mwe_output', op: '>', v: 28, label: 'Generator at 30 MWe' },
                 { p: 'power_pct', op: '>', v: 28, ask: 'Hold WITHDRAW at MED, about 30 steps.', label: 'Reactor following, near 30 %' },
                 /* THE TEMPERATURE CHECK THESE STAGES NEVER HAD (layman playtest pass 2, #653 S-1/S-9):
                  * the four stages ticked on load and power alone while the player's coolant ran
                  * 581 -> 600 degF and tripped on OTdT at 93 %. Bounds are what the replay itself lands
                  * (measured: 569.7 / 575.8 / 579.0 / 578.8 degF at 30 / 50 / 75 / 90 MWe, untrimmed)
                  * plus ~3 degC — a ceiling under the trip, not the program band, which is the tile's.
                  *
                  * ⚠ NOW TWO-SIDED, AND THE CEILING IS UNCHANGED (#683). All four stage checks were
                  * `op: '<'` — upper bound only — so A COLD PLANT PASSED EVERY ONE OF THEM
                  * TRIVIALLY. They were written to catch overshoot, which is the failure mode a
                  * plant with automatic rod control has; the rod AUTO channel does not exist on
                  * PWR2 (measured: the snapshot carries `boron_conc` and `afw_level` and nothing
                  * else), so the failure inverted and the guard did not follow it.
                  *
                  * THE FLOOR IS THE STAGE'S OWN PROGRAM BAND MINUS 6 degC (10.8 degF), RAISED
                  * WHERE THAT WOULD LAND ON OR UNDER THE NO-LOAD KNOT. The knot is 547.0 degF
                  * (286.11 degC); below it the pressurizer level program is clamped at its 25 %
                  * floor, which is the symptom this whole issue is named for, so a plant sitting
                  * on the knot must FAIL every stage. The minus-6 rule gives 550.4 / 558.5 /
                  * 563.9 degF at 50 / 75 / 90 MWe, all clear of it. At 30 MWe the band is only
                  * 9 degF above the knot and the rule produced a 545.0 degF floor — UNDER it, so
                  * a cold plant still passed. Caught by injection, not by reading: the floor
                  * there is 549.5 degF (287.5 degC) instead, 2.5 degF clear of the knot. The #653 ceilings
                  * are carried through UNTOUCHED (302 / 306 / 307.5 / 307.5 degC) — this widens
                  * nothing, it closes the open end. Checked against the untrimmed replay's own
                  * measured landings (569.7 / 575.8 / 579.0 / 578.8 degF): all four sit inside. */
                 { p: 'tavg_c', op: '~', v: 294.75, tol: 7.25, ask: 'Trim AVG COOLANT TEMPERATURE into its band.', label: 'AVG COOLANT TEMPERATURE between 550 and 576 °F (the band is near 556)' }],
          /* + `Rod Speed — Normal` (#735, develop's item 5 sweep): the text says "at MED" and this
           * is the leg's FIRST rod move. The player arrives from `pwr_startup`, whose last rod
           * step (13 since the 2026-09-23 reconcile) says "Press SLOW", so the selector IS at SLOW and nothing before this step changes it —
           * steps 1-3 touch boron and the turbine only. The press is genuinely required here, and
           * only here: steps 5, 6 and 8 CONTINUE at the speed this step selects and get no ring. */
          hl: ['Withdraw', 'Rod Speed — Normal', 'Turbine Load'], hl_watch: ['Tavg'] },
        { text: 'Hold WITHDRAW at MED about 32 steps, set LOAD to 50 MWe, then trim AVG COOLANT TEMPERATURE into its band.',
          note: 'The band is near 562 °F at this load.',
          why: 'Same order as the last stage: rods, then LOAD, then trim. Halfway up, xenon is starting to build in the fuel. Boron takes care of that over the coming hours; rods take care of the next few minutes.',
          control: 'Control Bank', target: 'OUTPUT 50 MWe; AVG COOLANT TEMPERATURE inside its band, near 562 °F',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 32, speed: 'normal' }, hold: 480,
          accs: [{ cmd: { action: 'set_load_target', mwe: 50 }, ask: 'Set LOAD to 50 MWe.', label: 'Load target set to 50 MWe' },
                 { p: 'mwe_output', op: '>', v: 48, label: 'Generator at 50 MWe' },
                 { p: 'power_pct', op: '>', v: 47, ask: 'Hold WITHDRAW at MED, about 32 steps.', label: 'Reactor following, near 50 %' },
                 { p: 'tavg_c', op: '~', v: 297, tol: 9, ask: 'Trim AVG COOLANT TEMPERATURE into its band.', label: 'AVG COOLANT TEMPERATURE between 550 and 583 °F (the band is near 562)' }],
          hl: ['Withdraw', 'Turbine Load'], hl_watch: ['Tavg'] },
        { text: 'Hold WITHDRAW at MED about 35 steps, set LOAD to 75 MWe, then trim AVG COOLANT TEMPERATURE into its band.',
          note: 'The band is near 570 °F at this load.',
          why: 'Three-quarter power. The band has climbed with the load, toward 578 °F at 100 %. If the temperature reads below the band, you led with LOAD instead of rods: pull more steps before you add more megawatts.',
          control: 'Control Bank', target: 'OUTPUT 75 MWe; AVG COOLANT TEMPERATURE inside its band, near 570 °F',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 35, speed: 'normal' }, hold: 480,
          accs: [{ cmd: { action: 'set_load_target', mwe: 75 }, ask: 'Set LOAD to 75 MWe.', label: 'Load target set to 75 MWe' },
                 { p: 'mwe_output', op: '>', v: 72, label: 'Generator at 75 MWe' },
                 { p: 'power_pct', op: '>', v: 70, ask: 'Hold WITHDRAW at MED, about 35 steps.', label: 'Reactor following, near 75 %' },
                 { p: 'tavg_c', op: '~', v: 300, tol: 7.5, ask: 'Trim AVG COOLANT TEMPERATURE into its band.', label: 'AVG COOLANT TEMPERATURE between 558 and 585 °F (the band is near 570)' }],
          hl: ['Withdraw', 'Turbine Load'], hl_watch: ['Tavg'] },
        { text: 'Hold WITHDRAW at MED about 18 steps, set LOAD to 90 MWe, then trim AVG COOLANT TEMPERATURE into its band.',
          note: 'The band is near 575 °F at this load, and the pulls get smaller from here: above 103 % power the plant stops the rods. If LOAD changes by itself, the plant ran the turbine back because the coolant was too hot. Hold INSERT until AVG COOLANT TEMPERATURE is back in its band, then set LOAD again.',
          why: 'Above 103 % power the plant refuses to move the rods, and at 118 % it trips the reactor. Overshoot is real on this plant: 100 MWe of LOAD lands REACTOR POWER near 101 %. Small pulls keep you clear of the stop.',
          control: 'Control Bank', target: 'OUTPUT 90 MWe; AVG COOLANT TEMPERATURE inside its band, near 575 °F',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 18, speed: 'normal' }, hold: 480,
          accs: [{ cmd: { action: 'set_load_target', mwe: 90 }, ask: 'Set LOAD to 90 MWe.', label: 'Load target set to 90 MWe' },
                 { p: 'mwe_output', op: '>', v: 86, label: 'Generator at 90 MWe' },
                 { p: 'tavg_c', op: '~', v: 301.5, tol: 6, ask: 'Trim AVG COOLANT TEMPERATURE into its band.', label: 'AVG COOLANT TEMPERATURE between 564 and 585 °F (the band is near 575)' }],
          /* + `Insert` (#735): this step's note carries a contingency — "If LOAD changes by itself,
           * the plant ran the turbine back because the coolant was too hot. Hold INSERT until AVG
           * COOLANT TEMPERATURE is back in its band" — and `hl` offered no INSERT target. */
          hl: ['Withdraw', 'Insert', 'Turbine Load'], hl_watch: ['Tavg'] },
        { text: 'Hold WITHDRAW at MED about 9 steps, set LOAD to 100 MWe, then trim AVG COOLANT TEMPERATURE onto 578 °F.',
          why: 'A small pull, then the last 10 MWe of LOAD, then the trim. REACTOR POWER settles near 101 %. The control bank ends part-way out, because boron carried most of the reactivity the climb cost.',
          control: 'Control Bank', target: 'OUTPUT 100 MWe; AVG COOLANT TEMPERATURE 578 °F',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 9, speed: 'normal' }, hold: 900,
          accs: [{ cmd: { action: 'set_load_target', mwe: 100 }, ask: 'Set LOAD to 100 MWe.', label: 'Load target set to 100 MWe' },
                 { p: 'mwe_output', op: '>', v: 97, label: 'Generator at 100 MWe' },
                 { p: 'tavg_c', op: '~', v: 303.2, tol: 8, ask: 'Trim AVG COOLANT TEMPERATURE onto 578 °F.', label: 'AVG COOLANT TEMPERATURE near 578 °F' },
                 /* THE ROD CHECK THIS LEG NEVER HAD. Every "Withdraw N steps" line above was a
                  * no-op for as long as the leg started from `50_percent`, which boots the bank
                  * on its top stop — and no acceptance read the bank, so the replay certified an
                  * ascension whose rods could not move. Asserted as a FLOOR, not a band: the end
                  * position is a function of xenon (351 of 627 at the 18.6 % this leg reaches),
                  * and pinning the arrival value would re-break the moment that moves. What must
                  * never be true again is that the bank sat where it started.
                  *
                  * A BAND, and the upper half is the one that bites. `> 300` alone does NOT
                  * catch the defect this exists for: the old leg ended at 627, which passes it.
                  * `< 600` is the assertion that the bank is not pinned on its top stop —
                  * verified by injection, not by reading: with `from: '50_percent'` restored
                  * this check goes RED at 627 while every other check in the leg stays green. */
                 { p: 'control_bank_steps', op: '>', v: 300, label: 'CONTROL ROD POSITION above 300' },
                 { p: 'control_bank_steps', op: '<', v: 600, label: 'CONTROL ROD POSITION below 600 (not on its top stop)' }],
          hl: ['Withdraw', 'Turbine Load'], hl_watch: ['Tavg'] },
        /* THE VERIFY STEP NOW VERIFIES THE TWO THINGS THAT DECIDE THE NEXT SIXTEEN HOURS (#683).
         * It graded on `power_pct > 96` ALONE — one bound, on the one quantity that is fine in
         * the failure. Measured on the continuous Mode 5 -> Mode 1 chain: this step passed at
         * 100.5 % power on a plant that then walked 105 degF (58 degC) down over sixteen hours
         * and tripped, with pressurizer level pinned on its 25 % floor from hour six.
         *
         * THE TWO NEW ROWS ARE THE CAUSE AND THE EFFECT.
         *
         * BORON `< 680`, derived: the setpoint two steps up is 660 ppm, and the measured PIN
         * POINT is 670 ppm — the concentration at which average coolant temperature settles on
         * the 547.0 degF no-load knot and the pressurizer level program clamps at 25 %
         * (measured at full power, boron pinned, 4 plant-hours to settle: 660 ppm -> 555.0 degF
         * / 33.7 % level; 670 ppm -> 547.1 degF / 25.0 %; 700 ppm -> 518.5 degF / 25.1 %). 680
         * is the setpoint plus 20 ppm of settling slack, and this leg reaches it with xenon
         * still at 18.6 %, so the true margin here is far wider than the 10 ppm the equilibrium
         * numbers suggest. It is deliberately NOT tighter: the dilution is still running under
         * this step and a tight bound would grade chemistry rather than the operator.
         *
         * TAVG two-sided on the same band step 8 uses. Step 8's band can be satisfied on the way
         * past; this one is the plant's settled state at the load it will hold. Both are `~`, so
         * both re-grade rather than latch — see the note in instructor_layer's _gradeAccs. */
        { text: 'Verify full power: REACTOR POWER 100 %, OUTPUT 100 MWe, AVG COOLANT TEMPERATURE 578 °F, BORON 660 ppm or below.',
          why: 'Full power, with almost no xenon in the fuel yet. Over the next hours xenon builds, and the plant settles into its long-term full-power state: less boron and the control bank high — 606 of 627 steps, which is where a full-power plant runs. The next step is how you get from here to there.',
          note: 'CONTROL ROD POSITION should be part-way out, not on its stop. BORON is the one to read twice: leave the climb with more of it in the water than the plant wants and AVG COOLANT TEMPERATURE sinks over the following hours, taking PZR LEVEL with it.',
          control: 'Boron control', target: 'BORON at or below 660 ppm',
          accs: [{ p: 'power_pct', op: '>', v: 96, label: 'REACTOR POWER near 100 %' },
                 { p: 'boron_ppm', op: '<', v: 680, label: 'BORON down to its 660 ppm setting' },
                 { p: 'tavg_c', op: '~', v: 303.2, tol: 8, label: 'AVG COOLANT TEMPERATURE between 563 and 592 °F' }],
          /* ⚠ NOTHING CHANGED HERE AND THAT IS THE POINT — THE THIRD STEP OF THE 2026-09-15
           * RING RULING IS FIXED IN `ui/app.js`, NOT IN THIS FILE *(OWNER RULING, 2026-09-15:
           * "Move them to the watch ring")*. This step authors no `hl`, so `stepHlLabels` fell
           * back to its `control` — 'Boron control', the BORON card — and pulsed the ACT-ON-THIS
           * ring on a step that carries no `cmd` and whose whole instruction is "Verify". It is
           * the ONE step in the shipped pwr2 pool that reached the fallback without asking for a
           * press (measured 2026-09-20 over both pwr pools: 51 fallback steps, 11 of them
           * press-free, 10 in the retired pool). The fallback now asks `stepAsksForPress` first,
           * so the card is no longer ringed at all and the four readings below keep their steady
           * rings. Do not "restore" a `hl` here to get the card back: `hl` IS the pulse. */
          hl_watch: ['Reactor Power', 'Generator Output', 'Tavg', 'Boron Concentration'] },
        /* STEP TWO OF THE BORON PROGRAM *(OWNER RULING, 2026-09-04: selected "A two-step boron
         * program that follows xenon")*, and the measurement that makes it the right shape:
         *
         *   end of this leg   xenon  18.6 %   boron 660 ppm   bank 351/627   Tavg 302.6 °C
         *   the design point  xenon 100 %     boron 617 ppm   bank 606/627   Tavg 304.5 °C
         *
         * (The design-point row was `626 ppm / 627 of 627` until #704, when the at-power initial
         * conditions stopped booting on the bank's upper stop. NUREG-1431 Rev 4 STS Bases B 3.2.3A,
         * ML12100A228, puts bank D "near its normal position (i.e., 210 steps withdrawn)" at high
         * power, which is 606 on this plant's bank-overlap step scale.)
         *
         * The bank walks OUT as xenon builds and boron comes down — which is the prototypical
         * shape, Ginna TS Bases and NUREG-1431 STS Bases both: "The control banks must be
         * maintained above designed insertion limits and are typically near the fully withdrawn
         * position during normal full power operations." Near-fully-withdrawn is the EQUILIBRIUM
         * state, not the state you arrive in — and it is near-fully, not fully: the plant runs 21
         * steps off its stop precisely so the operator keeps authority in both directions.
         *
         * IT NOW CARRIES A COMMAND AND AN ACCEPTANCE (#683). It had NEITHER — no `cmd`, no `acc`
         * — and it is the last step of the last leg of the ascension, so it completed on the
         * observation dwell and nothing ever checked that the trim happened. Measured on the
         * continuous chain: a plant that leaves this leg at 660 ppm and is left alone walks
         * 105 degF (58 degC) down over sixteen plant-hours and trips at +17 h, with pressurizer
         * level on its 25 % floor from hour six. This step was the only thing standing between
         * the player and that, and it was narrative.
         *
         * THE OLD "NO `cmd`, DELIBERATELY" ARGUMENT IS KEPT AND IS WHY THE ACCEPTANCE IS ON
         * BORON ONLY. Dialling 626 ppm the moment the climb ends dilutes into a core with no
         * xenon in it and takes Tavg past its program (measured: 318.8 °C, 15.6 °C high). So the
         * TEXT still asks for small steps as xenon builds, and the acceptance grades the
         * destination rather than the route. A Tavg band here would red on exactly the overshoot
         * the note warns about and could only be satisfied by riding the ~40-hour xenon
         * transient; the settled temperature is already graded one step up, on the verify.
         *
         * THE ACCEPTANCE GRADES THAT THE TRIM WAS STARTED, NOT THAT IT FINISHED, and the first
         * draft of this step got that wrong. It asked for 626 +/- 15 ppm — the destination — and
         * the replay measured 657.81 ppm at the end of the step's dwell: the dilution is a
         * MULTI-HOUR act (measured on the chain, 640.7 -> 625.8 ppm over about an hour, and
         * slowing as it goes because the rate is proportional to concentration), while xenon
         * itself takes about two days. No dwell a replay can afford reaches the endpoint, and
         * widening the band until it did would have graded nothing.
         *
         * `< 645 ppm` is the operator act made checkable: the climb leaves 660 ppm and the
         * automatic channel HOLDS that until somebody moves the setpoint, so the only way this
         * number falls is that the player performed the step. 15 ppm below the arrival value is
         * a real move rather than a twitch, and the replay reaches it inside the 900 s dwell
         * (measured ~2.2 ppm/min at this concentration). The same compromise the boron SAMPLE
         * step two legs up already makes, and for the same reason: grade the operator, not the
         * chemistry's clock.
         *
         * THE DESTINATION IS 617 ppm and it is what `cmd` dials — MOVED FROM 626 BY #704, and by
         * the same derivation: 626 was `criticalBoron` at the design Tavg with the bank on its top
         * stop (625.78), and the plant no longer runs there. At the sourced 606-step position the
         * same solve gives 617.03. A booted `hot_full_power` now settles at 612.3 ppm holding
         * 580.3 degF and 61.5 % level (measured, full stack, 0.02 s step, 3 plant-hours); the
         * measured PIN POINT, where the level program clamps at 25 %, is 670 ppm. Step 9's
         * `< 680` and this step's `< 645` bracket the climb's own arrival on the safe side of it,
         * and neither bound moves: both are about the 660 ppm the climb LEAVES, not the arrival.
         *
         * AND THE WORDING SAYS DILUTE, NOT PULL RODS *(owner's proposal 2026-09-10 was to have
         * the ascension steps hold a Tavg band with rod control; measurement refuted it FOR THIS
         * STEP and only this one)*. Rods have real authority during the climb — step 8's own
         * 300-600 bank window is satisfied there, at 18.6 % xenon — which is why stages 4-8 keep
         * their rod wording. Here boron is still the lever, but the REASON has changed and the
         * old one is worth recording because it was the bug: the design point USED to sit on the
         * bank's top stop, 627 of 627, so commanding the bank out moved settled Tavg by 0.00 degF
         * and the operator had no upward authority at all (#704). It sits at 606 now, and the
         * same command is worth +4.67 degF (+2.59 degC) — real, and still far less than the
         * ~25 degF the dilution is carrying, which is why the step says dilute. */
        /* ⚠ REWRITTEN (#733, 2026-09-12, owner playtest #724 item 17). The step it replaces asked
         * the player to type 617 ppm into the boron box, graded `boron_ppm < 645`, and told them
         * *"BORON is the lever here, not WITHDRAW."* Four things were wrong and all four are
         * MEASURED full stack on the player's route (`inbox/724/m1617.js`, seed 42, 600x):
         *
         *   1. THE ACCEPTANCE LATCHED 28 ppm SHORT. `boron_ppm < 645` was met at t+37.5 min with
         *      65 % of the dilution undone — and with Tavg ALREADY at 587.6 degF against a 580.1
         *      degF reference, i.e. green while the plant was on its way to a trip.
         *   2. THE AUTHORED ROUTE SCRAMS. Target 617 in one press: peak Tavg 603.3 degF, then
         *      `reactor_trip` at t+53.0 min — FIFTEEN MINUTES AFTER the step said it was done.
         *      HR9: the route is wrong, not the physics.
         *   3. THE SLOW ROUTE ENDS COLD. Walking the target down 10 ppm at a time with the bank
         *      left where the climb put it: no scram, but Tavg 537.6 degF against Tref 580.0 at
         *      t+15.4 plant-h and still falling. **Tref moved 0.1 degF over the whole run**, so
         *      #508's trap — a red reading that is really the REFERENCE moving — is checked and
         *      excluded. The plant is genuinely cold, because nothing pulls the rods:
         *      `rods_tavg` is deliberately not `defaultOn` (OWNER DIRECTIVE, 2026-08-11).
         *   4. "BORON IS THE LEVER, NOT WITHDRAW" WAS BACKWARDS ARITHMETIC. Measured at power:
         *      rod worth **0.2209 degF/step**, boron worth **0.5670 degF/ppm** (`inbox/724/m16.js`; a second
         *      run settled 48 plant-h before perturbing reads 0.2228 and 0.6524 — the rod figure is
         *      stable, the boron one is settle-time sensitive, so read boron as **0.57-0.65**).
         *      The bank arrives at **351 of 627**, so it carries **255 steps x 0.2209 = 56.3 degF**
         *      — the *larger* half. Boron 660 -> 612 is 47.7 ppm x 0.5670 = **27.0 degF**. Against
         *      a xenon build that costs **82 degF** (the two endpoints: 351/660 at 17.2 % xenon
         *      and this plant's settled 606/612.3 at 100 %), BOTH levers are needed and they only
         *      just close. The old note's own numbers were right for a bank ALREADY at the top
         *      ("21 steps, 4.7 degF" measures 20 steps = 4.42 degF) — it just described the
         *      destination, not where the player is standing.
         *
         * WHY THE STEP NO LONGER NAMES A TWO-DAY ENDPOINT. It cannot be graded. Xenon needs about
         * two plant-days, and no `hold` a gate can afford reaches 617/606 — which is exactly how
         * the old step came to have an acceptance that fired at 645. So the step now asks for the
         * FIRST correction, which is a bounded action with a real acceptance, and the destination
         * lives in the `why` and the `outcome` where it is not pretending to be checkable.
         *
         * THE ACCEPTANCE IS PAIRED AGAINST A SCRAM (#715's rule): a tripped plant reads 0 MWe and
         * a falling Tavg, so it can satisfy none of these three. */
        { text: 'Hold WITHDRAW at MED for about 6 steps.',
          note: 'Xenon is building, and it will keep pulling AVG COOLANT TEMPERATURE down. Repeat this pull whenever the temperature drops out of its band. Small pulls, then wait for it to settle. ROD LIMIT LO-LO is lit and that is normal — the bank is low because there is no xenon yet, and it clears as you walk the bank up.',
          /* ⚠ "ABOUT 40 °F COLD" WAS THE NUMBER THE PLANT PASSES ON ITS WAY TO A TRIP (#752
           * fix 2), and it was the sentence that told the player skipping this trim is cosmetic.
           * MEASURED from this leg's own end state, no rod and no boron motion, boron left at the
           * 660 ppm the walkthrough sets (full stack, seed 42, 10×, `donothing.js`): 40 °F low at
           * +8 h is passed and is not where it stops. PZR LEVEL reaches its 25 % floor at +7 h,
           * LOW TAVG comes in at +8.87 h (533.42 °F), and at **+17.23 h the reactor trips on
           * `sg_lolo_level`** with T-avg at 480.33 °F — a **100.80 °F** fall. REACTOR POWER holds
           * 100 % the whole way down (100.8 → 101.7 %), which is why power is the wrong gauge to
           * watch. Reproduced independently of the #752 measurement session, same two figures.
           *
           * THE ROD ARITHMETIC IS NOT NARROWED, AND THE PER-STEP FIGURE IS GONE. "0.22 °F a step"
           * is the worth at the TOP of the bank (measured 0.2225–0.2247 °F/step at 606); at the
           * 357 this leg leaves, the same measurement gives 0.5087–0.5199 — 2.3× more. The 56 °F
           * TOTAL is right, because it is the reactivity balance the xenon build demands, so the
           * sentence keeps the total and drops the per-step number rather than quoting a figure
           * that is wrong where the player is standing. The integral itself cannot be measured as
           * a perturbation: 249 steps of rod worth inserted into a core with no xenon in it is
           * more heat than the 43 ppm one-shot dilution that trips this plant on overtemperature. */
          /* THREE SENTENCES, because `run_style`'s W-detail cap is three and the first draft of
           * this rewrite ran to five — the measured consequence is in the second one, which is
           * the sentence the whole fix exists for. */
          why: 'Xenon is a neutron absorber that builds in the fuel over about two days, takes reactivity away, and the plant answers by making the same power at a lower temperature. Left alone this plant does not just settle cold: measured from here, PZR LEVEL is on its floor in 7 plant-hours and the reactor trips on STEAM GENERATOR LEVEL LO-LO in 17, with REACTOR POWER reading 100 % the whole way down. You give the reactivity back with two levers, rods leading because they are fast and reversible: the bank has about 250 steps to go, worth roughly 56 °F between them, and each ppm of boron about 0.6 °F.',
          control: 'Control Bank', target: 'CONTROL ROD POSITION coming up off 351; AVG COOLANT TEMPERATURE back near 580 °F',
          /* "Use the speed buttons" dropped (#653 S-5): the generated line above it already reads
           * "About 60 plant-minutes at 1× — set the speed control to 600×." */
          wait_hint: 'Xenon takes about two days to level off. Keep the pulls small.',
          /* 10 steps took REACTOR POWER to 103.3 % — over the 103 % rod stop this leg's own step 7
           * note warns about — and Tavg to 584.0 degF, 4 degF above programme (MEASURED, quality
           * pass on the committed step). 6 is the pull the plant actually wants here, and the bound
           * moves with it so the step is a real pull rather than four steps of slack: the bank
           * arrives at 351.000 (MEASURED, not inherited), so > 355 was satisfied by the command
           * alone inside one broadcast. */
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 6, speed: 'normal' }, hold: 3600,
          accs: [{ p: 'control_bank_steps', op: '>', v: 355, label: 'CONTROL ROD POSITION above 355' },
                 { p: 'mwe_output', op: '>', v: 97, label: 'Still at full load, 100 MWe' },
                 { p: 'tavg_c', op: '~', v: 304.4, tol: 3, label: 'AVG COOLANT TEMPERATURE near 580 °F' }],
          hl: ['Control Bank'], hl_watch: ['Tavg', 'Control Rod Position'] },
        /* ======= THE FIRST DILUTION DOSE — THE ACT THE LEG ONLY EVER DESCRIBED (#752) =========
         * The leg's LAST boron action was the 660 ppm setpoint eight steps up, and the whole
         * instruction to take that 43 ppm back out lived in the closing `obs`'s explanatory text:
         * no command, no acceptance, and that `obs` grades on `mwe_output > 97`, which is already
         * true when it opens. So the walkthrough handed the player a plant whose control bank
         * cannot hold the boron it set — MEASURED: trimming rods only from the leg's end state,
         * the bank reaches 627/627 at **+24.37 h** with xenon at 84.8 %, and the plant then makes
         * full power ~24.4 °F below programme permanently, with nothing on the annunciator panel.
         *
         * THE PROPOSED `control_bank_steps > 500` ACCEPTANCE IS REFUTED AND IS NOT USED. The bank
         * arrives at 357 and, with the dose in and no further rod motion, MEASURED 357.0 for the
         * whole plant-hour after it. 500 is 143 steps away — about a plant-day of xenon build —
         * so it could never close inside any dwell a replay can afford, and on a live board it
         * would be a soft lock in the last step of the ascension. #641's rule, one shape over: an
         * acceptance is only usable while the plant can still produce it.
         *
         * THE DOSE IS 10 ppm AND IT IS MEASURED SAFE (`rig.js dose 650`, full stack from the
         * leg's own end state, seed 42, 10×): boron 659.74 → 654.99 at t=250 s, 650.48 at 434 s,
         * settled 649.79 by ~600 s. T-avg rises from 581.12 °F to a peak of **586.60 °F** — 3.4 °F
         * under this leg's own 590 °F caution and 17 °F under the 603.4 °F that the one-press
         * route to 617 ppm reaches before it trips — and xenon then walks it back to 584.41 °F by
         * +1 h. No new alarm, no rod stop, power flat at 100.7 %.
         *
         * THE ACCEPTANCE IS THE EFFECT, NOT THE WRITE, on purpose. A cmd-kind entry would match
         * the press and so would demand the player type exactly 650; `boron_ppm < 655` is
         * satisfied by any real dilution and cannot be had for free — the automatic channel HOLDS
         * 660 until somebody moves the setpoint (measured: 659.74 ppm, unchanged, over the whole
         * 17 h do-nothing ride), so the number can only fall because the player acted. It closes
         * at t=250 s, well inside the dwell, and a SLOWER player is not stranded: the setpoint
         * keeps delivering whatever time they take. The load entry is a `~` band rather than
         * #715's floor because a floor met at the step's entry latches there and cannot then see
         * a scram during the step (#736's lesson on the rampdown leg). */
        { text: 'On the BORON card set 650 and press Enter.',
          note: 'One 10 ppm dose, not the whole 43. It takes about ten plant-minutes to arrive and lifts AVG COOLANT TEMPERATURE about 5 °F on the way, to near 587 °F; xenon then takes it back down. Repeat a dose whenever the rods alone stop holding the temperature in its band.',
          why: 'Rods are fast, but they run out: the bank has about 250 steps left and the xenon still to come costs more than they carry. Boron carries the rest, and it has to go in small doses — dial the whole way in one press and the plant heats far faster than xenon can absorb it, which trips the reactor on overtemperature.',
          control: 'Boron control', target: 'BORON coming down off 660 ppm, heading for 650',
          wait_hint: 'Give the dose ten plant-minutes to arrive before you judge it.',
          cmd: { action: 'set_auto_setpoint', channel_id: 'boron_conc', value: 650 }, hold: 600,
          accs: [{ p: 'boron_ppm', op: '<', v: 655, label: 'BORON coming down off 660 ppm' },
                 { p: 'mwe_output', op: '~', v: 100, tol: 5, label: 'Still at full load, 100 MWe' }],
          hl: ['Boron Target'], hl_watch: ['Boron Concentration', 'Tavg'] },
        obs('Full power and on programme: OUTPUT 100 MWe, AVG COOLANT TEMPERATURE 580 °F, CONTROL ROD POSITION rising.',
          { p: 'mwe_output', op: '>', v: 97 }, 'Keep trimming for the next two plant-days.', null,
          'Where this ends up, if you keep at it: CONTROL ROD POSITION about 606 of 627 and BORON about 617 ppm, which is where this plant runs at full power with xenon at equilibrium (the settled point measures 612.3 ppm; 617 is the target you dial toward). Rods carry the first 56 °F; once the bank is near the top it has only about 21 steps of travel left, worth 4.6 °F, and BORON carries the rest — four more doses like the one you just set, 10 ppm at a time, never in one press. Type 617 in one go and the plant heats far faster than xenon can absorb it: measured, that trips the reactor on overtemperature.',
          null, ['Control Rod Position', 'Boron']),
      ],
      guard: { never_melted: true, never: [{ p: 'fuel_temp_c', op: '>=', v: 1200 }] },
      outcome: 'Full power with almost no xenon: BORON on its way to 650 ppm and CONTROL ROD POSITION about 357 of 627 — the no-xenon end of the curve, not a fault. Over the next two plant-days xenon builds and you hand the reactivity back: the bank walks up toward 606 of 627 (about 250 steps, roughly 56 °F) and BORON comes down toward 617 ppm, 10 ppm at a time. Leave it undone and the plant does not just run cold — measured, PZR LEVEL is on its floor in 7 plant-hours and the reactor trips on STEAM GENERATOR LEVEL LO-LO in 17. The round trip back down starts with the load rampdown walkthrough.',
    },
    {
      id: 'pwr_lower_power', category: 'power', manual_ref: 'PWR-N08', next: 'pwr_shutdown',
      title: 'Mode 1, At Power — load rampdown to about 15 %',
      purpose: 'Bring the plant down from full power to low power in stages. Turbine leads, rods follow: lower LOAD, let the reactor follow it down, then insert rods so AVG COOLANT TEMPERATURE does not ride above its band. About 1 plant-hour.',
      from: 'hot_full_power',
      prereq: ['Reactor at power: REACTOR POWER above 10 % (auto-checked).', 'Turbine on line: OUTPUT above 5 MWe (auto-checked).', 'SG FEED in AUTO.'],
      precond: [
        { p: 'power_pct', op: '>', v: 10, text: 'Reactor at power: REACTOR POWER above 10 %' },
        { p: 'mwe_output', op: '>', v: 5, text: 'Turbine on line: OUTPUT above 5 MWe' },
      ],
      steps: [
        { text: 'On the BORON card set 719 and press Enter.',
          note: 'Press ON only if it is not already lit. The boration then runs in the background while you take the plant down.',
          why: 'Coming down is the climb in reverse. Every percent of power shed hands reactivity back (the fuel cools, the water thickens), and it has to go somewhere. Adding boron carries most of it out; rods trim the rest over the next few minutes.',
          control: 'Boron control', target: 'BORON reads 719 ppm, ON lit',
          /* MEASURED (#753, full stack from this leg's own initial condition): 612.3 ppm to 719 is
           * 106.7 ppm at a flat 3.00 ppm/min: 35.3 plant-minutes to 718 ppm and 35.6 to the 719 the
           * step sets, not "about half" of a plant-hour. Same
           * measurement as the cooldown leg's step 1; see the note there for why boration does not
           * taper the way dilution does. Nothing grades on it (the step holds 30 s and carries no
           * acceptance on boron), so the number is the player's planning figure only. */
          wait_hint: 'The boration runs at a steady 3 ppm a minute and does not slow down as it closes — about 36 plant-minutes from 612 to 719 ppm. Start it first and take the stages while it works.',
          cmd: { action: 'set_auto_setpoint', channel_id: 'boron_conc', value: 719 }, hold: 30,
          hl: ['Boron Target'], hl_watch: ['Boron Status', 'Boron Concentration'] },
        /* ================= TWO STEPS, BECAUSE THE ORDER IS THE LESSON (#736) ==================
         * *(OWNER, #724 item 18: "this step has yuou put rods in after lowering turbine output to
         * 75%. the problem is that it doesnt mater what order you do things it will end up
         * checking off in the wrong order so it looks like im good but the temperature gets to
         * dangerous levels when lowering tubine output since it checks off the temperature and
         * reactor following down steps befgore you even lower turbine load. this should probably
         * be two steps, 1. lower tubeine load, 2. insert rods to follow. could we add timing
         * controls to the checkoffs so that it wont check off temperature until turbine load is
         * down?")*
         *
         * THE SPLIT IS THE TIMING CONTROL. Grading is sequential per step, so putting the load
         * drop and the rod trim in two steps makes the trim ungradable until the drop is checked
         * off — no new mechanism needed, and it is what the owner asked for in the same sentence.
         *
         * AND THE ENTRIES ARE TWO-SIDED WHERE THE PLANT'S ENTRY STATE SATISFIES A FLOOR.
         * `_gradeAccs` LATCHES every entry except a `~` band, and this leg starts at 100 MWe, so
         * #715's `mwe_output > 70` floor was MET on the first tick of the step and latched there.
         * MEASURED (full stack, this leg's own `from`, 60x, `inbox/724/item18d.js`): a player who
         * does the step's SECOND half and not its first — borate, insert 40 steps, never touch
         * LOAD — drives the plant to a STEAM GENERATOR LOW-LOW LEVEL scram at t = 2256 s, and
         * 21 s later this step CHECKED ITSELF OFF on 1.37 % power and 0.00 MWe. #715's floor
         * catches a plant that was already dead when the leg started; it cannot catch one that
         * dies during the step. A `~` band re-grades for ever and cannot.
         *
         * THE TEMPERATURE EXCURSION THE REPORT NAMES IS REAL BUT SMALL, and that is recorded
         * rather than acted on. MEASURED (`inbox/724/item18_split.js`): dropping LOAD 100 -> 75
         * MWe with no rod motion peaks AVG COOLANT TEMPERATURE at 584.0 degF at t = 84 s, a rise
         * of 3.7 degF, and at 300 s it sits 9.4 degF ABOVE the tile's green band (581.2 degF
         * against a 571.8 degF programme). It reaches no protection setpoint and does not scram.
         * Out of band, not dangerous — the dangerous part was the check-off. */
        { text: 'Set LOAD to 75 MWe and let the reactor follow it down. Leave the rods alone for now.',
          note: 'Power walks down on its own over about five plant-minutes. AVG COOLANT TEMPERATURE rises out of the green band on its tile while it does — that is expected, and the next step is what brings it back.',
          why: 'The reactor follows the turbine: less steam drawn means the heat has nowhere to go, the water warms, and warmer water walks power down by itself. Load first, rods second, every time — insert first and you take reactivity out of a reactor still being asked for full steam, which walks the steam generator down instead.',
          control: 'Turbine Load', target: 'OUTPUT 75 MWe',
          cmd: { action: 'set_load_target', mwe: 75 }, hold: 300,
          /* MEASURED at the end of this hold: OUTPUT 75.00 MWe, REACTOR POWER 85.79 %. Both
           * entries are FALSE at the step's own entry (100.00 MWe, 98.91 %), so neither can be
           * had for free, and the OUTPUT band is two-sided so it cannot latch. */
          accs: [{ p: 'mwe_output', op: '~', v: 75, tol: 5, label: 'OUTPUT settled near 75 MWe' },
                 { p: 'power_pct', op: '<', v: 95, label: 'Reactor following the load down' }],
          hl: ['Turbine Load'], hl_watch: ['Tavg', 'Reactor Power'] },
        { text: 'Now hold INSERT at MED until AVG COOLANT TEMPERATURE is back inside the green band on its tile.',
          note: 'About 40 steps at MED, the middle rod speed on the ROD CONTROL card. The green band is the temperature the plant is meant to hold at the power it is making; it falls with load, from 578 °F at 100 % to 547 °F at no load. Temperature above the band: insert. Below: withdraw. Stop when it is back in the band — the boration from step 1 is still working and will keep walking it down.',
          why: 'The load drop left the reactor hot: it settles above its programme until rods take the extra reactivity out. This is the half of the evolution the plant cannot do for you, and it is why the order matters — the turbine leads, the rods follow.',
          control: 'Rod Speed', target: 'AVG COOLANT TEMPERATURE back inside the band; OUTPUT still 75 MWe',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: -40, speed: 'normal' }, hold: 300,
          /* MEASURED at the end of this hold (40 steps in, 300 s): Tavg 570.7 degF (299.28 degC)
           * against a 571.8 degF programme — 1.1 degF inside a band whose half width is
           * 5.0 degF (`tavg_c < 302.7` is the band's own top edge: pwr_board_wiring `tavgBand`
           * draws ref +/- 3.5 x the 0.8 degC rod lockup band). At this step's ENTRY Tavg is
           * 305.11 degC and power 85.79 %, so both one-sided entries are FALSE until the trim is
           * actually made. The OUTPUT band is the anti-latch pair: a scram during the trim (the
           * measured failure mode) breaks it. The upper bound is one-sided ON PURPOSE — the
           * boration keeps cooling and a two-sided band would fall out from under a player
           * reading at 1x about 130 s after it went green. */
          accs: [{ p: 'tavg_c', op: '<', v: 302.7, label: 'AVG COOLANT TEMPERATURE back below 577 °F, inside its band' },
                 { p: 'power_pct', op: '<', v: 80, label: 'Reactor followed down to about 73 %' },
                 { p: 'mwe_output', op: '~', v: 75, tol: 5, label: 'Generator still carrying about 75 MWe' }],
          hl: ['Rod Speed — Normal', 'Insert'], hl_watch: ['Tavg', 'Turbine Load'] },
        { text: 'Set LOAD to 50 MWe, let power follow, then hold INSERT until AVG COOLANT TEMPERATURE is back in its band.',
          note: 'About 20 steps at MED.',
          why: 'Same order: LOAD first, then rods, so the temperature does not sit hot above its band. STEAM GENERATOR LEVEL dips before it recovers on each drop; that is normal, and SG FEED in AUTO handles it.',
          control: 'Turbine Load', target: 'OUTPUT 50 MWe; AVG COOLANT TEMPERATURE inside its band',
          cmd: { action: 'set_load_target', mwe: 50 }, hold: 720,
          /* PAIRED (#715), AND THE PAIR IS TWO-SIDED (#736). MEASURED: mwe_output settles to
           * 50.00 by the end of this step's hold, reads 75.00 at its entry and 0 on a scram — so
           * the band is false at entry AND false on the failure, where the old `> 45` floor was
           * true at entry and latched there for the rest of the step.
           *
           * THE ROD TRIM IS GRADED HERE NOW (#739). This step and the two below it instruct a
           * rod insertion and graded only the LOAD half, so the step ticked whether or not the
           * player touched a rod — the defect #739 filed. The entry is step 3's own shape: the
           * band's TOP EDGE at THIS step's load, `trefProgram(load) + 3.5 x the 0.8 degC rod
           * lockup band` (pwr_board_wiring `tavgBand`), which at load 0.50 is 298.08 degC —
           * authored 298.1, 569 degF.
           * IT DISCRIMINATES, MEASURED on the replay three ways (seed 42, from hot_full_power):
           *   authored route (step 3's trim made, boration running)  295.76 degC  564.4 degF  PASS
           *   step 3's trim removed, boration still running          299.53 degC  571.2 degF  FAIL
           *   neither trim nor boration                              310.01 degC  590.0 degF  FAIL
           * so a player who skips the trim reds this step and steps 5 and 6 with it. One-sided
           * for step 3's reason: the boration keeps walking Tavg down and a two-sided band would
           * fall out from under a player reading at 1x. */
          accs: [{ p: 'power_pct', op: '<', v: 70, label: 'Reactor following through 70 %' },
                 { p: 'mwe_output', op: '~', v: 50, tol: 5, ask: 'Set LOAD to 50 MWe.', label: 'Generator settled near 50 MWe' },
                 { p: 'tavg_c', op: '<', v: 298.1, ask: 'Hold INSERT at MED until AVG COOLANT TEMPERATURE is back in its band.', label: 'AVG COOLANT TEMPERATURE back below 568 °F, inside its band' }],
          hl: ['Turbine Load', 'Insert'], hl_watch: ['Tavg'] },
        { text: 'Set LOAD to 30 MWe, let power follow, then hold INSERT until AVG COOLANT TEMPERATURE is back in its band.',
          note: 'About 10 steps at MED.',
          why: 'Lower power needs smaller rod moves. The band is walking back down toward 547 °F. A plant left hot at low load sends the difference to the condenser through the steam dump.',
          control: 'Turbine Load', target: 'OUTPUT 30 MWe; AVG COOLANT TEMPERATURE inside its band',
          cmd: { action: 'set_load_target', mwe: 30 }, hold: 600,
          /* PAIRED (#715), TWO-SIDED (#736). MEASURED: 30.00 at the end of this hold, 50.00 at
           * its entry, 0 on a scram.
           * ROD TRIM GRADED (#739) — see the step above for the derivation and the three-way
           * discrimination run. Band top at load 0.30 is 294.38 degC; authored 294.4, 562 degF.
           * MEASURED at the end of this hold: authored route 290.44 degC (554.8 degF) PASS,
           * step 3's trim removed 295.36 degC (563.6 degF) FAIL. */
          accs: [{ p: 'power_pct', op: '<', v: 45, label: 'Reactor following through 45 %' },
                 { p: 'mwe_output', op: '~', v: 30, tol: 5, ask: 'Set LOAD to 30 MWe.', label: 'Generator settled near 30 MWe' },
                 { p: 'tavg_c', op: '<', v: 294.4, ask: 'Hold INSERT at MED until AVG COOLANT TEMPERATURE is back in its band.', label: 'AVG COOLANT TEMPERATURE back below 562 °F, inside its band' }],
          hl: ['Turbine Load', 'Insert'], hl_watch: ['Tavg'] },
        { text: 'Set LOAD to 15 MWe, let power follow, then hold INSERT until AVG COOLANT TEMPERATURE is back in its band.',
          note: 'About 6 steps at MED. Stop here; the shutdown walkthrough takes over.',
          why: 'Scramming from full power is a thermal shock to the plant. About 15 % is low enough that the trip is gentle and high enough that the steam generator still has steam to dump afterwards.',
          control: 'Turbine Load', target: 'OUTPUT 15 MWe; REACTOR POWER near 15 %',
          cmd: { action: 'set_load_target', mwe: 15 }, hold: 900,
          /* BAND RE-DERIVED (#508, 2026-09-06). It read v: 30 and the 547 degF re-anchor puts the
           * plant at 33.94 %. NOT a regression -- the old number was calibrated on the plant #508
           * fixed. MEASURED at the end of this step, one fixture, three trees:
           *                        557/flat    557/#633    547/#633 (shipping)
           *   condenser dumps       41.55 %     33.15 %      62.66 %
           *   ATMOSPHERIC DUMP      64.00 %     35.30 %       0.00 %   <- the defect itself
           *   Tavg                 569.84 degF 569.35 degF  563.85 degF
           *   steam pressure       1055 psig   1048 psig     974 psig
           *   reactor power         27.38 %     27.75 %      33.94 %
           * At 15 MWe the AS-BUILT plant sat with its ATMOSPHERIC DUMP VALVE 64 % OPEN, venting to
           * the sky, and this acceptance PASSED on it. Re-anchored, that valve is SHUT and the
           * condenser carries the heat; the plant runs 6.0 degF cooler, so moderator feedback holds
           * power 6.2 points higher. The rest of the ladder is `load_pct + 15`, and that 15 is
           * really the dump's capacity headroom (28 % of rated) -- so 40 sits inside the derived
           * form (load + 28 = 43) and clears all THREE measured behaviours by at least 6 points,
           * while a plant that failed to ramp down still reds near 100 %.
           *   SEPARATE, OWNER-VISIBLE, NOT FIXED HERE: Tavg ends this step 11.9 degF ABOVE the new
           *   program (it was 9.4 degF above the old one), so 'about 6 steps' of rod trim does not
           *   put Tavg on program and the dumps hold 62.66 % indefinitely. The trim sizing predates
           *   #508 and was ALREADY short; the re-anchor widened the gap by 2.5 degF. Re-deriving
           *   the trims is content work, not a threshold edit.
           *   ⚠ THAT PARAGRAPH IS STALE AND THE PLANT HAS MOVED UNDER IT (#739, 2026-09-13).
           *   RE-MEASURED at the end of this step on develop @ 415471b9, same fixture, seed 42:
           *     steam flow 0.1495 -> programme 288.80 degC (551.8 degF), band 546.8..556.9 degF
           *     Tavg 285.06 degC (545.1 degF)  =  6.7 degF BELOW programme, not 11.9 degF above
           *     STEAM DUMP 0.00 %, ATMOS DUMP 0.00 %   (not "the dumps hold 62.66 %")
           *     REACTOR POWER 12.95 %                  (not 33.94 %)
           *   The `power_pct < 40` band below is unaffected and still clears by 27 points. Left
           *   as a correction rather than a deletion because the #508 table is the record of the
           *   re-anchor; what is retired is its forward-looking "NOT FIXED HERE" claim. */
          /* PAIRED, SAME FIX (#715). MEASURED: mwe_output settles to 15.00 by the end of this
           * step's hold; 0 on a scrammed plant. This is also the leg's LAST step, so it is the
           * one a scram would have left checked off with the completion banner still claiming
           * "15 MWe" — see `outcome_guard` below, the second, independent half of the fix. */
          accs: [{ p: 'power_pct', op: '<', v: 40, label: 'Reactor below 40 % and falling as the boration finishes (rod trims take it to about 15 %)' },
                 /* TWO-SIDED (#736): 15.00 at the end of this hold, 30.00 at its entry, 0 on a
                  * scram — and this is the leg's LAST step, the one whose latched floor let the
                  * completion banner fire on a dead plant. */
                 { p: 'mwe_output', op: '~', v: 15, tol: 5, ask: 'Set LOAD to 15 MWe.', label: 'Generator settled near 15 MWe' },
                 /* ROD TRIM GRADED (#739) — see step 4 for the derivation and the three-way
                  * discrimination run. Band top at the measured 0.1495 steam flow is 291.60 degC;
                  * authored 291.6, 557 degF. MEASURED at the end of this hold: authored route
                  * 285.06 degC (545.1 degF) PASS by 11.8 degF, step 3's trim removed 292.22 degC
                  * (558.0 degF) FAIL by 1.1 degF. ⚠ THAT 1.1 degF IS THE THINNEST OF THE THREE —
                  * this step is 900 s downstream of the trim and the boration has had the longest
                  * to close the gap on its own, so it is the weakest of the three as a detector.
                  * ONE-SIDED IS NOT COSMETIC HERE: the authored route ends 545.1 degF, which is 6.7 degF
                  * below the PROGRAMME (551.8) and 1.7 degF below the BAND's floor (546.8) — the smaller
                  * of the two is the one that matters, and a two-sided band would still red the
                  * shipping leg. Said as "below the band" in an earlier draft, which overstated the
                  * margin fourfold (#741 quality pass). */
                 { p: 'tavg_c', op: '<', v: 291.6, ask: 'Hold INSERT at MED until AVG COOLANT TEMPERATURE is back in its band.', label: 'AVG COOLANT TEMPERATURE back below 557 °F, inside its band' }],
          hl: ['Turbine Load', 'Insert'], hl_watch: ['Tavg'] },
      ],
      guard: { never_melted: true, never: [{ p: 'fuel_temp_c', op: '>=', v: 1200 }] },
      outcome: 'Plant stable near 15 % and 15 MWe, AVG COOLANT TEMPERATURE in its band. The shutdown walkthrough takes it to Mode 3.',
      /* THE BANNER'S OWN CHECK (#715, second cause). `outcome` above is an authored plant-state
       * claim ("15 MWe") that nothing verified before this — instructor_layer.js's
       * `_gradeOutcomeGuard` re-grades this array against the LIVE plant for as long as the
       * completion card is shown, and the client swaps in a neutral note when it fails. Kept to
       * the two instruments the claim actually names, not a blanket trip guard: a plant that
       * completes this leg with the turbine off line or making zero MWe does not match "15 MWe"
       * regardless of why. */
      outcome_guard: [{ p: 'turbine_tripped', op: '<', v: 1 }, { p: 'mwe_output', op: '>', v: 10 }],
    },
    {
      id: 'pwr_shutdown', category: 'shutdown', manual_ref: 'PWR-N14', next: 'pwr_cooldown',
      title: 'Mode 1, At Power → Mode 3, Hot Standby — normal shutdown',
      purpose: 'Shut the reactor down from low power: take the load off the generator, scram the reactor, and check the steam dump is carrying the heat the fuel still makes. Under 10 plant-minutes.',
      from: 'hot_full_power',
      prereq: ['Reactor at low power, 10 to 20 %, with the turbine on line (auto-checked).'],
      /* THE UPPER BOUND WAS MISSING (#696, owner: "shouldn't we walk down the power instead of
       * just putting load to zero? Coolant temp spikes hard when we just put it to zero."). Only
       * `power_pct > 10` was checked, which a 100 % plant satisfies — this leg's own `from` is
       * `hot_full_power`, so the Walkthroughs list lets a player start it standalone at full
       * power. Measured (service, hot_full_power -> load 0 -> scram, full stack, `PWR2_MEASURE`
       * seed 42): standalone, AVG COOLANT TEMPERATURE runs 580.3 -> 601.3 °F (304.6 -> 316.3 °C),
       * +21.0 °F (+11.7 °C) in 29 s, 2,603 °F/hr — 54.3 °F (30.1 °C) above the 547.0 °F no-load
       * program. Chained after `pwr_lower_power` (this leg's INTENDED entry, ~15 % per that leg's
       * own last step), the same drive peaks 560.1 -> 560.3 °F, a 0.2 °F (0.1 °C) blip — the
       * #508 rod-trim residue riding along, not a new spike. Scramming FIRST at either power
       * produces ZERO rise (Route E/D), so the order in this leg's own steps (load to 0, then
       * scram) is not the cause: the cause is holding the reactor at full nuclear power against
       * near-zero steam demand for up to 120 s while step 1's `hold` waits on a second manual
       * action. SOURCED (Ginna UFSAR ch10, ML20339A040 p.160; ch15 §15.2.2.1, ML20339A101;
       * Tech Spec Bases Rev 101, ML20339A221): above 50 % rated thermal power a complete loss of
       * load causes an automatic reactor trip; below 50 % "presents no hazard".
       *
       * 30 %, NOT 20 %. The issue's own recommendation was 20 %, sized against
       * `pwr_lower_power`'s text ("about 15 %"). Measured directly (chained: `pwr_lower_power`
       * run to completion into `pwr_shutdown`'s own entry, full stack): the plant this leg
       * actually hands off from settles at 22-23 % power, not 15 % — the already-documented
       * #508 rod-trim residue (that leg's own comment: "the trim sizing predates #508 and was
       * ALREADY short"). A 20 % ceiling would WARN on the leg's own INTENDED, currently-shipped
       * entry, which is worse than the silent gap it replaces — a banner on the correct route
       * teaches a player to ignore every banner. 30 % clears the measured ~23 % handoff with
       * margin and still sits comfortably under the sourced 50 % hazard line.
       * Full measurement: github.com/TH462/Reactor-Dynamics/issues/696#issuecomment-5626847249.
       *
       * `precond` WARNS, never blocks *(OWNER RULING, 2026-08-06: selected "Warn, never block"
       * from three options)* — the banner is the pool's own idiom for "why this leg will not go
       * well", captured once at open, same as every other precondition row in this file. It does
       * not stop a player who ignores it, but it does stop the SILENT case the owner hit: no
       * warning at all above 10 %. */
      precond: [
        { p: 'power_pct', op: '>', v: 10, text: 'Reactor at power: REACTOR POWER above 10 %' },
        { p: 'power_pct', op: '<=', v: 30, text: 'Reactor at LOW power, not full power: REACTOR POWER at or below 30 % — run "Mode 1, At Power — load rampdown to about 15 %" first if you are at full power' },
      ],
      steps: [
        { text: 'Set LOAD to 0 MWe and wait for OUTPUT to fall below 5 MWe.',
          why: 'Taking the load off the turbine first means the scram happens with no electricity on the generator. The reactor follows the falling steam demand down by itself.',
          control: 'Turbine Load', target: 'OUTPUT below 5 MWe',
          cmd: { action: 'set_load_target', mwe: 0 }, hold: 120,
          acc: { p: 'mwe_output', op: '<', v: 5 },
          hl: ['Turbine Load'] },
        { text: 'Press SCRAM on the ROD CONTROL card: once to arm it (PRESS TO ARM), then again to scram.',
          why: 'A planned scram from low power. Both rod banks drop into the core and the chain reaction stops in seconds. The fuel keeps making about 2 % of full power from radioactive decay, and that heat has to go somewhere; the next step checks where.',
          control: 'SCRAM', target: 'both rod positions 0 of 627; REACTOR POWER falling below 5 %',
          cmd: { action: 'scram' }, hold: 60,
          acc: { p: 'power_pct', op: '<', v: 5 },
          hl: ['SCRAM'] },
        /* THE DUMP'S MODE IS THE SHUTDOWN LEG'S TO SET (layman playtest pass 2, #653 S-11; the seam
         * pass 1 found as S2). After the scram the dump is still in 'tavg' mode from power; AUTO
         * with the turbine tripped selects pressure mode. The tile reads FISSION power (0.2 %
         * after a scram), so the text no longer claims "near 2 %"; decay heat has no readout on
         * this board and the old `decay_heat_pct` acceptance drew a done-when nobody could find.
         *
         * GRADED ON THE STATE, NOT THE PRESS (#697). This used to be a pure cmd-kind entry with
         * no predicate and no `overtaken` — measured (service, hot_full_power -> load 0 -> scram,
         * chained from `pwr_lower_power` too, AUTO never pressed): `steam_dump_valve_pct` is
         * ALREADY above 0.5 % from t=0 (the tavg-mode dump answers the load/scram transient on
         * its own, 39 % open chained, 100 % standalone, decaying to ~7-9 % by the time power
         * clears 1 %) and `power_pct` clears 1 % within seconds of the scram. Both siblings were
         * already true; only the redundant press blocked the tick — the #697 family, same shape
         * as #641 sign-flipped. `p` and `cmd` now live on ONE entry: `_gradeAccs` grades the `p`
         * half independent of any command (proven by injection — a synthetic accs entry with
         * `p` already true and `cmd` never issued latches on its own), so a plant already there
         * ticks the box; `_accsCmdWatch` still latches the SAME entry instantly on the press for
         * a plant that is not (an entry with a `p` AND a `cmd` is not the two-entry
         * hidden-cmd-plus-predicate shape `pwr_heatup` step 8 uses — that shape still requires
         * the actual press, proven by injection with the SAME two functions, so it does not fix
         * a pre-satisfied step; the merge does). `steam_dump_auto` never reads 0 on this leg (it
         * is `dumpMode() !== 'off'`, true since the IC's own lineup), so this half of the step
         * always latches at once — that is correct, not a hole: the two REAL gates are the
         * predicate siblings below, which still require the plant to actually get there. */
        { text: 'Press AUTO on the STEAM DUMP card until its status reads PRESS.',
          note: 'Then check REACTOR POWER below 1 %, STEAM PRESS holding near 1020 psi, and the STEAM DUMP open a little.',
          why: 'The chain reaction is gone, but the fuel still makes about 2 % of full power from radioactive decay, and REACTOR POWER does not show it. With the turbine tripped, AUTO puts the steam dump into pressure-holding mode and it carries that heat to the condenser. Hot, at pressure, shut down: Mode 3, Hot Standby.',
          hold: 120,
          accs: [{ cmd: { action: 'set_steam_dump', mode: 'auto' }, p: 'steam_dump_auto', op: '>', v: 0,
                   label: 'STEAM DUMP AUTO lit, status PRESS' },
                 { p: 'steam_dump_valve_pct', op: '>', v: 0.5, label: 'STEAM DUMP open, carrying the decay heat' },
                 { p: 'power_pct', op: '<', v: 1, label: 'REACTOR POWER below 1 %' }],
          hl: ['Steam Dump'], hl_watch: ['Tavg', 'SG Pressure'] },
      ],
      guard: { never_melted: true },
      outcome: 'Reactor shut down at Mode 3, Hot Standby; decay heat going to the steam dump. The cooldown walkthrough takes the plant to Mode 5.',
    },
    {
      id: 'pwr_cooldown', category: 'shutdown', manual_ref: 'PWR-N15', stack_only: true,
      title: 'Mode 3, Hot Standby → Mode 5, Cold Shutdown — controlled cooldown',
      purpose: 'Take a hot, shut-down plant from Mode 3, Hot Standby to Mode 5, Cold Shutdown, ending with residual heat removal (RHR) carrying the heat. About 7 plant-hours.',
      from: 'hot_zero_power',
      prereq: [
        'Plant at Mode 3, Hot Standby: AVG COOLANT TEMPERATURE near 547 °F, PRIMARY PRESSURE 2235 psi, reactor shut down (auto-checked).',
        'RCP FLOW on; SG FEED in AUTO.',
        'STEAM DUMP in AUTO: it is the heat sink until RHR takes over.',
      ],
      precond: [
        { p: 'tavg_c', op: '~', v: 286, tol: 8, text: 'Hot: AVG COOLANT TEMPERATURE 532 to 561 °F' },
        { p: 'power_pct', op: '<', v: 1, text: 'Reactor shut down: REACTOR POWER 0 %' },
      ],
      auto_channels: ['boron_conc'],
      steps: [
        { text: 'On the BORON card set 920 and press Enter. Do not start cooling until BORON STATUS reads BORATING.',
          note: 'Press ON only if it is not already lit.',
          why: 'Hot, the plant is comfortably shut down on about 719 ppm of boron. Cold water makes the chain reaction easier, and the same core at 122 °F needs about 920 ppm for the same margin. Adding it first means the margin arrives before the cold does.',
          control: 'Boron control', target: 'BORON reads 920 ppm, ON lit',
          /* 3 ppm A MINUTE IS THE PLANT'S OWN NUMBER, AND IT IS FLAT (#753, re-measured 2026-09-14
           * after the figure was filed as refuted). BORATION AND DILUTION ARE NOT THE SAME SHAPE:
           * dilution is a first-order approach and slows as it closes, which is the finding that
           * was carried across to here by mistake. Boration is a DELIVERY — the `boron_conc`
           * channel's 0.05 ppm/s, essentially on this plant's charging ceiling (pwr_control.js) —
           * and it does not taper. Measured full stack from this leg's own initial condition,
           * 718.9 ppm to 920: 3.00 ppm/min in EVERY 60 s window, start to finish; 27.1 min to 800,
           * 53.7 min to the 880 ppm this step checks off at, 60.4 to 900, 66.7 to 919. The hint said
           * "about 60 minutes" for a wait that is 54 to the tick and 67 to the target, so it now
           * gives both. */
          wait_hint: 'The boration runs at a steady 3 ppm a minute and does not slow down as it closes: about 54 plant-minutes to the 880 ppm this step checks off at, about 67 to the full 920. Start it and carry on; the next steps run while it works.',
          cmd: { action: 'set_auto_setpoint', channel_id: 'boron_conc', value: 920 }, hold: 3900,
          acc: { p: 'boron_ppm', op: '>', v: 880 },
          hl: ['Boron Target'], hl_watch: ['Boron Status', 'Boron Concentration'] },
        { text: 'Lower SET PZR PRESSURE to 1900 psi.',
          note: 'Below 1972 psi the plant lets you switch off the protection in the next step.',
          why: 'Two automatic protections watch for falling pressure, because on a running plant falling pressure means a leak. They can only be switched off below 1972 psi, so the setpoint comes under that first. This is not the depressurization; it only unlocks the next step.',
          control: 'Pressure SP', target: 'PRIMARY PRESSURE below 1972 psi',
          cmd: { action: 'set_pressure_setpoint', mpa: 13.1 }, hold: 1500,
          ramp: [{ action: 'set_pressure_setpoint', arg: 'mpa', points: [15.41, 13.1] }],
          acc: { p: 'pressure_mpa', op: '<', v: 13.6 },
          hl: ['Pressure SP'], hl_watch: ['Primary Pressure'] },
        { text: 'Press TRIP BLOCKS, then BLOCK the PZR PRESS LO-LO and SI REACTOR TRIP rows. Then press STOP on ECCS.',
          note: 'TRIP BLOCKS is on the ROD CONTROL card; STOP is on the ECCS card.',
          why: 'To the automatic protection, a cooldown looks exactly like a leak: pressure falling on a hot plant. Left on, the first cooling stage would trip the reactor and start the emergency injection pumps, flooding the plant with cold water you did not ask for. STOP on the ECCS card takes the injection pump out of standby as well.',
          control: 'Trip Blocks', target: 'PZR PRESS LO-LO and SI REACTOR TRIP lit on the TRIP BLOCKS panel; ECCS STOP lit',
          cmd: { action: 'set_trip_block', trip_id: 'lo_press', blocked: true }, hold: 30,
          /* GRADED ON THE LINEUP, NOT ON THE PRESS (#731, 2026-09-13). These two were `cmd`-kind
           * entries, so they asked "did a set_trip_block go past while this step was active".
           * Develop measured the dangerous half of that on `pwr_startup` and fixed the sense;
           * the other half stood here — a block placed EARLIER (the player opened TRIP BLOCKS
           * on the way down, or a previous leg left it set) never satisfies the step, so the
           * walkthrough stalls on a plant that is already correctly lined up.
           *
           * `lo_press_blocked` / `si_trip_blocked` read `rps_state.trip_blocks` live every tick
           * (`instructor_layer` RPS_BLOCK_PARAMS), which is what a permissive-gated block needs:
           * it AUTO-REINSTATES below P-10, and a latched command-sighting cannot see that.
           *
           * ⚠ THE `cmd` HALVES STAY. A first cut dropped them for pure `p` entries and broke the
           * leg: the REPLAY issues `accs[].cmd`, so with them gone the SI block was never placed,
           * safety injection actuated on the way down, the injection pumps then REFUSED the RHR
           * align at step 10 (the #458 lineup rule) and the plant scrammed on overtemperature at
           * step 12 — 10 failed checks from one deletion. An entry may carry BOTH, which is what
           * step 4 next door already does: `_gradeAccs` grades the `p` half whatever else is on
           * the entry, and `_accsCmdWatch` latches the `cmd` half. Both #731 halves are then
           * covered — a block placed EARLIER satisfies through state, and an UNBLOCK cannot
           * satisfy through the command because develop fixed `_cmdEvidence` to match the sense. */
          /* …AND THE THIRD ACTION THE TEXT ASKS FOR IS GRADED NOW (#739, 2026-09-13). "Then press
           * STOP on ECCS" had NO entry at all — the step's own `target` names it ("ECCS STOP lit")
           * and the step ticked on the two trip blocks alone.
           *
           * IT IS A PURE `cmd` ENTRY, AND THAT IS THE HONEST FORM, NOT A SHORTCUT. MEASURED at
           * this leg's own `hot_zero_power` boot, before and after `set_hpi {active:false}` (30
           * ticks each side): `eccs_mode` "standby" -> "standby", `hpi_active` false -> false,
           * `si_actuated` false -> false, command accepted {ok:true}. There is no SI to reset and
           * no pump running to stop, so securing an idle pump moves NOTHING a predicate could
           * read — a `p: 'hpi_active', op: '<', v: 1` sibling would be true at boot and would be
           * the pinned NON-EVENT this repo's own trap list names. The evidence is the press, so
           * the entry says so.
           * ⚠ §2n DOES NOT CLASSIFY IT AS ONE, and that is the sweep's shape rather than a
           * disagreement: it computes "has a state sibling" over the WHOLE step, and this
           * entry's two neighbours (the trip blocks) carry `p` — siblings that belong to
           * different actions and say nothing about whether the ECCS press is observable. So it
           * lands in CANDIDATES and passes there. Adding the step to `NO_STATE_EXPECTED` was
           * tried first and reddens the check; that runner's comment carries the detail.
           * ⚠ AND THE LAMP IS NO BETTER — the `target` above says "ECCS STOP lit", which sounds
           * gradeable and is not. It is `!esfAuto(s,'hpi') && !hpi_active` (pwr_board_wiring
           * :603), and this plant publishes NO `hpi` ESF arm at all (measured through the leg:
           * `automation.esf` is `{"afw":"auto"}` and nothing else), so the lamp is LIT AT BOOT,
           * lit at this step, and lit after the press — three samples, no change. Grading it
           * would be the pinned non-event one level further out.
           * SOFT-LOCK WINDOW, MEASURED rather than argued (guide R7 asks for it): `eccsStop`
           * refuses only when safety injection is LATCHED and either the 45-60 s reset relay is
           * still running or P-4 is not made. Driven to this step through the leg's own route
           * (borate, setpoint to 1900 psi, 2000 ticks) the plant sits at 1923 psi with
           * `si_actuated` false and the command returns {ok:true} — and it is re-issuable after a
           * Rewind from the same state, which is the other half of R7. No `overtaken` is
           * authorable: `overtaken` fires for the whole STEP, and the only candidate predicate
           * (`hpi_active < 1`) is true at boot, so it would skip the two trip blocks as well.
           * ORDER MATTERS: third in the array, so the replay issues it AFTER both blocks, which
           * is the order the text reads and the order the plant wants. */
          accs: [{ cmd: { action: 'set_trip_block', trip_id: 'lo_press', blocked: true },
                   p: 'lo_press_blocked', op: '>', v: 0, label: 'PZR PRESS LO-LO blocked' },
                 { cmd: { action: 'set_trip_block', trip_id: 'si_trip', blocked: true },
                   p: 'si_trip_blocked', op: '>', v: 0, label: 'SI REACTOR TRIP blocked' },
                 { cmd: { action: 'set_hpi', active: false }, label: 'STOP pressed on the ECCS card' }],
          hl: ['Trip Blocks', 'ECCS'] },
        /* THE DUMP MUST BE IN PRESSURE MODE, AND THE CHAIN DOES NOT LEAVE IT THERE (layman playtest
         * 2026-09-07, #653 S2). `set_steam_dump auto` maps to 'pressure' only when the turbine is
         * tripped (pwr2_shell.js); a plant that arrives here from the shutdown leg was put in AUTO
         * at power, so its mode is still 'tavg' after the scram, and every DUMP SETPOINT stage is
         * inert. Measured (service, hot_full_power -> load 0 -> scram): mode 'tavg'; press AUTO
         * again -> 'pressure', and 640 psi then cools Tavg 287.7 -> 257.0 degC in 30 plant-minutes.
         * The leg's own hot_zero_power IC boots in 'pressure', which is why the replay never saw
         * it. The temperature acceptance moves into `accs` beside it (an `acc` is ignored when
         * `accs` exists — instructor_layer grades one or the other).
         *
         * GRADED ON THE STATE, NOT THE PRESS (#697 — the reported instance: "steam dump AUTO was
         * already green but it still required a press to check off step"). This leg's own
         * `hot_zero_power` IC boots with the dump ALREADY `auto`/`pressure` (measured, nothing
         * commanded), and the CHAIN makes it worse: `pwr_shutdown`'s last step (also fixed by
         * #697) presses this same AUTO command, so a player walking the authored round trip
         * arrives here with it already done twice over. The old accs[0] was a pure cmd-kind entry
         * with no predicate and no `overtaken` — it could never latch except on a fresh press, so
         * the tick was ceremonial at best and, per the owner's report, a nagging one. `p` and
         * `cmd` now live on ONE entry, same fix and same proof-by-injection as `pwr_shutdown`
         * step 3: `_gradeAccs` grades the `p` half regardless of any command, so a plant already
         * there ticks the box; `_accsCmdWatch` still latches the SAME entry on the press for a
         * plant that is not. `steam_dump_auto` reads 1 the instant the leg boots (it is
         * `dumpMode() !== 'off'`, true from the IC's own lineup) — that half is DECORATIVE by
         * design, not a hole: the real gate stays the sibling `tavg_c < 175` predicate below,
         * which still cannot be faked — TAVG mode carries the setpoint nowhere (this step's own
         * `note`), so a player who never actually switches the dump to pressure mode never sees
         * tavg fall and the step correctly does not complete. */
        { text: 'Press AUTO on the STEAM DUMP card, then lower DUMP SETPOINT 50 psi at a time from 1020 to 120.',
          note: 'Press AUTO until the status reads PRESS; in TAVG mode the setpoint does nothing. Small steps: one big jump drops the coolant fast and empties the pressurizer. Wait between steps until AVG COOLANT TEMPERATURE stops falling, about 5 plant-minutes. About two plant-hours in all.',
          why: 'Steam pressure and steam temperature go together: lower the pressure the dump holds and the steam generator boils at a lower temperature, which pulls the reactor water down after it. It cannot pull the water below its own boiling point, so the walk goes all the way to 120 psi, about 341 °F, low enough for RHR to take over.',
          control: 'Dump SP', target: 'STEAM DUMP status PRESS; AVG COOLANT TEMPERATURE below 347 °F',
          wait_hint: true,
          cmd: { action: 'set_steam_dump_setpoint', mpa: 0.83 }, hold: 9600,
          ramp: [{ action: 'set_steam_dump_setpoint', arg: 'mpa', points: [7.03, 4.42, 2.76, 1.66, 0.83] }],
          saw: { p: 'tavg_c', op: '<', v: 250 },
          accs: [{ cmd: { action: 'set_steam_dump', mode: 'auto' }, p: 'steam_dump_auto', op: '>', v: 0,
                   label: 'STEAM DUMP AUTO lit, status PRESS' },
                 { p: 'tavg_c', op: '<', v: 175, label: 'AVG COOLANT TEMPERATURE below 347 °F' }],
          hl: ['Steam Dump — Auto', 'Dump Setpoint'], hl_watch: ['Steam Dump Status', 'Tavg'] },
        { text: 'Lower SET PZR PRESSURE to 1700 psi, as low as the box goes. From here pressure comes down by hand.',
          why: 'The setpoint box is the at-power pressure control and it stops at 1700 psi. A real cooldown leaves it exactly there: below it the heaters have nothing to hold, and the operator lowers pressure with the spray instead.',
          control: 'Pressure SP', target: 'SET PZR PRESSURE 1700 psi; PRIMARY PRESSURE below 1770 psi',
          cmd: { action: 'set_pressure_setpoint', mpa: 11.83 }, hold: 1500,
          ramp: [{ action: 'set_pressure_setpoint', arg: 'mpa', points: [13.1, 11.83] }],
          acc: { p: 'pressure_mpa', op: '<', v: 12.2 },
          hl: ['Pressure SP'], hl_watch: ['Primary Pressure'] },
        /* 50 %, NOT 100 % (layman playtest pass 2, #653 S-3/S-8). The player's pressurizer went
         * SOLID on 100 % spray (level 48 -> 100 % in three plant-minutes, spray then shut itself
         * off, pressure bounced back UP through the accumulator window and latched the clock hold)
         * and pressure had run through the whole 1615 -> 665 window before the isolate step was
         * reached. Measured through the gate's own harness (procedures_harness, seed 42), the end of
         * the wait step: 100 % -> 154 psi with level 69 %, the window ~4.5 min; 50 % -> 233 psi with
         * level 66 %, the window over 5 min; 20 % -> 465 psi, too slow for the RHR step. The old
         * 100 % replay passed at 228 psi / 65 % from a 27 % start — the player started at 48 %
         * after the fast dump walk, and went solid. Accepted at 1615 psi, where the accumulator
         * valve regains power — the next step's own window. */
        /* ONE STEP AGAIN — THE PRESSURE-CONTROL HANDOVER *(OWNER RULING, 2026-09-13: "1:A, 2:A,
         * 3:a now. I will playtest after you make these changes.")*, option A being this run only.
         * Heaters off and spray to 50 % are one mechanical handover and the owner's principle for
         * merging is "fewer beats for mechanical work".
         *
         * ⚠ THIS IS THE PAIR #653 PASS 3 S-5 DELIBERATELY SPLIT, AND THE MERGE DOES NOT PUT THE
         * DEFECT BACK. Read the old note before touching this again: "The heater-off was a
         * CMD-KIND ENTRY on the spray step, and the evidence matcher latches only while the step
         * is ACTIVE — the player pressed OFF while the setpoint step was still ticking, the board
         * showed OFF lit and HTR PWR 0 %, and '○ Heaters OFF' stayed open until AUTO-then-OFF
         * re-issued the command inside the step." The failure was the CMD-KIND grading, not the
         * pairing: a press that happened before the step went active could never be seen.
         * So the heater half is graded on STATE here (`heater_auto`, the lamp), which is true
         * whenever the plant is in it and cannot care when the button was pushed — the same
         * "grade the lineup, not the press" rule #731 settled for trip blocks. Merging it back as
         * a cmd entry would revert #653 S-5; that is the one thing this step must never become.
         *
         * COMMAND ORDER SURVIVES THE MERGE. `st.cmd` is issued before any `accs[].cmd`
         * (procedures_harness), so heaters-off lands first and the spray second, which is the
         * order the text states and the order the plant needs.
         * ⚠ NOT a #729 coupling — an earlier draft of this comment said so and sent the reader to
         * the wrong measurement. #729's order lesson is several steps later and is about shutting
         * the SPRAY before the RHR align. Heaters-before-spray predates it and was authored in the
         * split's own `why`.
         * ⚠ AND THE ORDER IS NO LONGER ENFORCED BY THE CARD. Split, the spray instruction was not
         * drawn until the heaters were off; merged, both rows are live at once and the lettered
         * rows deliberately imply no sequence. MEASURED cost of getting it wrong (spray to 50 %
         * with the heaters left in AUTO): the manual demand is zeroed, pressure reverses and
         * climbs from 962 to 1666 psia over ~60 plant-minutes while the selector still reads
         * MANUAL. The step does NOT complete — the heater row stays unmet, so it is recoverable
         * and not a soft lock — but nothing on the card explained why, which is what the first
         * sentence of the `note` is now for. */
        { text: 'Press OFF under HEATER, then MANUAL under SPRAY with its box at 50 %, not more.',
          note: 'Heaters first: with them still in AUTO the spray will not hold and pressure climbs back instead of falling. Spray water goes into the pressurizer and PRESSURIZER LEVEL climbs as pressure falls. At 100 % a pressurizer that starts high fills completely, after which the spray shuts itself off. At 50 % pressure falls about 3 psi a second with room to spare.',
          why: 'The heaters go off first, or they boil water as fast as the spray condenses it and pressure goes nowhere. Spray condenses steam in the pressurizer and pressure falls; the setpoint box has nothing left to hold. Lowering pressure spends SUBCOOLING MARGIN, how far the reactor water is below boiling, and that has to stay positive.',
          control: 'Pressurizer Heaters (PZR)', target: 'OFF lit under HEATER; SPRAY MANUAL at 50 %; PRIMARY PRESSURE below 1615 psi',
          cmd: { action: 'set_heater', power_pct: 0 }, hold: 240,
          /* THE 50 % IS GRADED NOW (#739, 2026-09-13). The step warned in its own `note` that a
           * player at 100 % fills the pressurizer solid, and then ticked on PRIMARY PRESSURE
           * alone — which 100 % satisfies FASTER. `spray_flow_pct` is the DELIVERED flow (true
           * state), and it tracks the demand exactly: MEASURED 50.000 at the end of this step and
           * at the end of every step through step 12, down to 11.0 psi (0.076 MPa), so the band is not a
           * high-pressure-only artefact. tol 5 is 45..55 %, which the note's own failure mode
           * (100 %) misses by nine tolerances; `~` two-sided also catches a player who set it too
           * LOW and is watching a cooldown that will not finish.
           * The pressure `acc` had to become an `accs` ENTRY, not sit beside one — `accs`
           * REPLACES `acc` in `_gradeAccs`, which is exactly the dead field #739 filed against
           * `pwr_heatup` step 15. Both halves are entries; neither is silent. */
          /* THREE ROWS, IN THE ORDER THE PLAYER ACTS (#741 lettered substeps). The heater lamp is
           * first because the heaters go off first; the spray carries the step's SECOND command
           * and its own state; the pressure row is the consequence and carries no `ask`, because
           * a row reading "6c. Press PRIMARY PRESSURE below 1615 psi" would be an instruction the
           * player cannot follow. */
          accs: [{ p: 'heater_auto', op: '<', v: 1,
                   ask: 'Press OFF under HEATER.', label: 'OFF lit under HEATER' },
                 { cmd: { action: 'set_spray', open: true, pct: 50 },
                   p: 'spray_flow_pct', op: '~', v: 50, tol: 5,
                   ask: 'Press MANUAL under SPRAY and set its box to 50 %.', label: 'PZR SPRAY at 50 %' },
                 { p: 'pressure_mpa', op: '<', v: 11.14, label: 'PRIMARY PRESSURE below 1615 psi' }],
          hl: ['Pressurizer Heaters (PZR)', 'Pressurizer Spray (PZR)'], hl_watch: ['Primary Pressure'] },
        /* "green ring" -> "pulsing ring" — the sibling of the heatup step, same #653 S-8 fix. */
        { text: 'Close the accumulator valve: click the valve symbol inside the pulsing ring while PRIMARY PRESSURE is 1615 to 665 psi.',
          note: 'The symbol sits above and right of the ACCUMULATORS tile, beside ECCS FLOW. At 50 % spray the window is about 5 plant-minutes wide.',
          why: 'The same window as the heatup, in reverse. Above 1615 psi the valve has no power; below 665 psi the nitrogen in the tanks pushes their water into the plant. Close it in between and the tanks stay full for the next heatup.',
          control: 'Accumulator valve', target: 'ACCUMULATORS tile reads ISOLATED and 100 %',
          cmd: { action: 'close_accumulator_valve' }, hold: 30,
          acc: { p: 'accumulator_valve_open', op: '<', v: 0.5 },
          hl: ['Accumulator valve'], hl_watch: ['Primary Pressure'] },
        { text: 'Wait, with SPRAY still at 50 %, until PRIMARY PRESSURE falls below 413 psi. Do not switch the spray off.',
          note: 'About 10 plant-minutes. If PRESSURIZER LEVEL climbs past 80 %, lower SPRAY.',
          why: 'ALIGN on the RHR card refuses to open the suction valve above 440 psi. Switch the spray off now and pressure bounces back over that number before you get there. SUBCOOLING MARGIN stays well above 100 °F on this spray.',
          control: '(observe)', target: 'PRIMARY PRESSURE below 413 psi with SPRAY still at 50 %; PRESSURIZER LEVEL below 80 %',
          hold: 1200,
          acc: { p: 'pressure_mpa', op: '<', v: 2.85 },
          /* NO PULSE ON A STEP WHOSE OWN TEXT SAYS "DO NOT SWITCH THE SPRAY OFF" (#653 S-3b,
           * 2026-09-15). This carried `hl: ['Pressurizer Spray (PZR)']` — the ACT-ON-THIS cue on
           * the one control the step tells the player to leave alone, on a step with no `cmd`.
           * The spray moves to `hl_watch` (steady) so it is still marked; `control` is
           * '(observe)', so `stepHlLabels`' fallback produces no press target at all. */
          hl_watch: ['Pressurizer Spray (PZR)', 'Primary Pressure', 'Pressurizer Level'] },
        { text: 'With the spray still on, press ALIGN on the RHR card, then set HX SPLIT to 7 %.',
          why: 'RHR is the low-pressure cooling loop that carries heat out of a shut-down plant. ALIGN opens its suction valve, which the plant only allows below 440 psi. HX SPLIT is how much of that loop goes through the heat exchanger; from here it is the cooldown throttle, 7 % is a gentle start, and COOLDOWN RATE beside it shows what that choice is doing.',
          control: 'Residual Heat Removal (RHR)', target: 'ALIGN lit on the RHR card; HX SPLIT 7 %',
          cmd: { action: 'set_rhr', active: true }, hold: 60,
          /* HX SPLIT IS GRADED NOW (#739, 2026-09-13), AND #739's OWN REASON FOR IT WAS WRONG.
           * The issue argued the check is not vacuous because `pwr2_engine.js:707` initialises
           * `hx_fraction = 0`. That line is inside `if (ic.cold)` and this leg starts from
           * `hot_zero_power`, which is NOT cold: MEASURED at this leg's boot,
           * `control_state.rhr_hx_fraction = 1`. So the player is THROTTLING 100 % -> 7 %, not
           * opening 0 % -> 7 %. The conclusion survives — it is a real action with a real effect
           * on the cooldown rate, and it was ungraded — but for the opposite reason, and the
           * before-value is the one a fresh reader needs.
           * ONE ENTRY CARRYING BOTH HALVES, step 3's shape: `cmd` so the replay performs the
           * action the player is told to perform (nothing else in this leg sets the split before
           * step 12's ramp, so a bare predicate would simply red), and `p` so a plant already
           * throttled there ticks the box. `rhr_hx_fraction` is a FRACTION on the wire and 7 %
           * on the card; tol 0.02 is +/- 2 points. */
          accs: [{ p: 'rhr_valve_open', op: '>', v: 0, label: 'ALIGN lit on the RHR card' },
                 { cmd: { action: 'set_rhr_hx', pct: 7 },
                   p: 'rhr_hx_fraction', op: '~', v: 0.07, tol: 0.02, label: 'HX SPLIT at 7 %' }],
          hl: ['Residual Heat Removal (RHR)'], hl_watch: ['Primary Pressure'] },
        /* ⚠ THE SPRAY STAYS ON HERE. THIS STEP USED TO SHUT IT AND THAT WAS THE #729 BLOCKER
         * (owner playtest #724 item 19, 2026-09-12: "the RHR put itself into ISOLOATE and now i
         * cant complete this step ... I cant put RHR into ALIGN. THIS IS A BLOCKER.").
         *
         * The old `why` said *"The spray is driven by the pumps, so it does nothing once they
         * stop; switching it off afterwards just tidies the lineup."* Both halves are false on
         * this plant. `pwr2_pressurizer.js` SPRAY declares `needs_rcp: true` (the physics) and
         * `rcp_gate_enforced: false` (a DECLARED departure) — so the spray keeps working with the
         * pumps secured, and it is the ONLY pressure control the player has left: the heaters are
         * off from step 6, the Pressure SP dial floors at 1700 psi, and the auxiliary-spray tile
         * was removed from the board by owner direction 2026-08-31.
         *
         * WHAT SHUTTING IT DOES, MEASURED full stack on the player's route (seed 42, 600x,
         * `inbox/724/m19*.js`): the pressurizer SHELL is at 601 degF against a 425 degF fluid and
         * gives back 181 kW with the heaters at 0 and the surge at 0. Pressure reverses from
         * -92 psi/min to +33 psi/min and never stops: the 585 psig RHR autoclosure fires at
         * 610 psig / 274.7 degF (the owner's "273F"), the accumulator speed hold then latches at
         * 684 psia, and the 425 psig open permissive will not let the valve back. Leaving the
         * spray at 50 % instead: pressure falls monotonically 308 -> 21 psia, RHR stays ALIGN,
         * no hold, Mode 5 at 115.5 min. The spray comes off two steps later, cold.
         *
         * `Manuals/04` PWR-N15 already recorded the same trap from the other side — *"shutting
         * the spray first bounces pressure back over the 425 psig block-open permissive —
         * measured, the order is the lesson"* — and the manual never told the operator to shut
         * it. Only this step did. */
        { text: 'Press OFF on the RCP FLOW card. Leave SPRAY at 50 %.',
          note: 'Do not switch the spray off yet — a later step does that, once the plant is cold.',
          why: 'With RHR circulating, the reactor coolant pumps are only adding heat, so they come off. The spray stays: the pressurizer shell is still hot metal and it keeps boiling water off the top of the pressurizer, which puts pressure back up. It is the only thing taking that heat away now — the heaters are already off and the SET PZR PRESSURE box stopped reaching at 1700 psi.',
          control: 'RCP ON/OFF', target: 'RCP FLOW falling; SPRAY still MANUAL at 50 %',
          cmd: { action: 'set_rcp', running: false }, hold: 60,
          accs: [{ p: 'pump_flow_pct', op: '<', v: 50, label: 'Pumps coasting down' },
                 { p: 'spray_flow_pct', op: '~', v: 50, tol: 20, label: 'SPRAY still on' }],
          /* THE CARD, NOT ALSO THE PUMP *(OWNER, 2026-09-09 playtest, #684 §D: "When the RCP is
           * highlighted it should highlight the RCP card not the pump. Currently both get
           * highlighted.")* — his SECOND report of it, after #607 item 1. One label lights one
           * element, so "both get highlighted" is a step naming both: 'RCP Run/Stop' is the
           * card (imrsjyqoq6t) and 'Reactor Coolant Pumps (RCP)' is the pump art on the loop
           * (imrobpq4a70), and their rects overlap. Every other pwr2 RCP step already names
           * the card alone; this was the last one that did not. The pump label STAYS in the
           * vocabulary — the wiring reserves it for watch-the-flow steps. */
          hl: ['RCP Run/Stop', 'Pressurizer Spray (PZR)'] },
        /* 25 % WAS OVER THE 100 degF/hr LIMIT THIS STEP'S OWN NOTE CITES (#729, 2026-09-12,
         * owner playtest #724 item 19: "average coolant temperature isnt dropping and if it is
         * it iwll take hours at real time" — he had it backwards, and so did this step).
         *
         * The old `why` claimed *"25 % reaches Mode 5 in about two plant-hours at close to 90 degF
         * per hour, just inside the limit."* MEASURED full stack from this step's own entry state
         * (300.0 degF, RCPs off, spray held, seed 42, `inbox/724/m19f.js`):
         *
         *   HX SPLIT 25 %  worst -193 degF/hr, average -154 degF/hr, Mode 5 in 0.66 plant-h
         *   HX SPLIT 15 %  worst -120 degF/hr
         *   HX SPLIT 12 %  worst  -95 degF/hr, average  -74 degF/hr, Mode 5 in 1.36 plant-h
         *
         * So the authored 25 % ran at 1.9x the limit and finished in a third of the time the text
         * promised. 12 % is the split that actually honours the sourced 100 degF/hr ceiling
         * (WTSM App 19-1, ML11223A342; NUREG-1431 LCO 3.4.3; ruled 2026-08-09 on #398), and at 12 %
         * "about two plant-hours" becomes very nearly true instead of being off by 3x.
         * `Manuals/04` PWR-N15 step 6 said "walk it 7 -> 25 %" and moves with this. */
        { text: 'Raise HX SPLIT to 12 % and wait until AVG COOLANT TEMPERATURE reads below 199 °F.',
          note: 'Keep COOLDOWN RATE under 100 °F per hour: if it runs faster, lower HX SPLIT. Watch SUBCOOLING MARGIN: the spray is still running and it keeps taking the margin down. The next step shuts it.',
          why: 'HX SPLIT is the cooldown rate now, and COOLDOWN RATE beside it is the read-back. 12 % holds about 95 °F per hour at the start and eases off as the plant closes on the RHR sink, reaching Mode 5 in about an hour and a half. Turn it higher and you go over the 100 °F per hour limit: 25 % measures 193 °F per hour.',
          control: 'Residual Heat Removal (RHR)', target: 'AVG COOLANT TEMPERATURE below 199 °F',
          wait_hint: true,
          /* HOLD 9000 -> 7200 s (#729), and 5400 was tried first — see the end of this note. 9000 s was authored for the 25 % split, which reaches
           * Mode 5 in 0.66 plant-h; at 12 % it is 1.36 plant-h (4890 s), so 5400 s keeps the
           * replay's ~8 min of slack. It also has to come down because the SPRAY IS STILL
           * RUNNING through this step: measured, subcooling margin at Mode 5 is 17.4 degF and
           * decays 0.2 degF/min while the spray is open, so a 2.5-hour hold walks it into the
           * leg's own `subcooling_c < 5` guard 68 min after the plant is already cold — which is
           * the replay sitting on a step the player leaves in seconds, not a plant defect. The
           * step's `note` now tells the player the same thing.
           *
           * 5400 s WAS TOO SHORT AND THE GATE SAID SO (97.87 degC against a 93 degC bound). The
           * replay does not step to 12 %, it RAMPS 7 -> 12 over the whole hold, so its average
           * split is ~9.5 % and the leg runs ~1.7 plant-h where a player who types 12 once takes
           * 1.36. 7200 s carries the ramp with ~17 min of slack, and leaves subcooling margin
           * near 14 degF when the next step shuts the spray. */
          cmd: { action: 'set_rhr_hx', pct: 12 }, hold: 7200,
          ramp: [{ action: 'set_rhr_hx', arg: 'pct', points: [7, 10, 12] }],
          acc: { p: 'tavg_c', op: '<', v: 93 },
          hl: ['Residual Heat Removal (RHR)'], hl_watch: ['Tavg'] },
        /* THE SPRAY COMES OFF HERE, NOT AT THE RCP STEP — see the note on that step. The plant
         * is cold by now, so the pressurizer shell has almost nothing left to give: MEASURED,
         * shutting the spray at 274.7 degF put pressure up 33 psi/min and cost the leg its RHR;
         * shutting it at Mode 5 moves pressure +1 psi per 5 plant-minutes. */
        { text: 'On the PRESSURIZER (PZR) card press OFF under SPRAY.',
          why: 'The plant is cold now and the pressurizer shell has given up most of its stored heat, so there is nothing left for the spray to take away. Shut it and pressure sits where it is. This is the lineup the Cold Shutdown preset holds: heaters off, spray in hand and shut.',
          control: 'Pressurizer Spray (PZR)', target: 'OFF lit under SPRAY',
          cmd: { action: 'set_spray', open: false }, hold: 60,
          acc: { p: 'spray_flow_pct', op: '<', v: 1 },
          hl: ['Pressurizer Spray (PZR)'] },
        obs('Verify Cold Shutdown: AVG COOLANT TEMPERATURE below 199 °F, RCP FLOW off, ALIGN lit on the RHR card.',
          { p: 'plant_mode', op: '~', v: 5, tol: 0.1 }, 'PRIMARY PRESSURE will be low — the spray took it there.', null,
          'This is the cold-shutdown picture: water below 199 °F, pumps off, RHR carrying the heat, pressure low with the spray shut. The heatup walkthrough takes it back up.',
          null, ['Tavg', 'Primary Pressure']),
        /* THE TILE THE TEXT NAMES, NOT THE VALVE *(OWNER, 2026-09-09 playtest, #684 §C: "Mode
         * 3>5 step 14 – this step has you look at the accumulators card but it highlights the
         * accumulator isolation valve. It should highlight the card, not the valve.")*.
         * This does NOT contradict the 2026-09-02 ruling three lines above CONTROL_LABEL_MAP's
         * 'Accumulator valve' entry ("Step 8 should highlight the valve for the accumulator, not
         * the accumulator box itself") — that governs the ACTION step, which asks you to shut a
         * valve. This is a CONFIRM step, and what it asks you to read is the tile. Both labels
         * were already in the vocabulary; only this step pointed at the wrong one. */
        obs('Verify the ACCUMULATORS tile reads 100 % and ISOLATED.',
          { p: 'accumulator_volume_pct', op: '>', v: 99 }, null, null,
          'You isolated the tanks on the way down so they would not empty into a depressurized plant. They have to still be full: the next heatup opens them again inside its window, and empty tanks then are a missing safety system.',
          null, ['Accumulators']),
        obs('Verify ALIGN is lit on the RHR card and HX SPLIT is above 0 %. The round trip is complete.',
          { p: 'rhr_valve_open', op: '>', v: 0 }, null, null,
          'RHR is the only thing removing heat now. If its suction valve shut, the decay heat would have nowhere to go. The heatup walkthrough is the way back.',
          null, ['Residual Heat Removal (RHR)']),
      ],
      guard: {
        never_melted: true,
        never: [
          { p: 'reactivity_pcm', op: '>', v: 0 },
          { p: 'subcooling_c', op: '<', v: 5 },
          { p: 'accumulator_volume_pct', op: '<', v: 99 },
          /* -600, not the retired pool's -150: securing the RCPs at the RHR handoff puts a
           * MEASURED -535 degC/hr transient on the Tavg indication (loop redistribution as
           * forced flow dies — the procedure's own act, ~1 min, while the leg AVERAGE runs
           * -51 degC/hr). The guard still catches the shock-cool class (a slammed-open HX
           * measured in the -800s on the retired plant). */
          { p: 'tavg_rate_c_per_hr', op: '<', v: -600 },
        ],
      },
      outcome: 'Mode 5, Cold Shutdown: water below 199 °F, RHR carrying the plant, reactor coolant pumps off, accumulators full and isolated, boron at the cold concentration. The heatup walkthrough takes it back up.',
    },
    /* ============================ THE TMI-2 INCIDENT WALKTHROUGH (#670 Phase 2) ============
     * *(OWNER, 2026-09-08: "plan the building of a three mile island incident walkthrough…
     * These walkthroughs will include another element the last walkthroughs don't have, these
     * ones will automatically trigger failures behind the scenes.")*
     *
     * PLAN: Blueprint/TMI_WALKTHROUGH_PLAN.md (rulings R1-R4, 2026-09-08). CLOCKS: every
     * `story.clock` is NUREG/CR-1250 Vol. II Pt 2 (Rogovin) Appendix II.1, extracted with a
     * verbatim quote per row into inbox/tmi_timeline_sourced.md. 04:00:36 and 04:00:37 are the
     * appendix's own wall clocks; every other clock is DERIVED by adding its elapsed time to
     * 04:00:37. Long-form account and the sources: Manuals/08_ACCIDENT_TMI.md.
     *
     * EVERY PLANT NUMBER BELOW WAS RE-MEASURED FULL-STACK ON THE AUTHORED CLOCKS, 2026-09-09
     * (inbox/tmi_phase2/MEASURED.md; the plan's §8b list). Phase 0's ride used the retired
     * validation §86's minutes; these are the crew's. Nothing had to move: all seven crew
     * commands were ACCEPTED at their sourced second, `beyond_model` never latched in 1,558
     * samples, and the plant reaches 260 min alive.
     *
     * FIVE THINGS THE PLAN ASSUMED THAT MEASURED OTHERWISE — each is carried in the step it
     * belongs to and every one is a plant fact, not a wording choice:
     *
     *  1. THE PORV STICK MUST BE ARMED WITHIN ~21 s OF THE FEED LOSS, so it is authored with
     *     the feed loss (now step 3) and NOT on the step that narrates the valve. Measured by
     *     arming at nine different seconds and reading the plant at t+300 s: armed at
     *     0/2/5/10/15/20 s the valve is still open (1045 psia, level 100 %, the accident);
     *     armed at 30/45/60 s the valve had already reseated and the plant sits at 1985 psia
     *     with level 41 % — no accident at all. The valve lifts at 5.5 s and reseats near 25 s.
     *     RE-MEASURED 2026-09-11 for the #693 split, which needed the exact cliff rather than a
     *     bracket: 21 s latches, 22 s does not. See step 3's own note for why 21 seconds is not
     *     a budget the narrated chain can spend.
     *  2. THE TAILPIPE NEVER EXCEEDS THE HOT LEG on this plant, so the plan's step-4 acceptance
     *     ("tailpipe > hot-leg temp") is unsatisfiable: 0 of 1,558 samples. It saturates at
     *     482 °F against a hot leg at 550-630 °F. Graded on an absolute instead — 240 °F, the
     *     sourced alarm point (App. II.1 E20, 239.2 °F), crossed at t+22 s against the report's
     *     30 s.
     *  3. LETDOWN IS ALREADY AT ITS HIGH LIMIT. `hot_full_power` boots with BOTH orifices in
     *     service (`control_state.letdown_orifice_a`/`_b` true) and the board's LETDOWN card
     *     offers nothing above A+B 7 %, so `set_letdown_orifices {a,b}` moves the flow 11.7 gpm
     *     -> 11.7 gpm (#679 corrected the figure from 12.7). The crew's second action of 04:05
     *     cannot be performed here; it is
     *     narrated in step 11 rather than faked (guide P1: never ask for a press that is already
     *     made).
     *  4. THIS BOARD HAS ONE REACTOR-COOLANT-PUMP HANDSWITCH (`sys.pumpTripped`, a single
     *     boolean), so the crew's two securings — loop B at 1 h 13 min, loop A at 1 h 41 min —
     *     are one press. Step 15 is that press, at loop B's clock, and carries the pair in its
     *     note; step 16 is the CONSEQUENCE at loop A's clock and carries no `crew` tag, because
     *     the tag is for a step that asks the player to repeat the crew's action and a
     *     verification asks for nothing.
     *  5. RCP FLOW IS USELESS AS THE SECURING'S ACCEPTANCE. It reads 16.4 % before the press
     *     and 16.3 % after (the void has already taken it), and only falls under 10 % at
     *     209 min. What changes at the press is the cavitation alarm, which clears on the next
     *     broadcast — so the step is graded on that plus SUBCOOLING MARGIN reaching the bottom
     *     of its scale, which is what makes the wait real. That second entry was PRESSURIZER
     *     LEVEL below 80 % until #788; see step 15's own note for the measurement that moved it
     *     off a channel two of the four named casualties freeze.
     *
     * PREVIEW-ONLY *(plan R4, ruled)*: `site/flags.js` carries
     * `procedure:pwr_tmi2_incident: 'preview'` until a layman and an operator playthrough both
     * complete it (plan §10 phase 3). It is NOT part of the six-leg operating cycle and names
     * no `next`; `run_checklist_pwr2`'s chain check and `verify_ckl_relevance`'s CYCLE both
     * treat the incident category separately. */
    {
      id: 'pwr_tmi2_incident', category: 'incident', manual_ref: 'PWR-E08',
      title: 'Three Mile Island Unit 2, 28 March 1979 — the first four hours, as the crew lived them',
      purpose: 'Walk the first four hours of the Three Mile Island Unit 2 accident as the crew lived them: what their board showed, what they concluded, and what they then did. The failures arrive on their own. About four and a half plant-hours.',
      from: 'hot_full_power',
      prereq: [
        'Plant at Mode 1, At Power: REACTOR POWER near 100 % with the turbine on line (auto-checked).',
      ],
      precond: [
        { p: 'power_pct', op: '>', v: 90, text: 'Reactor at power: REACTOR POWER above 90 %' },
      ],
      steps: [
        /* 1 — 04:00. The setup, said out loud (plan §9 R3, ruled 2026-09-08). Measured:
         * power_range 99.88 % at boot, so the acceptance ticks at once. Manuals/08 §1. */
        { text: 'Verify the plant is at full power: REACTOR POWER near 100 % with the TURBINE-GENERATOR carrying load.',
          note: 'The failures arrive on their own. The defeated trip is real on this plant and is defeated only here.',
          why: 'One protection channel is out of service before this begins: the reactor trip that fires when the turbine trips. Without it, pressure reaches the relief valve before the reactor trips — the order that morning went in.',
          story: { clock: '04:00',
            saw: 'A routine night, eleven hours into a run near full power. Two men were clearing a blocked condensate polisher in the basement.',
            knew: 'Nothing was wrong with the reactor.',
            did: 'They carried on with the polisher.' },
          inject: [{ failure: 'anticipatory_trip_failure' }],
          acc: { p: 'power_pct', op: '>', v: 90 },
          /* A VERIFY STEP RINGS WHAT IS READ, NOT WHAT IS PRESSED (#653 S-3b, 2026-09-15). This
           * carried `hl: ['Turbine Load']` with no `cmd`, so the opening step of the TMI-2 leg
           * pulsed the ACT-ON-THIS ring on the turbine card. The step reads two numbers; both are
           * watched. */
          hl_watch: ['Reactor Power', 'Turbine Load'] },
        /* 2 — 04:00:36, ONE SECOND BEFORE THE ACCIDENT. App. II.1 E1. NARRATED, NOT INJECTED
         * *(OWNER RULING, 2026-09-10: "All decisions as recommended", ratifying #693's option A)*:
         * this plant has no polisher model and the ruling declined building one. `Manuals/08`
         * §6.0 carries the declaration.
         *
         * AN OBSERVATION STEP — no `acc`, no `accs`, no `saw`, no `cmd` — so the instructor
         * meets it after OBSERVE_DWELL_S = 12 sim-seconds and then holds on Continue
         * (instructor_layer.js). That is the owner's "there can be steps where we just see what
         * happened to the indications".
         *
         * NO `pause` HERE, AND IT IS A RUNTIME FACT RATHER THAN A PREFERENCE. The pause is
         * requested only when something in this step's `inject`/`clear` NEWLY fires
         * (`_stepChecklist`, #694), so `pause: true` on a step that injects nothing is a dead
         * field — it would read as authored and do nothing. Nothing is lost: the step already
         * holds on Continue, and there is no event to miss.
         *
         * AND NO `hl` OR `hl_watch`, which makes this the ONE step in the pwr2 pool that
         * highlights nothing (#685 took the other four to zero). That is the honest answer here
         * rather than an omission: the polisher is not on this board in any form, so every label
         * available would point at something the step is not about. The `note` says so out loud
         * so a player does not go looking. */
        { text: 'No action. Read what has just happened in the basement, then press Continue.',
          note: 'Nothing on the board moves. The trouble is two rooms away, in the condensate system.',
          why: 'A condensate polisher cleans feedwater on its way back from the condenser — the last thing anyone would expect to start a core-damage accident. This plant has none, so this beat is told rather than simulated.',
          story: { clock: '04:00:36',
            saw: 'Water got into the instrument air line to the polisher valves and they shut. The condensate pump lost its flow path and tripped.',
            knew: 'A polisher blockage in the basement. Nothing was wrong with the reactor.',
            did: 'They carried on clearing the resin.' } },
        /* 3 — 04:00:37, t = 0. App. II.1 E2. THE INITIATING EVENT, AND THE STEP THAT ARMS THE
         * STUCK VALVE.
         *
         * WHY `stuck_porv_open` IS HERE AND NOT ON STEP 6 WHERE ITS NARRATION IS. The stick is
         * an ARM, not a force: `drivers.porv_stick` does nothing to a shut valve and latches on
         * the first lift while armed (`pwr2_pressurizer.js`). The valve lifts at 5 s and reseats
         * near 25 s, so arming it after that is arming it at a valve that will never lift again.
         * MEASURED on this tree 2026-09-11, full stack, arming at nine times after the feed loss:
         * 0/8/13/16/20/21 s all latch and give the accident (pressurizer pegged near 200 s,
         * 1045 psia at 5 min); 22/23/24/25 s NEVER latch and the plant sits at 1989 psia with
         * level 41.5 % — no accident at all. The cliff is between 21 and 22 seconds.
         *
         * That budget cannot be spent on a step the player leaves at their own pace. The pause
         * on THIS step costs nothing (sim time is stopped while they read), but the two steps
         * between here and the valve's own beat run live, and one tick at 600x is 60 sim-seconds
         * — so a player at speed would blow the window and get a walkthrough with no accident in
         * it. The INDICATOR failure goes on step 6 instead, where it is timing-insensitive and, as
         * it happens, more faithful: at TMI-2 the lamp read OPEN until the solenoid dropped out
         * at 13 s (E12), so a few seconds of an honest lamp is what the crew actually had.
         *
         * `saw`, not `acc`: live, the pause IS this step's completion and no predicate is
         * graded; the replay still has to prove the spike happened, and an `acc` read at the
         * step's END would be read after it. Measured: peak 2356 psia at t+7.4 s. */
        { text: 'No action. The condensate and main feed pumps have tripped. The clock stops here: read the board, then press Continue.',
          note: 'Watch PRIMARY PRESSURE once you press Continue: it peaks near 2340 psi about 6 seconds in and is falling again by 35 seconds.',
          why: 'The condensate pumps had nowhere to send water and tripped, and the main feed pumps went with them. Feedwater to both steam generators is gone, and the heat has one way out: the relief valve on top of the pressurizer.',
          story: { clock: '04:00:37',
            saw: 'Both main feedwater pumps tripped and the alarms came in a wall.',
            knew: 'A feedwater transient, which they had drilled.',
            did: 'They took the trip and watched pressure climb.' },
          inject: [{ failure: 'loss_of_feedwater' }, { failure: 'stuck_porv_open' }],
          pause: true,
          hold: 10,
          saw: { p: 'pressure_mpa', op: '>', v: 16.0 },
          hl_watch: ['Feed Flow', 'Plant Pressure'] },
        /* 4 — 04:00:37. App. II.1 E3, "Normal following trip of feedwater pumps". NO INJECT:
         * the turbine trips on its own, out of the feed loss, which is the point of narrating it
         * as its own beat. MEASURED: `turbine_tripped` at t+1 s. */
        { text: 'Verify the turbine has tripped: the TRIP button lit on the TURBINE-GENERATOR card.',
          why: 'A turbine cannot run without feedwater, so it trips within a second or two. The reactor should have tripped with it, but that channel is out of service, so it is still at power with nowhere to put its heat.',
          story: { clock: '04:00:37',
            saw: 'The turbine tripped, "normal following trip of feedwater pumps".',
            knew: 'The expected consequence of losing feed.',
            did: 'They moved to the post-trip checks.' },
          hold: 6,
          acc: { p: 'turbine_tripped', op: '>', v: 0 },
          hl_watch: ['Turbine Load'] },
        /* 5 — 04:00:37. App. II.1 E4: the auxiliary feed pumps start into valves already shut —
         * "Block valves EF-V12A and EF-V12B were closed."
         *
         * AHEAD OF THE RELIEF VALVE BECAUSE THE SOURCE PUTS IT THERE, which is a deviation from
         * #693's own table (it listed auxiliary feed last). E4 is at ELAPSED 0 s and E6, the
         * valve opening, is at 3 s; the reactor trip that follows at 04:00:45 is already step 7,
         * so narrating auxiliary feed after the valve would have run the story clock BACKWARDS
         * — caught by `run_checklist_pwr2`'s own monotonic-clock check on the first build of this
         * split (step 6 04:00:52 -> step 7 04:00:45), which is the #670 defect it was written for.
         *
         * TIMING-INSENSITIVE, unlike step 3's stick: MEASURED arming this at
         * 14/22/30/40/45/60/120/200 s after the feed loss, the accident is unchanged in every
         * case (pressurizer pegged 196-203 s, relief valve open, 1045 psia at 5 min) and the
         * generators still empty — at 200 s they bottom at 5.5 % instead of 0 %. So it can sit
         * on the step that narrates it.
         * MEASURED level: 65 % -> below 55 % within about 35 s of the feed loss. */
        { text: 'Verify the steam generators are drying out: STEAM GENERATOR LEVEL falling below 55 %.',
          note: 'AFW is auxiliary feedwater, the backup pumps that feed a steam generator when the main ones are gone. The AFW card shows its pumps running, which is not the same as flow, and nothing on this board draws the difference.',
          why: 'The auxiliary feed pumps started by themselves, as they are meant to, but their discharge valves are shut, so they deliver nothing. It took the crew eight minutes to find them.',
          story: { clock: '04:00:37',
            saw: 'The auxiliary feed pumps started automatically, and the board said so.',
            knew: 'The heat sink was being restored.',
            did: 'Nobody checked whether the water was getting past the block valves.' },
          inject: [{ failure: 'afw_failure' }],
          hold: 30,
          acc: { p: 'sg_level_pct', op: '<', v: 55 },
          hl_watch: ['AFW', 'SG Level'] },
        /* 6 — 04:00:40 / 04:00:50. App. II.1 E6 (the valve opens, 3 s) and E12: it is told to
         * shut at 2205 psig and does not —
         * "Valve did not close." — and "Light 'off' indicates solenoid deenergized. There is no
         * actual position indicator." The PHYSICAL stick was armed on step 3 for the measured
         * reason in that step's note; what fires HERE is the lamp, which is what the crew was
         * left reading. MEASURED on this tree: `porv_stuck` latches at t+5.1 s, so the valve is
         * already open and already failed when this step comes up. */
        { text: 'No action. The relief valve lifted and has not reseated. Look at the PORV lamp, then the temperature under it.',
          note: 'PORV is the relief valve on top of the pressurizer. Its lamp reads CLOSED from here on and it is wrong; the honest indication is the pipe below the valve, near 120 °F seated and climbing toward 480 °F when it is passing steam.',
          why: 'Pressure reached the relief valve setpoint and the valve opened, as designed. It did not shut again, and the lamp reads the solenoid rather than the disc — so the board says CLOSED on a valve that is open.',
          story: { clock: '04:00:40',
            saw: 'Pressure reached 2255 psi and the valve opened as designed. It was told to shut at 13 seconds, and its light went out.',
            knew: '"Light off indicates solenoid deenergized. There is no actual position indicator."',
            did: 'They read the dark lamp as a shut valve and moved on.' },
          inject: [{ failure: 'porv_indicator_stuck_closed' }],
          pause: true,
          hold: 6,
          /* ONE LABEL, ONE ELEMENT. 'PORV Status' resolves to the OPEN/CLOSED value tile, whose
           * rect sits INSIDE the valve's own art halo (measured at #684 §B: the valve's ring is
           * 541-604 x 171-232 client px, the tile 551-593 x 175-192) — naming both would draw a
           * dashed ring nested inside a dashed ring, which is the #684 §D / #607 item 1 defect
           * the owner has now reported twice. The valve alone already encloses the lamp. */
          hl_watch: ['Relief Valve (PORV)'] },
        /* 7 — 04:00:40 / 04:00:45. App. II.1 E6 (PORV, 3 s, 2255 psig) and E7 (trip, 8 s,
         * 2355 psig). MEASURED HERE: the valve lifts at 5.5 s / 2340 psia and the reactor
         * trips at 52.5 s on `ot_delta_t` — the DECLARED DIVERGENCE, and it lives in the `why`
         * where the plan put it. Manuals/08 §2. */
        { text: 'Verify the reactor has tripped: REACTOR POWER collapsing and the REACTOR TRIP alarm in.',
          why: 'At Three Mile Island the relief valve opened at 3 seconds and the reactor tripped 5 seconds later on high pressure. Here the valve is larger for the power it serves, so it turns the pressure first and the trip comes near 53 seconds.',
          story: { clock: '04:00:45',
            saw: 'Pressure spiked near 2255 psi and the relief valve opened as designed. Eight seconds in, the reactor tripped on high pressure.',
            knew: 'The plant was doing what a plant does after a feedwater trip.',
            did: 'They read the trip and moved to the post-trip checks.' },
          hold: 22,
          acc: { p: 'scrammed', op: '>', v: 0 },
          hl_watch: ['Reactor Power'] },
        /* 8 — 04:00:50 / 04:01:07. App. II.1 E12 ("Light 'off' indicates solenoid deenergized.
         * There is no actual position indicator.") and E20 (tailpipe alarm, 239.2 °F, 30 s).
         * MEASURED: 122 °F seated; crosses 240 °F at t+22 s, 300 °F at t+28 s, saturates 482 °F
         * and NEVER reaches the hot leg (trap 2 in the header). Manuals/08 §3. */
        { text: 'Verify the relief valve reading: the PORV light reads CLOSED, and the temperature under it is above 240 °F.',
          why: 'A seated relief valve leaves that pipe near 120 °F; a valve passing steam cooks it toward 480 °F. The pipe is the honest indication here, and the lamp is not.',
          story: { clock: '04:01:07',
            saw: 'The relief valve light went out at 13 seconds, which means the solenoid lost power. Thirty seconds in, the discharge line alarmed at 239 degrees.',
            knew: 'A hot discharge line was expected for a while after any lift.',
            did: 'They read the hot pipe as leftover heat and moved on.' },
          hold: 28,
          acc: { p: 'porv_tailpipe_temp_c', op: '>', v: 115.56 },
          hl_watch: ['Relief Valve (PORV)'] },
        /* 9 — 04:02:39. App. II.1 E31, ESF actuation on low RCS pressure (1600 psig).
         * MEASURED: hpi_active true at t+63 s. Manuals/08 §3. */
        { text: 'Verify safety injection has started by itself: the ECCS card shows the high-pressure pump running.',
          why: 'Pressure has fallen through the injection setpoint and the plant started the high-pressure pumps on its own. That is right: the plant is losing water through a valve nobody knows is open.',
          /* TWO BOARD READINGS THAT CONTRADICT THE STORY BLOCK AT THIS INSTANT (#670 Phase 3,
           * layman pass S-2 and S-3). Measured full-stack at the step's first tick:
           *   PRESSURIZER LEVEL 43.1 % and FALLING — 80.1 % at the end of the feed-loss chain and
           *   75.4 % at the reactor-trip step's (read before the #693 split moved those holds by
           *   a few seconds; the SHAPE is what this note is about), a minimum of 40.0 % 16 s into
           *   this step, back through 43 % at +29 s, 71.3 % at
           *   +90 s and pegged (>= 99 %) at t = 200 s. The crew's "climbing fast" is history and
           *   is four minutes early on this plant.
           *   ECCS FLOW 0 GPM while the pump reads running: `hpi_active` latches at t = 63.5 s at
           *   1658 psi, and the flow instrument stays EXACTLY zero for 23 s until pressure falls
           *   to 1393 psi at t = 86.5 s — the pump is deadheaded against its own 1389 psi
           *   discharge head, which the ECCS card prints as DISCG. Physical, and nothing said so. */
          note: 'Two readings look wrong and are not. PRESSURIZER LEVEL is FALLING here, bottoming near 40 % before it climbs — the direction is the point. ECCS FLOW reads 0 GPM because the plant is still above the pump discharge pressure; flow starts below about 1390 psi.',
          story: { clock: '04:02:39',
            saw: 'Pressure dropped through 1600 psi and the emergency injection started on its own.',
            knew: 'Pressurizer level was climbing fast at the same time, which their training said meant the system was filling.',
            did: 'They watched the level climb and prepared to stop the filling.' },
          hold: 30,
          acc: { p: 'hpi_active', op: '>', v: 0 },
          hl_watch: ['ECCS', 'HPI/LPI'] },
        /* 10 — 04:03:50. App. II.1 E33, "ESF emergency injection bypassed by operator". THE
         * PLAN'S §8b QUESTION: is the block accepted at this clock? MEASURED YES — accepted at
         * 193 s (P-11 wants pressure below 1972 psig and the plant is at 1044 psia). The
         * `overtaken` is the permissive coming BACK: above 1972 psi the plant revokes the block
         * itself, which is the #641 shape for a cmd-kind acceptance. Manuals/08 §3. */
        { text: 'Press TRIP BLOCKS on the ROD CONTROL card, then BLOCK on the SI REACTOR TRIP row.',
          crew: true,
          /* NOTHING ON THIS PANEL IS "LIT" (#670 operator pass 2, S-8). The row's LABEL never
           * changes; the ROW'S BUTTON does, and at THIS step it goes RED, not amber. Measured
           * on the live board after the press: the button text goes BLOCK -> `RELEASE?`, its
           * class goes `bd-blocked bd-willtrip` (#ff6a4d on #3a1010, the warning pair — not
           * the amber #ffd166 a plain block gets), and a caption appears reading "RELEASING
           * THIS WILL TRIP THE REACTOR NOW". The pressure permissive is already crossed here,
           * so this row can only ever be in the red branch. An operator told to look for
           * something "lit" and shown a red warning reads it as a failed press.
           *
           * SIX SIBLING SITES STILL SAY "lit" — pwr_startup 16/17/18, pwr_raise_power step 1
           * and its prereq, pwr_cooldown step 3. Those rows are NOT measured and by derivation
           * sit in the amber `bd-blocked`/`BLOCKED` branch, where "lit" is loose rather than
           * false. They are named in #670 rather than rewritten from a reading taken here. */
          control: 'Trip Blocks', target: 'SI REACTOR TRIP blocked — its button now reads RELEASE?',
          why: 'SI is safety injection, and the block is a permissive: the plant allows it only below 1972 psi. Blocking stops the plant restarting injection by itself, and nothing on the board says the core has just been put on the operator alone.',
          note: 'The row prints 1715 psi — where the safety-injection trip fires, not where the block is allowed. The block is a request, not a switch: above 1972 psi the plant takes it away again.',
          story: { clock: '04:03:50',
            saw: 'Pressurizer level climbing hard while pressure fell.',
            knew: 'Level and pressure were saying opposite things, and level was the gauge they trusted.',
            did: 'They took the automatic injection out of service before touching a valve.' },
          hold: 70,
          /* GRADED ON THE LINEUP TOO (#731, 2026-09-13) — the last command-graded trip block in
           * the pool. The `cmd` half stays (the replay issues it, and dropping it is what broke
           * `pwr_cooldown` for ten checks); the `p` half means a player who blocked SI before
           * reaching this step is not left waiting on a press the plant no longer needs. Taken
           * with develop's agreement — this leg is unowned in the #724 split. */
          accs: [{ cmd: { action: 'set_trip_block', trip_id: 'si_trip', blocked: true },
                   p: 'si_trip_blocked', op: '>', v: 0, label: 'SI actuation blocked' }],
          overtaken: { p: 'pressure_mpa', op: '>', v: 13.596,   /* 1972 psi exactly — U2: the
           * same figure the step text, the note and the cooldown leg's own block step all use */
            label: 'too late to block: PRIMARY PRESSURE is back above 1972 psi',
            text: 'This step is overtaken: PRIMARY PRESSURE has come back above 1972 psi, where the plant takes the safety-injection block away by itself. Go on to the next step.',
            industry: 'SI BLOCK REVOKED — P-11 PERMISSIVE CLEARED ABOVE 1972 PSIG. STEP SKIPPED.' },
          hl: ['Trip Blocks'] },
        /* 11 — 04:05:07 (E35, throttle) + 04:05:29 (E37/§II.A, letdown to its high limit).
         * MEASURED: the stop is accepted at 198 s; the reset window opens at 125.5 s
         * (`RESET.delay_s = 60`, Phase 0 measurement 4). The letdown half is NARRATED — see
         * trap 3 in the header. Manuals/08 §3. */
        { text: 'Press STOP on the ECCS card to shut the high-pressure injection down.',
          crew: true,
          control: 'ECCS', target: 'the high-pressure pump stopped, with PRESSURIZER LEVEL still climbing',
          why: 'The level was rising because the water was boiling: steam under the pressurizer pushes water up into it, so level goes up while the plant empties. Every operator of that era was trained that a solid pressurizer was the thing to avoid at all costs.',
          note: 'The plant refuses this press for about a minute after injection starts, while its reset timer runs.',
          story: { clock: '04:05:07',
            saw: 'Pressurizer level climbing toward the top of its scale, 255 inches and rising, with pressure falling at the same time.',
            knew: '"The condition to avoid at all costs is going solid." A pressurizer full of water leaves nowhere to control pressure from.',
            did: 'They throttled the injection valves, stopped a makeup pump and opened letdown to its high limit.' },
          cmd: { action: 'set_hpi', active: false }, hold: 90,
          acc: { p: 'hpi_active', op: '<', v: 1 },
          hl: ['ECCS', 'HPI/LPI'] },
        /* 12 — 04:06:28. App. II.1 E43, "Pressurizer level goes offscale high (greater than 400
         * inches)". MEASURED: pzr_level pegs at 100 % from t+205 s and holds it to 51.3 min.
         * Manuals/08 §3.
         *
         * THIS ROW HAS NO RELIEF AND THAT IS A FACT ABOUT THE BOARD, NOT AN OVERSIGHT (#788
         * adjudication, 2026-09-19 — do not re-open it without reading this). It is the step's
         * ONLY acceptance, so `implied_by` cannot reach it at all, and two of the four named
         * instrument casualties freeze the channel it grades: at 20.0 % the step is a soft lock
         * (MEASURED on the leg driven by its own injections, the criterion is met on 259 of 300
         * broadcasts and the frozen gauge refuses every one, against a true 100.00 %). Nothing
         * can cover it: of the 88 channels in a live broadcast only `pzr_level` and the derived
         * `pzr_level_dev` carry pressurizer level, `pwr_instruments._levelDev` builds the second
         * out of the FIRST READING so both die together, and MEASURED on the authored replay
         * `pzr_level_dev` is pinned at its +40-point range rail through the whole deception and
         * carries no information anyway. Every independent channel is already past its own
         * threshold BEFORE the level pegs — the margin has been at zero since t = 170 s and the
         * tailpipe on its 250 degC rail since t = 120 s against the peg at t = 220 s — so a
         * covering row would tick the deception step off before the deception appeared. The
         * honest fix is a relief declared against the named casualty itself, which
         * `run_checklist_pwr2` 2ag.7 measured is published in `active_failures`; that is a
         * mechanism and owes a ruling. */
        { text: 'Verify PRESSURIZER LEVEL has gone to the top of its scale and is sitting there.',
          why: 'The one gauge the crew had for how much water was in the plant now reads full while the plant empties. Level is not inventory: steam in the hot legs drives water up the surge line, so the pressurizer fills as the core loses water.',
          /* THE VESSEL IS DRAWN FULL HERE AND THAT IS CORRECT (#670 Phase 3, layman pass S-8).
           * The reviewer read "the plant empties" against a vessel graphic full of water and
           * called it a defect. Measured at this step: core coolant inventory 95.7 % -> 93.9 %
           * and `core_uncovered_frac` exactly 0.0, so the graphic (which since #516 item 6 reads
           * core uncovery + hot-leg void, NOT the mass fraction) is right. It drains later:
           * 50 % uncovered at 35 plant-minutes, 94.3 % at 103. */
          note: 'The vessel on the diagram is still drawn full, and that is right: about 6 % of the coolant is gone and none of the core is uncovered yet. Half of it uncovers near 35 plant-minutes.',
          story: { clock: '04:06:28',
            saw: 'The level indicator went off the top of its scale, past 400 inches.',
            knew: 'Their training said the only credible check on how much coolant was in the system was the pressurizer level.',
            did: 'They kept letdown wide open and injection off, working to bring the level back down.' },
          hold: 62,
          acc: { p: 'pzr_level_pct', op: '>=', v: 99 },
          /* GLOW THE TILE THE STEP NAMES (#670 operator pass 2, S-3). This read
           * `hl: ['Plant Pressure']` — the PRIMARY PRESSURE tile, one place left of the one
           * the instruction names — on the single step whose whole teaching point is WHICH
           * GAUGE IS LYING. Measured in the live board: the sole `.ckl-step-glow` element at
           * this step was "PRIMARY PRESSURE 1046 psi" while PRESSURIZER LEVEL read 100 %.
           * `run_manual_controls` could not catch it: it checks that an `hl` label RESOLVES to
           * a board item, and 'Plant Pressure' resolves perfectly — to the wrong tile. */
          hl_watch: ['Pressurizer Level'] },
        /* 13 — 04:06:27 (E42, saturation) and 04:10:37 (E56, first RCP high-vibration alarm,
         * "Indication of voids in system. Apparently not recognized."). MEASURED: the board
         * margin reaches 0 at t+165 s and `rcp_cavitating` latches at t+155 s — so BOTH CUES
         * STAND FROM 2.6 MINUTES, which is the 71-minute wait the `why` has to carry rather
         * than presenting them as fresh. Manuals/08 §4. */
        { text: 'Verify SUBCOOLING MARGIN has reached zero and the pump cavitation alarm is in.',
          why: 'Subcooling margin is how far the water is from boiling, and at zero it is not a margin any more. The pumps are pushing a froth of steam and water, which is what the vibration is.',
          /* THE CLOCK RUNS FORWARD (#670 Phase 3, layman pass S-7). This step was dated 04:10:37
           * on App. II.1 E56, the first pump high-vibration alarm, and the NEXT step is dated
           * 04:08:37 on the sourced auxiliary-feed discovery at 8 minutes — so the story clock
           * went BACKWARDS two minutes between what are now steps 13 and 14, and the reviewer lost confidence in
           * it for the rest of the run. The steps are not reordered (`test/manual_ui_map.js`'s
           * STEP_UI table is positional, and putting the saturation reveal after a 65-minute ride
           * would wreck the teaching order); instead this step takes the SATURATION cue's own
           * clock, E42 at 04:06:27, rounded to step 12's 04:06:28 because the two are one second
           * apart in the source and are two readings of the same instant. E56 is now named in the
           * `saw` as arriving four minutes later, which is what it did. */
          story: { clock: '04:06:28',
            saw: 'The coolant reached saturation — nothing left between it and boiling — and four minutes later, ten minutes in, the first reactor coolant pump high-vibration alarm came in.',
            knew: '"Indication of voids in system. Apparently not recognized."',
            did: 'They left the pumps running.' },
          hold: 130,
          /* 1 °F, NOT 0, and it is a bifurcation not a rounding (the standing #543 trap). The
           * plant sits AT saturation here for the next fifty minutes: true subcooling reads
           * exactly 0.00 and the board's derived margin hovers -0.2 to +0.3 °F on the two
           * lagged channels it is built from. `<= 0` passes or fails on the last bit, and the
           * replay grades the true value where the runtime grades the instrument, so the two
           * would not even flip together. */
          accs: [{ p: 'subcooling_c', op: '<=', v: 0.56, label: 'SUBCOOLING MARGIN at or below 1 °F' },
                 { p: 'rcp_cavitating', op: '>', v: 0, label: 'the pump cavitation alarm is standing' }],
          /* #685 — one of the four shipped steps that glowed NOTHING, and this is the one it
           * cost most: three of the most important observations of the accident pointed at no
           * board element. Watch, never press — the step asks for no action at all. */
          hl_watch: ['Subcooling Margin', 'Reactor Coolant Pumps (RCP)'] },
        /* 14 — 04:08:37. App. II.1 E49/E50. MEASURED: the player's own valve takes AFW flow
         * 0.000 -> 1.000 within 5 s, and the dry generators show level again about 9 plant-min
         * later (STEAM GENERATOR LEVEL 0 % at 8 min, 6 % at 17 min, 37 % at 73 min). Graded on
         * the LEVEL, not the flow: the level-hold automation channel throttles auxiliary feed
         * to 0.02-0.30 of rated for the rest of the ride, so a flow threshold asserted at the
         * step's end is a coin toss. THE HOLD IS THE 65-MINUTE RIDE to step 15's clock — a
         * step's `cmd` is issued at step START, so the wait belongs to the step BEFORE the one
         * that acts. Manuals/08 §4. */
        { text: 'Open the auxiliary feedwater block valves: click the valve symbol directly above the AFW card.',
          control: 'AFW', target: 'STEAM GENERATOR LEVEL back above 5 %, climbing off zero',
          why: 'The auxiliary pumps have been running eight minutes into shut valves, delivering nothing. Opening them puts the heat sink back: flow is rated within 30 seconds, and the dry generators take about 9 plant-minutes to show level.',
          note: 'One symbol here, two valves: one click opens both of the crew\'s.',
          wait_hint: 'The relief valve is still open the whole way. The plant takes 600× here; if it drops back to 60× on a pressure swing, press 600× again.',
          story: { clock: '04:08:37',
            saw: 'Low generator level, low steam pressure and high auxiliary feed discharge pressure — three cues to a blocked line.',
            knew: 'The auxiliary pumps were running. Nobody had checked whether the water was getting past the valves.',
            did: 'An operator found the two block valves shut and opened them.' },
          cmd: { action: 'set_afw_block', open: true }, hold: 3900,
          acc: { p: 'sg_level_pct', op: '>', v: 5 },
          hl: ['AFW'], hl_watch: ['SG Level'] },
        /* 15 — 05:13:37. App. II.1 E99 (loop B) and E111 (loop A, 1 h 41 min). ONE HANDSWITCH
         * on this board — trap 4 in the header. MEASURED: `rcp_cavitating` clears on the next
         * broadcast after the press (4380 -> 4381 s); RCP FLOW does NOT move (16.4 % -> 16.3 %,
         * trap 5), so it is not the acceptance. Manuals/08 §4.
         *
         * THE WAIT ENTRY WAS `pzr_level_pct < 80` UNTIL #788, AND IT WAS THE PRESSURIZER LEVEL
         * GAUGE DOING A CLOCK'S JOB. Two of the four named instrument casualties freeze that one
         * channel — `pzr_level_sensor_low` at 20.0 % and `pzr_level_sensor_stuck` at whatever the
         * gauge reads when the player clicks — so the entry broke in BOTH directions and the
         * direction depended only on the moment of the click. MEASURED on the leg driven by its
         * own injections (`hot_full_power`, seed 7, 60x, 300 broadcasts): frozen at 20.0 % the
         * entry is satisfied from the injection onward and ticks on 267 broadcasts the plant's own
         * truth did not satisfy — the player secures the pumps at ten minutes, which is exactly
         * what the entry existed to prevent; frozen while the gauge is pegged at 99.97 % it is
         * PERMANENTLY unmet and the step is a soft lock. No `implied_by` can relieve it: of the 88
         * channels in a live broadcast only `pzr_level` and the derived `pzr_level_dev` carry
         * pressurizer level (`pwr_instruments._levelDev` builds the second out of the first
         * reading), so the board has no second measurement of the quantity and any covering row
         * would be asserting something it cannot see.
         *
         * SO THE WAIT IS GRADED ON THE CUE THAT ACTUALLY DECIDES THIS ACTION. The step's own `why`
         * already says it — the pumps are pushing steam — and loss of subcooling, not pressurizer
         * level, is what tells an operator a reactor coolant pump has to come off. SUBCOOLING
         * MARGIN is a DERIVED channel (Tsat of the pressure gauge minus the T-avg gauge) and
         * refuses an instrument failure aimed AT IT silently, which `run_checklist_pwr2` 2ae.3
         * measures and pins — so neither pressurizer-level casualty can reach this entry.
         *
         * MEASURED on the authored replay (seed 42, 1 s per tick):
         *     SUBCOOLING MARGIN reaches its -28.00 degC (-50.4 degF) floor  t = 3420 s, 57.0 min
         *     PRESSURIZER LEVEL first below 80 %                            t = 3980 s, 66.3 min
         *     the cavitation alarm clears — the replay's press              t = 4400 s, 73.3 min
         * so both readings are long since met when the replay presses, the replay is unchanged,
         * and a live player who advances on the criteria waits 57.0 plant-minutes instead of 66.3.
         * The 9.3-minute difference is recorded rather than hidden: it is the price of grading a
         * channel the player cannot break, and it is still six times the ten-minute press the old
         * entry was written to stop.
         *
         * ⚠ IT IS NOT IMMUNE TO ALL FOUR CASUALTIES, AND THAT IS STATED HERE RATHER THAN
         * DISCOVERED LATER. A DERIVED channel inherits its INPUTS' casualties:
         * `tavg_sensor_failure` drifts the T-avg gauge upward without bound and the margin is
         * built out of it. MEASURED on the same driven rig with the drift injected at the
         * accident: this entry false-ticks from broadcast 24 (about 144 s in) and on 276 of 300
         * broadcasts the plant's own truth did not satisfy. THE LEG ALREADY CARRIED THAT EXPOSURE
         * ON THREE OTHER ROWS — steps 13 (286/300), 17 (276/300) and 19, which STRANDS on 289/300
         * — so this entry joins an existing family rather than opening a new one, and the trade
         * is a FALSE-TICK under one casualty for a SOFT LOCK under two. `run_checklist_pwr2`
         * 2ag.9 pins all four; 2ag.3's drift sweep could never see them, because it filters on
         * the `tavg` channel and these rows grade `subcooling_margin`. */
        { text: 'Press OFF on the reactor coolant pumps to secure them.',
          crew: true,
          control: 'RCP ON/OFF', target: 'the pump cavitation alarm clears',
          why: 'The pumps have been shaking for over an hour because they are pumping steam as much as water. Securing them is the right answer to a cavitating pump, and it also removes the only thing stirring the core.',
          note: 'One handswitch here for all the pumps. The crew stopped the loop B pumps at 1 hour 13 minutes and the loop A pumps 28 minutes later.',
          wait_hint: 'SUBCOOLING MARGIN reaches the bottom of its scale near 57 plant-minutes. That is the reading to wait for before securing the pumps.',
          story: { clock: '05:13:37',
            saw: 'Rising vibration on the loop B pumps, with flow and amperage falling away.',
            knew: '"Further operation could cause severe damage." The pumps had been running without suction head for an hour.',
            did: 'They stopped the loop B pumps, and the loop A pumps 28 minutes later.' },
          cmd: { action: 'set_rcp', running: false }, hold: 1680,
          accs: [{ p: 'subcooling_c', op: '<=', v: -27.778, label: 'SUBCOOLING MARGIN pegged on the bottom of its scale at -50 °F' },
                 { p: 'rcp_cavitating', op: '<', v: 1, label: 'the pump cavitation alarm clears' }],
          hl: ['RCP Run/Stop'], hl_watch: ['Subcooling Margin'] },
        /* 16 — 05:41:37, loop A's clock (E111) and §II.A's "circulation of coolant decreased
         * drastically, because natural circulation was blocked by steam". A VERIFY, and it
         * carries no `crew` tag — see trap 4. MEASURED: PRESSURIZER LEVEL crosses 50 % at
         * 94.9 min (72 % at 73 min, 45 % at 101 min), so this is the deception reversing.
         * Manuals/08 §4.
         *
         * SAME NO-RELIEF VERDICT AS STEP 12 (#788, 2026-09-19), and for the same reason: a SOLE
         * row on the one channel that measures the thing the step exists to observe. Frozen at
         * 20.0 % it FALSE-TICKS on 290 of 300 broadcasts the truth did not satisfy; frozen while
         * the gauge is pegged it is permanently unmet. A corroborating sibling would close the
         * false-tick half only if it arrived near the crossing, and MEASURED on the authored
         * replay the level reaches 50 % at t = 5800 s with every independent candidate either
         * long past its own threshold (SUBCOOLING MARGIN on its floor since t = 3420 s) or
         * separated from the crossing only by a number chosen to fit it (PRIMARY PRESSURE
         * 3.89 MPa / 564 psia here, 4.14 MPa / 600 psia 14 plant-minutes earlier). Read step 15's
         * note for the one row on this leg that COULD honestly move, and why this one cannot. */
        { text: 'Verify PRESSURIZER LEVEL is falling: below 50 % and still going down.',
          why: 'The gauge that read full for 48 minutes is falling now, and nothing has been put right: the plant is too empty to hold the pressurizer up any longer. From here the core boils and uncovers with the relief valve still open.',
          story: { clock: '05:41:37',
            saw: 'All four pumps off, and the loops going quiet.',
            knew: 'They believed the system was full, because the pressurizer had said so for the better part of an hour.',
            did: 'They kept feeding the steam generators and waited for a picture that made sense.' },
          /* THE ⏩ LINE IS THE REPLAY'S DWELL, NOT A TIME TO THE CRITERION (#670 operator pass,
           * S-6). Measured: the replay satisfies this step 1 s in and dwells 1,800 s anyway for
           * the narrative clock; a player who advanced on the criteria reaches it 756 s in. The
           * generated "About 30 plant-minutes" is therefore an upper bound on one route and
           * wrong by 40 × on the other, so the hint says to read the tile before waiting. */
          wait_hint: 'Read PRESSURIZER LEVEL before you wait — on a plant you have driven yourself it may already be below 50 %.',
          hold: 1800,
          acc: { p: 'pzr_level_pct', op: '<', v: 50 },
          /* #685 — glowed nothing. The deception REVERSING is the teaching point, so the level
           * tile is the watch target and the pressure tile beside it is what makes the reversal
           * legible: the two are saying the same thing at last. */
          hl_watch: ['Pressurizer Level', 'Plant Pressure'] },
        /* 17 — 06:11:37. App. II.1 E119, "Loop A hot-leg temperature offscale high… TAVE will
         * not be correctly shown." THIS PLANT'S HOT LEG NEVER PEGS (0-400 °C detector, whole-ride
         * peak 632 °F), so the pegged instrument here is the SUBCOOLING MARGIN, clipped at
         * -50.4 °F. MEASURED full-stack on the authored clocks: on the floor from 56.8 min to
         * 140.7 min, 504 of 1,558 samples. Manuals/08 §4. */
        { text: 'Verify SUBCOOLING MARGIN is pegged on the bottom of its scale at -50 °F.',
          why: 'This tile stops at -50 °F: the coolant is further past boiling than the instrument can show. The instrument has run out of scale, and the core is uncovering.',
          note: 'The margin reaches this floor near 57 plant-minutes and sits on it until the relief line is isolated — so it is almost certainly already there when you arrive.',
          /* NO GENERATED WAIT LINE (#670 operator pass, S-6). `hold` is the REPLAY's dwell, and
           * this step's acceptance is met on arrival on BOTH routes (measured: satisfied 1 s in,
           * replay and player alike), so "About 7 plant-minutes at 1×" sent the operator to the
           * speed bar for a step that was already done. */
          wait_hint: false,
          story: { clock: '06:11:37',
            saw: 'The loop A hot leg read off the top of its scale, so the average coolant temperature could not be shown correctly.',
            knew: 'Instruments were reading past their limits and the printer was hours behind.',
            did: 'They went on treating pressurizer level as the measure of how much water was in the plant.' },
          hold: 420,
          acc: { p: 'subcooling_c', op: '<=', v: -27.778 },
          /* #685 — glowed nothing. The instruction names one tile; it now points at it. */
          hl_watch: ['Subcooling Margin'] },
        /* 18 — 06:18:37. App. II.1 E122/E124 and Vol I p. 31 (Mehler). MEASURED: the close is
         * accepted at 8280 s; PRIMARY PRESSURE 647 -> 758 psia within 2 plant-min (above 750 at
         * 139.8 min), the tailpipe falls under 400 °F near 141 min and under 300 °F at 145.6 min,
         * and the subcooling margin leaves its floor at 140.9 min. THE HOLD RUNS TO STEP 15's
         * CLOCK (62 plant-min). The reopen/reclose cycles through 07:56 are NARRATED, per the
         * plan's recommendation — one closing, at 2 h 18 min. Manuals/08 §5. */
        /* ONE CLICK, AND THE SYMBOL IS LEFT OF THE PORV, NOT ABOVE IT (#670 Phase 3, layman pass
         * S-1 — the pass's one BLOCKING stuck point, ~11 of its 55 minutes). This step used to
         * read "click the block valve symbol above the relief valve, then confirm", and BOTH
         * halves were wrong:
         *   1. THERE IS NO CONFIRM. `comp_valve_vertical`'s hit circle emits a plain
         *      `onControl('toggle', st.openFrac < 0.5 ? 1 : 0)`; the only two-press confirms on
         *      this board are SCRAM (`pwr_board.js` paintScram) and a TRIP BLOCKS row that would
         *      trip the plant on release (#598 item 15). Measured headless on the real page, with
         *      the shell's `handleCommand` instrumented: one click emits `close_block_valve` and
         *      the valve SHUTS; a second click emits `open_block_valve` and it OPENS AGAIN. Ten
         *      clicks 0.4 s apart with the pointer never leaving the symbol gave ten commands,
         *      SHUT OPEN SHUT OPEN … — so a player who does what "then confirm" says undoes the
         *      only correct move of the morning. The reviewer's own re-measure (that a press is
         *      swallowed unless the pointer re-enters the symbol) is REFUTED: with a move away
         *      and back between the presses the result is identical.
         *   2. "ABOVE" IS THE WRONG DIRECTION. `pwr_board_data.js`: the block valve is at
         *      (825, 230) 40x40, the PORV at (905, 185) 30x65 — left of it and slightly below.
         *      It is upstream in the flow, which is presumably what "above" was reaching for. */
        { text: 'Close the PORV block valve: one click on the small valve symbol just left of the PORV.',
          control: 'PORV Block Valve', target: 'PRIMARY PRESSURE rising above 750 psi and the tailpipe temperature falling',
          why: 'This is the first correct move of the morning and it takes 2 hours 18 minutes to arrive. Closing the block valve isolates the relief line whether or not the relief valve is shut: pressure turns upward within about 2 plant-minutes and the discharge pipe starts cooling.',
          /* THE REOPEN/RECLOSE RECORD, CORRECTED (#670 Phase 3). This note said the crew "shut it
           * again three more times through 07:56", which the sourced sequence does not support:
           * shut 06:18, reopened 07:12, shut near 07:27-07:30, reopened 07:41 — and 07:56 is a
           * SAFETY INJECTION ACTUATION, not a closure. */
          note: 'One click shuts this valve and a second opens it again, so click once. The crew opened and shut it again twice more over the next hour and a half; this walkthrough closes it once.',
          /* NO POINT ESTIMATE ON THIS STEP (#670 operator pass 2, S-1). The generated line read
           * "About 62 plant-minutes at 1x", which is this step's `hold` — the replay harness's
           * dwell. Measured full-stack on two routes (advance the instant each acceptance is met,
           * and again holding step 10 to the 36 % steam-generator level the operator carried),
           * the pressure cue is met in 3.1 plant-minutes, 641 -> 993 psi. An operator playing it
           * live took 175, about 90 of them between 734 and 744 psi. Both are the plant; what
           * separates them is how much inventory and decay heat the route carried in. A single
           * number is wrong in both directions here, so the step gives the CUE and the shape
           * instead — which is what step 15's authored range does, and what the operator pass
           * singled out as the model the others should follow. */
          wait_est_s: false,
          /* THE AUTHORED HINT OVERRIDES THE GENERATED ONE HERE AND HAS TO SAY SO (#653 S-5). The
           * `hold` is 3720 s, so ui/app.js offers 600× on the same line; this step is the one
           * place in the pool where that rung is wrong, and the old wording put "600×" and
           * "use 60×" side by side with nothing to say which won. */
          wait_hint: 'Ignore the 600× above — this step is the exception. Pressure moves faster here than anywhere else in the run, so WARP will refuse it or drop out; use 60×. Watch for pressure turning upward and the pipe cooling, not the clock: it creeps a long while and then arrives quickly, so a flat gauge is not a stuck step.',
          story: { clock: '06:18:37',
            saw: 'The relief line discharge running about 30 degrees hotter than the safety valve discharge lines.',
            knew: 'A relieving shift supervisor set the pressurizer level aside and read the temperatures instead. His conclusion was that the relief valve was leaking.',
            did: 'He ordered the block valve shut, and pressure began to rise within minutes.' },
          cmd: { action: 'close_block_valve' }, hold: 3720,
          accs: [{ p: 'pressure_mpa', op: '>', v: 5.17, label: 'PRIMARY PRESSURE above 750 psi' },
                 { p: 'porv_tailpipe_temp_c', op: '<', v: 204.44, label: 'PORV tailpipe temperature below 400 °F' }],
          hl: ['PORV Block Valve'], hl_watch: ['Primary Pressure'] },
        /* 19 — 07:20:37. App. II.1 E167; NOT SUSTAINED historically (E172 reset at 3 h 27 min,
         * E178 pump stopped at 3 h 37 min, on the borated-water-tank low alarm — §II.A p. 30).
         * MEASURED: accepted at 12000 s; SUBCOOLING MARGIN back above 0 near 220 min and above
         * 10 °F at 222 min, reaching +25.7 °F at 260 min; inventory 19.6 % -> 81.1 %.
         * Manuals/08 §5. */
        { text: 'Press START on the ECCS card to put high-pressure injection back in.',
          control: 'ECCS', target: 'SUBCOOLING MARGIN back above 10 °F',
          why: 'Injection is the only thing that puts water back, and SUBCOOLING MARGIN says whether it is working. The crew did not sustain it: their borated water tank alarmed low, so they stopped the pump again 17 minutes later. Here it stays in.',
          wait_hint: 'Watch SUBCOOLING MARGIN, not the pressure. It leaves the floor within minutes and takes 30 to 70 plant-minutes to reach +10 °F.',
          story: { clock: '07:20:37',
            saw: 'Pressure low enough to justify starting the emergency systems by hand.',
            knew: 'The tank the injection water comes from had alarmed low, so injection felt like something to spend carefully.',
            did: 'They started a makeup pump, and stopped it again 17 minutes later.' },
          cmd: { action: 'set_hpi', active: true }, hold: 3600,
          acc: { p: 'subcooling_c', op: '>', v: 5.56 },
          hl: ['ECCS', 'HPI/LPI'], hl_watch: ['Subcooling Margin'] },
        /* 20 — the epilogue, on the sourced 19:50:37 restart (App. II.1 E347, "Adequate core
         * cooling now has been established"). MEASURED: the restart is ACCEPTED at 260 min and
         * RCP FLOW goes 0.0 % -> 96.2 % within 36 s; inventory 81 % -> 92 % and the margin
         * +23 -> +33 °F over the next 6 plant-minutes. THE DECLARED GAP (plan §2, R2 ruled) is
         * in the `why`: measured peak fuel temperature this ride is 1297 °F and the core reaches
         * 94 % uncovered without the cladding heating as a real one did. Manuals/08 §6. */
        { text: 'Press ON for the reactor coolant pumps to restore forced circulation.',
          control: 'RCP ON/OFF', target: 'RCP FLOW back above 80 %',
          /* THE RECOVERY IS REAL AND IT IS NOT IN 40 SECONDS (#670 operator pass 2, S-5). This
           * read "flow returns within 40 seconds and the margin and the inventory recover with
           * it", and an operator measured the opposite across the restart — subcooling +16 to
           * −8 °F, pressurizer level to 0 %, eight alarms standing at the completion card, the
           * step checking off with the margin negative. Both are right. Measured full-stack on
           * two routes: at the instant the step accepts, subcooling is 0.0 °F and the pressurizer
           * is at 5 %; ticked on from there it reaches +42 °F and 30 % over about 29 plant-
           * minutes. The recovery is the plant's, the 40 seconds is the pumps', and the sentence
           * had welded them together — so the last thing the walkthrough said was contradicted by
           * the board it handed back. */
          why: 'Forced flow returns within 40 seconds, but the margin and the inventory follow slowly — expect to hand the plant back with alarms still standing. Fuel damage, the containment radiation alarms and the hydrogen burn are outside this model and are told here rather than run. That gap is the fuel temperature: uncovering 94 % of this core never gets the fuel above 1130 °F, where the real one went far past 2500 °F.',
          note: 'Core damage, containment radiation and the hydrogen burn are not modelled on this plant. Everything up to this step was.',
          story: { clock: '19:50:37',
            saw: 'Nearly sixteen hours in, a pump started and ran satisfactorily. Core cooling was established.',
            knew: 'Almost nothing about the state of the core. The instrument that would have told them did not exist.',
            did: 'They kept the pump running. "All will grope in bewilderment for another whole day before the truth strikes."' },
          cmd: { action: 'set_rcp', running: true }, hold: 400,
          acc: { p: 'pump_flow_pct', op: '>', v: 80 },
          hl: ['RCP Run/Stop'], hl_watch: ['Subcooling Margin'] },
      ],
      guard: { never_melted: true },
      /* THE 1297 °F WAS THE FULL-POWER FUEL TEMPERATURE, NOT AN ACCIDENT PEAK (#670 Phase 3).
       * The figure came from a whole-ride maximum of `fuel_temp_c`, and this walkthrough STARTS at
       * 100 % power — so the peak it found was t = 0. Measured full-stack: 1298 °F at t = 0 with
       * the plant on line, and a post-trip maximum of 1130 °F (clad 1126 °F) at t = 13,772 s,
       * while injection refloods the core. Core uncovery peaks at 94.3 % and coolant inventory
       * bottoms at 7.4 %, so the uncovery half of the sentence stands. */
      outcome: 'Injection restored, forced circulation back and the relief line isolated. At its worst 94 % of the core was uncovered — and the fuel still never got hotter than it runs at full power, 1130 °F against 1298 °F on line before the trip. The real one went far past 2500 °F, and this plant stops short of it by design.',
    },
  ];

  // ---- RBMK (validated on BOTH versions) ----------------------------------
  var RBMK = [
    {
      id: 'rbmk_startup', category: 'startup',
      title: 'Reactor startup — approach to criticality',
      purpose: 'Bring the RBMK up from Hot Standby (subcritical) by withdrawing rods slowly — carefully, because at low power the reactor is touchy and the Operating Reactivity Margin (ORM) must stay healthy.',
      from: 'hot_startup',
      prereq: ['Hot Standby: subcritical, channel flow established.', 'ORM well above the minimum.'],
      cautions: ['Go carefully — the RBMK can accelerate on you at low power (positive void feedback).', 'Keep the Startup Rate (SUR) low and the ORM above the minimum (15 pre-1986 / 43 post-1986) throughout.'],
      steps: [
        obs('Confirm Hot Standby: reactivity below zero, channel flow up, ORM healthy.', { p: 'reactivity_pcm', op: '<', v: 0 }),
        { text: 'Primary view: hold Control Bank → Withdraw in bursts toward criticality (Rod Speed Norm to get moving, Slow near the crossing); watch the Startup Rate (SUR) and the Operating Reactivity Margin (ORM).',
          control: 'Control Bank', target: 'SUR low, ORM above minimum',
          note: 'Norm speed until the SUR stirs, then Slow — creeping the whole way multiplies the climb time several-fold.',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 30, speed: 'slow' }, hold: 340,
          saw: { p: 'startup_rate_dpm', op: '>', v: 0 }, acc: { p: 'power_pct', op: '>', v: 1 } },
        obs('Confirm a steady, controlled climb.', { p: 'melted', op: '<', v: 1 }),
      ],
      guard: { never_melted: true, never: [{ p: 'fuel_temp_c', op: '>=', v: 1200 }] },
      outcome: 'Reactor critical and climbing under control.',
    },
    {
      id: 'rbmk_raise_power', category: 'power',
      title: 'Raise power (reduce coolant flow)',
      purpose: 'In an RBMK, REDUCING coolant flow lets more steam form, which RAISES power — the opposite of a Boiling Water Reactor. Do it gently.',
      from: '50_percent',
      prereq: ['Reactor critical and stable at partial power.'],
      cautions: ['Small changes only — rising void adds reactivity (positive void coefficient); watch for oscillation.'],
      steps: [
        { text: 'Reduce the Main Circulation Pump (MCP) flow setpoint a little. On the Primary view, lower MCP / Channel Flow → Set %. More steam bubbles → more power.', control: 'MCP / Channel Flow',
          target: 'small power rise', cmd: { action: 'set_channel_flow', pct: 60 }, hold: 80, acc: { p: 'power_pct', op: '>', v: 51 } },
      ],
      guard: { never_melted: true },
      outcome: 'Power rises and settles at a new balance.',
    },
    {
      id: 'rbmk_shutdown', category: 'shutdown',
      title: 'Normal shutdown (AZ-5)',
      purpose: 'Shut down with the AZ-5 emergency-protection button. From full power (rods already out of the danger region) this is unconditionally safe.',
      from: 'full_power',
      prereq: ['At-power operation.'],
      cautions: ['A full-power scram is safe; a low-power / low-ORM scram is the Chernobyl trap — see the accident walkthrough.'],
      steps: [
        { text: 'Press AZ-5 (arm within 3 s, then confirm) to insert all rods.', control: 'AZ-5', target: 'power collapsing', cmd: { action: 'manual_scram' }, hold: 40, acc: { p: 'power_pct', op: '<', v: 8 } },
        obs('Confirm power has fallen; decay heat remains — maintain flow.', { p: 'melted', op: '<', v: 1 }),
      ],
      guard: { never_melted: true },
      outcome: 'Reactor safely shut down.',
    },
    {
      id: 'rbmk_mcp_trip', category: 'emergency',
      title: 'Loss of coolant flow (pump trip)',
      purpose: 'Main Circulation Pumps (MCP) have tripped and flow is coasting down. In an RBMK, less flow means MORE steam and MORE power — shut down promptly.',
      from: 'full_power',
      prereq: ['At-power operation.'],
      cautions: ['Do not wait — rising void raises power (positive coefficient).'],
      steps: [
        { text: 'Pumps trip — channel flow is coasting down and power is rising. (Failures tab → inject MCP Trip.)', control: '(observe flow / power)', target: 'diagnose',
          cmd: { action: 'inject_failure', failure_id: 'mcp_trip' }, hold: 6 },
        { text: 'Initiate AZ-5 promptly to shut the reactor down. (The protection may beat you to it — if the board already shows SCRAMMED, confirm rods in and continue.)', control: 'AZ-5', target: 'power collapsing',
          cmd: { action: 'manual_scram' }, hold: 40, acc: { p: 'power_pct', op: '<', v: 12 } },
        obs('Confirm shutdown and cooling on decay heat.', { p: 'melted', op: '<', v: 1 }),
      ],
      guard: { never_melted: true },
      outcome: 'Reactor safely shut down after loss of flow.',
    },
    {
      id: 'rbmk_chernobyl', category: 'accident', narrative: true,
      title: 'Chernobyl (1986) — an accident of design',
      purpose: 'Same actions, opposite outcomes: on the pre-1986 design the emergency-shutdown button briefly ADDS reactivity and the reactor destroys itself; on the post-1986 design the same action shuts it down safely.',
      from: 'low_power_xenon',
      steps: [
        obs('SETUP — Engine: RBMK (pre-1986). Initial state: Low Power + Xenon (accident). Primary view → EPS → Bypassed (or Failures tab → EPS Bypass Active). ORM is far below minimum.'),
        obs('With EPS bypassed and rods almost fully withdrawn, press AZ-5 (arm, then confirm). On the PRE-1986 design the graphite tips briefly ADD reactivity (positive scram effect).'),
        obs('That kick, amplified by positive void feedback at low power, drives a power excursion — the core is destroyed (steam explosion in the flagship suite).'),
        obs('COMPARE — switch Engine to RBMK (post-1986), same initial state and EPS bypass, press AZ-5 again: no positive kick; the reactor shuts down safely.'),
        obs('Note: peak magnitude is understated vs history (lumped kinetics); mechanism and divergent outcomes are faithful.'),
      ],
    },
  ];

  // ---- BWR ------------------------------------------------------------------
  var BWR = [
    {
      id: 'bwr_startup', category: 'startup',
      title: 'Reactor startup — approach to criticality',
      purpose: 'Bring the BWR up from Hot Standby (subcritical) by withdrawing rods to criticality; power ascension is then largely a recirculation-flow maneuver.',
      from: 'hot_startup',
      prereq: ['Hot Standby: subcritical, recirculation running.'],
      cautions: ['Watch the Startup Rate (SUR); once critical, use recirc flow to bring power up.'],
      steps: [
        obs('Confirm Hot Standby: reactivity below zero, recirculation established.', { p: 'reactivity_pcm', op: '<', v: 0 }),
        { text: 'Primary view: hold Control Bank → Withdraw to reach criticality and start the climb; the negative void feedback keeps it stable.',
          control: 'Control Bank', target: 'positive SUR, controlled climb',
          cmd: { action: 'rod_nudge', group_id: 'control', steps: 34, speed: 'normal' }, hold: 160,
          saw: { p: 'startup_rate_dpm', op: '>', v: 0 }, acc: { p: 'power_pct', op: '>', v: 1 } },
        obs('Confirm a controlled climb; raise recirculation flow to continue toward target power.', { p: 'melted', op: '<', v: 1 }),
      ],
      guard: { never_melted: true, never: [{ p: 'fuel_temp_c', op: '>=', v: 1200 }] },
      outcome: 'Reactor critical and climbing; ready to raise power on recirc flow.',
    },
    {
      id: 'bwr_raise_power', category: 'power',
      title: 'Raise power (increase recirculation flow)',
      purpose: 'The BWR way: MORE recirculation flow sweeps out steam bubbles, which RAISES power — the main power control, stable and self-limiting.',
      from: '50_percent',
      prereq: ['Reactor critical and stable at partial power.'],
      cautions: ['Recirc flow is the primary control; rods are for coarse/shutdown moves.', 'The flow throttle is powerful and this trainer has NO high-flux trip to save you: past ~32 on the dial you are above rated power, sustained. Small steps; let the foam settle between moves.'],
      steps: [
        { text: 'Increase the Recirculation (recirc) drive setpoint a modest step. Primary view → Recirc Drive → Set % — ask 28 (≈ 80% power). Fewer voids → positive reactivity → power rises and self-limits.',
          control: 'Recirc Drive', target: 'power ≈ 80%, below 90%',
          cmd: { action: 'set_recirc_flow', pct: 28 }, hold: 90, acc: { p: 'power_pct', op: '>', v: 55 } },
      ],
      guard: { never_melted: true, never: [{ p: 'power_pct', op: '>=', v: 95 }] },
      outcome: 'Power rises and settles at a higher balance — inside the band the exam will later demand.',
    },
    {
      id: 'bwr_shutdown', category: 'shutdown',
      title: 'Normal shutdown',
      purpose: 'Shut down with a fast rod insertion; decay heat continues and must keep being removed.',
      from: 'full_power',
      prereq: ['At-power operation.'],
      cautions: ['Decay heat persists — maintain core cooling / injection after shutdown.'],
      steps: [
        { text: 'SCRAM to insert all rods (fast hydraulic drive, ~3 s).', control: 'SCRAM', target: 'power collapsing',
          cmd: { action: 'scram' }, hold: 40, acc: { p: 'power_pct', op: '<', v: 5 } },
        obs('Confirm shutdown; keep removing decay heat.', { p: 'decay_heat_pct', op: '>', v: 3 }),
      ],
      guard: { never_melted: true },
      outcome: 'Reactor shut down; decay heat being removed.',
    },
    {
      id: 'bwr_sbo_rcic', category: 'emergency',
      title: 'Station blackout — hold with RCIC',
      purpose: 'All alternating-current (AC) power is lost. The steam-driven Reactor Core Isolation Cooling (RCIC) pump needs no AC — start it to keep the core covered while power is restored.',
      from: 'full_power',
      prereq: ['At-power operation.'],
      cautions: ['RCIC runs on battery control power + reactor steam; it buys hours, not days — plan to depressurize-and-inject before the batteries die.'],
      steps: [
        { text: 'All AC power is lost. (Failures tab → inject Station Blackout, or load initial state Post-Scram Station Blackout.) Recirculation and main feedwater are gone.', control: '(observe)', target: 'diagnose SBO',
          cmd: { action: 'inject_failure', failure_id: 'station_blackout' }, hold: 10 },
        { text: 'Scram the reactor if not already shut down.', control: 'SCRAM', target: 'power collapsing', cmd: { action: 'scram' }, hold: 5 },
        { text: 'Start Reactor Core Isolation Cooling (RCIC) — Secondary view → RCIC → On. It runs on reactor steam and battery power, no AC needed.',
          control: 'RCIC', target: 'vessel level held', cmd: { action: 'set_rcic', active: true }, hold: 300, acc: { p: 'vessel_level_pct', op: '>', v: 40 } },
        obs('Confirm the core stays covered — RCIC provides the grace window until battery depletion.', { p: 'melted', op: '<', v: 1 }),
      ],
      guard: { never_melted: true },
      outcome: 'Core held covered on steam-driven RCIC through the grace window.',
    },
    {
      id: 'bwr_fukushima', category: 'accident', narrative: true,
      title: 'Fukushima Daiichi (2011) — an accident of sustained support',
      purpose: 'The reactors scrammed safely, but the tsunami knocked out AC power for days. Steam-driven cooling bought hours — then the batteries died. Depressurize-and-inject vs not is the difference between a covered core and a meltdown.',
      from: 'post_scram_sbo',
      steps: [
        obs('SETUP — Initial state: Post-Scram Station Blackout (Fukushima), or inject Station Blackout at power then SCRAM. RCIC auto-starts and holds vessel level.'),
        obs('Fukushima Unit 1 path — Secondary view → Isolation Condenser (IC) → On: passive heat sink with no AC (DC valves). Holds core covered on decay heat until batteries deplete.'),
        obs('RCIC / IC buy hours — use Settings → time speed (e.g. 600×) to advance. When batteries deplete, steam-driven injection stops.'),
        obs('Without further action, decay heat boils the pool away and the core uncovers (flagship hold branch).'),
        obs('INTERVENTION — before uncovery: Secondary view → ADS → Trigger to depressurize, then LPCI → Start and/or Core Spray (LPCS) → Start. Core stays covered (intervention branch).'),
        obs('Note: simulation ends at fuel damage; containment/hydrogen events are described, not modeled.'),
      ],
    },
  ];

  /* pwr2 — the shipped plant's own pool (#526): the Mode 5 → full power → Mode 5 chain,
   * authored against PWR2 and measured on it. The pwr pool stays for the retired-engine
   * gates; the two share ids (same procedures, each plant's own numbers). */
  RD.MANUAL_PROCEDURES = { pwr: PWR, pwr2: PWR2, rbmk_pre: RBMK, rbmk_post: RBMK, bwr: BWR };

  /* ---- `from` IS THE SHIPPED PLANT'S IC NAME. The RETIRED engine needs a translation. -------
   * (#532, 2026-08-30.) `proc.from` is not documentation — `run_procedures.js:77` and
   * `procedures_harness.js:105` LOAD it, which a grep of ui/ and layers/ alone does not show. So
   * when PWR-N01's start state was corrected from `cold_shutdown` (which the shipped engine
   * refuses by name — there is no Mode 5, #524) to `hot_shutdown`, those two harnesses went red:
   * they drive `RD.PWREngine`, the RETIRED plant, where `cold_shutdown` is the right name and
   * `hot_shutdown` is a different, HOT state — so the heatup started at power and tripped on
   * overtemperature ΔT at step 9.
   *
   * ⚠ THE FIX IS A NAME TRANSLATION, NOT A CHANGED ASSERTION. Every harness keeps testing exactly
   * what it tested; only the IC label is mapped for the engine that uses the other vocabulary.
   * The alternative — reverting `from` — would have left the checklist a PLAYER RUNS declaring a
   * state their plant refuses, so that a gate aimed at a retired engine could stay green. That is
   * the #579 trap: a check pointed at the wrong plant defending the wrong plant's value.
   *
   * It lives HERE as a SIBLING of RD.MANUAL_PROCEDURES, not a property of it — that object is
   * iterated by profile name and a function on it broke every consumer at once. Beside the
   * procedures because both harnesses need it and there is no shared
   * test module — and a constant written down twice is the PROTECTION_DT trap.
   *
   * #524 (2026-08-31): PWR-N01's `from` is `cold_shutdown` again — BOTH engines now carry
   * that name, so the mapping below currently translates nothing. It stays, because the
   * vocabulary gap it bridges is still real (the retired engine has no `hot_shutdown`), and
   * deleting it re-opens the silent-red path the header describes the day any checklist
   * starts from the Mode 4 preset. */
  RD.RETIRED_ENGINE_IC = function (from) {
    return from === 'hot_shutdown' ? 'cold_shutdown' : from;
  };

})(globalThis.RD || (globalThis.RD = {}));

 