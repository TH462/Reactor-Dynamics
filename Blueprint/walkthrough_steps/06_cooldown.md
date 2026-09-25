# Cooldown to Mode 5, Cold Shutdown

**Walkthrough id: `pwr_cooldown`  ·  15 steps**

> Edit this freely — it is the step text, and it is what the sim is brought down to.
>
> **The format** (adopted 2026-09-24 from `02_mode3_to_mode1.md`). Line one of a step is what the
> step accomplishes. Each lettered substep opens with the action that accomplishes it, then its
> own Note, its own **Suggested time warp**, and its check-off lines drawn `()`. Background closes
> the step. Agent notes go at the END of the file, never between the steps.

---

1. Add the boron a cold core needs before any cooling starts.

1a. On the BORON card set 920 and press Enter.

Note: Press ON only if it is not already lit. Do not start cooling until BORON STATUS reads BORATING.

Suggested time warp: 600× — the boration runs at a steady 3 ppm a minute and does not slow down as it closes: about 54 plant-minutes to 880 ppm.

()  BORON CHEM 880 ppm or more

Background

Hot, the plant is comfortably shut down on about 719 ppm of boron. Cold water makes the chain reaction easier, and the same core at 122 °F needs about 920 ppm for the same margin. Adding it first means the margin arrives before the cold does.

[HIGHLIGHTED: Boron Target (pulsing); Boron Status, Boron Concentration (steady)]



2. Bring pressure under the point where the low-pressure protection can be switched off.

2a. Lower SET PZR PRESSURE to 1900 psi.

Note: Below 1972 psi the plant lets you switch off the protection in the next step.

Suggested time warp: 1×.

()  PRIMARY PRESSURE below 1972 psi

Background

Two automatic protections watch for falling pressure, because on a running plant falling pressure means a leak. They can only be switched off below 1972 psi, so the setpoint comes under that first. This is not the depressurization; it only unlocks the next step.

[HIGHLIGHTED: Pressure SP (pulsing); Primary Pressure (steady)]



3. Switch off the protection that would read the cooldown as a leak.

3a. Press TRIP BLOCKS, then BLOCK the PZR PRESS LO-LO and SI REACTOR TRIP rows.

Note: TRIP BLOCKS is on the ROD CONTROL card.

Suggested time warp: 1×.

()  PZR PRESS LO-LO reads BLOCKED
()  SI REACTOR TRIP reads BLOCKED

3b. Press STOP on ECCS.

Note: STOP is on the ECCS card.

Suggested time warp: 1×.

()  STOP pressed on the ECCS card

Background

To the automatic protection, a cooldown looks exactly like a leak: pressure falling on a hot plant. Left on, the first cooling stage would trip the reactor and start the emergency injection pumps, flooding the plant with cold water you did not ask for. STOP on the ECCS card takes the injection pump out of standby as well.

[HIGHLIGHTED: Trip Blocks, ECCS (pulsing)]



4. Cool the plant on the steam dump to where RHR can take over.

4a. Press AUTO on the STEAM DUMP card.

Note: Press AUTO until the status reads PRESS; in TAVG mode the setpoint does nothing.

Suggested time warp: 1×.

()  STEAM DUMP AUTO lit, status PRESS

4b. Lower DUMP SETPOINT 50 psi at a time from 1020 to 120.

Note: Small steps: one big jump drops the coolant fast and empties the pressurizer. Wait between steps until AVG COOLANT TEMPERATURE stops falling, about 1 to 5 plant-minutes. About 45 plant-minutes to two and a half plant-hours in all.

Suggested time warp: 60×.

()  AVG COOLANT TEMPERATURE below 347 °F

Background

Steam pressure and steam temperature go together: lower the pressure the dump holds and the steam generator boils at a lower temperature, which pulls the reactor water down after it. It cannot pull the water below its own boiling point, so the walk goes all the way to 120 psi, about 341 °F, low enough for RHR to take over.

[HIGHLIGHTED: Steam Dump — Auto, Dump Setpoint (pulsing); Steam Dump Status, Tavg (steady)]



