# 00 — Revision History

**Document set:** PWR Operator’s Manuals  
**Plant:** Reactor⚛️Dynamics PWR  

| Rev | Date | Description | Author |
|-----|------|-------------|--------|
| 0 | 2026-07-16 | Initial commercial-style manual set created from Blueprint specs, as-built PWR engine/control layer, and in-product procedure data. Covers simulator use, all controls, normal ops, mode transitions, alarms, failures, and TMI. Issues captured in `ISSUES_AND_FINDINGS.md`. | Manual build session |
| 1 | 2026-07-16 | Plant MODES introduced; master paths **PWR-T20** / **PWR-T21**. | Manual build session |
| 2 | 2026-07-16 | Naming locked to **Mode N, Name** (e.g. **Mode 1, At Power**). Campaign handoff: `CAMPAIGN_MODE_ALIGNMENT_SPEC.md`. Crosswalk: `11_CAMPAIGN_CROSSWALK.md`. Manuals only. | Manual build session |

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
| `ui/manual_data.js` | Generated setpoints, controls, alarm response |
| `ui/manual_procedures.js` | Validated step procedures |
| `engines/pwr/pwr_config.js` | Operating points and limits |

## Review status

| Item | Status |
|------|--------|
| Technical accuracy vs engine setpoints | Draft — cross-checked against config/control data |
| Procedure validation in `test/run_procedures.js` | Partial — in-product procedures validated; expanded manual steps not harness-run |
| Operations SME review | Not performed |
| Licensing / real-plant use | **Not applicable** — training software only |
