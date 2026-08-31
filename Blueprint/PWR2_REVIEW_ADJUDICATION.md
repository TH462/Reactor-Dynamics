# PWR2 — adjudication of the adversarial review (2026-08-14)

**Written by the session that RECEIVED the review, not the one that wrote the design.** Every
finding was re-tested against the tree rather than accepted. Transient document — delete once its
content has landed in the design set or `Diagnostic/TUNING_LOG.md`.

**Ruling in force: DESIGN ONLY. Nothing here authorises a build.**

Method: the review's snapshot (`RD_Audit/pwr2_design_review/`) is **byte-identical** to
`Blueprint/PWR2_*.md`, `engines/pwr2/pwr2_water.js` and `test/run_pwr2_water.js` on `backshop`
(diff-verified), so it measured our files. External truth was **re-fetched by this session** from
NIST SRD 69 (IAPWS-95), not taken from the reviewer's saved `.tsv` — my fetch reproduces their
quoted rows exactly (344.30 °C → 15.406083 MPa, h_f 1626.1760, ρ_g 100.93164).

---

## 1. Verdict

**The review is substantially correct, and its headline finding is TRUE and understated.** The
turnover asked for a sixth instance of the self-validation pattern as the single most valuable
return. There is one, it is in `run_pwr2_water.js`, and it is worse than the review established —
because the review argued it by category and the decisive test is injection.

**Two framing claims are overstated** (F1's headline, F2.3's count of 21). Neither rescues the
gate. **One root cause the review did not find** doubles its count of wrong reference values.

---

## 2. THE FINDING THAT MATTERS — proven by injection, not by category

The review argued "21 of 56 checks cannot meaningfully fail" from categories. This repo's own
doctrine says a coverage claim is an unmeasured claim until you break the thing and run the gate.
Done — 25 injections, each interposed on the **internal** function name so the perturbation
propagates to every caller (an external shim does not reach `P_sat`/`h_fg`/`h_l`/`T_from_h`, which
call the internal closures; that flaw invalidated my own first attempt).

**Three terms the library's own comments call load-bearing can be deleted or arbitrarily scaled
without reddening one of the 56 checks:**

| Injection | Result | What the file says about that term |
|---|---|---|
| **Delete the compressed-liquid correction** (`h_sat + v·(P−Ps)`) | **56/56 GREEN** | *"Dropping it would bias the energy balance the whole engine is built to check."* (:88) |
| **Delete the bulk-modulus compressibility term** | **56/56 GREEN** | *"matters for exactly one thing, but that thing is load-bearing: a water-solid RCS, where dP/dρ IS the pressure response."* (:111) |
| `cp_l` × 1.5 · × 0.6 · + 2.0 | **56/56 GREEN, all three** | `cp_l` is asserted nowhere in the gate. |
| `h_l` + 50 kJ/kg (+21.5 Btu/lb) | **56/56 GREEN** | — |
| `subcooling` + 40 °F (+22 °C) | **56/56 GREEN** | exported, never asserted |

The last two share one mechanism worth stating on its own: **the gate's "check that matters" — the
`Q = ṁΔh` energy balance, the assertion #479 exists to install — is a DIFFERENCE of `h_l`, so it is
structurally blind to any additive error in `h_l`, including the +9 kJ/kg (+3.9 Btu/lb)
compressed-liquid term whose presence D1 cites as the improvement over the old engine.**

**Measured inert count: 8 of 56** (4 × `T_from_h` round-trip, `mdot in plausible band`,
`declared 24,000 gpm is REJECTED`, `in-range accepted`, `finite outside range`). The review's 21 is
**wrong as a count** — the `P_sat` round-trips and the five `h_fg` checks do respond to a
perturbed inverse. The conclusion the count was offered to support survives anyway, by the stronger
route above.

---

## 3. FOUR wrong reference values, not two — and the root cause

