# Issues and Findings Log

**Document:** PWR-MAN-ISSUES  
**Created:** 2026-07-16  
**Context:** Gaps, inconsistencies, and risks noticed while authoring the `Manuals/` operator set from Blueprint specs, as-built code, and in-product reference data.  

**Scope of this file:** Documentation only. No code or Blueprint files were modified to “fix” these items.

---

## 1. How to use this log

| Severity | Meaning |
|----------|---------|
| **H** | Can mis-train operators or block procedure success |
| **M** | Doc/code mismatch or incomplete procedure coverage |
| **L** | Polish, naming, or future enhancement |

| Status | Meaning |
|--------|---------|
| **Open** | Still true in sources reviewed at authoring time |
| **Noted in manuals** | Manuals call out the limitation |
| **Resolved in product** | Listed for history if audit said fixed; re-verify if needed |

---

## 2. Simulator physics / scope limitations

| ID | Sev | Finding | Impact on manuals | Status |
|----|-----|---------|-------------------|--------|
| I-01 | — | **No cold plant state.** **RESOLVED TWICE**: 2026-07 for the retired engine, reopened by the engine swap (2026-08-30), and **RESOLVED AGAIN 2026-08-31 (#524)** — the water-property floor moved from 0.1 to 0.002 MPa and PWR2 carries a `cold_shutdown` (Mode 5) initial condition at 122 °F (50 °C) / 363 psi (2.50 MPa). The full Mode 5↔1 heatup/cooldown runs on integrated physics. | **Mode 5, Cold Shutdown** is **[sim]** again; the guided missions (`pwr_mode5_to_mode3` etc.) remain gated on the #525 compatibility pass. | **Resolved in product** (#524) |
| I-36 | L | Commercial **Mode 4, Hot Shutdown** vs “hot shutdown after trip” naming: trainer post-trip board is still hot NOP class (**Mode 3, Hot Standby** by Tech Spec temperature), not intermediate-temperature Mode 4, Hot Shutdown. | Manuals treat post-trip hot as Mode 3, Hot Standby; Mode 4, Hot Shutdown reserved for cooldown narrative. | Noted in manuals |
| I-02 | M | **Single lumped RCS loop** (one RCP/SG representation). No multi-loop isolation procedures. | RCP/SGTR procedures simplified vs commercial multi-loop EOPs. | Noted in manuals |
| I-03 | M | **Single control bank + shutdown bank** (no overlap unit / multi-bank sequence). | Rod procedures use one operable bank. | Noted in manuals |
| I-04 | M | **Point kinetics** — spatial xenon, flux tilts, and local DNB not resolved. | Xenon/power procedures are plant-average. | Noted in manuals |
| I-05 | M | **Offsite dose / source term / release** not modeled (containment and hydrogen ARE, since #386 — `12` §12.4d/§12.4e; the narrowing of this row is the record that the first two-thirds of it landed). | TMI/LOCA stop at fuel damage; the building's response and the H₂ burn are simulated, releases are not. | Noted in manuals |
| I-06 | M | **RCP start/stop** is approximate (maps near trip inject/clear in places). | PWR-N13 labeled **[approx]**. | Noted in manuals |
| I-07 | H | **Station blackout** may be effectively unsurvivable under current physics for qualification-style exams (campaign design abandoned SBO exam for this reason). | E05 documents severe challenge / honest failure. | Noted in manuals |
| I-08 | L | **Decay heat** two-term model; ~7 % after power history — not full ANS groups. | Numbers in setpoints are model values. | Open |
| I-09 | L | **Boron adjust rate** compressed (ppm/s class) vs real hours-long chemistry. | N09 notes training compression. | Noted in manuals |
| I-10 | M | **Approach to criticality** with one coarse bank: SUR may hit ~2 DPM at crossing vs 1 DPM target; power overshoot vs real fine approach. | N02 cautions written explicitly. | Noted in manuals |

---

## 3. Documentation vs as-built code mismatches

| ID | Sev | Finding | Detail | Status |
|----|-----|---------|--------|--------|
| I-11 | M | **M8 / early control-section specs** still describe four horizontal control sections for PWR. | As-built PWR uses **synoptic margin cards only** (`new_diagram_controls.md`, M8 as-built note). Manuals follow as-built synoptic. | Open (Blueprint residual) |
| I-12 | L | ~~**Some `manual_data.js` indication names** still raw ids without polished display names.~~ **RESOLVED 2026-07-27 (#145)** — root cause was the `IND` fallback in `tools/gen_manual_reference.js` (`{ n: id, m: id }`), so **15** instruments printed their raw id as name *and* description, not the two originally noted. All 15 authored and regenerated; raw-id count is now **0**. | In-product indication list now reads in human labels on every plant. | **Resolved** |
| I-13 | M | ~~Alarm response “means” fields null for several alarms.~~ **RESOLVED for PWR (pre-ship review)** — `means` authored for all 18 previously-null PWR alarms in `tools/gen_manual_reference.js` and regenerated; PWR now has **0 null means**. (RBMK/BWR still have some nulls — out of PWR ship scope.) | In-product PWR manual now complete for alarm means. | **Resolved (PWR)** |
| I-14 | M | **In-product procedures** cover a **subset** of OPERATOR_MANUAL_PLAN list (startup, raise/lower, pressure, SG, shutdown, LOFW, RCP, stuck PORV, TMI narrative). | External manuals expand N## / E## set; not all are harness-validated in `run_procedures.js`. | Open |
| I-15 | L | ~~**DHR vs RHR naming** mixed across UI.~~ **RESOLVED 2026-07-27 (#145, owner ruling: read RHR only)** — control label is now `Residual Heat Removal (RHR)` across synoptic, board wiring, scenario highlight and both test maps; manuals and glossary say RHR, not “RHR / DHR”. The `set_dhr` **command** alias remains (save-file contract, pinned by `run_e2e_controls`) and is documented as a deprecated alias. | UI, manuals and glossary all say RHR; only the legacy command id carries the old name. | **Resolved** |
| I-16 | L | **OPERATOR_MANUAL_PLAN** counts ~22 PWR alarms; as-built has **26** alarm ids in control data. | Manuals use full as-built list (A01–A26). | Noted |

---

## 4. Control layer / hard-rule issues (from product audits; still relevant to operators)

Sources include `Diagnostic/SPEC_AUDIT_2026-07-16.md` and campaign playtest notes. Some items marked resolved same-day in that audit — retained if still operator-relevant or if residual risk remains.

| ID | Sev | Finding | Operator impact | Status |
|----|-----|---------|-----------------|--------|
| I-17 | M | **Automation acts on what it reads, not on the plant.** A failed Tavg or PZR level channel drives AUTO rods / CVCS the wrong way with full confidence — the controller's coupling to its input is the point, not the deception. | E20/E21 and Automate cautions emphasize MAN on bad sensors. | Noted in manuals |
| I-18 | M | **AFW level-hold** historically read true SG level inside engine (HR1 tension). Audit claimed fix to instrument path — if regressed, AFW would not be fooled by stuck level the way a real controller would. | E12 still says verify **level response**, not run lights. | Re-verify if training on sensor failure + AFW |
| I-19 | L | **SG imbalance annunciator** may use true power in load_mode (coaching indicator). | Filling/draining cue is advisory. | Open (minor) |
| I-20 | M | **ESF one-shot latch:** AFW/HPI manual action disarms AUTO until re-arm; re-arm may fire immediately if condition stands. | PWR-T12 documents this. | Noted in manuals |
| I-21 | M | **degraded_hpi / afw_failure** are physics capacity/block effects; UI may still look “running.” | E11/E12: trust process response. | Noted in manuals |
| I-22 | L | **PORV indicator** is command-based by design — not a bug; it is the TMI lesson. | Heavily documented in 03/07/08. | By design |

---

## 5. UI / training / playtest findings

| ID | Sev | Finding | Detail | Status |
|----|-----|---------|--------|--------|
| I-23 | H | **SCRAM is two-press** (arm + confirm). Novices think first press failed. | Sim guide and rod SCRAM procedure state two-press. | Noted in manuals |
| I-24 | H | **Aggressive Manual load cuts** (e.g. 1000→500 MWe) can trip; some missions lacked trip-catch branches (playtest `pwr_tour`). | T07 cautions moderate steps. | **DISPROVEN 2026-07-31 (#138)** — the trip half no longer reproduces at any step size, and the example numbers describe the pre-2026-07-21 1000 MWe plant. Measured full-stack from `hot_full_power`, cuts of 10/35/39/50/80/100 MWe: **no scram, no PORV lift** in any case. Cuts above `dump_load_reject_mwe` (40 MWe) arm the fast-open dump and ride out at ~98 % power (#219); cuts below it are absorbed by the Tavg program, worst case 600.9 °F (316.1 °C) — annunciates HI TAVG, **34.1 °F (18.9 °C)** below the 635.0 °F (335.0 °C) Tavg scram. The trip-catch half **was** fixed: `pwr_tour` carries the `load_lost` beat. That beat is now unreachable and its prose still teaches a trip (HR9), but it is **not** being repaired in place — *(OWNER DIRECTIVE, 2026-07-31: "Don't edit the scenario they are being completely redone.")*. Closed |
| I-25 | M | **Rewind** may land at failure moment rather than clean earlier checkpoint (playtest report). | Manuals say use Rewind but do not promise multi-step history. | Open (product) |
| I-26 | M | **Instructor beat pacing** can outrun reading speed; SUR/startup cues may be Learning-only on some cards. | Sim guide recommends Learning for first startups. | Open |
| I-27 | M | **Highlight control labels** in some scenarios may not match synoptic `SYN_CONTROL_MAP` (playtest: Mode, Rod motion). | Operator should not rely solely on glow. | Open (scenario) |
| I-28 | L | **Keyboard:** Space play/pause, A ack, M manual, ? help — if focus is on a hold control, Space behavior differs. | Documented in 02. | Noted |
| I-29 | M | **No full RPS reset / easy post-trip restart** to power in some paths — xenon mission honesty. | N09 / shutdown procedures avoid promising quick restart. | Noted in manuals |

---

## 6. Procedure / manual authoring gaps (this deliverable)

| ID | Sev | Finding | Status |
|----|-----|---------|--------|
| I-30 | M | Expanded **PWR-N/E** procedures are **not** all machine-validated in `test/run_procedures.js` (unlike the shorter in-product set). | Open — future: port acceptance predicates |
| I-31 | L | Commercial EOP step detail (foldout trees, CSF status trees, red path priorities) is **simplified** to trainer-appropriate linear procedures. | By design |
| I-32 | L | **RBMK/BWR** not covered in this Manuals set (user asked PWR). | Out of scope |
| I-33 | M | **MSIV at power** and **steam line break** interact with single-SG model — isolation “faulted SG” logic is thinner than multi-SG commercial EOPs. | **RESOLVED 2026-07-25 (#199)** — the model no longer papers over it. Break **location** decides isolability: a downstream break is terminated by shutting the MSIV, an upstream one has no isolation at all, and E19 now states plainly that "isolate the faulted SG and steam the intact ones" has no counterpart on a single-generator plant. Pinned by `TR-12b` |
| I-34 | M | **Feed-and-bleed** as last-resort heat removal is mentioned conceptually under dual heat-sink failure; not a fully validated procedure. | Open |
| I-35 | L | Unit conversion (MPa↔psia, °C↔°F) not tabulated in manuals; UI has display toggle. | Open enhancement |

---

## 7. Positive consistencies verified while writing

| Check | Result |
|-------|--------|
| HFP pressure **15.41 MPa**, Tavg ~**304 °C**, ~**100 MWe** | Consistent across M1, config, manual_data |
| PORV **16.20 / 15.86 MPa**, safeties **17.13 / 16.55 MPa** | Consistent control data / safety_limits |
| SG level normal **65 %**, PZR **55 %** | Consistent |
| AFW actuation **20 %**, SG trip **12 %** | Consistent |
| HPI actuation **12.4 MPa** (raised 2026-07, feel-plan P5) | Consistent |
| Failure list in `pwr_control.js` PWR_FAILURES | All mapped to PWR-E01–E21 |
| Load modes Follow / Manual / Disconnected + scram disconnect | Matches `load_mode_spec.md` |
| Subcooling as TMI truth-teller | Consistent M1 / synoptic / procedures |

---

## 8. Recommended follow-ups (not done here)

1. Fill null `means` strings in generated alarm_response (or generator template).  
2. Expand `ui/manual_procedures.js` to match full N/E list with harness validation.  
3. Add trip-catch failure cards to missions that softlock on greedy load cuts.  
4. Confirm AFW hold and imbalance annunciator instrument sourcing after any regression.  
5. Author multi-SG / cold-ops physics only if product scope expands — then promote N03/N15 to [sim].  
6. Optional: generate PDF from this Manuals set for offline training.

---

## 9. Files reviewed for this log

- `Blueprint/OPERATOR_MANUAL_PLAN.md`, `CONTEXT.md`, `M1 pwr engine.md`, `M8 UI HMI Spec Consolidated.md`, `new_diagram_controls.md`, `load_mode_spec.md`, `pwr_training_campaign.md`  
- `engines/pwr/pwr_config.js`, `layers/control/pwr_control.js`  
- `ui/manual_data.js`, `ui/manual_procedures.js`, `ui/app.js` (shortcuts / Plant & Mission)  
- `Diagnostic/SPEC_AUDIT_2026-07-16.md`, `Diagnostic/PLAYTEST_REPORT.md` (partial)

---

## 10. Change control

| Date | Change |
|------|--------|
| 2026-07-16 | Initial issues log created with Manuals Rev 0 authoring pass. |
