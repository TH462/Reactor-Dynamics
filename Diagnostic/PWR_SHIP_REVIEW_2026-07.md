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
