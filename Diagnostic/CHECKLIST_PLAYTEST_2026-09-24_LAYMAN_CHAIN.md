# Layman playthrough — PWR2 walkthrough chain

> **Record, not policy.** Layman pass 4, played 2026-09-24 on workbench f37b2fe9, verified
> 2026-09-25 on `exp/v5-ct` (off workbench a9eae479): all six legs as ONE continuous plant, 6 of 6
> completed (70 of 70 steps, T+35:08). Stuck points: S-1 the clock warps before the step's action
> (runtime, see exp/v5-rt); S-2 the 103 % rod stop is silent and step 8's rod row sat past it
> (narrowed); S-3 raise step 10's "above 351" needs ~5 plant-hours of xenon on the chained plant
> (confirmed); S-4 lower power runs hot and undershoots (narrowed: the 600.3 °F peak is the chain
> seam, not the insert method); S-5 raise stage counts overshoot (confirmed: on the chained plant
> the old counts trip the reactor); S-6 unexplained alarms (not measured, not filed); S-7 critical
> past the prediction (narrowed: −2 to +3 steps, above it on 4 of 10 seeds); S-8 the cooldown stair
> (confirmed: 231 plant-min against a stated 45 min–2.5 h); S-9 the TRIP BLOCKS panel reflows
> (runtime, see exp/v5-rt). **The process finding:** every route gate reloaded each leg's own
> preset, so the plant "Next ▸" hands over — xenon-free, 719 ppm — had never been driven past the
> startup; `run_walkthrough_routes` now runs the chain. Measured with `run_walkthrough_routes`
> (live checklist runtime, full stack, seed 42 unless stated); refuted parts stay in the body below,
> which is the reviewer's record of what the player experienced.

Build under test: workbench f37b2fe9 (page header: "Alpha 1.8.0-rc5 TEST BUILD"). Headless Edge, 1600x1000.
Played as: an intelligent layman who knows pumps and valves. I learned only from the walkthrough panel and the board.
Route: I played all six legs as ONE continuous plant, going from each leg to the next with the "Next: … ▸" button. No leg was reloaded from its own starting condition.
Sim clock: T+00:00 (Mode 5) → T+35:08 (back in Mode 5). Wall time: about 2 h 45 min, including my own harness overhead.

**Harness correction, read first.** On heatup steps 5, 7, 8, 13 and 14, my first click seemed to do nothing. That was MY bug: I reused command names, so the driver skipped the command and handed back its old output. The click never ran. This is **not** a UI defect, and I withdraw it. The 2.8 plant-hours lost at heatup step 14 came from the same bug. The underlying behaviour is still real: the walkthrough switches to 600× before the player has acted (see S-1).

---

## 1. Outcome

| Leg | Result | Steps completed | The one thing that mattered |
|---|---|---|---|
| pwr_heatup (Mode 5 → Mode 3) | Finished | 17 / 17 | Clear and followable. The only real surprises were unexplained alarms, including a red critical "Pressurizer Pressure Very Low" at 1723 psi. |
| pwr_startup (Mode 3 → Mode 1) | Finished | 17 / 17 | The approach to critical is followable but long. Step 9b is ~150 words with seven numeric bands. Critical came at 211 against the 1/M prediction of 210, though the text says "at that position or just below it". |
| pwr_raise_power | Finished, with two off-script moves | 12 / 12 | Step 8: the rods silently stop at 103 % power, so "about 20 steps" cannot be done and the hidden "CONTROL ROD POSITION above 300" check stayed dark. Step 10: "about 6 steps" against a check of "above 351" (50 steps away) at a suggested 1×. I had to invent a 60× pull-as-xenon-builds loop. |
| pwr_lower_power | Finished | 6 / 6 | Tavg reached 593 °F (above the 590 °F trip line the raise leg warns about) while the step told me to wait for the load to come off. "Hold INSERT until back in band" overshoots every time: 49 and 59 steps against "40–75" and "10–45". |
| pwr_shutdown (Mode 1 → Mode 3) | Finished | 3 / 3 | Easy. The turbine tripped itself when LOAD reached 0, before the scram, and nothing said it would. |
| pwr_cooldown (Mode 3 → Mode 5) | Finished | 15 / 15 | Steps 1 and 11 open already at 600×. About 10 s of reading at step 11 cost ~1.7 plant-hours, and the plant arrived at 13 psi with a "Low Subcooling Margin" alarm. The walk down the dump setpoint took ~7 plant-hours against the stated 45 min – 2.5 h. |

**Does the layout help?** Mostly yes. A numbered goal line, then lettered substeps, each with ○/✓, a grey done-when, an italic note and a suggested warp: I always knew what to press next. Three layout problems:

