The steps should not include elements not included in my manual edits below except for highlights. some steps didn't get highlight entries but that doesn't mean the step doesn't get highlights.



**RULINGS RECORDED HERE SO THE NEXT RECONCILE DOES NOT UNDO THEM** (2026-09-15)

* **The 100 °F/hr heatup-rate limit stays OUT of the Mode 5 → Mode 3 walkthrough** *(OWNER RULING, 2026-09-14, on options put as "put it back in a step / put it in a note / leave it out": selected "Leave it out of the walkthrough")*. It used to live in that leg's leg-level cautions, which were retired from the pool; it did not go missing, it was ruled out. **The cooldown leg keeps its own 100 °F/hr** and the manuals are unchanged — do not "restore" the heatup one as a missing-content defect.
* **Step 8 of Mode 3 → Mode 1 gets a "counts steady" check-off** *(OWNER RULING, 2026-09-15: selected "add a steadiness predicate" from three options put to him — raise the count target to 12,000 / add a steadiness predicate / leave it as text — taking the one that needed new plumbing over the one-number change. A selection, not verbatim words; the rationale relayed with it is that a steady count rate is what an operator actually looks for and an absolute threshold is only a stand-in for it)*. The 7,000 counts per second target is HIS number and stays as the floor; 8b is added beside it, and the old 8a ("Point plotted") is now 8c. Measured: the live step used to accept 47 s after the rods stop with the 1/M prediction reading 213.7 against a true critical of 208; it now accepts at 506 s, prediction 208.8, and the authored 600 s replay hold clears the same predicate with 72 s to spare. Do not "simplify" 8b back out.
* **The four 1/M ladder steps are SEQUENCED SUBSTEPS: pull to the count, watch STARTUP RATE fall to zero, wait for the counts to flatten, plot** *(OWNER DIRECTIVE, 2026-09-15: "For the early-plot hole, we could have instructions for substeps not just one line of instruction then multiple substeps. We could give a line of instruction per substep. We instruct to pull rods to a count/however many steps. The next substep says to wait for the startup rate to stabilize. Once the startup rate hits a predetermined number that step checks off. Then have another substep to plot the 1/m point."; and on the sequence, (OWNER, 2026-09-15: "the operator watches the counts to get the count level then watches for the startup rate to get near zero."), and on the physics, (OWNER, 2026-09-15: "Our plant decays to near zero after burst and the counts flatten. It takes longer the closer to criticality we are."))*. Each rung carries four lettered rows, each with its own instruction, and the rows go live **one at a time** (`accs\_ordered`), so a press out of turn cannot CHECK THE ROW OFF. **It does NOT make the button deaf, and this line used to say it did** — REFUTED and corrected 2026-09-15 (#759): measured on the live card, pressing Plot point with the settle row unmet adds real points (1 → 2 → 3 circles, the panel refitting each time) at rod position 0, inside the trailing-three fit, removable only with `Clear`. The step's own note repeated the wrong claim to the player and has been rewritten.

  * **His observation is VERIFIED on this plant, both halves.** STARTUP RATE decays to zero after every burst (settled instrument mean 0.0004 / -0.0001 / -0.0003 / 0.0027 DPM) and both the rate and the counts take longer to settle nearer criticality: counts-steady at **223 / 226 / 281 / 507 s** after each burst, startup rate inside 0.02 DPM at **141 / 151 / 202 / 345 s**.
  * **STARTUP RATE is the row the player READS; the counts row is the row the plot WAITS on.** Measured: the rate enters its band **75 to 162 s before** the counts flatten on every rung, and the gap is widest on the last rung — the point the panel's trailing-three fit weights most. So grading the plot on the rate alone would reopen the early-plot hole. Both rows are kept, in his order, with the stronger one underneath.
  * **The 0.02 DPM band is the channel's own scatter, not a round number**: the instrument's detrended standard deviation over a settled 300 s tail is 0.0040 to 0.0043 DPM, so 0.02 is five standard deviations. A 0.08 or 0.10 band is satisfied 5 s after the burst on the first two rungs, before the rods have stopped, because the rate never exceeds 0.131 / 0.283 DPM there.
  * Holds grew from 150 s to **300 / 300 / 420 / 600 s** to cover the settle. Do not "simplify" the four rows back into one line.
* **RULED AND DONE — A VERIFY STEP WEARS THE STEADY RING** *(OWNER RULING, 2026-09-15: "Move them to the watch ring")*, which is option (b) below, built 2026-09-20 (#653 S-3b). Mode 5 → 3 steps 4 and 6 now carry TRIP and CLOSE in `hl_watch`; all three elements each step drew are still ringed, on one treatment instead of two, so your drawings below are intact — only the animation is gone. Mode 1 power ascension step 9 is fixed by the same `ui/app.js` change and needed no edit of its own. `run_manual_controls` now reddens on a pwr2 step that pulses a label without asking for a press, and the three real contingency presses (startup 3, 11, 12) declare `press_expected`. **The paragraph below is the record of the question, not open work.** ~~A VERIFY STEP STILL WEARS THE "PRESS ME" HALO ON MODE 5 → 3 STEPS 4 AND 6, AND THAT IS YOUR CALL, NOT AN AUTHORING SLIP~~ (raised 2026-09-15, #653 S-3b). The 2026-09-15 layman reviewer nearly pressed TRIP on step 4. MEASURED on the built pool: both steps carry no command, and `hl` draws the pulsing `.ckl-step-glow` — the same cue a step that really wants a press uses — on TRIP (step 4) and CLOSE (step 6). **Both rings are YOUR drawings**, recorded below as *"\[HIGHLIGHTED: TURBINE-GENERATOR CARD (steady), TRIP (pulsing)]"* and *"\[HIGHLIGHTED: STEAM DUMP CARD (steady), CLOSE (pulsing) …]"*, so they were not changed. **What changed is the TEXT**: both steps now open "Verify …, nothing to press", and the note says the ring marks a lamp to read. (The first draft read "— there is nothing to press here" on both and reddened `run\_style`'s **W2** check, which caps a step's instruction line at twenty words: 22 and 24. Shortened, not waived.)

  * **What you are deciding:** whether a verify step may use the pulsing ring at all. **Options:** (a) leave it — the ring marks the lamp, and the new wording says so; (b) give `hl\_watch` (steady dashed) these two labels, which needs a third ring state or an app.js change, because `stepHlLabels` falls back to the step's own `control` when `hl` is empty and both these steps would then pulse a different control; (c) add a "verify" ring of its own. **Recommendation: (b), via the app.js fallback fix** — the pulse/steady split is already the ruled vocabulary (#748) and a verify step is exactly the case the split exists for; the wording fix is a patch over a cue that still says the wrong thing. Absent a ruling the text fix stands and the rings stay.
  * The same shape on **Mode 1 power ascension step 9** cannot be fixed from the step data either: it authors no `hl`, and the fallback pulses its `control`. Two of the pool's nine surviving cases are this fallback.
* **The `Use <control>: <target>` rung is no longer drawn on the walkthrough card** *(OWNER RULING, 2026-09-14: "Hide it in the renderer")*. This file carries that rung on exactly one of the nineteen steps that name a control (Mode 5 → 3 step 2), so it was the renderer's addition. The step data still carries `control` on every step — it is the coverage key for the browser gate that checks the manual's control pill — and an observation step still draws its "Watch for:" line. This supersedes the 2026-09-02 ruling that the control had to sit outside the details fold.




---

## Where the steps live now

**The step text moved out of this file on 2026-09-15** *(OWNER DIRECTIVE, 2026-09-15: "I want to
be able to manually review and edit the steps for the walkthroughs easier. can you make a folder
within blueprints/ and create a new file for each walkthrough. each file will have the steps like
I have them in the walkthrough_steps_owner.md file. you can remove the steps from this owner file
and keep the instructions, rulings, etc. within it.")*

**One file per walkthrough, in `Blueprint/walkthrough_steps/`:**

| file | walkthrough id | steps | status |
|---|---|---|---|
| `01_mode5_to_mode3.md` | `pwr_heatup` | 17 | **AUTHORED — the authority for this leg** |
| `02_mode3_to_mode1.md` | `pwr_startup` | 17 | **AUTHORED — the authority for this leg** |
| `03_raise_power.md` | `pwr_raise_power` | 12 | extracted from the built pool, not yet authored |
| `04_lower_power.md` | `pwr_lower_power` | 6 | extracted from the built pool, not yet authored |
| `05_shutdown.md` | `pwr_shutdown` | 3 | extracted from the built pool, not yet authored |
| `06_cooldown.md` | `pwr_cooldown` | 15 | extracted from the built pool, not yet authored |
| `07_tmi2_incident.md` | `pwr_tmi2_incident` | 20 | extracted from the built pool, not yet authored |

**The two AUTHORED files carry his text byte-for-byte** — the move reworded nothing. They are
what a reconcile brings `ui/manual_procedures.js` DOWN to.

**The four extracted files are NOT yet authority and must not be treated as such.** They are a
rendering of what currently ships, made so there is something to read and mark up; the source
is still `ui/manual_procedures.js`. Each says so at its head. **Once he edits one, that file
becomes the authority for its leg** — and until he says he has, an agent treats the pool as
current and the file as a possibly-stale copy, never the reverse. Getting that backwards would
let an agent "restore" the pool to a snapshot nobody authored.

**This file keeps the instructions, the rulings and the open decisions above.** It is still the
place a ruling about walkthrough STEP TEXT gets recorded; it is no longer the place the text
itself lives. **`07_tmi2_incident.md` IS NOT LIKE THE OTHER SIX** *(OWNER, 2026-09-15: "add the tmi2
incident. i need to go through this one too.")*. It is a NARRATIVE walkthrough: every step
carries a story block — the clock time, and what the crew SAW, KNEW and DID — and the engine
flagship suite owns its physics, so the procedures harness never runs it. Three steps are
tagged **AS TAKEN** (`crew: true`): they record what the operators actually did that morning,
so a wrong decision can be shown without being taught as correct. Four steps fire failures
behind the scenes and two pause the sim on an event the player does not control. Its extract
renders all of that, because dropping the story block would leave the half that is not the
walkthrough.

---

## How to treat the files in `Blueprint/walkthrough_steps/`

**THEY ARE FOR STEP TEXT. KEEP THEM CLEAN.** *(OWNER, 2026-09-17: "the .md files with the text
from the walkthroughs are almost unreadable now with all the notes. These exist so that I can
easily edit what the AI creates for the walkthroughs, they are not intended to keep notes. You
can add a notes section to the end if you want but keep the text clean so i can easily edit
them.")*

They exist so he can read and edit the steps quickly. By 2026-09-17 agents had put a
fourteen-line header on every one and ten note paragraphs between the steps of the startup leg,
each recording a measurement or a ruling — individually defensible, collectively unreadable, and
they buried the only thing the file is for.

- **Never write a note between the steps.** If a change needs recording, put it under a
  `## Notes — agent record, NOT step text` heading at the END of the file.
- **The header is two lines.** Title, walkthrough id, and the one-line reminder. Nothing else.
- **A measurement belongs in `Diagnostic/`, a ruling belongs in THIS file, and a trap belongs in
  the code comment where someone would trip over it.** The step file is the last place any of
  them should live — it is the one document he reads to do his own work.

**Two things in the step files are NOT content and must never be "cleaned":**

- **The backslash escaping** (`pwr\_startup`, `\*\*bold\*\*`) — his editor's round-trip.
- **The tick and circle glyphs** *(OWNER, 2026-09-17: "The tick vs circle in my writing was
  because I was copy/pasting from the sim and what needed up in the document was whatever state
  it happened to be in the sim at the time. It has no special meaning.")*. A tick meant the row
  was checked off on his screen when he copied it. **Do not read them as intent, do not preserve
  them, and never change a step's kind to match one** — the kind is decided by what the step asks
  the player to do.

The step TEXT remains authority: the built pool comes down to it, and nobody reformats his prose.
