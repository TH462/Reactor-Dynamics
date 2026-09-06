> **Record, not policy.** Independent readability review of the six PWR2 live checklists (Mode 5 → 100 % → Mode 5), 2026-09-06, by a fresh agent reading only the extracted checklist text and rendered-panel screenshots, in the role of an intelligent layman. The writing guide it fed is `Blueprint/CHECKLIST_WRITING_GUIDE.md`. §3 is the glossary the guide cites.
>
> **Corrections, measured after the review:** the steps it saw with no "done when" line are a RENDER fact (the panel draws the criterion only on the active step) — only 6 of 67 steps lack a predicate in the source. The accumulator valve it could not find is a clickable valve symbol beside the ACCUMULATORS tile. Its rule 11 (drop SI) conflicts with a standing owner directive and is carried in the guide as a ruling to be made (§6 U8).

# Readability review — the six PWR checklists, read by an intelligent layman

Reviewer's standpoint: a history teacher who bought this to learn how a reactor works. I know
what a pump and a valve are. I have played the tutorial-free version of nothing. I read the
panel on the right of the screen and I look at the board on the left to find the thing it names.

I read: the full checklist text; the whole-page screenshot (`shot_pwr_heatup_a_page.png`); the
heatup and startup panels with every "Why?" expanded; the raise-power, lower-power, shutdown and
cooldown panels with "Why?" expanded.

Two things I checked constantly and will keep referring to:

- **What the board actually says.** From the page shot the cards are: `ROD CONTROL` (two columns
  headed `CONTROL` and `SHUTDOWN`, buttons `WITHDRAW` / `INSERT`, speeds `SLOW` `MED` `FAST`,
  plus `1/M PLOT`, `TRIP BLOCKS`, `SCRAM`), `BORON` (`ON` `OFF` `SAMPLE`, a ppm box),
  `PRESSURIZER (PZR)` (columns `SPRAY` and `HEATER`, each `AUTO` `MANUAL` `OFF` with a 0–100 %
  box, and a box labelled `SET PZR PRESSURE`), `RCP FLOW` (`OFF` `ON`), `RHR` (`ALIGN`
  `ISOLATE`, `HX FLOW`), `ECCS` (`AUTO` `START` `STOP`), `CHARGING`, `LETDOWN` (`A 3%` `B 4%`
  `A+B 7%`, `CLOSED`), `TURBINE-GENERATOR` (`LOAD … MW`, `LATCH` `TRIP` `UNLOAD`),
  `STEAM DUMP` (`AUTO` `OPEN` `CLOSE`, `DUMP SETPOINT`), `ATMOS DUMP` (`AUTO` `SHUT`, `ADV SP`),
  `SG FEED` (`AUTO` `MAN` `OFF`), `AUX FEED WATER`, `NUC INSTR (NIS)` (`Δ TEMP AVG`,
  `STARTUP RATE … DPM`, `SOURCE RANGE … cps`, `INTER RANGE … A`, `CONTROL ROD POSITION 0/627`,
  `SHUTDOWN ROD POSITION 0/627`, `PERIOD`), an `ACCUMULATORS` status tile, and the six big tiles
  along the top: `REACTOR POWER`, `AVG COOLANT TEMPERATURE`, `SUBCOOLING MARGIN`,
  `PRIMARY PRESSURE`, `PRESSURIZER LEVEL`, `STEAM GENERATOR LEVEL`.
- **The panel is about 340 px wide.** A four-sentence "Why?" is roughly twenty lines of grey
  text in a narrow column, set in a dimmer grey than the step itself. Length costs more here
  than it would on a page.

---

## 1. First impressions — the first five things that made me want to give up

**1. The very first line of the very first step is four undefined things and a number I can't
find.**

> "Confirm Mode 5: Tavg 122 °F (50 °C), 363 psi (2.5 MPa), pumps stopped, turbine tripped,
> heaters off, both rod banks in."

I do not know what "Tavg" is. I scan the board for the word "Tavg" and it is **not there** — the
tile is called `AVG COOLANT TEMPERATURE`. I do not know what "Mode 5" is (the title bar says
"Mode 5, Cold Shutdown", so I guess it means cold and off, but there is no MODE readout anywhere
on the board for me to *confirm*). I do not know whether "both rod banks in" means the number
should be 0 or 627. The board says `CONTROL ROD POSITION 0 /627`. Is 0 "in"? I am guessing on
step one.

**2. The word "psi" is spelled three different ways for the same gauge and nobody tells me why.**

Leg 1 step 9: *"from 363 psi to 1700 **psig**, the dial floor"* — same sentence, two units.
Leg 1 step 14 why: *"1714 to 2188 **psia** in 21 plant-minutes."*
Leg 6 step 5: text says *"its 1700 **psig** floor"*, the target line under it says
*"**1716 psi** (11.83 MPa), the floor"*.

So the floor is 1700 or 1716 depending which line of the same step I read. I spent real time
trying to work out whether I'd misread something. The same thing happens with the accumulator
window: the target says *"1615 psi"*, the caution says *"1615 psi"*, and the "Why?" says
*"Above 1600 psig the valve has no power"*. Three numbers, one valve.

**3. "P-11", with no expansion, in a sentence that is doing four jobs at once.**

> "Two stages, because the first must stop below P-11 — the 1972 psi (13.6 MPa) permissive that
> re-arms the safety injection (SI) signals the cold lineup had blocked."

I do not know what a permissive is, what "re-arms" means here, what a "signal" is as a countable
noun, or what a "cold lineup" is. This is the explanation paragraph — the place I went *for
help* — and it is harder than the step. I read it three times and gave up.

**4. "pcm", in a warning, never defined anywhere in 67 steps.**

> "Measured on this plant, one control-bank step in the critical band is worth 8.1 pcm, so a
> burst you would call small still moves the core."

"Worth 8.1 pcm" is the load-bearing number in the sentence and I have no idea what a pcm is or
whether 8.1 of them is a lot. The sentence tells me a small thing is not small, using a unit
that makes the size unknowable. Same problem with *"worth 250 ppm"* (Leg 3 step 10) and
*"5e-11 A"* (Leg 2 step 12).

**5. Citations to documents I do not have, inside the text I am supposed to be reading.**

> "(WTSM 8.1.1)" · "WTSM chapter 19: 'Prior to reaching 350 °F (176.7 °C) in the RCS …
> Terminate residual heat removal letdown to the CVCS'" · "(TS Bases B 3.5.1)" · "(sourced,
> WTSM 5.1)" · "the HCV-128 cross-connect"

I don't know what WTSM is (it is never expanded, once, in the whole set). The chapter-19 quote
introduces two more unexpanded acronyms, RCS and CVCS, inside quotation marks, which makes them
feel official and makes me feel more stupid, not less. "HCV-128" is a tag number for a valve
that is not drawn anywhere I could find on the board. These read as the author reassuring
another author.

---

## 2. Systemic patterns

### P1. The step names a control by a name the board does not use

This is the single most common failure and it is fatal, because "find the button" is the whole
job. Confirmed mismatches against the page screenshot:

- **Leg 1 step 3** — *"SHUTDOWN card, speed FAST, click WITHDRAW once."* There is no SHUTDOWN
  card. There is a `ROD CONTROL` card with two **columns**, one headed `CONTROL` and one headed
  `SHUTDOWN`, and the `WITHDRAW` button I want is the one under the right-hand heading. I
  clicked the wrong `WITHDRAW` the first time.
- **Leg 1 step 8** — *"press AUTO on PZR HEATERS, then AUTO on PZR SPRAY."* The card is
  `PRESSURIZER (PZR)` and its columns are `SPRAY` and `HEATER` — singular, and in the opposite
  order to the sentence. Then **Leg 6 step 6** calls the same thing *"the HEATER card"*. Two
  names in one set for a column that has a third name on the board.
