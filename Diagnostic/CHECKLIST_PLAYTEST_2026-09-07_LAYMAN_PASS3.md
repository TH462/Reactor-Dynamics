> **Record, not policy.** Third fresh-context layman playthrough of the six PWR2 live checklists in headless Edge, 2026-09-07, on the tree after the pass-2 fixes: **all six legs completed**, cold shutdown to full power and back. Its stuck points are the board and the clock rather than the wording: a 3600× WARP freeze (25 minutes of wall time, page unresponsive), the fast-forward dropout returning the clock to 1× on every new alarm with no line saying so, a turbine runback that moved LOAD 90 → 53 by itself (the plant protecting itself against the hot coolant; the step now says so), a cmd-graded HEATER OFF that did not register a press made before the step was active, and done-when labels that used engine names (Tavg, Steam dump demand) rather than the tiles. Text and label fixes landed the same day; the WARP freeze and the missing Acknowledge on a collapsed observation step are filed as issues.

# Layman playthrough — pass 3

**Build:** `Alpha 1.7.4-rc3  TEST BUILD`, `ui/shell.html?engine=pwr2&tab=checklists&init=cold_shutdown`, headless Edge 1600×1000.
**Player:** knows what a pump and a valve are. Nothing else. Only the checklist panel and the board were read.
**Screenshots:** `scratchpad/pass3/s0NN_*.png` (28 files), named in the log below.
**Run:** ~2 h 15 min wall. One full restart of the browser at heatup step 11 (see S-1).

---

## 1. Outcome

| Leg | Result | Steps | The one thing that mattered |
|---|---|---|---|
| **1. Heatup** (Mode 5 → Mode 3) | **COMPLETED** 17/17 | 1–17 | Went cleanly once I learned that `3600×` needs `Ack All` first, and sometimes two presses. First attempt froze the page for 25 min at `3600×` and I restarted (S-1). |
| **2. Startup** (Mode 3 → Mode 1) | **COMPLETED** 18/18 | 1–18 | The five 1/M rod-pull steps need **~225 rod steps of continuous mouse-holding** and the checklist never says what speed to run at (S-3). The clock kept dropping back to 1× on its own, so a hold that moved 76 steps moved 4 the next time (S-2). |
| **3. Power ascension** (10 % → 100 %) | **COMPLETED** 10/10, but **only after doing something the text does not mention** | 1–10 | Step 7 would not tick: `AVG COOLANT TEMPERATURE` sat at 596 °F against a `below 585 °F` check. The cause was that the **LOAD box I had typed 90 into had silently changed itself to 53** (S-4). Re-typing 90 fixed it in 45 s. |
| **4. Load rampdown** (100 % → 15 %) | **COMPLETED** 5/5 | 1–5 | Effortless. Best-written leg in the set. |
| **5. Shutdown** (Mode 1 → Mode 3) | **COMPLETED** 3/3 | 1–3 | Effortless. |
| **6. Cooldown** (Mode 3 → Mode 5) | **COMPLETED** 14/14, but **step 6 required a control to be pressed twice** | 1–14 | Step 6's `Heaters OFF` line stayed unticked while the board plainly showed `OFF` lit under `HEATER` and `HTR PWR 0 %`. Pressing `AUTO` then `OFF` again ticked it (S-5). |

**Round trip completed.** Final board: `AVG COOLANT TEMPERATURE 190 F`, `PRIMARY PRESSURE 223 psi`, `ACCUMULATORS 100 % ISOLATED`, `ALIGN` lit, `HX FLOW 25 %` — `s028_final.png`.

A layman *can* get from cold shutdown to full power and back. Nothing in the wording is unreadable and the "Why?" text is genuinely good. What stops you is not language — it is **five places where the board and the checklist's own tick-box disagree**, and the fact that **the clock does not stay where you put it**.

---

## 2. Stuck points, ranked

### S-1 — CRITICAL. `3600×` froze the page for 25 minutes; on a later attempt the same button did nothing, twice, then worked.
> Heatup step 11: *"⏩ About 11 plant-hours at 1× — set the speed control to **3600×** (WARP; the plant must be quiet to take it — if it is refused, press Ack All on the ALARMS panel and try again, or use 60×)."*

**What I did.** Pressed `3600×`; it fell back to `60×` with **no message anywhere on screen**. Pressed `Ack All` as instructed; pressed `3600×`; it took (`s007_warp3600.png`). The page then stopped responding to anything for 25 minutes of wall time and I had to kill the browser and start the leg again.
On the replay the identical sequence — `Ack All`, then `3600×` — was **refused again** with every alarm showing `acknowledged` (`s008_warp_refused.png`). A **second press of the same button** took it. It then ran fine.
**What would have unstuck me:** the speed bar saying *why* it refused ("plant not quiet: <reason>") instead of silently dropping back a notch, and the button not needing to be pressed twice.

