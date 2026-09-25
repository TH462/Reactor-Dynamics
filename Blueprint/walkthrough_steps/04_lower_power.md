# Lower power

**Walkthrough id: `pwr_lower_power`  ·  6 steps**

> This is the LIVE step file: the sim's `pwr_lower_power` walkthrough was brought down to it on
> 2026-09-24 (the owner: "Adopt the format for the other walkthroughs."). Edit it freely — it is
> the step text, and it is what the sim is brought down to.
>
> **The format.** Line one of a step is what the step accomplishes. Each lettered substep opens
> with the action that accomplishes it, then its own Note, its own **Suggested time warp**, and
> its check-off lines drawn `()`. Background closes the step. Agent notes go at the END of the
> file, never between the steps.

---

1. Start adding boron before any load comes off.

1a. On the BORON card set 719 and press Enter.

Note: Press ON only if it is not already lit. The boration then runs in the background while you take the plant down.

Suggested time warp: 1×.

()  BORON target set to 719

Background

Coming down is the climb in reverse. Every percent of power shed hands reactivity back (the fuel cools, the water thickens), and it has to go somewhere. Adding boron carries most of it out; rods trim the rest over the next few minutes.

[HIGHLIGHTED: Boron Target (pulsing); Boron Status, Boron Concentration (steady)]



2. Take the first load off the turbine and let the reactor follow it down.

2a. Set LOAD to 75 MW and let the reactor follow it down. Leave the rods alone for now.

Note: Power walks down on its own over about five plant-minutes. AVG COOLANT TEMPERATURE rises out of the green band on its tile while it does — that is expected, and the next step is what brings it back.

Suggested time warp: 10×.

()  OUTPUT settled near 75 MW
()  Reactor following the load down

Background

The reactor follows the turbine: less steam drawn means the heat has nowhere to go, the water warms, and warmer water walks power down by itself. Load first, rods second, every time — insert first and you take reactivity out of a reactor still being asked for full steam, which walks the steam generator down instead.

[HIGHLIGHTED: Turbine Load (pulsing); Tavg, Reactor Power (steady)]



3. Bring AVG COOLANT TEMPERATURE back into its band with the rods.

3a. Now hold INSERT at MED until AVG COOLANT TEMPERATURE is back inside the green band on its tile.

Note: About 40 to 75 steps at MED, the middle rod speed on the ROD CONTROL card. The green band is the temperature the plant is meant to hold at the power it is making; it falls with load, from 578 °F at 100 % to 547 °F at no load. Temperature above the band: insert. Below: withdraw. Stop when it is back in the band — the boration from step 1 is still working and will keep walking it down.

Suggested time warp: 5×.

()  AVG COOLANT TEMPERATURE back below 577 °F, inside its band
()  Reactor followed down to about 73 %
()  Generator still carrying about 75 MW

Background

The load drop left the reactor hot: it settles above its programme until rods take the extra reactivity out. This is the half of the evolution the plant cannot do for you, and it is why the order matters — the turbine leads, the rods follow.

[HIGHLIGHTED: Rod Speed — Normal, Insert (pulsing); Tavg, Turbine Load (steady)]



4. Take the load down to 50 MWe, then trim AVG COOLANT TEMPERATURE back into its band.

4a. Set LOAD to 50 MW and let power follow.

Suggested time warp: 10×.

()  Generator settled near 50 MW
()  Reactor following through 70 %

4b. Hold INSERT at MED until AVG COOLANT TEMPERATURE is back in its band.

Note: About 20 to 65 steps at MED.

Suggested time warp: 5×.

()  AVG COOLANT TEMPERATURE back below 568 °F, inside its band

Background

Same order: LOAD first, then rods, so the temperature does not sit hot above its band. STEAM GENERATOR LEVEL dips before it recovers on each drop; that is normal, and SG FEED in AUTO handles it.

[HIGHLIGHTED: Turbine Load, Insert (pulsing); Tavg (steady)]



5. Take the load down to 30 MWe, then trim AVG COOLANT TEMPERATURE back into its band.

5a. Set LOAD to 30 MW and let power follow.

