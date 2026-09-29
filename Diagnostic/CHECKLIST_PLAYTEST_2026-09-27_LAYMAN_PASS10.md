# Layman playthrough: Alpha 1.8.0 rc8 candidate (exp/rc8 b6aedc70)

> **Record, not policy.** Layman pass 10, 2026-09-27, on `exp/rc8` `b6aedc70` (Alpha 1.8.0 rc8 candidate; the
> header still read rc7), headless Edge: 6 of 6 legs completed on one chained plant, no reactor trip, no strand.
> Verified 2026-09-27 (develop-c, `exp/rc8f` on `262ea30b` + this change); every claim below was the reviewer's
> until the **Measured** line under it. **S-1** insertion-limit alarm drops the clock: CONFIRMED as a surprise,
> NARROWED as a defect (the next check line re-applies the speed; it is not a contradiction: the limit rises with
> power); the two alarms are now declared expected on stages 5-6 and explained in stage 5 · **S-2** green band
> unfindable, ticks at the floor: CONFIRMED (the green segment is 19 px of a 186 px strip, 3 px tall, no numbers;
> the check-off floors sat 1-7 °F under it); floors moved to the green floor, text names it in numbers · **S-3**
> BORON: CONFIRMED, now BORON CHEM · **S-4** 7 of 5: CONFIRMED (released rows are a subset of the not-blocked);
> reworded. Row heights: NARROWED, not changed · **S-5** 0.00: already fixed in `262ea30b`; the `target` field
> still said 0.00, fixed; IR drift is the accepted −0.02 · **S-6** speed not auto-set: REFUTED for raise power
> (browser probe: 10× then 5× applied by itself on every stage), NOT re-measured for startup 11-13 · **S-7**
> lower power 2 early Continue: CONFIRMED, harmless (step 3 is the trim); the note says so · **S-8**: heatup 3
> REFUTED (9.1 plant-min on the chain), cooldown 1 / 13 / 16 and the PERIOD tile CONFIRMED and reworded, the
> startup timing lines not re-measured.

Page: `file:///C:/grok_build/RD_rc8/ui/shell.html?engine=pwr2`, headless Edge 1600x1000. Screenshots are in `shots/`.

**Setup notes (not walkthrough findings):**
- The driver page was sitting on `about:blank` when I arrived, so I navigated to the URL myself.
- The Main Menu was already OPEN on load. The brief said it would not be.
- The header tag reads **"Alpha 1.8.0-rc7"**, not rc8. Please check that the tree under test is the build you meant.
- `pageerrors.log` is empty: no page errors in the whole run.

The whole chain ran as one continuous plant, from T+00:00:00 to T+18:15:38 plant time, in about 85 minutes of wall time. Each leg was entered with its "Next: … ▸" button.

## 1. Outcome

| Leg | Result | Steps | The one thing that mattered |
|---|---|---|---|
| pwr_heatup | Complete | 17/17 | Nothing stuck. Every control was named and findable, and the pulsing accumulator valve plus its location hint made the one diagram click easy. |
| pwr_startup | Complete | 17/17 | The rewritten 1/M approach worked exactly as written. Counts landed at the rod positions the text predicted, within 0 to 6 steps. The 7 taps in step 12 and the 5 pulls in step 13 matched to the tap. Critical at rod 206, 719 ppm. |
| pwr_raise_power | Complete | 9/9 | An "Approaching Insertion Limit" alarm dropped the clock to 1x mid-climb in steps 5 and 6 and left it there. The alarm was named in the speed line but not in the ALARMS list, and it is only explained in step 6. |
| pwr_lower_power | Complete | 6/6 | Smooth. Continue lit early in step 2 (before the last cut had settled), and step 3 was already satisfied on arrival. |
| pwr_shutdown | Complete | 3/3 | Clean. The SCRAM arm-then-press sequence was self-explaining ("CONFIRM / PRESS AGAIN TO TRIP"). |
| pwr_cooldown | Complete | 16/16 | Clear but long: 34 identical DUMP SETPOINT entries in step 4. The subcooling watch in step 11 was well sequenced. |

No leg stalled. Nowhere did I have to do something the text did not say in order to make a step pass.

## 2. Stuck points, ranked

None of these blocked me. They are the places a layman would hesitate, lose time, or doubt themselves.

