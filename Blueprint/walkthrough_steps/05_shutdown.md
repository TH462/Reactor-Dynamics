# Shutdown to Mode 3, Hot Standby

**Walkthrough id: `pwr_shutdown`  ·  3 steps**

> This is the LIVE step file: the sim's `pwr_shutdown` walkthrough is brought down to it, word for
> word. Edit it freely — it is the step text.
>
> **The format.** Line one of a step is what the step accomplishes. Each lettered substep opens
> with the action that accomplishes it, then its own Note, its own **Suggested time warp**, and
> its check-off lines drawn `()`. Background closes the step. Agent notes go at the END of the
> file, never between the steps.

---

1. Take the load off the generator before the scram.

1a. Set LOAD to 0 MW and wait for OUTPUT to fall below 5 MW.

Suggested time warp: 1×.

()  OUTPUT below 5 MW

Background

Taking the load off the turbine first means the scram happens with no electricity on the generator. The reactor follows the falling steam demand down by itself.

[HIGHLIGHTED: Turbine Load (pulsing)]



2. Shut the reactor down with a planned scram.

2a. Press SCRAM on the ROD CONTROL card: once to arm it (PRESS TO ARM), then again to scram.

Suggested time warp: 1×.

()  CONTROL ROD POSITION 0 of 627
()  SHUTDOWN ROD POSITION 0 of 627
()  REACTOR POWER falling below 5 %

Background

A planned scram from low power. Both rod banks drop into the core and the chain reaction stops in seconds. The fuel keeps making about 2 % of full power from radioactive decay, and that heat has to go somewhere; the next step checks where.

[HIGHLIGHTED: SCRAM (pulsing)]



3. Put the decay heat on the steam dump: Mode 3, Hot Standby.

3a. Press AUTO on the STEAM DUMP card until its status reads PRESS.

Suggested time warp: 1×.

()  STEAM DUMP AUTO lit, status PRESS

3b. Then check REACTOR POWER below 1 %, STEAM PRESS holding near 1020 psi, and the STEAM DUMP open a little.

Suggested time warp: 10×.

()  STEAM DUMP open, carrying the decay heat
()  REACTOR POWER below 1 %

Background

The chain reaction is gone, but the fuel still makes about 2 % of full power from radioactive decay, and REACTOR POWER does not show it. With the turbine tripped, AUTO puts the steam dump into pressure-holding mode and it carries that heat to the condenser. Hot, at pressure, shut down: Mode 3, Hot Standby.

[HIGHLIGHTED: Steam Dump (pulsing); Tavg, SG Pressure (steady)]



## Notes — agent record, NOT step text

### Reconcile record — 2026-09-24, wt-shutdown lane (ported to the new format)

*Owner directive, 2026-09-24: "Adopt the format for the other walkthroughs." Reference format:
`02_mode3_to_mode1.md`. The pool block is `pwr_shutdown` in `ui/manual_procedures.js` (PWR2 pool);
the two copies are word-for-word identical.*

**Tally.** 3 steps (count kept), 4 lettered substeps, 7 check-off lines.

**GOAL LINES — AGENT-DRAFTED FOR OWNER REVIEW.** His old step lines are now the substep actions;
these three lines are new:
- 1. "Take the load off the generator before the scram."
- 2. "Shut the reactor down with a planned scram."
- 3. "Put the decay heat on the steam dump: Mode 3, Hot Standby."

**What moved, nothing rewritten.**
- 1a and 2a are his step lines verbatim. Step 1 stays ONE substep: "wait for OUTPUT" is not a
  second action — OUTPUT falls below 5 MWe within 0.7 s of the LOAD 0 press (measured below).
  Step 2 stays ONE substep: arm-then-press is one guarded control, not two goals.
- 3a is his step line; 3b is his old Note ("Then check …"), kept whole as the action, "Then"
  included. His three check-off lines split one to 3a, two to 3b.
- His old "Control / Target" lines are gone from this file (the format has none); the sim keeps
  `control`/`target` unchanged. Step 2's Target ("both rod positions 0 of 627; REACTOR POWER
  falling below 5 %") became its three check-off lines — "both rod positions" split into one
  line per bank, since each row grades one gauge.

