# Test Suite Review — 2026-07-19

**Scope:** every suite under `test/` (22 files, ~6,000 lines) plus the embedded engine suites
(`RD.PWRScenarioTests` / `BWRScenarioTests` / `RBMKScenarioTests`), reviewed for (a) correctness —
does each check assert what it claims — and (b) gaps — engine/layer features with no assertion.
Six parallel review passes (PWR engine, BWR/RBMK engines, M4–M7/scenarios, ops, autoctl/e2e/procedures,
campaign), each spot-verifying suspicious checks with live probes against the engines.

**Baseline at review time** (develop @ `ff0465d`, which landed mid-review adding
`cvcs_level_control` + `pressure_saturation_bounds`):

| Suite | Result | Notes |
|---|---|---|
| run_pwr | 28/28 (171) | green |
| run_bwr | 12/12 (74) | green |
| run_rbmk | 23/23 (145) | green |
| run_m4 / m5 / m6 / m6ph / m7 | all green | m7 negative gate verified genuine |
| run_scenarios | 3/3 | green |
| run_campaign | 47/47 (1842) | green |
| run_autoctl | 20/20 | green |
| run_ops | 56/66 | PWR 18/19, RBMK 25/29, BWR 13/18 — all 10 FAILs map to documented tuning targets |
| run_procedures | 20/21 | the FAIL is documented finding B3 (BWR SBO boiloff) |
| run_e2e_controls | **27/28** | the FAIL is a **stale test**, not a regression (see §1) |

**Verdict in one paragraph.** The suite is substantially genuine — most checks assert real plant
state, the M7 sabotage gate has real teeth, the campaign gate asserts branch-specific outcomes, and
the ops failures are exactly the documented tuning targets (no undocumented regressions). But the
review confirmed ~20 checks that cannot fail or assert something other than what they claim, one
class-A protection gap (the BWR suite has **zero** reactor-trip assertions, which is why the known
unfireable BWR high-flux trip has survived), one recently-shipped protection with **zero coverage
anywhere** (P-14 feedwater isolation), and a process gap (no aggregate gate) that let a suite drift
red unnoticed.

---

## 1. Current failures triaged

- **run_e2e_controls 27/28 — STALE TEST.** "charging_flow indication > setpoint under AUTO"
  (`run_e2e_controls.js`) was calibrated against the pre-rescale SGTR leak. Commit `e28f7b0`
  (`leak_scale: 0.03`, `layers/control/pwr_control.js:176`) shrank the equilibrium charging flow
  33× below the check's 0.005 margin. Probe: the AUTO servo converges charging to **exactly** the
  leak rate (0.00120 inv-frac/s), holds PZR level at 55.0 — the automation is working perfectly.
  Algebraic check confirms the newer level-servo law (`1a10f19`) can only *raise* charging vs. the
  old law, so it is innocent. Note the known-fail *identity migrated silently*:
  `Blueprint/BUILD_DECISIONS.md:585` still attributes the 27/28 to the accumulator/blowdown check,
  which now passes (the stale comment at `run_e2e_controls.js:136-139` describes the removed
  1.5 MPa physics). **Fix:** assert the servo's real contract (true `charging_flow` ≈ `leak_flow`,
  level held) or inject a larger leak.
- **run_procedures 20/21 — documented finding B3** (`bwr_sbo_rcic` step 3, level 2.42 vs > 40;
  OPS_TUNING_REPORT §2 item 2 + §6). The runner exits 1 with no expected-fail mechanism, so this
  gate is *permanently red*. **Fix:** an `xfail: 'B3'` annotation that reports without failing the
  exit code — a perpetually red gate trains people to ignore red.
- **run_ops 56/66 — all 10 mapped to documented findings**, four with the report's exact numbers:
  PWR `ops_load_follow_daily` → P4 (deferred per `ff0465d`); RBMK flow-reduction-post → R3,
  feedwater dips → R2, chernobyl-post → R1; BWR LOFW → B3, SBO → B4, recirc-trip → B2,
  rod-yank-no-trip → C1, SRV-walkaway → B5. **No undocumented regressions; nothing documented-fixed
  still fails.**

