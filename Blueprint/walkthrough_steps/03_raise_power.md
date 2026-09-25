# Raise power

**Walkthrough id: `pwr_raise_power`  ·  12 steps**

> This is the LIVE step file: the sim's `pwr_raise_power` walkthrough was brought down to it on
> 2026-09-24 (the owner, after the Mode 3 to Mode 1 leg was ported: "Adopt the format for the
> other walkthroughs."). Edit it freely — it is the step text, and it is what the sim is brought
> down to.
>
> **The format** (the what / why / how shape, ruled 2026-09-24 and quoted verbatim in
> `02_mode3_to_mode1.md` record (h)). Line one of a step is WHAT it accomplishes; under it, one italic line says WHY.
> Each substep is HOW: it opens with a verb and is its own check-off, drawn `()`. The suggested
> time warp is given once per step, or per substep where they differ; a Note follows what it
> explains; Background closes the step. Agent notes go at the END of the file, never between the
> steps. **Phase 1**: this file is restyled, the sim's pool is not yet (2026-09-25 reword record).

---

1. Confirm the plant the startup handed over is ready to climb.

*The climb starts from the plant the startup left: critical, on the grid, with its startup trips switched off.*

()1a. Check REACTOR POWER reads about 10 % and the plant is in Mode 1, At Power.

()1b. Check SG FEED AUTO is lit.

()1c. Check IR HIGH FLUX and PR HIGH (LOW SETPT) both read BLOCKED on TRIP BLOCKS.

Suggested time warp: 1×.

Note: Both rows were blocked by the startup walkthrough.



Background

This is the plant the startup hands over: critical, on the grid, feed holding level. Both startup shutdowns have to be switched off. With them on, the climb trips at 25 %, then 35 %.

[HIGHLIGHTED: Reactor Power, SG Feed AUTO, Trip Blocks (steady)]



2. Make sure the turbine is on line and taking steam.

*Raising LOAD does nothing until the turbine is taking steam.*

()2a. Check the TURBINE-GENERATOR card shows LATCH lit and TRIP not lit. If it reads TRIP, press LATCH.

()2b. Check OUTPUT reads above 8 MW. If it stays at 0.0 MW, set LOAD to 10 MW.

Suggested time warp: 1×.

Note: After LATCH, OUTPUT returns to the LOAD you last set. LATCH is refused while whatever tripped the turbine is still there, and the card names the reason.



Background

A tripped turbine takes no steam, so LOAD does nothing and the heat you make goes to the steam dumps instead. The plant trips the reactor on a tripped turbine the moment REACTOR POWER passes 50 %, and at 8 % if the condenser is gone as well.

[HIGHLIGHTED: Turbine Load (pulsing); Generator Output (steady)]



3. Start the boron dilution that carries most of the climb.

*Boron pays for most of the reactivity the climb costs, and it takes about 25 plant-minutes to arrive, so it starts first.*

()3a. Check BORON ON is lit. If it is not, press ON.

()3b. Set the BORON target to 660 ppm and press Enter.

Suggested time warp: 1×.

Note: The dilution then runs in the background while you take the first stages. BORON starts near 719, so the move is 59 ppm, and the last of it is still arriving at full power, about 25 plant-minutes after you set it.



Background

Every percent of power costs reactivity: the fuel heats up and the water thins out. Rods could pay for all of it but would end up deep in the core, so real plants dilute boron for the bulk and use rods for the fine trim. Dilution is not instant and it slows as it closes on the number you typed: this 59 ppm move takes about 25 plant-minutes, and a 10 ppm trim later takes about ten.

[HIGHLIGHTED: Boron Target (pulsing); Boron Status, Boron Concentration (steady)]



4. Take the first stage to 30 MWe, load leading and rods following.

*The turbine asks for the power first; the rods then bring the temperature back to where it belongs at that load.*

()4a. Set LOAD to 30 MW.

Suggested time warp: 1×.

()4b. Hold WITHDRAW at MED until AVG COOLANT TEMPERATURE is back in its band, 550 to 576 °F, about 20 steps.

Suggested time warp: 1×.

Note: MED is the middle rod speed on the ROD CONTROL card, 48 steps a minute. The green band on the tile is the temperature the plant is meant to hold at the power it is making, near 556 °F here. It rises with load, from 547 °F at no load to 578 °F at 100 %. Temperature below the band: withdraw. Above: insert. Read the gauge, not the count: while the boron dilution is still running it does part of the work, and the pull comes out shorter. The plant trips on temperature before it trips on power: keep AVG COOLANT TEMPERATURE under 590 °F on every stage.

()4c. Check OUTPUT reads 30 MW and REACTOR POWER is near 30 %.

Suggested time warp: 10×, while OUTPUT and the temperature settle.



Background

Raising LOAD draws more steam and cools the water; colder water adds reactivity, so REACTOR POWER follows the turbine up by itself, but the temperature sags on the way. Pulling rods then warms the water back up into its band. Doing it in that order, the rods answer what the temperature gauge shows instead of guessing ahead of the turbine.

[HIGHLIGHTED: Withdraw, Rod Speed — Normal, Turbine Load (pulsing); Tavg (steady)]



5. Take the second stage to 50 MWe the same way.

*Same order as the first stage: the turbine leads, the rods follow.*

()5a. Set LOAD to 50 MW.

Suggested time warp: 1×.

()5b. Hold WITHDRAW at MED until AVG COOLANT TEMPERATURE is back in its band, 550 to 583 °F, about 15 steps.

Suggested time warp: 1×.

Note: The band is near 562 °F at this load.

()5c. Check OUTPUT reads 50 MW and REACTOR POWER is near 50 %.

Suggested time warp: 10×, while OUTPUT and the temperature settle.



Background

Same order as the last stage: LOAD, then rods. Halfway up, xenon is starting to build in the fuel. Boron takes care of that over the coming hours; rods take care of the next few minutes.

[HIGHLIGHTED: Withdraw, Turbine Load (pulsing); Tavg (steady)]



6. Take the third stage to 75 MWe the same way.

*The band keeps climbing with the load, so each pull aims a little higher.*

()6a. Set LOAD to 75 MW.

Suggested time warp: 1×.

()6b. Hold WITHDRAW at MED until AVG COOLANT TEMPERATURE is back in its band, 558 to 585 °F, about 25 steps.

Suggested time warp: 1×.

Note: The band is near 570 °F at this load.

()6c. Check OUTPUT reads 75 MW and REACTOR POWER is near 75 %.

Suggested time warp: 10×, while OUTPUT and the temperature settle.



Background

Three-quarter power. The band has climbed with the load, toward 578 °F at 100 %. If the temperature is still below the band once the pull is done, the pull was short: withdraw a few more steps before you add more megawatts.

[HIGHLIGHTED: Withdraw, Turbine Load (pulsing); Tavg (steady)]



7. Take the fourth stage to 90 MWe with a smaller pull.

*Near full power the 103 % rod stop is close, so the pulls get smaller.*

()7a. Set LOAD to 90 MW.

Suggested time warp: 1×.

()7b. Hold WITHDRAW at MED until AVG COOLANT TEMPERATURE is back in its band, 564 to 585 °F, about 20 steps.

Suggested time warp: 1×.

Note: The band is near 575 °F at this load, and the pulls get smaller from here: above 103 % power the plant stops the rods. If LOAD changes by itself, the plant ran the turbine back because the coolant was too hot. Hold INSERT until AVG COOLANT TEMPERATURE is back in its band, then set LOAD again.

()7c. Check OUTPUT reads 90 MW.

Suggested time warp: 10×, while OUTPUT and the temperature settle.



Background

Above 103 % power the plant refuses to move the rods, and at 118 % it trips the reactor. Overshoot is real on this plant: 100 MWe of LOAD lands REACTOR POWER near 101 %. Small pulls keep you clear of the stop.

[HIGHLIGHTED: Withdraw, Insert, Turbine Load (pulsing); Tavg (steady)]



8. Take the last stage to full load and settle the temperature on 578 °F.

*578 °F is the temperature this plant is meant to hold at full power.*

()8a. Set LOAD to 100 MW.

Suggested time warp: 1×.

()8b. Hold WITHDRAW at MED until AVG COOLANT TEMPERATURE settles on 578 °F, about 10 steps.

Suggested time warp: 1×.

Note: Above 103 % REACTOR POWER the plant stops rod withdrawal, and the step to 100 MW can carry power past it: if CONTROL ROD POSITION stops moving while you hold WITHDRAW, let go, wait for REACTOR POWER to settle back under 103 %, then pull again.

()8c. Check OUTPUT reads 100 MW.

()8d. Check CONTROL ROD POSITION reads below 600, not on its top stop.

Suggested time warp: 10×, while OUTPUT and the temperature settle.



Background

The last 10 MWe of LOAD, then a smaller pull to bring the temperature back up. REACTOR POWER settles near 101 %. The control bank ends part-way out, because boron carried most of the reactivity the climb cost.

[HIGHLIGHTED: Withdraw, Turbine Load (pulsing); Tavg (steady)]



9. Confirm full power, with the boron dilution done.

*The climb is not finished until the boron dilution has fully arrived.*

()9a. Check REACTOR POWER reads about 100 % and OUTPUT 100 MW.

()9b. Check BORON reads 660 ppm or below.

()9c. Hold INSERT a few steps whenever AVG COOLANT TEMPERATURE rises above its band, until it holds between 563 and 592 °F.

Suggested time warp: 1×.

Note: CONTROL ROD POSITION should be part-way out, not on its stop. The last of the dilution is still arriving here: AVG COOLANT TEMPERATURE climbs while it does, so hold INSERT a few steps whenever it rises above its band. BORON is the one to read twice: leave the climb with more of it in the water than the plant wants and AVG COOLANT TEMPERATURE sinks over the following hours, taking PZR LEVEL with it.



Background

Full power, with almost no xenon in the fuel yet. Over the next hours xenon builds, and the plant settles into its long-term full-power state: less boron and the control bank high — 606 of 627 steps, which is where a full-power plant runs. The next step is how you get from here to there.

[HIGHLIGHTED: Reactor Power, Generator Output, Tavg, Boron Concentration (steady)]



10. Start giving back the reactivity xenon takes, rods first.

*Xenon takes reactivity away for about two days; rods give it back first because they are fast and reversible.*

()10a. Hold WITHDRAW at MED for about 6 steps.

()10b. Check OUTPUT still reads 100 MW and AVG COOLANT TEMPERATURE is near 580 °F.

Suggested time warp: 1×.

Note: Xenon is building, and it will keep pulling AVG COOLANT TEMPERATURE down. Repeat this pull whenever the temperature drops out of its band. Small pulls, then wait for it to settle. The Control Rods — Insertion Limit alarm (ROD LIMIT LO-LO) is up and that is normal — the bank is low because there is no xenon yet, and it clears as you walk the bank up.



Background

Xenon is a neutron absorber that builds in the fuel over about two days, takes reactivity away, and the plant answers by making the same power at a lower temperature. Left alone this plant does not just settle cold: measured from here, PZR LEVEL is on its floor in 7 plant-hours and the reactor trips on STEAM GENERATOR LEVEL LO-LO in 17, with REACTOR POWER reading 100 % the whole way down. You give the reactivity back with two levers, rods leading because they are fast and reversible: the bank has about 290 steps to go, worth roughly 110 °F between them, and each ppm of boron about 0.6 °F.

[HIGHLIGHTED: Control Bank (pulsing); Tavg, Control Rod Position (steady)]



11. Give boron its first small dose as xenon builds.

*Rods alone cannot carry all of the xenon still to come, so boron takes the rest, a small dose at a time.*

()11a. Set the BORON target to 650 ppm and press Enter.

()11b. Check OUTPUT still reads 100 MW.

Suggested time warp: 10×. Give the dose ten plant-minutes to arrive before you judge it.

Note: One 10 ppm dose, not the whole 43 ppm still to come (660 down to 617). It takes about ten plant-minutes to arrive and lifts AVG COOLANT TEMPERATURE about 5 °F on the way, to near 590 °F; xenon takes hours to take it back. Repeat a dose whenever the rods alone stop holding the temperature in its band.



Background

Rods are fast, but they run out: the bank has about 290 steps left and the xenon still to come costs more than they carry. Boron carries the rest, and it has to go in small doses — dial the whole way in one press and the plant heats far faster than xenon can absorb it, which trips the reactor on overtemperature.

[HIGHLIGHTED: Boron Target (pulsing); Boron Concentration, Tavg (steady)]



12. Hold full power on programme while xenon builds.

*Xenon keeps building for two plant-days, so full power is held by hand until it levels off.*

()12a. Check OUTPUT still reads 100 MW.

()12b. Check AVG COOLANT TEMPERATURE reads about 580 °F and CONTROL ROD POSITION is rising.

Suggested time warp: 1×.

Note: Keep trimming for the next two plant-days.



Background

Where this ends up, if you keep at it: CONTROL ROD POSITION about 606 of 627 and BORON about 617 ppm, which is where this plant runs at full power with xenon at equilibrium (the settled point measures 612.3 ppm; 617 is the target you dial toward). Rods carry the first 110 °F or so; once the bank is near the top it has only about 21 steps of travel left, worth 4.6 °F, and BORON carries the rest — four more doses like the one you just set, 10 ppm at a time, never in one press. Type 617 in one go and the plant heats far faster than xenon can absorb it: measured, that trips the reactor on overtemperature.

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

### Reconcile record — 2026-09-25, `exp/v5-ct` scratch lane (layman pass 4, the chained plant)

**AGENT-DRAFTED FOR OWNER REVIEW — every line below changed his text or his grading.** Measured with
`run_walkthrough_routes` (live checklist, full stack, seed 42): the preset route (`low_power`) and
the new **chain** route (all six legs on one plant, the way "Next ▸" hands it over).

- **Why the chain differs.** The preset carries 10 %-power xenon; the startup hands over a
  xenon-free plant at 718.7 ppm, so step 3's move is 59 ppm, not 24, and BORON reaches 660 about
  33 plant-min after it is set (659.8 ppm at +15 min into step 10, measured). Step 3a's note
  now says so.
- **4b–8b: "Hold WITHDRAW at MED until AVG COOLANT TEMPERATURE is back in its band, about N
  steps."** (was "Hold WITHDRAW at MED about N steps to bring …"). 4b's note adds "Read the gauge,
  not the count…". The OLD card's fixed counts on the chain trip the reactor on
  overtemperature-delta-T at step 9, 45.2 plant-min (injection `chain_count_pulls`). A gauge-follower
  nets 21 / 16 / 25 / 22 / 12 steps on the chain and 23 / 12 / 37 / 28 / 19 on the preset.
- **Step 8: the "CONTROL ROD POSITION above 300" check-off is gone**, and 8b gains a note on the
  103 % rod stop (engines/pwr2/pwr2_protection.js, power range high flux rod stop, "power range
  power > 103%", ML11223A252). The bank reached 318 (chain) and 346 (preset) on the gauge route,
  so the row did not strand there; it stranded the reviewer at 299 after his own 3-step pull at
  stage 6. With the temperature row and a fixed boron, it adds nothing but a route.
- **Step 9: BORON row `< 680` → `< 663`** (label unchanged, "down to its 660 ppm setting"), and 9a's
  note adds "Come from the startup walkthrough … hold INSERT a few steps whenever it rises above
  its band." Chain: 9.0 plant-min in the step, 12 steps inserted, Tavg 578.0–581.1 °F. Preset: 0.1
  min, nothing to insert.
- **Step 10: "CONTROL ROD POSITION above 351" → a command check-off, "Rods withdrawn a few steps"**
  (any control-rod press ticks it, INSERT included: the runtime matches the rod family, not the
  direction). Target "coming up off 347" → "coming up". The old row on the chain strands at the
  3-hour bound (injection `chain_step10_bank`); the reviewer needed 16 pulls over about 5
  plant-hours. "ROD LIMIT LO-LO is lit" → "The Control Rods — Insertion Limit alarm (ROD LIMIT
  LO-LO) is up" (the Learning and Industry labels in `layers/control/pwr_control.js`).
- **Step 11:** "not the whole 43" → "not the whole 43 ppm still to come (660 down to 617)".

**Not fixed, needs a ruling (the chain seam).** Steps 10–11 pull 6 steps and dose 10 ppm on a
xenon-free chained plant that is already on its band: the leg ends at 589.7 °F (preset: 583.4 °F),
and lowering power from there peaks at 600.3 °F. Either the preset is rebuilt xenon-free (engine
initial condition) so this leg's numbers are measured on the plant the startup hands over, or steps
10–11 become conditional on the temperature being below the band.

**Not verified.** No browser or layman re-run of this text. Seed 42 only for the chain.

### Reword and re-measure record — 2026-09-25, `exp/w6-raise` scratch lane

**Two OWNER RULINGS, 2026-09-24, option selections (option text, not verbatim — Hard Rule 11):**
**"Rebuild the preset"** ("Make the low-power starting condition match what the startup walkthrough
actually hands over (no xenon), and re-measure raise power's numbers.") and **"Yes, all five"**
(restyle this file into the what / why / how shape of `02_mode3_to_mode1.md` record (h)).

**A. The preset.** `low_power` (`engines/pwr2/pwr2_engine.js`) now seeds iodine and xenon at zero
and the bank at 222. MEASURED at the start of this leg on the chained route (heatup, then startup,
one service, seed 42): xenon 0.008 % of full-power equilibrium, bank 222, 718.7 ppm, 10.0 MWe,
Tavg 547.6 °F and still rising (STARTUP RATE +0.05 DPM). The rebuilt preset boots 718.5 ppm at
the programme Tavg, 550.3 °F, and holds 550.5 → 550.0 °F over its first hour. Before: 17.2 %
xenon, bank 227, 683.8 ppm.

**Numbers, re-measured** (`run_walkthrough_routes`, live checklist, full stack, seed 42; preset
route vs chain route; the two now agree):

| | before (preset / chain) | after (preset / chain) |
|---|---|---|
| step 3 move | 24 / 59 ppm | **59 / 59 ppm** |
| 719 → 660 ppm arrives | — | 663 ppm at 24.1 plant-min, 660.5 at 25.2 (preset, dilution alone) |
| gauge-route net pull, stages 4–8 | 23/12/37/28/19 (old record) / 21/16/25/22/12 | **23/12/24/22/12 / 21/16/25/22/12** |
| step 9 time, rods inserted | 0.1 min, 0 / 9.0 min, 12 | **8.1 min, 9 / 9.0 min, 12** |
| bank after step 9 / after step 10 / leg end | 346 / 357 / 358 · 306 / 315 / 318 | **306 / 316 / 318 · 306 / 315 / 318** |
| leg end Tavg, time | 586.0 °F, 27.2 min / 589.7 °F, 36.8 min | **589.7 °F, 35.5 min / 589.7 °F, 36.8 min** |

Text moved with it, word for word in this file and the pool: 3a note "near 719, not 684 … about 35
plant-minutes" → "near 719, so the move is 59 ppm … about 25"; 3 Background "this 24 ppm move takes
about ten plant-minutes, and a 10 ppm trim later takes about the same again" → "this 59 ppm move
takes about 25 plant-minutes, and a 10 ppm trim later takes about ten"; the stage counts 20/20/35/25/20
→ **20/15/25/20/10** (the gauge route's nets, rounded); 9a note drops "Come from the startup
walkthrough and"; 10 Background "about 250 steps … roughly 56 °F" → "about 290 steps … roughly
110 °F"; 11 Background "about 250 steps" → "about 290"; 11a note "to near 587 °F; xenon then takes
it back down" → "to near 590 °F; xenon takes hours to take it back"; 12 Background "the first 56 °F"
→ "the first 110 °F or so"; pool `outcome` "about 353 of 627 … about 250 steps, roughly 56 °F" →
"about 318 … about 290 steps, roughly 110 °F".
- **The 110 °F**: static reactivity, `hot_full_power` state, bank 318 → 606 = **1907 pcm**, at the
  plant's own 9.98 pcm/ppm and 0.567 °F/ppm. **The old 56 °F was wrong on the old preset too**: the
  same calculation gives 353 → 606 = 1600 pcm = **91 °F**. It had multiplied the steps by the
  top-of-bank worth (0.22 °F a step), which its own pool comment said is 2.3× too small at 357.
- Step 9's `< 663` BORON row and step 10's "near 580 °F" row are unchanged; both routes meet them.

**MEASURED, NOT FIXED — NEEDS A RULING: steps 10–11 overheat a xenon-free plant, now on BOTH
routes.** After the leg completes (preset, no further input): 589.7 °F → **601.6 °F at +19.5
plant-min**, and the plant **runs the turbine back from 100 to 80.7 MW** (6 min after the leg ends),
holding ~601 °F for the hour measured. Counter-case, the same route with steps 10 and 11 deleted:
Tavg **579.7 °F** 30 plant-min after step 9, on its band. So "lifts about 5 °F … xenon takes hours
to take it back" is true as far as it goes; what it leaves out is the runback. The previous record's
option (b), making 10–11 conditional on the temperature being below its band, is the fix; it was
not selected because (a) was expected to settle it, and it does not.

**The authored replay** (`run_checklist_pwr2`, fixed pulls): on the xenon-free preset its old
20/20/35/25/20 pulls trip the reactor on overtemperature-delta-T at step 8 (the `chain_count_pulls`
finding, now on the preset too). Its `replay_then` pulls moved to the card's **20/15/25/20/10**: no
trip, every stage row met. **One red left, tracked, pending the ruling above:** step 10's
temperature row reads **586.9 °F** at the end of the replay's hour, over the row's 585.3 °F edge —
the same steps 10–11 overheating. A replay-only INSERT at step 9 cannot fire (step 9 has no hold).

**B. The restyle (phase 1, this file only; the pool keeps its old shape).** 12 steps, numbering
unchanged; every step gains a one-line italic WHY (agent-drafted, for owner review); every substep
opens with a verb and is its own check-off. Check-offs **32 → 32**: four new (1b, 1c, 3a, 12b) and four pairs of rows now share one check-off (4c, 5c, 6c, 10b). Time warp: once per step, per substep in 4–8 (1× / 1× / 10×). "MWe" kept in goal
lines (ruled "leave"); board strings say MW.

**Substep ↔ grading row, for the phase-2 bring-down:**
- 1a = the Mode 1 row. **1b, 1c: no row — need an acceptance in phase 2.**
- 2a = `turbine_tripped`; 2b = `mwe_output > 8`.
- **3a: no row — needs an acceptance in phase 2** (ON lit); 3b = the `set_auto_setpoint 660` cmd row.
- 4a–6a = the LOAD cmd row; 4b–6b = the temperature row; **4c–6c = TWO rows each** (generator,
  reactor following) on one check-off. ⚠ In the pool these two rows sit BEFORE the temperature row
  in `accs_ordered`, so the substep order (pull, then check) and the grading order disagree: phase 2
  must move one of them.
- 7a = LOAD; 7b = temperature; 7c = generator (same ordering note).
- 8a = LOAD; 8b = temperature; 8c = generator; 8d = `control_bank_steps < 600` (same ordering note).
- 9a = `power_pct > 96` (OUTPUT has no row of its own); 9b = `boron_ppm < 663`; 9c = the temperature row.
- 10a = the rod-press cmd row; **10b = two rows** (load, temperature) on one check-off.
- 11a = `boron_ppm < 655`; 11b = the load row.
- 12a = the load row. **12b: no row — needs an acceptance in phase 2.**

**Manuals** (pending Rev 22, items (h) and (i)): `09` §11.0's `low_power` column (bank 222, boron
719, xenon 0; the gated rows re-booted by `run_manual_setpoints`) and `12` §7.3's 30 MWe load-ramp
table, re-measured on the new preset: Tavg low 534.9 → **533.0 °F** (4 min 35 s), level low
21.7 → **20.6 %** (3.6 points clear of the 17 % cut), settling 536.0 → **534.4 °F**; the old preset
re-run on the same script reproduces the old figures (534.8 °F, 21.5 %).

**Not verified.** Seed 42 only. No browser or layman playthrough of the restyled text (the pool
does not carry it yet). Decay heat is still seeded at the 10 % equilibrium (0.60 %) where the
startup hands over 0.29 %; the routes converged without it, so it was left. The WHY lines are
drafted, not measured claims, except step 3's 25 plant-minutes.