**S-1: An alarm drops the clock to 1x mid-climb and nothing puts it back. The alarm is named where I cannot read it, and it contradicts what I am doing.** Raise power, steps 5 and 6.
- Step 5 text: *"Wait for OUTPUT to reach 50 MW. AVG COOLANT TEMPERATURE sags while it climbs … Suggested time warp: 10×, while OUTPUT climbs."*
- **What I did:** I set LOAD 50, then LOAD 75, and did exactly what the text said.
  - In step 5, the clock quietly ran at about 1x from T+09:58:17 for the rest of the OUTPUT climb.
  - In step 6, `#warpInfo` read **"Dropped to real time — new alarm: Control Rods — Approaching Insertion Limit"** about 35 plant-seconds into the climb, and the clock stayed at 1x until 6b ticked. That is about 3.5 minutes of wall time at 1x for a step that suggests 10x.
  - At the moment it was shown, the ALARMS panel read **"— no active alarms —"** (shot `r05c.png`).
  - I was **withdrawing** rods, so an **insertion**-limit alarm read as a contradiction.
  - The explanation (*"Control Rods — Approaching Insertion Limit, then Control Rods — Insertion Limit, come in during this stage: expected…"*) first appears in step 6's text. That is after the alarm had already fired at the end of step 5.
- **What would have unstuck me:** Move the "expected Insertion Limit" note to step 5, and say "press 10× again if an alarm drops the clock".
- **Measured:** `run_walkthrough_routes --job=pwr_raise_power:{typical,band_floor}` seeds 42 and 7, and `--leg=chain`: `rod_limit_approach` + `rod_limit` raised in step 6 on every route (559-565 °F). The reviewer's own driver log shows the drop at the END of step 5 (5b and 5c met, bank 238-253): the insertion limit at 50 % is 224 steps and the approach alarm is limit + 10 (`pwr2_engine.js` `insertionLimitSteps`), so power leading the rods crosses it and the next pull clears it, which is why ALARMS read empty. Browser probe (`speed_probe.js`, raise power from `low_power`, auto-warp on): a drop in 5b (Pressurizer Pressure Low, 587 s) held 1× until 5c opened and re-applied 5× (689 s). After the fix, stage 6 ran 944-1452 s at 10× then 5× with no drop.
- **Verdict:** narrowed — the alarm is expected and the drop is real; "nothing puts it back" holds only until the next check line, and withdrawing against an insertion-limit alarm is the remedy, not a contradiction. Fixed: `expect_alarms` on stages 5 and 6, and a plain-words explanation in stage 5.

**S-2: "Aim for the green, not the tick." I could not find the green band, and every stage ticked at the floor with fewer steps than stated.** Raise power, steps 4 to 8.
- Step 4 text: *"The green band on the tile is where the plant should sit at the power it is making: near 556 °F here … The check-off accepts 550 to 576 °F; aim for the green, not the tick."*
- **What I did:** I pulled 5 steps at a time at MED, one plant-minute apart. Continue lit, and I stopped when it did.

| Stage | Tick came at | Text's band | Steps I pulled | Text's step count |
|---|---|---|---|---|
| 30 MWe | 551 °F | near 556 | 15 | 5 to 20 |
| 50 MWe | 554 °F | near 562 | 15 | 15 to 20 |
| 75 MWe | 560 °F | near 570 | 20 | 25 to 35 |
| 90 MWe | 564 °F | near 575 | 10 | about 15 |

  - On the AVG COOLANT TEMPERATURE tile (shots `r04d.png`, `r05c.png`) there is a thin coloured strip under the number. I could not tell which part of it was "the green band" or where the needle sat against it.
- **What would have unstuck me:** Either print the band as numbers on the tile (for example "band 553 to 559"), or make the check-off tick only inside the green band.
- **Measured:** the Tavg tile strip in `r04d.png`: the green segment is 19 px of a 186 px strip (540-645 °F window), 3 px tall, no numbers; green = Tavg program ± 5.04 °F (`pwr_board_wiring.js` tile band). The old check-off floors 550 / 550 / 558 / 564 °F sat 1-7 °F under the green floors 551 / 558 / 565 / 570 °F. After the fix (floors 552 / 558 / 566 / 570 °F, the green floor as the tile renders it): routes typical seeds 42/7 withdrew 25 / 25 / 30 / 20 / 10 steps on stages 4-8, the floor-reading route 25 / 20 / 30 / 15-20 / 10-15; browser probe lit Continue at 552.1 / 558.3 / 566.1 °F on stages 4-6.
- **Verdict:** confirmed. Fixed: the check-off now ticks when the reading enters the green; the text names the segment and its numbers and drops "aim for the green, not the tick"; step counts re-stated from the measured routes (20 to 25, 20 to 25, about 30, 15 to 20, 10 to 20).