## 2. Confirmed incorrect tests (cannot fail, or assert the wrong thing)

### PWR engine suite (`engines/pwr/pwr_engine.js`)
1. **`eccs_boration` injects a nonexistent failure id.** `:1823,1834` use
   `failure_id: 'primary_leak'` — that's an *effect* name; the table has only `sgtr`/`large_loca`.
   `_injectFailure` silently no-ops (`:747-749`), so the "LOCA" never happens: the no-injection
   control check compares an untouched plant to itself, and probing shows fixing the id would make
   that check **fail** (accumulators borate 747→2500 ppm on a real large_loca). Root enabler:
   `inject_failure` with a bogus id returns success (`:748`).
2. **`transient_loss_feedwater` trip check is tautological at power.** `:1516` asserts
   `rpsWouldTrip().length > 0`, but the helper (`:1330-1341`) ignores P-10/`blockable` semantics, so
   a *healthy* full-power plant already returns `["intermediate_range high","power_range high"]`.
   Passes regardless of the SG-level trip. Also `:1513-1514` still calls 12 % "the trip setpoint" —
   it moved to 17 % (`pwr_control.js:34`), which is pinned nowhere.
3. **`transient_loss_vacuum` timing predicate is dead.** `:1554` waits on `ts.turbine_tripped`,
   a field `getTrueState()` doesn't expose — always false, `tt = -1`, observed prints `'never'`.
   The pass condition reads engine state directly (genuine) but does not test the claimed
   "within 30 s of the instrument catching up".

### BWR/RBMK engine suites
4. **BWR: zero RPS/trip assertions; `rpsWouldTrip` is dead code** (`bwr_engine.js:800-809`, never
   called). Probe: true power 175.3 % with `power_range` pegged at exactly 120.00
   (`bwr_config.js:180` range `[0,120]` vs strict `> 120.0` trip) — the exact C1 defect, invisible
   to the suite. RBMK got the `[0,200]` fix (`rbmk_config.js:178-182`); BWR never did.
5. **`bwr_engine.js:985`** "ads_open starts false" — tautology; the harness never emulates the ADS
   actuation row in those runs, so it cannot be anything but false.
6. **Conditional-vacuous pattern** `bwr_engine.js:950-951` (RCIC cutoff) and `:992-993` (LPCI
   high-pressure block): `precondition ? assert : true`. Live today (preconditions hold), but a
   retune silently converts them to always-pass. Assert the precondition itself.
7. **RBMK `eps_bypass` check half-vacuous** (`rbmk_engine.js:906-909`): runs at steady full power
   where *nothing* is past a setpoint — `rpsWouldTrip` returns `[]` with and without bypass. No
   positive control (trip fires un-bypassed) exists anywhere in the suite.
8. **RBMK `flagshipPost` "no excursion"** (`:868`) asserts only final power < initial — a transient
   spike to several hundred percent would pass. The computed `peak` is printed but not bounded.
9. **RBMK stuck-rod "worsens excursion"** (`:959`) uses non-strict `>=` with ~1.7 % real margin
   (both peaks saturate on `MAX_PROMPT_GROWTH`); equality passes. The robust discriminator (stuck
   melts sooner: 0.74 s vs 0.82 s) is unasserted. Also `:810` low-power ORM "≈7.5" asserts only
   `< orm_min` (= 43 on post — 6× looser than described).

### Module suites (M4–M7)
10. **`run_m6.js` — three literal-`true` tautologies**: `:339`, `:343` (checkpoint requests),
    `:387` (reset unloads scenario) pass the literal `true` as the pass argument; the real result
    sits in the display-only observed slot. And `:349` is **self-defeating**: the observed
    expression consumes the checkpoint flag before the pass predicate re-reads it, so the exact
    regression it guards (rewind beat also checkpointing — the "one slot off" bug noted at
    `instructor_layer.js:260-261`) would pass.
