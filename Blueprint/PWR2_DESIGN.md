# PWR2 — Design Spine (D1)

**Status:** DESIGN, for review. **Nothing here is built.** #479.
**Read first.** The other four documents are detail this one points into:
`PWR2_PHYSICS.md` (D2) · `PWR2_PLANT.md` (D3) · `PWR2_INTERFACE.md` (D4) ·
`PWR2_VALIDATION.md` (D5).

**Supersedes `PWR2_ARCHITECTURE.md`**, whose layer stack predates the 2026-08-13 rulings.

---

## 1. Why — the defect, with numbers

Every geometric and thermal-hydraulic constant in `engines/pwr/pwr_config.js` was derived by
scaling **one** real-plant component **independently** — at different times, from different
reference plants (Ginna, BVPS-2, a generic WTSM 4-loop), by different power ratios (`300/1520`,
`300/908.5`, `300/852.75`). No two ever had to agree with each other.

**The structural defect is not any single wrong constant. It is that the engine has no physical
mass flow at all.** It runs on a normalized `flow_frac` against a fitted `coolant_heat_capacity`
whose units are *fraction-of-rated-heat per °C/s*, not J/K. There is no quantity in
`engines/pwr/` that a `Q = ṁΔh` check could be run against — so nothing could ever have detected
a disagreement, and nothing can detect the next one.

Measured consequence, 2026-08-13: the plant's own ruled identity (300 MWt, 321/288 °C at
15.41 MPa) gives Δh = 183.1 kJ/kg → **ṁ = 1639 kg/s = 36,817 gpm**. The plant declares
`rcs_flow_gpm: 24000` — **1.51× low**, equivalently a 50 °C core ΔT against the ruled 33 °C. It is
inert in physics (it sits in a config block headed *"NOT READ BY ANY CODE"*) but **player-facing**:
it feeds the manuals.

**Why rewrite rather than repair.** Repairing means adjudicating ~90 constants one at a time
against gates tuned to the plant those constants produced. There is no vantage point inside the
current engine from which "is this right?" is answerable — only "does this pass?". The rewrite's
entire purpose is to install the vantage point: a conservation law the plant can be wrong against.

---

## 2. Rulings that govern this design

**Provenance matters here (HR11), and this section was initially written without it.** Four of the
five below are **SELECTIONS from options I wrote**, not verbatim owner prose — recorded in the form
`CLAUDE.md` uses for the same case ("a selection, not verbatim words"). The fifth is a verbatim
directive. The distinction is not pedantry: a selection binds only as far as the option text I
offered was accurate, so if an option mis-stated its own consequence, the ruling inherits that.

