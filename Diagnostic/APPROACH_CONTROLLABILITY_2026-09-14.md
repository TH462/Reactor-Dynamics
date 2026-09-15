# Can the criticality-approach region be made easier to control? — the rod worth, and the instruments

**Filed:** 2026-09-14 · **Issue:** #755 item 20 · **Lane:** `develop` (measurement only — this pass
edited no source file) · **Plant:** PWR2, initial condition `hot_zero_power`, boron 719 ppm,
Tavg 547.0 °F (286.13 °C).

The owner's question, verbatim:

> "I was thinking would it be possible to adjust the physics to make it easier to control in this
> region? If not then we could implement a measured startup-rate block. Measured because this plant
> behaves differently than the real one."

and, refining it the same day:

> "The problem is the rate the power climbs seems to be is nothing until it suddenly shoots up in
> power if the user has pulled the rods out too far. It could be we need to explain how to use the
> intermediate range better."

Everything below is MEASURED on this tree unless marked INHERITED. Node work is `tick()`-driven at
DT = 0.02 s, never `svc.start()`. The board work is headless Chromium against the real control room
at `ui/shell.html?engine=pwr2&init=hot_zero_power&dev=1`, reading the rendered DOM.

---

## 0. The headline, in the order he asked

1. **No — the physics should not be adjusted, and the reason is that it is already right.** This
   plant's differential control-bank worth at the criticality point is **7.64 pcm per step**. The
   sourced band for a Westinghouse control bank is **4 to 12 pcm/step** (NRC HRTD, ML11216A094), and
   Ginna's own accident analysis assumes a flat **10 pcm/step**. Ours is inside the band and on the
   *fine* side of it. The curve is S-shaped, peaked near the core midplane, 4.15 pcm/step at both
   ends — the shape the source describes. **There is no coarseness to fix.**
2. **The "nothing, then suddenly" shape is a READOUT fact, and it is measured.** REACTOR POWER draws
   one decimal on a linear percent scale, so it reads exactly `0.0 %` for **30.0 plant-minutes**
   after a normal approach and **9.9 plant-minutes** after an over-withdrawal. STARTUP RATE reads a
   usable number **12 seconds** after the rods stop in *both* cases, and it reads a **different**
   number in each — `+0.15 DPM` against `+0.47 DPM`. So the board already tells the player he has
   pulled too far, thirty minutes and ten minutes respectively before the tile he is watching does.
3. **The board already draws REACTOR PERIOD, in whole seconds, live.** That claim was going to be
   filed as "not built"; it is built, it is visible, and it read `55 s` against `195 s` in the two
   cases above. Nothing draws *doubling time* as such.
4. **A startup-rate rod block is therefore NOT the answer to the failure he described — measured.**
   Injected at the retired plant's 1.5 decades-per-minute setpoint it stops a held withdrawal dead.
   But the route that actually gets a careful player to 20 % power — **one single-step tap every
   30 seconds** — peaks at **0.96 DPM** and never reaches 1.5, or even the 1.0 DPM alarm. A block
   catches the yank. It does not catch the patient over-withdrawal, which is the one he hit.

---

## 1. Differential rod worth — what this plant has

### 1a. The engine's own curve, and it IS S-shaped

`pwr2_kinetics.js` builds integral rod worth as `-worth × scruve(1 − withdrawn, K)` with
`worth_control = 0.04068` (4068 pcm), `max_steps = 627` and `curve_flatten = 0.36`. Differentiated
across the whole bank (central difference, pcm per step):

| control bank | withdrawn | integral rod reactivity (pcm) | differential worth (pcm/step) |
|---|---|---|---|
| 0 | 0.0 % | −4068.0 | **4.15** |
| 100 | 16.0 % | −3615.6 | 5.23 |
| 150 | 23.9 % | −3327.3 | 6.33 |
| 200 | 31.9 % | −2981.9 | 7.47 |
| **208 (critical)** | **33.2 %** | **−2921.5** | **7.64** |
| 213 | 34.0 % | −2883.1 | 7.74 |
| 260 | 41.5 % | −2500.2 | 8.50 |
| **313** | **49.9 %** | −2038.4 | **8.82 — the peak** |
| 400 | 63.8 % | −1295.1 | 8.00 |
| 500 | 79.7 % | −601.2 | 5.80 |
| 627 | 100 % | 0.0 | 4.15 |

