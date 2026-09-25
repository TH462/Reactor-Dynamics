# Mode 5, Cold Shutdown to Mode 3, Hot Standby

**Walkthrough id: `pwr_heatup`  ·  17 steps**

> Edit this freely — it is the step text, and it is what the sim is brought down to.
>
> **The format** (OWNER RULING, 2026-09-24: "I like putting the why where you put it. i choose
> a."; the shape is `Blueprint/CHECKLIST_WRITING_GUIDE.md` §16, modelled on
> `02_mode3_to_mode1.md` steps 1–3). Line one of a step is WHAT the step accomplishes, never how.
> Directly under it, one italic line says WHY. Each lettered substep is HOW: it opens with a verb,
> and it is its own check-off, drawn `()`. **Suggested time warp** appears once per step, or under
> a substep only when the substeps differ. A Note follows the warp it belongs to. Background closes
> the step. Agent notes go at the END of the file, never between the steps.

---

1. Verify the plant is cold and shut down.

*The heatup begins from a known state: cold, depressurized, pumps stopped, every rod in.*

()1a. Check AVG COOLANT TEMPERATURE reads below 200 °F.

()1b. Check PRIMARY PRESSURE reads low.

()1c. Check RCP FLOW reads OFF.

()1d. Check CONTROL ROD POSITION and SHUTDOWN ROD POSITION both read 0 of 627.

Suggested time warp: 1×.

Background

In Cold Shutdown (Mode 5) the water is far below boiling, pressure is low, the Residual Heat Removal (RHR) loop is carrying the small amount of heat the fuel still makes, and both rod banks are fully inserted.

[HIGHLIGHTED: Tavg, Primary Pressure, Residual Heat Removal (RHR), Control Rod Position, Shutdown Rod Position (steady)]



2. Start the reactor coolant pumps.

*With the reactor kept shut down, the pumps are what heat the plant.*

()2a. Press ON on the RCP FLOW card and check RCP FLOW reads above 90 %.

Suggested time warp: 1×.

Background

A shut-down reactor makes very little heat compared to a critical reactor, but the running pumps put about half a percent of full power into the water as friction. That is enough to warm the whole plant. Real crews heat up exactly this way, with the reactor never critical.

[HIGHLIGHTED: RCP Run/Stop (pulsing)]



3. Withdraw the shutdown bank all the way out.

*Once out, the shutdown bank is the reserve that drops in on a trip, so it comes out first and stays out.*

()3a. Press FAST on the ROD CONTROL card, then click WITHDRAW under SHUTDOWN once and check SHUTDOWN ROD POSITION starts counting up.

Suggested time warp: 1×.

Note: One click starts the shutdown bank and it runs to 627 of 627 by itself, about 9 plant-minutes. Clicking WITHDRAW again stops it early.

()3b. Watch SHUTDOWN ROD POSITION count up to near 627 of 627.

Suggested time warp: 60×.

Background

In a PWR, shutdown rod groups (shutdown banks) stay fully withdrawn during normal power operation. Their purpose is to supply a large, rapid insertion of negative reactivity on a reactor trip (SCRAM) so the core goes subcritical and stays that way. They are withdrawn first during startup and are not used for routine power or temperature (Tavg) control.

[HIGHLIGHTED: Rod Speed — Fast, Shutdown Bank — Withdraw (pulsing); Shutdown Rod Position (steady)]



4. Verify the turbine is tripped, nothing to press.

*A tripped turbine takes no steam, so the heat the pumps make stays in the plant.*

()4a. Check TRIP is lit on the TURBINE-GENERATOR card.

()4b. Check OUTPUT reads 0 MW. If LOAD reads anything but 0, press UNLOAD.

Suggested time warp: 1×.

Note: The ring on TRIP marks the lamp to read, not a button to push. UNLOAD is not TRIP: UNLOAD walks the load setting to zero, TRIP shuts the steam valves.

Background

The cold plant starts with the turbine tripped. It matters because a turbine taking any steam on pump heat would carry away the very heat you are trying to build up.

[HIGHLIGHTED: Turbine — Trip, Turbine Load, Generator Output (steady)]



5. Put steam generator level control in AUTO while the plant is quiet.

*Once the water in the steam generator starts to boil, its level starts to move, and AUTO has to be holding it by then.*

()5a. Set SG FEED to AUTO and check AUTO is lit.

Suggested time warp: 1×.

Background

