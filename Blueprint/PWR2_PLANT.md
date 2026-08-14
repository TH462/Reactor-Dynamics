# PWR2 — Plant Model (D3)

**Status:** DESIGN, for review. Nothing built. #479. Spine: `PWR2_DESIGN.md`. Core: `PWR2_PHYSICS.md`.

---

## 1. Q5 — ~~ANSWERED~~ **RETRACTED. STATUS: OPEN.**

> **⛔ THIS SECTION IS WRONG. Do not cite any number in it.** Independent adversarial review,
> 2026-08-13, found the replacement cross-check is **CIRCULAR**, plus three sourcing failures.
> Retained below only so the error is legible; superseded by §1a.
>
> 1. **Check A cannot reject the declared value, because the declared value IS Check A run
>    backwards.** `pwr_config.js:790` says so in its own comment: *"the declared RCS currency IS
>    power-scaled Ginna to 1.3 %: 38,323 gal × 300/1520 ≈ 7,467 gal"*. Check A's Ginna row is that
>    same division. Declared 3.327 vs Ginna 3.370 ft³/MWt = ratio **0.987 — exactly the 1.3 %
>    rounding**. The agreement I read as validation is one division reported twice. **This is the
>    THIRD time a "validation" has turned out to be a restatement of where the number came from.**
> 2. **Ginna's flow is wrong and the corpus had the right number.** I used **178,000 gpm**; that is
>    Ginna's *circulating water pumps* (UFSAR ch10). RCS thermal design flow is **170,200 gpm**
>    (UFSAR ch15, Table 15.6-11, 85,100 gpm/loop × 2) — **in the corpus**. I web-recalled a number
>    `find_source.js` would have corrected, in a document claiming *"computed, not recalled"*.
> 3. **The band is narrower than one plant's own licensing history.** Ginna's RCS hardware did not
>    change at uprate, yet it reads **3.37 ft³/MWt at 1,520 MWt and 2.83 at 1,811** — a 19 % swing
>    with no pipe moved, against a band only **9 % wide**. Specific RCS volume is not a design
>    invariant; it is hardware-over-license-condition, and my band silently mixed vintages.
> 4. **Two of three data points are not in the corpus.** The 12,600 ft³ "W 4-loop (WTSM §3.2)" is
>    **not in `ML11223A213`** — it traces to my own *"~12,600 ft³"* tilde'd recall in
>    `PWR_DESIGN_BASIS.md` §6, which became a hard table row with a section citation here. That is
>    laundering. BVPS-2's 9,650 ft³ has no document in any lane. Ginna's 38,323 gal is not in the
>    corpus either.
> 5. **The dataset varies the wrong axis.** Per-loop power spans only **1.17×** across all three
>    plants while loop count spans 2× — so the near-constancy is evidence of invariance to *loop
>    count*, the parameter **not** being extrapolated. SLS-100 is a 5–11× extrapolation in plant
>    power on an axis where the data has no leverage. Same structure as the error it replaced.
> 6. **The verdicts were stated more favourably than the numbers.** Declared 3.327 against a band
>    starting at 3.37 is **below** it, and I marked it PASS. Both checks reject **both** candidates
>    on the same side. Honest reading: **both are wrong — declared by ~9 %, derived by ~37 %.**
> 7. **The two checks are not independent.** transit ≡ (V/P)·ρΔh, so B is A times flow-per-MWt,
>    which is *ruled identical* for SLS-100. One check reported twice — and it was the sole stated
>    basis for reversing my earlier position on the declared volume. **That reversal is withdrawn.**
> 8. **§1 contradicts itself:** it uses size-*invariance* to license the band and size-*dependence*
>    (item 1 of the shortfall ranking) to explain the miss.
>
> **D1 §8(2)'s stop condition is currently met** — no valid topology-appropriate check exists yet.
> Not fatally: §1a names checks that should work.

## 1a. What a valid check must be — the pattern behind three failures

**The lesson — ~~stated so it is not learned a fourth time~~ and then learned a fourth time
anyway.** My first formulation was: every collapsed check was **denominated in MWt**, the same unit
as the thing being validated. True, and too narrow.

> **⛔ GENERALISED, 2026-08-13, by review.** *"The author's 'denominated in MWt' self-diagnosis is
> too narrow; the invariant across all four failures is **recalled acceptance band**."*
>
> **The invariant is not the unit. It is that I chose the band from memory.** Restated:
>
> > **When I recall an acceptance band and my number lands inside it, that is weak evidence,
> > because I chose the band.** The failure survives any change of denominator.
>
> **The fourth instance, caught by this review and denominated in %-flow, not MWt:**
> *"real-PWR natural circulation ~4–5 % of rated at 2–3 % power"* — recalled, unsourced, and used
> **twice** (D2 §6, §1a-ii below) as the confirmation that the 8.0 m thermal-centre correction is
> right, described as *"independently confirmed"*. **It escaped my own MWt test precisely because
> it is not denominated in MWt.**
>
> **Others still load-bearing and now flagged:** the RCP "250–300 ft class" (§1a-ii's pass
> criterion), the **271.9 °C secondary saturation** the entire U check is denominated through, and
> the 43 ft/s reference velocity.
>
> **The operative rule going forward: a band must be sourced before it can accept anything.** A
> recalled band may *reject* — being wildly outside a remembered range is still information — but
> it may never confirm.

