> **Record, not policy.** Layman pass on the #819 subtext cut, 2026-10-03, develop f591e272, run by a fresh agent with no repo access. 6 of 6 legs completed, 69/69 steps, no trip and no Rewind, in about 58 min wall time. Three findings trace to the cut (S-1 valve location, S-7 step 6a recovery) or to the undrawn done-when line (S-2 Enter); all three were fixed in the step text the same day. S-4 is narrowed: the row latched on a real transient dip. The pre-existing behaviour claims (S-3, S-5, S-6, S-8, S-9) were not re-measured and are not filed.

# Layman playthrough — six PWR walkthroughs, build develop f591e272 (Alpha 1.8.2-rc2)

Played as an intelligent layman, using only the walkthrough panel and the board. Headless Edge, 1600×1000.
Start page `ui/shell.html?engine=pwr2`. The page was blank when I took over, so I navigated to it myself (shot `a1_start` is blank, `a2_loaded` is the page).
Wall time: about 58 minutes for all six legs (02:50 to 03:49). Plant clock: T+00:00 to T+18:21.
No page errors were logged. Screenshots are in `shots/` and named per step (`h*` = Startup Part 1, `s*` = Part 2, `r*` = Part 3, `l*` = Shutdown Part 1, `t*` = Part 2, `u*` = Part 3).

## 1. Outcome

| Leg | Result | Steps completed | The one thing that mattered |
|---|---|---|---|
| Startup Part 1 (pwr_heatup) | Finished | 17/17 | Step 10 says "Open the accumulator valve" but does not say where it is. I found it on the second try, an unlabelled valve symbol on the diagram that lit up when I hovered the ACCUMULATORS tile. |
| Startup Part 2 (pwr_startup) | Finished | 18/18 | The automatic speed-up to 10× once rods move makes held WITHDRAW pulls overshoot: step 5 reached rod 101 against the "70 to 80" the text expects. The 1/M prediction (208) still landed within 1 step of the measured critical position (207). |
| Startup Part 3 (pwr_raise_power) | Finished | 9/9 | In stage 5 the Pressurizer Pressure Low alarm dropped the clock to real time for about 2.5 min of wall time while AVG COOLANT TEMPERATURE sagged to 542 °F, below the step's 550 °F floor. The text's "make the pulls on the next line" does not say whether to pull before 5b ticks. |
| Shutdown Part 1 (pwr_lower_power) | Finished | 6/6 | Step 6c ticked with AVG COOLANT TEMPERATURE at 561–562 °F, although the text says "until it reads below 557 °F". |
| Shutdown Part 2 (pwr_shutdown) | Finished | 3/3 | Nothing; it was clean. |
| Shutdown Part 3 (pwr_cooldown) | Finished | 16/16 | Step 4b, "Type 120 into DUMP SETPOINT.", does not say to press Enter. Typing alone did nothing for 8 s; Enter was needed. Step 7 repeats the accumulator-valve location problem. |

Every leg reached "Walkthrough complete" and offered the next leg. The chain ran unbroken from Cold Shutdown to full power and back to Cold Shutdown with no trip, no Rewind and no restart.

## 2. Stuck points, ranked by severity

### S-1 — The accumulator valve is named but never located (Startup Part 1 step 10; Shutdown Part 3 step 7)
**Measured:** Read the cut diff: both legs' notes held 'The valve symbol sits just above the ACCUMULATORS tile, left of ECCS INJ FLOW.' (8052485b heatup step 10, cooldown step 7); c29f20ab deleted it.
**Verdict:** confirmed — caused by the #819 cut. The location sentence was restored to both notes.
Step text: "10. Open the accumulator valve while PRIMARY PRESSURE is inside its window. … ○ Open the accumulator valve while PRIMARY PRESSURE reads 665 to 1615 psi, and check the ACCUMULATORS tile no longer reads ISOLATED." The Shutdown Part 3 version reads "○ Close the accumulator valve while PRIMARY PRESSURE is 1615 to 665 psi, and check the ACCUMULATORS tile reads ISOLATED."
- **What I did:** No button or label says "valve" or "accumulator valve". Attempt 1: I clicked the ACCUMULATORS tile ("ACCUMULATORS 100 % 665 psi ISOLATED"). Nothing changed (`h10_try1`). Hovering the tile had made the scanner read "Accumulator Status — ARMED, INJECTING or ISOLATED." and lit a box around an unlabelled valve symbol on the pipe just above the tile, left of the ECCS card (`h10_hover`). Attempt 2: I clicked that symbol and the step ticked (`h10_try2`). The scanner later called it "Accumulator Isolation Valve — Motor-operated valve in series with the accumulator check valves. Normally open." (`h11_done`).
- **What made it worse:** The step is time-boxed: "Above 1615 psi the valve locks", and heaters in AUTO are raising pressure. The clock was held at 1×, which bought time.
- **What would have unstuck me:** One clause saying where it is: "click the valve symbol on the pipe just above the ACCUMULATORS tile".

