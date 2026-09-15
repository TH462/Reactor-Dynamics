> **Record, not policy.** A fresh agent with no repo access played the six PWR2 live checklists in headless Edge on 2026-09-07, reading only the checklist panel and the board, in the role of a layman. Text and grading defects it found were fixed the same day (`ui/manual_procedures.js`, #653); its stuck point S1 led to a control-kernel defect (`control_kernel.js` `_toggleChannel`: re-engaging an engaged concentration channel mid-dose never stopped the makeup panel) and to a second, still open (the batch dose lands ~70 ppm short of its target on a cold dilution and re-anchors to the analyzer). Its S2 (steam dump left in TAVG mode after the shutdown leg) was measured true on the full stack and is fixed in the cooldown step.
>
> **Corrections after measurement:** the boron channel does stop by itself when the target is set once; what the playtester saw was the effect of pressing ON on a channel that was already on, which the checklist told it to do. The cooldown step 7 window and step 8 spray refusal were observed on a plant that had already tripped twice and are not yet reproduced from a clean chain.

# Layman playthrough of the six PWR checklists

**Build:** `Alpha 1.7.4-rc3`, `ui/shell.html?engine=pwr2`, headless Edge 1600×1000.
**Date of run:** 2026-09-07. **Wall time:** ~2 h 25 m.
**Player model:** knows what a pump and a valve are. Everything below was learned from the
checklist panel text and the board's visible labels and numbers. No source file was read.

Screenshots referenced by name live in
`…/ae94308b-1744-4631-883d-266605f79f9f/scratchpad/shots/`.

---

## 1. Outcome

| # | Leg | Result | Single biggest reason |
|---|---|---|---|
| 1 | **Heatup** — Mode 5 → Mode 3 | **COMPLETED**, 17/17 | — (clean; only irritant was WARP being refused with no advice) |
| 2 | **Startup** — Mode 3 → Mode 1 | **FAILED at step 16** — reactor tripped on *Ir High Flux* | **Step 2 turns boron dilution ON and no step in the leg ever turns it OFF.** It ran for the rest of the leg, added reactivity continuously, overshot the authored rod route, and pushed power to 24.9 % against a 25 % startup trip while I was opening the panel that was supposed to block that trip. |
| 3 | **Power ascension** — to 100 % | **FAILED at step 9** — reactor tripped on *Ot Delta T* | **Both Mode 1 starting conditions ship with CONTROL ROD POSITION at 627/627**, so steps 4–8 ("Hold WITHDRAW at MED for about N steps") have nowhere to go, and step 8's hidden condition *"Control bank not pinned on its top stop"* can only be cleared by INSERTing — the opposite of what the step says. Inserting enough to clear step 8 dropped power below step 9's 96 % gate; withdrawing back up tripped the plant. |
| 4 | **Load rampdown** — to ~15 % | **COMPLETED**, 5/5 | — (the best-written leg in the set) |
| 5 | **Normal shutdown** — Mode 1 → Mode 3 | **COMPLETED**, 3/3 | — |
| 6 | **Cooldown** — Mode 3 → Mode 5 | **FAILED at step 8** | **Step 4 silently requires the steam dump to be in PRESS mode and it was in TAVG mode.** Nothing on the checklist or the board says the STEAM DUMP `AUTO` button *toggles* between two modes. Downstream, the pressurizer went solid ("Pressurizer Level High") and the SPRAY `MANUAL` button then refused every press, so step 8's "PRIMARY PRESSURE below 413 psi" became unreachable — pressure climbed away from it, 423 → 1165 psi. |

Legs 3–6 were run from the `Hot Full Power (Mode 1)` / `50 % Power (Mode 1)` free-play
starting conditions offered by the picker, because leg 2 could not deliver a running plant.

**Three of six legs completed. Two of the three failures ended in a reactor trip that the
checklist panel never acknowledged** — after both trips the panel sat on the same step with
the same "done when" line as if nothing had happened.

---

## 2. Stuck points, ranked by severity

### S1 — Startup step 2 starts a boron dilution that nothing ever stops
> *"2. Wash boron out of the water to 719 ppm: on the BORON card set 719 and press ON."*

Nothing in the remaining sixteen steps says to press OFF. `BORON STATUS` read **DILUTING**
continuously from step 2 through the reactor trip at step 16 — roughly twenty plant-hours.
By the time I stopped it by hand after the trip, boron had run from 918 to **614 ppm**, 105 ppm
below the number the step asked for. Every downstream symptom (S2, S3, S4) descends from this.
*Tried:* followed the leg exactly; watched `BORON STATUS` stay `DILUTING` at every step.
**Would have unstuck me:** a sentence — *"When BORON CHEM reads 719 ppm, press OFF"* — or the
same background note leg 3 gets ("*It runs in the background for the whole climb*").
`23_boron_still_diluting.png`

### S2 — Cooldown step 4: the steam dump is in a mode the step doesn't mention
> *"4. Lower DUMP SETPOINT in stages: 640, then 400, 240 and 120 psi… Done when it reads below 347 °F."*

I set all four stages. `DUMP SETPOINT` accepted 120 psi, `STEAM PRESS` stayed at 1060 psi and
`AVG COOLANT TEMPERATURE` moved **553 → 552 °F over ~100 plant-minutes**. The STEAM DUMP card's
status word read **TAVG**. Pressing `AUTO` a second time flipped it to **PRESS**, and Tavg fell
**553 → 335 °F almost at once**.
*Tried:* four setpoint stages, then 60× for 100 s, then pressed `AUTO` again (attempt 1), then
`OPEN` (attempt 2).
**Would have unstuck me:** *"Check the STEAM DUMP status word reads PRESS. If it reads TAVG,
press AUTO to change it."* Nothing anywhere says that button has two modes.
`51_steamdump.png`, `52_dump_attempts.png`

### S3 — Ascension steps 4–8 tell you to withdraw rods that are already fully out
> *"4. Hold WITHDRAW at MED for about 30 steps…"* … *"8. Hold WITHDRAW at MED for about 9 steps…"*

Both Mode 1 starting conditions the picker offers begin with `CONTROL ROD POSITION` **627/627**.
A 15-second WITHDRAW hold moved it **0 steps**. Steps 4–7 ticked anyway (their real conditions
were the LOAD targets). Step 8 then showed an unmet condition the step text never mentions:
> *"○ Control bank not pinned on its top stop"*

*Tried:* held WITHDRAW; nothing. Then guessed and held INSERT — cleared at **595/627** after
~50 s of blind inserting. No number is given, so I could not tell how far was far enough.
**Would have unstuck me:** the step saying *"if CONTROL ROD POSITION reads 627, hold INSERT
until it reads below 600."*

### S4 — Ascension step 8 and step 9 pull in opposite directions
> *"8. …○ Control bank not pinned on its top stop"* vs *"9. …○ When Reactor power ≥ 96 %"*

Inserting enough to clear step 8 took power from 98.2 % to **87.8 %**; it then settled at
**91.9 %** and stopped rising (xenon). Withdrawing to recover the 96 % tripped the plant on
**"Reactor Trip — Ot Delta T"**. There is no move that satisfies both.
**Would have unstuck me:** step 9 checking the same power band step 8 leaves you in, or step 8
telling you to lower BORON rather than insert rods.
`42_trip2.png`

### S5 — Startup step 3 cannot be satisfied by doing what it says
> *"3. Check SG FEED reads AUTO. If it does not, press AUTO."*

SG FEED already read `AUTO` (leg 1 had put it there). I waited 30 s, then a further 30 s of
polling: no tick, no `Acknowledge` button, and the step showed no "done when" line at all.
Pressing `AUTO` again — on a control that was already lit, which the step explicitly tells you
*not* to do — cleared it instantly. The step wants a button press, not a state.
**Would have unstuck me:** *"Press AUTO on the SG FEED card"*, full stop. `20_step3.png`

### S6 — The 1/M Startup Plot window sits on top of the TURBINE-GENERATOR card
Step 4 opens it. Nothing ever says to close it. At **step 15** — *"Press LATCH on the
TURBINE-GENERATOR card"* — my clicks landed on the plot window instead. The board underneath
was unchanged (`TRIP` still lit, `OUTPUT 0 MW`, `TURBINE 0 rpm`) and the typed `LOAD` value
reverted to `0`, so it read like the controls were refusing me. Closing the plot with its `✕`
made LATCH work first press.
**Would have unstuck me:** *"Close the 1/M plot"* in step 12 or 15, or the plot not covering
live controls. `27_turbine.png`, `28_1m_covers_turbine.png`

### S7 — Startup step 5's stop condition can never be met
> *"5. …Wait for STARTUP RATE to fall back to 0.00, then press Plot point."*

`STARTUP RATE` decayed +0.22 → +0.05 → and then stalled at **+0.04 DPM** for two minutes and
would not go lower, because the dilution from S1 was still adding reactivity. A player told to
wait for 0.00 waits forever. The step's actual tick condition was only *"point 2 plotted"*, so
plotting anyway worked — but you have to disobey the text to find that out.
**Would have unstuck me:** *"wait until STARTUP RATE stops falling"*, or naming a band.

### S8 — The 1/M plot predicts criticality 55 steps before the route reaches it
At step 6's target of 150 steps the panel read **"predicted criticality ≈ step 130 (20.7 %
withdrawn)"** — I was already 20 steps past it. Steps 7, 8, 9 still asked for 180, 195 and 205.
Step 6 says *"read the position the 1/M panel predicts"* and then never says what to do with the
number. The plant handled it gracefully — steps 7–9 self-marked
> *"overtaken — too late to plot: SOURCE RANGE switched itself off above 1.0e5 counts a second"*

