# PWR2 — Physics Core (D2)

**Status:** DESIGN, for review. Nothing built. #479. Spine: `PWR2_DESIGN.md`.

The generic model — primitives, equations, integration — independent of this plant.
The SLS-100 wiring is D3 (`PWR2_PLANT.md`).

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
`{from, to, ṁ, K, Δz, L, A}`. Carries **one integrated state, `ṁ`** (see §3).

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

### 11.1 The `dP/dt` circularity — resolved EXACTLY, no lag

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
