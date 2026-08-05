# CURRICULUM.md — what each plant is supposed to teach

> **STATUS — MIXED, read per tier.** *(OWNER, 2026-08-02: "We also need to define the educational
> goals.")* Drafted **from what the repo already implies**, not invented. **PWR only** — RBMK and
> BWR are on hold and their tiers cannot be written honestly before their evidence passes exist
> (`DESIGN_CRITERIA.md` §5).
>
> | Tier | Status |
> |---|---|
> | **A** dynamics | **RULED 2026-08-03** — binding for the PWR, all nine couplings |
> | **B** procedures | **RULED 2026-08-03** — binding for the PWR. **Read the completeness note**: the evolution list is a subset and a second pass is owed |
> | **C** casualties | **RULED 2026-08-03** — binding for the PWR. See the Core/Covered split below |
> | **D** flagship | adopt as-is (`DESIGN_COMPANION.md` §5) |
>
> **All four tiers are now settled for the PWR** *(OWNER RULING, 2026-08-03: "Tier A looks good,
> make it so. Tier b looks good, also make it so.")*. RBMK and BWR remain undrafted and on hold.

**What this is for.** `DESIGN_CRITERIA.md` Q2 asks *"what is the educational value?"* — a question
that cannot be answered until there is a stated objective to answer it against. This file is that
objective. Split out of `DESIGN_CRITERIA.md` §6 on 2026-08-03 because it is a different artifact:
that document is plant-agnostic, this one is **per-plant** and grows with every plant added.

**Four things, per plant** *(OWNER, 2026-08-02: "We should define several things for each of the
plants. 1. The dynamics/interactions we want to show and their physics. 2. The normal operating
procedures we want the user to be able to perform. 3. What casualties we want the user to be able
to handle. 4. Defining/flagship scenarios (TMI, Chernobyl, etc.). These don't necessarily have to
be real events.")*:

| | Category | Tier | Status |
|---|---|---|---|
| 1 | **Dynamics / interactions** and their physics | A | **RULED 2026-08-03**, PWR |
| 2 | **Normal operating procedures** | B | **RULED 2026-08-03**, PWR |
| 3 | **Casualties** the user should handle | C | **RULED 2026-08-03**, PWR |
| 4 | **Flagship scenarios** — need not be real events | D | adopt existing |

**The priority is fixed** *(OWNER RULING, 2026-08-02: "The most important ideas are plant dynamics
followed by how to operate the plant.")* — category 1 leads, category 2 second; 3 and 4 are where
those two get exercised under stress. Instrument deception is **not** near the top; see Tier A.

---

## The goal, in the owner's words

> *(OWNER, 2026-08-02: "The point of the sim is in the name. I want to teach people plant
> dynamics. They should learn the dynamics between the different components. For example, power
> follows load in a PWR. You can demonstrate this with rods in manual and lowering the generator
> demand. You see power drop to match demand and t-avg rise… These kind of dynamics,
> relationships and physics of the plant are what I want to teach.")*

**Dynamics is the PRIMARY goal — and procedure is a second one, not a subordinate one** *(OWNER,
2026-08-02: "Plant procedure is still something I want to teach so there are some systems that
don't reveal dynamics in my pwr sim but I included them because they are important for
procedure.")*. Tier A is what the player *understands*; Tier B is what they *do*, including
systems that reveal no coupling at all.

**A feature has THREE routes to Q2 credit and needs exactly one:**

> **DYNAMICS ROUTE — a DEMONSTRATION.** [what you change] → [what responds] → [the mechanism],
> with board actions and MEASURED numbers. An **indication** with no action qualifies when it is
> the named **cue of a Tier C diagnosis** (tailpipe temp; charging flow, #262).
>
> **PROCEDURE ROUTE — a STEP.** Required by a real plant procedure (sourced, per Q1) and named by
> an authored checklist, mission or beat.
>
> **TRAINER AFFORDANCE — apparatus, declared as such.** Justified by a named pedagogy principle in
> `DESIGN_COMPANION.md` §3 and declared part of the *trainer*, not the plant. Exempt from Q1 by
> construction; **not** exempt from Q0 or Q3.
>
> **None of the three ⇒ no Q2 credit**, and a non-prototypical, board-complicating feature with no
> Q2 credit fails on Q3 alone.

The third route is a **correction** (#312): with only two, this document condemned the true-state
overlay, the trend graphs, the Learning register and instructor highlights — all deliberate, none
prototypical. A2's own demonstration invokes the comparison principle, and the board's reactivity
readout reads `true_state` directly, so the route was already in use.

This is also what makes the orphan-control test precise: an orphan is damning for a
**procedure-bearing** system, because being named by a step IS its justification — while a
dynamics-bearing control justifies itself by demonstration and may never appear in a checklist.

---

## Tier A — the core dynamics

Each row is a coupling, its mechanism, and how it is demonstrated. All nine are **already
modelled**; measurements are full stack, `hot_full_power`, free-play lineup.

| # | Coupling | Mechanism | Demonstration |
|---|---|---|---|
| **A1** | **Power follows load** | negative **moderator temperature coefficient**, balanced by Doppler | rods to MANUAL, drop generator demand 100 → 60 MWe. **Measured:** power **100 → 57.5 %** with nobody touching the rods, Tavg **579.3 → 602.1 °F (304.1 → 316.7 °C)** |
| **A2** | **Tavg is the coupling variable** — what the rod controller exists to hold | the rod channel trades Tavg error for rod motion | run A1 with rods in AUTO and compare the excursion (the comparison principle) |
| **A3** | **Pressure follows temperature; subcooling is the margin** | the pressurizer holds the primary liquid as Tavg moves | PWR-N15 walks Dump SP and Pressure SP down **together**, holding 63 °F (35 °C) subcooling |
| **A4** | **Level is not inventory** | shrink/swell; the level *program* moves with Tavg | pzr level rises on a load rejection with inventory unchanged |
| **A5** | **The SG is the primary's only heat sink** | lose feed and Tavg climbs whatever the rods do | loss of feedwater; AFW starts |
| **A6** | **A reactor cannot be switched off** | decay heat; subcritical ≠ cooled down | post-scram tail; the Mode 5 cooldown; SBO |
| **A7** | **Xenon is a slow, invisible reactivity load** | ¹³⁵I decays to ¹³⁵Xe faster than flux burns it out, so poison *builds* after a power cut | run A1 and wait. **Measured:** `xenon_pct_eq` **100.0 → 104.9 %** peaking at **4–5 h**, back through **98.6 %** at 12 h — **−123 pcm** then **+159 pcm**, ~4 % of the 4068 pcm bank. **There is no xenon gauge**: the player sees the rods walk out |
| **A8** | **Boron sets WHERE critical is; rods set HOW FAST you get there** | boron is slow, bulk, bank-wide; rods are fast and local | **the live one, and it is board-reachable:** at full power set the BORON target up 618 → 700 ppm and watch. **Measured 2026-08-03, full stack, rods in AUTO:** the control bank withdraws 839 → **912/912 and pegs at its stop** inside ten minutes, then Tavg falls away to **40.6 °F below its own program** because the rod channel has no travel left — 82 ppm of boron outruns the rods entirely, power settles 100 → 75.5 %. *Boron won.* (Also, statically: **#303 record** — 857 ppm → ~561 steps critical, 683 ppm → 319, ~1830 pcm apart.) |
| **A9** | **The gauge moves the wrong way on the SECONDARY side too** | shrink-and-swell: indicated SG level leads on smoothed `power_rate` — an **instrument** effect (`swell_factor` 0.8, `M1` §8.4), not SG void physics | the A1 load drop. **Measured:** at t+10 s the gauge reads **66.40 %** while truth is **68.85 %** and still *rising* to 70.44 — **−2.45 %**, ~4× the ±0.6 % noise band. Why three-element feed exists |

**A1's arithmetic is itself the lesson.** Tavg rose 12.6 °C against a measured MTC of
**−26.8 pcm/°C** → **−338 pcm**; the fuel *cooled* 693 → 551 °C, and at `alpha_D` **−2.5e-5 K⁻¹**
that returns **+355 pcm**. They sum to ≈ 0, which is where the plant settled. *The moderator term
drives power down; the Doppler term comes back as the fuel cools; equilibrium is where they
cancel.* The actor is the **moderator** coefficient, not the void coefficient — the primary is held
subcooled, so there is no bulk void. Void *is* the actor on the RBMK (positive) and BWR (negative),
which is the cross-plant contrast those tiers should carry.

**A7–A9 were missed by the first draft because it derived from what is DEMONSTRATED**, which
silently drops every coupling the plant models and no content ever shows (#312). For the RBMK and
BWR: **enumerate the engine first and subtract.** `boron_trim` would have been A10 — it is
unreachable on the board, so it has no demonstration and cannot carry a row yet.

**Instrument DECEPTION is deliberately NOT a Tier A objective** *(OWNER, 2026-08-02: "I don't want
to focus on instruments lying. It will come up in failure scenarios but I dont know if it should
be a major focus.")*, and the reason is an ordering fact: **you cannot perceive a lying instrument
without already knowing what the plant should be doing.** Taught before the couplings it yields
generalised distrust of gauges instead of diagnosis by cross-check. It is the **payoff** of the
curriculum, not the curriculum — it belongs to Tier C and D.

**HR1 IS UNAFFECTED.** This is about teaching emphasis, not the model. Protection reading
instruments rather than truth is what makes the failure scenarios possible at all, and **a HEALTHY
channel's lag is itself part of the dynamics**, with no failure injected anywhere.

**And the size of that belongs to the CHANNEL, not to the transient** *(measured 2026-08-03 on
`workbench`, full stack, seed 42, healthy channels throughout — an earlier draft of this paragraph
said the lag "changes what the operator sees in **every** Tier A transient", which is not what the
plant does)*. Timing the moment the indicated value crosses a threshold against the moment the
plant does:

| case | channel (lag) | gauge is behind |
|---|---|---|
| **A1 load drop 100 → 60 MWe, Tavg through 590 °F** | `tavg` (**4.0 s**) | **+4.00 s** |
| A1 load drop, power through 80 % | `power_range` (0.1 s) | +0.00 s |
| manual scram from HFP, power through 50 % | `power_range` (0.1 s) | +0.00 s |
| 20 % LOCA, pressure through the **1800 psi reactor trip** | `primary_pressure` (0.5 s) | +0.00 s |

**The slow demonstration shows the largest shift and the fast casualty shows none**, because
`tavg` carries 40× `power_range`'s lag. The claim holds squarely for **A1** — four seconds on the
very variable A1 is about — and does not generalise. **Two effects are in play and they are not
the same**: *timing shift* follows the channel's time constant, while *value divergence* does
follow transient speed (the LOCA reaches 414 psi and 25.6 °F of it). Cite the right one.

The observation layer is in scope; *distrust* as a headline lesson is not.

---

## Tier B — procedure & operations

**The PWR's target evolutions** — this is the list category 2 asks for, and it is the artifact an
automated build needs *before* it can ask which systems earn their place. All eight are authored,
runnable on the board and replayed by `run_procedures_stack`:

| Evolution | Ref | Checklist |
|---|---|---|
| Heatup, Mode 5 → Mode 3 | PWR-N01 | `pwr_heatup` |
| Approach to critical & startup | PWR-T03 | `pwr_startup` |
| Power ascension | PWR-N07 | `pwr_raise_power` |
| Power reduction | PWR-N08 | `pwr_lower_power` |
| Pressurizer pressure control | PWR-N10 | `pwr_pressure_control` |
| SG level control | PWR-N12 | `pwr_sg_level` |
| Shutdown to Hot Standby | PWR-N14 | `pwr_shutdown` |
| Cooldown, Mode 3 → Mode 5 | PWR-N15 | `pwr_cooldown` |

**THE LIST ABOVE IS A SUBSET, and how it was built is the reason** *(the same methodological error
as Tier A and Tier C — see the note under Tier A)*. The eight are **exactly the eight normal
evolutions that already have a runnable checklist**, so the list was derived from what is *built*
rather than from what the plant should teach — which makes ratifying it very nearly a rubber stamp.

**Enumerated from the ENGINE and the full manual set, 2026-08-03** *(OWNER, 2026-08-03: "The
checklists and manuals may not be complete. Check the actual engine to see what it's capable of.")*
— the coverage is wider than the normal-procedure index alone shows:

| | Documented | Runnable checklists |
|---|---|---|
| **N** normal operations | 15 | 7 |
| **T** mode transitions | **19** | **1** (T03) |
| **E** abnormal / emergency | 24 | 3 + the TMI narrative |
| **X** combined | 1 | 0 |
| **total** | **59** | **12** |

**The T family was invisible to the first pass** and it is the one that matters most here:
**PWR-T06, the post-trip response**, is documented and is where PWR-E03 explicitly sends the
operator after a turbine trip above P-9 — with **no runnable checklist**. A reactor trip is the most
common significant event on any plant, and recovering from one is not an authored evolution.

**Engine-side, 63 commands exist and 17 are named by no authored content.** Most are correctly
orphaned — instructor and failure machinery (`inject_failure`, `stuck_control_rod`,
`secondary_depressurize`), the code safeties (deliberately not operator switches) and `set_lpi`
(merged with HPI by a Q3 decision). **Three are real operator capabilities with nothing behind
them**: **`reset_rps`** — board-reachable since #75 and required after *every* scram, named by no
checklist; **`isolate_feedwater`**, which latches with **no board control to restore it** (#305);
and **`set_condensate_pump`**, an engine capability with no board face at all.

**Two of those three are now closed** (2026-08-04). `reset_rps` is step 2 of the PWR-T06 post-trip
checklist (#319 item 1), and `isolate_feedwater` has a **RESTORE** control on the SG FEED card
(#319 item 2) — which also closed **#341**, a defect the audit did not name: the restore, once
issued by any path, was accepted **while the isolating signal was still standing**. The two shipped
together because a guard on an unreachable command is unfalsifiable and a control without the guard
is a defeatable protection function. `set_condensate_pump` is still open.

Seven documented *normal* evolutions have no row:

| Procedure | | Note |
|---|---|---|
| **PWR-N02** | Mode 3, Hot Standby — plant lineup | |
| **PWR-N04** | Mode 2, Startup — low-power operation and POAH | |
| **PWR-N05** | Turbine roll and generator synchronization | **open by design** — #307 asks whether this should be a taught evolution at all; `DESIGN_CRITERIA.md` §4 names it an escalation case |
| **PWR-N06** | Power ascension Mode 1 to 100 % | distinct from N07's power *maneuvering* |
| **PWR-N09** | **Boron and reactivity management (including xenon)** | the natural home for demonstrating **A7 and A8**, neither of which any content demonstrates today |
| **PWR-N11** | Pressurizer level control (CVCS) | |
| **PWR-N13** | Reactor coolant pump (RCP) operation | |

(PWR-N03, approach to criticality, *is* covered — `pwr_startup` carries it under the PWR-T03
training reference. Complete in substance, inconsistent in numbering: it is the one **T**-numbered
entry in an otherwise **N**-numbered loop.)

**A second pass over this list is owed** — the ruling settles the eight, not the shape of the tier.

**PWR-N09 is the strongest candidate, and the board already supports it.** An earlier draft of this
section claimed there was "no boration/dilution evolution — the content-end face of the missing
manual borate control". **That was wrong** *(OWNER, 2026-08-03: "The board has boration/dilution
it's just the auto borate/dilute to meet the ppm setpoint.")*. The board carries a full
borate/dilute affordance: **BORON CONTROL ON/OFF + target ppm**, where raising the target borates
and lowering it dilutes, metered as a **batch dose at ~0.05 ppm/s** and stopped by a flow
totalizer (`Manuals/03` §7.5). What has no board face is the *rate* path (`set_boron_adjust`), not
boration itself — and the batch-to-a-target model is how a real makeup panel works, as is knowing
concentration from **chemistry grab samples** rather than a boronometer. Measured 2026-08-03, full
stack: borating **617.8 → 700 ppm takes ~28 plant-minutes** and walks the plant **100 → 75.5 %
power** with the operator touching nothing else — which is A8, demonstrated, in half an hour.

**Some systems reveal no coupling and are correct anyway.** Naming them stops a future reviewer
"simplifying" them out on the grounds that they teach no physics:

| System | Why it is here |
|---|---|
| **Trip blocks** — all five: `ir_high`, `pr_low_setpoint`, `lo_press`, `si_trip`, `lo_flow` | protection is **staged to the evolution**, and each block has its own permissive: `ir_high`/`pr_low_setpoint` above P-10, `lo_press`/`si_trip` below P-11 (13.6 MPa), `lo_flow` below 10 % power |
| **ESF arms / HPI-LPI to OFF** | the P-11 cold lineup; PWR-N15 measured what skipping it costs — 2500 ppm RWST injection instead of 857 |
| **SR detector energize / secure** | the P-6 SR→IR handoff is a real procedural sequence |
| **RHR suction valve interlock** | entry conditions for shutdown cooling |
| **Accumulator isolation, MSIV** | lineup state that decides what happens *later* |

**The Tier B objective, stated:** the player can run an evolution **in order**, put systems in the
lineup the procedure calls for, and say **what each step is protecting against** — including steps
whose effect is invisible when performed. That last clause is the teaching content: a step with no
immediate feedback is exactly the kind a real operator skips, and PWR-N15 is the worked case —
the missing SI-block step produced a scram ~5 plant-minutes into the first leg.

---

## Tier C — casualties the player should be able to handle

A casualty is not a normal evolution (B) and not a flagship scenario (D). It is the middle band —
something goes wrong, the player **diagnoses it and responds**, and the plant survives or does not
depending on what they do.

**RULED: the tier has two bands, not one** *(OWNER RULING, 2026-08-03: "Do as you recommend." —
selecting the Core/Covered split, the two additions and the feed-and-bleed demotion below)*.

**Why the tier is split rather than a single list.** Measured 2026-08-03: the PWR carries **24
injectable failures**, and `Manuals/07_ABNORMAL_EMERGENCY.md` carries **24 abnormal/emergency
procedures** — PWR-E01…E23 plus E19u, **a complete one-to-one map**. Every casualty already has a
written response. But being "in Tier C" was defined to carry three consequences — a response
procedure, a board cue, and a **mission** — so a single in-or-out list makes an unusable choice:
all 24 in silently orders 21 missions, while a ten-row subset discards ATWS. The consequences are
separable, so the tier is:

> **CORE** — the player is *expected to handle* it. Owes a response procedure, a board cue **and a
> runnable checklist**. This is what Tier C means for gating and for #283's BETA definition.
>
> **COVERED** — documented, injectable, live in free play and for the instructor. Owes **no
> mission**. Not a curriculum objective; not an omission either.

**The Core test, derived from the ruled priority** (dynamics first, procedure second): **a casualty
is Core if it demonstrates a Tier A coupling under stress.** Everything else is Covered.

### Core — 11 casualties

| Casualty | Tier A coupling it stresses | Response | Runnable? |
|---|---|---|---|
| Turbine trip / load rejection (E03) | **A1/A2** — the dump is finite; P-9; power must go somewhere | 40 % dump + 10 % rod step | **yes** — `pwr_turbine_trip` |
| Loss of main feedwater (E01) | **A5/A9** — the SG is the only heat sink; AFW auto-start | yes | yes |
| RCP trip / loss of flow (E02) | **A1** — flow → DNB margin; the P-7 gating | partial | yes |
| Small RCS leak, seal leak (E23) | **A4** — CVCS holds it, and *charging flow* is the cue, not level | yes (#262) | **yes** — `pwr_seal_leak` |
| Stuck-open PORV (E07) | **A3/A4** — the TMI opener; tailpipe temperature is the honest tell | yes | yes |
| SGTR (E06) | **A3** — primary→secondary path; depressurize to stop the leak | yes | **yes** — `pwr_sgtr` |
| Loss of offsite power / SBO (E04/E05) | **A6** — everything at once, on batteries | yes | **no — unblocked 2026-08-04** |
| Steam line break (E19/E19u) | **A1** — overcooling is a reactivity event, through the same moderator coefficient A1 runs on (was mis-cited as A9, which is the SG-level *instrument* effect) | **no auto isolation** (#295 F5) | **no** |
| Loss of shutdown cooling, Mode 5 (#287) | **A6** — decay heat with no SG | annunciator only | **no** |
| **ATWS** (E13, `failure_to_scram`) | **A6 inverted + A8** — the reactor that will *not* switch off; boration is the only reactivity control left | yes | **no** |
| **Uncontrolled rod withdrawal** (E17) | **A8** — rods fast, boron slow, in its dangerous direction | 1.5 DPM block (§8.18) | **no** |

**ONE CORE ROW DOES NOT SATISFY THE CORE TEST, and it is flagged rather than quietly rewritten**
(found 2026-08-03 auditing this table against its own rule). **RCP trip / loss of flow (E02)** cites
*"flow → DNB margin"* — and **DNB margin is not a Tier A coupling**. The nearest row, A3, is about
*subcooling* margin, which is not the same quantity. So E02 sits in Core on prototypicality and on
having a real automatic trip, not on the stated test. Two honest resolutions: add a Tier A row for
flow → DNB margin (it is modelled — `dnb_margin_c` is a config constant and `hFcEffective`
collapses on it), or say plainly that Core admits a casualty on **procedure** grounds as Tier B
does. **Not resolved here** — it is a question about the ruling, not a typo in it.

**The Runnable? column above went stale within hours of the ruling** — three checklists were built
on 2026-08-03 (`pwr_turbine_trip`, `pwr_sgtr`, `pwr_seal_leak`) and this table still said "no".
It is the same shape as the #224 trap: a hand-maintained list beside the artifact it describes.
**Update it in the change that builds the checklist**, or `run_procdocs`' own coverage report is
the only thing telling the truth.

**The two additions are measured, and the measurement is why they are Core.** **ATWS** is
**A1 at its most dramatic followed by A8**: measured 2026-08-03, power falls **100 % → 43.6 % in
five minutes with nobody acting** — the negative moderator coefficient is *the* reason a PWR ATWS
is survivable — and then **126 ppm of boron over ~44 minutes** takes the core subcritical with the
rods unavailable.

> **CORRECTION, 2026-08-03.** This paragraph used to justify ATWS as *"the only reachable
> demonstration of the pressurizer code safeties"*. **That is false, and it was my own claim,
> inherited from `CLAUDE.md` and repeated in my own voice.** Measured three ways, full stack —
> ATWS from a turbine trip (peak **2321 psi / 16.00 MPa**), ATWS plus total loss of feedwater
> (**2293 psi / 15.81 MPa**), and both with the PORV block valve shut as well — **the safeties
> never lift**, against a **2484 psi (17.13 MPa)** pop. The moderator coefficient collapses power
> long before pressure can run. I have **not** proven no ATWS could reach them; only that these
> three do not. **The code safeties' reachability is an open question again**, and ATWS is Core on
> its own merits, which are stronger. **Uncontrolled rod withdrawal** holds **114.8 % power for ~17 s with NO TRIP** (#311),
recovering only because the bank runs out of travel: a demonstrated protection gap on the shipped
plant, and what §8.18's declared departure exists for.

**Feed-and-bleed was DEMOTED to Covered, and this is the Q2 test biting.** Verified 2026-08-03: it
appears **only in `ui/manual_md.js`** — manual prose, nothing in `engines/`, `layers/` or
`scenarios/`. A Core objective the plant cannot perform is precisely the unreachable-capability
failure Q2 exists to catch. It returns to Core when #140 builds it.

### Covered — the rest of the catalog

| | Failure | Procedure |
|---|---|---|
| **reactivity** | `stuck_rod_on_scram` | PWR-E18 |
| **coolant** | `stuck_open_spray` · `failed_pzr_heaters` | PWR-E14 · E15 |
| **secondary** | `loss_of_condenser_vacuum` · `sg_overfeed` | PWR-E10 · E16 |
| **safety system** | `degraded_hpi` · `afw_failure` | PWR-E11 · E12 |
| **instrument** | `tavg_sensor_failure` · `pzr_level_sensor_stuck` · `pzr_level_sensor_low` · `porv_indicator_stuck_closed` | PWR-E20 · E21 · E22 · E08 |

The four **instrument** drills are Covered rather than Core by the owner's own ruling that
instrument deception is not a major focus (Tier A) — they ship, they are injectable, they are
documented, and they simply owe no mission. **Large LOCA (E09)** is declared **Tier D-adjacent**:
it is meltdown-path material and `run_meltdown` already covers it.

**Promotion needs a Q0 pass.** What was measured here is the bookkeeping — 24 injectables, 24
procedures, 3 runnable — **not** whether each Covered casualty produces a distinguishable,
diagnosable response. **`loss_of_condenser_vacuum` (E10) is the strongest promotion candidate on
argument** — it teaches the 40 % dump ruling in reverse, by removing the dump's sink — and it sits
in Covered *only* because that has not been measured.

### What the ruling settles

**The gap is now bounded and ranked: 8 runnable checklists owed** (Core is 11; E01, E02 and E07
already have one). Ranked cheapest-and-most-built first, blocked last:

| | Checklist owed | Why here in the order |
|---|---|---|
| 1 | Turbine trip / load rejection (E03) | the plant's defining behaviour, fully built and measured |
| 2 | SGTR (E06) | mechanism and response both exist |
| 3 | Small RCS leak (E23) | mechanism exists; the charging-flow cue is authored (#262) |
| 4 | ATWS (E13) | mechanism exists; unlocks the code-safety demonstration |
| 5 | Uncontrolled rod withdrawal (E17) | casualty and the 1.5 DPM block exist today |
| 6 | Loss of offsite power / SBO (E04/E05) | long evolution, response only partial |
| 7 | Loss of shutdown cooling, Mode 5 (#287) | response is annunciator-only, so the checklist would be thin |
| 8 | Steam line break (E19/E19u) | **blocked** — no auto isolation until #295 F5 |

**Three open items resolve as consequences, not as separate decisions:**

- **#311 OTΔT/OPΔT** — rod withdrawal being Core is the argument to turn the flag **ON**, but only
  **after** the equation constants are sourced. The Core row is what makes that sourcing worth
  doing; it does not license flipping an unsourced flag.
- **#295 F5** — steam line break is Core, so the isolation ESFAS becomes work rather than an open
  question.
- **#140** — feed-and-bleed is Covered until built, then returns to Core.

---

## Tier D — flagship scenarios

Already written: `DESIGN_COMPANION.md` §5 — TMI = a failure of **information**, Chernobyl = a
failure of **design**, Fukushima = a failure of **sustained support**. **Adopt as-is.** This is
also where instrument deception lives.

**They need not be real events** *(OWNER, 2026-08-02: "Defining/flagship scenarios (TMI,
Chernobyl, etc.). These don't necessarily have to be real events.")* — a liberation worth stating
as guidance, not permission: a historical accident is constrained by what actually happened,
including the parts that teach nothing, while an authored scenario can be built backwards from a
Tier A coupling and made to turn on exactly the decision worth teaching. The test is unchanged: it
must be **physically honest** on this plant (Q0) and must not imply a real event occurred as
depicted.

**Plant identity is folded in, not a separate tier: each plant's Tier A list IS its identity.**
PWR — a pressurized, subcooled primary with the SG as its only heat sink. RBMK — a **positive**
void coefficient and what it does to a shutdown. BWR — a direct cycle boiling in the core, where
void is both the power controller and the hazard.

---

## What a ruling changes

Today Q2 asks *"is there educational value?"*, answerable "yes" for anything. With objectives it
asks two checkable questions:

1. **Which objective does this serve, by which route** — demonstration, step, or declared trainer
   affordance? A feature with none is not automatically rejected, but it has no Q2 credit to spend
   against Q1 or Q3.
2. **Is the objective under-served?** This is the direction that *generates* work rather than
   filtering it, and it is the one an automated build needs: a Tier A coupling with no
   demonstration, or a Tier B system with no step, is a **content gap** — findable mechanically
   from the two artifacts each route already requires.

Downstream: **#283** (define BETA) gets its yardstick — plausibly *every Tier A coupling has a
demonstration and every Tier B system has a step, exercised and gated on the PWR* — and **#253**
(the lessons are stale) gets the standard to re-author against.

**Tier D is adopted as-is and the PWR's Tier C was RULED on 2026-08-03** (above). **Tiers A and B
are still open**, and RBMK/BWR Tier C stays deferred until those plants reopen — it cannot be
written honestly before their evidence passes exist.

**The gap Tier A exposes is a CONTENT gap, not a physics one.** Every coupling above is already
modelled and measurable. What is missing is that **no procedure, mission or free-play beat
demonstrates A1 or A2 deliberately** — the plant teaches power-follows-load to anyone who happens
to drop load with rods in manual, and nothing ever suggests they try it. That is #253's real scope.

**Tiers A and B stay advisory until ruled**, so for those two Q2 keeps working as it does now —
the weakest part of the criteria, and the reason this was raised. **Tier C no longer is:** a
casualty change can be measured against Core/Covered today, and "should this casualty get a
mission?" now has an answer instead of a discussion.
