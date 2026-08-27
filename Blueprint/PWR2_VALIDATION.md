# PWR2 — Validation (D5)

**Status:** DESIGN, for review. Nothing built. #479. Spine: `PWR2_DESIGN.md`.

---

## 1. The ladder — reuse the repo's patterns, do not invent

| L | What it proves | Pattern | Reference |
|---|---|---|---|
| **0** | Correlations match reality | Assert vs **external published data**; tolerance = the file's own claimed accuracy; plus a **negative control** | `test/run_pwr2_water.js` — **BUILT, 56/56** |
| **1** | **CLOSURE RESIDUAL** *(revised — see below)* | After the pressure solve, `M_total − Σρ(h_i,P)V_i − m_pzr(P)` stays below tolerance; and the Newton converges | **NEW — the assertion `engines/pwr/` cannot make in any form** |
| **2** | Engine-direct acceptance | In-file `Harness`, fixed dt 0.02, `test()/ck()`, explicit `runAll()` order array | `pwr_engine.js:2382/2582/4140` + `test/run_pwr.js` |
| **3** | Engine under the control layer | `OpsHarness` — M5 tick order, `evalDt`, recorder, `checkSanity` | `test/ops_harness.js` |
| **4** | Behaviour vs the catalog | Catalog-derived bands, `XFAIL`/`COVERAGE`, strict xfail **including XPASS-red** | `test/behavior_pwr.js` |
| **5** | Full stack | `SimulationService` + `tick()`, **never `start()`**; header stamps the layer | `test/measure_stack.js` |

> **⛔ REVIEW FINDING, 2026-08-13 — LAYER 1 AS SPECIFIED IS HOLLOW.** Conservation of `Σm` and
> `Σ(mh)` **passes trivially for any conservative-form integrator**, whether or not the state is
> physically consistent. It proves the bookkeeping, and nothing else. Specifically it cannot see
> D2's finding (A): that nothing enforces `m = ρ(h, P)·V`.
>
> **Add an L2 gate: VOLUME CLOSURE.** Assert `Σ ρ(h_i, P_i)·V_i = Σ m_i` to tolerance, per node
> and in total. **This would have caught the over-determination before any topology existed** —
> which is the whole argument for the layered ladder, and the ladder as first written would have
> missed it. It is the single most valuable addition to this document.
>
> This is also a worked instance of HR10: Layer 1 was written from what the architecture *does*
> (integrate conserved quantities) rather than from what it must be *right* about, so it could only
> ever confirm the thing it was derived from.
>
> ### UPDATE, 2026-08-13 — the architecture changed underneath this finding
>
> D2 §0 resolves the over-determination by making **`m` derived rather than integrated**, so
> **volume closure is now satisfied BY CONSTRUCTION and can no longer fail.** The gate as proposed
> above would be vacuous — a check that cannot go red, which is the exact failure mode this repo
> keeps re-learning.
>
> **What replaces it, and it is not vacuous.** Pressure is *solved* from the mass ledger
> (`M_total = Σρ(h_i,P)V_i + m_pzr(P)`, 1-D Newton), so the meaningful assertions are:
> 1. **Closure residual** after the solve stays below tolerance — catches a non-converging or
>    ill-conditioned solve, which is a real failure mode.
> 2. **Newton iteration count** stays bounded — catches conditioning degrading silently
>    (measured dM/dP: 26.9 kg/MPa bubbled, **10.6 solid** — the solid regime is genuinely
>    tighter and is where this would first bite).
> 3. **`M_total` drift** is zero to machine precision with no branches open — now trivially true,
>    since `M_total` is a single integrated scalar, so **this one IS weak** and should be labelled
>    as a smoke test rather than evidence.
>
> **Note what just happened, because it is the same lesson twice:** the original Layer 1 was
> hollow, the review's proposed fix was right *for the architecture as it then stood*, and the
> architecture change made the fix vacuous in a different way. **A gate must be re-checked against
> the design it guards whenever that design moves** — inheriting a gate is inheriting a claim.

**Layer 1 is the one that justifies the rewrite** and it must be written first, before any plant
topology exists. A closed loop of N nodes with arbitrary initial enthalpies, no sources, no sinks:
total mass constant, total energy constant, to ~1e-12 relative. **If that cannot be made to pass,
nothing above it is worth building.**

**Layer 1 needs a vacuity guard.** A conservation check on a plant where nothing flows passes
trivially. Assert that the replay *moved* mass and energy between nodes — count the transfers, the
way `run_chart_math.js` counts re-fits.

---

## 2. The A/B harness

Both engines occupy the same interface, so the harness loads both, steps them in lockstep at
dt = 0.02 from matched initial conditions, and diffs the **109 shim-published fields** per
timestep. The comparison happens at the shim boundary because **that is the level every consumer
sees** — the UI, the control layer, the missions and the manuals all read published truth.

**Method from `test/run_chart_math.js`**, the repo's only true pin-and-replay harness, including
its **vacuity guard**: it counts how many frames took the interesting branch, so a replay that
silently drove nothing cannot pass. Adopt this — an A/B that ran a plant sitting at steady state
and reported "no divergence" is worthless and looks identical to success.

### It reports. It never passes or fails.

`run_chart_math`'s claim was *"nothing changed"*, which makes replay a **regression harness**.
**Here the claim is the opposite: things should change.** So the A/B emits a divergence table —
per field, per scenario: max absolute divergence, max relative, time of onset, and whether the
sign is consistent.

**Adjudication is HR9** — the plant is ground truth, and a `[derived]` number outranks a fitted
one — applied **one divergence at a time** (the standing "adjudicate reds ONE AT A TIME" rule, at
scale). A divergence table read as pass/fail would either bless every change or reject every
change, and both are wrong.

**Three outcomes per divergence:**
1. **PWR2 is right** — the old engine had a defect. File it, fix the content that depended on it.
2. **PWR2 is wrong** — a derivation error. Fix the derivation, never the number.
3. **Both defensible** — a modelling choice with no ground truth available. **Declare it**
   (`DESIGN_COMPANION` §8 departure) rather than letting the newer number win by default.

**The predicted-divergence set (D4 §2) is scored first**, because it was written in advance:
`primary_void_fraction`, `pzr_mass_frac`, `sg_mass_frac`, `core_void_fraction`,
`natural_circulation`. A divergence that was predicted is evidence the model is working; an
unpredicted one is a finding.

---

## 3. The Tier A acceptance set

`Blueprint/CURRICULUM.md`'s nine couplings are RULED and binding, and each carries a measured
number in the current plant — so they are simultaneously the educational requirement and the A/B's
most meaningful scenarios.

| | Coupling | Current measured | PWR2 expectation |
|---|---|---|---|
| A1 | Power follows load | 100 → 57.5 %, Tavg 579.3 → 602.1 °F | **Reproduce within a few %.** MTC is anchored to a sourced measurement; both engines should agree. |
| A2 | Tavg is the coupling variable | AUTO vs MANUAL excursion comparison | Reproduce qualitatively |
| A3 | Pressure follows temperature | 63 °F subcooling held through PWR-N15 | Reproduce |
| A4 | Level is not inventory | Level rises on load rejection, inventory flat | **May diverge** — pressurizer is #472's rebuild |
| A5 | SG is the only heat sink | Loss of feed → Tavg climbs | Reproduce |
| A6 | Decay heat | Post-scram tail | Reproduce — formulation unchanged |
| A7 | Xenon | 100.0 → 104.9 %, peak 4–5 h | Reproduce — formulation unchanged |
| A8 | Boron vs rods | Bank pegs 912/912 in ten minutes | **Expected to diverge** — boron becomes a transported scalar, so its lag is loop transit rather than a fitted first-order mixing constant |
| A9 | SG shrink/swell | −2.45 % at t+10 s | Reproduce exactly — it is an **instrument** effect and PWR2 does not change the instrument layer |

**A9 is a control case worth its place:** if it diverges, something is wrong in the *shim*, not the
physics, because nothing PWR2 changes should touch it.

---

## 4. Q9 — ANSWERED: what makes PWR2 ready to replace

All of, not most of:

1. **Layers 0–5 green**, with PWR2's Layer 2–5 gates at or above the current engine's baselines.
2. **Every divergence adjudicated** — none left in "unexplained". Each is a filed defect, a fixed
   derivation, or a declared departure.
3. **The nine Tier A couplings all expressible**, with the expected-divergence set matching the
   predictions written in D4 §2 *before* the A/B ran.
4. **`run_contract.js` green against PWR2** — 109 fields, both directions.
5. **Performance at or better than 12 plant-hours ≈ 35 s.**
6. **Zero `[tune]` constants.** If PWR2 has acquired one, the rewrite failed at its central
   premise and that is a stop condition, not a cleanup task.
7. **Owner ruling on saves** (D4 §5) taken.

**Not on the list, deliberately: "all missions and checklists still pass."** Content follows the
plant (HR9). If PWR2 is right and a mission breaks, **the mission is stale** — that is a
re-authoring bill, not a veto on the physics.

---

## 5. What could make this validation strategy fail

- **The A/B is only as good as the scenarios driven through it.** A divergence in a regime nobody
  exercises is invisible. The scenario set must include the Tier C **Core** casualties, not just
  steady state and Tier A. **Large break (E09) is NOT in the acceptance set** *(D1 §23, OWNER
  RULING 2026-08-14)* — it is a declared demonstration, so it is **run for stability and direction,
  never scored for divergence**. Scoring it would re-import, through the back door of a gate, the
  fidelity requirement the ruling removed.
- **The shim can mask a physics error** by translating a wrong native value into a plausible
  published one. D4 §6's independent shim tests are the mitigation; they are necessary, not
  sufficient.
- **Layer 1 conservation can pass on a model that is conservative but wrong** — conserving the
  wrong energy exactly. It proves bookkeeping, not physics. Layers 2–5 carry that burden, which is
  why Layer 1 is necessary but nowhere near sufficient (HR10).

---

# 6. THE ACCEPTANCE BAR — RULED 2026-08-13. This supersedes §§1–5's framing.

*(OWNER RULING, 2026-08-13: selected "Continue at ~12 nodes, change the acceptance bar")*

**Everything above judges PWR2 by residuals and convergence. That is an ANALYSIS-CODE standard and
it is the wrong one.** A simulator's virtue is never producing a bad frame, judged the way the
regulator judges simulators.

## 6.1 The bar

| Criterion | Standard | Source |
|---|---|---|
| **Directional correctness** | *"observable change in the parameters **correspond in direction** to those expected"* | ANS-3.5 via NRC IP 41502 §03.02 |
| **No missed alarm** | *"shall **not fail to cause an alarm** or automatic action if the reference unit would … under identical circumstances"* | same |
| **No spurious alarm** | *"shall **not cause an alarm** … if the reference unit would not"* | same |
| **Conservation** | **A BUDGET, NOT AN IDENTITY** — *"shall not violate … conservation of mass, momentum, and energy, **within the limits of** the verification, validation, and performance testing criteria"* | NEI 09-09 §3.9 (ML091310538) |
| **Real-time** | **local time lag < 1 s; global time lag < 1 % of simulated time** | CATHARE-2/SCAR, SNA 2003 — the only published definition of "late" found |
| **Curriculum** | all **nine Tier A couplings** expressible | `CURRICULUM.md` |
| Steady state | a tolerance band — **figure UNSOURCED.** ANS-3.5-2018 App. B Table B.1 is paywalled. **The ±2 % previously quoted is WITHDRAWN** (it traces to the 1985 edition). | — |

## 6.2 What this changes

- **Layer 1 becomes a conservation BUDGET with a stated number**, not a machine-precision
  assertion. The number is owed; it does not yet exist.
- **`M_total` drift is a SMOKE TEST, not evidence** — it is trivially true for a single integrated
  scalar. Labelled as such.
- **Keep as real gates:** the closure residual after the solve, and the **Newton iteration count**
  (conditioning degrades silently — dM/dP is 26.9 kg/MPa bubbled but **10.6 solid**, so the solid
  regime is where a cap first binds).
- **Frame-miss policy is now in scope.** Both nuclear (IAEA/MAAP4) and Modelica practice **let the
  frame slip, then repay the deficit until it reaches zero.** PWR2 has the mechanism
  (`timeAcceleration`, the step-count loop in `simulation_service.js`); **whether a crossing
  sub-step accrues a deficit that nothing repays is unverified** and is a silent failure.

## 6.3 ⛔ AMEND G3 — it currently forbids the thing the industry does

G3 (§17.6) pins the kink's magnitude so that **smoothing the state equation is a gate failure**.
That is right and must stay. **But as written it will be read as forbidding smoothing REGIME
TRANSITIONS**, which is precisely where two production codes independently place the fix:

- **THEATRe (1992)** blamed RELAP5's instability on *"the discontinuity which exist in the
  **interfacial heat transfer correlation package and the critical flow model**"* — and measured a
  *constant* timestep as more stable than adaptive cutback.
- **A real-time RELAP5-3D paper (2026)** lists, among changes *"accumulated over 3 decades"*,
  *"implementation of a **smooth transition between different heat transfer and flow regime
  conditions**"*.

**G3 must say explicitly: forbidden to smooth PROPERTIES; REQUIRED to smooth regime transitions.**

## 6.4 Where the smoothing goes — the specification owed

**This is the highest-value open gap in the whole design set, and D2 has never looked at it.**
Prior art to follow, all sourced:

| Code | Transition | Method |
|---|---|---|
| RELAP5 | subcooled → two-phase choking | sound speed interpolated over `1e-5 < α < 0.10`, chosen *"so that it would require several time steps to traverse the interpolation region"* |
| APROS | CHF | interpolated between correlations over mass flux 100–200 kg/m²·s; wetted → dry wall likewise |
| THEATRe | flow-pattern change | *"an exponential interpolation scheme … to prevent the numerical instability which might arise when abruptly switching from one flow pattern to another"* |
| CATHARE-SIMU | out-of-range | *"Optimization of treatment of 'out-of-range' variables"*; convergence criteria chosen *"to avoid oscillations problems when the water phase is residual"* |

**PWR2's transitions needing this treatment:** §9's film-coefficient regimes (single-phase →
nucleate boiling → CHF → film boiling), critical/break flow, and D3 §8's CCFL cap. **None is
specified.**

**The design rule to adopt, from RELAP5's own reasoning:** size each interpolation window so a node
takes **several timesteps to traverse it**. That is a `dt`-relative criterion, which is the same
form as §16.2's `band ≥ k·Δh_step` finding — reached independently, from the other direction.

---

## 20. A1 IS MEASURED, AND IT PASSES — 2026-08-16

§3's table has carried "PWR2 expectation: reproduce within a few %" since it was written. It is no
longer an expectation.

`test/run_pwr2_loadfollow.js` rides the whole stack — Layer 0 water, the conservation core, the
loop, the sources layer, kinetics, fuel, the reactor coupling and the steam generator — cuts steam
demand to 57.5 % and lets the plant find its own power. **Rods in MANUAL. Nothing moves them and
nothing sets a power.**

| | current engine | **PWR2 measured** | Δ |
|---|---|---|---|
| baseline Tavg | 579.3 °F | **577.70 °F** | −1.6 |
| power after the cut | 57.5 % | **54.20 %** | −3.3 points |
| final Tavg | 602.1 °F | **598.49 °F** | −3.6 |
| **Tavg rise** | **+22.8 °F** | **+20.79 °F** | −2.0 |

### 20.1 The chain, not just the endpoint

The gate asserts each link, because an endpoint check passes for a plant that got there by some
other route and the point of A1 is the MECHANISM:

```
  steam demand 100 -> 57.5 %
  -> secondary pressure   5.570 -> 8.170 MPa      (less steam drawn, so it backs up)
  -> primary Tavg        577.70 -> 598.49 degF    (a hotter sink removes less)
  -> fuel temperature     596.8 -> 469.6 degC     (the Doppler half)
  -> power                 99.63 -> 54.20 %       (temperature feedback alone)
  -> rho                            -4.17 pcm     (an equilibrium, not a drift)
```

**It settles in 60 seconds.** The slow crawl after that — 54.2 % creeping to 56.3 % over an hour —
is xenon burning out at the lower flux, 100.0 → 101.9 % of equilibrium. That is **A7 turning up
unbidden**, which is a better cross-check than a probe written for it.

### 20.2 Two more couplings fell out of the same harness

- **Reversibility.** Restore demand and the plant returns to 99.91 % and 577.37 °F with nobody
  resetting anything. A coupling that only works downward is a leak, not a feedback — and the
  check exists because a one-directional test would not have told them apart.
- **A5 — the SG is the only heat sink.** Cut steam to zero: the secondary pressurises
  5.57 → 14.83 MPa, Tavg climbs to 649.23 °F, and power falls to **4.87 %**. The plant shuts
  ITSELF down when the sink is removed. §3's row for A5 said "loss of feed → Tavg climbs"; the
  measured behaviour is stronger than the row claimed.

### 20.3 The bands are NOT fitted to the current engine

Deliberately, and it matters for how this row should be read later. PWR2's moderator coefficient
reads real Layer 0 density and measures **−23.4 pcm/°C** against the current engine's −26.8 — a
change `PWR2_PLANT.md` explicitly asked for. Its fuel rise is derived from sourced rod geometry and
a real resistance stack, **277 °C** against 389 from two `[tune]` constants. The two engines are
therefore *not expected to agree exactly*, and a check tight enough to force agreement would be
fitting the replacement to the plant it replaces — HR9 inverted.

So the gate's bands admit the declared difference (±5 points on power, ±6 °F on the rise) and are
tight enough that a broken link fails. All eight steam-generator mutations redden it.

### 20.4 ⚠ THE DEFECT THIS FOUND, AND WHY IT IS THE WORST KIND

`criticalBoron` evaluated Doppler at the **moderator** temperature for both feedbacks. That is
correct at ZERO POWER — there is no heat to drive a fuel-to-coolant rise, and it is the condition
the 975 ppm anchor is measured at, so the function was right for the caller it was written for.
Used to trim boron at RATED it is wrong by `alpha_D · (581.8 − 304.5)` = **693 pcm**.

What that looked like: the plant started 693 pcm subcritical, power dived to 43 %, and it bought
the reactivity back by **cooling 16 °C** — settling stable, critical, self-consistent, at a Tavg of
551 °F where the design point is 580. **Nothing was red.** Every absolute temperature in this
section would have been wrong by 29 °F and the only symptom was a number that looked plausible.

**A zero-power function used at power fails quietly.** The fix makes the fuel temperature an
explicit argument that defaults to the moderator temperature, so the zero-power call still reads
naturally and the at-power call has to say what it means. Two checks in `run_pwr2_reactor.js` had
been written against the cooled plant and were corrected with it.

### 20.5 AMENDED — the gap conductance was solved, and my prediction was WRONG — 2026-08-16

`D1` §35 predicted, in writing and as a reject criterion: *"A1 will move UP, toward the 57.5 % it
currently undershoots… if A1 does not improve, the reasoning above is wrong and the change should
be reverted rather than argued for."*

**It did not move up. The prediction is falsified.** Re-measured after solving `h_gap` to 3000 W/m²K:

| | current engine | before | **after** |
|---|---|---|---|
| power after cut | 57.5 % | 54.20 % | **54.00 %** |
| final Tavg | 602.1 °F | 598.49 | **603.92 °F** |
| Tavg rise | +22.8 °F | +20.79 | **+25.97 °F** |
| fuel at power | 693 °C | 596.9 | **699.1 °C** |

**Why the reasoning was wrong.** I argued that more Doppler means less power drop. But at steady
state **power is pinned by the steam energy balance, not by the reactivity balance** — the turbine
draws a fixed mass of steam at a given enthalpy, and the core must make exactly that. What the
reactivity balance sets is the **temperature at which that power is made**. So `h_gap` could never
have moved power; it could only ever move Tavg, which is precisely what it did.

**The reject criterion was therefore ill-posed, not merely unmet** — it tested a prediction derived
from a wrong mechanism model. `CLAUDE.md`'s standing trap covers exactly this: *a pre-declared
reject criterion can outlive its measurement — re-measure the criterion, not just the result,
before you let it reject anything.*

**The change is KEPT, on grounds independent of A1:**

1. The **Doppler defect** now reads 981 pcm against the sourced 950–1000; it was 725, outside.
2. The **full-power fuel temperature** lands at 699 °C against the current engine's 693 — 0.9 %,
   by a completely different route.
3. **Absolute final Tavg IMPROVED**, 598.49 → 603.92 against a target of 602.1: error −3.6 → +1.8.

What got slightly worse is the Tavg **rise**, +20.79 → +25.97 against +22.8: error −2.0 → +3.2,
comparable magnitude, opposite side. That is recorded rather than smoothed over.

**Power remains 3.5 points below the current engine and is now known NOT to be a Doppler effect.**
It is set by the steam side, so the residual lives in the steam-generator or turbine model, not in
the reactivity loop. That is the next thing to look at, and this section is what says where.

### 20.6 ⚠ THE A1 COMPARISON IS TIME-SENSITIVE, AND NEITHER NUMBER CARRIES A TIMESTAMP — 2026-08-16

§20.5 reported power "3.5 points below the current engine" and located the residual on the steam
side. **That figure was read 150 s after the demand cut, and A1 does not finish in 150 s.**

Ridden for six hours:

| t after the cut | power | SG duty | Tavg | xenon |
|---|---|---|---|---|
| 240 s *(gate sample)* | 54.00 % | — | 603.92 °F | 100.0 % |
| 600 s | 54.49 | 56.30 | 603.35 | 100.2 |
| 1800 s | 55.07 | 56.35 | **602.14** | 101.1 |
| 3600 s | 55.28 | 56.40 | 600.63 | 102.3 |
| 7200 s | 55.45 | 56.48 | 598.38 | 104.0 |

**Power asymptotes near 56.5 %, not 54 % — about ONE point below the current engine, not 3.5.**
And `duty` equals `steamQ` to two decimals throughout, which confirms §20.5's mechanism claim
directly: the steam side sets the sink and the core matches it.

**Tavg is not monotone after the cut.** It peaks around 604 °F and then FALLS as xenon builds to
104 % of equilibrium — rising xenon is negative reactivity, and with a negative moderator
coefficient the plant answers by cooling. So our trajectory **passes through the current engine's
602.1 °F at roughly 30 minutes** and keeps going.

### 20.6.1 What this means for how the row should be read

The §3 table records "100 → 57.5 %, Tavg 579.3 → 602.1 °F" **with no time attached**, and this
section is the first thing in the project to notice that the omission matters. On the xenon
timescale a PWR's post-load-change state moves for hours, so:

- **A single (power, Tavg) pair is not a sufficient specification of A1.** Two engines can agree
  perfectly and still disagree at every instant, or disagree at the sample point and cross later.
- Our gate samples at 240 s because the THERMAL transient settles in 60 s and running to xenon
  equilibrium costs 70 s of wall clock per simulated hour. That is a defensible sample point, but
  it must be **stated**, which it now is in the gate header.
- **The current engine's A1 numbers should be re-measured with a timestamp** before the comparison
  is treated as tight. Until that happens the honest claim is: PWR2 reproduces A1's mechanism and
  lands within about a point of power and a few degrees of Tavg *somewhere on a trajectory both
  engines traverse*, which is weaker than the §20 table implies and is the claim actually supported.

**This does not weaken §20's verdict** — the coupling is real, the chain is asserted link by link,
and the plant finds its own power. It sharpens what the numbers are evidence FOR.

### 20.7 ⚠ RETRACTION — THE A1 COMPARISON WAS BETWEEN TWO DIFFERENT EXPERIMENTS — 2026-08-16

§20 claimed A1 "passes" against the current engine. **The quantitative half of that claim is
withdrawn.** The mechanism half stands. Two separate problems, and the second is mine.

#### 20.7.1 The curriculum's A1 number does not reproduce on the current engine

`CURRICULUM.md` A1 records, undated: *"drop generator demand 100 → 60 MWe. **Measured:** power
**100 → 57.5 %** … Tavg **579.3 → 602.1 °F**."*

Re-measured 2026-08-16, full stack, `hot_full_power`, free-play lineup, rods MANUAL, the same
100 → 60 MWe drop, via `test/measure_stack.js`:

| | curriculum | **measured now** |
|---|---|---|
| power | 100 → 57.5 % | 100 → **76.7 %** |
| Tavg | 579.3 → 602.1 °F | 580.2 → **593.5 °F** |

The command was verified to land: `load_target_mwe` 60.00, `mwe_output` 60.00, `load_mode` manual.
Repeating with the `rods_tavg` channel engaged gives **76.65 %** — rod mode does not explain it.

**The arithmetic says 57.5 % was never consistent with 60 MWe on this plant.** 60 MWe at 76.7 % of
300 MWt is 26 % efficiency, against 33 % at full power — the ordinary part-load penalty. For the
plant to sit at 57.5 % thermal *while making 60 MWe* would require efficiency to RISE to 35 % at
part load, which is backwards. Filed as needing investigation; the curriculum row is a Tier A
teaching claim and one of the nine ruled couplings, so it matters beyond PWR2.

#### 20.7.2 My own error: the two engines were not given the same experiment

`run_pwr2_loadfollow.js` cuts **steam MASS FLOW to 57.5 % of rated**. The curriculum's A1 cuts
**ELECTRICAL demand to 60 MWe**. Those are not the same boundary condition, and part-load turbine
efficiency is exactly what separates them: 60 % electrical is 76.7 % thermal on the current engine.

So the comparison in §20 — PWR2's 54–56.5 % against "57.5 %" — put a steam-fraction result next to
a number produced by an electrical-load experiment, and the near-agreement was **a coincidence of
two similar-looking percentages**. PWR2 has no turbine model, so it cannot yet be given the real
experiment at all.

#### 20.7.3 What survives, precisely

- **The mechanism is demonstrated.** Steam demand → secondary pressure → primary Tavg → fuel
  temperature → power, asserted link by link, 8/8 steam-generator mutations reddening it. Nothing
  about §20.7 touches that.
- **Reversibility and A5 stand** — both are qualitative and boundary-condition-independent.
- **The self-regulation result stands**: the plant finds its own power against an imposed sink and
  returns to zero net reactivity, which `run_pwr2_reactor.js` establishes separately.
- **WITHDRAWN**: that PWR2 reproduces the current engine's A1 *numbers*. Until PWR2 has a turbine,
  the two engines cannot be driven with the same command, and the tolerance bands in
  `run_pwr2_loadfollow.js` should be read as pinning PWR2's own steam-fraction behaviour against
  regression — which is worth having — and NOT as an A/B agreement.

**The order of work this implies:** a turbine/generator model is now on the critical path for the
acceptance test, ahead of further tuning of anything the load-follow gate measures.

## 21. THE TURBINE LANDS A1 — AND IT LANDS ON THE CURRICULUM NUMBER — 2026-08-16

> **⚠ SUPERSEDED BY §23 (same day).** The measurement below is correct; the CLAIM built on it
> is not. The agreement depended on PWR2 having no safety valves — once `pwr2_relief.js`
> modelled them the same experiment moved 57.9 → 70.7 %. Read §23 before citing anything here.

§20.7 withdrew the quantitative A1 claim because PWR2 was being cut on **steam mass flow** while
the current engine's A1 cuts **electrical demand**, and PWR2 had no turbine to accept the second.
`engines/pwr2/pwr2_turbine.js` closes that. Driven with the same command:

| | `CURRICULUM.md` A1 | **PWR2, electrical demand** | current engine, today |
|---|---|---|---|
| power | **57.5 %** | **58.5 %** | 76.8 % |
| Tavg | 579.3 → **602.1 °F** | 578.0 → **601.1 °F** | 593.0 °F |
| command | 100 → 60 MWe | 100 → 60 MWe | 100 → 60 MWe |

**One point of power and one degree of Tavg.** The trajectory: 100 MWe held to t=300 s, then
60 MWe — power 99.54 → 58.7 % within a minute, Tavg 578.0 → 603.1 °F peak settling to 600.4 °F,
secondary 5.586 → 8.15 MPa, turbine deficit 0.000 MWe throughout (it always got the steam it asked
for), rho back to 0.0 pcm.

### 21.1 THE AGREEMENT IS REAL BUT THE CONFIGURATIONS ARE NOT IDENTICAL — say it plainly

PWR2 has **no steam dump and no atmospheric dump valve**. The current engine always finds a relief
path (#484: dump → ADV → SG safeties), and with rods in MANUAL that path stays open and holds the
reactor at 76.8 %.

The curriculum's number was measured **before #460**, when the shipped lineup had rods in **AUTO** —
the controller walks Tavg back to program, the dump reseats, and the plant settles on turbine steam
alone. **PWR2 settles on turbine steam alone because it has no dump to open.** Same endpoint,
different reason.

So the honest claim is narrow, and worth stating exactly:

> **PWR2's reactivity → fuel → steam-generator → turbine chain reproduces the current engine's
> CLOSED-RELIEF behaviour to about one point of power and one degree of Tavg.** It cannot yet
> reproduce the open-relief behaviour, because it has no relief path to open.

That is a stronger result than §20 claimed and a narrower one than §20 claimed — which is the point
of having withdrawn it rather than patched it.

### 21.2 What the turbine is, and the one number it did not have to fit

```
    W_electrical = m_steam * (h_g(P_sg) - h_feed) * eta_cycle
```

Layer 0 has **no entropy**, so a real isentropic expansion is unavailable, and faking one with a
fitted pressure ratio would be a fitted constant in thermodynamic clothing. The bracket is exactly
the heat the SG gives up per kg — the same expression `pwr2_sg.js` uses — so `eta_cycle` is a gross
thermal efficiency, which a source can speak to.

**It is a solve, not a fit:** at rated, steam flow is *defined* as 300 MWt / (h_g − h_feed), so
W = 300 MW · eta, and this plant's ruled identity is 300 MWt → 100 MWe. Hence **eta = 1/3 exactly**.

**Sourced corroboration** — Ginna UFSAR ch10 (ML20339A040) Table 10.1-1, turbine *"Maximum
guaranteed, kW 585,000 @ 1775 MWt"* = **32.96 %**, and §10.1.2.1's verified gross capability
612,855 kW = **34.53 %**. This plant sits at 33.33 %, between them. The efficiency was not chosen
to land there; it fell out of a rating that predates the file.

**Independent consistency check that was not constructed to pass:** the turbine's steam demand for
100 MWe computes to **164.25 kg/s**, and the SG's rated steam — derived separately as
300 MWt / (h_g − h_feed) — is **164.25 kg/s**. Two routes, same number.

Also sourced from the same chapter, and REPORTED not enforced (HR5): the load-following envelope,
*"step load increases of 10 % … ramp increases of 5 % of full power per min within the load range
of 12.8 % to 100 %"*. Turbine speed 1800 rpm comes from the same table.

### 21.3 Declared omissions

- **No part-load efficiency penalty** — `eta_cycle` is constant, so output is linear in steam flow.
  The current engine does not model it either (`pwr_steam_generator.js:575` has no enthalpy and no
  efficiency term at all), so this is not a regression, but neither engine can teach it.
- **No feedwater heating or extraction.** Ginna's condenser is sized for 4,235,070 lb/hr against a
  full-power steam flow near 985 kg/s — it sees about HALF the steam, the rest bled for feedwater
  heating. This model has one steam path, so a future condenser cannot scale its duty from Ginna's
  without accounting for extraction.
- **No shaft dynamics.** Speed is reported at rated or zero; coastdown belongs with a trip model,
  which is control-layer work.
- **NO GATE YET.** `run_pwr2_turbine.js` is owed, and until it exists this file is unmutated — the
  only PWR2 engine file in that state. The numbers above are measurements, not a gate.

## 22. THE STEAM SIDE VALIDATES AGAINST A SOURCE IT WAS NOT BUILT FROM — 2026-08-16

Found while looking for secondary relief setpoints, which makes it the useful kind of check: nothing
in the steam-side sizing was derived from this document, so agreement is evidence rather than
arithmetic.

**ML11223A213** (Westinghouse Technology Systems Manual), Table 3.2-7, a **four-loop** plant —
`Number of steam generators 4`, `Number of reactor coolant pumps 4`, so ~3411 MWt:

> *Steam generator conditions at full load* — **Steam flow 3.77×10⁶ lb/hr**, **Steam pressure
> 895 psig**, **Steam temperature 533.3 °F**, Moisture carryover 0.25 %.

### 22.1 The source is self-consistent, and Layer 0 reproduces it exactly

895 psig is **6.272 MPa** absolute. `pwr2_water.T_sat(6.272)` returns **278.5 °C = 533.3 °F**,
against the table's stated **533.3 °F**.

**Exact, to the tenth of a degree.** That is a saturation pair from a document our property library
has never seen, and it lands on the number. It also confirms the table describes *saturated* steam,
which is what a PWR steam generator makes — so the reading of the table is right as well as the
library.

### 22.2 The steam flow agrees to 1.7 %

| | |
|---|---|
| sourced, 4 loops | 3.77×10⁶ lb/hr × 4 = **1900 kg/s** at ~3411 MWt |
| specific | **0.5570 kg/s per MWt** |
| power-scaled to 300 MWt | **167.11 kg/s** |
| **this plant** | **164.25 kg/s** |
| difference | **−1.71 %** |

And the implied enthalpy rise, 3411 MW / 1900 kg/s = **1795.2 kJ/kg**, against this plant's
`h_g − h_feed` = **1826.5** — 1.7 % apart, the same discrepancy seen from the other side.

### 22.3 Why this is worth more than it looks

`164.25 kg/s` is not a number anyone chose. It falls out of **two independent routes that had to
agree** (§21.2): the steam generator computes it as 300 MWt / (h_g − h_feed), and the turbine as
100 MWe / (eta · (h_g − h_feed)), where eta is the plant's ruled 100/300 identity. Those two agreeing
is internal consistency. **This is the first EXTERNAL check on either of them**, and it puts the
pair within 2 % of a real plant's measured full-load steam flow, power-scaled.

The residual 1.7 % is expected and has a candidate: this plant's secondary runs at the Ginna-class
**810 psig**, while the sourced four-loop plant runs at **895 psig**. Higher pressure means lower
h_g, so a real 895-psig plant needs slightly *more* steam per MWt than ours — which is the sign the
discrepancy actually has. Recorded rather than tuned away; nothing here is fitted to it.

### 22.4 Also sourced from the same pass, for the relief model still to be built

- **SG safety valve highest setpoint 1234 psig** — ML11223A229, verbatim: *"to the highest setpoint
  of the steam generator safety valves (1234 psig)"*.
- **Design pressure steam side 1185 psig**, ML11223A213 Table 3.2-7.

These belong to different plant classes than this one and must be re-anchored, not adopted — the
same trap #380 recorded when a bracketed NUREG-1431 template figure was cited as a number. They are
recorded here so the relief work starts from a source rather than from recall.

## 23. §21's AGREEMENT WAS AN ARTIFACT OF A MISSING MODEL — 2026-08-16

**§21 is superseded by this section.** Its measurement was real; its interpretation was not.

§21 reported PWR2 landing on `CURRICULUM.md`'s A1 to **0.4 points of power and 0.17 °F**, on the
same 100 → 60 MWe command, and called it the acceptance test passing. Then `pwr2_relief.js` added
**safety valves**, and the same experiment moved:

```
    closed-relief A1, before safety valves modelled     57.90 %
    closed-relief A1, with safety valves modelled       70.69 %
```

**12.8 points, from adding a component rather than changing a constant.** The secondary was running
to 8.26 MPa with nothing to stop it; the safeties lift at 1085 psig (7.582 MPa) and cap it, and a
capped secondary removes less heat, so the reactor sits higher.

### 23.1 The agreement was measuring the absence of a component

The curriculum figure was taken with rods in **AUTO**: the controller walks Tavg back to program,
secondary pressure falls, the dump reseats, and the plant genuinely settles on turbine steam alone
with its safeties shut. PWR2 reached the same endpoint **because it had no relief path at all** —
not because it reproduced the mechanism.

That is HR10 in its exact form: *a passing test is not evidence the mechanism is right.* The check
was green for a reason unrelated to what it claimed to test, and it stayed green until an unrelated
piece of work made the missing component appear. **Nothing in the gate could have caught this** —
its mutations perturb code that exists, and this was a component that did not.

Worth being blunt about the sequence, because the shape of the mistake matters more than the number:
§20 claimed A1 passed and was retracted (§20.7, wrong experiment). §21 claimed it passed again on
the corrected experiment. §23 now says that second claim was also unearned, for a different reason.
**Three passes, two withdrawn.** The measurements were all correct; what kept failing was the step
from measurement to claim.

### 23.2 What PWR2 CAN be compared against, measured

> **⚠ SUPERSEDED BY §25 (same day).** The table below was measured with PWR2 on a PRESSURE
> dump law and the current engine on its Tavg-ERROR law -- different controllers. The
> agreement is coincidence, not evidence, and must not be cited as an A/B result.

The current engine as it is **today** — rods MANUAL, dump modulating, safeties shut — is the state
PWR2 can actually be given, and here it does well. Both plants, 100 → 60 MWe, same retyped dump law
(setpoint 7.03 MPa, band 0.25, max 0.28):

| | current engine | **PWR2** | Δ |
|---|---|---|---|
| Tavg | 593.0 °F | **592.95 °F** | **0.05** |
| dump position | 14.7 % | **15.00 %** | 0.3 pts |
| power | 76.8 % | **73.74 %** | 3.1 pts |
| safety valves | shut | shut | — |

Tavg to a twentieth of a degree and the dump to a third of a point are strong; the 3.1 points of
power are not explained and are recorded as open. Candidate: PWR2 has **no atmospheric dump valves**
(§ the relief file's closing note), so its relief ladder has a rung missing between the dump's range
and the safeties.

### 23.3 The two gaps this exposes, neither of which is a tuning problem

1. **No rod controller.** PWR2 cannot reach the pre-#460 state at all, because nothing walks Tavg
   back to its program after a load change. The gate now asserts the curriculum figure is **NOT**
   reached — asserting it would be asserting the absence of a controller.
2. **No protection layer.** On a full load rejection PWR2 rides it out on relief at ~67 % power. A
   real plant scrams: *"Complete loss of load, when operating above 50%, will cause a reactor trip"*
   (Ginna UFSAR ch10 §10.1.2.1). Declared in the gate rather than passed over.

### 23.4 The methodological rule this earns

**A component that does not exist cannot be mutated, so its absence is invisible to every gate that
covers the code around it.** The three artifacts in this session all have that shape — the missing
direct boron term (50/50 with 25/25 mutations against it), the missing turbine (which made the whole
A1 comparison the wrong experiment), and now the missing safety valves.

The only thing that found any of them was **reading a claim and asking what it depends on that is
not there**. That is not automatable, and it is worth budgeting for deliberately rather than hoping
a mutation score covers it.

## 24. THE 3.1-POINT RESIDUAL: TWO CANDIDATES RULED OUT, STILL OPEN — 2026-08-16

§23.2 left the open-relief power difference unexplained (PWR2 73.74 % against the current engine's
76.8 %) and named the missing atmospheric dump valves as the candidate. **Both that candidate and
the one that replaced it are now ruled out.** The residual stands.

### 24.1 PWR2's own balance closes — measured

At the settled open-relief point:

```
    core power              223.18 MW   (74.39 % of 300)
    SG duty                 224.55 MW
    turbine steam   99.52 kg/s x 1808.7 kJ/kg = 180.00 MW  ->  60.00 MWe at eta 0.3333
    dump steam      24.63 kg/s x 1808.7       =  44.55 MW
    total steam energy                          224.55 MW
    imbalance (core - steam)                     -1.37 MW   (0.6 %, still settling)
```

**Total steam energy equals SG duty to the decimal.** Whatever the difference between the engines
is, it is not a conservation error in PWR2.

### 24.2 Candidate 1 — the missing ADV. RULED OUT.

§23.2 proposed that PWR2's relief ladder has a rung missing between the dump's range and the
safeties. Re-reading the measurement that prompted it: in the current engine's 76.8 % case,
`adv_flow_normalized` reads **0**. The ADVs are not carrying anything there — they only opened in
#484's experiment when the condenser dump was deliberately disarmed. **The candidate was proposed
from the wrong measurement.**

### 24.3 Candidate 2 — an energy imbalance in the current engine. RULED OUT, AND IT WAS MY ERROR.

The replacement hypothesis: the current engine reports `core_heat_pct` 76.21 % against
`steam_out_total` 0.7371, a persistent 2.5-point excess across a full hour with Tavg falling and
pressurizer level flat — which would need a second heat sink to close.

**That comparison is invalid.** `pwr_steam_generator.js:395` sets `s.steam_out_total = steam_out` —
a normalized **mass** flow. `core_heat_pct` is a **heat** fraction. The SG's actual heat transfer is
computed separately, so the two are different quantities and are not required to be equal at a
pressure and enthalpy away from rated. There is **no established imbalance in the current engine**,
and this section should not be cited as evidence of one.

### 24.4 The error is the session's recurring shape, for the third time

- §20.7 — compared a **steam-mass-flow** cut against an **electrical-demand** cut.
- §23 — compared a plant **with** safety valves against a figure measured **without** them.
- §24.3 — compared a **mass** fraction against a **heat** fraction.

Every one is the same move: two numbers that look comparable, aren't, and agree or disagree for
reasons unrelated to the mechanism under test. **The tell is always a unit or a configuration that
was never stated**, and the fix is always the same — write down what each number IS before
subtracting them.

### 24.5 Where the residual stands

**Open.** PWR2 is internally consistent; the current engine is not shown to be otherwise; the two
plants differ by 3.1 points of power at the same command with the same dump law, and no mechanism
for it has survived scrutiny. Candidates not yet tested: a difference in SG heat-transfer
conductance at off-nominal pressure, a difference in feedwater enthalpy, or decay-heat accounting
(the current engine's `core_heat_pct` runs ~0.6 points above its `power_pct` at this state, and
PWR2's split is derived differently).

Recorded as open rather than attributed, because two attributions have already failed.

## 25. THE RESIDUAL IS EXPLAINED — THE TWO PLANTS RUN DIFFERENT DUMP CONTROLLERS — 2026-08-16

§24 left the 3.1-point open-relief difference open after two failed attributions. Found.

**`run_pwr2_loadfollow.js` commands its dump on a PRESSURE law. The current engine, at the A1
command, is running its Tavg-ERROR law.** They are different controllers, and the 15.00 % vs 14.75 %
agreement that made me believe otherwise was a coincidence.

### 25.1 How it was found — sweep the law, do not read it

Mapping the current engine's dump position against secondary pressure across five load targets:

| load | SG press | dump % | Tavg |
|---|---|---|---|
| 90 MWe | 6.20 MPa | 0 | 585.2 °F |
| 80 | 6.76 | 0 | 590.4 |
| 70 | 7.04 | 5.14 | 592.8 |
| 60 | 7.07 | 14.75 | 593.0 |
| 50 | **6.88** | **28.00** | 591.4 |

The last row kills the pressure hypothesis outright: **the dump is at its 28 % cap while pressure is
6.88 MPa, BELOW the 7.03 setpoint** where a pressure law gives exactly zero. No proportional-on-
pressure controller produces that row.

The channel's own hint says *"Automatic pressure-mode steam dump — opens proportionally above the
no-load setpoint"*, which is what I retyped from. It is true of one of the two modes. The other is
the **fast Tavg-error mode**, armed by `dump_load_reject_mwe: 40.0` on a load rejection — and the
A1 command, 100 → 60 MWe, is a rejection of exactly 40.

**Reading the config comment was not enough; sweeping the behaviour was.**

### 25.2 The A1 point sits on a cliff

| load | rejection | dump | **core heat** |
|---|---|---|---|
| 61 MWe | 39 | 13.90 % | 77.51 % |
| **60 MWe ← A1** | **40** | 14.75 % | **77.47 %** |
| **59 MWe** | **41** | **28.00 %** | **88.56 %** |

**One megawatt less demand, eleven points more reactor power** — stable over 45 minutes, dump pegged
at its cap, ~33 MWt made and dumped to the condenser. Reported on #484, which is the right home
because the root cause is the same: rods in MANUAL, so nothing walks Tavg back and an armed dump
never reseats.

### 25.3 What this means for PWR2's comparison

The open-relief agreement in §23.2 — Tavg to 0.05 °F, dump to 0.3 points — was reached **with the
wrong controller**, so it is coincidence and not evidence. The 3.1 points of power are the
difference between two dump laws, not two physics models.

**§23.2's table should not be cited as an A/B agreement.** What survives is §24.1: PWR2's own energy
balance closes exactly, which was never in question here.

To make the comparison real, PWR2's harness needs the Tavg-error law and its 40 MWe arm — which in
turn needs the Tref program (`546.8 → 580.1 °F` sliding on load). That is control-layer logic, and
by the standing ruling it does not go in the engine; it goes in the harness, declared, exactly as
the pressure law is now.

### 25.4 Fourth instance, and the pattern is now unmistakable

- §20.7 — a steam-mass-flow cut compared against an electrical-demand cut.
- §23 — a plant with safety valves compared against a figure measured without them.
- §24.3 — a mass fraction compared against a heat fraction.
- §25 — a pressure-law dump compared against a Tavg-error-law dump.

Four times, one move: **two configurations that were never written down side by side, assumed to
match because the numbers were close.** Closeness has now been wrong four times out of four.

The operational rule this earns: **before comparing two plants, write down every input that differs
and check each one — including the ones the documentation says are the same.** Three of these four
had a document asserting the equivalence I was relying on.

## 26. §25's MECHANISM WAS WRONG — SAME LAW, DIFFERENT SEMANTICS — 2026-08-16

**§25's conclusion stands; its diagnosis does not.** It said the two plants run different dump
*controllers* — a pressure law against a Tavg-error law. They do not, at the A1 command. They run
**the same pressure law with two different readings of what its proportional output means**, and
that is a subtler and more instructive error.

### 26.1 What the current engine actually computes

`pwr_steam_generator.js:210`:

```js
    dump = clip((s.steam_pressure_mpa - dump_setpoint) / sg.steam_dump_band, 0, 1);
    …
    dump = Math.min(dump, sg.steam_dump_max);
```

**The proportional output IS the share of rated steam flow.** `steam_dump_max` = 0.28 **caps** it.
My harness read the same term as a valve POSITION and multiplied by 0.28 — which is **3.57× shallower**
below the cap:

| P (MPa) | current engine | mine |
|---|---|---|
| 7.050 | 8.00 % | 2.24 % |
| 7.067 | **14.80 %** | 4.14 % |
| 7.100 | 28.00 % (capped) | 7.84 % |
| 7.164 | 28.00 % | **15.01 %** |

Both plants reported ~15 % dump — **at different pressures, by different formulas.** 14.80 % at
7.067 against 15.01 % at 7.164. The agreement was arithmetic coincidence twice over.

### 26.2 Why §25 reached the wrong mechanism

The 50 MWe row (dump at its 28 % cap while pressure sat at 6.88 MPa, *below* the setpoint) genuinely
cannot come from a pressure law — so a second mode had to exist, and it does: the fast Tavg-error
mode, armed by `dump_load_reject_mwe: 40.0`.

**But A1 is a rejection of exactly 40, and the arm is `rejectMwe > 40`** — strictly greater. So the
fast mode is NOT armed at the A1 command, and both plants are in pressure mode there. §25 correctly
identified a second mode and then wrongly assumed it was active in the case under test.

That is a distinct failure from the previous four: not two things assumed equal, but **a real
difference found in one regime and applied to another where it does not hold.**

### 26.3 Corrected, the comparison improves substantially

| | current engine | PWR2 (wrong semantics) | **PWR2 (corrected)** |
|---|---|---|---|
| SG pressure | 7.067 MPa | 7.164 | **7.071** — 0.004 apart |
| power | 76.81 % | 73.74 | **75.10 %** |
| Tavg | 593.00 °F | 592.95 | **592.12 °F** |
| dump | 14.75 % | 15.00 | **16.32 %** |

**Secondary pressure now agrees to 0.004 MPa** — the strongest single indication that the controller
matches, because pressure is what the law acts on. The power gap halves, **3.1 → 1.71 points**.

The residual dump difference is consistent rather than anomalous: the law passes ~4 points of dump
per 0.01 MPa, so 0.004 MPa of pressure difference is 1.6 points of dump. Both plants are on the law;
they sit a hair apart on it.

### 26.4 Standing

- **§23.2's "superseded" marker stays.** That table was measured with the wrong semantics.
- **§25's headline stays** (the agreement was coincidence); **§25.1's mechanism is corrected here.**
- The remaining **1.71 points of power** are unattributed. Untested: decay-heat accounting, SG
  conductance at off-nominal pressure, feedwater enthalpy.

### 26.5 The fifth instance, and it is a different species

Four previous errors were *two things assumed comparable that were not*. This one is **a correct
finding over-applied** — the fast mode is real, it just was not running in the case I invoked it
for. Over-correction is its own failure mode, and it produced a published retraction of a result
that was closer to right than the retraction was.

The rule that would have caught it: **when a sweep reveals a regime change, establish which side of
it your case sits on before reasoning from it.** The arming threshold was in the code I had already
read — `rejectMwe > 40` against a rejection of exactly 40 — and I did not check the inequality.

## 27. THE RESIDUAL IS CLOSED — IT IS THE DECLARED MODERATOR COEFFICIENT, AMPLIFIED 12× — 2026-08-16

§26 left 1.71 points of power unattributed. Built the full side-by-side first this time, and
reasoned second — which is what previous attempts skipped.

| quantity | current engine | PWR2 | Δ |
|---|---|---|---|
| fission power | 76.81 % | 75.10 % | **−1.71** |
| core heat | 77.39 % | 75.72 % | −1.67 |
| decay heat | 5.38 % | 5.31 % | −0.07 |
| **Tavg** | **593.00 °F** | **592.12 °F** | **−0.88** |
| T hot leg | 616.0 °F | 614.08 °F | −1.92 |
| T cold leg | 570.0 °F | 570.16 °F | +0.16 |
| SG pressure | 7.067 MPa | 7.070 MPa | +0.003 |
| dump | 14.74 % | 16.32 % | +1.58 |
| loop ΔT | 46.00 °F | 43.92 °F | −2.08 |

### 27.1 ⚠ One row is a KNOWN TRAP and is not a finding

`T secondary` reads **570.2 °F against 547.71 °F** — 22 °F apart at the same pressure, which looks
alarming and is not real. The current engine's `t_sg_c` is the **tube-bundle metal temperature**,
not the secondary saturation temperature. At 7.07 MPa, T_sat is ~548 °F, so **PWR2's 547.71 is the
correct saturation value** and the two quantities are simply different things.

This trap was already hit and recorded earlier in this same session, when `tools/pwr2_ab.js`
compared the same pair and produced a −7.6 % error against a truth of −2.5 %. It was fixed there
with a `satPairOK()` guard. **It cost a second encounter anyway**, which is an argument for the
guard living somewhere a person reads rather than only in one harness.

### 27.2 The mechanism: SG duty is a small difference of large numbers

```
    SG duty = UA * (Tavg - T_sat)
```

ΔT is **~25 °C** against a Tavg of **~311 °C**. So the duty — and therefore the power the reactor
must make to balance it — is sensitive to Tavg by a factor of **Tavg/ΔT ≈ 12**.

Checked both ways, and the arithmetic closes:

- **UA is the same in both plants.** PWR2: 228.53 MW / 24.67 °C = **9264 kW/K**, against the design
  value 9262 in `pwr2_sg.js`. The current engine at Tavg 593.0 °F with T_sat 286.6 °C gives
  25.07 °C of ΔT, and 9262 × 25.07 = **232.2 MW = 77.4 % of rated** — which is its measured core
  heat of **77.39 %**, to two decimals.
- **The amplification predicts the gap.** 0.49 °C of Tavg over a 24.67 °C ΔT is **2.0 %** of power.
  Measured difference: **2.2 %**.

So the two plants have the same heat exchanger doing the same thing. **The entire residual is the
0.88 °F difference in where the reactivity balance puts Tavg**, multiplied by twelve.

### 27.3 And that Tavg difference is a DECLARED design change, not a defect

Where a plant with rods in MANUAL settles is set by ρ = 0 — the sum of moderator, Doppler, boron and
xenon. PWR2's moderator coefficient reads **real Layer 0 density and measures −23.4 pcm/°C** against
the current engine's **−26.8**, which `PWR2_PLANT.md` explicitly asked for: *"PWR2's moderator
coefficient reads real density from L0, so the moderator feedback and the coolant it feeds back from
are the same water."*

A 13 % weaker moderator coefficient means the plant needs slightly more temperature change to close
the same reactivity balance — and it lands 0.88 °F away. **The residual is the change working, seen
through a 12× amplifier.**

### 27.4 Standing

**Closed.** The open-relief A/B now reads: same heat exchanger, same dump law, same command;
secondary pressure agreeing to 0.003 MPa; Tavg 0.88 °F apart for a declared and intended reason;
power following from that by the SG's own geometry.

Nothing here is fitted, and nothing needs tuning. What it does say is that **any future A/B on this
plant must quote Tavg to better than a tenth of a degree to say anything about power**, because the
SG converts one into the other with a gain of twelve. That is a property of the plant, not of the
comparison.

## 28. SCOPING THE `true_state` SHIM — THE NEXT WORK ITEM, MEASURED — 2026-08-16

The approved kinetics plan named what comes after it: *"The control layer — it already exists and is
not being rebuilt. PWR2 shims to the 109 `true_state` fields; that is the next piece of work after
this one."* This scopes that, with numbers rather than an estimate.

### 28.1 The measurement

Field list extracted **exactly as `test/run_contract.js` extracts it** — the fenced block under
`### 6.3 true_state fields, per plant`, `"name":` entries, `//` comments stripped. Using the same
parser as the gate matters: a hand-rolled scan of the same section returned **17** fields on the
first attempt, and that number was wrong enough to be obviously wrong, which is the only reason it
did not get built on.

```
    documented PWR contract fields        110
    PWR2 Layer 5 return keys               70
    exact name matches                      6   (5 %)
```

The six: `boron_ppm`, `core_heat_pct`, `load_target_mwe`, `mwe_output`, `power_pct`, `xenon_pct_eq`.

### 28.2 ⚠ THE 104 "MISSING" IS A NAME-MATCHING ARTIFACT, NOT A PHYSICS GAP

Spot-checked ten of them against the live engine rather than assuming:

| contract field | computed today as | value |
|---|---|---|
| `tavg_c` | `sg.primaryTavg(sys)` | 304.500 |
| `pressure_mpa` | `sys.P` | 15.410 |
| `thot_c` / `tcold_c` | node enthalpy → `T_from_h` | 304.500 |
| `fuel_temp_c` | `reactor.T_fuel_c` | 683.378 |
| `decay_heat_pct` | `reactor.decay_pct` | 6.247 |
| `reactivity_pcm` | `reactor.rho_pcm` | −742.159 |
| `steam_pressure_mpa` | `sg.P_sec` | 5.688 |
| `t_sg_c` | `sg.T_sec` | 272.111 |
| `sg_mass_frac` | `sg.mass_frac` | 1.000 |

**All ten exist and carry the right quantity.** They simply are not named what the contract names
them, which is exactly what a shim is for.

### 28.3 The honest split

Reading the 104 by hand and grouping them — this is a **scoping estimate**, not a gate:

- **~48 are a rename or a one-line derivation** from quantities Layer 5 already produces
  (temperatures, pressures, flows, fractions, the reactor split).
- **~56 need a system PWR2 does not have**, in coherent blocks:

| block | fields | note |
|---|---|---|
| pressurizer | ~10 | `pzr_*`, `porv_*`, `spray_*`, `subcooling_c` — **#472 owns this**, deliberately not built |
| containment | ~11 | `containment_*`, `ctmt_*` |
| protection / lineup | ~8 | `scrammed`, `msiv_open`, `station_blackout`, `plant_mode`, `load_mode` |
| condensate / condenser | ~6 | `condensate_*`, `cw_inlet_temp_c`, `condenser_vacuum_kpa` |
| damage | ~6 | `clad_temp_c`, `melted`, `fuel_damaged`, `zirc_heat_pct` |
| nuclear instruments | ~5 | `sr_counts_cps`, `ir_amps`, `startup_rate_dpm`, `reactor_period_s` |
| auxiliary feedwater | ~5 | `afw_*` |
| accumulators | ~5 | `accumulator_*` |

### 28.4 What this says about sequencing

**The shim is not one task.** Roughly half of it is mechanical and can be done now; the other half
is blocked behind systems that are either owned elsewhere (#472, the pressurizer) or not yet
designed.

So the useful shape is a shim that **maps what exists and declares the rest explicitly missing**,
rather than one that waits for the whole engine. `run_contract.js` already distinguishes the two
directions it needs — *doc field not in the engine* → STALE, *engine field not in the doc* →
UNDOCUMENTED — so a partial shim can be gated honestly from the first field.

**And the shim must not invent values.** Every PWR2 layer so far throws rather than fabricate a
missing driver (`fuelTemp_c`, `Q_core_kW`, `rated_steam_kgs`). A shim that returned `0` for
`containment_pressure_mpa` because containment is not built would be the same defect as the missing
components §23.4 catalogues — invisible, because the consumer cannot tell an unbuilt system from a
quiet one.

**Recommendation, for whoever picks this up:** build the shim over the ~48 derivable fields, have it
throw or report `null` for the rest with the reason attached, and let `run_contract.js` count the
gap. That turns 56 unbuilt fields from a silent hole into a measured backlog.

## 29. THE INTEGRATION PATH HAS THREE NAMING LAYERS, AND THE CONTROL LAYER NEVER READS `true_state` — 2026-08-16

§28 scoped the shim as "PWR2 → the 109 contract fields". That is the first hop of three, and the
question *"which missing fields block control-layer drive?"* — which I set out to answer — turns out
to be mis-posed.

### 29.1 The control layer does not read `true_state`. It reads INDICATIONS.

Scanned `pwr_control.js` and `control_kernel.js` for property reads, comments stripped:

```
    s.instruments      11
    s.control_state     8
    true_state.*        3      <- power_pct, load_target_mwe, feedwater_isolated
```

**Three direct reads out of the whole control layer.** And a scan for the 73 declared-missing
fields returns **zero** hits — every apparent match (`scrammed`, four times) is in a comment.

That is not a gap; **it is HR1 working exactly as written**: *gauges, alarms and automatic
protection read instrumented values.* The control layer consumes the instrument layer, and the
instrument layer consumes `true_state`. So the missing fields block the INSTRUMENTS, and the
instruments block control — one hop further out than the question assumed.

### 29.2 And instrument channels are named differently again

49 instrument channels are defined in `pwr_config.js`. Compared against the shim's output by name:

```
    source supplied under the same name       2      mwe_output, turbine_rpm
    name matching neither supplied nor missing 47
```

47 unmatched is not 47 missing — it is a **third vocabulary**. The instrument channel is
`primary_pressure` where the contract says `pressure_mpa`; `tavg` against `tavg_c`; `power_range`
against `power_pct`; `sg_level` against `sg_level_pct`; `core_exit_temp` against `t_core_exit_c`.

So the real chain is:

```
    PWR2 layers  ──shim──▶  true_state  ──instrument map──▶  indications  ──▶  control layer
                  (built)                  (exists, in the current engine)
```

### 29.3 What that means for sequencing

Reading the 49 channels against the shim's 37 supplied fields by hand, roughly **14 are feedable
today** — `tavg`, `thot`, `tcold`, `primary_pressure`, `power_range`, `steam_pressure`,
`core_exit_temp`, `charging_flow`, `letdown_flow`, `boron_analyzer`, `steam_dump_valve`,
`steam_flow`, `loop_delta_t` (derived), `rcs_flow`.

The other ~35 need the systems §28.3 enumerated: pressurizer level and subcooling, SG level,
containment, HPI and AFW discharge, accumulators, condenser vacuum, the source and intermediate
ranges, the OTΔT/OPΔT margins.

**So the integration milestone is not "finish the shim".** It is:

1. **A shim → instrument-name map** (mechanical, ~14 channels today, no new physics).
2. **The unbuilt systems**, in whatever order the owner rules, each unlocking its channels.

Neither is blocked on the other, and (1) is worth doing first because it makes (2) measurable: with
the map in place, building a system converts directly into a channel count, and the same
supplied/declared/unaccounted discipline the shim already enforces extends to the instrument layer.

### 29.4 The methodological note

**This section exists because a measurement returned zero and I did not believe it.** The scan said
no missing field blocks the control layer, which was suspicious enough to check by hand — and the
hand check confirmed the scan while overturning the question. Had I reported the zero, the record
would now say "nothing blocks control-layer drive", which is technically true and completely
misleading.

Sixth time this session that a number was right and the thing it was taken to mean was wrong.

## 30. THE MECHANICAL INTEGRATION PATH IS COMPLETE — AND THE MAP I PLANNED TO BUILD ALREADY EXISTED — 2026-08-16

§29 recommended building a shim → instrument-name map as the next mechanical step. **It exists.**
`engines/pwr/pwr_instruments.js:37` carries `SOURCE`, a 40-entry map of instrument id → the
`true_state` field that feeds it — `power_range: 'power_pct'`, `tavg: 'tavg_c'`,
`primary_pressure: 'pressure_mpa'`, and so on.

I found it by grepping for where `power_range` is produced before writing a line of the
replacement. That is the second time this session a check-before-building was worth more than the
building would have been, and it is worth stating plainly: **§29.3's recommendation was wrong, and
the work it proposed was already done.**

### 30.1 Measured against the real map

Reading `SOURCE` out of the file rather than retyping it, and resolving each entry against the
shim's output:

| | |
|---|---|
| instrument channels | **40** |
| **feedable by the shim today** | **16** |
| blocked by a declared-missing system | 24 |
| **source in neither state** | **0** |

The zero is the one that matters. **Every instrument channel's source field is either supplied or
explicitly declared missing** — the shim has an opinion about all forty, and none of them is a
surprise.

**Feedable now (16):** `power_range`, `tavg`, `thot`, `tcold`, `primary_pressure`, `steam_pressure`,
`core_exit_temp`, `steam_flow`, `sg_steam_flow`, `steam_dump_valve`, `charging_flow`,
`letdown_flow`, `boron_analyzer`, `rcs_flow`, `mwe_output`, `turbine_rpm`.

**Blocked (24), by owning system:** containment 4 · condenser 4 · pressurizer 3 · nuclear
instruments 3 · ECCS detail 2 · SG level geometry 2 · auxiliary feedwater 2 · accumulators 1 ·
atmospheric dump 1 · break/leak 1 · turbine detail 1.

### 30.2 What this settles

```
    PWR2 layers ──shim──▶ true_state ──SOURCE map──▶ indications ──▶ control layer
       (built)    (built)              (already existed)
```

**Every mechanical hop is in place.** Nothing further can be translated, renamed or wired: the 24
blocked channels are blocked because the plant does not have the systems, and the only way to move
that number is to build one.

That makes the next decision a clean one — **which system, and the payoff is now countable**:
containment or the condenser unlock 4 channels each, the pressurizer 3 (and it is #472's, not this
lane's), nuclear instruments 3.

### 30.3 Recorded honestly

This tick produced no code. It produced a measurement that **cancelled the work item it was meant to
scope**, and a number (16/40, 0 unaccounted) that says where the engine actually stands. That is a
better outcome than the map would have been, but it is worth being explicit that the plan in §29.3
was superseded within one tick by checking whether the thing already existed.

## 31. CONTAINMENT IS THE WRONG NEXT SYSTEM — IT IS BLOCKED BEHIND A BREAK MODEL — 2026-08-16

I named containment as the next build on channel count alone (4 blocked, joint-largest with the
condenser). The evidence pass says otherwise, and for a reason the count could not show.

### 31.1 What IS sourced

- **Containment net free volume 1×10⁶ ft³** — Ginna UFSAR ch15 (ML20339A101), the anchor plant.
- **Pre-accident initial conditions 125 °F and 1.0 psig** — same corpus.

### 31.2 What is NOT, and one near-miss worth recording

**No containment design pressure.** The only hit is NUREG-1431 Rev 4 Bases: *"[44.1] psig results
from the LOCA analysis… maximum peak containment atmosphere temperature of [385]°F"*. Both are
**bracketed template placeholders** — the plant-specific number a licensee fills in. That is exactly
the trap `CLAUDE.md` records from #380, where a bracketed *"~30–32 %"* SG lo-lo survived two
evidence passes because both verdicted the mechanism and inherited the figure. Not a source.

Also unsourced: containment spray flow, fan-cooler capacity, recombiner capacity.

### 31.3 The real objection is not the missing numbers — it is that containment would do NOTHING

Of the four blocked channels, only two come from a containment model at all:

| channel | needs |
|---|---|
| `containment_pressure_mpa` | free volume + **an energy source** |
| `containment_temp_c` | free volume + **an energy source** |
| `containment_sump_pct` | **break flow** — declared missing under *break / leak* |
| `ctmt_h2_pct` | **clad oxidation** — declared missing under *damage* |

And the energy source for the first two is *also* a break. **With no break model there is no mass and
no energy entering containment**, so a containment built today would report 1.0 psig and 125 °F
for ever: two constants where the condenser produced a coupling.

That is the difference between the condenser and containment, and the channel count could not
express it. **The condenser gated the dump the moment it existed** (§30, and the measured loss-of-
circulating-water ladder). Containment gates nothing until something can leak into it.

### 31.4 The dependency structure, which is the useful output

Sorting the eight unbuilt systems by what they need rather than what they supply:

**Independently meaningful today**
- **Auxiliary feedwater** (2 channels) — loss of feedwater needs no break; it is the TMI
  differentiator and the SG is already built.
- **Nuclear instruments** (3 channels) — source and intermediate range are a startup story, and
  kinetics already produces the flux they read.

**Blocked behind a BREAK/LEAK model** — the keystone
- containment (2 of its 4), damage (6), accumulators (5), ECCS detail (2), and `leak_flow` itself.
  That is **one system standing in front of roughly sixteen channels**.

**Owned elsewhere or instrument-layer**
- pressurizer (11, #472), SG level geometry (2, a level map).

### 31.5 Recommendation

**Build the break/leak model next, not containment.** It is the only unbuilt system whose absence
blocks four others, it makes the LOCA path expressible at all, and the layers underneath it are
already in place — `pwr2_sources.js` takes a `sources` driver that adds and removes mass, and
`pwr2_eccs.js` exists to answer a break.

The alternative worth stating: **auxiliary feedwater** is smaller, needs no break, and carries the
TMI lesson (*a drying steam generator stops absorbing heat whatever the dump does*). If the
preference is a quick coupling over a keystone, AFW is the better small step.

**I would not build containment until a break exists**, and this section is the record of why the
channel count was the wrong way to choose.

## 32. THE WIRING PASS — BREAK, CONTAINMENT, CONDENSER AND ECCS WERE BUILT AND NEVER CONNECTED — 2026-08-17

§31 recommended the break, and it landed the same session (commit `4c2b1b0`), followed by
containment (`efe58e6`). Both are real, gated, sourced systems. **Neither was wired to
`pwr2_true_state.js`, and neither was wired to the other.** Re-reading the shim after the
containment commit found the defect directly, not a gate: `MISSING` still declared containment
*"no containment model exists in PWR2"* — stale the moment the previous commit landed — and the
same was true of the condenser (built earlier, commit `b08bfeb`). **A shim that declares a built
system missing is the same defect this file exists to prevent, in the opposite direction**: a
consumer asking for `containment_pressure_mpa` was told "no model" when a real one already answers.

### 32.1 What closed

`pwr2_true_state.js` now consumes `ctx.break_` / `ctx.containment` / `ctx.condenser` / `ctx.eccs`.
Nine fields moved from `MISSING` to supplied: `leak_flow`, `containment_pressure_mpa`,
`containment_temp_c`, `condenser_vacuum_kpa`, `cw_inlet_temp_c`, `condenser_cooling_available`,
`hpi_active`, `hpi_flow_normalized`, `eccs_mode`. Coverage rose **37 → 46 of 109**, `run_pwr2_true_
state.js` 22 → 30 checks. `eccs_mode` and the two HPI booleans are `[derived]` — named directly off
state `pwr2_eccs.js` already carries (`hhsiRunning`/`lhsiRunning`, `total_kgs`), not new physics.
`hpi_discharge_pressure_mpa` stays declared-missing on purpose: the sourced HHSI/LHSI curves are
flow-vs-RCS-pressure only, with no discharge-head term to read a real number off — inventing one
would be exactly the fabrication this file exists to forbid.

### 32.2 The merge point that did not exist

`pwr2_core.js` already sums multiple `sources` entries at the same node correctly (CVCS proved it,
returning two entries at `cold_leg` today) — but nothing concatenated arrays FROM DIFFERENT Layer 5
systems before handing them to `stepPlant`. `pwr2_sources.js` now exports `mergeSources(...)`, a
plain concatenation, gated in `run_pwr2_sources.js` with its own injection self-test (13/13, no
blind spots) — including the mutation that matters most here: dropping every argument after the
first, which would let a break survive a merge while ECCS silently vanished from it.

### 32.3 The joint scenario, and what the numbers say

`test/run_pwr2_loca.js` — break + containment + ECCS driven together for the first time, 60 s at
the house `dt = 0.02 s`, a 0.001 m² (10 cm²) break at full power (15.41 MPa):

|  | measured |
|---|---|
| primary mass lost (ECCS off) | 5874.5 kg in 60 s |
| containment mass received | 5874.5 kg — **matches to 1×10⁻⁶ relative**, both figures are the same `mdot × dt` fed to two different ledgers |
| containment pressure | 0.1082 → 0.1299 MPa (125 °F/1.0 psig start) |
| containment temperature | 51.7 → 69.1 °C |
| ECCS start (lined up from t=0) | **t = 1.10 s** — the instant RCS pressure crosses the sourced 9.58 MPa HHSI shutoff head, not a scripted delay |
| net primary mass (ECCS live) | discharged − injected, closes to 1×10⁻⁴ relative |
| containment mass (ECCS live) | still exactly the break's own `discharged_kg` — ECCS is invisible to it, as it should be |
| Courant limit | held (`courantOK` true) for all 3000 steps in both runs, at the unchanged house cadence |

The ECCS-start number is the actual demonstration: nothing in the test schedules an injection time.
The engine answers "how much flow" from a sourced curve against whatever pressure the break has
produced, and the moment it crosses the shutoff head the flow appears — the mechanism
`pwr2_eccs.js`'s own header names as the point of using a curve instead of a constant.

### 32.4 Why this gate has no injection self-test, and that is deliberate

Every library file this scenario touches (`pwr2_break.js`, `pwr2_containment.js`, `pwr2_eccs.js`,
`pwr2_sources.js`) already carries its own mutation-tested gate. The only code that is NEW here is
the wiring itself, and it lives in the test's own `scenario()` function rather than in a `SRC`
string a harness could patch. Its defence is a tight quantitative closure instead — mass equalities
checked to 1×10⁻⁶–1×10⁻⁴ relative tolerance, not a pass/fail band — which a sign error, a dropped
term, or a double-count in the merge would fail directly rather than merely go unasserted.

### 32.5 Performance note, since it was a standing constraint this session

No substep machinery was added. `courantLimit()` binds on the smallest ring node's mass divided by
the MAIN LOOP flow, not on break flow directly, and the house `dt = 0.02 s` — unchanged everywhere
else in the engine — held through a break moving up to ~150 kg/s. Realism here cost nothing in
cadence.

### 32.6 Accumulators — the evidence pass completed, and the build stopped anyway

The plan's stretch goal was accumulators, conditional on `tools/find_source.js` finding real
numbers first. It did:

- **Water volume, Ginna UFSAR ch15 (ML20339A101)**: *"nominal accumulator water volume (1115 ft³)"*,
  sensitivity-table bounds 1090–1140 ft³.
- **Cover gas pressure, same document**: table gives *"Minimum Cover Gas Pressure 714.7 psia"*
  against a nominal *"Accumulator pressure Nominal (764.7 psia)"* and a sampled upper bound
  *804.7 psia*.
- **A DIFFERENT figure already sits in `pwr2_eccs.js`'s own header** — *"arm at a sourced 600 psi
  (4.14 MPa)"* — sourced instead from ML11223A220 (a generic USNRC HRTD training document): *"the
  remaining volume is filled with nitrogen at a pressure greater than 600 psig."* That is a
  **generic industry figure, not this plant's anchor**. Every other Layer 5 constant this session
  used Ginna's own number in preference to a generic one when both exist (the condenser, the
  relief valves, ECCS's own flow curves) — so building accumulators today would mean either
  reconciling two sources that disagree by ~100–200 psi, or quietly picking the wrong one under
  time pressure. Recorded here rather than resolved, so the reconciliation is owed rather than lost.

**The build stopped anyway, for a reason the evidence pass could not settle: the lane, not the
sourcing.** `pwr2_eccs.js`'s header already named the real objection when it deferred
accumulators: *"an accumulator is an INVENTORY with a level and a cover gas that expands as it
empties, so its discharge is a state, not a curve. It belongs with the pressurizer's compressible-
volume work (#472) rather than being invented here in a second incompatible way."* Issue #472 —
*"Rebuild the pressurizer from the ground up"* — is tagged `status-wip-workbench` and live RIGHT
NOW, on the same compressible-volume state machinery an accumulator needs. `CLAUDE.md`'s standing
rule is explicit: *"D3 consumes its design; must not race it."* Building an accumulator state model
in `backshop` today would be exactly that race — two lanes independently inventing the same kind of
physics, one of which is already someone's active, scoped work. **Stopping here is the deliberate
choice, not a shortfall against the plan.**

## 33. AUXILIARY FEEDWATER, BUILT INSTEAD — THE OTHER INDEPENDENTLY-MEANINGFUL SYSTEM — 2026-08-17

§31.4 named AFW alongside nuclear instruments as buildable without a break — it needs no accumulator
-shaped compressible-volume work either, so it did not carry the lane-race problem accumulators did.

**Sourced, Ginna UFSAR ch10/ch15**: one MDAFW pump rated **170 gpm** per SG (ch15, transient
analysis); TDAFW **200 % of one MDAFW's "required feedwater"** (ch10), i.e. exactly double — the
ratio is sourced, not assumed; design AFW temperature **70 °F** (ch15 table, the low end of a
70/100/100 sensitivity row). This single-loop plant gets ONE MDAFW and ONE TDAFW, the same "one
loop, one pump" convention already used for the RCP and CVCS's charging pump — Ginna's own ch10
text supports it directly: *"One motor-driven auxiliary feedwater pump (MDAFW) can supply
sufficient feedwater for removal of decay heat from the plant."*

**Scaled on POWER** (decay-heat duty, the ECCS/RHR/condenser basis), giving this plant **1.81 kg/s**
MDAFW-rated, **3.63 kg/s** TDAFW-rated — `test/run_pwr2_afw.js`, 19/19 checks, 7/7 mutations caught,
no blind spots.

**Declared, not modelled**: no pump curve (the corpus gives one rated point per pump, not a
head-flow curve, so `afw_discharge_pressure_mpa` stays declared-missing rather than invented — same
reasoning as ECCS's `hpi_discharge_pressure_mpa`); no CST inventory (`afw_blocked` stays
declared-missing — a real tank can run dry, this model's cannot). `pwr2_true_state.js` coverage:
**49/109 supplied, 60 declared missing, 0 unaccounted** — the second rise today, 46 → 49, three
fields (`afw_pump_running`, `afw_active`, `afw_flow_normalized`).

`stepAFW()` returns a plain kg/s and enthalpy rather than a Layer 3 `sources` entry — AFW feeds the
SECONDARY, and `pwr2_sg.js`'s `drivers.feed` already takes exactly that shape, so a caller adds AFW
to whatever main feedwater is running rather than replacing it. The TMI lesson this unlocks — a
drying SG stops absorbing heat whatever the dump does — is not yet DEMONSTRATED (that needs a
loss-of-main-feedwater scenario driving `pwr2_sg.js` to dryout with AFW as the only save, which is
scenario-authoring, not engine work, and out of scope for today per the owner's directive that
instructional content is placeholder for now). Built and gated; the demonstration is future work.

## 34. REACTOR PERIOD AND STARTUP RATE — THE OTHER TWO OF FIVE NUCLEAR-INSTRUMENT FIELDS — 2026-08-17

Third build today. §31.4's other independently-buildable candidate was nuclear instruments (3
channels). The evidence pass found real Ginna setpoints — the P-6 permissive at **5×10⁻¹¹ A**
(Ginna TS Bases, the plant's own anchor figure, preferred over a generic 10⁻¹⁰ A HRTD figure found
in the same pass) and a generic **10⁵ cps** source-range trip (NRC HRTD ML11216A094, no Ginna-
specific cps figure exists) — but **no full-scale calibration** anywhere in the corpus for turning
a neutron population into counts-per-second or amps. Two more searches (`"10-3 amps"`, `"IR
calibrat"`) confirmed the genuine zero. **Building `sr_counts_cps` / `ir_amps` / `sr_energized`
without that calibration would be fabricating an instrument reading** — exactly the defect
`pwr2_true_state.js` exists to forbid — so those three stay declared-missing.

**Reactor period and startup rate needed no such calibration**, because kinetics already tracks
the fission power fraction (`kr.power`) with full dynamic range from deep subcritical through
rated power — the SAME signal a real neutron population is, just not yet turned into an instrument
current. `T = dt / ln(P_new/P_old)`; `SUR = (60/ln 10) / T` — a textbook definition, computed from
`Math.LN10` rather than typed as the literal 26.06 some training texts quote, so the constant
cannot silently drift from its own derivation. Added to `pwr2_reactor.js` (the file that already
owns the fission signal) rather than a new file, since there is no new system here, only two more
derived outputs of one that exists.

**Measured** (the over-cooling recovery scenario `run_pwr2_reactor.js` already drives — rods
scrammed, RATED sink held on, the plant walks back through criticality on moderator feedback
alone): a critical reactor reports SUR = **-2×10⁻⁹ dpm** on step one (indistinguishable from zero);
**-3.37 dpm** at 1 s post-scram (still falling); **+12.28 dpm** at 10 s, power 42 % and climbing —
*"supercriticality is indicated by a constant positive startup rate and steadily increasing source
range count rate"* (ML11223A342), demonstrated numerically rather than asserted; **+0.08 dpm** at
24 s, re-settled near 100 %. `SUR * period` recovers `60/ln(10)` to 1e-9 as a pure identity, at any
point in the transient where period is finite — the check that would catch the constant being
typed wrong rather than derived.

`test/run_pwr2_reactor.js`: 27 → 34 checks, 18/18 mutations caught (four new: inverted ratio,
frozen `prevPower`, wrong signal — total heat instead of fission — and a mistyped constant).
`pwr2_true_state.js` coverage: **49 → 51 of 109**. `run_all.js`: 69 runners at baseline, unchanged
count from the AFW commit — this landed in the same foundational file five other gates depend on
(`pwr2_reactor.js`), so the full aggregate was re-run rather than assumed safe.

## 35. TWO DEFECTS BETWEEN PWR2 AND CORE DAMAGE — A POSITIVE EXCURSION ON EVERY LOCA, AND A STATE WITH NO WALL — 2026-08-17

The session's ruled work was **core damage** (owner ruling, 2026-08-17, selecting it over the
protection layer). The evidence pass came back rich — Baker-Just with its constants and its
1510 cal/g heat of reaction from Ginna UFSAR ch15, the 2200 °F (1204 °C) peak-clad limit and all
five 10 CFR 50.46 criteria quoted verbatim in the same chapter, TMI-2's whole-core zirconium
inventory of 23,600 kg (52,000 lb) and a 9,400 kg oxidation integral from GEND-061. None of it got
used, because **a probe written to check one premise found two defects standing between PWR2 and
any severe-accident scenario at all.** Both are now fixed and gated; core damage is not started.

### 35.1 The probe, and why it was written before any code

The plan rested on one unmeasured premise: that a voided PWR2 core node superheats, so damage can
be driven by coolant regime rather than by a water level (the level needs phase separation, which
Layer 2 does not have — that is #472's compressible-volume work and must not be raced). The
premise held. Everything around it did not.

**MEASURED, 0.005 m² (50 cm²) break at full power, no emergency core cooling: the entire plant is
NaN 62 s in.** Not the damage model — the plant. Nothing had ever run a PWR2 break past ~60 s.

### 35.2 Defect one — the enthalpy state had no wall while every reader had one

`pwr2_core.js` advances each node as `a[i] = h + dt*dH[i]/m_n[i]`. That divides by a node mass a
boil-off drives toward zero, and **nothing bounded the result.** The core node reached quality 1.0
at 0.4 kg of steam, `h` passed 1×10³⁰⁴ by t = 62 s, overflowed to Infinity, and NaN propagated
through the ring flows into every node, the kinetics precursors and the fuel temperature.

**What made it invisible is that every READER already clamps.** `T_from_h`, `rho_from_h` and the
vtable all saturate at the property envelope, so a node at h = 1×10³⁰⁴ reported 800 °C and a sane
density. The state was absurd for tens of seconds while every gauge read plausibly. `solveP` in
the same file carries a long, correct note about why the envelope must bound the pressure SEARCH —
*"a silent absurd answer is the exact failure mode this engine exists to make impossible"* — and
the identical argument was never applied to `h`.

The fix is the same wall, and it costs nothing: a node inside the envelope is never touched, and a
node outside it was **already** being read as clamped. `enthalpyClamped` and
`enthalpyDiscarded_kJ` are reported, in the same spirit as `envelopeExceeded`.

**⚠ THE TRAP INSIDE THE FIX, and I walked into it.** The first version clamped the stored `h`
*after* `solveP` returned. The solve then balanced mass against one set of densities while the
state held another — `RHO` saturates at the *table's* edge value, which differs from
`RHO(h_ceiling)` by up to 0.24 kg/m³ at 15.41 MPa (2235 psia), i.e. 0.5 kg on the core node,
re-introduced **every step** a node sits out of range. The clamp has to be inside `F(P)`. The gate
now checks it by reconstructing node masses from the stored enthalpies and requiring agreement to
the solve's **own reported residual** — which separates the two causes, because a clamp outside
the solve misses by ~0.5 kg per step and the capped bisection does not.

`run_pwr2_core.js`: 36 → 42 checks, 18/18 mutations. One of the four new mutations was **blind on
the first pass** and is worth the line: the "held at the ceiling" check was written as *at most*
the ceiling, so a ceiling built from the LIQUID limit — pinning every steam node ~2400 kJ/kg too
low — satisfied it perfectly. **A one-sided check on a clamp can only see it failing open; the
interesting failure is it closing in the wrong place.**

### 35.3 Defect two — PWR2 had a POSITIVE reactivity excursion on every large break

With the plant no longer overflowing, the reactor still diverged. Not the fuel model, and not the
integrator: **reactivity jumped to +3433 pcm at t = 60 s.** That is five times prompt critical.
Power went from 0.8 % to 4.7×10¹² **in one step**, and the fuel temperature followed it.

`moderatorReactivity` takes a **temperature** and rebuilds a density from it through the LIQUID
branch, `W.h_l(T, P)`. It therefore reports the density of liquid water at that temperature
whether or not any liquid water is there. **A boiling core was invisible to it, and there was no
void coefficient at all.** On a depressurising plant the coolant follows saturation *down*, so at
t = 60 s the core node was at 241 °C (466 °F) and 92.5 % steam while the term read "colder
moderator, therefore denser" and inserted positive reactivity — the exact inverse of the defining
safety characteristic of an undermoderated PWR, which is that voiding the core shuts it down.

The file's own header claimed *"PWR2's moderator coefficient reads real density from L0, so the
moderator feedback and the coolant it acts on cannot disagree."* That is true only while the
coolant is subcooled liquid, and nothing said so.

**THE FIX USES NO NEW CONSTANT.** `modCoeff` already converts a density difference into reactivity
and is calibrated against sourced BEAVRS / Watts Bar isothermal coefficients. What was missing was
not a coefficient but the **density deficit** — the gap between the density the moderator term
assumes and the density actually in the core, measured against saturated liquid at the same
pressure, and an **exact zero** on a subcooled core. So `rho_excess`, the critical-boron solve and
every single-phase gate are untouched by construction, not by re-tuning — the same "pin at rated"
discipline the owner ruled for the film coefficient hours earlier.

**MEASURED: −89.4 pcm per % void by volume**, against a real-PWR range of roughly −100 to −250.
Two things nearly caused that number to be "corrected" and both are worth recording:

- **Quality is not void fraction, and here they differ by 12×.** At 1.53 % quality the volume void
  is 18.8 %. Normalising on quality puts the coefficient at −1100 pcm per "% void", far outside
  every published range, and invites re-tuning a term that is correct. The gate writes the
  conversion out rather than taking it from the engine.
- **The first version of the reference died in exactly the case it existed for.** Differencing
  against "liquid at the node's own temperature" is exact while subcooled and meaningless once it
  is not: `T_from_h` clamps a dry node to 800 °C, `h_l` clamps that back to its 358 °C liquid
  limit, and at 0.1 MPa (14.5 psia) the result is itself two-phase. It reported **−7.6 pcm** on a
  completely dry core where the physical deficit is ~958 kg/m³, about −10,300 pcm. **A void
  coefficient that switches itself off in a voided core is worse than not having one**, because it
  is invisible.

The extrapolation is declared: a coefficient fitted over tens of kg/m³ of isothermal data is being
applied across a deficit up to ~958 kg/m³, so the magnitude past a few hundred is indicative. What
survives is the sign and the order — a fully voided core reads about −11,500 pcm and stays deeply
subcritical under any plausible nonlinearity. The alternative is not a better number; it is
+3433 pcm and a prompt excursion.

`run_pwr2_kinetics.js`: 63 → 71 checks, 40/40 mutations. **Two of the five new mutations were
blind on the first pass, and both were WIRING** — every new check called `voidReactivity`
directly, so all of them survived the term being dropped from the reactivity sum, and survived
`stepKinetics` never finding the `core` node. The remedy is two identical plants differing only in
the core node's enthalpy, stepped through the real entry point: **−6654 pcm apart, same legs, same
boron.** *A term that is correct and not wired in is the same defect as a term that is wrong*, and
it is the one this engine keeps producing — the missing direct boron term, and four
caller-option-silently-dropped defects before it.

### 35.4 What the fixes exposed: PWR2's fixtures have never been at their design point

Fixing the void coefficient reddened four checks in **`run_pwr2_loadfollow.js`, the acceptance
test** — Tier A coupling A1, power follows load. Adjudicated one at a time, they were all the same
finding, and it is not about the void term.

**MEASURED with the new term disabled, so the plant as it stood before today is reproduced
exactly:**

| | before today | with void feedback | design |
|---|---|---|---|
| primary pressure | 11.096 MPa (1609 psia) | 8.828 MPa (1280 psia) | **15.41 MPa (2235 psia)** |
| core subcooling | **0.0 °C** | **0.0 °C** | ~30 °C (54 °F) |
| core quality | 0.0032 | 0.0152 | 0 |
| Tavg | 577.98 °F | 548.99 °F | — |

**The baseline plant sits at saturation at rated power, and always did.** The block asserting it
was headed *"if the starting plant is not at its design point, nothing after this means anything"*
and it checked Tavg, secondary pressure and net reactivity — **never primary pressure and never
subcooling**, which is where the whole departure is. It passed a 579.30 °F Tavg check because a
depressurised plant happened to land near that number; the check and the condition were
independent. The same defect sat in `run_pwr2_reactor.js`, where a check read a **saturation
temperature** and its comment explained it as *"the core outlet doing exactly what it should"*.

The cause is the fixture: `S.createPlant` is a rigid loop with **no pressure control**, so it
depressurises to wherever its own energy balance puts it. The pressurizer that would hold
15.41 MPa is **#472**, live on the workbench lane, and must not be built here.

**AND THE BLOCK'S OWN CLAIM IS REFUTED BY MEASUREMENT.** The plant is not at its design point, and
A1 after it is unchanged:

| at the A1 sample point | before today | with void feedback |
|---|---|---|
| power | 71.1 % | **71.1 %** |
| Tavg | 594.81 °F | **594.77 °F** |
| dump fraction | 0.0784 | **0.0784** |
| post-cut fuel | 603.8 °C | **603.3 °C** |

Because the load cut **repressurises** the primary to 18 MPa and the core goes subcooled — 32.7 °C
(58.9 °F) of it — so the A1 sample is taken on a subcooled plant whatever the baseline did. Every
A1 check is untouched.

**One re-pointing worth its own line: a delta contaminated by a baseline is not a delta.** The
"fuel cools with it" check asserted a ≥80 °C drop. Across the change the *result* moved 0.5 °C
(603.8 → 603.3) while the *baseline* moved 21 °C (698.5 → 677.2), so the delta went 94.7 → 73.9
and failed. Re-banding 80 down to 60 would have fitted the check to whichever plant it last ran
against — the exact failure this file's own header calls out about the safety valves. It is now an
**identity**: the post-cut fuel must sit where `steadyFuelTemp` puts it for the core heat and
coolant temperature actually present. **It lands within 0.01 °C, on both plants.**

A second, smaller defect found on the way: the gate compared `base` from one plant against `cut`
from a *different* one (ridden with the dump law, without it for the baseline). A before-and-after
across two plants is not a before-and-after.

### 35.5 The discipline that says these are repairs and not refits

Every re-pointed check **passes on both engines** — `run_pwr2_loadfollow` 31/31 and
`run_pwr2_reactor` 35/35 with the void term disabled, and the same with it live. A check that had
to be re-banded to pass would have been refitted to the change; one that holds across it is
guarding the mechanism. Hard Rule 10, applied deliberately rather than cited.

### 35.6 What this leaves open

- **Core damage is NOT STARTED.** The evidence pass is complete and recorded above; the design is
  in the approved plan. The zirconium inventory falls out of geometry `pwr2_fuel.js` already
  carries — **2,136 kg derived clad-only against 2,554 kg from GEND-061's TMI-2 figure scaled on
  power, 83.6 %**, with the 16 % shortfall the right sign and size for the non-clad zirconium a
  whole-core figure includes. Baker-Just at the sourced milestones gives 1.67 % oxidation per
  100 s at 1800 °F and 6.60 % at the 2200 °F limit, against 50.46's own 17 % ceiling, with
  zirconium heat crossing decay heat between 2200 and 2550 °F. Nothing is fitted to any of it.
- **A deep blowdown still ends in NaN, and it is outside the declared envelope.** With both fixes
  a 0.0005 m² (5 cm²) break now runs cleanly for **840 s** — 15.48 → 0.14 MPa (2245 → 20 psia),
  the core voiding to dry superheated steam at 470 °C (878 °F) — before the plant reaches the
  0.1 MPa property floor with 2.4 % of its inventory left. `enthalpyClamped` fires one step before
  the NaN, so the engine does say it has left its range. Fixing it properly is the Layer 3 flow
  solve the design already records as open (D2 §23.2 step 4); it is not chased here.
- **#472 is now on PWR2's critical path for validation, not just for the pressurizer.** Two gates
  currently assert, correctly, that their plant cannot hold pressure. Until a pressurizer exists,
  no PWR2 fixture is at its design condition and every steady-state comparison carries that
  caveat.

## 36. THE THIRD ONE — THE REACTOR COOLANT PUMP DID NOT KNOW IT WAS PUMPING STEAM — 2026-08-17

§35 fixed two defects and then measured the clad temperature a core-damage model would see. It
was **1 °C above the coolant, for the entire blowdown.** That is the third defect, and it is the
same shape as the other two.

### 36.1 What the measurement said

With §35's fixes in, a 0.0005 m² (5 cm²) break at full power with no emergency core cooling runs
cleanly for 840 s. Through all of it:

| t (s) | `mdot_loop` | core quality | core coolant | clad rise |
|---|---|---|---|---|
| 0 | 1630 kg/s | 0.000 | 581 °F (305 °C) | 3 °C |
| 360 | **1630 kg/s** | **1.000** | 666 °F (352 °C) | 1 °C |
| 420 | **1630 kg/s** | **1.000** | 878 °F (470 °C) | 1 °C |
| 840 | **1630 kg/s** | 0.036 | 230 °F (110 °C) | 1 °C |

**`mdot_loop` never moved** — 1630 kg/s to four figures, with the core dry and superheated and
2.4 % of the plant's inventory left. The plant was circulating rated mass flow of steam.

### 36.2 The mechanism

```js
function pumpHead(sys) {
  if (sys.omega <= 0) return 0;
  var r = sys.omega / PUMP.w_rated;
  return PUMP.dP_rated * r * r;          // <- depends on shaft speed and NOTHING else
}
```

A centrifugal pump does not develop pressure, it develops **head**: `dP = rho*g*H`, so the pressure
rise scales with the density of what is in the impeller. Friction runs the other way — for a given
**mass** flow, `dP_f` goes as `1/rho`, because the same kg/s of a lighter fluid moves far faster and
pays for it quadratically. Neither term had a density in it. Both errors push the same way, which
is why the flow did not merely stay high, it stayed *exactly* at rated.

This is the same class as §35.3's moderator term and §35.2's unbounded enthalpy: **a term that
silently assumes single-phase liquid and has no way to notice the fluid changed.** Three of them in
one engine, found in one afternoon, each by measuring a scenario nobody had run.

### 36.3 Consequences, which is why this is not cosmetic

- **Core damage was unreachable.** 1630 kg/s of anything gives an enormous heat transfer
  coefficient, so the cladding sits ~1 °C above the coolant no matter how hot the coolant gets.
  No clad model, however carefully built, could have produced damage on top of it.
- **Natural circulation could never be observed.** It is a Tier A behaviour, and forced flow never
  stopped, so it could never take over. `run_pwr2_sources.js` tests natural circulation only on a
  fixture that trips the pump explicitly — which is why a green gate coexisted with this.
- Every loss-of-flow and loss-of-coolant casualty ran with full forced circulation throughout.

### 36.4 The fix needs no new constant, and is exactly neutral at rated

One ratio: the density the pump is actually working on, against the density its curve and the
friction coefficient were both calibrated at.

```
dP_pump     = dP_rated * (w/w_rated)^2 * (rho / rho_rated)
dP_friction = Kf * mdot*|mdot| / (rho / rho_rated)
```

`rho_rated` is resolved once from the design condition — 304.5 °C / 15.41 MPa (580 °F / 2235 psia)
— rather than typed, so it cannot drift from the point where `dP_rated` and `Kf` are balanced
against each other. **Both factors are exactly 1 there**, so the calibration is untouched by
construction, not by re-tuning: the same "pin at rated" discipline the owner ruled for the film
coefficient the same day, and the same one §35.3 used for the void coefficient.

**The equilibrium that falls out is the textbook pump-affinity result**, and this is what makes it a
derivation rather than a knob. Setting pump ΔP equal to friction ΔP:

```
dP_rated * d  =  Kf * mdot^2 / d      =>      mdot = mdot_rated * d
```

**Mass flow proportional to density** — a centrifugal pump at fixed speed moves a roughly constant
*volume*. Nothing was fitted to produce that; it is algebra on two terms that each had to be right
for their own reason. The gate checks it as an identity rather than a band and it lands to 1×10⁻³.

**THE RCP NODE'S OWN DENSITY**, not a loop average: the impeller works on its suction, so a loop
whose core has voided while the cold leg is still solid should keep pumping — and does, correctly,
under this form.

### 36.5 What it does to the plant

Same 5 cm² break, no emergency core cooling, after the fix:

| t (s) | `mdot_loop` | core quality | core coolant | implied clad |
|---|---|---|---|---|
| 60 | 1174 kg/s | 0.039 | 624 °F | 624 °F |
| 240 | 264 kg/s | 0.448 | 596 °F | 596 °F |
| 420 | 65 kg/s | **1.000** | 799 °F | **799 °F** |
| 600 | 31 kg/s | 1.000 | 1352 °F | **1389 °F** |
| 840 | 14 kg/s | 1.000 | 1472 °F (the envelope ceiling) | **1531 °F** |

Flow decays two orders of magnitude as the loop voids, and the cladding climbs past GEND-061's
1200 °F (650 °C) hydrogen-generation onset. It is not yet at Ginna's 1800 °F "the reaction can be
significant", and the core coolant is pinned at the property library's 800 °C (1472 °F) vapour
ceiling, which caps how far the clad can be carried by this route. Whether the 10 CFR 50.46 limit
of 2200 °F is reachable is **not yet known** and must not be assumed — it depends on the film
coefficient at very low flow, which is exactly what the clad model in the approved plan will
determine. That number must be chosen on physical grounds and the reachability *reported*, not
chosen to make damage reachable.

### 36.6 Blast radius: none

`node test/run_all.js --fast` — **all 69 runners at baseline, zero drift**, with the momentum
equation changed. That is the neutrality claim being cashed rather than asserted: a term that is
identically 1 at the design density cannot move a plant that stays there, and every existing
fixture does.

`run_pwr2_sources.js`: 26 → 30 checks, 17/17 mutations. The four new checks are the two halves of
the neutrality claim, a case where the ratio actually bites (a pump full of dry steam develops
0.0688 MPa against a rated 0.58), and the affinity identity.

**⚠ One test-authoring trap, mine:** the affinity check first read the density ratio *before* the
settling ride and failed at 0.3005 against 0.2418. Pinning the node enthalpies to hold the fluid
still drives the pressure solve to the 18 MPa envelope wall, which moves the density and therefore
the ratio. Compared at the same instant the identity is exact. **A ratio taken at one moment and
compared against a state from another is not an identity check** — it is two measurements of
different plants, the same error §35.4 found in the acceptance test's before-and-after.

## 37. THE CLADDING BECOMES A BODY — AND CORE DAMAGE IS MEASURED REACHABLE, NOT ASSUMED — 2026-08-17

Part 1 of the approved core-damage plan, under the owner's *"pin at rated"* ruling (2026-08-17).
`pwr2_fuel.js` ran one resistance stack from volume-average fuel straight to bulk coolant, with the
cladding as a pure conduction term and no temperature of its own, and a film coefficient frozen at
30,000 W/m²K. The file's own `OPEN` block had named the consequence and left it standing:

> *"UNSOURCED, and a CONSTANT where it should fall out of the coolant flow (Dittus-Boelter on the
> real mass flux)… the fuel rise does not grow when flow is lost, so this model UNDERSTATES fuel
> heatup on a loss of forced circulation. Recorded, not hidden."*

### 37.1 Two changes, both provably neutral at rated

**The stack is split at the clad**, giving the cladding a temperature state and a thermal mass. Half
its conduction resistance goes on each side of the node — the standard thin-shell lumping — and the
two halves sum:

```
r_fc + r_cw = (r_pellet + r_gap + r_clad/2) + (r_clad/2 + r_film) = r_total
```

**Measured to full double precision: `2.640194047628e-2` both ways.** So `r_total`, `UA_W_per_K` and
every resistance fraction are byte-identical to what the function returned before, which means
`steadyFuelTemp` (684.22 °C), the Doppler reference derived from it, and the gap conductance solved
against the sourced Doppler defect are all untouched. **A clad node changes the path, never the
destination** — that is what lets it be added to a calibrated model without re-solving anything.

**The film coefficient becomes a function of what the coolant is doing**, normalised so it is
*exactly* its old value at rated:

```
forced = h_rated * flowFrac^0.8 * [ (1-void) + void*vapor_ratio ]
h      = max(h_stagnant, forced)
```

`filmCoefficient(1, 0)` returns 30000 exactly. Three new `OPEN` values, each doing a distinct job:
`dittus_exp = 0.8` (the Dittus-Boelter Reynolds exponent), `vapor_ratio = 0.5` (vapour against
liquid at the *same mass flux*, from the property group k^0.6·cp^0.4·μ^-0.4 near 300 °C — higher
than intuition because equal mass flux means the vapour moves far faster), and `h_stagnant = 10`
W/m²K (natural convection to a gas; without a floor `h → 0` at zero flow and the rod temperature is
infinite, which is a missing regime rather than physics).

**The flow term does the work, not the phase term** — which is only true because §36 fixed the pump.

### 37.2 Why the clad had to be a state and not an algebraic temperature

Baker-Just is an exponential in temperature *integrated over time*. A clad temperature that steps
the instant cooling is lost gives a badly wrong oxidation history. **Measured: the clad time
constant is 0.061 s against the fuel's 3.7 s** — a factor of 60, and it is *shorter* than the house
`dt = 0.02` by only a factor of 3. That is stiff enough that explicit Euler is stable but
inaccurate, so the two-node system is advanced by an exact 2×2 matrix exponential (Sylvester's
formula, no eigenvectors needed), for the same reason the single node was advanced analytically:
stability must not depend on a caller's timestep.

**One 0.02 s step closes 29.7 % of the gap, against an analytic 1 − exp(−0.02/0.061) = 28 %.**

### 37.3 IS CORE DAMAGE REACHABLE? MEASURED, AND THE ANSWER IS "IT DEPENDS ON THE BREAK"

This is the question §36.5 refused to assume, because `h_stagnant` very nearly sets it — clad
temperature at decay heat is `Q/(S·h)`, so it is close to inversely proportional to that one
unsourced number. It was therefore chosen on physical grounds first and the reachability measured
afterwards. Full-power break, no emergency core cooling, no oxidation heat yet:

| milestone | source | 0.0005 m² (5 cm²) | 0.002 m² (20 cm²) |
|---|---|---|---|
| **1200 °F** hydrogen generation begins | GEND-061 §4.3 | t = 583 s | t = 334 s |
| **1800 °F** reaction "can be significant" | Ginna UFSAR ch15 | t = 1375 s | t = 532 s |
| **2200 °F** peak clad temperature limit | 10 CFR 50.46 criterion 1 | **not reached in 4000 s** (plateaus ~2020 °F) | **t = 981 s** |
| 3200 °F Zircaloy melt | — | not reached | not reached |

The small break **asymptotes below the limit** because decay heat decays faster than the film
coefficient falls; the larger break crosses it at 981 s, peaks, and then falls back as the decay
tail runs down. Both behaviours are physically sensible and neither was aimed for. **That the
answer differs by break size, rather than being "always" or "never", is the evidence that the
mechanism is doing the work and not a threshold.**

Note what is *absent* from that table: oxidation heat. Baker-Just at 1800–2200 °F is worth
0.4–1.6 % of rated (1200–4800 kW) against a decay tail of ~1.5 % at that time — so the reaction
roughly *doubles* the heat source exactly where the cladding already is. That is the acceleration
the contract describes and it is Part 2's subject, not a claim made here.

### 37.4 Declared, in the file headers

- **No departure-from-nucleate-boiling criterion and no film-boiling correlation.** Ginna UFSAR
  ch15 **names** Bishop-Sandberg-Tong as what VIPRE uses for the peak-clad-temperature calculation
  and gives neither its form nor its coefficients; the corpus has neither. The coefficient
  therefore blends on void rather than switching at critical heat flux. **Direction of error:
  optimistic** — early clad heat-up is too slow — so this model may not claim oxidation *onset
  timing*, only that the reaction runs once the core is dry. Having the document is not having
  the number.
- **The coolant is pinned at the 800 °C (1472 °F) property ceiling from ~750 s.** The clad is a
  metal node and is not bounded by the water envelope, but the heat it rejects is computed against
  a *clamped* coolant temperature, which **overstates** the removal and so **understates** clad
  temperature. Another optimistic direction, and it compounds with the one above rather than
  cancelling.
- **One lumped clad node, no axial or hot-channel peaking.** `clad_temp_c` will be a core-average
  clad temperature where the contract asks for a peak. Optimistic again: a real hot channel runs
  above core average.
- **Zircaloy density and specific heat are unsourced**, and live in `OPEN` beside `k_clad` and
  `h_film` rather than under a `[recalled]` tag — D1 §2 reserves that tag for values the owner has
  ruled may stand and warns against extending it. `RHO_ZR` does two jobs: it sets the clad thermal
  mass here and it *is* the zirconium inventory Part 2's reaction will consume.

### 37.5 The zirconium inventory, cross-checked against a source it was not built from

The clad mass falls out of geometry `pwr2_fuel.js` already carried — a **sourced** Westinghouse
17×17 lattice, 5,544 rods, 12.02 ft of active height — plus one density. **2,136 kg.**

GEND-061 §4.3: *"The TMI-2 reactor core contains a calculated 23,600 kg (52,000 lb) of zirconium"*,
at 2772 MWt. Power-scaled to this 300 MWt plant: **2,554 kg**. The lattice figure is **83.6 %** of
it — and it *must* land below, because a whole-core zirconium figure includes guide thimbles and
spacer grids that a clad-only calculation cannot see. Landing at or above it would mean the
cladding alone accounted for all the core's zirconium. **Right sign, right size, independent
route**, and the gate asserts the band rather than the number.

### 37.6 Gate

`run_pwr2_fuel.js`: 45 → 62 checks, 32/32 mutations, no blind spots. Three authoring traps, all
mine, all recorded in the file beside the checks they produced:

- **A guess wearing an assertion's clothes.** The oxidation-heat check asked for "more than 50 °C"
  of extra clad temperature from 5 MW of reaction and measured 12.7. The model was right and the
  expectation was invented: at that regime `UA_cw` is 397 kW/K, so 5000 kW *can only ever* be
  12.6 °C. Widening 50 down to 10 would have replaced one guess with another. It is now the
  identity `ΔT = Q_ox/UA_cw`, which cannot be fitted.
- **Every clad check read a SETTLED state**, where the clad sits at its equilibrium by definition —
  so a model slamming it straight there each step satisfied all of them. The injection self-test
  found exactly that. Only a transient can see a lag.
- **And the transient's first fixture measured the wrong node.** Started with fuel *and* clad at
  the coolant temperature it closed 0.1 % of the gap and looked like a failure — correctly, because
  cold fuel means no ΔT across the gap and no heat reaching the clad at all. That measures the
  fuel's time constant. Fuel hot, clad cold isolates the one under test.

Also corrected: `T_surface_c` was commented as "CLAD OUTER SURFACE" and the arithmetic always said
**pellet surface** (it subtracts only the pellet term from the fuel average). The centerline
identity the gate checks depends on it being the pellet surface, so the *name* was fixed and the
quantity left exactly where it was. The clad now has its own reported temperature.

`node test/run_all.js --fast`: all runners at baseline.

## 38. CLAD OXIDATION — AND NOTHING IN IT IS FITTED — 2026-08-17

Part 2 of the core-damage plan. `engines/pwr2/pwr2_damage.js`, and it is the most heavily sourced
file in this engine: the rate law, both its constants, its heat of reaction, the stoichiometry, the
fuel melting point and all three acceptance criteria are quoted from documents in the corpus.
**There is no knob.** So the gate does not check that the model is self-consistent — it checks that
the model **reproduces its own sources**, at points those sources state independently of the law.

### 38.1 What the evidence pass gave, and it gave more than expected

| fact | value | source |
|---|---|---|
| rate law | **d(w²)/dt = 33.3×10⁶ · exp(−45500 / 1.986·T)**, w mg/cm², t s, T K | Ginna UFSAR ch15 (ML20339A101) §15.3.2.4.2 |
| — mandated by | *"shall be calculated using the Baker-Just equation … ANL-6548"* | 10 CFR 50 Appendix K |
| — and **not steam limited** | *"The reaction shall be assumed not to be steam limited."* | same |
| heat of reaction | **1510 cal/g** | Ginna UFSAR ch15, same passage |
| stoichiometry | *"1 mol of zirconium reacting with 2 mol of water liberates 2 mol of hydrogen"* | GEND-061 §4.3 |
| peak clad limit | **2200 °F (1204 °C)** | 10 CFR 50.46 criterion 1, verbatim in Ginna ch15 |
| oxidation limit | **0.17 × cladding thickness** | criterion 2, same |
| hydrogen limit | **0.01 × the hypothetical all-clad amount** | criterion 3, same |
| UO₂ melting point | **3100 K (5100 °F)** | GEND-061 §4.3 |
| onset | *"very little hydrogen … until … 1,200 °F (650 °C)"* | GEND-061 §4.3 |

That App. K sentence matters more than it reads: **the absence of a steam-availability term in this
model is SOURCED, not an omission.**

### 38.2 The strongest check in the file: it agrees with the onset statements while having no threshold

There is **no onset temperature anywhere in the code** — only an Arrhenius exponent. Yet the law has
to be negligible where GEND-061 says *"very little hydrogen is generated"* and appreciable where
Ginna says it *"can be significant"*. A model with a hand-placed onset would satisfy both **by
construction** and prove nothing. Measured, oxidation of the cladding over 100 s at a held clad
temperature:

| clad temperature | source's own words | measured |
|---|---|---|
| 1200 °F (650 °C) | *"very little hydrogen is generated"* | **0.066 %** |
| 1800 °F (982 °C) | *"can be significant"* | **1.78 %** |
| 2200 °F (1204 °C) | 50.46's own limit | **7.04 %**, against 50.46's 17 % ceiling |

Three sourced statements, in the order the two documents put them in, from one exponent. The
2200 °F figure lands on the right side of criterion 2 with margin — which is what a plant analysed
to that limit ought to do, and nothing was aimed at it.

### 38.3 Two modelling decisions that each turned out to matter

**Integrated in w², not in w.** Baker-Just is parabolic, so `dw/dt = K/(2w)` is **singular at
w = 0** — a fresh core takes an infinite first step, or has to be started at a fudged non-zero
oxide. Advancing `w²` linearly is exact for constant K over a step, has no singularity, and is
monotone by construction, which is what the contract requires: *"the OXIDE state … is monotonic and
does not un-grow, but the heat release stops."* **The heat stopping needs no rule** — measured, the
release falls by more than six orders of magnitude when the core cools from 2200 °F to 300 °C, and
the Arrhenius factor does all of it.

The parabolic signature is checked directly: **quadrupling the time doubles the oxide, measured
2.0000 against 2.** Linear kinetics would give 4.

**w_max is mass over surface, not density × thickness.** The two disagree by 6 % — 352.3 against
374.9 mg/cm² — because ρ·t uses the *outer* radius for an area whose mass sits at a smaller mean
radius. M/S is the mass-consistent choice: it makes `w/w_max` exactly the fraction of the clad
inventory consumed, so 50.46's oxidation criterion and its hydrogen criterion are computed off one
quantity that **closes against `M_clad_kg` to 1×10⁻⁹** instead of two that nearly do.

### 38.4 The source does its own arithmetic twice, and we have to match it

GEND-061 computes hydrogen from zirconium in words, on two different masses. Reproducing those is a
check on **our reading of the document** as much as on the constant:

- 9,400 kg Zr → **415 kg** H₂, against the document's *"over 400 kg"*
- 10,500 kg Zr → **464 kg** H₂, against the document's *"460 kg"*

Both inside 1 %. And the engine has to *use* the ratio, not merely export it — the reported hydrogen
must equal it times the zirconium consumed, checked to 1×10⁻⁹.

### 38.5 The heat, and why damage accelerates

**1.58 % of rated at the 2200 °F limit**, against a decay tail of roughly 1.5 % by the time a core
gets there. **The reaction roughly doubles the heat source exactly where the cladding already is.**
That is the acceleration the contract describes — *"the one that makes core damage ACCELERATE
rather than decay with the decay tail"* — and it falls out of the sourced constants rather than
being arranged. On a healthy core at 650 °F it is **0.09 kW in a 300 MWt plant**.

### 38.6 The latches, and the split that is easy to get backwards

`fuel_damaged` latches on the **CLAD** passing 50.46's 2200 °F, because criterion 1 is a *cladding*
limit — the clad is the barrier. `melted` latches on the **FUEL** passing the UO₂ melting point,
because that is a *fuel* property. `destruction_cause` goes `"none"` → `"thermal_melt"`. All latch
and none clear: a core that has been damaged stays damaged.

Swapping the two temperatures is a real defect and the gate carries a mutation for each direction,
plus the pair of fixtures that separates them — hot clad with cool fuel must be *damaged and not
melted*, hot fuel with cool clad the reverse.

### 38.7 The shim: five fields land, and the sixth's reason CHANGES

`pwr2_true_state.js` coverage **51 → 56 of 109**, all five from systems landing, which is the only
legitimate way that number moves. `core_uncovered_frac` stays declared-missing — but **its reason
was rewritten, and that is the point.** It used to read *"no fuel-damage or clad-oxidation model"*,
which became false the moment this file landed. The real reason is sharper: the geometry is all
there (volume, midplane datum, 3.66 m flow length), and what is absent is **phase separation** —
Layer 2 is homogeneous equilibrium with no slip, so a collapsed level would make the uncovered
fraction identically the void fraction, asserting a stratification the model does not contain. That
machinery is #472's. The gate now checks the reason *names* the lane and no longer says "no model".

### 38.8 ⚠ THE DEFECT THIS COMMIT MADE, in the commit whose subject is not making it

The damage block landed **inside the auxiliary-feedwater guard** — `if (aw.total_kgs !== undefined)`
— so a caller supplying a damage model and no AFW got all five fields silently dropped and read
them as *"no model"*. That is `pwr2_true_state.js`'s own headline defect, verbatim: *"the wiring
stopped one call short of where the physics landed."*

Caught only because the wrecked-core fixture passes a **minimal context** — `sys`, `reactor`,
`damage`, nothing else — rather than the fully-populated one. On the populated fixture AFW is
present, the guard is satisfied, and every field appears. **A check written on the rich fixture
would have passed and the defect would have shipped.** It is now pinned by a mutation, and the
minimal-context fixture asserts every damage field rather than only the latches.

### 38.9 Gate

`run_pwr2_damage.js`: **43 checks, 22/22 mutations, no blind spots**. Two authoring traps, both mine:

- **A fixture that varied nothing.** The construction check passed `n_assemblies: 40` expecting more
  zirconium. `deriveGeometry` holds the core ENVELOPE fixed, so more assemblies means a
  proportionally shorter active height and `rod_length_total_m` — hence the inventory — is
  **unchanged**. Moved to the envelope, which changes the height directly.
- **A threshold asserted only from above.** The melt check drove the fuel one degree past 3100 K,
  which a model with the melting point set *anywhere below* also satisfies — the self-test found it
  blind to 3100 K becoming 2500 K. It now also requires that fuel 100 K *below* the point does not
  melt, which is what actually locates a threshold.

`run_pwr2_true_state.js`: 34 → 42 checks, 13/13 mutations. `node test/run_all.js --fast`:
**70 runners at baseline.**

## 39. THE CHAIN, DRIVEN ONCE — AND THE FEEDBACK IS WORTH 344 SECONDS — 2026-08-17

Part 3. Every link had a gate; nothing had driven them together, and the chain **is** the claim:

```
break -> inventory falls -> core voids -> LOOP FLOW COLLAPSES -> the film coefficient collapses
      -> the cladding heats -> Baker-Just runs -> ITS HEAT GOES BACK INTO THE CLADDING
      -> it heats faster -> the reaction runs faster still
```

That last feedback is the only thing here no single-file gate can see, and it is why core damage
behaves unlike every other transient in this engine: **it accelerates.** Everything else decays.

### 39.1 The chain, measured — 0.002 m² (20 cm²) break at full power, no emergency injection

| t (s) | event | source for the milestone |
|---|---|---|
| 108 | core void past 50 % | — |
| 131 | loop flow under 5 % of rated | — |
| **334** | clad reaches **1200 °F**, hydrogen generation begins | GEND-061 §4.3 |
| **507** | clad reaches **1800 °F**, reaction "can be significant" | Ginna UFSAR ch15 |
| **637** | clad reaches **2200 °F** — `fuel_damaged` latches | 10 CFR 50.46 criterion 1 |
| 749 | fuel passes the UO₂ melting point — `melted` latches | GEND-061 §4.3 |

The ordering is the evidence. **Voiding precedes the flow collapse, and the flow collapse precedes
the heat-up** — so the cladding heats because cooling was lost, not because the break happened.
That distinction is exactly what §36's pump fix bought: before it, the flow never collapsed and the
cladding never heated at all.

### 39.2 The feedback, isolated

The same scenario run twice, differing in one argument — whether the reaction's own heat is handed
back to the cladding:

| | feedback OFF | feedback ON |
|---|---|---|
| clad reaches 1200 °F | 334 s | **334 s** — identical |
| clad reaches 2200 °F | 981 s | **637 s** |
| cladding consumed at 1200 s | 15.4 % | **100 %** |

**Both runs reach the hydrogen onset at the same instant**, which is what makes everything after it
attributable: the feedback cannot act before there is a reaction to feed back. From there the two
diverge by **344 seconds** to the 50.46 limit and by a factor of six in oxidation. And the
feedback-off run still oxidises 15.4 %, so the comparison is against a model that does something —
a zero there would have proved nothing.

### 39.3 Closure instead of a mutation harness

No `loadFrom`/`MUTATIONS` here, deliberately and for `run_pwr2_loca.js`'s stated reason: every
library this touches already carries its own injection self-test, and the only new code is wiring
that lives in the test's own `scenario()` rather than in a patchable `SRC` string. The defence is
tight quantitative equality instead — a dropped term, a sign error or a double-count fails these
directly rather than merely going unasserted:

| claim | measured |
|---|---|
| energy released = 1510 cal/g × zirconium consumed | **13,497,322.3238 kJ**, both sides, tolerance 1 kJ |
| hydrogen = the stoichiometric ratio × it | 94.4257 kg, to 1×10⁻⁹ |
| oxidised mass = areal oxide × clad surface | 2136.3824 kg, to 1×10⁻⁹ |
| never more zirconium than the core contains | 2136 of 2136 kg |

Courant held for all 60,000 steps at the unchanged house `dt = 0.02 s`, with no substepping, in
both runs.

### 39.4 ⚠ TWO THINGS THIS GATE EXPLICITLY DOES NOT CLAIM

**TIMING.** When the cladding reaches a temperature depends on `pwr2_fuel.js`'s low-flow film
coefficient, which is unsourced, and on two declared optimistic simplifications. The times above
are recorded so the *acceleration* can be measured as a difference between two runs of the same
model — a real comparison — and are not offered as plant data.

**THE END STATE, and this is the one place the model runs PESSIMISTIC** where every other declared
simplification runs optimistic. Unmitigated, the reaction consumes 100 % of the cladding, because
nothing here models the two things that actually terminate it: **relocation** — GEND-061 lists
*"Zircaloy melting and relocation to generally colder regions and resulting reduced exposed-surface
areas"* among what makes TMI-2 hard to calculate — and **quenching**. TMI-2 itself stopped at ~45 %
because injection was restored. The terminal 100 % is what an unmitigated, unrelocated core does,
reported rather than asserted as prototypical.

### 39.5 The mitigated case runs, and it found one more defect

Emergency injection was tried on the same break, and it **works for 1250 s** — the cladding stays
at 230–450 °F, oxidation is zero and no latch fires. Then the plant reaches the 0.1 MPa property
floor with almost no inventory left, which is the condition #487 records, and the temperatures
diverge.

**The latches then reported `fuel_damaged` AND `melted` on a plant whose state had been lost.**
`NaN >= x` is false, so NaN alone never latched — the latch fired on the diverging *finite* values
on the way there. That is the worst possible failure mode for an outcome-grading flag: it is the
alarming answer, and it is unearned in exactly the way `pwr2_true_state.js` refuses to report *"not
scrammed"* from an engine with no protection layer.

`stepDamage` now **refuses a non-finite temperature loudly**, and leaves the latches untouched on
the way out. That is all this layer can honestly do — the divergence itself is #487's and is not
papered over here.

### 39.6 Gate

`test/run_pwr2_coredamage.js`, 18 checks. `run_pwr2_damage.js` 43 → 45.
`node test/run_all.js --fast`: **71 runners at baseline.**

## 40. THE PROTECTION SYSTEM — AND THE FIRST THING IT SAYS IS THAT THE PLANT CANNOT RUN — 2026-08-17

Owner ruling, 2026-08-17: the protection layer next, chosen over consolidating. `pwr2_protection.js`,
`test/run_pwr2_protection.js` — 57 checks, 24/24 mutations, no blind spots.

### 40.1 Sourced, from one table, with delays

Ginna UFSAR ch15 (ML20339A101) **Table 15.0-6, "Summary of RPS and ESFAS Functions Actuated"** gives
a setpoint *and* an analysis delay per function. Eight are built:

| function | setpoint | delay |
|---|---|---|
| High pressurizer pressure reactor trip | 2425 psia | 2.0 s |
| Low pressurizer pressure reactor trip | 1775 psia | 2.0 s |
| Power-range high flux, low setting | 35 % | 0.5 s |
| Power-range high flux, high setting | 118 % | 0.5 s |
| Low reactor coolant loop flow | 87 % | 1.0 s |
| Safety injection, low pressurizer pressure | 1715 psia | — |
| Safety injection, low steam pressure | 327.7 psia, **lead/lag 12/2** | 2.0 s |
| High-high steam flow | 155 % of nominal | 2.0 s |

**It reports and latches; it does not move anything.** The reactor protection system is automatic
plant hardware, so it acts on its own the way a safety valve lifts — the split `pwr2_relief.js`
already draws, where its safeties lift by themselves and its dump takes a caller's demand. So this
file evaluates, delays and latches, and the *caller* inserts the rods and lines up injection. **A
trip reported and not acted on is a wiring gap, and it is visible** — the shim shows `scrammed`
true while power stays up.

### 40.2 P-10, and why the asymmetry is the whole model

Ginna TS Bases B 3.3.1 on Power Range Neutron Flux-Low, verbatim: *"This Function may be **manually
blocked** by the operator when two-out-of-four power range channels are greater than approximately
8% RTP (P-10 setpoint). This Function is **automatically unblocked** when three-out-of-four power
range channels are below the P-10 setpoint."*

Blocking is an operator action the permissive merely *permits*; unblocking is automatic and the
operator has no say. So the block is a **permissive-gated enable that always auto-reinstates** —
never a defeatable trip, which is what this engine's predecessor shipped and had to have superseded
(#295 F1/F2). Modelled by **revoking the request itself** below the permissive, so it must be made
again on the way up; gating without revoking would leave a stale request that re-arms by itself.

**⚠ And the gate proved a line of mine redundant.** I had written `blockEffective = request && p10Met`
as well as the revoke. No mutation of the `&& p10Met` could be made to fail, because the revoke has
already cleared the request whenever the permissive is not met. Removed: *a guard that cannot alter
behaviour is not defence in depth, it is an untestable line* — and keeping it would have hidden
which mechanism carries the safety property. It is the revoke.

### 40.3 ⚠ OVERTEMPERATURE ΔT IS ABSENT, AND THIS IS THE BEST-EVIDENCED OMISSION IN THE ENGINE

Overtemperature and overpower ΔT are the DNBR protection and are what a real plant trips on first
in most transients. **The corpus has both halves and they cannot be joined:**

- **Ginna UFSAR ch15 Table 15.0-7 gives the CONSTANTS** — K1 1.30, K2 0.00093/psi, K3 0.0185/°F,
  K4 1.15, K5 0.0014/°F, K6 0.00/°F, T′ 564.6–576.0 °F, P′ 2250 psia.
- **NUREG-1431 Rev 4 Vol 1 (ML12100A222) Table 3.3.1-1 Note 1 gives the EQUATION** — and every
  constant in it is a bracketed placeholder: *"These values denoted with [*] are specified in the
  COLR."* The transfer-function structure on that page is also OCR-scrambled.

**And the two documents transpose the units on the symbols.** NUREG-1431 writes `K2 [*]/°F` and
`K3 [*]/psig`; Ginna gives K2 in /psi and K3 in /°F. Mapping Ginna's constants onto NUREG-1431's
equation therefore requires guessing which symbol carries which term — an inference across two
documents that disagree, on a page one of them has already mangled.

That is **the bracketed-placeholder trap and the OCR-column trap at once**, and both are already in
this project's standing trap list. **Having the constants is not having the equation.** Left out
rather than assembled.

Also absent, each for its own reason rather than one blanket one: low-low and high-high SG water
level (sourced, but `pwr2_sg.js` is lumped and has no level geometry — the fabricated linear scale
the shim already refuses); RCP undervoltage and underfrequency (57 Hz sourced, no electrical model);
turbine trip (no trip state on `pwr2_turbine.js`).

### 40.4 THE FIRST THING IT MEASURED: every PWR2 fixture runs below the low-pressure trip

The point of building this was that **PWR2 rides out a full load rejection at ~67 % power where a
real plant scrams**, so every casualty started from an unscrammed plant. Driving that scenario with
the protection system wired produced something else entirely.

| | |
|---|---|
| sourced low pressurizer pressure reactor trip | **1775 psia (12.238 MPa)** |
| design operating pressure | 2235 psia (15.41 MPa) |
| where the settling fixture actually sits | **1285 psia (8.860 MPa)** |
| margin | **490 psia BELOW the trip** |
| protection latches | **t = 9.08 s**, `lo_pzr_press`, at 11.229 MPa on the way down |

**The plant trips nine seconds into every run, on a real sourced setpoint, before any casualty is
injected.** The load-rejection measurement is unrunnable as a result: the trip fires at t = 6.70 s
against a rejection scheduled for t = 20 s.

**The protection system is not wrong — it is the first instrument PWR2 has had that reads on this.**
§35.4 found the fixtures were not at their design point (11.096 MPa, zero core subcooling) and
recorded it as #486, a caveat on steady-state comparisons. It is worse than a caveat: **a plant
490 psia below its low-pressure reactor trip is a plant that cannot run at all**, and until now
nothing in the engine could say so, because nothing knew what the setpoint was.

This escalates #486 from "steady-state comparisons carry a caveat" to **"no protection or casualty
scenario is meaningful until the pressurizer exists"** — and the pressurizer is #472, on the
workbench lane.

### 40.5 Gate

`run_pwr2_protection.js` — 57 checks, 24/24 mutations. Both directions are checked for every
function, because a protection system's first failure mode is tripping a healthy plant and its
second is being wired in and never firing.

**Three fixture defects of mine, all found by the injection self-test, and the third generalises:**

- **The at-power fixture inherited a lineup instead of stating one.** Twelve checks went red on a
  correct model because the low flux setting (35 % RTP) is permanently asserted at 100 % power and
  the fixture had not requested the block a real plant has in. #460's lesson exactly.
- **A "check on ordering" that could not distinguish two orderings.** The cascade check asserts the
  latch keeps the FIRST cause. Three arrangements failed to test it: one function per system (first
  = last); two crossed simultaneously (same step, so table order decides either way); and staged in
  time but with the later function later in the table (the per-step scan picks the earlier-in-table
  one regardless). **The arrangement that discriminates puts the second-in-time function EARLIER in
  the table.** Generalised: *a check on ordering is vacuous unless the two orderings disagree.*
- **A mutation that had quietly become a no-op.** `run_pwr2_true_state`'s "scram reported FALSE from
  an engine with no protection layer" injected `ts.scrammed = false` before the real assignment —
  which now exists and overwrites it. It reported as caught while testing nothing. Retired, its
  intent carried by two mutations at the real assignment site.

`pwr2_true_state.js` coverage **56 → 57 of 109**: `scrammed` is supplied, and the check that pinned
its absence was **turned around to guard the repair** rather than deleted — asserting false on a
healthy plant *and* true past a setpoint, because a supplied `false` is only worth anything if the
field can also be true. The old single "no protection layer" declaration split into four, each
naming the system that actually blocks it: main steam isolation, electrical, plant mode, and load
coupling.

`node test/run_all.js --fast`: **74 runners at baseline.**

## 41. THE AS-BUILT AUDIT ADJUDICATED — 18 VERDICTS, AND EVERY CONFIRMED FINDING LANDED — 2026-08-18

The #488 audit slice (independent, self-report clean; findings in
`RD_Audit/findings/pwr2_asbuilt/`, one comment per group on the issue) returned 18 verdicts on
18 subjects. This session re-verified the load-bearing ones on backshop HEAD before acting —
`d10_void`, `a1_hgap`, `c9_e18_fixture` all reproduce exactly at `ec051d1` — and landed the lot.
The audit's read of the build: **citations mostly survive checking** (kinetics integrator
externally validated at ≤9e-15/step against an independent RK4; Baker-Just verbatim to the
digit; the pump density coupling confirmed in full; the B5 lattice resolved 3-for-3 by reading
the page image). Where it failed, it failed two ways, and both are now fixed classes:

- **Claims about what the corpus does NOT contain** (A1.4 gap conductance "zero hits" — Ginna
  carries a transient 10,000 Btu/hr-ft²-°F; C7.3 the DELAYED "[sourced] typical" tag — zero
  documents; D12 "the corpus has neither" — WCAP-16009 §10-2 carries both). All corrected;
  D12 became a full evidence pass (below).
- **Prose never re-measured after the constants moved** (A1.5 the 581.8 °C fuel-temperature
  rationale, stale by 184 °F; C7.2 a kinetics validation table computed at β = 0.00645 against
  a shipped 0.006502; B6 a clad/gap bound measured before the clad was a thermal node).

**The one live physics-output defect — D10.2/E16.1, quality published as void fraction — is
fixed at the source**: `voidFraction(h, P)` in Layer 0 (α = x·v_g / (x·v_g + (1−x)·v_f), the
same vf/vg as `rho_from_h`, so ρ(h) ≡ (1−α)ρ_f + αρ_g is asserted as an identity), `coreRegime`
and both shim fields publish it, and the discriminator is pinned where the defect hid: a 1.53 %
quality core is **8.37 % void at 2235 psia** and up to 24.0 % at 1015 psia. Mutations replaying
the shipped defect red 10 checks in each of two gates. Measured blast radius on the damage
chain: the milestones move ~1 s earlier on a 636 s ride (real α > x → phase factor smaller),
every gate stays in-band. E16.2 (`steam_dump_valve_pct` fabricated from a retyped 0.28) now
publishes `pwr2_relief`'s own reported `dump_demand`, pinned on a commanded-open dump with the
condenser unavailable — 40 % open, 0 kg/s passing, where the flow-derived form read 0 %.

**The D12 evidence pass** (owner-selected, 2026-08-18): `vapor_ratio` is upgraded
[recalled] → **[derived]**. WCAP-16009 Table 10-3 (90 saturation rows, read from the page image
at 200 dpi — the OCR text layer is mangled) puts the Dittus-Boelter property group
(k^0.6·cp^0.4·μ^−0.4)_g/(…)_f at **0.403 / 0.495 / 0.535 / 0.551 across 502 / 1050 / 1260 /
1334 psia**, so the shipped 0.5 is the representative of a sourced band, not a recalled point —
and the value therefore did not move. Cross-check inside the same document: eqs 10-20..10-23
(ASME 1968 forms) reproduce the table's k_g at 300 °C to 3 % and μ_g to 0.3 %. `dittus_exp` is
[sourced-form]: Ginna ch15 names Dittus-Boelter verbatim for pre-DNB film heat transfer, and
0.8 is that correlation's defining exponent. Both the 1050-psia group value and band membership
are gated (`run_pwr2_fuel` 62 → 64).

Also landed from the audit: the A3 natural-circulation capability anchor (Ginna TS Bases,
*"as high as 3% RTP can be removed by natural circulation alone"*) as a gate check — 9 MW
carried at 116.5 kg/s with the core subcooled, the flow magnitude still deliberately
unasserted; the E17.5 scoping of `pwr2_damage`'s "every simplification points the same way" to
the severity chain (the timeline is not single-signed — `pwr2_break` declares a ~2× discharge
overstatement, pessimistic on timing); and the E16.3/E16.4 shim caveats (`t_core_exit_c` is the
node average, ~15–20 °F low at rated; `turbine_rpm` is a synthesized two-state).

**#487 resolved while here** (owner-selected into this batch): the filed 5 cm² floor NaN **no
longer reproduces at HEAD** — re-measured 3600 s at 5/20/50 cm², the plant drains to 0.08 %
inventory and floats at 15.7 psia (0.108 MPa), finite — because the pump density coupling
changed the endgame after the issue was filed. The cure is pinned (`run_pwr2_coredamage` third
scenario, 1800 s, asserting the run reaches the floor region AND stays finite), and the class
is backstopped: `pwr2_core` latches `sys.beyond_model` when the solve pins at the floor while
nodes clamp, and every later step HOLDS — state frozen, time flowing — with `stepPlant`
freezing rotor and momentum alongside. Unit-tested by a sink drive; two mutations red.

Issues: filed #490 (void), #491 (dump), #492 (provenance umbrella) per the audit charter;
all three resolved by this session's commit. #488 closed with the convergence row on #221.

## 42. ACCEPTANCE CASE ADOPTED FROM #489 — LOAD-FOLLOWING BELOW 75 MWe, RODS IN MANUAL — 2026-08-18

Handed to #479 by owner selection *(OWNER RULING, 2026-08-17: selected "Defer to the PWR2
rebuild (#479)" from options written for #484/#489 — a selection, not verbatim words)*. The
current engine, measured full-stack (M4+M5+M6, `hot_full_power`, free-play lineup, **rods
MANUAL** — the lineup is stated because three artifacts already went wrong by inheriting it),
load target stepped at t+300 s, settled at t+40 m, seed 4242:

| load MWe | 95 | 85 | 78 | 76 | **75** | 74 | 72 | 70 | 65 | 62 | **60** | **59** | 55 | 50 | 40 | 30 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| power % | 95.5 | 86.5 | 80.1 | 78.1 | **77.3** | 76.9 | 76.8 | 76.7 | 76.5 | 76.4 | **76.3** | **88.4** | 84.7 | 80.0 | 72.2 | 70.5 |
| dump % | 0 | 0 | 0 | 0 | **0** | 0.5 | 2.4 | 4.3 | 9.3 | 12.0 | 13.9 | **28 (cap)** | 28 | 28 | 28 | 28 |

Three regimes, and only the first load-follows: **≥75 MWe** power tracks load with the dump
shut; **60–74 MWe** power pins at 76.3–76.9 % across a 15 MWe span while the dump modulates —
the dump holds Tavg and therefore sets power, and the reactor follows the dump's demand, not
the turbine's; **≤59 MWe** the fast Tavg-error arm latches (separately ruled ACCEPTED,
DESIGN_COMPANION §8.30 / TR-1m — not part of this case). The current model cannot be *checked*
against this, only observed — there is no conservation law for "the plant runs a permanent
~14 % relief flow at steady state and calls it equilibrium" to be wrong against, which is
precisely #479's argument.

**The acceptance criterion is an OPEN plant-identity ruling** — two candidates, recorded
verbatim from the handoff, decision deferred to the owner at the pressurizer/secondary design
point:

1. **Load-following is continuous with rods in MANUAL** — reactor power monotone in load
   target over the dispatch range, no plateau wider than measurement noise. Strongest; forces
   the dump/Tavg interaction to be solved rather than emergent.
2. **The plateau is declared** — PWR2 may reproduce it, but the steady-state relief flow must
   be an explicit `Q = ṁΔh` term that closes, so "33 MWt to the condenser at steady state" is
   a number the model states rather than a residual.

Either way the **rod lineup is part of the case**, stated, never inherited (#460 made MANUAL
the shipped default and three artifacts each assumed AUTO). PWR2 cannot run this case yet —
it needs the secondary-side dump/Tavg control layer, which does not exist — so this section is
the parking spot the handoff asked for, not a result.

## 43. THE PRESSURIZER, STAGE 1 — THE PLANT HOLDS ITS DESIGN POINT, AND THREE FORMULATIONS DIED FIRST — 2026-08-18

*(OWNER RULING, 2026-08-18: "Option 1" — selecting "build PWR2's own pressurizer now, staged —
pressure control first, level machinery second — taking #472's measured findings as design
evidence, not its code" from three options put to him. This supersedes the wait-for-#472 posture
recorded in D1 §25.3 and D3 §4: that exact trade was the option set.)*

### 43.1 The evidence pass — every stage-1 number sourced or explicitly scaled

| quantity | value | source |
|---|---|---|
| Setpoint ladder (deltas about the operator setpoint) | prop. heaters full ON −15 / OFF +15 · backup ON −25 / OFF −17 · spray +25 → +75 linear · PORV +100 · safeties 2485 psig, 5 % blowdown | **WTSM Fig 10.2-3, read from the page image** (ML11223A287 — the text layer does not carry the figure); safety blowdown Ginna ch15 Model 1 verbatim |
| Controller | PID master, setpoint span 1700–2500 psig, operator-selectable | WTSM 10.2 (built proportional-only, declared — the figure's own note scopes the ladder to proportional output; measured cost ≤ 15 psi park) |
| Level program | 25 % no-load → 61.5 % full power; high-level trip 87 % | WTSM 10.3 (ML11223A290); Ginna TS Bases (ML20339A221) |
| Vessel volume | Ginna "650 cubic feet … equivalent to 87 %" → 747.1 ft³ at 1520 MWt → **147.5 ft³ (4.176 m³)** per-MWt at 300 MWt | Ginna TS Bases, derived; cross-checks: D2 §25.2's worked 4.13 m³ (1.1 %), WTSM 4-loop 0.526 ft³/MWt (7 %) |
| Heaters | 1794 kW (prop 414 + backup 1380) at 3411 MWt → **157.8 kW** scaled, source's own split; clears Ginna's ≥100 kW nat-circ LCO per-MWt 8× | WTSM 3.2 (ML11223A213); Ginna TS Bases |
| Spray | 840 gpm at 3411 MWt → **73.9 gpm (3.45 kg/s)**; needs a running RCP; +25/+75 band | WTSM 3.2; band corroborated Ginna ch15 Model 1 |
| PORV / safeties | 2×179,000 lb/hr @ +100 psi; 2×288,000 lb/hr @ 2500 psia; per-MWt scaled | Ginna TS Bases; Ginna ch15 Model 1 |
| Heater shed on SI / LOOP / uncovered | — | Ginna TS Bases; NUREG-0737 II.E.3.1 (7) (#447) |

**The scaling method is the declared claim**: per-MWt from the anchor plant. The OCR-mangled
Table/Figure reads used the page-image method the audit's B5 follow-up established.

### 43.2 Three formulations were built, measured, and killed before the fourth survived

All three are recorded in the module header because the failure classes generalise:

1. **Two-space split from the spaces' own ρ(h,P)** — sustained spray drove the steam space's h
   into the dome, its density rose ~5×, and the derived V_liq COLLAPSED: level 61.5 → 0 %
   during an *insurge*, then the plant rode its own spray to the 18 MPa ceiling. *A level must
   be monotone in mass*, which §25.2's saturation-density split is and a self-density split is not.
2. **§25.2 split + fully-mixed independent h_liq/h_steam** — settled at −0.5 psi, but a ±10 %
   duty step INVERTED the pressure response: a 35 °C-subcooled insurge mixed into 2.7 m³ of
   liquid state densified it ~36 kg/m³ and pulled the plant to 1711 psia. *A fully-mixed liquid
   space hands the bubble's job to compressed-liquid density*; real insurge water stratifies.
3. **State (m, total H), projected at frozen H** — compliance came out INVERTED (∂m/∂P < 0: at
   fixed total energy, higher P supports less saturated liquid) and the solve ran to the floor
   in one step. *Freezing an EXTENSIVE energy drops the compression work — the frozen variable
   must be INTENSIVE* — Layer 2's own "dh = v·dP" lesson met from the other side.

**The survivor**: one HEM vessel at specific enthalpy h̄ — the projection is
`V·rho_from_h(h̄, P)`, the same audit-validated function and the same frozen-intensive
discipline as every loop node; the level is D2 §25.2's one-division saturated split; water-solid
and emptied are §25.3's regime transitions and fall out of the same function (measured: dM/dP
226 kg/MPa with the bubble → 9.1 solid).

### 43.3 Measured, plant-coupled

- **The plant settles AT ITS DESIGN POINT**: 2238 psia balanced-duty, 2226 psia on the full
  SG/turbine fixture (err +3…+9 psi — inside the declared proportional-only park), core
  subcooling **45.0 °F (25 °C)** where the audit's E18 measured **zero, structurally**. The
  #486 escalation — "a plant 490 psia below its low-pressure reactor trip cannot run at all" —
  is repaired at cause for the steady-state fixtures.
- **Transients move the right way**: 60 s of +10 % duty outsurges −14 kg/s, level 64 → 23 %,
  pressure to 1886 psia with every heater in, then RECOVERS at ~0.33 psi/s; −10 % insurges and
  the level restores. The scram-recovery fixture's climb through criticality arrives ~8 s later
  than on the rigid plant (the vessel fights the depressurisation) — same mechanism, sample
  times re-measured.
- **Water-solid is reachable and expressed**: 3 kg/s of charging with control defeated drives
  the vessel solid in 54 s, after which the plant pressurises at **10.0 psi/s against 0.07**
  with the bubble — §25.3's compliance collapse, live, which the TMI curriculum depends on.
- Gates: `run_pwr2_pressurizer` NEW (39 checks, 10 mutations, none blind);
  `run_pwr2_loadfollow` and `run_pwr2_reactor` fixtures pressurized with the #486-era defect
  checks TURNED AROUND (the A1 chain held unchanged); `run_pwr2_true_state` supplies seven more
  contract fields (57 → 64 of 109).

### 43.4 Declared, not claimed

Spray is an energy sink whose mass stays in the loop (level optimistic during spray). The
controller is proportional-only. The vessel is saturated-equilibrium (no superheated steam
space on outsurge — low-pressure trips arrive pessimistically early; no subcooled pool on
insurge). Surge enthalpy transport into the loop side is not modelled at Layer 2 (the
conservation budget carries it). **The LOCA/core-damage scenarios were left on pressurizer-less
plants by this section's own stage-1 cut — that debt was paid the next day; §43.5 carries the
measured shifts.** Stage 2 owes: the two-h stratified states, level control via CVCS (the
25–61.5 % program as a controller), auxiliary spray, PORV block valve and tailpipe, and the
drained/TMI deception machinery.

### 43.5 The scenario fixtures, pressurized — #486 closed out — 2026-08-19

The LOCA and core-damage scenario fixtures now ride the staged vessel, measured on both plants
before the change landed:

| | rigid | pressurized | shift |
|---|---|---|---|
| 20 cm², void > 50 % | 27.6 s | 32.8 s | +5.2 |
| 20 cm², flow lost | 130.7 s | 137.6 s | +6.9 |
| 20 cm², 2200 °F (fb on) | 635.7 s | 646.6 s | +10.9 |
| 20 cm², melt | 748.0 s | 759.6 s | +11.6 |
| feedback acceleration at 2200 °F | 344 s | 356 s | — |
| 5 cm², 2200 °F | 1614.8 s | 1763.0 s | **+148** |

The vessel **outsurges into the break and empties at 22.1 s** on the 20 cm² break — after which
the plant is effectively the rigid one, hence the near-uniform shift; the 5 cm² slow leak is
fought ~150 s longer because 1,682 kg of vessel inventory and full heaters are real against a
small break. The feedback-attribution property (both runs reach the oxidation onset together —
now 342 s both) and the #487 floor endgame (0.108 MPa, 0.09 % inventory, finite at 1800 s)
both survive. **All 20 core-damage checks held without a band moving** — the ordinal/mechanism
design absorbing a deliberate fixture change — and exactly ONE LOCA band was re-measured: HHSI
start 3.0 → 30 s, because the vessel holds the plant above the 9.58 MPa shutoff head for a
measured **12.0 s**, the SI-delay role a real pressurizer plays in a medium break. Relief is
wired as the one-step-lag sink in both scenarios (it never fires in a blowdown; a
wired-and-silent path beats an unwired one).

## 44. STAGE 2a — THE LEVEL CONTROL SYSTEM, AND THE INTEGRAL THAT RAILED ITS OWN DEMAND — 2026-08-19

WTSM 10.3 (ML11223A290) carries the whole system and all of it is adopted verbatim in shape:
the **PI master level controller** varying CHARGING (letdown constant in the normal lineup —
the controller's output is a `charging_demand` the caller wires into `pwr2_cvcs`, the same
caller-wires-systems convention as relief); the **program as f(Tavg)**, 25 % at no-load →
61.5 % at full power — and the source's 557 °F no-load point **is exactly this plant's own HZP
anchor** (291.67 °C, OSTI 1991715), so the sourced percentages ride the plant's own span; the
**+5 % anticipatory backup-heater signal** (an insurge is cooler water — pressure will fall);
the **17 % low-level cut** (letdown isolated, ALL heaters off — steam-environment damage) with
a 20 % restore differential ([open]; the source states the cut only, and a latch with no
differential is the #447 chatter shape); the **70 % high alarm**. The 4-loop plant's 92 %
high-level reactor trip is noted; Ginna's 87 % stays the carried trip point, and the RPS
FUNCTION itself is recorded as owed to `pwr2_protection`, not smuggled into the vessel.

**Measured, closed-loop with the real CVCS** (letdown at normal lineup, charging in auto): the
plant holds **60.3 % against a 61.5 % program at 600 s** with the demand mid-range; a 6 kg/s
drain pulls the level to 29 %, the controller rails charging to maximum, and recovery is
CVCS-slow — which is the real plant's shape. A 20 kg/s hard drain empties the vessel through
the 17 % cut: letdown isolates, heaters shed, and both stay latched below the restore point.

**Two measured traps:**
- **The PI's integral railed its own demand.** Uncapped, the startup transient wound
  `levErrInt` to a stored authority of ±10 demand-units and the controller sat at FULL charging
  with the level ABOVE program. Anti-windup caps the integral's authority at ±0.5 of the demand
  range; the source's own sentence — the PI "prevents the charging flow from reacting to small
  temporary level perturbations while eliminating steady-state level errors" — describes a
  controller a wound-up integral cannot be.
- **The sourced 17 % cut re-excited the adversarial scram-recovery fixture.** Cutting 158 kW of
  heaters mid-outsurge removes pressure support, and the unprotected rated-sink-on-scrammed-plant
  ride in `run_pwr2_reactor` now RINGS: a second moderator-density excursion peaks at **477 %
  power at ~32 s** before settling near 100 % by ~56 s. A real plant's power-range high-flux trip
  ends that ride at the first spike; the fixture has no RPS wired BY DESIGN. The settle sample
  moved 38 → 60 s; the three-phase mechanism the checks pin is unchanged. Recorded because it
  generalises: **a sourced protection added to the plant can amplify an adversarial fixture that
  was tuned to the unprotected one.**

Gates: `run_pwr2_pressurizer` 39 → 51 checks, mutations 10 → 14 (program-flattened, cut-deleted,
PI-backward, anticipator-deleted all red). Stage 2 remainder: two-h stratified states, auxiliary
spray, PORV block valve + tailpipe, the drained/TMI deception machinery, and the high-level trip
function in `pwr2_protection`.

## 45. STAGE 2b — THE TMI LEVERS, AND THE DECEPTION EMERGES UNSCRIPTED — 2026-08-19

Three pieces of relief-path hardware, and the measurement the whole curriculum tier waits on:

- **`drivers.porv_stick`** — ONE PORV latched open regardless of the controller (half the
  two-valve capacity: one valve stuck is one valve). PWR2's first failure-injection machinery;
  the controller ladder runs untouched, so the stick is a failure STATE, not a command path.
- **The block valve** — one combined motor-operated isolation for the pair (declared; Ginna
  has one per PORV). Closing it zeroes PORV discharge, stuck or commanded, and never touches
  the code safeties, which have no isolation by design.
- **The tailpipe** — a pipe-metal temperature: heats toward the discharge steam's T_sat while
  passing (τ ≈ 30 s), cools toward ambient when not (τ ≈ 600 s). Both taus [open]; **the
  asymmetry is the claim** — a pipe that stays hot for minutes after isolation is why a hot
  tailpipe proves nothing about the valve, which is the TMI-2 indication lesson.

**The measurement** (closed-loop plant, CVCS in auto, PORV stuck at t = 120 s — nothing below
is scripted):

| t stuck | P (psia) | indicated level | true inventory | lost through valve |
|---|---|---|---|---|
| 0 | 2212 | 60.2 % | 99.7 % | 0 |
| 1 min | 1564 | 55.2 % | 98.6 % | 267 kg |
| 3 min | 1190 | **100 % — HI ALARM** | 95.8 % | 801 kg |
| 11 min | 823 | **100 % — HI ALARM** | 83.9 % | 2,938 kg |
| 16 min | 442 | 69.9 % | 76.7 % | 4,273 kg |
| block closed | 446 | 61.7 % | 76.7 % | **frozen at 4,273** |

**The TMI deception emerges from the machinery**: the depressurising loop saturates and swells
into the vessel, so the level instrument tells the truth about the vessel and lies about the
plant — an operator "going by pressurizer level" throttles injection exactly as TMI-2's crew
did. Closing the block valve ends the loss instantly (the minute-142 action), the heaters
recover pressure, and the tailpipe cools slowly through it all (288 → 154 °C over ~11 min).

Shim: `porv_stuck`, `block_valve_open`, `porv_tailpipe_temp_c` supplied (67 of 109;
`spray_stuck` is the failure-injection block's one survivor). Gates: `run_pwr2_pressurizer`
51 → 56 checks, mutations 14 → 19 (stick-lever-dead, both-valves-flow, block-never-isolates,
tailpipe-never-heats, symmetric-tailpipe all red); quiet-mode rides trimmed to keep the
19-replay self-test under the runner budget. Stage 2 remainder: two-h stratified states, aux
spray, the high-level trip function in `pwr2_protection`.

## 46. STAGE 2c — THE HIGH-LEVEL TRIP AND AUXILIARY SPRAY — 2026-08-19

**The high pressurizer level trip**, in `pwr2_protection` where it belongs: Ginna's **87 %**
(TS Bases B 3.4.9 — the same 650 ft³ point the level instrument's own trip flag uses), delay
2.0 s ([open] — not in the 15.0-6 delay set; matches the pressure channels), gated by **P-7**
(WTSM 10.3.4.3: *"only active if either reactor power or turbine power is 10% or greater"*).
P-7 is deliberately a **plain automatic gate, not a revoked request** — there is no operator
anywhere in it, so the P-10 revoke-not-gate lesson does not transfer, and the two permissives
being different shapes is itself sourced. Pinned on both sides: 92 % level at 5 % power does
not even assert (a solid-bound vessel during heatup is LTOP's regime, not this trip's); the
same level at 12 % trips on this function alone; a plant with no level reading reports the
function UNAVAILABLE rather than silently healthy. `run_pwr2_protection` 57 → 64 checks,
mutations 24 → 27 (P-7 deleted, setpoint drift, function deleted — all red).

**Auxiliary spray**, in the vessel: WTSM 3.2 verbatim — *"auxiliary spray to the vapor space
of the pressurizer during cool down if the reactor coolant pumps are not operating"* — the
capability #472 measured the old engine lacking (RCPs secured, spray demanded 12 %, delivered
0). Operator-commanded (`drivers.aux_spray`), never automatic, RCP-independent by its whole
point, zeroed water-solid. Capacity is the CVCS charging maximum at VCT-cold water density
(1.83 kg/s — **the same physical number `pwr2_cvcs` derives, written down twice**, tied by
the gate per the MDOT_RATED pattern); per-kg condensing duty h_f − h_l(55 °C) gives
**2,533 kW** at design pressure on a quarter of main spray's flow. `run_pwr2_pressurizer`
56 → 59 checks, mutations 19 → 21 (command-dead, gated-on-RCPs both red).

Stage 2 remainder: the two-h stratified vessel states — the last and deepest piece, which
re-measures everything above it and is deliberately sequenced last.

## 47. THE STEAM DUMP CONTROL SYSTEM — §42 CRITERION A, MET FOR THE SOURCED REASON — 2026-08-19

*(OWNER RULING, 2026-08-19: "Defer. A." — the two-h stratification DEFERRED to a stage-3
candidate, and the §42 acceptance criterion ruled as A: continuous load-following with rods in
MANUAL, reactor power monotone in load target, no plateau wider than measurement noise.)*

**The evidence pass**: WTSM 11.2 (ML11223A294) was cited by a prior evidence pass but held in
no lane — fetched from ADAMS into this lane's corpus, and it carries the entire system
verbatim: the two operator modes; the **loss-of-load controller** with its **5 °F deadband**
("to allow the rod control system to respond ... first") and C-7 arming ("a ramp load decrease
at a rate greater than 5%/min, or a step load decrease of greater than 10% ... sensed from
turbine impulse pressure"); the **turbine-trip controller** against the no-load Tavg (557 °F —
the plants' own number *and* this plant's HZP anchor), no deadband, C-8 arming; the **steam
pressure mode** whose selection *is* the arming; and **C-9** (condenser vacuum + a circ pump)
gating actuation everywhere. WAT 05 (ML11216A094) supplies the output bands: 5–16.4 °F and
0–27.7 °F → 0–100 %.

**One constant is DERIVED from the source's own internal consistency**: the C-7 rate unit's
lag. A step ΔL through a rate unit with lag τ peaks at ΔL/τ, so for the ">10 % step" criterion
to mean anything a 10 % step must not trip the "5 %/min" unit: τ ≥ 0.10/(5 %/min) = **120 s**.
Measured before the fix: a 30 s guess read a clean 10 % dispatch step as 20 %/min and armed
C-7 on the first move of the acceptance sweep — the two sourced criteria collapsing into one
because the sensing dynamics were guessed instead of derived.

**Criterion A, measured** (full plant, rods MANUAL, 8 % dispatch schedule, 300 s settles):

| MWe | 100 | 92 | 84 | 76 | 68 | 60 | 52 | 44 |
|---|---|---|---|---|---|---|---|---|
| power % | 99.5 | 91.3 | 83.1 | 74.9 | 70.6 | 70.0 | 69.4 | 68.8 |
| dump % | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |
| SG safety % | 0 | 0 | 0 | 0 | 3.7 | 11.2 | 18.7 | 26.1 |

**C-7 never arms; the dumps never open; power is monotone and tracks 1:1 down to 76 MWe** —
the #489 plateau and inversion cannot occur because the parallel sink is interlocked out, which
is the sourced mechanism, not a tuning. **Below ~70 MWe the SG code safeties lift, visibly**
(1066–1079 psia) and become the ceiling: with the rods parked the secondary rides its own
relief envelope, which is what a real PWR does when nobody inserts rods — a nameable,
alarm-carrying cause, unlike the old engine's unobservable equilibrium. The missing rung is an
**ADV between dump and safeties** (declared; with one, this steam would pass it instead).

**The dump's real jobs, same machinery**: a 50 % rejection arms C-7, the dump runs at its
Ginna-sourced 28 % cap, and the **SG safeties stay shut** ("50% loss of load is accommodated by
the steam dump capacity" — WTSM 11.2, here with the moderator carrying what the smaller valves
do not). A turbine trip auto-selects the C-8 controller with no operator and walks Tavg to
within a few °F of no-load before closing the dumps; the first-seconds safety lift is the ADV
gap, declared rather than asserted away. The trip fixture scrams with the trip — the
turbine-trip reactor trip (P-9 class) is not yet in `pwr2_protection` and is recorded as owed.

**Adjudications**: the loadfollow gate's stand-in dump law is retired in place as the record
its A1_NOW literals were measured under; the three "lands where the current engine lands"
comparisons are retired — their same-dump-law premise expired with the ruling; the A1 chain
bands re-sized for the halved excursion (+8.6 °F measured vs +15), holding on both plants.
Gates: `run_pwr2_dumpctl` NEW (22 checks, 8 mutations — including "C-7 always armed", the old
engine's hidden-parallel-sink defect — none blind); `run_pwr2_loadfollow` 31 → 36.

## 48. THE ADV — THE LADDER'S MIDDLE RUNG, AND BOTH DECLARED GAPS CLOSE — 2026-08-19

Ginna TS Bases B 3.7.4, verbatim and complete: one ARV per SG main steam header, **329,000
lb/hr each (approximately 4 % of RTP)**, "normally closed, fail closed", a pneumatic controller
"to permit control of the cooldown rate", an upstream **block valve** "to isolate a failed open
ARV", and two functions — *(a)* secondary overpressure protection **below the MSSV setpoint**,
*(b)* plant cooldown **when the condenser is not available** to the steam dump. The SGTR event
is its design basis (recorded for that scenario's eventual author).

Built into `pwr2_relief.js` as the rung between dump and safeties: one valve (one loop),
capacity per-MWt scaled to **8.18 kg/s — and the source's own "~4 % of RTP" cross-check lands
at 4.1 %** (capacity × h_fg at the setpoint over 300 MWt, gated). Auto setpoint **[derived]
1040 psig** — B 3.7.4 places the function "below the setpoint of the MSSVs" without a number;
the WAT 05 plant sets its ARV 45 psi below its lowest safety, and the same margin below Ginna's
1085 psig pop gives 1040, with a 25 psi modulating band that reaches full-open before the
safeties lift. Modulating, not popping (the safeties are the latching pop). Operator lever
`adv_demand` (max of auto and manual), block valve, **and deliberately NOT gated on the
condenser** — atmospheric discharge is function (b)'s whole point, pinned by the paired check
where the same step kills the dump and not the ADV.

**Both of §47's declared gaps close, measured**: on the dispatch sweep the **ADV alone carries
the 68 MWe overflow (3.2 % of rated steam, safeties SHUT)** and deeper the code safeties take
only what exceeds its capacity (22.0 % at 44 MWe against §47's 26.1 % all-safeties); after the
turbine trip the secondary **settles ON the ADV band at ~1057 psig with the safeties closed**,
where §47 measured a first-seconds safety lift. The relief ladder — dump → ADV → safeties — is
now the built ladder, not the aspiration the #484 comment named.

Gates: `run_pwr2_relief` 30 → 38 (mutations 19 → 23 — auto-dead, condenser-gated,
rung-inverted, block-ignored; the setpoint-drift mutation had to target the DERIVED MPa, not
the display psig — two separate literals, the same duplicated-constant shape as ever);
`run_pwr2_loadfollow` prose de-staled where it declared the rung missing. Still owed from §47:
the P-9-class turbine-trip reactor trip in `pwr2_protection`.

## 49. THE FACADE AND THE PREVIEW PAGE — AND THE ONE DOOR CAUGHT TWO DEFECTS ON ARRIVAL — 2026-08-19

*(OWNER RULING, 2026-08-19: "A" — the standalone preview page + facade route, not the full
shell/M5 integration, which stays a later milestone.)*

**`engines/pwr2/pwr2_engine.js`** is the gates' hand wiring written once: `createEngine()`
assembles every system, `step()` runs the canonical order with the same one-step lags, and
`command()` is the one door (23 commands; an unknown name throws). It is NOT an M5 engine — no
snapshots, no instrument layer (every reported value is truth, and the page says so in a
banner), no rewind. **`test_pwr2.html`** drives it live: levers for every command, 24 true-value
readouts (US customary first), status lamps, a four-lane strip chart, 1–300× time acceleration.
Dev-channel only: the page is in `NOT_PUBLISHED`, and the index.html link sits in a
`DEV-ONLY-START/END` block that `site/build_site.js` now DELETES from published pages — a
CSS-hidden link to an unpublished page is still a dead link, and the builder's own
completeness scan is what proved a strip was needed (it failed the first, CSS-only attempt).

**The gate (`test/run_pwr2_engine.js`, 14 checks, 8 mutations)** leads with EQUIVALENCE: the
facade's settled plant against a hand-retyped copy of the loadfollow wiring — same regime to
P ±0.15 MPa / Tavg ±1.5 °C / power ±2 %, the differences declared (the facade runs CVCS and a
slewed rod bank). Then the caller-half of Hard Rule 5, pinned for the first time anywhere: a
40 cm² break trips and scrams UNCOMMANDED and SI starts the ECCS lineup.

**Defect 1, found by the full wiring within minutes (#499):** riding that break past ~68 s
NaNs — the #487 h-oscillation class at 0.115 MPa, near-but-not-AT the floor, where
`flooredLow` never latches. The partial-wiring gates never ran break + ECCS + CVCS + relief
sink together. Filed, and the gate's break case is scoped to the 30 s latching window with the
issue named in place.

**Defect 2, the facade's own, measured before fixing:** `scram` bypassed the RPS. `scrammed`
stayed false, the turbine kept pulling 100 MWe from a 2 % core, the −240 °F/min cooldown
out-surged the pressurizer at 54 kg/s, and at level 9.2 % / 1724 psia ONE 0.02 s step jumped
the solve to 2611 psia, level 100 %, surge +20,085 kg/s, fuel 3.4e21 °C — an unlatched solver
root-jump, the second beyond-model instance on #499 (different mechanism: pressurizer-drain
compliance collapse, not loop-node oscillation). Fixed at cause, both halves sourced:

- **Manual trip is an RPS input** — Ginna TS Bases B 3.3.1 Function 1 (ML20339A221): "the
  control room operator can initiate a reactor trip at any time by using either of two reactor
  trip pushbuttons". No setpoint, no permissive, latches `trip_cause: 'manual'`.
- **The turbine trips with the reactor** — Ginna UFSAR ch15 (ML20339A101): "The turbine
  automatically trips following a reactor trip. Zero delay is assumed". Level-held while
  latched, so the operator cannot re-latch the turbine under a standing trip.
- **The scram ramp is monotone-down** (`min()` with the current position): a second trip edge
  restarting the ramp could previously TELEPORT a partially-withdrawn bank back toward 200.

Measured after the fix: manual scram from 100 % → trip latched ('manual'), turbine tripped,
dumps take the load on the C-8 controller, Tavg walks to 554.5–555 °F against the 557 °F
no-load program, power decays 5.0e-1 → 2.0e-4 % over ten minutes, pressure 2086–2156 psia,
finite throughout. Both new gate checks REDDED on the pre-fix build (scrammed false; NaN at
t = 54.5 s) — the injection evidence is the defect itself.

## 50. #499 CLOSED — TWO BEYOND-MODEL GUARDS, BOTH THRESHOLDS MEASURED — 2026-08-19

Both #499 instances are the same failure shape — the plant leaves the regime the model can
represent and nothing declares it — with different mechanisms, so two guards in
`pwr2_core.js`, each threshold set by measurement (Hard Rule 12), neither fitted to the defect:

**Guard 1 — the root-tracking limit (`P_JUMP_MAX = 2.0` MPa/step).** The physical pressure
trajectory is continuous, so the solve's root must stay near last step's. Measured legitimate
per-step |dP|: operations < 0.001 MPa, a turbine trip 0.0006, the 40 cm² gate break peaks at
0.104, and a 500 cm² guillotine-class break's first step — the worst legitimate mover found —
0.67 MPa. The defect's jump was 6.1 MPa (1724 → 2611 psia in 0.02 s, surge +20,085 kg/s,
adopted from a far root after the drained pressurizer's vapor-dominated projection collapsed
the system compliance). 2.0 sits 3× above the worst legitimate and 3× below the defect. A
solve landing beyond it is REFUSED: nothing adopted, the step held, `beyond_model` latched,
`rootJump_mpa` reported for the post-mortem.

**Guard 2 — the both-walls latch.** The near-floor h-oscillation's signature is nodes pinned
on BOTH envelope walls at once (measured: core at +4161 kJ/kg beside upper plenum at −5.4, at
0.115 MPa, ECCS fighting the blowdown — a pressure `flooredLow` never sees). Measured against
the benign case first: the 50 cm² scrammed episode clamps on **45,087 of 60,000 steps over
1200 s and is two-sided on ZERO of them** — the signature never occurs on a ride the model
survives. Latch on it.

**Verification (both directions, Hard Rule 10):** the 40 cm² full-lineup break now latches at
46.9 s and rides finite to 300 s where the pre-guard build threw NaN out of `pwr2_damage` at
68.5 s; the drain fixture (the pre-fix turbine wiring forced, since the facade fix made it
unreachable through the door) latches finite with max |dP|/step 0.717 MPa — no teleport. Both
new gate checks red by injection: deleting the limit reds 3 checks (the fixture pins
`maxStep < 2.0`, so the teleport itself is the red, not a downstream symptom), deleting the
walls latch reds 2 (the ride NaNs). `run_pwr2_engine` 14 → 16 checks, 8 → 10 mutations —
the two new ones substitute a mutated `pwr2_core` into the load order. The core-family gates
(`run_pwr2_core`, `run_pwr2_loca`, `run_pwr2_coredamage`, `run_pwr2_loadfollow`,
`run_pwr2_pressurizer`) all hold at baseline: neither guard fires on any legitimate fixture.

**One fixture adjudicated, and it sharpened the guard's caveat:** `run_pwr2_sources`' affinity
fixture hand-pins every node's enthalpy, and its PLANT IS THE STIFF CASE — no pressurizer
seat, a sealed rigid loop where the instant pin's first step measures a **2.589 MPa** root
move at what works out to ~3,000 MW-equivalent forcing. The limit refused it, correctly by its
own terms but on a harness idiom no engine trajectory produces. The pin now ramps over 400
steps (max 0.673 MPa/step, never latches, P still reaches the 18.000 wall) and the identity
holds exact at the settled state. The caveat — the 2.0 MPa/step limit is calibrated to the
FULL plant's reachable dynamics, pressurizer seated — is written on the constant.

## 51. P-9 — THE TURBINE TRIP BECOMES A REACTOR TRIP, WITH THE PERMISSIVE'S TWO SOURCED VALUES — 2026-08-19

The owed item from §47/§49, now built. Ginna TS Bases B 3.3.1 (ML20339A221), the P-9
Permissive, verbatim: *"actuated at approximately 50% power as determined by two-out-of-four
NIS power range detectors if the Steam Dump System is available and at approximately 8% if the
Steam Dump System is unavailable ... A reactor trip is automatically initiated on a turbine
trip when it is above the P-9 setpoint."* Function 14 carries the other side: below P-9,
*"load rejection can be accommodated by the steam dump system. Therefore, a turbine trip does
not actuate a reactor trip."*

Built in `pwr2_protection.js` as a latch input (like the manual trip — the real sensing is 2/3
autostop-oil switches and stop-valve limit switches; this model's honest input is the
turbine's tripped flag, declared), evaluated after the setpoint functions because the Bases
says these trips are *"not credited in the accident analysis"* — a credited function arriving
the same step keeps the cause. The permissive's value is SELECTED by
`drivers.steam_dumps_available` — the setpoint IS the dumps' load-rejection capacity margin,
which is why it moves. The facade wires `turbine_tripped` from the turbine and dump
availability from the condenser (C-9's fact, one-step lag).

**Measured through the door:** a commanded turbine trip at 100 % trips the reactor
(`turbine_trip` cause), the dumps take the load on the C-8 controller, Tavg 555.2 °F vs the
557 no-load program, finite. At the protection layer: no trip at 40 % with dumps available
(30 s ride), trip at the same 40 % with dumps unavailable (the 8 % value), `p9_met` reports
the selected value. **One plant truth recorded instead of a fourth check:** no below-8 %
no-trip case exists — under 8 % the P-10 block auto-revokes and the low-flux trip (35 %
setting) fires first, which is the plant working, not a coverage gap.

Gates: `run_pwr2_protection` 64 → 68 (+3 mutations, all caught — including "P-9 ignores dump
availability", which only the 40 %-unavailable check can see); `run_pwr2_engine` 16 → 17
(+1 mutation: the turbine flag never connected). Owed next on the protection layer: OTΔT
(still blocked on a source), the DELAYED-data evidence pass.

## 52. THE DELAYED-DATA EVIDENCE PASS — THE GROUP TABLE FINDS ITS DOCUMENT — 2026-08-19

The pass audit #488 C7.3 owed. Two documents fetched into the corpus this pass:

- **WTSM Section 2.1, Reactor Physics Review (ML11223A207)** — no group table, but two
  aggregate anchors: *"For a reactor with only U-235, β is about .007"*, and *"Delayed
  neutrons do not appear until about 13 seconds"*. The shipped set's mean delay,
  Σ(βᵢ/λᵢ)/β, computes to **13.04 s** — a 0.3 % match on a number the set was never fitted to.
- **DOE-HDBK-1019/1-93, Reactor Theory (Neutron Characteristics), Table 3** — *"Delayed
  Neutron Precursor Groups for Thermal Fission in Uranium-235"*, the table itself. It gives
  HALF-LIVES (55.7 / 22.7 / 6.2 / 2.3 / 0.61 / 0.23 s): **ln2/T½ reproduces every shipped λ
  to its last digit**, the fractions match within the table's own 2–3 digit rounding, and the
  total is the handbook's U-235 β = 0.0065 against our 0.006502.

The `DELAYED` block in `pwr2_kinetics.js` is retagged **[recalled] → [sourced]** with both
citations. WCAP-16009 §8 was checked because `find_source` now hits it: it carries the
six-group point-kinetics *form* only, no values. Ginna ch15's 0.49 %/0.43 % remain what they
always were — bounding licensing values, not group data. With this, the protection/kinetics
owed list reduces to one item: OTΔT, still blocked on a source.

## 53. OTΔT AND OPΔT — THE LAST OWED TRIPS, EVERY COEFFICIENT THE TABLE'S — 2026-08-19

Unblocked hours earlier (§52's pass found Table 15.0-7 sitting in the corpus), built the same
night. `pwr2_protection.js` gains the delta-T pair as rows with COMPUTED setpoints (`spFn`,
resolved each step from Tavg and pressure; a missing input makes the row UNAVAILABLE, never
silently static — mutation-pinned):

- **OTΔT**: sp = K1 + K2·(P − P′) − K3·(T − T′) with K1 1.30, K2 0.00093/psi, K3 0.0185/°F,
  P′ 2250 psia, T′ = this plant's design full-power Tavg (580.1 °F; the table's own footnote
  says "equal to or less than the full power operating TAVG chosen").
- **OPΔT**: sp = K4 − K6·(T − T′) = the flat 1.15, because K6 = 0.00/°F is the table's value.
- **Declared, each with its reason**: f(ΔI) is SOURCED ZERO — the lumped core's ΔI is
  identically 0, inside the table's −14/+6 % deadband, so the penalty is 0 by the table's own
  shape; the dynamic compensation (RTD lag 2.0 s + hot-leg filter 3.5/6.0 s, footnote b)
  corrects MEASUREMENT lag and this protection reads true unlagged values — it arrives with
  the instrument layer; OPΔT's K5 rate term (0.0014/°F, increasing-only) awaits its
  COLR-resident time constant. Delay 2.0 s [sourced]: footnote b's electronics + breakers +
  gripper release figure.
- The facade computes `delta_t_frac` (loop split over DT0_C = 31.1 °C, [derived] from §43's
  design point) and `tavg_c`, and exposes `eng.rpsReport`.

**Measured.** Settled at the design point: OTΔT setpoint 1.317, margin 0.305; OPΔT margin
0.137; no spurious trip anywhere in the suite. **The full-chain validation is UFSAR 15.4.4's
own scenario**: an uncontrolled boron dilution at rods-MANUAL full power — power holds at
100 % while Tavg climbs, the setpoint ramps down on K3, and **OTΔT terminates the event at
t = 2246 s with Tavg risen 16.8 °F against the 16.4 °F the K3 slope predicts** from the
starting margin. That is the credited trip doing the credited job, unfitted.

Gates: `run_pwr2_protection` 68 → 75 (+4 mutations: K3 term dropped / K2 term dropped /
static-fallback-on-missing-input / K1 drift), `run_pwr2_engine` 18 checks / 12 mutations. One
gate self-correction recorded: the K2 fixture first asserted K2×200 psi for a 184.9 psi drop
(the reference fixture sits at 2234.9 psia, not P′) — the check redded on its own arithmetic
and was fixed to the actual delta. Owed on this function when the instrument layer lands: the
lead/lag compensation and the K5 rate term; owed on the control side: the ch7 200 %/min
turbine runback rung.

## 54. THE INSTRUMENT LAYER — WHAT THE PLANT SAYS, AND THE RPS BELIEVES IT — 2026-08-20

*(OWNER RULING, 2026-08-20: "Do option 1" — the instrument layer, chosen from the three
options the drained #479 list left.)*

**`engines/pwr2/pwr2_instruments.js`**: per-channel first-order sensing lag (a cascaded second
lag where the source names one), band-limited AR(1) noise, and injectable failures (stuck /
low / high / noisy). Fourteen channels; consumers read `ins.reading[id]`; nothing writes
physics; true_state stays truth. The design spine's "instrument model reused, not redesigned"
note predates the preview stack, which runs without M5 and cannot reach `pwr_instruments.js` —
the native module keeps the same `reading[id]` interface so the eventual shell integration can
swap either way.

**Sourced where the corpus gives a number**: RTD lag **2.0 s** and the hot-leg measurement
filter **3.5 s** — Table 15.0-6 footnote b verbatim (the 3.5/6.0 pair's lower member, declared).
Every other τ and every σ is [open], each a named constant. The OTΔT channel's effective delay
is now **emergent** from the same pieces footnote b sums to its 7.0 s figure: RTD lag + hot-leg
filter + the RPS's sourced 2.0 s hold — and the lead/lag compensation stays out, matching the
analysis' own conservative modelling (it does not credit it either).

**A deliberate design departure, proven by injection**: per-channel PRNG streams seeded from
each channel's own id hash. `pwr_instruments.js`'s single cross-step stream makes channel ORDER
load-bearing (the appended-instrument trap, worked repeatedly); here the gate starves one
channel and a sibling's noise sequence is **bit-identical** — and a shared-seed mutation reds.

**The facade**: all RPS analog drivers now come from `ins.reading`, one step old (instruments
step at the end of each step on that step's true_state — the house convention); truth fills
only the very first step, before channels energize. `turbine_tripped` / `manual_trip` /
`steam_dumps_available` stay direct: state signals, not analog channels. Commands:
`instrument_fail {id, mode}` (misspellings throw), `instrument_restore`.

**Measured, the Hard Rule 1 payoff both ways**: fail `primary_pressure` LOW on a healthy plant
at 2224 psia → the RPS trips (`lo_pzr_press`) and injects (SI) **on the lie** within seconds;
fail `tavg` STUCK and the reading holds 561.0 °F while the true plant walks 4 °F away. Settled
indicated-vs-true: 2220 vs 2224 psia, 577.82 vs 577.84 °F — inside the configured σ.

**Declared, not silent**: the CONTROL loops (dump controller, pressurizer level and pressure
control) still read truth — each switchover changes a control loop's stability under lag and
noise and owes its own measured pass. Save/restore waits for the snapshot layer (Option B).

**The page**: dot-marked readouts are INDICATED; a TRUE button is the diagnostic overlay; a
failure panel drives any channel from the module's own table; the subcooling readout's
indicated form is a saturation-margin monitor computed from indicated P and Thot, like the
real device. Headless-verified: failed-low pressure reads 0 psia indicated while TRUE shows
the plant; zero console errors.

Gates: **`run_pwr2_instruments` NEW — 16 checks, 8 mutations** (sourced taus pinned by
measured step response, the cascade proven as a cascade, stationary σ and band-limit,
independence, determinism, all four failure modes, restore-heals-to-NOW);
**`run_pwr2_engine` 19 checks / 13 mutations** — THE LYING CHANNEL check with the reads-truth
mutation as its exact counterpart; all 18 prior checks held through the switchover unmoved.

## 55. THE CONTROL SWITCHOVER — THE LADDER BELIEVES THE INSTRUMENT, THE SAFETIES BELIEVE THE METAL — 2026-08-20

§54's declared follow-up, built with its owed stability pass. The split, drawn where the real
plant draws it:

- **Instrument-actuated, now on `drivers.indicated_*`** (absent = truth, so every layer-local
  fixture is unchanged): the pressurizer heater/spray/PORV ladder, the level PI, the 17 %
  low-level heater cut, the level program's Tavg, the dump controller's Tavg and steam
  pressure. All one step old through the facade, the house convention.
- **Mechanical, deliberately NOT**: the code safeties lift on TRUE pressure — spring-loaded
  metal has no instrument in its loop. Both halves proven on lies in `run_pwr2_pressurizer`'s
  new section: an indicated +120 psi lie opens the PORV with the safety shut; true 2510 psia
  lifts the safety though the indicated channel reads 100 psi low. A mutation pointing the
  safeties at the indicated channel reds.

**The stability pass (Hard Rule 12), 600 s at steady full power, noise on vs off**: heater
duty 53.2 vs 49.1 kW (+8 %), backup-heater flips 5 vs 1 (one per two minutes — the 8 psi
hysteresis rides over the 2.9 psi noise; no #348-class chatter), spray 0, dumps 0, PORV lifts
0, pressure band 43.8 vs 40.0 psi. No retuning needed; no constant moved.

**The lying-channel payoffs, measured**:
- Pressure channel HIGH: spray and PORV open on the lie — **true P 2188 → 1084 psia in 60 s**,
  a real depressurization driven entirely by a failed instrument (the TMI-adjacent wiring the
  switchover exists for).
- Pressure channel LOW: the heaters drive full against a healthy plant — for exactly 2 s,
  because the RPS trips **on the same lying channel** and the SI shed takes the heaters.
  Defense in depth, emergent, not scripted.
- Tavg channel HIGH: the dumps open to 100 % on a healthy plant, which genuinely cools —
  and OTΔT trips because its setpoint reads the same railed channel. **DECLARED**: one lumped
  channel per parameter makes single failures common-mode by construction (a real plant's 2/4
  logic prevents this); the TS Bases' own control/protection-interaction discussion is the
  frame, and per-parameter channel redundancy is future work if the teaching ever needs it.

Gates: `run_pwr2_pressurizer` 59 → 63 (+3 mutations: safeties-read-indicated /
split-undone / level-cannot-lie; one pre-existing mutation anchor repointed after the
level_ctl rename — the self-test's ANCHOR MISS caught it); `run_pwr2_engine` 19 → 21
(+2 wire-cut mutations). The heater-misdrive check reads at +1 s deliberately: the RPS kills
the condition at +2 s, so a later read would find the lie already answered.

## 56. THE ROD STOP AND THE TURBINE RUNBACK — THE WARNING BEFORE THE TRIP, AND WHAT IT BUYS HERE — 2026-08-20

The last sourced protection rung. Ginna UFSAR ch7 (ML20339A027) §7.2.2.4.1/§7.2.3.2.1: at
**3 % of rated loop ΔT below either delta-T trip setpoint**, rod stops block outward motion and
*"a turbine runback at 200%/min for 1.5 sec every 30 sec"* runs *"until ΔT < ΔT (rod stop) ...
to maintain essentially a constant margin to trip and gives the operator the opportunity to
make appropriate adjustments before a reactor trip occurs."*

Built as ONE signal, TWO consumers (HR5: `pwr2_protection` reports `rod_stop`/`runback`; the
facade acts — outward rod motion refused, inward always allowed; 5 MWe nibbles, 1.5 s per 30 s
window). **The bistable needed hysteresis the source never mentions** (assert 3.0 %, clear
3.5 % [open]): measured without it, channel noise flickered the signal at the line and every
flicker restarted the pulse timer — the sourced duty cycle degenerated into continuous ramping.

**Measured, both directions of the sourced story** (quasi-static dilution walks the margin into
the band at ~+193 s; ANY step of boron prompt-jumps power toward the hi-flux trip — even
−15 ppm reads 128 %):
- **With the operator** ("appropriate adjustments" = rods in, which the stop permits): one
  runback nibble + 12 steps of rods recover the margin, the signal clears in seconds, **no
  trip**. The sourced purpose, verbatim, demonstrated.
- **Without the operator**: this rods-MANUAL plant trips ~51 s after onset anyway — the
  runback's load cut RAISES Tavg ~1.1 °F/MWe (the load-follow character) and K3 erodes the
  setpoint faster than the falling ΔT recovers. **On this plant the runback buys the operator
  TIME, not an equilibrium** — a plant-identity fact the real function's design (auto rods
  restoring Tavg program) does not have to face.

**The gate work found four of its own latent defects** — the mutation replays are now
section-scoped (17 × the full suite had reached 1074 s of contention), and the scoping exposed
what full-suite side effects had been hiding: a turbine-flag mutation that had been cutting the
DUMP CONTROLLER's identical line since birth (unique two-line anchor now); a delta-T mutation
that replaced a ternary's condition and left its truth branch live (a truth-wire, not an
absence); a ladder probe that was vacuous under the ~330 s startup pressure dip (§43) — heaters
are legitimately full on truth there, so the probe is now a HIGH lie, which only spray and the
PORV can answer; and an oxidation-wire mutation that had only ever been caught by trajectory
chaos (now a designed `eng._Qox > 0` observable). A fifth find while re-fixturing: **a STUCK
Tavg channel through a turbine trip has the C-8 controller chase the stuck 578 °F reading and
drag the true plant to 406 °F** — a 150 °F instrument-driven overcooling casualty, now the
dump-wire check's fixture and a scenario-ready teaching case.

Gates: `run_pwr2_protection` 75 → 79 (+3 mutations; the approach fixtures sit at Tavg +10 °C
deliberately — at T′ every point in OT's band is past OP's whole setpoint), `run_pwr2_engine`
21 → 26 / 17 mutations, groups A–D. The page gains RUNBACK and ROD STOP lamps.

## 57. OPTION B, STAGE B1 — THE CONTRACT COMPLETED: 109 OF 109, AND THE THIRD CLASS — 2026-08-20

*(OWNER RULING, 2026-08-20: "Next: option B" — the shell/M5 integration, staged. B1 is the
enabling stage: the shim emits every §6.3 field, because `run_contract.js` fails in both
directions and the shell's consumers read the whole surface.)*

**The reconciliation the stage needed**: the declared-missing discipline (a field the model
cannot honestly supply is ABSENT and declared) collides with a contract that requires
emission. The resolution is a third class — a **STATIC**: a constant that states the model's
truth about an unmodeled system, held in its own registry with system + reason, gate-checked
three ways (every static emitted at exactly its registered value; no static moves across
healthy/wrecked/voided fixtures; every registered name IS a contract field — a check that
caught its own first defect on arrival: I had invented `ctmt_fan_demand` for a field the
contract spells `ctmt_fan_safety`). `ac_available: true` is not a fabricated reading; it is
the fact that this plant has no electrical failure model. **The boundary case is the
accumulators** (five nominal statics, honest at steady state, wrong in a large LOCA) — the
D4 §8 predicted-divergence set carries them, and `pwr2_eccs.js` declares the omission.

**The 22 derivations**, each from state the engine really has, display scales [adopted] from
the current engine where they are gauge calibrations: SG narrow/wide level through the sourced
`sg_mass_map` over PWR2's REAL secondary mass — the same Ginna 85,359 lbm nominal both
engines, so the same 65 % indication lands from different physics; SR/IR through k_sr/k_ir
(and the SR now DE-ENERGIZES above the P-6 class point — the always-on static was wrong and
was fixed before it shipped); hydrogen as the damage model's own oxidation through
Zr + 2H₂O → ZrO₂ + 2H₂ mole-fraction arithmetic; the sump on a declared ruler (100 % = the
whole primary inventory down); pump discharge pressures as min(dead-head, system P); the HEM
core-uncovery proxy (D4-upheld — divergence is the prediction); plant mode from the two states
this engine has; rates, imbalances, valve positions from their own systems. **The RHR was
wired into the facade** — it existed, gated (39 checks), and the facade had never instantiated
it; `rhr_active`/`rhr_valve_open` now read the real module's report.

Gates: `run_pwr2_true_state` 47 → 59 / 16 mutations (two RETIRED as proven no-ops with the
gate's own precedent — the empty MISSING registry made them unable to red — one replaced by a
STATIC-reason mutation, one repointed, plus SG-map/proxy-zero/sump/static-drift new). The
whole B1 surface: **109 of 109 contract fields emitted — 85 derived or translated, 19 statics,
0 declared missing, 0 unaccounted** (the 5 accumulator statics + 14 others; counts printed by
the gate). Next: B2, the engine class (`applyCommand` map, saveState/loadState as `pwr2-1.0`,
`getControlState`, `getProtectionConfig`, the `instruments` member, scruve exports).

## 58. STAGE B2 — PWR2Engine: THE CLASS THE STACK CAN HOLD — 2026-08-20

**`engines/pwr2/pwr2_shell.js`**: the `RD.PWREngine`-shaped class over the facade — `step`,
`getTrueState`, `getInstruments`/`instruments.reading` (the member `control_kernel.js:512`
reads directly), `getControlState` (the board's shape), `getProtectionConfig` (the courier:
it hands back `RD.PWR_CONFIG.protection` itself — M4 writes it, engines only carry it; the
double-protection consequence is declared in the header), `getActiveFailures`,
`getStartupLineup`, `applyCommand`, `reset`, `saveState`/`loadState`.

**The command partition.** All 71 actions in the CURRENT engine's own `applyCommand` switch —
parsed from its source by the gate, so a new old-engine action cannot appear unaccounted —
land in exactly one of three registries: **MAPPED** (33, to the facade's door), **REHOMED**
(7, the D4 §3 class — `primary_leak`'s severity becomes a break AREA at the old implicit
location; `open_porv_manual` becomes the stick/block pair; `disconnect_grid` becomes a load
target), **REFUSED** (31, each with a reason that names the absent machinery — and a refusal
THROWS, because a command that silently does nothing reads exactly like a plant that
survived it).

**The save contract**: schema `pwr2-1.0`; a `pwr-1.0` save is REFUSED with the D4 §5 reason
verbatim (inventing node-level distribution from lumped values is fabrication
indistinguishable from physics). The round trip is BIT-EXACT over 500 steps, physics and
instrument readings both — the save carries the native state, the published snapshot, the
reused shell instruments via their own documented save API, and the internal channels'
lag/noise/PRNG state (the PRNG was reworked to a state-carrying uint32 for exactly this;
its gate held green through the rework, proving stream compatibility).

**Two fixture lessons the injection self-test forced, recorded because they generalize**:
- A 2 °C tracks-the-plant band on a STEADY plant cannot see a frozen gauge — the
  frozen-needle mutant needs a MANEUVER between the freeze and the read.
- The readings-not-saved mutant was invisible at every settle shorter than ~700 s: this
  plant's startup-dip recovery keeps the proportional heater ladder RAILED full (157.8 kW at
  −21 psi error even at 400 s), and a railed analog path plus quantized-at-steady digital
  paths make a one-step truth-vs-indicated substitution move NOTHING. At 700 s the ladder is
  partial (26.9 kW, 2231 psia) and the same mutant diverges at step 1. **A fixture's
  operating point is part of what a check asserts.**

Gates: `run_pwr2_shell` NEW — 21 checks, 7 mutations, no blind spots. Next: B3, the shell
wiring (`?engine=pwr2` script set and selection, §6.3 documentation for the facade extras,
`run_contract` posture, headless boot).

## 59. STAGE B3 — THE CONTROL ROOM RUNS PWR2 — 2026-08-20

**`ui/shell.html?engine=pwr2` boots the full control room over `PWR2Engine`** — the board,
gauges, chart, failure menu and mission shell, zero console errors, headless-verified with a
full casualty: `?inject=stuck_porv_open&ff=180` rode the TMI lever through service →
`applyCommand` → the REHOMED stick, and the board renders the depressurization live —
power 4.1 % (the internal RPS tripped), 1783 psia falling, level 46 %, subcooling collapsing —
through the reused instrument chain.

**The wiring, and the design decision that made it small**: `ENGINES.pwr2` keeps
`plant: 'pwr'` — the UI treats this as the PWR board it is (every profile table and all seven
`ui.plant === 'pwr'` branches just work) — and carries `engine: 'pwr2'` separately, resolved
by `engId()` at every selectPlant/reset call. The inverse seam gets one normalizer
(`uiPlantOf`): service snapshots carry `plant_id 'pwr2'`, and without normalization the
foreign-snapshot guards refuse to render while the catch-up path installs a plant id no
profile table has — both measured at the first boot. No public trace: the picker skips
`hidden: true` entries entirely (not even a greyed card); `?engine=pwr2` is the same
dev-override channel the coming-soon plants already use, with `pwr2` FIRST in the URL
alternation because `(pwr|pwr2)` matches `pwr` and stops.

**`getProtectionConfig` SUPERSEDES the courier reading of D4**, with the measured reason:
handing back the pwr protection object verbatim would run M4's pwr automation channels over
this plant, and those channels issue commands PWR2 REFUSES (`set_feed_pump_speed` and kin) —
each refusal throwing inside the service tick. PWR2's config keeps the pwr object's shape
(alarms, permissives, labels — annunciators only read instruments) and empties the ACTING
parts: trips, actuations, ESF, runbacks, interlocks and channels are PWR2's own, inside the
engine, sourced to this plant and gated. The failures menu is the two levers the class can
actually inject (the pwr table is an OBJECT keyed by id — an array filter threw at boot).

**Declared parallel-phase quirks**: the free-play starting conditions still list the pwr
presets while PWR2 has one initial condition (the constructor ignores `initial_state`); the
mission/campaign content probes the pwr engine. Both resolve at replacement, not before.

Gates: `run_portable` 142 → 169 (the 27 pwr2 files join the shell and the portable build, all
clean) · site meta/build green · the FULL `run_all` (browser gates included) at baseline.

## 60. THE A/B DIVERGENCE PASS — THE PRE-REGISTERED PREDICTION HOLDS, AND TEN ADJUDICATIONS — 2026-08-20

*(OWNER RULING, 2026-08-20: "Next" after Option B — the A/B pass, the design's own final
exam.)* `test/run_pwr2_ab.js` is the harness `PWR2_ARCHITECTURE.md` specified: **a
measurement, not a gate** — 7 matched rides × 32 fields (the 19 D4 §8 upheld proxies, the 10
challenge-downgraded translations, 3 naturals), a divergence table per ride, exit 0 always.
What follows is the Hard Rule 9 adjudication, one divergence at a time. A = `engines/pwr`
under its M4 layer at the service's own 0.1 s protection cadence, automation channels
unengaged on both sides (the matched posture); B = PWR2 through the shell class.

**R1 — THE PRE-REGISTERED PREDICTION (D4 §2) HOLDS.** B's cold-leg vs hot-leg break at the
same 20 cm²: `primary_void_fraction` mean |Δ| **0.78** (max 0.99), `core_void_fraction` mean
**0.82**. The topology represents break locality the old engine structurally cannot — the
design's stated falsifier ("if it does not diverge there, either the topology is not doing
its job or the old proxy was better than believed") did not fire. The naturals stayed matched
(power mean |Δ| 0.4 % on the cold ride), so this is locality, not drift.

**R2 — the TMI deception, measured against the proxy it replaces.** Stuck PORV, 900 s:
`pzr_level_pct` mean |Δ| **54 points** (max 66). B's level from the saturated split RISES as
the vessel drains (§45's emergent deception); A's 3-constant affine law tracks inventory.
Verdict **B** — the [derived] split against a fitted law, and the divergence IS the
educational payload.

**R3 — A rides out a full-power turbine trip; B reactor-trips on P-9.** Measured directly:
A untripped at 100.0 % power, 2235 psia rock-steady, +120 s after `trip_turbine`. The SOURCE
sides with B: TS Bases B 3.3.1 — above P-9 *"a turbine trip will cause a load rejection
beyond the capacity of the Steam Dump System"*, so the reactor trips. A's ride-through
contradicts its own source's capacity statement. Verdict **B**, prototypicality (§51).

**R4 — clad temperature.** Steady |Δ| **350 °C**: B's clad is a solved thermal node
(coolant < clad < fuel, gate-pinned); A's was upheld as a proxy by D4's challenge pass.
Verdict **B**.

**R5 — fuel temperature diverges ~370 °C POST-TRIP despite its translation downgrade.** At
steady both agree to 0.8 %; after a trip B's fuel falls to near-coolant (decay-heat × thermal
resistance — the physics) while A holds hundreds of degrees of offset. D4's downgrade judged
the at-power form; off power the old fit shows through. Verdict **B**, and a note for the D4
record: `fuel_temp_c` behaves proxy-like off power — the same after-the-fact ambiguity §8
flagged on `sg_mass_frac`.

**R6 — SG level on a load swing: A is CLOSER.** Max |Δ| 41 points: A's level swings
(shrink-and-swell + feed dynamics); B's barely moves, because B's feed ≡ steam by
construction. Real SG levels swing. Verdict **A** — the declared feed-train simplification
now carries its measured cost (~40 points of missing level transient on a 30 % load change),
recorded as the number attached to a known gap, not a new defect.

**R7 — natural circulation is emergent in B.** Post pump-trip, B declares it for 81 % of the
ride where A's fitted boolean stays false. D2 §6's design goal, delivered; the two engines'
thresholds also differ, noted. Verdict **B**.

**R8 — ambient-constant offsets, OPEN.** `containment_temp_c` differs 13.7 °C and the
tailpipe cold-pipe base 32 °C at steady — constant choices, not dynamics (A carries 125 °F
ambients; B's are [open]). Owed: one source check, then adopt whichever is sourced.

**R9 — the cold leg is WORSE than the hot leg at the same area, emergently.** B-cold reaches
core damage where B-hot does not: the cold-leg break spills the ECCS injected at that same
leg — the real-plant cold-leg-worse asymmetry, falling out of topology + injection geometry.
The topology's second dividend, recorded for the casualty authors.

**R10 — harness lessons, recorded because each one burned a run.** A's command surface:
`trip_turbine` not `turbine_trip`; its pump trip is `inject_failure/rcp_trip`; it has no
20 cm²-class leak id (nearest `large_loca`). A bare A has no protection — M4 must be
evaluated at the service's own 0.1 s cadence or every protective comparison is harness
artifact. And the pass found a **sequence-dependent beyond-model escape** the single-ride
repros could not reproduce, answered structurally: the facade's outer step now CATCHES the
beyond-model throw, latches, and holds the last SANE snapshot — with a sanity screen, because
a state can run numerically wild while every value is still technically finite (measured:
power 2.6e54 rode straight through an `isFinite` check into the held snapshot). Under the
shell, that catch is the difference between a held plant and a crashed app.

**Bottom line for the replacement decision**: 9 of 10 rows side with B or record B delivering
a designed capability; the one row siding with A (R6) is a declared simplification now
carrying its measured cost. The pre-registered exam is passed. `run_pwr2_ab` is baselined as
structure only (7 rides × 32 fields) — its numbers are findings, never a pass/fail.

## 61. THE MENU CARD AND THE INDICATIONS HOOKUP — EVERY TILE READS, AND WHAT WAS BLANK — 2026-08-20

*(OWNER WORK ORDER, 2026-08-20: "I want to be able to use the new engine in the diagram like
I can with the old one. I want to be able to go into the plant and scenario selection menu and
be able to choose either PWR plant. Let's finish the PWR2 build with indications and hook it
up to the diagram.")*

**The card.** `ENGINES.pwr2` is a first-class Plant & Mission card — "PWR — New Physics",
one starting condition (Hot Full Power, the engine's only initial state), Free Play only.
The campaign/scenario/walkthrough tabs show a declared free-play-only panel rather than
content authored against the other plant's physics.

**The blank-status defect, and its size.** The shell passed `{}` as the instruments layer's
`extras` — and `_copyStatus` reads ONLY that dict, so **all 35 status readings were
undefined**, not one or two: the RCP handswitch lit OFF over a running pump, AUX FEED read
SECURED, the CONDENSATE POLISHER read STANDBY while condensate flowed, the boron lab was
dead, `porv_indicator` could never say OPEN. 21 of the 35 names are contract fields the
stage-B1 shim already emits and now pass through verbatim; the other 14 are computed in
`_instrExtras()` from the same sources the class's other surfaces use (`rps_scrammed` from
`ts.scrammed`, `rcp_running` from the breaker — NOT `ts.pump_running`, which is flow-based
and stays true on natural circulation — `above_p9` from the engine's own protection report)
or are honest constants for hardware PWR2 does not model (`mfw_isolated: false` — feed ≡
steam has no isolation; `afw_block_open: true`; the boron lab null/false/0).
`porv_commanded_open` is `pz.porvOpen`, the COMMAND — the stuck disc stays out of it, which
is the TMI-2 indicator lie kept exactly (HR1).

**The deviation gauge measures against the wrong plant's program.** `pzr_level_dev` computed
the OLD engine's level program; on a settled PWR2 sitting exactly on its own sourced
25..61.5 % line it read a standing **+6.4 %**. `pwr_instruments._levelDev` now accepts
`extras.level_program_fn` (the host plant's own program line, still evaluated at the
INDICATED Tavg — HR1 kept; the current engine passes nothing and is byte-identical in
behaviour). Measured through the shell: dev −9.5 % at 30 s and −5.9 % at 60 s (the known
330–700 s boot settle — the plant IS off program there), then **0.15 % at 900 s**. The gate
asserts CONSISTENCY (dev = level − own-program(indicated Tavg)), which holds at any fixture
time; a near-zero assertion would have pinned the transient.

**Rod groups in the consumer's shape.** The board looks groups up BY ID and prints `.steps`;
the one-entry `id: 'control'` shape left both position readouts at 0. The shell now
publishes `control_rods` (the real bank, native 0..200 steps, `max_steps` declaring the
scale) and `shutdown_rods` (the same trip presented banks-out-unless-scrammed — model truth
for a one-bank plant). The board renders the step unit from the group's own `max_steps`
instead of the authored "/912" — on the current engine `max_steps` IS 912, so its rendering
is unchanged (measured both engines headless: old reads "711 /912", PWR2 reads "200 /200").

**Two defects the hookup found in SHARED code, both present on the current engine:**
- The **SG saturation-temperature tile** (`imsgt98wjjc`, authored 2026-08-05) printed raw °C
  under its authored "F" unit — "274 f" beside a sibling tile computing the same number
  correctly as 525 °F. Fixed with the ordinary `dT()` conversion + a `VALUE_UNIT` entry;
  the old board now reads 541 °F there.
- The **DUMP SETPOINT box read 0 psi** on PWR2 because the shell surfaced only the operator
  override (`dcDrivers`), which is unset until touched. It now falls back to the dump
  controller's own live setpoint — 7.03 MPa (1019 psi), the Ginna no-load anchor.

**Verified headless over BOTH engines** (Playwright, driver-level reads + screenshots, zero
console errors): every previously-wrong tile reads correctly on PWR2, every old-engine tile
unchanged except the two shared fixes; the Indications tab renders the full channel list
over PWR2 with plant and physics columns live and honest dashes where PWR2 has no model.
AUX FEED reading SECURED on PWR2 is **correct today** — `pwr2_afw` deliberately models no
auto-start (its header says so); the AFAS actuation is on the finish list, not a display bug.

## 62. THE AFW STARTS AND THE LO-LO TRIP — ONE BISTABLE, TWO CONSUMERS, AND THE PREMISE THAT EXPIRED — 2026-08-20

*(OWNER RULINGS, 2026-08-20, this session: the next finish-list item is **AFW auto-start**
["AFW auto-start (Recommended)" selected], and the steam-generator lo-lo level reactor trip is
INCLUDED ["Include the trip rung too"] — the trip's "not buildable" declaration rested on an
expired premise, below.)*

**The sources, all in corpus, quoted at the build site** (`pwr2_protection.js`, the SGLL block):

- Ginna UFSAR ch10 §10.5.3.1.3 (ML20339A040): *"The motor-driven preferred auxiliary feedwater
  system pumps will start if one steam generator level decreases to a low-low level of 17%"*;
  the TDAFW starts on BOTH steam generators lo-lo; *"Upon receipt of a safety injection signal,
  the two motor-driven preferred auxiliary feedwater pumps will start"*; all pumps on loss of
  offsite power; MDAFW start + turbine trip *"if both main feedwater pumps fail"*.
- Ginna TS Bases B 3.3.1 Function 13 (ML20339A221) — the design's shape: the reactor-trip
  Function *"also performs the Engineered Safety Feature Actuation System (ESFAS) function of
  starting the AFW pumps on low low SG level"*. **One bistable, two consumers** — implemented
  as ONE `sg_lolo_level` table row (kind rps) whose `tripping` also drives two new latches
  `afas_mdafw`/`afas_tdafw`, not a twin row.
- Ginna TS Bases B 3.3.2 (a): manual initiation is *"one switch for each pump"* — the facade
  gains `afw_tdafw` (the `afw` command stays the MDAFW switch, back-compat).
- Table 15.0-6 (15.2.6 loss of normal feedwater): trip *"0% NRS 2.0"*, AFW start *"0% NRS
  60.0"*.

**The setpoint decision, declared.** Two sourced values exist: the INSTALLED 17 % narrow-range
span (ch10) and the 0 % narrow-range ANALYSIS limit (Table 15.0-6). The installed value is
carried — this sim models the plant as operated (Hard Rule 9), the analysis figure is a bounding
assumption, and NUREG-1431's "[30.4]%/[32.3]%" are bracketed placeholders, not numbers (the
standing #380 trap). The ch10 "+13.9 % error... at a containment temperature of 286F" adder is
deliberately not added. Delay: the table's 2.0 s; the 60.0 s AFW row is the analysis'
pumps-AT-FULL-FLOW figure (a consequence delay, the same reading the module's SI 32.0 note
records), and the no-spin-up pump model (declared in `pwr2_afw.js`) is therefore OPTIMISTIC
against the analysis by that simplification's own width.

**Declared adaptations and deferrals.** The single-loop collapse: one steam generator makes
"one SG lo-lo" (MDAFW) and "both SGs lo-lo" (TDAFW) the same event — both pumps start on it;
SI starts the MDAFW ONLY, the distinction that survives the collapse. Deferred with their
sourced conditions recorded: loss-of-main-feed start (no main feed exists under feed ≡ steam —
the feed-train work order owns it) and loss-of-offsite-power start (no electrical model).

**The premise that expired.** The protection header declared the level trips *"Not buildable:
...`pwr2_true_state.js` already declares `sg_level_pct` missing"* — written before Option B
stage B1 adopted the sourced `sg_mass_map`, after which the shim emits a real narrow-range
gauge. The rule's premise aged independently of the rule (#460's lesson), caught standing in
the module's own header; the paragraph is rewritten, and the same sweep corrected the header's
stale "P-9: no trip state" line (built §51). High-high level (feedwater regulator closure)
stays unbuilt — there is no regulator valve under feed ≡ steam.

**AFW flow was hydraulically inert, and now it is water.** `stepAFW` was computed and reported
but never entered the steam generator (`stepSG` got `{feed: out, steam: out}` — the same
variable). `stepSG` now takes the AFW as a SECOND, COLD stream (`afw_kgs`/`afw_h` — 70 °F
(21 °C) CST water against the 435 °F (224 °C) main-feed enthalpy), and the facade hoists
`stepAFW` above the SG step. Measured, both regimes (HR12):

- **At the rated delivery**: SG mass **+326 kg in 60 s against ~326 predicted** from the two
  sourced rated points power-scaled (5.44 kg/s = 12.0 lbm/s) — the merge, not the report.
- **Manual MDAFW on the settled 100 % plant, 300 s, no trip**: steam pressure 808.2 →
  802.9 psia (5.57 → 5.54 MPa, −5.3 psi), Tavg −0.4 °F (−0.2 °C), narrow-range level 65.0 →
  69.5 %, no spurious actuation — the pure cold-stream suppression, modest at one pump.

**The lying-gauge payoff, both ways** (the only route to lo-lo today — feed ≡ steam freezes
true SG mass, so the physics side arrives with the feed-train item): fail the new `sg_level`
channel LOW on the settled healthy plant (2227 psia / 15.35 MPa, 99.8 %, true level 65.0 %)
and at exactly the sourced **2.0 s** the reactor trips (`sg_lolo_level`) AND both pumps start
at full delivery, true level healthy throughout; fail `primary_pressure` LOW instead and the
§55 defense-in-depth chain gains its sourced AFW leg — SI at 2.0 s, MDAFW starts with cause
`si`, TDAFW stays secured. Latch law is SI's: securing an actuated pump is refused while the
latch stands; `reset_protection` clears the latches WITHOUT securing the pumps (clearing a
latch is not securing a pump); each pump's own switch works after.

**The board reads STANDBY, and the defect that took was in SHARED code.** The AUX FEED word
needs `automation.esf.afw === 'auto'`; PWR2's config now lists the one esf arm —
UNDISARMABLE (`commands: []`; the engine's AFAS is not defeatable, so a flippable arm would be
duplicate authority; the board's only AFW arm control sends `auto: true`). The headless probe
then found the kernel's channel-less `getAutomationState` fast path returned `{channels: []}`
WITHOUT the esf dict — a path only PWR2's config shape (esf_systems, no channels) can reach,
so no current-engine gate could ever see it, and the tile read SECURED over an armed AFAS.
Fixed with `_attachEsf` on both paths (`control_kernel.js`), pinned in `run_pwr2_shell` at the
exact stack seam, M4 green after (46/46 suites, 311 checks). `true_state` also gains the house
demand/delivery split (#200/#329/#332): `afw_pump_running` is DEMAND, `afw_active` delivery —
before, both keyed `total_kgs > 0` and a demanded pump with zero availability read SECURED.

**Gates**: `run_pwr2_protection` 79 → **90** (44 mutations — setpoint drift toward the
analysis limit, zeroed delay, row deletion, consumer disconnect, SI→TDAFW cross-wire,
SI→MDAFW drop, reset leaving latches, all caught) · `run_pwr2_engine` 26 → **33** (21
mutations, new group E) · `run_pwr2_instruments` 16 → **17** (15 channels; deletion mutation)
· `run_pwr2_true_state` 59 → **60** · `run_pwr2_shell` 23 → **25** (12 mutations) ·
`run_pwr2_sg` 25 and `run_pwr2_afw` 19 unchanged · contract guard 177 OK · headless: zero
console errors on both engines, AUX FEED inputs correct on both.

## 63. THE FEED TRAIN — FEED ≡ STEAM RETIRED, AND THE R6 ROW RE-ADJUDICATED — 2026-08-21

*(OWNER RULING, 2026-08-21: "Due next as recommended" — the feed train / steam-generator level
dynamics, the largest remaining physics gap and the one A/B row the old engine won.)*

**The build: `pwr2_feedwater.js`** — two main feed pumps, one regulating valve, the sourced
three-element controller, feedwater isolation. Every structural element is a source's:

- Ginna UFSAR ch10 (ML20339A040): *"the feedwater pump remaining in service will carry
  approximately 60% of full load feedwater flow. If both main feedwater pumps fail, the
  turbine will be tripped and the motor-driven auxiliary feedwater pumps (MDAFW) will start
  automatically. If the reactor is operating above 50% of full power at this time, the
  reactor will trip."* — the pump sizing AND the whole loss-of-both consequence chain.
- WTSM 11.1 (ML11223A293) — the steam generator water level control chapter, located in
  corpus this session (it was the unnamed accession between the steam-dump and EHC chapters):
  the three elements verbatim (steam flow vs feed flow → the flow error; the level *"first
  conditioned by a lag unit"* so shrink/swell cannot mask inventory; the level PI whose
  *"time constant associated with the integral portion ... is two minutes"*; the total error
  positioning the valve). WAT 05 (ML11216A094) §5.3.2 gives the lag: **5 seconds**.
- Ginna ch15 Table 15.0-6: *"Feedwater Isolation Delay from SI ... 32.0"*.
- **The program level is the ruled 65 % narrow range** (#355, adopted — it is the adopted
  mass map's own reading at nominal inventory, so the at-power plant holds Ginna's 85,359
  lbm). Ginna ch15 note (g)'s *"constant 52% narrow range span"* is DECLINED, declared: the
  accident analyses' modeling value, not the operating program, and adopting it would
  un-anchor the map's nominal-mass knot.
- Declared simplifications: no feed-pump speed control (nothing for it to protect without a
  valve-wear model — the valve rides ~0.83 at rated instead of mid-travel), constant feed
  enthalpy, one lumped valve. Gains [tune], arbitrated by the stability pass.

**Shrink and swell stays INSTRUMENT-SIDE, and both prior rulings stand.** WAT 05 §5.2.3: the
downcomer level moves with steam-flow changes while *"the change in indicated level is not due
to a change in steam generator inventory"* — and *"the wide range level indication is
generally not affected."* D3 §3's lumped-SG ruling therefore stands (the mass ledger carries
no swell), and the A/B pre-registration A9 ("reproduce exactly — it is an instrument effect")
is honored by ADOPTING the current engine's term verbatim (swell_factor 0.8 × 2-s-smoothed
dPower/dt) onto PWR2's own `sg_level` channel via a new extras.shift hook — so the RPS, the
feed controller, and the board all see the same downcomer story. Measured: a scram shrinks the
indicated level **19.5 points below true** in the first 10 s.

**The mass ledger is finally driven, and the plant holds itself** (HR12, all measured):
- Settled 900 s: 2227 psia (15.35 MPa), 99.9 %, level riding 64.4–66.0 % narrow range on the
  65 % program, valve 0.76–0.91 — no retune of any other system.
- The A/B load swing (100 → 70 MWe): TRUE level transients 58.0 → 66.9 % and comes home to
  64.7 — the transient feed ≡ steam suppressed by construction.
- **One feed pump at 100 %**: the ch10 60 % ceiling against full steaming boils the SG down
  to a REAL lo-lo — reactor trip + both AFW starts at **97.6 s**, on physics, where until
  yesterday only a lying gauge could reach 17 %. The recovery is held honest by an
  **anti-windup pair the smoke ride proved load-bearing**: without it the level PI banked
  ~100 s of +40 % error and the discharge refilled the SG to 100 % NR / 17,033 kg
  (37,600 lbm); with the rail-inhibit + a 0.25-flow-fraction cap the refill tops out below
  15,000 kg. The windup defect is the session's recorded trap.
- **Both pumps**: the whole ch10 sentence executes — turbine trips at once, P-9 makes it a
  reactor trip, the MDAFW starts on `loss_of_main_feed`, and the level stabilizes at 53 %
  without ever reaching lo-lo (the TDAFW correctly never starts).
- **SI**: main feed isolates at 34.0 s = 2 s SI + the sourced 32 s, through the facade wire.
- **Hi-hi (P-14 class), built with the valve it closes**: a manual overfeed walks indicated
  level to 90 % in ~98 s → the new kind-'fwi' protection row latches, main feed isolates AND
  the turbine trips (*"to protect the turbine against excessive moisture carryover"*, WTSM
  3.2). Installed 0.90 [adopted — the current engine's P-14 value]; analysis row Table
  15.0-6's "100% NRS 22.0" (the 22.0 read as an at-closure consequence figure, the module's
  SI-32.0 precedent).

**R6 RE-ADJUDICATED — the mechanism gap is closed, and the residual is the FIXTURE.** The
harness's steady ride now reads `sg_level_pct` max |Δ| **1.03 points** (mean 0.35). The load
ride still prints max 41.3 — and full-stack measurement shows why that number cannot be read
as a plant gap any more: the A-side fixture runs the old engine WITHOUT its automation
channels (engageDefaults is M5's), so its `feed_sg` three-element channel — the level backbone
the shipped plant always has — is not running, and its follow-mode feed steps to the new load
target instantly. The SHIPPED old plant on the same maneuver (measure_stack, full stack)
swings **63.5–67.8 %**; PWR2 swings 58.0–66.9. The two plants now agree to a few points at
their shipped lineups; the 41 is the #209 layer caveat surfacing inside the A/B harness's own
fixture. The remaining sg_level divergences on the casualty rides (turbine trip 20.1, stuck
PORV 39.8, SBLOCA 32.2) ride on the same automation-less A fixture plus PWR2's new SI
feedwater isolation, and are findings for a future pass, not re-adjudicated here.

**The shell follows**: the seven feed refusals retired to MAPPED (speed/flow/nudge/couple/
isolate/loss/overfeed, the current engine's payload shapes), `loss_of_feedwater` joins the
failure menu (3 → 4), `mfw_isolated` and `feed_pump_speed_pct` read the real module, and the
`fw` state + the two swell scalars join the bit-exact save.

**Gates**: `run_pwr2_feedwater` NEW 24 checks / 12 mutations · `run_pwr2_protection` 90 → 95
/ 49 · `run_pwr2_engine` 33 → 41 / 26 (group F) · `run_pwr2_true_state` 60 → 61 (the
feed-≡-steam identity cannot sneak back) · `run_pwr2_shell` 25 → 27 / 12 ·
`run_pwr2_loadfollow` 36 / 8 (stepSG anchors carried) · full sweep at baseline.

## 64. THE CVCS BALANCE POINT — THE PLANT WAS RIGHT, THE CURRENCY WAS WRONG — 2026-08-21

*(OWNER RULING, 2026-08-21: "Work next as recommended" — the CVCS balance point: the finish
list's "steady charging = letdown = 120 gpm (~3–4× prototypical), keeps the Charging Flow High
annunciator lit; needs its evidence mini-pass and a retune.")*

**The evidence pass found no retune to make.** The anchor plant's number is on file — Ginna
UFSAR ch15 (ML20339A101): *"three positive displacement charging pumps can deliver a maximum
of 180 gpm (charging flow is normally maintained at 46 gpm)"* — and `pwr2_cvcs.js` already
carries it, volume-scaled by its own declared basis: charging normal 46 × 0.163 = **7.5 gpm**,
max 29.4 gpm, letdown = charging + the ruled unscaled 5 gpm seal injection = **12.5 gpm**.
Measured settled: charging 7.5–12 gpm (the level PI trimming), letdown 12.5 gpm — the module
holds its sourced point and always did. The Westinghouse CVCS chapter (WTSM 4.1 — located in
corpus this session as the unnamed ML11223A214) corroborates the shape: 75 gpm normal letdown
balancing 55 charging + 20 seal on the 4-loop reference plant.

**What was actually wrong: a units CURRENCY mistranslation, in both directions.** The
contract's CVCS flow fields are in the current engine's #408 "real currency" — fraction of RCS
per second, where every consumer converts with the literal 450,000 (the board's
`GPM_CHARGING`; the CHG FLOW HI annunciator at 8.0e-5 = **36 gpm**). PWR2's stage-B1 shim
published **kg/s** into `charging_flow_actual` — 12.1 gpm of charging read as **~343,000
gpm** and stood the annunciator permanently (the finish list's "120 gpm balance" was a
reading of this mistranslation, not a plant state). And the stage-B2 shell read the board
setter's `gpm / 450,000` payload as a 0..1 pump-demand fraction — **any dialed setpoint
became ~zero flow**, a dead control wearing a working control's face.

**The fix is translation only; no physics constant moved.** The shim converts kg/s → the
currency once (`FRAC_PER_KGS`); the shell converts the setter both directions through the
module's own sourced-scaled ratings and publishes the control-state setpoints in the same
currency. Measured end to end: the board reads true gallons (letdown 12.5 gpm), CHG FLOW HI
input 4.9e-6 against the 8.0e-5 setpoint — **CLEAR** — and dialing 20 gpm on the board
delivers exactly 20.0 gpm (demand 0.681 = 20 / 29.4). A healthy plant can never reach the
36 gpm annunciator again: its maximum charging is the sourced-scaled 29.4.

**Gates**: `run_pwr2_true_state` 61 → **63** / 17 mutations (the 450,000 literal recovers
true gpm; the normal point sits below the annunciator; a kg/s revert mutation reds) ·
`run_pwr2_shell` 27 → **29** / 14 mutations (the annunciator input clear; the 20-gpm
round trip; both currency-revert mutations red) · `pwr2_cvcs.js` untouched · full sweep at
baseline.

## 65. THE HOT-FULL-POWER IC — THE ISOTHERMAL BOOT RETIRED (#502) — 2026-08-21

**The defect, measured from the owner's first live telemetry (2026-08-21 bundles, #502):**
`createEngine` seeded every loop node with one scalar enthalpy — zero hot/cold-leg split at
100 % power — so every free-play start opened with the plant developing its own 56 °F
(31.1 °C) split live: power 100 → **76.6 %** at t = 2.9 s, Thot 580 → **622 °F** (327 °C),
pressure 2235 → **2149 psia** (14.82 MPa), pressurizer level 61.5 → 51 %, recovery ~60 s.
The board rang low-pressure and level-deviation annunciators seconds into a "steady at full
power" start.

**The fix: a design-point enthalpy map (`designHmap`), constants-derived.** Legs at
TREF ± DT0_C/2 (Hard Rule 9 — the config constants stay the authority; the settle drifts
~1.3 °C below them and the new ride check bounds it). **Donor-cell placement, measured at a
600 s settle:** a node's enthalpy is its OUTLET state, so `core` seeds HOT (318.98 °C
settled) and `sg_primary` COLD (287.4 °C) — not midpoints; off-loop nodes are stagnant and
keep their boot value (TREF). Completeness is structural: a node the map misses throws at
construction (Layer 3's silent 1250 kJ/kg fallback is exactly the mis-seed this section
exists to record).

**Two refutations worth keeping:**
- **Re-pointing the kinetics references detonates.** Moving `createReactor`'s `coolTemp_c`
  and the `criticalBoron` trim to the hot-leg temperature — the "wire the point" reading —
  measured power **928 % in one step** and a beyond-model latch. TREF is the self-consistent
  reference the reactivity chain is normalized against; it stays.
- **The runback fixture was riding the defect's margin.** `run_pwr2_engine`'s dilution
  script (−2 ppm per 2.5 s detection block) overshot the OTΔT approach band *within* the
  block, entering it with ~0.000 margin; on the settled plant that standing condition
  matured the trip delay during the fixture's own 5 s rod-stop test (dt = 0.02 s only —
  dt = 0.05 passed, a script artifact, not plant physics). Re-scripted quasi-static
  (−1 ppm/block, its header's own claim): enters the band at margin 0.029–0.030, clears at
  +2.8 s/+6.2 s, no trip, at both dt values.

**Measured after (60 s, no commands):** power min **98.2 %** (t ≈ 7 s), pressure min
**2214 psia**, legs opening 608/552 °F and drifting ≤ 2 °F onto the settled 606.1/549.6 °F.
New acceptance check in `run_pwr2_engine` ("SETTLED IC"): a fresh engine ridden 60 s
untouched holds power ≥ 97 %, pressure > 2200 psia, legs within 4.5 °F of settled — red at
76.6 % on the pre-fix engine by construction.

**Also closed with it:** the shell's `reset()` rebuilt with `{}` (dropping seed and any
future opts — now rebuilds with the construction opts), and the `?init=` dev override
validated against the four-state pwr list for the pwr2 card (now validates against the
engine's own `initStates`).

## 66. THE BOARD SPEAKS PWR2 — SEVEN PLAYTEST FINDINGS, TWO REAL BANKS, AND THE GATE THAT NOW STANDS ON THE SEAM (#506) — 2026-08-22

**The owner's second live session filed #506**: ten systems of dead buttons, valves that never
move, shutdown rods snapping 200 → 0 in one frame, dead rod-speed selection, frozen pumps, a
step-count question, and the power tile pinned red. Root causes, each measured:

**Findings 1–2 (dead buttons/valves) were four stacked mechanisms, none of them one bug:**
(a) a REFUSED command THROWS in `applyCommand` — right for a harness, but nothing on the UI
click path caught it, so eleven controls unwound the handler silently and two-command presses
lost their second command; **fixed in `ui/app.js cmd()`** (try/catch → the service's own error
shape → the scanner-bar flash, the #505 visible half). (b) kernel-owned commands silently
erroring against the emptied config (boron/rod-AUTO channels, trip blocks) — those controls now
read **disabled** off the snapshot (channel-absence keyed, the #503 pattern), and the boron
panel goes dark per the owner's ruling until the real actuator is built (#507). (c) **five
payload-key mismatches** — the mapper read `c.running` where the board sends `active` (so HPI
and AFW **STOP started the pump**), `c.pct` where the board sends `power_pct` (heater
MANUAL/OFF/% all re-selected AUTO), `enabled` vs `active`, `pct` vs `mode`. (d) control-state
gaps and pinned constants — `letdown_orifice_a/b` absent (CLOSED lit forever),
`pumps[0].flow_pct` absent, `steam_dump_auto`/`charging_pump_running` literals. `set_steam_dump`
also left REFUSED for the engine's own `dump_mode` door (the refusal predated the door), and
`set_charging_pump` rehomed to charging demand.

**Finding 3 — THE SHUTDOWN BANK IS REAL** *(OWNER DIRECTIVE, 2026-08-22, in planning: "we
should work to make this engine has the same features as the old engine. Let's investigate the
gaps between the engines.")*. The engine had ONE lumped 200-step bank at an **unsourced
`worth: 0.08` literal** that bypassed the kinetics module's own gated pair; the shell fabricated
the second readout as `scrammed ? 0 : 200` — the one-frame snap the owner saw beside the control
bank's ramp. Worse, rod commands dropped `group_id`, so the board's shutdown drive **silently
moved the control bank**. Now: two banks at `RODS.worth_control`/`worth_shutdown` (4068 /
3676 pcm, WTSM 2.2 Table 2.2-1 — **provenance caveat: the citation ML11216A051 is NOT in the
corpus**, `find_source` 0 hits; cited-but-uncorroborated, recorded here), both fully withdrawn
at the IC (WTSM 8.1.1 practice; Ginna B 3.1.1 SDM-by-withdrawn-bank, in corpus), scram inserts
both on the pwr1 2.5 s/2.0 s [tune] pair — measured trace: shutdown 200 → 0 by t+2.1 s, control
by t+2.7 s at dt 0.02 — and the shutdown drive is a real, group-routed evolution (nothing
re-withdraws post-scram; the #468 lesson). `criticalBoron` now takes the withdrawn banks
instead of `null`: **measured bit-identical, 625.7841 ppm both ways** (withdrawn = exactly
0 pcm — the safe wiring, unlike #502's reference re-point). The settled-IC ride is unmoved
(power min 98.19 %).

**Finding 4 — rod speeds.** The S/M/F selection was discarded (fixed 1.0 step/s ≈ always FAST).
`ROD_SPEEDS {slow 0.117, normal 0.702, fast 1.053}` steps/s, [derived] from pwr1's sourced WTSM
8.1 speed classes by fraction-of-travel; measured through the full stack: slow moves 1.17
steps/10 s, fast 10.55.

**Finding 5 — the RCP froze on a NaN.** `pumps[0]` had no `flow_pct`; the board's
`pumpProps` computed `undefined/100 = NaN`, `NaN` failed every branch — the impeller never
spun AND its pipe ports went dark. Published now from `pump_flow_pct`. **The condensate half
does not reproduce** (measured 0.97 normalized, spinning) — presumed observed during the
pre-#501 freeze.

**Finding 6 — the step count, answered not changed.** Rod SPEEDS are sourced (WTSM 8.1,
8–72 steps/min). Step COUNTS are sourced NOWHERE: 228 is unattributed class recall, pwr1's 912
is a declared [tune] (4×228), pwr2's 200 a literal now annotated [derived]/unverified; Ginna TS
defines "fully withdrawn" in the COLR — the licensee document deliberately declines the number.

**Finding 7 — the power tile.** The band override walked the STATIC pwr trip table and excluded
trips only via live `trip_blocks`; a kernel with `trips: []` has nothing blockable, so the 25 %
startup trip read as armed forever — tile max 27.5, "TRIP 25%", power 99.8 pinned red.
`limitingArmedTrip` now requires a blockable trip's id to EXIST in the live
`rps_state.trip_block_status` (the kernel builds that from its own config); a snapshot without
`trip_block_status` keeps the legacy rule bit-identical (old recordings). Measured after:
tripHi 120, max 132, no note.

**#500 rode along**: `pzr_level_low` 25 → **17 %** on PWR2 only (the sourced heater-cutoff
level, `LEVEL.low_cut_pct`, WTSM 10.3) — 25.0 was this plant's own sourced no-load program
point, a standing annunciator on a healthy Mode 3. One copied row; every other alarm row shared
by reference with the pwr table; gated with a revert mutation.

**The gate that now stands on the seam: `test/run_pwr2_board.js`** — the pwr board driver over
a real pwr2 SimulationService, headless (the run_inspect pattern). Pump props finite · tile
bands authored · the payload round trips · **the no-orphan sweep**: all 49 button items
handled-and-acknowledged, momentary, UI-local, or disabled (8 disabled, 2 momentary, 5
UI-local) — DESIGN_CRITERIA question 4 as an executable check. 11 checks, 2 mutations (tile
condition, payload revert), both caught. `run_pwr2_shell` grew the two-bank ramp checks (sampled
mid-ramp, where the snap and the ramp disagree most), the group-routing check, the orifice/pump
fields, and three mutations (alarm-override revert, shutdown-snap revert, flow_pct drop).

**Not cured, tracked in #507 (the parity umbrella)**: boron play (panel disabled, actuator
owed), RHR align (#458 class), grid FOLLOW / ADV setpoint / manual dump OPEN / AFW block valve
(refused by design, now visibly), 20 non-injectable casualties, the 5-vs-1 IC count, the rod
insertion limit.

## 67. PARITY WAVES 1–3 — THE BORON SURFACE, THE RHR ALIGN, AND THE HONEST CASUALTY ROWS (#507) — 2026-08-22

**The owner's scope ruling**: waves 1–3 of the #507 parity umbrella built this pass; electrical,
SGTR (sized: cheap both-sided on this engine) and the IC count stay roadmapped.

### Wave 1 — boron. The mass balance was always real; the LEVER was missing.
`boron_rate_cmd` (ppm/s, signed) is realized as the **sourced blender** (Ginna UFSAR ch.15: the
blend system matches makeup concentration to the coolant; "the composition is determined by the
preset flow rates"): each step inverts the balance — which reduces exactly to
`dC/dt = inFlow·(C_in − C)/M`, the letdown terms cancel — for the blend concentration, clamped
to [0, boric_acid_ppm]. **The clamp IS the ceiling**: no ppm/s constant (the old engine's flat
0.14 is the contrast case); the achievable rate is bounded by tank concentration and the
charging lineup, so dilution stays proportional to concentration — fast at high boron
*(CORRECTED #510 M-9: this sentence shipped as "slow-at-high", the inverse of the suite's own
4× check; measured 12× faster at 2,400 ppm)* — and a firehose
demand meters what the lineup can carry. Measured: rate 0 **bit-identical** to a
never-commanded lineup; +0.02 ppm/s metered exactly at a fixed lineup; at the hot-full-power
PLCS lineup a +0.05 dose achieves ~0.042 (the level servo trims charging low — the clamp binds
honestly; the kernel's totalizer re-anchors and the dose completes) and −0.05 achieves ~−0.013
(dilution at 626 ppm through near-seal-only inflow — the real remedy is raising charging).
The lab sample lives in the CVCS (1800 s, standing seq-1 result at boot, **no mixing lag —
declared**: this plant's boron is lumped by ruling where the old engine samples its 30 s
`boron_reactive`). The kernel's `boron_conc` batch-dose channel rides through **by reference**
(the config-emptying rationale no longer bars it: both its commands are real and
`boron_analyzer` was live all along); end-to-end through the service: engage → +5 ppm →
dose done at ~100 s → auto-sample pending → rate stands down. The shipped `set_boron_adjust`
mapper read `c.mode` (always undefined) — every kernel dose landed as a no-shift 'match',
the silent-wrong payload class, fixed. Gates: `run_pwr2_cvcs` 27→35 / 20→23 mutations
(inversion-deleted, clamp-deleted, sample-never-posts — all caught).

### Wave 2 — the RHR align, and the heat finally leaves the loop.
`rh.valve_open` and `hx_fraction` are real state. Align honored only under the sourced
**425 psig** suction permissive (WTSM 5.1); **585 psig autoclose** enforced in the engine loop
(valve hardware, not a command); `running` follows the valve. **The wiring defect**: `stepRHR`
ran *after* `stepPlant` and its `heats` map fed only true_state — an aligned system removed
**exactly zero heat** (the Q4 orphan the #458 ruling names). Moved above `stepPlant`, heats
merged into the plant drivers, decay heat passed report-only. Measured through a 20 cm² LOCA
(below 425 psig at ~74 s): **aligned tavg 133.9 °C at t = 80 s vs 150.3 °C secured — 213 MJ
removed**; the merge-dropped mutant still climbs its `removed_kJ` ledger while the plant reads
150.3, which is why the gate pins the PLANT. At power the permissive holds the valve shut and
the reorder is a no-op (settled-IC ride unmoved, 98.19 % min). The shell inherits the **#458
ruled shape** *(OWNER RULING, 2026-08-12: "A'")*: ALIGN under SI throws the ruled lineup
message verbatim (a refusal, NOT an interlock; ISOLATE never refused), and the pressure
permissive refuses **out loud** where the old engine refuses silently. `rhr_valve_open` now
publishes the VALVE — the old contract published the *permissive*, a lamp that read open on
any depressurized secured plant. `eccs_mode` gains `'rhr'`; the Emergency-injection tile no
longer lights amber on `'standby'` (a pre-existing healthy-plant caution, fixed). Gates:
`run_pwr2_rhr` 39→41 / 21→23 mutations; `run_pwr2_engine` +2 checks +2 mutations.

### Wave 3 — the casualty menu, 4 → 12 rows, all honest.
Added: `sg_overfeed` (existing mapper) · `loss_of_offsite_power` (**HONEST-DEGRADED,
declared**: the RCP coastdown only — no AC/diesel model; clearing does not restart the pump,
no restart is modeled) · `loss_of_condenser_vacuum` (the CW-pump door; gradual air in-leakage
stays a declared omission) · `degraded_hpi` (the ECCS `avail` fraction) · `large_loca`
(severity 1.0 through the break machinery) · `rcp_seal_leak` (**measured area**: 0.08 cm² at
the `rcp` node leaks 1.21 kg/s against the sourced-scaled 1.85 kg/s max charging — holdable,
the row's teaching point; 0.2 cm² measured 3.0, more than charging can carry) ·
`pzr_level_sensor_stuck` / `pzr_level_sensor_low` (data-driven off the pwr defs).
**The two-layer fix is the load-bearing part**: PWR2 runs two instrument layers over one truth
(internal RPS channels + the reused pwr1 layer the board reads), and an injected instrument
failure landed only on the internal one — invisible on the board. The shell now MIRRORS
instrument failures to both layers (low/high rail to the internal channel's own range bound so
both show the same rail), `pwr2_instruments.fail` gained a stuck-at-VALUE argument (the CA-4
class needs 20 %, not wherever the needle was), and the payload bug (`c.instrument` vs the
panel's `instrument_id`) is fixed. Measured: `pzr_level_sensor_low` → board 20.0 / internal
20.0 / truth 60.8; clear heals both. Deferred with reasons in #507: `tavg_sensor_failure`
(needs a drift mode), `porv_indicator_stuck_closed` (needs the channel), and the
new-physics rows.

## 68. PARITY WAVE 4 — THE PLANT GETS A GRID (#507) — 2026-08-22

**Scope rulings this batch** *(OWNER, 2026-08-22 — each a selection from options I wrote, not
verbatim words)*: waves 4+5+6 (electrical · SGTR · casualty batch 2); the initial-condition
count and the rod insertion limit stay roadmapped. The `loss_of_offsite_power` row upgrades to
the full sourced LOOP and gains a clear ("Full LOOP + clear").

### The model
Two booleans, not a bus network: `elec.offsite` (the grid) and `elec.blackout` (the diesels
did not answer — 10 CFR 50.2's station blackout). Derived each step before any consumer:
`acAvail = !blackout` (the vital, diesel-backed buses) and `offsiteOk = offsite && !blackout`
(nonvital). No diesel start delay or failure probability — transfer is instantaneous,
DECLARED. Which load hangs on which bus is each module's own named wire, the old engine's
`ac_available` idiom: RCPs **nonvital** [sourced WTSM 3.2 ML11223A213: the RCP motors "cannot
be supplied from the emergency diesel generators"] and one-way (the declared no-restart
shape); main feed and condensate/CW nonvital; charging + seal injection, HHSI/LHSI, the
pressurizer heaters and the MDAFW pump **vital** — alive through a LOOP, dead in a blackout
(WTSM 5.7.5 ML11223A229: "All decay heat removal systems, **except the turbine-driven AFW
pump**, also fail"); the TDAFW pump's step signature has **no power driver at all**, which is
how the do-not-gate note is enforced. Letdown keeps flowing (an orifice, not a motor —
declared); the board and instruments ride the batteries, never gated. The `electrical` STATIC
retired — `ac_available`/`station_blackout` are live contract fields.

### The AFAS start that was owed
§62 deferred the loss-of-offsite-power AFW start for want of an electrical model. Built:
`drivers.loss_of_offsite` (a state signal, the `main_feed_lost` convention) latches **both**
pumps with cause `loss_of_offsite_power` — ch10's "all three preferred auxiliary feedwater
pumps will start on loss of offsite power," collapsed to both on this one-of-each lineup.
In a blackout the latched MDAFW demand meets a dead bus and delivers nothing — the #200
running-with-no-flow split doing its job.

### The heater shed became the sourced LATCH
`pwr2_pressurizer` had consumed `drivers.ac_available` since it was built — **the facade never
passed it** (a documented, read, dark wire). Passing it exposed the second gap: the shed was
combinational, so a LOOP never shed and grid recovery un-shed silently. Now the NUREG-0737
II.E.3.1 (7) / Ginna TS B 3.4.9 rising-edge latch (the old engine's shape): armed by SI **or a
LOOP** (vital bus notwithstanding), cleared only by the operator touching the heater control
(any `pzr_heaters_manual` command — the old `set_heater` convention, which the source's
"loading the heaters while the SI signal still stands" reading requires); a dead bus stays a
DIRECT term (physics, not a loading choice).

### Measured (dt 0.02 s, hot full power)
- **LOOP**: feed capacity dies instantly with both pump selectors standing → `main_feed_lost`
  → turbine trip → P-9 reactor trip, all in the first step (a state-signal chain). At 120 s:
  feed 0.000, condenser unavailable, `afw_flow_normalized` **1.000** (both pumps at rated),
  TDAFW cause `loss_of_offsite_power` (the MDAFW races `loss_of_main_feed` in the same step
  and the feed train reports first — kept, and it is also the feed wire's own gauge),
  `ac_available` TRUE, heaters shed on the latch. 300 s: 2119.9 psia *(⚠ the #510 review
  could not reproduce this 300-s figure and finds its cause misattributed — treat the number
  as UNVERIFIED; the wire claims around it were verified separately — #510 LOW)*.
- **The probe trap that reddened the first shell check**: 5 s after the LOOP the feed still
  reads 0.535 of rated — the module's 8 s pump tau decaying (e^−0.625 = 0.535). The probe was
  wrong, the plant was right; ride 30 s before asserting the feed dead.
- **SBO**: `afw_flow_normalized` **0.667** — exactly the TDAFW-only fraction (3.63 kg/s), so
  the ratio is itself the MDAFW power wire's gauge. Heater re-load under SBO: 0 kW at manual
  full; the same re-load during a LOOP: >100 kW — the vital bus's own gauge pair. Manual full
  charging: 6.5e-5 frac/s (≈1.83 kg/s, full delivery) in the LOOP, **0** in the SBO. 300 s:
  1985.6 psia (vs 2119.9 — the dead heaters). A blackout **mid-LOCA** stops SI with the run
  flags standing; restoring the buses resumes it at the standing lineup.
- **The PLCS confound, named**: charging demand reads 0 in both LOOP and SBO because the
  pressurizer level (40.4 % measured) sits above the post-trip 25 % program — the level
  controller, not the bus; the probes force manual demand to stay non-vacuous.
- **Recovery**: buses re-energize; RCPs stay tripped; the shed stays latched until the heater
  command; feed returns at the controller's own demand (≈0 on an overfull SG) — recovery gives
  the plant back, never the lineup (#200).

### Rows and gates
`loss_of_offsite_power` upgrades from wave 3's honest-degraded RCP-trip to the full LOOP with
a working clear; `station_blackout` joins the menu (12 → 13; it REPLACES the LOOP row in the
active-failures ledger — it IS a LOOP plus dead diesels, one row, the worse one);
`full_blackout` moves REFUSED → REHOMED. Gates: afw 19→23 (9 mutations — including
power-gate-lands-on-the-TURBINE-pump, the do-not-gate note's own probe) · cvcs 35→38 (24) ·
eccs 28→30 · feedwater 24→26 (13) · protection 95→96 (51) · pressurizer 63 (shed mutation
re-anchored onto the ARMING signal) · true_state 63 (the electrical-static mutation retargeted
to the surviving MSIV static) · shell 42 · engine 58 — one proposed mutation REJECTED as
unkillable (`offsiteOk` already ANDs `!blackout`; a mutation that can never red is the hollow
class). `run_hardrules` held 363 when this section was written *(a running count — 365 as of
2026-08-23; read the gate, not this line — #510 LOW)*.

## 69. PARITY WAVE 5 — THE SGTR (#507) — 2026-08-22

### The model: a break whose destination is the SG
A break at the `sg_primary` node IS a ruptured tube — destination inferred from the node, no
new state. Three seams, each already shaped for this: the break's backpressure driver takes
the SG's own `P_sec` (same step — `stepSG` runs first), so the sourced EOP — *"reduce reactor
coolant system pressure to equilibrate with the ruptured steam generator secondary side
pressure to minimize the coolant discharge"* (Ginna UFSAR ch15 §15.6.3) — falls out of the ΔP
with no scripting; the discharge lands in the secondary as `stepSG`'s **third inlet stream**
(hot, at the donor node's enthalpy, one step old — a 0.02 s / ~1 kg transport inventory,
declared), so the **overfill** the source names as the hazard actually happens — the old
engine's SGTR removed primary mass and landed it **nowhere**; and the discharge is EXCLUDED
from the containment sum — the containment-bypass signature that diagnoses the accident.

### The area is [UNVERIFIED], the location is sourced
No SG tube geometry document is in any lane's corpus (`find_source.js` verdict). Declared
*(OWNER RULING, 2026-08-22: "Declare UNVERIFIED" — a selection)*: typical Westinghouse
0.75 in OD × 0.048 in wall → ID 0.654 in → double-ended 2·π/4·ID² = **4.33e-4 m²**. The
location is the source's own: *"a double-ended break of one steam generator tube located at
the top of the tube sheet on the outlet (cold leg) side"* — `sg_primary` is that side of this
loop. Severity = fraction of the full rupture (slider default 40 %).

### Measured (sev 0.4 = 1.73e-4 m², hot full power)
- Initial leak **20.9 kg/s**, tapering to **6.3 kg/s** at 300 s: ratio 0.301 vs
  √(dP ratio) 0.335 — the √(2ρΔP) drive within 11 %, which is the EOP's physics.
- Full severity: **52.2 kg/s** initial vs the 1982 Ginna event's ~48 kg/s *(the Ginna flow
  figure is ⚠ [recalled] UNVERIFIED — no corpus document carries it; find_source verdict,
  #510 M-15)* — with the break model's declared ~2× subcooled overstatement as the honest
  error bar (the agreement is partly that overstatement).
- The plant answers unscripted: **OTΔT trip at 55.2 s**, **SI (lo pzr press) at 69.7 s**, the
  pressurizer drains (0 % at 300 s), and the SG overfills — mass frac **1.23** at 300 s,
  **1.59** at 1200 s.
- At 1200 s the primary hovers **60.1 psi** above the ruptured SG with HPI 0.11 feeding a
  4.27 kg/s leak — the classic SGTR standoff the EOP exists to break.
- Containment **identical** through 3,037 kg discharged — the exclusion proof.

### Declared limits
One break at a time: SGTR and LOCA are mutually exclusive — a new break REPLACES the tube
(measured: the SGTR stream stops and containment starts receiving). No radiological path (no
air-ejector / N-16 monitor model) — `inbox/ISSUE_radiation_monitoring.md` already tracks the
gap. Overfill protection needed no code: rising mass → level → the §62 hi-hi FWI, all
existing. Gates: sg 25→27 (leak dropped from the mass ledger / from the energy ledger — the
old engine's own defect, re-armed as mutations) · shell 44 (the row reports by NAME, never
`primary_leak`; +routed-to-the-cold-leg mutation) · engine 64 (backpressure cut, stash
severed, SG-never-consumes, exclusion dropped — all caught; the group-E AFW-stream anchor
re-pointed, and `run_pwr2_loadfollow`'s three SG-ledger anchors re-pointed a round later —
the multi-gate cost of one grown line, worth the sentence so the next ledger change greps
for its anchors first).

## 70. PARITY WAVE 6 — CASUALTY BATCH 2, THE INSTRUMENT MODES, AND THREE LATENT FIXES (#507) — 2026-08-22

### Drift and dead land on the internal layer
`pwr2_instruments` gains **drift** (`offset += rate·dt` in sim time — HR6; rate = the payload
value or the adopted 0.5/s) and **dead** (rails `range[0]`, the current engine's semantic).
The shell mapper stops collapsing drift/dead to 'stuck', and reads the freeze-at value under
EITHER key — **latent fix 3**: the defs send `stuck_value`, the advanced panel sends `value`,
and reading only the former silently dropped every typed panel value (measured: a
stuck-at-250 tavg landed at the current reading). The mirror forwards drift (with its rate)
and dead, so both layers walk together. `porv_indicator` is **MIRROR-ONLY, declared**: a
string lamp the internal numeric table cannot host — inject and restore skip the engine
command (which would throw before the mirror ran) and ride the applyCommand mirror to the
board layer alone; `getActiveFailures` scans the shell layer's own failed dict for exactly
this class.

### The menu reaches 21 rows, each measured
- **afw_failure** — the TMI-2 tagged-shut discharge valves are REAL STATE (`aw.blocked`,
  downstream of both pumps): run flags stand, delivery dies, `afw_blocked` goes LIVE on the
  contract (its static retired); re-opening restores delivery at the standing demand.
- **failure_to_scram** — the ATWS: `scramBlocked` gates ONLY the caller's-half rod drop; the
  latch, annunciators and the turbine trip all stand, because a failure to scram is the DROP
  failing, not the logic. Measured: manual scram blocked at power — rods at 200, power
  self-limits to **76 % at 10 s / 67.7 % at 20 s** through moderator feedback, unscripted.
  Clearing is not retroactive (the edge is spent): reset + scram drops the rods — declared.
- **THE DEFECT THE ATWS PROBE FOUND**: `reset_protection` never re-armed the trip-edge
  detector (`_lastTrip` lagged one step true), so a reset followed IMMEDIATELY by a new trip
  or the pushbutton missed the edge — **latch on, annunciators on, rods standing**. Fixed in
  the reset: clearing the latch re-arms its edge detector.
- **failed_pzr_heaters** — a THIRD heater seat (failure ≠ operator manual ≠ shed): 36.4 kW →
  0 with the demand standing; **−31.5 psi over 300 s** unattended.
- **stuck_open_spray** — the `porv_stick` twin: a physical valve latched open, the demand
  keeps moving and stays ineffective (#200), still needs RCP head and a steam space.
  `spray_stuck` LIVE (static retired). Measured: **−247 psi in 120 s** with the heaters
  fighting at 158 kW.
- **continuous_rod_withdrawal** — drives OUT at sev × 5.26 steps/s (the old 24-fine-steps/s
  ceiling as a fraction of travel, 24/912 on this 200-step bank — [adopted]); rod levers
  REFUSED out loud; a WORKING scram beats the drive and clears it; the clear holds position
  (the latched demand follows the fault — no snap-back). Measured: 175 → 200 in 9.5 s at
  default severity, power 78.1 → 83.7 %. **DECLARED**: the shipped hot-full-power IC parks
  the bank at 200/200, so the row only has travel on a plant whose rods are inserted. The
  first engine fixture inserted 50 steps at full load and the RPS terminated the excursion
  mid-probe (150 → 0.0) — UFSAR 15.4's own credited story, and a different claim than "the
  drive moves"; the fixture note stays so the distinction is not relearned.
- **tavg_sensor_failure** — the drift row, and it teaches by itself: both layers walk
  +30 °C/60 s off truth together while the lying channel MIS-PROGRAMS THE DUMPS and drags
  the TRUE plant down **25 °C in 60 s** — the instrument-driven overcooling casualty. The
  absolute reading only shows +6 because truth fell under it; reading − truth is the gauge.
- **porv_indicator_stuck_closed** — the TMI-2 lamp, stuck at 'closed' whatever the valve
  does; board-layer only (above), reports active, clears clean.

### The other two latent fixes
1. **degraded_hpi was INERT on flow**: wave 3 wrote `ec.avail`, which `stepECCS` never reads
   (it consumes `hhsiAvail`) — two green gate runs certified a row that did nothing to the
   physics. Now writes `hhsiAvail`; the gate asserts the DELIVERED flow halves at sev 0.5,
   and a revert-to-the-inert-seat mutation is caught.
2. **rcp_seal_leak's slider was rendered and discarded** (hard 8e-6 m²). Now linear:
   sev × 1.2e-5 m², sev 2/3 reproducing the wave-3 area exactly. Measured endpoints:
   **0.45 / 1.21 / 1.81 kg/s at sev 0.25 / 0.67 / 1.0** against 1.85 kg/s max charging —
   every slider position holdable, full severity at the edge, which is the row's teaching
   point extended to the whole slider.

### Gates
instruments 17→20 (11 mutations) · pressurizer 63→66 (26 — the two failure seats) · afw
23→25 (10 — the discharge block) · true_state 63 (spray_stuck and afw_blocked statics
retired, both checks turned around to guard the repair) · shell 44→56 (22 mutations) ·
engine 64→68 (41) · loadfollow 36 (three SG-ledger anchors re-pointed). Deferred with
reasons in #507: `stuck_rod_on_scram` (a worth-model change deserving its own measured
pass) and `steam_line_break(_upstream)` (needs a steam-outflow term AND an MSIV model to
teach its own isolation procedure).

## 71. PARITY WAVE 7 — THE INITIAL CONDITIONS, AND A REAL STARTUP (#507 §F) — 2026-08-22

### The registry
`createEngine(opts.initial_state)` consumes a real IC registry (`ICS`): **hot_full_power**
(unchanged — the full-power construction path is byte-identical, pinned by the group-A
equivalence fixtures), **50_percent** and **hot_zero_power**. `cold_shutdown` is deliberately
NOT in it: with no RCP restart modeled (the declared one-way trip), a Mode 5 plant could
never perform the heatup that is its whole point — deferred until an RCP start exists, and
an unknown preset THROWS (the #502 rule: an accepted-then-ignored preset is a menu that
lies). The control-room card offers the three.

### The construction, generalized from #502
Each IC is a SETTLED construction: the donor-cell enthalpy map about the IC's own operating
point (Tavg from the Tref program at power; the loop split scaling with power fraction);
kinetics, precursors, decay heat and xenon at that power's own equilibrium (the
`createKinetics` convention — the old engine's SS-6 lesson is structural here); boron
trimmed at the IC's own moderator temperature and rod lineup; the secondary landed where the
primary's duty puts it (Tsec = Tavg − pf·ΔT_ps, P = Psat); feed and turbine at the IC's own
dispatch with `rated_steam` still frozen at the RATED scale (every normalization's
denominator).

### The no-load anchor finding (measured)
The plant's `tavg_noload_c` program anchor (291.67 °C = 557 °F, the WTSM 4-loop figure)
**saturates at 7.625 MPa = 1106 psia — 6 psi ABOVE this plant's own sourced 1085 psig MSSV
pop**. A hot-standby plant at the program's no-load temperature would sit on its code
safeties. The consistent pair is Ginna's own: **547.0 °F = the model's own Tsat of the
sourced 1005 psig no-load pressure** (`SG.P_noload`, already in config; the source's printed
figure is 546.8 — this line shipped as "547.9", a transcription slip, corrected #510 LOW). So the HZP IC anchors to the plant's
STEAM side, with the dumps booted in **steam-pressure mode at 1005 psig** — the prototypical
no-load lineup, and the thing that physically holds the plant there (in tavg mode a
pump-heated no-load plant would ride the MSSVs: the dumps' own threshold, 291.67, is above
the safeties' 291.2 saturation point). Post-trip today the plant escapes the collision
because the tavg controller's deadband parks it at 289.6 °C / 1064 psia (measured, 1800 s
turbine-trip ride: SG peak 1090 psia at t = 62 s, MSSV flow 0 kg) — a ~10 psi peak margin
worth an issue: **#508**, filed with #478's reseat finding in mind.

### Measured (dt 0.02 s)
- **50 %** opens at 50.0 % / 298.08 °C / 2234 psia / SG 958 psia / level 43.2 % / 50.0 MWe
  and rides 120 s untouched to min 48.79 % with Tavg −0.9 °C — the same settled class as
  the hot-full-power IC's 98.2 % minimum.
- **Hot Standby** opens at 286.11 °C / SG 1020 psia / level 25.0 % / boron 719 ppm
  (critical-with-rods-in + the adopted 1000 pcm = +100 ppm margin) and holds 120 s at
  +0.05 °C (pump heat, the pressure-mode dumps carrying it), MSSVs never lift.
- **The startup accident**: a continuous fast pull is uncontrolled withdrawal from
  subcritical — power 1 % → 100.8 % inside the low-flux trip's own 0.5 s analysis delay,
  terminated cause `hi_flux_lo` (UFSAR 15.4.1's credited trip, unscripted).
- **The controlled startup, end to end**: critical at ~84 steps (1.35 % after the pull),
  the low-flux block taken at 18.2 % (above P-10), stepped to 96 steps → **42.6 % through
  the 35 % setpoint, untripped**, `low_flux_blocked` effective. Feedback stabilizes the
  ascent beautifully: 86/88/90 steps settle at 21.8/27.1/30.3 %.
- **P-10 owns the request**: a block taken at source level is auto-revoked on the next step
  (the sourced asymmetric gate).

### The block button's whole path (new plumbing)
PWR2's RPS lives in the engine, so the kernel's `set_trip_block` FORWARDS to the engine's
door when its own trips list is empty (the `inject_failure` precedent; every config that
carries kernel trips is byte-identical), the shell maps it onto the one blockable function
(the 35 % low-flux setting; anything else is a reasoned refusal), and `getRpsState` MERGES
the engine-owned block surface — with the trip's OWN setpoint attached, so the board's
power tile arms at the engine's 35 % rather than the static pwr1 table's 25 % (the #506.7
shape completed rather than reversed; the tile's armed-band override ignores every status
entry without a setpoint, keeping old recordings bit-identical).

## 72. PARITY WAVE 8 — THE ROD INSERTION LIMIT (#507 §B) — 2026-08-23

### The model
The adopted pwr1 curve on this bank ([adopted tune] 5 % / 5 % / 70 %): **no limit at or
below 5 % power** (a startup drives the bank deep; boron and the shutdown bank hold the
margin — without the floor, a Hot Standby bank parked at 0 would stand ROD LIMIT LO-LO
forever), then the %-withdrawn floor ramps linearly to 70 % at rated (140 of 200 steps).
Control bank ONLY; recomputed every step off the plant's own power. On this plant it is
**display and annunciator only** — no automatic rod channel exists to stop — so the
consumers are: `insertion_limit_steps`/`at_insertion_limit` live on the control-state rod
group, the board layer's `rod_limit_margin` passthrough channel (was pinned at its 912
default), and the two shared annunciator rows. **The currency finding**: the shared ROD
LIMIT LO row's setpoint of 40 is "RIL + 10 steps" — the ALARM itself is corroborated
(Ginna UFSAR ch.15: "a bank insertion limit alarm"), but the +10 figure's citation
(WTSM 8.4 ML11223A256) is to a document in NO lane's corpus, so the setpoint is
⚠ [recalled] UNVERIFIED (find_source verdict, #510 LOW) — in
pwr1's FINE-step currency — 4 fine per step — so PWR2 overrides it to **10** of this
bank's own steps, the same physical number (the #500 override pattern; without it the row
would fire 4× early).

### Measured (2026-08-23)
- Hot full power: RIL 138–140, margin ~60–62, no alarms. Hot Standby: **null** — no limit,
  no alarm on a fully inserted bank.
- **The curve recedes with power by design**, so a plain insertion never closes the margin
  (measured: inserting to 145 sags power to 85.8 % and the limit recedes to 121 — the
  margin OPENS to 24). The honest approach is the operational story the RIL exists for:
  **rods in + power restored by dilution** — diluting at −0.10 ppm/s from 145 steps closes
  the margin below 10 at **+35 s** (power 97.2 %, RIL 136), and the plant parks at margin
  5 / 100.3 % with no trip; five more steps at power reach the limit itself
  (ROD LIMIT LO-LO's fact).

### Gates
engine +5 checks / +4 mutations (curve deleted, applicability floor deleted — a Hot
Standby bank would stand LO-LO forever, at-limit pinned false, margin pinned wide) ·
shell +3 checks / +3 mutations (control-state fields reverted to the pinned nulls, the
margin channel severed, the 10-step override dropped — which would fire at 40 of this
bank's steps, 4× early).

## 73. PARITY WAVE 9 — THE RCP RESTART (#507) — 2026-08-23

### The one-way trip is retired
The motor accelerates the SAME rotor the coastdown decelerates, against the same hydraulic
load, with the same sourced inertia (Ginna 80,000 lbm·ft², power-scaled): accelerating
torque = 1.5 × the rated hydraulic torque ([open] — the induction-motor accelerating-torque
class; no motor curve is in the corpus), and the motor holds rated speed (slip regulation
unmodeled, declared). Start permissives a real plant carries — seal injection, oil lift,
anti-reverse-rotation — are declared unmodeled. **The start is gated on the NONVITAL bus**
[sourced, WTSM 3.2: the RCP motors "cannot be supplied from the emergency diesel
generators"] and REFUSED out loud without it; nothing auto-restarts — a cleared LOOP hands
back a stopped pump and the operator's `rcp_start` (the board's ON button, whose press had
thrown the declared refusal since #505 made refusals visible) is the restart.

### Measured (dt 0.02 s)
- Coastdown from rated: 16.4 % speed at 60 s; natural circulation carries 113 kg/s at
  300 s (the plant trips itself on the flow loss en route — unscripted).
- **Restart from rest: rated speed at +13 s, flow above 90 % of rated at +10 s** — the
  real RCP start class, derived from the same inertia as the coastdown rather than fitted.
  A momentum overshoot in loop flow settles on friction *(the #510 review re-measured it at
  **0.47 %**, not the "~4 %" this line shipped with — corrected, #510 LOW)*.
- A start under station blackout is REFUSED (the sourced reason in the message); the same
  command lands the step after the grid returns.
- The handswitch's words are honest now: OFF latches **SECURED** (the operator stopped
  it), a casualty or LOOP trip reads **LOST**, and the pre-wave-9 declared note ("a
  stopped pump reads as LOST, never SECURED") is retired with the machinery that forced it.

### Gates
sources 31→34 (19 mutations — start branch deleted, rated-speed cap deleted) · engine
group M (+2 checks, the electrical-gate-severed mutation) · shell +3 (the handswitch
round trip, the LOST/SECURED split; the secured-latch-dropped mutation). Unblocked:
`cold_shutdown` — the last initial condition, now waiting only on its own settled cold
construction (next wave).

## 74. PARITY WAVE 10 — THE SHUTDOWN IC, P-11, AND WHY IT IS MODE 4 (#507) — 2026-08-23

### Mode 5 is unrepresentable, measured — the IC is Mode 4
Layer 0's property floor is 0.1 MPa, whose saturation temperature is **99.6 °C = 211 °F**.
A secondary at or below Mode 5's 200 °F boundary therefore cannot exist in-model: the SG's
pressure solve pegs at the floor, its saturation temperature reads 211 °F whatever its
enthalpy does, and the U·A between that pegged secondary and a colder primary would pour
**~61 MW of false heat** into the plant for ever (U·A ≈ 9,260 kW/K × the 6.6 °C reverse
gradient at a 93 °C primary). So the shutdown preset is **`hot_shutdown` — Mode 4 at
250 °F / 350 psig**, honestly named; the Mode 5 rung exists in the mode ladder for the day
Layer 0 extends below its floor (a review call, recorded in #507).

### The construction
RHR aligned with the HX **throttled shut** — a HOLD, not a cooldown (measured with hx 0.5:
the HX pulled the heat-free plant down 26 °C in 300 s, the −560 °F/hr class, and drained
the pressurizer — opening the HX is the operator's cooldown lever, closing it is the hold).
RCPs SECURED (omega 0, the wave-9 SECURED word), heaters MANUAL-0 (the setpoint span floors
at the sourced 1700 psig, so a 350 psig plant cannot dial the ladder down; with no
insulation losses the bubble holds — declared), dumps OFF, both banks IN, pressurizer at
30 % ([adopted] pwr1's cold level), boron **999 ppm**. **The #468 order is structural**:
the trim runs with the shutdown bank OUT and the bank inserts AFTER, so its 3,676 pcm is
margin in RODS — the cold plant carries MORE boron than hot standby (999 vs 719 ppm), and
the inverted order (a gate mutation now) pays the bank in boron and reads LESS.

### P-11, and the third latent protection gap
The cooldown's blocks are real: `pr.blockLoPress` and `pr.blockSI` are operator REQUESTS
permitted only below **P-11** ([adopted] pwr1's ~1970 psig / 13.6 MPa pair), auto-REVOKED
above it (the P-10 revoke-not-gate law transfers verbatim), engage-refused above it (the
#295 defeatable-trip lesson), and the SI block gates the whole esfas kind. Measured: a
blocked 350 psig plant latches nothing for 30 s; the same plant unblocked CASCADES (trip +
SI + pumps) — which is why "block SI" is a procedure step. **Found en route: `lo_flow` had
no P-7 gate** — a shutdown plant with deliberately secured RCPs read as a loss-of-flow
accident; latent until the first RCPs-off IC existed, fixed with its sourced gate (Ginna TS
Bases: the loss-of-flow functions are required above P-7).

### Measured (dt 0.02 s)
- Boot: Mode 4 / 121.1 °C / 364 psia / level 30.0 % / SG 29.9 psia / boron 999 ppm, nothing
  latched. Hold: −1.07 °C over 300 s (the charging/letdown exchange — declared), no trips.
  **CORRECTED 2026-08-23 (#510 H-2/M-7): that 300 s figure sampled the first 6 % of a
  monotone transient and was NOT a hold** — untouched, the preset fills water-solid at
  ~75 min (level 30 → 100 %, 364 → 29 psia; seal injection has no return path and letdown
  dies below its 300 psia backpressure). The claim class is retired: settledness is now
  asserted as equilibrium DERIVATIVES over a long ride's final window in
  `run_pwr2_endurance` (owner directive, 2026-08-23: "Let's fix your acceptance windows
  first."), where this defect rides as a strict expected-fail until its fix lands.
- **The heatup is real**: `rcp_start` alone warms the held plant at **87.9 °F/hr** — the
  pump-heat class, just under the 100 °F/hr limit — flow 1,996 kg/s (cold dense water on
  the affinity law), untripped, no SI. **CORRECTED 2026-08-24 (#510 H-7, §77): that figure
  rode the STALLED 93 % rotor** — at the rated rotor the honest rate is **113.7 °F/hr**,
  above the administrative limit; the compliance story moves to the operator (the RHR trim,
  §77), and the "just under the limit" clause here is retired. Pressure sags on the heatup insurge because the
  boot heaters are OFF: cold insurge quenches the bubble — restoring the heaters is the
  heatup procedure's own first act, the TMI-adjacent lesson falling out of the physics.
- The mode ladder reads by Tavg below power: 4 at 248 °F, 5 at 176 °F (the rung waits on
  Layer 0), 3 above 350 °F.

### Gates
protection 96→100 (55 mutations — the P-11 revoke deleted, either block severed, the
lo_flow gate dropped) · true_state 63→64 (the cold rungs; +1 ladder mutation) · engine
group N (+6 checks / +4 mutations — the #468 inversion mutation among them) · shell +2
(the Mode 4 preset through the class; the P-11 pair round-trips the kernel forward; +1
mapping-severed mutation).

## 75. #510 BATCH 1 — THE DRY SG AND THE MODE 4 HOLD (H-1, H-2) — 2026-08-23

The first fix batch of the #510 swarm review, in the issue's own order: the two player-facing
defects. Both closed with their strict expected-fails promoted in `run_pwr2_endurance`
(9 passed 9 xfail → 13 passed 5 xfail). En route the energy audit found **two conservation
defects the review never filed**, both of which had to close before the Mode 4 preset could
settle — recorded below because the fix is three-quarters theirs.

### H-1 — the dry SG (pwr2_sg)

Three coupled holes: the mass floor clamped at 1 kg while energy kept integrating (and the
mixing used the unclamped old mass in the numerator), U never degraded with inventory, and
steam demand never starved — so `sg.h` ran to −11,594 kJ/kg, the pressure bisection pinned at
the 0.1 MPa property floor (Tsat 211 °F), and a 1 kg secondary drew **1.88 GW** from the
primary for ever.

The fix, in the module: **(1)** heat transfer scales with a wetted fraction —
`wet = min(1, mass_frac / 0.38845)`, the old engine's own dryout shape (`pwr_thermal`'s 30 %
wide-range threshold) carried through the shared Ginna level map; declared divergence: no 5 %
depleting residual. The SG lo-lo trip (17 % narrow = mass fraction 0.5484) sits ABOVE the
threshold, so every protected transient trips before U moves. **(2)** outflow is limited to
what the vessel holds — `steam_eff = min(demand, (mass − floor)/dt + inflow)` — which makes
the ledger mass-consistent by construction; the facade hands the turbine its prorated share
of `steam_delivered_kgs`. **(3)** a backstop clip keeps `sg.h` inside the bisection span
`[h_f(0.1), h_f(17.0)]`; it binds only at full dryout (the drain's last steam export), never
on a fed transient — gated both ways.

Measured (dt 0.02 s), the two menu-reachable wedges:
- **ATWS + loss of feed, 300 s**: SG dries at ~160 s; max power **99.0 %** (was 304.5 % with
  a beyond-model latch at 149 s); the plant stays representable — safeties cycle 2,400–2,610
  psia, cold leg walks up to 674 °F on decay heat with the sink honestly gone. Max per-step
  |ΔP| 0.015 MPa against the 2.0 MPa beyond-model jump limit.
- **ATWS + station blackout, 400 s**: power **0.2 %** (moderator feedback kills fission in
  hot water — was a false equilibrium at 243 % with a 46 °F cold leg), cold leg 638 °F, SG
  boils to ~100 kg, no latch.

### H-2 — the Mode 4 preset (pwr2_cvcs, pwr2_engine, pwr2_rhr, pwr2_pressurizer)

The filed mechanism was the one-way seal injection; closing it took four pieces, each
measured separately on the untouched 90-minute ride:

1. **The RHR low-pressure letdown path** *(owner-ruled 2026-08-23 over the review's
   seal-split suggestion, which the CVCS file's own WTSM verbatim contradicts — seal flow
   "returned to the RCS", balanced by letdown)*. Sourced: WTSM ch.19 (ML11223A342) "Coolant
   removal is accomplished by letdown, primarily from the residual heat removal system" /
   "Letdown is via the RHR-to-CVCS cross-connect valve HCV-128"; WTSM §4.1.4.5 (ML11223A214);
   NUREG-1431 Bases (ML12100A228) "low pressure letdown control". Modelled as the normal
   letdown magnitude behind the operator's letdown fraction while the RHR suction is open
   (driver absent = shut; at power the orifice and the path tie by calibration). Letdown then
   runs 12.5 gpm at 145–364 psia and the level PI balances seal + charging — **level holds
   25.3 % for 90 min** where it went water-solid at 75.
2. **The regenerative HX** as an effectiveness (0.9 [tune]) on the returning stream — without
   it the closed loop stands ~200 kW of parasitic cooling (charging at 60 °C against a 121 °C
   plant). Lumped, declared: the seal stream rides the recovery though the physical line
   bypasses the HX. The isolated-letdown lineup still arrives cold.
3. **RHR forced circulation** — a 63.1 kg/s floor on loop flow while the suction is open and
   SI is NOT actuated (shutdown cooling and low-head injection are the same pumps, the #458
   ruling). Mechanism sourced (Ginna TS Bases: "the RCPs and the RHR pumps circulate the
   coolant"); magnitude [derived] from WTSM 5.1's miniflow band (the valves close above
   1,000 gpm, so a pump in service flows at least that). Without it the RCPs-off legs are
   STAGNANT and the CVCS return chilled the small cold-leg node at ~9 °F/hr — Tavg is the leg
   average, so the board read a cooldown that was a mixing artifact.
4. **The heater hold**: the cold preset boots the heater ladder AT the shutdown pressure
   (constructor state — the operator's standing lineup, the #460 rods-in-MANUAL argument;
   the `pzr_setpoint_mpa` command still clamps to the sourced 1700–2500 psig board span) with
   heaters in AUTO. They cycle 14–28 kW against the measured ~16 kW surge-line bleed and hold
   the bubble in a ±5 psi limit cycle about a flat ~361 psia mean. The old lineup's "the
   bubble holds at its saturation without them, DECLARED" was false and is retired.

### The two conservation defects found by the energy audit (neither filed by #510)

- **`pwr2_sources` applied `−Math.abs(sgDuty)`** — reverse SG heat transfer (secondary hotter
  than the primary, the whole Mode 4 regime) was flipped into primary REMOVAL: both vessels
  cooled and 2|Q| was destroyed, **~113 kW** on the untouched preset. Now signed. This was
  most of the Tavg drift the inventory fix alone could not close.
- **Outsurge enthalpy was destroyed** — the pressurizer debits its ledger at h_f (~962 kJ/kg
  at Mode 4) while the loop gains the mass implicitly at its own node enthalpy (~508); the
  ~454 kJ/kg difference is now delivered to the hot leg as `surge_heat_kW` (one-step carrier,
  the house convention). The audit then closes: 60 min untouched, dE_total −21.4 MJ against
  −21.6 MJ of boundary flows, every ring node within 0.4 °F of boot.

### The estimator correction (run_pwr2_endurance)

The settledness law's rate clause moved from an endpoint pair to a **least-squares slope**
over the window's samples, and the Mode 4 window to half the ride (the hot ICs' own
fraction): the endpoint pair read the heater limit cycle's phase as −39 psi/hr on a plant
whose 90-minute position drift is −10 psi. Bands unchanged; every HEAD defect stays red on
the new estimator (the 54 %/hr fill is monotone, and the pegged-at-the-wall endings were
always the position clauses' catch).

### Measured (dt 0.02 s), the untouched 90-minute ride
364.0 → 354.5 psia · level 25.0 → 25.3 % · Tavg 250.0 → 249.5 °F · charging 2.7–9.6 gpm
about the 7.5 gpm balance, seal 5.00, letdown 12.50 · heaters 14–28 kW · never beyond-model.

### Gates
endurance 9p 9xf → **13p 5xf** (H-1 ×2, H-2 ×2 promoted; estimator + window per above) ·
sg 27 → **32** (dry SG near-zero sink, starved export, floor-equilibration, wet-fraction
shape, backstop-never-binds-fed; mutations 15 → 17 — wet fraction deleted and outflow
limiter deleted both re-arm H-1) · cvcs 38 → **43** (the LP path only-with-RHR /
behind-the-fraction / tie-at-power; regen warm-vs-cold; mutations 24 → 26 — path severed
re-arms H-2, recovery deleted re-arms the parasitic cooling) · engine 90 (level fixture
re-measured to the ruled 25 %; the vital-bus mutation anchor re-pointed) · shell 69 ·
loadfollow/sources/rhr/pressurizer/protection/feedwater/loca/ab at baseline.

## 76. #510 BATCH 2 — THE ELECTRICAL COMPLETION SWEEP (H-4, H-5, H-6, M-13, M-6) — 2026-08-24

One pattern, five sites: loads and signals the #507 wave-4 electrical model never carried.
All four endurance expected-fails promoted (13 passed 5 xfail → **17 passed 1 xfail** — only
H-7, the cold RCP stall, remains for batch 3).

- **H-4 — aux spray carries the vital-bus wire** (`pwr2_pressurizer`). The charging pumps
  drive it and they die on the same wire `pwr2_cvcs` pulls; before the gate a blackout plant
  delivered 29 gpm from a pump reporting zero flow — 541 psi of depressurization. Measured:
  commanded 1.0 on a dead bus delivers 0.00 kg/s; absent-means-powered keeps every layer
  fixture untouched.
- **H-5 — the RHR pumps are motor loads** (`pwr2_rhr` + the facade wire). Dead bus: aligned,
  HX open, ZERO duty (was 26.6 MMBtu/hr removed through a blackout, against the same WTSM
  5.7.5 sentence wave 4 quotes). `rh.running = valve_open && powered`; the #510 batch-1
  circulation floor and the RHR letdown path both ride `rh.running`, so a blackout also
  stops the forced circulation and the low-pressure letdown — one wire, three consumers.
- **H-6 — the shed latch edges per actuating signal** (`pwr2_pressurizer`). The old single
  OR'd edge meant a LOOP arriving AFTER an SI (heaters re-loaded between) never shed —
  157.8 kW rode the diesels through the design-basis LOCA+LOOP order. Now `_siPrev` and
  `_loopPrev` edge independently (NUREG-0737 II.E.3.1: each arrival is its own bus-loading
  action). Measured end-to-end in the endurance fixture: shed true, heater_kW 0.0 after the
  re-load-then-LOOP order; a STANDING signal still does not re-shed past the operator's
  re-load. Old saves carry no `_prev` fields and land false — the next standing signal
  re-arms, conservative.
- **M-13 — the blackout clear restores only what the blackout took** (`pwr2_engine`). The
  handler records whether offsite was already lost at injection (`elec._offsiteWasLost`,
  riding the serialized elec object); clearing an SBO injected ON a standing LOOP now hands
  back the diesels with the grid still down — `ac_available` true, `offsite` false, and the
  kernel's failure ledger finally agrees with the engine-derived list (the old unconditional
  restore made the LOOP vanish from the engine while the Failures tab kept drawing it).
  Clearing the LOOP afterwards restores the grid. Both orders gated in `run_pwr2_shell`.
- **M-6 — a dead condenser reaches the turbine** (`pwr2_engine`). [sourced, Ginna UFSAR
  ch.10 §10.1.3.1: the turbine trips on "Loss of both circulating water pumps" and "Low
  condenser vacuum"]. Wired at the facade as a level trip on `condenser.available` — the
  same shape as the sourced main-feed trip; P-9 then decides the reactor (its own sourced
  clause). Availability IS the vacuum at this fidelity — no invented setpoint. Measured:
  `loss_of_condenser_vacuum` at power now reads 0.0000 MWe with the turbine tripped at
  +300 s (was 100.0000 MWe at zero vacuum under a lit COND VAC TRIP annunciator). A
  backpressure-vs-efficiency term stays unbuilt (no sourced curve in the corpus) — the trip
  is the sourced behaviour.
- Housekeeping: `pwr2_protection`'s "no electrical model exists" note corrected (the model
  has existed since wave 4; it carries bus booleans, not voltage/frequency — which is why
  the 57 Hz undervoltage/underfrequency trips still have nothing to read).

### Gates
endurance 13p 5xf → **17p 1xf** (H-4/H-5/H-6/M-6 promoted) · pressurizer 66 → **68**
(mutations 26 → 29: aux vital-bus gate severed, the OR'd-edge revert, the SI-shed anchor
re-pointed) · rhr 41 → **42** (23 → 24: the vital-bus gate severed) · shell 69 → **71**
(the layered clear, both orders) · engine 90 · cvcs/condenser/afw at baseline.

## 77. #510 BATCH 3 — THE BOOT-STATE ARTIFACTS AND THE SI BORON (H-7, H-3, M-1) — 2026-08-24

The last endurance expected-fail promoted: **18 passed, 0 xfail, 0 failed — every #510
endurance defect is fixed**. The XFAIL map stays for the next born-failing entry; strictness
unchanged.

### H-7 — the RCP motor pulls in (pwr2_sources)

Hydraulic torque runs as r² × densityRatio, and cold Mode 4 water (ratio 1.306) met the flat
1.5× accelerating-torque class at 93 % speed — a stable sub-rated stall, which is what made
wave 10's 87.9 °F/hr heatup an artifact. The torque now RISES linearly from the start class
to a breakdown class (2.0 [open], bottom of the induction-motor band) over the last 10 % of
speed — the induction curve's own shape — so the cold rotor pulls in and the rated-speed
clamp holds it at bounded torque. Measured: cold start reaches rated at **24.1 s** (was a
93.05 % stall for ever); hot restart **11.4 s**, still §73's ~13 s class.

**The §74 heatup claim is corrected in place**: at the rated rotor the pump-heat heatup is
**113.7 °F/hr** (flow 2,127 kg/s) — ABOVE the 100 °F/hr administrative limit. The compliance
story moves to the OPERATOR, and the lever has real authority: the RHR heat-exchanger
fraction trims the rate ~134 °F/hr per 0.2 of throttle (measured: hx 0 → +113.7, hx 0.2 →
−20.6, hx 0.3 → −80.6 °F/hr), so a heatup held under the limit is an ordinary trim, not a
new system. The engine gate's heatup band re-measured to the honest class; the limit clause
retired from the check's claim (an admin limit is procedure, not an accident).

### H-3 — the RHR exchanger is hardware (pwr2_rhr)

UA is derived ONCE at construction from the DESIGN load — decay at 20 h plus the measured
cooldown-lineup RCP heat (design_rcp_heat_kW 1351 [derived], the pump-heat note's own
figure): **204.08 kW/K, identical on any boot plant**. The lazy first-step derivation read
the LIVE plant (pump heat 0 stopped, ~1.4 MW spinning) and sized the same exchanger
208.76 kW/K on an at-power boot vs 96.00 on the shutdown boot — the same throttle cooled at
125.9 vs 61.0 °F/hr and the sourced 100 °F/hr limit sat INSIDE the boot-state spread. The
dead M/cp arithmetic (computed, never read) is deleted; old saves carry a concrete UA and
are untouched; a legacy null lands on the design constant.

### M-1 — safety injection carries RWST boron (pwr2_cvcs + the facade)

`rwst_boron_ppm` (2,500, sourced ML11223A220) was defined and read by NOTHING — 5,363 lb
injected moved RCS boron by zero to seven figures, a parity regression against the old
engine. The CVCS ledger (the plant's one boron balance) now takes the injected stream:
`si_kgs` (last step's ECCS total, the `_eccsKgs` one-step carrier — the ECCS steps after the
CVCS; pwr2-1.0 saves gain the scalar, old saves land 0) at `si_ppm` = the RWST concentration.
Measured: a 20 cm² LOCA borates 625.8 → 720.0 ppm on 279 kg injected in 120 s; SI at the
RCS's own concentration is NEUTRAL (the discriminator that separates the term from a fitted
ramp — gated).

### Gates
endurance 17p 1xf → **18p 0xf** · sources 34 → **35** (the cold start; +1 mutation — the
rise flattened replays the stall red) · rhr 42 → **43** (UA-is-hardware; anchors re-pointed
to designUA) · cvcs 43 → **44** (SI-borates + neutral-at-own-ppm; mutations 26 → 27) ·
engine 90 (the heatup band re-measured to the honest class) · shell 71 · eccs/loca at
baseline.

## 78. #510 BATCH 4 — THE HONESTY BATCH (M-2, M-3, M-5, M-8..M-15) — 2026-08-24

The mediums that lie to the player, the gate, or the record — each verified before fixing,
each fix carried by a new check where one was possible.

- **M-2 — the RHR permissive reads the INSTRUMENT and says so** (HR1). All three sites — the
  shell refusal (which now quotes "indicates N psig"), the engine align door, and the 585
  psig autoclosure — read `ins.reading.primary_pressure` with the truth fallback, the same
  P-11 idiom forty lines away. Gated with a rail-high channel on a genuinely depressurized
  Mode 4 plant: the align is refused on the lie.
- **M-3 — `clear_all_failures` clears everything.** The sweep now iterates
  `engineActiveFailures` — the SAME detector the Failures tab draws — through each row's own
  per-id clear (twice, because a blackout row hides the LOOP row under the detector's
  replace rule). One function, two consumers: what is broken and what a clear-all clears
  cannot drift apart again. Gated: five levers piled on three standing rows, one clear-all,
  derived list empty and every lever measurably reset.
- **M-5 — `fail_low`/`fail_high` rail the BOARD too.** The rail read `ch.range`, which is
  undefined on every internal channel (the range lives at `ch.spec.range`), so the board
  froze at its healthy reading while the RPS channel railed. Gated: the board reads the
  spec's own range floor.
- **M-8 — `set_boron_adjust` finally has a gate**: rate → the engine's rate actuator, mode →
  the makeup door, rate 0 idles. The wave-1 repair shipped with no gate ever issuing the
  action; its revert now reds.
- **M-9 — the dilution prose un-inverted, six places**: rate ∝ C — FAST at high boron, slow
  at low (dC/dt = inFlow·(C_in − C)/M), which is what the code always did and the suite's
  own 4× proportionality check always asserted under an inverted name.
- **M-10 — `rhr_active` is the VALVE**, the contract's §6.3 semantics and the old engine's
  (`rhr_valve_open` mirrored). The duty>0 form painted "RHR Active: no" over "RHR Suction
  Valve: OPEN" on the shipped Mode 4 hold. The promoted H-5 endurance check re-targeted to
  the honest effect (the removed-energy ledger stands still through a blackout).
- **M-11 — RHR duty lands ON-LOOP only**: the volume split now excludes `pwr2_loop`'s own
  OFF_LOOP pair (vessel heads, pressurizer — carried as volume, never transported). 22.5 %
  of shutdown-cooling duty used to land on stagnant water, 15 % of it INSIDE the
  pressurizer. Shares still sum to exactly the duty — gated.
- **M-12 — `sg_overfeed` is its own SEAT** (`fw.overfeed`, a failed-OPEN regulating valve —
  the porv_stick shape): the operator's selector and manual fraction stand untouched, the
  row reports in the Failures list, and the clear releases the valve back to the standing
  lineup instead of force-selecting AUTO. Isolation still wins (the FWI trips the pumps too,
  declared). Old saves land false — healthy.
- **M-13** landed in batch 2 (§76). **M-14 — the margin declaration corrected**: the cold
  IC's +100 ppm was converted from "1,000 pcm" at the NOMINAL 10 pcm/ppm; the local cold
  worth is 43.48 pcm/ppm, so the delivered margin is ~4,348 pcm — conservative; the ppm is
  what the construction holds and the comment now says exactly that. Behavior unchanged.
- **M-15 — the "1982 Ginna ~48 kg/s" SGTR anchor marked ⚠ [recalled] UNVERIFIED** in every
  place it is repeated (no corpus document carries the event's flow figure — find_source
  verdict re-run 2026-08-24), and the shell comment's own measurement corrected from the
  flattering "~47" to the measured 51.8 kg/s.

### The LOW sweep (the review's unverified list, adjudicated)
Corrected in place: the "547.9 °F" no-load Tsat transcription slip (the model measures
547.0; the source prints 546.8) in four places · §73's "~4 %" momentum overshoot (review
measures 0.47 %) · §68's stale hardrules count (a running gate, not a number to copy) ·
§68's unreproducible LOOP 300-s figure marked UNVERIFIED · the ROD LIMIT LO "+10 steps"
setpoint re-marked [recalled] (the ALARM's existence is corroborated by Ginna UFSAR ch.15;
its cited WTSM 8.4 document is in no corpus) · CLAUDE.md's stale "52 runners" copies
de-numbered · `ui/app.js`'s three-presets comment (four ship) · the #458 refusal no longer
asserts "(SI actuated)" over a manual pump start (it says what is true: injection pumps are
running; the ruled "lineup, never interlock" text kept, and the gate now forbids the old
claim) · the At-Power mode threshold moved to the commercial ladder's own 5 % (it shipped at
2 %, so the 2-5 % band printed "At Power" while the comment beside it claimed that band
folded into Mode 3). The harness LOWs, rebuilt: the SBO/AFW check reads the CONTRACT's own
0.667 through the facade wire (the old form hand-forced the driver at dt 0, proving the
module); the "bit-identical" rate-0 check uses-then-idles the actuator (the old form
compared two constructor defaults and could never fail); the porv_indicator check asserts
the DECEPTION (lamp "closed" over a valve genuinely open — its old central clause was
healthy-plant-true); **the ROD LIMIT annunciators no longer fire on every scram** (a trip
now nulls the limit through its decay band — the limit governs withdrawn operation; gated
mid-decay) and the shared `rod_limit_margin` channel's range is overridden to this bank's
0..200 currency (the shared top is pwr1's 912 fine steps — the #500 override pattern,
copied, the shared table untouched). **The last LOW, closed in the close-out commit**: the
TypeError-verdict mutation was the delta-T wire cut — the mutated plant honestly reports
both delta-T rows `available: false`, and the crash was in the CHECK'S OWN NOTE STRING
(`.toFixed(3)` on the unavailable row's undefined margin — the 2026-08-21 note-crash class,
back for a second visit). The note now tolerates the unavailable row, the check asserts
`typeof margin === 'number'`, and the mutation is caught by the check going red (verified:
"1 checks red", no crash). The mutation runner also labels any future crash-only catch AS
ITSELF ("CRASH only — no check red, coverage untested") so the class cannot wear a physics
check's face again. **Every finding of the #510 review — 7 HIGH, 15 MEDIUM, the LOW sweep —
is now adjudicated and closed.**

### Gates
shell 71 → **76** (M-8 · M-3 · M-12 through the class · M-5 board rail · M-2 refusal-on-a-lie;
mutations 29 with the clear-all sweep and refusal-text anchors moved) · feedwater 26 → **29**
(the overfeed seat; mutations 13 → 14) · rhr 43 → **44** (the on-loop share) · engine 90/90
(the M-2 indicated door; the align fixture now RETRIES — a one-shot command at the exact
crossing met the channel's 0.5 s lag and was silently refused) · true_state 64 · cvcs 44 ·
endurance 18p 0xf.

## 79. #509 — THE OWNER'S THIRD PLAYTEST: THE RESET SEAM, THE FEED ELEMENT, AND THE PUMP'S REFERENCE — 2026-08-24

**The report** (filed 2026-08-22 21:19 EDT, 11 items) post-dates the #506 fixes and #507
waves 1–7, so none of that work answered it; nothing had been booked against it. Triage:
two pure wiring defects (items 6, 9), one dead seam under two symptoms (items 1 and 5),
one controller input defect pwr1 had already fixed for itself (5b), one calibration
artifact (3), art/layout (2, 8, 4, 11), one already-cured-needs-adjudication (7), one
not-reproducible-at-HEAD (10).

**Items 1 + 5 — the reset seam.** The kernel's `rps.scrammed` latch was set only by kernel
trips (PWR2 has none — its RPS lives in the engine) or an operator `scram`, so after any
AUTOMATIC trip `reset_rps` returned null at its first line FOR EVER, and every level-held
seal-in (SI → HHSI/LHSI, AFAS → AFW, FWI → feed) was unreleasable: a stop/restore was
ACCEPTED (`ok:true`) and silently overwritten one step later — a dead-looking button, the
#506 defect class one layer deeper. Three fixes, one voice:
- **The evaluate mirror** (control_kernel): a config with an EMPTY trips list mirrors the
  `rps_scrammed` status instrument into the kernel latch, both directions (the wave-7
  empty-trips guard — pwr1/rbmk/bwr byte-identical). Everything downstream is correct
  unmodified: `reset_permitted`, the board caption, and pwr1's rods-in reset permissive
  begin working on PWR2 for free (measured: a reset pressed during the rod drop now refuses
  RODS_NOT_INSERTED; before the mirror the press returned null).
- **The snapshot patch** (pwr2_shell.applyCommand): the kernel judges a reset against
  `getTrueState()`, and the facade's `_ts` is the PREVIOUS step's snapshot — a reset that
  succeeded was reported *"The trip breakers only reset with all rods inserted."* The one
  field the reset changes is patched in place (`ts.scrammed` IS `pt.reactor_trip`).
- **Spoken refusals** (pwr2_shell MAPPED): ECCS STOP / AFW STOP while the latch stands, and
  MFW RESTORE while an isolation signal stands, THROW with the cause and the recovery path
  ("reset safety injection (RPS RESET) first…") — the WTSM 12.3.2.3 seal-in, sourced. The
  engine's level-held re-asserts stay the enforcement; the throw is the voice (#505 path).
  **The MFW guard keys on `pt.fwi` OR (`pt.si` && `fw.isolated`)**: measured, the feed
  module's own held-SI isolation (32 s) never latches `pt.fwi`, so a latch-only guard missed
  the common case.
- Measured recovery sequence: LOCA → SI latches, `rps_state.scrammed` true (reason
  `ot_delta_t`); STOP refuses; reset under the standing signal is accepted and RE-LATCHES
  within 3 s (not a wedge); manual scram → reset refused during the drop → accepted at the
  seat → AFW stop and MFW restore then work.

**Item 5b — the feed controller's steam element.** Element 2 of the three-element SGWLCS
read the `steam_flow` instrument — the TURBINE channel, ~0 post-trip while the dumps carry
the steam — the exact defect pwr1's feed channel documents and fixes for itself. It reads
`sg_steam_flow` (← `steam_out_total`: turbine + dumps + relief) now. Measured plain turbine
trip: valve pinned 0.000 from t+30 to t+180 while level walked 74.9 → 65.1 %; feed
re-engages at the 65 % program crossing and level parks ~63 %. **5c**: `feedStatus` returned
a permanent '—' with no kernel channel — the PWR2 branch now reads the engine's own state
(ISOLATED / HOLDING / NO FLOW / MANUAL / OFF), so a feedwater isolation explains itself.

**Item 6 — the AFW block valve, two bugs in one control.** The `set_afw_block` mapper read
`c.blocked` — a key NO caller sends (the board sends `{open:<bool>}`) — and its fallback
tested the payload OBJECT (always truthy), so **every click shut the valve and none
reopened it**; both AFW trains dead-headed silently. And the lamp was pinned
`afw_block_open = true` ("no AFW block valve is modeled" — stale since wave 6 made
`aw.blocked` real state), so the icon could never draw shut. Mapper mirrors pwr_engine's
reading (blocked iff `open === false`); lamp reads `e.aw.blocked` live. Round-trip gated
both ways.

**Item 7 — AFW refills a dry SG (adjudicated, was #510 batch 1's fix).** Measured: loss of
feed + tagged-shut AFW dries the SG in 2,640 s (98 kg, wide 0.7 %, narrow 0 %); clearing
the tag restores both pumps and the vessel REFILLS at ~5.2 kg/s (~82 gpm — the design
two-pump capacity), narrow range recovering 0 → 67 % in 40 min while the plant cools. Two
things stacked in the owner's session: the pre-batch-1 dry SG discarded everything fed to
it, and item 6's valve latched shut on any click. Note the narrow gauge reads 0.0 % for the
first ~15 min of a refill from dry — the wide range (the vessel art) is where it shows.

**Item 3 — RCP FLOW 105 %: a calibration-reference mismatch, recalibrated** *(OWNER
SELECTION, 2026-08-24: "Recalibrate to cold leg")*. `rhoRated()` pinned the pump's rated
density at the loop-AVERAGE design state (304.5 degC) while `loopDensity` reads the RCP
NODE — cold-leg water. The affinity equilibrium is mdot = mdot_rated · r · densityRatio,
so rated speed at the design point delivered **1714.2 kg/s = 105.16 %** by construction.
The reference is now the design COLD-LEG state (tavg − dt/2 = 288.95 degC / 552 degF),
resolved from a single `DESIGN` object in pwr2_sources that pwr2_engine's TREF/DT0_C/P0
now consume (one copy — the PROTECTION_DT trap class). Measured after: **1646.2 kg/s =
101.0 %** (the residual 1 % is the settle's own ~2 degC Tcold drift below the design cold
leg), pressure **2233 psia unchanged**, loop split 56.5 → 58.9 degF (the −4 % flow at the
same power, as predicted). Every pwr2 runner at baseline after one deliberate fixture
refit (run_pwr2_sources' design-condition fixture now places the rcp node at the design
cold leg — declared, HR10). Cold water still reads above 100 (denser suction moves more
mass — honest; the Mode 4 cold figure stays ~130 %).

**Item 10 — charging OFF, not reproducible at HEAD.** Measured: OFF drives the indication
30.0 → 0.00 gpm in ~20 s (the 30 IS the rail — §64's 29.4 gpm max at the level controller's
railed demand). Likeliest history: the session pre-dated §66's `set_charging_pump` rehome,
or the mode was MAN (which freezes the PLCS's last railed demand — noted, unfixed). The
board gate now asserts the FLOW (< 0.5 gpm), not just the lamp.

**Item 11 — the four clickable valves.** PORV block + PORV work; MSIV and the accumulator
valve are registered statics whose clicks flashed honest refusals that read as dead
controls. They now render DISABLED art on PWR2 (the ruled #506 missing-machinery idiom):
`msiv_fixed` / `accumulator_valve_fixed` capability flags (the `adv_setpoint_fixed`
pattern) → `valveProps.disabled` → the valve components drop the pointer affordance. An
engine that grows an MSIV just stops publishing the flag.

**Items 2, 8, 9, 4 — the board and the chart.**
- **Tees/crosses (2):** an `'off'` leg rendered `{phase:'empty'}` — a black drained bore
  against the water-solid pipe it joins. Secured is not drained: off legs keep the run's
  fluid colour with the dashes stopped; `'empty'` is reserved for genuinely drained
  contents.
- **SG art (8):** the tube sheet spans wall to wall now (123..297; the 131..289 bar left an
  ~8 px water-painted gap each side — the owner's "looks like water can pass by it" was
  geometrically exact); the U-tubes end at the sheet's bottom (450, was 470 — 30 px inside
  the channel heads); the water body ends AT the sheet (the +40 px slab below it is gone).
  The wide-range fill itself is unchanged — narrow 0 % = wide 30 % = water at the tube
  apex is the honest inventory reading, deliberately authored.
- **Hover occlusion (9):** the #444 highlight classes (`.hl-glow`/`.hl-pin`) carry the same
  z-index 5 lift the #202 fix pinned for `.ckl-glow`/`.instr-glow` — and were never added
  to that selector list. Added; one line.
- **Chart lanes (4)** *(OWNER SELECTION, 2026-08-24: "Lanes stretch to fill")*: the #445
  spec §8 56 px lane target is retired — pinned lanes divide the full plot height (the
  36 px floor and the ruled demote-to-numeric-rows rule stand). Plus the missing redraw:
  `drawChart` only ran on the next snapshot tick, so a splitter drag or window resize left
  stale geometry (never redrawn, if paused) — a debounced resize listener redraws, and the
  splitter dispatches the event. `lane_reference.html` updated first, per its own rule.

**The gate.** `test/run_pwr2_board.js` 13 → **24 checks**, mutations 2 → **5** (the scram
mirror severed → 4 red; the reset snapshot patch severed → 2 red; the `set_afw_block`
payload revert → 1 red; plus the two originals re-anchored), 5/5 caught. Regression sweep
green: run_m4 46/46 · run_autoctl 30/30 · run_e2e_controls 59/59 · run_pwr 37/37 ·
run_m5 23/23 · verify_board_check 225 · every pwr2 runner at baseline.

## 80. #511 — THE ACCUMULATOR AND THE MSIV: THE TWO VALVES #509 DISABLED ARE REAL MACHINERY — 2026-08-24

*(OWNER DIRECTIVE, 2026-08-24, in the #509 review conversation: "We should model these
valves.")* The #509 item 11 `*_fixed` capability flags retire exactly as designed — the
engine grew the machinery and stopped publishing them, and the two diagram symbols came
back operable with no board change.

**The accumulator (`pwr2_eccs`).** One tank (single-loop plant; the reference carries one
per cold leg — WTSM 5.2). An honest state, not a curve: borated water under a nitrogen
cover that expands ISOTHERMALLY as the tank empties, discharging through the check-valve
comparison (tank pressure > RCS) whenever the isolation valve is open. Sourced: 650 psig
normal cover / 600 minimum (WTSM Table 5.2-2), tank two-thirds water (§5.2.4.1), water
volume **0.435 × this plant's own RCS volume** — the #408 Ginna identity the old engine
already carries (2×1,115 ft³ against a 5,123 ft³ RCS, UFSAR T15.6-15) — resolved from the
Layer-1 node volumes at load: **10.29 m³ / 2,719 gal / ~10,190 kg**. The flow coefficient
is SOLVED against the same table's ~36 s full-dump class (187.1 kg/s·√MPa), and the gate
measures the resulting empty time rather than asserting the anchor. Passive — deliberately
not gated on `ac_available` (sourced: "no operator or control actions are required");
boron rides the existing `si_ppm` path at the RWST concentration (sourced: "about the same
as that of the RWST"). Nitrogen injection after empty is declared unmodeled.

**The isolation valve** is the one lever, with the sourced administrative lock: power is
removed from the motor operator above **1600 psig pressurizer pressure** (Ginna TS Bases
B 3.5.1 / WTSM 5.2.4.1), so open AND close refuse out loud above it, reading the INDICATED
channel (HR1). The **Mode 4 shutdown preset boots with the valve CLOSED** (sourced: closed
in Mode 3 below 1600 psig and Modes 4/5/6) — measured before the boot fix, an open valve
would dump the tank into the 364 psia boot at t=0. Opening it there discharges, honestly:
that hazard is why the procedure exists.

**Measured — the accumulator changes LOCA outcomes, which is the point:**
- Severity-0.5 large LOCA, tank OPEN: discharge begins t+370 s, empties by t+580 s, and
  **the plant SURVIVES the full 1,800 s ride** (fuel 152 °C / 306 °F, P 0.41 MPa). Tank
  ISOLATED: the plant reaches the beyond-model latch at t+500 — the pre-#511 outcome. The
  sourced sentence this reproduces (B 3.5.1): for the larger small breaks "the increase in
  fuel clad temperature is terminated solely by the accumulators."
- Severity-1: the run was already ending in the kinetics-envelope screen (the #487/#499
  held-plant contract, ~t+320, power 572 %); the tank's cold slug advances it (~t+210,
  power excursion before the screen — the void-collapse term outruns the mixed-ledger
  boron, the known local-boron simplification). DECLARED: the severity-1 large break stays
  the demonstration class it already was.
- The joint gate (`run_pwr2_loca` 14 → **17**): pumps OFF, 0.004 m² break — the passive
  tank empties itself (10,187 kg) with the mass closure EXACT (primary net = discharged −
  injected, 1e-6) and containment blind to the injection.
- The engine gate's RHR-align fixture reddened and the red was the SOURCED PROCEDURE
  arriving: depressurizing without isolating the accumulator dumps the tank and
  re-pressurizes the loop, breaking the alignment — B 3.5.1's own reason the valves are
  closed for "RCS cooldown and depressurization." The fixture now does what the operator
  does (isolates first), declared in place.

**The MSIV (`pwr2_engine` + `pwr2_relief`).** One valve, sourced placement (Ginna TS Bases
B 3.7.2): DOWNSTREAM of the MSSVs and the TDAFW steam supply, UPSTREAM of the turbine and
the condenser dumps — so a shut MSIV zeroes turbine steam and dump flow while the code
safeties, the ADV and the turbine-driven aux feed pump keep working (the contract's own
"SG code safeties upstream of the MSIV" note, now true on PWR2). ~5 s stroke [derived,
valve class]; closing at load TRIPS the turbine (sourced: closing "isolates the turbine,
steam dump system, and other auxiliary steam supplies"). The automatic main-steam-isolation
signal (hi steam flow + SI, hi containment pressure) stays future work with the
steam-line-break casualty. Measured at power: close → turbine trips at pos < 0.9, steam
flow 0.000, SG pressure rises to **1,076 psia** where the ADV (1,040 psig auto setpoint)
catches it just under the 1,085 psig MSSV pop — the exact "ADV catches an MSIV closure
five psi under the code-safety pop" sentence `Manuals/12` §8.3 has carried since Rev 14.
Reopen restores the path. Through the stack, the P-9 chain fires and the #509 mirror
reports the trip cause honestly ("turbine_trip").

**Contract and saves.** SIX true_state statics retired to live fields (the five
accumulator rows + `msiv_open` — all six were already §6.3-documented, pwr1's own fields,
so no contract edit); `hpi_active`/`hpi_flow_normalized` now key on PUMP flow only (an
accumulator dump no longer reads as HPI). pwr2-1.0 saves migrate: a pre-#511 save lands on
the constructor's open-valve/full-tank/open-MSIV lineup (the migration-note pattern).

**Gates.** run_pwr2_eccs 30 → **38** (+5 mutations: passivity severed, constant-head tank,
check valves removed, infinite inventory, valve stops isolating — 23/23 caught) ·
relief 38 → **42** (+1 mutation, 24/24) · true_state 64/64 with six statics retired and
two mutations re-targeted onto surviving statics · loca 14 → **17** · board 24 → **26**
(all four valves operable; MSIV round-trips from the diagram; the accumulator's at-power
refusal) · engine 91/91 (the RHR fixture isolates first, declared) · shell 76 ·
coredamage 20 · endurance 18p/0xf · protection 100 · feedwater 29 · afw 25 ·
pressurizer 68 · sg 32 · forwarding 11.

## 81. #512 — PER-SYSTEM LATCHES: THE PANEL IS THE RESET, AND THE TMI TERMINATION IS REACHABLE — 2026-08-25

*(OWNER DESIGN, 2026-08-25: "What if each latches on with a color change to the auto button
and the user has to click the off or manual button to unlatch?" — and, on the first cut's
overreach: "I want the players to be able to cause a TMI style incident.")* This supersedes
#509's one-button shape (RPS RESET cleared every latch) and the first #512 cut (refuse
while the signal is live — which, measured, made the TMI error UNREACHABLE on a stuck-open
PORV: the signal never clears, so injection could never be secured).

**The sourced circuit is what shipped** — WTSM 12.3.2.3 (ML11223A310), read closely this
time rather than summarized:
- The reset circuit's **time-delay relay** "produces an output (energizes) some time after
  it is started (**usually 45 - 60 sec**)"; the top of the band is adopted. SI reset also
  requires **P-4** (the reactor-trip contact, same figure).
- The reset "**does not turn off any ESF equipment** ... the only response is the removal
  of the start signal"; the operator then "can change system alignments, start or stop
  equipment as needed."
- After a reset, "**all automatic SI actuation signals are blocked**" — the re-arm block.
  (The manual-actuation pushbutton that re-arms the real circuit is declared unmodeled;
  the block clears here when the live signal drops — a recovered plant re-arms.)

**The build.** `pwr2_protection` grows, per function (SI / AFAS / FWI): a LIVE-signal flag
(the actuating condition now, latch aside), a latch-age timer against `RESET.delay_s = 60`
[sourced 45–60], and a re-arm block honoured by every latch line. `pwr2_engine` grows three
per-system doors (`reset_si` / `reset_afas` / `reset_fwi` — each clears its latch and sets
its re-arm block) and **`reset_protection` NARROWS to the reactor trip only** (rods and
breakers, still behind the kernel's rods-in permissive). The shell maps the panels' own
securing clicks onto them: ECCS STOP and AFW STOP and MFW RESTORE each refuse OUT LOUD
inside the window ("the reset time-delay relay has N s to run"), and after it **one click
resets the function and executes — signal present or not**. Dependency kept honest: a
latched SI is itself a standing aux-feed start signal (the SGLL block's own line), so AFW
refuses with "secure the ECCS first" while SI stands, and the feed module's held-SI
isolation sends MFW RESTORE to the ECCS panel the same way.

**The lamps.** A new `bd-actuated` button state (amber-orange, distinct from bd-warn's
attention yellow and bd-active's selection green): ECCS AUTO while SI is latched, AUX FEED
AUTO while the actuation is latched, MFW RESTORE while feedwater isolation stands (either
driver), HEATER AUTO while the NUREG-0737 shed latch stands — the heater row being the
idiom's in-house precedent (its latch has always cleared on the operator's heater click).
Driven off published `control_state` flags (`si_actuated` / `afas_actuated` /
`fwi_actuated` / `heaters_shed`); an engine that publishes none shows nothing new.
Screenshot taken mid-accident: all four lamps amber over a scrammed, SI-fed plant.

**THE TMI SEQUENCE, MEASURED END TO END** (stuck-open PORV, free play):
- SI latches at t+90 s (`si_lo_pzr_press`); STOP refuses at latch+0 ("58 s to run") and
  again mid-window ("26 s to run").
- With the relay run down (latch age 62 s, P-4 standing): **STOP is ACCEPTED with the
  signal still live** — SI resets, the pump secures, automatic re-actuation blocks.
- Ten minutes on: pressure 1,069 psia, **pressurizer level indicating 100 % — looks
  water-solid — while the core is actually 51.5 % voided.** The TMI deception, produced by
  the player's own deliberate termination, exactly as required.

**Gates.** `run_pwr2_board` 26 → **28 / 7 mutations** (the in-window refusal with the time
remaining · relay-met one-click reset+secure with the re-arm block · the delay-0 and
reset-click-severed mutations; the timer-accrual mutation is deliberately ABSENT and the
absence documented — the engine captures the protection module at load, so a
stepProtection mutation cannot reach the running plant; the relay-met check's fixture
accrues the timer through real steps instead). `run_pwr2_protection` 100/100, **55/55**
(seven latch-line anchors re-pointed under the re-arm gates). `run_pwr2_engine` 91/91 (two
AFW-reset checks re-pointed from the narrowed `reset_protection` onto `reset_afas` — the
claims unchanged: clearing a latch is not securing a pump; one switch per pump). shell 76 ·
endurance 18p/0xf · afw 25 · feedwater 29 · eccs 38 · true_state 64 · full aggregate at
baseline.

## 82. #515 — THE PORV STICK IS A LATCH, AND THE TMI STEPS DO NOT LIFT THE VALVE ON THIS PLANT — 2026-08-25

*(OWNER DESIGN, 2026-08-25: "The PORV stuck failure injection should work like a latch. it
shouldnt just open the PORV, it shouldnt activate until the PORV is opened. Once the PORV is
opened, then the failure injection can keep it opened. Trying to follow the steps of TMI i cant
get the PORV to open naturally through plant physics.")*

**The latch.** `drivers.porv_stick` now ARMS the failure and moves nothing: the first lift —
the controller's own +100 psi lift or the operator's manual open — sets `pz.porvStuck`, and from
then on neither the controller's reseat nor a manual close moves the valve; clearing the failure
is the only release. Before this the injection opened the valve itself, so the plant never had
to lift it and the transient that lifts a PORV was never part of the casualty. Two things fell
out of the change: (1) PWR2 had **no operator PORV** — `open_porv_manual`/`close_porv` were
routed through the stick lever, so "open PORV" was a failure injection; there is now a real
`porv_manual` demand on one valve (half the pair's capacity, the feed-and-bleed lift; Ginna's
control switches are per valve), ineffective to close while the latch holds. (2) The failure
list reports `stuck_porv_open` while ARMED, not only once latched, so the injection is visible
and clearable before the valve has lifted. The pressurizer report carries `porv_stick_armed`
and `porv_manual`; the `true_state` contract is unchanged (`porv_stuck` = latched, `porv_open`
= physically passing).

**Gates.** `run_pwr2_pressurizer` 68 → 69 checks, mutations 28 → 30 — armed-alone pinned as
shut/cold/stuck-false, then one second of the operator's lift released and the latch must hold
what the demand no longer asks for; the two new mutations are the pre-latch build (arming opens
the valve) and a clear that never releases, both red. `run_pwr2_engine` 91 → 94: arm-without-
lift, lift-latches, manual-close-does-not-move-a-latched-valve, clear-is-the-only-release.
`run_pwr2_shell`'s lamp check now lifts the valve by hand before asserting the TMI-2 lamp lies
over it. The old engine's `stuck_porv_open` is untouched: it still opens-and-holds, and the nine
TMI missions (`pwr_tmi*.js`) are authored on that semantics.

**Does anything lift the PORV on its own? MEASURED, hot full power, stick armed, dt 0.02 s.**
The lift point is setpoint + 100 psi = 2335 psia (Ginna's 2335 psig class).

| transient | peak P (psia) | PORV lift | reactor trip |
|---|---|---|---|
| loss of main feed + AFW tagged shut (the TMI steps), 100 % | 2233 at 0 s, then falls | never | 0 s, `turbine_trip` (P-9) |
| turbine trip, 100 % | 2233, falls | never | 0 s, P-9 |
| turbine trip at 45 MWe / 43 % power, rods 120 (below P-9) | 2081, falls to 1920 | never | none |
| loss of feed + AFW shut at 43 % (below P-9) | 2081, falls | never | none in 300 s |
| loss of feed + AFW shut with the P-9 CHANNEL FAILED (harness-mutated protection) | **2268 at 18 s** | never | 59.8 s, `sg_lolo_level` |
| …the same plus loss of condenser vacuum (dumps unavailable) | **2269 at 16 s** | never | 61.4 s, `sg_lolo_level` |
| loss of feed + `failure_to_scram` (ATWS), 100 % | 2501 | **98.0 s**, latched 98.0 s; safeties 102.3 s | latched 0 s, rods held |
| operator opens the PORV (`porv_manual`), stick armed | — | 0 s, latched 0 s | 32.3 s, `ot_delta_t`; P 1467 psia at 60 s |

**The reading.** TMI-2's PORV lifted 3–6 s after the turbine trip because a B&W plant has no
anticipatory reactor trip and its once-through steam generators hold seconds of inventory — the
reactor ran at 97 % against a vanishing heat sink and the pressure went through 2255 psig before
the 2355 psig trip caught it at 8 s. This plant is Westinghouse-shaped and every one of those
pieces is sourced the other way: P-9 makes a turbine trip a reactor trip above 50 % (Ginna TS
Bases B 3.3.1), so pressure FALLS from t = 0; below P-9 the 40 % dumps carry the rejection and
pressure still falls; and even with the P-9 channel failed and the dumps gone, moderator feedback
walks power 100 → 66 % as Tavg rises 18 °F, the U-tube SG holds a minute of inventory, and the
spray caps the rise at **2268 psia — 67 psi short of the lift** — before the lo-lo level trip
at 60 s. The only unassisted lift is the ATWS at 98 s, which is a different accident. **On this
plant the TMI initiating spike is not a transient the physics produce, and that is the
prototypical answer, not a defect.** The sourced Westinghouse initiator for a stuck-open PORV is
the *inadvertent* opening — "Inadvertent opening of a pressurizer relief or safety valve" is on
the Ginna TS Bases' analyzed-event list (ML20339A221, `find_source.js` verdict 2026-08-25; the
UFSAR 15.6.1 section number is [recalled]) — i.e. the valve opens on a spurious signal, not on a
pressure spike. The ruling this section leaves open is in #515: whether the sim's TMI initiation
is the operator's lift with the stick armed (built, above), a new `inadvertent_porv_open` row
(sourced initiator, a one-lever build on `porv_manual`'s wire from the failure side), or both.

## 83. #515 — THE P-9 DEFEAT, THE PORV THAT LIFTS BY PHYSICS, AND WHAT THE SECOND HALF OF TMI STILL NEEDS — 2026-08-25

*(OWNER DIRECTIVE, 2026-08-25: "then lets get rid of that anticipatory trip so that we can
recreate the TMI incident. what else do we need to adjust to get the TMI incidient to work. i
dont want to lifet he PORV on a spurious signal, how can we make it work with phycis?")*

**Built: `anticipatory_trip_failure`** — a casualty row (PWR2 only; `pwr2_only` on the def, and
the old engine's `getProtectionConfig` hides it rather than ship a hollow row). It is the P-9
turbine-trip reactor-trip CHANNEL failed: `drivers.p9_defeated` blanks the anticipatory clause
in `pwr2_protection` and nothing else — every credited function still trips through it (pinned:
the SG lo-lo level trip fires with the defeat standing). Built as a failure the operator injects
rather than a deletion, because the permissive is sourced (Ginna TS Bases B 3.3.1) and every
other turbine trip on this plant keeps it; if the owner wants it gone globally it is the one
clause. `run_pwr2_protection` 100 → 102 (mutation "the defeat wire is cut" red),
`run_pwr2_shell` 76 → 77 (the row injects, reports, and its clear re-arms a trip that then fires
on the next step — the wire both ways), `run_inspect` places the row.

**Why P-9 alone does not lift the valve — ablated** (loss of feed + AFW tagged shut, 100 %,
stick armed, 180 s; harness-side source mutations, no repo change):

| what was removed | peak P (psia) | power at the peak | PORV lift |
|---|---|---|---|
| nothing (as built) | 2233, falls | — | never (P-9 trips at 0 s) |
| P-9 | 2268 at 18 s | 67 % | never |
| P-9 + spray shut (manual 0) | 2269 | 67 % | never — **spray is not the suppressor** |
| P-9 + moderator coefficient zeroed | 2292 at 18 s | 25 % | never (the 87 % high-level trip fires at 17 s) |
| P-9 + SG inventory × 0.5 | 2267 | 67 % | never |
| P-9 + SG inventory × 0.25 | 2348 at 153 s | 0 % | **152 s — after the SG dried** |
| P-9 + SG inventory × 0.1 | 2363 at 36 s | 1 % | **34.5 s** (the once-through-SG plant) |

**The suppressor is the U-tube steam generator's inventory.** With the reactor running against a
tripped turbine the 40 % dumps and the SG safeties carry two-thirds of the heat, moderator
feedback trims power to 67 %, and the SG's minute-plus of water keeps the primary from heating —
2268 psia is where that balance sits. An SG a tenth the size (a once-through generator) lifts
the valve at 35 s: TMI-2's initiating spike is a B&W artefact, not a Westinghouse transient.

**But the PORV DOES lift by physics on this plant — later, from the dry-SG heat-up** (60-minute
rides, stick armed):

| | SG dry | PORV lifts on its own | at |
|---|---|---|---|
| P-9 as built (trip at 0 s) | 43.6 min | **52.4 min** | 2339 psia, Tavg 622 °F, pzr level 100 %, latched |
| P-9 defeated (trip at 59.8 s on SG lo-lo level, 67 % power for a minute) | 12.4 min | **18.5 min** | 2344 psia, Tavg 624 °F, latched |

The defeated case boils most of the SG in the minute the reactor runs (0.67 × 300 MWt × 60 s ≈
the inventory's latent heat), which is why it lifts three times sooner. The TMI story on this
plant therefore reads: loss of feed with the aux-feed valves tagged shut → the SG dries → the
RCS heats on decay heat → **the PORV lifts and sticks** (18.5 min with the channel failed) →
*then* the crew finds the aux-feed valves. TMI-2's 8-minute AFW discovery moves after the lift,
because on this plant restoring feed before dry-out prevents it. Nothing is spurious and nothing
is scripted: the valve lifts on pressure.

**What the second half needs — the two #515 model defects, measured against the TMI timeline**
(operator lift at 3 s, HPI throttled 4.5 min, AFW restored 8 min, RCPs tripped 73 min, block
valve 142 min, HPI restored 200 min; harness mutations, no repo change):

| build | P plateau 8–73 min | accumulators | uncovered at 120 min | block valve 142 → 200 min | outcome |
|---|---|---|---|---|---|
| as built | 1087 → 1061, then **collapses to 158 psia at 60 min** | **dump at 53 min** | 100 % at 98 min | — | **dead 97 min** (void-term flip) |
| PORV choked (flow ∝ P) | **1089 → 1064 psia — the TMI plateau** | never | 94 % | P 722 → 1015 psia; HPI refills 24 → 39 % | dead 234 min (the flip, on the refill's boron) |
| boron factor clamped ≥ 0 | collapses to 82 psia | dump at 53 min | 100 % | plant stagnant at 17 % mass | survives, not TMI |
| **both** | **1089 → 1064 psia** | never | 94 % | recovers as above | **survives to 260 min in TMI's shape** |

The choked valve alone turns the accident into TMI's: a 1065 psia plateau for an hour, no
accumulator dump, the core uncovering progressively from 60 min (21 %) through 73 (47 %) to 120
(94 %), and the block-valve closure recovering pressure. The boron clamp alone only keeps the
plant alive. Both are needed, and together the sequence runs its full 4 h 20 min. **What is
still missing after both: the cladding never heats while uncovered** — 555 °F at 94 % uncovered
(the homogeneous core credits residual steam flow with cooling every rod; §82's gap 1, the
deferred stratified vessel) — so no oxidation, no hydrogen, no burn. The choked-flow law is the
sourced form (the 179,000 lb/hr rating is AT 2335 psig); the void-term fix is a design question
(the clamp is a probe, not the answer). Both are #515's next work.

## 84. THE SPIKE IS THE PRESSURIZER, NOT THE STEAM GENERATOR — §83 RETRACTED AGAINST GINNA'S OWN ANALYSIS — 2026-08-25

*(OWNER, 2026-08-25: "How can we make this more closely resemble the tmi pressure spike? What's
the difference between our SG and the TMI one?")*

**⚠ RETRACTION.** §83 said the TMI-2 initiating spike "is a B&W once-through-generator artefact;
this plant cannot produce it without becoming a different plant." That was read off an ablation
of THIS MODEL (SG inventory × 0.1 lifts the PORV at 35 s) and it is wrong about the plant: **Ginna's
own licensing analysis of a loss of load produces the spike on a U-tube plant.** Ginna UFSAR ch15
§15.2.2 (ML20339A101, in develop's corpus), a complete loss of steam load from full power *"without
direct reactor trip by the turbine trip signal"*, Table 15.2-1:

| Ginna case (sourced) | what is credited | reactor trip | times |
|---|---|---|---|
| Case 2, peak RCS pressure | no spray, no PORV, no steam dump, minimum feedback | **high pressurizer pressure, 2425 psia** | **setpoint reached 5.4 s**, rods 7.4 s, safeties 7.4 s, peak **2748.5 psia at 8.5 s**, MSSVs 9.4 s |
| Case 1, DNBR | spray + PORVs credited, no steam dump | overtemperature ΔT | 11.6 s |
| Case 3, peak MSS pressure | pressure control credited | overtemperature ΔT | MSSVs 7.0 s, OTΔT 10.9 s |

The recirculating U-tube generator is on both sides of that table. TMI-2's B&W once-through
generator (the corpus holds no OTSG design data — GEND-061 names them only in the hydrogen
chapter; its secondary inventory and dry-out time are [recalled] and UNVERIFIED) makes the heat
sink vanish sooner, which matters for what follows the spike, not for the spike.

**Our plant on §15.2.2's own conditions — measured** (turbine trip at 100 %, feed available, P-9
channel defeated, 60 s, dt 0.02 s):

| build | at 5.4 s: ΔP / Δlevel / power | reactor trip | peak |
|---|---|---|---|
| as built (dumps auto, −9.8 pcm/°F effective) | +7 psi / +6 pts / 88 % | none in 60 s | 2268 psia at 18 s |
| ~Case 1: dumps SHUT, spray + PORV | +9 / +8 / 86 % | none | 2269 |
| ~Case 2: dumps shut, spray manual 0, block valve shut | +9 / +8 / 86 % | none | 2271 |
| ~Case 2 with BOL-class feedback (−2 pcm/°F) | +10 / +8 / 94 % | high pressurizer LEVEL, 16 s at 2290 psia | 2291 |
| ~Case 2 with zero feedback | +10 / +8 / 96 % | high pressurizer level, 15 s at 2294 | 2297 |

Neither the dumps nor the feedback moves the first 5 s: the primary swells the pressurizer **+8
level points by 5.4 s** — an insurge of the right order — and the pressure answers with **+10 psi
against Ginna's +175.** Our trip, when it comes, is the 87 % LEVEL trip at 15–16 s, a function the
safety analysis does not credit and that Ginna's Case 2 never reached because its pressure got to
2425 first. The softness is the pressurizer: `pwr2_pressurizer` is a single-region saturation-
equilibrium vessel, so a 600 °F insurge mixes into 653 °F saturated contents and CONDENSES the
steam it should be COMPRESSING — ΔP per level-point on a fast insurge measures ~1.2 psi here
against the ~17 psi/pt Ginna's numbers imply. That is the two-region ("two-h stratified") vessel
§46 sequenced last and the owner deferred *(OWNER RULING, 2026-08-19: "Defer. A.")*, now with a
sourced acceptance case it did not have then: **Case 2 → 2425 psia at 5.4 s and 2748.5 psia at
8.5 s; Case 1 → OTΔT at 11.6 s.**

**What "closer to the TMI spike" therefore needs, in order:** (1) the P-9 defeat — built (§83);
(2) the two-region pressurizer — the deferred item, ~2 days, validated against Table 15.2-1;
(3) a beginning-of-life initial condition (minimum feedback) and the steam dumps not credited —
each worth a few psi at 5 s and more later, both already reachable (an IC option; the dump mode
switch). The steam generator's type is not on the list for the spike; it is on the list for how
fast the heat sink is lost afterwards, and that is a different plant's question.

## 85. #515 BUILD 1 — THE TWO-REGION PRESSURIZER: THE SPIKE IS ON THE BOARD — 2026-08-25/26

*(OWNER RULING, 2026-08-25: "A. Then choked porv then void term.")* — Build 1 of three.

**What was built.** `pwr2_pressurizer.js` is a two-region, non-equilibrium vessel: a STEAM region
(`m_stm, h_stm`) compressed by an insurge along `dh = v·dP` — Layer 2's own convention inside
`F(P)` — so it superheats and the pressure rises steeply; a saturated POOL (`m_sat, h_sat`) at the
interface; and a stratified BOTTOM LAYER (`m_sub, h_sub`) where insurge water lands without ever
mixing into the pool (§43.2's formulation 2 measured what happens when it does). The seat
`extraMass(P)` compresses every region from the last reconciliation pressure, sums their volumes,
and fills the SLACK with liquid at the hot leg's frozen density (insurge) or empties it liquid-
first-then-steam (outsurge). No clips: no steam → water-solid (the liquid layers' bulk modulus),
no liquid → emptied. One constant is fitted — `tau_int_s` — and it is `[open]`, declared, swept
below. The old HEM vessel is formulation 4 in the module header, kept with its numbers.

**Two corrections to §84 from the source.** Ginna Case 2 starts at **2190 psia** (Table 15.0-9,
`Ginna_UFSAR_ch15_ML20339A101.txt:1189-1207`) with main feed lost at t = 0 (§15.2.2.4.1 F): the
sourced rise is +235 psi in 5.4 s, and the analysis power is 1817 MWt. The "~17 psi per level
point" was never sourceable (no level trace in the text layer) — the trip TIME is the target.

**The pressurizer alone — the P-only harness** (one hot-leg node, +37 kg/s of 316 °C water,
spray/heaters manual 0, PORV isolated; the code safeties cannot be isolated, so 3.0 s = 111 kg):

| vessel | +37 kg/s insurge | psi per level point | −37 kg/s outsurge |
|---|---|---|---|
| HEM (formulation 4), 5.4 s | **+0.6 psi** for +9.7 pts | 0.06 | −87 psi / −10.2 pts |
| two-region, τ = ∞, 3.0 s | **+197 psi** for +3.6 pts (the isentropic ceiling) | 55 | — |
| two-region, τ = 30 s, 3.0 s | +166 psi for +3.9 pts (84 % of the ceiling) | **42.4** | −93 psi / −10.2 pts, rain-out |

Seat compliance at the design point: **192 kg/MPa** (was 226; the central difference straddles
the pool's saturation line — on the insurge side the steam's isentropic-class compression rules),
solid **11.6** (was 9.2). Steam compression as tabulated: +7.6 % density per MPa from saturation
(isentropic n ≈ 1.1 would be 5.9; saturated-following 10.9). Layer 0's compressed liquid at fixed
enthalpy: +0.24 %/MPa, `T_from_h` +0.8 K/MPa, `(∂h/∂P)_T` = −5.2 kJ/kg/MPa — all physical.

**The plant — Ginna §15.2.2 through the shell** (`run_pwr2_lossofload.js`; 60 s settle to 2215
psia, then `anticipatory_trip_failure`, dumps shut, spray 0, heaters 0, block valve shut,
`loss_of_feedwater`, `turbine_trip`). The τ_int sweep, the calibration published as a table:

| τ_int | 2425 psia indicated | trip (hi_pzr_press) | rods | safeties | peak | level max |
|---|---|---|---|---|---|---|
| Ginna Case 2 (sourced) | **5.4 s** from 2190 | 7.4 s | 7.4 s | 7.4 s | 2748.5 psia at 8.5 s | not solid |
| HEM vessel (§84) | never | never (level trip at 15 s with feed on) | — | — | 2254 psia | 84 % |
| ∞ | 5.7 s | 7.7 | 7.9 | 6.2 | 2501 | 69.1 % |
| 100 s | 5.9 | 7.9 | 8.0 | 6.5 | 2502 | 69.9 |
| **30 s — adopted** | **6.3** | **8.3** | **8.4** | **7.1** | **2502** | **71.5** |
| 10 s | 7.5 | 9.5 | 9.6 | never | 2497 | 75.4 |
| 3 s | 12.0 | 14.1 | 14.3 | never | 2432 | 80.4 |
| 1 s | 14.2 | 16.2 | 16.3 | never | 2428 | 81.0 |
| 0.3 s | 14.5 | 16.5 | 16.7 | never | 2427 | 81.1 |

Even the equilibrium limit (τ → 0) trips on high pressure at ~14.5 s: **the stiffness is the
stratification, not the condensation rate** — the insurge never reaches the pool, so the pool's
heat capacity cannot absorb it. 30 s is adopted: inside 5.4 ± 1.5 s once this plant's +25 psi start,
mid-cycle feedback droop and 0.5 s channel lag are counted, and not on the isentropic limit. The
peak sits at the safeties (nominal 2500 psia here; the analysis carries +3 % tolerance and a 0.8 s
loop seal, hence 2748.5). Case 1 (spray + PORV auto): the PORV passes at 4.8 s, peak 2363 psia,
no high-pressure trip; Ginna's OTΔT at 11.6 s needs the BOL minimum-feedback IC — reported, not
gated (the follow-up §84 named).

**Three defects found and fixed inside the build — each measured, none visible from a source read:**
1. `h_fill` was never assigned in the step, so every insurge was booked at saturated-liquid density
   (596 kg/m³) instead of the hot leg's (700): the stratified layer arrived saturated. Caught by
   instrumenting the P-only ride step by step (`h_sub = 1627`).
2. The seat evaluated the fill density at the candidate P: on a blowdown a NEGATIVE slack times a
   two-phase density that rises with P made m(P) non-monotone, the bisection lost its bracket and
   the core's ledger drifted **9,560 kg** on `run_pwr2_loca`'s accumulator ride. Fill densities are
   now FROZEN at P_ref with the states; m(P) is monotone because slack(P) is.
3. The emptied regime ratcheted: an outsurge booked at LIQUID density while the vessel held half a
   kilogram of liquid, the placement removed steam instead, the seat and the placement disagreed
   60× per step, and the hot leg was pumped at ±2,000 kg/s until the core's root jumped at 54 s /
   416 psia. Two rules fixed it: a two-phase arrival SPLITS at entry (liquid to the layer, vapour
   to the steam), and the seat's outsurge SATURATES — all the liquid first at its own density, then
   steam — placed in the same order. The ride now runs its 120 s to 49 psia, ledger drift 0.0 kg.

**Refits, declared (HR10), each validated on the old build too:** the CONSTRUCTION check (`h_bar`
inside the dome → two regions at h_g/h_f); the two solid pokes (`m_stm = 0`); **WATER SOLID's
"> 8× the bubbled rate"** — its 0.21 psi/s bubbled rate WAS the softness §84 measured, replaced by
the solid rate in class [4, 25] psi/s (7.5) and bubbled < solid (6.15: on 10 s a near-critical
bubble compresses nearly as stiffly as the liquid; the loop's own 0.24 m³/MPa is the larger
compliance); the engine's drain root-jump fixture (`run_pwr2_engine`): the near root no longer
vanishes on the drain (latched false, max 0.019 MPa/step, P 1037 psia) — the guard keeps its unit
test in `run_pwr2_core`, the fixture now asserts representability. My own first draft of the
bubbled-vessel check said "less than half" — a guess, not a source; it asserts "softer".

**Gates.** `run_pwr2_pressurizer` 69 → 79 checks, mutations 30 → 37 (rigid seat, no steam
compression, insurge into the pool, interface deleted, rain-out deleted, flash deleted, spray
condenses nothing, migration skipped — all red); **new `run_pwr2_lossofload`** 9 checks / 2
mutations (τ → 0 = the old vessel, a rigid steam space), born failing on the old vessel (2425 never,
trip never, peak 2254); `run_pwr2_engine` 94 (the refit above), `run_pwr2_loca` 17, endurance 18,
shell 77 (the save migration `migrateState` wired before the seat re-link), loadfollow 36,
coredamage 20, cvcs 44, protection 102, true_state 64, board 28, `run_pwr2_perf` 4.3× (88.1 µs/step,
+4 % on the seat's extra table reads). Old saves migrate: an `m_pzr/h_bar/V_liq` vessel lands on the
two regions it implied, same mass to 0.1 kg, same level (pinned).

**What it does to TMI.** The dry-SG heat-up with P-9 as built lifts the PORV at **53.6 min** (SG dry
44.1; was 52.4). With the P-9 channel failed the TMI steps now lift the PORV **from the plant's own
pressure at 5 s** (2346 psia, Tavg 584 °F, level 65 %), the armed stick latches it, and the reactor
trips at 43 s on OTΔT as the stuck valve depressurizes the loop — TMI-2's 3–6 s lift, the trip
arriving on a different function because this plant's valve is big enough to turn the pressure
before 2425. The full timeline then reads TMI through its first half hour with no operator lift
(level 100 % from 2 min, inventory 58 % at 30 min, 940 psia) and hands over to Builds 2 and 3: the
pressure-blind PORV takes the plant to 186 psia by 60 min and the void-term flip ends it later.

**Declared, not claimed:** `tau_int_s = 30` `[open]` (no interface-condensation rate in any lane's
corpus — `find_source.js "interfac|condens.*pressurizer"` exit 1, 2026-08-25; calibrated to one
sourced case, shown as a sweep); no wall metal (heater-driven rate 0.36 psi/s against #472's 0.37
prediction, in class without it); spray water's mass stays in the loop (the standing optimistic
level error); the loop's separate 3.545 m³ `pressurizer` node (`pwr2_geometry.js:97`) is a
declared double-count with the surge line, ~5 kg/MPa of the fast-insurge compliance, left in place
because removing it re-clocks every inventory fixture (an #408-class change).

## 86. #515 BUILD 2 — CHOKED RELIEF: THE VALVE PASSES WHAT THE VESSEL OFFERS IT — 2026-08-26

*(OWNER RULING, 2026-08-25: "A. Then choked porv then void term.")* — Build 2 of three.

**Measure the regime first.** On the TMI timeline (the §85 ride, physics lift at 5 s) the
pressurizer is **water-solid for 95.3 % of the first 78 minutes** (223,064 of 234,001 steps) and
**89 % of the relief steps discharge liquid** (`relief_h = h_f`). The PORV is passing water —
TMI-2's own mechanism — so the liquid law is the regime that binds, not a corner.

**The law.** Each valve is ONE effective area, derived once from its sourced rating ("179,000 lb/hr
at 2335 psig", Ginna TS Bases ML20339A221:15241; "288,000 lbm/hr per valve", ch15 :783-793) through
the same flux law that then runs live: `criticalFlux(h0, P0)` — the homogeneous critical mass flux
of fluid at (h0, P0) along a throttled path to the throat, `G(P_t) = ρ(h0,P_t)·√(2∫dP/ρ)`, maximised
over P_t. No correlation text is in any lane's corpus (Appendix K's Moody is cited only); the FORM
is sourced (homogeneous critical flow) and every number comes from Layer 0. Cross-checks:

| fluid at the valve | 16.2 MPa | 6.9 MPa | 2.0 MPa |
|---|---|---|---|
| saturated steam, this law | 23,922 kg/m²s | 9,438 | 2,713 |
| ideal-gas choked (γ 1.3), reference | 20,184 | 9,073 | 2,819 |
| saturated liquid, this law | 43,158 (1.8× steam) | 25,803 (2.7×) | 10,783 (4.0×) |
| orifice √(2ρΔP), the overstatement | 136,766 (5.7× steam) | 100,417 (10.6×) | 56,824 (21×) |

The derived area is **1.86 cm² per PORV**; at 1000 psia a stuck valve passes **1.76 kg/s of steam,
4.80 kg/s of saturated water** (the orifice law would say 18.7; the constant law said 4.45 at any
pressure). The throttled path stands in for the isentropic one (Layer 0 carries no entropy) —
declared, direction slightly high. Back pressure 0.1 MPa — the throat sits at 0.55–0.75 P0, far
above containment for any relief the plant sees.

**What it does to TMI** (the §85 ride, physics lift at 5 s, HPI throttled 4.5 min, AFW found
8 min, RCPs off 73 min, block valve 142 min, HPI 200 min):

| t | P (psia) | level | RCS mass | note |
|---|---|---|---|---|
| 1 min | 1660 | 54 % | 98.7 % | scrammed on OTΔT at 43 s |
| 4.5 min | **1077** | **100 %** | 96.6 % | the deception — HPI throttled here |
| 8 min | 1083 | 100 % | 90.8 % | |
| 15 min | 1067 | 100 % | 79.6 % | |
| 30 min | 935 | 100 % | 58.0 % | core 17 % uncovered (HEM proxy) |
| 50 min | 649 | 94 % | 37.8 % | |
| 60 min | 230 | 37 % | 84.7 % | the accumulators dumped (~55 min) |
| 142 min | block valve shut | | 64 % | the loss ends |
| 220 min | 1219 | 91 % | 112 % | HPI restored at 200 min — the vessel refills |
| 260 min | **1666** | 100 % | 121 % | **alive** — the plant repressurizes |

The whole timeline runs (the old vessel + constant valve died at 97 min); the block-valve closure
and the HPI restore do what TMI-2's did. The plateau is SHORTER than §83's ablation predicted
(1070–1080 psia from 4.5 to 15 min, then a slide to the accumulators at ~55 min, against
"1065 psia from 8 to 73 min"): that ablation scaled the constant STEAM flow with pressure and never
saw the solid vessel; the honest law passes water at 2–4× the steam flux. And this plant's PORV is
**3.6× TMI-2's per MWt** (Ginna's 2 × 179,000 lb/hr at 1520 MWt vs TMI-2's one valve at 2772 MWt)
with a similar inventory per MWt — so its TMI loses inventory faster than TMI-2 did, by plant
identity, declared. §83's ablated table is superseded by the one above; §45's published table
(1564 / 1190 / 823 / 442 psia at 1 / 3 / 11 / 16 min stuck) is superseded by the gate's own ride.

**Gates.** `run_pwr2_pressurizer` 79 → 85, mutations 37 → 40 (pressure-blind flux, a solid vessel
relieving at the steam flux, a throat search that never chokes — all red); the stuck-PORV check
now tests the LAW (one valve's area × the flux at THIS pressure: 2.60 kg/s at 1459 psia); the
WATER SOLID rate window ends at the first relief step (a solid vessel now passes water through
the valves at 25 kg/s — the compliance claim, 11.3 psi/s, is measured relief-free);
`run_pwr2_engine` 94 (the manual-close check reads the law: 4.12 kg/s at 2202 psia); loss-of-load
9, shell 77, endurance 18, loca 17, coredamage 20, true_state 64, cvcs 44, board 28, perf 4.

## 87. #515 BUILD 3 — THE VOIDED CORE IS SUBCRITICAL AT ANY BORON — 2026-08-26

*(OWNER RULING, 2026-08-25: "A. Then choked porv then void term.")* — Build 3 of three.

**Two defects in one line of `pwr2_kinetics.js`, both measured before the edit.**

1. **The moderator term's REFERENCE was two-phase below 1,326 psia (9.145 MPa).**
   `moderatorReactivity` rebuilt both densities through `rho_from_h(h_l(T, P), P)`; below
   P_sat(304.5 °C) the reference enthalpy exceeds h_f(P) and the "reference density" is a mixture
   (610 kg/m³ at 8.8 MPa, 155 at 5, 7.6 at 0.5 — liquid truth 702–684). Every depressurized plant
   carried invented positive reactivity BEFORE any boron moved:

   | saturated legs at 700 ppm, T_ref 304.5 °C | 1,378 psia (9.5 MPa) | 1,276 (8.8) | 725 (5.0) | 73 (0.5) |
   |---|---|---|---|---|
   | as built (pcm) | −72 | +1,058 | +6,688 | +9,761 |
   | liquid reference (pcm) | −72 | +70 | +901 | +2,489 |

2. **The `(1 − B/986)` boron factor flipped the density terms POSITIVE above 986 ppm** — and it
   scaled the VOID term too, so boil-off concentrating SI boron (677 → 2,271 ppm on the TMI ride,
   §83) made a scrammed, 99.5 %-void core prompt-supercritical. The dry-core sum (void + direct
   boron) at 73 psia (0.5 MPa), engine-consistent calibration — §83's ±500,000 figures were a
   poisoned `modCoeff` cache: the FIRST caller's pressure was frozen for the process, and a scratch
   harness calling at 0.5 MPa read 13.4× the engine's K:

   | dry core, 0.5 MPa | 0 ppm | 700 | 986 | 1,500 | 2,271 | 2,500 |
   |---|---|---|---|---|---|---|
   | as built (pcm) | −33,872 | −9,825 | 0 | **+17,657** | **+44,143** | **+52,010** |
   | Build 3 (pcm) | −33,864 | −33,864 | −33,864 | −33,864 | −33,864 | −33,864 |

**The form** (`liqRho`, `calibrate`, `boronFactor`, `voidReactivity`). The calibration is computed
ONCE at (260 °C, 15.5 MPa = `HZP.P_mpa`, tied by a gate check): K = 3.7061e-4 Δk/k per kg/m³. The
reference is Layer 0's compressed liquid, `rho_l_sat(T)·(1 + (P − P_sat(T))/bulk_modulus(T))` on
the tabulated `P_sat_T` (two 80-iteration `P_sat` bisections leave the step). The boron factor is
the fit's `1 − B/986` FLOORED at g_min = −0.0762 — the value where the hot-leg MTC reaches the
sourced +5 pcm/°F envelope (Ginna UFSAR ch15 :69, :884, :5183; at 330 °C, so B_cap = 1,061 ppm).
The void term is `−K·Δ + min(w_B·B, (1 − g)·K·Δ)`: moderation loss, always negative (WTSM 2.1
§2.1.6.3 :936, *"The formation of voids in the core has the same effect as the temperature
increase of the moderator"*); the boron that leaves with the water at the fit's coupling (:938);
capped by the boron worth the balance actually holds (10 pcm/ppm). **The theorem the gate asserts
at 45 states: void + boron ≤ −K·Δ** — boron can never make a voided core LESS subcritical than
the unborated voided core. Dry core at any boron: −33,864 (0.5 MPa), −25,042 (8.8), −19,427
(15.5) pcm.

**What did not move.** `rho_excess` 0.087579; `criticalBoron` at HZP 975.000 ppm (a bracketed
bisection on [0, 5000] now, NaN if the vessel can never go critical); the small-void coefficient
−70.9 pcm/%void at 700 ppm; the cold-worth ratio 1.786; the fit residuals at the three ITC points
−0.41 / −0.10 / −0.08 pcm/°F (810 / 902 / 975 ppm — the 810 miss is pre-existing, the anchor
transposed through the old engine's cubic, [open]). The MTC sweep (0–2,500 ppm × 100–330 °C)
tops at exactly +5.00 pcm/°F (1,100 ppm, 330 °C). The −35 pcm/°F side is RECORDED, not applied:
the fit's own 0-ppm intercept is −37 at 557 °F and the exceedance (−65.6 at 0 ppm / 330 °C)
lives below ~460 ppm hot, a dilution regime no IC occupies — a floor there would halve the
sourced anchor. The bounded positive void regime above 1,061 ppm (the sourced *"positive void
effect at high boron"*, :939-941) peaks at +1,765 pcm and is covered 10× by the direct boron term.

**Rides.** The 40 cm² cold-leg break: reactivity NEVER positive after the scram (the moderator
term +721…908 pcm at 700 ppm where it read +6,400…6,800); the core's inner thermodynamic guard
still latches (79.6 s facade / 199.6 s in the engine fixture, at the 0.1 MPa floor) — a held
plant, not a kinetics death; the engine gate's note records that mechanism. The severity-1 large
break + ECCS (born failing at t+210–320 s, 572 %, §80): scrammed, max reactivity ≤ 0, fuel finite
— and the inner guard latches at 161.1 s (322 psia, 100 % void, 2,393 ppm). **Filed as #517**:
pre-existing, now visible. The scram-recovery fixture in `run_pwr2_reactor` (a FOURTH declared
re-measure): the +12 dpm at 20 s and the 477 % ring were defect 1 — that cooldown falls through
1,600 psia by 16 s; the recovery now climbs at +3.24 dpm at 51 s (32 %) and settles at 100 % with
no overshoot (0.00 dpm at 120 s). The TMI timeline (§86): unchanged within 14 psi at every row
(1,067 / 935 / 654 / 232 / 1,218 / 1,680 psia at 15 / 30 / 50 / 60 / 220 / 260 min), alive at
260 min — Build 3 costs it nothing. One observation, NOT adjudicated: after the 200-min HPI
restore, with the RCPs off, zero void and 175–267 °F of subcooling, the clad reads 696–978 °F
(205–250 min) — a covered core on natural circulation at 1.1 % decay heat, #472's territory;
noted on #517.

**Gates.** `run_pwr2_kinetics` 71 → 82, mutations 40 → 45 (the liquid branch reverting, the
envelope floor removed, the cap removed, a calibration that follows the caller's pressure, the
bracket sign — all red); the identity check is a declared REFIT — its expectation path was the
artefact path; `run_pwr2_endurance` 18 → 19 (`loca-sev1-eccs-30min`); `run_pwr2_reactor` 41
(the sample moved, the count did not); engine 94, coredamage 20, loca 17, shell 77, lossofload 9,
cvcs 44, true_state 64, perf at baseline.

## 88. #517 — THE SUPERHEATED-STEAM WING, AND THE CAP THAT KEEPS IT FROM COOLING THE CORE — 2026-08-26

*(OWNER RULING, 2026-08-26: "Build the superheat wing anyway.")* — given after the measurement
below was put to him with three alternatives, and it is a deliberate reaffirmation, not a default.

### 88.1 The filed premise was refuted before a line was written

#517 says the two LOCA rides freeze because *"the core node's enthalpy walks off Layer 0's
tabulated range at low pressure (superheated steam + decay heat with no liquid)"*, and recommends
a superheat wing as the fix. **Measured on both rides, and it is not what happens.**

| severity-1 (0.002 m², cold leg, injection answering) | P | core node | per-junction Courant | envelope walls |
|---|---|---|---|---|
| 140 s | 744 psia (5.13 MPa) | quality 0.74 | 0.07 | none |
| 160.20 s | 489 psia (3.37 MPa) | quality 0.84 | **1.22** — hot leg 16.2 kg carrying 990 kg/s | none |
| 160.28 s | 205 psia (1.41 MPa) | quality 0.79 | **60** — hot leg 4.6 kg, 13,697 kg/s | none |
| 160.30 s | **14.5 psia (0.1 MPa)**, the floor | — | 2,745 | 4 clamped, 387 MJ discarded |

The latch is the **floor guard** (`pwr2_core.js:334`) — pinned at the property floor, unbracketed,
2,381 kg it cannot shed. **The core is at quality 0.84–0.88, inside the dome, when the instability
starts, and no node touches either enthalpy wall until the blow-up step.** The precursor is
numerical: at ~7 % inventory the ring nodes hold single-digit kilograms, so the derived junction
flows (`carry = carry − dm_dt`, `pwr2_loop.js:162`) amplify to 990 → 13,697 → 124,675 kg/s while
`mdot_loop` stays 76–87, and donor-cell transport moves many node-contents per step — the exact
oscillation `pwr2_loop.js:112-116` documents.

**The canary for this is DEAD.** `courantLimit()` divides by `sys.mdot_loop`, not by the junction
flows that do the transporting, so `courantOK` reported **0 violations on every step** of a ride
whose true junction Courant number reached 2,745. Filed separately; **not fixed here.**

So the wing is **inert on both rides #517 is about**, and that was known before it was built. It
is accepted on the regime where superheat actually lives, and the negative control is gated.

### 88.2 Measure the regime first — and it is large

Re-measured on today's engine (§35/§36's 470 °C figure predates the pressurizer rebuild and the
choked relief):

| ride | superheat onset | duration | peak |
|---|---|---|---|
| 5 cm² unmitigated, facade | **575 s** | **1,225 s of an 1,800 s ride**, no latch | 303 kJ/kg, **131 °C (236 °F)** above saturation at 200–380 psia |
| 20 cm² unmitigated, facade | 141 s | 203 s | 606 kJ/kg, 248 °C (446 °F); latch at 344 s |
| 20 cm² unmitigated, engine-direct (`run_pwr2_coredamage`) | 362 s | 1,438 s | **698 °C (1,257 °F)** |
| 5 cm² **with** injection | **never** | — | — |

**Injection is what holds a core two-phase**: the identical 0.002 m² break superheats to 138 °C
engine-direct and 18.6 °C through the facade with the emergency core cooling answering. The
800 °C envelope ceiling is never reached on any of them, so every superheat reported is computed
rather than clamped.

### 88.3 The properties are sourced, and the transcription is the trap

Layer 0 gains `k_v` and `mu_v` — steam thermal conductivity and viscosity — **[sourced]** to
WCAP-16009-NP-A (ML050910161) §10-2-1-2, *"equations given in the ASME Steam Tables (1968)"*,
Eqs 10-20/10-21 (conductivity) and 10-22/10-23 (viscosity). Same document Table 10-3 came from,
so `vapor_ratio` and this are one method at two states.

**⚠ THE UNITS ARE MIXED INSIDE ONE EQUATION AND THE DOCUMENT DOES NOT SAY SO.** In Eq 10-20, T is
°C in two terms and **Kelvin** in the ρ² denominator, and ρ is g/cm³ throughout, not kg/m³. Read
with °C everywhere the correlation returns **71.9 mW/m-K against a true 54.7 at 300 °C — +31 %**:
plausible, monotone, wrong, and invisible to any check written from the same reading. The gate
therefore compares against values **not taken from the source document**: k 54.99 vs 54.7
(+0.5 %) and μ 19.84 vs 20.0 µPa·s (−0.8 %) at 300 °C; +4.1 % / −2.2 % at 200 °C.

### 88.4 ⛔ THE CAP IS THE FINDING — uncapped, an observability term made core damage unreachable

The factor is the Dittus-Boelter property group `k^0.6 cp^0.4 mu^-0.4` at the superheated state
over its value at saturation, same pressure, same mass flux — exactly 1 at zero superheat, so
`vapor_ratio` keeps its landed calibration untouched. Across the 5 cm² ride's own regime
(54–380 psia, 0–250 °C of superheat) it measures **0.92 to 1.09**; the large penalty, 0.53, lives
at 2235 psia where a core node never superheats.

**But the raw group rises ABOVE 1 as steam superheats at low pressure** — correct arithmetic
(conductivity climbs with temperature faster than viscosity costs at fixed mass flux) and the
wrong answer here. **Measured on the 20 cm² damage ride, where the core reaches 698 °C of
superheat and the uncapped group reads ~1.5:**

| | peak clad | 2200 °F | 2500 °F | oxidation |
|---|---|---|---|---|
| uncapped | **2,416 °F** | 770 s | never | **24.0 %** |
| capped at 1 (shipped) | **27,267 °F** | 644 s | 706 s | **100 %** |

**A term added for OBSERVABILITY had quietly turned a 100 %-oxidation runaway into a survivable
ride.** (That fixture is engine-direct with no protection layer, so the absolute peak is not a plant
claim — the A/B delta is.) The cap is sourced, and it is the only directional evidence in the corpus on this exact
regime — WCAP-16009-NP-A B-2-9-2, on the ORNL dryout tests, verbatim: *"Despite increased mixture
velocity, low flowrates, increasing void fraction, and superheating of vapor decreases heat
transfer."* Everything Dittus-Boelter omits at these conditions — droplet depletion, laminarizing
flow, Reynolds numbers orders below the correlation's range — runs the other way and dominates.
So the term claims only the half it can defend: **superheat may DEGRADE cooling, never improve
it.** With the cap the damage ride is unchanged to 0.3 %.

The general lesson, and it is not about steam: **a defensible mechanism evaluated outside the
regime it was validated in can be worse than no mechanism.** The band table said ±10 % and was
measured over the pressures the 5 cm² ride occupies; the damage ride goes to 698 °C, five times
past where the band was taken. **Measure the regime the term will actually see, not the one that
motivated it.**

### 88.5 What the wing changes, and what it does not

- `core_superheat_c` is published. `core_void_fraction` **clips at 1**, so from the moment the
  core goes fully void it is a constant: on the 5 cm² ride it pins at 1.0 at 580 s and says
  nothing for the next 1,220 s while the core dries 0 → 131 °C and the clad climbs 555 → 677 °F.
- `core_uncovered_frac` no longer saturates. Void carries 0 → 0.9 of the range, superheat the
  last 0.1 over a [derived] 150 °C span. It stays a **declared HEM proxy** — there is still no
  water level and this does not invent one; #472's stratified vessel is what replaces it.
- **It does NOT explain the cool clad on a dry core.** Under 10 % in-regime against the flow
  term's orders of magnitude. That is the loop still circulating steam through an unstratified
  core — §83 gap 1, #472 — and this is written down so nobody reaches for the wing as the cause.
- **#517's rides are unchanged**, as predicted: latch 160.8 s (was 161.1) and 79.8 s (was 79.6),
  max core superheat 18.6–21.9 °C. Gated as a negative control in `run_pwr2_endurance`: if
  someone later tunes the factor until those rides move, it reds.
- **No perf cost** — 79.1 µs/step, ratio 3.9×, against 80.1 before. The superheat path runs only
  above h_g. The vtable superheat table the plan flagged as possibly required is measurably
  unnecessary and was not built.

### 88.6 The held plant now says it is held — and the snapshot it holds is the corrupted step

`sys.beyond_model` lived on `sys` and **nothing published it**: no `true_state` key matched, and
`grep beyond_model ui layers` returned zero hits. The player got a plausible, internally
consistent, completely static plant that went on accepting commands — 160 minutes of it on the
TMI ride. `model_held` and `model_held_why` now publish it, and **both guard families** are
covered: the inner thermodynamic latch and the facade's own screen. That second half needed its
own fix — `_lastTs` is by construction the last state that **passed** the screen, i.e. a healthy
one, so replaying it verbatim republished `model_held: false` for ever; it is stamped on the way
out.

**⚠ NEW, NOT ADJUDICATED: the held state is the BLOWN-UP step, not the last good one.** The floor
and both-walls guards latch *after* committing h and P, so the frozen snapshot on the severity-1
ride reads 14.5 psia with core void 0 % and uncovery 0 % — the corrupted step, held for ever. The
root-jump guard already does the right thing (*"hold THIS step, nothing adopted"*); the other two
do not. Recorded on the transport issue; changing which step is committed moves every latch
fixture and is not this ruling's scope.

### 88.7 #517 item 2 — the clad on a covered core is NOT a fuel-node artefact

The observation: after the 200-min injection restore, with the pumps off, **zero void and
175–267 °F of subcooling, the clad reads 696–978 °F** (205–250 min). Measured directly — a covered
core (void 0) at 1.1 % decay heat, fuel node stepped to equilibrium:

| flow fraction | mdot | film coeff. | clad RISE | clad at 300 °F coolant |
|---|---|---|---|---|
| 0.100 | 163 kg/s | 4,755 W/m²K | 1.2 °C (2.2 °F) | 304 °F |
| 0.020 | 33 kg/s | 1,312 | 4.1 °C (7.4 °F) | 309 °F |
| 0.002 | 3 kg/s | 208 | 25.6 °C (46 °F) | 348 °F |

**The fuel node cannot produce that clad temperature on a covered core — at most ~46 °F of rise
even at 0.2 % of rated flow.** So the reading must be tracking `coolTemp_c`, i.e. the **core
node's own temperature**, which would mean the "zero void and 175–267 °F subcooling" in §87 is
read off a different node than the core. **That is what to measure — not the film coefficient.**
Left open on #517.

### 88.8 Gates

`run_pwr2_water` 242 → **255** (mutations 27 → 35: the Kelvin-vs-°C transcription itself, ρ in
kg/m³, the density terms deleted, the viscosity slope, the micropoise conversion, superheat from
h_f not h_g, superheat pinned to 0, the viscosity exponent flipped); `run_pwr2_fuel` 64 → **73**
(32 → 38: the wing deleted, a boundary that is not 1, a fabricated degradation, the factor on the
liquid branch, the void-1 refusal removed, **the cap removed**); `run_pwr2_true_state` 64 → **71**
(18 → 23: the proxy saturating again, superheat pinned to 0, superheat off the hot leg,
`model_held` hard-wired false, `model_held_why` back to null); `run_pwr2_coredamage` 20 → **23**
(the regime is reached, 1,438 s of it, inside the envelope); `run_pwr2_endurance` 19 → **20** (the
negative control); `run_pwr2_reactor` 41, **mutations 23 → 25** — two anchors had to be re-cut
because `coreRegime` gained the superheat pair, and an anchor that stops matching reports ANCHOR
NOT FOUND and counts as a blind spot rather than silently passing, which is the only reason it was
caught in the same change. `run_contract` 177 unchanged: **PWR2-only fields do not go in §6.3**,
which audits the old engine's list — 14 such fields already existed and none are documented there.
Aggregate **93 runners at baseline**.

Two traps worth the line beyond the cap. **A new cross-layer dependency breaks the mutation
LOADER first** — `pwr2_fuel.js` had no property dependency until now, its harness evals the file
into a bare root, and `W` came back undefined; loudly, which is the good case. And **a negative
control written in the wrong harness measures a different plant**: the severity-1 control was
first written into `run_pwr2_coredamage`, which is engine-direct with no injection, where the same
break superheats to 138 °C instead of 18.6 — it failed against a number that was never the claim.

## 89. #518 — THE CANARY WAS MEASURING THE WRONG FLOW, AND THE FREEZE WAS HIDING A WORKING ECCS — 2026-08-26

*(OWNER RULING, 2026-08-26: selected "Canary + sub-step" from four options put to him with the
measurement below — a selection, not verbatim words.)*

### 89.1 The defect: one number about a different quantity

`courantLimit()` divided the smallest ring node's mass by **`sys.mdot_loop`** — the HEAD flow, one
scalar for the whole ring. What donor-cell actually transports is **`sys.junctionFlow[id]`**,
derived per node by the walk at the bottom of `stepLoop`. Those are the same number on a healthy
plant and nothing alike late in a blowdown: at ~7 % inventory the ring nodes hold single-digit
kilograms, a small node's large relative `dm/dt` amplifies the derived flows, and the two diverge
by four orders of magnitude — **990 → 13,697 → 124,675 kg/s against a head flow of 76–87.**

**So the one diagnostic built to name this instability reported ZERO violations on every step of a
ride whose true per-junction Courant number reached 2,745.** Not quiet — dead. And every existing
check around it ran on plants where junction flows equal the head flow, i.e. exactly where the two
forms are the same number, which is why nine days of green probes agreed with it.

### 89.2 The measurement that decided the fix

Sub-stepping is a smaller dt in the transport, so the question is whether a smaller dt saves the
severity-1 ride (0.002 m² cold-leg break with injection answering):

| dt | latch | P at 400 s | inventory | worst per-junction Courant |
|---|---|---|---|---|
| 0.02 (house) | **160.8 s** | 14.5 psia (0.1 MPa, the floor) | 8.0 % | **2,230** |
| 0.01 | none | 207.8 psia | 4.4 % | 2.0 |
| 0.005 | none | 207.6 psia | 4.4 % | 0.7 |
| 0.0025 | none | 207.4 psia | 4.4 % | 0.4 |

**Converged to 0.2 % across three halvings.** The dt = 0.02 answer is the outlier — a
discretisation artefact, not a plant trajectory. And what the converged plant does matters:
pressure falls to 82 psia (0.57 MPa), **injection refills the vessel — inventory 1.3 % → 4.0 % —
and the clad cools 447 → 328 °F.** *The freeze was hiding a working emergency-injection recovery.*

**Cost, measured on the converged trajectory** (what an outer dt of 0.02 would have needed):
**83 extra inner solves across 90,001 outer steps — 0.09 %.** Worst case **N = 3**; the first step
needing more than one is at **160.0 s** of an 1,800 s ride. `run_pwr2_perf` after: 84.9 µs/step,
ratio **4.1×** against 79.1 / 3.9× before — run-to-run noise.

### 89.3 What was built

**The canary**, per junction: each ring node's mass against the flow leaving it, minimum over the
ring. Still a scalar in seconds, still 0.370 s on a rated plant.

**The sub-step**, in `stepLoop` (Layer 3) — `N = clamp(ceil(dt / limit), 1, 16)`, calling
`CORE.step` N times with dt/N. **In Layer 3 and not Layer 2** because `CORE.step` is generic and
the ring is Layer 3's; each Layer 2 call then still advances exactly its own interval and
`run_pwr2_core`'s 22 mutation anchors are untouched. **The junction flows are re-derived between
sub-steps** — sub-stepping a frozen flow set advances the same wrong transport N times in smaller
pieces and arrives at the same wrong answer.

**This implements `PWR2_PHYSICS.md` §17.5, which ADOPTED sub-stepping and never built it** —
nothing in this engine subdivided anything until now. §24.2's contract is honoured verbatim: the
last sub-interval takes the remainder rather than dt/N, so N floating-point divisions cannot leave
the clock short. Measured drift over 500 steps at dt = 0.02, 50 at 1.0 and 20 at 5.0 s: **< 1e-13,
floating-point accumulation, not a systematic deficit** — which is the silent failure §24.2 exists
to prevent. `pwr2_core.js`'s own header said `step` *"never sub-steps a partial interval"* —
narrower than §24.2 actually rules, and corrected here rather than left to read as forbidding what
Layer 3 now does.

### 89.4 Two declared departures

Both are agent-authored design text, advisory under `CONTEXT.md` §3 rule 4 — weighed, departed
from, and stated rather than slid past:

1. **`PWR2_DESIGN.md` §32.2 ruled the limit "REPORTED, not enforced… the layer still takes the
   step… and does not decide what to do about it."** Choosing N from that number IS the layer
   deciding. The defence: it still TAKES the step and still advances exactly dt — it subdivides
   rather than refuses, so a caller wanting a coarse survey gets the interval it asked for, and
   `courantOK` still reports the OUTER dt. It is never handed a green light it did not earn; it is
   simply no longer handed an unstable answer along with the warning.
2. **`PWR2_PHYSICS.md` §26.3 declares the low-pressure limit STRUCTURAL** — *"Below roughly 1–2 MPa
   PWR2 resolves the liquid/two-phase transition at the limit of its timestep… Sub-stepping and
   the bracketed closure keep it stable and conservative; they do not make it accurate"*, and
   *"Declare it; do not engineer around it."* **This claims STABILITY ONLY.** Late-blowdown numbers
   remain quantitatively coarse, and the convergence check asserts agreement between two
   discretisations of the same model — which is stability, not truth.

### 89.5 ⛔ Found by writing the canary's own check: `courantOK` was reporting about a plant that no longer existed

`r.courantLimit_s` re-evaluated `courantLimit(sys)` on the state **after** the step. By then the
junction flows have been re-derived, so a step taken on a violating state could report
`courantOK: true` about a state that had already been overwritten — and it made `subSteps` and
`courantLimit_s` describe different plants: *"I needed 6 sub-steps"* beside *"you were comfortably
inside the limit."*

It surfaced because the new check hand-plants a junction flow at 100× the head flow and asserts
`courantOK` goes false — and it did not, because the re-derivation wiped the planted flow before
the report read it. **The binding condition is the state the step STARTED from**, so that is what
is reported now, and it is the same number `N` was chosen from.

### 89.6 A stale number in a comment, which is the worse way to be wrong

`pwr2_loop.js`'s header said the binding node is *"the cold leg at ~930 kg against 1630 kg/s, i.e.
0.435 s."* Measured: the binding node is the **RCP at 603 kg → 0.370 s**, and
`PWR2_DESIGN.md` §32.1 had it right all along at *"~600 kg… dt ≤ 0.370 s."* **The code always
returned 0.370; only the prose was stale** — wrong node and wrong number — and a number in a
comment is what the next person sizing a timestep reads.

### 89.7 The reds, adjudicated one at a time (Hard Rule 10)

| Check | Verdict |
|---|---|
| `run_pwr2_loop` mutation *"Courant limit reported as a constant"* | **Anchor was verbatim the rewritten line** → ANCHOR NOT FOUND → blind → gate exits 1. Loudly, which is the good case. Re-cut. |
| `run_pwr2_engine` *"ridden deeper the plant DECLARES beyond-model and holds"* | **The fix working + a stale fixture.** It reached the floor WITH injection running — but that blowdown was the instability. With the ring sub-stepped the same break sits at **62.9 psia and alive at 600 s**. A latch check that passed only because the transport was unstable was testing the defect. The fixture now stops the injection and the plant genuinely runs dry: **latch at 171.8 s at the floor, finite.** *The check itself is unchanged — only the condition it is asserted under.* |
| `run_pwr2_endurance` `loca-sev1-eccs-superheat-inert` | **The fix working; the band was fitted to a frozen ride.** 40 °C was measured on a ride that died at 161 s; it now runs 1,800 s — 11× longer to superheat in — and reads **46.0 °C**. Re-banded to 70 as a **declared refit**, validated on the OLD behaviour too (the pre-#518 18.6 °C passes it as well), so it is the same claim with the frozen horizon taken out. The contrast that carries it is unchanged: **138 °C engine-direct with no injection.** |
| `run_pwr2_coredamage` / `run_pwr2_loca` `courantBad === 0` | **Predicted red that did NOT happen, and it is worth saying why rather than banking it.** Those rides are engine-direct and never violate the per-junction limit. The facade 20 cm² unmitigated ride does: **3 violations, sub-stepped on 3 steps, max N = 6** — and it still latches at 340.7 s at the floor, because an unmitigated large break genuinely runs out of water. **The guard is untouched and still reachable.** |

**Neither latch was weakened.** The plant stops reaching the floor because the transport is right,
never because the guard got looser — both thresholds and their negative controls (§50) stand.

### 89.8 Gates

`run_pwr2_loop` 37 → **45**, mutations 15 → **20** (the canary back on the head flow; the sub-step
disabled; N pinned at 1; sub-intervals not summing to dt; `courantOK` reading the sub-step; the
flows not re-derived between sub-steps). The last of those was **BLIND to every check in the first
draft** — the loop gate's fixtures are healthy plants where N is 1, so nothing could see a frozen
flow set. The check that catches it is an **equivalence**: one call subdividing into N must land
where N calls of dt/N land, driven with a heat imbalance so the flows actually move. Everything
else at baseline: engine 94, endurance 20, coredamage 23, loca 17, core 46, sources 35, perf 4.
**Aggregate 93 runners at baseline.**

**Not done, and the docs say why:** solving the junction flows instead of deriving them. They are
*ruled* algebraic (§23.2 step 4, §23.3); the one prior related attempt was built and diverged
(−2.97e+12 relative energy drift, `pwr2_core.js:161-187`); the solve is an unruled Layer 3 decision
the design says should not be guessed at. Also still open from #518: the held snapshot is the
**blown-up step**, not the last good one — the floor and both-walls guards latch after committing,
while the root-jump guard correctly does not.

## 90. #520 — A HALTED SIMULATOR NOW SAYS SO, AND OFFERS THE ONE WAY OUT — 2026-08-26

*(OWNER, 2026-08-26: "Work 520. Could have a popup that explains what happened and a button to
reset.")* — the design is the owner's; this is what it took to make it real.

### 90.1 What was missing

The engine HOLDS when the plant leaves the range Layer 0 is characterised over: state frozen,
clock running, every control still accepted and doing nothing. §88 published `model_held` and
`model_held_why` so it *could* be seen. **Nothing displayed them** — `grep model_held ui layers`
returned zero hits — so the player still got a plausible, internally consistent, completely static
plant. Measured on the TMI timeline: **160 minutes of it**, every command "accepted".

### 90.2 The dialog, and why it reuses the mission window's chrome

`#haltOverlay` is a `.mission-overlay` / `.mission-modal` — the same frame as Plant & Mission,
deliberately, because a second set of modal chrome is a second thing to keep consistent. It opens
through `openModal`, so it inherits the named `'modal'` pause hold; `z-index: 214` puts it above
the mission window, since a halt is the thing that needs answering first.

Three things it has to do, and each is gated:

- **Explain.** Four paragraphs: what has happened, that it is not a crash and not the player's
  fault, the cause verbatim from `model_held_why`, and that the run cannot be continued.
- **Offer the way out.** `doReset(true)` — armed, because *this dialog is the confirmation* and
  raising the native `confirm()` on top of it would be asking twice.
- **Not lose the fact when dismissed.** "Leave it — let me look at the board" is a real option (a
  frozen board is informative), so **the clock carries a `HELD` marker** for as long as the
  condition stands. Without it, dismissing would re-create the exact defect this issue is about.

**The reset had to be a rebuild.** Nothing in the repo clears `_dead` or `sys.beyond_model` —
grep is zero, by design — so recovery is `selectPlant` constructing a fresh engine. `doReset` was
already wired to it; no new engine code was written.

### 90.3 ⛔ The lesson #517 paid for, applied here

**#517's first attempt at board rows for these fields passed every gate in the suite and was
INERT.** The rows were keyed to chart series that did not exist, `buildPhysIndex` dropped them,
and `verify_e2e_ui` stayed green throughout. Only driving the board found it.

So this was built the other way round: **the board was driven to a real halt before anything was
claimed.** A large break with the station blacked out has no injection to answer it and the plant
genuinely runs dry — full-stack, held at **378 s**. The dialog opened at T+18:03, named the cause,
the clock read HELD, and Reset returned the plant to T+00:00:02 with the marker cleared.

**Three traps the drive turned up, all of which would have been invisible to a source scan:**

1. **`?ff=` buys less sim time than it says in a transient.** `ff=500` bought **261 s**, because a
   broadcast cycle shrinks once the plant is moving. The first drive concluded "the dialog does
   not open" when the plant had simply not reached the halt yet. The figure in the gate is
   empirical, not arithmetic.
2. **The check must NOT dismiss the mission window first.** Once the dialog is up at z-index 214
   it covers `#missionClose` and that click times out — *which is the feature working.* The gate
   waits for the dialog on its own terms.
3. **A static server whose ROOT has forward slashes 404s the entire app on Windows**
   (`fp.startsWith(ROOT)` against `path.join`'s backslashes). It looks exactly like a broken page.

### 90.4 The second half — `core_superheat_c` is on the board

Added as a real series (`core_sh`, Core damage group) **plus a physics row bound to it by `ser:`**.
Both are required: `run_inspect` counts a true-state-only series as reachable only if a physics row
names it, and `buildPhysIndex` feeds that row's own formatter to the Indications true column. A row
whose `ser` matches no series is read by nothing — which is precisely what #517 shipped.

It sits beside `Core uncovered` because that field **saturates**: once the core is fully
steam-filled, void clips at 1 and uncovery pins at 100 %, and superheat is the only reading that
still moves. On the original engine it reads a dash — that model cannot express superheat at all.

### 90.5 Gates

New `testHeldPlantDialog` in `verify_e2e_ui` — healthy plant (dialog hidden, clock unmarked) →
real halt (open, explains, names the cause, clock marked, **rect inside the viewport and at least
120 px tall**, the #454 lesson that counting elements missed a window drawn off-screen) → Reset
(closed, HELD cleared). **Proved by injection**: with `checkPlantHeld` neutered it reds with *"the
plant HELD and the dialog stayed hidden — the player is back to a frozen board with no
indication."*

No baseline moved. The +1 series does not shift any counted assertion — `verify_e2e_ui`'s channel
check is the relation `picks === rows * 2`, not a number, and the new series is deliberately not in
`defaultSeries` (`testMonitorList` requires its channel to be outside it). **Aggregate 93 runners
at baseline.**

**Still open from #518, unchanged here:** the held snapshot is the *blown-up* step, not the last
good one — so the frozen board behind this dialog can show nonsense (14.5 psia, void 0 %). The
dialog now says the readings are the last valid ones, which is honest about the fact but does not
fix which step got committed.

## 91. #518 CLOSE-OUT — THE HELD PLANT IS THE LAST GOOD STEP, NOT THE REJECTED ONE — 2026-08-26

*(OWNER, 2026-08-26: "Work 518.")* — the second half of #518, recorded as open at §89 and left
until #520 made it visible.

### 91.1 The asymmetry

Three guards in `pwr2_core.step` decide a plant has left the range Layer 0 can compute. The
root-jump guard had it right from the day it was written — *"hold THIS step (nothing adopted),
latch beyond_model"* — and returns before touching the state. **The two blowdown latches did not:
they fired at the END of the step, after `sys.nodes[i].h`, `sys.P` and `sys.M_total` had all been
written.** So the state frozen for the player was the very step the guard had just rejected as
uncomputable.

**Measured** (large break + station blackout, through the shell):

| | pressure | Tavg |
|---|---|---|
| last good step | 17.6 psia | 393 °F |
| **held, shown for ever** | **14.5 psia — the property floor, i.e. the rejected value** | 221 °F |

§90 had just put a dialog in front of that board telling the player *"everything you can see is
the last valid reading."* It was not.

### 91.2 The fix

The new enthalpies are **staged** into `h_next[]` rather than written, both latch conditions are
evaluated, and only then are they adopted. On a latch the step returns the root-jump guard's own
shape — `held: true, dP: 0`, nothing committed — while still REPORTING `enthalpyClamped` and
`enthalpyDiscarded_kJ`, because what was rejected is the diagnostic.

After: the held state is byte-identical to the step entry (17.6 psia, and the leg enthalpies
unchanged).

### 91.3 ⚠ The 172 °F "corruption" that turned out to be correct

The held Tavg still read **221 °F against the previous step's 393**, and the obvious reading —
another corrupted field — is wrong. At 17.59 psia both legs sit above `h_f`, so the plant is
two-phase and `T_sat` **is** 221 °F. The 393 was the stale one: it was computed at `pwr2_engine`'s
own `primaryTavg` call *before* that step's pressure collapse (229 → 17.6 psia in one 0.02 s step,
inside `P_JUMP_MAX` and legitimately adopted).

**So the held state is now self-consistent, and the number that looked broken was the number that
was right.** Worth the paragraph because the instinct on seeing a 172 °F step change is to keep
fixing, and here that would have meant "correcting" a saturation temperature to match a
mid-step artefact.

### 91.4 Two gate defects the change exposed, both mine

1. **Two mutation anchors were the two latch lines**, now merged into one pre-commit condition —
   ANCHOR NOT FOUND, blind, gate exits 1. Re-cut so each half is still mutated on its own.
2. **The pre-commit guard SHADOWED the standing hold branch**, and the mutation that deletes that
   branch went blind. On a frozen state the raw latch conditions still hold, so the new guard
   re-fires each step and holds it anyway — correctly, but by a different route, at the cost of a
   solve a frozen plant does not need. The check now pins the standing hold's own signature,
   `transfers === 0 && iterations === 0`, which only the early branch produces.

And the new mutation — *stage the enthalpies but write them anyway* — was **blind to every
existing check**, because nothing asserted the held state equals the state the step started from.
That is the entire claim of this fix, and it now has its own byte-identical assertion.

### 91.5 Gates

`run_pwr2_core` 46 → **47**, mutations 22 → **23**. Everything else at baseline; **aggregate 93
runners at baseline**. No trajectory moved: the latch times on every fixture are unchanged, because
the conditions are evaluated on exactly the same quantities — only the order of adopting and
checking changed.

**#518 is now closed in full.** The transport instability (§89) and the held snapshot (this
section) were the two halves recorded on it.

## 92. #519 / #521 — TWO CONTENTION FLAKES, AND THE OBVIOUS HYPOTHESIS WAS WRONG — 2026-08-26

*(OWNER, 2026-08-26: "Work next.")* Both gates could return either verdict on the same commit,
which makes a red unchaseable — the failure mode `gates.yml` once sustained for **32 consecutive
runs** across three days, including a release to `main`.

### 92.1 #519 — the ratio did not survive load, and the header said it did

`run_pwr2_perf` asserts PWR2 ≤ 8× PWR1 per step, and justified the ratio like this:

> *"Both engines slow down together, so PWR2-step / PWR1-step survives load."*

**True only if they are measured through the same weather, and they were not.** The shipped shape
timed all seven PWR2 reps, then all seven PWR1 reps. On a 3-way-parallel CI runner a heavy
neighbour can start and finish inside one of those two windows.

**⛔ AND THE OBVIOUS HYPOTHESIS IS WRONG, WHICH IS THE PART WORTH KEEPING.** "CI is busy" is the
first explanation anyone reaches for, it is safe, and a fix aimed at it would have changed
nothing. Measured, 12 spinners on 12 CPUs across **both** blocks:

| | ratio | pwr2 / pwr1 |
|---|---|---|
| idle | 4.00× | 80.7 / 20.2 |
| sustained load, both blocks | **2.90×** | 160.6 / 55.5 |

**Sustained load drives the ratio DOWN** — both engines slow together, exactly as the header
claimed, and it can never redden this gate. Only load *aligned with one block* inflates it. Raised
for the PWR2 block only and dropped before the PWR1 block:

| | ratio | pwr2 / pwr1 | |
|---|---|---|---|
| sequential, median | **8.80×** | 183.2 / 20.8 | the shipped shape — CI read **8.3× (178.7 / 20.5)** |
| sequential, minimum | 7.56× | 150.8 / 20.0 | |
| interleaved, median | 3.44× | 183.6 / 53.3 | verdict recovered, absolutes still inflated |
| **interleaved, minimum** | **3.71×** | 75.2 / 20.3 | **adopted** — idle truth is 3.74–3.91× |

**Interleaving is what fixes the verdict; the minimum is what fixes the reported numbers** (this
file prints them, and contention or garbage collection can only ever make a sample slower, so the
fastest rep is the least-corrupted estimate). Note the median was *already* there — the fix people
reach for first was in place and had not helped.

**Gated, and deterministically.** A real load generator inside a gate that runs 3-way parallel
would be the disease. The new check reproduces the *geometry* instead: a burst that expires after
a fixed number of CALLS, shared by whichever function is running, over two synthetic equal-cost
twins whose true ratio is 1.00 by construction. Sequential sampling lets the first function eat
the whole burst; interleaved shares it. **Measured: interleaved 1.00×, sequential 4.97×.**

### 92.2 #521 — two round trips straddling a redraw

`verify_e2e_ui`'s rewind-picker check failed on CI with *"clicking the checkpoint mark at T+7 s
landed the plant at T+175 s"*, then **passed on a re-run of the same job at the same commit** — on
a commit that touched none of the code it drives.

A 168-second error is not jitter; it is a whole checkpoint. The cause: the marks and the x-axis
span came from one `page.evaluate` and the clock from a **second** round trip. Entering pick mode
WIDENS the plot to show every reachable mark, so the two reads can straddle that redraw — the span
belongs to one frame, the clock to the next, `t0 = tAfterPress - span` mixes them, and if a
checkpoint appeared in between, `marks[1]` is a different checkpoint.

Fixed by waiting for pick mode to settle (predicate, not a sleep) and reading marks, span and
clock in **one** evaluate, so the three cannot disagree.

**Honest limit: one green run does not prove a flake is gone.** What is demonstrable is that a
specific race has been removed; the 6 s band — the part that catches the real inversion defect —
is untouched, and widening it was explicitly rejected because it would have blinded the check.

### 92.3 Gates

`run_pwr2_perf` 4 → **5**. `verify_e2e_ui` unchanged in score. **Aggregate 93 runners at
baseline.** The two fixes are different — interleaved sampling, and an atomic read — because the
shared class ("a verdict that depends on machine load") does not imply a shared mechanism. Saying
so beats inventing one abstraction over two unrelated races.

## 93. #517 ITEM 2 ADJUDICATED — NEITHER THE HOMOGENEOUS CORE NOR THE FUEL NODE — 2026-08-26

*(OWNER, 2026-08-26: "Work next.")* §87 recorded, deliberately unadjudicated: *"after the 200-min
HPI restore, with the RCPs off, zero void and 175–267 °F of subcooling, the clad reads 696–978 °F
(205–250 min) — a covered core on natural circulation at 1.1 % decay heat, #472's territory."*
The item asked which of two things it was, **before touching anything**. It is neither.

### 93.1 The two numbers come from two different nodes

`subcooling_c` is `W.subcooling(tHot, sys.P)` — the **HOT LEG** (`pwr2_true_state.js:222`).
`clad_temp_c` rides `coolTemp_c`, which is `pwr2_reactor.coreTemp` — the **CORE** node. Pairing
them in one sentence is what makes the observation look impossible; individually each is correct.

### 93.2 A covered core cannot read that hot, and this model does not put it there

| ride | result |
|---|---|
| loss of flow, covered core, pumps off, no break | natural circulation settles at **85–99 kg/s (5–6 % of rated)**, clad rise **5–7 °F**, core 562–566 °F |
| what 852 °F would require on a covered core | **flowFrac ~1e-4 (0.2 kg/s)** — 500× below what natural circulation delivers |
| covered AND stagnant (void < 0.5, flow < 1e-3) | **0 of 17,036 / 18,860 / 90,001 steps** across the 20 cm² damage ride, an 8 cm² + injection ride with the pumps off, and the severity-1 ride |

So natural circulation is healthy, the fuel node is behaving, and the regime that would produce a
hot clad on a covered core is one this plant never occupies.

**⚠ MY OWN FIRST ANSWER WAS WRONG, AND IN THE INSTRUCTIVE WAY.** §88.7 concluded "the fuel node
cannot produce that clad temperature — at most ~46 °F of rise" from a table measured down to
3 kg/s. True, and irrelevant: the number needed lives at 0.2 kg/s, 15× further down, where the
same model gives 852 °F. **A bound measured over the wrong range is not a bound** — the §88.4
lesson, arriving again in the same week from the other direction.

### 93.3 What it actually is

The signature — substantial reported subcooling **and** a hot clad — was reproduced: 5 cm² break
with the pumps off, t = 595 s, hot leg **32 °F**, core 429 °F, void 100 %, reported subcooling
361 °F, clad 848 °F. **32 °F is Layer 0's liquid floor**, i.e. the hot-leg node pinned on the
enthalpy wall. That step *is* the beyond-model latch.

Swept properly — the worst case that survives 30 further seconds of clean running:

| ride | signature ≥ 30 s before any latch |
|---|---|
| 5 cm² + pumps off | **NEVER** |
| 8 cm² + pumps off | **NEVER** |
| 20 cm² unmitigated | **NEVER** |

**It is an end-of-blowdown reporting artefact, confined to the last seconds before the guard
fires** — not #472's homogeneous core, and not the fuel node.

And §87's ride predates **#518**: that end-of-blowdown region was precisely where the donor-cell
transport instability lived, driving nodes onto both envelope walls. The strongly-indicated
reading is that the observation was a **symptom of #518, now fixed**. Stated as indicated rather
than shown, because the TMI timeline's harness lives in `inbox/` and is not in the repo, so the
original ride cannot be re-run here — that is what would close it beyond doubt.

### 93.4 One latent finding, filed not fixed

`h_stagnant = 10 W/m²K` is **UNSOURCED** and its own comment declares it *"natural convection from
a rod to a **gas**"* — yet it floors the film coefficient whatever the core is full of. A rod in
stagnant **water** is one to two orders higher. `find_source.js` on free/natural convection: **0
hits across 39 documents in 3 lanes.**

**It binds 0 % of the time on every ride measured**, and on the damage rides the core is 36–86 %
voided where a gas floor is the right one — so this is latent, not active, and no number was
moved. Changing it would touch core-damage timing, which is the §88.4 trap: a term adjusted
outside the regime that motivated it.

### 93.5 No change made

The fields are individually correct, the mechanism is a pairing, and the regime is one the plant
does not occupy away from a guard that now holds the last good step (§91). **The honest answer to
"is this a defect" is no** — and the reading that matters on a stagnant loop already exists and is
sourced: `t_core_exit_c`, the post-TMI inadequate-core-cooling channel (NUREG-0737 II.F.2), which
is the core's own temperature rather than a leg's.

## 94. #523 — PWR2 IS THE PLANT THE SITE RUNS, AND THE RETIRED ENGINE LEAVES EVERY PUBLISHED BUILD — 2026-08-26

The cutover. Four rulings, all given in planning on 2026-08-26 and all quoted in the issue:
**"Flip now, track the gaps"** · **"Strip it at build time"** · **"Keep freePlayOnly, file the
compat pass"** · **"Reword to Hot Shutdown (Mode 4)"**. This closes the third of the three items
`CLAUDE.md` listed as remaining before replacement — the owner's replacement ruling. The other
two are now #531 (R8's ambient source check) and #525 (mission compatibility).

### What the removal actually is
Not a deletion. `ui/shell.html` wraps six files — `pwr_thermal`, `pwr_pressurizer`,
`pwr_pressurizer2`, `pwr_primary`, `pwr_steam_generator`, `pwr_engine` — in a DEV-ONLY marker
pair, the same convention the site pages already used, and two consumers act on it:

| consumer | when | what it does |
|---|---|---|
| `site/build_site.js` | channel `public` **only** | deletes the tags (1,150 bytes) **and prunes the six files** (544,663 bytes) |
| `tools/make_portable.js` | always | deletes the tags before the inliner counts anything |

**The channel gate is the design, not caution.** The preview site is where the campaign, the
scenarios and the walkthroughs are vetted, and every one of them is authored against the retired
engine — which is exactly why `ENGINES.pwr2` still carries `freePlayOnly: true`. A feature flag
can be overridden by hand on a live site; a deleted `<script>` tag cannot, so an unconditional
strip would have taken the preview site's guided content with it and left nowhere to vet it.
Making it unconditional later is deleting one branch.

The portable build is unconditional for the opposite reason: it is a **distribution artifact**,
the one thing a stranger is handed, and it should be the plant the site runs and nothing else.

### The two files that STAY, and the one that turned out not to be needed
`pwr2_shell.js:622` throws without `RD.PWR_CONFIG` and `RD.PWRInstruments`: PWR2 reuses the
published instrument layer (D4) and builds its protection config from `RD.PWR_CONFIG.protection`,
which `pwr_control.js:1781` writes. So `engines/pwr/pwr_config.js` and
`engines/pwr/pwr_instruments.js` are on every build, and the gate asserts their presence as a
**precondition** — pruning them would produce a site with no plant at all while every other
check still passed.

`pwr_pressurizer.js` looked like a third, because `pwr_instruments.js:247` reads
`RD.pwrPressurizer.levelProgram`. It is not: `pwr2_shell.js:686` passes `level_program_fn` and
`_levelDev` prefers it (`pwr_instruments.js:246-250`). Verified rather than reasoned — a grep of
`ui/`, `layers/`, `scenarios/` and `engines/pwr2/` for `pwrPressurizer|pwrThermal|pwrPrimary|
pwrSteamGenerator` returns nothing outside `engines/pwr/` and `test/`. `pwr_instruments.js` also
moved **up** the load list, above the marked block, so the strippable set is contiguous; it has
no load-time dependency on anything (its `T_sat` is duplicated locally for that reason).

### Two defects, and the reason neither could have been found earlier
Both were latent for as long as PWR2 was a second card, and both fired on the first run after it
became the default.

**The operator's manual rendered EMPTY on PWR2.** `mdManual()` read
`RD.MANUAL_MD[ui.engineKey]`; the packed set is keyed `pwr`. Fifty lines away, `manualDoc()`
read `[ui.engineKey] || [ui.plant]`. The two call sites had disagreed since the pwr2 card
landed and the one with the fallback was right. This is not an internal-tooling miss: the manual
is **one of only two areas `site/flags.js` stages as `public`**, so it is half of what a visitor
is offered. Found by `verify_e2e_ui` the first time it clicked `#manualBtn` on `?engine=pwr2`.

**A PWR2 save installed the retired engine's key.** `afterPlantChange()` derived
`ui.engineKey` from `ui.plant`, and `uiPlantOf()` folds `'pwr2'` onto the `'pwr'` **board** by
design. On a published build that engine is not in the page, so the next Reset would ask
`engineCtor()` for a constructor that does not exist. Now derived from the raw `plant_id`. The
inverse seam `uiPlantOf` exists to manage is exactly where it went wrong.

### The card list MEASURES, it does not declare
`ctorPresent(key)` moved out of `init()` to module scope and now gates three things: the
`?engine=` override, the boot fallback (`'pwr'` → `'pwr2'`) and the Plant & Mission plant column.
A published build cannot hold a static list of what is available, because the answer differs per
build — so the menu looks. RBMK/BWR keep their greyed `soon` cards deliberately (#514): a plant
on hold is a roadmap statement, not a missing file.

### One gate assertion re-derived, with the measurement that justified it
`testSteamFeedPair` asserted `dump > 1` at t+600 s after a turbine trip from hot full power.
Measured on both engines, through the gate's own harness:

| | governor | condenser dump | ADV | STEAM FLOW | SG FEED |
|---|---|---|---|---|---|
| retired engine | 0 % | 2 % | 0 % | 22 gpm | 22 gpm |
| **PWR2** | 0 % | **0 %** | **61 %** | 31 gpm | 33 gpm |

PWR2's dump reading 0 is the plant being **right**: C-7 holds the condenser dumps shut on a
dispatch trip (§47, sourced), so the atmospheric dump carries the decay heat — the reason the ADV
rung was built (#371). Pinning the condenser path would have made the gate demand a sourced
interlock be defeated. The assertion is now `dump > 1 || adv > 1`; the claim (#206 — STEAM FLOW
must not be the governor-only channel) and the discriminant are untouched, and it still passes on
the retired engine, which is what makes it a better check rather than a refit (HR10).

### Gates
- `run_site_build` **31 → 41**. The new `RETIRED` rule builds **twice**, through a new
  `RD_SITE_CHANNEL` hook — `site/channel.js` is tracked, so a gate must not rewrite the tree it
  measures. It asserts both directions and derives its file list from the **rule** ("everything in
  `engines/pwr/` except the two PWR2 reuses") rather than re-parsing the producer's array, which
  would make the two agree by construction and would miss a seventh file appearing there.
  Injection-verified: strip unconditionally → 41/2 naming the preview rows; disable the strip →
  41/2 naming the public rows.
- `run_portable` **147 → 145**. Its shell scan now strips the DEV-ONLY block from the bundler's
  own regex — scanning the raw shell would have broken both halves in opposite directions (the
  tally reporting 100 of 108 on a correct bundle; the LOADS sweep certifying six files the bundle
  does not ship). Engine sentinel `RD.PWREngine` → `RD.pwr2.shell`, plus a **negative** sentinel:
  `/RD\.PWREngine\s*=/` must not appear. That is the only check here that can rot, because a
  returning engine makes the file bigger and everything else still passes. Proved non-vacuous —
  the pattern matches the retired engine's own source and not the bundle.
- `verify_e2e_ui` sweeps `pwr2`: four screenshots, the 23-label board reachability list, chart
  settings, monitor list, mission close, run-start mark, rewind picker, diag bundle.
  `testEsfArmButtons` still drives **both** (pwr 0 disabled, pwr2 3 — that is the comparison).
- `verify_flags_ui` **27/42 → 42/42** once pointed at `?engine=pwr`. All fifteen failures were
  the same substitution — including three *"public: says COMING SOON"* rows, which is the shape a
  flag gate must never pass by accident. Every flag in that registry gates CONTENT, and the
  content lives on the retired engine; the file now says so where it builds its URL.
- `run_all`: 93 runners, everything else at baseline.

### What is open, and where
#524 Mode 5 · #525 the compatibility pass · #526 the procedure pool · #527 the instructor's
parameter map · #528 rod AUTO · #529 turbine FOLLOW · #530 steam-line break / stuck rod / vacuum
decay · #531 R8 · #532 the manuals · #533 the board harness.

---

## 95. #534 CLUSTER — THE RESTORE IS NOW ALL-OR-NOTHING, AND THE SAVE CARRIES WHAT IT NEEDS — 2026-08-27

**What was declared and was false.** §2993 asserts the pwr2-1.0 save carries the instrument
readings, and the shell header calls the round trip's bar bit-exactness. Both were true only for
the ONE case the gate ran — Hot Full Power, reloaded into the SAME instance, from a settled
fixture. `SimulationService._restore` does none of those three, and five #534 findings lived in
that gap: **#553, #554, #555, #548 and #563 item 3.** This section replaces the "no save/restore
gap" reading of §2993.

**What changed (no plant number moves).**

1. **`_restore` is transactional (#554).** The engine and control layer are constructed into
   locals and installed only after `loadState` has returned on both; the Instructor, which is
   persistent rather than rebuilt, is rolled back from its own snapshot if its load throws.
   Before: a file the UI reported as REJECTED had already installed a fresh plant — measured, a
   scrammed 0.2 %-power plant at 1130 psia (7.79 MPa) with `porv_stuck` became a clean
   100 %-power plant at 2234 psia (15.40 MPa) with no failures, `simTime` frozen, the service
   still ticking.
2. **The save records its own initial condition (#563 item 3),** and `pwr2-1.0` carries
   `rated_steam` and `M_nominal` — the two initial-condition-derived constants that are every
   normalization's and core inventory's denominators. Before: `_restore` hard-coded
   `initial_state:'hot_full_power'`, so three of the four shipped presets came back wearing Hot
   Full Power's constants over their own saved mass. Mode 4, Hot Shutdown measured: `M_nominal`
   23,234 → 18,876 kg (51,222 → 41,613 lb) and CORE INVENTORY **100.0 → 123.1 %** across a rewind
   that moved true primary mass −0.7 kg (−1.5 lb).
3. **A non-finite reading survives the save as non-finite (#555).** The save NAMES its non-finite
   ids (`ins.nonFinite`) and the load re-installs `NaN`. Before, `JSON.parse(JSON.stringify(...))`
   wrote them out as `null` — and **`isFinite(null)` is `true`**, so the restored channel read as
   a hard zero that every guard in the tree accepted. On Mode 4 that became a standing
   steam-minus-feed error driving the main feedwater regulating valve 29.73 % → **0.00 %**.
4. **The board layer's shrink-and-swell driver rides the save (#548).** Two smoothers share the
   name `_pwrRate`; only the inner engine's was saved. After a restore taken inside a fast power
   change the board's SG narrow-range level read up to **7.4771 points HIGH** — optimistic —
   decaying below 1 point at t+9 to t+11 s. Now **0.000000** over the same 400 steps.
5. **The UI honours a refusal (#553).** `loadState` refuses by RETURNING `{type:'error'}`, and
   `ui/app.js` discarded that return: 4 of 5 reject classes measured on a public build toasted
   *"State loaded"* for a save that loaded nothing.

**Migration.** Every added field is absent-tolerant and falls back to exactly the pre-fix
behaviour, so a save taken before this change still loads — pinned by a `run_m5` check that
deletes `metadata.initial_state` and loads.

**Gates.** `run_pwr2_shell` 77 → 82 checks / 29 → 32 mutations / 0 blind; `run_m5` 23/23 104 →
26/26 120; `run_pwr2_instruments` 20 → 21 / 11 → 12 mutations; `verify_e2e_ui` gains
`testSaveLoadRefusal` — the only layer that can see #553 — with a
positive control that drives the app's own Save button and feeds the file back in. Each new check
was verified by injection, and the `ui/app.js` revert reproduces the issue's exact reported string.

**CLOSED by §96 the same day** — it was deferred out of the save cluster *(OWNER RULING,
2026-08-27: selected "Leave it out" from options I wrote — a selection, not verbatim words)* and
then taken as its own change. **#539** — Mode 4, Hot Shutdown boots with `rated_steam = 0`
because `pwr2_engine.js:331` recomputes it from a turbine object line 326 has already zeroed
(against the intent stated on line 325). That is WHY the NaN exists. It is a plant-behaviour change
owing a Hard Rule 12 measurement pass, and it is now safe to take: with item 3 above landed, fixing
it cannot turn the null permanent.

---

## 96. #539 — THE RATED SCALE IS FROZEN, AND MODE 4's SECONDARY IS REAL — 2026-08-27

**What §3808 declared and the code did not do.** *"feed and turbine at the IC's own dispatch
with `rated_steam` still frozen at the RATED scale (every normalization's denominator)."*
`steamDemand` has exactly two inputs — the dispatch and the steam pressure — and the scale was
frozen on **neither**:

| preset | before | after |
|---|---|---|
| `hot_full_power` | 164.2471 kg/s (2,609 gpm) | 164.2471 |
| `50_percent` | 165.1924 (+0.57 %) | 164.2471 |
| `hot_zero_power` | 165.6972 (+0.88 %) | 164.2471 |
| `hot_shutdown` | **0.0000** | 164.2471 |

The literal read each preset's own `sg.P`; a second recompute in the cold branch read `tb`
after `eng.tb.load_target_mwe = ic.load_mwe` had zeroed it — and `eng.tb` **is** `tb`. The
recompute is **deleted**, not reordered, so the aliasing cannot be re-armed. The design
pressure is load-bearing: at Mode 4's own 0.2059 MPa the surviving line alone returns
**171.9449 kg/s**.

**Measured after (Mode 4, the preset the shipped card offers as the plant's floor).**

- **Main feed delivers**: +3,934 kg (+8,672 lbm) into the steam generator over 120 s on a 50 %
  manual demand. Before: **0.0000 kg/s at every demand**, behind a feed gauge reading back
  exactly what was dialled.
- **Code safeties pass steam**: 0.0000 → **137.9676 kg/s = 0.84 × rated**, bit-identical to the
  `hot_zero_power` control arm. Before, the annunciator lit `SG SAFETY OPEN` and nothing left —
  the secondary had no overpressure relief.
- **The feed controller has feedback**: untouched 90 min, the valve settles at 0 rather than
  railing at the 1.2000 two-pump ceiling against a vessel whose mass never moved; primary drift
  −1.6 °F → −0.4 °F. `run_pwr2_endurance` **20/20, unchanged, no re-banding**.
- Boot unchanged on its point: mode 4, 121.10 °C, 364.0 psia, level 25.00 %, no scram, no SI.
- `ins.reading.steam_flow` stops being permanently NaN — a zero denominator made
  `pwr2_true_state:283`'s truthiness guard skip the driver entirely. **That NaN was the root of
  #555**, so the §95 entry's "still open" line is now closed.

**`pwr2_relief`'s guard, tightened.** It was `=== undefined`: it refused to invent a *missing*
plant and silently accepted one of size *nought* — the same fabrication, differently spelled,
and the only hard refusal in the whole chain. It did not fire on the case that shipped. Now
`> 0`, against §1021's own house rule (*"Every PWR2 layer so far throws rather than fabricate a
missing driver … `rated_steam_kgs`"*).

**Why 93 green runners missed it.** Every existing check measured a **consequence** at **one**
preset. A denominator that is wrong at every preset *in a different way* is invisible to that.
The new gate asserts the **invariant**: all four presets, one number, re-derived from the rated
dispatch and the design pressure rather than read back off the engine.

**Gates.** `run_pwr2_engine` 94 → 97 checks / 55 → 57 mutations / 0 blind (one revert per axis);
`run_pwr2_relief` 42 → 43 / 24 → 25. Two `d239e76` checks were **re-pointed, not regressions** —
both leaned on Mode 4 being broken: one used "Mode 4's scale differs from Hot Full Power's" as a
proxy (they are now equal by design; it discriminates on `M_nominal` instead), and one borrowed
Mode 4's permanently-NaN channel as its fixture (it now **injects** its own NaN).

**Still open:** **#542** — the code-safety bank parks cracked open 21.5 psi below its own pop
setpoint and never reseats. Same valves; this restored their **capacity**, not their **ramp**.

---

## 97. #542 — THE SAFETY BANK IS THE STAGGERED ONE THE SOURCE DESCRIBES — 2026-08-27

§96 closed with *"this restored their capacity, not their ramp."* This is the ramp.

**The defect.** `pwr2_relief.js` computed lift as `(P - reseat) / safety_full_lift_mpa`, so the
ramp began at the **reseat** pressure, 36.3 psi below the pop. Two consequences, and the second
is the one the player sees:

- **71.5 % of the ramp lay below the setpoint**, so the bank went from shut to **98.63 kg/s =
  60.05 % of rated in ONE 0.02 s step** at first lift — precisely the step the file's own
  declaration said the ramp existed to prevent.
- **The whole blowdown band was a continuum of stable partial-lift equilibria**, so the bank
  could settle anywhere inside it and stay there.

The declared band was also wrong 3.5x: `safety_full_lift_mpa` was declared "first lift to FULL
lift" = 0.35 MPa (50.8 psi); measured from the pop it was **0.0998 MPa (14.5 psi)**.

**Measured before** (hot full power stepped to 12.8 MWe, condenser available, no scram):

| t | safety flow | % of rated | SG pressure |
|---|---|---|---|
| 300 s | 41.60 kg/s | 25.33 % | 1064.0 psig |
| 900 s | 41.34 | 25.17 | 1063.9 |
| 1800 s | 39.73 | 24.19 | 1063.3 |
| 3600 s | 39.68 | 24.16 | 1063.3 |

**21 psi BELOW its own 1085 psig setpoint**, where no valve in a real staggered bank has one.
**0 reseats in the hour, 750,078 lbm (340,230 kg) vented**, plant otherwise stable. Meanwhile
`sg_safety_open` lit "SG Safeties Lifting" on a board whose help text tells the player these
valves *"lift on steam pressure alone and reseat when it falls back."*

### The evidence pass found the whole bank in this plant's own anchor

The lump was standing in for something the corpus already had. **Ginna UFSAR ch10 §10.3.2.4
(ML20339A040)**, verbatim: *"There are four main steam safety valves (MSSV) for each steam line.
**The first valve lifts at 1085 psig and the remaining three valves are set to lift at 1140
psig.** The minimum total relieving capacity is 6.58 x 10^6 lbm/hr"* — and the same chapter's
equipment table gives the capacities and the accumulation: *"797,689: two valves at 1085 psig
+3% accumulation / 837,600: six valves at 1140 psig +3% accumulation"* (eight valves = four per
line; this single-loop plant carries one line's worth). **Ginna TS Bases B 3.7.1 (ML20339A221)**
says why: *"The MSSV design includes staggered setpoints so that only the needed valves will
actuate. Staggered setpoints reduce the potential for valve chattering that is due to steam
pressure insufficient to fully open all valves following a turbine/reactor trip."*

The same Bases also make the old behaviour a **named abnormality**: OPERABILITY is *"the ability
to open within the setpoint tolerances, relieve SG overpressure, and reseat when pressure has
been reduced"*, and *"failure to reclose once opened"* is listed as an **active failure mode**.
The model shipped that failure mode as normal operation.

So the `[derived]` 0.35 MPa is **retired** and every constant in the bank is sourced:

| stage | setpoint | full lift (+3 %) | reseat (3.3 % blowdown) | share of capacity |
|---|---|---|---|---|
| 1 valve | 1085 psig | 1117.6 psig | 1048.7 psig | 797,689 / 3,310,489 = **0.24096** |
| 3 valves | 1140 psig | 1174.2 psig | 1101.9 psig | **0.75904** |

**Both of the source's own cross-checks land.** 2 lines x (797,689 + 3 x 837,600) =
**6,620,978 lb/hr** against §10.3.2.4's stated 6.58 x 10^6 — 0.6 % apart. And full bank lift at
1174.2 psig is **98.4 % of 110 % of the 1085 psig first lift**, satisfying B 3.7.1's *"limit the
secondary system to <= 110% of design pressure when passing 100% of design flow."*

### The ratchet, not the re-anchor, is what fixes it

Re-anchoring the ramp at the setpoint only **moves** the park — a continuous ramp still admits a
stable partial lift wherever relief meets production. What abolishes it is that a **pop-type
safety valve does not modulate back down**: it snaps open and holds until blowdown. Each stage
therefore ratchets its lift while latched, which makes its flow **independent of pressure below
its setpoint**, and a constant cannot be an equilibrium. One line:

```
if (lift > st.lift) st.lift = lift;          /* THE RATCHET */
```

**Measured after**, same ride:

| t | safety flow | % of rated | SG pressure |
|---|---|---|---|
| first lift | **0.113 kg/s** | **0.07 %** (was 60.2 %) | 1085.4 psig |
| 300 s | 33.24 kg/s | 20.24 % | 1113.8 psig |
| 900 s | 33.24 | 20.24 | 1111.8 |
| 1800 s | 33.24 | 20.24 | 1100.6 |
| 3600 s | 33.24 | 20.24 | **1094.6 psig** |

The bank now parks **above** its setpoint with stage 1 alone at full lift — a real physical
state, not a spurious equilibrium — and 20.24 % of rated is exactly `0.24096 x 0.84`. It still
does not reseat on that ride, and **that is correct**: the plant genuinely makes more steam than
its sinks take, and the indication now means what the board says it means.

**The board-reachable path reseats.** Main steam isolation valve closed at power: first lift
0.004 kg/s (0.00 % of rated) at 1085.1 psig, **RESEAT at t = 109.0 s at 1048.7 psig** — the
blowdown point exactly — and seated for the remaining 791 s. Before: first lift 60.1 % of rated
in one step, then cracked past 600 s at ~1049.5 psig.

**Unchanged, checked:** turbine trip + scram never lifts the bank at all (secondary settles at
1050.2 psig on the ADV band), and `safety_pop_psig`, `safety_flow_frac`, `safety_blowdown`, the
ADV, the steam dump and the main steam isolation valve are untouched. `sg_safety_open` keeps its
name and meaning, so the `true_state` contract does not move.

**Save migration** (the `msiv` pattern): the shell saves and restores `rl` wholesale, so a
pre-stagger save carries `safety_open` and no `stages`. A **lifted** legacy flag seeds stage 1
open at full lift — the old model passed flow whenever that flag was set, and landing on a shut
bank would silently drop a relief path mid-transient. A **shut** flag lands on a shut bank, which
is the pre-#542 plant exactly. Construction and restore travel the same `seedStages` path.

### Two traps, both found by the injection self-test rather than by reading

**1. The check forbidding the step could never see it (HR10).** `run_pwr2_relief`'s *"flow RAMPS
between first lift and full lift, it does not step"* sampled at reseat+0.05 MPa (1056.0 psig) and
reseat+0.20 MPa (1078.0 psig) — **both below the 1085 psig pop**. It was walking the part of the
ramp that lay under the setpoint, i.e. the defect, and reported green for as long as the defect
existed. Every new check is anchored on the pop or on a stage setpoint, never on the reseat, and
each was confirmed RED against the pre-fix source before being trusted.

**2. A "blind spot" that was really a mutation that was not one.** Flipping the bank flag from
`anyOpen` to `rl.stages[0].open` reddened nothing — correctly: stage 1's setpoint **and** its
reseat both sit below stage 2's, so on any continuous pressure path stage 2 can never be open
while stage 1 is shut, and the two expressions are identical. The blind-spot report was the gate
telling the truth about an equivalent mutant. Re-pointed at `rl.stages[1].open`, which is the
half that can genuinely go missing, and caught.

**Gates.** `run_pwr2_relief` 43 -> **56 checks**, mutations 25 -> **33**, 0 blind spots.
`run_pwr2_engine` 97/97 unchanged — its `safetyPeak` fixture forced `sg.P = 8.2` MPa (1174.6
psig), which clears the new 1174.2 psig full-lift point by **0.4 psi**; measured green there, but
raised to **8.3 MPa** because a fixture standing 0.4 psi from the thing it asserts is one
rounding change from red. It reads 0.84 x rated on **both** the old lumped ramp and the staggered
bank, so it is a better fixture rather than one refitted to the change (HR10).
`run_pwr2_loadfollow` 36/36, `run_pwr2_shell` 82/82, `run_pwr2_board` 36/36, all unchanged — the
A5 acceptance (`sgP < 8.0` with the turbine removed) lands at 7.846 MPa (1123.3 psig), 22 psi of
margin.

**Still open, and NOT this issue:** the ride above runs an hour at 64 % power with the turbine at
12.8 MWe and **no scram** (`rps_scrammed` never sets). A real Ginna trips here. That is a
protection question, not a relief one. **#478** files the analogous reseat-anchored ramp against
the RETIRED engine (`pwr_steam_generator.js:299-303`, denominator `(pop - reseat)`) — same class,
untouched, that engine is not being fixed.
