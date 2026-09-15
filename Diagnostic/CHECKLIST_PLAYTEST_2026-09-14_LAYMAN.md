> **Record, not policy.** Layman playthrough pass, **`pwr_startup` only**, run 2026-09-14 on
> `develop` at `800c3a53` (Alpha 1.7.4-rc25), headless Edge 1600x1000. One leg of six, played
> twice: Run A completed 18 of 18 with steps 7, 8 and 9 skipped by the reviewer's own overshoot;
> Run B replayed the approach cleanly and stopped at the end of step 10. Twelve stuck points —
> rod-position hints that read as increments (S-1); no recovery instruction when STARTUP RATE
> passes 1.0 (S-2); the SOURCE RANGE tile printing the target while the tick stays open (S-3);
> steps 9 and 10 disagreeing about which side of the prediction criticality is on (S-4); REACTOR
> POWER reading 0.0 for eight plant-minutes after criticality (S-5); step 14's "about 13 steps"
> measuring 25 (S-6); the overtaken note never clearing (S-7); step 18 reading a panel step 17
> told you to close (S-8); step 2 asking for something the same step says is already done (S-9);
> step 1's "steady, not climbing" against a tile that wanders (S-10); an unexplained alarm
> standing at T+00:00:00 (S-11); and the Plant & Mission window open on load under four names
> (S-12).
>
> **Every one was re-measured on this tree; all twelve survive — ten confirmed, two narrowed,
> none refuted. What the measurements refuted is the CAUSE attached to five of them:**
> (a) S-5 is **not a dead channel** — `power_range` climbs by a factor of **5,400**
> (1.87e-5 % to 0.101 %) across the wait, and the REACTOR POWER tile's `digits: 1` prints "0.0"
> below 0.05 %; (b) S-6 is **not step 14's step count**, which is right on the authored route
> (13 steps crosses 5 % in **22 s** from rod 214) — it is step 13's acceptance ticking while
> power is still falling, which releases the player at rod **196**, 18 steps deeper, where 5 %
> needs **25** steps; (c) S-2's "no warning at the moment it mattered" — the `sur_high` caution
> fires on the **same tick** STARTUP RATE crosses 1.02, at the stated limit; what is missing is
> the recovery (`INSERT` appears in **1 of 18** steps and **0 of 4** cautions); (d) §5's
> "anything inside a floating window is unringed" — `Plot point` **is** ringed, at 107×24, once
> the window is open; with the window shut the ring lands on a **0×0** hidden button, so nothing
> is drawn; (e) §5's "the board button is behind the window you are being asked to close" —
> `#oomWin` is `position: fixed` at (904, 90) 356×340 and the 1/M PLOT button is at (42, 325);
> at 1600×1000 they **do not overlap**.
>
> Measured by the coordinator: S-1, S-4, S-8, S-9, S-12. Measured in this pass: S-2, S-3, S-5,
> S-6, S-7, S-10, S-11, the §5 highlight pattern, and the S-12 overlay interception.
>
> **Screenshots:** 52, in the pass’s own scratch directory (`lp_20260914a/shots/`), referenced below by name. They are local to the run and are not carried into the repo.

# Layman playthrough — pwr_startup

**Build under test: Alpha 1.7.4-rc25, develop 800c3a53.** Headless Edge, 1600x1000,
`file:///C:/grok_build/Reactor_Dynamics/ui/shell.html?engine=pwr2`.
Persona: intelligent layman. I know what a pump and a valve are. Everything else had to come off
the panel text or the board.

I played the leg **twice**. Run A was the honest first attempt and it completed, but a wording
ambiguity at step 6 drove the reactor to STARTUP RATE +9.38 DPM against a stated caution limit of
1.0, which made the walkthrough skip steps 7, 8 and 9 and left the rest of the leg off its
intended track. Run B was started fresh from the same menu entry and played the approach the way
the step hints actually mean it, so I could see steps 7-9 at all and check whether the ambiguity
was mine or the text's. **It was the text's** — see S-1, which quotes the measurement that proves it.

---

## 1. Outcome

| Leg | Result | Steps completed | The one thing that mattered |
|---|---|---|---|
| `pwr_startup` — "Mode 3, Hot Standby → Mode 1, At Power — startup to power" | **Completed.** Panel: *"Walkthrough complete — Reactor critical in Mode 1, At Power, OUTPUT 10 MWe, IR HIGH FLUX and PR HIGH (LOW SETPT) both switched off. Ready for the power ascension."* Ended 10.4 % power, 10 MWe, Tavg 549 °F, 2217 psi. | 18 of 18 reached; **15 of 18 actually performed.** Steps 7, 8 and 9 were skipped by the walkthrough itself after my step-6 overshoot (Run A). Run B performed 1-10 including 7, 8, 9. | "**About 150 to 175 steps at MED**" means *end up at rod position 150-175*, not *move another 150-175 steps*. I read it the second way, took the reactor from 0.0 % to 16.7 % power with STARTUP RATE +9.38 against a stated limit of 1.0, and nothing on the screen stopped me or told me I had misread it. |

Run A: ~35 min wall, sim clock T+00:31:52 at completion. Run B: ~30 min wall, stopped deliberately
at the end of step 10 (sim T+00:19:18) once steps 7, 8, 9 and a clean criticality had been recorded
— Run A had already carried the leg to completion.

---

## 2. Stuck points, ranked by severity

### S-1 — "About N to M steps at MED" is a total rod position and reads as an increment. Cost: a reactivity runaway.

**Step 6, quoted:**
> "6. Hold WITHDRAW at MED until SOURCE RANGE settles above 1.4e3. Settle, press Plot point, then read the 1/M prediction."
> "6a ○ Counts settled above 1.4e3 (1,400 counts per second)"
> "About 150 to 175 steps at MED."

**What I did.** Step 5 had said *"About 90 to 110 steps at MED"* and I had finished step 5 at rod
position **101**. So "about 150 to 175 steps" read to me as the size of the next pull, exactly as
the first one had. I set 10x, held WITHDRAW, and released at **258 / 627**. Measured on the way
out (`shots/27_withdraw2.png`, full trace in the per-step log): counts crossed 1.4e3 at rod
**158** — 57 steps in, not 150. By rod 239 SOURCE RANGE read 5.0e4; by rod 246 the detector had
secured itself and STARTUP RATE was **+4.41 DPM**; it peaked at **+9.38 DPM**
(`shots/28_after_runaway.png`). The alarm *"Startup Rate High · reactivity · caution"* fired at
T+00:19:08. Power ran to **16.7 %** against a reactor trip at 35 %.

The walkthrough's response was to jump **from step 6 straight to step 10** and print, in the space
under the step: *"This point is overtaken: SOURCE RANGE switched itself off above 1.0e5 (100,000)
counts a second, so the reactor is critical or about to be. Stop withdrawing and go to the
criticality step."* Steps 7, 8 and 9 were never shown to me at all on that run.

**Proof it is the text and not my carelessness.** In Run B I stopped where the counts said to. Rod
position at 1.4e3 counts = **151**. Step 7 then said *"About 180 to 205 steps at MED"* and 3.0e3
counts arrived at rod **192**. Step 8: *"About 195 to 220 steps at MED"*, 7.0e3 at rod **208**.
Step 9: *"About 205 to 225 steps at MED"*, 2.0e4 at rod **215**. Every one of those numbers is a
**total position**, and they land inside the quoted band. They only look like increments at step 5,
where the rods start at 0 and the two readings happen to coincide — which is exactly the step that
teaches you how to read the later ones.

**What would have unstuck me:** write it as a position — "stop at about **rod position** 150 to 175
(the CONTROL ROD POSITION number on the card)" — because that is what every one of these lines means.

