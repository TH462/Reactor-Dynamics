> **Record, not policy.** The layman pass of 2026-09-23, run against `workbench` at `4454836b`
> (Alpha 1.8.0-rc4) in headless Edge by a fresh-context agent with no repo access, on ONE leg,
> `pwr_startup` (Mode 3, Hot Standby to Mode 1, At Power), the first pass on the owner's
> per-substep step format. **It completed, 17 of 17.** Stuck points: S-1 a tap un-ticked 9a and
> dropped the clock to 1x (CONFIRMED, fixed); S-2 a steady "+0.05" never passed (CONFIRMED,
> render-band half fixed, the text half is the owner's); S-3 step 12 met on entry (CONFIRMED,
> owner's text describes the grading); S-4 power ends 9.5-10.0 % (NARROWED: set by LOAD, not by
> the approach, and step 17 can strand a slow player); S-5 the panel closed (NARROWED: the owner's
> click-away ruling #721 closes it on the Continue press); S-6 the rate is not graded (CONFIRMED,
> deliberate, owner ruling #796 item 3); S-7 SLOW is ~7.6 plant-seconds a step (CONFIRMED).
> **Refuted: none.** The cause S-3 and S-4 attached ("downstream of the shallow approach") is
> refuted for S-4 and holds for S-3. Every number below is from the verification pass, full
> stack, `hot_zero_power`, the leg replayed as authored to step 9's entry (bank 202), seeds 42
> and 7 unless said; scripts in the session scratchpad (`m/s1.js`, `s2.js`, `s4.js`).

# Layman playthrough — pwr_startup (Mode 3, Hot Standby → Mode 1, At Power)

Build under test: workbench 4454836b (Alpha 1.8.0-rc4). Headless Edge, `ui/shell.html?engine=pwr2`.
Persona: intelligent layman, screen only. Wall time ~50 min. Screenshots in `shots/`.

## 1. Outcome

| Leg | Result | Steps completed | The one thing that mattered |
|---|---|---|---|
| pwr_startup | **COMPLETE** ("Walkthrough complete") | 17 / 17 | Step 9: tapping WITHDRAW, which substep 9b tells you to do, UN-TICKS 9a ("Rods stopped 3 steps short") and the step snaps the speed back to 1×. The 10× wait the text asks for gets cancelled after every tap, and 9b's rate guidance gives no answer for the rate I actually saw (0.03 to 0.07). Everything after that ran on a shallower critical approach than the text expects: power levelled at 1.4 % instead of "near 4 %", and ended at 9.9 to 10.2 % instead of "near 11 %". |

Note on layout: the lettered-substep layout (goal line, then 5a/5b with their own action, note, speed and check-off) appears only on steps 5–9 and 14. Steps 1–4 and 10–13 and 15–17 use a single ✓/○ line. Where it appears it **helps**: I always knew which half of the step I was on, and the ✓/○/· markers made it obvious. The one failure is step 9 (S-1), where the substeps are graded as independent live conditions and not as a sequence.

## 2. Stuck points, ranked

### S-1 — Step 9: doing 9b un-does 9a, and the requested 10× wait is cancelled (HIGH)
Step text: 9a "Press SLOW, then hold WITHDRAW until CONTROL ROD POSITION is 3 steps short of the predicted position." 9b "Tap WITHDRAW one step, wait about five plant-minutes, and read STARTUP RATE. Repeat until it reads positive with the rods still." Speed line for 9b: "Suggested time warp: 10× while you wait; back to 1× before every tap."

**What I did:** The prediction read 210, so I stopped at 207. 9a stayed ○ for about 40–50 s of wall time at 1× with the rods at 207. Nothing on screen said a wait was needed; I thought I had got the number wrong (shot `s09_wait.png`). Then it ticked, and the speed jumped to 10× by itself. I did what 9b says: 1×, one tap (207→208), then 10×. **9a went back to ○ at once and the speed was back at 1×** (`b33`, shot `s09_tap1w.png`). My 10× press was overridden. This happened again after the second tap (`b39`). Even after 9a re-ticked (~22 s wall), activating 9b set the speed back to 1× a second time (`b40`), so I had to press 10× by hand again. Across three taps I spent about 3 minutes of wall time at 1× when the text said 10×.

**What would have unstuck me:** Make 9a latch once it is met, so the taps 9b asks for cannot un-tick it, and stop re-applying the substep's speed after the player has already chosen one.

**Measured:** live runtime, seed 42, stop at bank 207, then one tap per five minutes: every tap took
step 9's verdicts from `100` to `000` within 4 s, the active substep fell from 9b (10x) to 9a (1x),
and 64 plant-s later 9a re-ticked and the key moved back to 9b — auto set 10x again. So each tap
bought 60 plant-s at a forced 1x, and the 1x came AFTER the tap had landed. After the fix
(`accs[].latch` on 9a) the same route reads `100` straight through four taps, active substep 9b
throughout; completion unchanged (bank 211, +1554 s, both runs). The 60 s at 1x before 9a first
ticks is the row's own 60 s dwell (`stopped 60`), and its label does not say "for a minute".
**Verdict:** confirmed — fixed (9a latches; the hidden 300 s row still carries the hold).
`run_checklist_pwr2` 2ak.3 and a `verify_flags_ui` browser check, both injection-proven.

### S-2 — Step 9b: the rate guidance has a gap exactly where I landed (HIGH)
Text: "Around 0.15, with PERIOD 150 to 200 seconds, is this approach going as written. Around 0.5 … eight steps further out … Over 1.0, tap INSERT … Near 0.01, with PERIOD in the thousands of seconds and nothing moving, means you have stopped short of critical — tap one more step out and wait."

**What I did:** At 208 the rate sat at +0.03 to +0.04 with PERIOD 715–828 s (`s09_w3.png`, `s09_w4.png`). At 209 it sat at a steady +0.05 with PERIOD 526–559 s for two 5-plant-minute waits (`s09_w6.png`, `s09_w7.png`). The done-when "STARTUP RATE positive and steady with the rods stopped" was **not** ticked, even though it read positive and steady. None of the four bands in the text covers 0.03–0.07 or a PERIOD of 350–830 s. I guessed and tapped again (210, +0.07, PERIOD 349 s), and the step then ticked. The line "Repeat until it reads positive" is literally false: +0.05 steady was positive and did not pass.

**What would have unstuck me:** Give the actual number the check wants (for example "until STARTUP RATE holds at 0.07 or more"), or add a band for "0.02–0.1, PERIOD 300–1000 s: one more tap".

**Measured:** the tile draws STARTUP RATE `toFixed(2)`, so "+0.05" is [0.045, 0.055) and the
0.05 floor sat mid-band. The reviewer's PERIOD 526-559 s is 0.047-0.050 DPM: drawn "+0.05",
graded short. And the owner's "repeat until it reads positive" is not a discriminator at the
five-minute read: sub-critical banks read positive there — bank 205 +0.021/+0.020, 206
+0.033/+0.030, 207 +0.046 (-0.2 pcm, seed 42)/+0.042 (-5.3 pcm, seed 7) — because the rate at
300 s is the decaying transient of the pull. Bank 208 (+7.4/+2.3 pcm, just super-critical)
reads 0.062/0.056 at 300 s and 0.018/0.009 an hour later. Floor 0.045 completed bank 207 at
+0.3 pcm in the port's own table (+352 s, INHERITED; this pass's re-run at -0.2 pcm did not); 0.055 never completes 205-207 on either seed in 3600 s.
Also: completion needs 300 s of stillness PLUS the 5-tick debounce, so a player who reads at
exactly five minutes (as the note says) sees an unticked row and taps again — the harness policy
did exactly that at bank 209 (+0.068) one second before the step would have ticked.
**Verdict:** confirmed — the render-band half is fixed (floor 0.055, both edges on the tile's
band, 2ak.2/2ak.4). The text half ("positive") needs the owner: it cannot be graded as written
without completing a sub-critical core.