### S-2 — "Type 120 into DUMP SETPOINT." does not say to press Enter (Shutdown Part 3 step 4b)
**Measured:** The ask has read 'Type 120 into DUMP SETPOINT.' since before #819. Its done-when ('DUMP SETPOINT reads 120 psi') is no longer drawn. Number boxes commit on Enter (skill §5).
**Verdict:** confirmed, from before #819. The ask now says 'and press Enter'.
Step text: "4b○ Type 120 into DUMP SETPOINT. Suggested time warp: 1×. STEAM DUMP status reads RAMPING while it walks STEAM PRESS down to 120 psi by itself."
- **What I did:** I typed 120 exactly as told and waited 8 s. 4b stayed ○, the status stayed STM PRESS and nothing ramped (`u04_typed_noenter`). From the boron steps I knew Enter commits a box, so I pressed Enter. It ticked and the warp rose to 60× (`u04_set`).
- **Contrast:** Every boron step and the spray step say "type it … and press Enter", and Startup Part 1 step 14 says "Set SET PZR PRESSURE to 2235 psi". This is the only "Type N into …" wording, and the only one that leaves out Enter.
- **What would have unstuck me:** "Type 120 into DUMP SETPOINT and press Enter."

### S-3 — Held rod pulls overshoot because the speed rises on its own (Startup Part 2 steps 5–7)
**Measured:** Not re-measured.
**Verdict:** not measured — not filed.
Step text: "5a○ Press MED, hold CONTROL WITHDRAW until SOURCE RANGE reads 7.0e2 or more. … Expect it near CONTROL ROD POSITION 70 to 80. … Suggested time warp: 10×, set by itself once the rods start moving."
- **What I did:** I held WITHDRAW in 3 s chunks and read SOURCE RANGE after each. Each 3 s hold moved about 20 steps, because the clock went to 10× as soon as the rods moved: 19, 40, 61, 81, 101. SOURCE RANGE lags the rods (6.6e2 at rod 81, 8.0e2 at 101), so I stopped at 101, not 70–80 (`s05_pull`). Step 6 (1.5 s holds) reached 156 against "150 to 155". Step 7 (1 s holds) reached 195 against "190 to 192". Step 10 (SLOW, held continuously at 1×) reached 206 against a target of 205.
- **Effect:** The 1/M points were taken at different positions than the text assumes. The final prediction was still good: 208 predicted, critical found at 207 (`s08_plot`).
- **What would have unstuck me:** Say how long one hold is at 10× ("about 1 second moves about 7 steps"), or let the warp rise only after the rods stop.

### S-4 — Step accepted at a temperature the text says is too high (Shutdown Part 1 step 6c)
**Measured:** Screenshot l06_done: the Tavg trend dips below the 557 °F line about 2 plant-min before the tick, then rises to 561 °F. The 6c row (tavg_c < 291.38 °C, 556.5 °F) latched on the dip.
**Verdict:** narrowed — the tick was real. The row latches on a transient dip; it is not a grading error. The step ends outside the band. Predates #819; not fixed here.
Step text: "6c○ Keep inserting at MED in pulls of about 3 steps, one plant-minute apart, until AVG COOLANT TEMPERATURE reads below 557 °F, the top of its green band."
- **What I did:** Load cuts 25, 20 and 15 MW, inserting 3 steps after each (Tavg 558, 561, 562). After the last insert, 6b and 6c both showed ✓ and Continue lit while the tile read **561 °F**. Its marker sat in the grey zone right of the green segment (`l06_done`, crop `l06_tavg_crop`). I pressed Continue, as a player would.
- **Confusion:** The text says below 557, the board says 561, and the tick said done. I could not tell which was right. The closing summary then says "AVG COOLANT TEMPERATURE in its band".
- **What would have unstuck me:** Make the grader and the text agree on one number.