**S-3: "BORON" means two different numbers on one card.** Raise power, step 9.
- Step text: *"9b ○ Check BORON reads 663 ppm or below."*
- **What I did:** Waited. The BORON card's target box already read **660 ppm**, which is "663 or below", while BORON CHEM read 664. The tick followed BORON CHEM about 4.5 plant-minutes later.
- **What would have unstuck me:** Write "Check BORON CHEM reads 663 ppm or below".
- **Measured:** 9b grades `boron_ppm` (the BORON CHEM reading); the box beside it is the target, `boron_target_ppm`, which reads 660 from step 3 on.
- **Verdict:** confirmed. Fixed: 9b, its label, the step target and the note say BORON CHEM.

**S-4: The TRIP BLOCKS panel header does not add up, and its rows move between legs.** Startup step 16 and cooldown step 3.
- On-screen: **"3 of 5 BLOCKED · 2 WAITING ON ITS PERMISSIVE · 2 TRIPS RELEASED BY THE PLANT"**, which is 7 "of 5". In the cooldown it read **"2 of 5 BLOCKED · 3 WAITING ON ITS PERMISSIVE · 3 TRIPS RELEASED BY THE PLANT"**.
- In the cooldown, rows had grown "RELEASED BY THE PLANT — …" sub-lines, so every BLOCK button sat at a different height than in the startup (shots `s09b.png` vs `c03b.png`). The row names are unambiguous, so I still found them.
- **What would have unstuck me:** Make the header counts disjoint (for example "3 blocked · 2 live"), or drop the counts.
- **Measured:** `renderTripBlockStatus` counts BLOCKED + WAITING over disjoint rows (5), and RELEASED over rows carrying a plant message; blocking a row clears its message, so RELEASED is always a subset of the not-blocked rows. Row heights: `holdTripPopHeights` holds each row's height within one opening; between legs rows carry different release lines (`s09b.png` vs `c03b.png`).
- **Verdict:** confirmed for the header, narrowed for the rows (they differ between legs because the text differs, never under the cursor within an opening). Fixed: the header now reads "OF THE 2 NOT BLOCKED, 2 WERE RELEASED BY THE PLANT". Row heights not changed: reserving the tallest height would grow the startup card for text it does not carry.

**S-5: The text asks for 0.00, but the check accepts −0.02.** Startup, step 11.
- Step text: *"11b … Two plant-minutes later read STARTUP RATE: above +0.02, tap INSERT once; below −0.02, tap WITHDRAW once. Repeat until it reads 0.00."*
- **What I did:** Inserted 12 steps (218 to 206) at MED and set 10x myself. STARTUP RATE settled at **−0.02** and the step ticked.
  - A reader who takes "until it reads 0.00" literally would tap WITHDRAW here, and −0.02 is on the boundary of "below −0.02".
  - INTER RANGE was also drifting down (9.0e-9 to 7.7e-9 A), so the core was not quite level.
- **What would have unstuck me:** Say "until it reads between −0.02 and +0.02".
- **Measured:** HEAD `262ea30b` 11b reads "Repeat until it reads between −0.02 and +0.02", graded ±0.025; the step `target` still said "STARTUP RATE 0.00". IR 9.0e-9 → 7.7e-9 A over ~3.5 plant-min is a factor 0.86; −0.02 decades a minute over 3.5 min is 0.85.
- **Verdict:** narrowed — the wording was already fixed, the drift is the accepted band. Fixed: the `target` field.

**S-6: Speeds the text "suggests" are sometimes set for you and sometimes not.** Startup steps 11, 12 and 13.
- Some steps say *"set by itself"* (startup 5 to 8, cooldown 4 and 11), and those were honoured.
- Where the text only says *"Suggested time warp: 10×"* (startup 11 and 12) or *"5×"* (startup 13; raise power 4c to 8c), the clock stayed at 1x until I pressed the button. That is fine once you notice it, but a layman who does not notice would sit through 20 plant-minutes at 1x in startup step 12.
- **What would have unstuck me:** One line per step: "press 10× now" when it is not automatic.
- **Measured:** browser probe, raise power stages 4-6: after LOAD the clock went to 10× by itself (4b, 5b, 6b) and to 5× at each c line; no press. Startup 11-13 NOT re-measured in a browser. Code read only: auto holds 1× until the step's own command lands (`cklActionPending`), then applies the rung, and the reviewer's log shows 10× pressed before the first tap in startup 11 and 12.
- **Verdict:** refuted for raise power; not measured for the startup (the code read is not a measurement). No change.

