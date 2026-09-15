> **Record, not policy.** Second fresh-context layman playthrough of the six PWR2 live checklists in headless Edge, 2026-09-07, on the tree after the pass-1 fixes and #654: 4 of 6 legs completed (heatup, startup, rampdown, shutdown). Its stuck points were measured on the full stack the same day and fixed in `ui/manual_procedures.js` (#653): typing the dump setpoint straight to 640 psi drops the coolant 50 °F in a plant-minute and empties the pressurizer (50 psi every 5 minutes runs at 85 °F/h); spray at 100 % from a high level fills the pressurizer solid and bounces pressure back up through the accumulator window (through the gate's own harness, 50 % reaches 413 psi with the level at 66 % and a five-minute window); the ascension replay itself lands 14 °F above the program at 30 MWe and never trims, and the stages ticked on load alone. The shutdown leg now presses STEAM DUMP AUTO after the scram (the pass-1 seam, moved to the leg that causes it).

# Layman playthrough of the six interactive checklists — pass 2

Build: **Alpha 1.7.4-rc3 (TEST BUILD)**, `ui/shell.html?engine=pwr2&tab=checklists&init=cold_shutdown`,
headless Edge 1600×1000. Played 2026-09-07, ~90 minutes of wall time.
Player persona: knows what a pump and a valve are; learns everything else from the checklist panel
and the board. Screenshots are in `pass2/shots/`.

---

## 1. Outcome

| Leg | Result | Single biggest reason |
|---|---|---|
| **1. Heatup** (Mode 5 → Mode 3) | **COMPLETED**, 17/17 steps, ~8.7 plant-hours | — (one undocumented action needed: see S-2) |
| **2. Startup** (Mode 3 → Mode 1) | **COMPLETED**, 18/18 steps | — (three steps needed rod pulls well past the number printed in the step: see S-3) |
| **3. Power ascension** (→ 100 %) | **FAILED at step 8 of 9** | Following the printed step counts walked AVG COOLANT TEMPERATURE from 578 °F up to **600 °F** and the reactor **tripped on "Reactor Trip — Ot Delta T"**. The checklist never warned about that trip, never showed the number it watches, and **did not react to the scram at all** — it sat on step 8 waiting for "Generator at 100 MWe" from a dead reactor. |
| **4. Load rampdown** (→ 15 %) | **COMPLETED**, 5/5 steps | — (restarted from the "Hot Full Power (Mode 1)" preset because leg 3 had scrammed the plant) |
| **5. Normal shutdown** (→ Mode 3) | **COMPLETED**, 3/3 steps | — |
| **6. Controlled cooldown** (→ Mode 5) | **FAILED at step 8 of 14** | Between step 6 and step 7 the pressurizer went **water-solid (PRESSURIZER LEVEL 100 %)**; from then on **SPRAY cannot be put back in MANUAL** (pressing MANUAL lights OFF instead), pressure stalled at ~600 psi against a step-8 target of 413 psi, and separately the sim **locked time acceleration to 1×** the moment I obeyed step 7 and isolated the accumulators. |

Legs completed: **4 of 6**. The chain "Next: …" button was used for legs 1→2; after the leg-3
trip I had to go back to `← All checklists` and re-seed the plant from the **Plant & Mission**
picker ("Hot Full Power (Mode 1)") to test legs 4–6 at all.

---

## 2. Stuck points, ranked by severity

### S-1 (fatal, leg 3) — the plant trips on a protection the checklist and the board never name
> Step 7: *"Hold WITHDRAW at MED for about 18 steps, set LOAD to 90 MWe, then trim. Smaller pulls
> from here: above 103 % power the plant stops the rods."*
> Step 8: *"Hold WITHDRAW at MED for about 9 steps, set LOAD to 100 MWe, then trim AVG COOLANT
> TEMPERATURE onto 578 °F."*

What I did: exactly that — 327 steps → LOAD 75, 345 steps → LOAD 90, 354 steps → LOAD 100.
Measured on the way: Tavg **581 °F at 50 MWe**, **592 °F at 75 MWe**, **597 °F at 90 MWe**,
**600 °F** just before the trip; SUBCOOLING MARGIN fell 44 → 29 °F. Reactor tripped at
T+10:42:42, alarm **"Reactor Trip — Ot Delta T"** (`shots/30_scram.png`).

