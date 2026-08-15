# PWR2 — Design Spine (D1)

**Status:** DESIGN, for review. **Nothing here is built.** #479.
**Read first.** The other four documents are detail this one points into:
`PWR2_PHYSICS.md` (D2) · `PWR2_PLANT.md` (D3) · `PWR2_INTERFACE.md` (D4) ·
`PWR2_VALIDATION.md` (D5).

## ⚠ DECODER — what the letter-number codes in these documents mean

*(OWNER DIRECTIVE, 2026-08-14: "I don't know what these letter number combos are (L0, D1). Always
spell them out.")* **This shorthand is agent-invented and belongs ONLY inside these five
documents.** Never use it in chat, an issue, or a commit message — spell it out there. CLAUDE.md
*Domain conventions* carries the standing rule.

| Code | Means |
|---|---|
| **D1 … D5** | The five design documents. **D1** = this file, the spine · **D2** `PWR2_PHYSICS.md` · **D3** `PWR2_PLANT.md` · **D4** `PWR2_INTERFACE.md` · **D5** `PWR2_VALIDATION.md` |
| **L0 … L6** | The build layers, bottom-up (§7). **L0** = water properties (the only thing built) · **L1** geometry · **L2** node/junction conservation · **L3** topology · **L4** sources/sinks · **L5** systems · **L6** casualties |
| **A1 … A9** | The nine Tier A curriculum couplings (`CURRICULUM.md`) — e.g. **A4** = "level is not inventory", the TMI coupling |
| **E01 … E23** | Casualty/failure ids in the behaviour catalog — e.g. **E07** = stuck-open PORV, **E09** = large LOCA |
| **HR1 … HR12** | The repo's Hard Rules (`CONTEXT.md` §3) — e.g. **HR9** the plant is ground truth, **HR12** measure, don't assert |
| **F1 … F11** | Findings in the 2026-08-14 adversarial review (`PWR2_REVIEW_ADJUDICATION.md`) |

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

Measured consequence, **re-measured 2026-08-14 on the rebuilt Layer 0** (the 2026-08-13 figures
were 183.1 kJ/kg → 1639 kg/s → 36,817 gpm → "1.51× low", computed with the property library before
its compressed-liquid term was found wrong in sign — `PWR2_L0_REBUILD.md` §2.1): the plant's own
ruled identity (300 MWt, 321/288 °C at 15.41 MPa) gives **Δh = 184.1 kJ/kg** against the IAPWS-95
value of 185.4 → **ṁ = 1630 kg/s (3,590 lbm/s) ≈ 34,500 gpm at cold-leg density**. The plant
declares `rcs_flow_gpm: 24000` — **1.44× low**, equivalently a 47 °C core ΔT against the ruled
33 °C.

It is inert in physics (it sits in a config block headed *"NOT READ BY ANY CODE"*) but was
**player-facing**: it fed `Manuals/12` §14.0. **The manual half is FIXED** (2026-08-14, corrected
to ≈ 34,500 gpm with its derivation and a note that a volumetric flow is meaningless without a
reference temperature). **The engine half is NOT** — `engines/pwr/` is the frozen A/B reference
and is not touched; filed as **#481**, which also records that `pwr_config.js:455-461` reasons
*from* the wrong figure to justify the loop transport constants (7,500 gal at 24,000 gpm = "~19 s"
turnover; at the energy-balance flow it is ~13 s).

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
independent and is gated today at `run_pwr2_water` **164/164, with a 17-mutation injection
self-test** (rebuilt 2026-08-14 — the 56/56 this sentence used to cite was itself a
could-not-fail instrument, `PWR2_L0_REBUILD.md` §1). **Loop transit time now reads short**
(~6.8 s through the flow path, excluding the pressurizer, against a real-PWR band) — a live, unadjudicated finding.
**⚠ The "10–12 s" figure this section originally quoted is RETRACTED** — it was recalled, and D3 §1b computes the real band as 11.0–13.7 s from reference geometry. Both this transit check and the specific-volume check it sits beside were later found CIRCULAR (D3 §1); neither may be cited.

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
| **#472 collision** | **HIGH — IT IS HAPPENING** | See §25. The reference engine is being modified right now. |
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

> **⚠ THIS SECTION'S CONCLUSION IS SUPERSEDED BY §23 (2026-08-14).** The IAEA quotes are accurate
> and the *phenomenon* is real; what was wrong is the leap from "PCTRAN cannot show it" to "so it
> is our educational payload." **`CURRICULUM.md` ranks Large LOCA (E09) Tier D-adjacent**, and it
> was ruled binding on 2026-08-03 — before this section was written. Break location survives for
> the three **named** Core paths; the large-break bypass/refill/reflood sequence is now a declared
> demonstration. **The trap worth keeping: a capability argument sourced entirely to what OTHER
> simulators cannot do never asks whether OUR curriculum wants it.**

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

---

## 20. FULL-SCOPE SIMULATOR PRACTICE — and it settles the scheme-B question

### 20.1 The finding that most changes the design

**US Patent 5,619,433 (THEATRe, GP International, filed 1992)** — a real-time NPP simulator whose
claims specify **"said constant time step to be selected from between 0.0625 to 0.125 seconds"**,
solved **without iteration**. Its motive, verbatim:

> *"One deficiency in applying RELAP5/MOD3 in the real time domain is that **it uses variable time
> steps to assure system stability** … **However, this approach will not guarantee that it can run
> in real time under all operating conditions.**"*

**And the A/B they publish inverts the assumption this design was built on:**

> *"**The RELAP calculation allows the time step to dynamically reduce to cope with the unstable
> calculations… However, this particular capability does not remove the numerical spikes. In fact,
> the RELAP calculation involves substantially more numerical oscillations than the THEATRe
> calculation which uses a constant time step (0.125 sec).** … It is suspected that the causes for
> unstable RELAP calculations are primarily introduced by the **discontinuity which exist in the
> interfacial heat transfer correlation package and the critical flow model**."*

**Read that carefully: the instability was traced to DISCONTINUOUS CORRELATIONS, not to step size.**
A *constant* 0.125 s step was measured **more stable** than adaptive cutback on the same LBLOCA.

**Consequence for PWR2:** §§11–18 spent the day fighting a discontinuity in the **state equation**,
and §18 correctly concluded the fix is to stop differentiating it. But the sourced instability in a
real production simulator came from the **constitutive correlations** — interfacial heat transfer
and critical flow. **That is where our smoothing effort belongs, and D2 has not looked there at
all.** §9's `h_film` regimes and D3 §8's CCFL cap are exactly that class.

### 20.2 How frame time is actually guaranteed — eliminate data-dependent branching

THEATRe again: solvers are code-generated per configuration and written so that
*"factorization, forward and backward substitutions can be performed sequentially (i.e., **no
do-loops and no if-checks**)"*, because *"for a fixed nodalization, the operations involved …
is fixed so the computational time is within a narrow interval of timing, while other method of
matrix solution, e.g., iterative method, **cannot control the computation time if there is any
convergence problem**."*

**This is the real-time constraint stated precisely, and it is not the one §18 optimised for.**

### 20.3 The tier's answers, and they contradict each other

| Product | Equations | Integration | Step | Iterate? |
|---|---|---|---|---|
| **THEATRe** | 5 + drift flux | semi-implicit, ICE | **constant 62.5–125 ms** | **No, by design** |
| **THOR** (CORYS) | 5 drift flux | **explicit Euler** | 100 cps | **No** |
| **TRAC_RT** (Tecnatom) | 6 two-fluid + 3-D | semi-implicit predictor-corrector | **100 ms fixed** | only in fast transients |
| **CATHARE-2/SCAR** (EDF) | 6 | fully implicit Newton | 100 ms frame, n sub-steps | **yes — budget 8/frame** |
| **APROS 5-eq** | 5 | implicit Euler | adaptive | **no iterations needed** |
| **3KEYRELAP5-RT** (WSC) | 6 | RELAP5-3D **unmodified** | adaptive | yes |

**CORYS on why explicit wins in real time:** *"the execution time is **proportional to the number of
control volumes**"* versus implicit *"at best, **proportional to the square**."* And: *"To maintain
numerical stability, the explicit method requires smaller time steps … **But because of the faster
execution time per time step this is not a drawback.**"*

**And the sobering datum:** CATHARE-2/SCAR — a 6-equation best-estimate code, heavily parallelised
across 12 processors — still lands at **~3× slower than real time**: *"This is not sufficient for
real-time training, but it is of great interest in engineering or safety analysis studies."*

### 20.4 THE ONLY PUBLISHED DEFINITION OF "LATE" — adopt this

CATHARE-2/SCAR (Ruby et al., SNA 2003) is the sole formalism found:

> *"Local criterion: the '**local time lag**' TLl must be lower than **1 s**. Global criterion: the
> '**global time lag**' TLg must be lower than **1 % of Tsimu**."*

They budget explicitly — 100 ms cycles, 20 ms auxiliaries, **"CATHARE gets 80 ms"**, target
10 µs/iteration/mesh, **"compute 100 ms-cycles in a maximum of 8 iterations"** — and they
**tolerate misses**: a valve opening *"might induce a local time lag, even exceeding the
criteria"*, measured as a maximum *"encountered in **95 % of the 100 ms cycles**."*

### 20.5 ⚖ THE SCHEME-B RULING — synthesis, not a straight adoption