**S-7: Continue lit before the step's instructions were finished.** Lower power, steps 2 and 3.
- Step 2 text: *"Lower LOAD 5 MW at a time, one plant-minute apart, to 75 MW: 95, 90, 85, 80, 75."*
- **What I did:** Continue lit about 2 plant-seconds after I typed 75, while OUTPUT still read 80 MW. That was before the minute and the 3-step insert the text calls for after that cut.
- Step 3 (*"Bring AVG COOLANT TEMPERATURE back into its band with the rods"*) was then already satisfied on arrival (575 °F), because the step 2 inserts had done it.
- **What would have unstuck me:** Nothing blocked me. A reader who presses Continue as soon as it lights skips the last insert.
- **Measured:** `run_walkthrough_routes --leg=pwr_lower_power` typical: step 2 Continue at 4.13 plant-min, OUTPUT 74.8 MW, right after the last cut; step 3 then took 2.7 (chain) to 5.5 (preset) plant-min, so it is not pre-satisfied in general; on the reviewer's route the step-2 inserts had already done it (575 °F).
- **Verdict:** confirmed, harmless — step 3 is the trim the early Continue skips. Fixed: 2b's note says Continue can light at 75 MW and the next step finishes the trim.

**S-8 (minor text/board mismatches, one line each):**
- **Heatup 3:** *"about 9 plant-minutes"* for the shutdown bank to run out. It took about 6 (T+00:03:26 to T+00:10:10).
- **Startup 4:** the 1/M popup said *"baseline C₀ = 535 cps"* while the SOURCE RANGE tile showed 4.7e2 at the same moment. The number jumps, as the text later warns, but the first sight of it was confusing.
- **Startup 5:** *"lands near CONTROL ROD POSITION 75 to 80"*. It needed 86 to reach 7.2e2. The text's "position shifts, the count does not" covers this.
- **Startup 8:** *"STARTUP RATE takes about 5½ to 6½ plant-minutes to reach +0.03"*. It took about 4. I plotted at about 6 anyway.
- **Startup 10:** *"The rods stop about 12 steps past the prediction mark"*. Mine stopped 9 past (218 vs 209).
- **Raise power 4:** the PERIOD tile read **"−1964 s"** (and later "−5533 s") with power steady. Nothing tells a layman what a negative period means.
- **Cooldown 1:** *"about 55 plant-minutes to 880 ppm"*. It took about 64, and BORON CHEM read 894 at the tick.
- **Cooldown 13:** *"PRIMARY PRESSURE will be low — the spray took it there"*. It read **254 psi and rising** after spray OFF (it was 96 psi at the moment of spray off).
- **Cooldown 16:** *"The bank runs in by itself, about 9 plant-minutes."* The bank was already at 0 from the scram, so this sentence has nothing to describe.
- **Measured (chain, `run_walkthrough_routes --leg=chain`, seed 42):** heatup 3 row met at 9.1 plant-min; cooldown 1's 880 ppm row at 65 plant-min (55.5 from the `hot_zero_power` preset, step file record); cooldown 13 at 246 psia; cooldown 16 entered with the bank at 0 and finished in 0.8 plant-min. PERIOD: `pwr2_reactor.js` computes it as the e-folding time, and no pwr2 step explained it. Startup 4, 5, 8 and 10 timing lines not re-measured (the route gate's stated-time checks pass).
- **Verdict:** heatup 3 refuted (the reviewer read a 60× clock); cooldown 1, 13, 16 and PERIOD confirmed and reworded; the startup lines not measured, no change.

## 3. Per-step log

Times are plant clock. "Wall" is real time. "Lit" means Continue went `ready`. Unless a line says "pre-satisfied", I did exactly what the step says.

