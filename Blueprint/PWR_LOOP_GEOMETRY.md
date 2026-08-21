# PWR Loop Geometry Table — #474 prerequisite

**Status:** layout, lengths and RCP data are now DECIDED (owner delegated the call,
2026-08-13) rather than placeholders — see §5 and §6. Not yet used by any engine code.
No physical volumes/masses/areas exist anywhere in `engines/pwr/` today — every thermal
constant (`coolant_heat_capacity`, `h_fc`, `h_sg`, `sg_tube_capacity`, `tau_hotleg_s`,
`tau_coldleg_s`) is a normalized rate or a fitted time constant, not a derived quantity.
This table is the geometry #474's node model needs to convert those into `V`, `M_wall`,
`A`, `ρ`, `cp` and derive the rates instead of fitting them.

**Scope: loop piping + RCP only** (hot leg, crossover, cold leg, SG primary tube volume,
RCP), matching #474's filed scope. Core/RPV internals are a separate, larger question
(#474 doesn't claim them) and are NOT in this table. The pressurizer is **owned by
#472** (active rebuild, workbench) and is deliberately not duplicated here — the surge
line is the junction connecting the hot-leg node to whatever #472 lands.

**HR12: nothing below is a claim about this plant's dynamics.** It is a geometry
estimate for a fictional plant, most of it derived from a real reference plant's sourced
dimensions by a stated scaling method. Where the method is a physics identity (constant
hoop stress, constant hydraulic diameter → constant flow area at constant power/ΔT), the
derivation is load-bearing. Where it's an engineering placeholder (lengths), it is marked
**PLACEHOLDER** and should not be trusted past "the table has a runnable number in it."

---

## 1. Source and scale method

**Source:** Westinghouse Technology Systems Manual §3.2, Reactor Coolant System
(NRC HRTD, `ML11223A213`, already in this repo's source corpus at
`inbox/sources/ML11223A213.txt`). Generic 4-loop Westinghouse reference plant,
**3411 MWt** total (confirmed via the companion §2.2 module; not in the local corpus,
web-sourced this session — flag for a later corpus add), **852.75 MWt/loop**.

**This is NOT the Ginna anchor plant** the rest of `pwr_config.js` overwhelmingly uses
(dozens of sourced constants — pressurizer, SG, steam dump, ECCS, condenser, all cite
Ginna UFSAR/TS Bases). Both the local source corpus and a web search were checked
specifically for Ginna's own RCS piping dimensions (a UFSAR Ch. 5-style diameter/volume
table) — neither turned one up (2026-08-13; `find_source.js` and web search both came
back empty for Ginna hot/cold-leg piping data). WTSM §3.2 is the only document found with
literal pipe-diameter, pressurizer-volume and SG-tube tables, which is why it's the
source for *this* gap specifically. **Consequence, stated plainly rather than buried:**
this document's scale factor (`r_P = 300/852.75 = 0.3518`, this section, below) is NOT
the same number as the Ginna-anchored per-loop scale factor used everywhere else in
`pwr_config.js` (`300/908.5 = 0.3302`, `pwr_config.js:1435`) — two different real plants'
per-loop power, ~6.5% apart. Forcing the Ginna factor onto WTSM-sourced dimensions isn't
obviously more correct (assumes the two plants scale identically per MWt, unverified) —
flagged here rather than silently resolved either way. Whoever builds the node model
needs to pick one deliberately, not inherit this document's number by default.

RPV/core secondary figures (RPV ID ~14 ft, core barrel ID ~12 ft, active fuel 12 ft) are
**not** in this table's scope but are noted in §4 for whoever picks up the RPV/core split
later — those came from secondary sources (MIT OCW course notes) this session, not a
primary UFSAR, and need their own evidence pass before use.

**SLS-100 is 300 MWt, single loop.** Per-loop power ratio:

```
r_P = 300 / 852.75 = 0.3518
```

Two different physical quantities scale differently with that ratio, and conflating them
is the mistake to avoid:

