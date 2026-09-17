# The four 1/M settle rungs, re-measured — `pwr_startup` steps 5 to 8 (#761)

**Tree: `4e51866c` (develop), 2026-09-17.** Everything below was measured on that commit. Both
figures #761 carries were INHERITED and neither was trusted; both were re-measured from scratch.

> **The tree has moved since both inherited figures were taken** (`356c7033`, 2026-09-15 — 21
> commits back). Two of those commits touch the plant: `e43da8f0` (the pressurizer spray reads a
> lagged error) and `e2e8abad` (the Mode 5 pressure setpoint seed). Neither touches the source
> range, the kinetics or the steadiness evaluator, and no commit in that span touches
> `engines/pwr2/pwr2_kinetics.js`, `pwr2_sources.js`, `pwr2_instruments.js` or `pwr2_reactor.js`.
> `layers/instructor_layer.js` moved once (`fd5750c9`) and `ui/manual_procedures.js` twice, none
> of them in the steadiness path. **The numbers below are this tree's, not `356c7033`'s**, and the
> replay half reproduces `356c7033`'s filed figures to within 4 s, which is the evidence that the
> two trees agree on this channel.

## 1. The answer in one paragraph

**The replay's figures are right and the layman's are wrong — but the replay's figures were filed
against the wrong reference point, which is what made them look irreconcilable.** `223 / 226 /
281 / 507 s` are plant-seconds from the **rod burst being issued** (= the step becoming active),
not from the rods stopping. Subtract the rod travel — 118 / 79 / 39 / 18 s — and the settle from
rod-stop is **105 / 146 / 246 / 491 s**. The live path, driven through the service and the
instructor's own grading, agrees with the replay to within 15 s on every rung, and 1x agrees with
10x to within 9 s. The layman's `~400 / ~1,000 / ~350 / met` are wall-clock estimates scaled by an
acceleration the sim was not actually running at; no route reproduces a step-6 settle above 288 s.

## 2. Method

Two harnesses, both full-stack, both driving `tick()` directly — never `svc.start()`, which
advances in wall time.