**Grading changes** (live checklist, full stack; chained = `pwr_lower_power` replayed then this
leg played; standalone = the leg's own `hot_full_power` start, which the precondition warns on):

| row | before | now | measured |
|---|---|---|---|
| 1a OUTPUT | `< 5` MWe | `< 4.5` | tile draws whole MWe, so 4.5-4.99 still reads "5". Chained seeds 42/7: 14.6 -> 0.65 MWe inside 0.7 s of the press, same broadcast at either threshold; standalone 100.1 -> 0.64 in 1.1 s. Never met on entry. |
| 2a CONTROL / SHUTDOWN ROD POSITION | — (Target text only) | NEW, each `< 0.5` steps | chained seed 42: 566/627 -> 411/357 at 0.8 s after the scram, both 0 by 2.9 s; seed 7 (scram 40 s into the step): 0 by 3.0 s; standalone 606/627 -> 0 by 3.0 s. Not met on entry. |
| 2a REACTOR POWER | `< 5` % | `< 4.95` | tile draws one decimal. Chained 12.9 -> 2.8 % in 0.8 s; standalone 96 -> 4.6 % in 3.0 s. Not met on entry (12.9 / 96.4 %). |
| 3a STEAM DUMP AUTO | `steam_dump_auto > 0` + the AUTO press | unchanged (INHERITED, #697) | met at entry on every route: the lamp is lit from the preset lineup. |
| 3b STEAM DUMP open | `> 0.5` % | unchanged (INHERITED) | graded on truth; at the tick the tile read "1" (instrument 1.43 %, chained seed 42). |
| 3b REACTOR POWER | `< 1` % | `< 0.95` | chained: already 0.28-0.48 % at entry; standalone: met 39.6 s into the step (0.93 %). |

**⚠ STEP 3 IS HOLLOW ON THE INTENDED ROUTE, AND 3a's "status PRESS" IS NOT WHAT IT GRADES.**
Measured, chained route, seeds 42 and 7, scram 5 s and 40 s into step 2: all three step 3 rows
are met 0.3 s after entry and the step completes with the STEAM DUMP status reading **TAVG**. It
reads PRESS only after the AUTO press. So the player is checked off before he does the one thing
the step asks. Grading the word needs a numeric param for `control_state.steam_dump_mode` in
`layers/instructor_layer.js` — shared runtime, held back for the owner (see the report). #697
deliberately made the press optional because the plant already did the press's *effect*; for the
PRESS status word that premise does not hold — the plant never selects pressure mode by itself.

**STEAM PRESS "near 1020 psi" — measured, his number stands.** 600 s after step 3: 1019-1022 psi
(7.03-7.05 MPa) with PRESS selected (chained and standalone); 1026-1029 psi left in TAVG. At the
moment step 3 completes on the chained route it reads 1004 psi, still rising.

**Speed provenance.**

| substep | rung | provenance |
|---|---|---|
| 1a | 1× | MEASURED: acceptance lands 0.7 s (chained) / 1.1 s (standalone) after the press; nothing for a faster rung to skip |
| 2a | 1× | MEASURED: every row met within 3.0 s of the scram |
| 3a | 1× | a press |
| 3b | 10× | MEASURED, `tools/glance_rung.js pwr_shutdown 3`: worst REACTOR POWER change in one 2.5 s glance 0.181 % at 10× (0.108 % at 5×), under the 0.186 % accepted for `pwr_startup`'s 10× step. On the chained route 3b is met on arrival, so the rung never applies; standalone it covers the ~40 s wait for power under 1 % |

No rod or load walk inside a substep: LOAD is typed, and it steps down at once (the dial walks
raises only).

### Reconcile record — 2026-09-24, rp_dump lane (step 3a graded on the dump MODE)

*OWNER RULING, 2026-09-24, selected "Grade the mode": "Give the grader a numeric 'dump in pressure
mode' value so PRESS is actually required. This is a small shared change and reverses #697's
'press optional' for these rows."* No step text changed; the pool block and this file stay
word-for-word identical.

**What changed.** 3a's row "STEAM DUMP AUTO lit, status PRESS" grades `steam_dump_press_mode`
(was `steam_dump_auto`, the lamp, lit in TAVG too). The param is DERIVED in
`layers/instructor_layer.js` from `control_state.steam_dump_mode` — 1 only when the card's status
word reads PRESS, the same test the board uses — so no `true_state` field and no contract line.
The row keeps its AUTO command half.

**Measured** (live checklist, full stack, seed 42; standalone = `hot_full_power`, chained =
`pwr_lower_power` replayed first):

| route | step 3 entry | AUTO never pressed | after the AUTO press |
|---|---|---|---|
| standalone | status TAVG, row unmet | 122 plant-s later: TAVG, row unmet, both 3b rows met, Continue dark | PRESS; row met and Continue lit on the next broadcast |
| chained | status TAVG, row unmet | 123 plant-s later: same | same |

The hollow tick in the ⚠ paragraph above is gone: step 3 now waits for the press on both routes.
Injection (`run_checklist_pwr2_b`): the old lamp grading planted back ticks step 3 with no press.
Route harness: the new `dump_auto_late` route (press after 120 s) completes in 2.4 plant-min
against the typical route's 1.1.
