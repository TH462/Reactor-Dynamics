> **Record, not policy.** Independent readability review of the six PWR2 live checklists (Mode 5 → 100 % → Mode 5), 2026-09-06, by a fresh agent reading only the extracted checklist text and rendered-panel screenshots, in the role of a licensed operator. The writing guide it fed is `Blueprint/CHECKLIST_WRITING_GUIDE.md`.
>
> **Two corrections, measured after the review:** (1) its "30 of 67 steps have no acceptance" and "Leg 4 self-checks nothing" were read from an extract that omitted the `accs`/`saw` predicate forms — measured on the built pool, only **6 of 67** steps lack any predicate (startup 3, 16, 17; ascension 2, 10; rampdown 1). The observation that stands is the RENDER one in §6.2: the panel draws the done-when line only on the active step. (2) The accumulator valve is a clickable valve symbol on the diagram, not a card button.

# Procedure-writing review — PWR2 live checklists (6 legs, 67 steps)

Reviewer's frame: licensed SRO reading this as a set of General Operating Procedures. I am judging
whether a crew could pick these up cold, use them at the boards, and place-keep them without
guessing. I am not judging the physics.

**Headline judgement.** This reads as very good *training narrative* and mediocre *procedure*. The
author knows the plant and knows what the operator will get wrong — that knowledge is real and it
is mostly in the wrong field. The step lines carry rationale, outcome narration and simulator
commentary; the `why` panels carry cautions, contingency actions and recovery procedures. Roughly
**27 of the 67 step lines contain two or more distinct actions**, **30 of 67 have no automatic
acceptance at all** (Leg 4 has none whatsoever, and Leg 3 ends on a step that can never check off),
and at least **six load-bearing cautions live inside a collapsed `why` panel** where the operator
reads them only after the mistake. Fixing this is mostly re-filing, not rewriting.

---

## 1. Systemic patterns

### P1 — The step line is not an instruction; it is an instruction plus a sales pitch

The most common shape in this file is `ACTION : LOCATION . ASSERTION-ABOUT-WHAT-WILL-HAPPEN`. The
third clause is the problem: it trains the operator to check off against the narrative instead of
the indication.

- Leg 1 step 2: *"Start the reactor coolant pumps: press ON on the RCP card. **Forced flow is the
  heat source.**"*
- Leg 5 step 2: *"Press SCRAM. **Both banks drop and power collapses into the source range.**"*
- Leg 1 step 13: *"Press AUTO on the STEAM DUMP card. **The condenser dumps take over the heat
  sink.**"*