**Measured:** The BUILT pool (`RD.MANUAL_PROCEDURES.pwr2`), not the source file. The five notes are “About 90 to 110 / 150 to 175 / 180 to 205 / 195 to 220 / 205 to 225 steps at MED”, while the same steps' `cmd.steps` are INCREMENTS of 94, 63, 31, 14 and 9 — cumulative rod positions 94, 157, 188, 202, 211, which is what the replay drives. The reviewer's crossings (151, 192, 208, 215) fall inside each quoted band read as a POSITION. Coordinator, 2026-09-14.
**Verdict:** confirmed — and the trap has a name: at step 5 the increment reading and the position reading COINCIDE, because the rods start at 0. The step that teaches the idiom teaches it wrong, and step 6 collects on it.

### S-2 — Nothing anywhere tells you what to do when STARTUP RATE goes over 1.0.

**Caution 1, quoted:**
> "Keep STARTUP RATE under 1.0 for the whole approach. It is the speed limit; the rod position is not. Near critical, one control-bank step adds about 8.1 pcm of reactivity."

**Step 8 reinforces it:** *"above it you are outrunning the plot, and nothing in the plant slows the
rise for you yet."*

**What I did.** STARTUP RATE reached **+9.38 DPM**, an alarm fired, and the walkthrough put me on
step 10, whose instruction is *"Press SLOW and hold WITHDRAW to the position the 1/M panel predicts,
then tap one step at a time"* — i.e. it told me to **withdraw further** while the reactor was
already running away, and its Continue button was **already lit and green**. The recovery (stop
pulling, hold INSERT) is written nowhere; I had to invent it. Step 13, three steps later, is the
first mention of INSERT — *"hold INSERT until REACTOR POWER stops rising and is below 5 %"* — by
which time I had ridden to 16.7 %.

**What would have unstuck me:** one conditional line attached to the caution and to steps 6-10:
"if STARTUP RATE goes above 1.0, stop withdrawing and hold INSERT at MED until it reads negative."

**Measured:** Built pool: `INSERT` appears in **1 of 18 steps** (step 13) and **0 of 4 cautions**; no step between 6 and 10 says what to do when the limit is exceeded; the 1.0 limit itself is repeated only in steps 8 and 10. Plant, full stack (`pwr2` / `hot_zero_power`, 10×, one uninterrupted MED hold): STARTUP RATE crosses 1.0 at t = 298 s, rod 214, and `sur_high` (“Startup Rate High”, **priority caution**, setpoint 1.0 DPM) goes `active_unacknowledged` on **that same tick**. The hold ran on to a peak **10.00 DPM** and ended in a reactor trip.
**Verdict:** narrowed — the observation stands, one half of the diagnosis does not. The plant DOES warn, at exactly the stated limit and with no delay (the reviewer's “the alarm arrived at +2.96” is their 10-sim-second sampling interval, not a late alarm), and it warns as a *caution*, which by design does not drop the clock. What is genuinely absent is the recovery: the walkthrough's answer to an overshoot is step 10, whose imperative is “hold WITHDRAW”.

### S-3 — The board reads exactly the target number and the tick stays open.

**Step 6 acceptance:** "6a ○ Counts settled above 1.4e3 (1,400 counts per second)"

**What I did (Run B).** I stopped at rod 151. SOURCE RANGE read **`1.4e3`** on the board and sat
there, flicking between `1.3e3` and `1.4e3`, through 21 s of steady watching with the rods still
(`shots/52_step6.png`). **6a stayed unticked.** There is no way on the board to tell 1,370 from
1,400: the readout is two significant figures and the acceptance is not. I pulled six more steps
blind until it cleared at rod 157 (`1.6e3`). A beginner who trusts the number they can read is
stuck with nothing on screen saying why.

**What would have unstuck me:** state the target at the precision the board shows — "above 1.5e3" —
or put the unrounded count somewhere readable.

**Measured:** Full stack, `pwr2` / `hot_zero_power`, seed 42, stopping the withdrawal the instant the tile first prints `1.4e3` — the reviewer's own rule. The stop lands at rod **154**: true counts **1321**, instrument **1375**. Held 21 s with the rods still, true counts crept **1328 → 1399** and the acceptance (`sr_counts_cps > 1400`) **never closed**; truth crossed 1400 at **+22 s**, one second past the reviewer's watch window. Over those 21 s the tile printed `1.4e3` on 12 samples, `1.3e3` on 6, `1.2e3` on 1 and **`1.5e3` on 2** (truth 1349 and 1365 — the board read HIGHER than the target while the tick was open). Two causes: (1) `fmtExp` (`ui/diagram/board/pwr_board_wiring.js:1630`) is `mantissa.toFixed(1)`, so `1.4e3` is drawn for anything in **[1350, 1450)** and the 1400 threshold sits in the middle of that band — the same holds for all five count targets (7.0e2, 1.4e3, 3.0e3, 7.0e3, 2.0e4); (2) **the tile and the tick are not on the same channel** — the tile draws `IN(s).source_range`, the pwr instrument (lag 0.5 s, noise 0.02, log; `pwr_config.js:2614`), while the acceptance grades `true_state.sr_counts_cps`, because pwr2's `PARAM_INSTRUMENT` map has **no `sr_counts_cps` entry** (the documented exception, `layers/instructor_layer.js:47-51`). Divergence over the hold: instrument 1247–1485 against truth 1328–1399, worst single sample **+116 counts (+8.6 %)**. `node test/run_checklist_pwr2.js pwr_startup` is **27/27** and its step 6 ends at 1559 counts, because the replay drives a fixed 63 steps instead of stopping on the board.
**Verdict:** confirmed, cause sharpened — it is not only two significant figures. The board's number and the step's number come off **different channels**, one noisy and one not, and the rounding band is centred on the threshold. At the moment the tile says you have arrived, the graded value is on average below the target and can be 8.6 % away in either direction.

### S-4 — Steps 9 and 10 give opposite advice about which side of the prediction criticality is on, and step 9 contradicts itself.

**Step 9 background:** *"Criticality arrives a little before the predicted position, on this plant
between about 226 and 238 of 627."*
**Step 10 body:** *"The prediction reads about ten steps low at the end of the approach, so the
reactor is not yet critical at that position."*

**What I did.** Step 9 had just told me to "Write down the position the panel predicts". It said
**"predicted criticality ≈ step 220 (35.1 % withdrawn)"** (`shots/61_step10_clean.png`). Step 9 says
criticality is *before* 220; step 10 says it is *after*. Step 9 also names 226-238, which is after
220 — so step 9 disagrees with itself in the same sentence. Measured: at rod **220** the reactor
met step 10's own definition of critical (counts climbing, STARTUP RATE +0.49 steady with the rods
still) and kept climbing there. For a beginner the *direction* of that error is the entire safety
point of an approach to criticality.

**What would have unstuck me:** delete "a little before" from step 9, or make both lines say
"criticality arrives a few steps **past** the prediction".

**Measured:** Built pool — a flat contradiction that needs no plant run. Step 9 `why`: *“Criticality arrives a little **before** the predicted position, on this plant between about 226 and 238 of 627.”* Step 10 `note`: *“The prediction reads about ten steps **low** at the end of the approach, so the reactor is not yet critical at that position.”* Opposite directions — and step 9's own 226–238 is AFTER the 220 the panel predicted. Coordinator, 2026-09-14.
**Verdict:** confirmed — two authored sentences disagree about which side of the prediction criticality falls on, and one of them disagrees with itself.

### S-5 — After criticality, step 10 sits with REACTOR POWER pinned at 0.0 % and Continue dark for minutes, while its own text says you are already critical.

