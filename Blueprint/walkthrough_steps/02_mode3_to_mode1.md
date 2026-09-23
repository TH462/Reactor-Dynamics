# Mode 3, Hot Standby to Mode 1, At Power

**Walkthrough id: `pwr\_startup`  ·  17 steps**

> Edit this freely — it is the step text, and it is what the sim is brought down to.
> Agent notes go at the END of the file, never between the steps.

\---

1\. Verify hot and shut down: AVG COOLANT TEMPERATURE 547 °F, PRIMARY PRESSURE 2235 psi, Reactor Coolant Pump (RCP) FLOW on.

Note: SOURCE RANGE counts should be steady, not climbing. One alarm is already up and belongs here: Turbine Trip / Low Steam Demand on the ALARMS list, short form TURB TRIP. The turbine is off and the plant is making no steam. Press ACK on the ALARMS list and leave it.

Background

Hot Standby (Mode 3) is hot and at pressure with the reactor still shut down: the pumps are running, the shutdown rods are already fully out, and SOURCE RANGE counts sitting still means nothing is drifting toward critical yet.

\[HIGHLIGHTED: Source Range, Tavg, Primary Pressure, Reactor Coolant Pumps (RCP), Boron Concentration (steady)]



2\. Wash boron out of the primary loop coolant: on the BORON card set 719 and press Enter.

Control: Boron control  ·  Target: BORON box 719; BORON STATUS counting down; BORON CHEM tracking live

Note: ON is normally already lit; press it only if it is not. BORON STATUS reads DILUTING while the dose runs and stops by itself; BORON CHEM is a live channel and tracks the loop as it falls. From the Hot Standby preset boron already reads 719 and this step ticks at once.

Background

Boron dissolved in the water soaks up neutrons, so the control rods do not have to come as far out before the reactor goes critical. At 719 ppm it goes critical around 208 of 627 steps — low in the bank, with travel left. At 918 ppm the same bank has to come about four-fifths of the way out, around 490 steps.

\[HIGHLIGHTED: Boron Target (pulsing); Boron Status, Boron Concentration (steady)]



3\. Check SG FEED reads AUTO. If it does not, press AUTO.

Control: Feed Pumps  ·  Target: SG FEED reads AUTO, STEAM GENERATOR LEVEL near 65 %

Background

The steam generator is the boiler: reactor water heats it on one side and steam comes off the other. Once the reactor starts making heat, that steam comes off fast, and AUTO on the feed system is what holds the level.

\[HIGHLIGHTED: SG Feed AUTO (pulsing); SG Level (steady)]



4\. Press 1/M PLOT on the ROD CONTROL card, then press Plot point.

Control: 1/M Plot  ·  Target: point 1 plotted

4a. Baseline point plotted

Note: This first point is the baseline. Every count target on this walkthrough is the SOURCE RANGE reading, printed in shorthand: 7.0e2 is 700 counts a second, 1.4e3 is 1,400, 7.0e3 is 7,000.

Background

1/M means one-over-multiplication: the plot divides the starting SOURCE RANGE count by the current one. As counts climb that number falls toward zero, and where the line would cross zero is the rod position at which the reactor goes critical. It fits the last three points, so each new point sharpens the prediction.

\[HIGHLIGHTED: 1/M Plot Tool, Plot point (pulsing); Source Range (steady)]





5\. Withdraw the control rod group and plot a second point on the 1/M plot to begin forming a fit line.

5a. Hold WITHDRAW at MED until SOURCE RANGE passes 7.0e2. Let STARTUP RATE fall to zero

Note: Stop when CONTROL ROD POSITION reads about 80 to 100.  

Suggested time warp: 5x.

()  SOURCE RANGE reads 7.0e2 (700 counts per second) or more

5b. Press Plot point to plot the second point.

()  Point plotted

Background

The first two points always predict the criticality point too high: near the bottom the rods are worth little per step, so the line they draw crosses zero far past the real critical position. That is expected. While the reactor is shut down, SOURCE RANGE counts are the only thing that tells how close the core is; rod position does not.