5. Take the pressure setpoint to the bottom of its range.

5a. Lower SET PZR PRESSURE to 1700 psi, as low as the box goes.

Note: From here pressure comes down by hand.

Suggested time warp: 1×.

()  PRIMARY PRESSURE below 1770 psi

Background

The setpoint box is the at-power pressure control and it stops at 1700 psi. A real cooldown leaves it exactly there: below it the heaters have nothing to hold, and the operator lowers pressure with the spray instead.

[HIGHLIGHTED: Pressure SP (pulsing); Primary Pressure (steady)]



6. Hand pressure control from the heaters to the spray.

6a. Press OFF under HEATER.

Note: Heaters first: with them still in AUTO the spray will not hold and pressure climbs back instead of falling.

Suggested time warp: 1×.

()  OFF lit under HEATER

6b. Press MANUAL under SPRAY with its box at 50 %, not more.

Note: Spray water goes into the pressurizer and PRESSURIZER LEVEL climbs as pressure falls. At 100 % a pressurizer that starts high fills completely, after which the spray shuts itself off. At 50 % pressure falls about 3 psi a second with room to spare.

Suggested time warp: 5×.

()  PZR SPRAY at 50 %
()  PRIMARY PRESSURE below 1615 psi

Background

The heaters go off first, or they boil water as fast as the spray condenses it and pressure goes nowhere. Spray condenses steam in the pressurizer and pressure falls; the setpoint box has nothing left to hold. Lowering pressure spends SUBCOOLING MARGIN, how far the reactor water is below boiling, and that has to stay positive.

[HIGHLIGHTED: Pressurizer Heaters (PZR), Pressurizer Spray (PZR) (pulsing); Primary Pressure (steady)]



7. Isolate the accumulators while pressure is inside their window.

7a. Close the accumulator valve: click the valve symbol inside the pulsing ring while PRIMARY PRESSURE is 1615 to 665 psi.

Note: The symbol sits above and right of the ACCUMULATORS tile, beside ECCS FLOW. At 50 % spray the window is about 8 plant-minutes wide.

Suggested time warp: 1×.

()  ACCUMULATORS tile reads ISOLATED

Background

The same window as the heatup, in reverse. Above 1615 psi the valve has no power; below 665 psi the nitrogen in the tanks pushes their water into the plant. Close it in between and the tanks stay full for the next heatup.

[HIGHLIGHTED: Accumulator valve (pulsing); Primary Pressure (steady)]



8. Bring pressure under the RHR limit on the spray.

8a. Wait, with SPRAY still at 50 %, until PRIMARY PRESSURE falls below 413 psi. Do not switch the spray off.

Note: About 10 to 13 plant-minutes. If PRESSURIZER LEVEL climbs past 80 %, lower SPRAY.

Suggested time warp: 60×.

()  PRIMARY PRESSURE below 413 psi

Background

ALIGN on the RHR card refuses to open the suction valve above 440 psi. Switch the spray off now and pressure bounces back over that number before you get there. SUBCOOLING MARGIN stays well above 100 °F on this spray.

[HIGHLIGHTED: Pressurizer Spray (PZR), Primary Pressure, Pressurizer Level (steady)]



9. Put RHR in service as the cooldown loop.

9a. With the spray still on, press ALIGN on the RHR card.

Suggested time warp: 1×.

()  ALIGN lit on the RHR card

9b. Set HX SPLIT to 7 %.

Suggested time warp: 1×.

()  HX SPLIT at 7 %

Background

RHR is the low-pressure cooling loop that carries heat out of a shut-down plant. ALIGN opens its suction valve, which the plant only allows below 440 psi. HX SPLIT is how much of that loop goes through the heat exchanger; from here it is the cooldown throttle, 7 % is a gentle start, and COOLDOWN RATE beside it shows what that choice is doing.

[HIGHLIGHTED: Residual Heat Removal (RHR) (pulsing); Primary Pressure (steady)]



