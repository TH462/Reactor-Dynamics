# Raise power

**Walkthrough id: `pwr_raise_power`  ·  9 steps**

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

*The climb starts from the startup's plant: critical, on the grid, startup trips blocked.*

()1a. Check REACTOR POWER reads about 10 %. Above 5 % is Mode 1, At Power.

()1b. Check SG FEED AUTO is lit.

()1c. Check IR HIGH FLUX and PR HIGH (LOW SETPT) both read BLOCKED on TRIP BLOCKS.

Suggested time warp: 1×.



Background

Both startup trips must be blocked. Left live, the climb trips the reactor at 25 %, then 35 %.

[HIGHLIGHTED: Reactor Power, SG Feed AUTO, Trip Blocks (steady)]



2. Make sure the turbine is on line and taking steam.

*Raising LOAD does nothing until the turbine takes steam.*

()2a. Check the TURBINE-GENERATOR card shows LATCH lit and TRIP not lit. If it reads TRIP, press LATCH.

()2b. Check OUTPUT reads above 8 MW. If it stays at 0.0 MW, set LOAD to 10 MW.

Suggested time warp: 1×.

Note: LATCH is refused while the trip's cause remains; the card names it. After LATCH, OUTPUT returns to the last LOAD set.



Background

A tripped turbine takes no steam, so the heat goes to the steam dumps. It also trips the reactor once REACTOR POWER passes 50 %, or 8 % with the condenser gone.

[HIGHLIGHTED: Turbine — Latch, Load Setpoint (pulsing); Turbine Load, Generator Output (steady)]



3. Start the boron dilution that carries most of the climb.

*Boron carries most of the climb and takes about 45 plant-minutes, so it starts first.*

()3a. Check ON is lit on the BORON card. If ON is not lit, press ON.

()3b. Set the boron target to 660 ppm: type it in the BORON card's 0-2500 ppm box and press Enter.

Suggested time warp: 1×.

Note: BORON starts near 719, a 59 ppm move. It runs in the background while you take the stages.



Background

Every percent of power costs reactivity as the fuel and water heat up. Rods alone would end deep in the core, so real plants dilute boron for the bulk and trim with rods. Dilution slows as it nears the target.

[HIGHLIGHTED: Boron ON, Boron Target (pulsing); Boron Status, Boron Concentration (steady)]



4. Take the first stage to 30 MWe, load leading and rods following.

*The turbine asks for power first; rods then restore the temperature for that load.*

()4a. Set LOAD to 30 MW.

Suggested time warp: 1×.

()4b. Wait for OUTPUT to reach 30 MW. AVG COOLANT TEMPERATURE sags meanwhile; the next line answers it.

Suggested time warp: 10×, while OUTPUT climbs.

()4c. If AVG COOLANT TEMPERATURE reads below 552 °F, withdraw at MED in 5-step pulls a plant-minute apart until it reads 552 °F or more, 20 to 25 steps. Otherwise leave the rods.

Suggested time warp: 5×.

Note: MED is the middle speed on the ROD CONTROL card. The green segment under the reading is the band, about 552 to 561 °F here. The tile keeps rising a minute after each pull. Keep it under 590 °F on every stage: the plant trips on temperature before power.



Background

Raising LOAD draws steam and cools the water; colder water adds reactivity, so power follows the turbine up while the temperature sags. Pulling rods then warms the water back into its band.

Real plants switch rod control to automatic near 15 %; this simulator keeps rods manual by design.

[HIGHLIGHTED: Load Setpoint, Rod Speed — Normal, Withdraw (pulsing); Turbine Load, Tavg, Generator Output, Reactor Power (steady)]



5. Take the second stage to 50 MWe the same way.

*Same order: the turbine leads, the rods follow.*

()5a. Set LOAD to 50 MW.

Suggested time warp: 1×.

()5b. Wait for OUTPUT to reach 50 MW. AVG COOLANT TEMPERATURE sags meanwhile; the next line answers it.

Suggested time warp: 10×, while OUTPUT climbs.

()5c. If AVG COOLANT TEMPERATURE reads below 558 °F, withdraw at MED in 5-step pulls a plant-minute apart until it reads 558 °F or more, 20 to 25 steps. Otherwise leave the rods.