- **Leg 1 step 9 / Leg 6 steps 2 and 5** — *"the pressurizer pressure setpoint (Pressure SP)"*,
  *"the Pressure SP"*, *"the dial floor"*. The board box is labelled `SET PZR PRESSURE`. The
  string "Pressure SP" appears nowhere on screen.
- **Leg 1 step 11 and ~30 other places** — *"Tavg"*. Board tile: `AVG COOLANT TEMPERATURE`.
- **Leg 6 step 4** — *"Walk the DUMP SETPOINT down"*, but the step's own control label says
  `Dump SP`. Board says `DUMP SETPOINT`. Pick one.
- **Leg 1 step 10 / Leg 6 step 7** — *"Open the Accumulator valve"*. I could find an
  `ACCUMULATORS` tile reading `100 %`, `665 psig`, `ISOLATED`, but **no open/close control on
  it** in the screenshot. If it is behind a click on the tile, the step must say so.

**Fix:** every control reference is the board's exact string, in capitals, plus the card it
lives on: *"on the ROD CONTROL card, under SHUTDOWN, set FAST and click WITHDRAW."* Where the
board string is bad, change the board — do not paper over it in prose.

### P2. Terms are used many steps before they are explained, or never

The explanation, where it exists, is usually in a "Why?" that is collapsed by default, so the
first *visible* use is nearly always the undefined one.