Every one of the 35 numeric references in the gate, checked against re-fetched IAPWS-95:

| check | gate ref | IAPWS-95 truth | ref error | tol | library error vs TRUTH |
|---|---|---|---|---|---|
| `T_sat(2235 psia)` | 650.1 °F (343.4 °C) | **651.8 °F (344.32 °C)** | 1.66 °F (0.92 °C) | ±1.08 °F (±0.6) | 0.71 °F (0.39 °C) |
| `h_l_sat(609.8 °F)` | 1461.2 kJ/kg | **1468.41** | 7.21 (3.10 Btu/lb) | ±5 | 3.08 |
| `h_l_sat(650.1 °F)` | 1610.0 kJ/kg | **1619.42** | 9.42 (4.05 Btu/lb) | ±5 | **11.23 (4.83 Btu/lb)** |
| `rho_v(2235 psia)` | 96.7 kg/m³ | **100.97** | 4.27 (4.4 %) | ±2 % | **4.38 (4.3 %)** |

The other 31 references are accurate to well inside tolerance — eight of the nine `T_sat` points
land within 0.01 °C. **All four errors are at the hot end, which is where the plant runs.**

**Root cause, which the review did not identify:** two of the four are exactly the **15.0 MPa
(2176 psia)** steam-table row, used at the plant's **15.41 MPa (2235 psia)** operating point —
IAPWS at 15.0 MPa gives h_f = **1610.20** (gate ref 1610.0) and ρ_g = **96.727** (gate ref 96.7).
A steam-table row was read one line off and labelled with the operating pressure.

**These references do not merely fail to reject — they conceal.** `h_l_sat(650.1 °F)` passes by
1.81 kJ/kg while the library is **11.23 kJ/kg (4.83 Btu/lb) off truth against a ±5 claim** — a
2.2× violation of the file's own accuracy claim, made invisible by a reference wrong in the same
direction. `rho_v` at 2235 psia is 4.3 % off against a ±2 % claim, likewise hidden. This is an
independent second line of evidence for F3, **at the gate's own assertion points** rather than
off-node.

---

## 4. Where the review OVERSTATED

**F1's headline — "the ruled acceptance bar contains no enforceable number" — is false as
written.** D5 §6.1 carries two: **local time lag < 1 s** and **global time lag < 1 % of simulated
time**. The review's own body concedes this ("the only numbers in force are the real-time lags"),
so the heading contradicts the finding. F1's *substance* is confirmed verbatim: the conservation
budget's number "is owed; it does not yet exist" (§6.2), the steady-state band is UNSOURCED with
±2 % withdrawn (§6.1), and the closure residual is kept as a "real gate" with **no tolerance
stated**. The second kept gate is named **"Newton iteration count"** though the ruled hot path is a
bracketed root-find that computes no Jacobian — stale text naming a superseded solver.

**F1's vacuity-guard claim is an over-read.** D5 §6's heading says it supersedes "§§1–5's
**framing**", not their content; the review reads that as deleting §1's replay-moved-mass guard and
§2's branch counter. The ambiguity is real and should be closed explicitly, but the text does not
say what the review says it says.

**F1's strongest point is buried and is correct:** the first three criteria are all defined
relative to ANS-3.5's **"reference unit"**, and SLS-100 is fictional. No reference unit is named
anywhere in the set. The only available comparator is the engine D1 §1 argues is structurally
wrong — the same circularity shape D3 §1 retracted itself over, now sitting at the top of the
acceptance system.

---

## 5. Verdict on every finding

