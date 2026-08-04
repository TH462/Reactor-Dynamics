# 00 — Revision History

**Document set:** PWR Operator’s Manuals  
**Plant:** Reactor⚛️Dynamics PWR  
**Set revision:** 0 (2026-08-04)  

> **This table is NEWEST FIRST, and the revision is SET-WIDE.** Every chapter carries the
> same `**Revision:**` as the newest row here — there is one number for the whole set, not
> one per document.
>
> **Public counting starts at Rev 0, and it was zeroed AT the first Alpha release**
> *(OWNER DIRECTIVE, 2026-08-04: "The plant manual revision number should be zeroed out for this
> release.")*, so the first player-facing sequence is clean: 0, then 1, 2, … The 26 development
> revisions this table carried before that release are **not lost** — every one of them is in
> `git log` for `Manuals/`, which is where a per-chapter history belongs. What they are not is
> *player-facing*: a revision row exists to tell a reader what changed since the copy they had,
> and nobody had a copy before Rev 0.
>
> **This is the second reset, which is the argument for not doing a third.** An earlier Rev 0
> was stamped 2026-07-31 in anticipation of go-public, then development continued and the
> counter ran to 26 before the release actually happened. Zero it at the release, not before it.
>
> **To revise the set:** add a row at the top of this table, then run
> `node tools/stamp_manual_revision.js`, which propagates the number into every chapter and
> `README.md` and refreshes the content digests below. `node tools/pack_manuals.js` after,
> so the in-app copy carries it. `test/run_manual_rev.js` fails if any of that is skipped —
> including if a chapter's prose changes with no new row.

| Rev | Date | Description | Author |
|-----|------|-------------|--------|
| 0 | 2026-08-04 | **Initial Alpha release.** The PWR operator manual set as issued for the first public Alpha. Revision counting starts here: this is the baseline the set ships at, not a change against anything a player has seen. Pre-release development history — every revision of every chapter — is in `git log` for `Manuals/`, not in this table. | Initial Alpha release |

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
     Sealed at Rev 0 (2026-08-04). A mismatch means a chapter changed with no
     revision row added — add one and re-run the tool. See test/run_manual_rev.js.
     01_GENERAL_DESCRIPTION.md a29f9d911a8efc97
     02_SIMULATOR_USER_GUIDE.md eb34fd2d961ed23e
     03_CONTROLS_AND_INDICATIONS.md a3aa20fba274e2ae
     04_NORMAL_OPERATIONS.md d42cd39fc1fc676b
     05_MODE_TRANSITIONS.md 04a8013bad9ca00f
     06_ALARM_RESPONSE.md 4bc2d926b273f4d8
     07_ABNORMAL_EMERGENCY.md 75c7875dc7531302
     08_ACCIDENT_TMI.md d6a3ff47c6786021
     09_SETPOINTS_LIMITS.md ff616f13a1e0884d
     10_GLOSSARY.md 2e16faf4275c172b
     11_CAMPAIGN_CROSSWALK.md ac0f36ebc7ded8b9
     12_SIM_PHYSICS.md bf6cd0d8bda845a9
     README.md 9a103035dfb47eca
-->
