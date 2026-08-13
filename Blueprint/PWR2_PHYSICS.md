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
| **State (integrated)** | `m` mass · `h` specific enthalpy · `T_wall[]` metal temperature, 1..N lumps |
| **Fixed (geometry)** | `V` volume · `z` centroid elevation · `M_wall` metal mass · `A` wetted area · `cp_wall` |
| **Derived each step** | `T`, `ρ`, `x` (quality), `α` (void fraction) — all from `h`, `P` via L0 |
| **Per-node flags** | `transport: plug \| stirred` · `wallLumps: N` |

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
mass      dm/dt      = Σ ṁ_in − Σ ṁ_out
energy    d(m·h)/dt  = Σ ṁ_in·h_in − Σ ṁ_out·h_out + Q_wall + Q_src
wall      M·cp·dT_w/dt = −Q_wall          Q_wall = h_film·A·(T_wall − T)
state     T, ρ, x    = f(h, P)            [L0, engines/pwr2/pwr2_water.js]
```

**The assertion that justifies the whole rewrite:** on a closed loop with no sources, total mass
and total energy are conserved **to machine precision**. `engines/pwr/` cannot make this claim in
any form — it has no mass and no enthalpy. This is D5's Layer-1 gate.

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

## 3. Q1 — How is flow computed? **ANSWER: full junction momentum.**

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

## 5. Pressure — one RCS state, per-node void (ruled)

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

The buoyancy term `ρ g Δz` is already in the momentum equation, and node densities are real (L0).
With ~55 ft (16.8 m) between RCP suction and SG tube top (`PWR_LOOP_GEOMETRY.md` §5) and
Δρ = 74 kg/m³ at rated ΔT, buoyancy head is 12.2 kPa against ~0.5 MPa of rated loop friction.

Balancing buoyancy against friction, with ΔT = 33·(q/w) by the energy balance:
```
w³ = (buoy_rated / Δp_rated) · q
```

| Decay heat | Emergent flow |
|---|---|
| 2 % | 7.9 % of rated |
| 5 % | 10.7 % |
| 10 % | 13.5 % |

**The cube-root law is not a correlation PWR2 imposes — it falls out of the momentum balance.**
Today it is asserted (`Manuals/12` §12.4 notes the shape is sourced but *"the SCALE is this
plant's and is fitted"*). In PWR2 both come from geometry.

*Design analysis on design values, not a measurement of a built plant (HR12). The magnitudes are
the same family as real-PWR natural circulation; the exact number depends on rated loop ΔP, which
D3 fixes.*

---

## 7. Q3 — Surviving one-step-old couplings. **ANSWER: target 2, from ~23.**

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