min 4.15 · mean 6.48 · **peak 8.82 at 49.9 % withdrawn** · peak/mean **1.361**.
Across the whole approach region, bank 150 to 260: **6.33 to 8.50 pcm/step**.

### 1b. The plant agrees with the curve — measured, not asserted

Engine booted at `hot_zero_power`, the control bank **parked** at each position, stepped 20 × 0.02 s
so the kinetics ramp-extrapolation term has relaxed, then `true_state.reactivity_pcm` read. Tavg
547.0 °F (286.13 °C) and boron 718.9 ppm are identical in every row, so the difference between rows
is pure rod worth:

| bank | reactivity (pcm) | one-step delta (pcm) |
|---|---|---|
| 199 → 200 | −59.0 → −51.5 | **7.458** |
| 205 → 206 | −13.9 → −6.3 | 7.584 |
| **207 → 208** | **+1.34 → +8.96** | **7.625** |
| 208 → 209 | +8.96 → +16.61 | 7.646 |
| 212 → 213 | +39.67 → +47.39 | 7.726 |
| 229 → 230 | +173.6 → +181.7 | 8.044 |
| 259 → 260 | +421.8 → +430.3 | 8.490 |

Reactivity crosses zero between bank 206 (−6.27 pcm) and **bank 207 (+1.34 pcm)**. The inherited
figure was bank 208; the two are one step apart and both are right for their harness — the earlier
pass read it off a settling plant, this one off a parked one. Everything below uses **bank 207 as
critical**.

> **A trap, for the next person who measures reactivity this way.** Setting the bank and reading
> `reactivity_pcm` after a *single* step gives **11.44 pcm/step** — 50 % high, and it looks entirely
> plausible. `pwr2_kinetics.js` reports `rho_mid = rho_now + 0.5 × (rho_now − rho_prev)`, the ramp
> extrapolation §15 asked for; a one-shot bank jump is a ramp of one step, so the readout carries
> 1.5 × the jump. Settle before you read, or you will publish the midpoint estimator as the plant.

### 1c. What the player's hand actually does

`ui/app.js` splits a rod press two ways (`TAP_HOLD_MS = 220`):

- **A tap** — released inside 220 ms — sends `rod_nudge` with `steps: ±1`. **One step, at any drive
  speed.** The speed only sets how long that one step takes to travel: SLOW 7.5 s, MED 1.25 s,
  FAST 0.83 s. The reactivity added is the same **7.64 pcm** in all three.
- **A hold** sends `rod_start` and the bank runs until release. Reactivity added per second at the
  critical position: **SLOW 1.02 pcm/s · MED 6.11 pcm/s · FAST 9.17 pcm/s.**

So the finest control the player has is 7.64 pcm, and it is available on every speed button. The
three speeds are not three granularities; they are one granularity and three hold rates.

---

## 2. The evidence pass — is 7.64 pcm/step prototypical?

Run through `node tools/find_source.js` across all three lanes' corpora, not a one-lane grep.

**(a) The band. NRC HRTD, "Westinghouse Technology Advanced Manual" Section 5 — Transients,
Rev 0311, page 5-20, §II "Significant Parameters (Typical Values)", A "Reactivity Values", item 4.
ADAMS ML11216A094**, verbatim:

> "4. Control Rod Worths
>  Bank: 1000 pcm
>  Individual: 150 pcm
>  **Differential worth: 4 to 12 pcm/step**"

**7.64 pcm/step sits in the middle of that band.** The whole-bank envelope, 4.15 to 8.82, sits
inside it end to end.

**(b) An anchor-plant number. Ginna UFSAR chapter 15 (ADAMS ML20339A101)**, in the assumption list
for the uncontrolled-rod-withdrawal-at-power analysis, verbatim:

> "F. **A constant rod worth of 10 pcm/step is assumed.** This rod differential worth is
> conservative since it causes the rod control system to attempt maintaining the full power TAVG"