10. Take the reactor coolant pumps off now that RHR is circulating.

10a. Press OFF on the RCP FLOW card.

Suggested time warp: 1×.

()  Pumps coasting down

10b. Leave SPRAY at 50 %.

Note: Do not switch the spray off yet — a later step does that, once the plant is cold.

Suggested time warp: 1×.

()  SPRAY still on

Background

With RHR circulating, the reactor coolant pumps are only adding heat, so they come off. The spray stays: the pressurizer shell is still hot metal and it keeps boiling water off the top of the pressurizer, which puts pressure back up. It is the only thing taking that heat away now — the heaters are already off and the SET PZR PRESSURE box stopped reaching at 1700 psi.

[HIGHLIGHTED: RCP Run/Stop, Pressurizer Spray (PZR) (pulsing)]



11. Cool on RHR into Mode 5, at about the 100 °F per hour limit.

11a. Raise HX SPLIT to 12 % and wait until AVG COOLANT TEMPERATURE reads below 199 °F.

Note: Keep COOLDOWN RATE under 100 °F per hour: if it runs faster, lower HX SPLIT. Watch SUBCOOLING MARGIN: the spray is still running and it keeps taking the margin down. The next step shuts it.

Suggested time warp: 600×.

()  AVG COOLANT TEMPERATURE below 199 °F

Background

HX SPLIT is the cooldown rate now, and COOLDOWN RATE beside it is the read-back. At 12 % the read-back climbs to a little over 100 °F per hour in the first half hour, then eases off as the plant closes on the RHR sink, reaching Mode 5 in about an hour and a half to two hours; the read-back is smoothed over about ten minutes, so for the first few minutes the plant itself cools faster, near 150 °F per hour. Turn it higher and you go well over the 100 °F per hour limit: 25 % measures 193 °F per hour.

[HIGHLIGHTED: Residual Heat Removal (RHR) (pulsing); Tavg (steady)]



12. Shut the spray now that the plant is cold.

12a. On the PRESSURIZER (PZR) card press OFF under SPRAY.

Suggested time warp: 1×.

()  OFF lit under SPRAY

Background

The plant is cold now and the pressurizer shell has given up most of its stored heat, so there is nothing left for the spray to take away. Shut it and pressure sits where it is. This is the lineup the Cold Shutdown preset holds: heaters off, spray in hand and shut.

[HIGHLIGHTED: Pressurizer Spray (PZR) (pulsing)]



13. Confirm the plant is in Mode 5, Cold Shutdown.

13a. Verify Cold Shutdown: AVG COOLANT TEMPERATURE below 199 °F, RCP FLOW off, ALIGN lit on the RHR card.

Note: PRIMARY PRESSURE will be low — the spray took it there.

Suggested time warp: 1×.

()  Plant in Mode 5, Cold Shutdown

Background

This is the cold-shutdown picture: water below 199 °F, pumps off, RHR carrying the heat, pressure low with the spray shut. The heatup walkthrough takes it back up.

[HIGHLIGHTED: Tavg, Primary Pressure (steady)]



14. Confirm the accumulators are still full and isolated.

14a. Verify the ACCUMULATORS tile reads 100 % and ISOLATED.

Suggested time warp: 1×.

()  ACCUMULATORS reads 100 %

Background

You isolated the tanks on the way down so they would not empty into a depressurized plant. They have to still be full: the next heatup opens them again inside its window, and empty tanks then are a missing safety system.

[HIGHLIGHTED: Accumulators (steady)]



15. Confirm RHR is carrying the heat.

15a. Verify ALIGN is lit on the RHR card and HX SPLIT is above 0 %. The round trip is complete.

Suggested time warp: 1×.

()  ALIGN lit on the RHR card
()  HX SPLIT above 0 %

Background

RHR is the only thing removing heat now. If its suction valve shut, the decay heat would have nowhere to go. The heatup walkthrough is the way back.

[HIGHLIGHTED: Residual Heat Removal (RHR) (steady)]



## Notes — agent record, NOT step text