The step's own warnings are about **power** ("above 103 % the plant stops the rods", "at 118 % it
trips") — power never got above 93 %. The thing that actually tripped me was **temperature**, and
the only related number anywhere on the board is a small line reading **"OPΔT 109.7 %"** in the
NUC INSTR card — a *different* acronym from the trip's name, with no legend, no band, and no
mention in any step.

**What would have unstuck me:** step 6/7/8 saying "if AVG COOLANT TEMPERATURE goes above ~585 °F,
INSERT before you add more LOAD — the plant trips on temperature, not just on power", and the trip
using the same word as the board (`OPΔT` vs `Ot Delta T`).

### S-2 (fatal-adjacent, leg 6) — obeying step 7 locks the clock, and the on-screen fix is to undo step 7
> Step 7: *"Close the accumulator valve now: click the valve symbol beside the ACCUMULATORS tile
> while PRIMARY PRESSURE is between 1615 and 665 psi."*

I closed it. Every speed button above 1× immediately greyed out (`shots/48_speedheld.png`), and the
Scanner line read:
> *"⛔ Held — Time acceleration is held at real time: accumulator window open — arm the accumulators
> before accelerating again."*

Steps 11 and 4 of the same checklist say *"This takes a while in plant time — use time acceleration"*.
The only way I found to get the clock back was to **click the valve again and re-arm the
accumulators** — i.e. undo the step I had just been told to do — which restored 60× and immediately
raised the alarm **"Accumulators Still Lined Up — RCS Below Their Isolation Pressure"**
(`shots/53_final.png`). **What would have unstuck me:** the hold message naming the checklist step,
or the hold not applying while the tanks are isolated.

### S-3 (fatal, leg 6) — the pressurizer goes solid and SPRAY can no longer be selected
> Step 6: *"press OFF under HEATER first. Then press MANUAL under SPRAY and set its box to 100 %.
> Watch SUBCOOLING MARGIN stay well above zero."*

It worked at first: pressure fell 1500 → 578 psi in about three plant-minutes at 10×. But
PRESSURIZER LEVEL climbed 48 → 100 % and stayed there ("Pressurizer Level High" alarm), the SPRAY
selector **switched itself from MANUAL to OFF**, and the 100 I had typed in its box had become
**50** (`shots/45_pzr3.png`). Pressing **MANUAL** three separate times never lit MANUAL — twice it
did nothing, once it lit **OFF** (`shots/50_pzr5.png`). AUTO *does* take, but with SET PZR PRESSURE
at 1900 psi and actual pressure ~600 psi, AUTO sprays nothing.

Step 8 then wants *"PRIMARY PRESSURE falls below 413 psi … about eight plant-minutes"*. I ran
**2 h 45 m of plant time** at 60× and pressure stalled at **599–601 psi**. Leg dead.

**What would have unstuck me:** the step warning that spray raises pressurizer level and saying what
to do when level reaches 100 % (open LETDOWN? stop spraying?), and the SPRAY MANUAL button either
working or saying why it is refused.

### S-4 (high, leg 2) — five steps give a rod-step number that does not satisfy their own tick
> Step 5: *"press MED, then hold WITHDRAW to about 90 steps."* Done-when: *"Counts settled above 700 cps."*

At **90 steps** SOURCE RANGE settled at **5.5–6.4e2** and stayed there; STARTUP RATE had settled to
+0.01 so the written cue was satisfied but the step would not tick (`shots/21_step5_stuck.png`).
I had to pull to **110** steps. Same pattern every stage:

| step says | needs | actually needed |
|---|---|---|
| 5 — "about 90 steps" → 700 cps | 700 cps | **110** steps |
| 6 — "about 150" → 1,400 cps | 1,400 cps | **173** steps |
| 7 — "about 180" → 3,000 cps | 3,000 cps | **204** steps |
| 8 — "about 195" → 7,000 cps | 7,000 cps | I was **already at 204** when the step appeared; it took **221** |
| 9 — "about 205" → 20,000 cps | 20,000 cps | ticked at **221**, counts rising on their own |

**What would have unstuck me:** dropping the step counts and saying "withdraw at MED until SOURCE
RANGE settles above 700 cps" — the number the tick actually uses.

### S-5 (high, leg 2) — a done-when that reads as already true
> Step 10: *"Press SLOW, then tap WITHDRAW one step at a time and watch after each."*
> Done-when: **"When Reactor power ≥ 0 %"**

REACTOR POWER read **0.0 %**. The condition looked satisfied and the step would not tick. I tapped
three more single steps and waited **four minutes of wall time** before it ticked — the instant the
tile flipped to **0.1 %** (`shots/23_step10_stuck.png`). "≥ 0 %" is true of every plant state there
is; what it means is "greater than zero as displayed".