— but as a player I was told to keep pulling toward a number the instrument had already
disproved. `24_1m_after3.png`, `25_after_criticality.png`

### S9 — Startup step 10's speed hint causes a power excursion
> *"⏩ About 7 plant-minutes at 1× — set the speed control to 60×."*

I did. Between two glances **2.5 seconds apart**, `REACTOR POWER` went from **0.0 % to 3.4 %**,
and by the time I could set 1× again it read **12.2 %**. Steps 10 and 11 both self-ticked with
no action from me. Step 13 then expects *"REACTOR POWER settles near 1 %"*. Nothing warns that
60× during a startup is fast enough to lose the reactor between glances.
**Would have unstuck me:** no speed hint on the steps around criticality, or *"drop back to 1×
the moment INTER RANGE starts moving."* `26_power_excursion.png`

### S10 — Startup step 13 tells you to release at a point that leaves the step unmet
> *"13. Press MED, then hold INSERT until STARTUP RATE reaches 0.00 and release, about 14 steps.
> REACTOR POWER settles near 1 %."* · done-when: *"○ When Reactor power ≤ 5 %"*

`STARTUP RATE` was **+0.06** when the step began, so "hold until 0.00" was satisfied after
**one step**. I released, as instructed; power was **13.4 %** and the step did not tick. I then
had to hold INSERT for **another ~85 seconds / 50 steps** to get to 4.1 %. The written stop
condition and the real one are different things.