### Reconcile record — 2026-09-24, wt-cooldown (TUNING_LOG 2026-09-24-workbench-e) (the step format adopted, brought down to the sim)

*OWNER DIRECTIVE, 2026-09-24: "Adopt the format for the other walkthroughs." The sim's `pwr_cooldown`
(`ui/manual_procedures.js`, the PWR2 pool) carries this text word for word: step `text` = the goal
line, each lettered substep = one `accs` head (`ask`, `note`, `wait_speed`/`speed_text`, `label`),
each further `()` = a `cont` row, `why` = Background. Previous text: `git show HEAD~1:<this file>`.*

**Tally.** 15 steps (unchanged — no split, no fold), 20 lettered substeps, 23 check-offs.
Every `cmd`, `hold`, `ramp`, `saw`, `control`, `target`, `hl`/`hl_watch` and the guard are unchanged.

**GOAL LINES — AGENT-DRAFTED FOR OWNER REVIEW** (his step lines became the substep actions):
1 Add the boron a cold core needs before any cooling starts · 2 Bring pressure under the point
where the low-pressure protection can be switched off · 3 Switch off the protection that would
read the cooldown as a leak · 4 Cool the plant on the steam dump to where RHR can take over ·
5 Take the pressure setpoint to the bottom of its range · 6 Hand pressure control from the heaters
to the spray · 7 Isolate the accumulators while pressure is inside their window · 8 Bring pressure
under the RHR limit on the spray · 9 Put RHR in service as the cooldown loop · 10 Take the reactor
coolant pumps off now that RHR is circulating · 11 Cool on RHR into Mode 5, inside the 100 °F per
hour limit · 12 Shut the spray now that the plant is cold · 13 Confirm the plant is in Mode 5,
Cold Shutdown · 14 Confirm the accumulators are still full and isolated · 15 Confirm RHR is
carrying the heat.

