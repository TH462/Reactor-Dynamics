> **Record, not policy.** Layman pass 14, 2026-09-28, `pwr_startup` (Mode 3 to Mode 1) only, on develop
> `c27556f5` (Alpha 1.8.0-rc9 + #809). 18 of 18 steps, no strand. Stuck points: S-1 step 14's +0.10 cue
> never fired; S-2 WITHDRAW pulsed beside a lit Continue (10, 14); S-3 the 1/M PLOT pulse came before the
> +0.03 wait; S-4 10× hold overshoot at 7/8; S-5 a standing "WILL TRIP THE REACTOR NOW" row; S-6 the 1/M
> window covers more than the note said; S-7 an unexplained "→ 8×" chip.
> **Coordinator verification (same day):** every S-n below carries its Measured/Verdict line. Refuted or
> narrowed with the number: S-1's "never exceeded +0.07" is the TILE the reviewer read; the full-stack
> route reads a 0.13 to 0.15 peak 15 s after a 2-step pull that is back to 0.06 by 30 s, so a reader who
> waits out each pull never sees it (the cue was the defect, not the plant). S-2's cause is not the
> held-button rule: "every row met = pulse nothing" was scoped to steps with per-substep lists, and 10 and
> 14 author theirs at step level. S-7 is the achieved-rate readout (#581/#625), explained only in its
> tooltip. Fixed on develop: S-1, S-2, S-3, S-5 (text), S-6; S-4 by the owner's 2026-09-28 ruling (D).

# Layman playthrough: pwr_startup (Mode 3 to Mode 1)
Build: Alpha 1.8.0-rc9 + #809 (develop c27556f5). Headless Edge, 1600x1000. Wall time about 50 min; plant time T+00:00 to T+01:37:35.
Shots are in `shots/`. Every board number below was read off the screen during the run.

## 1. Outcome

| Leg | Result | Steps completed | The one thing that mattered |
|---|---|---|---|
| pwr_startup | **COMPLETE**: "Walkthrough complete", 10.8 %, OUTPUT 10 MW, SR/IR/PR trips BLOCKED | 18 / 18 | The 1/M plus STARTUP RATE loop was followable from the text alone: predictions 278, 232, 213, 209; critical at 206. The worst friction was step 14's "peak and fall back to +0.10" (the peak never went above +0.07) and pulses that stay on or come on early. |

Nothing stranded me. Every Continue lit. I never had to do anything the text did not say to make a step pass. The one exception is closing the 1/M window by its ✕, and the step 4 note tells you to do that.

## 2. Stuck points, ranked

**S-1: Step 14: the wait condition is already met, so the player has no trigger to act on.**
Text: "Tap WITHDRAW twice (2 steps). STARTUP RATE rises for a while after the taps: wait for it to peak and fall back to +0.10 or less. Repeat until REACTOR POWER reads above 5 %." Note: "Expect about 5 pulls and 5 plant-minutes."
What I did: SLOW, 5×, two taps (212→214). STARTUP RATE peaked at **+0.06**, then +0.07 and +0.05 on the later pulls. It never got above +0.10, so "fall back to +0.10 or less" was true the whole time. I waited for it to visibly peak and decay, about 7 plant-minutes per pull. It took **3 pulls and 16 plant-minutes** (T+01:17:17 → 01:33:31), not "about 5 pulls and 5 plant-minutes". Power went 2.2 → 3.4 → 4.5 → 5.1 %.
What would have unstuck me: a trigger that actually happens, for example "wait until STARTUP RATE stops rising (about 2 plant-minutes), then pull again", plus a pull and minute count that matches.
**Measured:** `run_walkthrough_routes --job=pwr_startup:typical` with `WR_TRACE=14` (full stack, seed 42): after a 2-step SLOW pull STARTUP RATE reads 0.13 to 0.15 at +15 s and 0.04 to 0.06 by +30 to 45 s; a pull on the first decline stacks to 0.25 and 6 pulls in 1.5 plant-min, a pull every plant-minute gives **4 pulls, 3.42 plant-min** (pass-3 base 3.44, seed 7 4.00), 2 minutes gives 3 pulls, 5.3. The reviewer's tile never showed the peak (not verified whether the tile lags the graded channel).
**Verdict:** confirmed — the +0.10 cue has no event for a player who waits; 14a now says "then wait one plant-minute while STARTUP RATE rises and falls back", note "about 4 pulls and 3 to 4 plant-minutes"; route `#14` re-pointed to that player.

**S-2: WITHDRAW keeps pulsing after its row is ticked and Continue is lit (steps 10 and 14).**
Step 10b: "Hold WITHDRAW at SLOW until STARTUP RATE reads +0.5, then let go. A plant-minute later it should read +0.3 to +1.0: if lower, tap WITHDRAW once; if higher, tap INSERT once."
What I did: I held for 96 plant-seconds, 206→218, and let go at +0.50. It settled at +0.38 and 10a and 10b both show ✓ with "Step done — press Continue". The CONTROL WITHDRAW button **still carried the animated pulse** (`ckl-step-glow`, animation `cklGlow`; shot `10_after.png`). Same at the end of step 14: WITHDRAW was still pulsing with the step done. In step 10 a pulsing WITHDRAW reads as "tap once more", which pushes STARTUP RATE toward the 1.0 limit.
What would have unstuck me: the pulse going out when the step's rows are all ticked (the #809 quality pass says "no pulse when every row is met", but that does not hold for this button here).
**Measured:** built pool: startup 10 and 14 author `hl` at STEP level (no substep lists), and `cklSubstepHl` returned "pulse nothing" only when a substep authored a list, so all-rows-met fell back to the step `hl` (Withdraw). New `verify_e2e_ui` probe step (step-level `hl`, one always-met row): WITHDRAW reads `pulse` on the old code, `none` on the fix.
**Verdict:** narrowed — the observation stands; the cause is the scope of the pass-13 rule, not the held-button rule. Fixed: every row met pulses nothing on any `accs` step.

**S-3: The 1/M PLOT pulse comes on before the "Wait for STARTUP RATE +0.03" part is met (steps 5b to 8b).**
Text, 7b: "Wait for STARTUP RATE to read +0.03 or less, then press 1/M PLOT, then Plot point." The step 7 background: "a point plotted then puts the predicted crossing too far out."
What I did: as soon as 7a ticked, 1/M PLOT started pulsing while STARTUP RATE read **+0.05 to +0.07**. It took another ~2 plant-minutes to reach +0.02. In step 8 it pulsed at +0.07 and took ~2.5 plant-minutes more. I ignored the pulse and followed the words. A player who follows the glow plots early.
What would have unstuck me: hold the 1/M PLOT pulse until STARTUP RATE reads +0.03 or less, or pulse the STARTUP RATE tile while waiting.
**Measured:** typical route seed 42, `WR_TRACE=5,6,7,8`: the pull row ticks at STARTUP RATE 0.006 (5a) and 0.031 (6a), but 0.109 (7a, +0.03 reached 1.5 plant-min later) and 0.179 (8a, 6 plant-min later); pass-3 base 0.32 / 0.13.
**Verdict:** confirmed for 7 and 8. Fixed display-only: new `accs[].hl_when` on 5b-8b keeps the plot pulse dark until STARTUP RATE reads under +0.035 (the tile's "+0.03"), latched; the rate tile stays ringed. Grading unchanged.

**S-4: Holding WITHDRAW at 10× (auto-warp) overshoots the narrow windows.**
7a: "On a fresh core at 719 ppm this lands near CONTROL ROD POSITION 190 to 192." 8a: "Do not hold past 205."
What I did: the walkthrough jumps to 10× the moment rods move. At MED that is about 3 steps per 0.3 s of wall time. Releasing on sight of 3.0e3 landed me at **195**, 3 past the window. In step 8 I stopped at 204 only because I let go early, at 203. No harm here: predictions still converged (213 → 209, critical at 206). But a layman cannot hit a 2-step window at 10×.
What would have unstuck me: keep 1× while the rods move in steps 7 and 8 (step 10 already does this), or tell me to tap the last few steps.
**Measured:** MED is 0.8 steps a plant-second (`ROD_SPEEDS`); a release 0.5 wall-s late lands 4 steps past at 10×, 2 at 5×. Typical route, step 8 pulled to: 205 completes; 207 completes (rho +0.3 pcm); **208 and 209 trip on SR HIGH FLUX inside step 8**.
**Verdict:** confirmed. OWNER RULING 2026-09-28 (option D): "In step 8 5x while the rods move." Built as `moving_speed: 5` on step 8 only; steps 5-7 unchanged at 10× (his 2026-09-25 ruling).

**S-5: The TRIP BLOCKS panel shows a frightening line the text never mentions (steps 16 and 17).**
On-screen, SR HIGH FLUX row: "RELEASING THIS WILL TRIP THE REACTOR NOW — the setpoint is crossed. Releasing takes two presses. RELEASE?"
What I did: I left it alone and pressed BLOCK on the pulsing row. A layman may read "WILL TRIP THE REACTOR NOW" as an alarm about the current state.
What would have unstuck me: one sentence in step 16: "The SR HIGH FLUX row warns that releasing it would trip the reactor. Leave it blocked."
**Measured:** `pwr_board_wiring.js` draws RELEASE? plus the warning whenever a row is BLOCKED and its trip is asserted; SR HIGH FLUX is asserted at power, so it stands on an untouched row from the moment counts pass the setpoint, and `run_pwr2_board` pins exactly that (`srRow.will_trip && text === "RELEASE?"`). The warning is true: releasing it at power trips the reactor.
**Verdict:** confirmed, not a defect (#598 item 15, "Warn + confirm, keep it legal"). 16b now carries the one line; softening the board wording is left as an owner option.

**S-6: The 1/M window covers more than the note says.**
Step 4 note: "The 1/M PLOT window covers STEAM GENERATOR LEVEL." It also covers PRESSURIZER LEVEL, the STEAM DUMP card, the TURBINE-GENERATOR card, the pause/play button, and the left edge of the right-hand panel. The "Instructor" tab and walkthrough title get clipped (`04_1m_open.png`). Following the note, I closed it with ✕ each time. Minor.
**Measured:** shot `04_1m_open.png` at 1600x1000: the window covers SG LEVEL, the right edge of PZR LEVEL, the steam dump and turbine cards and the pause button.
**Verdict:** confirmed. 4a note: "covers the upper right of the board, STEAM GENERATOR LEVEL and the pause button included". Window position untouched (#713).

**S-7: An unexplained "→ 8×" in the speed bar (step 13).**
Right after I typed 50 gpm and pressed 10×, an orange "→ 8×" chip appeared beside 3600× (`13_typed.png`). `#warpInfo` was empty. What I saw: the bar said 10× selected and "→ 8×" next to it, with no reason given. It was gone ~30 s later.
**Measured:** not measured in a browser. Code read: `#ffRate` is the achieved-rate readout (`syncPacingUI`, #581/#625), amber when achieved < 90 % of the request, EMA 0.3 per timer tick; its reason is in its tooltip only. A 30 s "→ 8×" is the page achieving ~8× of 10×, plausibly the headless driver's screenshots.
**Verdict:** narrowed, not filed as a defect — a real indication, explained only on hover. Whether #warpInfo should name it is an owner call (see the #809 comment).

Minor, did not stop me:
- The MED pulse in step 5 and the SLOW pulse in step 14 are on buttons that are already lit. It is harmless because the text says "Press".
- Step 2 shows "Suggested time warp: 600×" on a step that ticks instantly from the preset.
- In step 11, INTER RANGE drifted to 9.0e-9 A after leveling. The step title says "Level power at 1.0e-8 A". It ticked anyway.

## 3. Per-step log

| Step | First sentence | What I did | Time to satisfy | Continue | Glows seen |
|---|---|---|---|---|---|
| 1 | "Verify the plant is in Hot Standby (Mode 3)." | Read the 5 tiles: 547 °F, 2235 psi, RCP FLOW 100 %, +0.01 DPM, 627/627 | instant | lit | still halos on the 5 named tiles (`01_start`) |
| 2 | "Dilute boron to the estimated critical concentration, 719 ppm." | nothing; preset already 719, HOLD | instant | lit | still watch halos on BORON (`02_step2`) |
| 3 | "Line up the steam generator (SG) before taking the reactor critical." | checked AFW RUNNING, STEAM DUMP AUTO, 1020 psi | instant | lit | still card glow on STEAM DUMP, check-glow on DUMP SETPOINT, watch on SG LEVEL (`03_step3`) |
| 4 | "Take the 1/M baseline point before any rod moves." | 1/M PLOT → Plot point → ✕ | ~10 s | lit | ROD CONTROL card still glow; **pulse on 1/M PLOT**, then the pulse moved to **Plot point** in the window. Right target each time. (`04_1m_open`, `04_plotted`) |
| 5 | "Take the second 1/M point, after the first rod pull." | held CONTROL WITHDRAW 10.6 s wall (auto 10×), 0→75; released when SR showed 7.4e2; SR then flickered 6.3e2–7.2e2 and 5a ticked; SUR +0.00 → 1/M PLOT, Plot point. Prediction **278** | ~4 plant-min | lit | pulses on WITHDRAW and MED (MED already lit). While held, WITHDRAW shows amber pressed with a still halo, not a pulse. After 5a, 1/M PLOT pulse, then Plot point (`05_holding`, `05_plot2`) |
| 6 | "Take the third 1/M point." | held 11.4 s, 75→157, SR 1.4e3; SUR ≤0.03 about 40 plant-s later; plotted. Prediction **232** | ~3.5 plant-min | lit | same pattern; the 1/M PLOT pulse came on as 6a ticked (`06_holding`, `06_plot3`) |
| 7 | "Take the fourth 1/M point, after a shorter pull." | held 5.6 s, 157→**195** (window 190–192, S-4); SUR +0.05 when the 1/M pulse lit (S-3); waited to +0.02; plotted. Prediction **213** | ~4.5 plant-min | lit | the pulse came early (S-3) (`07_holding`, `07_plot4`) |
| 8 | "Take the final 1/M point, the one the approach to critical is built on." | held 1.5 s, 195→204, SR 7.0e3; SUR to +0.03 in ~4.7 plant-min; plotted. Prediction **209** | ~5 plant-min | lit | the pulse came early again (`08_holding`, `08_plot5`) |
| 9 | "Block the source range trip at P-6." | TRIP BLOCKS → BLOCK on the SR HIGH FLUX row → BLOCKED, SR dash → TRIP BLOCKS to close | ~20 s | lit | pulse on TRIP BLOCKS, then on the SR HIGH FLUX row inside the panel. Correct (`09_tripblocks`, `09_blocked`) |
| 10 | "Take the reactor critical and set STARTUP RATE between +0.3 and +1.0." | SLOW; held WITHDRAW 204→206 (3 short of 209); held again 96 plant-s, 206→218, released at +0.50; settled +0.38 | ~3.5 plant-min | lit | pulses on WITHDRAW and SLOW; **WITHDRAW still pulsing after both rows ticked (S-2)** (`10_holdingA`, `10_holdingB`, `10_after`) |
| 11 | "Level power at 1.0e-8 A and record the critical rod position." | waited for IR 1.0e-8 (~20 plant-s); MED, held INSERT 218→206 (15 s); 10× wait; SUR settled −0.02, ticked. Critical **206** vs predicted **209** | ~3 plant-min | lit | pulses on INSERT and MED; 11c ticked by itself (`11_*`) |
| 12 | "Raise power to the point of adding heat, about 1 %." | SLOW, 10×, tapped WITHDRAW every ~75 plant-s: +0.00, +0.03, +0.06, +0.08, +0.11, +0.15. **6 taps**, 206→212 (text: "6 or 7"). Auto 60×; 1.0 % after **25 plant-min** (text: "20 to 26"); 12c ticked with it | ~35 plant-min | lit | pulses on WITHDRAW and SLOW; later still halos on REACTOR POWER and INTER RANGE (`12_taps`, `12_done`) |
| 13 | "Put main feed in service and secure auxiliary feed." | power 1.0 % → typed 50 + Enter in the gpm box by RESTORE; 10×; SG 35→60 % in **~9 plant-min** (power 2.2 %); SG FEED AUTO (reads HOLDING); AFW STOP → STANDBY | ~9.5 plant-min | lit | pulse on the gpm box, then SG FEED AUTO, then AFW STOP. Each pulse was on the lettered substep's control. Unexplained "→ 8×" (S-7) (`13_typed`, `13_sg60`, `13_auto`, `13_afwstop`) |
| 14 | "Raise power past 5 %, into Mode 1, At Power." | SLOW, 5×, 3 pairs of taps 212→218; SUR peaks only +0.05–0.07 (S-1); 5.1 % | **16 plant-min** | lit | pulses on WITHDRAW and SLOW (already lit); WITHDRAW still pulsing with the step done (`14_done`) |
| 15 | "Put the turbine on line and let the reactor follow it up." | LATCH; typed 10 in LOAD + Enter; 10×; OUTPUT 9 MW in ~1 plant-min; STEAM DUMP AUTO → TAVG | ~2 plant-min | lit | pulse on LATCH, then LOAD box, then STEAM DUMP AUTO (`15_*`) |
| 16 | "Block the first startup trip, IR HIGH FLUX." | 1× wait: 6.5 → 9.7 % in ~60 plant-s; TRIP BLOCKS → BLOCK on IR HIGH FLUX → BLOCKED | ~1.2 plant-min | lit | halo on REACTOR POWER, then TRIP BLOCKS pulse, then IR row pulse. Saw the "RELEASING THIS WILL TRIP THE REACTOR NOW" line (S-5) (`16_95`, `16_irblocked`) |
| 17 | "Block the second startup trip, PR HIGH (LOW SETPT)." | TRIP BLOCKS → BLOCK on the PR row → both BLOCKED → TRIP BLOCKS to close | ~15 s | lit | TRIP BLOCKS pulse, then PR row pulse (`17_prblocked`) |
| 18 | "Verify the plant is in Mode 1, At Power." | read 10.3 % and OUTPUT 10 MW | instant | lit | still halos on REACTOR POWER and OUTPUT; end card "Walkthrough complete" (`18_step18`, `19_end`) |

**Did the glow point me at the right card and button for the lettered substep?** Yes, every time. The card glow is still, the watched tile gets a still halo, and the control to press gets an animated pulse. The pulse moved from the board button to the pop-up button (1/M PLOT → Plot point, TRIP BLOCKS → row) correctly.

**Did a repeatedly pressed button keep telling me to press it?** For taps (steps 12 and 14), WITHDRAW pulsed between taps. That is good, but it also kept pulsing once the step was done (S-2). While WITHDRAW or INSERT is held, it shows a still amber pressed state, not a pulse.

## 4. Words and numbers I could not find on the board

| Word / number in text | Where | What the board had |
|---|---|---|
| "a dash" (SOURCE RANGE after the block) | 9b | a small rounded-box dash glyph. Findable, but it looks like an empty pill rather than "—" |
| "P-6 PERMISSIVE" | 9 background | only inside the TRIP BLOCKS panel row text "(P-6 PERMISSIVE)", not as a board light |
| "→ 8×" | speed bar, step 13 | shown with no explanation (S-7) |
| everything else (1/M PLOT, Plot point, TRIP BLOCKS, BLOCK, gpm box beside RESTORE, LATCH, LOAD, STEAM DUMP TAVG, AUX FEED WATER STANDBY, SG FEED HOLDING) | | found by its exact words on the first try |

## 5. What the text got right
- Reading 7.0e2, 1.4e3 and 7.0e3 as counts per second was explained once (step 4) and was enough.
- The rod-position landing hints (70–80, 150–155, ~205) matched: 75, 157, 204.
- "Expect 6 or 7 taps" in step 12 was exact (6).
- "About 20 to 26 plant-minutes" to reach 1 % was exact (25).
- "The rods stop about 12 steps past where 10a let go" was exact (206→218).
- "About 12 steps" of INSERT in 11b left STARTUP RATE at −0.02, right on the edge, and it ticked.
- The step 13 manual-then-AUTO feed order worked smoothly: level 60 % in ~9 plant-min, power drifted to 2.2 %.
- Step 16's warning that the 9½ % permissive wanders was clear, and the auto-arriving value made it a non-issue.
- Step 17's "any click outside the panel closes it" explained why the panel was shut.
- The "Suggested time warp" lines plus the auto-warp made the long waits painless, and the speed returned to 1× on each tick.