### S11 — Cooldown step 7's pressure window has already been missed when the step arrives
> *"7. Close the accumulator valve now: click the valve symbol beside the ACCUMULATORS tile
> while PRIMARY PRESSURE is between 1615 and 665 psi."*

When step 7 became active, `PRIMARY PRESSURE` read **603 psi** — already below the window. The
click worked anyway, but the `ACCUMULATORS` tile then read **75 %**, and step 13 checks it reads
**100 %**. Step 4's cooldown had run pressure straight past the window while I was busy with it.
**Would have unstuck me:** step 4 warning to close the accumulator on the way past, or the
window being on step 5.

### S12 — Cooldown step 8: the spray switches itself off and then refuses to come back
> *"8. Wait, with the spray still on, until PRIMARY PRESSURE falls below 413 psi. Do not switch
> the spray off yet."*

I did not touch it. Some minutes later both pressurizer columns read `OFF`, pressure was rising
(748 → 940 → **1165 psi**, away from the 413 psi target), and the alarm list carried
**"Pressurizer Level High"**. Clicking `MANUAL` under SPRAY did nothing — the button is not
disabled, it simply does not latch, with no message. The leg is unrecoverable from here.
**Would have unstuck me:** a step telling me to watch `PRESSURIZER LEVEL` during the
depressurisation (step 6 only says watch `SUBCOOLING MARGIN`), and the board saying *why* the
spray refuses. `54_step8_stuck.png`, `56_spray_refuses.png`

### S13 — WARP is refused with a message that gives no next move
Every step whose hint said *"set the speed control to 600× / 3600×"* was met with a toast:
**"WARP unavailable — new alarm"** (and once **"Dropped to real time — new alarm"**), after
which the clock silently sat at **60×** or **1×** instead. It happened on heatup step 9,
heatup step 11, heatup step 14, startup step 2, and cooldown steps 1 and 4. The hint's own
parenthesis — *"(WARP; the plant must be quiet to take it)"* — does not tell you that a
*standing, already-acknowledged* alarm counts, nor what to do. On cooldown step 4 the refusal
was the reason a 2.7-plant-hour wait produced 1 °F of cooling and read like a broken step.
**Would have unstuck me:** the toast naming the alarm and saying *"acknowledge it and try
again"*, or the hint offering the fallback speed. `12_warp_refused.png`

### S14 — The boron number on the board never shows what you set or what you have
Startup step 2 asks for 719 ppm. I typed `719` in the BORON box and pressed `ON`; the box
snapped back to **918** and `BORON CHEM` stayed at **918** for the whole dilution. The only way
to see the real number was `SAMPLE`, which no step in leg 2 mentions and which takes ~30 plant-
minutes to return (it read `SAMPLING…` for over 50 s of wall time at 1×). Leg 3's step 3 *does*
explain the lab delay — leg 2 needed the same sentence. In leg 3 the box read **774** seconds
after I typed **660**: the box is a live reading of what you have, not a display of what you
asked for, and there is nowhere on the board that shows the target you set.
`16_boron.png`, `17_boron_after.png`, `18_boron_sample.png`

### S15 — Neither trip was acknowledged by the checklist
After the *Ir High Flux* trip (leg 2) and the *Ot Delta T* trip (leg 3), the panel stayed on the
same step, with the same "done when", offering no note that the plant had scrammed. Recovery —
that the SCRAM button now reads **"SCRAMMED / PRESS TO RESET"** and must be pressed before rods
will move — I found only by hunting the board after WITHDRAW did nothing for 90 seconds.
`32_after_trip_board.png`

