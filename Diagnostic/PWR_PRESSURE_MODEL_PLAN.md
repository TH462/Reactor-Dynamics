# PWR Small-Break Over-Depressurization — Investigation & Plan

**Date:** 2026-07-17 · **Branch:** develop · **Status:** IMPLEMENTED (blowdown_gain=0.02, blowdown_sink_c=110 °C, accumulator_trip_mpa=4.14; Mode 5 accumulator isolation added). Gates green: run_pwr 26/26, campaign 47/47, ops 53/66 (identical fail set), m4 15/15, m5 19/19, autoctl 20/20.

Investigates why the PWR small-break model is believed to over-depressurize, and whether
`emergency.accumulator_trip_mpa` can be restored from the detuned **1.5 MPa** to the real
B&W core-flood-tank / Westinghouse SIT setpoint of **~4.14 MPa (600 psi)**.

---

## 1. How RCS pressure is computed on a break (trace)

`pwr_pressurizer.stepPressure` (engine step 7):

```
dP = heater·K_heater − spray·K_spray − porv_flow·K_porv_relief − safety_flow·K_safety_relief
     − K_leak_depressurize·leak_flow            (break blowdown; UNCONDITIONAL)
     + K_surge·dTavg/dt
if primary_void_fraction > 0:  dP += K_sat_pull·(Psat(tavg) − P)     (two-phase sat pull)
else:                          dP += P_restore_rate_gain·(setpoint − P)
```

`primary_void_fraction` (`pwr_primary.stepInventory`) is non-zero only when
`Tsat(P) − tavg ≤ 0` **and** `_mass < 1.0` — i.e. only once the bulk reaches saturation.

`tavg` (`pwr_thermal.stepCoolant`) has **no term that removes the break's enthalpy**. Its
only sinks are the SG (`Q_coolant_to_sg`), RHR, and the ECCS cold-injection quench (active
only when HPI/LPI/accumulators inject). So on a bare break with decay heat, **tavg pins near
the no-load temperature (~300 °C) regardless of break size.**

### Reproduced behaviour (bare break, scram, no makeup)

| leak_flow (break) | steady P | (psi) | tavg | Tsat(P) | subcool | note |
|---|---|---|---|---|---|---|
| 0.03 (3 %, SGTR)   | 15.30 MPa | 2219 | 303 | 344 | +42 | heaters (0.55) beat 0.3 MPa/s leak — never voids |
| 0.08 (8 %, max SGTR)| 8.77 MPa | 1272 | 303 | 302 | −1 | at saturation plateau |
| 0.20 (20 %, large LOCA)| 7.97 MPa | 1157 | 303 | 295 | −8 | still >600 psi |
| 0.50 (50 %)        | 5.81 MPa | 842 | 302 | 273 | −28 | still >600 psi |
| 0.80 (80 %)        | 3.74 MPa | 542 | 301 | 246 | −55 | first to cross 600 psi |
| 1.00 (100 %)       | 2.38 MPa | 346 | 301 | 221 | −80 | **80 °C of impossible superheat** |

Flagship TMI damage branch (stuck-open PORV, HPI off) floors at **8.77 MPa (1271 psi)** for
the whole sequence to fuel damage at t≈973 s — it **never** drops below 4.14 MPa or 1.5 MPa.

### Root cause

Two coupled defects:

1. **`tavg` cannot respond to break size** — there is no blowdown/flash cooling term. The
   "saturation plateau" `Psat(tavg) ≈ 8.9 MPa` is therefore the *same* for every break, so
   temperature cannot serve as the small-vs-large discriminator.

2. **`K_leak_depressurize` is a direct pressure sink that runs unconditionally**, including in
   the two-phase regime. Two-phase equilibrium is
   `P ≈ Psat(tavg) − (K_leak/K_sat)·leak_flow + heater/K_sat ≈ 8.9 − 6.67·leak_flow + 0.37`.
   Break size is distinguished *only* by this linear offset below the (fixed) plateau, which
   forces `P` far below `Psat(tavg)` while `tavg` stays hot — **thermodynamically impossible
   superheat** (a 100 % break shows 301 °C liquid at 2.38 MPa; Tsat there is 221 °C).

