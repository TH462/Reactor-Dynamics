> **Record, not policy.** A fresh-agent layman pass of the six-leg PWR chain (Mode 5 → 100 % → Mode 5), played in headless Edge on 2026-10-02 on tree `badfa0bb` (#818 package H's verification). **6 of 6 legs completed**, no hard strand. Stuck points: S-1 the 1/M point 2 did not tick on a touch of 7.0e2; S-2 an unannounced Pressurizer Pressure Low in the 30→50 MWe climb; S-3 three numbers for one spray action; S-4 Raise Power step 8 ticked at 574 °F under a text saying "settles on 578"; S-5 a promised relief-valve alarm "never came"; S-6 an unannounced insertion-limit alarm in the rampdown; S-7 a press on an already-lit AUTO, and stale hover help; S-8 a "stale" speed-bar status line; S-9 codes and jargon undecoded.
>
> **What was refuted, with the number.** **S-8**: `#warpInfo` was EMPTY at both stamps the reviewer cites (its own probe reads `warp=` blank at T+11:07:30 and T+11:07:39, `out/d3.txt`, `out/d4.txt`); the "Dropped to real time — new alarm: …" text it quoted came from `body.innerText` picking up the faded `#appToast` (opacity 0, text kept). **S-5**: the relief valve does lift in step 2 — `porv_open` raised at 2245 psia (standalone) and 2241 psia (chain) on the authored route; the PORV opens at 100 psi over the setpoint (`pwr2_pressurizer.js`, `porv_open_psi: +100`), and step 2 drops the setpoint 254 psi under the reviewer's own 2154 psi, so it lifted there too and the poll missed it. **Contaminated**: the reviewer's harness lowered HX SPLIT 8→6 in cooldown step 11; its step-11/13 timing is set aside, but its 267 psi at step 13 matched the authored chain (277 psia) — the card's "about 150 psi" was wrong on both routes (standalone 176 psia).
>
> **How it was measured.** Wording claims against the BUILT pool (`RD.MANUAL_PROCEDURES.pwr2`). Behaviour on `run_walkthrough_routes` (typical, mistake and chain routes, seed 42, full live runtime) on `badfa0bb`, plus the `band_floor` job for raise power; code reads named in each line. Numbers are the tile's own (psia = MPa × 145.04, which is what PRIMARY PRESSURE prints).
>
> **Fixed** in `exp/ux-h` (see each Verdict). **Not changed**: plant physics; step 16's 8.5 % (owner ruling #670 "A").

# Layman playthrough — six PWR walkthroughs, build badfa0bb

Persona: intelligent layman, no nuclear background. Only the walkthrough panel and the board were used. Headless Edge driven via `go.sh`. One continuous plant, chained via each completion card's "Next:" button, from T+00:00 to T+18:18 plant time. Wall time was about 95 minutes.

Setup note: the driver page started at `about:blank`. I navigated to `shell.html?engine=pwr2` myself before starting.

## 1. Outcome

| Leg | Result | Steps completed | The one thing that mattered |
|---|---|---|---|
| pwr_heatup (Startup Part 1) | COMPLETE, T+00:00 → T+06:32 | 17/17 | Nothing stalled. Every action line names the exact button. The accumulator valve (a diagram symbol, not a button) was findable from "just above the ACCUMULATORS tile" plus the pulsing box. |
| pwr_startup (Startup Part 2) | COMPLETE, T+06:32 → T+09:49 | 18/18 | Step 5's 1/M point did not tick after the hold reached 7.0e2 (the count fell back to 6.7e2 on average). The step's own fallback ("tap WITHDRAW one step and wait half a plant-minute") fixed it on the first tap. Every rod-position and time prediction in this leg was right. |
| pwr_raise_power (Startup Part 3) | COMPLETE, T+09:49 → T+10:40 | 9/9 | An UNANNOUNCED "Pressurizer Pressure Low" alarm during the 30→50 MWe climb dropped the clock to real time. Step 8 ticked at 574 °F although its text says pull "until it settles on 578 °F". |
| pwr_lower_power (Shutdown Part 1) | COMPLETE, T+10:40 → T+11:07 | 6/6 | An unannounced "Control Rods — Approaching Insertion Limit" alarm at LOAD 55 dropped the warp. Rod-step counts ran below the text's estimates on every stage. |
| pwr_shutdown (Shutdown Part 2) | COMPLETE, T+11:07 → T+11:08 | 3/3 | Nothing stalled. Two red/amber alarms (Manual Trip, Turbine Trip / Low Steam Demand) came in unannounced. |
| pwr_cooldown (Shutdown Part 3) | COMPLETE, T+11:08 → T+18:18 | 16/16 | Step 11 gives three numbers for when to shut the spray (32, below 30, and "any earlier and pressure climbs back"). Step 2's promised "Pressure Relief Valve Open" alarm never came. |

The full round trip, Mode 5 → Mode 1 at 100 % → Mode 5, was reached using the walkthrough text alone. No step hard-stranded me.

## 2. Stuck points, ranked by severity

None was a hard block. These are the places where a layman would hesitate, act wrongly, or do something the text did not say.

**S-1 — Startup step 5: the count target is reached but the check does not tick.**
- Step text: "Press MED, then hold CONTROL WITHDRAW until SOURCE RANGE reads 7.0e2 or more, then watch it for 5 seconds: the count jumps about 15 % either way."
- What I did: held WITHDRAW for 10.2 s wall. SOURCE RANGE touched 720 at rod 71 and I let go. Over the next 5 s it read 670–690. The panel showed "Average over the last 30 plant-seconds: 6.7e2 (666 counts per second)" and 5a stayed open.
- The text's "If it only touches 7.0e2 now and then … tap WITHDRAW one step and wait half a plant-minute" covered it. One tap (rod 73) gave 730 and the check ticked.
- What would have unstuck me sooner: put the rule in the action line itself ("hold until it reads 7.0e2, let go, and tap one more step if the average shown below stays under 7.0e2"). As written, the instruction to act is in the grey prose under the action line.
- **Measured:** Built pool: 5a grades `sr_counts_cps >= 695` as a 30-plant-second MEAN (`mean_s: 30`), so a touch of 720 is not a tick by design. Route `flicker_release_5` (release at bank 69 on a noisy 7.0e2, 1x) is this exact player and completes on the note's tap-and-wait recovery; the typical chain lands 5a at bank 78, 706 cps.
- **Verdict:** narrowed — the observation stands (720 touched, average 666, no tick), the behaviour is designed and gated; the defect was that the recovery lived in the grey note. FIXED: the action line now carries it ("If the 30-second average shown below stays under 7.0e2, tap WITHDRAW one step and wait half a plant-minute").

**S-2 — Raise Power step 5: an alarm the text never mentions stops the clock.**
- Step text (step 5 mentions only the insertion-limit alarm): "Control Rods — Approaching Insertion Limit can come in from this stage on…"
- What happened: at T+10:04:01, during the 30→50 MWe climb, "Pressurizer Pressure Low" came in. PRIMARY PRESSURE read 2106 psi and PRESSURIZER LEVEL 21 %. The status line read "Dropped to real time — new alarm: Pressurizer Pressure Low". The alarm carried no "predicted by step" tag, unlike the alarms in heatup steps 9 and 11 and raise-power step 6.
- What I did: nothing (the text gives nothing to do). The climb continued at 1× until 5b ticked.
- What would have unstuck me: one sentence in step 5 (or 4) saying the low-pressure alarm can come in while load climbs, and that it clears.
- **Measured:** Not reproduced. `pzr_pressure_low` (setpoint 2149 psia, 14.82 MPa) was not raised in raise-power step 5 on any measured route: typical standalone low 2255 psia, chain 2232 psia, `band_floor` (pulls stop at each band floor, the reviewer's style) 2255 psia. The reviewer's step 4 sagged Tavg to 537 °F; the deepest measured route sag is 548.3 °F, 11 °F shallower.
- **Verdict:** narrowed — the alarm the reviewer saw is real on its route (a deeper sag), not on the authored ones; whether a deeper sag is reachable by a literal reading is an open plant/route question. FIXED (display only): step 5 now names it conditionally ("If AVG COOLANT TEMPERATURE sags well below its band while OUTPUT climbs, Pressurizer Pressure Low can come in") and lists `pzr_pressure_low` in `predicts_alarms`; warp behaviour unchanged.

**S-3 — Cooldown step 11: three different numbers for one spray action.**
- Step text: "11b Wait for SUBCOOLING MARGIN to fall to 32 °F." · "The spray keeps taking SUBCOOLING MARGIN down … Shut it any earlier and pressure climbs back over the RHR limit." · "11c When SUBCOOLING MARGIN reads below 30 °F, press OFF under SPRAY".
- What I did: pressed SPRAY OFF at 29 °F (T+16:18:56). At 60× the margin sat on "30" for about 1 s of wall time.
- What would have unstuck me: one number. "Wait for SUBCOOLING MARGIN to read 29 °F, then press OFF under SPRAY."
- **Measured:** Built pool: 11b ticks below 32.5 °F (`subcooling_c < 18.0555`), 11c asks for OFF "below 30 °F", 11b's note says "any earlier" and names the 20 °F alarm. The two rows are deliberate (source comment: a row AT the press threshold stranded the step, route `spray_off_at_entry`, 465 plant-min). Re-measured on the authored route: typical spray OFF fired at 2406 s into step 11, margin low 28.5 °F, no Low Subcooling Margin alarm; chain low 31.4 °F.
- **Verdict:** confirmed (wording) — three numbers with unstated roles. FIXED without moving a threshold: 11b reads "fall to 32 °F, then get ready: the spray comes off at 30 °F, on the next line"; the note says 20 °F is the alarm if it is left on, and "much earlier than 30 °F" for the too-early case. 30 °F is the one action number.

**S-4 — Raise Power step 8: ticks before the target the text names.**
- Step text: "If AVG COOLANT TEMPERATURE reads below 573 °F, withdraw at MED in 5-step pulls a plant-minute apart until it settles on 578 °F, 10 to 20 steps."
- What happened: 8c ticked at 574 °F after 15 steps. The grader line reads "between 573 and 583 °F (near 578)". A careful player following the text would keep pulling toward 578. REACTOR POWER already read 102.0–102.1 %, beside the step's own warning that "Above 103 % REACTOR POWER the plant stops rod withdrawal".
- What would have unstuck me: say "until it reads 573 °F or more" (what is graded), or say what REACTOR POWER should read at 100 MW. 102 % next to a 103 % stop is alarming.
- **Measured:** Built pool: 8c grades 573-583 °F; the ask said "until it settles on 578 °F". Typical route: tick at 578.4 °F, power 101.36 %; chain: tick at 573.8 °F with REACTOR POWER 103.14 %, then step 9 settles it at 580.5 °F / 101.29 % (standalone 579.9 °F / 100.60 %).
- **Verdict:** confirmed — the line ticks at the band floor while the text names the centre, and power at the tick can sit at the 103 % rod stop. FIXED: the ask now says "until it reads 573 °F or more ... step 9 carries it the rest of the way to 578 °F", and the note says power "can read up to about 103 % just after the step to 100 MW, then settles near 101 %".

**S-5 — Cooldown step 2: the promised alarm never appears.**
- Step text: "Pressure Relief Valve Open and Pressurizer Pressure Low come in as pressure falls: expected. The relief valve lifts for about ten plant-seconds and closes by itself."
- What happened: only Pressurizer Pressure Low came in. PORV read CLOSED throughout, and the step ticked within 7 plant-seconds. Step 5 then says "Pressure Relief Valve Open comes in again … as in step 2". It did come in at step 5, but for the first time, not "again".
- What would have unstuck me: say "may come in" in step 2, and drop "again … as in step 2" from step 5.
- **Measured:** `porv_open` RAISED in cooldown step 2 at 2245 psia (typical) and 2241 psia (chain), and again in step 5 (1892 / 1901 psia). Mechanism: PORV lifts at +100 psi over the pressure setpoint (`pwr2_pressurizer.js` `porv_open_psi`); step 2 drops the setpoint to 1900 psi, 254 psi under the reviewer's 2154 psi.
- **Verdict:** refuted — the valve lifts on every route; the reviewer's 184 psi in about 7 plant-seconds is consistent with it, and the alarm stands only seconds, between polls. Step 2 and step 5 ("again") left as written.

**S-6 — Lower Power step 4: an insertion-limit alarm the leg never mentions.**
- Step text (step 4) has no mention of rod alarms.
- What happened: at LOAD 55 (T+10:52:40) "Control Rods — Approaching Insertion Limit" came in and the warp dropped to real time. Part 3 had said this alarm "clears over the following hours as xenon builds and the bank walks up", but here the bank is going DOWN. It cleared within about 2 plant-minutes.
- What would have unstuck me: one line in step 4 saying it can flicker in while you insert, and why.
- **Measured:** `rod_limit_approach` was not raised in lower-power step 4 on the typical route (full-power preset, bank 573 -> 546) or the chain (bank 286 -> 262, power 48.1 % at the tick). The reviewer's raise-power leg ended with the bank at 301 against the routes' 308-310, so its bank sat lower at LOAD 55; it reports the alarm cleared within about 2 plant-minutes.
- **Verdict:** narrowed — real on a player route that ends the climb with the bank low, not on the authored one. FIXED (display only): step 4's note names it ("can come in during these inserts if the bank ended the climb low. The limit falls with power, so it goes out by itself as the load comes off") and `predicts_alarms: ['rod_limit_approach']`.

**S-7 — Startup step 15c: "Press AUTO … again" on a button that is already lit.**
- Step text: "Press AUTO on the STEAM DUMP card again and check its status reads TAVG."
- I pressed the already-lit AUTO. The status changed STM PRESS → TAVG and the check ticked. It worked, but pressing a lit button to change a mode is not obvious. The hover scanner still read "AUTO (steam dump) — Dump follows Steam Generator (SG) pressure toward the dump setpoint" after the switch.
- What would have unstuck me: nothing (it worked). The scanner text should follow the mode.
- **Measured:** `set_steam_dump {mode:'auto'}` selects TAVG when the turbine is latched and STM PRESS when tripped (`pwr2_shell.js` 885), so the second press is required. The hover text (`pwr_board_inspect.js` `imrppqg6mcc`) was a static string describing pressure mode only.
- **Verdict:** confirmed (both). FIXED: 15c's ask says "although it is already lit: with the turbine on line, that press switches its status from STM PRESS to TAVG"; the hover help now describes both modes and that a press picks one.

**S-8 — The status line under the speed bar goes stale.**
- At Shutdown Part 2 step 2 (T+11:07) and at Cooldown step 2 (T+12:12), `#warpInfo` still read "Dropped to real time — new alarm: Control Rods — Approaching Insertion Limit". That alarm had cleared about 15 plant-minutes and over an hour of plant time earlier, respectively. A layman reads that line as current.
- **Measured:** The reviewer's probe read `#warpInfo` blank (`warp=`) at both cited stamps (`out/d3.txt` T+11:07:30, `out/d4.txt` T+11:07:39); screenshots d03/d04/d04a show no line under the speed bar. The quoted string was in `document.body.innerText` from `#appToast`, which fades to opacity 0 and keeps its text (`ui/app.js` `showToast`).
- **Verdict:** refuted for `#warpInfo` (its retirement logic, `syncWarpInfo`, held). FIXED the real residue: a faded toast now clears its text 0.3 s after the fade, so neither a screen reader nor a page-text read can quote it later.

**S-9 — Codes and jargon left unexplained (did not block an action).**
- "P-6", "P-10", "P-11" — the text calls it "the permission" and the panel says "P-6 PERMISSIVE". These are never decoded.
- Words never glossed: "orifices", "letdown", "fills the plant solid", "RHR path", "emergency injection" (why rising pressure could fire it), and "1/M". Each action line still named the exact button, so none stopped me.
- **Measured:** Built pool, first visible use per leg: P-6 in startup step 9's line (decoded only in the why); P-10 decoded in startup 16a's note; P-11 on the panel rows only, not in cooldown step 3's text; letdown/orifices (heatup 7) and 1/M (startup 4) defined only in the why; "fill solid" in heatup 7's why and step 12's aim, undefined.
- **Verdict:** confirmed (CHECKLIST_WRITING_GUIDE W1: define in the line or note, not the why). FIXED: startup 9 "at P-6, the permission to block it"; cooldown 3a note "Both rows read P-11 PERMISSIVE: P-11 is the plant's permission to block them, and it comes only below 1972 psi"; heatup 7a note defines letdown and the orifices; startup 4 note defines 1/M; "fill solid" glossed as the pressurizer full of water with no steam space.

## 3. Per-step log

Format: step — first sentence — what I did — plant time — Continue lit? — confusion / screenshot.

### Startup Part 1 (pwr_heatup), 17 steps
1. "Confirm the plant is cold and shut down." All four checks were pre-ticked and Continue was lit on entry. The clock overlaps the TEST BUILD badge at top right. (h01)
2. "Start the reactor coolant pumps." Clicked ON on the RCP FLOW card. Flow went 3 → 21 → >90 % in about 9 s wall at 1×. Lit. The hover scanner showed "ON (RCP) — Starts the reactor coolant pump". (h02–h04)
3. "Withdraw the shutdown bank all the way out." Pressed FAST, then one click on WITHDRAW under SHUTDOWN. Warp went to 60× by itself. Reached 627 at T+09:52. Lit. (h06, h07)
4. "Confirm the turbine is tripped." Pre-ticked. (h08)
5. "Put auxiliary feed in AUTO to hold steam generator level." AUTO on AUX FEED WATER; the card read RUNNING. Lit in under 3 s. (h10)
6. "Confirm the steam dump is closed." Pre-ticked. The diagram valve is labelled "DUMP", not "STEAM DUMP". (h11)
7. "Open the letdown orifices before the pressure climb shuts the RHR path." Clicked A+B 7%. Lit. Jargon was not explained. (h13)
8. "Put pressurizer spray in service before the heaters start the climb." SPRAY AUTO. Lit. "1300 psi below" checked out against the board (1700 − 363). (h15)
9. "Raise PRIMARY PRESSURE to the 665 psi accumulator window on the heaters." HEATER AUTO. Warp went to 600×. Reached 668 psi at T+54:34, and the warp then held at real time as the text said. The alarm carried a "predicted by step 9" tag. RCP FLOW read 113 % (odd). (h17)
10. "Open the accumulator valve while PRIMARY PRESSURE is inside its window." Clicked the pulsing valve symbol above ACCUMULATORS. Lit. (h18, h19)
11. "Heat the plant to 542 °F on pump heat alone." Warp went to 3600×. T+01:25 → T+06:02 took about 10 s wall. The tile read 551 °F (the text warned of up to about 10 °F overshoot). (h21)
12. "Confirm letdown now leaves only through the orifices." Pre-ticked. (h22)
13. "Hand STEAM PRESS to the steam dump to hold." Setpoint was already 1020. Pressed AUTO. Lit. STEAM PRESS read 1053 psi, which the text anticipated. (h24)
14. "Bring PRIMARY PRESSURE up to normal operating pressure." Typed 2235 + Enter. Warp 600×; above 2200 psi at T+06:31. (h26)
15. "Confirm Hot Standby." Pre-ticked. (h27)
16. "Confirm the reactor stayed shut down." The counter showed "15 of 30 plant-seconds". Warp 10×. Ready in about 3 s. (h28, h29)
17. "Confirm the heatup made no fission power." Pre-ticked. Complete. (h30, h31)

### Startup Part 2 (pwr_startup), 18 steps
1. "Verify the plant is in Hot Standby (Mode 3)." Pre-ticked; the plant chained from the heatup. (s01)
2. "Dilute boron to the estimated critical concentration, 719 ppm." Typed 719 + Enter; warp 600×. Took 2.0 plant-hours (text said about 2). The text says "boron concentration" while the tile is "BORON CHEM". (s02–s04)
3. "Line up the steam generator (SG) before taking the reactor critical." Pre-ticked. (s05)
4. "Take the 1/M baseline point before any rod moves." 1/M PLOT, then Plot point. Lit. The window also overlaps the Instructor panel's left edge. SG level had fallen from 65 to 37 % during the dilution, with no comment from any step. (s07, s08)
5. "Take the second 1/M point, after the first rod pull." See S-1. Held 10.2 s to rod 71 (SR 720); one extra tap to 73. Plot gave "predicted criticality ≈ step 258". (s12–s14)
6. "Take the third 1/M point." Held 12.0 s; SR 1400 at rod 158 (text said 150–155). Ticked without taps. Prediction: step 237. (s16, s17)
7. "Take the fourth 1/M point, after a shorter pull." Held 5.0 s; SR 3000 at rod 192 (text 190–192). Prediction: step 220. (s19, s19b)
8. "Take the final 1/M point, the one the approach to critical is built on." Stopped at 205 per "Do not hold past 205" with SR at 5900; the count rose to 8500 and the check ticked. STARTUP RATE took about 4.5 plant-minutes to reach +0.03 (text said 5½–6½). Prediction: step 210. (s21, s22)
9. "Block the source range trip at P-6." TRIP BLOCKS, then BLOCK on SR HIGH FLUX. Read BLOCKED; closed the panel. P-6 was never explained. (s24, s25)
10. "Take the reactor critical and set STARTUP RATE between +0.3 and +1.0." SLOW; held 15.5 s to 207. Held 10.4 s until +0.52; the rods coasted to 219 (text said 12–14 past). Rate settled at +0.40 and 10b ticked after the 60 plant-second still-hold. Before 10a was done, its panel already showed 10b's "Holding still… 1 of 60" counter, which confused me. (s27, s28)
11. "Level power near 1.0e-8 A and record the critical rod position." IR reached 1.0e-8. MED, held INSERT 14.7 s (219 → 207). Rate went −0.25 → 0.00. IR levelled at 8.6–9.9e-9 (text said near 7e-9). The 120 plant-second still-hold ran at 1× (2 min wall). Critical at 207 against a prediction of 210. (s30–s32)
12. "Raise power to the point of adding heat, about 1 %." SLOW; 6 single taps, each read 72 plant-s later: +0.03, +0.06, +0.08, +0.11, +0.14, +0.18. Power reached 1.1 % about 20 plant-minutes later. The text asks you to close a 1/M window that was already closed. (s34, s35)
13. "Put main feed in service and secure auxiliary feed." Typed 50 in the gpm box beside RESTORE. SG level went 37 → 60 % in 10.5 plant-minutes. Then SG FEED AUTO, and AUX FEED STOP → STANDBY. (s37, s38)
14. "Raise power past 5 %, into Mode 1, At Power." 4 pulls of 2 taps at 5×: power 3.3, 3.9, 4.8, then 5.1 %. (s40)
15. "Put the turbine on line and let the reactor follow it up." LATCH; LOAD 10; OUTPUT above 8 MW in about 1.5 plant-minutes. STEAM DUMP AUTO again changed the status to TAVG (see S-7). (s42, s43)
16. "Block the first startup trip, IR HIGH FLUX." 16a ticked while I read 8.4 % on REACTOR POWER (the text says 8.5 % or more). BLOCK → BLOCKED. (s45a, s46)
17. "Block the second startup trip, PR HIGH (LOW SETPT)." BLOCK → BLOCKED. (s48a)
18. "Verify the plant is in Mode 1, At Power." Pre-ticked. Complete. (s49, s50)

### Startup Part 3 (pwr_raise_power), 9 steps
1. "Confirm the plant the startup handed over is ready to climb." Pre-ticked. (r01)
2. "Make sure the turbine is on line and taking steam." Pre-ticked. (r02)
3. "Start the boron dilution that carries most of the climb." Typed 660 + Enter. (r04)
4. "Take the first stage to 30 MWe, load leading and rods following." LOAD 30; OUTPUT 30 at T+09:55:54. Tavg sagged to 537. 3 MED 5-step pulls (221 → 236; text said 20–25 steps) brought Tavg to 552. (r06, r07)
5. "Take the second stage to 50 MWe the same way." See S-2. 4 pulls (236 → 256) brought Tavg to 559. The speed bar showed "actual 4×" while on 5×. (r09a, r09)
6. "Take the third stage to 75 MWe the same way." The insertion-limit alarms were tagged "predicted by step 6". The warp drop meant the pulls ran at 1×. 5 pulls (256 → 281) brought Tavg to 570. (r11a, r11)
7. "Take the fourth stage to 90 MWe with a smaller pull." 1 pull (281 → 286) brought Tavg to 570 (text said 15–20 steps). (r13)
8. "Take the last stage to full load and settle the temperature on 578 °F." See S-4. 3 pulls (286 → 301) brought Tavg to 574. Power read 102.1 %. (r15)
9. "Confirm full power, with the boron dilution done." Ran at 5×. BORON CHEM reached 663 at T+10:40; no insert was needed. "Its band" was ambiguous. The completion card says "BORON at 660 ppm" while the tile read 663, and calls the next leg "the load rampdown walkthrough" while its button says "Shutdown Part 1". (r17, r18)

### Shutdown Part 1 (pwr_lower_power), 6 steps
1. "Start adding boron before any load comes off." Typed 719 + Enter. (l02)
2. "Take the first load off the turbine and let the reactor follow it down." LOAD 95 → 75 in 5 MW cuts; Tavg read 578–579 after each cut, so I made a 3-step insert every time (301 → 286). (l04)
3. "Bring AVG COOLANT TEMPERATURE back into its band with the rods." 1 insert brought Tavg to 573 (text said 10–20 steps). "577 is the top of the green band" sits awkwardly beside "the band falls with load from 578 at 100 %". (l06)
4. "Take the load down to 50 MWe, then trim…" See S-6. 18 steps in total (text 20–30). (l08)
5. "Take the load down to 30 MWe…" 15 steps (text ~20). (l10)
6. "Take the load down to 15 MWe…" 15 steps; power 12.6 %. Complete. (l12, l13)

### Shutdown Part 2 (pwr_shutdown), 3 steps
1. "Take the load off the generator before the scram." LOAD 0; OUTPUT fell below 5 MW in about 3 s. (d02)
2. "Shut the reactor down." SCRAM ×2 (arm, then fire). All ticked. Alarms were unannounced; the warpInfo line was stale (S-8). (d04)
3. "Put the decay heat on the steam dump: Mode 3, Hot Standby." One AUTO press → STM PRESS. Complete. (d06, d07)

### Shutdown Part 3 (pwr_cooldown), 16 steps
1. "Add the boron a cold core needs before any cooling starts." Typed 920 + Enter → BORATING. 600×; 63 plant-minutes to reach 880 (read 893 when the clock stopped). (c02)
2. "Bring pressure under the point where the low-pressure protection can be blocked." SET PZR PRESSURE 1900. See S-5. Also on the board, unexplained by any step: AUX FEED WATER RUNNING with AUTO amber, RESTORE amber, SG level 37 %. (c04)
3. "Block the protection that would read the cooldown as a leak." Blocked PZR PRESS LO-LO and SI REACTOR TRIP; ECCS STOP. The text's "would trip the reactor" reads oddly when the reactor is already tripped. (c06a–c06)
4. "Cool the plant on the steam dump to where RHR can take over." DUMP SETPOINT 120. Ran at 60× throughout; rate held −54 to −62. Reached 346 °F at T+15:35 (3 h 22 m; text ~3.5 h). About 7 wall-minutes. (c08)
5. "Take the pressure setpoint to the bottom of its range." SET PZR PRESSURE 1700. Ticked in about 3 s. "Pressure Relief Valve Open" came in for the first time. (c10)
6. "Hand pressure control from the heaters to the spray." HEATER OFF; SPRAY box 50 + Enter, then MANUAL. Below 1615 psi at T+15:36:17. (c12)
7. "Isolate the accumulators while pressure is inside their window." Clicked the valve → ISOLATED. (c14)
8. "Bring pressure under the RHR limit on the spray." 60×; below 413 psi after about 11 plant-minutes (text 10–13). PZR level stayed at 26–27 %. (c16)
9. "Put RHR in service as the cooldown loop." ALIGN; HX SPLIT 7 + Enter. (c18)
10. "Take the reactor coolant pumps off now that RHR is circulating." RCP OFF; ticked after about 14 s. (c20)
11. "Cool on RHR into Mode 5, inside the 100 °F per hour limit." See S-3. Margin went 88 → 29 over about 28 plant-minutes; then SPRAY OFF; then Tavg below 199 at T+18:17. HARNESS ERROR (mine): my watcher matched "Cooldown Rate High" in the step text itself and lowered HX SPLIT 8 → 6 when the rate was only −42/−31. A real player would not have done this. (c22a, c22)
12. "Shut the spray now that the plant is cold." Pre-ticked. (c23)
13. "Confirm the plant is in Mode 5, Cold Shutdown." Pre-ticked. The text says pressure is "about 150 psi"; at step 14 I read 267 psi (possibly affected by my HX SPLIT deviation). (c24, c25)
14. "Confirm the accumulators are still full and isolated." Pre-ticked. (c25)
15. "Confirm RHR is carrying the heat." Pre-ticked. (c26)
16. "Leave the plant lined up for the next heatup." SCRAM reset; STEAM DUMP CLOSE; DUMP SETPOINT 1020. The step suggests 60× with nothing to wait for. Complete. (c28, c29)

## 4. Words and numbers vs the board

| The walkthrough said | What the board shows |
|---|---|
| "STEAM DUMP valve on the diagram" | The diagram label is "DUMP" (the card is "STEAM DUMP") |
| "boron concentration" (startup 2c) | "BORON CHEM" |
| "A+B 7 %" | "A+B 7%" (trivial) |
| "P-6", "P-10", "P-11", "the permission" | "(P-6 PERMISSIVE)" on the TRIP BLOCKS rows; never explained |
| "REACTOR POWER 8.5 % or more" (startup 16a) | Ticked while the tile read 8.4 % |
| "settles on 578 °F" (raise 8c) | Ticked at 574; the grader line says 573–583 |
| "about 300 … BORON at 660 ppm" (raise completion) | BORON CHEM 663 |
| "INTER RANGE … near 7e-9 A" (startup 11) | 8.6–9.9e-9 A |
| "20 to 25 steps" / "about 30" / "15 to 20" (raise 4/6/7) | 15 / 25 / 5 steps actually needed |
| "Pressure Relief Valve Open … come in" (cooldown 2) | Did not come in; PORV stayed CLOSED |
| "PRIMARY PRESSURE reads about 150 psi" (cooldown 13) | 267 psi (caveat: my HX SPLIT deviation) |
| warpInfo "new alarm: Control Rods — Approaching Insertion Limit" | That alarm was no longer active |
| RCP FLOW (heatup) | Read 113 % during the pressure climb; a layman expects at most 100 % |

**Measured, on the table above (coordinator, 2026-10-02):**
- *8.5 % ticked at 8.4 %* (startup 16a) — narrowed: the row grades the undamped `power_range` transmitter at ≥ 8.45 % (chain tick 8.458 %) while the tile draws it through a 2 s display filter on a rising power. Owner ruling #670 "A" (2026-09-09) accepts exactly this gap and forbids grading the drawn value; not changed.
- *IR "near 7e-9 A"* (startup 11) — the reviewer read 8.6–9.9e-9 A after the card's own 12-step insert. Not re-measured; the unmeasured figure was removed ("levels a little under 1.0e-8 A").
- *BORON 660 vs 663* (raise completion card) — confirmed: BORON CHEM reads 662.4 ppm (typical) / 662.6 ppm (chain) when step 9 checks off; 660 is the target. Card now "BORON CHEM near 660 ppm", and names "Shutdown Part 1, the load rampdown" to match its button.
- *"about 150 psi"* (cooldown 13) — confirmed wrong: 176 psia typical, 277 psia chain. Card now "about 180 to 280 psi".
- *RCP FLOW 113 %* (heatup) — INHERITED, not re-measured: the tile is mass flow as a percent of rated, and cold water is denser. Narrowed, not a defect.
- *Rod-step counts below the card's estimates* (raise 4/6/7, lower 2–6) — the typical chain pulled 30/20/30/15/15 and inserted 15/9/24/18/12; the reviewer withdrew 80 steps across raise power against the chain's 110 (bank 301 vs 310 at the end, no step-9 insert needed). Inside the cards' ranges or under them; not changed.

## 5. What the text got right
- Every action line names the card and the exact button caption.
- The time and rod-position predictions held: shutdown bank about 9 plant-minutes; dilution about 2 h; rod 70–80 / 190–192 / 205; 12–14 steps of coast; 6–7 taps; 20–26 minutes to 1 %; 10 minutes to SG 60 %; 4 pulls past 5 %; about 3.5 h cooldown; 10–13 minutes to 413 psi.
- "Suggested time warp" plus auto-warp meant I never had to choose a speed. The ⏩ line explained each speed change.
- The "Average over the last 30 plant-seconds" and "Holding still… N of 60" counters showed why a step had not ticked yet.
- The fallback instructions (tap one step, wait half a plant-minute) were correct and sufficient.
- It explains shorthand: "7.0e2 is 700 counts a second", "DPM … tenfold every minute", "IR is INTER RANGE", "PR is POWER RANGE".
- Alarms tagged "predicted by step N" (heatup 9 and 11, raise 6) were reassuring.
- The location hints for the accumulator valve symbol ("just above the ACCUMULATORS tile … pulses") were enough to find it.
- The 1/M window's close instruction warns that it covers STEAM GENERATOR LEVEL and the pause button.
- The completion cards chain to the next leg, and the plant carries over.

Logs: `log.txt` (raw step log). Screenshots: `shots/` (h*, s*, r*, l*, d*, c*).
