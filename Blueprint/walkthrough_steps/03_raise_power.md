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

1a. Verify Mode 1, At Power: REACTOR POWER 10 %, SG FEED AUTO, both startup trips reading BLOCKED on TRIP BLOCKS.

Note: The two rows are IR HIGH FLUX and PR HIGH (LOW SETPT), both blocked by the startup walkthrough.

Suggested time warp: 1×.

()  Plant in Mode 1, At Power

Background

This is the plant the startup hands over: critical, on the grid, feed holding level. Both startup shutdowns have to be switched off. With them on, the climb trips at 25 %, then 35 %.

[HIGHLIGHTED: Reactor Power, SG Feed AUTO, Trip Blocks (steady)]



2. Make sure the turbine is on line and taking steam.

2a. Check the TURBINE-GENERATOR card is on line: LATCH lit and OUTPUT above 8 MW.

Note: If it reads TRIP, press LATCH; OUTPUT returns to the LOAD you last set. If OUTPUT stays at 0.0 MW, set LOAD to 10 MW. LATCH is refused while whatever tripped the turbine is still there, and the card names the reason.

Suggested time warp: 1×.

()  Turbine latched, TRIP not lit
()  Generator above 8 MW

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



4. Take the first stage to 30 MWe, load leading and rods following.

4a. Set LOAD to 30 MW.

Suggested time warp: 1×.

()  Load target set to 30 MW
()  Generator at 30 MW
()  Reactor following, near 30 %

4b. Hold WITHDRAW at MED about 20 steps to bring AVG COOLANT TEMPERATURE back into its band.

Note: MED is the middle rod speed on the ROD CONTROL card, 48 steps a minute. The green band on the tile is the temperature the plant is meant to hold at the power it is making, near 556 °F here. It rises with load, from 547 °F at no load to 578 °F at 100 %. Temperature below the band: withdraw. Above: insert. The plant trips on temperature before it trips on power: keep AVG COOLANT TEMPERATURE under 590 °F on every stage.

Suggested time warp: 1× for the pull; 10× once it is done, while OUTPUT and the temperature settle.

()  AVG COOLANT TEMPERATURE between 550 and 576 °F (the band is near 556)

Background

Raising LOAD draws more steam and cools the water; colder water adds reactivity, so REACTOR POWER follows the turbine up by itself, but the temperature sags on the way. Pulling rods then warms the water back up into its band. Doing it in that order, the rods answer what the temperature gauge shows instead of guessing ahead of the turbine.

[HIGHLIGHTED: Withdraw, Rod Speed — Normal, Turbine Load (pulsing); Tavg (steady)]



5. Take the second stage to 50 MWe the same way.

5a. Set LOAD to 50 MW.

Suggested time warp: 1×.

()  Load target set to 50 MW
()  Generator at 50 MW
()  Reactor following, near 50 %

5b. Hold WITHDRAW at MED about 20 steps to bring AVG COOLANT TEMPERATURE back into its band.

Note: The band is near 562 °F at this load.

Suggested time warp: 1× for the pull; 10× once it is done, while OUTPUT and the temperature settle.

()  AVG COOLANT TEMPERATURE between 550 and 583 °F (the band is near 562)

Background

Same order as the last stage: LOAD, then rods. Halfway up, xenon is starting to build in the fuel. Boron takes care of that over the coming hours; rods take care of the next few minutes.

[HIGHLIGHTED: Withdraw, Turbine Load (pulsing); Tavg (steady)]



6. Take the third stage to 75 MWe the same way.

6a. Set LOAD to 75 MW.

Suggested time warp: 1×.

()  Load target set to 75 MW
()  Generator at 75 MW
()  Reactor following, near 75 %

6b. Hold WITHDRAW at MED about 35 steps to bring AVG COOLANT TEMPERATURE back into its band.

Note: The band is near 570 °F at this load.

Suggested time warp: 1× for the pull; 10× once it is done, while OUTPUT and the temperature settle.

()  AVG COOLANT TEMPERATURE between 558 and 585 °F (the band is near 570)

Background

Three-quarter power. The band has climbed with the load, toward 578 °F at 100 %. If the temperature is still below the band once the pull is done, the pull was short: withdraw a few more steps before you add more megawatts.

[HIGHLIGHTED: Withdraw, Turbine Load (pulsing); Tavg (steady)]



7. Take the fourth stage to 90 MWe with a smaller pull.

7a. Set LOAD to 90 MW.

Suggested time warp: 1×.

()  Load target set to 90 MW
()  Generator at 90 MW

7b. Hold WITHDRAW at MED about 25 steps to bring AVG COOLANT TEMPERATURE back into its band.