### pwr_heatup (17 steps, T+00:00:00 to T+06:34:59)
| # | First sentence | What I did | Time to satisfy | Lit | Notes / shots |
|---|---|---|---|---|---|
| 1 | Confirm the plant is cold and shut down. | Nothing; all four checks were green on load | 0 | yes | h01_start |
| 2 | Start the reactor coolant pumps. | ON on the RCP FLOW card | about 50 plant-s | yes | h02, h02b, h02c |
| 3 | Withdraw the shutdown bank all the way out. | FAST, then SHUTDOWN WITHDRAW once; auto 60x | about 6.5 plant-min (6 s wall) | yes | Text said about 9 min. h03, h03b, h03c |
| 4 | Confirm the turbine is tripped. | Nothing (pre-satisfied) | 0 | yes | h04 |
| 5 | Put steam generator level control in AUTO while the plant is quiet. | AUTO on SG FEED | 2 s | yes | h05, h05b |
| 6 | Confirm the steam dump is closed. | Nothing (pre-satisfied) | 0 | yes | h06 |
| 7 | Open the letdown orifices before the pressure climb shuts the RHR path. | A+B 7 % | 2 s | yes | h07, h07b |
| 8 | Put pressurizer spray in service before the heaters start the climb. | SPRAY AUTO | 2 s | yes | h08, h08b |
| 9 | Raise PRIMARY PRESSURE to the 665 psi accumulator window on the heaters. | HEATER AUTO; auto 600x | about 47 plant-min (about 1 min wall) | yes | Held at 1x with "Held at real time — the plant needs you here". h09, h09b, h09c |
| 10 | Open the accumulator valve while PRIMARY PRESSURE is inside its window. | Clicked the pulsing valve symbol above the ACCUMULATORS tile | 2 s | yes | h10, h10b |
| 11 | Heat the plant to 542 °F on pump heat alone. | Nothing; auto 3600x | about 4.6 plant-h (10 s wall) | yes | h11, h11b |
| 12 | Confirm letdown now leaves only through the orifices. | Nothing (pre-satisfied) | 0 | yes | h12 |
| 13 | Hand STEAM PRESS to the steam dump to hold. | STEAM DUMP AUTO (setpoint was already 1020) | 2 s | yes | h13, h13b |
| 14 | Bring PRIMARY PRESSURE up to normal operating pressure. | Typed 2235 + Enter in SET PZR PRESSURE; auto 600x | about 26 plant-min | yes | h14, h14b, h14c |
| 15 | Confirm Hot Standby. | Nothing (pre-satisfied) | 0 | yes | h15 |
| 16 | Confirm the reactor stayed shut down. | Nothing; auto 10x | about 80 plant-s | yes | h16, h16b |
| 17 | Confirm the heatup made no fission power. | Nothing (pre-satisfied) | 0 | yes | h17, h18_done |

### pwr_startup (17 steps, T+06:35:09 to T+09:46:48)
| # | First sentence | What I did | Time to satisfy | Lit | Notes / shots |
|---|---|---|---|---|---|
| 1 | Verify the plant is in Hot Standby (Mode 3). | Nothing (pre-satisfied) | 0 | yes | s01 |
| 2 | Dilute boron to the estimated critical concentration, 719 ppm. | Typed 719 + Enter in the BORON box captioned 0-2500 ppm; auto 600x | about 2 h 1 min plant | yes | s02, s02b, s02c |
| 3 | Line up the steam generator (SG) before taking the reactor critical. | Nothing (pre-satisfied) | 0 | yes | s03 |
| 4 | Take the 1/M baseline point before any rod moves. | 1/M PLOT, then Plot point | 2 s | yes | The popup covers the top-right of the board. Baseline 535 cps vs tile 4.7e2. s04, s04b, s04c |
| 5 | Take the second 1/M point, after the first rod pull. | MED (FAST was still lit from the heatup), held CONTROL WITHDRAW 12.1 s wall; auto 10x once the rods moved; released at 7.2e2, rod 86; waited; Plot point | about 4 plant-min | yes | The count wandered 6.4e2 to 7.8e2 afterwards but 5a still ticked with no extra tap. Prediction: step 292 (46.6 %). s05 to s05d |
| 6 | Take the third 1/M point. | Held WITHDRAW 9.7 s wall; 1.4e3 at rod 155 (text 150 to 155); Plot point | about 6 plant-min | yes | Prediction: step 245 (39.0 %). s06, s06b, s06c |
| 7 | Take the fourth 1/M point, after a shorter pull. | Held WITHDRAW 5.7 s; read ≥3.0e3 at rod 195 (text 190 to 192; I overshot by 3); Plot point after STARTUP RATE +0.01 | about 5.5 plant-min | yes | Prediction: step 214 (34.2 %). s07, s07b, s07c |
| 8 | Take the final 1/M point, the one the approach to critical is built on. | Held WITHDRAW 1.4 s; 7.0e3 at rod 203; waited 6 plant-min; Plot point | about 6.5 plant-min | yes | Prediction: step 209 (33.4 %), 1/M 0.041. s08, s08b, s08c |
| 9 | Block the source range trip at P-6. | TRIP BLOCKS, BLOCK on SR HIGH FLUX, then TRIP BLOCKS again | about 20 plant-s | yes | SOURCE RANGE shows a dash glyph. s09 to s09d |
| 10 | Take the reactor critical and set STARTUP RATE between +0.3 and +1.0. | SLOW, held WITHDRAW 21.8 s (203 to 206 = prediction minus 3); then held 97 s wall (206 to 218) to STARTUP RATE +0.50; released | about 3.5 plant-min | yes | STARTUP RATE settled +0.39. s10 to s10d |
| 11 | Level power at 1.0e-8 A and record the critical rod position and boron. | Waited for IR 1.0e-8 (46 plant-s); MED, held INSERT 15.3 s (218 to 206); pressed 10x myself; waited 2 plant-min | about 3.5 plant-min | yes | Accepted STARTUP RATE −0.02 (S-5). Critical: rod 206, 719 ppm. s11 to s11d |
| 12 | Raise power to the point of adding heat, about 1 %. | Closed 1/M with ✕; SLOW; pressed 10x; one WITHDRAW tap per plant-minute: **7 taps** (206 to 213), STARTUP RATE +0.17; then hands off | about 28 plant-min | yes | Power 1.0 % at T+09:37:25, exactly "about 20 plant-minutes" after the last tap. s12, s12b, s12c |
| 13 | Raise power past 5 %, into Mode 1, At Power. | SLOW; pressed 5x; two taps, waited for the STARTUP RATE peak and fall to +0.10; **5 pulls** (213 to 223) | about 5 plant-min | yes | Matched the text exactly. s13, s13b |
| 14 | Put the turbine on line and let the reactor follow it up. | LATCH; typed 10 + Enter in LOAD (auto 10x); STEAM DUMP AUTO again, which read TAVG | about 2 plant-min | yes | s14 to s14e |
| 15 | Block the first startup trip, IR HIGH FLUX. | Waited for power >9.5 % (about 40 plant-s); TRIP BLOCKS, BLOCK on IR HIGH FLUX | about 55 plant-s | yes | s15, s15b, s15c |
| 16 | Block the second startup trip, PR HIGH (LOW SETPT). | TRIP BLOCKS, BLOCK on PR HIGH (LOW SETPT), TRIP BLOCKS | about 12 plant-s | yes | Header count 3+2+2 of 5 (S-4). s16 to s16c |
| 17 | Verify the plant is in Mode 1, At Power. | Nothing (pre-satisfied) | 0 | yes | s17, s18_done |

