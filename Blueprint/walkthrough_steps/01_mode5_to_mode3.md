# Mode 5, Cold Shutdown to Mode 3, Hot Standby

**Walkthrough id: `pwr_heatup`  ·  17 steps**

> Edit this freely — it is the step text, and it is what the sim is brought down to.
> Agent notes go at the END of the file, never between the steps.

---

1\. Verify the plant is cold and shut down: AVG COOLANT TEMPERATURE 122 °F, PRIMARY PRESSURE 363 psi, RCP FLOW OFF.

Note: Both rod positions read 0 of 627.

Background

In Cold Shutdown (Mode 5) the water is far below boiling, pressure is low, the Residual Heat Removal (RHR) loop is carrying the small amount of heat the fuel still makes, and both rod banks are fully inserted.

[HIGHLIGHTED: Tavg, Primary Pressure, Residual Heat Removal (RHR), Control Rod Position, Shutdown Rod Position (steady)]


2\. Start the reactor coolant pumps: press ON on the RCP FLOW card.

Control: RCP ON/OFF  ·  Target: RCP FLOW above 90 %

Background

A shut-down reactor makes very little heat compared to a critical reactor, but the running pumps put about half a percent of full power into the water as friction. That is enough to warm the whole plant. Real crews heat up exactly this way, with the reactor never critical.

[HIGHLIGHTED: RCP Run/Stop (pulsing)]


3\. On the ROD CONTROL card press FAST, then click WITHDRAW under SHUTDOWN once.

Control: Shutdown Bank  ·  Target: SHUTDOWN ROD POSITION 627 of 627

Note: One click starts the shutdown bank and it runs to 627 of 627 by itself, about 9 plant-minutes. Clicking WITHDRAW again stops it early. Watch SHUTDOWN ROD POSITION count up.

Background

In a PWR, shutdown rod groups (shutdown banks) stay fully withdrawn during normal power operation. Their purpose is to supply a large, rapid insertion of negative reactivity on a reactor trip (SCRAM) so the core goes subcritical and stays that way. They are withdrawn first during startup and are not used for routine power or temperature (Tavg) control.

[HIGHLIGHTED: Rod Speed — Fast, Shutdown Bank — Withdraw (pulsing); Shutdown Rod Position (steady)]


4\. Verify the turbine is tripped, nothing to press: TRIP lit on the TURBINE-GENERATOR card, OUTPUT 0 MWe.

Control: Turbine Load  ·  Target: TRIP lit, OUTPUT 0 MWe

Note: The ring on TRIP marks the lamp to read, not a button to push. If LOAD reads anything but 0, press UNLOAD. UNLOAD is not TRIP: UNLOAD walks the load setting to zero, TRIP shuts the steam valves.

Background

The cold plant starts with the turbine tripped. It matters because a turbine taking any steam on pump heat would carry away the very heat you are trying to build up.

[HIGHLIGHTED: Turbine — Trip, Turbine Load, Generator Output (steady)]


5\. Set SG FEED to AUTO.

Control: Feed Pumps  ·  Target: SG FEED reads AUTO, STEAM GENERATOR LEVEL near 65 %

Background

The steam generator is the boiler: reactor water heats it on one side and steam comes off the other. Nothing is boiling yet, so the feed pumps start out stopped. Putting level control in AUTO now, while the plant is quiet, means it is already holding level when the water starts to boil later in the heatup.

[HIGHLIGHTED: SG Feed AUTO (pulsing); SG Level (steady)]


6\. Verify the STEAM DUMP is closed, nothing to press: CLOSE lit on the STEAM DUMP card, status reading MANUAL.

Note: The ring on CLOSE marks the lamp to read, not a button to push.

Background

The steam dump sends steam straight to the condenser instead of the turbine. Kept shut, the steam side bottles up and the pump heat stays in the plant. The DUMP SETPOINT box already reads 1020 psi, but that number does nothing until AUTO is pressed, which a later step does once the steam side is hot.

[HIGHLIGHTED: Steam Dump — Close, Steam Dump, Steam Dump Status, Steam Dump Valve, Steam Dump Opening (steady)]


