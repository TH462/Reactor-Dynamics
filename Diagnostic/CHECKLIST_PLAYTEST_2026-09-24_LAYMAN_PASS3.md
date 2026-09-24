# Layman playthrough: `pwr_startup` (Mode 3, Hot Standby to Mode 1, At Power)

> **Record, not policy.** Third fresh-context layman pass of `pwr_startup` (Mode 3, Hot Standby to
> Mode 1, At Power), 2026-09-24, workbench at 2e236276, headless Edge 1600x1000. **1 of 1 leg
> completed, 17 of 17 steps, no Rewind, no trip, never blocked.** Stuck points: S-1 two stop rules
> and two rate targets on steps 5-8 (NARROWED: the 5a tick at bank 73 on a noise excursion is real
> and harmless; the rate wording is two agent-drafted lines beside the owner's step 8 note, both
> selected by him, so text for the owner); S-2 a 25-step window at 10x is about 3 s of wall time
> (CONFIRMED, 8.0 steps per wall-second; the 10x is an agent pick, so a speed ruling); S-3 silent
> auto-speed (not re-measured: by design, #796, and ruling #686, settled in pass 2); S-4 the approach
> is slower than the text (CONFIRMED: on the 0.06 route steps 10 and 11 take 45 to 57 and 20 to 25
> plant-minutes against the text's 25 to 35 and 15, so text for the owner); S-5 the 1/M window and a
> Continue below the fold (window: settled in pass 2; **the Continue half CONFIRMED and FIXED**, two
> defects in the walkthrough panel's scroll); S-6 "about 13 steps" took 18 (CONFIRMED: 19 holding
> until 5 % on this route, 12 on the as-written route; a 13-step pull reaches 5 % three minutes after
> release; text); S-7 "power-range meter" and "IR" (CONFIRMED, text); S-8 and S-9 minor wording
> (CONFIRMED, text). No "11 %" remains in the built pool (0 hits). Measurements: the live
> walkthrough runtime driven through `RD.SimulationService`, `hot_zero_power`, seeds 42 and 7,
> scripts in `inbox/lay3/` (local). The tile is `instruments.source_range`, NOT
> `InstructorLayer.paramValue`, which reads truth: a first cut measured truth and saw no noise.

Build under test: workbench 2e236276 (the header reads `Alpha 1.8.0-rc4 TEST BUILD`). Headless Edge at 1600×1000, `ui/shell.html?engine=pwr2`.
Wall time: about 34 min, from 13:44Z to 14:18Z (much of it was my own scripting overhead). Sim time: T+00:00:00 to T+02:33:01.
Screenshots are in `shots/`.

## 1. Outcome

| Leg | Result | Steps completed | The one thing that mattered |
|---|---|---|---|
| pwr_startup (Mode 3 → Mode 1) | **COMPLETE**: "Walkthrough complete. Reactor critical in Mode 1, At Power, OUTPUT 10 MWe, IR HIGH FLUX and PR HIGH (LOW SETPT) both switched off." | 17 / 17 | Nothing blocked me. The rod pulls in steps 5–8 give two stop conditions (a count and a rod position) plus a rate target that the text states two different ways. Pausing after each pull to decide which one governs cost me more than anything else did. |

No step needed a Rewind. No trip, no unexpected alarm.

## 2. Stuck points, ranked by severity

Nothing stopped me outright. These are the places where a layman would hesitate, or where the plant did something the text had not prepared me for.

**S-1: Steps 5–8, three stop rules, and one of them says two things.**
Text (step 5a): "Hold CONTROL WITHDRAW at MED until SOURCE RANGE passes 7.0e2. Let STARTUP RATE fall to about +0.01 to +0.03." Note: "Stop when CONTROL ROD POSITION reads about 80 to 100. STARTUP RATE is back to 0.00 about half a plant-minute after the rods stop." Step 8a note: "STARTUP RATE takes about six plant-minutes to come back to zero here, and a point plotted before it does throws the predicted position further out than it is."
- What I did: I stopped at whichever came first, the count or the position. The count came first every time: 73 steps in step 5, 154 in step 6, 195 in step 7 and 203 in step 8. Before plotting I then waited for STARTUP RATE ≤ +0.03.
- The confusion: the first line asks for the rate to fall to "+0.01 to +0.03", and the note asks for it to come "back to 0.00" / "back to zero". I cannot tell which one to wait for before I press Plot point.
- In step 5, SOURCE RANGE is noisy. During the hold it read 5.1e2 → 6.0e2 → 5.6e2 → 6.4e2 → 7.4e2, and I released on a 7.4e2 spike at 73 steps, below the "80 to 100" window. **5a ticked.** Afterwards the tile settled at **6.3e2–6.9e2**, below the 7.0e2 the step asked for (T+11:55 to 12:22). So the check-off says the count was reached while the tile says it was not.
- In step 8 the wait is about 6 plant-minutes, but the walkthrough dropped the speed to 1× by itself when 8a ticked ("Suggested time warp: 1×" for 8b). That turned it into about 6 minutes of real time. Step 7 was the same: about 2.5 plant-minutes at 1×.
- What would have unstuck me: one plot rule, stated once: "wait until STARTUP RATE reads +0.03 or less, then press Plot point". The b-substep's speed would then be the waiting speed, not 1×.
- **Measured:** built pool (`RD.MANUAL_PROCEDURES.pwr2`): 5a to 8a all say "Let STARTUP RATE fall to about +0.01 to +0.03"; the 5a note says "back to 0.00 about half a plant-minute after the rods stop"; the 8a note says "about six plant-minutes to come back to zero". Provenance, from the reconcile records in `Blueprint/walkthrough_steps/02_mode3_to_mode1.md`: the "+0.01 to +0.03" line and the 5a note are AGENT-drafted options the owner selected (2026-09-23 record d item 4; 2026-09-24 record e item 3); the 8a note is the owner's own. Rate on the tile after each stop (seeds 42 and 7): step 5 reads +0.03 at +3 to +7 s and 0.00 at +31 to +32 s, so the 5a note is true; step 8 reads +0.03 at +179 to +209 s and 0.00 at **+493 s**. Plotting step 8's point at 0.00 instead of +0.03 moved the prediction **210 to 209** (seed 42): one step, for about 5 more plant-minutes. Count noise on the tile, 60 to 360 s after a MED stop: bank 73 mean 693 to 695, range 601 to 797, **46 to 50 % of readings at or above 7.0e2**; bank 80, 82 %; bank 90, 98 to 99 %; bank 100, 100 %. So a stop at 73 ticks 5a on a noise excursion, as reported. The row latches, and the plotted point carries whatever count the tile shows: on the reviewer's stops (73, 154, 195, 203) the predictions ran 237, 230, 217, 210 (seed 42) and 322, 254, 218, 210 (seed 7), and the approach ended at 209 and 210, as on the authored route. Step 8: 8a ticks 16 to 64 s after the stop, the rate needs another 2.5 to 3 plant-minutes to reach +0.03, and 8b's rung is 1x, so that wait runs at 1x wall. The 1x on 8b comes from the draft's "instant presses at 1x" rule, which the owner accepted with the draft.
- **Verdict:** narrowed. The observation stands, but there is no grading defect: the 7.0e2 row was true when it ticked, and a low-count point does not bend the fit. The two stop rules (count against position) and the two rate targets (+0.03 against 0.00) are text. The clash comes from two agent-drafted lines placed beside the owner's step 8 note, but he selected each of them, so it goes to him rather than being edited here. The 1x wait in 8b is a speed ruling.

**S-2: Step 7, a 25-step window at 10× is about 3½ seconds of wall time.**
Text: "Stop when CONTROL ROD POSITION reads about 180 to 205 steps. This pull is only 25 steps wide, so watch the position, not the clock. Suggested time warp: 10×."
- What I did: at 10×, a 5.8 s hold moved the rods 41 steps (154 → 195), about 7 steps per wall-second. I released at 195. SOURCE RANGE was already 3.2e3 against the 3.0e3 target, and it kept climbing to 5.4e3 before I plotted.
- What would have unstuck me: a 5× suggestion for the pull itself, or the note "release a few steps early, the counts keep climbing after you let go".
- **Measured:** MED moves the bank **0.80 steps per plant-second** (banks 73 to 110, both seeds). At 10x that is **8.0 steps per wall-second**, so the 25-step window (180 to 205) is **3.1 s** of holding; at 5x it is 6.3 s. On the reviewer's route the count target 3.0e3 is first met at bank 194 to 195 while the rods are moving, and after the stop at 195 the counts keep climbing, about 3.1e3 to 5.4e3 in 3 minutes, at any speed (subcritical multiplication settling). 7a's 10x is marked "my pick" in the draft's speed-provenance table, not the owner's.
- **Verdict:** confirmed. A speed ruling for the owner (7a at 5x or 10x); not changed.

**S-3: Speed changes itself without saying so.**
- What I saw: the speed buttons moved by themselves when a step opened and again when a substep ticked:
  - opening step 5 → 5×; 5a tick → 1×
  - step 6 opens at 5×; 6a tick → 1×
  - step 7 opens at 10×; 7a tick → 1×
  - 9a tick → 10×
  - step 10 done → 1×; step 11 opens at 5×; step 12 opens at 10×; step 13 at 5×; step 14 at 1×; 14a tick → 10×
- `#warpInfo` was empty the whole run. Nothing on the screen says "the walkthrough set your speed".
- The auto-speed follows the "Suggested time warp" lines, which helps. But in step 9 the text says "10× while you wait; back to 1× before every tap", and I had to press 1× myself before each tap.
- What would have unstuck me: a line in `#warpInfo` or the panel, e.g. "Speed set to 10× by the walkthrough".
- **Measured:** not re-measured. Settled by pass 2 (`Diagnostic/CHECKLIST_PLAYTEST_2026-09-24_LAYMAN_PASS2.md` S-5): the clock follows each substep's rung by design (#796), and the empty `#warpInfo` is ruling #686.
- **Verdict:** narrowed, by the pass 2 record. Not changed.

**S-4: Steps 9–11, the approach is slower than the text says.**
Step 9b text: "Around 0.15, with PERIOD 150 to 200 seconds, is this approach going as written … 0.02 to 0.05: one more step out. 0.06 to 0.10: fine."
- What I did: stopped at 207 (predicted 210, minus 3). Then three single taps, reading the rate five plant-minutes after each:

  | Tap | Rods | Rate after 5 min | Period |
  |---|---|---|---|
  | 1 | 208 | +0.04 | 715 s |
  | 2 | 209 | +0.05 | 587 s |
  | 3 | 210 | +0.06 | 405 s |

  Each step added only about +0.01.
- The knock-on:
  - Step 10 ("REACTOR POWER reads 0.0 % for about twenty-five to thirty-five plant-minutes") took **47 plant-minutes**, T+00:51:19 to 01:38:51.
  - Step 11 ("About 15 plant-minutes") took **21.5**.
  - Power levelled at **1.0 %**, which matches the text's "0.06 to 0.10: fine … levels lower (about 1 to 1½ %)".
- Not a blocker, since the text covers this case. But "as written" (0.15) was never reachable by the stated procedure of single taps with 5-minute reads from 3 short. It would take about 10 more taps, about 50 plant-minutes.
- What would have unstuck me: saying up front that 0.06–0.10 is the common result, or telling the player to stop 1 short instead of 3.
- **Measured:** live walkthrough runtime, reviewer's rule (tap until the five-minute read is +0.06 or more). Seed 42 ends at bank 209 (+0.06) and seed 7 at 210 (+0.07). **Step 10 takes 55.0 to 56.7 and 45.4 plant-minutes; step 11 24.7 to 24.8 and 20.0; step 12 23.1 to 24.1 and 24.1; power levels at 0.89 and 1.07 %.** The reviewer's 47, 21.5, 24 and 1.0 % sit inside this. The as-written route (keep tapping to about 0.15) ends at banks 212 and 213: step 10 takes **5.7 to 8.0** plant-minutes (most of the climb happens during step 9's longer tapping), step 11 7.1 to 7.7, step 12 19.4 to 19.6, levelling at 2.4 to 2.6 %. Reaching 0.15 from 3 short took 6 to 7 taps, about 36 plant-minutes in step 9. So "twenty-five to thirty-five" (step 10) and "About 15" (step 11) fit neither route; step 12's "near 1 to 3 %" and "about twenty plant-minutes" fit both.
- **Verdict:** confirmed. Text (owner). Ranges that cover both measured routes: step 10, "about 45 to 60 plant-minutes after a read of 0.06 to 0.10; under 10 if you tapped on to about 0.15"; step 11, "about 20 to 25 plant-minutes (about 7 after a 0.15 approach)".

**S-5: The 1/M window covers the walkthrough panel and part of the board from step 4 to step 11.**
- What I saw: the "1/M Startup Plot" window sits over:
  - the top of the walkthrough panel (the title is clipped to "lode 3, Hot Standby…" and "tartup to power")
  - the speed bar's left edge
  - the SG FEED card
  - the steam dump / ADV area

  In step 9 the long 9b note pushed Continue ▶ below the visible part of the panel (s09_tap3.png: the panel ends mid-BACKGROUND). Nothing tells you to close the window until step 11: "close the 1/M PLOT window with the ✕ in its corner".
- What would have unstuck me: a smaller window, one placed over the diagram instead of the panel, or step 8b saying "you can close it now and reopen it with 1/M PLOT".
- **Measured:** headless Edge 1600x1000, the reviewer's plant state (a save taken at step 9 on the reviewer's route), 1/M window open. The step is **785 to 839 px tall in a 728 px log**. With Continue lit it sat at **y 984 to 1007 against a log floor of 931**, below both the log and the window, and the log's scrollTop stayed at 48. The log is a scroller (`overflow-y: auto`, 887 px of content). Two causes in `renderChecklist`: nothing scrolls when Continue lights (only on a step advance); and the reader-scrolled test required the whole active step to be on screen, which a step taller than the log never is, so the open-at-its-top scroll itself set `userScrolled` and disarmed every later scroll on that step. Headless Edge draws no scrollbar, so "no scroll affordance" cannot be measured here; a desktop browser shows one. The 1/M window covering the panel title, SG FEED and the speed bar is pass 2's S-6: draggable by ruling, not moved.
- **Verdict:** confirmed and FIXED for Continue. After the fix, same state: Continue at y 877 to 900, inside the 203 to 931 log. The window placement is narrowed to the pass 2 record.

**S-6: Step 13, "about 13 steps" was 18.**
Text: "Press SLOW, then hold WITHDRAW until REACTOR POWER passes 5 %, about 13 steps."
- What I did: held at SLOW (5×) from 210. Power lags the rods: 1.0 → 1.5 → 2.2 → 3.6 → 4.6 → 5.1 %. I released at 228 (**18 steps**, 30.5 s wall), and it read 5.4 % two seconds later.
- The step count is just wrong for where I started (210 at 1.0 %). A layman who stops at 13 would sit at about 223 with power still under 5 %, and would wonder.
- What would have unstuck me: "about 15 to 20 steps; power trails the rods, so keep holding".
- **Measured:** SLOW, holding until the tile reads 5.1 % (graded at 5.05): from bank 209 at 0.89 %, **19 steps** (to 228); from 212 at 2.38 % and from 213 at 2.62 %, **12 steps** (to 224 and 225). A fixed 13-step pull from 210 at 1.07 % stops at 223 reading 2.73 %, and power passes 5.05 % **3.1 plant-minutes later** with no further step (seed 7). "About 13 steps" is the as-written route's number; "hold until REACTOR POWER passes 5 %" overshoots it because power trails the rods.
- **Verdict:** confirmed on the 0.06 route. Text (owner): either "hold for about 13 steps, then release and wait: power passes 5 % a few minutes later", or "about 12 to 20 steps".

**S-7: Step 15 names a meter that is not on the board.**
Text: "…is read off the power-range meter, which wanders about ± 0.3 %…" No tile is labelled power range. I assumed it meant REACTOR POWER. Also, "IR" in "IR HIGH FLUX" is never tied to "INTER RANGE" in the text. Power was already 11.0 % when I opened the panel, so none of the warnings applied.
- **Measured:** no board label says "power range": REACTOR POWER draws the `power_range` instrument, and "power-range" appears only in code comments (`pwr_board_wiring.js`). "IR HIGH FLUX" is the TRIP BLOCKS row label (line 3113); the tile reads INTER RANGE; nothing on the card or in the text ties the two together.
- **Verdict:** confirmed. Text (owner): "power-range meter" to "REACTOR POWER"; gloss IR once, as "IR HIGH FLUX (IR is INTER RANGE)".

**S-8 (minor): Step 1, "counts should be steady".** SOURCE RANGE flickered 4.9e2–5.5e2 by itself with nothing moving. A layman may read the noise as "not steady". STARTUP RATE (+0.01 / +0.00) was the more useful cue, and the text does not point at it for this.
- **Measured:** bank 0, nothing moving: the tile reads **460 to 559** over 40 plant-seconds (seeds 42 and 7) around a true 501 to 502. That is about +/- 10 %, the instrument's configured counting noise.
- **Verdict:** confirmed. Text (owner): "steady" to "wandering around one level, not climbing".

**S-9 (minor): Step 2 names a board reading I never saw.** "BORON STATUS reads DILUTING while the dose runs". From this preset boron was already 719, BORON STATUS read HOLD, and the step ticked at once. The text says so ("this step ticks at once"). No problem, just an unseen word.
- **Measured:** the Hot Standby preset starts at 719 ppm, so the step ticks at once and BORON STATUS reads HOLD. The note already says so ("this step ticks at once").
- **Verdict:** confirmed, harmless. Text (owner), optional.

## 3. Per-step log

Times are sim clock (`#clock`). "Ready" means Continue ▶ had class `ready`.

| Step | First sentence | What I did | Sim time / wall | Continue lit? | Confusion / notes | Shots |
|---|---|---|---|---|---|---|
| 1 | "Verify the plant is hot and shut down before any rod moves." | Read AVG COOLANT TEMPERATURE 547 F, PRIMARY PRESSURE 2235 psi, RCP FLOW 100 % (ON lit). Pressed ACK on "Turbine Trip / Low Steam Demand". | Instant (T+0) | Yes, on open | Board matched the text. SOURCE RANGE noise, see S-8. | s01_start |
| 2 | "Bring boron down to the estimated critical concentration, 719 ppm." | BORON box already read 719. Typed 719 + Enter anyway. | Instant | Yes, on open | "estimated critical concentration" is jargon, but BACKGROUND explains it. DILUTING never seen (S-9). | s02_open, s02_done |
| 3 | "Line up the heat sink before the reactor makes any heat." | SG FEED AUTO already lit, card reads HOLDING. Nothing to press. | Instant | Yes | None. | s03_open |
| 4 | "Take the 1/M baseline point before any rod moves." | Pressed 1/M PLOT (ROD CONTROL card); a window opened. Pressed Plot point. | T+5:08 → 5:26 | Yes | The window covers the panel top and SG FEED (S-5). The "7.0e2 is 700" shorthand explainer helped. | s04_open, s04_1m, s04_done |
| 5 | "Withdraw the control rod group and plot a second point on the 1/M plot to begin forming a fit line." | Speed had jumped to 5× on its own. MED was already lit. Held CONTROL WITHDRAW 19.4 s wall; released at 73 steps when SOURCE RANGE flashed 7.4e2. 5a ticked; speed dropped to 1× on its own. Plotted. | T+5:40 → 12:35 | Yes | Released below the "80 to 100" window. The tile settled at 6.3–6.9e2, under the target, and 5a still ticked. Rate wording clash (S-1). | s05_open, s05_released, s05_after, s05_done |
| 6 | "Withdraw again and plot a third point; the prediction tightens." | 5×; held 21.3 s wall, 74 → 154, released at SR 1.4e3. 6a ticked about 20 s later. Waited about 90 plant-s (rate +0.26 → +0.01) and plotted. Panel: "predicted criticality ≈ step 252 (40.2% withdrawn)". | T+12:49 → 16:47 | Yes | 154 is inside "150 to 175". Fine. | s06_open, s06_a, s06_done |
| 7 | "Withdraw a shorter pull and plot a fourth point to tighten the prediction." | 10× (auto). Held 5.8 s wall, 154 → 195. SR overshot to 3.2e3 → 5.4e3. Waited at 1× (auto) for rate ≤ +0.03, about 2.5 plant-min. Plotted: "≈ step 216 (34.4% withdrawn)". | T+17:12 → 22:14 | Yes | 10× is too fast for a 25-step window (S-2). | s07_open, s07_a, s07_done |
| 8 | "Withdraw the last short pull and plot the final point the approach is built on." | 10×; held 1.3 s wall, 195 → 203. SR 7.6e3. Rate +0.49 → +0.03 over about 3.8 plant-min at 1×. Plotted: "≈ step 210 (33.5% withdrawn)", "C = 14286 cps → 1/M = 0.038". | T+22:36 → 28:00 | Yes | "six plant-minutes … back to zero" vs "+0.01 to +0.03". I plotted at +0.03 (S-1). | s08_open, s08_a, s08_done |
| 9 | "Bring the control rods to the edge of criticality without going past it." | 9a: pressed SLOW; held 26 s wall at 1×, 203 → 207 (210 − 3). 9a ticked about 70 plant-s later; speed went to 10× on its own. 9b: pressed 1×, tapped WITHDRAW (the rod moved about 6 plant-s later), pressed 10×, waited 5 plant-min. Three taps: 208 → +0.04, 209 → +0.05, 210 → +0.06 (PERIOD 405 s). 9b ticked. | T+28:10 → 50:57 (≈ 23 plant-min, ≈ 8 min wall) | Yes | Rate never near the 0.15 "as written" (S-4). SOURCE RANGE went blank as promised. The long note pushes Continue below the fold while the 1/M window is open (S-5). | s09_open, s09_a, s09_tap1, s09_tap2, s09_tap3 |
| 10 | "Let the reactor carry power up from critical, reading INTER RANGE rather than REACTOR POWER." | Left the rods alone at 10× (auto). IR 1.2e-8 → 1.3e-7 at T+1:11 → 4.2e-6 A when REACTOR POWER first read 0.1 %. | T+51:19 → 1:38:51 (≈ 47 plant-min, 5 min wall) | Yes | Text says 25–35 plant-min; it took 47 because of the slow rate (S-4). On completion the speed dropped to 1× on its own. | s10_open, s10_done |
| 11 | "Let power climb past the point of adding heat, tapping WITHDRAW only if the climb stalls." | Closed the 1/M window with its ✕. 5× (auto). Rods untouched; the rate drifted +0.06 → +0.03 and never hit 0.00, so no tap. Power 0.1 → 0.5 %. | T+1:39:15 → 2:00:46 (≈ 21.5 plant-min) | Yes | Text says about 15 plant-min. | s11_open, s11_b |
| 12 | "Let power level itself off below 5 %." | 10× (auto). Watched: power 0.6 → 1.0 %, rate +0.03 → +0.00, AVG COOLANT TEMPERATURE 548 F. | T+2:01:06 → 2:24:41 (≈ 24 plant-min, 2.3 min wall) | Yes | Matches "about twenty plant-minutes" and "near 1 to 3 %". | s12_open, s12_a |
| 13 | "Cross the 5 % line deliberately. That is Mode 1, At Power." | Pressed SLOW; held WITHDRAW 30.5 s wall at 5×, 210 → 228. Released at 5.1 %; read 5.4 % 2 s later. | T+2:24:55 → 2:28:14 | Yes | 18 steps, not "about 13" (S-6). | s13_open, s13_done |
| 14 | "Put the turbine on line and let the reactor follow it up." | 14a: pressed LATCH (ticked; speed went to 10× on its own). 14b: typed 10 + Enter in the LOAD box. OUTPUT 10 MW; power 9.2 → 10.8 %; AVG COOLANT TEMPERATURE 553 → 552 F. | T+2:28:22 → 2:31:53 | Yes | None. The reactor followed the turbine as described. | s14_open, s14_latch, s14_load, s14_done |
| 15 | "Block the first startup trip once REACTOR POWER is above 9 ½ %." | REACTOR POWER 11.0 %. Pressed TRIP BLOCKS; the panel opened ("0 of 4 BLOCKED · 2 AVAILABLE TO BLOCK NOW · 2 WAITING ON ITS PERMISSIVE"). Pressed BLOCK on the IR HIGH FLUX row, which reads BLOCKED. | T+2:32:00 → 2:32:20 | Yes | "power-range meter" is not a board label (S-7). The panel covers the PRESSURIZER card. | s15_open, s15_panel, s15_block |
| 16 | "Block the second startup trip and close the panel." | The panel was closed (Continue click closed it, as stated). Reopened TRIP BLOCKS, pressed BLOCK on PR HIGH (LOW SETPT); both rows read BLOCKED ("2 of 4 BLOCKED"). Pressed TRIP BLOCKS again and the panel closed. | T+2:32:28 → 2:32:46 | Yes | None. The text predicted the panel behaviour exactly. | s16_open, s16_panel, s16_blocked, s16_closed |
| 17 | "Verify Mode 1, At Power." | Read REACTOR POWER 11 % and OUTPUT 10 MW. Pressed Continue. | Instant; complete at T+2:33:01 | Yes | Completion card offers "Next: Mode 1, At Power — power ascension to 100 % ▸". | s17_open, s18_complete |

**Layout (goal line, lettered substeps, each with action / done-when / note / speed): it helps.** The ✓/○/· markers show at a glance which substep is live. The grey done-when line under each action ("SOURCE RANGE reads 7.0e2 (700 counts per second) or more") is the most useful single line on the panel.

Two things confuse:
- the italic note often contains a *second* stop rule that competes with the action line (S-1);
- the "Suggested time warp" per substep becomes an actual speed change without any announcement (S-3).

In step 9 the note is a long decision table in one paragraph. It is readable, but it would scan better as a list.

**Things I did that the text did not say:**
- Pressed 1× myself before each step 9 tap. The text did say it, but the auto-speed had just set 10×.
- Picked "SOURCE RANGE reached" over "rod position window" as the stop rule in steps 5–8, because the text gives both and does not rank them.
- Picked ≤ +0.03 as the "rate has fallen" threshold before each plot, because the text gives both +0.01–0.03 and 0.00.
- Left the 1/M window open from step 4 to step 11, because nothing said to close it.

## 4. Words and numbers vs. the board

| The walkthrough said | What is actually on the board |
|---|---|
| "power-range meter" (step 15) | No such label. REACTOR POWER (top tile) is presumably it. |
| "IR HIGH FLUX" | Only inside the TRIP BLOCKS panel. The board tile is "INTER RANGE"; nothing links IR to INTER RANGE. |
| "BORON STATUS reads DILUTING" | Read HOLD throughout (boron already 719). Never saw DILUTING. |
| "RCP FLOW on" | Tile "RCP FLOW 100 %" with OFF / ON buttons (ON lit). OK, but the value is a percentage, not "on". |
| "SOURCE RANGE passes 7.0e2" then "Stop when CONTROL ROD POSITION reads about 80 to 100" | Tile hit 7.4e2 at 73 steps on noise, then settled at 6.3–6.9e2. |
| "STARTUP RATE … back to 0.00" (steps 5, 8) vs "+0.01 to +0.03" (same substeps) | Reached +0.03 in 2.5–4 plant-min; 0.00 takes far longer. |
| "about 13 steps" (step 13) | 18 steps (210 → 228) to read 5.1 %. |
| "twenty-five to thirty-five plant-minutes" (step 10) | 47 plant-min at rate +0.05–0.06. |
| "About 15 plant-minutes" (step 11) | 21.5 plant-min. |
| "Around 0.15, with PERIOD 150 to 200 seconds, is this approach going as written" | Best reached +0.06 / PERIOD 405 s after three taps from 3 short. |
| "critical around 208 of 627 steps" (step 2 BACKGROUND) | Critical near 207–210; 1/M finished at 210. Consistent. |
| "OPΔT", "DPM", "cps", "A" units | On the board. DPM is explained only indirectly (step 8: "1.0 means power is multiplying by ten every minute"); OPΔT never mentioned. |
| `#warpInfo` | Empty for the whole run, including every auto speed change. |

Every other control word the text named I found by its exact label on the first try: ACK, BORON (card), SG FEED AUTO, HOLDING, 1/M PLOT, Plot point, CONTROL WITHDRAW, MED, SLOW, CONTROL ROD POSITION, SOURCE RANGE, STARTUP RATE, INTER RANGE, PERIOD, REACTOR POWER, LATCH, LOAD, OUTPUT, TRIP BLOCKS, BLOCK, PR HIGH (LOW SETPT), BLOCKED, P-10 PERMISSIVE, the 1/M window ✕.

## 5. What the text got right

- Step 1 names the one standing alarm by its exact text and says to ACK it.
- The count shorthand explainer in step 4 ("7.0e2 is 700 counts a second").
- Each done-when line quotes the exact tile name and threshold.
- Step 9 warns that a short hold at SLOW at 1× moves nothing, and that 9a ticks only after the rods have been still for a plant-minute. Both happened exactly so.
- Step 9's outcome table covered the result I actually got (0.06–0.10, "levels lower (about 1 to 1½ %)"). Power levelled at 1.0 %.
- Steps 9–11 warn that SOURCE RANGE goes blank above 1.0e5. It did, and INTER RANGE carried on.
- Step 10 warns that REACTOR POWER sits at 0.0 % for a long time, which stopped me from pulling rods.
- Step 12's "the climb stops by itself about twenty plant-minutes after this step opens" was accurate (≈ 24).
- Step 14 explains the turbine-leads, reactor-follows coupling, and the board showed it: power 9.2 → 10.8 % with the rods still.
- Step 16 predicts the panel's click-outside-closes behaviour and says to close it with TRIP BLOCKS. Both are exact.
- The 1/M panel prints the prediction as a rod step, as step 6 BACKGROUND promises. The predictions walked in 252 → 216 → 210, as described.
- The completion card names the next leg.
