# Raise power

**Walkthrough id: `pwr_raise_power`  ·  12 steps**

> This is the LIVE step file: the sim's `pwr_raise_power` walkthrough was brought down to it on
> 2026-09-24 (the owner, after the Mode 3 to Mode 1 leg was ported: "Adopt the format for the
> other walkthroughs."). Edit it freely — it is the step text, and it is what the sim is brought
> down to.
>
> **The format.** Line one of a step is what the step accomplishes. Each lettered substep opens
> with the action that accomplishes it, then its own Note, its own **Suggested time warp**, and
> its check-off lines drawn `()`. Background closes the step. Agent notes go at the END of the
> file, never between the steps.

---

1. Confirm the plant the startup handed over is ready to climb.

1a. Verify Mode 1, At Power: REACTOR POWER 10 %, SG FEED AUTO, both startup trips lit on TRIP BLOCKS.

Note: The two rows are IR HIGH FLUX and PR HIGH (LOW SETPT), both lit by the startup walkthrough.

Suggested time warp: 1×.

()  Plant in Mode 1, At Power

Background

This is the plant the startup hands over: critical, on the grid, feed holding level. Both startup shutdowns have to be switched off. With them on, the climb trips at 25 %, then 35 %.

[HIGHLIGHTED: Reactor Power, SG Feed AUTO, Trip Blocks (steady)]



2. Make sure the turbine is on line and taking steam.

2a. Check the TURBINE-GENERATOR card is on line: LATCH lit and OUTPUT above 8 MWe.

Note: If it reads TRIP, press LATCH; OUTPUT returns to the LOAD you last set. If OUTPUT stays at 0.0 MWe, set LOAD to 10 MWe. LATCH is refused while whatever tripped the turbine is still there, and the card names the reason.

Suggested time warp: 1×.

()  Turbine latched, TRIP not lit
()  Generator above 8 MWe

Background

A tripped turbine takes no steam, so LOAD does nothing and the heat you make goes to the steam dumps instead. The plant trips the reactor on a tripped turbine the moment REACTOR POWER passes 50 %, and at 8 % if the condenser is gone as well.

[HIGHLIGHTED: Turbine Load (pulsing); Generator Output (steady)]



3. Start the boron dilution that carries most of the climb.

3a. On the BORON card set 660 and press Enter.

Note: Press ON only if it is not already lit. The dilution then runs in the background while you take the first stages.

Suggested time warp: 1×.

()  BORON set to 660 ppm

Background

Every percent of power costs reactivity: the fuel heats up and the water thins out. Rods could pay for all of it but would end up deep in the core, so real plants dilute boron for the bulk and use rods for the fine trim. Dilution is not instant and it slows as it closes on the number you typed: this 24 ppm move takes about ten plant-minutes, and a 10 ppm trim later takes about the same again.

[HIGHLIGHTED: Boron Target (pulsing); Boron Status, Boron Concentration (steady)]



4. Take the first stage to 30 MWe, rods leading and load following.

4a. Hold WITHDRAW at MED about 30 steps, set LOAD to 30 MWe.

Note: MED is the middle rod speed on the ROD CONTROL card, 48 steps a minute.

Suggested time warp: 1× for the pull; 10× once LOAD is set, while OUTPUT climbs.

()  Load target set to 30 MWe
()  Generator at 30 MWe
()  Reactor following, near 30 %

4b. Trim AVG COOLANT TEMPERATURE into its band.

Note: The green band on the tile is the temperature the plant is meant to hold at the power it is making, near 556 °F here. It rises with load, from 547 °F at no load to 578 °F at 100 %. Temperature below the band: withdraw. Above: insert. The plant trips on temperature before it trips on power: keep AVG COOLANT TEMPERATURE under 590 °F on every stage.

Suggested time warp: 5×.

()  AVG COOLANT TEMPERATURE between 550 and 576 °F (the band is near 556)

Background

Pulling rods first raises power and warms the water; raising LOAD then draws more steam and cools it back. Doing it in that order means the temperature is approached from above rather than dragged from below.

[HIGHLIGHTED: Withdraw, Rod Speed — Normal, Turbine Load (pulsing); Tavg (steady)]



5. Take the second stage to 50 MWe the same way.

5a. Hold WITHDRAW at MED about 32 steps, set LOAD to 50 MWe.

Suggested time warp: 1× for the pull; 10× once LOAD is set, while OUTPUT climbs.

()  Load target set to 50 MWe
()  Generator at 50 MWe
()  Reactor following, near 50 %

5b. Trim AVG COOLANT TEMPERATURE into its band.

Note: The band is near 562 °F at this load.

Suggested time warp: 5×.

()  AVG COOLANT TEMPERATURE between 550 and 583 °F (the band is near 562)

Background

Same order as the last stage: rods, then LOAD, then trim. Halfway up, xenon is starting to build in the fuel. Boron takes care of that over the coming hours; rods take care of the next few minutes.

[HIGHLIGHTED: Withdraw, Turbine Load (pulsing); Tavg (steady)]



6. Take the third stage to 75 MWe the same way.

6a. Hold WITHDRAW at MED about 35 steps, set LOAD to 75 MWe.

Suggested time warp: 1× for the pull; 10× once LOAD is set, while OUTPUT climbs.

()  Load target set to 75 MWe
()  Generator at 75 MWe
()  Reactor following, near 75 %

6b. Trim AVG COOLANT TEMPERATURE into its band.

Note: The band is near 570 °F at this load.

Suggested time warp: 5×.

()  AVG COOLANT TEMPERATURE between 558 and 585 °F (the band is near 570)

Background

Three-quarter power. The band has climbed with the load, toward 578 °F at 100 %. If the temperature reads below the band, you led with LOAD instead of rods: pull more steps before you add more megawatts.

[HIGHLIGHTED: Withdraw, Turbine Load (pulsing); Tavg (steady)]



7. Take the fourth stage to 90 MWe with a smaller pull.

7a. Hold WITHDRAW at MED about 18 steps, set LOAD to 90 MWe.

Note: The band is near 575 °F at this load, and the pulls get smaller from here: above 103 % power the plant stops the rods.

Suggested time warp: 1× for the pull; 10× once LOAD is set, while OUTPUT climbs.

()  Load target set to 90 MWe
()  Generator at 90 MWe

7b. Trim AVG COOLANT TEMPERATURE into its band.

Note: If LOAD changes by itself, the plant ran the turbine back because the coolant was too hot. Hold INSERT until AVG COOLANT TEMPERATURE is back in its band, then set LOAD again.

Suggested time warp: 5×.

()  AVG COOLANT TEMPERATURE between 564 and 585 °F (the band is near 575)

Background

Above 103 % power the plant refuses to move the rods, and at 118 % it trips the reactor. Overshoot is real on this plant: 100 MWe of LOAD lands REACTOR POWER near 101 %. Small pulls keep you clear of the stop.

[HIGHLIGHTED: Withdraw, Insert, Turbine Load (pulsing); Tavg (steady)]



8. Take the last stage to full load and settle the temperature on 578 °F.

8a. Hold WITHDRAW at MED about 9 steps, set LOAD to 100 MWe.

Suggested time warp: 1× for the pull; 10× once LOAD is set, while OUTPUT climbs.

()  Load target set to 100 MWe
()  Generator at 100 MWe

8b. Trim AVG COOLANT TEMPERATURE onto 578 °F.

Suggested time warp: 5×.

()  AVG COOLANT TEMPERATURE near 578 °F
()  CONTROL ROD POSITION above 300
()  CONTROL ROD POSITION below 600 (not on its top stop)

Background

A small pull, then the last 10 MWe of LOAD, then the trim. REACTOR POWER settles near 101 %. The control bank ends part-way out, because boron carried most of the reactivity the climb cost.

[HIGHLIGHTED: Withdraw, Turbine Load (pulsing); Tavg (steady)]



9. Confirm full power, with the boron dilution done.

9a. Verify full power: REACTOR POWER 100 %, OUTPUT 100 MWe, AVG COOLANT TEMPERATURE 578 °F, BORON 660 ppm or below.

Note: CONTROL ROD POSITION should be part-way out, not on its stop. BORON is the one to read twice: leave the climb with more of it in the water than the plant wants and AVG COOLANT TEMPERATURE sinks over the following hours, taking PZR LEVEL with it.

Suggested time warp: 1×.

()  REACTOR POWER near 100 %
()  BORON down to its 660 ppm setting
()  AVG COOLANT TEMPERATURE between 563 and 592 °F

Background

Full power, with almost no xenon in the fuel yet. Over the next hours xenon builds, and the plant settles into its long-term full-power state: less boron and the control bank high — 606 of 627 steps, which is where a full-power plant runs. The next step is how you get from here to there.

[HIGHLIGHTED: Reactor Power, Generator Output, Tavg, Boron Concentration (steady)]



10. Start giving back the reactivity xenon takes, rods first.

10a. Hold WITHDRAW at MED for about 6 steps.

Note: Xenon is building, and it will keep pulling AVG COOLANT TEMPERATURE down. Repeat this pull whenever the temperature drops out of its band. Small pulls, then wait for it to settle. ROD LIMIT LO-LO is lit and that is normal — the bank is low because there is no xenon yet, and it clears as you walk the bank up.

Suggested time warp: 1×.

()  CONTROL ROD POSITION above 355
()  Still at full load, 100 MWe
()  AVG COOLANT TEMPERATURE near 580 °F

Background

Xenon is a neutron absorber that builds in the fuel over about two days, takes reactivity away, and the plant answers by making the same power at a lower temperature. Left alone this plant does not just settle cold: measured from here, PZR LEVEL is on its floor in 7 plant-hours and the reactor trips on STEAM GENERATOR LEVEL LO-LO in 17, with REACTOR POWER reading 100 % the whole way down. You give the reactivity back with two levers, rods leading because they are fast and reversible: the bank has about 250 steps to go, worth roughly 56 °F between them, and each ppm of boron about 0.6 °F.

[HIGHLIGHTED: Control Bank (pulsing); Tavg, Control Rod Position (steady)]



11. Give boron its first small dose as xenon builds.

11a. On the BORON card set 650 and press Enter.

Note: One 10 ppm dose, not the whole 43. It takes about ten plant-minutes to arrive and lifts AVG COOLANT TEMPERATURE about 5 °F on the way, to near 587 °F; xenon then takes it back down. Repeat a dose whenever the rods alone stop holding the temperature in its band.

Suggested time warp: 10×. Give the dose ten plant-minutes to arrive before you judge it.

()  BORON coming down off 660 ppm
()  Still at full load, 100 MWe

Background

Rods are fast, but they run out: the bank has about 250 steps left and the xenon still to come costs more than they carry. Boron carries the rest, and it has to go in small doses — dial the whole way in one press and the plant heats far faster than xenon can absorb it, which trips the reactor on overtemperature.

[HIGHLIGHTED: Boron Target (pulsing); Boron Concentration, Tavg (steady)]



12. Hold full power on programme while xenon builds.

12a. Full power and on programme: OUTPUT 100 MWe, AVG COOLANT TEMPERATURE 580 °F, CONTROL ROD POSITION rising.

Note: Keep trimming for the next two plant-days.

Suggested time warp: 1×.

()  Still at full load, 100 MWe

Background

Where this ends up, if you keep at it: CONTROL ROD POSITION about 606 of 627 and BORON about 617 ppm, which is where this plant runs at full power with xenon at equilibrium (the settled point measures 612.3 ppm; 617 is the target you dial toward). Rods carry the first 56 °F; once the bank is near the top it has only about 21 steps of travel left, worth 4.6 °F, and BORON carries the rest — four more doses like the one you just set, 10 ppm at a time, never in one press. Type 617 in one go and the plant heats far faster than xenon can absorb it: measured, that trips the reactor on overtemperature.

[HIGHLIGHTED: Control Rod Position, Boron (steady)]



## Notes — agent record, NOT step text

### Reconcile record — 2026-09-24, `exp/wt-raise` scratch lane (ported to the owner's step format)

*The previous file (the old format: step line = action, lettered lines = check-off labels) is in
git history: `git show HEAD~1:Blueprint/walkthrough_steps/03_raise_power.md`. It had no Notes.*

**Tally.** 12 step lines (count unchanged; no split, no fold), 17 lettered substeps, 33 check-off
lines. Every step number is unchanged, so every `pwr_raise_power:<n>` key in the tests still
names the same step.

**GOAL LINES — AGENT-DRAFTED FOR OWNER REVIEW** (all twelve are new; his old step line is now
each step's `a` action, word for word):

1. Confirm the plant the startup handed over is ready to climb.
2. Make sure the turbine is on line and taking steam.
3. Start the boron dilution that carries most of the climb.
4. Take the first stage to 30 MWe, rods leading and load following.
5. Take the second stage to 50 MWe the same way.
6. Take the third stage to 75 MWe the same way.
7. Take the fourth stage to 90 MWe with a smaller pull.
8. Take the last stage to full load and settle the temperature on 578 °F.
9. Confirm full power, with the boron dilution done.
10. Start giving back the reactivity xenon takes, rods first.
11. Give boron its first small dose as xenon builds.
12. Hold full power on programme while xenon builds.

**How his words were restructured.**
- **Steps 4-8 split his step line at "then trim"**: `a` = "Hold WITHDRAW at MED about N steps,
  set LOAD to M MWe." (his words, his order: rods first, as his Background requires), `b` = "Trim
  AVG COOLANT TEMPERATURE into its band." (his old lettered line). His old lettered list read
  LOAD first and WITHDRAW third — that was the sim's drawing order, copied, and it contradicted
  his step line; the step line wins.
- **Why the pull and the LOAD share one substep.** The pull has no gradeable row of its own: the
  bank enters at 222-238 from the startup leg (INHERITED, its reconcile record), so no fixed
  CONTROL ROD POSITION reads "about 30 steps out" on every route, and the "Reactor following"
  row cannot sit under the pull alone — REACTOR POWER only reaches it once LOAD is in (MEASURED
  below). Three substeps with the power row under the pull would show an unticked pull the
  player might answer by pulling more.
- **Notes moved into the substep they belong to.** Step 4's note: its first sentence (MED) to 4a,
  the rest (the band, the direction, the 590 °F caution) to 4b. Step 7's note: its first sentence
  (the band, the smaller pulls) to 7a, the runback contingency to 7b. Every other step's note is
  its only substep's note. No sentence of his was changed or dropped.
- **Two check-off labels are new** (the `obs` form drew none): 1a "Plant in Mode 1, At Power" and
  12a "Still at full load, 100 MWe" (the same words steps 10 and 11 already use for the same row).
- **Three authored `wait_hint` strings came out of the pool**: step 3's ("The dilution keeps
  working between stages. Start it now.") and step 10's ("Xenon takes about two days to level
  off. Keep the pulls small.") both repeat their substep's note; step 11's moved into 11a's speed
  line. Steps with a `hold` of 180 s or more set `wait_hint: false`, so the app's generated speed
  line does not print a second rung under the substep's own.

**Grading: NO PREDICATE CHANGED.** Every `p`/`op`/`v`/`tol`, every `cmd`, `hold`, `past`,
`hl`/`hl_watch`, `control`/`target`, and the leg's `from`/`precond`/`prereq` are as they were.
What changed is structural only: steps 1 and 12 moved from the `obs` form's single `acc` to a
one-row `accs` (same predicate), and rows became `cont` check-offs of their substep. The stage
steps stay UNORDERED (no `accs_ordered`): the "Reactor following" and "Generator" rows need the
LOAD, and the power row can cross before the generator row (MEASURED, stage 5: power at 203 s,
generator at 252 s), so an ordered step could latch in the wrong order or wait.

**Measured 2026-09-24 on the full stack** (`low_power` IC, the shipped replay for steps 1-3, then
a player driving each stage; seeds 42 and 7; every row read on the TILE's instrument channel —
`instruments.tavg`, `.mwe_output`, `.power_range` — not `paramValue`'s truth):

| stage | pull (MEASURED, glance_rung) | LOAD -> "Generator" row | all rows met | AVG COOLANT TEMPERATURE at step entry | peak after LOAD |
|---|---|---|---|---|---|
| 4 (30 MWe) | 37.4 s at 1×, 7.5 s at 5× | 207-213 s | 225-264 s | 550.2-550.9 °F | 565.7 °F |
| 5 (50 MWe) | 39.9 s / 8.0 s | 211-216 s | 225-262 s | 562.2-564.2 °F | 579.8 °F |
| 6 (75 MWe) | 43.6 s / 8.7 s | 257-267 s | 281-314 s | 576.3-578.8 °F | **591.8 °F** |
| 7 (90 MWe) | 22.3 s / 4.5 s | 124-144 s | 157-159 s | 581.6-584.0 °F | 589.4 °F |
| 8 (100 MWe) | 11.1 s / 2.2 s | 101-110 s | 121-127 s | 581.4-583.6 °F | 586.5 °F |

Routes: rods first (his order) with a crude trim (2-step taps toward the band centre every
60 s), rods first with no trim at all, and LOAD first. **All three complete every stage; none
strands.** The untrimmed route leaves the bank at 351, the same as the replay (INHERITED
figure, re-measured here).

**TWO FINDINGS THIS PORT DID NOT FIX (grading unchanged, by the brief):**
- **Every `b` substep is met at step entry.** The temperature bands are wide (26-33 °F) and the
  previous stage's trim leaves the plant inside the next one (the entry column above). So `b`
  draws ticked before the player trims. The STEP is not hollow — it completes only when every row
  is true together, after LOAD — but the substep's tick is.
- **Stage 6 peaks over his own 590 °F caution on his own order**: 591.2 °F (seed 42, crude
  trim) and 591.8 °F (seed 7, no trim), 589.7 °F on the LOAD-first route. No trip on any route.

**SPEED PROVENANCE.**

| substep | rung | provenance |
|---|---|---|
| 1a, 2a, 3a, 9a, 12a | 1× | instant press or read (the rule: instant presses are 1×); 2a is a pick for the rare tripped-turbine route, where OUTPUT returns about 240 s after LATCH (INHERITED, #664) |
| 4a-8a | 1×, then 10× in `speed_text` | 1× MEASURED: at MED one rod step is 1.25 s of wall clock at 1× and 0.25 s at 5× (glance_rung), so only 1× leaves ~5 s to stop inside "about N steps". 10× CARRIED OVER: the 30 s rule on the steps' `hold: 480` gave 10×, and OUTPUT takes 101-267 plant-seconds after LOAD (MEASURED above) |
| 4b-8b | 5× | a PICK: a trim tap is one step at any rung, and a held INSERT (7b) runs 4 steps a wall-second at 5×, 8 at 10× |
| 10a | 1× | MEASURED: the 6-step pull is 7.3 s at 1× and 1.5 s at 5× (glance_rung). The old `hold: 3600` put the step on a 600× WARP rung by the 30 s rule; that line is now suppressed |
| 11a | 10× | CARRIED OVER (30 s rule on `hold: 600`) and MEASURED: worst true REACTOR POWER change in one 2.5 s glance 0.359 % at 10× (glance_rung) |

**Not verified.** No layman or browser playthrough of this leg in the new format. `glance_rung`
traces only a step's own `cmd` (the rod pull) and never issues the LOAD, so its power columns for
steps 4-8 are a rods-only plant and were not used. The 5× trim rung is a pick, not measured
against a player's trim. The tripped-turbine route through 2a was not re-run.
