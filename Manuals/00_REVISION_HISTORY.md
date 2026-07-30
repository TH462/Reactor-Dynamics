# 00 — Revision History

**Document set:** PWR Operator’s Manuals  
**Plant:** Reactor⚛️Dynamics PWR  
**Set revision:** 13 (2026-07-30)  

> **This table is NEWEST FIRST, and the revision is SET-WIDE.** Every chapter carries the
> same `**Revision:**` as the newest row here — there is one number for the whole set, not
> one per document. Rows 0–3 used to sit ascending above a descending 4–8, which is how six
> content changes came to be missing from the table without anyone noticing where the top was.
>
> **To revise the set:** add a row at the top of this table, then run
> `node tools/stamp_manual_revision.js`, which propagates the number into every chapter and
> `README.md` and refreshes the content digests below. `node tools/pack_manuals.js` after,
> so the in-app copy carries it. `test/run_manual_rev.js` fails if any of that is skipped —
> including if a chapter's prose changes with no new row, which is the failure this table
> actually suffered (revs 9–13 were all reconstructed from `git log` after the fact).

| Rev | Date | Description | Author |
|-----|------|-------------|--------|
| 13 | 2026-07-30 | **Reactivity curve given a second anchor, and the moderator zero-crossing corrected** (#263). **09 §7.4** now states what pins the curve and separates the three claims by evidence class: *shape* is measured (BEAVRS / Watts Bar U1 Cycle 1 HZP physics tests, OSTI 1991715 Table IV — isothermal coefficients at 975/902/810 ppm putting the moderator zero crossing at **986 ppm**), *level* is measured (ARO hot-zero-power critical boron **975 ppm**, same tests), and *magnitude* at the full-power reference is **not** measured — it is the owner's 2026-07-21 −20 pcm/°C plant-identity ruling. The **09 §7.5 ECC table** was regenerated against the corrected curve. **12** gained the matching note. | Reactivity anchor session |
| 12 | 2026-07-30 | **The gpm figures the manual quoted were not the ones the board shows.** §Fidelity said **40 gpm** charging and **20 gpm** letdown; the board's charging box tops out at **60 gpm** and its orifice-A letdown reads **30 gpm** — two conversion scales kept in two files, drifted 1.5× apart, with the manual quoting the one no code reads. **12 §Fidelity** and **§CVCS scale** corrected to 60/30. §CVCS scale also now states that because the CVCS and accident scales are independent, **no single RCS volume reconciles them**, so comparing these gpm with real-plant flows or Tech Spec leakage limits is a category error rather than a fidelity gap to close. `test/run_manual_units.js` cross-checks the manual, the config block and the board wiring so they cannot separate again. | gpm display-scale pass |
| 11 | 2026-07-29 | **Reactivity recalibrated — the moderator coefficient is density-shaped, and an ECC table added** (#260). **12 §4.3** rewritten with a new **§4.3.1**: moderator reactivity tracks water **density**, so the coefficient steepens with temperature and weakens with boron; the values table and its two unfitted consequences (boron worth larger cold, critical boron nearly flat across a heatup) are stated with sources. **09 §203** carries both rod worths (control banks 4068 pcm, shutdown 3676 pcm — the old ~8500 was unsourceable). **New 09 §7.5, Estimated Critical Condition** — critical boron by Tavg and bank position, generated from the engine and verified cell-by-cell by `test/run_reactivity.js`, so it cannot go stale silently. **05 §106** re-measured like-for-like: **11.39 plant-hours** cold to **567.0 °F (297.2 °C)** on pump heat with no rod motion, arriving **−3377 pcm on 907 ppm** (was 10.71 h to 548 °F, −6287 pcm on 919 ppm) — it now reaches the full no-load anchor instead of stopping 19 °F short. | Reactivity recalibration |
| 10 | 2026-07-29 | **The plant can heat itself from cold on pump heat, and the heatup procedure was re-authored around it** (#251). The steam generator used to net reactor-coolant-pump heat out of its own steam balance, which made a heatup on pump heat *mathematically impossible* — a stable attractor at **218.69 °F (103.72 °C)** forever. **04** and **05** re-authored: the Mode 5 → Mode 3 evolution now pressurises, starts the pumps, bottles the SG and rides temperature up on pump heat, arriving hot and **still subcritical**, which is what Hot Standby means; the approach to criticality moved to the missions that already teach it. `CAMPAIGN_MODE_ALIGNMENT_SPEC.md` updated to match. | Pump-heat heatup pass |
| 9 | 2026-07-29 | **The low-flow reactor trip reads an instrument, and its setpoint went to the real value** (#247, #248). `rcs_flow` is now a real elbow-tap channel (% of rated, 1 s lag, injectable failures) rather than a true-state sentinel, so a stuck-high flow channel masks a real loss of flow exactly as it would in the plant. The setpoint moved from an unsourced **25 %** to the real **90 % of rated, blocked below P-7 (10 %)** — measured, that trips at 1.8 s where DNB onset is 10.9 s, so the old value had been letting DNB happen. **04**, **09** and **12** updated for both. | Low-flow trip pass |
| 8 | 2026-07-29 | **The dual-unit convention extended to the board.** §Units now states that the rule holds wherever the plant quotes a number to the player, not just in these documents: the **live checklist / procedure steps** (`ui/manual_procedures.js`) and the **System Scanner inspection copy** (`ui/diagram/board/pwr_board_inspect.js`) were converted to match — 28 sites, e.g. a step target now reads *1194 psi (8.23 MPa)* and the rod-AUTO deadband *±1.4 °F (±0.8 °C)*. `test/run_manual_units.js` was extended to enforce all three surfaces together, and is **scored on failures only** — its coverage count moves on ordinary prose edits, so baselining it would be noise rather than a signal. Engine command payloads and developer comments stay SI. | Board units pass |
| 7 | 2026-07-29 | **Dual units throughout — US customary first, SI in parentheses** (owner request). `2235 psi (15.41 MPa)`, `579.2 °F (304 °C)`, `28.5 inHg (96.5 kPa)`. US first because that is what the PWR board reads; SI alongside because that is what the engine computes in. Conversions and precision match the product's own `conv()` / `fmtInstrValue()`. **Temperature differences convert without the offset** — subcooling margin, leg ΔT, DNB margin, control deadbands and cooldown rates: a **73.8 °F (41 °C)** margin, not 105.8 °F. The convention and the three rules are stated in `README.md` §Units, and **every pair is verified mechanically by `test/run_manual_units.js`** (182 checks), which fails on bad arithmetic, on an SI value with no US partner, and on a difference converted with the absolute rule. | Dual-units pass |
| 6 | 2026-07-29 | **Currency audit against the as-built sim.** Every trip, actuation, alarm, failure, automation channel, instrument, engine command, initial condition and campaign mission was dumped from the live plant and diffed against the manual set. **Adopted-but-undocumented protection:** *Reactor Trip on Turbine Trip (P-9)* (#216) added to **09 §2.0**, and **06 PWR-A22** / **07 PWR-E03** rewritten — both still told the operator to ride out a turbine trip. **Permissives P-9, P-11, P-12** added to 09. **Mode 4/5 staleness cleared** in **01 §5.0**, **02 §5.1/§5.3**, **08**, **09**, **10**, **README** — all still said the cold path was `[narr]` and that there is no cold initial condition. **Controls documented that exist on the board but not in the manual:** circulating-water inlet temperature (**new 03 §13.1**) and the generator **FOLLOW/MAN/OFF** selector with the planned-offline-is-not-a-trip rule (#230, **03 §12.1**). **03 §18.0** command reference corrected (`set_letdown_flow` → `set_letdown_orifices`; added grid, CW-temp, AFW-block and accumulator-valve commands). **02 §3.4** documents the two-tier System Scanner (#96); **02 §9.0** stopped describing the retired generated manual; `900 MWe` leftover fixed. **03 §16.0** gained `sg_steam_flow` and `cw_inlet_temp` plus the turbine-flow-vs-total-flow trap. | Manual currency audit |
| 5 | 2026-07-29 | **New chapter `12_SIM_PHYSICS.md` — Simulation Physics & Model Scope** (#203). States what the engine actually computes (step order, point kinetics, the reactivity balance, the thermal nodes and how heat transfer degrades, the inventory and pressure models, the instrument layer), then the **deliberate simplifications** (§12) and the **outright omissions** (§13) as separate claims. Also §11, the engine ↔ control-layer boundary, and §14, how much to trust which class of number. Written from the as-built engine and config, not from prose. **01 §8.0 corrected**: the cold-ops row claimed Mode 5/4 was narrative-only and that Free Play starts in Mode 3 — both stale since the Mode 5↔1 transition shipped on integrated physics. | Sim-physics chapter session |
| 4 | 2026-07-28 | **Mode- and lineup-dependent alarm classification** (#240): five annunciators drop to **Status** and reword when the condition is the planned lineup rather than a casualty — new **06 §2.0** table with the Mode 3 exclusion and the inventory-alarm caveat, cross-referenced from **09 §4.0**. Two annunciators that were modeled but never documented added: **PWR-A29 LO TAVG (P-12)** (06, and 09 Panel A) and **RCP CAVITATION** (09 Panel B). | Alarm-classification session |
| 3 | 2026-07-21 | **This set is now THE PWR manual** — the generated in-app reference (`ui/manual_data.js` PWR profile) was retired, and these documents render in-app via `tools/pack_manuals.js`. Content merged from the retired web manual: per-IC normal values (09 §11.0), indication ranges + linked alarms (03 §16.0), engine command reference (03 §18.0), RHR cooldown-rate control (03 §11.2, 05), failure severity sliders + **PWR-E22** failed-low level sensor (07). SLX-100 program corrections: Mode 3 Tavg 304→297 °C (no-load anchor), imbalance cue 40→4 MWe, rated 1000→100 MWe leftovers. | Manual+site session |
| 2 | 2026-07-16 | Naming locked to **Mode N, Name** (e.g. **Mode 1, At Power**). Campaign handoff: `CAMPAIGN_MODE_ALIGNMENT_SPEC.md`. Crosswalk: `11_CAMPAIGN_CROSSWALK.md`. Manuals only. | Manual build session |
| 1 | 2026-07-16 | Plant MODES introduced; master paths **PWR-T20** / **PWR-T21**. | Manual build session |
| 0 | 2026-07-16 | Initial commercial-style manual set created from Blueprint specs, as-built PWR engine/control layer, and in-product procedure data. Covers simulator use, all controls, normal ops, mode transitions, alarms, failures, and TMI. Issues captured in `ISSUES_AND_FINDINGS.md`. | Manual build session |

## Source documents (authoritative for content)

| Source | Role |
|--------|------|
| `Blueprint/CONTEXT.md` | Architecture, hard rules, data contract |
| `Blueprint/M1 pwr engine.md` | PWR physics and instruments |
| `Blueprint/M4b_control_layer.md` / `layers/control/pwr_control.js` | Trips, alarms, failures, automation |
| `Blueprint/M8 UI HMI Spec Consolidated.md` | HMI layout and interaction |
| `Blueprint/new_diagram_controls.md` | PWR synoptic cards and controls |
| `Blueprint/load_mode_spec.md` | Turbine load modes |
| `Blueprint/OPERATOR_MANUAL_PLAN.md` | Procedure ID scheme and voice rules |
| `Blueprint/pwr_training_campaign.md` | Training campaign structure |
| `ui/manual_procedures.js` | Validated step procedures (also the in-app follow / checklist source) |
| `engines/pwr/pwr_config.js` | Operating points and limits |

## Review status

| Item | Status |
|------|--------|
| Technical accuracy vs engine setpoints | Draft — cross-checked against config/control data |
| Procedure validation in `test/run_procedures.js` | Partial — in-product procedures validated; expanded manual steps not harness-run |
| Operations SME review | Not performed |
| Licensing / real-plant use | **Not applicable** — training software only |

<!-- CONTENT-DIGESTS — maintained by tools/stamp_manual_revision.js; do not hand-edit.
     Sealed at Rev 13 (2026-07-30). A mismatch means a chapter changed with no
     revision row added — add one and re-run the tool. See test/run_manual_rev.js.
     01_GENERAL_DESCRIPTION.md c2015d3574814966
     02_SIMULATOR_USER_GUIDE.md e4faa6ae38d6a47d
     03_CONTROLS_AND_INDICATIONS.md f1b3b88c0a391fab
     04_NORMAL_OPERATIONS.md 952100f181ace21c
     05_MODE_TRANSITIONS.md 169df0c3ca146abf
     06_ALARM_RESPONSE.md c6eecd46d77bda2d
     07_ABNORMAL_EMERGENCY.md 762d720f0eaf617b
     08_ACCIDENT_TMI.md d6a3ff47c6786021
     09_SETPOINTS_LIMITS.md 0156964f7368e13f
     10_GLOSSARY.md 2e16faf4275c172b
     11_CAMPAIGN_CROSSWALK.md d9691773480afc25
     12_SIM_PHYSICS.md 9b2a8cacd6fc898b
     README.md c5df6473d93e6a6e
-->
