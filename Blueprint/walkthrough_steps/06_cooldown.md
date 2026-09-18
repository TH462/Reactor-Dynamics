# Cooldown to Mode 5, Cold Shutdown

**Walkthrough id: `pwr_cooldown`  ·  15 steps**

> Edit this freely — it is the step text, and it is what the sim is brought down to.
> Agent notes go at the END of the file, never between the steps.

---

1\. On the BORON card set 920 and press Enter. Do not start cooling until BORON STATUS reads BORATING.

Control: Boron control  ·  Target: BORON reads 920 ppm, ON lit

Note: Press ON only if it is not already lit.

Background

Hot, the plant is comfortably shut down on about 719 ppm of boron. Cold water makes the chain reaction easier, and the same core at 122 °F needs about 920 ppm for the same margin. Adding it first means the margin arrives before the cold does.

[HIGHLIGHTED: Boron Target (pulsing); Boron Status, Boron Concentration (steady)]


2\. Lower SET PZR PRESSURE to 1900 psi.

Control: Pressure SP  ·  Target: PRIMARY PRESSURE below 1972 psi

Note: Below 1972 psi the plant lets you switch off the protection in the next step.

Background

Two automatic protections watch for falling pressure, because on a running plant falling pressure means a leak. They can only be switched off below 1972 psi, so the setpoint comes under that first. This is not the depressurization; it only unlocks the next step.

[HIGHLIGHTED: Pressure SP (pulsing); Primary Pressure (steady)]


3\. Press TRIP BLOCKS, then BLOCK the PZR PRESS LO-LO and SI REACTOR TRIP rows. Then press STOP on ECCS.

Control: Trip Blocks  ·  Target: PZR PRESS LO-LO and SI REACTOR TRIP lit on the TRIP BLOCKS panel; ECCS STOP lit

3a. PZR PRESS LO-LO blocked
3b. SI REACTOR TRIP blocked
3c. STOP pressed on the ECCS card

Note: TRIP BLOCKS is on the ROD CONTROL card; STOP is on the ECCS card.

Background

To the automatic protection, a cooldown looks exactly like a leak: pressure falling on a hot plant. Left on, the first cooling stage would trip the reactor and start the emergency injection pumps, flooding the plant with cold water you did not ask for. STOP on the ECCS card takes the injection pump out of standby as well.

[HIGHLIGHTED: Trip Blocks, ECCS (pulsing)]


4\. Press AUTO on the STEAM DUMP card, then lower DUMP SETPOINT 50 psi at a time from 1020 to 120.

Control: Dump SP  ·  Target: STEAM DUMP status PRESS; AVG COOLANT TEMPERATURE below 347 °F

4a. STEAM DUMP AUTO lit, status PRESS
4b. AVG COOLANT TEMPERATURE below 347 °F

Note: Press AUTO until the status reads PRESS; in TAVG mode the setpoint does nothing. Small steps: one big jump drops the coolant fast and empties the pressurizer. Wait between steps until AVG COOLANT TEMPERATURE stops falling, about 5 plant-minutes. About two plant-hours in all.

Background

Steam pressure and steam temperature go together: lower the pressure the dump holds and the steam generator boils at a lower temperature, which pulls the reactor water down after it. It cannot pull the water below its own boiling point, so the walk goes all the way to 120 psi, about 341 °F, low enough for RHR to take over.

[HIGHLIGHTED: Steam Dump — Auto, Dump Setpoint (pulsing); Steam Dump Status, Tavg (steady)]


5\. Lower SET PZR PRESSURE to 1700 psi, as low as the box goes. From here pressure comes down by hand.

Control: Pressure SP  ·  Target: SET PZR PRESSURE 1700 psi; PRIMARY PRESSURE below 1770 psi

Background

The setpoint box is the at-power pressure control and it stops at 1700 psi. A real cooldown leaves it exactly there: below it the heaters have nothing to hold, and the operator lowers pressure with the spray instead.

[HIGHLIGHTED: Pressure SP (pulsing); Primary Pressure (steady)]


6\. Press OFF under HEATER, then MANUAL under SPRAY with its box at 50 %, not more.

Control: Pressurizer Heaters (PZR)  ·  Target: OFF lit under HEATER; SPRAY MANUAL at 50 %; PRIMARY PRESSURE below 1615 psi

6a. Press OFF under HEATER.
6b. Press MANUAL under SPRAY and set its box to 50 %.
6c. PRIMARY PRESSURE below 1615 psi

Note: Heaters first: with them still in AUTO the spray will not hold and pressure climbs back instead of falling. Spray water goes into the pressurizer and PRESSURIZER LEVEL climbs as pressure falls. At 100 % a pressurizer that starts high fills completely, after which the spray shuts itself off. At 50 % pressure falls about 3 psi a second with room to spare.

Background

The heaters go off first, or they boil water as fast as the spray condenses it and pressure goes nowhere. Spray condenses steam in the pressurizer and pressure falls; the setpoint box has nothing left to hold. Lowering pressure spends SUBCOOLING MARGIN, how far the reactor water is below boiling, and that has to stay positive.

[HIGHLIGHTED: Pressurizer Heaters (PZR), Pressurizer Spray (PZR) (pulsing); Primary Pressure (steady)]


7\. Close the accumulator valve: click the valve symbol inside the pulsing ring while PRIMARY PRESSURE is 1615 to 665 psi.

