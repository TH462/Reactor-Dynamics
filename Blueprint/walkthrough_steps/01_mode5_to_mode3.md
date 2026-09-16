# Mode 5, Cold Shutdown to Mode 3, Hot Standby

**Walkthrough id: `pwr_heatup`  ·  17 steps**

> **This file is YOUR authored step text and it is the AUTHORITY for this walkthrough.**
> The built pool (`ui/manual_procedures.js`) comes DOWN to it — including prose an agent added.
> Highlights are the exception: a step with no highlight entry here keeps the highlights the
> pool has, per your standing instruction.
>
> Split out of `Blueprint/WALKTHROUGH_STEPS_OWNER.md` on 2026-09-15 *(OWNER DIRECTIVE,
> 2026-09-15: "I want to be able to manually review and edit the steps for the walkthroughs
> easier. can you make a folder within blueprints/ and create a new file for each walkthrough.")*.
> **The text below is byte-for-byte what that file carried** — nothing was reworded in the move.
> The instructions, rulings and open decisions stay in the parent file; this one is steps only.

---

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

REVISED 2026-09-15 (#653 S-9): `pcm` appears exactly ONCE in both legs — here — on a step graded on a quantity that is not on the board, and the unit was never defined. The done-when LINE itself is rendered by `PRED\_DISPLAY` in ui/app.js from `acc.p` and is not authorable from the step, so the note is where the unit gets defined. **The acceptance is deliberately untouched**: your note above it asks for this step to grade on SOURCE RANGE and STARTUP RATE instead, and that is a grading change owing its own measurement — still open.



Background — not an action

There is no gauge for "how shut down" a reactor is. The signs are SOURCE RANGE counts holding at a steady background instead of climbing, and STARTUP RATE sitting at zero. With the control bank in and boron at the cold concentration, the core is a long way from critical.





17\. Verify REACTOR POWER reads 0.0 %.

✓ When REACTOR POWER < 1 %



*If it is not, stop and find out what moved: the control bank or BORON.*



Background

Power at zero is the whole point of a pump-heat heatup: the friction of the running pumps warmed the plant, not a chain reaction. Power above 0% means something pulled the control bank or diluted the boron.