Suggested time warp: 10×.

()  Generator settled near 30 MW
()  Reactor following through 45 %

5b. Hold INSERT at MED until AVG COOLANT TEMPERATURE is back in its band.

Note: About 10 to 45 steps at MED.

Suggested time warp: 5×.

()  AVG COOLANT TEMPERATURE back below 562 °F, inside its band

Background

Lower power needs smaller rod moves. The band is walking back down toward 547 °F. A plant left hot at low load sends the difference to the condenser through the steam dump.

[HIGHLIGHTED: Turbine Load, Insert (pulsing); Tavg (steady)]



6. Take the load down to 15 MWe, then trim AVG COOLANT TEMPERATURE back into its band.

6a. Set LOAD to 15 MW and let power follow.

Suggested time warp: 10×.

()  Generator settled near 15 MW
()  Reactor below 40 % and falling as the boration finishes (rod trims take it to about 15 %)

6b. Hold INSERT at MED until AVG COOLANT TEMPERATURE is back in its band.

Note: About 6 to 40 steps at MED. Stop here; the shutdown walkthrough takes over.

Suggested time warp: 5×.

()  AVG COOLANT TEMPERATURE back below 557 °F, inside its band

Background

Scramming from full power is a thermal shock to the plant. About 15 % is low enough that the trip is gentle and high enough that the steam generator still has steam to dump afterwards.

[HIGHLIGHTED: Turbine Load, Insert (pulsing); Tavg (steady)]



## Notes — agent record, NOT step text

### Reconcile record — 2026-09-24, wt-lower lane (brought down to the sim)

*Ported under the owner's 2026-09-24 directive, "Adopt the format for the other walkthroughs.",
from the previous version of this file (`git show HEAD~1:Blueprint/walkthrough_steps/04_lower_power.md`).
`ui/manual_procedures.js` `pwr_lower_power` (the PWR2 pool) carries it word for word.*

**Tally.** 6 steps (unchanged — no split, no fold), 9 lettered substeps, 15 check-off lines
(the 14 rows the sim graded before, plus step 1's, which was a bare command observation
and is now drawn).

**GOAL LINES — AGENT-DRAFTED FOR OWNER REVIEW.** His old step lines are now the substep actions;
these six are new:
1. Start adding boron before any load comes off.
2. Take the first load off the turbine and let the reactor follow it down.
3. Bring AVG COOLANT TEMPERATURE back into its band with the rods.
4. Take the load down to 50 MWe, then trim AVG COOLANT TEMPERATURE back into its band.
5. Take the load down to 30 MWe, then trim AVG COOLANT TEMPERATURE back into its band.
6. Take the load down to 15 MWe, then trim AVG COOLANT TEMPERATURE back into its band.

**Also agent-drafted, for review:** step 1's check-off `BORON target set to 719` (the step had
no drawn check-off); the substep actions 4a/5a/6a, "Set LOAD to N MWe and let power follow.",
which join his old check-off line "Set LOAD to N MWe." to the "let power follow" clause of his
step line ("," became "and").

**THE ROD COUNTS ARE NOW RANGES — agent edit to his notes, for review.** He wrote about 40, 20,
10 and 6 steps. MEASURED on the full stack, live runtime, `hot_full_power`:

| step | authored replay (waits the full hold, seed 42) | player who inserts as soon as the load check-offs tick (seeds 42 / 7 / 99) | card now |
|---|---|---|---|
| 3 | 40 (five plant-minutes after the drop) | 72 / 74 / 74 | about 40 to 75 |
| 4 | 0 — the boration alone brings it in | 62 / 60 / 64 | about 20 to 65 |
| 5 | 0 | 45 / 45 / 46 | about 10 to 45 |
| 6 | 0 | 36 / 38 / 38 | about 6 to 40 |

The count depends on how long the player has let the boration work, so a single number is wrong
on one route or the other. His number is kept as the low end. The alternative is "Up to about
N steps", which is truer at the low end (the replay needs none in 4 to 6) but drops his figure.

