# DESIGN_CRITERIA.md — should this feature or change go in?

**Status: BINDING**, via the pointer block in `CLAUDE.md`. It records a direct owner
instruction *(OWNER DIRECTIVE, 2026-08-02: "I think there are a few important criteria on
weather we should include a feature or make a change. 1. Is it prototypical? What is the
educational value? Is the increased complexity worth it? What are the actual tested numbers
or behaviors of our plant?"; clarified the same day: "I meant the complexity to the user. Are
the extra controls going to increase educational value or will they confuse the player? We
should codify this decision making process. My goal is to eventually automate the building of
the BWR and RBMK plants.")*.

**Two audiences.** §1–§4 are the decision procedure — apply them to any feature, setpoint,
control or behaviour change. §5 is what each criterion *needs in order to be answerable at all*,
per plant, and is therefore the prerequisite list for automating a plant build.

**The yardstick Q2 is measured against lives in `Blueprint/CURRICULUM.md`** — the per-plant
educational goals (dynamics, procedures, casualties, flagship scenarios). It was §6 of this file
until 2026-08-03 and was split out because it is a different artifact: this document is
plant-agnostic, that one is **per-plant** and grows with every plant added. All four PWR tiers
were RULED on 2026-08-03; read its per-tier status table before citing it.

---

## 1. The four questions, in the order they are asked

Order matters. Three of the four are unanswerable until the fourth has been done.

### Q0 (asked first) — What are the actual tested numbers or behaviours of OUR plant?

**This is a gate, not a vote.** Nothing else here can be answered honestly until a number exists.
Step the plant, quote the figure, name the layer (HR12). It is listed first even though the owner
listed it last, because in practice it decides the other three.

Two worked cases where the measurement changed the answer, not just the confidence:

- **#306 rod control.** The filed problem was that automatic rod control could not hold Tavg
  through a load ramp. Quadrupling the drive rate (`maxStep` 8 → 32) changed the ramp error by
  **nothing at all** — 12.55 °F before and after. The deviation is the plant's own thermal lag.
  Without that injection the obvious feature — more rod authority — would have been built, and it
  would have bought zero.
- **#295 F1.** "Can a trip block be misused?" is a shrug until you measure that a 20 %-of-max
  cold-leg LOCA rides **64 s unscrammed** (68.1 s / `pzr_level high` / 130 psi (0.90 MPa) against
  a baseline 4.2 s / `primary_pressure low` / 1782 psi (12.28 MPa)). The number is what made it a
  critical defect rather than a tidiness argument.

**A claim about coverage is also a claim about the plant.** "X is untested", "nothing asserts Y" —
prove it by injection: break it and see what reddens. See `CLAUDE.md`, standing procedure.

### Q1 — Is it prototypical?

The real question is **"can I cite it?"** Recall is not evidence, and neither is a claim already
written in this repo — several here were written from recall and later disproved (#220, #230,
#205). Cite the document: accession number, section, verbatim quote enough to check.

**Unsourceable is an answer, and it is not automatically "no".** Mark the claim UNVERIFIED and
carry it to Q2, where educational value may still justify it as a **declared departure**. What is
forbidden is asserting prototypicality you have not sourced — which is how the P-11 interlock
basis for #295 F1's fix reached this repo unchecked (found 2026-08-02; still open).

Prototypical is the **default**, not the verdict. Departing is allowed; departing silently is not.

### Q2 — What is the educational value?

**Measured against `CURRICULUM.md`** — which is a PROPOSAL awaiting a ruling, and that is exactly
why Q2 is the weakest of the four today: with no stated objective, "it is educational" cannot be
falsified. It needs an operational test, and this is it:

> **Can the player reach it on the board, and does something visible change when they do?**

An unreachable capability has *zero* educational value by construction, whatever it teaches in
principle. This is a recurring failure here, not a hypothetical — **#305** is an open inventory of
engine and control capabilities that never reached the diagram. The two clean cases: **`boron_trim`**
is a control-layer automation channel with **no board face at all** (measured 2026-08-03 — the
string appears **nowhere in `ui/`**), so `run_autoctl` gates a capability the player cannot reach;
and **manual borate/dilute** (`set_boron_adjust`) exists in the engine as a continuous ppm/s path
while the board carries only the batch `boron_conc` channel.

> **Q0 BINDS THIS FILE TOO.** This paragraph used to cite *"`thot`/`tcold` read by nothing but
> pipe colour"* — **false**; the board has T-hot, T-cold and leg-ΔT readouts and selectable trend
> series. An unmeasured coverage claim, sitting inside the section that forbids them. It also read
> *"unborated below **Mode 4**"* when it meant below the **M4 control layer** — module M4 is not
> Mode 4. Both found by the #312 review; full account in `Diagnostic/TUNING_LOG.md` 2026-08-03e.

**Q2 is the ONLY legitimate reason to depart from Q1.** The house pattern is the model to copy —
the AFW auto-start sits 3 points above the SG lo-lo trip rather than on it (declared departure
§8.19), because *"it buys the operator a visible 'AFW started, level still falling' window that a
single-setpoint plant does not give a lone trainee."* Prototypicality lost on purpose, to a stated
teaching reason, recorded in the departure register.

**The three routes to Q2 credit** — demonstration, procedure step, or declared trainer
affordance — are defined in `CURRICULUM.md`. A feature needs exactly one.

### Q3 — Is the increased complexity TO THE PLAYER worth it?

**Not code complexity** — that is a maintenance concern, covered by HR3 and the gates. This asks:
*will the extra controls increase educational value, or confuse the player?*

**Q3 can only ever say NO.** It is a veto. Complexity is never a reason to add something, so a
"yes" here contributes nothing; only a "no" changes the outcome.

Four tests, in decreasing order of how mechanical they are:

1. **Orphan control** — *an AUDIT, not a gate.* Is the new control named by at least one authored
   procedure step, mission or checklist — or explicitly declared a free-play affordance? A control
   nothing ever asks the player to touch is clutter until someone says so. `run_manual_controls`
   walks steps → controls; the reverse direction is not audited.

   **Why it is not yet a gate, measured 2026-08-02:** 52 board labels resolve to **33 distinct
   targets**, so 19 are aliases and a label-level audit reports 16 orphans where a target-level one
   reports 10. Separating operable controls from indication cards then fails outright, because
   `CONTROL_LABEL_MAP` targets *cards* while `pressableIds()` lists *buttons* — intersecting them
   claims 3 operable targets out of 33, which is plainly wrong. The one clean finding: **`Rod
   AUTO`** is reachable and named by **no authored content**, which matters because #289 made rods
   start in auto by owner ruling. (It *is* in `Manuals/03` §14.3/§17.2 — the test asks about
   authored content, not the manual.)

   **The cheaper fix is to classify at the COMMAND level** (#312): HR5 means every operable control
   terminates in a service command, and authored content already names commands, so both sides have
   uniform granularity — exactly what the card-vs-button attempt lacked. It needs the board's press
   handlers enumerated (they are closures over `cmd`), via a handler→command registry or a
   `selfTest` sweep. **Unimplemented and unmeasured.** #305 stays the right shape for *indications*,
   which have no command to key on.
2. **Observability.** Does the board show its effect? If the player cannot see the result, the
   control teaches nothing and cannot be gated.
3. **Duplicate authority.** Does it create a second way to ask one question? This is the #284
   shape — the turbine model asked `generator_load > 0` while the breaker state was
   `load_mode !== 'disconnected'`, and a 0 MWe ask dropped a synchronised rotor to rest. #307
   declines a `breaker_closed` field for exactly this reason. Two controls for one fact confuse the
   player **and** rot.
4. **Register test.** Can it be explained in the **Learning** register in one line? If it needs a
   paragraph of theory first, it may be too fine-grained for this trainer — or it belongs in the
   manual rather than on the board.

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
  #307 is the live example: turbine roll is worth building **iff** it should be a taught evolution
  rather than a fidelity nicety.
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

**Also per plant: the curriculum itself** — `CURRICULUM.md` is PWR-only, and each plant's four
tiers are answerable before any physics is written, which makes them a *starting* artifact.

**So the work order for automating a plant is the artifact list, not the criteria:**

1. **Evidence pass → sourced corpus.** The #220 shape, per plant. For the RBMK this means IAEA /
   INSAG and post-1986 design documentation; for the BWR, the GE BWR/4 Mark I technical manuals and
   NUREG equivalents. Until this exists, **Q1 cannot be answered for that plant at all** and every
   prototypicality claim is recall.
2. **Behaviour catalog → acceptance battery.** The PWR's catalog was frozen at v2.0 and its battery
   is what makes Q0 cheap. Without it every measurement is bespoke.
3. **Control + indication inventory → a board.** Q2 and Q3 are both about what the player can
   reach; with no control surface neither is answerable.
4. **Gate set.** `run_<plant>`, the behaviour battery, ops probes, and baselines in
   `test/run_all.js` so drift is symmetric.

**Order is deliberate:** 1 before 2 (the catalog's targets should be sourced, not invented), and
2 before 3 (build the board for behaviours the plant actually has). Doing 3 first is how you get a
control surface for a plant that does not work yet.

> **RBMK and BWR are ON HOLD** *(`CLAUDE.md`)* — planning the process is not plant work, and
> nothing in §5 authorises starting any of it. This section exists so the groundwork is known when
> the owner reopens those plants, and so PWR work that would help (a reusable evidence-pass
> procedure, a catalog format, a board generator) is recognised as such when it comes up.

### 5.1 The PWR is the reference implementation — draw from it

*(OWNER, 2026-08-02: "We can point to the PWR plant as an example or draw from it.")* The PWR is
the only plant taken all the way through §1–§4, so it is the worked example for each artifact:

| Artifact | The PWR's version — copy the SHAPE |
|---|---|
| Evidence pass → corpus | **#220** worked end to end: ten claims verdicted against NRC primaries, each with an accession number, and the `pwr-prototypicality-sources` memory as the index. |
| Departure register | `DESIGN_COMPANION.md` §8.18–§8.20, and §8.17 as the worked *retirement*. |
| Behaviour catalog → battery | catalog v2.0 (frozen) → `test/behavior_pwr.js` driven by `run_behavior.js`: strict xfail convention, auto gap report, probes named to the catalog. |
| Control layer | `layers/control/pwr_control.js` — trips, actuations, alarms and permissives are **DATA tables**; `control_kernel.js` is the shared evaluator. A new plant is mostly authoring, not new machinery. HR3 forbids plant specifics in the kernel. |
| Board | `pwr_board_data.js` (GENERATED) + `pwr_board_wiring.js`, `CONTROL_LABEL_MAP` / `controlLabels()` as the control vocabulary, `ui/test_panel/board_check.html` as the geometry/state harness. |
| Content ↔ board binding | `ui/manual_procedures.js` steps carry `control`/`hl`/`cmd`; `test/manual_ui_map.js` + `run_manual_controls` + `verify_manual_follow` keep every controlled step reachable. |
| Gates | `run_pwr`, `run_behavior`, `run_ops`, and a `BASELINES` entry in `test/run_all.js`. |

**COPY THE STRUCTURE, SOURCE THE NUMBERS.** This is the one way drawing from the PWR goes wrong,
and it is a Q1 violation wearing a helpful disguise: a setpoint, coefficient or trip threshold
lifted from the PWR is **recall with extra steps** — it has this plant's identity baked into it
(single-loop, 100 MWe, ride-out character, and its own declared departures). The PWR's *file
layout, data shapes, test conventions, gate structure and procedure format* are transferable. Its
*values* are not, and neither are its departures — §8.19's AFW offset was argued from a PWR
teaching case and has to be re-argued, not inherited.

**The reusable procedure is the real deliverable:** evidence pass → catalog → data-driven control
tables → board → gates → authored content, each stage gated before the next. That loop is what an
automated build executes; §5's table is what it produces per stage.

---

## 6. The failure mode this document has

Four questions become four headings, answered *"yes / high / yes / measured"*, pasted into an
issue — judgement laundered through a checklist. That risk is real in a repo that already carries
~650 prohibitions and was cut back in July for exactly this reason.

What protects it: **Q0 demands a number you had to go and get**, and **Q3 can only refuse**. Those
two are hard to fake. **Q1 and Q2 are trivially fakeable** — which is why Q1 requires a citation
you can check and Q2 requires a control the player can reach.

**But the observed failure mode is not FAKING Q0 — it is SATISFYING IT WRONGLY.** Nobody here has
invented a measurement; several have taken a real one from the wrong place, and a wrong number is
worse than no number because it arrives with a green tick:

- **Wrong LAYER** — #266 published two engine-direct figures for a full-stack plant, one **13× off**.
- **Wrong IC** — `engine.reset()` takes an object and **silently ignores a string**, defaulting to
  `hot_full_power`. Three rigs ran on a 300 °C plant while logging `cold_shutdown`.
- **Wrong CHANNEL** — #220: `above_p9` read `true_state.power_pct` while gating three protection
  decisions, and every runner was green.

**So a Q0 answer must carry LAYER + IC + LINEUP**, the way `test/measure_stack.js` stamps them into
its own output. "Measured" without those three is a number of unknown provenance.

**One residual risk, stated rather than hidden: Q1's citation requirement has no mechanical check.**
`run_hardrules` counts **owner-ruling** citation sites, not **evidence** citations — nothing
verifies that an accession number is real, says what the change claims, or exists. That is accepted
risk: the check would have to fetch documents this environment often cannot reach (#311 is the
worked case). Q1 is enforced by review, and by nothing else.
