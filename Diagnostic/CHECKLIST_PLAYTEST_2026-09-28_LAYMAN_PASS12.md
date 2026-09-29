> **Record, not policy.** Layman pass 12, 2026-09-28, the SIX-LEG CHAIN (heatup through cooldown, one plant) plus a second fresh-preset `pwr_startup` to step 13, on `develop` `6e6e17fd` (Alpha 1.8.0-rc9 + #809), headless Edge: 6 of 6 legs complete, one Rewind (the reviewer's own harness tripped the reactor at startup 5). Verified 2026-09-28; every claim below was the reviewer's until the **Measured** line under it. **S-1** 12a tick late: NARROWED, the row grades ~68 s after the press and the text said 60; text fixed · **S-2** step 5 flicker: NARROWED, no change · **S-3** "Press again to confirm" on an unpressed row: CONFIRMED, fixed · **S-4** "12 steps past the prediction": NARROWED, 8 to 10 measured, 10b fixed · **S-5** step 8 timing: NARROWED, wording fixed · **S-6** 1/M pop-up covers tiles: not measured, owner decision · **S-7** auto-warp misses: REFUTED, 10x/5x applied within 2.5 s of the step's action on all five in headless Edge; RP5's drop narrowed · **S-8** 552 °F at heatup 11: CONFIRMED, note added · **S-9** BORATING cue: CONFIRMED, fixed · **S-10** relief-valve lift: REFUTED (4-11 s on both routes); level climb: CONFIRMED preset-only, CD6 note fixed · **S-11** HU14/LP2 duplicates, RP7, HU13 fixed; bands and HU2 refuted. Glow pulse: not measured.

# Layman playthrough — PWR2 walkthrough chain

Build under test: Alpha 1.8.0-rc9 + #809 (develop 6e6e17fd), `ui/shell.html?engine=pwr2`, headless Edge.
Persona: an intelligent layman who knows pumps and valves. Everything I learned came from the walkthrough panel and the board.
Wall time: ~73 min for the full six-leg chain (heatup → cooldown, one continuous plant, T+00:00 → T+18:24 plant time). I then spent ~20 min on a SECOND PASS of the startup, loaded fresh from its own preset, to re-check steps 5–12 with stricter tap discipline.
Screenshots: `shots/` (names are given in the log). Running notes: `log.md`.

**Caveat on my own driving.** I drove the board with scripts. Twice the script, not the walkthrough text, made the mistake, and I say so wherever it applies:
- SU5, first try: my board reader failed, so I held WITHDRAW for 61 s and tripped the reactor.
- SU12, first run: I tapped until the tick came, not until the reading met the condition.

Each finding below separates what the text did from what my scaffolding did.

---

## 1. Outcome

| Leg | Result | Steps completed | The one thing that mattered |
|---|---|---|---|
| pwr_heatup (Mode 5 → Mode 3) | Finished | 17/17 | The accumulator valve is an unlabeled diagram symbol. It was findable only because the text said where it is and the symbol had a ring. |
| pwr_startup (Mode 3 → Mode 1) | Finished (1 rewind, caused by my harness) | 18/18 | Step 12 says to stop tapping when "STARTUP RATE reads +0.15 or more a plant-minute after a tap". The check-off only ticks about 2 plant-minutes after the last tap (measured 116 plant-s). A player waiting for the tick taps again and overshoots: I ended at +0.46 DPM after 14 taps. |
| pwr_raise_power (10 % → 100 %) | Finished | 9/9 | Load-then-rods worked every stage, with 5-step MED pulls landing in the stated step counts. |
| pwr_lower_power (100 % → 15 MWe) | Finished | 6/6 | Clean. A duplicated sentence in step 2. |
| pwr_shutdown (Mode 1 → Mode 3) | Finished | 3/3 | Clean. The SCRAM arm/confirm labels matched. |
| pwr_cooldown (Mode 3 → Mode 5) | Finished | 16/16 | Step 4 is 37 separate typed DUMP SETPOINT entries over ~3 h 40 plant-min. It is tedious but unambiguous, and the cooldown rate never exceeded -85 °F/hr. |
| pwr_startup, second pass (fresh preset) | Steps 1–13 re-run | 12/18 re-checked | Step 5: SOURCE RANGE noise makes "hold until it reads 7.0e2" release early (rod 68, average count ~6.7e2). 5a then did not tick for ~50 plant-min until I tapped. Plot point also accepted a point before 5a had ticked. |

---

## 2. Stuck points, ranked by severity

### S-1 — Startup step 12: the check-off comes ~1 plant-minute later than the text says to read. Waiting for it causes overshoot.
**Measured:** Live-checklist route runner (`run_walkthrough_routes --job`, `WR_TRACE=12`, seed 42), typical and chain routes: read a plant-minute after each tap LANDED, bank 212 gave +0.143 / +0.141 and bank 213 +0.176 / +0.173; 12a ticked 70 s after the 7th tap on both. The row needs the rods still 60 s by the bank's motion flag, which clears ~8 s after a SLOW press, so it grades ~68 s after the press, while the rate at bank 212 decays across the threshold (+0.147 at 60 s, +0.144 at 68 s, +0.142 at 75 s). That is the reviewer's 116 s. Tapping every 62 s restarts the 60 s clock each time, so the row can never tick while taps continue: the 14-tap overshoot was the scaffold's tap-until-tick rule meeting that.

**Verdict:** NARROWED: the grading is right; the text named the wrong instant to read. Fixed: read about 70 plant-seconds after each tap, and do not tap while waiting.

**Text:** "12a Press SLOW. Tap WITHDRAW one step at a time, a plant-minute apart, until STARTUP RATE reads +0.15 or more a plant-minute after a tap." Check-off line: "STARTUP RATE +0.15 or more, rods still a plant-minute". "Expect 6 or 7 taps. Real crews climb gently here, between +0.1 and +0.2."

**What I did:**
- **First run:** tapped at 62-plant-s intervals: +0.01, +0.03, +0.06, +0.09, +0.11, +0.14, then +0.18 at tap 7 (rod 213). 12a had not ticked when I read +0.18, so I tapped again, and kept going to tap 14: rod 220, +0.46 DPM. Power went 0 → 3.6 % in ~4 plant-min instead of "20 to 26".
- **Second pass, with discipline:** tap 6 (rod 212) read +0.15 exactly 60 plant-s later. There was no tick. I stopped tapping, and 12a ticked 116 plant-s after the last tap (T+01:24:58), with SUR still +0.15.

Screenshots: su_s12_start.png, su_s12a.png, su2_s12a.png.

**What would have unstuck me:** say "then stop tapping and wait. The check ticks about two plant-minutes after your last tap", or make the check fire on the one-minute read the text tells the player to take.

### S-2 — Startup step 5 (second pass): a noisy count makes "hold until 7.0e2" release too early, and the plot accepts a point before 5a
**Measured:** Typical route: released at bank 77 on SR 696, 5a ticked at 704 after 3.07 plant-min. The gate's `flicker_release_5` mistake route (release at bank 69, settled count ~680) recovers through the note's own tap branch. `plot_1m_point` is never gated by design (instructor_layer.js: "taking a reading is an observation, always allowed"); the uncounted out-of-turn press and its "Not yet, 5a comes first" line are the #759 owner ruling (2026-09-15, "Fix the text AND say why").

**Verdict:** NARROWED: 5a correctly refused a count averaging ~6.7e2 against its 695 floor, and the note already carries the "touches 7.0e2 now and then, tap" branch the scaffold skipped. The stray point is designed. No change.

**Text:** "5a Hold CONTROL WITHDRAW at MED until SOURCE RANGE reads 7.0e2 or more, then watch it for 5 seconds: the count jumps about 15 % either way … On a fresh core at 719 ppm this lands near CONTROL ROD POSITION 75 to 80 … If it only touches 7.0e2 now and then, or is still short at 80, tap WITHDRAW one step and wait half a plant-minute."

**What I did:**
- **Release:** released WITHDRAW on the first reading ≥7.0e2, which came at rod 68. The count then averaged ~6.7e2 (6.3e2–7.3e2).
- **No tick:** 5a did not tick from T+00:01 to T+00:54 plant time. My harness did not take the "touches now and then" branch. A human who reads the note would, but "still short at 80" did not apply at rod 68, so the rod-number cue points the wrong way.
- **Early plot point:** during that wait I pressed Plot point. The panel said "Not yet — 5a comes first", but the 1/M pop-up plotted the point anyway: "predicted criticality ≈ step 262 … C = 645 cps". That stray point stays on the curve.
- **Recovery:** four taps half a plant-minute apart took the rod to 72, and 5a ticked (T+00:58:10).

In the first run (rod 76) SR also hovered 6.6e2–7.2e2 after release, yet 5a ticked quickly.

Screenshots: su2_s5_state.png, su2_s5_plot.png.

**What would have unstuck me:** "Keep holding until the count stays at 7.0e2 for 5 seconds; a single flash of 7.0e2 is noise". Plot point should also refuse the press while 5a is open.

### S-3 — Startup step 16: the SR HIGH FLUX row asks me to "Press again to confirm" a release I never started
**Measured:** `tripBlockRows` (pwr_board_wiring.js) set the caption "... Press again to confirm." on EVERY blocked row whose trip is asserted: a standing state, drawn before any press. The arm (`tripArm`, button CONFIRM) exists only after a first press. SR HIGH FLUX is asserted at any power above the source range, so the row showed it whenever the panel was next opened.

**Verdict:** CONFIRMED (pass 11 found it too and left it). Fixed: the caption now reads "... Releasing takes two presses."; `run_pwr2_board` asserts the new wording and that no standing caption says "Press again".

**Text:** step 16 is about the IR HIGH FLUX row only.

**What I did:** opened TRIP BLOCKS and blocked IR HIGH FLUX. The SR HIGH FLUX row, blocked at step 9 and untouched since, now read "RELEASING THIS WILL TRIP THE REACTOR NOW — the setpoint is crossed. Press again to confirm." It had a red **RELEASE?** button. The wording stayed the same when I reopened the panel.

"Press again" tells me I already pressed it once. A layman may press it to make the warning go away and trip the reactor. By cooldown step 3 the same row read "RELEASED BY THE PLANT", which is fine.

Screenshots: su_s16_blocked.png, su_s16_reopen.png.

**What would have unstuck me:** a standing row that says "BLOCKED — releasing it now would trip the reactor". "Press again to confirm" should appear only after a first press.

### S-4 — Startup steps 10→11→12: "about 12 steps" is a fixed count, but step 10 does not stop at 12
**Measured:** Typical route: prediction 208, 10a stop 205, released at 218: 10 past the prediction, 13 past the stop; chain route the same. Reviewer: 8 and 9 past the prediction (210 / 209 to 218), 11 and 12 past the stop. 11b's 12-step insert landed at 206 on all four runs, STARTUP RATE -0.02 to -0.01.

**Verdict:** NARROWED: 11b's "about 12 steps" is right (12 past critical, and critical was 206 every time); 10b's "12 steps past the prediction mark" was wrong (8 to 10). Fixed 10b's note. Printing the target position on the card is a UI change, not made.

**Text:**
- Step 10b: "The rods stop about 12 steps past the prediction mark".
- Step 11b: "Insert … hold INSERT at MED about 12 steps … Two steps short, it settles near +0.05."
- Step 12a: "Expect 6 or 7 taps."

**What I did:** in step 10 I held to STARTUP RATE +0.5 exactly as told.
- **Run 1:** the rods stopped 8 past the 1/M prediction (218 vs 210). Inserting 12 as told put them 4 below the prediction. SUR sat at -0.02 and INTER RANGE fell 1.0e-8 → 7.5e-9 A.
- **Run 2:** 9 past (218 vs 209). 12 back gave -0.01, which was fine.

In run 1 the four missing steps became taps 1–4 of step 12, which is part of why step 12 took 14 taps (see S-1). The count "about 12" does not tell me what I am inserting back to.

**What would have unstuck me:** "insert back to about the 1/M prediction (CONTROL ROD POSITION ≈ <prediction>)" instead of a step count. Printing the number would also help.

### S-5 — Startup step 8: the timing the text gives does not match what the check-off enforces
**Measured:** Typical route (a 14-step pull to 205): STARTUP RATE +0.036 six plant-minutes after the rods stopped, plotted 7.2 min into the step. Reviewer: ~6 plant-min after a full pull, 1.5 plant-min after a 4-step pull. Only +0.03 is graded.

**Verdict:** NARROWED: the time is right for the pull the step asks for; it read as a second condition. Fixed: "After a pull to about 205 ... after a shorter pull it gets there sooner. A point plotted before it reads +0.03 ...".

**Text:** "8b Wait for STARTUP RATE to read +0.03 or less, then press Plot point … STARTUP RATE takes about 5½ to 6½ plant-minutes to reach +0.03 here. A point plotted before then puts the predicted position further out than it is."

**What I did:**
- **Run 1:** step 7 overshot to rod 196, so step 8 was a 4-step pull (to 200). SUR reached +0.03 after ~1.5 plant-min and the check-off would have let me plot then. I waited 6 plant-min by the clock instead: prediction 210.
- **Run 2:** a full pull to 205. SUR took ~6 plant-min, matching the text: prediction 209.

The text sets two conditions (+0.03, and 5½ minutes). Only one is checked, and it can arrive much earlier.

**What would have unstuck me:** one rule. Either "plot at +0.03", or "wait until the check-off ticks" with the wait enforced.

### S-6 — The 1/M PLOT pop-up covers part of the board from step 4 to step 12
**Measured:** Not re-measured (layout; the only evidence is the reviewer's screenshot `su_s4_plot.png`).

**Verdict:** NOT FILED as a finding: it goes to the owner as a layout decision.

**Text:** step 4 says to open it. Step 12 is the first to say "The 1/M PLOT window has done its work: close it with the ✕ in its corner."

**What I did:** left it open as told. From steps 4 to 11 it covers:
- the STEAM GENERATOR LEVEL tile,
- the TURBINE-GENERATOR card,
- the STEAM DUMP card,
- the left end of the speed bar (the 1× button is half hidden).

I could still work, but the SG level was unreadable through the whole approach to criticality.

Screenshots: su_s4_plot.png, su_s10b_holding.png.

**What would have unstuck me:** a smaller or movable pop-up, or "close it between points; Plot point is reopened with 1/M PLOT".

### S-7 — "Walkthrough sets time warp" is applied at some steps and not others
**Measured:** Headless Edge on this tree, app.js's own auto-warp, each step entered on its leg's preset: SU12 1x to 10x within 2.5 s of one WITHDRAW tap; SU13 to 10x on the gpm entry; SU15 to 10x on LOAD 10 after LATCH; LP2 to 5x on the first LOAD entry; CD6 to 5x when 6b ticked; control RP4 to 10x. Before the step's own action the clock holds 1x by design (`cklActionPending`, layman pass 4 S-1). The reviewer's log shows the speed pressed before the action on SU12 and LP2. RP5: minimum pressure 2255 psia (typical) and 2247 psia (chain), no alarm; the reviewer's dip to 2082 psi is off both routes, and an undeclared WARNING on a quiet board drops the clock by design.

**Verdict:** REFUTED for the five auto-warp misses; NARROWED for RP5 (the drop is the designed alarm stop; the dip that raised it did not reproduce).

**Text:** each step prints "Suggested time warp: N×". Some steps say "The clock moves to 60× by itself…".

**What I did:** with the checkbox on, the clock stayed at 1× on these steps:
- SU12 (10×),
- SU13 (10×),
- SU15b (10×),
- LP2 (5×),
- CD6 (5×).

I pressed the speed button myself each time. On other steps it switched automatically: HU3, HU9, HU11, HU14, SU2, SU5, RP4–RP8, CD1, CD4, CD8, CD11.

Separately, in RP5 the clock dropped 10× → 1× at T+09:55:33, six seconds after a "Pressurizer Pressure Low" warning (T+09:55:27, pressure ~2150 → 2082 psi). It stayed at 1× for the rest of 5b. Neither the drop nor the alarm is mentioned in the step. I did not catch what #warpInfo said at that moment.

**What would have unstuck me:** consistent behaviour, or a line saying "press 10× now".

### S-8 — Heatup step 11 overshoots its target at 3600×
**Measured:** Typical and chain routes both tick heatup 11 at 545.9 °F (3.9 °F over 542); the reviewer read 552 °F. At 3600x one broadcast carries many plant-minutes, so the overshoot depends on where the last broadcast lands.

**Verdict:** CONFIRMED (route-dependent, 4 to 10 °F). Harmless (step 15's band settles it). Fixed: the note now says the tile can read up to about 10 °F past 542 °F when the clock slows.

**Text:** "Wait until AVG COOLANT TEMPERATURE reaches 542 °F."

**What I did:** nothing, at the auto 3600×. When the step lit and the clock dropped to 1×, the tile read 552 °F: 10 °F past the target. Readings were 529 °F at T+05:33 and 552 °F at T+06:05.

It did no harm, because step 15 wants 544–549 and the plant settled at 547. But a layman is told "542" and sees 552.

Screenshot: hu_s11_ready.png.

**What would have unstuck me:** "it will read a few degrees over by the time the clock slows; that is expected."

### S-9 — Cooldown step 1: "until BORON STATUS reads BORATING"
**Measured:** The step-level note said "Do not start cooling until BORON STATUS reads BORATING"; BORATING lights on the Enter press, and row 1c waits for BORON CHEM 880 ppm (63.0 plant-min on the typical route).

**Verdict:** CONFIRMED: the note contradicted the step's own aim. Fixed: "... until BORON CHEM reads 880 ppm; BORATING only shows the boration has started."

**Text:** "Do not start cooling until BORON STATUS reads BORATING."

**What I did:** it read "BORATING 98→" the instant I pressed Enter, about an hour before the step let me go on.

**What would have unstuck me:** say which reading means "done": HOLD, or BORON CHEM ≥ 880.

### S-10 — Promised events that did not happen
**Measured:** Route runner alarm log: CD2 Pressure Relief Valve Open raised on both routes, cleared after 11 s; CD5 raised at 1880 psia (typical) / 1832 psia (chain), cleared after 5 s / 4 s. PRESSURIZER LEVEL (WR_TRACE): CD6 24.8 to 25.4 % (typical) and 24.4 to 24.2 % (chain); CD8 25.5 to 62.1 % on the preset route but 24.1 to 27.9 % on the chain, the reviewer's flat 25-27 %.

**Verdict:** REFUTED for the relief valve (it lifts on both routes for 4-11 s; a poll a few seconds apart misses it). CONFIRMED for the level: the climb exists only on the preset route. Fixed the CD6 note to "at 50 % PRESSURIZER LEVEL barely moves".

- **CD5:** "Pressure Relief Valve Open comes in again for about five plant-seconds: expected, as in step 2." The PORV label stayed CLOSED and the step ticked in 2 plant-s.
- **CD2:** the PORV label did read OPEN, but I never saw an alarm titled "Pressure Relief Valve Open" in the list.
- **CD8:** "Spray water goes into the pressurizer and PRESSURIZER LEVEL climbs as pressure falls." Level stayed 25–27 % from 1277 to 399 psi.

None of these blocked me. A layman does wonder what went wrong.

### S-11 — Small text errors a reader trips on
**Measured:** Built pool (`RD.MANUAL_PROCEDURES.pwr2`): bands: 578 °F ± 5 at 100 % (RP8), the tile's band top at 75 MWe is ~577 °F (LP3; `tavgBand` = reference ± 5 °F), RP9c's 563-592 °F is a hold tolerance, not the band. RP7: the pulls stay 5 steps, only the stage total shrinks. HU13: STEAM PRESS 1016 psia with ATMOS DUMP 0 % on the typical route (WR_TRACE), 1057 psi with it 9 % open on the reviewer's. HU14: the step printed its own `speed_text` line under 14b's identical 600x line. LP2: the note's last sentence was doubled in the source. HU2: the note is conditional ("Coming from a cooldown ...").

**Verdict:** Bands REFUTED (consistent, different quantities); HU2 REFUTED (conditional by design); RP7 and HU13 NARROWED and fixed ("each stage pulls fewer steps"; "up to about 1020 psi, or past it with the ATMOS DUMP venting the extra"); HU14 and LP2 CONFIRMED and fixed.

- **Band descriptions disagree.** RP8 says the band at 100 % is "573 to 583 °F". LP3 says "578 °F at 100 %" and calls "577 °F … the top of the green band". RP9c says both "above its band" and "between 563 and 592 °F".
- **RP7 heading "with a smaller pull".** The line still says "5-step pulls", identical to the earlier stages; only the total is smaller.
- **HU13 "Pump heat has brought STEAM PRESS up toward 1020 psi".** The board already read 1057 psi, and the ATMOS DUMP was 9 % open (hu_s13.png).
- **HU2 note is off-case.** "Coming from a cooldown with PRIMARY PRESSURE under about 25 psi…" did not apply (363 psi), and the reader has to decide that.
- **HU14 duplicate.** "Suggested time warp: 600×." is printed twice under 14b.
- **LP2 duplicate.** "Continue can light as OUTPUT reaches 75 MW, before the last minute and insert: the next step finishes that trim." is printed twice in a row.

---

## 3. Per-step log (with glows)

**Glow styles I saw:**
- **Top tiles:** a bright, solid cyan ring around the whole tile.
- **Cards:** a thinner cyan ring on the card border.
- **Buttons, value boxes and diagram readouts:** a small cyan ring of their own.
- **Pop-ups:** rings on the "Plot point" button and on the relevant TRIP BLOCKS row.
- **Diagram symbols:** a ring around the symbol (the steam dump valve, the accumulator valve).

I could not see pulsing in stills. Frames 350–400 ms apart were identical at screenshot resolution (hu_s10_zoomA/B.png, glow_f0–f3.png), so any pulse is too subtle to show in a still.

Glows moved correctly between lettered substeps in every case I checked:
- SU5: the STARTUP RATE value got its ring once 5a ticked.
- SU9: the ring moved from the SR row to INTER RANGE.
- SU13: from the SG FEED gpm box to AUX FEED WATER STOP.
- SU15: onto the STEAM DUMP status word.
- CD3: onto the ECCS STOP button.

Glows on already-satisfied items stayed lit after they ticked (HU5).

### pwr_heatup
- **HU1 — "Confirm the plant is cold and shut down."** All 4 ticked on load. Glows: solid rings on AVG COOLANT TEMPERATURE and PRIMARY PRESSURE tiles, rings on both rod-position readouts. hu_s1.png.
- **HU2 — "Start the reactor coolant pumps."** Pressed ON on the RCP FLOW card. RCP FLOW >90 % in <30 plant-s. Glow: ring on the RCP FLOW card and ON. The note about coming from <25 psi did not apply (363 psi). hu_s2.png, hu_s2_after.png.
- **HU3 — "Withdraw the shutdown bank all the way out."**
  - Pressed FAST, then clicked WITHDRAW under SHUTDOWN once. 3a ticked at once and the clock went to 60× (the bar chip read "→ 40×").
  - 627/627 reached at T+00:10:14 (~9 plant-min, as stated).
  - Glows: ROD CONTROL card, FAST, SHUTDOWN WITHDRAW, SHUTDOWN ROD POSITION: exactly right. After the press WITHDRAW was lit orange.
  - The Continue button was pushed below the panel's fold.
  - hu_s3.png, hu_s3_after.png.
- **HU4 — "Confirm the turbine is tripped."** Pre-ticked. Glows: TURBINE-GENERATOR card, TRIP, OUTPUT. "TRIP is a lamp to read here, not a button" — but it is drawn exactly like the LATCH/UNLOAD buttons. hu_s4.png.
- **HU5 — "Put auxiliary feed in AUTO…"** Pressed AUTO on AUX FEED WATER; it went STANDBY → RUNNING in <3 s. Glows: STEAM GENERATOR LEVEL tile, the AFW card and AUTO. hu_s5.png, hu_s5_after.png.
- **HU6 — "Confirm the steam dump is closed."** Pre-ticked. Glows:
  - STEAM DUMP card, MANUAL, CLOSE,
  - the dump valve symbol on the diagram, and its "0 %".

  Without the diagram ring I would not have known which "%" was "beside the STEAM DUMP valve". hu_s6.png.
- **HU7 — "Open the letdown orifices…"** Pressed A+B 7 % on LETDOWN. Ticked. Glows: LETDOWN card, A+B 7 %, the diagram LETDOWN 12 gpm readout. Confusing: the LETDOWN card showed CLOSED lit while the diagram read 12 gpm. hu_s7.png.
- **HU8 — "Put pressurizer spray in service…"** AUTO under SPRAY. Ticked. Glows: PZR card and SPRAY AUTO. hu_s8.png.
- **HU9 — "Raise PRIMARY PRESSURE to the 665 psi accumulator window on the heaters."**
  - AUTO under HEATER. The clock went to 600× (chip "→ 470×").
  - 665 psi at T+00:54:28. The clock dropped to 1× with the red banner "Held at real time — the plant needs you here".
  - The Shutdown Cooling alarm came in as promised.
  - Glows: PRIMARY PRESSURE tile, PZR card, HEATER AUTO.
  - hu_s9a.png, hu_s9_ready.png.
- **HU10 — "Open the accumulator valve while PRIMARY PRESSURE is inside its window."**
  - The valve is an unlabeled symbol. I found it from the text ("just above the ACCUMULATORS tile, to the left of ECCS INJ FLOW") and its ring.
  - Clicked it: ISOLATED → ARMED. Ticked at 669 psi.
  - The expected "ACCUMULATORS caution" appeared as "Accumulators Still Lined Up — RCS Below Their Isolation Pressure".
  - hu_s10_zoomA/B.png, hu_s10_after.png.
- **HU11 — "Heat the plant to 542 °F on pump heat alone."**
  - Auto 3600×. Ticked T+06:05:24 with Tavg 552 (see S-8).
  - The alarms came as promised (PZR Pressure Very Low, PZR Pressure Low, Turbine Trip / Low Steam Demand).
  - Glows: Tavg tile, PRIMARY PRESSURE tile, STEAM PRESS readout.
  - hu_s11_ready.png.
- **HU12 — "Confirm letdown now leaves only through the orifices."** Pre-ticked. hu_s12.png.
- **HU13 — "Hand STEAM PRESS to the steam dump to hold."** AUTO on STEAM DUMP. Ticked. Glows: STEAM DUMP card, AUTO, the status word. hu_s13.png.
- **HU14 — "Bring PRIMARY PRESSURE up to normal operating pressure."** Typed 2235 + Enter in SET PZR PRESSURE. The clock went 600×; >2200 psi ~10 plant-min later. Glows: PZR card and the setpoint box. hu_s14.png.
- **HU15 — "Confirm Hot Standby."** Pre-ticked (547 °F, 2228 psi, ATMOS 0 %, 1020 psi). hu_s15.png.
- **HU16 — "Confirm the reactor stayed shut down."** 16a ticked after ~30 plant-s at the auto 10×. Glows: SOURCE RANGE, STARTUP RATE, CONTROL ROD POSITION, BORON STATUS. hu_s16.png.
- **HU17 — "Confirm the heatup made no fission power."** Pre-ticked. Complete, with "Next:" offered. hu_end.png. About 25 min wall.

### pwr_startup (chain run)
- **SU1 — "Verify the plant is in Hot Standby (Mode 3)."** Pre-ticked; the chain kept the same plant. su_s1.png.
- **SU2 — "Dilute boron to the estimated critical concentration, 719 ppm."**
  - Typed 719 + Enter in the "0-2500 ppm" box. Auto 600×.
  - 884 → 720 ppm, HOLD at T+08:36 (~2 plant-h, as stated).
  - Glows: BORON card, the "0-2500 ppm" caption, the ppm box.
  - su_s2_pre.png.
- **SU3 — "Line up the steam generator…"** Pre-ticked.
- **SU4 — "Take the 1/M baseline point before any rod moves."** 1/M PLOT, then Plot point. Ticked. Glows: 1/M PLOT, SOURCE RANGE, and "Plot point" inside the pop-up (see S-6). su_s4_plot.png.
- **SU5 — "Take the second 1/M point, after the first rod pull."**
  - **Trip (my harness):** the held button tripped the reactor ("Reactor Trip — Source Range Hi Flux"). The step showed a red banner, "Dropped to real time — reactor trip", and a plain explanation. su_s5_trip.png.
  - **Rewind:** Rewind step returned me to the start of step 4, as documented, and I redid the baseline.
  - **Second try:** pressed MED (FAST was still lit from heatup; the text says "at MED", not "press MED") and held 10.7 s wall at the auto 10×. Released at rod 76 when SR read 7.3e2, exactly the stated 75–80.
  - **Tick and plot:** 5a ticked. SUR reached +0.00 in ~40 plant-s. Plotted: prediction 269.
  - Glows: ROD CONTROL card, WITHDRAW, MED, SOURCE RANGE, CONTROL ROD POSITION, then STARTUP RATE.
  - su_s5_holding2.png, su_s5_done.png.
- **SU6 — "Take the third 1/M point."** Held 11.4 s: rod 157, SR 1.4e3–1.7e3. Ticked. +0.03 in ~27 plant-s. Prediction 225. su_s6_rel.png.
- **SU7 — "Take the fourth 1/M point, after a shorter pull."** Held 5.6 s; SR reached 3.0e3 at rod 196 (text 190–192). The rods move ~7 steps per wall-second at 10×, so reaction time overshoots. SUR +0.57 at release; it took ~3 plant-min to fall to +0.03. Prediction 211. su_s7_rel.png.
- **SU8 — "Take the final 1/M point…"** 4-step pull (196 → 200), SR 7.6e3. See S-5 for the timing. Plotted at ~6 plant-min: prediction 210. su_s8_rel.png, su_s8_done.png.
- **SU9 — "Block the source range trip at P-6."**
  - TRIP BLOCKS opens a drop-down over the PZR card. Only the SR HIGH FLUX BLOCK was enabled, and that row was ringed.
  - BLOCK → BLOCKED. SOURCE RANGE shows a dash. Closed with TRIP BLOCKS. Ticked.
  - su_s9_panel.png, su_s9_blocked.png.
- **SU10 — "Take the reactor critical and set STARTUP RATE between +0.3 and +1.0."**
  - **10a:** I computed 210 − 3 = 207 myself; the panel never prints 207. Pressed SLOW and held 47.7 s wall to 207, and 10a ticked. SLOW measured at ~1 step per 7.5 plant-s (text: 8).
  - **10b:** held 86.6 s to SUR +0.51 at rod 218 (8 past; text "about 12"). It settled to +0.37 and ticked a plant-minute later.
  - Glows: WITHDRAW, SLOW, STARTUP RATE, CONTROL ROD POSITION, PERIOD.
  - su_s10b_holding.png.
- **SU11 — "Level power at 1.0e-8 A and record the critical rod position."**
  - 11a: 1.0e-8 A at ~1.3 plant-min (text "about 2").
  - 11b: MED, INSERT 12 steps, 218 → 206. SUR -0.47 → -0.02, ticked 2 m 07 s after the last rod motion (see S-4).
  - 11c recorded itself: "Critical rod position recorded".
  - su_s11b_after.png.
- **SU12 — "Raise power to the point of adding heat, about 1 %."** See S-1: 14 taps, SUR +0.46, 12a+12b ticked by T+09:28:24 (power 3.6 %), 12c at T+09:29:01. I pressed 10× myself. Glows: WITHDRAW, SLOW, STARTUP RATE, CONTROL ROD POSITION. su_s12_start.png, su_s12a.png.
- **SU13 — "Put main feed in service and secure auxiliary feed."**
  - Power 4.7 %, so I typed 100 in the gpm box beside RESTORE. SG level 30 → 60 % in ~8 plant-min.
  - AUTO on SG FEED (it then reads HOLDING); STOP on AUX FEED WATER (it then reads STANDBY).
  - Glows moved from the SG FEED gpm box and FEED FLOW to the AFW STOP button.
  - su_s13_pre.png, su_s13b.png.
- **SU14 — "Raise power past 5 %…"** Already ticked (6.7 %) because of my step-12 overshoot.
- **SU15 — "Put the turbine on line…"**
  - LATCH, then LOAD 10. OUTPUT >8 MW in ~1.5 plant-min.
  - AUTO on STEAM DUMP again changed the status PRESS → TAVG.
  - Glow on the status word "PRESS".
  - su_s15c_pre.png.
- **SU16 — "Block the first startup trip, IR HIGH FLUX."** Waited ~50 s at 1× until power >9.5 %, then BLOCK. Ticked first try. See S-3. su_s16_blocked.png.
- **SU17 — "Block the second startup trip, PR HIGH (LOW SETPT)."** BLOCK. Ticked. su_s17_blocked.png.
- **SU18 — "Verify the plant is in Mode 1, At Power."** Pre-ticked. Complete. su_end.png.

### pwr_raise_power
- **RP1–RP2** — pre-ticked.
- **RP3 — "Start the boron dilution…"** Typed 660. Ticked.
- **RP4 — "…30 MWe, load leading and rods following."**
  - LOAD 30 (auto 10×). OUTPUT 30 MW in ~3.5 plant-min; Tavg sagged 548 → 535.
  - Four 5-step MED pulls a plant-minute apart: 542, 546, 550, 554, and 4c ticked. 20 steps (text 20–25).
  - The green segment on the Tavg strip is ~3 px tall: rp_tavg_zoom.png.
  - Glows: REACTOR POWER and Tavg tiles, ROD CONTROL, WITHDRAW, MED, LOAD box. rp_s4b.png.
- **RP5 — "…50 MWe the same way."**
  - Unexplained 10× → 1× drop with a PZR Pressure Low warning (S-7).
  - 20 steps: 545 → 559 °F, ticked T+10:02:22.
  - The background mentions xenon.
  - rp_s5b.png.
- **RP6 — "…75 MWe the same way."** The two Control Rods insertion-limit alarms came in, as the text announced. 25 steps (text "about 30"). Ticked at 570 °F. rp_s6c.png.
- **RP7 — "…90 MWe with a smaller pull."** Only 5 steps needed (text 15–20), because I had left Tavg at 570. rp_s7c.png.
- **RP8 — "…full load and settle the temperature on 578 °F."**
  - 14 steps; ticked at 575 °F ("near 578" band 573–583).
  - Pulls 2–3 were slow and the last gained only 4 steps. That is consistent with the 103 % rod stop the text warns of: power read 102.0–102.2 %, and I never saw 103.
  - rp_s8c.png.
- **RP9 — "Confirm full power, with the boron dilution done."** The step fast-forwarded itself at 5×, with a clear status line. BORON 665 → 663 ppm; ticked T+10:32:41. Power held at 101.4–101.8 %. rp_s9_end.png, rp_end.png.

### pwr_lower_power
- **LP1 — "Start adding boron…"** Typed 719. Ticked.
- **LP2 — "Take the first load off…"** LOAD 95/90/85/80/75, a plant-minute apart. Tavg after each cut 580–582 (>577), so I inserted 3 at MED each time. Peak 582 °F (<587). Ticked. Duplicated sentence (S-11). lp_s2.png.
- **LP3 — "Bring AVG COOLANT TEMPERATURE back into its band…"** One 3-step insert → 576. Ticked. (Text "10 to 20 steps"; my step-2 inserts had done most of it.)
- **LP4 — "…50 MWe…"** 21 steps (text 20–30). Ticked at 566 °F. lp_s4_end.png.
- **LP5 — "…30 MWe…"** 15 steps (text "about 20"). Ticked at 559 °F.
- **LP6 — "…15 MWe…"** 15 steps (text 10–15). Ticked at 554 °F, power 12.5 %. lp_end.png.

### pwr_shutdown
- **SD1 — "Take the load off the generator before the scram."** LOAD 0: OUTPUT 15 → 1 MW in ~10 plant-s. Power stayed 13 % with no load; the text does not say where that heat goes. sd_s1_done.png.
- **SD2 — "Shut the reactor down."**
  - SCRAM once: it then read "CONFIRM / PRESS AGAIN TO TRIP". Again: "SCRAMMED / PRESS TO RESET".
  - Rods 0/0, power 1 % and falling. Ticked in ~12 plant-s. No "tripped" banner, which is correct for a planned trip.
  - Glows moved from the SCRAM button to the power tile and rod readouts.
  - sd_s2_armed.png, sd_s2_done.png.
- **SD3 — "Put the decay heat on the steam dump…"** One AUTO press: TAVG → PRESS. STEAM PRESS 1017. Ticked. sd_end.png.

### pwr_cooldown
- **CD1 — "Add the boron a cold core needs…"** Typed 920; auto 600×. 880 ppm after ~62 plant-min. See S-9.
- **CD2 — "Bring pressure under the point where the low-pressure protection can be blocked."** SET PZR PRESSURE 1900: PORV OPEN, 2237 → 1966 psi in ~10 plant-s, PORV CLOSED. Ticked. cd_s2_mid.png.
- **CD3 — "Block the protection that would read the cooldown as a leak."**
  - The panel header explains that three blocks were "RELEASED BY THE PLANT".
  - Blocked PZR PRESS LO-LO and SI REACTOR TRIP, then pressed ECCS STOP. Ticked.
  - Glows on the rows and on ECCS STOP.
  - cd_s3c_pre.png.
- **CD4 — "Cool the plant on the steam dump to where RHR can take over."**
  - 37 DUMP SETPOINT entries, 6 plant-min apart: 1020 → 720 in 50s, → 270 in 25s, → 120 in 15s.
  - Auto 60×. The cooldown rate stayed -19 to -85 °F/hr.
  - Low Coolant Temperature and Shutdown Cooling Not In Service alarms came as promised. Ticked at Tavg 346 °F, T+15:48:21 (~3 h 40 plant-min; text "about three and a half hours").
  - Pressure sat at ~1900 psi throughout.
  - cd_s4b/c1/c2/d.png.
- **CD5 — "Take the pressure setpoint to the bottom of its range."** 1700: ticked in 2 plant-s. The promised PORV lift did not happen (S-10).
- **CD6 — "Hand pressure control from the heaters to the spray."**
  - HEATER OFF; 50 in the SPRAY box, then SPRAY MANUAL. <1615 psi in ~40 plant-s.
  - I pressed 5× myself.
  - Glows: PZR card, SPRAY MANUAL, the SPRAY box. Old alarms were turned grey as "— expected, plant depressurized".
  - cd_s6b.png.
- **CD7 — "Isolate the accumulators while pressure is inside their window."** Clicked the same valve symbol: ISOLATED. Ticked. cd_s7_zoom.png.
- **CD8 — "Bring pressure under the RHR limit on the spray."** 1277 → 399 psi in ~10.5 plant-min at the auto 60×. PZR level flat at 26 % (S-10).
- **CD9 — "Put RHR in service as the cooldown loop."** ALIGN; HX SPLIT 7. Ticked. Glows: RHR card, ALIGN, the HX SPLIT box. cd_s9a.png.
- **CD10 — "Take the reactor coolant pumps off…"** RCP OFF; coast-down ticked ~11 s later.
- **CD11 — "Cool on RHR into Mode 5, inside the 100 °F per hour limit."**
  - HX SPLIT 9; auto 60×.
  - SUBCOOLING MARGIN 92 → 30 over ~29 plant-min (about 1 °F per 45 plant-s, easy to watch). 11b ticked at 32.
  - SPRAY OFF at 29 °F: 11c ticked; auto 600×.
  - Tavg <199 °F at T+18:23:09. The cooldown rate peaked at -85 °F/hr.
  - cd_s11c.png, cd_s11_done.png.
- **CD12–CD15** — pre-ticked.
- **CD16 — "Leave the plant lined up for the next heatup."** SCRAM reset (one press, to "PRESS TO ARM"), STEAM DUMP CLOSE, DUMP SETPOINT 1020. Complete. cd_end.png.

### pwr_startup, second pass (fresh preset)
- **Steps 1–3:** pre-ticked (719 ppm preset; the step-2 note "The Hot Standby preset starts at 719 ppm, so the step ticks at once" was right).
- **Step 4:** baseline plotted.
- **Step 5:** see S-2. Released at rod 68; ticked only after 4 taps, at rod 72 (T+00:58). Prediction 232.
- **Step 6:** rod 153, ticked in 32 plant-s. Prediction 230.
- **Step 7:** stopped at 192 (SR 2.8e3). Ticked 28 plant-s later at SR 3.4e3. SUR +0.03 after ~2 plant-min. Prediction 221.
- **Step 8:** stopped at 205 (SR 6.1e3). Ticked 32 plant-s later. SUR +0.03 at ~6 plant-min, which matches the text. Prediction 209.
- **Step 9:** blocked.
- **Step 10:** 10a at rod 206; 10b released at rod 218, SUR +0.51. Ticked.
- **Step 11:** 12 in (218 → 206). SUR -0.01 two minutes later. Ticked; critical position 206 against prediction 209.
- **Step 12:** see S-1. Six taps (as the text predicts). +0.15 at the one-minute read, but the tick came at 116 plant-s. 12b (power ≥1 %) took ~25 plant-min, within the stated "20 to 26". su2_s12_done.png.

---

## 4. Words and numbers I could not find on the board

| The walkthrough said | What is actually on the board |
|---|---|
| "the accumulator valve" (HU10, CD7) | An unlabeled round valve symbol above the ACCUMULATORS tile. It is named only by the scanner on hover ("Accumulator Isolation Valve"). The text's location hint and the ring were what found it. |
| "the % beside the STEAM DUMP valve on the diagram" (HU6) | An unlabeled valve symbol with "0 %" beside it, top centre of the diagram. No "STEAM DUMP" label near it; found by its ring. |
| "the ACCUMULATORS caution is expected" (HU10) | The alarm is titled "Accumulators Still Lined Up — RCS Below Their Isolation Pressure". |
| "Pressure Relief Valve Open comes in" (CD2, CD5) | Only the diagram label "PORV OPEN" / "PORV CLOSED". I never saw an alarm with that title, and in CD5 the PORV never opened. |
| "Press SCRAM … once to arm it (PRESS TO ARM)" (SD2) | Before the press the button reads "SCRAM / PRESS TO ARM"; after it, "CONFIRM / PRESS AGAIN TO TRIP". It matched, but the second label is not in the text. |
| "TRIP is a lamp to read here, not a button" (HU4) | TRIP is drawn identically to the LATCH and UNLOAD buttons beside it. |
| "The thin strip under the AVG COOLANT TEMPERATURE reading has a short green segment" (RP4) | A ~3 px tall bar with a white marker; the green piece is barely visible at normal size (rp_tavg_zoom.png). |
| "3 steps short of the predicted position" (SU10a) | The panel never prints the target (207 / 206). The player has to subtract from the 1/M pop-up's "predicted criticality ≈ step N". |
| "BORON STATUS … MIXING" (SU2) | I never saw MIXING (4 s polls at 600×). I saw DILUTING → HOLD. |
| "Do not start cooling until BORON STATUS reads BORATING" (CD1) | BORATING shows from the first second; the step waits ~62 plant-min more for BORON CHEM ≥ 880. |
| "At 50 gpm level reaches 60 % in about 10 plant-minutes while REACTOR POWER drifts up to about 2½ %" (SU13) | Correct for a gentle climb. After my overshoot power was already 4.7 %, which put me on the "100 gpm" branch. |
| "The rods stop about 12 steps past the prediction mark" (SU10b) | Measured 8 (run 1) and 9 (run 2) past. |
| "STARTUP RATE takes about 5½ to 6½ plant-minutes to reach +0.03 here" (SU8) | Run 1 (4-step pull): 1.5 plant-min. Run 2 (full pull): ~6 plant-min. |
| "It gets there about 2 plant-minutes after the rods stopped in step 10" (SU11a) | Measured ~1.3 plant-min (run 1). |
| "Mode 1, At Power" | No mode readout on the board (RP1 itself says so). |
| "Walkthrough sets time warp" / "Suggested time warp: 10×" | Applied automatically on some steps and not others (S-7). |
| "about 12 %" power at 15 MWe (LP6) | 12.5 % — matches. |

---

## 5. What the text got right

- Every card, button and box name used in the text is printed on the board, except the two unlabeled valve symbols.
- The glow rings pointed at the correct card, button, box or diagram symbol for every lettered substep I checked, and moved as substeps ticked.
- Where-to-look notes for unlabeled things ("just above the ACCUMULATORS tile, to the left of ECCS INJ FLOW") worked.
- Predicted times matched:
  - shutdown bank ~9 plant-min,
  - dilution ~2 plant-h and boration ~65 plant-min,
  - cooldown step 4 ~3½ h,
  - CD8 10–13 plant-min,
  - SU12b 20–26 plant-min (second pass).
- Predicted rod positions matched on a fresh core: 75–80 (76), 150–155 (153), 205 (205). So did the stage step counts in raise-power (20–25, about 30, 10–20) and lower-power (20–30, 10–15).
- Every alarm the text called "expected" was named in the text before it arrived: Shutdown Cooling Not In Service, PZR Pressure Low/Very Low, Turbine Trip / Low Steam Demand, both Control Rods insertion-limit alarms, Low Coolant Temperature.
- The reactor-trip handling in the walkthrough was clear: a red banner, "Dropped to real time — reactor trip", and Rewind step that works as documented.
- The "Held at real time — the plant needs you here" banner at the 665 psi accumulator window, and RP9's self-fast-forward status line, told me exactly what the clock was doing.
- The trip-blocks panel explains itself ("1 AVAILABLE TO BLOCK NOW · 4 WAITING ON ITS PERMISSIVE", "RELEASED BY THE PLANT — reactor power fell below …"). Only the permitted row's BLOCK is enabled.
- The SCRAM arm/confirm, the AUTO steam dump PRESS/TAVG status word, and the "Critical rod position recorded" self-check all matched the text.
- The chain hand-off ("Next: …") kept one continuous plant across all six legs with no reload.
- The cooldown kept COOLDOWN RATE under 100 °F/hr on the text's pacing (peak -85 °F/hr), and the subcooling watch in CD11 was slow enough to follow at 60×.
- Explanations of terms in the text itself: DPM ("1.0 means power grows tenfold every minute"), "IR is INTER RANGE", "PR is POWER RANGE; LOW SETPT is its low setpoint", "MED is the middle rod speed … 48 steps a minute", the shorthand "7.0e2 is 700 counts a second".