Ginna's analysis uses a *flat* 10 pcm/step and calls it conservative. Ours is 7.64 at the approach
and about 4.2 at the 100 % power point (bank 606). **We are finer than the anchor plant's design number
everywhere.**

**(c) The shape. NRC HRTD Westinghouse Technology Systems Manual 2.1 — Reactor Core and Reactor
Theory (ADAMS ML11223A207), §2.1**, verbatim:

> "…the midplane of the core, its worth per step of movement is greater than if it were almost
> totally withdrawn or inserted. A typical differential control rod worth (Δρ/Δ rod position) curve
> is shown in Figure 2.1-20(a). **Note that the maximum differential worth is found when the rod is
> positioned at about 40% withdrawn.**"

Our peak is at **49.9 % withdrawn**, not 40 %. That is the one honest deviation: `scruve` is a
symmetric cosine correction, so its peak is at the geometric midplane by construction, while the
real curve is skewed slightly low by the axial flux shape. The *magnitude* is right, the *envelope*
is right, the peak sits about ten percentage points of travel high. It is a known consequence of the
declared simplification already written into `pwr2_kinetics.js` (the real overlapped four-bank curve
is scalloped and ours is smooth) and it does not touch the approach region, which is at 33 %.

**(d) The drive speeds. NRC HRTD Westinghouse Technology Systems Manual 8.1 — Rod Control
(ADAMS ML11223A252), §8.1.4.1 "Bank Selector Switch", MANUAL**, verbatim:

> "The bank sequence and overlap program (section 8.1.5) is maintained with the rods in manual rod
> control. **The rod speed is adjustable between 8 and 72 steps/min. with a potentiometer located
> within the rod control cabinet. The speed normally selected for manual operation is 48
> steps/min.**"

Our SLOW / MED / FAST are **8 / 48 / 72 steps per minute** — the sourced minimum, the sourced normal
manual speed, and the sourced maximum, exactly.

**(e) What one physical step is. Ginna Technical Specification Bases Rev 101 (ADAMS ML20339A221)**,
verbatim:

> "Each CRDM moves its RCCA **one step (approximately 5/8 inch) at a time**, but at varying rates
> (steps per minute) depending on the signal output from the Rod Control System."

**UNVERIFIED — one thing I could not source.** No document in any lane's corpus says how many steps
a real operator's *momentary* press of the IN-HOLD-OUT switch produces. The switch is a
spring-return three-position lever, not a pushbutton, and every source describes motion by *rate*
rather than by *taps*; our one-step tap is a reasonable board idiom for it but it is not a sourced
behaviour and I am not claiming it is.

**Verdict on design question 2, prototypicality: our differential rod worth is SOURCED and inside
the band, and our drive speeds are the sourced values. There is nothing to make more prototypical
here.** Design question 1 (tested numbers) is section 1; question 3 (educational value) and
question 4 (player complexity) are section 5.

---

## 3. What the player can actually READ — every tile, off the live board

Read out of the rendered DOM, not out of source. The four indications and their drawn resolution:

| tile | draws | resolution | example at the approach |
|---|---|---|---|
| **REACTOR POWER** | `0.0 %` | **one decimal, LINEAR percent** | `0.0 %` for half an hour |
| **STARTUP RATE** | `+0.15 DPM` | **two decimals, signed, decades per minute** | `+0.15` / `+0.47` |
| **SOURCE RANGE** | `4.5e3 cps` | one-decimal mantissa + exponent, counts/second | `4.5e3` → `9.1e4` |
| **INTER RANGE** | `1.5e-10 A` | one-decimal mantissa + exponent, amps | `1.5e-10` → `1.9e-4` |
| **CONTROL ROD POSITION** | `208 /627` | whole steps | — |
| **REACTOR PERIOD** | `195 s` | **whole seconds** | `195 s` / `55 s` |

Two of those deserve a sentence each.

