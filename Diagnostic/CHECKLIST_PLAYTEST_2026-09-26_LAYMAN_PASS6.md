# Layman playthrough: PWR2 walkthrough chain (pass 6)

> **Record, not policy.** Layman pass 6, 2026-09-26, on workbench `25e464b0`: all six legs and a
> second heatup from the cooldown's end completed on ONE plant, no Rewind (T+0 → T+24:44). Verified
> 2026-09-26 (workbench-a) with `test/run_walkthrough_routes.js`, extended so each confirmed finding
> reddens on the old card (injections `raise_old_settle_band`, `cooldown11_old_watch`,
> `cooldown_4min_waits`). **S-1** raise-power 10 text vs grading — confirmed, fixed · **S-2** second
> heatup at 17 psi — confirmed, cause is the cooldown seam (S-5), fixed there · **S-3** startup 9 two
> waits — confirmed, develop lane · **S-4** Cooldown Rate High — NARROWED: the reviewer's entries
> were 4.1 plant-minutes apart, not 6 (139 plant-min / 34); the card's 6 is safe · **S-5** spray
> watch at 600× — confirmed, fixed · **S-6** startup 5 counts — narrowed (route meets it at bank 87),
> develop lane · **S-7** — confirmed for step 8 only; stages 4-7 grade the band their own text names
> · **S-8** — confirmed, fixed. **REFUTED: "ECCS STOP left the plant without safety injection"** —
> with STOP pressed a leak still actuated SI and started the pump (148 s / 17.5 s, flow identical),
> and the cooldown's SI blocks are re-armed by the second heatup's end. The claim in cooldown step
> 3 that STOP "takes the injection pump out of standby" was false and is rewritten.


Build under test: **workbench 25e464b0** (page header: `Alpha 1.8.0-rc6 TEST BUILD`), `ui/shell.html?engine=pwr2`, headless Edge, 1600×1000.
Persona: an intelligent layman who knows what pumps and valves are. The only sources were the walkthrough panel and the board.
Run: one continuous plant, T+00:00:00 → T+24:44:23 plant time, about 1 h 23 min wall time (03:07 → 04:30 UTC).
Screenshots: `the pass-6 scratchpad `lay6/shots/`` (180 files). Raw running notes: ``lay6/log.txt` (local, not kept)`.

**Layout verdict (goal line / italic why / lettered substeps / speed / notes):** it helps. The goal line plus the ticking substeps always told me what the panel was waiting for. The "Suggested time warp" line under each substep tells me when to speed up or slow down. Two things confused me:
- The notes paragraph sometimes gives a different wait from the substep it sits under (S-3).
- A few check-off labels (the small grey line under a substep) accept a different number from the one the instruction names. They are the real target, but they read like a caption (S-1, S-5).

---

## 1. Outcome

| Leg | Result | Steps completed | The one thing that mattered |
|---|---|---|---|
| `pwr_heatup` (Mode 5 → Mode 3) | PASS | 17/17 | Clear throughout. The self-driving speed (600×/3600×, dropping to 1× at each hold) made a 6-plant-hour evolution take about 5 min wall. |
| `pwr_startup` (Mode 3 → Mode 1) | PASS | 17/17 | The 1/M approach worked exactly as written. The prediction said step 207 and the reactor went critical at 210 (the text allows 3 past). Six taps and about 9.5 min wall were spent finding critical. |
| `pwr_raise_power` | PASS, one stall | 12/12 | Step 10 stalled for about 8 min: the check wants Tavg "near 580 °F" but the text says to leave the rods alone. |
| `pwr_lower_power` | PASS | 6/6 | Clean. The pressure-sag prediction (about 2140 psi) was accurate. |
| `pwr_shutdown` | PASS | 3/3 | Clean. The two-press SCRAM (arm, then trip) is clear. |
| `pwr_cooldown` (Mode 3 → Mode 5) | PASS, two alarms | 16/16 | "Cooldown Rate High" came in even though I followed the stepping schedule exactly. At 600× the "subcooling below 20 °F → spray OFF" watch lasts a fraction of a second of wall time. |
| `pwr_heatup` #2 (from the cooldown's end) | PASS, one surprise | 17/17 (asked for ≥14) | From the cooldown's lineup, starting the pumps heated the plant at 18 psi. Tavg went 195 → 204 °F, subcooling fell to 25 °F and the Low Subcooling Margin alarm fired. No text warned me. It recovered once the heaters came on at step 9. |

Every leg's end card offered `Next: … ▸`, and every Next carried the same plant forward. I never needed Rewind.

---

## 2. Stuck points (by severity)

**S-1 — raise_power step 10: the check contradicts its own instruction.** (Stuck about 8 min wall, and I only got through by doing what the text says not to do.)
> "10a If AVG COOLANT TEMPERATURE reads below its band, hold WITHDRAW at MED 3 to 6 steps; otherwise leave the rods where they are." / check-off: "AVG COOLANT TEMPERATURE near 580 °F" / note: "Right after the climb there is almost no xenon, and the temperature holds by itself. Pulling now only heats the plant…"

