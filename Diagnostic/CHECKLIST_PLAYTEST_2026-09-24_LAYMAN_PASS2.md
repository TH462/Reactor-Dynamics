> **Record, not policy.** The second layman pass of `pwr_startup` (Mode 3, Hot Standby to Mode 1,
> At Power), 2026-09-24, run against `workbench` at `4550d741` (Alpha 1.8.0-rc4) in headless Edge by
> a fresh-context agent with no repo access, one leg. **It completed, 17 of 17, no Rewind, no hard
> stuck point.** Stuck points: S-1 9a waits a minute with nothing saying so (CONFIRMED, 64 plant-s,
> text); S-2 three taps to pass 9b, rate 0.07 not 0.15 (NARROWED: critical is bank 207, the grading
> accepts 1 to 3 steps past it, well short of the text's "as written"; the Continue flash mid-tap is
> CONFIRMED and FIXED); S-3 SOURCE RANGE goes blank in step 9 (CONFIRMED on this route); S-4 the rate
> never reaches zero on 5-8 (CONFIRMED, deliberate, owner ruling #796 item 3); S-5 the clock changes
> with no notice (NARROWED: by design, #796; the empty speed line is ruling #686); S-6 the 1/M window
> covers the panel (CONFIRMED, draggable by ruling, not moved); S-7 "TURB TRIP" and the ungraded ACK
> (NARROWED: TURB TRIP is the Industry-register label); S-8 two WITHDRAW buttons (CONFIRMED, text);
> S-9 "settles near 10 %" (NARROWED: true only on the authored route; 7.7 to 8.1 % on the
> reviewer's); S-10 words (step 6 "first prediction" CONFIRMED false: the panel predicts from 2
> points). Also fixed: a head's note and speed line drew between its two check-offs. **Refuted:
> none.** Numbers are the full-stack live checklist, `hot_zero_power`, seeds 42 and 7, with the
> reviewer's rungs replayed (84 / 156 / 185 / 197, then SLOW to 207) unless said; scripts in the
> session scratchpad `p2/`.

# Layman playthrough — `pwr_startup` (Mode 3, Hot Standby → Mode 1, At Power)

Build under test: workbench 4550d741 (page footer: "Alpha 1.8.0-rc4 TEST BUILD").
Persona: intelligent layman; knows pumps and valves. Learned only from the walkthrough panel and the board.
Wall time: about 45 minutes. Sim clock at the end: T+02:25:47 (the leg started at about T+00:06).

## 1. Outcome

| Leg | Result | Steps completed | The one thing that mattered |
|---|---|---|---|
| pwr_startup | **COMPLETE**: "Walkthrough complete. Reactor critical in Mode 1, At Power, OUTPUT 10 MWe, IR HIGH FLUX and PR HIGH (LOW SETPT) both switched off." | 17 / 17, no Rewind used | Step 9 (the approach to critical). 9a waited about a plant-minute *after* I stopped at the right place before it ticked, and nothing said it would. 9b took three tap-and-wait cycles (about 20 plant-minutes) to reach +0.06, and it settled at 0.07 where the text calls 0.15 "as written". Because of that, later durations and levels did not match the text: step 10 took about 35 plant-minutes (text: "about twenty-five"), and step 12 levelled at 1.2 % (text: "near 3 %"). |

No hard stuck point. Every step could be passed by doing what the text said. The findings below are confusion and mismatches, not dead ends.

**Layout (goal line, then lettered substeps each with action / note / suggested speed / check-off line).** This helps overall: the bold coloured action line is the thing to do, and the ✓/○/· markers show where I am. Four things confused me:
- In one-substep steps (1, 10, 12, 17) the second check-off shows as a separate `✓`/`○` line *below* the note and "Suggested time warp" (for example "✓ PRIMARY PRESSURE 2200 to 2270 psi" in step 1). It reads like a second instruction, not the done-when of the first.
- A pending substep (`·`) shows no done-when line. It appears only when that substep becomes active: 9b's "STARTUP RATE +0.06 to +1.00 with the rods stopped" was invisible while I was working 9a.
- The panel only re-renders a tick on its next update. A screenshot taken right after 9b passed still showed "9b ·".
- The speed changes by itself when a substep ticks. This is useful, but nothing announces it (see S-5).

**Layout, measured:** in `ui/app.js` a `cont` row drew as its own `.ckl-crit` AFTER the head's note and speed line (both children of the head row), so step 1's "✓ PRIMARY PRESSURE 2200 to 2270 psi" sat under "Suggested time warp". **Fixed:** a head with a `cont` row now defers its note and speed into a `.ckl-crit-tail` drawn after its last `cont` row, wearing the head's state classes (`verify_ckl_relevance` section 9 asserts the DOM order). The hidden done-when on a pending (`·`) substep is #756's ruled behaviour ("a done-when for a row nothing is grading yet"), not changed. Main Menu open on load and STEAM FLOW in gpm: not measured this pass.

## 2. Stuck points, ranked by severity

**S-1 — Step 9a: I stopped at the right place, but the check waited about a plant-minute with no sign it was coming.**
Step text: "9a ○ Press SLOW, then hold WITHDRAW until CONTROL ROD POSITION is 3 steps short of the predicted position. / Rods stopped 3 steps short of the 1/M prediction".
What I did: the 1/M panel read "predicted criticality ≈ step 210 (33.4% withdrawn)". I pressed SLOW and held control-rod WITHDRAW at 1× in 4 s chunks, from 197 to 207, and stopped at T+00:32:37. 9a stayed ○ through T+00:33:04 (screenshot `s9_wait9a.png`). At that point it was unclear to me whether 207 was wrong or 208 was wanted. I waited without touching anything, and it ticked at about T+00:33:35. The speed then jumped to 10× by itself.
Also confusing: at 207 the board already read STARTUP RATE +0.22 → +0.14 and PERIOD 192 s. The note says "Around 0.15, with PERIOD 150 to 200 seconds, is this approach going as written", so to a layman the reactor already looked critical "as written" before 9b's first tap. The rate then fell to +0.04 over five minutes.
What would have unstuck me: one line saying "the check waits about a minute with the rods still before it ticks", plus a note that STARTUP RATE jumps while the rods move and then falls back.

**Measured:** reviewer's route, seed 42: the bank reached 207 at +72 s and 9a ticked at +136 s, **64 plant-s** after the stop (the row is `stopped 60` plus the debounce). True reactivity at 207 with the rods still: **-0.2 to +0.5 pcm** (seed 42), -5.3 pcm (seed 7), so 207 IS critical to within noise. STARTUP RATE after the stop: +0.232 at the stop, then **0.178 / 0.140 / 0.115 / 0.090 / 0.073 / 0.050** at 10 / 30 / 60 / 120 / 180 / 300 s. The "+0.22 to +0.14" the reviewer saw is the pull's own transient decaying on a core at zero reactivity, not a reactor already going "as written".
**Verdict:** confirmed. The one-minute wait is real and unannounced; the label and the note are the owner's text.

**S-2 — Step 9b: three tap cycles to pass, and it settled well below the stated target, which threw off every later number.**
Step text: "Tap WITHDRAW one step, wait about five plant-minutes, and read STARTUP RATE. Repeat until it reads +0.06 or more five minutes after the tap." and "Around 0.15, with PERIOD 150 to 200 seconds, is this approach going as written … 0.02 to 0.05: one more step out."
What I did: for each cycle I pressed 1×, clicked WITHDRAW once, and then waited about 5 plant-minutes at 10×:
- 207 → 208: rate after 5 min +0.04.
- 208 → 209: +0.05.
- 209 → 210: +0.07. Continue lit.

About 20 plant-minutes, 3 minutes of wall time (`s9b_tap1.png`, `s9b_after5min.png`, `s9b_done.png`). The rods ended *at* the prediction (210), even though step 9 says "The prediction reads HIGH, never low".
Knock-on effects: step 10 took about 35 plant-minutes against the text's "about twenty-five". Step 12's power levelled at 1.2 %, not "near 3 %".
Minor: right after the first tap, Continue flashed lit for one poll (rate +0.08 during rod motion) and then went dark again. A player who clicked fast could have advanced on the transient.
What would have unstuck me: say plainly what to expect if the rate settles at 0.06–0.10 (is that fine or not?), and give the time and level figures for that case.

**Measured:** the player's rule (tap when the tile reads under +0.06 five minutes after the rods stop), reviewer's route, after the fix below: **both seeds end at bank 210 after three taps, 9b met at +1299 s (seed 42) and +1291 s (seed 7)**, the reviewer's result exactly. Reactivity at 208 / 209 / 210: **+7.6 / +15.3 / +23.2 pcm** (seed 42); rate five minutes after each tap 0.059 / 0.064 / 0.085, and at 209 it read 0.054 six seconds later: at 1 to 2 steps past critical the tile's noise straddles the 0.055 floor, so whether 209 passes is a coin toss (pre-fix it passed on seed 42 at +4 s; post-fix the quiet clock starts ~4 s later, at the end of travel, and the read landed low). So the grading does NOT force anyone past "as written": the text's 0.15 is about 6 steps past critical (the authored route stops at 213), and the 0.055 floor accepts 1 to 3 steps past. Ending AT the 1/M prediction (210) is consistent with "the prediction reads HIGH": it read 3 steps high here (critical 207). The downstream mismatch follows the shallower approach: step 12 levels at 1.0 to 1.5 %, step 13 without the turbine at 7.7 to 8.1 % (see S-9). **The flash:** at 1x, bank 207 still for 300 s, one SLOW tap: the step sat awaiting Continue from **+0.6 s after the tap, rod still moving, for 32 broadcasts** (seed 42; seed 7 +1.1 s, 27 broadcasts). Cause: `op: 'stopped'` read the rounded `steps` counter, which flips at the half-step of an ~8 s SLOW travel, so the 300 s row stayed met while the pull's rate spike (peak 0.115) met the rate row.
**Verdict:** narrowed. The three taps and the 0.07 are real and are what the floor accepts; "forced past as written" is refuted. The mid-tap Continue is **confirmed and fixed** (`gradeStopped` restarts its clock while the bank's `moving` flag is set; after the fix, 0 broadcasts awaiting Continue during travel on all three runs). The missing 0.06 to 0.10 band, and the times and levels that assume 0.15, are the owner's text.

**S-3 — SOURCE RANGE went blank in step 9 with no explanation until step 11.**
While I was waiting in 9b, the SOURCE RANGE tile went from 9.6e4 cps to a blank "–" bar (`s9b_done.png`). Step 9 says nothing about it. The explanation ("SOURCE RANGE switches itself off above 1.0e5 … there is no button for it") first appears in step 11. By then the reading had been gone for about 40 plant-minutes, and steps 4–8 had taught me to steer on that number.
What would have unstuck me: move the "switches itself off above 1.0e5" sentence into step 9 or step 10.

**Measured:** reviewer's route, seed 42: SOURCE RANGE 9.7e4 at bank 209, +120 s after the second tap; de-energized (tile blank) by +180 s, still inside 9b. The prior pass's harness route did not see it because the authored rods sit at 213 and cross 1.0e5 later in the leg.
**Verdict:** confirmed on the player's route. The explanation is in step 11's note, two steps late (owner's text).

**S-4 — Steps 5–8: "Let STARTUP RATE fall to zero" never quite happens.**
Step text (6a): "Let STARTUP RATE fall to zero … Wait for the rate before you plot: about a minute and a half after the rods stop."
What I did: after the rods stopped at 156, the rate sat at +0.02 and then +0.01 for over 2 plant-minutes (T+00:16:00–00:17:52) and never showed 0.00. I plotted at +0.01. In step 7 it sat at +0.03 when 7a ticked. In step 8 it reached +0.00 only about 7 plant-minutes after the stop. 6a and 7a both ticked while the rate still read +0.03, so the tick does not actually wait for zero.
What would have unstuck me: say "falls to about +0.01 to +0.03" or "the check-mark is the signal", not "zero".

**Measured:** built pool, steps 5 to 8: row a grades SOURCE RANGE counts only, row b the Plot point press; no rate row (owner ruling #796 item 3, "remove the requirements for startup rate to fall back to zero"). The "fall to zero" is instruction only.
**Verdict:** confirmed. Deliberate grading; the word "zero" against a rate that parks at +0.01 to +0.03 is the owner's text.

**S-5 — The speed changes by itself without saying so, and `#warpInfo` is always empty.**
I pressed 5× for 5a and 10× for 7a and 8a. Each time, the speed dropped back to 1× the moment the substep ticked (5a at about T+00:12:05, 7a at about T+00:21:22, 8a at about T+00:29:19). When 9a ticked it went *up* to 10× by itself. The speed bar sometimes showed a hint chip "→ 5×" or "→ 9×" (`s9b_done.png`). `#warpInfo` was empty at every read. It seems to follow each substep's "Suggested time warp", which is sensible, but nothing on screen says the walkthrough is changing the speed. My first reaction was that my speed click had not taken.
What would have unstuck me: a one-line notice ("walkthrough set speed to 1×") or text in `#warpInfo`.

**Measured:** `ui/app.js`: the walkthrough sets each substep's `wait_speed` (#796) and hands back 1x when a row is met. `#warpInfo` prints only a standing drop or the step's wait advice, and the advice needs `hold >= 180` AND `wait_hint !== false`. Every `pwr_startup` step with a hold of 180 s or more (5 to 14) authors `wait_hint: false`, so on this leg the line is empty unless the plant drops the clock. NOT measured in a browser this pass.
**Verdict:** narrowed. The clock changes by design (#796) and the silent line is ruling #686 ("nothing on other steps"); a notice would reopen #686, which is the owner's call. Not changed.

**S-6 — The 1/M Startup Plot window covers part of the walkthrough panel and the board for seven steps.**
Opened in step 4 and closed only when step 11 says to ("close the 1/M PLOT window with the ✕"). While open, it hides the left edge of the Instructor panel text ("Mode 3, Hot Standby" is cut to "Mode 3, Hot Standby" with the first letters hidden, "Instructor" tab cut to "nstructor"). It also hides the board's STEAM DUMP, SG FEED and upper TURBINE area (`s4_1m_open.png`, `s9_wait9a.png`).
What would have unstuck me: dock the window away from the panel, or say in step 4 that it can be closed and reopened.

**Measured:** not re-measured in a browser. `ui/panels/one_over_m.js`: the window is a floating, draggable card by owner ruling ("card floating and dragable like it was originally"), moved by its title bar.
**Verdict:** confirmed as reported (the screenshots show it). Not moved: the default position is a layout call, and "drag it by its title bar" is a one-line text option for the owner.

**S-7 — Step 1: "short form TURB TRIP" is not on the board, and Continue was lit before the requested ACK.**
Step text: "One alarm is already up and belongs here: Turbine Trip / Low Steam Demand on the ALARMS list, short form TURB TRIP … Press ACK on the ALARMS list and leave it."
The ALARMS list reads "Turbine Trip / Low Steam Demand" with an "ACK" button beside it. I found no "TURB TRIP" anywhere. Continue was already `ready` ("Step done — press Continue.") before I pressed ACK, so the ACK instruction is not graded (`a4_started.png`, `s1_acked.png`).
What would have unstuck me: drop the short form, or show it on the alarm row.

**Measured:** `layers/control/pwr_control.js`: the alarm's labels are `Turbine Trip / Low Steam Demand` (Learning) and `TURB TRIP` (Industry). Step 1 grades AVG COOLANT TEMPERATURE and PRIMARY PRESSURE only; the ACK is not graded.
**Verdict:** narrowed. "TURB TRIP" exists, in the Industry register the reviewer was not in; the ungraded ACK is authored that way. Both are text (owner).

**S-8 — Step 5 "Hold WITHDRAW": the board has two WITHDRAW buttons.**
The ROD CONTROL card has CONTROL/WITHDRAW and SHUTDOWN/WITHDRAW. The goal line says "Withdraw the control rod group", and the SHUTDOWN column already read 627/627, so I picked CONTROL. The action line itself says only "WITHDRAW".
What would have unstuck me: "Hold CONTROL WITHDRAW".

**Measured:** the ROD CONTROL card carries CONTROL and SHUTDOWN columns, each with WITHDRAW (reviewer's screenshots); the substep asks say "hold WITHDRAW" and name the bank only on the goal line.
**Verdict:** confirmed. Text (owner).

**S-9 — Step 13 → 15: the 9 ½ % gate depends on the turbine, which step 13 does not make clear.**
Step 13: "Power settles near 10 % from here. It needs to: the turbine's startup trips cannot be blocked until REACTOR POWER is above 9 ½ %."
After 13 steps (210 → 223), power levelled at about 5–6 %, not "near 10 %". It reached 9.5 % only after step 14 put 10 MWe on the turbine (step 15 opened at 8.3 % and crossed 9.5 % about 45 plant-seconds later at 1×). The text calls these "the turbine's startup trips", but the TRIP BLOCKS panel labels them reactor-power trips (IR HIGH FLUX, PR HIGH (LOW SETPT)).
What would have unstuck me: in step 13, say "power reaches 9 ½ % once the turbine takes load in the next step".

**Measured:** stop, level off, +13 SLOW, turbine NOT loaded, power at +120 / 180 / 240 / 600 / 1800 s: reviewer's route (210 to 223) **4.2 / 5.7 / 6.7 / 8.0 / 8.1 %** (seed 42), 3.4 / 5.0 / 6.1 / 7.7 / 7.7 % (seed 7); authored route (213 to 226) 8.6 % at +240 s and **9.6 to 9.7 %** settled (seed 42), 9.3 % (seed 7). The reviewer's 5 to 6 % was read about 3 plant-minutes after the pull. The owner's original "near 11 %" was not reached on either route (max 9.9 %); the agent's "near 10 %" (7b725dac) holds on the authored route and not on the shallow approach 9b now accepts. The TRIP BLOCKS panel lists the two rows as IR HIGH FLUX and PR HIGH (LOW SETPT) under "STARTUP TRIP"; "the turbine's startup trips" is the owner's wording.
**Verdict:** narrowed. Power does settle higher, but near 10 % only on a deep approach; on the reviewer's route it is 8 % until the turbine loads. Text (owner; the one agent-changed number is part of it).

**S-10 — Words I had to guess at (none blocked me).**
- "rung" (steps 6, 7, 8: "a shorter rung").
- "permissive" (step 15) and the panel's "(P-10 PERMISSIVE)" and "(P-11 PERMISSIVE)", never explained.
- "lit" (steps 15, 16, 17: "IR HIGH FLUX lit"): the panel row actually changes its button text from "BLOCK" to "BLOCKED".
- "MWe" (text) vs "MW" (board).
- Step 6 says "the fit now prints its first prediction", but the panel had already printed "predicted criticality ≈ step 260" after step 5's second point.
- Step 3's "SG FEED reads AUTO": the SG FEED card header reads "HOLDING"; only the AUTO button is lit.

**Measured:** `ui/panels/one_over_m.js` `render()`: the fit runs from **2 points** and prints "predicted criticality ≈ step N" whenever the line crosses beyond the last point, so a prediction prints after step 5, and step 6's "now prints its first prediction" is false by construction. "rung", "permissive", "lit", the P-10 / P-11 panel codes, "MWe" against the board's "MW", and step 3's "reads AUTO" beside a "HOLDING" header are read off the reviewer's screenshots and the built pool; all are the owner's step-file text.
**Verdict:** confirmed. Text (owner).

## 3. Per-step log

Sim times are the board clock (T+hh:mm:ss). Wall times are approximate.

| Step | First sentence | What I did | Time to satisfy | Continue lit? | Confusion / screenshot |
|---|---|---|---|---|---|
| (menu) | — | Main Menu was already open on load (the brief said it would not be). Clicked the Walkthroughs tab, then "▶ Start" on "Mode 3, Hot Standby → Mode 1, At Power — startup to power". | — | — | `a2_state.png`, `a3_wtlist.png` |
| 1 | "Verify the plant is hot and shut down before any rod moves." | Read 547 °F, 2235 psi, RCP FLOW 100 % (ON lit). Clicked ACK on the alarm row. | Instant | Yes, already lit *before* ACK | "short form TURB TRIP" not on board (S-7). `a4_started.png`, `s1_acked.png` |
| 2 | "Bring boron down to the estimated critical concentration, 719 ppm." | Nothing. BORON already read 719, and the text says "this step ticks at once". | Instant | Yes | `s2_step2.png` |
| 3 | "Line up the heat sink before the reactor makes any heat." | Checked that SG FEED AUTO was lit. Pressed nothing. | Instant | Yes | Card header reads "HOLDING", not AUTO (S-10). `s3_start.png` |
| 4 | "Take the 1/M baseline point before any rod moves." | Clicked 1/M PLOT, then Plot point. Baseline C₀ = 499 cps. | About 5 s wall | Yes | The window covers the panel's left edge (S-6). `s4_1m_open.png`, `s4_plotted.png` |
| 5 | "Withdraw the control rod group and plot a second point…" | 5×. Held CONTROL WITHDRAW at MED in 1.5 s chunks, 0 → 84. SR went from 5.2e2 to about 7.5e2. Waited; 5a ticked at about T+00:12:40 (rate +0.00), and the speed had already dropped to 1× by itself. Plot point → "predicted criticality ≈ step 260". | About 2 plant-minutes, about 1.5 min wall | Yes | Two WITHDRAW buttons (S-8). Speed changed unannounced (S-5). SR noise 6.5e2–8.3e2 straddles the 7.0e2 target. `s5_withdrawn2.png`, `s5_wait.png`, `s5_plot2.png` |
| 6 | "Withdraw again and plot a third point; the fit now prints its first prediction." | 5×. Held WITHDRAW 84 → 156 (SR about 1.5e3). 6a ticked about 30 plant-seconds later at +0.03, and the speed dropped to 1×. Waited to T+00:17:52; the rate never went below +0.01. Plot point → ≈ step 237. | About 4 plant-minutes | Yes | "first prediction" is wrong (S-10). "zero" never reached (S-4). `s6_withdrawn.png`, `s6_plot3.png` |
| 7 | "Withdraw a shorter rung and plot a fourth point to tighten the prediction." | 10×. 0.8 s holds, 156 → 185. SR reached 3.0e3 about 55 plant-seconds after the stop, 7a ticked, and the speed dropped to 1×. Plot point → ≈ step 218. | About 2.5 plant-minutes | Yes | "rung" (S-10). `s7_withdrawn.png`, `s7_plot4.png` |
| 8 | "Withdraw the last short rung and plot the final point the approach is built on." | 10×. 0.4 s holds, 185 → 197. 8a ticked at about T+00:29:19 (SR crossed 7.0e3, rate +0.01) and the speed dropped to 1×. Waited to +0.00 at T+00:30:49, then plotted → ≈ step 210 (33.4 % withdrawn). | About 6 plant-minutes to the tick, 8 to rate 0.00 | Yes | Matches "about six plant-minutes". `s8_withdrawn.png`, `s8_plot5.png` |
| 9 | "Bring the control rods to the edge of criticality without going past it." | SLOW, 1×, held WITHDRAW 197 → 207 (1 step per about 8 plant-seconds, as stated). 9a ticked about 60 plant-seconds after the stop and the speed went to 10× by itself. 9b: three cycles of 1× tap then 5 plant-minutes at 10× (208: +0.04; 209: +0.05; 210: +0.07). | About 25 plant-minutes, about 6 min wall | Yes, at T+00:55:58 | S-1, S-2. SOURCE RANGE went blank (S-3). `s9_at207.png`, `s9_wait9a.png`, `s9b_active.png`, `s9b_tap1.png`, `s9b_after5min.png`, `s9b_done.png` |
| 10 | "Let the reactor carry power up from critical, reading INTER RANGE rather than REACTOR POWER." | 10×, rods left alone. INTER RANGE 1.8e-8 → 1.0e-7 A at about T+01:09:45. REACTOR POWER 0.1 % at T+01:33:45. Rate steady at +0.06/+0.07. | About 35 plant-minutes (text: "about twenty-five"), about 3.5 min wall | Yes | Duration mismatch (a result of S-2). `s10_start.png`, `s10_done.png` |
| 11 | "Let power climb past the point of adding heat, tapping WITHDRAW only if the climb stalls." | Closed 1/M PLOT with its ✕. 5×. No taps needed; the rate stayed +0.04 to +0.07. 0.5 % at T+01:51:10. | About 17 plant-minutes (text: "about 15"), about 3.5 min wall | Yes | The source-range explanation arrives late (S-3). `s11_start.png`, `s11_done.png` |
| 12 | "Let power level itself off below 5 %." | 10×, hands off. Power 0.5 → 1.2 %, rate to +0.00 at about T+02:14:18. Ticked at T+02:14:58. | About 23 plant-minutes, about 4 min wall | Yes | Levelled at 1.2 %, not "near 3 %" (a result of S-2). `s12_start.png`, `s12_done.png` |
| 13 | "Cross the 5 % line deliberately. That is Mode 1, At Power." | SLOW, 5×. Held WITHDRAW 210 → 223 (exactly "about 13 steps") and released. Power 1.2 → 3.4 % at the release, passing 5 % (5.1) about 1 plant-minute later. | About 3 plant-minutes | Yes | "hold until REACTOR POWER passes 5 %" taken literally would over-withdraw: power lags the rods by about a minute. "near 10 %" did not happen without the turbine (S-9). `s13_held.png`, `s13_done.png` |
| 14 | "Put the turbine on line and let the reactor follow it up." | 1×: LATCH, and 14a ticked. Typed 10 in the LOAD box and pressed Enter. 10×. OUTPUT reached about 9 MW at about T+02:23:10 and the power tile read 8.1 %. | About 3 plant-minutes | Yes | "MWe" vs "MW" (S-10). `s14_latched.png`, `s14_load10.png`, `s14_done.png` |
| 15 | "Block the first startup trip once REACTOR POWER is above 9 ½ %." | Opened TRIP BLOCKS. At 1×, watched power go 8.5 → 9.9 % in about 60 plant-seconds. At 10.1 % clicked BLOCK on the IR HIGH FLUX row; it read BLOCKED and held. | About 1.5 plant-minutes | Yes | "permissive", "P-10", "lit" vs BLOCKED (S-10). `s15_panel.png`, `s15_blocked.png` |
| 16 | "Block the second startup trip and close the panel." | TRIP BLOCKS → BLOCK on PR HIGH (LOW SETPT) → both read BLOCKED ("2 of 4 BLOCKED") → closed with TRIP BLOCKS. The "TRIP 35%" tag on the REACTOR POWER tile disappeared. | About 10 s wall | Yes | `s16_panel.png`, `s16_blocked.png`, `s16_closed.png` |
| 17 | "Verify Mode 1, At Power." | Read REACTOR POWER 10.3 % and OUTPUT 10 MW. Continue. | Instant | Yes | `s17_start.png`, `s18_complete.png` ("Walkthrough complete") |

## 4. Words and numbers I could not find on the board

| Walkthrough said | Board actually shows |
|---|---|
| "short form TURB TRIP" (step 1) | Alarm row reads "Turbine Trip / Low Steam Demand"; no "TURB TRIP" anywhere |
| "SG FEED reads AUTO" (step 3) | SG FEED card header reads "HOLDING"; the AUTO button is lit |
| "Hold WITHDRAW" (steps 5–9, 13) | Two WITHDRAW buttons: under CONTROL and under SHUTDOWN |
| "STARTUP RATE … fall to zero" (steps 5–8) | Sat at +0.01 to +0.03 for minutes; 0.00 only in steps 5 and 8 after long waits |
| "the fit now prints its first prediction" (step 6) | A prediction ("≈ step 260") was already printed after step 5 |
| "rung" (steps 6–8) | No such label; means a rod-pull increment |
| "Around 0.15, with PERIOD 150 to 200 seconds" as the settled rate (step 9) | Settled 0.07, PERIOD 391 s at 210 steps |
| "REACTOR POWER reads 0.0 % for about twenty-five plant-minutes" (step 10) | About 35 plant-minutes |
| "watch REACTOR POWER stop rising on its own, near 3 %" (step 12) | Stopped at 1.2 % |
| "Power settles near 10 % from here" (step 13) | About 5–6 % until the turbine took load in step 14 |
| "the turbine's startup trips" (step 13) | TRIP BLOCKS panel lists them as "STARTUP TRIP · 25%" (IR HIGH FLUX) and "STARTUP TRIP · 35%" (PR HIGH (LOW SETPT)), reactor-power trips |
| "permissive" (step 15) | Panel shows "(P-10 PERMISSIVE)" and "(P-11 PERMISSIVE)", never explained |
| "IR HIGH FLUX lit", "PR HIGH (LOW SETPT) lit" (steps 15–17) | Row button text changes from "BLOCK" to "BLOCKED" |
| "Set LOAD to 10 MWe", "OUTPUT near 10 MWe" | LOAD box and OUTPUT read "MW" |
| (nothing) | SOURCE RANGE tile blank "–" from step 9; explained only in step 11 |
| (nothing) | `#warpInfo` empty at every read; the speed changed by itself at substep ticks |

Also noticed, not in the walkthrough: STEAM FLOW is shown in "gpm" (101 gpm at 10 MW), an odd unit for steam to a layman.

## 5. What the text got right

- Step 1 ties three named values to three tiles that carry exactly those names (AVG COOLANT TEMPERATURE, PRIMARY PRESSURE, RCP FLOW).
- Step 2 says the step "ticks at once" from this preset, and it did.
- Step 4 explains the shorthand "7.0e2 is 700 counts a second", which is what the SOURCE RANGE tile prints.
- Steps 5–8 give both a count target and a rod-position range. The position range was the easier one to act on.
- Step 8's "about six plant-minutes" for the rate to settle matched: the tick came at about 6 minutes.
- Step 9a's "one step every 8 plant-seconds" at SLOW matched what I saw.
- The 1/M panel prints the prediction as a plain rod step ("≈ step 210"), directly usable in 9a.
- Step 10's "Never 60×" warning, with its reason.
- Step 13's "about 13 steps" was exact: 210 → 223 crossed 5 %.
- Step 15's warning about the BLOCK not holding below 9 ½ % made me wait for 10 % first, and the block held on the first press.
- Step 16 warns that the TRIP BLOCKS panel closes on any outside click and covers the rod buttons, which was true.
- The completion card states the end state and links the next leg.
