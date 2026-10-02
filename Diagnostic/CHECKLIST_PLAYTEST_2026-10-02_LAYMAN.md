> **Record, not policy.** Layman playthrough of the six PWR walkthroughs after the #819 concise pass,
> 2026-10-02, tree `workbench` at `064000d8`, headless Edge 1600x1000. **6/6 legs, 69/69 steps, no
> step blocked.** Verified per `.claude/skills/layman-playthrough/SKILL.md` section 9 on the same tree:
> the walkthrough route harness parts A/B/C (typical, typical_pass3 and the six-leg chain, seed 42),
> `measure_stack.js --plant=pwr2`, and two headless Edge probes. Stuck points, one clause each:
> S-1 raise-power 8c's 578 °F target and 10-20-step count disagree (confirmed); S-2 startup 11b gives
> no hold time (confirmed) and its hold counter vanishes (narrowed: the wait was served); S-3 startup
> 10a ticks on entry (confirmed, 1 of 3 tabled routes); S-4 step 5's "about 10 seconds" (narrowed: right
> at the measured 7 steps a second); S-5 subcooling climbs after spray OFF, unexplained (confirmed);
> S-6 cooldown 13's "about 150 psi" (confirmed wrong: 176 and 277 psi); S-7 shutdown 1's Background
> says power follows the load down (confirmed wrong: 11.9 % at the check-off); S-8 the header clock
> under TEST BUILD (confirmed, dev/preview channels only); S-9 the speed bar showing 1× (refuted as a
> UI defect); S-10 aux feed RUNNING, unmentioned (confirmed: it starts on the trip).
> **Refuted, with the number:** S-9's "the lit button does not match the speed actually running" did
> not reproduce: 600 lit at 600×, then 1 lit at 1× after an alarm drop, 20 of 20 two-second samples.
> Fixed in the same change: step text for S-1 to S-7 and S-10 (pool and `Blueprint/walkthrough_steps/`
> word for word), and the S-8 header wrap (`ui/shell.css`, pinned by two `verify_flags_ui` checks
> that are red at the old CSS).

# Layman playthrough — six PWR walkthroughs, build workbench 064000d8

Driven in headless Edge at 1600x1000, `ui/shell.html?engine=pwr2`, chain started from Main Menu →
Walkthroughs → Startup Part 1 ▶ Start, every later leg via the "Next: … ▸" button on the
completion card. Wall time about 75 minutes, about 115 tool calls. Screenshots in `shots/`;
running notes in `notes.txt`. No page errors logged (`pageerrors.log` absent).

Method caveat: canvas-drawn tiles (SOURCE RANGE, STARTUP RATE, CONTROL ROD POSITION) could only
be read from screenshots, so rod holds were timed holds followed by a screenshot, the way a player
would glance. REACTOR POWER, AVG COOLANT TEMPERATURE, PRIMARY PRESSURE and SUBCOOLING MARGIN were
read as text.

## 1. Outcome

| Leg | Result | Steps | The one thing that mattered |
|---|---|---|---|
| Startup Part 1 (pwr_heatup) | Complete | 17/17 | Accumulator valve is a diagram symbol, found only because the note says where it sits; it is highlighted cyan. |
| Startup Part 2 (pwr_startup) | Complete | 18/18 | Rod holds are judged by watching a canvas number; the "about N seconds" guidance was off (step 5: 12 s, not 10) and step 11b gives no time at all. Critical at 206 vs 1/M prediction 208. |
| Startup Part 3 (pwr_raise_power) | Complete | 9/9 | Step 8 "until it settles on 578 °F, 10 to 20 steps" cannot both be met: 50 steps got 574 °F and 102.6 % power, 0.4 % from the 103 % rod stop. |
| Shutdown Part 1 (pwr_lower_power) | Complete | 6/6 | Mechanical: cut 5 MW, insert 3, repeat. Every cut needed an insert. |
| Shutdown Part 2 (pwr_shutdown) | Complete | 3/3 | LOAD 0 drops OUTPUT to 0 MW at once while REACTOR POWER stays 13 %; then SCRAM. |
| Shutdown Part 3 (pwr_cooldown) | Complete | 16/16 | Step 11's "spray off below 30 °F" had to be caught by watching the margin; done on a 2 s poll at sc=29. |

