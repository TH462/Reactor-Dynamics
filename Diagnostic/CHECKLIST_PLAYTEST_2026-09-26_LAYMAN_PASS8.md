# Layman playthrough: PWR2 walkthrough chain, twice round (pass 8)

> **Record, not policy.** Layman pass 8, 2026-09-26, on workbench `064bc89c`: the six legs played
> TWICE on one plant, no reactor trip (T+0 → T+39:37), every leg entered from the previous end card.
> Verified 2026-09-26 (workbench-d) on `064bc89c` + this change. Every claim below was INHERITED from
> the reviewer until the "Measured" line under it. **S-1**, **S-2**, **S-3** startup — develop's
> lane, unverified here · **S-4** cooldown speed left at 1× — NOT A DEFECT (the runtime lifts it on
> the first entry), text now says so · **S-5** raise-power 9-12 — honest ticks, step 12 reworded ·
> **S-6** heatup forewarning — moved one step earlier · **S-7** lower-power "below X" — CONFIRMED,
> graded at the render floor · **S-8** raise-power bands — text aligned · **S-9** rod estimates —
> widened · **S-11** duplicate speed line fixed, shutdown alarm softened, ECCS STOP reworded.

Reviewer's report: `playthrough.md` + `mylog.txt` in the coordinator's scratchpad (`lay8/`, local).
Build `Alpha 1.8.0-rc6 TEST BUILD`, headless Edge 1600×1000, 3 h 21 min wall. Measurements here: the
chain gate (`test/run_walkthrough_routes.js --leg=chain`, full stack, live checklist runtime, seed
42) and a browser probe of the auto-speed driver (`inbox/v10/probe_speed.js`, local).

## S-1 (HIGH) — second startup: the 1/M plot keeps startup #1's points and baseline

