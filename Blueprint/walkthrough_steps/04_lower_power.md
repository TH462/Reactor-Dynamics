# Lower power

**Walkthrough id: `pwr_lower_power`  ·  6 steps**

> Edit this freely — it is the step text, and it is what the sim is brought down to.
> Agent notes go at the END of the file, never between the steps.

---

1\. On the BORON card set 719 and press Enter.

Control: Boron control  ·  Target: BORON reads 719 ppm, ON lit

Note: Press ON only if it is not already lit. The boration then runs in the background while you take the plant down.

Background

Coming down is the climb in reverse. Every percent of power shed hands reactivity back (the fuel cools, the water thickens), and it has to go somewhere. Adding boron carries most of it out; rods trim the rest over the next few minutes.

[HIGHLIGHTED: Boron Target (pulsing); Boron Status, Boron Concentration (steady)]


2\. Set LOAD to 75 MWe and let the reactor follow it down. Leave the rods alone for now.

Control: Turbine Load  ·  Target: OUTPUT 75 MWe

2a. OUTPUT settled near 75 MWe
2b. Reactor following the load down

Note: Power walks down on its own over about five plant-minutes. AVG COOLANT TEMPERATURE rises out of the green band on its tile while it does — that is expected, and the next step is what brings it back.

Background

The reactor follows the turbine: less steam drawn means the heat has nowhere to go, the water warms, and warmer water walks power down by itself. Load first, rods second, every time — insert first and you take reactivity out of a reactor still being asked for full steam, which walks the steam generator down instead.

[HIGHLIGHTED: Turbine Load (pulsing); Tavg, Reactor Power (steady)]


3\. Now hold INSERT at MED until AVG COOLANT TEMPERATURE is back inside the green band on its tile.

Control: Rod Speed  ·  Target: AVG COOLANT TEMPERATURE back inside the band; OUTPUT still 75 MWe

3a. AVG COOLANT TEMPERATURE back below 577 °F, inside its band
3b. Reactor followed down to about 73 %
3c. Generator still carrying about 75 MWe

Note: About 40 steps at MED, the middle rod speed on the ROD CONTROL card. The green band is the temperature the plant is meant to hold at the power it is making; it falls with load, from 578 °F at 100 % to 547 °F at no load. Temperature above the band: insert. Below: withdraw. Stop when it is back in the band — the boration from step 1 is still working and will keep walking it down.

Background

The load drop left the reactor hot: it settles above its programme until rods take the extra reactivity out. This is the half of the evolution the plant cannot do for you, and it is why the order matters — the turbine leads, the rods follow.

[HIGHLIGHTED: Rod Speed — Normal, Insert (pulsing); Tavg, Turbine Load (steady)]


4\. Set LOAD to 50 MWe, let power follow, then hold INSERT until AVG COOLANT TEMPERATURE is back in its band.

Control: Turbine Load  ·  Target: OUTPUT 50 MWe; AVG COOLANT TEMPERATURE inside its band

4a. Reactor following through 70 %
4b. Set LOAD to 50 MWe.
4c. Hold INSERT at MED until AVG COOLANT TEMPERATURE is back in its band.

Note: About 20 steps at MED.

Background

Same order: LOAD first, then rods, so the temperature does not sit hot above its band. STEAM GENERATOR LEVEL dips before it recovers on each drop; that is normal, and SG FEED in AUTO handles it.

[HIGHLIGHTED: Turbine Load, Insert (pulsing); Tavg (steady)]


5\. Set LOAD to 30 MWe, let power follow, then hold INSERT until AVG COOLANT TEMPERATURE is back in its band.

Control: Turbine Load  ·  Target: OUTPUT 30 MWe; AVG COOLANT TEMPERATURE inside its band

5a. Reactor following through 45 %
5b. Set LOAD to 30 MWe.
5c. Hold INSERT at MED until AVG COOLANT TEMPERATURE is back in its band.

Note: About 10 steps at MED.

Background

Lower power needs smaller rod moves. The band is walking back down toward 547 °F. A plant left hot at low load sends the difference to the condenser through the steam dump.

[HIGHLIGHTED: Turbine Load, Insert (pulsing); Tavg (steady)]


6\. Set LOAD to 15 MWe, let power follow, then hold INSERT until AVG COOLANT TEMPERATURE is back in its band.

Control: Turbine Load  ·  Target: OUTPUT 15 MWe; REACTOR POWER near 15 %

6a. Reactor below 40 % and falling as the boration finishes (rod trims take it to about 15 %)
6b. Set LOAD to 15 MWe.
6c. Hold INSERT at MED until AVG COOLANT TEMPERATURE is back in its band.

Note: About 6 steps at MED. Stop here; the shutdown walkthrough takes over.

Background

Scramming from full power is a thermal shock to the plant. About 15 % is low enough that the trip is gentle and high enough that the steam generator still has steam to dump afterwards.

[HIGHLIGHTED: Turbine Load, Insert (pulsing); Tavg (steady)]