Suggested time warp: 5×.

Note: The green segment is about 558 to 568 °F here. Control Rods — Approaching Insertion Limit can come in from this stage, even while you withdraw. That is expected.



Background

The insertion limit rises with power; boron carries the climb, so the bank sits low and the limit catches it. Xenon starts building now: boron handles it over hours, rods over minutes.

[HIGHLIGHTED: Load Setpoint, Withdraw (pulsing); Turbine Load, Tavg, Generator Output, Reactor Power (steady)]



6. Take the third stage to 75 MWe the same way.

*The band climbs with load, so each pull aims a little higher.*

()6a. Set LOAD to 75 MW.

Suggested time warp: 1×.

()6b. Wait for OUTPUT to reach 75 MW. AVG COOLANT TEMPERATURE sags meanwhile; the next line answers it.

Suggested time warp: 10×, while OUTPUT climbs.

()6c. If AVG COOLANT TEMPERATURE reads below 566 °F, withdraw at MED in 5-step pulls a plant-minute apart until it reads 566 °F or more, about 30 steps. Otherwise leave the rods.

Suggested time warp: 5×.

Note: The green segment is about 566 to 575 °F here. Control Rods — Approaching Insertion Limit, then Control Rods — Insertion Limit, come in this stage: expected.



Background

If the temperature is still below the band once the pull is done, the pull was short: withdraw a few more steps before adding megawatts.

[HIGHLIGHTED: Load Setpoint, Withdraw (pulsing); Turbine Load, Tavg, Generator Output, Reactor Power (steady)]



7. Take the fourth stage to 90 MWe with a smaller pull.

*Near full power the 103 % rod stop is close, so pulls get smaller.*

()7a. Set LOAD to 90 MW.

Suggested time warp: 1×.

()7b. Wait for OUTPUT to reach 90 MW. AVG COOLANT TEMPERATURE sags meanwhile; the next line answers it.

Suggested time warp: 10×, while OUTPUT climbs.

()7c. If AVG COOLANT TEMPERATURE reads below 570 °F, withdraw at MED in 5-step pulls a plant-minute apart until it reads 570 °F or more, 15 to 20 steps. Otherwise leave the rods.

Suggested time warp: 5×.

Note: The green segment is about 570 to 580 °F here. If LOAD changes by itself, the turbine ran back on high temperature: hold INSERT until AVG COOLANT TEMPERATURE is back in its band, then set LOAD again.



Background

Above 103 % power the plant stops the rods; at 115 % it trips the reactor. 100 MWe of LOAD lands REACTOR POWER near 101 %, so small pulls keep you clear.

[HIGHLIGHTED: Load Setpoint, Withdraw, Insert (pulsing); Turbine Load, Tavg, Generator Output (steady)]



8. Take the last stage to full load and settle the temperature on 578 °F.

*578 °F is this plant's full-power temperature.*

()8a. Set LOAD to 100 MW.

Suggested time warp: 1×.

()8b. Wait for OUTPUT to reach 100 MW. AVG COOLANT TEMPERATURE sags meanwhile; the next line answers it.

Suggested time warp: 10×, while OUTPUT climbs.

()8c. If AVG COOLANT TEMPERATURE reads below 573 °F, withdraw at MED in 5-step pulls a plant-minute apart until it settles on 578 °F, 10 to 20 steps. Otherwise leave the rods.

Suggested time warp: 5×.

Note: If CONTROL ROD POSITION stops moving during a pull, power passed the 103 % rod stop: wait for REACTOR POWER to settle under 103 %, then pull again.

()8d. Check CONTROL ROD POSITION reads below 600, not on its top stop.



Background

REACTOR POWER settles near 101 %. The control bank ends part-way out, because boron carried most of the reactivity the climb cost.

[HIGHLIGHTED: Load Setpoint, Withdraw (pulsing); Turbine Load, Tavg, Generator Output, Control Rod Position (steady)]



9. Confirm full power, with the boron dilution done.

*The climb is not finished until the dilution has fully arrived.*

()9a. Check REACTOR POWER reads about 100 % and OUTPUT 100 MW.

()9b. Check BORON CHEM reads 663 ppm or below.

