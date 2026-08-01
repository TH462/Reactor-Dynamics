# 00 — Revision History

**Document set:** PWR Operator’s Manuals  
**Plant:** Reactor⚛️Dynamics PWR  
**Set revision:** 1 (2026-07-31)  

> **This table is NEWEST FIRST, and the revision is SET-WIDE.** Every chapter carries the
> same `**Revision:**` as the newest row here — there is one number for the whole set, not
> one per document.
>
> **Public counting starts at Rev 0.** Pre-public development history was zeroed out so the
> first player-facing revisions after go-public are a clean sequence (0, then 1, 2, …). Older
> development rows live in `git log` for `Manuals/`, not in this table.
>
> **To revise the set:** add a row at the top of this table, then run
> `node tools/stamp_manual_revision.js`, which propagates the number into every chapter and
> `README.md` and refreshes the content digests below. `node tools/pack_manuals.js` after,
> so the in-app copy carries it. `test/run_manual_rev.js` fails if any of that is skipped —
> including if a chapter's prose changes with no new row.

| Rev | Date | Description | Author |
|-----|------|-------------|--------|
| 1 | 2026-07-31 | **04 Normal Operating Procedures rewritten in commercial NOP format.** Every N01–N15 procedure now carries purpose / applicability / prerequisites / precautions / stepped procedure with acceptance / outcome. Heatup (N01) and approach (N03) aligned to commercial practice (WTSM heatup outline; NUREG-1431 accumulator LCO/SR; 1/M + SUR + ECC). Fixed HFP electrical band **1000 → 100 MWe**. Operator-facing prose only — no build notes or internal rulings. | NOP content rewrite |
| 0 | 2026-07-31 | **Pre-public baseline.** Manual set reset to Rev 0 for a clean public revision counter. Current content includes the as-built PWR operator manuals through the normal-ops plant-sequence renumber (N01 heatup → N15 cooldown) and prior engine/procedure alignment. Development history before this baseline is in git, not listed here. | Public-rev reset |

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
     Sealed at Rev 1 (2026-07-31). A mismatch means a chapter changed with no
     revision row added — add one and re-run the tool. See test/run_manual_rev.js.
     01_GENERAL_DESCRIPTION.md 084d5a7df10229c3
     02_SIMULATOR_USER_GUIDE.md 4fb25f478c3f767d
     03_CONTROLS_AND_INDICATIONS.md 807262dd36af8dfe
     04_NORMAL_OPERATIONS.md 838ec2fd6946e81f
     05_MODE_TRANSITIONS.md ba7068295abb62cb
     06_ALARM_RESPONSE.md 2acccbd717a16f34
     07_ABNORMAL_EMERGENCY.md 5b597e8be620e445
     08_ACCIDENT_TMI.md d6a3ff47c6786021
     09_SETPOINTS_LIMITS.md 5087ad5b2fe38add
     10_GLOSSARY.md 2e16faf4275c172b
     11_CAMPAIGN_CROSSWALK.md ac0f36ebc7ded8b9
     12_SIM_PHYSICS.md ccc3022b353df42d
     README.md 9a103035dfb47eca
-->
