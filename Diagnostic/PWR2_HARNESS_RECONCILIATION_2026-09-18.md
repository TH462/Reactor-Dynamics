# PWR2 harness reconciliation — #665 item 1

**2026-09-18.** Three hand-rolled harnesses rode one PWR2 fixture on 2026-09-08 and disagreed by
60 s on the 1 decade-per-minute (DPM) startup-rate crossing and by 55 s on the intermediate-range
(IR) high-flux rod stop. **All three are now reproduced exactly, and the disagreement is two
independent causes, not one.** Nothing in the plant was wrong; nothing in this pass changed a
source file.

- **The 60 s is the REFERENCE POINT.** One harness reported time relative to the `rod_start`
  command; the other two reported absolute engine `simTime`, which includes the 60 s settle.
- **The remaining ~4.5 s (rod stop) / ~6.5 s (trip) is a TICK-COUNTED CLOCK.** `#661`'s ride
  assumed "50 physics steps per tick = 1.000 s". `SimulationService` drops `broadcastMs` from
  100 ms to 50 ms during an active transient (`TRANSIENT_MS`, §7), so a tick buys **0.5 s**, not
  1.0 s, once the plant is transient. A harness counting ticks runs FAST, and only after the
  first alarm — which is exactly why the 1 DPM gap was a clean 60 s and the rod-stop gap was 55 s.

`55.5 = 60 − 4.5`. The two causes work in opposite directions, which is why one number looked like
a clean offset and the other did not.

**A third fact, separate from the disagreement: every 2026-09-08 figure in #661 and #665 is now
STALE.** Commit `950fbad2` (#668, 2026-09-08 22:13) moved the rod drive from 0.702 steps/s to
48/60 = **0.800 steps/s** — *after* all three harnesses ran (`c5dccbba` 12:30, `c715a2d0` 17:03,
`0ce64bfc` 18:08). Today's rod stop is **44.9 s earlier** than the filed one.

---

## The fixture

`hot_zero_power`, 60 s settle, `rod_start` direction 1 speed `normal`, no operator intervention.
Measured today on `develop` at `168205e4` + other agents' in-flight edits (`engines/pwr/pwr_engine.js`,
`engines/pwr2/pwr2_shell.js`, `test/measure_stack.js`, `test/run_all.js`, `test/run_pwr2_shell.js`,
`tools/verify_release_deploy.js` — none of them mine).

**The "same fixture" premise is not literally true: `run_pwr2_shell` group N passes NO seed.**
Its constructor is `new SH.PWR2Engine({ initial_state: 'hot_zero_power' })`, so it runs
`PWRInstruments`' fallback `0x9E3779B9` (2,654,435,769), not `0x1234`. MEASURED effect on this
ride: **0.20 s** on the indicated channel, **0.00 s** on truth, the rod stop and the trip.

---

## Every measurement, discipline stamped

Harness scratchpad: `recon.js` (session scratchpad, not in the repo). It loads the same file list
as `test/measure_stack.js`, and has three modes differing ONLY in the discipline named.

### Today's tree, rod drive 0.800 steps/s (MEASURED — `rod_steps` 24.00 at 30 s, 96.00 at 120 s)

| event | shell + ControlLayer, DT 0.02 s | full stack, `svc.tick()`, 10x | `measure_stack` (stamped) |
|---|---|---|---|
| true startup rate ≥ 1.0 DPM | 325.10 s | 326 s | — |
| indicated ≥ 1.0 DPM / `sur_high` | 326.76 s | 328 s | — |
| `sr_high_flux` (5e4 counts/s) | 357.76 s | 358.5 s | — |
| IR high-flux ROD STOP, 20 % | **397.56 s** | 398 s | — |
| reactor trip, `ir_high_flux`, 25 % | **398.80 s** | 399 s | **399 s** (5m39s + 60 s settle) |

All times **absolute engine simTime** (settle included). The `measure_stack` run is the stamped
artifact: full stack M4+M5+M6, `svc.handleCommand`, seed 4660, 10x, settle 60.0 s,
`REACTOR TRIP at 5m39s — ir_high_flux`.

