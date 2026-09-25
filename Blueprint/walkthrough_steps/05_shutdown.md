# Shutdown to Mode 3, Hot Standby

**Walkthrough id: `pwr_shutdown`  ·  3 steps**

> This is the LIVE step file: the sim's `pwr_shutdown` walkthrough is brought down to it, word for
> word. Edit it freely — it is the step text.
>
> **The format** (OWNER RULING, 2026-09-24: "I like putting the why where you put it. i choose
> a."; model: `02_mode3_to_mode1.md` steps 1-3). Line one of a step is WHAT the step accomplishes,
> never how. Directly under it, one italic line says WHY. Each lettered substep is HOW: it opens
> with a verb, and it is its own check-off, drawn `()`. **Suggested time warp** appears once per
> step, or under a substep only when the substeps differ. A Note follows the warp it belongs to.
> Background closes the step. Agent notes go at the END of the file, never between the steps.

---

1. Take the load off the generator before the scram.

*The scram should come with no electricity on the generator, so the load comes off first.*

()1a. Set LOAD to 0 MW and wait for OUTPUT to fall below 5 MW.

Suggested time warp: 1×.



Background

Taking the load off the turbine first means the scram happens with no electricity on the generator. The reactor follows the falling steam demand down by itself.

[HIGHLIGHTED: Turbine Load (pulsing)]



2. Shut the reactor down.

*Hot Standby is a shut-down reactor, and with the load already off a scram gets it there in seconds.*

()2a. Press SCRAM on the ROD CONTROL card: once to arm it (PRESS TO ARM), then again to scram.

()2b. Check CONTROL ROD POSITION and SHUTDOWN ROD POSITION both read 0 of 627.

()2c. Check REACTOR POWER is falling below 5 %.

Suggested time warp: 1×.



Background

A planned scram from low power. Both rod banks drop into the core and the chain reaction stops in seconds. The fuel keeps making about 2 % of full power from radioactive decay, and that heat has to go somewhere; the next step checks where.

[HIGHLIGHTED: SCRAM (pulsing)]



3. Put the decay heat on the steam dump: Mode 3, Hot Standby.

*The fuel keeps making heat after the scram, and with the turbine off line the steam dump is where that heat leaves.*

()3a. Press AUTO on the STEAM DUMP card until its status reads PRESS.

Suggested time warp: 1×.

()3b. Check REACTOR POWER reads below 1 %.

()3c. Check STEAM PRESS is holding near 1020 psi.

()3d. Check the STEAM DUMP is open a little.

Suggested time warp: 10×.



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

### Reword record — 2026-09-25, `exp/w6-shutdown` scratch lane: the what / why / how format

*OWNER RULING, 2026-09-24, selected "Yes, all five": "Opus agents restyle heatup, raise, lower,
shutdown and cooldown to match, using your Mode 3 → Mode 1 steps 1–3 as the model. Measured
numbers stay; the gates and a layman pass confirm."* The shape is `02_mode3_to_mode1.md` record
(h). **Phase 1, this file only: the `pwr_shutdown` pool block in `ui/manual_procedures.js` is NOT
brought down yet**, so the "word-for-word identical" line in the header and in the first reconcile
record above is false until phase 2.

**Counts.** 3 steps (kept). Before: 4 lettered substeps, 7 check-off lines hung under them. After:
8 lettered substeps, each its own check-off (1 + 3 + 4). No number changed.

**What moved.**
- Step 1: unchanged except the new why line. 1a stays ONE substep — "Set … and wait for …" is the
  same action-until-reading shape as the model's 7a ("Hold … until …"); OUTPUT falls within 0.7 s
  of the press (measured above), so a separate wait would tick on the same broadcast.
- Step 2 first line "Shut the reactor down with a planned scram." -> "Shut the reactor down." (the
  scram is HOW; it is 2a and the Background's first words). 2a is his line verbatim. His three
  check-off lines became 2b (both rod positions, one substep — they fall together, 0 by 3.0 s) and
  2c (REACTOR POWER).
- Step 3: 3a verbatim. His old 3b ("Then check REACTOR POWER below 1 %, STEAM PRESS holding near
  1020 psi, and the STEAM DUMP open a little.") split into 3b / 3c / 3d in his order, "Then"
  dropped. Warps differ (3a 1×, the checks 10×), so each group carries its own.
- Why lines are new and AGENT-DRAFTED FOR OWNER REVIEW. Each is drawn from that step's own
  Background; none carries a number the Background does not.

**Needs an acceptance in phase 2** (substeps with no grading row today):
- **2a** (press SCRAM) — the rod rows now grade 2b. Grade 2a on the scram itself (the reactor
  trip / scram latch in the service state), so it ticks at the press and 2b ~3 s later.
- **2b** carries TWO existing rows (CONTROL and SHUTDOWN ROD POSITION, each `< 0.5`); it ticks
  when both are met. Phase 2 must merge them into one substep's acceptance.
- **3c** (STEAM PRESS near 1020 psi) — never graded; it was only in the old note-turned-action.
  Measured above: 1019-1022 psi (7.03-7.05 MPa) 600 s in with PRESS selected, but 1004 psi and
  still rising when step 3 completes on the chained route — outside a ±15 psi band, so a band
  that tight would hold the player there. Measure the wait before choosing it.

Existing rows map 1a -> OUTPUT `< 4.5`; 2c -> REACTOR POWER `< 4.95`; 3a -> `steam_dump_press_mode`;
3b -> REACTOR POWER `< 0.95`; 3d -> dump `> 0.5` %.