### S-2 — CRITICAL. The clock reverts to 1× on its own, mid-step, and nothing says so.
Measured three times. Heatup/startup, rods at `MED`:
- 12 s hold right after pressing `10×` → **76 steps** (16 → 92).
- 7 s hold a minute later, no button touched → **4 steps** (92 → 96). Speed bar read `1×`.
- Power ascension step 6: speed read `10×[on]` at the start of one command and `1×[on]` at the start of the next, with only a rod hold in between (`s019_rodstop.png`).

**What I did.** Re-pressed the speed button before every single rod hold for the rest of the run. Note that **pressing a speed button that is already lit puts you back to 1×**, so "press it again to be sure" is exactly the wrong instinct.
**What would have unstuck me:** either the clock holding the speed I set, or a visible line saying "speed reduced to 1× because <x>".

### S-3 — HIGH. Five rod-pull steps ask for ~225 steps of continuous mouse-holding and give no speed guidance.
> Startup step 5: *"press MED, then hold WITHDRAW under CONTROL until SOURCE RANGE settles above 7.0e2, **about 90 to 110 steps**."* Steps 6, 7, 8, 9 add 150–175, 180–205, 195–220, 205–225.

**Measured rod speed:** `MED` at 1× = **0.7 steps per second**; `SLOW` at 1× = **0.1 steps per second**. So step 5 alone is **~2 min 30 s of holding the mouse button down**, step 14 ("about 13 steps" at `SLOW`) is **~2 min 10 s**, and none of steps 5–9 or 14 carries a `⏩` speed hint the way the waiting steps do.
**What would have unstuck me:** a `⏩` line on the rod steps too — "use 10×, the rods move with the clock" — since that is the only thing that makes them bearable, and I had to work it out myself.

### S-4 — HIGH. The `LOAD` box changed itself from 90 to 53, and that is why step 7 would not tick.
> Power ascension step 7: *"…set LOAD to 90 MWe, then adjust the rods until AVG COOLANT TEMPERATURE is inside its band, near 575 °F."* Tick-box: `○ AVG COOLANT TEMPERATURE below 585 °F`.

**What I did.** Typed 90 into `LOAD`. The step ticked `✓ Load target set to 90 MWe` and `✓ Generator at 90 MWe`. `AVG COOLANT TEMPERATURE` then sat at **596 °F** and would not come down. Following the step's own instruction I held `INSERT` for 38 steps: power fell 91.8 % → 75.1 %, temperature fell **3 °F** (596 → 593) and then stopped. Six minutes of plant time later it was still 593.
Only when I screenshotted the whole board (`s021_stuck_tavg.png`) did I see `LOAD 53 MW`, `OUTPUT 53 MW`. **I never typed 53.** Re-typing 90 brought the temperature to 585 °F in 45 s and the step ticked.
**What would have unstuck me:** the `LOAD` box not moving off the number I typed — or, failing that, the step saying "if the temperature will not come down, check LOAD is still where you set it", because "adjust the rods" is the one thing that does not work here.

### S-5 — HIGH. A step would not tick although the board showed exactly what it asked for.
> Cooldown step 6: *"press **OFF under HEATER** first. Then press MANUAL under SPRAY and set its box to 50 %…"* Tick-boxes: `○ Heaters OFF` / `✓ PRIMARY PRESSURE below 1615 psi`.

**What I did.** Pressed `OFF` under `HEATER`. Board showed `OFF` lit (yellow) under `HEATER`, `HTR PWR 0 %` on the diagram, `SPRAY MANUAL` lit, spray box `50`, `PZR SPRAY 50 %` — `s027_step6stuck.png`. `○ Heaters OFF` stayed unticked through 1615 → 1448 → 1299 psi. Pressing `OFF` a second time did nothing. Pressing **`AUTO` and then `OFF` again** ticked it immediately.
**What would have unstuck me:** the tick-box reading the same thing the lamp does. As it stands the board says "done" and the checklist says "not done", and a player with no other information has no move.

### S-6 — MEDIUM. `BORON CHEM` does not move when you change boron, and the tick-box is phrased as if it does.
> Startup step 2: *"on the BORON card set 719 and press Enter."* Tick-box: `○ When Boron within 40 ppm of 719 ppm` / *"Use Boron control: **BORON reads 719 ppm**"*.