1. **The ✓ on an action line can mean "partly done".** Cooldown 3a showed ✓ while its own sub-line "SI REACTOR TRIP blocked" was still ○.
2. **A greyed "·" substep never says what it is waiting for.** Raise 4b stayed "·" for ~3.7 min wall until the generator and reactor reached 30. Nothing says the second substep waits on the first one's sub-lines.
3. **The notes are sometimes longer than the step.** Startup 9b's note is ~150 words with seven bands of STARTUP RATE.

---

## 2. Stuck points, ranked by severity

### S-1 — The walkthrough runs 600× before the player has done the step's action (heatup 14, startup 2, cooldown 1, cooldown 11)
**Measured:** not re-measured in this lane: the clock, WARP and `#warpInfo` are runtime/UI, owned by `exp/v5-rt`.
**Verdict:** see exp/v5-rt.
- **Quoted** (cooldown 11): "Raise HX SPLIT to 12 % and wait until AVG COOLANT TEMPERATURE reads below 199 °F. … Keep COOLDOWN RATE under 100 °F per hour: if it runs faster, lower HX SPLIT. Watch SUBCOOLING MARGIN: the spray is still running and it keeps taking the margin down." Suggested time warp: 600×.
- **What I did:** Pressed Continue. The step was already at 600× when the panel drew: T+32:28 → 32:41. By the time my "12" + Enter landed (~10 s of wall), the clock read T+34:25. The plant had cooled to ~200 °F on the old 7 % split. The 50 % spray had pulled PRIMARY PRESSURE to 13 psi and SUBCOOLING MARGIN to 14 °F, and "Low Subcooling Margin" came in at T+33:13.
  - Same pattern elsewhere:
    - Cooldown 1: T+22:52 → 24:31 before the boron entry landed.
    - Startup 2: T+09:36 → 12:27 while I was reading.
    - Heatup 14: the warp started before SET PZR PRESSURE was typed.
  - Before the action is done, #warpInfo sometimes reads "fast-forwarding at 1×".
- **What would have unstuck me:** Hold at 1× until the step's action line is ticked, and only then warp for the wait.

### S-2 — Raise step 8: the rods stop by themselves with no sign, so the hidden rod-position check never lights
**Measured:** the stop is the power range high flux rod stop, REACTOR POWER > 103 % (`engines/pwr2/pwr2_protection.js`, WTSM 8.1 §8.1.7.3, ML11223A252). On the gauge-following route the bank ends step 8 at 318 (chained plant) and 346 (preset) and the step completes in 2.2 plant-min; the chained plant reads 103.4 % after step 10's pull. The reviewer's 299 followed his own 3-step pull at stage 6 (the card said 35).
**Verdict:** narrowed — the silent stop is real (a board lamp is runtime, see exp/v5-rt); the strand came from the route, not the plant. The "above 300" check-off is removed anyway (a bank number is a route claim with a fixed boron and a temperature row beside it) and 8b now says what the stop looks like and what to do.
- **Quoted:** "8b· Hold WITHDRAW at MED about 20 steps to settle AVG COOLANT TEMPERATURE on 578 °F." Sub-lines: "CONTROL ROD POSITION above 300", "CONTROL ROD POSITION below 600 (not on its top stop)".
- **What I did:** Held WITHDRAW at MED for 60 s. The rods went 292 → 299 and stopped while I was still holding. REACTOR POWER was 103.4 %. There was no lamp, no alarm and no scanner line saying the rods were blocked; the counter simply stopped. Tavg sat at 576 °F. Continue stayed dark because 299 is not "above 300".
  - Off-script: I waited for power to sag to 101.8 %, then tapped WITHDRAW three times (one tap did not move) to reach 301. It lit at T+16:51:42, about 4 min after the load reached 100.
  - The 103 % rod stop is mentioned only in step 7's note. The heading of step 8 is about temperature, not rod position.
- **What would have unstuck me:** A visible "ROD STOP — power above 103 %" indication on the ROD CONTROL card, and a step that says what to do when the rods stop short of 300.

### S-3 — Raise step 10: "about 6 steps" against a check of "above 351", at 1×
**Measured:** chained plant, gauge-following: bank 318 at step 10, the old "above 351" row met only after 349 plant-min (5.8 h) of 6-step pulls as xenon built; injection `chain_step10_bank` re-opens it and strands at the 3-hour bound. "ROD LIMIT LO-LO" is the Industry label of the alarm whose Learning label is "Control Rods — Insertion Limit" (`layers/control/pwr_control.js`).
**Verdict:** confirmed — step 10 now grades the pull (a command check-off) with the full-load and temperature rows; the note names the alarm in both registers.
- **Quoted:** "○ Hold WITHDRAW at MED for about 6 steps. CONTROL ROD POSITION above 351 … Repeat this pull whenever the temperature drops out of its band. … ROD LIMIT LO-LO is lit and that is normal". Suggested time warp: 1×.
- **What I did:** From 301 I held WITHDRAW for 30 s. The rods reached 305 and stopped again at ~103 % power. Tavg was then in band (579–580 °F), so by the text's own rule there was nothing to do. At 1× xenon moved Tavg about 1 °F per 20 plant-minutes. I was stuck for ~4 min of wall.
  - Off-script: I chose 60× myself. Each time Tavg read 577, I dropped to 1×, held WITHDRAW for 6 s (~3 steps), and went back to 60×. That took 16 pulls, 305 → 352, over T+17:00 → 22:15 (~5 plant-hours, ~9 min wall).
  - "ROD LIMIT LO-LO" is not on the board. The board shows the alarms "Control Rods — Insertion Limit" and "Control Rods — Approaching Insertion Limit". Those had been up and unacknowledged since T+16:35 with no word about them.