**The one verbatim directive** *(OWNER DIRECTIVE, 2026-08-13: "I want a full new engine. We should
design it in a logical fashion. An advantage to a new engine is that we don't screw up the current,
mostly working one. We save the current one as a reference.")* — and its companion on process
*(OWNER, 2026-08-13: "We should be designing and not building. Once we have it designed I will
have the design reviewed before we build it.")*.

| | Ruling | Form | Consequence |
|---|---|---|---|
| **End state** | PWR2 **eventually replaces** `engines/pwr/` | *(OWNER RULING, 2026-08-13: selected "Replace, eventually" from options I wrote)* | Old engine frozen as A/B reference. PWR2 must eventually occupy `RD.PWREngine`. |
| **Scope** | **Whole plant** | *(OWNER RULING, 2026-08-13: selected "Whole plant, full design")* | Primary, kinetics, pressurizer, SG/secondary, BOP, containment, ECCS/CVCS/RHR, casualties. |
| **Two-phase** | **Homogeneous equilibrium** | *(OWNER RULING, 2026-08-13: selected "Homogeneous equilibrium")* | One mixture, phases at equal T and velocity, quality from enthalpy. No drift-flux, no two-fluid. |
| **Contract** | **Design the right contract, adapt afterwards** | *(OWNER RULING, 2026-08-13: selected "Design the right contract, adapt afterwards" — note this was NOT my recommendation; I had recommended freezing the 109-field contract)* | PWR2 publishes its natural state; a **shim** maps to the existing 109 fields. |
| **Pressure** | **One RCS dynamic pressure + per-node void** | *(OWNER RULING, 2026-08-13: selected "One RCS pressure + per-node void")* | Liquid RCS is incompressible; the pressurizer bubble is the compressible volume. |

**`engines/pwr/` IS NOT TOUCHED.** Not "mostly" — at all. A reference that drifts is not a
reference, and every A/B number taken before a change to it would be invalidated. PWR2 also may
not reuse anything from it by import or copy: copying a function in means inheriting a fitted
constant with its derivation lost, which is the failure this exists to end.

**`[tune]` does not exist in PWR2.** Every number is `[ruled]`, `[derived]` or `[sourced]`, and
carries its kind at its definition site. Where a value must genuinely be chosen (a layout length,
a design velocity), it is `[derived]` **from a stated design rule written next to it**.

---

## 3. THE FINDING THAT MOST AFFECTS THIS REVIEW

**The evidence pass on the recalled constants destroyed the cross-check that appeared to validate
the forward method.** This is reported first because a reviewer who reads
`PWR_DESIGN_BASIS.md` §7 without it will be reading a superseded result.

`PWR_DESIGN_BASIS.md` derived the plant forward and reported three cross-checks agreeing. One of
its inputs — the downcomer annular gap, **0.25 m** — was *recalled, not sourced*. Re-derived from
the reference plant's downcomer/hot-leg **area ratio** (2.37, computed from RPV ID 4.39 m against
barrel OD 3.76 m and four 29-in hot legs):

| | Recalled | Derived | |
|---|---|---|---|
| Downcomer gap | 0.25 m | **0.093 m** | 2.7× smaller |
| Power density | 105 kW/L *(assumed input)* | **85.1 kW/L** *(derived output)* | see §4 |
| RPV coolant volume | 376.6 ft³ | **228.1 ft³** | −39 % |
| **RPV share of RCS** | **45.1 % — "in band"** | **33.3 %** | **outside 40–45** |

**The 45.1 % was an artifact of the recalled gap.** It is not evidence and must not be cited.

**And the check was invalid anyway.** The 40–45 % RPV-share band is a **4-loop-plant statistic**.
A 4-loop plant divides ~55 % of RCS volume among four loops (~14 % each); a single-loop plant has
one loop against one vessel, so there is no reason its share should match. **The band never
transferred to SLS-100 regardless of the constants** — a reasoning error independent of the data.

**What survives as a valid cross-check:** the energy balance (`Q = ṁΔh`), which is topology-
independent and is gated today at `run_pwr2_water` 56/56. **Loop transit time now reads short**
(~6.8 s through the flow path, excluding the pressurizer, against a real-PWR 10–12 s) — a live,
unadjudicated finding, not a settled result.

**Consequence for the review: the forward method is NOT yet independently validated.** It is
better-founded than the patchwork — it has derivations where the old plant has fits — but the
evidence that it *closes* is currently one check, not three. D3 must establish a cross-check
valid for a single-loop topology, or declare that none exists and say what stands in its place.

---

## 4. Two constants genuinely improved by the evidence pass

- **Lattice coolant fraction is now DERIVED, not recalled.** From sourced Westinghouse 17×17
  geometry (pitch 12.6 mm, rod OD 9.5 mm, 264 rods + 25 guide/instrument tubes per assembly):
  **0.584**. The recalled 0.58 was close, but it is now computed from geometry rather than
  remembered.
- **Power density is now a CONSEQUENCE, not an input.** Assuming a power density and back-solving
  core volume was the wrong direction — real design picks an **assembly count**, and power density
  falls out:

  | Assemblies | Core volume | Diameter | Power density |
  |---|---|---|---|
  | 17 | 2.85 m³ | 1.00 m | 105.1 kW/L |
  | **21 (5×5 less corners)** | **3.53 m³** | **1.11 m** | **85.1 kW/L** |
  | 25 | 4.20 m³ | 1.21 m | 71.5 kW/L |

  **Adopt 21.** It is a real loading-pattern shape, and 85 kW/L sits *below* the 100–110 typical
  band in the direction the plant's own ruled character already claims — *"small and generously
  margined by design"* (`Manuals/01`). Active fuel length stays the standard **12 ft (3.66 m)**:
  a 300 MWt plant buying custom-length fuel would be a poor design decision.

**Still not sourced:** the plena heights, now expressed as ratios of RPV ID (lower 0.50×, upper
0.70×) rather than bare metres. That is scaling, not sourcing, and it is declared as such.

---

## 5. What the design must cover (measured)

| | Current engine |
|---|---|
| Source | **10,070 lines**, 7 files |
| `true_state` | **109 fields**, gated **exactly in both directions** (`test/run_contract.js`) |
| Commands | **62** `applyCommand` cases |
| Public API | **10** members |
| Integration | **27-step schedule**, fixed `PHYSICS_DT = 0.02` (acceleration = more steps, never a bigger dt) |
| Coupling | **~23 one-step-old reads** (`CONTEXT.md` §11) |
| Registration | `RD.PWREngine = PWREngine` — mechanically a drop-in |
| Save | `pwr-1.0` + `_migrateState`, which **recomputes rather than defaults** |

**Scope-limiting insight.** PWR2's real scope is **engine physics only**. `pwr_instruments.js`,
`layers/control/pwr_control.js` and `layers/simulation_service.js` all consume the *published*
contract — if the shim emits the 109 fields, those three are unchanged. **Two couplings must be
confirmed rather than assumed:** `control_kernel.js:512` reads `engine.instruments.reading`
directly, and `pwr_control.js:1730` *writes* `RD.PWR_CONFIG.protection`.

**Non-goals, explicitly:** RBMK and BWR (on hold — CLAUDE.md); the instrument model (reused, not
redesigned); the control, service and instructor layers (untouched).

---

## 6. Risk register

| Risk | Severity | Note |
|---|---|---|
| **The forward method is not independently validated** (§3) | **High** | Its apparent validation was an artifact. One surviving cross-check. D3 must fix or declare. |
| **Performance** | High | `dt = 0.02` fixed; 12 plant-hours ≈ 35 s today, 87.9 % in `engine.step`. More state per step plus any implicit solve threatens this. Budget must be measured early, not at the end. |
| **Scope** | High | 10,070 lines. §8 names the stop criteria. |
| **Shim surface** | Medium | New, untested, and the A/B runs *through* it. D4 must say how it is tested independently of the physics. |
| **Contract exactness** | Medium | `run_contract.js` fails in **both** directions on 109 fields. No slack. |
| **#472 collision** | Medium | Pressurizer rebuild live on `workbench`. D3 consumes its design; must not race it. |
| **Remaining recalled numbers** | Medium | Plena heights (§4). Fewer than before, not zero. |

---

## 7. Build order (for reference — NOT authorised by this document)

```
L6 Casualties      breaks as junctions onto any node
L5 Systems         pressurizer (coord #472), CVCS, ECCS, RHR, SG secondary
L4 Sources/sinks   core power, SG duty, pump work as a LOCATED source
L3 Topology        the SLS-100 wiring
L2 Node/junction   generic conservation primitives
L1 Geometry        volumes, elevations, wall masses, areas (data only)
L0 Water props     BUILT — run_pwr2_water 56/56
```

Each layer testable with only the layers beneath it; nothing reaches upward. A layer is not
started until the one below has a green runner. **L1's gate is the one to watch** — it is where
§3's unresolved closure question lands.

---

## 8. What would make us stop

Named now, so the decision is not made under sunk cost later:

1. **Performance fails at L2–L3.** If the conservation core cannot hold ~35 s for 12 plant-hours
   at `dt = 0.02`, the design's central premise (a real node model at the service's fixed cadence)
   is wrong and should be re-opened rather than optimised around.
