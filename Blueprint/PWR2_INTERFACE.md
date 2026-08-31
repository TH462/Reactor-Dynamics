# PWR2 — Interface and Shim (D4)

**Status:** DESIGN, for review. Nothing built. #479. Spine: `PWR2_DESIGN.md`.

Ruled: **PWR2 publishes what its physics naturally produces; a shim maps to the existing 109
`true_state` fields.** This document defines both sides and the map.

---

## 1. Native state — what PWR2 actually owns

**CORRECTED 2026-08-13** to match D2 §0 — the original listed `m` per node and `mdot` per
junction, both of which were the over-determination.

```
nodes[]      { id, h, T_wall[],   V, z, M_wall, A, transport, wallLumps }   <- h only
M_total      ONE integrated mass scalar (sources/sinks only)               [D2 §0.3]
mdot_loop    ONE integrated loop momentum state                            [D2 §0.2]
P_rcs        SOLVED each step from M_total = SUM rho(h_i,P)*V_i + m_pzr(P)
junctions[]  { id, from, to, K, dz, L, A }        <- no mdot state; loop flows ALGEBRAIC,
                                                     branches quasi-steady
kinetics     { P, C[6], I, X, H[4] }             formulation reused
rods         { groups[] }                        formulation reused
chemistry    boron as a TRANSPORTED SCALAR per node   [not a lumped ppm + fitted lag]
control      valve/pump/handswitch positions, setpoints
failures     active malfunctions
```

Everything else — **node mass**, temperature, density, quality, void, level, subcooling, ΔT, flow
fraction — is **derived on demand** from `(h, P)` through L0. **The native state has no derived
quantity in it.** That is the single biggest structural difference from the current engine, whose
`s` object mixes ~200 integrated and derived values with no marking of which is which — and it is
what makes the closure residual (D5 Layer 1) a meaningful assertion rather than a tautology.

---

## 2. Q7 — the shim map: natural / translation / proxy

Every one of the 109 falls in exactly one class. **The proxy rows are this document's most
valuable output** — they are precisely where the A/B *should* diverge, and predicting that in
advance is what makes divergence interpretable instead of alarming.

| Class | Meaning | Expected A/B behaviour |
|---|---|---|
| **natural** | PWR2 produces it directly | Agree within numerical tolerance |
| **translation** | Same physical meaning, computed by a different route | Small, explicable divergence |
| **proxy** | The old field was a **fitted stand-in** for a quantity the old engine could not compute | **Divergence is the point** |

### Group summary

| Group | n | Dominant class | Note |
|---|---|---|---|
| Core / neutronics | 9 | natural | Formulation reused |
| NIS truth | 3 | natural | |
| Primary thermal | 10 | **translation** | `tavg_c` becomes a mass-weighted average of node temperatures, not a state |
| Primary inventory / void | 5 | **PROXY** | see below |
| RCPs | 5 | translation | `pump_flow_pct` derives from junction ṁ, not a fitted curve |
| Pressurizer | 9 | translation | #472 owns the model |
| SG / secondary | 9 | **mixed** | `sg_mass_frac` proxy; rest translation |
| Feed / condensate / AFW | 8 | natural | |
| ECCS / RHR | 12 | natural | Junction flows |
| CVCS | 2 | natural | |
| BOP / turbine | 12 | natural | Formulation reused |
| Load control | 4 | natural | |
| Damage | 6 | translation | |
| Plant status | 4 | natural | |
| Containment | 12 | natural | Already node-shaped |

### The proxy rows, named

| Field | Today | PWR2 | Consequence |
|---|---|---|---|
| `primary_void_fraction` | `clip((1−mass)·void_gain)` — a **fitted function of inventory deficit**, gated on saturation. Not a computed void. | Real void from node quality: `α = x·ρ_mix/ρ_g` | **Will diverge in every voiding transient.** The old form cannot represent void that is *local* — a voided hot leg with a liquid-full core reads the same as the reverse. |
| `pzr_mass_frac` | Pressurizer mass over nominal, with level from a 3-constant affine law | Node mass directly | Diverges wherever the affine law was the approximation |
| `sg_mass_frac` | Secondary mass over nominal, level via a piecewise `sg_mass_map` | Lumped SG node mass | Level geometry map is retained (it is sourced); the mass is now real |
| `core_void_fraction` | Separate flux-driven boiling term | Core node quality | Two drivers become one |
| `natural_circulation` | Boolean from a fitted `naturalCircFlow` | `true` when loop ṁ is buoyancy-driven with pumps off — **emergent** (D2 §6) | |

**A prediction the A/B should test, stated in advance so it cannot be rationalised afterwards:**
`primary_void_fraction` should track the old value closely in a *uniform* voiding transient and
diverge sharply in a *localised* one (a hot-leg break vs a cold-leg break at equal severity).
If it does not diverge there, either the topology is not doing its job or the old proxy was
better than believed.

---

## 3. Commands — 62 cases

| Class | Note |
|---|---|
| **Direct** (majority) | Valve/pump/setpoint commands set control state; physics reads it. No change. |
| **Re-homed** | Commands that today write a *derived* quantity (e.g. anything setting a flow fraction directly) must instead set the actuator that produces it — a valve position or pump demand. |
| **Failure injection** | `inject_failure` / `set_instrument_failure` unchanged in surface; a **break** now additionally carries a **location** (which node), where today it is a scalar severity plus one destination flag. |

**The break-location parameter is the only genuine surface addition**, and it should default to the
current implicit location so existing scenarios keep working unchanged.