()9c. Hold INSERT 3 steps at a time whenever AVG COOLANT TEMPERATURE rises above its band, until it holds between 563 and 592 °F.

Suggested time warp: 5×.

Note: Read BORON CHEM twice: leave with too much boron and AVG COOLANT TEMPERATURE sinks over hours, taking PZR LEVEL with it. This walkthrough ends here; xenon, which cools the plant over two plant-days, gets its own walkthrough, still to come.



Background

Full power, with almost no xenon yet. The last of the dilution still arriving warms the plant, so a few rod steps in hold Tavg. As xenon builds, the plant settles with less boron and the bank high, 606 of 627 steps.

[HIGHLIGHTED: Insert (pulsing); Reactor Power, Generator Output, Tavg, Boron Concentration (steady)]



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
12. Hold full power on program while xenon builds.

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
- Outside this file, word for word in both places: `02_mode3_to_mode1.md` step 18's Background
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

### Ruling and bring-down record — 2026-09-25 (b), `exp/w6-raise` scratch lane (phase 2)

**OWNER RULING 2026-09-24/25, option selection "Make them conditional"** (option text, not
verbatim: "Pull or dose only when AVG COOLANT TEMPERATURE is below its band; the check-off becomes
'on band and at full load'."). Steps 10 and 11 now ask for a pull or a dose ONLY below the band;
both grade the temperature row (near 580 °F, 574.5 to 585.3) and the load row, and carry
`press_expected` (a real conditional press). The replay issues nothing on either (was a 6-step pull
and a 650 ppm dose). 11a's "set the BORON target 10 ppm lower" replaces "set 650"; 12b now says
"part-way out, below 600" and grades it, since the bank no longer rises by instruction.

**Measured** (`run_walkthrough_routes`, seed 42, full stack, live checklist):

| | preset | chain |
|---|---|---|
| leg ends | **580.5 °F**, bank 306, 25.7 plant-min | **581.2 °F**, bank 309, 27.0 plant-min |
| steps 10–12 | met on arrival, 0.1 min each (listed `entry_met`) | same |
| lower power peak (chain) | — | **593.0 °F** (was 600.3 °F) |

The runback is gone: with 10–11 asking for nothing on an on-band plant, the leg's end is the plant
of the earlier "10–11 deleted" run, 579.7 °F 30 plant-min on and no turbine cut (record (a) above).
Gauge-route net pulls, stages 4–8: preset 24/9/28/18/14, chain 27/12/26/18/13 (card "about"
20/15/25/20/10, unchanged).

**Phase 2: the pool brought down to this file.** Every step has `aim` (the italic line) and the
step-level `speed_text` where its substeps share a rung (1–3, 9–12); 4–8 keep per-substep speeds.
Script-compared, file vs pool: text, aim, every substep `ask`, notes, speed lines and Background —
**identical, 12 steps** (the comparator was injected with three edits and reported 7 differences).
- **The four new check-offs are graded**: 1b `feed_coupled`, 1c `ir_high_blocked` +
  `pr_low_setpoint_blocked`, 3a `boron_auto_on`, 12b `tavg_c` + `control_bank_steps < 600`.
  Injection-proved on the live runtime from `low_power`: SG FEED to MANUAL unticks 1b, each
  unblock unticks 1c, and 3b stays unmet until the press.
- **The 4–8 ordering is resolved by making 4b–8b a rod-press row** (`rod_nudge`, any control-rod
  press), and moving the temperature row into c under the OUTPUT check, graded after it. Grading
  order now equals text order: LOAD, pull, then OUTPUT / power / temperature. Measured: a LOAD
  with no pull leaves 4b unmet after 300 plant-seconds (rows 1 0 0 0 0).
- 3b is cmd + `p` (`boron_target_ppm ~ 660`), so the #697 sweep no longer reads 3a's lamp as the
  press's own state; `pwr_raise_power:3` leaves its no-observable-state list.
- Retired injection `band_transient_pass`: with the temperature row a `cont` graded after OUTPUT,
  the transient tick it guarded cannot light Continue, and no placement of a narrowed band made it
  tick at all on the xenon-free plant (measured four ways). `no_latch_9a` still proves the detector.
- "a few steps" (run_style W12) → "3 steps at a time" (9) and "3 to 6 steps" (10): the gauge route
  inserts in 3-step pulls, 9 to 12 in all.

**Not verified.** Seed 42 only. No layman or browser playthrough of the reworded text
(`verify_e2e_ui` and `verify_manual_follow` pass). The stage counts were not re-rounded to the new
nets (stage 5 measures 9 / 12 against "about 15").

### Cross-leg quality pass — 2026-09-25, workbench-f

- **Step 1: trips are "blocked"** *(OWNER RULING, 2026-09-25: "A", on the pass-5 text: the
  startup trips are "blocked", matching the panel's BLOCKED)*. The italic line now ends "with its
  startup trips blocked"; the Background says "Both startup trips have to be blocked. Left live,
  the climb trips at 25 %, then 35 %." ("Left live" is `pwr_startup` 15/16's wording.)
- **Step 12: "programme" → "program"** (US spelling, as everywhere else on the card).
- **Pool-only labels name the tile**: `Generator at N MW` → `OUTPUT N MW`, `Generator above 8 MW` →
  `OUTPUT above 8 MW`, `Load target set to N MW` → `LOAD set to N MW`, `Reactor following, near
  N %` → `REACTOR POWER near N %`, `Still at full load, 100 MW` → `OUTPUT still 100 MW`, `BORON set
  to 660 ppm` → `BORON target reads 660 ppm` (the cooldown's and startup's form). Grading unchanged.
- **`act_first` not authored.** 4c-8c (10×) are checks, not presses; 4b-8b are presses at 1×.

### One boron ON check — 2026-09-25, workbench-f

*OWNER RULING, 2026-09-25, selected "Take all defaults" (option selection, not verbatim; relayed by the coordinator)*, item 3: the boron ON check reads the same in every leg. 3a is now "Check ON is lit on the
BORON card. If ON is not lit, press ON." (was "Check BORON ON is lit. If it is not, press ON.").
The cooldown's 1a wording minus its "BORON STATUS reads BORATING" clause: this leg dilutes (the
status reads DILUTING), and since the cooldown's ON-first swap the status only moves after the
target is set, so the clause went to the cooldown's target substep. Grading unchanged.

### Layman pass 5 record — 2026-09-25, workbench-g

Record: `Diagnostic/CHECKLIST_PLAYTEST_2026-09-25_LAYMAN_PASS5.md`. 4b's note: "The gauge keeps rising about 2 to 5 °F after you let go" — chain route overshoot after release, stages 1-5: 5.3 / 5.0 / 3.2 / 2.6 / 1.8 °F; the reviewer's stage 1 went to 563 °F. The tile's green band is real at power (17 of 178 px, `#74dc9c`, headless capture at 580 °F). 9b now reads "663 ppm or below", its grading threshold (`< 663`, pass 4's settling margin); it had said 660 and ticked with the tile on 663.