**Step 10 acceptance:** "○ When REACTOR POWER > 0.1 %"
**Step 10 body:** *"Critical is when the counts keep climbing and STARTUP RATE stays positive with
the rods still."* … *"Stay at 1x from here until power settles near 1 %."*

**What I did (Run B).** At rod 220 SOURCE RANGE secured itself (9.9e4 → 4.5e2 → 1.0e0 over six
seconds), STARTUP RATE held **+0.43 to +0.49** rock steady with the rods stopped — and then nothing
happened for **8.4 plant-minutes**. Measured, at 1× as the step insists: rods reached 220 at sim
**T+00:10:52**; REACTOR POWER read **`0.0` until T+00:17:30**, then **`0.1`**; Continue finally lit
at **T+00:19:18**. So for roughly seven minutes the only thing on the board that moved was a steady
STARTUP RATE. The step's own test for critical was fully satisfied and its checkbox disagreed, and
the same step forbids speeding the clock up. A player is left staring at a `0.0` and an unlit
button, told not to accelerate, with no way to know whether they are waiting correctly or have
missed a press.

**What would have unstuck me:** grade the step on the thing the body says it is graded on (STARTUP
RATE positive with the rods stopped), or print "power is still below the readable range — this takes
about N plant-minutes."

**Measured:** Reproduced at the reviewer's own numbers (full stack, rods stopped at **220**, STARTUP RATE **0.42 to 0.49** against their +0.43 to +0.49, clock at 1× as the step demands). `power_range` climbs **continuously** throughout — 1.87e-5 % → 0.101 %, a factor of **5,400**, never flat. The REACTOR POWER tile is `digits: 1` (`ui/diagram/board/pwr_board_data.js`) rendered `toFixed(1)` (`comp_indicator_panel.js:433`), so it prints “0.0” below 0.05 %; it first prints `0.1` at **+456 s (7.6 plant-min)**. The acceptance `power_pct > 0.1` is met at **+497 s = 8.3 plant-minutes** — the reviewer saw Continue light 8.4 plant-minutes after the rods stopped, a six-second match. The step's own `why` and `target` define critical as “STARTUP RATE positive and steady with the rods stopped”, satisfied at **+0 s**, 497 s before the tick. At the neighbouring value — rods to 231, STARTUP RATE 1.35 DPM — the same wait is **156 s = 2.6 minutes**.
**Verdict:** confirmed, diagnosis replaced — the channel is alive and moving by a factor of 5,400; the readout has no resolution there, and the acceptance sits one more doubling above the first digit the tile can show. The step is graded on a number its own body says is not the test. And because the wait is (decades below 0.1 %) ÷ STARTUP RATE, **obeying caution 1 maximises it**: 8.3 minutes at 0.45 DPM against 2.6 minutes at 1.35.

### S-6 — "About 13 steps" at step 14 was 26, and the walkthrough never re-anchors its step counts after an overshoot.

**Step 14:** "Press SLOW, then hold WITHDRAW until REACTOR POWER passes 5 %, about 13 steps. That is
Mode 1, At Power."

**What I did.** Pressed SLOW and held for exactly 13 steps — rod 196 to 209, 98 s at 1x. Power went
**down**, 4.2 % to 3.1 %, because the plant was still coasting down from step 13's insertion. A
second 13-step pull (to rod 222) got 5.1 %. Nothing in step 14 hedges the count, although step 13
immediately above it *does* hedge its own ("About 14 steps if power is near 1 %, more if it ran
ahead"). Following step 14 literally moved the plant away from the acceptance and gave no signal
that anything was wrong.

**What would have unstuck me:** step 14 saying "more if power is still falling — watch REACTOR
POWER, not the step count."

**Measured:** Two routes, full stack. (1) The AUTHORED route — the pool's own `cmd`/`hold` sequence — ends step 13 at rod **214**, power 4.68 % and flat (STARTUP RATE −0.03); step 14's 13 steps then take 94 s and power crosses 5 % at **+22 s**, after about three steps. Power never falls (the 4.60 % minimum at +3 s is instrument noise; truth rose monotonically). (2) THE PLAYER'S ROUTE — holding INSERT on step 13 and releasing the instant its acceptance `power_pct < 5` ticks — releases at rod **196** (the reviewer's exact rod 196) with power **4.91 % still falling at −0.60 DPM**, i.e. **18 steps deeper** than the authored route. Step 14's 13 steps then take 94 s and power goes **4.91 % → 3.43 %, DOWN 1.47 points** (reviewer: 4.2 → 3.1), bottoming at 3.38 % at +83 s. It crosses 5 % only at rod **221 — 25 steps** from the step-14 start (the reviewer counted 26). Left alone at rod 209 after the first 13 steps, power falls monotonically for the whole 15 minutes measured, reaching 1.28 %.
**Verdict:** confirmed, and the cause is one step earlier than filed. “About 13 steps” is correct from the position the authored route leaves you at; it is the walkthrough's own step-13 grading that does not leave the player there. Step 13's text says power “stops rising **and** is below 5 %” and its acceptance tests only the second half, so the player releases INSERT into a falling plant and over-inserts by 18 steps. The reviewer's surprising half — withdrawing made power go DOWN — is real, reproduced at 1.47 points, and is coast-down from that over-insertion swamping 13 steps of withdrawal.

### S-7 — A stale message from step 10 stayed on screen through steps 16, 17, 18 and the completion card.

**What I did.** The "This point is overtaken: SOURCE RANGE switched itself off above 1.0e5 (100,000)
counts a second, so the reactor is critical or about to be. **Stop withdrawing and go to the
criticality step.**" note appeared at my step-6 overshoot and then never went away. It is on screen
under the TRIP BLOCKS step (`shots/44_tripblocks.png`) and under the green **"Walkthrough complete"**
card (`shots/49_finished.png`), where it tells a finished player to stop withdrawing and go to the
criticality step. I had no way to tell whether it was current advice, an error, or something I had
failed to do.

**What would have unstuck me:** clear the overtaken note when the step that raised it is left.

**Measured:** Driven in the live Path 3 runtime (`start_checklist pwr_startup`, a real overshoot to `sr_energized < 1` at rod 242, then Continue through to the end): `snapshot.instructor.message` still carries the full overtaken text — *“This point is overtaken: SOURCE RANGE switched itself off… Stop withdrawing and go to the criticality step.”* — at steps **10, 11, 12, 13, 14, 15, 16, 17, 18 and on the COMPLETE snapshot**. Nine consecutive step advances plus the completion card. `ui/app.js:3573` paints exactly that string into `#instrCurrent`. The mechanism: the follow-mode advance clears it (`this.pendingMessage = null`, `layers/instructor_layer.js:601`), but the Path 3 checklist advance — `_checklistCheckOff` (`:966`), which is what the Continue button AND the overtaken skip both use — resets ten per-step fields and **does not touch `pendingMessage`**.
**Verdict:** confirmed — and it is not specific to the overtaken note. Any instructor message raised on a Path 3 walkthrough step outlives every later step, because only one of the two advance paths clears it.

### S-8 — Step 18 asks you to read a panel that step 17 told you to close.

**Step 17:** "…then close the panel. … Close the panel with TRIP BLOCKS again: it covers the rod buttons."
**Step 18:** "Verify Mode 1: REACTOR POWER 10 %, OUTPUT 10 MWe, IR HIGH FLUX and PR HIGH (LOW SETPT)
both lit." with the hint "Both rows are on the TRIP BLOCKS panel."

**What I did.** Closed the panel as instructed, then found step 18 asking me to read two rows that
only exist on it. Step 18's Continue was already lit, so I could not tell whether re-opening it was
expected of me or whether I was being marked as having verified something I had not looked at.

