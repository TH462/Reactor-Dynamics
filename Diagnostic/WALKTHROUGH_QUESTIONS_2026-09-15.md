# Walkthrough questions — measured answers (#755 items 13, 15, 16)

**2026-09-15 · develop · PWR2 · MEASUREMENT ONLY, no source changed.**

Harness: hand-rolled full stack (`RD.SimulationService` → `selectPlant('pwr2', …)`), load order
copied from `test/run_pwr2_*.js` / `test/run_checklist_pwr2.js`, physics step 0.02 s, driven by
`svc.tick()` — never `svc.start()`. `test/measure_stack.js` refuses PWR2. Scripts live in this
session's scratchpad (not committed): `boot.js`, `item13b.js`, `opt.js`, `item15.js`, `heatup.js`,
`item16.js`.

---

## Item 13 — "The pressurizer spray logic needs to be adjusted so it doesn't rapidly cycle."

### The one-line answer

**It is a real defect, and it is a missing filter on the error the spray reads — not a gain, and
not correct-but-busy.** The spray ladder reads the RAW indicated pressure error; instrument noise
is about ±2 psi on a channel whose real motion is under half that, so the demand slams between 0 %
and ~18 % as often as **93 open/close cycles a minute**. Re-running the same recorded pressure
trace through the error the proportional heaters already use gives **0 cycles**.

### 1. What the cycling measures (full stack, 1×, sampled at the player's own 0.1 s broadcast)

Two parked regimes, each settled first, then 300 s recorded:

| Regime | Setpoint | TRUE pressure span | INDICATED span | Mean error | Spray demand | Open/close cycles per minute | Duty | Printed "PZR SPRAY %" digit changes |
|---|---|---|---|---|---|---|---|---|
| Hot full power, setpoint parked low | 2195 psia (15.14 MPa) | 1.48 psi | **3.93 psi** | +19.3 psi | 0.00–13.7 % | **12.8** | 2.6 % | 118 in 300 s (0.39/s) |
| Hot zero power, setpoint at the walkthrough's 1700 psi class | 1725 psia (11.89 MPa) | 1.23 psi | **3.72 psi** | +23.6 psi | 0.00–18.4 % | **93.0** | 32.8 % | **1299 in 300 s (4.33/s)** |

Spray starts to open at an error of **+25 psi** and is full open at **+75 psi**
(`engines/pwr2/pwr2_pressurizer.js`, `CONTROL.spray_start_psi` / `spray_full_psi`; WTSM
Fig 10.2-3, ML11223A287). In both regimes the plant parks with its MEAN error **below** the toe —
5.7 psi below in the 2235 psia class, **1.4 psi below** in the 1725 psia class — and the instrument
noise is what carries it across.

Median dwell either side of the threshold: **0.20 s**.

### 2. The regime is SELF-SELECTING, which is why it is not an accident of one setpoint

Same probe at hot full power with the setpoint parked 30, 40, 50 and 70 psi below plant pressure:

| Setpoint offset | Settled mean error | Cycles/min | Duty |
|---|---|---|---|
| −30 psi | +19.2 psi | 12.0 | 2.4 % |
| −40 psi | +19.3 psi | 12.8 | 2.6 % |
| −50 psi | +19.4 psi | 13.4 | 2.7 % |
| −70 psi | +19.5 psi | 15.2 | 3.1 % |

The closed loop finds the same parked error every time, because the spray's own duty is what holds
it there. **Wherever spray is the controlling element, the plant parks inside the noise band of its
own threshold.** You cannot tune the setpoint out of it.

### 3. Incidence across initial conditions — where it binds and where it does not

| Initial condition | Error against setpoint | Spray | Cycling |
|---|---|---|---|
| `hot_full_power`, setpoint at nominal 2235 psia (15.41 MPa) | +0.4 … +7.5 psi | never opens | **0 transitions in 300 s** |
| `cold_shutdown`, 363 psia (2.50 MPa) | −1337 psi | never opens | **0 transitions in 300 s** |
| `hot_full_power` / `hot_zero_power` with the setpoint below plant pressure | +19 … +24 psi | modulating | 12.8 … 93.0 cycles/min |
| **Shipped walkthrough, Mode 5 → Mode 3, step 11** (the 40,000 s "Wait until AVG COOLANT TEMPERATURE reaches 542 °F" step, SET PZR PRESSURE at 1700 psi) | in band | 0.00–24.4 % | **207 transitions in 60 s = 103 cycles/min, duty 63.0 %, 7.18 printed digit changes per second** |

