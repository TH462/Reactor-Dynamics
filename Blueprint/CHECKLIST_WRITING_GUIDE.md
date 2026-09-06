# Checklist Writing Guide

**Governs:** every string a player reads in a live checklist — `title`, `purpose`, `prereq`,
`precond.text`, `cautions`, and each step's `text`, `note`, `control`, `target`, `why`,
`wait_hint` and `overtaken.text` in `RD.MANUAL_PROCEDURES.pwr2` (`ui/manual_procedures.js`).

**Built from:** two independent reviews of the six-leg Mode 5 → 100 % → Mode 5 chain on
2026-09-06, one by a licensed-operator reader and one by a layman reader, both working from the
rendered panel (`Diagnostic/CHECKLIST_REVIEW_2026-09-06_OPERATOR.md`,
`Diagnostic/CHECKLIST_REVIEW_2026-09-06_LAYMAN.md`). Every *before* below is verbatim from the
shipped pool on that date. This guide stands on its own; it does not inherit from any earlier
style document.

---

## 1. Two readers, one step line

A checklist step is read by two people at once, and they want different things from it.

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

## 2. What the panel actually shows

Write for the container, not for the page. The running panel is about 340 px wide (about 42
characters a line). Measured on the shipped build:

- **The step line** (`text`) is white and always visible. It is the only field guaranteed to
  be read.
- **The done-when line** (generated from `acc`/`accs`/`saw`) is drawn **only on the active
  step**. Steps ahead show their text line and nothing else, so the player cannot pre-read a
  criterion. (A renderer defect, tracked separately; write as if it were fixed, but never rely
  on a criterion to carry a warning the player needs *before* the step goes active.)
- **`Watch for: <target>`** appears under the active step where no predicate exists, and
  **`Use <control>: <target>`** is drawn from the `control`/`target` pair — so both fields are
  player-facing prose, not metadata.
- **The wait hint** (⏩) is orange, the loudest thing on the card. It is read.
- **The `note`** is grey. **The `why`** is dimmer grey, behind "Click to expand", with a thin
  left rule. At panel width a 130-word `why` is 19 lines of the least legible text on screen.
  Two shades of grey separate a binding instruction from optional background.
- **Leg-level `purpose`, `prereq` and `cautions` are not drawn at all while a checklist runs**
  (`ui/app.js` draws them on the manual browse card only). Until that changes, **a caution
  that must be read lives in a step line.**

Consequences: the white line does the work; the orange line gets the one time-critical fact;
the grey lines get context that is safe to skip.

---

## 3. Three kinds of step, marked

Every step is one of three kinds, and the reader must be able to tell which from the first
word.

| Kind | First word(s) | Contains | Done when |
|---|---|---|---|
| **DO** | an imperative verb: PRESS, SET, START, OPEN, CLOSE, WITHDRAW, INSERT, RAISE, LOWER | exactly one action | a named tile reaches a stated value |
| **WAIT** | WAIT, or "Wait until …" | no action; what to watch, what not to touch | a named tile reaches a stated value |
| **CHECK** | CHECK, or "Check … Nothing to press." | no action; the tiles and values that define the state | the listed tiles read as stated |

Rules that follow:

- **R1. Verb first.** The action is the first word. A precondition is a second sentence.
  *Before:* "Above P-10 (8 % power), press IR HIGH FLUX on TRIP BLOCKS."
  *After:* "Press IR HIGH FLUX on the TRIP BLOCKS card. Do this only once REACTOR POWER is above 8 %."
- **R2. One action per step.** Two actions with a required order are two steps, and the step
  line says why the order matters if it does.
  *Before:* "Press OFF on the RCP card, then set SPRAY to OFF."
  *After:* step *n*: "Press OFF on the RCP FLOW card." · step *n+1*: "Set SPRAY to OFF. Do this after the pumps stop: spray has no driving head without them."
- **R3. A CHECK step contains no action.** A conditional action inside a check is written as
  its own IF sentence, and the check is still a check.
  *Before:* "Confirm SG FEED is in AUTO before you add any heat. If it is not, press AUTO."
  *After:* "Check SG FEED reads AUTO. If it does not, press AUTO."
- **R4. Say "Nothing to press" on every CHECK and WAIT step.** It is two words, it is the best
  two words in the shipped set, and it answers "am I stuck or am I finished?" — the commonest
  layman question.
  *Before:* "Confirm the letdown transfer: RHR suction autoclosed, letdown now on the orifices."
  *After:* "Nothing to press. The RHR suction valve shut itself at 585 psi, so letdown is now on the orifices you opened in step 7. Check LETDOWN is not reading 0 gpm."