There are two boron numbers on the card. The **box** reads 719 the instant you type it. `BORON CHEM` stayed at **918 ppm** for 90 s of wall (≈90 plant-minutes at 60×) and only later flipped to `SAMPLING…` and then 719. Meanwhile `BORON STATUS` on the diagram counted `DILUTING 196→ … 37→`. So the readout the tick-box names is the one that does not move, and the one that does move (`BORON STATUS`) is not mentioned. I spent two commands convinced the dilution had not started (`s010_boron.png`, `s011_boron2.png`).

### S-7 — MEDIUM. Step numbers you are told to hit are not the numbers the check accepts.
| Step | Text says aim for | Tick-box actually wants | What I ended at |
|---|---|---|---|
| Heatup 11 | `AVG COOLANT TEMPERATURE` **542 °F** | `When Tavg ≥ **541 °F** (283 °C)` | 551 °F |
| Ascension 5 | Tavg **near 562 °F** | `below **583 °F**` | 576 °F |
| Ascension 6 | Tavg **near 570 °F** | `below **585 °F**` | 591 °F |
| Ascension 7 | Tavg **near 575 °F** | `below **585 °F**` | 585 °F |

A player who takes "near 562 °F" literally will keep inserting rods against a plant that is already passing the step. A player who trusts the tick-box ends up 20 °F hot with no idea whether that is wrong.

### S-8 — MEDIUM. Following the checklist raises alarms the checklist never mentions.
- Heatup 10 ("open the accumulator valve now") immediately produced **`Accumulators Still Lined Up — RCS Below Their Isolation Pressure`** (caution). The checklist told me to do it; the plant complained.
- Heatup 9/10 produced **`Shutdown Cooling Not In Service — RCS Is Below the RHR Entry Pressure`** (warning). Never mentioned.
- Ascension 7 produced **`Control Rods — Insertion Limit`** and **`Control Rods — Approaching Insertion Limit`** *while I was withdrawing rods* (`s020_tavg_high.png`). This one **is** explained — but three steps later, in step 10's "Why?" text, which is collapsed by default, and there it is called **`ROD LIMIT LO-LO`**, which is not what the alarm banner says.
- Cooldown step 4's dump ladder, run at the pace the step describes, produced **`Cooldown Rate High (>100 °F/hr)`** — the exact thing step 11 later tells you to avoid.

### S-9 — MEDIUM. The last step of the power-ascension leg had no way to finish it.
> Ascension step 10: *"Over the next hours, lower the BORON setting in small steps toward 626 ppm as xenon builds…"*

Collapsed, this step showed **no `done when` line, no `Acknowledge ✓`, and no `Next:` button** — I queried the panel and there were zero `Acknowledge` buttons on screen. I set boron to 626 and waited; still nothing. The `Acknowledge ✓` appeared only after I clicked **`Show all details`**, an unrelated button at the top of the leg. From a player's seat, the leg was over and there was no way out of it.

### S-10 — LOW. "Click the valve symbol beside the ACCUMULATORS tile" is not beside the ACCUMULATORS tile.
> Heatup step 10 / cooldown step 7.

The `ACCUMULATORS` tile is the box at the bottom-left of the diagram (`ACCUMULATORS 100 % / 665 psig / ISOLATED`). The valve you must click is a small unlabelled symbol **above and to the right of it**, next to the words `ECCS FLOW`. I clicked the tile itself first; nothing happened. I only found the valve because the active step **glowed a green ring around it** (`s006_accum.png`) — which works, but is not what the words say, and it is the only control in six legs identified by "click the symbol" rather than by a name printed on the board.

### S-11 — LOW. `WARP` is sometimes greyed out as `warp locked` with no reason given, on a quiet plant.
Observed at startup steps 2–14 and cooldown step 4 (`600×`/`3600×` both dimmed). Cooldown step 4 says *"About two plant-hours in all; use the speed buttons at the top"* and step 1 says to use `600×` — but the buttons were locked and I had to do the whole 18-value ladder at `60×`.

### S-12 — LOW. Tick-box wording names things that are not on the board.
- Heatup 6: step says *"Check the STEAM DUMP card: CLOSE lit and the status reading MANUAL"*; the tick-box says `When **Steam dump demand ≤ 1 %**`. There is no "demand" number on the `STEAM DUMP` card.
- Heatup 11 and elsewhere: `When **Tavg** ≥ 541 °F`. The tile is called `AVG COOLANT TEMPERATURE`. "Tavg" appears only as a row label on the trend chart at the bottom.
- Heatup 15: step says to check temperature, pressure, steam pressure and rod position; the tick-boxes are `✓ ATMOS DUMP shut` and `✓ STEAM PRESS near 1020 psi` — two things the step never mentions.
- Ascension 8: `○ Control bank withdrawn well past its starting **227**`. Nothing on the board ever showed 227.

---

## 3. Per-step log

Format: step → what I looked for → what I did → time / speed → ticked? → confusion.