- Also: Leg 1 step 5, Leg 3 step 2, Leg 5 step 1, Leg 6 step 10, Leg 2 step 13 (*"Power settles
  near 1 %"*).

**Fix:** delete the assertion from `text` and re-express it as the acceptance criterion, which is
the same fact stated so it can be checked. *"PRESS SCRAM. Acceptance: both banks fully inserted,
reactor power below 5 % and falling."*

### P2 — Multiple actions per step, on multiple cards, with a load-bearing order

Twenty-seven steps. The worst offenders bury an order dependency that the `why` then has to shout
about:

- Leg 6 step 3: *"On TRIP BLOCKS press PZR PRESS LO-LO and SI REACTOR TRIP. Then press STOP on the
  ECCS card."* — three actions, two cards, one line.
- Leg 6 step 4: *"Walk the DUMP SETPOINT down in steps: 1020, 640, 400, 240, 120 psi over about two
  and a half plant-hours."* — five setpoint changes and a 2.5-hour evolution as one check-off box.
- Leg 3 steps 4–8, each: *"Withdraw 30 steps at MED, then set the load target to 30 MWe. Trim rods
  until the Tavg tile sits back inside its normal band."* — three actions with three different
  completion criteria.
- Leg 2 steps 5–9, each: withdraw / stop / wait for settle / plot = four actions.

**Fix:** one action per numbered step; substep where the actions are a single evolution
(4a WITHDRAW, 4b SET LOAD, 4c TRIM). Leg 6 step 4 becomes a five-row sub-table with a Tavg column.

### P3 — "Confirm" steps that contain a contingent action

The file's own convention is that a `Confirm`/`text` step is a verification. Five of them are not.

- Leg 1 step 4: *"Confirm the turbine tripped and generator off line. **If a load target is set,
  press UNLOAD** (TURBINE-GENERATOR card)."*
- Leg 2 step 3: *"Confirm SG FEED is in AUTO before you add any heat. **If it is not, press AUTO.**"*
- Leg 1 step 12: text says *"Confirm the letdown transfer"*; the `why` then says *"If letdown reads
  zero, the orifices are shut and the plant is filling — **put them in service** before the second
  pressurization."* — a recovery action two clicks below the fold.

**Fix:** AP-907 IF/THEN. *"VERIFY the turbine is TRIPPED and the generator OFF LINE at 0 MWe. IF a
load target is set, THEN press UNLOAD on the TURBINE-GENERATOR card."* The conditional is then
visible, place-keepable and N/A-able.

### P4 — Cautions arrive after the step they protect, and several live inside `why`

This is the most serious usability defect in the set, because the `why` is collapsed by default.

> **Amended after reading the screenshots (§6):** it is worse than "too late". The leg `Cautions`
> block **is never rendered to the player at all** — not on the checklist picker, not in the
> running panel, not behind "Show all details". Every caution quoted below is therefore either
> invisible or buried in grey body text. See §6.1.

- Leg 6 step 9 `why`: *"**ORDER MATTERS HERE, and getting it wrong costs you the align.** The
  suction valve interlock refuses to open above 425 psig … if you shut the spray first, pressure
  bounces back over that number."* The commitment that makes this true is made three steps
  earlier, at step 6, where spray goes to MANUAL. By the time the operator reads this caution they
  have either already done it right by luck or already lost the align.
- Leg 1 step 10 `why`: *"miss the window and the only way back is a manual depressurization —
  HEATER to OFF, SPRAY held open, back down through 1600 psig."* An irreversible-window caution
  and a recovery procedure, both inside the panel of the very step you have just failed.
- Leg 1 step 11 `why`: *"If the rate crowds 100 °F/hr (55.6 °C/hr), raise HX FLOW on the RHR card
  to bleed heat."* The only statement of how to control the heatup rate in the whole leg, filed
  under an expandable.
- Leg 6 step 6 `why`: *"The heaters go off first, or they fight the spray with the whole ladder."*
- Leg 6 step 11 `why`: *"lower HX FLOW if the rate runs away."*

**Fix:** every one of these becomes a `caution` attached to the step *before* the one it protects,
in the always-visible band. The Leg 6 order dependency needs a caution above step 6 *and* a
cross-reference in step 8 (*"Do not secure spray before step 9 is complete"*).

### P5 — The acceptance criterion is in a different field every time, and 30 steps have none

`text`, `target`, and `checked off when` all sometimes carry it; sometimes none does.

- No `checked off when` at all: Leg 1 steps 7, 8, 9, 12; Leg 2 steps 3–9, 15, 16, 17; Leg 3 steps
  2–8 and 10; **all five steps of Leg 4**; Leg 6 steps 3, 6, 10. Thirty steps.
- The header promises *"each step checks itself off from the plant's instruments"* and *"Runnable"*
  on every leg. **Leg 4 self-checks nothing.** Leg 3 ends on step 10 (*"Trim boron DOWN toward
  626 ppm over the next hours"*), which has no criterion and no auto-check — the leg's last box can
  never tick.
- Where `target` exists it is inconsistent about what it verifies (see P6).

**Fix:** every step gets a stated, quantified acceptance in `target`, and every step that can be
machine-checked gets a `checked off when`. Where a step genuinely cannot self-check (a boron trim
over hours), say so explicitly — *"Acceptance: operator judgement; bank walking out, Tavg on
program"* — rather than leaving the field empty.

### P6 — `target` verifies the button, not the plant

Eleven `target` fields confirm that a press landed, not that the plant responded. An operator wants
the effect; the lit lamp is position indication, not system response.

- Leg 1 step 7 target: *"both orifices in service — **A+B 7 % lit on the LETDOWN card**"* — says
  nothing about letdown flow, which is the thing that matters and which the `why` quantifies
  (10.8 gpm) but the target does not.
- Leg 1 step 13 target: *"**AUTO lit** on the STEAM DUMP card, status reading PRESS"* — no steam
  pressure criterion, though the `why` gives 1020 psi (7.03 MPa).
- Leg 6 step 3 target: *"PZR PRESS LO-LO and SI REACTOR TRIP **blocked**; injection stopped."*

**Fix:** `target` states lamp *and* effect: *"A+B 7 % lit; letdown flow 10 to 13 gpm."*

### P7 — Rod movements are given as increments, so nothing is verifiable against the board

Every rod instruction in Legs 2, 3 and 4 is a delta with a hedge: *"Withdraw about 90 steps"*,
*"about 60"*, *"about 30"*, *"about 15"*, *"about 10"*, *"Withdraw 32 steps"*, *"insert about 20
steps"*, *"about 14 steps"*, *"about 13 steps"*, *"about 40 steps"*. Fifteen instances.

The operator cannot check an increment against a step counter that reads absolute position, and
the errors accumulate down the leg. A real GOP gives a target position or a plant criterion.

- Leg 2 step 5: *"Withdraw the control bank about 90 steps at MED."* → *"WITHDRAW the control bank
  to 90 of 627 steps at MED."*
- Leg 3 step 5: *"Withdraw 32 steps, set the load target to 50 MWe."* → *"WITHDRAW the control bank
  to 62 of 627 steps"* (author the absolute figures; the leg already knows them).
- Where the criterion is the plant, say the plant: Leg 4 step 3 *"insert about 20 steps to trim
  Tavg"* → *"INSERT the control bank until Tavg is on program for 50 MWe."*

### P8 — psi / psig / psia are mixed, sometimes inside one sentence, for the same setpoint

This is a real-plant error class and the file commits it repeatedly. 1700 psig and 1700 psia are
14.7 psi apart, and the file uses three numbers for one thing.

- Leg 1 step 9 text: *"Raise the pressurizer pressure setpoint (Pressure SP) **from 363 psi to
  1700 psig**"* — two references in one clause, no SI on either.
- Leg 6 step 5: text says *"Lower the Pressure SP to its **1700 psig** floor"*; `target` says
  *"**1716 psi** (11.83 MPa), the floor"*; Leg 1 step 9 called the same floor *"1700 psig"* and
  *"the dial floor"*. Three numbers, one dial stop.
- Accumulator window: Leg 1 step 10 and Leg 6 step 7 both say **1615 psi**; Leg 1 step 10 `why`
  says the recovery goes *"back down through **1600 psig**"*; Leg 6 step 7 `why` says *"Above
  **1600 psig** the valve has no power"*. Two numbers for one interlock.

**Fix:** declare the reference once per document (recommend psia throughout, since the engine and
the `checked off when` fields are absolute), state it in a leading note, and never mix.

### P9 — US/SI pairing is applied at random

Some numbers pair, adjacent ones do not, and the omission therefore carries no information.

- Leg 6 step 8 text: *"Let pressure fall through **425 psig** with the spray still on. Measured:
  **1500 to 400 psi**"* — no SI on any of the three, in a file whose leg cautions pair everything.
- Leg 1 step 9 text: *"from **363 psi** to **1700 psig**"* — unpaired; the `target` for the same
  step pairs nothing either, while the caution above pairs every figure.
- Leg 2 step 2: *"719 ppm"* correctly unpaired (dimensionless), sitting beside step 1's paired
  *"546.8 °F (286 °C)"* — so the reader cannot infer a rule.

**Fix:** pair every dimensional quantity on first use in a step, every time; ppm, %, steps, gpm and
cps stay bare.

### P10 — Simulator commentary inside player-facing step text

The step line is supposed to be the plant talking. Six places it is the game talking.

- Leg 1 step 6: *"…status reading MANUAL. **Nothing to press.**"*
- Leg 1 step 10: *"Open the Accumulator valve now, on the way past. **The clock holds itself at
  real time here until you do.**"*
- Leg 2 step 12: *"…as the intermediate range took over. **No operator action on this plant.**"*
- Leg 1 step 1 `why`: *"the plant has left this picture and **the checklist skips it**."*
- Leg 2 step 15 `why`: *"**There is no one-button 'connect grid' on this plant.**"*
- Every purpose ends *"**Runnable.**"* — a development word, six times, in player-facing copy.

**Fix:** "Nothing to press" → the step is a VERIFY, which already says it. Time-acceleration
behaviour belongs in a UI banner, not in a procedure step. Delete "Runnable."

### P11 — Second person, and prose flourish, in the action line

Procedures are imperative and impersonal. The `why` may use "you"; the `text` may not.

- Leg 2 step 9: *"…Settle, plot. **Point 6 is your working prediction.**"*
- Leg 2 step 8: *"Keep bursts small enough that **the startup rate (SUR) stays under 1 DPM.**"*
- Leg 3 step 7: *"Smaller pulls from here: **the 103 % rod stop is close.**"*
- In `why`, the flourishes: *"Full power is a landing, not a lunge"* (Leg 3 step 8), *"The plant
  runs while you tap"* (Leg 2 step 13), *"You cannot see the moment criticality happens; you can
  only see that it has"* (Leg 2 step 10 — operationally true, but it is the opening line of a
  panel that should open with the criterion).

### P12 — One control, several names; several controls, the same name

No canonical label set. Same component, per leg — and the **Engraved** column is what the board
actually says, read off `shot_pwr_heatup_a_page.png`:

| Component | Names used in the file | Engraved on the board |
|---|---|---|
| Pressurizer heaters | *PZR HEATERS* (L1 S8), *HEATER card* (L6 S6), *Pressurizer Heaters (PZR)* (`control`), *"the heaters"*, *"the ladder"*, *"the whole ladder"* | **PRESSURIZER (PZR)** card, **HEATER** column |
| Pressurizer spray | *PZR SPRAY* (L1 S8), *SPRAY* (L6 S6/S10), *Pressurizer Spray (PZR)* | **PRESSURIZER (PZR)** card, **SPRAY** column |
| Pressure setpoint | *Pressure SP*, *"the dial floor"*, *"this dial"*, *"the setpoint span"*, *"that dial's world"* (L6 S5 why) | **SET PZR PRESSURE** |
| Steam dump setpoint | *DUMP SETPOINT box* (L1 S6), *DUMP SETPOINT* (L6 S4), *Dump SP* (`control`) | **DUMP SETPOINT** |
| Feed | *SG FEED card*, *Feed Pumps* (`control`), *"the main feed pumps"*, *"the three-element controller"* | **SG FEED** |
| Reactor coolant pumps | *RCP card*, *RCP Run/Stop* (`control`), *"the pumps"*, *"forced flow"* | **RCP FLOW**, with OFF / ON |
| Shutdown bank | *SHUTDOWN card* (L1 S3), *Shutdown Bank* (`control`) | **ROD CONTROL** card, **SHUTDOWN** column |
| Control bank | *Control Bank* (`control`), *"the bank"*, *"rods"* | **ROD CONTROL** card, **CONTROL** column |
| Letdown orifices | *LETDOWN card*, *Letdown Orifices (CVCS)* (`control`) | **LETDOWN** |
| Boron | *BORON card*, *Boron control* (`control`), *"the make-up panel"* | **BORON** |
| Turbine load | *TURBINE-GENERATOR card*, *Turbine Load* (`control`) | **TURBINE-GENERATOR**, **LOAD** |
| Average coolant temperature | ***Tavg*** everywhere (34 uses), *"the Tavg tile"* (L3 S4) | **AVG COOLANT TEMPERATURE** (top tile); **Δ TEMP AVG** on NIS |
| RCS pressure | *"363 psi"*, *"pressure"*, *"RCS pressure"* (picker) | **PRIMARY PRESSURE** |
| Scram | *"Press SCRAM"* (L5 S2) | **SCRAM / PRESS TO ARM** — a two-press control the step does not mention |

**"Tavg" and "Pressure SP" are not on the board.** The two most-referenced quantities in the whole
set are named in the steps by labels the operator cannot find. `SHUTDOWN card` and `RCP card` do
not exist either — they are a column and a flow readout.

**Fix:** one engraved label per control, ALL CAPS, matching the board; the plain-language name once
in parentheses on first use in the leg; never a metaphor ("the ladder", "the dial's world").

### P13 — Undefined jargon and unreachable citations

- **`pcm`** — Leg 2 caution *"one control-bank step in the critical band is worth 8.1 pcm"*, never
  expanded anywhere in the file.
- **"the point of adding heat"** — used three times (Leg 2 caution, steps 11 and 13 `why`) as
  though it were common vocabulary. It is real jargon (POAH) and needs one definition.
- **WTSM** — cited five times (*WTSM 8.1.1*, *chapter 19* ×2, *11.2*, *5.1*) and never expanded.
  The player cannot open it. Either expand the acronym and keep the cite as provenance, or drop it
  to the `why` footer.
- **TS Bases B 3.5.1** (Leg 1 step 10) — same problem, plus it is inside the sentence rather than
  at the end of it.
- **HCV-128 cross-connect** (Leg 1 step 7) — a tag number, once, with no expansion.
- **P-6 / P-7 / P-10 / P-11** — P-11 and P-10 are glossed; P-6 appears in Leg 2 step 12 `why` with
  *"5e-11 A"* and no gloss.
- **FAST / MED / SLOW** rod speeds — used from Leg 1 step 3 onward, never defined (steps/min?).
- **Authored jargon presented as trade vocabulary:** *"the no-load anchor"* (7 uses; the trade term
  is no-load steam pressure), *"the ride"* (Leg 1 steps 9/13/14 `why`), *"burst"* for a rod
  withdrawal (5 uses in Leg 2), *"the dial floor"*.

### P14 — Step length and number density in the confirmation steps

The `Confirm` steps are comma-lists of four to six parameters with no bands and no verbs.

- Leg 1 step 1: *"Confirm Mode 5: Tavg 122 °F (50 °C), 363 psi (2.5 MPa), pumps stopped, turbine
  tripped, heaters off, both rod banks in."* — six criteria, one box, no tolerances; the operator
  cannot record which one failed.
- Leg 1 step 15: *"Confirm Mode 3, Hot Standby: **hot at the no-load band**, pressurized,
  subcritical, control bank never moved."* — four criteria, none of them quantified, one of them
  ("never moved") a claim about the past that no indication can show.
- Leg 6 step 12 is the same shape with five.

**Fix:** VERIFY headers with indented sub-criteria, each with a band and its own tick.

### P15 — The `overtaken` message is a 62-word mini-procedure, repeated verbatim six times

Legs 2 steps 4–9 carry the identical block, ~372 words total, and it contains four instructions —
*"Stop withdrawing. Watch the startup rate and the intermediate range, and keep the startup rate
under 1 decade per minute."* Instructions in a status banner are instructions the operator will not
place-keep.

**Fix:** *"OVERTAKEN — source range de-energized above 1e5 cps; the 1/M approach is complete. Go to
step 10."* If the four instructions matter, they belong in step 10.

### P16 — Prerequisites and entry conditions are the same list, written twice, differently

Every leg. Leg 1 prerequisite: *"Tavg near 122 °F (50 °C), pressure near 363 psi (2.5 MPa)"*; Leg 1
entry condition: *"Plant cold, Mode 5: Tavg near 122 °F (50 °C)"* + *"Depressurized: near
363 psi (2.5 MPa)"*. Two lists that must be maintained in step, worded differently, in a document
whose numbers already drift (see P8). Collapse to one PREREQUISITES section with an
"(auto-checked)" flag per line.

---

## 2. Per-step findings — all 67 steps

Format: verdict — problem — rewritten `text` line. Board labels in CAPS as engraved. Rewrites
assume psia declared as the document reference.

### Leg 1 — Cold Shutdown → Hot Standby (17 steps)

**Leg 1 step 1 — rewrite** — Six unquantified criteria in one verbless comma list; duplicates the
entry-conditions block.
> VERIFY the Mode 5 lineup: Tavg 122 °F (50 °C) ±10, RCS pressure 363 psia (2.50 MPa) ±25, reactor
> coolant pumps STOPPED, turbine TRIPPED, pressurizer heaters OFF, control and shutdown banks at
> 0 of 627 steps.

**Leg 1 step 2 — minor** — Rationale rides in the action line; the >90 % criterion appears only in
`target`.
> START the reactor coolant pumps: press ON on the RCP card. Acceptance: RCS flow above 90 %.

**Leg 1 step 3 — rewrite** — Card, speed and click fused by colon and comma; the `note` contains an
action ("Click WITHDRAW again to halt early").
> WITHDRAW the shutdown bank to 627 of 627 steps: on the SHUTDOWN card select FAST, then click
> WITHDRAW once. IF the drive must be stopped short of the upper limit, THEN click WITHDRAW again.
>
> note: One click latches the drive. It runs to the upper limit unattended, about 10 plant-minutes,
> and stops there.

**Leg 1 step 4 — rewrite** — A verification with a conditional action appended as a comma clause.
> VERIFY the turbine is TRIPPED and the generator is OFF LINE at 0 MWe. IF a load target is set,
> THEN press UNLOAD on the TURBINE-GENERATOR card.
>
> (`why` defect: *"Note for later that UNLOAD is not TRIP"* is a distinction the operator needs at
> the moment of the press, not "for later" — promote it to a `note` on this step.)

**Leg 1 step 5 — minor** — The action line explains what AUTO does instead of stating the
acceptance.
> PLACE steam generator level control in AUTO: press AUTO on the SG FEED card. Acceptance: main feed
> pumps running, SG FEED reads AUTO, SG level in band.

**Leg 1 step 6 — rewrite** — Simulator commentary ("Nothing to press") in a procedure step; two
indications run together.
> VERIFY the steam dump is shut: CLOSE lit and status MANUAL on the STEAM DUMP card, dump valve
> position 0 %.

**Leg 1 step 7 — rewrite** — The load-bearing requirement (BOTH orifices, not one) is the last
clause of the `why`; no acceptance and no auto-check.
> PLACE both letdown orifices in service: press A+B 7 % on the LETDOWN card. Acceptance: A+B 7 %
> lit, letdown flow established. Both orifices are required — orifice A alone will not support the
> pressurization in step 9.

**Leg 1 step 8 — rewrite (split)** — Two actions on two cards in one box; no auto-check.
> 8a. PLACE the pressurizer heaters in AUTO: press AUTO on the PZR HEATERS card. Acceptance: AUTO
> lit, heater output following the setpoint.
>
> 8b. PLACE the pressurizer spray in AUTO: press AUTO on the PZR SPRAY card. Acceptance: AUTO lit.

**Leg 1 step 9 — rewrite** — psi and psig mixed in one clause with no SI; *"Not 2235 psi yet"* is a
caution written as an afterthought; the step silently starts the 35-minute accumulator clock whose
consequence is not stated until step 10.
> CAUTION (before step 9): Do not set 2235 psia (15.41 MPa) at this step. Crossing the P-11
> permissive, 1972 psia (13.60 MPa), while the steam generator is still cold actuates safety
> injection and sheds the heaters.
>
> CAUTION (before step 9): This setpoint change starts the heatup. The accumulator fill window of
> step 10 opens about 35 plant-minutes from here and closes permanently at 1615 psia (11.14 MPa).
> Read step 10 before performing step 9.
>
> RAISE the Pressure SP to 1700 psig (11.72 MPa), the dial's lower stop. Acceptance: RCS pressure
> rising.

**Leg 1 step 10 — rewrite** — Sim time-acceleration behaviour in the action line; the
irreversibility and its recovery are buried in the `why` of the step you have just failed.
> CAUTION (before step 10): The accumulator isolation valve loses power above 1615 psia
> (11.14 MPa). If the window is missed, the only recovery is a manual depressurization — heaters
> OFF, spray held open — back below 1600 psig (11.03 MPa).
>
> OPEN the accumulator isolation valve while RCS pressure is between 665 psia (4.59 MPa) and
> 1615 psia (11.14 MPa). Acceptance: valve OPEN.

**Leg 1 step 11 — rewrite** — "Ride the heatup" is not an action; the only rate-control instruction
in the leg is inside the `why`; two prohibitions trail the sentence.
> MONITOR the heatup until Tavg reaches 541.4 °F (283 °C) at 1700 psig (11.72 MPa). Maintain the
> heatup rate below 100 °F/hr (55.6 °C/hr); IF the rate approaches the limit, THEN raise HX FLOW on
> the RHR card. Do not withdraw the control bank and do not dilute during this step.

**Leg 1 step 12 — rewrite** — "The letdown transfer" is not a board indication; the recovery action
is in the `why`; no auto-check.
> VERIFY the letdown transfer is complete: RHR suction valve SHUT (autoclosed at 585 psig /
> 4.03 MPa) and letdown flow on the orifices, 10 to 13 gpm. IF letdown flow reads zero, THEN place
> both orifices in service before performing step 14.

**Leg 1 step 13 — minor** — Outcome narration in the action line; the steam-pressure criterion is
only in the `why`.
> PLACE the steam dump in AUTO: press AUTO on the STEAM DUMP card. Acceptance: AUTO lit, status
> reads PRESS, steam pressure holding 1020 psi (7.03 MPa), atmospheric dump valve SHUT.

**Leg 1 step 14 — minor** — The justification ("so the P-11 crossing is safe") sits in the action
line; unit reference unstated.
> RAISE the Pressure SP to 2235 psia (15.41 MPa), normal operating pressure. Acceptance: RCS
> pressure above 2175 psia (15.0 MPa).

**Leg 1 step 15 — rewrite** — Four criteria, none quantified, one ("control bank never moved") not
observable from any present indication.
> VERIFY Mode 3, Hot Standby: Tavg 546.8 °F (286 °C) ±5, RCS pressure 2235 psia (15.41 MPa),
> reactor subcritical, control bank at 0 of 627 steps, steam pressure 1020 psi (7.03 MPa),
> atmospheric dump valve SHUT.

**Leg 1 step 16 — minor** — Verifies a historical claim; "deeply subcritical" has no readable
criterion on the board.
> VERIFY the reactor is subcritical: source range count rate steady with no positive startup rate,
> control bank at 0 of 627 steps.

**Leg 1 step 17 — rewrite** — Duplicates step 16; "Confirm no fission heat was made" cannot be
verified from a present indication; the recovery is in the `why`.
> VERIFY reactor power is below 1 %. IF power is above 1 %, THEN stop the heatup and determine
> whether the control bank moved or boron was diluted before continuing.
>
> (Better: merge 16 and 17 into one VERIFY with two sub-criteria.)

### Leg 2 — Hot Standby → At Power (18 steps)

**Leg 2 step 1 — minor** — Five criteria, no bands; "the plant is ready" is not a criterion.
> VERIFY the Hot Standby lineup: reactor subcritical with steady source range count rate, Tavg
> 546.8 °F (286 °C) ±8, RCS pressure 2235 psia (15.41 MPa), reactor coolant pumps running.

**Leg 2 step 2 — minor** — Action and target entry run together; acceptance only in `target`.
> DILUTE to the estimated critical boron concentration: set the BORON card to 719 ppm and press ON.
> Acceptance: boron 719 ppm ±40.
>
> (`why` defect: *"never chase the prediction with the rods"* is a caution and belongs in the leg
> caution band, where a version of it already sits — do not state it twice in two registers.)

**Leg 2 step 3 — rewrite** — Verification with a conditional action; the `why` opens with *"You
will normally find this already done"*, which invites the operator to skip a verification.
> VERIFY SG FEED is in AUTO with SG level near 65 %. IF SG FEED is not in AUTO, THEN press AUTO
> before adding heat.

**Leg 2 step 4 — minor** — Two actions plus a claim; the log-scale primer in the `note` is
leg-level information filed under one step.
> RECORD the 1/M baseline: open the 1/M PLOT tool, then press PLOT POINT before moving any rod.
> Acceptance: point 1 captured, SOURCE RANGE count rate recorded.
>
> (Move the *"7.0e2 is 700 counts per second"* note to a leg-level NOTE above the Steps heading.)

**Leg 2 step 5 — rewrite** — Three actions and an unstated settling judgement; increment, not
position.
> WITHDRAW the control bank to 90 of 627 steps at MED, then STOP. WHEN the startup rate has
> returned toward zero, THEN press PLOT POINT. Acceptance: point 2 plotted, SOURCE RANGE above
> 7.0e2 (700 cps).
>
> note: A point taken while the rate is still rising reads low.

**Leg 2 step 6 — rewrite** — Four actions (withdraw, settle, plot, read); the "it reads high"
warning is an unqualified fragment.
> WITHDRAW the control bank to 150 of 627 steps at MED, then STOP. WHEN the startup rate has
> settled, THEN press PLOT POINT and read the predicted critical position on the 1/M panel.
> Acceptance: point 3 plotted, SOURCE RANGE above 1.4e3 (1,400 cps). Treat the prediction as an
> over-estimate.

**Leg 2 step 7 — rewrite** — Same pattern; *"the fit now lands within a dozen steps"* is a claim,
not an instruction.
> WITHDRAW the control bank to 180 of 627 steps at MED, then STOP. WHEN the startup rate has
> settled, THEN press PLOT POINT and read the prediction. Acceptance: point 4 plotted, SOURCE RANGE
> above 3.0e3 (3,000 cps).

**Leg 2 step 8 — rewrite** — Same pattern; the rate limit is stated as a second-person request.
> WITHDRAW the control bank to 195 of 627 steps at MED, then STOP. WHEN the startup rate has
> settled, THEN press PLOT POINT. Acceptance: point 5 plotted, SOURCE RANGE above 7.0e3
> (7,000 cps), startup rate below 1 DPM throughout.

**Leg 2 step 9 — rewrite** — Same pattern; *"Point 6 is your working prediction"* is second person
and does not instruct the operator to record it (the `why` does).
> WITHDRAW the control bank to 205 of 627 steps at MED, then STOP. WHEN the startup rate has
> settled, THEN press PLOT POINT and RECORD the predicted critical position. Acceptance: point 6
> plotted, SOURCE RANGE above 2.0e4 (20,000 cps). This is the last plotted point.

**Leg 2 step 10 — rewrite** — The action, the stop criterion and the definition of criticality are
one sentence; the 8.1 pcm/step warning is in the `why`.
> CAUTION (before step 10): One step in this band is worth 8.1 pcm. Do not withdraw to the 1/M
> predicted position — criticality arrives before it. Expected criticality is between 226 and 238
> of 627 steps.
>
> WITHDRAW the control bank in single steps at SLOW, pausing after each step. Acceptance: with the
> bank STOPPED, count rate continues to rise and startup rate holds positive at or below 1 DPM —
> the reactor is critical.

**Leg 2 step 11 — minor** — "Power climbs through the decades" is narration; bare "SUR" before its
expansion in the text register.
> WITHDRAW two further steps at SLOW to add excess reactivity. MONITOR startup rate (SUR) and the
> intermediate range. Acceptance: power rising above 0.5 %.

**Leg 2 step 12 — minor** — Confirms a self-acting event in the past tense; "No operator action on
this plant" is sim commentary.
> VERIFY the source range has de-energized at the P-6 permissive and the intermediate range is on
> scale. No operator action is required.

**Leg 2 step 13 — rewrite** — Two actions with a moving stop criterion; the outcome is asserted in
the action line; the operative caution (*"One drive, not taps"*) is in the `why`.
> INSERT the control bank at MED in one continuous drive. RELEASE when startup rate crosses zero,
> about 14 steps. Acceptance: power steady near 1 %, Mode 2, Startup.
>
> note: One continuous drive, not repeated taps — the plant continues to respond between taps.

**Leg 2 step 14 — minor** — "Power settles in the high single digits" where a number exists.
> WITHDRAW the control bank at SLOW until reactor power exceeds 5 %, about 13 steps. Acceptance:
> power 6 to 9 %, plant mode reads Mode 1, At Power.

**Leg 2 step 15 — rewrite (split)** — Two actions on one card; no auto-check on the single most
significant evolution in the leg.
> 15a. LATCH the turbine: press LATCH on the TURBINE-GENERATOR card. Acceptance: turbine latched,
> no trip standing.
>
> 15b. SET the load target to 10 MWe. Acceptance: generator carrying 10 MWe, reactor power near
> 10 %.

**Leg 2 step 16 — minor** — Permissive condition, action and two effects in one line; no
auto-check.
> WHEN reactor power is above the P-10 permissive (8 %), THEN press IR HIGH FLUX on the TRIP BLOCKS
> card. Acceptance: intermediate range 25 % trip blocked, 20 % rod stop clear.

**Leg 2 step 17 — minor** — Action and purpose fused; no auto-check.
> PRESS PR HIGH (LOW SETPT) on the TRIP BLOCKS card. Acceptance: power range 35 % low setting
> blocked.

**Leg 2 step 18 — minor** — Navigation instruction inside a verification step.
> VERIFY Mode 1, At Power: reactor critical, generator on line, power near 10 %, IR HIGH FLUX and
> PR HIGH (LOW SETPT) blocks standing.
>
> (Move *"Continue with the power ascension checklist"* to an end-of-leg line, not a step.)

### Leg 3 — power ascension to 100 % (10 steps)

**Leg 3 step 1 — minor** — Four criteria, no bands.
> VERIFY the at-power lineup: reactor critical, generator carrying load above 5 MWe, SG FEED in
> AUTO, IR HIGH FLUX and PR HIGH (LOW SETPT) blocks standing.

**Leg 3 step 2 — minor** — Setpoint entry and controller state run together; the duration claim
("runs under the whole ascension") is in the action line; no auto-check.
> DILUTE toward 660 ppm: set the BORON card to 660 ppm and press ON. Acceptance: dilution running,
> boron falling toward 660 ppm.

**Leg 3 step 3 — minor** — The lab delay is stated as narrative rather than as the acceptance.
> DRAW a boron sample: press SAMPLE on the BORON card. Acceptance: sample logged, result due in
> about 30 plant-minutes.

**Leg 3 step 4 — rewrite (split)** — Three actions with three different completion criteria; "the
Tavg tile" is UI vocabulary; the which-way-to-trim rule is in the `why`; no auto-check.
> 4a. WITHDRAW the control bank 30 steps at MED (to 155 of 627).
>
> 4b. SET the load target to 30 MWe. Acceptance: generator at 30 MWe.
>
> 4c. TRIM the control bank until Tavg is on program for 30 MWe. IF Tavg is below the program band,
> THEN withdraw; IF above, THEN insert.

**Leg 3 step 5 — rewrite (split)** — Same three-action shape.
> 5a. WITHDRAW the control bank 32 steps at MED. 5b. SET the load target to 50 MWe. 5c. TRIM the
> control bank until Tavg is on program for 50 MWe.

**Leg 3 step 6 — rewrite (split)** — Same.
> 6a. WITHDRAW the control bank 35 steps at MED. 6b. SET the load target to 75 MWe. 6c. TRIM the
> control bank until Tavg is on program for 75 MWe.

**Leg 3 step 7 — rewrite (split)** — Same, plus a rod-stop caution written as a trailing clause
("the 103 % rod stop is close") where it should be a caution above the step.
> CAUTION (before step 7): The power range high-flux rod stop is set above 103 %, with the 118 %
> trip behind it. 100 MWe of load lands reactor power near 101 %. Use small withdrawals from this
> point.
>
> 7a. WITHDRAW the control bank 18 steps at MED. 7b. SET the load target to 90 MWe. 7c. TRIM the
> control bank until Tavg is on program for 90 MWe.

**Leg 3 step 8 — rewrite (split)** — Three actions; "Power settles near 101 %" is an outcome
assertion where it should be the acceptance.
> 8a. WITHDRAW the control bank 9 steps at MED. 8b. SET the load target to 100 MWe. 8c. TRIM the
> control bank until Tavg reads 577.7 °F (303.2 °C). Acceptance: 100 MWe, reactor power 99 to
> 102 %.

**Leg 3 step 9 — minor** — "bank part-way out" is unquantified.
> VERIFY full power: reactor power 96 to 102 %, generator 100 MWe, Tavg 577.7 °F (303.2 °C),
> control bank part-way withdrawn within its manoeuvring band.

**Leg 3 step 10 — rewrite** — Not an action ("Xenon is building"); open-ended duration; **no
acceptance and no auto-check, so the leg's final box cannot tick**.
> TRIM boron down toward 626 ppm as xenon builds, over the following several hours. Acceptance:
> boron at 626 ppm ±20, ROD LIMIT LO-LO clear, Tavg on program at 577.7 °F (303.2 °C).
>
> note: ROD LIMIT LO-LO is expected to be lit at the start of this step. With no xenon in the core
> the control bank sits below its insertion limit; it clears as xenon builds and boron is reduced.

### Leg 4 — load rampdown to ~15 % (5 steps)

**Whole-leg defect: not one of these five steps has a `checked off when`.** The leg header claims
the steps check themselves off the instruments. They do not.

**Leg 4 step 1 — minor** — Action, target and controller state in three fragments; "Boration runs
under the legs" is narration.
> BORATE toward 719 ppm, the no-load concentration: set the BORON card to 719 ppm and press ON.
> Acceptance: boration running, boron rising toward 719 ppm.

**Leg 4 step 2 — rewrite (split)** — Two actions separated by an untimed wait; the 40-step figure
is in the `why`, not the instruction.
> 2a. SET the load target to 75 MWe. Acceptance: generator at 75 MWe, reactor power following down.
>
> 2b. WHEN power has followed the load down, THEN insert the control bank until Tavg is on program,
> about 40 steps.

**Leg 4 step 3 — rewrite (split)** — Same shape; the shrink-and-swell caution is in the `why`.
> 3a. SET the load target to 50 MWe. 3b. WHEN power has followed down, THEN insert the control bank
> until Tavg is on program, about 20 steps.
>
> note: Indicated SG level moves the wrong way first on each load drop. Do not chase it; SG FEED in
> AUTO holds the band.

**Leg 4 step 4 — rewrite (split)** — Same shape.
> 4a. SET the load target to 30 MWe. 4b. WHEN power has followed down, THEN insert the control bank
> until Tavg is on program, about 10 steps.

**Leg 4 step 5 — rewrite (split)** — Same shape; "This is the shutdown handoff" is navigation
inside an action.
> 5a. SET the load target to 15 MWe. 5b. WHEN power has followed down, THEN insert the control bank
> until Tavg is on program, about 6 steps. Acceptance: 15 MWe, reactor power near 15 %.

### Leg 5 — normal shutdown (3 steps)

**Leg 5 step 1 — minor** — Outcome narration in the action line.
> SET the load target to 0 MWe. Acceptance: generator output below 5 MWe, reactor power following
> down.

**Leg 5 step 2 — minor** — The single most consequential action in the whole set is one word plus
two sentences of narration, with no immediately preceding verification of the prerequisites.
> VERIFY generator output is below 5 MWe, then PRESS SCRAM. Acceptance: control and shutdown banks
> fully inserted, reactor power below 5 % and falling.

**Leg 5 step 3 — minor** — Three claims and a mode declaration in one comma list; "This is Mode 3"
asserts rather than verifies.
> VERIFY Mode 3, Hot Standby: reactor subcritical, decay heat near 1.9 % going to the steam dump,
> steam pressure 1020 psi (7.03 MPa), Tavg near 546.8 °F (286 °C).

### Leg 6 — Hot Standby → Cold Shutdown (14 steps)

**Leg 6 step 1 — minor** — "Borate first … Nothing cools until this is running" states the
sequencing rule as a slogan inside the action.
> BORATE to 920 ppm: set the BORON card to 920 ppm and press ON. Acceptance: boron above 880 ppm.
> Do not begin the cooldown until this step is complete.

**Leg 6 step 2 — minor** — The purpose clause ("to unlock the protection blocks") is inside the
action; unit reference unstated.
> LOWER the Pressure SP to 1900 psia (13.10 MPa). Acceptance: RCS pressure below the P-11
> permissive, 1972 psia (13.60 MPa).

**Leg 6 step 3 — rewrite (split)** — Three actions on two cards in one box; no auto-check.
> 3a. PRESS PZR PRESS LO-LO on the TRIP BLOCKS card. Acceptance: block standing.
>
> 3b. PRESS SI REACTOR TRIP on the TRIP BLOCKS card. Acceptance: block standing.
>
> 3c. PRESS STOP on the ECCS card to remove the high-pressure injection pump from standby.
> Acceptance: injection stopped.

**Leg 6 step 4 — rewrite (table)** — Five setpoint changes and a 2.5-hour evolution as one
check-off; the cooldown-rate limit is in the leg caution but not at the step where it is spent.
> CAUTION (before step 4): Maintain the cooldown rate below 100 °F/hr (55.6 °C/hr). The
> dump-setpoint walk rate is the cooldown rate.
>
> LOWER the DUMP SETPOINT in the following stages, allowing Tavg to follow and stabilise at each
> stage before the next:
> | Stage | DUMP SETPOINT | Expected Tavg |
> |---|---|---|
> | 4a | 1020 psi (7.03 MPa) | 546.8 °F (286 °C) |
> | 4b | 640 psi (4.41 MPa) | — |
> | 4c | 400 psi (2.76 MPa) | — |
> | 4d | 240 psi (1.65 MPa) | — |
> | 4e | 120 psi (0.83 MPa) | 341.6 °F (172 °C), Mode 4 |

**Leg 6 step 5 — minor, but with a number defect** — Text says 1700 psig, `target` says 1716 psi,
Leg 1 called the same stop 1700 psig with no SI; "pressure control now changes hands" is narration.
> LOWER the Pressure SP to its lower stop, 1700 psig (11.72 MPa). Acceptance: RCS pressure at or
> below 1716 psia (11.83 MPa). (Reconcile `target` to one number and one reference.)

**Leg 6 step 6 — rewrite (split)** — Two actions on two cards where the order is load-bearing, and
the reason for the order is inside the `why`.
> CAUTION (before step 6): The pressurizer heaters must be OFF before spray is opened, or the
> heater ladder opposes the spray and pressure will not fall. Spray spends subcooling margin —
> monitor it continuously through steps 6 to 9.
>
> 6a. PRESS OFF on the PZR HEATERS card. Acceptance: heater output zero.
>
> 6b. PLACE PZR SPRAY in MANUAL at 100 %. Acceptance: RCS pressure falling, subcooling margin above
> 100 °F (55.6 °C).

**Leg 6 step 7 — minor** — Action and consequence-of-failure in one line; window ends stated in the
opposite order to Leg 1 step 10's identical window.
> CLOSE the accumulator isolation valve while RCS pressure is between 1615 psia (11.14 MPa) and
> 665 psia (4.59 MPa). Acceptance: valve SHUT, accumulator inventory 100 %.

**Leg 6 step 8 — minor** — "Let pressure fall" is a hold step written as an action; measured
evidence ("1500 to 400 psi in about eight plant-minutes") sits in the action line; no SI pairing on
three figures.
> MAINTAIN PZR SPRAY at 100 % until RCS pressure falls below 425 psig (2.93 MPa). Do not secure
> spray until step 9 is complete. Acceptance: RCS pressure below 425 psig (2.93 MPa), subcooling
> margin above 100 °F (55.6 °C).

**Leg 6 step 9 — rewrite (split)** — Two actions, and the caution that governs steps 6 through 10
is shouted inside this step's `why` in capitals ("ORDER MATTERS HERE") where it arrives too late.
> 9a. PRESS ALIGN on the RHR card while spray is holding RCS pressure below 425 psig (2.93 MPa).
> Acceptance: RHR suction valve OPEN.
>
> 9b. SET HX FLOW to 7 %. Acceptance: RHR flow established.
>
> (The order caution moves to a CAUTION above step 6 and is cross-referenced in step 8.)

**Leg 6 step 10 — rewrite (split)** — Two actions whose order is load-bearing, in one box, with no
auto-check; the reason for the order is in the `why`.
> 10a. PRESS OFF on the RCP card. Acceptance: reactor coolant pumps stopped, RHR circulating.
>
> 10b. SET PZR SPRAY to OFF. Acceptance: spray shut.
>
> note: Order is required. Normal spray has no driving head once the reactor coolant pumps are
> stopped.

**Leg 6 step 11 — minor** — Two actions ("raise" and "ride cold"); the rate contingency is in the
`why`.
> RAISE HX FLOW to 25 % and maintain until Tavg is below 199.4 °F (93 °C), Mode 5. Maintain the
> cooldown rate below 100 °F/hr (55.6 °C/hr); IF the rate approaches the limit, THEN lower HX FLOW.

**Leg 6 step 12 — minor** — Four criteria, one of them a range with no SI pair.
> VERIFY Mode 5, Cold Shutdown: Tavg below 199.4 °F (93 °C), RCS pressure 250 to 550 psia (1.72 to
> 3.79 MPa), RHR in service carrying decay heat, reactor coolant pumps stopped.

**Leg 6 step 13 — minor** — The second sentence is a statement about the future, not a criterion.
> VERIFY the accumulators are full at 100 % inventory and the isolation valve is SHUT.

**Leg 6 step 14 — minor** — "The round trip is complete" is meta-commentary on the checklist set.
> VERIFY RHR is the heat sink: suction valve OPEN, HX FLOW established, Tavg stable or falling.

---

## 3. The `why` paragraphs

### General assessment

**Length is not the problem; focus is.** They run roughly 40–130 words, which is right for an
expandable affordance. The failure is that a majority try to do three jobs at once — explain the
mechanism, cite the source, and give an instruction — and the instruction is the one that should
never be there. A working operator opening "Why?" wants, in this order:

1. **Why this step, here, in this order.** What breaks if it moves.
2. **What the number came from.** A setpoint's provenance, briefly.
3. **What to watch while it runs**, expressed as an indication, not an action.

They do not want measured A/B evidence from the development of the simulator, they do not want the
simulator's scheduler described as plant behaviour, and they do not want a contingency action they
can only find by opening a panel.

**Tone.** Best-in-class here is plain declarative with a causal chain (Leg 4 step 2, Leg 6 step 1).
Worst is the literary register: *"Full power is a landing, not a lunge"* (Leg 3 step 8), *"The plant
runs while you tap"* (Leg 2 step 13), *"A real cooldown leaves that dial's world exactly here"*
(Leg 6 step 5), *"Hot Standby is hot AND subcritical"* (Leg 1 caution). These read as an author
enjoying himself. They cost trust: a procedure that performs personality is a procedure the crew
starts skimming.

**Second person is acceptable here** — it is a training affordance, not the step — but it should be
consistent, and it currently leaks upward into `text` (P11).

**Citation handling is wrong in every instance.** *"WTSM chapter 19: 'Prior to reaching 350 °F …'"*
sits mid-paragraph in Leg 1 step 7 and mid-paragraph in Leg 1 step 8. A source citation belongs at
the end of the paragraph, in parentheses, with the acronym expanded once per document.

### The 5 worst

1. **Leg 1 step 10** — ~130 words carrying four unrelated payloads: what an accumulator is, the
   window's two ends with a Tech Spec citation, an **emergency recovery procedure** (*"HEATER to
   OFF, SPRAY held open, back down through 1600 psig"*), and the **simulator's time-acceleration
   behaviour** (*"the clock drops to real time at the cover gas and every speed above 1× is
   refused"*). The recovery is a procedure and must be a caution or a step; the time-acceleration
   sentence is about the game, not the plant, and it is written in the same voice as the physics.

2. **Leg 1 step 9** — three subjects in one paragraph: the P-11 staging rationale (correct and
   necessary), the SI actuation failure mode (correct and necessary), and *"A clock also starts
   with this command"*, which describes the simulator's scheduler as though it were an interlock.
   The operator cannot tell which of the three sentences describes the plant.

3. **Leg 1 step 7** — orifice hydraulics, a block quote from WTSM chapter 19, and a measured
   failure mode, and the single load-bearing operational instruction — *"Both, not one"* — is the
   final clause of the final sentence of a collapsed panel. If the operator reads nothing, the
   pressurization parks 37 psi under the accumulator cover gas and the leg fails at step 10.

4. **Leg 1 step 13** — ends with an A/B comparison of two simulated rides, eight numbers deep:
   *"without it the plant parks at 551.6 °F (288.7 °C) and 1042 psig with that valve modulating at
   7-9 %; with it, 547.2 °F (286.2 °C) and 1005 psig, the valve shut and the condenser dumps
   carrying 0.4-2.9 %."* This is development evidence for a design decision. It answers "how do we
   know the model is right", not "why am I pressing AUTO". Cut to one sentence: the heat sink is
   the condenser dumps or it is the atmosphere.

5. **Leg 2 step 15** — opens on the user interface (*"There is no one-button 'connect grid' on this
   plant"*) and closes on a feeling (*"this is the first time you feel it"*). Between them is one
   good sentence about the reactor following the turbine. The paragraph never states what the
   operator should watch while the load comes on.

*Dishonourable mention:* **Leg 6 step 9**, which is not badly written but is the wrong container —
it is a caution wearing a `why`'s clothes, and its all-caps opening admits it.

### The 3 best

1. **Leg 1 step 3** — 55 words, one subject, and it demolishes the single most likely misconception
   an inexperienced operator brings to a shutdown-bank withdrawal: *"Withdrawing them is not a step
   toward criticality; it is the prerequisite for one."* States the safety function first (trip
   margin, somewhere to fall), then the rule, then the source. This is the model.

2. **Leg 4 step 2** — a clean causal chain in exactly the order the operator will watch it happen:
   *"less steam drawn means the core's heat has nowhere to go, Tavg rises, and moderator feedback
   walks power down after it. But the equilibrium sits hot until rods take the excess reactivity
   out; measured, about 40 steps over this leg."* Mechanism, then the consequence of not acting,
   then a planning number. Nothing else in it.

3. **Leg 6 step 1** — gives the physics (cold water moderates better), the number (920 ppm), the
   **provenance of the number** (*"the concentration this plant's own Mode 5 lineup carries"*), and
   the **duration** (*"about 3 ppm/min, so this is the hour the secondary walk rides on"*). The
   last is what a shift supervisor actually needs to sequence a 6.7-hour evolution, and it is the
   only `why` in the file that gives it.

---

## 4. Titles, purposes, prerequisites, cautions

### Titles

Format is `Leg N — <mode> → <mode> — <plain description> (id, manual ref)`. The arrow notation is
good and better than most real GOP titles. Three problems:

- **"Leg" is overloaded.** It names a whole checklist card *and* a stage inside one: Leg 3's
  purpose says *"Take the plant from low power to full power **in legs**"*, and Leg 4 step 2's
  `why` says *"about 40 steps over **this leg**"* meaning the 75 MWe stage. Pick one. Recommend:
  the card is a **PROCEDURE** (or keep GOP-style numbering), the stage inside it is a **STAGE**.
- **Leg 4's title uses "~15 %"** where every other title spells the number. Use "about 15 %".
- The manual reference and the id are metadata and should not be in the visible title line at all.

**Rewrite (pattern):** `PWR-N01 — Plant Heatup, Mode 5 Cold Shutdown to Mode 3 Hot Standby (reactor
coolant pump heat)`.

### Purposes

All six end with **"Runnable."** — a development word in player copy. Cut it six times.

- **Leg 6's purpose is a step list wearing a purpose's clothes:** one 60-word sentence naming eight
  actions (*"Borate for cold shutdown margin, block the protection …, walk the secondary down …,
  depressurize on spray …, isolate the accumulators …, align residual heat removal … and secure the
  pumps"*). A purpose says what the procedure achieves and under what conditions; the sequence is
  the steps' job. **Rewrite:** *"Take a hot, subcritical plant from Mode 3, Hot Standby to Mode 5,
  Cold Shutdown with residual heat removal (RHR) in service as the heat sink. About 6.7
  plant-hours."*
- **Leg 5's purpose contains measured data** (*"Measured from 15 %: power collapses to the source
  range in seconds, and about 2 % decay heat settles out on the dumps"*) — that belongs in step 3's
  `why` or the leg's cautions, not in the statement of intent.
- Leg 1's purpose is the best of the six: it states the achievement, the method (pump heat), and
  the constraint (*"with the reactor never critical"*) — the constraint in a purpose is exactly
  right.

### Prerequisites and entry conditions

**They are the same list written twice, in different words** (P16). Every leg. Collapse to one
PREREQUISITES section, one line per condition, each flagged `(auto-checked)` or `(operator
verified)`.

Two are too thin to be useful:

- **Leg 4:** *"Reactor at power, turbine on line."* A rampdown from 100 % needs the starting power
  band, the boron concentration it starts from, and confirmation that the startup-net blocks are
  standing (they are, and the leg never says so). **Rewrite:** *"Reactor at or near 100 % power,
  Tavg on program at 577.7 °F (303.2 °C). Turbine on line at 100 MWe. SG FEED in AUTO. IR HIGH FLUX
  and PR HIGH (LOW SETPT) blocks standing."*
- **Leg 5:** *"Reactor at power."* The whole leg is written for entry near 15 % (step 3 asserts
  1.9 % decay heat, the `why` for step 5 of Leg 4 explains why 15 % is the handoff), and a scram
  from 100 % through this procedure is a materially different evolution. **Rewrite:** *"Reactor at
  low power, 10 to 20 %, turbine on line. Steam dump available at the no-load setpoint."*

### Cautions

Shape is broadly right — they precede the steps and they are quantified — but three defects:

1. **The limit is buried under its own evidence.** Leg 1: *"Heatup rate limit: 100 °F/hr
   (55.6 °C/hr). Measured on this plant: 87 °F/hr (48.3 °C/hr) with the pressurization running, and
   up to 113.7 °F/hr (63.2 °C/hr) on pump heat alone. The RHR heat exchanger is the brake."* The
   limit is the first six words and then two lines of measurement dilute it. **Rewrite:** *"CAUTION
   — Do not exceed a heatup rate of 100 °F/hr (55.6 °C/hr). On pump heat alone this plant will
   reach 113.7 °F/hr (63.2 °C/hr) if unattended. Control the rate with HX FLOW on the RHR card."*
   Note that this rewrite carries the **control action**, which the original caution omits and the
   step 11 `why` hides.
2. **Notes are labelled cautions.** Leg 1's third (*"Hot Standby is hot AND subcritical"*) is a
   definition. Leg 2's fourth (*"The source range needs no securing on this plant. The channel
   de-energizes itself … There is no operator lever."*) is a note. A caution warns of injury,
   damage or an unrecoverable state; everything else is a NOTE. Mislabelling dulls the real ones —
   and Leg 2's *real* caution (*"Never withdraw straight to the number it prints"*) is third in a
   list of five, behind two notes.
3. **Missing cautions**, all currently living in `why` panels: the accumulator window's
   irreversibility (Leg 1 step 10), the spray/RHR-align order dependency (Leg 6 step 9), the
   heaters-before-spray order (Leg 6 step 6), and the 8.1 pcm/step reactivity worth at the point of
   use (Leg 2 step 10 — it is in the leg caution band, but 10 steps above where it bites).

---

## 5. Style guide — rules for authoring these steps

Fifteen rules. Each is one line; each `before` is verbatim from the file.

1. **Start every step with an imperative verb in the plant's own vocabulary** (VERIFY, START, PLACE,
   OPEN, RAISE, LOWER, WITHDRAW, INSERT, PRESS, MONITOR, MAINTAIN).
   *Before:* "Borate first: BORON card to 920 ppm, controller ON." → *After:* "BORATE to 920 ppm:
   set the BORON card to 920 ppm and press ON."

2. **One action per step. If two actions have a required order, they are two substeps, not one
   sentence.**
   *Before:* "Press OFF on the RCP card, then set SPRAY to OFF." → *After:* "10a. PRESS OFF on the
   RCP card. / 10b. SET PZR SPRAY to OFF."

3. **A verification step contains no action. Conditional actions use IF/THEN and get their own
   line.**
   *Before:* "Confirm SG FEED is in AUTO before you add any heat. If it is not, press AUTO." →
   *After:* "VERIFY SG FEED is in AUTO. IF SG FEED is not in AUTO, THEN press AUTO."

4. **Every step states a quantified acceptance criterion in the same place, in `target`, phrased as
   an indication the operator can read.**
   *Before:* "Confirm Mode 3, Hot Standby: hot at the no-load band, pressurized, subcritical,
   control bank never moved." → *After:* "Tavg 546.8 °F (286 °C) ±5, RCS pressure 2235 psia
   (15.41 MPa), reactor subcritical, control bank at 0 of 627 steps."

5. **Acceptance verifies the plant's response, not the lamp.**
   *Before:* target "both orifices in service — A+B 7 % lit on the LETDOWN card" → *After:* "A+B 7 %
   lit; letdown flow 10 to 13 gpm."

6. **Never state the expected outcome in the action line — make it the acceptance.**
   *Before:* "Press SCRAM. Both banks drop and power collapses into the source range." → *After:*
   "PRESS SCRAM. Acceptance: both banks fully inserted, power below 5 % and falling."

7. **Cautions precede the step they protect and are never in `why`. If the `why` contains an
   instruction, it is a caution in the wrong field.**
   *Before:* Leg 6 step 9 `why`: "ORDER MATTERS HERE, and getting it wrong costs you the align." →
   *After:* CAUTION above step 6: "Do not secure spray before RHR is aligned in step 9; RCS pressure
   will rise back above the 425 psig (2.93 MPa) suction interlock."

8. **A caution's first sentence is the prohibition and the control action. Evidence goes last or
   goes in `why`.**
   *Before:* "Heatup rate limit: 100 °F/hr (55.6 °C/hr). Measured on this plant: 87 °F/hr …" →
   *After:* "Do not exceed 100 °F/hr (55.6 °C/hr). Control the rate with HX FLOW on the RHR card."

9. **Notes contain no actions and no instructions.**
   *Before:* note "One click latches the drive … Click WITHDRAW again to halt early." → *After:*
   note keeps the first sentence; "IF the drive must be stopped short, THEN click WITHDRAW again"
   moves into the step.

10. **Give absolute rod positions, not increments; where the criterion is the plant, state the
    plant.**
    *Before:* "Withdraw about 60 steps at MED." → *After:* "WITHDRAW the control bank to 150 of 627
    steps at MED." *Before:* "insert about 20 steps to trim Tavg" → *After:* "INSERT the control
    bank until Tavg is on program for 50 MWe."

11. **One pressure reference for the document, declared once, never mixed inside a sentence.**
    *Before:* "Raise the pressurizer pressure setpoint (Pressure SP) from 363 psi to 1700 psig." →
    *After:* "RAISE the Pressure SP from 363 psia (2.50 MPa) to 1714 psia (11.82 MPa)." One number
    per interlock across all legs — 1615 psia, not "1615 psi" here and "1600 psig" there.

12. **Pair US and SI on every dimensional quantity, or on none in that step — never partially.**
    *Before:* "Let pressure fall through 425 psig with the spray still on. Measured: 1500 to
    400 psi" → *After:* "…below 425 psig (2.93 MPa)…"

13. **One engraved label per control, in CAPS as it reads on the board; the plain name once in
    parentheses on first use in the leg; no metaphors.**
    *Before:* "PZR HEATERS" / "HEATER card" / "the whole ladder" for one component → *After:* "PZR
    HEATERS (pressurizer heaters)" everywhere.

14. **No simulator commentary and no second person in `text`. Both are allowed in `why`.**
    *Before:* "Confirm the steam dump is shut … Nothing to press." → *After:* "VERIFY the steam dump
    is shut: CLOSE lit, status MANUAL, valve position 0 %."
    *Before:* "Point 6 is your working prediction." → *After:* "RECORD the predicted critical
    position; this is the last plotted point."

15. **`why` answers three questions and nothing else: why here, where the number came from, what to
    watch. Measured development evidence, A/B rides and scheduler behaviour do not appear.**
    *Before:* Leg 1 step 13: "Measured on this ride: without it the plant parks at 551.6 °F
    (288.7 °C) and 1042 psig with that valve modulating at 7-9 %; with it, 547.2 °F (286.2 °C) and
    1005 psig…" → *After:* "Without AUTO the heat sink is the atmospheric dump valve, relieving to
    the sky for the rest of the heatup."

16. **Expand every acronym, permissive and tag number on first use in a leg, and put source
    citations at the end of the paragraph in parentheses.**
    *Before:* "worth 8.1 pcm", "WTSM chapter 19: 'Prior to reaching …'" mid-paragraph → *After:*
    "worth 8.1 pcm (per cent mille, hundredths of a per cent of reactivity)"; "…terminate residual
    heat removal letdown before 350 °F (176.7 °C) (Westinghouse Technical Standard Manual, ch. 19)."

17. **Name the control by its engraving, and check it against the board before authoring.**
    *Before:* "Trim rods until the Tavg tile sits back inside its normal band." → *After:* "TRIM the
    control bank until AVG COOLANT TEMPERATURE is inside its program band."

---

## 6. What the screenshots changed

Read: `shot_pwr_heatup_a_page.png`, `shot_01_checklist_list.png`, `shot_pwr_heatup_b_panel_0.png`,
`shot_pwr_heatup_c_why_0/_2.png`, `shot_pwr_startup_c_why_0.png`,
`shot_pwr_raise_power_c_why_0.png`, `shot_pwr_lower_power_c_why_0.png`,
`shot_pwr_cooldown_c_why_1.png`.

The rendered form makes three of my findings worse, adds four I could not see in the source, and
does not soften anything.

### 6.1 The `Cautions` block is never shown to the player — this supersedes P4

The picker (`shot_01_checklist_list.png`) shows title + entry conditions only:
*"Mode 3, Hot Standby → Mode 1, At Power — startup to power / Requires RCS temperature near 547 °F ·
Requires RCS pressure near 2235 psi."* No purpose, no prerequisites, no cautions. The running panel
header shows title + *"Auto-checklist — steps check themselves off the instruments while you
operate."* and nothing else, **with "Show all details" already expanded** (`_c_why_0` headers read
"Hide all details" and are otherwise identical to `_b_panel_0`).

So: **the 100 °F/hr heatup limit, the 1 DPM startup-rate limit, the "never withdraw straight to the
1/M number" warning, the shrink-and-swell warning and the cold-shutdown-margin warning are all
unreachable in the product.** My §1 P4 recommendation — "move the buried cautions up into the
caution band" — would move them from invisible to invisible. **The caution band has to be built
before it can be filled.** Until it is, every caution must live in a step's `text`, which is the
only field guaranteed to render.

This also reverses my Leg 1 caution rewrite in §4: adding the HX FLOW control action to the leg
caution changes nothing today. It has to go into step 11's `text`, as my §2 rewrite does.

### 6.2 The acceptance criterion renders only on the ACTIVE step — this strengthens P5

Compare `shot_pwr_heatup_b_panel_0.png`: step 1 is active and shows a green
*"✓ When Plant in Mode 5, Cold Shutdown"*; steps 2 through 12 show **the text line and nothing
else**, although every one of them except 7, 8, 9 and 12 has a `checked off when`. Same in
`shot_pwr_cooldown_c_why_1.png`: steps 5, 7 and 8 all have criteria in the source and none renders.

**The operator cannot read ahead to see what a step will require.** That is precisely the mechanism
of the Leg 1 step 9 / step 10 trap: while performing step 9 you cannot see that step 10 has a
one-way pressure window, because step 10's acceptance is not drawn until step 10 goes active. A
procedure the crew cannot pre-read is a procedure they cannot plan a shift around.

### 6.3 The acceptance line is machine-generated and reads badly

`shot_pwr_startup_c_why_0.png`, Leg 2 step 1:

> text: *"Confirm the plant is ready: subcritical, steady source range counts, **Tavg 546.8 °F
> (286 °C)**, pressurized, pumps running."*
> acceptance: *"○ When Tavg within **14.4 °F (8 °C)** of **547 °F (286 °C)**"*

Two defects, one line apart, both visible at a glance: **the step says 546.8 °F and the acceptance
says 547 °F**, and the tolerance is rendered as *"within 14.4 °F (8 °C) of"*, which is a
back-converted `±8 °C` and a construction no procedure uses. A licensed operator reads a band:
**"533 to 561 °F (278 to 294 °C)"**. And it wraps mid-pair — *"(286"* ends the line, *"°C)"* starts
the next.

Where there is no `checked off when`, the panel substitutes the `control`/`target` fields as
**"Use Boron control: boration running toward 719 ppm"** (`shot_pwr_lower_power_c_why_0.png`). So
the `target` string is player-facing prose, not metadata — which makes P6 (targets that verify the
lamp, not the plant) a rendering problem as well as an authoring one, and makes the non-engraved
`control` names of P12 visible: the panel literally instructs the operator to *"Use Boron control"*
and *"Use RCP Run/Stop"*, neither of which is a label on the board.

### 6.4 The visual hierarchy is inverted: the game-pacing hint is the loudest thing on the card

There is one accent colour in the step card and it is spent on the ⏩ wait hint. Leg 1 step 11
renders as:

- **text** (white, 3 lines): *"Ride the heatup to Hot Standby: Tavg at or above 541.4 °F (283 °C)
  at 1700 psig. Do not pull rods or dilute."*
- **⏩ hint (orange, 2 lines):** *"This takes a while in plant time — use time acceleration (the
  speed control, top bar)."*
