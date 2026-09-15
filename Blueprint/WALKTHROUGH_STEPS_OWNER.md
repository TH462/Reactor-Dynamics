The steps should not include elements not included in my manual edits below except for highlights. some steps didn't get highlight entries but that doesn't mean the step doesn't get highlights.



**RULINGS RECORDED HERE SO THE NEXT RECONCILE DOES NOT UNDO THEM** (2026-09-15)

- **The 100 °F/hr heatup-rate limit stays OUT of the Mode 5 → Mode 3 walkthrough** *(OWNER RULING, 2026-09-14, on options put as "put it back in a step / put it in a note / leave it out": selected "Leave it out of the walkthrough")*. It used to live in that leg's leg-level cautions, which were retired from the pool; it did not go missing, it was ruled out. **The cooldown leg keeps its own 100 °F/hr** and the manuals are unchanged — do not "restore" the heatup one as a missing-content defect.
- **Step 8 of Mode 3 → Mode 1 gets a "counts steady" check-off** *(OWNER RULING, 2026-09-15: selected "add a steadiness predicate" from three options put to him — raise the count target to 12,000 / add a steadiness predicate / leave it as text — taking the one that needed new plumbing over the one-number change. A selection, not verbatim words; the rationale relayed with it is that a steady count rate is what an operator actually looks for and an absolute threshold is only a stand-in for it)*. The 7,000 counts per second target is HIS number and stays as the floor; 8b is added beside it, and the old 8a ("Point plotted") is now 8c. Measured: the live step used to accept 47 s after the rods stop with the 1/M prediction reading 213.7 against a true critical of 208; it now accepts at 506 s, prediction 208.8, and the authored 600 s replay hold clears the same predicate with 72 s to spare. Do not "simplify" 8b back out.
- **The four 1/M ladder steps are SEQUENCED SUBSTEPS: pull to the count, watch STARTUP RATE fall to zero, wait for the counts to flatten, plot** *(OWNER DIRECTIVE, 2026-09-15: "For the early-plot hole, we could have instructions for substeps not just one line of instruction then multiple substeps. We could give a line of instruction per substep. We instruct to pull rods to a count/however many steps. The next substep says to wait for the startup rate to stabilize. Once the startup rate hits a predetermined number that step checks off. Then have another substep to plot the 1/m point."; and on the sequence, *(OWNER, 2026-09-15: "the operator watches the counts to get the count level then watches for the startup rate to get near zero.")*, and on the physics, *(OWNER, 2026-09-15: "Our plant decays to near zero after burst and the counts flatten. It takes longer the closer to criticality we are.")*)*. Each rung carries four lettered rows, each with its own instruction, and the rows go live **one at a time** (`accs_ordered`), so a press out of turn cannot CHECK THE ROW OFF. **It does NOT make the button deaf, and this line used to say it did** — REFUTED and corrected 2026-09-15 (#759): measured on the live card, pressing Plot point with the settle row unmet adds real points (1 → 2 → 3 circles, the panel refitting each time) at rod position 0, inside the trailing-three fit, removable only with `Clear`. The step's own note repeated the wrong claim to the player and has been rewritten.
  - **His observation is VERIFIED on this plant, both halves.** STARTUP RATE decays to zero after every burst (settled instrument mean 0.0004 / -0.0001 / -0.0003 / 0.0027 DPM) and both the rate and the counts take longer to settle nearer criticality: counts-steady at **223 / 226 / 281 / 507 s** after each burst, startup rate inside 0.02 DPM at **141 / 151 / 202 / 345 s**.
  - **STARTUP RATE is the row the player READS; the counts row is the row the plot WAITS on.** Measured: the rate enters its band **75 to 162 s before** the counts flatten on every rung, and the gap is widest on the last rung — the point the panel's trailing-three fit weights most. So grading the plot on the rate alone would reopen the early-plot hole. Both rows are kept, in his order, with the stronger one underneath.
  - **The 0.02 DPM band is the channel's own scatter, not a round number**: the instrument's detrended standard deviation over a settled 300 s tail is 0.0040 to 0.0043 DPM, so 0.02 is five standard deviations. A 0.08 or 0.10 band is satisfied 5 s after the burst on the first two rungs, before the rods have stopped, because the rate never exceeds 0.131 / 0.283 DPM there.
  - Holds grew from 150 s to **300 / 300 / 420 / 600 s** to cover the settle. Do not "simplify" the four rows back into one line.
- **A VERIFY STEP STILL WEARS THE "PRESS ME" HALO ON MODE 5 → 3 STEPS 4 AND 6, AND THAT IS YOUR CALL, NOT AN AUTHORING SLIP** (raised 2026-09-15, #653 S-3b). The 2026-09-15 layman reviewer nearly pressed TRIP on step 4. MEASURED on the built pool: both steps carry no command, and `hl` draws the pulsing `.ckl-step-glow` — the same cue a step that really wants a press uses — on TRIP (step 4) and CLOSE (step 6). **Both rings are YOUR drawings**, recorded below as *"[HIGHLIGHTED: TURBINE-GENERATOR CARD (steady), TRIP (pulsing)]"* and *"[HIGHLIGHTED: STEAM DUMP CARD (steady), CLOSE (pulsing) …]"*, so they were not changed. **What changed is the TEXT**: both steps now open "Verify …, nothing to press", and the note says the ring marks a lamp to read. (The first draft read "— there is nothing to press here" on both and reddened `run_style`'s **W2** check, which caps a step's instruction line at twenty words: 22 and 24. Shortened, not waived.)
  - **What you are deciding:** whether a verify step may use the pulsing ring at all. **Options:** (a) leave it — the ring marks the lamp, and the new wording says so; (b) give `hl_watch` (steady dashed) these two labels, which needs a third ring state or an app.js change, because `stepHlLabels` falls back to the step's own `control` when `hl` is empty and both these steps would then pulse a different control; (c) add a "verify" ring of its own. **Recommendation: (b), via the app.js fallback fix** — the pulse/steady split is already the ruled vocabulary (#748) and a verify step is exactly the case the split exists for; the wording fix is a patch over a cue that still says the wrong thing. Absent a ruling the text fix stands and the rings stay.
  - The same shape on **Mode 1 power ascension step 9** cannot be fixed from the step data either: it authors no `hl`, and the fallback pulses its `control`. Two of the pool's nine surviving cases are this fallback.
- **The `Use <control>: <target>` rung is no longer drawn on the walkthrough card** *(OWNER RULING, 2026-09-14: "Hide it in the renderer")*. This file carries that rung on exactly one of the nineteen steps that name a control (Mode 5 → 3 step 2), so it was the renderer's addition. The step data still carries `control` on every step — it is the coverage key for the browser gate that checks the manual's control pill — and an observation step still draws its "Watch for:" line. This supersedes the 2026-09-02 ruling that the control had to sit outside the details fold.



\*\*\* MODE 5 -> 3



1\. Verify the plant is cold and shut down: AVG COOLANT TEMPERATURE 122 °F, PRIMARY PRESSURE 363 psi, Reactor Coolant Pump (RCP) FLOW OFF.

✓ When Plant in Mode 5, Cold Shutdown — the plant reads Mode 5, Cold Shutdown (true value)

Both rod positions read 0 of 627.



Background

In Cold Shutdown (Mode 5) the water is far below boiling, pressure is low, the Residual Heat Removal (RHR) loop is carrying the small amount of heat the fuel still makes, and both rod banks are fully inserted.





2\. Start the reactor coolant pumps: press ON on the RCP FLOW card.

○ When RCP FLOW > 90 %

Use RCP ON/OFF: RCP FLOW above 90 %



Background

A shut-down reactor makes very little heat compared to a critical reactor, but the running pumps put about half a percent of full power into the water as friction. That is enough to warm the whole plant. Real crews heat up exactly this way, with the reactor never critical.





3\. On the ROD CONTROL card press FAST, then click WITHDRAW under SHUTDOWN once.

○ When SHUTDOWN ROD POSITION = 627 steps



⏩ About 11 plant-minutes at 1× — set the speed control to 600×.



*One click starts the shutdown bank and it runs to 627 of 627 by itself, about 9 plant-minutes. Clicking WITHDRAW again stops it early. Watch SHUTDOWN ROD POSITION count up.*



Background

In a PWR, shutdown rod groups (shutdown banks) stay fully withdrawn during normal power operation. Their purpose is to supply a large, rapid insertion of negative reactivity on a reactor trip (SCRAM) so the core goes subcritical and stays that way. They are withdrawn first during startup and are not used for routine power or temperature (Tavg) control.





4\. Verify the turbine is tripped, nothing to press: TRIP lit on the TURBINE-GENERATOR card, OUTPUT 0 MWe.

✓ When the turbine is tripped



*The ring on TRIP marks the lamp to read, not a button to push. If LOAD reads anything but 0, press UNLOAD. UNLOAD is not TRIP: UNLOAD walks the load setting to zero, TRIP shuts the steam valves.*



Background

The cold plant starts with the turbine tripped. It matters because a turbine taking any steam on pump heat would carry away the very heat you are trying to build up.



\[HIGHLIGHTED: TURBINE-GENERATOR CARD (steady), TRIP (pulsing)]





5\. Set SG FEED to AUTO.

○ When SG FEED is in AUTO



Background

The steam generator is the boiler: reactor water heats it on one side and steam comes off the other. Nothing is boiling yet, so the feed pumps start out stopped. Putting level control in AUTO now, while the plant is quiet, means it is already holding level when the water starts to boil later in the heatup.





6\. Verify the STEAM DUMP is closed, nothing to press: CLOSE lit on the STEAM DUMP card, status reading MANUAL.

✓ When STEAM DUMP opening < 1 %

*The ring on CLOSE marks the lamp to read, not a button to push.*




Background

The steam dump sends steam straight to the condenser instead of the turbine. Kept shut, the steam side bottles up and the pump heat stays in the plant. The DUMP SETPOINT box already reads 1020 psi, but that number does nothing until AUTO is pressed, which a later step does once the steam side is hot.



\[HIGHLIGHTED: STEAM DUMP CARD (steady), CLOSE (pulsing), the physical STEAM DUMP and opening percentage (steady)]





7\. Press A+B 7 % on the LETDOWN card to open the letdown path.

7a○ Orifice A in service

7b○ Orifice B in service



Background

Water is always being pumped into the reactor loop (charging), so it always needs a way out (letdown). Right now letdown leaves through the RHR loop, and that path closes itself at 600 psi on the next step's pressure climb. The letdown orifices, two fixed holes, are the only way out after that; with them shut the plant would slowly fill solid.



\[HIGHTLIGHT: LETDOWN indication (steady), LETDOWN card (steady), A+B 7% button (pulsing)]





8\. On the PRESSURIZER (PZR) card press AUTO under HEATER, then AUTO under SPRAY.

8a○ AUTO lit under HEATER

8b○ AUTO lit under SPRAY



Background

The pressurizer is a tank of half water, half steam that sets the pressure of the reactor loop: heaters inside the pressurizer boil water to create steam and raise pressure, spray condenses steam to lower it. The cold plant starts with both off, so nothing is holding pressure. In AUTO they follow the SET PZR PRESSURE box, which the next step raises; with the heaters off that box does nothing.



\[HIGHLIGHT: SPRAY and HEATER CARDS (steady), AUTO buttons (pulsing)]





9\. Raise SET PZR PRESSURE to 1700 psi.

9a✓ SET PZR PRESSURE set to 1700 psi

9b✓ PRIMARY PRESSURE at 665 psi, the accumulator window



⏩ About 50 plant-minutes at 1× to reach 665 psi — set the speed control to 600×.



*At 665 psi the clock drops to 1× by itself and stays there until the accumulator valve in the next step is open.*



Background

Pressure goes up in two stages because of an automatic gate at 1972 psi: above it, the emergency injection pumps re-arm, and with the steam side still cold they would fire on a healthy plant. So the first stage stops under that gate. Raising the setpoint also starts the climb toward the accumulator window in the next step, which opens at 665 psi about 44 plant-minutes from now. <<<THIS BACKGROUND NEEDS A REWRITE AND A THOUGH AS TO WHAT WE WANT THE USER TO LEARN FROM THIS STEP>>>





10\. Open the accumulator valve: click the valve symbol inside the pulsing ring while PRIMARY PRESSURE is 665 to 1615 psi.

REVISED 2026-09-15 (#653 S-8): it said "the green ring". There is no green in the highlight vocabulary — `hl` draws a CYAN pulsing halo, rgba(90,240,255,…), since #743. Named by behaviour rather than colour so a palette change cannot make it wrong again. The cooldown leg's sibling step (not in this file) had the same sentence and the same fix.

✓ When the accumulator valve is open (the ACCUMULATORS tile no longer reads ISOLATED)



*Above 1615 psi the valve locks, and the ACCUMULATORS caution is expected until pressure passes 1000 psi. If the window is missed: press OFF under HEATER and MANUAL under SPRAY at 100 %, wait for PRIMARY PRESSURE below 1615 psi, open the valve, then put both back in AUTO.*



Background

The accumulators are tanks of borated water pushed by nitrogen gas at 665 psi. They fire by themselves if loop pressure ever falls below that pressure, which is why they are kept isolated while the plant is cold. Above 1615 psi the plant removes power from the valve, so it has to be opened before that point.



11\. Wait until AVG COOLANT TEMPERATURE reaches 542 °F. Do not move rods or change BORON.

○ When AVG COOLANT TEMPERATURE > 541 °F



⏩ About 11 plant-hours at 1× — set the speed control to 3600×.



Background

The pumps are doing the work now. Watch AVG COOLANT TEMPERATURE, PRESSURIZER LEVEL rising as the water expands, and REACTOR POWER staying at zero. On the steam side, STEAM PRESS climbs toward 1020 psi as the water in the steam generator heats up; the next step hands that pressure to the steam dump to hold.





12\. Verify ISOLATE is lit on the RHR card and LETDOWN reads above 0 gpm.

12a✓ ISOLATE lit on the RHR card (the suction valve shut itself)

12b✓ LETDOWN above 0 gpm



Background

The Residual Heat Removal (RHR) suction valve shut itself when PRIMARY PRESSURE passed 600 psi during the climb; that is an interlock, not something you do. Letdown now leaves only through the orifices you opened earlier, about 11 gpm at this pressure. If it reads zero, water is going in and nothing is coming out.





13\. Press AUTO on the STEAM DUMP card.

✓ When AUTO is lit on the STEAM DUMP card



*The dump now holds STEAM PRESS at the 1020 psi in the DUMP SETPOINT box.*



Background

From here the plant makes more heat than it needs, and the steam dump sends the excess to the condenser. Without it the steam side keeps climbing until the ATMOS DUMP valve opens and vents steam to the sky for the rest of the heatup. Real plants run the dump in this pressure-holding mode whenever the turbine is off.





14\. Raise SET PZR PRESSURE to 2235 psi, normal operating pressure.

○ When PRIMARY PRESSURE > 2176 psi



⏩ About 1.5 plant-hours at 1× — set the speed control to 600×. About 20 plant-minutes on full heaters. Use the speed buttons at the top. <<<WHICH IS IT, 1.5 PLANT HOURS OR 20 PLANT-MINUTES?>>>



Background

The second stage of the pressurization. Crossing the 1972 psi gate re-arms the emergency injection, and that is safe now because the steam side is hot: STEAM PRESS sits near 1020 psi, far above the 328 psi that would trigger it. That is why this setting waited for the heatup to finish.





15\. Verify Hot Standby: AVG COOLANT TEMPERATURE 547 °F, PRIMARY PRESSURE 2235 psi, CONTROL ROD POSITION still 0.

15a✓ Plant in Mode 3, Hot Standby

15b✓ ATMOS DUMP shut

15c✓ STEAM PRESS near 1020 psi



Background

Hot Standby (Mode 3) is hot and at pressure with the reactor still shut down. The control bank never moved: the pumps did all the heating. STEAM PRESS holding near 1020 psi with the ATMOS DUMP shut says the steam dump is carrying the heat, not the sky.





16\. Verify the reactor stayed shut down: SOURCE RANGE counts steady, STARTUP RATE near 0.00.

✓ When Net reactivity < -300 pcm <<<THIS SHOULD BE BASED ON THE PLANT INDICATIONS SOURCE RANGE AND STARTUP RATE, NOT A PHYSICS ONE>>>



The done-when line reads NET REACTIVITY in pcm — hundredths of a percent of reactivity, a computed diagnostic on the Indications tab, not a board gauge. Below zero means shut down, and −300 pcm is a long way below. On the board the same fact is SOURCE RANGE steady and STARTUP RATE at 0.00.

REVISED 2026-09-15 (#653 S-9): `pcm` appears exactly ONCE in both legs — here — on a step graded on a quantity that is not on the board, and the unit was never defined. The done-when LINE itself is rendered by `PRED_DISPLAY` in ui/app.js from `acc.p` and is not authorable from the step, so the note is where the unit gets defined. **The acceptance is deliberately untouched**: your note above it asks for this step to grade on SOURCE RANGE and STARTUP RATE instead, and that is a grading change owing its own measurement — still open.



Background — not an action

There is no gauge for "how shut down" a reactor is. The signs are SOURCE RANGE counts holding at a steady background instead of climbing, and STARTUP RATE sitting at zero. With the control bank in and boron at the cold concentration, the core is a long way from critical.





17\. Verify REACTOR POWER reads 0.0 %.

✓ When REACTOR POWER < 1 %



*If it is not, stop and find out what moved: the control bank or BORON.*



Background

Power at zero is the whole point of a pump-heat heatup: the friction of the running pumps warmed the plant, not a chain reaction. Power above 0% means something pulled the control bank or diluted the boron.



\*\*\* WALKTHROUGH MODE 3 to MODE 1



1\. Verify the plant is hot and shut down: AVG COOLANT TEMPERATURE 547 °F, PRIMARY PRESSURE 2235 psi, RCP FLOW on.

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



REVISED 2026-09-15, TWO DEFECTS. **(#653 S-11)** *"and the settle takes longer at every rung"* was an unmeasured claim in player copy: measured on the built pool, **all four settle rungs on steps 5–8 carry IDENTICAL acceptances** — `startup_rate ~0 ±0.02`, then counts `steady` at 3 % over a 120 s window. The PLANT does settle more slowly nearer criticality (your own observation, verified above: counts-steady at 223 / 226 / 281 / 507 s), but the live durations were not re-measured in this pass, so the sentence is removed rather than replaced with a number nobody has taken. **(#653 S-5)** this step's hold is 420 s, so the GENERATED line offers **60×** while the authored hint said **10×** — one line, two speeds, and 60× is wrong for the rod pull this step opens with (the rung is 25 steps wide, 180 to 205, and MED is 48 steps a minute at 1× — this file's own step-5 figure — i.e. 48 a second at 60×). The hint now says which rung is for which half.



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

**THE LENGTH BARELY MOVED AND THAT IS A GATE, NOT A CHOICE — and it is the one thing here you may want to rule on.** 2,103 → 2,023 characters. The plan was to move the teaching into the step's Background block, but `run_style`'s **W-detail** check caps a details paragraph at **three sentences**, so Background could take only the core (502 → 595) and the rest had to stay in the note. What DID change is the ORDER, which is the half the reviewer lost: actions first, then the four rate/PERIOD remedies, then the instrument teaching. **A real shrink needs one of two things from you:** relax W-detail for the Background block (it is supplemental context, not an instruction, and this step is the only one that strains it), or turn the actions into lettered `accs_ordered` rungs the way steps 5–8 now are — which is a GRADING change and owes its own measurement. **Recommendation: the `accs_ordered` rungs**, because they fix the lost-action complaint structurally rather than by moving prose around, and the machinery shipped yesterday; relaxing a style cap to make one long note legal is the weaker of the two.

ONE REMEDY WAS ADDED (#653 S-10): the note gave three remedies for a startup rate too HIGH and none for too LOW. The reviewer settled at **+0.01 decades per minute with PERIOD reading 2,391 s** and stalled, having to infer "tap more". The on-plan figures are this step's own pre-existing measurement (about 0.15 settled, five steps above critical; PERIOD 150 to 200 s; under 60 s means too far out) and the "Watch for" line widens from "about 150 s" to "150 to 200 s" to match. **The acceptance is untouched** — this is a copy change; turning the single done-when into a rung sequence would be a grading change and owes its own measurement.



Background — not an action

Critical means the chain reaction sustains itself: power keeps rising with nothing pushing it, and a positive STARTUP RATE with the rods still is the sign. No single step is dramatic, but ten of them are — below the point of adding heat nothing in the plant takes that reactivity back out for you, so how far past criticality you stop is what sets how fast power climbs. REACTOR POWER is the last instrument to show any of it: it reads 0.0 % for about twenty-five plant-minutes while INTER RANGE climbs three decades, which is why STARTUP RATE, PERIOD and INTER RANGE are the ones to steer on. STARTUP RATE runs high while a rod is moving and goes on falling for about five minutes after it stops, so it is only worth reading once it has stopped falling; PERIOD, under the instrument card, is the same fact in seconds — how long power takes to multiply by ten. SOURCE RANGE switches itself off part way through this step, above 1.0e5 (100,000 counts per second); that is normal and there is no button for it. The two detectors overlap on purpose — the source-range counters would wear out at power, so the plant secures them once INTER RANGE has a reading, and losing the counts is the plant telling you the approach worked. The plant does exactly the same thing at 1×, 5× or 10× — the climb still stops itself just over 4 % — so the speed costs you nothing here.



REVISED 2026-09-15 *(OWNER RULING, 2026-09-14: "Rewrite both")*, answering "the rate the power climbs seems to be is nothing until it suddenly shoots up in power if the user has pulled the rods out too far. It could be we need to explain how to use the intermediate range better."

MEASURED on this tree, full stack, the authored route driven end to end (ladder at MED with the new 600 s last settle, then the creep at SLOW), true critical control bank 208 of 627:

| after the rods stop | +11 creep → bank 213 (+5) | +19 creep → bank 221 (+13) |
|---|---|---|
| STARTUP RATE at 12 s | 0.255 | 0.568 |
| STARTUP RATE settled | 0.163 | 0.525 |
| PERIOD settled | 158 s | 49 s |
| REACTOR POWER first reads 0.1 % | 1396 s (23.3 plant-minutes) | 400 s (6.7 plant-minutes) |
| INTER RANGE over that window | 9.7e-10 → 2.5e-6 A | 3.3e-9 → 5.7e-4 A |
| power levels at | about 4 % | 7.0 % |

Two things deliberately NOT said, because they did not reproduce: the first reading after a single TAP is **1.3×** the settled value (0.137 → 0.187 → 0.16), not the seven times an earlier report proposed — that seven came from a continuous withdrawal, not a tap; and power arrives about **three** times sooner when over-withdrawn, not six. There is also no startup-rate rod block on this plant, so the step never implies one exists.