### Leg 1 — Heatup (`pwr_heatup`), 17 steps, COMPLETED

1. *"Nothing to press. Check the plant is cold and shut down: AVG COOLANT TEMPERATURE 122 °F…"* — every number matched the board (`122 F`, `363 psi`, `OFF` lit on `RCP FLOW`, `0 /627` twice). Already `✓` on arrival; pressed `Acknowledge ✓`. Instant. **No confusion.**
2. *"Start the reactor coolant pumps: press ON on the RCP FLOW card."* — found `RCP FLOW` under the reactor with `OFF`/`ON`; clicked `ON`. Ticked itself after **<90 s at 1×** when `RCP FLOW` passed 90 %. No Acknowledge needed. **No confusion.**
3. *"press FAST on the speed row, then click WITHDRAW under SHUTDOWN once."* — the `ROD CONTROL` card has two columns headed `CONTROL` and `SHUTDOWN`; clicked `FAST`, then `WITHDRAW` in the `SHUTDOWN` column. Hint said *"About 11 plant-minutes at 1× — set the speed control to 60×"*; pressed `60×`. Ticked in **~8 s**. **No confusion** — this is the clearest control-naming in the set.
4. *"Check the TURBINE-GENERATOR card: TRIP lit, OUTPUT 0 MWe."* — ticked on its own, no action.
5. *"Press AUTO on the SG FEED card."* — `SG FEED` card top right; clicked `AUTO`. Ticked in ~3 s; the card's header changed to `HOLDING`.
6. *"Check the STEAM DUMP card: CLOSE lit and the status reading MANUAL."* — both true on the board. `Acknowledge ✓`. **Confusion:** the tick-box read `When Steam dump demand ≤ 1 %` — no such number exists on that card (S-12).
7. *"Press A+B 7 % on the LETDOWN card."* — board button reads `A+B 7%` (no space). Clicked. Ticked ~2 s.
8. *"press AUTO under HEATER, then AUTO under SPRAY."* — `PRESSURIZER (PZR)` card, two columns `SPRAY` / `HEATER`. Clicked both. Ticked. **Confusion:** three tick-boxes — `Heaters in AUTO`, `Spray placed in AUTO`, `Spray control in AUTO` — I could not tell what the last two are meant to be different from.
9. *"Raise SET PZR PRESSURE to 1700 psi…"* — typed `1700` + Enter in the `SET PZR PRESSURE` box. First tick-box `✓` instantly; second (`PRIMARY PRESSURE at 665 psi`) needed the plant to get there. Hint said `600×`; pressed it, **accepted first time**. Took **~210 s wall** to reach 685 psi. The clock **dropped to 1× by itself at 665 psi exactly as the step promised** — the only time a speed change was explained.
10. *"click the valve symbol beside the ACCUMULATORS tile…"* — see S-10. Clicked the tile (nothing), then the glowing valve at the `ECCS FLOW` label. Ticked; `ACCUMULATORS` went `ISOLATED` → `ARMED`. **Confusion:** immediately raised a caution alarm (S-8).
11. *"Wait until AVG COOLANT TEMPERATURE reaches 542 °F… set the speed control to 3600×."* — see S-1 and the 25-minute freeze. On the successful run: `Ack All`, `3600×` (refused), `3600×` again (took), **45 s wall** to 551 °F. `Acknowledge ✓`.
12. *"Check ISOLATE is lit on the RHR card and LETDOWN reads above 0 gpm."* — `RHR` card had switched from `ALIGN` to `ISOLATE` by itself. Both tick-boxes green. `Acknowledge ✓`. **Mild confusion:** nothing had warned me the card would change on its own.
13. *"Press AUTO on the STEAM DUMP card."* — clicked `AUTO`. Ticked ~3 s.
14. *"Raise SET PZR PRESSURE to 2235 psi."* — typed it. Hint said `600×`; **pressing `600×` while at `3600×` dropped me to `60×`**. Ticked anyway in **~60 s**.
15. *"Check Hot Standby: AVG COOLANT TEMPERATURE near 547 °F, PRIMARY PRESSURE 2235 psi, STEAM PRESS near 1020 psi, CONTROL ROD POSITION still 0."* — `Acknowledge ✓`. **Confusion:** tick-boxes were `ATMOS DUMP shut` and `STEAM PRESS near 1020 psi` (S-12).
16. *"Check the reactor stayed shut down."* — `Acknowledge ✓`.
17. *"Check REACTOR POWER reads 0.0 %."* — `Acknowledge ✓`. Leg complete; `Next:` button appeared at the bottom of the panel.

### Leg 2 — Startup (`pwr_startup`), 18 steps, COMPLETED

