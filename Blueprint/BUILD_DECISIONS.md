# Reactor⚛️Dynamics — Build Decisions, Deviations & Flags

**Purpose.** A running log of every non-obvious choice made while building the modules:
decisions the spec left to the implementer, deliberate **deviations** from the literal spec
(with the reason), and **open flags** to revisit. The spec files (`CONTEXT.md`, `M1`–`M8`)
remain the source of truth for *intent*; this file records *what was actually built and why*
where the two differ or where judgment was exercised.

**How to maintain (read this before editing).**
- Append, don't rewrite history. When a flag is resolved, move it to the relevant module's
  "Resolved" note rather than deleting it.
- Every entry: a one-line claim, then the *why*. Reference `file:symbol` where it helps.
- Update the **Open Flags** table at the top whenever a flag is opened or closed.
- Keep it skimmable: tables and short bullets, not prose.

**Status:** M1 ✅ · M2 ✅ · M3 ✅ · M4 ✅ · M5 ✅ (+ rewind ring · attention-stops) · M6·PH ✅ · **M6 ✅ steps 1–6 (beat engine · Path 2 follow · TMI flagship · rewind · highlights/F8 · Hook + Training tab)** · M7 ✅ · M8 🟦 functional alpha (PWR) · **all three engines proven — physics layer complete** · **RBMK+BWR now have full balance-of-plant (turbine/condenser/generator + electrical output) for PWR-parity full-scope operation** (RBMK 20/20·129, BWR 10/10·63) · **blueprint reconciled to code — CONTEXT + M1/M2/M3 now describe all built engine/contract additions (BOP, block valve, SLC/LPCS/SRV, reactivity proxies, 50% states); UI/[tune] deviations remain logged below** · (next: Chernobyl/Fukushima flagships + Campaign wrapper, Qualification hints, or extend M8/M4 to RBMK+BWR)

---

## Open Flags (live)

| # | Module | Flag | Severity | Status |
|---|--------|------|----------|--------|
| F1 | M1 | Criticality uses an explicit `rho_excess` + operating-temp references instead of the spec's "set reference temps" mechanism (which yields non-physical refs). Will M2/M3 reuse this pattern? | design | **RESOLVED (M2, confirmed M3)** — yes, all three. M2 trims rho_excess per-state with pinned Doppler/graphite/void refs; M3 (also boron-free) pins Tf_ref/void_ref at full power and trims rho_excess ONCE as a fixed core constant (so post_scram_sbo comes out subcritical). The pattern is now the house style for boron-free criticality. |
| F2 | M1 | `sg_overfeed` failure `override_value: 1.2` is applied to `set_feedwater_flow {pct}` (0–100), so it underfeeds (1.2%) rather than overfeeds (~120%). Untested, not flagship. | data bug | **RESOLVED** — value fixed to 120 (pct-units slip, see `pwr_control.js` comment) and now tested end-to-end: `ops_pwr ops_sg_overfeed_p14` (2026-07-19) drives the failure under M4 to the full P-14 response. |
| F3 | M1/M4 | The M1/M4 seam: command-override failures' persistent effects live in the engine (M1), while interception lives in M4. M4 forwards *and* intercepts. M7 will scrutinize this. | seam | **open** — validate in M7 |
| F4 | M4 | `degraded_hpi` is typed `command_override` but its real effect is an engine HPI-flow multiplier (the spec itself flags this, M4 §7). Implemented via the engine hook. | taxonomy | **open** (spec-acknowledged) |
| F5 | M1 | `fuel_damaged` (cladding failure at 1200 °C) is internal, not in the §6.3 `true_state` contract. Consumers must use `fuel_temp_c`/`melted`. | contract | **open** — confirm M6/M8 don't need it |
| F6 | M5 | Acceleration is realized as fixed-0.02 s step **count**, not by scaling `dt` (CONTEXT §4's literal `dt_effective` diverges — verified). Every engine (M2/M3) must stay stable at 0.02 s; the service never hands them a larger dt. | deviation | **RESOLVED** — all three stable at 0.02 s. M2 fine with explicit Euler. **M3 needed an IMPLICIT prompt term** (its Λ=5e-5 makes explicit Euler unstable at 0.02 s: dt·β/Λ=2.6>2 — see M3 D1); still first-order, so the fixed-0.02 s contract holds for every engine. The service never needs a smaller dt. |
| F7 | M8 | Alarm system-category (left-bar color, M8 §8.5) is derived UI-side by keyword (`alarmCategory()`), because M1's alarm data has no `category`. Should move into the plant profile alongside `tile_label`/`scanner_hint`. | data | **open** — add to engine alarm config |
| F9 | M5/M6·PH/M7 | Integration tests assert `rod_nudge` reaches the engine **instantly** (`210 → 200`), but the engine now does a **rate-limited nudge** (drives a `nudge_target` over sim time — the "rod control reworked" change). The one-step assertion sees `210→210` and fails. **Pre-existing** (reproduces on clean HEAD; unrelated to the BOP work) — the stale check needs to step the sim forward after nudging. | test | **open** — fix the 3 integration tests to run the sim after `rod_nudge` |
| F8 | M8 | Control sections were made a **tabbed strip** (one section shown at a time), a user-directed deviation from M8 §5 ("always visible — not tabs, not collapsible"), to keep the control band skinny. Revisit whether tabbing the controls is acceptable for the real Instructor (M6) flow, where a scenario may need to highlight a control in a non-active tab. | deviation | **RESOLVED (M6)** — highlights auto-reveal hidden controls on both mechanisms: RBMK/BWR `findPdControl()` switches the owning view tab (`app.js`); PWR `RD.PwrSynoptic.revealControl(label)` opens the owning card tab/section via the data-driven `SYN_CONTROL_MAP` (`pwr_synoptic.js`). `verify_manual_follow.js` now checks PWR controls through the same reveal path. |
| F10 | M2/M8 | **RBMK automatic-regulator (AR) rod group** (user-directed): add a third, small-worth (~5–8% of the manual bank, no displacer), fine-step group — the authentic RBMK AR. The Automate rod channel drives IT (fixes the ±4%/step hold granularity); its diagram/control card carries its own AUTO/MAN selector mirroring the Automate channel; disengaging = taking manual control (the pre-Chernobyl condition — scenario beat material). Include AR in ORM; scram drives it in; keep the positive-scram displacer exclusively on the manual bank so the Chernobyl acceptance suite stays green. NO second manual group — the AR under manual override IS the fine manual bank. | planned | **RESOLVED (2026-07-07)** — built as specced (see the dated entry); the Chernobyl AR scenario beat is authored under F11. |
| F12 | M8/test | **`run_e2e_controls` 28/30 — 2 pre-existing reds** (was 3; (c) *AUTO charging converged to match the leak* turned green with the 2026-07-22 P7 retune/SGTR re-anchor). (a) *PZR spray manual set reaches engine* — expects spray ≥45 % at the engine, gets 12; the spray-demand reach drifted. (b) *CVCS auto make-up holds inventory vs leak* — "auto holds ≥98 %" is not physical for a severity-1.0 SGTR (now 0.03 frac/s ≈ 40× CVCS make-up authority); re-baseline to the current trajectory or assert against a small leak the servo *can* match. | test | **open** — spray reach + one stale SGTR expectation |
| F11 | M6 | **Training update for automation**: teach the Automate tab (campaign beats + manual coverage); author `auto_channels` presets on missions/walkthroughs that should focus the player (mechanism landed 2026-07-07, no content uses it yet); revisit strict-gating text where an authored preset runs a system the steps used to have the player run. | planned | **RESOLVED (2026-07-07)** — rbmk_ar + pwr_automation missions, auto_channels presets exercised end-to-end (startScenarioAuto gate harness), Chernobyl AR tie-in. Pre-existing missions deliberately left bare (triggers tuned against bare-plant trajectories). |

---

## Cross-cutting decisions (apply to all modules)

| Topic | Decision | Why |
|-------|----------|-----|
| **Module system** | Global-namespace scripts: each file is an IIFE attaching to `globalThis.RD`. No ES modules, no build step. | User choice. Works under `file://` *and* when served (ES modules break on `file://` in Chrome), and `require()` in Node shares `globalThis`, so the same files run in the test harness with no shim. |
| **Test harnesses** | Both a Node CLI runner (`test/run_*.js`) and a browser page (`test_*.html`). | User choice. Node gives a fast tuning loop I can run directly; the browser page matches the browser-only ethos for the user to confirm. |
| **Units** | SI/MPa internal everywhere, per CONTEXT §11. | User-confirmed. The M1 code snippets had psia residue (see M1 deviations); reconciled to MPa. |
| **Repo** | Commits go directly to `main`, one per module. | Matches the linear, single-developer build (the scaffold was committed to `main`); each module is an independent, test-gated unit. |
| **Load order** | `config → protection → thermal → pressurizer → primary → steam_generator → instruments → engine`, then layers. | The engine captures `RD.pwr*` helper namespaces at IIFE-eval time, so its dependencies must load first. Encoded in `index.html`, `test_pwr.html`, and the Node runners. |

### Boron analyzer UI-removed — chemistry-first boron indication (2026-07-23, owner ruling)

**Claim/ruling.** Online boronometers exist in the industry but are not relied upon; the
concentration of record is chemistry grab samples + dose bookkeeping. Owner: showing a live
analyzer undercuts the sampling lesson — **remove it from the UI, keep the code**. Removal is
display-only and one-line-revertible at each spot (dated comments): board readout spliced +
'ACTUAL'→'CHEM' relabel in `extraItems()` (re-export-safe), synoptic B-row readout/dual dropped,
`app.js` trend series commented (candidate future re-add: stepped `boron_sample` history), and a
new **generic `pvDisplay:false` channel-def flag** hides a channel's pv from the automation
snapshot while the channel keeps reading it — chosen over ripping the analyzer out of the
`boron_conc` def because engage-capture/re-anchor still need an internal "roughly what's in the
loop" source, and because HR1-style instrument failures on the analyzer can still quietly fool
the makeup channel (a good future lesson). The `boron_analyzer` instrument spec, PRNG draw
order, and every save contract are untouched. Manuals 03/04 rewritten chemistry-first.
**Training content deliberately NOT reworked** (owner: Opus later, big overhaul anyway) —
complete worklist at `Diagnostic/TUNING_LOG.md` backlog **S12**.

### Boron chemistry sample — auto-confirm + CHEM SAMPLE button (2026-07-23, owner panel-design ruling)

**Claim.** With batch dosing, the channel's bookkept concentration is exact in normal ops but goes
stale exactly where real books do: external boration (ECCS/accumulators) and freehand Bor/Dil.
Real plants close that gap with the chemistry lab — a sample after every planned change, an
unscheduled one when the books are in doubt. **Decision (owner, AskUserQuestion):** model the lab.
`take_boron_sample` (engine) starts a compressed ~60 s turnaround, then posts the **mixed
(reactive) concentration rounded to 1 ppm** — deterministic; deliberately NOT an instrument-spec
gauss draw, since inserting a PRNG draw would shift every downstream instrument's noise stream
and break save/scenario determinism. Result rides `instruments.boron_sample/_pending/_seq`
(status pass-through). The `conc` channel auto-samples on dose completion (confirmatory
chemistry); a fresh result while idle re-baselines books AND displayed target to the lab number —
chosen over books-only re-anchor because a books-only update would immediately open a dose toward
the stale target (probed during design). Mid-dose results latch without applying (the totalizer
is already metering honest injection). The analyzer keeps its role as the lagged online trend;
the lab is the reference — the real instrument hierarchy, and a second HR1 surface (books vs
boronometer vs lab). UI: board CHEM SAMPLE button + lab readout (EXTRA_ITEMS, box grown in
extraItems()), dose countdown on the status value, synoptic Dose/Chem rows.
Worklog + probe numbers: `Diagnostic/TUNING_LOG.md` 2026-07-23 (chemistry-sample entry).

### Boron batch-dose rework — `conc` channel semantics (2026-07-23, owner "power doesn't follow dilution")

**Claim.** The `boron_conc` channel's closed-loop seek on the boron analyzer was structurally
wrong, not mistuned: the analyzer lags ~45 s, so any seek over-delivers ~rate×lag (probed: a
10 ppm ask injected ~15 ppm and spiked power to ~110 %; 30 ppm scrammed on high flux), while the
±8 ppm deadband swallowed the board's 1 ppm arrow nudges whole. **Decision (owner-approved,
modeled on real makeup panels):** `conc` channels now meter a **feedforward batch dose** — a new
target computes delta vs a **bookkept concentration** (`concBasis`, advanced by the commanded
injection like a real flow totalizer), delivers at `rate` (0.5 → **0.05 ppm/s**, ~2× real-plant
max makeup), and stops on the totalizer, never consulting the analyzer mid-dose. No deadband.
The books re-anchor from the filtered analyzer only when a NEW target finds them stale beyond
`reAnchorPpm` (15 — covers ECCS boration); the dose pauses with the charging pump (the engine's
own injection gate); batch state rides save/rewind (absent in old saves → books = saved target,
no phantom dose). Deliberate consequences: the channel no longer *holds* concentration against
external boration — a spent totalizer won't dilute against ECCS toward a stale target (the old
seek would have); and a failed analyzer now fools it only at dose *computation*, not
execution — matching how real batch ops depend on the flow integrator, not the boronometer.
The at-rated observation that started this ("dilution doesn't change power") is authentic PWR
physics — boron moves Tavg, power follows the turbine — now taught in Manuals 03 §7.5.
Full worklog + probe numbers: `Diagnostic/TUNING_LOG.md` 2026-07-23 (batch-dose entry; S8/S9
resolved, S11 SG-overfill still open).

### Pressurizer setpoint slew + Mode-transition checklists (2026-07-23, owner Mode-5 feel)

**Claim.** `K_heater` (0.55 MPa/s at full demand) is transient-holding authority, not a heatup
rate — but it also served operator setpoint steps, so raising the Mode-5 setpoint 350→600 psi
pressurized in ~3 s. **Decision:** slew the EFFECTIVE control target upward at
`setpoint_pressurize_slew_mpa_s = 0.02` (`pwr_pressurizer.effectiveSetpoint`, state
`s._pressure_sp_eff`, seeded at init/migration — lazily seeding on first step turned a
pre-first-step command into the seed, an instant jump). Three deliberate asymmetries: DOWN is
immediate (depressurization is spray/cooling-limited on its own); the slew binds only the
portion **above current pressure** (a freeze-the-descent setpoint raise must stop the
restore-term pull-down instantly — the first cut voided `ops_sgtr_managed` exactly there); and
heater INDICATION reads vs the commanded setpoint while the dP term uses the slewed one
(`s._heater_dp_frac`) — heaters honestly show flat-out during a pressurization that proceeds at
thermal pace. Disturbance response at fixed setpoint (SGTR plateau) keeps full authority.
Fallout: `pwr_return_to_mode1`'s `arrive_mode1` Tavg gate 298 → 296 (the no-load anchor is ~297;
298 was crossed only by power-spike flicker — razor edge, now matches the 295-ish convention of
the other Mode-5 missions). Also added `pwr_heatup` (Mode 5 → 3 live checklist; dilution-ride
design — one `set_boron_adjust −0.12` = a smooth MTC-self-regulated heatup ramp; rod-chunk trims
spiked 158 % in prototyping) and extended `pwr_startup` to Mode 1 (+`connect_grid` on-line step).
Worklog + probe numbers: `Diagnostic/TUNING_LOG.md` 2026-07-23 (slew entry).

### Fine-step rod drive — PWR `max_steps` 228 → 912 (2026-07-23, owner startup granularity)

**Claim.** The PWR control-bank step quantum was the startup-granularity bottleneck, not the
worth curve: with 8500 pcm over 228 steps, one step ≈ 36 pcm (~5.5 ¢) at the critical band
(probed), so criticality arrived in lurches and one tap at the point of adding heat jumped power
~+4 % settled / ~10 % peak. The already-shipped `rod_worth_curve_flatten = 0.8` was maxed out.
**Decision:** subdivide the drive ×4 — `max_steps` 912 (= 4 × 228, the real ~4-banks-of-travel
equivalent the single lumped bank stands in for), speeds ×4 in steps/s (identical
fraction-of-travel per second), all PWR absolute-step literals ×4 (drivers, procedures,
`rods_tavg` gain 0.4→1.6 / maxStep 2→8, `ROD_RUNAWAY_RATE_MAX` 24), UI tap stays 1 step. Result:
9.0 pcm/step (~1.4 ¢) at the crossing — real bank-D differential worth — with every tuned
evolution numerically unchanged. `loadState` rescales old saves' rod steps by the max_steps ratio
(same fraction of travel → same reactivity). Board `/228` unit suffixes patched to `/912` in
`extraItems()` (re-export-safe; generated `pwr_board_data.js` untouched). Rejected: lowering
`rod_worth_total` (breaks Mode-5→1 heatup reach, at-power authority; only ~2× gain), true
multi-bank overlap (correct long-term shape, large blast radius — stays deferred). RBMK/BWR keep
228 (on hold). Full worklog + probe numbers: `Diagnostic/TUNING_LOG.md` 2026-07-23. Gates: all
PWR gates at baseline (run_pwr 31/31 … e2e 28/30 same F12 reds), rbmk 23/23, bwr 15/15.

### TMI-2 Part 1 — guided hands-on rework + FF/board fixes (2026-07-23, issue #105)

Owner playtest of "The Fog of War" produced GitHub issue #105 (seven items). Decisions taken
(two owner rulings via `AskUserQuestion`, the rest concrete bug fixes):

- **Part 1 is now GUIDED HANDS-ON, reversing the original watch-only design (Spec §4 "No —
  scripted/historical").** Owner ruling: the player must *manipulate the controls*, not just
  watch. Implementation reuses Part 3's `operator_action`/`inaction`/`branches` machinery: the
  supervisor orders the two pivotal historical actions and the player performs them —
  `set_hpi{active:false}` (securing HPI, the mistake) and `close_block_valve` (isolation) —
  each with a supervisor-takes-over `inaction` fallback so the outcome stays historical (core
  damage). The player pulls the trigger; the rails still hold. Part 3 remains the *free-agency*
  act (branching endings); Part 1 is *guided* (fixed ending, player's hands).
- **Phase gating replaces the single watch-only gate.** `watchGate(until, msg)` pushes an
  ack-only gate whose `until` opens the next action window: gate `until TRIG.pzrLevelHigh`
  (opens the secure-HPI window) → `until TRIG.identification` (locks HPI OFF through the
  draindown so the trap can't be undone) → open isolation window → ack-only to the debrief.
  Between gates all plant actions are legal; the gates *are* the rails. The existing campaign
  test "gate blocks plant actions in character" still passes (set_hpi blocked during turnover).
- **Pacing: no scripted fast-forward buttons (owner ruling "smoothly compressed, no skips").**
  The `chat_button:{style:'skip'}` FF buttons are gone; the ~19-min-real draindown runs at an
  authored `beat.speed: 6` that snaps to `1` at each reveal. Historical elapsed-time labels
  (`story_min`, the `time_skip` divider) are kept per Spec §2.2 guardrail.
- **M5 FF-through-transient fix (`simulation_service.js`).** `_attentionStop`'s `'alarm'` clause
  snapped `timeAcceleration` back to 1 on *every* newly-firing alarm — so an authored FF through
  a scripted alarm cascade stuttered to a halt (issue #105 "fast forward keeps dropping out").
  New `this._authoredSpeed` flag (set true when a beat authors `speed>1`, cleared on user
  `set_speed`) suppresses the `'alarm'` snap while an authored FF is active; scram/new-failure
  still hard-stop. `_anyAlarmNewlyFiring` itself is untouched (still drives transient cadence).
- **Board — PORV shows TRUE valve position, not the demand light (`pwr_board_wiring.js`).** The
  `porv` compProps read `IN(s).porv_indicator` (the demand lamp — frozen "closed" by the
  `porv_indicator_stuck_closed` failure), so a stuck-open PORV rendered shut with no discharge
  flow. Now reads `s.true_state.porv_open`: the schematic vents + flows on the real valve state
  while the operator's *indicator* readout stays wrong. HR1 note: the schematic depicts the
  plant; the lie lives in the lamp/numeric indications, which still read "closed". Deliberate,
  owner-directed for the visible physical tell.
- **Board — tailpipe temp legible (`pwr_board_wiring.js`).** The PORV outflow-pipe temperature
  value turns amber (`SR_HANDOFF_COLOR`) above 100 °C; the discharge pipes (`pmrr0wvtu7z`,
  `pmrsi3xy4ch`) and the pzr→PORV inlet (`pmrr0y2b78z`) were added to `PIPE_TEMP` so they track
  live fluid temp instead of a frozen authored value.
- **Board — maintenance tag occludes the valve (`pwr_board.css`).** `.bd-maint-tag` was a badge
  floating 14 px above the tile (`top:-14px`); reworked to a clearance tag centered *over* the
  valve body on a stalk (verified: tag/valve centers coincide at (731,±486)).
- **"Pressurizer never went solid" (#105 #4) was legibility, not physics.** Probe confirmed
  `pzr_level_pct` pegs 100 % (void-insurge term dominates while inventory drains) ~t196–670;
  added an explicit "gone SOLID… with the pumps OFF" callout in `b13_lull2` so the beat lands.

Gates after the pass (all at/above baseline): `run_campaign` 51/51, `run_m5` 19/19, `run_m6`
16/16, `run_autoctl` 20/20, `run_pwr` 31/31, `run_m4` 18/18, `run_m7` OK, `run_procedures`
21/21, board_check 54/0. Interactive + historical Part-1 paths both drive to the core-damage
level_complete headlessly; PORV/tailpipe/tag verified in headless Edge.

### Test-suite review + hardening pass (2026-07-19, Fable)

Full findings: `Diagnostic/TEST_SUITE_REVIEW_2026-07-19.md`; skimmable summary in `CHANGELOG.md`
[Unreleased]. The decisions worth carrying forward:

- **C1 closed with acceptance-first sequencing.** `power_range` `[0,120]→[0,200]` in PWR + BWR
  (the RBMK precedent). The RED test was written before the config fix — the old PWR acceptance
  (`abuse_startup_yank`) had gone dead when the SR trip started catching the yank at 0.02 %.
  Rule reaffirmed: when a finding's acceptance test stops being fail-able, re-point it BEFORE
  fixing, or the fix has no red-to-green evidence.
- **`inject_failure` unknown ids now COMMAND_ERROR (all engines).** The silent no-op is what let
  `eccs_boration` inject the effect-name `primary_leak` and pass vacuously for months. API
  softness that can make a test lie is a bug in the engine, not just the test.
- **Strict expected-fail convention** (`run_procedures` KNOWN_FAILS): a documented tuning target
  reports `✗(known B3)` without reddening the gate, and an XPASS turns the gate RED until the
  annotation is removed. Rationale: a permanently red gate trains people to ignore red — but a
  silent xfail goes stale; strictness keeps both honest. Reuse this pattern elsewhere before
  letting any gate sit red on a known finding.
- **Campaign static validation** (`references resolve` pass in `run_campaign`): every beat
  reference — branch `goto`, instrument/true_state/alarm/command names, direction + `advance`
  vocabulary, `gate.message` shape, `gate` action lists, `inject_failures` ids — is checked
  against live engine/config vocabularies. Command vocabulary is scraped from the dispatchers'
  `case '...'` tokens (over-permissive by design: catches typos, never false-fails). This is the
  guard against the known "beat-authoring gotchas" class.
- **Ops driver realism ruling.** The `pwr_mode3_to_mode5` campaign driver scrammed the plant
  (full spray at 120× crossed P-11 and the lo-press trip inside ONE 30 sim-s broadcast) and the
  mission still completed — mission cards prove the DESTINATION, so transition tests must assert
  `rps_state.scrammed === false` explicitly. Scripted operators at high accel must sequence like
  the procedure: place the P-11 block at the permissive before depressurizing past it (setpoint
  walked 0.5 MPa/sample until blocked).
- **Deliberate red:** the C2 acceptance (`ops_rbmk abuse_accel_latency` "256×: same protection
  outcome as 1×") is knowingly failing — it is the tuning target's hard check, per the ops-suite
  charter.
- **Gates after this pass:** run_pwr **31/31** (191) · run_bwr **15/15** (92) · run_rbmk **23/23**
  (150) · m4 **18/18** · m5 19/19 · m6 16/16 (94, tautologies repaired) · m6ph 8/8 · M7 OK ·
  scenarios 3/3 · autoctl 20/20 · e2e_controls **30/30** · procedures **21/21** (1 known-fail B3)
  · campaign **51/51** · ops **57/67** (all FAILs documented targets incl. the deliberate C2 red).

---

## M1 — PWR Engine

**Files:** `engines/pwr/{pwr_config, pwr_protection, pwr_thermal, pwr_pressurizer, pwr_primary,
pwr_steam_generator, pwr_instruments, pwr_engine}.js`
**Acceptance:** `node test/run_pwr.js` → 11/11 suites, 51/51 checks.

### Deviations from the literal spec (with reason)

| # | Spec said | Built instead | Why |
|---|-----------|---------------|-----|
| D1 | `T_sat(P_MPa) = 179.47·P^0.239 / 145.038 − 273.15` (and redeclares its param) | `T_sat(P_MPa) = 179.47·P^0.239` (°C directly) | The `/145.038` (psi→MPa) and `−273.15` (K→°C) were residue from a psia/Kelvin draft. Dropping both reproduces steam tables to ±2 °C over 5–17 MPa (15.41 MPa → 345 °C). The bare form is correct. |
| D2 | Criticality via "set `T_fuel_ref`/`T_coolant_ref` so feedbacks net to critical" | References pinned **at** the operating temps (Doppler/MTC = 0 there, purely stabilizing on transients) **plus** an explicit `rho_excess` constant that boron is trimmed against | With the given tiny feedback coeffs (α≈−3e−5/K), the pure-reference mechanism needs references hundreds–thousands of K above operating to supply the positive reactivity that balances negative rod/boron/xenon worth — non-physical. The excess-reactivity term is the standard, physical way; same end (critical at HFP, correct power-coefficient sign). **→ Flag F1.** |
| D3 | Fuel source `P·heat_gen_coeff`; coolant input `h_fc·(Tf−Tavg)` (§6.1/6.2) | Fuel source `Q_total·heat_gen_coeff` (fission+decay); both nodes use `h_fc_effective` | Post-scram decay heat must keep the fuel hot (the TMI uncovery heatup), so the source is total heat. Using `h_fc_eff` on both nodes conserves energy through DNB/uncovery (less heat reaches coolant as coupling degrades → fuel accumulates). |
| D4 | PORV "auto-opens at 2350, auto-closes at 2300" (in the engine snippet) | Engine PORV follows **commanded** demand + stuck flag only; the 16.20/15.86 MPa auto-open/reclose live in M4 actuation (and the §14 test emulates the actuation) | HR2: the engine makes no control decisions. The spring **safety** valves (mechanical, 17.13/16.55) stay in the engine — they are physics, not control (HR7). |
| D5 | Bare turbine integrator `rpm += net_torque/inertia·dt` (§6.8) | Grid holds synchronous speed while synced; the free integrator runs only after a turbine trip | The bare integrator drifts off 1800 rpm at steady state; a synchronous generator is grid-locked. The free integrator is retained for coastdown/overspeed after trip. |
| D6 | Several `[tune]` thermal coeffs (`h_sg=0.06`, `latent_heat_secondary=1.0`, `K_void_surge`, the pressurizer K's in mixed units) | Re-derived for energy balance: `h_sg≈0.6`, `latent_heat_secondary≈19.45`, `heat_gen_coeff≈19.45`; PORV relief gain decoupled from mass-loss; `P_restore_rate_gain` dropped to 0.02 | The literal starting values don't balance the steady-state heat equation (heat-in ≫ heat-out) and the pressurizer K's were psia-scaled. These are `[tune]` and arbitrated by §14; retuned until steady state holds and the transients behave. |

### Modeling decisions (spec left open)

- **Two-phase saturation pull** (`K_sat_pull`, `pwr_pressurizer.stepPressure`): once the primary voids,
  pressure is driven toward `P_sat(Tavg)` so subcooling → 0 — the physical truth of a saturated
  system and what makes indicated subcooling erode at TMI.
- **PORV pressure vs mass decoupled:** `K_porv_relief=300` (large — the valve vents the *steam* space,
  big pressure effect) but `porv_flow_max=0.0035` (small — slow inventory loss, TMI-realistic). One
  `porv_flow` term, two gains.
- **Decay heat tracks power continuously** (refined after alpha feedback). The two-term model gained a
  production term toward the equilibrium fraction `H₀·P`, and is **pre-loaded at startup** to that
  equilibrium — so an operating reactor already carries ~7% decay heat (3.5% at 50%, ~0 cold/subcritical),
  and it persists/decays after scram exactly as before (6.85% at 60 s). Replaces the old "switch on only
  at scram" form (which displayed 0% during operation). `Q_total` still embeds decay in `P` during
  operation (rated = total) and adds it as the residual source once scrammed; steady state and the §14
  suite are unchanged.
- **Shutdown-group worth** added (`rod_worth_shutdown=0.10`) — the spec says "sum the shutdown group"
  but gives no worth; chosen for shutdown margin.
- **Initial states** are built by computing the equilibrium temps analytically from the heat balance,
  then **trimming boron to exact criticality** (HFP references captured once on first HFP build).
  `hot_zero_power` is left subcritical by a fixed margin (rods inserted + boron).
- **PRNG:** mulberry32 with a single `uint32` state; Gaussian noise via Box–Muller. The state is part of
  save/restore (CONTEXT §4) — verified bit-exact in the save/restore test.
- **PWR ops-tuning pass — pressure/secondary realism + CVCS level control** (2026-07-19, from the
  `run_ops` PWR probes). Took the PWR ops suite 15/19 → 18/19 (total ops 53 → 56/66) with regression-free
  physics fixes; each also closes a real modeling gap.
  - **Spray floor (P6).** Pressurizer spray tapered to zero as pressure nears **Psat(Thot)** (core-exit
    boiling onset) — spray is cold-leg liquid and cannot condense the bubble below the hottest coolant's
    saturation. `spray_floor_band` 3.0 MPa (a 1.0 band still let the transient undershoot into the
    low-pressure trip; 3.0 tapers early enough to stay hot). `abuse_heater_spray_fight` floors ~8 MPa
    (was 0.1). On a real cooldown Thot falls too, so the floor tracks down — cooldowns unaffected.
  - **Steam-dump capacity cap (P2).** `steam_dump_max` 1.0 → 0.5 and made a **true cap on both the manual
    override and the auto demand** (was bypassed by the override). A full load rejection now lifts the SG
    safeties; slamming the dump open is a rate-limited cooldown, not a Tavg crash.
  - **SGTR leak rescale (P1).** Per-failure `leak_scale: 0.03` on the `sgtr` def (the shared
    `primary_leak` code multiplies it; `large_loca` is unscaled) — a tube rupture drains over ~15 min
    instead of ~30 s. SGTR inventory holds >70 %.
  - **Pressure holds saturation on a violent depressurization (SGTR subcooling).** Two coupled fixes:
    (a) the sat-pull (P → Psat(Tavg)) engages whenever the coolant is **superheated** (Psat(Tavg) > P),
    not only when `primary_void_fraction` is flagged — so a depressurization at full/overfilled inventory
    (HPI overfill) still pins pressure at saturation **without touching the void bookkeeping** (TMI
    void-surge untouched); (b) the subcooled-liquid terms (`K_surge` thermal surge, break depressurize)
    are **suppressed in the saturated regime** — an HPI cold quench dropping Tavg fast no longer crashes
    pressure via a thermal-outsurge term meaningless in two-phase. Subcooling −152 °C (core-loss) → +27.
    A hard `P ≥ Psat(Tavg)` clamp and an ECCS-quench-rate cap were both tried and **reverted** (the clamp
    broke the crafted low-pressure HPI/LPI + RHR states; the rate cap conflicts with the eccs
    cold-injection thermal-shock test). `ops_sgtr_managed`'s EOP was also made faithful to the #1 EOP
    rule — throttle the cooldown/dump to hold subcooling margin, not crash-cool on a full dump.
  - **CVCS charging controls PZR level; AUTO holds level (P3 / feature).** See the "Added" CHANGELOG
    entry — a bounded `(charging − letdown)·K_cvcs_level` insurge term (K=6.0) + AUTO servo
    (`cvcs_charge_per_level` 0.006, `max(level-servo, inventory-makeup)`). Fixes `ops_normal_shutdown`
    (rampdown no longer stalls at 45 % when the pressurizer shrinks below the 30 % hold) and delivers the
    designed CVCS AUTO-holds-level behavior for the coming UI. TMI deception verified intact.
  - **New engine guards:** `cvcs_level_control`, `pressure_saturation_bounds` (run_pwr 26/26 → **28/28**)
    lock in the level-authority/AUTO-hold and the spray-floor/no-superheat behaviors as HARD gates (the
    ops probes are soft tuning targets).
  - **DEFERRED — load-follow Tavg (P4/P5), the 1 remaining PWR ops failure.** Partial-load Tavg settles
    **291.5 °C** at 50 % (need ≥293): Tsec is nearly flat (271→275) while ΔT halves (33→16) with load, so
    Tavg = Tsec + ΔT sags below band. Closing it needs the 50 % SG pressure ~+0.12 MPa higher. A **steam-
    pressure program** (governor trims the valve to defend a load-rising SG pressure) was implemented and
    **reverted**: defending pressure by trimming the load valve starves the turbine (mwe → 0) and trips
    the plant on SG level at every stable gain — it fundamentally fights load delivery. The only other
    lever (recalibrating `h_sg`/`delta_T_rated`/`steam_p_rated`) is pinned to the full-power Tavg=304
    reference and has the widest blast radius in the engine. **Verdict:** not worth a 1.5 °C miss on a
    defensible sliding-Tavg-program point; left as a documented tuning gap, NOT weakened in the test.
- **High-high SG level protection (P-14) + low-low reactor trip moved 12 %→17 %** (2026-07-18, user
  direction): added the SG level ladder's high-side protection. **P-14 at 90 %** fires three coordinated
  control-layer actions: `trip_turbine`, a new `isolate_feedwater` command (latching `feedwater_isolated`
  flag gating MAIN feed in `pwr_steam_generator.stepSecondary`; AFW is added downstream of the gate so it
  keeps feeding), and a **reactor trip** via the P-9 interlock. P-9 is a new `above_p9` status instrument
  (`power_pct > 50`) exposed through the `status` passthrough (`pwr_config`); the reactor trip is a
  `p14_reactor_trip` trip keyed on **`sg_level high 90` + condition `above_p9`** — deliberately **scoped
  to the SG-level cause** rather than a general "any turbine trip → scram" P-9, so MSIV-closure / overspeed
  / vacuum turbine trips still don't scram (a general P-9 broke `pwr_msiv` — the SG stays ~70 % there, so
  the SG-keyed trip spares it while still firing on the SLB swell to ~94 %). New `SG LVL HI HI` critical
  alarm at 88 %. **Low-low SG reactor trip 12 %→17 %** (+ its alarm): more heat-sink margin, sits just
  below the 20 % AFW auto-start (real Westinghouse establishes AFW at ~the low-low signal — its role is the
  post-trip heat sink, not trip prevention, so the small 3 % gap is correct). A steam-line break now trips
  early on the P-14 swell (turbine trip + feed isolation + scram) instead of riding to a late
  low-pzr-level trip — the automatics close the previously-unprotected high-SG-level condition; `pwr_slb`
  passes with the earlier trip. **Full realistic P-9 (all turbine trips cascade) is a logged follow-on**
  — it would require re-authoring `pwr_msiv` around a reactor trip. Gates: run_pwr 26/26, campaign 47/47,
  m4 15/15, m5 19/19, m6 16/16, autoctl 20/20, ops 53/66 (identical fail set — zero regressions).
- **Borated emergency injection** (2026-07-17): emergency-injection water carries boron. HPI/LPI and the
  accumulators deliver at `emergency.eccs_boron_ppm` (2500 ppm — RWST/SIT concentration; real RWST/SIT ≈
  2000–2700), mixed into `boron_ppm` by perfect-mixing transport `dC/dt = q_inj·(C_eccs − C)/m` in
  `pwr_primary.stepInventory` (mixing rate floored at m ≥ 0.05 to bound the update as inventory → 0). So
  ECCS/accumulator injection **raises core boron → negative reactivity** — the shutdown-margin role of
  borated safety injection during a LOCA (previously injection was mass-only; boron was CVCS borate/dilute
  only). Losses leave at the current concentration and cancel in the balance, so only the injection
  inflows shift concentration. CVCS borate/dilute is kept as a separate idealized direct-rate channel
  (`pwr_engine` step 13) — not re-derived from charging concentration — to preserve the tested CVCS
  behavior. **Deliberately not modeled:** boil-off boron concentration (steam carries no boron, so a
  boiling core concentrates its boron) — the lumped loss term does not distinguish boil-off from leakage;
  a refinement if post-LOCA boron-precipitation behavior is ever wanted. Verified: large-break LOCA + SI
  drives boron 747 → ~2050 ppm (≈ −13000 pcm added margin), accumulator-only discharge borates as the
  SITs deplete, no-injection control stays flat, asymptotes to the source with no overshoot. Gates: PWR
  **20/20**, scenarios **3/3**, campaign **47/47**, `run_autoctl` **20/20**, `run_m5` **19/19**, ops
  **53/66** (baseline, no regressions).

- **Break blowdown flash-cooling + realistic accumulator setpoint** (2026-07-17): fixed the break
  depressurization model so `accumulator_trip_mpa` could be restored from the detuned **1.5 MPa** to the
  real B&W CFT / Westinghouse SIT cover-gas pressure **4.14 MPa (600 psi)**. **Root cause (investigation
  in `Diagnostic/PWR_PRESSURE_MODEL_PLAN.md`):** the old model had no term to remove a break's enthalpy,
  so `tavg` pinned near the no-load temperature (~300 °C) for *every* break size — the saturation plateau
  `Psat(tavg) ≈ 8.9 MPa` was fixed, and break size was distinguished only by `K_leak_depressurize`, a
  direct pressure sink that ran *unconditionally* (including two-phase). That forced pressure far below
  `Psat(tavg)` while `tavg` stayed hot — thermodynamically impossible superheat (a 100 % break sat at
  2.38 MPa / 301 °C, Tsat 221 °C) — and, because nothing crossed 1.5 MPa, left the accumulators as
  effectively dead code. The prior "TMI floors ~1.8–2.3 MPa so 4.14 MPa would fire and mask the lesson"
  premise was **stale** (predates the sat-pull / loop-pressure rework): the current flagship TMI damage
  branch holds ~8.8 MPa (1271 psi) the whole way to fuel damage. **Fix — two coupled changes.**
  **(1) Blowdown flash-cooling** (`pwr_thermal.stepCoolant`): coolant leaving a break carries enthalpy
  and the remaining inventory flashes to replace it, so `dTavg += blowdown_gain · leak_flow ·
  (blowdown_sink_c − tavg)` — the same self-limiting mixing form as the ECCS quench, keyed on `leak_flow`
  ONLY (a stuck-open PORV vents the steam space via `K_porv_relief` and leaves `leak_flow=0`, so the
  flagship path is untouched). This makes the plateau *respond to break size*: a small break — decay heat
  dominates the weak cooling, `tavg` holds hot, `Psat(tavg)` pins pressure well above 600 psi; a large
  break — this term dominates, `tavg` falls toward containment, and `Psat(tavg)` (hence pressure, via the
  sat-pull) drops through the ECCS/accumulator band. **(2) Gate `K_leak_depressurize` to the subcooled
  regime** (`pwr_pressurizer.stepPressure`): once `primary_void_fraction > 0`, the direct term is dropped
  so pressure is slaved to `Psat(tavg)` (consistent, no superheat) and the two-phase descent is governed
  by *cooling*. `blowdown_gain` **0.02** [tune] tuned so ≤8 % SGTR holds the plateau (5.9 MPa / 854 psi,
  never arms accumulators) while the 20 % large-LOCA default crosses below 4.14 MPa (3.2 MPa / 462 psi)
  and dumps the accumulators + fires the cold quench; `blowdown_sink_c` **110 °C** (containment
  saturation). **Cold-shutdown lineup:** with the setpoint at 4.14 MPa, the Mode 5 state (2.5 MPa) sits
  *below* the accumulator pressure, so the cold-shutdown builder now **isolates the accumulators**
  (`accumulator_valve_open = false`, the real Mode 5 lineup); `_driveHeatup` re-aligns them once
  pressurized above the setpoint and `_driveCooldown` re-isolates before depressurizing into their band.
  "Below 600 psi" is now the *natural, physical* large-break discriminator (only a break that cools the
  RCS below Tsat(4.14) ≈ 252 °C arms the accumulators), as at TMI-2 where operators had to deliberately
  depressurize to reach CFT pressure. New config: `thermal.blowdown_gain`, `thermal.blowdown_sink_c`.
  Gates: PWR **26/26** (flagship inert to the change), campaign **47/47**, ops **53/66** (identical fail
  set — SGTR/SBO pre-exist), m4 **15/15**, m5 **19/19**, autoctl **20/20**.

- **Accumulator cold-water quench + discharge isolation valve** (2026-07-17): closed two gaps in the
  accumulator model surfaced in review. **(1) Cold-injection thermal quench.** Emergency-injection water
  now carries a *temperature*, not just mass and boron: `pwr_thermal.stepCoolant` pulls `tavg` toward
  `emergency.eccs_temp_c` (40 °C — RWST/SIT ambient) by perfect-mixing, `dTavg += eccs_cooling_gain ·
  q_inj · (eccs_temp_c − tavg)`, where `q_inj` (`s._eccs_inj_inv`, HPI/LPI + accumulators, inventory-
  frac/s) is stashed by `stepInventory` and read one step late (explicit coupling — stepCoolant runs
  before stepInventory). Added as a **direct °C/s term** (already a fractional-throughput × ΔT rate — not
  divided by `coolant_heat_capacity` like the power terms), and **self-limiting** (the mixing form cannot
  cool below `eccs_temp_c`). **RHR is excluded** — it recirculates RCS water (the separate `Q_rhr` term),
  it does not add cold make-up. `eccs_cooling_gain` (0.08, dimensionless [tune]) **decouples the thermal
  coupling from the mass/void tuning**: the raw inventory-frac rates are tuned for the inventory balance,
  so left ungained a full large-break dump would crash `tavg` ~70 °C in a single step; the gain shapes it
  to a dramatic-but-observable ~°C/s quench. **(2) Discharge isolation valve.** The accumulators were
  purely pressure-driven (an implicit check valve) with no way to isolate them — unlike RHR
  (`rhr_valve_open`) or the PORV (`block_valve_open`). Added the motor-operated discharge isolation valve
  `s.accumulator_valve_open` (default aligned/open) with `open_accumulator_valve` / `close_accumulator_valve`
  commands; `stepAccumulators` hard-gates flow on it, so a normal cooldown can depressurize below the
  check-valve setpoint without a spurious dump, and a mispositioned/leaking accumulator can be isolated.
  Migrated on load to *open* (old-save behavior unchanged); exposed in `getTrueState`. **Deliberately left
  as-is:** `accumulator_trip_mpa` stays at 1.5 MPa, **not** the real ~4.14 MPa / 600 psi check-valve
  setpoint — that detune (documented at the config field) reserves accumulator action for a genuine
  large-break LOCA rather than spuriously refilling a small break and masking the TMI inventory/void
  lesson; revisiting it is a separate tuning decision, not part of this change. Verified new `run_pwr`
  guard `eccs_cold_injection`: the quench magnitude matches `eccs_cooling_gain·q_inj·ΔT` exactly, the
  no-injection control stays flat, the self-limit holds at `eccs_temp_c`; the isolation valve blocks
  discharge and boration and preserves the full tank. Gates: PWR **26/26**, campaign **47/47**, ops
  **53/66** (baseline — SGTR/SBO failures pre-exist, no new regressions).

### Notes
- `fuel_damaged` is internal (not a §6.3 field) — **Flag F5**.
- `sg_overfeed` value units look wrong — **Flag F2**.

### Synoptic prerequisites (`develop`) — engine + instruments for the new PWR diagram
Implements `Blueprint/pwr_synoptic_prerequisites.md` so Fable can wire the synoptic from
`snapshot.instruments` + status booleans + `control_state` (no `true_state` on the Realistic board).
- **9 new §8.8 instruments** (lagged): `charging_flow`, `letdown_flow`, `steam_pressure`,
  `boron_analyzer`, `governor_valve`, `lpi_flow`, `accumulator_flow`, `steam_dump_valve`,
  `primary_leak_flow`. New SOURCE keys are **appended** so existing instruments keep their PRNG
  draw order — no perturbation to prior scenario/save-restore values.
- **6 new status booleans** in `instruments.reading` (via `_instrExtras`/`_copyStatus`):
  `afw_active`, `rhr_active`, `lpi_active`, `accumulators_discharging`,
  `condenser_cooling_available`, `safety_relief_active` (= `safety_open || safety_flow>0`).
- **CVCS setpoint vs indication split:** `s.charging_setpoint` (command) is separated from
  `s.charging_flow` (TRUE flow). `control_state.charging_flow_normalized` = setpoint;
  `instruments.charging_flow` ← true `charging_flow_actual` (0 with pump off; AUTO-modulated), so
  indication ≠ setpoint under auto make-up.
- **Governor** (`pwr_steam_generator.stepSecondary`): `governor_valve_pct` tracks load demand
  (first-order, `turbine.governor_tau`) and modulates `steam_flow = (gov/100)·steam_flow_rated·
  (P_sec/P_rated)`. At steady state gov/100 = demand, so rated flow is unchanged — no regression.
- **RHR (was DHR):** `set_rhr {active}` (+ one-release `set_dhr` alias → `rhr_active`); real physics
  in `stepCoolant` — a heat sink toward `rhr_sink_c`, gated on `pressure < rhr_permissive_mpa` +
  condenser cooling (dormant at power). `s.dhr_active` renamed `s.rhr_active`.
- **LPI:** `set_lpi {active}` + injection-vs-pressure curve (`lpiFlowNormalized`); M4 auto-starts on
  low pressure. **Accumulators:** passive, discharge below `accumulator_trip_mpa` with finite
  `accumulator_capacity` that depletes (`accumulator_volume_pct`). Both scale to inventory via
  per-system gains.
- **Break blowdown depressurization** (`pwr_pressurizer.stepPressure`, `K_leak_depressurize`): a
  primary break (`s.leak_flow`) now depressurizes the RCS (previously leaks only bled inventory, per
  the CONTEXT primary-pressure note). This brings **large LOCA into scope** — a large break crashes
  pressure into the ECCS band so LPI + accumulators actuate; the small PORV break (TMI) is unaffected
  (`leak_flow=0` there). **[SUPERSEDED 2026-07-17 — see the "Break blowdown flash-cooling" entry
  above.]** This originally paired with an accumulator setpoint detuned to 1.5 MPa on the premise that
  the model "over-depressurizes a small break (TMI floors ~2.3/1.8 MPa)". That premise became stale after
  the sat-pull / loop-pressure rework — the flagship TMI damage branch actually holds ~8.8 MPa — and
  `K_leak_depressurize` is now gated to the subcooled regime, with break-size discrimination carried by
  the physical blowdown flash-cooling term. `accumulator_trip_mpa` has been restored to the real
  4.14 MPa (600 psi).
- **M4 auto-permissives** added: low-pressure LPI auto-start (2.76 MPa) and RHR auto-align
  (3.45 MPa, gated on `rps_scrammed`). Safe setpoints — never reached in the existing suites.
- Gate green: **PWR 12/12** (TMI not regressed), **M7 31/31 + teeth**, **E2E 25/25** (set_rhr/set_lpi
  + CVCS indication + large-LOCA ECCS), **M4 10/10**; save/restore bit-exact mid-LOCA with LPI +
  accumulators + CVCS-auto active. Contracts synced: CONTEXT §6.3/§6.5/§6.7, M1 §8.8.

### Cold Shutdown (Mode 5) IC + full Mode 5 ↔ Mode 1 transition (2026-07)
Made the manuals' previously-`[narr]` cold heatup/cooldown genuinely `[sim]`. Strategy: **regime-gated
and additive** — the hot/at-power pressure path is byte-for-byte unchanged (all existing scenarios,
TMI included, never enter the cold regime), so every prior gate held at baseline.
- **Pressure control generalized to an operator setpoint.** `s.pressure_setpoint` (default
  `P_setpoint` = NOP) now drives heater/spray auto-control *and* the gentle self-restore
  (`pwr_pressurizer`), replacing the hard-coded restore to `P_equilibrium`. Command
  `set_pressure_setpoint`. Identical behaviour at NOP; lets a cold plant hold low pressure instead of
  snapping to 15.41 MPa (the blocker that made a cold state impossible before).
- **`cold_shutdown` state** (`_buildState` `cold` block, analogous to `at_operating_temp`): Tavg ≈ 50 °C,
  P ≈ 2.5 MPa (below the 2.76 MPa RHR interlock), **RCPs secured** (`flow_frac` 0 → the coolant↔SG
  term vanishes, so the SG can't back-feed and RHR alone holds the sink), RHR aligned, ~0 decay,
  SR on. `_trimToCritical` supplies the high cold-shutdown boron automatically (cold temps set before
  the trim). Holds dead-stable.
- **Secondary cooldown:** `s.steam_dump_setpoint` (default config no-load 8.90) is now operator-lowerable
  (`set_steam_dump_setpoint`), so the dump vents the secondary down and the primary cools through the SG.
- **`set_rcp`** starts/stops the RCPs — the missing control for pump-heat heatup and for securing pumps
  once RHR is in service (the two moves that make heatup and the final cooldown work).
- **Heat source for heatup is nuclear.** RCP/pressurizer heat is realistic (~0.55 % rated) but far too
  slow given the coolant heat capacity; the operator takes the core critical at low power and the
  fission heat drives Tavg to NOP (self-limiting via the temperature defect — a stable, controllable
  ascent). Documented simplification vs. the real pump-heat-dominated heatup. The heatup runs at NOP
  pressure with the turbine **offline** so the SG bottles to no-load; a gentle SUR-limited control-bank
  withdrawal holds ~10 % without a prompt excursion (an aggressive withdrawal damages fuel — the
  interlock/patience matters).
- **Cooldown requires boration** — cooling adds +reactivity via the hot-referenced MTC/Doppler, so the
  round-trip driver borates for margin (real practice), then lowers the secondary, depressurizes
  subcooling-guarded, opens RHR below the interlock, and **secures RCPs** to decouple the SG.
- **Plant MODE indicator** (`plant_mode`/`plant_mode_name`, `plantModeOf`) + `tavg_rate_c_per_hr` added
  to `true_state` (manual 05 §2 classification). New `5_percent` low-power Mode-1 state.
- **Full-stack lineup:** `ControlLayer._initialEsfArms` disarms any ESF whose *activating* auto-actuation
  trigger is already met at init (the depressurized cold lineup → low-pressure SI blocked, the real
  P-11 story), so loading Cold Shutdown no longer floods the core. Neutral for every hot IC (no trigger
  met at NOP) — TMI unaffected.
- Save-compatible: `_migrateState` defaults `pressure_setpoint ← 15.41`, `steam_dump_setpoint ← 8.90`.
- Gate green: **PWR 19/19** (incl. `cold_shutdown_hold`, `steady_five_percent`,
  `mode5_to_mode1_roundtrip`), **M5 18/18** (full-stack cold-IC guard), campaign **44/44**, autoctl
  **20/20**, M4 **15/15**, M6 **16/16**, M7 OK, ops **53/66** (baseline). TMI flagship not regressed.

---

## M2 — RBMK Engine

**Files:** `engines/rbmk/{rbmk_config, rbmk_protection, rbmk_kinetics, rbmk_thermal, rbmk_rods,
rbmk_instruments, rbmk_engine}.js`
**Acceptance:** `node test/run_rbmk.js` → **18/18 suites, 99/99 checks** (both versions). Browser
page `test_rbmk.html`. Load order: `protection → config → kinetics → thermal → rods → instruments
→ engine` (protection before config so `forVersion()` stitches the version protection in; engine
captures `RD.rbmk*` helper namespaces at IIFE-eval, so they precede it).

### Deviations from the literal spec (with reason)

| # | Spec said | Built instead | Why |
|---|-----------|---------------|-----|
| D1 | `ρ_total = ρ_rods + ρ_doppler + ρ_void + ρ_xenon + ρ_graphite` (no excess term); `void_ref = 0.30` fixed | Added a trimmed **`rho_excess`** term; Doppler/graphite refs **pinned at full-power operating temps**; **`void_ref` pinned at each state's operating void** | Reuses the M1 D2 / **Flag F1** pattern (now resolved). The RBMK has no boron — with partially-inserted rods (negative) + equilibrium xenon (negative) and every feedback zero at its reference, nothing sums to critical; an excess term is unavoidable. **Pinning `void_ref` was also load-bearing for stability:** with the spec's fixed 0.30 vs the ~0.04 low-power operating void, ρ_void carries a large *negative* standing offset, and the power-dependent amplification shrinking that offset as power rises is itself a spurious positive feedback — the reactor ran away at `low_power_xenon` with no scram. Pinning makes the amplified coefficient act on the void *change* (the real accident mechanism). |
| D2 | `energy_deposition_scale = 0.42`, `void_response_tau = 2.0`, `α_D = −1.0e−5`, `alpha_void_base` pre `0.005`, `k_disp` pre `0.008` | Retuned: `scale = 4.0`, `void_tau = 1.0`, `α_D = −3.0e−5`, `alpha_void_base` pre `0.0025`, `k_disp` pre `0.05` | All `[tune]`, arbitrated by §19. The literal starting set produced *either* a spontaneous low-power runaway *or* (after the D1 fix) a pre excursion that fizzled at ~16 % and a violently-oscillating full-power flow response. The retune (below) makes pre cross prompt critical and destroy by **steam explosion**, post shut down safely, and full-power maneuvering stable — for both versions. |
| D3 | Internal rod `position` with `position↑ = inserted` (§9/§14.1) **and** contract `position_pct` with `100 = withdrawn` (CONTEXT §6.5) | Internal `steps` = **insertion** (0 withdrawn, max inserted); `getControlState` emits contract `position_pct = 100·(1−steps/max)` and a withdrawn-based `steps` | The two conventions are genuinely opposite (the spec says so). Keeping insertion internally makes ORM (`= inserted fraction · 211`), the displacer depth `z`, and the §14.1 runaway/stall signs all natural; the inversion happens only at the contract boundary. |

### The accident-tuning chain (how pre excurses / post is safe — the heart of M2)

The pre/post divergence comes from **three** levers acting in sequence at `low_power_xenon` (ORM ≈ 7.5, xenon 135 %, EPS bypassed); they were co-tuned until pre destroys and post does not:
1. **Displacer trigger (`k_disp`).** Control rods sit nearly withdrawn (ORM low ⇒ `z ≈ 0.29 m`, inside the 1.25 m water column). On AZ-5 they insert *through* the column; the peak−start Δρ ≈ `k_disp·0.34` must clear β (0.0065) by enough to drive a **hard** prompt spike *before* ORM rises out of the high-amplification band and the rods exit the column (~1.5 s window). `k_disp = 0.05` (pre) / `0` (post) — the functional version difference.
2. **Void sustain (amplified coefficient + faster `void_tau`).** The spike drives void up; the ORM-penalty × low-power × xenon amplification (here ~6× at ORM 12) makes rising void self-reinforcing. `void_tau` cut 2.0→1.0 so void catches the spike before the displacer fades.
3. **Destruction (`energy_deposition_scale`).** The milder (post-stability-retune) excursion peaks ~37 000 % with fuel only ~1070 °C, so the **thermal-melt** path (2800 °C) never fires — destruction must come from the **steam-explosion** EMA. `scale = 4.0` lifts the peak EMA (~384) clear of the 280 threshold while non-accident energy stays ~4 and post stays negligible, so there is no melt/explosion race and post never triggers.
- **Full-power stability** (the opposing constraint): `alpha_void_base` cut 0.005→0.0025 and `α_D` strengthened −1e−5→−3e−5 so a 20 % flow reduction settles ~+3 % instead of oscillating 285 %↔66 %. The accident still excurses because its amplification is ~6× and it is displacer-*triggered*, not base-coefficient-driven.

### Modeling decisions (spec left open)

- **Two rod groups, one carries the accident.** `control_rods` (function `control`, in ORM, version per-rod function incl. the displacer) + `shutdown_rods` (function `shutdown`, **pure absorber both versions**, not in ORM). The displacer/positive-scram effect lives only in the control rods (the historical graphite-tipped manual rods); the AZ emergency rods are clean absorbers — so a full-power scram (control rods already past the water column) is unconditionally safe, while a low-power scram (control rods in the column) triggers the excursion. `rod_count` is a lumped worth-scaling factor (control 1.0, shutdown 0.2), decoupled from the ORM `total_rod_count = 211`.
- **Heat source** mirrors M1: fission embedded in `P` during operation, decay added as the residual once scrammed (`Q_total = P + (scrammed ? H : 0)`) — keeps rated fuel temp right and the post-scram fuel hot.
- **`steam_to_turbine`** is a fixed load (= initial power), not power-tracking — so an excursion outruns the turbine draw and drum pressure rises into the reliefs / `steam_pressure` trip, rather than the load magically absorbing the spike.
- **Coolant temp** is `T_sat(steam_pressure)` (the channel water boils at drum pressure, ~286 °C at 7.0 MPa), feeding fuel/graphite coupling.
- **`MAX_PROMPT_GROWTH`** caps per-step prompt growth (pre 80 / post 5) as the §3 numeric backstop; a `_P ≤ 1e9` clamp and freezing kinetics once `melted` prevent post-destruction NaNs.
- **PRNG / save-restore** identical machinery to M1 (mulberry32, Box–Muller; lag buffers + failures + RNG state saved). Save/restore verified bit-exact mid-`channel_rupture` + mid-stall + instrument-drift, for both versions.
- **Protection is version-specific data** (`forVersion`): pre has 3 trips, post adds the tighter power trip + void trip; ORM alarm setpoint 15 (pre) / 43 (post). No engineered-safety auto-actuation (RBMK is trip-to-scram in v1).
- **`rho_excess` is trimmed PER-STATE** here (each named state, each version, trimmed to ρ=0 at its operating point) — both `full_power` and `low_power_xenon` start critical, which is correct (operators held criticality at low power before AZ-5). This differs from M3, which trims once (the BWR's `post_scram_sbo` must be *subcritical*). The pre/post trims differ because the rod/void terms differ by design.
- **`K_drum_pressure = 0.0207`** — the spec gives two values (§8.3 inline `0.0207`, §20 table `3.0`); took the detailed-section value (the §20 table looks like leftover from a different scaling, same pattern as the BWR's `K_vessel_pressure`). Steady state is insensitive (balanced imbalance → 0); it only sets pressure-transient speed, and the reliefs/trip cap the excursion regardless.
- **Contract addition — `reactivity_pcm`** in `true_state` (= `_rho·1e5`), additive beyond CONTEXT §6.3, mirroring M1's reactivity-computer field. Additive only, so M7's data-contract suite is unaffected; M8/M4 (when extended to RBMK) can surface it as a reactimeter reading, never a board gauge / never fed to protection (HR1).

### Notes / open items
- **F1 resolved** here (see flag table). **F6** confirmed for M2 (stable at 0.02 s).
- The `low_power_xenon` precondition is *metastable*, not a stable equilibrium — it sits at ρ≈0 until perturbed, and a sufficiently large upward nudge (the scram, on pre) runs away. This is faithful to the physics but means scenario scripts (M6) must drive it deliberately; free-running it for very long will eventually drift (xenon burnout).

---

## M3 — BWR Engine

**Files:** `engines/bwr/{bwr_config, bwr_protection, bwr_vessel, bwr_recirculation,
bwr_safety_systems, bwr_instruments, bwr_engine}.js`
**Acceptance:** `node test/run_bwr.js` → **9/9 suites, 47/47 checks**. Browser page
`test_bwr.html`. Load order: `config → protection → vessel → recirculation → safety_systems →
instruments → engine`. The Fukushima flagship runs ~17 h of plant time at 0.02 s (~3 M steps
across its branches) — the whole suite runs in ~10 s.

### Deviations from the literal spec (with reason)

| # | Spec said | Built instead | Why |
|---|-----------|---------------|-----|
| D1 | "No prompt fast-path (standard Euler kinetics throughout)" (§3) | **Implicit (prompt-jump) Euler** for the prompt term: `P=(P+dt·ΣλC)/(1−dt·(ρ−β)/Λ)` | The BWR's Λ=5e-5 makes the prompt mode decay at β/Λ≈130 s⁻¹; **explicit** Euler is unstable at dt=0.02 (dt·β/Λ=2.6>2) — it blows up even at ρ=0, and even the scrammed `post_scram_sbo` diverged. The implicit form is still **first-order** (CONTEXT §11 forbids only *higher*-order methods) and is unconditionally stable for ρ<β — exactly the BWR's envelope (it never reaches prompt critical, §3). **Resolves Flag F6** for M3. |
| D2 | `rho_total = ρ_rods+ρ_doppler+ρ_void+ρ_xenon` (no excess term); `void_ref=0.40` fixed; `K_vessel_pressure` 0.0172 (§6.1) / 2.5 (§19 table) | Added a trimmed **`rho_excess`** (fixed core constant, full-power-critical, no per-state retrim); Tf_ref/void_ref pinned at the full-power operating point; **`K_vessel_pressure=0.5`** | Same F1 boron-free criticality pattern as M1/M2 — but trimmed ONCE (not per-state) so `post_scram_sbo` (rods fully in) comes out genuinely subcritical. The §19 table's `K_vessel_pressure=2.5` made decay-heat steam pressurize so fast it pinned vessel pressure at the relief setpoint and **ADS could never depressurize against it** (the whole intervention branch failed); 0.5 lets ADS win while still giving a sharp turbine-trip transient. |
| D3 | `ads_depressurization_tau=600 s`, `vessel_water_mass=1.0`, `rcic_flow_normalized=0.01` (§19) | `ads_tau=120 s`; `vessel_water_mass=7.0` (rcic stays 0.01) | All `[tune]`, arbitrated by §18. At 600 s ADS stalled ~3 MPa (decay steam out-vented it near the threshold) — a real ADS blows down in minutes, so 120 s. `vessel_water_mass=7` is the knob that sets the **uncovery timeline** (below); rcic_flow then matches early boiloff so RCIC holds. |

### The Fukushima timeline — how the hours-scale story is tuned (the heart of M3)

The §18 flagship is the acceptance centerpiece; the numbers were tuned so the timeline is
*approximately* right (the spec's explicit goal):
- **boiloff = `H_total/(latent·vessel_water_mass)`, gated to `scrammed`.** Gating off at power
  keeps full-power level stable (the normal steam/feedwater balance holds it); after scram it
  becomes the inventory threat. `vessel_water_mass=7` makes early-decay (7 %) boiloff ≈ the RCIC
  flow (0.01), so **RCIC holds the core covered** (level pegs ~100 %) through the grace window.
- **Battery: linear timer, `battery_duration_hours=8`** → at ~8 h depletes → RCIC (and HPCI) lose
  DC control power and stop. Observed: level falls 100 %→20 % in **~3 h** (within the spec's 2–4 h),
  then to 0; fuel then heats (h_fc collapses on uncovery) to the 1200 °C damage onset by ~14 h.
- **Intervention branch:** after RCIC fails, ADS (`trigger_ads`, fast 120 s blowdown) drops vessel
  pressure below the 1.03 MPa LPCI threshold in minutes; LPCI (0.05, large) then refills the
  vessel → **core saved, no damage**. Same start, opposite outcome — the lesson.

### Modeling decisions (spec left open)

- **Engine never auto-starts the safety systems (HR2).** Auto-start (RCIC at level<50, HPCI<30,
  ADS<15 gated `hpci_unavailable`, LPCI gated `ads_open`) is M4 **actuation data** (§13); the
  flagship test emulates it in a `runActuated` helper (as M1's TMI test emulated RPS/PORV). The
  engine computes only the running EFFECTS and the physical stop-limits (steam-pressure cutoff,
  battery depletion).
- **`K_vessel_pressure`-driven decay steam** sets vessel pressure post-scram; relief at 7.58 MPa
  holds it there (SRVs cycling), which keeps RCIC's steam drive available — until ADS or a stuck
  SRV pulls it down (and below `rcic_min_pressure` RCIC stops on its own, the §13.1 lesson).
- **Recirc drive flow RAMPS toward the setpoint** (`tau_recirc=8 s`, pump inertia). An instantaneous
  flow jump swung the void hard enough to push ρ→β in one step (numerically violent, physically
  wrong); the ramp keeps flow maneuvering gradual. The BWR's flow→power coupling is genuinely
  strong (it IS the control mechanism), so a full-range flow push moves power a lot — the test
  asserts it *settles*, not a magnitude.
- **Core-uncovery heat-transfer collapse:** below `uncover_level_pct=20`, `h_fc` fades as
  `level²` toward a near-zero floor (`0.00005`), so once the core is uncovered decay heat
  accumulates and fuel heats to damage — the only path the BWR reaches fuel damage (no prompt
  excursion).
- **Rods** are bottom-entry but use the standard contract convention (steps=withdrawn, SCRUVE
  worth) like the PWR — only the 3 s fast hydraulic scram differs. PRNG / save-restore machinery
  identical to M1/M2; save/restore verified bit-exact mid-blackout with `srv_stuck_open` +
  degraded battery + an instrument drift.
- **`full_blackout_bwr` also closes the MSIV** (sets `steam_flow=0`, `turbine_blocked`) — a
  deliberate addition beyond the spec's "drop AC: lose recirc + main feedwater" (§13). Without it,
  after scram the turbine kept drawing steam while the core only made decay steam, so vessel
  pressure *crashed* below `rcic_min_pressure` and RCIC couldn't run. MSIV closure on loss of power
  is real plant behavior and is what lets decay steam build pressure to keep RCIC's drive alive.
  (`post_scram_sbo` already starts steam-isolated; this fixes the *injected* SBO path.)
- **Recirc operating point + command band.** Full-power recirc setpoint is **40 %** drive (not
  100): the 2.5× jet-pump multiplier makes core flow ≈ 100 % there (void ≈ 0.45). Because core flow
  caps at 120 %, `set_recirc_flow` is **clamped to 0–48 %** (drive above 48 % is wasted) — the
  operator's usable recirc band.
- **Contract addition — `reactivity_pcm`** in `true_state` (additive, like M1/M2). **`mwe_rated`
  (1100 MWe)** added to config so `set_turbine_load {mwe}` maps to a steam fraction (`mwe/mwe_rated`).
- **Vessel-pressure steam source = `Q_total`** (fission + decay), so a scrammed core still boils
  (decay) and pressurizes into the reliefs — the same `Q_total` that gates boiloff, kept consistent.

### Notes
- **F1 confirmed, F6 resolved** here (see flag table).
- The actuation-gate status readings (`ads_open`, `hpci_unavailable`) are surfaced for M4's
  `evaluateCondition`; the `actuation_gates` test exercises the gate logic engine-side (ADS gated
  on hpci_unavailable, LPCI on ads_open, and `ads_failure` blocking the chain).

---

## M4 — Control & Failure Layer

**File:** `layers/control_failure_layer.js`
**Validation:** integration smoke test `node test/run_m4.js` → 11/11 suites, 37/37 checks
(a **dev** check; full validation is M7's job, per M4 §2).

### Decisions & deviations

| # | Topic | Decision | Why |
|---|-------|----------|-----|
| C1 | **M1/M4 seam** | M4 **forwards** every `inject_failure`/`clear_failure` to the engine **and** holds command-override failures to intercept commands in flight | M1 implements each failure's *persistent state* in the engine (the "hooks", M1 §9) — e.g. `loss_of_feedwater` must stop feedwater whether or not a command is sent, which per-command interception alone can't do. M4 still intercepts (transform/block, incl. the plant's own auto-actuation/scram commands). Complementary, never contradictory. **→ Flag F3.** |
| C2 | **`__true_flow__` trip** | Reads `engine.getTrueState().pump_flow_pct / 100` | M1's `true_state` exposes `pump_flow_pct`, not the `flow_frac` named in M4 §3; same quantity, /100. The one documented HR1 exception. |
| C3 | **`last_trip_reason`** | Stored as `"<instrument> <direction>"` (e.g. `"sg_level low"`) | CONTEXT §6.2 types it `string`; a terse, human-readable descriptor. |
| C4 | **lo/lo_lo escalation** | A low alarm with a less-extreme low sibling on the same instrument fires only when the sibling's condition also holds | Implements M4 §5. Auto-satisfied by threshold ordering, but the guard is explicit for robustness. |
| C5 | **Alarm snapshot list** | Every alarm is emitted each cycle with its current `state` (including `clear`) | The UI annunciator (M8) is a fixed tile set; it needs all tiles, lit by `state`/`priority`. |
| C6 | **`evaluateCondition` default** | Unknown gate conditions evaluate **true** (permissive) | The PWR uses no actuation gate conditions; the evaluator is built generic for the BWR's `ads_open`/`hpci_unavailable` (M3). |
| C7 | **Failure `category`** | Added a `category` field to the PWR failure **data** (`pwr_protection.js`) | M4 §10's catalog needs `category ∈ reactivity\|coolant\|power\|instrument\|safety_system`; per HR3 it is plant data, so it lives in the engine config, not in M4. |
| C8 | **`degraded_hpi`** | Routed to the engine's `hpi_flow_multiplier` hook; its `set_hpi` interception is a pass-through | The spec (M4 §7) flags it as "really physics_parameter". **→ Flag F4.** |
| C9 | **Interlocks (§4b, added with the PWR startup-forgiveness pass)** | New config-driven machinery: `config.interlocks[]` — condition-latched command blocks with hysteresis (`setpoint` engages + optional `on_engage` command, `clears_below/above` disengages), reading INSTRUMENTS (HR1). `withdrawal_only` blocks outward rod motion but never insertion. Blocked commands return `{type:'blocked', code:'INTERLOCK', message}` (register-aware). State in save/restore. | Real plants have rod stops / withdrawal inhibits that are neither trips nor failures — the plant refusing an unsafe command while telling you why. PWR instance: rod-withdrawal block at SUR ≥ 2.5 DPM (clears < 1.5), the guard that keeps a hasty trainee out of prompt-critical territory. Pure data per HR3. |
| C10 | **Actuation `reset_below` comparison fixed** | Reset fires when the value returns to the SAFE side (`< reset_below` for high-direction, `>` for low) | Was inverted (`value > reset_below`): the PORV auto-actuation fired open and "reset" (close) in the same evaluate, flapping every cycle while pressure stayed high. Masked in practice (nothing reached 16.2 MPa in normal ops; TMI's stick intercepts the closes) — exposed when the steam-dump rework let a turbine trip actually reach the PORV band. |

---

## M5 — Simulation Service & Runtime

**File:** `layers/simulation_service.js`
**Validation:** integration smoke test `node test/run_m5.js` → 12/12 suites, 35/35 checks
(a **dev** check driving the full PWR stack; full validation is M7's job).

### Deviations from the literal spec (with reason)

| # | Spec said | Built instead | Why |
|---|-----------|---------------|-----|
| D1 | Engine handed `dt_effective = 0.02·time_acceleration`; loop runs a fixed step count of that dt (§3) | Engine always stepped at **fixed 0.02 s**; acceleration = **more steps per broadcast** | M1's Euler kinetics is only stable at 0.02 s and diverges at large dt (verified: 60× → dt 1.2 s blows up to 1e6 %). Step-count acceleration keeps every step stable and deterministic; at 1× it is identical to the spec (25 steps × 0.02 s / 500 ms). **→ Flag F6** (binds M2/M3). |
| D2 | `stepsPerBroadcast = broadcastInterval / PHYSICS_DT` (§3) | `round(accel · (broadcastMs/1000) / 0.02)` | The literal formula is dimensionally off (500 ms / 0.02 s = 25000, not 25); converted ms→s and folded acceleration into the count per D1. |

### Modeling decisions (spec left open)

- **Default pass-through Instructor** built into M5 (`DefaultInstructor`) as the slot's default occupant
  so the stack runs and is testable **before M6·PH lands**. It forwards commands to M4, runs no beats,
  emits `{message:null}`, tracks the register. M6·PH/M6 replace it via `opts.instructor` with no change
  to M5. (This is *not* M6·PH — that's a separate module/file.)
- **`set_register` dispatch:** the service sends it directly to **both** the Instructor and M4 (each
  consumes it; neither forwards it onward), and records `activeRegister` for the UI — per §5.
- **Save/restore split:** `saveState()` returns the state object and `loadState(state)` consumes one;
  the browser file-API wrappers (download / `<input type=file>`) are deferred to M8. Keeps the core
  logic deterministic and headless-testable (and is what M7 drives).
- **Loop mechanism:** a self-rescheduling `setTimeout` (so a cadence change applies on the next tick),
  with `tick()` / `advanceCycles(n)` exposed for synchronous, timer-free, deterministic test driving.
- **Transient detection** uses the plant's primary pressure field via a `primaryPressure()` helper
  (`pressure_mpa` / `steam_pressure_mpa` / `vessel_pressure_mpa`), per §7's "pressure_like".

### Fast-forward attention stops (2026-07-17) — auto-decelerate to real time on an operator event

- **What.** Time acceleration now auto-snaps back to **1×** on the broadcast where a plant event the
  operator must address first appears: **SCRAM** (`rps_state.scrammed` OR manual `true_state.scrammed`,
  edge-triggered), a **newly present `active_failures` id**, or a **newly annunciating alarm**
  (reuses `_anyAlarmNewlyFiring`). `_attentionStop(snap)` returns the
  first matching reason; `_assembleWithInstructor` snaps `timeAcceleration=1` and stamps
  `metadata.speed_snap = { reason }` on that same snapshot. The M8 UI toasts the reason (`app.js`
  `SPEED_SNAP_MSG`); the FF badge/speed-seg already mirror `time_acceleration`, so they self-clear.
- **NOT rapid change (2026-07-17).** A raw power/pressure excursion (`_isRapidChange`, the §7
  transient-cadence signal) is deliberately **excluded** from `_attentionStop`. It fires on any
  *commanded* maneuver — an operator or auto-channel power ramp — which is expected change, not an
  attention event; snapping to 1× on it would make fast-forwarding through a startup/load ramp
  impossible (and stalled every auto maneuver in `run_autoctl`). An excursion that genuinely warrants
  attention already annunciates an alarm, which the alarm trigger catches. `_isRapidChange` stays as
  the transient-broadcast-cadence signal only. `run_autoctl`'s headless probes re-assert their
  intended speed each cycle (the attention-stop is a UI speed policy, orthogonal to automation
  correctness). `run_autoctl` **20/20**.
- **Why here (not M4).** Time acceleration is a property of the sim driver, not the plant — CONTEXT
  treats `wall_time` as display-only, never physics. M4 sits *below* M5 and has no time concept
  (its only "speed" is rod drive rate); for it to set the clock would invert the command-down /
  snapshot-up contract (HR5). M5 is the only layer that both reads the assembled snapshot and owns
  the clock. So the state stays in M5 and the auto-decelerate lives in M5.
- **Ordering.** Applied *after* `_serviceInstructorRequests()` (so a beat's `speed` request has already
  landed) but *before* `metadata.time_acceleration` is stamped — a real trip/failure therefore
  overrides an authored fast-forward, and the snapshot carrying the event already reads 1× (no
  one-broadcast lag). It only ever decelerates, and only while accel > 1, so it never fights a paused
  or already-real-time clock.
- **Edge detection.** `_prevScrammed` / `_prevFailureIds` are captured in `_updateCadence` alongside
  `_prevTrueState`/`_prevAlarms`, and cleared to their null/false baseline on every reset path
  (`constructor` / `selectPlant` / `loadState`) so a fresh plant or just-loaded save never reads as an
  event on its first broadcast.
- **Authored *soft* stops stay content.** Pausing just before an operator action during a mode change
  is still a beat with `speed: 1` (the device documented at `instructor_layer.js` `_speedRequested`) —
  no engine change; this feature covers only the *unauthored* hard events.
- **Gate.** New `run_m5` suite "Attention stop …" (scram, failure, and the accel-must-be->1 guard);
  `run_m5` **19/19**, `run_autoctl` **20/20**.

### Loop pressure distribution (2026-07-17) — three primary-loop pressure nodes, one bubble state

- **What.** `pwr_primary.computeNodePressures(s, cfg)` writes three node pressures onto the engine
  state each step: `p_hotleg = pressure_mpa` (the pressurizer/surge-line reference), `p_pumpsuction
  = pressure_mpa − loop_dp_sg_rated·ff²` (between SG and RCP, the lowest node), and `p_coldleg =
  pressure_mpa + loop_dp_core_rated·ff²` (RCP→RX pump discharge, the highest node). Two new
  `primary.*` config constants (0.30 / 0.25 MPa at rated) set the offsets; the implied pump head is
  their sum (~0.55 MPa ≈ 80 psi). Called from `engine.step` right after `stepPressure` (step 7b, so
  injection reads it in step 9) and from `_buildState` (so `getTrueState` is valid pre-first-step).
- **Why NOT independent dynamic states.** The RCS is incompressible liquid everywhere except the
  pressurizer bubble, so it has exactly ONE thermodynamic pressure state (the bubble) plus a
  quasi-static ΔP field — pump head vs. form loss, both ∝ `flow_frac²`. Three separately-integrated
  pressures would invent compliance the water doesn't have and be numerically stiff (acoustic/
  hydraulic transients at tiny dt). Pure algebra over `pressure_mpa`/`flow_frac` is the honest,
  cheap reduction; the spread collapses to zero as the RCPs coast down.
- **Re-pointed systems.** ECCS injection (`injectionFlowInv`) and passive accumulators
  (`stepAccumulators`) discharge into the COLD leg, so they now work against `p_coldleg` — higher
  than `pressure_mpa` at power (slightly less injection), converging on it as a LOCA trips the pumps
  (where injection matters most, so the flagship is barely perturbed). RHR suction is the HOT leg,
  which equals `pressure_mpa`, so its 2.76 MPa interlock is unchanged. Spray already scaled with
  `flow_frac` (its ΔP is the cold-leg-to-pressurizer head) — left as is.
- **Contract / instruments.** Node pressures are additive true-state fields (migrate cleanly; seeded
  in `_migrateState`). The single `primary_pressure` instrument still reads `pressure_mpa` — real
  plants have one wide-range RCS gauge, not three, so the nodes are internal truth the tied-in
  systems consume, not new indicators (HR1 preserved; PRNG order untouched).
- **Gate.** PWR engine **19/19** (the merged-injection §14 test now reads the actual `p_coldleg`),
  campaign **47/47**, `run_m5` **19/19**, `run_m4` **15/15**, `run_ops` 53/66 (baseline), autoctl
  **20/20**, `verify_e2e_ui` PASS. Enables the two-orifice letdown model and RCP cavitation (suction
  node) that follow.

### Two-orifice letdown (2026-07-17) — pressure-driven CVCS letdown, four-state orifice lineup

- **What.** Letdown was a commanded normalized constant (`set_letdown_flow`); it is now **two fixed
  orifices**, each independently in/out — four states (off / A / B / A+B) via `set_letdown_orifices
  {a, b}` (each field optional, so a toggle preserves the other orifice). `pwr_primary.letdownFlow`
  computes the TRUE flow each step: `Σ Cᵢ·√(max(0, p_coldleg − letdown_backpressure_mpa))` over the
  in-service orifices. `s.letdown_flow` becomes that computed value (the `letdown_flow` instrument
  still reads it — SOURCE map unchanged, PRNG order intact); it is no longer a set field.
- **Why pressure-driven / backpressure = 2.4 MPa.** Real letdown is an orifice bleed from the cold
  leg to the letdown HX / VCT; the downstream backpressure-control valve holds ~2.4 MPa (350 psig,
  Westinghouse) to keep the letdown coolant subcooled. So flow ∝ √ΔP across the orifice and **tails
  off as RCS pressure approaches 2.4 MPa on a cooldown** — the honest behavior (you lose letdown
  driving head at low RCS pressure), not a throttled constant. Reads the cold-leg node from the
  loop-pressure rework (letdown taps the cold leg).
- **Calibration.** `letdown_orifice_a_coeff` 0.00822, `b` 0.01096 (normalized flow per √MPa), sized so
  at NOP (`p_coldleg` ≈ 15.71): A ≈ 0.030 (normal letdown), B ≈ 0.040, A+B ≈ 0.070 — A+B exceeds
  `charging_max` 0.06 (a net drain for level reduction / depressurization). [tune]
- **Compat.** `set_letdown_flow {normalized}` kept as a **deprecated alias** — maps the requested flow
  to the nearest orifice lineup by NOP-flow (off/A/B/A+B), like the `set_dhr`/`set_lpi` precedents.
  `_migrateState` derives the orifice lineup from an old save's `letdown_flow` (A above 0.015, B above
  0.050) so intent carries; the flow is then recomputed pressure-driven. All first-party callers
  (§14 `_pzrTrim`, `run_campaign` cooldown, `ops_pwr`, `run_e2e_controls`, the synoptic UI) updated to
  the orifice command.
- **UI.** The synoptic CVCS panel's letdown setpoint box is replaced by two orifice toggles (A / B,
  each In/Out) with state sync; the manual control renames "Letdown Valve (CVCS)" →
  "Letdown Orifices (CVCS)" (`manual_data.js`, `manual_ui_map.js`, the synoptic highlight map, and
  `Manuals/03` §7.3 all updated together; `audit_manual_controls` green).
- **Gate.** PWR **19/19** (Mode 5↔1 roundtrip + save/restore green with orifice letdown), campaign
  **47/47**, `run_m5` **19/19**, `run_m4` **15/15**, `run_e2e_controls` 27/28 (recorded then as "the
  blowdown gap", but the 2026-07-19 review found the failing check had silently CHANGED identity —
  the accumulator check passed after 096f574 and the CVCS charging check went stale after e28f7b0's
  leak rescale; both repaired 2026-07-19, suite 30/30), `run_ops` 53/66 (baseline), autoctl
  **20/20**, synoptic **55/55**, `verify_e2e_ui` PASS.
  Functional headless drive: clicking orifice A/B in the shell moves the letdown indication (0 → ~2 →
  ~5 % as A then B come in).

### RCP cavitation (2026-07-17) — suction-node voiding degrades pump flow

- **What.** `pwr_primary.stepCavitation(s, cfg)` computes `suction_subcool_c = Tsat(p_pumpsuction) −
  tcold` — the NPSH-like margin at the lowest-pressure node — and a severity `rcp_cavitation_frac =
  clip((cavitation_onset_c − suction_subcool_c)/cavitation_band_c, 0, 1)`, gated on `pump_running`.
  `stepFlow` then drops the delivered-flow target to `1 − cavitation_flow_loss·severity`, so a fully
  cavitating pump settles near 30 % flow. A boolean `rcp_cavitating` (severity > 0.05) drives a new
  panel-B **RCP CAVITATION** alarm and the synoptic RCP "CAVITATING" readout. Called at step 7c (after
  `computeNodePressures`, before `stepFlow` at 10).
- **Why the suction node / tcold.** The pump suction (between SG and RCP) is the lowest-pressure node
  and carries post-SG cold-leg-temperature water, so it reaches saturation first as the RCS voids or
  depressurizes — the real cavitation datum. Deliberately separate from the bulk `subcooling_margin`
  instrument (the TMI deception): cavitation is its own suction-referenced quantity, so it can't perturb
  the calibrated flagship signal.
- **Feedback is mild & stable.** severity ← p_pumpsuction ← flow_frac ← severity is closed with the
  engine's one-step explicit coupling. When flow collapses, `loop_dp_sg·ff²` shrinks and p_pumpsuction
  rises ~0.2 MPa (≈2 °C of Tsat) — small against the 8 °C band, so no oscillation; the loop settles.
- **Full mechanical effect from the start (owner ruling).** Cavitation degrades flow immediately, not
  indication-only. The TMI flagship stays green (PWR 19→**20/20**): the deception is inventory/void-
  driven (pzr sat-pull, void-surge), not flow-driven, so the flow collapse rides alongside without
  corrupting it. Probed: in the stuck-PORV damage branch the suction margin goes to ≈ −1.5 °C, severity
  → 1.0, flow 100 % → 30 % as inventory uncovers — making the scenarios' narrated "RCP cavitation noise
  developing" (`pwr_tmi2_p1/p3`) physics-driven for the first time.
- **Surfacing.** New true-state fields `suction_subcool_c` / `rcp_cavitation_frac` / `rcp_cavitating`;
  `rcp_cavitating` added to the instrument status set (HR1 status booleans) and driven as the new alarm
  and synoptic RCP state. Additive fields migrate cleanly.
- **Gate.** New §14 test `rcp_cavitation` (no cavitation at steady power → depressurize → cavitates +
  flow degrades → pump-off gating). PWR **20/20**, campaign **47/47**, `run_m4` **15/15** (alarm added),
  `run_m5` **19/19**, `run_m6` **16/16**, `run_ops` 53/66 (baseline), autoctl **20/20**, synoptic
  **55/55**, `verify_e2e_ui` PASS. (`run_procedures` 20/21 — the failing `bwr_sbo_rcic` is a pre-existing
  BWR gap, unrelated.)

## M6·PH — Placeholder Instructor

**File:** `layers/instructor_layer.js`
**Validation:** `node test/run_m6ph.js` → 8/8 suites, 18/18 checks.

A transparent pass-through occupying the Instructor slot (free-play): forwards commands straight
down to M4 (no gating), runs no beats, emits `{message:null}`, tracks the register. Implements the
exact interface the real M6 will, so M6 replaces this file's internals with no change to M4/M5/M7/M8.

### Decisions

- **`setRegister(value)` interface (vs routing `set_register` through `handleCommand`).** Per the
  M6·PH §3 interface, M5 dispatches the register via `instructor.setRegister(value)` and separately to
  M4. M5 was updated to this (it previously sent `set_register` through the instructor's
  `handleCommand`). `handleCommand` is now purely transparent.
- **M5's slot resolution:** injected instructor → else `RD.InstructorLayer` (M6·PH) if loaded → else
  M5's built-in `DefaultInstructor` fallback. The fallback now mirrors M6·PH exactly and exists only so
  M5 has zero hard dependency on the slot implementation (the swap-invariant test confirms identical
  free-play either way). Load order: `instructor_layer.js` before `simulation_service.js`.
- **`connect(layer)` added** to the instructor (beyond the spec's constructor-injection) so M5 can
  re-point the slot at the rebuilt M4 on a plant change without reconstructing scenario state.

## M6 — Instructor Layer (real) + Training UI

**Files:** `layers/instructor_layer.js` (the engine, replacing M6·PH's internals in place) ·
`scenarios/pwr_tmi.js`, `scenarios/pwr_hook.js` (authored content, `RD.SCENARIOS` registry) ·
M5 additions (`layers/simulation_service.js`) · UI (`ui/app.js`, `ui/shell.html`, `ui/shell.css`,
`ui/diagram/pwr_synoptic.js`).
**Validation:** `node test/run_m6.js` → 16/16 (beat engine, triggers, gating, branching, follow,
grading, save/restore, swap invariant) · `node test/run_scenarios.js` → 3/3 (TMI both branches,
Hook incl. world rewind) · `run_m6ph.js` **unmodified** 8/8 · `run_m5.js` 15/15 (12 original + 3
rewind) · procedures 21/21 · `verify_manual_follow.js` 81 checks · M7/M4/engine suites green.

### Decisions

- **Scenario lifecycle = M5 control-plane commands + registry.** `start_scenario {scenario_id}`
  resolves `RD.SCENARIOS[id]`, resets the plant to the scenario's `(plant_id, initial_state,
  design_version)`, then `instructor.load(sc)`. `stop_scenario`/`stop_follow` unload and clear the
  rewind ring. A plain `reset` (selectPlant) also unloads — stale progress can't outlive its plant.
  Instructor `saveState()` stores content **ids** only; `loadState` re-resolves from the registries
  and degrades to free-play with a console warning if missing.
- **Path 2 = a follow-runner mode on the same engine object** (procedures are NOT converted to
  beats — one artifact, per Gameplay §4.1). `start_follow {procedure_id}`: M5 maps active
  plant+design → profile key (`pwr|rbmk_pre|rbmk_post|bwr`) and hands the procedure to
  `loadProcedure`. Auto-advance when `(no cmd || cmdSeen) && (no saw || sawSeen) && (no acc ||
  accMetNow)`; observation steps wait for manual Next; `saw` is latched live (previously never
  evaluated in the UI). **Acceptance debounce:** acc must hold for 5 consecutive broadcasts so a
  parameter sweeping through its band doesn't advance the step in passing.
- **Strict gating (user decision) with a distinct return shape.** Off-script commands in a follow
  are blocked with `{type:'blocked', code:'GATED_BY_INSTRUCTOR', message}` (distinguishable from
  M4's `null`/error) + two-register wrong-action commentary (generic template; per-step `wrong`
  override supported). Allowed set = step's command family (rod steps allow the whole
  `rod_nudge/rod_start/rod_stop/rod_stop_all` family; `inject_failure` only with matching id) + a
  safety set (`scram`, `manual_scram`, alarm acks). Scenario beat gates additionally support
  `allow_actions` (allow-list) alongside the spec's `block_actions` — the Hook needs "everything
  but SCRAM".
- **Instrument-first grading (HR1) with the documented fallback.** `PARAM_INSTRUMENT` map in
  `instructor_layer.js` (param → instrument id per plant, verified against each engine's
  instrument set); params with no twin (`core_inventory_pct`, `melted`, …) grade on `true_state`
  per Gameplay §6's exception, reported as `graded_by` in the snapshot. The map is data (HR3);
  extract to engine configs if it grows.
- **Rewind ring lives in M5; the instructor requests via consume-flags** (no upward callbacks —
  M5 polls `consumeCheckpointRequest()`/`consumeRewindRequest()` after `step()`). Checkpoints =
  full `saveState()` (bit-exact: PRNG + lag buffers), pushed on scenario load / beat fire /
  follow-step auto-advance, cap 32. `rewind {steps, scope}`: **full** restores instructor progress
  too (retry — decision beats re-arm); **world** restores the plant only (the teacher remembers —
  the Hook's narrated rewind; beat field `rewind:{steps}`), with `rebaseTime()` clamping trigger
  anchors after time moves backward. Repeated Rewind presses walk back one boundary each (a target
  equal to "now" skips one further). A beat that carries `rewind` does not also checkpoint (keeps
  the author's step arithmetic sane). `loadState` (user file load) clears the ring.
- **Snapshot extensions via `getSnapshotBlock()`** with an M5 fallback to `getMessage()` (mocks &
  the DefaultInstructor keep working). Fixed shape, keys always present, null when inactive:
  `message, message_register, ui_policy, highlight, follow, level_complete`. Follow mode derives
  `highlight` from the step's `control` label. `ui_policy` v1 carries `{register, highlights}`
  only (layout/hint_level deferred with Qualification).
- **Beat-schema additions over M6 §4** (all additive): `gate.allow_actions`, `advance:'end'`
  (branch endpoints must not fall through into the other branch's beats — beats are one flat
  list), `highlight`, `level_complete {title, outcome_learning/industry, actions}`, `rewind
  {steps}`, `speed` (instructor-driven time acceleration — see the dedicated bullet below).
  `instructor_continue` is an instructor-internal command (consumed, never descends) — the Next
  button doubles as the spec's `manual`-trigger Continue.
- **TMI authoring vs the physics (the honest compromises).** (1) The engine's own flagship suite
  never verifies its `runUntil(P≥16.20)` (silently times out) and **commands** the PORV open — the
  lumped physics does not produce the brief post-trip pressure spike (AFW auto-start and the steam
  dump correctly hold the heat sink). The scenario does the same play: `porv_sticks` fires on
  `delay 10` post-trip and the `stuck_porv_open` injection itself opens-and-holds the valve
  (pressurizer models "stuck" as held open). (2) `afw_failure` is injected with the LOFW (the
  historical closed discharge valves) and cleared at `porv_sticks` (crew found them, ~8 min) with a
  beat-commanded `set_afw` — M4's AFW actuation is latched-once and won't re-fire after a clear.
  (3) The damage branch replays the **real 1979 error**: M4's auto-HPI starts on low pressure and
  *rescues* the plant (inventory reached 120%!), so hesitating at the decision point has the beat
  narrate-and-enact the operators' securing of HPI (`set_hpi false`; the latched actuation stays
  quiet). Subcooling-margin truth vs the lying PORV indicator is asserted live in the harness.
- **The Hook (user decision: prompted, not forced).** First **plain** load (no query string) with
  `hook_done` unset shows an invitation overlay; declining sets the flag. The hook is a normal
  scenario (`pwr_hook`) — allow-only-SCRAM gate, highlight, world-scope rewind back to pre-scram,
  `level_complete` pointing at the Training tab. Replayable from the picker.
- **Progression: one localStorage key `rd_progress`** `{hook_done, completed_scenarios[],
  completed_procedures[]}` (deviation from Gameplay §7.1's separate `rd_hook_completed` key — one
  source of truth), try/catch-guarded for `file://`. Recorded when a `level_complete` first
  renders.
- **Training tab** (the M8 placeholder pane): scenario cards from `RD.SCENARIOS` (Start/Stop,
  ✓ done) + per-plant `[sim]` walkthrough list with Follow buttons + the Reactivity Computer.
  `?scenario=<id>` deep link starts a scenario directly (and, being a query string, suppresses the
  hook prompt).
- **UI follow rewired to the instructor.** `renderFollow` renders the snapshot's `follow` block
  (acc ✓ from the instructor's grading, `via instrument / true value` tag) instead of running its
  own true_state check — Gameplay §6's "fix required". Markup preserved for
  `verify_manual_follow.js`; paused-nav stays synchronous via `cmd()`'s reassemble-on-paused path.
  `ui.follow` is a mirror **synced from the snapshot** each render (never set optimistically) —
  start_follow's internal plant reset broadcasts an intermediate free-play snapshot that would
  otherwise clear it mid-transition.
- **`start_follow` resets the plant to the procedure's `from` state** (post-review fix). Without
  it, a walkthrough started from the wrong state could be trivially completable (e.g.
  `pwr_raise_power`, from `50_percent`, "completes" instantly at full power because its
  acceptance is already true). All 20 authored `from` values are valid §6.9 named states — no new
  states were needed. Retry uses the same path. UI clears trend history + gauge smoothing on
  start (fresh timeline; smoothing across a reset displays values that were never real).
- **Beat `speed` field — instructor-driven time acceleration** (additive schema extension). A
  beat can set `speed: N`; the drop-out device is authoring the NEXT beat's trigger on the set
  point and giving it `speed: 1` ("fast-forward and watch — I'll snap us back when it matters").
  Serviced by M5 via a `consumeSpeedRequest()` consume-flag, applied AFTER any rewind so it wins
  over a checkpoint's stored speed; the broadcast's `metadata.time_acceleration` is re-stamped so
  the snapshot is honest on the fire broadcast. TMI uses it for both slow phases (30× through
  recovery/boil-off, 1× at margin-restored / core-uncovery); the UI speed seg + FF badge sync
  from the snapshot.
- **Sandbox rewind: periodic checkpoints + pick-a-moment on the strip chart.** In free play (no
  scenario/follow — gated on the instructor owning no content, so authored rewind arithmetic is
  never disturbed) M5 pushes a checkpoint every 15 sim-seconds (`SANDBOX_CP_SPACING_S`, ring cap
  32 ≈ the last 8 sim-minutes). The strip chart gets a ⏪ button on the scrubber row: in free
  play it enters a picker mode (sim pauses, checkpoint markers drawn on the chart, click a moment
  → `rewind {steps: n}` to the nearest checkpoint, Esc cancels, stays paused after the jump);
  during instructed content the same button keeps the one-boundary-per-press behavior. On any
  backwards time jump the UI drops the now-nonexistent branch of trend history and snaps gauge
  smoothing.

## M7 — Test Runner Layer (dev-only)

**File:** `layers/test_runner.js`
**Validation:** `node test/run_m7.js` → positive 31/31 integration checks across 6 suites, **plus** a
negative "teeth" test that sabotages HR1 (trips read true state) and confirms the protection-boundary
suite catches it (3 failures reported). Exit 0 only when both hold.

A synthetic operator driving the assembled stack through M5's command interface and reading the
broadcast snapshots — validating WIRING, not physics (accident sequences are not re-run, per §2/§4).
Suites: `data_contract`, `instrument_vs_truth`, `protection_boundary` (the two HR1 boundary checks —
highest value), `command_flow`, `alarm_behavior`, `config_consistency`.

### Decisions

- **Config access for §3.6 is sanctioned, true-state access is not.** Assertions read only the
  snapshot + command interface (no engine internals), **except** the config-consistency suite, which
  reads `service.layer.config` (protection data) and `service.engine.cfg.instruments` (instrument
  specs) — explicitly the spec's intent ("by reading the config"). The snapshot already carries
  `true_state` (HR4), so the protection-boundary checks compare truth vs indication from the snapshot.
- **"Trip warns first" is existence, not universality.** §3.6's "trip more extreme than the matching
  alarm" is checked as *there exists* a less-extreme same-instrument/direction alarm — because a
  critical `lo_lo` alarm legitimately **coincides** with the trip (e.g. PWR `pzr_pressure_lolo` 12.41
  MPa == the low-pressure trip). The `lo`-level warning is what must precede the trip. `__true_flow__`
  is exempt (no instrument-based alarm).
- **Built-in negative self-test.** `run_m7.js` monkey-patches `_evalTrips` to read true state and
  confirms the gate fails — a gate that can't fail proves nothing. (Lives in the harness, not the
  shipped TestRunner.)
- **Driving:** `advanceCycles`/`runSeconds` step the loop synchronously and read the returned/broadcast
  snapshot — deterministic, timer-free, exactly what the UI would see.

## M8 — User Interface (functional alpha, PWR)

**Files:** `ui/shell.html` (page) · `ui/app.js` (wiring) · `ui/shell.css` (look). Root `index.html`
forwards here. **Open `ui/shell.html`** in a browser — it loads the engine + layers and runs live.

**Status:** a **working control room wired to the live stack** (M1 + M4 + M5 + M6·PH). Started as a
static mock (commit `308b133`); now `app.js` builds a `SimulationService`, `subscribe(render)`s, renders
each snapshot, and issues commands. Alpha = PWR only + a few deliberate simplifications (below).

### What works
- **Gauges + numeric placeholder** read `snapshot.instruments` (HR1); needle/trend/sparkline live.
- **Controls issue real commands** down the stack: SCRAM (guard-cover + 3 s arm), rods (raise/stop/lower/
  ±1 nudge/speed), RCP (run=clear `rcp_trip` / stop=inject it), boron borate/dilute/off, ECCS `set_hpi`,
  heaters/spray, feed `set_feedwater_flow`, AFW `set_afw`, breaker/turbine `set_steam_demand`.
- **Alarms** render from `snapshot.alarms` (sorted critical-first, system-color bar + severity flash;
  click to acknowledge; gauge-strip tint while unacked). **Failures tab** built from M4's catalog with
  engineering-unit sliders; inject/clear reconcile off `active_failures` (never optimistic).
- **Strip chart**: live rolling buffer, **Graph-tab parameter toggles**, low-profile time x-axis,
  per-series auto-scale, window selector, CSV export. **Lifecycle**: play/pause, speed (1–3600×, FF
  badge), reset to a chosen initial state, save/load JSON. **Settings**: register (`set_register`),
  units (US↔SI display convert), true-state overlay (Instruments/True/Both).

### Decisions / deviations (alpha)
- **Layout fix (user):** Instructor and Tools boxes use `flex: 1 1 0` (basis 0), so switching tabs never
  resizes either box; overflowing tab content scrolls inside a fixed-height `.tab-body`.
- **Acceleration via the wired M5** uses fixed-dt step-count (Flag F6) — stable to 3600×.
- **Alarm category is UI-side** (`alarmCategory()` keyword map) for the left-bar color, because M1's alarm
  data carries no `category` (M8 §8.5 wants it in the profile). **→ new Flag F7.**
- **A few controls are approximations** of CONTEXT §6.7: RCP run/stop maps to clear/inject `rcp_trip`
  (no pump-start command exists); Heater/Spray/ECCS "Auto" are no-ops (the engine has no command to
  *clear* a manual override back to auto); boron borate/dilute drive charging/letdown. EDG is visual.
- **`ui/shell.html` is the entry** (self-contained, `../engines`/`../layers` paths). The §19 `diagram/`
  `panels/` split is deferred — alpha keeps markup in one page driven by `app.js`.
- **Alarm palette** (also used by Failures categories): reactivity `#C084FC`, coolant `#38BDF8`, power
  `#FBBF24`, instrument `#2DD4BF`, safety_system `#F472B6`.

### PWR learning board — data-driven synoptic (2026-07-20)

**Files:** `ui/diagram/board/` — `board_h.js` (React.createElement-compatible DOM hyperscript),
`std_pipe.js` (verbatim from the design project's `pipes.js`), `pwr_board_data.js` (the exported
`{grid,items,pipes}` diagram — generated by `tools/gen_board_data.js` from
`inbox/PWR_learning_diagram.json`), `components/*.js` (11 ported plant components), `pwr_board.js`
(renderer), `pwr_board_wiring.js` (`RD.PwrBoardDriver`). Design sources kept under
`inbox/design_import/`. Provenance + owner rulings in the `pwr-board-design-import` memory.

**What it is.** The final PWR learning diagram is authored in the Claude Design "PWR Reactor"
project (a diagram builder) and exported as data. This replaces the procedural
`ui/diagram/pwr_synoptic.js` as the sole PWR plant display; `app.js` now mounts `RD.PwrBoard` for
`plant_id === 'pwr'` (was `RD.PwrSynoptic`). Vital-few strip, alarms, strip chart, and instructor
shell are unchanged around it.

**Architecture.** The renderer is the design-agnostic half: it lays out item tiles (box / text /
button / value / number / scram / component), mounts each `component` from `RD.BoardComps`, then
DOM-scans `[data-port]` markers and routes pipes with the StdPipe kit — replicating the builder's
`scanPorts` + `gridNudge` (a sub-grid translate that lands pump/valve flange faces on grid lines)
and its flow-direction/paused rules exactly, so routes render where authored. `pwr_board_wiring.js`
is the only sim-aware half: it maps every named item to an engine command (`WIRING_REFERENCE.md`,
dumped from a live snapshot) and every indication to an instrument, converting SI→US (the board is
authored in psi/°F/gpm). Components are snapshot-driven with the internal toy-physics loops stripped;
all motion is CSS keyframes so the **pause freeze** (`metadata.running === false`) works by pausing
`animation-play-state`.

**Owner rulings (asked up front).** Full replace of the synoptic stage, keep the shell. **TRIP
BLOCKS** menu lists only the 4 blockable trips (`lo_press`, `lo_flow`, `ir_high`, `pr_low_setpoint`),
each permissive-gated (P-10 for the flux trips; low-pressure / low-power for the others). The
**Realistic** diagram-mode toggle is **disabled** — the realistic (quiet-board) diagram is not
designed yet. Every control must actually work; all did with existing engine commands (the letdown
orifice A/B/A+B selection is `set_letdown_orifices`, already in the engine).

**Deviations / notes.** (1) The turbine component gained a `tcv-drain` port the design never exposed,
so the authored turbine→condenser drain pipe resolves. (2) A few indications have no dedicated
instrument (AFW/HPI discharge pressure, AFW gpm) — shown as rated-when-active, derived, and flagged
in `WIRING_REFERENCE.md §GAPS`. (3) Boron control ON+target is a driver-side target-seeking loop
(engine exposes only a `set_boron_adjust` rate). (4) The condensate pump toggle is cosmetic (no
inventory model). (5) Rod WITHDRAW/INSERT are click-nudges (`rod_nudge ±4` at the selected S/M/F
speed) rather than press-and-hold. (6) Instructor highlight (`setTag`/`revealControl`) on the board
is a no-op stub for now — the shared highlight path still works, board highlight is future work.

**Verification.** `ui/test_panel/board_check.html` (headless Edge) — **24/24**: 144 items render,
53 ports scanned, 142 pipes resolve, driver covers every button/number/value/control-component, and
functional clicks confirm the engine responds (spray, heater, letdown orifices, generator mode,
charging pump, steam dump, load target, pressure setpoint, rod withdrawal, TRIP BLOCKS, full SCRAM).
Engine gates unregressed: PWR 31/31, e2e controls 30/30, M7 OK, campaign 51/51.

#### Follow-up (2026-07-20): real indications, condensate pump, boron-in-layer, glow

Closed the board's derived-indication gaps with real engine state, per owner request.

- **New instruments** (`afw_flow`, `afw_discharge_pressure`, `hpi_discharge_pressure`,
  `condensate_flow`) + status `condensate_pump_running`. AFW/HPI pump discharge pressures model head
  above the SG/RCS (shutoff when deadheaded, 0 idle); config params in `steam_generator` / `emergency`.
  **All four carry `noise:0` deliberately** — the instrument PRNG is a continuous cross-step stream,
  so a noise draw on an appended instrument shifts every downstream instrument's noise and silently
  moved two marginal campaign endpoints (pwr_boron, pwr_rod_auto tripped). Zero sigma skips the draw
  (`_gauss` early-returns), keeping the RNG byte-identical; lag stays. A general lesson for any future
  appended instrument.
- **Condensate pump** is a real actor: `set_condensate_pump {running}`; `stepSecondary` gates MAIN
  feed on it (AFW is a separate train, unaffected), so securing it collapses `condensate_flow`/
  `fw_flow`. Save-restore migrates old states to on.
- **Boron target-seeking moved out of the UI into the control layer.** New channel kind `conc`
  (`_stepConc` in control_kernel) + PWR channel `boron_conc`: bang-bang toward a `boron_analyzer`
  ppm setpoint via `set_boron_adjust`, needs the charging pump, drops to MAN on an operator
  `set_boron_adjust`. Board BORON ON/OFF → `set_auto_channel`; target ppm → `set_auto_setpoint`;
  setpoint read back from `automation.channels`. The old `afterRender` UI loop is deleted.
- **Instructor glow on the board.** `RD.PwrBoard.revealControl/setTag/highlightLabels` are now real:
  the driver holds a control-label→item map covering the same vocabulary as `RD.PwrSynoptic`
  `SYN_CONTROL_MAP` (so the run_campaign highlight gate still resolves), the renderer glows the
  resolved tile with `.instr-glow`, and `setTag` hangs a `.bd-maint-tag` over the AFW valve (TMI-2).
- **Turbine RPM:** 1800 rpm at 100 % is correct for a ~1000 MWe PWR (half-speed, 4-pole generator —
  wet LP steam needs long last-stage blades that can't take 3600 rpm). Engine already rated 1800; the
  board shows it live (the design's "3600" was a placeholder). No change.

Verification: board_check **37/37** (adds glow, boron-channel, condensate, real-discharge checks);
gates green — PWR 31/31, e2e 30/30, autoctl 20/20, campaign 51/51, M4 18/18, M5 19/19, M6 16/16, M7 OK.

#### Follow-up (2026-07-20): visual fidelity fixes (owner review of the render)

- **Inactive buttons render grey.** The diagram's authored button color is its ACTIVE-state
  color; buttons now render grey when inactive and adopt `--bd-color` (the authored color) when
  selected (`.bd-active`) or momentarily pressed (`:active`).
- **PORV sizing.** The PORV component rendered at a fixed 90×195 px (copied literally from the
  design), overflowing its 45×70 tile and putting its ports ~60 px low — the cause of the bent PORV
  pipes. Now fills the tile like every other component (`width/height:100%`, `preserveAspectRatio
  meet`), so the item box sets its size and the ports land where the builder placed them.
- **All pumps render art-only (crooked pipes).** A pump with `showControls:true` reserves control
  space (taller viewBox), which shifts the pump art — and its ports — up and bends the connected
  pipes. Owner ruling: **no pump has its own toggle; every pump control is a separate button/panel.**
  So all five pumps render **art-only** (driver `suppressBuiltInControls`), which straightens the
  pipes. Controls: RCP → on-pump ON/OFF buttons (rewired `set_charging_pump` → `set_rcp`); ECCS →
  HPI START/STOP/AUTO panel; feed → SG FEED panel; charging → CHARGING panel (**OFF = charging pump
  off**; AUTO/MAN run the pump in auto make-up / manual charging); condensate → no control (always
  running — the owner confirmed it doesn't need operating; the engine still models it, so a
  `set_condensate_pump` command from a scenario still collapses main feed).
- **Turbine drain removed.** The exported diagram carried a `turbineGenerator/tcv-drain →
  condenser/steam-in-2` line for a port the turbine never had; a real casing drain isn't modeled and
  the owner confirmed it's unnecessary, so `tools/gen_board_data.js` drops that pipe (29 pipes now)
  and the invented drain port is removed from the turbine component.

Verification: board_check **41/41**; engine/control untouched this round.

## Change log

- **M1** built and committed (`a18c85f`). Suite 11/11.
- **M3** built. Suite **9/9 · 47 checks** (`node test/run_bwr.js`, browser `test_bwr.html`).
  Flow-controlled BWR with negative void feedback; vessel/boiling/recirc TH; the steam-driven
  safety systems (RCIC/HPCI/ADS/LPCI) + the SBO battery timer; the **Fukushima** flagship runs the
  full hold-then-uncover timeline (RCIC holds ~8 h, uncovery ~3 h after battery depletion, damage)
  vs the ADS+LPCI intervention (core saved) — the comparison. Needed an **implicit prompt term**
  (Λ=5e-5 → explicit Euler unstable at 0.02 s; resolves F6) and a faster ADS + lower vessel-pressure
  gain so depressurization beats decay steam. **Physics layer complete — all three engines proven**
  (PWR 11/11·51, RBMK 18/18·99, BWR 9/9·47, all re-confirmed green).
- **M2** built. Suite **18/18 · 99 checks**, both versions (`node test/run_rbmk.js`, browser
  `test_rbmk.html`). Two versions in one engine via `design_version`; reuses the F1 excess/pinned-
  reference pattern (and extends it to `void_ref`, which proved load-bearing for low-power
  stability). Accident co-tuned: pre crosses prompt critical via the displacer + amplified void →
  **steam explosion**; post shuts down safely; full-power maneuvering stable. PWR suite re-confirmed
  green (11/11 · 51 — no shared code touched). **F1 resolved**, **F6** confirmed for M2.
- **M4** built and committed (`1ae7245`). Smoke 10/10. Added `category` to PWR failure data;
  M1 suite re-confirmed green after the edit.
- **This file** created after M1+M4 to capture the above; keep updating per "How to maintain".
- **M5** built. Smoke 12/12. Fixed-dt step-count acceleration (Flag F6); default pass-through
  Instructor slot; full stack (engine ↔ M4 ↔ instructor) runs end to end. M1/M4 re-confirmed green.
- **M6·PH** built. Tests 8/8. Real pass-through Instructor module in the slot; M5 aligned to the
  `setRegister` interface and prefers `RD.InstructorLayer`. Swap-invariant confirmed (free-play
  unchanged). All four suites (M1/M4/M5/M6·PH) green.
- **M6 alpha + steps 5–6** built (beat engine per `M6_instructor.md`, Path 2 follow with strict
  gating + instrument-first grading, `pwr_tmi` flagship both branches validated headless, M5
  rewind ring with full/world scopes, snapshot instructor-block extensions
  (ui_policy/highlight/follow/level_complete), highlight rendering with the F8 auto-reveal on both
  control mechanisms, the prompted first-run Hook (`pwr_hook`), Training-tab scenario picker +
  walkthrough list, `rd_progress` persistence, `?scenario=` deep link). New gates:
  `test/run_m6.js` 16/16 · `test/run_scenarios.js` 3/3. All prior gates green, `run_m6ph.js`
  untouched (swap invariant holds). **Flag F8 resolved.** See the M6 section above.
- **M6 player-review fixes** (post-build review): `start_follow` resets to the procedure's
  `from` state (kills trivially-completable walkthroughs); beat `speed` field for
  instructor-driven fast-forward with automatic drop-out at set points (TMI uses it through both
  slow phases); sandbox rewind — periodic free-play checkpoints (15 sim-s) + a pick-a-moment
  picker on the strip chart (⏪ on the scrubber, markers on the plot, click to jump). UI follow
  state now derives from the snapshot (fixes a mid-reset race). Gates: run_m6 16/16 (94 checks),
  run_m5 17/17, run_scenarios 3/3, all others green.
- **PWR startup-forgiveness tuning pass** (user report: "too touchy — pull rods halfway, nothing,
  then runaway + scram"). Diagnosis confirmed by trace: (1) NO neutron source — a subcritical
  core showed nothing (power decayed 1e-4→1e-7 %) until well past critical, and SUR was floored
  at 0.1% power, so the first visible sign was a 2$-supercritical excursion; (2) the SG thermal
  load was a BINARY gate — 0 below 1% power, full rated coupling above — so crossing the point of
  adding heat slammed a rated-capacity heat sink onto a 2% core (5 °C quench → pressurizer
  drained → `pzr_level low` trip: the "booby-trapped startup"). Fixes, all [tune]/data:
  **M1 physics** — constant neutron source (`kinetics.source = 1e-6`, P_eq = S·Λ/(−ρ): the
  approach to criticality is now visible 1/M behavior, SUR live from the first rod steps);
  SUR/period floor lowered to source range (1e-6 %); subcritical precursors initialized at
  source equilibrium; SG coupling is now pure h·ΔT with the secondary finding its natural
  NO-LOAD equilibrium (steam dump setpoint moved to the no-load pressure 8.90 MPa ≈
  Psat(no-load Tavg) with a 0.25 MPa band — the real steam-dump-in-pressure-mode behavior);
  hot-standby init made self-consistent (tavg = tcold = thot = Tsat(dump setpoint), sgP =
  setpoint → zero reset drift); `startup_rate` instrument added (lag 2 s, appended last —
  PRNG order preserved; instruments steam_pressure range → 10.5). **M4 data** — `sur_high`
  caution alarm (2.0 DPM) + rod-withdrawal interlock (≥ 2.5 DPM, clears < 1.5; see M4 C9/C10).
  **Outcome (traced):** attentive pull → SUR builds smoothly, release at 1 DPM while still
  −265 pcm subcritical, core settles gently; hands-off continuous pull → withdrawal blocked at
  +343 pcm (0.53 $), Doppler rolls the rise over, plant SELF-STABILIZES at ~29% power, and the
  only eventual trip is the honest `sg_level low` (nobody fed the boiling SG). Engine suite
  12/12 UNCHANGED, procedures 21/21, TMI/Hook 3/3, M7 protection boundary green;
  `gen_manual_reference` re-run (PWR 23 alarms). Note: RBMK/BWR startups still lack a source
  term — same treatment is a candidate follow-up.
- **RBMK + BWR startup-forgiveness pass** (the PWR recipe applied; user-approved follow-up).
  **M2** — `kinetics.source = 6e-4` (subcritical floor ~5e-5/3e-5 rated at the pre/post rod
  margins; ρ-shift ≤ 0.4 pcm even at `low_power_xenon`, so the Chernobyl preconditions are
  untouched); source enters the delayed branch only (never the prompt fast-path); hot_startup
  settles kinetics on the source equilibrium (P = S·Λ/(−ρ), precursors matched, decay preloaded
  ×0.07 recent-shutdown) — no reset free-fall; SUR floor → source range; `startup_rate`
  instrument (appended last, PRNG order preserved) + `sur_high` caution alarm (3.0 DPM) +
  rod-withdrawal interlock at **4.0 DPM / clears 2.5** — deliberately less protective than the
  PWR's 2.5/1.5: the RBMK's instability is curriculum, and in the continuous-pull trace the
  void feedback still drives ρ past the rod stop (its character intact) with the trip ending it.
  **Latent bug found & fixed:** the pre-1986 `power_range high 120%` trip could NEVER fire —
  the instrument range capped at exactly 120, and a pegged reading never strictly crosses the
  setpoint. Range → [0, 200]; the trip now catches the startup excursion at ~176%.
  **M3** — `kinetics.source = 4e-3` with a **fade above ~1% power** (`×max(0, 1 − P/0.05)`):
  the BWR's tiny Λ (5e-5) means a source big enough for a useful floor otherwise pushes
  full-power operation (+11% drift observed) — physically the source is swamped by fission at
  power, a scale separation the normalized lumped model can't express with a constant. Source
  enters the implicit prompt-jump form alongside ΣλC. Same equilibrium settle + decay preload;
  SUR floor → source range. **Latent bug found & fixed:** hot_startup seeded a phantom 2%
  TURBINE STEAM DRAW (from the config's placeholder power) against ~0.5% decay boiloff — the
  vessel depressurized into the 5.52 MPa low-pressure scram in ~2 minutes, punishing exactly
  the careful player who paused the approach. The subcritical settle now parks the turbine
  offline (no draw, no feed), and the state holds indefinitely. No BWR interlock — the negative
  void coefficient already self-limits (rods fully out from hot_startup settles at ~48% power).
  **Traced outcomes:** all three attentive pulls now show stable 1/M multiplication (release →
  power settles at a HIGHER stable level, no decay-death, no trip); RBMK continuous pulls are
  rod-blocked then either self-stabilize (~47-58%) or trip properly on the fixed flux trip
  (pre, ~176%); BWR continuous self-stabilizes at ~48%, no trip. Gates: PWR 12/12 · RBMK 23/23 ·
  BWR 12/12 all UNCHANGED, procedures 21/21, all 13 gates green; `gen_manual_reference` re-run
  (RBMK 12 alarms / 11 indications).
- **M7** built. Positive 31/31 integration checks + negative teeth test (sabotaged HR1 → caught).
  Validates the assembled stack's wiring through M5's interface. All five suites (M1/M4/M5/M6·PH/M7)
  green. Physics gate (M1) + wiring gate (M7) both pass → the PWR system is correct per CONTEXT §9.
- **M8 visual shell** (`308b133`): static mock-data prototype for layout iteration.
- **M8 functional alpha**: wired `ui/app.js` to the live stack — gauges/numeric read instruments,
  controls issue commands, alarms/instructor/strip-chart render from snapshots; Graph-tab param toggles,
  low-profile x-axis, units/register/overlay, failures, save/load/reset. Tab switching no longer resizes
  the Instructor/Tools split (flex-basis 0 + scroll). New Flag F7 (alarm category belongs in profile).
  Engine/layer suites unaffected (all five green); UI field-contract spot-checked against a live snapshot.
- **Broadcast cadence raised** to 10 Hz normal / 20 Hz transient (was 2 Hz / 5 Hz) for a smoother live
  UI — cheap, data identical. Transient thresholds scaled by interval (constant rate sensitivity). Added
  CSS tween on gauge needles + rod bars so they glide between frames. M5 cadence tests made
  cadence-agnostic. (CONTEXT §4's 2/5 Hz is the *minimum* viable cadence; rendering faster is a display
  choice that doesn't touch determinism.)
- **M8 quiet-board redesign pass (user, responsive + control-room HF):** based on the "dark/quiet
  board" philosophy (EPRI 1003662, NUREG-0700, ISA-18.2) — mute the normal, surface the abnormal.
  - **Equal-width control panels (the "Reactor Core too wide" bug):** `.control-sections` was
    `repeat(4, 1fr)` = `repeat(4, minmax(auto,1fr))`; the dense rod cluster's intrinsic width refused
    to shrink and stole space. Fixed to `repeat(4, minmax(0,1fr))` + `.section{min-width:0}` + wrap on
    `.ctl-row`. Now genuinely equal regardless of content.
  - **Responsive:** dropped the `.plant-area{min-width:760px}` floor at ≤1200px (it forced horizontal
    scroll on mid-size monitors); gauge strip wraps; stacked column fallback at ≤860px. No media
    queries existed before.
  - **Controls-only panels:** stripped all five embedded readouts (control/shutdown bank steps, boron,
    feed %, turbine MW) out of the panels — every one already exists in the diagram numeric grid, so no
    info lost. `renderControls()` reduced to the SCRAM button + alarm tint. Rod position bars removed
    from the panel (position still shown as steps in the numeric grid; can relocate a visual bar into
    the diagram block if wanted).
  - **Sidebar cards focus model:** instructor + tools are now expand/collapse cards — exactly one
    expanded at a time. Collapsed instructor shows only its latest message; collapsed tools shows only
    its tab strip (clicking a tab expands+selects). Clicking the supervisor header focuses it; a new
    instructor message auto-pops it open. Replaces the old fixed 50/50 `flex:1 1 0` split.
  - **Reactivity (user decision: "SUR on board + reactimeter tool"):** real PWRs have NO direct ρ gauge
    (high-confidence research finding) — operators infer reactivity from neutron-flux trends. Engine
    `getTrueState()` now exposes `reactivity_pcm` (= `_rho`·1e5), `startup_rate_dpm` (= 26.06·Ṗ/P) and
    `reactor_period_s` (= P/Ṗ). Added a **Startup Rate** gauge to the vital bar (the authentic operator
    proxy) and an explicitly-labeled **Reactivity Computer** (reactimeter, pcm/SUR/period) in the
    Training tab — framed as a reactor-engineering tool, NOT a board gauge.
  - **Quiet-board color (hybrid):** running/normal status muted (new `--running-muted` teal) so a calm
    board reads "all normal"; amber caution and saturated/flashing red (alarms/trips) kept fully
    salient. Applied to `.seg button.on.run` and numeric `bool-on`.
  - All engine/wiring suites re-confirmed green (PWR 11/11·51, M7 31/31 + teeth). Snapshot contract is
    additive (three new `true_state` fields), so M7's data-contract suite is unaffected.
- **Redesign follow-up (user):** (1) **Rod-position bars relocated into the diagram block** — a
  `.rod-position` strip atop the synoptic shows both banks (bar + step readout); the duplicate Control
  Bank/Shutdown Bank text rows were removed from the numeric grid. Keeps panels controls-only while
  restoring the at-a-glance rod visual as *information* in the diagram. (2) **Color muting pushed
  further:** generic selected `.seg button.on` cyan → muted teal-slate; gauge-band normal zone and rod
  fills → muted; caution-amber and trip-red stay salient.
- **Quiet-board palette pass + A/B layout harness (`develop` branch).** Per a user concept scan,
  retuned the M8 §15 palette toward a stricter quiet board: near-black backgrounds
  (`--bg-plant #0E1216`, body `#070A0C`), muted-by-default text, and color spent only on the
  abnormal. Control toggles became **outline chips** (`.seg button.on` = thin ring, not a filled
  block); **green = energized/armed** (`.on.run`: RCP run, feed start, breaker closed, and now the
  AUTO/armed states for ECCS / PZR heaters / spray), **amber = caution**, **red = alarm/trip** only.
  Speed selector de-saturated to a cyan outline (the clock still goes amber on time-accel).
  - **Diagram vertical-shrink fix shipped as two switchable variants** (so the user can A/B live
    before we commit): the synoptic was the lone `flex:1` shock-absorber in the plant column and got
    crushed by greedy neighbors (gauge-strip wrap, `bottom-row 30%`, control `min-height:150`) plus
    the relocated rod-position strip. **Layout A "Fit"** rebalances the budget (one-row gauges,
    shorter panels, `synoptic flex:2 min-height:260`, trimmed bottom row) — fits the window, clips on
    very short screens. **Layout B "Fixed"** implements M8 §2.2 (plant area holds `min-height:768`,
    `.app` scrolls instead of squishing) — synoptic always full height. Selected by a class on `.app`.
  - **A, B, and C all rejected (user) and REMOVED** — the whole variant harness (Dev-tab dropdown,
    `.layout-*` CSS, `applyVariant`/localStorage) is gone. A/B only reshuffled the vertical budget; C
    compacted the cards but still wasn't skinny enough, because four side-by-side sections are tall by
    construction.
  - **Final: TABBED CONTROL STRIP (`.control-strip`).** The four sections are stacked behind a tab bar
    (`#ctlTabs`, panes `.ctl-pane[data-cpane]`); only one shows at a time, its controls laid out as
    label-over-control groups (`.cg`) flowing horizontally across the **full** strip width. The band
    drops to ~one row (~95 px), giving the synoptic (`min-height:280`) and the chart/alarm row room
    without scroll or squish. **Deviates from M8 §5** ("always visible — not tabs, not collapsible") —
    a deliberate, user-directed HMI change. **→ Flag F8.** The Dev tab itself stays (placeholder for
    future dev tools); the §15 quiet-board palette and green-armed AUTO chips from this pass remain.
  - **New "Dev" tab** in the Tools Block (§10, dev-only surface) hosting the first dev tool: a **UI
    Layout (A/B) dropdown** (`#uiVariant`) that swaps the layout class and persists to `localStorage`
    (`rd_ui_variant`, guarded for `file://` storage blocks). Restored before first paint in `init()`.
  - All five suites (PWR/M4/M5/M6·PH/M7) re-confirmed green — UI-only change, no stack contact.
- **Rod banks relocated + display damping (user feedback, `develop`).**
  - **Rod-bank bars moved under the Reactor/Core numeric column** (was a full-width strip across the
    top of the synoptic). `buildNumeric()` appends a compact `.rod-mini` block (label + step readout
    over a thin bar) to column 0; same ids (`rodControlFill`/`Limit`/`Readout`, `rodShutdownFill`/
    `Readout`) so `renderRodBars()` is unchanged. Also reclaims ~70 px of vertical space in the diagram.
  - **Display damping for instrument jitter.** User noticed gauges/numbers/chart jump every frame —
    correctly identified as the instrument noise (`pwr_config` noise sigmas, re-randomized each step
    and shown at the 10–20 Hz broadcast cadence). The noise STAYS in the data (HR1 — a stuck/failed
    instrument must still mislead; trips/alarms read the raw reading engine-side). The UI now damps only
    the **displayed** value with a per-frame EMA (`DISPLAY_DAMP_K = 0.18`), exactly like real indicator
    needle-damping / digital filtering. Done in `dampInstruments()` at the top of `render()`, into a
    **copy** of `s.instruments` (which aliases the engine's live reading object — must not mutate;
    would corrupt engine state and saves). Skipped at ≥60× (signal then outruns the noise; damping
    would only lag). Reset on reset/load. Gauges, numeric grid, and strip chart all calm as a result.
- **SCRAM pulled into its own always-visible box (user).** With the controls now tabbed (Flag F8),
  SCRAM would vanish on non-Reactor tabs — unacceptable for an emergency control. Moved it out of the
  reactor pane into a dedicated `.scram-box` pinned to the **right edge of the control strip**
  (`.control-strip` is now `flex-direction:row` → `.ctl-main` tabs/panes + `.scram-box`), so it's
  reachable from any tab. New quiet-board color states: cover-down = **dull green** stripes (calm,
  armed/ready); cover lifted = **dull red** exposed button; **scrammed (manual or auto) = bright-red
  flashing** via a `.scram-wrap.scrammed` class (forces the indicator visible regardless of cover
  state) + `scram-flash` keyframes. Cover lift/3 s-arm/timeout behavior unchanged.
- **"Color is reserved" palette pass (user directive).** The board was equally bright everywhere, so
  an alarm had nowhere louder to go. Reworked so DIM is the resting state and color = status:
  - **Vital gauges:** value is dim blue-white `#a8b8c8` over dim labels `#4a5a6a` at rest; the renderer
    adds `.warn` (amber) / `.alarm` (red + `gauge-alarm-flash`) from each gauge's own
    `caution`/`danger` config thresholds (not hardcoded; gauges without thresholds stay dim). Sparkline
    muted to `#56657a`.
  - **SCRAM guard cover:** now nearly invisible at rest (dark `#10151a` bg, dim-green border/text) — no
    siren — and only the *fired* state is the bright-red flash (unchanged).
  - **Strip-chart traces:** recolored to muted, hue-distinct TRACKING tones (amber/blue/steel/purple/
    violet/green/olive). A trace **brightens + thickens when its parameter hits alarm** (`seriesAlarmed`
    reuses the mapped vital gauge's `danger` threshold; `lighten()` pulls the muted hue toward white) —
    the contrast against the calm baseline is the signal.
  - **Failure category pills:** dropped the saturated fills for low-saturation tinted backgrounds +
    brighter hue text (they classify, they don't warn).
  - **Diagram header decluttered:** removed the Education/Realistic and Instruments/True/Both segs from
    the synoptic header; both remain under the Settings tab (the diagram one was `overlaySeg`; Settings
    keeps `overlaySeg2`, bindUI tolerates the missing id).
  - Alarm annunciator left as the (user-approved) dark-at-rest list; the four-state lifecycle styling is
    already in place. All five suites green (UI-only).
- **Legibility + info-hierarchy pass (user).**
  - **Vital strip trimmed to the six headline gauges** (Reactor Power, Primary Pressure, Tavg, PZR
    Level, SG Level, Subcool) — the parameters scanned continuously. **Startup Rate** moved to the
    diagram's Reactor/Core column and **Grid Match** to the Turbine/Condenser column (both secondary:
    SUR matters mainly on transients, Grid Match is a turbine/grid metric). Fewer gauges also lets the
    strip breathe / read bigger.
  - **Bigger text where it counts:** diagram numeric grid 12→13 px (headers 11→12, rod readout 11→12);
    control-strip controls up (seg/btn 12 px, tabs 12 px, num-inputs 12 px, labels 11 px). General text
    palette nudged a touch brighter (`--text` `#E4E9EE`, `--text-2` `#98A3AF`, `--muted` `#69757F`);
    gauge dim value/label brightened slightly (`#b6c4d2` / `#5a6b7c`) while staying recessed.
  - **Control strip now uniform height across tabs:** `.ctl-pane` is `flex-wrap:nowrap` + `min-height`
    + vertically centered, so every section renders as one same-height row (overflow scrolls
    horizontally rather than growing the strip) — switching tabs no longer resizes the strip.
- **Strip-chart legibility + chrome (user).** (1) Legend now doubles as a **minimal, color-coded
  per-parameter scale** — each entry shows the trace label + its plot range `[min–max]` in the trace's
  own color (interpretation of "color-coded x-axis for each parameter"; ranges are the native plot
  scale). (2) The three horizontal gridlines made **hairline + non-scaling** (`stroke-width:0.5`,
  `vector-effect:non-scaling-stroke`, dim `#1b1f25`) so they stop competing with the parameter traces;
  traces also got `non-scaling-stroke` for crisp, consistent weight under the stretched viewBox.
  (3) Removed the **Elapsed** row from the Sim tab (the top-bar clock already shows sim time; dropped
  the `simElapsed` render line too). (4) Top-right logo **spelled out** "Reactor⚛️Dynamics" (was R⚛️D).
- **Two alpha-feedback fixes:** (1) decay heat now tracks power + is pre-loaded (see M1 modeling
  decisions) so an operating reactor shows ~7%, not 0. (2) Strip-chart bug: `getInstruments()` returns
  the engine's *live, mutated* reading object, so the chart was buffering one shared reference (every
  point showed the latest value). The UI now copies instrument values into the buffer and plots each
  series against a fixed range (auto-scaling had amplified steady-state noise to full height).
- **Quiet-board color refactor as a swappable A/B variant (user, `develop`).** Per a supplied
  color-refactor spec ("color is reserved exclusively for deviation from normal"), added a **Dev-tab
  dropdown** (`#uiVariant`, Current ↔ "Quiet Board (new)") that swaps a `variant-quiet` class on
  `.app`; persisted to `localStorage` (`rd_ui_variant`, guarded for `file://`), with a `?variant=`
  URL override for sharing/screenshots. **This re-introduces a Dev-tab variant selector** (the layout
  A/B harness was removed earlier — Flag F8 changelog); this one swaps *color treatment*, not layout.
  Selecting "Current" applies zero overrides, so the existing board is untouched — true A/B. The new
  variant implements the spec's six changes, almost entirely as CSS scoped under `.app.variant-quiet`
  plus three small JS hooks:
  - **(1) gauge bars** — the rainbow gradient track becomes a single dim track (`--bar-track-normal`);
    a colored fill (`g-fill`, set in `renderGauges`) appears to the needle *only* in a warn/alarm band.
    **(2) status words** — `classifyBool()` switches to `quietBoolClass()` in quiet mode: normal
    (closed/running/no/off/standby) → dim `--clr-status-normal` (no more green), abnormal
    (open/stopped/yes) → red, off-normal-but-not-failed (HPI active / AFW on) → amber. **(4) traces** —
    each `SERIES` gained a `qcolor` (the spec `--trace-*` muted palette); `traceColor()` picks per
    variant for the chart, legend, and Graph-tab swatches. **(3) SCRAM**, **(5) value text**,
    **(6) card tint**, and trend-arrow coloring are pure CSS keyed off the existing `.gauge.warn/.alarm`
    classes (same logic that already drove value-text color — so the deviation path is the proven one).
  - Deliberately **not** done: the transient green-on-clear flash (spec's `--status-cleared`, lower
    priority — the load-bearing rule "never green for currently-fine" is satisfied); the failure
    category pills (spec marks them a separate task / DO NOT CHANGE). Verified by headless-Chrome
    screenshots of both variants (quiet board reads calm at steady state; SCRAM fired → bright-red
    flash). Engine/layer suites untouched (UI-only).
- **Quiet board kept, A/B harness removed; multi-plant UI + layout/graph upgrades (user, `develop`).**
  After approving the quiet board, the user asked to drop the old look and keep quiet only — so the
  `variant-quiet` scoping was unscoped into the base rules, the Dev-tab variant dropdown / `localStorage`
  / `?variant=` override were removed, and `boolClass()` now always returns the quiet `q-*` classes
  (the old rainbow `.g-band` gradient and green `.nv.bool-on` are gone). The board is quiet-only.
  - **Multi-plant, data-driven UI.** `app.js` was refactored from PWR-hardcoded to a `PROFILES`
    table (pwr / rbmk / bwr) supplying each plant's gauges, numeric grid, strip-chart series, and
    **controls** (the tabbed control strip is now built from the profile, not static HTML). An
    **engine dropdown in the Sim tab** (`#engineSel`: PWR · RBMK pre-1986 · RBMK post-1986 · BWR)
    calls `switchEngine()` → `service.selectPlant(plant, init, design_version)` and rebuilds every
    plant-specific surface (gauges/numeric/controls/series/initial-states/failures). The M5 engine
    registry + per-plant M4 rebuild already supported this; the UI just drives it. RBMK pre/post are
    one plant with two `design_version`s. A `?engine=` URL override mirrors the old `?variant=` for
    testing/sharing. Verified by headless screenshots of all three plants (correct gauges, numeric,
    controls, and per-plant failure catalogs; AZ-5 label on the RBMK scram).
  - **Per-plant indications/controls** map to each contract: RBMK gets the ORM gauge + Reactivity/ORM
    column + MCP-flow/EPS-bypass controls; BWR gets vessel level/pressure + the RCIC/HPCI/ADS/LPCI
    safety-system column and controls + battery. Rod commands are uniform across plants (+withdraw /
    −insert), so one set of rod acts serves all three. `scram` works for all (the RBMK accepts it as
    AZ-5). Gauge state logic gained **low-side** thresholds (`caution_lo`/`danger_lo`) for level/ORM,
    and a display multiplier (`mul`) for void.
  - **Layout:** the diagram block (`.synoptic`) is now **fixed height** (`flex:0 0 340px`) and the
    chart/alarm strip (`.bottom-row`) **stretches** to fill the slack (was the reverse).
  - **Graph:** horizontal gridlines darkened to near-background (`#0f1217`) so they recede; added
    **live floating value labels** at the right edge — one per active trace, color-coded to the line,
    positioned at the line's current y and **collision-spread** (min-gap pass + overflow push-up) so
    they never overlap. Rendered as an HTML overlay (`.chart-floats`) over a new `.chart-plot` wrapper
    (the SVG viewBox is stretched, so SVG text would distort). Engine/layer suites re-confirmed green
    (UI-only; PWR 11/11, RBMK 18/18, BWR 9/9).
- **Improvement-punchlist pass (user, `develop`).** Worked the supplied punchlist; status by group:
  - **Group A (quiet-board color)** was already implemented in the prior two passes (A1 status words,
    A2 single-track gauge bars, A3 muted traces, A5 trend arrows, A6 value text, A7 card tint). Only
    **A4** needed alignment — the SCRAM fired state now uses the spec palette exactly (`#1a0600` /
    `#b03020` / `#e04020`, `0.5 s step-end` opacity flash). **E2** (grey the Startup-Rate row to
    near-invisible when `|SUR|<0.01` — no info at power) and **E4** (desaturated failure-category
    pills, the exact spec hexes) also done.
  - **B1 · PWR PORV block valve** (closed-loop gap, the key TMI recovery). **Engine extension:**
    `pwr_pressurizer.relief()` gates all PORV flow on a new `block_valve_open` state (default open);
    closing it zeroes relief AND inventory loss even while the PORV is stuck open. New commands
    `open_block_valve` / `close_block_valve`; `porv_block_open` in `control_state`. UI control on the
    Primary Inventory tab + a `PORV Block Valve` indication. Verified: stuck-PORV `porv_flow` 0.0025 →
    0 on isolate, inventory stops falling. PWR suite still 11/11·51.
  - **D1 · BWR Standby Liquid Control** (HIGH-priority ATWS mitigation). **Engine extension:** a
    negative reactivity term `ρ_slc = −slc_worth·slc_injected` (worth 0.09) that ramps in (`slc_ramp_tau`)
    and drains the tank; shuts the reactor down independently of the rods. New commands `initiate_slc`
    / `stop_slc`; `slc_active`/`slc_tank_pct` in `true_state`+`control_state`. UI control on Safety
    Systems + `SLC` / `SLC Tank` indications. Verified: with `failure_to_scram` active (rods stay
    withdrawn at 148 steps), SLC drives power 100 % → 0.2 %. BWR suite still 9/9·47.
  - **C1 · RBMK AZ-5 positive scram effect — VERIFIED MODELED (no change).** The graphite-displacer
    positive spike IS the centerpiece of M2 (`k_disp=0.05`, `rho_displacer_pre`); from `low_power_xenon`
    the AZ-5 insertion drives ρ from 0 to ~+0.017 (≈ 2.6 β) before the absorber arrives — squarely in
    the punchlist's "~+2–3 β" — and is what makes the pre-1986 flagship excurse. Confirmed, not broken.
  - **Command-contract extension note.** `open_block_valve`/`close_block_valve` (PWR) and
    `initiate_slc`/`stop_slc` (BWR) are **new commands beyond CONTEXT §6.7** — added because the
    punchlist explicitly requested the controls and the §6.7 set lacked them. Additive only (defaults
    leave existing behavior unchanged; all suites green). Fold into §6.7 when the blueprint is updated.
    **RESOLVED — folded into CONTEXT §6.7 + M1/M3 (see "Blueprint reconciliation" entry below).**
  - **DEFERRED TO v2 (user decision).** **B4** containment pressure, **D2** suppression-pool (torus)
    temp, **D3** torus level, **D5** drywell pressure all require a containment / suppression-pool model
    that **CONTEXT §8 explicitly excludes** ("No containment model … described in commentary, not
    modeled"). Faking static gauges would violate the honesty principle; the user chose to defer these
    to v2 rather than expand v1 scope.
  - **B2 / D4 / D6 done (closed-loop controls, user "do these first").**
    - **B2 · PWR steam dump / turbine bypass.** `pwr_steam_generator.stepSecondary` adds a dump path
      that vents steam to the condenser (extra steam-out in the pressure + level balance): **Auto**
      opens proportionally above `steam_dump_setpoint` (6.0 MPa) — a basic relief-to-condenser, the
      same class as the allowed pzr heater/spray auto-control — with a manual override. New command
      `set_steam_dump {mode:auto|open|closed | pct}`; `steam_dump_pct`/`steam_dump_auto` in
      `control_state`. UI on Turbine & Grid + indication. Verified: after a turbine trip, auto dump caps
      SG pressure at ~6.4 MPa vs ~12.2 MPa with the dump closed.
    - **D4 · BWR Core Spray (LPCS).** Mirrors LPCI — injects below `lpci_threshold_pressure`; `lpcs_flow`
      added to the vessel level balance. Command `start_lpcs`/`stop_lpcs`; `lpcs_running` in the contract.
    - **D6 · BWR manual SRV.** Operator-opened controlled depressurization (`srv_manual_tau=150 s` —
      slower than ADS's 120 s but fast enough to out-vent the decay steam below the 1.03 MPa injection
      window). Commands `open_srv_manual`/`close_srv_manual`; `srv_manual_open` in the contract.
      Verified end-to-end: with HPCI unavailable after RCIC fails, **manual SRV → LPCS** depressurizes
      to 0.82 MPa, LPCS engages, and the core is saved — a second, operator-driven Fukushima recovery
      path alongside ADS+LPCI. All suites still green (PWR 11/11, BWR 9/9, RBMK 18/18).
    - These add more commands beyond §6.7 (`set_steam_dump`, `start_lpcs`/`stop_lpcs`,
      `open_srv_manual`/`close_srv_manual`) — additive, defaults inert; fold into §6.7 on the next
      blueprint update. **RESOLVED — folded into CONTEXT §6.7 + M1/M3 (see "Blueprint reconciliation"
      entry below).**
  - **STILL queued (feasible, not yet done).** B3 MSIV, C2 per-trip EPS-bypass granularity, E1 ISA-18.1
    "cleared-unacknowledged" alarm state (M4 lifecycle), and UI-only E3 CSF sublabels, C3 MCP-count
    indicator (engine tracks `mcp_running` bool, not a count — would be an approximation), C4 AR-mode
    indicator (v1 is manual-only; §8 excludes auto-control).
- **Plant-Display layout — a second swappable UI variant (user spec, `develop`).** Per the "Plant
  Display Redesign" spec, added a Dev-tab **UI Layout** selector (`#uiLayout`: "Control Room (current)"
  ↔ "Plant Display (new)") that toggles a `layout-plantdisplay`/`layout-classic` class on `.app`;
  persisted to `localStorage` (`rd_ui_layout`), with a `?layout=` URL override. The classic board is
  untouched under `layout-classic`. The new layout keeps the CSF gauge bar, strip chart, alarm panel,
  and right sidebar, and replaces the tabbed control strip + synoptic table with:
  - **System Status Bar** — per-plant fixed slots (4 states: normal dim / running green / caution amber
    / alarm red-flash) with badges and group separators, rebuilt on engine switch; a right-aligned
    `SCRAMMED` badge. **ECCS/AFW auto-actuation reads ALARM (red) until the operator acknowledges it**
    (click the slot → green) or RUNNING immediately if operator-initiated (`ui.pdAck`/`ui.pdOp`).
  - **View switcher** — Diagram / Primary / Secondary / All, default **Primary**, **auto-switches to
    Diagram on scram**; an always-visible compact 2-click-arm SCRAM at the right (emergency reach from
    any view).
  - **Diagram** view: placeholder until the SVG ships, plus the critical-only controls per §5 (rods,
    ECCS/EPS/ADS, MSIV). **Primary/Secondary** cards: per-plant sections + full controls + a dim
    cross-indication strip (the other side's heat-removal-relevant params). **All** view: the numeric
    grid with its own Instruments/True/Both overlay toggle. **Subcooling** gets the §9 special treatment
    (larger text, warn <22 °C / alarm <11 °C / `SATURATED` ≤0). PWR/RBMK/BWR all mapped.
  - Implementation notes: views build once (controls via the shared `ctlGroup`; param value-slots
    updated each frame) so number inputs keep focus. A `{t,cls}` row form was added for explicit
    per-row severity (e.g. PORV-block "open" must NOT read as the PORV-open alarm). Unmodeled
    slots/controls (MSIV on PWR/RBMK, Cont. Iso) stay dim/`normal` — no faked state (MSIV is wired
    only on the BWR via `msiv_closure`). Engine/layer suites untouched (UI-only).
- **Plant Display promoted to the ONLY UI; rod control reworked (user, `develop`).** The user approved
  the Plant Display, so the classic Control Room was removed entirely: the tabbed control strip + the
  synoptic numeric grid (and their `buildControls`/`buildNumeric`/`renderNumeric`/`renderRodBars`/
  `renderControls`/`setupScramCover` functions, the `scram-box`/guard-cover, the Dev-tab UI-Layout
  selector, and the `localStorage`/`?layout=` mechanism) are gone. Plant Display is now unconditional
  (the `layout-*` classes were dropped). The Settings → Values Display toggle now drives the All view;
  the FF badge moved into the view area.
  - **Rod control — press-and-hold + smooth nudge (Flag F8-adjacent, ENGINE change).** Withdraw/Insert
    are now **hold-to-move** (pointerdown → `rod_start` at the selected speed, release anywhere →
    `rod_stop`); the Stop button is gone; rod speed (Slow/Norm/Fast) stays. The instant `+1/−1` was
    replaced by a **rate-limited nudge**: `rod_nudge {steps,speed}` now sets a `nudge_target` and drives
    toward it at the rod velocity instead of snapping, so a single step takes the same time as a held
    drive and is **sim-time-correct under time acceleration** (a wall-clock UI timer would mis-fire).
    Implemented identically in all three engines' `_stepRods`/`applyCommand` (RBMK keeps its inverted
    insertion sign); `nudge_target` is cleared on scram/`rod_start`/`rod_stop` and round-trips in
    save/restore (it lives on the rod group). Caveat: rods only move while the sim is **running** (no
    time passes when paused) — acceptable since operating implies play. All scenario suites still green
    (the `control_response`/`physics_failures` tests that nudge rods run long enough to reach the
    target): PWR 11/11·51, RBMK 18/18·99, BWR 9/9·47. Verified the hold drives the bank (210→213 in 5 s
    at normal speed, power 100→101.7 %).
- **PWR primary-loop SVG diagram wired into the Primary view (user, `develop`).** Took the animated
  schematic from `pwr_primary_loop_diagram_v2.html` and embedded it in the **PWR** Primary view, above
  the controls, **replacing the parameter sections** there (`buildCard` renders `pd.primary.diagram`
  instead of `.pd-sections` when present; RBMK/BWR keep their sections — the diagram is PWR-only). The
  source file's slider/`requestAnimationFrame` sim is dropped; instead `renderDiagram(s)` drives the
  sensor `tspan`s (Power, Rod-ins, Subcool, Inventory, Press, PZR/SG level, PORV, T-hot/T-cold, RCP
  flow — all from the snapshot, unit-toggle-aware), the rod-gauge fill, the PZR + SG water levels, the
  flow-animation speed / `.stopped` state and pump spin (from `pump_flow_pct`), and the hot-leg warm
  tint (from T-hot) — called each broadcast while the Primary view is active. The schematic's CSS is
  scoped under `.pd-diagram` (its `--text`/`--border`/etc. vars clashed with the shell's), the SG tube
  bundle is built once (`buildDiagramBundle`), and the SVG is height-capped (240 px) so the controls
  fit below. UI-only; suites untouched.
- **PWR secondary-loop SVG diagram wired into the Secondary view (user, `develop`).** Same treatment
  for `pwr_secondary_loop_diagram_v2.html` → the **PWR** Secondary view (Steam Gen → turbine + generator
  → condenser → condensate/feed pumps), replacing its parameter sections; `renderSecDiagram(s)` drives
  Steam Flow, Steam Press, SG level, Turbine RPM, Output MW, Cond. Vacuum, Hotwell Temp (derived from
  vacuum), Feedwater Flow, the SG water level, and the flow/turbine-blade/pump animation speed. Both
  cards live in the DOM at once, so the secondary diagram's element ids are **prefixed `sec`/`sv`** to
  avoid colliding with the primary diagram's (both use `#loop`, `#sgWater`, `vSg`, …). One additive
  engine field: PWR `getTrueState()` now exposes **`steam_pressure_mpa`** (the engine computed it but
  never surfaced it) — the data-contract is additive-only, PWR suite still 11/11·51. Both diagrams are
  **PWR-only** (`pd.<view>.diagram` is set only on the PWR profile); RBMK/BWR Primary AND Secondary
  views keep their parameter sections (verified — nothing to "revert", they were never given a
  diagram). RBMK 18/18, BWR 9/9 untouched.
- **Plant-display layout overhaul + PWR full-loop diagram in the Diagram view (user, `develop`).**
  Restructured the plant-display so the **Diagram view stretches** to fill the vertical budget and the
  schematic is large/legible with no scroll bar. Changes: (1) the view switcher moved from a horizontal
  bar to a **vertical strip on the left** (`.view-switcher`, `flex:0 0 96px`, buttons stacked); (2) the
  view stack (`.view-area` + a shared `.pd-controlbar`) is wrapped in `.main-area` (`flex:1`) so it
  grows, with the chart/alarm `.bottom-row` now a fixed band (`flex:0 0 196px`); (3) the **SCRAM button
  is pinned to the right of one shared control bar** that is always visible — `populateControlBar()`
  rebuilds `#pdCtlRow` with the **active view's** controls on each `setView()` (Diagram→critical
  controls, Primary/Secondary→their control sets, All→none), replacing the old per-card `.pd-controls`;
  (4) per-view controls and the cross-check strip were removed from the cards (`buildCard` now returns
  only the diagram or the `.pd-sections` grid, which flex-fills the panel); (5) diagram SVGs fill the
  stretched area (`.pd-diagram svg.loop { height:100% }`, was a 240 px cap) and the scoped diagram
  fonts were bumped (~+15–25 %, e.g. `.lbl-val` 13→15 px) for legibility; the right column was narrowed
  (`flex 1 1 340`, max 380) to give the diagram more width. New file
  `pwr_full_plant_diagram_v2.html` integrated as `PD.pwr.plantDiagram` (the full primary+secondary loop)
  with **`fp`/`fv`-prefixed ids** (a third diagram coexisting with the primary/secondary ones, which
  reuse `#loop`/`#sgWater`/`vPower`…); `buildFullDiagramExtras()` builds its SG tube bundle / condenser
  tubes / turbine blades once, and `renderFullDiagram(s)` drives all 16 sensors (primary + secondary),
  the rod/PZR/SG levels, the two independent flow domains (`stopped-pri`/`stopped-sec` + separate
  `--flow-dur`/`--flow-dur-sec` + pump/blade speeds) and the warm tint — scoped to
  `[data-pdview="diagram"]`. `renderDiagram`'s warm-tint query was likewise scoped to
  `[data-pdview="primary"]` (three `.pd-diagram` now match). Default view is now **Diagram**. RBMK/BWR
  Diagram views keep the "SVG in development" placeholder (full-loop diagram is PWR-only). UI-only;
  PWR 11/11·51, RBMK 18/18·99, BWR 9/9·47 still green.
- **UI review pass: diagram polish + control-bar state fixes (user, `develop`).** Thorough
  correctness review of the plant-display UI (headless interaction harness + a read-only code audit).
  Diagram changes (all three PWR schematics): (1) **smoother motion** — added `transition: y/height .16s`
  on `.water`/`.rod-fill` and `transition: d .16s` on `.surface` so level/rod geometry interpolates
  between the 10–20 Hz broadcasts instead of snapping; and a `setVarQ()` guard so animation-duration
  CSS vars (`--flow-dur*`, `--spin*`, `--blade-dur`) are only rewritten when they actually change
  (re-setting them every frame restarted the dash keyframes → stutter); `durS()` coarsened to 2 dp.
  (2) **full-diagram layout** — turbine assembly raised 12 px so it no longer touches the condenser
  (polygon/clip/shaft/blades/label/RPM-tap); **Feedwater Flow** label moved down clear of the SG;
  **T-cold** label shifted left off the SG corner. (3) **tighter crop + centering** — viewBoxes set to
  the measured content bounding boxes (via `getBBox`): primary `40 108 821 360`, secondary
  `40 40 1018 449`, full `40 92 1160 394` — trims the dead side margins and centers each in its panel
  (also renders ~13 % larger). Correctness fixes from the audit: (A) the shared control bar is rebuilt
  per view, which **reverted typed setpoints** (Feed Reg/Turbine Load/recirc…) and the **rod-speed
  selection** to their hardcoded defaults on every view switch — now persisted (`ui.ctlVals` keyed by
  input id, re-applied in `ctlGroup`; rod-speed seg re-asserted in `populateControlBar`). (B) the
  **All-view overlay segment** (Instruments/True/Both) desynced from `ui.overlay` after an engine
  rebuild — `buildViews` now calls `syncSeg`. (C) removed the dead `_cross` branch in `renderPdRows`
  (the cross-strip was already gone). (D) the SCRAM auto-disarm timer no longer clobbers a "SCRAMMED"
  label if the plant trips from another cause while the button is armed. Verified by harness: view
  switch repopulates the bar (3/7/7/0 groups), SCRAM arms→fires, all 3 engines switch (slots 7/4/8),
  setpoint `42` + rod-speed Fast + overlay True all survive round-trips; no JS errors. UI-only;
  PWR 11/11·51, RBMK 18/18·99, BWR 9/9·47 still green.
- **RBMK + BWR balance-of-plant / electrical output — PWR-parity full-scope operation (user, `develop`).**
  Audit finding: both engines modeled reactor→coolant (+BWR safety systems) well but **stopped at the
  steam boundary** — no turbine/generator/condenser, no `mwe_output`, so they couldn't be operated
  full-scope like the PWR (which models turbine RPM+grid-sync, condenser vacuum, MWe, steam dump). The
  RBMK's `steam_to_turbine` was a *fixed* load with no `set_turbine_load`; the BWR's `set_turbine_load`
  set only a steam fraction. Added a behavioral turbine/condenser/generator to **both**, mirroring the
  PWR §6.8, plus a partial-power operating state each. **Additive & inert by default** — every existing
  suite re-confirmed green before new tests (RBMK 18/18, BWR 9/9), then extended.
  - **Shared model (mirrors `pwr_steam_generator.stepTurbine`):** grid-synced turbine holds rated speed;
    free-spinning it is driven by admitted steam and braked by windage (coasts down on a trip);
    condenser vacuum restores/decays on `condenser_cooling_available`; low-vacuum & overspeed trips.
    `mwe_output = steam_load · mwe_rated · (rpm/rated) · (vac/vac_rated)` — **electrical output tracks the
    steam actually drawn by the turbine** (a direct/drum cycle: reactor power the turbine doesn't take is
    dumped/relieved), so MWe follows load, not raw fission power. A **turbine bypass / steam dump** vents
    excess steam to the condenser to hold pressure on a load rejection.
  - **RBMK** (`rbmk_thermal.stepTurbine`/`tripTurbine`, `rbmk_config.turbine`): `steam_to_turbine` is
    now the operator load (default = P0, so the accident physics is byte-identical when untouched — the
    excursion still outruns the fixed draw). New commands `set_turbine_load {mwe}` / `set_steam_dump`;
    `turbine`/`mwe_rated=1000`/3000 rpm (50 Hz); steam dump auto @7.5 MPa (ordered below the 7.6 alarm /
    8.0 relief); instruments `turbine_rpm`/`condenser_vacuum`/`mwe_output`; new `50_percent` init state
    (orm 70, flow 80); new failures `turbine_trip` (trip_turbine) + `loss_of_condenser_vacuum`
    (vacuum_decay). **Suite 20/20 · 129** (was 18/18·99) — added `bop_pre`/`bop_post`.
  - **BWR** (`bwr_vessel.stepTurbine`/`tripTurbine`, `bwr_config.turbine`): `steam_flow_normalized` is the
    turbine draw; added rpm/vacuum/`mwe_output` (1800 rpm, `mwe_rated=1100`) and the steam dump — **gated
    on `condenser_cooling_available`** so it is **inert in station blackout** (no AC → no condenser), which
    is load-bearing: the SRVs alone hold vessel pressure and keep RCIC's steam drive alive → the
    **Fukushima timeline is unchanged**. `condenser_cooling_available=false` set on `full_blackout_bwr` and
    `post_scram_sbo`. New `50_percent` state runs reduced recirc (`recirc_pct:19` → power settles ~50% via
    the negative void feedback; tuned). New failure `loss_of_condenser_vacuum`; `set_steam_dump` command;
    dump setpoint 7.25 (above rated 7.03 so the §7.3 void-collapse transient still fires, below SRV 7.58).
    **Suite 10/10 · 63** (was 9/9·47) — added `balance_of_plant`. §7.3 turbine-trip transient preserved.
  - **New commands beyond CONTEXT §6.7** (additive; fold into §6.7 on next blueprint update, as with
    the earlier B2/D4/D6 additions): RBMK `set_turbine_load` + `set_steam_dump`; BWR `set_steam_dump`
    (`set_turbine_load` already existed). New `true_state`/`control_state` fields are additive-only, so
    M7's data-contract suite is unaffected; M4 picks up the two new per-engine failures as data (HR3).
  - **Discovered a pre-existing red gate → Flag F9.** M5/M6·PH/M7 each have one stale `rod_nudge`
    integration check (expects instant nudge; engine now rate-limits) — reproduces on clean HEAD,
    unrelated to this work. PWR 11/11·51 and M4 10/10 still green.
- **Blueprint reconciliation — folded all built engine/contract additions into the specs (user, `develop`).**
  Per "update the blueprint to match the code," folded every additive feature already built (and
  previously only logged here) into the source-of-truth specs, so `CONTEXT.md` + `M1/M2/M3` now
  describe what's actually built. **Scope:** engine + contract additions only; UI (M8) and pure `[tune]`
  deviations stay recorded here (this log remains the history/rationale, per "keep as historical record").
  - **CONTEXT.md** — `§6.3` true_state: PWR `steam_pressure_mpa` + reactivity proxies
    (`reactivity_pcm`/`startup_rate_dpm`/`reactor_period_s`); RBMK `reactivity_pcm` + BOP
    (`steam_to_turbine`/`mwe_output`/`turbine_rpm`/`condenser_vacuum_kpa`/`turbine_tripped`); BWR
    `lpcs_running`/`srv_manual_open`/`slc_active`/`slc_tank_pct`/`reactivity_pcm` + the same BOP fields.
    `§6.5` control_state: PWR `porv_block_open`/steam-dump; an RBMK-specific block; BWR `slc_active`; the
    shared `turbine_load_mwe`/steam-dump. `§6.7` command catalog: PWR `open/close_block_valve`,
    `set_steam_dump`; RBMK `set_turbine_load`, `set_steam_dump`; BWR `initiate/stop_slc`,
    `start/stop_lpcs`, `open/close_srv_manual`, `set_steam_dump`. `§6.9` named states: RBMK + BWR
    `50_percent`. **→ resolves the standing "fold into §6.7 on next blueprint update" note** for B1/B2
    (PWR block valve/steam dump), D1/D4/D6 (BWR SLC/LPCS/SRV), and the RBMK/BWR BOP commands.
  - **M1 (PWR)** — §6.4 PORV block/isolation valve (B1); §6.7 steam dump / turbine bypass (B2); new §8.9
    reactivity proxies (reactivity computer / SUR / period); §9 note that every failure carries `category` (C7).
  - **M2 (RBMK)** — §8.3 updated (`steam_to_turbine` = operator load, not fixed; steam-dump term); new §8.7
    turbine/condenser/generator BOP; §13 instrument table (+turbine_rpm/condenser_vacuum/mwe_output); §14
    `turbine_trip`/`loss_of_condenser_vacuum` failures + `category`; §15 `50_percent`; §17 contract list;
    §19 BOP acceptance paragraph; §20 params (turbine block).
  - **M3 (BWR)** — §6.1 steam-dump term; new §9.7 SLC (D1) / §9.8 LPCS (D4) / §9.9 manual SRV (D6); new
    §12.1 turbine/condenser/generator BOP (condenser-gated dump — Fukushima-preserving); §11 instrument
    table (+BOP); §13 `loss_of_condenser_vacuum`; §14 `50_percent`; §16 contract list; §17 save/restore
    list; §18 BOP acceptance paragraph; §19 params (LPCS/SRV/SLC/BOP).
  - **Not folded (by design):** `[tune]` value deviations (e.g. RBMK D2 retunes, BWR D2 `K_vessel_pressure`),
    load-order/module-system notes, and all M8 UI changes — these remain here as the built-vs-intent record.
    Flags F1–F8 unchanged; F9 (stale `rod_nudge` integration check) still open. No code changed; specs only.
- **Operator-manual enablers — SUR/period + startup states (user, `develop`).** Groundwork for building
  a full operator's manual per plant (data-driven: generated reference + engine-validated procedures).
  - **SUR / reactor period on RBMK + BWR (Phase 0a).** `getTrueState()` now exposes `startup_rate_dpm`
    (= 26.06·Ṗ/P) and `reactor_period_s` (= P/Ṗ) on all three engines (was PWR-only), from the smoothed
    power rate. RBMK gained the `_power_rate`/`_prev_power_pct` tracking BWR already had. Additive to the
    contract. Enables approach-to-criticality documentation.
  - **RBMK `hot_startup` subcritical state (Phase 0b) — WORKS.** Low power, no xenon, flow established;
    trimmed critical per-state at `orm_target`, then the control group is inserted `subcrit_margin_steps`
    (25) further so it starts SUBCRITICAL (no boron — the margin is rod position). Slow rod withdrawal →
    critical → controlled ascension to power, positive SUR, no runaway, **both versions**. Test-gated:
    `startup_pre`/`startup_post` (RBMK suite now **22/22 · 141**). The per-state `void_ref` pinning is what
    makes this clean (no standing void offset).
  - **BWR `hot_startup` — NOT PROVIDED (physics-model limitation, honest omission).** The BWR pins a single
    full-power `void_ref` (0.45); at startup (low void) the void reactivity is strongly positive, so the
    reactor self-drives to the **~44 % flow/void balance regardless of rod position** — no stable
    near-zero-power-with-flow point exists (verified across rod insertions 3–65 %). A real cold approach-to-
    criticality would need a **power-dependent `void_ref`** — a deferred physics upgrade that would require
    re-tuning against the flow-control + Fukushima suites. Documented in `bwr_config` and left out rather
    than faked (honesty principle). **→ open decision: accept (BWR manual starts from an operating point +
    a voiced simplification) vs. invest in the void-model upgrade.** BWR 10/10·63, PWR 11/11·51 green.
  - **RESOLVED (user chose: invest in the void-model upgrade).** Implemented as a **targeted
    per-state `void_ref` pinning scoped to the startup state only** — not a global tracking
    reference (probing showed that destabilized the proven flow-control / 50 % behaviors). In
    `BWREngine.reset()`: for a `subcritical` init state, pin `void_ref` at the state's low
    operating void and trim critical there (RBMK pattern), then insert the control group a margin
    (BWR `steps` = withdrawn → *decrease* steps). Every other state keeps the base full-power trim,
    so `full_power` / `50_percent` / `post_scram_sbo` and the Fukushima flagship are byte-identical.
    Added `hot_startup` to `bwr_config` + a `startup` acceptance test. **BWR now 11/11 · 69**; RBMK
    22/22 · 141 (`startup_pre`/`startup_post`); PWR 11/11 · 51. Specs synced (CONTEXT §6.3/§6.9,
    M2 §15/§19, M3 §14/§18).
- **Operator's manual — reference generator (Phase 0c + 1, `develop`).** `tools/gen_manual_reference.js`
  emits `ui/manual_data.js` (→ `RD.MANUAL`), the data-driven source for the coming in-sim help panel
  (and a later printable). **Reference sections are GENERATED from the live engine configs + a settling
  run so they can't drift:** setpoints/limits ← protection (trips/actuations/alarms); indications ←
  instrument set (ranges/lag) + linked alarms; failures ← failure catalog (display/category/severity);
  **normal values** ← running each named state and capturing true + indicated readings (operating states
  settle 60 s; transient/subcritical states captured near their initial condition). A hand-authored
  **both-register** (learning + industry) layer supplies control effects, indication meanings, plant
  overviews, and safety limits. Keyed by profile: `pwr`, `rbmk_pre`, `rbmk_post`, `bwr` (mirrors the UI
  engine selector). Re-run after any engine/config change. Verified: PWR full power reads 100 %/15.41
  MPa/1000 MWe/747 ppm/ρ≈0; RBMK `hot_startup` reads subcritical; BWR 1100 MWe. Phase 2 (authored +
  engine-validated procedures) and Phase 3 (M8 help panel) still to come.
- **Operator's manual — normal procedures, authored + engine-validated (Phase 2 part 1, `develop`).**
  `ui/manual_procedures.js` (→ `RD.MANUAL_PROCEDURES`, keyed pwr/rbmk_pre/rbmk_post/bwr) holds
  **authored, both-register** procedures as structured steps (command + hold), each with a
  **declarative `validate` block**. `test/run_procedures.js` drives every procedure through its engine
  from the stated initial state and asserts the outcome — so nothing ships unproven. **12/12 · 34
  checks**: per profile a startup / raise-power / shutdown. Validation supports `final` (end-state
  predicates), `never_melted`, `saw` (a condition held at least once — e.g. SUR>0 during ascension),
  and `never` (a condition that must never occur — e.g. `fuel_temp_c >= 1200`, proving no fuel damage).
  - **Honest simplification surfaced (startup overshoot).** Approach-to-criticality can't be held at a
    fine low power in the lumped models — RBMK/BWR climb gently (slow, per-state-pinned) but the **PWR
    overshoots** (single lumped control group, Doppler-only prompt feedback, no fine trim), settling
    high after a spike (fuel stays < 1200 °C — no damage). The procedure voices this plainly (real
    approach-to-criticality is finer and neutron-source-driven) rather than faking a clean hold. The
    validated claims are the robust, honest ones: subcritical start → positive SUR → power rises → no
    fuel damage.
  - **Phase 2 part 2 — emergency procedures, accident walkthroughs, alarm response (`develop`).**
    Added to `ui/manual_procedures.js`: an **engine-validated emergency procedure per plant** (PWR loss
    of main feedwater → trip + AFW; RBMK MCP trip → AZ-5; BWR station blackout → RCIC) and the **three
    flagship accident walkthroughs** as *narrative* procedures (PWR TMI, RBMK Chernobyl pre/post
    comparison, BWR Fukushima). The harness (`test/run_procedures.js`) skips `narrative` procedures
    (marked `NARR`) — the accidents' physics is owned by each engine's flagship acceptance suite
    (CONTEXT §9), not re-run through the manual harness. **Procedures 16/16 · 43 checks** (3 startup +
    3 power + 4 shutdown... ) plus 4 narrative accidents. Alarm response: authored both-register
    cause+action guidance in the generator (`ALARM_RESPONSE`, `buildAlarmResponse`), attached as
    `RD.MANUAL[profile].alarm_response` (authored for key alarms; priority-based default otherwise).
    Panel gained **Accidents** and **Alarm Response** sections (`mAccidents`, `mAlarms`); Procedures now
    excludes accidents. Verified by headless-Edge screenshots (PWR Alarm Response, BWR Fukushima
    walkthrough). Engine suites unaffected (PWR 11/11, RBMK 22/22, BWR 11/11). **The operator's manual
    is now feature-complete for v1** (reference + normal + emergency + accidents + alarm response, both
    registers, in-sim panel); only the printable export remains (deferred).
- **Operator's manual — in-sim help panel (Phase 3, `develop`).** A full-screen **Operator's Manual**
  overlay in M8, opened by a `📖 Manual` button in the sim controls (or the `?manual[=section]`
  deep-link). Renders `RD.MANUAL` + `RD.MANUAL_PROCEDURES` for the **active engine profile**
  (`ui.engineKey` → pwr/rbmk_pre/rbmk_post/bwr) and is **register-aware** (its Learning/Industry toggle
  drives the global `set_register`). Left-nav sections: Overview, Procedures, Controls, Indications,
  Setpoints & Limits, Normal Values, Failures. Procedures show the "validated by the engine" note,
  per-step actions/notes/command hints; setpoints/alarms show color-coded priority pills; all tables
  are generated from the live data. Re-renders on plant switch. Files: `ui/shell.html` (button +
  overlay + script loads), `ui/shell.css` (`.manual-*` styles), `ui/app.js` (`openManual`/`renderManual`
  + section renderers `mOverview`…`mFailures`, using local `mesc`/`mreg` to avoid clashing with the
  existing attribute-only `esc`). Verified by headless-Edge screenshots (PWR overview/setpoints, RBMK
  pre-1986 procedures) — renders correctly, on-theme, profile- and register-aware. UI-only; engine and
  procedure suites unaffected (PWR 11/11, RBMK 22/22, BWR 11/11, procedures 12/12).
  - **Remaining for the manual:** Phase 2 part 2 (alarm-response + abnormal/emergency + accident
    walkthroughs), and a later printable export (deferred per user).
- **Operator's manual v2 — single integrated voice + actionable, Instructor-grade procedures (`develop`).**
  Per user feedback the manual was redesigned from a two-register toggle into ONE authoritative
  operating manual, and made the **source of truth for the Instructor (M6)**. Plan: `Blueprint/
  OPERATOR_MANUAL_PLAN.md`. Decisions (locked with the user): single integrated voice (spell out +
  acronym, e.g. "Steam Generator (SG)"); on-screen control names in procedures with the internal
  command API moved to a **Dev/Commands** appendix; **every step carries `control` + `target` +
  a machine-checkable `acceptance` predicate** (the same predicate the harness asserts and M6 will
  gate/grade on — one artifact); cold startup / RCP warmup / cooldown are **out of physics scope**
  (engine starts hot) and marked narrative.
  - **Generator (`tools/gen_manual_reference.js`)** rewritten to single voice: overviews, controls
    (`control`/`uses`/`command`), indications (`name`/`measures`), alarm-response (`means`/`response`),
    and a per-plant **Glossary**. No `_learning`/`_industry` split. Regenerated `ui/manual_data.js`.
  - **Procedure schema (`ui/manual_procedures.js`)** rewritten: `{id,category,title,purpose,from,
    prereq[],cautions[],steps[],guard,outcome}`; step `{text,control,target,cmd,hold,acc,saw,note}`.
    **Harness (`test/run_procedures.js`)** checks each step's `acc`/`saw` + proc `guard` — **21/21 ·
    73 checks (4 narrative)**. PWR authored richly as the template (startup w/ SUR ≤ 1 DPM & period
    ≥ 30 s, raise/lower power, pressure & SG-level control, shutdown, loss-of-feedwater, RCP trip,
    **stuck-PORV recovery via block valve**, TMI). RBMK/BWR ported to the new schema (rich authoring
    of their full normal + failure sets is the next phase).
  - **Panel refit (`ui/app.js`, `ui/shell.html`, `ui/shell.css`)**: dropped the manual register
    toggle; renders integrated voice, rich steps (control chip + Target + "✓ when" acceptance +
    cautions + outcome), controls-by-label, and added **Glossary** and **Dev/Commands** sections.
    Verified by headless-Edge screenshots (Procedures, Controls, Glossary). Engine suites unaffected
    (PWR 11/11, RBMK 22/22, BWR 11/11).
  - **Next (phased):** rich RBMK & BWR normal procedures with targets/acceptance; full per-plant
    failure procedures (decision: every modeled failure); humanize the `✓ when` param labels; then
    the M6 Instructor consumes `acc`/`guard` directly.
- **CONTEXT §12 + manual maintenance rule; manual polish; linear scram (`develop`).**
  - **CONTEXT.md §12** added: documents the operator's manuals (single-voice; source of truth for
    M6) and a **HARD MAINTENANCE RULE** — any sim change that affects the manual must re-run
    `tools/gen_manual_reference.js`, update procedures, re-run `test/run_procedures.js`, and add new
    UI acronyms to the glossary. The procedure suite + generator are part of the acceptance gate for
    sim-facing changes.
  - **Manual panel:** removed the meta/filler notes (accidents "validated by the acceptance suite…"
    text, procedures dev note) and the **Dev/Commands tab** (coder-only; the command mapping stays in
    `RD.MANUAL[*].controls[].command` data + the plan doc). Register toggle already gone (v2 single voice).
  - **Scram made linear (PWR + BWR).** Reported "rods didn't go down on scram" — engine was correct
    (rods DID insert, power fell) but PWR/BWR scram velocity was exponential (`steps/t`) so rods
    asymptoted toward fully-in (crawl near the end) rather than reaching it. Changed to constant rate
    (`max_steps/t`): PWR rods now reach fully-in in 2.5 s (92%→0%), decisive/visible. RBMK was already
    linear. Suites green (PWR 11/11, RBMK 22/22, BWR 11/11, procedures 21/21). The diagram rod
    indicator IS wired to `position_pct` (renderFullDiagram); a view-specific refresh check is folded
    into the Group-A UI pass.
  - **Plan for the batch (user-confirmed):** do **Group A UI fixes first** (scram rod-display verify,
    PZR heater + manual spray sliders w/ cold-leg suction, acronym spell-out "Full Name (ACRONYM)"
    across the UI, manual auto-units, glossary=all-acronyms, "Follow in Instructor" button on
    procedures/accidents/failures), then a **control audit**, then **full CVCS** (charging pump +
    letdown valve + boron + safety injection + leakage make-up), then **new aux systems** (BWR
    Isolation Condenser, RBMK ECCS) + extra failure modes. Q&A on turbine/condenser/TCV/steam-dump/
    behavior recorded in session.
  - **Group A progress (`develop`):** **A1** scram made linear (done, above). **A3** acronym spell-out —
    gauges (top bar) and numeric-grid labels across all plants now "Full Name (Acronym)" (e.g. "Avg
    Coolant Temp (Tavg)", "Pressurizer Level (PZR)", "Operating Reactivity Margin (ORM)"); controls
    already followed the convention. **A4** the manual now converts dimensioned values to the active
    unit toggle (US/SI) — normal values, indication ranges, trip/alarm setpoints (via `MDIM`/`mval`
    reusing the board's `conv`/`unit`); alarm names show "Learning (INDUSTRY)". **A5** glossary
    expanded (added DPM, MWe/MWt, ECCS) to cover UI acronyms; regenerated. Suites green (PWR 11/11,
    procedures 21/21). **Remaining Group A:** A2 (PZR heater + manual spray sliders, spray from the
    cold leg) and A6 ("Follow in Instructor" button on procedures/accidents/failures).
  - **Group A complete (`develop`).** **A6** — each procedure/accident card has a "▶ Follow in
    Instructor" button; it loads the procedure into the Shift-Supervisor block and steps through it
    (Prev/Next/Restart/Stop), showing each step's text, Control, Target, and a LIVE "✓ when … met /
    not yet" acceptance check against the current snapshot — so the user follows it while operating.
    `ui.follow` state; `renderInstructor` defers to `renderFollow` when following; `?follow=<id>`
    deep-link. **A2** — Pressurizer Heaters and Pressurizer Spray are now manual **% sliders + Auto**
    (ctlGroup renders slider AND buttons); `set_heater {auto}` / `set_spray {auto|pct}` engine
    support; **spray draws from the cold leg after the RCP** — spray effectiveness scales with primary
    `flow_frac` (no RCP flow → no spray). The live control bar lives in the **PD** per-view control
    lists (PROFILES.controls is legacy); updated the PD Primary list. Suites green (PWR 11/11, RBMK
    22/22, BWR 11/11, procedures 21/21). Added `?view=` deep-link. **Next:** control audit (B), then
    full CVCS (C), then new aux systems (BWR Isolation Condenser, RBMK ECCS) + extra failures.
  - **Group B — control audit (`develop`).** Cross-referenced each plant's engine operator commands
    against the live PD control lists + the `ACTS` map. **Findings & fixes (modeled command with no UI
    control, or BOP not surfaced):**
    - **RBMK:** `set_turbine_load` and `set_steam_dump` had NO UI, and the BOP readouts (electrical
      output, turbine RPM, condenser vacuum) weren't shown anywhere — the RBMK made 1000 MW invisibly.
      Added a **Turbine / Condenser** readout section + **Turbine Load** and **Steam Dump** controls to
      the secondary view.
    - **BWR:** `set_steam_dump` had no UI; `stop_slc` / `stop_lpcs` had start-only controls; BOP
      readouts not shown. Added **Steam Dump** control, **Stop** on Core Spray + SLC, and electrical
      output / turbine RPM / condenser vacuum readouts to the secondary view.
    - **PWR:** `set_dhr` (Decay-Heat Removal) and manual `open_porv`/`close_porv` had no UI. Added a
      **Decay-Heat Removal (DHR)** control and a manual **Relief Valve (PORV)** Open/Close control to
      the primary view; renamed RCP control to the spelled-out form.
    - New `ACTS`: `rbmk-turbine-set`, `porv-open`/`porv-close`, `dhr-on`/`dhr-off`, `slc-stop`,
      `stop-lpcs`. All map to existing engine commands. Verified by headless screenshots (RBMK/BWR
      secondary, PWR primary). Suites green (PWR 11/11, RBMK 22/22, BWR 11/11, procedures 21/21).
    - **Noted, not changed:** PWR "MSIV" is a labeled placeholder (MSIV not modeled on the PWR — only
      the BWR has `msiv_closure`); left as-is with its "placeholder here" hint. A real PWR MSIV is a
      candidate for the aux-systems phase.
  - **Group C — full CVCS (PWR, `develop`).** Modeled the Chemical & Volume Control System as operator
    systems. **Boron chemistry decoupled** from net charging−letdown (the old
    `boron_ppm += boron_rate·(charging−letdown)` was non-physical): new `boron_adjust` (ppm/s) driven by
    `set_boron_adjust {rate}` (+borate/−dilute/0 hold), gated on the charging pump. **Charging pump**
    (`set_charging_pump {running}`, gates charging + boration), **letdown valve** (existing
    `set_letdown_flow` + Isolate), and **auto make-up** (`set_cvcs_auto {active}`) that modulates
    charging to hold primary inventory up to `charging_max` — leakage compensation. Config
    `boron_adjust_rate`/`cvcs_makeup_gain`/`charging_max` (pwr_config); logic in `pwr_primary.stepInventory`;
    `set_charging_flow` now also drops auto (manual override). Safety injection = HPI (existing). Spray
    already draws from the cold leg after the RCP (Group A). **Auto make-up defaults OFF** and
    `charging_max` (0.06) covers normal leakage but not a LOCA, so the flagship/TMI behavior is intact
    (PWR 11/11). UI: PWR primary gains Boron (Borate/Hold/Dilute), Charging Pump (On/Off + slider),
    Letdown Valve (slider + Isolate), and CVCS Inventory Control (Auto/Manual); numeric grid shows
    Charging/Letdown + CVCS Mode. New commands beyond CONTEXT §6.7 (`set_charging_pump`,
    `set_cvcs_auto`, `set_boron_adjust`) folded into §6.7 + M1 §6.5 + regenerated `RD.MANUAL` (per the
    §12 maintenance rule). Verified: borate 747→807 ppm drops power to 39 %; auto make-up holds
    inventory ~99 % against a leak that otherwise drains to 0 %. Suites green (PWR 11/11, RBMK 22/22,
    BWR 11/11, procedures 21/21). **Next:** new aux systems — BWR Isolation Condenser, RBMK ECCS + extra
    failure modes.
  - **New auxiliary systems (`develop`).**
    - **BWR Isolation Condenser (IC)** — the passive heat sink Fukushima Unit 1 relied on. `set_ic
      {active}`; while condensing it lowers vessel pressure (`ic_condense_rate`) and conserves inventory
      (`bwr_vessel.stepVesselLevel` zeroes boiloff), holding the core covered on decay heat with **no AC
      and no injection**. DC-valve: on battery depletion in an SBO the IC closes (`ic_active→false`) and
      boiloff resumes — the Unit-1 story. Failure `ic_failure` (valves shut). UI: control + readout +
      status slot on the BWR secondary. New acceptance test `isolation_condenser` (BWR 12/12): level
      held ~50 % for hours, then uncovers once DC is lost.
    - **RBMK ECCS** — Emergency Core Cooling for a pressure-tube rupture. `set_eccs {active}` (engine
      step 9c, after the rupture drain): makes up steam-drum level (`eccs_level_rate`) and holds a
      cooling-flow floor (`eccs_flow_floor`), arresting the drain/dryout. UI: control + readout + status
      slot on the RBMK primary. New acceptance test `eccs` (RBMK 23/23): rupture drains the drum, ECCS
      recovers level and holds the flow floor.
    - Specs updated per the §12 rule: config (`bwr_config.safety.ic_condense_rate`,
      `rbmk_config.thermal.eccs_level_rate`/`eccs_flow_floor`); contracts; CONTEXT §6.7 (`set_ic`,
      `set_eccs`); M2 §8 + M3 §6.2; regenerated `RD.MANUAL` (BWR 20 controls / 15 failures incl. IC;
      RBMK gains ECCS control + glossary). Suites green (PWR 11/11, RBMK 23/23, BWR 12/12, procedures
      21/21). The RBMK/BWR failure catalogs were already broad (14 / 15 modes); no further failures
      added this pass beyond `ic_failure`.
  - **Rod control: per-state positions + operable shutdown bank (`develop`).** Fixes the report
    "rods always start fully withdrawn no matter the starting state" and the ask to model the
    shutdown group properly.
    - **Per-state control-rod position.** The control-group operating position is now per-state
      data (`initial_states[name].rod_op_pct`, % withdrawn) instead of one fixed
      `control_op_position_pct` for every state, so the starting rod position tracks starting
      power. **PWR:** 50 % now sits at 78 % withdrawn vs 92 % at full power (boron auto-re-trims
      via `_trimToCritical`; 50 % holds ~50 % with sane boron ~696 ppm). **RBMK:** 50 %
      `orm_target` 70→90 → 57.5 % withdrawn vs 66.7 % at full power, ORM healthy (89.8, above both
      `orm_min`s), holds 50 % (both versions); `rho_excess` auto-re-trims per state. **BWR:
      deliberately NOT changed** — a BWR maneuvers with recirc flow, not rods (CONTEXT §5), and its
      `rho_excess` is a fixed full-power constant with a void-equilibrium 50 % point; deepening the
      rods was both physically misleading and numerically fragile (per-state trim makes rod depth
      cosmetic; no-trim needs a recirc knife-edge near runaway), so the BWR keeps rods at the
      operating position and drops recirc to 19 %. Documented in `bwr_config`/`bwr_engine` comments.
    - **Operable shutdown bank.** The shutdown / RBMK-AZ group (previously "not an operator
      control", M1 §7) is now operable via the existing `rod_start`/`rod_stop`/`rod_nudge` with
      `group_id: "shutdown_rods"` — the engines already routed to any group. A **scram always
      overrides** (the per-step scram velocity re-asserts insertion every tick; verified the AZ bank
      fully inserts over its 18 s scram despite the operator spamming Withdraw). UI: a "Shutdown
      Bank" hold-pill (Withdraw/Insert) on every plant's Reactor Core + Plant-Display control bars;
      the hold mechanism now tracks the held group so release stops the right one; Control/Shutdown
      bank readouts show motion/scram status. M1 §7 note updated to reflect the deviation.
    - **Other rod issue found + fixed.** The M5/M6·PH/M7 "rod_nudge reached the engine" checks were
      **pre-existing failures** — they asserted an *instant* nudge, but a nudge drives to its target
      at rod speed (M1 §7). Fixed the tests to step the sim until the target is reached (they now
      pass; the engine was correct).
    - Specs/manual per the §12 rule: `RD.MANUAL` regenerated (RBMK 50 % ORM baseline 70.3→89.8; new
      "Shutdown bank" glossary term all plants); `test/manual_ui_map.js` mirror gains "Shutdown
      Bank". Suites green (PWR 11/11, RBMK 23/23, BWR 12/12, M4 10/10, M5 12/12, M6·PH 8/8, M7
      31/31, E2E 20/20, procedures 21/21, control audit + manual-follow PASS).
- **PWR full-plant synoptic + margin cards (`develop`)** — implements
  `Blueprint/new_diagram_controls.md` Appendix A (spec authority; engine handoff
  `inbox/pwr_synoptic_handoff.md`, prerequisites already gate-green).
  - **New module `ui/diagram/pwr_synoptic.js` + `pwr_synoptic.css`.** One integrated schematic
    (viewBox 1200×640, reactor → SG → turbine-over-condenser → cooling tower per the reference
    image; steam leaves the SG top-right and runs right-then-down to the governor). 12 margin
    cards in tuned anchor zones (left column: Power & Reactivity / Rod / Emergency; top strip:
    Relief / PZR / Steam & Flow; right column: Plant Status / Turbine-Gen / Condenser / Primary
    Flow & Inventory; mid slots: SG Heat & Level and RCP between the legs), plus the two
    **embedded panels** (`pwCvcsPanel` on the CVCS box face, `pwAccumulatorPanel` on the tanks —
    not margin cards). Leaders are drawn in a stage-pixel overlay SVG from each card edge to its
    `pw*Anchor` and reconnect on resize (ResizeObserver); prominent + dash-animated on hover.
  - **HR1 / Animation HR1 enforced in code paths, verified by harness.** Realistic mode reads only
    `snapshot.instruments`, §8.8 status booleans, and `control_state` commanded pose (block valve,
    heater/spray %, rod banks). Loop dashes/RCP impeller run from `rcp_running` status at fixed
    speed (4 s coastdown on the true→false edge — no `pump_flow_pct`); relief animation keys off
    `porv_indicator` (+ block open); dump/governor/charging/letdown/LPI/accumulator animation off
    their instruments. Learning adds SUR, deception duals (PORV, boron, active instrument
    failures), contextual xenon/fuel text chips (no raw `fuel_temp_c`), Cherenkov/fuel glows, and
    a true-position relief ghost during TMI; Physics Overlay (Learning-only toggle in Settings,
    hidden in Realistic) adds ρ/period, inventory/void, P–S ΔT, loop flow, and the subcool ghost
    cursor (overlay + failed-P/T-sensor lesson only).
  - **PZR card = strict accordion** (pressure ↔ level, headline value shown in the collapsed
    header). Deviation from a literal "both sections expand": bounds the card height so the
    auto-expanding level section (TMI / level extremes) can never slide over the SG card below —
    the collapsed section still shows its headline number, so nothing is lost. User clicks pin the
    section until the priority episode changes.
  - **"What matters now"**: TMI combo (`stuck_porv_open` + `porv_indicator_stuck_closed`) pulses
    the subcool bar, PZR card (level section auto-selected), Relief card + `gRelief`, and their
    leaders — not the whole board. ECCS actuation auto-selects the matching Emergency tab
    (HPI | AFW | RHR/LPI) and dots the tab. Alarm-tile hover highlights the mapped diagram node +
    card + leader (M1 §9 table).
  - **Legacy PWR plant display retired** in `ui/app.js`: 4-view switcher, `fp*`/`sec*`/`loop`
    partial SVGs + their renderers, PD control rows, PD.pwr, and the PWR numeric/controls profile
    blocks are deleted (~470 lines); `plant_id === 'pwr'` mounts the synoptic in the view area
    (`.app.pwr-synoptic` hides the legacy chrome; chart+alarms keep ~34–38 % of the column).
    RBMK/BWR keep the legacy display unchanged (screenshot-verified). New ACTS: `rhr-on/off`,
    `lpi-on/off` (`set_rhr`/`set_lpi`), `dump-set` (`set_steam_dump {pct}`); every synoptic
    `data-act`/`data-hold` cross-checked against the ACTS/HOLD maps. Two-step SCRAM cover lives on
    the Rod card. Pause (`metadata.running === false`) freezes all diagram motion via CSS and
    shows the centered `SIMULATION PAUSED` overlay.
  - **Dev conveniences** (`?mode= ?phys=1 ?inject=a,b ?ff=secs ?run=1` URL params) added for
    headless screenshot/acceptance work. **`ui/test_panel/synoptic_check.html`**: 55-check DOM
    acceptance harness (manifest ids + anchors live, mode gating, TMI Realistic = lying indicator
    with NO relief animation + auto-expanded level section + pulses, Learning dual + ghost,
    spray-needs-RCP, accumulator idle/active UI, pause freeze, two-step SCRAM, hover contract,
    chips) — 55/55 green headless.
  - **Known deferrals:** click-popover fallback for crowded components (panels are always visible
    at 1280×800, so nothing is unreachable); `primary_void_fraction` is not exported by
    `getTrueState` today, so the overlay Void row guards to `—` (engine addition deliberately not
    made — no engine work in this pass); `pwTapSteamFlow`/`pwTapVac` optional taps omitted (their
    readings live on the Steam & Flow / Condenser cards per A.2c "optional").
  - Suites green after the change: PWR 12/12·57, M7 OK + teeth, E2E 25/25, M4 10/10 — engines
    untouched.
- **Synoptic v3 — screenshot review fixes (`develop`).** User review at ~2000×1220 exposed that
  stage-percentage card placement scattered cards into letterbox space and onto equipment at
  larger windows, the CVCS panel drifted off its box, vessels didn't match the reference
  schematic, and number inputs clipped ("1000" → "1…").
  - **Cards/panels are now anchored in SVG user units** (`PLACE {sx, sy}` + `positionCards()`
    mapped through the same viewBox transform as the diagram, clamped to the stage) — cards hug
    their equipment at any window size; leaders stay short. The CVCS panel sits on the box face
    (clamped up only on short stages).
  - **Reference-shaped vessels** (`inbox/Schematic-diagram-of-a-pressurized-water-reactor.png`):
    domed RPV with hemispherical bottom, prominent fuel rods in the core barrel, and control/
    shutdown rod drives entering through the head — rod length below the drive bridge animates
    with inserted depth (green control bank, violet shutdown bank). SG is a domed shell with a
    **nested inverted-U tube bundle** (4 concentric U's with flow dashes), tube sheet, and a
    divided bottom plenum; U-tube-top reference line retained. PZR is a capsule on the hot leg.
  - **Relief tank relocated** into the RPV↔PZR gap — it previously overlapped the reactor vessel
    (visible in the user's screenshot). T-hot tap label moved below the hot leg; tap labels are
    compact backed boxes; steam header re-routed (SG shoulder → right → down through governor).
  - **CVCS panel slimmed to 4 rows**: charging/letdown setpoints now apply on change/Enter
    (no Set buttons — synoptic `change` listener issues `set_charging_flow`/`set_letdown_flow`),
    so the panel fits the box even at 1280×800 with the charging pump visible. Number-input
    spinner buttons hidden (they ate the digits); inputs widened.
  - Verified at 1280×800 and 2000×1220 (steady + TMI); DOM harness 55/55; PWR 12/12·57, M7 OK,
    E2E 25/25, M4 10/10.
- **Load Mode — turbine/feed simplification (all plants).** Replaced decoupled MW load +
  feedwater % knobs with one mental model: **Follow Reactor** (default), **Manual** (MWe slider),
  **Disconnected** (0 MWe). Shared `engines/load_mode.js`; PWR/RBMK/BWR engines call it each
  step; feed auto-couples unless `set_feedwater_flow` decouples. **SCRAM → disconnected + turbine
  trip** (realistic load rejection). UI: PWR synoptic Turbine-Generator card (mode seg + slider),
  SG imbalance annunciator; RBMK/BWR control bands match. Phase C: `scenarios/pwr_sg_flood.js` +
  `setup_commands` on scenario load. Spec: `Blueprint/load_mode_spec.md`. Legacy
  `set_steam_demand` / `set_turbine_load` retained (force manual + set target).
- **Operations test suites (external, all plants) + first tuning harvest (`develop`).** New
  `test/ops_harness.js` + `test/ops_{pwr,rbmk,bwr}.js` + `test/run_ops.js`: 66 scenarios that run
  each engine UNDER the real M4 layer (trips/actuation/interlocks/interception live, protection
  evaluated at M5 broadcast cadence — including its scaling with time acceleration). Two families:
  `ops_*` (realistic evolutions, scripted operator: load-follow, startup, shutdown, paced cooldown,
  xenon hold, LOFW/SGTR/SBO/ATWS) and `abuse_*` (player behavior: yanks, walk-aways, command spam,
  256× acceleration, un-scram attempts). RBMK scenarios run for BOTH design versions. Failing
  checks are deliberate tuning targets; findings + priority list in
  `Diagnostic/OPS_TUNING_REPORT.md`, raw data in `Diagnostic/ops_results.json`.
  **Fixed during the harvest:** (1) BWR RCIC auto-actuation unit bug — `fw_flow low 5.0` compared a
  normalized (0–1.2) instrument against 5.0 → RCIC always on, vessel flooded, spurious 5.52 MPa
  low-pressure trips on every assembled-stack BWR run (engine suites bypass M4, so only the ops
  suite could see it); setpoint → 0.05, and the RCIC level start moved 50.0 → 45.0 (σ=0.5 noise at
  the nominal 50.0 level hair-triggered it). Manual regenerated; BWR/M4/M5/M7 suites green.
  (2) `tools/gen_manual_reference.js` and `test/run_procedures.js` crashed on load (missing
  `engines/load_mode.js` require) — both fixed; procedures 20/21 (the `bwr_sbo_rcic` failure is
  report finding B3: RCIC capacity loses to post-trip boiloff, pre-existing physics tuning).
  **Headline open findings:** PWR/BWR high-flux trips unfireable (power_range meter caps at the
  120 setpoint; RBMK precedent says widen to 200); post-1986 RBMK can still steam-explode from the
  xenon pit (violates the comparison lesson's design intent); BWR lacks a pressure regulator so
  any uncoordinated power drop trips vessel-pressure-low; PWR SGTR drains inventory ~30× too fast
  and melts at pressure with no auto-SI; a by-the-book PWR shutdown cannot avoid the pzr-level
  trip (partial-load Tavg/SG-pressure program inverted); protection latency grows with time
  acceleration; no RPS reset path after any trip (forgiveness gap).

- **2026-07-07 — Working-tree regression recovered from session checkpoints.** On the evening of
  Jul 6 (≈21:40–21:44), a bulk file drop delivered the load-mode feature (`engines/load_mode.js`,
  Turbine-Generator card Mode seg + load slider, feed auto-coupling, `pwr_sg_flood` scenario,
  Dev-tab diagnosis-export markup) but replaced `ui/app.js` with a pre-synoptic snapshot of the
  profile architecture — silently reverting the synoptic mount, the M6 training tab, rewind, and
  Diagram Mode / Physics Overlay. Commit `cf480f9` unknowingly captured that regressed app.js.
  Recovery: `ui/app.js` restored from the Claude Code file-history checkpoint of the M6 training
  session (post-edit snapshot, verified against transcript edit replay), plus four ACTS additions
  so the batch's synoptic load-mode card is live (`load-follow`, `load-manual`,
  `load-disconnect`, `spray-off`). All other batch files were confirmed to be the good versions
  plus genuine improvements and were kept. Verified: M6 16/16 suites, synoptic + cards render,
  training tab lists 3 scenarios + 9 walkthroughs. Remaining gap: scenario suite 2/3 —
  TMI-recovery "Averted" beat no longer fires after the Jul 6 engine retuning (tuning target,
  not UI).

- **2026-07-07 — Session-diagnosis export rebuilt (Dev tab).** Forensics identified the Jul 6
  file drop as a Grok agent session (its `mcps/grok_com_*` scaffolding is stamped 21:39). Grok
  built the diagnosis export live (the user's two `Diagnostic/rd_diag_*.json` test exports prove
  it worked at 20:46/21:06) and then erased its own handler in the same stale-base `app.js`
  write-back that clobbered the synoptic. Rebuilt in app.js against the exported files as the
  schema contract (`schema_version 1.0`, kind `reactor_dynamics_diagnosis`): 1 Hz true-state
  timeseries (per-plant field maps, ~4 h ring), alarm-transition/scram/session_start events,
  command log with blocked/error flags, full `service.saveState()` as `snapshot_end`, manifest
  (plant, engine key, init state, scenario, follow procedure, seed, sample_hz), optional user
  notes, `rd_diag_<stamp>_<plant>.json` download. Session boundaries reset the recorder
  (init / plant_change / scenario / restore); rewind trims the recorded future. A wiring audit
  (every `data-act`/`data-hold`/`act:`/`hold:` reference vs handlers) now reports 79/79 wired.

- **2026-07-07 — PWR training campaign "Zero to Operator" (Gameplay §8 step 7: Campaign
  progression wrapper + curriculum).** Plan: `Blueprint/pwr_training_campaign.md`. Five acts,
  19 missions + 1 bonus, mixing existing artifacts (hook, TMI, sg_flood, 9 walkthrough
  procedures) with 8 new micro-scenarios: `pwr_tour` (energy journey), `pwr_chain_reaction`
  (criticality at HZP on the neutron source), `pwr_feedback` (Doppler/MTC), `pwr_xenon`
  (post-trip dead-time arc), `pwr_boron` (Tavg via dilute/borate), `pwr_load_follow` (manual
  dispatch), `pwr_protection` (deliberate turbine trip + alarm triage), `pwr_qualify` (blind
  stuck-PORV exam, three endpoints). Wrapper: `ui/campaign_data.js` (data-driven, per-plant),
  Training-tab campaign section (sequential unlock, progress bar, Continue chains the next
  mission on level-complete; `?campaign=unlock` dev override); completion derives from the
  existing `rd_progress` record — no new persistence. Instructor snapshot block now exposes
  `scenario_id` + `current_beat_id` (also fixes the diagnosis-export manifest's scenario id).
  **Gate:** `test/run_campaign.js` — structural (missions resolve, trigger vocabulary, dual
  registers, endpoints) + functional (every new scenario driven headlessly to level_complete
  by a scripted operator; qualify win/early-win/fail paths) — 12/12, 391 checks.
  **Physics findings honored (probed, not guessed):** manual load targets couple weakly
  (1000→800 ask settles ~944 MWe, Tavg +9 °C — taught in-mission as "the slider asks, the
  physics answers"); a large manual step (→500 MWe) trips on load rejection; post-trip Xe
  crests ~113.6% eq at ~5 h (the xenon mission rides exactly that arc); HZP SUR blips during
  rod motion are subcritical multiplication, not criticality (criticality detected at
  power > 1%, matching `pwr_startup`); **an SBO is unsurvivable in current physics** (SG
  pins at 20% under AFW, inventory drains via PORV by ~14 min) — exam redesigned off it,
  logged here as an engine tuning target alongside the ops-report findings.
  **Authoring gotchas (for the next scenario writer):** snapshot `current_beat_id` is the
  PENDING beat (armed, not yet fired); the instructor clears operator-action memory on every
  beat fire, so `operator_action` triggers only see commands issued while their own beat is
  pending; composite triggers use `triggers:[...]`; gates persist until their `until` fires.

- **2026-07-07 — RBMK & BWR training campaigns (campaign wrapper now tri-plant).** Plan
  addendum in `Blueprint/pwr_training_campaign.md`. Seven new scenarios: `rbmk_tour`,
  `rbmk_void` (positive void coefficient by hand: flow 80→60 at 50% → power +3%, probed),
  `rbmk_chernobyl` (01:23:40 witnessing — engine destroys pre-1986 `low_power_xenon` in
  ~13 s regardless of AZ-5, so the flagship narrates the inevitability; aftermath beat
  carries the causal chain), `rbmk_az5_fixed` (playable rematch: post-1986 design survives
  the identical state given prompt AZ-5 — probed clean at t+3 s; hesitation loses, with the
  post-86 steam-explosion tuning gap voiced in-mission), `bwr_tour`, `bwr_recirc` (probed
  ladder: ask 22/25/28/32 → 63/71/79/89%), `bwr_isolation` (MSIV slam: trip, indicated-level
  shrink to ~28%, steam-driven recovery — shrink/swell as the teaching point),
  `bwr_fukushima` (from `post_scram_sbo` + `early_battery_failure`; IC decision branch buys
  ~4 h, both branches end at uncovery — support-failure taxonomy capstone), `bwr_qualify`
  (precision recirc maneuver 75–85% band, >95% fails; the unfireable high-flux trip is
  briefed as the exam hazard). Probed findings: BWR `set_recirc_flow` pct is an internal
  ~2.5× ask scale (ask 40 = 100% flow; big asks → sustained 110–130% overpower with no
  trip); BWR failure injections (`rcic_failure`, `hpci_failure`) do not disable
  auto-actuated systems, and BWR upsets self-recover — hence a maneuvering exam, not an
  emergency one; `bwr_sbo_rcic`[P] excluded (finding B3). Gate: `run_campaign.js` 24/24
  suites / 686 checks (structural for all three campaigns + functional happy/failure paths
  for every new scenario). Regression: RBMK 23/23, BWR 12/12, M6 16/16, M5 17/17,
  procedures 20/21 (pre-existing).

- **2026-07-07 — Playtest hardening pass (all three campaigns + M5 rewind).** A persona
  playtest (`Diagnostic/PLAYTEST_REPORT.md`: first-timer, ~220 wpm, one fumble per act,
  real headless stack at UI cadence) found systemic pacing and softlock defects; all fixed:
  **M5 rewind walk-back** — repeated ⏪ presses now walk back one checkpoint each via a
  `_rewindCursor` (cleared on every checkpoint push); previously the broadcasts between two
  presses defeated the exact-time guard and every press restored the same newest checkpoint,
  so failure cards ("Rewind to the decision") could never be escaped. **Trip-catch branches**
  — `pwr_tour` (`load_lost`), `pwr_load_follow` (`grid_lost`), `pwr_boron` (`overdone`):
  guided missions that leave the throttle/chemistry unlocked now land on a failure card with
  Rewind instead of softlocking under a stale prompt (greedy 500 MW ask trips at ~71 s;
  boron mis-press at 30× high-flux-tripped the plant). Pattern: the PROMPT beat itself
  carries `branches` (scram catch + success condition) — `current_beat_id` stays on the
  watcher, so scripted drivers `settle()` past the prompt's fire before acting.
  **pwr_boron** re-paced 30×→8× with `set_boron_adjust rate:0` commands on each prompt
  (reading time is never penalized). **bwr_fukushima decision beat at REAL TIME** — the IC
  decision was unreachable for a first-time reader (60× + 300 sim-s window = 5 wall-s under
  a 105-word card); now: hold phase delay 2400 at 60× (~40 wall-s), `batteries_die`
  `speed:1` + `inaction:150` real seconds. **pwr_feedback re-anchored** — `setup_commands`
  pin demand at 500 MWe (in Follow, the rod nudge dragged output 498→574 and the demand
  demo fired 0.1 s after arming); demo now `set_steam_demand 650`, complete at
  `all[mwe>585, delay 200]` — probed visible ~20 wall-s climb with Tavg falling on cue.
  **pwr_tmi recovery closes the block valve** (beat command; the historical ~06:22 action)
  — HPI alone plateaus below the 11.1 °C restoration setpoint, so the "Averted" ending was
  unreachable at HEAD (pre-existing red check in `run_scenarios`, now 3/3); `damage_path`
  30×→10×. **pwr_qualify** — isolation branches grade `block_valve_open` true-state (added
  to PWR `getTrueState`, additive) instead of `operator_action` (a press before `fault`
  fired was wiped from action memory → exam never ended); `fault` issues
  `open_block_valve` (briefed "normal lineup") so pre-isolating during the briefing neither
  cheeses nor softlocks; frozen window 600→300 s. **pwr_protection** `stabilizing` accepts
  `any[ack, delay 60]` (an ack during the 12-s flood window stalled the mission).
  **Read-pacing bumps** (220 wpm rule: delay ≥ words/3.7 + margin) across `pwr_hook`,
  tours ×3, `pwr_xenon` (shutdown 300×→150×, peak 600×→300×), `pwr_chain_reaction`
  (`critical` 5×→1× — the climax card lasted 3.6 s), `rbmk_chernobyl` (`az5` text moved to
  the aftermath card — it lived 1.0 s), `bwr_isolation`. **Procedures** — startup notes now
  advise Norm-until-SUR-stirs (Slow-throughout measured 13.7 min PWR / never-in-10 min for
  burst play vs 3.2 min at Norm), SUR caution admits the coarse bank reads ~2 DPM;
  `bwr_raise_power` retargeted pct 40→28 with a >=95% guard (pct 40 parked the plant at
  114% sustained — contradicting `bwr_qualify`'s >95% fail rule); `rbmk_mcp_trip` notes the
  RPS may trip first. **Findability** — `SYN_CONTROL_MAP` aliases (Mode/Load/Rod
  motion/Nudge/Boron — these beat highlight labels glowed nothing), DIL/BOR named as
  labeled, two-press SCRAM taught in `pwr_hook`. Gate: `run_campaign` 24/24 (723 checks —
  failure paths for tour/boron/qualify-pre-isolation added); `run_scenarios` 3/3 (was 2/3
  at HEAD); M5 17/17, M6 16/16, PWR 13/13, RBMK 23/23, BWR 12/12, M4 11/11,
  `verify_manual_follow` 81; `run_procedures` 20/21 and `run_e2e_controls` 23/25 unchanged
  from HEAD (pre-existing findings B3 / LPI-accumulator). Persona re-verification: 17/17
  (TMI rewind→decision→Averted in 2 presses; honest reader reaches the Fukushima IC card;
  boron fumble completes; early ack proceeds; az5 rewind rematch wins; feedback demo holds
  20 s; frozen exam fails at 6.2 min).

- **2026-07-07 — Playtest hardening, round 2 (confidence-list follow-ups).** The residual
  uncertainties from the playtest pass, closed with fixes rather than caveats:
  **UI commentary min-dwell queue** (`app.js renderInstructor`): the instructor layer keeps
  only its latest message, so any beat cascade faster than reading speed destroyed text
  forever; the UI now holds each card ≥ words/3.7 s (capped 16 s) and queues successors
  (depth 3). Blocked-command feedback bypasses the queue (the player just clicked);
  `level_complete` flushes it. **Endpoint commentary was never displayed at all** — the LC
  panel painted over the completing beat's card in the same broadcast; `renderLevelComplete`
  now renders the message (`.lc-msg`) above the panel. **Rewind-pick exactness**: strip-chart
  picks send `{rewind, steps, exact:true}`; M5 skips the press-semantics guards for exact
  picks (a second pick while paused could otherwise land one checkpoint early).
  **Cross-plant snapshot race fixed** (pre-existing): a `?scenario=` deep link that switches
  the plant let the new plant's snapshots reach the old profile's gauges/chart/synoptic —
  three distinct `.toFixed` crashes killed the whole render pass; `render()` now detects the
  plant mismatch and runs `afterPlantChange()` catch-up, plus a defensive read in
  `renderGauges`. **`pwr_sg_flood` was unwinnable since authoring** (caught by the new
  coverage guard): its `imbalance` trigger used a malformed shape (`instrument_id`/`high`/
  `setpoint` — not M6 vocabulary) and could never fire; repaired to
  `instrument sg_level above 75` (probed: floods to ~100% in ~2 sim-min) and its gauge
  highlight `sg_level`→`sg`. Now functionally tested. **Highlight coverage is a structural
  gate**: `pwr_synoptic.js` exports `highlightLabels`; `run_campaign` asserts every campaign
  beat's `control_label` (PWR) and `instrument_id` (all plants) resolves to a real target.
  **Seed sweep**: tour (happy+greedy), boron, feedback (real three-press pattern), qualify
  win, load_follow shift, sg_flood — 35/35 across seeds 1/7/13/42/99. **synoptic_check.html
  resurrected**: it wasn't Edge drift — the harness never got a script tag for
  `engines/load_mode.js` when Load Mode landed, so `pwr_engine.js` threw at load; one tag
  restores 55/55 (`SYNOPTIC-OK`). Also: `pwr_feedback.complete` gained a 600-sim-s fallback
  (three separate +1 presses settle ~560 MWe, under the 585 threshold the single steps:3
  harness command reaches — a demo must not soft-wait on the player's earlier caution).
  Gates: `run_campaign` 26/26 (739), M5 17/17, M6 16/16, scenarios 3/3, PWR 13/13, M4 11/11,
  manual-follow 81, synoptic 55/55; `run_procedures` 20/21 and `verify_e2e_ui` (pwr/primary
  `dhr-on` missing) unchanged pre-existing reds. Known residual: headless probe scripts must
  `process.exit()` — a played SimulationService holds a live interval and the process never
  exits (nine zombie node processes were reaped this session).

- **2026-07-07 — Playtest hardening, round 3 (RBMK/BWR parity pass).** The PWR lessons
  applied systematically to the other two campaigns. **Softlocks confirmed and fixed** (both
  made MORE reachable by round 1's gate additions of scram/ack): `rbmk_void` — a manual AZ-5
  mid-experiment stranded the mission at `restore_task`, and a deep flow cut (probed: 40→30%
  spikes the pre-1986 core to ~120% and TRIPS; 40%/20% spike ~113% without protection) either
  stranded it at `complete` or, if the player touched flow again post-trip, showed the
  SUCCESS card over a dead reactor; `bwr_recirc` — any scram stranded it at `down_task`.
  Both now use the prompt-with-branches pattern: scram → authored failure cards
  (`overpowered` "It Bit" / `tripped`), success composites as branches; `restore_task` text
  acknowledges over-deep cuts. **Highlights added where the text names hardware** (RBMK/BWR
  beats carried none): rbmk_tour boiling→`void` gauge, orm_intro→`orm`; rbmk_void tasks →
  'MCP / Channel Flow'; rbmk_az5_fixed intro → 'AZ-5' + the two-press "arm then CONFIRM"
  wording (seconds matter there); bwr_tour void/throttle/level → `void`/`recirc`/`level`
  gauges; bwr_recirc tasks → 'Recirc Drive'; bwr_isolation intro → `level`;
  bwr_fukushima batteries_die → 'Isolation Condenser (IC)' (auto-reveals the secondary view
  at the decision). **Coverage gate extended**: `run_campaign`'s highlight check now
  validates RBMK/BWR `control_label`s against the PD view-bar label mirror (`PD_LABELS`) —
  note the legacy plant-display labels are 'Recirc Drive'/'RCIC' etc., NOT
  `manual_ui_map`-style long forms; 'AZ-5'/'SCRAM' resolve via the status-bar button.
  **bwr_fukushima bare card** now tells the player Rewind steps back to the DC-loss
  checkpoint (3 presses). Gates: `run_campaign` 26/26 (773 checks — rbmk_void deep-cut and
  bwr_recirc scram failure paths now CI), M5/M6/scenarios/RBMK/BWR/manual-follow green,
  `run_procedures` 20/21 pre-existing. Persona re-verify (seed 11): 7/7.

- **2026-07-07 — Operator Automation layer (the Automate tab) — a deliberate v1-scope
  extension.** CONTEXT §8 deferred "automatic control systems"; built now by user request
  as `layers/auto_control.js` + a Tools-Block **Automate** tab: an AUTO/MAN toggle per
  plant control, so any subset can run automatic while the player works the rest (e.g.
  secondary on auto while hand-flying the primary, or everything auto except grid demand).
  **Architecture:** a *synthetic operator*, NOT a stack layer — it subscribes to broadcast
  snapshots beside the UI, reads **instruments only** (HR1: a stuck sensor fools it — CI'd:
  stick `sg_level` high and the feed channel drains the real SG), and issues ordinary
  commands from the top of the stack (HR5: Instructor gates and M4 interception apply;
  blocked commands surface as a row note). Engines/M4/M5 untouched except one additive
  `control_state` exposure (`heater_auto`/`spray_auto`, mirroring `steam_dump_auto`;
  CONTEXT §6.5 updated). Channel kinds: **mode** (passthrough toggles for automation the
  engine already carries — load-follow, steam-dump auto, PZR heater/spray auto, CVCS
  make-up — displayed state derives from `control_state` each snapshot so the toggle never
  fights the plant, e.g. scram → grid disconnect shows itself); **pid** (PI + feedforward,
  bumpless-transfer integrator preload, anti-windup, PV low-pass, setpoint slew, deadband +
  min-delta/period so the command stream stays sparse); **rods** (bounded `rod_nudge`
  moves — acceleration-safe since the engine ramps to a target — with rate damping);
  **bang** (PWR boron trim on rod position with hysteresis; requires the rod channel).
  Setpoints capture the current reading on engage and are editable (unit-converted in the
  tab). Rod/power channels disengage themselves on scram/meltdown, visibly. Automation
  state is session-only (not in save files); a rewind resets controller dynamics.
  **Control-design findings (probed, not guessed):** (1) a Tavg-dominant PWR rod loop
  limit-cycles for minutes (Tavg integrates the power/draw mismatch) — the shipped
  controller is **mismatch-dominant** (`1.25·(steam% − power%)` + Tavg trim), which glides;
  the governor overdelivers at held Tavg (demand 700 → ~785 MWe, SG pressure 6.3 MPa) —
  physics, asserted as such. (2) The RBMK's lumped rod group is worth ~4 %power/step at
  50 % — single slow-speed steps, ±2 % deadband, kd 15 rate damping, or it limit-cycles.
  (3) The BWR has **no pressure-restoring control** in load-follow: ANY sustained power
  descent (even a bare-plant 40→34 % recirc trim) drains vessel pressure to the 5.52 MPa
  LOCA trip — so the BWR's turbine channel is a **pressure-control PID** (`set_turbine_load`
  holds `vessel_pressure`, the real BWR governor mode), and the recirc channel slews its
  power setpoint (0.15 %/s). **Gates:** new `test/run_autoctl.js` 11/11 (all-auto holds ×3
  plants, demand swing, SP maneuvers, manual+auto mix, HR1 probe, scram stand-down, rewind
  reset, command-sparseness); engines 13/23/12, M4 11, M5 17, M6 16, M7, campaign 26/26
  unchanged green; `run_procedures` 20/21 and `verify_e2e_ui` reds pre-existing. Manual:
  `automate` control entry + AUTO/MAN + Setpoint glossary terms added to the generator and
  regenerated. Dev deep-links added: `?tab=<tools-tab>` and `?auto=<id,…|all>`.

- **2026-07-07 — Automation under time acceleration (fast-forward handoff) + training
  presets.** Probed all-auto holds at 60×/600×/3600× per plant. Findings: the BARE plants
  are acceleration-invariant (per-step physics + engine-side coupling), but broadcast-rate
  automation is not — above ~200× a broadcast is minutes of sim time and NO sampled
  controller stabilizes the boiler loops (full-dt PI integration drained every level to its
  low-level trip; clamped-dt under-integrated 36×; a dt-threshold flapped against the
  normal/transient cadence flip; the dt-observed first step let one broadcast-rate command
  slip out — a turbine left in manual for 6 sim-minutes trips low vessel pressure).
  **Shipped design:** fast regime judged from `metadata.time_acceleration ≥ 200` (correct
  on the first step). In fast: pid channels with a `fastFallback` hand their loop to the
  ENGINE's per-step coupling — feed → the new `set_feed_coupled {active}` command (all
  three engines; re-couples what `set_feedwater_flow` uncouples; CONTEXT §6.7), BWR
  turbine → `set_load_mode follow`, recirc → hold — and re-assert broadcast-rate control on
  slow-down (the next setpoint command uncouples again; integrator re-seeded). Rod
  channels drop to SINGLE steps inside a widened `dbFast` (> per-step power worth) —
  out-paces xenon drift, immune to the sampling-aliasing limit cycle probed at 3600×
  (−1/+1/−2/+3/−5 divergence). Slow regime gains true-dt integration (per-action increment
  capped at 3 design periods) and time-based PV filters (`pvTau`, pass-through at giant
  dt). Result: 9/9 accel×plant holds green; `run_autoctl.js` now 15 suites (3600× holds ×3,
  resume-on-slow-down transition). Engines/M4/M5/M6/M7/campaign/procedures unchanged-green.
  **Training presets:** scenarios and procedures may declare `auto_channels: [ids]` —
  startScenario/followProcedure engage them after the content's plant reset (on top of the
  walkthrough stand-down), so a mission can hand the player one control and put the rest of
  the plant on automatic. No authored content uses it yet (the training-update pass will).

- **2026-07-07 — RBMK Automatic Regulator rod group (resolves F10).** Third RBMK rod group
  `auto_rods` ("Automatic Regulator (AR)") — the authentic RBMK arrangement: manual bank
  (coarse, carries the pre-1986 displacer), AR (fine, normally automatic, overridable), AZ
  shutdown. **Engine:** function `'auto'` takes the pure-absorber branch (NO displacer — the
  positive scram effect stays exclusively on the manual bank); worth via rod_count 0.06 ≈
  510 pcm full travel (~2.2 pcm/step vs the manual bank's ~35); **excluded from ORM**
  (getOrm counts control/manual only) so ORM remains the manual-bank margin — the authored
  orm_target states (incl. the Chernobyl precondition) and the ORM-driven void amplification
  are byte-identical; per-state initial insertion `ar_inserted_frac` (mid-range at
  full_power/50_percent, fully WITHDRAWN at hot_startup/low_power_xenon — historically the
  ARs had been pulled at Chernobyl); scram drives it in like every group; per-state critical
  trim absorbs its initial reactivity. RBMK suite 23/23 untouched, Chernobyl comparison
  green. **Automation:** the `rods_power` channel drives the AR — hold tightens from ±4-5%
  (one manual step ≈ 4% power) to ±1% at 10× (PV low-pass added: power noise σ0.5 ≈ the AR's
  per-step worth), maneuvers land ±2; fast regime gets `fastBudget: 8` (single 2 pcm steps
  lose to xenon at 3600× — probed 0.1%/min behind). New `ar_recenter` channel (real RBMK
  practice): single manual-bank steps when the AR leaves ±25 of mid-insertion, handing the
  standing burden back to the coarse rods (CI'd: a 50→75% swing exhausts the AR, the manual
  bank steps in, the AR recovers 20–80%). **UI:** AR card (Auto/Man/Withdraw/Insert) on the
  RBMK diagram + primary control bars — Auto/Man mirrors the Automate channel (synced per
  broadcast via data-arsync); touching the drive buttons or Man IS taking manual control
  (the pre-accident condition — the Chernobyl beat hook, authored under F11); AR position
  rows in primary/All views. Manual: `ar_rods` control entry + AR glossary; regenerated.
  Gates: autoctl 16/16, engines 13/23/12, M4-M7, campaign 26/26, control audits green;
  `run_procedures` 20/21 pre-existing. **No second manual group** — the AR under manual
  override IS the fine manual bank (user decision).

- **2026-07-07 — AR defaults to AUTO (the plant's normal lineup).** The RBMK's Automatic
  Regulator channel engages by DEFAULT on plant load / reset / file load, capturing the
  CURRENT indicated power as its setpoint — never an authored number, which would fight
  every non-full-power state (at the Chernobyl precondition it would try to drag a poisoned
  core from 7% back up). Guard: `defaultOn(snapshot)` engages only where the state parks
  the AR with authority (20–80% inserted → full_power / 50_percent) and never on a
  scrammed/melted plant — hot_startup and low_power_xenon start the AR withdrawn, so they
  stay MAN (historical, and automation must not run the startup or fight the accident
  setup). Instructed content is unaffected: startScenario now stands automation down
  explicitly after the rebuild (then applies its authored `auto_channels`), walkthroughs
  already did. Machinery is general (`AutoControl.engageDefaults`), data per channel.
  Gates: autoctl 17/17 (default-lineup suite incl. scram guard + capture check), RBMK
  23/23, M6 16/16, campaign 26/26; headless UI confirms RBMK loads AR=AUTO (card synced
  green) and the PWR still loads rods=MAN.

- **2026-07-07 — Training pass for automation + the AR (resolves F11).** Two new campaign
  missions and the Chernobyl tie-in. **`rbmk_ar` "The Steady Hand"** (RBMK Act II opener,
  pre-1986 at 50%): the auto_channels preset (`rods_power`,`ar_recenter`) has the AR
  holding power from the first second; the player takes MANUAL control (driving the AR
  disengages its channel), feels the uncorrected sag, restores 50% by hand, and hands it
  back with AUTO — graded via `operator_action {group_id:'auto_rods'}` + power thresholds,
  Continue via a `manual`-trigger BRANCH (house semantics learned the hard way: when a beat
  has branches, branches are its ONLY exits — a sequential `manual` beat never fires).
  Closing card and the trip-catch card both point at Act III. **`pwr_automation` "Hands
  Off"** (PWR Act III closer): everything on auto except the grid (preset = 6 channels);
  the player is the dispatcher — 1000→700→1000 MWe on the load slider alone, with an
  honest attribution card (physics does the coarse follow, channels trim) and an HR1
  warning (automation trusts the same lying gauges). **The bare plant TRIPS on the 700
  swing** (Tavg → ~319 °C with nobody trimming; probed) — the mission genuinely needs its
  preset, so the campaign gate gained `startScenarioAuto()`: a UI-faithful harness that
  attaches an AutoControl and engages the scenario's auto_channels (first real exercise of
  the preset mechanism end-to-end). **rbmk_chernobyl intro** now reads the AR card too —
  regulators spent, crew flying manual, "the seat you sat in for three minutes at an easy
  fifty percent" — with the AR card highlighted (PD_LABELS gained the label). **Gate
  additions:** mission counts pwr 20 / rbmk 9; auto_channels ids validated against the
  AutoControl catalog; functional playthroughs for both missions incl. scram-catch
  branches. Deliberately NOT done: presets on pre-existing missions (their triggers are
  tuned against bare-plant trajectories — TMI/Fukushima/qualify stay bare by design), and
  both new missions are UNGATED (the automation issues commands down the gated path; a
  gate that admits the player must admit the machine). Gates: campaign 29/29 (882),
  autoctl 17/17, M5/M6/M7/scenarios/manual-follow green; procedures 20/21 pre-existing.

- **2026-07-07 — Campaign fully unlocked (user direction).** Every mission in every
  campaign is playable from the start: the act ordering is a recommended PATH with
  progress markers (✓ done, ▶ frontier, ○ not yet — the frontier still drives the
  "Continue campaign" button), not a gate. Sequential unlock and its `?campaign=unlock`
  dev override are retired (`buildCampaign()` simplification; campaign_data.js header and
  the plan doc updated). Completion tracking unchanged. Campaign gate 29/29; headless UI:
  zero locks, 21/21 PWR entries carry Start/Replay.

- **2026-07-07 — PWR turbine governor: pressure-compensated load control.** The governor
  moves from open-loop (valve = demand; delivered = valve × P_sg/P_rated, overdelivering
  ~12% at held Tavg — a 700 MWe ask ran the SG to 6.3 MPa and delivered ~785) to **EHC
  load-control**: the valve TARGET is pressure-compensated (demand ÷ P/P_rated, clamped
  fully open; 0.5 MPa floor), so steady-state delivered steam ≈ demand at any secondary
  pressure — the valve strokes open as pressure falls, like a real governor holding load.
  Identical at rated pressure; valve lag unchanged. One-line engine change
  (`pwr_steam_generator.js`); PWR suite 13/13 first run (TMI/steam-break/trip untouched);
  ops probes IMPROVED (51/66→52/66, 18→16 failed checks). **The load-coupling physics
  changed character** — recalibrated content: bare-plant demand map is now 900→90.0%
  exact; 800/700 → ~84% at the STEAM-DUMP ceiling (Tavg climbs ~+22–25 °C to the dump
  setpoint, HI TAVG warning annunciates — 5 °C real margin to the 335 trip, 25σ through
  the instrument); 500 still trips (sg_level low). Follow mode lost its accidental
  restoring force (the overdelivery), so `pwr_tour`'s restore is now an explicit ask back
  to 1000 then FOLLOW (beat + scripted test updated). `pwr_load_follow`'s night watch now
  OWNS the amber (dump lifting + HI TAVG acknowledged — a better lesson: the plant asking
  for reactivity support in lights). `pwr_feedback`'s two demos got CLEANER: with the draw
  truly pinned, the rod shove is wrestled ALL the way back (spike 58% → settle 50.2%,
  entire +ρ banked as Tavg +8 °C) and the 650 ask is fully delivered (643 MWe, Tavg
  −25 °C paying for it) — both registers rewritten to the probed numbers. All-auto demand
  700 now settles 725 (was 785); autoctl assertion updated (72±5). Manual regenerated
  (noise-level diffs only). RBMK/BWR turbines unchanged (they already deliver the ask;
  the BWR's pressure control lives in the automation channel). Gates: PWR 13/13, campaign
  29/29 (882), autoctl 17/17, procedures 20/21 + e2e reds pre-existing, M4–M7 green.

- **2026-07-08 — PWR hot-leg DNB + core voiding (enables steam-line-break / loss-of-flow
  AT POWER).** Prep for at-power accident scenarios. Two coupled defects in the lumped
  thermal model: (a) `thot = tavg + ΔT/2` with `ΔT ∝ power/flow` was **unbounded** — at the
  0.1 flow floor / full power it read `tavg+165` (a subcooled leg at 470 °C, nonphysical);
  (b) the DNB heat-transfer collapse (`h_fc_dnb`) was gated on **bulk** `trueSubcooling(tavg)
  ≤ 0`, which needs `tavg=345 °C` — never reached at power, so DNB was **unreachable** and a
  steam-break/LOFA couldn't bite. Fix, grounded in "subcooled liquid pins at saturation":
  **thot clamps at Tsat** (leg split capped symmetrically around tavg, killing the artifact);
  **DNB is judged at the hot leg (core exit)** via a new `_subcool_hot_c` margin and config
  `dnb_margin_c` (8 °C — real DNBR<1.3 occurs subcooled). Normal full-power hot-leg margin is
  24.7 °C, so no false trigger; all accident scenarios are post-scram where `thot≈tavg`, so
  the existing suite is untouched. **Trap found & fixed:** a first cut fed the new flux void
  into the shared `primary_void_fraction`, whose sat-pull / void-surge couplings are
  calibrated for the TMI deception — TMI's erosion phase transiently saturates the exit, so
  the flux term hijacked those couplings and locked the plant into a false saturated
  equilibrium (TMI recovery stalled at 3.5 °C margin vs the >11.1 target; caught by
  run_scenarios, NOT the engine suite — the M6 gate earning its keep). Resolution: flux
  boiling gets its **own** `core_void_fraction` (relaxed, exposed in true_state for
  indication/triggers), and does **NOT** touch the pressurizer couplings — `primary_void_fraction`
  is inventory-only again, so TMI is byte-identical. Its physical bite is the DNB
  heat-transfer collapse alone; a dedicated core-void→pressure coupling is deferred to
  at-power-scenario tuning (an unscrammed LOFA/ATWS wants heatup-pressurization, the
  opposite of the TMI sat-pull — do not reuse it). New config: `dnb_margin_c`,
  `void_flux_gain`, `void_flux_max`, `void_flux_tau` (all `[tune]`, thermal). Probed: LOFA
  at power now drives thot→Tsat, DNB (h_fc 0.05→0.004), core_void→growth, fuel heatup; a
  steam-break correctly reads as an OVERCOOLING event (margin widens, power rises via MTC —
  its hazard is reactivity/PTS, not hot-leg DNB). Manual reference regenerated: no content
  diff (these are internal coefficients, not manual-surfaced). Gates: PWR 13/13, scenarios
  3/3, M7 green, procedures 20/21 (the 1 red is pre-existing bwr_sbo_rcic).

- **2026-07-08 — Steam Line Break scenario (`pwr_slb`, PWR campaign Act IV).** First
  at-power accident scenario, built on the hot-leg DNB / core-voiding physics above. The
  lesson is counterintuitive: a broken *steam* line raises *reactor* power — the secondary
  blows down, the primary overcools, and the negative MTC turns the cooldown into positive
  reactivity, so power climbs with no rod motion. Probed full-stack trajectory (seed 42,
  severity 1.0): power 100→113% over ~60 s as Tavg falls 304→284 °C; subcooling margin
  WIDENS (overcooling, not DNB — `core_void` stays 0, confirming the steam break reads as an
  overcooling event, its hazard reactivity/PTS not hot-leg boiling); RPS auto-trips on
  **pzr-level-low at ~66 s** as the contracting primary drains the pressurizer (not high
  flux — peak 113% is under the 120% trip; and no SI — primary pressure holds ~15.3). Two
  branches at the decision point: manual trip (the craft — recognize the reactivity event and
  scram) → *Controlled*; inaction → the automatics catch it → *Caught by the Automatics*.
  Both safe by design — in this lumped model the scram dominates the cooldown, so there is no
  return-to-power to reproduce; that, plus borated-SI and PTS being unmodeled, is voiced as
  M6 §13 honesty in both endpoints. Wired: `scenarios/pwr_slb.js`, `shell.html` script tag,
  `campaign_data.js` Act IV (PWR missions 20→21), `run_campaign.js` load + count + a
  both-branches functional test. Headless UI boots with the mission under "When Things Go
  Wrong". Gates: campaign 30/30 (919), scenarios 3/3, PWR 13/13, M7 green, procedures 20/21.

- **2026-07-08 — Loss of Coolant Flow scenario (`pwr_lof`, PWR campaign Act IV).** The
  scenario that actually exercises the hot-leg DNB / core-boiling physics (the steam break is
  an overcooling event; loss of flow is the DNB event). An RCP trips at power; forced flow
  coasts down (rcp_trip → stop_pump, coastdown τ 8 s); as flow falls the core ΔT (∝ power/flow)
  drives the exit to saturation → DNB. Probed full-stack (seed 42): with no action thot pins at
  Tsat ~9 s in, `core_void_fraction` peaks 0.063, fuel 693→786 °C, and the **`__true_flow__`
  low-flow trip scrams at ~11 s** (fuel recovers, no damage). A manual scram inside ~6 s
  collapses power before saturation — **DNB is avoided entirely** (fuel stays 693 °C, core_void
  0). That asymmetry is the interactive lesson (trip FIRST — early action prevents the
  phenomenon, unlike the steam break where both branches reach the same safe place). Branches:
  operator_action scram → *Tripped in Time*; `true_state core_void_fraction > 0.02` (a
  true-state author hook — the PWR has no void gauge) → *boiling* → low-flow trip → *Caught by
  the Low-Flow Trip*. Teaches the true-flow trip (HR1 exception, reads real flow — a laggy
  meter would be too slow at coastdown speed) and voices the natural-circulation simplification
  (M6 §13: flow reads 0 with pumps off; v1 doesn't credit buoyancy-driven flow). Probed
  findings not built on: an ATWS (rcp_trip + failure_to_scram) self-limits at ~900 °C via
  Doppler — NO fuel damage — and shows a `scram=Y` flag anomaly under failure_to_scram; loss of
  flow is a survivable event in this model, so no meltdown branch is honest. Wired:
  `scenarios/pwr_lof.js`, shell.html, campaign_data.js Act IV (after the pwr_rcp_trip
  procedure; PWR 21→22 missions), run_campaign.js load + count + a both-branches functional test
  that asserts peak core_void > 0.02 (DNB genuinely engaged). Headless UI boots with the
  mission. Gates: campaign 31/31 (954), scenarios 3/3, PWR 13/13, M7 green, procedures 20/21.

- **2026-07-09 — TMI-2 three-part training module (M5 TMI2 Spec): `pwr_tmi2_p1/p2/p3` + chat-mode
  instructor.** Built the full Fog of War / Under a Microscope / Second Watch module as three
  chained campaign missions (new PWR "Act V — Three Mile Island"; old Act V retitled Act VI;
  PWR 22→25 missions). One master timeline lives in `scenarios/pwr_tmi2_common.js` (physics
  fragments + calibrated triggers + the Part 1/Part 3 parity dialogue — lead-in AND the shared
  accident exchanges are single-sourced per Spec §6/§9; probed full-stack seed 42: scram T+14 s
  on SG level, PORV lift enacted at the scram, stick+lie at reseat+12 s, auto-HPI T+44, PZR LVL
  HI T+55, fuel 1200 °C ≈ T+19 min with HPI secured; isolation+HPI recovers fully even from
  1300 °C, with `fuel_damaged` latched).
  **Engine additions (PWR):** (1) `porv_tailpipe_temp_c` true state + `porv_tailpipe_temp`
  instrument (lag 10 s, range 0–250 °C; warm ~82 °C baseline = historical seat leakage, ~150 °C
  flowing, slow 900 s cooldown after isolation) — the spec's identification beat and deviation
  point 2 had no signal without it; deliberately UNALARMED (the not-being-looked-at is the
  lesson). (2) AFW pump-demand/delivered-flow split: `set_afw` latches `afw_pump_demand`
  through a block; `afw_active` = demand && !blocked; new `afw_pump_running` status instrument
  drives the synoptic run light (honest RUNNING over zero flow — the 1979 read). The
  `afw_failure` M4 interception was REMOVED (the block is the engine's `afw_blocked` state;
  interception would have eaten the pump-demand latch); no test depended on it. (3)
  `fuel_damaged` surfaced in true_state (outcome grading). Instrument SOURCE entries appended
  last — PRNG sequences unchanged (save/restore suite still exact).
  **Instructor layer (generic, data-driven):** beat `dialogue` arrays (speaker + two registers)
  → persistent `chatLog` (cap 300) surfaced as `instructor.chat {log, rev, interactions}`
  (chat-mode scenarios only; `null` otherwise — free-play invariant intact, m6ph green);
  `instructor_interact` internal action + scenario `interactions` tables (request/responses/
  repeat variants/clear_failures — the tag mechanic; recorded for operator_action triggers);
  gate denials echo into the chat in character (deduped); beat `story_min` anchors an
  in-fiction story clock. Save/restore carries chat state.
  **UI:** chat transcript renderer in the instructor card (speaker-styled bubbles, PLAYER
  right-aligned, SYS annunciator style; ack + skip buttons from the pending beat's
  `chat_button`; skip = set_speed 60, the target beat's `speed:1` snaps back); the story clock
  runs on `story_min` anchors so the HISTORICAL durations survive the sim's ~7:1 compression
  (dividers literally teach "about 2 hours pass" — Spec §2.2 guardrail); `ui_policy` is now
  consumed (scenario drives Realistic/Learning synoptic + physics overlay, player settings
  saved/restored); synoptic gains the clickable maintenance tag (`setTag`, occludes the new
  `pwAfwValve` glyph, `instructor_interact` on click) and a Tailpipe-temp row on the Relief
  card.
  **Decisions / open questions resolved (Spec §7):** Part 3 title kept "Second Watch"; ONE
  representative AFW discharge valve/tag (spec's own recommendation); AUX formalized as a named
  character ("Marty") with the chip label kept generic "Aux Operator". Part 1 pacing acks are
  `any(manual, delay 90–120 s)` — softlock-proof and headless-drivable. Part 3 outcome tiers
  grade the PLANT (subcooling restored / fuel_damaged latch / inventory refilled), not a
  deviation checklist: Eventful Shift (full), Plugged-Not-Refilled (isolation w/o make-up),
  Caught Late (damage then player termination), Holding-Not-Won (HPI tug-of-war, never
  isolated; 600 s watch branch prevents the softlock — with HPI defended, fuel never reaches
  the identification threshold), History Repeated (crew terminates at the historical mark).
  `afw_failure` is injected at scenario START (setup_commands — the tag was hung last shift,
  true to history) so a pre-accident tag pull works. Known minor edge: pulling the tag AFTER
  the scripted 8-min discovery replays "found them shut" dialogue against already-open valves
  (accepted, logged). Historical trip cause differs (sim trips on SG level; 1979 on high
  pressure) — Part 2's Chief owns the compression/honesty notes (single-sensor, containment,
  7:1 timeline).
  **Gates:** PWR 13/13 (PRNG-exact), M4 11/11, M5 17/17, M6 16/16, M6PH 8/8, M7 green,
  campaign 36/36 (1313 checks — incl. 5 new TMI-2 functional playthroughs: P1 historical +
  gate-block, P2 replay, P3 full-save + graceful-history; structural gate now also validates
  dialogue registers, chat_button styles, and interaction tables), scenarios 3/3, procedures
  20/21 (the one FAIL is the pre-existing bwr_sbo_rcic step-3 tuning gap — unchanged by this
  build), manual regenerated (PWR 25 indications).

- **2026-07-09 — TMI-2 chat pacing (playtest feedback).** (1) Transcript lines now REVEAL ONE
  AT A TIME on a real-time reading cadence (~220 wpm, clamped 1–7 s; display-only — the
  engine's log/determinism untouched). Chat buttons and the level-complete panel are held back
  until the exchange has fully revealed; player-outgoing bubbles show immediately; an ack/tag
  click releases the current reading dwell ("I've read it"); a rebuild over existing history
  (register switch, restored save) shows the backlog instantly and paces only what follows.
  (2) Elapsed-time dividers are now OPT-IN per beat (`time_skip: true`, stamped onto the chat
  entry by the instructor layer): only the authored compressed stretches show "⏱ about N pass"
  (P1 b14_ident ~2 h; P2 p2_b6/b7/b8; P3 p3_b15_ident). A continuous conversation never shows
  an artificial time jump — the story-clock timestamps carry the drift silently. Gates re-run
  green (campaign 36/36, M6 16/16, M6PH 8/8) + browser check: first paint = 1 line, button
  held during reveal, zero dividers in the lead-in.

- **2026-07-10 — Plant & Mission window (Training tab retired).** Plant selection + start-mode
  selection moved from the sidebar into a proper modal (`#missionOverlay`, Sim tab →
  "⚛️ Plant & Mission…"): a plant column (PWR / RBMK pre / RBMK post / BWR cards, the active
  one badged) then four nested mode tabs — Free Play (starting-condition picker + start
  button), Campaign, Scenarios (now FILTERED to the selected plant/design version; the old
  tab listed all plants), Walkthroughs. Nothing touches the running sim until a start button
  is pressed. The Training tab is gone from the tool box; the Sim tab now shows a read-only
  Plant/Mode summary (live via `updateSimSummary()` in render) and inherits the Reactivity
  Computer rows. `engineSel`/`initState` selectors deleted; `switchEngine(key, init?)` takes
  the chosen starting condition; campaign helpers (`campaign`, `missionArtifact`,
  `campaignFrontier`, `campaignHtml`) take an optional engine key so the window can browse a
  non-active plant; plant-bound starts (`walkthrough`/`procedure` missions) `ensureEngine()`
  first, scenarios reset to their own plant as before. Deep links: `?missions=1` opens the
  window, `?mmode=<mode>` picks the tab, `?tab=training` kept as a compat alias that opens
  the window. Gotcha re-hit: `.plant-card` is owned by the PWR synoptic CSS — modal uses
  `.mplant-*`. Verified headless (window all 4 modes, Sim tab, cross-plant `?scenario=`
  deep link) + synoptic harness 55/55.

- **2026-07-10 — Shell UX refinement (full review pass, synoptic excluded).** A four-tier UX
  review of every shell surface (diagram + its controls excluded — new_diagram_controls.md owns
  those). (1) **Dead/dishonest controls fixed:** the instructor "Acknowledge" button is now the
  real scenario Continue (`instructor_continue`, releases the reading dwell; M8 §9 intent) and
  the walkthrough nav (Prev/Next/Rewind/↺/✕) vs Acknowledge+Rewind rows are CONTEXTUAL
  (`syncInstrNav`: follow / scenario / chat / lc / idle — a button that can't act isn't shown);
  ↺ Restart works via the existing `follow_nav {dir:'restart'}` pass-through (it was only dead
  outside follows); the dead Audio toggle row was REMOVED (returns with the audio pass); the
  "Advanced instrument failure" teaser now opens a real panel (instrument × stuck/drift/noisy/
  dead × value → `set_instrument_failure`; instrument names from RD.MANUAL indications; applied
  list tracked UI-side); Values Display is hidden for the PWR (synoptic owns truth presentation
  — an inert setting must not render); the strip-chart scrubber is honest (head pinned at LIVE,
  track click = rewind-pick mode, ⏪ labeled "Rewind"); duplicate static `#ffBadge` removed from
  shell.html (buildViews and the synoptic each inject one); dead `.shell-ribbon` CSS deleted;
  page title de-alpha'd. (2) **Discoverability:** an always-visible STATUS LINE under the sim
  controls (`#simStatus` — "PWR · Free Play — Hot Full Power", click → Plant & Mission;
  change-guarded `updateSimSummary()` runs every instructor render) fixes "nothing says what's
  running / the campaign is invisible"; a `?` help button + one-screen guide (`#helpOverlay`,
  `?help=1` deep link) covers the quiet-board color language, instruments-can-lie, where things
  live, and shortcuts; the System Scanner now answers CLICK/TAP as well as hover (touch), idle
  text says so. (3) **Focus model:** strict accordion in free play, SPLIT VIEW during live
  content — `setFocus(which, user)`: opening a tools tab mid-mission no longer collapses live
  guidance, a chat reveal no longer slams a tool shut; persona click still maximizes the
  instructor. This supersedes the planned unread-dot (no reachable collapsed-with-unread state
  remains). (4) **Consistency:** Diagram Mode reads Teaching/Realistic and Register reads
  Terminology — Plain language/Industry (display labels only; `learning`/`industry` values and
  URL params unchanged); "Free Play" standardized (was Free play/Sandbox); destructive plant
  actions (ADS, SLC, breaker open, PORV isolate) use the SCRAM two-press arm idiom
  (`armedConfirm` — CONFIRM? for 3 s) instead of native `confirm()` (Reset keeps `confirm` —
  sim lifecycle, not plant); app-level feedback is a toast (`showToast` — save/load/bad-file;
  replaces `alert`); alarm header counts unacknowledged ("Alarms (3)") and unack tiles carry an
  explicit ACK chip; manual Normal Values speak board language via generated `ts_labels`
  (TS_LABELS in gen_manual_reference.js — labels only, mval/tsCell add units; normalized flows
  ×100 %, _pct %, pcm/DPM/RPM/MWe/ppm/rods per convention) and Glossary/Indications get a
  client-side filter box. (5) **Input:** global shortcuts (Space play/pause, 1–5 speeds, A
  ack-all, M manual, ? help, Esc close — skipped in fields/modifiers; Space defers to focused
  buttons), keydown/keyup drive the press-and-hold rod buttons (was pointer-only), global
  `:focus-visible` outline + `button:disabled` styling. Gates: gen_manual_reference re-run;
  procedures 20/21 (known bwr_sbo_rcic step-3 gap); campaign 36/36 (1313 checks); synoptic
  harness 55/55; verify_e2e_ui still fails only the pre-existing stale `dhr-on` expectation;
  PLUS a new playwright-core interactive harness (scratchpad) — 36/36 (ack/continue, restart,
  split view, adv-failure inject, scrub pick, two-press ADS arm+timeout, shortcuts, filter,
  alarm ack chips/count, toasts wiring).
- **2026-07-15 — Control layer split: kernel + per-plant control modules (stage 1 of the
  control-layer rework).** `layers/control_failure_layer.js` moved verbatim to
  `layers/control/control_kernel.js` (class attached as `RD.ControlLayer` with
  `RD.ControlFailureLayer` kept as a compatibility alias) and the three protection-data files
  moved out of the engines into per-plant control modules: `engines/<p>/<p>_protection.js` →
  `layers/control/{pwr,rbmk,bwr}_control.js`, each attaching `RD.<P>_CONTROL` plus the legacy
  `RD.<P>_PROTECTION` / `cfg.protection` names (the engines' failure dispatch reads
  `cfg.protection.failures`, and the RBMK module still loads before `rbmk_config.js` for
  `forVersion()`). Rationale: the coming per-plant automation channels and new PWR systems make
  the control layer a first-class per-plant artifact; the kernel stays generic (HR3), so the
  split is a data relocation, not a fork. One behavior-adjacent hardening added now:
  `loadState` rebuilds the `actuationFired`/`interlockActive` latch arrays to default-false when
  a save's array length disagrees with the current config (old saves survive actuation-list
  changes; a standing condition may re-fire one actuation, which is the safe direction).
  Loaders updated (shell.html, test html pages, all `test/run_*.js`, `tools/gen_manual_reference.js`,
  `test/run_procedures.js` — the two list-based loaders now take explicit repo-relative paths).
  Gates: engine suites 13/13·23/23·12/12, m4 11/11, m5 17/17, m6 16/16, m6ph 8/8, M7 OK,
  autoctl 17/17, scenarios 3/3, campaign 36/36 (1313), `gen_manual_reference` output
  byte-identical; pre-existing baselines unchanged (ops 52/66 tuning targets, e2e_controls 23/25
  — the two LOCA LPI/accumulator checks, procedures 20/21 — bwr_sbo_rcic step 3).
- **2026-07-15 — Operator automation moved IN-STACK (stage 2 of the control-layer rework;
  spec: `M4b_control_layer.md`).** The channel runtime (pid/rods/bang/mode machinery) ported
  from the UI-side `layers/auto_control.js` into the Control Layer kernel; per-plant channel
  CATALOGs moved into `layers/control/{pwr,rbmk,bwr}_control.js` as `channels:` data
  (tuning unchanged). Channels now evaluate every **0.1 sim-s inside the physics loop**
  (M5 tick calls `layer.stepAutomation(dt)` per step), so control is
  **acceleration-independent** — the entire fast-forward apparatus (FAST_ACCEL 200×,
  fastFallback plant-side handoff, dbFast widened deadbands, fastBudget bursts) is DELETED;
  at 3600× the same PIDs hold the same bands with feed staying uncoupled (probed). Automation
  state (engaged/setpoints/integrators) is now saved per channel **id** in the layer's
  saveState — rewind restores controller dynamics exactly (strict improvement over the old
  reset), old saves without the key restore all-MAN. New commands `set_auto_channel`
  (id or "all") / `set_auto_setpoint` descend the stack (HR5 — Instructor can gate them);
  channel outputs, trip scrams, ESF actuations, and interlock on_engage all go through
  `_sendInternal` (an `_internal` flag distinguishing plant-issued from operator commands —
  the hook the ESF AUTO/MAN arms and `manual_overrides` disengage build on). The clean-board
  + authored `auto_channels` preset rule moved from app.js into M5's start_scenario /
  start_follow; free-play selectPlant runs `engageDefaults()` (RBMK AR lineup preserved).
  UI: Automate tab is a pure face over `snapshot.automation`; `autoCtl`/`AutoControl` gone.
  One controller fix forced by the cadence change: the PV **derivative estimator** uses a
  fixed ~2 s time constant instead of per-sample smoothing — the difference quotient's noise
  scales 1/dt, and at 0.1 s sampling the kd damping term drowned the rod error (probed:
  Tavg loop limit-cycled ±13% power; with the fix it glides). run_autoctl.js rewritten
  (19 suites, incl. save/load round-trip + 3600× no-handoff probes); demand-swing power
  checks now assert a 100-s MEAN (power breathes a few % inside the rod channel's ±0.5 °C
  Tavg deadband — a point sample lands on an arbitrary phase). Gates: all green at baseline
  (campaign 36/36·1313, ops 52/66 same set, synoptic 55/55, e2e 23/25 + procedures 20/21
  pre-existing).
- **2026-07-15 — HPI/LPI merged into ONE emergency-injection system (stage 3, user direction).**
  `pwr_primary.injectionFlowInv` = a two-segment pump curve — high-head/low-flow (hpi_flow_max
  0.06 inv-frac/s, shutoff 16.44 MPa) + low-head/high-flow (lpi_flow_max×lpi_inventory_gain
  = 0.10 inv-frac/s, shutoff 4.5 MPa) — behind the single `hpi_active` flag; at TMI pressures
  the low-head segment contributes 0, so the flagship is numerically untouched (14/14).
  `hpi_flow_normalized` REDEFINED as delivered/combined-rated (0–1; was raw inv-frac/s — the
  only consumers were a >0 check in ops_pwr and display labels). `set_lpi` is a deprecated
  engine-side alias for `set_hpi`; `lpi_active`/`lpi_flow_normalized` removed from
  true_state/control_state/status (engine `_migrateState` folds a save's lpi_active in);
  instrument `lpi_flow` RENAMED IN PLACE to `hpi_flow` (same SOURCE-map slot ⇒ PRNG sequence
  unchanged, save-side key migration in PWRInstruments.load). Protection: the 2.76 MPa
  `set_lpi` actuation deleted (the 11.03 MPa set_hpi arm covers the one system; the low-head
  regime follows from the curve); alarm relabeled HPI/LPI ACTIVE. Synoptic ECCS card:
  HPI|AFW|RHR/LPI tabs → HPI/LPI|AFW|RHR; the HPI/LPI row shows delivered % of combined rated;
  the low-pressure SVG line animates when hpi_flow > 0.4 (only reachable via the low-head
  segment). New engine suite test `merged_injection_curve`. **e2e LOCA finding:** the old
  "LPI auto-starts at 2.76 MPa" check could NEVER pass — primary pressure floors at Tsat of
  the hot voided core (~5.5 MPa), so 2.76/1.5 MPa were unreachable; the injection check now
  asserts the merged system delivering at the floor (real, passes → e2e 24/25) and the
  accumulator check stays red as the documented blowdown-model gap (tuning target).
  Gates: pwr 14/14, campaign 36/36·1313, ops 52/66 (same set), synoptic 55/55, manual
  regenerated + procedures 20/21.
- **2026-07-15 — ESF AUTO/MAN arms + AFW throttle (stage 4).** Kernel §12: per-plant
  `esf_systems` data ({id,label,commands}); actuation defs carry `arm:'hpi'|'afw'` and evaluate
  only while armed; a non-`_internal` command listed on a system flips it to MANUAL (the
  plant's own actuations are exempt — the stage-2 `_internal` flag pays off); `set_esf_auto`
  re-arms AND clears that system's `actuationFired` latches so a STANDING condition re-fires
  (the point of re-arming). State in `automation.esf` (snapshot + save; absent = armed).
  **How each PWR auto is implemented:** HPI/LPI AUTO = armed for the 11.03 MPa actuation —
  no controller needed, flow modulates physically along the merged pump curve; AFW AUTO =
  armed for the 20 % SG-level pump start, and delivery = capacity × operator throttle
  (`set_afw_flow`, new) × a built-in proportional LEVEL HOLD (full flow below
  afw_level_target 20 %, tapering to zero across afw_level_band 8 %) — this REPLACES the old
  hard `level < 20` cutoff with the same equilibrium minus the chatter, which is why every
  TMI-2/LOFW scenario passed unchanged (campaign 36/36); CVCS make-up stays engine-internal
  (`set_cvcs_auto`) surfaced as the cvcs_makeup channel — migrating a working 50 Hz
  mass-balance loop buys nothing. **Deviation from plan:** the proposed `afw_level` PID
  channel was dropped — the engine-side proportional hold at the AFW target does the same
  job scenario-safely with zero new moving parts; a nominal-level AFW program is a v2 knob.
  New fields: true `afw_flow_normalized`, control `afw_throttle_pct`. Synoptic: HPI/LPI and
  AFW segs got real Auto lamps (snapshot.automation.esf) + an AFW throttle set-box;
  `eccs-auto` is no longer a no-op. Gates: m4 13/13 (arm/disarm/refire + throttle probes),
  pwr 14/14, campaign 36/36, ops 52/66 (same), synoptic 55/55, e2e 24/25, manual regenerated
  (set_afw_flow / set_esf_auto entries; stale fast-forward wording in the Automate entry
  fixed), procedures 20/21.
- **2026-07-15 — FEED PUMP model + three-element control (stage 5, user direction).** The PWR's
  feedwater is now driven through a feed pump: `feed_pump_speed_pct` (commanded) reaches
  delivered `feedwater_demand_frac` through a first-order pump inertia (`feed_pump_tau` 8 s).
  Writers of the commanded speed: MANUAL (`set_feed_pump_speed` 0–120 / `feed_pump_nudge` ±,
  the synoptic ▼▲ + set box — both uncouple), the THREE-ELEMENT channel (`feed_sg` rebuilt:
  SG level (1) + steam-flow feedforward (2) + 25×(steam−feed) mismatch trim (3) → pump speed;
  `manual_overrides` kick it to MAN on any manual pump command; **defaultOn — the PWR's
  free-play lineup**), and the LOAD COUPLING (retained engine-side but RE-PLUMBED to write
  pump speed — the plan's "retire coupling" was softened because instructed content starts
  channels clean and every load-maneuvering scenario relied on coupling for stability; with
  the channel default-on in free play the coupling is effectively the scenario/fallback
  path — deviation documented). `set_feedwater_flow` is a deprecated PWR alias (still real on
  RBMK/BWR); `sg_overfeed` override fixed 1.2→120 (pct-units slip) and its physics effect now
  sets pump speed; `loss_of_feedwater` intercepts the new commands. Kernel `_stepPid` gained
  the `trim` hook, and **anti-windup switched from I-clamping to CONDITIONAL INTEGRATION** —
  the clamp RATCHETED the integrator at an output floor (I forced to uMin−kp·e > 0 with the
  level high) and noise excursions then trickle-fed a zero-steam-draw SG (probed: the
  default-engaged channel overfilled the SG at HZP, 65→100 % in ~15 min; with conditional
  integration HZP holds 65–68 % over 4 h at 3600×). Stability probes: HFP/50 % hold 65±1.2 %
  over 2 h at 3600×. New control_state `feed_pump_speed_pct` (+ deprecated feedwater_flow_pct
  mirror); synoptic Steam & Flow card rebuilt (pump nudge/set, speed readout, "Feed control:
  AUTO — three-element / coupled / MANUAL" status). Gates: pwr 14/14, autoctl 19/19, campaign
  36/36, ops 52/66 (same), synoptic 55/55, manual regenerated (Feed Pump Speed / Nudge
  entries), procedures 20/21, audit PASS.
- **2026-07-15 — Rod auto mode: T-avg hold with variable speed (stage 6, user direction).**
  The `rods_tavg` channel is now the full automatic rod controller the user specified: on
  engage it captures **T-ref := the CURRENT indicated Tavg** (HR1 — the sp.capture idiom),
  compares Tavg to T-ref, and a mismatch (e.g. after a turbine load change) computes rod
  direction + a Westinghouse-style **variable speed ladder** (kernel `speeds:[{above,speed}]`
  on |eEff|: >0.8 °C slow, >2 normal, >4 fast [tune]; falls back to the old two-speed fastAt
  for the RBMK/BWR defs), locking up inside a **±0.8 °C (±1.5 °F) deadband** (db 0.5→0.8).
  The power-mismatch trim term stays dominant (authentic anticipation + the anti-limit-cycle
  finding). `manual_overrides: [rod_nudge, rod_start]` — operator motion on the CONTROL bank
  drops it to MAN (kernel group_id matching; shutdown-bank motion doesn't). Synoptic Rod
  Control card gained an Auto|Man seg + live T-ref readout (mirrors the channel like the
  RBMK AR card). New autoctl probes: T-ref capture, deadband lockup (≤2 nudges/120 s steady),
  manual-motion→MAN, other-group immunity — 20/20. Gates: campaign 36/36, ops 52/66 (same),
  synoptic 55/55.
- **2026-07-15 — RCP heat (stage 7, user direction).** `pump_heat_frac: 0.0055` [tune]
  (~0.55 % of rated core heat ≈ 15–20 MW for a 4-loop plant): `Q_pump = heat_gen_coeff ×
  pump_heat_frac × flow_frac` added to the coolant node (pwr_thermal.stepCoolant), and the
  equilibrium builders (`_computeEquilibriumTemps`, `_buildState`) carry it so the
  full-power refs shift consistently (+0.18 °C — inside every tolerance) and reset stays
  transient-free. Behavior gained (probed): HZP with the steam dump held closed heats at
  ~17 °C/h on decay+pump heat; with the RCPs tripped the heatup nearly stops. **Secondary
  bookkeeping finding:** letting the pump heat cross the SG as EXTRA STEAM made secondary
  pressure creep for hours (the pressure-compensated turbine draws core-power steam only)
  until power sagged out of band — ops "steady endurance 2 h" flipped red and the autoctl
  HFP holds drifted −11 %/10 min. Fix: net Q_pump out of `steam_generation_rate` (booked
  as SG blowdown/ambient losses — the lumped model has no other outlet); all primary-side
  effects unaffected. Gates: pwr 14/14, autoctl 20/20, campaign 36/36, ops 52/66 with the
  ORIGINAL failing set restored, manual regenerated (normal-value baselines shift ~0.2 °C).
- **2026-07-16 — Source-range + intermediate-range nuclear instrumentation (stage 8, user
  direction; setpoints researched from the NRC Westinghouse Tech Manuals).** Engine: detector
  signals proportional to normalized power (`nis.k_sr 5e8` cps/unit → HZP source floor ~500
  cps, SR full scale 1e6 cps ≈ 0.2 %; `nis.k_ir 8.333e-3` A/unit → IR calibrated band tops
  ~1e-3 A ≈ 12 % — the user's "maxes out around 10 %" — with physical over-range to 2e-3);
  `sr_energized` switch state (`set_sr_detector`, HZP starts energized); new true fields
  sr_counts_cps / ir_amps / sr_energized. Instruments `source_range` (cps) and
  `intermediate_range` (AMPS — the units question) appended LAST to the SOURCE map, with a
  new **log-domain instrument mode** (`spec.log`: lag buffer + noise sigma live in log10 —
  a decade of lag is a decade at any level). Kernel §13 extensions (all data-driven): trips
  take `id`/`condition`/`blockable`, config `trip_block_permissive` (P-10 = power_range ≥
  10 %), `set_trip_block` (refused below P-10, register-aware), **auto-reinstate** (blocks
  self-clear when the permissive drops — Westinghouse convention), interlock `blocks_when`
  param predicates, actuation `params` carry. PWR net: SR high-flux scram 1e5 cps
  (condition: sr_energized), IR high-flux scram 1.67e-3 A ≈ 20 % (blockable; the ladder
  P-10 10 % < IR 20 % < PR-25 gives a playable block window — the sim's power COASTS after
  rod motion stops, so a 10–12 % window was a trap; deviation from the plan's "IR trip at
  ~10 %" documented), PR LOW-SETPOINT scram 25 % (blockable), P-6 interlock pair on the SR
  switch (can't secure until IR ≥ 1e-10 A; can't re-energize above 1e-6 A), SR auto
  re-energize actuation when IR < P-6, `sr_high_flux` caution alarm 5e4 cps. **At-power
  lineup:** a layer built (or an old save loaded) with the permissive already satisfied
  starts with the blockable trips BLOCKED — real plants block them at P-10 on the way up;
  without this every at-power state insta-tripped (probed). M7's "each trip warns first"
  invariant now exempts `blockable` trips (their warning IS the blocking procedure; a
  matching IR/PR alarm would sit lit at power). **The SR→IR handoff is now a real skill:**
  ops "by-the-book startup" gained the handoff phase (verify SR floor + IR on scale, secure
  the SR) and PASSES; the "startup yank" ABUSE scenario now trips on SR high flux — ops
  52/66 → **53/66** (the trip fixed a tuning target). pwr_chain_reaction (Act I novice
  mission, rods-only gate) secures the SR in setup_commands and its stale "one wide-range
  meter" honesty notes now describe the real SR/IR + handoff; the manual's
  approach-to-criticality procedure gained NIS-check + handoff steps (STEP_UI/audit map
  updated). Synoptic: NIS block on Power & Reactivity (SR cps / IR amps readouts, SR On|Off,
  IR + PR-25 block toggles with lamps from rps_state.trip_blocks). Gates: pwr 14/14,
  m4 14/14 (conditioned/blockable/P-6/P-10 probes), m7 OK, campaign 36/36, procedures 20/21,
  audit PASS, synoptic 55/55.
- **2026-07-16 — 1/M startup plot (stage 9, user direction).** `ui/panels/one_over_m.js`:
  the app's first DRAGGABLE window (`RD.makeDraggable(el, handle)` exported for reuse —
  pointer-capture on the titlebar, viewport-clamped, z-index 250 above the modals' 210).
  Procedure as specified: PLOT at shutdown captures the source-range INSTRUMENT (HR1) as
  baseline C₀ (plotted as 1.0 at the current rod position); each later PLOT adds
  (rod fraction withdrawn, C₀/C); ≥2 points → least-squares line extrapolated to y=0 with a
  criticality marker + "predicted criticality ≈ N% withdrawn (≈ step S)" readout, shown only
  when the slope is negative and the crossing lies beyond the last point (else "insufficient
  trend"). Refusals: SR de-energized, no reading, counter pegged (>9e5 cps). SESSION TOOL by
  design — not in save files (an operator's scratchpad, not plant state); self-clears on
  plant change, reset, or a rewind past the last captured point (subscribes to broadcasts).
  Opened from the NIS block's "1/M plot" button. **Layout finding:** the NIS block made the
  Power card overflow under the Rod card (absolutely-placed margin cards) — fixed by (a)
  compacting NIS to three lines inside a COLLAPSIBLE section (auto-opens when the SR is
  energized = a startup lineup; user toggle wins) and (b) a generic
  `.plant-card:hover { z-index: 5 }` hover-raise so an expanded card's controls stay
  reachable over a neighbor. Verified interactively (playwright-core over headless Edge,
  13 checks): open/drag/close, SR-off + pegged refusals, DOM-driven fit math (synthetic
  startup predicts 60.0 % exactly), clear semantics; synoptic harness 55/55. Real-physics
  probe: from HZP the source-range 1/M line falls 1.000 → 0.207 across the withdrawal and the
  mid-approach all-points fit predicts 21.2 % withdrawn vs 27.6 % true criticality —
  conservative-early and converging as points land, the genuine 1/M phenomenon (rod worth is
  S-shaped); an un-secured SR correctly TRIPPED the same startup at criticality.
- **2026-07-16 — PWR MSIV + SG code safety valves (stage 10, user direction).** Engine:
  `msiv_open` state with `open_msiv`/`close_msiv`; both downstream paths (turbine steam AND
  dump-to-condenser) gate on it; closing with the generator loaded calls tripTurbine (real
  MSIV closure = turbine trip). New SG code safeties UPSTREAM of the valve — pop 9.31 MPa /
  reseat 9.0 / proportional to 1.2 rated [tune], above the 8.90 no-load dump setpoint so the
  dump does normal duty and the safeties are the bottled-SG backstop. **Behavior finding:**
  at power the bottled SG does NOT settle into a quiet hot standby — Tsat(9.3 MPa) ≈ 305 °C
  barely exceeds normal Tavg, so the safeties keep drawing near-full core heat while the
  tripped turbine's coupling zeroes feed: the SG DRAINS, and in the assembled stack the
  low-SG-level trip scrams the plant (~2 min). That IS the teaching outcome; the engine
  suite asserts the physics half (safeties lift ~7 s, band held, no steam past the valve,
  SG draining, dump restored on reopen — `msiv_closure_at_power`, 15/15) and a full-stack
  probe in run_m4 asserts the protection half (level scram + MSIV SHUT annunciator; the
  alarm needed `msiv_open`/`sg_safety_open` added to the STATUS instrument list). Alarms:
  MSIV SHUT (warning, B), SG PRESS HI (caution, 9.0). Synoptic: MSIV Open|Close on the
  Steam & Flow card (two-press confirm on Close; SHUT · safeties-lifting status). ACTS
  msiv-open/close now branch: PWR = the real valve, BWR = the legacy msiv_closure failure
  toggle. Manual: MSIV command/glossary entries; regenerated. Gates: all green at baseline
  (campaign 36/36, ops 53/66, synoptic 55/55).
- **2026-07-16 — Control-layer rework: docs + final gate sweep (stage 11, closes the
  2026-07-15/16 eleven-stage plan).** CONTEXT.md brought fully current: §6.2 automation +
  esf + trip_blocks snapshot sections, §6.3/§6.5 PWR field deltas (merged HPI/LPI, AFW,
  feed pump, NIS, MSIV), §6.7 command catalog with deprecation notes, §7 file map
  (layers/control/), §8 scope amended (operator-selectable automatic control is now an
  explicit scope extension; the LPI/accumulator "do not build" note updated).
  M4b_control_layer.md gained the §12/§13 kernel schema (ESF arms, blockable trips,
  trip_block_permissive, blocks_when, actuation params). SYN_CONTROL_MAP gained the new
  controls (SR detector/NIS/HPI-LPI/Feed Pump/1/M — with an `nis` reveal that opens the
  collapsible section), fixing verify_manual_follow (now 84 checks, up from 81 — the new
  startup-handoff steps verify through the live UI). Final battery: pwr 15/15 · rbmk 23/23
  · bwr 12/12 · m4 15/15 · m5 17/17 · m6 16/16 · m6ph 8/8 · M7 OK · autoctl 20/20 ·
  scenarios 3/3 · campaign 36/36 (1313) · ops 53/66 (better than the 52/66 pre-rework
  baseline) · e2e 24/25 (accumulator blowdown gap) · procedures 20/21 (bwr_sbo_rcic) ·
  audit PASS · manual-follow PASS · synoptic 55/55. Browser smokes: TMI lie intact
  (indicator closed + hot tailpipe), BWR ?auto=all engages 5/5, TMI-2 P1 chat loads.
- **2026-07-16 — Full Blueprint spec-sheet audit & as-built reconciliation (docs only).**
  Eight parallel audits compared every spec against the code; 18 Blueprint docs updated
  (~1300 lines) to as-built reality: M1/M2/M3 tuning tables & superseded models (decay-heat
  production form, AFW proportional hold, feed pump, DNB criterion, BWR implicit kinetics,
  ramped recirc), the protection-data move to layers/control/ in all three file maps, M4/M4b
  (kernel names, generic failure forwarding, direction-aware reset, new §4b interlocks, NIS
  trip net, ESF/HPI-LPI/RHR actuations), M5 (automation/trip_blocks/instructor snapshot
  sections, fixed-dt loop, 10/20 Hz cadence, §6b rewind ring, training-lifecycle routing),
  M7 (§3.6 reality, automation-check gap flagged, test/ ecosystem map), M8 + diagram docs
  (Automate/Dev tabs, Plant & Mission window, synoptic-only PWR surface, chat pane, URL
  params), M6/Gameplay/campaign/TMI2 (real interface + chat/follow/converge coverage, 6 acts
  / 25 missions, six-ending outcome model, Script.md marked superseded), CONTEXT §4 (F6
  deviation + cadence), DESIGN_COMPANION §7/§8.14 (auto-control & LPI/accumulator exclusions
  superseded), OPERATOR_MANUAL_PLAN #4 (RCP heat). **Code findings reported, not fixed** —
  see `Diagnostic/SPEC_AUDIT_2026-07-16.md`: UI-automation concern confirmed RESOLVED (no
  residual control loops in ui/); open items include in-engine turbine trips on true state
  (needs HR7 ruling), kernel `_evaluateCondition` true-state fallback (HR1 gap), two UI
  schematic colorings from true_state, RBMK `orm_alarm_active` from true ORM, the inverted
  severity_meta default bug, dead engine-side setpoint duplicates (BWR), and stale
  manual_procedures text pointing at retired UI.
- **2026-07-16 — Audit-fix pass: mechanical protections move in-stack (owner ruling) + HR1
  closure.** Ruling: turbine trips and relief-valve pop/reseat are CONTROL decisions — moved
  from all three engines into per-plant actuation data reading INSTRUMENTS (PWR pzr safeties
  17.13/16.55 + SG safeties 9.31/9.0; RBMK drum relief 8.0/7.8; BWR SRV 7.58/7.44; turbine
  low-vacuum 74.5 kPa + overspeed trips, all plants). Engines keep valve state + flow
  hydraulics and new commands (trip_turbine, open/close_pzr_safety, open/close_sg_safety,
  open/close_relief_valve); actuation setpoints derive from engine config (single source);
  engine suites keep the protections via an instrument-reading autoM4 harness emulator
  (0.1 s cadence, all three Harnesses; the PWR loss-of-vacuum test now waits out the 5 s
  vacuum-instrument lag). Kernel: condition gates instruments-only (no true-state fallback;
  unresolvable = NOT-met; M7 §3.6 asserts resolvability), severity default =
  (default−min)/(max−min) matching the UI slider (inverted metas via min>max — degraded_hpi
  meta flipped to 100→0 so its label reads true capacity), layer-held == engine-forwarded
  severity, plant literals out of the kernel (busyNote callback), dead branches/set_lpi
  vestiges removed. HR1 sweep: RBMK/BWR board schematics + status rows read instruments
  (channel_flow, recirc_flow, rcic_status, ads_open, eps_bypassed, station_blackout,
  orm_alarm_active); RBMK ORM annunciator derives from the orm_display reading (the
  Chernobyl indicator failure now fools it too); PWR AFW level hold senses the sg_level
  instrument; SG-imbalance annunciator reads indicated power; scram view-switch reads
  rps_scrammed. Failures: degraded_hpi/afw_failure retyped physics_parameter (effects
  degrade_hpi/block_afw — the fictitious command_override typing resolved). Instructor:
  operator_action branches always evaluated before inaction siblings. Test runner: asserts
  automation + trip_blocks + condition resolvability. Misc: RHR gained an ESF arm (synoptic
  Auto button re-arms via set_esf_auto), RBMK void ceiling/knee + sync taus + BWR recirc cap
  48 → config, BWR dead setpoints removed + RCIC harness aligned to the shipping 45.0,
  boron_rate/safety_injection_flow/manual-rod-branch dead code removed, manual_procedures
  startup text un-staled, verify_e2e_ui dhr-on expectation → rhr. Manual regenerated.
  Full battery green at/above baseline: pwr 15/15 · rbmk 23/23 · bwr 12/12 · m4 15/15 ·
  m5 17/17 · m6 16/16 · m6ph 8/8 · M7 OK (new checks + teeth) · autoctl 20/20 · scenarios
  3/3 · campaign 36/36 (1313) · procedures 20/21 (bwr_sbo_rcic, pre-existing) · e2e 24/25
  (accumulator gap, pre-existing) · ops 53/66 (baseline) · audit PASS · manual-follow PASS
  (84) · verify_e2e_ui PASS (16 shots) · synoptic 55/55.
- **2026-07-16 — PWR training campaign v2 (user direction: current controls, logical
  progression, periodic challenges).** The campaign taught the SUPERSEDED feed-follows-load
  coupling as normal (pwr_load_follow "feedwater follows the steam all by itself",
  pwr_sg_flood's coupled-feed premise, the sg_level procedure's dead "Feed Reg" control +
  set_feedwater_flow, stale "Primary/Secondary view" references across seven procedures,
  the qualify blurb still advertising the abandoned SBO exam). Rebuilt to 6 acts /
  31 missions ("Act III — The Controls" now walks pressure → feed pump (manual → the
  three-element channel) → rod AUTO T-avg → power escalation → grid dispatch → full
  automation → a graded shift exam): NEW missions pwr_feed_pump, pwr_rod_auto,
  pwr_startup_challenge (Act II checkpoint: solo criticality with the SR→IR handoff),
  pwr_shift_exam (Act III checkpoint: free-form 1000→850→1000, both manual and channel
  routes pass), pwr_esf (ESF AUTO/MAN arms: auto-fire, MAN drop, re-arm semantics),
  pwr_msiv (closure at power: safeties, the drain clock, reopen-decides-the-heat-path);
  REWRITTEN pwr_load_follow (three-element feed engaged; probed: the unit now rides even a
  1000→0 step — grid_lost became the scram catch; steam dump never lifts; Tavg +18 °C) and
  pwr_sg_flood (pump-left-in-MANUAL premise; both fixes accepted; no trip ever comes —
  the 96 % line is the failure). Probed content facts (all seed 42, CLEAN scenario board —
  start_scenario runs noDefaults, so probes must go through a stub scenario, NOT bare
  selectPlant): AFW arm fires at ~19 % SG ~12 s into LOFW at power but the 12 % RPS trip
  follows ~1.7 s later (no ~20 % pin at power — that's a post-trip number); post-trip AFW
  hold parks ~24 %; re-arming an ESF does NOT reopen an operator-shut throttle; MSIV
  closure at power: SG PRESS HI 5.4 s, safeties 7.2 s, low-SG trip ~50 s (NOT the stage-10
  "~2 min" — that figure predates the feed-pump replumb), and NO reopen timing avoids the
  trip (early = drain, late = shrink) — reopening decides whether decay heat rides the
  dump (reseated safeties) or cycles the bottled safeties indefinitely; solo-startup coast
  from a full pull runs 1 %→19 % in ~42 s with power_range crossing 12 % ~7 s before the
  IR trip (deterministic overshoot card); clean-board 1000→500 still scrams at ~180 s on
  SG LOW LEVEL. Procedures: sg_level rewritten to the Feed Pump + three-element reality
  (control label swapped in manual_ui_map/STEP_UI), card-name language replaces view
  references everywhere, LOFW step notes the AFW arm, boron 30×→8×. Campaign doc updated
  (Blueprint/pwr_training_campaign.md v2 tables). Gates: campaign 44/44 (1730, was
  36/36·1313) · scenarios 3/3 · m5 17/17 · m6 16/16 · procedures 20/21 (bwr_sbo_rcic,
  pre-existing) · audit PASS · manual-follow PASS (84) · verify_e2e_ui PASS.
- **2026-07-16 — RHR/LPI rework (user direction): hot-leg suction valve with a 400 psi
  interlock, HX-flow-split cooldown control, ECCS mode indication.** RHR was a bare
  heat-sink term (`rhr_active` + a 3.45 MPa permissive). Rebuilt to the real
  shutdown-cooling / LPI system. (1) **Hot-leg suction valve** `rhr_valve_open` driven by
  `set_rhr` (`set_dhr` alias): the engine refuses the open above
  `emergency.rhr_valve_interlock_mpa = 2.76` MPa (**400 psi**, was `rhr_permissive_mpa
  3.45`) and **auto-closes** a standing-open valve each step if pressure climbs back above
  it (`pwr_engine.step` §9b — the Westinghouse autoclosure interlock). `rhr_active` now
  mirrors the valve. (2) **HX flow split** `set_rhr_hx {fraction|pct}` → `rhr_hx_fraction`
  scales heat removed (`Q_rhr = rhr_gain · rhr_hx_fraction · (Tavg−sink)`, `pwr_thermal.js`)
  — the operator throttles cooldown *rate* with total loop flow constant, so *no net
  inventory change* (RHR is recirc hot leg→HX→cold leg; the RWST-fed injection path is the
  merged HPI/LPI curve = LPI proper). (3) **`eccs_mode`** ∈ {HPI,LPI,RHR,off} derived each
  step for one ECCS card: RHR when the valve is open, else HPI/LPI split at the 4.5 MPa
  low-head shutoff. **LPI stays merged** (user ruling): the low-head regime of the one pump
  curve, armed by the 11.03 MPa Safety Injection = the LOCA signal — no separate actuation.
  Control layer: RHR auto-align setpoint 3.45→2.76 to track the interlock (a higher one
  would silently no-op); `set_rhr_hx` deliberately kept OFF the `rhr` ESF arm (throttling
  rate must not disarm the valve auto-open); `valueFieldFor` maps `set_rhr_hx`→`pct`. UI
  left to the user (backend-only per direction) — binding contract in
  `pwr_synoptic_prerequisites.md` §6.2a. Docs: M1 §6.9 + tuning table, CONTEXT §6.5/§6.7,
  M4b §3b, synoptic prereq §6.1/§6.2/§6.2a, manual reference regenerated. Save migration:
  `rhr_valve_open ← rhr_active`, `rhr_hx_fraction ← 1.0`. New engine self-test
  `rhr_valve_and_mode` (8 ✓). Gates: run_pwr 16/16 (85) · e2e_controls 27/28 (accumulator
  blowdown gap pre-existing) · m4 15/15 · autoctl 20/20 · scenarios 3/3 · campaign 44/44 ·
  ops_pwr 15/19 (tuning targets, unchanged from baseline) · procedures 20/21 · audit PASS ·
  manual-follow PASS · verify_e2e_ui PASS.

### PWR pre-ship review (2026-07-19) — outcomes + rulings

Full findings log: `Diagnostic/PWR_SHIP_REVIEW_2026-07.md`. Plan:
`Diagnostic/PWR_SHIP_REVIEW_PLAN.md` (+ Amendment A1). Seven phases; PWR-scoped, BWR/RBMK
touched only to prove shared-layer changes didn't regress. Post-review gate baselines match
the README *Project status* block. Key outcomes:

- **C4 (FIXED).** A manual operator `scram` now latches `rps_state.scrammed` in the control
  kernel (before interception, matching the automatic trip path). The automation stand-down's
  `|| true_state.scrammed` dual-read collapses to `this.rps.scrammed`; the snapshot-level
  dual-reads (simulation_service/instructor) are kept defensive.
- **C2 (RULING — documented limitation, ship as-is).** Protection evaluates once per broadcast,
  so trips are late in sim-time at high acceleration. The PWR is safe even at 256× — `ops_pwr
  abuse_accel_latency` proves it trips and does **not** melt. The "small tick() fix" is NOT
  low-risk (shared cadence contract; would flip the deliberate RBMK RED C2 guard — out of scope).
  Revisit per-substep protection post-ship only if a plant can damage within one broadcast.
- **C3 (OPEN, post-ship).** No `reset_rps` recovery-from-scram path; a feature, not a fix.
- **Phase-3 code fixes.** Rewind double-step/double-broadcast (in-tick instructor `_restore`
  now `silent`); `_initialEsfArms` condition gate given the live instrument map; automation
  `requires`-note null-guarded; `p_pumpsuction` floored at 0; stale spray-floor comment fixed.
  No crashes / NaN / reversed-sign / bypassable-cap found (four-agent read-for-bugs pass).
- **Phase-4 Mode-5 UI (ship-blockers FIXED).** The Mode-transition heatup missions were
  unplayable from the real UI: RCP **Run** issued `clear_failure` (a no-op from cold shutdown)
  instead of `set_rcp{running:true}`, and there was no pressure-/steam-dump-**setpoint** control.
  Fixed the RCP buttons (`set_rcp`) and **added Pressure SP + Dump SP controls** (owner-ruled).
  The campaign gate missed this because it only checks a highlight resolves to a card, not that
  the card can issue the instructed command. Remaining Mode-5 polish (post-ship): `plant_mode`
  text indicator, explicit `eccs_mode` readout.
- **Documented known limitations (not fixed).** Decay-heat undercount on an un-scrammed runback
  (`pwr_engine.js:220` — intersects the DEFERRED P2-A load-follow tuning; needs a ruling);
  transient-cadence rounds 1× to ~1.2× real-time during transients; `set_speed` unclamped
  (UI-unreachable); save/restore drops mid-beat instructor counters.
- **Deferred (owner ruling, A1).** P2-A `ops_load_follow` partial-load Tavg 291.5 < 293 band —
  ship target is ops **19/20**, not 19/19; the test stays honest, not weakened.

### Website Phase W1 — static shell (2026-07-19)

Spec: `Blueprint/WEBSITE_SPEC.md` (Vercel + Supabase; anonymous-first; owner-facing
analytics — decisions locked with owner, incl. ReactorDynamics.com, no GitHub link while
the repo is private, keep-raw event retention with a 100 MB tripwire). Built in this pass:

- **Root `index.html` replaced** (was a meta-refresh redirect): landing with hero
  (owner-provided `site/hero.png`; `onerror` collapses the frame while absent), plant
  picker (PWR live → `ui/shell.html?engine=pwr` — the existing engine param, no sim
  changes; BWR/RBMK dimmed COMING SOON, deliberately not links), feature strip, footer
  disclaimer. `about.html` / `privacy.html` / `feedback.html`; shared `site/site.css`
  reuses the shell.css quiet-board palette so site → control room reads continuous.
- **Feedback W1 fallback is a download, not mailto** — a `rd_feedback_*.json` bundle
  (schema mirrors the future `POST /api/feedback` payload: category/body/email/diag)
  with client-side validation of attached `rd_diag_*.json` (`kind` check, 2 MB cap) and
  the W2 honeypot field already in the DOM. Mailto was rejected to avoid publishing a
  personal address; W2 replaces only the submit handler.
- **`site/version.js`** is the deploy stamp seam (repo placeholder; Vercel build step
  overwrites from `VERCEL_GIT_COMMIT_SHA`). **`.vercelignore`** ships only the sim +
  site (verified: ui/ makes zero runtime fetches — Manuals content is embedded in
  `ui/manual_data.js`, so excluding `Manuals/` etc. is safe).
- **Gate:** scratchpad headless-Edge Playwright harness, **12/12** — landing links,
  coming-soon non-links, package/validation/required-field flows, shell reachability
  via the landing path, zero console errors (hero.png miss excepted while pending).
- **Remaining for W1 done-done (owner):** create the Vercel project, connect repo,
  drop in `site/hero.png`, point ReactorDynamics.com DNS.

### Website W1 addendum — in-sim feedback, no player uploads (2026-07-19)

**OWNER RULING: players can never upload their own files.** Feedback telemetry attaches
ONLY from the live session. Spec §6 updated.

- `ui/app.js`: `exportDiag()` split into `buildDiagBundle()` (returns the schema-1.0
  diagnosis bundle) + `downloadJSON()`; Dev-tab export unchanged in behavior. New
  `sendFeedback()` builds `rd_feedback_<cat>_<plant>.json` (category/body/email/
  site_version/diag) with `diag` from `buildDiagBundle()` when the pre-checked
  "Attach this session's telemetry" box is on. W2 swaps only its tail for the POST.
- `ui/shell.html`: 💬 button (sim-controls row, after ?) + `#feedbackOverlay`
  (mission-overlay pattern; Esc-close wired into the global handler; status line
  clears on open). Loads `../site/version.js` so reports carry the deploy stamp.
- `ui/shell.css`: `.fb-*` form styles; **gotcha** — `.help-modal{height:auto}` (L455)
  loses to `.mission-modal{height:min(84vh,760px)}` (L1089, later same-specificity),
  so the feedback modal needed `.mission-modal.fb-modal{height:auto}` appended at
  file end to size to content. The help overlay itself still stretches (pre-existing).
- Site `feedback.html`: file input + client-side diag validation REMOVED; form is
  text-only, always `diag:null`, notice points at the in-sim 💬 for telemetry.
- **Gates:** scratchpad harness 20/20 (incl. overlay open/error/download, diag
  attach/omit, Esc close, no-file-input assert); `verify_e2e_ui` PASS (16 shots);
  `run_e2e_controls` 30/30.

### Website W1 addendum — `vercel.json` (2026-07-19)

Deploy config added so the Vercel import needs no dashboard-only settings:

- **`rewrites`: `/sim` → `/ui/shell.html`** — wires the clean route the spec's site map
  (§2) always listed but nothing implemented. Query strings pass through, so
  `/sim?engine=pwr` works. **In-page links stay relative** (`ui/shell.html?engine=pwr`)
  on purpose: absolute `/sim` hrefs would break `file://` and the headless harness,
  which open pages off the filesystem. `/sim` is the shareable URL, not the internal one.
- **`buildCommand`** stamps `site/version.js` from `VERCEL_GIT_COMMIT_SHA` (7-char sha,
  falls back to `dev` off-Vercel) — the optional build the spec §8 anticipated. All five
  consumers pick it up: the four site pages' footers and `ui/shell.html`, so W2 feedback
  reports and telemetry `sim_version` carry the deploy sha.
  - **Gotcha:** the stamper is inlined in `vercel.json` rather than a script under
    `tools/` — `.vercelignore` excludes `tools/`, so a script there would not exist at
    build time. Anything the build needs must be outside the ignore list.
- **`outputDirectory: "."`** — repo root is the site root; setting a `buildCommand`
  otherwise makes Vercel look for a `public/` output.
- **Verified:** `vercel.json` parses; build command dry-run with a fake
  `VERCEL_GIT_COMMIT_SHA` emits `node --check`-clean JS; repo placeholder restored.
  Pre-flight link audit across all five pages found no case-sensitivity breaks
  (Windows-local vs Linux-serving) — only the known-pending `site/hero.png`.
- **Remaining for W1 done-done (owner):** create the Vercel project + connect repo
  (nothing is pushed yet — `develop` is 13 ahead of `origin/develop`, and both remote
  branches predate W1), choose the production branch (`main` has no site on it yet),
  drop in `site/hero.png`, point ReactorDynamics.com DNS.

### Website W1 addendum — public changelog page (2026-07-19)

**Two changelogs, deliberately.** `changelog.html` is player-facing and its log **starts at
the public launch**; `CHANGELOG.md` + this file stay the engineering record and keep the
pre-launch history. Owner's call: cataloguing changes to something nobody could use yet is
noise, and the public page should read as product news, not commit subjects.

- Hand-maintained plain HTML — no build step, no JS dependency for content (a changelog
  should survive JS being off, and stay indexable). An HTML-commented `<article>` template
  sits in the page source with the house rules: newest-first, tags `added`/`changed`/`fixed`,
  write for players. Ships with a `.log-empty` state to delete when the first entry lands.
- `site/site.css`: `.log-entry` / `.log-head` / `.log-tag` / `.log-empty`. Tag colours reuse
  the board palette — added=`--running`, changed=`--normal`, fixed=`--caution`.
- Linked from the **footer** of all five pages, not the top nav — an empty changelog does
  not earn nav space; the nav stays Simulator/About/Feedback.
- **Gotchas hit while wiring the footers:** (1) the header nav and the footer both contain
  `About` → `Feedback` in sequence, so a naive first-match insert landed the link in the nav
  on `index`/`privacy` and the footer on `about`/`feedback` — match the About+Feedback+Privacy
  triple to hit the footer. (2) `git checkout --` restores these files **CRLF** (autocrlf),
  so an `\n` pattern that worked pre-checkout silently matched nothing after; use `\r?\n`.
- **Gate:** scratchpad headless-Edge harness, **14/14** — page renders, stylesheet applied,
  empty state present, zero real `<article>` entries (asserts the template stays commented),
  version stamp fills, footer link present exactly once and in the footer (not nav) on all
  five pages, index→changelog navigation, zero console errors.

### PWR board — preset lineups, wide-range SG, trip-block cue, pump temps (2026-07-20)

**Wide-range SG level (engine).** New `sg_level_wide` instrument. The engine models only
the narrow (working) range as a clamped integral, so wide range is an **affine remap** of it:
narrow 0–100 % is the `SG_WR_LO..SG_WR_HI` (30–75 %) window of the wide scale
(`pwr_engine.js` `SG_WR_LO/HI`, mirrored in the SG board component's gauge placement — a
shared constant contract). Appended to SOURCE + config with `noise:0` per the cross-step
PRNG rule. The SG board component now drives the **vessel water column from wide range** over
the full vessel, while the **LVL gauge marker rides narrow range** through the same window —
so the marker lines up with the water surface at steady state and reads its alarm/trip zone.
Caveat documented: both peg together (a truly independent wide range would need an un-clamped
secondary-inventory state, which the engine doesn't have).

**Free-play preset lineups (Mode 1/3/5).** Preset starts now come up operating. Split across
the two idiomatic free-play mechanisms so **instructed content (noDefaults) is untouched**:
- Control-layer `defaultOn` on `boron_conc` (boron control ON, `sp.capture` holds the preset's
  trimmed boron — a sensible per-mode target for free) and `cvcs_makeup` (charging AUTO).
- Engine `getStartupLineup()` for control_state with no channel to carry it — today just the
  letdown orifice (Orifice A on hot presets, isolated on `cold_shutdown`); applied by
  `simulation_service.selectPlant` only when `!noDefaults`.
- ECCS/AFW arms, trip blocks, steam-dump auto, turbine follow, feed auto were already
  mode-correct via the control-layer live-instrument init / engine defaults. Verified:
  M1 blocks `ir_high`+`pr_low_setpoint`; M3 `lo_flow`; M5 `lo_press`+`lo_flow` (P-11/P-7) with
  SI in MANUAL (P-11). Added `cold_shutdown` (Mode 5) to the UI preset picker.
- **Gotcha:** opening letdown at a free-play start only balances because charging is in AUTO.
  Two test harnesses assumed letdown closed at start and broke when CVCS was stood down
  (autoctl neutral baseline; e2e CVCS-vs-leak) — both now close letdown where they isolate a
  leak/inventory contract. Not an engine base-default change (would perturb every scenario).

**TRIP BLOCKS cue.** `.bd-btn` gained a `.bd-warn` (amber) state independent of the authored
active color, plus a `.bd-badge` count. Renderer `buttonWarn`/`buttonBadge` hooks; the driver
lights the TRIP BLOCKS button amber with the blocked-trip count whenever ≥1 blockable trip is
blocked.

**Pump fluid-color temps go live.** RCP → `tcold` (cold leg), feed pump → a feedwater proxy
(`fwTemp`, between hotwell and SG saturation, tracks load). Cold make-up pumps (HPI/RWST,
charging/VCT, condensate/hotwell) stay near-constant cold. Fixes the RCP rendering hot at cold
shutdown (was hardcoded 290).

**Gates:** run_pwr 31, campaign 51, autoctl 20/20, m4/m5/m6, m7 OK, e2e 30/30, board_check 52.
(`verify_e2e_ui` fails on this checks the retired synoptic control ids — pre-existing, unrelated.)

### PWR follow-up — dynamic wide-range SG, auto-ranging Tavg, boron/feedwater assessments (2026-07-20)

**Dynamic wide-range SG level (replaced the cosmetic remap).** `sg_level_wide_pct` is now the
INTEGRATED whole-vessel inventory (clamped only at 0/100); narrow `sg_level_pct` is DERIVED as
its `sg_wr_lo..sg_wr_hi` window (`pwr_steam_generator.js`). The wide gain is scaled by
`wr_span/100` so narrow's in-window dynamics are byte-identical to the old direct integration —
so trips fire on the same schedule while wide keeps reading past the narrow pegs (a dryout drives
narrow→0 at ~26 s, then wide continues 31→14→0). Campaign 51/51 confirms the reserve behavior at
the pegs moved no endpoint. Window constants live in `cfg.steam_generator`, mirrored in the SG
board component; migration seeds wide from narrow.

**Mode 5 was never unstable — the temp meters floored it.** `tavg/thot/tcold` had `range:[232,343]`
(the at-power narrow band), so cold shutdown's true ~50 °C pegged at 232 on every gauge/number and
mis-colored the RCP. True `tavg_c` holds 50 °C rock-steady. Fix: widen ranges to `[30,343]`
(at-power unaffected; all gates green) + an **auto-ranging vital Tavg gauge** — one slot that shows
the operating band [250-343] when hot and swaps to a wide LOW-RANGE [30-260] when cold (8 °C
hysteresis), via a generic `gauge.autorange(raw)` hook. Saves a second permanent gauge. Added a
`?init=<preset>` dev URL param. Verified in-shell: cold shutdown reads "Tavg · LOW RANGE 122 °F".

**Assessments (investigated, no change made):**
- *Boron per-preset values* (HFP ~747, M3 ~348, M5 ~495 ppm) are LOW and cold<hot (backwards vs a
  real plant), but they are the exact, internally-consistent output of the lumped reactivity model:
  constant boron worth (10 pcm/ppm, no temp dependence) + cold shutdown crediting the full inserted
  control-bank worth (−8500 pcm). Making them realistic is a whole-model re-tune (touches every
  boration transient + criticality tests), not a localized fix. Left as-is.
- *Feedwater temperature* is NOT modeled and should stay a UI proxy (`fwTemp`): the secondary
  energy balance is latent-heat-only with no sensible-heat term, so an engine feed-temp would be
  inert. Modeling it properly needs a hotwell/condensate node + FW-heater train + sensible-heat
  term — a real physics feature, not plumbing for a pump color.

### PWR board — live pipe temperatures (2026-07-20)

The board pipes were painted with a STATIC temperature authored in `pwr_board_data.js` — the hot-leg
run baked at 339 °C showed red even in Mode 5 cold shutdown (true ~50 °C). Pumps already colored to
their fluid temperature (RCP→`tcold`, feed→`fwTemp`); the pipes lagged behind.

**Fix.** The driver (`pwr_board_wiring.js`) gained a `PIPE_TEMP` map (pipe `id` → live °C) and a
`pipeTemp(id, s)` API method, same keyed-by-stable-id idiom as the item maps. The renderer
(`pwr_board.js`) captures each pipe's bore + flow polylines in `buildPipes` and repaints them each
snapshot via `StdPipe.phaseTempColor(phase, °C)` in a new `updatePipeTemps(s)` (called from
`render` after `updatePipeFlowStates`, and once at build time from `lastSnap`). Pipes not in the map
keep their authored color, so this is incremental — no board_data change.

Mapped pipes: RCS hot leg → `thot`; both cold-leg runs + pressurizer spray → `tcold`; pressurizer
surge → `thot`; SG main steam-out + main-steam header + TCV/dump branches → `satTempC(steam_pressure)`.
Verified via a node probe of `drv.pipeTemp` across the three presets (HFP hot leg 320 °C / cold leg
288 °C; Mode 5 all ~50 °C; steam header tracks SG saturation), and by hot-vs-cold board screenshots:
the whole primary loop is red at power and blue in cold shutdown.

**Also verified (no change): trip blocks are correct per preset.** `_initialTripBlocks` derives from
each blockable trip's permissive against live instruments — HFP blocks `ir_high`+`pr_low_setpoint`
(P-10, startup trips blocked at power), Mode 3 blocks `lo_flow` (P-7, low power), Mode 5 blocks
`lo_press`+`lo_flow` (P-11 depressurized + P-7). Matches real PWR permissive logic. **Pump temps**
are already fluid-based (RCP shows cold-leg temp — genuinely ~288 °C hot / ~50 °C cold; the
"pump-heat" `FLUID_HEAT` fallback in `comp_pump.js` only applies when no temp is supplied, which
never happens for a wired pump).

**Gates:** run_pwr 31/31, campaign 51/51, autoctl 20/20, m4 18/18, m5 19/19, e2e 30/30,
board_check 52/52.

### PWR board — live fluid pools + neutral trip-block cue (2026-07-20)

Follow-up audit of every fluid pool for live temperature/level tracking, plus a color-scheme fix.

**Fixed (were hardcoded in `pwr_board_wiring.js` compProps):**
- *Pressurizer fluid temp* was `temp: 345` (always max-red). Now `satTempC(primary_pressure)` — the
  pressurizer sits at saturation, so it's red at operating pressure (~352 °C @ 15.4 MPa) and cools
  as the plant depressurizes (~225 °C @ 2.5 MPa in the Mode 5 IC — legitimately hotter than the
  50 °C loop, exactly as a real pressurizer runs during heatup/cooldown).
- *SG boiling vigor* was `boil: 55` (constant simmer). Now `min(100, steam_flow*85)` — vigorous at
  power (~84), calm (0) at hot standby / cold shutdown where there's no steam demand.
- *Reactor core bubbles* were keyed on `subcooling_margin < 0`, which almost never triggers (a PWR
  core stays subcooled by pressure even in a LOCA — subcooling hit only ~11 °C, never negative, in
  probes). Now `max(core_void_fraction*400, subcooling<0 ? -sub*3 : 0)` — driven by the engine's
  REAL void fraction so bubbles appear as the core actually voids (a 20 % LOCA reached void≈0.016 →
  boil≈6), with the superheat term kept as a kick if subcooling ever does go negative.

**Trip-block button → grey.** Owner color scheme: green = normal, yellow = attention, red = alarm.
Trips blocked during a startup/shutdown lineup are NORMAL (P-10/P-11/P-7 permissives), so the amber
`bd-warn` was miscuing them as "attention". Added a neutral `.bd-btn.bd-info` (grey) + grey badge;
renderer gained a `buttonInfo` hook (parallel to `buttonWarn`); driver's TRIP BLOCKS indicator moved
from `buttonWarn` → `buttonInfo`. board_check updated to assert grey (bd-info, not bd-warn).

**Audited, left as-is (documented):**
- *Reactor vessel coolant pool* color is POWER-driven (fission-heat / Cherenkov-glow model), not a
  plain thermometer — so it reads cool at hot standby (hot but 0 % power). The fuel-rod / core-glow
  visuals SHOULD stay power-driven; splitting the downcomer pool onto a temperature scale is a
  comp_reactor_vessel rework, deferred (flagged for the owner). Level (`core_inventory_pct`) IS live.
- *Condenser hotwell* temp (40 °C) and level (55 %) are static — the engine models neither (no
  hotwell instrument); the condenser runs at a near-constant ~40 °C saturation under vacuum anyway.

**Gates:** run_pwr 31, campaign 51, autoctl 20, m4 18, m5 19, m6 16, m7 OK, e2e 30, board_check 52.

### PWR board — 1/M button, reactor-vessel temperature coloring (2026-07-20)

**1/M plot launcher.** The board replaced the synoptic, which had a `data-act="one-over-m"` button;
the board had none. Added a **1/M PLOT** button (opens `RD.OneOverM.open()`). Rather than hand-edit
the GENERATED `pwr_board_data.js`, the driver now exposes `extraItems()` and the renderer appends
those to `doc.items` at mount (deduped by id, before tiles build) — control tiles kept in driver
code survive a diagram re-export. New `EXTRA_ITEMS` + BUTTONS `bdOneOverM` entry in the driver.
Placed under TRIP BLOCKS (both are NIS/startup-net tools) at 370,890. board_check's tile-count
check stays balanced (injection precedes tile build); headless click test confirms the window opens.

**Reactor vessel: water color = temperature, fuel/glow = power.** Owner ruling — "glowing fuel rods
signify heat being generated, the fluid color signifies fluid temperature." comp_reactor_vessel's
`applyColors` drove BOTH fuel and the coolant gradients off `power`, so at hot standby (302 °C, 0 %)
the vessel read cool. Split it: `applyColors` keeps fuel rods + flux/thermal/fuel glows on power;
new `applyFluidTemp(tcold,thot)` colors the coolant via `StdPipe.phaseTempColor('water',·)` — the
downcomer/lower-plenum pool at Tcold, the core channel Tcold(inlet)→Thot(exit), the hot reservoir
and hot-leg throat at Thot. Driver passes `tcold/thot` in reactorVessel compProps. Verified: hot
standby now shows hot-red water with DARK fuel; full power glowing fuel in hot water; cold shutdown
blue. Same phaseTempColor ramp as the pipes, so the loop reads consistently end to end.

**Pressurizer level auto-hold — it already exists (no code change).** User asked for a pzr-level
auto-hold. The engine's `cvcs_auto` (CVCS make-up channel, board **CHARGING → AUTO**) already
modulates charging to the `pzr_level_nominal` setpoint (`pwr_primary.js` §9:
`charging = letdown + max(level_servo, inventory_makeup)`), and it defaults ON on free-play presets.
Probed: baseline holds 54.9 %; opening both letdown orifices, AUTO holds 53.4 % while charging
maxes to chase. Limitation (documented, realistic): it's charging-side only — it can raise/hold a
LOW level but can't drive a HIGH level down (letdown is a fixed-orifice lineup, as in a real CVCS).
The gap was discoverability (the control is labeled "CHARGING", not "PZR LEVEL"), not capability.

**Gates:** run_pwr 31, campaign 51, autoctl 20, m4 18, m5 19, e2e 30, board_check 52.

### PWR board — SG/feed/condenser temps, accumulator flow gating + clickability (2026-07-20)

Continuation of the coolant-color audit (owner: water color = temperature everywhere).

- **SG U-tubes + channel-head reservoirs → leg temps.** comp_steam_generator drove the tube
  bundle + hot/cold channel-head rects off `power`. Now `thot/tcold` props color them via
  `phaseTempColor('water',·)` (hot-leg side = Thot, cold-leg side = Tcold); the tube-bundle glow
  stays power-gated (heat transferred). Driver passes thot/tcold in steamGenerator compProps.
- **Feed-pump temp → load, not steam pressure.** `fwTemp` was `40+0.62·(satTempC(steam_pressure)−40)`,
  which read ~205 °C at hot standby even with the feed pump OFF (feedwater actually cold). Final
  feedwater temp is set by the FW-heater train (turbine extraction ∝ load), so now
  `40 + 1.8·power_range` (40 °C no-load → 220 °C full). Condenser hotwell likewise `33 + 0.12·power`
  (cool, backpressure rises with load). Cooling tower already had an internal inlet/outlet temp
  model — left as-is.
- **Accumulators not feeding at power.** The passive SITs inject only below the 600 psi check-valve
  setpoint (`accumulator_trip_mpa: 4.14`, already correct). The board animated the discharge whenever
  the isolation valve was open. Added a `flow` prop to comp_valve_vertical: open + water-filled bore
  but NO streak / inactive downstream port when `flow=false`. Driver gates it on
  `accumulators_discharging` (false at power). So the valve reads OPEN/aligned while the line sits
  still — physically the check valve holding back injection.
- **Accumulator isolation valve clickable.** It sits at (625,660), inside the reactor-vessel tile's
  box (360–640 × 400–835). It was already reachable at center, but to be safe clickable COMPONENT
  tiles (it.clickable) now lift to z-index 1 like buttons, so a big neighbor's transparent tile
  can't swallow the click. Verified: ports data-active=0 at power (no flow), z-index 1, click still
  toggles open↔closed.
- **Charging card NOT relabeled** (owner ruling — pzr-level-via-charging is learned in training).

**Gates:** run_pwr 31, campaign 51, autoctl 20, m4 18, m5 19, e2e 30, board_check 52.

### PWR board — one water ramp everywhere (2026-07-20)

Owner ruling: ALL water on the board uses the shared `StdPipe.phaseTempColor('water',·)` ramp
(aqua→blue→purple→red); steam uses the grey steam ramp. Remaining offenders used their own
`mix(COOL,HOT,·)` blend:
- **Cooling tower** (`comp_cooling_tower`): basin/trough water now `phaseTempColor('water', outletTemp)`,
  falling rain `phaseTempColor('water', inletTemp)`. Plume/haze/shell-glow are heat-rejection vapor,
  not liquid water — kept as-is.
- **Condenser** (`comp_condenser`): the circulating cooling water (tube-bundle gradient + inlet/outlet
  chambers) now on the ramp — cold supply (~25 °C) / warm return (25 + load·14). Hotwell/steam were
  already on the ramp.
- **Condensate/feedwater + CW-loop pipes** added to the driver `PIPE_TEMP` map so the pipes match the
  components they join: feed pump→SG = `fwTemp` (hot, load-driven, matches the feed pump), condensate
  lines = `condTemp` (~33–45 °C), CW return/supply = warm/cold. New shared `condTemp(s)` helper (also
  used by the condenser compProps).

**Gates:** run_pwr 31, campaign 51, autoctl 20, m4 18, m5 19, e2e 30, board_check 52.

### PWR — CVCS pzr-level control, feed-pump color, pump-off pipe gating (2026-07-20, playtest)

Playtest findings.

**Pressurizer level control (physically correct, no truth-peeking).** AUTO charging held level
with `charging = letdown + max(level_demand, inv_demand)` — the `max` floored charging at letdown, so
a HIGH level was never brought down (charging never dropped below letdown). First attempt gated the
`inv_demand` make-up floor on true `leak_flow`, but that's unphysical (a real CVCS level controller
cannot know a leak exists). Root cause: a liquid leak did NOT lower the pzr level in `stepLevel`
(only porv/safety steam-space vents did), so the level servo couldn't see a leak — hence the bolted-on
mass-peeking term. Fix: add `leak_flow` as an inventory-out term on the level in `stepLevel`
(`cvcs_surge = (charging − letdown − leak_flow)·K_cvcs_level`), same coefficient as letdown so the
mass and level equilibria agree; then AUTO charging becomes a PURE level servo
(`charging = clip(letdown + level_demand, 0, charging_max)`, reading only indicated level, HR1). A
leak now lowers the level → the servo charges up to hold it → makes the leak up on its own, exactly
like a real plant; a high level drives charging below letdown to come back down. TMI path untouched
(stuck PORV vents steam, leak_flow=0, level rises via void_surge). Gates: e2e 30/30 (leak-match +
inventory-hold both pass), autoctl 20, run_pwr 31, campaign 51, m5 19.

**Feed-pump fluid color + pump-off pipe gating (board).** Feed pump + both its pipes now read one
`fwTemp` (the pump matched only its discharge before). `comp_pump` gates its suction/discharge port
`data-active` on the running state, so turning any pump off stops the connected pipes' flow animation.

**Open playtest items (tasks #22–27):** spray too strong (PORV never lifts on a full-power heat-sink
loss — spray AUTO holds ~2255 psi vs ~2379 with spray off), reactor-vessel z-order over the rod
cards, slow-rod-insertion SCRAM at 100%, a spray/PORV tuning test, and a meta-analysis of why the
prior production-readiness review missed all of these (control-loop / physical-plausibility gap).

### PWR CVCS make-up — bumpless transfer + letdown low-level isolation (2026-07-21)

**Reported symptom (owner playtest):** "CVCS seems unbalanced and the auto doesn't work
very well" → then "you shouldn't be able to drain the plant in 30 seconds."

**Root cause.** Under AUTO make-up, `charging_setpoint` sat frozen at its init value (0)
while the true `charging_flow` modulated (`pwr_primary.stepInventory`). Toggling CVCS make-up
to MANUAL ran `charging_flow = charging_setpoint = 0` (`pwr_engine.js set_charging_flow`
path via the auto-off branch), so letdown (orifice A ≈ 0.030) kept bleeding against **zero**
charging → net −0.030/s drained the pressurizer in ~15 s and the whole RCS in ~33 s from one
click.

**Why 33 s (and why NOT rescaled).** `level_per_mass = 100` maps pzr level to total RCS mass
1:1 (mass 1.0 → 55 %; the pzr empties ~0.45 below nominal), and CVCS letdown/charging share the
**same normalized inventory-fraction scale as leak/LOCA/ECCS** (0.06 charging ≡ 40 gpm ≡ a big
slice of the lumped inventory). So a 20 gpm letdown reads as ~3 %/s of inventory — unphysical in
absolute terms, but rescaling *only* CVCS would break the leak/LOCA make-up calibration tuned
against those units (charging_max ≈ 2× a 0.03 leak, ≈ ½ a 0.12 LOCA). Ruling: do **not** rescale;
fix it the way a real plant is bounded — make it impossible to drain the plant via CVCS.

**Fixes.**
1. **Bumpless AUTO→MANUAL transfer** (`pwr_engine.js set_cvcs_auto`): on the true→false edge,
   `charging_setpoint ← charging_flow` — the manual station tracks the live auto output, so
   MANUAL holds inventory instead of snapping to a stale setpoint. (Residual: manual inherits the
   auto controller's small proportional droop bias → a slow, operator-trimmable level drift, not a
   drain.)
2. **Letdown isolation on low pzr level ~17 %** (`pwr_control.js PWR_ACTUATIONS`, config-driven
   actuation → `set_letdown_orifices {a:false,b:false}`). Real Westinghouse interlock; fires before
   the 12 % low-level reactor trip. Latched (`reset_below: 20` re-arms the fire latch only; no
   `reset_action`, operator re-opens). Bounds every over-letdown case — including the A+B lineup
   whose flow (~0.070) exceeds charging_max (0.060) and used to drain silently — to a self-arrest
   at ~17 %, mass floored (~0.49 in probe), RCS never empties.

**Gates:** pwr 31/31, autoctl 20/20, m4 18/18, scenarios 3/3, procedures 21/21, campaign
51/51 (2897), ops 58/67 (unchanged 9 documented RBMK/BWR tuning targets, zero pwr — actually
+1 vs the stale README 57). `run_e2e_controls` stayed **27/30** — the 3 reds are pre-existing
(stash-verified) and unrelated to make-up balance; logged as **F12** (stale PZR-spray reach +
two CVCS-auto-vs-severity-1.0-SGTR expectations that predate the SGTR leak rescale). README
baseline line corrected (e2e 30→27, ops 57→58).

### Manual unification + instructor auto-checklists (2026-07-21)

**One PWR manual.** Owner ruling: the `Manuals/*.md` set is THE manual; the generated web
manual (RD.MANUAL pwr profile) was retired after a full content-gap audit ported everything
worth keeping (per-IC normal values → 09 §11.0 regenerated from the LIVE engine, indication
ranges + linked alarms → 03 §16.0, engine command reference → 03 §18.0, `set_rhr_hx` +
~50 °C/h → 03 §11.2 + 05, severity sliders + new PWR-E22 `pzr_level_sensor_low` procedure
→ 07) and left the stale bits behind (1000-MWe-era normal values, HPI 11.03, HZP steam 8.9).
`gen_manual_reference.js` now emits a pwr **reference-only stub** (indication id→name for
the Failures-tab picker — the one non-manual consumer of the profile); RBMK/BWR profiles
unchanged until their own passes produce md sets.

**Manual on the site.** `tools/pack_manuals.js` packs the 13 operator docs into
`ui/manual_md.js` (`RD.MANUAL_MD`, ~184 KB; the three dev logs deliberately excluded), and
`ui/md_render.js` (`RD.mdToHtml`, escape-all GFM-ish: tables/lists/fences/quotes/hard
breaks; `.md` links → in-manual `data-doc` nav) renders them in the Manual overlay.
Procedures/Accidents remain LIVE sections from RD.MANUAL_PROCEDURES (follow + checklist
buttons). Edit a manual → re-run the packer. Old renderer path kept for rbmk/bwr
(`p.reference_only` guards the pwr stub from it).

**Auto-checklists (Path 3).** `instructor_layer.js` gained a checklist runtime orthogonal
to mode: a procedure run PASSIVELY against the live plant — no reset (vs `start_follow`),
no command gating, sequential auto-check of the active step (acc graded instrument-first
with the follow debounce; saw latched; cmd-family observed when nothing gradable; pure
observation steps hand-tick via `checklist_check`, which is also the operator override).
M5 commands: `start_checklist` / `stop_checklist` / `checklist_check` (each broadcasts).
Snapshot block `instructor.checklist` (step text NOT duplicated — UI reads
RD.MANUAL_PROCEDURES like follow). Survives save/load independent of mode; any
scenario/follow load clears it. UI: chat-style bubbles in the instructor card (done ✓ /
active ▸ + live acc status / pending ○), 📋 picker on the card (free play only), 📋 buttons
on manual proc cards + walkthrough rows. New gate `test/run_checklist.js` (24 checks).

**Stale-scale sweep (found while auditing):** `manual_procedures.js` pwr still commanded
600/700 MWe (→ 60/70) and told the operator HZP Tavg ≈ 304 (→ 297, the no-load anchor);
manuals 04/05 said Mode 3 ≈ 304 °C in five places (→ 297); 09 imbalance cue 40 MWe (→ 4),
"Rated MWe 1000" (→ 100), missing `rcp_cavitation` row; `pwr_config.js` `mwe_output`
instrument range was `[0,1300]` (→ `[0,130]`, noise 1.0 → 0.1 — same relative noise as
pre-rescale).

**Gates:** checklist 24/24, procedures 21/21, m6ph 8/8, m6 16/16, m5 19/19, m4 18/18,
pwr 31/31, behavior 30/0/0, ops-pwr 20/20, autoctl 20/20, scenarios 3/3, campaign 51/51
(2897). Full run_ops 58/67 — the 9 fails are the documented RBMK/BWR tuning targets
(zero pwr). md-renderer smoke: 13/13 docs render with balanced tables/lists.
`verify_manual_follow` PWR bar checks fail 30 on clean HEAD too (worktree-verified
pre-existing: like `verify_e2e_ui`, it still probes the retired `RD.PwrSynoptic`
reveal while the board display mounts); its manual-pill and rbmk/bwr checks pass.

### P7 CVCS↔inventory retune — letdown drain rate, SGTR re-anchor, SI on level (2026-07-22)

**Owner request:** "letdown can drain the pressurizer way too fast — too fast to respond to and
unrealistic; do a tuning pass and evaluate associated behaviors." This SUPERSEDES the 2026-07-21
ruling ("do not rescale; bound it with interlocks") — the drain *rate* itself is now the defect.

**The retune.** New `[tune]` `cvcs_inventory_gain: 0.012` (`pwr_config.js reactivity`): CVCS
charging/letdown normalized flows (gauge scale — orifice A 0.030 ≡ 20 gpm) enter
`pwr_primary.stepInventory`'s mass balance through this gain instead of 1:1 on the accident
scale (leak/ECCS/relief keep the fast lumped scale — accident pacing untouched). Result:
uncompensated orifice-A drain ≈ **2.2 %/min** of pzr level (was ~2 %/s — the "drain the plant in
30 s" bug); A+B ≈ 5 %/min; max manual charging ≈ 13 %/min (going-solid regime). Gain window was
constraint-derived before tuning: probe `ops_cvcs_pzr_drain_rate` needs ≥300 s per 15 % (g ≤
0.017); CA-4's PI-8 overfill backstop must trip inside 300 s (g ≥ ~0.008). 0.012 splits it.

**Servo re-tune (forced by the same change).** The AUTO make-up loop gain is
`cvcs_charge_per_level · g · level_per_mass`; with g down ~80×, the old 0.001 parked a CC-8-size
leak (2.4e-4 frac/s) ~20 % below program → CC-10's "inventory 97..103" failed at 96. Stiffening
alone hits CA-3's noise ceiling (charging must NOT chase gauge noise: max excursion ≤ letdown +
0.012 over 600 s). Resolution: a first-order **damping filter on the level error**
(`cvcs_level_filter_tau: 20 s`, new engine state `_cvcs_err_f`, reseeded on AUTO engage — a real
M/A station's damping) kills the noise path, letting `cvcs_charge_per_level` go 0.001 → **0.01**
(loop τ ≈ 83 s; the CC-8 leak parks ~2 % low). Save-compat: `_cvcs_err_f` lazily seeded, old
saves fine. Deleted dead config `cvcs_makeup_gain` (defined, never read) and the write-only
`_charging_actual` stash (stale since the CC-10 derived-level rework).

**Knock-on 1 — SGTR re-anchored (`leak_scale` 0.12 → 0.03).** The FG-6 anchor "full rupture =
2× charging_max" was premised on charging living on the accident inventory scale; post-retune
that comparison is meaningless — and the old scenario pass was FAKE: AUTO charging had been
delivering up to 0.06 frac/s ≈ a second full HPI, silently carrying `ops_sgtr_managed`
(inventory hit literal 0.0 without it). New anchor, same intent: full rupture = 0.03 frac/s ≈
½ HPI high-head rated ≈ 2× SI-at-pressure — still overwhelms CVCS (~40× its make-up authority),
still forces trip + SI + EOP, and the subcooling-guarded walk-down now WINS the inventory race
(min 55.2 %, final 92 %). Behavior probes that encode absolute leak sizes had severities ×4
(CA-3 0.012, CC-8/CC-10 0.008, CC-10b 0.024); TR-13's anchor is now computed against
`charging_max · cvcs_inventory_gain`; TR-13's "delivered < 0.9×base" outcome check re-scoped to
assert the ΔP-modulation MECHANISM (post-retune hands-off anatomy: trip + SI hold the primary
subcooled at pressure while the overcooled secondary sags, so ΔP can sit at/above rated — the
walk-down outcome lives in `ops_sgtr_managed`).

**Knock-on 2 — SI on pzr level lo-lo (P1(b) CLOSED).** With the smaller leak the heaters
out-muscle `K_leak_depressurize`, so the pressure-only SI path never fires while a leak drains
the RCS at full pressure — exactly the P1(b) gap. New ESF actuation (`pwr_control.js`):
`pzr_level low 12 %` → `set_hpi`, latched (re-arm above 20 %, NO reset_action — securing SI is
deliberate), riding the existing `hpi` ESF arm, so the cold P-11 disarm and operator-manual
override gate it for free. TMI untouched: its deceived level reads HIGH, so this path stays
silent (and that silence IS the historical lesson).

**Knock-on 3 — `ops_sgtr_managed` EOP made faithful.** The scripted EOP throttled SI on
subcooling alone; real SI-termination criteria require subcooling AND pzr level recovered.
Added the level condition (terminate only >33 %, re-initiate <20 % or margin <15). The old
script survived only on the phantom charging.

**Manuals:** 09 §3.0 gained the SI-on-level row AND the (previously undocumented) 17 % letdown
isolation row; 06 PWR-A14 notes auto-SI; 03 §7.3 gained a "rate feel" bullet (≈2 %/min etc.).
Repacked (`pack_manuals`), reference regenerated.

**Gates after:** pwr 31/31 · rbmk 23/23 · bwr 15/15 · behavior 30/0/0 · ops **59/68** (PWR
21/21, zero fails — P7 green; 9 remaining are documented RBMK/BWR + deliberate C2) · m4 18/18 ·
m5 19/19 · m6 16/16 · m7 OK · autoctl 20/20 · scenarios 3/3 · campaign 51/51 (2897) ·
procedures 21/21 · checklist 24/24 · e2e_controls **28/30** (F12 shrank by one — "AUTO charging
converged" turned green; 2 stale reds stand) · `verify_e2e_ui` FAIL **pre-existing** (verified
identical on clean HEAD 4df8ac5; same retired-PwrSynoptic-probe family as the documented
`verify_manual_follow` 30-check fail).

### Owner ruling — ECCS/HPI is a dedicated pump train (justifies the CVCS↔HPI scale gap) (2026-07-22)

Following the P7 CVCS retune, a review flagged one *seam*: CVCS charging and HPI represent, in a
real Westinghouse plant, the **same** centrifugal charging pumps (they do double duty as high-head
SI), yet the model puts them on very different flow scales (charging ≈ 7.2e-4 frac/s max via
`cvcs_inventory_gain`; HPI high-head 0.06 frac/s). **Owner ruling:** in *this* plant the **ECCS/HPI
has its own dedicated pump** (RWST-sourced SI train), NOT the charging pump doing double duty — so
the scale difference is physically correct, not a compromise. This is already how the model is
built end-to-end: independent flags (`hpi_active` via `set_hpi` vs `charging_pump_running` via
`set_charging_pump`), independent injection gating (`injectionFlowInv` checks only `hpi_active`),
its own discharge-pressure instrument (`hpi_discharge_pressure`), and a dedicated **ECCS pump**
element on the board (`pwr_board_wiring.js`, "eccs pump (RWST — cold)"). Comments in
`pwr_primary.injectionFlowInv` and the `pwr_config.js emergency` block were reframed from "the
classic HPI charging-pump head" to "dedicated ECCS train (head coincides with the classic
centrifugal-charging curve)" so the seam isn't re-flagged. **Comment/doc only — no physics or gate
change** (`run_pwr` 31/31 unchanged).
