# Reactor Dynamics — Documentation & Text Style Guide

**Version:** 1.1 · rewritten 2026-09-03 against the as-built simulator
**Applies to:** all player-facing text — the operator manuals, live checklists, board
labels, alarm and error strings, instructor and scenario prose, and the site pages.

**Status: ADVISORY.** `CLAUDE.md`'s *What actually binds you* block *(OWNER RULING,
2026-07-27: "I think we have too many instructions in this project and it's starting to
confuse the coding agents and gum up the works… Go with your recommendations")* says
plainly: **"Binding: the Hard Rules in `Blueprint/CONTEXT.md` §3, and this file. Nothing
else."** Nothing here binds an agent until the owner rules on it and a pointer lands in
`CLAUDE.md`. Version 1.0 opened by declaring itself "the authority"; that sentence was
wrong on arrival and is deleted. **Where this guide and a gate disagree, the gate wins.
Where this guide and the plant disagree, the plant wins (Hard Rule 9, the plant is ground
truth).**

**Basis.** Procedural rules adapted from ASD-STE100 (Simplified Technical English);
procedure format from nuclear industry practice (DOE-STD-1029, NUREG-0899, INPO/EPRI
procedure writers' guides). Neither is followed for compliance.

---

## The voice — the one rule the rest of this document serves

> *(OWNER DIRECTIVE, 2026-09-03: "The prose have to thread the needle between technical,
> accessible and concise.")*

Three constraints, and they bind **at once**. Satisfying two is the normal failure.

- **Technical** — the real term, the real number, and the number has a source. Never a
  softened word for a thing that has a name, and never a value nobody measured
  (Hard Rule 12, an assertion about plant dynamics must be measured).
- **Accessible** — a newcomer can act on the sentence without a glossary. One unit
  convention per sentence, the acronym expanded the first time, the condition before the
  action.
- **Concise** — one idea per sentence. The reader is watching a plant, not reading a
  document.

**The needle is threaded by SPLITTING, not by compressing.** This is the important half,
and it is why the rules below scope every length cap to a *field* rather than to a card.
The simulator already gives you the seams:

| Two fields | The technical half | The accessible half |
|---|---|---|
| `text` / `why` | the action and its band | the coupling, the window, the consequence |
| `brief` / `detail` | what the component is | why it matters and what to watch |
| Learning / Industry | `PZR PRESS LO LO` | `Pressurizer Pressure Very Low` |
| manual chapter / glossary | the setpoint table | the head-word |

Compressing a 48-word sentence to 20 words loses the plant. Moving 30 of those words into
`why` loses nothing and gains a readable step.

**The two failure modes, both live in this repo:**

- **Technical and true and unreadable.** `pwr_heatup` step 8 read, in one 48-word sentence:
  *"Re-align the Safety Injection accumulators NOW, on the way past: pressure is above their
  cover gas — 665 psia on this plant — and must still be below the 1600 psig valve-power
  lock…"* — correct in every particular, two pressure conventions deep, and its excellent
  `why` block sat one click away carrying the same facts properly. Rewritten 2026-09-03 to
  the action and the band; nothing was deleted, it moved.
- **Accessible and concise and useless.** *"Raise pressurizer pressure to normal."* A player
  cannot act on it and no gate can check it. The vague-quantifier rule (W12) and the
  setpoint rule (N9) exist for exactly this sentence.

**Operational test, applied to one sentence at a time:** can a newcomer *do* it, does it
name the real thing, and does it carry one idea? If a sentence fails one of the three, the
usual fix is a seam, not a synonym. **[JUDGEMENT]** — not gateable, like Hard Rule 12 and
the units rule; a green run says nothing about it.

---

## The name — what to call a thing

> *(OWNER DIRECTIVE, 2026-09-03: "Make sure to be using the name of a control as seen on the
> screen not the internal names. Also make sure it's spelled out enough to know what it means.
> All acronyms should be spelled out with the acronym next to it in parentheses.")*

Three rules. They apply to every text class, including Voice — a character may be wrong about
the plant, never wrong about what a control is called.

- **N-1 — The screen's name is the name.** Not the engine identifier, and **not a fuller name
  you invented because the screen's felt too terse.** The sanctioned vocabulary is
  `CONTROL_LABEL_MAP` in `ui/diagram/board/pwr_board_wiring.js` — 68 keys resolving to 46 board
  items — and it is not a matter of taste: `Manuals/03_CONTROLS_AND_INDICATIONS.md` §1.0 states
  *"Controls are named by on-screen label"*, and `run_manual_controls` fails if a checklist
  step's `control` string is not in the map. **If the name you want is not in that map, the
  answer is to change the board, not the prose.**
- **N-2 — Spell it out enough to know what it means.** A name that matches the screen and still
  tells the player nothing is a defect. `SP`, `ADV`, `IR`, `NIS` are all on this board and none
  of them decodes on sight. Fix it at the surface with room — the nameplate if it fits, the
  surrounding sentence if it does not.
- **N-3 — Every acronym is spelled out with the acronym in parentheses at first use:**
  *auxiliary feedwater (AFW)*. After that, the short form. Per document, and per panel for
  interface copy.
- **N-4 — A deleted control is not a name.** Before you write a control into player text,
  confirm it is on the **mounted** board, not merely in the authored file. Controls are removed
  from this board by owner directive and the prose that instructs them survives: the residual
  heat removal AUTO button, the reactivity readout and its caption, the labelled steam dump
  tile and the auxiliary feedwater manual START have all gone that way, and shipped scenario
  prose still names some of them. **N-1 makes a wrong name findable; N-4 is what makes a name
  exist at all.**

### The failure this was written for

`pwr_heatup` step 8 was rewritten on 2026-09-03 to read *"Open the **Safety Injection
Accumulator valve** NOW…"*. The board card is titled **ACCUMULATORS** and the sanctioned
control name is **Accumulator valve**. The invented name is longer, more descriptive, more
technically accurate — and a player scanning the board for it finds nothing. **A plausible
fuller name is still a wrong name.** N-1 exists because that failure is not sloppiness; it is
what careful writing does when it is not anchored to the screen.

### The tension N-1 and N-3 create, and how to settle it

**The board itself sometimes shows a bare acronym**, so the two rules pull apart. Seven of the
control map's keys already carry their expansion and roughly a dozen are bare:

| | |
|---|---|
| **Already correct — copy the form** | `Reactor Coolant Pumps (RCP)` · `Pressurizer Heaters (PZR)` · `Pressurizer Spray (PZR)` · `Relief Valve (PORV)` · `Residual Heat Removal (RHR)` · `Charging Pump (CVCS)` · `Letdown Orifices (CVCS)` |
| **Bare keys** | `HPI` · `HPI/LPI` · `AFW` · `AFW Throttle` · `MSIV` · `NIS` · `ECCS` · `ADV` · `ADV SP` · `Dump SP` · `Pressure SP` · `MFW Restore` · `SR detector` · `1/M Plot` · `Tavg` |

> **Do not treat that second row as an inventory of nameplates — read the board yourself.** A
> control-map key is a *highlight key*; it is not guaranteed to be the string painted on the
> tile. Several are not: the `Tavg` key resolves to a tile reading **AVG COOLANT TEMPERATURE**,
> and `Rod Speed — Normal` resolves to a button reading **MED**. A list of board labels written
> into a document rots the way gate baselines do. **Read the mounted board at the time you
> write.**

> **THE TRAP, and it caught two agents and me on 2026-09-03.** `ui/diagram/board/pwr_board_data.js`
> is the **authored** board, not the rendered one. The driver applies `DOC_PATCHES` (relabels),
> `DOC_REMOVE` (deletes) and `EXTRA_ITEMS` (adds) at mount, so the file and the screen disagree.
> Two proposals in the naming audit named controls the owner had already deleted; a third check
> of my own read `DOC_REMOVE` as a list when it is an **object** and reported zero deletions from
> a table that has many. **Apply all three overlays before you believe a name**, and when a name
> matters, look at the running board.

**Settle it in this order:**

1. **Use the screen's name.** N-1 wins the reference — write `AFW Throttle` when you mean the
   control, because that is what the player is looking at.
2. **Expand it in the prose around it.** *"Set the auxiliary feedwater throttle (**AFW
   Throttle** on the board) to 50 %."* The expansion is the writer's job even when the
   nameplate cannot carry it.
3. **Where the nameplate has room, fix the nameplate** — that is the permanent fix, and the
   seven labels above prove it fits. Board strings are changed through the re-export-safe
   override channel (`DOC_PATCHES` / `DOC_REMOVE` / `EXTRA_ITEMS`), **never by hand-editing the
   generated `pwr_board_data.js`**, and a rename costs `CONTROL_LABEL_MAP`, the checklist
   `control` strings, `Manuals/03`, and a re-run of `run_manual_controls` and `verify_e2e_ui` in
   the same change. Three lines of the nameplate list are load-bearing elsewhere and are named
   in §4.1.

### Where the expansion goes when the field is capped

The same seam rule as the voice section: **split, do not compress.** An expansion that will not
fit the action goes in the field beside it.

| Field | Cap | Where the expansion goes |
|---|---|---|
| checklist `text` | 20 words | `why`, or `target` if it is part of the value |
| checklist `control` | must match the board | nowhere — this field **is** the screen's name, verbatim |
| System Scanner `brief` | 140 characters | `detail` |
| board nameplate | 2–11 characters on a button | the Scanner popover, or the manual |
| alarm `label_industry` | terse annunciator legend | `label_learning`, which is what every player currently sees |

### Three standing exceptions

- **`Manuals/10_GLOSSARY.md` is acronym-first by design** — 74 rows headed `**RPS** | Reactor
  Protection System…`. A glossary is looked up by its short form. N-3 does not apply to a
  head-word.
- **The Industry alarm register is a board legend, not prose.** `PZR PRESS LO LO` is correct as
  it stands; expanding it destroys the form it exists to have. N-3 applies to the Learning
  register, which is the one the player actually sees.
- **Never coin an acronym.** If the industry does not use it, spell it out and stop.

**[GATED, in part]** — `run_manual_controls` holds every checklist `control` string to the
board's vocabulary (532 checks), and `run_inspect` enforces standalone-acronym expansion in the
System Scanner copy, carrying its own owner directive. **[GATEABLE]** — first-use expansion in
checklist step text, and whether a control named in step *text* resolves in the vocabulary at
all; both would be born green only after the pending pass, so until then they are backlog lines,
not checks. **[JUDGEMENT]** — N-2, whether a name decodes at all.

**Note what none of these gates covers.** `run_manual_controls` reads the `control` FIELD. Every
one of the verified defects listed under *Pending in 1.2* is in step **text**, which no gate
reads — the same shape as this project's standing finding that three runners gate the manual's
numbers and nothing gates its prose. **A green board-vocabulary gate is not evidence the prose
uses the vocabulary.**

**On the rule codes below.** They are numbered so this document can cite itself.
*(OWNER DIRECTIVE, 2026-08-14: "I don't know what these letter number combos are (L0, D1).
Always spell them out."; broadened the same day: "Not just those to, spell out all of
them.")* Bare codes are fine **inside this document, which defines them**. Never in chat,
an issue body, a commit message or a review comment: write "the vague-quantifier rule",
not "a W12 violation".

**Enforcement is not a checklist.** This repo gates fourteen documentation runners —
`run_manual_units`, `run_manual_rev`, `run_manual_setpoints`, `run_manual_commands`,
`run_manual_controls`, `run_procdocs`, `run_session_labels`, `run_doc_budget`,
`run_hardrules`, `run_hr3`, `run_release`, `run_style`, `verify_manual_data`,
`verify_manual_follow` — every one with a `BASELINES` entry in `test/run_all.js`. Each
rule below carries a mark:

| Mark | Means |
|---|---|
| **[GATED]** | a runner fails if you break it. Run the gate; do not eyeball it. |
| **[GATEABLE]** | a regex could decide it, and no runner does yet. |
| **[REPORTED]** | `run_style` prints the count and deliberately does not score it — the corpus does not meet the rule yet, and a count that moves on every prose edit is a gate people learn to ignore. |
| **[JUDGEMENT]** | no check can decide it. It stays a review conversation. |

---

## 0. The plant this guide is about

Write about the plant that exists, not the one the vocabulary comes from.

- The modelled plant is **SLS-100** (Single Loop Simulated, 100 MWe) — roughly
  **100 MWe / 300 MWt**, **one** reactor coolant pump, **one** steam generator, **one**
  main steam line (`Manuals/01_GENERAL_DESCRIPTION.md`, `engines/pwr/pwr_config.js`).
  **There is no Loop A, no pump A, no bank D.** R. E. Ginna is the *sourcing anchor* for
  prototypicality evidence, not the plant being simulated.
- The live engine is **PWR2** (`engines/pwr2/`). Rods are two lumped groups, **Control
  Rods** and **Shutdown Rods** — the four-bank overlap program is folded into a curve
  constant, so a four-bank vocabulary describes machinery this plant does not have.
- **RBMK and BWR are on hold.** Do not author, or write rules for, their text.

---

## 1. Text classes

*(Version 1.0 called this axis "registers". That word is taken: in this project a
**register** is the Learning ⇄ Industry label pair — 489 authored string pairs, `ui.register`,
`set_register`, and a field in the §6.3 snapshot contract that `run_contract` gates in both
directions. The axis below is renamed to **text class** so the two never collide.)*

| Class | Where it appears | Rules that apply |
|---|---|---|
| **P — Procedural** | Live checklist step `text`, `control`, `target`; the manual's procedure tables; chapter 06's alarm-response Action cells | §2, §3, §4, §5 |
| **R — Reference** | Manual chapters, glossary, help text, System Scanner `brief`/`detail`, the checklist's `why` blocks | §2 (except W1), §4, §5 |
| **V — Voice** | Scenario beats and instructor chat — speakers `sup`, `supx`, `aux`, `chief`, `sys`, `player` | §4, §5 only. Voice may direct, mislead, and use figurative language |
| **U — Interface** | Board labels and nameplates, buttons, alarm tiles, blocked-action messages, tab and menu names | §2 (W11, W12, W13, W15 only), §4, §5, §6 |
| **C — Chrome** | Site pages, Settings/About, campaign syllabus, menu explanations, the feedback form | §2 (as R), §5. Second person is expected here |

**Class C exists because roughly 10,000 words of shipped copy fit nowhere else** — nine
website pages (9,550 words), the campaign syllabus, the bug-report form's
restricted-information warning. Version 1.0's claim that every piece of text belongs to
exactly one of four classes was false before it reached the plant.

**Which section applies is decided by this table, not by a rule's own wording.** Version
1.0 withheld §2 from the interface class in the table and then had three §2 rules claim it
anyway.

### The boundaries that actually come up

- **`text` is P, `why` is R.** The live checklist encodes this already: all 61 shipped
  PWR2 steps carry a `why`, documented at `ui/manual_procedures.js` as *"`text` stays the
  concise action; `why` carries the what-and-why."* Length rules follow the field, not the
  card.
- **Scenario beats are V, not P.** A Shift Supervisor line can be an order
  (`scenarios/pwr_tmi2_p1.js`: *"You have the board: secure High-Pressure Injection.
  That's an instruction — do it now."*) and still be Voice. When a beat **quotes** a
  procedure step, reproduce the P text unchanged and put the character's reaction around it.
- **An annunciator string spoken by the `sys` speaker keeps its U wording.** Do not
  paraphrase a board legend into dialogue.
- **The manual is R, its procedure tables are P.** Four of the thirteen chapters carry
  both. Class per block, not per file.
- **The manual may say "you."** Version 1.0 forbade it; the shipped manual uses second
  person **312 times across 11 of 13 chapters**, chapter 02 is a user guide, and the
  instructor voice is a settled design decision. The rule is deleted.

---

## 2. Core writing rules

### Sentences

- **W1** One instruction per sentence. Two actions means two steps. *(P only.)* **[JUDGEMENT]**
- **W2** **P: 20 words maximum, and it applies to `step.text` only** — not to `why`,
  `note`, `wait_hint` or `precond.text`, which are R. R: 25 words as a target, not a cap;
  92 of 92 System Scanner `detail` strings exceed it by design. **[REPORTED]** — `run_style`
  prints the count and does not score it. *Current state: **48 of 61** shipped step texts
  exceed 20 words, longest 73. A backlog, not a claim that the corpus complies.*
- **W3** One topic per paragraph. **[JUDGEMENT]**
- **W4** Active voice in P. In R and C, active unless the actor is genuinely unknown.
  **[JUDGEMENT]**
- **W5** Simple present or simple past. No perfect or future tenses. **[JUDGEMENT]**
- **W6** No `-ing` forms **as verbs**. Gerund nouns (authoring, numbering, placekeeping)
  and established technical names (heating, cooling) are fine. **[JUDGEMENT]**
- **W7** Keep articles in P and R. **U is exempt** — board nameplates and annunciator
  legends are telegraphic on purpose (`AUX FEED WATER`, `LO SUBCOOL`). **[JUDGEMENT]**
- **W8** Condition before action: "If subcooling margin is below 36 °F (20 °C), start
  high-pressure injection." **[JUDGEMENT]**
- **W9** No more than three nouns in a row in P and R. **[JUDGEMENT]**
- **W10** State things positively. A prohibition begins with **"Do not"** or **"Never"**.
  **[GATEABLE]**

### Words

- **W11** One word, one meaning. See §4. **[JUDGEMENT]**
- **W12** No vague quantifiers in P or U: *slowly, rapidly, adequate, sufficient, as
  necessary, as required, periodically, approximately* (without a number), *soon, several,
  a few*. **[GATED]** — `run_style`, in the checklist pool and both alarm registers.
  *Current state: **0 hits** across the 61 shipped PWR2 steps —
  already clean. 34 in `Manuals/`, concentrated in chapters 12 and 03.*
- **W13** Repeating a term is correct; varying it for effect is a defect. **[JUDGEMENT]**
- **W14** No idiom, metaphor or humour in P or U. All three are available in V, R and C.
  **[JUDGEMENT]**
- **W15** **Acronyms — see *The name*, rule N-3, which is the owner's own words and governs.**
  In short: spelled out with the acronym in parentheses at first use per document or panel,
  short form after. Already project policy (`Blueprint/OPERATOR_MANUAL_PLAN.md`) and already
  the board's convention in seven places. **[GATED]** in the System Scanner copy by
  `run_inspect`, which carries its own owner directive; ungated everywhere else.
- **W16** No "shall", "should" or "must" in P. A step is an imperative. **[GATED]** —
  `run_style`, checklist pool only. *The two live-pool sites were rewritten 2026-09-03 in
  the change that built the gate — the constraint they stated moved into `why`. 49 lines
  across `Manuals/` remain, reported by the runner and not scored.*
- **W17** Avoid "unless", "except" and "however" in P. Split into two conditionals.
  **[GATED]** — `run_style`, checklist pool only.
  *Current state: 13 lines across `Manuals/`, 0 in the live pool.*

### Action verbs

Fixed meanings. **These describe the target state — measured 2026-09-03, exactly 6 of the
61 shipped steps open with one of them,** so treat this table as the convention for new
text, not a description of the corpus.

| Verb | Means |
|---|---|
| **Check** | Observe an indication. Continue regardless of what it reads. |
| **Confirm** | Observe an indication and require the stated condition — the step's acceptance predicate is the test. This is the plant's own word: 15 of 61 steps open with it. |
| **Verify** | As Confirm, plus: if the condition is absent, establish it before continuing. Use only where the operator has a control that can establish it. |
| **Ensure** | Establish the stated condition. Act if it is not already present. |
| **Monitor** | Observe continuously while performing other steps. |
| **Open / Close** | Valves and breakers. |
| **Start / Stop** | Rotating equipment. |
| **Secure** | Stop and leave in the secured lineup. **This is board vocabulary** — `RCPs Secured`, and `STANDBY` versus `SECURED` on auxiliary feedwater. It is also the period-correct Three Mile Island phrase ("secure high-pressure injection"). |
| **Raise / Lower** | Continuously variable parameters and setpoints. |
| **Place** | Move a switch or selector to a named position. |
| **Borate / Dilute** | Chemical shim additions. No plain verb covers these. |

**Do not use** as an operator step verb: *initiate, commence, terminate, ascertain,
utilize, effect*. **"Actuate" and "actuation" are approved technical names** for automatic
engineered-safety-features action — they appear 85 times in the manuals and 230 times in
source and are the correct term; simply do not write them as an operator's instruction.

---

## 3. Procedure and checklist format

**Class P only.** This section describes the machinery that exists. The authoring schema
is `ui/manual_procedures.js`; the grader is `layers/instructor_layer.js`; the renderer is
`renderChecklist` in `ui/app.js`; the replay gate is `test/run_checklist_pwr2.js`.

### 3.1 A step's two halves

Every step has an **action** and a **completion criterion**. In the live checklist the
action is `text` plus the optional `control` / `target` pair, and the criterion is
**generated** from the acceptance predicate — the card draws *"When Boron within 20 ppm of
705 … not yet"*, then *"Use **Boron**: 705 ppm"*. **Do not author an "Expected Response"
string; author the predicate.**

There are four completion kinds, and a two-column form has a cell for only the first:

| Kind | Field | Means |
|---|---|---|
| Indication | `acc: {p, op, v[, tol]}` | Checked at the END of the step. `op ∈ > < >= <= ~`. |
| Transient | `saw: {p, op, v}` | True at least once **during** the step — a condition that may be gone by the time the player looks. |
| Multi | `accs: []` | All entries met. An entry is an acceptance **or** `{cmd, label}` — a command the operator must be seen to issue (the 1/M "point plotted" case). |
| Observation | none | Completes on time spent. Two of the shipped steps are these, both "Read the primary pressure…" openers. |

A step with no criterion at all draws no completion line. **Five of the 61 shipped steps
are in that state**; each shows an ungraded `target` instead. Prefer a predicate.

### 3.2 Acceptance criteria are safety claims *(new in 1.1)*

**A step's tick is permission for the next step.** An acceptance threshold is therefore an
assertion about what is safe to do *next*, and the replay harness cannot check it — the
harness issues a step's command at step start, so a realistic `hold:` dwell dominates and
the ride never stands where a too-loose acceptance lives.

The worked case is issue #608: the heatup's Pressure setpoint step accepted at
**609 psia (4.20 MPa)** against a **665 psia (4.59 MPa)** accumulator cover gas. Opening
there is accepted and backfeeds the tank — inventory 100 % → 97.2 %, boron +22 ppm.
Defensible about step 7; wrong as what releases the operator into step 8.

- **P1** Write the acceptance for the **successor**, not for the step in hand. Ask what
  the next step does with the plant this one leaves behind.
- **P2** Every acceptance value is a plant number with a source — a setpoint, an
  interlock, a program point — not a value read off a green run. An unmeasured threshold
  is an unmeasured claim (Hard Rule 12).
- **P3** A `hold:` is a dwell, not a criterion. Never rely on one to make a loose
  acceptance safe. **[GATED, partially]** — `test/run_checklist_pwr2.js` check 2e.

### 3.3 Numbering, ordering and progress

- **P4** Steps are numbered **flat, one-based integers**. The renderer is
  `(i + 1) + '. ' + text` and the schema has no nesting field, so **there are no substeps**.
  Zero decimal substep rows exist anywhere in the manual set; the handful of lettered rows
  (`2a`, `3a`) are manual-only. **[GATED]** — the manual-to-UI step map is keyed
  zero-based and `run_manual_controls` reads it at 532 checks.
- **P5** **Checklists are strictly sequential and tick themselves off the instruments.**
  Do not author a checkbox, an ordering flag, or an unsequenced block — none exists.
  *(OWNER DIRECTIVE, 2026-08-11: "Checklists are supposed to be automatically checked off
  by the sim when complete. Remove the user clickable step complete button.")* The
  `checklist_check` command survives for save/restore and the tests; it has no button.
- **P6** The distinction the sim has is **runnable** versus **printed-only**, not
  continuous-use versus reference-use. A runnable checklist lives in
  `ui/manual_procedures.js` and is replayed by a gate; a printed-only procedure lives in
  the manual and is not. Say which in the procedure's `purpose`. *(A "performed from
  memory" checklist is structurally impossible here — the card is titled "Auto-checklist —
  steps check themselves off the instruments while you operate.")*
- **P7** Progress persists. The instructor's saved state carries `idx`, `done`,
  `done_by`, `cmdSeen`, `sawSeen`, `acc_streak` and `complete`, and it rides the rewind
  ring. Nothing to author.

### 3.4 Entry conditions

Two layers, both already built, and version 1.0 had no rule for either:

- **P8** `prereq[]` is prose for the reader. `precond[]` is machine-graded, live,
  instrument-first, and shows as a banner.
- **P9** **An unmet precondition WARNS; it never blocks.** *(OWNER RULING, 2026-08-06:
  selected "Warn, never block" from three options put to him — a selection, not verbatim
  words.)* Reinforced for the menu *(OWNER, 2026-09-02, issue #606: "you should still be
  able to click on the non relevant checklist but it should say its not applicable to the
  current mode at the top")*. **Never write a precondition as a prohibition.**

### 3.5 Conditionals, waits and holds

- **P10** `IF <condition>, THEN <action>.` The condition must be observable on the board.
- **P11** For a wait: `WHEN <indication reaches value>, <action>.` Give the player
  something to watch. `wait_hint` carries a time-acceleration suggestion and is prose only
  — harnesses ignore it.
- **P12** A hold states its release condition and what to monitor while holding.

### 3.6 Cautions and notes

The runtime constrains this harder than version 1.0 assumed. `cautions[]` is a **bare
string array at procedure level** — there is no type field, no severity, and no per-step
attachment. Step-level `note` is a single string. **So a WARNING/CAUTION/NOTE taxonomy and
an ordering rule are not authorable in the live checklist**, and procedure-level cautions
render **only** on the manual browse card, not while a checklist runs — 17 authored
cautions are invisible during the run. That is a defect worth an issue, not a style rule.

- **P13** In the **manual's** typed precaution tables (which do have a Type column):
  WARNING = personnel harm or public consequence; CAUTION = equipment damage or plant
  transient; NOTE = information. One subject each; ordered WARNING, CAUTION, NOTE.
  *Current state: 53 rows across 13 tables, three of them out of order.*
- **P14** A caution contains no action. If it tells the player to do something, it is a
  step.
- **P15** Caution and warning text: 40 words. *(Version 1.0 set 25, which conflicted with
  its own 20-word procedural cap and failed 14 of the 17 shipped cautions; 40 is the
  measured median plus headroom, and the guide has to pick one number.)*

### 3.7 Immediate actions

`Manuals/07_ABNORMAL_EMERGENCY.md` carries **24 immediate-action sections, 120 rows**, all
in a `| Step | Action |` shape with no acceptance column, plus a generic set in chapter 06.

- **P16** Immediate actions come first, before diagnosis, and are short.
- **P17** **Do not call them memory items** — the term appears nowhere in the sim, and
  there is no memory-item mode. They are printed-only procedures (see P6).
- **P18** The live PWR2 pool has **six procedures and zero emergency procedures**. Any
  rule about emergency checklists governs text that does not yet exist; write it as a
  forward requirement or leave it out.

### 3.8 Instruments, not truth (Hard Rule 1)

Hard Rule 1 (instruments versus truth) says the plant's automatic decisions — every trip,
every safety actuation, every alarm — read the **instrument reading**, never true state.
Its guard, `run_hardrules`, scans `layers/control/` only: **nothing gates procedure prose**.
Do not cite a green run as covering your text.

- **P19** Procedures describe **indications**. Write "Confirm pressurizer level indicates
  above the program point"; do not write "Confirm the pressurizer is not solid."
- **P20** **Prefer a program-relative or setpoint-anchored threshold to an absolute one.**
  This plant's pressurizer level program runs **25 % → 61.5 %** with load; an absolute
  "above 40 %" reads FAILED on a healthy Hot Standby board, which sits at 23.6–26.4 %. The
  real rungs are 17 % (letdown isolation and heater cut), 12 % lo-lo, 75 % high alarm and
  87 % high-level trip.
- **P21** Acceptance predicates grade **instrument-first** where a channel exists.
  Nineteen of the 59 shipped predicates fall back to true state because the parameter has
  no instrument twin — including `sr_counts_cps`, `reactivity_pcm` and `decay_heat_pct`,
  which no operator board carries. **Prefer a parameter with an instrument.** The gate's
  check covers only the mapped subset, so a green run does not prove instrument-first
  grading everywhere.
- **P22** True-state language is permitted in **four** places: the **Physics column of the
  Indications tab** (there is no Physics *view* — that tab was deleted at issue #439; it
  survives as a column and a filter chip), instructor text explicitly stepping outside the
  operator's knowledge, the checklist card's own provenance line (*"graded off the true
  value (no instrument for this)"* — a deliberate honesty feature that ships), and this
  document. **There is no debrief surface**; do not write rules for one.
- **P23** Where an indication is known to be lying in a scenario, procedure text stays
  honest to the operator's viewpoint.

> **What P23 is NOT.** *(OWNER DIRECTIVE, 2026-08-03: "THR STATED PREMIS IS NOT INSTRUMENT
> VS TRUTH THE PREMIS IS TO TEACH PLANT DYNAMICS!!! We must purge the idea of the
> instruments vs truth premise from all documents.")* Instrument deception is a payoff, not
> the premise, and it is a Tier C curriculum item — you cannot perceive a lying instrument
> without already knowing what the plant should be doing. Hard Rule 1 is unaffected. Do not
> write that the lie is the lesson.

---

## 4. Terminology

### 4.1 The term list

**The identifier columns are generated, never authored.** Version 1.0 authored ten of them
from recall and five named strings that exist nowhere in the tree. The project maintains
**three disjoint namespaces**, and a term routinely has a different string in each:

| Column | Source of truth | Gate |
|---|---|---|
| **Command** | the shell's registries — 51 MAPPED, 16 REHOMED, 16 REFUSED (`engines/pwr2/pwr2_shell.js`) | `run_manual_commands` |
| **Indication** | instrument ids (`engines/pwr/pwr_instruments.js`) | `run_inspect`, `verify_manual_data` |
| **True state** | the §6.3 data contract — 109 PWR fields (`Blueprint/CONTEXT.md`) | `run_contract` |
| **Board label** | `CONTROL_LABEL_MAP` — **68 keys resolving to 46 distinct items** | `run_manual_controls` (532 checks) |

- **T1** A term with **no** command is normal and is not a gap. The shell's REFUSED
  registry already carries a prose reason for each — e.g. *"the source-range channel
  auto-energizes below the P-6 class point; no operator lever."* Quote the reason; do not
  write "(pending)".
- **T2** **Controls are named by their on-screen label — see *The name*, rule N-1**, which is
  the owner's own words and governs. The board's nameplate beats any preferred term this
  document, the manual, or your own judgement might prefer; if the name is wrong, change the
  board. `run_manual_controls` holds every checklist `control` string to that vocabulary.
- **T3** Before adding a "do not use" entry, grep for it. Version 1.0 banned four terms
  that are the board's own vocabulary or name different components entirely.

Seed rows, corrected against the tree:

| Preferred term | Short form | Command | Indication / true state | Board label |
|---|---|---|---|---|
| Power-Operated Relief Valve | PORV | `open_porv_manual` / `close_porv` → engine `porv_manual` | `porv_indicator` / `porv_open`, `porv_stuck`, `porv_demand` | `Relief Valve (PORV)` |
| PORV block valve | — | `open_block_valve` / `close_block_valve` → engine driver `block_valve` | `block_valve_open` / `porv_block_open` | `PORV Block Valve` |
| Reactor coolant pump | RCP | `set_rcp {running}` | `rcp_secured` | `Reactor Coolant Pumps (RCP)` |
| Auxiliary feedwater | AFW | `set_afw`, `set_afw_flow` → `afw_throttle`, `set_afw_block` | `afw_pump_running` **and** `afw_flow_normalized` (demand and delivery are deliberately separate) | `AUX FEED WATER`, `AUX FEED THROTTLE` |
| Subcooling margin | — | *(derived)* | `subcooling_margin`, flagged `derived: true` — computed from readings, not truth | `SUBCOOLING MARGIN` |
| Source range | SR | *(none — see T1)* | `source_range` / `sr_counts_cps`, alarm `sr_high_flux` | `Source Range` |
| Control rods / shutdown rods | — | `rod_nudge`, `rod_start`, `rod_stop`, `rod_stop_all` with `group_id` | `control_rods`, `shutdown_rods` | `Control Bank`, `Shutdown Bank` |
| Reactor trip | — | *(the event)* | alarm `label_learning: 'Reactor Trip'` | — |
| Scram | — | `scram` | `scrammed` / `rps_scrammed` | `SCRAM` |

**"Scram" and "reactor trip" both stay, because they name different things.** Version 1.0
proposed banning "scram" outside Voice. On this board `SCRAM` is the nameplate of the main
safety control, it lives in the **generated** `pwr_board_data.js`, it is a required
vocabulary key that `verify_e2e_ui` resolves through the label map, and twelve manual steps
name it. The honest split:

- **`SCRAM`** — the control, the action, and the latched state (`SCRAMMED`).
- **`Reactor trip`** — the event and its alarm; also the compound terms *turbine trip*,
  *RCP trip*, *trip block*.
- **Never write bare "trip" in P or U.** It carries four distinct senses in the shipped
  manual (reactor trip 62, turbine trip 53, RCP trip 14, trip block 13), and the board's
  TRIP BLOCKS card is about **permissives**, not trips. The qualifier is part of the term.

**Terms version 1.0 banned that must not be banned:** *aux feed* (a board card title),
*secure* (a rendered indication), *isolation valve* (the main steam isolation valve and the
accumulator isolation valve are different components), *relief* (the board's own control
label).

**No RBMK terms.** The operating reactivity margin and automatic regulator rows are removed
— that plant is on hold and no agent is authorised to write its text.

### 4.2 Technical names and technical verbs

A term qualifies as a **technical name** if it names a component, system, indication, unit,
mode or state. As a **technical verb** if it names an action and no plain verb covers it
precisely: *borate, dilute, scram, coast down, uncover, actuate* (automatic action only).
"It sounds technical" is not a qualification.

### 4.3 The Learning ⇄ Industry register

**Both halves are authored, deliberately, and nothing is generated.** 489 `learning:`
strings against 489 `industry:` — a symmetric hand-written corpus. Of the 54 shipped alarm
label pairs, **exactly one** (`Reactor Trip → REACTOR TRIP`) is a case transform; the rest
are independent annunciator legends: `High Coolant Temperature → HI TAVG`, `Pressurizer
Pressure Very Low → PZR PRESS LO LO`, `Subcooling Lost — Coolant Boiling → SUBCOOL LOST`.
No acronym tag generates a word-order inversion plus an abbreviation plus an interlock
suffix.

- **T4** **Author both strings.** Version 1.0's "do not author two separate texts" is not
  merely impractical here — `test/run_m5.js` and `test/run_m6ph.js` both assert the
  authored Industry string after `set_register`, so the rule reddens two green gates.
- **T5** Learning is plain language and may carry a clause. Industry is a terse board
  legend: abbreviated, upper case, no article.
- **T6** **The Settings toggle does not exist.** It was removed at issue #277;
  `ui.register` is initialised to `'learning'` and has zero assignment sites in the UI. The
  Industry strings ship, are gated, and are unreachable by a player. Do not write authoring
  rules that assume the player can switch — and do not delete the strings on the grounds
  that nothing reads them.
- **T7** Never coin an acronym. If the industry does not use it, spell it out.

---

## 5. Numbers and units

**The authority is `Manuals/README.md` § Units, and it is mechanically enforced.** Do not
restate the conversion table here or anywhere else — a second copy is how a number rots.

- **N1** **US customary first, SI in parentheses, at every site** — `2235 psi (15.41 MPa)`,
  `579.2 °F (304 °C)`. *(OWNER DIRECTIVE, 2026-07-29: "also add a gh issue to add to
  claude.md to always give me imperial numbers not SI.")* This holds in the manuals, the
  live checklist steps, the System Scanner copy, and everything handed to the owner —
  chat, issues, commit messages. **[GATED]** — `run_manual_units`, 724 pairs across 16
  files.

  > **Version 1.0's N2 — "a conversion appears once, in that table, and nowhere else" —
  > is deleted.** It reversed the directive above and would have broken the gate in the
  > worst way: `run_manual_units` does not check a table, it **re-derives the US value from
  > the SI value inside every parenthetical pair**. Strip the parentheticals and its regex
  > matches nothing, the failure count goes to zero, and roughly 700 sites become
  > unverified behind a green run.

- **N2** **Temperature differences convert × 9/5 with no offset.** Subcooling margin, leg
  ΔT, DNB margin, deadbands and heatup/cooldown rates are differences: 41 °C of subcooling
  is **73.8 °F**, not 105.8. The wrong rule reads as a *healthier* margin than the plant
  has. **[GATED]** — 83 difference sites, with a per-site allow-list; this is the specific
  error the gate exists for.
- **N3** **Pressures are absolute (psia).** The manual set says so in terms
  (`Manuals/09_SETPOINTS_LIMITS.md`: "Every pressure printed in this manual set is **absolute (psia)**"). Where a gauge
  reading is genuinely gauge pressure — containment, the automatic dump valve setpoint —
  write `psig` and say which. Never leave it ambiguous. *(Version 1.0's blanket `psig` also
  breaks `run_manual_setpoints`, which asserts `..._psig + 14.7`.)*
- **N4** **A space before the unit, including `%`** — `15.41 MPa`, `579.2 °F`, `40 %`.
  House style is **629 spaced to 12** in the manual set, and the twelve closed-up cases are
  all inside verbatim source quotations. **Exception:** terse board badges built at render
  time (`TRIP 25%`) — two board checks assert those strings by name. **[GATED]** —
  `run_style`, checklist pool only; `Manuals/` prose is reported, not scored, because its
  twelve closed-up cases are inside verbatim source quotations.
- **N5** **Resolution follows the instrument, and the SI half follows the gate.** The board
  reads pressure to 1 psi (0.07 bar), temperature to 1 °F and level to 1 point. Manual and
  checklist prose quotes SI to one decimal because the gate's tolerance requires it —
  rounding a temperature to a whole degree fails **102 of the 115** decimal pairs. Quote
  the plant's design point as `2235 psi (15.41 MPa)`; do not round it to make a point about
  gauge resolution.
- **N6** **Never a bare `MW`.** `MWe` for electrical output, `MWt` for thermal. The
  manuals use `MWe` 106 times, `MWt` 8, bare `MW` zero. This is not pedantry: fission power
  and core thermal power are equal only at steady power, and seconds into a loss-of-coolant
  accident the split is what the board is showing you.
- **N7** Unit families beyond pressure and temperature: condenser vacuum **inHg (kPa)**,
  one decimal; boron **ppm**; reactivity **pcm**; startup rate **DPM** (disintegrations per
  minute); counts **cps**; flow **gpm (m³/h)**. Reactivity, startup rate, counts and
  currents have no US/SI distinction and are quoted once.
- **N8** **Three flow ratings are computed, not authored** — charging maximum 30.1 gpm,
  letdown orifice A 12.7 gpm, auxiliary feedwater 86.2 gpm — and a gate compares the
  manual's bolded rows against what the plant derives, at 0.15 gpm. Do not "tidy" them. The
  retired plant's 60/30/100 gpm reached the public manual once already.
- **N9** Setpoints get a value and a direction: "raise the Pressure setpoint to
  2235 psi (15.41 MPa)". Not "raise to normal".
- **N10** Ranges use an **en dash** in tables, labels and figures (`2226–2238 psia`), and
  "to" in prose sentences. Never a hyphen.
- **N11** Percentages name what they are of: "reactor power 40 %".
- **N12** Times: the alarm log and event ribbon use `T+hh:mm:ss`; the chart axis switches
  to `h:mm:ss` past ten minutes. *(There is no `mm:ss` formatter in the tree; version 1.0
  mandated a format nothing uses.)* Where a historical clock is displayed, scenario prose
  uses the wall clock. Never mix the two in one line.

---

## 6. Interface strings

- **U1** **A button is a command; a selector position is a state; a toggle is a state with
  two.** Only the first takes an imperative — `SCRAM`, `LATCH`, `TRIP`, `RESTORE`. Of the
  47 rendered board buttons, **31 are selector positions** (`AUTO`, `MAN`, `OFF`, `SHUT`)
  and are correct as bare nouns or adjectives. Version 1.0's U1 and U3 returned opposite
  verdicts on the same widget; this is the tie-breaker.
- **U2** **The board is upper case — 116 of 121 rendered strings.** Sentence case is for
  the shell chrome (tabs, modals, settings) and class C. Do not "fix" a board nameplate to
  sentence case.
- **U3** A toggle label states what the control **is**, with a state indicator — `Alarms`,
  not `Turn Alarms Off`.
- **U4** **Alarm text, per register.** *Industry* is parameter plus direction, terse, no
  punctuation — `PZR PRESS LO LO`, `HI FLUX`; 49 of 54 already conform. *Learning* names the
  parameter and direction and **may** carry a short clause where the clause is the teaching
  — `Coolant Temperature Low — expected, plant is cold` exists because a cooldown is not a
  casualty (issue #240). Do not delete an authored distinction to satisfy a shape rule.
- **U5** **No prose is DUPLICATED into logic.** A string assembled from the manual
  reference is one authored string, not two; a string retyped from the manual into a
  conditional is a second copy that will drift. *(Version 1.0's "no prose lives inside
  logic" would condemn the System Scanner's copy assembler, which is the fix for issue #96,
  not a defect.)* **The real violation to hunt** is the board's number-tile label, which is
  concatenated in a conditional and overwrites the authored label every frame.
- **U6** **Blocked-action text says what happened and what is required.** Real example, and
  the shape to copy: *"The control rods are not all the way in yet — wait for them to seat
  before resetting."* / `RPS RESET BLOCKED — rods not at bottom`. Four generic fallbacks in
  the kernel are exactly the shape to avoid — *"That control is locked out for this
  exercise."*, *"Blocked by a plant interlock."* — and the first is the primary string for
  any instructor lock authored without a message. **Always author the message.**
- **U7** **Two paths stop a command silently and must stay silent.** A kernel drop and a
  `command_override` rewrite are deliberate deceptions (the stuck relief valve is the
  worked case). U6 does not apply to them. Every *other* refusal owes the player a message.
- **U8** **No text depends on colour alone.** The known exception is the piping: phase and
  temperature are pure stroke colour with no legend anywhere. Do not add more.
- **U9** **`ui/diagram/board/pwr_board_data.js` is GENERATED.** Never hand-edit it. String
  changes go through the re-export-safe override channel in `pwr_board_wiring.js` —
  `DOC_PATCHES` to replace, `DOC_REMOVE` to delete, `EXTRA_ITEMS` to add — applied at
  mount. Run `node test/verify_board_check.js` after any board change. *(Version 1.0 had no
  rule for a generated artifact, which is this repo's central interface-authoring
  constraint.)*
- **U10** **Length budgets are real and some already exist**: System Scanner `brief`
  ≤ **140 characters**, `detail` ≥ **80** (both gated by `run_inspect`); board button
  labels 2–11 characters in 35–95 px; the instructor chat clamps reading time at ~26 words.
  State a budget when specifying a **new** label family. Do not demand one for the
  number-tile label — it is derived and its length changes with the unit toggle.

---

## 7. Author and review checklist

Lines marked **[G]** are already enforced by a gate — run it rather than eyeballing.

**All classes**
- [ ] Text class identified for every block.
- [ ] **Every control is called what the screen calls it (N-1)** — checked against `CONTROL_LABEL_MAP`, not against what sounds right. No invented fuller names. **[G]** `run_manual_controls` (checklist `control` strings only)
- [ ] **Every name decodes (N-2)** — a reader who has not met it can tell what it is.
- [ ] **Every acronym spelled out with the acronym in parentheses at first use (N-3).** **[G]** (System Scanner copy only) `run_inspect`
- [ ] Every command, indication and label named in the text resolves in the registries. **[G]** `run_manual_commands`, `run_manual_controls`
- [ ] US customary first, SI in parentheses; differences converted with no offset. **[G]** `run_manual_units`
- [ ] Setpoints match the engine. **[G]** `run_manual_setpoints`
- [ ] No RBMK or BWR text authored.

**Procedural (P)**
- [ ] One action per step; flat integer numbering, no substeps.
- [ ] Every step carries a completion criterion, or is a deliberate observation step.
- [ ] **Each acceptance is safe as permission for the NEXT step**, and its value has a source.
- [ ] Steps describe indications; thresholds are program-relative where the program moves.
- [ ] Conditions precede actions; `IF/THEN` and `WHEN` used.
- [ ] No vague quantifiers; no shall/should/must.
- [ ] The checklist replays. **[G]** `run_checklist_pwr2`, `run_procedures_stack`

**Interface (U)**
- [ ] Buttons distinguished from selector positions and toggles.
- [ ] Board strings upper case; no hand-edit to the generated board file.
- [ ] Every refusal that is not a deliberate deception carries a message.
- [ ] New label families carry a character budget.

**Manual edits — three steps, in order, or `run_manual_rev` reddens** *(version 1.0 did not
mention this at all)*:
1. Add a row at the **top** of `Manuals/00_REVISION_HISTORY.md`. **Extend the pending row;
   do not open a new one** — the revision number only advances at a release *(OWNER
   DIRECTIVE, 2026-08-06: "The revision number only matters during a release to the
   website. Revision numbers should never go up until a release happens.")*. Write the row
   chapter-qualified with a `§`.
2. `node tools/stamp_manual_revision.js` — propagates and re-seals the content digests.
3. `node tools/pack_manuals.js` — refreshes the in-app copy.

---

## 8. Enforcement

Version 1.0 said the review checklist and search-for-banned-words were "the whole
enforcement mechanism, deliberately". That is false about this repo by thirteen
counterexamples (listed at the top). The precedent is explicit *(OWNER RULING, 2026-08-10:
selected "Cap at 25, evict to TRAPS.md")* — a cap written in prose inside the file it
governs does not hold; a cap in a runner does.

**`test/run_style.js` — BUILT 2026-09-03, 7 checks, baselined at `7checks 0failed`.** It
covers the vague-quantifier list, shall/should/must, the reversal constructions, percent
spacing, bare `MW`, and two Industry alarm-label shape rules, over the live PWR2 checklist
pool, the PWR alarm labels and `Manuals/*.md`.

**Every check was at ZERO when it was written, and that is the design.** A gate born red
teaches the next person to read past it; a gate born green fails the first time someone
authors the thing it forbids. `node test/run_style.js --self-test` breaks each check with
its own mutation and all seven go red — a check written beside its own fix is not proven
until you have made it fail. That mode forces a non-zero corpus and is never a baseline.

**The runner also prints a BACKLOG it deliberately does not score** — over-cap step texts
and the `Manuals/` banned-word tallies. Same split `run_manual_units` makes for its
coverage counts, for the same reason: a number that moves on every ordinary prose edit
teaches people to update it without reading it.

Everything marked **[JUDGEMENT]** stays a review conversation. Do not invent a gate for a
rule a grep cannot decide — a check that cannot fail is worse than no check.

---

## 9. Out of scope

- **Character writing.** Voice and dialogue construction belong to the scenario documents.
  This guide constrains only terminology and numbers in class V.
- **Scenario and beat structure.** `Blueprint/M6_instructor.md` and
  `Blueprint/pwr_training_campaign.md`. *(Version 1.0 deferred to a "scenario build
  methodology document" that does not exist.)*
- **Whether a feature ships at all.** `Blueprint/DESIGN_CRITERIA.md` — the four questions,
  which are binding.

---

## Revision history

| Version | Change |
|---|---|
| 1.1 | Rewritten against the as-built simulator after a 17-agent verification pass. Deleted the self-declared authority, the one-conversion-table rule, the closed-up percent, the player-clicked checkbox, the sequenced/unsequenced and continuous/reference-use distinctions, the scram ban, four wrong "do not use" entries and both RBMK term rows. Renamed the P/R/V/U axis to *text class* (the word "register" is taken) and added class C for chrome. Regenerated the seed term list from the shell registries — five of version 1.0's ten identifiers existed nowhere in the tree. Added §0 (the plant), §3.2 (acceptance criteria are safety claims), §3.4 (entry conditions), U9 (generated artifacts), the manual revision procedure, and a GATED/GATEABLE/JUDGEMENT mark on every rule. |
| 1.0 | Initial issue, written without access to the simulator. |

**Pending in 1.2 — the naming pass has NOT been run against the corpus.** A six-surface audit on
2026-09-03 (checklist, board, alarms, System Scanner, manuals, chrome), every proposed edit
adversarially re-checked at the code, found the defect is broader than acronyms and the worst of
it is rule N-1, not N-3. Verified examples, none applied:

- ~~`pwr_heatup` step 8 and `pwr_cooldown` step 7 name a **Safety Injection Accumulator valve**;
  the control is **Accumulator valve**.~~ **FIXED 2026-09-03**, the same day it was authored, by
  the agent that authored it. Kept here because it is the failure the section above is written
  around: the invented name was longer, more descriptive and more technically accurate than the
  board's, and a player scanning for it would have found nothing. Both steps now name the control
  exactly as the `control` field does, which is the check a writer can run without a gate.
- Three steps say *"at Norm"* for a rod speed; the button reads **MED**.
- One step says *"BORON card → AUTO"*; that card's buttons are **ON** and **OFF**.
- One step says *"take HPI and LPI to OFF"*; the string **LPI appears nowhere on the board**,
  and the one control is a **STOP** button on the **ECCS** card.
- The Procedures tab prints the raw initial-condition key (`hot_full_power`) where the screen's
  own label (**Hot Full Power (Mode 1)**) is one lookup away.

**Do not apply this list from here.** Every entry needs re-checking against the mounted board at
the time of the edit — see the trap above — and most of them are code, not documentation.
