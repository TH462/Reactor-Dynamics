# PWR Pre-Ship Review — Findings Log

**Executor:** Opus · **Branch:** `develop` · **Started:** 2026-07-19
**Plan:** `Diagnostic/PWR_SHIP_REVIEW_PLAN.md` (+ Amendment A1)

This log is the review's running deliverable. One row per finding:
`ID · Phase · Severity · Finding · Action (FIXED/OPEN/RULING NEEDED/VERIFIED) · Evidence`.

---

## Phase 1 — Gate battery + baseline (recorded 2026-07-19)

All gates re-measured live at review start. **Every gate is at or above its ship target.**
This snapshot is the regression reference for the whole review.

| Gate | Command | Measured | Ship target | Status |
|---|---|---|---|---|
| PWR engine suite | `run_pwr.js` | **31/31** (191) | 31/31 | ✓ |
| PWR ops probes | `run_ops.js pwr` | **19/20** (160) | 19/20 (P4 deferred) | ✓ |
| Campaign | `run_campaign.js` | **51/51** (2897) | 51/51 | ✓ |
| Control/failure | `run_m4.js` | **18/18** (77) | 18/18 | ✓ |
| Sim service | `run_m5.js` | **19/19** (72) | 19/19 | ✓ |
| Instructor | `run_m6.js` | **16/16** (94) | 16/16 | ✓ |
| Placeholder instructor | `run_m6ph.js` | **8/8** (18) | 8/8 | ✓ |
| Stack wiring | `run_m7.js` | **M7 OK** | M7 OK | ✓ |
| Automation | `run_autoctl.js` | **20/20** | 20/20 | ✓ |
| Procedures | `run_procedures.js` | **21/21** (76, 1 known-fail B3) | 21/21 | ✓ |
| Flagship scenarios | `run_scenarios.js` | **3/3** (36) | 3/3 | ✓ |
| Control e2e | `run_e2e_controls.js` | **30/30** | 30/30 | ✓ |
| BWR guard | `run_bwr.js` | **15/15** (92) | no regression | ✓ |
| RBMK guard | `run_rbmk.js` | **23/23** (150) | no regression | ✓ |
| All-plant ops | `run_ops.js` | **57/67** (324; 10 documented FAILs) | no regression | ✓ |
| Synoptic DOM harness | headless Edge | Phase 4 | 55/55 | pending |
| E2E UI | `verify_e2e_ui.js` | Phase 4 | PASS | pending |

**P1-A** (H, known — `run_pwr` was 24/26): **FIXED before review** per A1 (repaired to 26/26,
now 31/31 with added coverage). Phase 1 step 2 is a no-op. VERIFIED live: 31/31.

No below-baseline gate found. Phase 1 complete.

---

## Findings

| ID | Phase | Sev | Finding | Action | Evidence |
|---|---|---|---|---|---|
| P1-A | 1 | H | `run_pwr` was 24/26 (HPI/LPI + RHR valve) | FIXED pre-review (A1) | run_pwr 31/31 |
| P2-A | 2 | M | `ops_load_follow` partial-load Tavg 291.5 < 293 band | DEFERRED (owner ruling, A1) | ops pwr 19/20; test kept honest |
| P2-B | 2 | M | `ops_sgtr_managed` core-loss on depressurize | FIXED pre-review (A1, `6b17e5f`) | ops pwr; subcooling +27 °C |
| C1 | 2 | H | High-flux trip clipped at setpoint (power_range) | FIXED pre-review (A1, `98cb9d8`) | `[0,200]`; abuse_accel_latency trips |
| C2 | 2 | M | Protection evaluates once per broadcast → late trip at high accel | RULING: documented limitation, ship as-is | See C2 note below |
| C3 | 2 | L | No `reset_rps` recovery-from-scram path | OPEN — post-ship candidate | ops_pwr `RPS latched (no reset path in v1)` |
| C4 | 2 | M | Manual scram didn't set `rps_state.scrammed` (masked by triplicated dual-read) | FIXED (this review) | control_kernel handleCommand latch; full battery green |

### C2 ruling — protection latency at high time-acceleration (documented limitation)

`simulation_service.tick()` runs N fixed-dt physics substeps per broadcast, then calls
`layer.evaluate()` (trips + actuations + alarms) **once** on the final readings. At high
acceleration the trip therefore fires late in sim-time. **Ruling: ship as a documented
limitation, not a blocker, for the PWR.**