**REACTOR PERIOD exists.** It is drawn immediately below the NIS card (rendered at x 391–482,
y 403–427: caption `PERIOD`, unit `s`), it is live, and it tracked the plant through every run —
`28 s` at the first sample after a large withdrawal, settling to `55 s`; `195 s` for a small one. It
reads `true_state.reactor_period_s` and shows `∞` above 9999 s. The previous pass's search for the
authored tile id `ims89mkaj2r` fails because the board renders the value as a bare text node, which
is why it looked absent. **It is not absent. Nothing draws doubling time as such** — that would be
period × 0.693, and no element on the board matches `/doubling/`.

**The secured SOURCE RANGE draws `1.0e0 cps`.** Once the detector de-energizes, the instrument
channel reads exactly `1`, and the tile renders it as a live-looking `1.0e0 cps` in the idle grey.
It is greyed, but the *number* says "one count per second", not "secured". Measured at the handoff:
tile `9.1e4 cps` on the last live frame, then `1.0e0 cps` for the rest of the run. A player who is
not watching the colour reads a plant whose count rate collapsed by five decades. **Filed here as a
readability defect; it is not this report's subject and I have not proposed a fix.**

---

## 4. The lead time — the number he asked for

Two runs on the live board, both from `hot_zero_power`, the control bank driven out and then
**parked**, nothing else touched. Bank 212 is **+5 steps above critical** (the authored creep). Bank
220 is **+13 steps** — "pulled the rods out too far".

### 4a. +5 steps above critical (bank 212), the normal approach

| t after rods stop | REACTOR POWER | STARTUP RATE | REACTOR PERIOD | SOURCE RANGE | INTER RANGE |
|---|---|---|---|---|---|
| 12 s | `0.0 %` | **`+1.15 DPM`** | `50 s` | `4.5e3 cps` | `1.5e-10 A` |
| 60 s | `0.0 %` | `+0.33 DPM` | `88 s` | `1.2e4 cps` | `3.4e-10 A` |
| 180 s | `0.0 %` | `+0.20 DPM` | `140 s` | `3.4e4 cps` | `1.1e-9 A` |
| 369 s | `0.0 %` | `+0.16 DPM` | `170 s` | `8.8e4 cps` | `2.9e-9 A` |
| 489 s | `0.0 %` | `+0.14 DPM` | `186 s` | `1.0e0 cps` (secured) | `4.9e-9 A` |
| 969 s | `0.0 %` | `+0.13 DPM` | `196 s` | — | `6.6e-8 A` |
| 1689 s | `0.0 %` | `+0.13 DPM` | `204 s` | — | `2.7e-6 A` |
| **1809 s** | **`0.1 %`** | `+0.13 DPM` | `205 s` | — | `4.5e-6 A` |
| 2409 s | `0.7 %` | `+0.08 DPM` | `358 s` | — | `5.4e-5 A` |

**REACTOR POWER leaves `0.0 %` at t = 1809 s. STARTUP RATE is readable at t = 12 s.
LEAD TIME = 1797 s = 30.0 plant-minutes.**

### 4b. +13 steps above critical (bank 220), "pulled the rods out too far"

| t after rods stop | REACTOR POWER | STARTUP RATE | REACTOR PERIOD | SOURCE RANGE | INTER RANGE |
|---|---|---|---|---|---|
| 12 s | `0.0 %` | **`+1.01 DPM`** | `28 s` | `8.1e3 cps` | `2.6e-10 A` |
| 60 s | `0.0 %` | `+0.56 DPM` | `46 s` | `2.8e4 cps` | `9.4e-10 A` |
| 129 s | `0.0 %` | `+0.49 DPM` | `53 s` | `1.0e0 cps` (secured) | `3.6e-9 A` |
| 297 s | `0.0 %` | `+0.47 DPM` | `55 s` | — | `8.4e-8 A` |
| 489 s | `0.0 %` | `+0.46 DPM` | `56 s` | — | `1.0e-6 A` |
| **609 s** | **`0.1 %`** | `+0.46 DPM` | `57 s` | — | `8.9e-6 A` |
| 729 s | `0.7 %` | `+0.38 DPM` | `69 s` | — | `6.4e-5 A` |
| 849 s | `2.8 %` | `+0.19 DPM` | `141 s` | — | `2.2e-4 A` |
| 969 s | `4.7 %` | `+0.06 DPM` | `462 s` | — | `3.8e-4 A` |