**What would have unstuck me:** move "close the panel" to the end of step 18.

**Measured:** Built pool. Step 17 `note`: *“Close the panel with TRIP BLOCKS again: it covers the rod buttons.”* Step 18 then grades on two rows whose `note` reads *“Both rows are on the TRIP BLOCKS panel.”* Coordinator, 2026-09-14 — a text contradiction, no plant run needed.
**Verdict:** confirmed — step 17 closes the panel step 18 asks you to read.

### S-9 — Step 2 tells you to do something the same step says is already done, and quotes a duration for a plant you are not in.

**Step 2:** "Wash boron out of the water: on the BORON card set 719 and press Enter."
Same block: *"BORON STATUS reads DILUTING while the dose runs and stops by itself"*, *"From the Hot
Standby preset boron already reads 719 and this step ticks at once"*, and
*"⏩ From 918 ppm this takes about 65 plant-minutes. Use the speed buttons at the top."*

**What I did.** Typed 719 and pressed Enter as told, then watched for the promised "DILUTING" which
never appeared — BORON STATUS read **HOLD** the whole time, and BORON CHEM never moved off 719 ppm.
The acceptance was already ✓ when the step was first drawn. As a beginner I could not tell whether
I had just done something or nothing, nor whether the 65 plant-minutes applied to me.

**What would have unstuck me:** "nothing to do here — this plant starts at 719 ppm; press Continue."

**Measured:** Built pool. Step 2's `note` already ends *“From the Hot Standby preset boron already reads 719 and this step ticks at once”*, and the DILUTING promise is conditional — *“BORON STATUS reads DILUTING **while the dose runs**”*. Coordinator, 2026-09-14.
**Verdict:** narrowed — the observation stands (the player typed a value, watched for a state that never came, and could not tell whether they had done anything or nothing) but the text is not wrong. It is a four-sentence note whose last clause answers the question the first clause raises, and the imperative is read first.

### S-10 — Step 1's done-when describes the opposite of what the instrument is doing.

**Step 1:** "Verify the plant is hot and shut down: AVG COOLANT TEMPERATURE 547 °F, PRIMARY PRESSURE
2235 psi, RCP FLOW on." / "**SOURCE RANGE counts should be steady, not climbing.**"

**What I did.** Watched SOURCE RANGE for about a minute: 4.8e2, 4.9e2, 5.3e2, 5.0e2, 4.6e2. It wanders
about ±10 % continuously. At a two-digit readout that is indistinguishable from "climbing", and the
step gives no band. Continue was lit regardless, so a careful beginner reads a sentence that their
own board appears to fail.

**What would have unstuck me:** "the last digit wanders by a few percent — that is noise, not a climb."

**Measured:** Full stack, rods at 0, plant static, 60 s at 1×, one sample a second. True `sr_counts_cps` is flat at **500.9**; the tile prints **ten different values** over that minute — 4.5e2, 4.6e2, 4.7e2, 4.8e2, 4.9e2, 5.0e2, 5.1e2, 5.2e2, 5.3e2, 5.4e2 — instrument min 448, max 542, a **±9.5 %** spread (the reviewer read 4.6e2 to 5.3e2). STARTUP RATE over the same window: −0.00.
**Verdict:** confirmed — the step asks the player to judge “steady, not climbing” from a readout whose own noise moves the visible digit ten ways in a minute, and it gives no band. The instrument's `noise: 0.02` on a log channel is what does it; nothing on screen distinguishes that from a climb.

### S-11 — An unexplained alarm is already standing at T+00:00:00.

**What I did.** The instant the leg loaded, ALARMS showed **"Turbine Trip / Low Steam Demand · power ·
warning · unacknowledged · T+00:00:00"** (`shots/05_started.png`). No step mentions it and no step
tells you to acknowledge it. It stood through step 15 (LATCH), which is presumably what clears it —
it was gone by `shots/44_tripblocks.png`. A beginner's first act on a new plant should not be to
learn to ignore an alarm.

**What would have unstuck me:** one line in step 1 — "the turbine-trip alarm is expected at hot
standby; you clear it at step 15 when you latch the turbine."

**Measured:** On the **first tick** of the leg's own initial condition (`hot_zero_power`) the alarm set carries `turbine_trip`, tile label **“Turbine Trip / Low Steam Demand”**, priority **warning**, state **`active_unacknowledged`**, at t = 0.1 s — and it is visible in the ALARMS pane on a fresh headless load at 1600x1000. Grepped the entire built `pwr_startup` object — 18 steps plus `prereq`, `precond`, the four `cautions` and `outcome`: **zero** mentions of a turbine trip, of this alarm, or of acknowledging anything. The only occurrence of the word “alarm” in the leg is step 5's note, and it is there to say that a NEW alarm drops the clock.
**Verdict:** confirmed — a warning-priority alarm stands unacknowledged from the first frame of the walkthrough and no authored text in the leg names it. The plant is right (the turbine is tripped at hot standby); the walkthrough is silent.

### S-12 — The Plant & Mission window was already open on load, and it is called three things.

**What I did.** The window was open over the board when the page finished loading — my first click at
the Main Menu button was intercepted by it. The window's own title bar says **"Plant & Mission"**; the
button that opens it says **"Main Menu"**; its tooltip says *"Main Menu — select plant, mission and
reset"*; the right-hand Instructor tab calls it *"Plant & Mission (the bar under the clock)"* while
the button is in the row beside Settings, not under the clock. Four descriptions, one window.

**What would have unstuck me:** one name on the button and the title bar.

---

## 3. Per-step log

Every step I reached. Run A unless marked. "cont" = the Continue button lighting.

**Measured:** Two sites of stale copy — `ui/app.js:3456` and `ui/shell.html:602` both still read *“**Plant &amp; Mission** (the bar under the clock)”*, and that bar was replaced by the `#mainMenuBtn` Main Menu button beside Settings (coordinator, 2026-09-14). The open-on-load half was reproduced in the browser: on a fresh headless load at 1600x1000 `#missionOverlay` is a **1600×1000 fixed** element, and a Playwright click on `#mainMenuBtn` was **intercepted by it** for a full 30 s timeout — the reviewer's “my first click at the Main Menu button was intercepted by it”, exactly.
**Verdict:** confirmed — one window, four names (button “Main Menu”, title bar “Plant & Mission”, tooltip “Main Menu — select plant, mission and reset”, help text “Plant & Mission (the bar under the clock)”), and the last of those describes a bar that no longer exists. The overlay is modal over the whole viewport on load, so the first click anywhere else is eaten.

### Pre-step — loading
The page came up with the **Plant & Mission** window already open (S-12). Its **Walkthroughs** tab
lists seven entries, not six; mine reads *"Mode 3, Hot Standby → Mode 1, At Power — startup to power ·
starts at Hot Standby (Mode 3)"*. Pressed **▶ Start**. Clock was already running at 1x.
`shots/04_wt_list.png`, `shots/05_started.png`.

The walkthrough opened in the **Instructor** tab (not the Walkthroughs tab it was launched from —
see §4), headed "Step 1 of 18", with a collapsible **"⚠ 4 cautions for this walkthrough"** block
already expanded. I read all four. The one that mattered, and that I then broke, was caution 1
(quoted at S-2).