**Restructured, not rewritten.** Split his step lines at their sentence/"then" joins (3, 4, 6, 9,
10); moved each sentence of a step note into the substep it belongs to (3's note split at its
semicolon; 1's "Do not start cooling until…" and 5's "From here pressure comes down by hand" moved
from the step line into the note; 8's "Do not switch the spray off" stays on the action line).
Dropped: 3b's leading "Then". **Also AGENT-DRAFTED:** 1a's speed line (from the old sim-only
`wait_hint`, minus its "Start it and carry on; the next steps run while it works" — false: the
card holds on step 1 until the row ticks), and the check-off labels of 1, 13, 14 and 15's second
row (those steps had no label).

**NUMBERS CHANGED IN HIS TEXT — each measured on both routes and now a range (review these).**
Routes: PLAYER = live checklist, full stack, `hot_zero_power`, seeds 42 and 7, pressing DUMP
SETPOINT 50 psi each time AVG COOLANT TEMPERATURE moved < 0.5 °F in 60 s ("settle"), and a second
player pressing every 300 s; REPLAY = the authored harness route.

| where | was | now | measured |
|---|---|---|---|
| 4b note | "about 5 plant-minutes" between presses | about 1 to 5 | settle waits 60-298 s, lengthening as the walk goes down |
| 4b note | "About two plant-hours in all" | 45 plant-minutes to two and a half | settle 43.5-44.0 min; 300 s presses 93 min; replay 158 min |
| 7a note | window "about 5 plant-minutes wide" | about 8 | 1615 -> 665 psi: 7.9 min (both seeds), 8.1 min (300 s route), 8.5 min replay |
| 8a note | "About 10 plant-minutes" | about 10 to 13 | player 12.4-13.0 min, replay 10.3 min |
| 11 Background | Mode 5 "in about an hour and a half" | an hour and a half to two hours | player 99 min at 12 %; replay 118.5 min (it ramps 7 -> 12 %) |
| leg `purpose` (sim only) | About 7 plant-hours | About 3½ to 7 | player 3.6-4.4 h; replay ~7 h |

Left as written, measured in range: 1a "about 54 plant-minutes to 880" (54.6 player, 54.2
replay); 8 "PRESSURIZER LEVEL … past 80 %" (peak 64-68 %); 6b "about 3 psi a second" (1740 ->
1615 psi in 31 s, ~4 psi/s, then ~2 psi/s through the window).

**GRADING CHANGES** (render-band floors, #749: every tile here prints whole units). All MEASURED on
the player routes (seeds 42/7) and the replay (`replay 33 checks, 0 failed`, was 32):

| step | before | now | measured |
|---|---|---|---|
| 1 | `boron > 880` (ticked on a tile reading 880) | `>= 879.5` "880 ppm or more" | player +3271-3274 s, replay +3250 s; not met at entry |
| 2 | `P < 13.6` (1972.5 psi, prints "1972") | `< 13.593` (1971.5) | player +19-20 s, replay +1307 s of 1500 |
| 4b | `Tavg < 175 °C` (347.0 °F, prints "347") | `< 174.72` (346.5) | settle +2610-2638 s; replay +9478 s of 9600 |
| 6b | `P < 11.14` (1615.7 psi, prints "1616") | `< 11.131` (1614.4), now a `cont` of 6b | player +48-50 s; replay +32 s |
| 8a | `P < 2.85` (413.4 psi, prints "413") | `< 2.844` (412.5) | player +746-778 s; replay +616 s of 1200 |
| 11 | `Tavg < 93 °C` (199.4 °F, prints "199") | `< 92.5` (198.5) | player +5946-5953 s; replay +7109 s of 7200 — **91 s of slack**, the thinnest margin in the leg |
| 14 | `accum > 99` (prints "99") | `>= 99.5` "reads 100 %" | 100.00 % at the step on every route |
| 15 | ALIGN only | + `cont` `rhr_hx_fraction >= 0.005` "HX SPLIT above 0 %" (his own check; floor of "1") | 0.12 at the step, met +3 s, every route |

Unchanged predicates: 3 (both blocks + the ECCS press), 4a, 6a/6b spray, 7, 9, 10, 12, 13. Step 5's
`< 12.2` stands: 12.2 MPa is 1769.5 psi, already under the "1770" band. No `steady`, no
`accs_ordered`. **No step is hollow on entry**: rows met at entry are 4a (dump AUTO, lit from the
IC) and 10b (spray still on) — each beside an unmet sibling in the same step.

**SPEED PROVENANCE**

| substep | rung | provenance |
|---|---|---|
| 1a | 600× | CARRIED OVER (the 30 s rule on `hold: 3900`); WARP available for the whole wait, MEASURED |
| 2a, 5a | 1× | MEASURED — the player's dwell is 15-20 s (the 30 s rule on it gives 1×); the replay's `hold: 1500` would have said 60× |
| 4b | 60× | MY PICK. The carried rung is 600× (`hold: 9600`), and WARP is available, but 4b asks for a press each time the temperature settles: 1-5 plant-minutes is 0.1-0.5 s of wall clock at 600×, 1-5 s at 60× |
| 6b | 5× | MEASURED — 31-33 s from the spray press to the 1615 psi tick (30 s rule); was 10× by the rule on `hold: 240` |
| 8a | 60× | CARRIED OVER (30 s rule on `hold: 1200`) and MEASURED (10-13 min dwell gives 60×) |
| 11a | 600× | CARRIED OVER (30 s rule on `hold: 7200`) and MEASURED (99 min dwell); WARP available throughout |
| everything else | 1× | instant presses and confirms |

`tools/glance_rung.js` cannot grade this leg: its yardstick is REACTOR POWER, which is 0 % from
entry to exit on a shutdown cooldown. WARP availability was read off `metadata.pacing` with
`configurePacing({warp:true})`, sampled every broadcast: available on every sample of every step.

**FINDINGS NOT ACTED ON (owner's call).** (a) Step 11 claims "12 % holds about 95 °F per hour";
the true `tavg_rate` reaches −143 to −151 °F/h on the player route (entering at ~340 °F, not the
300 °F the #729 figure was measured from) — whether the COOLDOWN RATE tile shows the same was NOT
measured. (b) 4a's check-off says "status PRESS" but grades `steam_dump_auto` (the lamp), true in
TAVG mode too; the mode is a string and no grader param reads it — a runtime change, not made.
(c) BORON STATUS BORATING has no gradeable param either, same reason.

### Reconcile record — 2026-09-24, rp_dump lane (4a graded on the dump MODE; step 11 reworded)

**4a — OWNER RULING, 2026-09-24, selected "Grade the mode"** (quoted in full in
`05_shutdown.md`'s record of the same date). Finding (b) above is acted on: the "status PRESS"
row grades `steam_dump_press_mode` (derived from `control_state.steam_dump_mode` in
`layers/instructor_layer.js`, no contract field), no longer the AUTO lamp. **It is still met on
arrival on every route measured** — standalone (`hot_zero_power` boots in pressure mode; measured
PRESS at boot, and AUTO from CLOSED gives PRESS because the turbine is tripped) and chained from
the shutdown leg (whose step 3 now requires PRESS): row met on the first graded broadcast after
step entry, 4b unmet, so the step's Continue stays dark — the route gate does not flag it hollow.
That is the plant's true state, so no `entry_met` was declared. **Injection:** the dump put in
TAVG at step 3 and AUTO never pressed — row unmet at step 4 entry and still unmet 600 plant-s
later; AUTO then ticks it on the next broadcast. The lamp would have ticked it at once.

**11 — OWNER RULING, 2026-09-24, selected "Reword only"**: "Change the text to describe the rate
the plant actually gives." Finding (a) above is acted on. Split and physics unchanged.

MEASURED on the COOLDOWN RATE tile (`bdRhrCooldownRate`: indicated Tavg differentiated and lagged
600 s, drawn in whole °F per hour), seed 42, both routes entering near 341 °F:

| minutes into step 11 | player types 12 % once | authored replay (7 → 12 % ramp) |
|---|---|---|
| +10 | −92 | −56 |
| +20 | −104 | −70 |
| +30 | −98 | −73 |
| +60 | −86 | −79 |
| peak tile | **−106 at +27 min**; over 100 for 12.7 plant-min | −85 at +42 min; never over 100 |
| true 5-minute rate, peak | **−158 °F per hour at +4 min** | −90 °F per hour |
| reaches 199 °F | +100 min | +120 min |

First hour on the player route: 341.6 → 239.7 °F, about 102 °F.

| where | was | now |
|---|---|---|
| goal line | Cool on RHR into Mode 5, inside the 100 °F per hour limit. | Cool on RHR into Mode 5, at about the 100 °F per hour limit. |
| Background, sentence 2 | 12 % holds about 95 °F per hour at the start and eases off as the plant closes on the RHR sink, reaching Mode 5 in about an hour and a half to two hours. | At 12 % the read-back climbs to a little over 100 °F per hour in the first half hour, then eases off as the plant closes on the RHR sink, reaching Mode 5 in about an hour and a half to two hours; the read-back is smoothed over about ten minutes, so for the first few minutes the plant itself cools faster, near 150 °F per hour. |
| Background, last sentence | Turn it higher and you go over the 100 °F per hour limit: 25 % measures 193 °F per hour. | Turn it higher and you go well over the 100 °F per hour limit: 25 % measures 193 °F per hour. |

AGENT-DRAFTED for owner review. The smoothing clause rides sentence 2 after a semicolon because `run_style` caps a Background at three sentences. The note ("Keep COOLDOWN RATE under 100 °F per hour: if it runs
faster, lower HX SPLIT…") is his and stands: it is what keeps a player under the limit.
**NOT RE-MEASURED:** the "25 % measures 193 °F per hour" figure is #729's TRUE rate from a 300 °F
entry, not the tile from this step's 341 °F entry. The route harness's typical route now types
12 % once at step 11 (`policy: 'final'`), the route these numbers came from.