The same step also says *"Critical: SOURCE RANGE keeps climbing"* — by then SOURCE RANGE had
**stopped** climbing and dropped to **1.0e0 cps** because the detector secures itself (which step 12
then tells you to check). Two consecutive steps contradict each other about the same meter.

### S-6 (high, all legs) — WARP is refused and the reason is never on a checklist step
Steps 9, 11 and 14 of the heatup say *"set the speed control to 600× (WARP …) — if it is refused,
60× works"*. It was refused, twice. The only explanation appeared as a small transient line,
**"WARP unavailable — new alarm"**, next to the clock. **Pressing "Ack All" in the ALARMS panel
was what made WARP work** (600× → an actual 1,200×, `shots/14_after_ackall.png`) — an action no
step in any of the six checklists mentions, on a panel no step refers to. Without it the 11-hour
heatup runs at 60× (11 minutes of wall time instead of 30 seconds).

### S-7 (medium, leg 6) — "lower DUMP SETPOINT in stages" cools 73 °F in about a plant-minute
> Step 4: *"lower DUMP SETPOINT in stages: 640, then 400, 240 and 120 psi, waiting each time until
> AVG COOLANT TEMPERATURE stops falling … keep it under 100 °F per hour."*

Typing **640** (the number the step gives) took Tavg **567 → 494 °F** almost immediately, and
PRESSURIZER LEVEL to **0 %** on the way. That is roughly 4,000 °F/hour against the step's own
100 °F/hour limit, using the step's own number. The 120 psi stage did **337 → 335** in seconds.
Nothing objected; the step ticked.

### S-8 (medium, leg 6) — step 13 can no longer be satisfied after step 7
> Step 13: *"Check the ACCUMULATORS tile reads 100 % and ISOLATED."*