### Step 1 — "Verify the plant is hot and shut down: AVG COOLANT TEMPERATURE 547 °F, PRIMARY PRESSURE 2235 psi, RCP FLOW on."
Done-when: "✓ When AVG COOLANT TEMPERATURE 532 to 561 °F". Marked **BACKGROUND — NOT AN ACTION**.
Already satisfied on arrival; cont lit immediately. ~1 min wall spent reading.
**Confusions:** the board read PRIMARY PRESSURE **2237-2238**, the step says 2235 — trivially, but it
is the first number a beginner checks and it does not match. The "counts should be steady, not
climbing" line (S-10). The standing turbine-trip alarm (S-11).
**Rings:** four, all steady: AVG COOLANT TEMPERATURE tile, PRIMARY PRESSURE tile, the SOURCE RANGE
value, and the reactor coolant pump symbol in the middle of the diagram. All four are named in the
step. The pump ring is the only one I could not have named from the ring alone — it is a ring around a
pump icon with "RCP FLOW 100 %" underneath it, which is enough. `shots/05_started.png`.

### Step 2 — "Wash boron out of the water: on the BORON card set 719 and press Enter."
Done-when: "✓ When Boron in the loop (BORON CHEM after a sample) 679 to 759 ppm". Already ✓ on arrival.
Typed 719 into the BORON box, pressed Enter. Nothing changed. cont was lit before and after.
**Confusions:** S-9 in full. Also the step calls the value "Boron in the loop (BORON CHEM after a
sample)" — "after a sample" implies an action I never found a control for.
**Rings:** BORON number box **pulsing**; BORON CHEM "719 ppm" steady; BORON STATUS "HOLD" steady. The
pulsing ring is on exactly the box the step told me to type in. Findable from the ring alone.
`shots/12_step2.png`, `shots/14_boron_set.png`.

### Step 3 — "Check SG FEED reads AUTO. If it does not, press AUTO."
Done-when: "✓ When SG FEED is in AUTO". Already ✓. Read and pressed Continue. ~15 s.
**Rings:** the SG FEED **AUTO** button **pulsing**, STEAM GENERATOR LEVEL tile steady. Exact match.
`shots/15_step3.png`.

### Step 4 — "Before any rod moves: press 1/M PLOT on the ROD CONTROL card, then press Plot point."
Done-when: "○ Baseline point plotted". Pressed **1/M PLOT** on the ROD CONTROL card; a floating window
headed **"1/M Startup Plot"** opened with buttons **Plot point / Clear / Help**. Pressed **Plot point**;
cont lit. ~40 s.
**Confusions:** the window opens **on top of the board**, covering the steam generator, the turbine and
most of the ATMOS DUMP card, and it stays there for the next eight steps. Nothing says you may move it
(I could not) or that you will be told to close it later (step 12). The step says "press Plot point";
the button says "Plot point" — good — but the window is titled "1/M **Startup** Plot" and the board
button is "1/M PLOT" and the ring hint calls the whole thing "**1/M Plot**".
**Rings:** **1/M PLOT** button on the ROD CONTROL card, **pulsing**. Nothing ringed the "Plot point"
button inside the window that the step also names — the second half of the instruction has no ring.
`shots/16_step4.png`, `shots/17_1m_open.png`, `shots/18_plot1.png`.

### Step 5 — "Press MED, then hold WITHDRAW under CONTROL until SOURCE RANGE settles above 7.0e2. Settle, then press Plot point."
Two acceptances: "5a ○ Counts settled above 7.0e2 (700 counts per second)", "5b ○ Point plotted".
Pressed **MED** (already lit), set **10x** as the step's ⏩ line invites ("The rods move with the clock,
so 10x is fine for these pulls"), held WITHDRAW under **CONTROL** for 14 s of wall = 140 s of plant.
Rods 0 → 101. Released, waited ~30 s wall at 10x for SOURCE RANGE to settle (it landed ~8.0e2, STARTUP
RATE ±0.00). Pressed **Plot point**. Both ticks closed; cont lit. ~2 min wall.
**Confusions:** there are **two** WITHDRAW buttons side by side, headed CONTROL and SHUTDOWN. The step
says "under CONTROL", which is right, and the ring was on the correct one — but the columns are narrow
and the word "CONTROL" sits above both rows at a glance. Also: this is the step that teaches the
"About N steps" idiom, and it teaches it wrong (S-1).
**Rings:** **WITHDRAW (control)** pulsing, **MED** pulsing, SOURCE RANGE value pulsing, STARTUP RATE
value pulsing, CONTROL ROD POSITION "0 /627" steady. Two *indications* (SOURCE RANGE, STARTUP RATE)
got the same pulsing ring as the two *buttons*, so "pulsing = press this" does not hold here.
`shots/19_step5.png`, `shots/20_withdraw1.png`, `shots/25_plot2.png`.

### Step 6 — "Hold WITHDRAW at MED until SOURCE RANGE settles above 1.4e3. Settle, press Plot point, then read the 1/M prediction."
**This is where the run went wrong — S-1.** I read "About 150 to 175 steps at MED" as the size of the
pull, set 10x, held WITHDRAW and released at rod 258. Trace, one sample per wall-second at 10x:

```
rods=106 sr=8.1e2 sur=+0.10      rods=210 sr=4.9e3 sur=+0.88
rods=129 sr=1.1e3 sur=+0.17      rods=217 sr=7.4e3 sur=+1.12   <-- caution limit 1.0 crossed
rods=158 sr=1.4e3 sur=+0.28      rods=224 sr=1.1e4 sur=+1.47
rods=180 sr=2.0e3 sur=+0.40      rods=232 sr=2.3e4 sur=+2.10
rods=195 sr=3.0e3 sur=+0.59      rods=239 sr=5.0e4 sur=+2.96
rods=202 sr=3.6e3 sur=+0.72      rods=246 sr=1.0e0 sur=+4.41   <-- SOURCE RANGE secured itself
                                 rods=258 sr=1.0e0 sur=+9.32
```

cont: never lit on step 6 — the walkthrough **jumped to step 10** instead, printing the "overtaken"
note. ~1 min wall for the pull, then confusion.
**Confusions:** S-1, S-2, and the fact that I got no warning at all at the moment it mattered. The
only feedback was the alarm "Startup Rate High", which arrived at +2.96 DPM — long past 1.0.
**Rings:** same set as step 5 (WITHDRAW pulsing, MED steady now that it is selected, SOURCE RANGE and
STARTUP RATE pulsing, CONTROL ROD POSITION steady). Nothing changed appearance as the reactor ran away.
`shots/26_step6.png`, `shots/27_withdraw2.png`, `shots/28_after_runaway.png`.

### Steps 7, 8, 9 — never shown in Run A
Skipped by the walkthrough. Played in Run B; recorded at the bottom of this section.

### Step 10 — "Press SLOW and hold WITHDRAW to the position the 1/M panel predicts, then tap one step at a time."
Done-when: "✓ When REACTOR POWER > 0.1 %" — **already met on arrival**, cont lit, because I was
already well past critical. Reactor power 0.3 % and climbing, STARTUP RATE +9.38 falling through
+4.34. The plot window read **"predicted criticality ≈ step 261 (41.7% withdrawn)"** and I was at 258.
I did not withdraw further; I pressed Continue. ~1 min.
**Confusions:** the whole of S-2. The step is the longest in the leg (about 200 words) and every word
of it assumes you are approaching criticality from below.
**Rings:** **WITHDRAW** pulsing, **SLOW** pulsing, STARTUP RATE pulsing, SOURCE RANGE pulsing, INTER
RANGE steady, CONTROL ROD POSITION steady. The two things the step tells you to press are both ringed
and both pulsing — correct — but so is the instrument you are supposed to *avoid* driving up.
`shots/28_after_runaway.png`, `shots/29_step11.png`.