### S16 — Small text/instrument mismatches (each survivable alone)
- Heatup 6: text says *"Check the STEAM DUMP card: CLOSE lit and the status reading MANUAL"*;
  the done-when says *"When Steam dump demand ≤ 1 %"*. Different subjects.
- Heatup 15: text asks you to check four numbers; the two conditions shown are *"Atmospheric
  dump valve shut"* and *"Steam pressure on the no-load anchor"* — neither is one of them.
- Heatup 9: *"Raise SET PZR PRESSURE to 1700 psi, **the lowest the box will take**"* while the
  box is sitting at **363**.
- Ascension 8: condition *"✓ AVG COOLANT TEMPERATURE near 578 °F"* was ticked while the tile
  read **596 °F**.
- Startup 10: condition reads *"○ When Reactor power ≥ 0 %"* — always true as written, yet
  unmet, while the tile read `0.0 %`.
- Startup 10 text: *"Critical: SOURCE RANGE keeps climbing"* — by the time the step is active
  SOURCE RANGE reads `1.0e0` because it has switched itself off, which is what step 12 then
  asks you to confirm.
- Rampdown completion says *"Plant stable near 15 %"*; the tile read **26 %**.
- Steps name a row (*"press IR HIGH FLUX"*, *"then PZR PRESS LO-LO, then SI REACTOR TRIP"*)
  but the button on that row is labelled **BLOCK**.

---

## 3. The per-step log

Timings are wall time. "auto" = the step ticked itself with no Acknowledge; "ack" = an
`Acknowledge ✓` button appeared and I pressed it.

### Leg 1 — Heatup (Mode 5 → Mode 3). **17/17 completed.**

| Step | First sentence | What I did | Tick | Notes |
|---|---|---|---|---|
| 1 | *"Nothing to press. Check the plant is cold and shut down…"* | read the tiles: 122 °F, 363 psi, rods 0/627 | already ✓, **ack** | every number named was on a tile |
| 2 | *"Start the reactor coolant pumps: press ON on the RCP FLOW card."* | found `RCP FLOW` on the diagram, clicked `ON` | ~6 s, auto | RCP FLOW went to 94 %. Hover text says *"Use **RCP Run/Stop**"* — no control on the board carries that name |
| 3 | *"…under SHUTDOWN: press FAST, then click WITHDRAW once."* | `FAST`, then one tap on the right-hand `WITHDRAW`; 60× | ~40 s at 60×, auto | `SLOW/MED/FAST` is one shared row spanning both columns, not "under SHUTDOWN". The named button glowed, which made it findable |
| 4 | *"Check the TURBINE-GENERATOR card: TRIP lit…"* | read it | already ✓, auto | |
| 5 | *"Press AUTO on the SG FEED card."* | clicked `AUTO` at the SG FEED row | ~4 s, auto | three other `AUTO` buttons on the board; card name disambiguates |
| 6 | *"Nothing to press. Check the STEAM DUMP card: CLOSE lit and the status reading MANUAL."* | read it | **ack** | condition shown was about dump *demand* instead |
| 7 | *"Press A+B 7 % on the LETDOWN card."* | clicked `A+B 7%` | ~4 s, auto | exact label on the button |
| 8 | *"…press AUTO under HEATER, then AUTO under SPRAY."* | clicked both `AUTO`s | ~3 s, auto | three sub-conditions listed, two of them (*"Spray placed in AUTO"*, *"Spray control in AUTO"*) read as the same thing |
| 9 | *"Raise SET PZR PRESSURE to 1700 psi, the lowest the box will take."* | typed `1700`, Enter; 600× | ~2 min at 600× | 600× accepted here. **The clock dropped to 1× by itself at 669 psi exactly as the step promised** — the single best-behaved moment in the run |
| 10 | *"Open the accumulator valve now: click the valve symbol beside the ACCUMULATORS tile…"* | the valve was glowing above-right of the tile; clicked it | ~3 s, auto | "beside" is wrong — it is above. The glow rescued it. `10_accum.png` |
| 11 | *"Wait until AVG COOLANT TEMPERATURE reaches 542 °F."* | 3600× refused ("WARP unavailable — new alarm"), ran at 60× | ~7 min wall, **ack** | overshot to 552 °F |
| 12 | *"Nothing to press. Check ISOLATE is lit on the RHR card and LETDOWN reads above 0 gpm."* | read it | **ack** | condition worded *"RHR suction autoclosed"* — different vocabulary, same idea |
| 13 | *"Press AUTO on the STEAM DUMP card."* | clicked `AUTO` | instant, auto | |
| 14 | *"Raise SET PZR PRESSURE to 2235 psi."* | typed `2235`; 600× refused → ran 60× | ~40 s | clock again dropped to 1× by itself at 2185 psi |
| 15 | *"Nothing to press. Check Hot Standby…"* | read it | **ack** | conditions named two different things |
| 16 | *"…Check the reactor stayed shut down…"* | read it | **ack** | condition *"Net reactivity ≤ −300 pcm"* — "pcm" is not explained anywhere I could see |
| 17 | *"…Check REACTOR POWER reads 0.0 %."* | read it | **ack** | **"Checklist complete"** |