The steam generator is the boiler: reactor water heats it on one side and steam comes off the other. Nothing is boiling yet, so the feed pumps start out stopped. Putting level control in AUTO now, while the plant is quiet, means it is already holding level when the water starts to boil later in the heatup.

[HIGHLIGHTED: SG Feed AUTO (pulsing); SG Level (steady)]



6. Verify the STEAM DUMP is closed, nothing to press.

*Any steam the dump lets out is pump heat leaving the plant.*

()6a. Check the STEAM DUMP card reads MANUAL with CLOSE lit.

()6b. Check the STEAM DUMP opening reads under 1 %.

Suggested time warp: 1×.

Note: The ring on CLOSE marks the lamp to read, not a button to push.

Background

The steam dump sends steam straight to the condenser instead of the turbine. Kept shut, the steam side bottles up and the pump heat stays in the plant. The DUMP SETPOINT box already reads 1020 psi, but that number does nothing until AUTO is pressed, which a later step does once the steam side is hot.

[HIGHLIGHTED: Steam Dump — Close, Steam Dump, Steam Dump Status, Steam Dump Valve, Steam Dump Opening (steady)]



7. Open the letdown orifices before the pressure climb shuts the RHR path.

*Once pressure passes 600 psi, the orifices are the only way water leaves the loop.*

()7a. Press A+B 7 % on the LETDOWN card and check orifice A is in service.

()7b. Check orifice B is in service.

Suggested time warp: 1×.

Background

Water is always being pumped into the reactor loop (charging), so it always needs a way out (letdown). Right now letdown leaves through the RHR loop, and that path closes itself at 600 psi once the heaters start the pressure climb. The letdown orifices, two fixed holes, are the only way out after that; with them shut the plant would slowly fill solid.

[HIGHLIGHTED: Letdown Orifices (CVCS) (pulsing); Letdown Flow (steady)]



8. Put pressurizer spray in service before the heaters start the climb.

*A brake goes in service before the climb it has to stop, not during it.*

()8a. Press AUTO under SPRAY on the PRESSURIZER (PZR) card and check AUTO is lit.

Suggested time warp: 1×.

Note: Nothing moves yet. The spray only opens when pressure runs above the SET PZR PRESSURE box, and the cold plant is about 1340 psi below it.

Background

The pressurizer is a tank of half water, half steam that sets the pressure of the reactor loop: heaters inside the pressurizer boil water to create steam and raise pressure, spray condenses steam to lower it. The cold plant starts with both off. Spray goes in first because it is the only brake on the climb the next step starts, and a control you want in service before you need it is one you put in service while nothing is happening.

[HIGHLIGHTED: Pressurizer Spray (PZR) (pulsing)]



9. Raise PRIMARY PRESSURE to the 665 psi accumulator window on the heaters.

*The accumulator valve can only be opened between 665 and 1615 psi, so pressure has to come up into that window first.*

()9a. Press AUTO under HEATER on the PRESSURIZER (PZR) card and check AUTO is lit.

Suggested time warp: 1×.

()9b. Wait while PRIMARY PRESSURE climbs to 665 psi.

Suggested time warp: 600×.

Note: At 665 psi the clock drops to 1× by itself and stays there until the accumulator valve in the next step is open.

Background

The heaters boil water in the pressurizer, and that steam sets the pressure of the whole reactor loop; the SET PZR PRESSURE box is already sitting at 1700 psi, the lowest it goes, so they go to full power and stay there until the plant gets near it. Pressure stops at 1700 rather than going straight to normal because of an automatic gate at 1972 psi: above that gate the emergency injection pumps re-arm, and with the steam side still cold they would fire on a healthy plant. On the way up the plant passes 665 psi, the accumulator window the next step needs.

[HIGHLIGHTED: Pressurizer Heaters (PZR) (pulsing); Primary Pressure (steady)]



10. Open the accumulator valve while PRIMARY PRESSURE is inside its window.

*With the valve open, the accumulators stand ready to inject by themselves if loop pressure is ever lost.*

()10a. Click the valve symbol inside the pulsing ring while PRIMARY PRESSURE reads 665 to 1615 psi, and check the ACCUMULATORS tile no longer reads ISOLATED.

Suggested time warp: 1×.

Note: Above 1615 psi the valve locks, and the ACCUMULATORS caution is expected until pressure passes 1000 psi. If the window is missed: press OFF under HEATER and MANUAL under SPRAY at 100 %, wait for PRIMARY PRESSURE below 1615 psi, open the valve, then put both back in AUTO.

