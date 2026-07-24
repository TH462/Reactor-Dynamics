# PWR Pre-Ship Review Plan

**Created:** 2026-07-19 (Fable) · **Executor:** Opus · **Branch:** `develop`
**Goal:** One comprehensive, phased review of the entire PWR stack before v1 ship. BWR and
RBMK are *not* shipping yet and are out of scope except as regression guards.

This document is self-contained: it carries the ground-truth baselines measured on
2026-07-19, the fix policy, the phase checklist, and the gotchas. The executor should not
need prior conversation context. When this plan and any other doc disagree about a number,
**trust the live test-runner output**, then this plan, then `CHANGELOG.md`; several older
docs (README baselines, `OPS_TUNING_REPORT.md`) are known to be partially stale.

---

## 0. Ground rules (read first)

1. **Orient:** Read `README.md` (the map + hard-rule summary), `Blueprint/CONTEXT.md`
   (interfaces, data contract, Hard Rules HR1–HR7), and the top ~150 lines of
   `CHANGELOG.md`. Skim `Blueprint/BUILD_DECISIONS.md` Status/Open-Flags section.
2. **Fix policy — fix everything you can.** This is a *fixing* review, not report-only.
   For each finding: diagnose → fix → prove with the relevant gate(s) → log it. If a fix
   requires a genuine design ruling (changes intended behavior, teaching content, or a
   documented owner decision), stop and ask the user instead of choosing.
3. **Findings log:** Maintain `Diagnostic/PWR_SHIP_REVIEW_2026-07.md` as you go. One row
   per finding: `ID · Phase · Severity (H/M/L) · Finding · Action taken (FIXED/OPEN/RULING
   NEEDED) · Gate evidence`. This log + updated docs are the review's deliverable.
4. **Commits:** Commit to `develop` (never `main`) at each phase boundary and after any
   self-contained fix, with all gates at/above baseline. Merge/push to `main` only if the
   user explicitly asks.
5. **Scope guard:** Do not tune BWR/RBMK physics or close their ops FAILs. Run their
   suites only to prove PWR-motivated changes to shared layers (control kernel, M5, M6,
   M7, load_mode) didn't regress them.
6. **Doc discipline:** Any behavior/config change → regenerate the in-product manual
   (`node tools/gen_manual_reference.js`), update `CHANGELOG.md`, README *Project status*
   baselines, and `Blueprint/BUILD_DECISIONS.md` in the same commit.
7. **Environment:** Windows 11, PowerShell primary. Tests are plain Node CLI runners (no
   package.json, no framework); engine/layer files attach to `globalThis.RD` via
   `require()`. UI verification uses headless Edge (see Phase 4).

## Baseline table — ground truth (AMENDED later on 2026-07-19, see Amendment A1)

| Gate | Command | Plan-time measure | **Re-measured post-A1** | Ship target |
|---|---|---|---|---|
| PWR engine suite | `node test/run_pwr.js` | 24/26 ⚠ (P1-A) | **31/31** (191) | 31/31 |
| PWR ops probes | `node test/run_ops.js pwr` | 17/19 | **19/20** (P4 only; +`ops_sg_overfeed_p14`) | **19/20** (see A1 — P4 DEFERRED by owner ruling) |
| Campaign | `node test/run_campaign.js` | 47/47 (1842) | **51/51** (2897) | 51/51 |
| Control/failure layer | `node test/run_m4.js` | 15/15 | **18/18** | 18/18 |
| Simulation service | `node test/run_m5.js` | 19/19 | 19/19 | 19/19 |
| Instructor | `node test/run_m6.js` | 16/16 | 16/16 (94 — tautologies repaired) | 16/16 |
| Placeholder instructor | `node test/run_m6ph.js` | not measured | **8/8** | 8/8 |
| Stack wiring | `node test/run_m7.js` | `M7 OK` (with teeth) | `M7 OK` | `M7 OK` |
| Automation channels | `node test/run_autoctl.js` | 20/20 | 20/20 | 20/20 |
| Procedures | `node test/run_procedures.js` | 20/21 (B3) | **21/21** (B3 = strict `✗(known B3)`, exit 0) | 21/21 |
| Flagship scenarios | `node test/run_scenarios.js` | 3/3 | 3/3 | 3/3 |
| Control e2e | `node test/run_e2e_controls.js` | (not in plan — was silently 27/28) | **30/30** | 30/30 |
| Synoptic DOM harness | headless Edge (Phase 4) | not measured | still not measured — Phase 4 | 55/55 |
| E2E UI | `node test/verify_e2e_ui.js` | not measured | still not measured — Phase 4 | PASS |
| BWR / RBMK guards | `node test/run_bwr.js` · `run_rbmk.js` | not measured | **15/15** (92) · **23/23** (150) | no regression |
| All-plant ops | `node test/run_ops.js` | 56/66 | **57/67** (10 FAILs = documented targets incl. the deliberate C2 red) | no regression |