\[HIGHLIGHTED: Rod Speed — Normal, Withdraw, Plot point (pulsing); Source Range, Startup Rate, Control Rod Position (steady)]







5\. Hold WITHDRAW at MED until SOURCE RANGE passes 7.0e2. Let STARTUP RATE fall to zero, then press Plot point.

Control: Control Bank  ·  Target: SOURCE RANGE above 7.0e2 (700 counts a second); point 2 plotted

5a. SOURCE RANGE reads 7.0e2 (700 counts per second) or more
5b. Point plotted

Note: Stop when CONTROL ROD POSITION reads about 80 to 100.

Background

The first two points always predict the criticality point too high: near the bottom the rods are worth little per step, so the line they draw crosses zero far past the real critical position. That is expected. While the reactor is shut down, SOURCE RANGE counts are the only thing that tells how close the core is; rod position does not.

\[HIGHLIGHTED: Rod Speed — Normal, Withdraw, Plot point (pulsing); Source Range, Startup Rate, Control Rod Position (steady)]



6\. Hold WITHDRAW until SOURCE RANGE passes 1.4e3. Let STARTUP RATE fall to zero, plot, then read the prediction.

Control: Control Bank  ·  Target: SOURCE RANGE above 1.4e3 (1,400 counts a second); point 3 plotted

6a. SOURCE RANGE reads 1.4e3 (1,400 counts per second) or more
6b. Point plotted

Note: Stop when CONTROL ROD POSITION reads about 150 to 175 steps. Wait for the rate before you plot — see step 5.

Background

Each new point is taken closer to critical, where a step is worth more, so the line steepens and the predicted crossing walks in. The panel prints the crossing as a rod step with a marker on the plot. That number still reads high; it improves with every point.

\[HIGHLIGHTED: Withdraw, Plot point (pulsing); Source Range, Startup Rate, Control Rod Position (steady)]



7\. Hold WITHDRAW until SOURCE RANGE passes 3.0e3. Let STARTUP RATE fall to zero, plot, then read the prediction again.

Control: Control Bank  ·  Target: SOURCE RANGE above 3.0e3 (3,000 counts a second); point 4 plotted

7a. SOURCE RANGE reads 3.0e3 (3,000 counts per second) or more
7b. Point plotted

Note: Stop when CONTROL ROD POSITION reads about 180 to 205 steps. Wait for the rate before you plot — see step 5.

Background

Each step now buys more reactivity than the last, so the pulls get smaller from here. The prediction is starting to be useful. STARTUP RATE still falling means the counts are still climbing, and a point taken then puts the predicted crossing too far out.

\[HIGHLIGHTED: Withdraw, Plot point (pulsing); Source Range, Startup Rate, Control Rod Position (steady)]



8\. Hold WITHDRAW until SOURCE RANGE passes 7.0e3. Let STARTUP RATE fall to zero, then plot the last point.

Control: Control Bank  ·  Target: SOURCE RANGE above 7.0e3 (7,000 counts a second); point 5 plotted; STARTUP RATE under 1.0

8a. SOURCE RANGE reads 7.0e3 (7,000 counts per second) or more
8b. Point plotted

Note: Stop when CONTROL ROD POSITION reads about 195 to 205 steps. This is the point the prediction is built on, so give it the time: STARTUP RATE takes about six plant-minutes to come back to zero here, and a point plotted before it does throws the predicted position further out than it is. Note the rod position at criticality the 1/M panel predicts — the reactor goes critical at it or just below, so you stop short of it and tap from there.

Background

This is the last plotted point: from here single steps beat one more fitted number, because another burst would land past critical. STARTUP RATE is the speedometer — 1.0 means power is multiplying by ten every minute, and any positive reading with the rods still means the chain reaction is growing. Under 1.0 is a comfortable climb; above it, nothing in the plant slows the rise yet.

\[HIGHLIGHTED: Withdraw, Plot point (pulsing); Source Range, Startup Rate, Control Rod Position (steady)]



9\. Press SLOW and hold WITHDRAW to 3 steps short of the 1/M panel's predicted position, then tap single steps.

Control: Control Bank  ·  Target: STARTUP RATE positive and steady around 0.15 with the rods stopped; PERIOD 150 to 200 s