- **"the point of adding heat"** — first appears Leg 2 step 3 "Why?" (*"nothing happens until
  the point of adding heat"*), then Leg 2 steps 11 and 13 rely on it completely
  (*"Below the point of adding heat there is no temperature feedback to hold you anywhere"*).
  Never defined, in any leg. I assumed it meant "when the reactor starts making noticeable
  heat" — correct, I think, but I had to invent it.
- **"on program" / "the program"** — actually *is* defined, well, in Leg 3 step 4. But it is
  used as a bare term in Leg 3 step 7 target (*"Tavg on program"*) and throughout Leg 4
  (*"insert rods until Tavg returns to program"*), which a player who starts at Leg 4 reaches
  first.
- **"in hand"** — Leg 1 step 6 why (*"ships the dump in hand and shut"*), step 8 why (*"the
  spray in hand and shut"*). This is trade slang for "in manual". I read it as "someone is
  holding it".
- **"primary" / "secondary"** — first used Leg 1 step 2 why and Leg 1 cautions. Never defined.
  These are the two water circuits and the whole diagram is about them.

**Fix:** define at first *visible* use, in the `text` or `note` line, not in the collapsed
"Why?". One clause: *"the average coolant temperature (the AVG COOLANT TEMPERATURE tile)"*.

### P3. The abbreviation is expanded once and then relied on forever — often after first use

- **SI** — expanded in Leg 1 step 9 "Why?" as *"safety injection (SI)"*. But it is a button
  name on the board (`SI REACTOR TRIP`) and appears bare in Leg 6 step 3's target line
  (*"SI REACTOR TRIP blocked"*) and heading (*"'Block SI'"*).
- **SUR** — Leg 2 caution writes *"Startup rate (SUR) limit"*, then Leg 2 step 11 text uses bare
  *"Watch SUR"*, step 13 uses *"as SUR crosses zero"*. The board tile says `STARTUP RATE` and
  never says SUR. Why is there an abbreviation at all for a thing whose full name is two words
  and is printed on screen?
- **DPM** — expanded once in Leg 2's caution as *"1 decade per minute (DPM)"*, then used bare in
  step 8 text and every "overtaken" message. "Decade" itself is not explained until you infer
  it from step 11's *"Power climbs through the decades."*
- **RHR, CVCS, RCS, ECCS, AFW, NIS, IR, PR, HX, ADV, WTSM** — RHR and AFW and ECCS get an
  expansion somewhere; CVCS, RCS, WTSM, HX and NIS never do.

**Fix:** a hard rule — an abbreviation appears in player text only if it is printed on the
board, and it is expanded on first use in *every leg*, since legs are entered independently.

### P4. Several ideas welded into one sentence

- **Leg 1 step 8 why**, second sentence, 47 words and four numbers:
  > "The next step's setpoint does nothing at all until the heaters are in AUTO: measured from
  > this point, dialling 1700 psig (11.72 MPa) with the heaters off moves the plant 0.05 psi in
  > 10 plant-minutes, against +133 psi (0.92 MPa) with the ladder in service."

  The point — *"the setpoint does nothing until the heaters are in AUTO"* — is the first nine
  words, and then it is buried under a controlled experiment.
- **Leg 1 step 7 why**, first sentence:
  > "On shutdown cooling, letdown runs out of the residual heat removal (RHR) system through the
  > HCV-128 cross-connect, and the orifices pass almost nothing against the 363 psi (2.5 MPa)
  > plant you start from."

  Six unknowns before the first comma-free clause ends.
- **Leg 1 step 11 why**, last sentence:
  > "Meanwhile the secondary does the thing the final pressurization is waiting for: it bottles
  > up past the 327.7 psi (2.26 MPa) low-steam-pressure SI setpoint on its way to the 1020 psi
  > (7.03 MPa) no-load anchor, which the step after next hands to the steam dumps to hold."

  One sentence containing a cross-reference to a step two ahead, two setpoints, and a metaphor.

**Fix:** one idea per sentence; put the measurement in a separate sentence beginning "Measured:".

### P5. Number overload, and half the numbers are unusable

Every pressure and temperature carries an SI pair — *"363 psi (2.5 MPa)"*. **The board shows no
SI anywhere.** Every gauge is °F, psi, %, gpm, MW. So on every number I read, half of it is
noise I must skip, and it doubles the length of the densest sentences. Leg 1's caution block
carries eight numbers in three sentences:

> "Heatup rate limit: 100 °F/hr (55.6 °C/hr). Measured on this plant: 87 °F/hr (48.3 °C/hr)
> with the pressurization running, and up to 113.7 °F/hr (63.2 °C/hr) on pump heat alone."

I need one number there — the limit. The other four are the author's homework.

Also over-precision: *"541.4 °F"*, *"577.7 °F"*, *"199.4 °F"*, *"1.9 %"*, *"8.1 pcm"*,
*"1615 psi (11.136 MPa)"* — a thousandth of a megapascal. The gauge reads whole psi.

**Fix:** SI pairs only where a term is being *taught*, or drop them from the panel entirely and
keep them in a manual. Round to the resolution of the gauge the player reads.

### P6. The action is often not the first thing in the sentence

Good (Leg 1 step 2): *"Start the reactor coolant pumps: press ON on the RCP card."*
Bad:

- **Leg 2 step 16** — *"Above P-10 (8 % power), press IR HIGH FLUX on TRIP BLOCKS."* The step
  opens with a precondition expressed as an undefined code.
- **Leg 6 step 8** — *"Let pressure fall through 425 psig with the spray still on."* The verb is
  "let", i.e. do nothing, but it took me a re-read to be sure I wasn't meant to make it fall.
- **Leg 1 step 12** — *"Confirm the letdown transfer: RHR suction autoclosed, letdown now on the
  orifices."* I cannot tell whether "the letdown transfer" is a thing that happened, a thing I
  do, or a control.

**Fix:** imperative verb first, always; preconditions go in a second sentence
(*"Do this only above 8 % power."*).

### P7. I often cannot tell an action from a "just look" step

The set has three kinds of step — press something, watch and wait, and confirm-nothing-to-do —
and they are typographically identical. Some are flagged, inconsistently:

- **Leg 1 step 6** ends *"Nothing to press."* — clear.
- **Leg 1 step 1** does not, and its "Why?" (collapsed) says *"This is a picture of the starting
  plant, not an action."* — I only learn it is not an action if I open the details.
- **Leg 1 step 4** — *"Confirm the turbine tripped … If a load target is set, press UNLOAD"* —
  conditional action inside a confirmation.
- **Leg 1 step 12, 15, 16, 17; Leg 2 step 12; Leg 3 steps 1, 9; Leg 6 steps 12, 13, 14** are all
  observations with no marker.

**Fix:** three visible badges — **DO**, **WATCH**, **CHECK** — on every step. It costs one word
and removes the commonest source of "am I stuck or am I finished?".

### P8. I often cannot tell what "done" looks like

Some steps show a blue "When …" line in the panel (Leg 1 step 1: *"When Plant in Mode 5, Cold
Shutdown"*; Leg 2 step 1: *"When Tavg within 14.4 °F (8 °C) of 547 °F (286 °C)"*). Many show
nothing at all — Leg 1 steps 7, 8, 12; Leg 2 steps 3, 15, 16, 17; **all five steps of Leg 4**;
Leg 6 steps 3, 6, 10. On those I have no idea whether the box ticks on a gauge, on my button
press, or after a wait.

Worse, some of the "when" lines need arithmetic: *"within 14.4 °F (8 °C) of 547 °F"* means "between
532.6 and 561.4" — please just say the band.

And some steps are unverifiable on the board at all:

- **Leg 1 step 16** — *"core deeply subcritical"*. There is no subcriticality gauge. I have to
  take it on trust.
- **Leg 1 step 1 / step 15 / Leg 6 step 12** — *"Confirm Mode 5" / "Confirm Mode 3" / "Confirm
  Mode 5"*. I could not find a MODE readout on the board.

**Fix:** every step carries a one-line "Done when: …" naming a tile and a value, in plain
inequalities (*"Done when AVG COOLANT TEMPERATURE is 533 °F or higher."*).

### P9. Sentences that only parse if you already know the answer

- **Leg 2 step 10 why** — *"You cannot see the moment criticality happens; you can only see that
  it has."* Elegant, and completely opaque before you know what criticality is. The step never
  says what criticality *is* (a self-sustaining chain reaction); it only says how to detect it.
- **Leg 1 step 3 why** — *"Withdrawing them is not a step toward criticality; it is the
  prerequisite for one."* This distinction is meaningful only to someone who already understands
  shutdown margin. To me, pulling rods out obviously moves toward criticality, and the sentence
  reads as a contradiction of what I just did.
- **Leg 2 step 16 why** — *"below P-10 the request auto-revokes, so a shutdown re-arms the whole
  net on its own."* "Request", "auto-revokes", "the net" — I cannot recover any of it.

**Fix:** teach the concept in one sentence before the clever line, or delete the clever line.

### P10. Two different ladders, three different meanings of "trip"

Metaphors collide:

- *"the ladder"* = the pressurizer heater banks (Leg 1 step 8 why: *"with the ladder in
  service"*).
- *"the startup net has two rungs taken in order"* (Leg 2 step 16 why) = two protective trips.
  Same imagery, unrelated system, ten steps apart.

And **"trip"** is used as: an event (*"the turbine tripped"*), a device you can block (*"the
25 % intermediate range trip"*), and a setting (*"the 118 % trip"*). Then **"block"** means
"switch off" — you press a button labelled with the trip's own name to *disable* it, which reads
backwards. **Leg 2 step 16**: *"press IR HIGH FLUX on TRIP BLOCKS. This blocks the 25 %
intermediate range trip."*

**Fix:** drop the metaphors. Say "switch off the automatic shutdown that fires at 25 % power —
it is no longer needed above 8 %."

### P11. The mechanic you need most is explained once, in the wrong leg, in a note

**Leg 1 step 3 note** is the only place in 67 steps that tells me how the rod drive actually
works:

> "One click latches the drive — it runs to the stop on its own, about 10 plant-minutes, and
> stops there. Click WITHDRAW again to halt early."

Leg 2 then asks me for *"about 90 steps"*, *"about 60 steps"*, *"about 30 steps"*, *"about 15"*,
*"about 10"*, then *"single steps"* — six steps of precision work — and never repeats the
mechanic. I had to reason out that I click WITHDRAW, watch `CONTROL ROD POSITION` count up, and
click again to stop. **Leg 2 step 13** then says *"Insert at MED in one drive and release as SUR
crosses zero"* — "release" implies I am *holding* the button, contradicting "click … click
again". I genuinely do not know which it is.

Also never explained: what SLOW / MED / FAST mean in steps per minute, so "about 10 steps at
MED" is unaimable.

**Fix:** put the drive mechanic in Leg 2 step 5's note, with the speeds:
*"Click WITHDRAW to start the rods moving and click again to stop them. Watch CONTROL ROD
POSITION. MED moves about N steps a minute."*

### P12. Tone: aphorism where instruction is needed

The writing likes a closing epigram. They are pleasant but they occupy the position where I
expect the answer:

- *"Full power is a landing, not a lunge."* (Leg 3 step 8)
- *"One drive, not taps. The plant runs while you tap."* (Leg 2 step 13) — I think this means
  "the simulation does not pause while you click", which is genuinely useful and is being said
  in six cryptic words.
- *"A real cooldown leaves that dial's world exactly here."* (Leg 6 step 5)
- *"ORDER MATTERS HERE, and getting it wrong costs you the align."* (Leg 6 step 9) — shouting,
  and "the align" is a verb used as a noun.

There is no *patronising* tone — that is not the problem. The problem is that the voice is
addressed to a colleague, not a learner.

### P13. Things referenced that are not on my screen

Besides the WTSM/TS-Bases/HCV-128 citations (first impressions §5): *"the make-up panel"*
(Leg 2 step 2 note, Leg 3 step 2 — I cannot find a make-up panel), *"the low amber band"*
(Leg 2 step 3 why), *"ROD LIMIT LO-LO is lit"* (Leg 3 step 10 note — an alarm name I must trust
will appear), *"the 20 % rod stop"* and *"the 103 % rod stop"* (no rod-stop indication I could
identify), *"the insertion limit"* and *"its manoeuvring band"* (Leg 3 steps 2, 8, 10 —
invisible limits on a rod position I can see).

**Fix:** if a step names an indication, it must name the tile it appears on, or say "you will
not see this; take it on trust."

### P14. The "overtaken" message is five identical paragraphs of bad news

Leg 2 steps 4–9 all carry the same 60-word block:

> "The source range de-energized before this point could be plotted: the count rate passed
> 100,000 counts per second, which is past the approach. …"

If several fire together I get the same wall of text five times, and its first clause is the
most jargon-dense sentence in the leg. Whatever it is telling me, the actionable part is the two
words "Stop withdrawing."

**Fix:** *"Too late to plot — the reactor is already at or near critical. Stop withdrawing.
Watch STARTUP RATE and keep it under 1 decade per minute."* Show it once, at the top of the
group, not on every step.

### P15. Contrast and layout in the panel itself

In every screenshot the step text is white and the "Why?" is a noticeably dimmer grey, and the
`note` is dimmer again. The longest passage is set in the least readable colour, in a 340 px
column. The orange fast-time hints (*"This takes a while in plant time — use time acceleration
(the speed control, top bar)"*) are the most legible thing on the panel and also the most
immediately useful — that is the right treatment applied to the least conceptual content.

---

## 3. The glossary these checklists need

Terms a layman meets undefined, with the first place they appear in something I can see
(step text, note or the caution block at the head of a leg), and the one line I want shown —
ideally as a tap-to-define on the term itself.

| Term | First met | Plain-English line I want |
|---|---|---|
| Tavg | Leg 1 prerequisites; Leg 1 step 1 text | The average temperature of the water in the reactor loop — the `AVG COOLANT TEMPERATURE` tile. |
| Mode 5 / Mode 3 / Mode 2 / Mode 1 | Leg 1 title and step 1 | Official states of the plant: 5 = cold and shut down, 3 = hot but shut down, 2 = starting up, 1 = making power. |
| subcritical / critical / criticality | Leg 1 purpose; Leg 1 step 16 | Critical = the chain reaction sustains itself. Subcritical = it dies out. Critical is normal, not dangerous. |
| shutdown bank / control bank / "bank" | Leg 1 caution; step 3 | Two groups of control rods. The shutdown bank is the emergency brake, parked out of the way; the control bank is the throttle. |
| rods "in" / "out" / withdrawn / inserted | Leg 1 step 1 ("both rod banks in") | "In" = pushed into the core, position 0, reaction suppressed. "Out"/withdrawn = 627, reaction free. |
| step (of rod travel) | Leg 1 step 3 ("627 of 627 steps") | One notch of rod movement. This reactor's rods have 627 of them. |
| scram / trip | Leg 1 step 3 why; Leg 5 step 2 | An emergency shutdown: all rods drop into the core in seconds. |
| reactor coolant pump (RCP) | Leg 1 prerequisites | The pumps that push water round the reactor loop. `RCP FLOW` card. |
| primary / secondary | Leg 1 caution; step 2 why | Two separate water circuits. Primary carries heat out of the reactor; secondary boils into steam for the turbine. |
| residual heat removal (RHR) | Leg 1 prerequisites | A low-pressure cooling loop used only when the plant is cool — the way heat leaves a shut-down plant. |
| letdown / charging / orifice | Leg 1 step 7 | Letdown lets water *out* of the reactor loop, charging puts it back. An orifice is a fixed hole that sets how fast letdown flows. |
| CVCS | Leg 1 step 7 control label | The chemical and volume control system — the plumbing that does letdown, charging and boron. |
| RCS | Leg 1 step 7 why (quotation) | Reactor coolant system: the primary loop. |
| pressurizer (PZR) | Leg 1 step 8 | A tank of half-water, half-steam that sets the pressure of the whole primary loop. |
| heaters / spray | Leg 1 step 8 | Heaters boil water in the pressurizer to raise pressure; spray condenses steam to lower it. |
| setpoint | Leg 1 step 8 why | The number you tell an automatic controller to hold. |
| AUTO / MANUAL / "in hand" | Leg 1 step 6 why | AUTO = the plant holds the setpoint for you. MANUAL (also called "in hand") = you drive it. |
| lineup | Leg 1 step 4 why ("the cold lineup") | The set of valve and switch positions the plant starts in. |
| P-11, P-10, P-6 (and "permissive") | Leg 1 step 9 why; Leg 2 step 12, 16 | A permissive is an automatic gate: below/above a certain reading the plant refuses or allows an action. P-11 is a pressure gate, P-10 and P-6 are power gates. |
| safety injection (SI) | Leg 1 step 9 why | Emergency pumps that flood the reactor with borated water. You do not want them firing on a healthy plant. |
| ECCS | Board card, Leg 6 step 3 why | Emergency core cooling system — the injection pumps, held in standby. |
| accumulator / cover gas / nitrogen | Leg 1 step 10 | Tanks of borated water pressurised by nitrogen gas, which fire by themselves if the loop pressure ever drops. "Cover gas" pressure = 665 psi, the pressure of that nitrogen. |
| psi / psig / psia | Leg 1 step 9 vs step 14 why | Three ways of quoting the same pressure. They differ by about 15. **Do not use more than one.** |
| steam dump / no-load anchor | Leg 1 caution, step 6 | Valves that send steam straight to the condenser instead of the turbine. The "no-load anchor" is the steam pressure the plant holds when the turbine is not running (1020 psi). |
| atmospheric dump valve (ADV) | Leg 1 step 11 why | A relief valve that dumps steam to the sky. A last resort, and wasteful. |
| condenser | Leg 1 step 6 why | The big box that turns used steam back into water. |
| steam generator (SG) | Leg 1 step 5 | The boiler: reactor water heats it on one side, steam comes off the other. |
| shrink and swell | Leg 4 caution | On a load change the water level in the boiler momentarily moves the *wrong* way. Ignore it. |
| feedwater / AFW | Leg 1 step 5; Leg 2 step 3 why | Feedwater refills the boiler. AFW (auxiliary feedwater) is the emergency backup set of pumps. |
| boron / ppm / dilute / borate | Leg 2 step 2 | Boron dissolved in the water soaks up neutrons and slows the reaction. ppm = parts per million. Borate = add it. Dilute = wash it out. |
| reactivity | Leg 2 step 5 why | How strongly the chain reaction wants to grow or shrink. |
| pcm | Leg 2 caution | The unit reactivity is measured in. 8.1 pcm is a very small nudge; a few hundred is a big one. |
| source range / intermediate range / power range | Leg 1 step 16; Leg 2 steps 4, 11, 16 | Three neutron meters covering three enormous spans of power, handing over as power rises. |
| counts per second (cps) / "1.4e3" | Leg 2 step 4 note | Neutron clicks per second. "1.4e3" means 1,400. (This note is well done and should be moved earlier.) |
| 1/M | Leg 2 purpose, step 4 | A plot that predicts where the rods will be when the reactor goes critical, before you get there. |
| startup rate (SUR) / decade / DPM | Leg 2 caution | How fast power is multiplying. One "decade" is a factor of ten. 1 DPM = power ×10 every minute. |
| the point of adding heat | Leg 2 step 3 why | The power at which the reactor starts warming the water measurably — around 1 %. Below it, the plant will not slow itself down. |
| temperature feedback / moderator | Leg 2 step 11 why; Leg 3 step 2 why | Hotter water slows the reaction on its own. It is the plant's self-braking. |
| trip block | Leg 2 step 16 | Switching off an automatic shutdown that only applies at low power. |
| rod stop | Leg 2 step 16 why | An interlock that simply refuses to let the rods move further. |
| xenon | Leg 3 step 10 | A neutron-absorbing gas that builds up inside the fuel over hours after you raise power, and fades over about two days. |
| insertion limit / manoeuvring band | Leg 3 steps 2, 10 | How deep the rods are allowed to sit at a given power. |
| "on program" / Tavg program | Leg 3 step 4 | The temperature the plant is *supposed* to be at for the power it is making — it rises with load. |
| MWe / load target | Leg 2 step 15 | Megawatts of electricity. The load target is what you ask the generator to produce. |
| latch (turbine) | Leg 2 step 15 | Reset and arm the turbine so it can take steam. |
| governor | Leg 1 step 4 why | The valve that decides how much steam the turbine takes. |
| decay heat | Leg 5 caution, step 2 why | Heat the fuel keeps making for days after shutdown. It cannot be switched off. |
| subcooling margin | Leg 6 caution, step 6 | How many degrees below boiling the reactor water is. Your safety cushion. Never let it reach zero. |
| HX FLOW | Leg 1 step 11 why; Leg 6 step 9 | How much of the cooling flow goes through the heat exchanger — effectively the cooldown throttle. |
| WTSM / TS Bases | Leg 1 step 3 why | Reference documents. **Delete from player text.** |

---

## 4. Per-leg, per-step findings (all 67)

Format: `verdict — what loses me — rewrite of the text line`.
Board strings in CAPITALS as they actually appear on screen.

### Leg 1 — plant heatup (17 steps)

**L1 S1 — confusing** — "Tavg" is not a word on the board, "Mode 5" has no readout to confirm it
against, and "both rod banks in" doesn't say which number means "in". → *"Check the plant is
cold and shut down: AVG COOLANT TEMPERATURE 122 °F, PRIMARY PRESSURE 363 psi, RCP FLOW off,
turbine tripped, both HEATER and SPRAY off, CONTROL and SHUTDOWN ROD POSITION both 0 of 627."*

**L1 S2 — clear** — the model step: verb, control, one-line reason. Only "forced flow" is
jargon. → *"Start the reactor coolant pumps: press ON on the RCP FLOW card. Their friction is
what heats the plant."*

**L1 S3 — confusing** — there is no "SHUTDOWN card"; and "627 of 627 steps" arrives before I
know what a step is. → *"On the ROD CONTROL card, under SHUTDOWN: press FAST, then click
WITHDRAW once. The rods run all the way out to 627 of 627 on their own."*

**L1 S4 — confusing** — a confirmation with a conditional action inside it, and I don't know
what "off line" or a "load target" is yet. → *"Check the TURBINE-GENERATOR card reads TRIP and
OUTPUT 0 MW. If LOAD shows anything but 0, press UNLOAD."* (The UNLOAD-is-not-TRIP point in the
"Why?" is good and should stay.)

**L1 S5 — clear** — "holds steam generator (SG) level" is fine because the tile
`STEAM GENERATOR LEVEL` exists. → keep, but add the tile name: *"…and holds the STEAM GENERATOR
LEVEL tile near 65 %."*

**L1 S6 — clear** — "Nothing to press" is the best two words in the set; every observation step
should carry them. The clause *"status reading MANUAL"* is fine (the board shows `MANUAL`). →
*"Check the STEAM DUMP card: CLOSE is lit and the status reads MANUAL. Nothing to press."*

**L1 S7 — lost** — "letdown", "orifices", "A+B 7 %" all arrive at once with no idea what any of
them do; the "Why?" then adds RHR, HCV-128, CVCS, RCS and four pressures. This is the hardest
step in the set. → *"Open both letdown valves — the way water leaves the reactor loop: press
A+B 7 % on the LETDOWN card. Water is always being pumped in, so it needs a way out."*
**"Why?" break point:** *"On shutdown cooling, letdown runs out of the residual heat removal
(RHR) system through the HCV-128 cross-connect…"* — I stopped at "HCV-128".

**L1 S8 — confusing** — "pressurizer pressure control", "in service", and two card names that do
not match the board (`PRESSURIZER (PZR)`, columns `SPRAY` / `HEATER`). → *"Hand pressure control
to the plant: on the PRESSURIZER (PZR) card press AUTO under HEATER, then AUTO under SPRAY."*
**"Why?" break point:** the 47-word measured-comparison sentence (P4 above).

**L1 S9 — confusing** — mixes psi and psig in one sentence; "the dial floor" and "Not 2235 psi
yet" only make sense once you've read the "Why?", which is itself the P-11 sentence I gave up
on. → *"Raise the pressure setpoint: set SET PZR PRESSURE to 1700 psi. Stop there — going
straight to 2235 would set off the emergency injection while the plant is still cold."*

**L1 S10 — confusing** — the action is clear and urgent, but I could not find the control; and
"on the way past" assumes I know the plant is climbing through a window. → *"Open the
accumulator valve while pressure is between 665 and 1615 psi — you have about 35 plant-minutes.
Above 1615 psi the valve locks and you cannot open it without starting over."* **Also:** name
the button and the card. **"Why?" is one of the best in the set** — keep the mechanism, cut
"(TS Bases B 3.5.1)".

**L1 S11 — clear-ish** — the action ("wait") is clear; "Do not pull rods or dilute" is a good
prohibition; "541.4 °F" is falsely precise and conflicts with the 546.8 °F quoted everywhere
else for the same state. → *"Now wait while the plant heats up. Done when AVG COOLANT
TEMPERATURE reaches 541 °F. Do not move rods and do not change BORON."*

**L1 S12 — confusing** — "Confirm the letdown transfer" reads like an action; I cannot see an
"RHR suction" indication to confirm. → *"Nothing to press. The RHR suction valve shut itself at
585 psi, so letdown is now flowing through the orifices you opened in step 7. Check LETDOWN is
not reading 0 gpm."*

**L1 S13 — clear** — good short step; "take over the heat sink" is jargon-flavoured but the
meaning survives. → *"Press AUTO on the STEAM DUMP card. The condenser now takes the heat
instead of venting it to the sky."*

**L1 S14 — clear** — one action, one number, one reason. The best-shaped step in Leg 1. →
*"Raise SET PZR PRESSURE to 2235 psi — normal running pressure. It is safe now: the secondary
is hot."*

**L1 S15 — confusing** — "the no-load band" and "control bank never moved" are checks I cannot
perform (no MODE readout, no band drawn). → *"Nothing to press. Check: hot, at 2235 psi, reactor
still shut down, CONTROL ROD POSITION still 0. That is Mode 3, Hot Standby."*

**L1 S16 — confusing** — "deeply subcritical" has no gauge. → *"Nothing to press. Check
REACTOR POWER is still 0.0 % and SOURCE RANGE counts are steady, not climbing."*

**L1 S17 — clear** — but it duplicates S16 almost exactly; I could not see why they are two
steps. → merge into S16.

**Leg 1 "Why?" paragraphs I could not follow:** S7 (broke at "HCV-128 cross-connect"), S8 (broke
at the 47-word measured sentence), S9 (broke at *"the permissive that re-arms the safety
injection (SI) signals the cold lineup had blocked"*), S12 (broke at *"an orifice passes more the
harder you push on it, 10.8 gpm here and 12.7 gpm once…"* — I could not tell whether that was
good or bad news).

### Leg 2 — startup to power (18 steps)

**L2 S1 — confusing** — "steady source range counts" is the first mention of source range as a
thing I must judge, and the tick condition shown is *"within 14.4 °F (8 °C) of 547 °F"*, which
needs arithmetic. → *"Check the plant is hot and still shut down: AVG COOLANT TEMPERATURE about
547 °F, PRIMARY PRESSURE 2235 psi, RCP FLOW on, SOURCE RANGE counts steady."*

**L2 S2 — clear** — the sequence "set 719, press ON" matches the board. "estimated critical
concentration" is heavy for the text line but the note is genuinely helpful. → *"Wash boron out
of the water until it reads 719 ppm: on the BORON card set 719 and press ON. Boron soaks up
neutrons; less of it means the reactor can go critical with the rods only part-way out."*

**L2 S3 — clear** — but the "Why?" ends with the flat assertion *"AFW is an emergency heat sink,
not a level control system"*, which means nothing without knowing what AFW is for. →
*"Check SG FEED reads AUTO. If not, press AUTO. Nothing works properly later without it."*

**L2 S4 — confusing** — "the 1.0 reference" is an unexplained number, and the whole 1/M idea
arrives in a collapsed "Why?". The note about `7.0e2` = 700 is excellent and should be in the
text line, not the note. → *"Before you move any rod, open 1/M PLOT and press Plot point. This
first reading is your baseline. (SOURCE RANGE reads in shorthand: 7.0e2 means 700 counts a
second.)"*

**L2 S5 — confusing** — how do I withdraw "about 90 steps"? The mechanic was explained one leg
ago in a note. → *"On ROD CONTROL under CONTROL, press MED, then click WITHDRAW and click again
when CONTROL ROD POSITION reaches about 90. Wait for STARTUP RATE to fall back to zero, then
press Plot point."* **"Why?"** is one of the clearest in the set — keep it.

**L2 S6 — confusing** — "READ the predicted critical position on the 1/M panel. It reads high."
tells me the answer is wrong before I have understood what it is. → *"Withdraw to about 150,
settle, plot. The 1/M panel now prints 'predicted criticality ≈ step N'. Treat it as too high —
it improves with every point."*

**L2 S7 — confusing** — "the fit now lands within a dozen steps" — of what? → *"Withdraw to
about 180, settle, plot. The prediction is now within about a dozen steps of the truth."*

**L2 S8 — confusing** — "Keep bursts small enough that the startup rate (SUR) stays under 1 DPM"
introduces the abbreviations SUR and DPM in a sentence that is also the safety limit. →
*"Withdraw to about 195, settle, plot. Watch STARTUP RATE: keep it under 1.0 — that is power
multiplying by ten per minute, and it is your speed limit."*

**L2 S9 — confusing** — "Point 6 is your working prediction" assumes I have been counting my
plots. → *"Withdraw to about 205 — the last small pull. Settle, plot. Write down the number the
1/M panel predicts; from here you creep up on it by hand."*

**L2 S10 — confusing but the best-taught step in the set** — the "Why?" is genuinely excellent;
the text line's *"until the startup rate holds positive and the counts keep climbing with the
rods stopped"* is a three-condition test and takes a re-read. → *"Press SLOW and withdraw one
step at a time. After each one, stop and watch: when SOURCE RANGE keeps climbing and STARTUP
RATE stays positive with the rods not moving, the reactor is critical."*

**L2 S11 — confusing** — "Power climbs through the decades" uses "decades" before it is
explained, and "Watch SUR and the intermediate range" names two things by abbreviation and by a
name I have not been shown on the board (`INTER RANGE`). → *"Withdraw two more single steps.
Power now climbs by factors of ten. Watch STARTUP RATE and the INTER RANGE meter."*

**L2 S12 — clear** — "No operator action on this plant" is the right flag, and the "Why?"
explains it properly. Only *"comes on scale at 5e-11 A"* is dead weight. → keep; delete the
5e-11 A.

**L2 S13 — lost** — *"Insert at MED in one drive and release as SUR crosses zero, about 14
steps."* "one drive" and "release" contradict the click-click mechanic; "as SUR crosses zero" is
a moving target; "about 14 steps" is a fourth constraint. Four instructions in twelve words. →
*"Press MED and click INSERT. Watch STARTUP RATE fall; when it reaches zero, click INSERT again
to stop — about 14 steps. Power should settle near 1 %."*

**L2 S14 — clear** — good. → *"Press SLOW and withdraw about 13 steps until REACTOR POWER
passes 5 %. That is Mode 1, At Power."*

**L2 S15 — clear** — but the "Why?" mentions *"protection reset if a trip stands"*, an action
that is not a step; if I might need it, it must be a step. → *"Press LATCH on the
TURBINE-GENERATOR card, then set LOAD to 10 MW. The generator starts making electricity and the
reactor follows it up."*

**L2 S16 — lost** — "Above P-10 (8 % power)" leads with a code; "IR HIGH FLUX" and "the 25 %
intermediate range trip" are the same thing named two ways; "blocks" means "switches off". →
*"Once REACTOR POWER is above 8 %, open TRIP BLOCKS and press IR HIGH FLUX. This switches off
the automatic shutdown that fires at 25 % power — it is only needed during startup, and it will
also stop your rods at 20 % if you leave it on."*

**L2 S17 — confusing** — "the 35 % power range low setting" and "the backstop behind the rung
you just blocked". → *"On TRIP BLOCKS press PR HIGH (LOW SETPT). This switches off the second
startup shutdown, at 35 %. Above 8 % the 118 % shutdown protects you instead."*

**L2 S18 — clear** → *"Nothing to press. Check: REACTOR POWER near 10 %, generator on line.
Go on to the power ascension checklist."*

**Leg 2 "Why?" paragraphs I could not follow:** S4 (broke at *"1/M is the shutdown count rate
divided by the current count rate"* — I do not know what "the shutdown count rate" is, since
nothing has been called that), S12 (broke at *"comes on scale at 5e-11 A"*), S16 (broke at
*"below P-10 the request auto-revokes, so a shutdown re-arms the whole net on its own"*).

### Leg 3 — power ascension (10 steps)

**L3 S1 — confusing** — "the at-power lineup" and "both startup-net blocks standing" are two
terms from the previous leg's jargon. → *"Nothing to press. Check: reactor critical, generator
loaded, SG FEED in AUTO, and both trip blocks from the last checklist still on."*

**L3 S2 — confusing** — "Set the BORON card to 660 ppm with the controller ON" is clear as an
action, but "The dilution runs under the whole ascension" is a metaphor doing real work
(meaning: it keeps running in the background). → *"Set BORON to 660 ppm and press ON. This runs
slowly in the background for the whole climb — start it now."*

**L3 S3 — clear** — one of the best steps in the set: an action, a wait time, and a "Why?" that
explains a real-plant fact I did not know. → keep as is.

**L3 S4 — clear** — long, but the "Why?" defines "on program" properly and even says which way
to trim. The only loss: *"Trim rods until the Tavg tile sits back inside its normal band"* — I
cannot see a band on the `AVG COOLANT TEMPERATURE` tile in the screenshot. → *"Withdraw about 30
steps at MED, then set LOAD to 30 MW. Then nudge the rods until AVG COOLANT TEMPERATURE is back
inside the green band on its tile."*

**L3 S5 — clear** → *"Withdraw about 32 steps, set LOAD to 50 MW, then nudge rods until AVG
COOLANT TEMPERATURE is back in its band."*

**L3 S6 — clear** — same shape. The "Why?"'s diagnostic (*"If Tavg reads below it, you led with
load instead of rods"*) is genuinely useful teaching. → as S5, 35 steps / 75 MW.

**L3 S7 — confusing** — "the 103 % rod stop is close" arrives with no explanation of a rod stop
and no indication I can watch. → *"Withdraw about 18 steps, set LOAD to 90 MW, then trim. Make
smaller pulls from here: above 103 % power the plant simply refuses to move the rods."*

**L3 S8 — clear** → *"Withdraw about 9 steps, set LOAD to 100 MW, then trim AVG COOLANT
TEMPERATURE onto 578 °F. REACTOR POWER settles near 101 %."*

**L3 S9 — confusing** — the "Why?" spends its whole length telling me what I have *not* achieved
("You are NOT yet at the Hot Full Power preset"), comparing my plant to a menu option I may never
have used. → *"Nothing to press. Check REACTOR POWER near 100 %, OUTPUT 100 MW, AVG COOLANT
TEMPERATURE 578 °F."*

**L3 S10 — confusing** — the step is an instruction to do something *"over the next hours"* with
no completion test, and the note leads with an alarm name (`ROD LIMIT LO-LO`) as if I would
recognise it. → *"Xenon — a neutron-absorbing gas — is now building up in the fuel. Over the
next few hours, lower BORON gradually toward 626 ppm; the rods will walk back out as you do.
The ROD LIMIT LO-LO alarm is lit and that is normal here."*

**Leg 3 "Why?" paragraphs I could not follow:** S2 (broke at *"they would end deep in the core
distorting the power shape"* — I have no picture of a power shape), S10 (the sentence *"full
power wants 876 ppm with the bank fully out at zero xenon and 626 ppm at equilibrium"* packs
four variables into one clause).

### Leg 4 — load rampdown (5 steps)

**L4 S1 — confusing** — "719 ppm, the no-load concentration" and "Boration runs under the legs":
"legs" has not been defined as a word for the stages of the checklist, and this is step 1 of the
leg a player may enter first. → *"Add boron first: set BORON to 719 ppm and press ON. It runs in
the background while you take the plant down."*

**L4 S2 — clear** — the "Why?" is one of the best physics explanations in the set. Only "returns
to program" needs the definition repeating from Leg 3. → *"Set LOAD to 75 MW and let power come
down on its own. Then insert rods until AVG COOLANT TEMPERATURE is back in its band."*

**L4 S3 — clear** → *"Set LOAD to 50 MW, let power follow, then insert about 20 steps."*
The "Why?"'s *"Shrink and swell dips indicated SG level the wrong way first"* uses "indicated"
as an adjective, which reads as a typo to a layman — say "the STEAM GENERATOR LEVEL gauge dips
before it rises. Ignore it."

**L4 S4 — clear** → *"Set LOAD to 30 MW, let power follow, then insert about 10 steps."*

**L4 S5 — confusing** — "This is the shutdown handoff" is internal vocabulary. → *"Set LOAD to
15 MW, let power follow, then insert about 6 steps. Stop here — the shutdown checklist takes
over."*

**Note on the whole leg:** none of the five steps shows a "done when" line in the panel, so on
every one I am left wondering whether the box ticks when I set the dial or when power arrives.

### Leg 5 — normal shutdown (3 steps)

**L5 S1 — clear** → *"Set LOAD to 0 MW. The generator unloads and the reactor follows it
down."*

**L5 S2 — clear** — the shortest, best step in the set. → keep. (One gap: `SCRAM` on the board
reads `PRESS TO ARM`, so it takes two presses. The step says "Press SCRAM" once.)

**L5 S3 — confusing** — "decay heat remains, near 1.9 %, on the steam dump" packs a new concept
(decay heat), a number, and a destination into six words, and "This is Mode 3" asserts a mode I
cannot read off the board. → *"Nothing to press. Fission has stopped, but the fuel still makes
about 2 % of full heat and will for days. The steam dump is carrying it. The plant is now hot
and shut down — Mode 3."*

### Leg 6 — controlled cooldown (14 steps)

**L6 S1 — clear** — "Nothing cools until this is running" is an excellent piece of urgency, and
the "Why?" explains *why* cold needs more boron, which taught me something real. → *"Add boron
first: set BORON to 920 ppm and press ON. Cold water makes the reaction easier, so you need more
boron before you cool anything."*

**L6 S2 — confusing** — "under P-11, to unlock the protection blocks" is two codes and a
metaphor. → *"Lower SET PZR PRESSURE to 1900 psi. Below 1972 psi the plant will let you switch
off the protection that is about to get in your way."*

**L6 S3 — lost** — three button presses across two cards, two of the buttons named in codes
(`PZR PRESS LO-LO`, `SI REACTOR TRIP`), and the reason ("Block SI") uses a term the step itself
does not use. → *"On TRIP BLOCKS press PZR PRESS LO-LO, then SI REACTOR TRIP. Then press STOP on
the ECCS card. A cooldown looks exactly like a leak to the automatic protection — switch it off
now or it will shut the reactor down and flood it."*

**L6 S4 — confusing** — five numbers in a row with no rule for when to move to the next one.
This is the longest single action in the set and it is the least instructed. → *"Lower DUMP
SETPOINT in stages — 1020, then 640, 400, 240, 120 psi. Wait for AVG COOLANT TEMPERATURE to stop
falling before each new step. About two and a half plant-hours in all; use time acceleration."*

**L6 S5 — confusing** — the text says the floor is 1700 psig and the target line under it says
1716 psi. → *"Lower SET PZR PRESSURE to its lowest setting, 1700. The dial goes no further —
from here you control pressure by hand."*

**L6 S6 — confusing** — "set SPRAY to MANUAL at 100 %" is two actions (select MANUAL, then type
100 into the box) written as one, and the card name is wrong (`PRESSURIZER (PZR)`, column
`HEATER`). → *"On the PRESSURIZER (PZR) card press OFF under HEATER. Then press MANUAL under
SPRAY and set its box to 100 %. Watch the SUBCOOLING MARGIN tile stay well above zero."*

**L6 S7 — confusing** — good urgency, same missing control as Leg 1 step 10, and the
665/1600/1615 number confusion. → *"Close the accumulator valve now, while PRIMARY PRESSURE is
between 1615 and 665 psi. Below 665 the tanks would empty themselves into the reactor."*

**L6 S8 — clear** — a genuinely well-shaped waiting step: what to do (nothing), what not to do
(don't shut the spray), and how long. → *"Wait, with the spray still on, until PRIMARY PRESSURE
falls below 425 psi. About eight plant-minutes."*

**L6 S9 — confusing** — the shouted "ORDER MATTERS HERE" tells me to be careful without telling
me what to be careful of until three sentences in. → *"With the spray still running, press ALIGN
on the RHR card, then set HX FLOW to 7 %. Do it before you switch the spray off: if pressure
climbs back over 425 psi, ALIGN will refuse."*

**L6 S10 — clear** → *"Press OFF on the RCP FLOW card, then set SPRAY to OFF. RHR now
circulates the plant."*

**L6 S11 — clear** → *"Raise HX FLOW from 7 % to 25 % and wait until AVG COOLANT TEMPERATURE is
below 199 °F. About two plant-hours. Lower HX FLOW if it falls too fast."*

**L6 S12 — confusing** — "pressure 250 to 550 psi" is a band that appears nowhere else in the
set, and "Confirm Mode 5" again has no readout. → *"Nothing to press. Check: AVG COOLANT
TEMPERATURE below 199 °F, PRIMARY PRESSURE between 250 and 550 psi, RCP FLOW off, RHR running.
The plant is cold and shut down."*

**L6 S13 — clear** → *"Nothing to press. Check the ACCUMULATORS tile reads 100 % and ISOLATED.
The next heatup will need them full."*

**L6 S14 — clear** → *"Nothing to press. Check RHR is running and its suction valve is open. It
is now the only thing removing heat. Round trip complete."*

**Leg 6 "Why?" paragraphs I could not follow:** S4 (broke at *"it cannot pull the primary below
its own saturation temperature"* — "saturation temperature" is undefined and load-bearing),
S6 (broke at *"the normal spray condenses pressurizer steam using recirculated loop water: no net
mass is added, so level holds while pressure walks down"* — three concepts, one clause).

---

## 5. The "Why?" paragraphs

**Length.** Mostly too long, and wrongly distributed: the paragraph is longest exactly where the
step is hardest, so the reader who is already struggling gets the most text. Measured by
sentences in a ~340 px column, Leg 1 step 8 is 4 sentences / ~150 words / about 22 rendered
lines, Leg 1 step 10 is 5 / ~155, Leg 1 step 7 is 5 / ~150 including a block quotation. Against
that, Leg 5 step 1 is 2 sentences / 40 words and does its job completely.

**The right length for a curious learner is about 3 sentences / 60–70 words**, structured as:
what this does · why the plant needs it · one consequence of getting it wrong. Almost every
paragraph that overruns does so because a *measurement* has been pasted in ("measured, 1714 to
2188 psia in 21 plant-minutes"). Those belong in the orange runtime note, which already exists
and is more legible.

### The five that taught me the most

1. **Leg 2 step 10** (criticality) — *"You cannot see the moment criticality happens; you can
   only see that it has. Stop the rods and watch: if the count rate keeps rising and the startup
   rate stays positive with nothing moving, the core is critical."* It gave me an *operational
   definition* of a word I only knew from disaster films, and it is the one place where the
   reason and the procedure are the same sentence.
2. **Leg 3 step 3** (boron sample) — *"There is no live boron meter in this control room — a real
   one has none either."* It explained a piece of the game by explaining a piece of reality, and
   it turned a confusing absence into a fact I now know about power stations.
3. **Leg 4 step 2** (reactor follows turbine) — *"less steam drawn means the core's heat has
   nowhere to go, Tavg rises, and moderator feedback walks power down after it."* This is the
   central idea of the whole simulator and it is stated in one causal chain I could follow end
   to end.
4. **Leg 6 step 1** (borate before you cool) — *"cold water moderates better, and the same core
   at 122 °F needs about 920 ppm for the same margin."* A counter-intuitive fact, explained in
   one clause, with the number that makes it real.
5. **Leg 1 step 2** (pumps as heater) — *"the running pumps put about half a percent of rated
   power into the water as friction. That is enough to warm the whole plant."* Surprising,
   concrete, and it justified the step I had just been told to take.

Common feature: each is one causal chain, in ordinary words, with at most one number.

### The five that taught me nothing or lost me

1. **Leg 1 step 9** (staged pressurization). *"Two stages, because the first must stop below
   P-11 — the 1972 psi (13.6 MPa) permissive that re-arms the safety injection (SI) signals the
   cold lineup had blocked."* Five undefined terms in the opening sentence of the paragraph that
   is supposed to be the explanation. I finished it knowing only that there are two stages.
2. **Leg 1 step 7** (letdown orifices). RHR + HCV-128 + CVCS + RCS + a block quotation from a
   document I do not have + four pressures. It broke at *"the HCV-128 cross-connect"* and never
   recovered. It also never says what letdown is *for*, which is the one thing I needed.
3. **Leg 2 step 16** (P-10 and the trip blocks). *"The startup net has two rungs taken in
   order… below P-10 the request auto-revokes, so a shutdown re-arms the whole net on its own."*
   A metaphor ("net", "rungs") layered over an abbreviation over a code. I could not extract a
   single fact.
4. **Leg 1 step 8** (pressure control in service). The middle sentence is a 47-word A/B
   experiment. I understood the first nine words — the setpoint does nothing without the heaters
   — and then I was reading a lab report. Also introduces "the ladder" as a name for something
   never introduced.
5. **Leg 3 step 9** (confirm full power). It spends its length on what I have *not* got
   (*"You are NOT yet at the Hot Full Power preset: that plant has equilibrium xenon, 626 ppm of
   boron and the bank near the top"*), comparing my plant to a menu preset I may never have
   loaded. It taught me about the game's menu, not about the reactor.

**One structural note:** the "Why?" is collapsed by default and rendered in the dimmest grey on
the panel. Every definition in the set lives in there. The result is that the checklist's entire
teaching layer is hidden behind a click and then hard to read.

---

## 6. Rules for the authors' writing guide

1. **Name every control exactly as the board prints it, and say which card it is on.**
   Before: *"SHUTDOWN card, speed FAST, click WITHDRAW once."*
   After: *"On the ROD CONTROL card, under the SHUTDOWN column: press FAST, then click WITHDRAW."*

2. **Never use a term for an instrument that is not printed on that instrument.**
   Before: *"Ride the heatup to Hot Standby: Tavg at or above 541.4 °F."*
   After: *"Wait until AVG COOLANT TEMPERATURE reaches 541 °F."* (Or rename the tile Tavg — but
   pick one and use it everywhere.)

3. **One pressure unit. Choose psi and never write psig or psia in player text.**
   Before: *"from 363 psi to 1700 psig"* / target *"1716 psi (11.83 MPa), the floor"*.
   After: *"from 363 psi to 1700 psi — the lowest the dial goes."*

4. **Verb first. The action is the first three words of every step.**
   Before: *"Above P-10 (8 % power), press IR HIGH FLUX on TRIP BLOCKS."*
   After: *"Press IR HIGH FLUX on TRIP BLOCKS. Do this only once REACTOR POWER is above 8 %."*

5. **Define a term the first time it is *visible*, in the step or its note — never only in the
   collapsed "Why?".**
   Before: *"Below the point of adding heat there is no temperature feedback to stop you."*
   After: *"Below about 1 % power — the point where the reactor starts warming the water —
   nothing slows the climb for you."*

6. **No abbreviation that is not printed on the board, and expand it once per leg.**
   Before: *"Watch SUR and the intermediate range."*
   After: *"Watch STARTUP RATE and the INTER RANGE meter."*

7. **No document citations, tag numbers or block quotations in player text.**
   Before: *"WTSM chapter 19: 'Prior to reaching 350 °F (176.7 °C) in the RCS … Terminate
   residual heat removal letdown to the CVCS'."*
   After: *"Real plants close this path before the coolant reaches 350 °F."* (Move the citation
   to a "Sources" link.)

8. **One idea per sentence; put measurements in their own sentence, or in the runtime note.**
   Before: *"The next step's setpoint does nothing at all until the heaters are in AUTO:
   measured from this point, dialling 1700 psig (11.72 MPa) with the heaters off moves the plant
   0.05 psi in 10 plant-minutes, against +133 psi (0.92 MPa) with the ladder in service."*
   After: *"The setpoint does nothing until the heaters are in AUTO. Measured: with the heaters
   off, the plant gains 0.05 psi in ten minutes; with them on, 133 psi."*

9. **Give every step a visible kind — DO, WATCH or CHECK.**
   Before: *"Confirm the letdown transfer: RHR suction autoclosed, letdown now on the orifices."*
   After: *"CHECK — nothing to press. The RHR suction valve shut itself at 585 psi; letdown is
   now on the orifices."*

10. **Give every step a "Done when" line naming a tile and a plain value — no arithmetic.**
    Before: *"When Tavg within 14.4 °F (8 °C) of 547 °F (286 °C)."*
    After: *"Done when AVG COOLANT TEMPERATURE reads between 533 and 561 °F."*

11. **Drop the SI conversions from the panel; the board has no SI.**
    Before: *"Raise the Pressure SP to 2235 psi (15.41 MPa)."*
    After: *"Raise SET PZR PRESSURE to 2235 psi."*

12. **Round to the gauge. No decimal the instrument cannot show.**
    Before: *"Tavg at or above 541.4 °F (283 °C)"*, *"1615 psi (11.136 MPa)"*.
    After: *"541 °F"*, *"1615 psi"*.

13. **Explain the control mechanic where it is first *needed*, not where it first appears.**
    Before: Leg 2 step 5, *"Withdraw the control bank about 90 steps at MED."* (mechanic
    explained one checklist earlier).
    After: *"Press MED, click WITHDRAW, and click again when CONTROL ROD POSITION reaches about
    90. MED moves about N steps a minute."*

14. **Cut the epigram; keep the causal chain. If a sentence would work as a caption, delete it.**
    Before: *"Full power is a landing, not a lunge."*
    After: *"Make the last pull small: 100 MW of load lands power near 101 %, and the rods stop
    moving above 103 %."*

15. **A multi-stage wait must state the trigger for each stage.**
    Before: *"Walk the DUMP SETPOINT down in steps: 1020, 640, 400, 240, 120 psi over about two
    and a half plant-hours."*
    After: *"Lower DUMP SETPOINT to 640. Wait until AVG COOLANT TEMPERATURE stops falling, then
    lower it to 400. Repeat for 240 and 120."*

16. **Say the same thing the same way in every leg — a player can start at any of the six.**
    Before: Leg 1 step 8 *"PZR HEATERS"* vs Leg 6 step 6 *"the HEATER card"*; Leg 3 step 4
    defines "on program" and Leg 4 step 2 assumes it.
    After: one canonical phrasing per control and per concept, repeated verbatim, with the
    one-line definition repeated the first time each leg uses it.