Historical note: README/CHANGELOG suite counts grow as tests are added — always compare
against the **Re-measured post-A1** column above (it matches README's current baselines).

## Amendment A1 (2026-07-19, Fable — after the full test-suite review pass)

Between plan authoring and Phase-1 execution, two work streams landed on `develop` and
change this plan's facts. Read `Diagnostic/TEST_SUITE_REVIEW_2026-07-19.md` +
`CHANGELOG.md [Unreleased]` before starting. Concretely:

1. **P1-A is already FIXED** — `run_pwr` was repaired (26/26) before this review started
   and now stands 31/31. Phase 1 step 2 is a no-op; step 1 (record the battery) stands,
   with the table above as the pre-recorded snapshot.
2. **Phase 2 is largely done:**
   - **P2-B (`ops_sgtr_managed`) FIXED** (`6b17e5f` pressure-model sat-hold + faithful EOP).
   - **P2-A (`ops_load_follow`) → owner ruling: DEFERRED** (`ff0465d`): partial-load Tavg
     291.5 vs ≥293 band; the steam-pressure-program fix destabilized load delivery and was
     reverted; documented tuning gap, NOT to be closed by weakening the test. The ship
     target is therefore **19/20**, not 19/19 — do not chase P4 without a new ruling.
   - **P2-C/C1 FIXED** (this pass): `power_range` `[0,200]` in BOTH `pwr_config.js` and
     `bwr_config.js`; manual regenerated; acceptance re-pointed (PWR `abuse_accel_latency`
     hard trip checks; new BWR engine `protection_trips`). `abuse_startup_yank` is no
     longer C1's acceptance (the SR trip catches the yank at 0.02 %).
   - **P2-C/C2**: now has a deliberate RED acceptance check (`ops_rbmk abuse_accel_latency`
     "256×: same protection outcome as 1×"). The judgment call (ship-blocker vs documented
     limitation, prefer the small `simulation_service.tick()` fix) REMAINS OPEN for this review.
   - **P2-C/C3**: still absent (no `reset_rps`) — still open, log as post-ship candidate.
   - **P2-C/C4**: still true; the dual-read workaround is now triplicated
     (`simulation_service._snapScrammed`, instructor `scram` trigger, kernel automation
     stand-down) — fixing C4 should also collapse those three sites.
3. **Phase 3 hotspot list — several now have dedicated regression guards** (verify, don't
   re-derive): accumulator 4.14 MPa boundary + break-size discrimination
   (`accumulator_arming_boundary`), steam-dump cap (`steam_dump_capacity_cap`), CVCS
   level term (`cvcs_level_control`), spray floor (`pressure_saturation_bounds`),
   P-14/P-9 scoping (m4 direct guards `26a1efe` + engine `feedwater_isolation` + ops
   `ops_sg_overfeed_p14`), Mode 5↔1 + P-11 bypass lifecycle (m4 `P-11/P-7 trip bypass`,
   campaign UNscrammed assertions). The read-for-bugs pass itself is still to do.
4. **Phase 6 note:** the campaign gate now drives all FIVE TMI-2 p3 endings and asserts
   the Mode-transition missions arrive unscrammed; a static "references resolve" pass
   validates every beat reference (goto/instrument/alarm/command/gate vocab). The
   `pwr_mode3_to_mode5` scripted driver was reworked (see gotchas below). Hands-on
   playthrough is still to do.
5. **New gotchas for Appendix A** (learned this pass, already bitten):
   - Scripted drivers at high acceleration must use SIM-TIME-based rates, not per-sample
     steps — an M5 attention stop can drop the speed to 1× mid-run and a per-sample walk
     becomes a full-speed crash.
   - Interlock permissives read the LAGGING instrument (HR1): on a fast transient a
     `set_trip_block` that "should" be allowed gets refused — check the result and retry.
   - `inject_failure` now returns COMMAND_ERROR on unknown ids (effect names like
     `primary_leak` are not failure ids).
   - Background shell pipes through `head`/`tail` buffer silently on Windows — don't
     diagnose "no output" as a hang.
6. **Stale lines in this plan superseded by A1:** the Appendix A bullet "`run_procedures.js`
   20/21 … accepted" (now 21/21 with strict xfail) and Appendix B's suite counts
   (`run_pwr` 31 suites, ops pwr 20, campaign 51).

---

## Phase 1 — Gate battery + fix the live regression

1. Run every command in the baseline table (including the not-measured rows and the
   BWR/RBMK guards). Record exact tallies in the findings log. This snapshot is the
   regression reference for the whole review.
2. **P1-A (H, known): `run_pwr` is 24/26.** Two suites fail:
   - *"Merged HPI/LPI — two-segment injection curve"* — checks "1 MPa → low-head
     dominates" (expected >0.7 of combined rated, observed 0.161) and "degraded_hpi
     scales the combined curve" (expected −0.256±0.02, observed 0.081).
   - *"RHR hot-leg valve interlock, HX split, ECCS mode"* — valve won't open below the
     interlock; `rhr_active`, `eccs_mode`, and LPI-regime checks cascade-fail.
   Likely fallout from the recent break-blowdown / accumulator-setpoint (4.14 MPa) /
   Mode-5 accumulator-isolation rework (see CHANGELOG "[Unreleased]") — those tests were
   green when the RHR/LPI work landed. Diagnose whether the *engine behavior* regressed
   (fix the engine) or a deliberate physics change invalidated the *test setup* (fix the
   test, citing the CHANGELOG/BUILD_DECISIONS entry that changed the behavior). Do not
   weaken assertions to pass.
3. Chase any other below-baseline gate the battery reveals the same way.
4. Gate: full battery at/above the ship-target column (except ops 17/19, which Phase 2
   owns). Commit.

## Phase 2 — Close the two PWR ops-probe FAILs

The ops suites (`test/ops_pwr.js`, harness `test/ops_harness.js`) run the engine UNDER
the real control layer at M5 cadence — operator-realistic evolutions. The two remaining
PWR FAILs are documented tuning targets; the ship decision is to **close them**.

1. Read `Diagnostic/OPS_TUNING_REPORT.md` for context, but note it's from 2026-07-06 and
   many of its findings are already fixed — trust `node test/run_ops.js pwr <name>` live
   output and `Diagnostic/ops_results.json` freshly regenerated.
2. **P2-A `ops_load_follow`** — 100→50→100 % daily cycle under rods/turbine-follow.
   Diagnose which check fails and why (probe with single-test runs; the automation rod
   controller is mismatch-dominant — see `layers/control/pwr_control.js`).
3. **P2-B `ops_sgtr_managed`** — EOP-scripted SGTR response. The leak was already
   rescaled (per-failure `leak_scale`, inventory now holds >70 %), so the remaining
   failure is elsewhere in the check chain — diagnose fresh.
4. **Tuning constraints — do not break while tuning:** TMI level-vs-inventory deception
   (PZR level rises while inventory falls; `K_void_surge` path); small-break SGTR holds
   the saturation plateau above 4.14 MPa while a large LOCA falls below it and dumps the
   accumulators (~5.9 MPa vs ~3.2 MPa in the current tune); spray floor ≈8 MPa vs
   heaters; steam-dump ~50 % cap; Mode-5 accumulator isolation. All are gate-protected —
   the full battery is the proof.
5. **P2-C — re-verify the OPS report's cross-cutting findings for the PWR** (they may or
   may not have been fixed since; check code, then probe):
   - **C1** high-flux trip clipping: `power_range` range in `engines/pwr/pwr_config.js`
     must exceed the 120 % trip so `crossed()` can fire (RBMK got `[0,200]`; verify PWR
     did too, else `abuse_startup_yank` melts fuel). Regen manual if changed.
   - **C2** protection latency at high time-acceleration (trips evaluated per broadcast,
     not per sim-step). If still true, judge: ship-blocker or documented limitation?
     Prefer the small `simulation_service.tick()` fix if low-risk.
   - **C3** no recovery from scram (`reset_rps` forgiveness feature) — if still absent,
     log as OPEN post-ship candidate unless trivially safe to add.
   - **C4** manual scram doesn't set `rps_state.scrammed` — verify; fix if still true
     (UI/instructor consumers mislabel the plant).