**Scheme B's headline virtue is dt-convergence across a 200× range. That is an ANALYSIS-CODE
virtue and this tier does not buy it.** But scheme B should not simply be dropped, because its
*mechanism* is compatible with the tier's requirement in a way §11.1's was not:

| | §11.1 affine march | Scheme B bracketed solve | Tier requirement |
|---|---|---|---|
| Compute per frame | fixed | **variable (1–7 iters)** | must be **bounded** |
| Failure mode | silent 47 % mass error | converges or brackets | must **never diverge** |
| Convergence guarantee | none | **monotone `F`, bracket always exists** | — |

**RECOMMENDATION: adopt scheme B WITH A HARD ITERATION CAP.** A bracketed solve on a proven-monotone
function is the one iterative scheme whose *worst case is bounded* — cap at N iterations, accept
the residual, and the bracket width bounds the error even when the cap binds. That satisfies
THEATRe's frame-time argument without giving up §18's correctness result. **It is not
"non-iterative", and that claim stays dead.**

**And the acceptance criterion must change with it.** Not a residual in kg — **ANS-3.5's actual
bar**, which the NRC states as: steady state within **2 %**, and transients judged by
*"observable change in the parameters **correspond in direction**"*, *"shall **not fail to cause an
alarm** or automatic action if the reference unit would have"*, and *"shall **not cause an alarm**
… if the reference unit would not."* **Directional correctness and alarm fidelity — which is
`CURRICULUM.md`'s Tier A framing, not a mass ledger.**

### 20.6 What coarseness actually costs — three measured cases

- **PCTRAN vs NOTRUMP** (AP1000 SBLOCA): sequence right, **clock wrong by 20–150 %, and the error
  GROWS with elapsed time** — reactor trip +66 %, ADS-4 **+151 %** (24–38 minutes late).
- **Krško full-scope (79 volumes) vs RELAP5 (469)**: the coarse model **crossed an ECCS setpoint the
  best-estimate code never reached** — *"LPSI system actuated at around 4400 s … while in the case
  of RELAP5 … there was no LPSI injection"* — traced directly to *"only **two volumes between the
  reactor vessel and reactor coolant pump**."* **A node-count decision changed which safety systems
  fired.** That is the strongest argument yet for PWR2's node count being a curriculum question.
- **Mesh coarsening, isolated** (DOE-WSC-18915): MDNBR reads **5.4 coarse vs 4.4 resolved** — the
  coarse model reports **23 % more margin than exists, non-conservatively**, from a 4.4 % heat-flux
  understatement.

### 20.7 ✅ HR1 VINDICATED BY A VENDOR BENCHMARK

CAE's Krško work found their real-time simulator **beat RELAP5** against plant data:

> *"**RELAP5 initially predicts a much steeper change to hot leg and cold leg temperatures compared
> to plant data** … The slower hot leg response in the plant data is believed to be at least
> partially associated with **the effect of the hot leg metal on the thermal response of the
> temperature sensor itself, which is not explicitly modeled in RELAP 5** … The temperatures shown
> for the simulator represent the **response of the simulated sensors**."*

**Modelling the instrument beat a finer mesh of the fluid.** That is HR1, externally confirmed —
and it argues PWR2's effort is better spent on wall/sensor dynamics (§9's τ ≈ 0.10 s, still
untested) than on solver convergence.

### 20.8 A node-sizing rule that inverts the analysis-code logic

Janosy (InTech 2011): *"if we multiply the maximal feasible volumetric flow-rates with the 0.2 sec.
integration time step, we get the **minimal volumes for the nodes**."* — **`V_node ≥ Q_max · dt`.**
Analysis codes shrink `dt` to fit the nodes; **real-time codes size the nodes to fit `dt`.** D3's
node list should be checked against this before anything is built.

*Sourcing note: THEATRe's body text came via Google Patents (front-page data and the constant-step
claim independently re-verified at USPTO). **ANS-3.5's own §4.1 tables are paywalled and were not
obtained** — the 2 % is the NRC quoting the standard, not the standard itself.*

---

## 21. REAL-TIME ROBUSTNESS — the direct answer, and sourced evidence bearing on the HEM ruling

### 21.1 The direct answer, from a 2026 paper on a real-time RELAP5-3D

Arshavsky, *Nuclear Technology*, 13 Jan 2026, DOI 10.1080/00295450.2025.2572004:

> *"Code improvements were made to address major challenges in real-time nuclear power plant
> simulators to enable high performance, stability, and accuracy concurrently. The code changes,
> **which were accumulated over 3 decades**, include implementation of a **smooth transition between
> different heat transfer and flow regime conditions**, Dalton-Gibbs mixture equation solver
> corrections, and numerical scheme improvements to **avoid code aborts and unphysical spikes when
> transitioning from one-phase to two-phase flow conditions and vice versa**."*

**Three things this settles:**

1. **The technique that replaces step rejection is smoothing the REGIME AND CORRELATION
   transitions** — not the properties, and not sub-stepping. **Same conclusion as THEATRe's patent
   thirty years earlier.** Two independent codes, three decades apart, put the fix in the
   *correlation layer*. §20.1 reached this; this confirms it independently.
2. **"Unphysical spikes when transitioning from one-phase to two-phase" is water packing — named as
   a live problem in a shipping product in 2026.** §18.5 treats it as a documented 1995 defect. It
   is a documented **permanent** one.
3. **"Avoid code aborts."** The analysis code's terminal state is explicit (NUREG/CR-5535 §8.1):
   *"If the minimum time step is reached without obtaining a valid solution, **the code calculation
   is terminated**."* That halt is what the real-time variant had to engineer away — and it took
   **three decades**.

### 21.2 ⚠ SOURCED EVIDENCE BEARING ON THE HEM RULING — recorded here, next to the ruling

**US 5,619,433 col. 12, ll. 58–67:**

> *"**The two energy equation approach is much more mechanistic and numerically stable than the one
> equation model** … the one energy equation model requires **substantial non physical treatment**
> to calculate interfacial heat…"*

PWR2's ruled two-phase model is **homogeneous equilibrium — one energy equation.** A shipped
real-time code is on record that this formulation is *less* numerically stable and needs
compensating non-physical treatment.

**And our own findings are consistent with it rather than contradicting it.** The 3,800× slope
ratio, the 263× cancellation, the sign-inverted junction flow, the 148,597× closure-slope ratio in
the water-solid case — **all are consequences of collapsing two phases onto one energy variable.**

**This is NOT a recommendation to reopen the ruling.** The educational argument for HEM is separate,
and this is one vendor's unquantified assertion. **But HR9 makes the plant's identity answerable to
physics, and this is sourced evidence bearing on that ruling's cost.** It belongs beside the ruling
rather than being discovered later by whoever hits the next boundary defect.

### 21.3 What happens when a frame is missed — the policy, sourced

**IAEA-TECDOC-1500, pp. 55–56:**

> *"**MAAP4 code execution time slippage is allowed for short time periods. When the minimum time
> step limitation diminishes, the faster then real time execution of MAAP4 code is used to catch up
> with normal simulation time, until the accumulated time difference is zero.**"*

**Both nuclear and the Modelica world converge on the same policy: let the frame slip, then run the
deficit back to zero.** Neither pretends the deadline is always met.

**Concrete implementation item for PWR2:** the architecture already has the mechanism
(`timeAcceleration` and the step-count loop in `simulation_service.js`). **The open question is
whether a §17.5 crossing sub-step accrues a time deficit that nothing repays.** Cheap to verify,
and the failure is silent.

### 21.4 The stability/cost design space, complete

| Scheme | Stability | Cost/step | Iterations |
|---|---|---|---|
| Explicit | **unstable** (Ransom: *"entirely explicit schemes are unstable"*) | lowest | 0 |
| **Semi-implicit** | to the material Courant limit | low | **0 — direct linear solve** |
| Nearly-implicit | ~20–40× Courant | +25–60 % | **bounded** |
| Fully implicit | unconditional | high | **UNBOUNDED** |

> **Semi-implicit does not buy unconditional stability, and nothing that does is safe at a fixed
> frame.**

**This sharpens §20.5's ruling.** A capped bracketed solve is **nearly-implicit** in character —
bounded iteration for extra Courant headroom — **not** fully implicit. That is the row every
real-time code in this research occupies, and it is the right row.

### 21.5 The regulator says conservation is a BUDGET, not an identity

**NEI 09-09 Rev 0 §3.9 (ML091310538):**
> *"The response of the simulator … shall be realistic and **shall not violate the physical laws of
> nature, such as conservation of mass, momentum, and energy, WITHIN THE LIMITS of the
> verification, validation, and performance testing criteria of the standard**."*

**Even the conservation requirement is qualified by a tolerance.** That is the strongest available
answer to what a residual may be: **conservation in a real-time simulator is a budgeted quantity,
and the regulator says so.** D5's Layer-1 gate should be written as a budget with a stated number,
not as an identity.

### 21.6 Two corrections to the record

- **WITHDRAW the ±2 % steady-state figure** quoted in §20.5. It traces to a 1989 licensee procedure
  citing ANSI/ANS-3.5-**1985**; the **2018 edition uses temperature-range-dependent bands**
  (Appendix B, Table B.1). The transient criteria (directional, alarm-based) stand.
