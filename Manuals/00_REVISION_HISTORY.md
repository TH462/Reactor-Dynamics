# 00 — Revision History

**Document set:** PWR Operator’s Manuals  
**Plant:** Reactor⚛️Dynamics PWR  
**Set revision:** 9 (2026-08-01)  

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
| 9 | 2026-08-01 | **The documented startup path did not join up, and three heatup numbers were wrong** (review of 04, all findings MEASURED full stack). **(1) Boron discontinuity — the big one.** PWR-N01 delivers a plant at **856.8 ppm** and nothing in the path dilutes, but PWR-N02 and PWR-N03 both assumed **~683 ppm**, which is the *shortcut* Hot Standby lineup rather than the heatup's own arrival. Measured, criticality then sits near **561 steps** instead of **319** — **242 steps / ~1830 pcm outside** the ±750 pcm acceptance band 09 §7.5.1 tells you to stop at. **New PWR-N02 step 15** dilutes to the estimated critical condition (measured: 857 → 683 ppm in ~58 plant-min, arriving ρ = −1006 pcm; bank to 319 steps then reads **ρ = −2.3 pcm**, critical on the reference position). N02 step 8 now *samples and records* boron instead of asserting it, and N03's 683 ppm / 319 step / 1/M burst figures are labelled as the **worked example for one boron**, not constants. **(2) N01 aligned the accumulators after the LCO deadline it cites** — step 7 followed a step whose acceptance is P > 2176 psi, while the compliant 600–1000 psi window is measured **~100 s wide** (600 psi at +24 s from the Pressure SP command, 1000 psi at +122 s, NOP at +3.5 min); the alignment is now an action *inside* the pressurization. **(3) Three measured corrections:** the 5 % steam-dump demand reverses the heatup at **−263 °F/hr (−146 °C/hr)**, not −83 (and below ~220 °F it only arrests it); NOP arrives in **~3.5 plant-minutes**, not ~20; and the milestone row calling 350 °F "Mode 4 / Mode 3 entry" was wrong about Mode 4 — that boundary is **199.4 °F (93 °C)**, reached at **~18 plant-minutes**. **(4) PWR-N05 never synchronized** — the procedure named for putting the machine on the grid only selected a load mode, which does not close an open generator breaker; **Connect Grid** is now step 3. **(5) PWR-N15 never blocked SI** — the cooldown crosses the 12.4 MPa actuation setpoint, and measured with SI armed the pumps inject, boron ends at 2500 ppm and the plant cools ~10× faster than programmed; **new step 1a**. Its expected-performance table is now MEASURED with the cadence stated (−90 °F/hr programmed, 63 °F subcooling held, RHR HX trimmed to the ramp): accumulators isolated 1.9 h, RHR 3.05 h, Mode 5 **5.0 h**, ending on the `cold_shutdown` IC exactly. **(6)** The ~90 °F/hr cooldown limit is marked **UNVERIFIED** — no source exists for it in this manual set and the previous "commercial class" wording was recall. **05** corrected in step: Phase A carried a stale **−3377 pcm / 907 ppm** endpoint (pre-dating the second moderator re-fit) that contradicted N01's own correct figures, plus an unfinished "→ Four" mode name; new Phase C step **C0** for the ECC boron; T21 note gained the SI block. | 04 NOP review |
| 8 | 2026-07-31 | **The RHR suction valve has two interlock setpoints now, not one** (#288) *(OWNER RULING, 2026-07-31: "issue 288, split them.")*. `rhr_valve_interlock_mpa` was doing two different jobs at once — blocking the **open** and forcing the **autoclose** — so the deadband was **zero** and the valve chattered across a single boundary. The autoclose now runs off a new **600 psi (4.14 MPa)** `rhr_autoclose_mpa`, ~200 psi (1.38 MPa) above the unchanged **400 psi (2.76 MPa)** block-open permissive, matching the structure NUREG-0933 Issue 99 describes (*"an automatic closure signal on high RCS pressure (typically 600 psig), and … a block of the manual open signal at a lower RCS pressure (typically 425 psig)"*) and the Westinghouse Technology Systems Manual §5.1 (ADAMS **ML11223A219**, valves 8701/8702, 425 psig open block against a ~585 psig autoclose). **Measured, engine-direct:** before the split *every* rebound above 400 psi shed the valve, including the **409 psi (2.82 MPa)** #287 case; after it, rebounds to 409/435/508 psi all hold and the valve lets go at its 600 psi setpoint (observed 604 psi — the plant's own pressure overshoots inside the step). The open permissive was deliberately **not** moved: 400 psi is what 04, 05, 09 and the campaign all quote. **09** gained a **§ RHR** note carrying both setpoints and the sources; **03 §11.2**, **04** (×2), **06 PWR-A33** (three rows) and **12 §6.4 / §14** updated. | RHR interlock deadband |
| 7 | 2026-07-31 | **The RHR interlock card is sourced, and a real plant has no automatic open at all** (#287, evidence pass). **06 PWR-A33** gained two rows carrying the primary: NUREG-0933 **Issue 99, "RCS/RHR Suction Line Valve Interlock on PWRs" (Rev. 3)** — *"Two basic features are incorporated in the interlock design: (1) an automatic closure signal on high RCS pressure (typically 600 psig), and (2) a block of the manual open signal at a lower RCS pressure (typically 425 psig)."* The operator opens the suction valves; the interlock only **blocks** that open. This trainer's automatic entry is therefore already a simplification in the permissive direction, which settles the ruling on evidence rather than on recall: a **one-shot** is the closer of the two available behaviours. Two further findings recorded on the card — the real design separates its setpoints (**block-open ~425 psig, autoclose ~600 psig**) where this plant uses **one at 400 psi**, which is what let the valve chatter across the boundary; and inadvertent RHR suction valve closure is a well-documented event class (**27 events through 1981**, **0.12 unplanned closures per plant-year**, consequence *"the potential for RHR pump damage and loss of decay heat removal"*) whose NRC resolution was **Generic Letter 88-17** — improved instrumentation, procedures and administrative controls. Annunciation, not automation, which is what this tile is. | RHR interlock evidence pass |
| 6 | 2026-07-31 | **Losing shutdown cooling now annunciates — new 06 PWR-A33 (RHR NOT IN SERVICE)** (#287). The RHR auto-entry permissive is **one-shot**: it fires on the first crossing below **400 psi (2.76 MPa)** and never re-arms, while the engine **auto-closes** the suction valve on any repressurization back above the interlock. Both halves are correct on their own — a real plant re-opens that valve deliberately, not automatically — but paired, a brief repressurization removed automatic RHR entry permanently with nothing to say so. Measured: a cooldown whose pressure-control setpoint sat just above the interlock finished **scrammed at 283 psi (1.95 MPa), below the entry pressure, with the arm still in AUTO, its permissive condition still true, and RHR shut** — the only board indication being the ECCS card quietly reading LPI instead of RHR. *(OWNER RULING, 2026-07-31: "Keep it and enunciate")* — so the permissive stays one-shot and the **indication** is what was missing. The tile is gated on **Mode 4/5 and the valve position**, not on pressure (RHR is correctly unaligned through all of Modes 1–3) and not on the reactor-trip latch: a Mode 5 plant reads **not tripped**, because it was never scrammed, which made the first cut of this alarm impossible to get in the one mode where losing RHR matters most. Index table extended to 33 cards. | Shutdown-cooling annunciation |
| 5 | 2026-07-31 | **Removed the nuclear-from-cold heatup path** (was training-only N01a / live checklist). Not a commercial NOP — heatup is subcritical (N01); approach is hot (N03). | Drop nuclear heatup |
| 4 | 2026-07-31 | **Training-only heatup variant clarified; procedure titles aligned.** Index and H1 titles now match (e.g. N02 is *Mode 3, Hot Standby — plant lineup*, not “Prerequisites…”). Commercial path is subcritical heatup then hot approach (N01 → N03). | Titles |
| 3 | 2026-07-31 | **Expected performance tables unified.** N01 heatup rewritten to milestone table form; **N15** cooldown gained matching expected performance (Mode 4, isolate at 1000 psi, RHR, cold end). | Expected performance |
| 2 | 2026-07-31 | **Training heatup variant gained expected performance** — nuclear-from-cold milestones (pressurize, critical, end of dilution, Mode 3 settled). *(That path was removed in Rev 5.)* | Heatup performance |
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
     Sealed at Rev 9 (2026-08-01). A mismatch means a chapter changed with no
     revision row added — add one and re-run the tool. See test/run_manual_rev.js.
     01_GENERAL_DESCRIPTION.md 084d5a7df10229c3
     02_SIMULATOR_USER_GUIDE.md 4fb25f478c3f767d
     03_CONTROLS_AND_INDICATIONS.md 2d4998ef3dd14fc4
     04_NORMAL_OPERATIONS.md e5307fd877d2156d
     05_MODE_TRANSITIONS.md 3e99e7c92a781f56
     06_ALARM_RESPONSE.md 51f2004b1bb8bc9b
     07_ABNORMAL_EMERGENCY.md 5b597e8be620e445
     08_ACCIDENT_TMI.md d6a3ff47c6786021
     09_SETPOINTS_LIMITS.md cb75af7787c4f3cc
     10_GLOSSARY.md 2e16faf4275c172b
     11_CAMPAIGN_CROSSWALK.md ac0f36ebc7ded8b9
     12_SIM_PHYSICS.md cf46ad1836525630
     README.md 9a103035dfb47eca
-->
