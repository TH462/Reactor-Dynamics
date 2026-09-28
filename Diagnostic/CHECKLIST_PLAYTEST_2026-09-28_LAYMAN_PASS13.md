> **Record, not policy.** Layman pass 13, 2026-09-28, `pwr_startup` only (Mode 3, Hot Standby to Mode 1, At Power), fresh from its preset, on `develop` `84504082` (Alpha 1.8.0-rc9 + #809), headless Edge 1600x1000: 1 of 1 leg complete, 18 of 18 steps, no strand, no Rewind. Verified 2026-09-28; every claim below was the reviewer's until the **Measured** line under it. **S-1** held pull overshoots at the auto 10×: CONFIRMED, owner decision (his rung ruling), step 8 is the case that reaches critical · **S-2** Plot point hidden with nothing glowing: CONFIRMED, fixed (1/M PLOT pulses while the window is shut) · **S-3** WITHDRAW steady while its row still wants it: CONFIRMED, fixed (held buttons steady only while held) · **S-4** 5a lands 72–73 not 75–80: NARROWED, tap route lands 72–74, text now 70 to 80 · **S-5** step 2 background contradicts itself: CONFIRMED, reworded · **S-6** TRIP BLOCKS pulses at 7.7 %: CONFIRMED, fixed (16a waits for 9.5 %) · **S-7** step 18 rings SG LEVEL, not OUTPUT: CONFIRMED, fixed · **S-8** 1/M window covers the Instructor tab edge and pause button: CONFIRMED, cosmetic, not changed. §4 words: SG FEED "HOLDING" now explained in 13b; PERIOD no longer ringed in step 10 (never named); step 8's speed line now says it sets itself; OPΔT not addressed (not in this leg's text).

# Layman playthrough: pwr_startup (Mode 3, Hot Standby to Mode 1, At Power)

Build: Alpha 1.8.0-rc9 + #809 (develop 84504082). Headless Edge, 1600x1000. Started from Main Menu, Walkthroughs, `▶ Start` on pwr_startup.
Wall time about 25 min. Plant time T+00:00:00 to T+01:30:34. No page errors logged. `#warpInfo` was empty for the whole run, and I saw no warp drop.

## 1. Outcome

| Leg | Result | Steps completed | The one thing that mattered |
|---|---|---|---|
| pwr_startup | **COMPLETE**: "Walkthrough complete. Reactor critical in Mode 1, At Power, OUTPUT 10 MWe, SR HIGH FLUX, IR HIGH FLUX and PR HIGH (LOW SETPT) all blocked." | 18 of 18 | Not being able to stop a held rod pull precisely once the walkthrough had set 10× by itself (step 6 overshot to 158 against the text's 150 to 155). No step stranded me. Every Continue lit off what the text told me to do. |

Key numbers: 1/M predictions ran 213, 216, 213, 209. The measured critical position was **206**, 3 steps short of the last prediction. The rods finished at 222 steps with 10.5 % power, 10 MW output, 719 ppm boron, Tavg 549 °F, 2237 psi.

## 2. Stuck points, ranked

None of these stopped me. They are ranked by how likely they are to stop or mislead a real layman.

**S-1: Step 6a. A held pull at the auto-set 10× cannot be stopped on the count.**
Text: "Hold CONTROL WITHDRAW until SOURCE RANGE reads 1.4e3 or more. … On a fresh core at 719 ppm this lands near CONTROL ROD POSITION 150 to 155." The ⏩ line says "Suggested time warp: 10×, set by itself once the rods start moving."
What I did: held WITHDRAW at MED and polled about every 0.4 s. At 10× the rods moved about 7 steps per wall-second (146 at 10.3 s, 158 at 11.9 s). I let go at **158**, past the text's 150 to 155. Step 7 was the same: I let go at 191, near its "190 to 192" limit. The noisy count hides the moment to let go. It read 1.2e3 at 146 and 1.4e3 at 158, then settled between 1.5e3 and 1.7e3.
What would have unstuck me: have the warp stay at 1× while the rods are held (or say "hold at 1×, then 10× to wait"), so a human can stop within a step or two of the stated position.
**Measured:** Headless Edge, 1600x1000, `hot_zero_power` (scratch `lp13/ui1.js`): auto took the clock from 1× to 10× 0.3 to 0.4 s after WITHDRAW went down in steps 5, 6, 7 **and 8**; the bank then moved about 7.3 steps per wall-second. A release polled every ~0.55 s landed at 157 in step 6 (text 150 to 155) and 194 in step 7 (text 190 to 192). The live-checklist route runner's typical route, which lets go on the first broadcast the tile reads the target, lands at 153 / 154 and 191 / 192 (seeds 42 / 7), so the stated windows are right for an instant release and a human's reaction time is what puts the stop past them. Step 8 is the one that matters: 194 to 197 in 0.63 s at the auto 10×, against "Do not hold past 205" with critical at 206 (this run) to 207–208 (step 8's own measurement); half a second late at 205 is 208 to 209.
**Verdict:** confirmed — the 10× on the pull is the owner's #807 item 9 rung (steps 5 to 7) and his 2026-09-25 step-8 format, so no change here; options put to him (see the #809 comment). Step 8's speed line now says "set by itself" because it measurably is.

**S-2: Steps 5b, 6b, 7b and 8b. "press Plot point" names a button that is hidden, and nothing glows to bring it back.**
Text (5b): "Wait for STARTUP RATE to read +0.03 or less, then press Plot point." Step 4's note told me to "close it with the ✕ in its corner between points", so the Plot point button was not on screen. In every one of these substeps the only glows were watch halos on STARTUP RATE and SOURCE RANGE. **Neither the 1/M PLOT button nor anything else pulsed.** Once I re-opened the window, the glow did move onto Plot point.
What I did: remembered step 4's note, pressed 1/M PLOT, then Plot point.
What would have unstuck me: when the window is closed, give the 1/M PLOT button the step glow (as step 4a does), or write "press 1/M PLOT, then Plot point" in the substep itself.
**Measured:** Same headless run, before the fix: in 5b, 6b and 7b with the window shut, the `Plot point` pulse sat on a 0x0 hidden button and 1/M PLOT carried no class at all; after 1/M PLOT was pressed the pulse was visible on Plot point.
**Verdict:** confirmed, fixed. A shell target with no layout box now pulses the board's opener for the same label (1/M PLOT); opening the window moves the pulse onto Plot point, closing it moves it back. 5b to 8b now say "press 1/M PLOT, then Plot point". The close-between-points advice stays: it is what keeps STEAM GENERATOR LEVEL visible. `verify_e2e_ui` checks it with real pointer presses; injection (fallback removed) reds it.

**S-3: Steps 5a and 10b. The WITHDRAW glow goes "done" while the substep still needs WITHDRAW.**
Step 5a says to "tap WITHDRAW one step and wait half a plant-minute" if the count only touches 7.0e2. After my first hold, WITHDRAW's halo switched to the non-pulsing `ckl-step-done` style while 5a was still ○ at 6.5e2 to 7.0e2. Only MED (already lit) kept pulsing. In 10b ("Hold WITHDRAW at SLOW until STARTUP RATE reads +0.5"), WITHDRAW and SLOW both showed the done style from 10a. Nothing pulsed for the action 10b asked for.
What I did: followed the text, tapping 3 more times in 5a and holding again in 10b.
What would have unstuck me: re-arm the pulse on WITHDRAW whenever the active substep's text asks for WITHDRAW again.
**Measured:** Same run, before the fix: WITHDRAW went to `ckl-step-done` on the first pointerdown of 5a and stayed there after release with 5a unmet at bank 40 (5a ticks near 72). Step 10 authors no per-row `hl`, so 10a and 10b share one pressed-set and 10b inherits 10a's steady WITHDRAW.
**Verdict:** confirmed, fixed. A press-and-hold board button (the board marks them `data-momentary`) is steady only while held and pulses again on release while its row is unmet; latching controls (SLOW, MED, AUTO, a typed box) keep the owner's #755 item 19 rule. Measured after: pulse → steady while held → pulse after release. `verify_e2e_ui` checks it; injection (HEAD `ui/app.js`) reds it.

**S-4: Step 5a. The stated rod position does not match the count.**
Text: "On a fresh core at 719 ppm this lands near CONTROL ROD POSITION 75 to 80." The count first touched 7.3e2 at **69** and settled at 6.2e2 to 7.1e2. After 3 single taps, 5a ticked at **72 to 73**. That is short of the stated range, so a layman may doubt the tick or keep pulling toward 75.
What would have unstuck me: a range that includes about 70.
**Measured:** Route runner, seed 42 / 7: the typical route (hold until the tile reads 7.0e2, let go) ticks at 77 / 78. The gate's `flicker_release_5` route (let go at 69 on a flicker, then the note's single taps) ticks at 74; the headless run, same recovery, at 71 to 73; the reviewer at 72 to 73.
**Verdict:** narrowed — the range was right for the hold-to-count route and 2 to 4 steps high for the tap-recovery route the note itself sends the player down. Text now "70 to 80".

**S-5: Step 2. The background contradicts itself about dilution and counts.**
Text: "Real crews never add reactivity two ways at once … a dilution that doubles the SOURCE RANGE count is stopped and checked. Coming from the Mode 5 to Mode 3 walkthrough, the count roughly triples during this dilution by design." A layman reads that as "a crew would stop this, but you shouldn't". It did not matter here, because the Hot Standby preset ticks step 2 at once.
What would have unstuck me: one sentence saying why tripling is acceptable here.
**Measured:** Built pool, step 2 `why`: "a dilution that doubles the SOURCE RANGE count is stopped and checked" followed by "the count roughly triples during this dilution by design".
**Verdict:** confirmed (wording), fixed: "stopped and checked before it goes on … the count roughly triples over the whole dilution: that is expected, because the core is being brought near critical on purpose, and it is why the count is watched the whole way." No number changed.

**S-6: Step 16. TRIP BLOCKS pulses before the action is allowed.**
Text: "Wait for REACTOR POWER to read above 9½ % … Below 8 % the BLOCK button will not take the press at all." When step 16 opened at 7.7 %, TRIP BLOCKS was already pulsing (`ckl-step-glow`, cklGlow). A glow-follower would press it at 7.7 % and get a refused BLOCK. I waited: 9.6 % came 39 s wall (about 40 plant-seconds) later, and the block held.
What would have unstuck me: hold the pulse (or show a watch halo on REACTOR POWER) until power is above 9½ %.
**Measured:** Built pool: step 16 authored only a step-level `hl: ['Trip Blocks']`, so the pulse ran from entry. Route runner: REACTOR POWER on entry to step 16 is 7.70 / 7.50 / 7.68 % (typical seed 42, seed 7, pass-3 base), under the 8 % where BLOCK refuses.
**Verdict:** confirmed, fixed. Step 16 is now 16a "Wait for REACTOR POWER to read 9.5 % or more" (watch ring on REACTOR POWER, graded at the tile's 9.45 floor, latches once met) and 16b the press, which carries the TRIP BLOCKS pulse.

**S-7: Step 18. The watch halo sits on a tile the step does not name.**
18a names REACTOR POWER and 18b names OUTPUT. The halos were on the REACTOR POWER tile, the STEAM GENERATOR LEVEL tile (x=1002, not mentioned) and the whole TURBINE-GENERATOR card. OUTPUT itself had no halo of its own. This is minor, and the step was already ticked.
**Measured:** Built pool: step 18 `hl_watch: ['Reactor Power', 'Turbine Load', 'SG Level']`. `Turbine Load` resolves to the TURBINE-GENERATOR card; OUTPUT (`Generator Output`) was not in the list; SG LEVEL is named nowhere in step 18.
**Verdict:** confirmed, fixed: 18a watches REACTOR POWER, 18b watches OUTPUT, step list is those two.

**S-8: Step 4 onward. The 1/M window covers more than SG level.**
Step 4's note says "The 1/M PLOT window covers STEAM GENERATOR LEVEL". It also covers the left edge of the Instructor panel (the title clips to "lode 3, Hot Standby", and the tab reads "nstructor") and the pause button on the speed row (shots/s04c.png, s05d.png). This is cosmetic.
**Measured:** Reviewer's `shots/s05d.png` re-read: the floating 1/M window's right edge overlaps the Instructor tab ("nstructor") and the speed row's first button at 1600x1000.
**Verdict:** confirmed, cosmetic, not changed. With S-2 fixed the close-between-points habit is cued, which also clears these; moving the window is #713's placement and a layout trade-off, not a text fix.

## 3. Per-step log

Glow styles seen, as I name them below:
- **card**: `ckl-panel-glow`, a static outline around a whole card.
- **watch**: `ckl-watch-glow`, a static halo on a reading.
- **PULSE**: `ckl-step-glow` with animation cklGlow, on the control to press.
- **done**: `ckl-step-done`, the pulse stopped after the press.
- **rung**: `ckl-speed-rung` with cklRungGlow, on the suggested speed button.
- **Continue**: pulses with cklAckGlow when ready.

| Step | First sentence | What I did | Time to satisfy | Continue lit? | Glows (did they point right?) | Screens |
|---|---|---|---|---|---|---|
| 1 | "Verify the plant is in Hot Standby (Mode 3)." | Nothing. All five checks were already ✓ (547 °F, 2236 psi, RCP 100 %, 0.00 DPM, 627/627). | instant | yes | watch on AVG COOLANT TEMPERATURE, PRIMARY PRESSURE, STARTUP RATE, SHUTDOWN ROD POSITION, RCP FLOW. **Correct, all five.** | s01 |
| 2 | "Dilute boron to the estimated critical concentration, 719 ppm." | Nothing. The preset is at 719 ppm, as the ⏩ note says. | instant | yes | watch on BORON CHEM and BORON STATUS. Correct. | s02 |
| 3 | "Line up the steam generator (SG) before taking the reactor critical." | Nothing. AFW RUNNING, dump AUTO at 1020 psi. | instant | yes | card on STEAM DUMP; watch on STEAM PRESS and SG LEVEL; check-glow on DUMP SETPOINT. Correct. | s03 |
| 4 | "Take the 1/M baseline point before any rod moves." | Pressed 1/M PLOT, then Plot point (baseline C₀ = 471 cps). Closed the window with ✕ as the note says. | about 10 s wall | yes | PULSE on 1/M PLOT, which went done after the press. PULSE then moved to Plot point in the window. **Exactly right for each half.** | s04, s04b, s04c |
| 5 | "Take the second 1/M point, after the first rod pull." | 5a: held CONTROL WITHDRAW (MED already lit). Speed went to 10× by itself. Let go at 69 when the count touched 7.3e2. It settled at 6.2e2 to 7.1e2, so I tapped WITHDRAW 3 times with about 60 plant-s between taps. 5a ticked at 72 to 73. 5b: STARTUP RATE was already 0.00. Reopened 1/M PLOT and pressed Plot point. Prediction: **213**. Speed then dropped to 1× by itself. | 5a about 12 plant-min (mostly the tap-and-wait); 5b instant | yes | card ROD CONTROL; watch SOURCE RANGE and CONTROL ROD POSITION; PULSE on WITHDRAW and MED; rung on 10×. **WITHDRAW went done after the first hold while 5a was unmet (S-3).** In 5b only watch halos showed, with nothing on 1/M PLOT (S-2). | s05, s05b, s05c, s05d |
| 6 | "Take the third 1/M point." | Held WITHDRAW. 10× engaged by itself. Let go at 158 on 1.4e3 (S-1). Settled at 1.5e3 to 1.7e3 and 6a ticked. STARTUP RATE was already +0.01. Reopened 1/M PLOT, then Plot point. Prediction: **216**. | about 3 plant-min | yes | PULSE WITHDRAW; rung 10×. 6b: watch only, with no 1/M PLOT pulse (S-2). | s06, s06b, s06c |
| 7 | "Take the fourth 1/M point, after a shorter pull." | Held WITHDRAW to 191 (3.0e3). Waited about 3½ plant-min for +0.03, then plotted. Prediction: **213**. | about 4.5 plant-min | yes | Same pattern as step 6. | s07, s07b, s07c |
| 8 | "Take the final 1/M point, the one the approach to critical is built on." | Pressed 10× myself, because this step's ⏩ line does not say "set by itself". Held WITHDRAW and stopped at 205 per "Do not hold past 205". The count was 6.0e3 at release and rose to 7.4e3, then 1.1e4, and 8a ticked. STARTUP RATE reached +0.03 after about 5½ plant-min, matching the text. Plotted. Prediction: **209**. | about 6 plant-min | yes | PULSE WITHDRAW; rung 10×; watch in 8b. Speed stayed at 10× after the plot here, where step 5 had dropped to 1×. | s08, s08b, s08c |
| 9 | "Block the source range trip at P-6." | 9a already ✓ (IR 7e-10 A). Pressed TRIP BLOCKS, then BLOCK on the SR HIGH FLUX row, which read BLOCKED. SOURCE RANGE showed "–". Pressed TRIP BLOCKS again to close. | about 20 s wall | yes | PULSE TRIP BLOCKS (done after the press). In the panel, PULSE on the whole **SR HIGH FLUX row**. After BLOCK, nothing pointed back at TRIP BLOCKS for the "press again to close" part. Correct otherwise. | s09, s09b, s09c, s09d |
| 10 | "Take the reactor critical and set STARTUP RATE between +0.3 and +1.0." | 10a: pressed SLOW and held WITHDRAW from 205 to 206 (prediction 209 minus 3). It ticked the moment it hit 206. 10b: held WITHDRAW at SLOW for 98 s wall at 1× until STARTUP RATE read +0.50, at 218. That is 12 steps past 206, exactly as the text says. It settled at +0.40 to +0.41 and 10b ticked about 65 plant-s after release. | about 3 plant-min | yes | 10a: PULSE WITHDRAW and SLOW, watch STARTUP RATE, CONTROL ROD POSITION and PERIOD. **In 10b, WITHDRAW and SLOW showed done style, with no pulse for the second hold (S-3).** | s10, s10b, s10c |
| 11 | "Level power at 1.0e-8 A and record the critical rod position." | 11a ticked at 1.0e-8 A about 20 plant-s in. 11b: pressed MED and held INSERT 12 steps, 218 to 206, in 15.5 s wall at 1×. Pressed 10× to wait. STARTUP RATE read −0.07 → −0.02 and held there. 11b ticked about 2 plant-min after the rods stopped, and speed returned to 1× by itself. 11c ticked by itself ("Critical rod position recorded"): **critical at 206**, prediction 209. | about 3 plant-min | yes | 11a watch on INTER RANGE. 11b PULSE on **INSERT** and MED. **Correct: the glow moved from WITHDRAW to INSERT.** | s11, s11b, s11c |
| 12 | "Raise power to the point of adding heat, about 1 %." | 12a: SLOW, 10×, 6 single taps each read about 70 plant-s later: +0.01, +0.03, +0.07, +0.09, +0.12, +0.15. It ticked on the 6th ("Expect 6 or 7 taps" was right). 12b: speed went to 60× by itself. Power reached 1.0 % about 25 plant-min later ("About 20 to 26" was right). 12c ticked at the same moment (+0.08), and speed returned to 1×. | about 32 plant-min | yes | 12a PULSE WITHDRAW and SLOW, rung 10×. 12b watch on REACTOR POWER and INTER RANGE. Correct. | s12, s12b, s12c |
| 13 | "Put main feed in service and secure auxiliary feed." | Power was 1.1 %, so I typed 50 + Enter in the box beside RESTORE and pressed 10×. SG level went 35 → 60 % in about 9 plant-min while power drifted 1.1 → 2.3 % (text: "about 10 plant-minutes", "about 2½ %", both right). Pressed AUTO on SG FEED, then STOP on AUX FEED WATER, which read STANDBY. | about 10 plant-min | yes | card SG FEED; PULSE on the gpm box, then on **AUTO** (SG FEED), then card AUX FEED WATER with PULSE on **STOP**. Watch on SG LEVEL, FEED FLOW and REACTOR POWER. **Each lettered substep got its own button pulse, all correct.** | s13, s13a, s13b, s13c, s13d |
| 14 | "Raise power past 5 %, into Mode 1, At Power." | SLOW, 5×. Tapped WITHDRAW twice, waited for STARTUP RATE to peak (0.12 to 0.19) and fall to +0.10, and repeated. **5 pulls** (text: about 5): power 2.5 → 2.9 → 3.5 → 4.4 → 5.3 %, rods 212 → 222. It ticked above 5 %. | about 2.5 plant-min | yes | PULSE WITHDRAW and SLOW; rung 5×; watch STARTUP RATE, INTER RANGE and ROD POSITION. Correct. | s14, s14b |
| 15 | "Put the turbine on line and let the reactor follow it up." | Pressed LATCH. Typed 10 + Enter in LOAD and pressed 10×. The generator passed 8 MW about 2 plant-min later and power rose 5.6 → 7.4 % with no rod motion. Pressed AUTO on STEAM DUMP and the status read TAVG. | about 2 plant-min | yes | card TURBINE-GENERATOR; PULSE on LATCH, then the LOAD box, with watch on OUTPUT; then card STEAM DUMP with PULSE on **AUTO** and watch on its status. Correct per substep. | s15, s15b, s15c, s15d |
| 16 | "Block the first startup trip, IR HIGH FLUX." | Waited at 1×. Power rose 7.7 → 9.6 % in about 40 plant-s. Pressed TRIP BLOCKS, then BLOCK on the IR HIGH FLUX row. It read BLOCKED and held for 10 s while power reached 10.0 %. | about 50 plant-s | yes | **TRIP BLOCKS pulsed from the moment the step opened at 7.7 %, below where BLOCK takes (S-6).** In the panel, PULSE on the IR HIGH FLUX row. | s16, s16b, s16c |
| 17 | "Block the second startup trip, PR HIGH (LOW SETPT)." | Pressed TRIP BLOCKS, then BLOCK on PR HIGH (LOW SETPT), which read BLOCKED. Checked that IR HIGH FLUX also read BLOCKED, then pressed TRIP BLOCKS to close. | about 15 s wall | yes | PULSE TRIP BLOCKS, then PULSE on the PR HIGH (LOW SETPT) row. Correct. | s17, s17b, s17c |
| 18 | "Verify the plant is in Mode 1, At Power." | Nothing. Both checks were already ✓ (10.4 %, 10 MW output). Pressed Continue, which gave "Walkthrough complete". | instant | yes | watch REACTOR POWER; **watch on STEAM GENERATOR LEVEL, which the step does not mention**; card TURBINE-GENERATOR (S-7). | s18, s19_end |

Places where I did something the text did not say, to make a step pass:
- In steps 5b, 6b, 7b and 8b I pressed **1/M PLOT** to reopen the window before "Plot point". Step 4's note implies this, but the substep text does not say it.
- In step 8 I pressed 10× myself. The ⏩ line suggests it but does not say it sets itself, unlike steps 5 to 7.
- In step 11b I pressed 10× for the wait, as the ⏩ line says.
- I never had to press Rewind.

Speed behaviour seen: rod motion switched the speed to 10× by itself in steps 5 to 7, and after each plot it went back to 1×. In step 8 it stayed at 10× after the plot. 12b set 60× by itself. Each tick of 11b, 12c, 13a and 15b dropped the speed to 1×.

## 4. Words and numbers I could not find, or could not interpret

| Words on screen | Where | Problem |
|---|---|---|
| "Plot point" (5b, 6b, 7b, 8b) | 1/M PLOT window | Not visible once the window is closed as step 4 advised. Findable only by reopening 1/M PLOT (S-2). |
| "CONTROL ROD POSITION 75 to 80" (5a) | step note | The board ticked at 72 to 73. Not wrong enough to block me, but it doesn't match (S-4). |
| "SG FEED … HOLDING" | SG FEED card status, after AUTO | Never explained in the text. |
| "OPΔT 105.6 %" | NIS card header | Never explained, and it changed a lot (114.9 % at start). A layman may wonder if it is an alarm. |
| "TAVG" (steam dump status) | STEAM DUMP card | Found. Explained in 15c. |
| "Turbine Trip / Low Steam Demand" alarm | alarm list | Found. Explained in step 1 as expected. |
| "PERIOD ∞ s", then "1500 s" | NIS card | Haloed in step 10 but not explained in the text. |

Everything the steps named by exact words I found on the first try: AVG COOLANT TEMPERATURE, PRIMARY PRESSURE, RCP FLOW, STARTUP RATE, SHUTDOWN ROD POSITION, BORON card ON, the "0-2500 ppm" box, BORON CHEM, BORON STATUS, AUX FEED WATER RUNNING/STANDBY/STOP, STEAM DUMP AUTO, DUMP SETPOINT, 1/M PLOT, CONTROL WITHDRAW/INSERT, SLOW/MED, SOURCE RANGE, INTER RANGE, TRIP BLOCKS and its three rows, the gpm box beside RESTORE, SG FEED AUTO, LATCH, LOAD, OUTPUT.

## 5. What the text got right

- Step 4: the pulse moves from 1/M PLOT to Plot point inside the window. That is the model the other steps should follow.
- The shorthand explanation ("7.0e2 is 700 counts a second") made every count target readable.
- Step 8's "about 5½ to 6½ plant-minutes" to +0.03 matched what I saw (about 5½).
- Step 10's "The rods stop about 12 steps past where 10a let go" matched exactly (206 → 218).
- Step 11's "About 12 steps" of INSERT returned it to critical exactly: −0.02 held, and the pulse correctly moved to INSERT.
- Step 12's "Expect 6 or 7 taps" (6) and "About 20 to 26 plant-minutes" (about 25) were both right.
- Step 13's "about 10 plant-minutes" and "about 2½ %" were right (9 min, 2.3 %). Each substep got its own button pulse.
- Step 14's "Expect about 5 pulls" was exactly 5.
- Step 16's warning about the 8 to 9½ % band told me exactly when to press, and the block held.
- Step 9's "SOURCE RANGE reads a dash" confirmation was visible and reassuring.
- Step 17's "Any click outside the panel closes it, Continue included" explained why the panel had vanished.
- The ⏩ lines plus the automatic speed changes kept every wait short. The whole leg took about 25 wall-minutes.