### S-5 — An alarm drops to 1× in the middle of a "wait" sub-step, and the order is ambiguous (Startup Part 3 step 5)
**Measured:** Not re-measured.
**Verdict:** not measured — not filed.
Step text: "5b· Wait for OUTPUT to reach 50 MW. Suggested time warp: 10×, while OUTPUT climbs. If AVG COOLANT TEMPERATURE sags well below its band, Pressurizer Pressure Low can come in: make the pulls on the next line. 5c· If AVG COOLANT TEMPERATURE reads below 558 °F, withdraw at MED in 5-step pulls…"
- **What I did:** I followed the sub-steps in order and waited for 5b. At T+10:07:47 the status line read "Dropped to real time — new alarm: Pressurizer Pressure Low". OUTPUT then took about 152 s of wall time at 1× to reach 50 MW, while Tavg fell 551 → 542 °F and pressure fell 2164 → 2081 psi. Then 4 pulls of 5 steps brought Tavg to 559 °F.
- **Confusion:** "make the pulls on the next line" could mean "start 5c now, before 5b ticks" or "this is why 5c exists". 5c showed · (not yet active) the whole time.
- **What would have unstuck me:** "If Pressurizer Pressure Low comes in, start the 5c pulls now; do not wait for OUTPUT."

### S-6 — The average reads the target value but is not done (Startup Part 2 step 8a)
**Measured:** Not re-measured. Same class as #749 (a displayed value rounding up to its target).
**Verdict:** not measured — not filed.
Step text: "8a○ Hold CONTROL WITHDRAW until SOURCE RANGE reads 7.0e3 or more."
- **What I saw:** The live line read "Average over the last 30 plant-seconds: 7.0e3 (6,952 counts per second). This ticks when the average reaches the target…", and 8a was still ○ (`c25` log). A reader comparing "7.0e3" with "7.0e3 or more" sees it as met. The parenthetical number is the only hint. It ticked about 10 s later.
- **What would have unstuck me:** Don't round the shown average up to the target, or state the target in the same unit as the parenthetical (7,000 counts per second).

### S-7 — The recovery instruction from step 5 is missing from step 6 (Startup Part 2 step 6a)
**Measured:** Read the cut diff: the 6a note in 8052485b carried 'If the count only touches 1.4e3, or is short at 155, tap WITHDRAW once, wait half a plant-minute, and repeat.'; c29f20ab kept only the position line.
**Verdict:** confirmed — caused by the #819 cut. The recovery clause was restored.
Step text: "6a○ Hold CONTROL WITHDRAW until SOURCE RANGE reads 1.4e3 or more."
- **What I saw:** I let go when SOURCE RANGE read 1.5e3. The step then said "Average … 1.3e3 (1,269 counts per second)" and stayed ○. Step 5a had told me what to do here ("tap WITHDRAW once and wait half a plant-minute"). Step 6a says nothing, so I just waited, and it ticked within about 5 s.
- **What would have unstuck me:** The same sentence step 5a carries.

### S-8 — "5-step pulls" at MED give no hold time, and near full power the rods stutter (Startup Part 3 steps 4–8)
**Measured:** Not re-measured.
**Verdict:** not measured — not filed.
Step text: "withdraw at MED in 5-step pulls a plant-minute apart".
- **What I did:** I held and watched CONTROL ROD POSITION. 5 steps took about 1.8 s of hold in stages 4–7, but 7.8–9.1 s in stage 8 at REACTOR POWER 101.9 %. The text's "If CONTROL ROD POSITION stops during a pull, wait for REACTOR POWER under 103 %" did not apply, because power was already under 103 %. A player who times holds would under-pull here.
- **What would have unstuck me:** "hold until CONTROL ROD POSITION has gone up 5", which is what I ended up doing.

### S-9 — The board's COOLDOWN RATE sign contradicts the text (Startup Part 1; Shutdown Part 3 step 11)
**Measured:** Not re-measured.
**Verdict:** not measured — not filed.
- During the heatup the RHR card read "COOLDOWN RATE 59 F/hr" while the plant was heating, and +30 F/hr later (`h05_auto`, `h11_done`). In Shutdown Part 3 the text says "Keep COOLDOWN RATE under 100 °F per hour (it reads negative)", and it did read −33 to −84 F/hr. So the "cooldown" rate is positive while heating and negative while cooling, which is backwards for a layman.
- **What would have unstuck me:** Label it "TEMP RATE", or keep cooldown positive.