6. Gate: `run_ops.js pwr` **19/19**, full battery green, RBMK/BWR ops unchanged from
   Phase-1 record. Commit.

## Phase 3 — Code & physics review (engine, control, service)

Read-for-bugs pass over the PWR-critical code, against specs and hard rules. Files:

- `engines/pwr/` — `pwr_config.js`, `pwr_engine.js`, `pwr_instruments.js`,
  `pwr_pressurizer.js`, `pwr_primary.js`, `pwr_steam_generator.js`, `pwr_thermal.js`
- `engines/load_mode.js`
- `layers/control/control_kernel.js`, `layers/control/pwr_control.js`
- `layers/simulation_service.js`, `layers/instructor_layer.js` (PWR-relevant paths)

Specs: `Blueprint/M1 pwr engine.md`, `M4 control failure.md` + `M4b_control_layer.md`,
`M5_simulation_service.md`, `M6_instructor.md`, `CONTEXT.md` (HR1–HR7),
`load_mode_spec.md`. Prior art: `Diagnostic/SPEC_AUDIT_2026-07-16.md` — most findings
were fixed same-day; the audit's *deliberately-left* items (latched ESF actuations,
`clip()` duplication, `buildTraining` naming, `dampInstruments`) are accepted — do not
re-fix them.

Checklist per file:
1. **Hard rules:** no true-state reads where instruments are required (HR1); commands
   only via the layer below (HR5); actuations/trips in control layer, hydraulics in
   engine (HR7 — owner ruling 2026-07-16: relief-valve + turbine-trip logic = control-
   layer actuations reading instruments; verify the pass that moved them left no stragglers).
