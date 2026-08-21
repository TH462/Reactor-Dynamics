# SLS-100 Design Basis — the whole plant, derived forward

**Status:** first forward-derivation pass, 2026-08-13. **Not wired into any code.**
Supersedes `PWR_LOOP_GEOMETRY.md`'s scale-from-a-reference-plant method, which is kept
for its sourced reference dimensions but whose *derived* SLS-100 numbers this document
replaces.

**What this is and why it exists** *(OWNER DIRECTIVE, 2026-08-13: "Why don't we design the
entire plant geometry as a whole kind of a holistic approach you sourced documents as a
guide, but designed this based off of best in a plant design practices and how it will all
work together. Currently this plant was built up overtime in a patchwork fashion and just
made to work. I don't think we've ever sat down and just built or sketched out the entire
plant and how it all works together. It was basically one system grafted upon another over
a long period of time.")*

Every geometric and thermal-hydraulic constant in `pwr_config.js` was derived by scaling
**one** real-plant component **independently** — at different times, from different
reference plants (Ginna, BVPS-2, a generic WTSM 4-loop), by different power ratios
(`300/1520`, `300/908.5`, `300/852.75`). No two of them ever had to agree with each other,
and nothing in the codebase could have detected it if they didn't. **This document derives
the plant forward from its ruled identity instead, so that every number has a parent and
every disagreement is visible.**

**The method is: sourced documents as a GUIDE, design practice as the RULE.** Where a real
plant's dimension is a *manufacturing standard* (tube OD) or a *physical law* (energy
balance), it transfers directly. Where it is that plant's own layout choice, SLS-100 makes
its own choice and states it.

---

## 0. Ruled identity — the fixed inputs (NOT derived, do not change here)

These come from `Manuals/01` and `pwr_config.js` and are the plant's ruled character.
Everything below is downstream of them.

| | |
|---|---|
| Core thermal power | **300 MWt** |
| Gross electrical | ≈ 100 MWe |
| Primary pressure | **2235 psia (15.41 MPa)** |
| Hot / cold leg | **609.8 / 550.4 °F (321 / 288 °C)**, ΔT **59.4 °F (33 °C)** |
| Configuration | single loop, one RCP, one U-tube SG |
| Secondary steam | 819 psia (5.65 MPa) |

---

## 1. Primary flow — from the energy balance (**a law, not a choice**)

`Q = ṁ · Δh` across the core, using enthalpies at the ruled leg temperatures and pressure
rather than a point `cp` (which varies steeply near 15 MPa):

```
Δh  = h(321 °C, 15.41 MPa) − h(288 °C, 15.41 MPa) ≈ 1462 − 1274 = 188 kJ/kg
ṁ   = 300 000 kW / 188 kJ/kg          = 1596 kg/s  (3518 lbm/s)
V̇  = 1596 / 698 kg/m³                = 2.286 m³/s = 36,240 gpm
```

**This disagrees with the plant's declared `rcs_flow_gpm: 24000` by 1.51×** — or,
read the other way, the declared flow implies a core ΔT of **≈ 50 °C (90 °F)** against the
ruled 33 °C (59.4 °F). See §8 for what that does and does not break.

*(Enthalpy/density values are standard steam-table figures, not plant-specific. HR12: the
1.51× is arithmetic on the plant's own ruled numbers, not a claim about its dynamics.)*

---

## 2. Core — from design-practice power density

| Step | Value | Basis |
|---|---|---|
| Power density | 105 kW/L | Westinghouse-class **DESIGN PRACTICE** — recalled, **UNSOURCED** |
| Active core envelope | 2.86 m³ | 300 MWt ÷ 105 kW/L |
| Active fuel length | **3.66 m (12 ft)** | **DESIGN CHOICE** — standard fuel assemblies; a 300 MWt plant buying custom-length fuel would be a poor design decision |
| Equivalent core diameter | **1.00 m (39.4 in)** | 2.86 m³ ÷ 3.66 m, circularized |
| Coolant volume fraction | 0.58 | PWR lattice **DESIGN PRACTICE** — recalled, **UNSOURCED** |
| **Core coolant volume** | **1.66 m³ = 58.5 ft³** | |

A 1.0 m × 3.66 m core is a small, slender core — correct for 300 MWt at standard fuel
length, and it is what makes this plant genuinely single-loop rather than a shrunken
multi-loop plant.

---

## 3. Reactor vessel — built up geometrically from the core

Not scaled from anything. Assembled from the core outward using standard internals
practice (**all three geometry allowances recalled, UNSOURCED — flagged**):

| | Value | Basis |
|---|---|---|
| Core barrel ID | 1.10 m | core Ø × 1.10 (bypass/baffle allowance) |
| Core barrel wall | 0.05 m | practice |
| Downcomer annular gap | 0.25 m | practice |
| **RPV inside diameter** | **1.70 m (67 in)** | barrel OD + 2 × gap |
| Lower plenum height | 1.2 m | practice |
| Upper plenum height | 1.5 m | practice |

| Region | Volume |
|---|---|
| Core (coolant only) | 1.66 m³ |
| Downcomer annulus | 4.16 m³ |
| Lower plenum (85 % void of structure) | 2.31 m³ |
| Upper plenum (75 % void) | 2.54 m³ |
| **RPV coolant total** | **10.67 m³ = 376.6 ft³** |

**This is the number `PWR_LOOP_GEOMETRY.md` §8 could only infer as a 637 ft³ residual.**
Derived independently it is 377 ft³ — and it lands the RPV at 45 % of the RCS, inside the
real-plant band, where the residual method put it at 64 %, outside it. That is the first
sign the forward method is working.

---

## 4. Loop piping — from flow and design velocity

Velocity target is taken from the reference plant as a *design-practice* figure (it is a
real engineering constraint — erosion, pressure drop, pump power — not a layout quirk):
WTSM's 4-loop hot leg runs **43.0 ft/s** (88,500 gpm through 29 in ID, `ML11223A213`
Table 3.2-1). The crossover runs slower and the cold leg faster, in the same ratios the
reference plant's three bore sizes imply.