- **`nrc.gov` IS FETCHABLE** — it 403s a bare user-agent but returns **HTTP 200 with a full browser
  header set** (UA + Accept + Accept-Language + sec-ch-ua + Sec-Fetch-*). Three documents were
  pulled that way. **Meanwhile archive.org returned HTTP 498 to every content request this
  session.** `CLAUDE.md` and the `pwr-prototypicality-sources` memory both record the archive.org
  route as *the* workaround — **the documented workaround is currently the broken one, and the
  "broken" path works.** Worth fixing in both places.

### 21.7 The caution to carry into the build

> *"RELAP5-3D needed **three decades** of accumulated source changes to stop aborting at the
> one-phase/two-phase transition, and a 2026 paper still lists it as a headline fix. This design
> treats crossing that boundary as a solved problem with a measured residual. **It is worth asking
> whether §17.5's 8.4 kg was measured across the same variety of crossings that took the industry
> thirty years to cover.**"*

**It was not.** §17.5's number comes from one node driven across `h_f` at four pressures. That is a
sample, not coverage.

---

## 22. SECOND WAVE OF RULINGS (2026-08-13) — taken after the industry research

**All four are SELECTIONS from options I wrote**, recorded in the form `CLAUDE.md` uses for that
case. Same caveat as §2: a selection binds only as far as my option text was accurate.

| | Ruling | Form |
|---|---|---|
| **Solver** | **Bracketed root-find, capped at ~8 iterations** | *(OWNER RULING, 2026-08-13: selected "Bracketed, capped at ~8 iterations")* |
| **Momentum** | **Keep the integrated loop momentum state** | *(OWNER RULING, 2026-08-13: selected "Keep integrated momentum — one state")* |
| **Two-phase** | **HEM stands; record its cost** | *(OWNER RULING, 2026-08-13: selected "Keep HEM, record the cost")* |
| **Ambition** | **Continue at ~12 nodes; change the acceptance bar** | *(OWNER RULING, 2026-08-13: selected "Continue at ~12 nodes, change the acceptance bar")* |

### 22.1 What each settles