- **LIVE** — `RD.SimulationService` + `RD.InstructorLayer` Path 3 checklist on `pwr2` /
  `hot_zero_power`, `start_checklist pwr_startup`, the pre-rung steps played as authored, each
  rung's rod burst issued on step entry, `plot_1m_point` pressed when the third row latches, and
  every row's first-`met` time read **off the live checklist snapshot** (`s.instructor.checklist.
  accs[k].met`) — i.e. the instructor's own grading cadence, not a second sampler. The step
  advances as soon as its rows latch, which is the player's route.
- **REPLAY** — the `test/procedures_harness.js` pattern exactly: `ACCEL` 10, one tick = 1.0 s of
  sim, each step's `cmd` issued at step entry, the step then held for its **full authored `hold`**
  (300 / 300 / 420 / 600 s — the replay never advances early), `op:'steady'` graded through
  `RD.InstructorLayer.gradeSteady` with a fresh per-step bag.

Rod-stop is taken as the last broadcast on which `true_state.rod_steps` changed. Rod travel checks
out against MED's 48 steps per minute: 94 steps = 117.5 s, 63 = 78.8 s, 31 = 38.8 s, 14 = 17.5 s,
against 118 / 79 / 39 / 18 s observed.

## 3. The reconciled table

Authored rod bursts (94 / 63 / 31 / 14 steps at MED), seed 42. **Two reference columns, because
the two inherited figures used different ones.**

| rung | bank | rod travel | STARTUP RATE row | **steady, from ROD-STOP** | **steady, from BURST** |
|---|---|---|---|---|---|
| | | | live 1x, from rod-stop | live 1x · live 10x · replay | live 1x · live 10x · replay |
| step 5 | 0 → 94 | 118 s | 15 s | **106 · 109 · 105** | 223 · 227 · 223 |
| step 6 | 94 → 157 | 79 s | 64 s | **148 · 153 · 146** | 227 · 232 · 225 |
| step 7 | 157 → 188 | 39 s | 143 s | **244 · 247 · 246** | 283 · 286 · 285 |
| step 8 | 188 → 202 | 18 s | 318 s | **497 · 506 · 491** | 515 · 524 · 509 |

**The filed replay figures `223 / 226 / 281 / 507` line up with the BURST column** (measured
`223 / 225 / 285 / 509`, max difference 4 s), not with the rod-stop column. That is the whole of
the replay half of the disagreement.

> **A CORRECTION OWED IN SOURCE, not made here** (this was a measurement pass). The step-8 comment
> in `ui/manual_procedures.js` says *"the accept lands 506 s after the rods stop"* and the same
> block's table header reads `counts steady (3 %/120 s)` with no origin stated. Measured: 491 s
> after the rods stop, 509 s after the burst. Step 8's rod travel is only 18 s, so the error is
> small there and nothing caught it — but it is the prose that made #761 read all four figures as
> rod-stop-referenced. **Recommend: label the table's column "from the burst" and correct the
> step-8 sentence to 509 s from the burst / 491 s from rod-stop.**

## 4. Acceleration is not the cause (the cheapest hypothesis, killed)

Authored route, seed 42, from rod-stop: **106 / 148 / 244 / 497 s at 1x** against
**109 / 153 / 247 / 506 s at 10x** — a maximum difference of 9 s, 1.8 %.

The mechanism is why: `gradeSteady` samples on a **sim-time** gap of `window / 120` = 1.0 s. At 1x
that is one sample every ten broadcasts; at 10x one per broadcast. The ring holds the same ~120
samples over the same 120 plant-seconds either way, which is exactly what the predicate's own
design note claims and what this measurement confirms independently.

## 4b. 60x and 600x, measured

Live path, authored bursts, seed 42, seconds from rod-stop to the steady row:

| accel | broadcast = | rung 5 | rung 6 | rung 7 | rung 8 | leg sim time | wall per rung |
|---|---|---|---|---|---|---|---|
| 1x | 0.1 s | 106 | 148 | 244 | 497 | 1,250 s | 106–497 s |
| 10x | 1.0 s | 109 | 153 | 247 | 506 | 1,295 s | 11–51 s |
| 60x | 6.0 s | 132 | 168 | 270 | 528 | 1,518 s | 4–9 s |
| 600x | 60 s | 480 | 480 | 660 | 1,020 | 4,560 s | 1–2 s |

**60x agrees with 10x within 23 s**, and that gap is about the size of the timing resolution — one
broadcast is 6 plant-seconds and the rate row's `~0 ± 0.02` band is sampled at that spacing. So the
layman's 60x step 8 is not a different regime in any way that matters.

**600x is a different regime and the numbers double.** At 60 s per broadcast the 120 s window holds
two or three samples, `gradeSteady`'s `na >= 2 && nb >= 2` half-mean test fails, and the deliberate
fallback compares the ends of the covered span — which the evaluator's own note says is an over-read
of the change, conservative by design. Measured cost: the four rungs burn **4,560 s of plant** instead
of 1,295 s. **Not a player-facing defect** — wall time still falls to 1–2 s per rung, and a longer
settle makes the 1/M prediction's inputs better, not worse — but it is worth knowing that the fallback
roughly doubles the plant time the ladder consumes, and the 60 s resolution means those four figures
are quantised, not precise.

## 5. Where the layman's ~1,000 s came from

Five routes measured; **none produces a step-6 settle near 1,000 s.** Step 6, from burst:

| route | step 6 settle |
|---|---|
| authored bursts, 10x | 232 s |
| authored bursts, 1x | 227 s |
| replay (full holds) | 225 s |
| **top of the authored rod band** (100 / 175 / 198 / 205) | 288 s |
| **the layman's OWN rod ladder** (146 / 152 / 199 / 199, read off their leg-2 log) | 125 s |

The overshoot hypothesis is refuted twice over: driving to the top of the authored band lengthens
step 6 to 288 s, not 1,000, and driving the layman's *actual* reported positions **shortens** it to
125 s, because from 146 they only moved 6 steps.

Three things in the layman's own report, `Diagnostic/CHECKLIST_PLAYTEST_2026-09-15_LAYMAN.md`,
explain the figure:

1. **Their two columns disagree with each other.** Steps 5 and 6 are both logged as *"100 s wall at
   10x"*, yet the plant-second column reads ~420 s for one and ~1,020 s for the other — a factor of
   2.4 between two rows built from the same wall figure. The wall times were eyeballed, not timed.
2. **They say so themselves**, verbatim: *"I read the bar wrong at least once, believing I was at
   10x when I was at 1x."*
3. **The sim makes that easy, by design.** Measured on this tree with the player's default
   settings: **every checklist step advance snaps the clock back to 1x.**
   `SimulationService._attentionStop` returns `'step'` (`layers/simulation_service.js`:1091,
   deliberate, #622). Probe — 10x requested on `hot_zero_power` with `attentionStops` at its
   default: dropped to 1x at t = 7.1 s and stayed there for all **11,907** ticks of the leg
   (11,903 of them below the requested 10x). A player who does not re-press the speed button after
   each rung spends the settle at 1x.

**So the layman's complaint is real and their number is the thing that is wrong.** At 1x — which
is where the step advance puts them — step 6's settle is **227 seconds of real time**, which is
2.3x the *"100 seconds of real time staring at a static row"* they filed. The grievance is
understated; only the plant-second conversion is wrong.

**Step 8 "already met on arrival" IS reproducible.** On the layman's own ladder (no rod motion at
step 8, counts already past 7.0e3), rows a and b latch 3 s into the step and the rung is then
limited purely by the window: **123 s from step entry**, i.e. the 120 s floor plus the
`ACC_STABLE_N` debounce.

## 6. Is the 120 s / 3 % predicate correctly tuned for a live player?

**Measured sweep**, replay route, seed 42, all four rungs. Seconds from rod-stop to accept, with
the drift % at the accepting broadcast in brackets. `never` = did not accept inside that step's
authored hold.

| rung | 2 % / 60 s | 2 % / 120 s | 2 % / 180 s | 3 % / 60 s | **3 % / 120 s (shipped)** | 3 % / 180 s | 5 % / 60 s | 5 % / 120 s | 5 % / 180 s |
|---|---|---|---|---|---|---|---|---|---|
| 5 | 54 (1.96) | 113 (1.98) | 170 (1.92) | 49 (2.82) | **105 (2.97)** | 162 (2.75) | 41 (4.84) | 95 (4.79) | 148 (4.87) |
| 6 | 96 (1.99) | 167 (1.99) | **never** | 77 (3.00) | **146 (2.96)** | 205 (2.92) | 59 (4.86) | 122 (4.93) | 179 (4.94) |
| 7 | 183 (1.99) | 285 (2.00) | 357 (1.98) | 149 (2.97) | **246 (2.99)** | 319 (2.96) | 111 (4.99) | 197 (4.94) | 269 (4.93) |
| 8 | 400 (1.99) | **never** | **never** | 316 (3.00) | **491 (3.00)** | **never** | 214 (4.99) | 379 (4.98) | 498 (4.96) |

Three findings:

1. **The predicate is TOLERANCE-limited, not window-limited.** Drift at accept is 2.96–3.00 % on
   every rung: it latches the instant the drift crosses the band. The window sets the sample
   density and the minimum dwell; **the tolerance is what sets the wait.** The 120 s floor binds on
   exactly one measured case — a rung with no rod motion (the layman's step 8, §5).
2. **It was NOT fitted to a fixture that differs from live play.** Live and replay agree within
   15 s on all four rungs, and 1x agrees with 10x within 9 s. **#761's point 3 is refuted** — the
   constants were tuned against a fixture that does reproduce what a player experiences.
3. **2 % is disqualified.** At 2 % / 120 s rung 8 never accepts inside its 600 s hold, and rung 6
   never accepts at 2 % / 180 s. Tightening the band soft-locks the ladder unless the holds grow
   with it.

### Recommendation — leave the predicate as ruled

**Recommend option A. The measurement does not support a change to the constants**; what it
supports is a progress cue (§7). The owner has ruled on this predicate twice, and nothing here is
a reason to re-open it.

| | option | what it costs | measured effect |
|---|---|---|---|
| **A — recommended** | **leave 3 % / 120 s** | nothing | waits stay 105 / 146 / 246 / 491 s from rod-stop |
| B | window 120 s → **60 s**, tolerance unchanged | halves the root-n noise averaging the #752 trap motivated | waits **49 / 77 / 149 / 316 s** — roughly half |
| C | tolerance 3 % → **5 %**, window unchanged | teaches "steady" as a plant still moving 5 % per two minutes | waits 95 / 122 / 197 / 379 s |
| D | tolerance 3 % → **2 %** | **soft-locks rungs 6 and 8** against their authored holds | rung 8 never accepts |

**Why A over B**, the only close call: B is the honest lever if the waits must come down, because
the wait is tolerance-limited and B leaves the tolerance alone — it just samples the same claim
over a shorter span. And `sr_counts_cps` is the documented no-instrument-twin channel whose
measured detrended scatter is 0.0019 % of reading, 1,500x under the band, so the averaging buys
almost nothing *on this channel*. **But the averaging is not there for this channel** — it is
there because the predicate is general and an instrument channel with real noise will use it, and
halving the window halves that protection for every future author. A cue makes the wait legible
without changing what "steady" means, which is the better trade.

**What would change my mind:** a ruling that the four rungs are too slow as a matter of pacing
rather than of correctness. That is a judgement about the leg, not a measurement, and it is his.
**If there is no reply, the predicate stays as it is** and nothing in this document is acted on.

## 7. Does step 6's wait need a progress cue?

**Yes — and step 6 is not the worst rung. Step 8 is**, at 491 s from rod-stop against step 6's
146 s. The cue is owed on all four.

Measured facts behind that:

- The row draws one static string — *"Keep waiting until SOURCE RANGE has stopped climbing as
  well"* — with no countdown, no bar, and no live number.
- The player is at **1x** after every step advance unless they re-press the speed button (§5.3), so
  the real-time cost of the settle is the plant-second figure: **227 s on step 6, 509 s on step 8.**
- **The data for a cue already exists and is already computed every broadcast.**
  `InstructorLayer.gradeSteady` returns `{ met, drift, value, graded_by, covered, n }` and both
  runtimes keep only `met`. A cue costs no new physics, no new sampling and no new state: while
  `!covered`, the window is filling and the remaining seconds are known exactly
  (`window - (t - s[0].t)`); once covered, `drift` against `pred.v` is a genuine approach number.
- It also answers the *"is this stuck or is it waiting?"* question the same reviewer raised against
  the Confirm-Mode-N steps, which is the same defect in a different row.

This is a UI change, it is scoped by the owner, and it is **not** a tuning question — it does not
touch the ruled predicate.

## 8. What was NOT verified

- ~~Not measured above 10x~~ — **measured after the first draft, see §4b.** What remains untested
  is the WARP tier's own lockout behaviour, which is `run_warp_tier`'s subject, not this pass's.
- **Not measured in a browser.** All of this is Node, full stack, `tick()`-driven. The rendered
  panel, the speed bar's green-fill-versus-cyan-outline confusion, and the checklist log's scroll
  position are untouched by this pass.
- **The layman's button timings were not reproduced.** They held WITHDRAW for 20 / 7 / 6 s of wall
  at a claimed 10x; this pass drove to their *reported end positions* (146 / 152 / 199) instead, so
  it reproduces where their rods ended up, not how they got there.
- **Three seeds only (1, 7 and 42).** Rung 8 is the seed-sensitive one: **452 to 506 s** from
  rod-stop across the three seeds and the two routes (replay 475 / 452 / 491, live 10x 495 / 463 /
  506). Rungs 5 to 7 vary by under 6 s across all three — replay rung 5 is 105 s on every seed.
- **The `'step'` speed snap was measured on this tree with the default settings; it was not
  confirmed to be what the layman actually hit.** Their report says they misread the bar; it does
  not say why.
- **No source was changed**, so nothing here is regression-protected. The correction owed in §3 and
  the cue in §7 are both unbuilt.