**22 commands are engine-only with no `CONTEXT.md` §6.7 entry.** That is a pre-existing
documentation gap; PWR2 should not inherit it silently — document them as they are implemented.

---

## 4. The other contract surfaces

| Surface | Requirement |
|---|---|
| `getProtectionConfig()` | `pwr_control.js:1730` **writes** `RD.PWR_CONFIG.protection`, and the engine hands it back. PWR2 must expose the same object, sourced the same way. **This is a coupling to confirm early — it is inverted from what the name suggests.** |
| `engine.instruments.reading` | `control_kernel.js:512` reads this **directly**, bypassing `getInstruments()`. PWR2 must expose an `instruments` member with a `reading` map. |
| `getInstruments()` | Reuse `pwr_instruments.js` **unchanged** — it consumes published truth and adds lag/noise/failure. PWR2 changes nothing here. |
| `getControlState()` | 42 keys incl. `rod_groups[]`, `pumps[]`. Mostly native. |
| `getStartupLineup()` | Optional (guarded at the call site). Carry over. |
| `RD.pwrScruve` / `pwrScruveSlope` | **`pwr_control.js` calls these** for rod-channel gain scheduling. PWR2 must keep the exports or the control layer breaks. Easy to miss — they are engine exports consumed by a *layer*. |

---

## 5. Q8 — ANSWERED: save format

**`pwr2-1.0`, and PWR2 does NOT load `pwr-1.0` saves during the parallel phase.**

The two engines have genuinely different state — nodes and junctions against a flat `s` object.
A migration would have to *invent* node-level distribution from lumped values (how do you split
one `tavg_c` across ten nodes?), and any rule for doing so is a fabrication that would then be
indistinguishable from physics in the restored plant.

**Before replacement, one of two things must be true** — and this is an owner decision, not a
technical one:
1. Old saves are declared obsolete at the version boundary (simplest, honest, and normal for a
   physics rewrite); or
2. A documented, lossy migration exists that seeds node states from lumped values and **runs the
   plant forward to equilibrium before handing control back**, so the invented distribution is
   relaxed away rather than presented as truth.

**Recommendation: (1).** PWR2 keeps the *discipline* of `_migrateState` — **recompute, never
default** — within its own schema line.

---

## 6. How the shim is tested independently of the physics

D1 names the shim as new untested surface that the A/B runs *through*. Three checks, none of which
require the physics to be right:

1. **Completeness** — the shim emits exactly the 109 documented names. This is `run_contract.js`
   unchanged, pointed at PWR2. Fails in both directions, so it cannot be satisfied by over- or
   under-emitting.
2. **Type and range** — every field finite, correct type, within its declared physical range, on a
   frozen synthetic node state. **No plant is stepped**, so a shim bug cannot hide behind a
   physics bug.
3. **Injection** — perturb one native quantity, assert exactly the expected published fields move.
   This is the repo's standing "prove a check by making it go red" rule applied to a mapping: a
   shim row that never moves under any injection is a row that is wired to nothing.

---

## 7. Open

- The per-field classification above is at **group granularity**. The full 109-row table is owed
  before build, and writing it will likely reclassify some rows — the exercise of doing it
  field-by-field is itself a design check.
- #472's pressurizer fields depend on its rebuild landing.

---

## 8. The full 109-field classification — RESULT

Completed 2026-08-13 by a 41-agent pass: 7 agents classified all 109 fields, then **every field
called a proxy was handed to an independent agent instructed to REFUTE it**, defaulting to
downgrade when no fitted expression could be found in the source.

| Class | Count |
|---|---|
| **natural** | 44 |
| **translation** | 36 |
| **proxy — claimed** | 29 |
| **proxy — UPHELD under challenge** | **19** |
| **proxy — downgraded to translation** | **10 (34 %)** |

**The 34 % downgrade rate is the most useful number here.** The asymmetric instruction did real
work: an over-eager proxy call makes the A/B *expect* divergence where none should occur, which is
exactly how a real defect would hide as "expected". A third of the first-pass proxy calls would
have done that.

**The 19 upheld proxies — the predicted-divergence set**, to be scored *first* in the A/B because
they were written down in advance:

`primary_void_fraction` · `core_void_fraction` · `pzr_level_pct` · `pzr_mass_frac` ·
`sg_level_pct` · `sg_level_wide_pct` · `leak_flow` · `natural_circulation` · `t_core_exit_c` ·
`clad_temp_c` · `core_uncovered_frac` · `zirc_heat_pct` · `rcp_cavitation_frac` ·
`porv_tailpipe_temp_c` · `afw_discharge_pressure_mpa` · `hpi_discharge_pressure_mpa` ·
`mwe_output` · `containment_pressure_mpa` · `containment_sump_pct`

**Downgraded on challenge** (no fitted expression found — treat as translation, expect agreement):
`fuel_temp_c` · `afw_flow_normalized` · `spray_flow_pct` · `accumulator_flow_normalized` ·
`steam_pressure_mpa` · `rcp_cavitating` · `condenser_vacuum_kpa` · `melted` · `ctmt_h2_pct` ·
`containment_temp_c`

**This supersedes §2's group-granularity table**, which guessed at group level and got the
proportions materially wrong — it implied most groups were dominated by one class, where the real
distribution is 40 % / 33 % / 27 % spread across nearly every group. §2's specific *named* proxies
(`primary_void_fraction`, `pzr_mass_frac`, `sg_mass_frac`, `core_void_fraction`,
`natural_circulation`) all survive except `sg_mass_frac`, which this pass classified differently —
**worth checking before the A/B, since §2 predicted it in advance and this pass did not.**