11. **`run_m4.js:192`** "safeties lifted while bottled" is `sg_safety_open || scrammed`, and the
    next line requires the scram — the safety lift is not actually pinned.
12. **`run_m4` evaluates M4 every 0.02 s step** (`:22,31`), not at the M5 broadcast cadence it
    claims to mirror — every trip-latency result is validated 5–300× tighter than production. This
    is why finding C2 (protection latency grows with acceleration) has no regression test anywhere.

### Ops suites
13. **`ops_pwr.js:517-518`** `abuse_accel_latency` check named "protection catches it" asserts only
    `!melted` — today's data inside that PASS: **198 % power, no trip at 1× or 256×** (the C1-PWR
    defect live). Meanwhile C1-PWR's designated acceptance (`abuse_startup_yank`) is **dead**: the
    since-added SR trip ends the yank at 0.02 % power, so no PWR test can ever again expose the
    pegged `[0,120]` flux meter (`pwr_config.js:366`, still unfixed).
14. **`ops_rbmk.js:330-333`** "protection fired before any destruction" checks only
    `tripTime != null` — no ordering against destruction time.
15. **`ops_pwr.js:288-289`** SGTR "HPI established once pressure allowed":
    `flow > 0 || pressure > 12` is satisfied with HPI completely dead while heaters hold pressure —
    the precise P1 failure mode.
16. **`ops_bwr.js:167-168`** "RCIC or HPCI started automatically" has a third disjunct
    (`level min > 45`) satisfiable with both systems broken; reads end-state flags, not "ever ran".
17. **C5's scenario cannot fail**: `epsBypassYankTest` (`ops_rbmk.js:337-354`) has no hard
    subject-matter check at all.

### Automation / e2e
18. **`run_e2e_controls.js:128`** "CVCS auto holds inventory vs leak" now passes **with the
    automation disabled** (post-rescale, 40 s of unmitigated leak loses 4.8 % < the 5 % allowance).
    Together with the stale check in §1, the suite's only two CVCS-AUTO checks are one stale-fail
    and one tautology.
19. **`run_autoctl.js:335-340`** placeholder: both branches `ck(..., true, ...)`, and
    `RD.SCENARIOS` is never loaded so it always skips. Permanently green.
20. **`run_autoctl.js:124-137`** "all-auto holds hot full power": probe with *all channels
    disengaged* passes 3 of 5 band checks (no scram, power, pressure all hold on a bare plant) —
    only `feed_sg` is genuinely proven by the steady test. (The perturbation and HR1 tests do have
    real teeth.)

### Campaign (`test/run_campaign.js`)
21. **"Fog of War" never asserts the deception** (`:1183-1199`): endpoint title + fuel state +
    chat length, but the lesson's core — PZR level indicating high while inventory falls, PORV
    indicator lying — has no assertion (the exam suite `pwr_qualify` at `:719` is stronger than the
    story on the same physics). "Gate blocks in character" (`:1201-1209`) asserts the block code,
    never the in-character chat voicing (`instructor_layer.js:622-628`).
22. **Mode 5↔1 missions never assert `rps_state.scrammed === false`** (`:905,877-941`): if
    `set_trip_block` became a no-op, a spuriously-scrammed plant still cools/heats to the success
    card. The bypass — and its safety-critical **auto-reinstate** on repressurization
    (`control_kernel.js:322-329`) — has no assertion in any suite.

## 3. Live product bugs surfaced by the review

- **Four missions show no message on a gated click:** `pwr_chain_reaction.js:41`, `pwr_boron.js:40`,
  `rbmk_void.js:31`, `bwr_recirc.js:31` author `gate.message` as a plain string;
  `instructor_layer.js:618-621` does `msg[register] || msg.learning` → `undefined`. Player gets a
  block with no explanation.
