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
| 9 | 2026-08-01 | **02 Simulator User Guide re-verified against the shipped board — five sections described the old shell.** Every claim was checked against source rather than re-read. **§3.0 / §3.1 / §2.2:** the vital-few **gauge strip is hidden on the PWR** (`ui/shell.css` — the board carries its own six Indicator Panel tiles, and two copies of the same six readings is worse than one), so the chapter's layout diagram, its gauge table and its launch check all described something the player never sees. §3.1 also listed a seventh gauge, **"Grid Match"**, present in neither the shell strip nor the board, and hardcoded "(MPa)"/"(°C)" for readings that follow the units toggle. Rewritten as the six board tiles and the seven protection regions they paint. **§3.3 / §5.0 / §7.0:** there is no **Sim** tab and no **Dev** tab — the four are **Operate · Inject Failure · Graph · Settings**; the old §7.4 content was right but lives in Operate, and §7.6 documented a tab that does not exist. **§6.0:** the Learning/Realistic and Physics Overlay selectors were **removed from Settings (#277)**. The modes still exist, but the *content* sets them — TMI-2 Parts 1 and 3 run Realistic so the board and the trend both keep the deception, Part 2 switches to Learning for the reveal — so the WARNING telling operators to "practise there before qualification exams" asked for something unreachable. **§4.3:** only **SCRAM** arms on this board (two-press, 3 s — that part was correct); MSIV, the PORV block valve and the generator OFF are all single-press, and the note says so plainly now. **§8.1 / §8.2:** alarm tiles do not highlight diagram components on hover — §3.4 already said the opposite in the same chapter — pointing gives the Scanner account, clicking acknowledges; and the **Industry register has no selector**, the board runs Learning throughout. **§12:** the campaign is **34 missions**, not "~31", which `11` already said, so the two chapters disagreed; per-act counts added. §3.2's card table was swept against the board's real titles — nothing on the board is tabbed, CVCS is three cards rather than one embedded panel, and **"Plant Status"** had no counterpart anywhere. **Verified correct and deliberately unchanged:** the 0.02 s physics timestep, the speed list, all five keyboard shortcuts, the 3 s arm window, the eight automation channels, and the Mode 5 initial condition — measured engine-direct at 122 °F (50 °C) / 363 psi (2.5 MPa) / PZR level 30.0 %. | 02 board re-verification |
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
     02_SIMULATOR_USER_GUIDE.md c69902538170ded1
     03_CONTROLS_AND_INDICATIONS.md 2d4998ef3dd14fc4
     04_NORMAL_OPERATIONS.md 665cee8377a58bdb
     05_MODE_TRANSITIONS.md ba7068295abb62cb
     06_ALARM_RESPONSE.md 51f2004b1bb8bc9b
     07_ABNORMAL_EMERGENCY.md 5b597e8be620e445
     08_ACCIDENT_TMI.md d6a3ff47c6786021
     09_SETPOINTS_LIMITS.md cb75af7787c4f3cc
     10_GLOSSARY.md 2e16faf4275c172b
     11_CAMPAIGN_CROSSWALK.md ac0f36ebc7ded8b9
     12_SIM_PHYSICS.md cf46ad1836525630
     README.md 9a103035dfb47eca
-->
