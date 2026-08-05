# 00 — Revision History

**Document set:** PWR Operator’s Manuals  
**Plant:** Reactor⚛️Dynamics PWR  
**Set revision:** 5 (2026-08-04)  

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
| 5 | 2026-08-04 | **Pressurizer spray stops working when the plant goes water-solid** (#347). **12 §12.4c** is revised: it previously declared spray's normal-operation authority as an accepted simplification, and measurement showed that was not survivable. Spray controls pressure by condensing the steam bubble; with no bubble there is nothing to condense. Credited anyway, it pinned pressure 164 psi (1.13 MPa) below the code-safety setpoint on a solid reactor coolant system taking safety injection — so the safeties could not lift, nothing arrested the fill, and inventory ran to the numerical ceiling the previous revision exists to keep the plant away from. The operator-visible lesson is sharpened rather than changed: **going solid costs you the pressurizer as a pressure controller** — spray does nothing, the heaters cannot help, and the relief valve becomes your pressure control whether you wanted it or not. The spray valve still opens and its indication still reads open; what is gone is the effect. | #347 solid-plant spray |
| 4 | 2026-08-04 | **A water-solid reactor coolant system now repressurizes, and the relief valve is what ends the fill** (#346). New declared simplification **12 §12.4c**. Until now the pressurizer had no water-solid regime at all: surplus inventory was discarded at a numerical ceiling, so a solid RCS taking safety injection sat flat at 2232 psi (15.39 MPa) for 45 minutes while emergency injection ran on, with no relief lift and no way for the operator to see the overfill on any gauge but level. The pressurizer steam bubble is the only compressible volume in the RCS; when it is gone an insurge compresses liquid, and the pressure gain steps up to the bulk modulus of water. The fill now arrests where the vessel geometry says it must and cycles the PORV. **§12.4c states what is still bubbled-plant behaviour**: relief, spray and the heaters keep their normal-operation gains, all three of which are optimistic in a solid vessel, so a real solid plant is harder to control than this one. | #346 water-solid RCS |
| 3 | 2026-08-04 | **Main feedwater RESTORE control documented, and the "cannot be restored" statements corrected.** `03` gains a RESTORE entry on the SG FEED card — what isolates main feed automatically, that the isolation **seals in** and is refused while its signal stands, and that after a trip the blocker is the trip latch itself, so the sequence is confirm trip → reset RPS → restore. Carries the measured warning that restoring into a recovering generator with feed demand still up drives level 36.6 % → 77 % in about two minutes and re-isolates at the 90 % high level. `05` PWR-T06 step 4 corrected: it stated main feedwater "cannot be restored from the board", which stopped being true when the control shipped. | Claude |
| 2 | 2026-08-04 | **12** §7.1 — the pressurizer surge term now carries RCS **inventory** as well as thermal expansion (#337), so a loss of inventory shows up on pressure and subcooling margin and not only on pressurizer level; new §12.5-family simplification row **12.15** declaring that this plant's heater authority is far above the sourced 1794 kW / 55 °F/hr (WTSM 3.2, ML11223A213), which damps that cue to roughly 1 °F of margin where the real rating gives about 9 °F. | Claude |
| 1 | 2026-08-04 | **A break now weakens as the plant depressurizes** (#334). **12 §12.4b** is a new declared simplification, and it replaces something worse than a simplification: until now a LOCA discharged at a **constant rate**, fixed when the break opened and unchanged whether the reactor coolant system was at 2235 psi (15.41 MPa) or at atmospheric — so depressurizing did nothing to a break, and a vessel already empty went on discharging at full rate. 10 CFR 50 Appendix K I.C.1.b requires the discharge rate to be a critical-flow function of the upstream fluid, applied as *"a discharge coefficient applied to the postulated break area"* — a break is an **area**, not a flow. Break flow now follows the orifice law, ∝ **√Δp** to containment, the same form this manual's letdown orifices use. **§12.4b states which way it errs**: √Δp falls off faster than Moody's model does once the discharge flashes, so a real break stays stronger for longer than this one. The operational lesson is the shape, and the shape is now right — closing the pressure difference reduces break flow, which is why that is the response to a tube rupture, and an RCS at containment pressure has stopped discharging. | #334 break discharge |
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
     Sealed at Rev 5 (2026-08-04). A mismatch means a chapter changed with no
     revision row added — add one and re-run the tool. See test/run_manual_rev.js.
     01_GENERAL_DESCRIPTION.md a29f9d911a8efc97
     02_SIMULATOR_USER_GUIDE.md eb34fd2d961ed23e
     03_CONTROLS_AND_INDICATIONS.md 38ca8b984d002955
     04_NORMAL_OPERATIONS.md d42cd39fc1fc676b
     05_MODE_TRANSITIONS.md 6d4e4986a2cd35e8
     06_ALARM_RESPONSE.md 4bc2d926b273f4d8
     07_ABNORMAL_EMERGENCY.md 75c7875dc7531302
     08_ACCIDENT_TMI.md d6a3ff47c6786021
     09_SETPOINTS_LIMITS.md ff616f13a1e0884d
     10_GLOSSARY.md 2e16faf4275c172b
     11_CAMPAIGN_CROSSWALK.md ac0f36ebc7ded8b9
     12_SIM_PHYSICS.md 80aa48d4a2bbeabd
     README.md 9a103035dfb47eca
-->