### Step 11 — "Let power climb on its own while STARTUP RATE is positive. Do not add steps."
Done-when: "✓ When REACTOR POWER > 0.5 %" — already met. cont lit on arrival. ~10 s.
**Confusions:** the headline says "Do not add steps" and the ring **still pulses on WITHDRAW and SLOW**,
because of the step's conditional second sentence. Pulsing means "press this" everywhere else in this
walkthrough; here it means "press this only if something that is not happening happens".
**Rings:** WITHDRAW pulsing, SLOW pulsing (both contradicting the headline); STARTUP RATE steady,
INTER RANGE steady, CONTROL ROD POSITION steady. `shots/29_step11.png`.

### Step 12 — "Verify SOURCE RANGE has switched itself off and INTER RANGE is reading. Close the 1/M PLOT window."
Done-when: "✓ When SOURCE RANGE is not switched on" — already met. Hint: "Close it with the ✕ in its
corner; its work is done." Clicked the ✕ at the top right of the 1/M Startup Plot window; it closed.
cont lit. ~20 s.
**Confusions:** the pulsing ring is on the **1/M PLOT button on the board**, not on the ✕ the step tells
you to press; and the board button is behind the window you are being asked to close. Also "SOURCE
RANGE is not switched on" — the board shows no on/off indication for it; SOURCE RANGE simply reads
**1.0e0 cps**, which looks like a live reading of 1 count per second, not an off instrument.
**Rings:** **1/M PLOT** pulsing (wrong target), SOURCE RANGE steady, INTER RANGE steady.
`shots/30_step12.png`, `shots/31_closed1m.png`.

### Step 13 — "Press MED, then hold INSERT until REACTOR POWER stops rising and is below 5 %."
Done-when: "○ When REACTOR POWER < 5 %". Hint: "About 14 steps if power is near 1 %, more if it ran
ahead." Mine had run ahead: power was **15.3 %**. Pressed MED, held INSERT 20 s at 1x (rods 258 → 243)
— power kept climbing, 15.3 % → 16.7 %. Held again for 60 s (rods 243 → 196), power fell 16.7 % → 5.8 %.
Waited ~10 s more; cont lit at **4.9 %**. ~3 min wall.
**Confusions:** the first 20 s of INSERT made power go **up**, which reads as the control doing the
opposite of what it should. (It is thermal lag — nothing on screen says so.) Also the acceptance is
"< 5 %" while the text says "stops rising **and** is below 5 %" — mine was still falling fast at 4.9 %
when the tick closed, so the button lights on half the sentence.
**Rings:** **INSERT** pulsing, **MED** pulsing, STARTUP RATE steady, INTER RANGE steady, CONTROL ROD
POSITION steady. Exact match to the words. `shots/31b_step13.png`, `shots/32_insert.png`,
`shots/35_insert2.png`, `shots/36_below5.png`.

### Step 14 — "Press SLOW, then hold WITHDRAW until REACTOR POWER passes 5 %, about 13 steps. That is Mode 1, At Power."
Done-when: "○ When REACTOR POWER > 5 %". **S-6 in full.** First 13 steps (rod 196 → 209, 98 s at 1x
SLOW) took power **down** 4.2 % → 3.1 %. Second 13 (rod 209 → 222, 105 s) took it 3.1 % → 5.1 %; cont
lit ~3 s later at 5.2 %. ~4 min wall.
**Rings:** **WITHDRAW** pulsing, **SLOW** pulsing, STARTUP RATE steady, INTER RANGE steady, CONTROL ROD
POSITION steady. Exact match. `shots/37_step14.png`, `shots/38_step14_withdraw.png`, `shots/39_step14b.png`.

### Step 15 — "Press LATCH on the TURBINE-GENERATOR card, then set LOAD to 10 MWe."
Two acceptances: "15a ○ Turbine latched", "15b ○ Generator above 8 MWe". Pressed **LATCH**; 15a closed.
Typed 10 into the LOAD box and pressed Enter. The ⏩ line said "About 4 plant-minutes at 1x — set the
speed control to 10x", and the status line under the speed bar said the same thing in the same words,
so I set 10x. OUTPUT walked up; 15b closed at 8.1 MWe after ~10 s wall. Power followed from 5.7 % to
8.1 % on its own, exactly as the background text promised. ~1.5 min wall.
**Confusions:** the step says "10 **MWe**", the acceptance says "8 **MWe**", the board's input is
labelled "LOAD [ ] **MW**" and the readout below it "OUTPUT 10 **MW**". Three spellings of the unit on
one card. Minor, but this is the one number a beginner types by hand here.
**Rings:** **LATCH** pulsing, the **LOAD MW box** pulsing, TURBINE-GENERATOR card header steady, OUTPUT
"0 MW" steady. Both halves of the instruction ringed. `shots/40_step15.png`, `shots/41_latched.png`,
`shots/42_load10.png`.

### Step 16 — "Press TRIP BLOCKS on the ROD CONTROL card, then BLOCK on the IR HIGH FLUX row."
Done-when: "○ When IR HIGH FLUX is blocked on the TRIP BLOCKS panel". Pressed **TRIP BLOCKS**; a panel
opened over the left of the board reading "TRIP BLOCKS / 0 of 4 BLOCKED · 2 AVAILABLE TO BLOCK NOW ·
2 WAITING ON ITS PERMISSIVE" with four rows: PZR PRESS LO-LO, **IR HIGH FLUX**, PR HIGH (LOW SETPT),
SI REACTOR TRIP. The IR HIGH FLUX row was ringed and its BLOCK button was the lit one. Clicked BLOCK;
cont lit. ~40 s.
**Confusions:** "**IR** HIGH FLUX" — the board's instrument is called "**INTER RANGE**" and the panel
row is called "IR HIGH FLUX". Nothing on screen connects IR to INTER RANGE. I only got there because
the row itself was ringed. (Same for "PR" in step 17 — see §4.)
**Rings:** **TRIP BLOCKS** button pulsing; inside the panel, the IR HIGH FLUX row highlighted. The ring
carried me the whole way. `shots/43_step16.png`, `shots/44_tripblocks.png`, `shots/45_blocked.png`.

### Step 17 — "On the TRIP BLOCKS panel press BLOCK on the PR HIGH (LOW SETPT) row, then close the panel."
Done-when: "○ When PR HIGH (LOW SETPT) is blocked on the TRIP BLOCKS panel". Clicked BLOCK on the third
row; cont lit at once. Then pressed TRIP BLOCKS again to close, as the hint says. ~30 s.
**Confusions:** cont lit on the BLOCK alone — closing the panel, which the instruction also names, is
not graded, and step 18 then needs the panel open again (S-8).
**Rings:** **TRIP BLOCKS** button pulsing (now showing a badge "1"), the PR HIGH row highlighted inside.
`shots/46_step17.png`, `shots/47_prblocked.png`, `shots/47b_panel_closed.png`.

### Step 18 — "Verify Mode 1: REACTOR POWER 10 %, OUTPUT 10 MWe, IR HIGH FLUX and PR HIGH (LOW SETPT) both lit."
Done-when: "✓ When Plant in Mode 1, At Power — the plant reads Mode 1, At Power (true value)" — already
met. **BACKGROUND — NOT AN ACTION.** cont lit on arrival. Pressed Continue; the panel showed
"**Complete**" and a green card, plus a **"Next: Mode 1, At Power — power ascension to 100 % ▸"**
button and a **Close** button.
**Confusions:** S-8. Also the done-when text — "the plant reads Mode 1, At Power (true value)" —
mentions a "Mode" readout I never found anywhere on the board (see §4). And the stale "overtaken" note
was still printed under the completion card (S-7).
**Rings:** REACTOR POWER tile steady, TURBINE-GENERATOR card steady, STEAM GENERATOR LEVEL tile steady.
Nothing ringed IR HIGH FLUX or PR HIGH (LOW SETPT), the two things the step actually asks you to verify
— they are inside a closed panel. `shots/48_step18.png`, `shots/49_finished.png`.

