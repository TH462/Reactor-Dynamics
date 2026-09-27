# Layman playthrough: six PWR2 walkthroughs, Alpha 1.8.0-rc7 (pass 9)

> **Record, not policy.** Layman pass 9, 2026-09-26, on develop `dab17d5c` (Alpha 1.8.0-rc7), headless
> Edge: 6 of 6 legs completed, one plant carried through with the "Next" button, no reactor trip.
> Verified 2026-09-26 (develop-j, scratch worktree `exp/807h`) on `dab17d5c` + this change; every claim
> below was the reviewer's until the **Measured** line under it. **S-1** heatup 10 valve location:
> CONFIRMED, cooldown 7's locating sentence added · **S-2** raise power 4b ticked before the sag:
> CONFIRMED (ticked 25 s after LOAD at 549.6 °F, held through 536.6 °F, Continue dark 1100 s with no
> pull); the OUTPUT line now comes before the conditional on all five stages · **S-3** source-range
> jitter: NARROWED (σ 4.2–5.5 %, single readings −12/+15 % on a still bank; the rest of the ±20 % was
> the count climbing while the rods moved); 5a says so · **S-4** 1/M prediction moved out: NARROWED
> ("always too high" is false: the lowest measured baseline reading alone gives step 195; three fresh
> seeds gave 245/372/265, all high); the text now says "usually" · **S-5** boron target box:
> CONFIRMED, the box is captioned only "0-2500 ppm"; four steps now name it · **S-6** 1/M window:
> not measured, no change · **S-7** cooldown 11 32 vs 30 °F: CONFIRMED as wording, the 2 °F gap is
> deliberate; the lines now say which is which · **S-8** cooldown 6 order: CONFIRMED, reworded to the
> order that worked. Minors: see each line.

Driven in headless Edge at `ui/shell.html?engine=pwr2`, 1600×1000 viewport. Persona: layman, board and walkthrough text only.
Wall time: about 70 minutes for all six legs (19:58 to 21:07). Plant time: T+00:00 to T+18:30.
Screenshots are in `shots/`, named per step (`h..` heatup, `s..` startup, `r..` raise power, `l..` lower power, `d..` shutdown, `c..` cooldown). Raw log: `log.md`.
Setting under the time-warp bar: a checkbox, **"Walkthrough sets time warp"**, checked on load. I left it alone.
No page errors were logged (`pageerrors.log` stayed empty).

## 1. Outcome

| Leg | Result | Steps completed | The one thing that mattered |
|---|---|---|---|
| pwr_heatup | Finished | 17/17 | Step 10: the text says "Open the accumulator valve" but never says where the valve is. Only the glow on an unlabelled diagram symbol led me to it, on my second try. |
| pwr_startup | Finished | 17/17 | Steps 5–8 (the 1/M points): the source-range count is noisy, so "hold until it reads X" stops early. The prediction also moved the opposite way to what the text promised (194 → 219). |
| pwr_raise_power | Finished | 9/9 | Step 4: item 4b ("if the temperature sags… withdraw") ticked itself before the sag, so nothing on the checklist said it now applied. Continue stayed dark for about 14 plant-minutes before I acted. |
| pwr_lower_power | Finished | 6/6 | Nothing blocking. The load-then-rods recipe worked exactly as written. |
| pwr_shutdown | Finished | 3/3 | Nothing blocking. SCRAM arm-then-press was clear. |
| pwr_cooldown | Finished | 16/16 | Nothing blocking. Step 7 names where the accumulator valve is, which the heatup's step 10 does not. |

Every leg after the first was started with the **"Next: … ▸"** button at the foot of the panel. The plant carried over each time; I never needed the Main Menu restart.

## 2. Stuck points, ranked by severity

### S-1 — Heatup step 10: the accumulator valve has no stated location
- **Step text:** "10. Open the accumulator valve while PRIMARY PRESSURE is inside its window." / "Open the accumulator valve while PRIMARY PRESSURE reads 665 to 1615 psi, and check the ACCUMULATORS tile no longer reads ISOLATED."
- **What I did:** No button on the board is labelled with "accumulator valve".
  - Attempt 1: I clicked "ISOLATED" on the ACCUMULATORS tile. Nothing happened. The scanner said "Accumulator Status — ARMED, INJECTING or ISOLATED."
  - Attempt 2: I noticed a glowing, unlabelled valve symbol on the diagram, above the tile and left of the ECCS pump. Hovering it showed "Accumulator Isolation Valve — Motor-operated valve in series with the accumulator check valves. Normally open." Clicking it worked.
  - About 30 s of wall time. The clock was held at 1× ("Held at real time — the plant needs you here"), so the pressure window was never at risk.