Closing card: *"Plant at Mode 3, Hot Standby… Boron is still at the cold concentration near
918 ppm; the startup checklist begins by diluting it."* — accurate and useful.

### Leg 2 — Startup (Mode 3 → Mode 1). **Failed at step 16, reactor trip.**

| Step | First sentence | What I did | Tick | Notes |
|---|---|---|---|---|
| 1 | *"Nothing to press. Check the plant is hot and shut down…"* | read it | **ack** | |
| 2 | *"Wash boron out of the water to 719 ppm: on the BORON card set 719 and press ON."* | typed `719`, clicked `ON`; box reverted to `918`; 600× refused → 60× | ~95 s | **S1, S14.** No speed hint on this step at all, though it is a ~70-plant-minute wait. `BORON STATUS` read `DILUTING` from here to the end of the leg |
| 3 | *"Check SG FEED reads AUTO. If it does not, press AUTO."* | read it — it already read AUTO. Waited 60 s. Nothing | **stuck**, then cleared by pressing `AUTO` anyway | **S5** |
| 4 | *"Before any rod moves: press 1/M PLOT…, then press Plot point."* | `1/M PLOT`, then `Plot point` | instant, auto | `Plot point` is inside the new window and clearly labelled. **S6 begins here** |
| 5 | *"…press MED, then hold WITHDRAW to about 90 steps. Wait for STARTUP RATE to fall back to 0.00…"* | `MED`; held ~61 s to 90/627; waited 80 s for SR — stalled at +0.04 | plotted anyway | **S7.** ~0.7 steps/s at MED at 1×; the step does not say how long a hold is |
| 6 | *"Hold WITHDRAW at MED for about 60 more steps, to about 150."* | held 86 s to 150; SR **+1.28**; plotted | auto | **S8** — panel read *"predicted criticality ≈ step 130"*, i.e. 20 steps behind me. Step 8 later says keep SR under 1.0; it was already past |
| 7–9 | *"Hold WITHDRAW… to about 180 / 195 / 205."* | never reached | **self-marked "overtaken"** | *"overtaken — too late to plot: SOURCE RANGE switched itself off above 1.0e5 counts a second."* Handled gracefully, but four authored steps evaporated |
| 10 | *"Press SLOW, then tap WITHDRAW one step at a time and watch after each."* | `SLOW`, one tap; SR rose 1.59 → 1.84 with rods still; then took the hint and set 60× | auto, ~3 s later | **S9.** Power 0.0 → 3.4 → **12.2 %**. Text says *"SOURCE RANGE keeps climbing"* — it read `1.0e0`, de-energised |
| 11 | *"Tap WITHDRAW two more single steps at SLOW."* | nothing — it ticked itself | auto | I never tapped |
| 12 | *"…Check SOURCE RANGE has switched itself off and INTER RANGE is reading."* | read it | **ack** | |
| 13 | *"Press MED, then hold INSERT until STARTUP RATE reaches 0.00 and release, about 14 steps."* | `MED`, held; SR hit 0.00 in **under 1 s** (1 step); released as told → power 13.4 %, no tick. Second attempt: held ~85 s more, to 4.1 % | ~2 min total | **S10.** Went from 151 to 85 steps — six times the "about 14" |
| 14 | *"Press SLOW, then hold WITHDRAW until REACTOR POWER passes 5 %, about 13 steps."* | `SLOW`, held 60 s at 1× (4.3 %), then held at 10× to 6.4 % | ~2 min | a pure round trip caused by step 13 |
| 15 | *"Press LATCH on the TURBINE-GENERATOR card, then set LOAD to 10 MWe."* | pressed `LATCH` — nothing. Waited 75 s. Retyped `LOAD` — reverted to `0`. Found the 1/M window covering the card, closed it, `LATCH` worked first press, `LOAD` 10 stuck | ~4 min | **S6** |
| 16 | *"Press TRIP BLOCKS…, then IR HIGH FLUX. Do this once REACTOR POWER is above 8 %."* | opened `TRIP BLOCKS` — power read **24.8 %** — clicked `BLOCK` on the `IR HIGH FLUX` row | **REACTOR TRIP** | `IR HIGH FLUX` is a `STARTUP TRIP · 25%`. Power crossed 25 % while the panel was opening. Alarm: **"Reactor Trip — Ir High Flux"**, both banks to 0/627. `31_blocks_set.png` |
| 17–18 | not reached | | | The panel stayed on step 16 with no mention of the trip (**S15**) |

Also seen at step 16, and never mentioned by any step: two alarms —
**"Control Rods — Insertion Limit"** and **"Control Rods — Approaching Insertion Limit"** — while
the bank sat at 98/627 and power at 24.9 %.