Background

The accumulators are tanks of borated water pushed by nitrogen gas at 665 psi. They fire by themselves if loop pressure ever falls below that pressure, which is why they are kept isolated while the plant is cold. Above 1615 psi the plant removes power from the valve, so it has to be opened before that point.

[HIGHLIGHTED: Accumulator valve (pulsing); Primary Pressure (steady)]



11. Heat the plant to 542 °F on pump heat alone.

*Hot Standby needs the water near its operating temperature, and the pumps get it there without the reactor.*

()11a. Wait until AVG COOLANT TEMPERATURE reaches 542 °F. Do not move rods or change BORON.

Suggested time warp: 3600×.

Background

The pumps are doing the work now. Watch AVG COOLANT TEMPERATURE, PRESSURIZER LEVEL rising as the water expands, and REACTOR POWER staying at zero. On the steam side, STEAM PRESS climbs toward 1020 psi as the water in the steam generator heats up; the next step hands that pressure to the steam dump to hold.

[HIGHLIGHTED: Tavg, Primary Pressure, SG Pressure (steady)]



12. Confirm letdown now leaves only through the orifices.

*Charging keeps pumping water in, so a letdown path that is not flowing slowly fills the plant solid.*

()12a. Check ISOLATE is lit on the RHR card.

()12b. Check LETDOWN reads above 0 gpm.

Suggested time warp: 1×.

Background

The Residual Heat Removal (RHR) suction valve shut itself when PRIMARY PRESSURE passed 600 psi during the climb; that is an interlock, not something you do. Letdown now leaves only through the orifices you opened earlier, about 11 gpm at this pressure. If it reads zero, water is going in and nothing is coming out.

[HIGHLIGHTED: Letdown Orifices (CVCS), Residual Heat Removal (RHR), Letdown Flow (steady)]



13. Hand STEAM PRESS to the steam dump to hold.

*Pump heat has brought STEAM PRESS up toward 1020 psi, and from here something has to hold it there.*

()13a. Press AUTO on the STEAM DUMP card and check AUTO is lit.

Suggested time warp: 1×.

Note: The dump now holds STEAM PRESS at the 1020 psi in the DUMP SETPOINT box.

Background

From here the plant makes more heat than it needs, and the steam dump sends the excess to the condenser. Without it the steam side keeps climbing until the ATMOS DUMP valve opens and vents steam to the sky for the rest of the heatup. Real plants run the dump in this pressure-holding mode whenever the turbine is off.

[HIGHLIGHTED: Steam Dump — Auto (pulsing); Steam Dump, Steam Dump Status, SG Pressure (steady)]



14. Bring PRIMARY PRESSURE up to normal operating pressure.

*With the steam side hot, the 1972 psi gate can be crossed without firing the emergency injection.*

()14a. Raise SET PZR PRESSURE to 2235 psi and wait for PRIMARY PRESSURE to read above 2175 psi.

Suggested time warp: 600×.

Background

The second stage of the pressurization. Crossing the 1972 psi gate re-arms the emergency injection, and that is safe now because the steam side is hot: STEAM PRESS sits near 1020 psi, far above the 328 psi that would trigger it. That is why this setting waited for the heatup to finish.

[HIGHLIGHTED: Pressure SP (pulsing); Primary Pressure (steady)]



15. Verify Hot Standby.

*Confirming the end state catches a pressure that never came up or a steam side venting to the sky.*

()15a. Check AVG COOLANT TEMPERATURE reads 547 °F.

()15b. Check PRIMARY PRESSURE reads 2235 psi.

()15c. Check CONTROL ROD POSITION still reads 0.

()15d. Check ATMOS DUMP is shut.

()15e. Check STEAM PRESS reads near 1020 psi.

Suggested time warp: 1×.

Background

Hot Standby (Mode 3) is hot and at pressure with the reactor still shut down. The control bank never moved: the pumps did all the heating. STEAM PRESS holding near 1020 psi with the ATMOS DUMP shut says the steam dump is carrying the heat, not the sky.

[HIGHLIGHTED: Tavg, Primary Pressure, SG Pressure, Control Rod Position (steady)]



16. Verify the reactor stayed shut down.

*The startup that follows assumes a core a long way from critical, so that is confirmed before handing over.*

()16a. Check SOURCE RANGE counts read steady.

()16b. Check STARTUP RATE reads −0.02 to +0.02.

Suggested time warp: 10×.