2. **L1's ledger cannot be made to close with a valid cross-check.** If no topology-appropriate
   check can be constructed (§3), PWR2's geometry rests on the same kind of unfalsifiable
   assertion as the plant it replaces, and the rewrite loses its justification.
3. **The shim cannot express a field honestly.** If a `true_state` field turns out to require the
   old model's internals to compute, that is a contract problem to settle with the owner before
   proceeding — not something to paper over inside the shim.
4. **The A/B shows no divergence anywhere that matters.** Then the old engine was right, and the
   correct outcome is to keep it and bank the property library plus the documentation.

---

## 9. Open questions this design set must answer

Carried forward to the documents that own them. **None may be deferred past review.**

| # | Question | Owner |
|---|---|---|
| 1 | How is flow computed — junction momentum, or quasi-steady balance with inertial lag? | D2 |
| 2 | Integration scheme — explicit at dt 0.02, or sub-stepping for stiff terms? | D2 |
| 3 | How many one-step-old couplings survive, and which are irreducible? | D2 |
| 4 | Does natural circulation fall out of real elevations and densities, or stay fitted? | D2 |
| 5 | **What cross-check validates the geometry for a SINGLE-LOOP plant?** (§3) | D3 |
| 6 | How much of the secondary is nodalised vs lumped? | D3 |
| 7 | Which of the 109 fields are natural / translation / proxy? | D4 |
| 8 | Must PWR2 load `pwr-1.0` saves, and from when? | D4 |
| 9 | What concretely makes PWR2 ready to replace `engines/pwr/`? | D5 |

