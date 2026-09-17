# Raise power

**Walkthrough id: `pwr_raise_power`  ·  12 steps**

> **⚠ NOT YET AUTHORED BY YOU. This is an extract of what currently SHIPS**, taken from the
> built pool (`RD.MANUAL_PROCEDURES.pwr2`) on 2026-09-15 so there is something to read and
> mark up. It is a rendering, not the source: the source is still `ui/manual_procedures.js`.
>
> **Edit it freely — and once you do, say so, because that is what makes this file the
> authority for this leg** the way the two Mode-5-to-Mode-1 files already are. Until then an
> agent must treat the POOL as current and this file as a stale copy, not the other way round.
>
> This leg is currently **`preview`** — not offered on the public site *(OWNER DIRECTIVE,
> 2026-09-15: "Release and unlock only the mode 5 to 3 walkthrough. I still need to test the
> mode 3 to 1 and other walkthroughs.")* — so it is still playable on the tester site.

> **THE TICK AND CIRCLE MARKS IN THIS FILE CARRY NO MEANING** *(OWNER, 2026-09-17: "The tick vs
> circle in my writing was because I was copy/pasting from the sim and what needed up in the
> document was whatever state it happened to be in the sim at the time. It has no special
> meaning.")*. A row drawn with a tick was simply a row that happened to be CHECKED OFF on his
> screen when he copied it; a circle was one that was not. **Do not read them as authored
> intent, do not preserve them, and never change a step's kind to match one.** The step's kind
> is decided by what it asks the player to do — action or verify — not by the glyph.
> The same goes for the backslash escaping throughout: that is his editor's round-trip, not
> content. Leave it; do not "clean" it.

---

1\. Verify Mode 1, At Power: REACTOR POWER 10 %, SG FEED AUTO, both startup trips lit on TRIP BLOCKS.

Note: The two rows are IR HIGH FLUX and PR HIGH (LOW SETPT), both lit by the startup walkthrough.

Background

This is the plant the startup hands over: critical, on the grid, feed holding level. Both startup shutdowns have to be switched off. With them on, the climb trips at 25 %, then 35 %.

[HIGHLIGHTED: Reactor Power, SG Feed AUTO, Trip Blocks (steady)]


2\. Check the TURBINE-GENERATOR card is on line: LATCH lit and OUTPUT above 8 MWe.

Control: Turbine Load  ·  Target: OUTPUT above 8 MWe

2a. Turbine latched, TRIP not lit
2b. Generator above 8 MWe

Note: If it reads TRIP, press LATCH; OUTPUT returns to the LOAD you last set. If OUTPUT stays at 0.0 MWe, set LOAD to 10 MWe. LATCH is refused while whatever tripped the turbine is still there, and the card names the reason.

Background

A tripped turbine takes no steam, so LOAD does nothing and the heat you make goes to the steam dumps instead. The plant trips the reactor on a tripped turbine the moment REACTOR POWER passes 50 %, and at 8 % if the condenser is gone as well.

[HIGHLIGHTED: Turbine Load (pulsing); Generator Output (steady)]


3\. On the BORON card set 660 and press Enter.

Control: Boron control  ·  Target: BORON reads 660 ppm, ON lit

3a. BORON set to 660 ppm

Note: Press ON only if it is not already lit. The dilution then runs in the background while you take the first stages.

Background

Every percent of power costs reactivity: the fuel heats up and the water thins out. Rods could pay for all of it but would end up deep in the core, so real plants dilute boron for the bulk and use rods for the fine trim. Dilution is not instant and it slows as it closes on the number you typed: this 24 ppm move takes about ten plant-minutes, and a 10 ppm trim later takes about the same again.

[HIGHLIGHTED: Boron Target (pulsing); Boron Status, Boron Concentration (steady)]


4\. Hold WITHDRAW at MED about 30 steps, set LOAD to 30 MWe, then trim AVG COOLANT TEMPERATURE into its band.

Control: Control Bank  ·  Target: OUTPUT 30 MWe; AVG COOLANT TEMPERATURE inside its band, near 556 °F

4a. Set LOAD to 30 MWe.
4b. Generator at 30 MWe
4c. Hold WITHDRAW at MED, about 30 steps.
4d. Trim AVG COOLANT TEMPERATURE into its band.

Note: MED is the middle rod speed on the ROD CONTROL card, 48 steps a minute. The green band on the tile is the temperature the plant is meant to hold at the power it is making, near 556 °F here. It rises with load, from 547 °F at no load to 578 °F at 100 %. Temperature below the band: withdraw. Above: insert. The plant trips on temperature before it trips on power: keep AVG COOLANT TEMPERATURE under 590 °F on every stage.

Background

Pulling rods first raises power and warms the water; raising LOAD then draws more steam and cools it back. Doing it in that order means the temperature is approached from above rather than dragged from below.

[HIGHLIGHTED: Withdraw, Rod Speed — Normal, Turbine Load (pulsing); Tavg (steady)]


5\. Hold WITHDRAW at MED about 32 steps, set LOAD to 50 MWe, then trim AVG COOLANT TEMPERATURE into its band.

Control: Control Bank  ·  Target: OUTPUT 50 MWe; AVG COOLANT TEMPERATURE inside its band, near 562 °F

5a. Set LOAD to 50 MWe.
5b. Generator at 50 MWe
5c. Hold WITHDRAW at MED, about 32 steps.
5d. Trim AVG COOLANT TEMPERATURE into its band.

Note: The band is near 562 °F at this load.

Background

Same order as the last stage: rods, then LOAD, then trim. Halfway up, xenon is starting to build in the fuel. Boron takes care of that over the coming hours; rods take care of the next few minutes.

[HIGHLIGHTED: Withdraw, Turbine Load (pulsing); Tavg (steady)]


6\. Hold WITHDRAW at MED about 35 steps, set LOAD to 75 MWe, then trim AVG COOLANT TEMPERATURE into its band.

Control: Control Bank  ·  Target: OUTPUT 75 MWe; AVG COOLANT TEMPERATURE inside its band, near 570 °F

6a. Set LOAD to 75 MWe.
6b. Generator at 75 MWe
6c. Hold WITHDRAW at MED, about 35 steps.
6d. Trim AVG COOLANT TEMPERATURE into its band.

Note: The band is near 570 °F at this load.

Background

Three-quarter power. The band has climbed with the load, toward 578 °F at 100 %. If the temperature reads below the band, you led with LOAD instead of rods: pull more steps before you add more megawatts.

[HIGHLIGHTED: Withdraw, Turbine Load (pulsing); Tavg (steady)]


7\. Hold WITHDRAW at MED about 18 steps, set LOAD to 90 MWe, then trim AVG COOLANT TEMPERATURE into its band.

Control: Control Bank  ·  Target: OUTPUT 90 MWe; AVG COOLANT TEMPERATURE inside its band, near 575 °F

7a. Set LOAD to 90 MWe.
7b. Generator at 90 MWe
7c. Trim AVG COOLANT TEMPERATURE into its band.

Note: The band is near 575 °F at this load, and the pulls get smaller from here: above 103 % power the plant stops the rods. If LOAD changes by itself, the plant ran the turbine back because the coolant was too hot. Hold INSERT until AVG COOLANT TEMPERATURE is back in its band, then set LOAD again.

Background

Above 103 % power the plant refuses to move the rods, and at 118 % it trips the reactor. Overshoot is real on this plant: 100 MWe of LOAD lands REACTOR POWER near 101 %. Small pulls keep you clear of the stop.

[HIGHLIGHTED: Withdraw, Insert, Turbine Load (pulsing); Tavg (steady)]


8\. Hold WITHDRAW at MED about 9 steps, set LOAD to 100 MWe, then trim AVG COOLANT TEMPERATURE onto 578 °F.

Control: Control Bank  ·  Target: OUTPUT 100 MWe; AVG COOLANT TEMPERATURE 578 °F

8a. Set LOAD to 100 MWe.
8b. Generator at 100 MWe
8c. Trim AVG COOLANT TEMPERATURE onto 578 °F.
8d. CONTROL ROD POSITION above 300
8e. CONTROL ROD POSITION below 600 (not on its top stop)

Background

A small pull, then the last 10 MWe of LOAD, then the trim. REACTOR POWER settles near 101 %. The control bank ends part-way out, because boron carried most of the reactivity the climb cost.

[HIGHLIGHTED: Withdraw, Turbine Load (pulsing); Tavg (steady)]


9\. Verify full power: REACTOR POWER 100 %, OUTPUT 100 MWe, AVG COOLANT TEMPERATURE 578 °F, BORON 660 ppm or below.

Control: Boron control  ·  Target: BORON at or below 660 ppm

9a. REACTOR POWER near 100 %
9b. BORON down to its 660 ppm setting
9c. AVG COOLANT TEMPERATURE between 563 and 592 °F

Note: CONTROL ROD POSITION should be part-way out, not on its stop. BORON is the one to read twice: leave the climb with more of it in the water than the plant wants and AVG COOLANT TEMPERATURE sinks over the following hours, taking PZR LEVEL with it.

Background

Full power, with almost no xenon in the fuel yet. Over the next hours xenon builds, and the plant settles into its long-term full-power state: less boron and the control bank high — 606 of 627 steps, which is where a full-power plant runs. The next step is how you get from here to there.

[HIGHLIGHTED: Reactor Power, Generator Output, Tavg, Boron Concentration (steady)]


10\. Hold WITHDRAW at MED for about 6 steps.

Control: Control Bank  ·  Target: CONTROL ROD POSITION coming up off 351; AVG COOLANT TEMPERATURE back near 580 °F

10a. CONTROL ROD POSITION above 355
10b. Still at full load, 100 MWe
10c. AVG COOLANT TEMPERATURE near 580 °F

Note: Xenon is building, and it will keep pulling AVG COOLANT TEMPERATURE down. Repeat this pull whenever the temperature drops out of its band. Small pulls, then wait for it to settle. ROD LIMIT LO-LO is lit and that is normal — the bank is low because there is no xenon yet, and it clears as you walk the bank up.

Background

Xenon is a neutron absorber that builds in the fuel over about two days, takes reactivity away, and the plant answers by making the same power at a lower temperature. Left alone this plant does not just settle cold: measured from here, PZR LEVEL is on its floor in 7 plant-hours and the reactor trips on STEAM GENERATOR LEVEL LO-LO in 17, with REACTOR POWER reading 100 % the whole way down. You give the reactivity back with two levers, rods leading because they are fast and reversible: the bank has about 250 steps to go, worth roughly 56 °F between them, and each ppm of boron about 0.6 °F.

[HIGHLIGHTED: Control Bank (pulsing); Tavg, Control Rod Position (steady)]


11\. On the BORON card set 650 and press Enter.

Control: Boron control  ·  Target: BORON coming down off 660 ppm, heading for 650

11a. BORON coming down off 660 ppm
11b. Still at full load, 100 MWe

Note: One 10 ppm dose, not the whole 43. It takes about ten plant-minutes to arrive and lifts AVG COOLANT TEMPERATURE about 5 °F on the way, to near 587 °F; xenon then takes it back down. Repeat a dose whenever the rods alone stop holding the temperature in its band.

Background

Rods are fast, but they run out: the bank has about 250 steps left and the xenon still to come costs more than they carry. Boron carries the rest, and it has to go in small doses — dial the whole way in one press and the plant heats far faster than xenon can absorb it, which trips the reactor on overtemperature.

[HIGHLIGHTED: Boron Target (pulsing); Boron Concentration, Tavg (steady)]


12\. Full power and on programme: OUTPUT 100 MWe, AVG COOLANT TEMPERATURE 580 °F, CONTROL ROD POSITION rising.

Note: Keep trimming for the next two plant-days.

Background

Where this ends up, if you keep at it: CONTROL ROD POSITION about 606 of 627 and BORON about 617 ppm, which is where this plant runs at full power with xenon at equilibrium (the settled point measures 612.3 ppm; 617 is the target you dial toward). Rods carry the first 56 °F; once the bank is near the top it has only about 21 steps of travel left, worth 4.6 °F, and BORON carries the rest — four more doses like the one you just set, 10 ppm at a time, never in one press. Type 617 in one go and the plant heats far faster than xenon can absorb it: measured, that trips the reactor on overtemperature.

[HIGHLIGHTED: Control Rod Position, Boron (steady)]

