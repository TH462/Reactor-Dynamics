# PWR2 — TURNOVER (2026-08-14)

**Written by the session that produced the design set, for the session that receives the review.**
Transient document — delete it once the review is worked and its content has landed in the design
documents or `Diagnostic/TUNING_LOG.md`.

---

## 1. Where things stand

A five-document design set for **PWR2**, a replacement PWR physics engine (#479), is complete and
committed to the **`backshop`** lane. **Nothing is built** except one library. A copy went to
`C:\grok_build\RD_Audit\pwr2_design_review\` for review; **that review is running now**.

| | |
|---|---|
| Lane | `C:\grok_build\RD_backshop`, branch `backshop`. **12 commits, unpushed, unmerged.** |
| Design set | `Blueprint/PWR2_DESIGN.md` (D1) · `PWR2_PHYSICS.md` (D2) · `PWR2_PLANT.md` (D3) · `PWR2_INTERFACE.md` (D4) · `PWR2_VALIDATION.md` (D5) |
| Built | `engines/pwr2/pwr2_water.js` + `test/run_pwr2_water.js`, **56/56** |
| Gates | `run_hardrules` **297**, `run_all --fast` at baseline |
| **`engines/pwr/`** | **NEVER TOUCHED, and must stay that way** — it is the A/B reference, and a reference that drifts is not a reference |

**Ruling in force: DESIGN ONLY.** *(OWNER, 2026-08-13: "We should be designing and not building.
Once we have it designed I will have the design reviewed before we build it.")* **Do not start
building on the strength of the review alone.**

**Start by reading `C:\grok_build\RD_Audit\pwr2_design_review\README.md`** — it has the reading
order, and `PWR2_PHYSICS.md` is 100 KB of which most is a lab notebook, not a proposal.

---

## 2. How to handle the review — read this before the findings

**The author could not evaluate this work reliably.** That is not modesty; it is the session's most
repeated measured result:

- Four "validations" turned out **circular** or resting on a **recalled band the author chose**.
- One claim was verified on a **3-node toy structurally incapable of exhibiting the failure** — it
  reported affine to 0.00e+0 because nothing in it could reverse.
- One verification script **printed a conclusion contradicting the data one line above it**
  (asserted ~1e-4; measured 2.18e-1).

**The generalised rule, and the thing most worth applying to the review itself:**

> **Any acceptance criterion the author chose that could not fail is worthless.** Recalled bands, a
> test case that cannot exhibit the failure, a summary line that does not read its own data.

**So: evaluate each review finding on its own terms.** Do not check whether the design's reasoning
survives — check whether the finding is true. Where they conflict, **the finding wins by default**
and the design must earn its way back.

**A sixth instance of the self-validation pattern would be the single most valuable thing the
review could return.** If it finds one, that outranks any physics correction.

**And verify before acting.** On 2026-08-13 a research subagent reported that `nrc.gov` 403s bare
curl and needs browser headers, and that archive.org was returning 498. **Both reversed on direct
test** (bare curl: 200, three attempts, two documents; browser headers: 403). The author came one
edit from propagating that into `CLAUDE.md`. **A subagent describing network behaviour is often
describing its own sandbox.**

---

## 3. What is decided — do not relitigate without cause

Nine rulings, all dated, all in `PWR2_DESIGN.md` §2 and §22. **Four of the wave-2 rulings are
SELECTIONS from options the author wrote**, and that is recorded — *a selection binds only as far
as the option text was accurate*. **If the review shows an option mis-stated its own consequence,
that ruling is open again.**

Wave 1: PWR2 eventually **replaces** `engines/pwr/` · **whole plant** scope · **homogeneous
equilibrium** two-phase · publish natural state with a **shim** to the 109 fields · **one RCS
pressure state**.
Wave 2: solver is a **bracketed root-find capped at ~8 iterations** · **keep the integrated loop
momentum state** · **HEM stands, cost recorded** · **continue at ~12 nodes, change the acceptance
bar**.

**The acceptance bar is the one to internalise**, because it reframes what "good" means:
**directional correctness · no missed alarm · no spurious alarm · nine Tier A couplings expressible
· conservation as a BUDGET, not an identity** (NEI 09-09 §3.9). PWR2 is **not** judged on residuals
in kg. Several earlier findings look like failures under the old bar and are declared scope
boundaries under this one — most notably the low-pressure resolution limit (D2 §26.3).

---

## 4. What is open, ranked by my honest judgment

1. **Walls and sensor dynamics — untested, and probably the highest-value work left.** SG tube wall
   τ ≈ 0.10 s is the **binding `dt` constraint** and no prototype has had walls. A vendor benchmark
   (D1 §20.7) found a real-time simulator **beat RELAP5** against plant data purely by modelling
   the temperature sensor's own thermal response. That is HR1 vindicated externally, and it argues
   walls/instruments outrank anything solver-side.
2. **CCFL constants** for downcomer and tie-plate geometry — unsourced. The one published pair
   found is for a **surge line** and is not adoptable. Needs an evidence pass.
3. **The `f` bound** in `window = min(k·Δh_step, f·h_fg)` has no number (D2 §26.2).
4. **`h_l()` carries a hidden regime test** (`if (P_MPa <= Ps) return h_sat;`) that breaks
   derivative smoothness across saturation. **A live bug in committed code.** One line. **Left
   unfixed on purpose** — it is a build task.
5. The `rho_l` performance fix, `cp_v(P)`, and the `(quality, P)` property table are all specified
   and measured but **unbuilt**, for the same reason.

---

## 5. What is in the author's head and NOT in the files

- **The design documents are complete; the commit messages carry the reasoning.** `git log` on
  `backshop` is worth reading — several commits explain *why* a thing changed better than the
  document does.
- **Agent-quality texture.** Adversarial subagents given *"try to refute this"* and *"default to
  rejecting"* produced far better findings than neutral review prompts. The proxy-classification
  pass downgraded **10 of 29** first-pass calls under that instruction — a third would otherwise
  have made the A/B *expect* divergence where none should occur, which is how a real defect hides
  as "expected".
- **Three superheat agents given deliberately opposed mandates did not converge — they argued, and
  the third won decisively.** Competing mandates beat consensus-seeking on a contested question.
- **`run_hardrules`' baseline moves when Blueprint documents gain owner-ruling citations** (it is
  an HR11 provenance scan, not a file count). It went 281 → 297 across this session. **Update
  `BASELINES` in the same change**, or CI reddens.
- Fable 529'd twice and the review ran on Opus instead; model diversity on the reviews is still
  owed if capacity allows.

---

## 6. Traps specific to this work

- **A bound that looks like a numerical guard is often a physical regime boundary.** Three
  instances today (§11.2's gate, §16.2's band, §25.3's pressurizer volume). **Before clipping
  anything, ask what the plant is doing when the clip engages.** A silent clamp on the pressurizer
  volume would produce a plant that *cannot go water-solid* — a behaviour the TMI curriculum needs.
- **A recalled band may REJECT, but may never CONFIRM.**
- **`engine.step(dt)` must advance physics by exactly `dt`.** `simulation_service.js:370` credits
  `simTime += steps * PHYSICS_DT` unconditionally, so a sub-step that returns early makes the
  clock run ahead of the physics **silently** (D2 §24.2).
- **This is a SIMULATOR, not an analysis code.** Analysis codes reject the timestep and retry; this
  cannot. That distinction resolved half the open questions once it was noticed, and it was noticed
  late.