**That last row is what he was looking at.** The Mode 5 → Mode 3 leg has one step that runs about
11 plant-hours with nothing to press; the board is all there is to watch, and the spray readout is
changing seven times a second on it. Across the whole of step 11 the spray demand peaks at
**21.8 %** and is off its stop in **6.3 % of the step's 40,000 plant-seconds** — about 42
plant-minutes of chattering, in scattered bursts, on a step where the player has nothing to do but
watch. Both independent replays of this leg agree; a second run measured the same step ending at
1714 psia against a 1700 psia setpoint (error +14 psi, back under the toe).

### 4. Which of the three it is

**Missing reset differential / filter.** Proof by counterfactual, computed on the recorded rows (no
source change): the same ladder driven by the plant's TRUE pressure instead of the instrument.

| Ladder, 1725 psia regime, 300 s | Cycles/min | Duty | Printed digit changes |
|---|---|---|---|
| **AS BUILT** (raw indicated error) | **93.0** | 32.8 % | 1299 |
| TRUE pressure, no instrument noise | **0.0** | 0.0 % | 0 |

The cycling carries **no plant information**. It is the controller chasing its own instrument — the
same class as #590's feed loop, and the one already fixed for the heaters.

**This is a known, documented omission.** `pwr2_pressurizer.js:313–327` adds
`prop_filter_tau_s: 2.0` to the proportional heater bank on the owner's 2026-08-31 report *"PZR
heater cycling on and off rapidly"*, and says in as many words: *"spray and the PORV auto-open keep
the RAW error."* Item 13 is the other half of the report the heater filter answered.

### 5. RECOMMENDATION — options, and the one I would take

He ruled to measure first, so this is a recommendation, not a change. Measured on the recorded
1725 psia trace, 300 s:

| Option | Cycles/min | Duty | Printed digit changes | What it costs |
|---|---|---|---|---|
| **1 (preferred) — the spray reads the lagged error the heaters already read** (`pz.errFiltPsi`, τ = 1–2 s) | **0.0** | 0.0 % | 0 | About 2 s of delay on a genuine pressure rise, against a spray whose effect is in seconds. No new constant: `prop_filter_tau_s` exists and its trade is already measured. |
| 2 — a reset differential: open at +25 psi, re-close at +20 psi | 4.0 | 0.7 % | 12 | A new `[open]` constant, and a discontinuity in a band the source gives as proportional. τ = 1.0 s alone already reaches 0, so the deadband buys nothing on top of it. |
| 3 — declare it correct and leave it | 93.0 | 32.8 % | 1299 | Refuted by the counterfactual above. |

**Take option 1.** Smallest change, reuses a filter already in the file with its trade already
measured, and it is the fix the heater half of the same owner report already took.

**What else moves with it — say this before it ships (the coupled pressure/inventory rule).** Spray
is the fast lever in a coupled regime, and a single term of one is worse than none:

- The PORV auto-open at **+100 psi** must keep the RAW error. It is protection, not modulation, and
  the file already keeps it raw deliberately.
- The spray's condensing duty feeds the pressurizer mass and level balance, so the level programme
  and the charging controller see any change in mean spray duty. Measured mean demand today is
  **0.06 %** (2235 psia class) and **1.30 %** (1725 psia class) — small, but not zero.
- **NOT MEASURED:** what τ = 1–2 s does to the heatup's pressurization rate, to the TMI-2 ride's
  PORV lift point, or to `run_pwr2_pressurizer` / `run_pwr2_relief`. Measure those before it lands.
  The option table above is arithmetic on a recorded trace, not a re-ridden plant.

---

## Item 15 — "the STEAM DUMP was already in AUTO at this step but I don't think I put it into AUTO myself. Is this switch to AUTO automatic?"

### The one-line answer

**No. Nothing puts it in AUTO. He put it there himself one step earlier — step 13 is literally
"Press AUTO on the STEAM DUMP card."**

### The measurement

The whole Mode 5 → Mode 3 leg (`pwr_heatup`, 17 steps, 13.65 plant-hours) driven through the full
stack from the `cold_shutdown` initial condition, sampling `control_state.steam_dump_mode` and
`steam_dump_auto` **every tick**:

```
DUMP MODE TRANSITIONS — the whole 13.65-plant-hour leg
  t =   0.00 min   boot                           -> off  / no AUTO lamp
  t = 728.63 min   step 13's own command          -> pressure / AUTO lamp lit
```

**One transition in the entire leg**, and it is step 13's `set_steam_dump {mode: 'auto'}`.

Per-step readback (abridged):