- **BWR `msiv_closure` failure is byte-identical to `turbine_trip`** in engine effect
  (`bwr_engine.js:460-463`) — no steam-isolation pressurization distinct from a trip.
- `run_e2e_controls.js` stale comment block (`:136-139`) documents removed physics; and
  `BUILD_DECISIONS.md:585` misattributes the current 27/28.

## 4. Coverage gaps, ranked

1. **BWR protection & safety systems (highest risk).** Zero trip assertions (§2.4) — a trip-table
   regression is invisible; the C1 `[0,120]` meter bug is live with no fail-able test in any suite
   (engine, ops, or otherwise). Also untested: **SLC/ATWS entirely** (`initiate_slc`,
   `failure_to_scram`, `scram_blocked`), **HPCI never runs in any test**, LPCS, manual SRV
   depressurization, `loss_of_feedwater` failure, xenon (never read), the shrink-and-swell
   indicated-level deception (`bwr_instruments.js:76-78` — the signature BWR instrument lie).
2. **P-14 feedwater isolation: zero coverage repo-wide.** `isolate_feedwater` /
   `feedwater_isolated` / AFW pass-through (`pwr_engine.js:697`, `pwr_steam_generator.js:33`,
   `pwr_control.js:89`) and the `sg_overfeed` failure are asserted nowhere. A recently shipped
   protection (1cc66ec) is unproven.
3. **PWR engine gate is blind to break physics.** No §14 test injects `sgtr` or `large_loca`, so
   `leak_scale`, blowdown flash-cooling (`blowdown_gain`/`blowdown_sink_c`), subcooled-only
   `K_leak_depressurize` gating, and the latest sat-hold fix (`6b17e5f`) are arbitrated only by
   soft ops probes. The **accumulator 4.14 MPa arming boundary is pinned nowhere** (unit tests
   craft 0.8 MPa states that pass identically at the stale 1.5 MPa) — the entire rationale for
   restoring it is untested. Steam-dump 50 % cap: deleting it fails nothing.
4. **C2 (protection latency × acceleration) has no acceptance test anywhere** — the 256×
   steam-explosion/melt outcomes live inside PASSing scenarios as info lines (`ops_rbmk.js:391`,
   `ops_bwr.js:394`), contradicting the report's "acceptance already written" claim. run_m4
   structurally cannot exhibit it (§2.12).
5. **Campaign beat-reference validation holes** (matches the known authoring gotchas): branch
   `goto` targets (dangling → permanent softlock), instrument/alarm/action names (typo → beat never
   fires), `direction` vocabulary, per-type required fields, `gate.until` triggers,
   `gate.message` shape (§3 bug), `advance` vocabulary (~150 × `'wait_for_trigger'` is an
   unrecognized token today). All cheap static checks over `RD.SCENARIOS`.
6. **M4 kernel internals**: actuation `reset_below` direction (a comment records the shipped
   PORV-flapping inversion — nothing pins the fix), `override_value` interception + severity fold
   (five PWR failures use it; the intercepted-command path is never observed), interception
   precedence, `acknowledge_all_alarms`, cold-init trip blocks, `_loadAutomation` trip-block
   re-derivation for old saves.
7. **M5/M6 recent features**: `_rewindCursor` repeated-press walk-back (playtest-motivated, zero
   tests), user-issued world rewind + `exact`, `save_state`/`load_state` *command* paths; chat
   log/story clock/time_skip/interaction grants/`CHAT_LOG_CAP` (no unit coverage; campaign covers a
   thin slice), follow-mode save/restore branch (`instructor_layer.js:760-779`) completely
   untested.
8. **Campaign outcome coverage**: 3 of 5 TMI-2 Part 3 endings untested (`p3_end_plugged/late/bleed`
   — compound physics-coupled triggers, the most drift-prone part), Part 2 minimally asserted,
   converge/`jump()` idiom never driven, `pwr_sg_flood` (bonus) skipped by structural beat checks.
