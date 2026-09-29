# Layman playthrough: PWR2 walkthrough chain (pass 7)

> **Record, not policy.** Layman pass 7, 2026-09-26, on workbench `571447e6` (before develop's
> startup fixes): all six legs and a second heatup on ONE plant, no reactor trip (T+0 → T+26:00).
> Verified 2026-09-26 (workbench-b) on `46004f44` + this change with `test/run_walkthrough_routes.js`,
> extended so the confirmed soft lock reddens on the old card (route `hot_stage4`, injection
> `rods_row_5b`, and a new CMDWAIT check). Every claim below was INHERITED from the reviewer until
> the "Measured" line under it. **S-1** raise-power 5b soft lock — CONFIRMED, fixed · **S-2**
> startup 5a stall — develop lane, reported · **S-3** raise-power 4 overshoot — CONFIRMED (held
> pull), text and pace changed · **S-4** startup 9 flash — NOT REPRODUCED on the current tree ·
> **S-5** lower-power 100 → 75 MWe step — CONFIRMED, card walks the load now · **S-6** re-arriving
> alarm stamps — CONFIRMED, fixed in the alarm list · alarms — five forewarned, none a defect.

Reviewer's report: `inbox/lay7_playthrough.md` (local). Build under test `571447e6`, page header
`Alpha 1.8.0-rc6 TEST BUILD`, headless Edge 1600×1000, one plant T+00:00:00 → T+26:00:20, about
1 h 40 min wall. All measurements here: full stack, live checklist runtime, seed 42, the route gate's
child (`--job=<leg>:<route>`, plus the `WR_OVERRIDE` / new `WR_ACK_S` measurement knobs). "Preset" =
the leg's own `from` initial condition; "chain" = the six legs on one plant, each from the last one's
end, as the reviewer played them.

## S-1 — raise power 5b: "Rods withdrawn" never ticks if the temperature never sags

