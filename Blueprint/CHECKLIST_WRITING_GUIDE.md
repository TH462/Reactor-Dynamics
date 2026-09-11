# Walkthrough Writing Guide

**Status: ADVISORY.** Technique, not a Hard Rule. Where a gate enforces something it is named.

**The feature is a WALKTHROUGH** *(OWNER, 2026-09-08, #660 items 14–15)*. "Live checklist" is the
old name and survives only in code (`start_checklist`, `run_checklist`, `RD.MANUAL_PROCEDURES`,
this file's own filename). In anything a player reads, and everywhere below, it is a
**walkthrough** made of **steps**. The player finds them on the **Walkthroughs** tab of the Plant
& Mission window, which is the LIST; a running walkthrough is drawn in the **Instructor** tab,
whose role line reads "Walkthrough".

**Governs:** every string a player reads in a walkthrough — `title`, `purpose`, `prereq`,
`precond.text`, `cautions`, and each step's `text`, `note`, `control`, `target`, `why`,
`wait_hint` and `overtaken.text` in `RD.MANUAL_PROCEDURES.pwr2` (`ui/manual_procedures.js`).

**Built from:** two independent reviews of the six-leg Mode 5 → 100 % → Mode 5 chain on
2026-09-06, one by a licensed-operator reader and one by a layman reader, both working from the
rendered panel (`Diagnostic/CHECKLIST_REVIEW_2026-09-06_OPERATOR.md`,
`Diagnostic/CHECKLIST_REVIEW_2026-09-06_LAYMAN.md`); then three fresh-context layman playthroughs
of the whole chain on 2026-09-07 (#653, `Diagnostic/CHECKLIST_PLAYTEST_2026-09-07_LAYMAN*.md`,
packaged as the `layman-playthrough` skill); then the owner's own playtest of 2026-09-08 (#660),
which rebuilt the runtime this guide describes. Every *before* below is verbatim from the shipped
pool on the date named. This guide stands on its own; it does not inherit from any earlier style
document.

---

## 1. Two readers, one step line

A walkthrough step is read by two people at once, and they want different things from it.

| Reader | What they need from the step line | What loses them |
|---|---|---|
| **The layman** | Which button, on which card, and how they will know it worked. | A word that is not printed on the board. An abbreviation. A number they cannot find on a tile. |
| **The operator** | One action, its acceptance, and the caution *before* the action that needs it. | Two actions in one box. The outcome narrated instead of checked. A caution filed under "Why?". |

Both are served by the same discipline: **the step line names the board's own words, does one
thing, and says what done looks like.** The `why` serves the learner; the `note` serves the
hand; nothing else carries meaning the player must have.

**The test for every step:** a first-time player, reading only the white step line, can find
the control, do the one thing, and tell from a named tile whether it is done.

---

## 2. The rendering contract — what the player actually has in front of them

Write for the container, not for the page. The running panel is about 340 px wide (about 42
characters a line). Measured on the shipped build (`ui/app.js` `renderChecklist`):

- **ONE STEP AT A TIME** *(OWNER, 2026-09-08, #660 items 15–16)*. The card is the **current step
  only**, headed **"Step X of N"**. Done steps and steps ahead are not drawn — `renderChecklist`
  `continue`s past every step that is not active. There is no list to scroll, no pre-reading and
  no looking back. **A step cannot lean on the step before it being visible**: if the player needs
  a number, a lineup or a warning while step 9 is active, step 9 has to carry it.
- **The step line** (`text`) is white, numbered, and the head of the card. It is the field that
  is certainly read.
- **THE DETAILS ARE ALWAYS OPEN UNDER THE ACTIVE STEP** *(OWNER, 2026-09-08, #660 item 3: "The
  current step should have the why section automatically open.")*. `note`, the wait hint and `why`
  render unconditionally on the active step — there is no "Click to expand", no "Show all
  details", no toggle. **Every `why` is read, and its length is paid on every step.** That makes
  §7's F2 cap — three sentences, one causal chain, one number — **load-bearing rather than
  advisory**: a 130-word `why` is now 19 lines of grey between the player and the Continue button,
  on every step, for the whole leg.
- **The done-when lines** (generated from `acc`, or one line per `accs` entry) sit under the step
  line, `○` until met and `✓` when met.
- **`Watch for: <target>`** appears where `control` starts with "(observe"; **`Use <control>:
  <target>`** is drawn from the `control`/`target` pair otherwise — so both fields are
  player-facing prose, not metadata.
- **`Continue ▶` IS ON EVERY STEP** *(OWNER, 2026-09-08, #660 items 16–18)*. It is drawn dark and
  disabled until the instructor reports the step satisfied, then lights, with the note "Step done
  — press Continue." **Every step now waits for it — action steps as well as observations; the old
  "acknowledge to move on" observation step is gone as a separate kind.** The consequence for the
  author is the hard one: **a step with no acceptance the instruments can satisfy never lights
  Continue, and the player is stuck with no move.** Every step needs an `acc`, an `accs` set, or a
  command the instructor can see — see R7.
- **`⏪ Rewind step`** sits beside it. It takes the plant *and* the walkthrough back to the start
  of the previous step (`rewind {steps: 2, scope: 'full', exact: true}` — the newest checkpoint is
  the start of the current step). It is disabled on step 1 and whenever that checkpoint is not on
  the ring (`rewind_ready`; loading a saved game clears the ring). **So a step must be safe to
  re-enter from its own start state.** In particular, **a step whose acceptance is a command press
  must be re-pressable**: after a rewind the plant is back where it was, so a `cmd`-kind entry has
  to be one the player can issue again from that state and the plant will accept again. A press
  the plant refuses the second time (a permissive that has since cleared, a tool the plant has
  secured) leaves the rewound step unsatisfiable — which is the same failure `overtaken` exists
  for, arrived at backwards.
- **The wait hint** (⏩) is orange, the loudest thing on the card. It is read. It is **generated**
  from `hold` for any step of 180 s or more ("About N plant-hours at 1× — set the speed control to
  600×"), with the authored `wait_hint` string appended; `wait_hint: false` suppresses the whole
  line for a step where speed is dangerous.
- **A step checking off drops the clock to 1×** (`speed_snap` reason `step`, #619 item 6 — kept
  deliberately). **Any step that asks for a held rod pull must say so**, because the hold that
  moved 76 steps moves 4 the next time. The startup leg's rod note is the exemplar: *"The rods
  move with the clock, so 10× is fine for these pulls; check the speed before each one, because a
  step checking off, or a new warning or critical alarm, drops the clock back to 1× — the line
  under the speed buttons says why (Settings can switch the dropout off)."*
- **The speed bar has a status line of its own**, full width under the speed buttons
  (`syncWarpInfo`, #655). It is persistent where the old toast was momentary, and it says which of
  four things is true: the last automatic drop and its reason ("Dropped to real time — new alarm:
  Heatup Rate High"), a WARP lock with the plant's reason for it, what WARP is achieving while it
  runs, or that WARP is ready. **The player is told why WARP was refused or dropped, so a step no
  longer has to explain the clock** — it only has to say which rung to reach for and what will
  take it away.
- **The `note`** is grey; **the `why`** is a labelled, tinted block headed *"Why this step"*
  (#692 item 3 / #687 item 4, 2026-09-11). It used to be a second, dimmer grey, which is what
  made the two indistinguishable; the label is now what separates a binding instruction from
  optional background. **Neither is still where an instruction survives.**
- **Leg-level `cautions` ARE drawn during a run since #653 (2026-09-11)** — a collapsible amber
  block at the head of the panel, open before the leg starts moving and one click away after,
  with the COUNT always visible. `purpose` and `prereq` are still browse-card only. The
  `precond` banner is drawn once, latched at entry and never recomputed.
  **L5 below is retired by this: a caution no longer has to be repeated in a step line.** It is
  still correct to put a TIME-CRITICAL fact in the line — a caution one click away is not a
  caution the player reads at the moment it binds.

Consequences: the white line does the work; the always-open `why` is now a cost paid every step,
so it is short; the orange line gets the one time-critical fact; and nothing may depend on a step
the player can no longer see.

---

## 3. Three kinds of step, marked

Every step is one of three kinds, and the reader must be able to tell which from the first
word.

| Kind | First word(s) | Contains | Done when |
|---|---|---|---|
| **DO** | an imperative verb: PRESS, SET, START, OPEN, CLOSE, WITHDRAW, INSERT, RAISE, LOWER | exactly one action | a named tile reaches a stated value |
| **WAIT** | WAIT, or "Wait until …" | no action; what to watch, what not to touch | a named tile reaches a stated value |
| **VERIFY** | **Verify** | no action; the tiles, lamps and values that define the state | the listed tiles read as stated |

Rules that follow:

- **R1. Verb first.** The action is the first word. A precondition is a second sentence.
  *Before:* "Above P-10 (8 % power), press IR HIGH FLUX on TRIP BLOCKS."
  *After:* "Press IR HIGH FLUX on the TRIP BLOCKS card. Do this only once REACTOR POWER is above 8 %."
- **R2. One action per step.** Two actions with a required order are two steps, and the step
  line says why the order matters if it does.
  *Before:* "Press OFF on the RCP card, then set SPRAY to OFF."
  *After:* step *n*: "Press OFF on the RCP FLOW card." · step *n+1*: "Set SPRAY to OFF. Do this after the pumps stop: spray has no driving head without them."
- **R3. A VERIFY step contains no action.** A conditional action inside a verification is
  written as its own IF sentence, and the verification is still a verification.
  *Before:* "Confirm SG FEED is in AUTO before you add any heat. If it is not, press AUTO."
  *After:* "Check SG FEED reads AUTO. If it does not, press AUTO."
- **R4. A VERIFY step starts with the word "Verify" and names the lamp or the value; never
  "Nothing to press"** *(OWNER, 2026-09-08, #660 item 5: "No step should say that. They should
  just say what to check or say something like Close or verify Closed STEAM DUMP.")*. The layman
  review had asked for "Nothing to press" as the answer to "am I stuck or finished?"; the
  directive is that the verification wording carries that itself, and that the Continue button now
  answers it on every step anyway. All 14 verification steps in the pool were rewritten this way
  on 2026-09-08; the shipped heatup step 6 is the pattern:
  *Before:* "Nothing to press. Check the STEAM DUMP card: CLOSE lit and the status reading MANUAL."
  *After (shipped):* "Verify the STEAM DUMP is closed: CLOSE lit on the STEAM DUMP card, status reading MANUAL."
  The same step shows the second half of the rule — the verification is graded on
  `steam_dump_valve_pct`, the demand the valve is carrying, not on the setpoint box the step does
  not touch. **Name a lamp, grade the effect.**
- **R5. Never narrate the outcome in the step line. Make it the done-when.**
  *Before:* "Press SCRAM. Both banks drop and power collapses into the source range."
  *After:* "Arm the trip, then press SCRAM." · done when: "CONTROL and SHUTDOWN ROD POSITION 0 of 627, REACTOR POWER below 5 % and falling."
- **R6. A multi-stage action states the trigger for each stage.**
  *Before:* "Walk the DUMP SETPOINT down in steps: 1020, 640, 400, 240, 120 psi over about two and a half plant-hours."
  *After:* one step per stage — "Lower DUMP SETPOINT to 640 psi. Wait until AVG COOLANT TEMPERATURE stops falling before the next stage." — or, if the schema must keep one step, the rule for moving on is in the step line, not the `why`.
- **R7. EVERY step carries an acceptance the instruments can satisfy** — of any kind, but there
  has to be one. Since #660 every step waits for **Continue ▶**, and Continue lights only when the
  instructor reports the step met. A step with nothing to grade is a **soft lock**: the button
  never lights and the player has no move. Three legitimate forms, and the choice is not free:
  - a **predicate** (`acc`, or an `accs` entry) on a tile or a lamp — the default, and the only
    form a verification may use (P2);
  - a **command** (`{cmd, label}` in `accs`) where the plant shows nothing afterwards — the 1/M
    plot point is the case that justifies it. **A command-kind acceptance is only satisfiable
    while the plant still lets the player produce the command**, so it needs an `overtaken`
    (#641);
  - a **hold plus a predicate**, where the predicate is the reading the step tells the player to
    hold (P9).

---

## 4. Names: the board's words, and only the board's words

The layman's whole job is "find the button". A step that names a control by any word other
than the one engraved on it has failed before the verb.

- **N1. Every control is named by its exact on-screen string, in capitals, with the card it
  sits on.** Where the string is a column heading, say so.
  *Before:* "SHUTDOWN card, speed FAST, click WITHDRAW once."
  *After:* "On the ROD CONTROL card, under SHUTDOWN: press FAST, then click WITHDRAW once."
- **N2. Every indication is named by its tile.** "Tavg" appears 34 times in the shipped set
  and nowhere on the board; the tile reads **AVG COOLANT TEMPERATURE**.
  *Before:* "Ride the heatup to Hot Standby: Tavg at or above 541.4 °F (283 °C) at 1700 psig."
  *After:* "Wait until AVG COOLANT TEMPERATURE reaches 541 °F."
- **N3. One name per thing, everywhere.** The shipped set calls the pressurizer heaters *PZR
  HEATERS*, *the HEATER card*, *the heaters* and *the ladder*; the board says
  **PRESSURIZER (PZR)** card, **HEATER** column. A metaphor is not a name.
- **N4. If the control is a symbol on the diagram, say so.** The accumulator valve is a
  clickable valve symbol beside the ACCUMULATORS tile, not a button; "Open the Accumulator
  valve" sent the layman looking for a button that does not exist.
- **N5. Check the board before you author.** Names drift; the board is generated. The
  canonical table as engraved on 2026-09-06:

| Say this | Not this |
|---|---|
| **AVG COOLANT TEMPERATURE** (tile) | Tavg, the Tavg tile, RCS temperature |
| **PRIMARY PRESSURE** (tile) | pressure, RCS pressure, 363 psi |
| **SET PZR PRESSURE** (box on the PRESSURIZER (PZR) card) | Pressure SP, the pressure setpoint, the dial |
| **PRESSURIZER (PZR)** card, **HEATER** / **SPRAY** columns | PZR HEATERS, the HEATER card, the ladder |
| **RCP FLOW** card, **ON** / **OFF** | the RCP card, the pumps |
| **ROD CONTROL** card, **CONTROL** / **SHUTDOWN** columns; **SLOW** / **MED** / **FAST**; **WITHDRAW** / **INSERT** | the SHUTDOWN card, the bank, the rods |
| — under CONTROL the buttons are momentary: **tap** moves one step, **hold** drives at the selected speed (SLOW 7, MED 42, FAST 63 steps a minute). Under SHUTDOWN one **click** latches and the bank runs to its stop. Say which. | "withdraw about 60 steps", "click … again", "release" without saying which mechanic |
| **CONTROL ROD POSITION** / **SHUTDOWN ROD POSITION** (0 /627) | bank position |
| **SOURCE RANGE**, **INTER RANGE**, **STARTUP RATE** (NUC INSTR card) | SR, IR, SUR |
| **BORON** card, **ON** / **OFF** / **SAMPLE** | the make-up panel, boron control |
| **LETDOWN** card, **A+B 7 %** | the orifices |
| **STEAM DUMP** card, **AUTO** / **CLOSE**, **DUMP SETPOINT** | Dump SP, the DUMP SETPOINT box |
| **TURBINE-GENERATOR** card, **LOAD**, **LATCH** / **TRIP** / **UNLOAD** | Turbine Load |
| **SG FEED** card, **AUTO** | Feed Pumps, the three-element controller |
| **RHR** card, **ALIGN** / **ISOLATE**, **HX FLOW** | the RHR suction |
| **TRIP BLOCKS**, **IR HIGH FLUX**, **PR HIGH (LOW SETPT)**, **PZR PRESS LO-LO**, **SI REACTOR TRIP** | the 25 % trip, the rung |
| **SCRAM** — two presses: **PRESS TO ARM**, then **SCRAM** | "Press SCRAM" |
| **ACCUMULATORS** tile; the valve symbol beside it | the Accumulator valve (as if a button) |

When a name on the board is bad, fix the board; do not paper over it in prose.

---

## 5. Words: define at first *visible* use, or do not use them

The teaching layer of the shipped set lives entirely in the collapsed `why`. So the first
*visible* use of nearly every term is the undefined one. The layman stopped at "HCV-128",
"pcm", "P-11", "the point of adding heat", "in hand" and "WTSM", and none of these is
defined anywhere a player will see.

- **W1. A term is defined in the step line or `note` the first time it is visible in a leg —
  not in the `why`.** Legs are entered independently, so the definition repeats per leg.
  *Before:* "Below the point of adding heat there is no temperature feedback to stop you."
  *After:* "Below about 1 % power — the point where the reactor starts warming the water — nothing slows the climb for you."
- **W2. No abbreviation that is not printed on the board.** SUR is not on the board;
  STARTUP RATE is. RCS, CVCS, WTSM, HX, NIS, POAH are never used bare.
  *Before:* "Watch SUR and the intermediate range."
  *After:* "Watch STARTUP RATE and the INTER RANGE meter."
- **W3. An abbreviation that *is* on the board is expanded once per leg, on first use.**
  "safety injection (SI)" — then SI REACTOR TRIP reads as a button name.
- **W4. No document citations, tag numbers or block quotations in player text.** Provenance
  belongs in a source comment beside the step, or in the manual chapter. "(WTSM 8.1.1)",
  "(TS Bases B 3.5.1)", "the HCV-128 cross-connect" and a quoted paragraph from chapter 19 all
  reassure another author; to the player they read as a reproach.
  *Before:* "WTSM chapter 19: 'Prior to reaching 350 °F (176.7 °C) in the RCS … Terminate residual heat removal letdown to the CVCS'."
  *After:* "Real plants close this path before the coolant reaches 350 °F."
- **W5. No metaphor, aphorism or slang.** "The ladder", "the net", "rungs", "in hand", "the
  dial's world", "a landing, not a lunge", "the plant runs while you tap". Each occupies the
  place where the player expected the answer. Keep the causal chain; cut the caption.
  *Before:* "Full power is a landing, not a lunge."
  *After:* "Make the last pull small: 100 MWe of load lands power near 101 %, and the rods stop moving above 103 %."
- **W6. No second person in the step line; no simulator commentary anywhere the plant is
  speaking.** "Point 6 is your working prediction", "The clock holds itself at real time here
  until you do", "the walkthrough skips it", "There is no one-button 'connect grid' on this
  plant", and "Runnable." (six purposes) are all the game talking. Time-acceleration facts go in
  the wait hint and nowhere else. The one former exception, "Nothing to press", is **withdrawn**
  by R4; the Continue button answers that question now.
- **W7. One word, one meaning.** "Trip" is used as an event, a device and a setting; "leg" is
  used for a whole walkthrough and for a stage inside one; "block" means "switch off". Pick one
  sense and keep it; say "switch off the automatic shutdown at 25 %" rather than "block the
  trip".

**The glossary a player needs**, keyed to first visible use, is §3 of the layman review. Any
term in it that a step uses without its one-line definition is a defect in that step.

---

## 6. Numbers

- **U1. Quote the number the tile will show, in the unit the tile prints.** Six board tiles
  print `psi`; the accumulator tile prints `psig`. The shipped set writes psi, psig and psia
  for the same gauge — "363 psi to 1700 psig" in one clause; "1700 psig floor" in a step whose
  own target says "1716 psi"; "1615 psi" beside "1600 psig" for one interlock. The player
  has one gauge and it prints one unit. Write that unit, and the value that gauge displays
  at the moment the step is done.
- **U2. One number per setpoint or interlock, identical in every leg.** The accumulator
  power lock, the pressure-setpoint floor and the P-11 permissive each get one figure, used
  everywhere. A second figure for the same thing is a defect even if it is also correct.
- **U3. Round to the gauge.** "541.4 °F", "199.4 °F", "11.136 MPa" are decimals no tile shows.
  Write "541 °F". The engine's precision is the engine's business.
- **U4. Bands, not tolerances.** A generated done-when reads "within 14.4 °F (8 °C) of 547 °F",
  which asks the player to do arithmetic. Author the predicate so it renders as a band the
  tile can be read against: "AVG COOLANT TEMPERATURE between 533 and 561 °F".
- **U5. Measurements are not instructions.** "Measured on this plant: 87 °F/hr … and up to
  113.7 °F/hr on pump heat alone" is the author's homework. The step needs the limit and the
  control that holds it. Development evidence — A/B rides, "0.05 psi in 10 plant-minutes
  against +133 psi" — goes in the source comment beside the step, not in any player field.
- **U6. Rod moves name the plant criterion, and give the position as the means.** In the
  approach to criticality the target is the count rate (the sourced procedure steers on the
  nuclear instruments, owner-ruled 2026-09-03); elsewhere it is the temperature program.
  *Before:* "Withdraw the control bank about 60 steps at MED. Settle, plot."
  *After:* "Withdraw at MED until SOURCE RANGE reads about 1.4e3 (1,400 counts a second), about 60 steps. Stop. When STARTUP RATE is back near zero, press Plot point."
  *Before:* "insert about 20 steps to trim Tavg"
  *After:* "Insert the control bank until AVG COOLANT TEMPERATURE is back in its band, about 20 steps."
- **U7. Every number names what it is of.** "1.9 %" of what; "8.1 pcm" is meaningless without
  a scale ("a very small nudge"); "1.4e3" needs "1,400 counts a second" the first time in the
  leg.
- **U8. No SI anywhere in a walkthrough** *(OWNER RULING, 2026-09-06: "DO not include SI. There
  will be an option to switch between imperial and SI but i dont think thats been implemented
  yet.")*. The board prints °F, psi, %, gpm, MWe and cps, and the walkthrough prints the same.
  When a display-unit toggle is built, the conversion is the renderer's job, not the author's.
  **Gated:** `run_style` `checklist_no_si` scans every player-facing string of the pool,
  including the generated done-when labels. (The manuals keep their US-first-with-SI rule; this
  ruling is the walkthrough's.)

---

## 7. The fields, and what each may carry

| Field | Carries | Never carries |
|---|---|---|
| `text` | the one action, or "Verify …" + what to check; the caution that protects *this* step; the definition of a term on first visible use | outcome narration; a second action; a citation; the game's own behaviour; "you"; "Nothing to press" (R4) |
| `note` | how the control physically behaves (one click latches; MED moves *n* steps a minute); what a display's shorthand means (7.0e2 = 700); what will take the clock away during this step | an action or instruction — a grey note is where an instruction goes to die |
| `control` / `target` | the engraved name; the tile and value that show the *effect* — lamp **and** plant response | a lamp alone ("A+B 7 % lit" says nothing about letdown flow) |
| `why` | three things, in order: why this step here; where the number came from; what to watch while it runs. **Always open on the active step, so its length is paid every step** — three sentences (F2, `checklist_why_length`) | an instruction; a contingency action; a recovery procedure; measured development evidence; a citation mid-sentence; an epigram |
| `acc` / `accs` | the acceptance Continue lights on. **Required on every step (R7)** | a criterion the player must do arithmetic on (U4); an engine field name in the `label` — write the tile's own words |
| `accs[].hidden: true` | a **`cmd`-kind** entry the replay must issue (the harness presses the button) whose twin predicate entry already draws the lamp. Still graded; simply not printed. The heatup's pressurizer step is the case — `{cmd: {action:'set_spray', auto:true}, label:'AUTO pressed under SPRAY', hidden: true}` beside `{p:'spray_auto', …, label:'AUTO lit under SPRAY'}`, so "spray" is not on the card twice (#660 item 6) | a predicate entry — hiding a `p`-kind entry hides the criterion the player is being graded on |
| `overtaken` | `{p, op, v[, tol], label, text[, industry]}` — the plant condition under which this step **no longer applies** (#641). Graded like `acc` while the step is active; when it holds, the step checks off as `overtaken`, the card says so, `text` is posted as the instructor's comment, and the walkthrough moves on. **Required wherever the acceptance is a command the plant can stop accepting** | a condition that merely makes the step *harder* — `overtaken` says the step is moot, not that the player is late |
| `overtaken.text` | one sentence: what happened, and the step to go to | a mini-procedure repeated on six steps |
| `wait_hint` | the one time-critical fact of the step, phrased as the plant consequence, not as a speed-control tip. **`wait_hint: false` suppresses the generated speed line entirely** — for a step where the offered rung is dangerous (the criticality steps: at 60× power went 0 → 12 % between two glances) | anything the player needs that is not about time |
| `inject` *(incident)* | `[{failure, severity?, when?: {p,op,v[,tol]}}]` — failures the step fires **behind the scenes** (#670). No `when`: one broadcast into the step. With one: the first tick that predicate holds, graded instrument-first like `acc`. Fires once per step entry; a Rewind un-does it and re-fires on re-entry | a failure the player is supposed to cause — that is a `cmd`; a trigger on a channel this plant does not publish (it would never fire, silently) |
| `clear` *(incident)* | the same shapes, descending as `clear_failure` — the recovery half of a sequence, so a leg can put the plant back without the player opening the Failures tab | a tidy-up at the end of a leg — a failure that is still true when the walkthrough ends is the walkthrough's outcome, not a leak |
| `story` *(incident)* | `{clock, saw, knew, did}` — the historical clock, what was on the crew's board, what they concluded, what they then did. Drawn **above** the numbered instruction and never folded away; **2 sentences per field** (`checklist_story_length`) | the plant lesson — that is `why`; an instruction; the long-form account, which lives in the manual chapter the step cites |
| `crew` *(incident)* | `true` — draws *"the crew's action, as taken — not a recommendation"* beside the instruction. **Required on any step that asks the player to repeat an action that made the accident** | a step the player is meant to get right — the tag would then teach the opposite of what the step wants |
| `cautions` (leg) | the leg's binding limits, one per row — drawn during a run since #653 in a collapsible amber block, and the only place several of them exist | a time-critical fact that binds on ONE step; that belongs in that step's line, because the block can be collapsed |

Two rules the table implies, both broken repeatedly in the shipped set:

- **F1. If the `why` contains an instruction, it is a caution in the wrong field.** "ORDER
  MATTERS HERE, and getting it wrong costs you the align" (cooldown step 9), "If the rate
  crowds 100 °F/hr, raise HX FLOW on the RHR card" (heatup step 11), "HEATER to OFF, SPRAY
  held open, back down through 1600 psig" (heatup step 10) — each is the only statement of a
  load-bearing action, and each is in dim grey behind a click. Move it into the step line of
  the step *before* the one it protects.
- **F2. The `why` is at most three sentences and one causal chain, with at most one number.**
  **GATED since #692** (2026-09-11) — `run_style` `checklist_why_length`, which had been set at
  FOUR, one rung looser than this rule and than the owner's own words. Seven blocks were sitting
  in the gap.
  **This is the one rule in the file that the runtime made load-bearing** (#660 item 3): the
  details are always open under the active step, so there is no click between the player and the
  `why`, and no way for a long one to be skipped. Length is now paid on every step of every leg —
  the startup's step 2 was cut to two sentences by directive for exactly this reason (#660 item
  7). The five that taught the layman most (criticality; the boron sample; the reactor follows the
  turbine; borate before you cool; pumps as heater) are all that shape. The five that lost
  both readers each try to do three jobs — mechanism, provenance, contingency — and the
  contingency is the one that must not be there.

---

## 8. Leg-level text

- **L1. Title:** `<from Mode> → <to Mode> — <plain name>`. No "~" (render it as "about"), no
  id, no manual reference in the visible title.
- **L2. Purpose:** what the leg achieves, under what constraint, and roughly how long. Not
  the step list ("Borate …, block …, walk …, depressurize …, isolate …, align … and secure …"
  is the steps' job), not measured data, not "Runnable".
- **L3. Prerequisites and entry conditions are one list, written once.** Each line names a
  tile and a value and says whether it is auto-checked. Two lists in two wordings drift.
- **L4. A caution is a prohibition or an irreversible window, with the control that avoids it,
  in the first sentence.** Evidence last, or nowhere. A definition ("Hot Standby is hot AND
  subcritical") or a fact about the plant ("the source range needs no securing") is a note,
  not a caution; labelling notes as cautions dulls the real ones.
  *Before:* "Heatup rate limit: 100 °F/hr (55.6 °C/hr). Measured on this plant: 87 °F/hr (48.3 °C/hr) with the pressurization running, and up to 113.7 °F/hr (63.2 °C/hr) on pump heat alone. The RHR heat exchanger is the brake."
  *After:* "Do not exceed 100 °F/hr. Control the rate with HX FLOW on the RHR card."
- ~~**L5. Until leg cautions render during a run, each caution is repeated in the step line of
  the step it protects.**~~ **RETIRED 2026-09-11 (#653)** — they render now. What survives of it:
  a fact that binds at one MOMENT still belongs in that step's line, because the caution block
  can be collapsed and a collapsed caution is not read at the instant it applies.

---

## 9. Layout facts the writer must respect

- A step line of **three rendered lines is the ceiling** (about 120 characters). The shipped
  heatup leg has eight steps at or over it; splitting multi-action steps buys this back.
- **Keep a value and its unit on one line** (`7 %`, `2.5 MPa`): use a non-breaking space in
  the pair. "press A+B 7" / "% on the LETDOWN card" is what happens otherwise.
- **Never end a clause with a parenthetical acronym** — "(TURBINE-" / "GENERATOR card)" and
  "(Pressure" / "SP)" both wrapped mid-name.
- **Capitals are not emphasis.** In dim grey, ALL CAPS reads quieter, not louder. If a sentence
  needs emphasis it is in the wrong field (§7).

---

## 10. Before you commit a step — the review

Read the white line alone, as a first-time player:

1. Is the first word the action, or "Verify"?
2. Is there exactly one action?
3. Is every control named as engraved, with its card?
4. Is every indication named as its tile?
5. Is every term either on the board or defined in this leg before this step?
6. Is there a done-when a tile can be read against, as a band, with no arithmetic?
7. Does the step line say what happens, or does it say what to do?
8. Is any instruction hiding in the `note`, the `why` or the `overtaken` text?
9. Is any caution filed *after* the step it protects, or in a field that does not render?
10. Is every number the one the tile shows, in the tile's unit, used identically in every leg?
11. Would the sentence still be there if it were not helping the player? Then cut it.
12. **Is there an acceptance the instruments can satisfy, so Continue will light?** (R7 — a step
    without one is a soft lock, not a slow step.)
13. **Does the step read correctly with nothing else on screen?** No step before it, no step after
    it — only this card (§2).
14. **Is it safe to re-enter from its own start state after a ⏪ Rewind?** If the acceptance is a
    command press, can the player press it again from there and will the plant take it?

Then read the `why` as a learner: one causal chain, three sentences, one number, no
instruction, no citation mid-sentence, no epigram — and remember it is open in front of them
whether they wanted it or not.

---

## 11. Learned from a layman playing the chain (2026-09-07)

A fresh agent with no repo access played all six legs in the sim
(`Diagnostic/CHECKLIST_PLAYTEST_2026-09-07_LAYMAN.md`). Three legs could not be finished. The
rules the failures add:

- **P1. Never tell the player to press a button that is already lit.** "Set 719 and press ON"
  on a channel that boots ON re-engaged it mid-dose, and the kernel left the dilution running
  with no target (fixed in the kernel; the text now says "press ON only if it is not lit"). A
  press the plant does not need is a press the plant may misread.
- **P2. A verification step carries no `cmd`.** A step with a `cmd` and no predicate completes only when
  the command is seen, so "Check SG FEED reads AUTO" could not tick without the press it forbade.
  Grade a verification on the lamp or the value.
- **P3. State the seam a chained plant arrives on.** Each leg is replayed from its own preset,
  which cannot see what the previous leg left behind: the steam dump was in TAVG mode after the
  shutdown leg, so the cooldown's DUMP SETPOINT walk did nothing until AUTO was pressed again.
  If a step depends on a mode or lineup the preset provides, the step says how to check it and
  how to set it.
- **P4. Say which preset a leg is not written for.** The ascension leg from a power preset finds
  the control bank on its top stop, where every WITHDRAW is a no-op. A precondition that names
  the tile and the value warns the player before the first dead press.
- **P5. No speed hint where the reactor can get away.** At 60× the criticality step went from
  0 to 12 % power between two glances. `wait_hint: false` suppresses the generated hint; say
  "stay at 1×" instead.
- **P6. A stop condition in the text is the same reading as the done-when.** "Hold INSERT until
  STARTUP RATE reaches 0.00" was satisfied after one step while the done-when wanted power below
  5 %. Name the reading the step actually ticks on.
- **P7. Say what to do with a window that opens on top of the board.** The 1/M PLOT window
  covers the TURBINE-GENERATOR card; nothing said to close it, and the LATCH press landed on
  the plot.

The second playthrough (same day, after those fixes: 4 of 6 legs) added three more:

- **P8. A number in a step is a number the player will type at once.** "Lower DUMP SETPOINT
  in stages: 640, then 400 …" was replayed by the harness as a smooth ramp and typed by the
  player as a 380 psi step: 50 °F in one plant-minute and an empty pressurizer. If the plant
  needs a rate, the step gives the increment and the wait ("50 psi at a time, about 5
  plant-minutes each"), and the note gives the number that proves it.
- **P9. A stage ticks on the reading it tells the player to hold.** The ascension stages said
  "adjust the rods until AVG COOLANT TEMPERATURE is inside its band" and ticked on load and
  power only; the coolant ran 20 °F hot for four stages and tripped on temperature. If the
  text names a reading, the acceptance carries it, even as a ceiling.
- **P10. The replay's route is not the player's speed.** Spray at 100 % reached the wait
  step's target before the pressurizer went solid on the replay, and not on a player who
  took two minutes longer. Measure the slow route before authoring the fast one, and prefer
  the setting that leaves a margin (50 %) to the one that only just works. The cooldown's spray
  stage is the shipped answer: **50 %**, accepted at 1615 psi where the valve regains power, with
  the wait step naming PRESSURIZER LEVEL. Measured through the gate's own harness at the end of
  the wait step: 100 % → 154 psi at level 69 %, window about 4.5 min; 50 % → 233 psi at 66 %,
  window over 5 min; 20 % → 465 psi, too slow.

The third playthrough (2026-09-07, on the pass-2 tree) completed **all six legs, 67 steps**, and
what cost it time was the board and the clock rather than the wording. **Its claims were
re-measured before any of them was filed, and three did not survive** — they are named in P13 and
in §12, because an unchecked playtest diagnosis is a claim like any other (HR12).

- **P11. Name the indicator that MOVES.** The startup's boron step named `BORON CHEM`, which is
  the lab result and does not move until a sample completes; the reading that moves is `BORON
  STATUS` on the diagram, counting `DILUTING 196→`. The player spent two commands convinced the
  dilution had not started. The cooldown's step 1 is the pattern — *"Do not start cooling until
  BORON STATUS reads BORATING"* — and behind it the kernel now counts **delivered** ppm rather
  than commanded (`boron_rate_delivered`, #654: the dose used to land 638 for a 600 target and
  then re-anchor the target to the shortfall, so the board reported the number the operator had
  typed). A batch dose is authorable against a number the player can trust only because the
  totalizer counts what the plant delivered.
- **P12. Fix a seam in the leg that CAUSES it, not the leg that trips over it.** After the
  shutdown leg the steam dump sits in TAVG mode, so the cooldown's whole DUMP SETPOINT ladder was
  inert. Pass 1 patched the cooldown (P3); pass 3 moved it: **the shutdown leg now presses STEAM
  DUMP AUTO after the scram**, graded on the valve carrying flow. A leg that leaves the plant in a
  state its own successor cannot use owns the fix.
- **P13. A step that needs a held control says what will take the clock away.** Rod pulls of 90 to
  225 steps are two minutes of held mouse button at 1×, and the player's diagnosis — *"the clock
  reverts on its own; pressing a lit speed button puts you back to 1×"* — was **measured false**:
  60× stays 60× by button and by key. The real cause was the two drops the sim makes on purpose —
  **a step checking off**, and **a new unacknowledged warning or critical alarm**. So the rod steps
  now carry the fact in the `note` (§2), and the speed bar's status line says which one fired.
  **Do not author around a symptom a playtest reports; measure what actually moved.**
- **P14. Recovery text must name the thing that will actually clear the condition.** The ascension
  stage said *"adjust the rods until AVG COOLANT TEMPERATURE is inside its band"*; the LOAD box had
  moved 90 → 53 on its own — the turbine running back against the hot coolant, the plant protecting
  itself — and 38 steps of INSERT moved temperature 3 °F and then stopped. Seven minutes of wall
  time, and the recovery was not derivable from the step. A stage now says what a LOAD that changes
  by itself means. **If the plant has an automatic action that can defeat the step's own
  instruction, the step names it.**
- **P15. Grade a state on the state, never on a press the player may already have made.** The
  cooldown's heater-and-spray step was `cmd`-graded, and the matcher latches per *active* step: a
  HEATER OFF pressed while the previous step was up was never seen, so the board read `OFF` lit and
  `HTR PWR 0 %` while the step stayed unticked through 1615 → 1299 psi, with no move available. It
  is now two one-action steps graded on the lamps. Same family as P2.
- **P16. The done-when line speaks the board's words too.** The generated labels used engine names
  — `Tavg`, `Steam dump demand`, `RHR suction` — beside tiles engraved AVG COOLANT TEMPERATURE and
  STEAM DUMP, and "there is no demand number on that card" was a stuck point in its own right. The
  `PRED_DISPLAY` map and the `accs` labels now print the tiles' own words. **N2 governs the
  acceptance line, not only the step line** — and when the text names a target and the acceptance
  is a ceiling, say which is which: *"below 583 °F (the band is near 562)"*.
- **P17. Name the alarm the walkthrough itself will raise.** Following the steps as written raised
  four alarms none of them mentioned — the accumulators lined up below their isolation pressure,
  shutdown cooling out of service, the rod insertion limit while *withdrawing*, and the cooldown
  rate the walk's own pace produces. A caution the plant is about to shout is not a surprise the
  player should have to absorb alone; the heatup and the dump walk now name theirs. (The insertion-
  limit one also read as `ROD LIMIT LO-LO` in a `why` while the banner said "Control Rods —
  Insertion Limit": N3 covers alarm names too.)

## 12. What is the renderer's job, not the writer's

Found by the reviews and the three playthroughs (#653); a writer works around what is left per §2
until it lands.

**Closed by the #660 rebuild — do not write around these any more:**

- ~~The done-when line is drawn only on the active step~~ — the *whole card* is the active step
  now, by design (§2). What survives of the lesson is stronger: **nothing may depend on a step the
  player can still see**, because none of them are visible.
- ~~"Hide all details" sits inside the flowing subtitle sentence~~ — the toggle is gone; the
  active step's details are always open. (`cklState.whyAll` and its click handler are vestigial;
  no markup emits the button.)
- ~~The "checked by hand" line~~ and ~~the acknowledge row that only observations got~~ — every
  step now ends in the same **⏪ Rewind step / Continue ▶** row, and a done step is not drawn.

**Still open:**

- **#656** — *(OPEN as of 2026-09-08)* an observation step's button was not drawn until an
  unrelated re-render (ascension step 10). The render key now carries `awaiting_ack` and
  `rewind_ready`, which is the class of cause; the issue is not closed, so a step whose acceptance
  can be met between broadcasts is still worth a second look in the browser.
- ~~Leg `purpose`, `prereq` and `cautions` are never drawn during a run~~ — **FIXED #653,
  2026-09-11**: `cautions` render in a collapsible amber block at the head of the running panel.
  `purpose` and `prereq` are still browse-card only, and that is deliberate: the panel draws ONE
  step (#660 item 15) and a leg's purpose is answered by having opened it.
- ~~The `note` and the `why` are nearly indistinguishable (two greys)~~ — **FIXED #692/#653**:
  the `why` is a labelled, tinted block headed *"Why this step"*.
- ~~The orange wait hint is the loudest element, above the step's own limit~~ — **FIXED #653**:
  the amber is now the caution block's, and the speed rung reads as advice.
- ~~The tilde in "~15 %" renders literally~~ — gone from the pool; measured 0 sites 2026-09-11.
- ~~No MODE readout exists on the board~~ — still true of the BOARD, and still an open
  nice-to-have. **Answered for the walkthrough at #653**: a `plant_mode` criterion now prints the
  live mode beside it — *"When Plant in Mode 3, Hot Standby — the plant reads Mode 5, Cold
  Shutdown (true value)"* — so a "Confirm Mode N" step says what it is waiting for AND what it
  has. The step still lists the tiles that define the mode.
- **The done-when is drawn on the ACTIVE step only**, and since #660 item 15 no other step is
  drawn at all, so a one-way window cannot be pre-read from the step before it. That is a RULING,
  not a defect — the fix inside it is to name the coming window in the previous step's `note`,
  which the heatup's Pressure SP step now does for the accumulator window.

---

## 13. Steps that wait on the plant

The commonest way a walkthrough loses a player is a step where the right action is **no action**.
The player's instinct is to press something, and pressing something is usually how the approach to
criticality overshoots. Such a step owes two things the others do not: **what to watch**, and
**what not to touch**.

The startup leg's approach to criticality is the exemplar, and it is instrument-driven throughout
— the position is the *means*, the meter is the *criterion*:

- **Withdraw to what the instrument predicts, then creep.** *(OWNER, 2026-09-08, #660 item 8:
  "Step 10 should tell user to set rod position to the critical position shown in the 1/m plot.
  Currently, there is nothing to tell the user how to actually use the 1/m plot except plotting
  points.")* Shipped: *"Press SLOW and hold WITHDRAW until CONTROL ROD POSITION reaches the
  position the 1/M panel predicts, then release. From there tap WITHDRAW one step at a time and
  wait after each. Critical: the counts keep climbing and STARTUP RATE stays positive with the rods
  still."* The `note` says how far the prediction can be trusted — measured with the panel's own
  last-three fit on the replay's counts, it runs 264 → 241 → 217 → 211 → 213 against a true
  critical of 223, so it is high early and about ten steps low at the end, which is *safe to go
  to*. **A number a step tells the player to steer by needs its measured error beside it.**
- **Let the plant do it; add a step only when the meter says the last one is spent.** *(OWNER,
  2026-09-08, #660 item 11: "Tapping withdraw 2 more times is not always the best approach. The
  user will usually overshoot at this point. These steps should take an instruments based
  approach. Usually waiting is best here if startup rate is high.")* Shipped: *"Let power climb on
  its own while STARTUP RATE is positive; do not add steps. Only if STARTUP RATE falls back to 0.00
  with REACTOR POWER still below 0.5 %, tap WITHDRAW one step at SLOW and wait again. Watch INTER
  RANGE: SOURCE RANGE switches itself off above 1.0e5."*
- **Name the handover.** The same step, and then its own confirmation — *"Verify SOURCE RANGE has
  switched itself off and INTER RANGE is reading. Close the 1/M PLOT window with its ✕; its work is
  done."* — teach the instrument change rather than leaving the player to survive it. The layman
  called this trio the sequence that made the two steps before it make sense.

The pattern, generalised:

1. **The criterion is a meter, not a position or a count of presses.** State the reading and its
   direction ("STARTUP RATE positive and steady with the rods stopped, at or under 1.0").
2. **Say what not to do**, in the step line, in the same breath as what to do. "do not add steps"
   is the whole instruction on the criticality step.
3. **Say what the plant will do by itself**, so it is not read as a fault — the source range
   securing, the RHR card switching to ISOLATE, the reactor following the turbine.
4. **Suppress the speed hint where the plant can get away** (`wait_hint: false`) and say the rung
   in the `note` instead: *"Stay at 1× from here until power settles near 1 %: at 60× the reactor
   can run from 0 to 10 % between two glances."*
5. **A command-kind acceptance on such a step needs an `overtaken`** — the plant may move past the
   step while the player is correctly doing nothing (#641).

---

## 14. Incident walkthroughs

An incident walkthrough reconstructs a real accident: the failures arrive behind the scenes on the
step that needs them, some steps ask the player to repeat the mistakes that made it, and the plant
is deliberately misbehaving rather than being driven. **Nothing in §1–13 is suspended** — the
rules below are additions. The runtime is #670 Phase 1 (`inject`, `clear`, `story`, `crew`, all in
the §7 table); these rules are what the first one, `pwr_tmi2_incident`, actually needed
(#670 Phase 2, 2026-09-09; measurements in `inbox/tmi_phase2/MEASURED.md`).

**The `story` block competes with the `why` for the same reader on the same card.** Both are
prose, both are always open on the active step, and there are four narrative lines to one `why`.
That is why `checklist_story_length` caps each field at two sentences — the same argument that
made F2 load-bearing. `story` is what happened; `why` is the plant lesson; the long-form account
lives in the manual chapter the step cites.

- **I1. Every `story.clock` comes from a primary source, and derived clocks are marked as
  derived where the source is quoted.** The TMI-2 leg's clocks are NUREG/CR-1250 Vol. II Pt 2
  Appendix II.1, extracted with a verbatim quote per row into `inbox/tmi_timeline_sourced.md`;
  only 04:00:36 and 04:00:37 are wall clocks the appendix states, and every other one is that
  arithmetic. A clock nobody can check is an unsourced claim in player-facing copy (HR11, and
  the standing rule that an unmeasured claim in player copy is still an unmeasured claim).
- **I2. `story.knew` quotes the crew, or the report on the crew — never a paraphrase that gives
  them confidence they did not have.** "Light off indicates solenoid deenergized. There is no
  actual position indicator." is the step. "They did not realise the valve was open" is a verdict
  the player is supposed to reach for themselves. W4 forbids document citations in player text and
  this is the exception that proves it: the quote is the content, the *citation* stays in a source
  comment beside the step.
- **I3. `crew: true` goes only on a step that ASKS the player to act** — a step with a `cmd` or a
  cmd-kind `accs` entry. On a verification the tag teaches the opposite of what the step wants,
  because there is nothing for the player to have done. Gated: `run_checklist` fails a `crew` tag
  with no command behind it, and fails any of the four fields appearing in a leg whose category is
  not `incident`.
- **I4. AN INJECTION HAS A WINDOW, AND THE WINDOW IS A PLANT FACT YOU MUST MEASURE.** This is the
  rule that will bite. The step that fires a failure is not always the step the narrative puts it
  on: TMI-2's stuck relief valve is step 3's story, and arming it on step 3 does not work, because
  the valve lifts at 5.5 s and reseats near 25 s and the stick has to be in before that. Measured
  by arming at nine different seconds: at 0/2/5/10/15/20 s the plant runs the accident; at
  30/45/60 s the valve had already reseated and the plant sits at 1985 psia with level 41 %, no
  accident at all. **A live player takes an unbounded time to press Continue**, so a failure whose
  window is shorter than a human pause belongs on the EARLIER step, with a source comment saying
  which measurement put it there.
- **I5. A step's `cmd` is issued at step START, so a long wait belongs to the step BEFORE the one
  that acts.** The replay drives `hold` seconds after issuing; the live player presses Continue
  when the acceptance lights. Getting this backwards puts the crew's 1 h 13 min action on the
  board at 10 minutes.
- **I6. Make the wait real with an acceptance the plant cannot satisfy early.** A step whose only
  criterion is "press the button" ticks the moment the player presses it, however wrong the clock
  is. Pair the action's effect with a reading that arrives on the historical schedule — the pump
  securing is graded on the cavitation alarm clearing AND on PRESSURIZER LEVEL finally coming off
  the top of the scale near 65 plant-minutes.
- **I7. Grade the instrument the story is about, not the truth behind it.** The stuck valve's step
  is graded on the tailpipe temperature, because the PORV lamp is failed stuck-closed in the same
  breath and `true_state.porv_open` would tick the step off a fact the player cannot see. HR1 is
  sharper here than anywhere else in the pool: the whole subject is an instrument that disagrees
  with the plant.
- **I8. State the model's gaps in the step, not in a document.** Design Criteria Q3 wants a
  declared departure. The TMI-2 leg says in its last step's `why` that the fuel damage, the
  radiation alarms and the hydrogen burn are outside this model and are being told rather than
  run, and gives the number that shows the size of it (peak fuel 1297 °F here against a real core
  far past 2500 °F). The same applies to a divergence mid-leg: this plant trips on
  over-temperature difference near 53 s where TMI-2 tripped on pressure at 8 s, and that sentence
  is in the step it belongs to.
- **I9. An `incident` leg is not part of the operating cycle.** It names no `next`, it declares
  `category: 'incident'` (last in `CKL_CAT_ORDER`), and it is registered in `site/flags.js` so the
  channel it ships on is a decision somebody made. `run_checklist_pwr2` gates the chain and the
  ordering separately; `verify_ckl_relevance` gates the rendered position.
- **I10. `procedures_harness` treats `incident` as a casualty category.** The reactor trips on the
  second step and critical alarms stand for the whole run, so the "no unexpected scram" and "no
  critical alarm standing at end" assertions do not apply. The `guard` block still does, and on an
  incident leg `never_melted` is the assertion that the plant stayed inside its envelope.