**Claim.** Predictions ran 208 → 203 → 205 → 226 on startup #2; the divisor was ≈ 510 cps
(startup #1's baseline 5.2e2) against today's 4.3e2; nothing tells the player to press Clear.

**Verdict.** `pwr_startup` is develop's lane — **unverified here**, handed back.

## S-2 (HIGH) — second startup steps 7 and 8: counts unreachable inside the rod window

**Claim.** SOURCE RANGE plateaued at 2.5e3–3.0e3 at the top of 7's window (194) and 4.1e3–4.7e3
at 204; the reviewer went off-script (197, then 211) to tick 7a and 8a.

**Verdict.** develop's lane — **unverified here**.

## S-3 (MEDIUM) — SOURCE RANGE at target, box lags 25 s to 1.5 plant-min

**Claim.** Startup #1 6a and startup #2 5a stayed ○ with the tile at or over its target.

**Measured.** Only `pwr_startup` grades the source range (`sr_counts_cps` / `source_range`); no
other leg carries an SR row, so no non-startup leg can show it. **Verdict:** develop's lane,
**unverified here** (the debounce is `ACC_STABLE_N = 5` consecutive samples, for whoever takes it).

## S-4 (MEDIUM) — cooldown 4 and 11 left at 1×; the reviewer pressed 60× himself

**Claim.** The speed was not set on entry to step 4 (34 typed setpoints, 3.85 plant-h) or step 11.

**Measured.** Browser, `pwr_cooldown` with the dump in PRESS (turbine tripped, as on the chain):
step 4 on entry **1×**, `cmd_seen` false; one `set_steam_dump_setpoint` (what the DUMP SETPOINT box
sends, `pwr_board_wiring` `ims31tq7mgc`) → `cmd_seen` true and the clock at **60×** 2.5 s later.
Step 11: 1× on entry, one `set_rhr_hx` (the HX SPLIT box, `ims3xu86zm5`) → the clock took the head's
rung 2.5 s later. Pool `cmd` families and the matcher agree; the gate (af8585ed) works as designed.

**Verdict.** NOT A DEFECT in the runtime. The card never said the clock would move by itself —
the `warpInfo` line is off on both steps (`wait_hint: false`) — so the reviewer pressed 60× first.
4b's and 11a's Notes now end "The clock moves to 60× by itself once …". No `verify_flags_ui` change:
the synthetic S-1 check there already injection-proves the driver.

## S-5 (MEDIUM) — raise power 9-12 describe two plant-days but tick at once

**Measured.** Chain: 9 done in 5.5 plant-min at 580.2 °F; 10, 11, 12 **0.1 plant-min each**,
Tavg 580.3–580.4 °F, bank 308. Step 10 pulls only below 575 °F and 11 doses only once the rods
fall behind, so at 580 °F both are correctly already met (the owner's "Make them conditional").

**Verdict.** The ticks are honest; the TEXT over-promised. 12's Note "Keep trimming for the next
two plant-days." → "This walkthrough ends here, and nothing on this card waits for the xenon. Stay
at full power instead and the trimming in steps 10 and 11 goes on for about two plant-days."
Agent-drafted — for the owner's review.

## S-6 (LOW) — Pressurizer Level Above Program arrives one step before its forewarning

**Measured.** Chain: heatup step 9 done at 691 psia; `pzr_level_dev_high` raised at **696 psia,
0.1 plant-min into step 10**. The reviewer saw it at the end of step 9 both rounds. It lands on
the boundary. **Fix:** the sentence moved from 10a's Note to 9b's ("near the top of the climb,
about when the clock drops to 1×").

## S-7 (LOW) — Continue lit while the tile still read the limit

**Measured.** Pool: lower power 3a/4c/5c/6c grade Tavg below 576.9 / 568.6 / 561.9 / 556.9 °F
(302.7 / 298.1 / 294.4 / 291.6 °C). The tile prints `toFixed(0)`, so 561.5–561.9 °F reads "562" with
the "below 562 °F" row met — CONFIRMED for round 1. Round 2 ("558" against "below 557") is NOT this
defect: the row latches and the tile then drifts back up (both read the same instrument channel).

**Fix.** Grade the render floor: 576.48 / 568.49 / 561.49 / 556.48 °F (302.49 / 298.05 / 294.16 /
291.38 °C). Labels unchanged. The chain route still completes (see gates). **A gate pinned the
defect:** `run_checklist_pwr2` #739 asserted each threshold EQUALS the band top (±0.051 °C) and went
red on the fix. Re-formed to the render floor of the band top plus a label tie ("below X °F" with X
the printed top); validated both ways — the old literals fail the new form (by arithmetic: 302.7 > 302.50 °C), the new ones pass (gate run), and
its own injection (programme +2 °C) still reddens all four. A named refit (Hard Rule 10).

## S-8 (LOW) — stated band vs graded band (raise power)

**Claim.** Step 6 says "near 570 °F" and ticked at 559/560; stage 5 ticked at 556 against 562.

**Measured.** Labels already print the graded span (6: 558–585 °F); the green band is ±5 °F
(3.5 × the rods' 1.4 °F lockup band) around the program. The chain ticked 6 at 559.4 °F. **Fix (text):** 4b-7b
Notes say the check-off is wider than the green band — "aim for the green, not the tick". The
grade was not tightened: that is a pacing change (≈ 6 °F ≈ 27 steps at 0.22 °F/step) for the owner.

## S-9 (LOW) — rod estimates

**Measured** (reviewer round 1 / round 2 / chain gate): raise 4 5/15/15, 5 10/10/10, 6 20/20/25,
7 15/15/15, 8 25/13/25; lower 4 18/18/21, 5 12/18/18, 6 18/9/12. **Fix:** raise 4 "5 to 20", 5
"about 10", 6 "20 to 25", 8 "15 to 25"; lower 4 "15 to 25", 5 "10 to 20", 6 "10 to 20".

## S-10 (LOW) — inserting under an insertion-limit alarm

Not changed and NOT MEASURED here: the reviewer was not stopped. Why the alarms clear as the rods
go further in (presumably the power-dependent limit falling faster than the bank) is unverified.

## S-11 (LOW) — cosmetic and minor

- **Cooldown 11 prints "Suggested time warp: 600×." twice.** CONFIRMED in the browser (three
  lines on the card: 11a's, 11b's, the step's). Fixed: the step-level `speed_text` dropped.
- **Shutdown 3b's Cooldown Rate High "comes in".** Chain: raised at 1.3 plant-min with the tile at
  **−104 °F/hr** against the −100 setpoint — marginal, and absent in both rounds. Now "may come in
  …, or not at all from a cooler plant".
- **Cooldown 3c "Press STOP" when STOP is lit.** The row is a press-only entry (nothing observable
  behind an idle pump, #741), so "check it is lit; if not, press it" would strand a player who only
  checks. Reworded: "It is usually lit already … press it anyway, so the walkthrough records it."
- Startup 5's "5×, set by itself once the rods start moving" and the 1/M window overlap — startup,
  develop's lane. Unnamed self-explanatory alarms — left.

## Not verified here

S-1, S-2, S-3 (develop's lane). The reviewer's wall-clock observations of the speed bar (S-4) were
not replayed on the chained plant; the browser probe jumps straight to steps 4 and 11.