**The next checks must be denominated in something else.** Candidates, from the review, none yet run
to completion:

| Check | Unit | Why it is independent |
|---|---|---|
| **Loop ΔP closure** | pressure | Compute `Σ K ṁ²/2ρA²` from derived lengths and bores; require it to equal a real single-stage RCP developed head (~250–300 ft / 0.5–0.6 MPa). Ties length, bore and flow together with **no reference-plant scaling at all**, and independently constrains the very lengths §1 blames. D2 §6's "~0.5 MPa" is currently *asserted* — deriving it **is** the check. |
| **SG overall U = Q/(A·LMTD)** | W/m²·K | Per-unit-**area**, set by film physics, loop-count-blind. Run on this set's own numbers: 15,000 ft² (1,394 m²), 300 MWt, LMTD 29.6 K → **U ≈ 7,300 W/m²·K against a typical PWR SG's 5,000–6,500**. The SG is **15–45 % undersized** — same direction as everything else, and genuinely independent of the volume question. |
| **Core mass flux** | kg/m²·s | DNB-set. ~2,970 computed — ~15 % below typical. |
| **Linear heat rate** | kW/ft | Centreline-melt-set. ~4.5 kW/ft — ~15 % below typical, consistent with the ruled "generously margined" character. |

### 1a-i. SOURCED loop geometry — and it redirects the shortfall away from the piping