Shell vs full stack, same reference, same rod speed: **0.44 s at the rod stop, 0.20 s at the trip**
— inside one 1.0 s broadcast sample.

**The other agent's two numbers, both CONFIRMED.** Trip at absolute simTime **399 s**: reproduced
to the second. Rod rate **0.803 steps/s**: the constant is 48/60 = 0.8000 exactly and my own
`rod_steps` regression gives 0.79999999; 0.803 is within that agent's sampling.

### The 2026-09-08 tree's rod speed restored (`ROD_SPEEDS.normal = 0.702`, the only change)

This is the demonstration: one knob, turned back, and all three filed tables reappear.

| event | shell (group N discipline) | filed by group N | full stack (alarm-probe discipline) | filed by the alarm probe |
|---|---|---|---|---|
| true ≥ 1.0 DPM | 365.24 s | **365.24 s** | 366.0 s | **366.0 s** |
| indicated / `sur_high` | 367.04 s | **367.06 s** | 368.0 s | **368.0 s** |
| `sr_high_flux` | 396.96 s | **396.80 s** | 397.5 s | **397.5 s** |
| IR rod stop | 442.48 s | **442.48 s** | 442.5 s | — |
| trip | 444.32 s | **444.32 s** | 444.5 s | — |

The 0.02 s and 0.16 s residuals in the shell column are the seed (I passed `0x1234`; group N
passes none). Re-run with no seed, the gate's own printed line is reproduced to the digit:
`crossed 1 DPM at 325.10 s, alarm at 326.76 s` — gate output today, and my reconstruction.

### #661's ride, reconstructed (its file is GONE — this is a reconstruction, not the original)

Same full-stack run as the column above, reporting time as **ticks × 1.000 s since `rod_start`**:

| event | true, relative | tick-counted | **filed by #661** |
|---|---|---|---|
| 1 DPM | 306.0 s | 306 s | **306 s** |
| `sr_high_flux` | 337.5 s | 338 s | — |
| IR rod stop | 382.5 s | **387 s** | **387 s** |
| trip | 384.5 s | **391 s** | **391 s** |

Three filed figures, three exact hits, from one reconstruction that was not fitted to them —
the tick clock was added to test the hypothesis, not to match the numbers.

---

## Per-number adjudication