| Step | What it is | Dump mode | AUTO lamp |
|---|---|---|---|
| 1 (boot, `cold_shutdown`) | verify cold and shut down | `off` | no |
| 2–12 | RCPs, shutdown bank, SG feed, letdown, heaters, pressure to 1700 psi, accumulators, the 11-hour heat-up wait | `off` | **no**, at every one |
| **13** | **"Press AUTO on the STEAM DUMP card."** | **`pressure`** | **yes** |
| 14 | "Raise SET PZR PRESSURE to 2235 psi" — **the step he was on** | `pressure` | yes |
| 15–17 | verify Hot Standby | `pressure` | yes |

Step 6 of the same leg reads *"Verify the STEAM DUMP is closed, nothing to press: CLOSE lit"* —
which the measurement confirms.

### Why nothing else could have done it

Four candidates, three eliminated by measurement:

1. **The startup lineup.** `PWR2Engine.prototype.getStartupLineup` returns `[]`
   (`engines/pwr2/pwr2_shell.js:1579`) — PWR2 ships no lineup commands at all.
2. **A `defaultOn` automation channel.** The `steam_dump` channel
   (`layers/control/pwr_control.js:1794`) carries no `defaultOn`. Measured at boot: the only
   channels `engageDefaults()` engages on this plant are `boron_conc` and `afw_level`.
3. **The control layer or the engine.** `dump_mode` is written from exactly one place —
   `pwr2_shell.js`'s `set_steam_dump` handler (`pwr2_engine.js:943` is where it lands) — and
   nothing else in `engines/pwr2/` writes it. Boot value for the Mode 5 initial condition is
   `off`, measured.
4. **An earlier step's own command — this is the one, and it is step 13.**

And the live checklist cannot have pressed it for him: `InstructorLayer._checklistFire` fires only
a step's `inject` / `clear` failures. It never issues a step's `cmd`.

### Is that right? Should it be automatic?

**It is right as it stands, and it should stay manual.** Real plants select steam-dump mode by hand
— WTSM 11.2 (ML11223A294): *Tavg mode at power, steam pressure mode at hot standby / startup /
cooldown.* Selecting it is part of the heatup, and step 13's `why` teaches exactly why: without it
the atmospheric dump valve vents steam to the sky for the rest of the climb (#646 measured 11,005
lbm vented with the dump never selected, 0 lbm with it in either mode).

### Why he thought it was automatic — the one thing worth looking at

Step 13 and step 14 are **adjacent**, and step 13's acceptance is `steam_dump_auto > 0`, satisfied
on the first broadcast after the press. He pressed AUTO, the step ticked itself, he pressed
Continue, and the next thing on the board was step 14 with AUTO already lit. Nothing is wrong with
the plant — but it is a fair reading that step 13 goes past too fast to register as *his* action.

**NOT MEASURED:** whether the panel's highlight and confirmation for step 13 stay visible long
enough to register. That is a user-interface question and belongs with items 7 / 10 / 19.

---

## Item 16 — "Is there an engineering reason why we don't fill the PZR to 62 % at Mode 3… besides prototypicality?"

### The one-line answer

**Yes, and it is not prototypicality.** On this plant the pressurizer level setpoint is a function
of average coolant temperature, not a number the operator picks. At Mode 3 it is **25.0 %**; 62 %
only becomes the programme at **580 °F (304.5 °C)**, which is at power. Fill to 62 % at Mode 3 and
the plant takes it straight back out: measured, level fell **62.0 % → 34.2 % in 30 plant-minutes**
on AUTO and was still falling, with a PZR LEVEL DEVIATION HIGH alarm the whole way and a 144 psi
pressure swing that lit PZR PRESSURE LOW on the way through.

### 1. The level programme, measured on this plant

`LEVEL.tavg_noload_c` = 286.11 °C (**547.0 °F**) → **25 %**; `LEVEL.tavg_full_c` = 304.5 °C
(**580.1 °F**) → **61.5 %**, linear between and clamped outside. Read off a live plant rather than
off the constants:

| Plant state | Tavg | Programme (`control_state.pzr_level_program_pct`) | Actual level |
|---|---|---|---|
| `hot_zero_power` boot (Mode 3, Hot Standby) | 547.0 °F (286.1 °C) | **25.0 %** | 25.0 % |
| 11.3 % power | 553.1 °F (289.5 °C) | 31.7 % | 31.0 % |
| 38.7 % power | 569.5 °F (298.6 °C) | 49.6 % | 49.5 % |
| **62.7 % power** | **583.0 °F (306.1 °C)** | **61.5 %** (clamped) | **62.3 %** |

So **62 % arrives at about 63 % power**, and the programme has already reached its 61.5 % ceiling
by then. There is no "switch to 62 %" — the level rides Tavg continuously from 25 % upward.

### 2. What happens if you fill it to 62 % at Mode 3 anyway (measured)