9a. INTER RANGE reads 1.0e-7 A or more
9b. REACTOR POWER reads 0.1 % or more

Note: Do this first: press SLOW, hold WITHDRAW until CONTROL ROD POSITION is 3 steps short of the 1/M panel's predicted position, release, then tap single steps and wait after each one. The prediction reads HIGH, never low, so stopping short of it is the point. Put the clock on 10× for the waiting — about twenty-five plant-minutes once the rods stop — and come back to 1× before you move a rod again; never 60×, where a 2 ½ second glance away is two and a half plant-minutes of reactor. Then read STARTUP RATE with the rods still and the rate no longer falling, about five minutes after the last tap. Around 0.15, with PERIOD 150 to 200 seconds, is this approach going as written. Around 0.5, or PERIOD under 60 seconds, is about eight steps further out than you meant to be — power will arrive about three times sooner and level off higher; over 1.0, tap INSERT once and wait. Near 0.01, with PERIOD in the thousands of seconds and nothing moving, means you have stopped short of critical — tap one more step out and wait. From your last tap onward, watch INTER RANGE and STARTUP RATE rather than REACTOR POWER. If the reactor trips, the SCRAM button reads SCRAMMED / PRESS TO RESET; press it before the rods will move again.

Background

Critical means the chain reaction keeps itself going: power rises with the rods still, and a positive STARTUP RATE is the sign. Below about 1 % power — the point where the reactor starts warming the water — nothing in the plant takes extra reactivity back out, so how far past critical the rods stop is what sets how fast power climbs. REACTOR POWER reads 0.0 % for about twenty-five plant-minutes while INTER RANGE climbs three decades, which is why STARTUP RATE, PERIOD and INTER RANGE are the ones to steer on.

\[HIGHLIGHTED: Withdraw, Rod Speed — Slow (pulsing); Startup Rate, Reactor Period, Source Range, Control Rod Position, Intermediate Range (steady)]



10\. Let power climb on its own. Tap WITHDRAW once only if STARTUP RATE falls back to 0.00.

Control: Control Bank  ·  Target: REACTOR POWER rising past 1 %

Note: While STARTUP RATE is positive, leave the rods alone. Only if it falls back to 0.00 with REACTOR POWER still below 0.5 %, tap WITHDRAW one step at SLOW and wait again. SOURCE RANGE switches itself off above 1.0e5 and INTER RANGE takes over. About 15 plant-minutes. 5× is the speed for it: the plant behaves the same at any speed, but this is the step that may want a tap, and at 10× a tap has landed before you have read the rate. Come back to 1× to tap.

Background

With the reactor just critical, power climbs by itself and every extra rod step adds to a rise that is already under way. Below about 1 % the water is not yet warm enough to hold that climb back, which is why a high STARTUP RATE is a signal to wait, not to pull.

\[HIGHLIGHTED: Rod Speed — Slow, Withdraw (pulsing); Startup Rate, Intermediate Range, Control Rod Position (steady)]



11\. Verify SOURCE RANGE has switched itself off and INTER RANGE is reading. Close the 1/M PLOT window.

Note: Close it with the ✕ in its corner; its work is done.

Background

The SOURCE RANGE detectors would wear out if they stayed on at power, so the plant switches them off by itself once INTER RANGE is reading. There is no button for it.

\[HIGHLIGHTED: 1/M Plot Tool (pulsing); Source Range, Intermediate Range (steady)]



12\. Watch REACTOR POWER stop rising on its own, below 5 %. If it does not, press MED and hold INSERT.

Control: Control Bank  ·  Target: REACTOR POWER below 5 % and levelling off; STARTUP RATE back under 0.10

12a. REACTOR POWER below 5 %
12b. STARTUP RATE settled between -0.10 and 0.10

Note: The climb stops by itself near 4 %, about twenty plant-minutes after the rods stop, and STARTUP RATE comes back to 0.00 on the way. The step checks off once the rate is under 0.10, which comes about fifteen minutes before power finally levels — leave the rods alone and let it. If power instead runs past 5 %, press MED and hold INSERT until it comes back — about 14 steps — then release and let the plant settle before you read it: while the bank is driving in, STARTUP RATE is well below zero and power has not finished falling.

