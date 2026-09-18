# PWR2 startup net — #661's whole table re-measured — 2026-09-18

**#665 item 1 corrected three of #661's figures and said in its own words that the rest of that
ride's table was never re-measured. This is that pass.** Every cell of the four-column runaway
withdrawal table and the second `low_power` start is re-measured on today's tree, and every filed
cell is adjudicated one at a time against a RECONSTRUCTION of the tree it was taken on.

**Nothing in the plant was changed. No source file, baseline, gate or issue state was touched.**
Tree: `develop` at `2adf1c06`, clean.

**Headline.** The filed table was taken with a clock that was **relative to the `rod_start`
command AND tick-counted at 1.000 s per tick** — both errors, together, exactly as #665 inferred —
and every one of its time cells is reproduced to the second by restoring the two rate constants
that have moved since. **The filed table was a correct reading of the plant it was taken on.**
What makes it stale is not the clock: it is **two committed rate changes on the night of
2026-09-08, after the ride** — `950fbad2` (#668, rod drive 0.117/0.702/1.053 → 8/60, 48/60, 72/60
steps/s) and `306c06db` (#662, the continuous-withdrawal casualty's rate, 495 steps/min → a point
on the drive's own band, 40 steps/min at severity 0.5). **The casualty column is not stale, it is
superseded: it now describes a different accident.**

**Two cells did not reproduce and are not clock errors** — the casualty column's peak power
(211 %) and peak startup rate (150 decades per minute, DPM). Investigated below; they are
sampling artefacts of a sub-second spike, and the filed pair is not internally consistent with
either sample grid I could put under it.

**The #661 design ruling — option B, no source-range high-flux trip, the 1 DPM startup-rate alarm
instead — SURVIVES.** Verified against these numbers in §6. One quoted figure in its basis moves:
"≤ 28.6 %" is now **≤ 33.0 %**.

---

## 1. The fixture and the discipline

Harness: `ride661.js` (session scratchpad, not in the repo). It loads the same file list, in the
same order, as `test/measure_stack.js` and drives the same stack.

| | |
|---|---|
| **layer** | **FULL STACK — M4 + M5 + M6 through `SimulationService`**, default lineup (`engageDefaults()` + the startup lineup). The plant a player gets. |
| **command path** | `svc.handleCommand` → instructor → ControlLayer → `engine.applyCommand`. Never the engine's own `applyCommand` directly. |
| **drive** | `svc.tick()` in a loop. **Never `svc.start()`.** |
| **clock** | `svc.simTime`, the engine's own absolute time. **Reported BOTH ways in every table below** — absolute (settle included) and relative to the `rod_start` / `inject_failure` command. |
| **settle** | **60.0 s of plant time** before the command, so absolute = relative + 60.00 s on every row. |
| **acceleration** | **1×** for every figure in §2 (broadcast 100 ms, transient 50 ms; protection evaluated once per broadcast, so trip latency is resolved to 0.05–0.10 s). The reconstruction in §3 runs at **10×**, because that is what reproduces the filed tick clock. |
| **seed** | 4242 (`measure_stack`'s own default). |
| **attention stops** | OFF, and stamped. |
| **initial condition** | `hot_zero_power`, except §5 which is `low_power`. |
| **rod drive today** | **slow 0.1333 steps/s (8.0 steps/min) · normal 0.8000 (48.0) · fast 1.2000 (72.0)**, read off `ROD_SPEEDS` and never typed. `runawayRodSpeed(0.5)` = **0.6667 steps/s (40.0 steps/min)**. |

Boot state, `hot_zero_power`, after the 60 s settle (identical on every column): fission power
1.927e-7 %, source range **energized at 501 counts per second (cps)**, intermediate range
1.606e-11 A, bank 0 steps, boron 719 ppm, reactivity −1141 pcm, T-avg **547.3 °F (286.3 °C)**,
fuel **547.3 °F (286.3 °C)**.

**Event definitions, all read off the published channel, none typed:**

- **P-6 met** — `true_state.ir_amps` ≥ `RD.pwr2.protection.P6.amps` (1.0e-10 A), read from the
  engine's own export. The indicated crossing (`instruments.intermediate_range`) is given too.
- **1 DPM** — `true_state.startup_rate_dpm` ≥ 1.0 (truth) and `instruments.startup_rate` ≥ 1.0.
- **SUR HI / SR HI FLUX** — the `sur_high` and `sr_high_flux` annunciators going
  `clear` → `active_unacknowledged` on the service snapshot's own alarm list.
- **1e5 cps** — `true_state.sr_energized` going false. On this plant the source-range channel
  de-energizes at exactly `SR_SECURE_CPS` = 1.0e5 cps (`pwr2_true_state`), so that transition IS
  the 1e5 crossing; the published count rate can never read it.
- **IR rod stop** — `true_state.rod_stop`, with the cause confirmed as the intermediate-range
  high-flux stop (not the delta-T pair) by reading `blockIrHigh` / `dtApproach` off the live
  protection state at that sample.
- **reactor trip** — `true_state.scrammed`, with `pt.trip_cause` named.
- **peaks** — the running maximum of `power_pct`, `fuel_temp_c` and `startup_rate_dpm` sampled
  every broadcast.

**One stamped cross-check with the shipped tool**, so a wrong-layer or wrong-reference-point
figure would be visible in an artifact I did not write:

```
node test/measure_stack.js --plant=pwr2 --ic=hot_zero_power --settle=60s --for=7m --every=20s \
  --accel=1 --seed=4242 --watch=power_pct,startup_rate_dpm,rod_steps,rod_stop,scrammed,fuel_temp_c,sr_energized \
  --cmd='0s:{"action":"rod_start","direction":1,"speed":"normal"}'
```

Its header stamps `settle 60.0 s — measurement t=0 is engine simTime 60.00 s`, `acceleration 1x
(5 physics steps per broadcast; protection evaluated every 0.10 sim-s)`, `seed 4242`, `engine
PWR2Engine`, `commands via svc.handleCommand`. It prints **`REACTOR TRIP at 5m39s —
ir_high_flux`** — 339 s relative, 399 s absolute, against my harness's 338.80 / 398.80. Agreed
inside one sample.

---

## 2. THE CORRECTED TABLE — today's tree, full stack, 1×

**Every cell is `relative to the command` / `absolute engine simTime`. Absolute = relative + 60.00 s.**

| | **normal** 48.0 steps/min | **fast** 72.0 steps/min | **slow** 8.0 steps/min | **`continuous_rod_withdrawal` sev 0.5** — now **40.0 steps/min** |
|---|---|---|---|---|
| P-6 permissive met (truth, IR ≥ 1.0e-10 A) | **246.00** / 306.00 | **166.90** / 226.90 | **1400.10** / 1460.10 | **293.00** / 353.00 |
| P-6 met (indicated IR channel) | 243.60 / 303.60 | 165.50 / 225.50 | 1373.20 / 1433.20 | 289.70 / 349.70 |
| startup rate ≥ 1.0 DPM (truth) | **265.10** / 325.10 | **169.30** / 229.30 | **1696.16** / 1756.16 | **322.90** / 382.90 |
| **SUR HI** annunciator (1.0 DPM, caution) | **266.90** / 326.90 | 171.20 / 231.20 | 1697.56 / 1757.56 | 324.60 / 384.60 |
| **SR HI FLUX** annunciator (5e4 cps) | 297.86 / 357.86 | 202.76 / 262.76 | **1654.70** / 1714.70 | 354.06 / 414.06 |
| 1e5 cps — source range **de-energizes** | **302.92** / 362.92 | **206.22** / 266.22 | **1679.26** / 1739.26 | **360.12** / 420.12 |
| **intermediate-range high-flux ROD STOP**, 20 % | **337.60** / 397.60 | **228.78** / 288.78 | **1903.12** / 1963.12 | **401.84** / 461.84 |
| **reactor trip** | **338.80** / 398.80 — `ir_high_flux` | **229.62** / 289.62 — `ir_high_flux` | **NONE in 2.5 plant-hours** — the rod stop arrests it | **403.58** / 463.58 — `ir_high_flux` |
| rod stop → trip | **1.20 s** | **0.84 s** | — | **1.74 s** |
| peak startup rate | **18.60 DPM** | **30.76 DPM** | **3.07 DPM** | **15.01 DPM** |
| peak fission power | **27.64 %** | **32.96 %** | **23.77 %** (at 2151 s relative, *after* the rod stop) | **27.30 %** |
| peak fuel temperature | **622.3 °F (327.9 °C)**, +75.0 °F (+41.7 °C) | **607.9 °F (319.9 °C)**, +60.6 °F (+33.7 °C) | **709.8 °F (376.6 °C)**, +162.5 °F (+90.3 °C) | **634.7 °F (334.9 °C)**, +87.5 °F (+48.6 °C) |
| peak source-range count rate | 9.898e4 cps | 9.957e4 cps | 9.983e4 cps | 9.877e4 cps |

**The slow column's alarm order is inverted and that is real, not an artefact.** At 8 steps/min
SR HI FLUX (count rate) arrives **42 s BEFORE** the startup rate reaches 1 DPM. The filed table
shows the same inversion at 7 steps/min (1906 cps against 1937 DPM). It is a property of a slow
enough ride: the count rate is a level and the startup rate is its derivative.

**The rod stop reads the POWER-RANGE INSTRUMENT, not truth.** `pwr2_engine` feeds protection
`power_frac = (rd.power_range !== undefined ? rd.power_range : rrx.power_pct) / 100`, so the
20 % stop is graded on the indicated channel. Measured TRUE fission power at the stop: **21.99 %**
(normal), **23.99 %** (fast), **19.29 %** (slow), **21.09 %** (casualty). The spread is the
meter's lag on a rising ramp and its noise on a slow one — HR1 working, not a defect, but it is
why "the rod stop at 20 %" and a truth-channel reading never agree to the point.

---

## 3. THE RECONSTRUCTION — the filed table reproduced, to adjudicate it

Two in-memory overrides on the loaded objects, **no source file edited**:

1. `ROD_SPEEDS` restored to `{ slow: 0.117, normal: 0.702, fast: 1.053 }` — the literal at
   `950fbad2^`, i.e. 7.02 / 42.12 / 63.18 steps/min, which is the filed table's own "7 / 42 / 63".
2. For the casualty column only, `runawayRodSpeed` restored to the pre-`306c06db` form,
   `severity × (24/912) × max_steps`. With `RODS.max_steps` = 627 that gives **8.250 steps/s =
   495.0 steps/min** at severity 0.5 — the filed figure, to the digit.

Run at **10×**, where one broadcast is 1.000 s of sim at the normal cadence and 0.500 s once
`SimulationService` drops `broadcastMs` to `TRANSIENT_MS`. The `TICK×s` column below is a
tick counter multiplied by 1.000 s — #661's clock, added to test the hypothesis, not fitted.

### normal (42.1 steps/min)

| event | true relative | **TICK×s** | **filed by #661** |
|---|---|---|---|
| P-6 met | 279.00 | **279** | **279** |
| 1 DPM (truth) | 306.00 | **306** | **306** |
| SUR HI | 308.00 | 308 | — |
| SR HI FLUX | 337.50 | 338 | — |
| 1e5 cps | 343.00 | **344** | **344** |
| IR rod stop | 382.50 | **387** | **387** |
| reactor trip | 384.50 | **391** | **391** |
| peak startup rate | **15.98 DPM** | — | **15.98 DPM** |
| peak power | **26.52 %** | — | **26.6 %** |
| peak fuel | **636.0 °F (335.6 °C)**, +88.7 °F | — | **636 °F (336 °C), +89 °F** |

**Eight of eight.** The absolute column of that same run is 339 / 366 / 397.5 / 403 / 442.5 /
444.5 s, which is where the alarm probe's and group N's figures came from.

### fast (63.2 steps/min)

| event | true relative | TICK×s | filed |
|---|---|---|---|
| P-6 met | 190.00 | **190** | **190** |
| 1 DPM (truth) | 196.00 | 196 | **197** *(the INDICATED crossing is 198; the filed 197 sits between the two)* |
| 1e5 cps | 234.00 | **235** | **235** |
| IR rod stop | 259.50 | **262** | **262** |
| reactor trip | 260.50 | **264** | **264** |
| peak startup rate | 26.02 DPM | — | 25.7 DPM |
| peak power | **28.58 %** | — | **28.6 %** |
| peak fuel | **612.6 °F (322.6 °C)** | — | **613 °F** |

### slow (7.0 steps/min)

| event | true relative | TICK×s | filed |
|---|---|---|---|
| P-6 met | 1592.00 | **1592** | **1592** |
| SR HI FLUX | 1875.00 | 1875 | — |
| 1e5 cps | 1905.50 | **1906** | **1906** |
| 1 DPM (truth) | 1936.50 | **1937** | **1937** |
| IR rod stop | 2162.00 | **2163** | **2163** |
| reactor trip | — | **none in 2.5 plant-h** | **none in 2.5 plant-h** |
| peak startup rate | **2.73 DPM** | — | **2.73 DPM** |
| peak power | **23.30 %** | — | **23.3 %** |
| peak fuel | **706.5 °F (374.7 °C)** | — | **706 °F** |

### `continuous_rod_withdrawal` severity 0.5, at the pre-#662 495 steps/min

| event | true relative (10×) | TICK×s | true relative (1×) | filed |
|---|---|---|---|---|
| 1 DPM (truth) | 11.00 | **11** | 10.10 | **11** |
| P-6 met | 27.50 | **28** | 26.86 | **28** |
| 1e5 cps | 33.50 | **34** | 32.86 | **34** |
| reactor trip, `turbine_trip` (P-9) | 35.50 | 37 | **35.14** | **35.4 s, P-9 turbine trip** |
| peak fuel | 590.6 °F (310.4 °C) | — | **590.7 °F (310.4 °C)** | **591 °F** |
| peak startup rate | 470.86 DPM | — | 466.40 DPM | **150 DPM** ❌ |
| peak power | 34.33 % | — | 173.04 % | **211 % in 0.6 s** ❌ |

---

## 4. PER-FIGURE ADJUDICATION — one at a time

The verdict vocabulary the brief asked for: *right-as-written but mislabelled* · *wrong by the
reference point* · *wrong by the tick clock* · *wrong by the rod-speed drift* · *wrong for a
reason none of those explain*. A cell can carry more than one, and most carry two, so each row
below separates **(a) was it a correct reading of the plant it was taken on** from **(b) does it
describe today's plant**.

**A measured refinement of #665's mechanism, which changes how several of these adjudicate.**
#665 said the tick clock "ran FAST, and only after the first alarm". Measured here, the inflation
is not switched on by an alarm — it is **proportional to the sim time the ride spends at the
transient broadcast cadence**, and on this fixture that is only the last few seconds before the
trip. So the inflation on the normal column is **0.0 s at P-6, 0.0 s at 1 DPM, 1.0 s at 1e5 cps,
4.5 s at the rod stop and 6.5 s at the trip**, and on the SLOW column — 36 plant-minutes long —
it is **0.0 / 0.5 / 0.5 / 1.0 s**. A tick-counted clock is therefore not uniformly wrong; it is
wrong *late*, which is exactly where the protective actions are.

### normal column

| filed | verdict (a) on its own tree | verdict (b) today |
|---|---|---|
| **P-6 met, 279 s** | **RIGHT AS WRITTEN, MISLABELLED.** Reproduced exactly, both as a relative figure and as a tick count — the two agree because there is no transient cadence yet. Its only fault is that it was published beside absolute figures with no reference point named (absolute equivalent: 339 s). | **STALE by the rod-speed drift alone.** Today **246.00 s relative / 306.00 s absolute**. Ratio 0.8817 against 0.702/0.800 = 0.8775 — the residual is the reactivity being a function of bank position, not of time. |
| **1 DPM, 306 s** | **RIGHT AS WRITTEN, MISLABELLED.** Same: 306.00 relative, 306 ticks. (This is #665's verdict, confirmed independently.) | **STALE by rod speed.** Today **265.10 / 325.10**. |
| **1e5 cps, 344 s** | **WRONG BY THE TICK CLOCK, by 1.0 s, AND mislabelled.** True relative 343.00. A 1 s error is inside anyone's tolerance, but it is the same defect, caught early. | **STALE by rod speed.** Today **302.92 / 362.92**. |
| **IR rod stop, 387 s** | **WRONG BY BOTH.** +4.5 s of tick inflation on a true relative 382.50, then published against absolute figures. #665's verdict, confirmed. | **STALE by rod speed.** Today **337.60 / 397.60**. |
| **reactor trip, 391 s** | **WRONG BY BOTH**, +6.5 s. #665's verdict, confirmed. | **STALE by rod speed.** Today **338.80 / 398.80**, cause `ir_high_flux` — unchanged. |
| **peak startup rate 15.98 DPM** | **RIGHT. A clock error cannot touch it** — it is a magnitude. Reproduced to the hundredth. | **MOVED BY THE PLANT: 18.60 DPM**, +16.4 %. The drive is 14 % faster and the rate is superlinear in it. |
| **peak power 26.6 %** | **RIGHT** (26.52 measured). | **MOVED: 27.64 %**, +1.0 point. |
| **peak fuel 636 °F (336 °C), +89 °F** | **RIGHT** (636.0 °F, +88.7 °F). | **MOVED DOWN: 622.3 °F (327.9 °C), +75.0 °F (+41.7 °C).** The excursion is shorter, so less heat lands in the fuel before the trip. |

### fast column

| filed | verdict (a) | verdict (b) today |
|---|---|---|
| **P-6 190 s** | RIGHT AS WRITTEN, MISLABELLED. Reproduced exactly; no inflation. | **166.90 / 226.90** — rod speed. |
| **1 DPM 197 s** | **RIGHT WITHIN SAMPLING.** My truth crossing is 196.0 and the indicated crossing 198.0; 197 lies between them and the filed table does not say which channel it read. Not a clock error. | **169.30 / 229.30** (truth); SUR HI at 171.20 / 231.20. |
| **1e5 cps 235 s** | WRONG BY THE TICK CLOCK, +1.0 s (true 234.00), and mislabelled. | **206.22 / 266.22**. |
| **rod stop 262 s** | WRONG BY BOTH, +2.5 s (true 259.50). | **228.78 / 288.78**. |
| **trip 264 s** | WRONG BY BOTH, +3.5 s (true 260.50). | **229.62 / 289.62**, `ir_high_flux`. |
| **peak SUR 25.7 DPM** | RIGHT within sampling (26.02). | **30.76 DPM.** |
| **peak power 28.6 %** | **RIGHT** (28.58). | **32.96 %** — see §6, this is the one number in the ruling's basis that moves. |
| **peak fuel 613 °F** | **RIGHT** (612.6). | **607.9 °F (319.9 °C)**, +60.6 °F (+33.7 °C). |

### slow column

| filed | verdict (a) | verdict (b) today |
|---|---|---|
| **P-6 1592 s** | RIGHT AS WRITTEN, MISLABELLED (exact, no inflation). | **1400.10 / 1460.10**. |
| **1 DPM 1937 s** | RIGHT AS WRITTEN within 0.5 s, MISLABELLED. | **1696.16 / 1756.16**. |
| **1e5 cps 1906 s** | RIGHT AS WRITTEN within 0.5 s, MISLABELLED. | **1679.26 / 1739.26**. |
| **rod stop 2163 s** | WRONG BY THE TICK CLOCK by only **1.0 s** (true 2162.00), and mislabelled. The slow ride is the control case that proves the inflation is cadence-proportional, not alarm-triggered. | **1903.12 / 1963.12**. |
| **"none in 2.5 plant-h — the rod stop ARRESTS it"** | **RIGHT.** | **STILL RIGHT, re-measured to 9000.02 s (2.5 plant-hours) today.** Peak fission power **23.77 %** against a 25 % trip — it never reaches the setpoint. This is the load-bearing claim of the ruling and it survives at the new drive speed. |
| **peak SUR 2.73 DPM** | **RIGHT** (2.73). | **3.07 DPM.** |
| **peak power 23.3 %** | **RIGHT** (23.30). | **23.77 %** — moved 0.47 of a point. |
| **peak fuel 706 °F** | **RIGHT** (706.5). | **709.8 °F (376.6 °C)** — moved 3.3 °F. |

### `continuous_rod_withdrawal` column — SUPERSEDED, not stale

| filed | verdict (a) | verdict (b) today |
|---|---|---|
| **"sev 0.5 = 495 steps/min"** | **RIGHT for the code then in the tree.** | **SUPERSEDED by `306c06db` (#662): severity 0.5 is now a point on the drive's own band, `slow + 0.5×(fast − slow)` = 0.6667 steps/s = 40.0 steps/min** — 12.4× slower, and **slower than the operator's own NORMAL withdrawal at 48 steps/min**. See §7. |
| **P-6 28 s · 1 DPM 11 s · 1e5 cps 34 s** | RIGHT AS WRITTEN, MISLABELLED (reproduced 28 / 11 / 34 exactly). | **293.00 / 353.00 · 322.90 / 382.90 · 360.12 / 420.12.** A different accident. |
| **trip 35.4 s, P-9 turbine trip** | **RIGHT.** Reproduced at 1× as **35.14 s relative**; the filed 35.4 s carries a decimal, so that cell was not tick-counted. The `turbine_trip` cause is confirmed — the flux channels' 0.5 s analysis delays had not elapsed, exactly as filed. | **DIFFERENT MECHANISM: `ir_high_flux` at 403.58 / 463.58 s.** At 40 steps/min the flux delays elapse and the ordinary intermediate-range trip catches it. The P-9 anticipatory trip no longer participates. |
| **peak fuel 591 °F** | **RIGHT** (590.6 at 10×, 590.7 at 1× — the fuel temperature is slow enough to be grid-independent). | **634.7 °F (334.9 °C)**, +87.5 °F (+48.6 °C). |
| **peak power 211 % in 0.6 s** | **WRONG FOR A REASON NONE OF THE FOUR EXPLAIN — investigated: it is a SAMPLING ARTEFACT.** See below. | Moot. Today **27.30 %**. |
| **peak startup rate 150 DPM** | **SAME — sampling artefact.** | Moot. Today **15.01 DPM**. |

**The investigation of the two cells that did not reproduce.** The filed text itself says the
excursion lasts **0.6 s**. A per-broadcast sampler therefore gets **at most one** sample inside
it, and which one decides the answer. Measured on the reconstruction, same plant, same ride, two
grids:

| sample grid | peak power | peak startup rate | peak fuel |
|---|---|---|---|
| 1.000 s / 0.500 s (10×) | 34.33 % | 470.86 DPM | 590.6 °F |
| 0.100 s / 0.050 s (1×) | **173.04 %** | 466.40 DPM | 590.7 °F |
| **filed** | **211 %** | **150 DPM** | **591 °F** |

Three things follow. **(1)** The fuel temperature — a slow state — reproduces to **0.1 °F on both
grids**, so the plant is the same plant; nothing physical is unaccounted for. **(2)** Peak power
is grid-dominated: it reads 34 % or 173 % on the *same run* depending only on where the samples
land, and 211 % is a third point on that curve, reachable by a finer grid I cannot recover.
**(3)** The filed pair is **internally inconsistent with either grid**: the 1× grid that gets
within 20 % of the filed peak power reads **466 DPM**, three times the filed 150 DPM, and the
grid that reads a low power reads a high rate. A peak power and a peak rate on the same 0.6 s
spike cannot both come from that pair unless they were taken from two different samplers.

**Verdict on those two cells: not a clock error, not a plant difference — an unrecoverable
sample grid, and two cells that should never have been published as plant magnitudes without the
grid stamped beside them.** They are moot either way: the accident they describe no longer exists.

---

## 5. The second start — `low_power` (9.6 %), both P-10 blocks standing

Filed: *"power runs to **88 %** and fuel to **1208 °F (654 °C)** before an overtemperature-ΔT trip
at **302 s** … the widest un-acted window in the startup net"*.

**Reconstruction, old rod speed, tick-counted:** peak power **88.16 %**, peak fuel **1208.6 °F
(653.7 °C)**, trip `ot_delta_t` at **TICK×s 302** (true relative 296.00, absolute 356.00).
**All three exact.**

**Today, full stack, 1×, rod drive 48 steps/min:**

| | relative | absolute | |
|---|---|---|---|
| P-6 already met at boot | 0.10 | 60.10 | intermediate range 8.0e-4 A |
| 20 % current equivalent crossed | 39.20 | 99.20 | — |
| `heatup_rate_high`, `pzr_level_dev_low` | 97.60 | 157.60 | first annunciators |
| `pzr_pressure_high` | 110.18 | 170.18 | |
| `porv_open` | 129.54 | 189.54 | |
| `high_tavg` | 177.60 | 237.60 | |
| **`otdt_approach`** | **249.78** | 309.78 | the overtemperature-ΔT approach annunciator |
| **delta-T ROD STOP** (`dtApproach`) | **250.14** | 310.14 | at **89.01 %** power; `blockIrHigh` true, so the flux stop is blocked and this is the delta-T pair |
| **reactor trip, `ot_delta_t`** | **265.10** | 325.10 | |
| **peak power** | **89.05 %** | @310.04 abs | filed 88 % |
| **peak fuel** | **1213.1 °F (656.2 °C)**, +601.8 °F (+334.3 °C) | @313.10 abs | filed 1208 °F (654 °C) |

**Adjudication.** Peak power and peak fuel: **RIGHT as filed, and essentially unmoved by the
plant** — 88 → 89.05 % and 1208.6 → 1213.1 °F, +0.9 of a point and +4.5 °F. The 302 s: **RIGHT AS
WRITTEN, MISLABELLED** (a relative tick count; true relative 296.00, absolute 356.00), and today
**265.10 relative / 325.10 absolute** by the rod-speed drift.

**One correction of substance to the prose around those numbers.** *"The widest un-acted window"*
is right about the width, and wrong that nothing acts: **an automatic rod stop DOES fire on this
ride**, the overtemperature-ΔT approach stop, **15.0 s before the trip** at 89.01 % power, with
its own annunciator 0.36 s ahead of it. The filed ride logged the flux net and the permissives
and did not log the delta-T pair. The window from the first annunciator (`heatup_rate_high`,
97.60 s relative) to the first automatic action is **152.5 s**; the window from the *start of
withdrawal* to the first automatic action is **250.1 s**. It is still much the widest on the
board — but the net is not empty there.

---

## 6. DOES THE #661 RULING SURVIVE? — **YES.**

*(OWNER RULING, 2026-09-08: "B — leave the trip declared absent; build a 1 DPM startup-rate
ALARM".)* Its stated basis was a **margin** argument, not a timing one: *"the net is not open:
the rod stop arrests the slow ride outright and the IR trip catches the others within 4 s at
≤ 28.6 % with no limit approached."* Taken clause by clause against §2:

| clause | measured today | verdict |
|---|---|---|
| *"the rod stop arrests the slow ride outright"* | **HOLDS, re-measured.** Rod stop at 1903.12 s relative; **no trip in 2.5 plant-hours (9000.02 s)**; peak fission power **23.77 %** against a 25 % trip setpoint — it does not reach it. | ✅ |
| *"the IR trip catches the others"* | **HOLDS, and is now MORE true.** Normal, fast AND the casualty all trip on `ir_high_flux`. The casualty used to trip on the P-9 turbine trip because the flux channels' 0.5 s delays had not elapsed; at 40 steps/min they do, so the intended function now catches all three. | ✅ |
| *"within 4 s"* | **HOLDS with room.** Rod stop → trip is **1.20 s** (normal), **0.84 s** (fast), **1.74 s** (casualty). Was 4.5 / 1.0 / — on the old tree. | ✅ |
| *"at ≤ 28.6 %"* | **THE ONE FIGURE THAT MOVES. Now ≤ 32.96 %** — the fast column's peak, up from 28.58 %. The trip overshoot at fast drive speed is **7.96 points of rated power** above the 25 % setpoint, up from 3.58. | ⚠️ **restate as ≤ 33.0 %** |
| *"with no limit approached"* | **HOLDS, and not narrowly.** Peak fuel on the four hot-zero-power rides is **607.9 – 709.8 °F (319.9 – 376.6 °C)**. That is *below the fuel temperature this plant runs at in ordinary operation* — the `low_power` ride at 89 % reaches **1213 °F (656 °C)** — and the nearest modelled damage criterion is a **cladding** temperature of **2200 °F (1204 °C)** (`pwr2_damage`, 10 CFR 50.46 criterion 1). Peak power 33.0 % is likewise nowhere near the power-range high-flux functions. | ✅ |

**And the "81 unwarned seconds" claim, re-checked on today's tree as asked.** The thread already
withdrew it; it is withdrawn again, with today's numbers. **SUR HI arrives 1.80 s behind the true
1 DPM crossing and 0.00 s behind its own instrument** (normal column: truth 265.10, indicated
266.90, alarm 266.90) — HR1 working exactly as written, the whole delay being the meter's own
2 s lag. Measured on all four columns: **1.80 / 1.90 / 1.40 / 1.70 s**. The interval the filed
figure was really describing — alarm to first automatic action — is **70.70 s** (normal),
**57.58 s** (fast), **205.56 s** (slow), **77.24 s** (casualty). It is a **warned** window, and
the warning is the alarm the ruling asked for.

**Verdict: the ruling survives, unchanged.** Nothing here reopens it. The only edit it needs is
to its own quoted basis: **"≤ 28.6 %" should read "≤ 33.0 %"**. That is a restatement of a
measured ceiling, not a change of decision, and it does not weaken the argument — 33 % is as far
from every limit as 28.6 % was.

---

## 7. Two side findings that are not about the clock

**(a) The `continuous_rod_withdrawal` casualty at its DEFAULT severity is now milder than the
operator's own normal withdrawal.** `runawayRodSpeed(0.5)` = **40.0 steps/min** against
`ROD_SPEEDS.normal` = **48.0 steps/min**. Severity 1.0 lands exactly on `fast`, 72 steps/min —
which is the sourced accident rate (NRC HRTD ML11216A094 Transients 5.22/5.23) and the whole
point of #662, so the *band* is right. The consequence is a presentation one: an injected
"continuous rod withdrawal" at the severity an instructor gets by default produces a **slower**
excursion than a player simply holding the withdraw lever at NORMAL — trip at 403.58 s against
338.80 s. Not a defect; a Q4 (player-complexity) observation, and worth a sentence somewhere
before a scenario author picks 0.5 expecting a casualty.

**(b) The intermediate-range flux trip's overshoot grew with the drive speed.** Peak fission
power against a 25 % setpoint: **27.64 %** (normal, +2.64), **32.96 %** (fast, +7.96), **27.30 %**
(casualty, +2.30). On the old drive it was +1.52 / +3.58. Still nowhere near a limit, but it is
the one quantity in this pass that moved in the unfavourable direction, and it moved because the
rods now travel 14 % faster through the 0.5 s analysis delay.

**(c) A documentation defect that landed TODAY, in the file whose job is stamping.**
`test/measure_stack.js`'s header says, of pwr2's initial conditions: *"pwr2's list, verified
2026-09-18 against `engines/pwr2/pwr2_engine.js`: hot_full_power, 50_percent, hot_zero_power,
hot_shutdown, cold_shutdown."* **The engine names SIX**, and its own error message proves it:
`pwr2_engine: unknown initial_state "bogus_xyz" — this engine has hot_full_power / 50_percent /
low_power / hot_zero_power / hot_shutdown / cold_shutdown`. **`low_power` is missing from the
header**, and it is the IC of §5 above — the very ride this pass needed. Reported, not edited.

---

## 8. What reached player-facing content

**Grepped:** `Manuals/` (all 13 chapters), `ui/manual_procedures.js`, `ui/manual_data.js`,
`ui/app.js`, `ui/panels/`, `scenarios/` (all 30 files), for `279`, `344`, `1592`, `1937`, `2163`,
`1208`, `495 steps`, `26.6 %`, `636 °F`, `15.98`, `2.73 DPM`, `23.3 %`, `706 °F`, `613`, `591`,
`211 %`, `150 DPM`, `81 second` / `81 unwarned`, and `387` / `391` / `367` / `442` / `444` in a
startup-net context.

**Result: ZERO hits for every figure except the three already corrected today.** The only two
player-facing sites that ever carried this timeline are both current, and **I independently
confirmed all three of the figures each one quotes:**

| site | what it says | my measurement |
|---|---|---|
| `Manuals/09_SETPOINTS_LIMITS.md` §7.5.1 (~line 388) | *"…times given **relative to the start of withdrawal** … SUR HI at **267 s**, the rod stop at **338 s**, the trip at **339 s**"*, at *"normal drive speed **0.800 steps/s**"* | **266.90 / 337.60 / 338.80 s relative.** ✅ All three, and the reference point and drive speed are both stamped in the prose. |
| `Manuals/12_SIM_PHYSICS.md` §4.4 (~line 221) | *"SUR HI comes in at **267 s** — 1.66 s behind the true rate … withdrawal then continues uninterrupted to the intermediate-range flux rod stop at **338 s**"* | **266.90 / 337.60 s relative.** ✅ The lag reads **1.80 s** at my seed/layer against its 1.66 s at the shell-under-kernel layer — inside the sampling, and both are "the meter's own lag". |
| `test/run_pwr2_shell.js` group N prose (~line 2375) | already carries *"THOSE SIX TIMES ARE HISTORY, NOT THE PLANT (#665)"* and prints 325.10 / 326.76 live | ✅ current; my 325.10 / 326.90 at 1× agrees to the sample. |

**Nothing is owed to a writer from this pass** on the strength of the table alone. Two optional
items, both small and both mine to report rather than to fix: the ruling-basis restatement
("≤ 28.6 %" → "≤ 33.0 %", §6) lives only in this issue thread and touches no player-facing file;
and `Manuals/06` PWR-A08/A09 were checked and carry no timing figures at all.

---

## 9. What I did NOT verify

- **I never read `#661`'s original scratch files** — `scratchpad/661/ride.js` and `alarms.js` are
  gone, as #665 already recorded. Everything in §3 is a RECONSTRUCTION from the thread's own
  description of its discipline. It reproduces **19 of 21** filed cells exactly or within
  sampling, from overrides chosen to test the hypothesis rather than to match the numbers — but
  it remains an inference, and a different mechanism with the same signature is not excluded.
- **The two cells it does NOT reproduce** (casualty peak power, casualty peak startup rate) are
  adjudicated as sampling artefacts on the evidence in §4. **I did not recover the original
  sample grid** and cannot, so that verdict is an argument from three measurements, not a
  reproduction.
- **I did not re-measure at any layer but the full stack.** Every figure above is M4+M5+M6
  through `SimulationService`. The shell-under-kernel figures in #665 and in `run_pwr2_shell`
  group N are a different (0.02 s) discipline; #665 measured the gap at 0.44 s on the rod stop
  and 0.20 s on the trip and I did not re-check that.
- **I did not sweep the seed.** Everything is seed 4242. The indicated-channel crossings (P-6
  indicated, the 1 DPM alarm) are noise-excited and #665 measured 0.20 s of seed sensitivity on
  them; the truth crossings, the rod stop and the trip it measured at 0.00 s.
- **I did not re-derive or check any setpoint value** — P-6's 1.0e-10 A, the 20 % rod stop, the
  25 % trip, `SR_SECURE_CPS` 1e5, `sr_high_flux`'s 5e4 — all read off the engine's own exports
  and none audited. `sr_high_flux`'s 5e4 remains `[UNVERIFIED]` where #661 marked it.
- **I did not run any aggregate gate.** No `run_all`, no `run_pwr2_shell`, no baseline compared.
  Nothing in this pass can have moved one: no source file, no baseline, no fixture was edited.
- **Nothing in a browser.** No board, tile, checklist or UI claim is measured here. The
  `Manuals/` verification in §8 is a grep plus three engine measurements, not a rendered read.
- **The casualty column at severities other than 0.5.** Severity 1.0 lands on `fast` by
  construction (`slow + 1.0×(fast − slow)`), so the fast column covers it arithmetically — but I
  did not ride it.