### S-10 — Unexplained terms (did not block anything)
**Measured:** Wording only; the terms are in the step text.
**Verdict:** noted — none blocked an action. The ruling asks for less explanation, not more.
"letdown orifices" (Part 1 step 7), "accumulator window" (step 9), "P-6, the permission to block it" (Part 2 step 9), "1/M" (step 4), "scram" (Shutdown Part 2), "decay heat" (Shutdown Part 2 step 3), "Shedding power hands reactivity back" (Shutdown Part 1 step 1), "Xenon" (Part 3 step 9), "SUBCOOLING MARGIN" (a tile, never explained). None stopped an action, because each step also names the button. "Control Rods — Approaching Insertion Limit … come in this stage: expected" (Part 3 step 6) arrives while I am **withdrawing** rods, which reads as a contradiction to a layman.

### Minor observations
- RCP FLOW read **115 %** after the pumps started, and 113 % later (`h05_auto`), although the step asks for "above 90 %" and "about 100 %".
- Startup Part 1 step 11 overshot to 550 °F (target 542) at 3600×. Step 15's band (544–549) was satisfied later at 547 °F.
- Startup Part 3 promised "the boron still arriving takes it to about 578 °F". At the end it settled at **575 °F** with REACTOR POWER **101.5 %**.
- Startup Part 2 step 11a ticked while INTER RANGE displayed 9.6e-9 A ("Wait for INTER RANGE to read 1.0e-8 A").
- Startup Part 2 step 8: "The wait for +0.03 is 5½ to 6½ plant-minutes". STARTUP RATE was already +0.01 when 8a ticked.
- Shutdown Part 3 step 3: The trip-block panel rows change height (each row gains "RELEASED BY THE PLANT …" text), so the BLOCK buttons are not where they were in Startup Part 2. My first coordinate clicks missed (`u03_blocked`). That was my scripting, not the text, but the panel does reflow between legs.

## 3. Per-step log

Wall time is from the first action to the tick. "Auto" means the walkthrough set the speed itself; I never needed to set it except where noted.

### Startup Part 1 — Mode 5 → Mode 3 (17 steps, about 5 min wall)
| Step | First sentence | What I did | Time to tick | Continue lit | Notes / shots |
|---|---|---|---|---|---|
| 1 | Confirm the plant is cold and shut down. | Nothing; all 4 checks were pre-ticked (122 °F, 363 psi, OFF lit, rods 0/627). | 0 | yes | `h01` |
| 2 | Start the reactor coolant pumps. | Clicked ON on the RCP FLOW card. | ~10 s wall (flow 21 % → >90 %) | yes | `h02_rcp_on`, `h02_done` |
| 3 | Withdraw the shutdown bank all the way out. | FAST, then WITHDRAW under SHUTDOWN once. Warp auto 60×. | ~8 s wall to 627/627 | yes | `h03_wd`, `h03_done` |
| 4 | Confirm the turbine is tripped. | Read only (TRIP lit, OUTPUT 0). | 0 | yes | `h04` |
| 5 | Put auxiliary feed in AUTO… | AUTO on AUX FEED WATER, which read RUNNING. | immediate | yes | `h05_auto`. RCP FLOW reads 115 %; COOLDOWN RATE reads +59 F/hr while heating. |
| 6 | Confirm the steam dump is closed. | Read only. | 0 | yes | `h06` |
| 7 | Open the letdown orifices… | A+B 7 % on LETDOWN. | immediate | yes | `h07_ab`. "orifices" is unexplained. |
| 8 | Put pressurizer spray in service… | AUTO under SPRAY. | immediate | yes | `h08_spray` |
| 9 | Raise PRIMARY PRESSURE to the 665 psi accumulator window… | AUTO under HEATER. Warp auto 600× and dropped to 1× at 668 psi. | ~25 s wall | yes | `h09_heat`, `h09_done`. The expected alarms appeared as stated. |
| 10 | Open the accumulator valve… | **S-1.** Tile click failed; the diagram valve symbol worked on attempt 2. | ~40 s wall | yes | `h10_hover`, `h10_try1`, `h10_try2` |
| 11 | Heat the plant to 542 °F on pump heat alone. | Waited. Warp auto 3600×, then back to 1×. | <35 s wall (T+01:18 → 06:01) | yes | `h11_done`. Overshot to 550 °F. The 3 expected alarms came in as stated. |
| 12 | Confirm letdown now leaves only through the orifices. | Read only. | 0 | yes | `h12` |
| 13 | Hand STEAM PRESS to the steam dump to hold. | AUTO on STEAM DUMP. | immediate | yes | `h13_auto` |
| 14 | Bring PRIMARY PRESSURE up to normal operating pressure. | Typed 2235 in SET PZR PRESSURE + Enter. Warp auto 600×. | ~5 s wall | yes | `h14_set`, `h14_done` |
| 15 | Confirm Hot Standby. | Read only (547 °F, 2229 psi, ATMOS 0 %, 1020 psi). | 0 | yes | `h15` |
| 16 | Confirm the reactor stayed shut down. | Waited through the 30 plant-second steadiness check at 10×. | ~20 s wall | yes | `h16`, `h16_done` |
| 17 | Confirm the heatup made no fission power. | Read only. | 0 | yes | `h17`, `h_end` |