9. **Missing ops evolutions**: PWR station blackout, ATWS, steam-line break, instrument-failure
   scenarios (any plant), AFW-failure feed-and-bleed, single-RCP trip, shutdown-regime boron
   dilution; no ops scenario exercises Mode 5/cold start, the RHR 2.76 MPa interlock
   (`ops_cooldown_to_rhr` stops at <10 MPa and never issues `set_rhr` — check is info-only),
   accumulators under M4 (no large-LOCA ops scenario).
10. **Autoctl channels with no discriminating assertion**: PWR `cvcs_makeup`, `boron_trim`,
    `steam_dump`, `grid_follow`; BWR `turbine_pressure` (per B2 the most fragile variable — could
    be a no-op and stay 20/20), `rods_trim`; RBMK `grid_follow`, `steam_dump`.
11. **PWR engine misc**: AFW model never asserted (incl. the TMI-2 `afw_blocked` device), PORV
    block valve (the canonical TMI recovery) untested, `porv_tailpipe_temp` (the TMI tell)
    unasserted, xenon unasserted, pressurizer code safeties never popped, save-migration covers
    only ~half the migrated fields (`pwr_engine.js:1139-1156`), unknown-command error path.

## 5. Process findings

- **No aggregate gate.** No package.json / CI; the "gate" is a manual README checklist that omits
  `run_e2e_controls`, `run_procedures`, and the `verify_*` harnesses. This is precisely how
  `run_e2e_controls` drifted 28/28 → 27/28 with the failing check's identity changing under the
  documented known-fail. Recommend a `test/run_all.js` (or npm script) with per-suite
  expected-fail annotations (B3), run before every commit that touches engines/layers.
- `OPS_TUNING_REPORT.md` got a status header in `ff0465d`, but its body findings are the 2026-07-06
  snapshot: C1's PWR evidence (529 % startup yank) no longer reproduces (SR trip masks it — current
  evidence is the 198 %-no-trip info line), P5's numbers are stale, and the priority table's
  acceptance column for C1-PWR points at a dead test. Re-point before fixing C1 or the fix has no
  red test to turn green on the PWR side.
- `audit_manual_controls.js` writes its report to a stale hardcoded scratch path from an old goal
  harness. `verify_e2e_ui.js` / `verify_manual_follow.js` are live (Playwright present), manual-run
  only.
- The m7 gate's `caught = bad.failed > 0` would also be satisfied by an unrelated flake; only the
  trip half of HR1 has a teeth demonstration.

## 6. Recommended fix order (highest leverage first)

1. **BWR trip test + the `[0,200]` meter fix** (mirrors RBMK's own fix) — closes C1-BWR with a test
   that fails today; add a PWR at-power excursion assertion to `abuse_accel_latency` (or a new
   scenario) so C1-PWR has a red test again; then widen `pwr_config.js:366`.
2. **Fix the broken checks that guard shipped behavior**: `eccs_boration` failure id (§2.1),
   `run_m6.js` tautologies + consume-order check (§2.10), `run_e2e_controls` CVCS pair (§1, §2.18),
   `run_procedures` xfail(B3).
3. **P-14 / `isolate_feedwater` coverage** (engine guard + one ops overfeed or steam-line-break
   scenario) and a not-scrammed assertion + auto-reinstate test for the Mode 5↔1 trip bypass.
4. **Pin the accumulator 4.14 MPa boundary and break-size discrimination** in the §14 gate (small
   break holds > 4.14, large break arms + dumps).
5. **Campaign static "references resolve" pass** (§4.5) + the four `gate.message` authoring fixes +
   the three missing p3 endings.
6. **BWR SLC/ATWS + HPCI tests**; RBMK positive-control trip test (fixes §2.7 and covers the
   post-1986 void/power trips in one stroke).
7. A C2 acceptance test (trip latency at 256× with a hard bound), left red as a tuning target like
   the others.