| # | Verdict | Basis |
|---|---|---|
| **F1** | **Substance CONFIRMED; headline OVERSTATED; one over-read** | §4 above |
| **F2** | **CONFIRMED and UNDERSTATED** — but the "21" count measures as 8 | §2, §3 |
| **F3** | **CONFIRMED on an independent grid** (my own 131-row / 69-row fetch) | below |
| **F4** | **CONFIRMED exactly** | below |
| **F5** | **CONFIRMED verbatim — load-bearing** | below |
| **F6** | **CONFIRMED, every sub-claim** | below |
| **F7** | **CONFIRMED, every sub-claim, by execution** | below |
| **F8** | **CONFIRMED — and this is the one with procedural teeth** | below |
| **F9** | **CONFIRMED exactly** | below |
| **F10** | **CONFIRMED, and UNDERSTATED** — verified 2026-08-14 | below |
| **F11** | **CONFIRMED** (spot-checked, three of three) | below |

### F3 — accuracy claims false as stated. Confirmed, and cp_l is worse than reported.

Against my own dense IAPWS-95 grids (2.5 °C saturation steps 20–345 °C; 0.25 MPa steps 0.1–17 MPa
— overwhelmingly off the 9–10 points the fits were built on):

| function | claim (header / gate / stated residual) | my measured max error | verdict |
|---|---|---|---|
| `T_sat` | ±0.6 °C | **0.41 °C** | **holds** — the one fit whose claim is true |
| `h_l_sat` | ±6 / 5 / 4.13 kJ/kg | **−10.57 in-range** (648.5 °F/342.5 °C) | exceeds all three |
| `rho_l_sat` | ±4 / 4 / 3.02 kg/m³ | **−5.68** (639.5 °F/337.5 °C) | exceeds |
| `h_v` | **±15 header vs ±25 inline** / 22.2 | **−27.32** (0.35 MPa) | exceeds even ±25 |
| `rho_v` | ±4 % / 2 % / 1.56 % | **−8.26 %** (17.1 MPa, just out of range) | exceeds |
| `cp_l` | prose only, **no gate check** | **−19.6 % at 644 °F (340 °C); −22.1 % at 648.5 °F** | review said −16.7 % |

The runner's preamble — *"every tolerance is the accuracy the source file CLAIMS in its own
comments"* — is false. Each of `h_l`, `h_v`, `rho_v` carries **three different numbers** (function
header, inline residual, gate tolerance); `h_v` contradicts itself within eight lines (±15 at :160,
±25 at :168).

### F4 — five values for one Δh. Confirmed exactly.

Truth at 2235 psia, 550.4 → 609.8 °F: NIST compressed-liquid isobar gives
h = 1273.9927 → 1459.4006, so **Δh = 185.41 kJ/kg (79.7 Btu/lb)**. Library returns **183.08**;
gate target **183.0 ± 8** accepts 175–191 and cannot separate any of the candidates.
Consequence: ṁ = **1639 kg/s (3613 lbm/s)** library vs **1618 (3567)** true — every residence
time, Courant number and film coefficient in D2 is computed from a flow **1.3 % high**.

### F5 — A9 is simultaneously the control case and a predicted divergence. Confirmed.

D5 §3: A9 = *"Reproduce exactly — it is an instrument effect and PWR2 does not change the
instrument layer"*, and *"if it diverges, something is wrong in the shim, not the physics."*
D4 §8 lists **`sg_level_pct` AND `sg_level_wide_pct`** among the 19 upheld proxies — *"the
predicted-divergence set, to be scored first"* — where *"divergence is the point"* (§2).

A9's measurement (−2.45 % at t+10 s) is carried by exactly those fields. **The control case cannot
function as a control case if its own fields are predicted to diverge.** Related fork confirmed:
D5 §2 and §4 both score against D4 §2's five-field set, which D4 §8 explicitly supersedes and
whose `sg_mass_frac` it reclassifies.

### F6 — §23 is not buildable as "the only section to build from". Confirmed, every sub-claim.

- §23.1 gives the pressurizer **four** states (`m_liq, h_liq, m_steam, h_steam`) citing §14.1;
  **§25.1 proves that over-determined and §25.2 replaces it with three** (`h_liq, h_steam, m_pzr`).
  §23 was not updated.