**Primary source found 2026-08-13: NUREG/IA-0444** (USNRC, April 2014), *"Simulation of LSTF Hot
Leg Break (OECD/NEA ROSA-2 Test 1) with TRACE Code"*, Tables 5 and 7 — obtained via GovInfo
(`GOVPUB-Y3_N88-PURL-gpo49031`; every nrc.gov PDF 403'd). It gives real Westinghouse loop
geometry for two plants:

| | Tsuruga-2 (W 4-loop, 3423 MWt) | Almaraz I (W 3-loop, 2947 MWt) |
|---|---|---|
| Hot leg length | **22.9 ft (6.99 m)** | **23.8 ft (7.25 m)** |
| Per-loop piping volume | — | hot 112.3 + crossover 127.1 + cold 114.1 = **353 ft³** |
| Total RCS | 12,254 ft³ = **3.580 ft³/MWt** | 9,922 ft³ = **3.367 ft³/MWt** |

**These are independent of Ginna**, so they are not subject to §1's circularity — though the
review's *vintage-sensitivity* objection to any ft³/MWt metric still stands and this is offered
as a bound, not a proof.

**THE DESIGN RULE, now sourced rather than argued:** loop **length** is set by layout and does
**not** scale with power. Only **diameter** scales, with flow, to hold velocity. Correct scaling
is therefore `A × ratio, L unchanged → V × ratio`.

**And the arithmetic exonerates the piping:**

```
Almaraz per-loop power  982.3 MWt   ->  SLS-100 ratio 300/982.3 = 0.3054
piping   353 ft3 x 0.3054 = 107.8 ft3        my derived value: 108.1 ft3
```

**Essentially exact.** §1's ranked shortfall list put loop length FIRST, and it is wrong — the
piping was already right. Where the shortfall actually is:

```
Almaraz NON-piping (RPV + SGs + RCPs + PZR) = 3.007 ft3/MWt  ->  902 ft3 at 300 MWt
mine: RPV 228.1 + SG 214.5 + RCP 10 + PZR 125.2             =   578 ft3
SHORT BY 324 ft3 -- ALL of it outside the piping
```

**Two independent lines converge here.** The review — which never saw this source — independently
found the RPV downcomer gap mechanically unbuildable (recovering ~86 ft³) and the SG **15–45 %
undersized** on an overall-U check (7,300 W/m²·K against a typical 5,000–6,500). Those are exactly
the two components this arithmetic indicts, reached by a different route. **That convergence is
the first thing in this design set that looks like real validation**, precisely because the two
methods share no denominator.

*(Remaining gap after both corrections is ~140 ft³, still unattributed — the pressurizer is a
candidate: WTSM's 1,800 ft³/3,411 MWt = 0.528 ft³/MWt implies ~158 against my 125, and #472 owns
it.)*

### 1a-ii. Loop ΔP closure — RUN. **Partially independent, and the honest reading is "in family", not "validated".**

The first check denominated in **pressure** rather than MWt. Computed from geometry:
Darcy-Weisbach friction plus form losses, on velocity-sized bores and the **sourced** lengths of
§1a-i, at ṁ = 1639 kg/s.

| Segment | v (m/s) | friction | form | total |
|---|---|---|---|---|
| SG tubes (1,637 × 0.775 in × 40 ft) | 4.66 | 85.4 | 19.2 | **104.6 kPa** |
| Core (21 assemblies, lattice Dh, 7 grids) | 4.13 | 37.3 | 42.1 | **79.4 kPa** |
| Hot leg | 13.31 | 13.5 | 93.7 | **107.2 kPa** |
| Crossover | 11.44 | 9.0 | 92.4 | **101.4 kPa** |
| Cold leg | 14.77 | 19.4 | 115.5 | **134.9 kPa** |
| Vessel internals | 5.63 | 7.2 | 44.8 | **52.1 kPa** |
| | | | **TOTAL** | **579.6 kPa = 0.580 MPa = 84.1 psi = 275 ft** |

D2 §6 **asserted** "~0.5 MPa of rated loop friction"; derived is **116 %** of it. Reference
Westinghouse RCP head is the **~280 ft** class against this **275 ft**.

**WHAT THIS DOES NOT PROVE — stated first, because the reflex to call it validation is exactly
what went wrong three times.**

- **The piping term is partly circular.** Bores were sized to hold the *reference plant's* 43 ft/s
  velocity, and §1a-i's lengths are the *reference plant's* lengths. Since ΔP ∝ v² at fixed L/D,
  reference velocity × reference length ⇒ reference ΔP **by construction**. Piping is
  **343 of 580 kPa (59 %)**, so the majority of this check is near-tautological. What it really
  says is: *pump head is set by velocity and layout, not by power* — true, useful, and not a test
  of SLS-100's geometry.
- **It is sensitive to recalled numbers.** Form losses are **59 % of the total**, and the K values
  (1.5–2.0 per leg, 7.0 for grid spacers, 2.5 for tube entrance/exit) are **RECALLED, not
  sourced**. A 30 % error in K moves the total ~18 %. **These belong on the evidence list.**

**WHAT IT DOES PROVE, and it is real.** The **core and SG terms — 184 kPa, 32 % — are genuinely
independent.** They come from assembly count and heat-transfer area, derived without reference to
any pump or velocity. Had they come out at, say, 500 kPa, the total would have blown past any
buildable single-stage RCP head and the sizing would be refuted. They did not. **That is a real,
non-circular constraint satisfied**, and it is the first one this design set has passed.

**A second result, and it confirms the review's correction.** Re-running natural circulation on
the derived ΔP with the review's corrected elevation — **thermal-centre separation ~8.0 m**, not
D2 §6's 16.8 m RCP-suction-to-tube-top:

| Δz | buoyancy | flow @ 2 % decay | @ 5 % |
|---|---|---|---|
| 16.8 m (D2 as written) | 12.2 kPa | 7.5 % | 10.2 % |
| **8.0 m (review-corrected)** | **5.8 kPa** | **5.9 %** | **7.9 %** |

Real-PWR natural circulation is **~4–5 % of rated at 2–3 % power**. The corrected elevation moves
the answer *toward* the real band from above. **The review's correction is independently
confirmed**, and D2 §6's 16.8 m should be replaced — the RCP suction is on the cold side,
downstream of the heat sink, so it contributes nothing net to ∮ρg·dz.

### 1a-iii. SG sizing run to a conclusion, and an omission in my own RPV

**SG — the overall-U check, denominated in W/m²·K (per-unit-AREA, loop-count-blind).**
```
LMTD = (321−271.9 − (288−271.9)) / ln((321−271.9)/(288−271.9)) = 29.60 K
U    = 300 MW / (1,394 m² × 29.60 K) = 7,274 W/m²·K
```
against a typical PWR SG's **5,000–6,500**. The SG is undersized. Area required to land in band:

| Target U | Area | factor | Tubes | SG volume |
|---|---|---|---|---|
| 6,500 | 16,786 ft² | 1.12× | 1,832 | 240.0 ft³ (+25.5) |
| **5,750 (mid)** | **18,976 ft²** | **1.27×** | **2,071** | **271.4 ft³ (+56.9)** |
| 5,000 | 21,822 ft² | 1.45× | 2,382 | 312.1 ft³ (+97.6) |

*Caveat: the 5,000–6,500 band is a recalled engineering norm, not sourced from this repo's corpus.
It belongs on the evidence list. The LMTD and the resulting U are computed from this plant's own
ruled temperatures and this document's own area, so the **direction** is solid even if the band
moves.*

**RPV — I NEVER COUNTED THE VESSEL HEADS.** §3's build-up is core + downcomer + lower plenum +
upper plenum. A real RPV is closed by hemispherical (or ellipsoidal) **upper and lower heads**, and
they hold coolant. On D = 1.504 m:

```
hemisphere = (2/3)·π·(0.752)³ = 0.89 m³ = 31.5 ft³ each  ->  +62.9 ft³ for the pair
```

**This is the strongest finding of this pass**, because unlike everything else in §1 it needs **no
reference plant and no per-MWt scaling** — it is a term missing from my own geometry, verifiable by
inspecting the build-up. It is also, notably, *not* on the retracted §1's ranked list of suspects.

### 1a-iv. Where the shortfall stands

**⚠ The decomposition below rests on an ESTIMATED component split of Almaraz's non-piping volume
(RPV 45 % / SG 37 % / PZR 15 % / RCP 3 %). That split is RECALLED, not sourced** — the same class
of number that has already cost this design three retractions. **Use it to localise where to look,
not as a target to size against.**

| | Target (est.) | Mine | Short |
|---|---|---|---|
| RPV | 405.9 | 228.1 | **177.8** |
| SG | 333.7 | 214.5 | **119.2** |
| PZR | 135.3 | 125.2 | 10.1 |
| RCP | 27.1 | 10.0 | 17.1 |
| | | **TOTAL** | **324.2 ft³** |

| Identified correction | ft³ |
|---|---|
| Downcomer gap 0.093 → 0.15–0.20 m (the unbuildable nozzle/gap ratio) | +86.0 |
| **Vessel heads — never counted** | **+62.9** |
| SG area to land U mid-band | +56.9 |
| RCP casing to per-MWt parity | +17.0 |
| **identified** | **+222.8** |
| **residual** | **~101 ft³ (31 %)** |

**Honest reading:** roughly two-thirds of the gap is now attributed to named, individually-defensible
causes, and **the two largest are errors in my own geometry** (an unbuildable annulus, and missing
vessel heads) rather than disagreements with a reference plant. The residual third is not
attributed and **must not be closed by adjusting the least-defended number.**

### 1a-v. SOURCED geometry applied — the shortfall largely closes, and one correction was mine to make weeks ago

Five evidence passes returned **SOURCED, high confidence**. Applying the two that bear on the
shortfall:

**SG — EPRI NP-1721 Vol. 1 §3 (Westinghouse Model 51):** *"number of tubes and tie rods 3393 …
heat transfer area 51534 ft2"* per SG at 852.5 MWt, tube 0.875 in OD × 0.050 in wall, height to
start of bend 356.75 in, to end of bend 416.59 in.

| | Design basis used | **SOURCED** | |
|---|---|---|---|
| HT area per MWt | 50 ft²/MWt | **60.5** | 21 % low |
| Average tube length | 40 ft (from an uncited ~55 ft) | **66.4 ft** | |
| At 300 MWt | 15,000 ft², 1,637 tubes | **18,135 ft², 1,192 tubes** | |
| SG primary volume | 214.5 ft³ | **259.3 ft³** | |
| **Overall U** | 7,274 W/m²·K (out of band) | **6,016** | **mid-band** |

**§1a-iii's independent U check predicted the area was low by ×1.12–1.45. The sourced area is
×1.21.** ~~That is the second genuine convergence in this document.~~

> **⚠ CLAIM WALKED BACK, same day.** A later evidence pass sourced the U band itself as
> **3,500–6,000 W/m²·K**, *"set by tube wall + fouling, NOT by the film coefficients"* — against
> the **5,000–6,500** I had recalled. **The two bands disagree, and my "mid-band" result of 6,016
> sits at the ceiling of the sourced one, not in its middle.**
>
> Worse for the claim: the reference Model 51 **computes to the same U as SLS-100 by construction**
> (area scaled linearly with power at a fixed LMTD ⇒ identical U), and on its *own* steam
> conditions (895 psig ⇒ Tsat 278.4 °C, hot/cold ~325/292 °C ⇒ LMTD 26.8 K) it reads **≈6,600
> W/m²·K — above both bands.** A check that puts a real, working steam generator out of band is
> not discriminating; something in the LMTD treatment (counter-flow idealisation, fouling
> allowance, or the effective secondary temperature) is unmodelled.
>
> **Downgraded from "convergence" to an order-of-magnitude sanity check.** It still says the
> original 15,000 ft² was too small — that survives — but it cannot arbitrate ×1.21 against ×1.45,
> and I claimed it did. **The agreement was partly an artifact of my having recalled a band that
> happened to bracket the answer.**

**RPV — CASL-U-2012-0131-004 Table 16 + WTSM §3.1 (ML11223A212):** vessel ID 173 in, core barrel
OD 152.5 in, and plena from Indian Point 2 elevations.

| | Design basis used | **SOURCED ratio** | |
|---|---|---|---|
| Lower plenum | 0.50 × ID | **0.674 × ID** | 26 % short |
| Upper plenum | 0.70 × ID | **0.844 × ID** | 17 % short |
| Heads | **omitted entirely** | hemispherical pair | +62.9 ft³ |
| **RPV total** | 228.1 ft³ | **315.1 ft³** | |

**RCP — SOURCED**, matched 4-loop pump data from the same pass: 100,400 gpm, **289 ft developed
head**, 1185 rpm, 7000 hp, **casing water volume 80 ft³**, dry weight 195,200 lb. Inertia for the
fleet 45,000–123,000 lbm·ft², with **Ginna at 80,000 lbm·ft² (3,371 kg·m²)** — which is what makes
RCP coastdown derivable (D2 §0.2) instead of a fitted exponential.

| | Design basis used | **SOURCED** |
|---|---|---|
| Casing water volume | 10 ft³ (authored ROM estimate) | **28.1 ft³** (80 × 300/852.75) |

**And an independent confirmation of §1a-ii:** the sourced pump develops **289 ft**; the loop ΔP
derived from geometry was **275 ft — 95 %.** That comparison is now against a sourced number rather
than a recalled "~280 ft class", and it is the *non*-circular half of §1a-ii (core + SG resistance)
that had to land for it to work.

**New ledger: 315.1 (RPV) + 108.1 (piping) + 259.3 (SG) + 28.1 (RCP) + 125.2 (PZR) = 835.8 ft³**,
i.e. **2.79 ft³/MWt** against the previous 2.29.

### The vintage correction — flagged by review, recorded by me, and never applied until now

The review's objection to any ft³/MWt metric was that **Ginna's RCS hardware did not change at
uprate**, so the same plant reads two different specific volumes:

| Ginna, 5,123 ft³ of unchanged hardware | ft³/MWt |
|---|---|
| at its **original** 1,520 MWt | 3.37 |
| at its **current** 1,811 MWt | **2.83** |

**SLS-100 derived: 2.79 ft³/MWt — 99 % of Ginna's current-rating figure.**

**Both readings, because picking the flattering one is the habit that caused this mess:**

- **Against current ratings (2.83):** essentially closed — 99 %, well inside the metric's own 19 %
  vintage spread.
- **Against original ratings (3.37–3.69):** still 20–26 % low. And there is an argument this is the
  right basis: SLS-100 is a *new* design built for its rating, not a plant uprated past its
  original design margin.
- **Cutting the other way:** SLS-100's power density is **85.1 kW/L against a typical 100–110**, so
  it has *more* core volume per MWt than a conventional plant — which should push its ft³/MWt
  **up**, not down. That the number still sits at the low end is unexplained.

**Status: the shortfall is reduced from ~324 ft³ to a residual that depends on which rating basis
is correct — a question this document does not settle.** What is now solid is that **every
component is built from a sourced dimension** rather than a power-scaled one, so the total is a
build-up rather than a division. That, not the ratio agreement, is why the number is worth more
than the one it replaced: the declared 998 ft³ was Ginna divided by power, and **817.8 is not a
division at all.**

**A finding the retracted section missed entirely.** Its ranked shortfall list (loop length, SG tube
length, plena) omits **the number that was just cut by 2.7× to create the shortfall**. The
re-derived downcomer gap is *itself* a 4-loop statistic — the area ratio is
`A_downcomer ÷ (N × A_hotleg)` with N = 4 — and transferring it to N = 1 preserves area but not
linear geometry, because nozzle bore scales as √(P/N) while annular gap scales as √P:

| | Reference (4-loop) | SLS-100 (derived) |
|---|---|---|
| Downcomer gap | 0.315 m (12.4 in) | 0.093 m (3.7 in) |
| Cold-leg nozzle ID | 0.737 m (29 in) | 0.447 m (17.6 in) |
| **nozzle ÷ gap** | **2.34** | **4.8** |

**A 17.6-inch nozzle discharging into a 3.7-inch annulus is not a buildable vessel.** The ratio
doubled for precisely the reason the RPV-share band failed — N went 4 → 1. **Error #2 recurred
inside the fix for error #1.** A mechanically-set gap of 0.15–0.20 m recovers ~86 ft³
(686 → ~772 ft³), the same direction as the shortfall.

---

## 1b. Superseded — the retracted reasoning, kept legible

D1 §3 recorded that the 40–45 % RPV-share check was invalid for SLS-100 (it is a 4-loop
statistic) and left the replacement open. **A valid check must be per-unit-power**, because that
is what makes it independent of how many loops the power is divided among. Two exist, and both
are computed from reference-plant data rather than recalled.

**(A) Specific RCS volume, ft³ per MWt**

| Plant | RCS | Rating | ft³/MWt |
|---|---|---|---|
| W 4-loop (WTSM §3.2) | 12,600 ft³ | 3,411 MWt | 3.69 |
| BVPS-2 (UFSAR T5.1-1) | 9,650 ft³ | 2,660 MWt | 3.63 |
| Ginna (38,323 gal) | 5,123 ft³ | 1,520 MWt | 3.37 |
| | | **band** | **3.37 – 3.69** |

At 300 MWt that is **1,011 – 1,108 ft³**.

**(B) Loop transit time** — flow-path volume ÷ volumetric flow. **Computed from reference
geometry, not recalled** (my earlier "10–12 s" was itself a recalled number and was wrong):

| Plant | Flow path | Flow | Transit |
|---|---|---|---|
| W 4-loop | 10,800 ft³ | 789 ft³/s | **13.7 s** |
| Ginna | 4,376 ft³ | 397 ft³/s | **11.0 s** |
| | | **band** | **11.0 – 13.7 s** |

### Applying both — and the result reverses an earlier position

| | Specific volume | Transit |
|---|---|---|
| **Derived** (this design set, 685.9 ft³) | **2.29 ft³/MWt — FAIL** | **6.84 s — FAIL** |
| **Declared** (`pwr_config`, 998.2 ft³) | **3.33 ft³/MWt — PASS** | 10.37 s — 6 % under, in family |

**Both checks reject the derived geometry and accept the declared one.** The forward derivation is
short by roughly **35–45 %**; the checks imply a total nearer **1,000–1,270 ft³**.

**This reverses my own earlier suspicion.** I recorded (`PWR_LOOP_GEOMETRY.md` §8, and in chat)
that the declared RCS volume was a likely error with "wide blast radius" across #408's flow
currency, PORV sizing and boration rates. **It is not.** It is approximately right, and the
forward derivation is the thing that is wrong. Two independent per-unit-power checks agreeing is
also considerably stronger evidence than the single invalid check that appeared to validate the
derivation in the first place.

### Where the shortfall most likely is — and the design insight behind it

Ranked, **not resolved here** (closing a ledger by adjusting the least-defended number is the
failure mode this whole effort exists to end):

1. **Loop piping length — the likeliest, and there is a real reason.** I chose 15/25/15 ft by
   scaling. **Loop length does not scale with power.** The SG must sit above the core for natural
   circulation; the RCP must sit at a low point for NPSH; thermal-expansion loops and maintenance
   access are set by pipe metallurgy and human bodies. **None of those shrink when the reactor
   does** — so a small plant has *proportionally more* loop volume per MWt, which is exactly the
   direction the checks demand. Real-plant-class runs are ~75–85 ft total against my 55 ft.
2. **SG tube length** — 40 ft, derived from an uncited ~55 ft. The one component resting entirely
   on an unsourced length.
3. **RPV plena** — still ratios of RPV ID (0.50× / 0.70×), which is scaling, not sourcing.

**D3's geometry table is therefore PROVISIONAL** and is the first thing the build must re-derive.

---

## 2. Topology — nodes and junctions

Elevations from `PWR_LOOP_GEOMETRY.md` §5 (core midplane = 0). **Volumes provisional per §1.**

### Nodes

| # | Node | Transport | Wall lumps | Notes |
|---|---|---|---|---|
| 1 | RPV downcomer | plug | 3 | Thick vessel wall dominates; Biot number is not small |
| 2 | RPV lower plenum | stirred | 2 | |
| 3 | Core | plug | 1 (clad) | Heat source; clad is its own thermal node |
| 4 | RPV upper plenum | stirred | 2 | |
| 5 | Hot leg | **plug** | 2 | Transport must arrive intact, not smeared |
| 6 | SG primary (tubes) | plug | 1 | Thin tubing; heat sink to secondary |
| 7 | Crossover leg | **plug** | 2 | Loop-seal behaviour lives here |
| 8 | RCP | stirred | 1 | Located pump-work source (not a fraction of core heat) |
| 9 | Cold leg | **plug** | 2 | ECCS injects here — the bypass path |
| 10 | Pressurizer | stirred | 1 | **#472 owns this** — see §4 |
| 11 | SG secondary | stirred | 1 | Lumped, see §3 |
| 12 | Containment | stirred | 0 | Already node-shaped today (`stepContainment`) |

### Junctions

| Junction | From → To | Carries |
|---|---|---|
| J1–J8 | the loop, node *n* → *n+1* | ṁ, buoyancy, friction; **J8 (RCP) carries the pump head curve** |
| J-surge | hot leg ↔ pressurizer | **bidirectional** — insurge and outsurge. Resistance + elevation, no capacity |
| J-spray | cold leg → pressurizer | Spray, driven by the loop ΔP the RCP creates |
| J-relief | pressurizer → containment | PORV + code safeties |
| J-charge / J-letdown | CVCS ↔ cold leg / crossover | |
| J-hpi / J-lpi / J-accum | ECCS → **cold leg** | Injection point is what makes cold-leg-break bypass real |
| J-rhr | hot leg → RHR → cold leg | Interlocked suction |
| J-break | **any node** → containment (or SG secondary) | §6 |

**The surge line is a junction, not a node** — negligible capacity, so it is resistance plus
elevation. It is bidirectional by construction, which is what the owner's "both inlet and outlet"
observation requires.

---

## 3. Q6 — ANSWERED: the secondary is LUMPED

**Nodalise the primary; lump the secondary.** Reasons, in order:

1. **The defect is not there.** The measured failures (no mass flow, ~35–45 % volume shortfall,
   1.51× flow error) are all primary-side. Nodalising the secondary would add state and risk
   without addressing anything that is known to be wrong.
2. **The Tier A couplings that involve the secondary — A5 (SG is the only heat sink) and A9 (SG
   shrink/swell) — are satisfiable by a lumped SG.** A9 is explicitly an *instrument* effect, not
   SG void physics.
3. **Performance.** D1's highest-severity risk after validation. Every node costs.

**Consequence to declare:** SG secondary stratification and downcomer/riser circulation are not
represented. Revisit only if a Tier C casualty is found to need it.

---

## 4. Subsystems

**Kinetics — reuse the formulation, not the code.** Point kinetics, 6 delayed groups, 4-group
decay heat, Xe/I. This is standard and is not what is broken. **The improvement is real
feedback:** the current engine's `_modDensity` is its own cubic density fit; PWR2's moderator
coefficient reads **real density from L0**, so the moderator feedback and the coolant it feeds
back from are the same water. Today they are two independent approximations that were never
required to agree.

**Pressurizer — #472 owns it.** Its rebuild is live on `workbench`; **its design is an input to
this document, not something this document may pre-empt.** PWR2 needs from it: two-region
liquid/steam state, heater elevation and progressive authority loss, and the surge-line boundary
(which per D2 must expose local saturation margin at the hot-leg tap, not just flow and
direction).

**SG, BOP, containment.** SG: lumped secondary (§3), primary tube node with real metal mass — the
tube bundle is ~20,500 lbm of Inconel and is the largest metal thermal mass in the plant.
Turbine/condenser/generator: carry over the existing formulation; it is downstream of the defect.
Containment: **already a node** and the smallest slice — `stepContainment` integrates
`_ctmt_steam`, `_ctmt_sump` and a hydrogen ledger, takes flux inputs and publishes pressure.

**ECCS / CVCS / RHR.** All become junctions with pump curves. The one that changes character is
**ECCS injection point**: it injects into the *cold leg node*, so a cold-leg break is spatially
between the injection and the core. That is not a special case in the code — it is the topology.

---

## 5. The nine Tier A couplings — what the model must express

`Blueprint/CURRICULUM.md`, all RULED and binding.

| | Coupling | Mechanism in PWR2 |
|---|---|---|
| A1 | Power follows load | MTC from **real** density + Doppler |
| A2 | Tavg is the coupling variable | Node temperatures are real; Tavg is derived from them, not a state |
| A3 | Pressure follows temperature | Single pressure state driven by thermal-expansion surge through J-surge |
| A4 | Level is not inventory | Pressurizer two-region (#472) + surge; **shrink/swell falls out** |
| A5 | SG is the only heat sink | SG tube node is the only sink path; lose feed and it saturates |
| A6 | A reactor cannot be switched off | Decay-heat groups, unchanged formulation |
| A7 | Xenon | Unchanged formulation |
| A8 | Boron vs rods | Boron mixes through the **node network**, so its transport lag is derived rather than a fitted first-order lag |
| A9 | SG shrink/swell (gauge) | **Instrument** effect — lives in the instrument layer, which PWR2 does not change |

**A8 is the one that improves most:** today `boron_reactive` is a fitted mixing lag; in a node
model boron is a transported scalar and the lag is loop transit.

---

## 6. Casualties as junctions

A break is `{from: <any node>, to: containment | sg_secondary, area, flow law}`. **Break location
becomes physics rather than a scalar severity** — the current engine has one `leak_flow` with a
single destination flag (`_leak_to_sg`).

| Break location | Emergent behaviour |
|---|---|
| **Cold leg** | ECCS injects into the same node. ⚠ **See the correction below — this row overreached.** |
| **Crossover** | Drains the loop seal; governs whether natural circulation survives |
| **Hot leg** | Highest-enthalpy discharge → different flash fraction into containment |
| **SG tubes** | Destination is SG secondary, not containment — **the containment-bypass diagnosis lesson**, and the one case the current engine already models this way |

**No new physics is required for MOST of these** — only the junction primitive and honest
topology.

> **⛔ CORRECTION, 2026-08-13 — the ECCS-bypass claim overreached the RULED physics.**
> I called cold-leg-break ECCS bypass *"pure topology"* and *"the strongest single argument for the
> node model"*. **It is not reachable under the homogeneous-equilibrium ruling.**
>
> Real ECCS bypass is **counter-current flow limitation** — steam flowing up the downcomer drags
> injected water back out the break against gravity. That requires **relative velocity between the
> phases.** Ruled HEM has **one velocity, no slip**, so a shared node produces proportional
> *mixing*: whatever the algebraic junction flows happen to give, not a bypass mechanism. **The
> ruling structurally cannot produce the phenomenon I claimed as the architecture's best argument.**
>
> **What survives, and it is still real:** break *location* changes where inventory leaves and what
> the injected water mixes with before reaching the core, so a cold-leg break is still meaningfully
> worse than a hot-leg break. **That is a topology effect and it does hold.** What does not hold is
> naming it ECCS bypass, or claiming the limiting-case behaviour of real LOCA analysis.
>
> **Consequence for the scope ruling:** if genuine CCFL is wanted, HEM is insufficient and the
> two-phase ruling would need revisiting (drift-flux was offered and declined). **That is an owner
> decision, not something to smuggle in through a correlation.** The loop-seal and SGTR rows are
> unaffected — both are genuine topology.

The topology argument still stands where the numbers are provisional; it stands **less strongly**
than this section originally claimed.

---

## 7. Open, carried forward

- **§1's shortfall is not closed.** The geometry table is provisional; the build must re-derive
  loop lengths (not scaled), SG tube length (sourced), and plena (sourced).
- Pump head curve shape and rotational inertia — needed for derived coastdown (D2 §3).
- `h_film` correlations for boiling and condensing — D2 §8 flags these as the likeliest route for
  recalled constants to re-enter.
- #472's pressurizer design, as an input.

---

## 8. CCFL under HEM — RESOLVED as a JUNCTION closure *(owner, 2026-08-13)* — **NOT REQUIRED, D1 §23**

> **⚠ STATUS, 2026-08-14: this section is PRESERVED DESIGN, not a build item.** *(OWNER RULING,
> 2026-08-14: "drop it as a design requirement, keep it as a declared demonstration.")* CCFL exists
> to make the **large-break** ECCS-bypass phase come out right, and large break is now a declared
> demonstration rather than a fidelity target — `CURRICULUM.md` ranks Large LOCA (E09)
> **Tier D-adjacent**. **The unsourced downcomer/tie-plate constants are no longer owed and the
> evidence pass is cancelled.** The reasoning below is sound and is kept deliberately: it is the
> right answer if E09 is ever promoted, and promotion requires a Q0 measurement first. **Do not
> build it speculatively, and do not delete it.**

*(OWNER, 2026-08-13: "For hem what if we solved it at the boundary between the downcomer/pipe
interface or the rod channel/bottom pool interface? Basically when it's full of steam it rejects
water.")*

**This is correct, it is standard practice, and it dissolves a choice I had wrongly framed as
binary.**

### 8.1 Where I went wrong

§6's correction said the ruled homogeneous-equilibrium model *"structurally cannot produce"*
ECCS bypass, and offered two exits: drop the ambition, or reopen the two-phase ruling to
drift-flux. **Both premises were too narrow.**

The reasoning error: I treated CCFL as something that must **emerge from node physics**. It is not
a node phenomenon at all. **It is a junction closure** — and junctions are precisely where this
design already has freedom, because §0.2 makes them quasi-steady algebraic rather than integrated.

### 8.2 The mechanism

At a **designated** junction, cap the downward liquid delivery as a function of the upward vapour
flux. The standard forms are dimensionless superficial velocities:

```
sqrt(j*_g) + m·sqrt(j*_f) = C           Wallis  (small bore, horizontal)
Kutateladze form                        (bore > ~50 mm, set by critical wavelength / surface tension)
```

Under HEM the junction carries one mixture at one velocity, and its **quality gives the phase
split** of what is trying to pass — so `j*_g` is known. The CCFL relation then **caps the liquid
that may pass downward**, and the rejected liquid stays upstream. That is exactly *"when it's full
of steam it rejects water."*

**Crucially this needs no slip inside any node.** It is a *directional capacity limit on a
junction*, not a two-velocity field. The HEM ruling stands untouched.

### 8.3 The two locations named are the right two

| Junction | Phenomenon |
|---|---|
| **Cold leg → downcomer** | **ECCS bypass** — the limiting cold-leg-break case. Upward steam rejects injected water before it reaches the lower plenum. |
| **Core channel → lower plenum / upper tie plate** | **Reflood delay** — steam generated in the core rejects water attempting to re-enter from above. |

Both are standard CCFL application points in production codes. The surge line is a third
(documented in the literature) and is worth considering once #472 lands.

### 8.4 Sourcing status

- **RELAP5 carries a CCFL model applied at user-designated junctions**, with both Wallis and
  Kutateladze forms — and it has its own NRC assessment, **NUREG/IA-0100, "Assessment of CCFL
  Model of RELAP5"**. *(Located, not yet retrieved — nrc.gov 403s; use the INIS/Wayback routes
  that worked for the RELAP5 manuals.)*
- **The correlation constants are geometry-specific and are NOT yet sourced for this plant.** One
  published pair found (`m = 0.94`, `C_K = 1.24 ± 0.1`) is for a **pressurizer surge line**, not a
  downcomer — **do not adopt it.** Per D3 §1a's rule, a recalled or borrowed band may not confirm
  anything; the downcomer and tie-plate constants need their own citation.

### 8.5 Honest accounting — what this is and is not

**It is a DECLARED DEPARTURE, not emergent physics.** A correlation is being asserted at a
junction because the ruled model cannot generate the phenomenon underneath it. That is legitimate
and well-precedented — it is what production codes do — but it must be **declared**
(`DESIGN_COMPANION` §8), not presented as the node model producing CCFL on its own.

**What genuinely improves:** the *topology* argument in §6 was already sound (break location
changes where inventory leaves and what injected water mixes with). CCFL at the junction now adds
the **magnitude** that topology alone could not supply. Together they make cold-leg-break bypass
reachable **without abandoning HEM and without drift-flux.**

**Still owed:** the constants, sourced for downcomer and tie-plate geometry; a rule for where the
rejected liquid goes (stays upstream vs exits the break — this changes the inventory ledger and is
not a free choice); and whether the cap applies to the algebraic junction flow before or after
§18.2's closure solve, which is a sequencing question the build must settle.