**REACTOR POWER leaves `0.0 %` at t = 609 s. STARTUP RATE is readable at t = 12 s.
LEAD TIME = 597 s = 9.9 plant-minutes.**

### 4c. What that means, plainly

- **The two cases are indistinguishable on REACTOR POWER for the first nine minutes** — both read
  exactly `0.0 %`. They are distinguishable on **STARTUP RATE from the first sample**: `+0.15`
  settled against `+0.47`, a factor of 3.6. And on **REACTOR PERIOD**: `195 s` against `55 s`.
- **The INTERMEDIATE RANGE is legible and visibly moving throughout the silent window.** At +5
  steps it runs `1.5e-10 A` → `2.7e-6 A` — four and a half decades — while REACTOR POWER never
  leaves `0.0 %`, and its mantissa changes at every 12-second sample. At +13 steps it runs
  `2.6e-10 A` → `8.9e-6 A` in ten minutes. **There is no part of the approach in which the board
  shows nothing.** There is only a part in which the *linear percent tile* shows nothing.
- **Startup rate is not "accelerating then sudden" — it is FLAT.** At +5 steps it holds `+0.13` for
  twenty minutes; at +13 steps it holds `+0.47` for ten. The period is constant. The apparent jump
  is what a constant-period exponential looks like on a linear scale with one decimal: a decade of
  growth below the first drawn digit costs nothing to display and the next decade costs the whole
  tile.
- **One caution for any rate-based rule.** The first STARTUP RATE reading after the rods stop is the
  prompt-jump transient, not the answer: `+1.15 DPM` at 12 s decaying to `+0.15` by 300 s in the +5
  case — **seven times the settled value**. A decision rule written on STARTUP RATE has to say *how
  long to wait before reading it*, or every normal approach looks like a runaway for five minutes.

### 4d. Settled startup rate against how far past critical you are

Bank parked, `hot_zero_power`, plateau value (after the transient, before temperature feedback):

| steps above critical | excess (pcm) | settled startup rate | period | doubling time |
|---|---|---|---|---|
| +1 | 7.6 | 0.08 DPM | ~330 s | ~230 s |
| +5 (authored creep) | 38 | **0.13 DPM** | 195 s | 135 s |
| +8 | 61 | 0.25 DPM | ~105 s | ~73 s |
| +13 | 100 | **0.47 DPM** | 55 s | 38 s |
| +18 | 139 | 0.77 DPM | ~34 s | ~24 s |
| +22 | ~170 | **~1.0 DPM** (extrapolated one step past the last clean measurement) | ~26 s | ~18 s |

Roughly **+0.04 to +0.06 DPM per extra step** in the region a player is standing in. Beyond about
+18 steps the plant's own temperature feedback arrests the climb before the rate settles, so the
1.0 DPM alarm is reached transiently rather than held.

---

## 5. The startup-rate block — proved, and then argued against

### 5a. There is no startup-rate rod block on this plant — measured, WITH a positive control

`pwr2_shell.js:1411` hands the control kernel `interlocks: []`. That is a source read, and a source
read cannot prove something is not built. So: hold WITHDRAW from bank 200 (8 steps below critical),
full stack, service-driven, and then **inject the retired plant's own 1.5 decades-per-minute
interlock into the same kernel** and repeat. If the injected leg does not refuse, the shipped leg's
zero proves nothing.

| leg | drive | peak startup rate | did the rods stop? | end state |
|---|---|---|---|---|
| **AS SHIPPED** | SLOW (8 steps/min) | **3.09 DPM** | **no** | bank 253, **18.8 % power, no trip** |
| **1.5 DPM interlock injected** | SLOW | 1.52 DPM | **YES — bank 232** | 0.001 % power, no trip |
| **AS SHIPPED** | MED (48 steps/min) | **18.26 DPM** | only by **SCRAM** | bank 270, 24.7 % at the trip |
| **1.5 DPM interlock injected** | MED | 1.60 DPM | **YES — bank 225** | 0.58 % power, no trip |

The probe can see a block; as shipped there is none. **Claim MEASURED: PWR2 has no startup-rate rod
withdrawal block, and the slowest drive on the board, held from the approach region, reaches 18.8 %
power without one thing on the plant stopping it.**

