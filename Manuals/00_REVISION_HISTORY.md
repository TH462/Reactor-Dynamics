# 00 — Revision History

**Document set:** PWR Operator’s Manuals  
**Plant:** Reactor⚛️Dynamics PWR  

| Rev | Date | Description | Author |
|-----|------|-------------|--------|
| 0 | 2026-07-16 | Initial commercial-style manual set created from Blueprint specs, as-built PWR engine/control layer, and in-product procedure data. Covers simulator use, all controls, normal ops, mode transitions, alarms, failures, and TMI. Issues captured in `ISSUES_AND_FINDINGS.md`. | Manual build session |
| 1 | 2026-07-16 | Plant MODES introduced; master paths **PWR-T20** / **PWR-T21**. | Manual build session |
| 2 | 2026-07-16 | Naming locked to **Mode N, Name** (e.g. **Mode 1, At Power**). Campaign handoff: `CAMPAIGN_MODE_ALIGNMENT_SPEC.md`. Crosswalk: `11_CAMPAIGN_CROSSWALK.md`. Manuals only. | Manual build session |
| 3 | 2026-07-21 | **This set is now THE PWR manual** — the generated in-app reference (`ui/manual_data.js` PWR profile) was retired, and these documents render in-app via `tools/pack_manuals.js`. Content merged from the retired web manual: per-IC normal values (09 §11.0), indication ranges + linked alarms (03 §16.0), engine command reference (03 §18.0), RHR cooldown-rate control (03 §11.2, 05), failure severity sliders + **PWR-E22** failed-low level sensor (07). SLX-100 program corrections: Mode 3 Tavg 304→297 °C (no-load anchor), imbalance cue 40→4 MWe, rated 1000→100 MWe leftovers. | Manual+site session |
| 7 | 2026-07-29 | **Dual units throughout — US customary first, SI in parentheses** (owner request). `2235 psi (15.41 MPa)`, `579.2 °F (304 °C)`, `28.5 inHg (96.5 kPa)`. US first because that is what the PWR board reads; SI alongside because that is what the engine computes in. Conversions and precision match the product's own `conv()` / `fmtInstrValue()`. **Temperature differences convert without the offset** — subcooling margin, leg ΔT, DNB margin, control deadbands and cooldown rates: a **73.8 °F (41 °C)** margin, not 105.8 °F. The convention and the three rules are stated in `README.md` §Units, and **every pair is verified mechanically by `test/run_manual_units.js`** (182 checks), which fails on bad arithmetic, on an SI value with no US partner, and on a difference converted with the absolute rule. | Dual-units pass |
| 6 | 2026-07-29 | **Currency audit against the as-built sim.** Every trip, actuation, alarm, failure, automation channel, instrument, engine command, initial condition and campaign mission was dumped from the live plant and diffed against the manual set. **Adopted-but-undocumented protection:** *Reactor Trip on Turbine Trip (P-9)* (#216) added to **09 §2.0**, and **06 PWR-A22** / **07 PWR-E03** rewritten — both still told the operator to ride out a turbine trip. **Permissives P-9, P-11, P-12** added to 09. **Mode 4/5 staleness cleared** in **01 §5.0**, **02 §5.1/§5.3**, **08**, **09**, **10**, **README** — all still said the cold path was `[narr]` and that there is no cold initial condition. **Controls documented that exist on the board but not in the manual:** circulating-water inlet temperature (**new 03 §13.1**) and the generator **FOLLOW/MAN/OFF** selector with the planned-offline-is-not-a-trip rule (#230, **03 §12.1**). **03 §18.0** command reference corrected (`set_letdown_flow` → `set_letdown_orifices`; added grid, CW-temp, AFW-block and accumulator-valve commands). **02 §3.4** documents the two-tier System Scanner (#96); **02 §9.0** stopped describing the retired generated manual; `900 MWe` leftover fixed. **03 §16.0** gained `sg_steam_flow` and `cw_inlet_temp` plus the turbine-flow-vs-total-flow trap. | Manual currency audit |
| 5 | 2026-07-29 | **New chapter `12_SIM_PHYSICS.md` — Simulation Physics & Model Scope** (#203). States what the engine actually computes (step order, point kinetics, the reactivity balance, the thermal nodes and how heat transfer degrades, the inventory and pressure models, the instrument layer), then the **deliberate simplifications** (§12) and the **outright omissions** (§13) as separate claims. Also §11, the engine ↔ control-layer boundary, and §14, how much to trust which class of number. Written from the as-built engine and config, not from prose. **01 §8.0 corrected**: the cold-ops row claimed Mode 5/4 was narrative-only and that Free Play starts in Mode 3 — both stale since the Mode 5↔1 transition shipped on integrated physics. | Sim-physics chapter session |
| 4 | 2026-07-28 | **Mode- and lineup-dependent alarm classification** (#240): five annunciators drop to **Status** and reword when the condition is the planned lineup rather than a casualty — new **06 §2.0** table with the Mode 3 exclusion and the inventory-alarm caveat, cross-referenced from **09 §4.0**. Two annunciators that were modeled but never documented added: **PWR-A29 LO TAVG (P-12)** (06, and 09 Panel A) and **RCP CAVITATION** (09 Panel B). | Alarm-classification session |

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