### pwr_raise_power (9 steps, T+09:46:59 to T+10:37:00)
| # | First sentence | What I did | Time to satisfy | Lit | Notes / shots |
|---|---|---|---|---|---|
| 1 | Confirm the plant the startup handed over is ready to climb. | Nothing (pre-satisfied) | 0 | yes | r01 |
| 2 | Make sure the turbine is on line and taking steam. | Nothing (pre-satisfied) | 0 | yes | r02 |
| 3 | Start the boron dilution that carries most of the climb. | Typed 660 + Enter | 2 s | yes | r03, r03b |
| 4 | Take the first stage to 30 MWe, load leading and rods following. | LOAD 30 (auto 10x); OUTPUT 30 in about 3.5 plant-min; Tavg 537; 3 MED pulls of 5 steps (223 to 238), one plant-minute apart | about 8 plant-min | yes | Ticked at 551 vs "near 556" (S-2). PERIOD read −1964 s. r04 to r04d |
| 5 | Take the second stage to 50 MWe the same way. | LOAD 50; OUTPUT climb fell to about 1x partway; 3 pulls (238 to 253) | about 8.5 plant-min | yes | "Approaching Insertion Limit" named in the speed line, missing from the ALARMS list (S-1). r05, r05b, r05c |
| 6 | Take the third stage to 75 MWe the same way. | LOAD 75; the alarm dropped the clock to 1x and I left it (text did not say to re-press); 4 pulls (253 to 273) | about 10 plant-min (about 7 min wall) | yes | 20 steps vs text's 25 to 35. Ticked at 560 vs "near 570". r06, r06b, r06c |
| 7 | Take the fourth stage to 90 MWe with a smaller pull. | LOAD 90 (stayed at 10x); 2 pulls (273 to 283) | about 6 plant-min | yes | Ticked at 564, the floor. r07, r07b |
| 8 | Take the last stage to full load and settle the temperature on 578 °F. | LOAD 100; 4 pulls (283 to 303) | about 10 plant-min | yes | 20 steps, exactly as stated. Never hit the 103 % stop (power about 102 %). r08, r08b |
| 9 | Confirm full power, with the boron dilution done. | Waited; no rod motion needed (Tavg held at 576) | about 4.5 plant-min | yes | "BORON" is ambiguous (S-3). r09, r09b, r10_done |