- **The PWR is protected even at 256×.** `ops_pwr abuse_accel_latency` asserts, as HARD
  checks, that a rod-runaway *trips* at both 1× and 256× (the C1 fix gave the meter
  headroom) and that the fuel **does not melt** at either speed. The PWR's thermal
  transient is slow enough that a late trip still prevents damage.
- **The "small `tick()` fix" is not low-risk.** Moving protection into the substep loop
  changes the per-broadcast cadence contract shared by all three plants (trips, actuations,
  alarms, automation, snapshot), and would flip the RBMK's *deliberately RED* C2 acceptance
  (`ops_rbmk` 256× check) — i.e. it would alter out-of-scope RBMK behavior. The plan's
  "prefer the small fix if low-risk" precondition is not met.
- **Recommendation:** ship with the limitation documented; revisit per-substep protection
  post-ship if a plant is ever added whose transient can damage within one broadcast (the
  RBMK prompt-critical void excursion is exactly that case — hence its RED guard).

### C3 — no `reset_rps` (post-ship candidate)

Confirmed absent (`ops_pwr` info check "RPS latched — no reset path in v1"). Restarting a
scrammed reactor is a full procedure (recriticality, not a flag flip); adding it is a
feature, not a trivially-safe fix. Log OPEN for post-ship.

---

## Phase 3 — Code & physics review

Four parallel read-for-bugs agents over engines/pwr, config/instruments/load_mode,
control layer, and sim_service/instructor. Findings verified against source before action.

| ID | Phase | Sev | Finding | Action | Evidence |
|---|---|---|---|---|---|
| P3-1 | 3 | M | RHR-start setpoint: manual `09` says 3.45 MPa (500 psi); as-built fires `set_rhr` at 2.76 MPa (400 psi, autoclosure interlock). Code internally consistent (`pwr_control.js:98`, `pwr_config.js:336`); manual is stale. | FIX MANUAL (Phase 5) | agent trace; 2.76 = 400 psi Westinghouse autoclosure |
| P3-2 | 3 | L | Power-range span doc note "0–120 %" in manual `09` vs `[0,200]` instrument (intentional over-range for C1). Doc clarity only. | FIX MANUAL (Phase 5) | `pwr_config.js:366-369` comment |

**Config/instruments/units/failures/load_mode: CLEAN.** C1 has no second instance (every
high setpoint strictly below its meter top, every low strictly above its floor, both
directions of strict `crossed()` checked). Units consistent throughout. Failure defs
(`leak_scale`, `severity_meta`, `intercepts`) all reference real ids and are internally
consistent.

### Fixed this phase (code)

