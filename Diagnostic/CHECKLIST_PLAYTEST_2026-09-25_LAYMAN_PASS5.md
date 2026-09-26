> **Record, not policy.** Layman pass 5, 2026-09-25, on workbench `86f5a444`: all six walkthroughs
> completed on one continuous plant (T+0 to T+23:50), then the heatup again from the cooldown's
> end through its step 17. Stuck points: S-1 the round trip's heatup step 3 (scram still latched,
> WITHDRAW refused); S-2 no Next on the cooldown's end card and an empty Walkthroughs tab; S-3
> startup 5a's two conditions; S-4 pressure sag in the rampdown; S-5 cooldown alarms with no
> number to act at; S-6 the second heatup's colder start; S-7 raise-power rod overshoot; S-8
> startup step 8 met by step 7's pull; S-9 raise 9b ticking at 663 ppm.
> **Verification pass (workbench-g, same day)** re-measured every S-n on this tree with
> `run_walkthrough_routes --leg=chain` (seed 42, the chain now runs the heatup a second time),
> `inbox/v6/probe_reset.js`, `verify_ckl_relevance` 5b and a headless tile capture. **Refuted or
> narrowed, with the number:** S-2's empty tab is not the end card's alone — the list was hidden
> for EVERY loaded walkthrough (row hidden, 0 start buttons painted); S-7's "no distinct green
> band" is refuted at power (the tile paints a 17 px `#74dc9c` segment of its 178 px bar at
> 580 °F); S-6's 1686 psi gap and Low Subcooling Margin drop came from the cooldown's spray taking
> pressure to 13 psia, which the new cooldown 11 line stops (the round trip now starts at 52 psia,
> subcooling floor 87 °F); S-3, S-8 and the 1/M claim are the develop lane's and are measured
> below, not fixed here.

# Layman playthrough, pass 5 — PWR2 walkthrough chain and the round trip

Build under test: workbench 86f5a444 (page header: `Alpha 1.8.0-rc6 TEST BUILD`). Page: `ui/shell.html?engine=pwr2`, headless Edge, 1600×1000.
Persona: an intelligent layman. I learned only from the panel text, the board and the SCANNER line.
Wall time: 18:25Z to 20:00Z (about 1 h 35 min). Plant clock: T+0 to T+23:50.
Every leg after the first was entered with the end card's **Next** button, so the chain ran on one continuous plant. The exception was cooldown to heatup (see S-2).
Screenshots are in `shots/`. The raw running log is in `log.md`.

## 1. Outcome

| Leg | Result | Steps | The one thing that mattered |
|---|---|---|---|
| `pwr_heatup` (Mode 5 → 3) | PASS | 17/17 | Clean. The unexplained "Pressurizer Pressure Very Low" red alarm with pressure at 1727 psi was the only fright. |
| `pwr_startup` (Mode 3 → 1) | PASS | 17/17 | The approach to critical took 6 single taps (204 → 210), about 1 h 27 min plant time. The prediction said 207 and read *low*, but the step's italic line says it reads "high, never low". |
| `pwr_raise_power` | PASS | 12/12 | The gauge lags the rods, so my first pull was 30 steps, not "about 20". Tavg overshot to 563 °F. Power reached 103.6 %. |
| `pwr_lower_power` | PASS | 6/6 | PRIMARY PRESSURE sagged to **1819 psi** with a repeated "Pressurizer Pressure Low" alarm. That is 44 psi above the 1775 psi LO-LO trip, and the text never mentions pressure. |
| `pwr_shutdown` | PASS | 3/3 | Clean. |
| `pwr_cooldown` (Mode 3 → 5) | PASS | 16/16 | Following the pacing exactly still raised "Cooldown Rate High (>100 °F/hr)" at −149 °F/hr. The spray is ordered to stay on, and it took pressure to **13 psi** with 12–14 °F subcooling. |
| `pwr_heatup` again, from cooldown's end | PASS, played through step 17 | 17/17 | **Stuck at step 3**: the SCRAM was still latched from the shutdown and the rods silently did not move. Also, the end card had no Next, and "All walkthroughs" opened an empty tab. |

## 2. Stuck points, ranked