- **why (dim grey, 13 lines):** *"…If the rate crowds 100 °F/hr (55.6 °C/hr), raise HX FLOW on the
  RHR card to bleed heat…"* — line 4 of 13.

**The instruction on how to run the simulator faster is rendered more prominently than the heatup
rate limit and the only stated means of controlling it.** Same shape on Leg 3 step 2 (*"The
dilution runs a few plant-minutes at a time between legs. Start it now and let it work."*) and
Leg 4 step 1 (*"Start it first and take the legs while it works."*).

One partial mitigation: Leg 1 step 9's hint does carry the accumulator warning —
*"…665 psi (4.585 MPa) and will not accelerate again until the accumulator valve is open"* — so the
window is flagged in the loud slot. But it is framed as a **time-acceleration** fact. The player
learns "fast time will stop", not "you are about to lose a safety injection path for the rest of
the heatup". Reframe it as the consequence.

### 6.5 "ORDER MATTERS HERE" renders as the dimmest text on the card

`shot_pwr_cooldown_c_why_1.png`, step 9. The author's only emphasis tool was capitals, and the
render defeats them: the all-caps opening sits in the same dim grey as every other `why` sentence,
below a brighter step line and with no rule, colour or weight to lift it. Capitals in dim body text
read as *quieter*, not louder, because they are harder to parse at that contrast.

Corollary: **the `note` and the `why` are nearly indistinguishable when rendered.** Leg 1 step 3
draws the note (*"One click latches the drive… Click WITHDRAW again to halt early."*) as a grey
block, then the why as a grey block with a thin left rule. Two shades of grey separate a binding
instruction from optional background. This makes rule 9 of §5 (notes contain no actions) load-
bearing rather than stylistic: an action in a `note` is an action the operator has no way to
identify as one.

### 6.6 Line length and wrapping at ~340 px — real damage, easy to fix

Unit pairs and hyphenated labels break across lines constantly. From
`shot_pwr_heatup_b_panel_0.png` alone:

- Step 1: *"363 psi (2.5"* / *"MPa),"*
- Step 4: *"press UNLOAD (TURBINE-"* / *"GENERATOR card)"*
- Step 7: *"press A+B 7"* / *"% on the LETDOWN card"* — the value separated from its unit
- Step 9: *"the pressurizer pressure setpoint (Pressure"* / *"SP)"*

At this width a step line runs about 42 characters. **Steps of 3 rendered lines are the practical
ceiling**, and Leg 1 steps 1, 3, 4, 5, 6, 9, 10 and 11 all hit it or exceed it; the § 2 rewrites
that split steps into substeps buy this back directly. Fix the breaks with non-breaking spaces in
the pair (`2.5 MPa`, `7 %`) and by not putting a parenthetical acronym at the end of a clause.

Two layout bugs worth filing separately: the **"Hide all details" button sits inside the flowing
subtitle text**, splitting the sentence around it — *"Auto-checklist — steps check themselves
[button] off the instruments while you operate"* (`shot_pwr_raise_power_c_why_0.png`,
`shot_pwr_lower_power_c_why_0.png`); and Leg 4's title renders the tilde literally as
*"load rampdown to ~15 %"*.

