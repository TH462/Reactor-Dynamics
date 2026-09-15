# The approach to criticality on the Mode 3 to Mode 1 walkthrough, step 9

**Filed:** 2026-09-14 · **Issue:** #755 item 20 · **Lane:** `develop` (measurement only — no source
file was edited by this pass) · **Plant:** PWR2, initial condition `hot_zero_power`, boron 719 ppm.

The owner's report:

> "Walkthrough mode 3>1 step 9: I found that the reactor went critical right on the 1/m plot
> prediction, not 3 steps before. … We may want to go back to slowly increasing steps. We should
> specify how many steps per unit of time so someone doesnt just yank the rods… We also need to
> figure out the handoff from source range to inter range in this step… Criticality in this plant
> doesnt seem to come gradually from 0%, it likes to jump up."

Everything below is MEASURED on this tree. Anything inherited is labelled INHERITED. Harnesses:
full stack (service + control + instructor), `tick()` driven, never `svc.start()`; the browser half
is headless Chromium against the real board at `ui/shell.html?engine=pwr2&init=hot_zero_power&dev=1`.

---

## 0. The headline

**The three-step discrepancy did NOT reproduce as a constant. It is a range, and the owner was
standing in the other end of it.**

| | panel's final prediction | true critical bank | error |
|---|---|---|---|
| Shipped board, headless Chromium, run 1 | **step 209** | 208 | **+1** |
| Shipped board, run 2 | **step 211** | 208 | +3 |
| Shipped board, run 3 | **step 211** | 208 | +3 |
| Node model of the same fit, seed 7 | step 212 | 208 | +4 |
| Node model, seed 4660 | step 212 | 208 | +4 |

Three runs of the *same* authored route on the *same* board gave 209, 211 and 211. The owner saw
the +1 case, in which the reactor goes critical **on** the number the panel draws. The "+3" recorded
in `ui/manual_procedures.js` is one sampling of a quantity that is not fixed.

**The mechanism is settling time, not the fit.** See section 2.

---

## 1. Panel-drawn prediction vs harness fit — the panel was read in a browser

