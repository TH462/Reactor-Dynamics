# Mode 3, Hot Standby to Mode 1, At Power

**Walkthrough id: `pwr_startup`  ·  17 steps**

> This is the LIVE step file: the sim's `pwr_startup` walkthrough was brought down to it on
> 2026-09-23 (the owner: "Implement the new version of the walk-through for the mode 3 to 1
> start up"). Edit it freely — it is the step text, and it is what the sim is brought down to.
>
> **The format.** Line one of a step is what the step accomplishes. Each lettered substep opens
> with the action that accomplishes it, then its own Note, its own **Suggested time warp**, and
> its check-off lines drawn `()`. Background closes the step. Agent notes go at the END of the
> file, never between the steps.

---

1. Verify the plant is hot and shut down before any rod moves.

1a. Read AVG COOLANT TEMPERATURE near 547 °F, PRIMARY PRESSURE near 2235 psi, and RCP FLOW on.

Note: SOURCE RANGE counts should be wandering around one level, not climbing. One alarm is already up and belongs here: Turbine Trip / Low Steam Demand on the ALARMS list. The turbine is off and the plant is making no steam. Press ACK on the ALARMS list and leave it.

Suggested time warp: 1×.

()  AVG COOLANT TEMPERATURE 544 to 549 °F
()  PRIMARY PRESSURE 2200 to 2270 psi

Background

Hot Standby (Mode 3) is hot and at pressure with the reactor still shut down: the pumps are running, the shutdown rods are already fully out, and SOURCE RANGE counts sitting still means nothing is drifting toward critical yet.

[HIGHLIGHTED: Source Range, Tavg, Primary Pressure, Reactor Coolant Pumps (RCP), Boron Concentration (steady)]



2. Bring boron down to the estimated critical concentration, 719 ppm.

2a. On the BORON card set 719 and press Enter.

Note: ON is normally already lit; press it only if it is not. BORON STATUS reads DILUTING while the dose runs and stops by itself; BORON CHEM is a live channel and tracks the loop as it falls. From the Hot Standby preset boron already reads 719 and this step ticks at once.

Suggested time warp: 1× from the Hot Standby preset. If BORON CHEM reads near 918 (you came here from the Mode 5 to Mode 3 walkthrough), 600× — the wash takes about 90 plant-minutes.

()  BORON CHEM 679 to 759 ppm

Background

Boron dissolved in the water soaks up neutrons, so the control rods do not have to come as far out before the reactor goes critical. At 719 ppm it goes critical around 208 of 627 steps — low in the bank, with travel left. At 918 ppm the same bank has to come about four-fifths of the way out, around 490 steps.

[HIGHLIGHTED: Boron Target (pulsing); Boron Status, Boron Concentration (steady)]



3. Line up the heat sink before the reactor makes any heat.

3a. Check the SG FEED AUTO button is lit. If it is not, press AUTO.

Suggested time warp: 1×.

()  SG FEED AUTO lit (card reads HOLDING)

Background

The steam generator is the boiler: reactor water heats it on one side and steam comes off the other. Once the reactor starts making heat, that steam comes off fast, and AUTO on the feed system is what holds the level.

[HIGHLIGHTED: SG Feed AUTO (pulsing); SG Level (steady)]



4. Take the 1/M baseline point before any rod moves.

4a. Press 1/M PLOT on the ROD CONTROL card, then press Plot point.

Note: This first point is the baseline. Every count target on this walkthrough is the SOURCE RANGE reading, printed in shorthand: 7.0e2 is 700 counts a second, 1.4e3 is 1,400, 7.0e3 is 7,000.

Suggested time warp: 1×.

()  Baseline point plotted

Background

1/M means one-over-multiplication: the plot divides the starting SOURCE RANGE count by the current one. As counts climb that number falls toward zero, and where the line would cross zero is the rod position at which the reactor goes critical. It fits the last three points, so each new point sharpens the prediction.

[HIGHLIGHTED: 1/M Plot Tool, Plot point (pulsing); Source Range (steady)]



5. Withdraw the control rod group and plot a second point on the 1/M plot to begin forming a fit line.

5a. Hold CONTROL WITHDRAW at MED until CONTROL ROD POSITION is 80 to 100. SOURCE RANGE should read about 7.0e2 or more.

Suggested time warp: 5×.

()  SOURCE RANGE reads 7.0e2 (700 counts per second) or more

5b. Wait for STARTUP RATE +0.03 or less, then press Plot point to plot the second point.

Note: STARTUP RATE reaches +0.03 or less about half a plant-minute after the rods stop.

Suggested time warp: 1×.

()  Point plotted

Background

The first two points always predict the criticality point too high: near the bottom the rods are worth little per step, so the line they draw crosses zero far past the real critical position. That is expected. While the reactor is shut down, SOURCE RANGE counts are the only thing that tells how close the core is; rod position does not.

[HIGHLIGHTED: Rod Speed — Normal, Withdraw, Plot point (pulsing); Source Range, Startup Rate, Control Rod Position (steady)]



6. Withdraw again and plot a third point; the prediction tightens.

6a. Hold CONTROL WITHDRAW until CONTROL ROD POSITION is 150 to 175. SOURCE RANGE should read about 1.4e3 or more.

Suggested time warp: 5×.

()  SOURCE RANGE reads 1.4e3 (1,400 counts per second) or more

6b. Wait for STARTUP RATE +0.03 or less, then press Plot point and read the predicted rod position the panel prints.

Note: STARTUP RATE reaches +0.03 or less about a minute and a half after the rods stop.

Suggested time warp: 1×.

()  Point plotted

Background

Each new point is taken closer to critical, where a step is worth more, so the line steepens and the predicted crossing walks in. The panel prints the crossing as a rod step with a marker on the plot. That number still reads high; it improves with every point.

[HIGHLIGHTED: Withdraw, Plot point (pulsing); Source Range, Startup Rate, Control Rod Position (steady)]



7. Withdraw a shorter pull and plot a fourth point to tighten the prediction.

7a. Hold CONTROL WITHDRAW until CONTROL ROD POSITION is 180 to 205. SOURCE RANGE should read about 3.0e3 or more.

Note: This pull is only 25 steps wide, so watch the position, not the clock.

Suggested time warp: 5×.

()  SOURCE RANGE reads 3.0e3 (3,000 counts per second) or more

7b. Wait for STARTUP RATE +0.03 or less, then press Plot point and read the prediction again.

Suggested time warp: 1×.

()  Point plotted

Background

Each step now buys more reactivity than the last, so the pulls get smaller from here. The prediction is starting to be useful. STARTUP RATE still falling means the counts are still climbing, and a point taken then puts the predicted crossing too far out.

[HIGHLIGHTED: Withdraw, Plot point (pulsing); Source Range, Startup Rate, Control Rod Position (steady)]



8. Withdraw the last short pull and plot the final point the approach is built on.

8a. Hold CONTROL WITHDRAW until CONTROL ROD POSITION is 195 to 205. SOURCE RANGE should read about 7.0e3 or more.

Note: This is the point the prediction is built on, so give it the time: STARTUP RATE takes about three to three and a half plant-minutes to reach +0.03 here, and a point plotted before it does throws the predicted position further out than it is.

Suggested time warp: 10×.

()  SOURCE RANGE reads 7.0e3 (7,000 counts per second) or more

8b. Wait for STARTUP RATE +0.03 or less, then press Plot point and note the critical rod position the 1/M panel predicts.

Note: The reactor goes critical at that position or just below it, so the next step stops short of it and taps from there.

Suggested time warp: 10×.

()  Point plotted

Background

This is the last plotted point: from here single steps beat one more fitted number, because another burst would land past critical. STARTUP RATE is the speedometer — 1.0 means power is multiplying by ten every minute, and any positive reading with the rods still means the chain reaction is growing. Under 1.0 is a comfortable climb; above it, nothing in the plant slows the rise yet.

[HIGHLIGHTED: Withdraw, Plot point (pulsing); Source Range, Startup Rate, Control Rod Position (steady)]



9. Bring the control rods to the edge of criticality without going past it.

9a. Press SLOW, then hold CONTROL WITHDRAW until CONTROL ROD POSITION is 3 steps short of the predicted position.

Note: The prediction reads HIGH, never low, so stopping short of it is the point. At SLOW the rods move about one step every 8 plant-seconds, so a short hold at 1× moves nothing. It ticks after the rods have been still for a plant-minute.

Suggested time warp: 1×.

()  Rods stopped 3 steps short of the 1/M prediction

9b. Tap WITHDRAW one step, wait about five plant-minutes, and read STARTUP RATE. Repeat until it reads +0.06 or more once it has stopped falling.

Note: Read the rate only once it has stopped falling, about ten plant-minutes after the last tap — the check-off waits for that too. Around 0.15, with PERIOD 150 to 200 seconds, is this approach going as written. Around 0.5, or PERIOD under 60 seconds, is about eight steps further out than you meant to be — power will arrive about three times sooner and level off higher. Over 1.0, tap INSERT once and wait. Near 0.01, with PERIOD in the thousands of seconds and nothing moving, means you have stopped short of critical — tap one more step out and wait. 0.02 to 0.05: one more step out. 0.06 to 0.10: fine, power just arrives later and levels lower (about 1 to 1½ %). SOURCE RANGE switches itself off above 1.0e5 and its tile goes blank; INTER RANGE carries the reading.

Suggested time warp: 10× while you wait; back to 1× before every tap.

()  STARTUP RATE +0.06 to +1.00 and steady, with the rods stopped

Background

Critical means the chain reaction keeps itself going: power rises with the rods still, and a positive STARTUP RATE is the sign. Below about 1 % power — the point where the reactor starts warming the water — nothing in the plant takes extra reactivity back out, so how far past critical the rods stop is what sets how fast power climbs.

[HIGHLIGHTED: Withdraw, Rod Speed — Slow (pulsing); Startup Rate, Reactor Period, Source Range, Control Rod Position (steady)]



10. Let the reactor carry power up from critical, reading INTER RANGE rather than REACTOR POWER.

10a. Leave the rods still. Watch INTER RANGE and STARTUP RATE; REACTOR POWER stays at 0.0 % for a long while.

Note: REACTOR POWER reads 0.0 % for about 30 to 60 plant-minutes after a read of 0.06 to 0.10; under 15 if you tapped on to about 0.15 while INTER RANGE climbs three decades. Never 60×, where a 2 ½ second glance away is two and a half plant-minutes of reactor. If the reactor trips, the SCRAM button reads SCRAMMED / PRESS TO RESET; press it before the rods will move again.

Suggested time warp: 10×.

()  INTER RANGE reads 1.0e-7 A or more
()  REACTOR POWER reads 0.1 % or more

Background

INTER RANGE is a current, not a percentage, and it can read a climb three decades below the point where REACTOR POWER shows its first tenth of a percent. That is why STARTUP RATE, PERIOD and INTER RANGE are the ones to steer on from criticality up: the power meter only joins the picture at the end.

[HIGHLIGHTED: Startup Rate, Reactor Period, Intermediate Range, Reactor Power (steady)]



11. Let power climb past the point of adding heat, tapping WITHDRAW only if the climb stalls.

11a. While STARTUP RATE is positive, leave the rods alone. Only if it falls back to 0.00 with REACTOR POWER below 0.5 %, press SLOW, tap WITHDRAW once, and wait again.

Note: SOURCE RANGE switches itself off above 1.0e5 and INTER RANGE carries the reading from here; there is no button for it. Once it has gone, close the 1/M PLOT window with the ✕ in its corner — its work is done. About 15 to 25 plant-minutes (about 5 to 7 after a 0.15 approach).

Suggested time warp: 5×, back to 1× before a tap. The plant behaves the same at any speed, but this is the step that may want a tap, and at 10× a tap has landed before you have read the rate.

()  REACTOR POWER reads 0.5 % or more

Background

With the reactor just critical, power climbs by itself and every extra rod step adds to a rise that is already under way. Below about 1 % the water is not yet warm enough to hold that climb back, which is why a high STARTUP RATE is a signal to wait, not to pull. The SOURCE RANGE detectors would wear out if they stayed on at power, so the plant switches them off by itself once INTER RANGE is reading.

[HIGHLIGHTED: Rod Speed — Slow, Withdraw (pulsing); Startup Rate, Intermediate Range, Source Range, Control Rod Position, 1/M Plot Tool (steady)]



12. Let power level itself off below 5 %.

12a. Leave the rods alone and watch REACTOR POWER stop rising on its own, near 1 to 3 %.

Note: The climb stops by itself about twenty plant-minutes after this step opens, and STARTUP RATE comes back to 0.00 on the way. The step checks off once REACTOR POWER has held still for five plant-minutes — leave the rods alone and let it. If power instead runs past 5 %: come back to 1×, press MED and hold INSERT until REACTOR POWER reads under 5 %, then release and let the plant settle before you read it. While the bank is driving in, STARTUP RATE is well below zero and power has not finished falling.

Suggested time warp: 10×; 1× if you have to insert.

()  REACTOR POWER below 5 %
()  REACTOR POWER steady, no longer rising

Background

Warmer water slows this reactor down, so the heat the climb makes is what stops the climb. Power finds a level for the rod position it was left at, and no further rod motion is needed to hold it. Below about 1 % that feedback was too weak to feel; from here it is what makes the plant steady.

[HIGHLIGHTED: Rod Speed — Normal, Insert (pulsing); Startup Rate, Intermediate Range, Control Rod Position (steady)]



13. Cross the 5 % line deliberately. That is Mode 1, At Power.

13a. Press SLOW, then hold CONTROL WITHDRAW for about 13 steps, then release and wait: power passes 5 % a few minutes later.

Note: Power climbs toward 8 to 10 %, and past 9 ½ % once the turbine takes load in the next step. It needs to: the turbine's startup trips cannot be blocked until REACTOR POWER is above 9 ½ %.

Suggested time warp: 5×.

()  REACTOR POWER above 5 %

Background

Mode 1, At Power, begins at 5 % power. The warming water now holds power back, so each rod step buys a new steady level rather than a runaway — about half a percent of power per step. The extra steps past 5 % are for the turbine: it needs REACTOR POWER above 9 ½ % before the startup trips will stay switched off.

[HIGHLIGHTED: Rod Speed — Slow, Withdraw (pulsing); Startup Rate, Intermediate Range, Control Rod Position (steady)]



14. Put the turbine on line and let the reactor follow it up.

14a. Press LATCH on the TURBINE-GENERATOR card.

Suggested time warp: 1×.

()  Turbine latched

14b. Set LOAD to 10 MW.

Suggested time warp: 10×.

()  Generator above 8 MW

Background

LATCH resets the turbine so it can take steam; LOAD is how much electricity the generator is asked for. As the generator picks up load, more steam is drawn, the water cools, and cooler water raises power — the reactor follows the turbine up to about 10 % by itself. That coupling is the central idea of this plant.

[HIGHLIGHTED: Turbine — Latch, Load Setpoint (pulsing); Turbine Load, Generator Output (steady)]



15. Block the first startup trip once REACTOR POWER is above 9 ½ %.

15a. Press TRIP BLOCKS on the ROD CONTROL card, then BLOCK on the IR HIGH FLUX (IR is INTER RANGE) row.

Note: Do this the moment REACTOR POWER is above 9 ½ %: at 25 % this trip fires. Below 8 % power the BLOCK button is dead and will not take the press at all; between there and about 9 ½ % it takes it and the block then goes out again by itself, because the block's automatic permission — the panel calls it P-10 PERMISSIVE — is read off REACTOR POWER, which wanders about ± 0.3 % and keeps dipping back under. If that happens, let power come up and press it again. The reactor keeps climbing while the panel is open.

Suggested time warp: 1×.

()  IR HIGH FLUX reads BLOCKED on the TRIP BLOCKS panel

Background

Two automatic shutdowns exist only to protect a startup, one at 25 % power and one at 35 %. Once power is up they would trip the reactor on the way to full power, so they are switched off one at a time. The plant keeps checking power is still up there, and switches them back on by itself if it falls, whoever switched them off.

[HIGHLIGHTED: Trip Blocks (pulsing)]



16. Block the second startup trip and close the panel.

16a. Press TRIP BLOCKS to open the panel again, then press BLOCK on the PR HIGH (LOW SETPT) row and close the panel.

Note: Any click outside the panel closes it, Continue included, so it is shut when this step opens. This switches off the second startup shutdown, at 35 %. Check both rows read BLOCKED — IR HIGH FLUX and PR HIGH (LOW SETPT) — while the panel is still open, then close it with TRIP BLOCKS again: it covers the rod buttons.

Suggested time warp: 1×.

()  PR HIGH (LOW SETPT) reads BLOCKED on the TRIP BLOCKS panel

Background

The second startup shutdown fires at 35 % if it is still live. Above 10 % the shutdown at 118 % power takes over the job of catching a runaway. Two separate presses on purpose: on a real board, switching one off never quietly switches off the other.

[HIGHLIGHTED: Trip Blocks (pulsing)]



17. Verify Mode 1, At Power.

17a. Read REACTOR POWER above 9 % and OUTPUT near 10 MW.

Note: IR HIGH FLUX and PR HIGH (LOW SETPT) were checked BLOCKED in the last step, before the TRIP BLOCKS panel was closed.

Suggested time warp: 1×.

()  REACTOR POWER above 9 %
()  OUTPUT near 10 MW

Background

The reactor is critical, the generator is carrying load, and both startup shutdowns are switched off. The plant is in Mode 1, At Power. From here the climb to full power is rods leading and the turbine following.

[HIGHLIGHTED: Reactor Power, Turbine Load, SG Level (steady)]



## Notes — agent record, NOT step text

*Drafted 2026-09-22 on the workbench lane from the develop working copy of `02_mode3_to_mode1.md`
(the newest text, carrying the owner's step 5 example). Nothing here is instruction to a player.*

**WHAT THIS DRAFT CHANGES AGAINST `02_mode3_to_mode1.md`, by the owner's numbered feedback:**

- **(3) Steps 8 and 9 at 10×, not 60×.** Step 8 was 60× only because the built pool's `hold: 600`
  makes the app GENERATE a 60× line; the authored hint already said "come back to 10×". Here the
  rung is authored 10× on 8a. Step 9's pull (9a) is 1× and its waits (9b) are 10×, which keeps
  the old note's "back to 1× before you move a rod again".
- **(4) A speed on every substep**, including the instant presses (1×) — struck those if they read
  as noise; the rule was applied literally so you can see what it costs.
- **(5) Old step 9 split.** New step 9 is the approach (9a pull to 3 short, 9b tap-and-wait, with
  the reading-remedies note). New step 10 is the climb from critical (INTER RANGE 1.0e-7 A and
  REACTOR POWER 0.1 %, the old step's two check-offs) with the "watch INTER RANGE, not REACTOR
  POWER" lesson and the SCRAM-reset line. Every number from the old 1,222-character note is still on
  one of the two cards; none were deleted.
- **(6) Old step 11 folded into new step 11's note** (the step whose acceptance is REACTOR POWER
  0.5 %, where the old note already said SOURCE RANGE switches itself off). The "close the 1/M
  window" instruction and old step 11's detector sentence moved with it; the Background gained one
  sentence for the detector.
- **Count stays 17**: one split (+1), one fold (−1).

**SPEED PROVENANCE — which rungs are MEASURED and which are picks.** The pool has ONE clock per
STEP (`wait_speed`, snapped to the ladder by `ui/app.js`), so a per-SUBSTEP speed has no runtime
field yet; bringing this down to the sim means either a new per-row field or the substeps
becoming steps. Until then the line is prose only.

| substep | rung here | provenance |
|---|---|---|
| 5a | 5× | OWNER, the 2026-09-22 example |
| 6a | 5× | my pick, same shape as 5a (63-step rung, 300 s settle) |
| 7a | 5× | OWNER RULING, 2026-09-24 ("7a 5×, 8b 10×") — SUPERSEDES the earlier 10× "my pick" row below: a 25-step window at 10× measured ~3 s of wall time (layman pass 3, #653 S-2), too fast to release on |
| 8a | 10× | OWNER, item 3 |
| 8b | 10× | OWNER RULING, 2026-09-24 ("7a 5×, 8b 10×") — 8b now carries the "wait for +0.03 or less, then plot" rate-wait (rod-window-leads reword), a real 3.0-3.5 plant-minute wait; measured 8.0 steps/wall-second at 10× vs 4.0 at 5× for MED |
| 9a | 1× | the old step 9 note ("come back to 1× before you move a rod again") |
| 9b, 10a | 10× | OWNER, item 3; matches the pool's MEASURED `wait_speed: 10` on old step 9 (`tools/glance_rung.js`, #796) |
| 11a | 5× | the pool's MEASURED `wait_speed: 5` on old step 10 |
| 12a | 10× | the 30 s rule on the pool's `hold: 240` (#796 restored the rung) |
| 13a | 5× | the pool's MEASURED `wait_speed: 5` |
| 14b | 10× | the 30 s rule on `hold: 240` |
| everything else | 1× | instant presses and observe steps |

**None of the new substep windows has been run through `tools/glance_rung.js`** — it grades pool
steps, and these substeps are not in the pool. Run it on the split steps 9 and 10 when they are
built; the rung is a ceiling and a 2.5 s glance is the yardstick.

**CHECK-OFFS THAT HAVE NO GRADABLE FIELD TODAY** (the sim will need one, or the row becomes prose):
9a "Rods stopped 3 steps short of the 1/M prediction" — RESOLVED 2026-09-24, see THE 9a GAP below. 3a "SG FEED reads AUTO" grades on `feed_coupled` already. Step 1's two rows are the pool's
existing `tavg_c ~ 286 ± 1.5 °C` (544 to 549 °F) plus a pressure band the pool does not grade.
Step 17's two rows replace the pool's single `plant_mode ~ 1`.

**Backslash escaping was not carried over.** The old file's `\.` and `\[` are its editor's
round-trip, not content; this file is written clean so the format itself can be read.

---

### Reconcile record — 2026-09-23, workbench lane (brought down to the sim)

*The draft above is now the live file; `ui/manual_procedures.js` `pwr_startup` (the PWR2 pool)
carries it. The previous live file's own Notes are in git history
(`git show HEAD~1:Blueprint/walkthrough_steps/02_mode3_to_mode1.md`).*

**Two corrections to the draft's notes above.** (1) "a per-SUBSTEP speed has no runtime field
yet" is stale: `accs[].wait_speed` / `speed_text` landed the same day (commit 8cb79600) and every
substep here now sets its own rung. (2) Step 1's shipped acceptance was `tavg_c ~ 286 ± 8 °C`
(532 to 561 °F), not ± 1.5; his 544-549 °F band is a narrowing, measured below.

**Tally.** 17 step lines, 23 lettered substeps, 27 check-off lines.
- **Taken from his text:** all 17 step lines (the sim's step line was the action; it is now his
  goal line), all 23 substep actions, 17 substep Notes, 23 speed lines (19 bare rungs, 4 prose:
  2a, 9b, 11a, 12a), 17 Backgrounds, and the check-off wording of the new rows (1, 9a, 9b, 11,
  13, 17).
- **Matched, unchanged:** the check-off labels of steps 2-8, 10, 12, 14-16 were already his
  words; 13 of 17 Backgrounds were already his (5, 9, 10, 11 changed — 5 gained "the criticality
  point", 9 lost its INTER RANGE sentence to 10, 10 is new, 11 gained the detector sentence);
  every `cmd`, `overtaken`, `implied_by`, render-band floor, `control`, `target` and `past`.
- **Deleted:** every step-level `note` (moved into its substep); from step 5's note the rod-speed
  and early-plot sentences ("MED moves 48 steps a minute…", "plot all four rungs early and the
  predicted critical position comes out about five rod steps too far out…"), which are not in his
  5a; the authored speed hints on 7 and 8 (his rungs replace them); the whole old step 11 (folded
  into 11's note); old 9's "Put the clock on 10× … come back to 1×" sentence (now 9b's rung line).
  Steps whose substeps carry their own speed line also stop printing the app's generated ⏩ line,
  which would have said the same rung twice.

**Grading changes, per step.**

| step | before | now | measured (full stack, `hot_zero_power`, seed 42 unless said) |
|---|---|---|---|
| 1 | AVG COOLANT TEMPERATURE 532-561 °F | his 544-549 °F **plus** PRIMARY PRESSURE 2200-2270 psi | preset: 546.3-548.2 °F, 2235-2242 psi, both met 296/300 broadcasts (rest = debounce); the chained route from Mode 5 passes too (`run_procedures_chain` 50/50) |
| 9 | (the climb's rows) | 9a rods not moved for 60 s → a hidden "still for 300 s" row → 9b STARTUP RATE 0.05 to 1.00, in order | never completes on a subcritical bank (202, 206, 207 on seeds 42 and 7); completes at bank 208 (+2.8 / +7.9 pcm) and on the authored creep to 213 at +383 s |
| 10 | — | old 9's two rows, unchanged | hold 1800 split 480 + 1320; power 0.1 % INHERITED at 964-1170 s into step 10 |
| 11 | REACTOR POWER > 0.5 % | ≥ 0.45 % (the tile's "0.5" floor) | met 1 s in on the replay (arrives at 0.83 %) |
| old 11 | SOURCE RANGE switched off | removed | secures 165 s after the creep (INHERITED), ~1,300 s before 0.1 % — 11's own row cannot be met with it still on |
| 13 | > 5 % | ≥ 5.05 % (the tile's "5.1" floor) | `> 5` at +45 s, `≥ 5.05` at +47 s |
| 14 | unordered | ordered: LATCH, then OUTPUT > 8 MWe | the second cannot be true before the first; no route lost |
| 17 | Mode 1 | REACTOR POWER ≥ 10.05 % and OUTPUT 8.51 to 11.49 MWe (tile floors of "above 10" and "near 10") | 10.48-11.43 %, 8.65-10.92 MWe over the 600 s after step 16; both met 5 s in |

**No band of his was changed.** Every number he wrote is the number on the card. The one number
that is mine is 9b's 0.05 floor: his line says "positive", and his note calls 0.01 "stopped
short" and 0.15 "as written". 0.05 is the lowest floor that, with the five-minute dwell, never
ticked a subcritical core in the table above; a four-minute dwell did (bank 207, seed 7,
−5.1 pcm, at +281 s).

**THE 9a GAP — RESOLVED 2026-09-24** (owner option selected that day: "Build a way for the sim to
read the 1/M prediction so '3 short' can be checked (new work); keep the cap."). It was: the
prediction existed only in the 1/M panel, so 9a ticked on "the rods have stopped" from any
position. Now each Plot point press sends its sample down, the instructor keeps the same table
through one shared fit (`RD.OneOverMCore`, layers/instructor_layer.js), and 9a also needs CONTROL
ROD POSITION at or below the prediction the panel PRINTS minus 3 — the instrument, not true
critical. Measured, live runtime, plots at banks 0/84/156/185/197, 120 s settles
(`run_checklist_pwr2` §2am):

| seed | prediction | stop at prediction | 2 short | 3 short | step completes (tap policy) |
|---|---|---|---|---|---|
| 42 | 211 | never | never | +63 s after the stop | +387 s |
| 7 | 210 | never | never | +63 s after the stop | +1296 s |

Further short still ticks. With no prediction printed (never plotted, one point, Clear, a rewind
past the last point) 9a ticks on the stop alone and the card says "The 1/M plot shows no
prediction, so this ticks once the rods have been still a plant-minute." — a row waiting on a
number the panel does not print would strand the player. The authored replay plotted mid-burst
and predicted 213, so its single +11 pull stopped AT the prediction; it is now +8 (bank 210),
then +3 once 9a latches, so the rest of the leg still starts from 213 (a stop at 210 alone left
REACTOR POWER at 0.003 % / 0.001 % at the end of step 10's 1320 s hold, seeds 42 / 7).

**Speeds 6a and 7a** ("my pick" above), run through `tools/glance_rung.js`: the power-glance
yardstick reads 0.000 % at every rung (the core is subcritical), so it cannot decide these. The
number that does is wall clock per rod step at MED: 0.25 s at 5× (6a), 0.12 s at 10× (7a) — the
same 0.12 s as his own 8a at 10×. Kept as written. Step 10 at 10× moves true power 0.086 % per
glance (0.186 % was accepted for the same window before the split).

**SUPERSEDED for 7a, 2026-09-24** — see the "Reconcile record — 2026-09-24 (f)" section below and
the SPEED PROVENANCE table above: the owner ruled 7a to 5× directly (measured too fast at 10× for
a 25-step window, layman pass 3 #653 S-2). 6a is unaffected.

---

### Carried over — the previous live file's agent record (verbatim, 2026-09-18 to 2026-09-22)

*Kept because it holds the dated owner rulings behind the step text; its step numbers are the OLD ones (old 9 = new 9 + 10, old 10 = new 11, old 11 folded into 11).*


*Moved out of the steps 2026-09-17 (OWNER, 2026-09-17: "the .md files with the text from the
walkthroughs are almost unreadable now with all the notes... keep the text clean so i can easily
edit them."). Nothing here is instruction to a player. Add new notes HERE.*

**THE FILE IS THE AUTHORITY FOR THIS WALKTHROUGH.** The built pool (`ui/manual\\\\\\\\\\\\\\\_procedures.js`) comes DOWN to the step text above. Highlights are the exception: a step with no highlight entry there keeps the highlights the pool has, per your standing instruction. Split out of `Blueprint/WALKTHROUGH\\\\\\\\\\\\\\\_STEPS\\\\\\\\\\\\\\\_OWNER.md` on 2026-09-15 *(OWNER DIRECTIVE, 2026-09-15: "I want to be able to manually review and edit the steps for the walkthroughs easier. can you make a folder within blueprints/ and create a new file for each walkthrough.")*.

**THE TICK AND CIRCLE MARKS IN THIS FILE CARRY NO MEANING** *(OWNER, 2026-09-17: "The tick vs circle in my writing was because I was copy/pasting from the sim and what needed up in the document was whatever state it happened to be in the sim at the time. It has no special meaning.")*. A row drawn with a tick was simply a row that happened to be CHECKED OFF on his screen when he copied it; a circle was one that was not. **Do not read them as authored intent, do not preserve them, and never change a step's kind to match one.** The step's kind is decided by what it asks the player to do — action or verify — not by the glyph. The same goes for the backslash escaping throughout: that is his editor's round-trip, not content. Leave it; do not "clean" it.

REVISED 2026-09-17, BACKGROUNDS. Every Background rewritten to the Mode 5 → 3 voice: plant-concept first, why this action here, 2–3 sentences, no instruction, no walkthrough commentary. Step 9's agent dump (length/gate argument, measurement table, "two things not said") moved here from the card. Steps 10–17 pasted from the built pool so the remaining Backgrounds have a home; their step lines are the pool's, not a fresh authoring. The built pool is not updated until he says to bring the sim down to this file.

Moved off step 9's card:

**THE LENGTH BARELY MOVED AND THAT IS A GATE, NOT A CHOICE.** 2,103 → 2,023 characters. `run\\\_style`'s W-detail check caps a details paragraph at three sentences, so Background could take only the core and the rest had to stay in the note. A real shrink needs either that cap relaxed for Background, or the actions turned into lettered `accs\\\_ordered` rungs the way steps 5–8 now are — a grading change that owes its own measurement. Recommendation: the `accs\\\_ordered` rungs.

ONE REMEDY WAS ADDED (#653 S-10): the note gave three remedies for a startup rate too HIGH and none for too LOW. The reviewer settled at +0.01 decades per minute with PERIOD reading 2,391 s and stalled. On-plan figures: about 0.15 settled, PERIOD 150 to 200 s; under 60 s means too far out.

|after the rods stop|+11 creep → bank 213 (+5)|+19 creep → bank 221 (+13)|
|-|-|-|
|STARTUP RATE at 12 s|0.255|0.568|
|STARTUP RATE settled|0.163|0.525|
|PERIOD settled|158 s|49 s|
|REACTOR POWER first reads 0.1 %|1396 s (23.3 plant-minutes)|400 s (6.7 plant-minutes)|
|INTER RANGE over that window|9.7e-10 → 2.5e-6 A|3.3e-9 → 5.7e-4 A|
|power levels at|about 4 %|7.0 %|

Two things deliberately NOT said, because they did not reproduce: the first reading after a single TAP is **1.3×** the settled value (0.137 → 0.187 → 0.16), not the seven times an earlier report proposed — that seven came from a continuous withdrawal, not a tap; and power arrives about **three** times sooner when over-withdrawn, not six. There is also no startup-rate rod block on this plant, so the step never implies one exists.

REVISED 2026-09-15 (#653 S-7): the step said "Press ACKNOWLEDGE"; the board control is labelled **ACK** (and `Ack All`).

REVISED 2026-09-15 *(OWNER RULING, 2026-09-14: "Drop the number entirely")*. The old background said "boron is already near 719 ppm", which is true of one route and wrong about the other — MEASURED: the Hot Standby preset boots at 718.9 ppm, the chained route from the Mode 5 to Mode 3 walkthrough arrives at 917.8 ppm. The step now sends the player to BORON CHEM instead of naming a value.

REVISED 2026-09-15, TWO DEFECTS ON ONE CARD. **(#759)** the old sentence *"Plot point does nothing until the counts are steady"* was FALSE — measured, an out-of-turn press adds real points at rod position 0 and only `Clear` removes them *(OWNER RULING, 2026-09-15: selected "Fix the text AND say why (Recommended)")*; the card's one-line reason on an out-of-turn press is ui/app.js and is not this file's half. **(#653 S-5)** the ⏩ line is GENERATED from the step's 300 s hold and already said "set the speed control to 10×"; the authored hint said 10× a second time in the same line, so the card read *"About 5 plant-minutes at 1× — set the speed control to 10x. Set the speed control to 10x if you don't want to wait…"*. The authored hint is deleted; only the generated line remains.

REVISED 2026-09-15 (#653 S-5): same duplication as step 5 — the authored hint repeated the generated line's 10×. Deleted.

REVISED 2026-09-15, TWO DEFECTS. **(#653 S-11)** *"and the settle takes longer at every rung"* was an unmeasured claim in player copy: measured on the built pool, **all four settle rungs on steps 5–8 carry IDENTICAL acceptances** — `startup\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_rate \\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\~0 ±0.02`, then counts `steady` at 3 % over a 120 s window. The PLANT does settle more slowly nearer criticality (your own observation, verified above: counts-steady at 223 / 226 / 281 / 507 s), but the live durations were not re-measured in this pass, so the sentence is removed rather than replaced with a number nobody has taken. **(#653 S-5)** this step's hold is 420 s, so the GENERATED line offers **60×** while the authored hint said **10×** — one line, two speeds, and 60× is wrong for the rod pull this step opens with (the rung is 25 steps wide, 180 to 205, and MED is 48 steps a minute at 1× — this file's own step-5 figure — i.e. 48 a second at 60×). The hint now says which rung is for which half.

REVISED 2026-09-17, STEPS 5–8 — THE THIRD LINE ON ALL FOUR RUNGS IS NOW "RODS STOPPED", NOT "COUNTS STEADY" *(OWNER RULING, 2026-09-17: selected "Gate on rods stopped + startup rate" from three options — gate on rod-stop plus startup rate, remove the steady row and keep startup rate alone, or keep the steady row)*. Both of the old rows were PROXIES for "you have stopped pulling", and one route defeats both: MEASURED, one bank step withdrawn every 20 s satisfies the startup-rate row with the rods still moving at rungs 5 and 6, and the counts-steady row with the rods still moving at rung 5 — and rung 6 is inside the panel's trailing-three fit window. The counts-steady row also bought 0.6 of a bank step for 445 s of waiting, against a ladder whose own spread is 2 steps. The new line reads the fact itself: the bank has not moved for a minute. A MINUTE is not a round number — measured at taps of 2 / 5 / 10 / 20 / 30 / 45 / 60 / 75 s, the line can be satisfied with the rods still moving if and only if the tap cadence is at or above its own quiet time, so the quiet time IS the slowest tap cadence the rung refuses, and 60 s is three times the slowest dribble that defeated the old rows. It costs 47 s at rung 5, 2 s at rung 6 and nothing at rungs 7 and 8, where the startup rate is the longer wait. The `hold` values (300 / 300 / 420 / 600) are unchanged.

REVISED 2026-09-15 *(OWNER RULING, 2026-09-14: "Rewrite both")*. The step's settle went from 150 s to 600 s. MEASURED on this tree, the authored ladder with the panel's own trailing-three fit, four seeds, against a true critical of control bank 208 of 627: at a 150 s settle the final prediction reads 210.6 to 211.7 (+2.6 to +3.7 steps high); at 600 s it reads 208.0 to 209.0 (0 to +1). The error was never the fit — the counts are only about two-thirds of the way up when a 150 s hold expires.

REVISED 2026-09-15, THE NOTE SPLIT BY KIND (#653 S-12 and S-10). MEASURED on the built pool before the edit: note **2,103 characters**, Background 502, step text 107 — eleven numeric thresholds and three conditional remedies at the same visual weight as the five actions. The 2026-09-15 layman reviewer read it twice, retained the lesson ("watch INTER RANGE, not REACTOR POWER") and **lost the action** ("stop 3 steps short"), which is the wrong half to lose. The note now carries only what the player DOES and the readings that tell them to do something else; everything that explains the plant moved to the END of the note, behind "Behind the readings:". **Nothing was deleted — every number is still on this step.**

REVISED 2026-09-15 *(OWNER RULING, 2026-09-14: "Rewrite both")*, answering "the rate the power climbs seems to be is nothing until it suddenly shoots up in power if the user has pulled the rods out too far. It could be we need to explain how to use the intermediate range better."

MEASURED on this tree, full stack, the authored route driven end to end (ladder at MED with the new 600 s last settle, then the creep at SLOW), true critical control bank 208 of 627:



RECONCILED 2026-09-18 — THE SIM WAS BROUGHT DOWN TO THIS FILE. 17 steps in, 17 out: no step added, none dropped, none re-ordered. **20 fields changed** — one step line (step 1), two notes (steps 1 and 9, both pure trailing deletions) and **all 17 Backgrounds**. Everything else already matched byte for byte and was left alone: every lettered acceptance row on steps 5–8, 12 and 14, every ⏩ line, and step 9's "Watch for:" line. The runtime plumbing this file does not carry — `acc`, `accs`, `accs\\\_ordered`, `cmd`, `hold`, `overtaken`, `hl`, `hl\\\_watch` — was not touched, so every highlight the pool had it still has.

ONE LINE OF YOURS DID NOT FIT A GATE AND WAS SHORTENED BY THREE WORDS. Your step 1 reads "Verify the plant is hot and shut down: … Reactor Coolant Pump (RCP) FLOW on." — **23 words** against `run\\\_style`'s scored 20-word cap on a step's instruction line. The old line sat at exactly 20 and spelling the pump out costs three. What ships is "Verify hot and shut down: … Reactor Coolant Pump (RCP) FLOW on." — your addition kept, the filler "the plant is" cut. Same remedy as Mode 5 → 3 steps 4 and 6. If you want the longer opening back, a clause has to move into the italic note instead.

STEPS 5–8 DESCRIBE THE SHIPPED GRADING CORRECTLY — checked, because they were re-gated the day before. The third row on all four rungs grades on the bank not having moved for a minute, not on the counts flattening, and your rows say exactly that.

WHAT THE DELETIONS COST, so it is on the record and not rediscovered as a defect: step 1's note lost its "BORON CHEM is the live loop concentration…" tail and its Background lost the boron clause; step 9's note lost the "Behind the readings:" instrument-teaching tail (2,023 → 1,222 characters); step 15's Background lost "This one also clears a rod stop at 20 %." Nothing else left the leg.

REFRESHED FROM THE SIM 2026-09-21 — DIRECTION FLIPPED FOR ONE PASS *(OWNER, 2026-09-21: "update
the .md files to what is in the sim for the walkthrough steps")*. Written FROM the built pool
(`ui/manual\_procedures.js`, id `pwr\_startup`), not the other way round. 17 steps in, 17 out. Format
is the one 03–06 carry; the same renderer reproduces those four byte for byte. It does NOT render
the panel's done-when (`✓ When …` / `○ When …`), the ⏩ speed hint or a hand-written HIGHLIGHT line —
none of the three is a field this file can set. **The banner at the top still stands for normal
work: you edit here, the pool comes down.** This pass was the exception you asked for.

**YOUR LINES THAT THE REFRESH REPLACED.** Left of the arrow is what this file said, right is what
ships:

* step 1 — "Verify **the plant is** hot and shut down: …" → "Verify hot and shut down: …". Already on the record below: your line is 23 words against `run\_style`'s scored 20-word cap, and the filler was cut to keep your "Reactor Coolant Pump (RCP)".
* step 2 done-when — you struck "(BORON CHEM after a sample)" from "Boron in the loop (BORON CHEM after a sample) 679 to 759 ppm". That parenthetical is the `boron\_ppm` label in `ui/app.js` (\~line 4255), not a step field, and was not changed.
* step 4 — "**Before moving the control rod group:** press 1/M PLOT…" → "**Before any rod moves:** press 1/M PLOT…". This was your 2026-09-21 edit; commit a4f6c9dd recorded it as owed to the pool and it was still owed when this refresh ran, so the refresh took it back out.
* steps 5–8 — your four rungs read "**Raise SOURCE RANGE past** 7.0e2 / 1.4e3 / 3.0e3 / 7.0e3, **stop the rods, let STARTUP RATE fall to zero / settle**, then plot…". What ships is "**Hold WITHDRAW** (at MED, step 5) **until SOURCE RANGE passes** …. Let STARTUP RATE fall to zero, then plot…". Same four thresholds and the same order; the difference is that yours names the reading to raise and the pool's names the button to hold.

Two of these — step 4 and the step 2 done-when — are the divergence a4f6c9dd flagged rather than
resolved. It is now resolved in the sim's favour BY THIS REFRESH, which is what you asked for; if
you want the other resolution instead, re-edit the step above and say so, and the pool comes down.


---

### Reconcile record — 2026-09-23 (d), workbench lane: four owner rulings on the layman playtest

*The four rulings below are **selections** from options put to him in a question dialog on
2026-09-23. The quoted text is the OPTION he selected, not his own words (Hard Rule 11). Every
change is in this file AND in `ui/manual_procedures.js`; measurements are the live checklist runtime,
full stack, `hot_zero_power`, seeds 42 and 7, unless marked INHERITED.*

**1. Step 17 — OWNER RULING (2026-09-23): selected "Keep 10 MWe, grade 9 %"** (option text: "Text
says power ends 'near 10 %'; step 17 is checked at 9 %. The first trip block needs power above
10 %, so step 15 gets tight.").
- 17a and its check-off now read "above 9 %", graded at 9.05 % (where the tile first prints "9.1").
- "near 11 %" → "near 10 %" in step 13's note and target; "about 11 %" → "about 10 %" in step 14's Background.
- Measured at LOAD 10 MWe, 1200 to 2400 s after LOAD, eight routes (rod stops 209 to 225): power
  settles at 9.67 to 10.66 %. The old 10.05 floor was met only on the load overshoot. The new floor
  ticks 4 to 10 s after step 17 opens on every route, including a player who reaches it 20
  plant-minutes late.
- **CHANGED BEYOND THE RULING — for your review.** Step 15's line and note, and step 13's note and
  Background, said "above 10 %". They now say **"above 9 ½ %"**. Why: on your own route (stop at 213,
  then +13) power settles at 9.69 to 9.84 %. It reads "10" only during the load overshoot and
  never again, so "do this the moment REACTOR POWER is above 10 %" is a cue a player can miss for
  good. Measured: a player who presses once the tile reads 9.5 gets the block on the first press on
  all five routes, and both blocks are still set 600 to 2400 s after LOAD. The block also held when
  pressed 20 plant-minutes late at 9.73 %. Step 15's note already said the block "goes out again"
  only below about 9 ½ %. The next leg's 9 % entry check still clears (lowest reading 9.67 %).

**2. Step 9b — OWNER RULING (2026-09-23): selected "Reword".**
- 9b now reads "Repeat until it reads +0.06 or more five minutes after the tap". The note gains
  "0.02 to 0.05: one more step out." (24 words, under the 30-word cap.)
- **CHANGED BEYOND THE RULING:** the check-off label "STARTUP RATE positive and steady with the rods
  stopped" became "STARTUP RATE +0.06 to +1.00 with the rods stopped". The old label named the
  "positive" that the ruling retired. The band is graded at 0.055 to 1.005, which is exactly what
  the tile prints as +0.06 to +1.00.

**3. Step 12 — OWNER RULING (2026-09-23): selected "Grade real level-off"** (option text: grade
"REACTOR POWER steady" in place of the rate row, and "near 4 %" becomes "near 3 %").
- The STARTUP RATE row is replaced by "REACTOR POWER steady, no longer rising". It is graded as
  under 3 % change between the two halves of a 300-second window, and it cannot tick before
  300 s.
- 12a now says "near 3 %".
- Measured check-off times after step 12 opens:

  | route | checks off | power level |
  |---|---|---|
  | your route (stop at 213, no tap) | +1105 s / +1168 s | 2.9 / 2.6 % |
  | the sim's replay (215) | +982 s | 4.0 % |
  | the reviewer's route (210) | +1390 s / +1402 s | 1.4 / 1.1 % |
  | 209 | +1369 s | 0.9 % |

  Before this change it ticked at +3 s at 209 and 210.
- **CHANGED BEYOND THE RULING:** the note sentence "The step checks off once the rate is under 0.10,
  which comes about fifteen minutes before power finally levels" described the old grading and now
  reads "The step checks off once REACTOR POWER has held still for five plant-minutes". "About twenty
  plant-minutes after the rods stop" now reads "…after this step opens": measured, 16 to 23 minutes
  from the step opening, but about 45 minutes from the rods stopping on your route.
- The insert branch completes. A player who inserts until power comes back under 5 % stops 3 steps
  in, at 216, and the step checks off at +535 s. **Known limit:** after a blind 14-step insert
  (219 → 205, or 225 → 211) the steady row can tick at the turnover, where power stops rising and
  starts falling (+468 s at 2.4 % and falling; +301 s). The step still completes, just early. Keeping
  the rate row as well would have LOCKED the 219 case: a subcritical core decays with the rate
  steady at −0.05.

**4. Three text gaps — OWNER RULING (2026-09-23): selected "Add all three".** AGENT-ADDED lines, for
your review:
- 5a note: "STARTUP RATE is back to 0.00 about half a plant-minute after the rods stop." Measured:
  the tile reads 0.00 at +26 s and +28 s after the 94-step pull stops. The later rungs are slower
  (step 6 +80/+85 s, 7 +203/+181 s, 8 +431/+419 s), so step 6's "see step 5" now points at a
  shorter wait than step 6's own.
- 9a note: "At SLOW the rods move about one step every 8 plant-seconds, so a short hold at 1× moves
  nothing." Measured 7.0 to 7.3 s per step (11 steps in 79 s).
- 16a: "Press TRIP BLOCKS to open the panel again, then press BLOCK on the PR HIGH (LOW SETPT) row and
  close the panel." Its note gains "Any click outside the panel closes it, Continue included, so it
  is shut when this step opens."

RULED 2026-09-24 — two text changes, selections from options put to the owner (option text, not verbatim words). Step 12's insert branch: selected "Insert until under 5 %" — "about 14 steps" became "until REACTOR POWER reads under 5 %" (measured by the 2026-09-23-d pass: stops after 3–5 steps and completes correctly; a blind 14-step insert let the level-off row tick while power was still falling). Step 6: selected "Own number" — "see step 5" became "about a minute and a half after the rods stop" (measured +80/+85 s on seeds 42/7).

---

### Reconcile record — 2026-09-24 (e), workbench lane: five owner rulings on the 2026-09-24 layman pass 2 (#653)

*Selections from options put to him in a question dialog on 2026-09-24. The quoted option text is
what he selected, not his own words (Hard Rule 11). Changed in this file AND in
`ui/manual_procedures.js`'s `pwr_startup` pool. Measurements are `Diagnostic/CHECKLIST_PLAYTEST_2026-09-24_LAYMAN_PASS2.md`.*

**1. Selected "Add a 0.06–0.10 band".**
- 9b note gains "0.06 to 0.10: fine, power just arrives later and levels lower (about 1 to 1½ %)."
  before → after: unchanged text, sentence appended.
- Step 10 note: "about twenty-five plant-minutes" → "about twenty-five to thirty-five plant-minutes"
  (owner's authored ~25 min; the 0.06–0.10 route measured ~35 min).
- Step 12 action line: "near 3 %" → "near 1 to 3 %" (authored route ~2.6–2.9 %; the 0.06–0.10 route
  measured 0.9–1.5 %).
- No other line in steps 10–13 had a measured bound for both routes in the report, so none else
  was touched (step 11's "About 15 plant-minutes" has only the shallow-route number, ~17 min — left
  as is; NOT verified for the authored route).

**2. Step 13 note — selected "Reword".** "Power settles near 10 % from here." → "Power climbs toward
8 to 10 %, and past 9 ½ % once the turbine takes load in the next step." The rest of the note
("It needs to: the turbine's startup trips cannot be blocked...") is unchanged; still true. Step
13's pool `target` field carried the same claim ("settling near 10 %") and was moved to match
("climbing toward 8 to 10 %") for consistency — that field has no MD counterpart, so it is not a
ruling item, but leaving it stale would contradict the reworded note.

**3. Selected "Take all" — six items:**
- 9b note gains "SOURCE RANGE switches itself off above 1.0e5 and its tile goes blank; INTER RANGE
  carries the reading."
- 9a note gains "It ticks after the rods have been still for a plant-minute."
- Step 6 goal line: "the fit now prints its first prediction" → "the prediction tightens" (also the
  pool's step 6 `text` field, the only other place the claim appeared).
- "Hold WITHDRAW" → "Hold CONTROL WITHDRAW" on steps 5a, 6a, 7a, 8a, 9a, 13a (every substep asking
  for a hold on the control bank). "Tap WITHDRAW" (9b, 11a) was left as written — the ruling named
  the "Hold WITHDRAW" phrase, and S-8's confusion was specifically about the held pull. Verified
  against `ui/diagram/board/pwr_board_wiring.js`: both rod-group WITHDRAW buttons carry the bare
  label "WITHDRAW" (tooltip-distinguished as "(control bank)" / "(shutdown bank)"), so "CONTROL
  WITHDRAW" names the button by its card column, matching S-8's own suggested fix.
- "lit" → "reads BLOCKED" for every TRIP BLOCKS row reference: steps 15a, 16a (note and both
  check-offs), 17a note, and the pool's `target` fields on steps 15 and 16. Verified against
  `pwr_board_wiring.js` line 3841: the row's own text is `blocked ? 'BLOCKED' : 'BLOCK'` — there is
  no "lit" state on this control.
- Steps 5–8: "Let STARTUP RATE fall to zero" / "fall all the way to zero" → "Let STARTUP RATE fall
  to about +0.01 to +0.03" (S-4, confirmed deliberate grading — the rate parks at +0.01 to +0.03
  and the row grades on rod-stop, not on the rate reaching literal zero).

**4. Selected "Add all three" (word/on-board gaps, item 6 of the dialog):**
- Step 1 note: dropped ", short form TURB TRIP" — verified against `layers/control/pwr_control.js`:
  the alarm's `label_industry` is `'TURB TRIP'`, real, but it is the Industry-register form of the
  row and is not printed alongside the Learning label the step already names; claiming it as a
  "short form" on the list the player sees was the S-7 confusion.
- Step 3a: "Check SG FEED reads AUTO." → "Check the SG FEED AUTO button is lit." Check-off "SG FEED
  reads AUTO" → "SG FEED AUTO lit (card reads HOLDING)". Verified against
  `ui/diagram/board/pwr_board_wiring.js`: the SG FEED card's corner status word is the literal
  string `'HOLDING'` when feed is engaged and healthy (lines 393/417/5431); the card never draws
  the word "AUTO" as its status — only the AUTO button itself lights.
- Step 15a note: "because the permissive is read off the power-range meter" → "because the block's
  automatic permission — the panel calls it P-10 PERMISSIVE — is read off the power-range meter."
  Verified against `pwr_board_wiring.js` lines 3114/3116: both startup-trip rows on the TRIP BLOCKS
  panel print `(P-10 PERMISSIVE)`; P-11 belongs to the unrelated pressure-trip rows elsewhere on the
  same panel and is not named here.
- Steps 7 and 8 ("rung"): "a shorter rung" → "a shorter pull", "the last short rung" → "the last
  short pull", "This rung is only 25 steps wide" → "This pull is only 25 steps wide". No on-board
  control uses the word "rung"; it was narrative shorthand only.
- Step 14: "10 MWe" → "10 MW" (goal-line target, check-off, and the pool's `target`/`label` fields);
  step 17: same, "near 10 MWe" → "near 10 MW". Verified: the board's LOAD box and OUTPUT tile both
  print "MW", never "MWe" (S-10; `mwe_output` is the engine's internal channel name, not a rendered
  string).

**NOT changed, and why.** "permissive" and P-10/P-11 in step 16 were left alone — step 16's text
never uses the word "permissive", so there was nothing to gloss there; both its rows share step
15's P-10, already explained on first use. Step 9a's check-off label and grading are untouched per
the coordinator's instruction (another agent is re-grading it). Step 11's "About 15 plant-minutes"
was not converted to a range — the report gives only the shallow-route number (~17 min) for this
particular row, no authored-route figure to pair it with.

---

### Reconcile record — 2026-09-24 (f), workbench lane: six owner rulings on the 2026-09-24 layman
pass 3 (#653) and its comment

*Selections from options put to him in a question dialog on 2026-09-24. The quoted option text is
what he selected, not his own words (Hard Rule 11). Changed in this file AND in
`ui/manual_procedures.js`'s `pwr_startup` pool. Measurements are
`Diagnostic/CHECKLIST_PLAYTEST_2026-09-24_LAYMAN_PASS3.md` and the #653 comment
(github.com/TH462/Reactor-Dynamics/issues/653#issuecomment-5816333693), used verbatim per the
coordinator's numbers — none re-measured in this pass.*

**1. Selected "Take all" (S-4 timing gaps, S-7 wording, S-8 wording):**
- Step 10 note: "about twenty-five to thirty-five plant-minutes" → "about 45 to 60 plant-minutes
  after a read of 0.06 to 0.10; under 10 if you tapped on to about 0.15". Matches the report's own
  numbers: the 0.06-0.10 route measures step 10 at 45.4-56.7 min; the as-written ~0.15 route
  measures 5.7-8.0 min (both seeds).
- Step 11 note: "About 15 plant-minutes." → "About 20 to 25 plant-minutes (about 7 after a 0.15
  approach)." Matches: the 0.06-0.10 route measures step 11 at 20.0-24.8 min; the ~0.15 route
  measures 7.1-7.7 min.
- Step 15: "power-range meter" → "REACTOR POWER" (S-7: not a board label). "IR HIGH FLUX" glossed
  once, at its first appearance (15a's action line): "IR HIGH FLUX (IR is INTER RANGE)". Not
  repeated on step 15's check-off or step 17's note, which both name it a second time.
- Step 1 note: "counts should be steady" → "counts should be wandering around one level, not
  climbing" (S-8: SOURCE RANGE flickers 4.9e2-5.5e2 with nothing moving; a layman read the noise
  as "not steady").

**2. Selected "Rod window leads" (S-1, steps 5-8, two stop rules on one card).**
The rod-position window is now the STOP RULE in each pull substep's action line; the SOURCE RANGE
count is a confirmation, "should read about … or more". "Wait for STARTUP RATE +0.03 or less,
then plot" now appears once per step, in the plot substep (5b/6b/7b/8b), replacing the old
"Let STARTUP RATE fall to about +0.01 to +0.03" clause that sat on the pull substep. "back to
0.00"/"back to zero" is removed from steps 5 and 8's notes (both described a threshold the rate
does not literally reach — it parks at +0.01 to +0.03 — and the new "+0.03 or less" language is
the actual gate).

| substep | before (`ask` / relevant note text) | after |
|---|---|---|
| 5a | "Hold CONTROL WITHDRAW at MED until SOURCE RANGE passes 7.0e2. Let STARTUP RATE fall to about +0.01 to +0.03." / note: "Stop when CONTROL ROD POSITION reads about 80 to 100. STARTUP RATE is back to 0.00 about half a plant-minute after the rods stop." | "Hold CONTROL WITHDRAW at MED until CONTROL ROD POSITION is 80 to 100. SOURCE RANGE should read about 7.0e2 or more." / no note |
| 5b | "Press Plot point to plot the second point." | "Wait for STARTUP RATE +0.03 or less, then press Plot point to plot the second point." / note: "STARTUP RATE reaches +0.03 or less about half a plant-minute after the rods stop." |
| 6a | "Hold CONTROL WITHDRAW until SOURCE RANGE passes 1.4e3. Let STARTUP RATE fall to about +0.01 to +0.03." / note: "Stop when CONTROL ROD POSITION reads about 150 to 175 steps. Wait for the rate before you plot: about a minute and a half after the rods stop." | "Hold CONTROL WITHDRAW until CONTROL ROD POSITION is 150 to 175. SOURCE RANGE should read about 1.4e3 or more." / no note |
| 6b | "Press Plot point, then read the predicted rod position the panel prints." | "Wait for STARTUP RATE +0.03 or less, then press Plot point and read the predicted rod position the panel prints." / note: "STARTUP RATE reaches +0.03 or less about a minute and a half after the rods stop." |
| 7a | "Hold CONTROL WITHDRAW until SOURCE RANGE passes 3.0e3. Let STARTUP RATE fall to about +0.01 to +0.03." / note: "Stop when CONTROL ROD POSITION reads about 180 to 205 steps. This pull is only 25 steps wide, so watch the position, not the clock." | "Hold CONTROL WITHDRAW until CONTROL ROD POSITION is 180 to 205. SOURCE RANGE should read about 3.0e3 or more." / note: "This pull is only 25 steps wide, so watch the position, not the clock." |
| 7b | "Press Plot point, then read the prediction again." | "Wait for STARTUP RATE +0.03 or less, then press Plot point and read the prediction again." |
| 8a | "Hold CONTROL WITHDRAW until SOURCE RANGE passes 7.0e3. Let STARTUP RATE fall to about +0.01 to +0.03." / note: "Stop when CONTROL ROD POSITION reads about 195 to 205 steps. This is the point the prediction is built on, so give it the time: STARTUP RATE takes about six plant-minutes to come back to zero here, and a point plotted before it does throws the predicted position further out than it is." | "Hold CONTROL WITHDRAW until CONTROL ROD POSITION is 195 to 205. SOURCE RANGE should read about 7.0e3 or more." / note: "This is the point the prediction is built on, so give it the time: STARTUP RATE takes about three to three and a half plant-minutes to reach +0.03 here, and a point plotted before it does throws the predicted position further out than it is." |
| 8b | "Press Plot point, then note the critical rod position the 1/M panel predicts." | "Wait for STARTUP RATE +0.03 or less, then press Plot point and note the critical rod position the 1/M panel predicts." |

The "about six plant-minutes to come back to zero" figure on step 8 is corrected to "about three to
three and a half plant-minutes to reach +0.03": the ruling's own instruction (fix step 8's timing
to match the "+0.03 or less" gate) and the task's measured figure of 3.0-3.5 plant-minutes.

**Grading is UNCHANGED on all eight rows** — `p`/`op`/`v` (`sr_counts_cps >= 695/1350/2950/6950`)
stay the grading predicates for 5a-8a; the check-off `label` text ("SOURCE RANGE reads … or more")
is left as written, since it is a factual reading and does not itself claim to be the stop rule.
**Grading question for the owner, not decided here:** whether the check-off `label` on 5a-8a should
also be reworded to read as a confirmation (e.g. "… confirmed" or similar) now that the action line
leads with the rod-position window — left as is per the instruction to reword the label only if it
falsely claims to be the stop rule, which it does not.

**3. Selected "7a 5×, 8b 10×" (S-2, a 25-step window at 10× is ~3 s of wall time).**
- 7a: `wait_speed` 10× → 5×; "Suggested time warp" line "10×." → "5×."
- 8b: `wait_speed` 1× → 10×, with the new "wait for the rate" ask above giving the line a reason to
  need one — the plot substep is now a real 3.0-3.5 plant-minute wait, not an instant press.
  Measured: 8.0 steps per wall-second at 10× vs 4.0 at 5× for MED.
- Speed-provenance table above updated (7a, new 8b row); the older "Speeds 6a and 7a" paragraph
  gained a superseding pointer rather than being rewritten, since it is a historical record of the
  2026-09-23 pick that this ruling replaces for 7a only.

**4. Selected "Take all" (S-6, step 13, "about 13 steps" took 18).**
- 13a: "Press SLOW, then hold WITHDRAW until REACTOR POWER passes 5 %, about 13 steps." →
  "Press SLOW, then hold CONTROL WITHDRAW for about 13 steps, then release and wait: power passes
  5 % a few minutes later." Grading is unchanged (`power_pct >= 5.05`, "REACTOR POWER above 5 %").
- **CHANGED BEYOND THE RULING, a correction found during this pass:** the previous ("d") reconcile
  record claimed 13a already read "Hold CONTROL WITHDRAW" (part of the "Hold WITHDRAW → Hold
  CONTROL WITHDRAW" rewording on steps 5a/6a/7a/8a/9a/13a), but the file and the pool both still
  read bare "hold WITHDRAW" on 13a — that record was written but the edit was never applied to this
  step. This pass's rewrite adds "CONTROL" as originally ruled, fixing the gap while it was open
  for this step anyway.

**5. Selected "Reword" (option: step 15's card).** Already covered under item 1 above (the "power-
range meter" → "REACTOR POWER" swap and the "IR" gloss) — filed together here since both came off
the same S-7 finding.

**6. Selected "Keep both" (a question on the "Past the mark" card line and 9a's "at least 3 short"
grading).** No text or code change: the `ui/app.js`-drawn "Past the mark: the 1/M plot predicts
step …" card line stays exactly as built, and 9a's `below_1m: 3` grading — which already accepts
ANY stop at or below prediction-minus-3, i.e. "at least 3 short" — is unchanged. Recorded here only
because a ruling was asked for and given; nothing in the sim or this file moved.

### Reconcile record — 2026-09-24 (g), rp_start lane: step 9b grades a SETTLED rate

*Coordinator's call on a grading defect (no owner ruling asked): `test/run_walkthrough_routes.js`
found the typical route stranding at step 10. Changed in this file AND in `ui/manual_procedures.js`'s
`pwr_startup` pool.*

**The defect (MEASURED, typical route, seed 42).** 9b passed on ONE read of STARTUP RATE 0.069 at
bank 208, taken 5 plant-minutes after the pull while the rate was still falling (0.048 at 10 min,
0.024 at 40). Step 10's climb to 0.05 % then took 127.3 plant-minutes against this card's "45 to 60".
The card's own note already said "Read the rate only once it has stopped falling"; the grading did not.

**The grading change.** A hidden `steady` row on STARTUP RATE (half-window means within 5 % over a
trailing 240 s) sits between the hidden five-minute dwell and the drawn rate row. One more conjunct:
it cannot make a sub-critical bank complete. Measured per fixed bank (first meet after the last rod
motion): 208 never (it must be tapped on — settles 0.022); 209 +13.2 min at 0.062; 210 +12.6 min at
0.089; 211 +10.4 min at 0.115; 213 +8.8 min at 0.179. Typical route now: reads 208/0.069 (wait),
208/0.048 (tap), 209/0.059 (tap), 210/0.084, done. Removing the row re-opens the strand (mutation
`no_settle_9` in the route gate). Step 9's replay `hold` 480 → 720 s.

**Text changed (four lines; everything else as written):**
- 9b action: "Repeat until it reads +0.06 or more five minutes after the tap." → "Repeat until it
  reads +0.06 or more once it has stopped falling."
- 9b note, first sentence: "Read the rate only once it has stopped falling, about five minutes after
  the last tap." → "Read the rate only once it has stopped falling, about ten plant-minutes after the
  last tap — the check-off waits for that too." (measured 7-12 min after the last rod motion)
- 9b check-off: "STARTUP RATE +0.06 to +1.00 with the rods stopped" → "STARTUP RATE +0.06 to +1.00
  and steady, with the rods stopped"
- Step 10 note: "about 45 to 60 plant-minutes after a read of 0.06 to 0.10; under 10 if you tapped on
  to about 0.15" → "about 30 to 60 …; under 15 …". Measured step 10: 31.1 min (seed 42, read 0.084),
  45.5 (seed 7, read 0.063), 56.6 (fixed bank 209, read 0.062); 0.1-2.6 min on a tap-to-0.15 route,
  14.2 min on a single pull to 213.
- Step 11 note: "About 20 to 25 plant-minutes (about 7 after a 0.15 approach)." → "About 15 to 25
  plant-minutes (about 5 to 7 after a 0.15 approach)." Measured 14.4 / 20.6 min (seeds 42 / 7) and
  6.0 / 5.0 min on the tap-to-0.15 route.
