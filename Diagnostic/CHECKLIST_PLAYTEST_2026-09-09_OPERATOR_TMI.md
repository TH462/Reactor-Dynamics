> **Record, not policy.** The **operator** pass over the TMI-2 incident walkthrough
> (`pwr_tmi2_incident`), 2026-09-09 — played fresh-context with no repo access in headless Edge
> against `develop` at `e6e2216e`, build `Alpha 1.7.4-rc6`. **16 of 16 steps completed.** Eight
> stuck points: the TRIP BLOCKS overlay swallowing the step-14 click (S-1); step 14's 600× promise
> refused for the whole step (S-2); the Ack All remedy that cannot apply (S-3); step 5's note
> describing a plant already gone (S-4); a tile reading the done-when value with the check still
> open (S-5); a ⏩ estimate 60× too large (S-6); step 15's drop warning inverted (S-7); and words
> on no board label (S-8). **Every claim was re-measured on this tree before anything was filed or
> fixed** (the `layman-playthrough` skill §9), and a `Measured:` / `Verdict:` pair is added under
> each `S-n` below. Verdicts: **six confirmed, two narrowed, none refuted** — an unusually clean
> pass, and the reason is that this reviewer reported geometry and strings rather than diagnosing
> the plant.
>
> **What the verification changed, with the numbers.**
>
> **S-1's cause was wrong in the useful direction.** The panel does not sit over the valve, it
> **grows onto it**: 393.9 → 519.0 rendered px on ONE caption — the 90-character
> *"RELEASING THIS WILL TRIP THE REACTOR NOW — the setpoint is crossed. Press again to confirm."*
> a blocked row prints once its setpoint is crossed — and the `RELEASE?` button then **overlaps the
> valve's own hit circle** (x 488–555 against 466.7–506.9), rather than sitting 17 px away.
> Unarmed, in free play, the valve has **26.7 px of clearance** and clicks fine, which is why
> nothing had seen it.
>
> **S-2 and S-7 are one defect with two faces, and between them they refute a Phase 3
> measurement.** Both `wait_hint`s were written from the **replay's** route. Driven full-stack from
> one initial condition on both routes, the replay reaches step 14 at **t = 8,279 s with the
> pressurizer at 25.0 %** and the player at **t = 4,281 s at 44.8 %** — 66 plant-minutes and 20
> points of inventory apart — and closing the block valve then recovers the same 350 psi in
> **188 s on the player's route against 3,720 s on the replay's**, peak |dP/dt| **0.236 against
> 0.015 MPa/s (34 against 2 psi/s), 16×**. Phase 3's *"step 14 held WARP 3720 of 3720
> sim-seconds, zero drops, achieved 2217×"* is a true measurement of the wrong route. Step 15 is
> the mirror: **81 of 3,669 samples over the 0.28 MPa/s lockout on the replay's route (peak
> 0.580 MPa/s / 84 psi/s) against 2 of 4,203 on the player's** — so the step that warns of a drop
> is the quiet one for a player, and the step that promises quiet is the violent one.
>
> **S-4 sits on a Phase 3 fix the same way.** The note's "about 43 %" is the replay's step-5 entry
> (measured **40.5 % at t = 95.5 s**); the player enters at **t = 69 s at 56.1 % and falling**, and
> a player who reads the step before looking at the tile is at **t ≈ 150 s, where the board is back
> through 55 % and RISING with ~41 GPM at 1,088 psi** — which is this reviewer's reading exactly.
>
> **S-5's cause was half-right**: the tile does round, and the other half is that `OPSYM` printed a
> strict `<` as `≤`, so the criterion line claimed satisfied on the boundary while the instructor
> correctly held. **S-6 is narrowed rather than confirmed**: the ⏩ figure is the replay's `hold`,
> and step 12's replay satisfies its acceptance **1 s in and dwells the remaining 1,799 s for the
> narrative clock** — so no route ever spent 30 plant-minutes on it.

# TMI-2 incident walkthrough — operator play-test

**Build under test:** the screen reads `Alpha 1.7.4-rc6` (`SPAN.logo-ver`) with a `TEST BUILD`
badge beside it, and the tab title is `[TEST] Reactor⚛️Dynamics — Control Room`. That matches
the tag I was given.

**Page:** `file:///C:/grok_build/Reactor_Dynamics/ui/shell.html?engine=pwr2`
**Leg:** `pwr_tmi2_incident`, listed as *"Three Mile Island Unit 2, 28 March 1979 — the first
four hours, as the crew lived them · starts at Hot Full Power (Mode 1)"*, seventh and last in
the Walkthroughs list.
**Persona:** licensed operator, first time on this board. Repo not read.

---

## 1. Outcome

| Leg | Result | Steps completed | The one thing that mattered |
|---|---|---|---|
| `pwr_tmi2_incident` — TMI-2, 28 March 1979 | **COMPLETE** — "Walkthrough complete" screen reached | **16 of 16** | The TRIP BLOCKS panel you are told to open in **step 6** is still covering the PORV in **step 14**, where you are told to click it — and nothing between the two steps tells you to close it. It is the only place I was genuinely stuck. |

Final plant at completion: PRIMARY PRESSURE 1359 psi (9.37 MPa), PRESSURIZER LEVEL 83 %,
SUBCOOLING MARGIN 35 °F (19.4 °C), AVG COOLANT TEMPERATURE 548 °F (287 °C), STEAM GENERATOR
LEVEL 37 %, session clock T+04:25:18. Screenshot `shots/059_complete.png`.

Completion text: *"Injection restored, forced circulation back and the relief line isolated. At
its worst 94 % of the core was uncovered — and the fuel still never got hotter than it runs at
full power, 1130 °F against 1298 °F on line before the trip. The real one went far past 2500 °F,
and this plant stops short of it by design."*

I never had to do anything the text did not say **except one thing**: close the TRIP BLOCKS
panel before step 14 (S-1 below). Everything else in the leg I found from the panel text, the
board labels, or the System Scanner line under the board.

---

## 2. Stuck points, ranked

### S-1 — Step 14. The TRIP BLOCKS panel hides the control the step tells you to click