**Claim.** At LOAD 50 the tile went 567 → 561–563 °F, inside its band near 562 °F; 5b ("Hold
WITHDRAW … as AVG COOLANT TEMPERATURE sags") was a press-only check-off; Continue dark about 3
plant-minutes until a tap the text argued against.

**Measured.** Route `hot_stage4` (stage 4 = LOAD 30 then a 32-step pull, the reviewer's; stage 5 read
literally: withdraw only below 557 °F, insert only above 567 °F), OLD card: stage 4 ends at
562.8 °F; stage 5 withdraws **0** steps, every graded row reads met, and the step waits on the rod
row — CMDWAIT flag at 120 plant-s; it completed after **11.6 plant-min** only because the dilution
walked the tile over 567 °F and the route INSERTED (the family match latches on either direction).
Pressurizer Pressure Low came in at 2150 psia (14.82 MPa) in that stage, cleared after 173 s.

**Why the gate missed it.** On a gauge-following step the gate's `pressRows` pressed every live
row's `cmd` — a bare `rod_nudge` the literal player never makes. That free tap latched 5b on every
route. Fixed: `to_band` no longer presses rod rows; the rods are the route's own pulls.

**Verdict: confirmed. Fixed.** 4b-8b are now the TEMPERATURE row, graded on the plant (the same
band the 4c-8c continuation rows carried, which were folded into it), and conditional: "If AVG
COOLANT TEMPERATURE sags below its band, withdraw … Otherwise leave the rods." —
the shape of steps 10-11 under the 2026-09-25 ruling ("Make them conditional"). New card on
`hot_stage4`: stage 5 **3.9 plant-min, 0 steps withdrawn**, no flag. Injection `rods_row_5b` puts
the old press-only row back on the new card: the flash/untick/CMDWAIT check goes red.

## S-3 — raise power 4: "rises 2 to 5 °F after you let go"

**Claim.** 32 steps (not about 20), rose 13 °F after release to 565 °F, REACTOR POWER 34.5 %.

**Measured** (stage 4, tile rise after the last withdraw):

| pull style | preset: steps / rise | chain: steps / rise |
|---|---|---|
| held at MED from LOAD, let go 3 °F short (553 °F) | 17 / 5.0 °F | 20 / 6.3 °F |
| sag first (120 s), held, let go 5 °F short (551 °F) | 21 / 7.3 °F | 25 / 7.5 °F |
| pulls of 5 steps, one plant-minute apart, to the band | 20 / 2.6 °F | 20 / 2.1 °F |
| the reviewer (chain, held) | — | 32 / 13 °F (INHERITED; not reproduced — no route pulled 32 steps by reading the tile) |

All five stages at 5-step pulls one minute apart: preset 20/15/25/15/15 steps, rise ≤ 2.6 °F,
peak 581.0 °F, leg 25.2 plant-min (held pulls: 27.7); chain 20/20/25/15/15, rise ≤ 2.2 °F, leg
28.2 plant-min. Stage 8 released at 102.6-102.9 % power, under the 103 % rod stop.

**Verdict: confirmed for a held pull (5-8 °F on our routes, 13 °F on the reviewer's).** 4b-8b now
read "withdraw at MED in 5-step pulls a plant-minute apart", the lower-power pace; the
note gives both numbers (about 2 °F a pull; 5 to 8 °F held); counts 20 / 20 / 25 / 15 / 15;
suggested speed 5×, as lower power.

## S-5 — lower power 2: LOAD 100 → 75 MWe is a step

**Claim.** OUTPUT stepped at once; four unwarned alarms; the tile peaked 596 °F against raise
power's 590 °F caution.

**Measured.** The step is by design: `pwr2_shell` rate-limits LOAD RAISES only (sourced to Ginna
UFSAR ch10 §10.1.2.1, ML20339A040: "step load increases of 10% … ramp increases of 5% of full power
per min … Similar step and ramp load reductions are possible"); a dial below the target lands at
once. There is no load-rate control on the board. A 25 MWe drop is 2.5× the sourced step. On the
chain, as the card read: step 2 **0.4 plant-min**, tile peak **595.3 °F** (step 3), alarms
Pressurizer Pressure High (2312 psia), Pressurizer Level Above Program, Heatup Rate High,
Pressurizer Level High, High Coolant Temperature, Pressurizer Pressure Low.

| card route, step 2 | chain: step 2 length / tile peak (steps 2-3) / alarms in 2-3 | preset: tile peak / alarms |
|---|---|---|
| A. LOAD 75 at once, rods left alone (the old card) | 0.4 min / 595.3 °F / six | 584.2 °F / none |
| B. 5 MWe a plant-minute, rods left alone | 4.2 min / 590.8 °F / none | 586.0 °F / none |
| C. 10 MWe a plant-minute, rods left alone | 2.2 min / 592.2 °F / four | 585.3 °F / none |
| **D. 5 MWe a plant-minute, 3-step inserts above 577 °F (shipped)** | **3.4 min / 581.8 °F / none**, leg 22.6 plant-min (A: 23.4) | **583.9 °F / none** |

**Verdict: confirmed.** Step 2 now walks the load: "Lower LOAD 5 MW at a time, one plant-minute apart, to 75 MW:
95, 90, 85, 80, 75", and "After each cut, if AVG COOLANT TEMPERATURE reads above 577 °F, insert 3
steps at MED" (load still leads every cut). OUTPUT row 75 ± 2 MWe (was ± 5, which ticked at 80 on
the way down and flashed). The replay walks the same ramp (`ramp`). Step 3's rod range "15 to 75"
became "5 to 75" (D left 6-15 for step 3). Injection `lower_load_step` (chain) restores the one cut
and reddens the new FORBID check on Pressurizer Pressure High / High Coolant Temperature / Heatup
Rate High in steps 2-3. **Still open:** steps 4-6 are the same shape (25, 20, 15 MWe cuts at once);
on the chain step 4 raises Pressurizer Pressure High and SG Pressure High (peak 587.9 °F) — not
reworked this pass.

## Alarms the text did not name

| alarm | where it came in (measured) | verdict |
|---|---|---|
| Pressurizer Level Above Program | heatup step 10 at 696 psia (4.80 MPa), 212 °F; clears by itself 108 plant-min later (measured on heatup 1, preset; step 9 on the chained heatup 2) | expected; forewarned in 10a |
| Pressurizer Pressure Low | raise power stage 5 on `hot_stage4`, 2150 psia, 173 s | forewarned in 5b |
| Control Rods — Insertion Limit | raise power stage 6 on every route | forewarned in 6b (was only in 10) |
| Cooldown Rate High | shutdown step 3, about a minute after the scram, preset and chain | forewarned in 3b |
| Low Coolant Temperature (cooldown 4) | the TILE read **530.5 °F** when it fired; setpoint 278.0 °C (532.4 °F), a warning in Mode 3 and an expected-status tile in Modes 4-5 — the reviewer's "about 540" was a read of a moving tile | not a defect; forewarned in 4b |
| Pressure Relief Valve Open (cooldown 2) | 2244 psia, open **11 s** then clear (5 s at step 5). The diagram's PORV label and the alarm read the SAME channel (`porv_indicator`, `pwr_board_wiring` `ims2jf7fv7m`) | not a defect: the label read CLOSED after the valve reseated; forewarned in 2a and 5a |

Heatup step 11's four re-arriving alarms (Pressure Low, Very Low, Low Coolant Temperature, Turbine
Trip) come in at 350 °F, the Mode 4 → Mode 3 line, when their cold-plant reclassification lifts —
they never cleared, which is S-6.

## S-6 — re-arriving alarms keep their old stamps

**Measured (code).** `ui/app.js` stamps an alarm on first sight and keeps the stamp while it stays
active; an alarm reclassified to `status` on a cold plant stays active, so at 350 °F it came back
as a critical tile stamped with the moment the cold plant booted (T+00:00:00), or the cooldown hour
it went quiet (T+17:21:47). **Fixed:** a change of priority re-stamps. Not driven in a browser.

## Smaller items

- **Heatup 11 ends at 551 °F against 542 °F.** Route (card speed, Continue 3 plant-s after it lights):
  545.7 °F. The reviewer's extra 5 °F is his harness at 3600× (about 7 plant-min at the heat-up
  rate is a tenth of a second of wall). Not changed.
