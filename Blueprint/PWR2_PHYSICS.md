# PWR2 — Physics Core (D2)

**Status:** DESIGN, for review. Nothing built. #479. Spine: `PWR2_DESIGN.md`.

The generic model — primitives, equations, integration — independent of this plant.
The SLS-100 wiring is D3 (`PWR2_PLANT.md`).

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
