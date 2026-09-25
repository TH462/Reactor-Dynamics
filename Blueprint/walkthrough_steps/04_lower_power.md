# Lower power

**Walkthrough id: `pwr_lower_power`  ·  6 steps**

> This is the LIVE step file: the sim's `pwr_lower_power` walkthrough was brought down to it on
> 2026-09-24 (the owner: "Adopt the format for the other walkthroughs."). Edit it freely — it is
> the step text, and it is what the sim is brought down to. **The 2026-09-25 reword below is NOT
> brought down yet** — the pool still carries the 2026-09-24 wording (see the Notes).
>
> **The format** (OWNER RULING, 2026-09-24: "I like putting the why where you put it. i choose
> a."; the model is `02_mode3_to_mode1.md` steps 1–3). Line one of a step is WHAT the step
> accomplishes, never how. Directly under it, one italic line says WHY. Each lettered substep is
> HOW: it opens with a verb, and it is its own check-off, drawn `()`. **Suggested time warp**
> appears once per step, or under a substep only when the substeps differ. A Note follows the
> warp it belongs to. Background closes the step. Agent notes go at the END of the file, never
> between the steps.

---

1. Start adding boron before any load comes off.

*Every percent of power shed hands reactivity back, and boron is too slow to catch it unless it is already working.*

()1a. Set 719 on the BORON card and press Enter.

Suggested time warp: 1×.

Note: Press ON only if it is not already lit. The boration then runs in the background while you take the plant down.



Background

Coming down is the climb in reverse. Every percent of power shed hands reactivity back (the fuel cools, the water thickens), and it has to go somewhere. Adding boron carries most of it out; rods trim the rest over the next few minutes.

[HIGHLIGHTED: Boron Target (pulsing); Boron Status, Boron Concentration (steady)]



2. Take the first load off the turbine and let the reactor follow it down.

*The reactor follows the turbine, so the load comes off first and the rods wait.*

()2a. Set LOAD to 75 MW and wait for OUTPUT to settle near 75 MW.

()2b. Leave the rods alone and watch REACTOR POWER follow the load down, below 95 %.

Suggested time warp: 10×.

Note: Power walks down on its own over about five plant-minutes. AVG COOLANT TEMPERATURE rises out of the green band on its tile while it does — that is expected, and the next step is what brings it back. Go on to it as soon as this step ticks: the temperature keeps climbing until the rods go in.



Background

The reactor follows the turbine: less steam drawn means the heat has nowhere to go, the water warms, and warmer water walks power down by itself. Load first, rods second, every time — insert first and you take reactivity out of a reactor still being asked for full steam, which walks the steam generator down instead.

[HIGHLIGHTED: Turbine Load (pulsing); Tavg, Reactor Power (steady)]



3. Bring AVG COOLANT TEMPERATURE back into its band with the rods.

*The load drop left the reactor hot, and this is the half of the evolution the plant cannot do for you.*

()3a. Insert at MED in pulls of about 5 steps, half a plant-minute apart, until AVG COOLANT TEMPERATURE reads below 577 °F, the top of the green band on its tile.

()3b. Check REACTOR POWER has followed down to about 73 %, below 80 %.

()3c. Check OUTPUT still reads about 75 MW.

Suggested time warp: 5×.

Note: About 15 to 75 steps at MED, the middle rod speed on the ROD CONTROL card. The green band is the temperature the plant is meant to hold at the power it is making; it falls with load, from 578 °F at 100 % to 547 °F at no load. Temperature above the band: insert. Below: withdraw. Stop when it is back in the band — the boration from step 1 is still working and will keep walking it down. The tile trails the rods: hold INSERT straight through and the plant is already past the band by the time the tile reaches it.



Background

The load drop left the reactor hot: it settles above its programme until rods take the extra reactivity out. This is the half of the evolution the plant cannot do for you, and it is why the order matters — the turbine leads, the rods follow.

[HIGHLIGHTED: Rod Speed — Normal, Insert (pulsing); Tavg, Turbine Load (steady)]



4. Take the load down to 50 MWe, then trim AVG COOLANT TEMPERATURE back into its band.

*Each load drop is the same pair of moves, turbine first and rods second, so the temperature never sits hot above its band.*

()4a. Set LOAD to 50 MW and wait for OUTPUT to settle near 50 MW.

()4b. Watch REACTOR POWER follow the load down through 70 %.

Suggested time warp: 10×.

()4c. Insert at MED in pulls of about 5 steps, half a plant-minute apart, until AVG COOLANT TEMPERATURE reads below 569 °F, the top of its green band.

Suggested time warp: 5×.

Note: About 20 to 65 steps at MED.



Background

Same order: LOAD first, then rods, so the temperature does not sit hot above its band. STEAM GENERATOR LEVEL dips before it recovers on each drop; that is normal, and SG FEED in AUTO handles it.

[HIGHLIGHTED: Turbine Load, Insert (pulsing); Tavg (steady)]



5. Take the load down to 30 MWe, then trim AVG COOLANT TEMPERATURE back into its band.

*Lower power needs smaller rod moves, and the band keeps walking down toward its no-load value.*

()5a. Set LOAD to 30 MW and wait for OUTPUT to settle near 30 MW.

()5b. Watch REACTOR POWER follow the load down through 45 %.

Suggested time warp: 10×.

()5c. Insert at MED in pulls of about 5 steps, half a plant-minute apart, until AVG COOLANT TEMPERATURE reads below 562 °F, the top of its green band.

Suggested time warp: 5×.

Note: About 10 to 45 steps at MED.



Background

Lower power needs smaller rod moves. The band is walking back down toward 547 °F. A plant left hot at low load sends the difference to the condenser through the steam dump.

[HIGHLIGHTED: Turbine Load, Insert (pulsing); Tavg (steady)]



6. Take the load down to 15 MWe, then trim AVG COOLANT TEMPERATURE back into its band.

*About 15 % is where the shutdown walkthrough trips the reactor, so this leg ends there.*

()6a. Set LOAD to 15 MW and wait for OUTPUT to settle near 15 MW.

()6b. Check REACTOR POWER reads below 40 %.

Suggested time warp: 10×.

Note: Power keeps falling as the boration finishes; the rod trims in 6c take it to about 15 %.

()6c. Insert at MED in pulls of about 5 steps, half a plant-minute apart, until AVG COOLANT TEMPERATURE reads below 557 °F, the top of its green band.

Suggested time warp: 5×.

Note: About 6 to 40 steps at MED. Stop here; the shutdown walkthrough takes over.



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

### Reconcile record — 2026-09-25, `exp/v5-ct` scratch lane (layman pass 4)

**AGENT-DRAFTED FOR OWNER REVIEW.** Measured with `run_walkthrough_routes`, preset
(`hot_full_power`) and chain, seed 42.

- **3a, 4b, 5b, 6b: "Hold INSERT at MED until …" → "Insert at MED in pulls of about 5 steps, half a
  plant-minute apart, until …"**, and 3a's note adds that the tile trails the rods. Power at the
  bottom of each step, pulses vs holding straight through: preset 71.0 / 44.7 / 26.2 / 9.8 % vs
  70.2 / 43.8 / 22.8 / 8.7 %; chain 64.8 / 44.4 / 24.9 / 12.5 % vs 64.3 / 39.1 / 20.4 / 7.5 %.
  Pulled steps with pulses: preset 25 / 50 / 35 / 25, chain 15 / 35 / 30 / 25, so step 3's "About
  40 to 75" became "About 15 to 75". The reviewer's 49 at step 3 was inside the old range; his 59
  at step 5 was not.
- **Step 2's note adds "Go on to it as soon as this step ticks…".** Step 2 ticks at 0.4 plant-min
  on both routes.
- **The 593 °F the reviewer saw is the chain seam, not this card**: the chained leg starts at
  589.8 °F and peaks at 600.3 °F whether INSERT is held, pulsed, or held then pulsed (preset peak
  584.2 °F). See `03_raise_power.md`'s record.
- **Open question B (one-sided rows labelled "inside its band") is left as is**: a two-sided row
  would ask for a withdrawal against the boration that step 1 started.

### Reword record — 2026-09-25, `exp/w6-lower` scratch lane: the what / why / how format

*OWNER RULING, 2026-09-24, selected "Yes, all five" (option text: "Opus agents restyle heatup,
raise, lower, shutdown and cooldown to match, using your Mode 3 → Mode 1 steps 1–3 as the model.
Measured numbers stay; the gates and a layman pass confirm.")*, applying the format of
`02_mode3_to_mode1.md` record (h). Also *OWNER RULING, 2026-09-24, selected "Take all defaults"*:
a temperature check-off that says "inside its band" but grades one side reads "below X °F" at the
row's graded edge. That settles the previous record's open question B. **STEP FILE ONLY — the
`pwr_lower_power` pool is NOT brought down** (phase 2, after the runtime support for this shape
lands on develop).

**Tally.** 6 steps (unchanged), 9 lettered substeps → **15**, 15 check-off lines → **15**. Every
check-off row is now its own substep; no row was added or removed, so **no substep lacks an
existing grading row**. Mapping (pool row → substep): step 1 boron command → 1a; step 2
`mwe_output ~75` → 2a, `power_pct < 95` → 2b; step 3 `tavg_c < 302.7` → 3a, `power_pct < 80` →
3b, `mwe_output ~75` → 3c; steps 4/5/6 load row → a, power row → b, Tavg row → c.

**Phase 2 must:** give each former `cont: true` power / output row its own `ask` (the substep
line above); move 4b/5b/6b's Tavg asks to 4c/5c/6c; relabel the four Tavg rows. Graded edges, from
the pool: 302.7 °C = 576.9 °F, 298.1 °C = 568.6 °F, 294.4 °C = 561.9 °F, 291.6 °C = 556.9 °F.

**Lines whose meaning changed (agent-drafted, for review):**
- **Step 4's Tavg check-off: "below 568 °F" → "below 569 °F".** The old label mis-rounded its
  own threshold (568.58 °F). No grading value moves; the text now matches the graded edge, and a
  whole-degree reading of "568" always ticks, "569" may — the same relation as 577 / 562 / 557.
- **"inside its band" dropped** from all four Tavg check-offs, per the ruling; each now reads
  "below X °F, the top of the green band" so the colour cue he told the player to watch stays in
  the line. 3a's old action "back inside the green band on its tile" is the same row and got the
  same wording.
- **2b and 3b now print the graded power edge** (95 %, 80 %). His labels "Reactor following the
  load down" / "Reactor followed down to about 73 %" did not; a substep that is its own check-off
  says what ticks it, as 02's do.
- **6b split**: "Reactor below 40 % and falling as the boration finishes (rod trims take it to
  about 15 %)" → check-off "Check REACTOR POWER reads below 40 %." plus a Note carrying the rest.
- **1a**: "On the BORON card set 719 and press Enter." → "Set 719 on the BORON card and press
  Enter." (verb first); its Note now follows the warp line.
- **2a's "Leave the rods alone for now"** moved into 2b, which opens with it.
- **The six WHY lines are new**, drawn from each step's own Background (step 6's from the
  shutdown hand-off in 6c's note).

**Unchanged:** every measured number (rod-step ranges, "about five plant-minutes", the 578 / 547 °F
band ends, 73 %, 15 %), every speed (1a 1×; 2 10×; 3 5×; a/b 10×, c 5× in 4–6 — the substeps
differ, so the warp sits under each group), the "pulls of about 5 steps, half a plant-minute
apart" wording, the goal lines, Background and HIGHLIGHTED lines.

**NOT verified:** nothing was stepped — this is text only; whether the tile's whole-degree draw
matches the 569 °F wording at step 4 on the player route is inherited from the 2026-09-24 record's
render-boundary argument, not re-measured. No layman pass yet.