2. **Numerics:** every division guarded, every integrated state bounded/clamped, no
   NaN sources on extreme inputs (0 inventory, 0 flow, 256× accel). The ops suites
   found zero non-finite values — keep it that way.
3. **Units:** MPa vs psi vs kPa, °C vs K, fraction vs percent at every config boundary
   (the BWR RCIC bug was exactly a normalized-vs-absolute mismatch; hunt the same class
   in PWR actuation setpoints in `layers/control/pwr_control.js`).
4. **Config vs manuals:** every setpoint in `pwr_config.js` + PWR control data vs
   `Manuals/09_SETPOINTS_LIMITS.md` and the generated in-product reference. Regen and
   diff: `node tools/gen_manual_reference.js`.
5. **Dead code / stale comments:** e.g. `ui/shell.html` orphaned `auto_control.js`
   comment block (~line 312) — remove; hunt similar residue from the control-layer
   rework and the pressure-model rework (`K_leak_depressurize` gating, accumulator
   paths).
6. **Recent-change hotspots** (highest regression risk, review closely): break-blowdown
   flash-cooling term in `pwr_thermal.stepCoolant`; accumulator arm/isolate logic incl.
   Mode-5 lineup; CVCS charging→PZR-level term (`K_cvcs_level`, bounded vs
   `K_void_surge`); spray saturation floor; steam-dump cap; P-14/P-9 SG-level protection
   scoping (turbine trip from other causes must NOT scram); low-low SG trip at 17 %;
   RHR/LPI valve + `eccs_mode`; Mode 5↔1 transition commands (`set_pressure_setpoint`,
   `set_steam_dump_setpoint`, `set_rcp`) and P-11 ESF arming.
7. Fix what you find; every fix proven by the battery. Commit per coherent group.

## Phase 4 — UI/HMI verification (hands-on)

The UI is PWR-only (M8 functional alpha) — it ships, so it gets a full hands-on pass.

1. **Automated first:** `node test/verify_e2e_ui.js` (must PASS) and the synoptic DOM
   harness (must be 55/55) — the harness drives `ui/shell.html` in headless Edge. Edge
   headless invocation + dev URL params (`?mode=` `?inject=` `?ff=` `?run=` `?tab=`
   `?auto=`) are the established workflow; also run `node test/run_e2e_controls.js`,
   `node test/audit_manual_controls.js`, `node test/verify_manual_follow.js` and record.