- **What I did:** I arrived with Tavg at 570 °F. Step 9 had just ticked me "between 563 and 592 °F", so I was in band and left the rods alone.
  - 2.5 min wall at 1×: Tavg went 570 → 571 and the check did not tick.
  - The tile marker sat exactly on the left edge of the green band (`r10_tile.png`), so it was ambiguous whether I was "below its band".
  - I pulled 4 steps (289 → 292, Tavg 573) and waited 4 min: no tick.
  - I pulled 6 more (→ 296, Tavg 574). It ticked at T+11:44:04. Each pull put REACTOR POWER at 103.3 %, right at the rod stop the previous step warned about.
- **What would have unstuck me:** state the target the check uses ("pull until AVG COOLANT TEMPERATURE reads about 574–580 °F"). Or make the check agree with "otherwise leave the rods where they are".
- **Measured:** built pool: step 10 grades 574.5-585.3 °F, which is the tile's green band at full load (575.1-585.2 °F); "below its band" was read against the 563-592 °F band steps 8 and 9 name. Route gate, the chain with a player who stops at the first in-band reading (injection `raise_old_settle_band`, old card): step 8 done at 564.0 °F. The reviewer reached step 10 at 570 °F because step 9 ticked in 2.5 plant-min; on the route step 9 ran 11 min and carried the plant to 576 °F, so step 10 was met on arrival there — the stall depends on step 9's length.
- **Verdict:** confirmed (the contradiction); narrowed (the strand). Fixed: step 8 grades 573-583 °F, step 10 reads "below 575 °F … repeat until it reads 575 °F or more; otherwise leave the rods". After: chain step 8 done at 577.2 °F, step 10 met on arrival at 580.3 °F; standalone `band_floor` completes.

