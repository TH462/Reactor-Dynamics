# What an earlier 1/M check-off buys, and what the 1x step snap costs (#761)

**Tree `ed98c7bc` (develop), 2026-09-17.** Full stack — `RD.SimulationService` + `RD.InstructorLayer`
on PWR2 — driven by `tick()` directly, never `svc.start()`. One broadcast = 1.0 s of plant time at
the 10x used throughout. Seeds 1, 7 and 42. Harnesses in this session's scratchpad
(`acc/accuracy_761.js`, `acc/perrung_761.js`, `acc/floor_761.js`, `acc/snap_761.js`).

> **PROVENANCE.** Everything below with a number attached is MEASURED on this tree in this pass
> unless the line says INHERITED. Two figures the brief handed me were re-measured and both moved:
> true criticality (inherited "control bank 208 of 627" → **measured 207.1 to 207.7**) and
> differential rod worth (inherited 7.64 pcm/step → **measured 7.58**). The settle durations from
> `Diagnostic/SETTLE_DURATIONS_2026-09-17.md` were re-measured here and reproduce within 2 s.
>
> **EVERY duration in this document is seconds of PLANT time from ROD-STOP** — the last broadcast
> on which `true_state.rod_steps` changed — unless a column says otherwise. That distinction is
> what made #761's two filed figures look irreconcilable, so it is stated on every table.

---

## 1. The owner's question, answered in one paragraph