1. *"Check the plant is hot and shut down…"* — already `✓`; `Acknowledge ✓`.
2. *"on the BORON card set 719 and press Enter."* — typed it. See S-6: `BORON CHEM` never moved; `BORON STATUS` on the diagram read `DILUTING 196→` and counted down. **No `⏩` hint on this step**, and the clock had put itself back to 1×, so nothing appeared to happen for a long time. Pressed `60×` myself — *something the text did not tell me to do*. Ticked after ~90 s wall. Screenshots `s010_boron.png`, `s011_boron2.png`.
3. *"Check SG FEED reads AUTO."* — already `AUTO`. `Acknowledge ✓`.
4. *"press 1/M PLOT on the ROD CONTROL card, then press Plot point."* — `1/M PLOT` button is bottom-left of `ROD CONTROL`. A window `1/M Startup Plot` opened with `Plot point` / `Clear` / `Help`. Clicked `Plot point`. Ticked instantly. `s012_1m_panel.png`. **No confusion** — well signposted.
5. *"press MED, then hold WITHDRAW under CONTROL until SOURCE RANGE settles above 7.0e2, about 90 to 110 steps."* — see S-3. Held at 1× (0.7 steps/s), gave up and used `10×`. Reached 107 /627; counts settled at `7.4e2` after ~25 s; `Plot point`. Ticked.
6. *"…above 1.4e3, about 150 to 175 steps… then read the position the 1/M panel predicts."* — 156 /627, `1.6e3`, `Plot point`. The panel showed **`predicted criticality ≈ step 202 (32.2% withdrawn)`** and drew a `critical 202` line — easy to find (`s015_1m_window.png`). Ticked.
7. *"…above 3.0e3, about 180 to 205 steps."* — pulled to 180, counts settled at **2.7e3, below the target**, so I pulled 11 more to 191 → `4.6e3`. `Plot point`. Ticked. **Mild confusion:** the step-count range and the count target do not line up; the counts are the real criterion and the step counts are only a hint, but the text presents them as one instruction.
8. *"…above 7.0e3, about 195 to 220 steps."* — 200 /627 → `8.8e3`. `Plot point`. Ticked.
9. *"…above 2.0e4, about 205 to 225 steps."* — 206 /627 → `2.3e4`. `Plot point`. Ticked.
10. *"Press SLOW, then tap WITHDRAW one step at a time…"* — one tap = exactly one step, clearly visible. Tapped 4 times (207 → 209), counts rose to `9.2e4`, `SOURCE RANGE` then flipped to `1.0e0 cps` and `INTER RANGE` started reading. Tick-box wanted `Reactor power ≥ 0.1 %`; sat at `0.0` for **~2 minutes at 60×** before turning over. Ticked at 0.1 %.
11. *"Tap WITHDRAW two more single steps at SLOW."* — tapped twice (→ 211). Power reached 0.6 %. Ticked.
12. *"Check SOURCE RANGE has switched itself off and INTER RANGE is reading."* — both true. `Acknowledge ✓`. **This step is the one that made the previous two make sense** — good writing.
13. *"Press MED, then hold INSERT until REACTOR POWER stops rising and is below 5 %… If it is already steady below 5 %, nothing to press."* — power was 0.6 %, so nothing to press; ticked itself.
14. *"Press SLOW, then hold WITHDRAW until REACTOR POWER passes 5 %, about 13 steps."* — see S-3: `SLOW` at 1× is 0.1 steps/s. Used `10×`, 221 /627, power 5.3 %. Ticked.
15. *"Close the 1/M PLOT window with its ✕ (it covers the turbine card). Then press LATCH… and set LOAD to 10 MWe."* — did all three. **Good step**: it warns you the window is in the way before you find out. Ticked after ~40 s when `OUTPUT` reached 10 MWe.
16. *"Press TRIP BLOCKS on the ROD CONTROL card, then BLOCK on the IR HIGH FLUX row. Do this the moment REACTOR POWER is above 8 %: at 25 % this trip fires."* — panel opened over the board with four rows and four `BLOCK` buttons; rows are clearly named. Clicked row 2. Ticked. **Good step** — it tells you the consequence of being late.
17. *"…press BLOCK on the PR HIGH (LOW SETPT) row, then press TRIP BLOCKS again to close the panel; it covers the rod buttons."* — did both. Ticked.
18. *"Check Mode 1: REACTOR POWER near 10 %, OUTPUT near 10 MWe…"* — `Acknowledge ✓`. Leg complete.

### Leg 3 — Power ascension (`pwr_raise_power`), 10 steps, COMPLETED with S-4