- **§23.2's `F(P)` omits the `m_pzr(P)` term** that D2 §0.3, §25.1, D4 §1 and D5 §1 all include.
  The section you build from carries the wrong closure equation.
- §23 is silent on three constraints recorded after it: the exactly-`dt` rule (§24.2), `K ≤ 8`
  (§24.1), and the correlation windows (§26, with `f` still TBD).
- §23.3 asserts "ONE integrated loop momentum state" and "RHR-aligned with the RCP off is 2"
  within four lines, while §23.1's state table lists one flatly.
- **The ruled cap (~8 iterations) is below §17.5's own measurement**: bracketed solve in the
  adversarial water-solid case runs **0/504 failures at mean 10.4 iterations**. The case that
  motivated bracketing exceeds the cap that was ruled, unreconciled.

### F7 — the committed L0 cannot express the ruled design. Confirmed by execution.

- **Superheat unrepresentable.** `h_v`/`rho_v` are functions of P only; no vapour h(T,P) exists.
  `T_from_h(h_v(7 MPa)+200, 7)` returns **373.95 °C** — the critical-temperature clip, silently.
  §23.4 rules a three-regime property layer; the committed API cannot carry it.
- **`h_fg`'s stated justification is false.** The comment derives `h_fg` because *"it must go to
  zero at the critical point and an independent fit will not."* Measured: **`h_fg(22.064 MPa)` =
  643.7 kJ/kg (276.8 Btu/lb)**, not 0. The `max(0,…)` never engages.
- **`cp_l` is not ∂h_l/∂T on the compressed branch**, violating the file's own stated principle
  that *"cp and h cannot disagree"*: gap **+1.19 %** at 482 °F (250 °C) → **+4.36 %** at 635 °F
  (335 °C), at 2235 psia.
- **`rangeOK` is dead code** — grep-verified, zero callers anywhere except the four gate checks
  that test `rangeOK` itself. Internal clips are far looser than the declared envelope
  (`[1e-4, 22.064]` MPa and `[0, 373.946]` °C vs the declared 0.1–17 MPa / 20–350 °C), so
  `T_sat(20 MPa)` = 365.4 °C and `h_l_sat(400 °C)` = 1828.8 kJ/kg return finite and unflagged.
  The header's *"never a silent extrapolation"* is false as stated.

### F8 — the stop condition. Confirmed, and it is the finding with procedural teeth.

D3 §1:45, verbatim: *"**D1 §8(2)'s stop condition is currently met** — no valid
topology-appropriate check exists yet."* D1 §8(2): if none can be constructed, *"the rewrite loses
its justification."* **No text in the set states the condition cleared**, and D3 §7 still opens
*"§1's shortfall is not closed."*

In fairness to the design, D3 §1a-v does report **one genuinely non-circular constraint satisfied**
(the core + SG resistance terms, 184 kPa / 32 % of the total, derived from assembly count and
heat-transfer area with no reference to pump or velocity) and is careful to say what it does not
prove — 59 % of that check is near-tautological by its own accounting. That is a one-sided
falsification bound, not the volume-ledger closure D1 §8(2) requires.

Arithmetic confirmed: the new ledger sums to **835.8 ft³ (23.66 m³)** while the closing sentence
cites an orphan **817.8** appearing nowhere else.

### F9 — provenance discipline declared and applied nowhere. Confirmed exactly.

D1 §2: *"Every number is `[ruled]`, `[derived]` or `[sourced]`, and carries its kind at its
definition site."* Grep across all five design documents: **4 occurrences, and every one is a
statement of the rule or a reference to it. Not one tags a number at its definition site.** For
scale, the engine PWR2 exists to replace carries **158 `[tune]` markers** — the old convention is
actually applied; the better one is declared and unused.

### F11 — cross-reference rot. Spot-checked, three of three confirmed.

- D2's reading order points at **"§§19–22"**, which do not exist in D2 (its headings run 0–18 then
  23–26); those sections are in D1.