| filed number | verdict | why |
|---|---|---|
| #661 ride, 1 DPM **306 s** | **RIGHT as written, WRONG as compared** | A correct relative-to-`rod_start` figure set beside two absolute-from-boot figures. Absolute equivalent on its own tree: 366.0 s. |
| #661 ride, rod stop **387 s** | **WRONG, by two compounding errors** | Reference (−60 s) and tick-clock inflation (+4.5 s). True on that tree: 382.5 s relative, 442.5 s absolute. |
| #661 ride, trip **391 s** | **WRONG, same two** | True: 384.5 s relative, 444.5 s absolute. Inflation is larger (+6.5 s) because more of the interval is transient-cadence. |
| alarm probe, 1 DPM **366.0 s** | **RIGHT** | Absolute. Reproduced exactly. |
| alarm probe, `sur_high` **368.0 s**, `sr_high_flux` **397.5 s** | **RIGHT** | Reproduced exactly. |
| group N, **365.24 / 367.06 / 396.80 / 442.48 / 444.32 s** | **RIGHT** | Absolute; the clock counts the settle (group O's own check says so in words). Reproduced to the step. |
| #661 ride, P-6 **279 s**, 1e5 counts/s **344 s**, the fast/slow/casualty columns, the `low_power` ride | **NOT RE-MEASURED** | Out of scope; they carry the same two errors by construction but I did not run them. |
| new agent, trip **399 s** absolute | **RIGHT** | Independently reproduced at two layers. |
| new agent, rod rate **0.803 steps/s** | **RIGHT**; the issue's 0.702 is superseded | `ROD_SPEEDS.normal` is 48/60 since #668. |

---

## The six candidate causes

1. **Settle handling / reference point — CONFIRMED. Carries the whole 60 s.** Demonstrated by
   reporting one identical run both ways: 306.0 relative, 366.0 absolute. Candidate 5 (#761's
   "the reference point") is the *same* cause, and it is the one that matters — the settle was
   never mis-*handled*; all three settled 60 s. Only the reporting differed.
2. **Clock re-assertion / attention-stop dropout — REFUTED for this fixture.** Demonstrated:
   `attentionStops` ON, the dropout genuinely fires (`timeAcceleration` 10 → 1, detected), and
   **every event time is unchanged to 0.0 s**. Two reasons. (a) The dropout changes sim-seconds-
   per-tick, not the plant, so anything reading `svc.simTime` is immune. (b) The first
   drop-eligible alarm is the trip itself — `sur_high` is a `caution` and since #655 only
   `critical`/`warning` arrivals drop the clock. Also measured: `advanceCycles(1)` with
   `running`/`timeAcceleration` re-asserted every iteration is **identical to `tick()`** on every
   event, so the alarm probe's extra discipline bought nothing here.
   **But its NEIGHBOUR is the second real cause** and the issue did not name it: the same
   sim-seconds-per-tick class, arriving via `broadcastMs` 100 → 50 ms (`TRANSIENT_MS`), which
   hurts a tick-counting harness only. That is the +4.5 / +6.5 s.
3. **Layer — REFUTED as a carrier.** Shell-under-kernel vs full stack through `SimulationService`,
   same rod speed, same reference: **0.44 s** at the rod stop, **0.20 s** at the trip, both inside
   one broadcast sample. The command path also differs (`engine.applyCommand` vs
   `svc.handleCommand` → instructor → ControlLayer) and does not move this ride. The layer rule
   still binds generally — it just did not bite here, because nothing on this ride depends on an
   automation channel.
4. **Rod-drive speed resolution — REAL, but NOT a cause of the 2026-09-08 disagreement.** No
   harness fell through to a default: all three ran at the tree's own 0.702 steps/s, before
   `950fbad2` landed at 22:13 that night. It IS why every filed figure is now stale — 44.9 s at
   the rod stop. Demonstrated in both directions.
5. **The reference point (#761's pattern) — CONFIRMED; it is cause 1.** The pattern did repeat.
6. **`engine.seed` / the seed path — REAL as a defect class, carries none of this.** MEASURED on
   this ride: `0x1234` vs the default seed moves the indicated 1 DPM crossing **0.20 s** and moves
   truth, the rod stop and the trip **0.00 s**. Three further facts worth keeping:
   - group N passes **no seed at all**, so "one fixture, seed `0x1234`" was never true of it;
   - `parseInt("0x1234", 10)` is `0`, and `0` is falsy, so `PWRInstruments` falls through to
     `0x9E3779B9` — the misreading substitutes the **default** seed, not seed 0, which is a
     quieter wrong answer than it looks;
   - `engine.seed` reads 4660 today only because of another agent's **in-flight uncommitted**
     #769 fix (+8 lines in `engines/pwr2/pwr2_shell.js`). On 2026-09-08 it was `undefined`.

---

## What I did NOT verify

- **I never read the two original scratch files** — `scratchpad/661/ride.js` and
  `scratchpad/661/alarms.js` are gone. The tick-counted-clock finding is an INFERENCE that
  reproduces all three of that ride's filed figures (306 / 387 / 391) exactly from its described
  discipline. It is a reconstruction, and it could in principle be a different mechanism with the
  same signature.
- **#661's other numbers** — P-6 at 279 s, 1e5 counts/s at 344 s, the fast / slow /
  `continuous_rod_withdrawal` columns, the peak power and peak fuel figures, and the second
  `low_power` start (88 %, 1208 °F (654 °C), 302 s). Not re-measured.
- **The setpoints themselves** — I asserted no value for the 20 % rod stop or the 25 % trip, and
  did not check whether either moved since 2026-09-08.
- **Whether anything else in the engine changed since 2026-09-08.** All I showed is that THIS ride
  is unchanged once the rod speed is put back; that is strong for this fixture and says nothing
  about any other.
- **The full `run_pwr2_shell`** — I ran `--grp=N --no-mutations`, which is FORCED NON-ZERO and is
  not a baseline. No aggregate gate was run; no source file, baseline or issue state was changed.
- **Nothing in a browser.** No UI, board or checklist claim is touched here.