*Retry attempt:* pressed `SCRAMMED / PRESS TO RESET`, withdrew the shutdown bank, borated back
toward 719, `End checklist` → restarted `pwr_startup` fresh, and ran to step 5 with the dilution
turned off by hand. (Note: clicking *"← All checklists"* and then the same leg **resumes** the
old run at step 16; only `End checklist` gives you a fresh one.) The retry was cut short by a
harness failure, so the leg's ending is recorded from the first attempt.

### Leg 3 — Power ascension to 100 %. **Failed at step 9, reactor trip.**
Started from free play `50 % Power (Mode 1)`: 48.4 %, 569 °F, rods **627/627**.

| Step | First sentence | What I did | Tick | Notes |
|---|---|---|---|---|
| 1 | *"Nothing to press. Check: REACTOR POWER above 10 %…"* | — | already ✓, auto | |
| 2 | *"On the BORON card set 660 ppm and press ON. **It runs in the background for the whole climb.**"* | typed `660`, `ON` | instant, auto | this is exactly the sentence leg 2 step 2 is missing |
| 3 | *"Press SAMPLE on the BORON card. The lab result appears… in about 30 plant-minutes."* | pressed `SAMPLE` | instant, auto | again, the sentence leg 2 needed |
| 4 | *"Hold WITHDRAW at MED for about 30 steps, then set LOAD to 30 MWe…"* | held WITHDRAW 15 s — **0 steps moved** (627/627). Set `LOAD` 30 | ~3 s after LOAD, auto | **S3** |
| 5 | *"…about 32 steps, set LOAD to 50 MWe…"* | 8 s WITHDRAW (0 steps), `LOAD` 50 | ~5 s, auto | power 67.5 % |
| 6 | *"…about 35 steps, set LOAD to 75 MWe…"* | same, `LOAD` 75 | ~5 s, auto | power 78.9 % |
| 7 | *"…about 18 steps, set LOAD to 90 MWe…"* | same, `LOAD` 90 | ~3 s, auto | power 87.6 % |
| 8 | *"…about 9 steps, set LOAD to 100 MWe, then trim AVG COOLANT TEMPERATURE onto 578 °F."* | `LOAD` 100; four of five conditions ticked; **"○ Control bank not pinned on its top stop"** stayed open. Held INSERT in ~10 s bursts: 627 → 621 → 615 → 608 → 601 → **595**, cleared | ~3 min | **S3, S4.** Text says WITHDRAW; only INSERT clears it. *"✓ AVG COOLANT TEMPERATURE near 578 °F"* ticked while the tile read **596 °F** |
| 9 | *"Nothing to press. Check full power: REACTOR POWER near 100 %…"* — *"○ When Reactor power ≥ 96 %"* | power sat at **91.9 %** and stopped rising after 90 s at 60×. Held WITHDRAW to recover | **REACTOR TRIP** | **"Reactor Trip — Ot Delta T"**, plus *Cooldown Rate High*, *Pressurizer Pressure Low*, *Steam Generator Pressure High*. `42_trip2.png` |
| 10 | *"Over the next hours, lower the BORON setting… toward 626 ppm as xenon builds."* | not reached | | |

### Leg 4 — Load rampdown to ~15 %. **5/5 completed.** No confusion at any step.
Started from `Hot Full Power (Mode 1)`: 97.6 %, rods again **627/627**.

| Step | First sentence | What I did | Tick |
|---|---|---|---|
| 1 | *"On the BORON card set 719 ppm and press ON. It runs in the background while you take the plant down."* | typed `719`, `ON` | ~3 s, auto |
| 2 | *"Set LOAD to 75 MWe and let REACTOR POWER come down. Then hold INSERT at MED until AVG COOLANT TEMPERATURE is back in the green band on its tile, about 40 steps."* | `LOAD` 75, 12 s at 60×, held INSERT ~56 s | auto — power 72.5 %, rods 589 |
| 3 | *"Set LOAD to 50 MWe… about 20 steps."* | `LOAD` 50, INSERT ~28 s | auto — 57.6 %, rods 570 |
| 4 | *"Set LOAD to 30 MWe… about 10 steps."* | `LOAD` 30, INSERT ~14 s | auto — 37.9 %, rods 561 |
| 5 | *"Set LOAD to 15 MWe… about 6 steps. Stop here; the shutdown checklist takes over."* | `LOAD` 15, INSERT ~8 s (32.3 %, needed <30), then 10 s more | auto at 26 % — **"Checklist complete"** |

The *"green band on its tile"* is a real, visible thing: the AVG COOLANT TEMPERATURE tile carries
a red-green-yellow-red bar with a white marker (`41_tavg_tile.png`). The steps never say the bar
is at the bottom of the tile, but it is findable.

### Leg 5 — Normal shutdown (Mode 1 → Mode 3). **3/3 completed.** Effortless.