**S-2 — second heatup (from the cooldown's end), steps 2–8: the pumps heat a depressurized plant with no warning.**
> Step 2: "Press ON on the RCP FLOW card…" Step 3: "…click WITHDRAW under SHUTDOWN once…" (no mention of pressure until step 9: "Coming from the cooldown the plant starts near 50 psi or lower, not 363…")

- **What I did:** I followed steps 2–8 exactly.
  - Starting state: pressure 17–18 psi, heaters OFF, RHR still ALIGN at HX SPLIT 9 %.
  - With the pumps on, Tavg rose 195 → 208 °F. That is above the 200 °F Mode 5 limit that step 1 had just checked.
  - SUBCOOLING MARGIN fell to 25 °F.
  - During step 3's 60× wait the speed dropped to 1× with the banner "Dropped to real time — new alarm: Low Subcooling Margin" (`h2_03.png`).
  - Nothing in the text explained the alarm or said to act. It cleared only after step 9 turned the heaters on (subcooling 149 °F by 138 psi).
- **What would have unstuck me:** one line at step 2 or 3 saying that coming from the cooldown, this alarm and a Tavg rise past 200 °F are expected until step 9's heaters raise pressure. Or move the heater step ahead of the pumps for this entry.
- **Measured:** chain, cooldown spray shut late (seam at 19 psia): second heatup Tavg 194 → 203 °F and SUBCOOLING MARGIN down to 25.1 °F by step 8 — the reviewer's 25 °F. From a 50 psia seam the same steps hold 83 °F. The seam pressure is set by when cooldown step 11's spray goes off (S-5): the standalone cooldown on the old card ends at 18 psia.
- **Verdict:** confirmed; cause narrowed to the cooldown seam. Fixed there (S-5): the seam is now 241 psia on the chain (182 standalone) and the second heatup's margin stays above 197 °F. Heatup 2a gains a forewarning for a plant under 25 psi; 9b's times are re-measured (58 plant-min from 249 psia).

**S-3 — startup step 9: two different waits for the same reading, and a start-up that took six taps.**
> "9b Tap WITHDRAW one step, wait about five plant-minutes, and read STARTUP RATE." / note: "Read the rate only once it has stopped falling, about ten plant-minutes after the last tap; the check-off waits for that too."

- **What I did:** tapped at 205, 206, 207, 208, 209 and 210.
  - After each tap I waited about 10 plant-minutes at 10×.
  - STARTUP RATE read, in order: +0.00–0.01, +0.01, +0.01, +0.02, +0.04 (PERIOD about 700 s), then +0.06 (PERIOD about 480 s), which ticked.
  - Totals: 68 plant-min and about 9.5 min wall (T+8:19:37 → 9:27:53).
  - The walkthrough did not set 10× itself for 9b. I set it by hand from the "Suggested" line.
- **What would have unstuck me:** one wait figure, not two. Also the plain statement that it usually takes 4–6 single taps from 3 short.
- **Measured:** built pool: 9b says "wait about five plant-minutes"; its note says "about ten"; the grading is rods still 300 s plus STARTUP RATE steady over 240 s. Chain route reading every 300 s: 206 → 210 in 5 reads, 26.5 plant-min (reviewer, ~10-min waits: 68 plant-min). 9b carries `wait_speed` 10; whether the browser applied it was not measured.
- **Verdict:** confirmed (two waits for one reading). Startup is the develop lane: reported, not edited.

**S-4 — cooldown step 4: I followed the schedule exactly and still got "Cooldown Rate High".**
> "Steps of 50 psi down to 720, then 25 psi down to 270, then 15 psi… one big jump sets off the Cooldown Rate High alarm and empties the pressurizer. Wait about 6 plant-minutes between steps, 6 seconds at 60×…"

- **What I did:** I entered all 34 DUMP SETPOINT values (970 … 720, 695 … 270, 255 … 120) about 6.8 s wall apart at 60×.
- "Cooldown Rate High (>100 °F/hr)" came in at T+15:25:53 during the 15-psi section. COOLDOWN RATE read −109 F/hr (`c04b.png`).
- "Shutdown Cooling Not In Service — RHR Not Aligned in Mode 4 or 5" came in at T+15:27:56. It was not mentioned either.
- The text says the alarm comes from "one big jump", so I thought I had done something wrong. The step still ticked at 120 psi / 346 °F.
- **What would have unstuck me:** say that near the bottom a 15 psi step every 6 minutes can still touch 100 °F/hr, and whether to slow down or ignore it.
- **Measured:** the reviewer's own numbers: 34 entries in 139 plant-min is 4.1 plant-min apart, not the 6.8 its wall-clock arithmetic gave. The stair at 246 s reproduces 139.0 plant-min and a tile peak of -117 °F/hr with the alarm raised; at 300 s -99.8 °F/hr, raised; at the card's 360 s -87 to -89. A player who holds while the tile reads over 60-85 °F/hr is not saved (-99 to -111 °F/hr): the tile lags 600 s.
- **Verdict:** narrowed — the schedule holds at 6 plant-minutes; the reviewer timed by wall seconds ("6 seconds at 60×") and achieved 4.1. Fixed: the note says to time it on the plant clock and that 4 plant-minutes apart sets off the alarm; injection `cooldown_4min_waits` proves the rate check sees that spacing.

**S-5 — cooldown step 11: at the suggested 600×, the subcooling watch is not humanly followable.**
> "Keep COOLDOWN RATE under 100 °F per hour… The spray is still running and keeps taking SUBCOOLING MARGIN down: if it falls below 20 °F, press OFF under SPRAY now." Suggested time warp: 600×.

- **What I did:** set HX SPLIT to 9 % and polled every 4 s wall, which is 40 plant-minutes at 600×.
- SUBCOOLING MARGIN read 96 → 64 → 27 → 22 → 20 → 19 °F while pressure fell 224 → 16 psi.
- I pressed OFF under SPRAY at 19 °F; margin then read 26 °F. The whole window between 22 °F and 19 °F lasted under 10 s of wall time.
- **What would have unstuck me:** turn the spray off as its own substep before the 600× wait. Or suggest 60× for this step.
- **Measured:** a player reading every 4 s of wall at the card's speed (600×: one read per 40 plant-min) on the old card: Low Subcooling Margin raised in step 11, spray shut at 7263 s with PRIMARY PRESSURE 17.2 psia (injection `cooldown11_old_watch`).
- **Verdict:** confirmed. Fixed: 11a is the spray-off, at 30 °F, at 60×; 11b is the 600× wait. Same reader: shut at 2406 s, margin low 29.2 °F, no alarm. Shutting it at the step's start instead drives pressure to 593 psia, over the RHR limit, and step 15 strands — the note now says so.

**S-6 — startup step 5: count target not reachable in most of the stated rod band.**
> "5a Hold CONTROL WITHDRAW at MED until CONTROL ROD POSITION reads 80 to 100 and SOURCE RANGE reads 7.0e2 or more."

- **What I did:** stopped at 85. SOURCE RANGE sat at 5.2e2–6.1e2 for 3 plant-minutes and never reached 7.0e2.
- I pulled on to 98. Counts averaged about 6.7e2, and 5a ticked on one noisy 7.1e2 sample.
- A player who stops early in the 80–100 band waits indefinitely.
- **What would have unstuck me:** "if SOURCE RANGE stays under 7.0e2, keep pulling toward 100".
- **Measured:** chain route: SOURCE RANGE 697 cps at bank 87 (7 single taps past 80, 9.9 plant-min). The reviewer's plant still read BORON 749 ppm, diluting (step 2 ticks anywhere in 679-759 ppm), about 30 ppm richer than the route's.
- **Verdict:** narrowed — the 80-100 window meets the count on the route; a plant still diluting from the top of step 2's band needs more of it. Develop lane: reported, not edited.

**S-7 — raise_power steps 4–8: the checks accept the band FLOOR, so the plant stays about 11 °F under the stated centre every stage.**
> e.g. step 8 title: "…settle the temperature on 578 °F"; 8b "until it settles on 578 °F"; check: "between 563 and 592 °F".

- **What I did:** pulled to the band.
  - Every stage ticked at or just above the floor: 551 (centre 556), 551 (562), 559 (570), 564 (575), 567 (578).
  - Step 5's rod pull came out at 9 steps against "about 15".
  - "Control Rods — Approaching Insertion Limit" came in at T+11:19:29 and dropped the speed to 1× ("Dropped to real time — new alarm: Control Rods — Ap…"). No text mentioned it until raise step 10, about 25 plant-minutes later.
  - This band-floor habit is what set up S-1.
- **What would have unstuck me:** "keep pulling after Continue lights until the temperature reaches about 578", or tick nearer the centre.
- **Measured:** built pool: stages 4-7 grade the band their own ask names (4: 549.5-575.6 °F, "550 to 576"; 5: 550.4-582.8; 6: 558.5-585.5; 7: 563.9-585.5), so a floor tick there is what the card says. Step 8 does not: "settle on 578 °F" graded 563.4-592.2 °F, done at 564.0 °F on the old card (chain floor-stopper). The tile's green band is narrower than stages 4-7's graded bands (±5 °F about the program).
- **Verdict:** confirmed for step 8, refuted for 4-7. Fixed with S-1; new route check "a step that says settle on N °F completes within 5.4 °F of N".

**S-8 — cooldown step 16: substep order.**
> "16a Press FAST on the ROD CONTROL card, then click INSERT under SHUTDOWN once…" … "16d If SCRAM on the ROD CONTROL card reads PRESS TO RESET, press it once." … note: "If SHUTDOWN ROD POSITION already reads 0, the bank is in: go on to 16b."

- **What I did:** 16a was already ticked because the scram had put the bank in.
- If it had not been, the INSERT in 16a would be pressed while the trip was still latched. By the text's own heatup note, no rod moves while the trip is latched. The reset only comes at 16d.
- The "already reads 0" hint is printed below 16d, not beside 16a.
- **What would have unstuck me:** put the SCRAM reset first and the "already 0" note next to 16a.
- **Measured:** the rod drive refuses any bank command while the trip is latched (`ROD DRIVE BLOCKED`, `engines/pwr2/pwr2_engine.js`). On the chain the scram has the bank at 0 before step 16; the standalone cooldown starts unscrammed.
- **Verdict:** confirmed (order and hint placement). Fixed: the reset is 16a; "if it already reads 0" sits in 16b with the INSERT.

---

## 3. Per-step log

Times are sim (T+) and wall. "Arrival" means the step was already satisfied when it opened. Screenshots are named `<prefix><step>[a–e].png`.

### pwr_heatup #1 — `h01…h18`

| Step | First sentence | What I did | Sim / wall | Lit? | Notes |
|---|---|---|---|---|---|
| 1 | Confirm the plant is cold and shut down. | nothing | arrival | yes | 5 "expected" alarms shown acknowledged; the text explained them. |
| 2 | Start the reactor coolant pumps. | ON on the RCP FLOW card (diagram) | T+0:00 → 0:52 / <1 min | yes | Single substep with no letter. |
| 3 | Withdraw the shutdown bank all the way out. | FAST, SHUTDOWN WITHDRAW once | 0:59 → 10:05 / 25 s | yes | Speed jumped to 60× by itself, back to 1× at the tick. Text says SCRAM may read "PRESS TO RESET"; it read "PRESS TO ARM". |
| 4 | Confirm the turbine is tripped, nothing to press. | nothing | arrival | yes | |
| 5 | Put steam generator level control in AUTO… | AUTO on SG FEED | instant | yes | |
| 6 | Confirm the STEAM DUMP is closed… | nothing | arrival | yes | "the % beside the STEAM DUMP valve on the diagram": there are several % labels near the top valves. |
| 7 | Open the letdown orifices… | A+B 7 % | instant | yes | 7b repeats 7a. |
| 8 | Put pressurizer spray in service… | AUTO under SPRAY | instant | yes | The "more than 1300 psi below" figure matched the board (1700 vs 363). |
| 9 | Raise PRIMARY PRESSURE to the 665 psi accumulator window… | AUTO under HEATER, wait | 11:07 → 54:46 / 15 s | yes | Auto 600×, then held at 1× ("Held at real time — the plant needs you here"). **Alarm "Shutdown Cooling Not In Service — RHR Not Aligned in Mode 4 or 5" at T+00:32:13, not mentioned.** |
| 10 | Open the accumulator valve… | clicked the valve inside the pulsing ring | 12 s | yes | Easy to find. |
| 11 | Heat the plant to 542 °F on pump heat alone. | wait | 0:55 → 6:04 / 17 s | yes | Auto 3600×. **Landed at 552 °F** (10 °F past). STEAM PRESS was 1056, already above the 1020 setpoint, and ATMOS DUMP was already open 7 %. Pressure Low alarms were forewarned. **"Turbine Trip / Low Steam Demand" was not mentioned** (explained only at startup step 1). Background says PZR level rises; it went 33 → 30 %. |
| 12 | Confirm letdown now leaves only through the orifices. | nothing | arrival | yes | The LETDOWN card lamp reads CLOSED while A+B 7 % is lit and 11 gpm flows. |
| 13 | Hand STEAM PRESS to the steam dump to hold. | AUTO on STEAM DUMP | instant | yes | Text says "up toward 1020" but the board was already at 1056 with ATMOS DUMP open (the thing the background warns about). |
| 14 | Bring PRIMARY PRESSURE up to normal operating pressure. | SET PZR PRESSURE 2235 + Enter | 6:04 → 6:30 / 6 s | yes | The TRIP BLOCKS button turned amber; not explained. |
| 15 | Confirm Hot Standby. | nothing | arrival | yes | |
| 16 | Confirm the reactor stayed shut down. | wait | 6:31 → 6:41 / 70 s | yes | "watches it for ten plant-minutes" was helpful. |
| 17 | Confirm the heatup made no fission power. | nothing | arrival | yes | |

### pwr_startup — `s01…s18`

| Step | First sentence | What I did | Sim / wall | Lit? | Notes |
|---|---|---|---|---|---|
| 1 | Verify the plant is in Hot Standby (Mode 3). | nothing | arrival | yes | Explains the Turbine Trip alarm that had been up since heatup 11. |
| 2 | Dilute boron to the estimated critical concentration, 719 ppm. | typed 719 + Enter in the BORON box | 6:42 → 7:58 / 20 s | yes | The box is labelled only "0-2500 ppm"; I guessed it was "the boron target". Ticked at **749** ppm (band 679–759), not 719, while still diluting. |
| 3 | Line up the steam generator (SG)… | nothing | arrival | yes | |
| 4 | Take the 1/M baseline point before any rod moves. | 1/M PLOT → Plot point | 20 s | yes | BORON STATUS still read "DILUTING 28→" (749 ppm) at the baseline. The popup covers the top-right tiles. |
| 5 | Take the second 1/M point, after the first rod pull. | MED, held WITHDRAW 0 → 85 → 98 | 7:59 → 8:07 / 2.5 min | yes | **S-6.** |
| 6 | Take the third 1/M point. | held to 160, Plot point | 8:07 → 8:11 / 1 min | yes | Panel: "predicted criticality ≈ step 233 (37.2% withdrawn)". |
| 7 | Take the fourth 1/M point, after a shorter pull. | held to 192, waited, Plot | 8:11 → 8:14 / 2.5 min | yes | SUR +0.50 → +0.03 took about 2.5 plant-min at 1×; no time was given for this step. Prediction ≈ 215. |
| 8 | Take the final 1/M point… | held to 200, waited, Plot | 8:14 → 8:19 / 1 min | yes | Prediction ≈ 207, 1/M = 0.046. Matched the text's "three to three and a half" plant-minutes. |
| 9 | Take the reactor just critical. | SLOW, held to 204, then 6 single taps | 8:19 → 9:28 / 9.5 min | yes | **S-3.** SOURCE RANGE blanked above 1e5 as warned. |
| 10 | Let power rise from critical with the rods still. | wait | 9:28 → 10:12 / 5 min | yes | Matched "30 to 60 plant-minutes". |
| 11 | Let power climb to 0.5 %. | closed the 1/M ✕, wait | 10:13 → 10:36 / 5 min | yes | Matched "15 to 25 plant-minutes". |
| 12 | Let power level itself off below 5 %. | wait | 10:36 → 11:00 / 3 min | yes | Levelled off at 1.0 %. |
| 13 | Raise power past 5 %, into Mode 1, At Power. | SLOW, held 210 → 223 | 11:00 → 11:04 / 1 min | yes | |
| 14 | Put the turbine on line… | LATCH, LOAD 10 + Enter | 11:04 → 11:06 / 30 s | yes | Alarm list cleared. |
| 15 | Block the first startup trip, IR HIGH FLUX. | waited for 9.7 %, TRIP BLOCKS, BLOCK | 11:06 → 11:07 / 1 min | yes | The panel covers the PZR card. Rows carry unexplained "RELEASED BY THE PLANT" text. |
| 16 | Block the second startup trip, PR HIGH (LOW SETPT). | TRIP BLOCKS, BLOCK, TRIP BLOCKS | instant | yes | Header "2 of 4 BLOCKED · 2 WAITING ON ITS PERMISSIVE" matches no row. |
| 17 | Verify the plant is in Mode 1, At Power. | nothing | arrival | yes | |

### pwr_raise_power — `r01…r13`

| Step | First sentence | What I did | Sim / wall | Lit? | Notes |
|---|---|---|---|---|---|
| 1 | Confirm the plant the startup handed over is ready to climb. | nothing | arrival | yes | |
| 2 | Make sure the turbine is on line and taking steam. | nothing | arrival | yes | |
| 3 | Start the boron dilution that carries most of the climb. | 660 + Enter | instant | yes | |
| 4 | Take the first stage to 30 MWe… | LOAD 30; MED pulls whenever Tavg < 552 | 11:09 → 11:14 / 2 min | yes | 9 steps, not "about 20" (the text warned boron does part). Ticked at 551 °F. The "green band on the tile" is a thin strip under the trend line (`r04_tile.png`). |
| 5 | Take the second stage to 50 MWe the same way. | LOAD 50; pulls | 11:15 → 11:20 / 2 min | yes | **S-7.** Insertion-limit alarm, unexplained. |
| 6 | Take the third stage to 75 MWe… | LOAD 75; 23 steps | 11:20 → 11:26 / 1 min | yes | Ticked at 559 (floor 558). |
| 7 | Take the fourth stage to 90 MWe… | LOAD 90; 18 steps | 11:26 → 11:31 / 40 s | yes | Ticked at 564 (floor 564). |
| 8 | Take the last stage to full load and settle the temperature on 578 °F. | LOAD 100; 7 steps | 11:31 → 11:33 / 25 s | yes | Ticked at **567**, not 578. |
| 9 | Confirm full power, with the boron dilution done. | waited at 1× for BORON ≤ 663 | 11:33 → 11:35 / 2.5 min | yes | Power drifted to 102.8 %, near the 103 % stop. |
| 10 | Start giving back the reactivity xenon takes, rods first. | waited, then pulled 4 + 6 against the text | 11:35 → 11:44 / 8 min | yes | **S-1.** |
| 11 | Give boron its first small dose as xenon builds. | nothing | arrival | yes | |
| 12 | Hold full power on program while xenon builds. | nothing | arrival | yes | "Keep trimming for the next two plant-days", then the walkthrough ends. "the settled point measures 612.3 ppm; 617 is the target you dial toward" reads like a developer note. |
| end | | | 11:44:38 | | The card says "CONTROL ROD POSITION about 318 of 627"; the board read 296. |

### pwr_lower_power — `l01…l07`

| Step | First sentence | What I did | Sim / wall | Lit? | Notes |
|---|---|---|---|---|---|
| 1 | Start adding boron before any load comes off. | 719 + Enter | instant | yes | |
| 2 | Take the first load off the turbine… | LOAD 75 | 15 s | yes | OUTPUT stepped straight to 75 (on the way up it ramped). |
| 3 | Bring AVG COOLANT TEMPERATURE back into its band with the rods. | set 5× myself; 5 × 3-step inserts | 11:45 → 11:50 / 1.3 min | yes | Tavg peaked 589 °F. Pressure 2144, matching the text's "about 2140". "Insert … in pulls" is odd wording. |
| 4 | Take the load down to 50 MWe… | LOAD 50; 7 inserts | 11:51 → 11:58 / 1.7 min | yes | Speed went back to 1× by itself mid-step. |
| 5 | Take the load down to 30 MWe… | LOAD 30; 6 inserts | 11:58 → 12:03 / 1.5 min | yes | The page kept resetting my 5× to 1× mid-substep. |
| 6 | Take the load down to 15 MWe… | LOAD 15; 4 inserts | 12:03 → 12:07 / 1 min | yes | Ended at 14.2 %. |

### pwr_shutdown — `d01…d04`

| Step | First sentence | What I did | Sim / wall | Lit? | Notes |
|---|---|---|---|---|---|
| 1 | Take the load off the generator before the scram. | LOAD 0 | instant | yes | |
| 2 | Shut the reactor down. | SCRAM ×2 (arm, trip) | 4 s | yes | Alarms: Reactor Trip — Manual Trip, Pressurizer Pressure Low, Turbine Trip — none forewarned (the trip is obvious). |
| 3 | Put the decay heat on the steam dump: Mode 3, Hot Standby. | nothing | arrival | yes | "Press AUTO … until its status reads PRESS": it already did, and the text has no "if not already". |

### pwr_cooldown — `c01…c17`

| Step | First sentence | What I did | Sim / wall | Lit? | Notes |
|---|---|---|---|---|---|
| 1 | Add the boron a cold core needs before any cooling starts. | 920 + Enter | 12:08 → 13:10 / 20 s | yes | 62 plant-min against "about 54". |
| 2 | Bring pressure under the point where the low-pressure protection can be blocked. | SET PZR PRESSURE 1900 | 10 s | yes | |
| 3 | Block the protection that would read the cooldown as a leak. | TRIP BLOCKS, BLOCK ×2, close, ECCS STOP | 30 s | yes | At 1940 psi the PZR PRESS LO-LO row still read "RELEASED BY THE PLANT — pressure rose above the shutdown permissive" while the header said "2 AVAILABLE TO BLOCK NOW". STOP looked lit already. |
| 4 | Cool the plant on the steam dump to where RHR can take over. | 34 DUMP SETPOINT entries | 13:11 → 15:30 / 3.7 min | yes | **S-4.** 2.3 plant-h against "three and a half hours". |
| 5 | Take the pressure setpoint to the bottom of its range. | SET PZR PRESSURE 1700 | 8 s | yes | |
| 6 | Hand pressure control from the heaters to the spray. | HEATER OFF; SPRAY box 50, MANUAL | 15 s | yes | Unclear whether to set the box before or after pressing MANUAL. Fell about 14 psi/s wall at 1×. |
| 7 | Isolate the accumulators while pressure is inside their window. | clicked the valve | 9 s | yes | The location hint is accurate. |
| 8 | Bring pressure under the RHR limit on the spray. | wait | 15:33 → 15:44 / 20 s | yes | Matched "10 to 13 plant-minutes". PZR level did not climb (26–27 %) as step 6 said it would. |
| 9 | Put RHR in service as the cooldown loop. | ALIGN, HX SPLIT 7 | 10 s | yes | |
| 10 | Take the reactor coolant pumps off now that RHR is circulating. | OFF on RCP FLOW | 15 s | yes | |
| 11 | Cool on RHR into Mode 5, inside the 100 °F per hour limit. | HX SPLIT 9; spray OFF at subcooling 19 °F | 15:45 → 18:06 / 20 s | yes | **S-5.** |
| 12 | Shut the spray now that the plant is cold. | nothing | arrival | yes | |
| 13 | Confirm the plant is in Mode 5, Cold Shutdown. | nothing | arrival | yes | |
| 14 | Confirm the accumulators are still full and isolated. | nothing | arrival | yes | |
| 15 | Confirm RHR is carrying the heat. | nothing | arrival | yes | |
| 16 | Leave the plant lined up for the next heatup. | CLOSE, 1020, SCRAM reset | 12 s | yes | **S-8.** |

### pwr_heatup #2 (from cooldown end) — `h2_01…h2_end`

| Step | What I did | Sim / wall | Lit? | Notes |
|---|---|---|---|---|
| 1 | nothing | arrival | yes | 195 °F, 17 psi (the preset had 122 °F, 363 psi). |
| 2 | RCP ON | 12 s | yes | **S-2 begins.** |
| 3 | FAST, SHUTDOWN WITHDRAW | 18:08 → 18:17 / 30 s | yes | **Low Subcooling Margin** banner; Tavg 204, subcooling 25 °F. |
| 4–8 | nothing / SPRAY AUTO | arrival | yes | Every lineup was left over from the first heatup (SG FEED AUTO, orifices open). |
| 9 | HEATER AUTO, wait | 18:22 → 19:57 / 1.5 min | yes | 18 → 667 psi in 1 h 35 min, matching the text. Subcooling recovered to 149 °F. |
| 10 | accumulator valve | instant | yes | |
| 11 | wait (3600×) | 19:57 → 24:07 / 37 s | yes | Overshot to 551 °F again. |
| 12–14 | nothing / DUMP AUTO / 2235 | ~1 min | yes | |
| 15–17 | nothing / 10-min watch | 66 s | yes | End card: complete at T+24:44:23. The ECCS card still shows STOP lit from cooldown step 3; no heatup step re-arms it. |

---

## 4. Words and numbers vs the board

| Walkthrough said | Board actually showed |
|---|---|
| "If SCRAM … reads PRESS TO RESET" (heatup 3) | `SCRAM / PRESS TO ARM`: nothing to reset on the preset start. |
| "Set the boron target" / "BORON target" | The box is labelled only `0-2500 ppm` on the BORON card. The reading is `BORON CHEM`. |
| "BORON reads 663 ppm or below" | The label is `BORON CHEM`. |
| "the % beside the STEAM DUMP valve on the diagram" | Several unlabelled `0 %` numbers sit near the top-row valves. |
| "letdown now leaves only through the orifices … about 11 gpm" | The LETDOWN card lamp reads **`CLOSED`** while `A+B 7%` is lit and `LETDOWN 11 gpm`. |
| "STEAM PRESS climbs toward 1020 psi" / "Pump heat has brought STEAM PRESS up toward 1020 psi" | `STEAM PRESS 1056 psi` and ATMOS DUMP already at 7 % when the step opened. |
| "PRESSURIZER LEVEL rising as the water expands" (heatup 11) | `33 %` → `30 %`. |
| "the plant is in Mode 1, At Power" (raise 1a) | I saw no Mode indicator on the board; the check ticked anyway. |
| "The green band on the tile" | A thin coloured strip under the trend line with a white tick for the reading (`r04_tile.png`). Readable, but only at the band edge is it clear which side you are on. |
| "settle the temperature on 578 °F" | Ticked at `567 F`. |
| "AVG COOLANT TEMPERATURE near 580 °F" (raise 10) | Ticked at `574 F`. |
| End card "CONTROL ROD POSITION about 318 of 627" | `296 /627`. |
| "TRIP BLOCKS … 2 WAITING ON ITS PERMISSIVE" (panel header) | Every row read either `BLOCKED` or `RELEASED BY THE PLANT`; none said waiting. |
| PZR PRESS LO-LO row at 1940 psi: "RELEASED BY THE PLANT — pressure rose above the shutdown permissive" | Pressure was **below** the 1972 psi permissive, and the header said "2 AVAILABLE TO BLOCK NOW". |
| "Cooldown Rate High" from "one big jump" | Came in with 15 psi steps; `COOLDOWN RATE -109 F/hr`. |
| "At 50 % pressure falls about 3 psi a second" | About 14 psi per wall-second at 1× (1714 → 1601 in 8 s). |
| "About three and a half hours in all" (cooldown 4) | 2 h 19 min of plant time. |
| "about 54 plant-minutes to 880 ppm" | 62 plant-min (from 716 ppm). |
| "Control Rods — Insertion Limit alarm (ROD LIMIT LO-LO)" | The board alarm text is `Control Rods — Insertion Limit` and `Control Rods — Approaching Insertion Limit`. The string "ROD LIMIT LO-LO" appears nowhere I saw. |
| Unmentioned alarms | `Shutdown Cooling Not In Service — RHR Not Aligned in Mode 4 or 5` (heatup and cooldown); `Turbine Trip / Low Steam Demand` (heatup 11 until startup 1); `Control Rods — Approaching Insertion Limit` (raise 5); `Low Subcooling Margin` (heatup #2 step 3); `Pressurizer Pressure Low` (shutdown 2). |

---

## 5. What the text got right

- Every leg's end card offered `Next: … ▸` and carried the same plant forward.
- The self-setting time warp (up for waits, back to 1× at the hold, with `#warpInfo` "Held at real time — the plant needs you here").
- The heatup step 9 time estimate ("about an hour and a half" from the cooldown).
- The SOURCE RANGE shorthand explanation ("7.0e2 is 700 counts a second").
- The 1/M timing notes for steps 6 and 8, and the plot's printed prediction (233 → 215 → 207).
- The startup-rate reading guide in step 9 (the 0.01 / 0.02–0.05 / 0.06–0.10 buckets matched what I saw).
- The step 10 and 11 power-rise durations (44 and 23 plant-min, inside the stated 30–60 and 15–25).
- The trip-block power window (≥ 9½ %) and the warning that the panel covers the rod buttons.
- "Load first, rods second" and the pressure-sag figure in lower_power step 3 (2144 vs "about 2140").
- The SCRAM two-press description (arm, then trip) and "PRESS TO RESET" afterwards.
- The accumulator valve location hints in both directions (pulsing ring; "just above the ACCUMULATORS tile").
- Cooldown step 8 and step 11 durations (11 plant-min; 2 h 21 min against "about two and a quarter hours").
- The cooldown step 16 background on why the dump must be closed and reset to 1020 psi, which is exactly what the second heatup needed.

---

## 6. Coordinator's verification — the rest (2026-09-26)

- **ECCS STOP.** PWR2 publishes no ESF arm, so the card lights STOP whenever the pump is idle and no
  injection signal stands — at every initial condition, not only after a cooldown. MEASURED at full
  power: a leak (`large_loca` 0.02 / 0.2) actuated safety injection at 148 s / 17.5 s and ran the pump
  at 0.088 / 0.151 of rated flow, identically with and without STOP pressed. The cooldown's two SI
  blocks read unblocked by the end of the second heatup (new route check). **Refuted** as a safety
  seam; cooldown step 3's Background rewritten.
- **End card "about 318".** The reviewer's board read 296; routes 297-308. Now "about 300", with the
  bank arithmetic in steps 10-11 and the outcome ("about 300 steps").
- **Un-forewarned alarms** — each measured raised on the route in the step named, then forewarned
  there: Shutdown Cooling Not In Service (heatup 9b, ~600 psi; cooldown 4, entering Mode 4), Turbine
  Trip / Low Steam Demand (heatup 11), Control Rods — Approaching Insertion Limit (raise 5b, raised at
  stage 6 on the routes, stage 5 for the reviewer), Low Subcooling Margin (heatup 2a, from a seam under
  25 psi).
- **First heatup overshoot** (reviewer 552 °F against 542 at 3600×; route 545.7 °F): not changed.
- **Not measured:** the LETDOWN card's CLOSED lamp with 11 gpm through the orifices; the TRIP BLOCKS
  header "2 WAITING ON ITS PERMISSIVE" with no such row, and the LO-LO row's text at 1940 psi; whether
  the browser applied startup 9b's 10×. Board defects, reported for a board pass.