### pwr_lower_power (6 steps, T+10:37:16 to T+11:05:00)
| # | First sentence | What I did | Time to satisfy | Lit | Notes / shots |
|---|---|---|---|---|---|
| 1 | Start adding boron before any load comes off. | Typed 719 + Enter | 2 s | yes | l01, l01b |
| 2 | Take the first load off the turbine and let the reactor follow it down. | 5x; LOAD 95/90/85/80/75, one per plant-minute; Tavg 578 to 580 each time, so 3-step MED inserts (303 to 288) | about 6 plant-min | yes | Lit early (S-7). l02, l02b |
| 3 | Bring AVG COOLANT TEMPERATURE back into its band with the rods. | Nothing; already 575 °F and 74 % | 0 | yes | l03 |
| 4 | Take the load down to 50 MWe, then trim AVG COOLANT TEMPERATURE back into its band. | LOAD 70 to 50 plus 5 inserts, then 1 trim insert (288 to 270) | about 7.5 plant-min | yes | 18 steps vs "20 to 30". l04, l04b |
| 5 | Take the load down to 30 MWe, then trim AVG COOLANT TEMPERATURE back into its band. | LOAD 45 to 30 plus 4 inserts, then 1 trim (270 to 255) | about 5 plant-min | yes | l05, l05b |
| 6 | Take the load down to 15 MWe, then trim AVG COOLANT TEMPERATURE back into its band. | LOAD 25/20/15 plus 3 inserts, then 3 trims (255 to 237) | about 6 plant-min | yes | 18 steps vs "10 to 15". Tavg crept 559 to 556 slowly. Power 12.5 %. l06, l06b, l07_done |

### pwr_shutdown (3 steps, T+11:05:11 to T+11:06:35)
| # | First sentence | What I did | Time to satisfy | Lit | Notes / shots |
|---|---|---|---|---|---|
| 1 | Take the load off the generator before the scram. | Typed 0 + Enter in LOAD | about 3 plant-s | yes | d01, d01b |
| 2 | Shut the reactor down. | SCRAM (read "CONFIRM / PRESS AGAIN TO TRIP"), then SCRAM again | about 4 s | yes | d02, d02a, d02b |
| 3 | Put the decay heat on the steam dump: Mode 3, Hot Standby. | STEAM DUMP AUTO once; TAVG changed to PRESS; steam pressure 1022 | about 20 plant-s | yes | d03, d03a, d03b, d04_done |

### pwr_cooldown (16 steps, T+11:06:48 to T+18:15:38)
| # | First sentence | What I did | Time to satisfy | Lit | Notes / shots |
|---|---|---|---|---|---|
| 1 | Add the boron a cold core needs before any cooling starts. | Typed 920 + Enter; status BORATING; auto 600x | about 64 plant-min | yes | Text said about 55. c01, c01b, c01c |
| 2 | Bring pressure under the point where the low-pressure protection can be blocked. | Typed 1900 + Enter in SET PZR PRESSURE | about 10 plant-s | yes | PORV opened and closed as described. c02, c02b |
| 3 | Block the protection that would read the cooldown as a leak. | TRIP BLOCKS, BLOCK on PZR PRESS LO-LO and SI REACTOR TRIP, closed the panel, ECCS STOP | about 17 plant-s | yes | Rows had moved (S-4). c03 to c03c |
| 4 | Cool the plant on the steam dump to where RHR can take over. | 34 DUMP SETPOINT entries, one per 6 plant-min (970 to 720 by 50, 695 to 270 by 25, 255 to 120 by 15); auto 60x after the first | 3 h 26 plant-min (about 9.5 min wall) | yes | Tedious but exact. Never dropped from 60x. c04, c04b |
| 5 | Take the pressure setpoint to the bottom of its range. | Typed 1700 + Enter | about 14 plant-s | yes | c05, c05b |
| 6 | Hand pressure control from the heaters to the spray. | HEATER OFF; typed 50 + Enter under SPRAY; SPRAY MANUAL; auto 5x | about 30 plant-s | yes | c06, c06b, c06c |
| 7 | Isolate the accumulators while pressure is inside their window. | Clicked the valve symbol once; ISOLATED | 2 s | yes | c07, c07b |
| 8 | Bring pressure under the RHR limit on the spray. | Nothing; auto 60x | about 10 plant-min | yes | PZR level held 30 %. c08, c08b |
| 9 | Put RHR in service as the cooldown loop. | ALIGN; typed 7 + Enter in HX SPLIT | 2 s | yes | c09, c09b |
| 10 | Take the reactor coolant pumps off now that RHR is circulating. | OFF on RCP FLOW | about 20 plant-s | yes | c10, c10b |
| 11 | Cool on RHR into Mode 5, inside the 100 °F per hour limit. | HX SPLIT 9 (auto 60x); watched SUBCOOLING MARGIN fall from 91 (32 ticked 11b at T+16:20); pressed SPRAY OFF at 29 °F; auto 600x for 11d | about 2 h 22 plant-min | yes | COOLDOWN RATE ran −38 to −87 °F/hr with no alarm. c11, c11b, c11c |
| 12 | Shut the spray now that the plant is cold. | Nothing (done in step 11) | 0 | yes | c12 |
| 13 | Confirm the plant is in Mode 5, Cold Shutdown. | Nothing (pre-satisfied) | 0 | yes | Text says pressure "will be low"; it read 254 psi. c13 |
| 14 | Confirm the accumulators are still full and isolated. | Nothing (pre-satisfied) | 0 | yes | c14 |
| 15 | Confirm RHR is carrying the heat. | Nothing (pre-satisfied) | 0 | yes | c15 |
| 16 | Leave the plant lined up for the next heatup. | SCRAM once (reset; now reads PRESS TO ARM); STEAM DUMP CLOSE; typed 1020 + Enter in DUMP SETPOINT | about 14 plant-s | yes | c16, c16b, c17_done |