2. **Serve + load check:** app must boot both from `file://index.html` and a static
   server (`npx serve .`), no console errors on load, all `<script>` includes resolve
   (no 404s — check the DevTools/console output in the headless run).
3. **Control sweep:** drive every control listed in
   `Manuals/03_CONTROLS_AND_INDICATIONS.md` and every command in the manual UI map
   (`test/manual_ui_map.js`) — each must issue its command through
   `service.handleCommand` and produce the expected indication change. Include: rod
   tap-vs-hold drive + one-click shutdown bank, SCRAM two-step confirm, PORV/spray/
   heaters, charging/letdown + AUTO make-up, AFW, MSIV, steam dump, feed pump /
   three-element, ESF arm buttons, RHR valve, accumulator isolation, SR/IR NIS + 1/M
   panel, rod AUTO/MAN, Automate tab, time acceleration, rewind, save/load.
4. **Alarm sweep:** all 26 PWR alarms (A01–A26 per manuals) can annunciate and be
   acknowledged; `SG LVL HI HI` (88 %) and `SG LVL LO LO` present; annunciators read
   *instruments*, not true state (HR1 spot-check).
5. **Mode-5 surface (known open item):** README lists exposing the Mode-5 controls
   (pressure setpoint, steam-dump setpoint, RCP start/stop) and the `plant_mode`
   indicator in the UI as open. Verify actual current state. If still missing, the
   Mode-5↔1 campaign missions may be unplayable from the real UI — test mission
   `pwr_mode5_to_mode3` through the actual DOM. If unplayable: implement the minimal
   exposure (this is in-scope for ship since the missions ship) — or if that grows
   large, stop and ask the user.
6. **ECCS card layout** (open item, contract in `Blueprint/pwr_synoptic_prerequisites.md`):
   verify the synoptic's ECCS/`eccs_mode` indication is at least present and truthful;
   full layout work is post-ship unless trivially completable.
7. Fix UI findings (JS errors, dead controls, wrong bindings, stale labels like the
   DHR/RHR naming mix if user-visible). Gate: e2e PASS, synoptic 55/55, battery green.
   Commit.

## Phase 5 — Documentation & manuals consistency

1. **Manuals accuracy sweep** (`Manuals/00`–`11`): every setpoint, alarm, procedure
   step, and mode-transition description vs as-built behavior. Priority files:
   `09_SETPOINTS_LIMITS.md` (diff against `pwr_config.js` + control data),
   `03_CONTROLS_AND_INDICATIONS.md` (vs Phase-4 sweep), `05_MODE_TRANSITIONS.md` and
   `04_NORMAL_OPERATIONS.md` (vs the now-integrated Mode 5↔1 physics),
   `06_ALARM_RESPONSE.md`, `07_ABNORMAL_EMERGENCY.md`, `08_ACCIDENT_TMI.md`.
2. **Known doc rot to fix:** `Manuals/ISSUES_AND_FINDINGS.md` I-01 says "No cold plant
   state" — stale since the Mode-5 work; re-triage **every** I-## row (fixed? still
   true? ship-relevant?) and update its Status. Same for
   `Manuals/CAMPAIGN_MANUAL_DISCREPANCIES.md`.
3. **Crosswalk refresh** (known open item): `Manuals/11_CAMPAIGN_CROSSWALK.md` still
   maps the old mission set; refresh for the current 34-mission map per
   `Manuals/CAMPAIGN_MODE_ALIGNMENT_SPEC.md` §2–3.
4. **In-product manual:** regen (`node tools/gen_manual_reference.js`), diff, and spot-
   check `ui/manual_data.js` / `ui/manual_procedures.js` in the UI Manual tab. The known
   null `alarm_response.means` rows (I-13) — populate from `06_ALARM_RESPONSE.md` if
   mechanical, else log OPEN.
5. **Top-level docs:** README *Project status* + gate baselines updated to post-review
   truth (fix the 25/25-vs-26/26 class of staleness); CHANGELOG entries for everything
   this review changed; `Blueprint/BUILD_DECISIONS.md` appended (per its format) with
   review outcomes + any new owner rulings.
6. Commit.

## Phase 6 — Campaign & instructor playthrough

`run_campaign.js` proves structure + functional beats; this phase plays the content.