7\. Press A+B 7 % on the LETDOWN card to open the letdown path.

Control: Letdown Orifices (CVCS)  ·  Target: A+B 7 % lit; LETDOWN reads above 0 gpm

7a. Orifice A in service
7b. Orifice B in service

Background

Water is always being pumped into the reactor loop (charging), so it always needs a way out (letdown). Right now letdown leaves through the RHR loop, and that path closes itself at 600 psi once the heaters start the pressure climb. The letdown orifices, two fixed holes, are the only way out after that; with them shut the plant would slowly fill solid.

[HIGHLIGHTED: Letdown Orifices (CVCS) (pulsing); Letdown Flow (steady)]


8\. On the PRESSURIZER (PZR) card press AUTO under SPRAY.

Control: Pressurizer Spray (PZR)  ·  Target: AUTO lit under SPRAY

Note: Nothing moves yet. The spray only opens when pressure runs above the SET PZR PRESSURE box, and the cold plant is about 1340 psi below it.

Background

The pressurizer is a tank of half water, half steam that sets the pressure of the reactor loop: heaters inside the pressurizer boil water to create steam and raise pressure, spray condenses steam to lower it. The cold plant starts with both off. Spray goes in first because it is the only brake on the climb the next step starts, and a control you want in service before you need it is one you put in service while nothing is happening.

[HIGHLIGHTED: Pressurizer Spray (PZR) (pulsing)]


9\. On the PRESSURIZER (PZR) card press AUTO under HEATER. PRIMARY PRESSURE climbs to 665 psi.

Control: Pressurizer Heaters (PZR)  ·  Target: AUTO lit under HEATER; PRIMARY PRESSURE climbing to 665 psi

9a. AUTO lit under HEATER
9b. PRIMARY PRESSURE at 665 psi, the accumulator window

Note: At 665 psi the clock drops to 1× by itself and stays there until the accumulator valve in the next step is open.

Background

The heaters boil water in the pressurizer, and that steam sets the pressure of the whole reactor loop; the SET PZR PRESSURE box is already sitting at 1700 psi, the lowest it goes, so they go to full power and stay there until the plant gets near it. Pressure stops at 1700 rather than going straight to normal because of an automatic gate at 1972 psi: above that gate the emergency injection pumps re-arm, and with the steam side still cold they would fire on a healthy plant. On the way up the plant passes 665 psi, the accumulator window the next step needs.

[HIGHLIGHTED: Pressurizer Heaters (PZR) (pulsing); Primary Pressure (steady)]


10\. Open the accumulator valve: click the valve symbol inside the pulsing ring while PRIMARY PRESSURE is 665 to 1615 psi.

Control: Accumulator valve  ·  Target: ACCUMULATORS tile no longer reads ISOLATED

Note: Above 1615 psi the valve locks, and the ACCUMULATORS caution is expected until pressure passes 1000 psi. If the window is missed: press OFF under HEATER and MANUAL under SPRAY at 100 %, wait for PRIMARY PRESSURE below 1615 psi, open the valve, then put both back in AUTO.

Background

The accumulators are tanks of borated water pushed by nitrogen gas at 665 psi. They fire by themselves if loop pressure ever falls below that pressure, which is why they are kept isolated while the plant is cold. Above 1615 psi the plant removes power from the valve, so it has to be opened before that point.

[HIGHLIGHTED: Accumulator valve (pulsing); Primary Pressure (steady)]


11\. Wait until AVG COOLANT TEMPERATURE reaches 542 °F. Do not move rods or change BORON.

Control: (observe)  ·  Target: AVG COOLANT TEMPERATURE 542 °F or higher, REACTOR POWER still 0 %

Background

The pumps are doing the work now. Watch AVG COOLANT TEMPERATURE, PRESSURIZER LEVEL rising as the water expands, and REACTOR POWER staying at zero. On the steam side, STEAM PRESS climbs toward 1020 psi as the water in the steam generator heats up; the next step hands that pressure to the steam dump to hold.

[HIGHLIGHTED: Tavg, Primary Pressure, SG Pressure (steady)]


12\. Verify ISOLATE is lit on the RHR card and LETDOWN reads above 0 gpm.