An earlier version of this same probe returned **0 refusals on both legs** and would have shipped as
a proof. It stepped the engine directly instead of the control layer, so `_evalInterlocks` was never
called, and then the withdrawal it drove never exceeded 1.5 DPM anyway. The positive control is the
only reason that is a paragraph rather than a finding.

### 5b. A 1.5 DPM block would not have caught the failure the owner described

Same plant, same stack, but the player *taps* rather than holds — **one single-step tap every 30
seconds** from bank 205, the patient route a cautious operator takes:

- **43 taps accepted, 2 refused.**
- **Peak startup rate 0.96 DPM** — it never reaches the existing 1.0 DPM *alarm*, let alone a 1.5 DPM
  block.
- The plant ends at **bank 248 and 20.4 % power**.
- What refuses the last two taps is the **intermediate-range high-flux rod stop at 20 % current
  equivalent power** — the sourced one this plant already has (WTSM 8.1 §8.1.7.3, ML11223A252),
  which throws by name: *"ROD WITHDRAWAL BLOCKED: the INTERMEDIATE RANGE high flux rod stop is
  standing."*

**A startup-rate block is a guard against the hand, not against the arithmetic.** It stops someone
leaning on WITHDRAW. It cannot stop someone adding 7.64 pcm every thirty seconds, because each
individual step is small and the rate never spikes — and that is precisely the route that produced
"nothing, and then it shoots up". The one stop that *did* fire is the one already built.

### 5c. If he wants one anyway — the measured proposal

Conditional. I do not recommend it, for the reason above and for design question 4: it is a
protection the player cannot see coming, whose only annunciation would be a refused press, on a
board that already carries the alarm at 1.0 DPM.

If it is built anyway, the setpoint should be **this plant's own number, not the unsourced 1.5**:

- **1.0 decades per minute**, clearing below **0.6 DPM**, withdrawal only, insertion always
  available. That is the setpoint the Startup Rate High **alarm** already stands on (Duke McGuire
  OP/1/A/6100/05 §2.1, ML20077E732 — INHERITED from the previous pass's evidence pass, not
  re-sourced here), so the block and the alarm would be the same number and the alarm becomes the
  warning that the stop is coming, rather than a second unrelated threshold.
- It would engage at roughly **+22 steps above critical held**, or within seconds of any *held*
  withdrawal at any of the three speeds. It would **not** engage on the authored 11-step creep
  (peak 0.36 DPM, INHERITED) nor on the tap-every-30-seconds route (peak 0.96 DPM, measured above).
- The player sees: the press refused with the kernel's own message, the rods stopped where they are
  (`on_engage: rod_stop_all`), and INSERT still working.
- **It must not be sold as protection.** There is no source for a startup-rate rod stop on a
  Westinghouse plant; the sourced stops are flux and temperature. It would be an administrative
  guard this sim chose, and the honest place to say so is in the block's own message.

---

## 6. So what should change — and it is text, not physics

`ui/manual_procedures.js` has another writer this session; nothing below was edited. Step 9 already
does a great deal right: it names INTER RANGE and STARTUP RATE, it says the source range will secure
itself, and it already tells the player to expect STARTUP RATE near 0.15 and REACTOR POWER to read
nothing for twenty-five minutes. What the measurements say is missing is **the comparison** — a
number that tells him whether *his* 0.47 is wrong when the step told him to expect 0.15.

Four proposed changes, each with the measurement behind it. All US customary, no SI, per the
standing ruling on walkthrough text.

**6.1 — Give STARTUP RATE a band, not an expectation.** The `why` says "Expect STARTUP RATE to
settle near 0.15". A player reading 0.47 has nothing to compare it with. Proposed sense:

> *"Once the rods have been still for five minutes, STARTUP RATE settles and stops changing. Near
> 0.15 is the approach going as written. Near 0.5 means you are about eight steps higher than you
> meant to be — power will arrive six times sooner and climb four times higher before it stops
> itself. Over 1.0 with the rods still, insert one step and wait."*

