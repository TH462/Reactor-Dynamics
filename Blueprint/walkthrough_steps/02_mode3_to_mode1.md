# Mode 3, Hot Standby to Mode 1, At Power

**Walkthrough id: `pwr\_startup`  ·  17 steps**

> \*\*This file is YOUR authored step text and it is the AUTHORITY for this walkthrough.\*\*
> The built pool (`ui/manual\_procedures.js`) comes DOWN to it — including prose an agent added.
> Highlights are the exception: a step with no highlight entry here keeps the highlights the
> pool has, per your standing instruction.
>
> Split out of `Blueprint/WALKTHROUGH\_STEPS\_OWNER.md` on 2026-09-15 \*(OWNER DIRECTIVE,
> 2026-09-15: "I want to be able to manually review and edit the steps for the walkthroughs
> easier. can you make a folder within blueprints/ and create a new file for each walkthrough.")\*.
> \*\*The text below is byte-for-byte what that file carried\*\* — nothing was reworded in the move.
> The instructions, rulings and open decisions stay in the parent file; this one is steps only.

> **THE TICK AND CIRCLE MARKS IN THIS FILE CARRY NO MEANING** *(OWNER, 2026-09-17: "The tick vs
> circle in my writing was because I was copy/pasting from the sim and what needed up in the
> document was whatever state it happened to be in the sim at the time. It has no special
> meaning.")*. A row drawn with a tick was simply a row that happened to be CHECKED OFF on his
> screen when he copied it; a circle was one that was not. **Do not read them as authored
> intent, do not preserve them, and never change a step's kind to match one.** The step's kind
> is decided by what it asks the player to do — action or verify — not by the glyph.
> The same goes for the backslash escaping throughout: that is his editor's round-trip, not
> content. Leave it; do not "clean" it.

\---

\*\*\* WALKTHROUGH MODE 3 to MODE 1



1\. Verify the plant is hot and shut down: AVG COOLANT TEMPERATURE 547 °F, PRIMARY PRESSURE 2235 psi, Reactor Coolant Pump (RCP) FLOW on.

✓ When AVG COOLANT TEMPERATURE 532 to 561 °F



*SOURCE RANGE counts should be steady, not climbing. One alarm is already up and belongs here: Turbine Trip / Low Steam Demand on the ALARMS list, short form TURB TRIP. The turbine is off and the plant is making no steam. Press ACK on the ALARMS list and leave it.*

REVISED 2026-09-15 (#653 S-7): the step said "Press ACKNOWLEDGE"; the board control is labelled **ACK** (and `Ack All`).



Background

This is the plant the heatup hands over: hot, at pressure, pumps running, still shut down. Steady SOURCE RANGE counts mean nothing is drifting toward critical yet. The shutdown bank is already out, and the next step trims whatever boron the route in left behind.

*(...and the note gains: "BORON CHEM is the live loop concentration, and the two ways into this walkthrough arrive at different numbers — it is the reading, not a figure in the text, that says where you are starting from.")*

REVISED 2026-09-15 *(OWNER RULING, 2026-09-14: "Drop the number entirely")*. The old background said "boron is already near 719 ppm", which is true of one route and wrong about the other — MEASURED: the Hot Standby preset boots at 718.9 ppm, the chained route from the Mode 5 to Mode 3 walkthrough arrives at 917.8 ppm. The step now sends the player to BORON CHEM instead of naming a value.





2\. Wash boron out of the water: on the BORON card set 719 and press Enter.

○ When Boron in the loop (BORON CHEM after a sample) 679 to 759 ppm



*ON is normally already lit; press it only if it is not. BORON STATUS reads DILUTING while the dose runs and stops by itself; BORON CHEM is a live channel and tracks the loop as it falls. From the Hot Standby preset boron already reads 719 and this step ticks at once.*



⏩ From 918 ppm this takes about 90 plant-minutes — set the speed control to 600×.



Background

Boron dissolved in the water soaks up neutrons. At 918 ppm the bank has to come about four-fifths of the way out before the reactor will go critical — 490 of 627 steps; at 719 ppm it goes critical about 208 of 627 steps out, low in the bank with plenty of travel left.





3\. Check SG FEED reads AUTO. If it does not, press AUTO.

✓ When SG FEED is in AUTO



Background

Nothing happens until the reactor starts making heat, and then the steam generator boils down fast. The steam generator feed system is what refills it. Both routes into this walkthrough normally arrive with AUTO already lit; check anyway.





4\. Before any rod moves: press 1/M PLOT on the ROD CONTROL card, then press Plot point.

○ Baseline point plotted



*This first point is the baseline. Every count target on this walkthrough is the SOURCE RANGE reading, printed in shorthand: 7.0e2 is 700 counts a second, 1.4e3 is 1,400, 7.0e3 is 7,000.*



Background

The 1/M plot predicts where the rods will be when the reactor goes critical, before you get there. It divides the starting count rate by the current one: as counts climb the result falls toward zero, and where the line crosses zero is the predicted critical position. It fits the last three points, so each new point sharpens it.



5\. Raise SOURCE RANGE past 7.0e2, let the counts level off, then plot the point.

5a○ Press MED, then hold WITHDRAW under CONTROL until SOURCE RANGE passes 7.0e2.
— Counts above 7.0e2 (700 counts per second)

5b○ Release WITHDRAW and watch STARTUP RATE fall back toward zero.
— STARTUP RATE back to zero (within 0.02 DPM)

5c○ Keep waiting until SOURCE RANGE has stopped climbing as well.
— Counts steady — under 3 % change over the last two minutes

5d○ Press Plot point on the 1/M PLOT panel.
— Point plotted



*Stop when CONTROL ROD POSITION reads about 80 to 100. Holding WITHDRAW drives the bank at the selected speed and releasing it stops; a single tap moves one step. MED moves 48 steps a minute at 1×, SLOW 8, FAST 72. Work the four lines below in order. Plot point will take a press at any time, but a point plotted before the counts are steady is a bad point: it goes on the plot, drags the prediction, and only Clear takes it off again.*



⏩ About 5 plant-minutes at 1× — set the speed control to 10×.



REVISED 2026-09-15, TWO DEFECTS ON ONE CARD. **(#759)** the old sentence *"Plot point does nothing until the counts are steady"* was FALSE — measured, an out-of-turn press adds real points at rod position 0 and only `Clear` removes them *(OWNER RULING, 2026-09-15: selected "Fix the text AND say why (Recommended)")*; the card's one-line reason on an out-of-turn press is ui/app.js and is not this file's half. **(#653 S-5)** the ⏩ line is GENERATED from the step's 300 s hold and already said "set the speed control to 10×"; the authored hint said 10× a second time in the same line, so the card read *"About 5 plant-minutes at 1× — set the speed control to 10x. Set the speed control to 10x if you don't want to wait…"*. The authored hint is deleted; only the generated line remains.



Background

The first two points always predict too high: near the bottom the rods are worth little per step, so the line they draw crosses zero far past the real critical position. That is expected. While the reactor is shut down, SOURCE RANGE counts are the only thing that tells you how close you are; the rod position does not.





6\. Raise SOURCE RANGE past 1.4e3, let it level off, plot the point, then read the 1/M prediction.

6a○ Hold WITHDRAW at MED until SOURCE RANGE passes 1.4e3.
— Counts above 1.4e3 (1,400 counts per second)

6b○ Release WITHDRAW and watch STARTUP RATE fall back toward zero.
— STARTUP RATE back to zero (within 0.02 DPM)

6c○ Keep waiting until SOURCE RANGE has stopped climbing as well.
— Counts steady — under 3 % change over the last two minutes

6d○ Press Plot point, then read the predicted critical position on the panel.
— Point plotted



*Stop when CONTROL ROD POSITION reads about 150 to 175 steps. The four lines below run in order.*



⏩ About 5 plant-minutes at 1× — set the speed control to 10×.



REVISED 2026-09-15 (#653 S-5): same duplication as step 5 — the authored hint repeated the generated line's 10×. Deleted.



Background

Each new point is taken closer to critical, where a step is worth more, so the line steepens and the predicted crossing walks toward you. The panel prints "predicted criticality ≈ step N" with a marker on the plot. Treat it as too high for now; it improves with every point.





7\. Raise SOURCE RANGE past 3.0e3, let it level off, plot the point, and read the prediction again.

7a○ Hold WITHDRAW at MED until SOURCE RANGE passes 3.0e3.
— Counts above 3.0e3 (3,000 counts per second)

7b○ Release WITHDRAW and watch STARTUP RATE fall back toward zero.
— STARTUP RATE back to zero (within 0.02 DPM)

7c○ Keep waiting until SOURCE RANGE has stopped climbing as well.
— Counts steady — under 3 % change over the last two minutes

7d○ Press Plot point, then read the prediction again.
— Point plotted



*Stop when CONTROL ROD POSITION reads about 180 to 205 steps. The four lines below run in order.*



⏩ About 7 plant-minutes at 1× — set the speed control to 60×. The 60× is for the settle, not the pull: at MED the bank runs through this 25-step rung in well under a second there. Come back to 10× or 1× before you hold WITHDRAW.



REVISED 2026-09-15, TWO DEFECTS. **(#653 S-11)** *"and the settle takes longer at every rung"* was an unmeasured claim in player copy: measured on the built pool, **all four settle rungs on steps 5–8 carry IDENTICAL acceptances** — `startup\\\_rate \\\~0 ±0.02`, then counts `steady` at 3 % over a 120 s window. The PLANT does settle more slowly nearer criticality (your own observation, verified above: counts-steady at 223 / 226 / 281 / 507 s), but the live durations were not re-measured in this pass, so the sentence is removed rather than replaced with a number nobody has taken. **(#653 S-5)** this step's hold is 420 s, so the GENERATED line offers **60×** while the authored hint said **10×** — one line, two speeds, and 60× is wrong for the rod pull this step opens with (the rung is 25 steps wide, 180 to 205, and MED is 48 steps a minute at 1× — this file's own step-5 figure — i.e. 48 a second at 60×). The hint now says which rung is for which half.



Background

Each step now buys more reactivity than the last, so the pulls get smaller from here. The prediction is starting to be useful. Keep waiting for STARTUP RATE to settle before each point.





8\. Hold WITHDRAW at MED until SOURCE RANGE settles above 7.0e3. Settle, press Plot point. This is the last point.

8a○ Hold WITHDRAW at MED until SOURCE RANGE passes 7.0e3.
— Counts above 7.0e3 (7,000 counts per second)

8b○ Release WITHDRAW and watch STARTUP RATE fall back toward zero.
— STARTUP RATE back to zero (within 0.02 DPM)

8c○ Keep waiting — about ten plant-minutes here — for SOURCE RANGE to flatten.
— Counts steady — under 3 % change over the last two minutes

8d○ Press Plot point. Note the critical position the panel predicts.
— Point plotted



*Stop when CONTROL ROD POSITION reads about 195 to 205 steps. This is the point the prediction is built on, so give it the time: SOURCE RANGE goes on climbing for about ten plant-minutes after the rods stop, and a point plotted while it is still rising throws the predicted position two or three steps too far out. Plot it when the counts have levelled off. Note the rod position at criticality the 1/M panel predicts — the reactor goes critical at it or just below, so you stop short of it and tap from there.*



⏩ The counts are still climbing when the rods stop, and the prediction is only as good as the wait you give them. Come back to 10× before the next step, where the reactor starts making power.



REVISED 2026-09-15 *(OWNER RULING, 2026-09-14: "Rewrite both")*. The step's settle went from 150 s to 600 s. MEASURED on this tree, the authored ladder with the panel's own trailing-three fit, four seeds, against a true critical of control bank 208 of 627: at a 150 s settle the final prediction reads 210.6 to 211.7 (+2.6 to +3.7 steps high); at 600 s it reads 208.0 to 209.0 (0 to +1). The error was never the fit — the counts are only about two-thirds of the way up when a 150 s hold expires.



Background

STARTUP RATE is the speedometer: 1.0 means power is multiplying by ten every minute, and any positive reading means reactivity is above zero and the chain reaction is growing. Under 1.0 is a comfortable climb; above it you are outrunning the plot, and nothing in the plant slows the rise for you yet. This is the last plotted point: from here single steps beat one more fitted number, and another burst would land you past criticality — plotting a point on a reactor that is already critical.





9\. Press SLOW and hold WITHDRAW to 3 steps short of the 1/M panel's predicted position, then tap single steps.

○ When REACTOR POWER > 0.1 %



Do this first: press SLOW, hold WITHDRAW until CONTROL ROD POSITION is 3 steps short of the 1/M panel's predicted position, release, then tap single steps and wait after each one. The prediction reads HIGH, never low, so stopping short of it is the point. Put the clock on 10× for the waiting — about twenty-five plant-minutes once the rods stop — and come back to 1× before you move a rod again; never 60×, where a 2 ½ second glance away is two and a half plant-minutes of reactor. Then read STARTUP RATE with the rods still and the rate no longer falling, about five minutes after the last tap. Around 0.15, with PERIOD 150 to 200 seconds, is this approach going as written. Around 0.5, or PERIOD under 60 seconds, is about eight steps further out than you meant to be — power will arrive about three times sooner and level off higher; over 1.0, tap INSERT once and wait. Near 0.01, with PERIOD in the thousands of seconds and nothing moving, means you have stopped short of critical — tap one more step out and wait. From your last tap onward, watch INTER RANGE and STARTUP RATE rather than REACTOR POWER. If the reactor trips, the SCRAM button reads SCRAMMED / PRESS TO RESET; press it before the rods will move again.

Watch for: STARTUP RATE positive and steady around 0.15 with the rods stopped; PERIOD 150 to 200 s

REVISED 2026-09-15, THE NOTE SPLIT BY KIND (#653 S-12 and S-10). MEASURED on the built pool before the edit: note **2,103 characters**, Background 502, step text 107 — eleven numeric thresholds and three conditional remedies at the same visual weight as the five actions. The 2026-09-15 layman reviewer read it twice, retained the lesson ("watch INTER RANGE, not REACTOR POWER") and **lost the action** ("stop 3 steps short"), which is the wrong half to lose. The note now carries only what the player DOES and the readings that tell them to do something else; everything that explains the plant moved to the END of the note, behind "Behind the readings:". **Nothing was deleted — every number is still on this step.**

**THE LENGTH BARELY MOVED AND THAT IS A GATE, NOT A CHOICE — and it is the one thing here you may want to rule on.** 2,103 → 2,023 characters. The plan was to move the teaching into the step's Background block, but `run\\\_style`'s **W-detail** check caps a details paragraph at **three sentences**, so Background could take only the core (502 → 595) and the rest had to stay in the note. What DID change is the ORDER, which is the half the reviewer lost: actions first, then the four rate/PERIOD remedies, then the instrument teaching. **A real shrink needs one of two things from you:** relax W-detail for the Background block (it is supplemental context, not an instruction, and this step is the only one that strains it), or turn the actions into lettered `accs\\\_ordered` rungs the way steps 5–8 now are — which is a GRADING change and owes its own measurement. **Recommendation: the `accs\\\_ordered` rungs**, because they fix the lost-action complaint structurally rather than by moving prose around, and the machinery shipped yesterday; relaxing a style cap to make one long note legal is the weaker of the two.

ONE REMEDY WAS ADDED (#653 S-10): the note gave three remedies for a startup rate too HIGH and none for too LOW. The reviewer settled at **+0.01 decades per minute with PERIOD reading 2,391 s** and stalled, having to infer "tap more". The on-plan figures are this step's own pre-existing measurement (about 0.15 settled, five steps above critical; PERIOD 150 to 200 s; under 60 s means too far out) and the "Watch for" line widens from "about 150 s" to "150 to 200 s" to match. **The acceptance is untouched** — this is a copy change; turning the single done-when into a rung sequence would be a grading change and owes its own measurement.



Background — not an action

Critical means the chain reaction sustains itself: power keeps rising with nothing pushing it, and a positive STARTUP RATE with the rods still is the sign. No single step is dramatic, but ten of them are — below the point of adding heat nothing in the plant takes that reactivity back out for you, so how far past criticality you stop is what sets how fast power climbs. REACTOR POWER is the last instrument to show any of it: it reads 0.0 % for about twenty-five plant-minutes while INTER RANGE climbs three decades, which is why STARTUP RATE, PERIOD and INTER RANGE are the ones to steer on. STARTUP RATE runs high while a rod is moving and goes on falling for about five minutes after it stops, so it is only worth reading once it has stopped falling; PERIOD, under the instrument card, is the same fact in seconds — how long power takes to multiply by ten. SOURCE RANGE switches itself off part way through this step, above 1.0e5 (100,000 counts per second); that is normal and there is no button for it. The two detectors overlap on purpose — the source-range counters would wear out at power, so the plant secures them once INTER RANGE has a reading, and losing the counts is the plant telling you the approach worked. The plant does exactly the same thing at 1×, 5× or 10× — the climb still stops itself just over 4 % — so the speed costs you nothing here.



REVISED 2026-09-15 *(OWNER RULING, 2026-09-14: "Rewrite both")*, answering "the rate the power climbs seems to be is nothing until it suddenly shoots up in power if the user has pulled the rods out too far. It could be we need to explain how to use the intermediate range better."

MEASURED on this tree, full stack, the authored route driven end to end (ladder at MED with the new 600 s last settle, then the creep at SLOW), true critical control bank 208 of 627:

|after the rods stop|+11 creep → bank 213 (+5)|+19 creep → bank 221 (+13)|
|-|-|-|
|STARTUP RATE at 12 s|0.255|0.568|
|STARTUP RATE settled|0.163|0.525|
|PERIOD settled|158 s|49 s|
|REACTOR POWER first reads 0.1 %|1396 s (23.3 plant-minutes)|400 s (6.7 plant-minutes)|
|INTER RANGE over that window|9.7e-10 → 2.5e-6 A|3.3e-9 → 5.7e-4 A|
|power levels at|about 4 %|7.0 %|

Two things deliberately NOT said, because they did not reproduce: the first reading after a single TAP is **1.3×** the settled value (0.137 → 0.187 → 0.16), not the seven times an earlier report proposed — that seven came from a continuous withdrawal, not a tap; and power arrives about **three** times sooner when over-withdrawn, not six. There is also no startup-rate rod block on this plant, so the step never implies one exists.