- **What would have unstuck me:** Say that the bank has to climb to 352 over a few plant-hours as xenon builds, give a warp for that (60×), and use the alarm's real words.

### S-4 — Lower-power steps 2–5: Tavg overshoots to 593 °F, and "hold until in band" overshoots the other way
**Measured:** chained plant: step 2 ticks at 0.4 plant-min; step 3 peaks at 600.3 °F whether INSERT is held, pulsed, or held then pulsed, because the leg starts at 589.8 °F (preset peak 584.2 °F). Power at the bottom of steps 3–6, held vs 5-step pulses: 64.3 / 39.1 / 20.4 / 7.5 % vs 64.8 / 44.4 / 24.9 / 12.5 % (preset 70.2 / 43.8 / 22.8 / 8.7 vs 71.0 / 44.7 / 26.2 / 9.8). The reviewer's 49 steps were inside "40 to 75"; his 59 were outside "10 to 45".
**Verdict:** narrowed — the undershoot is real and pulses reduce it (text changed, step 3 range now 15–75, step 2 says go straight on); the overheating is the chain seam (raise steps 10–11 on a xenon-free plant), which needs a ruling, not lower-power text.
- **Quoted** (step 2): "Power walks down on its own over about five plant-minutes. AVG COOLANT TEMPERATURE rises out of the green band on its tile while it does — that is expected". Suggested 10×.
  - **Quoted** (step 3): "Now hold INSERT at MED until AVG COOLANT TEMPERATURE is back inside the green band … About 40 to 75 steps".
- **What I did:**
  - Step 2 lit after 1.3 plant-min. When I started step 3, Tavg had already reached 593 °F. The clock dropped itself to 1× with "Dropped to real time — new alarm: high_tavg", showing the internal id to the player.
  - Held INSERT until the tile read 576: 49 steps. Tavg carried on to 572 °F and power fell to 61 % against a 75 MWe load. PRIMARY PRESSURE sagged to ~2070 psi and "Pressurizer Pressure Low" came in.
  - Step 5: 59 steps against "About 10 to 45". Power fell to 18.8 % on a 30 MWe load, COOLDOWN RATE reached -117 °F/hr, and "Cooldown Rate High (>100 °F/hr)" came in.
  - Steps 4 and 6 were already ticked on arrival because of the undershoot. No rod motion was needed.
- **What would have unstuck me:** Tell the player to start inserting as soon as Tavg leaves the band, not after the load has settled. Also tell them to stop inserting a few degrees early, because the tile lags the rods.

### S-5 — Raise steps 5 and 6: fixed step counts fight the band rule once the boron is working
**Measured:** chained plant, the old card's fixed 20/20/35/25/20 pulls: tripped on overtemperature-delta-T at raise step 9, 45.2 plant-min (injection `chain_count_pulls`). Gauge-following nets 21 / 16 / 25 / 22 / 12 steps there and completes.
**Verdict:** confirmed — 4b–8b now read "Hold WITHDRAW at MED until AVG COOLANT TEMPERATURE is back in its band, about N steps."
- **Quoted:** "5b· Hold WITHDRAW at MED about 20 steps to bring AVG COOLANT TEMPERATURE back into its band. The band is near 562 °F" and "6b· Hold WITHDRAW at MED about 35 steps … near 570 °F".
- **What I did:**
  - Step 5: 5b ticked itself with Tavg at 553 (window 550–583) before I touched the rods. I did the 20-step pull as written, and Tavg overshot to 570 °F, 8 °F above the 562 band.
  - Step 6: 6b ticked itself again at 568. A literal 35-step pull would have headed for the 590 °F trip, so I pulled 3 steps instead. This was off-script.
- **What would have unstuck me:** Size the pull to the gap ("withdraw until Tavg reads the band value") rather than giving a step count.