Note: SOURCE RANGE wanders by about a tenth either way with nothing moving; steady means it is not climbing, and the check-off watches it for ten plant-minutes before it ticks. STARTUP RATE on a shut-down core flickers between about −0.01 and +0.01. Either one climbing with the rods still means something is adding reactivity: stop and find out what moved.

Background

There is no gauge for "how shut down" a reactor is. The signs are SOURCE RANGE counts holding at a steady background instead of climbing, and STARTUP RATE sitting at zero. With the control bank in and boron at the cold concentration, the core is a long way from critical.

[HIGHLIGHTED: Source Range, Startup Rate (steady)]



17. Confirm the heatup made no fission power.

*Any power at all would mean a chain reaction, not the pumps, was doing the heating.*

()17a. Check REACTOR POWER reads 0.0 %.

Suggested time warp: 1×.

Note: If it is not, stop and find out what moved: the control bank or BORON.

Background

Power at zero is the whole point of a pump-heat heatup: the friction of the running pumps warmed the plant, not a chain reaction. Power above 0% means something pulled the control bank or diluted the boron.

[HIGHLIGHTED: Reactor Power, Control Bank, Boron (steady)]



## Notes — agent record, NOT step text

*Moved out of the steps 2026-09-17 (OWNER, 2026-09-17: "the .md files with the text from the
walkthroughs are almost unreadable now with all the notes... keep the text clean so i can easily
edit them."). Nothing here is instruction to a player. Add new notes HERE.*

### Reconcile record — 2026-09-24, wt-heatup: ported to the step format

*(OWNER DIRECTIVE, 2026-09-24: "Adopt the format for the other walkthroughs.")* — given after the
Mode 3 to Mode 1 leg was ported and played through three times. The format and its runtime fields
are the ones `02_mode3_to_mode1.md` records. This file and the `pwr_heatup` block of the PWR2 pool
in `ui/manual_procedures.js` carry the same words.

**Tally.** 17 steps in, 17 out — no split, no fold (no step packs two separate goals). 19 lettered
substeps (3 and 9 split into press + wait), 23 check-off lines.

**What moved, and how.** Each of your step lines was split at its colon or first sentence: where it
already opened with the goal ("Verify the plant is cold and shut down", "Start the reactor coolant
pumps", "Verify Hot Standby", "Verify the reactor stayed shut down") that clause is line one and the
rest is the substep's action. Every step-level Note moved onto the substep it belongs to, unchanged.
Three word changes beyond the split, for your review:
- Step 1a gained "Read … and"; step 4a "Read … and"; step 6a "Read"; step 15a and 16a "Read". Your
  lines were the verification with the verb in the goal half; the action half needed one.
- Step 3's note lost its last sentence, "Watch SHUTDOWN ROD POSITION count up." — it IS 3b's action
  now, word for word.
- Step 4a: "OUTPUT 0 MWe" → "OUTPUT 0 MW". The board prints MW, never MWe — verified and ruled on
  the Mode 3 to Mode 1 leg on 2026-09-24 (its record (e), item 4). The pool's `target` field keeps
  "0 MWe": `run_style`'s bare-megawatt check scans `target` and exempts only the other leg's exact
  phrase, and the card never draws this step's `target` (only an observe step's).

**GOAL LINES — AGENT-DRAFTED FOR OWNER REVIEW** (the ones not taken from your own words):

| step | goal line |
|---|---|
| 3 | Withdraw the shutdown bank all the way out. |
| 5 | Put steam generator level control in AUTO while the plant is quiet. |
| 7 | Open the letdown orifices before the pressure climb shuts the RHR path. |
| 8 | Put pressurizer spray in service before the heaters start the climb. |
| 9 | Raise PRIMARY PRESSURE to the 665 psi accumulator window on the heaters. |
| 10 | Open the accumulator valve while PRIMARY PRESSURE is inside its window. |
| 11 | Heat the plant to 542 °F on pump heat alone. |
| 12 | Confirm letdown now leaves only through the orifices. |
| 13 | Hand STEAM PRESS to the steam dump to hold. |
| 14 | Bring PRIMARY PRESSURE up to normal operating pressure. |
| 17 | Confirm the heatup made no fission power. |

Also agent-drafted: 9b's action "Wait while PRIMARY PRESSURE climbs to 665 psi." (from your
"PRIMARY PRESSURE climbs to 665 psi."), and the check-off wording where the pool had none (steps 1,
2, 3, 4, 5, 6, 10, 11, 13, 14, 16, 17 were graded with no label, so the card printed a generated
done-when): each is the step's own `target` text or the tile it reads.

