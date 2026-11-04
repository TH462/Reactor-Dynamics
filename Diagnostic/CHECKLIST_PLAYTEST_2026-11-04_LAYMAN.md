> **Record, not policy.** Layman pass on #825 (rc9 playtest fixes), 2026-11-04, develop bf7a7d07 (Alpha 1.8.4-rc9), run by a fresh agent with no repo access at 1600x1000. Three legs chained from Main Menu: Startup Part 2 (`pwr_startup`, 18/18), Startup Part 3 (`pwr_raise_power`, 9/9), Shutdown Part 1 (`pwr_lower_power`, 5/5), no trip, about 40 min wall. Stuck points: S-1 an untagged Pressurizer Pressure Low at raise step 6; S-2 `#warpInfo` said "nothing to do" while the step asked for rod motion; S-3 the completion banner out of view at the finish; S-4 startup step 2 already met but timed at 2 plant-hours; S-5 raise 9c's 14-26 min and step 8's 578 °F did not happen; S-6 an ambiguous "it"; S-7 30 taps against 12; S-8 INTER RANGE levelled above "a little under 1.0e-8"; S-9 TREF is no board label; S-10 unexplained drops to 1x.
>
> **Verification pass (coordinator's verifier, 2026-11-04, same tree; every number MEASURED on bf7a7d07 and on the fix commit).** Harnesses: the built pool (`RD.MANUAL_PROCEDURES.pwr2`); `run_walkthrough_routes.js` typical and mistake routes, and a scratch copy instrumented for INTER RANGE, boron and the pressure-low alarm per step, driving a three-leg chain (startup, raise, lower) at the harness pace and again with 300 plant-s added before each raise stage (a 45 plant-min climb against the layman's 47); headless Chromium (playwright) at 1366x768 and 1600x1000 for the banner and the speed bar. **Refuted:** none outright. **Narrowed:** S-2 (the line is generic: printed on every auto raise of a step without `pair`), S-4 (by design for the preset; the note was conditional but silent about this start), S-5 (true on the harness route, not on a slow one: the dilution reaches 663 ppm 44-45 plant-min after step 3 on every route), S-7 (30 holds from 580 °F; 15 from 573 °F), S-8 (8.7e-9 A on time, up to 2.0e-8 A late), S-10 (not #619: that service step snap was released 2026-09-17; the drop is the walkthrough's own hand-back), and the lower-power 10x claim (delivered on a plain route: auto raises on the first LOAD cut; the layman pressed 10x before it). **Confirmed:** S-1, S-3, S-6, S-9. All fixed in the same commit except where a verdict says otherwise.

# Layman playthrough: Startup Part 2, Startup Part 3, Shutdown Part 1

Build under test: develop bf7a7d07 (Alpha 1.8.4-rc9 + #825). Headless Edge at 1600×1000. Wall time 12:38 → 13:18 (about 40 min).
The page opened at `about:blank`, so I navigated to `shell.html?engine=pwr2` myself. The clock was running at 1× on load.
Each leg handed its plant to the next through "Next: … ▸", and the plant clock ran on without a break: T+00:00 → T+02:49.
Screenshots are in `shots/`. The running log is in `log.md`.

## 1. Outcome

| Leg | Result | Steps completed | The one thing that mattered |
|---|---|---|---|
| Startup Part 2 (`pwr_startup`) | Finished, no trip | 18 / 18 | The 1/M sequence worked as written: step 10 quoted my own prediction back to me ("209", so "206"), and the actual critical position was 208. |
| Startup Part 3 (`pwr_raise_power`) | Finished, no trip | 9 / 9 | Stage 3 (75 MWe) lit a **Pressurizer Pressure Low** alarm that this step does not mention. Only stage 2's text says what to do about it. |
| Shutdown Part 1 (`pwr_lower_power`) | Finished, no trip | 5 / 5 | At the finish, the "Walkthrough complete" box sits below the panel's scroll area and the "scroll for more" cue is hidden. |

No step blocked me. Continue lit on every step without my doing anything the text did not say. The items below are confusion and mismatched numbers, not dead ends.

## 2. Stuck points, ranked by severity

**S-1. Startup Part 3, step 6. An alarm comes in that the step does not mention, and the rule for it lives in the previous step.**
- Text, step 6: "Control Rods — Approaching Insertion Limit, then Control Rods — Insertion Limit, come in this stage: expected." Nothing about pressure.
- Text, step 5 (the step before): "If the Pressurizer Pressure Low alarm lights before OUTPUT reaches 50 MW and AVG COOLANT TEMPERATURE reads below 563 °F, start the next line now: withdraw 5 steps at MED, a plant-minute apart."
- Screen: at T+01:59:47 the alarm list showed "Pressurizer Pressure Low · coolant · warning · unacknowledged". It was not tagged "predicted by step 6", unlike the two rod alarms. PRIMARY PRESSURE was 2147 psi and falling to 2129 psi, and OUTPUT was 72 MW of 75.
- What I did: followed step 6 literally. I waited for OUTPUT 75, then pulled. The alarm cleared once Tavg came back up (pressure 2268 psi).
- What would have unstuck me: one line in step 6 saying whether the step-5 rule (start pulling early) applies to this alarm here too.

- **Measured:** built pool: step 6 `predicts_alarms` = rod_limit_approach, rod_limit (no pzr_pressure_low), while `expect_alarms` has it; `cklPredictedAlarms` tags only `predicts_alarms`, so the tile drew untagged. Setpoint 14.82 MPa = 2149.5 psia (2135 psig). Scratch routes: typical raise step 6 low 2185 psia, no alarm; the slow-climb chain carries it in from step 5 (lit at 36 MW) and it clears 2.5 plant-min into step 6 at 566.5 °F.
- **Verdict:** confirmed. Fixed: `pzr_pressure_low` added to step 6 `predicts_alarms`; 6b note "Pressurizer Pressure Low can light here too: expected. It clears as the pulls warm the water." (true on the slow chain and the layman's route; the typical route never lights it, hence "can").

**S-2. The speed bar says "nothing to do" at exactly the moments the step tells me to act.**
- Startup Part 2, step 5: "Press MED, hold CONTROL WITHDRAW until SOURCE RANGE reads 7.0e2 or more." As soon as the rods moved, #warpInfo said "Speeding up to 10× — nothing to do for a while." I was still holding WITHDRAW and watching SOURCE RANGE.
- Startup Part 3, step 5: with the Pressurizer Pressure Low alarm lit, the text says "start the next line now: withdraw 5 steps". #warpInfo still said "Speeding up to 10× — nothing to do for a while." (shot 209).
- What I did: followed the step text and ignored the speed message.
- What would have unstuck me: a speed message that does not say "nothing to do" while a row is asking for rod motion.

- **Measured:** `syncWarpInfo` printed "Speeding up to N× — nothing to do for a while." on EVERY auto raise of a step without `pair`. The raise fires when the step's own action lands (`cklActionPending`), so it lands mid-action by construction: startup 5 on the first rod motion, raise 5 on the LOAD set while 5b's note may ask for early pulls. Headless, after the fix: lower power 2 reads "The walkthrough set the speed to 10× — watch the chart." after the first cut.
- **Verdict:** narrowed: wrong whenever a step raises on its own action and the card still asks for more, which is most of them. Fixed: the line says only "The walkthrough set the speed to N×." (plus "— watch the chart." on a `pair` step). Gated by QW9 in `verify_quickwins_ui`.

**S-3. Shutdown Part 1, finish. The completion box is out of view.**
- Text in the box: "Walkthrough complete — Plant stable at 15 MWe, REACTOR POWER near 12 %, AVG COOLANT TEMPERATURE in its band. The shutdown walkthrough takes it to Mode 3."
- Screen: the box's top edge (930 px) sits exactly on the scroll area's bottom edge (930 px). The "▾ scroll for more" cue is hidden, and only a thin green line is visible (shot 314).
- At the Startup Part 3 finish the box was visible but cut off mid-sentence at "— the no-xenon" (shot 228).
- Still readable at the finish:
  - The header word "Complete".
  - The last step, greyed out with ✓.
  - "⏪ Rewind step".
  - "Next: Shutdown Part 2 ▸" and "Close".
- What would have unstuck me: a visible scroll cue, or the completion box placed above the long final step.

- **Measured (before):** finish by the QW8 idiom. Title top inside a 467 px log at 1366x768: startup 382 (in), raise 472 (out), lower 516 (out). At 1600x1000 (681 px log): lower 657-676, 5 px clear on the harness's route; the layman's route made the step ~34 px taller, so the box top sat on the floor (930 px). The kept step's Rewind row was not pinned (only `.ckl-active`'s was), and the "scroll for more" cue was scoped to `.ckl-active`, so it never showed on a finished leg. **After:** a one-line "✓ Walkthrough complete" above the kept step, and the finish scroll targets it: title 4-33 px, step head 47 px, Rewind pinned at 438-465 px (1366) and 594-679 px (1600) on all three legs and TMI-2; the recap stays below the step, with the scroll cue.
- **Verdict:** confirmed. Chosen over a sticky banner (a pinned box covers step text, and the TMI-2 recap is ~760 px) and over moving the whole recap above the step (the critic M-A defect: the kept step pushed out). Least surprise: the card reads top-down "complete, the last step, where the plant ended". Gated by QW8 (title, head and Rewind all in view, four legs, two viewports).

**S-4. Startup Part 2, step 2. I was told to warp and wait two hours for something that was already done.**
- Text: "Suggested time warp: 600×. From the Mode 5 to Mode 3 walkthrough, expect about 2 plant-hours."
- Screen: all four rows were already ticked on arrival, including "Set the boron target to 719 ppm…" and "Wait for BORON CHEM to read 709 to 729 ppm". The box already read 719.
- What I did: typed 719 and pressed Enter anyway, then pressed Continue.
- What would have unstuck me: when a leg is started directly, a line saying the boron is already at 719 and nothing needs to be done.

- **Measured:** `hot_zero_power` boots at BORON CHEM 718.9 ppm, target 719.2, ON, STATUS HOLD; `start_checklist pwr_startup` meets all four step-2 rows at entry. The routes table already declares step 2 `entry_met`; chained from the heatup it is the ~918 to 719 ppm wash.
- **Verdict:** narrowed: intended for the preset, and the note was conditional ("From the Mode 5 to Mode 3 walkthrough…"), but nothing told this player why. Fixed: the note adds "Started from the menu, the plant is already at 719 ppm and these rows tick on arrival." The "Suggested time warp: 600×" line still prints; auto does not apply it (rows met).

**S-5. Startup Part 3, steps 8–9. The promised end temperature and wait never happened.**
- Step 8 heading: "settle the temperature on 578 °F". Its note: "Stop at 573 °F: the boron still arriving takes it to about 578 °F."
- Step 9b: "The dilution you set in step 3 is still arriving: 14 to 26 plant-minutes from the start of this step."
- What happened: BORON CHEM read 663 ppm about 40 plant-seconds into step 9. The leg finished with AVG COOLANT TEMPERATURE at 573 °F, not 578 °F. The plant chart showed "Tref (Tavg program) 580°F" (shot 228).
- My route was slow: about 47 plant-minutes from step 3 to step 9.
- What would have unstuck me: wording tied to what is left ("wait for BORON CHEM 663"), not a fixed clock and a temperature that does not arrive.

- **Measured:** BORON CHEM reaches 663 ppm 44.2 / 45.1 / 45.0 plant-min after step 3 on typical / fast chain / slow chain (each raise stage started 300 plant-s later), i.e. 22.4 / 23.3 / 0.1 plant-min into step 9; the leg ends at 580.1 / 580.7 / 573.4 °F. The layman: ~47 plant-min to step 9, 663 ppm 40 plant-s in, 573 °F.
- **Verdict:** narrowed: "14 to 26" and "takes it to about 578 °F" were the brisk route's numbers (and that route ends at 580, not 578). Fixed: 9c "The dilution you set in step 3 gets there about 45 plant-minutes after step 3: about 23 more after a brisk climb, none after a slow one."; step 8 note "the boron still arriving takes it to about 580 °F. After a slow climb the boron has already arrived, and it stays near 573 °F." NOT changed: step 8's heading "settle the temperature on 578 °F" (573.4 is inside its 573-583 band and the settle gate's 5.4 °F).

**S-6. Shutdown Part 1, steps 3–5. Ambiguous "it".**
- Text: "Control Rods — Approaching Insertion Limit can come in here and goes out by itself as the load comes off; keep to the 3-tap inserts. If it reads below its green band, leave the rods…"
- The "it" right after an alarm sentence reads as the alarm. It must mean AVG COOLANT TEMPERATURE.
- What would have unstuck me: writing "If AVG COOLANT TEMPERATURE reads below its green band".

- **Measured:** built pool: lower 3b's note puts "If it reads below its green band" right after the Approaching Insertion Limit sentence; 4b and 5b put it after the tap-count sentence.
- **Verdict:** confirmed. Fixed in all three: "If AVG COOLANT TEMPERATURE reads below its green band".

**S-7. Shutdown Part 1, step 2. The tap count does not match.**
- Text: "About 30 taps in all, the ones after each cut included."
- What happened: I needed 12. My Tavg started at 573 °F, the Startup Part 3 end state, so it only crossed 577 °F from the 85 MW cut on.
- Steps 4 and 5 were closer: 15 taps against "About 20", and 15 against "12 to 15".
- What would have unstuck me: a count that holds when you arrive from Startup Part 3, or "until it reads below 577 °F" without a number.

- **Measured:** inserts in lower step 2: typical (preset, 580.3 °F) 30; fast chain (580.7 °F) 30; slow-climb chain (573.2 °F) 15; layman 12. Step 4: 18 / 18 / 18 against "About 20" (layman 15); step 5: 12 / 12 / 12 against "12 to 15" (layman 15).
- **Verdict:** narrowed: 30 is right from 580 °F, wrong from the slow climb's 573 °F. Fixed: "About 30 taps in all from 580 °F, the ones after each cut included; about 15 if it starts near 573 °F." Steps 4 and 5 unchanged.

**S-8. Startup Part 2, step 11. The expected reading was off.**
- Text: "Expect INTER RANGE to level a little under 1.0e-8 A."
- What happened: it levelled at 1.5e-8 to 1.6e-8 A, which is above. My own slowness let it reach 1.8e-8 before I inserted.
- What would have unstuck me: "near 1.0e-8 A" rather than "a little under".

- **Measured (scratch routes, INTER RANGE at the end of step 11):** typical 8.7e-9 A (peak 1.06e-8); 10 back on time (`level_short_11`) 1.2e-8; 60 plant-s late, 12 back 1.4e-8; 60 plant-s late, 10 back (the layman's shape) 2.0e-8. Layman 1.5e-8.
- **Verdict:** narrowed: "a little under" holds only for the on-time 12-step insert. Fixed: "Expect INTER RANGE to level near 1.0e-8 A, higher if the insert starts late: up to about 2.0e-8 A."

**S-9. "TREF" is not a board label.**
- Startup Part 3, step 4 row: "AVG COOLANT TEMPERATURE 4 °F or more below TREF, the program". The board's ROD CONTROL card shows "ΔREF".
- TREF appears only in two places: the panel's live line ("TREF (TAVG PROGRAM) 550°F") and a chart trace ("Tref (Tavg program)").
- This was not blocking, because the row ticks by itself.

- **Measured:** built pool: the only TREF in a drawn row is raise 4's `cont` label; the board draws `ΔREF ±d` on the ROD CONTROL card (`pwr_board_wiring.js`).
- **Verdict:** confirmed. Fixed: the label reads "ΔREF on ROD CONTROL reads −4 °F or lower as OUTPUT reaches 30 MW: AVG COOLANT TEMPERATURE below its program". The panel's live line and the chart trace still say TREF (not changed).

**S-10. Speed changes by itself at almost every step end, with nothing on screen saying why.**
- In Startup Part 2, steps 5, 6, 7, 10, 11, 12, 13, 14 and 15, the speed fell from 5×/10×/60× to 1× on step completion with #warpInfo blank. The one exception was step 8, which stayed at 10×.
- The only drop that named its cause was Startup Part 3, step 9: "Wait complete — back at 1× (this step fast-forwards at 5×)."
- This is harmless, because I was pressing Continue anyway. But a layman would not know the walkthrough is driving the speed.

- **Measured:** the service's #619 step snap is gone (OWNER RULING 2026-09-17, "Release with the step snap", per the `syncSpeedUI` comment); the 1x drop is the walkthrough's own hand-back, `cklStepSpeed` returning 1 once `acc_met`/`awaiting_ack`. It set no note, so `#warpInfo` was blank; only steps that print wait advice (`hold` 180 s or more, `wait_hint` not false) said "Wait complete — back at 1×", which is raise 9, the one drop the layman saw explained.
- **Verdict:** narrowed (the observation stands; the cause is not #619). Fixed: the hand-back now leaves "Step done — the walkthrough set the speed back to 1×." NOT gated: a headless attempt to reach a met, auto-raised step (raise 4 from `low_power`) did not complete inside 150 s of wall; verified by reading the code only.

Minor items:
- The 1/M window covers the pause and 1× buttons as well as STEAM GENERATOR LEVEL. The text warns about this.
- TRIP BLOCKS rows show bare codes "(P-10 PERMISSIVE)" and "(P-11 PERMISSIVE)". "P-6" is explained in step 9; the others are never explained.
- Startup Part 2, step 13: "Manual flow to 60 % leaves AUTO 5 points." is opaque.
- Startup Part 3, step 7 heading "with a smaller pull" and Shutdown Part 1, step 4 heading "Lower power needs smaller rod moves": in both, the instruction is the same 5-step pull or 3-tap insert as before.

## 3. Per-step log

Times are plant time (T+). "Pre-ticked" means the row showed ✓ before I did anything.

### Startup Part 2, 18 steps

| # | First sentence | What I did | Time to satisfy | Speed | Continue lit | Notes / shot |
|---|---|---|---|---|---|---|
| 1 | Verify the plant is in Hot Standby (Mode 3). | Nothing | 0 | 1× | Yes | All 5 rows pre-ticked. The "Turbine Trip / Low Steam Demand" alarm is tagged "predicted by step 1". 100 |
| 2 | Dilute boron to the estimated critical concentration, 719 ppm. | Typed 719, Enter | 0 | 1× | Yes | **All 4 rows pre-ticked**, including "Set…" and "Wait…". Text promised 600× and about 2 plant-hours (S-4). 101–102 |
| 3 | Line up the steam generator (SG) before taking the reactor critical. | Nothing | 0 | 1× | Yes | Pre-ticked; extra unlettered row "✓ DUMP SETPOINT reads 1020 psi". 103 |
| 4 | Take the 1/M baseline point before any rod moves. | 1/M PLOT, Plot point, ✕ | ~1 min wall | 1× | Yes | The window hides pause and 1×. 106, 108 |
| 5 | Take the second 1/M point, after the first rod pull. | MED; held WITHDRAW 11.4 s wall; SOURCE RANGE 7.0e2 at rod 80; plotted | ~5 plant-min | 10× (self) → 1× | Yes | 30-s average 6.6e2 after release; 5a ticked by itself about 2 plant-min later. Prediction: step 410. S-2. 110–114 |
| 6 | Take the third 1/M point. | Held 10.9 s; released at rod 157 (SOURCE RANGE 1.5e3); plotted | ~6 plant-min | 10× → 1× | Yes | Text said near rod 150–155. Prediction: step 253. 116–118 |
| 7 | Take the fourth 1/M point, after a shorter pull. | Held 5.7 s; released at rod 196 (SOURCE RANGE 3.4e3); plotted | ~4 plant-min | 10× → 1× | Yes | Text said near 190–192. Prediction: step 212. 120–122 |
| 8 | Take the final 1/M point, the one the approach to critical is built on. | SLOW; set 5× myself; held 4.3 s; SOURCE RANGE 7.0e3 at rod 199; plotted | ~3 plant-min | 5× → 10× (stayed) | Yes | SOURCE RANGE was already 6.6e3 at step start. Wait to +0.03 was ~1.5 plant-min (text: 3 to 4). Prediction: step 209. 124–126 |
| 9 | Block the source range trip at P-6, the permission to block it. | TRIP BLOCKS → BLOCK on SR HIGH FLUX → closed | ~30 s wall | 1× | Yes | 9a pre-ticked (INTER RANGE 2.8e-10). 128–130 |
| 10 | Take the reactor critical and set STARTUP RATE between +0.3 and +1.0. | SLOW, 5×, held to 206; then held 10.3 s at 10× to STARTUP RATE +0.51 (rod 218) | ~5 plant-min | 5× → 10× (self) → 1× | Yes | Quoted my prediction 209. Read +0.38 a plant-minute later. "10 to 15 seconds at 10×" was accurate. 132–134 |
| 11 | Level power near 1.0e-8 A and record the critical rod position. | Waited for INTER RANGE 1.0e-8; MED, held INSERT 3.0 s (218→208); waited 120 plant-s | ~3 plant-min | 1× → 5× (self) → 1× | Yes | 10 steps, not "about 12". Levelled at 1.5e-8 (S-8). 11c ("Write down…") ticked with no input. Critical 208 against predicted 209. 136–139 |
| 12 | Raise power to the point of adding heat, about 1 %. | SLOW; 5 single WITHDRAW taps ~83 plant-s apart (rod 213, STARTUP RATE +0.15); waited | 23 plant-min for 12b | 10× → 60× (self) → 1× | Yes | 12a said "Close the 1/M PLOT window", but it was already closed. A hold counter was running before my first tap. #warpInfo: "…This computer can only run the plant at about 40× here." "20 to 26 plant-minutes" was accurate. 141–143 |
| 13 | Put main feed in service and secure auxiliary feed. | 50 gpm (power read 1.1 %); waited for SG level 60; AUTO; AFW STOP | 8.7 plant-min | 10× (self) → 1× | Yes | 13b, 13c ticked instantly. 145–148 |
| 14 | Raise power past 5 %, into Mode 1, At Power. | SLOW, 5× (myself); 4 two-step pulls a minute apart | ~4 plant-min | 5× → 1× | Yes | Power 2.8 → 3.4 → 4.2 → 5.2 %; "about 4 pulls" was exact. 150 |
| 15 | Put the turbine on line and let the reactor follow it up. | LATCH; LOAD 10; STEAM DUMP AUTO | ~1.5 plant-min | 10× (self) → 1× | Yes | Status corner STM PRESS → TAVG. 152–154 |
| 16 | Block the first startup trip, IR HIGH FLUX. | Waited for 8.5 %; TRIP BLOCKS → BLOCK on IR HIGH FLUX | ~1 min | 1× | Yes | The red "RELEASE?" on SR was pre-warned in the text. No close instruction; the panel closed itself at the step change. 156–158 |
| 17 | Block the second startup trip, PR HIGH (LOW SETPT). | TRIP BLOCKS → BLOCK on PR row → TRIP BLOCKS | ~30 s | 1× | Yes | Panel showed "3 of 5 BLOCKED". 160–162 |
| 18 | Verify the plant is in Mode 1, At Power. | Nothing | 0 | 1× | Yes | Pre-ticked (10.5 %, 10 MW). 163 |
| End | — | — | — | — | — | Header "Complete". Step 18 readable. Rewind shown. "Walkthrough complete" box visible. "Next: Startup Part 3 ▸" and "Close". 164 |

### Startup Part 3, 9 steps

| # | First sentence | What I did | Time | Speed | Continue | Notes / shot |
|---|---|---|---|---|---|---|
| 1 | Confirm the plant the startup handed over is ready to climb. | Nothing | 0 | 1× | Yes | Pre-ticked. 200 |
| 2 | Make sure the turbine is on line and taking steam. | Nothing | 0 | 1× | Yes | Pre-ticked. 201 |
| 3 | Start the boron dilution that carries most of the climb. | Typed 660, Enter | 10 s | 1× | Yes | 3a pre-ticked. 202–203 |
| 4 | Take the first stage to 30 MWe, load leading and rods following. | LOAD 30; waited; six 4-step MED pulls a minute apart | 12 plant-min | 10× (self, "watch the chart") → 5× → 1× | Yes | Tavg 535 → 558, rod 221 → 245 (24 steps; text 25–30). Live line "AVG COOLANT TEMPERATURE … \| TREF (TAVG PROGRAM) …". 204–207 |
| 5 | Take the second stage to 50 MWe the same way. | LOAD 50; Pressure Low alarm at Tavg 554, so started pulls early as told; continued to 563 | 9 plant-min | 10× → 5× → 1× | Yes | Rod 245 → 261 (16; text 15–25). Ended at 565, past 563. "Nothing to do" message during the alarm (S-2). No insertion-limit alarm at this stage. 208–211 |
| 6 | Take the third stage to 75 MWe the same way. | LOAD 75; waited; five pulls | 11 plant-min | 10× → 5× → 1× | Yes | Both rod alarms came as warned. **Unwarned Pressurizer Pressure Low** (S-1). Rod 261 → 281 (20; text 20–35). Tavg overshot to 575 (target 571). 212–215 |
| 7 | Take the fourth stage to 90 MWe with a smaller pull. | LOAD 90; three pulls | 7 plant-min | 10× → 5× → 1× | Yes | Rod 281 → 293 (12; text 15–20). LOAD never ran back. 216–219 |
| 8 | Take the last stage to full load and settle the temperature on 578 °F. | LOAD 100; one pull to 573 | 5 plant-min | 10× → 5× → 1× | Yes | 4 steps against "10 to 20". 8c stayed ○ ~40 s wall after Tavg read 573, with no hold counter shown. Power 101.6 %, rod 297. 220–224 |
| 9 | Confirm full power, with the boron dilution done. | Waited | 40 plant-s | 5× (self) → 1× | Yes | 9a, 9c pre-ticked. The 14–26 min forecast and the 578 °F did not materialize (S-5). The only speed drop with a reason shown. 225–227 |
| End | — | — | — | — | — | "Complete". Step 9 readable. Rewind shown. Box visible but cut off at the bottom. "Next: Shutdown Part 1 ▸" and "Close". 228 |

### Shutdown Part 1, 5 steps

| # | First sentence | What I did | Time | Speed | Continue | Notes / shot |
|---|---|---|---|---|---|---|
| 1 | Start adding boron before any load comes off. | Typed 719, Enter | 10 s | 1× | Yes | 1a pre-ticked. 300–301 |
| 2 | Take the first load off the turbine and let the reactor follow it down. | Set 10× myself (not automatic); 95/90/85/80/75 a minute apart; 3 taps after cuts at Tavg 578; 3 more in 2b | 7.5 plant-min | 10× → 1× | Yes | 12 taps against "About 30" (S-7). Pressure peaked at 2264 psi. 302–304 |
| 3 | Take the load down to 50 MWe, then trim AVG COOLANT TEMPERATURE back into its band. | 10× myself; 70…50, 3 taps after each; 2 more sets | 7.5 plant-min | 10× → 1× | Yes | 18 taps; Tavg 568. Ambiguous "it" (S-6). Rod alarms cleared by themselves. 305–307 |
| 4 | Take the load down to 30 MWe, then trim AVG COOLANT TEMPERATURE back into its band. | 10× myself; 45…30; 3 taps each; 1 more set | 6 plant-min | 10× → 1× | Yes | 15 taps against "About 20". 308–310 |
| 5 | Take the load down to 15 MWe, then trim AVG COOLANT TEMPERATURE back into its band. | 10× myself; 25/20/15; 3 taps each; 2 more sets | 6 plant-min | 10× → 1× | Yes | 15 taps ("12 to 15"). Power 13.0 %, Tavg 554. 5c "below 40 %" was already true since step 4. 311–313 |
| End | — | — | — | — | — | "Complete". Step 5 readable. Rewind visible. **Box hidden below the fold, no scroll cue** (S-3). "Next: Shutdown Part 2 ▸" and "Close". 314 |

After the Shutdown Part 1 finish I pressed "⏪ Rewind step". It took the plant back to the start of step 5 (T+02:42:43, 27.7 %, rod 252, rows unticked), so on a finished leg Rewind replays the last step, not the one before it (shot 315).

### Things the text did not say that I did

- Navigated from `about:blank` to the page.
- Set the speed myself where the text gave only "Suggested time warp" and the bar did not move:
  - Startup Part 2, step 8: 5×. The text says "Keep the clock at 5× while you hold".
  - Startup Part 2, step 14: 5×.
  - Shutdown Part 1, steps 2–5: 10×. In this leg the speed never rose by itself.
    - **Measured:** headless, lower power 2: 1× at entry, 10× within 2.5 s of wall after the first LOAD cut (`cklActionPending` holds real time until the step's own command lands, #796). The layman's log: 10× pressed before the first cut, so the raise found 10× already set and drew nothing. The override latch does not block it (the pre-cut press is keyed at want 1, the raise at want 10).
    - **Verdict:** narrowed: the owner's 10× on steps 2-5 is delivered on a plain route, from the first cut. Gated by QW9.
- None of these was needed for a row to tick.

### Rows that showed done before I acted

- Startup Part 2:
  - 1a–e.
  - **2a–d**, including "Set the boron target to 719 ppm" and "Wait for BORON CHEM…".
  - 3a–b.
  - 9a.
  - **11c**, "Write down CONTROL ROD POSITION…", which ticked with no input.
  - 18a–b.
- Startup Part 3:
  - 1a–c.
  - 2a–b.
  - 3a.
  - 9a.
  - **9c**, "Hold INSERT 3 steps at a time whenever…", ticked on arrival.
- Shutdown Part 1: 1a.
- **Measured / Verdict, the pre-ticked rows:** startup 1, 2, 3, 18 and raise 1-2 are declared `entry_met` in the routes table (confirm steps on the preset): by design. Startup 11c grades `control_bank_steps stopped 120`, the same 120 s rods-still window as 11b, so it ticks with 11b: by design, though its label "Critical rod position recorded" claims more than it grades (not changed). Raise 9c (pool row 4, "Hold INSERT 3 steps at a time whenever…") is a `~` band, 563-592 °F, met while the temperature is already inside it: a conditional row, by design. Startup 9a (INTER RANGE above P-6, 2.8e-10 A) was already true: by design. None hollow in the routes gate's sense (its hollow-tick check is green on all three legs).

## 4. Words and numbers I could not find on the board

| Walkthrough said | What is actually on the board |
|---|---|
| "TREF, the program" (Startup Part 3, step 4) | The board shows "ΔREF" on the ROD CONTROL card. "TREF (TAVG PROGRAM)" appears only in the panel's live line, and "Tref (Tavg program)" only as a chart trace. |
| "Expect INTER RANGE to level a little under 1.0e-8 A" | Levelled at 1.5e-8 to 1.6e-8 A. |
| "settle the temperature on 578 °F" / "the boron … takes it to about 578 °F" | AVG COOLANT TEMPERATURE ended at 573 °F with boron done (663 ppm); the chart's Tref read 580 °F. |
| "14 to 26 plant-minutes from the start of this step" (Startup Part 3, 9b) | BORON CHEM 663 ppm after about 40 plant-seconds. |
| "About 30 taps in all" (Shutdown Part 1, step 2) | 12 needed. |
| "expect about 2 plant-hours" (Startup Part 2, step 2) | Already done on arrival. |
| "Expect it near CONTROL ROD POSITION 150 to 155" / "190 to 192" / "202" | 157 / 196 / 199 at the first SOURCE RANGE reading that met the target. The counts are noisy; the targets themselves are fine. |
| "The wait for +0.03 is about 3 to 4 plant-minutes" (Startup Part 2, step 8) | About 1.5 plant-minutes. |
| "(P-10 PERMISSIVE)", "(P-11 PERMISSIVE)" on TRIP BLOCKS | Never explained anywhere a player sees. |
| "the 103 % rod stop" (Startup Part 3, step 7) | No such label on the board (prose only). |

## 5. What the text got right

- The 1/M plot workflow: open, Plot point, ✕. The window's own prediction line matched the step text.
- Step 10 used the player's own 1/M prediction (209) to set the target (206).
- "Expect to hold WITHDRAW about 10 to 15 seconds at 10×": I held for 10.3 s.
- "Expect 20 to 26 plant-minutes" to 1 % power: it took 23.
- "Expect about 4 pulls" to pass 5 %: exactly 4.
- "Wait for STEAM GENERATOR LEVEL to reach 60 %" with 50 gpm worked, and there was no level trip.
- STEAM DUMP "status reads TAVG": found in the card's corner.
- TRIP BLOCKS warnings matched the screen: the red "RELEASE?" on the SR row, and "3 of 5 BLOCKED".
- Both rod alarms were warned in Startup Part 3, step 6 and arrived tagged "predicted by step 6".
- The rod-step ranges for stages 1–3 (25–30, 15–25, 20–35) matched what I used.
- Shutdown Part 1, step 5's "12 to 15 taps": I used 15.
- The live "REACTOR POWER … | AVG COOLANT TEMPERATURE …" line in the panel let me read the step's quantities without hunting.
- At every finish:
  - The last step stays readable.
  - Rewind is reachable.
  - "Next: <leg> ▸" carries the plant over without a reload.

## Critic round on e4949322 (2026-11-04): numbers re-measured on the routes table's own mistake routes

- **Raise 8 (M-1):** the plant's full-power program is 580.1 °F (`tavg_full_c` 304.5, `pwr2_dumpctl.js`), and no ruling names 578. The heading now reads "settle the temperature near 580 °F" and the aim "580 °F is this plant's full-power program temperature". The 573-583 °F band is unchanged. The routes gate's settle regex now accepts "near" as well as "on", so the check still applies. Step 8 ends at 575.0-578.0 °F and the leg at 579.8-580.5 °F on every raise route. The slow-climb chain ends at 573.4 °F, which the step 8 note covers.
- **Raise 9c (L-2):** 663 ppm arrives 43.8-46.3 plant-min after step 3 on all eight raise routes (typical, double_boron, rods_before_load, overpull_60, rewind_mid_stage3, hot_stage4, band_floor), which is 17.3-25.8 plant-min into step 9. The text now reads "up to about 26 more here after a brisk climb, none after a slow one" (it was "about 23").
- **Lower 2 taps (L-2):** typical 30, double_load75 30, rewind_mid_load50 30, slow_cut 21, slow_cut_180 18, slow-climb chain 15, layman 12. insert_x2 and rods_lead_2 are one 80-step insert, so no taps. The text now reads "About 30 taps …, cutting a plant-minute apart from 580 °F; slower cuts or a cooler start need fewer, down to about 15."
- **Startup 11 INTER RANGE (L-2):** on-time routes level at 7.9e-9 to 9.1e-9 A. On late arrivals: level_short_11 1.2e-8, rewind_mid_10 1.9e-8, late 10-back 2.0e-8, clear_1m_10 5.0e-8. The overtaken routes reach 5e-5 and skip the step. The text now reads "the later the insert starts, the higher it levels: about 2.0e-8 A a plant-minute late" (the old "up to about 2.0e-8" failed clear_1m_10).
- **Step done (L-1) and the outcome warning (L-4)** are now gated: QW9 rows 3-4 and QW10 in `verify_quickwins_ui`.
- **Settle gate (follow-on of M-1):** the routes gate now requires two things. The step must complete within 5.4 °F of N, or no lower than the card's own "Stop at N °F" floor. The leg must then end within 5.4 °F of N. The chain completes step 8 at 574.4 °F and ends the leg at 580.7 °F: it passes. The injection raise_old_settle_band still fails it (step 8 at 568.7 °F). A floor taken from the graded row instead went hollow under that injection ("all inside"), which is why the floor is read from the card's text.
- **Raise 9c's ask** was 41 words against the 30-word cap (`run_checklist_pwr2_b`). The timing moved to the row's note.