Driven on the real board through the authored ladder (bursts of 94 / 63 / 31 / 14 steps at MED, each
followed by the authored 150 s hold and then the step's own count target). The panel's own readout
(`#oomPred`) and its own capture message (`#oomMsg`) were read after every press:

```
pt1  bank   0   C0 = 487 cps                PANEL: (blank)
pt2  bank  94   C =   786 -> 1/M = 0.620    PANEL: "predicted criticality = step 247 (39.4% withdrawn)"
pt3  bank 157   C =  1512 -> 1/M = 0.322    PANEL: "predicted criticality = step 234 (37.4% withdrawn)"
pt4  bank 188   C =  3616 -> 1/M = 0.135    PANEL: "predicted criticality = step 217 (34.6% withdrawn)"
pt5  bank 202   C =  8753 -> 1/M = 0.056    PANEL: "predicted criticality = step 211 (33.7% withdrawn)"
                                            chart label: "critical 211"
```

**The trailing last-3 fit is what ships, and it is confirmed twice.** By source —
`ui/panels/one_over_m.js`, `var FIT_WINDOW = 3` — and by arithmetic: least squares through points 3,
4 and 5 of the run above gives slope -3.72810, intercept 1.254951, zero crossing x = 0.336610, and
0.336610 x 627 = **211.05 -> "step 211"**, exactly what the panel drew. An all-points fit on the same
five points is 8 to 15 steps further out at every point where the two differ (Node model: 226.0 and
220.7 at points 4 and 5, against 214.2 and 212.4 for trailing-3) — i.e. on the danger side, which is
the #725 finding standing.

**There is no rounding or scale defect between the panel and the plant.** The panel captures
`x = position_pct / 100`, and `pwr2_shell.js:1786` publishes `position_pct = 100 * rodSteps /
bankSteps()` — exact, unrounded, off the live 627-step bank. That was the obvious candidate for a
panel-versus-harness divergence and it is not one.

**Which number was the owner looking at?** The one the panel draws. It is the same number the Node
model produces from the same points; the spread comes from the plant and the press, not from two
different fits.

**One caveat on the browser half:** the snapshot read for each row lands about 250 ms of wall after
the click, which at 60x is about 15 s of plant, so the bank and count columns in runs 1 and 2 could
not be used to reconstruct the fit. Run 3 above reads the panel's *own* capture message instead,
which is why the reconstruction is exact.

---

## 2. Why the error moves: the last point is plotted before the counts have settled

After the last authored burst (14 steps at MED, to bank 202, rho = -43 pcm), the source range has
**not finished rising** when the step's 150 s hold expires:

| time after the burst | source range, true (cps) | % of settled |
|---|---|---|
| 30 s | 5,447 | 41.0 % |
| 90 s | 7,390 | 55.6 % |
| **150 s — the authored hold** | **8,747** | **65.8 %** |
| 300 s | 10,908 | 82.0 % |
| 600 s | 12,664 | 95.3 % |
| 1200 s | 13,259 | 99.7 % |
| 3000 s | 13,296 | 100 % |

A point taken mid-rise has C too low, so 1/M = C0/C reads too **high**, the trailing line is too
shallow, and the zero crossing lands too far **out**. Six noise seeds, last point plotted at four
different settle times, everything else identical:

| seed | plot at +150 s | +300 s | +600 s | +1200 s | true critical |
|---|---|---|---|---|---|
| 1 | 211 | 209 | 209 | 208 | 208 |
| 7 | 210 | 208 | 208 | 208 | 208 |
| 42 | 212 | 210 | 209 | 209 | 208 |
| 123 | 211 | 209 | 208 | 208 | 208 |
| 4660 | 213 | 211 | 210 | 210 | 208 |
| 777 | 210 | 209 | 208 | 208 | 208 |

- At the authored 150 s hold: **+2 to +5 steps**.
- At 600 s: **0 to +2 steps**.
- **In all 24 samples plus 3 browser runs, the prediction never read BELOW true critical.** It is a
  genuine upper bound; it is just a much tighter one than the step text claims when the player
  waits, and a looser one when he does not.

So the walkthrough's "it reads about three steps high, so the reactor goes critical just short of
it" is true at the hold the replay uses, and false for a player who does what the step text actually
tells him to do — *"Settle, press Plot point."*

---

## 3. The approach shape — "it likes to jump up"

### 3a. The bank ladder, settled 10 plant-minutes at each rung

Control bank parked and allowed to settle; source range, startup rate and power as the plant reports
them. Criticality (rho >= 0) is at **bank 208 of 627**; differential worth across 206 to 212 is
**7.45 pcm/step**.

| bank | rho (pcm) | source range (cps) | startup rate (DPM) | period (s) | reactor power (%) | inter range (A) |
|---|---|---|---|---|---|---|
| 190 | -131.3 | 4.35e3 | ~0 | — | 1.67e-6 | 1.46e-10 |
| 198 | -72.2 | 7.83e3 | 0.003 | 9,105 | 3.01e-6 | 2.38e-10 |
| 202 | -43.3 | 1.30e4 | 0.002 | 13,196 | 5.02e-6 | 3.99e-10 |
| 206 | -12.6 | 3.71e4 | 0.007 | 3,727 | 1.43e-5 | 1.15e-9 |
| 207 | -5.5 | **5.99e4** | 0.010 | 2,701 | 2.30e-5 | 2.12e-9 |
| **208** | **+2.0** | **secured** | 0.021 | 1,218 | 4.55e-5 | 3.88e-9 |
| 209 | +10.1 | secured | 0.038 | 695 | 1.23e-4 | 1.03e-8 |
| 210 | +17.7 | secured | 0.061 | 424 | 5.29e-4 | 4.48e-8 |
| 211 | +25.5 | secured | 0.089 | 292 | 4.12e-3 | 3.46e-7 |
| 212 | +32.1 | secured | 0.114 | 229 | 6.08e-2 | 4.86e-6 |
| 213 | +25.1 (1) | secured | 0.079 | 331 | 1.03 | 9.37e-5 |
| 215 | +3.3 (1) | secured | 0.007 | 3,696 | 3.46 | 3.02e-4 |
| 218 | +0.6 (1) | secured | ~0 | — | 5.19 | 4.42e-4 |
| 220 | +0.2 (1) | secured | ~0 | — | 6.23 | 4.81e-4 |

(1) temperature feedback is eating the excess by this point — these are not equilibrium reactivities.

### 3b. What the player actually sees

Authored route, creep of 11 slow steps from 202 to 213, rods then never touched again:

- rho crosses zero **43 s** into step 9, at bank **208**, while the rods are still moving.
- Startup rate settles at **0.15 DPM** — a **180 s period**, a **125 s doubling time**. Constant.
- REACTOR POWER renders to one decimal (verified on the live board: it draws `0.0 %`). It therefore
  reads **0.0 % for 27.5 plant-minutes** after the rods stop.
- Then: 0.1 % at +1651 s, 1.0 % at about +2160 s (**8.5 min later**), 2.0 % at about +2540 s
  (**6.3 min later**), arresting on temperature feedback at 2.7 % over my window (4.01 % over the
  full step — INHERITED from #753, not re-measured here).
- Over that same window the **intermediate range moves about five decades**: 3.3e-9 A at the handoff,
  8.4e-6 A when power first reads 0.1 %, 2.1e-4 A at 2.5 %.

**"It jumps" is a readout artifact, not a plant defect.** The growth is a straight line in log space
at a constant 0.15 DPM; a one-decimal linear percent tile shows nothing for 27 minutes and then
appears to run away. The plant already carries the instrument that makes it gradual — the
intermediate range — and the step does not point at it during that window.

**Do not tune the region.** The one honest lever is how many steps are left in above criticality, and
it is already authored:

| creep | lands at | steps above critical | peak startup rate | power 0.1 % at | peak power |
|---|---|---|---|---|---|
| 8 | 210 | 2 | 0.288 DPM | +3912 s (65 min) | 1.02 % |
| **11 (authored)** | **213** | **5** | **0.360 DPM** | **+1651 s (27.5 min)** | **2.68 %** |
| 14 | 216 | 8 | 0.448 DPM | +999 s (16.6 min) | 4.21 % |
| 20 | 222 | 14 | 0.699 DPM | +533 s (8.9 min) | 7.32 % |

A smaller creep is gentler and slower; a larger one is faster and hotter. None of them trip.

---

## 4. Withdrawal rate — what this plant actually tolerates, and what stops you

### 4a. What rod stops this plant has

**Measured live:** on PWR2, `ControlLayer.config.interlocks` is an **empty array**
(`pwr2_shell.js:1411` hands the kernel `interlocks: []`). Held WITHDRAW continuously to a peak
startup rate of **28.4 DPM** and not one interlock engaged. There is **no startup-rate rod
withdrawal block on this plant**. (The 1.5 DPM block in `layers/control/pwr_control.js` belongs to
the retired PWR engine only; `pwr_board_wiring.js:1360` already records this, and the instruction not
to re-invent a 1.5 decades-per-minute stop is correct — the evidence pass found no source for one.)

What PWR2 *does* have, all sourced, all in the engine:

| stop | setpoint | source | bites during the approach? |
|---|---|---|---|
| Intermediate-range high-flux **rod stop** | 20 % current-equivalent power | WTSM 8.1 section 8.1.7.3 (ML11223A252); Ginna UFSAR ch7 (ML20339A027) | no — 20 % is four times the top of Mode 2 |
| Power-range high-flux **rod stop** | 103 % | same | no |
| Overtemperature / overpower delta-T **rod stops** | within 3 % of the trip setpoint | ch7 section 7.2.3.2.1 | no |
| Startup Rate High **alarm** | 1.0 DPM | Duke McGuire OP/1/A/6100/05 section 2.1 (ML20077E732) | yes — it is the only warning there is |
| Intermediate-range high-flux **reactor trip** | — | — | yes, and it is the first *automatic action* of any kind |

**Between the operator and the reactor trip, in the source range, there is nothing but an alarm.**

### 4b. Holding WITHDRAW — the "yank"

From bank 200 (8 steps below critical, rho = -58 pcm), one press, held:

| drive speed | Startup Rate High (1.0 DPM) | peak startup rate | what stopped it | end state |
|---|---|---|---|---|
| **SLOW**, 8 steps/min | +201 s, bank 227 | **3.04 DPM** | the intermediate-range high-flux **rod stop** at bank 255 | **23.7 % power, no trip, no scram** |
| **MED**, 48 steps/min | +22 s, bank 218 | 17.4 DPM | **SCRAM** — `ir_high_flux` | +89 s, bank 270, 14.6 % power |
| **FAST**, 72 steps/min | +11 s, bank 213 | 28.4 DPM | **SCRAM** — `ir_high_flux` | +63 s, bank 274, 13.6 % power |

The SLOW row is the one worth the step text. **The slowest drive on the board, held from the approach
region, takes the plant to 23.7 % power at three times the administrative rate limit and nothing
trips.** That is exactly the failure the owner named, and it happens at the speed a cautious player
would choose.

### 4c. What rate the approach tolerates

The authored ladder is well inside the limit. Peak startup rate during each burst at MED:

| burst | to bank | peak startup rate |
|---|---|---|
| 94 steps | 94 | 0.133 DPM |
| 63 steps | 157 | 0.285 DPM |
| 31 steps | 188 | 0.486 DPM |
| 14 steps | 202 | **0.612 DPM** |
| 11 steps at SLOW (the creep) | 213 | 0.360 DPM |

So MED is safe *in bursts, released*; it is the **holding** that is dangerous, and the danger grows
with how far past criticality you are, not with the drive speed. Below the point of adding heat
nothing removes reactivity, so the settled startup rate is set by the **excess**, not the rate:
0.0035 DPM per pcm (section 3a, banks 209 to 212), i.e. the 1.0 DPM alarm needs about **285 pcm,
roughly 38 steps above critical**, and 1.5 DPM needs about 57.

**The specification the step should carry is therefore a QUANTITY with a rate attached, not a rate
alone:**

- **Below the predicted position:** MED, in bursts, released between them. Measured ceiling on the
  authored ladder, 0.61 DPM.
- **At and above the predicted position:** SLOW only, single taps, **and no more than five steps
  above the position where the reactor went critical.** Five steps is +41 pcm, 0.15 DPM, a 125 s
  doubling time — the authored creep.
- **Never hold WITHDRAW once the source range is above about 1e4 cps.** Measured: at SLOW that is
  3.5 plant-minutes to the alarm and 23.7 % power if nobody lets go.

---

## 5. The source-range to intermediate-range handoff

The source range de-energizes **on flux alone**, at 1e5 counts per second. There is no button
(`set_sr_detector` is refused by name on PWR2 — owner directive, 2026-09-01, #598 item 7), and no
P-6 involvement: the cue sits well above P-6.

**Where it happens, measured two ways:**

| | bank at securing | relative to criticality | power | inter range at securing |
|---|---|---|---|---|
| Settle-at-each-step approach (section 3a) | between 207 and 208 | **within ONE step of criticality** | 4.6e-5 % | 3.88e-9 A |
| Authored route, creep 11 to bank 213 | 213 (rods already stopped) | **255 s after** rho crossed zero | 3.85e-5 % | 3.25e-9 A |

- On the authored route it lands **298 s (5 plant-minutes) into step 9**, with the rods still. The
  step is up at t = 603 s and the next step does not begin until t = 2465 s, so the instrument dies
  in the middle of a 30-minute step.
- Creep size moves it: creep 8 -> +519 s, creep 11 -> +298 s, creep 14 -> +216 s, creep 20 -> +166 s.
- The source range peaks at **8.4e4 cps** 26 s before it goes dark — the player sees the number
  climbing hard and then gone.
- **The intermediate range is comfortably on scale at the handoff every time**: 2.1e-9 to 3.9e-9 A,
  which is 21 to 39 times the P-6 permissive of 1.0e-10 A. Nothing is lost by switching to it early;
  the player just has to be told to.

**The owner's sentence — "when we hit criticality the source range shuts off" — is literally true on
a settled approach.** It is off by five plant-minutes on the authored route only because the creep
parks the bank above critical and the counts take that long to climb the last 0.2 decades.

---

## 6. Recommendation for step 9 (text only — this pass did not edit the step)

`ui/manual_procedures.js` has another writer this session. What follows is what the measurements
support, for whoever owns the edit.

**6.1 — Stop claiming a fixed three-step error. Claim the direction, not the size.** Measured, the
final prediction is +1 to +5 steps depending on how long the player waited, and in 27 samples it
never read below true critical. Proposed sense: *"the prediction is an upper bound, never a target:
the reactor goes critical at it or a few steps below it, and how close depends on how long you let
the counts settle before the last plot."* The current wording — *"it reads about three steps high, so
the reactor goes critical just short of it"* — is what made the owner's +1 run look like a bug.

**6.2 — Fix the cause, in step 8, not in step 9.** The error is a settling artifact. At the authored
150 s hold the counts are at 65.8 % of settled; at 600 s they are at 95.3 % and the prediction
tightens to 0 to 2 steps. Two ways to buy that, and the second is the recommendation:

- extend step 8's `hold` from 150 s to about 600 s; or
- **change what step 8 waits for.** It currently waits on a count threshold (7,000 cps), which is
  crossed while the count is still climbing. Waiting on the count being *steady* is the thing the
  step text already asks the player to do, and is the honest acceptance.

**6.3 — Put the rate in the step, as a quantity plus a rule.** Proposed, all from section 4:

- *"Below the predicted position, MED is fine — but in bursts. Press, release, wait. Never hold."*
- *"At and above it, SLOW and single taps, and no more than five steps above the position where the
  reactor went critical."*
- *"Nothing in this plant stops you. The only rod stops are at 20 % and 103 % power, a long way above
  here, and the first automatic action of any kind is a reactor trip. Held at SLOW — the slowest
  speed on the board — from here the plant reaches 24 % power in seven minutes and never trips."*
  That last sentence is the one that answers the owner's "this is usually how people mess up a
  startup", and it is measured.

**6.4 — Name the handoff before it happens, and give the player the instrument to move to.** The step
already mentions the source range switching itself off; what it does not do is tell the player
**where to look instead, before it goes**. Proposed: a line early in step 9 — *"From the moment your
last tap goes in, watch INTER RANGE and STARTUP RATE, not SOURCE RANGE. The source range will switch
itself off about five plant-minutes from now, above 100,000 counts a second, and that is the plant
telling you the approach worked."* Measured backing: the intermediate range is 21 to 39 times P-6 at
the handoff in every run, and it moves five decades over the window in which REACTOR POWER reads
0.0 %.

**6.5 — Say what "0.0 %" means, rather than tuning the region.** Proposed: *"REACTOR POWER will read
0.0 % for about half an hour. That is not the reactor doing nothing — STARTUP RATE is holding near
0.15, which is power multiplying by ten every seven minutes, and INTER RANGE is climbing the whole
time. Power will appear on the tile at 0.1 % and be at 1 % eight minutes later."* The measurements
say there is nothing to tune: the growth is a constant 0.15 DPM with a 125 s doubling time, and the
"jump" is a one-decimal linear tile.

**6.6 — On "we may want to go back to slowly increasing steps": the recommendation is NO, and #750's
ruling should stand.**

- The measurement that matters: the four-burst ladder's last point sits at bank 202, rho = **-43 pcm**
  — genuinely subcritical, which is what #750 bought. A restored sixth point lands near bank 211,
  rho = **+25 pcm** — plotting a 1/M point on an already-critical core, which is the thing the ruling
  removed.
- The prediction's error is not caused by having too few points. It is caused by the last point being
  taken at 66 % of its settled value. Adding a sixth point at the same 150 s hold moves the answer
  the wrong way (INHERITED, #750: the six-point form read 212.6 to 213.4 against the five-point
  210.3 to 212.1).
- So the honest version of "slowly increasing steps" is **a longer settle on the last point** (6.2),
  not more points. **This is a recommendation, not a decision — #750 was the owner's ruling and only
  he can reopen it.** If he wants the sixth point back anyway, the measurement to put in front of him
  is the rho = +25 pcm above.

**6.7 — One thing to check in the neighbouring file.** The `pwr` (retired-engine) checklist pool at
`ui/manual_procedures.js:274` still cautions that *"rod withdrawal is blocked at 1.5 DPM (clearing
below 0.8)"*. Measured above: no such block exists on PWR2. That pool is not what the site runs, so
it is not urgent, but it is a false statement about the shipped plant sitting in the same file.

---

## 7. What this pass did NOT verify

- **The drawn resolution and units of the SOURCE RANGE, INTER RANGE and STARTUP RATE readouts.** The
  REACTOR POWER tile was confirmed to render to one decimal (`0.0 %`) on the live board; the other
  three labels were located in the DOM but their value elements are positioned siblings that were not
  resolved. So "the intermediate range is a usable indication during the 0.0 % window" rests on the
  *channel* moving five decades, not on having read the tile.
- **The peak power over the whole of step 9 (4.01 %) and the 1x / 5x / 10x / 30x / 60x speed
  equivalence.** Both INHERITED from #753; this pass's window ended at 2.68 % with the plant still
  arresting. Not re-measured.
- **Any gate.** No runner was executed, and the aggregate was not run — the coordinator owns it.
- **The browser spread across noise seeds.** The app hard-codes seed `0x1234`, so the three browser
  runs differ by *timing* of the press, not by seed. The seed axis was covered in Node only.
- **The live checklist grading path.** Commands were driven through the service; the checklist
  runtime was not run, so how step 9's acceptance (`power_pct > 0.1`) or the `overtaken` condition
  behave against these routes is unverified.
- **Whether any of the proposed wording in section 6 fits `Blueprint/CHECKLIST_WRITING_GUIDE.md`.**
