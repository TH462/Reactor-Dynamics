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
| I-01 | — | ~~**No cold plant state.**~~ **RESOLVED (2026-07).** A `cold_shutdown` (Mode 5) initial condition ships (`pwr_config.js`), and the full Mode 5↔1 heatup/cooldown runs on integrated physics with time-compressed rates. | **Mode 5, Cold Shutdown** / **Mode 4, Hot Shutdown** are now **[sim]** (rates compressed), driven by missions `pwr_mode5_to_mode3`/`pwr_return_to_mode1`/`pwr_mode3_to_mode5`. 04-N03/N15 and 05 updated. | **Resolved in product** (pre-ship review) |
| I-36 | L | Commercial **Mode 4, Hot Shutdown** vs “hot shutdown after trip” naming: trainer post-trip board is still hot NOP class (**Mode 3, Hot Standby** by Tech Spec temperature), not intermediate-temperature Mode 4, Hot Shutdown. | Manuals treat post-trip hot as Mode 3, Hot Standby; Mode 4, Hot Shutdown reserved for cooldown narrative. | Noted in manuals |
| I-02 | M | **Single lumped RCS loop** (one RCP/SG representation). No multi-loop isolation procedures. | RCP/SGTR procedures simplified vs commercial multi-loop EOPs. | Noted in manuals |
| I-03 | M | **Single control bank + shutdown bank** (no overlap unit / multi-bank sequence). | Rod procedures use one operable bank. | Noted in manuals |
| I-04 | M | **Point kinetics** — spatial xenon, flux tilts, and local DNB not resolved. | Xenon/power procedures are plant-average. | Noted in manuals |
| I-05 | M | **Containment, hydrogen, offsite dose** not modeled. | TMI/LOCA stop at core damage / recovery of inventory. | Noted in manuals |
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
| I-12 | L | **Some `manual_data.js` indication names** still raw ids (`charging_flow`, `boron_analyzer`) without polished display names. | Operator manual 03 uses human labels; generated in-product manual may look rougher. | Open |
| I-13 | M | ~~Alarm response “means” fields null for several alarms.~~ **RESOLVED for PWR (pre-ship review)** — `means` authored for all 18 previously-null PWR alarms in `tools/gen_manual_reference.js` and regenerated; PWR now has **0 null means**. (RBMK/BWR still have some nulls — out of PWR ship scope.) | In-product PWR manual now complete for alarm means. | **Resolved (PWR)** |
| I-14 | M | **In-product procedures** cover a **subset** of OPERATOR_MANUAL_PLAN list (startup, raise/lower, pressure, SG, shutdown, LOFW, RCP, stuck PORV, TMI narrative). | External manuals expand N## / E## set; not all are harness-validated in `run_procedures.js`. | Open |
| I-15 | L | **DHR vs RHR naming** mixed across UI (set_dhr / set_rhr / RHR tab). | Manuals treat DHR/RHR as the residual heat removal path. | Open |
| I-16 | L | **OPERATOR_MANUAL_PLAN** counts ~22 PWR alarms; as-built has **26** alarm ids in control data. | Manuals use full as-built list (A01–A26). | Noted |

---

## 4. Control layer / hard-rule issues (from product audits; still relevant to operators)

Sources include internal product audits (2026-07-16) and campaign playtest notes. Some items marked resolved same-day in that audit — retained if still operator-relevant or if residual risk remains.

| ID | Sev | Finding | Operator impact | Status |
|----|-----|---------|-----------------|--------|
| I-17 | M | **Instruments can lie; automation reads instruments.** Failed Tavg or PZR level fools AUTO rods / CVCS. | E20/E21 and Automate cautions emphasize MAN on bad sensors. | Noted in manuals |
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
| I-24 | H | **Aggressive Manual load cuts** (e.g. 1000→500 MWe) can trip; some missions lacked trip-catch branches (playtest `pwr_tour`). | T07 cautions moderate steps. | Open (scenario) / noted |
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
| I-33 | M | **MSIV at power** and **steam line break** interact with single-SG model — isolation “faulted SG” logic is thinner than multi-SG commercial EOPs. | E19 simplified |
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
- internal product-audit and playtest notes (2026-07-16, partial)

---

## 10. Change control

| Date | Change |
|------|--------|
| 2026-07-16 | Initial issues log created with Manuals Rev 0 authoring pass. |