### 6.7 Three whys are walls of grey

Rendered line counts at panel width: **Leg 1 step 10 — 19 lines**, step 9 — 15, step 11 — 13,
step 12 — 12+. Uniform dim grey, no paragraph break, no emphasis, no list. The emergency recovery
in step 10 (*"HEATER to OFF, SPRAY held open, back down through 1600 psig"*) lands on rendered
lines 12–13 of 19. Nobody reads to line 12 of a grey block mid-heatup. This is the strongest
possible argument for the §3 verdict: those five whys are not too long in the abstract, they are
too long *for this container*, and the cure is to take the instruction out of them (§6.1) rather
than to trim prose.

### 6.8 Board-label mismatches I could only find in the screenshot

Full table in P12 above. The four that matter most:

1. **"Tavg" is not on the board** — the tile reads **AVG COOLANT TEMPERATURE**, and the picker
   calls the same quantity *"RCS temperature"*. Three names, three surfaces, 34 uses in the steps.
2. **"Pressure SP" is not on the board** — it reads **SET PZR PRESSURE**. Cited in Leg 1 steps 9
   and 14 and Leg 6 steps 2 and 5, i.e. every pressurization and depressurization instruction.
3. **"SHUTDOWN card" and "RCP card" do not exist** — the first is the SHUTDOWN column of the
   **ROD CONTROL** card, the second is a pair of OFF / ON buttons beside the **RCP FLOW** readout.
4. **The scram is a two-press control.** The board reads **SCRAM / PRESS TO ARM**; Leg 5 step 2
   says only *"Press SCRAM."* Rewrite: *"ARM the reactor trip, then PRESS SCRAM."*

Also: the board prints **665 psig** on the accumulator tile while the steps and targets say
*"665 psi (4.585 MPa)"* — the psi/psig confusion of P8 is not merely internal to the text; the
board and the procedure disagree on the reference for the same interlock.

### 6.9 One thing the render gets right

The active step draws its criterion live (○ blue → ✓ green) and then demands an explicit
**"Acknowledge ✓"** press with *"This step is complete — acknowledge to continue."* That is
genuine place-keeping and better than a paper checklist. It is also the reason §6.2 matters so
much: the mechanism for showing a criterion exists and works, and is simply not used for the step
the operator is about to do next.