**GRADING — one row added, everything else carried over unchanged.** Measured on the live checklist,
full stack (M4+M5+M6), `cold_shutdown`, the whole leg driven step by step:

| row | predicate | measured |
|---|---|---|
| 3a (NEW) | SHUTDOWN ROD POSITION above 0 | unmet at step entry on both routes; the authored replay (`rod_nudge`, seed 7) ticks +5 s after the command at bank 6; a player's route (FAST, then one WITHDRAW click 5 s in, `rod_start`, seed 42) ticks +10 s, 5 s after the click, at bank 6. Latches (`>`), never un-ticks, cannot strand: nothing but the bank moving makes it true, and 3b cannot be true before it |
| 3b | SHUTDOWN ROD POSITION 615 or more (INHERITED) | +517 s on the replay (bank 620); +522 s on the player route (bank 620) |
| every other row | INHERITED, predicate and threshold unchanged | the leg completes on both routes: replay 6.35 plant-hours (seed 7), player route 6.37 plant-hours (seed 42) |

The shutdown bank tile reads the same `control_state` rod-group step count the row grades (steps are
integers, so "above 0" is the tile's own "1"). Rows that are met at their step's ENTRY are only the
verification steps' (1, 4, 6, 12, 15, 16, 17), which is what a verification is — they wait for the
player's Continue. No action substep is met on entry.

**SPEED PROVENANCE.** Before this port the whole leg ran on the 30 s rule (`hold / rung ≤ 30 s`,
`ui/app.js`); no step authored a `wait_speed`.

| substep | rung | provenance |
|---|---|---|
| 3b | 60× | CARRIED OVER — the rung the 30 s rule gave the step's `hold: 660` (the bank runs itself; no window to stop in) |
| 9b | 600× | CARRIED OVER — the 30 s rule on `hold: 2700`; the plant's own hold drops the clock to 1× at 665 psi |
| 11a | 3600× | CARRIED OVER — the 30 s rule on `hold: 40000` |
| 14a | 600× | CARRIED OVER — the 30 s rule on `hold: 5400`. One substep, not press-then-wait: SET PZR PRESSURE is a typed box, not a walk, and its value is not a channel the instructor can grade (runtime change) |
| 3a, 9a | 1× | the press; the rule had put 3a at 60× and 9a at 600× from step entry, because the old step was one row |
| everything else | 1× | instant presses and verifications (holds under 180 s, which the rule already played at 1×) |

`tools/glance_rung.js` was not run: every one of these windows is a subcritical plant (REACTOR POWER
0.0 %), where its power-glance yardstick reads zero at every rung and cannot decide anything.

**THE LEG'S STATED TIME WAS WRONG, CORRECTED.** The pool's `purpose` said "About 12 plant-hours";
the leg completes in 6.35 plant-hours on the replay and 6.37 on the player route (table above, both
driven step to step). It now says "About 6½ plant-hours". The 12 matches the retired engine's full settle
(its pool comment: ~12.3 h to 567 °F, INHERITED, not re-measured), which this leg does not wait for — it ends at 542 °F and 2235 psi.

**TESTS MOVED, each adjudicated.** `run_checklist_pwr2` 2j found the HEATER step by a regex on the
step line; the press is now 9a's action, so it reads line + actions (stale fixture). 2ae.1b's pinned
pool count 131 → 132 predicate rows (3a; control-state, so the instrument and sole counts hold). 2ah.5
read the step-level `acc_voided`; step 11's row is now an `accs` row whose void is per-row, so it
reads either (passes on the old shape too). `run_checklist_pwr2` baseline 190 → 191 checks: each
`accs` row is its own replay check.

**NOT CHANGED, flagged:**
- Step 16 still grades NET REACTIVITY below −300 pcm, a diagnostic, not a tile — the 2026-09-15 note
  above records your ask to grade SOURCE RANGE and STARTUP RATE instead. Still open; it needs its own
  measurement.
- Step 11 grades 283 °C (541.4 °F) against a check-off that reads 542 °F — it ticks up to 0.6 °F
  early, lenient and never stranding. Left as is; the tile's rounding was not checked.

---

### Reconcile record — 2026-09-24 (b), rp_start lane: step 16 graded on the board

*OWNER RULING (2026-09-24): selected "Grade board readings" — "Grade SOURCE RANGE and STARTUP RATE
after a measurement pass, so the check-off matches what the step tells them to read." A selection,
not his own words (Hard Rule 11). Changed in this file AND in `ui/manual_procedures.js`'s
`pwr_heatup` pool. Closes the "Step 16 still grades NET REACTIVITY" flag above.*

**Grading.** NET REACTIVITY below −300 pcm (true_state) → two rows on the INSTRUMENTS the tiles draw:
SOURCE RANGE `steady` (1.2 % over a trailing 600 s) and STARTUP RATE −0.025 to +0.025 (every value
the tile's two decimals draw as −0.02 to +0.02). Replay `hold` 0 → 720 s. MEASURED, live runtime,
step 16 held open 60 plant-min: a still plant's SOURCE RANGE wanders ±13 % (147-194 cps at 168
true) and STARTUP RATE −0.013 to +0.012, so the rate row cannot see a slow approach (+0.004 to
+0.009 through a dilution) and the SOURCE RANGE window is the discriminator. Player route (seeds 42,
7) and a replay-dwell route: done at 10.1 min. Approaching critical, never in 60 min: dilution
918 → 719 ppm (seeds 42/7/123; −3400 → −1840 pcm), rods to 210 plus dilution to 600 ppm (−678 pcm
at 60 min). A slow 200-step pull ticks 5.9 min after the rods stop. Injection: the SOURCE RANGE row
removed, or the old −300 pcm row restored, and the dilution case completes in 0.1 min.

**Text changed (the rest as written):**
- 16a note: "The done-when line reads NET REACTIVITY in pcm — … On the board the same fact is SOURCE
  RANGE steady and STARTUP RATE at 0.00." → "SOURCE RANGE wanders by about a tenth either way with
  nothing moving; steady means it is not climbing, and the check-off watches it for ten
  plant-minutes before it ticks. STARTUP RATE on a shut-down core flickers between about −0.01 and
  +0.01. Either one climbing with the rods still means something is adding reactivity: stop and find
  out what moved."
- 16a speed: "1×." → "10×." (a ten-plant-minute window is ten wall-minutes at 1×)
- 16a check-off: "NET REACTIVITY below −300 pcm" → two lines, "SOURCE RANGE steady" and "STARTUP
  RATE −0.02 to +0.02".

**What it no longer grades:** the shutdown MARGIN. A plant stopped subcritical but close to critical
(rods out, boron diluted, then left alone) settles and ticks; the whole-run guard (true reactivity
never above 0) still stands.

### Carried over — the previous live file's agent record (verbatim, 2026-09-15 to 2026-09-21)

*Its step numbers are unchanged by the 2026-09-24 port (17 in, 17 out); the step LINES it quotes are the pre-port ones.*

REVISED 2026-09-15 (#653 S-9): `pcm` appears exactly ONCE in both legs — here — on a step graded on a quantity that is not on the board, and the unit was never defined. The done-when LINE itself is rendered by `PRED\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_DISPLAY` in ui/app.js from `acc.p` and is not authorable from the step, so the note is where the unit gets defined. **The acceptance is deliberately untouched**: your note above it asks for this step to grade on SOURCE RANGE and STARTUP RATE instead, and that is a grading change owing its own measurement — still open.

REFRESHED FROM THE SIM 2026-09-21 — DIRECTION FLIPPED FOR ONE PASS *(OWNER, 2026-09-21: "update
the .md files to what is in the sim for the walkthrough steps")*. Every other reconcile brought the
pool DOWN to this file; this one wrote the file FROM the built pool (`ui/manual_procedures.js`,
`RD.MANUAL_PROCEDURES.pwr2`, id `pwr_heatup`). 17 steps in, 17 out. The file is now in the format
03–06 already carried, which renders exactly: step line, `Control:`/`Target:`, the lettered `accs`
rows, `Note:`, `Background`, `[HIGHLIGHTED: … ]` from `hl` (pulsing) / `hl_watch` (steady). It does
NOT render the panel's done-when (`✓ When …` / `○ When …`), the ⏩ speed hint, or a hand-written
HIGHLIGHT line — none of those three is a field this file can set, and the same renderer reproduces
03, 04, 05 and 06 byte for byte, which is what makes it the format rather than a choice.

**YOUR LINES THAT THE REFRESH REPLACED, so you can re-apply any of them by editing above and asking
for the pool to come back down.** Left of the arrow is what this file said, right is what ships:

* step 1 — "Verify the plant is cold and shut down: … **Reactor Coolant Pump (RCP)** FLOW OFF." → "… **RCP** FLOW OFF."
* step 1 done-when — you struck "(true value)" from "the plant reads Mode 5, Cold Shutdown (true value)". That suffix is `ui/app.js` (two sites, ~4491 and ~4700) and is appended to EVERY true-state acceptance, not just this one; it was not changed.
* step 2 — "Start the **Reactor Coolant Pump (RCP)**: press ON…" → "Start the **reactor coolant pumps**: press ON…"
* step 2 Background — "…warm the whole plant **with the reactor never critical.**" → "…warm the whole plant. **Real crews heat up exactly this way, with the reactor never critical.**"
* step 3 Background — "In a **Pressurized Water Reactor (PWR)**," → "In a **PWR**,"
* step 5 — "Set the **Steam Generator feed system [SG FEED]** to AUTO." → "Set **SG FEED** to AUTO."
* step 5 Background — "The steam generator **(SG)** is the boiler" → "The steam generator is the boiler"
* step 7 Background — "closes itself at 600 psi **on the next step's pressure climb**" → "closes itself at 600 psi **once the heaters start the pressure climb**"; your trailing "[HIGHTLIGHT: …]" line went with it (the pool's own highlights are printed instead).
* step 8, step 9 Backgrounds — your trailing "[HIGHLIGHT: …]" lines, same reason.
* step 9 Background — "an automatic **safety** gate at 1972 psi" → "an automatic gate at 1972 psi"
* step 10 — "Open the **ACCUMULATOR** valve: click the valve symbol **to open it** while…" → "Open the **accumulator** valve: click the valve symbol **inside the pulsing ring** while…"
* step 10 Background — "fire by themselves if loop pressure ever falls below **600 psi**" → "…below **that pressure**". **This one is not just wording:** the sentence before it says the nitrogen is at 665 psi, and 665 is the pressure they fire at. 600 psi is the RHR suction interlock, a different number on a different valve.
* step 12 — "Verify ISOLATE is lit on the **Residual Heat Removal (RHR)** card" → "…on the **RHR** card"
* step 12 Background — "that is an **automatic** interlock" → "that is an interlock"
* step 15 Background — "The control **rod** bank never moved" → "The control bank never moved"; "…says the steam dump is carrying the heat." → "…carrying the heat, **not the sky**."

Your spell-out edits (RCP, PWR, SG, RHR, SG FEED) are the standing "spell out every code" directive
applied to player copy and are the largest single group here. They were never carried into the pool,
so this refresh dropped them; re-applying them is one edit above plus a reconcile, not new work.

---

### Reword record — 2026-09-25, `exp/w6-heatup` scratch lane: the what / why / how format

*OWNER RULING (2026-09-24), selected "Yes, all five" — option text: "Opus agents restyle heatup,
raise, lower, shutdown and cooldown to match, using your Mode 3 → Mode 1 steps 1–3 as the model.
Measured numbers stay; the gates and a layman pass confirm." A selection, not his own words (Hard
Rule 11). The shape is `02_mode3_to_mode1.md` record (h) and `CHECKLIST_WRITING_GUIDE.md` §16.
**Step file only (phase 1):** the `pwr_heatup` pool in `ui/manual_procedures.js` is NOT changed and
still carries the pre-reword text; it comes down in phase 2, once the runtime supports this shape.*

**Tally.** 17 steps in, 17 out (no split, no fold). Lettered substeps 19 → **31**; check-off lines
23 → **31** (one per substep). Every step gained one italic WHY line, all 17 AGENT-DRAFTED for your
review. No Background, highlight line, time-warp rung or Note number changed.

**Step 1's line — OWNER RULING (2026-09-24), selected "Take all defaults".** "Read AVG COOLANT
TEMPERATURE 122 °F, PRIMARY PRESSURE 363 psi, and RCP FLOW OFF" was true only on the preset (the
chain arrives near 197 °F and 14 psi, INHERITED from the ruling's own text, not re-measured here). It
is now 1a "below 200 °F" and 1b "reads low". The old note "Both rod positions read 0 of 627" became
check-off 1d. **Still carrying the preset-only numbers, NOT changed (pool fields, phase 2):** the
leg's `prereq` text and two `precond` labels ("near 122 °F", "near 363 psi"); their predicates are
`tavg_c < 95` (203 °F) and `pressure_mpa < 5` (725 psi), so the grading already admits both routes.

**Lines whose MEANING changed:**
- 1a / 1b — the ruling above (a preset reading became a bound).
- 4b — "If LOAD reads anything but 0, press UNLOAD" moved from the Note into the substep as its
  inline recovery (the §16 rule). The Note keeps the TRIP-ring and UNLOAD-is-not-TRIP sentences.
- 6a — "status reading MANUAL" became part of its own check-off; before, only the dump opening under
  1 % was graded and MANUAL was read but not checked.
- 14a — gained "and wait for PRIMARY PRESSURE to read above 2175 psi", the existing check-off's
  condition written into the line (§16: the line IS the check-off).
- 15a–c — the one "Read … 547 °F, … 2235 psi, CONTROL ROD POSITION still 0" line became three
  check-offs, each a reading the step now claims to check. Before, only "Plant in Mode 3, Hot
  Standby", ATMOS DUMP and STEAM PRESS were graded.

**Wording only, no meaning change:** "Read" / "Verify" → "Check" on every observe substep (1, 4, 6,
12, 15, 16, 17 — the 02 model's verb; "Read" was an agent's word per the 2026-09-24 port record, 12a's
and 17a's "Verify" were yours). Every action substep gained "and check … is lit" / "reads …", the
existing check-off label folded into the line. 3b "Watch … count up" → "Watch … count up to near 627
of 627" (your sentence plus its check-off). 7a / 7b and 12a / 12b split one line with two check-offs
into two letters. 16b's "near 0.00" → "−0.02 to +0.02", the existing check-off's wording. "Read TRIP
lit … and OUTPUT 0 MW" → 4a TRIP + 4b OUTPUT. All 17 first lines are unchanged (the 11 agent-drafted
at the 2026-09-24 port are still up for your review), including "nothing to press" on 4 and 6 (it
names the step's kind, not a button). No first line carried HOW, so none was cut.

**NEW CHECK-OFFS NEEDING AN ACCEPTANCE IN PHASE 2** (substeps with no grading row of their own today):

| substep | should grade | note |
|---|---|---|
| 1a | AVG COOLANT TEMPERATURE below 200 °F (93.3 °C) | the leg's `precond` already grades `tavg_c < 95` (203 °F); grade on the tile's drawn value |
| 1b | PRIMARY PRESSURE "low" | needs a number: must tick at 14 psi (chain) AND 363 psi (preset); the leg's `precond` uses < 725 psi (5 MPa). Measure both routes before choosing |
| 1c | RCP FLOW OFF | pump-flow channel the tile draws |
| 1d | both rod groups at 0 steps | `control_state` step counts |
| 4b | OUTPUT 0 MW | generator output channel |
| 6a | STEAM DUMP in MANUAL, CLOSE lit | `steam_dump_auto` 0; CLOSE may be the same state as 6b's opening, check before adding a row that cannot differ from it |
| 15a | AVG COOLANT TEMPERATURE 547 °F | needs a band; step 11 ends at 542 °F, so measure where the tile sits when step 15 opens on both routes |
| 15b | PRIMARY PRESSURE 2235 psi | needs a band; 14a already grades > 2175 psi |
| 15c | CONTROL ROD POSITION 0 | step count |

**Existing rows left WITHOUT a substep** — step 1's `plant_mode ~ 5` and step 15's `plant_mode ~ 3`
("Plant in Mode 5, Cold Shutdown", "Plant in Mode 3, Hot Standby"). Recommendation for phase 2: retire
both in favour of the tile substeps, as `02` step 17 did ("Step 17's two rows replace the pool's
single `plant_mode ~ 1`"); or keep them as hidden rows. Every other existing row maps one-to-one to a
substep: 2a, 3a, 3b, 4a, 5a, 6b, 7a, 7b, 8a, 9a, 9b, 10a, 11a, 12a, 12b, 13a, 14a, 15d, 15e, 16a,
16b, 17a (22).

**Time warp.** Once per step everywhere except 3 and 9, where the substeps differ (1× / 60×, 1× /
600×), unchanged from the 2026-09-24 port. 16's 10× now sits under both 16a and 16b; only 16a's
ten-minute window needs it.

**NOT verified:** nothing was run against the plant — this is text. The WHY lines make no new
number; 7's "600 psi" and 9's "665 and 1615 psi" are this file's own Background/Note figures, and
14's "without firing the emergency injection" restates 14's Background. No layman pass yet.