### Startup Part 2 — Mode 3 → Mode 1 (18 steps, about 16 min wall)
| Step | First sentence | What I did | Time to tick | Continue lit | Notes / shots |
|---|---|---|---|---|---|
| 1 | Verify the plant is in Hot Standby (Mode 3). | Read only. | 0 | yes | `s01` |
| 2 | Dilute boron to the estimated critical concentration, 719 ppm. | Typed 719 in the BORON 0-2500 box + Enter. Warp auto 600×. | ~17 s wall (T+06:31 → 08:32) | yes | `s02_set`, `s02_done` |
| 3 | Line up the steam generator (SG)… | Read only. | 0 | yes | `s03` |
| 4 | Take the 1/M baseline point before any rod moves. | 1/M PLOT, Plot point, then ✕. | immediate | yes | `s04_plot_open`, `s04_point` |
| 5 | Take the second 1/M point, after the first rod pull. | MED, held WITHDRAW in 3 s chunks (auto 10×). **Overshot to rod 101.** Waited for STARTUP RATE +0.01, then Plot point. | ~40 s wall | yes | **S-3.** `s05_pull`, `s05_plot` |
| 6 | Take the third 1/M point. | Held in 1.5 s chunks to rod 156 (SR 1.5e3). The average read 1.3e3 and stayed ○; I waited. Plot point predicted step 262. | ~60 s wall | yes | **S-7.** `s06_pull`, `s06_plot` |
| 7 | Take the fourth 1/M point, after a shorter pull. | Held in 1 s chunks to rod 195 (SR 3.1e3). Waited 20 s, then Plot point predicted 214. | ~50 s wall | yes | `s07_pull`, `s07_plot` |
| 8 | Take the final 1/M point… | 0.7 s holds to rod 198 (SR 7.0e3). The average showed "7.0e3 (6,952)" unticked, then ticked. Plot point predicted **208**. | ~40 s wall | yes | **S-6.** `s08_pull`, `s08_plot` |
| 9 | Block the source range trip at P-6… | TRIP BLOCKS, BLOCK on SR HIGH FLUX, closed. SOURCE RANGE then read "—". | immediate | yes | `s09_blocks`, `s09_blocked` |
| 10 | Take the reactor critical and set STARTUP RATE between +0.3 and +1.0. | SLOW. Taps were too slow (198 → 201 in 30 taps), so I held WITHDRAW continuously at 1× to 206. Then held at 10× for 10.7 s until +0.51 (rod 219). It settled at +0.39 to +0.40. | ~3 min wall | yes | `s10_pull`, `s10_at205`, `s10b`. At SLOW and 1× the rods move about 1 step per 10 s. |
| 11 | Level power near 1.0e-8 A and record the critical rod position. | Waited for IR (ticked at a displayed 9.6e-9). MED, held INSERT 15 s at 1× (219 → 207, matching "about 12 steps"). Pressed 10× myself and waited; it ticked at −0.01. **Critical at 207, predicted 208.** | ~2.5 min wall | yes | `s11a`, `s11b_ins`, `s11b_wait` |
| 12 | Raise power to the point of adding heat, about 1 %. | SLOW, single taps with about 90 plant-s reads: 208 … 213, until STARTUP RATE was +0.16. Waited at auto 60× for 1.0 % and +0.09. | ~1.5 min wall (T+09:07 → 09:38) | yes | `s12a`, `s12_done` |
| 13 | Put main feed in service and secure auxiliary feed. | Typed 50 in the gpm box beside RESTORE + Enter (power read 1.2 %). SG level 36 → 60 % in ~60 s wall. Then AUTO on SG FEED, then STOP on AUX FEED WATER. | ~70 s wall | yes | `s13_feed50`, `s13a`, `s13_done`. Power rose to 2.5 % on its own, past the "1.5 % → type 100" threshold, after I had typed 50. |
| 14 | Raise power past 5 %, into Mode 1, At Power. | SLOW, 2 taps every ~12 s wall at auto 5×: 4 pulls, 2.9 → 5.1 %. | ~50 s wall | yes | `s14_done`. This matched "about 4 pulls". |
| 15 | Put the turbine on line… | LATCH, LOAD 10 + Enter (OUTPUT above 8 MW in ~16 s wall), then pressed AUTO on STEAM DUMP again; status read TAVG. | ~30 s wall | yes | `s15_latch`, `s15b`, `s15_done` |
| 16 | Block the first startup trip, IR HIGH FLUX. | Waited for 8.6 % (~20 s), then TRIP BLOCKS, BLOCK IR HIGH FLUX, closed. | ~30 s wall | yes | `s16a`, `s16_block` |
| 17 | Block the second startup trip, PR HIGH (LOW SETPT). | TRIP BLOCKS, BLOCK PR HIGH (LOW SETPT), closed. | immediate | yes | `s17_panel`, `s17_block` |
| 18 | Verify the plant is in Mode 1, At Power. | Read only. | 0 | yes | `s18`, `s_end` |

