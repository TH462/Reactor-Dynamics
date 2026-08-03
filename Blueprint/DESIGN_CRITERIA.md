# DESIGN_CRITERIA.md — should this feature or change go in?

**Status: BINDING**, via the pointer block in `CLAUDE.md`. It records a direct owner
instruction *(OWNER DIRECTIVE, 2026-08-02: "I think there are a few important criteria on
weather we should include a feature or make a change. 1. Is it prototypical? What is the
educational value? Is the increased complexity worth it? What are the actual tested numbers
or behaviors of our plant?"; clarified the same day: "I meant the complexity to the user. Are
the extra controls going to increase educational value or will they confuse the player? We
should codify this decision making process. My goal is to eventually automate the building of
the BWR and RBMK plants.")*.

**Three audiences, one document.** §1–§4 are the decision procedure — apply them to any feature,
setpoint, control or behaviour change. §5 is what each criterion *needs in order to be
answerable at all*, per plant, and is therefore the prerequisite list for automating a plant
build. §6 is the **per-plant curriculum definition** the decisions are measured against. They
are the same content from three ends: you cannot automate a judgement you cannot answer, §5 is
what makes §1–§4 answerable without the owner in the loop, and §6 is what they are answerable
*about*.

**§6 defines four things PER PLANT** *(OWNER, 2026-08-02: "We should define several things for
each of the plants. 1. The dynamics/interactions we want to show and their physics. 2. The
normal operating procedures we want the user to be able to perform. 3. What casualties we want
the user to be able to handle. 4. Defining/flagship scenarios (TMI, Chernobyl, etc.). These
don't necessarily have to be real events.")*:

| | Category | §6 section | Status |
|---|---|---|---|
| 1 | **Dynamics / interactions** and their physics | §6.3 (Tier A) | drafted, PWR only |
| 2 | **Normal operating procedures** | §6.4 (Tier B) | drafted, PWR only |
| 3 | **Casualties** the user should handle | §6.5 (Tier C) | drafted, PWR only |
| 4 | **Flagship scenarios** — need not be real events | §6.6 (Tier D) | adopt existing |

**The educational PRIORITY is fixed** *(OWNER RULING, 2026-08-02: "The most important ideas are
plant dynamics followed by how to operate the plant.")* — category 1 leads, category 2 second.
3 and 4 are where those two get exercised under stress. Instrument deception is **not** near the
top of this list; see §6.3 and `DESIGN_COMPANION.md` §2.

---

## 1. The four questions, in the order they are asked

Order matters. Three of the four are unanswerable until the fourth has been done.

### Q0 (asked first) — What are the actual tested numbers or behaviours of OUR plant?

**This is a gate, not a vote.** Nothing else in this document can be answered honestly until a
number exists. Step the plant, quote the figure, name the layer (HR12). It is listed first here
even though the owner listed it last, because in practice it decides the other three.

Two worked cases where the measurement changed the answer, not just the confidence:

- **#306 rod control.** The filed problem was that automatic rod control could not hold Tavg
  through a load ramp. Quadrupling the drive rate (`maxStep` 8 → 32) changed the ramp error by
  **nothing at all** — 12.55 °F before and after. The deviation is the plant's own thermal lag.
  Without that injection the obvious feature — more rod authority — would have been built, and
  it would have bought zero.
- **#295 F1.** "Can a trip block be misused?" is a shrug until you measure that a 20 %-of-max
  cold-leg LOCA rides **64 s unscrammed** (68.1 s / `pzr_level high` / 130 psi (0.90 MPa)
  against a baseline 4.2 s / `primary_pressure low` / 1782 psi (12.28 MPa)). The number is what
  made it a critical defect rather than a tidiness argument.

**A claim about coverage is also a claim about the plant.** "X is untested", "nothing asserts
Y" — prove it by injection: break it and see what reddens. See `CLAUDE.md`, standing procedure.

### Q1 — Is it prototypical?

The real question is **"can I cite it?"** Recall is not evidence, and neither is a claim already
written in this repo — several here were written from recall and later disproved (#220, #230,
#205). Cite the document: accession number, section, verbatim quote enough to check.

**Unsourceable is an answer, and it is not automatically "no".** Mark the claim UNVERIFIED and
carry it to Q2, where educational value may still justify it as a **declared departure**. What
is forbidden is asserting prototypicality you have not sourced — which is how the P-11 interlock
basis for #295 F1's fix reached this repo unchecked (found 2026-08-02; still open).

Prototypical is the **default**, not the verdict. Departing is allowed; departing silently is not.

### Q2 — What is the educational value?

**Measured against the educational goals in §6** — which are a PROPOSAL awaiting a ruling, and
that is exactly why Q2 is the weakest of the four today: with no stated objective, "it is
educational" cannot be falsified.

The weakest of the four, because everything sounds educational. It needs an operational test, and
this is it:

> **Can the player reach it on the board, and does something visible change when they do?**

An unreachable capability has *zero* educational value by construction, whatever it teaches in
principle. This is a recurring failure here, not a hypothetical: `thot`/`tcold` are declared
instruments read by nothing but pipe colour; the board has no manual borate control at all, so
PWR-N15 runs unborated below Mode 4; **#305** is an open inventory of engine and control
capabilities that never reached the diagram.

**Q2 is the ONLY legitimate reason to depart from Q1.** The house pattern already works this way
and is the model to copy — the AFW auto-start sits 3 points above the SG lo-lo trip rather than on
it (declared departure §8.19), because *"it buys the operator a visible 'AFW started, level still
falling' window that a single-setpoint plant does not give a lone trainee."* Prototypicality lost
on purpose, to a stated teaching reason, recorded in the departure register.

### Q3 — Is the increased complexity TO THE PLAYER worth it?

**Not code complexity** — that is a maintenance concern, covered by HR3 and the gates. This asks:
*will the extra controls increase educational value, or confuse the player?*

**Q3 can only ever say NO.** It is a veto. Complexity is never a reason to add something, so a
"yes" here contributes nothing; only a "no" changes the outcome.

Four tests, in decreasing order of how mechanical they are:

1. **Orphan control** — *an AUDIT, not a gate; see the caveat.* Is the new control named by at
   least one authored procedure step, mission or checklist — or explicitly declared a free-play
   affordance? A control nothing ever asks the player to touch is clutter until someone says so.
   `run_manual_controls` walks steps → controls; the reverse direction is not audited.
   **Measured 2026-08-02 on the PWR board, and the measurement is why this is not yet a gate:**
   52 labels resolve to **33 distinct targets** (so **19 labels are ALIASES** — `Rod motion`,
   `HPI` and `NIS` point at the same targets as `Control Bank`, `HPI/LPI` and `SR detector`,
   which content does use; a label-level audit reports 16 orphans where a target-level one
   reports 10). Separating operable controls from indication cards then **fails**, because
   `CONTROL_LABEL_MAP` targets *cards* while `pressableIds()` lists *buttons* — different
   granularities, and intersecting them claims only 3 operable targets out of 33, which is
   plainly wrong. A real gate needs the single classified inventory **#305** is open to produce.
   The one clean finding today: **`Rod AUTO`** is reachable and named by nothing, which matters
   because #289 made rods start in auto by owner ruling — default behaviour with no content
   explaining its control.
2. **Observability.** Does the board show its effect? If the player cannot see the result, the
   control teaches nothing and cannot be gated.
3. **Duplicate authority.** Does it create a second way to ask one question? This is the #284
   shape — the turbine model asked `generator_load > 0` while the breaker state was
   `load_mode !== 'disconnected'`, and a 0 MWe ask dropped a synchronised rotor to rest. #307
   declines a `breaker_closed` field for exactly this reason: *"A breaker only becomes meaningful
   after a no-load speed hold exists."* Two controls for one fact confuse the player **and** rot.
4. **Register test.** Can it be explained in the **Learning** register in one line? If it needs a
   paragraph of theory before the player can use it, it may be too fine-grained for this trainer —
   or it belongs in the manual rather than on the board.

**Removing or merging a control is a Q3 decision too**, and a legitimate one: HPI/LPI are merged
on this board deliberately.

---

## 2. How the four interact

| | can it say YES? | can it say NO? | overrules |
|---|---|---|---|
| **Q0** measured | — it is a precondition | **yes** — no number, no decision | everything; nothing proceeds without it |
| **Q1** prototypical | yes (the default) | not on its own | is overruled only by Q2, and only if declared |
| **Q2** educational | yes | yes | Q1, when the departure is declared |
| **Q3** user complexity | **no** | **yes** | any yes above it |

Read as a sentence: **measure it; prefer the real plant; depart only for a stated teaching reason
and write the departure down; and drop it anyway if it makes the board harder to read than it
makes the plant easier to understand.**

## 3. What "declared" means

A departure is declared when it is written in the departure register (`DESIGN_COMPANION.md` §8 —
live entries §8.18–§8.20) with: what the real plant does, what we do, **which of Q1/Q2 lost and
why**, and the measurement behind it. A departure that exists only in a code comment is not
declared — comments rot when the plant moves away from them (#220 found two, including a P-9
header reciting a dump capacity that no longer justified anything).

**Retiring a departure is a result.** §8.17 (the 105 % steam dump) was closed by fixing the gap
rather than justifying it — the dump went to the sourced 40 %.

## 4. When to escalate instead of deciding

Do not guess on these; ask, with a recommendation (SOP §5):

- Q1 is unsourceable **and** Q2's teaching claim is contested — that is a plant-identity question.
- Q2 and Q3 disagree and both are defensible — that is a call about what the trainer is *for*.
  #307 is the live example: turbine roll is worth building **iff** it should be a taught
  evolution rather than a fidelity nicety.
- The change moves a ruled-on behaviour. A prior ruling may rest on a stale premise — record the
  premise, not just the verdict — but re-opening it is the owner's call.

---

## 5. Making this answerable per plant — the automation prerequisites

**The criteria are necessary and nowhere near sufficient to automate a plant build.** What makes
the PWR automatable *from* is not that we have good judgement about it; it is that four artifacts
exist that let each question be answered mechanically. RBMK and BWR have none of them, and that —
not the decision procedure — is what blocks automation.

| Criterion | What it needs to be answerable | PWR | RBMK / BWR |
|---|---|---|---|
| **Q0** measured | acceptance batteries + an ad-hoc measurement rig at the right layer | `run_behavior` (43 probes, catalog v2.0 frozen), `run_ops`, `measure_stack.js` | engine suites only; **no behaviour catalog** |
| **Q1** prototypical | a **sourced corpus** with accession numbers | WTSM / NUREG-1431 / BEAVRS set, built by #220 | **none** — no equivalent evidence pass has been run |
| **Q2** educational | a control + indication inventory the player can actually reach | the learning board, `CONTROL_LABEL_MAP`, `controlLabels()` | **no board** — M8 UI and the M4 control surface are PWR-only (#187) |
| **Q3** user complexity | that same inventory, plus authored content to check orphan controls against | procedures, campaign, checklists; `run_manual_controls` | procedures exist, six diverge under the stack (#208) |

**So the work order for automating a plant is the artifact list, not the criteria:**

1. **Evidence pass → sourced corpus.** The #220 shape, per plant. For the RBMK this means IAEA /
   INSAG and post-1986 design documentation; for the BWR, the GE BWR/4 Mark I technical manuals
   and NUREG equivalents. Until this exists, **Q1 cannot be answered for that plant at all** and
   every prototypicality claim is recall.
2. **Behaviour catalog → acceptance battery.** The PWR's catalog was frozen at v2.0 and its
   battery is what makes Q0 cheap. Without it every measurement is bespoke.
3. **Control + indication inventory → a board.** Q2 and Q3 are both about what the player can
   reach; with no control surface neither is answerable.
4. **Gate set.** `run_<plant>`, the behaviour battery, ops probes, and baselines in
   `test/run_all.js` so drift is symmetric.

**Order is deliberate:** 1 before 2 (the catalog's targets should be sourced, not invented), and
2 before 3 (build the board for behaviours the plant actually has). Doing 3 first is how you get
a control surface for a plant that does not work yet.

> **RBMK and BWR are ON HOLD** *(`CLAUDE.md`)* — planning the process is not plant work, and
> nothing in §5 authorises starting any of it. This section exists so the groundwork is known
> when the owner reopens those plants, and so PWR work that would help (a reusable evidence-pass
> procedure, a catalog format, a board generator) is recognised as such when it comes up.

### 5.1 The PWR is the reference implementation — draw from it

*(OWNER, 2026-08-02: "We can point to the PWR plant as an example or draw from it.")* The PWR is
the only plant here that has been taken all the way through §1–§4, so it is the worked example for
each artifact. Point at these:

| Artifact | The PWR's version — copy the SHAPE |
|---|---|
| Evidence pass → corpus | **#220** is the procedure worked end to end: ten claims verdicted against NRC primaries, each with an accession number, and the `pwr-prototypicality-sources` memory as the index. The nrc.gov fetch workaround is in `Diagnostic/TUNING_LOG.md` 2026-07-28q. |
| Departure register | `DESIGN_COMPANION.md` §8.18–§8.20, and §8.17 as the worked *retirement* (closed by fixing the gap, not by justifying it). |
| Behaviour catalog → battery | catalog v2.0 (frozen) → `test/behavior_pwr.js` driven by `run_behavior.js`: strict xfail convention, auto gap report, probes named to the catalog. |
| Control layer | `layers/control/pwr_control.js` — trips, actuations, alarms and permissives are **DATA tables**, and `control_kernel.js` is the shared, plant-agnostic evaluator. A new plant is mostly authoring, not new machinery. Keep it that way: HR3 forbids plant specifics in the kernel. |
| Board | `pwr_board_data.js` (GENERATED from the Design builder) + `pwr_board_wiring.js`, `CONTROL_LABEL_MAP` / `controlLabels()` as the control vocabulary, `ui/test_panel/board_check.html` as the geometry/state harness. |
| Content ↔ board binding | `ui/manual_procedures.js` steps carry `control`/`hl`/`cmd`; `test/manual_ui_map.js` + `run_manual_controls` + `verify_manual_follow` keep every controlled step reachable. |
| Gates | `run_pwr`, `run_behavior`, `run_ops`, and a `BASELINES` entry in `test/run_all.js` so drift is symmetric in both directions. |

**COPY THE STRUCTURE, SOURCE THE NUMBERS.** This is the one way drawing from the PWR goes wrong,
and it is a Q1 violation wearing a helpful disguise: a setpoint, coefficient or trip threshold
lifted from the PWR is **recall with extra steps** — it has this plant's identity baked into it
(single-loop, 100 MWe, ride-out character, and its own declared departures). The PWR's *file
layout, data shapes, test conventions, gate structure and procedure format* are all transferable.
Its *values* are not, and neither are its departures — §8.19's AFW offset was argued from a PWR
teaching case and has to be re-argued, not inherited.

**The reusable procedure is the real deliverable.** What made the PWR work was not any one file
but the loop: evidence pass → catalog → data-driven control tables → board → gates → authored
content, each stage gated before the next. That loop is what an automated build executes; §5's
table is what it produces per stage.

---

## 6. Educational goals — the yardstick Q2 is measured against

> **STATUS: PROPOSAL — NEEDS AN OWNER RULING.** *(OWNER, 2026-08-02: "We also need to define the
> educational goals.")* Everything in §6 is drafted **from what the repo already implies**, not
> invented; it is not binding until ruled on. Q2 currently works without it, badly — see §6.3.

### 6.1 What exists, and what is actually missing

`DESIGN_COMPANION.md` **§3 states a pedagogy** — *experience over lecture*, two registers,
*honesty about simplification*, *comparison as a teaching tool*. **§5 states a narrative lesson
per accident** — TMI a failure of **information**, Chernobyl of **design**, Fukushima of
**sustained support**.

Both answer *how we teach* and *what each accident means*. **Neither states what a player should
be able to do or explain afterwards.** That is the missing artifact, and it is what Q2 needs: a
feature's educational value can only be argued against a stated objective. Without one, "it is
educational" is unfalsifiable and Q2 becomes a rubber stamp (§7).

### 6.2 The goal, in the owner's words

> *(OWNER, 2026-08-02: "The point of the sim is in the name. I want to teach people plant
> dynamics. They should learn the dynamics between the different components. For example, power
> follows load in a PWR. You can demonstrate this with rods in manual and lowering the generator
> demand. You see power drop to match demand and t-avg rise… These kind of dynamics,
> relationships and physics of the plant are what I want to teach.")*

**Dynamics is the PRIMARY goal — and procedure is a second one, not a subordinate one**
*(OWNER, 2026-08-02: "Plant procedure is still something I want to teach so there are some
systems that don't reveal dynamics in my pwr sim but I included them because they are important
for procedure.")*. An earlier draft of this section listed only operator competences and was
corrected for missing the couplings; the correction then over-swung, and this is the balance:

- **Tier A — dynamics.** What the player *understands*: component A moves, B responds, here is
  the physics that couples them. This is what the name promises and it leads.
- **Tier B — procedure & operations.** What the player *does*: run an evolution correctly, in
  order, with the right systems lined up. Some systems **reveal no coupling at all** and are
  here because a real plant's procedure needs them. That is a complete Q2 justification.

**So a feature has TWO possible routes to Q2 credit, and needs exactly one of them:**

> **DYNAMICS ROUTE — a DEMONSTRATION.** State it as [what you change] → [what responds] →
> [the mechanism], with board actions and MEASURED numbers.
>
> **PROCEDURE ROUTE — a STEP.** It is required by a real plant procedure (sourced, per Q1) and
> is named by an authored checklist, mission or beat.
>
> **Neither route ⇒ no Q2 credit**, and a non-prototypical, board-complicating feature with no
> Q2 credit fails on Q3 alone.

This is also what makes Q3's orphan-control test *precise* rather than blunt: an orphan is
damning for a **procedure-bearing** system, because being named by a step IS its whole
justification — while a dynamics-bearing control justifies itself by demonstration and may
legitimately never appear in a checklist.

### 6.3 Tier A — the core dynamics (PROPOSED)

Each is a coupling, its mechanism, and how it is demonstrated. A1 is the owner's own example,
measured on the shipped plant (full stack, `hot_full_power`, accel 10×, free-play lineup).

| # | Coupling | Mechanism | Demonstration |
|---|---|---|---|
| **A1** | **Power follows load** | negative **moderator temperature coefficient**, balanced by Doppler | rods to MANUAL, drop generator demand 100 → 60 MWe. **Measured:** power **100 → 57.5 %** with nobody touching the rods, Tavg **579.3 → 602.1 °F (304.1 → 316.7 °C)**, +22.8 °F (+12.6 °C) |
| **A2** | **Tavg is the coupling variable** — it is what the rod controller exists to hold | the rod channel trades Tavg error for rod motion | run A1 again with rods in AUTO and compare the Tavg excursion (§3's comparison principle) |
| **A3** | **Pressure follows temperature; subcooling is the margin** | pressurizer holds the primary liquid as Tavg moves | PWR-N15 walks Dump SP and Pressure SP down **together**, holding 63 °F (35 °C) subcooling |
| **A4** | **Level is not inventory** | shrink/swell; the level *program* moves with Tavg | pzr level rises on a load rejection with inventory unchanged |
| **A5** | **The SG is the primary's only heat sink** | lose feed and Tavg climbs whatever the rods do | loss of feedwater; AFW starts |
| **A6** | **A reactor cannot be switched off** | decay heat; subcritical ≠ cooled down | post-scram tail; the Mode 5 cooldown; SBO |

**Instrument DECEPTION is deliberately NOT a Tier A objective** *(OWNER, 2026-08-02: "I don't
want to focus on instruments lying. It will come up in failure scenarios but I dont know if it
should be a major focus.")*, and the reason is an ordering fact rather than a preference:
**you cannot perceive a lying instrument without already knowing what the plant should be
doing.** `DESIGN_COMPANION.md` §2 says so itself without noticing — the TMI dissonance arrives
when *"the subcooling margin falls in a way that does not fit the story"*, and **the story is
Tier A**. Taught before the couplings, it yields generalised distrust of gauges instead of
diagnosis by cross-check. It is the **payoff** of the curriculum, not the curriculum: it belongs
to Tier C, where TMI already carries it as *a failure of information*.

**HR1 IS UNAFFECTED AND STAYS EXACTLY AS IT IS.** This is a statement about teaching emphasis,
not about the model. Two reasons it must not be read as licence to soften the instrument layer:
protection reading instruments rather than truth is what makes the failure scenarios possible at
all, and **a HEALTHY channel's lag is itself part of the dynamics**, with no failure injected
anywhere.

**The second reason is MEASURED, and the size of it belongs to the CHANNEL rather than to the
transient** *(2026-08-03, full stack, seed 42, healthy channels throughout — an earlier draft of
this paragraph said "changes what the operator sees during **every** transient in Tier A", which
is not what the plant does)*. Timing the moment the indicated value crosses a threshold against
the moment the plant does:

| case | channel (lag) | gauge is behind |
|---|---|---|
| **A1 load drop 100 → 60 MWe, Tavg through 590 °F** | `tavg` (**4.0 s**) | **+4.00 s** |
| A1 load drop, power through 80 % | `power_range` (0.1 s) | +0.00 s |
| manual scram from HFP, power through 50 % | `power_range` (0.1 s) | +0.00 s |
| 20 % LOCA, pressure through the **1800 psi reactor trip** | `primary_pressure` (0.5 s) | +0.00 s |

**The slow demonstration shows the largest shift and the fast casualty shows none**, because
`tavg` carries 40× `power_range`'s lag. So the claim holds squarely for **A1 — four seconds on
the very variable A1 is about** — and does not generalise to every transient or every channel.
Two effects are in play and they are not the same: **timing shift** follows the channel's time
constant, while **value divergence** does follow transient speed (the LOCA reaches 414 psi and
25.6 °F of it). Cite the right one.

The observation layer is in scope; *distrust* as a headline lesson is not.

**A1's numbers reconcile, and the arithmetic is itself the lesson.** Tavg rose 12.6 °C against a
measured MTC of **−26.8 pcm/°C** → **−338 pcm** from the moderator. The fuel *cooled* 693 → 551 °C
as power fell, and with `alpha_D` **−2.5e-5 K⁻¹** (−2.5 pcm/°C) that returns **+355 pcm**. They
sum to ~+17 pcm — i.e. **≈ 0**, which is exactly where the plant settled (`reactivity_pcm` −53.3
during the transient, back to ~0 by 8 min). *The moderator term drives power down; the Doppler
term comes back as the fuel cools; equilibrium is where they cancel.* Rounding only — MTC varies
with boron and temperature — but the mechanism is legible in the numbers, which is the point.

**One correction for the record, because it changes what gets taught.** The actor here is the
**moderator temperature coefficient** (moderator *density* falling as it heats), not the void
coefficient. A PWR's void coefficient is also negative, but the primary is held **subcooled** —
that is the defining feature of the plant and what the subcooling-margin instrument exists for —
so there is essentially no bulk void at operating conditions and it is not what moves power here.
Void *is* the actor on the RBMK (positive) and the BWR (negative), which is precisely the
cross-plant contrast Tier B should carry.

### 6.4 Tier B — procedure & operations (PROPOSED)

**Some systems on this board reveal no coupling and are correct anyway.** They are here because
running a plant is an ordered, lined-up activity and that is worth teaching in its own right.
The PWR already carries several, and naming them stops a future reviewer "simplifying" them out
on the grounds that they teach no physics:

| System | Coupling it reveals | Why it is here |
|---|---|---|
| **Trip blocks** (IR-high, PR-25, `lo_press`, `si_trip`) | none — a block changes nothing until a setpoint is crossed | protection is **staged to the evolution**: you block deliberately as a step, above P-10 on the way up and inside P-11 on the way down |
| **ESF arms / HPI-LPI to OFF** | none in normal operation | the P-11 cold lineup; PWR-N15 measured what skipping it costs — 2500 ppm RWST injection instead of 857 |
| **SR detector energize / secure** | none | the P-6 SR→IR handoff is a real procedural sequence |
| **RHR suction valve interlock** | none until the setpoint | entry conditions for shutdown cooling |
| **Accumulator isolation, MSIV** | little, in normal ops | lineup state that decides what happens *later* |

**The Tier B objective, stated:** the player can run an evolution **in order**, put systems in
the lineup the procedure calls for, and say **what each step is protecting against** — including
steps whose effect is invisible at the moment they are performed.

**That last clause is the teaching content**, and it is why these systems are not filler: a step
with no immediate feedback is exactly the kind a real operator skips, and PWR-N15 is the worked
case — the missing SI-block step produced a scram ~5 plant-minutes into the first leg, far enough
downstream that the cause is not obvious from the effect.

### 6.5 Tier C — casualties the player should be able to handle (PROPOSED)

**This category was missing from the first two drafts entirely**, and it is not a subset of
either neighbour: a casualty is not a normal evolution (Tier B) and not a flagship scenario
(Tier D). It is the middle band — something goes wrong, the player **diagnoses it and responds**,
and the plant survives or does not depending on what they do.

The engine already carries ~25 injectable failures. The curriculum question is **which of them
the player is expected to handle**, because that decides what must have a response procedure, a
cue on the board, and a mission. A defensible PWR starter set, in rough order of how often a real
operator meets them:

| Casualty | What it teaches | Response exists? |
|---|---|---|
| Turbine trip / load rejection | the dump is finite; P-9; power must go somewhere | yes — measured, 40 % dump + 10 % rod step |
| Loss of main feedwater | the SG is the only heat sink; AFW auto-start | yes |
| RCP trip / loss of flow | flow → DNB margin; the P-7 gating | partial |
| Small RCS leak (seal leak) | CVCS holds it, and *charging flow* is the cue, not level | yes (#262) |
| Stuck-open PORV | the TMI opener; tailpipe temperature is the honest tell | yes |
| SGTR | primary→secondary path; depressurize to stop the leak | yes |
| Loss of offsite power / SBO | everything above at once, on batteries | partial |
| Steam line break | overcooling is a reactivity event | **no auto isolation** (#295 F5) |
| Loss of shutdown cooling in Mode 5 | decay heat with no SG | annunciator only (#287) |
| Feed-and-bleed | last-resort heat removal | **conceptual only** (#140) |

**Two are known-incomplete and this is the category that makes that a curriculum decision rather
than a backlog item**: #140 (feed-and-bleed is not a validated procedure) and #295 F5 (no steam
line isolation ESFAS). Either they are in the set and get built, or they are out and the omission
is declared. Today they are neither.

### 6.6 Tier D — flagship scenarios (PROPOSED)

Already written for the three historical ones: `DESIGN_COMPANION.md` §5 — TMI = a failure of
**information**, Chernobyl = a failure of **design**, Fukushima = a failure of **sustained
support**. Adopt as-is. **This is also where instrument deception lives** (§6.3).

**They need not be real events** *(OWNER, 2026-08-02: "Defining/flagship scenarios (TMI,
Chernobyl, etc.). These don't necessarily have to be real events.")*. That is a genuine
liberation and worth stating as design guidance rather than permission: a historical accident
is constrained by what actually happened, including the parts that teach nothing, while an
authored scenario can be built backwards from a coupling in Tier A and made to turn on exactly
the decision worth teaching. The test is unchanged — a flagship must still be **physically
honest** on this plant (Q0) and must not imply a real event occurred as depicted.

### 6.7 Plant identity — folded in, not a separate tier

An earlier draft had this as its own tier. It is not one: **each plant's Tier A list IS its
identity.** PWR: a pressurized, subcooled primary with the SG as its only heat sink. RBMK: a
**positive** void coefficient and what it does to a shutdown. BWR: a direct cycle boiling in the
core, where void is both the power controller and the hazard. Writing them as a separate list
duplicates the dynamics table and gives it a second place to rot.

### 6.8 How Q2 changes once these are ruled

Today Q2 asks *"is there educational value?"* — answerable "yes" for anything. With objectives it
asks two checkable questions:

1. **Which objective does this serve, by which route — demonstration or step?** (§6.2.) A feature
   with neither is not automatically rejected, but it has no Q2 credit to spend against Q1 or Q3,
   so a non-prototypical, board-complicating feature with no objective fails on Q3 alone.
2. **Is the objective under-served?** This is the direction that generates work rather than
   filtering it, and it is the one an automated build needs: a Tier A coupling with no
   demonstration, or a Tier B lineup step with no checklist, is a **content gap** — findable
   mechanically, from the two artifacts each route already requires.

Downstream of this ruling: **#283** (define BETA) gets its yardstick — plausibly *every Tier A
coupling has a demonstration and every Tier B system has a step, exercised and gated on the PWR*
— and **#253** (the lessons are stale) gets the standard to re-author against. Both are currently
blocked on the same missing artifact.

### 6.9 My recommendation

**Adopt Tier D as-is, rule on Tiers A and B, and defer Tier C until each plant is reopened.**
A and B are the load-bearing pair and they are plant-agnostic, so they are what an automated
RBMK/BWR build must satisfy; Tier C cannot be written honestly for those plants before their
evidence passes exist (§5, Q1).

**The gap Tier A exposes is a CONTENT gap, not a physics one.** Every coupling in §6.3 is already
modelled and measurable — A1 was measured for this document in 2.5 s of wall clock. What is
missing is that **no procedure, mission or free-play beat demonstrates A1 or A2 deliberately.**
The plant teaches power-follows-load to anyone who happens to drop load with rods in manual, and
nothing ever suggests they try it. That is #253's real scope, and it is a stronger argument for
re-authoring the lessons than "they are stale".

**Absent a ruling this section stays advisory and Q2 keeps working as it does now** — which is
the weakest part of the criteria, and the reason this was raised.

---

## 7. The failure mode this document has

Four questions become four headings, answered *"yes / high / yes / measured"*, pasted into an
issue — judgement laundered through a checklist. That risk is real in a repo that already carries
~650 prohibitions and was cut back in July for exactly this reason.

What protects it: **Q0 demands a number you had to go and get**, and **Q3 can only refuse**. Those
two are hard to fake. **Q1 and Q2 are trivially fakeable** — which is why Q1 requires a citation
you can check and Q2 requires a control the player can reach. Answer either without its evidence
and you have written down a preference, not a decision.