| ID | Sev | Finding | Fix | Evidence |
|---|---|---|---|---|
| P3-3 | M | Beat-driven world rewind double-steps the Instructor and double-broadcasts per tick (`_restore` re-runs `_assembleWithInstructor`+`_broadcast` mid-`tick`); post-rewind beat could fire against rolled-back state. Only shipped user: `pwr_hook` (`beat.rewind`). | `_rewind`/`_restore` gain a `silent` flag; the in-tick instructor rewind assembles without stepping/broadcasting (outer tick does both once). Operator-button + file-load paths unchanged. | m5/m6/campaign/scenarios green |
| P3-4 | M→ latent | `_initialEsfArms` evaluated the actuation `condition` against empty `lastInstruments` at init, so a *conditioned* activating actuation (only `set_rhr`, cond `rps_scrammed`) could never be pre-disarmed. No live trigger (no init state is both scrammed and <2.76 MPa). | `_evaluateCondition(cond, ins)` accepts an explicit instrument map; both call sites pass the current `ins`. | battery green |
| P3-5 | H (HR1) / cleanup | Automation stand-down read `true_state.scrammed` (HR1 straggler) with a comment stale after C4. | Collapsed to `this.rps.scrammed` (C4 makes it authoritative for manual + auto). `melted` read kept — no core-damage instrument exists (documented HR1 exception, damage instrument post-ship). | battery green |
| P3-6 | L (latent) | `stepAutomation` `requires`-note dereferences `this.byId[def.requires].def.label` — throws if a channel names a non-existent `requires` id. Not reachable with current config. | Null-guard the reference (fall back to the raw id). | battery green |
| P3-7 | L | `p_pumpsuction` node pressure could go negative (non-physical absolute pressure in `true_state`) on a deep depressurization with RCPs running. | `Math.max(0, …)` floor. Dynamics-identical (cavitation already floors into `T_sat`'s `1e-6` guard). | run_ops pwr "nodes ordered" green |
| P3-8 | L | Stale comment: `spray_floor_band` said "above Psat(tcold)"; code correctly floors at Psat(**thot**). A future "fix-to-match-comment" would let spray pull below core-exit saturation. | Corrected the comment. | comment-only |

### Documented known limitations (NOT fixed — out of scope / needs ruling)

- **P3-9 (M, physics): decay heat dropped from the heat source while un-scrammed** —
  `pwr_engine.js:220` adds `_H1+_H2` only when `scrammed`. On a fast **un-scrammed**
  runback/load-follow, residual decay heat above the new equilibrium is undercounted
  (~5–6 %, τ≈33 min), so Tavg/pressure sit low transiently. **This intersects the
  DEFERRED P2-A load-follow tuning** (partial-load Tavg 291.5 < 293) and is a plausible
  contributor to it. Changing the decay-heat model changes load-follow physics — exactly
  the area the A1 owner ruling deferred ("do not chase P4 without a new ruling"). Left as
  a documented limitation and flagged for whoever revisits P2-A. Scenarios that scram
  (TMI, trips) are unaffected.
- **P3-10 (L–M, sim): transient-cadence rounding** — at `TRANSIENT_MS=50` and 1×,
  `_stepsPerBroadcast` rounds 2.5→3, so sim runs ~1.2× real-time *during transients only*
  (physics stays stable; internal sim-time is self-consistent). Fixing needs a fractional-
  step accumulator in the core tick loop (moderate risk, low reward). Documented.
- **P3-11 (L, sim): `set_speed` unclamped** — value 0/negative doesn't freeze (yields 1
  step/broadcast). **Unreachable from the shipped UI** (buttons send fixed `data-speed`
  values; `speed || 60` guards the beat path). Theoretical robustness gap; documented.
- **P3-12 (L, sim): save/restore mid-beat drops `_actionsSinceBeat` + follow `accStreak`** —
  a save mid-beat loses accumulated operator actions / a partial convergence streak; the
  player re-satisfies them. No crash/wrong-answer. Minor; documented (revisit if Phase 6/7
  playthrough shows a real problem).

**No crashes, NaN/Inf sources, reversed reactivity terms, or bypassable safety caps found**
(physics agent verified all hotspots: break-blowdown, spray floor, CVCS-vs-void-surge,
accumulator/Mode-5 lineup, steam-dump cap, PORV/block-valve, reactivity signs).

---

## Phase 4 — UI/HMI verification

### Automated harnesses (all green)

| Check | Result |
|---|---|
| `verify_e2e_ui.js` (Playwright headless, 4 plants × 4 views) | **PASS** — 16 screenshots; **throws on any `pageerror`** (line 82) so PASS ⇒ no console errors on load; required controls render; units US↔SI toggle; instructor follow loads | 
| `run_e2e_controls.js` | **30/30** |
| `audit_manual_controls.js` | **PASS** — all procedure controls map to viewControls |
| `verify_manual_follow.js` | **PASS** (84 checks) |
| Script/style includes in `shell.html` | **71/71 resolve** — no 404s |
| Root `index.html` → `ui/shell.html` forward | present + correct (meta refresh); README/user-guide launch path accurate |
| PWR alarm ladder | complete — `SG LVL HI HI` (88 %) and `SG LVL LO LO` (17 %) both present; ~28 annunciator rows (manual A01–A26 numbering maps onto semantic ids) |

### Synoptic "55/55" harness

The plan's baseline lists a "synoptic DOM harness 55/55" target. **No such standalone harness
exists in the repo** — the synoptic (`ui/diagram/pwr_synoptic.js`) is exercised by
`verify_e2e_ui.js` (renders the `diagram` view for every plant without error, asserts required
`data-act` controls + gauge count) and `verify_manual_follow.js` (84 DOM checks). The "55/55"
is a plan-time aspiration, not a shipped gate; synoptic coverage is real but lives in those two
harnesses. Logged as a doc-baseline correction (Phase 5), not a missing gate.