## 4. Words and numbers I could not find on the board

| Text said | What the board showed | Where |
|---|---|---|
| "the green band on the tile" (AVG COOLANT TEMPERATURE) | A thin coloured strip under the value. I could not tell where green starts and ends, or read a number from it | Raise 4 to 8, Lower 3 to 6 |
| "BORON reads 663 ppm or below" | Two ppm values: the target box (660) and BORON CHEM (664) | Raise 9b |
| "Control Rods — Approaching Insertion Limit" (in the speed line) | Not present in the ALARMS list ("— no active alarms —") | Raise 5 (r05c) |
| "SOURCE RANGE reads a dash" | A small boxed dash glyph, not a plain "—". Readable, but a different shape | Startup 9 |
| "Repeat until it reads 0.00" | The step accepted −0.02 | Startup 11b |
| "PRIMARY PRESSURE will be low" | 254 psi and rising | Cooldown 13 |

Every other named control was found on the first try by its exact words: ON/OFF (RCP FLOW), FAST/MED/SLOW, WITHDRAW/INSERT under CONTROL and SHUTDOWN, AUTO (SG FEED), A+B 7 %, SPRAY/HEATER AUTO/MANUAL/OFF, SET PZR PRESSURE, the accumulator valve symbol, DUMP SETPOINT, the BORON box captioned 0-2500 ppm, 1/M PLOT and Plot point, TRIP BLOCKS and its row names, LATCH, LOAD, OUTPUT, SCRAM, ALIGN, HX SPLIT, COOLDOWN RATE and ECCS STOP.

## 5. What the text got right

- **Startup 1/M approach:** the count targets (7.0e2, 1.4e3, 3.0e3, 7.0e3) and their predicted rod positions landed within a few steps. The prediction converged 292, 245, 214, 209, and critical came 3 steps under the final prediction.
- **Startup 12:** "Expect about 7 taps" took exactly 7, and "about 20 plant-minutes" was about 21.
- **Startup 13:** "Expect about 5 pulls and 5 plant-minutes" took exactly 5 and 5.
- **Startup 15:** the warning to block above 9½ % (and why it can drop out between 8 and 9½) meant I waited and it held first time.
- **Startup 16:** "Any click outside the panel closes it … so it is shut when this step opens" was true, and pre-empted a moment of confusion.
- **Heatup 10 and cooldown 7:** "The valve symbol sits just above the ACCUMULATORS tile" plus the pulse made the only diagram click trivial.
- **Heatup 9:** the automatic hold at 1x at 665 psi ("the plant needs you here") meant the accumulator window could not be missed.
- **Raise 8:** "about 20 steps" was exactly 20, and the 103 % rod-stop warning set the right expectation.
- **Shutdown 2:** SCRAM's own "CONFIRM / PRESS AGAIN TO TRIP" label matched the step text.
- **Cooldown 2:** the PORV lift "for about ten plant-seconds and closes by itself" happened exactly as described, so the alarm did not alarm me.
- **Cooldown 4:** "The clock moves to 60× by itself once your first new setpoint goes in" was true, and the 6-minute spacing kept COOLDOWN RATE comfortable throughout.
- **Cooldown 11:** splitting the subcooling watch into "ticks at 32, press at 30" made the spray-off timing easy to hit, and the −83 means 83 °F/hr explanation removed the sign confusion.
- **The "Next: … ▸" chain:** every leg handed the plant cleanly to the next, and every opening check was already green.
