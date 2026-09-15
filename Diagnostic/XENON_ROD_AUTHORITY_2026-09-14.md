> **Record, not policy.** Measurement session of 2026-09-14 against `develop` at `62553fe8`,
> opened by an owner playtest report. Every number below was produced on this tree by a script
> named in its finding; nothing here is inherited from a document. Filed as GitHub issue
> **#752**. Related: **#734** (the settled full-power point), **#749** (the 2026-09-14 layman
> pass on `pwr_startup`), **#724** (the 1.7.4-RC19 playtest).

# The power-ascension walkthrough leaves the player on a boron setting the control bank cannot hold

**The owner's report** *(OWNER, 2026-09-14: "did the layman tester run into an issue where one
xenon hit 100% it ran out of Ron's control? This happened to me in the playtest I just did. With
boron at the level it has me set it too I pull rods as xenon climbs and I ran out of rod steps and
had to move boron.")* — "Ron's" is a typo for "rod's".

**Verdict: confirmed, and the plant is worse than the report.** The bank runs out. Nothing on the
board says it has. And the consequence the walkthrough attaches to not trimming ("about 40 °F
cold") is measured at **100.79 °F and a reactor trip**.

---

## 1. The authored leg, as built

Read off `RD.MANUAL_PROCEDURES.pwr2`, not off the source file:

| | |
|---|---|
| Last boron action | **step 3**, `{action:'set_auto_setpoint', channel_id:'boron_conc', value:660}` |
| Steps 4–8 | rods + load target, no boron |
| Step 9 | observation only; one acceptance is `boron_ppm < 680` |
| Step 10 | `rod_nudge +6 normal`, `hold 3600`, acceptance `control_bank_steps > 355` |
| Step 11 | **last step**; whole acceptance is `mwe_output > 97`, no `cmd`, no `hold` |

Steps naming boron as an *action*: **step 3 only** (`cmd` + a cmd-kind `accs` entry). Step 9 names
it as a *reading*. Nothing else in the leg touches boron.

**Saw:** step 11 declares the leg complete the instant it opens.
**Measured:** at the leg's own end state `mwe_output` = **100.00** against the acceptance
`mwe_output > 97` (`scratchpad/rig.js`, full stack via `RD.ProceduresHarness.runProcedure`). Step 11
carries no `hold`, so the step opens and is already satisfied.
**Verdict:** confirmed — the leg's only instruction to dilute the remaining boron lives in step 11's
explanatory `why`, with no command and no acceptance behind it.

**PWR2 has no rod automation channel.** Measured on a live snapshot: `automation.channels` carries
exactly **`boron_conc`** and **`afw_level`**. The control bank is manual-only, so the plant will
never rescue a player who runs out of rod.

---

## 2. Does the bank actually run out? — YES

**Saw:** the owner ran the bank out of travel and had to move boron himself.
**Measured** (`scratchpad/rig.js` — the authored leg replayed full-stack from its own `low_power`
IC, then continued past the end trimming **rods only**, ±2 steps per plant-minute toward the
580 °F programme, `svc.running = true`, `timeAcceleration = 10`, `attentionStops = false`):

| | |
|---|---|
| Leg end | `rod_steps` **357.0**, `control_state.rod_groups[control_rods].steps` **357.0** (two independent reads agree), boron **659.7 ppm**, T-avg **581.12 °F**, xenon **17.9 %** of equilibrium |
| Replay score | **31 checks, 0 failures** — the authored leg passes cleanly |
| **Bank out of travel** | **+24.37 h of plant time after the leg completes** |
| At that instant | bank **627.0 / 627**, T-avg **579.38 °F** against `tref_c` **580.10 °F**, xenon **84.8 %**, boron still **659.7 ppm**, `rod_stop` **false** |

**Verdict:** confirmed. The player runs out of rod with **15.2 % of the xenon transient still to
come**, roughly a plant-day into the hold that step 11 tells them to keep up "for the next two
plant-days".

### Independent corroboration without the 24 h ride

`scratchpad/board_at_wall.js` / `exhaust_fast.js` start from `hot_full_power` — which **is** the
settled point: **606 / 627 steps, 612.3 ppm, xenon 100.0 %, T-avg 580.22 °F** (measured off the
booted IC, and the same numbers #734 reports). Borate back to the walkthrough's **660 ppm** and trim
rods only:

- The bank reaches **627 / 627 and is still cold at +12.1 min**, boron only up to 648.7 ppm.
- It stays pinned there. T-avg settles at **555.3 °F** and is flat for eleven plant-hours
  (555.30 / 555.27 / 555.26 / 555.30 / 555.36), power steady at 99.5 %.
- **That is 24.8 °F below the 580.1 °F programme, permanently, with every rod out.**

At equilibrium xenon the bank has only 21 steps of travel above 606, and 660 ppm is **outside its
authority by a wide margin** — not marginally.

---

## 3. How far short the leg's end state is

| | leg end | settled point (`hot_full_power`) | short by |
|---|---|---|---|
| Control bank | 357 / 627 | **606 / 627** | **249 steps** |
| Boron | 659.7 ppm | **612.3 ppm** | **47.4 ppm** |
| T-avg | 581.12 °F | 580.22 °F | both on programme |

Both ends sit *on* programme, so the shortfall is not a temperature error at the leg's end — it is
**un-dealt-with reactivity that comes due over the following day**. Expressed in °F:

- **Boron worth, measured** (`worth.js`, 1 plant-hour, control-subtracted against a do-nothing run
  over the same window, no scram, power steady at 100.72 %): **−0.5699 °F/ppm**. The 47.4 ppm the
  walkthrough never dilutes is therefore **27.0 °F** of reactivity.
- **Residual the player cannot remove with rods:** **24.8 °F** below programme (§2).

### Rod worth is strongly position-dependent, and the two authored numbers use different ends of it

**Measured** (`worth_top.js` and `worth2.js`, both control-subtracted over 1 plant-hour):

| bank position | +10 steps | +21 steps | +20 steps |
|---|---|---|---|
| **606** (top, `hot_full_power`) | 0.2247 °F/step | **0.2225 °F/step** | — |
| **357** (leg end, mid-bank) | 0.5199 °F/step | — | 0.5087 °F/step |

- **Step 11's arithmetic is right.** It says the last 21 steps are "worth 4.6 °F". Measured:
  **4.67 °F**. Verdict: **confirmed.**
- **Step 10's arithmetic is conservative, not wrong.** It says "each rod step is worth about
  0.22 °F and the bank has 255 to go, which is 56 °F". 0.22 is the *top-of-bank* differential
  worth applied across a 255-step span where mid-bank worth measures **2.3× higher**. Verdict:
  **narrowed** — the sentence understates what the rods can do, which is why they hold programme
  for 24.4 h rather than the ~one day 56 °F would imply. Conservative direction; low priority.

---

## 4. What the player sees while it happens — NOTHING

**Saw:** step 10's note says "ROD LIMIT LO-LO is lit and that is normal". The owner's report says
he discovered the problem by running out, not by being told.
**Measured:**

1. **The alarm registry has no high-side bank row at all.** All 98 rows enumerated
   (`RD.PWR_PROTECTION.alarms` + `alarms_panel_a` + `alarms_panel_b`); every rod-related row is
   low-side or an OTΔT/OPΔT rod stop:

   | id | instrument | direction | setpoint | label |
   |---|---|---|---|---|
   | `rod_limit_approach` | `rod_limit_margin` | low | 40 | ROD LIMIT LO |
   | `rod_limit` | `rod_at_limit` | is_true | — | ROD LIMIT LO-LO |
   | `otdt_approach` | `otdt_margin` | low | 3 | OTΔT ROD STOP |
   | `opdt_approach` | `opdt_margin` | low | 3 | OPΔT ROD STOP |

   `rod_at_limit` is the **insertion** limit. There is no indication for the top stop.

2. **At the top stop the board is silent.** Driven to 627 / 627 from `hot_full_power`: **zero
   active alarms**, `rod_stop` **false**, `at_insertion_limit` **false**.

3. **WITHDRAW is accepted, not refused.** `handleCommand({action:'rod_nudge', group_id:'control_rods',
   steps:5})` at 627 / 627 **returned a snapshot — no refusal, no throw** — and the bank moved
   **0.00 steps** over the following 300 s.

4. **At the moment of the wall in the rods-only run**, with the plant genuinely cold and the player
   genuinely pressing: bank 627 / 627, T-avg 564.09 °F, boron 648.7 ppm, **WITHDRAW → "ACCEPTED, no
   refusal", `rod_stop` false, and no alarm had come on at any point up to that instant.**

5. **Six plant-hours at the wall, fully instrumented** (`board_at_wall.js`, every alarm transition
   logged, every WITHDRAW return value checked):

   | | |
   |---|---|
   | WITHDRAW presses while cold and on the top stop | **358** |
   | of those refused (error, blocked, or throw) | **0** |
   | ticks with `rod_stop` true | **0** |
   | alarm on-transitions during the whole 6 h | **0** |
   | alarms standing at the end | **none** |
   | end state | bank 627 / 627, boron 659.6 ppm, T-avg **555.25 °F**, `tref_c` **580.10 °F**, **deficit 24.85 °F**, power 99.56 %, output 100.0 MWe, PZR level **34.2 %** |

   The pressurizer level deviation alarms stay dark because the **level programme tracks T-avg** —
   a cold plant's low level is "on programme" by construction, so `pzr_level_dev_low` never sees a
   deviation. `pzr_level` 34.2 % is between the absolute `pzr_level_cutoff` (17) and
   `pzr_level_high` (75), so no absolute row fires either.

6. **The whole 60 plant-hours of the FAITHFUL route, every annunciator transition logged**
   (`rig.js`, the authored leg replayed then trimmed rods-only, run to completion). **Three board
   events in sixty hours, and the last one is at +9.27 h:**

   | when | event | bank |
   |---|---|---|
   | +0.30 h | `rod_stop` momentarily **true** (early transient) | 356.6 |
   | +8.64 h | ROD LIMIT LO-LO (`rod_limit`) goes **off** | 440.6 |
   | +9.27 h | ROD LIMIT LO (`rod_limit_approach`) goes **off** | 449.0 |

   After +9.27 h the annunciator panel **never changes again** — not through the wall at +24.37 h,
   not out to +60 h. The last thing the panel ever did was an alarm *clearing*, **15.1 h before the
   bank ran out.** End state at +60 h: bank 627 / 627, T-avg **556.02 °F** vs `tref_c` 580.10 °F —
   a **24.08 °F deficit** — xenon 99.6 %, power 99.94 %, output 100.0 MWe. That is within 0.8 °F of
   the 24.85 °F measured by the independent `hot_full_power` route in item 5, so **two routes agree
   on the residual.**

**Verdict:** confirmed, and it is the worst half of the defect. The only thing on the board that
changes is the CONTROL ROD POSITION readout reading 627. **The plant makes full power ~24 °F below
programme with a completely dark annunciator panel, 358 consecutive WITHDRAW presses are accepted
without one of them moving a rod or returning a refusal, and the last annunciator event of any kind
happened 15 hours before the bank ran out — an alarm going out, not coming on.**

---

## 5. The consequence of not trimming is a REACTOR TRIP, not "about 40 °F cold"

Step 10's `why` and the leg's `outcome` both say: *"left alone it ends up about 40 °F cold, taking
PZR LEVEL with it."*

**Measured** (`donothing.js` — from the leg's own end state, no rod motion, no boron motion, boron
left at the 659.7 ppm the walkthrough set):

| | |
|---|---|
| +0 h | T-avg 581.11 °F, xenon 17.9 % |
| +4 h | T-avg 564.75 °F, xenon 28.2 % |
| +8 h | T-avg 539.32 °F, xenon 42.9 % |
| +12 h | T-avg 512.54 °F, xenon 56.9 % |
| +16 h | T-avg 488.42 °F, xenon 68.6 % |
| **+17.23 h** | **SCRAM — `sg_lolo_level`** |
| minimum | T-avg **480.33 °F** — a **100.79 °F** drop |

**Verdict: refuted.** "About 40 °F cold" is passed at roughly +8 h and is not where it ends up. Left
alone this plant **trips on steam-generator low-low level in 17.2 plant-hours**. Power holds at
100 % throughout (100.82 → 100.07 %), so the player watching REACTOR POWER sees nothing wrong.

---

## 6. The one-shot dilution claim STILL HOLDS

Step 11's `why`: *"Type 617 in one go and the plant heats far faster than xenon can absorb it:
measured, that trips the reactor on overtemperature."*

**Measured** (`oneshot.js` — from the leg's end state, `boron_conc` setpoint driven to 617 in one
command, no rod motion afterwards):

| | |
|---|---|
| HI TAVG | +19.3 min |
| OTΔT ROD STOP (`otdt_approach`) | +21.7 min |
| SG PRESS HIGH | +25.4 min |
| **REACTOR TRIP — `ot_delta_t`** | **+25.7 min** |
| peak T-avg | **603.42 °F** at +25.5 min |
| boron reached when it tripped | only **629.7 ppm** of the 617 asked for |

**Verdict: confirmed**, on this tree, with the number. The claim is sound and should stay.

*Secondary observation, not filed as a defect:* `high_tavg` logged 6 on-transitions in 36 s and
`otdt_approach` ~20 in four minutes — the rows chatter rather than latch.

---

## 7. Dilution rate and the cost of the walkthrough's own advice

**Saw:** step 3's `why` says *"Dilution runs at about 3 ppm a minute."*
**Measured** (`boron_dose.js` / `dilute_ladder.js`, at the leg's end state):

| dose | plant-time to deliver |
|---|---|
| 660 → 650 | **472 s** (7.87 min) |
| 650 → 640 | 519 s |
| 640 → 630 | 536 s |
| 630 → 620 | 397 s |
| 620 → 617 | 157 s |

A 10 ppm dose takes **472 s**, i.e. **1.27 ppm/min** — **2.4× slower than the authored "about
3 ppm a minute"**. **Verdict: refuted.**

660 → 617 in 10 ppm doses is **5 doses**. Pure delivery time, back to back with no settling wait:
**2081 s = 34.7 min**. That figure is a floor and not a usable route — driven back to back at the
leg's end state with no rod compensation, T-avg reached 603 °F and the plant went unstable, the
same mechanism §6 records.

---

## 8. `control_bank_steps` is a LIVE acceptance — the dead-name hypothesis is REFUTED

Steps 8 and 10 grade on `control_bank_steps`, which `getTrueState()` does **not** publish
(`true_state.control_bank_steps` is `undefined`). It resolves anyway, through
`InstructorLayer.paramValue`'s `ROD_PARAMS` map → `control_state.rod_groups[control_rods].steps`
(`layers/instructor_layer.js` :1009). `test/procedures_harness.js` grades through the same one
resolver (`pv()` → `RD.InstructorLayer.paramValue`), so the gate and the live runtime read the same
number.

**Proved by injection**, both directions (`inject_cbs.js`, in-memory mutation of the built pool):

| run | result |
|---|---|
| baseline | 31 checks, **0 FAIL** |
| value → `> 99999` | 31 checks, **3 FAIL**, each reporting an observed value: step 8 `obs 351`, step 8 `obs 351`, step 10 `obs 357` |
| name → `control_bank_steps_NOPE` | 31 checks, **3 FAIL**, **no `obs`** — fails closed, as a missing param should |

**Verdict: refuted.** The acceptances resolve, grade, and report real bank positions. Not a defect.

---

## 9. Why no gate caught any of this

`node test/run_checklist_pwr2.js pwr_raise_power` → **34 passed, 0 failed.** Every acceptance in the
leg is satisfied at the leg's end state, including both `control_bank_steps` rows. The gate asserts
that the authored route can be driven to completion; **it asserts nothing about the plant the route
hands back**, and the stranding happens 24 h after the last acceptance. HR10 in its usual shape: the
suite is green and the mechanism is wrong.

Nothing else covers it either — no runner asserts that the walkthrough's end state can reach xenon
equilibrium, and `xenon_pct_eq` appears in the test tree only as a recorder field and a warp-tier
tolerance.

---

## 10. Recommendation

**The leg must issue the first dilution dose as a graded step, and the board must say when rod
authority is gone.** Costed:

1. **(required, small) Give step 11 a command and an acceptance**, or insert a step 11 before the
   present observation step. The pattern already exists three files away —
   `pwr_lower_power` step 1 is exactly this shape:
   `cmd: {action:'set_auto_setpoint', channel_id:'boron_conc', value:719}, hold:30`. Here:
   `value: 650` (the first 10 ppm dose), acceptance `boron_ppm < 655`, plus
   `control_bank_steps > 500` so the step cannot check off before the rods have done their share.
   The BORON card is on the board with an ON/OFF and a ppm box, so it is reachable and observable
   (DESIGN_CRITERIA Q3 and Q4 both pass). **Cost: one step in `ui/manual_procedures.js`, a manual
   revision row, `tools/stamp_manual_revision.js` + `tools/pack_manuals.js`, and a re-run of
   `run_checklist_pwr2` / `verify_ckl_relevance`.**
2. **(required, small) Correct step 10's and the `outcome`'s "about 40 °F cold" to the measured
   consequence** — a 100.79 °F drop and an SG low-low scram at +17.2 plant-hours. This is a
   player-facing unmeasured claim (§5) and the strongest argument for doing the trim.
3. **(recommended, medium) Add a high-side rod indication.** A `rod_bank_high` /
   ROD LIMIT HI annunciator on `control_bank_steps` near the top stop, or at minimum a refusal on
   WITHDRAW at 627 so the press does something visible. Today the board is silent and the command
   is accepted. **Cost: one alarm row in `layers/control/pwr_control.js`, an instrument to hang it
   on, a board tile entry, `run_manual_setpoints` map row.** Needs an owner ruling on
   prototypicality — a real plant's rod-withdrawal-limit annunciator would want an evidence pass
   before the setpoint is chosen.

**Not implemented here.** This session was measurement and filing only; `ui/manual_procedures.js`,
`test/` and `Blueprint/` were owned by another agent in this tree today.

---

## 11. What was NOT verified

- **The full "followed literally" dilution route from the exhausted state** — 10 ppm at a time
  *with* a settling wait and rod trim between doses, measured end to end. Only the delivery times
  (§7) and the back-to-back total were measured; the realistic wall-clock of the whole remedy is
  unmeasured.
- **The live UI.** Everything here is full-stack Node (`SimulationService` + `InstructorLayer`). The
  rendered panel, the Continue button's behaviour on step 11, and what the CONTROL ROD POSITION tile
  draws at 627 were not observed in a browser.
- **Whether the layman tester in #749 hit this** — the owner's question. That pass covered
  `pwr_startup`, not `pwr_raise_power`, and the report was not re-read for it.
- **Prototypicality of the 660 ppm setting itself.** No evidence pass was run on whether a real
  plant would leave an ascension at a boron concentration its bank cannot hold; the finding is that
  *this* plant cannot, not that the number is unprototypical.
- **The rod-withdrawal rate limit.** A single 50-step `rod_nudge` at the leg's end state scrammed
  the plant (`worth.js`, first attempt) — noted and worked around with 10/20-step nudges, not
  characterised.