### Startup Part 3 — power ascension to 100 % (9 steps, about 14 min wall)
| Step | First sentence | What I did | Time to tick | Continue lit | Notes / shots |
|---|---|---|---|---|---|
| 1 | Confirm the plant the startup handed over is ready to climb. | Read only. | 0 | yes | `r01` |
| 2 | Make sure the turbine is on line and taking steam. | Read only. | 0 | yes | `r02` |
| 3 | Start the boron dilution that carries most of the climb. | Typed 660 + Enter. | immediate | yes | `r03_done` |
| 4 | Take the first stage to 30 MWe… | LOAD 30. OUTPUT reached 30 in ~30 s wall (auto 10×). Tavg sagged to 534 °F. 4 × 5-step MED pulls (≈1.9 s holds) a plant-minute apart, 221 → 241, to 554 °F. | ~5 min wall | yes | `r04b`, `r04c`. Total 20 steps, matching "20 to 25". |
| 5 | Take the second stage to 50 MWe the same way. | LOAD 50. **Pressurizer Pressure Low dropped the clock to 1×** for ~152 s wall. Tavg 542, pressure 2081 psi. Then 4 × 5-step pulls, 241 → 261, to 559 °F. | ~7 min wall | yes | **S-5.** `r05_done` |
| 6 | Take the third stage to 75 MWe the same way. | LOAD 75 (~40 s wall). Tavg 551. 4 pulls, 261 → 281, to 567 °F. | ~5.5 min wall | yes | `r06_done`. The "Insertion Limit" alarms during withdrawal read as contradictory. |
| 7 | Take the fourth stage to 90 MWe with a smaller pull. | LOAD 90 (~20 s wall). 2 pulls, 281 → 291, to 571 °F. | ~2.5 min wall | yes | `r07_done`. No runback. |
| 8 | Take the last stage to full load and settle the temperature on 578 °F. | LOAD 100 (~20 s wall; power 101.9 %). 2 pulls, 291 → 301, but each needed **7.8–9.1 s** of hold, not ~1.8 s. Reached 573 °F. 8d (rod below 600) ticked. | ~4 min wall | yes | **S-8.** `r08_done` |
| 9 | Confirm full power, with the boron dilution done. | Waited at auto 5× for BORON CHEM ≤ 663 (~90 s wall). Tavg 573–575, never above 592, so no inserts. | ~90 s wall | yes | `r09_done`, `r_end`. Ended at 575 °F / 101.5 %, not "about 578". |