- **D4 §2's group table sums to 110** against the 109-field contract (§8's classification sums
  correctly to 109).
- **D5 §6.4 says "D2 has never looked at it"** while **D2 §26 opens "D5 §6.4 established…"** —
  D2 §26 *is* D2 looking at it. One is stale.

---

### F10 — curriculum coverage. Verified 2026-08-14; the review understated it.

- **HR4 is absent from the entire design set.** Grep across all five design documents:
  **zero occurrences.** HR4 is a binding Hard Rule — *"Every snapshot carries both true state and
  instrument readings, as distinct fields"* (`CONTEXT.md` §3) — and the interface document, which
  defines the 109-field contract *and* the shim that publishes it, never mentions it. Confirmed
  exactly as filed.
- **The Tier C Core casualties are worse covered than reported.** The review said *seven of
  eleven* have no mechanism row in the plant document. Measured, by id and by name: **not one of
  the eleven is referenced by its id at all**, and by name only two appear — SGTR (1 mention) and
  PORV (2). **Nine of eleven have no mechanism anywhere in the plant document.**

  **In fairness to the design**, casualties are L6 in the build order (*"breaks as junctions onto
  any node"*) and L6 is not designed yet, so their absence from a topology document is not by
  itself a defect. **The consequence that IS real:** D5 §5 requires the scenario set to include
  the Tier C Core casualties, so that requirement is currently unsatisfiable — and nobody has
  checked whether the ruled ~12 nodes can express them. **Two of the nine are secondary-side**
  (loss of main feedwater, steam line break) against a plant document that **lumps the secondary**,
  and a lumped secondary may not be able to express a steam line break's asymmetry at all. That is
  a node-count question, and it lands on the node-count ruling that D1 §23.2 has already reopened.

## 6. What I did NOT verify
- F8's topology sub-claims beyond the arithmetic (plug-node evaluation-site count, the two live
  loop-length sets).
- The review's §23.2 closure-monotonicity adjudication (~30,000 samples, 0 non-monotone). I did not
  re-derive it. **Its two caveats are the interesting part and I did not test either**: that the
  naive fixed-h variant is *also* monotone everywhere sampled (so the isentropic term is not what
  secures monotonicity, and the theorem's framing overstates what it buys), and that
  `dF/dP = Σ V_i/c_i²` is unverifiable at L0 because the library has no sound speed and no entropy.
- Anything requiring a stepped plant. Nothing above L0 exists.

---

## 7. What this changes

**The design set's reasoning survives better than its one artifact.** The retraction discipline is
real — D1 §3 demolishing its own best validation, D3 §1 retracting a check it had just built. Every
one of those catches was made by *reasoning*. The single thing this project built was never put
against an external measurement until now, and it had four wrong references, three untested
load-bearing terms, and accuracy claims false in five of six functions.

**That is the generalisable lesson, and it is not "audit harder":** the self-audit habit caught six
reasoning errors and zero numeric ones. An external anchor in the loop is not a nice-to-have for
this project — it is the only control that has ever caught this class.

**Before any build ruling, three things are owed:**

1. **D1 §8(2) is a declared stop condition, reported MET and never cleared.** By the design's own
   rule the project stops here. It needs either a valid topology-appropriate check or an explicit
   owner override — it must not be passed over silently, which is what has happened so far.
2. **L0 must be re-anchored and re-gated before anything is built on it.** Every reference re-taken
   from a citable external table at the correct pressure, off-node checks added, the three
   self-contradictory accuracy claims reduced to one number each, `cp_l` given a check, and the
   gate proven by injection rather than by assertion.
3. **§23 must be brought up to §§24–26** — the three-state pressurizer, the `m_pzr(P)` term in
   `F(P)`, the exactly-`dt` rule, `K ≤ 8`, the iteration cap reconciled against 10.4 — or it must
   stop calling itself "the only section to build from".