### Layman pass 6 — 2026-09-26, workbench-a (AGENT-DRAFTED, not owner-ruled)

Record: `Diagnostic/CHECKLIST_PLAYTEST_2026-09-26_LAYMAN_PASS6.md`. 8c grades 573–583 °F (was 563–592): "settle on 578" was ticking at 564–567. 10a names 575 °F and says repeat until it reads 575 or more (it graded 574.5–585.3 against "its band", which steps 8–9 had defined as 563–592). The conditional ruling (2026-09-25, "Make them conditional") stands: an on-band plant is met on arrival. The OWNER may prefer different wording — this is the agent's. 5b forewarns Approaching Insertion Limit. Bank arithmetic: "about 300 steps" (routes end 297–308; reviewer 296).


### Layman pass 7 record — 2026-09-26, workbench-b (AGENT-DRAFTED: 4b-8c)

Record: `Diagnostic/CHECKLIST_PLAYTEST_2026-09-26_LAYMAN_PASS7.md`. 4b-8b were a press-only "Rods
withdrawn" check-off; with stage 4 ending hot (562.8 °F) stage 5 never sagged below its band and 5b
waited on a press the text argued against. Each `b` is now the temperature check-off 4c-8c carried
(bands unchanged), conditional as 10-11 are (ruling 2026-09-25, "Make them conditional"), and paced
"in pulls of about 5 steps, one plant-minute apart": tile rise after release 2.1-2.6 °F against
5.0-7.5 °F held (reviewer 13 °F). Counts 20 / 20 / 25 / 15 / 15 (stage 5: preset 15, chain 20). 5b forewarns
Pressurizer Pressure Low, 6b Insertion Limit. Suggested speed 5×. The wording is the agent's.