| Segment | Velocity | **ID** | Length (**DESIGN CHOICE**) | Volume |
|---|---|---|---|---|
| Hot leg | 43.0 ft/s | **18.6 in** | 15 ft | 28.2 ft³ |
| Crossover | 37.0 ft/s | **20.0 in** | 25 ft | 54.6 ft³ |
| Cold leg | 47.7 ft/s | **17.6 in** | 15 ft | 25.4 ft³ |
| | | | **Piping total** | **108.1 ft³** |

Lengths are SLS-100's own compact single-loop layout (the crossover is longest because it
carries the loop down to the RCP and back). Elevation layout: `PWR_LOOP_GEOMETRY.md` §5,
which stands — RCP suction lowest, SG tube top highest, ~55 ft of natural-circ head.

**RCP internal volume: 10 ft³**, consistent with the nozzle sizes above.

---

## 5. Steam generator primary side — from heat-transfer area

Sized by heat duty, not by scaling a tube count:

```
specific HT area  ≈ 50 ft²/MWt   (derived from WTSM SG geometry: 3,388 tubes,
                                   0.875" OD, ~55 ft avg length, 852.75 MWt/loop)
required area      = 50 × 300     = 15,000 ft²
```

Tube OD stays the **real 0.875 in × 0.050 in** manufacturing standard (§1's rule: standards
transfer, layouts don't). Average tube length **40 ft** is SLS-100's own choice, following
from a shell sized for this duty.

| | |
|---|---|
| Tube count | **1,637** |
| **SG primary volume** | **214.5 ft³** |

---

## 6. Pressurizer — sized to the RCS it serves

**#472 owns the pressurizer and is actively rebuilding it.** This section exists only to
close the volume ledger and **must be checked against #472's own number, not adopted over
it.** Sized at 15 % of total RCS volume (WTSM reference: 1,800 ft³ pressurizer against
~12,600 ft³ RCS):

**Pressurizer ≈ 125 ft³.**

---

## 7. Closure — the whole ledger, and three independent cross-checks

| Component | Volume | % RCS |
|---|---|---|
| RPV (§3) | 376.6 ft³ | 45.1 % |
| Loop piping (§4) | 108.1 ft³ | 13.0 % |
| SG primary (§5) | 214.5 ft³ | 25.7 % |
| RCP (§4) | 10.0 ft³ | 1.2 % |
| Pressurizer (§6) | 125.2 ft³ | 15.0 % |
| **RCS TOTAL** | **834.4 ft³ = 6,242 gal** | |

**Three checks, none of which were fitted:**

| Check | Derived | Expected | |
|---|---|---|---|
| RPV share of RCS | **45.1 %** | 40–45 % real-plant band | ✅ |
| Loop transit time (V ÷ V̇, §1 flow) | **10.3 s** | 10–12 s real PWR | ✅ |
| RCS total vs declared 998 ft³ | **834 ft³ (0.84×)** | — | ⚠️ 16 % low |

**The 16 % is a normal engineering disagreement; the patchwork's was a 2× structural
failure.** Compare directly: `PWR_LOOP_GEOMETRY.md` §8 got loop+SG+RCP = 213 ft³ and a
64 % RPV residual. Derived forward: **333 ft³ and 45 %.** The pieces now hang together,
and they were not made to.

---

## 8. What this disagrees with in the as-built plant

**Read this before treating any number above as adoptable.**

- **`rcs_flow_gpm: 24000` is 1.51× low** against §1. **It is inert in physics** — it sits
  in a config block explicitly headed *"NOT READ BY ANY CODE"* (`pwr_config.js:56`); the
  engine runs on normalized `flow_frac` against a fitted `coolant_heat_capacity`. But it
  **is player-facing** (it feeds the manuals), so it is a real error in a number a player
  can read, not a harmless annotation.
- **The deeper issue is that the engine has no physical mass flow at all.** There is no
  quantity in `engines/pwr/` that a `Q = ṁΔh` check could be run against. Nothing could
  have caught the 1.51×, and nothing can catch the next one. This — not any single wrong
  constant — is the structural argument for the refactor.
- **Declared RCS volume 998 ft³ vs derived 834 ft³.** The declared figure is #408's
  currency and propagates into flow conversions, PORV sizing and boration rates. A 16 %
  move there is not free; it is not adjudicated here.
- **Every constant in §§2–3 marked UNSOURCED** (power density, coolant volume fraction,
  downcomer gap, plena heights) is recalled design practice. Per the evidence-pass SOP they
  need citations before they can reject anything the as-built plant says.

---

## 9. What is deliberately NOT here

- **Secondary side and containment** — the same forward method applies (SG secondary from
  steam mass flow and shell sizing; containment free volume from peak-pressure design)
  but is not derived in this pass.
- **The pressurizer's real design** — #472's, §6 is a ledger placeholder only.
- **Any code change.** Nothing in this document is wired into the engine.

---

## 10. Recommended next step

The forward method demonstrably works — three cross-checks agree where the patchwork
agreed with nothing. The next step is **not** to start editing `pwr_config.js` constant by
constant, which would reproduce the patchwork by a different road. It is to build the
derived plant **alongside** the existing one and measure the divergence: see the refactor
issue filed 2026-08-13, and `Blueprint/PWR_LOOP_GEOMETRY.md` for the node/junction
structure that plant should have.
