The steps should not include elements not included in my manual edits below except for highlights. some steps didn't get highlight entries but that doesn't mean the step doesn't get highlights.



**RULINGS RECORDED HERE SO THE NEXT RECONCILE DOES NOT UNDO THEM** (2026-09-15)

- **The 100 °F/hr heatup-rate limit stays OUT of the Mode 5 → Mode 3 walkthrough** *(OWNER RULING, 2026-09-14, on options put as "put it back in a step / put it in a note / leave it out": selected "Leave it out of the walkthrough")*. It used to live in that leg's leg-level cautions, which were retired from the pool; it did not go missing, it was ruled out. **The cooldown leg keeps its own 100 °F/hr** and the manuals are unchanged — do not "restore" the heatup one as a missing-content defect.
- **Step 8 of Mode 3 → Mode 1 gets a "counts steady" check-off** *(OWNER RULING, 2026-09-15: selected "add a steadiness predicate" from three options put to him — raise the count target to 12,000 / add a steadiness predicate / leave it as text — taking the one that needed new plumbing over the one-number change. A selection, not verbatim words; the rationale relayed with it is that a steady count rate is what an operator actually looks for and an absolute threshold is only a stand-in for it)*. The 7,000 counts per second target is HIS number and stays as the floor; 8b is added beside it, and the old 8a ("Point plotted") is now 8c. Measured: the live step used to accept 47 s after the rods stop with the 1/M prediction reading 213.7 against a true critical of 208; it now accepts at 506 s, prediction 208.8, and the authored 600 s replay hold clears the same predicate with 72 s to spare. Do not "simplify" 8b back out.
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





4\. Verify the turbine is tripped: TRIP lit on the TURBINE-GENERATOR card, OUTPUT 0 MWe.

✓ When the turbine is tripped



*If LOAD reads anything but 0, press UNLOAD. UNLOAD is not TRIP: UNLOAD walks the load setting to zero, TRIP shuts the steam valves.*



Background

The cold plant starts with the turbine tripped. It matters because a turbine taking any steam on pump heat would carry away the very heat you are trying to build up.



\[HIGHLIGHTED: TURBINE-GENERATOR CARD (steady), TRIP (pulsing)]





5\. Set SG FEED to AUTO.

○ When SG FEED is in AUTO



Background

The steam generator is the boiler: reactor water heats it on one side and steam comes off the other. Nothing is boiling yet, so the feed pumps start out stopped. Putting level control in AUTO now, while the plant is quiet, means it is already holding level when the water starts to boil later in the heatup.





6\. Verify the STEAM DUMP is closed: CLOSE lit on the STEAM DUMP card, status reading MANUAL.

✓ When STEAM DUMP opening < 1 %



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





10\. Open the accumulator valve: click the valve symbol in the green ring while PRIMARY PRESSURE is 665 to 1615 psi.

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



Net reactivity reads on the Indications tab, not the board.



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



*SOURCE RANGE counts should be steady, not climbing. One alarm is already up and belongs here: Turbine Trip / Low Steam Demand on the ALARMS list, short form TURB TRIP. The turbine is off and the plant is making no steam. Press ACKNOWLEDGE and leave it.*



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



5\. Press MED, then hold WITHDRAW under CONTROL until SOURCE RANGE settles above 7.0e2. Settle, then press Plot point.

5a○ Counts settled above 7.0e2 (700 counts per second)

5b○ Point plotted



*Stop when CONTROL ROD POSITION reads about 80 to 100. Holding WITHDRAW drives the bank at the selected speed and releasing it stops; a single tap moves one step. MED moves 48 steps a minute at 1×, SLOW 8, FAST 72. A point plotted while STARTUP RATE is still positive reads low.*



⏩ Set the speed control to 10x if you don't want to wait in real time for the rod movement.



Background

The first two points always predict too high: near the bottom the rods are worth little per step, so the line they draw crosses zero far past the real critical position. That is expected. While the reactor is shut down, SOURCE RANGE counts are the only thing that tells you how close you are; the rod position does not.





6\. Hold WITHDRAW at MED until SOURCE RANGE settles above 1.4e3. Settle, press Plot point, then read the 1/M prediction.

6a○ Counts settled above 1.4e3 (1,400 counts per second)

6b○ Point plotted



*Stop when CONTROL ROD POSITION reads about 150 to 175 steps.*



⏩ Set the speed control to 10x if you don't want to wait in real time for the rod movement.



Background

Each new point is taken closer to critical, where a step is worth more, so the line steepens and the predicted crossing walks toward you. The panel prints "predicted criticality ≈ step N" with a marker on the plot. Treat it as too high for now; it improves with every point.





7\. Hold WITHDRAW at MED until SOURCE RANGE settles above 3.0e3. Settle, press Plot point, read the prediction again.

