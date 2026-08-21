# PWR2 Layer 0 — the water-property rebuild (2026-08-14)

**What this is:** the provenance and method behind `engines/pwr2/pwr2_water.js`, referenced from
its header. **Layer 0** is the water/steam property library — the bottom of the PWR2 build stack
and the only part of the new engine that exists.

*(OWNER RULING, 2026-08-14: "Go with your recommendations." — approving, among three
recommendations put to him, that Layer 0 be rebuilt now rather than waiting for the rest of the
design to settle. The argument accepted was that **water properties are the one layer no
remaining design decision can invalidate**: boiling temperature does not depend on node count,
break scope, or plant geometry.)*

---

## 1. Why it was rebuilt

An adversarial review measured the first version against IAPWS-95 and this session re-tested every
finding. The library reported **56/56 green** while:

| | |
|---|---|
| **Four reference values wrong** | by more than the tolerance asserted against them, all at the hot end where the plant runs |
| **Two of those traced** | they are the **15.0 MPa (2176 psia)** steam-table row used at the plant's **15.41 MPa (2235 psia)**: h_f 1610.2 and ρ_g 96.727 belong to 15.0 MPa |
| **Wrong references CONCEAL** | `h_l_sat` at 343.4 °C passed by 1.81 kJ/kg while the fit was **11.23 kJ/kg** from truth against a ±5 claim |
| **Three claims per function** | header, inline residual, gate tolerance — all different, and five of six false off-node |
| **Load-bearing terms untested** | deleting the compressed-liquid correction, deleting the compressibility term, or scaling `cp_l` by 1.5 each left the gate at **56/56** |

---

## 2. Two physics errors found during the rebuild

Neither was in the review. Both were found by fitting against real data rather than assuming a
textbook form.

### 2.1 The compressed-liquid enthalpy term was WRONG IN SIGN at operating temperature

The old form was the incompressible-liquid relation `dh = +v·(P − P_sat)`, and the header
advertised it as *"worth about +9 kJ/kg … dropping it would bias the energy balance the whole
engine is built to check."* The design spine cites it as one of the rewrite's improvements.

Measured against IAPWS-95, the true departure `h(T,P) − h_f(T)` per MPa:

| T | true | the assumed `v` | true departure at 2235 psia |
|---|---|---|---|
| 212 °F (100 °C) | +0.795 | +1.044 | +11.5 kJ/kg |
| 482 °F (250 °C) | +0.085 | +1.252 | +0.4 |
| **550 °F (288 °C)** | **−0.642** | +1.360 | **−5.3** |
| **610 °F (321 °C)** | **−2.519** | +1.504 | **−9.0** |

**The exact relation is `(∂h/∂P)_T = v(1 − αT)`.** The incompressible form drops the `−vαT`
part. Near the critical point `αT` exceeds 1, so the true derivative goes **negative** — water at
PWR hot-leg temperature is nowhere near incompressible. At the plant's hot leg the old form is
wrong by 15.2 kJ/kg **and in the wrong direction**.

### 2.2 The isothermal bulk modulus was up to 8.7× too stiff

The old value was `B = 2200 − 3·T` MPa, described as *"the same physical constant the old engine
calls `solid_bulk_mpa` (1300 MPa)"*. Measured as `ρ·dP/dρ` from 445 adjacent-isobar pairs:

| T | IAPWS-95 | the file's `2200 − 3T` | |
|---|---|---|---|
| 212 °F (100 °C) | 2086 MPa | 1900 | about right |
| 550 °F (288 °C) | 440 | 1336 | **3.0×** |
| 610 °F (321 °C) | 225 | 1237 | **5.5×** |
| 644 °F (340 °C) | 135 | 1180 | **8.7×** |

