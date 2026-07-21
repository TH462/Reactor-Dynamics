# Tuning-pass Item 1 (Tavg program) — PAUSED, uncommitted handoff

**Status: RESOLVED 2026-07-20 — the re-plan landed as `Blueprint/PWR_FEEL_TUNING_PLAN.md`
(v1.0, approved) and this work was COMMITTED as Phase 0** (machinery kept, the 292→306
anchors are placeholders until Phase 3 picks this plant's own map). The physics findings
below remain the durable record. Original pause note follows.

**Status: paused 2026-07-20 at owner request. Nothing committed. Direction change:**
treat this plant as its own unique plant and tune for desired behavior/feel, not
catalog numbers borrowed from a generic Westinghouse 4-loop. Fable to re-plan.

All working-tree changes below are **uncommitted** and can be dropped wholesale with
`git checkout -- engines/ layers/ test/behavior_pwr.js test/ops_pwr.js test/run_autoctl.js`
(the two auto-generated `Diagnostic/*.json`/`GAP_REPORT.md` will regenerate on the next
battery run; `Diagnostic/OPS_TUNING_REPORT.md` was already modified before this session).

## What was changed (uncommitted)

Implementing catalog §8.1 (sliding Tavg program 292→~304, linear in load):

1. **`engines/pwr/pwr_config.js`** — `steam_dump_setpoint` 8.90 → **7.67 MPa** (= Psat(292 °C));
   this is now the no-load *anchor* of the program.
2. **`engines/pwr/pwr_engine.js`**
   - `_buildState`: Tavg is now `Tnl + (Tfp−Tnl)·load` (Tnl = Tsat(dump setpoint), Tfp =
     full-power equilibrium), and the secondary pressure is **derived** so each init state
     is a true steady state. Full-power point is unchanged (reference temps intact).
   - `_computeXeq`/`_I_eq` parameterized by power; init iodine/xenon set to the
     **current-power** equilibrium (see SS-6 finding below).
   - HZP scenario (`hot_zero_power_standby`) re-banded 304 → 292 °C.
   - P-14 `feedwater_isolation` scenario re-authored (run 600 s; asserts AFW *recovers*
     the SG — see P-14 finding below).
3. **`layers/control/pwr_control.js`** — `rods_tavg` channel: Tref is now the load program
   (`trefFromLoad`), not a value captured at engage.
4. **`layers/control/control_kernel.js`** — `_trackChannel` gained a `def.program(ctx)`
   hook so a channel setpoint can track plant state each step.
5. **`test/behavior_pwr.js`** — removed SS-2 and SS-6 from XFAIL (both flipped green).
6. **`test/run_autoctl.js`** — re-authored the demand-swing and T-ref tests to expect the
   program (Tavg tracks Tref down with load, instead of a flat captured value).
7. **`test/ops_pwr.js`** — re-banded the manual load-follow Tavg check (see load-follow finding).

## Test status at pause

- **behavior battery: 13 pass / 6 xfail / 0 unexpected** (SS-2 + SS-6 green).
- **run_autoctl: 20/20.  run_m5: 19/19.**
- **run_pwr:** HZP re-banded, P-14 re-authored — needs a confirming re-run.
- **run_ops pwr:** load-follow re-banded; **SGTR EOP still RED** — `subcooling_c` min dipped
  to **−1.4** (was left mid-fix). Not yet addressed.
- **run_campaign: NOT run** this session.

## Physics findings (these are the durable, plant-agnostic takeaways)

These hold regardless of what target numbers a "tune for feel" pass picks:

- **Steady-state Tavg is set by the boron trim at init, pinned via the MTC.** Each init
  state trims boron for ρ=0 at its Tavg; the MTC then holds Tavg there. So the "program"
  is really *which (boron, rod, Tavg) split you pick at each power*. Changing the init Tavg
  anchor + deriving a consistent secondary pressure is sufficient to move the whole map;
  the engine holds it with no drift. **The lever for "feel" is the init anchor + the
  rods_tavg Tref program, not any single physics coefficient.**
- **The old non-monotonic map** (HZP 302.8, 5% 273, 50% 287.6, 100% 304) came from a *flat*
  secondary-pressure anchor: Tavg sagged with load because the dump held the no-load
  pressure high while partial-load steam draw pulled the secondary down inconsistently.
- **SS-6 low-power droop was a xenon-IC artifact, not a control defect.** The 5% state
  initialized with *full-power* iodine/xenon (2125/1565); 5%-equilibrium is ~127/174. The
  iodine decayed into xenon (−18 pcm over 30 min), drooping power 6%→1%. Initializing I/X
  at the current-power equilibrium makes 5% rock-stable (power flat, ρ≈0, xenon 11% of
  full). **This fix is correct regardless of the Tavg direction — worth keeping.**
- **Post-trip SG behavior is very sensitive to the no-load Tavg.** Dropping no-load from
  303→292 means a post-trip primary cools ~10 °C, dumping stored sensible heat into the SG;
  the auto steam dump vents that burst at up to 43% flow and the *narrow* SG gauge pegs low
  (wide range dipped to ~2%) before AFW (0.15 cap) recovers it over ~5 min. This is the
  clearest "feel" tradeoff of a lower no-load Tavg: **deeper/faster post-trip SG shrink.**
  A "tune for feel" pass should decide the no-load Tavg partly on how hard it wants the
  post-trip SG transient to bite (and possibly revisit `K_sg_level` / dump rate, which are
  the real sensitivity, not the Tavg number).
- **Manual rod-only power reduction sags Tavg below the program** (holdPower nudges rods,
  boron fixed → MTC drops Tavg to supply reactivity). Real load-follow must coordinate
  boron (the boron_trim channel). The ops load-follow test drives rod-only, so it lands
  Tavg ~291 at 50% — a genuine consequence of the control method, not a bug.

## Open thread if resumed as-is
- SGTR EOP subcooling dip (−1.4) under the managed cooldown — the hand-tuned dump/spray
  thresholds in the test assume the old Tavg baseline. Items 6 (SI raise) and 7 (SGTR
  rescale) both touch this scenario, so it wanted re-validation there anyway.