Note: The band is near 575 °F at this load, and the pulls get smaller from here: above 103 % power the plant stops the rods. If LOAD changes by itself, the plant ran the turbine back because the coolant was too hot. Hold INSERT until AVG COOLANT TEMPERATURE is back in its band, then set LOAD again.

Suggested time warp: 1× for the pull; 10× once it is done, while OUTPUT and the temperature settle.

()  AVG COOLANT TEMPERATURE between 564 and 585 °F (the band is near 575)

Background

Above 103 % power the plant refuses to move the rods, and at 118 % it trips the reactor. Overshoot is real on this plant: 100 MWe of LOAD lands REACTOR POWER near 101 %. Small pulls keep you clear of the stop.

[HIGHLIGHTED: Withdraw, Insert, Turbine Load (pulsing); Tavg (steady)]



8. Take the last stage to full load and settle the temperature on 578 °F.

8a. Set LOAD to 100 MW.

Suggested time warp: 1×.

()  Load target set to 100 MW
()  Generator at 100 MW

8b. Hold WITHDRAW at MED about 20 steps to settle AVG COOLANT TEMPERATURE on 578 °F.

Suggested time warp: 1× for the pull; 10× once it is done, while OUTPUT and the temperature settle.

()  AVG COOLANT TEMPERATURE near 578 °F
()  CONTROL ROD POSITION above 300
()  CONTROL ROD POSITION below 600 (not on its top stop)

Background

The last 10 MWe of LOAD, then a smaller pull to bring the temperature back up. REACTOR POWER settles near 101 %. The control bank ends part-way out, because boron carried most of the reactivity the climb cost.

[HIGHLIGHTED: Withdraw, Turbine Load (pulsing); Tavg (steady)]



9. Confirm full power, with the boron dilution done.

9a. Verify full power: REACTOR POWER 100 %, OUTPUT 100 MW, AVG COOLANT TEMPERATURE 578 °F, BORON 660 ppm or below.

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

()  CONTROL ROD POSITION above 351
()  Still at full load, 100 MW
()  AVG COOLANT TEMPERATURE near 580 °F

Background

Xenon is a neutron absorber that builds in the fuel over about two days, takes reactivity away, and the plant answers by making the same power at a lower temperature. Left alone this plant does not just settle cold: measured from here, PZR LEVEL is on its floor in 7 plant-hours and the reactor trips on STEAM GENERATOR LEVEL LO-LO in 17, with REACTOR POWER reading 100 % the whole way down. You give the reactivity back with two levers, rods leading because they are fast and reversible: the bank has about 250 steps to go, worth roughly 56 °F between them, and each ppm of boron about 0.6 °F.

[HIGHLIGHTED: Control Bank (pulsing); Tavg, Control Rod Position (steady)]



11. Give boron its first small dose as xenon builds.

11a. On the BORON card set 650 and press Enter.

Note: One 10 ppm dose, not the whole 43. It takes about ten plant-minutes to arrive and lifts AVG COOLANT TEMPERATURE about 5 °F on the way, to near 587 °F; xenon then takes it back down. Repeat a dose whenever the rods alone stop holding the temperature in its band.

Suggested time warp: 10×. Give the dose ten plant-minutes to arrive before you judge it.

()  BORON coming down off 660 ppm
()  Still at full load, 100 MW

Background

Rods are fast, but they run out: the bank has about 250 steps left and the xenon still to come costs more than they carry. Boron carries the rest, and it has to go in small doses — dial the whole way in one press and the plant heats far faster than xenon can absorb it, which trips the reactor on overtemperature.

[HIGHLIGHTED: Boron Target (pulsing); Boron Concentration, Tavg (steady)]



12. Hold full power on programme while xenon builds.

12a. Full power and on programme: OUTPUT 100 MW, AVG COOLANT TEMPERATURE 580 °F, CONTROL ROD POSITION rising.

Note: Keep trimming for the next two plant-days.

Suggested time warp: 1×.

()  Still at full load, 100 MW

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

### Reconcile record — 2026-09-24 (b), load first

**Rulings.** *(OWNER RULING 2026-09-24, option selection, "Load first"; option text not
verbatim)*: "Rewrite steps 4–8: set LOAD, then withdraw rods to bring AVG COOLANT TEMPERATURE back
to program. This matches the sourced procedure and gives a lower peak (589.7 °F)." **"Relax the
caution"** for the "keep under 590 °F" caution (4b's note). Two more selections recorded here,
no text change: **"Accept all"** (the suggested time warps) and **"Accept as drafted"** (the goal
lines). The goal-line rewrite this ruling forces on steps 4-8 supersedes "Accept as drafted" for
those lines only.

