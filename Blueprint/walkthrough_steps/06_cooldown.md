# Cooldown to Mode 5, Cold Shutdown

**Walkthrough id: `pwr_cooldown`  ·  16 steps**

> Edit this freely — it is the step text, and it is what the sim is brought down to.
>
> **The format** (OWNER RULING, 2026-09-24: "I like putting the why where you put it. i choose
> a."; restyled to it 2026-09-25, record at the end). Line one of a step is WHAT the step
> accomplishes, never how. Directly under it, one italic line says WHY. Each lettered substep is
> HOW: it opens with a verb, and it is its own check-off, drawn `()`. **Suggested time warp**
> appears once per step, or under a substep only when the substeps differ. A Note follows the
> warp it belongs to. Background closes the step. Agent notes go at the END of the file, never
> between the steps.

---

1. Add the boron a cold core needs before any cooling starts.

*Cold water makes the chain reaction easier, so the extra boron has to be in before the cold arrives.*

()1a. Check ON is lit on the BORON card. If ON is not lit, press ON.

()1b. Set the boron target to 920 ppm: type it into the number box on the BORON card captioned 0-2500 ppm, press Enter, and check BORON STATUS reads BORATING.

()1c. Wait for BORON CHEM to read 880 ppm or more.

Suggested time warp: 600×.

Note: The boration runs at a steady 3 ppm a minute and does not slow down as it closes: about 55 plant-minutes to 880 ppm from a preset, about 65 on a plant brought down from full power. Do not start cooling until BORON STATUS reads BORATING.

Background

Hot, the plant is comfortably shut down on about 719 ppm of boron. Cold water makes the chain reaction easier, and the same core at 122 °F needs about 920 ppm for the same margin. Adding it first means the margin arrives before the cold does.

[HIGHLIGHTED: Boron ON, Boron Target (pulsing); Boron Status, Boron Concentration (steady)]



2. Bring pressure under the point where the low-pressure protection can be blocked.

*The plant only lets you block its low-pressure protection below 1972 psi.*

()2a. Lower SET PZR PRESSURE to 1900 psi and wait for PRIMARY PRESSURE to read below 1972 psi.

Suggested time warp: 1×.

Note: Pressure Relief Valve Open and Pressurizer Pressure Low come in as pressure falls: expected. The relief valve lifts for about ten plant-seconds and closes by itself, and the PORV label on the diagram then reads CLOSED again.

Background

Two automatic protections watch for falling pressure, because on a running plant falling pressure means a leak. They can only be blocked below 1972 psi, so the setpoint comes under that first. This is not the depressurization; it only unlocks the next step.

[HIGHLIGHTED: Pressure SP (pulsing); Primary Pressure (steady)]



3. Block the protection that would read the cooldown as a leak.

*To the automatic protection a cooldown looks like a leak, and left on it would trip the reactor and start the emergency injection pumps.*

()3a. Press TRIP BLOCKS on the ROD CONTROL card, then press BLOCK on the PZR PRESS LO-LO row. Check the row reads BLOCKED.

()3b. Press BLOCK on the SI REACTOR TRIP row. Check the row reads BLOCKED.

()3c. Press STOP on the ECCS card, even if it is already lit.

Suggested time warp: 1×.

Background

To the automatic protection, a cooldown looks exactly like a leak: pressure falling on a hot plant. Left on, the first cooling stage would trip the reactor and start the emergency injection pumps, flooding the plant with cold water you did not ask for. STOP on the ECCS card keeps the injection pump idle, and it is what the card shows whenever the pump is idle; it does not disarm safety injection, which would still start the pump.

[HIGHLIGHTED: Trip Blocks, ECCS — Stop (pulsing); HPI/LPI (steady)]



4. Cool the plant on the steam dump to where RHR can take over.

*The steam pressure the dump holds sets the temperature the steam generator boils at, and the reactor water follows it down.*

()4a. Check STEAM DUMP AUTO is lit and its status reads PRESS. If it does not, press AUTO until the status reads PRESS.

Suggested time warp: 1×.

Note: If the status reads TAVG, the dump is holding temperature instead and ignores DUMP SETPOINT.

()4b. Lower DUMP SETPOINT 50 psi at a time to 720 psi, about 6 plant-minutes apart.

Suggested time warp: 60×.

Note: Time the waits on the plant clock: 4 plant-minutes apart sets off the Cooldown Rate High alarm, and one big jump sets it off and empties the pressurizer. The temperature never quite stops falling, so do not wait for it to. Low Coolant Temperature comes in near 530 °F: expected on a cooldown, and it becomes an expected-status tile below 350 °F. The clock moves to 60× by itself once your first new setpoint goes in.

()4c. Lower DUMP SETPOINT 25 psi at a time to 270 psi, about 6 plant-minutes apart.

()4d. Lower DUMP SETPOINT 15 psi at a time to 120 psi, about 6 plant-minutes apart, until AVG COOLANT TEMPERATURE reads below 347 °F.

Note: Shutdown Cooling Not In Service comes in near the bottom as the plant enters Mode 4: expected, RHR goes in service at step 9. About three and a half hours from 1020 psi.

Background

Steam pressure and steam temperature go together: lower the pressure the dump holds and the steam generator boils at a lower temperature, which pulls the reactor water down after it. It cannot pull the water below its own boiling point, so the walk goes all the way to 120 psi, about 341 °F, low enough for RHR to take over. Near the bottom the same 50 psi cools about four times as far, which is why the steps get smaller.

[HIGHLIGHTED: Steam Dump — Auto, Dump Setpoint (pulsing); Steam Dump Status, Tavg (steady)]



5. Take the pressure setpoint to the bottom of its range.

*The setpoint box stops at 1700 psi, and from here pressure comes down by hand.*

()5a. Lower SET PZR PRESSURE to 1700 psi, as low as the box goes, and wait for PRIMARY PRESSURE to read below 1770 psi.

Suggested time warp: 1×.

Note: Pressure Relief Valve Open comes in again for about five plant-seconds: expected, as in step 2.

Background

The setpoint box is the at-power pressure control and it stops at 1700 psi. A real cooldown leaves it exactly there: below it the heaters have nothing to hold, and the operator lowers pressure with the spray instead.

[HIGHLIGHTED: Pressure SP (pulsing); Primary Pressure (steady)]



6. Hand pressure control from the heaters to the spray.

*The spray lowers pressure only once the heaters stop boiling the water back.*

()6a. Press OFF under HEATER.

Suggested time warp: 1×.

Note: Heaters first: with them still in AUTO the spray will not hold and pressure climbs back instead of falling.

()6b. Type 50 in the box under SPRAY and press Enter, then press MANUAL under SPRAY. Not more than 50 %.

()6c. Wait for PRIMARY PRESSURE to read below 1615 psi.

Suggested time warp: 5×.

Note: Spray water goes into the pressurizer and PRESSURIZER LEVEL climbs as pressure falls. At 100 % a pressurizer that starts high fills completely, after which the spray shuts itself off. At 50 % pressure falls about 3 psi a second with room to spare.

Background

The heaters go off first, or they boil water as fast as the spray condenses it and pressure goes nowhere. Spray condenses steam in the pressurizer and pressure falls; the setpoint box has nothing left to hold. Lowering pressure spends SUBCOOLING MARGIN, how far the reactor water is below boiling, and that has to stay positive.

[HIGHLIGHTED: Pressurizer Heater — Off, Pressurizer Spray — Manual (pulsing); Pressurizer Heaters (PZR), Pressurizer Spray (PZR), Primary Pressure (steady)]



7. Isolate the accumulators while pressure is inside their window.

*Closed inside the window, the tanks stay full for the next heatup instead of emptying into the plant.*

()7a. Close the accumulator valve while PRIMARY PRESSURE is 1615 to 665 psi, and check the ACCUMULATORS tile reads ISOLATED.

Suggested time warp: 1×.

Note: The valve symbol sits just above the ACCUMULATORS tile, to the left of ECCS INJ FLOW. At 50 % spray the window is about 8 plant-minutes wide.

Background

The same window as the heatup, in reverse. Above 1615 psi the valve has no power; below 665 psi the nitrogen in the tanks pushes their water into the plant. Close it in between and the tanks stay full for the next heatup.

[HIGHLIGHTED: Accumulator valve (pulsing); Accumulators, Primary Pressure (steady)]



8. Bring pressure under the RHR limit on the spray.

*RHR cannot be aligned above 440 psi, and the spray is what takes pressure that low.*

()8a. Leave SPRAY at 50 % and wait for PRIMARY PRESSURE to read below 413 psi. Do not switch the spray off.

Suggested time warp: 60×.

Note: About 10 to 13 plant-minutes. If PRESSURIZER LEVEL climbs past 80 %, lower SPRAY.

Background

ALIGN on the RHR card refuses to open the suction valve above 440 psi. Switch the spray off now and pressure bounces back over that number before you get there. SUBCOOLING MARGIN stays well above 100 °F on this spray.

[HIGHLIGHTED: Pressurizer Spray (PZR), Primary Pressure, Pressurizer Level (steady)]



9. Put RHR in service as the cooldown loop.

*From here to cold, RHR is the loop that carries the heat out of the plant.*

()9a. Press ALIGN on the RHR card, with the spray still on.

()9b. Set HX SPLIT to 7 %.

Suggested time warp: 1×.

Background

RHR is the low-pressure cooling loop that carries heat out of a shut-down plant. ALIGN opens its suction valve, which the plant only allows below 440 psi. HX SPLIT is how much of that loop goes through the heat exchanger; from here it is the cooldown throttle, 7 % is a gentle start, and COOLDOWN RATE beside it shows what that choice is doing.

[HIGHLIGHTED: RHR — Align, RHR — HX Split (pulsing); Residual Heat Removal (RHR), Primary Pressure (steady)]



10. Take the reactor coolant pumps off now that RHR is circulating.

*With RHR circulating, the reactor coolant pumps are only adding heat.*

()10a. Press OFF on the RCP FLOW card and check the pumps coast down.

()10b. Leave SPRAY at 50 %.

Suggested time warp: 1×.

Note: Do not switch the spray off yet — a later step does that, once the plant is cold.

Background

With RHR circulating, the reactor coolant pumps are only adding heat, so they come off. The spray stays: the pressurizer shell is still hot metal and it keeps boiling water off the top of the pressurizer, which puts pressure back up. It is the only thing taking that heat away now — the heaters are already off and the SET PZR PRESSURE box stopped reaching at 1700 psi.

[HIGHLIGHTED: RCP — Off (pulsing); RCP ON/OFF, Pressurizer Spray (PZR) (steady)]



11. Cool on RHR into Mode 5, inside the 100 °F per hour limit.

*HX SPLIT is the cooldown throttle now, and COOLDOWN RATE beside it shows what that choice is doing.*

()11a. Raise HX SPLIT to 9 %.

Suggested time warp: 1×.

()11b. Leave SPRAY running and watch SUBCOOLING MARGIN fall. This line ticks at 32 °F; the press comes at 30 °F, in the next line.

Suggested time warp: 60×: at 600× the margin can fall 10 °F between two glances.

Note: The spray keeps taking SUBCOOLING MARGIN down; the Low Subcooling Margin alarm comes in at 20 °F. Shut it any earlier and pressure climbs back over the RHR limit. If OFF is already lit under SPRAY, type 50 in the box under SPRAY, press Enter, then press MANUAL under SPRAY and keep watching. The clock moves to 60× by itself once HX SPLIT is raised.

()11c. When SUBCOOLING MARGIN reads below 30 °F, press OFF under SPRAY on the PRESSURIZER (PZR) card.

Suggested time warp: 60×.

()11d. Wait for AVG COOLANT TEMPERATURE to read below 199 °F.

Suggested time warp: 600×.

Note: Keep COOLDOWN RATE under 100 °F per hour. The tile shows cooling as a minus number, so a reading of -83 is 83 °F per hour. If the Cooldown Rate High alarm comes in, lower HX SPLIT.

Background

HX SPLIT is the cooldown rate now, and COOLDOWN RATE beside it is the read-back. At 9 % the read-back climbs to about 85 °F per hour in the first half hour, then eases off as the plant closes on the RHR sink, reaching Mode 5 in about two and a quarter hours; the read-back is smoothed over about ten minutes, so for the first few minutes the plant itself cools faster, near 130 °F per hour. Turn it higher and you go over the 100 °F per hour limit: 12 % reads about 110 °F per hour and sets off the Cooldown Rate High alarm.

[HIGHLIGHTED: RHR — HX Split, Pressurizer Spray — Off (pulsing); Residual Heat Removal (RHR), Pressurizer Spray (PZR), Subcooling Margin, Tavg (steady)]



12. Shut the spray now that the plant is cold.

*The pressurizer shell has given up most of its stored heat, so the spray has nothing left to take away.*

()12a. Press OFF under SPRAY on the PRESSURIZER (PZR) card, if step 11 has not already.

Suggested time warp: 1×.

Background

The plant is cold now and the pressurizer shell has given up most of its stored heat, so there is nothing left for the spray to take away. Shut it and pressure sits where it is. This is the lineup the Cold Shutdown preset holds: heaters off, spray in hand and shut.

[HIGHLIGHTED: Pressurizer Spray — Off (pulsing); Pressurizer Spray (PZR) (steady)]



13. Confirm the plant is in Mode 5, Cold Shutdown.

*Confirming the end state catches a plant still above 199 °F or a pump still running.*

()13a. Check AVG COOLANT TEMPERATURE reads below 199 °F.

()13b. Check OFF is lit on the RCP FLOW card.

Suggested time warp: 1×.

Note: PRIMARY PRESSURE reads about 250 psi, far below the 2235 psi of a running plant; it crept back up after the spray shut, which is expected. ALIGN on the RHR card is checked in step 15.

Background

This is the cold-shutdown picture: water below 199 °F, pumps off, RHR carrying the heat, pressure low with the spray shut. The heatup walkthrough takes it back up.

[HIGHLIGHTED: Tavg, Primary Pressure (steady)]



14. Confirm the accumulators are still full and isolated.

*The next heatup opens the tanks again, and empty tanks then are a missing safety system.*

()14a. Check the ACCUMULATORS tile reads 100 % and ISOLATED.

Suggested time warp: 1×.

Background

You isolated the tanks on the way down so they would not empty into a depressurized plant. They have to still be full: the next heatup opens them again inside its window, and empty tanks then are a missing safety system.

[HIGHLIGHTED: Accumulators (steady)]



15. Confirm RHR is carrying the heat.

*RHR is the only thing removing heat now, and if its suction valve shut the decay heat would have nowhere to go.*

()15a. Check ALIGN is lit on the RHR card.

()15b. Check HX SPLIT reads above 0 %.

Suggested time warp: 1×.

Background

RHR is the only thing removing heat now. If its suction valve shut, the decay heat would have nowhere to go. The heatup walkthrough is the way back.

[HIGHLIGHTED: Residual Heat Removal (RHR) (steady)]



16. Leave the plant lined up for the next heatup.

*The heatup starts from what this step leaves, and a steam dump left in AUTO at a low setpoint opens wide the moment the heatup asks for it.*

()16a. If SCRAM on the ROD CONTROL card reads PRESS TO RESET, press it once: no rod moves while the reactor trip is latched.

()16b. If SHUTDOWN ROD POSITION already reads 0 of 627, the bank is in. Otherwise press FAST on the ROD CONTROL card, then click INSERT under SHUTDOWN once, and wait for it to read 0 of 627.

()16c. Press CLOSE on the STEAM DUMP card.

()16d. Set DUMP SETPOINT to 1020 psi.

Suggested time warp: 60×.

Note: After the scram in the shutdown walkthrough the bank already reads 0 of 627. If it does not, one INSERT click runs it in by itself, about 9 plant-minutes. The round trip is complete.

Background

The cooldown walked DUMP SETPOINT down to 120 psi. Left there with the dump in AUTO, the next heatup's first AUTO press opens the dump wide against a setpoint far below its steam pressure, and the plant trips on low steam pressure. Closing the dump and putting the setpoint back to 1020 psi hands the next heatup the lineup it expects; inserting the shutdown bank leaves both banks in, the way the heatup starts. The scram from the shutdown is still latched, and while it is no rod can move: resetting it moves nothing, it gives the rod drive its power back so the heatup can withdraw the shutdown bank.

[HIGHLIGHTED: Rod Speed — Fast, Shutdown Bank — Insert, Steam Dump — Close, Dump Setpoint, SCRAM (pulsing); Shutdown Bank, Shutdown Rod Position, Steam Dump, Steam Dump Status (steady)]



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
| goal line | Cool on RHR into Mode 5, inside the 100 °F per hour limit. | Cool on RHR into Mode 5, inside the 100 °F per hour limit. |
| Background, sentence 2 | 12 % holds about 95 °F per hour at the start and eases off as the plant closes on the RHR sink, reaching Mode 5 in about an hour and a half to two hours. | At 12 % the read-back climbs to a little over 100 °F per hour in the first half hour, then eases off as the plant closes on the RHR sink, reaching Mode 5 in about an hour and a half to two hours; the read-back is smoothed over about ten minutes, so for the first few minutes the plant itself cools faster, near 150 °F per hour. |
| Background, last sentence | Turn it higher and you go over the 100 °F per hour limit: 25 % measures 193 °F per hour. | Turn it higher and you go well over the 100 °F per hour limit: 25 % measures 193 °F per hour. |

AGENT-DRAFTED for owner review. The smoothing clause rides sentence 2 after a semicolon because `run_style` caps a Background at three sentences. The note ("Keep COOLDOWN RATE under 100 °F per hour: if it runs
faster, lower HX SPLIT…") is his and stands: it is what keeps a player under the limit.
**NOT RE-MEASURED:** the "25 % measures 193 °F per hour" figure is #729's TRUE rate from a 300 °F
entry, not the tile from this step's 341 °F entry. The route harness's typical route now types
12 % once at step 11 (`policy: 'final'`), the route these numbers came from.

### Reconcile record — 2026-09-25, `exp/v5-ct` scratch lane (layman pass 4)

**AGENT-DRAFTED FOR OWNER REVIEW — his 4b note, minimally rewritten.** "Wait between steps until
AVG COOLANT TEMPERATURE stops falling, about 1 to 5 plant-minutes. About 45 plant-minutes to two
and a half plant-hours in all." → "Wait about 5 plant-minutes between steps, 5 seconds at 60×: the
temperature never quite stops falling, so do not wait for it to. About an hour and a half in all."
Measured, 18 entries from 1020 to 120 psi: waiting for the whole-degree tile to read the same twice
five plant-minutes apart, 231.3 plant-min (preset); a fixed 5-minute wait, 90.7 (preset) and 91.0
(chain). The route gate's `stated` check now fails the old reading (`cooldown_until_flat`).

7a's note: "above and right of the ACCUMULATORS tile, beside ECCS FLOW" → "just above the
ACCUMULATORS tile, to the left of ECCS INJ FLOW" — the reviewer's reading of the board, NOT
re-measured (no browser run here).

**Not verified.** The COOLDOWN RATE tile during the stair (the reviewer read −125 °F per hour on
the last step); the true 5-minute rate this harness reads is not the lagged tile.

### Reword record — 2026-09-25, `exp/w6-cooldown` scratch lane: the what / why / how format

*OWNER RULING, 2026-09-24, selected "Yes, all five": "Opus agents restyle heatup, raise, lower,
shutdown and cooldown to match, using your Mode 3 → Mode 1 steps 1–3 as the model. Measured
numbers stay; the gates and a layman pass confirm."* The shape is `02_mode3_to_mode1.md` record
(h). **STEP FILE ONLY — the `pwr_cooldown` pool in `ui/manual_procedures.js` still carries the
previous wording; bringing it down is phase 2.** Previous text: `git show HEAD~1:<this file>`.

**Tally.** 15 steps (unchanged). Lettered substeps 20 → 26; check-offs 23 → 26, now one per
substep. Every number in the step text is unchanged, including 4b's "Wait about 5 plant-minutes
… About an hour and a half in all" and step 11's "at about the 100 °F per hour limit" (both ruled).

**Why lines — AGENT-DRAFTED FOR OWNER REVIEW**, one italic sentence each, drawn from the step's
own Background or note (steps 2, 5, 11, 12, 14, 15 reuse his sentences nearly verbatim).

**Old check-off → new substep** (phase 2 maps each substep to one `accs` head):

| old row | new substep |
|---|---|
| 1 BORON CHEM 880 ppm or more | 1c |
| 2 PRIMARY PRESSURE below 1972 psi | 2a (action and wait on one line, as 02's 14b) |
| 3 PZR PRESS LO-LO BLOCKED / SI REACTOR TRIP BLOCKED / ECCS STOP | 3a / 3b / 3c |
| 4a dump AUTO, status PRESS · 4b Tavg below 347 °F | 4a · 4b |
| 5 PRIMARY PRESSURE below 1770 psi | 5a |
| 6a HEATER OFF · 6b SPRAY 50 % · 6b cont PRESSURE below 1615 psi | 6a · 6b · 6c |
| 7, 8, 11, 12, 14 | 7a, 8a, 11a, 12a, 14a |
| 9 ALIGN · HX SPLIT 7 % | 9a · 9b |
| 10 pumps coasting · SPRAY still on | 10a · 10b |
| 13 Plant in Mode 5 | 13a (Tavg below 199 °F) + 13b (RCP FLOW OFF) |
| 15 ALIGN · HX SPLIT above 0 % | 15a · 15b |

**NEW CHECK-OFFS — need an acceptance in phase 2:**
- **1a** "Set the boron target to 920 ppm" — grade the boron TARGET at or above 919.5 ppm (render
  floor of "920"), not the concentration.
- **1b** "Check ON is lit and BORON STATUS reads BORATING" — grade the boron system ON. BORATING
  itself has no gradeable param (finding (c) of the first 2026-09-24 record); if phase 2 adds
  one, grade it too. Met on entry if the IC boots with the system ON — check for a hollow row.
- **13b** "Check RCP FLOW reads OFF" — the old single "Plant in Mode 5" predicate split; grade
  pumps off. 13a takes the Tavg half (`< 92.5 °C`, 198.5 °F, the step 11 floor). Both are met on
  entry (step 11 and 10 already made them true) — declare `entry_met` or confirm the route gate
  accepts it, as step 14.

**Lines whose meaning changed:**
- **4a** "Press AUTO on the STEAM DUMP card" → "Check STEAM DUMP AUTO is lit and its status
  reads PRESS. If it does not, press AUTO until the status reads PRESS." The old line told every
  player to press; the rp_dump record MEASURED the row met on arrival on every route, and a press
  on an already-PRESS dump may move it off PRESS (NOT verified — whether AUTO cycles the mode).
- **13** no longer lists ALIGN; step 15a checks it, and 13's note now says so. Removes a
  duplicate check-off.
- **15a** "The round trip is complete." moved from the action line to a Note.
- **1b** is a check the old text only implied ("Press ON only if it is not already lit").
- Old notes folded into lines: 3's "TRIP BLOCKS is on the ROD CONTROL card" and "STOP is on the
  ECCS card" (3a, 3c); 2's "Below 1972 psi the plant lets you switch off the protection in the
  next step" and 5's "From here pressure comes down by hand" became their why lines; 4a's "in
  TAVG mode the setpoint does nothing" stays as 4a's note.

**Time warp.** Once per step except 4 (1× then 60×) and 6 (1× then 5×), where the substeps
differ. Rungs unchanged.

**Not verified:** no layman pass, no browser run, no route gate — the pool is untouched, so
`run_walkthrough_routes` and `run_checklist_pwr2` grade the old text. Board labels "ON" (BORON
card) and "RCP FLOW reads OFF" are read off the old text, not the board.

### Bring-down record — 2026-09-25, `exp/p2-cooldown` scratch lane (phase 2: the pool matches this file)

The `pwr_cooldown` pool in `ui/manual_procedures.js` now carries this file word for word (script
compare: 16 steps, 29 substeps, `text`/`aim`/`why`/every `ask`/every note/every warp line equal).
`aim` = the italic line; one `accs` head per lettered substep; a warp once per step is
`wait_speed` + `speed_text: true` and the Note after it is the step `note`; steps 4 and 6 keep
per-substep rungs. All seed 42, full stack.

**STEP 16 IS NEW — AGENT-DRAFTED FOR OWNER REVIEW.** *OWNER RULING, 2026-09-25, selected "Both A
and B" (option text, not verbatim; relayed by the coordinator).* Option B: the cooldown ends by
inserting the shutdown bank, closing the steam dump and resetting DUMP SETPOINT to 1020 psi.
Why (measured by the heatup lane on one continuous plant): the cooldown left DUMP SETPOINT near
197 psi with the dump in AUTO; the heatup's step 13 AUTO press opened it 100 % and the reactor
tripped on safety injection (low steam pressure) in its step 14. "The round trip is complete."
moved from 15's Note to 16's. Measured:
- Cold Shutdown preset lineup (what 16 reproduces): dump mode CLOSED (`off`), DUMP SETPOINT
  7.03 MPa (1020 psi), shutdown bank 0 of 627.
- Harmless at cold, A/B on the Cold Shutdown preset for 30 plant-minutes: CLOSE + setpoint 1020 +
  INSERT vs nothing — Tavg 122.03 °F both, pressure 363.3 psia both, RHR aligned both. Inserting
  from 627 at cold shutdown: no trip, Tavg moved 0.004 °F, shutdown margin −2131 → −5807 pcm.
- Insert time at FAST: 523 plant-s (8.7 min); NORMAL 784 s. Hence "about 9 plant-minutes".
- Typical route (preset): step 16 entry sd 627, dump PRESS at 0.83 MPa (120 psi) — all three rows
  unmet; completes in 9.5 plant-min, exits sd 0, dump CLOSED, 7.03 MPa; Tavg 197.4 → 189.5 °F
  across the step (RHR still cooling). Chain: arrives sd 0 (the shutdown leg's scram) — 16a met on
  arrival, 16b/16c unmet, step not hollow; completes in 0.8 min, exits CLOSED at 7.03 MPa.
- **Caught on the first run:** 16a carried the INSERT as a row `cmd`, and a row `cmd` is latched
  met by the press — it ticked with the bank at 577 of 627. The INSERT is now the step `cmd`.

**NEW GRADING (injection-proven, live checklist):**

| row | predicate | measured |
|---|---|---|
| 1a | `boron_target_ppm ~ 1710 ± 790.5` (919.5-2500.5, re-grades) | unmet at entry (719.2); met at 920; **ON pressed after it → box re-captured to 718.2, row un-ticks** |
| 1b | `boron_auto_on > 0` | met at entry on both routes (channel engaged); channel OFF before entry → unmet |
| 13a | `tavg_c < 92.5` | met at entry (step 11's floor) |
| 13b | `pump_flow_pct < 9.5` (RCP FLOW tile) | pumps running 100.5 % unmet; secured 60 s 2.03 % met; restarted 100.2 % unmet |
| 16a/b/c | bank `< 0.5` · `steam_dump_auto < 1` · `steam_dump_setpoint ~ 7.0327 ± 0.0034` | see step 16 above |

1a is a BAND, not the brief's latching `>= 919.5`: pressing ON — lit or not — re-captures the
target to the analyzer (`_toggleChannel`), so a latched row would sit ticked over a 719 ppm box
while 1c never comes. **4a:** AUTO pressed three times on a dump already in PRESS: mode stays
PRESS, DUMP SETPOINT stays 1020 psi — the press cannot take it off PRESS while the turbine is
tripped, which it is on every route here. The text's premise does not hold; the text is harmless.

**STEP 6 IS NOW ORDERED, and the spray press is `replay_then`.** Step 6 entry is at 1746 psia over
the 1700 psi setpoint with the spray still in AUTO and delivering, 55.1 % falling to 39.1 % in
1.2 plant-s: the unordered "PZR SPRAY at 50 %" row ticked on that pass through its band with
nothing pressed and let go 0.7 s later (route gate: typical and three mistake routes FAILED on
it). Ordered, it cannot latch before HEATER OFF.

**FOR THE OWNER:** (1) 1a before 1b is the one order in which the card's own contingency ("If ON
is not lit, press ON") undoes 1a; `pwr_startup` 2 puts ON first for this reason. Recommend
swapping 1a and 1b. (2) 13b "RCP FLOW reads OFF": the RCP FLOW tile prints a number (about 2 %
with the pumps secured), never OFF; OFF is the lamp on the RCP card. Graded on the tile, as
`pwr_startup` 1c grades "reads ON". (3) The 16 text above.

### Cross-leg quality pass — 2026-09-25, workbench-f

- **1a and 1b swapped** (the bring-down's recommendation (1) above). 1a is now "Check ON is lit…
  If ON is not lit, press ON.", 1b the 920 ppm target. Before, the ON check's own contingency was
  the press that wiped the typed target (ON re-captures it from the analyzer: 920 → 718.2 ppm,
  INHERITED from the bring-down). The target row keeps its re-grading band (919.5-2500.5 ppm).
  MEASURED, route gate seed 42: typical route completes in 278.9 plant-min, no hollow step, no
  flash, no row un-tick; chained, step 1 takes 77.5 plant-min.
- **13b "Check OFF is lit on the RCP FLOW card."**, graded on that lamp (`rcp_running < 1`, the
  instructor's STATUS_PARAMS), replacing the `pump_flow_pct < 9.5` tile row. This extends *OWNER
  RULING, 2026-09-25, selected "Reword"* on `pwr_heatup` 1c to this step for consistency — the
  coordinator's call, not a separate ruling. MEASURED: met on arrival on the typical and chained
  routes (step 13 is 0.1 plant-min on the chain, the pumps stopped at step 10).
- **Trips are "blocked"** *(OWNER RULING, 2026-09-25: "A")*: step 2's line, italic line and
  Background, and step 3's line ("Block the protection that would read the cooldown as a leak.").
- **`act_first` not authored.** 4b's first DUMP SETPOINT press is the step's own `cmd`, so the
  speed-the-action hold already covers it; 6c and 16 carry no repeated press of the step's family.

### One boron ON check — 2026-09-25, workbench-f

*OWNER RULING, 2026-09-25, selected "Take all defaults" (option selection, not verbatim; relayed by the coordinator)*, item 3. 1a is now "Check ON is lit on the BORON card. If ON is not lit, press ON." and 1b
"Set the boron target to 920 ppm on the BORON card, press Enter, and check BORON STATUS reads
BORATING." With ON first, BORON STATUS has no reason to read BORATING at 1a: the tile draws it from the
channel's `boron_adjust` demand (pwr_board_wiring `ims3wy5oym4`), which moves once a target above
the reading is set (read from the code, not measured). The status check moved to 1b. Grading unchanged.

### Layman pass 5 record — 2026-09-25, workbench-g (AGENT-DRAFTED: 16d, step 11's note, 12a)

Record: `Diagnostic/CHECKLIST_PLAYTEST_2026-09-25_LAYMAN_PASS5.md`. Measured on `run_walkthrough_routes --leg=chain` (seed 42), which now runs the heatup a second time.
- **16d, "If SCRAM on the ROD CONTROL card reads PRESS TO RESET, press it once."** The round trip stranded at the next heatup's step 3: the shutdown's scram was still latched and the rod drive refused WITHDRAW (33.0 plant-min strand, subcooling margin down to 5.3 °F at 16 psia with the pumps heating). Graded `scrammed < 1`, so a standalone cooldown meets it on arrival; reset accepted cold with the pumps off (363 psi, `inbox/v6/probe_reset.js`). Injection `round_trip_no_reset` reddens the seam without it. The scram scanner (`legScriptsScram`) now counts only a predicate that ASSERTS the trip — the name-only test had exempted this leg from trip notices.
- **Step 11's note** now names both numbers: the Cooldown Rate High alarm → HX SPLIT 10 %; SUBCOOLING MARGIN under 20 °F → SPRAY OFF now. Old note (spray on): pressure floor 13 psia, margin 13.4 °F, both alarms, 107.5 plant-min. New route: margin floor 18.1 °F, pressure floor 31 psia, ends 50 psia, 127.0 plant-min. **12a** is conditional ("if step 11 has not already"); the route gate's cooldown `entry_met` carries #12.
- **Not changed, a ruling:** the Cooldown Rate High alarm still comes in on step 4's "about 5 plant-minutes" pacing (reviewer's tile −149 °F/hr) and at the start of step 11 (owner-ruled wording).
- `next: 'pwr_heatup'` on the pool entry: the finished card offers the heatup.

### Re-pace record — 2026-09-25, `exp/r7-rp` scratch lane (TUNING_LOG 2026-09-25-workbench-i)

**OWNER RULING, 2026-09-25, selected "Re-pace to stay under"** — option text (a selection, not his
words): "Measure longer waits in step 4 and a lower HX SPLIT in step 11, then change the numbers so
the card's own route stays under 100 °F/hr."

**The alarm's channel.** `cooldown_rate_high` (`layers/control/pwr_control.js`) reads
`instruments.tavg_rate`: indicated Tavg differentiated and lagged 600 s (`pwr_config.js`
`rate_tau: 600`), setpoint −55.6 °C/hr (−100 °F/hr). The COOLDOWN RATE tile draws the same channel.

MEASURED, route harness `pwr_cooldown` typical, seed 42 (tile peak on the alarm channel; the
engine's 60-second-filtered rate in brackets):

| step 4 pacing | step 4 time | tile peak | alarm |
|---|---|---|---|
| 50 psi every 5 min (the old card) | 90.7 min | −240 (−364) at 120 psi | yes |
| 50 psi every 8 / 10 / 15 min | 142 / 177 / 261 min | −178 / −160 / −141 | yes, all |
| 50→520, 25→220, 10 psi; every 5 / 7 / 8 min | 158 / 218 / 248 min | −124 / −102 / −95 | yes / yes / no |
| 50→720, 25→320, 10 psi; every 5 / 6 min | 207 / 248 min | −99 / −87 | yes / no |
| 50→520, 20 psi; every 8 / 10 min | 236 / 295 min | −95 / −84 | no |
| 50→770, 25→320, 10 psi; every 6 min (first pick, 42 entries) | 253.9 min (seed 7 253.3; chain 253.9) | −82 (seed 7 −83; chain −83) | no |
| 50→770, 25→320, 10 psi; every 5 min (43 entries) | 212 min | −90 | no |
| 50→670, 25→270, 10 psi; every 6 min (37–38 entries) | 224 min | −94 / −95 (seed 7) | no, margin 5 |
| 50→770, 25→320, 15 psi; every 5 min (36 entries) | 179.7 min | −97 at 125 psi | no, but under 5 margin |
| **50→720, 25→270, 15 psi; every 6 min (chosen, 34 entries)** | **201.7 min** (seed 7 201.7) | **−87** (seed 7 −90) | no |

Longer waits alone never get under the limit: at low pressure the saturation curve steepens, so a
50 psi entry near 170 psi drops the coolant about 22 °F within minutes, and the lagged tile jumps by
about six times the drop in °F/hr however long the player then waits.

| step 11 HX SPLIT (typed once) | step 11 time | tile peak | alarm |
|---|---|---|---|
| 12 % | 100 min | −110 (−160) | yes |
| 10 % | 119 min | −92 (−142) | no, 8 °F/hr over the 90 margin |
| **9 % (chosen)** | **131–135 min (chain 141.5)** | **−83 to −87 (chain −90)** (−126 to −135) | no |
| 8 % (first pick) | 148–151 min | −77 (−118 to −124) | no |
| 6 % | 195 min | −63 | no |

**SECOND OWNER RULING, 2026-09-25, selected "Middle ground"** — option text (a selection): "Accept a
thinner margin to save time: e.g. HX SPLIT 9 % (peak −83 to −90) and a coarser stair." The first
pick (8 %, the 42-entry stair, margin 10 °F/hr, leg about 8 plant-hours) was replaced by the fastest
pacing that holds a 5 °F/hr margin (tile no worse than −95) on both seeds: 34 entries, 9 %, leg
about 7 plant-hours. The fastest candidate measured (15 psi from 320, every 5 min: 180 min, 36
entries) reached −97 at the bottom, inside the alarm but outside the margin.

**THIRD OWNER RULING, 2026-09-25, selected "'inside the 100 °F per hour limit'"** — option text (a
selection): the step 11 goal line. Applied below.

| where | was | now |
|---|---|---|
| 4b | "Lower DUMP SETPOINT 50 psi at a time from 1020 to 120, …" | "Lower DUMP SETPOINT in steps from 1020 to 120, …" |
| 4b note | 50 psi, "about 5 plant-minutes … 5 seconds at 60× … About an hour and a half in all." | 50 psi to 720, 25 to 270, then 15; "about 6 plant-minutes … 6 seconds at 60× … About three and a half hours in all." (34 entries) |
| 11 goal line | "at about the 100 °F per hour limit" (owner-ruled 2026-09-24, "Reword only") | "inside the 100 °F per hour limit" (owner-ruled 2026-09-25, third ruling above) |
| 11a | HX SPLIT 12 % | 9 % |
| 11 note | alarm → "lower HX SPLIT to 10 %" | alarm → "lower HX SPLIT" (10 % is no longer lower) |
| 11 Background | 12 %, "a little over 100", "an hour and a half to two hours", "near 150", "25 % measures 193" | 9 %, "about 85", "about two and a quarter hours", "near 130", "12 % reads about 110 °F per hour and sets off the Cooldown Rate High alarm" |
| pool step 11 | `pct: 12`, hold 7200, ramp 7→10→12 | `pct: 9` typed once (no ramp), hold 9300, `replay_then` SPRAY OFF when subcooling margin < 11.1 °C (20 °F) |
| leg `purpose` (sim only) | About 3½ to 7 plant-hours | About 7 plant-hours (typical route about 420 plant-min) |

The pool replay first carried 8 % on a 9600 s 7→8 ramp: it overstayed Mode 5 with the spray open
and walked subcooling margin into the leg's own `subcooling_c < 5` guard (measured, `run_checklist_pwr2`).
It now types the split once and replays the note's SPRAY OFF line (`replay_then.when`, new in
`test/procedures_harness.js`). AGENT-DRAFTED: the note's dropped "to 10 %" (10 % is barely lower
than 9 %); the alarm response stays because a player who types more than 9 % can still raise it.
**Gate:** `run_walkthrough_routes` gives `pwr_cooldown` `rate_max_F_hr: 95` (typical and chain);
injection `cooldown_old_pacing` (the old 5-minute stair and 12 %) goes red with the alarm raised at
steps 4 and 11.

**Gate run, chosen pacing (seed 42):** typical 420.4 plant-min, step 4 201.7 min / 34 entries / tile
−87, step 11 131.1 min / −87, leg peak −90.5 (step 6, the step-4 tail through the 600 s lag); chain
433.9 min, step 4 −88, step 11 139.5 min / −89, leg peak −89.5. **Seam, not pacing:** on the chain
the tile read −96.9 °F/hr during step 1 (boration only), the shutdown's scram transient arriving
with the leg; the alarm did not come in. The tile margin is therefore graded from step 4
(`rate_from_step: 4`); a RAISED alarm still fails at any step. Not acted on: whether the shutdown
leg should hand over a quieter plant is outside this ruling.

### Layman pass 6 — 2026-09-26, workbench-a (AGENT-DRAFTED, not owner-ruled)

Record: `Diagnostic/CHECKLIST_PLAYTEST_2026-09-26_LAYMAN_PASS6.md`. 3 Background: STOP keeps the pump idle and does not disarm safety injection (measured: SI started it with STOP pressed). 4 Note: time the waits on the plant clock (reviewer's spacing 4.1 min: −117 °F/hr); forewarns Shutdown Cooling Not In Service. 11 split: 11a spray OFF below 30 °F at 60× (graded on the spray), 11b the 600× wait (a note at 600× was missed: alarm, 17 psia seam). 16 reordered: reset first (the rod drive refuses any bank command while the trip is latched), the "already 0" line inside the INSERT substep.


### Layman pass 7 record — 2026-09-26, workbench-b (AGENT-DRAFTED: notes on 2a, 4b, 5a)

2a and 5a name Pressure Relief Valve Open (open 11 s and 5 s, same channel as the diagram's PORV
label) and Pressurizer Pressure Low; 4b names Low Coolant Temperature (tile 530.5 °F at the alarm,
setpoint 532.4 °F). Record: `Diagnostic/CHECKLIST_PLAYTEST_2026-09-26_LAYMAN_PASS7.md`.

### Layman pass 8 record — 2026-09-26, workbench-d (AGENT-DRAFTED)

- 3c: STOP is usually lit already; the row is a press (no observable behind an idle pump), so the
  text now says to press it anyway rather than "check it is lit", which would strand the row.
- 4b and 11a: one sentence each saying the clock moves to 60× by itself after the first entry.
  Measured in the browser: 1× on entry, 60× 2.5 s after a typed DUMP SETPOINT / HX SPLIT.
- 11: one "Suggested time warp: 600×." line (the step-level `speed_text` duplicated 11b's).
Record: `Diagnostic/CHECKLIST_PLAYTEST_2026-09-26_LAYMAN_PASS8.md`.

### Template pass — 2026-09-26, `exp/807e2` scratch lane (TUNING_LOG 2026-09-26-develop-g; #807 item 2)

*Owner, #807 item 2: "using the mode 3-1 walkthrough as a template, adjust the steps of the other
walkthroughs."* AGENT-DRAFTED for owner review.

- **Highlights: the pulse on the button, the steady ring on its card** (the heatup's split, #807
  item 3). 3 ECCS STOP in the ECCS PANEL card (was: the whole ECCS enclosure pulsing); 6 HEATER OFF
  and SPRAY MANUAL (was: both cards); 9 ALIGN and the HX SPLIT box (was: the RHR card); 10 the RCP
  OFF button (was: the RCP card and the SPRAY card); 11 the HX SPLIT box and SPRAY OFF (was: the RHR
  card); 12 SPRAY OFF (was: the SPRAY card). Cards moved to the steady list; 1 adds the BORON ON
  button (as `pwr_startup` 2), 7 the ACCUMULATORS tile, 16 the SHUTDOWN BANK and STEAM DUMP cards.
- **7a no longer names the ring**: "Click the accumulator valve symbol inside the pulsing ring" ->
  "Close the accumulator valve" (the heatup's 10a wording).
- **3c** one line: "Press STOP on the ECCS card, even if it is already lit." (the "so the walkthrough
  records it" clause was about the card, not the plant; Background already says what STOP does).
- **4b's stair is three substeps** (4b 50 psi to 720, 4c 25 psi to 270, 4d 15 psi to 120 and the 347 °F
  row), the step sizes the route gate's `stair` bands already drive. 4b/4c are graded on DUMP
  SETPOINT at the floor of the box's whole-psi render (720.5 psi = 4.9677 MPa, 270.5 psi = 1.8650
  MPa); 4c/4d fall back to a new step-level 60× rung. The "four times as far" clause moved to the
  Background (three sentences, the cap).
- **11a split**: "Raise HX SPLIT to 9 %." (1×, graded `rhr_hx_fraction >= 0.085`, the floor of the
  box's "9"; 7 % at entry, so not hollow) and 11b the spray watch, 11c the wait. The route gate's
  `from_text` still reads 30 °F off 11b.
- **1's note: "about 54" -> "about 55 plant-minutes to 880 ppm"** — re-measured with the #807
  makeup-path holdup live: target set on the first broadcast, BORATING at +1 s, the 880 row met at
  +55.5 plant-min (seeds 42 and 7, live checklist, `hot_zero_power`). Rate 2.9-3.0 ppm a minute.

### Review fix — 2026-09-26 (807g, #807 read-only review item 4)

11 had one spray row graded on the spray alone, and 'Pressurizer Spray — Off' pulsed from step entry, so
a press at entry met it. Now `accs_ordered`: 11a HX SPLIT, **11b "Leave SPRAY running and watch
SUBCOOLING MARGIN fall to 32 °F"** (graded 17.78 °C), **11c "When SUBCOOLING MARGIN reads below 30 °F,
press OFF under SPRAY"** (the OFF button pulses only while 11c is active — new `accs[].hl_active`; steady
ring before), 11d the wait. 11b's note: "If OFF is already lit under SPRAY, press MANUAL under SPRAY with
its box at 50 % and keep watching."

MEASURED (route runner, seeds 42 / 7):
- A first cut graded 11b AT 30 °F. It STRANDED on route `spray_off_at_entry` (465 plant-min): the player
  shuts the spray on the first tile reading under 30 °F, the margin turns back up before five graded
  readings agree, and 11b never latches. At 32 °F: 11b ticks 34.9-37.8 plant-min into the step, the spray
  is shut at 36.1-40.6, the step takes 136.6-137.6 plant-min, as before.
- Spray OFF at entry, recovered by 11b's note (reopened at 50 % two plant-minutes in): completes, ends at
  176-178 psia. The OLD one-row form on the same press, never reopened: the leg still COMPLETES, but ends at
  453.7 psia, over the RHR suction interlock (2.76 MPa, 400 psia). The step's own "step 15 strands" record
  did NOT reproduce on this route. New route check: the leg ends under 400 psia (typical 174-193).