1. *"Check: REACTOR POWER above 10 %, OUTPUT above 5 MWe…"* — `Acknowledge ✓`.
2. *"On the BORON card set 660 and press Enter."* — typed. Ticked in ~3 s (much faster than step 2 of the startup leg, for no visible reason).
3. *"Press SAMPLE on the BORON card. The lab result appears in the BORON CHEM readout in about 30 plant-minutes."* — clicked `SAMPLE`. Ticked. **This step is what should have been said back in startup step 2** (S-6).
4. *"Hold WITHDRAW at MED for about 30 steps, then set LOAD to 30 MWe. Then adjust the rods until AVG COOLANT TEMPERATURE is inside the green band on its tile, near 556 °F."* — pulled 248 → 278 at `10×`, typed `30` into `LOAD`. Ticked after ~40 s at Tavg 558 °F.
5. *"…about 32 steps, set LOAD to 50 MWe… near 562 °F."* — pulled to 286, `LOAD 50`. Ticked at **Tavg 576 °F** against a text target of 562 (S-7).
6. *"…about 35 steps, set LOAD to 75 MWe… near 570 °F."* — this is where I first noticed the clock had reset itself (S-2): a 5.2 s hold moved 3 steps. Re-set `10×`, pulled to 321, `LOAD 75`. Ticked at **Tavg 591 °F** against a target of 570.
7. *"…about 18 steps, set LOAD to 90 MWe… near 575 °F. Smaller pulls from here: above 103 % power the plant stops the rods."* — **the stuck point, S-4.** Pulled to 336, typed `LOAD 90`. Tavg 596 °F; tick-box wanted below 585. Held `INSERT` 38 steps (336 → 298): power 91.8 → 75.1 %, Tavg 596 → 593 and stuck. Waited 6 plant-minutes: still 593. Screenshotted and found `LOAD` reading **53 MW**. Re-typed 90 → Tavg 585 in 45 s → ticked. **~7 minutes of wall time lost, and the recovery is not derivable from the step text.**
8. *"…about 9 steps, set LOAD to 100 MWe, then trim AVG COOLANT TEMPERATURE onto 578 °F."* — `LOAD 100`, pulled to 316. Power 100.4 %. Ticked.
9. *"Check full power…"* — `Acknowledge ✓`.
10. *"Over the next hours, lower the BORON setting in small steps toward 626 ppm as xenon builds."* — see S-9. No tick-box, no button. Typed `626`; nothing. Clicked `Show all details`; the `Acknowledge ✓` appeared, together with a genuinely useful paragraph explaining the `ROD LIMIT LO-LO` alarm and what xenon is. Acknowledged; leg complete.

### Leg 4 — Load rampdown (`pwr_lower_power`), 5 steps, COMPLETED — no stuck points

1. *"On the BORON card set 719 and press Enter."* — typed. Ticked.
2. *"Set LOAD to 75 MWe and let REACTOR POWER come down. Then hold INSERT at MED until AVG COOLANT TEMPERATURE is back in the green band, about 40 steps."* — `LOAD 75`, waited 20 s, held `INSERT` (298 → 279). Ticked. **The order — load first, then rods — is stated in the step and in the "Why?", and it works exactly as described.**
3. *"Set LOAD to 50 MWe… about 20 steps."* — same pattern, 279 → 261. Ticked.
4. *"Set LOAD to 30 MWe… about 10 steps."* — 261 → 251. Ticked.
5. *"Set LOAD to 15 MWe… about 6 steps. Stop here; the shutdown checklist takes over."* — 251 → 244, power 16.4 %. Ticked. Leg complete.

This leg took about **4 minutes end to end** and I never had to look anything up.

### Leg 5 — Shutdown (`pwr_shutdown`), 3 steps, COMPLETED — no stuck points

1. *"Set LOAD to 0 MWe and wait for OUTPUT to fall below 5 MWe."* — typed `0`. Ticked in ~25 s.
2. *"Press SCRAM on the ROD CONTROL card: once to arm it (PRESS TO ARM), then again to scram."* — the button literally says `SCRAM / PRESS TO ARM`, and after the scram it says `SCRAMMED / PRESS TO RESET`. Both rod banks went to `0 /627`. **Best-labelled control in the sim.**
3. *"Press AUTO on the STEAM DUMP card until its status reads PRESS."* — it already read `PRESS`; one click and the leg completed. **Mild confusion:** "press AUTO **until** its status reads X" implies repeated presses cycling through modes, which I never had to do and could not have predicted.

### Leg 6 — Cooldown (`pwr_cooldown`), 14 steps, COMPLETED with S-5

