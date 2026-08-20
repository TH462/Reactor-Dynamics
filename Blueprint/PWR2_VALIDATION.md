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