**S-1: Heatup (second run, from the cooldown's end), step 3.** Rods refuse to move because the reactor trip is still latched.
- Text: "3a Press FAST on the ROD CONTROL card, then click WITHDRAW under SHUTDOWN once and check SHUTDOWN ROD POSITION starts counting up."
- What I did: pressed FAST and WITHDRAW twice. SHUTDOWN ROD POSITION stayed 0. The panel showed nothing.
  - The only clue was the SCANNER line when I hovered WITHDRAW: "⚠ Command error — ROD DRIVE BLOCKED: the reactor trip is LATCHED … Reset the RPS to restore rod drive power".
  - The SCRAM card read "SCRAMMED / PRESS TO RESET". I pressed it once, it went back to "SCRAM", and then WITHDRAW worked.
  - This cost about 2½ minutes. "RPS" is never explained. Neither the heatup step nor the cooldown's step 16 ("Leave the plant lined up for the next heatup") says to reset the scram. (Shots h2_03, h2_03b, h2_03c, h2_03d.)
- What would have unstuck me: one line in cooldown step 16 or heatup step 3 saying "If SCRAM reads PRESS TO RESET, press it once first."
- **Measured:** route gate chain, seed 42, before the fix: `pwr_heatup#2` stranded at step 3 after 33.0 plant-min, WITHDRAW refused ("ROD DRIVE BLOCKED: the reactor trip is LATCHED"); with the pumps heating a stranded plant, SUBCOOLING MARGIN fell to 5.3 °F (2.9 °C) at 16 psia (0.11 MPa). The reset is accepted on a cold plant with the pumps OFF and rods in (363 psi, `inbox/v6/probe_reset.js`). After the fix: `pwr_heatup#2` completes in 382.3 plant-min; injection `round_trip_no_reset` (16d deleted) reddens it again at step 3.
- **Verdict:** confirmed. Fixed: cooldown 16d (graded on `scrammed`, met on arrival in a standalone cooldown), heatup 3a's note, and the rod-block message names the SCRAM button beside "RPS".

**S-2: Cooldown end → heatup handover.** There is no way forward from the end card.
- Text (cooldown end card): "…The heatup walkthrough takes it back up."
- What I did: there was no **Next** button, only "← All walkthroughs" and "Close".
  - "← All walkthroughs" switched to the Walkthroughs tab, which was **completely empty** (shots h2_00, h2_00b).
  - Only after I went back to the Instructor tab and pressed **Close** did the Walkthroughs tab list the legs (h2_00e). Clicking the heatup card there started it on the live plant (the clock continued), which was correct.
- What would have unstuck me: the same "Next: Mode 5 → Mode 3 …" button that every other leg's end card has.
- **Measured:** `verify_ckl_relevance` 5b, painted DOM: with the fix `{"tab":"checklists","row":true,"starts":7}`; with the old line restored `{"row":false,"starts":0}` (red). The list hid on `!runningCkl || view==='list'`, a #607 rule from when list and card shared one pane.
- **Verdict:** confirmed and broader — empty for every loaded walkthrough, not only a finished one. Fixed; cooldown also gets `next: 'pwr_heatup'`, so its end card offers the heatup.

**S-3: Startup, step 5.** The two conditions in 5a cannot both be met.
- Text: "5a Hold CONTROL WITHDRAW at MED until CONTROL ROD POSITION reads 80 to 100 and SOURCE RANGE reads 7.0e2 or more."
- What I did: pulled to 86 (SOURCE RANGE 5.4e2), then to 96 (6.6e2). I stopped at 96 so as not to leave the 80–100 window.
  - SOURCE RANGE wandered between 5.9e2 and 7.2e2 on its own. The boron was still diluting: BORON STATUS read "DILUTING 28→", BORON CHEM 749 ppm.
  - 5a ticked on a noise peak about 2 plant-minutes later.
  - A literal reader either keeps holding past 100 or sits confused.
- What would have unstuck me: "if SOURCE RANGE is short of 7.0e2 at 100, stop and wait: it climbs on its own while the boron finishes."
- **Measured:** chain route (seed 42): step 5 pulled to 80 and tapped 6 single steps inside the window, done at bank 86 in 8.8 plant-min. The reviewer stopped at 96 with SOURCE RANGE wandering 5.9e2 to 7.2e2 while BORON still read DILUTING at 749 ppm (target 719).
- **Verdict:** narrowed — the row is reachable inside the 80–100 window on the gate route; the reviewer's wait was the dilution tail. Develop lane (`pwr_startup`): reported, not edited here.

**S-4: Load rampdown, steps 3–6.** Pressure falls toward the trip and nothing on the panel mentions it.
- Text (step 3): "Insert at MED in pulls of about 5 steps, half a plant-minute apart, until AVG COOLANT TEMPERATURE reads below 577 °F…"
- What I did: exactly that, in each step. Meanwhile PRIMARY PRESSURE fell 2231 → 1947, then 2140 → 1902, then 1853, then 1819 psi.
  - The "Pressurizer Pressure Low" alarm came in twice. `#warpInfo` read "Dropped to real time — new alarm: Pressurizer Pressure Low".
  - Heaters were at 100 %, SUBCOOLING MARGIN was 39 °F, and PZR LEVEL fell from 75 % to 42 %.
  - The trip-blocks panel shows PZR PRESS LO-LO at 1775 psi, so I finished 44 psi from a trip with no word from the text. (Shots l03c, l04b, l06b.)
- What would have unstuck me: one line saying whether this pressure sag is expected, and what to do if it nears 1775 psi.
- **Measured:** chain route, PRIMARY PRESSURE floor per step 3/4/5/6: 2059 / 1992 / 1934 / 1889 psia (reviewer: 1947 / 1902 / 1853 / 1819 psi). Pressurizer Pressure Low (2150 psi) raised in step 3; the route also saw the PORV-open alarm at 2292–2301 psia and Pressurizer Pressure High in step 2 (LOAD 100 → 75 MWe), which the reviewer did not report. The trip is PZR PRESS LO-LO, 1775 psi.
- **Verdict:** confirmed as plant behaviour on this pace, 114 psi (route) to 44 psi (reviewer) above the trip. Note added to lower-power step 3 with the measured range (AGENT-DRAFTED). Whether a ~350–400 psi sag on a 10-plant-minute 100 → 15 % rampdown is prototypical is not measured against a source — a ruling for the owner.
- **Evidence pass (workbench-h, owner-selected "Evidence pass", 2026-09-25):** the heaters are sourced and not undersized (WTSM 3.2, ML11223A213: 1794 kW for 1800 ft3; here 157.8 kW for 147.5 ft3). The sag's sign is sourced (WTSM 10.3, ML11223A290: the load-decrease outsurge "also tends to reduce pressure"). It is not heater-limited: the chained plant carries 893 kg of 63.5 °F-subcooled insurge water in the pressurizer's bottom layer that nothing mixes, and heaters fixed at 0 % vs 100 % move the floor 8 psi. The card-literal pace (Tavg ~7 °F/min, 4.5x the 5 %/min design ramp) gives 2032 / 1949 / 1885 / 1848 psia. No physics moved; `Diagnostic/TUNING_LOG.md` 2026-09-25-workbench-h.

**S-5: Cooldown, steps 4 and 11.** Following the text raises alarms it never mentions.
- Step 4 text: "Lower DUMP SETPOINT 50 psi at a time from 1020 to 120 … Wait about 5 plant-minutes between steps".
  - With that pacing, the "Cooldown Rate High (>100 °F/hr)" alarm came in at T+13:51, and the COOLDOWN RATE tile read −149 F/hr.
- Step 11 text: "Watch SUBCOOLING MARGIN: the spray is still running and it keeps taking the margin down. The next step shuts it."
  - With the spray held at 50 % as ordered, PRIMARY PRESSURE fell 367 → 14 psi. SUBCOOLING MARGIN fell 58 → 14 °F, and "Low Subcooling Margin" came in at T+16:22.
  - No number tells me when to act, so I watched it fall. (Shots c06b, c11b.)
- What would have unstuck me: a rate or margin limit, with the action to take when it is crossed.
- **Measured:** step 4 at the card's pacing (50 psi, 5 plant-min waits): Cooldown Rate High raised; the route's true-state rate peaked at −365 °F/hr (−203 °C/hr) on a setpoint step, the reviewer's COOLDOWN RATE tile read −149 °F/hr. Step 11, old note (spray left on): pressure floor 13 psia, SUBCOOLING MARGIN floor 13.4 °F, Cooldown Rate High and Low Subcooling Margin both raised, 107.5 plant-min. Step 11, new note (HX SPLIT → 10 % on the rate alarm, fired at +480 s; SPRAY OFF under 20 °F margin, fired at +4620 s): margin floor 18.1 °F, pressure floor 31 psia, ends 50 psia, 127.0 plant-min.
- **Verdict:** confirmed. Step 11 now carries the two numbers to act at, and 12a is conditional (AGENT-DRAFTED). The rate alarm still comes in at the start of step 11 and on step 4's pacing — owner-ruled wording, filed as a ruling, physics untouched.

**S-6: Heatup (second run), steps 2 and 9.** The text assumes the fresh cold plant, not the cooldown's end state.
- Plant at the start: PRIMARY PRESSURE 13 psi (the fresh start is 363 psi), SUBCOOLING 12 °F, RHR still on ALIGN with HX SPLIT 10 %.
- Step 8's note says "the cold plant is about 1340 psi below it". It was about 1686 psi below.
- Step 9: `#warpInfo` read "WARP dropped to 60× — new alarm: Low Subcooling Margin" and the speed stayed about 60×. The rise to 665 psi took about 1 h 37 min plant, against about 44 minutes on the fresh plant.
- No step says to take RHR out or zero HX SPLIT. It isolated itself later (step 12).
- What would have unstuck me: a note that this start is colder and at lower pressure, and that the WARP drop is expected.
- **Measured:** before the S-5 fix the round trip started at 13 psia and SUBCOOLING MARGIN reached 5.3 °F while stranded (S-1). After both fixes: `pwr_heatup#2` starts at 52 psia, margin floor 87.1 °F, step 9 takes 86.1 plant-min (fresh plant 49.6), no Low Subcooling Margin; steps 5 and 7 are met on arrival (cooldown 16 leaves them).
- **Verdict:** narrowed — the colder start is the cooldown's spray, now closed off. Heatup 8's note says "more than 1300 psi below" and 9b's note gives the round-trip start and time.

**S-7: Raise power, step 4.** The rods overshoot because the gauge lags.
- Text: "Hold WITHDRAW at MED as AVG COOLANT TEMPERATURE sags, until it is back in its band, about 20 steps."
- What I did: held while Tavg read 545–549. By the time it read in-band I had pulled 30 steps (223 → 253), and Tavg then coasted up to 563 °F.
- "The green band on the tile": on the AVG COOLANT TEMPERATURE tile I could not find a distinct green band (zz_tavg_tile.png shows a thin grey/yellow/red bar and a marker). I used the number in the note instead.
- What would have unstuck me: "release a few °F early: the gauge keeps rising for about a minute after you let go."
- **Measured:** chain route, stage overshoot above the band after release: 5.3 / 5.0 / 3.2 / 2.6 / 1.8 °F (stages 1–5; the route stops pulling at 0.5 °F under the band). Headless capture at 580 °F: the tile's bar paints a green `#74dc9c` segment 17 px wide of 178 px.
- **Verdict:** confirmed for the overshoot (note added to 4b: "keeps rising about 2 to 5 °F after you let go"); "no green band" refuted at power — the reviewer's capture was taken at 547 °F.

**S-8: Startup, step 8.** The step does not match the plant it gets.
- Text: "8a Hold CONTROL WITHDRAW until CONTROL ROD POSITION reads 195 to 205…" and "STARTUP RATE takes about three to three and a half plant-minutes to reach +0.03 here."
- What I did: step 7 had already left the rods at 198 with SOURCE RANGE at 7.0e3. 8a ticked with no pull, and STARTUP RATE was already +0.02.
  - I plotted a second point at the **same** rod position. The prediction moved from 213 to 207.
- What would have unstuck me: "if step 7 already left you at 195–205 with 7.0e3, just wait and plot."
- **Measured:** chain route: step 7 ended at bank 182 (window 180–205), step 8 then pulled to 198 with 3 taps. The reviewer pulled 159 → 198 in step 7, inside both windows, and step 8's 195–205 was already met.
- **Verdict:** confirmed as a route-dependent overlap: step 7's window contains step 8's. Develop lane: reported, not edited.

**S-9 (minor): Raise power, step 9.** It ticks before the tile agrees.
- Text: "Check BORON reads 660 ppm or below."
- It ticked while BORON CHEM read 663 ppm.
- What would have unstuck me: nothing blocked me. The tick simply does not match the tile.
- **Measured:** the row is `boron_ppm < 663` (a deliberate settling margin, pass 4) under an ask reading "660 ppm or below"; the BORON CHEM tile draws whole ppm, so the tick at 662.5–662.99 draws "663".
- **Verdict:** confirmed. Ask and label now read "663 ppm or below" (the grading threshold).

## 3. Per-step log

Times are plant time (T+) and approximate wall time. "Pre" means the step was satisfied on arrival and Continue was already lit.

**Layout verdict:** the order works: goal line, italic why, lettered sub-steps each checking itself off, then speed and notes.
- The best feature is the grey restatement under each sub-step. It says exactly what the check is watching.
- Confusing: the long notes block sometimes holds the actual instruction (startup step 9's rate table). A "·" sub-step has no restatement until the one before it ticks.
- The auto-speed usually changed on its own, but not always. In startup steps 5, 6 and 7 the speed stayed 1× although "Suggested time warp: 5×" was printed, so I pressed 5× myself.

### Heatup (first run): T+0 → T+6:47, about 13 min wall
| # | First sentence | What I did | Time | Lit | Notes / shot |
|---|---|---|---|---|---|
| 1 | Confirm the plant is cold and shut down. | nothing | pre | yes | h01 |
| 2 | Start the reactor coolant pumps. | ON on RCP FLOW | 16 s plant | yes | h02b |
| 3 | Withdraw the shutdown bank all the way out. | FAST, WITHDRAW once | 9 plant-min, 1.5 min wall | yes | speed went to 60× then back to 1× by itself; h03c |
| 4 | Confirm the turbine is tripped, nothing to press. | nothing | pre | yes | h04 |
| 5 | Put steam generator level control in AUTO… | SG FEED AUTO | instant | yes | h05b |
| 6 | Confirm the STEAM DUMP is closed, nothing to press. | nothing | pre | yes | "STEAM DUMP opening": no card uses that word; h06 |
| 7 | Open the letdown orifices… | A+B 7 % | instant | yes | "in service" is not printed on the card; h07b |
| 8 | Put pressurizer spray in service… | SPRAY AUTO | instant | yes | h08b |
| 9 | Raise PRIMARY PRESSURE to the 665 psi accumulator window… | HEATER AUTO | 44 plant-min, 1 min wall | yes | 600× then "Held at real time — the plant needs you here"; h09c |
| 10 | Open the accumulator valve… | clicked the ringed valve | instant | yes | red alarm "Shutdown Cooling Not In Service — RHR Not Aligned in Mode 4 or 5" and RHR ISOLATE lit; not explained until step 12; h10 |
| 11 | Heat the plant to 542 °F on pump heat alone. | nothing (3600×) | 5 h 12 min plant, 3 min wall | yes | reached 551 °F; red "Pressurizer Pressure Very Low" at 1727 psi, unexplained; h11b |
| 12 | Confirm letdown now leaves only through the orifices. | nothing | pre | yes | h12 |
| 13 | Hand STEAM PRESS to the steam dump to hold. | STEAM DUMP AUTO | instant | yes | STEAM PRESS was already 1056, over the 1020 the text says it is "toward"; h13b |
| 14 | Bring PRIMARY PRESSURE up to normal operating pressure. | SET PZR 2235 | 28 plant-min, 30 s wall | yes | "1972 psi gate" is not on the board; h14c |
| 15 | Confirm Hot Standby. | nothing | pre | yes | h15 |
| 16 | Confirm the reactor stayed shut down. | nothing (10×) | 10 plant-min, 1 min wall | yes | h16b |
| 17 | Confirm the heatup made no fission power. | nothing | pre | yes | end card h18_end |

### Startup: T+6:47 → T+11:27, about 30 min wall
| # | First sentence | What I did | Time | Lit | Notes / shot |
|---|---|---|---|---|---|
| 1 | Verify the plant is in Hot Standby (Mode 3). | nothing | pre | yes | s01 |
| 2 | Dilute boron to the estimated critical concentration, 719 ppm. | typed 719 in the BORON box | 1 h 16 min plant, 1.5 min wall | yes | the card has no word "target"; ticked at 749 ppm while still "DILUTING"; s02c |
| 3 | Line up the steam generator (SG)… | nothing | pre | yes | s03 |
| 4 | Take the 1/M baseline point before any rod moves. | 1/M PLOT, Plot point | instant | yes | popup covers part of the panel; boron still falling; s04c |
| 5 | Take the second 1/M point, after the first rod pull. | pressed 5× myself; MED; pulled to 96; waited; plotted | 9 plant-min, 4 min wall | yes | **S-3**; s05b–d |
| 6 | Take the third 1/M point. | pulled 96 → 159; waited; plotted | 3 plant-min | yes | "≈ step 234"; s06d |
| 7 | Take the fourth 1/M point, after a shorter pull. | pulled 159 → 198; waited 3 plant-min; plotted | 4 plant-min | yes | "≈ step 213", 1/M 0.058; s07d |
| 8 | Take the final 1/M point… | no pull needed; plotted at 198 again | 30 s | yes | **S-8**, "≈ step 207"; s08c |
| 9 | Take the reactor just critical. | SLOW, pulled to 204; then 6 taps to 210, about 10 plant-min each | 1 h 27 min plant, 16 min wall | yes | STARTUP RATE after settling: 0.00 / 0.00 / 0.01 / 0.01 / 0.02 / 0.03 / 0.05–0.06. The italic line says "prediction reads high, never low" but critical was 3 steps past it. The rate table was the most useful text in the leg. s09b–k |
| 10 | Let power rise from critical with the rods still. | nothing (10×) | 43 plant-min, 4.7 min wall | yes | matches the "30 to 60" note; s10b |
| 11 | Let power climb to 0.5 %. | closed 1/M; nothing (5×) | 23 plant-min, 4.8 min wall | yes | s11b |
| 12 | Let power level itself off below 5 %. | nothing (10×) | 23 plant-min, 2.4 min wall | yes | leveled at 0.9 %; the text says "near 1 to 3 %"; s12b |
| 13 | Raise power past 5 %, into Mode 1, At Power. | SLOW, pulled 13 steps (210 → 223) | 3.5 plant-min | yes | s13c |
| 14 | Put the turbine on line and let the reactor follow it up. | LATCH; LOAD 10 | 2 plant-min | yes | s14d |
| 15 | Block the first startup trip, IR HIGH FLUX. | waited for 9.7 %; TRIP BLOCKS; BLOCK | 1 plant-min | yes | the panel text is dense; s15c |
| 16 | Block the second startup trip, PR HIGH (LOW SETPT). | BLOCK; closed the panel | instant | yes | s16b |
| 17 | Verify the plant is in Mode 1, At Power. | nothing | pre | yes | s18_end |

### Raise power: T+11:27 → T+11:56, about 25 min wall
| # | First sentence | What I did | Time | Lit | Notes / shot |
|---|---|---|---|---|---|
| 1 | Confirm the plant the startup handed over is ready to climb. | nothing | pre | yes | "in Mode 1": there is no Mode indicator on the board; r01 |
| 2 | Make sure the turbine is on line and taking steam. | nothing | pre | yes | r02 |
| 3 | Start the boron dilution that carries most of the climb. | BORON 660 | instant | yes | r03b |
| 4 | Take the first stage to 30 MWe… | LOAD 30; waited for the sag; held WITHDRAW 30 steps | 4 plant-min | yes | **S-7**; Tavg 563; r04e |
| 5 | Take the second stage to 50 MWe the same way. | LOAD 50; WITHDRAW 15 | 4 plant-min | yes | r05e |
| 6 | Take the third stage to 75 MWe the same way. | LOAD 75; WITHDRAW 25 | 4.5 plant-min | yes | Tavg coasts up about 5 °F after release; r06d |
| 7 | Take the fourth stage to 90 MWe with a smaller pull. | LOAD 90; WITHDRAW 20 | 3.5 plant-min | yes | power reached 98.6 % at 90 MW; r07d |
| 8 | Take the last stage to full load and settle the temperature on 578 °F. | LOAD 100; WITHDRAW 5 | 3 plant-min | yes | power 103.6 %; r08d |
| 9 | Confirm full power, with the boron dilution done. | waited at 1×; INSERT 3 twice when Tavg reached 583 | 7.5 plant-min, 8 min wall | yes | ticked at 663 ppm (**S-9**); "above its band": which band?; r09c |
| 10 | Start giving back the reactivity xenon takes, rods first. | nothing | pre | yes | r10 |
| 11 | Give boron its first small dose as xenon builds. | nothing | pre | yes | conditional; reads as filler now; r11 |
| 12 | Hold full power on program while xenon builds. | nothing | pre | yes | end card says rods "about 318"; the board read 312; r13_end |

### Lower power: T+11:56 → T+12:12, about 7 min wall
| # | First sentence | What I did | Time | Lit | Notes / shot |
|---|---|---|---|---|---|
| 1 | Start adding boron before any load comes off. | BORON 719 | instant | yes | l01b |
| 2 | Take the first load off the turbine… | LOAD 75 | 40 plant-s | yes | the text says power walks down over "about five plant-minutes"; it fell 101 → 92 % in 20 s and Tavg reached 596 °F by step 3; l02b |
| 3 | Bring AVG COOLANT TEMPERATURE back into its band with the rods. | 7 × 5-step inserts (312 → 277) | 4.5 plant-min | yes | **S-4**, pressure 1947; l03c |
| 4 | Take the load down to 50 MWe, then trim… | LOAD 50; 9 × 5 inserts | 2.5 plant-min | yes | pressure 1902; power dipped to 42 % at 50 MW; l04b |
| 5 | Take the load down to 30 MWe, then trim… | LOAD 30; 4 × 5 inserts | 2.5 plant-min | yes | pressure 1853; l05b |
| 6 | Take the load down to 15 MWe, then trim… | LOAD 15; 4 × 5 inserts | 2.5 plant-min | yes | pressure 1819; power 12.9 %; end card says "near 15 %"; l06b, l07_end |

### Shutdown: T+12:12 → T+12:13, about 1.5 min wall
| # | First sentence | What I did | Time | Lit | Notes / shot |
|---|---|---|---|---|---|
| 1 | Take the load off the generator before the scram. | LOAD 0 | 1 s | yes | d01b |
| 2 | Shut the reactor down. | SCRAM × 2 | 4 s | yes | d02b |
| 3 | Put the decay heat on the steam dump… | nothing | 15 plant-s | yes | pressure 1795 after the scram; d03b, d04_end |

### Cooldown: T+12:13 → T+17:02, about 9 min wall
| # | First sentence | What I did | Time | Lit | Notes / shot |
|---|---|---|---|---|---|
| 1 | Add the boron a cold core needs before any cooling starts. | BORON 920 (600× auto) | 70 plant-min, 1.5 min wall | yes | c01c |
| 2 | Bring pressure under the point where the low-pressure protection can be blocked. | SET PZR 1900 | 20 plant-s | yes | c02b |
| 3 | Block the protection that would read the cooldown as a leak. | TRIP BLOCKS: LO-LO, SI; ECCS STOP | 1 min wall | yes | the rows shift as the panel re-lays out, and my first SI click missed; "RELEASED BY THE PLANT", "P-10" are jargon; c03a–c |
| 4 | Cool the plant on the steam dump to where RHR can take over. | 18 setpoint entries, 970 → 120, at 60× | 70 plant-min, 7 min wall | yes | **S-5**; tedious; c04b |
| 5 | Take the pressure setpoint to the bottom of its range. | SET PZR 1700 | 5 plant-s | yes | c05b |
| 6 | Hand pressure control from the heaters to the spray. | HEATER OFF; SPRAY MANUAL 50 | 40 plant-s | yes | "with its box at 50 %": the order of actions is unclear; c06b |
| 7 | Isolate the accumulators while pressure is inside their window. | clicked the ringed valve at 1348 psi | instant | yes | the location hint helped; c07b |
| 8 | Bring pressure under the RHR limit on the spray. | nothing (60×) | 10 plant-min | yes | Tavg crept 338 → 343; c08b |
| 9 | Put RHR in service as the cooldown loop. | ALIGN; HX SPLIT 7 | instant | yes | c09b |
| 10 | Take the reactor coolant pumps off now that RHR is circulating. | RCP OFF | 10 plant-s | yes | c10c |
| 11 | Cool on RHR into Mode 5, at about the 100 °F per hour limit. | HX 12, then 10 when the rate read −102 | 2 h 6 min plant, 3 min wall | yes | **S-5**, pressure 14 psi; c11b |
| 12 | Shut the spray now that the plant is cold. | SPRAY OFF | instant | yes | c12c |
| 13 | Confirm the plant is in Mode 5, Cold Shutdown. | nothing | pre | yes | c13 |
| 14 | Confirm the accumulators are still full and isolated. | nothing | pre | yes | c14 |
| 15 | Confirm RHR is carrying the heat. | nothing | pre | yes | c15 |
| 16 | Leave the plant lined up for the next heatup. | CLOSE on the dump; setpoint 1020 | instant | yes | 16a was pre-ticked; the scram is **not** reset (S-1); c16b, c17_end |

### Heatup (second run, from cooldown's end): T+17:03 → T+23:50, about 11 min wall
| # | First sentence | What I did | Time | Lit | Notes / shot |
|---|---|---|---|---|---|
| — | (getting there) | Close, then the Walkthroughs tab, then the heatup card | about 1 min | — | **S-2**; h2_00, h2_00e |
| 1 | Confirm the plant is cold and shut down. | nothing | pre | yes | pressure 13 psi, Tavg 193; h2_01 |
| 2 | Start the reactor coolant pumps. | ON | 30 plant-s | yes | flow rose to 114 %; h2_02b |
| 3 | Withdraw the shutdown bank all the way out. | FAST, WITHDRAW × 2 (nothing), reset SCRAM, WITHDRAW | 2.5 min wall lost | yes | **S-1**; h2_03–h2_03d |
| 4 | Confirm the turbine is tripped… | nothing | pre | yes | h2_04 |
| 5 | Put steam generator level control in AUTO… | nothing | pre | yes | already AUTO; h2_05 |
| 6 | Confirm the STEAM DUMP is closed… | nothing | pre | yes | cooldown step 16 did it; h2_06 |
| 7 | Open the letdown orifices… | nothing | pre | yes | h2_07 |
| 8 | Put pressurizer spray in service… | SPRAY AUTO | instant | yes | note's "1340 psi below" is wrong here; h2_08b |
| 9 | Raise PRIMARY PRESSURE to the 665 psi accumulator window… | HEATER AUTO | 1 h 37 min plant, 2.3 min wall | yes | **S-6**, WARP drop; h2_09b |
| 10 | Open the accumulator valve… | clicked the valve at 667 psi | instant | yes | h2_10 |
| 11 | Heat the plant to 542 °F on pump heat alone. | nothing (3600×) | 4 h 16 min plant, 3 min wall | yes | Tavg 552; h2_11b |
| 12 | Confirm letdown now leaves only through the orifices. | nothing | pre | yes | RHR isolated itself; h2_12 |
| 13 | Hand STEAM PRESS to the steam dump to hold. | STEAM DUMP AUTO | instant | yes | h2_13 |
| 14 | Bring PRIMARY PRESSURE up to normal operating pressure. | SET PZR 2235 | 14 plant-min | yes | no injection fired; h2_14b |
| 15–17 | Confirm Hot Standby / stayed shut down / no fission power | nothing | pre / 10 plant-min / pre | yes | h2_15–h2_18_end |

**Things I did that the text did not say, to make a step pass:**
1. Reset the SCRAM (S-1).
2. Pressed Close before the Walkthroughs list would show (S-2).
3. Pressed 5× myself in startup steps 5–7, where the text suggests it but the page stayed at 1×.
4. Lowered HX SPLIT from 12 to 10 in cooldown step 11 (the note allows this).
5. Used my own threshold of 583 °F for "rises above its band" in raise-power step 9.

## 4. Words and numbers I could not find on the board

| Walkthrough says | What is actually on the board |
|---|---|
| "the plant is in Mode 1, At Power" (raise step 1a) | No Mode indicator. The only "MODE" label is on the ECCS card (STANDBY / RHR). |
| "The green band on the tile" (raise 4, lower 2–6) | The AVG COOLANT TEMPERATURE tile has a thin multicoloured bar and a marker. I saw no distinct green band (zz_tavg_tile.png). |
| "STEAM DUMP opening reads under 1 %" (heatup 6b) | No card says "opening". There is an unlabeled "0 %" on the diagram by the steam line. |
| "orifice A is in service" (heatup 7a) | The LETDOWN card only has lit buttons "A 3%", "B 4%", "A+B 7%". No "in service" text. |
| "Set the boron target" (startup 2b) | The BORON card box shows "918 ppm" and "0-2500 ppm". The word "target" is not printed. |
| "the 1972 psi gate" (heatup 14) | Not labelled anywhere. The PRIMARY PRESSURE tile shows "LO TRIP BLKD". |
| "Reset the RPS" (SCANNER line, heatup #2 step 3) | "RPS" is nowhere on the board. The button says "PRESS TO RESET". |
| "P-10 PERMISSIVE", "P-11" (startup 15, trip-blocks panel) | Only inside the trip-blocks panel. Never explained. |
| "roughly 110 °F" (raise-power end card) | Unclear which reading. Nothing on the board changes by 110 °F. |
| "ATMOS DUMP is shut" (heatup 15d) | The card has "AUTO" and "SHUT" buttons and a "0 %". It is unclear whether "shut" means the button or the reading. |
| "BORON reads 660 ppm or below" (raise 9b) | BORON CHEM read 663 ppm when it ticked. |

## 5. What the text got right
- The grey restatement under each sub-step says exactly what the check watches.
- "The ring on TRIP marks the lamp to read, not a button to push" removed a real ambiguity.
- The pulsing ring on the accumulator valve, plus the location hint in cooldown step 7, made a diagram click findable.
- Startup step 4's shorthand key ("7.0e2 is 700 counts a second") made every count target readable.
- Startup step 9's table of what each STARTUP RATE reading means was the single most useful block. I followed it tap by tap to critical.
- Startup step 10's "30 to 60 plant-minutes" matched what I saw (43).
- The warnings that "SOURCE RANGE switches itself off above 1.0e5" and "close the 1/M PLOT window" both matched the board.
- Startup step 15's explanation of why BLOCK can fall out between 8 % and 9½ % pre-empted a confusion.
- Raise-power step 4 told me which way to move the rods for which error ("below the band: withdraw. Above: insert").
- Lower-power step 3's "The tile trails the rods: hold INSERT straight through and the plant is already past the band" was exactly true, and made the 5-step pulse pattern sensible.
- Cooldown step 13's "PRIMARY PRESSURE will be low — the spray took it there" answered the worry, just late.
- Cooldown step 16 left the steam dump CLOSE at 1020, so heatup steps 6 and 13 needed nothing on the second run.

## 6. Verification addenda (workbench-g)

- **Startup findings for the develop lane** (measured, not edited here): the 1/M "reads high, never low" line is refuted on both routes — prediction 209 with critical at 210 (gate chain), 207 with critical at 210 (reviewer). Steps 5–7 holding 1× under "Suggested time warp: 5×" is the designed hold until the step's command is seen (`verify_flags_ui`, 67/67 on this tree); the card does not say so.
- **Words not on the board, verdicts:** heatup 6b, 7a/7b, 8, 14, 15d rewritten in the board's words; "the green band" stands (painted at power, see S-7); "Mode 1" (raise 1a) and "boron target", "P-10"/"P-11" are startup or trip-panel wording, left; "roughly 110 °F" (raise-power) not measured — the rod-plus-boron worth it states was not re-derived on this pass; "Reset the RPS" kept (a gate pins it) with the SCRAM button named beside it.
- **A harness defect found on the way:** the rod drive THROWS on a latched trip, and the route gate crashed as `error` instead of reporting the strand; `send()` now records a refused command on the step.
- **A runtime defect found on the way:** the trip-notice scanner exempted any leg that NAMED `scrammed`, so cooldown 16d's reset check would have silenced the cooldown's trip banner. Fixed in `layers/instructor_layer.js` (`assertsTrip`).