- **R5. Never narrate the outcome in the step line. Make it the done-when.**
  *Before:* "Press SCRAM. Both banks drop and power collapses into the source range."
  *After:* "Arm the trip, then press SCRAM." · done when: "CONTROL and SHUTDOWN ROD POSITION 0 of 627, REACTOR POWER below 5 % and falling."
- **R6. A multi-stage action states the trigger for each stage.**
  *Before:* "Walk the DUMP SETPOINT down in steps: 1020, 640, 400, 240, 120 psi over about two and a half plant-hours."
  *After:* one step per stage — "Lower DUMP SETPOINT to 640 psi. Wait until AVG COOLANT TEMPERATURE stops falling before the next stage." — or, if the schema must keep one step, the rule for moving on is in the step line, not the `why`.

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
  *After:* "Wait until AVG COOLANT TEMPERATURE reaches 541 °F. Nothing to press."
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
  until you do", "the checklist skips it", "There is no one-button 'connect grid' on this
  plant", and "Runnable." (six purposes) are all the game talking. Time-acceleration facts go in
  the wait hint and nowhere else. **Exception:** "Nothing to press" (R4) stays.
- **W7. One word, one meaning.** "Trip" is used as an event, a device and a setting; "leg" is
  used for a whole checklist and for a stage inside one; "block" means "switch off". Pick one
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
- **U8. US customary units, SI pair — RULING NEEDED.** Both reviewers found the SI pair
  doubles the densest lines in a 42-character column, and the board prints no SI anywhere.
  The standing owner directive (2026-07-29) requires US first with SI in parentheses in the
  manuals and in everything handed to the owner, and `run_manual_units` enforces it on this
  file. **Recommendation:** the step line carries the US figure only, as the tile shows it; the
  SI pair appears once, in the `why`, where the term is taught. Until ruled, pair every
  dimensional quantity or none within a step — never some.

---

## 7. The fields, and what each may carry

| Field | Carries | Never carries |
|---|---|---|
| `text` | the one action (or "Nothing to press" + what to check); the caution that protects *this* step; the definition of a term on first visible use | outcome narration; a second action; a citation; the game's own behaviour; "you" |
| `note` | how the control physically behaves (one click latches; MED moves *n* steps a minute); what a display's shorthand means (7.0e2 = 700) | an action or instruction — a grey note is where an instruction goes to die |
| `control` / `target` | the engraved name; the tile and value that show the *effect* — lamp **and** plant response | a lamp alone ("A+B 7 % lit" says nothing about letdown flow) |
| `why` | three things, in order: why this step here; where the number came from; what to watch while it runs | an instruction; a contingency action; a recovery procedure; measured development evidence; a citation mid-sentence; an epigram |
| `wait_hint` | the one time-critical fact of the step, phrased as the plant consequence, not as a speed-control tip | anything the player needs that is not about time |
| `overtaken.text` | one sentence: what happened, and the step to go to | a mini-procedure repeated on six steps |
| `cautions` (leg) | *(not rendered during a run — see §2)* | anything the player must read |

Two rules the table implies, both broken repeatedly in the shipped set:

- **F1. If the `why` contains an instruction, it is a caution in the wrong field.** "ORDER
  MATTERS HERE, and getting it wrong costs you the align" (cooldown step 9), "If the rate
  crowds 100 °F/hr, raise HX FLOW on the RHR card" (heatup step 11), "HEATER to OFF, SPRAY
  held open, back down through 1600 psig" (heatup step 10) — each is the only statement of a
  load-bearing action, and each is in dim grey behind a click. Move it into the step line of
  the step *before* the one it protects.
- **F2. The `why` is at most three sentences and one causal chain, with at most one number.**
  The five that taught the layman most (criticality; the boron sample; the reactor follows the
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
- **L5. Until leg cautions render during a run, each caution is repeated in the step line of
  the step it protects.**

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

1. Is the first word the action, or "Nothing to press"?
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

Then read the `why` as a learner: one causal chain, three sentences, one number, no
instruction, no citation mid-sentence, no epigram.

---

## 11. What is the renderer's job, not the writer's

Found by the reviews, tracked as product defects in #653; a writer works around them per §2
until they land:

- Leg `purpose`, `prereq` and `cautions` are never drawn during a run.
- The done-when line is drawn only on the active step, so a one-way window (heatup step 10)
  cannot be pre-read while doing step 9.
- The `note` and the `why` are nearly indistinguishable (two greys).
- The orange wait hint is the loudest element, above the step's own limit.
- "Hide all details" sits inside the flowing subtitle sentence.
- The tilde in "~15 %" renders literally.
- No MODE readout exists on the board, so every "Confirm Mode N" step has nothing to confirm
  against; the step lists the tiles that define the mode instead.
