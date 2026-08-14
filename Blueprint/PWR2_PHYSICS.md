# PWR2 — Physics Core (D2)

**Status:** DESIGN, for review. Nothing built. #479. Spine: `PWR2_DESIGN.md`.

The generic model — primitives, equations, integration — independent of this plant.
The SLS-100 wiring is D3 (`PWR2_PLANT.md`).

> # ▶ READING ORDER — READ THIS FIRST
>
> **This document accumulated three successive solver designs in one day. Only one is live.**
>
> | Read | Why |
> |---|---|
> | **§23 — THE RULED DESIGN** | **The design as it stands. Start and finish here.** |
> | §0 | The over-determination resolution (conclusion stands; its *justification* is corrected in §18.4) |
> | §§19–22 | The industry research and the second wave of rulings that settled everything |
> | **Everything else** | **HISTORY.** §§1–18 record how the design got here, including three wrong turns kept legible on purpose. **Do not build from them.** |
>
> **The wrong turns, named so nobody reconstructs them:** §11.1's affine march (deleted by ruling —
> measured 7,000 kg error and a stall on blowdown), §12.2's three-march "fix" (measured *worse*
> than no fix), and §11.2's C1-continuity gate (unsatisfiable by its own formula, and asking for
> the wrong property besides).

> ## ⛔ REVIEW FINDINGS, 2026-08-13 — §§3, 4, 7 ARE WRONG AS WRITTEN
>
> Independent adversarial review. **The affected sections are left in place below so the errors are
> legible, but their conclusions do not stand.** In severity order:
>
> **A. THE STATE IS OVER-DETERMINED AND NOTHING RECONCILES IT.** *(the deepest finding — it is
> architectural, not a numerical error)* Each node carries integrated `m` and `h`, a **fixed**
> geometric `V`, and derives `ρ = ρ(h, P)` from L0. There is one global `P_rcs` plus a quasi-static
> ΔP field. **Nothing enforces `m = ρ(h, P_node)·V`.** Consequences, all landing on the same hole:
> - **The momentum equation is either circular or unconstrained.** If `P_node` comes from the
>   quasi-static field, and that field is `ΔP = Kṁ|ṁ|`, then `dṁ/dt = (A/L)(Kṁ|ṁ| − Kṁ|ṁ|) = 0` —
>   **the momentum integration is vacuous.** If `P_node` comes from anywhere else, nothing forces
>   the eight loop junctions to carry consistent flow and node mass drifts with no restoring force.
>   A single-loop RCS has **one** momentum degree of freedom; eight independent `ṁ` states leave
>   seven constraints unenforced.
> - **Every escape route is closed by another ruling.** Node-compressibility pressure → acoustics
>   return, and they *are* stiff: ω ≈ 101 rad/s for the hot-leg/upper-plenum pair, a **62 ms
>   period — 3 steps at dt = 0.02, unstable.** A pressure-Poisson constraint → an implicit solve,
>   which §4 forbids and D1 §6 names as the performance risk. One lumped loop momentum state →
>   loses the flow redistribution §3 gives as the whole reason for choosing momentum.
> - **§5 contradicts itself the moment a node voids.** A two-phase node's pressure *is* its
>   saturation pressure for its enthalpy. §5 asserts both `P_node = P_rcs + ΔP_quasi-static` **and**
>   that a node voids when enthalpy crosses saturation "at its local pressure", with `m` and `V`
>   both fixed. Two different pressures, both claimed. It breaks in exactly the scenarios D3 §6
>   calls the architecture's strongest argument — LOCA, loss of subcooling, TMI. And near
>   saturation `dρ/dP` is enormous, so **P↔void is the stiffest algebraic loop in the plant**;
>   explicit gather-then-integrate on it oscillates — mechanically the same family as **#447's
>   40-second limit cycle**, already in this repo's history.
>
> **B. §3's stiffness table does not compute a time constant.** It divides rated `ṁ` by `dṁ/dt`
> under an arbitrary imposed ΔP — a *forcing* timescale, not the system eigenvalue. The eigenvalue
> is inertia over damping: `τ = (ΣL/A)/(2·ΔP_fric,rated/ṁ_rated)` ≈ **0.23 s, ~11 steps** — not
> 43 s and 2,152 steps. Explicit is still stable, but **the margin is ~190× smaller than claimed**,
> and that table was the sole evidence for "comfortably explicit".
>
> **C. §3's answer to Q1 is wrong for orifice-class junctions.** Breaks, relief and injection have
> collapsed `L/A` and 15.3 MPa driving ΔP: a DE cold-leg guillotine gives **τ ≈ 6.9e-4 s — 0.034
> steps**; a PORV ≈ 0.11 steps. **Explicit momentum there is unstable by ~3 orders of magnitude.**
> These must be **algebraic quasi-steady critical flow**, as every production code does. The
> correct answer is *momentum for the loop, quasi-steady for orifice-class junctions* — which is
> closer to the plan-stage lean §3 believes it reversed.
>
> **D. §3's semi-implicit friction fix is justified at the wrong operating point.** Damping
> vanishing at `ṁ = 0` is the *absence* of stiffness — slow drift, not explicit instability.
> Friction is stiffest at **high** flow, where `∂(Kṁ|ṁ|)/∂ṁ = 2K|ṁ|` is largest. Worse, linearising
> about the current `ṁ` gives a Jacobian → 0 as `ṁ` → 0, so **the fix degenerates to plain explicit
> exactly at the reversal point it was introduced for**, and can chatter when
> `dt·(A/L)·2K|ṁ| > 2`.
>
> **E. §4's τ table is evaluated only at rated steady state**, in a design that exists for
> transients. A voided node at ρ ≈ 100 kg/m³ passing 5,000 kg/s empties a 1 m³ node in ~0.02 s —
> **Courant ≈ 1**, donor-cell advection marginal, in precisely the scenario the node model was built
> for. And the SG-tube-wall τ = 0.67 s back-solves to h = 5,000 W/m²·K — that is the **overall U**
> used where the **primary-side film** belongs; against the real tube-side film it is **0.13–0.19 s,
> 6–10 steps, not 33.** The table certifying the integration scheme depends on the correlation §8
> admits is unchosen.
>
> **F. §7's "23 → 2" is a category swap.** Both named survivors are **outside** the engine and exist
> identically today — they were never among the ~23 in-engine reads. Honest claim: *"23 → 0 inside,
> plus the same 2 outside that were always there."* Also: **`CONTEXT.md` §11 contains no count of
> 23** (D1 §5 cites it for one). Its one relevant bullet — kinetics using start-of-step reactivity —
> is a coupling §4 explicitly **retains**, so at least one survives by design, uncounted.
> **G. §7's containment example is a redefinition, not an elimination:** reading both endpoints at
> time *n* **is** the one-step-old read. It is a consistency improvement on today's mixed treatment,
> and worth claiming as that — but the loop is still closed explicitly with identical stability.
> **H. §4's kinetics sub-stepping violates the two-phase step** — sub-steps are intermediate writes
> that must read feedback Phase 2 has not written. *"No step ordering to get wrong"* is false for
> the one term §4 concedes is stiff.
>
> **The mitigation that would have caught (A) early — adopt it in D5 as an L2 gate:**
> **volume closure**, `Σ ρ(h_i, P_i)·V_i = Σ m_i` to tolerance. D5's Layer-1 conservation gate is
> **hollow against (A)**: conservation of `Σm` and `Σ(mh)` passes trivially for any
> conservative-form integrator whether or not `m = ρ(h,P)·V` holds.

---

## 0. RESOLUTION of the over-determination — supersedes §§1, 3, 4, 5, 7

**The review was right that nothing enforced `m = ρ(h,P)·V`. The fix is not to add a
constraint — it is to notice that `m` was never a legitimate state.**

**In a rigid node, `V` is fixed and `ρ = ρ(h,P)`. Therefore `m = ρ(h,P)·V` is *determined* by
`(h,P)`. `m` and `h` are not independent, and integrating both is the defect.** Everything the
review found downstream — the vacuous momentum equation, the unconstrained junction flows, the
voiding contradiction — follows from integrating a quantity that has no freedom.

### 0.1 The true degrees of freedom

| DOF | Count | Note |
|---|---|---|
| Node enthalpy `h_i` | **N** | the thermal DOF |
| **Loop mass flow** | **1** | a *series* loop: continuity links every junction. Not J. |
| **System pressure** | **1** | the compressible volume |
| Wall temperature | N × lumps | |
| Kinetics, rods, chemistry | — | unchanged |

**Not `2N + J`.** The superseded design carried N masses + N enthalpies + J junction flows, so it
had **N + J − 1 spurious states** — which is exactly why nothing constrained them.

### 0.2 Flow: one integrated momentum state, everything else algebraic

```
(Σ L/A)·dṁ_loop/dt = ΔP_pump(ṁ) + ΔP_buoyancy(ρ_i, z_i) − ΔP_friction(ṁ)
```
**This is not circular**, because the quasi-static ΔP field is now an *output* computed from the
solved `ṁ`, never an input to the momentum equation. The superseded §3 had ΔP both computed from
`ṁ` and driving `ṁ` — the review's `dṁ/dt = (A/L)(Kṁ|ṁ| − Kṁ|ṁ|) = 0`.

**Junction flows inside the loop are algebraic, from continuity plus thermal expansion:**
```
ṁ_out,i = ṁ_in,i − V_i·dρ_i/dt
```
A node that heats up expels mass — that *is* the surge, and it now falls out of the mass balance
instead of being a separate mechanism.

**Every branch is quasi-steady algebraic** — surge line, spray, charging, letdown, ECCS,
relief, break. **This is the review's finding (C) arrived at independently**: orifice-class
junctions have collapsed `L/A` and cannot carry an explicit momentum state. Here they don't need
one, because they were never loop-continuity states.

### 0.3 Pressure: mass conservation IS the pressure equation

```
INTEGRATE  M_total   from sources and sinks only  →  exactly conserved
SOLVE      P         from  M_total = Σ ρ(h_i, P)·V_i + m_pzr(P)
```
**One scalar equation in one unknown — a 1-D Newton root-find, not a Poisson solve.** This is the
escape the review believed was closed: it is neither a node-compressibility pressure (which would
return acoustics at ~3 steps) nor an implicit system solve.

**Conditioning, measured:**

| P | dM/dP |
|---|---|
| 8 MPa | 23.1 kg/MPa |
| 12 MPa | 25.2 |
| 15.41 MPa | 26.9 |
| 17 MPa | 27.8 |

Non-zero, monotone, smooth → Newton converges in ~3 iterations, and warm-starting from the
previous step's `P` makes it 1–2.

**Water-solid stiffness is real physics, not an artifact.** Removing the bubble takes dM/dP from
26.9 to **10.6 kg/MPa**, so a 1 kg mass error moves pressure 0.037 → 0.095 MPa. A water-solid
plant genuinely *is* pressure-stiff. It stays a well-conditioned root-find; it just needs a
tighter convergence tolerance in that regime, which is a declared behaviour rather than a hazard.

**Voiding needs no special case.** `ρ` becomes `ρ_mix(h,P)` and `∂ρ/∂P` grows by orders of
magnitude, so the same closure equation automatically transfers pressure capacitance from the
pressurizer bubble to the voids. The superseded §5's self-contradiction — two different node
pressures both claimed — disappears, because node pressure is never independently asserted.

### 0.4 The review's volume-closure gate is satisfied BY CONSTRUCTION

D5's proposed L2 gate (`Σρ(h_i,P_i)V_i = Σm_i`) can no longer fail, because `m` is never
independently integrated. **It should still be asserted** — as the Newton *residual* — because a
non-converging solve is a real failure mode and this is what would catch it.

### 0.5 Cost — measured, and it exposed a defect in the committed L0

Naïvely this is 2.16M steps × ~12 nodes of density evaluation. Measured against the committed
`pwr2_water.js`: **37.7 s — over the entire 35 s budget.** Investigating rather than accepting
that found a real defect:

**`rho_l` costs 377 ns/call and ~99 % of it is `P_sat`**, which runs 7 Newton iterations from a
**hard-coded 0.1 MPa initial guess regardless of temperature** (`pwr2_water.js`, `P_sat`).

