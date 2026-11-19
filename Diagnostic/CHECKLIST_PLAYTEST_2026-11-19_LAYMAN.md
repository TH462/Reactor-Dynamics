> **Record, not policy.** Layman pass on 2026-11-19, tree `fe1290e` (Alpha 1.9.0-rc4, #768 logarithmic Doppler), run in the cloud container's Chromium against the main tree (the skill's Edge path patched in a scratch copy of the driver only). **6 of 6 legs completed, 67/67 steps, ~85 min wall, one continuous plant**; one reactor trip in startup step 5 caused by the reviewer's own 60 s hold, recovered with Rewind. **Purpose: confirm #768, not discover.** The three step-text numbers #768 could have moved were re-measured on the route harness, typical route, on this tree: lower power step 5 = **15 taps** (bank 534 → 519) against "12 to 15" — **narrowed**, the reviewer's 24 includes ~0.4 s taps that moved 0 steps; startup step 5 SOURCE RANGE 7.0e2 at **bank 78** against "70 to 80" — **narrowed**, the 86 was a continuous hold past the live value while the 30-s average caught up (S-1's real point, the text); startup step 14 **4.8 plant-min** against "3 to 5 plant-minutes", 5 pulls against "about 4" — **confirmed within the text**. **NOT MEASURED, not filed:** S-1 (the step ticks on a 30-s average the instruction does not name), S-2 (step 8's 5× overridden to 10×), S-3 (pull timing), S-4 (step 11 target already passed on arrival), S-5 (cooldown 11c's ~2 s wall window at 60×), S-6 (step 13's moving branch number), S-8 (unlabelled accumulator symbol). All predate #768 (presentation and pacing, not plant numbers) and are left for a measured follow-up.

# Layman playthrough — Alpha 1.9.0-rc4

## 1. Outcome
All six legs finished, chained via each leg's "Next: … ▸" button, on one continuous plant (T+00:00 → T+18:53 plant time, ~85 min wall). One reactor trip, in startup step 5, caused by my driver holding WITHDRAW for 60 s; recovered with ⏪ Rewind step. No page errors logged.

| Leg | Result | Steps completed | The one thing that mattered |
|---|---|---|---|
| pwr_heatup | Complete | 16/16 | Nothing blocked; accumulator valve found only because it glowed. |
| pwr_startup | Complete | 18/18 | Step 5-8 tick on a 30-s AVERAGE of SOURCE RANGE, not the reading the text names; step 8's "keep the clock at 5×" is overridden by the walkthrough setting 10×. |
| pwr_raise_power | Complete | 9/9 | "5-step pulls" cannot be timed by a player; my pulls were 1-7 steps each depending on clock speed. |
| pwr_lower_power | Complete | 5/5 | Tap counts are off (step 5 needed 24 taps vs "12 to 15"), but the 3-tap rule self-corrects. |
| pwr_shutdown | Complete | 3/3 | Clean; SCRAM's arm-then-press was spelled out. |
| pwr_cooldown | Complete | 16/16 | At 60× the "SUBCOOLING MARGIN below 30 °F → spray OFF" window lasts ~2 s of wall time. |

## 2. Stuck points (ranked)

**S-1 — Startup step 5 (and 6-8): the tick is on an average the text does not name, and nothing warns where the trip is.**
Text: "Press MED, hold CONTROL WITHDRAW until SOURCE RANGE reads 7.0e2 or more. If the 30-second average shown below stays under 7.0e2, tap WITHDRAW once and wait half a plant-minute … Expect it near CONTROL ROD POSITION 70 to 80."
What I did: First try, held WITHDRAW 60 s straight (my driver could not read the SOURCE RANGE value, which is drawn graphics, not text) → "Reactor Trip — Source Range Hi Flux", panel: "The reactor has tripped. This walkthrough cannot carry on from here". ⏪ Rewind step took me back to the START of step 4, so I had to redo the 1/M baseline too. Second try in 1.5 s bursts: live SOURCE RANGE showed 7.0e2 at CONTROL ROD POSITION 86 (not 70-80), while the panel's "Average over the last 30 plant-seconds" lagged behind; holding until the tick overshoots, stopping at the live reading leaves you waiting with no tick. Step 5 gives no upper bound (step 8 alone says "If SOURCE RANGE passes 2.0e4, the rods went too far").
What would have unstuck me: say "hold until the live SOURCE RANGE reads 7.0e2, let go, and wait for the average below to catch up; the reactor trips at 1.0e5".

**S-2 — Startup step 8: the walkthrough overrides the clock the text tells you to keep.**
Text: "Keep the clock at 5× while you hold: faster, and the rods overshoot before the count shows it." / "Suggested time warp: 5× while the rods move, then 10×, set by itself."
What I did: Pressed 5×; after my first 1.5 s hold the status line read "The walkthrough set the speed to 10×." I re-pressed 5× before every hold. Later, while waiting for STARTUP RATE to settle, the clock stayed at 5× (no "set by itself" 10×); I pressed 10× myself.
What would have unstuck me: the walkthrough should hold 5× while rods move in this step, or the text should say "press 5× again before each hold".

**S-3 — Raise power steps 4-8: a "5-step pull" cannot be timed, and the clock drops silently.**
Text: "withdraw at MED in 5-step pulls a plant-minute apart until it reads 557 °F … 30 to 35 steps."
What I did: At MED a 0.4 s hold moved 0 steps, 0.8 s moved 1, 4 s moved ~3 (at 1×) and 2 s moved ~6-7 (at 5×). Mid-pulls the status line changed to "Dropped to real time — new alarm: Low Coolant Temperature", so my "plant-minute apart" waits were really ~14 plant-seconds. Totals still landed in range (30, 27, 21, 7, 1 steps).
What would have unstuck me: give the pull as a hold time at a stated clock ("hold about 2 s at 5×") or as "watch CONTROL ROD POSITION go up by 5".

**S-4 — Startup step 11: the heading's target was already gone when I arrived.**
Text: "11. Level power near 1.0e-8 A and record the critical rod position." / "11a✓ Wait for INTER RANGE to read 1.0e-8 A." (ticked on arrival)
What I did: INTER RANGE was already 1.8e-7 A; held INSERT at MED to 212 then tapped to 208; it leveled at 5.3e-7 A. The text's caveat "higher if the insert starts late" is the only hint. Step 12 then took ~10 plant-min, not "20 to 26".
What would have unstuck me: a line on step 10 saying "press Continue promptly — power keeps rising past 1.0e-8 A while you read".

**S-5 — Cooldown step 11: the spray-OFF window is ~2 s of wall time.**
Text: "11c· When SUBCOOLING MARGIN reads below 30 °F, press OFF under SPRAY" (walkthrough set 60×; status "This computer can only run the plant at about 45× here.")
What I did: 11b ticked at 32 °F; 5 s later the tile read 27 °F and PRIMARY PRESSURE 83 psi; pressed OFF then. It passed, but a player reading the panel would miss "below 30" entirely.
What would have unstuck me: drop the clock to 1× when 11b ticks, as other steps do ("Held at real time — the plant needs you here").

**S-6 — Startup step 13: a branch decided by a number that moves while you act.**
Text: "Type 50 in the gpm box beside RESTORE on the SG FEED card, or 100 if REACTOR POWER reads 1.5 % or more."
What I did: Power read 1.1 % → typed 50; it read 1.6 % 15 s later and 2.2 % by the time SG level reached 60 %. I left 50; it worked.
What would have unstuck me: "decide once, from REACTOR POWER when you start this step".

**S-7 — Lower power step 5 / raise power step 14: counts in the text are off (no block).**
Text: "About 12 to 15 taps in all" (I needed 24: Tavg fell only ~1 °F per 3-tap round); startup step 14 "Expect about 4 pulls" (I needed 5).
What would have unstuck me: nothing needed; the self-checking rule ("until it reads below 557 °F") carried it.

**S-8 — Heatup step 9 / cooldown step 7: the accumulator valve has no label.**
Text: "The valve symbol sits just above the ACCUMULATORS tile, left of ECCS INJ FLOW."
What I did: Found it because it glowed; clicked it. Fine, but the only unlabeled control in the run.
What would have unstuck me: a small label on the symbol.


## 3. Per-step log

### Leg 1 — pwr_heatup ("Startup Part 1 — Mode 5, Cold Shutdown → Mode 3, Hot Standby — plant heatup (pump heat)", 16 steps)
Start: T+00:00:01, Tavg 122 °F, pressure 363 psi, PZR level 25 %. Shot: a2_heatup_start.png
- **Step 1** "Start the reactor coolant pumps." Looked for "ON beside the reactor coolant pump, above RCP FLOW" — found OFF/ON pair above "RCP FLOW" on the diagram; clicked ON (diagram button). RCP FLOW 3 % → 11 % at 3 s, >90 % within ~40 s plant time at 1×. Continue lit. No confusion. Shots: a2_heatup_start.png, h1_rcp_on.png.
- **Step 2** "Withdraw the shutdown bank all the way out." Pressed FAST (ROD CONTROL card), clicked WITHDRAW under SHUTDOWN once. Bank drove on its own; walkthrough auto-set 60× ("The walkthrough set the speed to 60×."), back to 1× when done. ~20 s wall, plant T+00:00:46 → T+00:09:58. Continue lit. Note: SCRAM tile read "SCRAM / PRESS TO ARM", not "SCRAMMED / PRESS TO RESET", so I did not press it — fine. Shots: h2.png, h2_withdraw.png, h2_wait.png.
- **Step 3** "Confirm the turbine is tripped." Read only. TRIP lit, OUTPUT 0 MW, LOAD 0. Continue lit immediately. Shot h3.png.
- **Step 4** "Put auxiliary feed in AUTO to hold steam generator level." Pressed AUTO on the AUX FEED WATER card (header read STANDBY before). Continue lit within 3 s. Shots h4.png, h4_afw.png.
- **Step 5** "Confirm the steam dump is closed." Read only; MANUAL with CLOSE lit, valve 0 %. Continue lit immediately. Shot h5.png.
- **Step 6** "Open the letdown orifices before the pressure climb shuts the residual heat removal (RHR) path." Pressed "A+B 7%" on LETDOWN card (board label "A+B 7%", text "A+B 7 %" — same). Continue lit in 2 s. Shots h6.png, h6_ab.png.
- **Step 7** "Put pressurizer spray in service before the heaters start the climb." Pressed AUTO under SPRAY on PRESSURIZER (PZR) card. Continue lit in 2 s. Shots h7.png, h7_spray.png.
- **Step 8** "Raise PRIMARY PRESSURE to the 665 psi accumulator window on the heaters." Pressed AUTO under HEATER. Walkthrough set 600×; pressure reached 665 psi by T+00:53:47 (~30 s wall); clock dropped to 1× with "Held at real time — the plant needs you here". Continue lit. Shots h8.png, h8_htr.png, h8_wait.png.
- **Step 9** "Open the accumulator valve while PRIMARY PRESSURE is inside its window." Text location "just above the ACCUMULATORS tile, left of ECCS INJ FLOW" was enough: one glowing valve symbol there (x≈376,y≈537 in a 1600×1000 shot); clicked it once, tile changed from ISOLATED. Continue lit in 2 s. Minor: the symbol has no label of its own — I found it only because it was highlighted. Shots h9.png, h9_acc.png.
- **Step 10** "Heat the plant to 542 °F on pump heat alone." No action. Walkthrough set 600× ("— watch the chart"). Tavg 222 → 546 °F, T+01:07 → T+05:54, ~60 s wall. Back to 1× automatically; Continue lit. Shots h10.png, h10_wait1.png.
- **Step 11** "Confirm letdown now leaves only through the orifices." Read only; ISOLATE lit on RHR, LETDOWN > 0 gpm. Continue lit immediately. Shot h11.png.
- **Step 12** "Hand STEAM PRESS to the steam dump to hold." DUMP SETPOINT already 1020 psi; pressed AUTO on STEAM DUMP card. Continue lit in 2 s. Shots h12.png, h12_dump.png.
- **Step 13** "Bring PRIMARY PRESSURE up to normal operating pressure." Typed 2235 + Enter in SET PZR PRESSURE (was 1700). 600× auto; >2200 psi by T+06:19:53, ~25 s wall. Continue lit. Shots h13.png, h13_sp.png, h13_wait.png.
- **Step 14** "Confirm Hot Standby." Read only; all four checks ticked. Continue lit immediately. Shot h14.png.
- **Step 15** "Confirm the reactor stayed shut down." Read only; 10× auto, "Watching it settle… 15 of 30 plant-seconds" counter; done ~5 s wall. Continue lit. Shot h15.png.
- **Step 16** "Confirm the heatup made no fission power." REACTOR POWER 0.0 %. Continue lit immediately. Shot h16.png.
- **Leg end**: "✓ Walkthrough complete … Next: Startup Part 2 ▸". Heatup finished in ~12 min wall, plant T+06:20. Shot h_done.png.

### Leg 2 — pwr_startup
Started from "Next: Startup Part 2 ▸" on the finished heatup (continuing plant, T+06:23). 18 steps.
- **Step 1** "Verify the plant is in Hot Standby (Mode 3)." Read only; all ticked. Continue lit. Shot s1.png.
- **Step 2** "Dilute boron to the estimated critical concentration, 719 ppm." Typed 719 + Enter in BORON card's box (beside "0-2500 ppm"). 600× auto; reached HOLD by T+08:32:57 (~2.2 plant-h, ~65 s wall). Continue lit. Shots s2.png, s2_b.png, s2_w.png.
- **Step 3** "Line up the steam generator (SG) before taking the reactor critical." Read only. Continue lit. Shot s3.png.
- **Step 4** "Take the 1/M baseline point before any rod moves." Pressed 1/M PLOT (ROD CONTROL card), window "1/M Startup Plot" opened with "Plot point"; pressed it, closed with ✕. Continue lit. Shots s4.png, s4_m.png, s4_pp.png, s4_closed.png. Observed: STEAM GENERATOR LEVEL had fallen 65 → 36 % by now (no step mentions it).
- **Step 5** "Take the second 1/M point, after the first rod pull." First attempt: pressed MED, held CONTROL WITHDRAW for 60 s straight (MY driver error — my script could not read SOURCE RANGE, which is drawn as canvas, so it never released). Reactor tripped: "Reactor Trip — Source Range Hi Flux", panel said "The reactor has tripped. This walkthrough cannot carry on from here… Press ⏪ Rewind step". Shot s5_hold.png. Pressed ⏪ Rewind step → landed at the START of step 4 (previous step), so I redid the 1/M baseline. Second attempt: held WITHDRAW in 1.5 s bursts (9 bursts), reading the panel's "Average over the last 30 plant-seconds: …" line, which climbed 5.1e2 → 7.0e2. SOURCE RANGE tile showed 7.0e2 at CONTROL ROD POSITION 86 (text said "Expect it near CONTROL ROD POSITION 70 to 80") — overshoot because the 30-s average lags the live reading. 5a ticked; STARTUP RATE −0.00 within 8 s; 1/M PLOT → Plot point → ✕. Continue lit. Confusion: the text says hold "until SOURCE RANGE reads 7.0e2", but what ticks is a 30-s average, so a player who stops at the live reading waits; one who holds till the tick overshoots. Shots s5.png, s5_h0..5.png, s5_i0..2.png, s5_j.png, s5_plot.png.
- **Step 6** "Take the third 1/M point." Held CONTROL WITHDRAW in 6×1.5 s + 1×1 s bursts; live SOURCE RANGE 1.4e3 at CONTROL ROD POSITION 148 (text: "near 150 to 155" — fine). Waited ~10 s for the 30-s average to tick 6a; STARTUP RATE +0.00; 1/M PLOT → Plot point: plot read "predicted criticality ≈ step 234 (37.3% withdrawn)". Closed ✕. Continue lit. Shots s6.png, s6_h*.png, s6_k.png, s6_plot.png.
- **Step 7** "Take the fourth 1/M point, after a shorter pull." 4×1.5 s + 1×0.6 s WITHDRAW bursts; SOURCE RANGE 3.8e3 at CONTROL ROD POSITION 188 (text "190 to 192"). 7a ticked; ~5 s later 1/M PLOT → Plot point: "predicted criticality ≈ step 213 (34.0% withdrawn)". Continue lit. Shots s7.png, s7_h*.png, s7_k.png, s7_plot.png, s7_plot_crop.png.
- **Step 8** "Take the final 1/M point, the one the approach to critical is built on." Pressed SLOW, pressed 5× as told ("Keep the clock at 5× while you hold"). CONFUSION: after my first 1.5 s hold the status line read "The walkthrough set the speed to 10×." — the walkthrough itself overrode the 5× the text told me to keep; I re-pressed 5× before each further hold. 3×1.5 + 8×2 + 1×1.2 s at SLOW: rods 188 → 201; 8a ticked with live SOURCE RANGE 6.8e3 (text: "7.0e3 or more", "near 202"). Then the speed stayed at 5× (text said "then 10×, set by itself" — it did not); I pressed 10× myself. ~40 s wall later STARTUP RATE +0.01, SOURCE RANGE 1.1e4. 1/M PLOT → Plot point: "predicted criticality ≈ step 210 (33.4% withdrawn)". Continue lit. Shots s8.png, s8_h*.png, s8_i*.png, s8_j*.png, s8_k0.png, s8_w2.png, s8_plot_crop.png.
- **Step 9** "Block the source range trip at P-6, the permission to block it." Pressed TRIP BLOCKS (ROD CONTROL card); panel listed 5 rows; SR HIGH FLUX row highlighted with BLOCK; pressed BLOCK, then TRIP BLOCKS to close. Continue lit. Words "P-6" not explained in the step line itself (background explains "P-6 PERMISSIVE"); not a blocker. Shots s9.png, s9_tb.png, s9_blk.png, s9_closed.png.
- **Step 10** "Take the reactor critical and set STARTUP RATE between +0.3 and +1.0." SLOW at 5×: 2 s bursts, rods 201→207 (6 bursts), 10a ticked at 207, STARTUP RATE +0.14. Then 10× and 5×2 s holds: rods 207→218, rate +0.18/+0.25/+0.32/+0.40/+0.48 → let go at +0.48. Continue lit 8 s later. Text's "about 10 to 15 seconds at 10×" matched (10 s). No confusion. Shots s10.png, s10_h*/i*/j0.png, s10_k_strip.png, s10_l0.png, s10_m.png.
- **Step 11** "Level power near 1.0e-8 A and record the critical rod position." 11a was already ticked when I arrived (I had spent ~50 s wall between steps; the walkthrough set 5×). MED, held INSERT 1.0 s + 1.1 s (218 → 212; rate −0.07), tapped INSERT twice to 210 as the text says, pressed 10× and waited 2 plant-min: rate +0.07; tapped INSERT → 209: +0.04; tapped → 208: +0.02 → 11b/11c ticked, Continue lit. Critical rod position 208 vs 1/M prediction 210 (within the "about three steps"). INTER RANGE leveled at 5.3e-7 A, not "near 1.0e-8 to 2.0e-8 A" — the text warns "higher if the insert starts late", and I was late. Confusion: the step heading says "Level power near 1.0e-8 A" but 11a ticks on arrival and nothing tells you power has already overshot that by 50×; a player who reads slowly cannot meet the heading. Shots s11.png, s11_a..e.png.
- **Step 12** "Raise power to the point of adding heat, about 1 %." 1/M window was already closed. SLOW; 5 single WITHDRAW taps, each followed by ~85 plant-s at 10×: rates +0.04 (209), +0.07 (210), +0.10 (211), +0.13 (212), +0.16 (213) → 12a ticked; walkthrough set 60×; power ≥1 % and rate ≤ +0.10 by T+09:42:52 (~10 plant-min, not the "20 to 26 plant-minutes" the text predicts — because power started 50× higher after step 11). Continue lit. Shots s12.png, s12_t_strip.png, s12_u_strip.png, s12_w.png.
- **Step 13** "Put main feed in service and secure auxiliary feed." REACTOR POWER read 1.1 % on arrival → typed 50 + Enter in the gpm box beside RESTORE (SG FEED card went MANUAL, FEED FLOW 50 gpm). 10×; SG level 35 → 60 % in ~50 s wall (power drifted to 2.2 %). Pressed AUTO on SG FEED, then STOP on AUX FEED WATER. Continue lit. Minor: "or 100 if REACTOR POWER reads 1.5 % or more" — power crossed 1.5 % while I was filling; unclear whether to re-type 100 (I left 50; it worked). Shots s13.png, s13_top.png, s13_feed.png, s13_w_top.png, s13_done.png.
- **Step 14** "Raise power past 5 %, into Mode 1, At Power." SLOW, 5×; five double-taps of WITHDRAW, ~1 plant-minute apart (12.5 s wall at 5×): rods 213 → 223, power 2.2 → 5.2 %. Continue lit (text predicted "about 4 pulls" — I needed 5). Shots s14.png, s14_done.png, s14_done_top.png.
- **Step 15** "Put the turbine on line and let the reactor follow it up." LATCH; typed 10 + Enter in LOAD; 10×; OUTPUT ≥ 8 MW by T+09:59:11 (~20 s wall). Pressed AUTO on STEAM DUMP again → status TAVG. Continue lit. Shots s15.png, s15_load.png, s15_w.png, s15_tavg.png.
- **Step 16** "Block the first startup trip, IR HIGH FLUX." Waited at 1× ~35 s for power ≥ 8.5 %. TRIP BLOCKS → BLOCK on IR HIGH FLUX row (SR row showed red "RELEASE?" as the text warned) → closed. Continue lit. Text did not say to close TRIP BLOCKS this time; I closed it anyway (habit from step 9). Shots s16.png, s16_w.png, s16_tb_crop.png, s16_blk.png.
- **Step 17** "Block the second startup trip, PR HIGH (LOW SETPT)." TRIP BLOCKS → BLOCK on PR HIGH (LOW SETPT) → closed. Continue lit. Shots s17.png, s17_blk.png, s17_blk_crop.png.
- **Step 18** "Verify the plant is in Mode 1, At Power." Read only; ticked. Continue lit.
- **Leg end**: "Reactor critical in Mode 1, At Power, OUTPUT 10 MWe … Next: Startup Part 3 ▸". ~30 min wall. Shot s_done.png.

### Leg 3 — pwr_raise_power
- **Step 1** "Confirm the plant the startup handed over is ready to climb." Read only; ticked; Continue lit. Shot r1.png.
- **Step 2** "Make sure the turbine is on line and taking steam." Read only; ticked; Continue lit. Shot r2.png.
- **Step 3** "Start the boron dilution that carries most of the climb." Typed 660 + Enter in BORON box. Continue lit in 2 s. Shot r3.png.
- **Step 4** "Take the first stage to 30 MWe, load leading and rods following." Typed 30 + Enter in LOAD; walkthrough set 10× "— watch the chart"; OUTPUT 30 MW and ΔREF ≤ −4 °F ticked by T+10:05 (~40 s wall). Tavg sagged to 531 °F (TREF 557). Pressed MED and pulled WITHDRAW. CONFUSION: a "5-step pull" is not something a player can time — at MED a 0.4 s hold moved 0 steps, 0.8 s moved 1 step; I ended up holding 4 s per pull and got ~3 steps each. Also the clock silently fell to 1× mid-pulls ("Dropped to real time — new alarm: Low Coolant Temperature"), so my "plant-minute apart" waits of ~14 s wall were really 14 plant-seconds. Rods 223 → 253 (30 steps, inside the text's "30 to 35 steps"); Tavg 557 °F, power 31.8 % → 4c ticked at T+~10:10. Continue lit. ~4 min wall. Shots r4.png, r4_w.png, r4_w2.png, r4_p_strip.png, r4_q_strip.png, r4_r0..7.png, r4_s0..1.png, r4_now.png.
- **Step 5** "Take the second stage to 50 MWe the same way." Typed 50 in LOAD, 10× (walkthrough also set 10×). Pressurizer Pressure Low alarm came in at T+10:11:36 tagged "predicted by step 5" — the step says to start rod pulls then if Tavg < 563 °F; I (my polling script) did not act on it until 5b ticked at ~T+10:14:47. Then MED, 4 pulls of 2 s each at 5× (re-pressing 5× each time), ~12 s wall apart: rods 253→260→267→274→280 (≈ 6-7 steps per pull, not 5), Tavg 550→555→560→563 °F, power 53 %. 5c ticked; walkthrough set 1×. Continue lit. Total ~27 rod steps vs the text's "15 to 25 steps". Shots r5.png, r5_w.png, r5_s_strip.png.
- **Step 6** "Take the third stage to 75 MWe the same way." LOAD 75, 10×; OUTPUT 75 MW in ~36 s wall. MED, 3 pulls of 2 s at 5×: rods 280→287→294→301, Tavg 563→568→571 °F, power 78 %. 6c ticked; Continue lit. 21 steps (text: "20 to 35"). Shots r6.png, r6_w.png, r6_strip.png.
- **Step 7** "Take the fourth stage to 90 MWe with a smaller pull." LOAD 90, 10×; OUTPUT 90 MW in ~24 s wall. One 2 s MED pull at 5×: rods 301→308, Tavg 576 °F, power 92.5 %. 7c ticked; Continue lit. Shots r7.png, r7_w.png, r7_strip.png.
- **Step 8** "Take the last stage to full load and settle the temperature near 580 °F." LOAD 100, 10×; OUTPUT 100 MW in ~18 s wall. One 2 s MED pull at 5×: rods only 308→309 (the pull mostly did not move — power was 102.6 %, near the "103 % rod stop" the text mentions); Tavg 573 °F anyway → 8c/8d ticked. Continue lit. Note: REACTOR POWER 102.6 % reading next to OUTPUT 100 MW. Shots r8.png, r8_w.png, r8_strip.png.
- **Step 9** "Confirm full power, with the boron dilution done." No rod action needed (Tavg 580 °F ≥ 577). Walkthrough held 5× ("A wait whose length depends on the plant — fast-forwarding at 5×"); BORON CHEM 664 → 663 ppm at T+10:51:28, ~3.3 min wall for ~14 plant-min. Continue lit. Final: power 101.4 %, Tavg 580 °F, pressure 2258 psi, PZR 62 %, SG 65 %. Observation: 5× for a 26-plant-minute wait is a slow wall-clock stretch with nothing to do. Shots r9.png, r9_w*.png, r9_boron.png, r9_top.png.
- **Leg end**: "Full power with almost no xenon … Next: Shutdown Part 1 ▸". ~22 min wall. Shot r_done.png.

### Leg 4 — pwr_lower_power
- **Step 1** "Start adding boron before any load comes off." Typed 719 + Enter in BORON box. Continue lit in 2 s. Shot l1.png.
- **Step 2** "Take the first load off the turbine and let the reactor follow it down." At 10× (pressed by me before each cut), typed LOAD 95, 90, 85, 80, 75 + Enter, 6 s wall apart; Tavg after each cut 583/583/584/580/579 °F → 3 INSERT taps each (15). Then one more set of 3 taps at 578 °F → Tavg 576 °F, power 74 % — 2a/2b/2c ticked by T+10:58:52 (~50 s wall). 18 taps total (text: "about 30 … down to about 15"). Continue lit. No confusion; the "(6 seconds at 10×)" conversion was useful. Shots l2.png, l2_end.png.
- **Step 3** "Take the load down to 50 MWe, then trim AVG COOLANT TEMPERATURE back into its band." LOAD 70, 65, 60, 55, 50 at 10×, 6 s wall apart. CAVEAT (my driver, not the text): this step's panel had no live "AVG COOLANT TEMPERATURE …" line, and my script read Tavg from that line, so it made NO INSERT taps after any cut — I did not check the tile after each cut as a player would. The step ticked anyway: at T+11:11:56 Tavg 568 °F, power 48.5 %, rods unchanged at 291, pressure 2215 psi. So this stage can pass with zero inserts (boron did it). Continue lit. Shots l3.png, l3_end.png, l3_end_top.png.
- **Step 4** "Take the load down to 30 MWe, then trim AVG COOLANT TEMPERATURE back into its band." This time I read the AVG COOLANT TEMPERATURE tile after each cut. 10×, cuts 45/40/35/30 6 s wall apart; Tavg after each 568/567/567/569 °F (all > 562) → 3 INSERT taps after each of the first three, then 3-tap rounds a plant-minute apart: 567, 565, 562, 561 °F. 4b/4c ticked at Tavg 561, power 28.5 %, rods 291 → 270. 21 taps (text: "about 20"). Continue lit. Observation: one tap = one step (rods fell exactly 3 per round). Shots l4.png, l4_c45/40/35/30.png, l4_t_strip.png, l4_t_strip2.png.
- **Step 5** "Take the load down to 15 MWe, then trim AVG COOLANT TEMPERATURE back into its band." Cuts 25/20/15 at 10×: Tavg 564/565/565 °F → 3 taps after each; then six 3-tap rounds a plant-minute apart: 564, 563, …, 556 °F. 5b/5c ticked at Tavg 556 °F, power 13.6 %, rods 270 → 246. 24 taps (text: "About 12 to 15 taps in all") — Tavg fell only ~1 °F per 3-tap round. Continue lit. Shots l5.png, l5_c25/20/15.png, l5_t_strip.png, l5_t3..6.png.
- **Leg end**: "Plant stable at 15 MWe … Next: Shutdown Part 2 ▸". ~12 min wall. Shot l_done.png.

### Leg 5 — pwr_shutdown
- **Step 1** "Take the load off the generator before the scram." Typed 0 + Enter in LOAD; OUTPUT < 5 MW within 15 s at 1×. Continue lit. Shots d1.png, d1_w.png.
- **Step 2** "Shut the reactor down." Pressed SCRAM twice (arm, then scram). Rods 0/0, power falling. Continue lit within 6 s. Shots d2.png, d2_scram.png.
- **Step 3** "Put the decay heat on the steam dump: Mode 3, Hot Standby." Pressed AUTO on STEAM DUMP once; status read STM PRESS; walkthrough set 10×; STEAM PRESS held 1015-1025 psi by T+11:40:26 (~20 s wall). Continue lit. Shots d3.png, d3_a.png, d3_w.png.
- **Leg end**: "Reactor shut down at Mode 3, Hot Standby … Next: Shutdown Part 3 ▸". ~2 min wall. Shot d_done.png.

### Leg 6 — pwr_cooldown
- **Step 1** "Add the boron a cold core needs before any cooling starts." Typed 938 + Enter; BORATING; walkthrough set 600×; ≥880 ppm by T+12:43 (~40 s wall). Continue lit. Shots k1.png, k1_b.png, k1_w.png.
- **Step 2** "Bring pressure under the point where the low-pressure protection can be blocked." Typed 1900 + Enter in SET PZR PRESSURE; below 1972 psi within ~11 s at 1×. Continue lit. Shots k2.png, k2_w.png.
- **Step 3** "Block the protection that would read the cooldown as a leak." TRIP BLOCKS → BLOCK on PZR PRESS LO-LO, BLOCK on SI REACTOR TRIP (both rows readable in the panel; it also explained IR/PR rows were 'RELEASED BY THE PLANT'), closed TRIP BLOCKS (not told to, but it covers the ECCS card area), pressed STOP on ECCS. Continue lit. Shots k3.png, k3_tb_crop.png, k3_b2_crop.png, k3_eccs.png.
- **Step 4** "Cool the plant on the steam dump to where residual heat removal (RHR) can take over." Typed 120 + Enter in DUMP SETPOINT; 600× auto; STEAM PRESS 1019 → 120 psi, Tavg 547 → 342 °F by T+16:11 (~60 s wall). Continue lit. Shots k4.png, k4_sp.png, k4_w.png.
- **Step 5** "Take the pressure setpoint to the bottom of its range." Typed 1700 + Enter; < 1770 psi in ~8 s. Continue lit. Shots k5.png, k5_w.png.
- **Step 6** "Hand pressure control from the heaters to the spray." OFF under HEATER; typed 50 + Enter in box under SPRAY; MANUAL under SPRAY. 6b ticked a few seconds after (lagged ~2 s behind the board showing MANUAL lit at 50 %); pressure < 1615 psi by T+16:12:11. Continue lit. Shots k6.png, k6_sp_crop.png, k6_b.png.
- **Step 7** "Isolate the accumulators while pressure is inside their window." Clicked the same valve symbol as heatup step 9; tile ISOLATED. Continue lit in 2 s. Shots k7.png, k7_acc.png.
- **Step 8** "Bring pressure under the RHR limit on the spray." No action; 60× auto; 395 psi by T+16:24 (~20 s wall), PZR level 29 %. Continue lit. Shots k8.png, k8_w.png, k8_top.png.
- **Step 9** "Put RHR in service as the cooldown loop." ALIGN on RHR card; typed 7 + Enter in HX SPLIT box. Continue lit in 2 s. Shots k9.png, k9_rhr.png.
- **Step 10** "Take the reactor coolant pumps off now that RHR is circulating." Pressed OFF above RCP FLOW; flow coasted down < 50 % in ~25 s at 1×. Continue lit. Shots k10.png, k10_off.png, k10_rcp.png.
- **Step 11** "Cool on RHR into Mode 5, inside the 100 °F per hour limit." Typed 8 + Enter in HX SPLIT; walkthrough set 60× (status: "This computer can only run the plant at about 45× here."). Subcooling 32 °F at ~25 s wall; I looked at the tile 5 s later and it already read 27 °F (pressure 83 psi) — at 60× the "below 30 °F" moment passes in about 2 s of wall time, so a player looking away misses it. Pressed OFF under SPRAY at 27 °F; 11c ticked. Walkthrough set 600×; Tavg < 199 °F by T+18:52 (~40 s wall). Continue lit. Shots k11.png, k11_a.png, k11_b.png, k11_c.png, k11_off.png, k11_w.png.
- **Step 12** "Shut the spray now that the plant is cold." Already OFF; ticked on arrival. Continue lit. Shot k12.png.
- **Step 13** "Confirm the plant is in Mode 5, Cold Shutdown." Read only; ticked. Continue lit. Shots k13.png, k13_top.png.
- **Step 14** "Confirm the accumulators are still full and isolated." Read only; ticked. Continue lit. Shot k14.png.
- **Step 15** "Confirm RHR is carrying the heat." Read only; ticked. Continue lit. Shot k15.png.
- **Step 16** "Leave the plant lined up for the next heatup." SCRAM read SCRAMMED / PRESS TO RESET → pressed once; shutdown bank already 0; CLOSE on STEAM DUMP; typed 1020 + Enter in DUMP SETPOINT. Continue lit. Shots k16.png, k16_scram.png, k16_done.png.
- **Leg end**: "Mode 5, Cold Shutdown: water below 199 °F, RHR carrying the plant … Next: Startup Part 1 ▸". ~15 min wall. Shot k_done.png.

## 4. Words and numbers I could not find on the board, or that did not match

| Walkthrough said | Board actually showed |
|---|---|
| Startup 5: "hold … until SOURCE RANGE reads 7.0e2" (ticks on "the 30-second average shown below") | The average is only in the walkthrough panel; the SOURCE RANGE tile shows the live value, which reached 7.0e2 well before the tick |
| Startup 5: "Expect it near CONTROL ROD POSITION 70 to 80" | 7.0e2 live at 86 |
| Startup 8: "hold … until SOURCE RANGE reads 7.0e3 or more", "near 202" | 8a ticked with the tile reading 6.8e3 at 201 |
| Startup 8: "Keep the clock at 5×" | Status: "The walkthrough set the speed to 10×." |
| Startup 8: "then 10×, set by itself" | Clock stayed at 5× |
| Startup 11: "Level power near 1.0e-8 A"; "Expect INTER RANGE to level near 1.0e-8 to 2.0e-8 A" | 1.8e-7 A on arrival; leveled at 5.3e-7 A |
| Startup 12: "Expect 20 to 26 plant-minutes" | ~10 plant-minutes (after step 11's late level) |
| Raise power 4-8: "5-step pulls" | No pull counter; only CONTROL ROD POSITION; steps per hold vary with clock speed |
| Lower power 5: "About 12 to 15 taps in all" | 24 taps |
| Heatup 9 / Cooldown 7: "The valve symbol" | Unlabeled glowing valve icon |
| Heatup 2: "If SCRAM reads SCRAMMED / PRESS TO RESET" | Read "SCRAM / PRESS TO ARM" (condition simply not met — correct, but the two-state wording was new to me) |
| Raise power 8 / 9: "REACTOR POWER under 103 %" | Read 102.6 % at OUTPUT 100 MW, rods barely moved on a 2 s pull |

## 5. What the text got right
- Every control the text named by its on-board words was found on the first try (RCP ON/OFF, A+B 7%, SPRAY/HEATER AUTO/MANUAL/OFF, SET PZR PRESSURE, DUMP SETPOINT, HX SPLIT, ALIGN, LATCH, LOAD, RESTORE gpm box, TRIP BLOCKS rows, 1/M PLOT → Plot point → ✕).
- Read-only check steps tick on arrival and say exactly which tile to read.
- "Click WITHDRAW only once; a second click stops the bank" — correct, the bank drove itself.
- "(6 seconds at 10×)" conversion on the load-cut steps made "a plant-minute apart" actionable.
- Every "expected alarm" line matched what appeared (Pressurizer Pressure Low "predicted by step 5", Shutdown Cooling Not In Service, Pressure Relief Valve Open).
- Automatic speed changes ("The walkthrough set the speed to 600×", "Held at real time — the plant needs you here") handled most long waits without me.
- The trip-recovery message after the reactor trip told me exactly what to do (⏪ Rewind step).
- SCRAM "once to arm it (PRESS TO ARM), then again to scram" was exact.
- Location hints ("above RCP FLOW", "beside RESTORE", "left of ECCS INJ FLOW") were sufficient.
- Each finished leg offered the next one with a one-line state summary.