- **Flow area** (pipe ID, SG tube count) scales to hold **coolant velocity** roughly
  constant at the plant's own ΔT (SLS-100's rated ΔT is 33 °C — already close to the real
  design ΔT this reference plant uses, so this isn't a stretch). Mass flow ∝ power at
  constant ΔT, and flow area ∝ mass flow at constant velocity, so:
  ```
  r_D = sqrt(r_P) = 0.5931        (applied to pipe ID)
  ```
- **Wall thickness** scales to hold **hoop stress** constant at ~constant design pressure
  (2235 psia this plant vs 2485 psig reference — same order, same material class):
  `t = P·D/(2σ)` → at constant P, σ: `t ∝ D`, so wall thickness scales by the **same**
  `r_D`, not `r_P`.
- **Lengths / layout** (pipe run length, SG tube length) are not set by either of the
  above — they're a physical-package/geometric-similarity question. Where used at all
  below they use `r_L = r_P^(1/3) = 0.7057`, and are marked PLACEHOLDER regardless — this
  repo has no authored SLS-100 physical layout to source them from.

Steel density: 489 lbm/ft³ (carbon/stainless, standard). Water density: 44.0 lbm/ft³
at hot-leg conditions (~610 °F/2235 psia), 47.9 lbm/ft³ at cold-leg conditions
(~550 °F/2235 psia) — standard steam-table approximations, not plant-specific.

---

## 2. Loop piping — per-unit-length properties (sourced ID/wall → derived)

Presented per foot of run so the one truly unsourced input (length) is isolated to a
single multiplication, not baked into every other number.

| Segment | Reference ID / wall (sourced) | SLS-100 ID / wall (r_D scaled) | Flow area (ft²) | Metal area (ft²) | Fluid mass/ft (lbm) | Metal mass/ft (lbm) |
|---|---|---|---|---|---|---|
| **Hot leg** (RV outlet → SG inlet) | 29.0" / 2.84" | 17.20" / 1.685" | 1.613 | 0.694 | 71.0 | 339 |
| **Crossover** (SG outlet → RCP suction) | 31.0" / 2.99" | 18.39" / 1.773" | 1.846 | 0.779 | 88.4 | 381 |
| **Cold leg** (RCP discharge → RV inlet) | 27.5" / 2.69" | 16.31" / 1.595" | 1.451 | 0.623 | 69.5 | 305 |