---

## 19. WHAT THE EDUCATIONAL TIER ACTUALLY DOES — and this design has been reasoning two tiers too high

*(OWNER, 2026-08-13: "Why don't you do some research before proceeding on the different ways the
industry models the sims.")* Correct instinct, and the answer changes the ambition level.

**Every design argument in §§0–18 was drawn from RELAP5 and TRACE. Those are safety-analysis
codes.** This is an educational simulator, and the educational tier turns out to be a different
engineering problem with a different published standard of success.

### 19.1 The tier, measured

| Simulator | Primary T/H nodes | Timestep |
|---|---|---|
| **PCTRAN** (most widely deployed educational PWR) | **2 volumes, 1 moving boundary — the ENTIRE RCS** | unpublished |
| IAEA PWR (TCS-22, CASSIM) | 12 lumped (4 channels × 3 axial) | **0.1 s fixed** |
| Kerlin/UTK (EPRI EL-3087) | **1 fuel + 2 coolant** | 0.02 → 0.5 s |
| INL RO-TPD-PWR | **2 primary coolant nodes** | — |
| BNL HIPA | 54 cells, but **54 momentum equations replaced by 3 loop balances** |
| IAEA iPWR (TCS-65, Tecnatom) | full 6-equation two-fluid | implicit |

**PWR2's ~12 nodes sits at the UPPER END of this band — not outside it.** Scale does not drive
node count in this tier; provenance of the borrowed code does.

### 19.2 ⚠ THE STRUCTURAL FINDING — nobody solves a transient momentum equation

**Not one educational simulator sourced solves momentum in the loop.** Flows are `W = K·√ΔP`.
IAEA TCS-22 §5.6 says so explicitly:

> *"Since these equations are coupled in a relatively weak fashion, it is possible to **de-couple
> the mass and momentum equations from the energy equation**… This allows a much simpler solution
> of simultaneous equations in the core."*

Kerlin uses "a static momentum balance"; PCTRAN assumes rated volumetric flow; BNL collapsed 54
cell momentum equations to 3 loop balances.

**D2 §0.2 integrates a loop momentum state. That is a departure from the entire tier, and it was
inherited rather than decided.** It must now be an explicit choice with a stated payoff:

| Momentum buys | Worth it? |
|---|---|
| RCP coastdown **derived** from pump inertia rather than a fitted exponential | The current engine fits it; sourced inertia now exists (Ginna 80,000 lbm·ft²) |
| Natural circulation **emergent** rather than fitted | But a `√ΔP` network with a buoyancy term also gives natural circ, quasi-steadily |
| Loop flow transients during a pump trip | **The real question — does any Tier A coupling need it?** |

**Checked against `CURRICULUM.md`: none of the nine Tier A couplings obviously requires transient
loop momentum.** A1–A9 are thermal/reactivity/level couplings. **This is now an open design
question, not a settled one.**

### 19.3 The IAEA's fidelity standard — and it is NOT "more physics is better"

**IAEA-TECDOC-995 §2.4.4:**
> *"**Rating a simulator purely on factors such as scope, fidelity, or technical sophistication
> could be misleading. The real criterion should be its overall ability to enhance the training
> process.** … the inappropriate use of a simulator can lead to poor training and could even
> mislead the trainee, i.e., cause so-called **negative training**."*

**IAEA-TECDOC-1887 §4.1.2.1 — the nodalization criterion is FUNCTIONAL, not numerical:**
> *"**Sufficient nodalization of the system allows the simulation of all phenomena having an
> impact on the selected operating procedure.** The required depth and accuracy are determined by
> the education and training objectives and needs."*

**And more fidelity actively harms at the wrong level** (TECDOC-1887 §3.3): basic simulators should
allow *"'turning off' of some of the more complex physical effects… without spending unnecessary
time learning to use complex or advanced simulator features."*

**TCS-65 p. 1:** *"The simulators are **not expected to produce accurate results** but do
demonstrate realistic trends and transients."*

**This is the yardstick PWR2 should be measured against — and it is `CURRICULUM.md`'s Tier A
couplings, not a residual in kg.**

### 19.4 Directly relevant to #472 — the IAEA on pressurizer depth

**TCS-22 §5.8:**
> *"It should be emphasized that **the depth of a pressurizer model required for educational
> simulator differs considerably from that required for engineering or safety analysis**, and
> therefore for this purpose, the model presented here is only a basic model."*

Their basic model is **three ODEs, six steam-table evaluations, three algebraic calculations** —
and they list what it deliberately omits: superheated/condensing steam region, subcooled/boiling
lower region, interfacial heat transfer, bubble rise, spray condensation. **#472 should see this
before it finishes.**

### 19.5 Where PWR2's ambition IS defensible

**The tier's limits are real and they bite on this plant's stated goals.** PCTRAN's 2-volume RCS
**cannot represent break location at all** — and IAEA TCS-68 §3.5.2 records what that costs:

> *"This is the bypass phase… **In PCTRAN, this phase is not observed**"*; and *"**only the top of
> the core is uncovered**… the refill phase and reflood phase are not clearly distinguished."*

**That is exactly the phenomenon the owner asked about and §8's CCFL junction closure exists to
deliver.** So PWR2 being at the top of the tier is a deliberate, justified departure — *for
break location and node-to-node coupling*, which are the educational payload. **It is not a
justification for analysis-code machinery everywhere else.**

### 19.6 The costing passage worth adopting wholesale

Kerlin bought a 25× larger timestep by applying the prompt-jump approximation and **multiplying
the SG tube-metal mass by ten** — then wrote the bill down (EPRI EL-3087 §5):

> *"there is a **large difference in the response of the internal system variables**… for
> applications where PWR internal variables are important (as for plant tripping) **the error in
> these variables may be intolerable**."*

**That is the right form for every simplification in this design set: state the shortcut, state
what it costs, state where it becomes intolerable.**

### 19.7 What this does NOT settle

Two research strands are still running (commercial full-scope architectures; real-time robustness
without timestep rejection). **The scheme-B ruling is deferred until they land** — scheme B's
headline virtue is *dt-convergence across a 200× range*, which is an **analysis-code** virtue. A
simulator's virtue is *never producing a bad frame*, and those may not be the same purchase.
