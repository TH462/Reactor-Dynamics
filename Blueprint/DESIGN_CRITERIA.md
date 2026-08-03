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
principle. This is a recurring failure here, not a hypothetical — **#305** is an open inventory
of engine and control capabilities that never reached the diagram, and two of its rows are the
clean cases:

- **`boron_trim`** — a control-layer automation channel with **no board face at all**: measured
  2026-08-03, the string `boron_trim` appears **nowhere in `ui/`**. It is not `defaultOn`, and
  the Automate tab that used to engage it was removed when channels moved onto the board, so
  the player cannot reach it by any route. `run_autoctl` tests it by force-engaging it (#286) —
  a capability that is gated and unreachable at the same time.
- **Manual borate / dilute** (`set_boron_adjust`) — the engine carries a continuous ppm/s path;
  the board carries only the **batch** `boron_conc` channel (ON/OFF + target ppm). The rate path
  has no board face.

**Two corrections, kept because they are the mistakes this section exists to prevent** (found by
the #312 review):

1. This paragraph used to cite ***`thot`/`tcold` read by nothing but pipe colour***. **That was
   false.** The board has dedicated **T-hot** and **T-cold** readouts and a **leg-ΔT** readout
   (`pwr_board_wiring.js:781,782,698`), and the shell chart has selectable **Hot Leg / Cold Leg**
   trend series (`ui/app.js`). It was an unmeasured coverage claim — the exact thing Q0's last
   paragraph forbids — sitting inside the document that demands coverage claims be proved by
   injection. Q0 binds this file too.
2. It also read *"PWR-N15 runs unborated below **Mode 4**"*. That is a **layer/mode collision**:
   the cooldown runs unborated below the **M4 control layer** — in the engine-direct
   `run_procedures` replay, where the `boron_conc` channel does not exist, which is why the
   procedure is registered `stack_only`. The full-stack plant a player gets **can** borate in any
   mode. Module M4 is not Mode 4; `CLAUDE.md`'s conventions block warns about exactly this pair.

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
   plainly wrong. A real gate needs a classified inventory — **#305** is open to produce one.
   The one clean finding today: **`Rod AUTO`** is reachable and named by **no authored content**
   — no procedure step, mission or checklist — which matters because #289 made rods start in auto
   by owner ruling, i.e. default behaviour with nothing explaining its control. (It *is*
   documented, in `Manuals/03` §14.3 and §17.2. "Named by nothing" was the earlier wording and
   overstated it; the orphan test asks about **authored content**, not about the manual.)

   **There is a cheaper classification than #305, and it gates the CONTROL half today** (#312).
   Classify at the **command** level rather than the control level: HR5 means every operable
   control terminates in a service command, and authored content already names commands
   (`cmd`/`acc`). *Commands issuable from the board* minus *commands named by any authored
   content* has **uniform granularity on both sides**, which is precisely what the card-vs-button
   attempt above lacked. The obstacle is that the board's press handlers are closures over `cmd`,
   so the left-hand set has to be enumerated — either a handler→command registry, or a
   `selfTest`-style sweep that invokes each handler against a recording stub. **Unimplemented and
   unmeasured**; recorded as the next thing to try, not as a finding. #305 stays the right shape
   for *indications*, which have no command to key on.
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
| **Q0** measured | acceptance batteries + an ad-hoc measurement rig at the right layer | `run_behavior` (44 probes, catalog v2.0 frozen), `run_ops`, `measure_stack.js` | engine suites only; **no behaviour catalog** |
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

**So a feature has THREE possible routes to Q2 credit, and needs exactly one of them:**

> **DYNAMICS ROUTE — a DEMONSTRATION.** State it as [what you change] → [what responds] →
> [the mechanism], with board actions and MEASURED numbers.
>
> **PROCEDURE ROUTE — a STEP.** It is required by a real plant procedure (sourced, per Q1) and
> is named by an authored checklist, mission or beat.
>
> **TRAINER AFFORDANCE — apparatus, declared as such.** It is justified by a named pedagogy
> principle in `DESIGN_COMPANION.md` §3, and is declared to be part of the **trainer**, not part
> of the plant. It is exempt from Q1 by construction — a real control room has no true-state
> overlay — and it is **not** exempt from Q0 or Q3.
>
> **None of the three ⇒ no Q2 credit**, and a non-prototypical, board-complicating feature with
> no Q2 credit fails on Q3 alone.

**The third route is a correction, not an addition** (#312). With only the first two, this
document retroactively condemned the **true-state overlay**, the **trend graphs**, the
**Learning register** and **instructor highlights** — all four board-reachable, all four
deliberate, none of them prototypical or named by a real procedure. The tell that the route was
already in use: **A2's own demonstration invokes "§3's comparison principle"** to justify itself,
and the board carries a **reactivity-pcm readout that reads `true_state` directly**
(`pwr_board_wiring.js` `imro6rdwwdn`). The document was using the third route while denying it
existed. Declaring it costs nothing and stops the next reviewer "simplifying" the overlay out on
Q1 grounds.

**One narrowing of the dynamics route, in the same spirit.** As written it requires a board
**action** — *what you change* → *what responds*. A pure **indication** has no action and can
still be load-bearing: `porv_tailpipe_temp` is the honest tell in the stuck-PORV case and
charging flow is the cue for a small leak (#262). An indication earns dynamics-route credit when
it is the **named cue of a Tier C diagnosis**; a cue nothing diagnoses is still an orphan.

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
| **A7** | **Xenon is a slow, invisible reactivity load** | ¹³⁵I decays to ¹³⁵Xe faster than flux burns it out, so poison *builds* after a power cut and burns off again hours later | run A1 and wait. **Measured** (full stack, `hot_full_power`, 100 → 60 MWe): `xenon_pct_eq` **100.0 → 104.9 %**, peaking at **4–5 h**, back through **98.6 %** at 12 h. At `xenon_worth` 0.025 Δk/k that is **−123 pcm** at the peak and **+159 pcm** on the way back — ~4 % of the 4068 pcm control bank. **There is no xenon gauge**: the player sees the rods walking out to hold Tavg, which is the lesson |
| **A8** | **Boron sets WHERE critical is; rods set HOW FAST you get there** | boron is slow, bulk and bank-wide; rods are fast and local. Two plants at the same temperature go critical at different rod heights | the two Hot Standby ICs are the experiment. **Measured (#303 — repo record, not re-measured for this document):** 857 ppm puts the critical bank at ~**561 steps**, 683 ppm at **319** — 242 steps and ~1830 pcm apart |
| **A9** | **The gauge moves the wrong way on the SECONDARY side too** | shrink-and-swell: indicated SG level leads on smoothed `power_rate`, so a fast power change drives the indication *opposite* to inventory (`swell_factor` 0.8 — an **instrument**-layer effect, M1 §8.4) | the A1 load drop, watching indicated `sg_level` against truth. **Measured:** at t+10 s the gauge reads **66.40 %** while the true level is **68.85 %** and still *rising* to 70.44 — a **−2.45 %** divergence against a ±0.6 % steady-state noise band (~4×). This is why three-element feed exists |

**A7–A9 were added by the #312 review pass, and how they were missed is worth more than the rows.**
All three are **already modelled** — `xenon_pct_eq` is a `true_state` field, the #303 boron
measurement is in the repo record, `swell_factor` has been in the instrument model since M1 §8.4.
The first draft derived this table "from what the repo already implies" and still under-reported
its own base by a third, because deriving from *what is demonstrated* silently drops every
coupling the plant models and **no content ever shows** — which is precisely the class §6.9 calls
a content gap. When this method is applied to the RBMK and BWR, enumerate the **engine** first
and subtract, rather than reading off the existing scenarios.

**Two honesty notes that belong with the rows.** **A9 is an instrument effect, not SG void
physics** — the level indication carries the lead term; the secondary is not void-resolved
(`CONTEXT.md`: *"it lives in the instrument, not the calibration"*). And **A9 is deliberately the
same lesson as A4 on a different system**: that pairing is the §3 comparison principle doing work,
not a duplicate row.

**One coupling was considered and left out.** `boron_trim` would demonstrate rods-vs-boron
authority directly, and it is **unreachable** (Q2, above) — so it has no demonstration and cannot
carry a Tier A row until it has a board face. Listed here so the omission is a decision rather
than an oversight.

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
all, and **a HEALTHY channel's lag is itself part of the dynamics** — it changes what the
operator sees during every transient in Tier A with no failure injected anywhere. The
observation layer is in scope; *distrust* as a headline lesson is not.

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

**This section answers the owner's category 2 in two halves, and the first half was missing until
the #312 review.** *"The normal operating procedures we want the user to be able to perform"* asks
for a **list of evolutions**; the table below it answers the different question *"which systems
earn their place through procedure"*. Both are needed, but only the first is the **automation
artifact** — an RBMK build needs *which evolutions must exist* before it can ask *which systems
earn their place*.

**The PWR's target evolutions — the Mode 5 ↔ 1 loop.** All eight are authored, runnable on the
board and replayed by `run_procedures_stack`:

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

**Each plant's equivalent list joins the §5 prerequisites** — it is answerable before any physics
is written, which is what makes it a starting artifact rather than an output.

**Two observations the list makes visible, neither of them urgent.** The approach to critical is
a **T**-numbered training procedure, not an N-numbered normal one — the loop is complete in
substance but not in numbering. And there is **no boration/dilution evolution**, which is the same
gap as Q2's `set_boron_adjust` example seen from the content end: no board face, so no procedure
could name one.

**Some systems on this board reveal no coupling and are correct anyway.** They are here because
running a plant is an ordered, lined-up activity and that is worth teaching in its own right.
The PWR already carries several, and naming them stops a future reviewer "simplifying" them out
on the grounds that they teach no physics:

| System | Coupling it reveals | Why it is here |
|---|---|---|
| **Trip blocks** — all **five** blockable trips: `ir_high`, `pr_low_setpoint`, `lo_press`, `si_trip`, `lo_flow` | none — a block changes nothing until a setpoint is crossed | protection is **staged to the evolution**: you block deliberately as a step, and **each block has its own permissive** — `ir_high`/`pr_low_setpoint` **above** P-10 on the way up, `lo_press`/`si_trip` **below** P-11 (13.6 MPa) on the way down, `lo_flow` **below** 10 % power |
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

The PWR carries **24 injectable failures** (counted 2026-08-03 in `PWR_FAILURES`,
`layers/control/pwr_control.js`; this said "~25"). The curriculum question is **which of them the
player is expected to handle**, because that decides what must have a response procedure, a cue on
the board, and a mission. A defensible PWR starter set, in rough order of how often a real operator
meets them:

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
**The ten rows above are a SUBSET, and measuring the set changes the question** (#312, corrected
2026-08-03). Counted on this tree: the PWR carries **24 injectable failures**, and
`Manuals/07_ABNORMAL_EMERGENCY.md` carries **24 abnormal/emergency procedures** — **PWR-E01…E23
plus E19u, a complete one-to-one map**. Every injectable failure already has an authored response.
So the ten rows are not a list of what exists; they are one draft's pick from a set twice that
size, and **fourteen injectables have a documented procedure and no curriculum row**:

| | Failure | Procedure |
|---|---|---|
| **reactivity** | `continuous_rod_withdrawal` · `stuck_rod_on_scram` · `failure_to_scram` | PWR-E17 · E18 · **E13** |
| **coolant** | `large_loca` · `stuck_open_spray` · `failed_pzr_heaters` | PWR-E09 · E14 · E15 |
| **secondary** | `loss_of_condenser_vacuum` · `sg_overfeed` | PWR-E10 · E16 |
| **safety system** | `degraded_hpi` · `afw_failure` | PWR-E11 · E12 |
| **instrument** | `tavg_sensor_failure` · `pzr_level_sensor_stuck` · `pzr_level_sensor_low` · `porv_indicator_stuck_closed` | PWR-E20 · E21 · E22 · E08 |

**So the Tier C ruling is a SUBSETTING decision, not an authoring one** — the opposite of what
this section assumed, and the reason it is worth putting to the owner as measured rather than as
a proposal: *is the curriculum the ten, or the twenty-four?* Adding a row costs nothing to write,
because the procedure is already written.

**The gap that actually bites is RUNNABLE, not documented.** Of those 24 documented procedures,
**three** are runnable checklists on the board — `pwr_loss_of_feedwater` (E01), `pwr_rcp_trip`
(E02), `pwr_stuck_porv` (E07) — plus the TMI narrative, which is E07+E08 combined as the manual
itself specifies. Q2's test is *can the player reach it*, and 21 of 24 responses exist only as
prose. **That** is the Tier C content gap; the missing rows were only ever the symptom.

**Two things this correction killed, recorded so they are not re-derived.** An earlier draft of
this block called `afw_failure`, `degraded_hpi` and `stuck_rod_on_scram` *"modifiers, not
casualties"* and proposed folding them into other rows as severity axes. **Each has its own
procedure** — E12, E11, E18 — so the repo already ruled them standalone and the classification
was invented on top of an unread artifact. The same draft claimed ATWS had *"no procedure"*; it
is **PWR-E13**. Both errors came from reasoning about the curriculum without reading the manual
index, which is one `grep` away.

**Three are known-incomplete and this is the category that makes that a curriculum decision rather
than a backlog item**: #140 (feed-and-bleed is not a validated procedure), #295 F5 (no steam line
isolation ESFAS), and now the #311 OTΔT/OPΔT flag. Either they are in the set and get built, or
they are out and the omission is declared. Today they are neither.

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

1. **Which objective does this serve, by which route — demonstration, step, or declared trainer
   affordance?** (§6.2.) A feature
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

**Adopt Tier D as-is; rule on Tiers A, B and the PWR's Tier C now; defer only RBMK/BWR Tier C
until those plants are reopened.** A and B are the load-bearing pair and they are plant-agnostic,
so they are what an automated RBMK/BWR build must satisfy; RBMK/BWR Tier C cannot be written
honestly before their evidence passes exist (§5, Q1).

**The PWR half is not deferrable, and an earlier draft of this line deferred it** (corrected by
the #312 review). §6.5's entire argument is that Tier C exists to force the in-or-out ruling on
#140, #295 F5 and the #311 flag — *"today they are neither"*. Deferring Tier C "until each plant
is reopened" **re-creates exactly that limbo**, and the PWR needs no reopening: it is the
reference implementation, its evidence passes exist, and three live decisions are waiting on the
ruling. Defer the plants that are actually on hold, not the one that is finished.

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

**The observed failure mode is not FAKING Q0 — it is SATISFYING IT WRONGLY** (#312). Nobody in
this repo's history has invented a measurement; several have taken a real one from the wrong
place, and a wrong number is worse than no number because it arrives with a green tick:

- **Wrong LAYER** — #266 published two engine-direct figures for a full-stack plant, one of them
  **13× off**, because engine-direct has no HPI and the 2500 ppm RWST injection never happened.
- **Wrong IC** — `engine.reset()` takes an object and **silently ignores a string**, defaulting
  to `hot_full_power`. Three rigs ran on a 300 °C plant while logging `cold_shutdown`, and two
  wrong findings were published before it was caught.
- **Wrong CHANNEL** — #220: `above_p9` read `true_state.power_pct` while gating three protection
  decisions, and every runner was green.

**So a Q0 answer must carry LAYER + IC + LINEUP**, the way `test/measure_stack.js` stamps them
into its own output. "Measured" without those three is not an answer to Q0; it is a number of
unknown provenance. §7 protects against *no* measurement; this is what protects against the
wrong one.

**One residual risk, stated rather than hidden: Q1's citation requirement has no mechanical
check.** `run_hardrules` counts **owner-ruling** citation sites, not **evidence** citations —
nothing anywhere verifies that an accession number in a change is real, says what the change
claims, or exists at all. That is accepted risk, not an oversight: the check would have to fetch
documents this environment often cannot reach (#311 is the worked case — the evidence pass could
not run because every outbound host was refused). Q1 is enforced by review, and by nothing else.