| Step | First sentence | What I did | Tick |
|---|---|---|---|
| 1 | *"Set LOAD to 0 MWe and wait for OUTPUT to fall below 5 MWe."* | typed `0`, 60× | ~3 s, auto |
| 2 | *"Press SCRAM on the ROD CONTROL card: once to arm it (PRESS TO ARM), then again to scram."* | pressed twice; button text went `SCRAM / PRESS TO ARM` → `SCRAM` → `SCRAMMED / PRESS TO RESET` | instant, auto — **the button's own label matched the step word for word** |
| 3 | *"Nothing to press. Check the plant is in Hot Standby: REACTOR POWER near 2 % and steady…"* | read it | **ack** — **"Checklist complete"** |

### Leg 6 — Controlled cooldown (Mode 3 → Mode 5). **Failed at step 8.**

| Step | First sentence | What I did | Tick | Notes |
|---|---|---|---|---|
| 1 | *"On the BORON card set 920 ppm and press ON. Do not start cooling until it is running."* | typed `920`, `ON`; 600× accepted then dropped ("Dropped to real time — new alarm") | ~10 s | the hint here is the best-written in the set: it gives the rate (*3 ppm a minute*) and says the next steps run in parallel |
| 2 | *"Lower SET PZR PRESSURE to 1900 psi. Below 1972 psi the plant lets you switch off the protection in the next step."* | typed `1900`, 60× | ~5 s, auto | states *why*, which helped |
| 3 | *"Press TRIP BLOCKS…, then PZR PRESS LO-LO, then SI REACTOR TRIP. Then press STOP on the ECCS card."* | opened the panel, `BLOCK` on rows 1 and 4, closed it, `STOP` on ECCS | ~6 s, auto | the buttons say `BLOCK`; the step names the row (**S16**) |
| 4 | *"Lower DUMP SETPOINT in stages: 640, then 400, 240 and 120 psi… Done when it reads below 347 °F."* | set all four stages; Tavg 553 → 552 °F over ~100 plant-minutes; 600× refused throughout. Pressed `AUTO` again → mode flipped **TAVG → PRESS** → Tavg fell to **335 °F** | ~7 min of confusion | **S2, S13** |
| 5 | *"Lower SET PZR PRESSURE to 1700 psi, as low as the box goes."* | — | ticked itself | |
| 6 | *"…press OFF under HEATER first. Then press MANUAL under SPRAY and set its box to 100 %."* | `OFF` under HEATER, `MANUAL` under SPRAY, typed `100` | ~3 s, auto | column headers `SPRAY` / `HEATER` are directly above their button stacks — easy |
| 7 | *"Close the accumulator valve now: click the valve symbol… while PRIMARY PRESSURE is between 1615 and 665 psi."* | pressure was already **603 psi**; clicked the glowing valve | ~3 s, auto | **S11** — tile then read **75 %**, not the 100 % step 13 checks for |
| 8 | *"Wait, with the spray still on, until PRIMARY PRESSURE falls below 413 psi. Do not switch the spray off yet."* | waited at 60×; pressure went the **wrong way**: 423 → 748 → 940 → **1165 psi**. Both PZR columns had gone to `OFF` on their own; `MANUAL` under SPRAY would not latch on repeated presses | **STUCK — leg abandoned** | **S12.** Alarms: *"Pressurizer Level High"*, *"Shutdown Cooling Not In Service — RCS Is Below the RHR Entry Pressure"* |
| 9–14 | not reached | | | |

---

## 4. Words and numbers I could not find on the board

Terms a step used that are not printed anywhere on the screen, or whose meaning I could not work
out from the screen:

- **"RCP Run/Stop"** — the hover text for heatup step 2's control. The card is labelled
  `RCP FLOW` with buttons `OFF` / `ON`. No "Run/Stop" anywhere.
- **"Feed Pumps"**, **"Control Bank"**, **"Shutdown Bank"**, **"Pressure SP"**, **"Dump SP"**,
  **"Turbine Load"**, **"Boron control"**, **"Accumulator valve"**, **"Trip Blocks"**,
  **"1/M Plot"** — the "Use …:" line names controls by internal names; the board uses card
  titles (`SG FEED`, `ROD CONTROL`, `SET PZR PRESSURE`, `DUMP SETPOINT`, `TURBINE-GENERATOR`,
  `BORON`). Usually guessable, never identical.
- **"IR HIGH FLUX"** / **"PR HIGH (LOW SETPT)"** / **"PZR PRESS LO-LO"** / **"SI REACTOR TRIP"** —
  these *are* on the trip-block panel, but the button you press on each row says **BLOCK**, and
  the codes themselves are never expanded (Intermediate Range? Power Range? SI?).