Control: Accumulator valve  ·  Target: ACCUMULATORS tile reads ISOLATED and 100 %

Note: The symbol sits above and right of the ACCUMULATORS tile, beside ECCS FLOW. At 50 % spray the window is about 5 plant-minutes wide.

Background

The same window as the heatup, in reverse. Above 1615 psi the valve has no power; below 665 psi the nitrogen in the tanks pushes their water into the plant. Close it in between and the tanks stay full for the next heatup.

[HIGHLIGHTED: Accumulator valve (pulsing); Primary Pressure (steady)]


8\. Wait, with SPRAY still at 50 %, until PRIMARY PRESSURE falls below 413 psi. Do not switch the spray off.

Control: (observe)  ·  Target: PRIMARY PRESSURE below 413 psi with SPRAY still at 50 %; PRESSURIZER LEVEL below 80 %

Note: About 10 plant-minutes. If PRESSURIZER LEVEL climbs past 80 %, lower SPRAY.

Background

ALIGN on the RHR card refuses to open the suction valve above 440 psi. Switch the spray off now and pressure bounces back over that number before you get there. SUBCOOLING MARGIN stays well above 100 °F on this spray.

[HIGHLIGHTED: Pressurizer Spray (PZR), Primary Pressure, Pressurizer Level (steady)]


9\. With the spray still on, press ALIGN on the RHR card, then set HX SPLIT to 7 %.

Control: Residual Heat Removal (RHR)  ·  Target: ALIGN lit on the RHR card; HX SPLIT 7 %

9a. ALIGN lit on the RHR card
9b. HX SPLIT at 7 %

Background

RHR is the low-pressure cooling loop that carries heat out of a shut-down plant. ALIGN opens its suction valve, which the plant only allows below 440 psi. HX SPLIT is how much of that loop goes through the heat exchanger; from here it is the cooldown throttle, 7 % is a gentle start, and COOLDOWN RATE beside it shows what that choice is doing.

[HIGHLIGHTED: Residual Heat Removal (RHR) (pulsing); Primary Pressure (steady)]


10\. Press OFF on the RCP FLOW card. Leave SPRAY at 50 %.

Control: RCP ON/OFF  ·  Target: RCP FLOW falling; SPRAY still MANUAL at 50 %

10a. Pumps coasting down
10b. SPRAY still on

Note: Do not switch the spray off yet — a later step does that, once the plant is cold.

Background

With RHR circulating, the reactor coolant pumps are only adding heat, so they come off. The spray stays: the pressurizer shell is still hot metal and it keeps boiling water off the top of the pressurizer, which puts pressure back up. It is the only thing taking that heat away now — the heaters are already off and the SET PZR PRESSURE box stopped reaching at 1700 psi.

[HIGHLIGHTED: RCP Run/Stop, Pressurizer Spray (PZR) (pulsing)]


11\. Raise HX SPLIT to 12 % and wait until AVG COOLANT TEMPERATURE reads below 199 °F.

Control: Residual Heat Removal (RHR)  ·  Target: AVG COOLANT TEMPERATURE below 199 °F

Note: Keep COOLDOWN RATE under 100 °F per hour: if it runs faster, lower HX SPLIT. Watch SUBCOOLING MARGIN: the spray is still running and it keeps taking the margin down. The next step shuts it.

Background

HX SPLIT is the cooldown rate now, and COOLDOWN RATE beside it is the read-back. 12 % holds about 95 °F per hour at the start and eases off as the plant closes on the RHR sink, reaching Mode 5 in about an hour and a half. Turn it higher and you go over the 100 °F per hour limit: 25 % measures 193 °F per hour.

[HIGHLIGHTED: Residual Heat Removal (RHR) (pulsing); Tavg (steady)]


12\. On the PRESSURIZER (PZR) card press OFF under SPRAY.

Control: Pressurizer Spray (PZR)  ·  Target: OFF lit under SPRAY

Background

The plant is cold now and the pressurizer shell has given up most of its stored heat, so there is nothing left for the spray to take away. Shut it and pressure sits where it is. This is the lineup the Cold Shutdown preset holds: heaters off, spray in hand and shut.

[HIGHLIGHTED: Pressurizer Spray (PZR) (pulsing)]


13\. Verify Cold Shutdown: AVG COOLANT TEMPERATURE below 199 °F, RCP FLOW off, ALIGN lit on the RHR card.

Note: PRIMARY PRESSURE will be low — the spray took it there.

Background

This is the cold-shutdown picture: water below 199 °F, pumps off, RHR carrying the heat, pressure low with the spray shut. The heatup walkthrough takes it back up.

[HIGHLIGHTED: Tavg, Primary Pressure (steady)]


14\. Verify the ACCUMULATORS tile reads 100 % and ISOLATED.

Background

You isolated the tanks on the way down so they would not empty into a depressurized plant. They have to still be full: the next heatup opens them again inside its window, and empty tanks then are a missing safety system.

[HIGHLIGHTED: Accumulators (steady)]


15\. Verify ALIGN is lit on the RHR card and HX SPLIT is above 0 %. The round trip is complete.

Background

RHR is the only thing removing heat now. If its suction valve shut, the decay heat would have nowhere to go. The heatup walkthrough is the way back.

[HIGHLIGHTED: Residual Heat Removal (RHR) (steady)]