---

### Run B — steps 7, 8, 9 and a clean step 10

Restarted the leg from Plant & Mission. Steps 1-4 as before. Step 5: pulled to rod **102** at 10x,
settled at 8.3e2, plotted, cont lit.

**Step 6 (Run B)** — "Hold WITHDRAW at MED until SOURCE RANGE settles above 1.4e3…" Stopped when the
board showed 1.4e3, at rod **151**. Waited 21 s with the rods still: SOURCE RANGE read 1.4e3 / 1.3e3 /
1.4e3, STARTUP RATE decayed +0.11 → +0.04. **6a never closed** (S-3). Plotted the point (6b closed).
Pulled six more steps to rod **157**, SOURCE RANGE 1.6e3 — 6a closed immediately. cont lit. ~3 min.

**Step 7** — "Hold WITHDRAW at MED until SOURCE RANGE settles above 3.0e3. Settle, press Plot point,
read the prediction again." / "About 180 to 205 steps at MED." Held to rod **192** at 10x (5 s of wall),
dropped to 1x, waited 18 s: counts settled 3.0e3 → 3.4e3, STARTUP RATE +0.54 → +0.18. Plotted. Both
ticks closed. **The hint is a total position and it matched: 192 is inside 180-205.**
**Rings:** WITHDRAW pulsing, SOURCE RANGE pulsing, STARTUP RATE pulsing, CONTROL ROD POSITION steady,
MED steady. `shots/55_step7.png`, `shots/56_step7done.png`.

**Step 8** — "Hold WITHDRAW at MED until SOURCE RANGE settles above 7.0e3. Settle, press Plot point.
Keep STARTUP RATE under 1.0." / "About 195 to 220 steps at MED." Held 18 s at 1x to rod **208**; STARTUP
RATE peaked **+0.74**, inside the limit. Waited 21 s: counts 5.6e3 → 7.3e3. Plotted; both ticks closed.
**208 is inside 195-220.** This step is the only one that repeats the 1.0 limit in the instruction line,
and it is the step where you are least likely to break it.
**Rings:** identical set to step 7. `shots/57_step8.png`, `shots/58_step8done.png`.

**Step 9** — "Hold WITHDRAW at MED until SOURCE RANGE settles above 2.0e4. Settle, press Plot point.
This is the last point." / "About 205 to 225 steps at MED. Write down the position the panel predicts."
Two 5-s pulls with a 20-s settle between: rod 211 (1.2e4), then rod **215** (2.0e4). Plotted; both ticks
closed. **215 is inside 205-225.**
**Confusion:** on the way, SOURCE RANGE printed **`10.0e3 cps`** — not `1.0e4`. Against a step whose
target is written "2.0e4" that is a genuine reading hazard: 10.0e3 looks bigger than 2.0e4 to anyone
who is matching the shape of the number rather than doing the arithmetic.
**Rings:** as steps 7-8. `shots/59_step9.png`, `shots/60_step9done.png`.

**Step 10 (Run B, clean)** — the plot read **"predicted criticality ≈ step 220 (35.1% withdrawn)"**, and
"C = 816 cps — 1/M = 0.614" underneath it. Pressed **SLOW**, held WITHDRAW from 215 to **220** (32 s at
1x), released. STARTUP RATE peaked **+0.57** — the step promises "expect STARTUP RATE to peak near 0.9",
close enough. Counts climbed on their own, 4.9e4 → 9.9e4, then the detector secured itself and SOURCE
RANGE fell to 1.0e0. STARTUP RATE then held **+0.43 to +0.49** dead steady for the next **8.4
plant-minutes** (sim T+00:10:52 to T+00:19:18) with REACTOR POWER reading **0.0 until T+00:17:30**
and Continue dark the whole way (S-5). `shots/61_step10_clean.png`,
`shots/62_at_pred.png`, `shots/63_crit.png`, `shots/64_crit2.png`.

---

## 4. Words and numbers I could not find on the board

| What the walkthrough said | What is actually on the board | Verdict |
|---|---|---|
| "**IR** HIGH FLUX" (steps 16, 18) | Instrument is **INTER RANGE**; the trip-block row is **IR HIGH FLUX** | The abbreviation is never expanded anywhere a player reads. Found only because the row was ringed. |
| "**PR** HIGH (LOW SETPT)" (steps 17, 18) | Trip-block row **PR HIGH (LOW SETPT)**; there is no "PR" instrument on the board at all (the power channel tile is **REACTOR POWER**) | Same problem, one step worse: nothing on the board carries the letters PR. |
| "the plant reads **Mode 1, At Power** (true value)" (step 18 done-when) | **No mode indicator anywhere on the board.** I could not find one on the diagram, in the tiles, or in the tools row. | The final acceptance of the whole leg is graded on a value the player cannot read. |
| "BORON STATUS reads **DILUTING**" (step 2) | BORON STATUS read **HOLD** for the whole leg | Promised a state that never appeared. |
| "PRIMARY PRESSURE **2235** psi" (step 1) | 2237-2238 psi at the moment the step is drawn | Off by 2-3 psi; harmless but it is the first check. |
| "set LOAD to 10 **MWe**" / "Generator above 8 **MWe**" (step 15) | Input labelled **MW**, readout **OUTPUT 10 MW**, trend pane **Output MW / 10 MWe** | Three spellings of one unit. |
| "SOURCE RANGE is not switched on" (step 12) | SOURCE RANGE reads **1.0e0 cps** — a plausible live reading, with no OFF/SECURED legend | Nothing on the board says "off". |
| "counts settled above **1.4e3**" (step 6) | Board prints **1.4e3** while the acceptance is still open | Target is quoted finer than the readout (S-3). |
| "SOURCE RANGE ... **2.0e4**" (step 9) | Board printed **10.0e3** on the way there | Non-standard exponent form on the same instrument the step targets. |
| "**SG FEED**" / the hint's "Use **Feed Pumps**" (step 3) | Card is headed **SG FEED**; "Feed Pumps" appears nowhere | The hint line names a card that does not exist. |
| "the **1/M PLOT** window" (step 12) | Window title bar: **1/M Startup Plot**; board button: **1/M PLOT**; hint line: **1/M Plot** | Three capitalisations, one tool. |
| "**Plant & Mission**" (Instructor tab help text) / "Main Menu" (button) / "Plant & Mission" (window title) / "the bar under the clock" (help text) vs its actual place beside Settings | — | S-12. |
| "**Walkthroughs**" (the tab it is launched from) vs the running walkthrough being drawn in the **Instructor** tab | — | After pressing Start, the Walkthroughs tab is not where the walkthrough is. I found it by accident. |
| "one control-bank step adds about **8.1 pcm**" (caution 1) | No pcm anywhere on the board | Explained in the caution itself ("a hundred-thousandth"), so not a blocker, but it is a unit with no readout. |

---

## 5. Highlight table

Pulsing = `ckl-step-glow`, animated. Steady = `ckl-watch-glow`, static. Both are rings around the
board element.

