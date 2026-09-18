# Shutdown to Mode 3, Hot Standby

**Walkthrough id: `pwr_shutdown`  ·  3 steps**

> Edit this freely — it is the step text, and it is what the sim is brought down to.
> Agent notes go at the END of the file, never between the steps.

---

1\. Set LOAD to 0 MWe and wait for OUTPUT to fall below 5 MWe.

Control: Turbine Load  ·  Target: OUTPUT below 5 MWe

Background

Taking the load off the turbine first means the scram happens with no electricity on the generator. The reactor follows the falling steam demand down by itself.

[HIGHLIGHTED: Turbine Load (pulsing)]


2\. Press SCRAM on the ROD CONTROL card: once to arm it (PRESS TO ARM), then again to scram.

Control: SCRAM  ·  Target: both rod positions 0 of 627; REACTOR POWER falling below 5 %

Background

A planned scram from low power. Both rod banks drop into the core and the chain reaction stops in seconds. The fuel keeps making about 2 % of full power from radioactive decay, and that heat has to go somewhere; the next step checks where.

[HIGHLIGHTED: SCRAM (pulsing)]


3\. Press AUTO on the STEAM DUMP card until its status reads PRESS.

3a. STEAM DUMP AUTO lit, status PRESS
3b. STEAM DUMP open, carrying the decay heat
3c. REACTOR POWER below 1 %

Note: Then check REACTOR POWER below 1 %, STEAM PRESS holding near 1020 psi, and the STEAM DUMP open a little.

Background

The chain reaction is gone, but the fuel still makes about 2 % of full power from radioactive decay, and REACTOR POWER does not show it. With the turbine tripped, AUTO puts the steam dump into pressure-holding mode and it carries that heat to the condenser. Hot, at pressure, shut down: Mode 3, Hot Standby.

[HIGHLIGHTED: Steam Dump (pulsing); Tavg, SG Pressure (steady)]