1. **Play through, at minimum:** the tutorial/tour (`pwr_tour`), `pwr_startup_challenge`,
   the Mode-loop trio (`pwr_mode5_to_mode3`, `pwr_mode3_to_mode5`, `pwr_return_to_mode1`),
   the TMI flagship (`pwr_tmi`) and the chat-mode TMI trio (`pwr_tmi2_p1/p2/p3`), and
   `pwr_shift_exam`. Use the instructor/test-runner harness or headless UI; a scripted
   "operator follows the on-screen instructions literally" drive is the standard.
2. **Check per mission:** every beat can be reached and completed by doing only what the
   beat text says (no hidden prerequisite); success/fail detection fires correctly (no
   false passes on inaction); hints and highlights point at controls that exist in the
   UI; chat/dialogue beats advance (story clock, converge idiom); rewind works
   mid-mission; text matches actual plant response (numbers, directions, alarm names —
   *Mode N, Name* string convention).
3. **Instructor edge cases:** abandon + restart a mission; complete out of order where
   allowed; time-acceleration during beats; trip during a beat that doesn't expect it.
4. Fix beat-text/detection bugs found (campaign gate + `run_m6.js` prove it). Commit.

## Phase 7 — Final sweep & ship report

1. **Full battery re-run** — every row of the baseline table; record final tallies in
   the findings log. Everything at ship target; BWR/RBMK at Phase-1 levels.
2. **Adversarial hour:** free-form abuse of the shipped configuration via UI/ops
   harness — command spam, max acceleration through a LOCA, contradictory automation
   modes, save/load mid-transient, rewind during scram. Zero crashes / NaN / stuck UI.
3. **Repo hygiene:** no debug leftovers in shipped files, `inbox/` contents dispositioned
   (ask user — `inbox/Diagram.png` is untracked), stale `Diagnostic/rd_diag_*.json`
   noted, orphaned references removed.
4. **Ship report** (final section of `Diagnostic/PWR_SHIP_REVIEW_2026-07.md`): findings
   table (all FIXED/OPEN/RULING-NEEDED), before/after gate tallies, remaining known
   limitations recommended to ship as-documented, and an explicit **ship / no-ship
   recommendation**. Do **not** merge to `main` — present the report and let the user
   pull the trigger.

---

## Appendix A — Gotchas that have bitten before

- `crossed()` is strict `>`; an instrument clipped exactly at its setpoint can never
  trip (C1 class). Check ranges vs setpoints everywhere.
- Normalized (0–1) vs percent vs absolute in actuation setpoints (the BWR RCIC bug).
- Changing any config value without regenerating the manual reference desyncs the
  in-product manual and `run_procedures.js`.
- The engine suites bypass M4; the ops suites run under it — a fix proven only by
  `run_pwr.js` can still be broken when operated. Always run both.
- Beat authoring: success conditions must read instruments; converge idiom for
  settling values; story-clock beats need the clock actually advanced.
- Heatup is nuclear (RCPs alone can't heat the plant); RCPs-off decouples the SG on
  cooldown; borate before cooling down (Mode-5 work probed facts).
- SBO is unsurvivable by design (campaign dropped the SBO exam); don't "fix" it.
- `run_procedures.js` 20/21: the one FAIL is BWR finding B3 (`bwr_sbo_rcic`) — accepted,
  out of scope.
- Windows/PowerShell: no `&&` chaining in PS 5.1; the Node runners are fine either shell.

## Appendix B — Quick command reference

```
node test/run_pwr.js [name]        # PWR engine suite (26 suites)
node test/run_ops.js pwr [name]    # PWR ops probes (19) — results → Diagnostic/ops_results.json
node test/run_campaign.js          # campaign gate (47)
node test/run_autoctl.js           # automation gate (20)
node test/run_m4.js / m5 / m6 / m6ph / m7
node test/run_procedures.js        # manual-procedure harness (21)
node test/run_scenarios.js         # flagship scenarios
node test/verify_e2e_ui.js         # headless-Edge e2e (PASS/FAIL)
node test/run_e2e_controls.js      # control e2e
node test/audit_manual_controls.js # manual↔UI control audit
node test/verify_manual_follow.js  # manual-follow harness
node tools/gen_manual_reference.js # regen in-product manual reference
node test/run_bwr.js / run_rbmk.js # regression guards only
```