Background

Warmer water slows this reactor down, so the heat the climb makes is what stops the climb. Power finds a level for the rod position it was left at, and no further rod motion is needed to hold it. Below about 1 % that feedback was too weak to feel; from here it is what makes the plant steady.

\[HIGHLIGHTED: Rod Speed — Normal, Insert (pulsing); Startup Rate, Intermediate Range, Control Rod Position (steady)]



13\. Press SLOW, then hold WITHDRAW until REACTOR POWER passes 5 %, about 13 steps. That is Mode 1, At Power.

Control: Control Bank  ·  Target: REACTOR POWER above 5 %, settling near 11 %

Background

Mode 1, At Power, begins at 5 % power. The warming water now holds power back, so each rod step buys a new steady level rather than a runaway — about half a percent of power per step. The extra steps past 5 % are for the turbine: it needs REACTOR POWER above 10 % before the startup trips will stay switched off.

\[HIGHLIGHTED: Rod Speed — Slow, Withdraw (pulsing); Startup Rate, Intermediate Range, Control Rod Position (steady)]



14\. Press LATCH on the TURBINE-GENERATOR card, then set LOAD to 10 MWe.

Control: Turbine Load  ·  Target: OUTPUT near 10 MWe

14a. Turbine latched
14b. Generator above 8 MWe

Background

LATCH resets the turbine so it can take steam; LOAD is how much electricity the generator is asked for. As the generator picks up load, more steam is drawn, the water cools, and cooler water raises power — the reactor follows the turbine up to about 11 % by itself. That coupling is the central idea of this plant.

\[HIGHLIGHTED: Turbine — Latch, Load Setpoint (pulsing); Turbine Load, Generator Output (steady)]



15\. Press TRIP BLOCKS on the ROD CONTROL card, then BLOCK on the IR HIGH FLUX row.

Control: Trip Blocks  ·  Target: IR HIGH FLUX lit on the TRIP BLOCKS panel

Note: Do this the moment REACTOR POWER is above 10 %: at 25 % this trip fires. Below 8 % power the BLOCK button is dead and will not take the press at all; between there and about 9 ½ % it takes it and the block then goes out again by itself, because the permissive is read off the power-range meter, which wanders about ± 0.3 % and keeps dipping back under. If that happens, let power come up and press it again. The reactor keeps climbing while the panel is open.

Background

Two automatic shutdowns exist only to protect a startup, one at 25 % power and one at 35 %. Once power is up they would trip the reactor on the way to full power, so they are switched off one at a time. The plant keeps checking power is still up there, and switches them back on by itself if it falls, whoever switched them off.

\[HIGHLIGHTED: Trip Blocks (pulsing)]



16\. On the TRIP BLOCKS panel press BLOCK on the PR HIGH (LOW SETPT) row, then close the panel.

Control: Trip Blocks  ·  Target: PR HIGH (LOW SETPT) lit on the TRIP BLOCKS panel

Note: This switches off the second startup shutdown, at 35 %. Check both rows read lit — IR HIGH FLUX and PR HIGH (LOW SETPT) — while the panel is still open, then close it with TRIP BLOCKS again: it covers the rod buttons.

Background

The second startup shutdown fires at 35 % if it is still live. Above 10 % the shutdown at 118 % power takes over the job of catching a runaway. Two separate presses on purpose: on a real board, switching one off never quietly switches off the other.

\[HIGHLIGHTED: Trip Blocks (pulsing)]



17\. Verify Mode 1: REACTOR POWER above 10 % and OUTPUT 10 MWe.

Note: IR HIGH FLUX and PR HIGH (LOW SETPT) were checked lit in the last step, before the TRIP BLOCKS panel was closed.

Background

The reactor is critical, the generator is carrying load, and both startup shutdowns are switched off. The plant is in Mode 1, At Power. From here the climb to full power is rods leading and the turbine following.

\[HIGHLIGHTED: Reactor Power, Turbine Load, SG Level (steady)]



## Notes — agent record, NOT step text

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