**SOLVER — §11.1's affine march is DELETED.** Replaced by scheme B (§18.2): a bracketed 1-D
root-find on the exact closure `F(P) = Σ V_i·ρ(a_i + v_i(P−P_n), P) − M_total = 0`, **capped at ~8
iterations** (matching CATHARE-2/SCAR's published per-frame budget). Never compute `∂ρ/∂h` or
`∂ρ/∂P` in the hot path. **This is nearly-implicit in character** — bounded iteration for Courant
headroom — which is the row every real-time code in the research occupies. **"Non-iterative" is
dead and stays dead.** Typical cost 2–3 iterations; the bracket width bounds the error when the cap
binds.

**MOMENTUM — kept, and it is now a DECLARED departure from the tier.** Not one educational
simulator sourced solves transient momentum; IAEA explicitly decouples it. PWR2 keeps it because
it is **one state** and it makes RCP coastdown derived from sourced pump inertia (Ginna
80,000 lbm·ft²) rather than a fitted exponential, and natural circulation `W ∝ Q^⅓` emergent rather
than a fitted scale. **Dropping it would reintroduce exactly the fitted-constant problem #479
exists to end.** Recorded honestly: **none of the nine Tier A couplings strictly requires it** —
this is a means-of-derivation argument, not a curriculum one.

**TWO-PHASE — HEM stands, and §21.2's cost is recorded beside it.** A shipped real-time code holds
that two-energy is *"much more mechanistic and numerically stable"* and that one-energy *"requires
substantial non physical treatment."* Our measured pathologies — the 3,800× slope ratio, the 263×
cancellation, the sign-inverted junction flow — are consequences of HEM. **The ruling stands
because scheme B plus correlation-layer smoothing manages them and the educational argument is
separate. The cost is now visible in the file rather than waiting to be rediscovered.**

**AMBITION — continue, but THE ACCEPTANCE BAR CHANGES.** ~~Justified because PCTRAN's two-volume RCS
**cannot represent break location at all** (IAEA: the LOCA bypass phase *"is not observed"*), and
that capability is the educational payload.~~ **But PWR2 is no longer judged by residuals in kg.**

> **⚠ THE NODE-COUNT HALF OF THIS RULING IS REOPENED (§23.2, 2026-08-14).** Its justification —
> struck above — rested on break location being the educational payload, which the binding
> `CURRICULUM.md` contradicts. This was a **selection from options I wrote**, and §2 records that
> such a ruling binds only as far as my option text was accurate; it was not. **The acceptance-bar
> half is unaffected and stands** — it rests on ANS-3.5/NEI 09-09, not on break location.

### 22.2 ⚖ THE NEW ACCEPTANCE BAR — this supersedes D5's framing

Per ANS-3.5 as the NRC states it, and NEI 09-09 §3.9:

| Criterion | Standard |
|---|---|
| **Directional correctness** | *"observable change in the parameters **correspond in direction** to those expected"* |
| **No missed alarm** | *"shall **not fail to cause an alarm** or automatic action if the reference unit would"* |
| **No spurious alarm** | *"shall **not cause an alarm** … if the reference unit would not"* |
| **Conservation** | a **BUDGET**, not an identity — NEI 09-09: *"within the limits of the verification, validation, and performance testing criteria"* |
| **Tier A couplings** | all nine expressible (`CURRICULUM.md`) |
| Steady state | a tolerance band — **exact figure UNSOURCED**; ANS-3.5-2018 App. B Table B.1 is paywalled and the ±2 % I quoted earlier is **withdrawn** (it traces to the 1985 edition) |

**D5 must be rewritten around this.** Its Layer-1 gate becomes a **stated conservation budget with
a number**, not a machine-precision assertion.

### 22.3 What is now unblocked, and what is still open

**Unblocked — no further ruling needed:** the D2 rewrite (§§1, 2, 4, 11.1, 11.2 to scheme B),
D5's re-framing around the new bar, node-count selection via `V_node ≥ Q_max·dt`, and the
plug sub-cell count.

**Still open, and none needs an owner ruling:**
1. **Correlation-layer smoothing is unspecified** — the highest-value gap. THEATRe (1992) and a
   real-time RELAP5-3D paper (2026) independently put the fix here, and **D2 has never looked at
   it.** G3 must be amended to say it forbids smoothing *properties*, not *regime transitions*.
2. **The material Courant number has never been computed** at dt = 0.02 across the nodes — the
   actual stability bound of a semi-implicit solve.
3. **Crossing sub-steps may accrue an unrepaid time deficit.** Both nuclear and Modelica practice
   repay it; PWR2 has the mechanism and it is unverified. Silent failure.
4. **Walls and sensor dynamics untested** — and §20.7's vendor benchmark, where modelling the
   *instrument* beat a finer mesh of the fluid, argues this outranks further solver work.
5. `h_l()`'s clip (a live bug in committed L0), §14.1's over-determined pressurizer closure, ~~CCFL
   constants for downcomer/tie-plate geometry~~ — **CCFL left the required set at §23; the evidence
   pass is no longer owed.**

---

## 23. THIRD RULING (2026-08-14) — LARGE BREAK DROPS TO A DECLARED DEMONSTRATION

*(OWNER RULING, 2026-08-14: "drop it as a design requirement, keep it as a declared demonstration"
— verbatim, adopting the recommendation I put to him. His stated reasons for raising it: "My
argument for removing the requirement is to lower processing requirements and lowering the
potential bug surface area… it's not a main part of what I want to teach but it would be a nice
include." And the reason the DEMONSTRATION half is load-bearing, in his words: "that is what people
seem to want to try first (absent any actual content in the sim).")*

**The finding that forced it: §19.5 and §22.1 justify PWR2's entire node-count ambition on break
location, and `CURRICULUM.md` — RULED 2026-08-03, binding, and the yardstick DESIGN_CRITERIA Q2 is
scored against — already ranks that capability lowest.** Verbatim: *"**Large LOCA (E09)** is
declared **Tier D-adjacent**: it is meltdown-path material and `run_meltdown` already covers it."*
It is not Core; it is not even in the Covered table. **The design set reasoned from IAEA fidelity
comparisons and never checked its central justification against the curriculum ruled binding ten
days earlier.**

**The Core table agrees independently.** Every primary-boundary Core casualty is small, stays at
high pressure, and sits at a **fixed named location** — stuck-open PORV (E07, pressurizer steam
space), small RCS/seal leak (E23, RCP seal), SGTR (E06, SG tube). **No Core casualty is a large
break, and none needs arbitrary break placement.** All three live in the regime §26.3 calls well
resolved, not the reflood regime it declares structurally coarse.

### 23.1 What this changes

| | |
|---|---|
| **Break location** | Narrows to the three named Core paths. Hot-leg and cold-leg breaks stay as **Covered demonstrations** — injectable, directionally correct, **carrying no fidelity claim**. |
| **CCFL** (D2 §23.3, D3 §8) | **Leaves the required set**, and the owed evidence pass for downcomer/tie-plate constants goes with it. The owner's junction-closure insight is preserved in D3 §8 against a future promotion — it is a good design and may return. |
| **`K = 5` vs Courant** | §24.1's live conflict resolves. A heavily voided cold leg (ρ 100 kg/m³ / 6.2 lb/ft³ → C = 0.456, exceeding 1 once sub-cells divide it) is no longer a regime the design must hold. |
| **§26.3's low-pressure limit** | Stops being an embarrassment and becomes the honest label on a demonstration — which is the IAEA-TECDOC-995 *"negative training"* argument (§19.3) applied to our own product. |
| **Node count (§22.1)** | **REOPENED** — §23.2. |

### 23.2 ⚠ THE NODE-COUNT RULING IS REOPENED BY ITS OWN TERMS

§22.1's AMBITION ruling was a **SELECTION from options I wrote**, and §2 records that *"a selection
binds only as far as the option text I offered was accurate."* My option text said break location
is the educational payload. The binding curriculum says it is Tier D-adjacent. **The option
mis-stated its own consequence, so the ruling is open again — no override is required.**

**Do not read this as "the node count drops."** ~12 nodes may well survive on grounds that were
never the *stated* justification: natural circulation needs real thermal centres, boron-as-a-
transported-scalar needs transport length, and telling a seal leak (cold leg) from a stuck-open
PORV (pressurizer) still needs the loop resolved. **That justification is now owed explicitly
rather than inherited.**

### 23.3 What this does NOT do — all three are easy to hope for

1. **It does not clear §8(2)'s stop condition.** That is the **total** RCS volume ledger — 101.4 ft³
   (2.87 m³) unattributed out of 324.2 ft³ of corrections, and a ledger summing to 835.8 ft³
   against a closing sentence citing an orphan 817.8. Per-node splitting was never the failing
   part. **PWR2 is still stopped there.**
2. **It does not reduce steady-state frame cost.** `dt = 0.02` and the node count are fixed, so
   per-frame cost is identical whether a LOCA is running or not. The gain is **headroom and a
   bounded worst case**, not relief for a system that is taxed today.
3. **It does not delete core uncovery.** Superheat and the three-regime property layer (D2 §23.4)
   stay **REQUIRED**: SBO (E04/E05), loss of shutdown cooling (#287) and ATWS (E13) are all **Core**
   and all reach uncovery. Large break was never the only route there — and the committed L0
   cannot express superheat at all today (D2 review, F7).

---

## 24. THE GEOMETRY DECLARATION (2026-08-14) — §8(2)'s stop condition, adjudicated on a measurement

*(OWNER RULING, 2026-08-14: "Go with your recommendations." — approving, of four options put to
him, "declare the uncertainty with the measured number, proceed, and move the residual risk to the
Layer 2 gate", plus a scoped evidence pass on the recalled form-loss coefficients. The rejected
options were: stop the rewrite per §8(2); override the stop condition silently; or a full
bottom-up sourcing pass before anything else.)*

**§8(2) is a stop condition this design set triggered and never cleared.** D3 §1:45, verbatim:
*"D1 §8(2)'s stop condition is currently met — no valid topology-appropriate check exists yet."*
D3 §7 still opens *"§1's shortfall is not closed."* Three cross-checks were tried; all three were
circular or borrowed from four-loop plants and never transferred to a single-loop topology.

### 24.1 The measurement that decides it

**The stop condition was being argued, not measured — which is HR12's exact failure mode, at the
top of the project.** Measured 2026-08-14:

| | |
|---|---|
| Unattributed RCS volume | **101.4 ft³ (2.87 m³)** of a ledger totalling 835.8 ft³ (23.67 m³) |
| **As a fraction of TOTAL volume** | **12.1 %** |
| RCS inventory | 36,810 lbm (16,697 kg) **± 4,470 lbm (2,026 kg)** |
| Time to boil dry at 1 % decay heat (3 MWt) | **91.1 min ± 11.1 min** |

**⚠ A correction worth carrying: the "31 % unattributed" figure repeated through the review and
my own first three reports is 31 % OF THE CORRECTION BUDGET (324.2 ft³), not of the total.**
Against total RCS volume the uncertainty is **12.1 %**. A denominator was inherited three times
without being checked — the same class of error the review was commissioned to find.

### 24.2 Why 12.1 % is a declared limit and not a stop

- **The tier's own benchmark is far worse.** §20.6 records PCTRAN against NOTRUMP on an AP1000
  small break: sequence right, **clock wrong by 20–150 %**, ADS-4 **+151 %**. A 12 % timing
  uncertainty is several times better than the most widely deployed educational PWR simulator.
- **The ruled acceptance bar is directional, not chronometric** (§22.2): directional correctness,
  no missed alarm, no spurious alarm. None of those is failed by a 12 % inventory band.
- **§8(2) conflates two things.** The rewrite's justification (§1) is the `Q = ṁΔh` vantage
  point — *a conservation law the plant can be wrong against* — and that is **topology-
  independent**. It survives unresolved geometry entirely. "Geometry unverified" does not equal
  "rewrite unjustified", and §8(2) as written overstates.

### 24.3 ⚠ THE RESIDUAL, WHICH IS REAL AND IS NOT CLOSED BY THIS DECLARATION

**`Q = ṁΔh` validates mass FLOW. It says nothing about total MASS.** So the gap lands precisely on
inventory behaviour — which is **A4, level is not inventory, the TMI coupling**, the thing this
plant most wants to teach.

And the failure mode is documented: §20.6's Krško case, where a coarse model **actuated an ECCS
system the best-estimate code never actuated at all**. *Whether a 12 % inventory error flips a
setpoint crossing* is the live question, it is not answerable by argument, and **it is not
answerable until Layer 2 exists**. It is therefore **assigned to the Layer 2 gate**, not waved
through here:

> **LAYER 2 OWES:** for each Tier C **Core** casualty, does a ±12.1 % perturbation of RCS
> inventory change *which* protective actions fire, or only *when*? A change in **which** is a
> stop condition again. A change in **when**, inside the declared band, is this declaration
> holding.

### 24.4 What is declared, and what is still owed

**DECLARED** (`DESIGN_COMPANION` §8 class): *PWR2's RCS volume ledger carries a 12.1 % unattributed
fraction. Inventory-dependent timings — boil-off, time to uncovery, ECCS adequacy margins — are
accurate to about ±12 %, and no better. The distribution of that volume between nodes is
provisional.*

**OWED, and scoped deliberately narrow:**
1. **The form-loss coefficients.** D3 §1a-v records them as **RECALLED** (1.5–2.0 per leg, 7.0 for
   grid spacers, 2.5 tube entrance/exit) while being **59 % of the derived pump head** — a 30 %
   error moves the total ~18 %. One evidence pass, bounded. **This is the highest-value single
   sourcing item in the geometry.**
2. The other recalled geometry (plena heights as ratios, SG average tube length ~55 ft, the two
   simultaneously-live loop-length sets) stays provisional and declared, not chased.

**Not owed: a global cross-check.** If every component volume is individually derived from stated
geometry, the total validates componentwise and there is nothing left for a global check to check.
That reframing is what makes §8(2) tractable — it was written assuming a total that could only be
validated from outside.

---

## 25. ⛔ THE A/B REFERENCE IS DRIFTING — observed 2026-08-15, not predicted

**§2 states: *"`engines/pwr/` IS NOT TOUCHED. Not 'mostly' — at all. A reference that drifts is
not a reference, and every A/B number taken before a change to it would be invalidated."*
That sentence is now FALSE as a description of what is happening.**

Observed by the lane check at the start of a build tick. In the ~81 minutes before it, another
agent working **#472 on the `workbench` lane** committed five times, and the diff against the
session's starting point is:

```
engines/pwr/pwr_config.js         +58
engines/pwr/pwr_pressurizer2.js  +427 / -38
test/run_pzr2.js                 +588  (new)
```

Commit subjects include *"v2 takes the engine path — and a trip now drops 231 psi and STAYS
there"* and *"the surge line becomes a named boundary"*. **This is real physics work on the very
engine PWR2 declares frozen.**

### 25.1 What is and is NOT damaged

**NOT damaged, and this is the important half: PWR2 has taken ZERO A/B measurements.** The A/B
harness (D5 §2) is not built. Nothing in this design set quotes a number obtained from
`engines/pwr/` at runtime — the comparisons made so far are against *sourced documents* and
against IAPWS-95, neither of which #472 can move. **No existing PWR2 result is invalidated.**

**Damaged: the CLAIM in §2, and the assumption behind D5's whole A/B plan.** "Freeze the old
engine and diff against it" silently assumed a stationary target. It is not stationary, and
nothing was ever going to stop it — **§2's freeze is a rule this design set wrote for itself
and has no authority to impose on another workstream.** #472 is legitimate, owner-sanctioned,
`priority-high` work that predates the PWR2 decision.

### 25.1a ✅ RULED 2026-08-15 — re-baseline against a stated commit

*(OWNER RULING, 2026-08-15: "Do A/B decision as you recommend." — selecting, of three options
put to him, re-baselining against a stated commit. The rejected two were asking #472 to hold
`engines/pwr/` frozen for the length of the rewrite, and forking a private read-only snapshot
for PWR2 to diff against.)*

**The A/B reference is `engines/pwr/` AS OF A NAMED COMMIT, recorded by SHA in the A/B harness
itself, and re-baselined deliberately whenever it moves.** Not "frozen" — that was never in this
design set's power to promise.

**AND THE REFERENCE TREE IS THE `workbench` WORKTREE** *(OWNER DIRECTIVE, 2026-08-15: "For A/B
testing, test it against the workshop worktree." — read as `C:\grok_build\RD_workbench`, the
only lane matching that name and the one carrying the live engine work. Flagged rather than
assumed silently: if `develop` was meant instead, this line is the thing to correct.)*
That is the right choice for the reason §25 exists — **workbench is where the engine is actually
being developed**, so diffing against it compares PWR2 to the newest real plant rather than to a
stale copy. It also means #472's pressurizer rebuild is INSIDE the reference by construction,
which is what step 3 below was asking for.

**What the harness must therefore do**, and D5 §2 owes these:
1. **Record the reference SHA in its own output.** An A/B result that does not say which reference
   it ran against is not a result.
2. **Refuse to run against a dirty or unknown reference tree** — the same reasoning as the
   vacuity guard: a comparison whose baseline you cannot name is indistinguishable from one you
   made up.
3. **Take the first baseline from the `workbench` worktree after #472 lands**, not before, so the
   pressurizer rebuild is inside the reference rather than straddling it.
4. **Treat a reference move as a re-baseline event, not a regression.** When the SHA changes, old
   divergences are void until re-measured — they were measured against a different plant.

**The honest cost, stated:** this is a weaker guarantee than §2 promised. Divergences can no
longer be attributed to PWR2 alone without checking whether the reference moved underneath them,
and that check is now part of the method rather than an assumption.

### 25.2 The consequence, stated plainly

**PWR2's A/B baseline must be taken AFTER #472 lands, not before** — and whatever the reference
is on that day is the reference, permanently, because the same thing will happen again with the
next issue. The honest reframing:

> The A/B reference is not "the old engine, frozen". It is **the old engine as of a stated
> commit**, recorded with that SHA, and re-baselined deliberately when it moves.

That is a weaker guarantee than §2 promised and it should be written down as such rather than
discovered during the A/B.

### 25.3 And it is why Layer 5 did NOT start with the pressurizer

§6's risk register said *"D3 consumes its design; must not race it"*, and this tick was scheduled
to build the pressurizer. **It did not, because #472 is producing pressurizer physics right now
and building a second one in parallel is exactly the race that row names.** The conservation core
already carries the seat for it (Layer 2's `extraMass` hook, exercised by Layer 3's measurement
that a rigid loop is 1.06 MPa stiff without a bubble), so the interface is ready and the physics
can be consumed rather than reinvented.

> **⛔ CORRECTION, 2026-08-15: "the interface is ready" WAS FALSE WHEN WRITTEN, and stayed false
> for a fortnight.** Layer 2 owned the `extraMass` hook, but **`createLoop` never forwarded
> `opts.extraMass`** — so the seat existed and *nothing above Layer 2 could sit in it*. Every
> plant built at Layer 3 or above was RIGID, including every plant in the A/B harness and every
> probe in four gates.
>
> Found by a CVCS inventory probe that could not add 111 kg without pegging at the property
> table's 18 MPa ceiling. Fixed, and guarded at the layer that dropped it — **by its EFFECT, not
> by the option's presence**: an argument that arrives and is never read is the same defect
> wearing a passing check. The Layer 3 gate now measures 0.1551 MPa with a bubble against 0.2115
> rigid.
>
> **The lesson is about how the claim was made.** "The seat exists" was verified by *reading
> Layer 2*, never by *building a plant through Layer 3*. That is the same shape as §28.3's
> retracted coverage claim: a structural fact asserted from the code that happened to be open,
> rather than from the path the code is actually used on. **An interface is ready when something
> has come through it, not when both ends exist.**
>
> **Flagged for #472, and deliberately not answered here:** an `f(P)` hook is a COMPRESSIBILITY
> term, not an inventory buffer. A real pressurizer absorbs an insurge by its LEVEL rising into
> the steam space — a state, not a function of pressure. Whether the hook's shape is sufficient
> is that issue's call, and §25.3's whole point is not to race it.

---

## 26. ⛔ THE PERFORMANCE STOP CONDITION IS TRIGGERED — measured 2026-08-15

**§8(1) names this as a stop condition:** *"If the conservation core cannot hold ~35 s for 12
plant-hours at `dt = 0.02`, the design's central premise (a real node model at the service's
fixed cadence) is wrong and should be re-opened rather than optimised around."*

**Measured, on the built stack:**

| | steps/s | vs real time | 12 plant-hours takes |
|---|---|---|---|
| **The budget** | **61,700** | 1234× | **35 s** |
| Layer 2 core alone, 11 nodes | 900 | 19× | 2,303 s |
| Layer 3 loop | 900 | 19× | 2,305 s |
| Layer 4 plant | 600 | 12× | **3,617 s** |

**Over budget by 103×.** This is not marginal and it is not noise.

### 26.1 The cause is located exactly, and it is NOT the node model

| call | cost | why |
|---|---|---|
| `T_sat(P)` | 0.04 µs | a polynomial |
| `h_l_sat(T)` | 0.02 µs | a polynomial |
| **`P_sat(T)`** | **3.30 µs** | **a 60-iteration BISECTION** |
| `h_l(T,P)` | 3.15 µs | calls `P_sat` |
| `T_from_h(h,P)` | 32.5 µs | Newton on `h_l` → ~10 × `P_sat` |
| **`rho_from_h(h,P)`** | **31.5 µs** | **THE HOT PATH** |

The pressure solve evaluates `rho_from_h` once per node per bracket iteration — about **132 calls
per step**, which at 31.5 µs is 4.2 ms/step, and that is the whole of the measured cost.

**So the premise "a real node model at a fixed cadence" is NOT what failed.** The node model is
cheap. What is expensive is evaluating water properties by iterating on an iteration: a Newton
inverse whose every residual costs a 60-step bisection.

### 26.2 THE FIX IS ALREADY RULED, AND IT WAS NEVER BUILT

**D2 §23.4**, verbatim: *"Tabulate `v`, not `ρ`, on `(quality, P)` with x = 0 and x = 1 as exact
grid lines, so the kink lands ON a node line rather than being averaged away: **87 kB, 50 ns,
0.06 %**, kink reproduced."*

**50 ns against the measured 31,500 ns is 630×.** Applied to the measured 600 steps/s that is
~378,000 steps/s — comfortably inside the 61,700 the budget needs, with margin to spare.

`PWR2_L0_REBUILD.md` §6 already lists the table as owed: *"The `(quality, P)` specific-volume
table ruled in D2 §23.4 is NOT built. This library computes mixture density from `h` and `P`
directly."* That entry was written as a tidiness note. **It is not tidiness — it is the
difference between meeting the design's own performance stop condition and missing it by 103×.**

**A cheaper partial fix also exists and is worth measuring before the table:** `P_sat`'s
60-iteration bisection is absurd for a smooth monotone curve. A Newton on `T_sat` would be
~10× faster and keeps the one-curve-one-source-of-truth rule the design insists on (what it
forbids is a *second independent inverse fit*, not a better solver). That alone may be ~10×,
which is not enough on its own — but it is an afternoon, and it would tell us whether the
table is the whole answer or only most of it.

### 26.3 What this does and does not mean

**It does NOT refute the design.** §8(1) says a performance failure means the premise "should be
re-opened rather than optimised around" — but that sentence assumed the failure would be in the
node model. It is not. It is in an optimisation the design **already ruled and nobody built**.
Reopening the premise on this evidence would be the wrong call.

**It DOES mean the build order was wrong.** The property table was treated as an optimisation to
do later; it is a precondition. Layers 2–5 have all been built and gated against a property
library 630× slower than the ruled one, and every performance figure taken so far is meaningless
until it exists.

---

## 27. ⚠ THE TABLE IS FAST ENOUGH AND ITS DERIVATIVE IS NOT — measured 2026-08-15

**Wiring §26's property table into the conservation core was attempted, measured, and REVERTED.**
The speed result is real and worth banking; the reason for the revert is a finding that matters
more than the speed.

### 27.1 The speed result — the stop condition CAN be cleared

| | steps/s | 12 plant-hours |
|---|---|---|
| Before (D1 §26) | 600 | 3,617 s |
| **Table wired in** | **95,200** | **23 s** |
| Budget | 61,700 | 35 s |

**159× on the stack, and inside budget with margin.** Getting there took two fixes, and the
second is the instructive one: after the table went in, **Layer 4 was still 7× the cost of
Layer 3**, because `buoyancy()` called the DIRECT path twice per step — two calls at 31,500 ns
that were simply missed when the table landed. **A hot path is only as fast as the slowest call
still in it**, and 63,000 ns of a 65,000 ns step hid behind a helper nobody thought of as hot.

### 27.2 Why it was reverted — an accuracy target on a VALUE says nothing about its DERIVATIVE

The table meets the ruled 0.06 % on ρ. Its **dρ/dP is wrong by ~50 % at the scale the solver
actually uses**:

| probe | error in dρ/dP |
|---|---|
| ±0.02 MPa — *what a timestep moves* | **−57.6 %** |
| ±0.10 MPa | −10.1 % |
| ±0.40 MPa — *one grid interval* | **−0.1 %** |

**That is not a bug, it is what a piecewise interpolant does:** the derivative is right on average
across an interval and quantised within it. The pressure LEVEL was fine and the pressure RESPONSE
was not — and the response is what **A3, "pressure follows temperature"**, is made of. Three layer
gates went red on exactly that: the pressure rise from heating one node changed by 2×.

**Two fixes were tried and neither worked**, which is what identified the real cause. Cubic
interpolation in P (safe there — the kink lives on the x axis, not the P axis) moved the error
from 57 % to 49 %. Applying it to the 2-D wing as well: 49 % to 50 %.

**THE ACTUAL CAUSE IS A STRUCTURAL CHOICE IN THE WING, AND IT IS MINE.** The subcooled wing is
stored as a ratio to `v_f(P)` — but `v_f` varies strongly with pressure, because `T_sat` does. So
subcooled `v` is reconstructed as a product of two strongly P-dependent terms whose derivatives
very nearly cancel, and the small residual difference IS the compressibility. Differencing two
large nearly-equal numbers to get a small one is the classic way to destroy a derivative. The
ratio trick fixed the *value* accuracy in the wings (§26) and broke the *derivative* doing it.

### 27.3 What is owed

1. **The subcooled wing must not be normalised to a strongly P-dependent edge.** Subcooled `v` is
   nearly flat in pressure, so it should be stored directly, with enough resolution to carry the
   compressibility — or the compressibility should be applied ANALYTICALLY on top of a
   P-independent table, which is what `rho_l` already does (`ρ_sat(T)·(1 + (P−P_sat)/B)`).
2. **Add a dρ/dP check to the table's gate.** Its current 17 checks all assert VALUES, and every
   one of them passed while the derivative was 50 % wrong. That is the same shape as the review's
   F-findings: a gate that measures the quantity you named rather than the quantity that matters.
3. Re-wire and re-measure only after both. **The 159× is available and should not be taken on
   terms that break A3.**

---

## 28. ✅ THE TABLE IS WIRED IN — all three items of §27.3 discharged, measured 2026-08-15

**The subcooled branch was rebuilt on §27.3(1)'s second option — analytic compressibility on top
of a pressure-independent table — and it works.** The wing is gone. Subcooled density is now
reconstructed the way `rho_l` computes it, from six 1-D arrays indexed on **enthalpy** rather than
temperature:

```
ρ(h,P) = ρ_sat(h_s) · (1 + (P − P_sat(h_s)) / B(h_s))      h_s = h − k_comp·(P − P_sat)
```

`h_s` is the saturated-liquid enthalpy that the subcooled state at (h, P) came from, and it
depends on P through the same compressed-liquid enthalpy term Layer 0 was refit to carry. It is
solved by **two fixed correction passes** — not iterated to convergence, because the cost of a
third pass is real and the second already lands the error two decades under target.

| | ruled | measured |
|---|---|---|
| ρ accuracy, operating envelope | 0.06 % | **0.0072 %** |
| dρ/dP at ±0.02 MPa — *the §27.2 failure* | — | **0.1 %** (was −57.6 %) |
| cost per call | — | **119 ns** (direct: 31,500 ns) |

**Why two passes and not one.** One pass measured −0.0674 % against the 0.06 % target — a *miss by
12 %*, close enough to be tempting to re-band. Raising `NH` 600 → 2000 did not clear it either;
the residual is the correction, not the resolution. The second pass clears it by a factor of nine.
**The threshold was not moved**, which is the point: the ruled number is what the design owes, and
an accuracy target that gets re-banded when the implementation misses it has stopped being a
target (`CLAUDE.md`, the `ops_cvcs_pzr_drain_rate` precedent).

### 28.1 The stack result

| | steps/s | 12 plant-hours | budget |
|---|---|---|---|
| D1 §26, direct correlations | 600 | 3,617 s | 35 s |
| **Table wired, derivative correct** | **118,600** | **18 s** | 35 s |

**198× on the stack and 2,372× real time**, inside budget with a factor of two in hand. §26's
performance stop condition is **CLEARED**. Note the number beat §27.1's own 95,200 — the same
wiring is faster now than it was with the broken wing, because the wing's 2-D interpolation was
costing more than the analytic form that replaced it. *The correct physics was also the cheaper
code*, which is not usually how that goes and is not a general lesson.

### 28.2 The trap this landed on the way through

**Re-wiring silently invalidated an injection-self-test anchor.** Swapping `W.rho_from_h` for the
resolved-once `RHO` alias changed the text of the line one of the core gate's twelve mutations
patches. The gate reported `ERROR anchor not found` and **failed** — which is the design working:
an anchor-miss is counted as a blind spot, not skipped. Had it been silently skipped, the core
gate would have gone on reporting `12/12 caught` while testing eleven. **A source-patching gate
has a second contract with the source it patches, and a refactor breaks it without touching
behaviour.** The check for it must be a hard error, and here it was.

### 28.3 ❌ RETRACTED — "four of the seven layer gates have no injection self-test" was FALSE

**Every one of the seven has one. Measured 2026-08-15:**

| layer | checks | mutations | caught |
|---|---|---|---|
| 0 water | 231 | 26 | 26 |
| 0b table | 23 | 12 | 12 |
| 1 geometry | 29 | 13 | 13 |
| 2 core | 33 | 12 | 12 |
| 3 loop | 26 | 8 | 8 |
| 4 sources | 16 | 9 | 9 |
| 5 SG | 21 | 12 | 12 |
| | | **92** | **92, no blind spots** |

**How the wrong claim got made, because it is the instructive part.** An earlier table in this
session's `TUNING_LOG` entry listed the mutation counts for Layers 0, 0b and 2 and wrote "—" for
the other four. That dash meant *I did not look*. §28.3 then read it as *there are none*, built an
argument on it, and the claim propagated into a commit message and into two status reports to the
owner as outstanding work. **Nobody had run the gates.** One command would have settled it, and
the same command was already in this file's own instructions.

**`CLAUDE.md` names this exact class and I am the one who tripped it:** *"A claim about COVERAGE is
an unmeasured claim — prove it by injection"*, and *"Inherited claims are the risky ones … repeating
it in your own voice launders it into a fresh assertion."* The inherited claim here was **my own,
from ninety minutes earlier**, which is worse rather than better — it carried no external
provenance to make me suspicious of it.

**And the argument built on top of it was persuasive.** §28.3 reasoned that the gap "matters more
here than in most repos" because value-only checks had burned this session twice, and named Layer 4
— *whose buoyancy term returned exactly 0.0 from a sign error* — as uncovered. Every clause of that
was true except the premise. **A correct, well-evidenced argument from a false premise reads
exactly like a finding**, and this one survived a design-doc write-up, a commit message and two
reports without anyone, including me, running the command.

*(The genuine gap the original §28.3 was groping at: mutation COUNT is not coverage. Layer 3 has 8
and Layer 0 has 26; whether 8 is enough for the loop topology is a real question, and it is not
answered by the fact that all 8 pass. That question stands — but it is a different, smaller claim
than the one retracted here, and it will be measured before it is written down.)*

### 28.4 What is NOT claimed

The fallback path is still live: with the table absent, Layer 2 and Layer 4 both fall back to the
direct correlations, resolved once at load rather than branched per call. That is deliberate and
is not dead code — it is how *"table or physics?"* stays answerable when a future disagreement
needs to be attributed. **The layer gates load the table**, so what is gated is the production
path; the fallback is exercised only by Layer 0's own 231 checks.

---

## 29. THE A/B HARNESS IS BUILT, AND ITS FIRST RUN FOUND TWO THINGS — 2026-08-15

`tools/pwr2_ab.js`. Discharges D5 §2 and all four obligations §25.1a placed on it: it prints the
reference SHA, **refuses** to run against a dirty or unreadable reference tree, refuses to record
a baseline while #472 is open, and states that a reference move voids prior divergences.

**It lives in `tools/`, not `test/`** — `run_all` auto-discovers `run_*.js` and fails on any
runner with no baseline, but this harness's exit code tracks the state of `RD_workbench` and of
GitHub rather than the state of this repo. As a gate it would redden for reasons no change here
could fix.

**Reference: `RD_workbench` at `cd30778`, clean.** Exploratory — no baseline recorded, because
#472 is OPEN and §25.1a(3) puts the first baseline after it lands.

| quantity | reference | PWR2 | delta |
|---|---|---|---|
| hot leg | 609.9 °F | 625.0 °F | +15.2 (+2.5 %) |
| cold leg | 550.5 °F | 567.3 °F | +16.9 (+3.1 %) |
| loop ΔT | 59.4 °F | 57.7 °F | **−1.7 (−2.9 %)** |
| SG steam pressure | 825.3 psia | 735.8 psia | **−89.5 (−10.8 %)** |
| SG saturation temperature | 521.8 °F | 508.7 °F | −13.1 (−2.5 %) |
| SG duty | 300.0 MWt | 301.7 MWt | +1.7 (+0.6 %) |

*(The saturation-temperature row is CORRECTED — it first read 550.8 °F / −7.6 %. See §29.4.)*

Not compared, and the harness says so on every run rather than omitting them: **RCS pressure**
(PWR2 has no pressurizer — §25.3), **level** (mass fraction only; a level is a geometry map owned
by the instrument layer), **the SG tube-bundle metal node** (the reference has one; PWR2's lumped
secondary does not), and **anything on a transient** (PWR2 has no control layer, so a transient
diff would compare an absent controller against a live one and call it physics).

### 29.1 ⚠ FINDING — `ratedU()` and `stepSG()` disagree about which temperature drives the SG

`ratedU()` derives U at **Tavg = 304.5 °C**, the ruled value. `stepSG()` is called with the
**`sg_primary` node temperature, 297.4 °C** — 7.1 °C (12.8 °F) below it. The heat-transfer
coefficient is therefore correct for a temperature the call site never passes, and the secondary
has to sit low to move the same duty:

```
driving dT at settle   32.58 C     ratedU derived at 32.39 C    <- U itself is fine
T_sec at settle       264.8 C      T_sat(825 psia) = 272.1 C    <- 7.3 C (13.1 degF) low
```

**That is the whole 89.5 psi.** It is a self-consistency defect between a derivation and its call
site — Layer 5's, and mine — not a property-library or conservation error. The design question
underneath it is real and is not settled here: *what temperature drives a LUMPED steam generator?*
Tavg, the primary outlet, or an LMTD. Whichever is chosen, **`ratedU()` must be derived at the
same one the call site passes**, and today it is not.

### 29.2 ❌ WITHDRAWN — "the loop settles 16 °F above the ruled Tavg" was an artifact. See §29.5.

Measured Tavg **313.4 °C (596.1 °F)** against the ruled **304.5 °C (580.1 °F)** — 8.9 °C
(16.0 °F) high. **This is NOT §29.1 in disguise, and the sign is how you can tell**: correcting
§29.1 raises the secondary temperature, which raises the primary further. Fixing the SG
inconsistency makes this divergence *worse*, to roughly 16 °C.

Stated as open rather than explained. The loop ΔT is right to 2.9 % and the duty to 0.6 %, so
what is wrong is the absolute level, not the transport — which points at the SG's area or the
inventory the temperature is being carried by, and neither has been measured yet.

### 29.3 The trap, and it is the one that matters most in this section

**AN A/B HARNESS IS A MEASURING INSTRUMENT, AND ITS OWN ERRORS PRESENT AS PHYSICS FINDINGS.**

Its first run reported a loop ΔT of **−57.7 °F against the reference's +59.4 — a −197 %
divergence**. There was nothing wrong with the plant. The harness had mapped "hot leg" onto the
node where heat is *removed*. Swapped, the same two numbers agree to **2.9 %**.

**−197 % is loud enough that somebody checks. The same mistake in a smaller place produces a 5 %
divergence that gets filed and chased into the engine**, and the engine is where nobody would
find it, because it is not there. So the fix is not "read the labels more carefully" — the
harness now **asserts that the node it calls hot is hotter**, and that the reference reached
power at all, and refuses rather than printing. This is the `run_reachability` lesson arriving in
a new place: a comparison that cannot fail for a structural reason is not a comparison.

### 29.4 ⛔ AND THEN IT HAPPENED AGAIN, QUIETLY, IN THE TABLE UNDER THAT WARNING

**§29.3's prediction was tested within the hour and it was right.**

The secondary-temperature row above was taken from the reference's `t_sg_c`. That field is **not a
saturation temperature**: `CONTEXT.md` §6.3 defines it as the **SG tube-bundle node** — a metal
temperature, `Tavg − split·(Tavg − Tsec)` — and it sits **29.0 °F above** the real saturation
temperature. Compared against PWR2's `T_sec` it reported **−7.6 %** where the truth is **−2.5 %**.

**The first error printed −197 % and was caught in minutes. This one printed −7.6 %, which is
precisely the "5 % divergence that gets filed and chased into the engine" §29.3 had just
described** — and it was filed, in #482, before it was caught. The warning did not stop it,
because **a warning addressed to a careful reader is not a check.**

**What would have caught it, with no knowledge of what any field name means.** For saturated
water, pressure and temperature are LOCKED. A −10.8 % pressure divergence and an *independent*
−7.6 % temperature divergence cannot both be true of the same saturated secondary. **The two rows
disagreed with each other**, and that is checkable arithmetic rather than a judgement about
semantics. Corrected, they are the same −7.3 °C on the saturation line and now agree.

`satPairOK()` therefore checks each side's secondary against its **own** saturation line before
anything is compared across plants, and the reference's saturation temperature is **derived from
its own pressure rather than read from a field** — deriving it cannot pick up the wrong field.
Verified by injection: re-pointing the check at `t_sg_c` refuses with *"reports 550.8 degF at
825.3 psia, where T_sat is 521.8 degF (29.0 degF off)"*.

**The general rule this is an instance of: when two compared quantities are physically coupled,
the harness can check the COUPLING without understanding either one.** That is a much stronger
guard than knowing what the fields mean, because it survives someone else renaming them.

---

### 29.5 ⛔ AND A THIRD TIME — the plant was never at steady state, so most of §29 was measuring a transient

**The harness drove the secondary at a fixed `feed = steam = 165 kg/s`, open-loop.** That removes
~302 MWt against 300 MWt of core power, so the plant does not settle — **it cools monotonically,
Tavg falling 599 → 509 °F over an hour with no equilibrium in sight.** `runPWR2` described itself
as taking the plant to "a settled full-power condition". It was a claim the function made about
itself and never tested.

**A drifting number is not wrong at any particular moment. It is meaningless**, and it is worse
than the first two errors for exactly that reason: there is no correct value to compare it to.

**The fix is a steam demand that takes exactly the heat delivered**, holding the secondary at its
design pressure — which is what the reference plant's control layer achieves. With it the plant
settles in under ten minutes and is bit-identical at 30 and 60. **Both sides now assert
convergence and refuse rather than print**: the run continues 20 minutes past the read point and
bails if anything moved.

#### What the corrected A/B says

| quantity | reference | PWR2 | delta |
|---|---|---|---|
| hot leg | 609.9 °F | 608.5 °F | −1.3 (−0.2 %) |
| cold leg | 550.5 °F | 552.2 °F | +1.8 (+0.3 %) |
| **loop ΔT** | 59.4 °F | 56.3 °F | **−3.1 (−5.3 %)** |
| SG steam pressure | 825.3 psia | 825.0 psia | −0.3 (−0.0 %) |
| SG saturation temperature | 521.8 °F | 521.8 °F | −0.0 (−0.0 %) |
| SG duty | 300.0 MWt | 301.4 MWt | +1.4 (+0.5 %) |

**Everything agrees to within 0.5 % except the loop ΔT, which is 5.3 % low. That is the one real
divergence Layers 0–5 have** — and it is a flow question (ΔT = Q / (W·cp)), so it belongs to
Layer 3's derived junction flows, not to the SG.

#### §29.1 is confirmed, and its "unsettled design question" is settled by measurement

§29.1 framed the driving temperature as an open choice between Tavg, primary outlet and LMTD.
**It is not a matter of taste.** Held at design pressure, the settled Tavg is:

| drive temperature | settled Tavg | vs ruled 580.1 °F / reference 580.3 °F |
|---|---|---|
| `sg_primary` node — *as the harness called it* | 607.79 °F | **+27.5 °F** |
| **Tavg** — *what `ratedU()` already derives at* | **580.36 °F** | **+0.06 °F (+0.01 %)** |

Tavg reproduces this plant's ruled temperature **and** the reference engine to 0.01 %. The other
candidates are simply wrong here. **The defect was never the choice — it was that the contract was
unstated**, so `stepSG(sg, someTemperature, …)` accepted whatever a call site happened to hold.
Layer 5 now exports **`primaryTavg(sys)`** and the Layer 5 gate pins the *settled temperature*
rather than the argument, because an argument-shaped check would pass for a helper returning the
wrong number.

#### §29.2 is WITHDRAWN

"The loop settles 16 °F above the ruled Tavg" was the cooldown, read at an arbitrary moment. At
30,000 steps Tavg read 596.1 °F; at 40,000, 592.3 °F. **The number was a function of how long the
harness ran.** Corrected, hot and cold legs agree to 0.3 %.

**And the sign argument in §29.2 — "fixing §29.1 makes this worse, which is how you can tell they
are two findings" — was reasoning from the broken harness.** It was even reproducible: on the
unbalanced secondary, driving off Tavg did move Tavg the wrong way, 592.3 → 598.5 °F. **A
consistent, repeatable, mechanistic-sounding argument built on an instrument that was lying.**
That is the part to remember, because it did not feel like a guess.

#### The pattern across §29.3, §29.4 and §29.5

Three errors, all in the measuring instrument, none in the plant: a swapped label, a mislabelled
field, an unconverged run. **Each was caught only by a check that could FAIL — never by care,
and never by the warning written after the previous one.** §29.3 warned in prose and §29.4
happened anyway, one table below it. What actually holds now is three assertions: the hot node
must be hotter, each secondary must sit on its own saturation line, and both plants must still
be where they were 20 minutes later.

---

## 30. THE LAST DIVERGENCE IS AGAINST A `[tune]` CONSTANT, NOT AGAINST PHYSICS — 2026-08-15

§29.5 left exactly one row outstanding: **loop ΔT 56.0 °F against the reference's 59.4 °F, −5.7 %.**
Chasing it produced the most important result the A/B has given so far, and it is a result about
**what an A/B comparison is allowed to conclude.**

### 30.1 The reference's ΔT is authored. PWR2's is emergent.

```
engines/pwr/pwr_config.js:392
      delta_T_rated: 33.0,         // hot/cold leg split at rated, °C [tune]
```

**59.40 °F is exactly 33.00 °C.** The reference does not *arrive* at that split — it is told it,
and `pwr_thermal` scales it as ΔT = `delta_T_rated`·Q/W. PWR2's 56.0 °F falls out of an enthalpy
balance across eleven nodes with a flow computed from geometry and hydraulics. **Nothing in PWR2
can be adjusted to produce 33.0 °C, because PWR2 has no `[tune]` — that was §3's ruling and this
is the first place it bites.**

So the divergence is *emergent value vs authored value*. **An A/B against a `[tune]` constant
cannot tell you PWR2 is wrong.** It can only tell you the two disagree, which was already known
the moment one of them was a tuning knob.

### 30.2 What DOES adjudicate it: the sourced flow

HR9 says the plant is ground truth and content follows. Here the reference's ΔT is *content* — an
authored number — so the tie-break has to come from a source. It does:

| | RCS flow | vs the sourced ~34,500 gpm |
|---|---|---|
| **sourced anchor** — `Manuals/12`, corrected this session | ~34,500 gpm | — |
| **PWR2**, computed from geometry + hydraulics | **35,092 gpm** | **+1.7 %** |
| reference, implied from its ΔT under IAPWS-95 properties | 34,472 gpm | −0.1 % |
| reference's own `rcs_flow_gpm` constant | 24,000 gpm | **−30.4 %** |

**PWR2 lands within 1.7 % of the sourced flow without being told it** — the geometry, the loss
coefficients and the pump curve produce it. That is the check that matters, and it passes.

**The last row is a finding about the reference and is left where it is.** `rcs_flow_gpm: 24000`
disagrees with the flow its own thermal model implies by 30 %; the comment marks it "not
displayed — the board shows % of rated", so nothing reads it as an absolute. It is `engines/pwr/`
and #472's territory, **not PWR2's to fix**, and it is recorded rather than chased. It is also the
same 24,000 figure this session corrected in `Manuals/12` to ~34,500.

### 30.3 A 0.55 % omission in the A/B drive, declared

The reference's SG duty is *rated core heat **plus** full-flow RCP heat* —
`pump_heat_frac: 0.0055`. The A/B drives PWR2 with `corePower: 300000` and no pump heat, so
~0.3 °F of the ΔT gap is the harness, not either plant. Too small to change the conclusion,
large enough that leaving it unstated would make the remaining number look cleaner than it is.

### 30.4 The rule this establishes for every future A/B

**Before treating a divergence as a PWR2 defect, check whether the reference's side of it is
`[tune]`.** The reference engine has 89 `[tune]` constants. Each one is a number somebody chose,
and a disagreement with a chosen number is not evidence about physics — it is evidence that a
choice was made. The A/B's authority runs only as far as the reference's own derivations do.

**This is HR9 pointed at the A/B itself**: the reference engine is not ground truth, the plant is,
and where the reference is authored the adjudication must come from a source. Getting this
backwards would have PWR2 fitted to a tuning knob — which is exactly the outcome §3 banned `[tune]`
to prevent, arriving by a route §3 did not anticipate.

### 30.5 Two more of the same family, caught by the same habit

**`primaryTavg()` averaged the LUMPS, not the LEGS.** Built and gated an hour earlier (§29.5), it
took the mean of the `core` and `sg_primary` nodes — volume averages — where Tavg is by definition
(Thot + Tcold)/2, and this plant has explicit `hot_leg` and `cold_leg` nodes. **`run_pwr2_sg`'s own
`tavg()` helper had used the legs all along**, so one layer carried two helpers disagreeing about
what Tavg means. Measured cost today: **0.14 °F** (580.36 against 580.50). Fixed anyway, with a
mutation re-arming it — the two come apart the moment the core and the hot leg stop sharing an
enthalpy, and then a rounding error becomes a divergence someone chases.

**And the check written to catch it had an unphysical fixture, twice, in opposite directions.**

| fixture | `|hot − cold|` | why |
|---|---|---|
| one 0.02 s step | **0** | plant starts uniform; nothing had propagated |
| 3,000 steps, 300 MW in / 100 MW out | **0** | 200 MW imbalance cooked the loop; **both legs pegged at 800 °C**, the water library's ceiling |
| 3,000 steps, 300 MW in / 300 MW out | 31.7 °C | balanced, inside the declared envelope |

Both failures read as *the helper is broken*. **An unphysical fixture does not announce itself — it
produces a clean, symmetric, entirely believable zero.** This is the fourth unphysical probe this
session (§29 records three others: 300 MW into a closed loop with no sink, a primary started 20 °C
below the design point, a duty reversal probed above the secondary saturation). The pattern is
consistent enough to state as a rule: **when a check fails, measure the FIXTURE before you believe
the subject** — and a zero that is exactly zero is a structural tell, not a small number.

---

## 31. MUTATION COUNT IS NOT COVERAGE — measured, and both layers probed had blind spots

§28.3's retraction left one honest question behind: *all 92 mutations pass, but is 92 enough?*
Layer 3 had 8 where Layer 0 had 26, and **the fact that all 8 pass says nothing about the 9th.**
That was written down as unmeasured. It has now been measured, by the only method that can answer
it: **write mutations the gate has never seen and count the survivors.**

| layer | curated | adversarial probes written | **survived (blind spots)** |
|---|---|---|---|
| 1 geometry | 13 | 4 | **3** |
| 2 core | 12 | 6 | **2** |
| 3 loop | 8 | 8 | **4** |
| 4 sources | 9 | 6 | **2** |
| 5 SG | 12 | 5 | **2** |
| 0b table | 12 | 4 | **1** |

**Fourteen survivors across six layers probed here, plus 11 of 19 on Layer 0 by an outside
reviewer before this session (§31.1c). Thirteen were real defects. The fourteenth was not, and it
is the most useful of them. EVERY layer probed had them** — including the conservation
core with twelve curated mutations and the geometry table with thirteen. **The count was never the
thing.**

### 31.1 Every single blind spot was CONSTRUCTION or STRUCTURE, never physics

| layer | what survived | why it matters |
|---|---|---|
| 3 | `sys.ring = RING` aliases the module constant | one plant mutating its ring re-plumbs every plant made after it — in the same process, which is how these gates run |
| 3 | the shipped default loop flow (1630 kg/s) | what every probe silently inherits when it does not say otherwise |
| 3 | the shipped default enthalpy (1250 kJ/kg) | same |
| 3 | junction flows seeded at **zero** | **heals within one step**, so every settled-state check is blind; it corrupts only the first step, where 8 of 9 junctions carry nothing |
| 4 | `opts.pumpTripped` ignored at construction | every loss-of-flow and blackout probe would silently start with a *running* pump — a whole casualty family testing nothing |
| 4 | caller options dropped: `createLoop(opts)` → `createLoop({})` | **the worst defect this layer can have**: everything still runs, and every initial condition is a lie |
| 2 | **`extraMass` dropped at construction** | this is **the seat the pressurizer plugs into** (§25.3) — a gate blind to its absence is blind to the pressurizer never connecting |
| 2 | caller `iterCap` ignored | every plant silently pinned at 8 while appearing to accept the argument |
| 1 | **a segment dropped from the `LOOP` map** | Layer 4 computes SUM(L/A) from whatever keys it finds, so the momentum inertia silently shrinks — **two tables that must describe the same loop, with nothing asserting they do** |
| 1 | the declared omitted-inertia fraction zeroed | a declaration set to zero stops being a declaration |
| 1 | a fourth form-loss family appearing unannounced | a change of basis wearing the shape of a tweak |
| 5 | caller `mass` ignored | **how a boil-dry is staged** — every such probe would run a healthy generator while reporting a sick one |
| 5 | caller `U` ignored | **how fouled or plugged tubes are staged** — same |

**The curated mutations in both layers attack the STEP** — ring order, junction derivation, closure,
buoyancy, coastdown, friction, momentum. That is what those layers are *interesting for*.

> **A mutation set written from "what is this layer FOR?" inherits that question's blind spot.**
> The step is where the physics is; **construction is where the physics gets its inputs**, and
> nothing was defending it because nothing was thinking about it.

This is a sharper form of the trap `CLAUDE.md` already carries about de-energization healing itself
on the next button press. The zero-seed is the same shape: **a wrong initial condition that the next
update repairs is not benign — it is unobservable.**

### 31.1b Layer 5's two are the ones with teeth, and they are not incidental

`opts.mass` and `opts.U` are **exactly the knobs a casualty is staged with** — a degraded inventory
is how you set up a boil-dry, a reduced U is how you set up fouled or plugged tubes. A constructor
that silently ignores them makes every such probe **run a healthy generator while reporting that it
staged a sick one.** Identical in shape to Layer 4's ignored `pumpTripped`, which would have started
every loss-of-flow and blackout probe with a running pump.

**Three of the thirteen blind spots would each have silently disarmed a whole casualty family.**
None of them touches the physics; all of them decide whether the physics is ever asked the question.

### 31.1a The Layer 2 case is the sharpest, because the check was NAMED after the missing comparison

`extraMass` had a check already: *"the compressible volume made pressure softer than a rigid one."*
It asserted `0 < dP < 3.0 MPa` — **a band wide enough to accept the rigid case too.** So dropping
the hook at construction passed it. The check was named after a comparison it never made.

Rebuilt to construct the rigid twin and compare, it reads **0.0409 MPa with the bubble against
0.1292 rigid** — and now cannot pass without the hook. **A check whose name describes a comparison
should contain a subtraction**; if it contains a band instead, the band is doing the work and the
name is describing something else.

### 31.2 What is NOT claimed

**Five of seven layers were probed. The two that were not — Layer 0's water library and the property
table — have no constructor at all: they are pure functions of (h, P), so the construction pattern
has nothing to bite on. That is an argument, not a measurement.** All five with constructors had
blind spots, so the reasonable expectation is that anything else with one does too — and **that is an expectation, not a
measurement.** It is written here as such rather than as a finding, because the immediately
preceding section of this document is a retraction of a coverage claim made without running
anything.

The six found are closed, each with the check that catches it **and** the mutation that found it, so
the checks cannot rot. Two of those checks failed on their first run against *correct* physics — a
tripped pump still coasts at rated speed and makes 0.578 MPa at t=0, which is precisely why the
coastdown is modelled — and now assert the thing that actually distinguishes a trip: that the head
**decays**.