12a. ISOLATE lit on the RHR card (the suction valve shut itself)
12b. LETDOWN above 0 gpm

Background

The Residual Heat Removal (RHR) suction valve shut itself when PRIMARY PRESSURE passed 600 psi during the climb; that is an interlock, not something you do. Letdown now leaves only through the orifices you opened earlier, about 11 gpm at this pressure. If it reads zero, water is going in and nothing is coming out.

[HIGHLIGHTED: Letdown Orifices (CVCS), Residual Heat Removal (RHR), Letdown Flow (steady)]


13\. Press AUTO on the STEAM DUMP card.

Control: Steam Dump  ·  Target: AUTO lit on the STEAM DUMP card, status reading PRESS

Note: The dump now holds STEAM PRESS at the 1020 psi in the DUMP SETPOINT box.

Background

From here the plant makes more heat than it needs, and the steam dump sends the excess to the condenser. Without it the steam side keeps climbing until the ATMOS DUMP valve opens and vents steam to the sky for the rest of the heatup. Real plants run the dump in this pressure-holding mode whenever the turbine is off.

[HIGHLIGHTED: Steam Dump — Auto (pulsing); Steam Dump, Steam Dump Status, SG Pressure (steady)]


14\. Raise SET PZR PRESSURE to 2235 psi, normal operating pressure.

Control: Pressure SP  ·  Target: PRIMARY PRESSURE above 2175 psi

Background

The second stage of the pressurization. Crossing the 1972 psi gate re-arms the emergency injection, and that is safe now because the steam side is hot: STEAM PRESS sits near 1020 psi, far above the 328 psi that would trigger it. That is why this setting waited for the heatup to finish.

[HIGHLIGHTED: Pressure SP (pulsing); Primary Pressure (steady)]


15\. Verify Hot Standby: AVG COOLANT TEMPERATURE 547 °F, PRIMARY PRESSURE 2235 psi, CONTROL ROD POSITION still 0.

15a. Plant in Mode 3, Hot Standby
15b. ATMOS DUMP shut
15c. STEAM PRESS near 1020 psi

Background

Hot Standby (Mode 3) is hot and at pressure with the reactor still shut down. The control bank never moved: the pumps did all the heating. STEAM PRESS holding near 1020 psi with the ATMOS DUMP shut says the steam dump is carrying the heat, not the sky.

[HIGHLIGHTED: Tavg, Primary Pressure, SG Pressure, Control Rod Position (steady)]


16\. Verify the reactor stayed shut down: SOURCE RANGE counts steady, STARTUP RATE near 0.00.

Note: The done-when line reads NET REACTIVITY in pcm — hundredths of a percent of reactivity, a computed diagnostic on the Indications tab, not a board gauge. Below zero means shut down, and −300 pcm is a long way below. On the board the same fact is SOURCE RANGE steady and STARTUP RATE at 0.00.

Background

There is no gauge for "how shut down" a reactor is. The signs are SOURCE RANGE counts holding at a steady background instead of climbing, and STARTUP RATE sitting at zero. With the control bank in and boron at the cold concentration, the core is a long way from critical.

[HIGHLIGHTED: Source Range, Startup Rate (steady)]


17\. Verify REACTOR POWER reads 0.0 %.

Note: If it is not, stop and find out what moved: the control bank or BORON.

Background

Power at zero is the whole point of a pump-heat heatup: the friction of the running pumps warmed the plant, not a chain reaction. Power above 0% means something pulled the control bank or diluted the boron.

[HIGHLIGHTED: Reactor Power, Control Bank, Boron (steady)]



## Notes — agent record, NOT step text