**Step text, quoted:**
> "14. Close the PORV block valve: one click on the small valve symbol just left of the PORV."
> "Use **PORV Block Valve**: PRIMARY PRESSURE rising above 750 psi and the tailpipe temperature falling"

**What I did.** Step 6 had told me: *"The TRIP BLOCKS panel stays open over the board until you
press TRIP BLOCKS again."* I did not press it again, because nothing asked me to and the panel
did not appear to be in the way. Eight steps later the panel is still open and it sits directly
over the top of the pressurizer and the whole PORV group. Screenshot `shots/046_full_step14.png`
— the `PORV CLOSED` light, the PORV symbol and its block valve are all behind the panel.

Worse, the System Scanner reads *through* the overlay. Hovering (485,190) printed:

> `SCANNER  Power-Operated Relief Valve (PORV) Block Valve — Motor-operated isolation valve upstream of the PORV. Normally open.`

…so the board told me the thing I wanted was under my cursor. I clicked. Nothing happened —
the click is swallowed by the panel (`shots/047_click_through_panel.png`; step marks unchanged,
`○ PRIMARY PRESSURE above 750 psi`, `○ PORV tailpipe temperature below 400 °F`). Hover says yes,
click says nothing. Two honest attempts, then I recorded myself stuck.

There is a second hazard in the same place. By step 14 the SI REACTOR TRIP row of that panel has
changed to:

> "RELEASING THIS WILL TRIP THE REACTOR NOW — the setpoint is crossed. Press again to confirm."
> `RELEASE?`

That `RELEASE?` button sits at (488,220) — about 17 pixels below the spot the scanner says is the
PORV block valve. A player hunting for the valve by clicking around is one slip from being
invited to trip the reactor.

**What unstuck me.** I remembered step 6's sentence and pressed TRIP BLOCKS on the ROD CONTROL
card again; the panel closed and the PORV block valve was immediately visible and glowing
(`shots/049_porv_visible.png`). The click then worked first time.

**What would have unstuck me:** one clause in step 14 — "if the TRIP BLOCKS panel is still open,
press TRIP BLOCKS again to close it" — or the walkthrough closing the panel itself when it moves
off step 6.


**Measured:** headless at 1600 × 1000, `document.elementFromPoint` over the PORV block valve's own
hit circle (`circle.vlv-hit`, rendered **x 466.7–506.9, y 183.2–223.3**) with the TRIP BLOCKS
popover open. **Unarmed, the panel is 393.9 px wide, right edge 440.0 — 26.7 px clear — and the hit
test returns `circle.vlv-hit`.** The popover is shrink-to-fit, and when a blocked row arms for
release its caption becomes the 90-character *"RELEASING THIS WILL TRIP THE REACTOR NOW — the
setpoint is crossed. Press again to confirm."* (`ui/diagram/board/pwr_board_wiring.js`
`tripBlockRows`); the panel then measures **519.0 px, right edge 565.0**, and the hit test returns
**`DIV.bd-pop-row [IN PANEL]` — the click is swallowed**, while the System Scanner still names the
valve through the overlay. The `RELEASE?` button lands at **x 488–555, y 220–237** and **overlaps
the valve's hit circle** (x 488–506.9, y 220–223.3) — not 17 px from it.

**Verdict:** confirmed, cause sharpened from "the panel is in the way" to "the panel grows 125 px
onto the board on ONE caption, and only when a blocked trip is armed for release" — which is why
free play looks clean and no earlier pass met it. **Fixed**: `.bd-pop` capped at `max-width: 460px`;
the armed panel measures **519.0 → 405.5 px**, right edge 451.5, **15.2 px clear**, and
`elementFromPoint` returns `circle.vlv-hit` in both states, the unarmed panel unchanged at 393.9.
Gated by `testTripBlockPopoverStaysOffTheBoard` in `verify_e2e_ui`, **injection-verified**: with the
cap removed it reports 475.6 px and `DIV.bd-pop-row`, and reds.

---

### S-2 — Step 14. The step promises 600× and the plant refuses it for the whole step

**Step text, quoted:**
> "⏩ About 62 plant-minutes at 1× — set the speed control to 600× (WARP; the plant must be quiet
> to take it — if it is refused, press Ack All on the ALARMS panel and try again, or use 60×).
> Watch the tailpipe temperature come down. **This hour is the quietest of the run and the plant
> holds 600× right through it.**"

**What I did.** Pressed 600×. It was refused instantly and stayed refused for every one of the
six samples I took across the step. `#warpInfo` throughout:

> "WARP dropped to 60× — pressure moving 44 psi/s"
> "WARP dropped to 60× — pressure moving 56 psi/s"
> "WARP dropped to 60× — pressure moving 55 psi/s"
> "WARP dropped to 60× — pressure moving 53 psi/s"

The whole step ran at 60×. The reason `#warpInfo` gives is honest — closing the block valve is
exactly what makes pressure move fast (569 → 765 psi over the step), so this is the *least* quiet
hour of the run, not the quietest. The step's own action defeats the step's own advice.

**What would have unstuck me:** nothing — I was not blocked, only misinformed, and it cost about
four wall-minutes of watching a button that would not take. Delete the "holds 600× right through
it" sentence, or say what step 15 says instead.