The decline with temperature is exponential, not linear. **This matters for exactly the one thing
the file's own comment says it matters for**: a water-solid RCS, where `dP/dρ` *is* the pressure
response (D2 §25.3 — the regime where "system compressibility collapses to the liquid bulk
modulus" and where the stability margin is thinnest). A 5.5× error there is a plant that
pressurises 5.5× too fast per unit mass added.

**Note for whoever revisits `engines/pwr/`:** its 1300 MPa may have been intended as an
*effective* system stiffness including vessel elasticity, which is legitimate practice. PWR2's
`rho_l` is a pure water property and must carry the water value.

---

## 3. Source data — reproducible

**NIST Chemistry WebBook, SRD 69** (IAPWS-95, Wagner & Pruß 2002), fetched 2026-08-14. Base URL:

```
https://webbook.nist.gov/cgi/fluid.cgi?Action=Data&Wide=on&ID=C7732185&Digits=8
  &RefState=DEF&TUnit=C&PUnit=MPa&DUnit=kg%2Fm3&HUnit=kJ%2Fkg&WUnit=m%2Fs
  &VisUnit=uPa*s&STUnit=N%2Fm
```

| Set | Query | Rows |
|---|---|---|
| Saturation by temperature | `&Type=SatP&TLow=20&THigh=373&TInc=1` | 354 |
| Saturation by pressure | `&Type=SatT&PLow=0.1&PHigh=22&PInc=0.1` | 220 |
| Isobars (liquid + vapour) | `&Type=IsoBar&P=<P>&TLow=20&THigh=800&TInc=5` at P = 0.1, 0.5, 1, 2, 3, 5, 7, 10, 12, 15.41, 17 MPa | 159 each |

**Authenticity check** (values a wrong reference state would not reproduce): at 100.000 °C the
served data gives P = 0.10141800 MPa, h_f = 419.16616, ρ_f = 958.34905, h_g = 2675.5699 — the
canonical steam-table values, with P_sat at exactly 100 °C correctly *above* one atmosphere
(the normal boiling point is 99.974 °C on ITS-90).

**`nrc.gov` note, corrected 2026-08-13 and still true:** it 403s a bare user-agent but returns
200 with a full browser header set. NIST WebBook needs no such treatment — bare `curl` returns
200.

---

## 4. What each function is now, and its MEASURED error

**One number per function, stated once, measured against IAPWS-95 over the whole declared range
— never at the points the fit was built on.**

> **⚠ THE FIGURES IN THIS TABLE WERE MEASURED ON THE FIT GRID, WHICH IS THE THING THE SENTENCE
> ABOVE FORBIDS. §7.2 CARRIES THE CORRECTED OFF-GRID NUMBERS** — `h_l_sat` 0.63 not 0.52,
> `rho_l_sat` 0.51 not 0.42, `rho_v_sat` 1.25 % not 0.98 %, and `bulk_modulus` up to 120 % near
> saturation rather than a flat 15.3 %. `T_sat` was refitted (0.090 → **0.065 °C off-grid**) to
> fix the `P_sat` defect in §7.1. Left visible rather than silently overwritten: the point of this
> document is that stating a rule is not the same as obeying it.

| Function | Form | Measured max error | Was |
|---|---|---|---|
| `T_sat(P)` | degree-6 in ln P, 0.1–22 MPa | **0.090 °C** | 0.41 °C |
| `h_l_sat(T)` | degree-10, 20–358 °C | **0.52 kJ/kg** | 10.57 (claim ±5) |
| `rho_l_sat(T)` | degree-10, 20–358 °C | **0.42 kg/m³** | 5.68 (claim ±4) |
| `cp_l(T)` | exact derivative of `h_l_sat` | **−2.7 %** below 300 °C, −21 % at 350 °C | untested; claimed −5 %, was −19.6 % |
| `h_fg(T)` | `(1−T/T_c)^0.38 × quartic` | **2.24 kJ/kg**, and **exactly 0 at the critical point** | 643.7 kJ/kg at critical, against its own claim |
| `h_g(P)` | derived as `h_f + h_fg` | **1.16 kJ/kg** | 27.3 (header ±15, inline ±25) |
| `rho_v_sat(P)` | log-log degree-6, 0.1–18 MPa | **0.98 %** | 4.4 % at operating point (claim ±2 %) |
| `k_comp(T)` | degree-5, compressed-liquid departure | 1.08 kJ/kg·MPa | **wrong in sign** (§2.1) |
| `bulk_modulus(T)` | ln B = quartic | 15.3 % | **up to 8.7× too stiff** (§2.2) |
| `h_v(T,P)` superheat | cp relaxation, integrated | **35 kJ/kg = 1.17 %** | **did not exist** |
| `rho_v(T,P)` superheat | real gas law, fitted Z | **7.5 %** | did not exist |

### Choices worth recording

- **Liquid range stops at 358 °C, and that is not arbitrary** — it is what `T_sat(18 MPa)`
  demands. Set it lower and `h_f`/`h_g` silently clamp above about 15.5 MPa, *inside the plant's
  own relief range*. Caught by the new off-node reference at 17 MPa reading 19.7 kJ/kg low.
- **`h_fg` is now fitted and `h_v` derived from it**, reversing the old direction. The old file's
  stated reason for deriving `h_fg` — *"it must go to zero at the critical point and an
  independent fit will not"* — was sound reasoning that its implementation did not deliver
  (measured 643.7 kJ/kg). The `(1−T/T_c)^0.38` prefactor delivers it by construction.
- **Fitting cp and integrating for h was tried and rejected** — measured, it gives an accurate cp
  but 64 kJ/kg of accumulated error in h. `cp_l` stays the exact derivative of `h_l_sat`, with
  its error declared **by band** because the degradation is the physical cp divergence toward the
  critical point, which no polynomial derivative can follow.
- **Superheat needed a relaxation form, not a polynomial.** cp_v runs 18.3 kJ/kg·K just above
  saturation at 17 MPa and relaxes to 2.6 by ΔT = 300 °C; a 7-term polynomial measured 134 kJ/kg.
  The `g·ΔT` term carries steam cp turning back up at high temperature — without it the far field
  drifts 84 kJ/kg.
- **Ideal-gas scaling for superheated density measures 55 % error** and was rejected. Saturated
  steam at 2235 psia has Z = 0.536 and approaches ideal *as it superheats*, so density falls
  faster than the ideal ratio.

---

## 5. The gate — and why it cannot become a could-not-fail instrument

`test/run_pwr2_water.js`, **164 checks, plus a 17-mutation injection self-test.**

1. **Every reference is IAPWS-95, quoted to 8 figures, at the pressure or temperature named.**
   Nothing is recalled, so the design's own rule — *a recalled band may reject, but may never
   confirm* — is satisfied by construction.
2. **Off-node references.** The fits were built on a 1 °C / 0.1 MPa grid, so the gate also
   asserts at 137.37 °C, 4.21 MPa, 320.5 °C, 287.37 °C — points no fit ever saw. Checking a fit
   only where it was fitted measures residual, not error.
3. **The injection self-test re-runs the whole suite against 17 deliberately broken copies of the
   library. A mutation that stays green is reported as `BLIND TO` and FAILS THE GATE.**

**The self-test earned its place on its first run.** It reported one blind spot in the new gate:
restoring the `h_l` regime branch reddened nothing, because every compressed-liquid check asserts
a **value** at P > P_sat and the defect that branch reintroduces is a **derivative**
discontinuity — invisible to all of them, and the pressure solver differentiates through `h_l`.
Four slope-continuity checks close it. **That is the whole argument for building the self-test
rather than trusting a review: it found in seconds a hole that a careful human reading would not
have.**

The retracted claims are gone. **Loop transit is REPORTED, never asserted** — the "10–12 s" band
was recalled, was retracted by D1 §3, and the check it sat in was found circular (D3 §1). The
energy balance now asserts Δh against the IAPWS-95 value **185.41 kJ/kg**, not the invented
183.0 ± 8 that could not separate the five different numbers in play.

---

## 6. Still owed at Layer 0

- **`cp_l` above 330 °C (626 °F) is −16 % to −21 %.** Declared, banded and gated. Nothing in the
  design uses cp there; if something ever does, it needs a different function, not a wider band.
- **`rho_v` superheat at 7.5 %** is the loosest fit in the file. Adequate for core-uncovery
  energy bookkeeping; not adequate for anything quantitative about steam mass at high pressure.
- **The `(quality, P)` specific-volume table ruled in D2 §23.4 is NOT built.** This library
  computes mixture density from `h` and `P` directly. The ruled table is a performance and
  kink-placement decision that belongs with Layer 2, where there is something to measure it
  against.

---

## 7. THE INDEPENDENT REVIEW (2026-08-14) — and what it found that the self-test could not

*(OWNER RULING, 2026-08-14: selected "Yes, before building on it" from three options — an
independent pass on the rebuilt library before Layer 1 or Layer 2 is built on top of it. The
reasoning accepted: the same agent had written both the library AND the gate that judges it,
which is exactly the conflict the whole PWR2 review exists to catch.)*

Run on a **different model**, adversarially prompted (*refute; default to rejecting*), read-only,
fetching its own IAPWS-95 truth rather than trusting any number in the repo.

**It found two real defects, five false claims, and eleven blind spots. The decision to commission
it paid for itself immediately.**

### 7.1 Two real defects — both now fixed

| | |
|---|---|
| **`P_sat` returned a VACUUM below 99.6 °C (211 °F)** | `T_sat` clipped its argument at `P_MIN = 0.1 MPa`, so it was **flat** below that; `P_sat` inverts it by bisection, so the bracket collapsed to its lower bound. Measured: `P_sat(50 °C)` = 1.0e-4 MPa against a true 0.01235 — **wrong by 100×**, across the entire cold end, which is exactly where Cold Shutdown (Mode 5) lives. **Fixed** by refitting `T_sat` to degree 9 over **0.0017–22 MPa**; `P_sat(50 °C)` now reads 1.2357e-2. Off-grid error also improved, 0.090 → **0.065 °C**. |
| **`rho_from_h` was discontinuous and NON-MONOTONE at h_g** | The vapour side used a `Z_sat` fit inside `rho_v`; the two-phase side ended at the independent `rho_v_sat` fit — **two fits of one quantity**, the exact pattern `P_sat`'s own comment forswears. Jump up to **1.45 kg/m³ (1.10 % at 18 MPa)**, and **the sign varied with pressure**, so density *rose* with enthalpy across the boundary at ~1, 2, 10 and 13 MPa — in a function the pressure solve brackets through. **Fixed** by anchoring `rho_v` to `rho_v_sat`, so continuity holds by construction; the jump is now ~1e-7 kg/m³. |

### 7.2 Five accuracy claims false OFF-GRID — the same failure at smaller amplitude

The header's own rule is *"measured over the WHOLE declared range — never at the points the fit was
built on."* **The measurement had been taken on the fit grid itself.** Re-measured on a genuinely
off-grid set (temperatures offset by 0.37 °C, pressures by 0.137 MPa):

| | claimed | measured off-grid |
|---|---|---|
| `h_l_sat` | 0.52 kJ/kg | **0.63** |
| `rho_l_sat` | 0.42 kg/m³ | **0.51** |
| `rho_v_sat` | 0.98 % | **1.25 %** |
| `T_sat` | 0.090 °C | 0.14 (now 0.065 after the refit) |
| `bulk_modulus` | 15.3 % flat | **46 % at saturation at operating pressure; 120 % at 357 °C / 18 MPa** — it is fitted in T alone but the true value depends on (T, P) |

All now restated honestly. **The bulk-modulus case is the instructive one:** the headline 5.5×
correction to the old value is real and was independently confirmed by a sound-speed route the
reviewer chose precisely because it does not share my method — but *the accuracy claim about that
correction* was still false near saturation.

### 7.3 Seven of eight `cp_f` references were not from NIST

In a file whose header stated *"No recalled numbers… satisfied by construction, because nothing
here is recalled."* The h and ρ columns of the same rows verify to the digit; the cp column had
been pasted from a different source and differed in the 4th significant figure (288 °C: 5.4383
against a true 5.4485852). **Writing "nothing here is recalled" is not the same as checking.**

### 7.4 Eleven blind spots — the structural lesson

The reviewer applied 19 mutations; **11 stayed green**, three of them on exported functions the
suite **never called at all** (`subcooling`, `h_fg(P)`, deep-subcooled `rho_from_h`). It also found
that **every gate tolerance was 1.4–2.6× looser than the header claim beside it**, so no claim was
policed by any check — which is *how five of them came to be false*.

> **AN INJECTION SELF-TEST PROVES THE CHECKS YOU THOUGHT TO WRITE. IT CANNOT PROVE THE ONES YOU
> DID NOT.** The mutation set is itself an artifact of the author's imagination, and mine had a
> three-function hole in it. The framework was sound — 8 of the reviewer's 19 mutations were
> already caught — but **a self-test is a floor, not a substitute for an adversary who does not
> share your blind spots.**

**Fixed:** mutation set 17 → **26**, covering every demonstrated class; tolerances tightened to sit
just above the measured claims; new checks for every previously-uncalled export; continuity now
asserted **relatively** at 8 pressures including 0.35 and 18 MPa (the old absolute 0.5 kg/m³ band
was 26 % of ρ_g at low pressure — vacuous — and never checked the pressures where the real jump
exceeded it). **231 checks, 26/26 mutations caught, no blind spots.**

**One more trap, found while fixing:** git's `autocrlf` rewrites the library to CRLF, so every
**multi-line** mutation anchor silently stopped matching. The runner now normalises line endings
before matching — *a gate whose coverage depends on the checkout's line-ending policy is not a
gate.*

### 7.5 What the review confirmed — evidence too

- **`k_comp`'s sign reversal is right.** NIST secant at 288 °C: −0.645 against the library's
  −0.642. The physics call holds.
- **The bulk modulus really is ~225 MPa at 610 °F (321 °C)**, not 1237 — confirmed by an
  independent sound-speed method. The 5.5× revision stands.
- `cp_l` is the exact analytic derivative of `h_l_sat` (1e-7). `T_from_h` round-trips to 2.4e-10 °C
  in all three regimes. Two-phase mixing is exactly linear in specific volume. No NaN or Infinity
  for any finite input. `h_fg` → 0 at the critical point confirmed. Every `SAT_P`, `COMP_L` and
  `SUP_V` row verifies against NIST to the printed digit.
