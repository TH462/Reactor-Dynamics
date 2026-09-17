# Shutdown to Mode 3, Hot Standby

**Walkthrough id: `pwr_shutdown`  ·  3 steps**

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