**Measured:** the leg driven full-stack twice from one initial condition — once on the **replay's**
fixed `hold` dwells (what `run_checklist_pwr2` does, and what #670 Phase 3 measured) and once on the
**player's** route, advancing the instant each acceptance is met. They are not the same plant at
step 14. The replay enters step 14 at **t = 8,279 s, PRESSURIZER LEVEL 25.0 %, 647 psi**; the player
at **t = 4,281 s, 44.8 %, 636 psi** — 66 plant-minutes earlier, with 20 points more inventory and
that much more decay heat. Closing the block valve then recovers **643 → 993 psi in 188 s** on the
player's plant and **649 → 1,023 psi in 3,720 s** on the replay's: the same 350 psi, **20× faster**.
Peak |dP/dt| over one-second spans is **0.236 MPa/s (34 psi/s) player against 0.015 MPa/s (2 psi/s)
replay — 16×** — and the player's peak is **84 % of `RAPID_P_MPA_PER_S = 0.28` (40.6 psi/s)**, the
lockout whose crossing this reviewer's own `#warpInfo` reported at 44–56 psi/s on the shorter span
the in-loop watch samples.

**Verdict:** confirmed — and it **refutes the basis of a Phase 3 decision**. Phase 3's *"step 14
held WARP 3720 of 3720 sim-seconds (100 %), zero drops, achieved 2217×"* is a correct measurement
of the replay's route, on which the block valve's recovery is 2 psi/s and there is nothing for the
lockout to catch; it says nothing about the route a player takes. The promise is gone: the hint now
says that shutting this valve is what makes pressure move fastest all run, that WARP will refuse it
or drop out of it, and to use 60×.

---

### S-3 — Steps 10 and 14. The suggested remedy for a refused WARP does not work

**Step text, quoted (both steps carry it):**
> "if it is refused, press Ack All on the ALARMS panel and try again, or use 60×"

**What I did.** On step 10, after WARP dropped, I pressed 600× four times over 8 s (samples at
+300 ms, +800 ms, +2 s, +5 s) — refused every time, `#warpInfo` unchanged at *"WARP dropped to
60× — pressure moving 91 psi/s"*. I then pressed **Ack All**, waited, and pressed 600× twice
more. Still refused; `#warpInfo` went to *"WARP dropped to 60× — pressure moving 93 psi/s"*.

The lockout here is a **pressure rate**, not an alarm. Ack All is the wrong remedy and the
message says so — it names psi/s, never an alarm. The text sends you to the wrong control.

**What would have unstuck me:** "if `#warpInfo` says pressure is moving, WARP will not take until
it settles — use 60×."


**Measured:** the remedy is generated for every WARP-rung step in `ui/app.js`. `_warpBlocked()`
(`layers/simulation_service.js:660`) refuses WARP on exactly three live conditions — `_lastRapid`
(a power or pressure **rate**), `beyond_model` / `model_held`, and the loop's Courant limit — and
**carries no alarm term at all**, so acknowledging alarms cannot lift a refusal. An alarm reaches
WARP only through `_warpDropReason`'s `_newAlarmOfPriority`, and only as a **drop**, on a board that
was quiet beforehand. The reviewer's six presses plus Ack All left `#warpInfo` on the rate branch
throughout ("pressure moving 91 → 93 psi/s").

**Verdict:** confirmed — the line named the one remedy that could not apply to the case it was
printed beside. Rewritten to name both branches: a new alarm clears with Ack All; pressure or power
moving is a rate that only settles with time, so use 60×.

---

### S-4 — Step 5. The step's own note describes a plant that has already gone

**Step text, quoted:**
> "Two things on the board will look wrong here and are not. PRESSURIZER LEVEL is still falling —
> about 43 % now, bottoming near 40 %, and it does not start its climb to the top of the scale for
> another minute. And ECCS FLOW reads 0 GPM with the pump running… flow does not start until
> PRIMARY PRESSURE falls below about 1390 psi."

**What I did.** Read the board. PRESSURIZER LEVEL **55 %** and rising; ECCS FLOW **41 GPM**;
PRIMARY PRESSURE **1088 psi**. Every one of the three numbers the note tells me not to be alarmed
by was already the other way round. As an operator being taught to read a board, being told
"level is falling, it will look wrong, don't worry" while the board plainly shows it climbing is
worse than being told nothing.

The cause is structural: the note is written for the instant the step *fires*, and the plant keeps
running while you read. The step's own header showed `Step 5 of 16 · 04:02:39` while the session
clock was well past it. Steps 8 and 12 have the same shape.

**What would have unstuck me:** write the note about the direction of travel rather than the
instantaneous value, or hold the clock while the step's note is unread.


**Measured:** the note is anchored to the **replay's** step-5 instant, on the same two-route A/B as
S-2. The replay enters step 5 at **t = 95.5 s with PRESSURIZER LEVEL 40.5 % and ECCS flow 0** —
#670 Phase 3 measured 43.1 % falling at that entry and wrote the note from it. The player enters at
**t = 69 s at 56.1 % and falling**, flow still 0. The level bottoms at **40.7 % at t = 110 s**, flow
first moves at **t ≈ 108 s / 1,266 psi**, and by **t ≈ 150 s the board reads ≈ 55 % and RISING with
~41 GPM at 1,088 psi** — this reviewer's reading exactly, i.e. a player who reads the step before
looking at the tile arrives about 80 plant-seconds after it fired.

**Verdict:** confirmed, narrowed. The note is not wrong about the physics — level *is* falling and
flow *is* 0 for the first ~40 s of the step — but it names an **instantaneous value** on a step whose
arrival instant varies by 80 plant-seconds between a fast player and a reading one, and the sign of
the very thing it says not to worry about flips inside that window. Rewritten to the direction of
travel: level is FALLING, not climbing, and what it reads when you look depends on how long you have
been reading.

---

### S-5 — Step 12. The tile reads the done-when value while the check stays open

**Step text, quoted:**
> "12. Verify PRESSURIZER LEVEL is falling: below 50 % and still going down."
> "○ When PRESSURIZER LEVEL ≤ 50 %"

**What I did.** Arrived at the step with PRESSURIZER LEVEL reading exactly **50** on the tile and
the criterion still `○`. By the letter of the done-when the step was satisfied and Continue was
dark. The tile rounds to whole percent; the check does not. It cleared one sample later at 49.

Only ~30 s of confusion, but it is the kind that makes a player think the check is broken.

**What would have unstuck me:** a criterion below the rounding boundary (≤ 48 %), or a tile
decimal.


**Measured:** step 12's acceptance in the built pool (`RD.MANUAL_PROCEDURES.pwr2`) is
`{p:'pzr_level_pct', op:'<', v:50}` — a **strict** comparison, graded strictly by the instructor.
`OPSYM` in `ui/app.js` mapped `'<'` to `≤` and `'>'` to `≥`, so the printed criterion read
"PRESSURIZER LEVEL ≤ 50 %" while the check required strictly below. On the boundary — which is
exactly where the tile's whole-percent rounding puts the player — the line claims satisfied and the
check correctly is not.

**Verdict:** confirmed, with the cause enlarged. The tile's rounding is half of it; **the printed
operator was the other half**, and that half is repo-wide rather than one step's. `OPSYM` now prints
strict `<` and `>`; because those are markup characters, every previously-unescaped insertion of the
criteria line is now escaped, or the `<` would have swallowed the rest of the line as a tag.
Verified rendered on the running page: `✓ When REACTOR POWER > 90 %`.

---

### S-6 — Step 12's time estimate is wrong by two orders of magnitude, in the player's favour

**Step text, quoted:**
> "⏩ About 30 plant-minutes at 1× — set the speed control to 60×."

**What I did.** Set 60×. The step checked off in about **30 plant-seconds**. Same on step 13
("About 7 plant-minutes") — satisfied on arrival.

The estimates are measured from the step's nominal firing time on the narrative clock, but by
step 12 I was ~1.5 plant-hours past that, because the walkthrough advances on criteria while the
plant runs continuously. Any player who is not instantaneous will find these numbers too large.
It is not blocking, but it makes the ⏩ line untrustworthy, and step 14's 62-minute estimate was
the one that was right.


**Measured:** the ⏩ figure is the step's `hold`, which is the **replay's dwell** and never a time to
the criterion — `ui/app.js` says so in its own comment, and the player has never been told. Step 12
holds 1,800 s and **the replay satisfies its acceptance 1 s in, then dwells the remaining 1,799 s
for the narrative clock**; a player advancing on criteria reached it in **756 s**. Step 13 holds
420 s and is satisfied **1 s in on both routes**.

**Verdict:** narrowed. Not "the estimate is wrong by two orders of magnitude" — the estimate is a
**dwell**, and on the replay's own route step 12 is done in 1 s, so no route ever spent 30
plant-minutes on it. Step 13's generated wait line is now suppressed (`wait_hint: false`, the
mechanism #653 S9 added), and step 12 carries a hint telling the player to read the tile before
waiting.

---

### S-7 — Step 15's warning is the opposite of what happens

**Step text, quoted:**
> "Refilling a hot plant swings pressure hard, so 600× will drop back to 60× partway through —
> press it again when it does."
> "The margin takes about 22 plant-minutes to climb back through zero."

**What I did.** Pressed 600× once. It held for the **entire** step — `"WARP 600× · achieving
460× · 0.5 s physics step"`, then 480× for the rest, **zero represses** needed, across T+02:06 →
T+04:05. And SUBCOOLING MARGIN left its −50 °F floor in ~11 plant-minutes as promised but took
about **two plant-hours** to reach the +10 °F the criterion wanted, not 22 plant-minutes.

So step 14 promises stability and gives none; step 15 promises instability and gives none. As a
pair they train you to ignore the ⏩ line.


**Measured:** the same two-route A/B as S-2, through step 15. |dP/dt| over one-second spans crosses
the 0.28 MPa/s lockout **81 times in 3,669 samples (2.2 %) on the REPLAY's route, peak 0.580 MPa/s
(84 psi/s)** — and **2 times in 4,203 samples (0.0 %) on the PLAYER's, peak 0.290 MPa/s (42 psi/s)**.
Time to the step's own criterion (SUBCOOLING MARGIN ≥ +10 °F) was **1,773 s (29.6 plant-minutes) on
the replay and 4,185 s (69.8 plant-minutes) on the player's route**, against a hint promising 22
plant-minutes to a *different* quantity (crossing zero).

**Verdict:** confirmed — and it is **S-2 inverted**. Steps 14 and 15 are one defect with two faces:
both `wait_hint`s were written from the replay's route, on which step 14 is quiet and step 15 swings,
while on the player's route it is the other way round. The hint no longer promises a drop, and gives
the measured 30-to-70-plant-minute span to the criterion it actually grades.

---

### S-8 — Words the step uses that the board does not print

Low severity individually; together they are the reason I leaned on the System Scanner rather
than on labels. Full table in §5. The two that actually slowed me down:

- **"TURBINE TRIP lit"** (step 2). There is no annunciator anywhere on the board reading
  `TURBINE TRIP`. What exists is the `TRIP` **pushbutton** in the TURBINE-GENERATOR box going
  highlighted — a *control* reading back as an *indication* — and an alarm tile
  `Turbine Trip / Low Steam Demand`. I checked every text node on the board to be sure.
- **"Use RCP Run/Stop"** (steps 11 and 16). The buttons are labelled `ON` and `OFF`. The scanner
  calls them "ON (RCP)" and "OFF (RCP)". Nothing says "Run/Stop".


**Measured** on the running page: the string "TURBINE TRIP" occurs **0 times** in the board's text,
case-insensitively; "Run/Stop" occurs **0 times**, in any plant state. `'RCP Run/Stop'` is a key in
the board's **highlight vocabulary** (`ui/diagram/board/pwr_board_wiring.js`), pointing at the card
whose inspect name is "RCP Control" and whose buttons are engraved `ON` and `OFF` — and `st.control`
is **printed to the player** as "Use *&lt;control&gt;*" (`ui/app.js`), which is how an internal
vocabulary key became an instruction in six steps across four legs.

**Verdict:** confirmed. Step 2 now names the `TRIP` button on the TURBINE-GENERATOR card; the
printed control name is `RCP ON/OFF` in all six steps that used it, with the old key kept as a
highlight alias so nothing stops glowing. `run_manual_controls` caught the `STEP_UI` half of the
rename on its first run (6 reds) and is back to **590/590**.

---

## 3. The runtime controls

### ⏪ Rewind step — used four times; did what its label says every time

| # | Where | Before | After | Plant, or just the panel? |
|---|---|---|---|---|
| **(a)** early, right after Continue | Step 2 → **Step 1** | power 64.9 %, Tavg 598 °F, PZR 81 %, turbine 1646 rpm / 0 MW, clock T+00:00:56 | power 99.8 %, Tavg 580 °F, PZR 62 %, turbine **1800 rpm / 100 MW**, clock T+00:00:02 | **The plant.** The turbine was un-tripped and re-loaded. Not cosmetic. |
| **(b)** while genuinely stuck | Step 14 → **Step 13** | clock T+01:38:25, press 577 psi, PZR 40 % | clock T+01:37:30, press 579 psi, PZR 41 % | **The plant**, correctly — **but the TRIP BLOCKS overlay that was the actual cause of the stick stayed open.** Rewind kept its promise and still did not help. |
| **(c)** mid long wait at high speed (60×) | Step 12 → **Step 11** | clock T+01:27:35, PZR 50 %, criterion `✓ the pump cavitation alarm clears` | clock T+01:24:00, PZR 54 %, criterion back to `○` — **my RCP OFF press was undone** | **The plant.** Speed stayed on 60× across the rewind; `#warpInfo` reverted from "Dropped to real time — checklist step complete" to "WARP ready — …". |
| **(d)** bonus, to get a dark Continue | Step 16 → **Step 15** | clock T+06:32:40, SUBCOOLING +36 °F | clock T+01:55:26, SUBCOOLING **−50 °F** | **The plant**, across 4.6 plant-hours. The cleanest demonstration of the four. |

**Verdict:** Rewind is the most trustworthy control in the run. It restores the plant, not just
the panel, and it does so even across four-plant-hour jumps. Its one gap is board *overlay* state
(the TRIP BLOCKS panel), which it does not touch — and that is exactly the state that had me
stuck when I reached for it.

### Continue ▶

- **It lit on its own on every step it could.** Lit already on arrival: **1, 3, 4, 5, 8, 9, 13**.
  Lit after I did the work or waited: **2, 6, 7, 10, 11, 12, 14, 15, 16**. It never once failed to
  light when the board said the criterion was met — the only near-miss was S-5, where the tile's
  rounding made me *think* it should have lit.
- **Pressing it when not lit does nothing, and it is honestly disabled.** On step 15 with the
  criterion `○ When SUBCOOLING MARGIN ≥ 10 °F` unmet, the button's state was
  `class="btn ckl-ack wt-continue"` (no `ready`) and `disabled=true`. I forced three clicks:
  step unchanged, marks unchanged, `disabled` still true. No misleading feedback, no silent
  advance. This is correct behaviour.
- The panel prints **"Step done — press Continue."** under the criteria whenever it lights,
  which is a clear and welcome cue.

### The speed bar and WARP

Every `#warpInfo` string I saw, verbatim:

| When | `#warpInfo` |
|---|---|
| idle / eligible | `WARP ready — 600× or 3600× for a long quiet ride; a warning or critical alarm drops it to 60×` |
| 600× accepted (step 10) | `WARP 600× · achieving 450× · 0.5 s physics step` |
| 600× accepted (step 15) | `WARP 600× · achieving 460× · 0.5 s physics step`, then `… achieving 480× …` |
| 600× dropped / refused | `WARP dropped to 60× — pressure moving 42 psi/s` (also 44, 53, 55, 56, 75, 91, 93 psi/s at other moments) |
| a step checked off | `Dropped to real time — checklist step complete` |

**What it did well.** The achieved rate is shown, not just the requested one, and the drop message
names its cause in a unit I can act on. The auto-drop to real time when a step completes is
sensible and is announced. When the plant genuinely was quiet (step 15) it held 600× for two
plant-hours without a single repress.

**What it did badly.** The drop message and the *refusal* message are the same string. When I
press 600× and nothing happens, `#warpInfo` still reads "WARP **dropped** to 60×" — past tense,
describing an event minutes old. There is no acknowledgement that my press was received and
declined. That is what made S-2 and S-3 feel like a broken button rather than a locked-out one.

**Measured — and NOT SETTLED, deliberately (coordinator, 2026-09-09).** The two paths do carry
different strings: `SPEED_SNAP_MSG` in `ui/app.js` maps `warp_locked` to *"WARP unavailable — "*
and `transient` to *"WARP dropped to 60× — "*, and the speed-button handler clears the previous
note **before** dispatching (`ui/app.js`, `warpNote = null`), so a genuine refusal is acknowledged
and is not masked by a stale line. The reviewer saw the **drop** string, which would mean the press
was *accepted* and the in-loop watch threw WARP out again — but **the headless harness does not
reproduce it**: driven to the player's step-14 state and pressed 40 times across the step,
`_warpBlocked()` returned null every time, the press landed at 600× every time, and there were
**0 refusals and 0 drops**, the whole 636 → 973 psi recovery falling inside a single WARP tick.
So this claim has **no `Measured:` line that settles it and is filed as an observation only** — no
change made. Whatever is happening lives in the browser's broadcast pacing, which this harness
does not have. **Do not act on a diagnosis of it until it reproduces.**

Measured throughput, for the record: at 600× the clock ran T+00:07 → T+01:05:39 in about 10 wall
seconds on step 10, and T+02:06 → T+04:05 in about 20 wall seconds on step 15. At 60× a step's
wait is roughly 20 plant-seconds per wall second.

### Tab switching mid-step — twice, both clean

| # | Step | Left to | Away | Result on return |
|---|---|---|---|---|
| 1 | Step 4 (active, criterion met) | **Indications** | ~4 s | Step header `Step 4 of 16 · 04:01:07` identical, mark `✓ When PORV tailpipe temperature ≥ 240 °F (116 °C)` identical, Continue still `ready`. `#cklRun` stayed in the DOM, just hidden. |
| 2 | Step 12 (active, running at 60×) | **Inject Failure** | ~6 s | Step header identical, mark identical, Continue still `ready`, speed still 60×, and the clock had advanced normally (T+01:30:22 → T+01:32:05) — the plant kept running while I was away, as it should. |

**Verdict:** tab switching does what you would expect and loses nothing. No complaints.

---

## 4. Per-step log

Session clock quoted from `#clock`. "Lit on arrival" means Continue was already `ready` when the
step appeared.

**Step 1 of 16 · 04:00** — *"1. Verify the plant is at full power: REACTOR POWER near 100 % with the TURBINE-GENERATOR carrying load."* Done-when `✓ When REACTOR POWER ≥ 90 %`.
Board: REACTOR POWER 99.7 %, AVG COOLANT TEMPERATURE 580 °F, PRIMARY PRESSURE 2236 psi (15.42 MPa), PRESSURIZER LEVEL 62 %, SUBCOOLING MARGIN 43 °F, TURBINE 1800 rpm / 100 MW / 100 %.
**Lit on arrival**, 0 s. Nothing to do. `shots/003_started.png`, `shots/004_step1_board.png`.
The preamble is good: *"The failures in this walkthrough arrive on their own, on the step that needs them"* and the note that the turbine-trip-to-reactor-trip channel is defeated *only inside this walkthrough*. That told me not to hunt for a Failures tab, which I would otherwise have done.

**Step 2 of 16 · 04:00:37** — *"2. Verify the turbine has tripped and the steam generators are drying out: TURBINE TRIP lit, STEAM GENERATOR LEVEL falling below 55 %."*
Two criteria. `✓ TURBINE TRIP lit` was met on arrival; `○ STEAM GENERATOR LEVEL below 55 %` took ~35 s wall at 1× (SG 65 → 52 %). Continue lit on its own the instant SG crossed.
Confusion: **I could not find the words "TURBINE TRIP"** anywhere on the board. I searched every text node. The TURBINE-GENERATOR box carries `LATCH` / `TRIP` / `UNLOAD` pushbuttons and the `TRIP` one highlights; the ALARMS panel carries `Turbine Trip / Low Steam Demand`. I took the highlighted pushbutton as the "lit" indication. `shots/007_step2_wait.png`, `shots/008_turbine_area.png`.
Along the way the board did exactly what the step's note said it would: I sampled 2333 psi at the peak against the note's "peaks near 2340 psi about 6 seconds in".

**Step 3 of 16 · 04:00:45** — *"3. Verify the reactor has tripped: REACTOR POWER collapsing and the REACTOR TRIP alarm in."*
**Lit on arrival.** Board: REACTOR POWER tile 0.5 % with a `TRIP 35%` sub-label; the SCRAM tile now reads `SCRAMMED / TRIP SIGNAL STANDING`; the alarm reads `Reactor Trip — Ot Delta T`.
The step's narrative says the historical reactor tripped "on high pressure" and the note then explains that on this plant it comes "on over-temperature difference rather than on pressure, because this relief valve is larger for the power it serves". That is the right explanation in the right place and it stopped me from filing a discrepancy. `shots/010_step3.png`.

**Step 4 of 16 · 04:01:07** — *"4. Verify the relief valve reading: the PORV light beside the pressurizer reads CLOSED, and the temperature under it is above 240 °F and climbing."* Done-when `✓ When PORV tailpipe temperature ≥ 240 °F (116 °C)`.
**Lit on arrival.** Found on the diagram: `PORV CLOSED` with `464 F` in the box under it. The step's phrase "the temperature under it" is literally true of the layout, which is a good piece of writing for someone who has never seen this board.
Two notes: the board prints no word "tailpipe" beside that number, and the done-when carries `(116 °C)` when the board has no °C reading anywhere. `shots/011_step4.png`.
**Tab-switch test 1 done here** — see §3.

**Step 5 of 16 · 04:02:39** — *"5. Verify safety injection has started by itself: the ECCS card shows the high-pressure pump running."*
**Lit on arrival.** ECCS card: `FLOW 41 GPM · DISCG 1047 psi · MODE HHSI · RUNNING`. "High-pressure pump" is not printed; `HHSI` is, and an operator will read that. Fine.
**S-4** is here: the step's note described level falling at 43 % and ECCS flow at 0 GPM while the board showed 55 % and 41 GPM. `shots/013_step5.png`, `shots/015_board_step5.png`.

**Step 6 of 16 · 04:03:50** — *"6. Press TRIP BLOCKS on the ROD CONTROL card, then BLOCK on the SI REACTOR TRIP row."* tagged *"the crew's action, as taken — not a recommendation"*. Done-when `○ SI actuation blocked`, cue `Use Trip Blocks: SI REACTOR TRIP lit on the TRIP BLOCKS panel`.
First action step, and the wayfinding is **exact**: `TRIP BLOCKS` is on the ROD CONTROL card where the step says, and the walkthrough puts a glow on it. The panel opens with four rows; the fourth reads `SI REACTOR TRIP / REACTOR TRIP · 1715 psi (P-11 PERMISSIVE) · ALSO BLOCKS SI ACTUATION`. Clicked its `BLOCK`; `✓ SI actuation blocked` immediately; the tile's badge went 2 → 1.
The note pre-empts the one thing that would have confused me — the row prints 1715 psi while the note talks about 1972 psi, and it says so before I could file it: *"that is where the safety-injection reactor trip fires, while 1972 psi is where the plant will let you block it."* Good.
~2 min, most of it because my first click landed as a hover and only lit the scanner. `shots/017_tripblocks_open.png`, `shots/019_tb_panel.png`, `shots/020_after_block.png`.
**This is the step that plants S-1.**

**Step 7 of 16 · 04:05:07** — *"7. Press STOP on the ECCS card to shut the high-pressure injection down."* tagged *"the crew's action, as taken — not a recommendation"*.
Clicked `STOP` on the ECCS card. ECCS went `MODE HHSI → STANDBY`, `FLOW 41 → 5 GPM`, `DISCG 1045 → 8 psi`. `✓ When ECCS injection is not running`, Continue lit. ~10 s.
The note warns *"The plant refuses this press for about a minute after injection starts, while its reset timer runs"* — by the time I arrived that minute was long gone, so I never saw the refusal. `shots/023_eccs_stop.png`.

**Step 8 of 16 · 04:06:28** — *"8. Verify PRESSURIZER LEVEL has gone to the top of its scale and is sitting there."* Done-when `✓ When PRESSURIZER LEVEL ≥ 99 %`.
**Lit on arrival**, level 100 %. This is the step the whole walkthrough is for and the note says so plainly: *"Level is not inventory… the pressurizer fills as the core loses water."* `shots/024_step8.png`.

**Step 9 of 16 · 04:06:28** — *"9. Verify SUBCOOLING MARGIN has reached zero and the pump cavitation alarm is in."*
**Both criteria lit on arrival.** SUBCOOLING MARGIN `-0 F`; the alarm is named `Reactor Coolant Pump Cavitation`, and the note names it too — *"this board alarms it as Reactor Coolant Pump Cavitation"* — which is precisely the kind of board-specific pointer I needed and rarely got. `shots/027_step9.png`.

**Step 10 of 16 · 04:08:37** — *"10. Open the auxiliary feedwater block valves: click the valve symbol directly above the AFW card."* Done-when `○ When STEAM GENERATOR LEVEL ≥ 5 %`.
The symbol carries no label. I found it by hovering (750,372) and reading the System Scanner: *"Auxiliary Feedwater (AFW) Block Valve — The AFW discharge valve — independent of the pump start/stop buttons."* The step's positional description ("directly above the AFW card") is accurate and got me within a few pixels. Clicked once: **AFW FLOW 0 → 86 GPM, DISCG 0 → 1014 psi**, valve symbol turned green.
Then the long ride. 600× accepted at first — `WARP 600× · achieving 450× · 0.5 s physics step` — and ran the clock T+00:07 → T+01:05:39 in ~10 wall s, then dropped: `WARP dropped to 60× — pressure moving 42 psi/s`. **S-3** is here: re-pressing 600× and pressing Ack All both failed. Ran out at 60×; SG level 0 → 37 %, criterion met.
The note's own numbers were right: *"Level takes about 9 plant-minutes to come off zero."* `shots/029_afw_region.png`, `shots/031_afw_opened.png`, `shots/032_afw_after.png`, `shots/033_warp600.png`, `shots/035_warp_retry.png`.

**Step 11 of 16 · 05:13:37** — *"11. Press OFF on the reactor coolant pumps to secure them."* tagged *"the crew's action, as taken — not a recommendation"*. Cue `Use RCP Run/Stop`.
`✓ PRESSURIZER LEVEL below 80 %, off the top of the scale at last` was met on arrival; `○ the pump cavitation alarm clears` needed the press.
The board has no control labelled "Run/Stop". I found `OFF` at (582,526) by hovering — scanner: *"OFF (RCP) — Stops the reactor coolant pump."* One click, cavitation alarm cleared within 3 s, Continue lit.
The note handles the one-handswitch-for-four-pumps simplification honestly: *"This board carries one handswitch for the reactor coolant pumps… one press here does both."* `shots/037_*`, `shots/038_rcp_off.png`.

**Step 12 of 16 · 05:41:37** — *"12. Verify PRESSURIZER LEVEL is falling: below 50 % and still going down."* Done-when `○ When PRESSURIZER LEVEL ≤ 50 %`. ⏩ *"About 30 plant-minutes at 1× — set the speed control to 60×."*
**S-5** (tile reads 50, check still open) and **S-6** (took 30 plant-seconds, not 30 plant-minutes) are both here. Set 60×; cleared at 49 %.
**Rewind test (c)** and **tab-switch test 2** both done during this step — see §3. Re-did step 11's RCP OFF press afterwards without difficulty. `shots/040_before_rewind_c.png`, `shots/040_after_rewind_c.png`, `shots/042_step12_done.png`.

**Step 13 of 16 · 06:11:37** — *"13. Verify SUBCOOLING MARGIN is pegged on the bottom of its scale at -50 °F."* Done-when `✓ When SUBCOOLING MARGIN ≤ -50 °F (-27.78 °C)`.
**Lit on arrival.** Tile reads `-50 F`. The note is the best writing in the leg — it explains that the *real* TMI cue (loop A hot leg off scale) cannot be reproduced here and says why: *"its detector reads to 752 °F and the hot leg peaks 120 degrees below that. The pegged number carries the same message."* An operator can accept that. `shots/043_step13.png`.

**Step 14 of 16 · 06:18:37** — *"14. Close the PORV block valve: one click on the small valve symbol just left of the PORV."*
**S-1** (blocked by the TRIP BLOCKS overlay), **S-2** (600× promised, refused) and **S-3** are all here. Recovered by closing the panel; the valve then sat glowing at (485,203) and one click did it.
Result was exactly as promised: PRIMARY PRESSURE turned upward within seconds (569 → 573 → 641 → 689 → 727 → 765 psi) and `✓ PORV tailpipe temperature below 400 °F` came in about a third of the way through. Ran at 60× throughout.
Note also that "just left of the PORV" is a slight understatement — the valve is left **and below** the `PORV CLOSED` legend, about 13 px down. With the panel closed and the glow on, it is unmissable; without the glow it would be a hunt. `shots/045_porv_region.png`, `shots/046_full_step14.png`, `shots/047_click_through_panel.png`, `shots/049_porv_visible.png`, `shots/050_block_shut.png`, `shots/051_step14_wait.png`.

**Step 15 of 16 · 07:20:37** — *"15. Press START on the ECCS card to put high-pressure injection back in."* Done-when `○ When SUBCOOLING MARGIN ≥ 10 °F (5.56 °C)`.
Clicked `START` on the ECCS card at (799,580) — scanner: *"START (Emergency Core Cooling System (ECCS)) — Starts emergency injection by hand."* ECCS `MODE STANDBY → HHSI`, `FLOW 0 → 50 GPM`.
600× held the whole way (**S-7**). SUBCOOLING MARGIN −50 → −16 → −1 → −0 → **+28 °F**. Criterion met at T+04:05.
One board oddity I could not explain from the screen: with ECCS running at 50 GPM the card's `DISCG` read `0 psi`, where in step 5 it read 1047 psi at 41 GPM. I have no way to tell from the board whether that is a real hydraulic fact or a dead reading. `shots/053_eccs_start.png`, `shots/054_step15_wait.png`.

**Step 16 of 16 · 19:50:37** — *"16. Press ON for the reactor coolant pumps to restore forced circulation."* Done-when `○ When RCP FLOW ≥ 80 %`. Cue `Use RCP Run/Stop`.
Clicked `ON` at (617,526). Criterion met within ~3 plant-minutes at 60×.
The note is candid about the model's limits — *"Core damage, containment radiation and the hydrogen burn are not modelled on this plant. Everything up to this step was"* — and then quantifies the gap in fuel temperature. That is the right way to hand a limitation to an operator.
One inconsistency: the leg is titled *"the first four hours"* but this step's story clock is **19:50:37**, nearly sixteen hours in, and its narrative says so. `shots/055_step16.png`, `shots/056_step16_done.png`.

**Complete** — *"Walkthrough complete."* `shots/059_complete.png`.

---

## 5. Words and numbers I could not find on the board

| The walkthrough said | What is actually on the board |
|---|---|
| "TURBINE TRIP lit" (step 2) | No annunciator with that text. TURBINE-GENERATOR box has `LATCH` / `TRIP` / `UNLOAD` **pushbuttons**; `TRIP` highlights. The ALARMS panel has `Turbine Trip / Low Steam Demand`. |
| "the REACTOR TRIP alarm in" (step 3) | Alarm is named `Reactor Trip — Ot Delta T`. The ROD CONTROL tile reads `SCRAMMED / TRIP SIGNAL STANDING`. |
| "the ECCS card shows the **high-pressure pump** running" (step 5) | Card shows `MODE HHSI` and `RUNNING`. The words "high-pressure pump" appear nowhere. |
| "Use **RCP Run/Stop**" (steps 11, 16) | Buttons are `ON` and `OFF`. Scanner names them "ON (RCP)" / "OFF (RCP)". Nothing says Run/Stop. |
| "PORV **tailpipe** temperature" (steps 4, 14) | The number is on the diagram (`481 F`, under `PORV CLOSED`) but carries no printed label at all — no "tailpipe", no "discharge". |
| "the valve symbol directly above the AFW card" (step 10) | Unlabelled symbol. Identifiable **only** by hovering the System Scanner. |
| "the small valve symbol just left of the PORV" (step 14) | Unlabelled symbol, left **and below** the legend. Scanner-only, and hidden by the TRIP BLOCKS panel (S-1). |
| "(116 °C)", "(-27.78 °C)", "(5.56 °C)" in done-whens (steps 4, 13, 15) | The board carries **no °C reading anywhere**; units are US throughout. The conversions themselves are correct — including −50 °F of subcooling → −27.78 °C, correctly treated as a temperature *difference*. |
| Step 2 note "Pressure peaks near **2340 psi**"; step 3 narrative "Pressure spiked near **2255 psi**" | I sampled **2333 psi**. The 2255 is the historical TMI figure inside `THE CREW SAW`; nothing on screen marks which numbers are this plant and which are 1979. |
| Step 5 note "PRESSURIZER LEVEL … about **43 %** now" and "ECCS FLOW reads **0 GPM**" | Board read **55 %** and **41 GPM** when I arrived (S-4). |
| Step 14 "the plant holds 600× right through it" | 600× refused for the entire step (S-2). |
| Step 15 "600× will drop back to 60× partway through" | 600× held for the entire step, zero represses (S-7). |
| Step 15 "the margin … climbs back through zero about **22 plant-minutes** later" | Left the floor in ~11 plant-minutes; reached the +10 °F criterion about **two plant-hours** later. |
| Step 12 "About **30 plant-minutes** at 1×"; step 13 "About **7 plant-minutes**" | ~30 plant-**seconds**, and already satisfied on arrival, respectively (S-6). |
| Leg title "the **first four hours**" | The last step's story clock is `19:50:37` — nearly sixteen hours in. |

---

## 6. What the text got right

- The preamble tells you the failures arrive on their own, so you never go looking for an Inject Failure tab.
- It declares the defeated turbine-trip channel up front, and says it is defeated *only inside this walkthrough*.
- Every action step that reproduces a crew mistake is tagged *"the crew's action, as taken — not a recommendation"*, on exactly the right steps (6, 7, 11).
- Step 3 pre-empts the trip-signal difference (over-temperature ΔT here, high pressure at TMI) before you can file it as a bug.
- Step 6 pre-empts the 1715 psi / 1972 psi discrepancy in the same breath as showing it.
- Step 6 warns that the TRIP BLOCKS panel stays open until you press TRIP BLOCKS again — which is the only reason I recovered from S-1.
- Step 7 warns the plant will refuse the press for about a minute after injection starts.
- Step 9 names the alarm exactly as the board prints it: `Reactor Coolant Pump Cavitation`.
- Step 10's positional wayfinding ("directly above the AFW card") lands within a few pixels.
- Step 10 explains the one-symbol-two-valves simplification, and step 11 the one-handswitch-four-pumps one.
- Step 10's "about 9 plant-minutes to come off zero" matched what I measured.
- Step 13 explains why the real TMI cue (hot leg off scale) cannot appear here, and gives the detector limit that makes it impossible.
- Step 14's physics prediction was exactly right: pressure turned upward within seconds of the block valve shutting, and the tailpipe cooled.
- Step 16 states plainly what is not modelled — core damage, containment radiation, hydrogen burn — and quantifies the gap on fuel temperature rather than hand-waving it.
- Step 8's note is the clearest statement of the coupling the leg exists to teach: "Level is not inventory."
- The walkthrough's own clock is printed on every step (`CLOCK 04:03:50`), so the narrative time is never ambiguous.
- The `Step done — press Continue.` line appears whenever Continue lights, so you are never left wondering whether the check took.

---

## 7. Screenshot index

`001_load` · `002_wt_list` · `003_started` · `004_step1_board` · `005_step2` · `006_after_rewind1` ·
`007_step2_wait` · `008_turbine_area` · `010_step3` · `011_step4` · `012_indications_tab` ·
`012_back_instructor` · `013_step5` · `015_board_step5` · `016_step6` · `017_tripblocks_open` ·
`019_tb_panel` · `020_after_block` · `021_step7` · `023_eccs_stop` · `024_step8` · `027_step9` ·
`028_step10` · `029_afw_region` · `031_afw_opened` · `032_afw_after` · `033_warp600` ·
`034_step10_wait` · `035_warp_retry` · `036_step11` · `038_rcp_off` · `039_step12` ·
`040_before_rewind_c` · `040_after_rewind_c` · `042_failtab` · `042_step12_done` · `043_step13` ·
`044_step14` · `045_porv_region` · `046_full_step14` · `047_click_through_panel` · `048_rewind_b` ·
`049_panel_closed` · `049_porv_visible` · `050_block_shut` · `051_step14_wait` · `052_step15` ·
`053_eccs_start` · `054_step15_wait` · `055_step16` · `056_step16_done` · `057_dark_continue` ·
`058_before_final_continue` · `059_complete`

All under `shots/`.