**Source.** NRC Westinghouse Technology Systems Manual Section 19.0 Plant Operations, ADAMS
ML11223A342, Appendix 19-1 "Plant Startup from Cold Shutdown", step 22: "Increase generator load
at the desired rate while maintaining Tavg with manual rod control."

**Every rewritten line (old → new).**
- purpose: "Rods lead, turbine follows: pull rods, raise LOAD to match, then trim AVG COOLANT
  TEMPERATURE back into its band." → "The turbine leads, rods follow: raise LOAD, then withdraw
  rods to bring AVG COOLANT TEMPERATURE back into its band."
- 4 goal: "…rods leading and load following." → "…load leading and rods following."
- 4a–8a: "Hold WITHDRAW at MED about N steps, set LOAD to M MWe." → "Set LOAD to M MWe."
  (30 / 50 / 75 / 90 / 100 MWe; the load, generator and power check-offs stay under `a`).
- 4b–7b: "Trim AVG COOLANT TEMPERATURE into its band." → "Hold WITHDRAW at MED about K steps to
  bring AVG COOLANT TEMPERATURE back into its band." K = 20 / 20 / 35 / 25 (the pull was 30 / 32
  / 35 / 18).
- 8b: "Trim AVG COOLANT TEMPERATURE onto 578 °F." → "Hold WITHDRAW at MED about 20 steps to
  settle AVG COOLANT TEMPERATURE on 578 °F." (the pull was about 9).
- 4a's note "MED is the middle rod speed…" moved to the front of 4b's note (it is about the pull).
  7a's note "The band is near 575 °F… stops the rods." moved to the front of 7b's note.
- Suggested time warp: every `a` is now 1× (an instant press); every `b` is "1× for the pull; 10×
  once it is done, while OUTPUT and the temperature settle." (was: `a` 1× then 10×, `b` 5×).
- 4 Background: "Pulling rods first raises power and warms the water; raising LOAD then draws
  more steam and cools it back. Doing it in that order means the temperature is approached from
  above rather than dragged from below." → "Raising LOAD draws more steam and cools the water;
  colder water adds reactivity, so REACTOR POWER follows the turbine up by itself, but the
  temperature sags on the way. Pulling rods then warms the water back up into its band. Doing it
  in that order, the rods answer what the temperature gauge shows instead of guessing ahead of the
  turbine."
- 5 Background: "Same order as the last stage: rods, then LOAD, then trim." → "Same order as the
  last stage: LOAD, then rods."
- 6 Background: "If the temperature reads below the band, you led with LOAD instead of rods: pull
  more steps before you add more megawatts." → "If the temperature is still below the band once
  the pull is done, the pull was short: withdraw a few more steps before you add more megawatts."
- 8 Background: "A small pull, then the last 10 MWe of LOAD, then the trim." → "The last 10 MWe
  of LOAD, then a smaller pull to bring the temperature back up."
- 10's first check-off: "CONTROL ROD POSITION above 355" → "above 351" (see Grading).
- Outside this file, word for word in both places: `02_mode3_to_mode1.md` step 17's Background
  and the pool's `pwr_startup` last step, "From here the climb to full power is rods leading and
  the turbine following." → "…is the turbine leading and the rods following."