### S-3 — Step 12 ticks at once, and the "near 4 %" it describes never happens (MEDIUM)
Text: "Leave the rods alone and watch REACTOR POWER stop rising on its own, near 4 %." … "The step checks off once the rate is under 0.10, which comes about fifteen minutes before power finally levels — leave the rods alone and let it."

**What I did:** Continue was lit the moment the step opened (power 0.5 %, rate +0.05). I followed the text anyway and waited 4 minutes of wall time at 10× (~40 plant-minutes). Power levelled at **1.3–1.4 %**, not near 4 % (`s12_w3.png`, `s12_w7.png`). A player who trusts the lit Continue skips the whole lesson of this step. A player who waits sees a number that contradicts the text, with no explanation. The low level comes from the shallow approach in S-2.

**What would have unstuck me:** Either grade the step on power actually levelling off, or say "if it levels lower, e.g. 1–2 %, that is fine — you stopped closer to critical."

**Measured:** step 12 entry and level-off by where the rods stopped (seed 42, rods still from the
stop): bank 209 enters at 0.45 %, rate 0.022 -> met on entry, levels at 0.99 %; 210 (the
reviewer's) 0.46 %, 0.058 -> met on entry, levels 1.49 %; 211 met on entry; 213 (the authored
creep) rate 0.132 -> met at +193 s at 1.09 %, levels 3.07 %; 216 levels 4.62 %; 219 6.23 %.
"Near 4 %" is not the authored route either (3.07 %), and the step's rows (power < 5 %, rate
within +/-0.10) are true on entry for every approach at or below bank 211.
**Verdict:** confirmed — hollow on a shallow approach, and the owner's note describes that
grading verbatim ("checks off once the rate is under 0.10"), so the fix is his ruling.