*Moved out of the steps 2026-09-17 (OWNER, 2026-09-17: "the .md files with the text from the
walkthroughs are almost unreadable now with all the notes... keep the text clean so i can easily
edit them."). Nothing here is instruction to a player. Add new notes HERE.*

REVISED 2026-09-15 (#653 S-9): `pcm` appears exactly ONCE in both legs — here — on a step graded on a quantity that is not on the board, and the unit was never defined. The done-when LINE itself is rendered by `PRED\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_DISPLAY` in ui/app.js from `acc.p` and is not authorable from the step, so the note is where the unit gets defined. **The acceptance is deliberately untouched**: your note above it asks for this step to grade on SOURCE RANGE and STARTUP RATE instead, and that is a grading change owing its own measurement — still open.

REFRESHED FROM THE SIM 2026-09-21 — DIRECTION FLIPPED FOR ONE PASS *(OWNER, 2026-09-21: "update
the .md files to what is in the sim for the walkthrough steps")*. Every other reconcile brought the
pool DOWN to this file; this one wrote the file FROM the built pool (`ui/manual_procedures.js`,
`RD.MANUAL_PROCEDURES.pwr2`, id `pwr_heatup`). 17 steps in, 17 out. The file is now in the format
03–06 already carried, which renders exactly: step line, `Control:`/`Target:`, the lettered `accs`
rows, `Note:`, `Background`, `[HIGHLIGHTED: … ]` from `hl` (pulsing) / `hl_watch` (steady). It does
NOT render the panel's done-when (`✓ When …` / `○ When …`), the ⏩ speed hint, or a hand-written
HIGHLIGHT line — none of those three is a field this file can set, and the same renderer reproduces
03, 04, 05 and 06 byte for byte, which is what makes it the format rather than a choice.

**YOUR LINES THAT THE REFRESH REPLACED, so you can re-apply any of them by editing above and asking
for the pool to come back down.** Left of the arrow is what this file said, right is what ships:

* step 1 — "Verify the plant is cold and shut down: … **Reactor Coolant Pump (RCP)** FLOW OFF." → "… **RCP** FLOW OFF."
* step 1 done-when — you struck "(true value)" from "the plant reads Mode 5, Cold Shutdown (true value)". That suffix is `ui/app.js` (two sites, ~4491 and ~4700) and is appended to EVERY true-state acceptance, not just this one; it was not changed.
* step 2 — "Start the **Reactor Coolant Pump (RCP)**: press ON…" → "Start the **reactor coolant pumps**: press ON…"
* step 2 Background — "…warm the whole plant **with the reactor never critical.**" → "…warm the whole plant. **Real crews heat up exactly this way, with the reactor never critical.**"
* step 3 Background — "In a **Pressurized Water Reactor (PWR)**," → "In a **PWR**,"
* step 5 — "Set the **Steam Generator feed system [SG FEED]** to AUTO." → "Set **SG FEED** to AUTO."
* step 5 Background — "The steam generator **(SG)** is the boiler" → "The steam generator is the boiler"
* step 7 Background — "closes itself at 600 psi **on the next step's pressure climb**" → "closes itself at 600 psi **once the heaters start the pressure climb**"; your trailing "[HIGHTLIGHT: …]" line went with it (the pool's own highlights are printed instead).
* step 8, step 9 Backgrounds — your trailing "[HIGHLIGHT: …]" lines, same reason.
* step 9 Background — "an automatic **safety** gate at 1972 psi" → "an automatic gate at 1972 psi"
* step 10 — "Open the **ACCUMULATOR** valve: click the valve symbol **to open it** while…" → "Open the **accumulator** valve: click the valve symbol **inside the pulsing ring** while…"
* step 10 Background — "fire by themselves if loop pressure ever falls below **600 psi**" → "…below **that pressure**". **This one is not just wording:** the sentence before it says the nitrogen is at 665 psi, and 665 is the pressure they fire at. 600 psi is the RHR suction interlock, a different number on a different valve.
* step 12 — "Verify ISOLATE is lit on the **Residual Heat Removal (RHR)** card" → "…on the **RHR** card"
* step 12 Background — "that is an **automatic** interlock" → "that is an interlock"
* step 15 Background — "The control **rod** bank never moved" → "The control bank never moved"; "…says the steam dump is carrying the heat." → "…carrying the heat, **not the sky**."

Your spell-out edits (RCP, PWR, SG, RHR, SG FEED) are the standing "spell out every code" directive
applied to player copy and are the largest single group here. They were never carried into the pool,
so this refresh dropped them; re-applying them is one edit above plus a reconcile, not new work.
