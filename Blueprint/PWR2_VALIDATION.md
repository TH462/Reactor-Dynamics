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