| Step | What the step told me to press or read | What the board ringed | Pulsing / steady | Helped? |
|---|---|---|---|---|
| 1 | Read AVG COOLANT TEMPERATURE, PRIMARY PRESSURE, RCP FLOW, SOURCE RANGE | all four: the two big tiles, the RCP pump symbol, the SOURCE RANGE value | all steady | Yes — all four, exact |
| 2 | Press: BORON box, type 719, Enter | BORON input box; BORON CHEM value; BORON STATUS | box pulsing, other two steady | Yes — the box is exactly where to type |
| 3 | Press SG FEED AUTO; watch SG level | SG FEED AUTO button; STEAM GENERATOR LEVEL tile | AUTO pulsing, tile steady | Yes |
| 4 | Press 1/M PLOT, **then Plot point** | 1/M PLOT button only | pulsing | Half — nothing rings "Plot point" inside the window |
| 5 | Press MED, hold WITHDRAW (CONTROL); read SOURCE RANGE | WITHDRAW (control), MED, SOURCE RANGE, STARTUP RATE; CONTROL ROD POSITION | first four **all pulsing**, position steady | Yes for the buttons; **two read-only instruments got the press-me ring** |
| 6 | Same as 5 | Same as 5 | same | Yes, and it did nothing to warn me the pull was too long |
| 7 (Run B) | Hold WITHDRAW at MED; read SOURCE RANGE | WITHDRAW, SOURCE RANGE, STARTUP RATE pulsing; CONTROL ROD POSITION, MED steady | mixed | Yes |
| 8 (Run B) | Same, plus "keep STARTUP RATE under 1.0" | same set | mixed | Yes |
| 9 (Run B) | Same, plus "write down the position the panel predicts" | same set; **nothing rings the prediction text in the plot window** | mixed | Partly |
| 10 | Press SLOW; hold WITHDRAW to predicted position; read STARTUP RATE | SLOW, WITHDRAW, SOURCE RANGE, STARTUP RATE pulsing; INTER RANGE, CONTROL ROD POSITION steady | mixed | Yes for the controls |
| 11 | **"Do not add steps"** | **WITHDRAW and SLOW still pulsing** | pulsing | **No — the ring says press, the words say don't** |
| 12 | Read SOURCE RANGE / INTER RANGE; **close the 1/M window with its ✕** | 1/M PLOT **button on the board**; SOURCE RANGE, INTER RANGE | button pulsing, instruments steady | **No for the action** — ring is on the wrong control, and it is behind the window |
| 13 | Press MED, hold INSERT; read REACTOR POWER | INSERT, MED pulsing; STARTUP RATE, INTER RANGE, CONTROL ROD POSITION steady | mixed | Yes. **REACTOR POWER, the graded value, is not ringed** |
| 14 | Press SLOW, hold WITHDRAW; read REACTOR POWER | SLOW, WITHDRAW pulsing; STARTUP RATE, INTER RANGE, ROD POSITION steady | mixed | Yes. Again REACTOR POWER is not ringed |
| 15 | Press LATCH; set LOAD to 10 | LATCH, LOAD box pulsing; TURBINE-GENERATOR header, OUTPUT steady | mixed | Yes — best-matched step in the leg |
| 16 | Press TRIP BLOCKS, then BLOCK on IR HIGH FLUX | TRIP BLOCKS button pulsing; **the IR HIGH FLUX row highlighted inside the panel** | pulsing then row | Yes — carried me past an abbreviation I could not decode |
| 17 | BLOCK on PR HIGH (LOW SETPT); close the panel | TRIP BLOCKS button pulsing; PR HIGH row inside | pulsing | Yes for the block; nothing indicates the close |
| 18 | Read REACTOR POWER, OUTPUT, **IR HIGH FLUX and PR HIGH both lit** | REACTOR POWER tile, TURBINE-GENERATOR card, STEAM GENERATOR LEVEL tile — all steady | steady | **Partly.** Two of the four things named are not ringed (they are behind a closed panel); STEAM GENERATOR LEVEL is ringed and is **not named in the step at all** |

**Pattern worth naming:** the ring system is accurate about *which card*, and it is the only reason
I got through steps 16 and 17. Its weakness is that **pulsing does not reliably mean "press this"** —
SOURCE RANGE and STARTUP RATE, which are read-only numbers, carry the same animated ring as WITHDRAW
on eight consecutive steps, and on step 11 the pulsing ring sits on the control the step forbids.
The second weakness is that **anything inside a floating window is unringed**: "Plot point" (step 4),
the prediction (step 9), the ✕ (step 12).

---

**Measured (the §5 highlight pattern, coordinator 2026-09-14):** headless Edge, 1600×1000,
`?engine=pwr2`, walkthrough live on step 4. With the 1/M window **SHUT** there are two
`.ckl-step-glow` elements: the board halo on the 1/M PLOT button at **(42, 325) 71×26**, and the
`Plot point` button — carrying the class — at **0×0 at (0, 0)**. `#oomWin` is built at init and
merely `hidden`, and `document.querySelector` matches hidden elements, so the ring is applied to a
button with no size and the player sees nothing for that label. With the window **OPEN**, the same
button is **107×24 at (915, 132)** and ringed. The ✕ is `[data-oom="close"]`, **27×22 at
(1222, 97)**, and `ckl-step-glow` is **false** on it — step 12's only `hl` is `'1/M Plot Tool'`,
which resolves to the board opener `bdOneOverM`, and `SHELL_TARGETS` (`ui/highlight_bus.js:122`)
contains exactly one entry, `'Plot point'`, so nothing in the system can ever ring the ✕. Step 9's
prediction text likewise has no `hl` label and no shell target.

**Verdict:** narrowed — "anything inside a floating window is unringed" is **refuted**: `Plot point`
is ringed, and invisible only while the window is shut. "The ring on step 12 is on the wrong
control" is **confirmed** — the step says press the ✕ and the ring is on the board's opener. "The
board button is behind the window you are being asked to close" is **refuted**: `#oomWin` is
`position: fixed` at **(904, 90) 356×340**, the 1/M PLOT button is at **(42, 325)**, and they do
not overlap at 1600×1000.

---

## 6. What the text got right

- Every step's action is a single sentence in the imperative, with the control named in the same
  capitals the board uses (WITHDRAW, LATCH, TRIP BLOCKS, BORON, SG FEED).
- The **BACKGROUND — NOT AN ACTION** banner is unambiguous and I never once confused explanation with
  instruction.
- Every count target is given twice, in shorthand and in words: "above 7.0e3 (7,000 counts per second)".
- The four cautions are up front, collapsible, and each one names a specific number.
- Step 5 pre-empts the exact question a beginner has about a momentary button: "Holding WITHDRAW drives
  the bank at the selected speed and releasing it stops; a single tap moves one step. MED moves 48 steps
  a minute at 1x, SLOW 8, FAST 72." Measured against the plant: 48/min at MED is right.
- Step 5 also warns that the clock drops to 1x on a step check-off, before it happened to me — and it
  then happened to me, twice, exactly as described.
- The ⏩ lines name the speed to use and the plant-time it will take, and the status line under the speed
  bar repeats it in the same words ("About 4 plant-minutes left at 1x — set the speed control to 10x").
- Step 10 warns in advance that SOURCE RANGE will switch itself off, says there is no button for it, and
  says why — so when it happened I recognised it instead of reporting a dead instrument.
- Step 10 also tells you what to do if you trip the reactor ("the SCRAM button reads SCRAMMED / PRESS TO
  RESET; press it before the rods will move again") before you need it.
- Step 13's hint hedges its own step count for a plant that overshot ("more if it ran ahead") — the one
  place the walkthrough acknowledges that you may not be on its rails.
- Step 15's background predicts the coupling accurately: "As the generator picks up load, the reactor
  follows it up to about 10 % by itself." Measured: 5.7 % → 10.4 % with no rod motion.
- Step 17 explains why two presses and not one ("on a real board switching one off never quietly
  switches off the other"), which is the kind of thing a beginner would otherwise file as a UI annoyance.
- The "overtaken" mechanism itself is right in principle — the walkthrough noticed I had gone past three
  steps' worth of plant and moved me on rather than deadlocking. Its only fault is that the note never
  clears (S-7).
- The completion card states the end condition in the same words the steps used, and offers the next leg
  by name.