*(OWNER, 2026-09-17: "How much of a difference in accuracy of the critical point if we just have
them check it earlier?")*

**None that is measurable.** The 1/M panel's final prediction — the one step 9 acts on — lands
between 207 and 211 on the 627-step control bank in **every one of the 39 configurations measured**,
against a true criticality of 207.1 to 207.7. The shipped 3 %/120 s predicate carries a mean
absolute error of **1.63 bank steps**. The fastest setting tested, which removes the steadiness
requirement entirely and cuts the ladder's wait by **47 %** (993 s to 526 s of plant time), carries
**1.17**. The difference between settings is no larger than the difference between seeds inside one
setting: the shipped predicate alone reads 210 / 208 / 209 on three seeds. At **7.58 pcm per bank
step** (measured), the whole spread is 8 to 17 pcm, and the step's own instruction — stop 3 steps
short of the prediction and walk up in single taps — absorbs all of it.

**The wait is not buying accuracy. It is buying nothing.**

---

## 2. What the fit actually uses — the owner's own point, verified

*(OWNER, 2026-09-17: "I do know that because the fit line is only three steps at maximum only the
last three steps matter")*

**Confirmed on the built object, not from the source comment.** `FIT_WINDOW = 3` in
`ui/panels/one_over_m.js`. The `pwr_startup` ladder plots **five** points: a baseline at step 4
(bank 0, `y` = 1.0 by construction) and four at steps 5 / 6 / 7 / 8 (bank 94 / 157 / 188 / 202).
The harness records `points.length` = 5 and the number of points the last fit consumed = 3.

**So the final prediction is fitted from the rung 6, 7 and 8 points only. The baseline and the
rung 5 point are outside it and cannot affect it.** Rung 5's 105 s of settle buys nothing for the
number the player acts on — measured directly in §4, not assumed.

---

## 3. The trade table — global setting, all four rungs together

Seed 42. Seconds of plant time from **rod-stop** to the step's acceptance, per rung, then the
prediction the panel draws after the step-8 plot. True criticality this seed: **207.07**.

| setting | rung 5 | rung 6 | rung 7 | rung 8 | total wait | panel's final prediction | error, bank steps |
|---|---|---|---|---|---|---|---|
| 2 %/120 s | 113 | 168 | 282 | 591 | 1,154 s | 208 | +0.9 |
| 3 %/60 s | 49 | 78 | 153 | 331 | **611 s** | 210 | +2.9 |
| **3 %/120 s — SHIPPED** | **105** | **147** | **244** | **497** | **993 s** | **210** | **+2.9** |
| 5 %/60 s | 41 | 60 | 129 | 318 | 548 s | 208 | +0.9 |
| 5 %/120 s | 95 | 123 | 201 | 380 | 799 s | 208 | +0.9 |
| 7 %/120 s | 86 | 112 | 172 | 327 | 697 s | 208 | +0.9 |
| 10 %/120 s | 76 | 102 | 145 | 320 | 643 s | 210 | +2.9 |

**The wait falls by 45 % from the tightest to the loosest and the prediction does not move outside
208 to 210.** It is not even monotone: 5 % and 7 % both read 208 while the shipped 3 % reads 210.
That is noise in the count rate at the sampled instant, not a trend, which is the first sign that
the tolerance is not the thing setting the accuracy.

---

## 4. Per-rung isolation — which rung is buying the accuracy?

One rung's tolerance changed, the other three left at the shipped 3 %/120 s. Three seeds.
Error is against **that seed's own** measured true criticality (207.07 / 207.33 / 207.73).

| configuration | total wait, s (seed 42 / 1 / 7) | final prediction | error, bank steps | **mean abs error** |
|---|---|---|---|---|
| **SHIPPED — all four at 3 %/120 s** | 993 / 981 / 957 | 210 / 208 / 209 | +2.9 / +0.7 / +1.3 | **1.63** |
| rung 5 → 10 %/120 s | 970 / 956 / 923 | 208 / 209 / 210 | +0.9 / +1.7 / +2.3 | 1.63 |
| rung 5 → 10 %/60 s | 890 / 874 / 849 | 209 / 211 / 209 | +1.9 / +3.7 / +1.3 | 2.30 |
| rung 6 → 3 %/60 s | 931 / 906 / 873 | 209 / 209 / 208 | +1.9 / +1.7 / +0.3 | 1.30 |
| rung 6 → 10 %/120 s | 955 / 939 / 897 | 208 / 209 / 207 | +0.9 / +1.7 / −0.7 | 1.10 |
| rung 7 → 3 %/60 s | 893 / 877 / 852 | 209 / 208 / 209 | +1.9 / +0.7 / +1.3 | 1.30 |
| rung 7 → 10 %/120 s | 885 / 871 / 847 | 209 / 209 / 209 | +1.9 / +1.7 / +1.3 | 1.63 |
| rung 8 → 3 %/60 s | 804 / 802 / 779 | 210 / 208 / 210 | +2.9 / +0.7 / +2.3 | 1.97 |
| rung 8 → 10 %/120 s | 804 / 802 / 765 | 210 / 208 / 209 | +2.9 / +0.7 / +1.3 | 1.63 |
| rung 8 → 2 %/120 s (TIGHTER) | 1,109 / 1,088 / 1,039 | 209 / 207 / 209 | +1.9 / −0.3 / +1.3 | 1.17 |
| loose on 5, 6 and 7; shipped on 8 | 763 / 754 / 731 | 209 / 208 / 209 | +1.9 / +0.7 / +1.3 | 1.30 |
| all four at 3 %/60 s | 611 / 610 / 592 | 210 / 209 / 208 | +2.9 / +1.7 / +0.3 | 1.63 |
| **all four STEADY ROWS REMOVED** | **526 / 526 / 509** | 209 / 207 / 209 | +1.9 / −0.3 / +1.3 | **1.17** |

**Three findings, all measured:**

1. **Rung 5's wait costs nothing and buys nothing — as the owner predicted.** Loosening it to
   10 %/120 s leaves the final prediction at 208 / 209 / 210 against the shipped 208 / 209 / 210
   reordered; mean absolute error identical at 1.63. Its point is outside the final fit and the
   measurement agrees with the arithmetic.
2. **No rung individually buys accuracy either.** Every single-rung change lands between 1.10 and
   2.30 mean absolute bank steps, and the shipped baseline is 1.63 — in the middle. Tightening
   rung 8 to 2 % (an extra 112 s of wait per rung) buys 0.46 of a bank step, or **3.5 pcm**.
3. **The one config that was measurably WORSE is a fast rung 5** (10 %/60 s, 2.30). It is worse
   because the loose accept plots rung 5's point on a count rate still climbing, and although that
   point is outside the final fit, accepting the step early also starts rung 6's burst earlier, on a
   slightly different plant. The effect is real and it is smaller than the seed scatter.

---

## 5. The floor: a DIFFERENT row is what actually holds rung 8

The question "how early can they check it?" has a hard answer that has nothing to do with the
steadiness tolerance. Setting the steady row to 1000 %/60 s — so it latches as soon as its window
covers and whatever remains is imposed by the other rows — gives:

| rung | counts-above-threshold row | **STARTUP RATE within 0.02 DPM row** | steady row as shipped | shipped accept |
|---|---|---|---|---|
| 5 | −18 / −17 / −16 (met during rod travel) | **11 / 11 / 11** | 105 / 105 / 105 | 105 / 105 / 105 |
| 6 | 1 / 2 / 4 | **58 / 55 / 55** | 147 / 147 / 146 | 147 / 147 / 146 |
| 7 | 21 / 22 / 26 | **135 / 134 / 130** | 244 / 242 / 239 | 244 / 242 / 239 |
| 8 | 39 / 42 / 50 | **308 / 308 / 275** | 497 / 487 / 467 | 497 / 487 / 467 |

*(seconds from rod-stop, seeds 42 / 1 / 7. DPM = decays per minute, the startup-rate unit.)*

**The startup-rate row is already asserting the same physical fact the steady row asserts, and it
gets there first.** "STARTUP RATE back to zero within 0.02 DPM" IS the statement that the count rate
has stopped climbing. The steady row adds **94 / 90 / 110 / 190 s** on top of it, and those 484
seconds are the whole of what "waiting longer" costs the player.

Corollary the owner should know: **rung 8 cannot be brought below about 275 to 310 s from rod-stop
by any change to the steadiness predicate**, because the startup-rate row holds it there. A
configuration at 10 %/120 s and one at 3 %/60 s produced the *identical* 308 s accept on seed 42 for
exactly that reason.

---

## 6. The intermediate predictions a player can read on the way up

The panel draws a prediction after every plot, and the checklist first tells the player to read it
at step 6 (*"Press Plot point, then read the predicted critical position on the panel"*). Shipped
setting, three seeds, against true 207.1 to 207.7:

| after plotting | fit uses | prediction (seed 42 / 1 / 7) | error |
|---|---|---|---|
| rung 5 | baseline + rung 5 (2 points) | 235 / 259 / 212 | +5 to +52 |
| rung 6 | baseline + rungs 5, 6 | 223 / 233 / 219 | +11 to +26 |
| rung 7 | rungs 5, 6, 7 | 214 / 211 / 216 | +3.6 to +8.3 |
| **rung 8** | **rungs 6, 7, 8** | **210 / 208 / 209** | **+0.7 to +2.9** |

**The rung-5 intermediate is already wildly danger-side — up to +52 bank steps, or 394 pcm — at the
SHIPPED setting.** That is inherent to a two-point fit through the flat toe of the rod-worth curve
and is the exact effect the `FIT_WINDOW = 3` comment was written about; it is not caused by the
tolerance. Loosening rung 5 to 10 %/60 s moves it to 244 / 267 / 219 — further out on two seeds by
8 to 9 steps, closer on one by 7.

**So "loose on rung 5" does not make the intermediate misleading; it was already misleading.** But it
does make it slightly *more* so on most seeds, and that is the one argument against a per-rung
scheme — which is a second reason not to go that way, on top of it being the worst-scoring
configuration in §4.

---

## 7. Does an error of N bank steps matter operationally?

**Measured inputs:** differential rod worth at the criticality point **7.58 pcm per bank step**
(7.574 / 7.620 / 7.556 over the last ~5 steps of approach, three seeds). True criticality
**control bank step 207 of 627** (207.07 / 207.33 / 207.73).

**No, not at this plant's rod worth — not for any value measured here.** Every configuration predicts
between 207 and 211. The step tells the player to stop 3 steps short and walk up in single taps:

- prediction 210 → stop at 207 → **arrives at criticality**;
- prediction 208 → stop at 205 → **2 steps subcritical, 15 pcm, two more taps**;
- prediction 211 → stop at 208 → **1 step past, caught immediately by the startup rate**.

All three are the same evolution and the same instruction handles all three. The difference between
the shipped setting and the fastest one is **0.46 of a bank step, 3.5 pcm** — well inside the
single-tap resolution the procedure already works in.

**Where it WOULD matter:** a prediction *below* true criticality. Then "stop 3 steps short" puts the
operator 5 or more steps subcritical, the counts barely move, and the procedure teaches the
danger-side lesson backwards. **Not one of the 39 measured runs predicted below true criticality by
more than 0.3 of a step**, and the one that did (rung 6 at 10 %/120 s, seed 7, reading 207 against
207.73) is within the rounding of the panel's own readout.

---

## 8. Recommendation on Job 1

**What he is deciding:** whether the four 1/M settle rungs keep the 3 %/120 s steadiness row.

| | option | measured wait | measured accuracy | |
|---|---|---|---|---|
| **B — recommended** | **remove the steady row from all four rungs; let the STARTUP RATE within 0.02 DPM row be the acceptance** | **526 s (−47 %)** | mean abs error **1.17** bank steps vs shipped **1.63** | no measured cost; §5 says the two rows assert the same fact |
| A | leave it exactly as ruled | 993 s | 1.63 | nothing changes; the wait stays |
| C | per-rung tolerances — loose on 5, shipped on 6-8 | 890 s (−10 %) | **2.30 — the worst measured** | small saving, only change that moved error UP (§4.3, §6) |
| D | global 5 %/120 s | 799 s (−20 %) | 0.9 at seed 42, not swept on three seeds | a middle option if B is too big a step |

**Recommend B.** It is the largest saving and the only one with a physical argument rather than a
numerical one: the startup-rate row already says the count rate has stopped climbing, so the steady
row is the same assertion made a second time and more slowly. It also retires the row a fresh-reader
review flagged as having no progress cue, without needing the cue to be built.

**Explicitly NOT recommending C, the per-rung scheme that was the hypothesis.** The measurement
turned it down: it is the worst-scoring configuration of the thirteen and saves only 10 %.

**What would change my mind:** a route where the startup rate reads within 0.02 DPM while the counts
are still climbing — a very small rod burst, or a player who dribbles the rods out a few steps at a
time rather than taking the authored burst. **I did not measure that**, and it is the one case the
steady row would be earning its keep. If the owner wants B, the honest order is: measure that case
first, then remove the row.

**If there is no reply, nothing changes** — this was a measurement pass and no source was touched.

---

## 9. JOB 2 — what the 1x snap costs

*(OWNER RULING, 2026-09-17: selected "Measure what it costs across both legs first" over changing
the behaviour or leaving it.)*

**Mechanism** (read, then measured): `SimulationService._attentionStop` returns `'step'` on every
checklist index move (`layers/simulation_service.js`:1091, deliberate since #622), and lines 781-783
clamp `timeAcceleration` to 1.0. It is **one-shot** — the clock stays at 1x until the player presses
a speed button again. Reproduced directly: 10x selected, step 1 checks off at broadcast 3, and
broadcast 4 reads `time_acceleration` 1.

### 9.1 Whole-leg cost

Seed 42, `attentionStops` and `speedHolds` at their shipped defaults, player selects 10x once at the
start. **Real time = broadcasts x 0.1 s** — one broadcast is 0.1 s of the player's life whatever the
acceleration, which is exactly why the snap is expensive.

| leg | mode | broadcasts | **REAL time** | plant time | speed presses |
|---|---|---|---|---|---|
| `pwr_startup` | **snap — SHIPPED** | 32,621 | **3,262 s = 54.4 min** | 3,266 s (0.91 h) | 1 |
| `pwr_startup` | carry (re-press each step) | 3,345 | **335 s = 5.6 min** | 3,330 s (0.92 h) | 18 |
| `pwr_startup` @ 60x | **snap — SHIPPED** | 32,654 | **3,265 s = 54.4 min** | 3,289 s | 1 |
| `pwr_startup` @ 60x | carry | 628 | **63 s = 1.0 min** | 3,665 s (1.02 h) | 18 |
| `pwr_heatup` | **snap — SHIPPED** | 202,138 | **20,214 s = 5.6 h** | 20,217 s (5.62 h) | 1 |
| `pwr_heatup` | carry | 35,157 | **3,516 s = 58.6 min** | 22,230 s (6.18 h) | 18 |
| `pwr_heatup` | re-press on ANY drop | 22,275 | **2,228 s = 37.1 min** | 22,229 s (6.17 h) | 37 |

**The cost of the snap, per playthrough, at a selected 10x:**
- **`pwr_startup`: 54.4 min instead of 5.6 min — 48.8 minutes lost.**
- **`pwr_heatup`: about 5.6 to 6.2 h instead of 58.6 min — roughly 4.7 to 5.2 hours lost.**

**And selecting a HIGHER speed buys the player nothing.** 10x and 60x both produce 54.4 min on the
startup leg, because under the snap the player is at 1x either way. The only thing 60x changes is
what they would have got had the speed carried: 1.0 min instead of 5.6 min.

> **Caveat on the heatup snap row, stated rather than buried.** Two steps (11 and 15) hit my
> harness's stall cap and were ticked by hand, so that run's plant total (20,217 s) is 9 % short of
> the carry run's natural 22,230 s. At 1x real time equals plant time, so the shipped figure is
> **5.6 to 6.2 h**; the range covers the artifact. The startup leg completed with no forced steps.

### 9.2 Per step — which ones actually cost anything

`pwr_startup`, 10x selected, real seconds. A step with a dwell under about 5 s loses nothing at all.

| step | plant s in step | REAL s, snap | REAL s, carry | **lost to the snap** |
|---|---|---|---|---|
| 1 | 3 | 0.4 | 0.4 | 0 |
| 2 (boron setpoint) | 0-3 | 0.4 | 0.4 | 0 |
| 3 | 0-3 | 0.4 | 0.4 | 0 |
| 4 (baseline plot) | 0-1 | 0.2 | 0.2 | 0 |
| **5 (1/M rung)** | 223-228 | 223 | 23 | **200** |
| **6 (1/M rung)** | 227-233 | 227 | 23 | **204** |
| **7 (1/M rung)** | 283-287 | 283 | 29 | **254** |
| **8 (1/M rung)** | 517-526 | 517 | 53 | **464** |
| **9** | 1,419-1,422 | 1,419 | 142 | **1,277** |
| 10 | 184 | 184 | 19 | 165 |
| 11 | 0-3 | 0.4 | 0.4 | 0 |
| 12 | 223-233 | 224 | 23 | 200 |
| 13 | 86-87 | 86 | 9 | 77 |
| 14 | 97-101 | 97 | 10 | 87 |
| 15, 16, 17 | 0-5 each | 1.6 total | 1.6 total | 0 |

**Nine of seventeen steps carry the entire cost; eight lose nothing.** And the biggest single loser
is **not** a 1/M rung: **step 9 alone costs 21.3 minutes**, more than all four settle rungs put
together (18.7 min).

`pwr_heatup`, the four steps that matter (real seconds in carry mode):

| step | plant s | REAL s, carry | note |
|---|---|---|---|
| 3 | 517 | 52 | full 10x |
| **9** | 2,588 | **1,548** | **effective 1.67x, not 10x — see below** |
| **11** | 17,858 | 1,787 | full 10x; the single longest step in the chain |
| 14 | 1,207 | 121 | full 10x |

**Step 9 of the heatup runs at an effective 1.67x even when the player re-presses at every step
boundary.** One `speed_snap` of reason `alarm` and one of reason `hold` were recorded inside it, and
re-pressing on *every* drop brought the leg from 58.6 min to 37.1 min — so **about 21 minutes of the
heatup's remaining cost is non-step attention stops inside step 9.** That is a different mechanism
from the one under measurement and **I did not attribute it fully.**

### 9.3 How many re-presses to keep the recommended pace

**Seventeen per leg** — one for every step advance — **34 across the two legs.** That is on top of
the speed changes the walkthrough itself asks for: `pwr_startup` step 2 (*"set the speed control to
600x"*), step 7 (*"the 60x is for the settle, not the pull... come back to 10x or 1x before you hold
WITHDRAW"*), step 8 (*"come back to 10x before the next step"*), and `pwr_heatup` step 11. So the
authored pacing expects roughly **5 deliberate** speed changes per chain; the snap adds **34
involuntary** ones.

### 9.4 A candidate defect I investigated and REFUTED

The clock dropped from 10x to 1x on every step advance with `metadata.speed_snap` **undefined** on
all 40 probed broadcasts — and `ui/app.js`:3274 is the code that prints that reason under the speed
buttons, precisely so the drop is not silent. That looked like the whole explanation for the
layman's *"I read the bar wrong at least once, believing I was at 10x when I was at 1x."*

**It is not a defect.** `checklist_check` calls `_assembleWithInstructor()` inside `handleCommand`
(`layers/simulation_service.js`:1320), so the snapshot carrying the stamp is that command's **return
value**, which my harness discarded. The cue does reach the user interface. **Not filed** — recorded
here so the next agent does not re-find it and file it.

---

## 10. Recommendation on Job 2

**What he is deciding:** whether the step-advance snap keeps costing the player their selected speed.
**Do not read any of this as a proposal to weaken #622's intent** — the clock must not run away at a
step needing attention, and every option below preserves that.

| | option | what it costs | measured effect |
|---|---|---|---|
| **B — recommended** | **remember the selected speed and restore it 3 to 5 s of REAL time after the step advance** | one timer | the player still gets the beat at the boundary; recovers 48.8 min on `pwr_startup` and ~5 h on `pwr_heatup` |
| A | leave it | nothing to build | the costs in §9.1 stand, every playthrough |
| C | drop only on steps that ask for an ACTION; carry on steps that are a WAIT | needs a per-step classification, though the data is already there — a step graded on a `steady` or threshold row is a wait | same saving as B, better fidelity, more to build and more to get wrong |
| D | give the step snap its own Settings toggle | smallest change of all | today it is folded into `attentionStops`, which also governs the scram and failure drops — so escaping the snap today means giving up the scram drop, a trade the player should not be asked to make |

**Recommend B.** It is one timer, it keeps the beat #622 was built for, and it removes a tax that is
measured at 48.8 min and ~5 h per chain. C is the better answer if he wants to spend more; D is worth
doing regardless of B or C, because the current coupling is itself a defect in the Settings.

---

## 11. What was NOT verified

- **Three seeds (1, 7, 42).** Every "mean absolute error" in §4 is a mean of three numbers. They are
  reported because the *spread* is the finding — but three samples cannot separate 1.17 from 1.63,
  and I do not claim they do. The honest statement is that **all thirteen configurations are
  indistinguishable within seed scatter**, and that is itself the answer to his question.
- **Only the AUTHORED rod ladder.** 94 / 63 / 31 / 14 steps at MED. A player who overshoots, or who
  dribbles the rods out a few steps at a time, was not measured — and §8 names that as the one case
  where the steady row might be earning its keep. **CLOSED 2026-09-17 by §12**, which measures the
  dribbled and small-burst routes: the case reproduces on rungs 5 and 6, and is worth 0.6 of a bank
  step in the conservative direction.
- **Not measured in a browser.** All of this is Node, full stack, `tick()`-driven. What the panel
  *renders*, the speed bar's own legibility, and the checklist log are untouched by this pass.
- **The heatup's step-9 non-step attention stops were seen, not attributed.** One `alarm` and one
  `hold` were recorded; ~21 min of real time hangs on them and I did not chase which alarm.
- **The heatup snap leg had two forced steps** (11 and 15), so its total is quoted as a range.
- **No gate was run and no source was changed**, so nothing here is regression-protected. Both
  recommendations are unbuilt and neither is acted on without a ruling.
- **`ui/manual_procedures.js` step 8 still carries the wrong reference point** — *"the accept lands
  506 s after the rods stop"*, measured here at 497 s from rod-stop / 515 s from the burst on seed
  42. That correction was owed by `SETTLE_DURATIONS_2026-09-17.md` §3 and is still owed; this pass
  did not make it either. **MADE 2026-09-17**, in the pass that added §12: re-measured independently
  at **496 s from rod-stop / 513 s from the burst command** (seed 42), and every duration in those
  four steps' comments now states its reference point. The same comment block's *"true critical 208
  of 627"* was stale for the same reason and is corrected to §3's 207.07 / 207.33 / 207.73.

---

## 12. THE UNMEASURED CASE, NOW MEASURED — a dribbled-rod route and a small-burst route

**Tree `1baf3fef` (develop), 2026-09-17, a later pass.** §11 named this as the one case where the
steady row might be earning its keep, and §8's recommendation was made without it. It is measured
here. Full stack, `hot_zero_power`, `tick()`-driven at 10x (one broadcast = 1.0 s of plant time),
the **instrument** startup-rate channel because that is what grades (Hard Rule 1, instruments not
truth), with the runtime's own five-evaluation acceptance debounce applied to every row.

**Every duration in this section is seconds of plant time from ROD-STOP** unless the column says
otherwise.

### 12.1 The question, stated so it can be answered yes or no

The steadiness row exists for the route where **STARTUP RATE reads inside its 0.02 DPM band while
the SOURCE RANGE counts are still climbing**. The rung's acceptance is ordered, so the row is only
reachable after the count floor has latched. The precise question is therefore:

> Is there a window, **after the rung's count floor latches and before the rods stop**, in which
> the absolute startup rate stays at or under 0.02 DPM for five consecutive evaluations?

If there is, a player can plot a point with the bank still moving and the counts still rising.

### 12.2 Yes — and the threshold ratio says it had to be

Steadiness at 3 % over a 120 s window is a **tighter** claim than 0.02 DPM. A startup rate of
0.02 decades per minute is 4.7 %/min, i.e. **9.6 % over a 120 s window**. So the band between 3 %
and 9.6 % per two minutes is a count-rate climb that the startup-rate row calls settled and the
steadiness row does not — **on any route, by arithmetic, not by luck**. What the route decides is
only whether the player is *in* that band while still moving rods.

### 12.3 Where it reproduces (seed 42)

Bank positions are on the 627-step control bank. "of final" is the count at the accept as a
percentage of the count the rung eventually settles at.

| route | rung | floor latches at | both rows satisfiable with the rods still moving? |
|---|---|---|---|
| authored bursts 94/63/31/14 | 5, 6, 7, 8 | bank 84 / 157 / 188 / 202 | **no** — on all four |
| small bursts, 10 steps / 30 s | 5 | bank 80 | **YES** — 3 samples, bank 80-90, 715 cps = 89.9 % of final |
| small bursts, 10 steps / 30 s | 6, 7, 8 | bank 154 / 188 / 202 | no |
| dribble, 1 step / 2 s and / 5 s | 5, 6, 7, 8 | — | no |
| dribble, 1 step / 10 s | 5 | bank 76 | **YES** — 46 samples, bank 76-92, 702 cps = 88.4 % of final |
| dribble, 1 step / 10 s | 6, 7, 8 | bank 151 / 185 / 202 | no |
| dribble, 1 step / 20 s | 5 | bank 75 | **YES** — 315 samples, bank 75-93, 701 cps = 88.2 % of final |
| dribble, 1 step / 20 s | 6 | bank 150 | **YES** — 45 samples, bank 150-156, 1,409 cps = 87.5 % of final |
| dribble, 1 step / 20 s | 7, 8 | bank 183 / 200 | no |

**Three seeds reproduce the small-burst row** — 42 / 7 / 1 give 3 / 11 / 6 samples, all at bank 80
and all at 89.9 / 89.8 / 89.9 % of final. The window is a property of the route, not of the seed;
only its width moves.

**So the case is real.** It needs a slow route — one rod step every 10 to 20 s, or 10-step bursts
30 s apart — and it reaches **rung 6, which is inside the trailing-three fit window** (§2). Rung 5
is outside that window and cannot affect the number step 9 acts on.

### 12.4 AND THE STEADINESS ROW IS DEFEATED BY THE SAME ROUTE

The row does not hold the line it was added to hold. On the **20 s dribble, rung 5**, the shipped
steadiness row is itself satisfiable **368 s before rod-stop, at bank 75 and 701 cps — the
identical 88.2 % of final** that defeats the startup-rate row. A dribble slow enough to keep the
startup rate in band is also slow enough to keep the 120 s count drift under 3 %.

**Five seeds (42 / 7 / 1 / 123 / 99) give the identical picture on both decisive rows** — rung 5 at a 20 s
dribble defeats BOTH rows at bank 75 / 701 cps / 88.2 % of final on all five, the steadiness row
for exactly 368 samples on all five; rung 6 at a 20 s dribble defeats the startup-rate row at bank
150 / ~1,409 cps / 87.5 % of final on all five, and the steadiness row holds on all five.

It does hold on the 10 s dribble at rung 5 and on the 20 s dribble at rung 6. **That is the whole
of what it buys**, and §12.5 prices it.

### 12.5 What it costs the player who acts on it — the end-to-end number

The **hasty dribbler**: taps one rod step every 20 s, watches the count cue, stops the moment the
rung's floor latches, plots the instant the policy row allows. Four rungs, the panel's own
trailing-three fit (`FIT_WINDOW = 3`, `ui/panels/one_over_m.js`), three seeds.

| route | acceptance policy | predicted critical bank, seeds 42 / 7 / 1 | total settle wait |
|---|---|---|---|
| dribble 1 step / 20 s | STARTUP RATE only (proposed) | 209.5 / 209.5 / 209.5 | **246 s** |
| dribble 1 step / 20 s | + steadiness 3 %/120 s (shipped) | 208.9 / 208.9 / 208.9 | 691 s |
| authored bursts | STARTUP RATE only (proposed) | 208.9 / 209.0 / 208.8 | 518 s |
| authored bursts | + steadiness 3 %/120 s (shipped) | 208.5 / 208.5 / 208.5 | 938 s |

True criticality, re-measured in §3 of this document: **207.07 / 207.33 / 207.73**.

**Five further seeds reproduce it** — 123, 99, 555, 2024 and 31337. Across all eight seeds run, the
four rows read **209.4 to 209.8** / **208.9 every time** / **208.8 to 209.0** / **208.5 every
time**. The five extra seeds' own true criticalities were not measured (§3 took three), so they
corroborate the SPREAD BETWEEN POLICIES rather than adding error figures — and that spread is what
the verdict turns on: **the gap between the two policies is 0.6 of a bank step on every seed, and
it never changes sign.**

**The steadiness row buys 0.6 of a bank step on the worst route measured, for 445 s of extra
wait.** At 7.58 pcm per step (§1) that is **4.5 pcm**. Every one of the runs in the table predicts
**above** true criticality — the conservative direction — and the worst error in it, **+2.4
steps**, is inside what the step's own instruction allows for ("stop 3 short and walk up in single
taps"). For scale, the shipped configuration's own seed-to-seed spread on the authored route is 2
bank steps (§3: 210 / 208 / 209).

### 12.6 Verdict

The case the row exists for **does reproduce**. It is also **worth less than the seed scatter of
the configuration it is defending**, it is **defeated by the slowest version of the very route it
is meant to catch**, and it errs in the conservative direction when it is defeated. On the evidence
this section adds, it does not change §8's recommendation — but it is new evidence about the
mechanism the owner ruled on, so the removal is held pending his word.

### 12.7 If the removal proceeds — the `hold` values it needs, measured

The brief for the removal says the replay's dwell should follow the new acceptance rather than
over-promise a wait (#679: the crossing is a plant fact and the dwell follows it). `hold` is
measured from the step becoming ACTIVE, and the replay issues the rung's burst on that same tick,
so **these are seconds from the BURST COMMAND**, not from rod-stop. Seed 42, authored ladder, the
proposed two-row acceptance (count floor, then startup rate within 0.02 DPM), the runtime's
five-evaluation debounce applied.

| rung | accept, from BURST COMMAND | accept, from ROD-STOP | `hold` as shipped | suggested `hold` |
|---|---|---|---|---|
| 5 | 136 s | 19 s | 300 s | 180 s |
| 6 | 151 s | 72 s | 300 s | 200 s |
| 7 | 194 s | 155 s | 420 s | 250 s |
| 8 | 364 s | 347 s | 600 s | 460 s |

The suggested column is the measured requirement plus about 30 %, rounded — margin for seed
scatter, not a second measurement. **Anyone landing these must re-measure on three seeds before
committing them**, because a `hold` shorter than the acceptance reddens the replay of the very
step it is authored on, which is the trap the 2 % tolerance hit in #755.

Total replay dwell over the four rungs would fall from 1,620 s to 1,090 s — a 33 % cut, distinct
from (and smaller than) the 47 % cut in the player's own settle wait reported in §4.

### 12.8 What §12 did NOT verify

- **One cadence family.** Taps at 2, 5, 10 and 20 s and bursts of 10 steps at 30 s. A player who
  mixes cadences, overshoots and reverses, or pauses mid-rung was not measured.
- **All four cadences were run on all four rungs** — that gap is closed. What was not run is any
  cadence slower than 20 s per tap; the trend across 2 / 5 / 10 / 20 s is monotonic (slower is
  worse), so a 30 s or 60 s dribble would very likely widen the window further. Not measured.
- **The plot points are taken at the first instant the policy allows.** A real player takes a
  moment to press, and that delay can only move the reading toward the settled value, so this is
  the pessimistic end.
- **Node, not a browser.** What the panel renders and what the card says were not observed.
- **True criticality is carried from §3, not re-measured here.**