- **TRIP BLOCKS PZR PRESS LO-LO "pressure rose above P-11" at 1930 psi.** Code: a plant release
  message stands until the row is blocked again (#752 design), so the cooldown shows the heatup's
  release from hours earlier; the header's "2 TRIPS RELEASED BY THE PLANT" is the same two
  messages. Not a defect under the #752 ruling; a ruling is offered (see #653 comment).
- **First BLOCK press re-flowed the panel.** `holdTripPopHeights` holds row and status heights
  while the card is open. Not measured in a browser this pass: NOT VERIFIED.

## Startup (develop's lane — reported, not edited)

- **S-2, 5a at 100 steps.** Current tree's route (chain) stops at bank 86-87 with counts 697 cps
  after 7 one-step taps (9.1-9.9 plant-min); it never reaches 100. Step 2 still ticks at 759 ppm
  (band 679-759) with the dilution running; the text still has no "at 100 and under 7.0e2, wait"
  line. Open for develop.
- **S-4, step 9 flash.** Not reproduced on the current tree (develop's 9b "wait about ten
  plant-minutes" and steady row): preset and chain, player reaction 3 and 15 plant-s
  (`WR_ACK_S=15`), no flash. The gate's reaction model is 3 plant-s at every speed; a person at
  10× takes 10-20. The 1×-then-no-10× speed report was not measured (browser).