### Shutdown Part 1 — load rampdown to 15 MWe (6 steps, about 11 min wall)
| Step | First sentence | What I did | Time to tick | Continue lit | Notes / shots |
|---|---|---|---|---|---|
| 1 | Start adding boron before any load comes off. | Typed 719 + Enter (ON was already lit). | immediate | yes | `l01_done` |
| 2 | Take the first load off the turbine… | LOAD 95, 90, 85, 80, 75, a plant-minute apart (auto 5×). Tavg read 578–579 after each, so I inserted 3 at MED each time (301 → 286). | ~6 min wall | yes | `l02_done` |
| 3 | Bring AVG COOLANT TEMPERATURE back into its band with the rods. | One 3-step insert, 578 → 572 °F. | ~1 min wall | yes | `l03_done`. Only 3 steps, against the "about 10 to 20". |
| 4 | Take the load down to 50 MWe, then trim… | 70/65/60/55 with 3-step inserts (Tavg 572). At 50, Tavg read 569, which is not "above 569", so no insert. Then one 4c insert to 565. | ~7.5 min wall | yes | `l04_done` |
| 5 | Take the load down to 30 MWe, then trim… | 45/40/35/30 with 3-step inserts (Tavg 566 each). One more insert, 558 °F. | ~6.5 min wall | yes | `l05_done` |
| 6 | Take the load down to 15 MWe, then trim… | 25/20/15 with 3-step inserts. **6c ticked at Tavg 561–562 °F.** | ~4 min wall | yes | **S-4.** `l06_done`, `l06_tavg_crop` |

### Shutdown Part 2 — Mode 1 → Mode 3 (3 steps, about 1 min wall)
| Step | First sentence | What I did | Time to tick | Continue lit | Notes / shots |
|---|---|---|---|---|---|
| 1 | Take the load off the generator before the scram. | LOAD 0 + Enter. | immediate | yes | `t01_done` |
| 2 | Shut the reactor down. | SCRAM once (armed), SCRAM again. Rods went to 0/0 and power to 1.6 %, falling. | ~3 s wall | yes | `t02_armed`, `t02_done` |
| 3 | Put the decay heat on the steam dump: Mode 3, Hot Standby. | One press of AUTO on STEAM DUMP gave STM PRESS. STEAM PRESS held in ~10 s. | ~15 s wall | yes | `t03_dump0`, `t03_done`. "decay heat" is unexplained. |

### Shutdown Part 3 — Mode 3 → Mode 5 (16 steps, about 12 min wall)
| Step | First sentence | What I did | Time to tick | Continue lit | Notes / shots |
|---|---|---|---|---|---|
| 1 | Add the boron a cold core needs before any cooling starts. | Typed 920 + Enter (BORATING shown). Auto 600×. | ~10 s wall (T+11:13 → 12:18) | yes | `u01_set`, `u01_done` |
| 2 | Bring pressure under the point where the low-pressure protection can be blocked. | SET PZR PRESSURE 1900 + Enter. | ~16 s wall | yes | `u02_done` |
| 3 | Block the protection that would read the cooldown as a leak. | TRIP BLOCKS, BLOCK PZR PRESS LO-LO, BLOCK SI REACTOR TRIP, closed; STOP on ECCS. My first clicks missed because the panel rows had reflowed. | ~40 s wall | yes | `u03_panel`, `u03_blocked`, `u03_b1`, `u03_b2` |
| 4 | Cool the plant on the steam dump to where RHR can take over. | **S-2.** Typed 120 without Enter: no effect. With Enter: RAMPING, auto 60×. Waited for 347 °F. | ~5.5 min wall (T+12:21 → 15:41) | yes | `u04_typed_noenter`, `u04_set`, `u04_done` |
| 5 | Take the pressure setpoint to the bottom of its range. | SET PZR PRESSURE 1700 + Enter. | ~8 s wall | yes | `u05_done` |
| 6 | Hand pressure control from the heaters to the spray. | OFF under HEATER; typed 50 under SPRAY + Enter; MANUAL under SPRAY. | ~10 s wall | yes | `u06_spray`, `u06_done` |
| 7 | Isolate the accumulators while pressure is inside their window. | Clicked the same diagram valve symbol, known from Part 1. | immediate | yes | `u07_done`. Same S-1 wording, with no location. |
| 8 | Bring pressure under the RHR limit on the spray. | Waited at auto 60×. Pressurizer level stayed 25–27 %. | ~20 s wall | yes | `u08_done` |
| 9 | Put RHR in service as the cooldown loop. | ALIGN on RHR; HX SPLIT 7 + Enter. | immediate | yes | `u09_done` |
| 10 | Take the reactor coolant pumps off now that RHR is circulating. | OFF on RCP FLOW. | ~12 s wall | yes | `u10_done` |
| 11 | Cool on RHR into Mode 5, inside the 100 °F per hour limit. | HX SPLIT 8 + Enter. Watched SUBCOOLING MARGIN every ~3 s wall at 60× (91 → 29 °F in ~45 s wall, about 2 °F per glance). Pressed OFF under SPRAY at 29 °F. Then auto 600× to 196 °F. COOLDOWN RATE stayed between −33 and −84 F/hr. | ~1.5 min wall | yes | `u11_sprayoff`, `u11c`, `u11_done`. Pressure rose 96 → 262 psi after spray off. |
| 12 | Shut the spray now that the plant is cold. | Already done. | 0 | yes | `u12` |
| 13 | Confirm the plant is in Mode 5, Cold Shutdown. | Read only. | 0 | yes | `u13` |
| 14 | Confirm the accumulators are still full and isolated. | Read only. | 0 | yes | `u14` |
| 15 | Confirm RHR is carrying the heat. | Read only. | 0 | yes | `u15` |
| 16 | Leave the plant lined up for the next heatup. | SCRAM pressed once to reset; CLOSE on STEAM DUMP; DUMP SETPOINT 1020 + Enter. Shutdown bank already 0. | ~10 s wall | yes | `u16_done`, `u_end` |

