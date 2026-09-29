> **Record, not policy.** Layman pass 5 on `pwr_startup` only (Mode 3, Hot Standby -> Mode 1, At
> Power), 2026-09-25, develop 6d9c8230, the first pass on the what / why / how step shape. 17 of 17
> steps, no rewind, no trip, nothing done that the text did not say; the italic why line helped
> on 15 of 17. Stuck points: none blocking. Verification pass by the coordinator the same day:
> S-4 refuted (the panel reads the tile's own channel, at a different moment); S-6/S-7 not
> measured and not filed; S-10 confirmed and fixed (the board printed "10.0e-5"); the rest
> confirmed or narrowed, with their numbers inline.

# Layman playthrough: pwr_startup (Mode 3, Hot Standby to Mode 1, At Power)

Build under test: develop 6d9c8230 (page header reads `Alpha 1.8.0-rc5`, TEST BUILD).
Persona: intelligent layman, screen only. Page: `ui/shell.html?engine=pwr2`, headless Edge 1600x1000.
Started from Main Menu > Walkthroughs > `▶ Start` on "Mode 3, Hot Standby → Mode 1, At Power — startup to power".
Plant clock at finish: T+02:16:31. Wall time roughly 45 minutes.

Setup note (not the walkthrough's fault): on first contact the page was about:blank; I navigated to the URL.
The Main Menu window was then already open on load (the `missionOverlay` intercepted the click on
`#mainMenuBtn`), contrary to the brief's "it is NOT open on load".

## 1. Outcome

| Leg | Result | Steps completed | The one thing that mattered |
|---|---|---|---|
| pwr_startup | **COMPLETE** — "Walkthrough complete. Reactor critical in Mode 1, At Power, OUTPUT 10 MWe, IR HIGH FLUX and PR HIGH (LOW SETPT) both switched off." | 17 / 17 | The step 9 "reading the rate" bullet list is what made going critical doable: the first tap landed at +0.06 DPM, which the list calls "fine", and the check-off agreed. Nothing blocked me; every problem below is friction, not a wall. |

No step needed an action the text did not describe. No rewinds, no trips.

## 2. Stuck points, ranked by severity

None stopped me. These are ranked by how likely they are to stop or mislead a different layman.

**S-1. Step 9: the speed changed by itself between 9a and 9b, against the text's "1× before every tap".**
- **Measured:** Code read, ui/app.js cklActionPending: the "speed the wait, not the action" gate is STEP-level (`st.cmd` + `cmd_seen`). Step 9's `cmd` is `rod_nudge`, already seen during 9a, so 9b opens onto its 10x rung before the tap. Reviewer: ~13 plant-min elapsed before the tap, consistent with 10x.
- **Verdict:** confirmed, narrowed: not a clock fault; the gate cannot see a second action inside the same step.
- Step text: "9b · Tap WITHDRAW one step, wait about five plant-minutes, and read STARTUP RATE. … Suggested time warp: 10× while you wait; 1× before every tap."
- What I did: 9a ticked at T+00:16:47 with the speed at 1×. About a minute or two of wall time later, when I came to tap, the clock read T+00:30:03: about 13 plant-minutes had passed. That rate is consistent with 10×, but I set no speed. `#warpInfo` was empty. From step 10 on I SAW the same thing each time. When a step opened, the speed bar lit its suggested speed by itself (step 10 opened at 10×, step 11 at 5×, step 12 at 10×), and when a step was done it dropped back to 1× by itself (09b, 10b, 11, 12b, 13b and 14b all ended at 1×). At step 9 this means the plant sat at 10× before my first tap. A player who reads "1× before every tap", taps without looking at the bar, and then waits "about five plant-minutes" at what they think is 1× is in a different time frame from the one the text describes.
- What would have unstuck me: one line in the panel or `#warpInfo`, such as "The walkthrough set the speed to 10×", whenever it changes the speed.

**S-2. Step 9: "PERIOD" and "DPM" are used as steering instruments but never defined.**
- **Measured:** Built pool `RD.MANUAL_PROCEDURES.pwr2` pwr_startup: PERIOD appears in step 9 note and step 10 why, defined nowhere; DPM only in 1d's ask, never spelled out; "decades" in step 10 why/note, undefined.
- **Verdict:** confirmed.
- Step text: "Near 0.01, with PERIOD in the thousands of seconds…", "Around 0.15, with PERIOD 150 to 200 seconds…", "Around 0.5, or PERIOD under 60 seconds…". Step 10: "STARTUP RATE, PERIOD and INTER RANGE are the instruments to steer on".
- What I did: found PERIOD on the NIS card (it read `−7499 s`, `∞ s`, `959 s`, `434 s`, `446 s` at various times; it was negative at the start). Nothing tells me what PERIOD is or why it is negative or infinite. I steered on STARTUP RATE alone. The tile reads "+0.06 DPM" and the text only ever says "+0.06": DPM is never expanded, although step 8's background ("1.0 means power multiplies by ten every minute") gives its meaning.
- What would have unstuck me: one sentence in step 8 or 9 background: "PERIOD is the seconds it takes power to grow by e (about 2.7×); smaller means faster; ∞ means steady", and "DPM = decades per minute".

**S-3. Step 16: "PR" is never expanded, although "IR" is.**
- **Measured:** Built pool: "PR HIGH (LOW SETPT)" in step 16 text/ask and 17 note; PR and SETPT expanded nowhere (IR is, step 15).
- **Verdict:** confirmed.
- Step text: "16. Block the second startup trip, PR HIGH (LOW SETPT)." Step 15 helpfully says "(IR is INTER RANGE)". Nothing says PR is "power range", or what "LOW SETPT" means, or links PR to the REACTOR POWER tile.
- What I did: pressed the row by its exact label, and that worked.
- What would have unstuck me: "(PR is POWER RANGE, the detector behind REACTOR POWER; LOW SETPT means its low setting, 35 %)".

**S-4. Numbers on the 1/M panel do not match the SOURCE RANGE tile.**
- **Measured:** layers/instructor_layer.js sample(): the panel plots `instruments.source_range`, the channel the tile draws, at the moment Plot point is pressed. The two readings were taken at different moments of a noisy count.
- **Verdict:** refuted as a mismatch; the observation stands (the panel does not say WHEN it read).
- Step 6b text: "press Plot point and read the predicted rod position the panel prints."
- What I saw: the tile read `1.5e3 cps` while the panel printed `C = 1672 cps → 1/M = 0.292` (shot `06b_plot.png`), and at step 8 the tile read `8.4e3` when the panel printed `C = 8576 cps`. Background says the plot "divides the starting SOURCE RANGE count by the current one", so a layman expects the same number. It made no difference to the outcome, but it shakes trust in "the tile is what counts".
- What would have unstuck me: one note that the plot averages the count, or making them agree.

**S-5. The 1/M PLOT window sits over the speed bar and the Instructor tab header from step 4 to step 11.**
- **Measured:** Screenshot 04a_1m_open.png: the window clips the Instructor tab's left edge ("nstructor", "Mode 3" loses its M) and covers the steam dump area of the board. The speed bar is NOT covered.
- **Verdict:** narrowed.
- The window (x≈905–1258) covers the 60× / part of the speed row edge and cuts off "Instructor" and the walkthrough title ("Mode 3, Hot Standby…" reads "Mode 3, Hot Standby" with the M clipped; shots `04a_1m_open.png`, `10_step10.png`). Step 11 is the first to say "close the 1/M PLOT window with the ✕". I left it open because steps 5–8 need Plot point. Nothing broke, but the panel I am reading from is partly hidden for about 1 h 20 min of plant time.
- What would have unstuck me: nothing needed. A layman may drag or close it early and then hunt for Plot point.

**S-6. An unexplained speed chip "→ 8×" appeared beside 3600× at step 10.**
- **Measured:** Not measured.
- **Verdict:** not filed.
- Shot `10_step10.png`: the speed row reads `1× 5× [10×] 60× 600× 3600× → 8×`. No text explains it: it could be the achieved speed or a suggestion. Low severity.

**S-7. Step 8a: STARTUP RATE target shown but 8a's check-off lagged the tile once (low confidence, seen once).**
- **Measured:** Not measured (reviewer: low confidence, possibly polling).
- **Verdict:** not filed.
- Text: "8a ○ Hold CONTROL WITHDRAW until CONTROL ROD POSITION reads 195 to 205 and SOURCE RANGE reads 7.0e3 or more."
- What I saw: at T+00:11:22 the tile read `7.2e3` and 8a was still ○. At T+00:11:35 it read `7.3e3` and 8a was ✓. My poll read the checklist a few milliseconds before the tile, so this could be timing. The same happened at 7a (tile `3.0e3`, ✓ about 3 s later). Noted, not proven.

**S-8. Step 1c says "RCP FLOW reads ON"; the tile reads a percentage.**
- **Measured:** Built pool: 1c grades RCP FLOW >= 89.5 %; the tile prints 100 %. Known grading deviation, record (i).
- **Verdict:** confirmed, text vs board.
- Text: "1c ✓ Check RCP FLOW reads ON." The done-when underneath says "RCP FLOW 90 % or more: the pumps are running". On the board, RCP FLOW reads `100 %`, and an OFF/ON switch sits above it with ON lit. A layman finds it, but the step's instruction and its done-when name two different things.

**S-9. Units: the text says "MWe", the board says "MW".**
- **Measured:** Built pool: 14b/17b say MWe (run_style N6 forbids bare MW); the OUTPUT tile prints MW.
- **Verdict:** confirmed.
- Step 14: "Set LOAD to 10 MWe and wait for the generator to read above 8 MWe." Step 17: "Check OUTPUT reads near 10 MWe." The TURBINE-GENERATOR card reads `LOAD 10 MW`, `OUTPUT 9 MW`. "MWe" is never explained. It was not a blocker; the strip chart does say "Output MW … 9 MWe".

**S-10. The INTER RANGE shorthand is only half explained.**
- **Measured:** fmtExp (ui/diagram/board/pwr_board_wiring.js) and fmtPredValue (ui/app.js): a mantissa that rounds to 10.0 printed "10.0eN" -- measured 9.96e-5 -> "10.0e-5"; 34 of 34 decade-edge values bad.
- **Verdict:** confirmed and FIXED 2026-09-25: both formatters carry the decade; new check 2ab.6 in run_checklist_pwr2 (0 bad on the fix, 34 on the old formatter); the IR row now grades its new band floor 9.950000000000001e-8.
- Step 4 explains SOURCE RANGE shorthand ("7.0e2 is 700 counts a second"). INTER RANGE targets are `1.0e-7 A` (step 10), which needs negative exponents and a unit "A" (amps) nobody names. At T+02:04 the tile's text read `10.0e-5` (my extract), a form a layman may read as bigger than `1.0e-4`. Low.

**S-11. Wording mismatch at the end: "switched off" against "BLOCKED".**
- **Measured:** Built pool: "switched off" appears once; the panel row reads BLOCKED.
- **Verdict:** confirmed, wording.
- Steps 15–17 say "reads BLOCKED". The completion card says the two trips are "both switched off". A layman may wonder whether "switched off" is a third state.

**S-12. A standing alarm is never mentioned.**
- **Measured:** Screenshot 04a: ALARMS (1) "Turbine Trip / Low Steam Demand" standing; the built pool mentions it 0 times.
- **Verdict:** confirmed.
- From step 1 the ALARMS box shows "Turbine Trip / Low Steam Demand · power · warning · unacknowledged". No step mentions it or says whether to ACK it. It cleared by itself once the turbine was latched (shot `14b_done.png`: "no active alarms").

## 3. Per-step log

Speeds are what the bar showed. "Why" is the italic line under the step's first sentence.

| # | First sentence | What I did | Time to satisfy | Continue lit? | Confusion / notes | Did the why line help? | Shot |
|---|---|---|---|---|---|---|---|
| 1 | "Verify the plant is in Hot Standby (Mode 3)." | Nothing; all four items were ✓ on arrival (547 °F, 2235 psi, RCP 100 %, rate +0.02). | 0 | Yes, at once | 1c "reads ON" against a % tile (S-8). Standing turbine-trip alarm (S-12). | Yes: "hot, at pressure, pumps running, reactor shut down" tells me what the four checks add up to. | `01_step1.png` |
| 2 | "Dilute boron to the estimated critical concentration, 719 ppm." | Nothing; ON already lit, target 719, BORON CHEM 719. | 0 | Yes, at once | The note explains why it is pre-ticked ("The Hot Standby preset starts at 719 ppm"). Good. | Yes: "Less boron … lets the reactor go critical with the control rods low" is the whole idea in one line. | `02_step2.png` |
| 3 | "Line up the steam generator (SG) before taking the reactor critical." | Nothing; SG FEED AUTO/HOLDING, STEAM DUMP AUTO, DUMP SETPOINT 1020 psi. | 0 | Yes, at once | None. | Yes: "its heat has to leave through the steam generator" explains why feed and dump matter now. | `03_step3.png` |
| 4 | "Take the 1/M baseline point before any rod moves." | Pressed `1/M PLOT` (ROD CONTROL card), then `Plot point` in the popup. | ~5 s wall | Yes | "1/M value" in the why line comes before any definition. The background defines it. | Partly: "this count divided by a new one" only made sense after reading the background. | `04_step4.png`, `04a_1m_open.png`, `04b_plotted.png` |
| 5 | "Take the second 1/M point, after the first rod pull." | Set 5×. Held CONTROL WITHDRAW (MED was already lit) 22.9 s wall, 0→85. 5a ticked a moment later at SR 7.0e2. Set 1×, waited for STARTUP RATE +0.01, pressed Plot point. | 5a: ~25 s wall; 5b: at once | Yes | 5a does not say which speed button to press (MED was pre-selected, so this worked). | Yes: "One point cannot make a line" is exactly what a layman needs. | `05_step5.png`, `05a_after_pull.png`, `05c_plot.png` |
| 6 | "Take the third 1/M point." | 5×, held WITHDRAW 24.4 s, 85→160; 6a ✓. 1×, waited for rate +0.03 (34 s wall, from +0.23), Plot point → "predicted criticality ≈ step 233 (37.2% withdrawn)". | ~60 s wall | Yes | Tile 1.5e3 against panel C = 1672 (S-4). | Yes: "pulls the prediction in" prepares me for the number to change. | `06_step6.png`, `06a_pull.png`, `06b_plot.png` |
| 7 | "Take the fourth 1/M point, after a shorter pull." | 5×, held 8.5 s, 160→190; 7a ✓ about 3 s later. 1×, waited 56 s wall for +0.03, Plot point → step 213. | ~70 s wall | Yes | 7b has no wait estimate (6b and 8b do). | Yes: "the pulls get smaller from here" and the 25-step note work together. | `07_step7.png`, `07a_pull.png`, `07b_plot.png` |
| 8 | "Take the final 1/M point, the one the approach to critical is built on." | At 1× (no speed given for 8a), held 2 s, 190→201. 8a ✓ at SR 7.3e3 (T+00:11:35). Set 10× as 8b says; rate reached +0.03 at T+00:13:38; Plot point → "≈ step 212 (33.8% withdrawn)". | ~3 plant-min | Yes | 8a has no suggested speed line of its own. S-7 lag. | Yes: "decides where the rods stop, so it gets the longest wait" explains the wait before I am asked for it. | `08_step8.png`, `08a_pull.png`, `08b_plot.png` |
| 9 | "Take the reactor just critical." | Pressed SLOW, held WITHDRAW 60 s wall at 1×, 201→209 (212 − 3). 9a ✓ after about 1 plant-min still (rate was +0.13 and falling). The speed then went to 10× by itself (S-1). Set 1×, tapped WITHDRAW once (209→210), set 10×. Rate settled at +0.06; 9b ✓ at T+00:35:22, and the speed dropped to 1× by itself. | 9a ~2 plant-min; 9b ~5 plant-min after the tap | Yes | S-1 (speed changed itself), S-2 (PERIOD/DPM). I had to subtract 3 from 212 myself; fine. SOURCE RANGE tile went blank (`−`) as the note warned. | Yes: "The prediction reads high, never low, so the rods stop short" is the single most useful line in the walkthrough. | `09_step9.png`, `09a_pull.png`, `09b_tap1.png` |
| 10 | "Let power rise from critical with the rods still." | Touched nothing. The step opened at 10× by itself. INTER RANGE went 1.6e-8 → 4.8e-6 A; REACTOR POWER 0.1 % at T+01:20:35. | ~43 plant-min (37:51→1:20:35), matching the note's "30 to 60 plant-minutes after 0.06 to 0.10" | Yes | "three decades" is unexplained. "→ 8×" chip (S-6). | Yes: it tells me why REACTOR POWER will sit at 0.0 % and what to watch instead, which stops me pulling rods in a panic. | `10_step10.png`, `10b_wait.png` |
| 11 | "Let power climb to 0.5 %." | Closed the 1/M window with ✕ as told. Waited at 5× (set by itself). 0.1 → 0.5 % at T+01:40:09. | ~18 plant-min (note says 15 to 25) | Yes | None. | Yes: "Extra steps now only speed up a climb that is already under way" is the right warning. | `11_step11.png`, `11a_wait.png` |
| 12 | "Let power level itself off below 5 %." | Waited at 10× (set by itself). Power 0.5 → 1.0 %, rate to +0.00; 12b ✓ T+02:04:32. | ~23 plant-min (note says about 20) | Yes | None. | Yes: "the plant's own feedback, not the rods, holds power steady" names the idea; the background explains it. | `12_step12.png`, `12b_wait.png` |
| 13 | "Raise power past 5 %, into Mode 1, At Power." | Pressed SLOW (already lit), set 5× (not set by itself this time), held WITHDRAW 21.9 s wall, 210→223 (13 steps). Power 2.6 % at release, 5.2 % at T+02:11:06. | ~2 plant-min after release | Yes | The step did NOT auto-set 5× though its line says 5× (inconsistent with S-1's pattern). | Yes: "Mode 1 begins at 5 %" makes the target meaningful. | `13_step13.png`, `13a_pullb.png`, `13b_wait.png` |
| 14 | "Put the turbine on line and let the reactor follow it up." | LATCH (1×); 14a ✓. Typed 10 in LOAD + Enter, set 10×. OUTPUT 9 MW, power 7.9 %; 14b ✓ T+02:14:10. | ~2 plant-min | Yes | MWe against MW (S-9). The turbine-trip alarm cleared (S-12). | Yes: "the turbine leads and the reactor follows, with no rod motion" is the central lesson and it came true on screen (power 5.7 → 7.9 % with the rods still at 223). | `14_step14.png`, `14a_latch.png`, `14b_done.png` |
| 15 | "Block the first startup trip, IR HIGH FLUX." | Waited at 1× until power 9.6 % (8 s wall), pressed TRIP BLOCKS, then BLOCK on IR HIGH FLUX; ✓ at 10.1 %. | ~30 s wall | Yes | The panel header "0 of 4 blocked · 2 available to block now · 2 waiting on its permissive" (grammar). "P-10 PERMISSIVE" is explained in the note, good. | Yes: "this trip shuts the reactor down at 25 % on the way up" says why it must go. | `15_step15.png`, `15a_tbpanel.png`, `15b_blocked.png` |
| 16 | "Block the second startup trip, PR HIGH (LOW SETPT)." | TRIP BLOCKS, then BLOCK on PR HIGH (LOW SETPT); both rows BLOCKED; TRIP BLOCKS again to close. | ~20 s wall | Yes | "PR" and "SETPT" unexplained (S-3). The TRIP 35% tag on the REACTOR POWER tile disappeared, which was a nice confirmation. | Partly: it tells me the consequence (trip at 35 %) but not what PR is. | `16_step16.png`, `16a_both_blocked.png`, `16b_closed.png` |
| 17 | "Verify the plant is in Mode 1, At Power." | Nothing; power 10.4 %, OUTPUT 10 MW, both ✓ on arrival. Continue → "Walkthrough complete". | 0 | Yes | "switched off" against "BLOCKED" on the completion card (S-11). | Yes: "catches a trip block that dropped out or a generator that never picked up load" explains why a check step exists. | `17_step17.png`, `18_end.png` |

Final state: rods 223/627, REACTOR POWER 10.4 %, AVG COOLANT TEMPERATURE 549 °F, PRIMARY PRESSURE 2238 psi, PRESSURIZER LEVEL 28 %, SG LEVEL 65 %, OUTPUT 10 MW.

## 4. Words and numbers I could not find, or that did not match

| Walkthrough says | On the board |
|---|---|
| "RCP FLOW reads ON" (1c) | RCP FLOW `100 %`, with an OFF/ON switch above it |
| "STARTUP RATE reads 0.00 DPM" / "+0.03" | Tile reads `+0.02 DPM`; "DPM" is never expanded |
| "PERIOD in the thousands of seconds / 150 to 200 seconds / under 60 seconds" | PERIOD tile shows `−7499 s`, `∞ s`, `959 s`, `434 s`. Never defined; negative and ∞ are unexplained |
| "SOURCE RANGE reads 1.4e3 … 7.0e3" and "the plot divides the starting SOURCE RANGE count by the current one" | Tile `1.5e3` while the 1/M panel says `C = 1672 cps`; tile `8.4e3` against `C = 8576 cps` |
| "INTER RANGE … 1.0e-7 A" | Tile `1.6e-8 A` … `1.0e-4`; also rendered `10.0e-5` once; "A" is never named |
| "three decades" (step 10) | not defined anywhere |
| "10 MWe", "above 8 MWe", "near 10 MWe" | LOAD `10 MW`, OUTPUT `9 MW` / `10 MW` (the strip chart says MWe) |
| "PR HIGH (LOW SETPT)" | Row label is identical, but "PR" and "SETPT" are never expanded (IR is) |
| "both switched off" (completion card) | The panel says `BLOCKED` |
| "Suggested time warp: 1× before every tap" (9b) | The bar went to 10× by itself after 9a; no message (S-1) |
| (nothing) | `→ 8×` chip beside 3600× at step 10 |
| (nothing) | "Turbine Trip / Low Steam Demand" alarm, standing from step 1 until the turbine latched |

## 5. What the text got right

- Step 2's note explains why the step ticks at once from the Hot Standby preset.
- Step 4 defines the count shorthand ("7.0e2 is 700 counts a second") before the first count target.
- Steps 5–8 give each pull a position band and a count, so "how far" is never a guess.
- Step 6/8 wait estimates ("about a minute and a half", "three to three and a half plant-minutes") matched what I measured (34 s wall at 1×; about 3 plant-min).
- Step 7's "watch the position, not the clock" for a 25-step pull.
- Step 9's 9a note ("At SLOW the rods move about one step every 8 plant-seconds"; ticks after a still plant-minute) matched exactly: 8 steps in 60 s.
- Step 9's rate bullet list told me +0.06 was "fine" and predicted "levels off lower, about 1 to 1½ %"; power levelled at 1.0 %.
- Step 9's warning that SOURCE RANGE goes blank above 1.0e5 came before it happened.
- Step 10's "30 to 60 plant-minutes after 0.06 to 0.10" matched: about 43.
- Step 11's "15 to 25 plant-minutes" matched: 18. Step 12's "about twenty" matched: 23.
- Step 11 tells you when to close the 1/M window and why.
- Step 13's "about half a percent of power per step" is roughly consistent: 13 steps took power from 1.1 % to about 8 %, with the turbine still to come.
- Step 14 delivered the plant's central lesson visibly: power rose from 5.7 % to 7.9 % on load alone, with the rods still.
- Step 15 names the P-10 PERMISSIVE and explains the 8 %–9½ % dead zone before you hit it.
- Step 16 warns that any click closes the TRIP BLOCKS panel and that it covers the rod buttons.
- Every step's done-when line under the substep quotes the exact tile name and range.