**Kept, still true under load first:** the 5-8 goal lines (7's "smaller pull": 25 after 35), 6's
first two sentences, 7's whole Background and runback note, 8's last two sentences.

**The caution stays at 590 °F.** Relaxed by ruling; the measurement does not need a higher
number. No load-first route comes within 7 °F of it: player 579.6 °F, the card's literal counts
582.6 °F (table). The 589.7 °F in the ruling's option text was the previous record's load-first
route, on the old pull counts.

**Grading.** Row order and every predicate unchanged (accs[3] is still the temperature row).
- **Steps 4-8 are now `accs_ordered`.** The temperature row can tick only once LOAD, OUTPUT and
  REACTOR POWER are in. Before, it was met at entry on every stage, so `b` drew ticked before the
  player pulled (the previous record's finding). Now it is met at entry on no stage, both routes,
  both seeds, and every row is met at the same second as on the unordered run.
- **Step 10: `> 355` → `> 351`.** The replay's climb now arrives at 347, where 10a's 6-step pull
  reaches 353 and the step stranded on every route of `run_walkthrough_routes` (180 plant-min,
  bank 353). 351 is arrival + 4, the rule the old bound was set by. A player's own climb arrives
  at 348 / 352; from 352 the row is met at entry and the step still waits on its temperature row.
- **"Reactor following" can be met with no pull at all.** LOAD alone: REACTOR POWER 32.1 % at
  stage 4 and 51.5 % at stage 5, the temperature falling 549.7 → 544.2 °F and 549.4 → 541.8 °F.
  A player who never pulls finishes stage 4 by 0.1 °F over its 549.5 °F floor and is held at
  stage 5 with every row but the temperature ticked. That is what `b` grades now.
- **The replay:** the step `cmd` is the LOAD; the pull is `replay_then` on accs[0], one tick
  later (`test/procedures_harness.js` now reads a cmd row as met once issued; before, only a
  bagged row could name the milestone).

**Measured 2026-09-24 (b)**, full stack, `low_power`, live checklist, TILE channels, seeds 42 / 7
(`inbox/rp_load/measure.js`, local). PLAYER = LOAD, then WITHDRAW at MED while the tile reads more
than 0.5 °F under its band centre. CARD = LOAD and the card's K in one go (what the replay and
the route gate do).

| stage | route | rod steps | AVG COOLANT TEMP at entry | trough after LOAD | peak | every row met |
|---|---|---|---|---|---|---|
| 4 (30 MWe) | player | 22 / 21 | 549.7 / 549.4 °F | 549.3 / 549.4 °F | 558.0 / 557.8 °F | 227 / 231 s |
| | card (20) | 20 | 549.7 / 549.4 | 549.3 / 549.4 | 558.9 / 558.8 | 231 / 231 s |
| 5 (50 MWe) | player | 20 / 17 | 557.9 / 555.9 | 556.9 / 556.1 | 563.0 / 563.5 | 234 / 232 s |
| | card (20) | 20 | 556.7 / 556.7 | 556.4 / 556.6 | 568.0 / 568.1 | 230 / 232 s |
| 6 (75 MWe) | player | 35 / 38 | 563.0 / 562.5 | 563.1 / 562.2 | 572.0 / 571.9 | 290 / 288 s |
| | card (35) | 35 | 564.4 / 564.4 | 563.9 / 564.0 | 581.7 / 581.5 | 290 / 288 s |
| 7 (90 MWe) | player | 26 / 28 | 571.0 / 571.2 | 570.6 / 570.4 | 575.9 / 576.0 | 159 / 163 s |
| | card (25) | 25 | 571.9 / 572.3 | 570.8 / 570.1 | 580.8 / 580.5 | 163 / 163 s |
| 8 (100 MWe) | player | 18 / 21 | 575.4 / 576.1 | 575.6 / 575.7 | 579.3 / 579.6 | 130 / 126 s |
| | card (20) | 20 | 577.3 / 576.0 | 575.5 / 575.6 | 582.6 / 582.4 | 129 / 124 s |

"About K steps" is the player's count rounded. Bank at the end of stage 8: player 348 / 352, card
347. The pull at MED is 1.25 s a step of wall clock at 1× (the previous record's glance_rung
figure), so 20 steps is about 25 s and 35 about 44 s — DERIVED, not re-measured.

**For comparison, same harness, seed 42:** the OLD authored route (rods 30/32/35/18/9 and LOAD in
the same tick) peaks 590.3 °F at stage 6; rods FIRST, LOAD once the bank stops, peaks 579.9 °F
there. So the lower peak comes from pulling to what the gauge shows, not from the order alone: the
card's literal 35 steps after LOAD peaks 581.7 °F, higher than rods-first with the same 35.

**Not verified.** No layman or browser playthrough. `b`'s 1× / 10× rung is carried from the old
`a` line, not re-run through glance_rung. The player model chases the tile band centre with
1-step MED taps; a player who holds WITHDRAW for the stated count is the "card" row. "About 1
plant-hour" in the purpose was not re-measured. The tripped-turbine route through step 2 was not
re-run. `Manuals/01` still reads "Rule of thumb: Rods lead up; turbine leads down." — not edited
here (it goes through the manual revision process).

### Reconcile record — 2026-09-25, workbench lane (cross-leg review, no ruling needed)

- Board words, extending the 2026-09-24 startup ruling ("use the board's"): check-off, precondition
  and prerequisite strings say "MW" (the OUTPUT tile and LOAD box print MW), and the trip-block rows
  "read BLOCKED" (the panel button's word). Goal lines, Background and `target` keep "MWe".
- Step 10 `target` "coming up off 351" → "off 347", and the pool `outcome` "about 357 of 627" →
  "about 353". MEASURED 2026-09-25, `run_walkthrough_routes --leg=pwr_raise_power --route=typical`:
  bank 347 at step 9, 353 after step 10's 6-step pull, 353 at the leg's end (26.8 plant-min). 351
  stays as step 10's graded floor (arrival + 4, record (b)).