Round trip Cold Shutdown → 100 % → Cold Shutdown finished with nothing done that the text did not
say, except the step 8 judgement call below (S-1) and the extra tap the text itself prescribes.

## 2. Stuck points, ranked

None of these stopped a leg. Ranked by how much a layman could get wrong.

**S-1 — Startup Part 3, step 8: two criteria that do not agree.**
Text: "8c· If AVG COOLANT TEMPERATURE reads below 573 °F, withdraw at MED in 5-step pulls a
plant-minute apart until it settles on 578 °F, 10 to 20 steps." Heading: "settle the temperature
on 578 °F." Done-when: "AVG COOLANT TEMPERATURE between 573 and 583 °F (near 578)".
What I did: after OUTPUT reached 100 MW Tavg read 565 °F. I pulled 5 steps (1.4 s hold at MED, 5×)
every plant-minute, aiming for 578: 565, 567, 568, 569, 571, 572, 573, 573, 574, 574 → 10 pulls,
about 50 steps, rod 302 of 627, REACTOR POWER 102.6 % (the text says the rod stop is 103 %). The
check ticked at 573 °F on the 7th read; I kept going because the text said 578. In step 9 it sat at
576 °F / 101.5 % once the boron arrived, so no harm, but I was one more pull from the rod stop
the step warns about. (shot `r08_done.png`)
What would have unstuck me: say "stop at 573 °F or after 20 steps, whichever comes first; the
boron still arriving brings it the rest of the way" — step 9's background says that, one step too late.
**Measured:** route harness, step 8 on three routes. Typical: Tavg 574.0 °F on entry, 10 steps pulled, ticked at 578.4 °F, 101.4 %. Chain: 571.6 °F on entry, 15 steps, ticked at 573.8 °F with REACTOR POWER **103.1 %** at the tick, bank 328; step 9 then ends at 580.5 °F (typical 579.9 °F) with no further pull. Reviewer: entered at 565 °F (step 7 pulled 10 of its "15 to 20"), reached 573 °F after 30 steps, 574 °F and 102.6 % after 50.
**Verdict:** confirmed — "settle on 578 °F" is reached inside step 8 only when the stage enters near 573 °F; on the chain the 573 °F band floor and the rod stop arrive together and the boron carries it the rest. 8c now reads "until it reads 573 °F, 10 to 20 steps", and its note opens "Stop at 573 °F: the boron still arriving takes it to about 578 °F in step 9." Heading and grading unchanged.

**S-2 — Startup Part 2, step 11b: hold length and progress cue.**
Text: "Insert until STARTUP RATE holds between −0.02 and +0.02: press MED, hold INSERT about 12
steps, and read it two plant-minutes later. Above +0.02, tap INSERT once; below −0.02, tap
WITHDRAW once." Suggested 1×.
What I did: at 1× MED moves about 0.75 steps a second: 4 s = 3 steps, 15.5 s total for 12 steps
(217 → 205). Pressed 10× as allowed and waited. The "Holding still… 0 of 120 plant-seconds" line
vanished from the panel while I waited, so there was no countdown. After about 5 plant-minutes
STARTUP RATE sat at −0.05 (shots `s11_wait.png`, `s11_wait2.png`). Tapped WITHDRAW once → 206, rate
−0.02, ticked about 20 s wall later (`s11_tap1.png`).
What would have unstuck me: give the hold as a time at 1× ("about 16 seconds") and keep the
holding-still counter on screen until the check ticks.
**Measured:** MED is 48 steps per plant-minute (`pwr2_engine.js` ROD_SPEEDS), so 12 steps take **15 plant-seconds**, 15 s at 1× (reviewer: 15.5 s). Typical route: 219 to 207, 12 steps, ticked 120.5 plant-s after the last motion at +0.003. Reviewer: 217 to 205 put the rods one step under critical (206), read −0.05, and one WITHDRAW tap fixed it. The "Holding still…" line is `cklProgLine` (`ui/app.js`), which prints nothing once the 120 s still-wait is served; what was left unmet was the reading.
**Verdict:** confirmed for the missing time (11b now says "about 15 seconds at 1× (about 12 steps)"); narrowed for the vanished counter — by design: the wait had finished and STARTUP RATE was outside −0.02 to +0.02.