1. *"On the BORON card set 920 and press Enter… Do not start cooling until BORON STATUS reads BORATING."* — typed. `BORON STATUS` read `BORATING 201→`. Hint said `600×`: **refused** (fell to `60×`); `Ack All` then `600×` took. Ticked after ~50 s. **The "do not start cooling until…" sentence is exactly right** — it names the indicator that actually moves, which startup step 2 failed to do.
2. *"Lower SET PZR PRESSURE to 1900 psi."* — typed. Ticked once the real pressure fell under 1972.
3. *"Press TRIP BLOCKS… then BLOCK on the PZR PRESS LO-LO row and BLOCK on the SI REACTOR TRIP row. Then press STOP on the ECCS card."* — four named rows, unambiguous. Ticked. **The "Why?" here is the best paragraph in the set:** *"To the automatic protection, a cooldown looks exactly like a leak."*
4. *"Press AUTO on the STEAM DUMP card until its status reads PRESS. Then lower DUMP SETPOINT 50 psi at a time, from 1020 down to 120 psi, waiting each time until AVG COOLANT TEMPERATURE stops falling, about 5 plant-minutes."* — **18 separate typed values.** Ran at `60×` with ~6 s (≈6 plant-min) between each; took ~110 s wall. Reached ~340 °F, ticked. **Confusions:** `600×`/`3600×` were greyed `warp locked` for the whole ladder despite step 1 telling me to use `600×`; and the pace raised a `Cooldown Rate High (>100 °F/hr)` alarm (S-8).
5. *"Lower SET PZR PRESSURE to 1700 psi, as low as the box goes."* — typed. Ticked.
6. *"press OFF under HEATER first. Then press MANUAL under SPRAY and set its box to 50 %."* — **the stuck point, S-5.** Board showed everything the step asked; `○ Heaters OFF` stayed unticked through 1615 → 1299 psi. Pressing `OFF` again did nothing; `AUTO` then `OFF` ticked it. `s027_step6stuck.png`.
7. *"Close the accumulator valve now… while PRIMARY PRESSURE is between 1615 and 665 psi."* — clicked the same unlabelled valve symbol as heatup step 10; `ACCUMULATORS` went `ARMED` → `ISOLATED`. Ticked. **Confusion:** while step 6 was stuck, pressure was already inside step 7's window and falling — I had to act on a step that was not yet the active one to avoid missing the window.
8. *"Wait, with SPRAY still at 50 %, until PRIMARY PRESSURE falls below 413 psi, about 10 plant-minutes. If PRESSURIZER LEVEL climbs past 80 %, lower SPRAY."* — set `60×` and waited 60 s; **pressure blew straight through 413 to 158 psi**. `PRESSURIZER LEVEL` peaked at 45 %, so no harm, but the step's target is a number you cannot stop on at the speed the sim invites you to use. `Acknowledge ✓`.
9. *"press ALIGN on the RHR card, then set HX FLOW to 7 %."* — both on the `RHR` card, clearly named. Ticked.
10. *"Press OFF on the RCP FLOW card. Then… press OFF under SPRAY."* — both. Ticked after the pumps coasted down.
11. *"Raise HX FLOW to 25 % and wait until AVG COOLANT TEMPERATURE reads below 199 °F."* — typed `25`; `Ack All` + `600×` (took first time here); ~60 s wall to 19x °F. Ticked.
12. *"Check Cold Shutdown: AVG COOLANT TEMPERATURE below 199 °F, PRIMARY PRESSURE between 250 and 550 psi…"* — `Acknowledge ✓`. **Note:** pressure ended at **223 psi**, *below* the 250–550 range the step names, and the tick-box (`When Plant in Mode 5, Cold Shutdown`) passed anyway.
13. *"Check the ACCUMULATORS tile reads 100 % and ISOLATED."* — true. `Acknowledge ✓`.
14. *"Check ALIGN is lit on the RHR card and HX FLOW is above 0 %."* — true. `Acknowledge ✓`. **Round trip complete.**

---

## 4. Words and numbers I could not find on the board

Every one of these appears in a step or its `done when` line and has no matching text on the control board.