Reference IDs/walls: Table 3.2-1, `ML11223A213` ("Inlet piping" = cold leg = RV inlet
nozzle side, matches RCP discharge nozzle 27.5" in the same table; "Outlet piping" = hot
leg; "RCP suction piping" = crossover, matches RCP suction nozzle 31.0"). Wetted
perimeter = π·ID for all three (circular pipe, so hydraulic diameter = ID directly — no
separate row needed).

**To get a node's V and M_wall: multiply the area columns by that segment's length.**
No sourced length exists for SLS-100 — lengths are a layout decision, not a literature
question, so §5 below fixes them (DECIDED, not derived).

| Segment | V_fluid (ft³) | M_wall (lbm) |
|---|---|---|
| Hot leg (L=10 ft) | 16.1 | 3,394 |
| Crossover (L=13 ft) | 24.0 | 4,954 |
| Cold leg (L=8 ft) | 11.6 | 2,437 |

---

## 3. RCP

Nozzle sizes come straight from the crossover/cold-leg row above (RCP suction = crossover
ID, RCP discharge = cold leg ID) — sourced. **Internal casing free volume and casing
metal mass have no source anywhere in this pass** — `ML11223A213` describes the casing
qualitatively (304 SS, vertical single-stage centrifugal, hydraulic/seal/motor sections)
but gives no internal volume or casing weight, and this repo's corpus has no pump data
sheet. **DECIDED (owner delegated, 2026-08-13)** rather than left open:

- **Internal free (fluid) volume ≈ 9.5 ft³.** Average of the two nozzle flow areas
  ((1.846 + 1.451)/2 = 1.649 ft²) × an assumed internal flow-path length of 4 diameters
  (≈ 5.8 ft) — the standard rough-order-of-magnitude way to size a single-stage
  centrifugal pump's wetted cavity from its nozzles when no casing drawing exists.
- **Casing (hydraulic-section only, not the motor) metal mass ≈ 5,300 lbm (2.65 tons).**
  A pump casing is a thick structural forging, not a thin pressure pipe — modeled here
  as a shell 2.5× the adjoining cold-leg pipe wall (1.595" × 2.5 ≈ 4.0") around that same
  average nozzle diameter, same 5.8 ft length: metal area 1.858 ft² × 5.8 ft = 10.78 ft³
  × 489 lbm/ft³ ≈ 5,270 lbm, rounded up for the flange/nozzle material a bare cylinder
  underestimates. Only the hydraulic-section casing counts here — the motor/seal stack
  above it is not in thermal contact with the coolant and isn't part of this node's wall
  mass. **Both numbers are an authored engineering estimate, not a citation** — replace
  with a manufacturer weight or UFSAR pump data sheet if one ever surfaces.

RCP flow: reference plant 88,500 gpm/pump (sourced, `ML11223A213`), scaled by `r_P` to
≈31,100 gpm. **This does not match the plant's own existing declared `rcs_flow_gpm:
24000`** (`pwr_config.js:71`, set by #408 from a declared RCS volume/residence-time
convention, not from pipe sizing) — a real ~23% velocity disagreement (reference hot leg
runs ~43 ft/s; 24,000 gpm through this document's derived hot-leg area is ~33 ft/s), not
rounding noise. **Not resolved here** — `rcs_flow_gpm` is a tuned, gated, plant-wide
constant and changing it is a physics/tuning decision, not a geometry one. Whoever builds
the actual node model has to pick a side: re-derive pipe area against the existing
24,000 gpm, or carry this document's areas and revisit `rcs_flow_gpm`.

---

## 4. SG primary side (U-tube bundle) — replaces `sg_tube_capacity`

Reference: 3,388 tubes, 0.875" OD × 0.050" wall (Table 3.2-7, `ML11223A213`, sourced),
shell height 67.75 ft (sourced).

**Tube OD/wall is a manufacturing standard, not a per-plant-size dimension** — real
Westinghouse SGs across a wide range of plant sizes use the same 0.75–0.875" tubing.
Scaling tube diameter down with `r_D` would imply custom-drawn tubing SLS-100 wouldn't
actually use. Scaling **tube count** by `r_P` instead is the physically defensible move:

```
tube count = 3,388 × r_P = 3,388 × 0.3518 ≈ 1,192 tubes  (real 0.875"/0.050" tubing, unscaled)
```

Average tube length (tubesheet → U-bend → tubesheet) is **not sourced** — not in this
document's excerpt of `ML11223A213`, not found elsewhere this session. PLACEHOLDER: real
Westinghouse average tube length is commonly cited around 55 ft for this shell height;
scaled by `r_L` (layout-driven, not flow-driven) → 55 × 0.7057 ≈ **39 ft**.

| | Per tube | × 1,192 tubes, × 39 ft |
|---|---|---|
| Flow area | 0.003276 ft² | fluid volume ≈ **152 ft³** |
| Metal (annulus) area | 0.000900 ft² | metal volume ≈ **41.9 ft³** → mass ≈ **20,500 lbm** (10.25 tons) |

Fluid mass in the bundle ≈ 152 ft³ × ~45 lbm/ft³ (mixed hot/cold side) ≈ **6,850 lbm**.

**This is the number to compare against the current `sg_tube_capacity: 5.0`** (normalized,
"~25% of `coolant_heat_capacity`") once someone does the unit reconciliation — tube metal
alone carries ≈20,500 lbm × 0.12 Btu/lbm·°F ≈ 2,460 Btu/°F of heat capacity, a number
`sg_tube_capacity` has never been checked against because nothing in the current model is
in physical units.

---

## 5. Layout — DECIDED (owner delegated, 2026-08-13)

A physical footprint for SLS-100's single loop, authored (not sourced) to satisfy the
constraints this repo already asserts elsewhere: the SG sits above the core (drives
natural circulation — `Manuals/12` §12.4, `naturalCircFlow`), and the RCP sits at a low
point for NPSH margin (real Westinghouse practice, and already implicit in
`computeNodePressures` naming `p_pumpsuction` the lowest-pressure node).

**Reference elevation: core midplane = 0 ft.** Lengths are the §2/§4 run lengths; this
section adds elevation change along each run.

| Point | Elevation | Segment from previous point | Length | Elev. change |
|---|---|---|---|---|
| RV hot-leg nozzle | +8 ft | — | — | — |
| SG inlet nozzle | +9 ft | Hot leg | 10 ft | +1 ft |
| SG U-tube top (highest point in the loop) | ≈+50 ft | (inside SG shell, scaled height 47.8 ft, tube top ≈85% of shell height above the inlet nozzle) | — | — |
| SG outlet nozzle | +7 ft | (down through the tube bundle's cold-side leg) | — | — |
| RCP suction | −5 ft | Crossover | 13 ft | −12 ft |
| RCP discharge | −5 ft | (RCP — negligible elevation change across the pump itself) | — | — |
| RV cold-leg nozzle | +2 ft | Cold leg | 8 ft | +7 ft |

**~55 ft of elevation gain from RCP suction (lowest) to the SG tube top (highest)** is
the number that matters for natural-circulation buoyancy — it's the thing
`naturalCircFlow`'s W ∝ Q^⅓ shape is driving flow against. **This does not change the
plant's existing pressure physics** — `computeNodePressures` stays a purely quasi-static
ΔP(flow²) field with no hydrostatic term, and this layout doesn't add one. These
elevations are for the board (§6) and for whoever eventually decides the natural-circ
driving-head constant deserves a real elevation input instead of a fitted scale factor —
they are not wired into anything today.

---

## 6. Per-segment void/flashed display flag — DECIDED design, not yet built

Owner's ask: show on the board when a pipe section is empty / has flashed to steam —
generalizing the surge-line voided flag (`#474` comment, 2026-08-13) to the whole loop.
**Same answer as the surge line: a derived flag, not a node**, and it costs nothing new
to compute — every input already exists.

Each loop segment already has (a) a local quasi-static pressure from
`computeNodePressures` and (b) a local temperature state:

| Segment | Local pressure (existing) | Local temperature (existing) |
|---|---|---|
| Hot leg | `p_hotleg` | `thot_c` |
| Crossover | `p_pumpsuction` | `tcold_c` (loop only tracks one cold-side lag today — see below) |
| Cold leg | `p_coldleg` | `tcold_c` |
| SG tube bundle | `p_hotleg` (nearest tap; the tubes span hot→cold) | `t_sg_c` |

The flag is the same saturation test already used for bulk coolant flashing
(`pwr_thermal.js:222`, `flashing = primary_void_fraction > 0 || trueSubcooling(s) <= 0`),
evaluated locally instead of on the bulk state:

```
segment_voided = T_local >= T_sat(P_local)
```

**This is not new physics — it's the existing cavitation check, generalized.**
`stepCavitation` (`pwr_primary.js`) already computes `suction_subcool_c = T_sat(p_pumpsuction)
− tcold_c` for exactly the crossover segment; "crossover voided" and "RCP suction
cavitating" are the same condition. Applying the identical test at `p_hotleg`/`thot_c`,
`p_coldleg`/`tcold_c`, and `p_hotleg`/`t_sg_c` covers the rest with no new state variable
and no new integration — one function, evaluated four times, reusing state that already
exists and is already current (subject to the same one-step-old convention, CONTEXT §11).

**Known limitation, worth naming rather than hiding:** the crossover and cold leg
currently share one lag temperature (`tcold_c` covers "SG outlet → core inlet" as a
single segment — see `pwr_thermal.js`'s hot/cold leg transport, #418 wave B1). A voided
flag on the crossover and one on the cold leg would today move in lockstep, differing
only by which pressure node gates them. That's honest given the model — the RCP boosts
pressure at its discharge, so the cold leg genuinely does have more margin than the
crossover even sharing the same temperature — but it means "cold leg voided while
crossover isn't" is representable, the reverse is not, until the loop actually splits
into separate crossover/cold-leg temperature states (which is #474's larger scope, not
this flag).

**Cold leg will essentially never show voided** in any normal-operations scenario —
`p_coldleg` is the highest-pressure node in the loop (RCP discharge boost), so it has the
largest subcooling margin by construction. That's a sanity check passing, not a bug: real
plants have the same property, which is exactly why the crossover (pump suction, lowest
pressure) is where cavitation risk actually lives.

---

## 7. Casualties as boundary conditions, not separate physics

Owner's framing (2026-08-13): casualties should be inputs/outputs on the node model,
and containment is itself a node — true during a LOCA. Both are already partially true
of the CURRENT (non-nodal) engine, which is why the node model should formalize the
pattern rather than invent it:

- **Containment already IS a lumped node.** `stepContainment` (`pwr_primary.js:521`)
  integrates real state (`_ctmt_steam`, `_ctmt_sump`, a hydrogen ledger), takes inputs
  (`q_break`, `q_relief`, `q_slb`), and derives an output (`containment_pressure_mpa`)
  that feeds back into the loop one step later — the same explicit-coupling convention
  (CONTEXT §11) the loop nodes will use. It's the downstream node a loop break's junction
  drains into.
- **SGTR already models a break as a junction to a declared destination**, not bespoke
  physics: "discharges into the steam generator — the one break that BYPASSES
  containment" (`pwr_primary.js:527-529`). `leak_flow`, `porv_flow`, `safety_flow`,
  `steam_break_flow` are each a flow term consumed by whichever node is downstream.

**What the node model should generalize, that isn't uniform yet:** each of those flow
terms is currently its own hand-wired variable with its own destination. Under the node
model a casualty becomes **a junction primitive** — `{from: <node>, to: <destination>,
area/K, driven by local ΔP}` — opened on demand, not a new code path. A hot-leg LOCA, an
SGTR, a steam-line break are the same primitive differing only in which two nodes it
connects and which flow law governs it (subcooled / choked / two-phase). New casualty =
declare a port, not write new physics — which is also what makes a casualty demonstrate
its Tier A coupling honestly (`DESIGN_CRITERIA` §6) instead of a scripted stand-in for
one. Not designed further here — this is a principle for whoever writes the junction
primitive in §474's actual build, not a new deliverable of this document.

---

## 8. Closure check against the declared RCS volume — IT DOES NOT CLOSE

The scale-factor question (§1: this document's 0.3518 vs the config's Ginna-anchored
0.3302) turns out to be the *small* problem. The decisive test is whether this geometry
independently reproduces a volume the plant already declares — `pwr_config.js:790`,
**~7,467 gal = 998.2 ft³ of RCS** (#408's currency, itself power-scaled from Ginna's
38,323 gal). It does not.

| Component | This document | % of declared RCS |
|---|---|---|
| Piping (hot 10 ft + crossover 13 ft + cold 8 ft, §5) | 51.7 ft³ | 5.2 % |
| SG tube bundle (§4) | 152.0 ft³ | 15.2 % |
| RCP (§3) | 9.5 ft³ | 1.0 % |
| **Loop subtotal** | **213.2 ft³** | **21.4 %** |
| Pressurizer (Ginna-scaled as the config does it, `pwr_config.js:791`) | 147.4 ft³ | 14.8 % |
| **Residual left for the RPV** | **637.5 ft³** | **63.9 %** |

**A 64 % RPV share is out of family.** Real PWRs put roughly **40–45 %** of RCS volume in
the vessel. At that share the loop+SG+RCP should be **~400–450 ft³**, against this
document's 213 — short by a factor of **~1.9–2.1×**.

**And it cannot be fixed by lengthening pipe.** Holding §4's SG bundle and §3's RCP fixed,
closing the gap with piping alone demands:

| Target RPV share | Required piping volume | Implied segment lengths |
|---|---|---|
| 45 % | 240 ft³ (4.6× current) | hot 46 ft / crossover 60 ft / cold 37 ft |
| 40 % | 290 ft³ (5.6× current) | hot 56 ft / crossover 73 ft / cold 45 ft |

Those are **unphysical for a 300 MWt single-loop plant** — longer than a full-size 4-loop
plant's runs. So the §5 layout is not the error; the shortfall is elsewhere.

**Where it most likely is, in order:** (1) the **SG tube bundle**, the one component built
entirely on an unsourced tube length (§4's 39 ft, itself scaled from an uncited ~55 ft);
(2) the **declared RCS volume itself**, which was derived by power-scaling a whole-plant
figure and carries no geometry premise of its own — nothing has ever checked it against
component dimensions, because until this document no component dimensions existed;
(3) the **RPV**, which is currently a *residual* in the table above rather than a
measurement, and is the single biggest term.

**This is a real finding, not a bookkeeping wrinkle**, and it supersedes §9's earlier
claim that no further research pass was needed before writing node code. Three unknowns
(pipe run length, SG tube length, RPV coolant volume) against one constraint equation
cannot be solved — **the RPV/core geometry pass deliberately excluded from this document
(§9) is now on the critical path**, because the RPV is the dominant term and is the only
one currently carrying no independent estimate at all.

**Not resolved here, deliberately.** Fudging any single number to make the total close
would be exactly the failure mode this document exists to prevent — fitting geometry to a
declared constant rather than deriving it, which is how `coolant_heat_capacity` and
friends became unfalsifiable in the first place. The disagreement is the useful output.

*(HR12: the 40–45 % real-plant RPV share is a recalled engineering norm, not a sourced
figure from this repo's corpus — it needs its own citation before it is used to reject
anything. The ~2× gap is large enough that it would survive a fairly wide error band on
that share, which is why it is worth reporting now rather than after sourcing it.)*

---

## 9. What this table does NOT cover

- **RPV/core internals** (downcomer, lower plenum, core barrel, upper plenum) — was out
  of #474's filed scope; **§8's closure failure puts it back on the critical path.** The
  fuel/clad model already exists (`stepFuel`/`stepCladding` in `pwr_thermal.js`) and is
  not the gap — the gap is the vessel's *coolant volume*, which §8 can only infer as a
  residual. Do not backfill it from the MIT OCW figures noted in §1 (secondary-source,
  unchecked); it needs its own sourced pass.
- **Pressurizer and surge line** — #472's, deliberately not duplicated here.
- **`rcs_flow_gpm` reconciliation** — §3's ~23 % velocity disagreement, flagged not fixed.
- **The crossover/cold-leg shared-temperature limitation** — §6, flagged not fixed; it's
  #474's actual node-split work, not something this document should shortcut.
- **The 0.3518 vs 0.3302 scale-factor split** — §1, flagged not resolved. Deprioritized
  by §8: a 6.5 % factor disagreement is noise beside a ~2× volume closure failure.

---

## 10. Recommended next step

**Changed by §8.** The earlier version of this section said layout/RCP/void-flag were
decided and no further research was needed before writing node code. §8's closure check
disproves that: the geometry does not reproduce the plant's own declared RCS volume, and
the largest term (RPV coolant volume) has no independent estimate.

**Next is an RPV/core geometry pass** — same evidence-pass method as §1–§4, sourcing
vessel ID, downcomer annulus, plenum and core-region coolant volumes. That converts §8's
residual into a measurement and turns a three-unknown/one-equation problem into a
checkable over-determined one. Until it exists, §8's disagreement cannot be attributed,
and node code written against these volumes would inherit an unexplained ~2× error in
loop-to-vessel inventory split — which is exactly the kind of thing that then gets
absorbed into a fitted constant and disappears.

Still deferred behind #472 per #474's own recommendation; none of this touches that lane.