### S-6 — Unexplained alarms all through the chain
**Measured:** not measured in this pass.
**Verdict:** not filed. The "Shutdown Cooling Not In Service" wording is alarm text in `layers/` (exp/v5-rt's lane).
- **Quoted:** No step mentions any of these.
  - Heatup: "Shutdown Cooling Not In Service — RCS Is Below the RHR Entry Pressure" (step 9). It reads backwards to a layman, because pressure is ABOVE the RHR entry pressure.
  - Heatup: a red critical "Pressurizer Pressure Very Low" at 1723 psi (end of step 11).
  - Raise: "Control Rods — Insertion Limit" and "Control Rods — Approaching Insertion Limit".
  - Cooldown: "Low Coolant Temperature" and "Low Subcooling Margin".
  - Shutdown: "Steam Generator Pressure High", with ATMOS DUMP at 47 %.
- **What I did:** Nothing. I could not tell which alarms were expected.
- **What would have unstuck me:** One line per step naming the alarms that are expected at that point.

### S-7 — Startup 9: the approach ladder is hard to hold in your head, and critical came past the prediction
**Measured:** `run_walkthrough_routes` typical route, seeds 1–10: 9b ticked at the prediction +0, −2, +3, +3, −1, −1, +1, −1, 0, +2 steps (above it on 4 of 10); chained plant +0; the reviewer +1.
**Verdict:** narrowed — "critical at that position or just below it" describes true criticality; the +0.06 that 9b grades lands up to 3 steps past it. 8b now says so; a 58-word 9b note is PROPOSED, not shipped (02's Notes).
- **Quoted:** "The reactor goes critical at that position or just below it" (8b), and "Press SLOW, then hold CONTROL WITHDRAW until CONTROL ROD POSITION is 3 steps short of the predicted position" (9a). The 9b note has bands at 0.01 / 0.02–0.05 / 0.06–0.10 / ~0.15 / ~0.5 / 1.0.
- **What I did:** The prediction was 210, so I stopped at 207. STARTUP RATE settled at +0.01, then +0.02 at 208 and +0.03–0.04 at 209. At 210 it flickered between +0.05 and +0.06, which sits between "tap" and "fine". It settled at +0.08 at 211 and 9b ticked. That was four taps of 5–15 plant-minutes each (~15 min wall). The player switches between 1× and 10× by hand every tap.
- **What would have unstuck me:** Say "critical is usually 0–2 steps past the prediction", and fold 9b into three bands.

### S-8 — Cooldown 4: "wait until Tavg stops falling", 18 times, on a tile that only shows whole degrees
**Measured:** 18 entries 1020 → 120 psi: reading the whole-degree tile until it repeats five plant-minutes apart, 231.3 plant-min (preset); a fixed 5-minute wait, 90.7 (preset) and 91.0 (chained). Injection `cooldown_until_flat` fails the new stated-time check.
**Verdict:** confirmed — 4b now says wait about 5 plant-minutes, about an hour and a half in all.
- **Quoted:** "Lower DUMP SETPOINT 50 psi at a time from 1020 to 120. … Wait between steps until AVG COOLANT TEMPERATURE stops falling, about 1 to 5 plant-minutes. About 45 plant-minutes to two and a half plant-hours in all." Suggested 60×.
- **What I did:** 18 entries. After each I waited until the tile read the same value twice, 5 s apart at 60×. It took ~7 plant-hours (T+25:20 → 32:13) and ~10 min of wall. The last step, 170 → 120, gave COOLDOWN RATE -125 °F/hr.
- **What would have unstuck me:** A concrete cue, such as "COOLDOWN RATE back near 0", plus a time estimate that matches.

### S-9 — Cooldown 3: the trip-block panel moves under your cursor
**Measured:** not re-measured in this lane: TRIP BLOCKS layout is UI, owned by `exp/v5-rt`.
**Verdict:** see exp/v5-rt.
- **Quoted:** "Press TRIP BLOCKS, then BLOCK the PZR PRESS LO-LO and SI REACTOR TRIP rows."
- **What I did:** After I blocked PZR PRESS LO-LO, its row lost a text line and the SI REACTOR TRIP BLOCK button moved up ~9 px. My second click hit nothing, and I had to re-aim.
- **What would have unstuck me:** Fixed row heights in the TRIP BLOCKS panel.

---

## 3. Per-step log

### Heatup (pwr_heatup) — T+00:00 → 09:25, ~25 min wall
- **S1** "Verify the plant is cold and shut down."
  - Lit at T+0. AVG COOLANT TEMPERATURE 122 °F, PRIMARY PRESSURE 363 psi.
  - The text says "RCP FLOW OFF", but the RCP FLOW figure reads "3 %" with the OFF button lit.
  - shot h00_start.
- **S2** "Start the reactor coolant pumps."
  - Pressed ON beside OFF under the pump symbol. RCP FLOW went 3 → 34 % in 5 s. Lit after ~13 s at 1×.
  - shot h02.
- **S3** "Withdraw the shutdown bank all the way out."
  - FAST, then one click on WITHDRAW under SHUTDOWN.
  - Before 3a, #warpInfo read "About 11 plant-minutes left at 1× — fast-forwarding at 1×."
  - After the click, the walkthrough went to 60× by itself: T+00:03 → 00:10 in ~14 s wall. It then showed "Wait complete — back at 1× (this step fast-forwards at 60×)." Lit.
  - shot h03a.
- **S4** "Verify the turbine is tripped, nothing to press."
  - Lit at once.
  - shot h04 (clear).
- **S5** "Put steam generator level control in AUTO while the plant is quiet."
  - SG FEED AUTO. Lit.
  - shot h05b.
- **S6** "Verify the STEAM DUMP is closed, nothing to press."
  - Lit at once.
  - The done-when "STEAM DUMP opening under 1 %" refers to a number the STEAM DUMP card does not show. The only "0 %" figures are unlabelled ones on the diagram.
- **S7** "Open the letdown orifices before the pressure climb shuts the RHR path."
  - A+B 7 %. Lit.
  - Odd layout: "Orifice A in service" is a grey note, while "Orifice B in service" has its own circle.
  - shot h07b.
- **S8** "Put pressurizer spray in service before the heaters start the climb."
  - AUTO under SPRAY. Lit. The note is clear.
  - shot h08b.
- **S9** "Raise PRIMARY PRESSURE to the 665 psi accumulator window on the heaters."
  - AUTO under HEATER. The walkthrough went to 600×: T+00:12 → 00:53 in ~12 s. It then dropped to 1× with "Held at real time — the plant needs you here". Lit.
  - The "Shutdown Cooling Not In Service…" alarm appeared at T+00:32.
  - shots h09a, h09b.
- **S10** "Open the accumulator valve while PRIMARY PRESSURE is inside its window."
  - The pulsing green ring made the valve easy to find. One click. Lit.
  - shots h10, h10b.
- **S11** "Heat the plant to 542 °F on pump heat alone."
  - Did nothing. The walkthrough ran 3600× while #warpInfo said "Held at real time — the plant needs you here", which contradicts the lit 3600× button.
  - T+00:53 → 06:06 in < 40 s wall. It stopped at 552 °F (10 °F past the target).
  - End state: 1723 psi, PZR LEVEL 30 %, STEAM PRESS 1057 psi (above the 1020 setpoint). Three unacknowledged alarms, including the red critical "Pressurizer Pressure Very Low".
  - The background says PRESSURIZER LEVEL is rising, but it went 25 → 33 → 30 %.
  - shot h11b.
- **S12** "Confirm letdown now leaves only through the orifices."
  - Lit at once: ISOLATE lit, LETDOWN 10 gpm.
  - This step explains the step-9 alarm, one step late.
- **S13** "Hand STEAM PRESS to the steam dump to hold."
  - AUTO on STEAM DUMP. Lit.
  - shot h13b.
- **S14** "Bring PRIMARY PRESSURE up to normal operating pressure."
  - The walkthrough was at 600× before I typed. My first entry was lost to my harness bug. Typed 2235 + Enter.
  - Pressure 1707 → 2155 psi. Lit at T+09:14.
  - A red "→ 350×" / "→ 420×" badge sat beside the 600× button and was never explained.
  - The TRIP BLOCKS lamp turned amber, also unexplained.
  - shots h14, h14b.
- **S15** "Verify Hot Standby." Lit at once.
- **S16** "Verify the reactor stayed shut down."
  - At 10× (walkthrough-set), ~60 s wall, 10 plant-min. Lit.
  - #warpInfo still read "Held at real time".
- **S17** "Confirm the heatup made no fission power." Lit at once.
- **Complete.** "Next: Mode 3, Hot Standby → Mode 1, At Power — startup to power ▸".

### Startup (pwr_startup) — T+09:25 → 16:17, ~55 min wall
- **S1** "Verify the plant is hot and shut down before any rod moves."
  - Lit at once. Pressed ACK on "Turbine Trip / Low Steam Demand" as the note says.
  - shot s01.
- **S2** "Bring boron down to the estimated critical concentration, 719 ppm."
  - The step opened at 600× before I typed: T+09:36 → 12:27.
  - Typed 719 + Enter. BORON STATUS read "DILUTING 31 %".
  - Lit at T+13:31 with BORON CHEM 751, still diluting. Continue lights before the dose finishes.
  - The warp line is long and conditional.
  - shot s02z.
- **S3** "Line up the heat sink before the reactor makes any heat." Lit at once.
- **S4** "Take the 1/M baseline point before any rod moves."
  - 1/M PLOT opened a floating window over the SG FEED / STEAM DUMP cards. Pressed Plot point. Lit.
  - Boron was still diluting (750 ppm, "DILUTING 30 %"), and nothing said to wait for it.
  - shot s04.
- **S5** "Withdraw the control rod group and plot a second point…"
  - MED, then held WITHDRAW 23 s at 5×: 0 → 85.
  - SOURCE RANGE read 6.4e2, below "about 7.0e2 or more". I withdrew to 95, and 5a ticked at 7.3e2.
  - The text does not say what to do when the position is reached but the counts are not.
  - 5b: STARTUP RATE +0.01, Plot point. Lit. ~4 min wall.
  - shots s05z, s05nis.
- **S6** "Withdraw again and plot a third point; the prediction tightens."
  - 95 → 160 in an 18 s hold. STARTUP RATE +0.06 → +0.03.
  - Plot point showed "predicted criticality ≈ step 205 (32.7% withdrawn)". Lit.
  - shot s06plot.
- **S7** "Withdraw a shorter pull and plot a fourth point…"
  - 160 → 190. STARTUP RATE took ~90 s wall to fall from +0.16 to +0.03.
  - The prediction moved OUT to 214, although the text says the crossing "walks in". Lit.
  - shot s07plot.
- **S8** "Withdraw the last short pull and plot the final point…"
  - 190 → 199. SOURCE RANGE 7.0e3 about 1 plant-min later. STARTUP RATE reached +0.02 in ~2.5 plant-min.
  - Prediction 210 (C = 8183 cps). Lit.
  - shot s08plot.
- **S9** "Bring the control rods to the edge of criticality without going past it."
  - SLOW, held 57 s at 1×: 199 → 207.
  - Tapped 207 → 208 → 209 → 210 → 211. STARTUP RATE settled at +0.01, then +0.02, +0.03/0.04, +0.05/0.06, and +0.08.
  - 9b ticked at 211, T+15:13. SOURCE RANGE blanked above 1e5 as warned. #warpInfo went blank. ~15 min wall.
  - See S-7. shot s09end.
- **S10** "Let the reactor carry power up from critical, reading INTER RANGE rather than REACTOR POWER."
  - At 10×, INTER RANGE went 2.5e-7 → 4.1e-6 A. Power read 0.1 % after 16 plant-min, faster than the note's 30–60. Lit.
  - shot s10end.
- **S11** "Let power climb past the point of adding heat, tapping WITHDRAW only if the climb stalls."
  - Closed the 1/M window with ✕. No tap needed. Power 0.1 → 0.5 % in 14 plant-min. Lit.
- **S12** "Let power level itself off below 5 %."
  - Power levelled at 1.4 %, and STARTUP RATE came back to 0.00. Lit after 24 plant-min, matching the ~20 in the text.
- **S13** "Cross the 5 % line deliberately."
  - SLOW, held 21 s at 5×: 211 → 224. Power reached 5.1 % ~2 plant-min later. Lit.
- **S14** "Put the turbine on line and let the reactor follow it up."
  - LATCH, then LOAD 10. OUTPUT 9 MW. Lit.
  - The LOAD box says "MW" while the scanner says "MWe".
  - shot s14end.
- **S15** "Block the first startup trip once REACTOR POWER is above 9 ½ %."
  - Waited ~40 s for power to go from 8.8 to 9.7 %. TRIP BLOCKS, then BLOCK on the IR HIGH FLUX row. Lit.
  - The panel header is dense jargon: "2 WAITING ON ITS PERMISSIVE · 2 TRIPS RELEASED BY THE PLANT".
  - shot s15a.
- **S16** "Block the second startup trip and close the panel."
  - Reopened TRIP BLOCKS, BLOCK on PR HIGH (LOW SETPT). Both rows read BLOCKED. Closed the panel. Lit.
  - shot s16b.
- **S17** "Verify Mode 1, At Power." Lit at once.

### Raise power (pwr_raise_power) — T+16:17 → 22:37, ~40 min wall
- **S1** "Confirm the plant the startup handed over is ready to climb."
  - Lit at once. The text says "both startup trips lit on TRIP BLOCKS", while the panel's word is "BLOCKED".
- **S2** "Make sure the turbine is on line and taking steam." Lit at once.
- **S3** "Start the boron dilution that carries most of the climb."
  - Typed 660. Lit at once.
  - The text calls it "this 24 ppm move", but from the chained plant it is 59 ppm (719 → 660).
- **S4** "Take the first stage to 30 MWe, load leading and rods following."
  - LOAD 30. 4b stayed "·" for ~3.7 min wall, and Tavg sagged 551 → 543.
  - MED, WITHDRAW 20 steps (224 → 244) in 26 s. Power overshot to 39 %. Tavg 553. Lit.
  - I could not find a distinct "green band" on the tile.
  - shot r04z.
- **S5** "Take the second stage to 50 MWe the same way."
  - 5b ticked itself with no pull. I did the 20-step pull anyway, and Tavg overshot to 570 (band 562). See S-5.
  - shot r05z.
- **S6** "Take the third stage to 75 MWe the same way."
  - 6b ticked itself at 568. I pulled 3 steps instead of 35 (off-script). See S-5.
- **S7** "Take the fourth stage to 90 MWe with a smaller pull."
  - LOAD 90, then 25 steps (267 → 292). Power peaked at 96 % and settled at 92.6 %. Tavg 573. Lit. Worked as written.
- **S8** "Take the last stage to full load and settle the temperature on 578 °F."
  - Rods stopped at 299 on the 103 % rod stop. I tapped to 301 (off-script). Lit.
  - See S-2. shot r08b.
- **S9** "Confirm full power, with the boron dilution done." Lit at once.
- **S10** "Start giving back the reactivity xenon takes, rods first."
  - Stuck. 16 pulls at 60× that I devised myself, 305 → 352. Lit at T+22:15.
  - See S-3. shot r10end.
- **S11** "Give boron its first small dose as xenon builds."
  - Typed 650. Lit after ~4 plant-min.
  - "not the whole 43": 43 of what is never said.
- **S12** "Hold full power on programme while xenon builds."
  - Lit at once. "Keep trimming for the next two plant-days", but the leg ends here.

### Lower power (pwr_lower_power) — T+22:37 → 22:51, ~14 min wall
- **S1** "Start adding boron before any load comes off." Typed 719. Lit.
- **S2** "Take the first load off the turbine and let the reactor follow it down."
  - LOAD 75. Lit after 1.3 plant-min with power still 86 % and falling, Tavg 585.
  - shot l02s.
- **S3** "Bring AVG COOLANT TEMPERATURE back into its band with the rods."
  - Tavg 593, then high_tavg dropped the clock to 1×. 49 steps INSERT. Undershot to 572 °F and 61 % power, with the Pressurizer Pressure Low alarm. Lit.
  - See S-4. shot l03a.
- **S4** "Take the load down to 50 MWe, then trim…"
  - 4b was already ticked. LOAD 50. Lit with no rod motion.
  - shot l04s.
- **S5** "Take the load down to 30 MWe, then trim…"
  - 59 steps INSERT (text: 10–45). Power fell to 18.8 %. Cooldown Rate High alarm. Lit.
  - shot l05z.
- **S6** "Take the load down to 15 MWe, then trim…"
  - Already ticked. LOAD 15. Lit with Tavg 544 (below the band's bottom of 547).
  - shot l06s.

### Shutdown (pwr_shutdown) — T+22:51 → 22:52, ~2 min wall
- **S1** "Take the load off the generator before the scram."
  - LOAD 0. OUTPUT fell below 5 in ~8 s. Lit.
  - The turbine tripped itself at T+22:51:34.
- **S2** "Shut the reactor down with a planned scram."
  - SCRAM (PRESS TO ARM), then SCRAM. SCRAMMED / PRESS TO RESET, both banks at 0. Lit.
  - Unmentioned: Steam Generator Pressure High, ATMOS DUMP at 47 %.
  - shot d02b.
- **S3** "Put the decay heat on the steam dump: Mode 3, Hot Standby."
  - Both substeps were already ticked (dump in AUTO/PRESS since the heatup). Lit.

### Cooldown (pwr_cooldown) — T+22:52 → 35:08, ~25 min wall
- **S1** "Add the boron a cold core needs before any cooling starts."
  - The step opened at 600×. Typed 920 at T+24:31. Lit at T+25:17.
  - #warpInfo still showed the previous leg's "Dropped to real time — new alarm: pzr_pressure_low", and kept showing it for the rest of the leg.
- **S2** "Bring pressure under the point where the low-pressure protection can be switched off."
  - SET PZR PRESSURE 1900. 2246 → 1949 in ~17 s. Lit.
- **S3** "Switch off the protection that would read the cooldown as a leak."
  - TRIP BLOCKS, then BLOCK ×2. The panel re-flowed between the two clicks; see S-9.
  - ECCS STOP was already drawn red-lit before I pressed it. Lit.
  - shots c03a, c03c.
- **S4** "Cool the plant on the steam dump to where RHR can take over."
  - 18 setpoint entries. 547 → 345 °F over ~7 plant-hours. Lit.
  - PRIMARY PRESSURE held at ~1900 throughout. The "Low Coolant Temperature" alarm is unmentioned.
  - See S-8. shot c04z.
- **S5** "Take the pressure setpoint to the bottom of its range." Typed 1700. Pressure reached 1730. Lit.
- **S6** "Hand pressure control from the heaters to the spray."
  - OFF under HEATER. Typed 50 in the SPRAY box, then pressed MANUAL; the text does not say which comes first.
  - Pressure 1567 psi. Lit.
- **S7** "Isolate the accumulators while pressure is inside their window."
  - Clicked the ringed valve. Lit.
  - The note says "above and right of the ACCUMULATORS tile, beside ECCS FLOW". It is really above the tile and left of the ECCS INJ FLOW label.
- **S8** "Bring pressure under the RHR limit on the spray."
  - At 60× for ~10 plant-min. PZR level 31 %. Lit.
- **S9** "Put RHR in service as the cooldown loop."
  - ALIGN, then HX SPLIT 7. Lit in 5 s.
  - shot c09s.
- **S10** "Take the reactor coolant pumps off now that RHR is circulating."
  - RCP OFF. Coasted down. Lit.
  - shot c10.
- **S11** "Cool on RHR into Mode 5, at about the 100 °F per hour limit."
  - The step opened at 600×, and my HX SPLIT 12 landed ~1.7 plant-hours late.
  - Lit at T+35:07 with Tavg 195. Pressure 13 psi, SUBCOOLING MARGIN 14 °F, "Low Subcooling Margin" alarm.
  - See S-1. shot c11s.
- **S12** "Shut the spray now that the plant is cold." OFF under SPRAY. Lit.
- **S13** "Confirm the plant is in Mode 5, Cold Shutdown." Lit at once.
- **S14** "Confirm the accumulators are still full and isolated." Lit at once.
- **S15** "Confirm RHR is carrying the heat." Lit at once.
- **Complete.** "Mode 5, Cold Shutdown: water below 199 °F…".

---

## 4. Words and numbers I could not find on the board

| Walkthrough says | What the board actually shows |
|---|---|
| "RCP FLOW OFF" (heatup 1) | RCP FLOW reads "3 %", with the OFF button lit |
| "STEAM DUMP opening under 1 %" (heatup 6) | The STEAM DUMP card has no opening %. The diagram has unlabelled "0 %" figures |
| "the green band on the tile" / "The band is near 556 °F" (raise 4–8, lower 3–6) | The AVG COOLANT TEMPERATURE tile has a thin multi-coloured strip with a marker. I could not read a green band or a band value from it |
| "ROD LIMIT LO-LO is lit" (raise 10) | No such lamp. The alarm list shows "Control Rods — Insertion Limit" and "Control Rods — Approaching Insertion Limit" |
| "above 103 % power the plant stops the rods" (raise 7 note) | No visible rod-stop indication anywhere. The rod counter simply stops |
| "both startup trips lit on TRIP BLOCKS" (raise 1) | The panel word is "BLOCKED" |
| "this 24 ppm move" (raise 3) | BORON box 719 → 660, a 59 ppm move from the chained plant |
| "not the whole 43" (raise 11) | No 43 anywhere. 660 − 617 = 43 is only inferable from the next step |
| "The symbol sits above and right of the ACCUMULATORS tile, beside ECCS FLOW" (cooldown 7) | The valve is above the tile and left of "ECCS INJ FLOW" |
| "LOAD … MW" box vs "MWe" in text and scanner | Mixed units for the same quantity |
| #warpInfo "Held at real time — the plant needs you here" | Shown while the 3600×, 600× or 10× button is lit |
| #warpInfo "fast-forwarding at 1×" | Shown before the step's action is done. "Fast-forwarding" at 1× reads as a contradiction |
| #warpInfo "new alarm: high_tavg" / "pzr_pressure_low" | Internal ids. The alarm list says "Pressurizer Pressure Low", and high_tavg has no matching alarm card |
| Red "→ 350×" / "→ 420×" badge beside the speed bar | Not explained anywhere in the walkthrough |
| OPΔT on the NIS card (115 % at low power, 12.4 % at full power) | Never mentioned. It looks alarming to a layman |
| "Shutdown Cooling Not In Service — RCS Is Below the RHR Entry Pressure" (alarm text) | At that moment pressure was ABOVE the RHR entry pressure, so the wording reads backwards |

---

## 5. What the text got right

- Every control named in an action was on the board under exactly those words (SG FEED, A+B 7 %, AUTO under SPRAY/HEATER, DUMP SETPOINT, HX SPLIT, ALIGN, TRIP BLOCKS rows, SCRAM / PRESS TO ARM).
- The pulsing ring on the accumulator valve made a diagram symbol findable on the first try, twice.
- The "nothing to press" verify steps (heatup 4 and 6) warned that the ringed lamp is not a button.
- The counts shorthand was explained once and clearly ("7.0e2 is 700 counts a second").
- Warning that SOURCE RANGE blanks above 1e5 stopped me thinking it had failed.
- Waiting for STARTUP RATE +0.03 before each 1/M point, with a timing hint, worked as stated.
- Startup 12's "climb stops by itself about twenty plant-minutes after this step opens" matched: 24 plant-min.
- Startup 15's explanation of why BLOCK may not take below 9 ½ % pre-empted the confusion.
- Raise 7 worked exactly as written: 25 steps put Tavg 2 °F under the band.
- The shutdown leg was short, unambiguous and worked first time.
- Cooldown 8's "Do not switch the spray off", with the reason (ALIGN refuses above 440 psi), was correct and needed.
- Cooldown 10b's "Leave SPRAY at 50 %" pre-empted the natural urge to shut it with the pumps.
- Each finished leg offered the next with a "Next: … ▸" button, and the plant carried over continuously.