**Leg length.** The `purpose` said "About 1 plant-hour"; MEASURED 6.0 to 6.7 plant-minutes on the
prompt player route (three seeds), 24.0 on a player who inserts first and then waits, 29.2 on one who never
inserts after step 3, and 47.5 on the authored replay. It now reads "About 7 to 50 plant-minutes".

**Grading — no value moved.** Every row is the one the sim graded before, regrouped under his
substeps (load rows under 4a/5a/6a, the Tavg row under 4b/5b/6b; the power row became a
check-off of the load substep). Step 1's bare command observation became a command-kind check-off
with the same payload: measured not met at entry, met 2 s after the press. That brought it into
`run_checklist_pwr2`'s #697 sweep of command check-offs with nothing observable behind them; it
joins `pwr_raise_power` step 3, the same boron press, on the documented list. The board already
publishes the BORON target (the automation channel's `setpoint`), but the checklist grader cannot
read it, so grading the box's state instead of the press would be a runtime change. Every row reads the
channel the tile draws (`tavg_c` → the `tavg` instrument, `power_pct` → power range, `mwe_output`
→ the generator instrument). The Tavg thresholds are the band's own top edge, the colour change
he tells the player to watch, which is why they sit off the whole-degree render boundary; a
reading of "576" always ticks 3a and "577" may, so nothing can strand.

**Entry states, MEASURED** (the hollow-step trap): steps 2 to 5 have no row met on arrival on any
route. Step 6's `Reactor below 40 %` row is met on arrival everywhere (24.4 to 26.5 %); the step
is not hollow, because the OUTPUT band still needs the LOAD press. On the authored replay 6b is
met on arrival too (554.8 °F), because after the full waits the boration has done the trim.

**Order — `accs_ordered` NOT added, MEASURED.** A player who inserts FIRST in steps 4 to 6 (20,
10, 6 steps) and then sets LOAD does not get a hollow tick: in step 4 the tile read 573.6 °F after
the 20 steps, 5.0 °F above the row, which ticked only at +542 s once the boration brought it in.

**Deleted:** step 1's authored `wait_hint` (the 36-plant-minute boration figure). It was agent
prose, not in this file, and 1a now prints its own speed line; the measurement stays in the code
comment.

**SPEED PROVENANCE**

| substep | rung | provenance |
|---|---|---|
| 1a | 1× | carried: the 30 s rule on `hold: 30` gives 1×; an instant press |
| 2a | 10× | carried: the 30 s rule on `hold: 300`, which is what the step plays at today; the rows tick 14 plant-seconds after the press (MEASURED) |
| 3a | 5× | MEASURED: the tile's band top to band floor is 43 rod steps at MED, 54 plant-seconds — 11 s of wall clock at 5×, 5.4 s at 10×. The usable window is shorter than the span, because the tile lags the rods: a stop at the floor crossing went on to read 551.9 °F, 14.9 °F under the band floor. 10× would leave under about 5 s. |
| 4a, 5a, 6a | 10× | pick, the same action as 2a; the rows tick 5 to 10 plant-seconds after the press (MEASURED). The step-level 30 s rule would have played these at 60× (`hold` 720/600/900). |
| 4b, 5b, 6b | 5× | MEASURED, same yardstick as 3a: band spans 38, 37 and 50 rod steps (47, 46, 62 plant-seconds): 9.2 to 12.5 s at 5×, 4.6 to 6.2 s at 10× |

`tools/glance_rung.js pwr_lower_power 1 6` (the power-glance yardstick) was run too; nothing in
this leg is decided by it, because no substep asks the player to read REACTOR POWER inside a
window. Its step 3 table records the replay's rod pull: 40 steps in 49.9 plant-seconds, 10.0 s of
wall clock at 5×.

### Owner rulings — 2026-09-24 (workbench-j), no text change

- **Rod counts:** OWNER RULING 2026-09-24, selected "Keep the ranges" (option selection, option text not verbatim) — the agent-edited ranges above stand as written.
- **Durations:** OWNER RULING 2026-09-24, selected "Accept all" — the measured durations in the step text stand.
- **Goal lines:** OWNER RULING 2026-09-24, selected "Accept as drafted" — the agent-drafted goal lines above are accepted.