### S-4 — Steps 13/15/17: "settles near 11 %" becomes 9.9–10.2 %, right on the 10 % line the trip blocks need (MEDIUM)
Step 13: "Power settles near 11 % from here. It needs to: the turbine's startup trips cannot be blocked until REACTOR POWER is above 10 %." Step 14 BACKGROUND: "the reactor follows the turbine up to about 11 % by itself."

**What I did:** I pulled 14 steps (about 13 were asked for) to 224 and set LOAD 10. Power crept 8.6 → 9.9 → 10.2 % (`s15_w1.png`, `s15_panel.png`), and I needed about 90 s of wall time at 1× before it crossed 10 %. I blocked IR HIGH FLUX at 10.2 %. At step 17, "REACTOR POWER above 10 %" needed ~10 s to tick, with power flickering 10.0/9.9 (`s17_a.png`, `s17_b.png`). The completion text says "Reactor critical in Mode 1 … Ready for the power ascension", while the board read **9.9 %** 45 s later (`s18_after.png`). The blocks stayed set (TRIP BLOCKS badge "2"). Step 15's text warns that blocks drop out below the permissive, so from the text alone a layman would worry that they are about to be lost.

**What would have unstuck me:** Tell the player what to do if power sits at 9–10 %: "if it stops below 10 %, tap WITHDRAW once or raise LOAD by 1".