Measured: settled 0.13 DPM at +5 steps against 0.47 DPM at +13; REACTOR POWER first reads 0.1 % at
1809 s against 609 s; peak power 2.4 % against at least 6.1 % (the +13 run was stopped there, still rising slowly).

**6.2 — Say that the first reading after a tap is not the answer.** Nothing in the step says this,
and it is the thing that makes a rate-based rule usable. Measured: 12 s after the rods stop at +5
steps the tile reads `+1.15 DPM`; at 300 s it reads `+0.16`.

> *"STARTUP RATE jumps every time a rod moves and then falls back over about five minutes. Read it
> after it has stopped falling, not while it is."*

**6.3 — Point at INTER RANGE as the thing that MOVES, before the source range dies.** The step
currently hands the player to INTER RANGE at the moment the source range secures. The measurement
says INTER RANGE is on scale and climbing from the first second — `1.5e-10 A` to `2.7e-6 A` while
REACTOR POWER never leaves `0.0 %`.

> *"REACTOR POWER will read 0.0 % for about half an hour, and that is not the reactor doing nothing.
> INTER RANGE is the tile that moves the whole time — it climbs from around 1e-10 to 1e-6 amps
> before REACTOR POWER shows its first digit. Watch INTER RANGE and STARTUP RATE from your last tap,
> not REACTOR POWER."*

**6.4 — Name REACTOR PERIOD, because it is on the board and no step mentions it.** It is the
plain-language version of everything above: seconds per decade. Measured: `195 s` on the authored
approach, `55 s` at +13 steps.

> *"PERIOD, under the instrument card, is the same information in seconds: how long power takes to
> multiply by ten. Around 200 seconds is the approach going as written. Under 60 seconds means you
> are higher than you meant to be."*

**One thing NOT to do.** Do not flatten the climb. A constant period with an invisible first decade
and a visible second one is not a defect; it is what an exponential is, it is why startups are done
on a log instrument and a rate meter instead of a percent gauge, and teaching that is the
educational value here (design question 3 — plant dynamics). The fix is that the board's log
instruments are already correct and the step does not send the player to them early enough.

**Still standing from the previous pass, unchanged by anything here:** step 9's *"it reads about
three steps high, so the reactor goes critical just short of it"* is a claim about a quantity that
measures +1 to +5 depending on how long the player waits, and should become a direction rather than
a size (`CRITICALITY_APPROACH_2026-09-14.md` §6.1).

---

## 7. What this pass did NOT verify

- **Any gate.** No runner was executed and the aggregate was not run — the coordinator owns it.
- **The 1.0 DPM Startup Rate High alarm's source** (Duke McGuire OP/1/A/6100/05 §2.1, ML20077E732).
  Quoted in §5c as INHERITED from the previous pass; that document is not in any of the three lanes'
  corpora, so `find_source.js` cannot confirm it and I did not.
- **Whether the proposed wording in §6 fits every convention in
  `Blueprint/CHECKLIST_WRITING_GUIDE.md`** — it is inside the no-SI ruling and the one-step-carries-
  its-own-context rule, but the §7 "three sentences, one causal chain, one number" cap on `why` was
  not applied line by line, and step 9's `note` is already long.
- **The REACTOR PERIOD tile's behaviour at 1× and on a real screen.** It was read out of the DOM at
  60× with `advanceCycles`; whether a whole-second readout is legible while it is slewing, and
  whether it is where a player would look, is a playtest question, not a measurement.
- **Whether `true_state.reactor_period_s` on that tile is an HR1 problem.** It is a TRUE value drawn
  on the board rather than an instrumented one. Noted, not investigated.
- **The secured SOURCE RANGE `1.0e0 cps` reading.** Measured and reported in §3; I did not trace
  where the `1` comes from, did not check whether any gate asserts it, and proposed no fix.
- **Any route other than a parked bank.** The two board runs drive the rods out and stop. The
  authored ladder with its 1/M points and 150-second holds was measured by the previous pass, not by
  this one, and the peak-power and speed-equivalence figures quoted from it are INHERITED.
- **A second seed in the browser.** The app hard-codes seed `0x1234`; the seed axis was only covered
  in Node.