| Words in the checklist | What is actually on the board |
|---|---|
| `Tavg` (heatup 11, ascension steps) | tile is `AVG COOLANT TEMPERATURE`; `Tavg` exists only as a trend-chart row label at the very bottom |
| `Steam dump demand ≤ 1 %` (heatup 6) | `STEAM DUMP` card shows `AUTO / OPEN / CLOSE`, `STEAM PRESS`, `DUMP SETPOINT` — no demand figure |
| `RCP flow ≥ 90 %` / `RCP Run/Stop` (heatup 2) | card is `RCP FLOW` with `OFF` / `ON`; there is no control called "Run/Stop" |
| `Spray placed in AUTO` vs `Spray control in AUTO` (heatup 8) | one `SPRAY` column with `AUTO / MANUAL / OFF` |
| `RHR suction autoclosed` (heatup 12) | `RHR` card shows `ALIGN` / `ISOLATE`; "suction" appears nowhere |
| `Control bank withdrawn well past its starting 227` (ascension 8) | `CONTROL ROD POSITION n /627`; 227 is never displayed |
| `ROD LIMIT LO-LO` (ascension 10 "Why?") | the alarm banner calls it `Control Rods — Insertion Limit` |
| `the green band on its tile` (ascension 4–8, rampdown 2–5) | the `AVG COOLANT TEMPERATURE` tile has a thin multi-colour strip under it with a tick; I never worked out which part of it was "the green band", and read the numeric tick-box instead |
| `the valve symbol beside the ACCUMULATORS tile` (heatup 10, cooldown 7) | an unlabelled symbol near the `ECCS FLOW` text, not beside the `ACCUMULATORS` tile — findable only via the step's green highlight |
| `Plot point` (startup 4–9) | correct, but only exists once the `1/M PLOT` window is open; there is no such button on the board itself |
| `→ 43×` badge next to the speed buttons | never explained anywhere I could find |
| `warp locked` (greyed `600×`/`3600×`) | no reason given on screen |
| `Reactor following, near 50 %` (ascension 5) | there is `REACTOR POWER %` and `OUTPUT MWe`; "following" is not a state anything displays |
| `HOLDING` / `STANDBY` / `PRESS` card sub-headings | appear and change without any step mentioning them |

Numbers whose target and whose acceptance disagree are listed in S-7.

---

## 5. What the text got right

- Heatup 1 — every value quoted matches the board tile-for-tile, including units.
- Heatup 3 — `"press FAST on the speed row, then click WITHDRAW under SHUTDOWN"` names the column as well as the button; zero ambiguity on a card with two identical `WITHDRAW`s.
- Heatup 7 — `"Both orifices, not one: A alone cannot pass enough flow"` tells you why the obvious cheaper choice is wrong.
- Heatup 9 — `"Not 2235 psi yet: read the next step before this one settles"` stops you skipping ahead into a locked-out valve.
- Heatup 9's promise that the clock drops to 1× at 665 psi by itself — it did, exactly, and it is the only speed change in six legs that was explained in advance.
- Heatup 10/cooldown 7 — the `665`–`1615 psi` window is stated with both ends and the consequence of each.
- Heatup 11 and every other `⏩` line — telling me `Ack All` would clear a refused WARP was the single most useful sentence in the run.
- Heatup 12 — `"If LETDOWN reads 0, press A+B 7 % … before going on"` gives the recovery inside the step.
- Startup 4 — `"Before any rod moves"` is the right emphasis in the right place.
- Startup 10/11/12 as a trio — tap, watch, then a step that confirms the range switched over; the sequence teaches the instrument change rather than just surviving it.
- Startup 15 — `"Close the 1/M PLOT window with its ✕ (it covers the turbine card)"`: warns about an obstruction before you hit it.
- Startup 16 — `"Do this the moment REACTOR POWER is above 8 %: at 25 % this trip fires"` gives the deadline and the penalty.
- Startup 17 — `"then press TRIP BLOCKS again to close the panel; it covers the rod buttons"`, same virtue.
- Rampdown, all five steps — `LOAD` first then rods, stated every time, with the reason; the only leg I completed without one pause.
- Rampdown 3's aside — `"STEAM GENERATOR LEVEL dips before it recovers on each drop; that is normal"` pre-empts exactly the thing that would have made me stop.
- Shutdown 2 — `"once to arm it (PRESS TO ARM), then again to scram"` quotes the button's own words.
- Shutdown 3's "Why?" — `"the fuel still makes about 2 % of full power … and REACTOR POWER does not show it"` explains a reading that would otherwise look like a bug.
- Cooldown 1 — `"Do not start cooling until BORON STATUS reads BORATING"` names an indicator that actually moves.
- Cooldown 3's "Why?" — `"To the automatic protection, a cooldown looks exactly like a leak"`; one sentence, and blocking two trips stops feeling like cheating.
- Cooldown 4 — `"Typing 640 straight in drops the coolant 50 °F in one plant-minute and empties the pressurizer"` names the specific wrong thing a player would do.
- Cooldown 6 — `"The heaters go off first, or they boil water as fast as the spray condenses it"` explains an ordering that would otherwise look arbitrary.
- Cooldown 8 — `"Switch the spray off now and pressure bounces back over that number before you get there"` explains why you must not tidy up early.
- Cooldown 13 — `"empty tanks then are a missing safety system"` closes the loop with heatup 10 across four legs.
- The `Show all details` / "Why?" text generally: it is the reason a layman finishes this at all. It should not be collapsed by default.
