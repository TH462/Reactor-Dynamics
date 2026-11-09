---
name: gate-layers
description: Which LAYER each test runner stops at (engine-direct, engine+M4, full stack, browser, static) and why that decides what a probe can assert; how to take an ad-hoc plant number with measure_stack.js; what run_all and the CI shard matrix actually cost. Use before writing a procedure, scenario or behaviour assertion, when a gate is green but the plant is wrong under the full stack, when asked to "take a number" or "measure" an evolution, or when reading run_all / CI timings.
---

# Know which LAYER a gate runs at

Moved out of `CLAUDE.md` 2026-10-18 (it was loaded every turn and needed only when a probe is
being written or a number taken). The one-line rule stays there: *know which layer owns the
effect you are asserting.*

## The trap (it has bitten three times)

A runner that holds a `ControlFailureLayer` still is **not** full-stack.
`ControlLayer.stepAutomation()` and `engageDefaults()` have **exactly one production caller
each — both in `layers/simulation_service.js`** (:176, :152), as does `engine.getStartupLineup()`
(:156-159). Anything that stops below M5 runs with the automation-channel runtime never ticking,
no channel ever engaged, and without the free-play lineup. Since `feed_sg` (the three-element
feed controller that replaces coupled feed as the level backbone), `cvcs_makeup` and
`boron_conc` are all `defaultOn`, such a harness is testing a plant the player never gets.

| layer | runners |
|---|---|
| **engine-direct** | `run_pwr`, `run_rbmk`, `run_bwr`, `run_meltdown`, `run_procedures` |
| **engine + M4** (looks full-stack, isn't) | `run_ops`, `run_behavior`, `run_m4` |
| **shell A/B** (two engines, one command apart) | `run_pwr2_roundtrip` — does a command move anything the player can read back? The control leg IS the test (#570) |
| **full stack** (M4+M5+M6) | `run_procedures_stack`, `run_procedures_chain` (one CONTINUOUS plant across procedures — the seam the per-procedure IC reload cannot see), `run_m5`, `run_m6`/`run_m6ph`, `run_m7`, `run_autoctl`, `run_campaign`, `run_checklist`, `run_scenarios`, `run_e2e_controls` |
| **browser** | `verify_e2e_ui`, `verify_manual_follow` (never plays the sim — control-surface reachability only) |
| **static** (source/doc/registry consistency; the plant is never stepped) | `run_hr3`, `run_hardrules`, `run_contract` (resets the engine to read its field list), `run_inspect`, `run_flags`, `run_manual_commands` (#570) |

Engine-direct is right for isolated-physics acceptance; the mistake is *relying* on it for
anything the control layer decides. Known open consequences: **#209** (`run_behavior`/`run_ops`
certify on a lineup that never ships), **#206**/**#208** (procedures green engine-direct, broken
under the stack).

**Manual first, then auto** (owner, 2026-08-12 — `Blueprint/RULINGS.md`): a behaviour row that
can only be demonstrated with the automation engaged is testing the automation, not the plant.
Write the manual-mode acceptance first; the auto-mode row then asserts the controller *holds*
what manual proved.

## Taking a number

```
node test/measure_stack.js --for=12h --every=1h --watch=tavg_c,pressure_mpa
node test/measure_stack.js --plant=pwr2 --settle ...     # PWR2 since 2026-09-18 (#665)
```

Full stack, any IC/duration/scheduled commands, US-first units, and it stamps the LAYER into its
own output so a wrong-layer figure is visible in the artifact (#266). **Never drive a
measurement with `svc.start()`**: it arms `setTimeout(broadcastMs)` and advances in WALL time —
measured, 5.0 s of wall bought 48.0 s of sim at 10×, which is why #266 published two
engine-direct numbers (one 13× wrong). Driving `tick()` directly, cost is linear in sim duration.
**Budget a long ride off a measurement**: 12 plant-hours is ~35 s on the retired engine quiet,
but **~100 s per plant-hour on a PWR2 endgame** — an uncovered core sub-steps (#802).
`ops_harness` and `perturb_sweep` still refuse pwr2.

Other measuring tools: `node test/run_warp_tier.js` (the two pacing tiers, #625: WARP's fidelity
band, the cliff at 1.0 s, the in-loop lockout, the step budget); `node tools/perturb_sweep.js`
(which checks flip when a `[tune]` constant moves 2–3 %; `--suite=`, `--nudge=`, `--self-test`).

## What `run_all` and CI cost

- `run_all` is 10-way parallel locally; the wall is the longest runner (`run_pwr2_engine_c`,
  ~14 min). `--fast` skips the 3 gates marked `slow` (same wall). `--jobs=1` is sequential
  (~35 min), the escape hatch if a runner is suspected of not being isolated. `--only a,b`,
  `--record` (print observed results as a BASELINES block), `--shard=i/5 --list` (what a CI
  shard runs — derived, never a hand list).
- Per-runner times in a parallel run are **contention times, not costs** (`run_pwr` reads 54 s
  where it takes 22 s alone). The `secs:` hints only nudge scheduling — never maintain them.
- **CI is a 5-way matrix of `run_all --shard=i/5`** (4 → 5 on 2026-10-15: run 38700124714 shard 1
  hit 30.4 min of 30; times vary ~2×); the fan-in job is named exactly `aggregate-gate` because
  `main`'s ruleset requires that context (`run_ci_shards.js` gates the shape, #637). On CI the
  wall is total CPU ÷ lanes (4 cores → 3 lanes; 5189 s / 3 = 28.8 min vs 29.1 observed), so a
  runner split moves nothing there. Unsharded baseline 29.1 / 38.4 / 40.2 min. It ran red for
  **32 consecutive runs** through one release, and 1.7.2 merged behind a timeout with none of 34
  finished runners red; 4 of 6 pushes timed out unread from 2026-09-26 on. **Watch every push's
  run to the end** (owner, 2026-09-29): `gh run list --workflow=gates.yml --limit 3`, then poll
  `gh run view <id>` with retries — `gh run watch` dies on one blip.
- `run_pwr2_engine.js` is FOUR parts (#637): bare = A, `_b`, `_c`, `_d` (group J, the tail);
  `--all` = unsplit; `--no-mutations` skips the replay while fixing a check (115 s → 2.9 s, #602);
  `--mut=` / `--grp=`. FILTERED = forced non-zero, never a baseline.
- `run_campaign` is split A / `_b` / `_c` (#513 — A: structural + most PWR missions, B: RBMK +
  BWR, C: the three heavy PWR missions); together they must stay 51/51.
- Drift is symmetric: a runner scoring better than baseline also fails; acknowledge it (update
  `BASELINES`, close the issue). Tracked reds carry their own `note` in `BASELINES`; do not
  re-band one — a red kept on purpose is reporting against a target.
- `verify_board_check.js` exists because `board_check.html` sat at 1 FAILURE through a merge, a
  green CI run and a release: a gate that is not a `run_*.js`/`verify_*.js` is invisible to
  `run_all`.
