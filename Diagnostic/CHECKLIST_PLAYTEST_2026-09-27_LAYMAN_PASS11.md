# Layman playthrough — pwr_startup (Mode 3, Hot Standby → Mode 1, At Power)

> **Record, not policy.** Layman pass 11, 2026-09-27, ONE LEG (`pwr_startup`), on `develop` `64f4eb93` (Alpha 1.8.0-rc8 + #808: Mode 3 on aux feed, new step 13 feed transfer, power-range high trip 115 %), headless Edge: 18 of 18 steps, no trip, no strand. Verified 2026-09-27 (develop-h, fixes in `410d43b2`); every claim below was the reviewer's until the **Measured** line under it. **S-1** STOP text disagreement: CONFIRMED — the scanner was stale, STOP leaves the auto-start armed (fixed); the unlit AUTO lamp in `43_step13c.png` did NOT reproduce · **S-2** RELEASE? on the SR row: CONFIRMED as wording, not fixed · **S-3** "stay at 7.0e2": NARROWED — the check grades a 30 s trailing average, not the tile · **S-4** >2 % timing: CONFIRMED, cutoff moved to 1.5 % and put in the instruction · **S-5** wrong step number: CONFIRMED, fixed · **S-6/S-7/S-8**: not measured.


Build under test: Alpha 1.8.0-rc8 + develop 64f4eb93. Page: `ui/shell.html?engine=pwr2`, headless Edge 1600×1000.
Wall time for the leg: ~30 min. Plant time: T+00:00:00 → T+01:24:07.
Screenshots: `shots/` in this directory (named below).

## 1. Outcome

| Leg | Result | Steps completed | The one thing that mattered |
|---|---|---|---|
| pwr_startup | **COMPLETE** — "Walkthrough complete … Reactor critical in Mode 1, At Power, OUTPUT 10 MWe, SR HIGH FLUX, IR HIGH FLUX and PR HIGH (LOW SETPT) all blocked." | 18 / 18 | No hard stop. The feedwater step (13) worked as written, but the board's own help text for the aux feed STOP button contradicts the walkthrough about what STANDBY means (S-1). |

Final board: REACTOR POWER 10.5 %, AVG COOLANT TEMPERATURE 549 °F, PRIMARY PRESSURE 2230 psi, SG LEVEL 66 %, STEAM FLOW 98 gpm, AUX FEED WATER STANDBY, SG FEED AUTO/HOLDING, rods 222/627.

## 2. Stuck points, ranked by severity

None of these stopped me. They are ranked by how badly they could mislead a layman.

**S-1 — Step 13c: the walkthrough and the board disagree about what aux feed STOP does.**
Step text: *"13c· Press STOP on the AUX FEED WATER card and check the card reads STANDBY."* / *"STANDBY means the pump is stopped but still starts by itself if steam generator level falls too low."*
The SCANNER line when I pressed STOP: **"STOP (Auxiliary Feedwater (AFW)) — Secures BOTH auxiliary feed pumps and disarms the auto-start."** Hovering the card's AUTO button: **"AUTO (Auxiliary Feedwater (AFW)) — Arms AFW to auto-start on low steam generator level."** After STOP the card reads STANDBY and AUTO is not lit (shot `43_step13c.png`).
What I did: pressed STOP as told; step ticked. I could not tell from the screen which statement is true, and I did not test it (the walkthrough did not ask me to lower SG level).
What would have unstuck me: one of the two texts changed so they agree — either "STANDBY: stopped, will still auto-start" on the scanner, or the step saying "press AUTO afterwards if you want it to start by itself".
**Measured:** full stack, hot_zero_power, `set_afw {active:false}`: the arm stays `auto`, card STANDBY; with no feed, level 36.5 -> 16.5 % in 47 plant-min, then the 17 % low-low start ran both pumps (and tripped the reactor). A fresh headless page draws AUTO `bd-active` after STOP. **Verdict:** confirmed — the scanner text was stale (fixed in `410d43b2`, with Manuals 03 §10.0); the unlit-lamp observation did not reproduce.

**S-2 — Step 17 / TRIP BLOCKS panel: a red "RELEASE?" confirmation sitting on the SR HIGH FLUX row that I never asked for.**
Panel text at step 16 and 17 (shots `51_tripblocks2.png`, `55_tb3.png`): SR HIGH FLUX row reads **"RELEASING THIS WILL TRIP THE REACTOR NOW — the setpoint is crossed. Press again to confirm."** with a red **RELEASE?** button. I pressed BLOCK on that row exactly once, in step 9, and the panel showed it as blocked then (SOURCE RANGE went to a dash). The next time I opened the panel it looked like a half-finished "are you sure?" prompt.
What I did: avoided that row entirely.
What would have unstuck me: the row reading plainly "BLOCKED" (with release as a separate, obviously deliberate action), or a line in step 16/17 saying "the SR HIGH FLUX row shows RELEASE? — leave it alone".
**Measured:** from step 11 on, with no press, the row draws "RELEASE?" and "…Press again to confirm." — the release WARNING (trip blocked, signal standing above setpoint), not a pending confirm; one click shows CONFIRM, the second releases and trips (browser check, same day). **Verdict:** confirmed as a wording defect (the text of a pending confirm on a row nobody pressed); not fixed here.

**S-3 — Step 5a: the check-off ticked while the number on the board was below the target, contradicting "stay at 7.0e2 or more".**
Step text: *"The check-off waits for SOURCE RANGE to stay at 7.0e2 or more, not just touch it."* I held WITHDRAW to 66 (SR touched 7.0e2), watched 12 s: readings 7.1e2, 6.9e2, 6.6e2, 7.0e2, 6.7e2, 6.5e2, 7.2e2, 6.6e2, 6.9e2, 6.4e2, 6.9e2, 6.3e2 — no tick. Tapped WITHDRAW 4 times (67–70) with half a plant-minute each; it ticked at 70 while the board read **6.7e2**. Then the point was plotted at "C = 642 cps".
What would have unstuck me: nothing blocked me; but a layman trying to see "stays at 7.0e2" on the display will never see it — the grading is evidently on something smoother than the displayed number. Say "averages about 7.0e2" instead. (Same pattern at 6a: ticked while the display showed 1.3e3–1.5e3.)
**Measured:** step 5's check grades the source-range instrument as a 30 s trailing average >= 695 cps; the tile draws the instantaneous reading. **Verdict:** narrowed — the grading is sound, "stay at 7.0e2" overstates what the player can see; not fixed here.

**S-4 — Step 13a: "If REACTOR POWER reads above 2 %, type 100 instead" is ambiguous in time.**
Step text: *"Typing 50 starts the main feed pumps in MAN at 50 gpm; about 7 plant-minutes. … If REACTOR POWER reads above 2 %, type 100 instead: 50 gpm cannot keep up."*
Power was 1.0 % when I typed 50, but with the rods untouched it climbed 1.3 → 1.6 → 2.0 → 2.3 % during the wait. It is not clear whether I should re-type 100 when it crosses 2 % mid-step. I did not; level still went 34 → 60 % in ~8.7 plant-minutes (T+01:06 → T+01:14:49) and ticked.
What would have unstuck me: "…reads above 2 % *when you start this step*".
**Measured:** 50 gpm from 1.0 / 1.5 / 2 / 3 / 4 / 5 % reaches 60 % in 9.4 / 25.5 min, then stalls at 44-48 / 36.6 / 33 %, and trips on low-low at 5 %; 100 gpm in 3.1-9.3 min at every level; Tavg never below 547.4 °F. **Verdict:** confirmed — cutoff moved to 1.5 % and into the instruction, plus a "level stops rising for 3 plant-minutes, type 100" way out (`410d43b2`).

**S-5 — Step 8 cites the wrong step number.**
Step 8 text: *"The rate step 9 asks for shows 3 to 5 steps past the predicted position (measured)."* Step 9 is "Block the source range trip at P-6"; the STARTUP RATE target is in step 10.
What would have unstuck me: "step 10".
**Measured:** the rate target is step 10 in the built pool. **Verdict:** confirmed, fixed (`410d43b2`).

**S-6 — Step 8b: the done-when and the note pull in opposite directions.**
Step text: *"Wait for STARTUP RATE to read +0.03 or less, then press Plot point"* and *"STARTUP RATE takes about 5½ to 6½ plant-minutes to reach +0.03 here. A point plotted before then puts the predicted position further out than it is."* In my run STARTUP RATE already read +0.03 before I finished tapping (I had stopped at 198 after overshooting to 196 in step 7), and read +0.01 within seconds. So the literal instruction said "plot now" while the note said "wait 5½ minutes". I followed the literal instruction; prediction came out step 209 and the reactor was in fact critical around 206 (11b levelled at 206), so no harm.
What would have unstuck me: "wait for +0.03 or less; if it already reads that, plot now".

**S-7 — Main Menu was already open on load.** The brief said Plant & Mission is not open on load; the `#missionOverlay` was open and swallowed the click on Main Menu (shot `03_overlay.png`). Harmless for a real player (they would just see the menu).

**S-8 — The 1/M Startup Plot window covers part of the board and panel from step 4 to step 12** (it sits over the SG FEED card top, the speed bar and the left edge of the Instructor tab — shot `10_step4_plotted.png`). Step 12 finally says to close it. Nothing I needed was hidden in steps 4–11, but it hid the SG FEED card status while open.

## 3. Per-step log

Speeds: the "Walkthrough sets time warp" box stayed ticked. Each new step opened at 1×; I pressed the suggested speed myself where needed.

| Step | First sentence | What I did | Time to satisfy | Continue lit? | Confusion / notes | Shot |
|---|---|---|---|---|---|---|
| 1 | "Verify the plant is in Hot Standby (Mode 3)." | Read the five checks: 547 °F, 2235 psi, RCP FLOW 100 %, STARTUP RATE +0.01, SHUTDOWN 627/627. All pre-ticked. | 0 | Yes, at once | None. Turbine Trip / Low Steam Demand alarm present, text warned of it. | `05_step1.png` |
| 2 | "Dilute boron to the estimated critical concentration, 719 ppm." | Nothing; BORON ON lit, target 719, BORON CHEM 719, STATUS HOLD — all pre-ticked. | 0 | Yes | Background: "a dilution that doubles the SOURCE RANGE count is stopped and checked… the count roughly triples during this dilution by design" — confusing to a layman (why is tripling fine if doubling is a stop?), but not needed here. | `06_step2.png` |
| 3 | "Line up the steam generator (SG) before taking the reactor critical." | Nothing; AUX FEED WATER RUNNING, STEAM DUMP AUTO, DUMP SETPOINT 1020. Pre-ticked. | 0 | Yes | Background says aux feed "holds SG level near 33 %"; board read 37 %. Board also showed SG FEED OFF, AFW FLOW 7 gpm. | `07_step3.png` |
| 4 | "Take the 1/M baseline point before any rod moves." | Pressed 1/M PLOT on ROD CONTROL, then Plot point in the window that opened. | ~5 s | Yes | Window opened over the right part of the board. Baseline "C0 = 489 cps". | `09_1m_panel.png`, `10_step4_plotted.png` |
| 5 | "Take the second 1/M point, after the first rod pull." | MED already lit. Held CONTROL WITHDRAW 9.3 s wall until SOURCE RANGE showed 7.0e2 (rods 0→66; text predicted 75–80). Watched 12 s: count wandered 6.3e2–7.2e2, no tick. Tapped WITHDRAW 4× with ~half plant-minute each → 70; 5a ticked (display 6.7e2). STARTUP RATE +0.00, pressed Plot point. | ~1 plant-min | Yes | S-3. Speed went to 10× by itself when rods moved, as promised. Prediction "critical 292". | `12_step5_released.png`, `13_step5_watch.png`, `14_step5_taps.png`, `15_step5_plot2.png` |
| 6 | "Take the third 1/M point." | Held WITHDRAW 11.9 s until SR 1.4e3 (70→155; text said 150–155 ✓). 6a ticked ~2 s later. STARTUP RATE +0.01; Plot point. Prediction step 232. | ~1 plant-min | Yes | None. | `17_step6_held.png`, `18_step6_plot3.png` |
| 7 | "Take the fourth 1/M point, after a shorter pull." | Held WITHDRAW 6.0 s until SR 3.0e3; released at 196 (text 190–192; I overshot by 4 because the rods keep moving while the count catches up). Waited for STARTUP RATE to fall from +0.25 to +0.03 (~2 plant-min). Plot point → step 212. | ~3 plant-min | Yes | Overshoot is easy on a hold; count lags rod motion. | `20_step7_held.png`, `21_step7_plot4.png` |
| 8 | "Take the final 1/M point, the one the approach to critical is built on." | Tapped WITHDRAW 2× (197, 198), 6 s apart; 8a ticked at SR 7.9e3. STARTUP RATE already +0.01–0.03; pressed Plot point → **predicted step 209**. | ~3 plant-min | Yes | S-5 (wrong step number), S-6 (note vs done-when). | `23_step8_taps.png`, `24_step8_plot5.png` |
| 9 | "Block the source range trip at P-6." | 9a pre-ticked (INTER RANGE 2.4e-10 A). Pressed TRIP BLOCKS, BLOCK on SR HIGH FLUX, SOURCE RANGE went to "—", pressed TRIP BLOCKS again. | ~30 s | Yes | Panel is clear: "SR HIGH FLUX · STARTUP TRIP · 1E5 cps · (P-6 PERMISSIVE) · ALSO SWITCHES OFF THE DETECTOR". | `26_tripblocks_panel.png`, `27_sr_blocked.png`, `28_step9_done.png` |
| 10 | "Take the reactor critical and set STARTUP RATE between +0.3 and +1.0." | Pressed SLOW. Held WITHDRAW 56 s wall at 1× from 198 to 206 (3 short of 209); 10a ticked. Held WITHDRAW 93.5 s more until STARTUP RATE +0.50 (stopped at 218). It settled +0.45 → +0.38; 10b ticked ~65 s after release. | ~4 plant-min | Yes | "one step every 8 plant-seconds" matched (7–7.8 s). "Rods stop about 12 steps past the prediction" — I stopped 9 past. | `30_step10a.png`, `31_step10b.png` |
| 11 | "Level power at 1.0e-8 A and record the critical rod position and boron." | Waited 66 s wall at 1× for INTER RANGE 1.1e-8 A. Pressed MED, held INSERT 14.5 s (218→206, 12 steps). Pressed 10×, waited 2 plant-min: STARTUP RATE −0.02 → 11b and 11c ticked at once. Critical point: **206 steps, 719 ppm**. | ~3 plant-min | Yes | 11c "Write down…" ticks by itself — fine. | `33_step11_inserted.png`, `34_step11b.png` |
| 12 | "Raise power to the point of adding heat, about 1 %." | Closed 1/M window (✕). Pressed SLOW, 10×. Tapped WITHDRAW 6× one plant-minute apart (207→212): STARTUP RATE +0.01, .04, .06, .09, .12, .15 → 12a ticked. Left rods alone: REACTOR POWER 0.0 % until ~T+00:55, reached 1.0 % at T+01:05:31 with STARTUP RATE +0.08 → 12b and 12c ticked together. | ~31 plant-min (text: "about 20") | Yes | "Expect 6 or 7 taps" ✓. Power wait was 26 plant-min vs "About 20". | `36_step12a.png`, `37_step12bc.png` |
| 13 | "Put main feed in service and secure auxiliary feed." | Board at start: SG LEVEL 34 %, SG FEED OFF, AFW FLOW 20 gpm, FEED FLOW 7 gpm, STEAM FLOW 13 gpm, power 1.0 %. Clicked the number box on the SG FEED card (the one to the right of RESTORE, reading "0 gpm", glowing), typed 50, Enter. Card went to MANUAL, FEED FLOW 50. Pressed 10× myself (not set by itself). SG level 34→60 % in ~8.7 plant-min; power drifted 1.0→2.3 % with rods still. 13a ticked. Pressed SG FEED AUTO (13b ticked; card status HOLDING, box then read 135 gpm, later 85). Pressed AUX FEED WATER STOP → STANDBY (13c ticked). | ~10 plant-min | Yes | S-1, S-4. During 13a the AFW FLOW gauge read 0 gpm while the AUX FEED WATER card still read RUNNING (shot 41). The gpm box sits next to a label "RESTORE", which is itself a button — the box is findable because it glows and is the only gpm box on the card. After AUTO the box shows a changing number (135, 85) I did not type — mildly confusing. | `39_sgfeed_before.png`, `40_sgfeed_50.png`, `41_step13a.png`, `42_step13b.png`, `43_step13c.png` |
| 14 | "Raise power past 5 %, into Mode 1, At Power." | SLOW, 5×. Five pulls of 2 taps each, waiting each time for STARTUP RATE to peak (0.06–0.16) and fall to ≤ +0.10: power 2.7, 3.2, 4.0, 5.0, 5.6 %. Ticked after pull 5 (rods 222). | ~4.3 plant-min | Yes | "Expect about 5 pulls and 5 plant-minutes" ✓. | `45_step14.png` |
| 15 | "Put the turbine on line and let the reactor follow it up." | LATCH (15a ✓). Clicked LOAD box, typed 10, Enter; 10×. OUTPUT 5 → 8 → >8 MW in ~1 plant-min (15b ✓). Pressed STEAM DUMP AUTO; header changed PRESS → TAVG (15c ✓). | ~1.5 plant-min | Yes | Text says "wait for the generator to read above 8 MW"; the board word is OUTPUT — findable. | `47_latched.png`, `48_step15b.png`, `49_step15c.png` |
| 16 | "Block the first startup trip, IR HIGH FLUX." | Waited at 1× 32 s wall for REACTOR POWER 9.6 %. TRIP BLOCKS → BLOCK on IR HIGH FLUX; stayed BLOCKED (power 10.0–10.2 %). Closed the panel. | ~40 plant-s | Yes | S-2 (the SR row's RELEASE?). | `51_tripblocks2.png`, `52_ir_blocked.png`, `53_step16.png` |
| 17 | "Block the second startup trip, PR HIGH (LOW SETPT)." | TRIP BLOCKS → BLOCK on PR HIGH (LOW SETPT). Panel: "3 of 5 BLOCKED"; IR HIGH FLUX BLOCKED, PR HIGH (LOW SETPT) BLOCKED. Closed panel. | ~15 s | Yes | S-2 again. | `55_tb3.png`, `56_pr_blocked.png`, `57_step17.png` |
| 18 | "Verify the plant is in Mode 1, At Power." | Both checks pre-ticked (power 10.x %, OUTPUT 10 MW). | 0 | Yes | None. | `58_step18.png` |
| end | "Walkthrough complete" | — | — | — | Offers "Next: Mode 1, At Power — power ascension to 100 % ▸". | `59_finished.png` |

Things I did that the text did not say:
- Pressed the 10× speed button myself in steps 11, 12, 13 and 15 and 5× in 14 (the step's "Suggested time warp" line named it; the box "Walkthrough sets time warp" only set it by itself in steps 5–8 once rods moved). Not required to pass, just to save time.
- Closed the TRIP BLOCKS panel at the end of step 16 (step 16 does not say to; step 17 says it will already be shut).
- In step 5 I needed 4 extra single-step taps (the text anticipates this: "tap WITHDRAW one step and wait half a plant-minute").

## 4. Words and numbers vs the board

| Walkthrough said | On the board |
|---|---|
| "AUX FEED WATER card … STANDBY means the pump … still starts by itself" (13c) | Scanner on STOP: "Secures BOTH auxiliary feed pumps and **disarms the auto-start**." AUTO unlit after STOP. |
| "the SG FEED gpm box" (13a) | Unlabelled number box beside a "RESTORE" button, showing "0 gpm" — found, but the only caption next to it is RESTORE. |
| "the generator to read above 8 MW" (15b) | "OUTPUT 10 MW" on the TURBINE-GENERATOR card. |
| "SOURCE RANGE … stay at 7.0e2 or more" (5a) | Ticked with the display at 6.7e2; point plotted at "C = 642 cps". |
| "this lands near CONTROL ROD POSITION 75 to 80" (5a) | SR first showed 7.0e2 at 66; tick came at 70. |
| "The rate step 9 asks for" (8) | Step 9 is the P-6 block; the rate target is step 10. |
| "holds SG level near 33 %" (3 background) | STEAM GENERATOR LEVEL 37 % at step 3, 34 % at step 13. |
| "About 20 plant-minutes" to 1.0 % (12b) | 26 plant-minutes (T+00:39:29 → T+01:05:31). |
| "about 7 plant-minutes" SG level to 60 % (13a) | ~8.7 plant-minutes. |
| AFW "RUNNING" (card) during 13a | AFW FLOW gauge 0 gpm once main feed was at 50 gpm. |
| TRIP BLOCKS panel, SR HIGH FLUX row, after being BLOCKED in step 9 | "RELEASING THIS WILL TRIP THE REACTOR NOW — the setpoint is crossed. Press again to confirm." + red RELEASE? |

## 5. What the text got right

- Every control named in the steps (1/M PLOT, Plot point, CONTROL WITHDRAW/INSERT, SLOW/MED, TRIP BLOCKS, BLOCK, LATCH, LOAD, STEAM DUMP AUTO, SG FEED AUTO, AUX FEED WATER STOP) exists on the board under those exact words.
- The count shorthand explanation ("7.0e2 is 700 counts a second") made every SOURCE RANGE target readable.
- The 1/M rod-position windows (150–155, "reaches 7.0e3 about when … 205") matched within a few steps.
- P-6 "near CONTROL ROD POSITION 198" matched exactly (9a ticked at 198).
- "one step every 8 plant-seconds" at SLOW matched (7–7.8 s measured).
- "Expect 6 or 7 taps" (step 12) — 6. "Expect about 5 pulls" (step 14) — 5.
- The recovery instructions ("if it only touches … tap WITHDRAW one step and wait half a plant-minute") were exactly what was needed in step 5.
- Step 13's warning to type 50 rather than press MAN, and its reason, was clear; the feed transfer went smoothly (level 34 → 60 → 66 %, power stayed ≤ 2.3 %, no alarms).
- Step 16's explanation of why BLOCK may not take below 9½ % was accurate; power crossed 9½ % 32 s after the step opened and the block held.
- Continue lit only when the instruments satisfied each step; speed dropped back to 1× on every new step.