### Layman pass 8 record — 2026-09-26, workbench-d (AGENT-DRAFTED: wording only)

- Rod estimates widened to what was measured (two layman rounds + the chain gate): 4b 5 to 20
  (5/15/15), 5b about 10 (10/10/10), 6b 20 to 25 (20/20/25), 8b 15 to 25 (25/13/25). 7b unchanged.
- 4b-7b Notes say the check-off band is wider than the green band ("aim for the green, not the
  tick"): the reviewer ticked 6 at 559-560 °F against a green band near 570.
- 12's Note no longer promises a wait the card does not make: on the chain, 10-12 tick in 0.1
  plant-min each at 580 °F, which is honest under the conditional-step ruling. Record: `Diagnostic/CHECKLIST_PLAYTEST_2026-09-26_LAYMAN_PASS8.md`.

### Xenon steps removed — 2026-09-26, workbench-e (owner directive and selection, quoted below)

*(OWNER DIRECTIVE, 2026-09-26: "I don't think dealing with xenon should be a part of these
walkthroughs. That's for a different walkthrough.")* Then the owner selected option **"C"** (option
text, not his words — Hard Rule 11): replace steps 10-12 with ONE closing note, no action asked,
pointing to a future xenon walkthrough; keep the explanation-only mentions (stage 5's and step 9's
Background). **This supersedes the 2026-09-25 "Make them conditional" ruling on steps 10-11.**

- Steps 10 (rod give-back), 11 (first boron dose) and 12 (hold full power while xenon builds) are
  gone; the leg is 9 steps and ends on step 9.
- Step 9's Note gains the closing sentence; its Background drops "The next step is how you get from
  here to there." The end card (`outcome`) says xenon is a separate walkthrough.
- Step 12's check-offs were already graded earlier, so none moved: OUTPUT 100 MW (9a), CONTROL ROD
  POSITION below 600 (8d), the temperature (8b 573-583 °F, 9c 563-592 °F).
- Route gate: `entry_met` '#10'/'#11', the chain's '#10' band-floor pull and injection
  `chain_step10_bank` retired with their step; `raise_old_settle_band` keeps its step-8 half.

### Re-walk record — 2026-09-26, `exp/807e1` (#807 item 2, the boron makeup-path holdup)

Re-measured on the holdup plant (seeds 42/7/123 and the chain) and re-authored to it; highlights moved
to the pressed button (`Load Setpoint`, `Boron ON`, `Turbine — Latch`, `Insert`) with the card on the
steady ring. Every number and why: `Diagnostic/TUNING_LOG.md`, session `2026-09-26-develop-h`.

### Review fix — 2026-09-26 (807g, #807 read-only review item 5)

Step 3's goal line "BORON reads 660 ppm" -> "BORON target reads 660 ppm" (step 3 sets the box; the
concentration arrives about 45 plant-minutes later), and step 9's "BORON at or below 660 ppm" -> "BORON
663 ppm or below", the number 9b grades. MEASURED, typical route: 9b ticks on 662.8 / 661.9 ppm (seeds
42 / 7), which the whole-ppm tile draws as 663 / 662. Grading unchanged.

### Concise pass — 2026-10-02 (#819)

2026-10-02 (#819): concise pass, owner directive 2026-10-01 ("we dont need to hide the background. we just need to clean up the steps and subtext to be more streamlined and concise."). Words/step 216 -> 156 (1946 -> 1403 over 9 steps; step line through Background, HIGHLIGHTED lines excluded). No predicate, target, band, hold, command, highlight or step/substep count changed; the pool is brought down word for word (script compare). pool-only paragraph kept: step 4 Background "Real plants switch rod control to automatic near 15 %; this simulator keeps rods manual by design." (was in the pool, missing from this file). Step 1 note removed (draft).