**Measured:** power at LOAD 10 MWe, 1200-2400 s after the load is set: authored route (213,
+13 to 226) 9.51-9.99 % and 9.49-9.99 %; the reviewer's route (210, level-off, to 224) 9.50-10.04 %
(seed 42) and 9.48-10.00 % (seed 7). LOAD 11 MWe: 10.47-11.04 %; LOAD 12: 11.50-12.09 %. Power
follows the turbine (about 1 % per MWe), not the rod approach. Step 17 grades REACTOR POWER >= 10.05
% (the tile's "10.1"): it passes on the load pick-up overshoot (first >= 10.05 at +112 to +183 s)
and then NO tick in the 1200-2400 s window reached 10.05 on any of the four runs — a player who
reaches step 17 twenty plant-minutes after setting LOAD cannot complete the leg. P-10 is 8 %, so
the blocks hold (the reviewer's badge "2" was right).
**Verdict:** narrowed — the observation stands; the cause is LOAD 10 MWe, not the shallow
approach. The step-17 strand is new and needs the owner's text (LOAD number or the 10 % line).

### S-5 — Step 16: "On the TRIP BLOCKS panel" assumes the panel is still open; it is not (LOW)
Text: "On the TRIP BLOCKS panel press BLOCK on the PR HIGH (LOW SETPT) row, then close the panel." Step 15 ended with the panel open.

**What I did:** After Continue the panel was gone. I clicked where the PR HIGH BLOCK button had been, which landed on the reactor diagram and did nothing visible (`s16_before.png`). Then I reopened TRIP BLOCKS and pressed BLOCK (`s16_closed.png`, `s16_blocked2.png`). This is something the text did not say.

**What would have unstuck me:** "Press TRIP BLOCKS again to reopen the panel, then …".

**Measured:** `pwr_board_wiring.js` dismisses the TRIP BLOCKS popover on any pointerdown outside
it, on `document` (owner ruling #721, 2026-09-21: "outside that popup, full stop"). Continue ▶ is
outside it, so step 15's Continue closes the panel step 16 says to use.
**Verdict:** narrowed — the panel closes by the owner's ruled click-away, not by Continue itself;
step 16's text needs "open TRIP BLOCKS again" (his text).

### S-6 — Step 5a/6a/7a/8a: "Let STARTUP RATE fall to zero" versus the check (LOW)
The check-offs ticked about 5–15 s after release while STARTUP RATE still read +0.06 to +0.13 (`s06_h3.png`, `s07_h3.png`). The text also says "Wait for the rate before you plot — see step 5", but step 5 never explains a wait. Counts kept rising after each "plot" (step 6: I plotted at 1.4e3 target, and the panel recorded C = 1530 cps with the board at 1.7e3). The instruction to wait for zero conflicts with the check that says done. I waited 15–20 s at 1× on my own each time.

**What would have unstuck me:** Say how long to wait in plain numbers on step 5 (step 8 does: "about six plant-minutes"), and do not tick 5a until the rate is actually under some threshold.

**Measured:** built pool, steps 5-8: row a grades SOURCE RANGE counts only (>= 695 / 1350 / 2950 /
6950 cps), row b is Plot point; no rate row. That is the owner's ruling #796 item 3 (2026-09-21,
"remove the requirements for startup rate to fall back to zero") — the wait is instruction only.
Step 5's note says only "Stop when CONTROL ROD POSITION reads about 80 to 100", so step 6's
"see step 5" points at nothing about the wait.
**Verdict:** confirmed — deliberate grading (owner ruling); the "see step 5" pointer is a text gap.

### S-7 — Step 9a: SLOW is much slower than the text suggests, at 1× (LOW)
"Press SLOW, then hold WITHDRAW" at "Suggested time warp: 1×". At SLOW and 1× the rods moved about 1 step per 8–10 s. Going 197 → 207 took **~75 s of continuous holding**. After a 2 s hold nothing moved at all (`s09_h1.png`), and I thought the button was broken. No time estimate is given.

**What would have unstuck me:** "At SLOW, about one step every ten seconds — hold for over a minute."

**Measured:** SLOW, bank 202 -> 207 in ~38 plant-s (the harness route): about 7.6 plant-s per step,
so a 2 s hold at 1x moves nothing — the reviewer's 1 step per 8-10 s is right.
**Verdict:** confirmed — a text gap (no time given); the rate is the plant's.

## 3. Per-step log

| Step | First sentence | What I did | Time to satisfy | Continue lit? | Confusion / shots |
|---|---|---|---|---|---|
| 1 | "Verify the plant is hot and shut down before any rod moves." | Read 547 °F / 2235 psi / RCP FLOW 100 %. Pressed ACK on the alarm. | Already ✓ on load | Yes, at once (before the ACK) | "RCP FLOW on": the board reads "RCP FLOW 100 %" with OFF/ON buttons, which is findable. The step was done before I did the ACK it asked for. `s01_start.png`, `s01_acked.png` |
| 2 | "Bring boron down to the estimated critical concentration, 719 ppm." | Typed 719 + Enter in the BORON box (already 719). | Instant | Yes | None. The text itself says it ticks at once from this preset. `s02.png` |
| 3 | "Line up the heat sink before the reactor makes any heat." | SG FEED already AUTO; did nothing. | Instant | Yes | SG FEED card header reads "HOLDING", which the text does not mention. `s03.png` |
| 4 | "Take the 1/M baseline point before any rod moves." | Pressed 1/M PLOT, then Plot point. | ~2 s | Yes | The 1/M window opens over the top of the walkthrough panel and hides the left third of the step text (`s04_1m.png`). Plotted baseline 573 cps. |
| 5 | "Withdraw the control rod group and plot a second point…" | Speed auto-set 5×. Held CONTROL WITHDRAW (MED): 5 s → 18 steps, +16 s → 78. SR 7.6e2. Waited ~8 s; 5a ticked and speed auto-dropped to 1×. Plot point. | ~35 s wall | Yes | Two WITHDRAW buttons (CONTROL / SHUTDOWN); "control rod group" was enough to pick. 5a ticked at 78, below the "about 80 to 100" range. `s05_hold1.png`, `s05_h2b.png`, `s05_plot2.png` |
| 6 | "Withdraw again and plot a third point; the fit now prints its first prediction." | 5× auto. Held 18 s + 3 s → 156. SR 1.4e3. Waited 15 s (rate +0.06→+0.02). Plot → "predicted criticality ≈ step 259". | ~45 s wall | Yes | "Wait for the rate before you plot — see step 5": step 5 says nothing about how long. `s06_h3.png`, `s06_plot3.png` |
| 7 | "Withdraw a shorter rung and plot a fourth point…" | 10× auto. Held 3 s (→176) + 2 s (→190). SR 3.2e3. Waited 20 s. Plot → 220. | ~35 s wall | Yes | Rod speed scales with time warp (≈6.7 steps/s at 10× MED), so at 10× a 25-step rung is under 4 s of holding. "watch the position, not the clock" is apt. `s07_h3.png`, `s07_plot4.png` |
| 8 | "Withdraw the last short rung and plot the final point the approach is built on." | 10× auto. Held 1.2 s → 197. Waited ~45 s at 10×. 8a ticked at SR 7.4e3, rate +0.01; speed auto-dropped to 1×. Plot → **210**. | ~50 s wall (~7 plant-min) | Yes | Stop range "195 to 205" was fine. `s08_h3.png`, `s08_plot5.png` |
| 9 | "Bring the control rods to the edge of criticality without going past it." | SLOW, held ~75 s at 1× → 207. 9a ticked only after ~45 s more. Tap → 208 (9a un-ticked, speed forced 1×). Waited, 10× → +0.03/+0.04. Tap → 209 (same regression) → +0.05 steady ×2 waits. Tap → 210 → +0.07 → 9b ✓. | **~9 min wall**, ~35 plant-min | Yes, eventually | S-1, S-2, S-7. Source range went blank ("—") during this step, before step 11 says it will. `s09_wait.png`, `s09_tap1w.png`, `s09_w3.png`–`s09_w7.png`, `s09_tap3w.png` |
| 10 | "Let the reactor carry power up from critical, reading INTER RANGE rather than REACTOR POWER." | 10× auto; left rods. First ✓ already ticked (IR ≥ 1.0e-7). Waited. | 135 s wall (~22 plant-min) | Yes | None; the text matched ("0.0 % for about twenty-five plant-minutes"). `s10_w.png` |
| 11 | "Let power climb past the point of adding heat, tapping WITHDRAW only if the climb stalls." | 5× auto. Closed 1/M window with ✕. Left rods (rate stayed +0.05, never 0.00). | 195 s wall (~16 plant-min) | Yes | "SOURCE RANGE switches itself off above 1.0e5 … Once it has gone, close the 1/M PLOT window": it had already gone in step 9. `s11_full.png` |
| 12 | "Let power level itself off below 5 %." | Continue lit at once. Waited 4 min wall at 10× anyway to watch it level. | Instant (lit before any wait) | Yes, at once | S-3: levelled at 1.4 %, not "near 4 %". MED and INSERT were highlighted as suggestions although no insert was needed, which suggested I should insert. `s12_w3.png`, `s12_w7.png` |
| 13 | "Cross the 5 % line deliberately. That is Mode 1, At Power." | 5× auto. SLOW, held 20 s → 223 (3.2 %, rising) + 4 s → 224 (5.2 %). | ~25 s wall | Yes | "about 13 steps" took 14 from my lower start. Unclear whether to stop at 13 steps or hold on to 5 %; I held to 5 %. `s13_h1.png`, `s13_h2.png` |
| 14 | "Put the turbine on line and let the reactor follow it up." | 14a: LATCH (lit green). 14b: speed auto 10×, typed 10 + Enter in LOAD. | ~12 s wall | Yes | Board unit is "MW", text says "MWe"; minor. Output 8 MW → ✓. `s14_latch.png`, `s14_end.png` |
| 15 | "Block the first startup trip once REACTOR POWER is above 10 %." | Power 8.6 % → waited ~90 s at 1× until 10.2 %. TRIP BLOCKS → BLOCK on IR HIGH FLUX → "BLOCKED". | ~95 s wall | Yes | S-4. The panel rows carry "(P-10 PERMISSIVE)" and "(P-11 PERMISSIVE)", which are unexplained codes. `s15_panel.png` |
| 16 | "Block the second startup trip and close the panel." | Panel had closed on Continue. Stray click on the diagram, then reopened TRIP BLOCKS, BLOCK on PR HIGH (LOW SETPT), closed it with TRIP BLOCKS. | ~10 s wall | Yes | S-5. Text says rows read "lit"; the panel says "BLOCKED". `s16_before.png`, `s16_blocked2.png`, `s16_closed2.png` |
| 17 | "Verify Mode 1, At Power." | Read power 10.0 / 9.9 %, OUTPUT 10 MW. | ~10 s wall | Yes | S-4 (borderline 10 %). `s17_a.png`, `s17_b.png` |
| End | "Walkthrough complete" | — | — | — | Board at 9.9 % 45 s later; blocks held (badge 2). `s18_done.png`, `s18_after.png` |

Automatic speed changes I saw, since `#warpInfo` was empty throughout: step 5 start → 5×; 5a tick → 1×; step 6 → 5×; 6a tick → 1×; step 7 → 10×; step 8 → 10×; 8a tick → 1×; 9a tick → 10×; each 9a un-tick → 1×; 9b activation → 1× (overriding my 10×); step 10 → 10×; step 11 → 5×; step 13 → 5×; 13 tick → 1×; 14b → 10×; tick → 1×. The suggested speed is also shown as an outline on the speed button (class `ckl-speed-rung`).

## 4. Words and numbers vs the board

| Walkthrough says | Board actually shows |
|---|---|
| "RCP FLOW on" | "RCP FLOW 100 %" with OFF / ON buttons. Findable. |
| "SG FEED reads AUTO" | AUTO lit, but the card header reads "HOLDING". |
| "the rods go critical around 208 of 627 steps" (step 2) | 1/M predicted 210; went critical-ish at 207–210. Consistent. |
| "Stop when CONTROL ROD POSITION reads about 80 to 100" (5a) | 5a ticked at 78. |
| "SOURCE RANGE switches itself off above 1.0e5" (step 11) | SOURCE RANGE went to "—" already during step 9 (IR ~3.9e-9 A). |
| "Let STARTUP RATE fall to zero" (5a–8a) | Checks tick at +0.06 to +0.13. |
| "Repeat until it reads positive with the rods still" (9b) | +0.05 steady did not pass; +0.07 did. |
| "watch REACTOR POWER stop rising on its own, near 4 %" (12) | Levelled at 1.3–1.4 %. |
| "Power settles near 11 %" / "follows the turbine up to about 11 %" (13, 14) | 9.9–10.2 %. |
| "about 13 steps" (13) | 14 steps needed (from 1.4 %). |
| "Set LOAD to 10 MWe" | LOAD box unit "MW"; OUTPUT "MW". |
| "IR HIGH FLUX lit", "both rows read lit" (15, 16) | Buttons read "BLOCKED" (amber). Close enough. |
| "the permissive" (15) | Panel rows say "(P-10 PERMISSIVE)", "(P-11 PERMISSIVE)": P-10 and P-11 are never explained. |
| "On the TRIP BLOCKS panel press…" (16) | Panel is closed when the step opens. |

## 5. What the text got right

- Step 1 names the pre-existing alarm by its exact on-screen text ("Turbine Trip / Low Steam Demand").
- Step 4 explains the 7.0e2 shorthand once, at the first place it is needed.
- Every control named in steps 1–17 existed on the board under exactly those words (WITHDRAW, SLOW/MED, 1/M PLOT, Plot point, LATCH, LOAD, TRIP BLOCKS, BLOCK, IR HIGH FLUX, PR HIGH (LOW SETPT)).
- Rod stop ranges per rung (80–100, 150–175, 180–205, 195–205) were usable.
- Step 8 gives a concrete wait ("about six plant-minutes"), which the earlier rungs lack.
- Step 10's "REACTOR POWER reads 0.0 % for about twenty-five plant-minutes" matched (~22).
- Step 11's instruction to close 1/M "with the ✕ in its corner" worked.
- Step 15 warns about the 8 %/9½ % dead band before you meet it.
- The ✓ / ○ / · markers and lettered substeps made it obvious which part was live.
- The walkthrough setting the speed at step start saved guessing on steps 5–8, 10, 11, 14.