## 4. Words and numbers I could not find on the board

| Walkthrough said | What is actually on the board |
|---|---|
| "the accumulator valve" (Part 1 step 10, Shutdown Part 3 step 7) | No label. It is an unlabelled valve symbol on the pipe above the ACCUMULATORS tile, left of the ECCS card. Only the scanner names it ("Accumulator Isolation Valve"), and only on hover. |
| "Type 120 into DUMP SETPOINT." | The box is there; typing alone does nothing. Enter is required and not mentioned. |
| "until it reads below 557 °F, the top of its green band" (Shutdown Part 1 6c) | The tile read 561 °F with its marker outside the green segment when the step ticked. The green band has no numbers on it. |
| "SOURCE RANGE reads 7.0e3 or more" | The panel's average line showed "7.0e3 (6,952 counts per second)" and was not ticked. |
| "Wait for INTER RANGE to read 1.0e-8 A" | It ticked while INTER RANGE displayed 9.6e-9 A. |
| "COOLDOWN RATE … (it reads negative)" | During the heatup the same readout showed **+59 F/hr** and +30 F/hr, positive while heating. |
| "RCP FLOW reads above 90 %" / "about 100 %" | It read 115 % and 113 %, above 100 %. |
| "settle the temperature on 578 °F" / "takes it to about 578 °F" | It ended at 575 °F with REACTOR POWER 101.5 %. |
| "Expect it near CONTROL ROD POSITION 70 to 80" (step 5) | 101 by the time SOURCE RANGE was above 7.0e2, because the auto 10× made the held pull fast. |
| "P-6", "P-10", "P-11" | They appear only inside the TRIP BLOCKS panel ("(P-6 PERMISSIVE)"), never on the main board. |
| "decay heat", "reactivity", "xenon", "orifices", "accumulator window" | Not on the board, and not explained in the text. |

## 5. What the text got right
- Every button and tile named in the text existed with exactly that caption, except the accumulator valve.
- The automatic time warp matched every "Suggested time warp" line, and it dropped to 1× at the stated points (665 psi, end of heatup).
- Every "Expected alarms" line matched what actually came in, so no alarm surprised me.
- The 1/M prediction sequence worked: predictions 262 → 214 → 208, with critical found at 207.
- "hold INSERT about 15 seconds at 1× (about 12 steps)" was exact: 219 → 207.
- "Expect about 4 pulls over 3 to 4 plant-minutes" (Part 2 step 14) was exact.
- The boron box instructions ("type it … and press Enter") were unambiguous every time.
- "Click WITHDRAW only once; a second click stops the bank" prevented a mistake.
- "Skip this and the reactor trips on SR HIGH FLUX…" made it clear why the block mattered.
- The trip-block steps named the exact row captions (SR HIGH FLUX, IR HIGH FLUX, PR HIGH (LOW SETPT), PZR PRESS LO-LO, SI REACTOR TRIP).
- "Press SCRAM … once to arm it (PRESS TO ARM), then again to scram" matched the button's own label.
- The Shutdown Part 3 step 11 warning about glance spacing at 600× was right; at 60× the margin moved about 2 °F per 3 s glance.
- The 20–25 and ~30 step totals for the power-ascension pulls matched what I needed (20, 20, 20, 10, 10).
- Each leg's "Walkthrough complete" summary and its "Next:" button chained the legs with no menu trip.