7a○ Counts settled above 3.0e3 (3,000 counts per second)

7b○ Point plotted



*Stop when CONTROL ROD POSITION reads about 180 to 205 steps.*



⏩ Set the speed control to 10x if you don't want to wait in real time for the rod movement.



Background

Each step now buys more reactivity than the last, so the pulls get smaller from here. The prediction is starting to be useful. Keep waiting for STARTUP RATE to settle before each point.





8\. Hold WITHDRAW at MED until SOURCE RANGE settles above 7.0e3. Settle, press Plot point. This is the last point.

8a○ Counts above 7.0e3 (7,000 counts per second)

8b○ Counts steady — under 3 % change over the last two minutes

8c○ Point plotted



*Stop when CONTROL ROD POSITION reads about 195 to 205 steps. This is the point the prediction is built on, so give it the time: SOURCE RANGE goes on climbing for about ten plant-minutes after the rods stop, and a point plotted while it is still rising throws the predicted position two or three steps too far out. Plot it when the counts have levelled off. Note the rod position at criticality the 1/M panel predicts — the reactor goes critical at it or just below, so you stop short of it and tap from there.*



⏩ The counts are still climbing when the rods stop, and the prediction is only as good as the wait you give them. Come back to 10× before the next step, where the reactor starts making power.



REVISED 2026-09-15 *(OWNER RULING, 2026-09-14: "Rewrite both")*. The step's settle went from 150 s to 600 s. MEASURED on this tree, the authored ladder with the panel's own trailing-three fit, four seeds, against a true critical of control bank 208 of 627: at a 150 s settle the final prediction reads 210.6 to 211.7 (+2.6 to +3.7 steps high); at 600 s it reads 208.0 to 209.0 (0 to +1). The error was never the fit — the counts are only about two-thirds of the way up when a 150 s hold expires.



Background

STARTUP RATE is the speedometer: 1.0 means power is multiplying by ten every minute, and any positive reading means reactivity is above zero and the chain reaction is growing. Under 1.0 is a comfortable climb; above it you are outrunning the plot, and nothing in the plant slows the rise for you yet. This is the last plotted point: from here single steps beat one more fitted number, and another burst would land you past criticality — plotting a point on a reactor that is already critical.





9\. Press SLOW and hold WITHDRAW to 3 steps short of the 1/M panel's predicted position, then tap single steps.

○ When REACTOR POWER > 0.1 %



This is a twenty-five plant-minute wait once the rods stop, and the step to use the speed buttons on: put the clock on 10×, and come back to 1× before you move a rod again. The 1/M panel predicts a CONTROL ROD POSITION, in steps — that is the number on the ROD CONTROL card — and it reads HIGH, never low: the reactor goes critical at that position or a step or two below it. Stop below the prediction and walk up in single taps, waiting after each one. Critical is when the counts keep climbing and STARTUP RATE stays positive with the rods still. STARTUP RATE runs high while a rod is moving and goes on falling for about five minutes after it stops, so read it once it has stopped falling, not while it is: settled around 0.15 is this approach going as written, and around 0.5 means you are about eight steps further out than you meant to be — power will arrive about three times sooner and level off higher. Over 1.0 with the rods already still, tap INSERT once and wait. PERIOD, under the instrument card, is the same fact in seconds — how long power takes to multiply by ten: about 150 seconds on plan, under 60 seconds says you are out too far. From your last tap onward, watch INTER RANGE and STARTUP RATE rather than REACTOR POWER: REACTOR POWER reads 0.0 % for about twenty-five plant-minutes while INTER RANGE climbs three decades, so INTER RANGE is what shows you the reactor is working. SOURCE RANGE will switch itself off part way through this step, above 1.0e5 (100,000 counts per second); that is normal and there is no button for it. The two detectors overlap on purpose — the source-range counters would wear out at power, so the plant secures them once INTER RANGE has a reading, and losing the counts is the plant telling you the approach worked. The plant does exactly the same thing at 1×, 5× or 10× — the climb still stops itself just over 4 % — so the speed costs you nothing here. Not 60×: there a 2 ½ second glance away is two and a half plant-minutes of reactor. If the reactor trips, the SCRAM button reads SCRAMMED / PRESS TO RESET; press it before the rods will move again.



Background — not an action

Critical means the chain reaction sustains itself: power keeps rising with nothing pushing it, and a positive STARTUP RATE with the rods still is the sign. No single step is dramatic, but ten of them are — below the point of adding heat nothing in the plant takes that reactivity back out for you, so how far past criticality you stop is what sets how fast power climbs. REACTOR POWER is the last instrument to show any of it, which is why STARTUP RATE, PERIOD and INTER RANGE are the ones to steer on.



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