*A first fix — seeding the guess linearly — was tested and **diverges at high temperature**
(6.8 and 9.2 MPa error at 321 and 343 °C, this plant's own operating range). Recorded because it
looked obviously correct and was not.*

**The fix that works removes `P_sat` from the density path entirely.** The compressed-liquid form
is linear in pressure, so it separates:
```
ρ(T,P) = ρ_sat(T)·(1 + (P − P_sat(T))/B(T))  =  A(T) + C(T)·P
   A(T) = ρ_sat(T)·(1 − P_sat(T)/B(T))   ← fitted, quintic in T
   C(T) = ρ_sat(T)/B(T)                  ← analytic, cheap
```

| | Committed | Fixed |
|---|---|---|
| `ρ(T,P)` cost | 377 ns | **92 ns** |
| Max error vs reference form | — | **0.027 kg/m³** (vs `rho_l_sat`'s own 4 kg/m³ claim) |
| Closure over 12 plant-hours | **37.7 s** | **2.16 s** |

**NOT APPLIED — this is the design phase.** The change is specified and measured; applying it is a
build task. Its gate is a consistency assertion of the fast form against the reference form, so
the two fits cannot drift.

---

## 1. Primitives

### Node — a control volume

| | |
|---|---|
| **State (integrated)** | `h` specific enthalpy · `T_wall[]` metal temperature, 1..N lumps |
| **Fixed (geometry)** | `V` volume · `z` centroid elevation · `M_wall` metal mass · `A` wetted area · `cp_wall` |
| **DERIVED each step** | **`m = ρ(h,P)·V`** · `T`, `ρ`, `x` (quality), `α` (void fraction) — all from `h`, `P` via L0 |
| **Per-node flags** | `transport: plug \| stirred` · `wallLumps: N` |

**`m` is DERIVED, not integrated** — §0.1. A rigid node has one thermal degree of freedom, and
carrying both `m` and `h` is the over-determination the review found. The system-level mass ledger
is a *single* integrated scalar, `M_total`, and it is what the pressure solve consumes (§0.3).

**Enthalpy is the state, not temperature.** Advection is then the state variable literally moving,
so energy conservation becomes a runnable assertion; and the node survives phase change with no
separate branch. Temperature-as-state forces a `cp` somewhere and stops conserving energy silently
when `cp` varies — which at 15 MPa it does steeply (4.2 → 6.1 kJ/kg·K between 100 and 321 °C).

**`plug | stirred` is a per-node property, not a global choice.** Outlet-enthalpy = node-enthalpy
(stirred tank) is wrong for a pipe: a hot slug should arrive at the SG *intact*, not exponentially
smeared with time constant = residence time. Pipes get a transport-delay buffer; plena, vessel
regions and the pressurizer are stirred. This is what decides whether cold-water-addition
accumulation in a leg is representable at all.

**`wallLumps` is a per-node integer, same code.** One lump is fine at low Biot number; it is not
fine for the RPV wall, where the inner surface follows the fluid within seconds while the bulk
lags minutes. U-tubes 1, pipe 1–2, RPV 3+.

### Junction — a connection carrying flow
`{from, to, K, Δz, L, A}`. ⛔ **CORRECTED — the original read `{… ṁ …}` and "Carries one integrated state, `ṁ`", which §0.2 and §23.3 supersede.** Loop junction flows are **algebraic** (continuity plus thermal expansion); branches are **quasi-steady**. There is exactly **ONE** integrated momentum state for the whole loop, not one per junction.

**The surge line is a junction, not a node** — negligible capacity, so it is resistance plus
elevation, not a state vector. **A break is also a junction**, onto whatever node it pierces,
which is what makes break *location* physics rather than a scalar severity.

---

## 2. Conservation — the core, and the assertion

```
SYSTEM mass    dM_total/dt = Σ sources − Σ sinks         (branches only; the loop is closed)
NODE   energy  m_i·dh_i/dt = ṁ_in·(h_in − h_i) + Q_wall + Q_src + V_i·dP/dt    <-- CORRECTED
       wall    M·cp·dT_w/dt = −Q_wall        Q_wall = h_film·A·(T_wall − T)
LOOP   momentum (ΣL/A)·dṁ/dt = ΔP_pump + ΔP_buoy − ΔP_fric           ONE state
CLOSURE         M_total = Σ ρ(h_i,P)·V_i + m_pzr(P)      →  solve for P   (1-D Newton)
       junction ṁ_out,i = ṁ_in,i − V_i·dρ_i/dt           ALGEBRAIC, not a state
state           T, ρ, x = f(h, P)            [L0, engines/pwr2/pwr2_water.js]
```

**Non-conservative form** (`m·dh/dt`, not `d(mh)/dt`) follows from §0: `m` is derived, so
differentiating it would reintroduce the spurious state. The `dm/dt` term the conservative form
carries is exactly the thermal-expansion flow the junction equation already accounts for, so
including it would double-count. *That argument was right and is retained.*

> **⛔ BUT THE EQUATION WAS STILL WRONG — `V·dP/dt` WAS MISSING. Found in review 2026-08-13, the
> same day it was written.** The derivation above answered only half the question, because it
> conflated `u` and `h`. Exact first law for a rigid node:
> ```
> d(mu)/dt = ṁ_in·h_in − ṁ_out·h_out + Q        with  u = h − P/ρ,  V fixed
> d(mu)/dt = d(mh)/dt − d(PV)/dt = d(mh)/dt − V·dP/dt
> ⇒  m·dh/dt = ṁ_in(h_in − h) + Q + V·dP/dt
> ```
> **Magnitude — and it is not a rounding term.** RCS ≈ 28 m³. At a brisk pressurizer transient
> (dP/dt ≈ 0.1 MPa/s ≈ 15 psi/s) it is **2.8 MW, ~1 % of rated** — tolerable. **During blowdown at
> 1–10 MPa/s (150–1,500 psi/s) it is 28–280 MW — comparable to or exceeding decay heat**, with the
> sign that makes depressurised fluid read **too hot** (isenthalpic rather than ~isentropic
> expansion of retained inventory).
>
> **It lands hardest in exactly the LOCA/TMI scenarios D3 §6 calls the architecture's strongest
> case.** Corrected in the block above.

**The assertion that justifies the rewrite, restated correctly.** The naive claim — *"total mass

**The assertion that justifies the rewrite, restated correctly.** The naive claim — *"total mass
and energy are conserved to machine precision"* — is now **trivially true for mass** (`M_total` is
a single integrated scalar with no internal redistribution to get wrong) and therefore **worthless
as a gate**. The gate that carries weight is the **closure residual**: after solving for `P`, the
quantity `M_total − Σρ(h_i,P)V_i − m_pzr(P)` must stay below tolerance. That is a real failure
mode (a non-converging or ill-conditioned solve), and it is what D5 must assert. See D5's revised
Layer 1.

**Two-phase: homogeneous equilibrium** (ruled). Quality from enthalpy, phases at equal temperature
and velocity:
```
x = (h − h_f(P)) / h_fg(P)      clipped [0,1]
ρ_mix = 1 / (x/ρ_g + (1−x)/ρ_f)
α = x·ρ_mix/ρ_g
```
No drift-flux, no slip. **Declared limitation:** level swell and phase separation in the
pressurizer and SG are approximations — a rising bubble and the liquid it rises through move at
one velocity here. That is the known cost of the ruling.

---

## 3. Q1 — How is flow computed? **ANSWER: one loop momentum state; branches quasi-steady.**

**REWRITTEN 2026-08-13.** This section previously answered *"full junction momentum"* on the
strength of the table below. **Both the answer and the table were wrong** — see the review block
above (findings B and C) and §0.2. The correct answer:

| Path | Treatment | Why |
|---|---|---|
| **Main loop** | **ONE integrated momentum state** | A series loop has one flow DOF; continuity plus thermal expansion determines every junction algebraically (§0.2). |
| **Branches** — surge, spray, charging, letdown, ECCS, relief, **break** | **Quasi-steady algebraic** | Collapsed `L/A` and up to 15.3 MPa driving ΔP. A DE cold-leg guillotine has **τ ≈ 6.9e-4 s = 0.034 steps** at dt = 0.02 — explicit momentum there is unstable by ~3 orders of magnitude. Critical-flow correlations, as every production code does. |

**The margin on the loop state, computed correctly** (inertia over damping, not the forcing
timescale the old table used): `τ = (ΣL/A)/(2·ΔP_fric/ṁ)` ≈ **0.23 s, ~11 steps** at dt = 0.02.
Stable, but **~190× less margin than this section originally claimed** — and it was the sole
evidence offered for "comfortably explicit". A design margin quoted 190× high is not a margin.

**The friction caveat, corrected.** The original text linearised friction because *"damping
vanishes at ṁ = 0"*. That is backwards: vanishing damping is the *absence* of stiffness. Friction
is stiffest at **high** flow, where `∂(Kṁ|ṁ|)/∂ṁ = 2K|ṁ|` is largest — that is where
semi-implicit treatment earns its place. At reversal the Jacobian → 0, so semi-implicit degenerates
to explicit exactly where the original justification put it, and can chatter when
`dt·(A/L)·2K|ṁ| > 2`. **Flow reversal is handled by the laminar floor, which must be specified,
not by the semi-implicit term.**

---

### 3-OLD. Superseded — the original analysis, kept legible

> The claim below (*"full junction momentum"*) is **wrong**, and the table computes a **forcing
> timescale under an arbitrary imposed ΔP, not a system eigenvalue**. Retained because the error is
> instructive: the number looked like a comfortable margin and was ~190× optimistic.

**This reverses the plan-stage lean toward quasi-steady-with-lag.** The reason was a fear that
momentum is a second stiff term. Analysed, it is not:

```
(L/A)·dṁ/dt = ΔP_driving − ΔP_friction + ρ g Δz
```
Hot-leg junction (L 4.57 m, A 0.174 m², ṁ 1639 kg/s), inertia coefficient L/A = 26.3 m⁻¹:

| Pressure imbalance | dṁ/dt | τ | steps per τ at dt=0.02 |
|---|---|---|---|
| 1 kPa | 38 kg/s² | 43.1 s | 2152 |
| 10 kPa | 381 kg/s² | 4.30 s | 215 |
| 100 kPa | 3807 kg/s² | 0.43 s | 22 |

**Momentum time constants are seconds. Explicit integration at dt = 0.02 is comfortable.** The
genuinely stiff thing in a loop model is *acoustic* dynamics, and the one-pressure-state ruling
(§5) removes it by construction.

**What momentum buys, that quasi-steady would not:**
- **RCP coastdown becomes derived** from pump inertia against loop friction, instead of a fitted
  exponential.
- **Natural circulation falls out** (§6) instead of being a fitted scale.
- Flow redistribution during transients is real rather than imposed.

**One numerical caveat, named because it will bite otherwise:** friction is `K·ṁ|ṁ|`, whose
damping *vanishes at ṁ = 0*, so a loop drifting through zero flow can oscillate. **Treat the
friction term semi-implicitly** — linearise about the current `ṁ` within the step — and add a
laminar floor at very low flow. This is the one place the integration is not plainly explicit.

---

## 4. Q2 — Integration scheme. **ANSWER: explicit at dt = 0.02, gather-then-integrate.**

Matches the service's fixed `PHYSICS_DT = 0.02` (acceleration = more steps, never a bigger dt), so
no change is needed above the engine. Time constants checked against it:

| Term | τ | Verdict |
|---|---|---|
| Junction momentum | 0.4 – 43 s | explicit fine |
| Node enthalpy (residence) | ~1 – 10 s | explicit fine |
| SG tube wall (tightest wall) | **0.67 s** | explicit fine (33 steps/τ) |
| Hot-leg pipe wall | 24.7 s | explicit fine |
| **Neutron kinetics** | ~1e-5 s prompt | **the one genuinely stiff term** |

**Kinetics keeps the current engine's treatment.** Point kinetics with 6 delayed groups and a
prompt-jump/sub-step handling is standard, is not what is broken, and already works at this
cadence. Reuse the *formulation*, not the code (§2 of the spine forbids copying).

**The step is two-phase, and this is the design's most consequential structural choice:**

```
PHASE 1 — GATHER.  Evaluate every flux from state at time n:
                   junction ṁ and its enthalpy transport, wall Q, sources, break flows.
                   Nothing is written to state.
PHASE 2 — INTEGRATE. Advance every node and junction state n → n+1 from those fluxes.
```

Because Phase 1 reads only time `n` and Phase 2 writes only time `n+1`, **there is no step
ordering to get wrong.** The current engine's 27-step schedule — where step 9 runs before step 8
and step 14c before 14b, each ordering load-bearing — has no analogue here.

---

## 5. Pressure — one RCS state, solved from mass closure

**REWRITTEN 2026-08-13.** The original text below asserted **two different node pressures at
once** — `P_node = P_rcs + ΔP_quasi-static`, *and* that a node voids "when enthalpy crosses
saturation at its local pressure" with `m` and `V` both fixed. **§0.3 removes the contradiction by
never asserting a node pressure at all:** `P` is *solved* from the system mass ledger, and the
quasi-static ΔP field is a reporting output, not a second claim about pressure.

**Voiding therefore needs no special case.** `ρ` becomes `ρ_mix(h,P)`, `∂ρ/∂P` grows by orders of
magnitude, and the same closure equation transfers pressure capacitance from the pressurizer bubble
to the voids continuously. **Measured:** dM/dP falls 26.9 → 10.6 kg/MPa when the bubble is
removed — water-solid stiffness is real physics, retained rather than approximated.

**The declared limitation is unchanged and still honest:** there is **no true pressure gradient
during blowdown**. Break *location* effects survive because they are **topology** — cold-leg-break
ECCS bypass, crossover loop-seal drain, SGTR containment bypass all come from *which nodes the
junction connects*.

---

### 5-OLD. Superseded — the original, self-contradictory formulation

The liquid RCS is incompressible; the pressurizer bubble is the compressible volume. So there is
**one dynamic pressure state**, plus a quasi-static ΔP field for the loop, plus per-node void.

```
dP/dt = (net volumetric surge into the bubble) / (bubble compressibility)
P_node = P_rcs + Σ (quasi-static ΔP along the path)
```
When a node's enthalpy crosses saturation at its local pressure, it voids — `α` from §2 — and the
void participates in the mass/energy ledger normally.

**Declared limitation, stated so no one reads more into the model than is there:** there is **no
true pressure gradient during blowdown**. A large break depressurises the whole RCS together
rather than propagating. **What still works, and is the reason this ruling is affordable:** break
*location* effects are **topology**, not gradient — cold-leg-break ECCS bypass, crossover-break
loop-seal drain and SGTR containment bypass all come from *which nodes the junction connects*, and
survive intact.

---

## 6. Q4 — Natural circulation. **ANSWER: derived, and W ∝ Q^⅓ emerges.**

The buoyancy term `ρ g Δz` is already in the loop momentum equation, and node densities are real
(L0). **The elevation and the friction figure have both been corrected since this section was
written:**

- **Δz is the separation of THERMAL CENTRES, ~8.0 m — not the 16.8 m RCP-suction-to-tube-top this
  section originally used.** The RCP suction sits on the **cold** side, *downstream* of the heat
  sink: fluid descends to it cold and leaves it cold, contributing nothing net to ∮ρg·dz. Found in
  review, **independently confirmed** by the result below.
- **Loop friction is 0.580 MPa, DERIVED** (`PWR2_PLANT.md` §1a-ii), not the ~0.5 MPa this section
  asserted.

Balancing buoyancy against friction, with ΔT = 33·(q/w) by the energy balance, `w³ = (buoy/Δp)·q`:

| Decay heat | ORIGINAL (16.8 m, 0.5 MPa) | **CORRECTED (8.0 m, 0.580 MPa)** |
|---|---|---|
| 2 % | 7.9 % | **5.9 %** |
| 5 % | 10.7 % | **7.9 %** |

**Real-PWR natural circulation is ~4–5 % of rated at 2–3 % power.** The correction moves the answer
*toward* the real band from above — which is the confirmation that the elevation fix is right, and
it was reached by a route (loop ΔP from geometry) independent of the review that proposed it.

**The cube-root law is not a correlation PWR2 imposes — it falls out of the momentum balance.**
Today it is asserted (`Manuals/12` §12.4 notes the shape is sourced but *"the SCALE is this
plant's and is fitted"*). In PWR2 both come from geometry.

*Design analysis on design values, not a measurement of a built plant (HR12). The magnitudes are
the same family as real-PWR natural circulation; the exact number depends on rated loop ΔP, which
D3 fixes.*

---

## 7. Q3 — Surviving one-step-old couplings. **ANSWER: ~23 → 0 INSIDE the engine, plus 2 that were always outside it.**

**REWRITTEN 2026-08-13.** The original *"23 → 2"* was a **category swap**: both named survivors
are **outside** the engine and exist identically today — they were never among the ~23 in-engine
reads. And **`CONTEXT.md` §11 contains no count of 23**, which D1 §5 cited it for; the figure came
from an inventory of annotated sites, and **at least one of them survives by design** (kinetics
reading start-of-step reactivity, which §4 explicitly retains).

**What gather-then-integrate actually does, stated at the strength the mechanism supports:**

| | |
|---|---|
| **Ordering couplings** — a term reading a value another term wrote *this step* | **Genuinely eliminated.** Phase 1 reads only time *n*; Phase 2 writes only *n+1*. The current 27-step schedule's step-9-before-step-8 problem has no analogue. |
| **Algebraic couplings** — two quantities that depend on each other simultaneously | **NOT eliminated — converted to a uniform first-order explicit lag.** Whether that is an improvement depends entirely on whether the lagged loop is stiff. |

**The containment example the original section used is a redefinition, not an elimination.**
Reading both endpoints at time *n* **is** the one-step-old read. It is a real consistency
improvement on today's mixed treatment (current break flow against stale containment pressure) and
should be claimed as *that* — but the loop is still closed explicitly, with identical stability.

**§0 does eliminate the worst algebraic loop, by a different mechanism.** P↔void — the stiffest
loop in the plant, since `∂ρ/∂P` is enormous near saturation — is not lagged at all: it is solved
**implicitly within the step** by the 1-D Newton closure (§0.3). That matters, because an explicit
lag on P↔void is mechanically the same family as **#447's 40-second limit cycle**.

**Honest scorecard:** in-engine ordering couplings → **0**. The pressure/void algebraic loop →
**solved implicitly**. Remaining explicit algebraic lags → break/relief flow against containment
pressure, and kinetics feedback. The two engine↔instruments↔control couplings are **outside** and
were never in the count; instrument lag is HR1 *by design* and control acting on last cycle's read
is real plant behaviour.

---

### 7-OLD. Superseded — the original claim

The gather-then-integrate step (§4) eliminates **every** within-physics ordering coupling, because
no physics term ever reads a value another physics term wrote in the same step.

**Notably it dissolves the current engine's hardest case.** Today, break flow → containment
pressure → break flow is an algebraic loop broken by reading containment pressure one step late.
In PWR2 containment is *just another node* and the break is *just another junction*: both
endpoints are read at time `n` in Phase 1, so there is no loop to break.

**The two that remain, and why they are irreducible:**

| Coupling | Why it must stay |
|---|---|
| engine → instruments | Instruments lag, noise and fail **by design** — HR1. Indication is *supposed* to trail truth. |
| instruments → control → engine | The control layer acts on what it read last cycle. This is real plant behaviour, not an artifact, and it runs on its own `PROTECTION_DT = 0.1` cadence. |

**Both are outside the engine.** Within `engines/pwr2/`, the target is **zero**, and D5 should
assert it rather than trust it.

---

## 8. What this document does not settle

- Node and junction **counts and values** — D3.
- `h_film` correlations. Dittus-Boelter for forced convection is the obvious choice; the boiling
  and condensing regimes need a decision and a source. **Flagged: these are the most likely place
  for recalled constants to re-enter**, and the `[ruled]/[derived]/[sourced]` rule applies.
- Pump head curve — needs a real curve shape, and coastdown needs pump rotational inertia. D3.
- Whether the secondary uses the same primitives or a lumped model — D3.

---

## 9. Film coefficients — SOURCED, closing §8's flagged gap

§8 named `h_film` correlations as *"the most likely place for recalled constants to re-enter"*.
Sourced 2026-08-13:

| Surface | Value | Note |
|---|---|---|
| **Core**, rated (15.41 MPa, Tavg 304.5 °C, G = 3,400 kg/m²·s) | **34,500 W/m²·K** plain Dittus-Boelter, **48,200** with the rod-bundle P/D correction | defensible band 30,000–50,000; **use the rod-bundle-corrected value** |
| **SG tube, primary side** (ID 0.775 in, v 5.42 m/s) | **35,000 W/m²·K** | |
| **SG secondary, nucleate boiling** (6.27 MPa, q″ 0.05–0.20 MW/m²) | 11,600–32,900 (Jens-Lottes) / 20,300–40,600 (Thom) | |
| **SG overall U** | **3,500–6,000 W/m²·K** | *"set by tube wall + fouling, NOT by the film coefficients"* |
| **CHF (W-3)** at SLS-100 conditions | 2.2–3.7 MW/m² for quality −0.15 to 0 | the DNB limit the core model must respect |
| Core nucleate-boiling wall superheat at 1 MW/m² | 2.1 °C (Jens-Lottes) | |

**Two consequences that change earlier text:**

1. **D2 §4's SG-tube-wall time constant was computed with the wrong coefficient.** It used
   h = 5,000 W/m²·K — which this pass confirms is the **overall U**, not the primary-side film.
   The correct tube-side film is **35,000 W/m²·K**, a factor of 7, so the wall τ is
   **~0.10 s, not 0.67 s — roughly 5 steps at dt = 0.02, not 33.** Still stable; the margin is far
   thinner than §4 claimed. This is the review's finding (E), now with a sourced number behind it.
2. **`U` is dominated by tube wall and fouling, not the films.** That means the SG model must carry
   a **wall conduction resistance and a fouling allowance explicitly** — a series-resistance
   network, not a single lumped `h_sg`. The current engine's `sg_tube_split: 0.5` gestures at this
   with a fitted 50/50 split; PWR2 can compute it.

---

## 10. Review findings on §0 itself (2026-08-13) — the resolution SURVIVES, as an outline

Independent review re-derived §0's load-bearing arithmetic and **confirmed the core**: the DOF
argument is correct, the momentum eigenvalue checks (ΣL/A ≈ 165 m⁻¹ → τ ≈ 0.23 s), `M(P)` is
monotone so the root-find is well-posed, and the escape from the trilemma (no acoustics, no
Poisson, no lost redistribution) is genuine.

**But it survives as an outline, not as written. Six holes INSIDE §0's own machinery** — every one
would ship as a defect if built from these pages:

1. **The missing `V·dP/dt`** — fixed above (§2).
2. **The junction equation is circular through `dP/dt`.** `dρ_i/dt = (∂ρ/∂h)·dh_i/dt +
   (∂ρ/∂P)·dP/dt`, but **`dP/dt` is only known after the Newton closure, which runs after
   integration.** Near saturation `∂ρ/∂P` is enormous, so in a *flashing* node the `dP/dt` term
   **dominates** the expulsion flow. §7's "P↔void solved implicitly" covers only the *h*-fixed
   closure — **the flash-flow↔pressure loop is still explicitly lagged**, which is the #447
   mechanism family re-entering through the equation §0 added. **Unsequenced. Must be specified.**
3. **No superheated vapour exists in the model.** `x = (h−h_f)/h_fg` **clipped to [0,1]**, so a node
   past `h_g` gets saturation density forever. **Core uncovery — the physics behind every meltdown
   path — is clad heatup in *superheated* steam.** One clip in one formula forecloses the
   severe-accident half of the ruled scope. Containment (air + steam) is not covered by the stated
   forms either.
4. **`m_pzr(P)` is undefined and the conditioning table is inconsistent.** Pressurizer mass is not
   a function of `P` alone — it depends on liquid inventory and bubble steam mass, both dynamic.
   **The closure's best-conditioned term is currently undefined.** And my "measured" dM/dP table
   held bubble *volume* fixed at 2 m³, which is not how a pressurizer works: a real bubble softens
   as `P` falls, so dM/dP should *rise* at low `P`, and my table shows the opposite. **It was a
   property-library exercise mislabelled as a pressurizer measurement.** Also: at void onset
   `∂ρ/∂h` jumps ~15×, so **plain Newton with a 1–2 iteration warm-start can chatter across the
   kink — use a bracketed solve.** And the 2.16 s cost is the *one-evaluation* cost; with 2–3
   iterations it is ~5–7 s (still in budget).
5. **Plug-flow nodes contradict the single-`h` closure.** A plug node's point is an enthalpy
   *profile*; the closure sums `ρ(h_i,P)·V_i` with one `h_i`, and `ρ` is nonlinear in `h`, so
   `ρ(h̄) ≠ mean ρ` during exactly the hot-slug transport the flag exists for.
6. **"One loop momentum DOF" is false of D3's own junction table.** J-rhr is a **parallel path**
   around the SG/RCP segment — under RHR cooling with the RCP off there are genuinely two circuits
   and two flow DOF. Likewise a large break makes the flow field differ by thousands of kg/s across
   the break, so a single `ṁ` in `Σ K ṁ|ṁ|` is wrong segment-by-segment. Both may be acceptable
   simplifications; **neither is declared.** Also absent everywhere: a **two-phase friction
   multiplier**, without which loop ΔP at high void is badly wrong.

**Unresolved from the earlier review and still unresolved: finding (H).** Kinetics sub-stepping
violates the two-phase step; §0 is silent on kinetics; §4 still specifies sub-stepping. **The one
term everyone agrees is stiff has no consistent integration story anywhere in the set.**

**Bookkeeping:** §§3 and 5 got `-OLD` splits; **§§1 and 4 did not, and are still cited as live** —
§1's junction primitive still says *"carries one integrated state, ṁ"*, flatly contradicting §0.2.
A future agent reading §1 builds the superseded design.

---

## 11. RESOLUTIONS to §10's holes (2) and (3)

### 11.1 The `dP/dt` circularity — resolved, but the system is PIECEWISE affine

> **⛔ CORRECTED after numerical test (§12.2). Read this before the derivation below.**
>
> **The precondition the original text omitted: affineness holds only while the donor-cell
> DIRECTIONS are fixed.** `h_in` is a *coefficient* of the map, so **a junction reversal switches
> the map.** The system is **piecewise affine**, not affine.
>
> **Measured consequence:** error in the solved `Ṗ` is **0.00 % in single-phase liquid** but
> **24 % at 5 % void, 195 % at 1 % void / 0.5 MPa**, and the worst case produced a **299 %
> deviation including a sign inversion**. The probe point matters: on natural circulation the
> first kink is at Ṗ = 0.110 MPa/s, so `march(1)` reads the wrong branch and the "slope" is a
> secant across a kink. **Moving the probe closer does not fix it** — the kink can lie between 0
> and the root.
>
> **THE FIX: three marches, not two.** Re-linearising converges to the true root **exactly, in
> every case tested**. So:
> - **"Two marches and one division" → three marches.**
> - **"Non-iterative" is FALSE** wherever a junction can reverse. It is non-iterative only in
>   single-phase liquid.
> - **"Exact" is true of the RATE, not the STEP.** Pre-correction closure residual after one
>   dt = 0.02 reaches **166 kg with a node on the `h_f` kink**, so **the Newton level-corrector is
>   the AUTHORITY there, not a round-off polisher** — the reverse of how §11.1 originally framed
>   the two mechanisms.
>
> **And the way this was found is the more important lesson.** My original "verified numerically"
> used a 3-node single-phase toy whose **first junction reversal is at Ṗ = +200 MPa/s** — it was
> affine to 0.00e+0 because *nothing in it could reverse*. **I verified a claim on a case
> structurally incapable of falsifying it.** Recorded in D3 §1a as the generalised rule: it is not
> just recalled *bands* — it is **any acceptance criterion I choose that cannot fail.**

The derivation below is correct *within a branch*, and is retained for that reason.

§10(2) is real: `dρ_i/dt` needs `dP/dt`, which the Newton closure only produces afterwards, and
near saturation that term dominates the expulsion flow. Lagging it would re-introduce the #447
mechanism through the very equation §0 added.

**It does not need lagging. The entire node/junction system is AFFINE in `dP/dt`.** Every
constituent relation is linear in it:

```
dh_i/dt  = [ṁ_in,i(h_in − h_i) + Q_i + V_i·dP/dt] / m_i      linear in ṁ_in and dP/dt
dρ_i/dt  = (∂ρ/∂h)·dh_i/dt + (∂ρ/∂P)·dP/dt                   linear in dh/dt and dP/dt
ṁ_out,i  = ṁ_in,i − V_i·dρ_i/dt                              linear in ṁ_in and dρ/dt
```
and a composition of affine maps is affine — including around the loop, where each node's `ṁ_in`
is the previous node's `ṁ_out`, so the `dP/dt` coefficients simply accumulate.

**Therefore:**
```
march(Ṗ) ≡ Σ V_i·dρ_i/dt        evaluated by marching the loop from the anchor at flow ṁ_loop
Ṗ = (dM_loop/dt − march(0)) / (march(1) − march(0))
```
**Two marches and one division. Exact, non-iterative, no lag.**

**Verified numerically** on a 3-node toy loop (2026-08-13): `march(2)` and `march(−0.5)` match the
affine prediction from `march(0)` and `march(1)` to **7e-12 and 9e-13**; solving for a closed loop
(`dM/dt = 0`) and re-marching returns `Σ V dρ/dt = 0.00000000`.

**This supersedes §0.3's Newton framing for the *within-step* solve.** Newton is still worth
keeping as a **drift corrector on the absolute ledger** (`M_total = Σρ(h_i,P)V_i + m_pzr`) run
every step or every few steps, because integrating `Ṗ` alone accumulates round-off. Two mechanisms,
different jobs: the affine solve gives an exact *rate*, Newton pins the *level*.

*Note this also removes §10(4)'s Newton-chatter concern from the hot path — the kink in `∂ρ/∂h` at
void onset is now inside the coefficient evaluation, not inside an iteration.*

### 11.2 The superheat clip — the state equation needs a THIRD regime

§10(3) is correct and is the more serious of the two: `x = (h−h_f)/h_fg` **clipped to [0,1]** means
a node past `h_g` gets saturated-vapour density forever. **Core uncovery is clad heatup in
superheated steam**, so as written the model forecloses every meltdown path — half the ruled scope.

**Three regimes, not two:**

| Regime | Condition | ρ | T |
|---|---|---|---|
| Subcooled liquid | `h < h_f(P)` | `ρ_l(T,P)` | `T_from_h(h,P)` |
| Two-phase | `h_f ≤ h ≤ h_g` | `ρ_mix` from `x` | `T_sat(P)` |
| **Superheated vapour** | **`h > h_g(P)`** | **`ρ_v_sat(P)·(T_sat+273.15)/(T_sup+273.15)`** | **`T_sat(P) + (h − h_g)/cp_v(P)`** |

The superheated density uses the ideal-gas `ρ ∝ 1/T` at constant pressure, anchored on the
*saturated* vapour density the library already has — so it is continuous at `h = h_g` by
construction, which matters because §11.1's affine solve differentiates through it.

**L0 additions required** (`engines/pwr2/pwr2_water.js`): **`cp_v(P)`** — vapour specific heat,
which the library does not currently have — and the three-regime dispatch in a single `ρ(h,P)`
entry point so callers never branch. **Gate:** continuity of `ρ` *and* `∂ρ/∂h` across both regime
boundaries, asserted numerically, since a kink there would corrupt the affine coefficients.

**Containment is still not covered** by any of the three — it is an air/steam mixture with a
non-condensable partial pressure. It needs its own state relation, which the current
`stepContainment` already effectively has. **Do not force it into the water-only dispatch.**

---

## 12. NUMERICAL TEST RESULTS (2026-08-13) — two claims broken, the architecture validated

An independent agent built throwaway experiments against §§0, 11.1, 11.2 and 0.5, including a
working 11-node prototype. **It disclosed and fixed a bug in its own harness mid-run** (Q in W
against h in kJ/kg, plus a missing MPa·m³→kJ factor) — the bug *understated* coupling, so pre-fix
findings were conservative.

### 12.1 ✅ THE ARCHITECTURE WORKS — the prototype runs

11 nodes, one momentum state, one pressure, affine solve, algebraic junctions, dt = 0.02:

| | |
|---|---|
| 1000 s run | **stable**; P constant to 5 dp |
| Heat imbalance | **0.000 kW of 3.0e5** |
| Mass ledger residual | **0.0 kg of 20,822** |
| Core rise | **183.038 kJ/kg = Q/ṁ exactly** (ΔT 32.99 °C / 59.4 °F) |
| Largest stable dt | **0.2 s — 10× margin at 0.02** |
| Perturbations survived | heat +10/+50/+100 %, RCP trip + decay heat, hot leg voided, drain to **24 % void** |
| **#447-style limit cycle** | **NONE** — 1200 s held *on* the saturation line: 1 crossing, 2 Ṗ sign flips |

**RCP trip at full power runs away to P > 25 MPa — PHYSICAL, not numerical** (identical at
dt = 0.005; the modelled PORV removes ~165 MW of 300).

**Caveat that matters: the prototype has NO WALLS**, and §9 puts the SG tube wall at τ ≈ 0.10 s —
**5 steps at dt = 0.02, the binding constraint. The 10× margin does not cover it.**

### 12.2 ❌ §11.1's AFFINE CLAIM IS BROKEN — the system is PIECEWISE affine

**Exactly affine with donor-cell directions held fixed** (3e-16 to 5e-15 relative, Ṗ from −1000 to
+1e5 MPa/s, single- *and* two-phase — **enormous `∂ρ/∂P` does not hurt it**). But `h_in` is a
*coefficient* of the map, so **a junction reversal switches the map.** §11.1 never states that.

**Worst case: 299 % deviation INCLUDING A SIGN INVERSION** — 2 % void @ 1.0 MPa, Ṗ = −1 MPa/s:
true march −779 kg/s, affine prediction **+1551 kg/s**.

Error in the solved Ṗ, present even at `dM/dt = 0`: **0.00 %** liquid · 24.3 % at 5 % void @
15.41 · 83.5 % at 2 % void @ 1.0 · **195 % at 1 % void @ 0.5** · 123 % on natural circulation.

**My "verified numerically" could not have caught this, and THAT is the finding.** My 3-node
single-phase toy has its first junction reversal at **Ṗ = +200 MPa/s** — affine to 0.00e+0 because
**nothing in it can reverse**. I verified a claim on a case structurally incapable of falsifying
it. **The recalled-band lesson generalises again: it is not just bands — it is ANY acceptance
criterion I choose that cannot fail.**

**Fix is cheap:** 3 re-linearisations converge to the true root exactly in every case tested. So
"two marches and one division" becomes **three marches**, and **"non-iterative" is false** wherever
a junction can reverse. `m_i` frozen within the step is consistent, but its error is **13 % at
1 MPa and 27 % at 0.5 MPa** in a flashing node.

**"Exact" is true of the RATE, not the STEP.** Pre-correction closure residual after one dt: 0.0 kg
liquid → **166 kg with a node on the `h_f` kink**. **The Newton corrector is the AUTHORITY there,
not a round-off polisher** — which reverses §11.1's framing.

### 12.3 ❌ §0.5's COST MODEL MEASURED THE WRONG FUNCTION — architecture-threatening

The `A(T)+C(T)·P` separation is **exact algebra** (2.3e-13) and the speed gain was *understated*
(**15.6×**, not 4.1×). But **§1 makes ENTHALPY the node state, so the hot path is `ρ(h,P)`**:

| | |
|---|---|
| `ρ(T,P)` committed | 345 ns |
| **`ρ(h,P)` committed** | **3,748 ns — 12×** (`T_from_h` runs 3–9 Newton iterations, each calling `h_l → rho_l → P_sat`) |
| §0.5 quoted | 2.16 s / 12 plant-hours |
| **Honest, one eval per node per step** | **98.6 s** |
| **With the affine march's partials** | **493 s** |
| **Budget** | **35 s** |

**The `A(T)+C(T)·P` fix does not touch that path.** Fixable — tabulating `P_sat` reached **179 ns
(21×)** — **but not by the change §0.5 specifies.**

**Also: 0.027 kg/m³ needs a MINIMAX fit.** Plain least-squares gives **0.0610 — 2.3× over** — and
least-squares is what every other correlation in `pwr2_water.js` declares.

### 12.4 ❌ §11.2's OWN GATE IS UNSATISFIABLE BY §11.2's OWN FORMULA

- **ρ continuous at both boundaries** ✅ (1.7e-9 at `h_g`, 7.2e-7 at `h_f`).
- **`∂ρ/∂h` at `h_g` discontinuous, and NO `cp_v` can fix it.** Continuity needs `cp_v` running
  **6.07 → 1.78 kJ/kg·K** over 0.1→17 MPa; real saturated-steam `cp_v` runs **2.08 → 17.5 in the
  OPPOSITE direction**. Mismatch **9.8× at 17 MPa**.
- **`∂ρ/∂h` at `h_f`:** 6.2× at 15.41 MPa, **3812× at 0.1 MPa.** §10(4)'s "~15×" was the 10 MPa
  value quoted as general; **at blowdown pressures it is 250× worse.**
- **`∂ρ/∂P` is discontinuous too — a LIVE TRAP.** A central difference at 0.5 MPa returns
  **19,378 instead of the one-sided 0.764 — a 25,000× coefficient error** — and the affine march
  needs exactly that partial, where a central difference is the obvious way to get it.

**Needs a design ruling:** smooth the boundary, accept the kink and declare it, or reformulate the
superheat anchor. **The gate as written must not ship, because it cannot pass.**

---

## 13. §0.5's COST BASIS REDONE — the architecture survives, by a different fix

§12.3 showed §0.5 benchmarked `ρ(T,P)` while §1 makes **enthalpy** the state, so the hot path is
`ρ(h,P)` — and that the honest cost (98.6–493 s against a 35 s budget) was architecture-
threatening. Redone against the right function.

**What the architecture actually needs.** 2.16M steps × 12 nodes × **3 marches** (§12.2's fix)
= **78M node-evaluations**, where a node-evaluation must yield `ρ` *and* both partials. Against a
property budget of ~15 s (engine.step is ~88 % of 35 s; properties roughly half of that):
**≤ 193 ns per node-evaluation.**

**Three routes measured, and the tradeoff is real:**

| Route | Accuracy | Cost | Verdict |
|---|---|---|---|
| Committed `ρ(h,P)` (`T_from_h` → `h_l` → `P_sat`, Newton in Newton) | exact | **7,189 ns** | 37× over |
| §0.5's `A(T)+C(T)·P` | exact algebra | — | **does not touch this path** |
| Poly `T(h)` + linear-in-P correction, Horner | **0.87 °C — too loose** | 6.0 ns | fast, not accurate |
| **Poly `P_sat(T)` + poly seed in `h` + 2 Newton on a cheap `h_l`** | **0.039 °C** | **123 ns** | **FITS — 9.56 s of 15, 2× margin** |

**The adopted route** removes every nested iteration from the hot path:
1. **`P_sat(T)` as a direct degree-6 polynomial in `ln P`** (max rel. error 0.57 %) — this is what
   kills the cost, because the committed `P_sat` is a Newton inverse called *inside* another
   Newton.
2. **A degree-7 polynomial seed** for `T(h)` at a reference pressure, `h` scaled to [0,1].
3. **Two Newton steps on a now-cheap `h_l`**, giving **0.039 °C** — 22× better than the fast route
   and comfortably inside anything the plant cares about.

**58× faster than committed. The cost objection is answered.**

**Three things to carry forward rather than celebrate:**

- **The 2× margin is thinner than it looks.** It assumes 12 nodes and 3 marches. **Node count and
  march count both multiply it directly** — 20 nodes would consume the margin entirely. **This is
  now a design constraint on D3's topology, not a free parameter.**
- **`P_sat` as a fitted polynomial breaks L0's one-curve-one-source-of-truth rule**, which the
  library's own comments justify at length (the Newton inverse exists so `T_sat` and `P_sat` cannot
  disagree). Adopting the fit means **the consistency must move from *by construction* to *gated***
  — assert `P_sat(T_sat(P)) = P` to tolerance. That is an acceptable trade, but it is a trade, and
  the gate is now load-bearing rather than decorative.
- **§12.3's minimax point still stands**: 0.027 kg/m³ for `A(T)` needs a Remez fit; plain
  least-squares gives 0.0610. The library declares least-squares everywhere else, so either the
  fit method or the claimed accuracy has to change.

---

## 14. The four remaining holes — RESOLVED

§10's items (4), (5) and (6) plus the missing two-phase friction term. None needed an owner ruling;
all four turned out to be under-specification rather than error.

### 14.1 `m_pzr(P)` — the pressurizer is the ONE node where `m` IS a legitimate state

§0.3 wrote the closure as `M_total = Σρ(h_i,P)V_i + m_pzr(P)`, and the review correctly objected
that pressurizer mass is not a function of `P` alone. **The special term was my error.** The
resolution explains *why* the pressurizer is different, and it is not arbitrary:

**§0's whole argument is that `m` has no freedom because `V` is FIXED. The pressurizer's regions do
not have fixed volume** — the liquid/steam interface moves. So for the pressurizer, and only there,
`m` recovers its freedom:

```
STATES   m_liq, h_liq, m_steam, h_steam          (4 -- m IS a state here)
DERIVED  V_liq   = m_liq  / ρ_l(h_liq,  P)
         V_steam = m_steam/ ρ_v(h_steam,P)
CONSTRAINT                V_liq + V_steam = V_pzr        (the total IS fixed)
```

That constraint is the pressurizer's contribution to the pressure closure — it enters
`Σ V_i` rather than `Σ m_i`, which is the same equation viewed from the other side. **No special
`m_pzr(P)` function is needed or possible.**

**This also resolves the HEM objection** (D3 §4): a single stirred HEM node cannot hold liquid and
steam at different enthalpies, but **two nodes with a moving boundary can** — spray condensation,
heater input and insurge subcooling all act on distinct regions. **#472 still owns the pressurizer;
this is the interface it must satisfy, not a competing model.**

**And it explains my own conditioning table's inconsistency** (§10(4)): I held bubble *volume*
fixed at 2 m³, which is exactly the assumption this section shows is wrong. The table was a
property-library exercise, not a pressurizer measurement.

### 14.2 Plug-flow nodes vs the single-`h` closure — and it costs

A plug node holds an enthalpy *profile*, but the closure summed one `ρ(h_i,P)·V_i` per node, and
`ρ` is nonlinear in `h` so `ρ(h̄) ≠ mean ρ`. **Resolution: a plug node contributes its sub-cells to
the closure, not its mean.**

```
plug node k sub-cells:   m_i = Σ_k ρ(h_k, P)·V_k        (and dρ_i/dt likewise, per sub-cell)
```

**Consequence that lands on §13's budget, not on correctness:** a plug node costs **K
node-evaluations, not 1**. With hot leg, crossover and cold leg as plug nodes at, say, K = 5, the
per-step evaluation count rises from 12 to ~24 — **which consumes §13's entire 2× margin.**
**Plug sub-cell count is now a budget parameter**, and D3 must set K explicitly rather than leaving
`transport: plug` as a free flag.

### 14.3 "One loop momentum DOF" — the rule is the flow graph's cyclomatic number

§0.1's *"a series loop: continuity links every junction"* is **false of D3's own junction table** —
J-rhr connects hot leg to cold leg, forming a second circuit around the SG/RCP segment. **Stated
correctly:**

> **The number of integrated momentum states equals the number of independent cycles in the flow
> graph** (edges − nodes + 1 for the connected flow network), **counting only paths whose flow is
> not pump- or valve-dominated.**

| Lineup | Independent cycles | Momentum states |
|---|---|---|
| Normal, RCP running | 1 | **1** |
| **RHR aligned, RCP off** | **2** | **2** — RHR forced flow *and* the SG limb, which may stagnate or reverse |
| Large break | 1 + break path | break path is **quasi-steady critical flow**, so still 1 integrated |

**The RHR case is not academic**: the SG-limb flow under RHR cooling is exactly the mode transition
Tier B cares about, and a single loop state cannot represent stagnation in one limb while the other
circulates.

**A second admission the original section owed:** under a large break the flow field differs by
thousands of kg/s across the break, so **a single `ṁ` in `Σ K ṁ|ṁ|` is wrong segment-by-segment.**
Segment flows come from the algebraic march (§0.2) and the friction sum must use *those*, not the
loop state.

### 14.4 Two-phase friction multiplier — absent everywhere, and required

No two-phase friction term existed in any document, without which loop ΔP at high void is badly
wrong — and high void is precisely the natural-circulation-degradation regime that defines this
plant's ruled ride-out character.

**Under the HEM ruling the consistent choice is the homogeneous multiplier:**
```
φ²_lo = 1 + x·(ρ_f/ρ_g − 1)          ΔP_2φ = φ²_lo · ΔP_liquid-only
```
It is the form that follows from treating the mixture as a single fluid with `ρ_mix`, so it is
*entailed* by the ruling rather than bolted on — no separated-flow correlation (Lockhart-Martinelli,
Friedel) is admissible without also admitting slip, which the ruling excludes.

**Flagged: UNSOURCED.** The form is standard, but it has no citation in this repo's corpus and it
is load-bearing for natural circulation. **It goes on the evidence list**, and per D3 §1a's rule it
may not *confirm* anything until sourced.

---

## 15. FINDING (H) RESOLVED — kinetics needs ANALYTIC integration, not sub-stepping

Flagged by three separate reviews and never addressed: §4 named kinetics the one genuinely stiff
term and resolved it by "prompt-jump/sub-stepping", but **sub-steps are intermediate writes that
must read feedback Phase 2 has not written** — so the one term everyone agreed was stiff had no
integration story compatible with gather-then-integrate.

### 15.1 The stiffness is real — measured

Standard U-235 6-group data, β = 0.00645, Λ = 2.0e-5 s. Prompt eigenvalue ≈ (ρ − β)/Λ:

| ρ | eigenvalue | τ | dt/τ at 0.02 |
|---|---|---|---|
| 0 | −323 s⁻¹ | 3.10e-3 s | 6.5 |
| −0.001 | −373 s⁻¹ | 2.68e-3 s | 7.5 |
| −0.05 (scrammed) | −2,820 s⁻¹ | 3.54e-4 s | **56** |

**Explicit Euler at dt = 0.02 with no sub-steps returns n = 0.000e+0 — it diverges to zero.** It
needs **250 sub-steps** per 0.02 s step to be stable.

### 15.2 The resolution — sub-stepping was never necessary

**With ρ frozen over the step, point kinetics is a LINEAR system with constant coefficients.** It
has a closed-form solution — a 7×7 matrix exponential (scaling-and-squaring is ample; the system is
tiny and the matrix is sparse). Measured against the diverging explicit step: **analytic gives
n = 0.865167, stable, in one step, with no sub-steps at all.**

**This is exactly compatible with gather-then-integrate**, and the apparent conflict dissolves:
**ρ is a Phase-1 coefficient**, computed from time-*n* state. Phase 2 advances the kinetics
analytically using it. **Nothing re-reads feedback mid-step, because nothing needs to.**

**So §4's "sub-stepping" was the error, not the constraint.** Finding (H) was correct that
sub-stepping violates the step; it is resolved by not sub-stepping.

### 15.3 But freezing ρ has a real cost — and it is NOT small

**Measured**, one 0.02 s step, frozen-ρ against a ρ ramped within the step:

| Reactivity ramp | Relative error in `n` |
|---|---|
| 0.001 dk/s | 2.3e-3 |
| 0.01 dk/s | **2.3e-2** |
| 0.1 dk/s | **2.2e-1** |

A real scram inserts ~4,000–6,000 pcm in 2–3 s ≈ **0.016–0.024 dk/s**, so a scram sits between the
second and third rows — **a few percent per step, not negligible.**

**Mitigation, and it is nearly free:** use **ρ at the step MIDPOINT** rather than its start. Rod
position is already integrated in Phase 1, so the midpoint rod worth is known without any extra
coupling — this is a second-order correction bought with arithmetic already on hand. **D3 should
specify midpoint-ρ, not start-of-step ρ**, which also means PWR2 is *more* accurate here than the
current engine, whose `CONTEXT.md` §11 coupling reads start-of-step reactivity.

### 15.4 A methodological note worth more than the finding

**My own verification script printed a conclusion contradicting the data one line above it** — it
asserted *"a scram-class ramp costs ~1e-4 relative"* as a hardcoded string while its own measured
value was **2.18e-1**, three orders out. I caught it only by reading the table rather than the
summary line.

**That is the recalled-band failure executed in code**: a conclusion written *before* the
measurement and not re-read against it. The generalised rule in D3 §1a — *any acceptance criterion
I choose that cannot fail* — now has a third form: **a summary line in a script is an acceptance
criterion, and it does not fail when the data disagrees with it.**

---

## 16. SUPERHEAT ANCHOR — first of three independent attempts (2026-08-13)

*(OWNER RULING, 2026-08-13: "Reformulate the superheat anchor. You could try deploying a few
agents that will try to find independent solutions.")* Three agents were given deliberately
different mandates. **This records the first to report; two are still running and the final choice
must wait for them.**

### 16.1 A C1-continuous formulation EXISTS and is cheap — "SBV"

**State the equation in SPECIFIC VOLUME, not density.** `v` is *exactly* linear in `h` in the
two-phase region and near-linear in the other two, so the state equation is piecewise-near-linear
with two **corners** — a slope problem, not a shape problem. Then on a narrow band around each
boundary, **blend the SLOPES** (quintic smoothstep, with the linear coefficient *solved* so the
value lands exactly on the right branch), leaving the pure branches untouched outside the bands.

| | measured |
|---|---|
| `∂ρ/∂h` left-vs-right gap | **5e-13 … 7e-8** relative (control: the committed form reads `*** KINK ***`, gap ratio 1.00) |
| `∂ρ/∂P` gap | 3e-13 … 5e-6 |
| **§12.4's live trap** (central vs one-sided `∂ρ/∂P`) | **0.91–1.00×**, against **25,000×** on the kinked form |
| Cost incl. **both analytic partials** | **28–60 ns** — **6.5× inside §13's 193 ns budget** |
| Accuracy outside bands | two-phase 0.000, superheat 0.0000, liquid ≤0.76 kg/m³ |

**It also removes §13's `P_sat`-as-a-fitted-polynomial trade** — no Newton anywhere — so L0's
one-curve-one-source-of-truth rule survives after all.

### 16.2 ⛔ BUT C1 IS A PROXY FOR THE WRONG REQUIREMENT — and this is the real finding

**The 166 kg residual is a CURVATURE problem, not a continuity problem.** The linearisation is
valid only while `band ≫ Δh_per_step`. Measured one-step residual, node sitting on `h_f`:

| P | kinked | SBV | gain |
|---|---|---|---|
| 15.41 MPa (2235 psi) | 14.0 kg (31 lb) | **1.6 kg** | 12.6× |
| 5.0 MPa | 73 kg | 27 kg | 3.7× |
| 1.0 MPa | 340 kg | 123 kg | 2.9× |
| **0.1 MPa (14.5 psi)** | 1280 kg | **615 kg** | **2.1× — still enormous** |

**And at larger steps SBV is WORSE**: Δh = 10 kJ/kg at 0.1 MPa gives 5068 kg against the kinked
form's 1680, because the smoothed tangent is steeper and the step leaps the whole band. When a node
jumps clean over the band, kinked and SBV are **identical to 3 significant figures.**

**The governing quantity is `h_dbl(P) = v_f·h_fg/v_fg`** — the enthalpy above `h_f` at which ρ
halves: **1.39 kJ/kg at 0.1 MPa, 191.6 at 15.41 — a 138× range.** Band/Δh is 5.3× at operating
pressure and **0.03× at blowdown pressure**. **No formulation escapes this**; the bound
`max|Δv| ≈ 0.156·b·Δs` is a property of mollifying a corner, not of the blend chosen.

> **THE GATE MUST BE `band ≥ k·Δh_max`, NOT CONTINUITY.** A formulation reporting *"C1: PASS"* at
> 0.1 MPa while the residual is unchanged at 615 kg is **a green gate over a live defect** — which
> is the exact failure mode this repo keeps re-learning. §11.2's proposed gate was asking for the
> wrong property, and would have certified a plant the solver still cannot integrate.

### 16.3 Three results worth keeping regardless of which attempt wins

- **Blending VALUES is structurally wrong** — it makes ρ **non-monotone** (heating *densifies* the
  fluid) once the slope ratio exceeds **5.76**, and measured ratios run **4.6× at 17 MPa to 3800×
  at 0.1 MPa**. It fails at every pressure. Blending slopes is monotone by construction.
- **Why no `cp_v` can fix `h_g` — the deeper reason.** Continuity requires
  `cp_v = h_fg/(T_sat_K·(1−ρ_g/ρ_f))`, and the leading term `h_fg/T_sat_K` **is the entropy of
  vaporisation** — a *Clapeyron* quantity. The two-phase slope at x=1 is set by **the slope of the
  saturation line**, not by any isobaric specific heat. **It is a category error, not a fitting
  failure.**
- **A single global bivariate fit is dead:** tensor Chebyshev over the whole envelope gives
  **168 % → 92 % max relative error for 32 → 300 terms.** Gibbs behaviour against a
  near-discontinuity; it will not converge.

### 16.4 Method findings — three of them change how the other work should be checked

- **A single left-vs-right derivative comparison cannot distinguish a kink from truncation error.**
  Only **step refinement** can: a kink holds its gap (ratio 1.00 over a 1000× step reduction),
  truncation falls linearly. The agent's own first C1 table misread a perfectly C1 point as a kink.
- **A central difference across a kink AVERAGES the two sides, which flatters the kinked model.**
  Its first residual table showed kinked and SBV identical, for exactly this reason.
- **An ITERATIVE INVERSE IS NOT A SMOOTH FUNCTION.** A tolerance-terminated Newton put a ~1e-2
  noise floor on the derivative at 15.41 MPa. **§13's adopted route uses a FIXED two-step Newton,
  which is smooth — that distinction is load-bearing and must be stated in the spec**, because
  "iterate until converged" and "iterate exactly twice" differ in whether the result is
  differentiable.

### 16.5 Physical honesty cost, declared

**Both kinks are real.** SBV erases the `h_f` kink and **over-reads void by 1.00 ± 0.05 percentage
points** at band centre. At 15.41 MPa the band spans 2.8 °F of subcooling while real
net-vapour-generation subcooling is tens of °F — **so the smoothing is NOT a subcooled-boiling
model and must not be sold as one.** UNSOURCED. Real water also has a kink at `h_g` (recalled
~2.4× slope ratio at 1 MPa); SBV erases that too, at ≤1.01 % of ρ_g.

**Still owed on this attempt:** `cp_v(P)` uses recalled anchors (max residual 1.02 kJ/kg·K) and the
`h_g` band width depends on it; the real-steam superheat slope ratio at `h_g` is recalled; and the
**2.8 kJ/kg per-step Δh that sets where the whole thing stops working is derived, not measured
against the engine's actual per-node distribution.**

---

## 17. SUPERHEAT ANCHOR — attempt 2 (accept-the-kink). Stronger, and it found real defects.

Third agent still running. **This attempt disagrees with §16 on smoothing and beats it on evidence.**

### 17.1 The kink is REAL — confirmed against published steam tables, and entailed by Clapeyron

Built from standard saturated tables using **only** `(T_sat, P_sat, v_f, v_g, h_f, h_g)`, deriving
`cp` and `β` along the saturation line, so no recalled property enters:

| P | ratio (tables) | ratio (repo lib) |
|---|---|---|
| 0.1 MPa (15 psia) | **4001×** | 3800× |
| 1.0 MPa (145 psia) | 308× | 319× |
| 7.0 MPa (1015 psia) | 30× | 24.5× |
| 14.6 MPa (2118 psia) | 7.7× | 5.7× |

**It cannot be an artifact.** Clausius-Clapeyron `dP/dT = h_fg/(T·v_fg)` makes the two-phase slope
at `h_g` equal `−ρ_g²/(T·dP_sat/dT)` — **fixed by the saturation curve alone.** Two independent
routes agree to 0.8–9.8 %. **The slope discontinuity is entailed by the saturation line existing.**

**Nuance the design must absorb: the two boundaries are NOT equally severe.** Against real
superheated tables the `h_g` kink is only **1.4–3.2×** and measured crossings there produce
**0.006 kg** residuals against **664 kg** at `h_f`. **`h_f` is the whole problem.**

### 17.2 "One-sided derivatives" is the WRONG fix — BRANCH-FREEZING is right

**The discontinuity lives in the `if`, not in the branch functions.** Each of the three ρ formulas
is smooth on the whole `(h,P)` plane. So: **pick the branch once from the state, differentiate
THAT function, and never re-run the regime test inside a difference.**

One-sided is measurably insufficient — **the boundary moves with P** (a liquid node stepped *down*
in P lands in two-phase: **758,203× error at 0.1 MPa**), **the correct direction differs per
partial and flips mid-envelope** (`dh_g/dP` changes sign near 3 MPa), and it is only first-order
anyway (16–48 % error). **Branch-freezing is ε-independent: 0.6437 at every ε from 1e-1 to 1e-6,
where naive runs 3991 → 23,855.**

### 17.3 ⛔ A PREREQUISITE DEFECT IN THE COMMITTED L0 — `h_l()` has a hidden fourth branch

```js
if (P_MPa <= Ps) return h_sat;              // <-- a regime test INSIDE the liquid branch
return h_sat + v * (P_MPa - Ps) * 1000.0;
```
This makes `h_l → T_from_h →` the liquid ρ branch **non-smooth across the saturation line**, so
**branch-freezing cannot work on the library as committed** (branch derivative drifts 0.96 → 1.42
as ε shrinks; stable to 5 dp with the clip removed). **L0 must expose unclipped branch
continuations for derivative evaluation.** This is a real bug in code already committed, proven by
injection, and **every other recommendation here is blocked on it.**

### 17.4 A second hazard the kink was concealing — a 263× cancellation

In a flashing node `dρ/dt` is a **small difference of two enormous terms**: measured
`−11,054 + 11,035 = −18.7`. Branch-frozen FD partials are ~0.2 % accurate **individually** and
**55–92 % wrong in the sum.** Fix: differentiate the *saturation-line* functions (all smooth in P)
and compose **analytically** — measured error **0.00 %**.

### 17.5 Regime crossing: SUB-STEP to it

| Option | Verdict |
|---|---|
| **Sub-step to the crossing** | **ADOPT.** Crossing time is **linear** in τ — one division, no iteration. **664 kg → 8.4 kg** (0.5 MPa); **0.86 → 4.7e-5 kg** (15.41 MPa). Residual goes O(dt) → ~O(dt^1.3). |
| Project onto the boundary | **REJECT** — discards 118–1312 kW (up to ~4 % of core power) and **chatters: 942–1999 crossings** vs 2. |
| Absorb in the corrector | Insufficient alone. `M_total` is integrated from sources, so **mass is conserved by construction** — the 166 kg is a *predictor* error, not lost mass — but at 26.9 kg/MPa that is ~6 MPa of correction in one step. |

**THE DAMAGE THE CORRECTOR CANNOT REPAIR — junction flows.** `ṁ_out = ṁ_in − V·dρ/dt` uses the same
partials and is never re-solved against anything:

| P, Q | true `ṁ_out` | naive | branch-frozen | analytic |
|---|---|---|---|---|
| 7.0 MPa, 300 MW | +492 kg/s | **−448 (sign INVERTED)** | 492 (0.0 %) | 492 (0.00 %) |
| 0.5 MPa, 300 MW | +375 kg/s | **−12,732 (3497 %, sign INVERTED)** | 282 (24.9 %) | 375 (0.00 %) |

**A sign-inverted surge means the model says a flashing node is DRAWING MASS IN while it is
expelling it — the exact mechanism §0.2 was rewritten to represent.**

**Bracketed Newton (rtsafe): adopt.** Honest result — plain Newton **did not fail** in ordinary
operation (0/30 trials, 0 bisections). In the adversarial regime (all nodes on `h_f`, water-solid)
the closure slope ratio reaches **148,597×** and plain Newton fails **305/504** at mean 38.7
iterations; bracketed **0/504** at 10.4. `F(P)` is monotone (0 decreasing steps in 3,360 samples),
so a bracket always exists.

**Cost: all five schemes within 4 % of each other.** Branch-freezing and sub-stepping are free.

### 17.6 The gate, rewritten — 7 checks, 7/7 passing, **7/7 injections correctly red**

**Delete** *"continuity of `∂ρ/∂h` across both regime boundaries."* Replace with:
**G1** ρ continuous at both boundaries (kept) · **G2** *each branch admits a smooth continuation
past its own boundary* — **the committed library FAILS this** · **G3** the kink's magnitude is
**pinned** against the exact HEM identity and published tables, so **smoothing is now a gate
FAILURE, not a fix** · **G4** partials are branch-frozen (behavioural, not a source scan) ·
**G5** `F(P)` monotone · **G6** two-phase partials survive the 263× cancellation ·
**G7** crossing-residual band, carrying its own negative control.

### 17.7 ✅ YOUR RULING WAS RIGHT — the superheat anchor IS wrong, independently of the kink

*(OWNER RULING, 2026-08-13: "Reformulate the superheat anchor.")* **Vindicated, for a reason I had
not identified.** §11.2's `ρ ∝ 1/T` branch is ρ-continuous at `h_g` by construction but its
**slope is 1.02× → 7.07× too shallow**, worsening with pressure, against published superheated
tables. **It is the same non-ideality `pwr2_water.js`'s own `rho_v` comment already rejected**
(*"ran 25 % low at 15.41 MPa… near-critical steam is nowhere near ideal"*) — **re-applied one
derivative up.** A real defect, independent of the continuity question, and still unfixed.

**Accepting the kink also has a payoff:** it frees `cp_v` to be the physically correct function.
§11.2's continuity gate would have forced `cp_v` to run **backwards**.

**Honest limits:** loop momentum was prescribed, no walls (so §12.1's τ ≈ 0.10 s constraint is
still unexercised), the bubble was fixed-volume (which §14.1 says is not a real pressurizer), and
the bracketing case is *constructed*, not a run that failed.

### 17.8 The framing itself was the error

> *"'smooth, accept, or reformulate' is a false trichotomy… three of my four findings — `h_l`'s
> hidden clip, the 263× cancellation, the 7× superheat slope error — are defects the continuity
> debate was CONCEALING, and none is a kink problem. Asserting the absence of physics is what
> stopped anyone looking at the branches themselves."*

**I wrote that trichotomy into the ruling request.** The gate demanded a property the physics does
not have, and the argument about how to satisfy it hid three defects in the branches underneath.

---

## 18. SUPERHEAT/KINK RESOLVED — ATTEMPT 3 WINS. Delete §11.1; the derivative was the defect.

Three independent attempts, one clear answer. **Attempt 3 subsumes attempt 2 (accept the kink) and
refutes attempt 1 (smooth it): if you never differentiate ρ, the kink cannot hurt you.**

### 18.1 No state variable can help — a coordinate invariant, proven and measured

For any state `σ = φ(h,P)` with `φ` smooth in `h`, the chain rule gives `∂ρ/∂σ = (∂ρ/∂h)/(∂φ/∂h)`
and `∂φ/∂h` is **continuous** at `h_f` — so it **cancels from the ratio**:

| P | h | quality | entropy | h^1.7 | **internal energy** |
|---|---|---|---|---|---|
| 0.1 MPa | 3792 | **3792** | **3792** | 3792 | **4100** |
| 15.41 MPa | 5.74 | 5.74 | 5.74 | 5.74 | **6.49** |

**Quality and entropy are exactly invariant — zero gain. Internal energy is 8–13 % WORSE.**
`(ρ,e)` with per-node pressure returns acoustics: liquid c = 932 m/s, **dt ≤ 0.002 s, 10× more
steps, 39–65 s against a 15 s budget.** **`h` stays** — precedented in CTF/COBRA-TF, VIPRE, APROS,
Modelica.

### 18.2 THE FIX — eliminate the derivative by never taking it

With §2's corrected `V·dP/dt` term, the energy equation integrates to a form **exactly affine in P
whose coefficient needs no property derivative at all**:

```
h_i(P) = a_i + v_i·(P − P_n)      v_i = V_i/m_i = THE SPECIFIC VOLUME   ← exact, not a partial
F(P)   = Σ V_i·ρ(a_i + v_i(P−P_n), P) − M_total = 0    ← bracketed 1-D root-find
ṁ_out,i = ṁ_in,i − (V_i·ρ_i^{n+1} − m_i^n)/dt          ← an exact mass DIFFERENCE
```

**Why the kink cannot corrupt it — a theorem.** Moving `P` at fixed `a_i` moves `h` along
`dh = v·dP`, which **is the isentrope**. Therefore `dF/dP = Σ V_i/c_i² > 0` by thermodynamic
stability — **verified to 2.5e-10**. `F` is continuous (ρ is continuous, 6.1e-10 at `h_f`) and
**strictly monotone: 0 non-monotone samples in 4,000**, including cases where the slope spans
**17,000×**. A bracketed solve on a continuous monotone function converges however violent the
derivative jump is.

### 18.3 Head-to-head — 8-node loop, same physics, same dt

**A1** = §11.1 as written · **A2** = §12.2's 3-march fix at its strongest · **B** = proposed.

| case | A1 | A2 | **B** |
|---|---|---|---|
| small break, 400 s | 153 kg | 10.8 kg | **5.9e-8 kg** |
| through the kink, 250 s | 492 kg | **941 kg — WORSE than A1** | **1.0e-7 kg** |
| blowdown, deep void | **7,000 kg (47 % of inventory), STALLS** | 604 kg | **1.0e-7 kg** |
| evals/node/step | 8 | 24 | **5–7** |

**Timestep convergence — the single strongest result:**

| dt | A1 | A2 | **B** |
|---|---|---|---|
| 0.005 s | 11.10838 | 11.10933 | **11.27867** |
| 0.1 s | 11.00133 | 11.00055 | **11.27824** |
| 1.0 s | **DIVERGED** | **DIVERGED** | **11.27405** |

**B varies 0.67 psi across a 200× dt range; A varies 32.6 psi over 80× and diverges at 1.0 s.**
**B is converged; A is not** — and §12.1's "largest stable dt 0.2 s, 10× margin" was measuring
A-family behaviour. **Cost: B needs NO partials — 3.91 s vs 11.73 s, a 3.8× margin**, and it
survives §14.2's plug-flow multiplier that §13 said would consume everything.

### 18.4 §12.2's diagnosis was INCOMPLETE, and §0's justification is CIRCULAR

- **The affine failure needs no donor-cell reversal.** Measured with **zero flow anywhere**: 50.3 %
  error with one node on `h_f`, **999.1 % mixed-regime at 145 psia.** The cause is the ρ-kink
  itself. **"Three re-linearisations" is not a fix — it is an unsafeguarded iteration**, and it
  measured *worse* than no fix on the kink case.
- **§0's reason is circular.** *"In a rigid node V is fixed and ρ = ρ(h,P), therefore m is
  determined"* treats `P` as externally given, but `P` is a property of the node's own state.
  **Rigidity reduces nothing.** The reduction comes **entirely from the one-pressure ruling**,
  which imposes N−1 constraints — measured at **53–529 psi of node-pressure disagreement per
  step**. The conclusion survives; the argument does not. **And §0.4's claim that volume closure
  "can no longer fail" is WRONG** — it reached **7,000 kg, 47 % of inventory**, in the prototype.

### 18.5 Production codes corroborate — sourced, verbatim

- **RELAP5/MOD3 (NUREG/CR-5535 §3.4.6) has this exact bug and it has a NAME — "water packing":**
  *"The cause of the anomalous pressure spikes is the discontinuous change in compressibility…
  The density-pressure relationship used to calculate the new time pressure is based upon the
  beginning of time step values for the state properties and derivatives."* And decisively:
  **"The same problems are seen using a two-fluid model or the homogeneous equilibrium model."**
  That is A1's 7,000 kg stall, documented in a 1995 NRC manual.
- **RELAP5's remedy is UNAVAILABLE to us.** Its metastable extrapolation (§3.2.2, capped at 50 K
  and policed by timestep rejection) works because RELAP5 is **two-fluid** — each phase has a
  continuous branch to extrapolate along. **Under the ruled HEM there is no metastable state; the
  mixture IS the discontinuity.** Adopting RELAP5's fix means abandoning the HEM ruling.
- **TRACE (ML071000097) is scheme B's principle in a production code:** *"The nonlinear equations
  are not simply replaced by a linearized approximation, as is done in RELAP5."*
- **TRACE also kills `(ρ,e)` on our exact grounds:** *"Density is not a good choice because of the
  need to model liquid solid regions… a small error in a solution for density can translate to a
  significant error in pressure."*
- **A 2023 MERL patent (US 11,739,996 B2) refutes attempt 1 from the literature** — its remedy is
  saturation-aligned coordinates with knots **on** the saturation curve at continuity degree 0,
  i.e. **represent the kink**, warning that smoothing *"create[s] inaccurate derivatives in
  single-phase regions."*
- **ThermoCycle names our failure mode in an enthalpy-state code:** *"the main discontinuity is
  often the density derivative on the liquid saturation curve. Simulation failure or stiff systems
  can occur if the cell-generated (and purely numerical) flow rate due to this discontinuity causes
  a flow reversal."* Its four remedies each cost something — filtering *"affects the energy
  balance"*, smoothing *"might cause a mass defect."* **Scheme B pays none of them.**
- **The published WHY for (p,h)** — Hirsch/Eck/Steinmann, 4th Modelica Conf. 2005: *"Using
  temperature T instead of h is not possible since temperature and pressure are directly linked in
  the two-phase region. The steam fraction x can not be used since it is not defined in the single
  phase regions."*

### 18.6 The property table — store `v`, not `ρ`

`v_mix = v_f(P) + x·v_fg(P)` is **exactly linear in quality** under HEM. Tabulate on **(quality, P)
with x = 0 and x = 1 as exact grid lines**, so no cell straddles the boundary and the kink lands
*on* a node line instead of being averaged away. **161 × 69 = 87 kB, 50 ns**, max error **0.06 %** —
10× tighter than the correlations it interpolates — and **the kink is reproduced** (6.0 vs exact 5.7
at 2235 psia), not smeared. **A ρ-table is 762 % wrong at 0.12 MPa.**

### 18.7 Rulings recommended

1. **Keep `h`.** 2. **Delete §11.1's affine march; bracketed root-find on the exact closure; never
compute `∂ρ/∂h` or `∂ρ/∂P` in the hot path.** 3. **Gate ρ-continuity + `dF/dP > 0`; delete the
`∂ρ/∂h` continuity requirement.** 4. **Tabulate `v` on (quality, P).** 5. **Correct §0's
justification** — the DOF count is right, the reason is the one-pressure ruling, and the closure
residual **can** fail.

**What it costs:** *"non-iterative"* is dead (1–7 iterations, typically 2–3); one new explicit lag
on junction expansion flows; §§1, 2, 4, 11.1, 11.2 all need edits. **Untested:** walls (§9's
τ ≈ 0.10 s is still the binding constraint and no prototype has any), the pressurizer pair,
kinetics coupling, two-momentum-DOF lineups.

**And §14.1 is over-determined** — the RCS mass ledger *and* `V_liq + V_steam = V_pzr` are two
equations for one `P`. Flagged, not investigated.

> **The framing error, in the finding agent's words:** *"The 3,812× number was read as a defect to
> be engineered away. It is a first-order phase transition — the thing a LOCA IS. Every hour spent
> making it smooth is spent making the sim less able to teach flashing. The kink is not the
> problem; taking its derivative was."*

---

# 23. THE RULED DESIGN — consolidated, and the only section to build from

Everything above is history. This is the design as ruled on 2026-08-13.

## 23.1 State

| | |
|---|---|
| **Per node** | `h` specific enthalpy · `T_wall[]` (1..N lumps) — **NOT `m`** |
| **System** | `M_total` (one integrated mass scalar, sources/sinks only) · `ṁ_loop` (one momentum state) · `P` (**solved**, not integrated) |
| **Pressurizer** | the ONE exception — `m_liq, h_liq, m_steam, h_steam` are genuine states, because its regions' volumes are free (§14.1) |
| **Derived** | `m_i = ρ(h_i,P)·V_i`, T, ρ, quality, void, level, flow fraction |

**Why `m` is not a node state:** a rigid node has one thermal DOF. **The DOF reduction comes from
the one-pressure ruling** (which imposes N−1 constraints), *not* from rigid volumes — §0's original
argument was circular and §18.4 corrects it. The conclusion stands; the reason changed.

## 23.2 The step

```
1  GATHER     evaluate all fluxes from state at time n. Write nothing.
2  SOLVE P    F(P) = Σ V_i·ρ(a_i + v_i(P−P_n), P) − M_total = 0
              a_i = h_i^n + dt·[ṁ_in(h_don − h_i^n) + Q_i]/m_i^n
              v_i = V_i/m_i^n        ← THE SPECIFIC VOLUME. Exact. Not a partial.
              BRACKETED root-find, warm-started at P_n, CAPPED AT ~8 ITERATIONS
3  INTEGRATE  advance h_i, T_wall, ṁ_loop, M_total to n+1
4  JUNCTIONS  ṁ_out,i = ṁ_in,i − (V_i·ρ_i^{n+1} − m_i^n)/dt    ← an exact mass DIFFERENCE
```

**`∂ρ/∂h` and `∂ρ/∂P` are NEVER computed in the hot path.** That is the whole point: the saturation
kink is real physics (confirmed against steam tables and entailed by Clausius-Clapeyron), and the
defect was never the kink — it was taking its derivative.

**Why the kink cannot corrupt this, as a theorem:** moving `P` at fixed `a_i` moves `h` along
`dh = v·dP`, which **is the isentrope**, so `dF/dP = Σ V_i/c_i² > 0` by thermodynamic stability.
`F` is continuous and strictly monotone, so a bracketed solve converges however violent the
derivative jump is. Verified to 2.5e-10; **0 non-monotone samples in 4,000.**

**The cap is what makes it real-time-safe.** A bracketed solve on a monotone function is the one
iterative scheme whose **worst case is bounded** — when the cap binds, the bracket width bounds the
error. This is **nearly-implicit** in character, the row every real-time code occupies.
**"Non-iterative" is dead.** Typical 2–3 iterations; cap 8, matching CATHARE-2/SCAR's budget.

## 23.3 Flow

- **ONE integrated loop momentum state** — a declared departure from the entire educational tier
  (nobody else solves transient momentum), kept because it makes RCP coastdown derived from sourced
  pump inertia and natural circulation `W ∝ Q^⅓` emergent, rather than fitted.
- **The number of momentum states = the flow graph's cyclomatic number** (§14.3). Normal lineup 1;
  **RHR-aligned with the RCP off is 2.**
- **Junction flows inside the loop are algebraic** (§23.2 step 4). **All branches — surge, spray,
  CVCS, ECCS, relief, break — are quasi-steady**, because orifice-class junctions have collapsed
  `L/A` and explicit momentum there is unstable by ~3 orders.
- **Two-phase friction multiplier** `φ² = 1 + x(ρ_f/ρ_g − 1)`, entailed by HEM. **UNSOURCED.**
- **CCFL as a junction cap** at cold-leg→downcomer and core→lower-plenum (D3 §8). A **declared
  departure** — a correlation, because HEM cannot generate counter-current flow. Constants
  **unsourced** for our geometry.

## 23.4 Properties

Three regimes — subcooled / two-phase / **superheated** (the `[0,1]` quality clip foreclosed every
meltdown path). **Tabulate `v`, not `ρ`, on `(quality, P)` with x = 0 and x = 1 as exact grid
lines**, so the kink lands *on* a node line rather than being averaged away: 87 kB, 50 ns, 0.06 %,
kink **reproduced**. A ρ-table is 762 % wrong at 0.12 MPa.

**Smoothing belongs in the CORRELATION layer, never the state equation** — §22.3's highest-value
open item, and where two production codes thirty years apart independently put the fix.

## 23.5 Kinetics

Point kinetics, 6 delayed groups, **frozen-ρ analytic integration** (7×7 matrix exponential) — not
sub-stepping, which would violate the two-phase step. **Use ρ at the step MIDPOINT**, not its start:
freezing at the start costs a few percent per step at scram rates, and rod position is already
integrated in Phase 1 so the midpoint is free.

## 23.6 The acceptance bar

**Not a residual in kg.** Directional correctness · no missed alarm · no spurious alarm · all nine
Tier A couplings expressible · **conservation as a budget** (NEI 09-09 §3.9: *"within the limits of
the verification, validation, and performance testing criteria"*) · local time lag < 1 s and global
< 1 % of simulated time.

## 23.7 Known costs, declared

| | |
|---|---|
| **HEM** | A shipped real-time code holds two-energy is *"much more mechanistic and numerically stable"*. Our 3,800× slope ratio, 263× cancellation and sign-inverted junction flow are all consequences of one energy equation. Ruled to stand; cost recorded (§21.2). |
| **Momentum** | No Tier A coupling requires it. Kept as a means-of-derivation argument. |
| **CCFL** | A correlation, not emergent physics. |
| **Node count** | Krško's coarse model **crossed an ECCS setpoint** the fine one never reached, from having two volumes where PWR2 has more — node count is a curriculum decision, not a performance one. |
| **The boundary is not "solved"** | RELAP5-3D took **three decades** to stop aborting at the one-phase/two-phase transition and a 2026 paper still lists it as a headline fix. §17.5's 8.4 kg came from one node at four pressures. **That is a sample, not coverage.** |

---

## 24. THE THREE UNTAKEN MEASUREMENTS (2026-08-13)

Plan item 4. None had been computed; all three produce design constraints.

### 24.1 Material Courant number — comfortable at rated, and it CONSTRAINS `K`

`C = ṁ·dt/(ρV) = dt / residence_time`. **Janosy's node-sizing rule `V_node ≥ Q_max·dt` is the same
criterion** (`C ≤ 1`), so one calculation answers both.

At rated 1639 kg/s (2.322 m³/s):

| Node | Residence | **C at dt = 0.02** | margin |
|---|---|---|---|
| SG primary | 3.163 s | 0.0063 | 158× |
| Core | 0.887 s | 0.0226 | 44× |
| Crossover | 0.666 s | 0.0300 | 33× |
| Hot leg / RCP | 0.344 / 0.343 s | 0.058 | 17× |
| **Cold leg — BINDING** | **0.310 s** | **0.0646** | **15.5×** |

**At rated flow the Courant limit is comfortable.** No node is close.

**But plug sub-cells divide the volume, so `K` is a STABILITY parameter, not only the budget
parameter §14.2 made it:**

| K | sub-cell residence | C | |
|---|---|---|---|
| 5 | 0.0620 s | 0.323 | ok |
| **8** | 0.0387 s | **0.516** | **marginal** |
| 20 | 0.0155 s | **1.291** | **VIOLATES** |

**`K ≤ 8` on the binding node.** §13's performance budget independently pointed at `K ≈ 5`;
**two unrelated constraints converge on the same ceiling**, which is a useful check on both.

**And the transient case is where it bites.** At constant *mass* flow, a voided node has ~7× the
velocity:

| Cold leg at | Residence | C |
|---|---|---|
| ρ 706 (liquid, rated) | 0.310 s | 0.065 |
| ρ 300 (flashing) | 0.132 s | 0.152 |
| ρ 100 (heavily voided) | 0.044 s | **0.456** |

**This independently reproduces the test agent's "Courant ≈ 1 during blowdown" finding** by a
different route. With `K = 5` on top, a voided cold leg would exceed 1. **The plug flag and the
void regime interact, and neither §13 nor §14.2 saw it.**

### 24.2 ⛔ THE TIME DEFICIT IS REAL — `simTime` advances unconditionally

`layers/simulation_service.js:370`:
```js
this.simTime += steps * PHYSICS_DT;      // UNCONDITIONAL
```
against the loop at `:325–330`:
```js
for (var i = 0; i < steps; i++) { … this.engine.step(PHYSICS_DT); }
```

**The service credits a full `PHYSICS_DT` per iteration no matter what the engine did internally.**
So if §17.5's crossing sub-step advances the physics to the boundary and stops — the natural
implementation — **the plant's clock runs ahead of its physics, silently, with nothing to repay
it.** Nothing in the service can detect this; `simTime` is an accumulator, not a measurement.

**THE DESIGN RULE THIS FORCES, and D2 §17.5 does not state it:**

> **`engine.step(dt)` MUST advance the physics by exactly `dt`, however it subdivides internally.**
> A crossing sub-step must run to the boundary **and then continue to the end of the step**. It may
> never return early.

**This is the exact inverse of the analysis-code pattern**, where the correct response to trouble is
to reject the step and retry shorter. **Here the step is a contract with the clock and it cannot be
broken** — which is the same distinction (analysis code vs simulator) that §§19–21 found everywhere
else.

*Note the industry's alternative: IAEA/MAAP4 and Modelica both **let the frame slip and then repay
the deficit**. That is a legitimate second design, but it requires the deficit to be **measured**,
and PWR2 currently has no quantity that measures it. The rule above avoids needing one.*

### 24.3 Node sizing — answered by 24.1

`V_node ≥ Q_max·dt` is satisfied with 15.5× margin at the binding node at rated flow, and is the
same constraint as the Courant number. **The rule to record for D3: size sub-cells, not nodes** —
the nodes are comfortable; only their subdivision approaches the limit.

---

## 25. §14.1's PRESSURIZER CLOSURE — resolved. It WAS over-determined; the fix is one state fewer.

Flagged by two independent reviewers and never investigated. **The objection was correct.**

### 25.1 The error

§14.1 gave the pressurizer **four** states — `m_liq, h_liq, m_steam, h_steam` — with
`V_liq = m_liq/ρ_l`, `V_steam = m_steam/ρ_v`, and the constraint `V_liq + V_steam = V_pzr`.
But the global closure **also** needs `M_total = Σ ρ(h_i,P)V_i + m_pzr`. **Both constrain `P`.
Two equations, one unknown.**

**The error: `m_liq` and `m_steam` are not independent — the volume constraint links them.**

### 25.2 The fix — three states, not four

```
STATES    h_liq, h_steam, m_pzr                          (three)
DERIVED   V_liq = (m_pzr − ρ_v·V_pzr) / (ρ_l − ρ_v)      one division, no iteration
          V_steam = V_pzr − V_liq ;  m_liq = ρ_l·V_liq ;  m_steam = ρ_v·V_steam
```

Verified numerically at 15.41 MPa, `V_pzr` = 4.13 m³ — `m_liq + m_steam` reproduces `m_pzr`
**exactly** at every point tested, and the physical bounds fall out of the formula rather than
being imposed:

| | |
|---|---|
| all steam | `m_pzr = ρ_v·V_pzr` = **398.9 kg** → `V_liq` = 0 |
| **water solid** | `m_pzr = ρ_l·V_pzr` = **2444.4 kg** → `V_liq` = `V_pzr` |
| divisor `ρ_l − ρ_v` | **495.3 kg/m³** — degenerate only at the critical point, far outside the envelope |

**The pressurizer now contributes exactly ONE mass term to the global closure, like any other
node — and the over-determination is gone.**

**And its two-region character survives**, which is the whole reason §14.1 wanted the split:
`h_liq` and `h_steam` remain independent states, so **spray acts on the steam and heaters on the
liquid** — precisely what HEM in a single node cannot express, and what #472 needs.

### 25.3 A second finding the test surfaced — the bounds are REGIME TRANSITIONS, not clips

Beyond 2444.4 kg the linear split returns `V_liq > V_pzr` and **`m_steam` negative** (measured:
−69.4 kg at 2800 kg, −88.9 at 2900). That is not a formula defect — it is the formula correctly
reporting that **the pressurizer has gone water-solid** and the two-region model no longer applies.

**So the bounds must be handled as regime transitions, not clamped silently:**

- `V_liq ≥ V_pzr` → **WATER SOLID.** The bubble is gone; system compressibility collapses to the
  liquid bulk modulus. **This is exactly the regime where §0.3's measured `dM/dP` falls 26.9 →
  10.6 kg/MPa**, and where §21.4's stability margin is thinnest.
- `V_liq ≤ 0` → **pressurizer emptied of liquid.** Heaters must be shed (they are already, by
  §22's ESF logic) and the level instrument reads off-scale low.

**Both are real plant states with real operator consequences, and both need declaring rather than
clipping** — a silent clamp here would produce a pressurizer that cannot go solid, which is a
behaviour the TMI curriculum depends on.

**This is the third instance of the same pattern today** (after §11.2's gate and §16.2's band): **a
bound that looks like a numerical guard is actually a physical regime boundary.** Worth stating as
a standing rule for the build — *before clipping anything, ask what the plant is doing when the
clip engages.*

---

## 26. CORRELATION INTERPOLATION WINDOWS — sized. And a structural low-pressure limit, declared.

D5 §6.4 established that smoothing belongs in the correlation layer and collected the prior art.
This sizes PWR2's own windows — the last specification item that did not need external sourcing.

### 26.1 RELAP5's RULE transfers. Their VALUE does not.

RELAP5 blends the choking sound speed over `1e-5 < α < 0.10`, chosen *"so that it would require
several time steps to traverse the interpolation region."* **Their reasoning is right and their
number is not portable**, because the enthalpy width of a fixed void window collapses with
pressure. Core node, 300 MWt, dt = 0.02 → **Δh = 4.13 kJ/kg per step**:

| P (MPa) | ρ_f/ρ_g | Δh to reach α = 0.10 | **steps to cross** |
|---|---|---|---|
| **0.1** | **1629** | 0.139 kJ/kg | **0.03 — a thirtieth of one step** |
| 0.5 | 338 | 0.619 | 0.15 |
| 1 | 173 | 1.166 | 0.28 |
| 5 | 31 | 5.344 | 1.29 |
| 10 | 12 | 10.595 | 2.57 |
| **15.41** | **6** | 16.030 | **3.88 — as intended** |

**`ρ_f/ρ_g` runs 6 → 1629 across the envelope**, so a fixed α window is ~4 steps wide at operating
pressure and **essentially instantaneous at blowdown pressure** — where it is needed most.

### 26.2 The specification — denominate the window in ENTHALPY

```
window = min( k·Δh_step ,  f·h_fg(P) )        k ≈ 5, f a small fraction (TBD)
```
applied about each regime boundary, with `Δh_step` evaluated from the node's own current heat rate
rather than a global constant. **Both bounds are required**, and the second is not a safety belt —
see §26.3.

Targets, all currently unwindowed in PWR2: §9's film-coefficient regimes (single-phase → nucleate
boiling → CHF → film boiling), critical/break flow, and D3 §8's CCFL cap engagement.

### 26.3 ⚠ A STRUCTURAL LOW-PRESSURE LIMIT — declare it, do not engineer around it

At 5 × Δh_step the window spans **the entire two-phase region** below ~1 MPa (α reaches 1.000).
**That is not a window failure.** It is the model reporting that **a low-pressure node flashes
through the whole two-phase regime in about five timesteps.** No interpolation can smooth a region
narrower than the step that crosses it.

**Three independent routes now converge on this same limit:**

| Route | Finding |
|---|---|
| §16.2 (property side) | band/Δh is 5.3× at 15.41 MPa and **0.03× at 0.1 MPa** — *"no formulation escapes this"* |
| §24.1 (Courant) | a heavily voided node reaches **C = 0.456**, and with plug sub-cells would exceed 1 |
| §26.1 (correlation side) | the two-phase region is **< 5 steps wide** below ~1 MPa |

**Three different analyses, three different denominators, one conclusion: PWR2 has a resolution
limit at low pressure that is structural, not a defect.** It should be **declared** —
`DESIGN_COMPANION` §8 — rather than chased:

> **Below roughly 1–2 MPa (150–290 psia), PWR2 resolves the liquid/two-phase transition at the
> limit of its timestep. Late-blowdown and low-pressure behaviour is directionally correct and
> quantitatively coarse.** Sub-stepping (§17.5) and the bracketed closure (§23.2) keep it *stable*
> and *conservative*; they do not make it *accurate*.

**And that is an acceptable declaration under the ruled acceptance bar** (§22.2 / D5 §6):
directional correctness and alarm fidelity are achievable there; a tight mass residual is not, and
is no longer what PWR2 is judged on. **Under the OLD bar this limit would have read as a failure.
Under the ruled one it is a declared scope boundary** — which is the clearest illustration yet of
why that ruling mattered.

**What it costs, stated plainly:** the late stages of a large LOCA — reflood, long-term
recirculation — are the least trustworthy part of this plant. **That is worth knowing before a
scenario author builds a mission on them.**