**S-3 — Startup Part 2, step 10: the first instruction is already done on entry.**
Text: "10a Press SLOW, then hold CONTROL WITHDRAW until CONTROL ROD POSITION is 3 steps short of the
predicted position." Later: "The rods stop 12 to 14 steps past where 10a let go."
What I did: 10a showed ✓ when the step opened (rods at 205, prediction 208), so I did not hold. A
reader who obeys "hold WITHDRAW until…" without noticing the tick would go past 205. In 10b I
pressed SLOW and held WITHDRAW: 8 s → 214, rate +0.35; +2.5 s → 217, rate settled at +0.30, the
very bottom of the +0.3 to +1.0 band (`s10_hold8.png`, `s10_after2.png`). "Where 10a let go" names
a let-go that never happened.
What would have unstuck me: "If 10a is already ticked, do not touch the rods; go to 10b."
**Measured:** route harness, step 10's 1/M row: typical ticked **at entry** (bank 205, prediction 208); typical_pass3 at 0.4 min (206, prediction 209); chain at 0.4 min (208, prediction 211). Rods ended at 219 on all three: 14, 13 and 11 steps past the 10a position; reviewer 205 to 217, 12.
**Verdict:** confirmed — 10a is met on entry whenever step 8 stops exactly 3 short (1 of 3 tabled routes, and the reviewer's). 10a now adds "If 10a is already ticked, leave the rods and go to 10b."; the note reads "12 to 14 steps past the 10a position", a position rather than a let-go. The chain's 11 sits outside 12 to 14; not changed, other seeds not measured.

**S-4 — Startup Part 2, step 5: the time estimate is short.**
Text: "expect about 10 seconds of holding, near CONTROL ROD POSITION 70 to 80."
What I did: MED, held WITHDRAW 8 s → 55 (`s05_hold8.png`); 4 s more → 83, past the 80 the text
gives (`s05_hold12.png`). Passed anyway. Step 6 (expect 150–155): 8.5 s → 143, +1.2 s → 150.
Step 7 (expect 190–192): 5.3 s → 186, still ticked at SR 3.3e3. Step 8 (expect ~205): 3 s → 196,
+2.4 s → 205.
What would have unstuck me: "hold in bursts of a few seconds and watch CONTROL ROD POSITION; it
moves about 7 steps a second" — the seconds figure is the part that misled.
**Measured:** MED is 0.8 steps per plant-second. The reviewer's own browser numbers give **7.0 steps a wall-second** at the walkthrough's 10× (55 to 83 in 4 s, 83 to 143 in 8.5 s), so 10 s is about 70 steps; the typical route ends step 5 at bank 77 (SR 705).
**Verdict:** narrowed — "about 10 seconds, near 70 to 80" is right at the measured rate; the reviewer reached 83 by holding 8 s and then 4 s more. The note now adds "at about 7 steps a second" so the hold can be judged off the tile.

**S-5 — Shutdown Part 3, step 11: the spray cue is a moving target.**
Text: "11c· When SUBCOOLING MARGIN reads below 30 °F, press OFF under SPRAY…", "at 600× the margin
can fall 10 °F between two glances", "The clock moves to 60× by itself once HX SPLIT is raised."
What I did: raised HX SPLIT to 8 %, watched SUBCOOLING MARGIN on a 2 s poll, pressed OFF at 29 °F.
Fine, but only because I polled; the margin fell from 94 to 29 in under 5 minutes of wall time.
After OFF the tile jumped to 149 °F (`c11_end.png`), which nothing explains.
What would have unstuck me: one line saying the margin rises again once the spray is shut.
**Measured:** route harness, cooldown 11: spray OFF at SUBCOOLING MARGIN 28.5 °F (typical) / 31.4 °F (chain); at step 12 the margin reads **177 °F** (typical) / **215 °F** (chain); reviewer 149 °F. The rise runs over the ~100 plant-minutes of 11d (spray off 40.6 min into a 139.6 min step), not at the press; at 600× that is seconds of wall.
**Verdict:** confirmed — nothing said it rises. 11d's note now ends "Once the spray is shut, SUBCOOLING MARGIN climbs back to about 150 °F or more." Not measured at finer than step resolution.

**S-6 — Shutdown Part 3, step 13: number does not match the board.**
Text: "PRIMARY PRESSURE reads about 150 psi; it crept up after the spray shut, which is expected."
Board: 265 psi at 195 °F (`c11_end.png`, text read 265). I did nothing; the check does not grade it.
What would have unstuck me: the number that is actually on the board, or a range.
**Measured:** route harness, cooldown 13 PRIMARY PRESSURE: **176 psi** standalone (hot_zero_power start), **277 psi** on the chain; the reviewer read 265 psi on the chain.
**Verdict:** confirmed — "about 150 psi" matched neither route. Now "about 170 to 280 psi". Ungraded, grading unchanged.

**S-7 — Shutdown Part 2, step 1: the result is not what the background predicts.**
Text: "Set LOAD to 0 MW and wait for OUTPUT to fall below 5 MW." Background: "The reactor follows
the falling steam demand down by itself, so the scram comes from low power".
What I did: typed 0 + Enter. OUTPUT went to 0 MW at once and the check ticked in 0 s; STEAM DUMP
jumped to 34 %, Turbine Trip / Low Steam Demand alarm came in, REACTOR POWER still read 13.2 %
(`d01_done.png`). Nothing said the dump would take the steam or that power would not move first.
What would have unstuck me: "OUTPUT drops at once; the steam dump opens to take the steam."
**Measured:** chain route, shutdown 1: ticked 0.1 plant-min after LOAD 0 with OUTPUT 0 MW and Turbine Trip raised, REACTOR POWER **11.9 %** at the tick (reviewer 13.2 %; step 2's pool comment records 12.9 %). The steam-dump opening the reviewer read (34 %) was not re-measured.
**Verdict:** confirmed — the Background's "the reactor follows the falling steam demand down by itself" is wrong for this step: power stays where Shutdown Part 1 left it until the scram. Background now: "OUTPUT drops to 0 MWe at once and the turbine trips; REACTOR POWER stays near 12 % until the scram, …". The dump is not named because it was not measured.

**S-8 — Throughout: the plant clock is unreadable.**
The header clock is drawn under the "TEST BUILD" badge, e.g. "TEST BUILD 0:18" (`h02_board.png`).
Steps that say "wait a plant-minute" or "about 2 plant-hours" cannot be checked against it.
What would have unstuck me: a clock that is not covered.
**Measured:** headless Edge, `.logo-test` against `#clock` boxes: at 1366 and 1600 px the badge runs 53 px under the clock (**738 px²**) on the dev and preview channels; **0** on public (badge hidden) and 0 at 1920 px.
**Verdict:** confirmed, dev/preview only. Fixed: `.sim-top` wraps and the clock right-aligns on its own line when the row cannot hold both (dev at 1366/1600 px: header 18 px taller; public unchanged). `verify_flags_ui` +2 checks (dev at 1366/1600/1920 px, and public), red at the old CSS (738 px²).

**S-9 — Throughout: the speed bar shows 1× after the walkthrough has warped.**
With "Walkthrough sets time warp" ticked, the speed button lit was 1× whenever I read it, including
right after waits that clearly ran at 60–3600× (3 plant-hours in 12 s in heatup step 11). #warpInfo
said "Speeding up to 3600× — nothing to do for a while" at step entry, then went blank. In
cooldown step 4 the 3½ plant-hour wait took 302 s of wall time and I could not tell what speed it ran at.
What would have unstuck me: the lit speed button matching the speed actually running.
**Measured:** headless Edge, Shutdown Part 3 started with "Walkthrough sets time warp" on, boron 920 ppm set, 20 samples 2 s apart: lit rung **600** while `timeAcceleration` was 600; a new Cooldown Rate High alarm then dropped the clock and the lit rung was **1** with `timeAcceleration` 1 for the remaining 19. 20 of 20 matched.
**Verdict:** refuted as a UI defect — the lit button tracks the running speed. The reviewer read the bar after each wait, by when the walkthrough had handed the clock back to 1× (or an alarm had dropped it). Not measured: the achieved rate against the requested rung (cooldown 4's 302 s of wall for 3½ plant-hours is ~42× achieved). The Cooldown Rate High drop in cooldown step 1 on a standalone start is a separate observation, not investigated.

**S-10 — Shutdown Part 3: AUX FEED WATER is running and nothing mentions it.**
Startup Part 2 step 13c put it in STANDBY. During the cooldown the card read RUNNING with AUTO lit
in orange (`c03_tb.png`, `c11_end.png`); SG FEED RESTORE was orange too. No step mentions it. I
left it alone.
What would have unstuck me: one line in the shutdown or cooldown saying aux feed restarts by itself after the trip.
**Measured:** `measure_stack.js --plant=pwr2 --ic=low_power`, LOAD 0 at 10 s, scram at 40 s: `afw_pump_running` false to **true** within a plant-minute of the trip with STEAM GENERATOR LEVEL at 67 % (not lo-lo), main feed flow decaying to 0; aux feed flow 0 while level sits above its 38 % AUTO band.
**Verdict:** confirmed — aux feed starts by itself on the trip and no step says so. Shutdown Part 2 step 2's Background now says "The trip stops main feed and aux feed starts by itself, so AUX FEED WATER reads RUNNING." Which protection signal starts it was not traced.

## 3. Per-step log

Speeds are what I pressed or what #warpInfo said; "Bkg" = whether I needed the Background to act.
Notes (the italic lines inside a step) were needed often; Background was never needed to complete a step.

### Startup Part 1 — 17 steps, all Continue lit
| # | First sentence | What I did | Time | Notes / confusion |
|---|---|---|---|---|
| 1 | Confirm the plant is cold and shut down. | Nothing; all 4 ticked on load. | 0 | `h01_start.png`. |
| 2 | Start the reactor coolant pumps. | ON on RCP FLOW card (616,525). | ~1 s | `h02_board.png`, `h02_after.png`. |
| 3 | Withdraw the shutdown bank all the way out. | FAST, one click WITHDRAW under SHUTDOWN; pressed 60×. | ~4 s wall | Bank latched to 627. Speed bar read 1× afterwards (S-9). `h03a.png`, `w_1790940701724.png`. |
| 4 | Confirm the turbine is tripped. | Nothing. | 0 | |
| 5 | Put auxiliary feed in AUTO… | AUTO on AUX FEED WATER. | instant | |
| 6 | Confirm the steam dump is closed. | Nothing. | 0 | The diagram valve is labelled "DUMP", the text says "STEAM DUMP valve"; findable. |
| 7 | Open the letdown orifices… | A+B 7 % on LETDOWN. | instant | |
| 8 | Put pressurizer spray in service… | AUTO under SPRAY. | instant | |
| 9 | Raise PRIMARY PRESSURE to the 665 psi accumulator window… | AUTO under HEATER; 600×. | 6 s wall | warpInfo "Held at real time — the plant needs you here". |
| 10 | Open the accumulator valve… | Clicked the cyan valve symbol above ACCUMULATORS (375,535). | instant | Needed the note to find it. `h10_acc_zoom.png`. |
| 11 | Heat the plant to 542 °F on pump heat alone. | Waited (auto 3600×). | 12 s wall | Ended 552 °F (text warned ~10 °F over). Red "Pressurizer Pressure Very Low" critical alarm; text says expected. ADV 9 % open. `h11_done.png`. |
| 12 | Confirm letdown now leaves only through the orifices. | Nothing. | 0 | |
| 13 | Hand STEAM PRESS to the steam dump to hold. | AUTO on STEAM DUMP. | instant | |
| 14 | Bring PRIMARY PRESSURE up to normal operating pressure. | Typed 2235 + Enter in SET PZR PRESSURE; 600×. | 3 s wall | |
| 15 | Confirm Hot Standby. | Nothing. | 0 | |
| 16 | Confirm the reactor stayed shut down. | Waited (auto 10×). | <30 s | "Watching it settle… 14 of 30 plant-seconds" shown. |
| 17 | Confirm the heatup made no fission power. | Nothing. | 0 | |

### Startup Part 2 — 18 steps, all Continue lit
| # | First sentence | What I did | Time | Notes / confusion |
|---|---|---|---|---|
| 1 | Verify the plant is in Hot Standby (Mode 3). | Nothing. | 0 | |
| 2 | Dilute boron to the estimated critical concentration, 719 ppm. | Typed 719 + Enter in 0-2500 ppm box; 600×. | 15 s wall | 2c says "boron concentration"; the board says BORON CHEM (the done-when line uses BORON CHEM). `s02_set.png`. |
| 3 | Line up the steam generator (SG)… | Nothing. | 0 | |
| 4 | Take the 1/M baseline point… | 1/M PLOT, Plot point, ✕. | instant | Window covers pause/1× buttons and SG level, as warned. `s04_1m.png`. |
| 5 | Take the second 1/M point… | MED; held WITHDRAW 8 s (→55), 4 s (→83); waited; plotted. | ~25 s | S-4. `s05_hold8.png`, `s05_hold12.png`. |
| 6 | Take the third 1/M point. | Held 8.5 s (→143), 1.2 s (→150); plotted. | ~25 s | Prediction 247. Panel showed "C = 1294 cps" while the tile said 1.4e3. `s06_plot.png`. |
| 7 | Take the fourth 1/M point… | Held 5.3 s (→186); waited 6 s; plotted. | ~20 s | |
| 8 | Take the final 1/M point… | Held 3 s (→196), 2.4 s (→205); waited 40 s wall; rate +0.02; plotted. | ~50 s | Prediction 208. SR kept climbing 7.4e3 → 2.2e4 during the wait. `s08_plotzoom.png`. |
| 9 | Block the source range trip at P-6. | TRIP BLOCKS, BLOCK on SR HIGH FLUX, TRIP BLOCKS. | instant | Panel header is dense ("0 of 5 BLOCKED · 1 AVAILABLE TO BLOCK NOW · 4 WAITING…"). "P-6" is a code, explained in Background only. `s09_tb.png`. |
| 10 | Take the reactor critical and set STARTUP RATE… | 10a ticked on entry; SLOW; held 8 s (→214), 2.5 s (→217). | ~25 s | S-3. |
| 11 | Level power near 1.0e-8 A… | MED; held INSERT 15.5 s (→205); 10×; waited; tapped WITHDRAW once (→206). | ~75 s | S-2. Critical 206 vs prediction 208. |
| 12 | Raise power to the point of adding heat, about 1 %. | SLOW, 10×, 7 taps 8.5 s apart (→213, +0.17); then 60×. | ~80 s | Exactly the "6 or 7 taps" promised. |
| 13 | Put main feed in service and secure auxiliary feed. | Power 1.1 % so typed 50 + Enter beside RESTORE; waited; AUTO on SG FEED; STOP on AUX FEED WATER. | 150 s wall | I left it at 1× (my miss: text says 10×). |
| 14 | Raise power past 5 %… | SLOW, 5×, 2 taps per 13 s: 3.1, 3.7, 4.5, 5.2 %. | ~55 s | 4 pulls, as promised. |
| 15 | Put the turbine on line… | LATCH; LOAD 10 + Enter; 10×; AUTO on STEAM DUMP → TAVG. | ~30 s | |
| 16 | Block the first startup trip, IR HIGH FLUX. | Waited for 8.5 %; TRIP BLOCKS, BLOCK IR HIGH FLUX, closed. | ~10 s | `s16_tb.png`. |
| 17 | Block the second startup trip, PR HIGH (LOW SETPT). | TRIP BLOCKS, BLOCK, closed. | instant | |
| 18 | Verify the plant is in Mode 1, At Power. | Nothing. | 0 | |

### Startup Part 3 — 9 steps, all Continue lit
| # | First sentence | What I did | Time | Notes / confusion |
|---|---|---|---|---|
| 1 | Confirm the plant the startup handed over is ready to climb. | Nothing. | 0 | |
| 2 | Make sure the turbine is on line and taking steam. | Nothing. | 0 | |
| 3 | Start the boron dilution that carries most of the climb. | Typed 660 + Enter. | instant | |
| 4 | Take the first stage to 30 MWe… | LOAD 30, 10×; at 30 MW Tavg 535; MED 5-step pulls at 5×: 542, 546, 549, 552. | ~90 s | 20 steps, inside "20 to 25". 1.4 s hold = 5 steps at 5×. |
| 5 | Take the second stage to 50 MWe the same way. | LOAD 50; Tavg 540; 5 pulls → 558. | ~2 min | 25 steps. |
| 6 | Take the third stage to 75 MWe the same way. | LOAD 75; Tavg 550; 5 pulls → 566. | ~2 min | 25 steps ("about 30"). |
| 7 | Take the fourth stage to 90 MWe with a smaller pull. | LOAD 90; Tavg 565; 2 pulls → 570. | ~1 min | 10 steps ("15 to 20"). |
| 8 | Take the last stage to full load and settle the temperature on 578 °F. | LOAD 100; Tavg 565; 10 pulls → 574. | ~3 min | S-1. `r08_done.png`. |
| 9 | Confirm full power, with the boron dilution done. | Waited (auto 5×); no inserts needed. | ~35 s | 576 °F, 101.5 %. Completion card calls the next leg "the load rampdown walkthrough"; the list says Shutdown Part 1. |

### Shutdown Part 1 — 6 steps, all Continue lit
| # | First sentence | What I did | Time | Notes / confusion |
|---|---|---|---|---|
| 1 | Start adding boron before any load comes off. | Typed 719 + Enter. | instant | |
| 2 | Take the first load off the turbine… | LOAD 95, 90, 85, 80, 75, 12 s apart at 5×; Tavg 579–581 every time → INSERT 3 at MED each. | ~65 s | |
| 3 | Bring AVG COOLANT TEMPERATURE back into its band with the rods. | INSERT 3 at 578, 577; ticked at 576. | ~25 s | 6 steps ("about 10 to 20"). "Insert … in pulls" uses "pulls" for inserts. |
| 4 | Take the load down to 50 MWe… | 70…50, 5 inserts; 3 more → 568. | ~2 min | 24 steps ("20 to 30"). |
| 5 | Take the load down to 30 MWe… | 45…30, 4 inserts; 2 more → 561. | ~80 s | 18 steps ("about 20"). |
| 6 | Take the load down to 15 MWe… | 25, 20, 15, 3 inserts; 3 more → 556, 12.9 %. | ~80 s | 18 steps ("10 to 15"). Text: "where the shutdown walkthrough trips the reactor"; the list says Shutdown Part 2. |

### Shutdown Part 2 — 3 steps, all Continue lit
| # | First sentence | What I did | Time | Notes / confusion |
|---|---|---|---|---|
| 1 | Take the load off the generator before the scram. | LOAD 0 + Enter. | 0 s | S-7. `d01_done.png`. |
| 2 | Shut the reactor down. | SCRAM twice (arm, trip). | 5 s | `d02_armed.png`, `d02_scram.png`. |
| 3 | Put the decay heat on the steam dump… | AUTO on STEAM DUMP once → STM PRESS; 10×. | instant | |

### Shutdown Part 3 — 16 steps, all Continue lit
| # | First sentence | What I did | Time | Notes / confusion |
|---|---|---|---|---|
| 1 | Add the boron a cold core needs before any cooling starts. | Typed 920 + Enter; 600×. | 6 s wall | |
| 2 | Bring pressure under the point where the low-pressure protection can be blocked. | SET PZR PRESSURE 1900 + Enter. | 12 s wall | |
| 3 | Block the protection that would read the cooldown as a leak. | TRIP BLOCKS; BLOCK PZR PRESS LO-LO; BLOCK SI REACTOR TRIP; closed; STOP on ECCS. | instant | `c03_tb.png`, `c03_blocked.png`. AUX FEED WATER showing RUNNING/AUTO (S-10). |
| 4 | Cool the plant on the steam dump to where RHR can take over. | DUMP SETPOINT 120 + Enter; waited. | 302 s wall | Over the 5-minute budget by 2 s; S-9. |
| 5 | Take the pressure setpoint to the bottom of its range. | SET PZR PRESSURE 1700 + Enter. | 6 s | |
| 6 | Hand pressure control from the heaters to the spray. | OFF under HEATER; 50 + Enter in SPRAY box; MANUAL under SPRAY; 5×. | ~5 s | 6b ticked a few seconds after the click. `c06_pzr.png`. |
| 7 | Isolate the accumulators while pressure is inside their window. | Clicked the valve symbol. | instant | `c07_acc.png`. |
| 8 | Bring pressure under the RHR limit on the spray. | Waited (auto 60×). | 12 s | |
| 9 | Put RHR in service as the cooldown loop. | ALIGN on RHR; HX SPLIT 7 + Enter. | instant | `c09.png`. |
| 10 | Take the reactor coolant pumps off… | OFF on RCP FLOW. | ~3 s | |
| 11 | Cool on RHR into Mode 5… | HX SPLIT 8; watched margin; OFF under SPRAY at 29 °F; waited for 199 °F. | <5 min | S-5. `c11_sprayoff.png`, `c11_end.png`. |
| 12 | Shut the spray now that the plant is cold. | Nothing (already off). | 0 | |
| 13 | Confirm the plant is in Mode 5, Cold Shutdown. | Nothing. | 0 | S-6. |
| 14 | Confirm the accumulators are still full and isolated. | Nothing. | 0 | |
| 15 | Confirm RHR is carrying the heat. | Nothing. | 0 | |
| 16 | Leave the plant lined up for the next heatup. | SCRAM once (reset); CLOSE on STEAM DUMP; DUMP SETPOINT 1020 + Enter. | instant | `c16.png`. |

## 4. Words and numbers I could not find on the board

| The walkthrough said | On the board |
|---|---|
| "boron concentration" (Startup Part 2, 2c) | BORON CHEM |
| "the STEAM DUMP valve on the diagram" (heatup 6b) | valve labelled DUMP, "0 %" beside it |
| "the accumulator valve" | unlabelled valve symbol above the ACCUMULATORS tile (highlighted cyan) |
| "PRIMARY PRESSURE reads about 150 psi" (cooldown 13) | 265 psi |
| "expect about 10 seconds of holding, near 70 to 80" (startup 5) | 12 s, 83 |
| "hold INSERT about 12 steps" (startup 11b) | no time given; about 16 s at 1× |
| "settle … on 578 °F, 10 to 20 steps" (raise 8) | 574 °F after 50 steps |
| "the load rampdown walkthrough", "the shutdown walkthrough", "the cooldown walkthrough", "the heatup walkthrough" | List and buttons say Shutdown Part 1 / 2 / 3, Startup Part 1 |
| P-6, P-10, P-11 | Appear on the TRIP BLOCKS panel as "(P-6 PERMISSIVE)" etc.; no plain meaning on the board |
| plant clock for "wait a plant-minute" | header clock covered by the TEST BUILD badge |
| the warp speed the step set | speed bar keeps 1× lit |

## 5. What the text got right

- Every control named in a step was on the board under exactly that label, except the accumulator valve, and its location note was enough.
- "Type it … and press Enter" every time a number box is used.
- Expected alarms are named before they come in (Pressurizer Pressure Very Low, Turbine Trip / Low Steam Demand, Insertion Limit, Relief Valve Open).
- Count shorthand explained once ("7.0e2 is 700 counts a second").
- Averaging lines ("Average over the last 30 plant-seconds: 5.9e2…") explain why a check that looks met has not ticked.
- Tap counts were right: 7 taps in startup 12 ("6 or 7"), 4 pulls in startup 14 ("about 4").
- The 1/M prediction (208) landed 2 steps from actual critical (206), and the text said "good to about three steps".
- The heatup 11 overshoot ("can run about 10 °F past 542 °F") was exactly what happened (552 °F).
- TRIP BLOCKS steps say to close the panel and why ("it covers the rod buttons").
- "If OFF is already lit under SPRAY…" and "Missed the window: …" give a recovery path before you need one.
- Each completion card states the end state and offers the next leg, and the chain loaded each leg's start without reloading.