- **What would have unstuck me:** The sentence cooldown step 7 already uses: "The valve symbol sits just above the ACCUMULATORS tile, to the left of ECCS INJ FLOW."
- **Measured:** built pool `pwr_heatup` #10: text, ask and note never locate the valve; `pwr_cooldown` #7 note does ("just above the ACCUMULATORS tile, to the left of ECCS INJ FLOW"), and both steps ring the same board symbol (`hl: Accumulator valve`).
- **Verdict:** confirmed. The cooldown sentence is now the first sentence of heatup 10's note.

### S-2 — Raise-power step 4: a conditional item ticks itself before its condition arrives
- **Step text:** "4b· If AVG COOLANT TEMPERATURE sags below its band, withdraw at MED in 5-step pulls a plant-minute apart until it is back in it, 5 to 20 steps. Otherwise leave the rods." / "4c· Check OUTPUT reads 30 MW, REACTOR POWER is near 30 % and AVG COOLANT TEMPERATURE is still between 550 and 576 °F."
- **What I did:**
  - I set LOAD 30. Within 3 s, 4a and **4b both showed ✓**; the temperature had not sagged yet.
  - AVG COOLANT TEMPERATURE then sagged from 549 to 536 °F while power rose to 31.9 %. 4b stayed ✓ the whole time.
  - From about T+10:07 to T+10:21 (about 14 plant-minutes at the walkthrough's 10×), Continue was dark. The only unmet item was the temperature sub-line inside 4c. Nothing drew attention to the fact that 4b's "if" had come true.
  - Then I did 4b by hand: one 5-step pull at MED (224 → 229). A plant-minute later the tile read 554 °F and Continue lit.
  - Honesty note: my watcher script only watched during that stretch. A real layman who trusts the ✓ would also have waited.
  - The same pre-ticked pattern shows on raise-power 9c and lower-power 6b. It did no harm there.
- **What would have unstuck me:** Do not show a conditional "if X, do Y" item as ✓ while X can still happen, or re-open it when the temperature leaves the band.
- **Measured:** own full-stack script (live checklist runtime, `low_power` IC, seed 42), LOAD 30 and no pull: the latching temperature row ticked 25 s after LOAD at 549.6 °F against its 549.5 °F floor, stayed ticked while the tile fell to 536.6 °F (at 265 s), and Continue lit only at 1100 s (the dilution brought the temperature back). After the fix, same run: the conditional stays UNMET from OUTPUT > 28 MW (~225 s, 537 °F) onward; one 5-step pull at 241 s lights Continue at 1005 s.
- **Verdict:** confirmed. The source comment's "met at entry on no stage" went stale when pass 7 moved the temperature row to `b`, straight after LOAD. The OUTPUT line now comes before the conditional on stages 4 to 8, so the "withdraw" line is live and unticked while the sag is on the tile.

### S-3 — Startup steps 5–8: "hold until SOURCE RANGE reads X" stops too early on a noisy reading
- **Step text (step 5):** "5a○ Hold CONTROL WITHDRAW at MED until SOURCE RANGE reads 7.0e2 or more." / "The check-off waits for SOURCE RANGE to stay at 7.0e2 or more, not just touch it. If it only touches 7.0e2 now and then, or is still short at 80, tap WITHDRAW one step and wait half a plant-minute."
- **What I did:**
  - I released the moment the tile first read 7.1e2, at rod 65. The tile jumps around by roughly 20 % (4.6e2 to 6.8e2 while the rods move), so 5a did not tick.
  - The fallback in the text worked. It took 10 single taps with half-minute waits (rod 66 → 75), about 2.5 minutes of wall time.
  - At the moment 5a ticked, the tile showed 6.3e2, so the tile and the check disagreed for an instant.
  - Step 7 overshot the other way: I released at rod 196 against the stated 190–192, because the count jumped from 2.8e3 to 3.4e3 between two glances.
- **What would have unstuck me:** Say in 5a itself (not only in the italic note) that the reading jitters, and that the target is a steady reading after the rods stop.
- **Measured:** own script, fresh startup IC diluted to 719 ppm, seed 42, `instruments.source_range` every tick. Rods still at bank 0 / 65 / 75: σ 5.5 / 4.7 / 4.9 %, single readings 434–569 / 590–767 / 631–803 cps (about −12 / +15 %). While the rods move to 65: 459–684 (the count is climbing, not only jittering). At bank 190 the count keeps rising after the stop: mean 2937 cps over the first 30 s, 3754 over the next 120 s.
- **Verdict:** narrowed. The jitter is about ±15 % on a still bank, not ±20 %; the rest of the spread was the count climbing. Step 7's 196 is the post-stop climb, which the card's "stay at 3.0e3" wording already covers. 5a now says the count jumps about 15 % and to watch it for 5 seconds after letting go.

### S-4 — Startup step 6: the 1/M prediction moved the opposite way to what the text promised
- **Step text (step 6 background):** "Closer to critical, a rod step is worth more, so the line steepens and the predicted crossing moves in." Step 5 background: "The first two points always predict the critical position too high."
- **What I saw:** The second point predicted "≈ step 194 (30.9% withdrawn)". The third predicted "≈ step 219 (35.0% withdrawn)", which moved OUT. The fourth gave 218 and the fifth 210; the reactor went critical near 212–214.
- **What would have unstuck me:** One line saying the second-point prediction can read LOW as well as high, and the number can move either way before it settles.
- **Measured:** own script, fresh startup IC, the reviewer's stops (0 / 75 / 150 / 196 / 204), one Plot point 30 s after each stop, seeds 42 / 7 / 11: second-point predictions 245 / 372 / 265, third 234 / 251 / 248, fifth 213 on all three (first bank with STARTUP RATE above +0.02 after 5 plant-min: 205). With the lowest measured bank-0 reading (434 cps) as the baseline and 707 cps at bank 75, the two-point line crosses at step 195, the reviewer's 194.
- **Verdict:** narrowed. The prediction usually moves in, but "always too high" is false: a baseline plotted on a low moment of the jumping count predicts low. Step 5 now says "usually"; step 6 says it can also move out before it settles. Not reproduced on the chained plant itself.

### S-5 — Startup step 2 (and later boron steps): "Set the boron target" names a box with no label
- **Step text:** "2b○ Set the boron target to 719 ppm."
- **What I did:** No label on the board says "target". The BORON card has a number box (it read 918) under "0-2500 ppm", next to "BORON CHEM 918 ppm". I guessed the box, typed 719 and pressed Enter, and it ticked. The scanner calls it "Boron target", but only on hover.
- **What would have unstuck me:** "Type it into the number box on the BORON card (the one under 0-2500 ppm)".
- **Measured:** board data item `imrpq29jo7t` (the number box on the BORON card) carries `label: "0-2500 ppm"` and no other visible text; "Boron target" exists only in the inspect map (hover). Pool: startup 2b, raise power 3b, lower power 1b, cooldown 1b say "boron target" with no location.
- **Verdict:** confirmed. The four asks now say "type it into the number box on the BORON card captioned 0-2500 ppm". No board label added (design question 4, no clutter: the text names what is on screen).

### S-6 — Startup step 5 onward: the 1/M window covers the board and nothing says to close it until step 11
- **Step text (step 4):** "Press 1/M PLOT on the ROD CONTROL card, then press Plot point."
- **What I saw:** The "1/M Startup Plot" window sits over the STEAM DUMP / SG FEED cards and the left edge of the walkthrough panel from step 4 to step 11. Step 11 finally says "close the 1/M PLOT window with the ✕". Nothing in steps 5–10 needed those covered cards, so it did no harm.
- **What would have unstuck me:** Nothing was blocked. It is a visibility cost only.
- **Measured:** not measured (panel geometry not re-checked on this tree).
- **Verdict:** not filed: no delay, visibility only (the reviewer's own "Nothing was blocked").

### S-7 — Cooldown step 11: two numbers for one action
- **Step text:** "11b· Leave SPRAY running and watch SUBCOOLING MARGIN fall to 32 °F." then "11c· When SUBCOOLING MARGIN reads below 30 °F, press OFF under SPRAY".
- **What I did:** I watched the margin fall from 91 to 29 °F (about 30 plant-minutes at 60×) and pressed OFF at 29. It worked. I was unsure whether 32 or 30 was the trigger.
- **What would have unstuck me:** One number.
- **Measured:** pool `pwr_cooldown` #11: 11b grades `subcooling_c < 17.78` (32.0 °F); 11c asks for the press below 30 °F. The source record says why: a row AT 30 °F stranded route `spray_off_at_entry` for 465 plant-min (the margin turns back before the grade agrees).
- **Verdict:** confirmed as wording; the gap is deliberate. 11b now reads "watch SUBCOOLING MARGIN fall. This line ticks at 32 °F; the press comes at 30 °F, in the next line."

### S-8 — Cooldown step 6: the order of "Press MANUAL … with its box at 50 %" is ambiguous
- **Step text:** "6b· Press MANUAL under SPRAY with its box at 50 %, not more."
- **What I did:** The spray box read 0 %. I typed 50 and pressed Enter first, then pressed MANUAL. It ticked.
- **What would have unstuck me:** "Type 50 in the box under SPRAY and press Enter, then press MANUAL."
- **Measured:** pool `pwr_cooldown` #6b read "Press MANUAL under SPRAY with its box at 50 %, not more."; the reviewer's order (type 50, Enter, then MANUAL) ticked the row.
- **Verdict:** confirmed. Reworded to that order, and 11b's note (the same action) likewise. The other order was not measured.

### Minor (no delay)
- **Heatup step 2:** "Coming from a cooldown with PRIMARY PRESSURE under about 25 psi…". The board read 363 psi, so I was not sure the note applied. **Measured:** the note is conditional ("Coming from a cooldown with PRIMARY PRESSURE under about 25 psi"); a fresh Mode 5 start reads about 363 psi, as heatup 9's note says. **Verdict:** refuted as a defect; not changed.
- **Heatup step 3:** the text mentions "PRESS TO RESET", but the board read "PRESS TO ARM". "Arm" is not explained until the shutdown leg. **Measured:** the pool note is conditional ("If SCRAM ... reads PRESS TO RESET, press it once first"); untripped, the button reads PRESS TO ARM. **Verdict:** narrowed; the note now adds "PRESS TO ARM means no trip is latched; leave it."
- **Heatup step 7:** two check lines for one press: "A+B 7 % lit: both orifices open" and "Orifice B open: A+B 7 % lit". **Measured:** rows `letdown_orifice_a` "A+B 7 % lit: both orifices open" and `cont` `letdown_orifice_b` "Orifice B open: A+B 7 % lit". **Verdict:** confirmed; labels now "A+B 7 % lit: orifice A open" and "Orifice B open".
- **Heatup step 11:** the step names 542 °F. With the walkthrough's own 3600× warp, the tile read 552 °F when Continue lit, and STEAM PRESS read 1057 psi. **Measured:** route runner `--leg=chain` typical route (seed 42, the card's 3600× rung, Continue pressed 3 plant-s after it lights): step 11 done at 545.7 °F; the acceptance is "542 °F or higher". **Verdict:** narrowed; the 552 °F is warp granularity at 3600× in the browser, not a grading error. Not changed.
- **Raise-power step 1:** "the plant is in Mode 1, At Power". I could find no mode indicator on the board to check this against. **Measured:** the board has no plant-mode readout (`ui/app.js` modeLiveNote comment); `plant_mode` is 1 when power > 5 % and the reactor is not tripped (`pwr2_true_state.js`). **Verdict:** confirmed; 1a now reads "Anything above 5 % is Mode 1, At Power; the board has no separate mode readout."
- **Startup steps 9b and 13, and lower-power steps 2–6:** the suggested warp (10× while waiting, 5×) was not set automatically; I pressed the speed buttons myself. Other steps did set their warp. **Measured:** code read only, not driven in a browser (`ui/app.js` `cklActionPending`): lower power 2 to 6 and startup 13 carry a `cmd` (LOAD, WITHDRAW), so auto holds 1× until the first press of that family lands ("speed the wait, not the action"); 9b is `act_first` for the same reason. The reviewer's log shows 5× pressed before the first LOAD, which the runtime then keeps as the player's own speed for that step. **Verdict:** narrowed; by design. Not changed.
- **Cooldown step 4:** "In TAVG mode the setpoint does nothing." "TAVG mode" is never defined. The STEAM DUMP card reads PRESS. **Measured:** the STEAM DUMP status word is PRESS or TAVG (`pwr_board_wiring.js` `imrppq5r7kw`); "TAVG mode" was the card's only mention. **Verdict:** confirmed; the note now reads "If the status reads TAVG, the dump is holding temperature instead and ignores DUMP SETPOINT."
- **Cooldown step 1:** at 600× the speed row showed an extra "→ 450×" chip beside 3600×, with no explanation. **Measured:** not measured. **Verdict:** not filed.
- **Cooldown step 11:** COOLDOWN RATE shows negative values ("-83 F/hr"), while the text says "under 100 °F per hour". **Measured:** tile `bdRhrCooldownRate` prints `instruments.tavg_rate` signed (cooling negative); route runner chain peak −88.8 °F/hr at step 11. **Verdict:** confirmed as wording; the note now says the tile shows cooling as a minus number.
- **Cooldown step 16:** "The bank runs in by itself, about 9 plant-minutes" and "Suggested 60×" apply only if the bank is out. Here it was already in. **Measured:** not measured. **Verdict:** not filed.
- **Heatup step 6:** RCP FLOW read 115 % (later 113 %, 110 %), which is above 100 % and unexplained. **Measured:** not measured on this tree; heatup 2 grades "above 90 %" and claims no 100 %. **Verdict:** no text contradiction; the reading above 100 % is not explained on the card. Not changed.

## 3. Per-step log

### pwr_heatup (Mode 5 → Mode 3)
| Step | First sentence | What I did | Time to satisfy | Continue | Shots / confusion |
|---|---|---|---|---|---|
| 1 | "Confirm the plant is cold and shut down." | Nothing; all 4 ticked on load | 0 | lit | h01_s1 |
| 2 | "Start the reactor coolant pumps." | Clicked ON on RCP FLOW card | ~12 s at 1× (flow 3→21→>90 %) | lit | h02_s2b, h02_s2_on, h02_s2_w; the "under about 25 psi" note didn't match 363 psi |
| 3 | "Withdraw the shutdown bank all the way out." | FAST, then SHUTDOWN WITHDRAW once | ~7 plant-min, warp auto 60× | lit | h03_s3, h03_s3a, h03_s3b; PRESS TO ARM vs text's PRESS TO RESET |
| 4 | "Confirm the turbine is tripped." | Nothing | 0 | lit | h04_s4 |
| 5 | "Put steam generator level control in AUTO while the plant is quiet." | AUTO on SG FEED | instant | lit | h05_s5, h05_s5a |
| 6 | "Confirm the steam dump is closed." | Nothing; the glow showed which diagram % was meant | 0 | lit | h06_s6; RCP FLOW 115 % |
| 7 | "Open the letdown orifices before the pressure climb shuts the RHR path." | A+B 7 % on LETDOWN | instant | lit | h07_s7, h07_s7a; duplicate check line |
| 8 | "Put pressurizer spray in service before the heaters start the climb." | AUTO under SPRAY | instant | lit | h08_s8, h08_s8a |
| 9 | "Raise PRIMARY PRESSURE to the 665 psi accumulator window on the heaters." | AUTO under HEATER, waited | ~45 plant-min at auto 600×; dropped to 1× at 665 | lit | h09_s9, h09_s9a, h09_s9b |
| 10 | "Open the accumulator valve while PRIMARY PRESSURE is inside its window." | Tile click (failed), then glowing valve symbol | ~30 s wall, 2 attempts | lit | h10_s10, h10_s10_try1, h10_hover, h10_s10_try2 — **S-1** |
| 11 | "Heat the plant to 542 °F on pump heat alone." | Waited | ~5 plant-h at auto 3600×, ~2 min wall | lit | h11_s11, h11_s11w; ended at 552 °F |
| 12 | "Confirm letdown now leaves only through the orifices." | Nothing | 0 | lit | h12_s12; LETDOWN 9 gpm vs "about 11" |
| 13 | "Hand STEAM PRESS to the steam dump to hold." | AUTO on STEAM DUMP | instant | lit | h13_s13, h13_s13a |
| 14 | "Bring PRIMARY PRESSURE up to normal operating pressure." | SET PZR PRESSURE 2235 + Enter | ~26 plant-min at auto 600× | lit | h14_s14, h14_s14a, h14_s14w |
| 15 | "Confirm Hot Standby." | Nothing | 0 | lit | h15_s15 |
| 16 | "Confirm the reactor stayed shut down." | Waited | ~90 plant-s at auto 10× | lit | h16_s16, h16_s16w |
| 17 | "Confirm the heatup made no fission power." | Nothing | 0 | lit | h17_s17, h18_done |

### pwr_startup (Mode 3 → Mode 1)
| Step | First sentence | What I did | Time | Continue | Shots / confusion |
|---|---|---|---|---|---|
| 1 | "Verify the plant is in Hot Standby (Mode 3)." | Nothing | 0 | lit | s01b |
| 2 | "Dilute boron to the estimated critical concentration, 719 ppm." | Typed 719 in the unlabelled BORON box + Enter | ~2 plant-h at auto 600× | lit | s02, s02a, s02w — **S-5** |
| 3 | "Line up the steam generator (SG) before taking the reactor critical." | Nothing | 0 | lit | s03 |
| 4 | "Take the 1/M baseline point before any rod moves." | 1/M PLOT, Plot point | instant | lit | s04, s04a, s04b — **S-6** |
| 5 | "Take the second 1/M point, after the first rod pull." | MED; held WITHDRAW to rod 65 (touched 7.1e2); 10 taps to 75; Plot point → 194 | ~2.5 min wall | lit | s05, s05a, s05b, s05c — **S-3** |
| 6 | "Take the third 1/M point." | Held WITHDRAW 75→149, one tap to 150; Plot point → 219 | ~1 min wall | lit | s06, s06c — **S-4** |
| 7 | "Take the fourth 1/M point, after a shorter pull." | Held to 196 (overshoot vs 190–192); Plot point → 218 | ~40 s wall | lit | s07, s07b |
| 8 | "Take the final 1/M point, the one the approach to critical is built on." | Held 196→204; waited for SUR ≤ +0.03 (~2.5 plant-min, text says 5½–6½); Plot point → 210 | ~40 s wall | lit | s08, s08b |
| 9 | "Take the reactor just critical." | SLOW, held 204→207 (18.6 s); then 7 taps, 5 plant-min apart, setting 10×/1× myself; SUR +0.04 … +0.17 | ~36 plant-min, ~5 min wall | lit | s09, s09a, s09b; matched the text's "6 to 8 taps" exactly |
| 10 | "Let power rise from critical with the rods still." | Waited | <1 plant-min | lit | s10, s10w |
| 11 | "Let power climb to 0.5 %." | Closed 1/M ✕; waited | ~6 plant-min at auto 5× | lit | s11, s11a, s11w |
| 12 | "Let power climb to the point of adding heat, about 1 %." | Waited | ~2.5 plant-min at auto 10× | lit | s12, s12w |
| 13 | "Raise power past 5 %, into Mode 1, At Power." | Set 5× myself; SLOW; 5 pairs of taps, each after SUR peaked and fell to ≤ +0.10 | ~5 plant-min | lit | s13, s13b |
| 14 | "Put the turbine on line and let the reactor follow it up." | LATCH; LOAD 10 + Enter | ~1.5 plant-min at auto 10× | lit | s14, s14a, s14b, s14w |
| 15 | "Block the first startup trip, IR HIGH FLUX." | Waited to 9.6 %; TRIP BLOCKS; BLOCK on the IR HIGH FLUX row | 36 s wall | lit | s15, s15_panel, s15b; the panel is dense with "P-10/P-11 PERMISSIVE", "ALSO BLOCKS THE ROD STOP" |
| 16 | "Block the second startup trip, PR HIGH (LOW SETPT)." | TRIP BLOCKS, BLOCK, TRIP BLOCKS | instant | lit | s16, s16_panel, s16b |
| 17 | "Verify the plant is in Mode 1, At Power." | Nothing | 0 | lit | s17, s18_done |

### pwr_raise_power (10 % → 100 %)
| Step | First sentence | What I did | Time | Continue | Shots / confusion |
|---|---|---|---|---|---|
| 1 | "Confirm the plant the startup handed over is ready to climb." | Nothing | 0 | lit | r01; no mode indicator to check "Mode 1" against |
| 2 | "Make sure the turbine is on line and taking steam." | Nothing | 0 | lit | r02 |
| 3 | "Start the boron dilution that carries most of the climb." | BORON box 660 + Enter | instant | lit | r03, r03a |
| 4 | "Take the first stage to 30 MWe, load leading and rods following." | LOAD 30; watched Tavg sag to 536 with 4b already ✓; later one 5-step pull | ~19 plant-min | lit (late) | r04, r04a, r04w — **S-2** |
| 5 | "Take the second stage to 50 MWe the same way." | LOAD 50; 3 × 5-step pulls (229→244) | ~5 plant-min | lit | r05, r05b |
| 6 | "Take the third stage to 75 MWe the same way." | LOAD 75; 4 × 5 (→264), lit at Tavg 561; 2 more × 5 (→274) to reach the green band (569) | ~7 plant-min | lit | r06, r06b, r06c; insertion-limit alarm while withdrawing (forewarned) |
| 7 | "Take the fourth stage to 90 MWe with a smaller pull." | LOAD 90; 1 × 5 (→279) | ~2.5 plant-min | lit | r07, r07b |
| 8 | "Take the last stage to full load and settle the temperature on 578 °F." | LOAD 100; 5 × 5 (→304); power peaked 102.4 % | ~7 plant-min | lit | r08, r08b; 25 steps against "about 20" |
| 9 | "Confirm full power, with the boron dilution done." | Waited for BORON 663 | ~3 plant-min | lit | r09, r09b, r10_done |

### pwr_lower_power (100 % → 15 MWe)
| Step | First sentence | What I did | Time | Continue | Shots |
|---|---|---|---|---|---|
| 1 | "Start adding boron before any load comes off." | BORON 719 + Enter | instant | lit | l01, l01a |
| 2 | "Take the first load off the turbine and let the reactor follow it down." | Set 5× myself; LOAD 95/90/85/80/75 a plant-minute apart; INSERT 3 at MED after each (Tavg 580–584) | ~5 plant-min | lit | l02, l02w |
| 3 | "Bring AVG COOLANT TEMPERATURE back into its band with the rods." | 2 × insert 3 (→283); Tavg 573; pressure dipped to 2192 psi | ~2 plant-min | lit | l03 |
| 4 | "Take the load down to 50 MWe, then trim…" | LOAD 70…50 with inserts, then 2 more (→262); Tavg 564 | ~8 plant-min | lit | l04, l04b |
| 5 | "Take the load down to 30 MWe, then trim…" | LOAD 45…30 with inserts, then 1 more (→247); Tavg 561 | ~6 plant-min | lit | l05, l05b |
| 6 | "Take the load down to 15 MWe, then trim…" | LOAD 25/20/15 with inserts, then 1 more (→235); Tavg 555, power 12.6 % | ~5 plant-min | lit | l06, l06b, l07_done |

### pwr_shutdown (Mode 1 → Mode 3)
| Step | First sentence | What I did | Time | Continue | Shots |
|---|---|---|---|---|---|
| 1 | "Take the load off the generator before the scram." | LOAD 0 + Enter; OUTPUT 15→1 MW in about 1 s | ~1 s | lit | d01, d01a, d01w |
| 2 | "Shut the reactor down." | SCRAM twice (arm, trip) | ~4 s | lit | d02, d02_armed, d02a |
| 3 | "Put the decay heat on the steam dump: Mode 3, Hot Standby." | Nothing (AUTO already lit) | ~45 plant-s at auto 10× | lit | d03, d03w, d04_done; "Press AUTO … until" read as repeated pressing |

### pwr_cooldown (Mode 3 → Mode 5)
| Step | First sentence | What I did | Time | Continue | Shots |
|---|---|---|---|---|---|
| 1 | "Add the boron a cold core needs before any cooling starts." | BORON 920 + Enter | ~62 plant-min at auto 600× (text ~55) | lit | c01, c01a, c01w |
| 2 | "Bring pressure under the point where the low-pressure protection can be blocked." | SET PZR PRESSURE 1900 + Enter | ~9 plant-s | lit | c02, c02a, c02w |
| 3 | "Block the protection that would read the cooldown as a leak." | TRIP BLOCKS; BLOCK PZR PRESS LO-LO; BLOCK SI REACTOR TRIP; STOP on ECCS | instant | lit | c03, c03_panel, c03_blocked, c03a |
| 4 | "Cool the plant on the steam dump to where RHR can take over." | DUMP SETPOINT 970→720 by 50, 695→270 by 25, 255→120 by 15, 6 plant-min apart | 3.5 plant-h at auto 60×, ~4 min wall | lit | c04, c04b; Tavg 547→339, no rate alarm |
| 5 | "Take the pressure setpoint to the bottom of its range." | SET PZR PRESSURE 1700 + Enter | seconds | lit | c05, c05a, c05w |
| 6 | "Hand pressure control from the heaters to the spray." | HEATER OFF; spray box 50 + Enter; MANUAL under SPRAY | ~20 plant-s at auto 5× | lit | c06, c06a, c06b, c06w — **S-8** |
| 7 | "Isolate the accumulators while pressure is inside their window." | Clicked the valve symbol (location given) | instant | lit | c07, c07a |
| 8 | "Bring pressure under the RHR limit on the spray." | Waited | ~11 plant-min at auto 60× | lit | c08, c08w |
| 9 | "Put RHR in service as the cooldown loop." | ALIGN; HX SPLIT 7 + Enter | instant | lit | c09, c09a |
| 10 | "Take the reactor coolant pumps off now that RHR is circulating." | OFF on RCP FLOW | ~10 plant-s | lit | c10, c10a, c10w |
| 11 | "Cool on RHR into Mode 5, inside the 100 °F per hour limit." | HX SPLIT 9; watched the margin; SPRAY OFF at 29 °F; waited for <199 °F | ~2 h 20 plant-min, ~5 min wall | lit | c11, c11b, c11c — **S-7**; rate peaked 86 °F/hr |
| 12 | "Shut the spray now that the plant is cold." | Nothing (done in 11) | 0 | lit | c12 |
| 13 | "Confirm the plant is in Mode 5, Cold Shutdown." | Nothing | 0 | lit | c13 |
| 14 | "Confirm the accumulators are still full and isolated." | Nothing | 0 | lit | c14 |
| 15 | "Confirm RHR is carrying the heat." | Nothing | 0 | lit | c15 |
| 16 | "Leave the plant lined up for the next heatup." | SCRAM (reset); CLOSE on STEAM DUMP; DUMP SETPOINT 1020 + Enter | instant | lit | c16, c16a, c17_done |

## 4. Words and numbers I could not find on the board

| Walkthrough said | What the board actually shows |
|---|---|
| "the accumulator valve" (heatup 10) | An unlabelled valve symbol on the diagram. Its name appears only in the hover scanner: "Accumulator Isolation Valve". |
| "the boron target" / "BORON target" (startup 2, raise 3, lower 1, cooldown 1) | An unlabelled number box on the BORON card under "0-2500 ppm". The hover scanner calls it "Boron target". |
| "SCRAM … reads PRESS TO RESET" (heatup 3) | "PRESS TO ARM" (it reads PRESS TO RESET only after a trip) |
| "the plant is in Mode 1, At Power" (raise 1a) | No mode readout that I could find on the board |
| "In TAVG mode" (cooldown 4) | The STEAM DUMP card reads PRESS; no TAVG mode label that I saw |
| "about 11 gpm" letdown (heatup 12) | LETDOWN 9 gpm |
| "542 °F" (heatup 11) | The tile read 552 °F when Continue lit at 3600× |
| "under 100 °F per hour" (cooldown 11) | COOLDOWN RATE "-83 F/hr" (negative sign) |
| "SUBCOOLING MARGIN fall to 32 °F" vs "below 30 °F" (cooldown 11b / 11c) | One tile; two different trigger numbers in the text |
| "about 5½ to 6½ plant-minutes" for SUR to reach +0.03 (startup 8) | About 2.5 plant-minutes on my route |
| "predicted crossing moves in" (startup 6) | The prediction moved out, 194 → 219 |
| "near 190 to 192" (startup 7) | I landed at 196 with an ordinary hold |
| "about 20 steps" (raise 8) | 25 steps |
| "RCP FLOW reads about 100 %" | 110–115 % in the heatup |

## 5. What the text got right
- Every control named in quotes was found by its exact label on the first try, except the accumulator valve (heatup 10) and the boron box.
- The glow highlighting on the board pointed at the right card or diagram element on every step I checked, including the unlabelled diagram % in heatup 6.
- The "held at real time — the plant needs you here" pause at 665 psi removed any time pressure from heatup 10.
- The time estimates were right on most steps: shutdown bank ~9 min, dilution ~2 h, the 7-tap approach to critical (36 plant-min), 0.5 % in ~6 min, 5 pulls to 5 %, 3.5 h steam-dump cooldown, ~2¼ h RHR cooldown, ~11 min to 413 psi.
- Every alarm that appeared had been forewarned in the step where it appeared.
- The SOURCE RANGE shorthand explanation ("7.0e2 is 700 counts a second") made the count targets readable.
- The rod-withdraw fallback in startup 5 ("tap WITHDRAW one step and wait half a plant-minute") worked when the plain hold did not.
- The trip-block steps ("Do this the moment REACTOR POWER is above 9½ %") worked on the first press.
- The lower-power recipe (cut 5 MW, wait a plant-minute, insert 3 if above X °F) kept temperature under every stated ceiling (peak 584 against 587).
- Cooldown 7 says exactly where the accumulator valve is.
- The auto-warp dropped back to 1× each time a step completed, so I never overshot a step boundary.
- The "Next: … ▸" button carried the plant from each leg into the next, so the round trip needed no restarts.