- **"P-10 PERMISSIVE"**, **"P-11 PERMISSIVE"** — printed on the trip-block rows, defined nowhere.
- **"DPM"** — the unit on `STARTUP RATE`, which several steps set limits in (*"Keep STARTUP RATE
  under 1.0"*). Never expanded. The scanner bar said *"decades per minute"* once when I happened
  to hover the tile — that is the only place it appears.
- **"pcm"** — heatup step 16's condition, *"When Net reactivity ≤ −300 pcm"*.
- **"Ot Delta T"** — the alarm text that ended leg 3. Not on any tile, not explained.
- **"1/M"**, **"C₀/C"** — the plot's title and y-axis. The plot is opened by a step in leg 2 and
  its purpose is never stated in the checklist.
- **"orifices"** — heatup step 7, *"Both orifices, not one"*. The board says `A 3%`, `B 4%`,
  `A+B 7%`; nothing says those are orifices.
- **"the green band on its tile"** (ascension 4–8, rampdown 2–5) — the band exists, but it is an
  unlabelled colour bar at the bottom edge of the tile; nothing points to it.
- **A boron target readout.** You type a number into the BORON box; the box then shows the
  *current* concentration instead. Nowhere on the board shows what you asked for.
- **A pressurizer-level limit.** Cooldown step 6 says watch `SUBCOOLING MARGIN`; what actually
  ended the leg was `PRESSURIZER LEVEL` reaching a high alarm, a tile no cooldown step mentions.
- **The number behind "not pinned on its top stop"** (ascension 8). Cleared somewhere between
  601 and 595 of 627. Never stated.
- **What "the plant must be quiet" means** for WARP. Six refusals, all reading
  *"WARP unavailable — new alarm"*, with three or four standing acknowledged alarms on the board
  at the time and no way to tell which one was blocking.
- **How to reset a reactor trip.** Only discoverable by noticing the SCRAM button's text has
  changed to `SCRAMMED / PRESS TO RESET`. No step, message or alarm says it.

---

## 5. What the text got right

- Heatup 1 — every value it names (`122 °F`, `363 psi`, `0 of 627`) is on a tile in those words.
- Heatup 2 — *"press ON on the RCP FLOW card"*: card name plus button label, nothing else needed.
- Heatup 3 — the named button glowed on the board while the step was active; found in one look.
- Heatup 5, 7, 13 — *"Press AUTO on the SG FEED card"*, *"Press A+B 7 % on the LETDOWN card"*,
  *"Press AUTO on the STEAM DUMP card"*: exact button text, exact card name, one action each.
- Heatup 8 — *"press AUTO under HEATER, then AUTO under SPRAY"*: the column headers are directly
  above the buttons, so "under" is literally true.
- Heatup 9 — *"read the next step before this one settles"* is the right warning in the right
  place, and **the clock dropped to 1× by itself at 669 psi exactly as promised**.
- Heatup 10 — *"Above 1615 psi the valve locks"* gave me the reason, not just the order.
- Heatup 11 — *"Do not move rods or change BORON"* is unambiguous and easy to obey.
- Heatup 12 — carries its own recovery: *"If LETDOWN reads 0, press A+B 7 % … before going on."*
- Heatup closing card — told me boron was still at 918 ppm and that the next leg would deal with
  it. Correct, and it set up the next leg.
- Startup 4 — *"Before any rod moves"* put the baseline in the right order without argument.
- Startup 16 — *"the plant refuses it below"* warned me the control could reject the press.
- Ascension 2 — *"It runs in the background for the whole climb"*: the one sentence leg 2 needed.
- Ascension 3 — *"The lab result appears in the BORON CHEM readout in about 30 plant-minutes"*:
  names the readout, and names the delay.
- Ascension 7 — *"Smaller pulls from here: above 103 % power the plant stops the rods."*
- Rampdown 1–5 — the whole leg. Each step is one LOAD number, then one hold, with a step count
  and a stop condition you can see on a tile. Nothing to decode.
- Rampdown 5 — *"Stop here; the shutdown checklist takes over"* ends the leg cleanly.
- Shutdown 2 — *"once to arm it (PRESS TO ARM), then again to scram"*: quotes the button's own
  changing label. The best-written step in the set.
- Shutdown 1 and 3 — one action, one check, both readable straight off the tiles.
- Cooldown 1 — the hint gives the rate (*3 ppm a minute*), the duration, and says the following
  steps run while it works.
- Cooldown 2 — *"Below 1972 psi the plant lets you switch off the protection in the next step"*:
  says why, so the order makes sense.
- Cooldown 6 — *"press OFF under HEATER **first**"* flags that order matters.
- Cooldown 8 — *"Do not switch the spray off yet: the next step needs pressure held down"*:
  correct instruction, correct reason. (The plant then switched it off anyway — see S12.)
- Throughout — the ⏩ hints that name a plant-duration (*"About 11 plant-hours at 1×"*) are the
  right idea and set expectations well; only their WARP recommendations misfire.
- Throughout — the "overtaken" mechanism (leg 2 steps 7–9) is a genuinely good failure mode:
  the checklist noticed the plant had moved past four of its own steps and said so in plain
  words rather than deadlocking.