By the time step 7 became the active step, PRIMARY PRESSURE had already fallen through the
665 psi floor of the window (step 6's spray took it 1500 → 578 psi while step 6 was still active),
the tanks had part-discharged, and the tile read **87 % / ARMED** (`shots/43_accum.png`). It never
went back to 100 %. Step 7 becomes available only *after* the pressure that step 7 requires has
been passed.

### S-9 (medium, legs 2/3/6) — steps tick themselves off without the player doing them
- **Leg 2 step 13** ("Press MED, then hold INSERT until REACTOR POWER stops rising") ticked while
  I was acknowledging step 12. I never touched INSERT.
- **Leg 6 step 5** ("Lower SET PZR PRESSURE to 1700 psi, as low as the box goes") ticked with the
  box still reading **1900 psi** (`shots/41_pzrcard.png`).
- **Leg 3 steps 4–7** each say *"then nudge the rods until AVG COOLANT TEMPERATURE is back inside
  the green band"*; all four ticked with Tavg 581–597 °F, i.e. above the 578 °F the same steps call
  the 100 %-power value.

A layman reads a green tick as "you did that correctly". Here it sometimes means "the plant drifted
past a number".

### S-10 (medium, leg 3) — an on-screen panel covers the control the next step needs, and nothing says to close it
Leg 2 step 15 politely says *"Close the 1/M PLOT window with its ✕ (it covers the turbine card)"*.
The **TRIP BLOCKS** panel opened by leg 2 steps 16/17 covers **the WITHDRAW/INSERT buttons on the
ROD CONTROL card** (`shots/26_rodblocked.png`) and **no step tells you to close it** — leg 3 step 4
just says "Hold WITHDRAW at MED for about 30 steps". I had to work out that pressing TRIP BLOCKS
again closes it.

### S-11 (low, leg 5) — the check number and the board disagree by 5×
> Step 3: *"Check the plant is in Hot Standby: REACTOR POWER near 2 % and steady…"*

REACTOR POWER read **0.2 %** (`shots/35_scram_power.png`). The hidden done-when is
*"When Decay heat ≥ 1 %"* — and there is no "decay heat" anywhere on the board.

### S-12 (low, leg 1) — the first thing you are asked to verify is already contradicted
> Step 1: *"Check the plant is cold and shut down: AVG COOLANT TEMPERATURE 122 °F, PRIMARY PRESSURE
> 363 psi, **RCP FLOW off**, both rod positions 0 of 627."*

The RCP FLOW tile reads **3 %**, not "off" (`shots/04_board.png`). Everything else matched exactly.

### S-13 (low, leg 1) — "under SHUTDOWN: press FAST" — FAST is not under SHUTDOWN
> Step 3: *"On the ROD CONTROL card, under SHUTDOWN: press FAST, then click WITHDRAW once."*

The card has two columns (CONTROL | SHUTDOWN) each with WITHDRAW/INSERT, and **one shared
SLOW/MED/FAST row underneath both, left-aligned under CONTROL** (`shots/07_rodcontrol.png`). I
guessed it was shared. It is.

---

## 3. Per-step log

Speeds: `1×/5×/10×/60×` are ordinary; `600×/3600×` are "WARP". "ticked" = the step's circle went ✓.

### Leg 1 — Heatup (Mode 5 Cold Shutdown → Mode 3 Hot Standby). COMPLETED.

| # | first sentence | what I did | time | Acknowledge? | confusion |
|---|---|---|---|---|---|
| 1 | "Nothing to press. Check the plant is cold and shut down…" | read the six tiles; 122 °F / 363 psi / 0 of 627 all matched | instant | yes | **RCP FLOW read "3 %", not "off"** (S-12) |
| 2 | "Start the reactor coolant pumps: press ON on the RCP FLOW card." | found ON beside OFF under the RCP FLOW label on the diagram (highlighted green); clicked | ~25 s of plant time to reach 103 % | no — auto-ticked | none; the green highlight found it for me |
| 3 | "On the ROD CONTROL card, under SHUTDOWN: press FAST, then click WITHDRAW once." | clicked FAST in the shared speed row, then SHUTDOWN/WITHDRAW; the step told me to use 60× | ~11 plant-min at 60× = 16 s wall | no | FAST is not under SHUTDOWN (S-13) |
| 4 | "Check the TURBINE-GENERATOR card: TRIP lit, OUTPUT 0 MWe." | nothing; already true | instant | no — auto-ticked | none |
| 5 | "Press AUTO on the SG FEED card." | clicked AUTO on SG FEED (right column) | instant | no | none |
| 6 | "Nothing to press. Check the STEAM DUMP card: CLOSE lit and the status reading MANUAL." | read it; both true | instant | yes | none |
| 7 | "Press A+B 7 % on the LETDOWN card." | clicked A+B 7 % | instant | no | **"orifices"** is not a word I know; the card just says A 3 % / B 4 % / A+B 7 % |
| 8 | "press AUTO under HEATER, then AUTO under SPRAY." | clicked both | instant | no | the done-when lists three lines, two of which read the same: "Spray placed in AUTO" / "Spray control in AUTO" |
| 9 | "Raise SET PZR PRESSURE to 1700 psi…" | clicked the SET PZR PRESSURE box, typed 1700, Enter. Pressed **600×** → refused; used **60×** | 35 plant-min = ~32 s wall | no | **"WARP unavailable — new alarm"** (S-6). The clock did drop to 1× by itself at 665 psi exactly as promised |
| 10 | "Open the accumulator valve now: click the valve symbol beside the ACCUMULATORS tile…" | the valve is a small symbol on the pipework **above** the tile, not beside it; it was outlined green, which is the only reason I found it | instant | no | "beside" is wrong; without the green outline I would have hunted. A new alarm ("Shutdown Cooling Not In Service — RCS Is Below the RHR Entry Pressure") had appeared and nothing prepared me for it |
| 11 | "Wait until AVG COOLANT TEMPERATURE reaches 542 °F…" | pressed 3600× → refused; **pressed "Ack All" on the ALARMS panel** (not in any step) → 3600× took, running 1,200× | 11 plant-h = ~4 s wall | yes | S-6 |
| 12 | "Check ISOLATE is lit on the RHR card and LETDOWN reads above 0 gpm." | read them | instant | yes | the done-when says "RHR suction autoclosed" — "suction" is not a word on the board |
| 13 | "Press AUTO on the STEAM DUMP card." | clicked AUTO | instant | no | done-when says *status reading PRESS*; the card said MANUAL, then TAVG, then PRESS. Three mode words, none explained |
| 14 | "Raise SET PZR PRESSURE to 2235 psi…" | typed 2235, Enter; 600× (took this time) | 20 plant-min = 32 s wall | no | none |
| 15 | "Check Hot Standby: … STEAM PRESS near 1020 psi, CONTROL ROD POSITION still 0." | read | instant | yes | the two done-when lines shown were about **ATMOS DUMP** and STEAM PRESS — neither is in the sentence I was told to check |
| 16 | "Check the reactor stayed shut down: SOURCE RANGE counts steady, STARTUP RATE near 0.00." | read | instant | yes | done-when is *"When Net reactivity ≤ -300 pcm"* — **"pcm"** and "net reactivity" appear nowhere on the board and mean nothing to me |
| 17 | "Check REACTOR POWER reads 0.0 %." | read | instant | yes | none |

Leg finished at plant clock **T+08:42:11**. Closing text: *"Plant at Mode 3, Hot Standby…"*

### Leg 2 — Startup (Mode 3 → Mode 1 At Power). COMPLETED.

| # | first sentence | what I did | time | Ack? | confusion |
|---|---|---|---|---|---|
| 1 | "Check the plant is hot and shut down…" | read | instant | yes | none |
| 2 | "Wash boron out of the water: on the BORON card set 719 and press Enter." | typed 719 in the BORON box; ON was already lit; used 600× | ~50 plant-min = 8 s wall | no | **the board's only boron number, "BORON CHEM 918 ppm", did not move** while the step ticked. The done-when says "BORON reads 719 ppm" and the number I could see said 918. Also **no ⏩ time hint on this step**, so I did not know whether to wait 1 minute or 1 hour |
| 3 | "Check SG FEED reads AUTO." | read | instant | yes | none |
| 4 | "press 1/M PLOT on the ROD CONTROL card, then press Plot point." | clicked 1/M PLOT (a window opens over the turbine card), then "Plot point" | instant | no | **"1/M"** means nothing to me. The Scanner line says "inverse-count-rate plot — the standard approach-to-criticality tool", which also means nothing |
| 5 | "…press MED, then hold WITHDRAW to about 90 steps. Wait for STARTUP RATE to stop falling…" | held WITHDRAW ~90 s of wall to 90 steps; waited 70 s; plotted; **had to pull on to 110** | ~3 min wall | no | S-4. Also STARTUP RATE was **rising** (+0.10 → 0.02), never "falling" |
| 6 | "Hold WITHDRAW at MED for about 60 more steps, to about 150." | to 150, waited, plotted, **pulled on to 173** | ~2 min | no | S-4. SOURCE RANGE printed **"10.0e2"** at one point instead of 1.0e3 |
| 7 | "…about 30 more steps, to about 180." | to 180, waited, plotted, **pulled on to 204** | ~1.5 min | no | S-4 |
| 8 | "…about 15 more steps, to about 195." | I was already at 204 when this step appeared; plotted, **pulled on to 221** | ~1 min | no | S-4 — the step asks for a position behind me |
| 9 | "…about 10 more steps, to about 205." | rods stationary; counts climbing on their own; plotted at 2.1e4 | ~1 min | no | "Settle, press Plot point" — nothing was settling; counts went 1.6e4 → 4.1e4 with the rods still |
| 10 | "Press SLOW, then tap WITHDRAW one step at a time…" | pressed SLOW, tapped 3 times, waited | **~4 min wall stuck** | no | **S-5** — "When Reactor power ≥ 0 %" with the tile reading 0.0 %; and SOURCE RANGE had dropped to **1.0e0 cps**, contradicting "SOURCE RANGE keeps climbing" |
| 11 | "Tap WITHDRAW two more single steps at SLOW." | tapped twice at 1× | ~1 min | no | none |
| 12 | "Check SOURCE RANGE has switched itself off and INTER RANGE is reading." | read | instant | yes | SOURCE RANGE does not say "off" — it says **1.0e0 cps**, which looks like a broken meter, not a secured one |
| 13 | "Press MED, then hold INSERT until REACTOR POWER stops rising…" | **nothing — it ticked itself while I acknowledged step 12** | — | no | S-9 |
| 14 | "Press SLOW, then hold WITHDRAW until REACTOR POWER passes 5 %…" | held ~37 s wall to 5.1 % | 37 s | no | none |
| 15 | "Close the 1/M PLOT window with its ✕ … press LATCH … set LOAD to 10 MWe." | clicked ✕, LATCH, typed 10 in the LOAD box | 4 plant-min at 10× | no | none — the clearest step in the run |
| 16 | "Press TRIP BLOCKS …, then BLOCK on the IR HIGH FLUX row." | opened the panel, clicked BLOCK on row 2 | instant | no | four rows of jargon (PZR PRESS LO-LO, IR HIGH FLUX, PR HIGH (LOW SETPT), SI REACTOR TRIP); the step named the right one, so it worked |
| 17 | "…press BLOCK on the PR HIGH (LOW SETPT) row." | clicked BLOCK on row 3 | instant | no | none |
| 18 | "Check Mode 1: REACTOR POWER near 10 %, OUTPUT near 10 MWe…" | read | instant | yes | none |

### Leg 3 — Power ascension. FAILED at step 8.

| # | first sentence | what I did | reading afterwards | confusion |
|---|---|---|---|---|
| 1 | "Check: REACTOR POWER above 10 %, OUTPUT above 5 MWe…" | read | 11 % / 10 MWe | Ack pressed |
| 2 | "On the BORON card set 660 and press Enter." | typed 660 | ticked at once | none |
| 3 | "Press SAMPLE on the BORON card." | clicked SAMPLE | ticked | BORON CHEM then read "SAMPLING…" for a while — fine, the step warned me |
| 4 | "Hold WITHDRAW at MED for about 30 steps, then set LOAD to 30 MWe…" | **first had to close the TRIP BLOCKS panel** (S-10); MED; 230 → 260; LOAD 30 | Tavg 567, 29 MWe | ticked without the promised "nudge the rods" trim |
| 5 | "…about 32 steps, set LOAD to 50 MWe…" | 260 → 292; LOAD 50 | **Tavg 581**, 50 MWe | ticked although 581 °F is already above the 578 °F the step calls the 100 % value |
| 6 | "…about 35 steps, set LOAD to 75 MWe…" | 292 → 327; LOAD 75 | **Tavg 592**, SUBCOOLING 35 °F | ticked. Nothing on screen said this was wrong |
| 7 | "…about 18 steps, set LOAD to 90 MWe, then trim." | 327 → 345; LOAD 90 | **Tavg 597**, SUBCOOLING 29 °F, power 88 % | ticked |
| 8 | "…about 9 steps, set LOAD to 100 MWe, then trim AVG COOLANT TEMPERATURE onto 578 °F." | 345 → 354; LOAD 100 | **SCRAM at T+10:42:42, "Reactor Trip — Ot Delta T"**; rods 0/0, power 1.4 %, pressure 1736 psi | **S-1.** The checklist did not notice. It still showed step 8 active, with "Generator at 100 MWe" waiting and — absurdly — "AVG COOLANT TEMPERATURE near 578 °F ✓", because the trip had cooled the plant into the band |
| 9–10 | never reached | | | |

Recovery I attempted, none of it in any checklist: waited for pressure to rebuild, pressed the
**SCRAMMED / PRESS TO RESET** button, re-withdrew the shutdown bank at FAST, took the control bank
back up (**hit +2.67 DPM startup rate at 5×, far over the "keep it under 1.0" the startup leg
taught, and had to insert 22 steps to recover**), re-latched the turbine, LOAD 10. Got back to
16 % / 10 MWe. Then the browser session died and I restarted from the **Hot Full Power (Mode 1)**
preset in "SELECT PLANT, MISSION & RESET" to test the remaining legs.

### Leg 4 — Load rampdown to ~15 %. COMPLETED.

Started from the Hot Full Power preset: 98.8 %, 100 MWe, Tavg 578, rods 627/627.

| # | first sentence | what I did | result |
|---|---|---|---|
| 1 | "On the BORON card set 719 and press Enter…" | typed 719; BORON STATUS read **"BORATING 208→"** | ticked instantly. **I have no idea what "208→" means** |
| 2 | "Set LOAD to 75 MWe … then hold INSERT at MED … about 40 steps." | typed 75; watched | ticked in ~30 s **without any INSERT**; Tavg went **up** to 585 |
| 3 | "Set LOAD to 50 MWe … about 20 steps." | typed 50, waited, then inserted 20 steps (627 → 607) | ticked; Tavg 583 |
| 4 | "Set LOAD to 30 MWe … about 10 steps." | typed 30, inserted 10 (607 → 597) | ticked after ~6 plant-min; power lagged badly — **50 % reactor power at 30 MWe output** for several minutes |
| 5 | "Set LOAD to 15 MWe … about 6 steps. Stop here." | typed 15, inserted 6 (597 → 591), ran 60× until boration finished | ticked; **took ~10 plant-minutes with nothing on screen changing** — the done-when reads "Reactor below 30 % and falling as the boration finishes", which is the only leg where a step waits on the invisible boron number |

Closing text: *"Plant stable near 15 % and 15 MWe…"*

### Leg 5 — Normal shutdown. COMPLETED. Three steps, no trouble.

| # | first sentence | what I did | result |
|---|---|---|---|
| 1 | "Set LOAD to 0 MWe and wait for OUTPUT to fall below 5 MWe." | typed 0; 10× | ticked in ~5 plant-min |
| 2 | "Press SCRAM on the ROD CONTROL card: once to arm it (PRESS TO ARM), then again to scram." | clicked twice | rods 0/0 immediately; ticked. **Best-written step in the whole run** — it told me the button changes its label, and it did |
| 3 | "Check the plant is in Hot Standby: REACTOR POWER near 2 % and steady…" | read | **board said 0.2 %** (S-11); Ack pressed |

### Leg 6 — Controlled cooldown. FAILED at step 8.

| # | first sentence | what I did | result / confusion |
|---|---|---|---|
| 1 | "On the BORON card set 920 … Do not start cooling until BORON STATUS reads BORATING." | typed 920; BORON STATUS read "BORATING 208→"; 600× took (WARP worked here) | ticked after ~1 plant-hour |
| 2 | "Lower SET PZR PRESSURE to 1900 psi." | typed 1900; 60× | ticked after ~2 plant-min |
| 3 | "Press TRIP BLOCKS …, then BLOCK on the PZR PRESS LO-LO row and BLOCK on the SI REACTOR TRIP row. Then press STOP on the ECCS card." | did all three | ticked. **Longest single instruction in the set and the clearest** — it named the panel, the rows and the card |
| 4 | "Press AUTO on the STEAM DUMP card until its status reads PRESS. Then lower DUMP SETPOINT in stages: 640, then 400, 240 and 120 psi…" | AUTO once flipped TAVG → PRESS; typed 640 / 400 / 240 / 120 | ticked at Tavg 335 °F. **S-7: the 640 stage dropped Tavg 73 °F in about a plant-minute and drove PRESSURIZER LEVEL to 0 %**, against the step's own "under 100 °F per hour" |
| 5 | "Lower SET PZR PRESSURE to 1700 psi, as low as the box goes." | **nothing — it was already ticked when I looked**, box still reading 1900 | S-9 |
| 6 | "press OFF under HEATER first. Then press MANUAL under SPRAY and set its box to 100 %." | did both; pressure fell 1500 → 578 psi at 10× in ~3 plant-min | **S-3**: PRESSURIZER LEVEL went to 100 %, SPRAY reverted to OFF on its own, its box changed from 100 to 50 |
| 7 | "Close the accumulator valve now … while PRIMARY PRESSURE is between 1615 and 665 psi." | clicked the (green-outlined) valve symbol | ticked, but pressure was **already 578 psi** and the tanks read **87 % / ARMED** — the window had closed during step 6 (S-8). **Immediately after this, all speed buttons above 1× greyed out (S-2)** |
| 8 | "Wait, with the spray still on, until PRIMARY PRESSURE falls below 413 psi … about eight plant-minutes." | spray could not be turned back on (3 attempts); re-armed the accumulators to get the clock back; ran 60× for **2 h 45 m of plant time** | **pressure stalled at 599–601 psi. STUCK. Leg abandoned.** |
| 9–14 | never reached | | |

---

## 4. Words and numbers I could not find on the board

Named in a step or a done-when, absent from (or contradicted by) the screen:

1. **"Ot Delta T"** (the trip that ended leg 3). The board shows **"OPΔT 114.6 %"** — different
   letters, no legend, and no step mentions either.
2. **"pcm"** and **"Net reactivity"** (leg 1 step 16 done-when). Nowhere on the board.
3. **"Decay heat"** (leg 5 step 3 done-when, "≥ 1 %"). Nowhere on the board; REACTOR POWER read 0.2 %.
4. **"BORON reads 719 ppm"** (leg 2 step 2). The board's boron readouts are the setpoint box and
   **BORON CHEM**, which stayed at 918 ppm throughout the step.
5. **"BORATING 208→" / "DILUTING 27→"** — the arrow-and-number in BORON STATUS is never explained.
6. **"the green band on its tile"** (leg 3 steps 4–7, leg 4 steps 2–5). The AVG COOLANT TEMPERATURE
   tile has a thin multicolour strip and a white tick; at 581 °F I could not tell whether I was in
   the band or not (`shots/27_tavgband.png`).
7. **"RCP FLOW off"** (leg 1 step 1). Tile read **3 %**.
8. **"orifice" / "orifices"** (leg 1 step 7). The LETDOWN card says A 3 % / B 4 % / A+B 7 %.
9. **"RHR suction"** (leg 1 step 12 done-when, leg 6 steps 8/9). The RHR card says ALIGN / ISOLATE /
   HX FLOW. "Suction valve" is only in the Why text.
10. **"SOURCE RANGE has switched itself off"** (leg 2 step 12). The meter reads **1.0e0 cps**, not
    "OFF" or "SECURED".
11. **"status reading MANUAL" / "status reads PRESS" / TAVG** — the STEAM DUMP card has three mode
    words, only one of which any step defines.
12. **"1/M"** — the panel title, the button and the Scanner text all use it; nothing says what it is
    in plain words.
13. **"P-11 permissive" / "P-10 permissive"** on the TRIP BLOCKS rows — no step explains them.
14. **"the accumulator window"** as a *pressure* window vs. the *valve*. The hold message says
    "accumulator window open — arm the accumulators", which reads as the opposite of the tile's
    "ISOLATED".
15. **"REACTOR POWER near 2 %"** (leg 5 step 3) — board said 0.2 %.
16. **"about 90 / 150 / 180 / 195 / 205 steps"** (leg 2 steps 5–9) — none of them was the position
    that ticked the step.
17. **"Reactor power ≥ 0 %"** (leg 2 step 10) — a number that is true before you start.
18. **"Overshoot is real on this plant: 100 MWe of LOAD lands REACTOR POWER near 101 %"** (leg 3
    step 7 Why) — my plant tripped at 93 % power and never got near 101 %.

---

## 5. What the text got right

- Leg 1 step 1 — three of four numbers (122 °F, 363 psi, 0 of 627) matched the tiles exactly.
- Leg 1 step 2 — "press ON on the RCP FLOW card": card name, button name and location all correct.
- Leg 1 step 3 — "The bank runs out to 627 of 627 on its own" prepared me for the 11-minute wait.
- Leg 1 step 7 — "Both orifices, not one: A alone cannot pass enough flow" pre-empted the obvious wrong choice.
- Leg 1 step 9 — "Not 2235 psi yet: read the next step before this one settles" is exactly the right warning in the right place.
- Leg 1 step 9 — "At 665 psi the clock drops to 1× by itself" — it did, precisely.
- Leg 1 step 10 — "Above 1615 psi the valve locks" gave me a reason to hurry that I could act on.
- Leg 1 step 13 — "The dump now holds STEAM PRESS at the 1020 psi in the DUMP SETPOINT box" names the box and the number.
- Leg 2 step 12's Why — "There is no button for it; you are checking that it happened" removed the urge to hunt for a control.
- Leg 2 step 15 — "Close the 1/M PLOT window with its ✕ (it covers the turbine card)" is the model every panel-covering step should follow.
- Leg 2 steps 16/17 — naming the exact row label ("IR HIGH FLUX", "PR HIGH (LOW SETPT)") made a jargon panel usable.
- Leg 2 step 16's Why — "The plant refuses the press below 8 %" told me in advance why a button might not work.
- Leg 3 step 2's Why — "real plants dilute boron for the bulk and use rods for the fine trim" is the clearest sentence in the set.
- Leg 4 step 2's Why — "less steam drawn means the heat has nowhere to go, the water warms, and warmer water walks power down by itself" made the whole rampdown make sense before I touched anything.
- Leg 4 step 3's Why — "STEAM GENERATOR LEVEL dips before it recovers on each drop; that is normal" stopped me reacting to a dip that did happen.
- Leg 5 step 2 — "once to arm it (PRESS TO ARM), then again to scram" describes a two-state button perfectly.
- Leg 5 step 1's Why — "Taking the load off the turbine first means the scram happens with no electricity on the generator."
- Leg 6 step 3 — three actions, each naming its panel/row/card; all three worked first time.
- Leg 6 step 4 — "The status word matters: in TAVG mode the setpoint does nothing" is the one place a mode word is explained, and it was needed.
- Leg 6 step 6's Why — "The heaters go off first, or they boil water as fast as the spray condenses it" justified the order.
- Leg 6 step 8's Why — "Switch the spray off now and pressure bounces back over that number before you get there" is a genuinely useful trap warning (even though the leg died for a different reason).
- The ⏩ time hints ("About 11 plant-minutes at 1× — set the speed control to 60×") were accurate every time WARP was not involved, and the auto-drop back to 1× at 665 psi was a pleasant surprise.
- Green outlining of the control a step is about (RCP ON, SG FEED, the accumulator valve, the SPRAY/HEATER card) is what made the diagram-symbol steps findable at all.