Charging to MANUAL at maximum charging: 12.6 plant-minutes to take level 25.0 % → 62.0 %; then
charging back to AUTO and the plant left alone.

| | Level | Programme | Primary pressure | Subcooling | Standing alarms |
|---|---|---|---|---|---|
| Mode 3 boot | 25.0 % | 25.0 % | 2235 psia (15.41 MPa) | 104.8 °F (58.2 °C) | — |
| Filled (+12.6 min) | **62.0 %** | 25.0 % | **2269 psia (15.64 MPa)** | 106.9 °F (59.4 °C) | **PZR LEVEL DEVIATION HIGH** |
| +5 min on AUTO | 58.3 % | 25.4 % | 2218 psia (15.29 MPa) | 103.3 °F | PZR LEVEL DEV HIGH |
| +10 min | 54.6 % | 25.3 % | 2173 psia (14.98 MPa) | 100.4 °F | PZR LEVEL DEV HIGH |
| +15 min | 51.2 % | 25.3 % | **2126 psia (14.66 MPa)** | 97.3 °F | **+ PZR PRESSURE LOW** |
| +20 min | 46.8 % | 25.4 % | 2125 psia | 97.2 °F (54.0 °C) | PZR PRESSURE LOW, PZR LEVEL DEV HIGH |
| +25 min | 40.7 % | 25.3 % | 2180 psia | 100.9 °F | PZR LEVEL DEV HIGH |
| +30 min | **34.2 %** | 25.4 % | 2233 psia | 104.3 °F | — (still falling) |

Three measured consequences, none of them prototypicality:

1. **The plant refuses to hold it.** 37 points above programme, the charging and letdown controller
   drains it back — 27.8 points in 30 minutes, still converging on 25 %.
2. **It moves PRESSURE, because level and pressure are one regime here.** The insurge compressed the
   bubble **+34 psi** going in; the letdown that removed it took pressure **144 psi below that
   peak** (2269 → 2125 psia) and tripped the PZR PRESSURE LOW alarm. Subcooling moved 9.7 °F
   (5.4 °C).
3. **It buys nothing.** Both arms — filled to 62 % first, and the normal route — were at the same
   level by the end of the startup leg: **31.0 % against 31.0 %**, identical to three figures. The
   fill is erased.

### 3. Where the level actually comes from

Pressurizer mass fraction rose from **0.0584 at Mode 3 to 0.1133 at 62.7 % power** — the
pressurizer's inventory nearly doubles on the way up, and it comes out of the loop as the coolant
expands. The walkthrough's own step 11 already says so: *"PRESSURIZER LEVEL rising as the water
expands."* That is the plant's answer to his question: **the coolant delivers the level rise itself
as it heats, which is why the programme is written against Tavg, and why filling early is filling
with water the expansion is about to deliver anyway.**

**NOT VERIFIED:** I could not split expansion from charging numerically.
`true_state.charging_flow_actual` and `letdown_flow_actual` read **0.0 in every sample of both arms
— including the 12.6 plant-minutes of maximum manual charging that moved level 37 points.** Either
a units/rounding artefact or a dead channel. Worth its own look; I did not diagnose it.

### 4. So: is prototypicality the only reason?

**No.** Prototypicality agrees, but it is not the argument. The argument on this plant is that the
level setpoint is a Tavg programme, 25 % → 61.5 %, and the plant's own charging controller enforces
it: you cannot park at 62 % in Mode 3 because nothing holds it there, and trying moves primary
pressure 144 psi and lights two alarms. **If we ever wanted 62 % at Mode 3 we would have to change
the programme, not the procedure** — and the pressurizer's three level constants are one object
(`level_per_mass` 776, `level_per_void` 375.33, `level_per_tavg` 1.62), so that is a re-solve of the
set, not a number.

### 5. What I did NOT verify on item 16

- **I did not ride a plant held at 62 % all the way to full power.** Nothing on this plant will hold
  it, so that ride would have to be forced. On the measured programme the level rises **36.5 points**
  from Mode 3 to full power; starting 37 points high would put you near 99 % at full power — that is
  **arithmetic on measured endpoints, not a measured ride**, and it is the claim most worth
  measuring if he wants the complete answer.
- **Both arms tripped identically** at `pwr_raise_power` step 8 (reactor trip, source-range high
  flux) after reaching 87 % power. That is an artefact of my simplified replay, which runs each
  step's authored `hold` without waiting for its acceptance, and it happened in **both** arms at the
  same step — so it is not a finding about the pre-fill. Everything up to 87 % power is valid;
  nothing past step 7 of `pwr_raise_power` is.