**The config comment / BUILD_DECISIONS premise ("TMI floors ~1.8–2.3 MPa, so 4.14 MPa
accumulators would fire and mask the lesson") is stale.** It predates the sat-pull / loop-
pressure rework. The current model already holds TMI on the hot plateau at ~8.8 MPa; nothing
short of a ~71 % break even reaches 4.14 MPa, and **nothing reaches the 1.5 MPa setpoint** —
the accumulators are effectively dead code (as the ECCS unit tests concede: "accumulators only
arm at low pressure, awkward to reach through the full pressure model"). This is the same
"documented blowdown-model gap (tuning target)" already flagged red in the ops/e2e suites.

---

## 2. Can pressure pin at the hot plateau for small breaks yet flash large breaks below 600 psi?

Yes — but the discriminator must become **coolant temperature**, not the pressure fudge. That
requires making the plateau itself move with break size. Two changes, applied together:

### Change A — blowdown flash-cooling in `pwr_thermal.stepCoolant`

Add a self-limiting cooling term mirroring the existing ECCS-quench form:

```
dTavg += −blowdown_gain · leak_flow · (tavg − T_blowdown_sink)
```

- **Small break:** `blowdown_gain·leak_flow` is tiny → decay heat wins → `tavg` holds ~300 °C
  → `Psat(tavg)` stays ≈ 6–9 MPa (**>600 psi**). Plateau preserved.
- **Large break:** the term dominates decay heat → `tavg` falls toward containment saturation
  → `Psat(tavg)` falls **below 4.14 MPa**. This is the real "flash inventory, cool toward
  containment" physics.
- Keyed on `leak_flow` only (the `sgtr`/`large_loca` failures), **not** PORV/safety flow — so
  the flagship stuck-PORV (handled via the pressurizer relief path, `leak_flow≈0`) is untouched.
- `T_blowdown_sink` ≈ containment saturation (~100–120 °C); self-limiting like the ECCS quench.

### Change B — gate `K_leak_depressurize` to the subcooled regime

Once `primary_void_fraction > 0`, drop (or strongly attenuate) the `K_leak_depressurize` term
so pressure is slaved to `Psat(tavg)` by the sat-pull, instead of being dragged into superheat:

```
− K_leak_depressurize · leak_flow · (primary_void_fraction > 0 ? 0 : 1)
```

Rationale: subcooled blowdown (liquid out, bubble collapse) *does* depressurize directly — keep
`K_leak` there to drive the fast initial descent to saturation. Once two-phase, the break vents
steam that decay heat re-boils, so further depressurization is governed by how fast the coolant
*cools* (Change A), keeping P and T thermodynamically consistent (subcooling ≈ 0, no superheat).

**Net result:** `P` pins at the hot saturation plateau (>600 psi) for small breaks and follows
`tavg` down through 600 psi for large breaks. "Below 600 psi" becomes the *natural* large-break
discriminator, and the cold-injection quench + accumulators fire at the physically right moment.

---

## 3. Recommended setpoint

Restore **`accumulator_trip_mpa: 4.14`** (600 psi) — the real B&W CFT / Westinghouse SIT cover
pressure — contingent on Change A+B landing so the value is physically meaningful.

**Tuning targets (implementation):**
- SGTR (≤8 %): plateau ≥ ~6 MPa (≫4.14) → no accumulator firing; TMI/SGTR inventory lesson intact.
- `large_loca` default (20 %): `P` crosses 4.14 MPa in reasonable time → accumulators arm + quench fires.
- ≥50 %: `P` → ~1–2 MPa (containment approach), full accumulator dump + reflood.
- No two-phase state should show subcooling more negative than a few °C (superheat check).

---

## 4. Blast radius

| Gate | Baseline | Expected | Risk |
|---|---|---|---|
| `run_pwr.js` | 26/26 | 26/26 | **LOW** — flagship uses a tiny PORV leak (blowdown negligible, plateau ~8.8 MPa unchanged, 4.14 accumulators still don't fire). `eccs_boration` / `eccs_cold_injection` use crafted low-P states and a no-op `primary_leak` failure (leak_flow=0) → unaffected. |
| `run_campaign.js` | 47/47 | 47/47 | **LOW–MED** — pwr_tmi2_p1/p2/p3 are small-break/stuck-PORV; plateau + subcooling-erosion behaviour preserved. Many pressure/subcooling assertions → must re-run. |
| `run_ops.js` | 53/66 | ≥53/66 | **MED (mostly upside)** — large-break/LOCA scenarios change most; the known-red "blowdown-model gap" accumulator check is a candidate to **recover**. SGTR (already red) stays on the plateau → not worsened. Acceptance: no *net* regression, diff the fail set. |

Also spot-check `run_m4` / `run_m5` / `run_autoctl` (pressure-adjacent) per the standing gate list.

**Key risks & mitigations**
- *Spurious accumulator dumps on moderate breaks* → tune `blowdown_gain` conservatively so only
  >~15 % breaks cross 4.14 MPa; verify SGTR holds the plateau.
- *sat-pull / K_leak interaction* → assert subcooling ≈ 0 (not strongly negative) in two-phase.
- *Flagship drift* → blowdown keyed on `leak_flow` only leaves the stuck-PORV path identical.

---

## 5. Verification strategy

1. Reproduction harness (scratchpad `repro_leak.js` / `repro_tmi.js`): SGTR plateau >600 psi;
   20 % LOCA crosses 4.14 MPa and fires accumulators; `tavg` drops on large breaks; no superheat.
2. `node test/run_pwr.js` → 26/26 (flagship unchanged).
3. `node test/run_campaign.js` → 47/47.
4. `node test/run_ops.js` → ≥53/66, diff fail set; confirm the blowdown-gap/accumulator check recovers.
5. Sanity: `run_m4`, `run_m5`, `run_autoctl`.
6. Update the `accumulator_trip_mpa` config note, `K_leak_depressurize` note, BUILD_DECISIONS
   (M1 §pressure), and CHANGELOG to describe the new physical model and restored 4.14 setpoint.
   Commit to **develop**.

### New / changed config

| param | from | to | file |
|---|---|---|---|
| `emergency.accumulator_trip_mpa` | 1.5 | **4.14** | pwr_config.js |
| `thermal.blowdown_gain` (new) | — | tune (~0.02–0.1) | pwr_config.js |
| `thermal.blowdown_sink_c` (new) | — | ~110 | pwr_config.js |
| `pressurizer.K_leak_depressurize` | 10.0 | keep, gate to subcooled | pwr_pressurizer.js |

---

## Minimal alternative (not recommended)

Restore 4.14 MPa *without* Change A+B: low-risk but low-value — large breaks (20–50 %) still
floor at 5.8–8 MPa and never reach 4.14, so accumulators fire only for >71 % breaks and the cold
quench rarely triggers. Leaves the impossible superheat and the near-dead accumulators. Does not
answer "restore to a realistic value that *means* something."
