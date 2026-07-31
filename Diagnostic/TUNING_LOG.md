# Tuning & Bug-Fix Log — session continuity record

**What this is.** The running record for the ongoing tuning / bug-squashing effort — the
one file to read at the **start of a session** to know where we are, and to update at the
**end of a session** with what changed and what's still open. It is a *curated index +
worklog + backlog*, not a dump: the dense engineering rationale lives in
`Blueprint/BUILD_DECISIONS.md`, the ops-probe findings in `Diagnostic/OPS_TUNING_REPORT.md`,
and the user-visible summary in `CHANGELOG.md`. This file points at those and tracks the
*state of the effort* across sessions.

**How to use it (read before editing).**
- Newest session entries on top of the **Session log**.
- When you resolve a backlog item, move it to the session log with the fix, and mark the
  backlog row **RESOLVED (date)** — don't delete it (continuity beats tidiness).
- When you *discover* something (a hard fail, an oddity, a suspicion), add a backlog row
  even if you're not fixing it now. A named suspicion is worth more than a lost one.
- Keep the gate snapshot below current — it is the at-a-glance "are we green?".
- Every claim gets a pointer (`file:symbol`, a probe name, or a doc section) so the next
  session can verify, not just trust.

---

## Current status (2026-07-27b)

**PWR is the focus plant and is in good shape** — all PWR engine, behavior, and ops gates
green. The open backlog is dominated by **RBMK and BWR operability tuning** (documented,
each with a red acceptance test waiting) plus a small number of **pre-existing UI-harness
staleness** items.

**Gate snapshot** (baselines the effort must hold — see README _Definition of done_):

| Gate | State | Notes |
|---|---|---|
| **`run_all`** | **OK (30 runners)** | **THE aggregate gate — `node test/run_all.js`; baselines are data in its `BASELINES` map, not prose** |
| `run_hardrules` | **19 checks / 0 failed** | NEW 2026-07-29 — static guards for HR1 (protection reads instruments), HR5 (UI never touches the engine) and HR11 (a ruling needs a date + verbatim words). Declared-exception idiom: a true-state read in `layers/control/` is legal only if listed with the reason no instrument exists. 18 → 14 on 2026-07-29h (#247): **4 of the 5 declared HR1 debts paid**; the 1 left is RBMK (on hold). 14 → 18 on 2026-07-29i (#248) — HR12 added, and its `OWNER RULING` quote appears in four tracked files (including this log). 18 → 19 on 2026-07-29j (#251) — one more HR11 site, the owner's "long term fix" ruling quoted in this log's entry. Worked example of the warning that follows: the CODE change moved nothing here; writing it up did. Note the gate scans Diagnostic/ and Blueprint/, so WRITING UP a change moves this score — re-run it after the docs, not just after the code. HR2, HR6 and half of HR4 remain unguarded; HR10 and HR12 are **not gateable at all**, and §3 says so |
| `run_hr3` | **29 checks / 0 failed** | 32 → 29 on 2026-07-29h (#247) — retiring the `__true_flow__` sentinel removed the kernel's only PWR-only `true_state` reference (half of #228; the `reset_rps` half stands) |
| `run_contract` | **84 checks / 0 failed** | NEW 2026-07-28t (#225) — §6.3 `true_state` contract vs `getTrueState()`, both directions; PWR only (RBMK/BWR `skip`) |
| `run_inspect` | **7/7 (35)** | NEW 2026-07-28s (#96) — inspection copy: orphaned keys, per-item coverage, dead manual citations, duplicate copy |
| `run_portable` | **112 checks / 0 failed** | NEW 2026-07-29k — guards the OFFLINE / single-file build (`tools/make_portable.js`). Asserts nothing in the runtime **loads** anything at runtime (13 patterns over the 94 scripts `ui/shell.html` ships, read from the file so it widens itself), no web font or relative `url()` in the 2 stylesheets, and then **builds the bundle** and asserts the deliverable has no loading attribute left. Injection-verified (fetch / CDN tag / `@font-face` / `<img src>` / ES `export` each go red on the matching check). Check count moves with the shipped asset list — a new `<script src>` shifts the baseline, which is the intended nudge to re-verify the portable build |
| `run_flags` / `verify_flags_ui` | **16/16 (290)** / **48/48** | NEW 2026-07-28j (#241) — the feature-flag registry (coverage + resolution) and the control room actually obeying it |
| `run_procedures_stack` | **22/22 (155/155)** | NEW 2026-07-26b — procedures through M4+M5+M6. **5** strict xfails, all RBMK/BWR (#208); the 7 `pwr_heatup` xfails cleared 2026-07-26c/d (#206, #210), `bwr_startup` 2026-07-29c (never a BWR defect — see **#245**) |
| `run_meltdown_stack` | **3/3 (21/21)** | NEW 2026-07-26d (#209) — the core-damage casualties driven **hands off** on the shipped lineup; asserts the automatic chain fires unprompted |
| `run_pwr` | **32/32 (201)** | PWR engine-direct (+`load_above_rated_hold`, the #130 pin). 200 → 201 on 2026-07-29h (#247) — `transient_rcp_trip` now also asserts the `rcs_flow` channel follows truth below the setpoint, and reads the setpoint from the trip table instead of restating it |
| `run_rbmk` | **23/23** | |
| `run_bwr` | **15/15** | |
| `run_behavior` | **35 / 0 xfail / 0 fail** | PWR behavior catalog — coverage-todo list **empty** (#131); +TR-12b MSIV break isolation (#199) |
| `run_ops` | **57/68** | 2026-07-26d: harness rewired to the SHIPPED lineup (#209), so two PWR probes that silently assumed load-follow now command it; 11 open = RBMK/BWR + 1 deliberate red (see backlog) |
| `run_m4`..`run_m7` | **25** / **19** / **17** / OK | stack layers — all green. m6 16 → 17 on 2026-07-27b (#142), a save/restore test for the instructor's operator-action memory. m5's rewind red RESOLVED 2026-07-25 (#151): `lastInstruments` was not rebuilt on restore, so every blockable trip reported `asserted=false` |
| `run_autoctl` | **20/20** | |
| `run_scenarios` | **3/3** | flagships |
| `run_campaign` | **51/51** (3025) | 2930 → 3024 on 2026-07-27b (#189) — the static passes now walk `RD.SCENARIOS` directly, so unwired and bonus-only scenarios are validated too. 3024 → 3025 on 2026-07-29i (#248) — `pwr_lof` now asserts the trip REASON, not just that something scrammed |
| `run_procedures` | **22/22 (101/101)** | engine-direct — see the layer table in CLAUDE.md before trusting it for anything M4 decides |
| `run_meltdown` | **9/9** | PWR core-damage paths — all resolved; +MD-9 partial-uncovery hold 2026-07-28e (#213, exposed-clad hot node); MD-6 fixed 2026-07-24 (time-dependent dryout depletion, §3.4) |
| `run_checklist` | **24/24** | |
| `run_e2e_controls` | **35/35** | F12 RESOLVED 2026-07-25 (#150) — both reds were stale expectations, not regressions |
| `verify_e2e_ui` | **PASS (16 screenshots)** | fixed 2026-07-25 (#148); carries 1 strict xfail for the manual-units gap (#111) |
| `verify_manual_follow` | **PASS (84 checks)** | fixed 2026-07-25 (#149) — probed the retired `RD.PwrSynoptic`, which never mounts |

---

## Part 1 — The tuning toolbox

### 1.1 Where the knobs are

| Knob class | Location | Convention |
|---|---|---|
| **Physics constants** | `engines/<plant>/<plant>_config.js` | Values marked `[tune]` are starting points arbitrated by the scenario suite; un-marked values are fixed. Counts: **PWR 89, RBMK 27, BWR 37**. The file header explains the convention. |
| **Protection / alarm / failure setpoints** | `layers/control/<plant>_control.js` | Trips, ESF actuations, interlocks, alarm bands, and the failure catalog (`severity_meta`, `leak_scale`, etc.) are all **data** (HR3). This is where "when does SI fire", "what's the trip setpoint", "how big is a full-severity SGTR" live. |
| **Instrument lag / noise / range** | `<plant>_config.js` `instruments:` block | Every gauge has `{lag, noise, range}`. Range clipping matters (see C1: a meter pegged at its trip setpoint can never *cross* it). |
| **Automation channel gains** | `layers/control/<plant>_control.js` channel defs | PID/bang/mode channel tuning (rod control, feed, boron, spray). Validated by `run_autoctl`. |

### 1.2 What validates what

- **`run_<plant>.js`** — engine-direct physics, **no protection layer**. Proves the raw
  hydraulics/neutronics. Fast, deterministic.
- **`run_behavior.js`** (PWR) — the **behavior catalog** battery: named invariants
  (CVCS level control, TMI deception boundary, going-solid backstop, SGTR ladder…). Strict
  xfail convention; auto-writes `Diagnostic/BEHAVIOR_GAP_REPORT.md`.
- **`run_ops.js [pwr|rbmk|bwr] [name]`** — engines **UNDER the real M4 control layer**:
  commands descend through interlocks, protection evaluates at the M5 broadcast cadence
  (and scales with time acceleration). `ops_*` = manual-driven evolutions; `abuse_*` = how
  a player actually treats it. **A FAIL is a tuning target with its acceptance test already
  written.** Results JSON at `Diagnostic/ops_results.json`.
- **`run_scenarios` / `run_campaign` / `run_procedures` / `run_checklist`** — instructor
  content: flagships, the 51-mission campaign gate, manual-procedure replay, auto-checklists.
- **`run_e2e_controls` / `verify_e2e_ui` / `verify_manual_follow`** — service-level control
  plumbing and UI wiring.

**Golden rule:** a config change ⇒ re-run the affected `run_<plant>` **and** `run_ops`
(don't turn a PASS into a FAIL — the remaining FAILs are pre-existing targets). A
config/setpoint change also triggers the **manual maintenance rule**:
`node tools/gen_manual_reference.js` + `node tools/pack_manuals.js` + `run_procedures`.

### 1.3 Model facts & gotchas that bite during tuning

- **Two flow scales (learned the hard way — P7).** Accident flows (leak / LOCA / ECCS /
  relief) act on the lumped primary inventory 1:1. CVCS charging/letdown are *normalized to
  the gauge scale* (orifice A `0.030` ≡ 20 gpm) and enter the mass balance through
  **`cvcs_inventory_gain` (0.012)** so tens-of-gpm flows don't read as %/s of the whole
  RCS. Don't cross the scales: rescaling one without the other silently breaks the other's
  calibration.
- **Pressurizer level is DERIVED, not integrated** (`pwr_pressurizer.stepLevel`):
  `level = base(Tavg) + level_per_mass·(mass−1) + level_per_void·void`. Level and inventory
  can't drift apart. `level_per_mass = 100` maps level↔mass ~1:1.
- **HR1 — instruments vs truth.** Automation and the level servo read the *indicated*
  (lagged/noisy/failable) value, not truth. A stiffer servo amplifies gauge noise; damp the
  error, don't just raise the gain (see the P7 `cvcs_level_filter_tau` fix).
- ~~**Protection cadence scales with acceleration** (C2). M5 evaluates M4 once per broadcast,
  so at 256× the RPS checks the plant every ~13 sim-seconds — slow to catch fast excursions.~~
  **RESOLVED 2026-07-31f (#153)** — protection is on a sim-time cadence (`PROTECTION_DT`
  0.1 s) now, on all three plants. It was worse than "slow": above 600× the trip was never
  evaluated during the excursion at all. See the session entry.
- **Meter range vs trip setpoint** (C1). `crossed()` is strict (`value > setpoint`); a meter
  that clips *at* its trip setpoint can never fire it. PWR/BWR `power_range` widened to
  `[0,200]` for exactly this.

---

## Part 2 — Session log (newest first)

### 2026-07-31f — #153: a UI speed button decided how well the reactor was protected  ✅

*(OWNER, 2026-07-31: "You can fix RBMK too" — lifting the RBMK hold for this fix, which is
why the shared cadence change and `ops_harness.js` cover all three plants.)*

**The defect.** `simulation_service.tick()` ran N fixed-dt physics steps and then called
`layer.evaluate()` — trips, actuations, interlocks, alarms — **once**. So the interval
between two protection evaluations was `timeAcceleration × broadcastMs`: a plant property
set by which speed button the player had pressed.

**Measured, full stack (M4+M5+M6), PWR `50_percent`, `continuous_rod_withdrawal` sev 1.0,
seed 42.** Scram time read at physics rate, peak sampled inside `engine.step` — sampling
once per broadcast at 3600× misses the excursion and makes a runaway look *tamer* the
faster you run it, which is a trap worth naming.

| accel | scram at | trip reason | true peak power | peak fuel |
|---|---|---|---|---|
| 1× | 9.14 s | `power_range high` | 121.6 % | 1012 °F (544 °C) |
| 60× | 9.14 s | `power_range high` | 121.4 % | 1012 °F (544 °C) |
| 256× | **25.60 s** | **`primary_pressure high`** | **136.5 %** | 1194 °F (646 °C) |
| 600× | **60.00 s** | **`primary_pressure high`** | **135.9 %** | 1192 °F (645 °C) |
| 700× / 900× / 3600× | **NO TRIP** | — | **135.9 %** | 1192 °F (644 °C) |

Indicated flux is above its 120 % setpoint for only **8.74 sim seconds**. Once the
evaluation interval exceeds that window the trip cannot be seen at all. Traced at 3600×
(one evaluation every **360 sim s**): true peak 135.9 % at t+12.9 s, indicated peak 136.3 %
at t+13.0 s, first evaluation at t+360.0 s with power already back to 56.7 % and `scrammed`
still `false`. The whole excursion lived inside one broadcast.

**Four things worth carrying forward.**

1. **The issue's premise was never true, not merely stale.** #153 argued the PWR was "safe
   at 256×". The speed selector has offered **600× and 3600× since the first M8 commit**
   (484d5e0) and does not offer 256× at all — so the ruling, the issue body and the
   `abuse_accel_latency` probe were all measuring a speed no player can select, two of them
   *below* two speeds every player can. Check what the UI ships before certifying a range.
2. **`status-deliberate` made this harder to find than no label would have.** It carried no
   dated owner quote, and `Diagnostic/PWR_SHIP_REVIEW_2026-07.md` §C2 had **already struck
   its own ruling** as agent-authored — so the label was advisory under HR11 while reading
   as standing law. It also recorded a cost objection ("the shared-cadence fix is not
   low-risk") that measurement disproves: `layer.evaluate` **7.85 µs** vs `engine.step`
   **18.80 µs**, so a 3600× cycle (18 000 steps, 338 ms of step) pays **+1.4 ms, +0.4 %**.
3. **256× "passing" was the worst outcome, not a near miss.** The probe scored green
   asserting only *tripped* and *not melted*. The plant did trip — on the wrong signal, 16.5 s
   late, after a 136 % excursion, because a slower parameter happened to still be over when
   the evaluation landed. HR10 exactly: the check confirmed the behaviour it observed,
   including the wrong part. **Assert which trip and when, not that something happened.**
4. **The attention-stop dropout could never have covered this.** It is computed in
   `_assembleWithInstructor`, from the snapshot assembled *after* the cycle has run — so it
   is always one broadcast late, which at 3600× is six plant-minutes. It protects the *next*
   transient, never this one.

**The fix.** `PROTECTION_DT = 0.1` sim s, evaluated inside the substep loop, with the final
step left to the existing post-loop call so the snapshot is always assembled from the
evaluation taken on the final readings. **1× is byte-identical**: a 1× broadcast is exactly
`PROTECTION_DT` (5 steps), the accumulator reaches the cap on the last step, and the
`i < steps - 1` guard hands it to the post-loop call. Two risks checked before writing it —
`getInstruments()` is a pure read of `instruments.reading` (the noise PRNG advances inside
`engine.step`, so extra evaluations perturb no stream, cf. the appended-instrument PRNG
rule), and `ControlLayer.evaluate` holds no per-call state, only config loops.

Post-fix, 1× → 3600×: scram **9.14 → 9.32 s**, always `power_range high`, peak power
**121.6 → 121.9 %**, ~10 evaluations per sim second at every speed.

**`test/ops_harness.js` moved with it.** Its `evalEvery` was an independent copy of the M5
cadence (`accel × broadcast / dt`); leaving it would have left the ops suites certifying a
plant no player can produce — the inverse of #209, same class of error.

**Gates.** `run_m5` 19/19 83 → **20/20 90 checks** (new suite; **5 of its 7 checks red by
injection** on the pre-fix service, including *trips at all* and the evaluation rate at
0.003/sim-s against a ≥5 floor — while **both 1× checks stay green**, which is the proof
that 1× is unchanged). `run_ops` 57/68 → **58/68**: the deliberately-red C2 probe went green
**because the defect was fixed**, and all three accel probes (PWR, RBMK *[post]*, BWR) now
report identical trip delay at 1× and 256×. PWR stays 21/21 with zero fails; the 10
remaining reds are 6 RBMK + 4 BWR. `run_campaign` 51/51 (3038 checks) and
`run_procedures_stack` 22/22 (178 checks) unmoved — ten times the evaluations perturbed no
authored content, which was the real risk in this change.

---

### 2026-07-31e — #137: the rewind ring measured the wrong clock, and the picker aimed at the wrong axis  ✅

*(OWNER, 2026-07-31: "I don't think there should be a rewind one step button. Make the user
pick from the checkpoints on the graph. For long fast forwards we need a way to go back far
enough. The rewind cadence should be 20 seconds real time not sim time.")*

**The issue's analysis was right about the cadence and stale about the picker.** It said the
`exact` rewind path "has never had a player-facing way in" — the picker was built 2026-07-23
(`2e86c00`), two days before the issue was filed, and free play has used it ever since. Three
separate defects were live, and the issue named one of them.

**1. The cadence unit (the one the issue named).** `SANDBOX_CP_SPACING_S = 15` *sim* seconds
means the ring always spans `REWIND_CAP × spacing` of the **plant's** life, so the faster you
run the less of **your own** life it reaches. Measured, ring saturated at 32 slots:

| accel | ring span, SIM s | ring span, **REAL s** |
|---|---|---|
| 1× | 465.9 | **465.9** |
| 10× | 465.0 | **46.5** |
| 60× | 558.0 | **9.3** |
| 600× | 1860.0 | **3.1** |

Now `SANDBOX_CP_SPACING_MS = 20000` on a wall clock: **620.0 real seconds at 1×, 10× and 60×
alike** (measured; 31 intervals × 20 s), and each slot covers more sim the faster you run —
12,000 sim s per slot at 600×, i.e. ~103 plant-hours reachable against 31 minutes before. The
clock is sampled inside `tick()` rather than from a timer, so a throttled tab lays its
checkpoint on the first tick after the interval instead of dropping it. **`_now()` is a
prototype seam** because a headless runner burns no wall time — without it the entire cadence
is invisible to every gate in the repo, which is why the test asserts through it.

**2. The picker inverted a different time base than the plot drew.** `drawChart` placed the
marks over `[t1 − ui.window, t1]`; `rewindPickClick` inverted `[chartBuf[0].t, chartBuf.last.t]`
— up to `CHART_RECORD_SEC` = 1800 s, i.e. **6× too wide at the default 5-minute window**.
Measured in headless Edge: clicking the mark drawn at **T+19 s** landed the plant at **T+0**.
Both now read one `chartExtent()`; the same click lands at **T+19, error 0.0 s**. Verified by
injection — restoring the two-line old mapping reddens it.

**3. A real-time cadence would have put every checkpoint off-screen.** At 600× the slots are
12,000 sim s apart and the widest window is 1800 s, so the marks the fix creates would have
been unreachable — the picker "working" with nothing to click. `chartExtent()` widens to the
whole ring while pick mode is on (axis in `h:mm:ss` past ten minutes). This is the half of the
owner's ask — *"for long fast forwards we need a way to go back far enough"* — that the cadence
change alone does not deliver.

**The one-step button is gone from all four entry points** (strip-chart ⏪, scrub track,
walkthrough/scenario nav ⏪, failure-card ⏪); every one opens the picker. Inside instructed
content the marks are the authored beat/step checkpoints, so escaping a failure card is one
click on the decision point.

**What the issue asked for and did NOT get, deliberately: the press-semantics machinery stays.**
It called the exact-time guard and the `_rewindCursor` walk-back "dead weight… they exist *only*
to make repeated single presses escape a failure card". They are also the **beat** path's
guards, and the same issue forbids touching it. A `rewind:` beat deliberately does not
checkpoint (`instructor_layer.js:295-299`), so two consecutive rewind beats hit exactly the
"restores the same newest checkpoint forever" case the walk-back was written for, and the
exact-time guard is what makes a beat's own rewind reach strictly earlier than the checkpoint
it just laid. Deleting them would have been a silent regression in authored content with no
gate to catch it. The comments now say they are beat-path guards.

**Gates.** `run_m5` **19/19, 79 → 83 checks** (baseline moved). The load-bearing new check
piles up **360 sim-s with the wall clock frozen and requires ZERO checkpoints** — injection
against the pre-fix service lays **21** there and reddens 6 of the suite's 8. `verify_e2e_ui`
gains a `testRewindPicker` section (no baseline move — it scores screenshots): it presses ⏪,
asserts pick mode opened *and the clock did not move* (a one-step press would have moved it),
requires ≥4 marks after five cadence intervals, then **clicks the second-oldest mark and reads
the clock back**. That last check is the only one of the three that survives all three defects
— pressing the button and counting marks passes on a broken inversion.

### 2026-07-31d — #138 was stale; the measurement that proved it found #284  ✅

**Asked to check #138 for staleness first. It was stale — twice over, in opposite
directions.** Filed as "aggressive Manual load cuts (e.g. 1000 → 500 MWe) can trip the plant;
some missions lack trip-catch branches".

**The trip half does not reproduce at any step size.** Measured full stack (M4+M5+M6),
`hot_full_power`, free-play lineup, accel 10×, seed 4242, 20 plant-min per case, step at
t+60 s:

| target | cut | scram | end power | end Tavg | dump |
|---|---|---|---|---|---|
| 90 MWe | 10 | no | 89.4 % | 585.0 °F (307.2 °C) | 0 % |
| 65 MWe | 35 | no | 63.0 % | 598.8 °F (315.0 °C) | 0 % |
| 61 MWe | 39 | no | 58.7 % | 600.9 °F (316.1 °C) | 0 % |
| 50 MWe | 50 | no | 98.8 % | 580.0 °F (304.4 °C) | 48 % |
| 20 MWe | 80 | no | 98.0 % | 580.4 °F (304.7 °C) | 77 % |
| 0 MWe | 100 | no | 97.5 % | 580.7 °F (304.8 °C) | 96 % |

Two reasons it expired: **"1000 → 500 MWe" describes a plant that no longer exists** (the
2026-07-21 identity ruling made this the SLX-100, `mwe_rated` 100.0), and **#219 built the
catch** — above `dump_load_reject_mwe` (40 MWe) the fast dump arms and the plant rides out;
below it the Tavg program absorbs the step. Worst case is the *sub-arm* cut at 600.9 °F
(316.1 °C): annunciates HI TAVG at 594.0 °F (312.2 °C), **34.1 °F (18.9 °C)** below the Tavg
scram at 635.0 °F (335.0 °C). Nothing gets near it.

**The trip-catch half had already been fixed and had gone stale the other way** — `pwr_tour`
carries the `load_lost` beat, but it is now unreachable and its prose still teaches *"the
reactor tripped rather than ride the shock"* (HR9). Not repaired in place *(OWNER DIRECTIVE,
2026-07-31: "Don’t edit the scenario they are being completely redone.")*. #138 closed;
`ISSUES_AND_FINDINGS.md` I-24 marked DISPROVEN with the measurement.

**#284, found while measuring — two turbine defects sharing one cause.** Nothing in the model
ever asked what the turbine was **admitted** as against what the core **made**, because every
existing check runs where the two agree.

1. **A synchronised rotor coasted to rest.** The rated-speed hold asked `generator_load > 0`
   — the **load**, not the **breaker**. `set_load_target 0 MWe` while synchronised therefore
   fell into the offline coastdown branch: measured **1800 → 0 rpm over ~5 plant-minutes**,
   `turbine_tripped` false, `load_mode` still `manual`, breaker never opened. Fixed with a new
   shared predicate `RD.LoadMode.isOnLine(s)` (`load_mode !== 'disconnected'`), deliberately
   **not** including `turbine_tripped` — a trip and an open breaker are different events
   (#230). Now holds 1800 rpm.
2. **`mwe_output` was derived from `power_pct`.** It ignored the governor and the dump, so
   during a rejection the board read full output for steam that never reached the turbine:
   a 50 MWe ask settled at **98.8 MWe indicated with the dump at 48 %**. Now follows
   `steam_flow_normalized`; the same case reads **50.02 MWe**.

**Why the fix does not re-break #235.** The coastdown branch exists because cold Modes 3/5
spawn untripped with no load and no steam and used to pin 1800 rpm. Those ICs are authored
`load_mode: 'disconnected'` (`pwr_engine.js:1446`), so they still take the coastdown branch —
pinned from that side by leg C of the new probe, which would redden if the fix over-reached.

**Calibration preserved exactly.** `steam_flow_rated` is 1.0 in these normalized units, so the
new form is identical to the old at rated. Verified across every shipped IC —
`hot_full_power` 100.0, `50_percent` 50.00, `5_percent` 6.36, `hot_zero_power` 0,
`cold_shutdown` 0 — matching the `Manuals/09` §12 table, which therefore needed no edit.

**The lesson worth carrying: a 2× error on a board gauge survived 34 green runners** because
no check ever compared turbine admission against core power. `run_behavior` gains **TR-1e**
(39 → 40), and it was **verified by injection, not written beside its fix** — reverting both
engine lines reddens 3 checks (0 rpm end and minimum, 98.78 MWe against a 50 ±3 band). Legs C
and D stay green on the old engine *by design*: they assert the two things the fix must not
change, so a red there would mean the fix over-reached.

**Also noticed, not fixed** (out of scope, filed here so it is not lost): `behavior_pwr.js`'s
`COVERAGE` map declares the key **`TR-14` twice** — once as the #135 LOFW drain probe and
once as `'existing:campaign SBO fact'`. The second wins, so the coverage report describes
TR-14 wrongly. Cosmetic; the probe itself runs and passes.

### 2026-07-31c — #135: the SG drained 2.7× too fast, and nothing in the suite could tell  ✅

**Checked for staleness first, as asked — it was not stale, and its stated fix was
arithmetically impossible.** #135 said the LOFW warning-to-trip window is "~4 s" and that
"widening it is a setpoint/lag question… not a physics change". Measured full-stack: **2.9 s**.
The setpoints are 13 points apart (LO 30 %, lo-lo 17 %) on a level falling at 4.7 %/s, so no
spacing change buys more than a few seconds. Backlog row **S2** in this file had the right
instinct — *"slowing SG boil-down"* — and the issue contradicted it. S2 was right; the issue
was wrong; both are now updated.

**The number.** `d(level)/dt = K_sg_level × (feed − steam)` normalized to rated, so with feed
lost `K_sg_level` IS the drain rate in %/s. At **5.0** the whole narrow range held **twenty
seconds** of full-power steaming (true level 64.5 → 3.1 % in 13 s).

**SOURCED.** Ginna UFSAR Ch.15 Table 15.2-4 (NRC ADAMS **ML20339A101**, Rev 29 11/2020,
p.102): feed stops 20 s, lo-lo trip setpoint reached 55 s → **35 s**. 48 points of this
plant's span / 35 s = **1.37 %/s**. `K_sg_level` **5.0 → 1.37**; trip now 40.5 s, window
11.6 s. The **time** is fitted, not the geometry.

**The expected risk did not materialise.** Measured before/after: steady hold 2.35 → **2.11**
points of band; 100 → 80 MWe ramp 9.8 → **5.4** points, settling 64.38 → **65.12**. Lower gain
= less swing per unit mismatch, so the three-element feed channel needed **no retuning**.

**Not savable, deliberately.** Clearing the failure on the alarm still trips at 40.6 s — a real
LOFW trips on lo-lo level and that is the credited protection. The window is for reading the
board. **07 PWR-E01** says so (manual **Rev 22**).

**The lesson: a 3.6× physics change left ALL 32 gates green.** Nothing asserted SG drain rate.
New **TR-14** in `behavior_pwr.js` pins it (25–60 s band, window ≥ 7 s) and fails at 13.0 s on
the old constant; `run_behavior` **38 → 39**. The one gate that did move — `verify_e2e_ui`'s
`ff=240` post-trip sample — was a **fixture** calibrated to the old drain rate, moved to
`ff=600` and **validated against the old behaviour too**, so it is a better sample point, not a
refit. Detail: `Blueprint/BUILD_DECISIONS.md` **2026-07-31c**.

### 2026-07-31b — #75: the SCRAM button resets now; it had been inert since it was built  ✅

No plant physics change. The board's SCRAM control has read **PRESS TO RESET** since the day
it was drawn, and `onScramReset` was an empty stub commented *"no engine reset command;
visual only"* — false when written. The engine's `reset_rps` (with its rods-in interlock) and
the kernel's `resetRps()` permissive both existed and were both green under an ops probe.
Three finished halves, never joined.

**The refusal was invisible in code too.** `resetRps()` returned `type: 'refused'`, a shape
returned by two lines and read by **nothing** — service, `app.js`, tests, spec, all blind to
it. So a working, correctly-computed refusal went into a branch that does not exist. Now
`{type:'blocked', code:'INTERLOCK', reason, message}`, which `app.js` already flashes.

**The permissive is state now**, not just a response: `getRpsState()` carries
`reset_permitted` / `reset_block` from the *same* evaluator the press uses, so the caption
under SCRAMMED names what is holding — *TRIP SIGNAL STANDING*, *RODS NOT AT BOTTOM*, or
*PRESS TO RESET*. Rod bottom became a `rods_fully_in` status word sharing one threshold
constant with the engine interlock (HR1), and the permissive list is plant config, so the
kernel stayed plant-agnostic and **`run_hr3` is unmoved at 29** — #228's leak was not widened.

**Measured** (hot full power, manual scram, seed 42): turbine trip holds ~1 s → rod bottom
~2 s more → available ~t+4 s. Loss of feedwater keeps it blocked on *low steam generator
level*; large LOCA on *low reactor coolant pressure*.

**Lesson worth keeping — 18 green checks were not evidence.** Deleting the entire
`rps_reset_permissive` config left the suite at 57/57, because the standing turbine trip
covers the first half-second and the rods are seated before the later checks run: the
rod-bottom window (~1–3 s), the only window where that config binds, was untested. Found by
injection, not by reading. `run_e2e_controls` **39 → 59**, `board_check` **138 → 143**,
manual **Rev 20** (03 §3.5.1). Detail: `Blueprint/BUILD_DECISIONS.md` **2026-07-31b**.

### 2026-07-31a — two shipped releases were still filed as unreleased; the roll is now gated  ✅

No plant change. Alpha **1.10.0** and **1.11.0** both merged to `main` without `CHANGELOG.md`'s
`## [Unreleased]` heading being renamed — 434 lines of two releases filed as work-in-flight,
newest version heading reading **1.9.0** while the site correctly said 1.11.0. Both rolled,
dated 2026-07-30.

**The seam was measured, not judged.** Entries had been inserted at the top of existing
`### Added`/`### Fixed` subsections, so the two releases were *interleaved*; the split came
from diffing the `[Unreleased]` block at tags `v1.10.0` and `v1.11.0` against HEAD, and lands
between #271 (1.11.0) and #263 (1.10.0). `changelog.html`'s two entries — written at release
time, untouched since — split at the same place. Content-neutral: sorted non-blank lines
before/after differ by exactly the four added heading lines.

**New gate `test/run_release.js` (18 checks)**, `run_all` 33 → 34 runners. The three files that
describe a release must agree. This needed a gate rather than a note because *nothing
downstream reads those headings* — CLAUDE.md and the `release-to-main` skill both already said
to do it, and that is precisely what failed, twice. Proven against the **real** pre-fix file:
3 red, naming both missing versions. All 18 driven red by injection. Detail:
`Blueprint/BUILD_DECISIONS.md` **2026-07-31a**.

### 2026-07-30o — #275: the offline download was arriving called `latest.zip`  ✅

No plant change. The site's Download button had a **bare** `download` attribute on a
deliberately-stable `download/latest.zip` href, so that basename is what the visitor's browser
saved — no product name, no *Alpha*, no version, and nothing to tell it from the copy they
pulled three releases ago. The zip's **contents** were always correctly named, and
`site/make_download.js` has always written a correctly-named versioned copy beside
`latest.zip`; only the wrapper the visitor actually receives was anonymous.

Fixed by stamping the name from `site/release.js` (`site/nav.js`, same mechanism that already
puts `RD_VERSION` in the footer) rather than by versioning the href, so **no new per-release
edit** was created. Measured in headless Edge over `file://`:
`download="Reactor_Dynamics_Alpha_1.11.0.zip"`, identical to what the build writes. With JS
off it still saves, as `latest.zip` — no worse than before, which is the right way for it to
fail.

`run_portable.js` **116 → 123**, new `DOWNLOAD` rule: every way that wiring breaks leaves a
button that still works and still downloads, so nothing else would ever have gone red. All
seven checks driven red by injection first. Rationale, the two rejected alternatives, and the
one thing deliberately left alone: `Blueprint/BUILD_DECISIONS.md` **2026-07-30i**.

### 2026-07-30n — #276 RULED: re-aligning the accumulators stays procedural, so the procedure had to actually contain the step  ✅

*(OWNER RULING, 2026-07-30: "lets leave opening of the accumulators to the procedure instead of
auto opening them.")* — declining the auto-OPEN actuation recommended in 2026-07-30m. **No code
change; a manual change the ruling makes mandatory.**

**Why this was not simply "close it".** The ruling makes **04 PWR-N03** the *sole* defence on the
heatup side, and PWR-N03 did not have the step. The `cold_shutdown` lineup ships with the
accumulators isolated (`pwr_engine.js:1505` — correct, the plant sits below their cover gas) and
nothing in that procedure ever opened them again, so a by-the-book heatup reached Mode 1 with no
passive injection. **New step 4**, re-align above the 600 psi (4.14 MPa) cover gas and before
1000 psi (6.895 MPa), with a note saying explicitly that nothing does it for you. Before this,
the only two sites that re-aligned were the engine's internal `_driveHeatup` (`:1795`) and one
step in `ui/manual_procedures.js:59` — neither of which is the free-play player.

**And the annunciator had to disclaim itself.** `accum_aligned` (06 PWR-A32) clears *on shut
tanks*, so it is structurally **silent** on this case. A tile that looks like it covers both
directions of the same valve and only covers one is worse than no tile — so the card now says so
in its own row. Manual set **Rev 19**.

**HR11 fired on my own draft and was right.** The first cut of that row cited
`*(OWNER RULING, 2026-07-30)*` with the date but no verbatim quote; `run_hardrules` went red on
it (HR11, 32 sites / 1 undeclared). Fixed by quoting. The gate moved 34 → **36** — two new
citation sites, both carrying their words.

**Not built, and now not open either:** the auto-OPEN actuation. Recorded as the owner's call
with the quote, so a future agent does not re-propose it as an oversight.

### 2026-07-30m — #273 CLOSED: the cue shipped, the interlock did not, and the warning margin is thinner than the fix  ✅

*(OWNER RULING, 2026-07-30: "do as you suggest.")* — on the recommendation in 2026-07-30l: no
autoclose, build the annunciator.

**What shipped.** `accum_aligned` / **SI ACCUM ALIGNED < 1000 PSI** (06 PWR-A32, panel B,
caution) at **1000 psi (6.895 MPa)**. Three pieces:

- **A new indication, `accum_valve_open`** (`pwr_engine.js` indications block, registered in
  the config status list). Position, not flow — `accumulators_discharging` only goes true once
  the tanks are already emptying, which is a full instrument-lag too late to be a cue. Status
  passthrough, so it draws no PRNG number (the cross-step stream rule).
- **A generic `condition` field on the alarm schema** (`control_kernel._evalAlarms`), reusing
  the same `_evaluateCondition` the trips and actuations already use. Kernel stays
  plant-agnostic (HR3); it reads instruments (HR1); it can only ever narrow, since an
  unresolvable name evaluates false.
- **A guard in `_buildAlarmModel`: a conditioned alarm is never lo_lo-paired.** Sibling pairing
  is "same instrument, less-extreme low sibling", and `primary_pressure` already carries
  `pzr_pressure_low` (14.82) and `_lolo` (12.41). Today the pairing would be a **no-op** —
  6.895 is far below both — and that is exactly the kind of coupling that rots silently when a
  setpoint later moves. One line, stated rather than left to be discovered.

**Why the gate is the interesting part.** Pressure alone was never the condition. A Mode 5
plant sits below 1000 psi indefinitely with the tanks correctly isolated, so an ungated alarm
would stand in permanently and be normalized — the exact habit this sim exists to break.
**Proven by injection**: with the `condition` line removed, three of the six `run_m4` checks go
red (*silent in Mode 5*, *isolating clears the cue*, *not paired as an escalation*). `run_m4`
25/25 135 → **26/26 147**.

**THE MEASUREMENT THAT MATTERS, and it is not flattering.** Full-stack (M4+M5+M6), the campaign
cooldown driver, run twice:

| cooldown | cue annunciated | first discharge | margin | accum end |
|---|---|---|---|---|
| **not isolated** | 1.9 plant-min @ **1000 psi (6.894 MPa)** | 2.7 plant-min | **0.9 plant-min** | **0.0 %** |
| **isolated at 1000 psi** | never | never | — | **100 %** |

**~54 plant-seconds of warning**, which at 30× is under two seconds of wall clock. So the
annunciator does **not** on its own make the defect safe — the procedure step does, and the cue
is a backstop plus a post-mortem (it stays lit after the dump, beside SIT fill at 0 %). Two
honest consequences, both now written down rather than left implicit: the margin is a
**compression artifact**, not a setpoint problem — a real plant takes most of an hour across
that band — and **isolating on schedule means the cue never comes in at all**, so it cannot be
used to confirm you did it right. Both are stated in **06 PWR-A32** and in the new
**12 §14.1**.

**The setpoint was NOT raised to buy margin.** 1000 psi is sourced (LCO 3.5.1 applicability /
LTOP SR 3.4.12.3); moving it to make a number look better would have traded a sourced value for
an invented one, which is what #260 and #263 are the record of.

**Item 3 done in the same pass.** New **12 §14.1** names the two Compressed rates that had been
left implicit: **ECCS injection pacing is 22–440× real** (so no time-to-recover figure from an
injection transient is a plant number — the TMI *behaviour* is what to learn, not the duration),
and the cooldown depressurisation rate above.

**Gates:** `run_all` **OK, 33 runners at baseline** (`run_m4` 26/26 147, `run_reachability`
57 → **58**); board_check **127/127**; manual set **Rev 18**, `run_manual_units` 272 pairs / 0,
`run_manual_rev` 12 / 0.

**Still open, deliberately:** **#276**, the auto-OPEN half — a free-play heatup still arrives at
Mode 1 with the tanks isolated. It was piece (2) of the recommendation and was not authorised;
prose-mitigated only, in 05 Phase A step A5.

### 2026-07-30l — #273 item 1: the manual now carries the isolation step (and its mirror), and the interlock question got its evidence pass  ✅

**Item 1 done.** It was deferred in 2026-07-30k only because the workbench lane had all 13
manual documents open; that lane merged at `a3e552f`, so the prose landed.

- **`04` PWR-N15 and `05` Phase C both gained an isolation step** at **1000 psi (6.895 MPa)**
  — narrative table + simulator practice in N15, table step C3 + the Simulator paragraph in
  Phase C. Neither chapter had contained the word *accumulator* before. Both carry the note
  that these are passive tanks and that the SI block set entering the cooldown blocks
  **pumps**, not them.
- **`05` Phase A gained the matching re-align step, A5** — not scope creep. A manual that
  teaches isolation on the way down and says nothing on the way up trades one silent hazard
  for the mirror hazard: the Mode 5 IC ships with `accumulator_valve_open: false`
  (`pwr_engine.js:1505`), and **nothing in the manual set re-aligned them** — the only two
  sites that do are the engine's internal `_driveHeatup` (`:1795`) and one step in
  `ui/manual_procedures.js:59`. A free-play manual heatup therefore reaches Mode 1 with no
  passive injection and no cue. Filed as a follow-up rather than fixed in code here.
- **One number, not two.** `1000 psig (6.89 MPa)` failed `run_manual_units` twice over: the
  checker does not recognise `psig` as the US half of a pair, and 6.89 MPa is 999.31 psi,
  0.69 outside the 0.6 psi tolerance. Rather than quote a setpoint the arithmetic disowns,
  **1000 psi (6.895 MPa)** is now the single value in the manual, the scenario trigger
  (`scenarios/pwr_mode3_to_mode5.js:80`) and the campaign driver
  (`test/run_campaign.js:1196`). The verbatim NUREG quote keeps its own `psig`, as a quote
  should.

**Item 2 — the interlock question — evidence pass run, and it settles the opposite way from
"probably yes".** Two primaries, independently:

- **U.S. EPR FSAR Tier 2 §7.6.1.2.2** (ML091671514), *Safety Injection Accumulator
  Interlocks*: *"Each isolation valve is interlocked to remain open above a specified RCS
  pressure value. This pressure value is the permissive P12 threshold."* … *"when RCS
  pressure increases above the P12 threshold, the PS provides automatic signals to open the
  accumulator isolation valves. Once the valves are verified to be in the open position,
  control power is removed from the valves to prevent inadvertent closure."* … *"after RCS
  pressure decreases below the P12 threshold, the operator is prompted to manually
  acknowledge P12, which allows the isolation valves to be closed."*
- **NUREG-1431 Rev 4.0 Bases B 3.5.1, SR 3.5.1.5** (ML12100A228): *"Verification that power
  is removed from each accumulator isolation valve operator when the RCS pressure is
  ≥ [2000] psig ensures that an active failure could not result in the undetected closure of
  an accumulator motor operated isolation valve."*
- **Bases B 3.3.3** (post-accident monitoring) names the cooldown decision as an **operator**
  decision read off an instrument: RCS pressure is used *"to determine whether to close
  accumulator isolation valves during a controlled cooldown/depressurization."*

So every automatic signal a real plant puts on this valve is an **open** signal, and the
hazard the design guards is **spurious closure** — the exact opposite of an autoclose. There
is also a mechanical reason an autoclose is unsafe here rather than merely unprototypical:
the discharge gate is a conjunction, `aligned && p_coldleg < 4.14 MPa`
(`pwr_primary.js:99`), so any pressure-keyed autoclose must fire at or above 600 psi to beat
the discharge — which is the identical condition **every modelled LOCA** satisfies. It would
suppress accumulator injection in all of them unless it carried an SI-actuation exemption.
(That is the gate's logic, read statically; the engine's own selftest already measures the
half that matters — *"isolated accumulators do not discharge"*, `pwr_engine.js:2561`.)

Recommendation put to the owner: **no autoclose**; instead the two-sided real interlock —
block `close_accumulator_valve` above the permissive, auto-**open** on the way up, and an
annunciator at the isolation decision point on the way down. Awaiting the ruling.

**Gates:** `run_all` **OK, 33 runners at baseline**; `run_manual_units` 266 pairs / 0 failed;
`run_manual_rev` 12 / 0 (set Rev **17**).

### 2026-07-30k — #249 FITTED and #273 FIXED, and a new gate for the class of bug that hid them  ✅

*(OWNER RULING, 2026-07-30: "249 - fit it.")* — so the surplus axis is fitted to the sourced
geometry, the cooldown that the old pin was masking is fixed, and the failure mode itself
("a check that a trip never fired, on a gauge that could not reach it") now has a guard.
`run_all --fast` **OK, 31 runners at baseline**.

**1. `level_per_mass_surplus` 300 → 776** (`pwr_config.js`). Derivation is in the config
comment: pressurizer steam space ÷ RCS volume = 0.40 × 1,400 ft³ ÷ 9,650 ft³ = **0.0580**
(BVPS-2 UFSAR Tables 5.1-1 / 5.4-12; WTSM 3.2 Table 3.2-2), and this sim spans 45 points of
level from nominal to solid, so 45 / 0.0580 = **776 %/frac**. **The plant can go water-solid on
injection again** — measured peak indicated level 100.00 %, against 88.00 % before.

**I did NOT touch `cvcs_charge_per_level`, and my own recommendation to do so was wrong.** The
documented loop τ of 83 s is the **deficit** branch (`level_per_mass` 100); scaling the shared
gain to fix a surplus-side number would have slowed leak make-up to 215 s. The servo is simply
faster on the surplus side now (27.8 → 10.7 s); measured, it does not hunt. `mass_max` also
stays at 1.2 — 1.06 is the physical figure but it costs the going-solid endpoint (peak 96.83 %),
and it is no longer binding on that path anyway (solid lands at Δm 0.058 hot, 0.093 floored).

**2. #273 — the cooldown now isolates the accumulators.** New `isolate_accumulators` beat in
`scenarios/pwr_mode3_to_mode5.js` at **1000 psig (6.89 MPa)**, which is where a real plant stops
requiring them: **NUREG-1431 Rev 4.0** (ML12100A222) **LCO 3.5.1** *"APPLICABILITY: MODES 1 and
2, MODE 3 with RCS pressure > [1000] psig"*, and LTOP **LCO 3.4.12** requires the system operable
*"with … the accumulators isolated"* (**SR 3.4.12.3** *"Verify each accumulator is isolated."*).
That leaves 2.75 MPa of margin above this plant's 600 psi (4.14 MPa) arming pressure, so a player
who takes the cue never sees a discharge. The campaign driver does the same at the same
pressure, and the suite gained **three endpoint assertions** — accumulators intact and isolated,
inventory < 110 %, boron < 2,000 ppm. All three go red with the isolation removed.

**The fit made an existing vacuous check real.** With 776 in place, the suite's *old* "arrived
UNscrammed" assertion **also** fires on the un-isolated cooldown. It had been passing for months
over a full four-tank dump.

**3. NEW GATE — `test/run_reachability.js` (55 checks).** The generalisation, because the shape
is not a one-off: *every* "never scrammed" / "no alarm" assertion in this repo carries the hidden
premise that the trip was reachable, and nothing checked it.

- **Part A, static, total coverage.** All **50** PWR trip/actuation/alarm thresholds must sit
  **strictly** inside their instrument's declared `range` — `crossed()` is strict, so a setpoint
  on the edge can never fire. This is the C1 lesson (`power_range` widened to [0,200]) finally
  turned into a gate instead of a paragraph in this log. All 50 pass today.
- **Part B, dynamic, deliberately small.** Part A would **never** have caught #249: `pzr_level`'s
  range is [0,100] and its trip is 97, so the static check is perfectly happy while the level
  physically cannot exceed 88.00 %. Only stepping the plant finds a clamp. B1 pins that injection
  can take the pressurizer past its 97 % trip; **injection-verified — it reports peak 89.01 % and
  goes red on the old 300.**
- **A wrong first draft, recorded because it is the lesson.** B2 originally drove the low-level
  scram with **letdown**, and failed at 29.6 %. That was *correct plant behaviour*: the letdown
  isolation at 17 % exists precisely so it "shuts before the 12 % pzr-level reactor trip,
  arresting the drop" (`pwr_control.js:208`). **A reachability probe must name the mechanism it
  expects to reach the setpoint by**, or it re-discovers an interlock and calls it a defect. B2
  now drives it with a break.

**Deferred, deliberately.** `Manuals/05_MODE_TRANSITIONS.md` still has no accumulator-isolation
step, so **#273 stays open** — the workbench lane had all 13 manual documents modified while this
was being written, and a three-way conflict on a file another session is rewriting is not worth
the prose. Same reason `Manuals/12` §14 does not yet name ECCS pacing in its **Compressed** class.

### 2026-07-30j — #249 evidence pass: the refill rate is 22–440× real, and the clamp hiding it also hid a spurious accumulator dump  🔶 (no code changed)

**#249 asked three questions about the post-stuck-PORV HPI refill. Answered: one is correct
as-built, one is compressed-by-design, and one is a real defect that turned out to be masking
a second, larger one.** Nothing changed — the fix needs an owner ruling (below). Working tree
restored; `run_all --fast` **OK, 30 runners at baseline** before and after.

**Sources** (evidence-pass SOP; nrc.gov 403s non-browser fetches, Wayback `2023id_` + browser UA):

- **WTSM 5.2 ECCS** (ML11223A220) Table 5.2-3: 2 centrifugal charging pumps, design flow
  **150 gpm** each, developed head at max flow 1,400 psig, shutoff **2,670 psig**. Table 5.2-6:
  2 safety injection pumps, **425 gpm** each, shutoff **1,520 psig**. §: *"At very low RCS
  pressures, the two high head injection trains deliver a combined flow rate of up to several
  hundred gpm."*
- **WTSM 3.2 RCS** (ML11223A213) Table 3.2-2: pressurizer **1,800 ft³**, full-power water
  **1,080 ft³**, full-power steam **720 ft³** — so full-power level is **60 % by volume**.
  Table 3.2-5: PORV relieving capacity **210,000 lb/hr** per valve.
- **BVPS-2 UFSAR Ch. 5** (ML22144A118) Table 5.1-1: *"Total system volume including pressurizer
  and surge line (ft3) **9,650**"*, nominal operating pressure 2,235 psig, 2,900 MWt, 3 loops.
  Table 5.4-12: pressurizer internal volume **1,400 ft³**.
- **TMI-2** (NRC Backgrounder): HPI auto-started ≈ 2 min; the crew throttled at 04:05:15 with
  pressurizer level off scale — **≈ 3 min of full injection before the trap sprang**.

**The one number everything turns on.** Pressurizer steam space ÷ RCS volume =
0.40 × 1,400 ft³ ÷ 9,650 ft³ = **5.8 %**. *That is the entire physical headroom between
full-power level and water-solid* — a real RCS is a rigid liquid-filled volume, so "120 % of
inventory" is not a state a plant can occupy.

**Measured** (`test/measure_stack.js`, full stack, seed 4242, `hot_full_power`, shipped lineup,
stuck-open PORV at t = 1 s):

| | sim | sourced real | ratio |
|---|---|---|---|
| gross injection at 1,165 psi (8.03 MPa) | **3.05 %/s** | 0.0069–0.0265 %/s (300–1,150 gpm ÷ 72,180 gal) | **115–440×** |
| inventory 97.7 → 120.0 % | **10 s** | — (unreachable state) | — |
| pressurizer 52.4 → 90.6 % | **10 s** | 3.6–14 min to solid; TMI ≈ 3 min | **22–84×** |
| HPI at NOP, no break | 0.255 %/s | ≈ 0.005 %/s | ≈ 55× |

**Verdicts on the three items.**

1. **Rate — compressed by design, and NOT independently tunable.** It belongs in the
   `Manuals/12` §14 **Compressed** class ("right in behaviour, wrong in duration"), which does
   not currently name it. It cannot be moved alone: `hpi_flow_max`/`porv_flow_max` (accident
   scale), `level_per_mass_surplus` (the going-solid axis) and `cvcs_charge_per_level` (the
   servo tuned against it — loop τ 27.8 s → 10.7 s if the surplus axis is fitted) are one set.
2. **The 120.00 pin — a real defect, and worse than "a clamp".** `mass_max: 1.2` is what pins
   **indicated pressurizer level at exactly 88.00 %**: 88 = `level_prog_floor` 28 +
   `level_per_mass_surplus` 300 × the clipped surplus 0.20. `base(Tavg)` floors below
   **559.8 °F (293.2 °C)**, which every quench crosses. **So the plant can never read
   water-solid on injection — which is the TMI lesson it is built to teach.** Injection-verified
   (`set_hpi` at HFP, 1500 ticks; cfg is a module singleton — restore between runs or run N
   inherits run N−1's patch, which cost me one bogus table):

   | variant | inventory | peak pzr level | solid? |
   |---|---|---|---|
   | **baseline** (mass_max 1.2 / floor 28 / surplus 300) | clips 120.00 | **88.00** | **no** |
   | mass_max 1.5 only | 134.83 | 100.00 | yes |
   | level_prog_floor 0 only | clips 120.00 | 71.53 | no — *worse* |
   | **level_per_mass_surplus 776 (sourced) only** | clips 120.00 | **100.00** | **yes** |
   | surplus 776 + mass_max 1.06 (both sourced) | clips 106.00 | 96.83 | no |

   776 = the 45 points of level between nominal (55 %) and solid ÷ the sourced 0.058 surplus.
   It assumes indicated level ≈ volumetric fraction, which is this sim's convention but not
   necessarily a real calibrated span — stated rather than hidden.
3. **Subcooling ≈ −1.2 °F (−0.66 °C) — correct, not a defect.** The RCS is saturated with a
   break open; it rides the saturation line down. Nothing to fix.

**The finding that matters more than #249.** With the sourced 776, `run_all --fast` drifts
**exactly one** runner — `run_campaign` 51/51 → 50/51, on `pwr_mode3_to_mode5` "arrived
UNscrammed". Instrumenting **both** sides showed the cooldown was already wrong and the 88 %
pin was hiding it. Baseline endpoint, measured:

```
lvl=88.0  inv=120.00  tavg=202.5 °F (94.7 °C)  scram=false
accum_vol=0.0 %  accum_disch=false  hpi=false  boron=2310 ppm
```

The accumulators are **empty** and boron sits at **2,310 ppm** against a 2,500 ppm SIT charge:
the by-the-book cooldown descends through the **600 psi (4.14 MPa)** arming pressure **without
isolating the accumulators**, so all four dump into the RCS and inventory pegs at the clip. The
check has been green only because the level indication is structurally incapable of reaching the
97 % high-level trip — **HR10, exactly**. Filed as **#273**; backlog row S14.

Nothing tells the player to isolate them: **zero** occurrences of "accumulator" in
`ui/campaign_data.js` and in `Manuals/05_MODE_TRANSITIONS.md`. The engine's own cooldown driver
does it right (`pwr_engine.js:1833` — closes below arming + 0.35 MPa), which is why no
engine-direct gate ever saw it, and the heatup procedure re-opens a lineup the cooldown never
establishes: *"Re-align the Safety Injection accumulators (isolated for the cold lineup)"*
(`ui/manual_procedures.js:58`). Board indication does exist (SIT fill + N₂ psig,
`pwr_board_wiring.js:558/561`), so it is visible if you look — not silent.
### 2026-07-30i — #262: the everyday leak exists now, and its ceiling is half the filed figure  ✅

The failure entry, completing #262 (the alarm pair landed in 2026-07-30h).

**What was missing, and it was worse than "missing".** The catalog held two `primary_leak`
failures and both are casualties: `sgtr` (teaches the SGTR EOP) and `large_loca` (a cold-leg
break, correctly far beyond make-up). No containment-side *identified leakage* case at all. And
it was **unreachable**, not merely absent: every severity control is
`<input type="range" min="0" max="100">` with step 1, so the smallest injectable `large_loca` is
severity 0.01 = **5.0e-3 frac/s**, about **7× beyond what charging can hold**. You could not get
there by turning the LOCA down — the control has no such position, so a finer slider step would
not have fixed it either (0–50 % rated flow across 100 steps cannot resolve the 0–0.14 % band).

**`rcp_seal_leak`** — containment-side, **not** ΔP-modulated (unlike an SGTR it does not stop
when you depressurize), whole range holdable. The engine computes
`leak = severity · (meta.max/100) · leak_scale`, so `max: 100` with `leak_scale: 3.5e-4` maps
0–100 % cleanly onto 0 → 3.5e-4 inventory-frac/s.

**The ceiling is half what the issue was filed with, and getting that wrong would have
reintroduced the defect.** #262 derived authority as `charging_max · cvcs_inventory_gain` =
**7.2e-4**, which assumes letdown is ISOLATED. In the normal lineup letdown sits at 0.03, so net
make-up authority is `(0.06 − 0.03) · 0.012` = **3.6e-4**. Measured full-stack at 30 min:

| leak | level | charging | held? |
|---|---|---|---|
| 3.5e-4 | 52.8 % | 0.0585 of 0.0600 | **yes**, at the edge |
| 5.0e-4 | 28.6 % | saturated | no |
| 7.0e-4 | 18.7 % | saturated | no — only stabilises once letdown isolates on low level |

Sizing the slider 0–7.2e-4 would have left its **top half unholdable** — precisely the thing the
issue exists to fix.

**Verified across the whole range**, 30 min each, full stack:

| severity | charging | level | CHG FLOW HI | PZR LVL DEV LO |
|---|---|---|---|---|
| 0.25 | 0.0367 | 55.0 % | **ALARM** | clear |
| 0.50 | 0.0439 | 54.3 % | **ALARM** | clear |
| 0.75 | 0.0519 | 53.0 % | **ALARM** | clear |
| 1.00 | 0.0585 | 52.8 % | **ALARM** | clear |

Every position held; the cue fires; the deviation alarm stays quiet because make-up is *holding*,
which is the lesson.

**The bottom ~20 % is deliberately below the alarm.** At severity 0.15 charging reaches 0.0344
against the 0.036 setpoint — elevated on the gauge, not annunciated. Left that way on purpose:
the load-change peak is 0.0323, so a setpoint low enough to catch 0.15 would sit within 5 % of
normal manoeuvring. "Leakage below the alarm point, found by trending" is a real condition, not a
gap.

**Slider unit is "% of make-up capacity", deliberately not gpm.** The repo's gpm are display
flavour that do not reconcile with the mass balance (see 2026-07-30's gpm pass), so quoting one
here would invite exactly the real-Tech-Spec comparison #262 had to retract in its own thread.

**Manuals Rev 15 → 16:** new **07 PWR-E23** card, index row, and the §2.1 slider table (23
failures, eight sliders). The card leads on what the board will **not** tell you — PZR LVL LO
never comes in, because a held leak parks level around 52–54 % against a 25 % setpoint — and on
PZR LVL DEV LO's silence being information rather than absence of a problem.

**#262 is complete.** Gates: `run_all` **OK, 32 runners**; `run_manual_rev` 12/0;
`run_manual_units` 0 failed; failure catalog 23 → 24 entries.

### 2026-07-30h — #262: the small-leak cue pair, and the measurement that overturned my own recommendation  ✅

*(OWNER RULING, 2026-07-30: "Add the alarm as you suggest")* — on a recommendation that turned
out to be **half wrong**, which is the part of this entry worth reading.

**The gap.** A leak inside CVCS make-up authority is held indefinitely. Measured full-stack across
the whole holdable band, pressurizer level parks between **52.0 % and 54.1 %**; the nearest existing
alarm, `pzr_level_low`, is at **25 %**. Nothing annunciated anywhere in the band — the plant loses
inventory silently with charging near maximum.

**What I recommended, and why it was wrong.** I proposed a level-deviation alarm at **−2 %** as the
small-leak cue, on a measured 30:1 signal-to-noise. That number came from comparing level against a
**fixed 55 %** with CVCS not holding. Measured properly — full stack, CVCS in AUTO, deviation
against the live **program**:

| case | deviation (final / worst) | charging (final / max) | DEV_LO | CHG_HI |
|---|---|---|---|---|
| no leak, 40 min | 0.60 / **−1.79** | 0.0297 / 0.0321 | clear | clear |
| 100 → 90 MWe load change | 0.11 / −1.51 | 0.0293 / 0.0323 | clear | clear |
| sev 0.0002 (held) | −0.40 / −2.47 | **0.0383** | clear | **ALARM** |
| sev 0.0004 (held) | −1.23 / −3.31 | **0.0467** | clear | **ALARM** |
| sev 0.0007 (held, edge) | **−1.77** / −4.42 | **0.0585** | clear | **ALARM** |
| sev 0.001 (unheld) | **−25.95** | 0.0594 | **ALARM** | **ALARM** |
| sev 0.0014 (unheld) | **−35.90** | 0.0600 | **ALARM** | **ALARM** |

**A controller doing its job erases the signal you wanted to alarm on.** With CVCS holding, the
deviation across the entire holdable band reaches **−1.77 %** against a **−1.79 %** settling
excursion with *no leak at all*. Signal-to-noise ≈ 1:1. It cannot be made into a small-leak cue by
tightening, because tightening fires on the settle. Obvious in hindsight; only measurement said so.

**So the two alarms swapped jobs:**

- **`charging_high` (0.036, 60 % of max) is the cue.** Charging is the sensitive channel by an order
  of magnitude and barely responds to load (0.0293–0.0323 through a 10 % load change), so the
  setpoint clears the load peak by 11 % and still catches the *smallest* holdable leak.
- **`pzr_level_dev_low` (−10 %) says make-up is no longer HOLDING.** Useless while CVCS keeps up,
  unambiguous the moment it does not, because the gap either side is **6×**: worst held excursion
  −4.42, first unheld case −25.95. It also beats `pzr_level_low` to the condition — at sev 0.001
  the deviation is −25.95 while absolute level is still 28.6 %.

**Why a deviation instrument at all.** Level is programmed against Tavg, so it legitimately swings:
measured over 100 → 90 MWe, indicated level went **55.00 → 63.26 %** while the program went
**+8.25**, leaving the deviation at **0.01**. Deviation is an inventory signal by construction, and
any absolute setpoint tight enough to see a leak early would fire on every load change.

**Build notes.** `pzr_level_dev` is derived from the **indicated** level and **indicated** Tavg —
same construction as `subcooling_margin`, so it inherits their lag and any failure (a stuck Tavg
transmitter corrupts the program here as it would on a real board). It calls the plant's own
`levelBase()` rather than restating the program line, so the two cannot drift apart; `tavg_fp` is
computed at init rather than a config constant, so the engine hands it over in `_instrExtras`. Not
in `SOURCE`, so it draws no PRNG number and the cross-step noise stream is unchanged — the appended-
instrument rule satisfied the same way `subcooling_margin` satisfies it. **No `true_state` field
added**, so `run_contract` is untouched.

**One trap worth recording.** The first verification ran engine+M4 and showed `charging_flow` at
**0.0000** with the leak unheld — CVCS never engaged, because `engageDefaults()`/`stepAutomation()`
only have callers in the service. Every number in the table above is full-stack for that reason.
That is the CLAUDE.md layer table biting for the third time this session.

**Manuals.** Rev 14 → **15**: new **06 PWR-A30 (CHG FLOW HI)** and **PWR-A31 (PZR LVL DEV LO)**
response cards plus index rows, stamped and repacked. A30 alone reads as a held leak; A30 with A31
means make-up has lost it — the pair is the diagnosis, and each card says what the *other* one being
absent implies.

**Still open on #262:** the failure entry itself. The owner scoped this turn to the alarms, so the
small-leak failure is not built. Note for whoever does: the issue's stated CVCS authority of
**7.2e-4 frac/s is the letdown-isolated figure** — with letdown in service the real ceiling is
**~3.5e-4**, so the new failure's 0–100 % must map onto that or the top half of its own slider will
be unholdable.

**Gates.** `run_all` **OK, 32 runners at baseline**; board_check **127/127**; `run_manual_rev` 12/0;
`run_manual_units` 0 failed. Adding two alarms moved no baseline — nothing in the gate set counts
alarms, which is worth knowing.

### 2026-07-30g — the 600 s hold checked: the #263 derivation is NOT circular, but it is ±2 steps  ✅

**Why this was checked.** 2026-07-30e derived `pwr_startup`'s 26-step creep as
`decades ÷ hold → DPM → ρ → steps`. Every input was measured **except the divisor**: the 600 s
hold is an authored number in the same file, and if it had been chosen to make the sweep land,
the "derivation" would have been one authored number derived from another — exactly the failure
#263 item 2 was filed about. Nobody asked; the doubt was mine and it was worth clearing.

**Result: not circular.** From `git log -S` on the step, across #260 (`24427bb`):

| | 1/M bursts | creep | hold |
|---|---|---|---|
| before #260 | 120+50+30+15+8 = **223** | **11 steps** | **600 s** |
| after #260 | 138+90+44+22+12 = **306** | **26 steps** | **600 s** |

The hold was already 600 and **did not move** when the plant did. #260 re-solved the rod worths,
the whole burst ladder changed and the creep went 11 → 26 against a fixed hold. It was not
co-fitted.

**Out-of-sample validation, which is the part that matters.** That history hands over a free HR10
test: the derivation should reproduce **11** on a plant it was never fitted to. Extracted the
pre-#260 engine + config at `24427bb~1` into a scratch tree and ran the identical script:

| | pre-#260 | current |
|---|---|---|
| boron at IC | 363.1 ppm | 682.9 ppm |
| critical position | 224 (bursts end 223) | 319 (bursts end 306) |
| steps to critical | 1 | 13 |
| power at last burst | 9.66e-4 % | 6.25e-4 % |
| decades to 1 % | 3.02 | 3.20 |
| required ascent over 600 s | 0.302 DPM | 0.320 DPM |
| differential worth | **9.50 pcm/step** | **6.70 pcm/step** |
| **derived creep** | **10.8** | **27.7** |
| **authored creep** | **11** | **26** |

Different boron, different critical position, different rod worth — the same relationship lands
on the authored value both times.

**But the write-up was more precise than the method.** Run as a script rather than by hand the
current-plant excess is **14.7 steps, not 13**, so the derivation predicts **27.7 against 26**.
It is good to about **±2 steps**, and the reason is real: **SUR is not constant at a fixed rod
position** — 13 steps above critical measures 0.339 DPM at 120 s and 0.285 at 240 s, so "the ρ
that gives 0.32 DPM" is a band, not a number. The acceptance is ±4 steps wide so 26 sits inside
comfortably, but the clean `13 + 13 = 26` reads like a formula that returns 26 exactly, and it
does not. Corrected in the file.

**One thing still unsourced, recorded rather than fixed:** the manual's own low-power hold
procedure — **PWR-N04** in `Manuals/04` — specifies **no duration at all**; its acceptance is
"SUR near 0; power stable ≤ 5 %". Nothing sources 600 s. The honest claim is therefore *the creep
is derived GIVEN the hold*, and the hold remains authored. That is a weaker statement than
2026-07-30e made, and it is the true one.

**Carrying forward:** the check took ~20 minutes and turned a claim I had already shipped, closed
an issue on, and written into three files into a *better* claim with out-of-sample evidence behind
it. `git log -S` on the value being questioned is the cheapest provenance tool here — it answered
"was this co-fitted?" directly, and it handed over the old plant to test against for free.

### 2026-07-30f — #270/#271: the rest of the board now reads ARMED protection, not the setpoint table  ✅

The two follow-ups #267 spun off. Same principle throughout: **an indication shows the protection
that is in force right now**, and a blocked trip has no colour because there is nothing to hit.

**#270 — the pressure tile was worse than filed.** The issue said it "paints a low-trip red band
that is BLOCKED in Mode 5". Measured at `cold_shutdown`, holding a correct **363 psi (2.50 MPa)**:

- display window **1736–2449 psi**, so the marker sat at **−192.6 % of scale** — off the gauge;
- `normLo` clamped up to **2149** while `normHi` tracked the live setpoint at **413** — an
  **inverted** normal band. `regionAt()` returns the first region whose top exceeds the reading,
  so it fell through to the bottom TRIP region and painted a correct reading **red**, while the
  annunciator two panels away said *"Pressurizer Pressure Low — expected, plant depressurized"*.

Fixed by giving pressure the same armed-trip resolver power got: no armed low trip ⇒ the low
regions collapse, the window runs 0 → just above the control band, and the note reads
`LO TRIP BLKD` in the **status** colour rather than red (the control layer already reclassifies
those alarms to `status` when cold; a red note would contradict its own annunciator).

**Keyed on armed protection, NOT on plant mode, and that is the whole design.** A Mode 5 plant at
400 psi and a LOCA at 400 psi are the same reading and must not look alike. Measured through a
real `large_loca` from full power: `trip_blocks` stays **{}** the whole way down — 1054 psi at
10 s, 537 at 30 s, **15 psi at 60 s** — so the tile keeps the hot window and the red band, and
pegged-low-in-red is the correct LOCA reading. It was only wrong in Mode 5.

**Two bugs found underneath it, both by measuring rather than by reading the code.**

1. **`bandsFor` applied `alarmHi` but never `alarmLo`.** The only mode-aware helper that existed
   set the high side, so nothing had ever exercised the low one. My first cut collapsed `alarmLo`
   and the clamp silently kept the authored 2149 anyway — the band came out **2149..2149**, a
   zero-width normal region, and it looked plausible until printed.
2. **The clamps in `bandsFor` are one-sided and can cross a band over itself.** That is what
   produced the Mode 5 inversion. Closed centrally (`if (out.normHi < out.normLo) …`) rather than
   in each helper, since the next moving band would have hit it too. Worth noting the guard
   *masked* bug 1 into a zero-width band instead of an inverted one — a guard can hide the thing
   it is guarding against, which is why the pin asserts the band's VALUE and not just its order.

**#271 — the NIS readouts.** The startup net ladders P-10 (10 %) < IR high (~20 %) < PR low
setpoint (25 %). #267 made the PR rung visible; the other two were invisible. Source range went
amber at its 5e4 cps handoff caution and marked its **1e5 cps trip no differently**, so on the
channel whose job is to catch a missed block, the caution and the scram looked identical.
Intermediate range — the rung that actually catches you — was a plain uncoloured number.

These are `value` items, bare log-ranging numbers with no region model, so the indication is the
**colour of the number**, on the mechanism the SR readout has used since #105. Three decisions
worth keeping:

- **"Approaching" is measured in DECADES, not per cent.** On a log channel 50 % of 1.67e-3 A is
  half a decade short and reads as nowhere near. `NIS_NEAR_DECADES = 0.5`.
- **Grey when not armed.** `ir_high` blocked above P-10, or `sr_high` after the detector is
  secured (it carries `condition: 'sr_energized'`), means no live limit — colouring a defeated
  trip teaches the opposite of what the block accomplished.
- **SUR's red is not a trip.** It has no trip: 1.0 DPM is the `sur_high` alarm and 1.5 DPM is the
  rod-withdrawal *interlock*, a command block that releases below 0.8. Both read from the alarm
  and interlock tables, resolved **lazily** — `_PROT` is a `var` assigned further down the file,
  so capturing at definition time takes `undefined`, the same load-order trap `tile()` documents.

**Verification.** board_check **113 → 127**. Injection-verified both ways: restoring the
always-paint-the-red-band behaviour reddens 5 of the 8 pressure pins with the measured defect in
the output (`363 psi reads −193 %`, band `2149..2149`), and reverting IR/SUR to plain numbers
reddens 3 of the 6 NIS pins. The pins that stay green in each case are the armed-state fallbacks,
which is what makes them fallbacks rather than duplicates. `run_all` **OK, 32 runners at baseline**.

**Not done, deliberately:** no on-board numeric annotation of the NIS thresholds ("TRIP 1e5"
beside the reading). The three readouts sit in a dense NIS panel with no room, and the tiles'
note slot does not exist for `value` items. The numbers are in the inspect copy instead, which is
where a threshold you want to *read* belongs; the colour is for the threshold you need to *notice*.

### 2026-07-30e — #263 item 2 CLOSED: the swept 26 turns out to be the derived 26  ✅

**The last thing open on #263.** `pwr_startup`'s creep step was found by sweeping 22 / 26 / 30
and keeping the one that landed inside the authored 1–3 % band — refitting content until the
gate passes, the thing HR10 warns against, and I had called it out for the 1/M milestones and
not for this. Derived now, every link measured:

| link | measured |
|---|---|
| the five authored 1/M bursts, 138+90+44+22+12 | **306 steps** |
| critical position at the startup IC (683 ppm) | **319 steps** — ρ(318) = −3.1, ρ(319) = +3.5 pcm |
| ⇒ steps just to reach critical | 13 |
| power at the last plotted point (ρ = −90 pcm) | **6.25e-4 %** |
| level-off target — the point of adding heat | ≈ 1 % |
| decades to cover, log₁₀(1 / 6.25e-4) | **3.20** |
| the authored hold before the level-off drive | **600 s** |
| ⇒ the ascent must average | **0.32 DPM** |
| ρ producing 0.32 DPM (measured at a held position) | ≈ **85 pcm** |
| differential bank worth through the band | **6.70 pcm/step** (1.03 ¢) |
| ⇒ steps of excess | 85 / 6.70 ≈ **13** |
| **creep = 13 + 13** | **26 steps** |

**Confirmed at the layer the procedure actually runs at** — full stack via the new
`test/measure_stack.js`, not engine-direct (#266's lesson applied the same day it was learned):
ρ settles at **+78 pcm** after the creep against 80 engine-direct, SUR holds **0.27–0.30 DPM**
through the ascent, and the level-off lands at **1.04 %** against 1.004 % engine-direct. The
layer moves nothing here.

The sweep's rejected neighbours fail for the reason the derivation predicts rather than by
accident: **22 → 53 pcm → 0.10 %** (short of the point of adding heat), **30 → 107 pcm → 3.40 %**
(past the band). The acceptance is about ±4 steps wide. Recorded in the file: **26 is tied to the
600 s hold below it**, because what is actually fixed is decades-per-minute × minutes — move one
without the other and the derivation breaks.

**New guard, and it is the part that lasts.** `run_reactivity` **23 → 27 checks**, pinning the
four inputs the derivation stands on. Before this, nothing held them: a rod-worth retune would
have left `run_procedures_stack` green-or-not with no indication that the *published reason* for
26 had stopped being true. **Injection-verified** — a 3.2 % bump to `rod_worth_total` moves
criticality 319 → 314 and the excess 87 → 123 pcm and reddens all four. The first cut of the
differential-worth check had a ±0.15 tolerance and **the injection walked straight past it** at
6.82; tightened to ±0.05, which is honest for a deterministic static computation with no noise
in it. A guard the injection test walks past is not a guard.

**Two prose numbers checked in passing (HR12), one wrong.** The caution's *"a gentle 1 DPM ramp
means carrying ~+200 pcm"* is **right** — measured, 208.6 pcm gives 0.91 DPM at 120 s. But
*"this plant starts Mode 3 at 674 ppm … criticality near 318 steps"* was stale: the IC is
**682.9 ppm** and criticality is at **319**. 674 appeared nowhere else — not in `Manuals/09`,
not in the gated ECC table — so nothing was going to catch it. Corrected to 683 / 319, and both
now sit behind the new pins.

**#263 is fully closed.** Item 1 (owner ruling, fit the measurement) and items 3/4/6 landed
earlier; item 5 was settled by #266 on 2026-07-30d; this is item 2.

### 2026-07-30d — #266: the measurement gap did not exist; `start()` was advancing in wall time  ✅

**#266's diagnosis was wrong, and this entry is mostly the correction.** It held that a long
full-stack evolution could not be measured — "a cycle-at-a-time service loop from Node cannot
cover a 12-plant-hour ride", two attempts "exceeded ten minutes of wall clock without finishing",
one for a bounded 30-plant-minute segment — and named per-cycle overhead (snapshot construction,
instructor beats, alarm scanning) as the suspect. Its own first checkbox said **profile before
optimising**. Profiled:

| phase | share of wall clock |
|---|---|
| `engine.step` | **87.9 %** |
| `engine.getTrueState` | 7.9 % |
| `layer.stepAutomation` | 4.6 % |
| everything else (snapshot, alarms, instructor, checkpoints, broadcast) | **~5 %** |

So there is no per-cycle overhead worth optimising and **no `measure`-mode advance is needed**.
Nor is anything superlinear: six consecutive plant-hours cost 2977 / 2892 / 2863 / 2862 / 2844 /
2907 ms (last/first **0.98×**) and the checkpoint ring stays capped at 32. Acceleration barely
matters either — one plant-hour is 4.0 s at 1× and 3.1 s at 3600× — because the physics dt is
**fixed**, so you pay for sim *duration*, not tick count.

**The actual cause, measured.** `SimulationService.start()` arms `setTimeout(this.broadcastMs)`,
so it advances in **wall** time:

| drive method | 30 plant-minutes |
|---|---|
| `svc.start()` at accel 10× | **3.1 real minutes** (5.0 s of wall bought 48.0 s of sim = 9.6× real) |
| `svc.start()` after an attention stop drops accel to 1× (#245) | **31.3 real minutes** |
| `svc.tick()` / `advanceCycles()` in a loop | **~2 seconds** |

That last row is the same configuration #266 describes as impossible. The 31.3-minute row is the
reported symptom to the digit, and it is #245 again — the attention-stop dropout silently
returning acceleration to 1× — reached through a different door. `board_check.html` already
carried the warning in a comment (*"do NOT use play/pause — start() arms a real timer"*); it was
never generalised.

**Delivered: `test/measure_stack.js`.** Full stack (M4+M5+M6), CLI-driven — `--ic`, `--for`,
`--every`, `--watch`, `--accel`, `--lineup`, repeatable `--cmd='<t>:<json>'`, `--csv`. It never
calls `start()`. Three things it does deliberately:

1. **Stamps the LAYER in its own output** (#266 checkbox 4), with the lineup, the acceleration
   and the resulting protection granularity (#153). A wrong-layer figure is now visible in the
   artifact instead of found a day later in a catalog entry.
2. **Prints the SOURCE of every column** — `tavg_c` (truth) and `tavg` (the instrument) are
   different numbers and HR1 is the reason.
3. **US customary first, SI in parentheses**, applied where the numbers are produced. Deltas and
   rates (`subcooling_c`, `tavg_rate_c_per_hr`, `subcooling_margin`) convert ×9/5 with no offset.

An unknown `--option` or an unresolvable `--watch` field is a **hard error**. First cut accepted
`--wach=tavg_c` silently and ran the default field set — a table that looks entirely correct is
the exact failure this harness exists to stop.

**Used it to settle #263 item 5 / #266's second named defect.** `pwr_mode5_to_mode3`'s milestone
table was published engine-direct on a mission that runs full-stack, and the header said the
timings "may differ modestly… **this was NOT measured**". Run both ways with the same two
commands:

|  | engine-direct | full stack | delta |
|---|---|---|---|
| Mode 4 | 0.27 plant-h | 0.27 plant-h | **0.00 h** |
| Mode 3 | 4.57 | 4.57 | 0.00 h |
| 450 °F (232.2 °C) | 7.63 | 7.63 | 0.00 h |
| 545 °F (285.0 °C) | 10.61 | 10.61 | 0.00 h |
| 566 °F (296.7 °C) | 11.28 | 11.28 | 0.00 h |

Identical to every digit, and so is every state value at 12 plant-hours. The worry was `feed_sg`
replacing the engine's coupled-feed fallback; measured, feed flow ends at 0.0053 normalized either
way, because a subcritical plant on pump heat barely boils and both feed paths sit at the same
near-zero demand. **The layer was not the problem on this one — but the header was stale anyway**:
it read ρ = −3377 pcm on 907 ppm, and the plant is now at **−2828 pcm on 856.8 ppm**, because
#263's refit landed the day after the header was written. Both corrected in the file.

**Two things worth carrying forward.**

- **A performance claim is a plant-dynamics claim's poor cousin, and HR12 should have caught it.**
  "Ten minutes without finishing" was written down as a property of the *system* when it was a
  property of *how it was driven*, and it then propagated into a scenario header telling the next
  agent not to bother. One profile would have shown 87.9 % engine.step.
- **The incentive #266 named was real even though its diagnosis was not.** Reaching for
  engine-direct because it finishes is what produced PI-9's 13× error. That incentive is now gone
  for a different reason than the issue proposed: the correct measurement finishes in 35 seconds.

### 2026-07-30c — #267: the power gauge advertised a trip five times higher than the armed one  ✅

**The defect.** `power_range high` carries **two** reactor trips: the 120 % backstop and
`pr_low_setpoint` at **25 %** — the at-power half of the startup net, blockable only above the
P-10 permissive at 10 %. The board's vital tile resolved its red band with
`tripSp('power_range','high')`, which returns the **first match in table order**, and the table
authors the backstop first. So the tile read **120 %** in every plant state.

**Measured, not reasoned** (engine+M4 from `5_percent`, trip logic driven on the instrument the
trip actually reads):

| `pr_low_setpoint` | `power_range` | result |
|---|---|---|
| armed | 26 % | **scram** (`power_range high`) |
| armed | 24 % | no trip |
| blocked | 26 % | no trip |
| blocked | 121 % | scram |

`pr_low_setpoint` is armed at **`hot_zero_power`, `5_percent` and `cold_shutdown`** — i.e. every
initial condition a startup begins from. The operator climbing out of Mode 3 therefore read green
across the whole meter up to a scram at a fifth of the indicated limit.

**The fix.** `powerBand()` in `pwr_board_wiring.js` resolves the **most limiting ARMED** trip per
snapshot — blocked trips excluded, read from `rps_state.trip_blocks`. Armed, the tile lays out the
ladder the plant enforces: **green to P-10 (10 %) · amber 10 → 25 % · red above**, window
0–131.9 % → **0–27.5 %** so a low-power ascent is legible on a linear meter at all. The amber band
is not decoration — its width *is* the operator's blocking window. A red `TRIP 25%` note in the
tile's label row names the limit, because a coloured region cannot say *which* trip. Blocked, the
tile is byte-identical to before (green 0–100, grey 100–108, amber 108–120, red 120+, no note).
Rendered band rects were read out of the live DOM rather than eyeballed.

**Three things worth carrying forward.**

1. **`tripSp()` is order-dependent and was being used on a parameter with two trips.** Added
   `tripBackstop()` (least-limiting, order-independent) for the static base and pinned it, so
   re-authoring the protection table cannot silently move a tile's band again. Worth grepping for
   other `tripSp` callers on multi-trip parameters — `primary_pressure low` has two
   (`lo_press` 12.41, `si_trip` 12.4) and is **not** yet on the live resolver (see backlog).
2. **A band is dropped only when the trip is BLOCKED, never when a `condition` is merely unmet.**
   Conditions (`above_p9`, `sr_energized`) flip on their own within seconds; a block is a
   deliberate, recorded state. The conservative rule can only ever *add* warning regions.
3. **No `rps_state` ⇒ authored bands.** Reading "nothing is blocked" out of an absent snapshot
   section would peg a full-power plant against a 27 % scale. Pinned.

**Verification.** `board_check` **106 → 113**, and the 7 new pins were **verified by injection** —
with `powerBand()` stubbed to `return null`, exactly the 3 discriminating pins go red reporting the
old values (`120/108/100`, window `131.9`, note `""`) while the 3 fallback pins and the backstop
pin stay green, which is what makes them fallbacks rather than duplicates. `run_all` **OK, 32
runners at baseline**. Also corrected the tile's inspect copy, which claimed "Reads 0–200 % on
purpose" — that is the **instrument's** range (so `crossed()` can fire at 120, see Part 1), never
the tile's, which was 0–131.9.

**Still open:** the pressure tile has the same shape of bug in Mode 5 — `lo_press` and `si_trip`
are both blocked at a depressurized init, yet the tile still paints its 12.41 MPa (1800 psi) red
band, so a cold plant held at 400 psi reads pegged in the red against a trip that is not armed.
Deliberately **not** changed here: unlike power it also needs the `normLo`-vs-`alarmLo` clamp
revisited or the green band lands in the wrong place. Filed as a follow-up on #267.

### 2026-07-30b — the manual's revision history had stopped being written  ✅

**Found by asking "are the manuals up to date?" and checking instead of answering.** Content was
fine — pack in sync, `run_manual_units` 0 failed, `run_procdocs` 23/23, `run_checklist` 24/24,
and a full currency audit against the as-built sim as recently as Rev 6. The **revision history**
was not.

**Six content changes had landed with no row in the table**, spanning two weeks and 207 inserted
lines across five files: **#247** and **#248** (the low-flow trip reading an instrument, setpoint
25 % → 90 %), **#251** (pump-heat heatup — which *re-authored* 04 and 05), **#260** twice (the
density-shaped moderator coefficient, then a new 09 §7.5 ECC table), the **gpm display-scale**
fix, and **#263** (the second reactivity anchor). Operator-facing numbers — heatup timings, trip
setpoints, critical boron — all changed, with the one document whose entire job is to say what
changed silent about every one of them.

**And the per-document stamps were worse than silent, they were false.** Ten of thirteen chapters
read `**Revision:** 0`, including `12_SIM_PHYSICS.md` — *created* at Rev 5 and edited three times
since. `README.md` read `Revision: 2, 2026-07-16`: six revisions and two weeks behind.

**A contributing cause worth naming: the table had no top.** Rows 0–3 sat **ascending** above a
**descending** 4–8, so "add a row at the top" was genuinely ambiguous. Now strictly newest-first
(13 → 0) with the convention stated in the file.

**What was built.**
- **Revs 9–13 written**, reconstructed from `git log` — one row per change-set, each naming the
  sections touched and the numbers that moved.
- **The revision is now SET-WIDE**: one number, carried by all 13 documents. I had recommended
  *deleting* the per-chapter stamps; I changed my mind on implementing it — a set-wide number that
  is mechanically checked keeps the commercial format the set is emulating, and the tool removes
  the friction that made thirteen hand-maintained stamps rot in the first place.
- **`tools/stamp_manual_revision.js`** — propagates the newest row's number into every chapter and
  `README.md`, and re-seals per-chapter **content digests**. Deliberately NOT wired into
  `pack_manuals`: a pack happens often and would silently absorb the very change the digest exists
  to catch.
- **`test/run_manual_rev.js`** — 12 checks. Table well-formed, strictly newest-first, no
  duplicate/missing revs, dates non-decreasing; every document and `README` stamped at the newest
  rev; the `Set revision` header agrees; digests sealed; and the **packed in-app copy** carries it
  (a revision recorded but not packed is invisible in the product).

**Negative-tested, all five redden** — the gate was not trusted on a green:

| injected fault | |
|---|---|
| chapter prose edited, no rev row | **REDDENS** |
| chapter stamp left behind at an old rev | **REDDENS** |
| table returned to ascending order | **REDDENS** |
| README date stale | **REDDENS** |
| packed copy not refreshed | **REDDENS** |

The first is the load-bearing one — it is the failure that actually happened, and the only check
here that catches it. The other four catch bookkeeping that disagrees with itself: necessary, but
a set can be perfectly self-consistent and still describe last week's plant. **What the gate
cannot check is whether a row's prose is TRUE** — a row can be well-formed, stamped, sealed and
still describe the change wrongly. Same class as HR10/HR12, and the runner header says so rather
than leaving a reader to assume green means accurate.

**One implementation of the digest, shared.** The gate does not re-implement it — it spawns the
tool with `--check`, so the sealing and checking logic cannot drift apart. That drift is exactly
what this whole entry is about.

Gates: `run_manual_rev` **12 checks / 0 failed** (new, baselined — its checks are structural, so
unlike `run_manual_units` the count does not move on prose), `run_all` **32 runners**.

**LESSON, and it cost real risk: `git status` shows ONE `M` per file, no matter how many authors
wrote it.** This work was started in the primary tree while another session was live in it. When I
moved to `workbench` I captured my changes with `git diff -- Manuals/ ui/manual_md.js` — and
`Manuals/09` and `Manuals/12` were carrying **their** in-flight #263-item-1 edits (a new
2026-07-30 owner ruling, a −26.8 pcm/°C refit, a regenerated ECC table) *underneath* my one-line
`**Revision:**` stamp. A single `M` per file, two authors, and I had checked occupancy by reading
the file list — which cannot distinguish them. My `git checkout -- Manuals/` then discarded their
copy; they had re-made it by the time I looked, so nothing was lost, but that was luck, not
process.

The tell was a **red gate, not the file list**: `run_reactivity` failed in `workbench` because
their new ECC table was being checked against `pwr_config.js` *without* their matching refit, which
had stayed behind in the other tree. `run_hardrules` also drifted 24 → 25 on their ruling quote.
Both cleared the moment their content was reverted out of my copy — which is also how I confirmed
neither drift was mine.

**So: when you must lift work out of a shared tree, diff by HUNK and attribute each one, do not
`git diff` a directory.** And treat an unexplained red in the destination lane as a provenance
question before treating it as a defect. Their refit supersedes the 2026-07-21 −20 pcm/°C ruling
that Rev 13's row still cites as current; **that is correct for the committed state at 07381d1**,
and their change will need its own **Rev 14** row when it lands — which the digest check will now
insist on.

---

### 2026-07-30a — the manual quoted a charging/letdown gpm the board never showed  ✅

**Found by pulling on the loose end of 2026-07-29n.** There are two places a normalized CVCS
flow becomes gpm, and they disagreed by exactly 1.5×:

| | charging (0.06 normalized) | letdown orifice A (0.030) | gpm per normalized unit |
|---|---|---|---|
| `pwr_config.js` `identity` block — **documentation, 0 code consumers** | 40 | 20 | 666.7 |
| `pwr_board_wiring.js` `GPM_CHARGING`/`GPM_LETDOWN` — **LIVE, what the player reads** | **60** | **30** | 1000 |

`Manuals/12` §Fidelity quoted the *dead* block, so the in-app manual said 40 gpm charging while
the board's charging box tops out at **60** and its orifice-A letdown readout shows **30**. A
number the player can read in two places disagreed with itself, and nothing compared them.

**Scope, measured before deciding — narrower than it first looked.** Only those two conflict.
**AFW agrees** (config 100 gpm vs board `0.15 × GPM_AFW 640 = 96`). **RCS flow does not
conflict**: the board renders it as % of rated (since #247), so the config's 24 000 gpm is never
displayed. And a regex sweep of `Manuals/*.md` + `ui/manual_procedures.js` found **no procedure
step that instructs a charging gpm value**, so no authored content depended on either number.

**Fixed toward the BOARD**, on three grounds: the live value beats a dead one when they
disagree; the board's convention is coherent (`GPM_CHARGING = GPM_LETDOWN = GPM_FEED = 1000`, one
full-scale across CVCS and feed) where 666.7 has no stated rationale; and 60 gpm sits inside the
real normal-charging band (~40–90 gpm) where 40 sits at its floor — *that last point is recall,
not an evidence pass, and was used only as a tiebreaker.* Nothing the player sees moved, so
`verify_e2e_ui` and the board could not shift.

**The guard is the point, not the two numbers.** A doc block that must be hand-synced with a live
constant is precisely what drifted, and it is the same failure as #261 — prose cannot be
contradicted. `test/run_manual_units.js` now cross-checks `pwr_board_wiring.js` against the
config block and against `Manuals/12` §Fidelity. **Negative-tested on five failure modes, all
redden:** config charging reverted to 40; config letdown reverted to 20; the manual saying 40;
the board's two full-scales made to differ; and a board constant *renamed* (the read fails
loudly rather than silently skipping). It lives in the units gate because that is what it is —
the manual quoting a number the plant does not display — and that gate is scored on failures
only, so it shifts no baseline.

**Not a fidelity defect, and the manual now says so out loud.** These gpm are pacing flavour:
60 gpm ≡ `charging_max · cvcs_inventory_gain` = 7.2e-4 inventory-frac/s implies a total RCS of
~1389 gal (5.3 m³), roughly 6× small for a 300 MWt plant, and accident flows deliberately run on
a separate 1:1 scale — so **no single RCS volume reconciles them.** `Manuals/12` already classed
the conversions as "Indicative … Illustrative"; it now also states that comparing them with
real-plant flows or Tech Spec leakage limits is a category error rather than a gap to close,
because I made exactly that comparison in #262 with the old wording in front of me.

Gates: `run_manual_units` 0 failed (251 pairs), `run_all` **31 runners at baseline**. Manuals
repacked (`tools/pack_manuals.js`) so the in-app copy carries both numbers.

### 2026-07-29n — #261: the cycles-as-seconds trap, swept  ✅

Follow-up to 2026-07-29m. `advanceCycles(n)` advances **broadcast cycles**, not seconds, and
the sim time a cycle buys is **not even constant within one run** — `_updateCadence` halves
`broadcastMs` (100 → 50 ms) on a transient, so a cycle goes from 0.1 s to 0.05 s at 1×.

**The sweep — measured, and smaller than feared.** Seven harnesses call `advanceCycles`. Five
were already correct and one was already fixed:

| harness | how it drives | verdict |
|---|---|---|
| `run_campaign` | `settle(s, secs)` / `runUntil(…, simBudget)` on `s.simTime` | correct |
| `run_scenarios` | `start = s.simTime` | correct |
| `run_m5` | computes `dtCycle = s.broadcastMs / 1000` explicitly | correct — and the only file that already knew |
| `run_m6`, `run_m6ph` | small bare cycle counts, no duration claimed | fine |
| `run_e2e_controls` | `step(s, n)` | **was the #194 defect**; fixed |
| `run_autoctl` | `run(simSeconds)` looping `simSeconds` cycles | **wrong — measured below** |

**`run_autoctl` was delivering 91.7 % of the sim time it asked for.** Its `run(simSeconds)`
looped one cycle per requested second. Instrumented across the whole suite: **226 calls, 8565 s
requested, 7858.0 s actually elapsed (ratio 0.9175 — an 8.3 % AGGREGATE shortfall). 15 of 226
calls (6.6 %) under-delivered, 211 were exact, and ZERO over-delivered. Worst single call:
15.50 s against a requested 30 s, ratio 0.517** — off by 2×, not by 8 %. Every shortfall lands
inside a transient, which is precisely what the automation probes exist to watch. Same failure
shape as **#245** (a gate silently running below its declared sim rate), reached through the
*cadence* rather than the *acceleration*.

**Be fair to the comment that was there — this is subtler than "nobody checked."** It read,
verbatim: `// ~1 s sim per cycle at 10× (transient cadence shortens a cycle; overshoot is fine)`.
The author **named the exact mechanism.** What failed was the *sizing*, and the direction of the
reassurance: "overshoot is fine" is about `Math.ceil` overshooting the cycle *count*, which
delivers **more** sim time — and measured, nothing ever over-delivered. So the note disclosed the
real risk and then waved off its opposite, leaving a 2× undershoot reading as a rounding detail.
An earlier draft of this entry, and the first #261 close comment, quoted only the "~1 s per cycle
at 10×" half and made the author look unaware when they were not — corrected here and on the
issue. **The lesson is therefore NOT "write the assumption down": that was done, and the
mechanism was named correctly. It is that prose cannot be contradicted — assert the invariant in
code, because a correctly-identified mechanism can still be mis-sized and nothing will object.**

Fixed to drive on `service.simTime`. **`run_autoctl` stays 20/20 with the full budget** — so,
unlike #245, none of these probes had been passing *because* they were starved. That is the
result worth recording: the bug was real, and it happened not to have bought any false greens.

**Follow-up, 2026-07-30: was `run_autoctl` 20/20 actually MEANINGFUL after the fix?** The first
write-up rested that on "still 20/20", which is the weak form of the claim (HR10). Verified
properly by dumping every check's *observed value* under old and new timing and diffing:

- **13 of 20 suites were starved**, not the "12 calls" first reported — worst `PWR · rod channel
  disengages itself on scram` at **ratio 0.517** (30 s asked, 15.50 s delivered), then `RBMK · AR
  defaults to AUTO` 0.600 and the `HR1 probe` 0.625. New aggregate ratio is **1.0002**.
- **No suite changed verdict**, and nearly every physics observation moved **< 1 %**. Two moved
  *toward* their setpoint (BWR vessel level 48.0 → 50.0 and 51.3 → 49.9), i.e. the longer run is
  the kinder one. So nothing was passing *because* it was starved — the original claim survives,
  now on evidence rather than on a tally.
- **One check was window-dependent and its margin nearly halved.** `BWR · all-auto holds full
  power` "sparse commands" went **273 → 363** against a `<500` limit — margin 45.4 % → 27.4 % —
  while the underlying *rate* did not move at all (0.606 → 0.605 cmd/s). Channel output is
  period/deadband gated, so a raw command count is a rate in disguise; the suite is named
  "(10 min)" and had been running 7.5 min. Not a false green, but the one assertion here that a
  pure timing change could redden with no controller change. **Fixed:** both sparseness checks now
  assert **commands per sim-minute** (`autoCmdRate`), thresholds being the old ones divided by
  their 600 s window — identical meaning at 10 min, indifferent to the window. PWR 3.0/min against
  `<30`, BWR 36.3/min against `<50`.

**Two inherited claims from the 2026-07-29n write-up, checked rather than repeated.**
- *"Same failure shape as #245, four filings"* — **verified, and not from CLAUDE.md.**
  `run_procedures_stack.js` itself annotates all four as removed with the #245 fix:
  `rbmk_pre·rbmk_mcp_trip` and `rbmk_post·rbmk_mcp_trip` step 2, `bwr·bwr_sbo_rcic` step 3,
  `bwr·bwr_startup` step 2. #245's *body* says "at least one" only because it was written before
  the fix cleared the other three.
- *"≈ 33 gpm held, 40 gpm authority"* — **provenance fine, my USE of it was not.** The mapping is
  declared config data (`pwr_config.js` plant block: `charging_max_gpm: 40`,
  `letdown_normal_gpm: 20`), explicitly labelled *"Display conversions … (manual/UI flavor,
  [tune])"*, with **zero consumers in code**, and `Manuals/12` §Fidelity already classes the gpm
  conversions as *"Indicative — display flavour … Illustrative"*. But they do **not** reconcile
  with the mass balance: 40 gpm ≡ 7.2e-4 inventory-frac/s implies a total RCS of **926 gallons
  (3.50 m³)** — about 10× small for a 300 MWt plant, giving a 2.3 s loop transit against a real
  ~10 s. At a plausible 35 m³ the same 7.2e-4 frac/s would be ~400 gpm, not 40. **So gpm figures
  here are pacing flavour and must not be compared to a real Tech Spec leakage band** — which is
  what #262's framing did; corrected there. `cvcs_inventory_gain` is `[tune]`, sized for feel, and
  says so; the repo is internally honest, the error was downstream in my prose.

**Also done.** `advanceCycles` now carries the warning at its definition
(`layers/simulation_service.js`) with both worked cases; `run_e2e_controls`'s `step()` is
renamed **`cycles()`** (the lying name was the root cause — `step(s, 400)` reads as seconds)
with a new `secs()` beside it, and its own windows now pass **sim seconds** rather than cycle
counts. Same 39/39, same measured numbers, honest units.

**One thing to know if you touch this:** renaming `step` → `cycles` collided with a `cycles`
parameter inside `sgtrRun`, which shadowed the helper and threw immediately. Caught by the
runner, not by review — the rename is mechanical but not free.

Gates: `run_e2e_controls` **39/39**, `run_autoctl` **20/20**, `run_all` **31 runners at
baseline**. No plant code changed.

---

### 2026-07-29m — #194: CVCS holds leaks fine; the measurement counted cycles as seconds  ✅

**Disposition: NOT A DEFECT. No plant code changed.** #194 reported that CVCS make-up covers a
constant ~24 % of any leak, so "inventory never stabilises for any leak size, however small —
there is no leak this plant's CVCS can actually hold." The owner ruled it an artifact on
2026-07-25 and reclassified `type-decision` → `type-tuning`, directing: *"make CVCS able to
hold a small identified leak in equilibrium, as a real charging system does — more proportional
gain, or a slow integral term."* **Measurement says it already does, and did all along.** The
retune was not performed; adding integral action would have deleted the droop cue the same
ruling said to preserve.

**The error.** `run_e2e_controls`'s `step(t, n)` helper advances **broadcast cycles**, not
seconds. One cycle is 0.1 s of sim time (`NORMAL_MS` 100 ms ÷ `PHYSICS_DT` 0.02 = 5 physics
steps). So the issue's `step(t, 400)` window — labelled "400 s" in the issue body *and*
throughout the comment block in the test file — is **40 s**. The CVCS level loop's time
constant is 83 s. Every number in #194 was read at **0.48 τ**, before the servo had meaningfully
responded.

**Measured (full stack, `hot_full_power`, letdown shut, CVCS AUTO, SGTR injected, seed 42;
plant unchanged from the tree that produced the original table).**

| leak (frac/s) | % of CVCS authority | coverage @40 s | coverage @400 s | inventory parks at | pzr level droop |
|---|---|---|---|---|---|
| 1.49e-5 | 2 % | 25.6 % | ~90 %¹ | 99.87 % | 0.13 % |
| 5.98e-5 | 8 % | 23.8 % | **97.0 %** | 99.50 % | 0.51 % |
| 2.39e-4 | 33 % | 26.0 % | **99.2 %** | 98.01 % | 2.05 % |
| 5.98e-4 | 83 % | 26.4 % | **99.7 %** | 95.02 % | 5.13 % |
| 6.62e-4 | 92 % | 32.8 % | 80.3 % | **never — saturated** | runs away |

¹ the 2 %-authority case bounces 83–101 % between sampling windows: the leak signal is below
the pzr-level instrument's noise floor. Inventory is dead flat from 220 s, so it *is* held —
the coverage ratio is just a noisy way to read it at that size.

Inventory drift over a 12 s window at equilibrium is ≤ 0.004 %, held out to 3020 s of sim time.

**Why coverage looked constant.** The loop is **linear**, so at any fixed time every leak sits
at the same *fraction* of its own approach to equilibrium. "~24 % for every severity" was not
evidence of a droop artifact — it was evidence of linearity, misread. A P-only servo has a
steady-state *offset*, not a permanent *shortfall*: it charges until the level error commands
make-up equal to the leak, then parks.

**The equilibrium is derivable from config, and matches to two decimals.** With letdown shut,
`dm/dt = charging·gain − leak`, `charging = charge_per_level·err`, `err = level_per_mass·deficit`:

```
deficit*   = leak / (gain · charge_per_level · level_per_mass)
droop*     = leak / (gain · charge_per_level)          [% of level]
loop tau   = 1 / (gain · charge_per_level · level_per_mass)  = 83 s
```

Predicted vs measured parked inventory: **99.00 / 99.00** and **98.01 / 98.01**. The
`pwr_config.js` comment that quantifies the droop ("a 2.4e-4 leak → ~2 %, visible but **held**")
was correct and already said so. Nothing in the engine or config needed touching.

**CVCS authority is `charging_max · gain` = 7.2e-4 frac/s**, ≈ 40 gpm on the orifice-A gauge
scale (0.030 ≡ 20 gpm). It holds anything up to ~83 % of that (≈ 33 gpm) with the level parked
5.1 % low; past ~92 % the pump saturates and the plant is genuinely lost. So the teaching
property #194 wanted stated — "you cannot charge your way out of a *big* leak" — is real, and
it coexists with "a small identified leak is made up," which is what a real charging system
does. *(Not evidence-passed against a specific plant's charging capacity — the 40 gpm figure is
this sim's own gauge scale, not a sourced prototypicality claim.)*

**The gate check was inverted (HR10).** `run_e2e_controls` asserted *"CVCS covers a consistent
fraction of the leak, not all of it (droop)"* — coverage equal across leak sizes and inside
10–50 %. Written from the 40 s observation, it pinned a transient as a steady-state property.
Negative control, weakening `cvcs_charge_per_level` 10× (τ 83 s → 833 s) to build the plant
#194 actually described:

| | healthy plant (unchanged) | servo weakened 10× |
|---|---|---|
| the 4 new equilibrium checks | **all pass** | **3 of 4 fail** |
| the old droop check | **FAILS** | **PASSES** |

The old check was **blind to the exact defect it was worded to describe**, and red on the plant
that behaves correctly. Replaced with five checks measured at 4000 cycles (400 s ≈ 4.8 τ):
convergence to 95–105 % coverage; inventory parked (|drift| < 0.02 %/12 s); parked inventory
within 0.1 % of the **config-derived** equilibrium above; the droop cue surviving (a held leak
still parks level below program, and 2× the leak parks it 2× lower); and a leak beyond
`charging_max` explicitly *not* held. Because no plant code moved, these pass on the
pre-existing behaviour — they are not refits. `run_e2e_controls` **35/35 → 39/39**, runtime
1.2 s → 2.5 s.

**Lessons.**
- **`step(n)` / `advanceCycles(n)` is CYCLES — 0.1 s each, or 0.05 s once the service drops to
  `TRANSIENT_MS`.** Any harness comment that says "the N s window" while passing N to `step()`
  is off by 10×. This one slip produced a filed issue, a cross-referenced gate rewrite, an
  owner ruling, and a directive to retune a healthy system. Filed separately.
- **Assert equilibria against the config-derived law, not a recorded run.** The derived form
  caught this immediately; the observed form had enshrined the artifact.
- **A control-loop assertion must state its window in time constants.** "400 cycles" means
  nothing; "0.48 τ" would have stopped this at the first reading.

---

### 2026-07-30a — #263: the second anchor, and it proved #260's crossover wrong  ✅

**Why this exists.** #260 left the critical-boron curve **fit at one temperature and
validated at none**, and took its boron crossover from WTSM 2.1's *text* ("approximately
1400 ppm") over WTSM 2.1's own *figure* (~944). I filed #263 against my own work saying
so. The owner asked for the second anchor to be found.

**The anchor.** BEAVRS / Watts Bar U1 Cycle 1 HZP physics tests, Table IV of the
Polaris-PARCS benchmark (OSTI 1991715) — **measured** isothermal temperature coefficients
at three boron concentrations: **975 ppm/−1.75, 902/−4.65, 810/−8.01 pcm/°F**. Three
points, not the one asked for, fitting a line to within **0.09 pcm/°F**. Removing alpha_D
puts the MTC zero crossing at **986 ppm**. **The figure was right and the text was wrong**,
and #260 was **4.3× too negative** at ARO (−7.52 against a measured −1.75) with the error
shrinking as boron fell — the fingerprint of exactly that parameter being off.

**The ruling** *(OWNER RULING, 2026-07-30: "for 263 item 1 fit the measurement.")*. Both
parameters least-squares fitted: `mod_anchor_pcm_per_f` −23.48 → **−31.43**,
`mod_boron_zero_ppm` 1400 → **986**, `rho_excess` → **0.087544**. Fitting both independently
**re-derived the 985.8 ppm crossover the earlier one-parameter fit had assumed** — two
different fits of the same data agreeing on a parameter neither was forced to.

**What it cost.** The at-power coefficient is **−26.8 pcm/°C, superseding the 2026-07-21
ruling of −20**. Recorded as a supersession in the config, the gate and `Manuals/09` §7.5
rather than overwritten, and the gate pins the new value so it cannot drift back. The
gate's residual tolerances **tightened** 1.4/2.2 → 0.3: the declared departure is gone, so
it no longer permits one.

**Three consequences, each traced rather than tuned away.**

1. **`run_pwr` 201 → 202.** `control_response`'s "power rises on withdraw" carried a 0.05
   floor sized for a −20 pcm/°C plant; at −26.8 the settled rise is ~0.03 %. Its own
   comment said *"direction is the physics being pinned, not magnitude"*, so lowering the
   floor would just need lowering again next retune — a check tracking the plant instead of
   the claim. At power the turbine sets power and the rods set temperature, so **Tavg
   rising** is the signature that *strengthens* as the coefficient does. Added; it holds on
   the pre-#263 plant too, so it is a better test, not a refit.
2. **`run_campaign`: the startup-challenge runaway stop point 1 % → 2 %.** Diagnosed as
   **magnitude** by first ruling out timing — extending the coast window reached an
   endpoint, just the *wrong* one ("Window Closed" not "Band Overshot"). A stronger
   coefficient banks more of the withdrawal into temperature. The lesson is unchanged; you
   must bank more of it, and 2 % would have overshot on the old plant too.
3. **`pwr_heatup` dilution re-derived from the ECC table, not swept.** Mode 5 IC 857 ppm,
   §7.5 gives 723 ppm critical at the bank's 366 steps → 134 ppm over 3900 s = −0.0344, and
   the plant landed on exactly **ρ = −4 pcm**. That table has now predicted the plant twice,
   independently of the gate that checks the two against each other. Shipped **−0.039** for
   arrival margin (the derived rate is the *equilibrium* boron, so the plant only
   asymptotes toward the band).

**The other #263 items.** HFP boron 618 ppm is **derived, not fitted** — from the measured
975 anchor: Doppler −990, moderator, bank −76, xenon −2500 → 604 against the engine's 618,
the residual being the moderator term linearised over that boron change; the gap to the
real 750 ppm comparable is dominated by our **xenon worth, a `[tune]` value**. The #261
`simulation_service.js` change is comment-only and correct. One **vacuous negative
assertion** was found and deleted (`!/The full experience/`, on a phrase a site rewrite had
removed, so it could never fail) — the audit that found it was 3-for-4 false positives, so
it is a technique worth keeping and not worth gating.

**Two self-inflicted faults, both caught only by the gate, both recorded because catching
them is not the same as me catching them.** (1) I wrote `the step's window` into a
**single-quoted JS string** in `ui/manual_procedures.js`; the ASCII apostrophe terminated
it and eleven runners died at 0.1 s — drifts that looked like a physics catastrophe and
were a syntax error. `node -e "require(...)"` takes a second. (2) Before that, my
`Manuals/09` and `Manuals/12` edits were **reverted on disk after I reported them done**;
`git diff` showed the files clean. Both have one shape: reporting work complete without
verifying it landed.

**Gates.** `run_all` **OK, 31 runners at baseline**. `run_hardrules` 24 → 25 (the new dated
ruling quote, which is what its HR11 half counts).

**Still open.** `pwr_startup` step 11 (26 steps) remains empirical rather than derived, and
the full-stack measurement tooling gap is **#266** — filed because two of the four defects
in this whole effort came from numbers measured at the wrong layer.

### 2026-07-29l — #260: the moderator coefficient is density-shaped, and the rod worths are real  ✅

**How it was found.** Owner, free play, Mode 5 → Mode 1. Plant up to 2235 psi (15.41 MPa) and
274 °F (134.4 °C); diluted toward 600 ppm; the source range climbed away and ended in a high
source-range flux trip. Owner's read: *"in this region there is too much reactivity (−60 pcm)
with a low amount of boron. When doing mode 3 → mode 1 with 567 °F and 363 ppm it does not do
this, reactivity is about −1000 pcm."* **The trip was correct protective action.** The defect
was why 600 ppm was critical at 274 °F.

**Measured, before (clean `develop` 0f3a015).** Critical boron with the control bank inserted:
819 ppm at 122 °F, **629 at 274 °F**, 426 at 437 °F, 263 at 567 °F. `alpha_MTC` was one
constant, −11.11 pcm/°F, applied over the whole range — a **−4944 pcm** moderator defect
across the heatup, 494 ppm of dilution, a third of it charged below 274 °F.

**The evidence pass.** WTSM 2.1 (ML11223A207) §2.1.6.2 / Fig 2.1-8: *"Moderator density changes
are not linear. At high temperatures an increase in the moderator temperature causes a larger
reduction in density than an identical increase at low moderator temperatures"*; the 0 ppm curve
reads −17 pcm/°F at 500 °F; the 500 ppm curve −8 pcm/°F there; and *"At boric acid
concentrations greater than approximately 1400 ppm, the MTC is positive."* Modelled on a
density-shaped curve anchored to those, the real defect at 919 ppm over the same heatup is
**−133 to −1692 pcm** — 3× to 37× smaller than ours — and almost none of it below 274 °F.

**The source disagrees with itself, and that is recorded rather than smoothed over.** The
500 ppm / −8 pcm figure reading implies MTC = 0 at ~944 ppm; the text says ~1400 ppm. We took
**1400** — an explicit statement beats a figure reading — and the residual is that we give
−10.9 pcm/°F at 500 °F/500 ppm where the figure reads −8.

**The fix** *(OWNER RULING, 2026-07-29: "do the full reactivity calibration for fidelity. I dont
want to have to fix things twice.")*. `alpha_MTC` deleted; moderator reactivity is now
`C_mod · (1 − B/1400) · (d(T) − d(T_ref))` with *d* = relative water density (cubic fit to
IAPWS-IF97 at 2248 psi / 15.5 MPa, max residual 3.1 kg/m³). **It stays linear in boron**, so
`_trimToCritical` remains a closed-form solve — no iteration. Rod worths to WTSM 2.2
(ML11216A051) Table 2.2-1: control 8500 → **4068**, shutdown 10 000 → **3676** (all RCCAs 7744;
BEAVRS cross-check, all banks 6466). `rho_excess` 0.10 → **0.086776**, **solved** — it has no
direct observable — so HZP ARO critical boron lands on the measured **975 ppm** (BEAVRS / Watts
Bar U1 Cycle 1). Supersedes #238.

**Three things worth knowing.**

1. **The owner's 2026-07-21 `alpha_MTC` ruling survives.** The sourced curve gives −21.9 pcm/°C
   at the operating point against the ruled −20.0 — within 9 %. That ruling was right *at
   power*; it was only wrong extrapolated to cold. That agreement is the strongest evidence the
   shape is correct, and it is why every at-power gate held.
2. **Two properties fell out unfitted.** Differential boron worth is now larger cold
   (13.8 pcm/ppm at 122 °F vs 10.0 at power) — denser water, more boron atoms per cm³. And
   critical boron went nearly flat: **834 → 575 ppm** rods-in, **1130 → 975** ARO, spread
   556 → 259 ppm. Boron is now held through the heatup and diluted hot, which is real practice.
3. **The event now reads correctly, not "better".** 600 ppm at 274 °F is **+2434 pcm
   SUPERcritical**, because critical boron there is 787 ppm and cold water *should* be more
   reactive. What changed is that the Mode 5 IC starts at 907 ppm, so a dilution toward 600
   crosses the line early and visibly instead of 600 looking like a safe waypoint between 919
   and 263. **I told the owner the opposite first** — an earlier estimate that pinned the hot
   end at the old 263 ppm said 600 ppm would be subcritical. That was wrong and was corrected.

**Content re-authored (HR9).** `pwr_startup`: 1/M bursts 120/50/30/15/8 → **138/90/44/22/12**
(criticality moved from step 224 to **318**, solved and confirmed at 321); final approach
11/−6/16 → 26/−8/22. It now goes critical at step 11, levels at **1.01 %** against the authored
"1–3 %" target, crosses to 10.9 %, grid on at 11.2 MWe. `pwr_heatup`: the authored dilution
drove a **runaway to 119 % power and 638 °F** — −0.12 → **−0.055 ppm/s**, now landing 569 °F
at 5–7 %. **Consequence:** the gentler ride no longer reaches the 20 %/25 % startup trips, so
those blocking steps are **precautionary now, not load-bearing** — kept, with the measured rates
that do reach them written into the caution. Source-range milestones re-derived from measurement
(620/1000/1800/3300/6200 → 550/850/1400/2250/3500); **that is the one assertion moved to match
the plant, and it is called out rather than buried.**

**Lesson worth keeping — I shipped a gate that passed for the wrong reason.** The first cut of
`run_reactivity.js` asserted the owner's event as *"600 ppm at 274 °F is comfortably
subcritical"* and computed `(600 − Bcrit)·worth`, reporting −2434 pcm. The sign is backwards:
ρ = (Bcrit − B)·worth. It went green and would have written a false claim into the guard for
the very thing the change was about. Caught only by comparing it against the earlier
hand-measurement. **A green check is not evidence the check is right** — HR10 applies to the
gates I write, not just the ones I inherit.

**New guard.** `test/run_reactivity.js`, 13 checks: the −17 pcm/°F anchor, the 1400 ppm
crossover, monotonic steepening with temperature, near-zero cold MTC, the three rod worths, HZP
ARO 975 ppm, monotonic critical boron on cooldown, and the Mode 5 IC sitting above cold critical
boron. `rho_excess` is solved, so this is what goes red if `alpha_D`, a rod worth or
`boron_worth_per_ppm` moves without a re-solve.

**Gates.** `run_all` **OK, 31 runners at baseline**. `run_campaign` held **51/51 (3026 checks)**
through a change that moved every boron number and both rod worths — the missions steer on
observables, not absolute ppm.

**Docs re-measured, and two deliberately NOT.** `Manuals/12` §4.3 rewritten (+ new §4.3.1),
`Manuals/09` §203, `Manuals/05` §106 (re-measured: **11.39 plant-hours** cold to
**567.0 °F (297.2 °C)** on pump heat with no rod motion, arriving ρ = **−3377 pcm on 907 ppm**),
`CONTEXT.md`, `M1 pwr engine.md`, `PLAYTEST_CHECKLIST.md`. **Left flagged, not overwritten:**
`PWR_BEHAVIOR_CATALOG` PI-9's −9,604 pcm and the accumulator's 243 s were measured at
**engine+M4**; my re-measurements are **engine-direct** and therefore not comparable (CLAUDE.md's
layer warning). The held-worth arithmetic *was* corrected (0.4 × 4068 = **1627 pcm**).
**Both were then re-measured properly and one of my own conclusions was wrong.** At
engine+M4 — the layer the catalog used — the stuck-rod SLB ends at **ρ = −27,458 pcm,
16.9× the held worth**, because safety injection fires and carries the primary to 2500 ppm.
My engine-direct probe read −2049 pcm (1.26×) because that layer has **no HPI at all**. I
flagged the non-comparability and then drew a conclusion from the number anyway — "the
cushion is largely gone" — which was exactly backwards. Withdrawn in the catalog. The
lesson is the one CLAUDE.md's layer table already teaches: quoting the caveat does not
license the inference.

**Still open, tracked in #260.** No **Estimated Critical Condition** anywhere — real startups
compute one before diluting (WTSM 2.2 §2.2.3 + Attachment 2.2-1); we have no ECC procedure, no
critical-boron-vs-Tavg curve and no caution as boron nears critical for the current Tavg. That is
what would have stopped this event before the trip. Also: one lumped control bank still carries
all four banks' worth, and the Mode 5 IC's −1000 pcm is exactly the Tech Spec minimum (measured,
it yields a *realistic* critical rod height — ~25 % withdrawn against the WTSM 2.2 exercise's
desired 26 % — so it was left alone).

### 2026-07-29k — a portable single-file build, and the gate that keeps it possible  ✅

**The ask.** *"i want to create a portable, offline version of this sim. how can i do that? is
it possible?"* — then, once the options were on the table, *"i want to be able to email it.
lets go with option c."*

**The finding, before any code: it was already offline.** Measured rather than assumed. Loaded
`file:///…/ui/shell.html` in headless Edge and probed it:

| | measured |
|---|---|
| `fetch` / `XMLHttpRequest` / `import()` in the repo | **none, anywhere** |
| external assets (CDN, web font, `@font-face`, image) | **none** — the runtime dirs contain no binary file at all, only `.gitkeep` |
| operator's manual | already pre-packed into `ui/manual_md.js` (280 KB), not loaded |
| `localStorage` on the `file://` origin | **works** (saves, flags, board state) |
| physics | **integrates** — `?inject=stuck_porv_open`, reactor power 100.0 % → 0.8 %, T-avg 570 → 558 °F (299 → 292 °C), 8 alarms latched, scram in |
| page errors | **0** |

So the no-module-system convention (`CLAUDE.md`, *Code conventions*) had already bought offline
operation for free — plain `<script src>` loads fine over `file://` where an ES module is
CORS-blocked. The only failures were two absolute-path Vercel analytics beacons (`defer`, fail
silently) and `site/hero.png`, a placeholder already missing on the deployed site.

**What was actually missing was not offline — it was *one file*.** A folder is not something you
can email. `tools/make_portable.js` inlines the 94 scripts + 2 stylesheets `ui/shell.html`
lists, in document order, into a 2.55 MB self-contained page.

**Verified against the multi-file build, not just "it opened":** the bundle issues **1 network
request (itself)** vs 99 for the folder build, 0 failed, 0 page errors, and after the same
injection every one of 60 sampled board values is **identical** — power 0.8 %, T-avg 558 °F
(292 °C), primary 1068 psi (7.36 MPa), 8 alarms, 75 board ports, 51 `RD` keys.

**Three fixups the bundler makes, each because a single file has no folder around it:** the two
Vercel beacons are dropped (**declared with reasons — an undeclared external tag throws, it is
never a warning**, because silently shipping one is the whole failure mode); the logo's
`../index.html` has no sibling to point at and is repointed at the public site; and the ⚛️
favicon is embedded as a `data:` URI. Escaping matters in one real place — `std_pipe.js:6`
documents its component with `<script src="./pipes.js">` **inside a JS comment**, and unescaped
that closes the tag early and spills the rest of the file into the page as text.

**The gate — `test/run_portable.js`, 112 checks.** Filed as the *First Principles* concern in
the same session: the single-file build rests entirely on "nothing loads anything at runtime",
and **no other gate asserted that**. The failure is maximally quiet — a `fetch('Manuals/12.md')`
added for a good reason keeps the *other* 29 runners green and the deployed site perfect, and
breaks the emailed file on a recipient's machine where nobody will ever report it back.

- **Scan surface is the shipped asset list, read out of `ui/shell.html`** — not a sweep of
  `engines/ layers/ ui/`. It cannot miss a file that ships or flag one that does not
  (`ui/test_panel/*` harnesses and `tools/` may fetch whatever they like), and it widens itself
  the moment a `<script src>` is added, with nobody remembering to update a directory list.
- Also checks the stylesheets for `@font-face` **and for relative `url()`** — a relative `url()`
  works on the site but breaks once inlined, because a `<style>` block resolves against the
  *document's* directory, not the stylesheet's.
- Then **builds the bundle and asserts the deliverable**, not only the sources.

**Verified by injection, per HR10 — a green gate is not evidence it works.** Five failures were
injected into real files and reverted: a `fetch()`, an undeclared CDN `<script>`, an
`@font-face`, an `<img src>` in the markup, and an ES `export`. Each turned it red **on the
matching check** (the CDN case also made the bundler throw, which is correct), and the restored
tree returned to 112/0.

**Three of the gate's first four findings were the gate's own fault, which is worth recording.**
It flagged `src="./pipes.js"` — the string inside `std_pipe.js`'s comment, inside an inlined
`<script>` body, which a browser never parses as HTML and which the measured request count of 1
disproves outright. Fixed by blanking `<script>`/`<style>` **bodies** before scanning for
loading attributes, since a body is not markup; the `<img src>` injection above confirms the
narrowed check still bites. It also failed two sentinels I had **guessed** — `RD.PwrEngine` and
`RD.ControlKernel`; the real globals are **`RD.PWREngine`** and **`RD.ControlLayer`**. A
sentinel for a name that never existed fails forever and reads as a broken bundle rather than a
broken test. Only the fourth finding was real: `dist/` was not gitignored.

**Lane note.** Started on `develop`; the owner reported another agent there, so this was built in
`C:\grok_build\RD_workbench` on `workbench` — which was verified clear first (clean tree, zero
unmerged commits, same SHA `0f3a015`, `node_modules` + `inbox/` present), per `CLAUDE.md`'s
two-lane rule. No project file in the `develop` tree was touched.

**Open follow-ups.** The landing page (`index.html`) and the other site pages are **not**
bundled — the deliverable is the control room alone, which is what "email me the sim" means, but
a portable *site* is a different tool. The build is not wired into the release process either:
nothing regenerates `dist/` at a `develop` → `main` merge, so an emailed file is only ever as
current as the last manual run.

### 2026-07-29j — #251: the pump-heat netting is gone, and the plant can heat itself  ✅

**OWNER RULING, 2026-07-29:** *"Lets go with the long term fix. I dont want to fudge anything
if i can help it. we should do it first becuase this kind of fidelity is the point of this
sim."* — the structural fix, not the one-line gate.

**The defect.** `pwr_steam_generator.js` computed steam generation as
`max(0, Q_sg − Q_pump) / latent_heat_secondary`, booked in its comment as "SG blowdown/ambient
losses". It was not that: it was sized to cancel RCP pump heat *identically at every flow*,
because the turbine's steam demand was computed from core power alone and the extra ~0.55 %
had no sink. The consequence nobody had costed: **a heatup on pump heat was mathematically
impossible.** The steam side could not start boiling until `Q_sg` exceeded `Q_pump`, but
`Q_sg = h_sg·(Tavg − Tsec)` settles at exactly `Q_pump` and stops.

**Measured (HR12).** `cold_shutdown` IC, RCPs started, pressurized to 2235 psi (15.41 MPa),
no rod motion at all. As built it **stalls at 218.69 °F (103.72 °C)** — a stable attractor,
not a slow approach: Tsec 218.37 °F, steam pressure pinned on its 14.5 psi floor, and
ΔT = 0.321 °F = `Q_pump/h_sg` to three decimals, forever.

**The fix, in three parts.**

1. **The SG boils off whatever crosses it.** `steam_generation_rate = Q_sg / (latent_heat_secondary
   × (1 + pump_heat_frac))`. Rated steam flow is now the flow made by **NSSS rated heat** —
   rated core heat *plus* full-flow pump heat — which is how a real plant rates its steam
   generators (NSSS thermal power, not core thermal power). Two places in the engine already
   assumed exactly this (`pwr_engine:1125,1199` and the dump's `t_fullpower`), which is the
   evidence the netting was the anomaly.
2. **The governor draws it.** `_loadModeOpts.extractFrac` returns
   `(_Q_total + pump_heat_frac·flow_frac) / (1 + pump_heat_frac)` — one term further than #229,
   for the same reason. **Note what this did NOT need:** the issue's plan step 3 expected to
   recalibrate `steam_flow_rated` and add headroom above the governor's `clip(…, 0, 1)`.
   Normalizing both sides on NSSS rated heat instead means 100 % core power at full flow is
   *exactly* 1.0 — rated steam flow, rated MWe — so `steam_flow_rated` stays 1.0, the clip
   stays, and "100 %" still means 100 % on every gauge. That was the whole risk item in the
   plan and it evaporated.
3. **The cold IC had to stop being synchronised to the grid.** `_buildState` set
   `load_mode: 'follow'` unconditionally, so a Mode 5 plant spawned "following" at 50 °C with
   `generator_load = 1e-6` — #235 parked the rotor for the subcritical states and left the
   mode. Invisible while the SG cancelled pump heat. With the netting gone the follow governor
   cracks to **6.2 %** on the pump-heat demand and drains the heatup: measured, it re-stalled
   at **306.05 °F (152.25 °C)** with the same 0.321 °F ΔT signature. Now one `onLine = P0 > 0.01`
   predicate drives rotor speed, breaker, governor and load mode together, so they cannot
   disagree again. **This was the real second half of the bug and the issue did not name it.**

**Measured after, against the pinned before-numbers.**

| | before | after |
|---|---|---|
| Full power, 4 sim-h | 819.47 psi, 100.00 MWe, 579.33 °F, zero drift | **identical to 2 dp** |
| 50 % load (follow), 3 sim-h | 990.60 psi, 50.13 %, 572.89 °F | 995.25 psi, 49.67 %, 573.20 °F |
| Manual 100/75/50/25 MWe, 4 sim-h | — | max drift **−2.07 psi**; no creep at any load |
| Disconnected ride-out, 2 h | +3.36 psi | +3.68 psi |
| Heatup, no rods | **stalls 218.69 °F** | **548 °F in 10.71 plant-h** |

So **step 5 of the plan needs nothing**: MANUAL and DISCONNECTED do not drift, and no second
compensation term was added. The heatup profile: Mode 4 (200 °F) at 0.28 h, Mode 3 (548 °F) at
10.71 h, arriving ρ = **−6287 pcm** on 919 ppm with the bank still at its cold-shutdown
position. Average **39.8 °F/hr (22.1 °C/hr)**, steady **~32 °F/hr** after the first hour; the
first hour reads **111.5 °F/hr** because the pressurization is fast, not the ramp. Feed lineup
makes no difference (bottled SG → nothing boils off → nothing to replace; level holds 65.6 %) —
the plan's step 6 worry about cold feedwater as a heat sink does not bite. Rate control:
securing an RCP → **0.1 °F/hr**; the steam dump is far too coarse, 5 % manual demand is ~10×
pump-heat generation and *reverses* the heatup at **−83.4 °F/hr**.

**The mission was re-authored around the real mechanism.** `pwr_mode5_to_mode3` no longer takes
the core critical: pressurize → start pumps → bottle the SG → ride 10.7 plant-hours up → arrive
hot and still subcritical, which is what Mode 3 actually is. The approach to criticality left;
it already lives in `pwr_startup_challenge` / `pwr_return_to_mode1`. `setup_commands` is now
empty in both Mode-5 missions — their `disconnect_grid` became a no-op when the IC started
spawning off line.

**HR10 — the new gate was validated against the OLD behaviour.** `run_campaign`'s heatup test
was rewritten to drive only `set_rcp` + `set_pressure_setpoint` (no rod command exists in the
driver) and asserts **0 steps of rod motion** and peak power < 0.01 %. I then temporarily
restored the netting and re-ran it: it **fails** on "heatup reaches an endpoint". So the gate
demonstrably catches the regression it claims to, rather than merely passing today.

**Content corrected (HR9 — content follows the plant).** Six places asserted that pump heat
could not do this, all now false: `Manuals/04` PWR-N03 sequence + simulator note, `Manuals/05`
§2.2/Phase A ×3, `Manuals/CAMPAIGN_MODE_ALIGNMENT_SPEC` §honesty, `Blueprint/pwr_training_campaign`
row 3a, and `ui/manual_procedures.js`'s `pwr_heatup` cautions. Manuals repacked.

**Deliberately NOT done:** `pwr_heatup` (PWR-N03) is still an 18-step *nuclear* heatup. It is
gated by two runners and cross-bound to a checklist (#254), and re-authoring it as a pump-heat
evolution is a separate deliverable that also collides with #253's curriculum redesign. Its
false claims were corrected and it was reframed as the nuclear variant; the re-authoring is
filed as a follow-up.

**Gates:** `run_all` **29 runners at baseline**. One baseline moved: `run_campaign`
**3025 → 3026 checks** (+2 new assertions, −1 highlight from the beat that left). PWR ops still
**21/21 with zero fails** — checked per-plant from `ops_results.json`, not inferred from the
57/68 total, because a PWR red swapping with an RBMK green nets to the same number.

### 2026-07-29i — #248: low-flow setpoint 25 % → 90 %, and HR12  ✅

**OWNER RULING, 2026-07-29:** *"Make the change to 90% as you recommend."* Adopted the real
Westinghouse setpoint (WTSM 12.2 Table 12.2-1) and moved the block permissive from an
unsourced 5 % to the real **P-7 (10 % power)**.

**New Hard Rule — HR12** *(OWNER RULING, 2026-07-29: "if you make assertions about plant
dynamics, you must back it up by testing them.")* Put in **§3 (binding)** rather than SOP,
because SOP §1–4 is explicitly advisory and this was meant to bind. It is the dynamics
counterpart of HR9 (which sources *static* facts to real-plant documents) and the mirror of
HR10. Guard: **none possible**, stated as such — same as HR10.

The rule earned itself inside this very change. The **strongest argument against 90 %** was
mine: that RCP cavitation would cause spurious trips during depressurizations. Measured — of
the depressurizing casualties only the large LOCA reaches 90 % (at 6 s), and it has already
scrammed at **3 s** on low pressure; small LOCA, stuck-open PORV and SGTR never leave 100 %.
The objection was simply **wrong**, and nothing but running the plant would have said so.

**Measured (seed 42, M5 stack, hot_full_power + RCP trip):**

| | healthy channel | stuck-high channel (100 %) |
|---|---|---|
| DNB onset (core_void ≥ 0.02) | **never** (peak 0.000) | 9 s (peak **0.60**) |
| SCRAM | **1.8 s** on `rcs_flow low` | **35.3 s** on `primary_pressure high` |
| peak fuel | 693 °C (unchanged) | 930 °C — damage is 1200 °C, core survives |
| min indicated subcooling | 32.9 °C | **6.2 °C** (below the 11 °C caution) |

For reference the old 25 % setpoint tripped at 16.2 s against a DNB onset of 10.9 s.

**Two gates went red, and both were right to.** Neither was refitted:

1. **`run_pwr` `transient_rcp_trip`** — the check `coastdown not instantaneous (τ≈8s)`
   asserted `t > 4` where `t` was *time to the trip setpoint*. That was a **proxy**, true only
   because the setpoint was 25 %; at 90 % flow crosses in 0.9 s and it failed, while the
   coastdown itself never changed. Replaced with the claim it was standing in for: flow decays
   exponentially to `natural_circ_flow`, so it passes **1/e of rated at t = τ**. Measured 8.0 s
   against a config τ of 8.0, and independent of any trip (a scram does not touch `stepFlow`) —
   so it passes on the OLD behaviour too, which per HR10 is what makes it a better test rather
   than a refit.
2. **`run_campaign` `pwr_lof`** — the "you waited → DNB" branch became unreachable (peak
   core_void 0.000). **Content follows the plant (HR9)**: the scenario was re-authored, not the
   setpoint reverted. It now injects the stuck channel alongside the pump trip, and the new
   assertion checks the **trip reason** (`primary_pressure high`, not `rcs_flow low`) — because
   "the assigned protection worked" and "a backstop caught a consequence" are the two outcomes
   this lesson exists to distinguish, and only the reason tells them apart. 3024 → 3025.

**A third gate caught me:** `run_manual_units` failed 4 sites on my own new §10.7 prose —
SI with no US partner, including two temperature *differences* (subcooling) that convert
×9/5 with no offset. Exactly what it is for.

**Lesson worth keeping.** Removing a defect can make a lesson unreachable, and the reachable
lesson was **better**: the old one taught operator anticipation via a fabricated late trip; the
new one teaches that a single-channel trip is exactly as trustworthy as its one transmitter,
using the failure #247 had just made injectable. When a plant fix orphans content, the content
is usually resting on the defect.

### 2026-07-29h — #247: the low-flow trip got an instrument  ✅

**Paid four of the five HR1 debts the guard declared the day before** (2026-07-29g). Both PWR
items turned out to be the same shape — a control-layer rule reading truth because nobody had
built the indication — and both are now ordinary instrument reads.

**Evidence pass first, per the SOP.** Nothing here was designed from recall:

- **WTSM 3.2 Reactor Coolant System** (ML11223A213 §3.2.3): *"Elbow taps are used in the RCS
  to indicate the status of the reactor coolant flow… The elbow flow instrument measures the
  differential pressure between the inner and outer radius of the intermediate leg piping
  elbow."* ΔP/ΔP₀ = (ω/ω₀)². *"The expected absolute accuracy of the channel is within ±10 %
  and field results have shown the repeatability of the trip point to be within ±1 %. The
  accident analysis for a loss-of-flow transient assumes an instrumentation error of ±3 %."*
- **WTSM 12.2 RPS Trip Signals** (ML11223A301, Table 12.2-1 row 12): Low Reactor Coolant
  Flow, **2/3 per loop**, **< 90 % of rated flow**; below **P-7 (10 %)** all low-flow trips
  are blocked, above **P-8 (39 %)** one loop is enough.
- **NUREG-1431 Bases** B 3.3.1A Function 10 (ML12100A228): *"Each RCS loop has three flow
  detectors to monitor flow. The flow signals are not used for any control system input."*
  P-8 there is *"approximately 48 % RTP"* — plant-specific, like P-9.
- **WTSM 11.1 SG Water Level Control** (ML11223A293 §11.1.4): a feedwater isolation signal
  *"causes automatic closure of all feed regulating and bypass valves (if open) and main
  feedwater isolation valves"* and is one of four inputs that **override** the level control
  system — which is exactly the stand-down the feed channel was trying to implement.

**Two departures, recorded rather than quietly carried** (`Manuals/12` §10.7): this plant
trips at **25 % of rated on ONE channel** with the block at 5 % power. The channel count
follows from the plant being single-loop and every other protection function here being
single-channel — and it is *what makes the teaching case work*, since 2-of-3 exists precisely
to stop one lying transmitter mattering. The **setpoint** is the consequential one and was
deliberately left alone: 25 % → 90 % moves the automatic trip from ~11 s into a coastdown to
~1 s and rewrites what `pwr_lof` teaches, so it is a plant-identity decision, filed separately
rather than smuggled in under an HR1 fix.

**Three things that only showed up in the doing.**

1. **`ctx.true_state.feedwater_isolated` never existed.** The feed channel's `offWhen` had
   been reading an undefined field since it was written — `getTrueState()` exposes
   `pump_flow_pct` but has never exposed `feedwater_isolated`. So the stand-down was dead
   code that *looked* live, and the HR1 debt entry was hiding a plain bug underneath it.
   Probed both ways after the fix: channel engaged before isolation, disengaged after, with
   the authored note. Worth generalising — **an HR1 violation is a good place to look for a
   second defect**, because a read nobody could see was also a read nobody tested.
2. **A `noisy` failure on a noise-0 instrument is silently inert.** Appended instruments
   ship at `noise: 0` (the cross-step PRNG rule — one extra draw per step shifts every
   downstream instrument from that step on, which has already moved three marginal
   endpoints). But `_applyFailure`'s noisy mode scales `spec.noise`, and `_gauss` returns
   without drawing at sigma 0 — so the failure would have done **nothing**, on the one
   instrument built specifically for failure injection. Added `noise_failure`, a sigma used
   only when a failure is active: no baseline run has one, so the RNG sequence is
   byte-identical. Anchored to the sourced ±1 % trip-point repeatability. Probed: span
   92.2 → 107.4 % where inert would be a flat line.
3. **The scenario was teaching the defect as a virtue.** `pwr_lof`'s beats told the player
   the trip *reads true flow "because at coastdown speed a laggy signal would arrive too
   late to matter"* — a justification for an unbuilt instrument, written into training
   content, in the plant's flagship DNB lesson. HR9 in one line: content follows the plant.
   Rewritten to point at the transmitter.

**Measured, through the full M5 stack** (`hot_full_power`, RCP trip):

| | |
|---|---|
| true flow < 25 % | 14.4 s |
| `rcs_flow` indication < 25 % | 16.2 s |
| SCRAM | **16.2 s**, reason `rcs_flow low` |
| **stuck-high channel** injected | indication 100.0 %, true flow 0.0 %, **low-flow trip never fires** — caught later by `primary_pressure high` |

The 1.8 s gap between truth and indication is the instrument, and it is the entire point:
before this, that number was structurally zero.

**Gates.** `run_all` green with three drifts, all intended and all in the right direction:
`run_pwr` 200 → **201** checks (new assertion that the channel follows truth below setpoint —
the old test hardcoded `0.25` and would have gone on passing against a stale number),
`run_hardrules` 18 → **14** (four debts paid), `run_hr3` 32 → **29** (the sentinel was the
kernel's only PWR-only true_state reference — half of #228). Everything else at baseline,
including `run_procedures_stack`, `run_campaign`, `run_behavior`, `run_meltdown` and
`run_ops`, which is the answer to the issue's own predicted fallout: the lag moved no endpoint.
### 2026-07-29i — #245: half the stack gate was running at 1×, and it had cost four filings  ✅

**The bug.** `run_procedures_stack` sets `timeAcceleration = 10` once, at setup.
`SimulationService._attentionStop` then does exactly what it is designed to do for a *player* —
the first alarm or scram on a quiet board snaps fast-forward back to real time — and nothing
puts it back. Every tick after that advances 0.1 s instead of 1 s, for the rest of the
procedure, while the harness's header goes on printing *10× accel*.

**Measured, not estimated.** The issue reported ten dropout events. Instrumenting per-procedure
instead of per-event gives the number that matters: **11 of the 22 procedures** ran below their
declared acceleration, and the runs are long — 416 slow ticks in one, then 305, 141, 99, 96, 79,
40, 40, 40, 31, 30. The earliest dropout is at **t = 2.0 s**. A procedure that trips at t = 4.5 s
spends its entire remaining evolution at 1×.

**Fix: `svc.attentionStops = false`.** Option 1 of the three in the issue. The dropout is a
comfort feature for a human at the board; a headless gate has no one to protect, and
`attentionStops` is the supported way to say so (it is the Settings → Fast-forward dropout
toggle). `run_autoctl` had already reached the same conclusion by the other route — re-asserting
the speed each cycle — and its comment says the same thing in different words, so this is not a
new position in the repo, just a cheaper spelling of it. Coverage is unaffected: `run_m5` owns
`_attentionStop` (scram/failure/alarm reasons, the on/off setting, survival across a restore).

**And a guard, because the defect's whole character was silence.** Each procedure now asserts it
held the declared acceleration for every tick, reporting the slow-tick count and the first
offender. Validated as a **counterfactual** (HR10): with `attentionStops` restored the gate goes
**11/22**, which is where the census above came from. A guard that only ever passes proves
nothing.

**Four filings under #208 were this bug, not plant defects.** `bwr_startup` step 2 was already
known (2026-07-29c). `rbmk_mcp_trip` step 2 on **both** RBMK versions and `bwr_sbo_rcic` step 3
join it — power had a tenth of the time to fall after the pump trip, RCIC a tenth of the time to
refill (vessel level read 25.4 % against a required 40). All three pass on the sim time alone,
with no plant change. **Read that carefully before reusing it:** what is established is the
mechanism. Nobody has re-derived those steps from the plant, both plants are ON HOLD, and a
genuinely slow ascent would be hidden by the same 10×. The remaining #208 entries deserve the
same suspicion when RBMK/BWR reopen.

**One PWR assertion was stale, and it is the interesting one.** `pwr_stuck_porv` step 1 asserted
`core_inventory_pct < 100` at the end of a 30 s hold, and reddened at **117.59**. Probed under
the shipped lineup:

| t (s) | inventory % | pressure MPa | subcooling °C | HPI |
|---|---|---|---|---|
| 1.0 | 99.65 | 14.86 | 38.0 | off |
| 6.0 | 98.01 | 12.82 | 26.2 | off |
| 8.5 | 99.13 | 10.51 | 12.4 | **ON** |
| 16.0 | 117.59 | 8.07 | −0.6 | ON |
| 31.0 | 120.00 *(clamp)* | 7.01 | −0.6 | ON |

The leak is real for ~8 s; then automatic HPI comes in on low pressure and refills past nominal
with the pressurizer at 88 % and subcooling gone. **That is the plant being right** — it is
TMI's own trap, the solid pressurizer that invites throttling injection, and this procedure's
own `cautions` warn about it. The assertion contradicted the procedure it belonged to and only
ever passed because the run was starved to ~3 s. Now `saw core_inventory_pct < 100` (the claim
the step actually teaches — the leak happened) plus `acc subcooling_c < 20` (the diagnosis
signal its text points the player at). Honest note on HR10: the `saw` holds on the old truncated
run too, the subcooling `acc` does not — the truncated run is the defect, not a reference point.
Identical under the bare lineup, so this is not a lineup effect.

**Two things left open, deliberately.**
- **HPI refills 98 → 120 % in about eight seconds, and 120.00 is a clamp.** The *direction* is
  prototypical; the *rate* looks fast and the clamp is a model bound. Not touched — changing a
  plant number needs an evidence pass against real plant documentation (owner SOP), and letting
  a content gate vote on physics is exactly what HR9 forbids. Filed as **#249**.
- **`--lineup=bare` reports 2 stale xfails** (`rbmk_raise_power` step 1 on both versions), and
  did so before this change. `KNOWN_FAILS` is keyed by procedure, so it cannot express *fails on
  the default lineup, passes on bare* — which is the actual situation. Pre-existing, RBMK, not
  in `run_all`.

**Gates.** `run_procedures_stack` **22/22, 155/155 → 178/178** (+22 the acceleration assertion,
+1 the stuck-PORV split), strict xfails **5 → 2**; `run_procedures` **101/101 → 102/102**;
`run_all` **28 runners at baseline**. `BASELINES`, CLAUDE.md and `CHANGELOG.md` updated together.

### 2026-07-29h — #246: the V1 board deleted, and the two things buried inside it  ✅

**The deletion was the easy half.** `ui/diagram/pwr_synoptic.js` (~100 KB) + `.css` were the
V1 PWR board, superseded by `ui/diagram/board/` and shipped-but-never-mounted ever since. Gone,
with `ui/test_panel/synoptic_check.html` (its 55-check DOM harness — it mounts `RD.PwrSynoptic`,
so it could only ever test the deleted module) and the three `RD.PwrBoard || RD.PwrSynoptic`
fallbacks in `app.js`. Row in `Blueprint/RETIRED.md`.

**What made it not a `git rm`** — two live dependencies that a grep for `PwrSynoptic` does
*not* find, both worth recording because the shape recurs:

1. **The stylesheet was not all V1 styling.** Its first four rules are `.app.pwr-synoptic`
   shell hooks — hide the legacy view switcher / status bar / control row, and
   `.view-area { padding: 0; overflow: hidden }`. The class is still toggled by `app.js` and
   the **V2** board is what sits in that view area, so deleting the file wholesale would have
   put padding back under the board and un-hidden three containers `app.js` only *empties*.
   Moved into `ui/shell.css` beside the grid rules that already own that class. The tell was
   the file's own header comment saying the sizing rules had already been migrated out —
   i.e. someone had done this once and stopped halfway.
2. **`run_campaign` was validating PWR beat highlights against V1's `SYN_CONTROL_MAP`.** That
   was the wrong authority *before* the deletion, not because of it: `app.js` resolves a
   highlight through `RD.PwrBoard.revealControl`, so what actually decides whether a label
   glows is the board driver's `CONTROL_LABEL_MAP`. The gate was checking one map and the
   product used another; they only agreed by hand-maintained parity, which two board comments
   asked future editors to keep. Swapped to `RD.PwrBoardDriver.controlLabels()`, and the
   parity instructions deleted — the board map is now simply the vocabulary.

   **Diffed before swapping, not after** (HR10 — a green 51/51 either way proves nothing about
   which pool is right): board 51 labels, V1 34, and V1 ⊂ board exactly. So the swap cannot
   hide a beat that used to resolve, and the 17 extras it newly accepts are the indication
   labels checklist hover already glows. `run_campaign` needed `global.window = global` to
   load the driver headless (board scripts attach to `window.RD`); no engine or layer file
   branches on `typeof window`, so that is inert for everything else it loads.

**A stale number found on the way.** CLAUDE.md recorded `board_check` at **95/95**. Measured
**106/106** — and, importantly, 106 on clean `develop` 5bf366f too, so it was already stale
when written rather than moved by this change. Corrected, with a note to re-measure rather
than trust the line.

**Gates** (the four the issue named, plus the campaign gate): `run_campaign` **51/51 (3024)**,
`verify_manual_follow` **PASS (84)**, `verify_e2e_ui` **PASS (16 screenshots)**, `run_inspect`
**7/7 (35)**, `board_check` **106/106**, `run_all` **28 runners at baseline**.

### 2026-07-29g — HR1's guard was laundering debt; SOP §5  ✅

**The guard I wrote that morning was wrong in a way worth recording.** `run_hardrules`'s HR1
allow-list had ONE category. Writing the reasons out is what exposed it: for two entries the
honest reason was *"the instrument does not exist"*, which under HR9 argues for **building the
instrument**, not excusing the read. Filed together, those were indistinguishable from the
genuine exceptions — so a green gate would have read as *HR1 is clean* while the plant's most
safety-significant trip reads truth.

Now two categories. **EXCEPTION** is settled (ctx assembly, command read-back, no
core-damage instrument). **DEBT** is a real violation, tracked, carrying an issue number,
printed separately, with the summary line saying outright that OK means *no undeclared reads*
and not *HR1 satisfied*. **5 declared debts → #247**, the low-flow reactor trip being the one
that matters: it reads true pump flow because the RCS flow instrument was never built, which
makes that trip **unteachable** in a simulator whose entire premise is that instruments lie.
Not scheduled — owner: *"We are not going to do these sim changes in this convo."*
*(Superseded: 4 of the 5 were paid the next session — see 2026-07-29h above.)*

**Scan surface, verified rather than assumed.** Protection decisions live ONLY in
`layers/control/`, and `getTrueState()`/`true_state` are the ONLY routes to truth in `layers/`
(no `engine.s`, no direct handle) — both grepped. I widened the scan to all of `layers/` so it
would match the claim, then reverted: the service reads truth in ~16 legitimate places
(snapshot assembly, which HR4 *requires*), and declaring them all would have buried the five
that matter. Same failure the HR11 check needed rescuing from hours earlier.

**Doc pass.** 16 HR7/HR8 citations across M1–M4, M6 and DESIGN_COMPANION resolve through the
§3 retirement pointers — nothing dangles, deliberately not rewritten. §3 now also says plainly
that retiring HR7/HR8 was a **demotion in binding force**, not a relocation.

**SOP §5 — bring the recommendation with the question** *(OWNER RULING, 2026-07-29: "I think we should add to SOP to have you automatically give your recommendation when asking for my input so I don't have to keep asking for it.")*. Written
from four failures in this same session, not from principle. A pointer also went into
CLAUDE.md, because **SOP.md is not auto-loaded and CLAUDE.md is** — a rule about how an agent
answers will not fire if it lives only where nobody looks mid-conversation. That exposed a
contradiction (rule 1 said SOP.md is not binding; §5 quotes an owner instruction), now
resolved: §5 binds because the *owner* said it, which is the only route by which anything in
that file binds.

**Gates.** `run_hardrules` 15 → 17 checks (the HR11 guard picked up the two new quoted
rulings — the gate working). `run_all` **28 runners** at baseline.

### 2026-07-29f — the Hard Rules, sorted out: 10 → 9, each with a named guard  ✅

*(Owner, 2026-07-29: "Some hard rules are system specific. Could any be put in SOPs or in
system specific rules? I think we may have too many hard rules. We should keep hard rules
concise." — and "I agree hard rules should have guards.")*

**§3 went from 199 lines to 135, and the rules from 10 to 9.** The test applied for admission
was *can this be violated silently?* — a convention you would notice breaking is a convention,
not a hard rule.

- **HR7 (failure taxonomy) → §11 Conventions.** A placement convention, not an invariant, and
  one already amended once by the 2026-07-16 relief-valve ruling.
- **HR8 (params live in code) → §8 v1 Scope.** It says what *not to build*, which is what §8 is.
- **HR11 extracted from inside HR9**: "a ruling needs a date and the owner's verbatim words, or
  it is advisory." Not a new rule — it already existed, buried seventy lines inside a rule about
  something else, while being one of the most-cited things in the repo.
- Everything that was *elaboration* — worked cases, failure modes, procedure — moved to the new
  **`Blueprint/SOP.md`**, which is explicitly **advisory, not binding** (CLAUDE.md rule 1 now
  says so, so it cannot quietly acquire authority).

**NOT renumbered, and that was the important call.** Measured first: **~580 citations** across
25 repo files and 11 memory files point at these numbers, and `test/run_hr3.js` is *named* for
one. Renumbering would have invalidated every one. HR7/HR8 keep their numbers as retired
pointers; retired numbers are never reused.

**Guards — new `test/run_hardrules.js` (15 checks).** §3 now requires every rule to name its
guard, and three had none:

- **HR1** — every true-state read in `layers/control/` must be *declared* with the reason no
  instrument exists. Eight sites, all now written down; the interesting one was
  `pwr_control.js:577` reading `feedwater_isolated`, which turned out legitimate — **verified
  against `getInstruments()` that no such instrument exists**, rather than assumed either way.
- **HR5** — no direct engine command call from `ui/`. Clean; the only `applyCommand` in `ui/`
  is in a markdown reference.
- **HR11** — every formal `OWNER RULING` carries a date and a quotation. Found **three real
  violations**, including one I had written that morning in `RETIRED.md`. Two are the same
  genuine ruling whose verbatim words were never recorded; those now carry an explicit
  *"verbatim not recorded, so advisory under HR11"* marker — declaring the gap rather than
  hiding it, the same idiom `run_hr3` uses.

HR2, HR6 and half of HR4 are still unguarded, and §3 states that rather than implying coverage.

**Three defects in my own gate, found by testing it rather than trusting it (HR10).**
1. The first HR11 cut matched case-insensitively and flagged **71 sites** — narrative prose in
   the log and changelog ("many *owner rulings* in this repo were written by agents"). A gate
   that cries wolf seventy times gets ignored, so it now matches only the formal uppercase
   marker, with the limitation written down.
2. Comment-stripping deleted block comments outright, collapsing their newlines and **shifting
   every subsequent line number** — the gate reported a real violation at the wrong place.
   Comment bodies are blanked in situ now.
3. A false *pass*: the multi-line window for a wrapped ruling crossed a **markdown table row**
   and borrowed the next row's date, vouching for an undated ruling. A table row is now its own
   window.

Then falsified deliberately: a probe violation of each of the three rules was planted, all
three were caught, and removing them returned the gate to green.

**Gates.** `run_all` **27 → 28 runners**, all at baseline.


### 2026-07-29e — the board joins the manual's unit convention (checklists + inspector)  ✅

**Owner request, and the obvious completion of -29d.** The dual-unit convention had reached the
manual and stopped at the board, so three conventions were live at once:

| Surface | Was |
|---|---|
| Live checklist / procedure steps (`ui/manual_procedures.js`) | **SI-only** — `target: '8.23 MPa'` |
| Scanner inspection copy (`ui/diagram/board/pwr_board_inspect.js`) | **mixed** — some entries US-only (`180 °F`), some SI-only (`12.4 MPa`) |
| One Scanner entry | **backwards** — `15.41 MPa (about 2235 psi)` |

A player read a step target in MPa against a gauge in psi, on a board that is US everywhere
else. 28 sites converted.

**Extended the existing gate rather than writing a second one.** `run_manual_units.js` now scans
`Manuals/*.md` **plus** the two source files (218 checks). Two source-specific rules:
- **Only authored prose counts.** `//` comment lines are skipped — a note to the next developer
  is not something a player reads, and holding it to the operator convention is noise.
- **Command payloads are not prose.** `cmd: { action: 'set_pressure_setpoint', mpa: 15.41 }` is
  an engine argument and stays SI. It carries no unit *string*, so the patterns never see it —
  but that is luck rather than design, so the file says so explicitly.

**Gotcha worth keeping: `git show HEAD:file > file` CORRUPTED a UTF-8 source under Git Bash.**
Used it to revert `pwr_board_inspect.js` for the HR10 old-behaviour check. The redirect produced
a file the same byte length as HEAD but truncated mid-character at the tail; the browser threw
`SyntaxError: Unexpected end of input` and every inspection entry returned null. **The text-only
gate still passed — it does not parse the file.** Two lessons: use `git checkout -- <file>` for
reverts, and when a *source* file is edited, prove it still PARSES (`node -e "require(...)"`),
not just that the text gate is green. Caught only because the browser probe ran afterwards.

**Validated (HR10).** Gate fails with 8 errors against the pre-conversion inspector and passes
after; `run_inspect` 7/7, `run_checklist` 24/24, `run_procedures` 22/22, `run_procedures_stack`
22/22, `run_campaign` 51/51. Browser probe: 160 inspection entries resolve, no page errors, and
the copy the board serves is the converted copy.

**`run_all` 27/27 at baseline.** First change made in the **workbench tree/branch**
(`C:/grok_build/RD_workbench`, branch `workbench`) per the owner's instruction.

---

### 2026-07-29d — manual goes dual-unit (US first, SI in parentheses)  ✅

**Owner request.** All 14 operator documents now read `2235 psi (15.41 MPa)`, `579.2 °F
(304 °C)`, `28.5 inHg (96.5 kPa)`. Conversions and rounding taken from the product's own
`ui/app.js conv()` / `fmtInstrValue()` (pressure 0 dp, temperature 1 dp, vacuum 1 dp), so a
number in the manual is the number on the gauge. US first is consistent with the board, whose
SI toggle is *disabled* for the PWR (#237/#238).

**THE LESSON: three conversion rules, and the third is a trap.** Temperature DIFFERENCES —
subcooling margin, leg ΔT, DNB margin, rod-AUTO deadband, cooldown rate — convert ×9/5 with
**no offset**. 41 °C of subcooling is **73.8 °F**; the absolute rule gives 105.8 °F, i.e. a
thin margin rendered as a comfortable one. That is a danger-side error and it is invisible to
proofreading.

**Two scripted passes were thrown away before one worked.** Same failure mode both times —
*classifying by line instead of by site*:
1. **Line-keyword heuristic** ("does this line mention margin/ΔT?"): 8 wrong sites. It
   converted the absolute leg temperatures 321/288 °C as differences (the line also carried
   `ΔT ≈ 33 °C`) and the 289 °C P-12 Tavg setpoint as a difference (the line said "8 °C below
   the no-load program") — 32 °F low on a real setpoint.
2. **Exact-substring rewrite**: overlapping keys (`falls to 8 °C` vs `to 8 °C`) produced
   nested output like `falls to 14.4 °F (falls to 14.4 °F (to 46.4 °F (8 °C)))`.
3. **What worked**: script only the unambiguous classes (MPa, kPa, absolute °C) with an
   explicit skip-list of line numbers, then hand-edit the ~35 judgement sites. `git checkout`
   between attempts — the manuals were committed first precisely so this was cheap.

**New gate `test/run_manual_units.js`** (182 checks; `run_all` baseline `182checks 0failed`).
Fails three ways: bad arithmetic, an SI quantity with no US partner, and — the one that
matters — a `DIFF_ONLY` value converted with the absolute rule, enforced **per site**.

**The gate's own first design was too weak, and injecting the bug proved it.** v1 only checked
that each difference quantity appeared as a difference *somewhere in the corpus*. Rewriting
09's subcooling margin to 105.8 °F passed green, because 01 and 04 still carried a correct
73.8 °F. Made per-site; the same injection now fails. **A corpus-wide assertion is not a
per-site assertion** — worth remembering for any future "must appear somewhere" check.

**The gate then caught my own allow-list.** I listed `50 °C` as always-a-difference for the
RHR cooldown rate; it immediately failed two absolute uses (Mode 5 RCS ~122 °F, the RHR sink).
The rate sites carry `/h` and validate as differences on their own, so the entry was wrong,
not the manual. Left in the file as a worked example.

**Validated against the old behaviour (HR10).** Green on the converted manual (182/0); **48
failures** with 09 reverted to its SI-only form; **fails** on the injected wrong-rule margin.

**#111 is resolved by a different route than it assumed.** The issue asked for the manual to
re-render on the units toggle; authoring both systems inline makes it correct at either
setting with no rendering path at all. The `verify_e2e_ui` xfail that pinned the gap is
**kept** — it now guards against someone adding conversion-on-toggle to text that is already
dual — and its comment says so.

**Still SI-only, deliberately out of scope:** the board's inspection copy
(`ui/diagram/board/pwr_board_inspect.js`) authors prose like "pressure falls to about
12.4 MPa". The owner asked for the manual; the same treatment there is a follow-up.

---

### 2026-07-29c — #240 follow-up: the `status` class does not demand an acknowledgment  ✅

**Owner ruling** (on #240): *"I want status-class alarms to spawn (and arrive)
pre-acknowledged."* Source unchanged from the parent issue — NUREG-0700 Rev 4 (ML26022A094)
Table 4.1, **Status-Alarm Separation**: *"separates status annunciators from alarms that
require operator action."* The parent build had deliberately left this alone and flagged it,
because it changes the whole `status` tier and not just #240's reclassified tiles.

**What changed.** `control_kernel._evalAlarms` now raises a `status`-class alarm straight into
`active_acknowledged`. The classification it uses is the **effective** one (`_effectivePriority`
→ `_reclassify`), so a mode/lineup-reclassified tile counts as status. Measured on a fresh Cold
Shutdown spawn: five annunciators, **zero unacknowledged**, header reads `Alarms` with no count,
no ACK chips, tiles read `status (normally critical) · acknowledged`. Verified in the real board
headless (`--dump-dom`, `?init=cold_shutdown&ff=20&run=1`), not just in the layer.

Two things came with it that were not in the ruling but follow from it:

- **Escalation hands the ACK back.** A tile the plant acknowledged for you, whose condition then
  stops being planned (heatup past Mode 4; a real trip landing on top of a securing), returns to
  `active_unacknowledged` and flashes. Without this, a genuine critical could sit lit and steady
  having never flashed — the exact failure the ruling is meant to prevent. Tracked in
  `layer.alarmAutoAcked` (saved/restored; absent in old saves → nothing auto-acked, the
  conservative direction). An **operator** ack is never undone.
- **A status arrival is no longer a fast-forward dropout** (`_attentionStop`). A tile that
  arrives pre-acknowledged and then yanks the clock to 1× while toasting "new alarm" contradicts
  itself. The transient-cadence flip is deliberately left alone — a shorter broadcast costs
  nothing.

**The invariant I had to restate, not break.** The parent's comment said "`_evalAlarms` never
sees these rules". It does now, so the guarantee is stated as what it always actually was: a rule
can never **stop, delay or invent** an annunciation — `_evalAlarms` decides clear→active from the
instrument condition alone and consults a rule only to classify what it has already raised.

**A filed BWR defect that was never a BWR defect (→ #245).** `bwr·bwr_startup` step 2
`power_pct > 1` had been carried as a strict xfail under #208, i.e. filed as a plant defect.
Instrumenting `speed_snap` showed the truth: at **t = 2.0 s** the BWR's `RCIC RUNNING` (priority
`status`) came in on a quiet board, the attention stop snapped `timeAcceleration` 10× → 1×, and
`run_procedures_stack` **never restores it** (`ACCEL` is set once, at :152). The procedure then
covered a **tenth** of the sim time its steps assume and step 2 observed `power_pct = 0`. Remove
the dropout, the run gets its declared 10×, and the step passes on its own physics. Entry removed
with that explanation in place.

**Ten more dropouts are still doing this** to other procedures in the same gate (measured, listed
in #245) — five of them within the first 7 seconds of their run. `run_procedures_stack` is the
only runner that sets `timeAcceleration`, so no other gate is exposed today. Not fixed here:
fixing it will move several numbers in that gate, and that re-baselining is its own piece of work.

**HR10.** Both new suites were run against the pre-ruling source: they fail wholesale, as they
must. The regression checks inside them — *a warning alarm still arrives unacknowledged*, *an
operator ack sticks* — pass on **both** sides, which is what makes them worth having. One
pre-existing check was deliberately inverted by the ruling (`all active_unacknowledged` on the
cold spawn); it is replaced by one pinning what it was actually there for (the tile is genuinely
active and runs a normal lifecycle), with the change noted at the call site.

**Gates.** `run_m4` **23/23 (117) → 25/25 (135)**; `run_procedures_stack` **22/22 (155/155)**
with **6 → 5** strict xfails. `BASELINES`, CLAUDE.md and this file updated together. `run_all`
**26 runners at baseline**. Docs: manual **06 §2.0** (+ **02 §8.1**, **09 §4.0**),
`Blueprint/M8` §8.2, CHANGELOG.

### 2026-07-29b — manual currency audit against the as-built sim  ✅

**Method — diff, don't read.** Dumped the live plant to JSON (14 trips, 17 actuations, 30
alarms, 23 failures, 8 automation channels, 34 instruments, 58 engine commands, 5 initial
conditions, 34 campaign missions) and diffed each set against the packed manual text, then
hand-checked every hit. Scratch harness: `dump_plant.js` + `coverage.js`. Reading the manuals
for plausibility would have missed most of what follows.

**The one that mattered.** The plant adopted **Reactor Trip on Turbine Trip (P-9)** in
`2fb0b78` (#216) and **no operator document said so**. `09` §2.0 listed 13 of the 14 trips;
`06` PWR-A22 said "verify SCRAM if required by plant"; `07` PWR-E03 said "possible reactor
trip depending on severity/response" and told the operator to insert rods. All three now state
it, with the three-way distinction the plant actually makes: **load rejection** → ride-out,
**turbine trip above P-9** → scram, **planned offline** (`disconnect_grid`, #230) → neither.

**The config comment was lying too.** `protection_options.turbine_trip_reactor_trip` still
carried *"Default OFF preserves today's behaviour"* next to a value of `true` — the comment
stayed put when the value flipped, so the source read as documentation that the plant does NOT
have the trip. Rewritten with the adoption date and commit.

**A cluster, not scattered errors.** Six documents (`01`, `02`, `08`, `09`, `10`, `README`)
still described Mode 4/5 as `[narr]` with "no cold IC". One event — the Mode 5↔1 work — went
un-propagated, and `11_CAMPAIGN_CROSSWALK` was the *only* doc that had been updated. Worth
remembering: when a capability lands, grep the whole manual set for the claim it invalidates.

**Two board controls were never documented**: circulating-water inlet temperature
(`set_condenser_cw_temp` — it drives vacuum, MWe *and* the RHR cooldown floor) and the
generator FOLLOW/MAN/OFF selector. Both now have sections.

**Found in my own work, and fixed (HR10).** `run_contract.js` (shipped yesterday, #225)
claimed to union `getTrueState()` keys "over every initial condition" — but `reset()` takes a
**command object**, and `reset('cold_shutdown')` silently falls back to `hot_full_power`
(`pwr_engine.js:1140`). The loop was five identical resets. The gate still passed and still
caught everything (getTrueState returns a fixed literal), but the claim was false. Fixed to
`reset({plant_id, initial_state})`, still 84/0, and the argument-shape trap is now a comment
in the file. **This is the exact failure HR10 warns about: a green gate proving less than its
comment claims.**

**Gates.** Everything the audit could touch is green: `run_pwr` 32/32, `run_behavior` 38/0,
`run_campaign` 51/51, `run_procedures` 22/22, `run_checklist` 24/24, `run_contract` 84/0,
`run_flags` 16/16, `run_inspect` 7/7, `verify_manual_follow` PASS.

**Pre-existing red, NOT from this work** — `run_all` shows two drifts caused by another
session's in-flight edits to `layers/control/control_kernel.js`, `layers/simulation_service.js`
and `test/run_m4.js` (all uncommitted in the tree): `run_m4` 23/23→**25/25 135** (new suites)
and `run_procedures_stack` 22/22→**21/22**, whose single failure is a **BWR** stale xfail
(`bwr_startup` step 2 XPASSes, #208, on hold). Left alone deliberately — absorbing another
session's baseline move would hide it.

---

### 2026-07-29a — #203: the manual gets a sim-physics chapter  ✅ (no code changed)

**What shipped.** `Manuals/12_SIM_PHYSICS.md` — the honest-scope chapter the manual set never had.
Packed into the in-app manual (`tools/pack_manuals.js` DOCS + repack), listed in `Manuals/README.md`,
Rev 5 in `00_REVISION_HISTORY.md`.

**Sourced from the engine, not from prose.** Every number was read out of `pwr_config.js` and the
five physics modules before it was written down. That is the reason the chapter is worth having: the
prose docs it would otherwise have been summarised from are demonstrably stale in places (see below).

**Found stale while writing it** — both corrected in the same change:
- `01_GENERAL_DESCRIPTION.md` §8.0 cold-ops row: *"[narr] only — Free Play starts Mode 3, Hot
  Standby"*. Both halves false since the Mode 5↔1 work — `cold_shutdown` is a Free Play IC
  (`ui/app.js:123`) and PWR-T20/T21 are `[sim]`. Corrected, and a **no natural circulation** row
  added, since that is the one simplification that makes the trainer *harsher* than reality.
- `DESIGN_COMPANION.md` §8.16 ("levels are geometric fill, not calibrated spans") is now only half
  true — SG level DOES have a real narrow/wide window (`sg_wr_lo/hi` 30–75). The new chapter states
  the current position (§12.12); the companion entry was left alone as the historical record.

**Two claims I nearly wrote from recall, and didn't:**
- `tavg_rate_c_per_hr` looked like it should cite a Tech-Spec heatup limit. Grepped: no such limit
  exists in `pwr_config.js` or `pwr_control.js`. The engine computes the rate and enforces nothing.
- `accumulator_pressure_mpa` reads like the injection driver. `stepAccumulators`
  (`pwr_primary.js:99`) gates injection on cold-leg pressure vs the **fixed** `accumulator_trip_mpa`.
  Indication only. (Same trap as #225 — twice in two sessions, so it is worth naming.)

**Verified in the product, not just packed.** Playwright: open the manual the way a player does,
chapter 12 is in the nav, the body renders, 22 tables, zero page errors.

**Gates.** `run_all` **26/26 at baseline**. No engine, control or scenario code touched.

---

### 2026-07-28t — #225: the §6.3 `true_state` contract, documented in full and gated  ✅

**What shipped.** Two halves, and the second is the durable one.

1. **All 29 undocumented PWR `true_state` fields** now carry a line in `Blueprint/CONTEXT.md`
   §6.3, placed beside the fields they relate to rather than appended as a block.
2. **`test/run_contract.js`** (new gate, in `run_all`'s `BASELINES` at `84checks 0failed`)
   diffs `Object.keys(getTrueState())` against the §6.3 block and fails **both** directions:
   an engine field with no doc line, and a doc line for a field the engine no longer emits.

**The filed count was wrong, and that is the finding.** #225 said 41 of 82. Measured before
acting: **29 of 84**. Twelve of the 41 had been documented in the interim synoptic-additions
pass; **two fields the issue never listed had appeared since** (`clad_temp_c` #213,
`cw_inlet_temp_c`). A hand-written list of missing fields drifted in both directions while it
sat in the issue — which is the argument for item 2 over item 1. Probe:
`Object.keys(new RD.PWREngine().getTrueState())` vs the fenced block under `**PWR:**`.

**Gate validated against the OLD behaviour (HR10).** Three runs, not one: against
`git show HEAD:Blueprint/CONTEXT.md` it fails with exactly the 29 named; against the new file
it passes; with a phantom key injected into the block it fails `STALE 1`. A gate that only
passes on the change it shipped with is a refit, not a check.

**Two things checked rather than inferred** (both would have shipped wrong):
- `accumulator_pressure_mpa` reads like the injection driver. It is not — `stepAccumulators`
  (`pwr_primary.js:99`) gates injection on cold-leg pressure vs the **fixed**
  `accumulator_trip_mpa`; the cover-gas pressure is indication only. The first draft of the
  doc line said the opposite.
- `tavg_rate_c_per_hr` looked like it should cite the Tech-Spec heatup limit. Grepped: no such
  limit exists anywhere in `pwr_config.js` or `pwr_control.js` — the engine computes the rate
  and enforces nothing. The line now says so instead of inventing 55 °C/hr from recall.

**Design notes worth carrying.** The engine side is a **union over all 5 initial conditions**,
so a state-conditional field still counts. The doc parse is **fail-loud**: a renamed heading
yields zero keys and the runner exits 2 rather than reporting a clean 0-of-0 — a doc-diffing
gate that passes when it stops finding the doc turns green into evidence. RBMK/BWR are
registered in `PLANTS` with a `skip` reason (on hold; their blocks were never audited), so
reopening is one flag each.

**Still open.** The RBMK and BWR §6.3 blocks have never been diffed. Do it when those plants
reopen — expect red.

---

### 2026-07-28s — #96: the inspection system (hover to name it, expand to learn it)  ✅

**What shipped.** The System Scanner block became the **inspection surface** #96/#69 asked for:
hover anything → `Title — one sentence`; **click the block** → the same hover gives the full
paragraph, a note when the copy describes the whole card, and a **📖 Manual §x.y** button that
opens the operator's manual at the section documenting that object. Expanded/collapsed persists.

**Where the copy lives, and why it is split.**
- `ui/diagram/board/pwr_board_inspect.js` — **160 entries** keyed by diagram item id, reached
  through the driver (`RD.PwrBoardDriver.inspectItem`). Plant prose belongs with the wiring.
- Chrome keeps the M8 §11 inline mechanism (`data-scanner-hint` + new `-detail` / `-doc` / `-sec`).
- Gauge and alarm-tile detail is **generated**, never authored: gauges from `RD.MANUAL`
  (measures / range / lag / alarms driven), alarm tiles from the plant's protection table
  ("Comes in when Average Coolant Temp falls to 552.2 °F"), including the #240 "normally
  classed warning" note. A retune moves the text; nobody has to remember to.

**Three things worth knowing before touching it.**
1. **Containment, not DOM.** Board tiles are absolutely-positioned *siblings*, so "which card is
   this button on?" cannot be asked of the DOM. `boxOf()` answers it from the generated doc
   (smallest box containing the item's centre) and an entry-less item inherits its card — which
   is how the board is fully covered without an entry per authored caption.
2. **Geometry for the unhittable.** `reactorVessel` is `pointer-events:none` so the rod buttons it
   overlaps stay clickable — so the DOM never sees a hover on the single most inspectable object
   on the mimic. `RD.PwrBoard.itemIdAt(x,y)` resolves those by geometry, honouring paint order
   (authored z, then authoring order) so a lifted control still beats the card beneath it.
3. **Two things the copy cannot be trusted on, so they are gated.** `test/run_inspect.js` (7/7,
   35 checks) fails on an orphaned key, on any control/component/indication without its OWN entry
   (inheriting a card's summary *reads* like a real answer), on duplicate copy, and on a **manual
   citation whose section no longer exists** — which it caught on the first run: ten entries cited
   §-numbers from manual 03 while pointing at 08/05. `board_check.html` pins the resolution half
   (95 → **106 checks**).

**Two defects found by driving the real app, not by the suites.**
- The **manual link was unclickable**. Moving the pointer toward it crossed the block, which had
  its own scanner hint, so the block re-rendered and detached the button mid-click. Fix: the
  block never describes itself (`inspectResolve` returns null inside `#scannerPanel`) — which
  also stops it wiping the text you are reading.
- **Subcooling margin read "−18 to 181 °F"**. The generated gauge text converted a temperature
  *difference* as an absolute, because the manual reference records its unit as `°C`. The gauge
  definition already carries `dim: 'tempdiff'` for exactly this reason, so `instrDim()` asks the
  gauge first and falls back to the unit string.

**Owner directive mid-build (2026-07-28):** *"when mousing over something to have it show in the
system scanner it should not highlight the object being moused over. the white box that now
appears around objects the mouse is over is very annoying."* The first cut ringed the hovered
object, per the merged text in #69. Removed — and `run_inspect` **pins its absence**, because the
issue still asks for a glow and the next reader would put it back. `.instr-glow` / `.ckl-glow`
stay: those mark something the player did not choose.

**Fixed size, both states** *(owner, 2026-07-28: "the jumping up and down when moving the mouse
over things is annoying")*. The block sized to its text, so every hover across the board re-laid
out the right column and the Instructor panel above it jumped. The body is now a constant box
that scrolls its own overflow: **74 px collapsed**, **28vh (200–260 px) expanded**. Measured over
an 8-item sweep at 1700×1000 and 1366×768 — panel height and the Instructor panel's top are each
a single value, and the longest entry on the board (Control Bank, 98-char brief / 384-char detail)
still fits without scrolling at the smaller viewport.

**Still open:** #71 (the highlight system — instructor-driven and hover-driven bounding boxes) is
untouched. It shares hit-target geometry with this, and `itemIdAt` / `tileFor` are the primitive
it should consume rather than re-derive.

**Gates:** `run_all` **25 runners** at baseline (new `run_inspect.js` 7/7 35/35); `board_check`
**106/106**; `verify_e2e_ui` and `verify_manual_follow` unchanged and green.

---

### 2026-07-28r — #240: mode- and lineup-dependent alarm classification  ✅

**Owner ruling** *(2026-07-28, on #240: "Go with #1 Mode-dependent severity/suppression and
number 2.")* — reclassify by mode, and reword RCP TRIP when the pumps were secured rather
than lost. Option 3 (spawn pre-acknowledged) was **not** chosen; see the open item below.

**The defect, reproduced before touching anything.** A fresh `cold_shutdown` spawn stood up
**5 unacknowledged alarms, 2 critical** (`pzr_pressure_lolo`, `rcp_trip`). All five
conditions are true; all five are what a planned Mode 5 lineup *is*.

**Evidence pass first (the SOP from 2026-07-28q), and it paid.** The issue's premise —
"real plants handle this with mode-dependent alarm suppression" — was recall, and it turns
out to be sourceable almost verbatim:

- **NUREG-0700 Rev 4** (ML26022A094) **§4.1.2-7 Mode-Dependence Processing**: *"If a
  component's status or parameter value represents a fault in some plant modes and not
  others, it should be alarmed only in the appropriate modes."*
- **Table 4.1** (Nuisance / Plant Mode Relationship) and its class description gives *our
  exact case* as the worked example: *"the signal for a low-pressure condition may be
  eliminated during modes when this condition is expected, such as startup and cold
  shutdown, but be maintained when it is not expected, such as during normal operations."*
- **Table 4.1** (Nuisance / **Status-Alarm Separation**): *"separates status annunciators
  from alarms that require operator action"* — that is option 2, named.
- **§4.1.2-8 System Configuration Processing**: a reading *"may not be relevant when the
  fluid system is taken out of service"* — the secured-RCP case, and the reason that rule
  keys on the handswitch rather than on the mode.
- Two guard-rails came from the same document rather than from taste. **Reclassify, never
  filter**: *"only alarms that can be demonstrated to have no operational significance to
  users should be filtered… Alarms that are considered redundant or lower priority should
  be suppressed (where users can retrieve them) rather than filtered."* And **§4.3.6-3**,
  which warns personnel may misread an alarm if they do not realise a mode-defined change
  took effect — hence every reclassified label says *why*, and the tile reads
  `status (normally critical)`.
- Fetch: nrc.gov 403s non-browser requests; `web.archive.org/web/2023id_/<url>` + curl with
  a browser UA worked, then pypdf into the scratchpad (no poppler on this box).

**Built.** `reclassify` — an ordered rule list on an alarm spec, resolved in
`control_kernel.getAlarms()`. A rule matches on `instrument` + `in` (a reading among listed
values) and/or `condition` (a boolean status instrument), and supplies a replacement
priority and labels. It can only ever *soften*: `_evalAlarms` never sees these rules, so a
rule cannot suppress, delay or invent an annunciation, and an unresolvable instrument falls
through to the authored priority. New status instruments `plant_mode` and `rcp_secured`
(passthroughs — no PRNG draw, so the noise stream is byte-identical).

**HR3 caught the first draft.** The rule shape was originally `modes: [4,5]`, which put
`ins.plant_mode` — a PWR instrument name — in the general kernel. `run_hr3` failed
(`:611 plant_mode [pwr]`). Fixed properly rather than allow-listed: the rule now carries the
instrument name as data, so the kernel names no plant field. *That gate earned its keep.*

**Scope decisions, stated because they are where this can go wrong:**
- **Modes 4 AND 5** for the cold-side rules. A cooldown crosses both pressure setpoints long
  before Tavg reaches 93 °C (RHR entry is 2.76 MPa), so a Mode-5-only rule would still bury
  a planned cooldown.
- **Mode 3 deliberately excluded.** It is where the plant sits post-trip and where a real
  depressurization must read at full severity. It is also self-protecting: primary Tavg pins
  near 300 °C for every modelled break, so a LOCA cannot demote its own alarms by dragging
  the plant "cold".
- **RCP keys on the handswitch, not the mode** — securing at power is planned; a pump lost
  in Mode 5 is still a casualty. `rcp_secured` is set by `set_rcp{running:false}` only when
  the command takes effect, and cleared by *every* fault route (`stop_pump`,
  `coast_down_pumps`, `full_blackout`). Old saves infer it from the lineup and default to
  "not secured" — the conservative direction.
- **Residual, not hidden:** a real leak during a Mode 4/5 cooldown reads as Status on the
  pressure annunciators. The alarms that distinguish it (`subcooling_low/lost`,
  `pzr_level_low/lolo`) carry no rule and stay critical. Written into the manual as an
  instruction, not buried in a comment.

**Gates.** `run_m4` **19/19 86 → 23/23 117** (four new suites; `BASELINES` + CLAUDE.md
updated together). Everything else at baseline; `run_all` green. Per HR10 the new suites were
run against the **pre-#240 source** (`git stash` of the four files, tests kept): every
substantive check in the two "must not move" suites passes on the old code — PZR PRESS LO
stays warning, LO LO stays critical, TURB TRIP stays warning post-trip, lifecycle and ACK
unchanged — and the only pre-#240 failures there are checks reading machinery that did not
yet exist. Both "must change" suites fail wholesale on the old code. One suite also strips
the rules at runtime and asserts the old two criticals return, so the gate is measuring the
rules and not some property of the cold IC.

**Found while there (fixed, small):** the manual's alarm index was missing two modelled
annunciators — **LO TAVG (P-12)**, which now has a response procedure (**PWR-A29**), and
**RCP CAVITATION**, which now has its setpoint row. Manuals repacked; revision history Rev 4.

**Open, owner's call — recorded on #240.** The five tiles still spawn **unacknowledged**;
only their severity and wording changed, since option 3 was not chosen. NUREG-0700's
"status-alarm separation" arguably says a `status`-class tile should not demand operator
action at all — but that is a question about the whole `status` tier (`hpi_active` has
always required ACK), not about this fix, so it was not changed unilaterally.

### 2026-07-28q — #205 evidence pass: reactivity balance sourced against real plant data  ✅ (no code changed)

**New SOP, owner directive** *(2026-07-28: "All sim plant designs should be based on real
plant documentation.")* — prototypicality claims are sourced, never recalled. Recorded in
`CLAUDE.md` beside HR9/HR10.

- **#205 closed as NOT A DEFECT.** The symptom reproduces exactly (`pwr_startup` ends at
  13.6 % power, bank 244/912 = 26.8 % wd, boron 363 ppm start to finish, no boron command in
  17 steps). Its *fix* is inverted: dilution is positive reactivity, so it drives the bank
  DEEPER. Measured at fixed rods from `5_percent` — dilute 829→229 ppm ran power 6 → **256 %**;
  borate 829→1429 ppm took it 6 → **0 %**.
- **One of my own interim findings was wrong, recorded so it isn't repeated.** I claimed the
  boron trend across the ascent is inverted (rises 363 → 734 ppm HZP→HFP). That compared two
  states at *different rod positions* (25 % vs 92 % wd) and is meaningless. Normalised, the
  balance closes: rods release 7230 pcm over that travel; power defect 3630 + extra boron
  3710 = 7340 pcm (1.5 %). At fixed 92 % wd boron FALLS ~352 ppm across the ascent against a
  363 ppm power defect — right direction, right magnitude.
- **Every coefficient measures in range**: boron worth 10.0 pcm/ppm (real ~7–12), Doppler
  defect −989 pcm (~1000–1400), equilibrium Xe 2500 pcm (~2700), moderator −141 pcm under the
  Tavg program.
- **The one outlier — rod worth 18 500 pcm** (control 8500 + shutdown 10 000) against **6466
  pcm measured for ALL banks** at Watts Bar/BEAVRS. That is why rods hold the core at 363 ppm
  and criticality lands at 25 % withdrawn where a real plant is near ARO at ~975 ppm. Parked
  in **#238**, not fixed — it is a real physics constant.
- **Sources** (nrc.gov 403s non-browser fetches; use `web.archive.org/web/2023id_/<url>` +
  curl with a browser UA. No poppler on this box — `pip install --target ./pylibs pypdf` into
  the scratchpad and extract text, don't try to Read the PDF):
  - **BEAVRS / Watts Bar U1 Cycle 1 HZP physics tests**, OSTI 1991715 — *measured*: HZP ARO
    critical boron 975 ppm; bank worths D 788 / C 1203 / B 1171 / A 548 pcm; all banks 6466
    pcm; ITC ARO −1.75 pcm/°F.
  - **WTSM 2.1 Reactor Physics Review**, ML11223A207 — the power defect is offset "in the form
    of rod withdrawal **or** boron dilution"; minimum rod height rises with power (our RIL).
  - **AP1000 DCD Ch. 4.3**, ML071580897 §4.3.2.4.16 — **MSHIM**: "power changes are primarily
    accomplished using control rod motion alone… above 30 percent rated power… without the
    need to change boron concentration." **A rod-driven ascent is prototypical**; #205's
    "a real startup dilutes as it withdraws" is classic-Westinghouse practice, not a rule.
- **Also recorded, not fixed:** `_trimToCritical` (`pwr_engine.js:1433`) hardcodes
  `var margin = 0.01` (1000 pcm) for every subcritical IC — unnamed, not `[tune]`, not
  per-IC. Measured cost of moving it: at 1500 pcm the startup ladder collapses (authored rod
  bursts never reach criticality, `power_pct > 0.2` observes 0). Parked with the rod-worth
  entry.
- **Unsourced, flagged:** no numeric tech-spec Mode 3 SDM requirement found (the AP1000 DCD
  defers to plant tech specs). An earlier "~1300 pcm" of mine was recall — do not act on it.

### 2026-07-28p — #230: `disconnect_grid` is a PLANNED OFFLINE, not a turbine trip  ✅

`status-needs-ruling` issue, settled. **OWNER RULING 2026-07-28: option 1, "Planned
offline, no trip."**

- **Verified first — the issue was live, not stale.** Measured engine+M4 before touching
  anything: `disconnect_grid` @100 % → immediate scram, reason `turbine_tripped is_true`;
  @6 % → latches `turbine_tripped`, still true 600 s later, only `connect_grid` clears it.
- **The finding that decided it.** `set_load_target 0` @100 % → **no trip, turbine stays on
  line**. That is what the TR-1 probe actually drives (`behavior_pwr.js:250`). So the
  ride-out was already modelled as its own mechanism and this was a **command mapping**,
  not a missing behaviour — which is why option 1 costs almost nothing.
- **Change.** `RD.LoadMode.offline(s)` added beside `disconnect(s, tripFn)`; PWR's
  `disconnect_grid` and `set_load_mode 'disconnected'` route to it. `setMode` now always
  zeroes the target for 'disconnected' (it used to do that only when a `tripFn` was
  passed, so a trip-free caller got the mode set and the target left standing). `_scram`,
  MSIV-at-load and `trip_turbine` still trip for real. **RBMK/BWR untouched** — they still
  pass `tripFn`, and they are on hold.
- **Board.** The OFF lamp keyed on `turbine_tripped`, so after the fix a normal disconnect
  left the whole FOLLOW/MAN/OFF selector dark. Re-keyed to `load_mode === 'disconnected'`
  (the trip path sets it too, so both ways of being off line light it).
- **TR-1d** added to the behaviour battery and the catalog. Per HR10 it was validated
  against the OLD engine: the three claim-bearing checks FAIL there (`turbine_tripped
  is_true` scram at 100 %, latched flag at 5 %) and pass here. `run_behavior` 37 → **38**;
  BASELINES and CLAUDE.md updated together.
- **`board_check` 84 → 95** (+11 on the selector). Ordering bit twice while writing them:
  the harness stops the RCPs at full power near the top of its functional section, so the
  plant is **already scrammed and turbine-tripped** long before the ESF block. The checks
  now establish their own precondition (`connect_grid`) and hand the plant back tripped
  and off line. A `precondition:` check states the assumption so the next failure says
  which assumption broke.
- **Known limitation, deliberately not fixed.** The rotor still coasts down after a planned
  offline. A real unit holds rated speed on no-load steam ready to re-synchronise, but this
  engine has no no-load admission model — the unloaded branch coasts to rest by the same
  logic #235 added to stop cold Modes 3/5 pinning 1800 rpm. Protection semantics were the
  ruling; speed-hold is a turbine-model question (cf. #238).
- **Gates.** `run_all` **24 runners at baseline**, `board_check` **95/95**.

### 2026-07-28o — vital tiles preload a flat 3-minute trend  ✅

The ask: *"I want the 6 vital gauges at the top to start with the full amount of data on
the graph starting from a preload… make it seem like the plant has been running."* Then,
after a first attempt: *"It should be flat as if the plant was at steady state just like
the graph at the bottom. The issue that made me think it wasn't preloaded was an odd tail
at the beginning of the trend line."*

- **Fix.** `comp_indicator_panel.js:update()` now lays down a full `WINDOW_S` (180 s) of
  flat samples at the first reading that carries sim time, gated on a `seeded` flag rather
  than on an empty buffer — `build()` calls `update()` once with the authored config value
  and **no `t`**, and that untimed placeholder must be dropped, not left anchoring the
  trace. Re-seeds after a rewind and after `reset()`.
- **What the "odd tail" actually was.** Not a missing preload — x is already on a fixed
  180 s time axis, so a fresh trace is a stub against the right edge, and the area fill
  rises vertically from the baseline at the trace's *left* end. That riser sat stranded
  mid-card. With the preload the trace starts at `x = PAD`, so the riser is at the tile
  edge where it belongs. Measured, not eyeballed: all six tiles span x `5.4 → 235` from
  ~2 s in, y-span ≤ 1.2 px of a 26 px plot (flat), trend arrows `–`.
- **This reverses a documented deliberate departure.** The file's header called out "NO
  SYNTHETIC HISTORY" on HR1 grounds (an agent's call, not a ruling). Superseded by the
  owner ruling above and rewritten in place with the quote. The HR1 line still holds where
  it matters: the preload is **flat**, so it asserts only that the reading was steady and
  never invents an excursion. A random walk would still be out.
- **Wrong tree first, worth recording.** I spent the first pass in `ui/app.js`'s
  `renderGauges` / `#gaugeStrip` — which *is* a six-gauge vital strip with sparklines, a
  60 s window and a #237 flat preseed, and is **`display:none` on the PWR board**
  (`.app.pwr-synoptic`). It is the legacy strip, live only for RBMK/BWR. Diagnosis was
  `getBoundingClientRect()` returning zeros for elements that were plainly on screen. Those
  edits were reverted whole. **If you are changing what the player sees on the PWR board,
  confirm the element is the one being painted before editing** — `.bd-tile svg` under
  `RD.PwrBoard`, not `#gaugeStrip`.
- **Gates.** `board_check` **PASS** (84/84 — an earlier draft of this entry said "912
  checks", which was a bad read of the harness output, not a new tally), `verify_e2e_ui` **PASS** (16
  screenshots), `verify_flags_ui` **48/48**, `verify_manual_follow` **PASS** (84 checks).
  No engine/control/scenario file touched, so the non-browser runners are unaffected.

### 2026-07-28n — #241 feature flags: ship the build, offer a subset  ✅

The ask: toggle features off for the public site and on for `develop`, so unvetted
scenarios / campaign / checklists don't reach visitors before the owner has played them.
`run_all` **24 runners at baseline** (+2 new gates). Owner decisions taken in-session:
**"Everything off except Free Play"** and **"Coming soon at area level, items hidden"**.

- **Mechanism.** `site/flags.js` = registry (`public` | `preview` | `off` per feature and
  per content id) + resolver. `site/channel.js` = the channel, **stamped at deploy** by the
  existing Vercel build step from `VERCEL_ENV` (production/`main` → `public`, preview/
  `develop` → `preview`; repo copy is `dev`). Resolution: override → `public` on →
  `off` off → otherwise on unless the channel is `public`. **Unregistered ids fail closed.**
- **Why not a per-branch config file** (the obvious first design): `develop → main` carries
  it, so the merge that publishes also flips every flag on. The stamp is the only
  discriminator that survives the merge without hand-editing.
- **Toggles for the owner**: 🧪 Features window (Sim tab, dev builds; `?flags=1` on any
  channel), one switch per flag, plus **view as public/preview/dev** which re-resolves the
  whole app — that is how you look at `develop` as a visitor will. Overrides are
  localStorage, per-browser, and never touch what ships. URL form `?flags=+id,-id` /
  `all` / `none` is per-load and deliberately NOT persisted.
- **Two defects found by driving the real page, not by reasoning about it** — both worth
  remembering:
  1. `.set-row { display: flex }` **beats the `hidden` attribute**. `featureRow.hidden`
     read back `true` while the row sat on screen, so a DOM-property assertion passed and
     the screenshot disproved it. Fixed with `.set-row[hidden] { display: none }`;
     `verify_flags_ui.js` now asserts **visibility** everywhere, never properties.
  2. **A second entry point to checklists** — the instructor card's 📋 picker
     (`instrCklRow` / `toggleCklMenu`) — was gated nowhere in the first pass. When you gate
     a feature, grep for *every* way in, not the one the issue names.
- **Gates.** `run_flags.js` (16/16, 290 checks): registry coverage (every scenario,
  procedure and campaign mission has an entry; no entry points at renamed-away content) +
  resolution asserted from BOTH sides. Falsified before trusting — dropping an entry,
  stubbing the resolver to `true`, typo'ing a call-site id and renaming content each turn
  it red. `verify_flags_ui.js` (48/48): the control room obeys the flags, against a build
  with `RD_CHANNEL` pinned to `public` (a real `main` deploy, reproduced without editing a
  tracked file).
- **Known consequence, not a bug:** the first-run **Hook is a scenario**, so the public
  channel currently opens with no intro offer. `scenario:pwr_hook` → `public` restores it
  the moment the owner is happy with it.

### 2026-07-28m — #237 comment items (missed in the first pass)  ✅

**Process miss worth remembering: the first #237 pass worked the issue BODY and never
pulled the COMMENTS** — six owner comments (17:51–18:00Z) went unread, one of which
("go with (a) SI board-wide") contradicted the in-session AskUserQuestion answer. Owner
re-confirmed in-session: **the scoping stands**. Always `gh issue view --comments`.
board_check **84/84** (81 → 84).

- **30-min steady-state preseed**: a fresh chartBuf seeds CHART_RECORD_SEC of flat
  samples at the first snapshot's values (any new timeline: boot/reset/switch/mission);
  gauge sparklines seed their 60 s window the same way. The plant no longer "just
  appeared"; the cutoff trim retires the synthetic tail naturally.
- **PZR TEMP + HTR PWR indications** (EXTRA_ITEMS pair right of the vessel's heater
  zone): temp = satTempC(primary_pressure) — same source as the vessel's water colour;
  heater = `cs.heater_power_pct`, which IS the live actual output under AUTO
  (engine publishes heater_power_frac·100, pwr_engine.js:565). Pinned (600–700 °F).
- **Colour checks measured, two verdicts**: PZR internal water = already correct (live
  saturation). **Internal spray pipework was static cold-blue preset** — now takes a
  `sprayTemp` prop (tcold) with in-place stroke repaint (rebuild would restart dashes,
  #233 class). Feed line: owner premise "feed is preheated to SG water temp" is NOT
  prototypical — real final feedwater ≈ 227 °C vs SG sat ~285 °C; our fwTemp tops at
  220 °C ✓ model kept, evidence in the close-out.
- **SG feed flange leveled**: fw-in port + flange local y 245 → 269 (world ≈ 436 = feed
  tee level); pinned by a plumb check (subtraction, not judgement).
- **Hot/cold contrast retuned** (std_pipe rampT): the at-power RCS band 285–322 °C now
  owns 0.50–0.90 of the ramp — cold leg GREEN vs hot leg ORANGE-RED (was yellow vs
  orange, 0.12 apart). Only PZR saturation reaches deep red. Mode 5 still blue.
- **Paused veil is clickable to resume** (ctx.resume routed through the play button so
  ▶/⏸ stays the single source of truth).

### 2026-07-28l — #237 UI/UX pass: focus model, SI scoping, Automate sweep, alarms, deadband, failures lock  ✅

Owner: "Work 237" + AskUserQuestion ruling: **SI toggle scoped (option b), full SI parked
in #238**. board_check **81/81** (79 → 81, ROD AUTO pins); `run_all` 22 at baseline.

- **Instructor focus model rewritten** (`setFocus` → applyFocus/toggleInstructorCard/
  focusTools + instrAttention): NO focus steal on messages (badge + glow cue, TRIP BLOCKS
  grammar); persona header survives chat-mode (shows the SCENARIO TITLE — a scene, never a
  speaker, per the instructor-vs-supervisor rule) and is the always-visible collapse
  toggle; active-tab re-click collapses the tools; all three layouts reachable while live.
  Content transitions (start/level-complete/gate feedback) still take the column — those
  are player-caused. Collapsed chat card = transcript sliver pinned to its tail (the
  latent one-line-ellipsis hazard from the #235 comment is styled out).
- **ROD AUTO added to the board** (EXTRA_ITEMS + TRIP BLOCKS resized via DOC_PATCHES):
  the sweep exposed that `rods_tavg` had NO control in the shipped UI (its AUTO/MAN lived
  only in the retired synoptic) — the pwr_rod_auto mission directed players at a control
  that did not exist. run_campaign green all along because it drives COMMANDS (gate
  can't see missing UI; verify_manual_follow covers procedures, not scenario beats).
- **Automate-tab sweep**: manual_procedures ×4, five PWR scenarios, campaign teaches
  line, gen_manual_reference glossary/controls, Manuals 02/03/04 + crosswalk; repacked
  (pack_manuals + gen_manual_reference). Left: `rbmk_ar.js` (ON HOLD), historical record
  docs (records, not policy). **Stale claim disproven while sweeping** (#237 §7): "number
  inputs commit only on blur" — `pwr_board.js:444` has had Enter→blur; no change.
- **Alarm stamps**: UI-side first-seen sim-time per alarm (`alarmSeen`), `T+hh:mm:ss` on
  each tile, newest-first WITHIN severity (severity keeps triage), rewind discards
  future stamps, Ack All toasts its count.
- **Trend arrows**: deadband + hysteresis on the displayed value (±1 least-significant
  display digit over the 60 s window, clear at half / on direction flip) — replaces the
  0.2 %-of-range-over-5-samples rule that flickered at steady state.
- **Failures lock**: `ui_policy.failures:'locked'` renders the tab inert + note; authored
  on pwr_tmi2_p1/p2/p3. UI-side only — the command path is NOT gated (an instructor-layer
  intercept would be the hard enforcement; note in #237 close-out). `pwr_tmi` flagship is
  a candidate but was left (not a chat scenario; needs its own look).
- Polish: STEAM PRESS spacing (DOC_PATCHES: value anchor 1850, caption 1670), Help
  overlay explains rewind-pick aiming, chat "⏩ reveal all" (display-only, instantThrough).
- **Gate amendment (HR10, both sides):** `verify_e2e_ui` asserted the SI toggle converts
  the pressure gauge to MPa — the half-feature #235 measured as incoherent. Re-authored
  to pin the OWNER-RULED behavior: SI button DISABLED on PWR, click no-ops, gauge stays
  psi. The new form fails on the old code by construction (button was enabled there);
  revert to a convert-to-MPa assertion when #238's display-unit layer lands.

**Gotcha (workflow):** the Bash tool collapses `\\` in heredocs/inline scripts — a Python
in-place edit that "succeeded" had actually no-op'd (old==new after collapse) and a JS
apostrophe fix had to go through the Edit tool. Verify replacements landed; node --check
every edited JS file.

### 2026-07-28k — V2 board correctness pass: #235 defects + #236 pipe flows fixed  ✅

Owner: "Work 235 and 236." Both closed. **board_check 59 → 79/79** — the #236 test gap
(pipe animation vs plant state was never asserted) is closed with a new
`RD.PwrBoard.pipeFlowState(id)` API + 20 pins across three plant states, and every #235
finding is pinned too. `run_all` 22 runners at baseline.

**#236 (pipe flows) — the mechanism fixes:**
- `comp_pump.js`: `lastOn` init `false` → `null` so the FIRST update writes the port
  gates. A pump spawning OFF left its pipes animating forever (RWST→ECCS suction at power).
- `comp_tee.js`/`comp_cross.js`: port `data-active` now includes `!moving` — a fitting
  driven `flowing:false` stops the pipes joined to it, not just its interior. This is what
  stilled the Mode 5 primary loop (23/37 pipes animated on a dead plant before).
- `comp_turbine_generator.js`: its ports had NO data-active attribute (missing ≠ '0' =
  always-on); now gated on flowFrac.
- **Fourth defect found while fixing: `comp_valve_horizontal` dropped the `flow` prop
  entirely** — update() never read it, applyState never gated on it. Any horizontally
  mounted valve (MSIV!) ignored its driver's flowing:false. Now matches the other variants.
- Wiring: MSIV gains `flowing: sg_steam_flow > 0.01`; PORV block valve gains the porv
  comp's own `open && blockOpen` truth (dead-ended line still when seated) + live satTempC
  body (was static 250); AFW block valve gates on MEASURED afw_flow (was commanded
  afw_active — the two halves of the line disagreed).
- RCP suction/discharge swap (P5) done locally via DOC_PATCHES (extended to support
  absolute item/pipe prop sets, null = delete): pump nozzle angles swapped so suction is
  the loop-inlet side, pipes re-bound to the honest port names at the same positions,
  compensating `flowDir:'fwd'` dropped. Idempotent; fold into the builder and delete.

**#235 (board defects):**
- ECCS MODE readout: `IN(s).eccs_mode` never existed — reads `CS(s)` now; Mode 5 shows RHR.
- Turbine 1800 rpm in Modes 3/5: untripped/no-load branch gained the windage term
  (`− rpm/coastdown_tau`); zero-load ICs (`P0 > 0.01` test — **gotcha: the subcritical
  states author `power: 1e-6`, so `P0 > 0` is TRUE for them**) spawn rotor at rest.
  **Finding: the branch's "accelerates toward overspeed" was already inert** (≤0.02 rpm/s
  at authored constants, ~2.5 h to the trip; nothing tests it) — parked in #238.
- Chart legend renders bounds through each series' `fmt` (same conversion+unit as the
  chips) + entry margins.
- Geometry WITHOUT re-export: DOC_PATCHES moves/widens the STEAM DUMP readout
  (1416/72) and fixes "d TEMP AVG"→"Δ TEMP AVG"; `.bd-ro-label` letter-spacing normal
  (tracking alone cost 7 px) and buildNumber hint 0.14em→0.06em (the whole DUMP SETPOINT
  overflow).
- Count drift (F6): "60/60" never matched code (was 59) — CLAUDE.md now records 79/79;
  historical log entries left as written.

**Open from the pass:** #235 F7 (Mode 5 standing alarms — needs ruling); surge-line
static-direction limitation, RWST cross-tie cosmetic, natural-circ display note — all
recorded in the #236 close-out comment.

### 2026-07-28j — #220 evidence pass: all ten real-plant claims verdicted against primary sources  ✅ (no code changed)

Owner: "Do #220." The evidence pass the issue asked for — verdict + source per claim,
**nothing fixed** (decisions get revisited with the evidence in hand). Full verdicts with
verbatim quotes + ADAMS accession numbers: **#220 comment (2026-07-28)**.

**Tally: 7 VERIFIED, 2 PARTLY VERIFIED, 1 verified-with-a-gap — none WRONG.** The recall
was good; the value is the numbers now attached. Highlights:

- **C-7 is real and #219's latch is structurally vindicated**: WTSM 11.2 (ML11223A294) —
  loss-of-load signal (C-7) = ramp >5 %/min OR step >10 %, sensed from turbine impulse
  pressure, arming the Tavg dump controller; C-8 = turbine-trip arm; C-9 = condenser
  available. Our washout IS the ramp path. Open `[tune]` question: our 40 MWe arm is far
  coarser than the real 10 %/5 %-per-min.
- **Dump capacity: 40 % standard** ("In most Westinghouse units the capacity of the steam
  dump system is 40%"), and **P-9's documented basis is exactly dump capacity** (WTSM 12.2).
  RT-on-TT is anticipatory and **uncredited in safety analyses** (Salem TS Bases: "No
  credit was taken"). Our 105 % dump is a named departure with an AP1000 analog (DCD 8.3
  full-load rejection to house load) — but needs an HR9(c) declaration, and
  `pwr_control.js:95-97` currently recites the REAL plant's capacity premise, not ours.
- **P-9 = ~50 % nominal but plant-specific** (Vogtle moved to 40 % in 2007); plants without
  P-9 arm at ~10 % via P-7 — the origin of "10 %" claims.
- **1 DPM is a real administrative limit** (McGuire OP/1/A/6100/05 "Do not exceed a stable
  startup rate of 1 DPM"; Turkey Point 2020: exceeded it, tripped on SR 1e5 cps — the
  administrative/automatic split our plant reproduces). Our 1.5 DPM withdrawal *block* has
  no real analog (real plants: IR rod stops on level, not rate) — teaching aid, name it.
- **AFW start list verified** (WTSM 5.7 five-condition list); real plants use ONE lo-lo
  level signal for both trip and AFW start — our 20 %/17 % split is an invention.
- **Boron: grab-sample titration verified**; "plants abandoned boronometers" fragment
  COULD NOT ESTABLISH — drop it from justifications.
- **Stale comments found (recorded, not fixed)**: `pwr_steam_generator.js:162-164` still
  says "no anticipatory reactor trip exists" (untrue since #216).

**Gotcha (workflow):** nrc.gov 403s all non-browser fetches; Wayback `web.archive.org/web/2023id_/<url>`
+ curl with a browser UA gets the real PDFs. Spot-verified the load-bearing WTSM 11.2
quotes verbatim from the extracted PDF text before posting — the subagent quotes were exact.

**Proposed process fix (in the #220 comment, needs ruling):** prototypicality claims used
to justify plant changes carry their source in the comment ("WTSM 11.2", ADAMS number).

### 2026-07-28i — decay-heat residual through un-scrammed runbacks + follow-mode draw (#229, #132)  ✅

Owner: "Work #229." **Fixed, `run_all` 22 runners at baseline (`run_ops` back to exactly
57/68 — the same 11 RBMK/BWR + C2).** #132 was the same defect behind a phantom ruling;
both closed.

**Physics** (`pwr_engine.js` step 4): `_Q_total = _P·(1−f0) + (_H1+_H2)`, f0 = H1_0+H2_0
(0.07), **branchless**. Identical at every steady state (P·0.93 + 0.07·P = P) and in every
fission-collapsed regime (scram, MD-5 ATWS void-out → pure decay tail), so all
calibrations hold; through a runback the residual above the new equilibrium now persists
on its τ≈33 min tail (measured: 6.6 % → 3.2 % over 45 min on a full collapse). Also kills
the old form's Q step-discontinuity when P crossed the decay floor.

**The consequential fix it forced** (`load_mode.js` + `pwr_engine._loadModeOpts`): follow
mode tracked **flux** (`_P`) — correct only while Q ≡ P. With the residual real, a
follow turbine pinned at indicated power leaves ~2 % of rated with NO consumer: measured,
the ops daily cycle banked it into Tavg 314 (dump crack point), pzr 96.6 %, **trip on the
up-ramp** (dump closes as its load-programmed reference rises — the stored energy never
leaves). The module's own intent comment says "the turbine extracts what the reactor
MAKES" — which is now `_Q_total` — so follow gains an `extractFrac` hook (PWR supplies
Q_total; RBMK/BWR untouched, they fall back to `powerFrac`). Cycle now completes: pzr max
55 %, Tavg on program, up-ramp runs correctly ~2 °C cool while the inventory rebuilds.

**Probe amendment, validated BOTH sides (HR10)**: `ops_normal_shutdown` never took the
generator offline — under flux-tracking follow that was invisible (draw → ~0 subcritical
≈ offline), under honest physics the synced turbine draws the decay steam and pins Tavg at
279 °C with the dump shut (any temperature is an equilibrium — no restoring force). Real
shutdowns take the turbine offline at low load; the probe now does
(`set_load_mode disconnected` before the standby soak) and its "hot standby on the dump"
claim is finally literally true. The amended probe passes on the OLD physics too.

**Gotcha:** `extractFrac` is a per-plant opts hook, not a change to shared `powerFrac` —
RBMK (`rbmk_thermal` sets `_Q_total = Q_total` incl. graphite) and BWR (scram-gated decay,
same pre-#229 pattern) would have moved. The BWR twin defect (decay gate ALSO missing the
MD-5 fission-collapse form) is filed on hold: #239.

### 2026-07-28h — partial core uncovery now damages the core: exposed-clad hot node (#213)  ✅

Owner-filed #213: "Core damage doesn't happen on partial core unrecovery." **Reproduced,
fixed, gate green (`run_meltdown` 8 → 9, `run_all` 22 runners at baseline).**

**The defect.** Damage keyed solely on the whole-core-average `fuel_temp_c`, and fuel→coolant
coupling only degraded below `significant_uncover` (0.50) — so a core held at 50–70 %
inventory (top of core exposed by the model's own contract, `core_top_uncover: 0.70`) read
as fully cooled forever. Measured: scram → stuck-PORV bleed to 60 % → isolate → **2 h hold:
fuel sits at ~305 °C, damage NEVER** — while TMI-2 was destroyed by exactly this condition
in under an hour. `core_top_uncover` and `void_onset` were **dead config** — nothing
consumed them. The M1 spec (§6.5/§6.10) carries the same simplification; HR9 puts the
physics above it.

**The fix** (`pwr_thermal.stepCladding`, called before `checkDamage`): a peak
exposed-cladding hot node `s.clad_temp_c`. Uncovered fraction ramps 0→1 across
`core_top_uncover`→`significant_uncover`; while exposed the node heats at
`clad_heat_gain·_Q_total·f` (≈0.9 °C/s at early decay heat — severe-accident order) against
weak steam convection toward Tsat (`clad_steam_h`, sets the equilibrium gradient: grazing
uncovery late in decay stabilizes below 1200 °C, deep or early uncovery runs away); when
re-covered it quenches to the wetted-core temp over `clad_quench_tau` (120 s). Damage/melt
judged at max(clad, bulk fuel). Node is floored at the bulk temp so deep-uncovery paths
can't read the "peak" cooler than the average. All three constants `[tune]` in
`pwr_config.js` thermal.

**Gotchas for the next session:**
- `_Q_total`/`_P` are **FRACTIONAL** (1.0 = rated), not % — `power_pct = _P·100`. First cut
  of `clad_heat_gain` was 100× low and the node never moved; nothing NaN'd, it just
  quietly did nothing. Check the units of an engine source term before scaling it.
- MD-9 (new battery path) was written from the intended physics and **run against the old
  engine first — FAIL (damage never), preconditions green** — then the fix turned it. Both
  branches hold inventory strictly > 50 % so the pre-existing bulk collapse can play no part.
- MD-8's EOP recoveries transit the 50–70 % band briefly; peaks unchanged (624/645/723 °C),
  so the node does not over-trigger on a prompt reflood. PWR has **no fuel-temp instrument**
  (truth overlay only — the in-fiction tells stay subcooling/pzr level, prototypical);
  `clad_temp_c` is exposed in `getTrueState`, lazy-init covers old saves (run_m7 green).

### 2026-07-28g — UI/UX review pass: instructor block measured, SI toggle, stale Automate refs (#235 comment, #237)  🔬

Third pass of the verification effort: the control-room UI beyond the board. **Findings →
comment on #235; improvement suggestions → new #237.** Nothing fixed.

1. **Instructor block grow/shrink (owner-reported) is now measured, not felt.** Scenario
   start takes the full column (810 px); ONE tools-tab click locks a permanent 422/422 split
   — no way back to full chat or full tools while live (persona header, the only collapse
   affordance, is hidden in chat mode; `setFocus('tools')` keeps the instructor expanded
   whenever live, app.js:1626-1641). In free play every message dequeue steals the whole
   column non-user (app.js:893) and "Standing by…" never gives it back — mostly latent
   until the #212 free-play instructor lands (a manual scram drew zero commentary).
2. **Units=SI is a mixed display**: chart chips convert (299°/15), the vitals strip and the
   whole board stay US (573 F/2227 psi) — wiring hardcodes MPa2psi/C2F; tile bands are
   documented US (pwr_board_wiring.js:637).
3. **~30 player-facing directives point at the removed Automate tab** (manual_procedures 4,
   scenarios 10+, Manuals 03/04 → manual_md, campaign_data). The live pwr_mode3_to_mode1
   walkthrough step 3 tells the player to open it. HR9 canary; needs sweep + repack.
4. "STEAM PRESS1194 psi" — steam-dump card label/value run together at 4 digits.

Clean: 1366×768 layout, missions window, manual overlay, help, graph/failures tabs,
follow-mode nav + highlight, alarm panel behavior, keyboard guards, chat story clock and
reveal pacing. Suggestions filed as #237: no-steal attention cues + player-owned split for
the instructor block, honest SI toggle (implement or disable like the Realistic button),
Automate-tab content sweep, alarm timestamps, trend-arrow deadband, scenario failure-lock.

### 2026-07-28f — pipe-flow deep pass: all 37 pipes measured in five states (#236)  🔬

Owner: "pipe flows are not correct on a few pipes — go deeper." Measured every pipe's
animation play-state, EFFECTIVE visual direction (recovered from the flow polyline's point
order vs the case polyline + animation name — the CSS name alone is not the direction), port
`data-active`, and live color, at hot full power / AFW+ECCS started / post-scram / Mode 5.
**All findings in #236, nothing fixed.** The mechanism map that made the findings legible:
dashes run iff both endpoint ports are active; only VALVES (unconditional write) and PUMPS
(change-gated write) ever produce inactive; fittings gate ports on contents-empty only and
the big components not at all.

1. **`comp_pump` gating never initializes** — ports created active, written only on change,
   `lastOn=false`: a pump that starts OFF animates its pipes forever (RWST→ECCS suction at
   full power; RCP/feed/charging in Mode 5).
2. **Mode 5 shows forced circulation**: 23/37 pipes animate on a dead plant (`flowing:false`
   stills fitting interiors but not their ports; SG/RV/turbine/condenser have no gating).
3. **PORV line**: block valve wired without the `flowing` arg → PZR→block-valve animates in
   every state while block-valve→PORV is paused — steam flows into a shut valve. (MSIV has
   the same omission — main steam animates in Mode 5.)
4. **AFW line self-contradicts**: valve gates on commanded `afw_active`, feed tee on measured
   `afw_flow` — started-but-not-delivering AFW runs into a frozen downstream segment.
5. **RCP plumbed backwards** (loop enters 'discharge', exits 'suction'), held visually
   correct by an authored `flowDir:fwd` patch — port semantics inverted, fragile to re-export.

Verified CORRECT: all 37 visual directions at power, dump/spray/ECCS-discharge/letdown/
charging/accumulator gating, every live PIPE_TEMP color in every state, dash-grid phase.
Test gap noted in #236: board_check pins pipe existence, not animation-vs-plant-state.

### 2026-07-28e — post-diagram-update verification sweep: findings only, nothing fixed (#235)  🔬

Owner asked for a thorough check of the updated V2 board/UI, findings filed not fixed —
**all in GitHub #235**. Verified clean first: committed `pwr_board_data.js` is byte-identical
to a fresh regen from `inbox/diagram_v2.json` (the 253-byte size gap is UTF-8 vs string
length + CRLF — not content); board_check **PASS (59)**; `run_all --fast` 20 runners at
baseline; `verify_e2e_ui` / `verify_manual_follow` / `run_e2e_controls` all at baseline; no
page errors, no NaN readings, no diagonal pipe segments, all pipe endpoints resolve, RHR
ALIGN interlock holds at pressure.

Findings (details + measurements in #235):
1. **ECCS card MODE readout is dead — always "OFF"**: `pwr_board_wiring.js:346` reads
   `IN(s).eccs_mode`, but `eccs_mode` is only in `control_state`/true state, never
   `instruments`. Mode 5 spawns RHR-aligned and the card still says OFF; a manual HPI start
   flows with MODE OFF. selfTest checks the item is *wired*, not that the source exists —
   that gap is the lesson.
2. **Turbine pinned at 1800 rpm in Modes 3/5**: ICs author rpm 1800 untripped; the
   not-tripped/no-load branch (`pwr_steam_generator.js:310-321`) has no friction term, so
   zero steam ⇒ zero torque ⇒ 1800 forever. The old "1800 rpm while off" bug, back via the
   third branch.
3. **Chart legend prints SI ranges** (app.js:1839, no `conv()`, no units, no separators)
   beside imperial chips.
4-5. Authored-geometry clips: STEAM DUMP readout label (65 px box, 71 px text, 4 px valve
   overlap) and DUMP SETPOINT hint "29-1350 psi" (105 px box, 112 px text). Builder-side.
6. **board_check is 59 checks, not the "60/60" this log and CLAUDE.md record** — count was
   never 60 in current code (one check *added* since #231). Doc drift, #161's failure mode.
7. Question for ruling: Mode 5 spawns with 5 standing alarms (2 critical, incl. "RCP Trip"
   for pumps that are *secured*). Low-Tavg standing is documented correct; the rest unruled.

### 2026-07-28d — flicker, trend cadence and chart labels: all three were measurement, not taste  ✅🔬

`run_all` **22 at baseline**, board_check **60/60**. Alpha 1.8.2.

**Answering "why does the board render at an odd frequency to the sim steps?" — it does not.**
`SimulationService` broadcasts from a `setTimeout` at `NORMAL_MS = 100` (10 Hz; 50 ms during a
transient), and `app.js` coalesces each broadcast onto the next `requestAnimationFrame`. So the
board paints **once per broadcast, 1:1 with sim steps**. The measured 9.6 Hz against a nominal
10 Hz is ordinary `setTimeout` drift — browsers guarantee *at least* the delay, never exactly —
plus the occasional pair of broadcasts collapsing into one 16.7 ms frame. There is no
resampling and no beat frequency. **My earlier note that the sparkline was stamping ~9 identical
samples per plant step was WRONG** and is retracted here: render and sim are 1:1.

**1. Flicker was clear-and-append, not band churn.** #233c quantised the band edges so they stop
changing every frame, which reduced it — the owner reported "still happening, just not as
frequently", which is exactly the signature of a residual cause. `paint()` was calling
`BoardH.clear()` on the trace group AND the chart-band group on EVERY repaint, and
`rebuildGaugeBands()` did the same whenever an edge moved. `app.js` already documents this exact
failure: mutating markup lets the compositor present a frame mid-rebuild. Now pooled — elements
are created once and updated by attribute. **Measured: 0 DOM nodes added or removed over 5 s of
steady running** (previously churning every frame).

**2. The trend cadence — I had made it WORSE.** #233c moved sampling from per-render to a fixed
0.5 s interval to lengthen the window, which dropped the rate from ~10 Hz to 2 Hz and made the
leading edge visibly step. Correct fix: sample every update AND plot against TIME. Index-based x
was a second defect hiding underneath — the trace stretched to fill the width and compressed as
the buffer filled. Now `hist` holds `{t, v}`, entries are dropped by AGE not count, x is
`(t - t0)/WINDOW_S`, and drawing decimates to `DRAW_MAX` points (~2 per pixel) so cost is flat.
**Measured: 9.59 samples/s** (was 2).

**3. The chart labels overlapped by arithmetic.** `drawFloats` spreads colliding chips with a
`GAP` of **11 % of the gutter**. Measured: gutter **174 px**, chip **21 px** — so the gap it
enforced was **19.1 px, smaller than the chip itself**. Any time two traces came close enough
for the spread to fire, the chips it "separated" still overlapped. GAP now derives from the
measured chip height (cached after first paint). Also fixed a latent bug in the same function:
the bottom-overflow correction pushed each item up with `Math.max(2, …)` INDIVIDUALLY, which
could collapse the gap between the top two while "fixing" the overflow — it is one column
offset now, with an even-distribution fallback if the column genuinely cannot fit.

### 2026-07-28c — vital-tile playtest: four defects, two of them latent for the whole V2 board  ✅🔬

`run_all` **22 runners at baseline**, board_check **60/60**. Released as Alpha 1.8.1.

**1. `board_h.js` appended `px` to EVERY numeric style value.** The unit whitelist was
`opacity` and `zIndex` only, so `lineHeight: 1.1` became `1.1px` and `fontWeight: 700` became
`700px`. Both are invalid declarations, which the browser silently DROPS — so the property
falls back to its inherited value and the symptom presents as a layout bug rather than a unit
bug. Measured on the reactor-power tile: the caption's line box was **1.2 px tall** and the
reading's **1 px**, so both texts overflowed their boxes and the number painted on top of its
own label. Every numeric `fontWeight` on the board had also been silently inert since V2 —
nothing set that way was ever bold. Fixed with a proper UNITLESS set (React's list, trimmed).
**If you add a style prop that takes a ratio or a count, add it to that set.**

**2. Tile flicker was band churn at the render rate.** The #233 mode-aware bands recompute
`normLo/normHi` every render from live signals (load for Tavg, the setpoint for pressure);
the tile rebuilds its gauge whenever a band edge changes, so unquantised edges rebuilt the DOM
at ~10 Hz — worst during a transient, which is exactly when load is moving. Band edges are now
rounded to whole display units. Probed: **60 consecutive renders now emit 1 distinct band set
per tile** (was one per render).

**3. The Tavg tile had no cold side at all — and neither did the plant.** `displayScale`
derives the tile window from the TRIP bounds. Tavg has a high trip (335 °C) and NO low trip, so
`loActive` was false and the window ran from the meter's floor (50 °F) to the trip: the green
programme band was ~1 % of the strip in a field of grey. The owner read the display correctly
and inferred the real gap — **there was no low-Tavg alarm anywhere in the protection tables**,
only `high_tavg` and the high scram.
- Added alarm **`low_tavg` at 289 °C** — the P-12 line, ~8 °C below the no-load programme
  anchor, so it is clear at hot standby (post-trip Tavg parks at ~297) and comes in as soon as
  you are genuinely cooling out of the hot band. It stands IN through a Mode 4/5 cooldown,
  which is correct.
- Deliberately **no low-Tavg TRIP**: a PWR does not scram on low coolant temperature. The real
  cold-side protections are this interlock and LTOP. Do not "complete the pair" by adding one.
- `displayScale` now honours an explicit `winLo`/`winHi`, and `tavgBand` supplies a MODE-aware
  window: 540–645 °F hot, 50–350 °F in Mode 5/6. Measured result: window 540–645, green band
  574–584 (~10 % of the strip), low alarm 552 °F, high alarm 594 °F.
- Green band widened from 2.5x to 3.5x the rod controller's ±0.8 °C lockup band. The rods lock
  tighter, but Tavg legitimately wanders wider while load moves, and a band under ~10 °F is a
  hairline on a 105 °F window.

**4. The tile sparklines sampled per RENDER, not per plant step.** The board renders at
whatever rate the browser gives it (**measured 9.6 Hz**) while the sim advances 0.1 s a step,
so the buffer covered ~36 s of plant and drew it as a coarse staircase while claiming a
three-minute window. Now sampled on SIM time at `WINDOW_S/HIST_MAX` (0.5 s), with catch-up in
whole slots so a fast-forward lays down a correctly-spaced trace. A true 3 minutes at any time
acceleration, ~1.5 samples per pixel — reads as a curve, like the strip chart underneath.

**Correction to the #234 entry above — `advanceCycles(1)` is 0.1 s of SIM TIME, not 1 s.**
`measure_noise.js` assumed 1 s (its `metadata.dt` fallback), so the "60 s" windows in that
entry were really 6 s and the display-damping filter was evaluated at the wrong `alpha`. The
CHARACTER of the conclusions holds — white at the instrument, damped at the indicator — but
**do not trust the absolute per-minute figures in the #234 entry; re-measure at dt = 0.1.**
The real board renders at ~10 Hz against a 10 Hz sim, so `DISPLAY_DAMP` sees dt ≈ 0.1 and damps
roughly 3x harder than those numbers imply. Left as-is because the owner's report after that
change was flicker and layout, not "too calm" — but this is the number to check first if the
board ever reads dead.

### 2026-07-28b — #234 resolved: the damping belonged in the INDICATOR, not the instrument  ✅🔬

`run_all` back to **22 runners at baseline** (`run_campaign` 51/51, `run_e2e_controls` 35/35),
board_check **60/60**. Owner agreed the diagnosis and approved the change.

**The mistake, named.** #233 made instrument noise temporally correlated to stop the board
looking twitchy. That is the right VISUAL model and the wrong PLACE: the instrument reading is
the one number both the controller and the board consume, so correlating it changed what the
plant ACTS ON in order to change what you SEE. An 8 s correlation sits inside the CVCS servo's
20 s filter passband, so a servo designed to reject gauge noise started chasing it — that is
`run_e2e_controls`. Any non-zero tau reproduced it (2/3/4/8 identical), which was the tell that
it was structural and not tunable.

**The fix.** One transmitter feeds both the control system and the panel meter, but the meter is
damped harder — a human reading it wants steady, a controller wants responsive. So:
- `instrument_noise_tau_s: 0` — measurement noise is WHITE again at the instrument. Controllers
  see exactly what they saw at baseline, which is why both gates went green with no assertion
  touched and no servo retuned.
- `DISPLAY_DAMP` in `pwr_board_wiring.js` — a first-order filter per indication, applied in
  `IN(s)` so every tile, readout, pipe colour and component prop is damped consistently, cached
  once per snapshot.
- **A first-order filter ON white noise PRODUCES correlated noise**, so the drifting look comes
  out of the filter for free. It also shrinks displayed amplitude — at dt 1 s the displayed
  sigma is sqrt(a/(2-a)) of the instrument's, a = dt/(tau+dt) — so ONE knob per indication
  delivered both things the owner asked for ("still drifts a little", "amplitude may be too
  much").

**PROCESS vs MEASUREMENT noise is the rule that decides where a number lives.** `sg_level` keeps
its `noise_tau: 2.5` at the INSTRUMENT, because narrow-range level noise is the water genuinely
moving (boiling, shrink/swell) and the feed controller really does see it. Damping that at the
indicator would be lying about the plant. Everything else is sensor wobble and is damped at the
meter.

**Instrument sigmas restored to their historical values** (tavg family 0.05 → 0.17, pzr_level
0.12 → 0.3, power_range 0.14 → 0.2, sg_level 0.22 → 0.3). With the display doing the calming,
the reduced sigmas stacked with it and the board went DEAD — most tiles showed zero digit
changes per minute, which is worse than twitchy. Restoring the long-validated numbers is also
the safest possible choice for the gates.

**Measured, displayed (what the player sees), steady full power:**

| tile | p-p filed in #231 | p-p now | digit changes/min: filed → now |
|---|---|---|---|
| Reactor power % | 1.17 | 0.53 | 213 → **35** |
| Tavg °F | 2.45 | 0.53 | 218 → **3** |
| Subcooling °F | 2.45 | 0.60 | 215 → **1** |
| Primary pressure psi | 2.46 | 0.94 | 233 → **1** |
| PZR level % | 1.64 | 0.60 | 216 → **0** |
| SG level % | 1.55 | 0.78 | 224 → **1** |

Power is deliberately the liveliest — excore flux genuinely wanders and operators read it to a
tenth. The near-still tiles are correct: a real whole-unit indicator at steady state parks, and
moves when the PLANT moves.

**Guardrail:** `DAMP_STEP_SIGMA = 6` bypasses the filter on a step that large, so a scram, trip
or break reads instantly. A laggy board is a worse sin than a twitchy one in a teaching sim.

**Kept from #233 (both were genuine test defects, validated under BOTH noise models):**
`run_e2e_controls`' `sgtrRun` and `run_campaign`'s Tavg trim loop each sampled an INSTANTANEOUS
value of a noisy signal and now average. That only ever worked because white noise was
annihilated inside a 20 s filter or a threshold; averaging is what an operator watching a needle
does, and it is the stricter fixture either way.

### 2026-07-28 — V2 board pass 2: Cherenkov, dash phase, correlated noise, layout  ⚠️🔬

Owner playtest batch (8 items) plus a design-project import. **20/22 runners at baseline;
`run_campaign` 50/51 and `run_e2e_controls` 33/35 are RED and tracked in #234 — NOT merged to
`main`.** Everything below except the noise correlation is green.

**Imported from the Claude Design project** (`DesignSync`, project 6ad9a164). `Production
Ready.dc.html` is only a chrome-free wrapper around the builder's production snapshot — the
real content is in the component files. Took three things:
- **Cherenkov glow** (`Reactor Vessel v2.dc.html`) — driven by FISSION RATE, not reactivity,
  so it is dark at zero power and grows/widens toward rated. Gotcha: the design defines
  `cherCoreGrad` TWICE, the second time in `userSpaceOnUse`; `url(#id)` resolves to the FIRST
  match, so the second block is dead and was not ported.
- **The cold-leg nozzle moved** (viewBox cy 282 → 295). This alone fixed **#232** — the
  accumulator tee jog fell from 5 px to 1 px (rounding) without touching the tee.
- **`dashPhase` / `DASH_CYCLE_S`** (`pipes.js`) — see below.
- **Do NOT wholesale-copy `pipes.js` over `std_pipe.js`.** The design's copy still has the OLD
  4-stop aqua→purple water ramp; ours has the evolved heat-map ramp + operating-band expansion.
  The two files have diverged in DIFFERENT directions — merge selectively, per feature.

**Dash jitter (#233) was TWO bugs, and the design source only fixes one.**
- *Spatial* (theirs): legs drawn in tile coordinates start their dash grid at the tile, so every
  leg meets its pipe out of step. Fixed by `dashPhase(pts, dir, cyc, ox, oy)` — anchors the grid
  to WORLD position, reverses -x/-y runs so arc length grows the same way everywhere, and applies
  phase as a negative `animation-delay` (keyframes now anchor `from` as well as `to` so the
  element's own `stroke-dashoffset` is not clobbered). Fittings pass their tile origin.
- *Temporal* (ours, and the actual reported symptom): `comp_tee`/`comp_cross` called `rebuild()`
  on EVERY snapshot, which replaces the geometry and restarts the CSS animation. At ~1 update/s
  against a ~1.04 s dash cycle the dashes advanced most of a dash and snapped back — "jitter back
  and forth". Fixed with a geometry dirty-check plus a `repaint()` that updates colour in place,
  because TEMPERATURE is the prop that moves every snapshot and it only changes colour.
- Also: `updatePipeFlowStates` now toggles `animationPlayState`, never `style.animation` — the
  shorthand carries `animation-delay`, which is where the phase lives.

**Layout: the diagram was being squeezed by a feedback loop, not by one bad number.**
`.bottom-row` was `flex: 1 1 auto` (grow into spare height) while `fitColumns` handed spare WIDTH
to the sim column. A taller strip shortens the board → a shorter board needs less width →
`fitColumns` gives that width away → shorter again. Two auto-growers either side of a
fit-to-height diagram is a loop. Fixed by pinning `--bottomrow-h` (default 230 px) and dropping
`SIMCOL_MAX` 900 → 560; both edges are now draggable (`RD_BOARD_SPLIT` in localStorage), and a
drag pins that axis so `fitColumns` stops touching it.

**Instrument noise — three changes, two green and one red.**
- GREEN: **signal-proportional noise** (`noise_ref`). An instrument whose process is off now
  indicates a still zero. Verified 200 samples at hot full power: `hpi_flow`,
  `accumulator_flow`, `primary_leak_flow`, `steam_dump_valve` all exactly `0.000e+0`. This is
  the model the #217 note asked for, and it is what stopped the ECCS pipework animating with the
  pump stopped — the pipes were reading ~1 gpm of noise as real flow.
- GREEN: amplitude trims — `power_range` 0.2 → 0.14, `sg_level` 0.3 → 0.22 with a SHORT
  `noise_tau` 2.5 (that one's character is genuinely fast hash, not drift).
- **RESOLVED 2026-07-28b, see the entry above — temporal correlation** (AR(1), `instrument_noise_tau_s: 8`). Stationary sigma is
  unchanged; only the crossing rate. Measured 60 s p-p at steady full power: Tavg 2.45 → 0.13 °F,
  power 1.17 → 0.22 %, SG level 1.55 → 0.51 %. Over 1800 s the sigmas return to their configured
  values, confirming the walk is stationary and not decaying.
  **Both reds depend on the noise being WHITE.** `tau: 0` (keeping the new sigmas AND
  `noise_ref`) makes both green; tau 2, 3, 4 and 8 all fail identically, so it is not tunable.
  Both failing checks sample an INSTANTANEOUS value of a noisy signal, which only worked because
  white noise was annihilated inside a 20 s filter or a threshold. Averaging fixed most of the
  CVCS swing (4 %/14 % → 14 %/22 %) and none of `pwr_rod_auto`.
  **Ruled out, do not repeat:** raising `cvcs_level_filter_tau` (the obvious "filter was sized
  for white noise" hypothesis) makes it monotonically WORSE — 20 s → 14 %/22 %, 45 → 6 %/12 %,
  60 → 4 %/10 %, 90 → 3 %/7 %. It is a TRANSIENT (the filtered error has not reached steady
  state when sampled), not a noise-rejection problem. Value restored to 20.0.

**Tile bands are mode-aware.** Tavg's green band is now the sliding Tavg program — `trefProgram()`
exported from `pwr_control.js` so the tile draws the SAME reference the rods drive to, rather
than approximating it. Below Mode 3 it becomes the cold-shutdown band. Primary pressure follows
the live setpoint. The other four deliberately do not move; their references are protection
setpoints, which do not change with mode.

**Geometry patches.** `DOC_PATCHES` in the driver applies ABSOLUTE (therefore idempotent)
corrections to the generated doc — the PORV drop and the turbine→condenser run were each 1–2 px
off true vertical. When the owner fixes one in the builder the patch becomes a no-op instead of
double-applying. `selfTest` asserts every target still resolves.

### 2026-07-27d — #231 V2 board polish: all three items were mis-attributed, and measurement moved each one  ✅🔬

Three playtest items off the V2 board landing (`e9dc316`). Every one had a plausible lead in
the issue text; **two of the three leads were wrong**, and only measuring said so. `run_all`
**22/22 at baseline** after, unchanged — no baseline moved.

**Item 1 — the pressurizer sits left. The suggested lead (`NUDGE_KINDS`) cannot fix it.**
The issue's first suggestion was to add `Pressurizer` to `NUDGE_KINDS` in
`ui/diagram/board/pwr_board.js:32`. That is arithmetically impossible: `gridNudge` removes
**sub-grid residue only**, so at `doc.grid = 5` its authority is ±2.5 px. Measured error is 6.

- **Measured, not eyeballed** (scratch harness: mount the board headless, read
  `RD.PwrBoard.ports()`, and for every pipe compare each end's port against the axis its
  first/last segment should run along). The pressurizer's three centreline ports —
  `relief-out`, `pressure-tap`, `surge`, all at viewBox x=100 — scanned at world **x 1049**.
  Both fittings they join sit at **1055**: `ims2kt7fu64/c` (surge tee branch) and
  `imrppb3kuav/b` (PORV block valve). So the surge line *and* the relief tap each ran 6 px out
  of plumb between two horizontal flange bars. That is the whole reported symptom.
- **It is TWO authored errors compounding**, which is why no single principled rule lands on
  1055: the design's crop puts the vessel axis **10 px left of the tile centre** (viewBox spans
  10..230, centre 120, vessel cx 100), and the tile itself (left 1005, width 108, centre 1059)
  sits **4 px right** of the 1055 axis its neighbours share. Centring the crop gives 1059;
  grid-snapping the current position gives 1050. Neither is right.
- **Fix**: one measured `translate(6px,84px)` on the pressurizer svg
  (`comp_pressurizer.js`), in canvas px, the same idiom as the existing `translateY(84px)`.
  Three new `board_check.html` assertions pin the **result** (`pressurizer/surge` x ==
  `ims2kt7fu64/c` x, etc.) rather than the offset, so a re-export that moves either tile fails
  loudly instead of silently restoring the jog. board_check **56 → 59, 0 fail**.
- **Not fixed, filed instead**: `ims3x2n4o2p/a` (accumulator tee) vs `reactorVessel/cold-in`
  is a real **5 px** jog over a 10 px run. It is authored *tile* placement, not a component
  crop — the tee wants `top 595`, not 600 — so it is a builder edit, not a code one.
  The other jogs the harness found (condenser↔cooling tower 29 px, AFW tee → SG fw-in 14 px)
  are authored diagonals and correct as drawn.

**Item 2 — instrument noise. The issue's own numbers were right; the scope was one instrument
too narrow.** `tavg` 0.17 → **0.05** °C, and `thot`/`tcold` with it; `pzr_level` 0.3 → **0.12** %.

- **Why all three temperatures, not just Tavg** (HR9 — what should this plant do?): the board
  shows **Tavg, T-hot, T-cold and ΔTavg (thot − tcold) on one screen**
  (`pwr_board_wiring.js:290,339,340,539`). A rock-steady average over two legs each wandering
  ±1.2 °F is arithmetically impossible. They are also the same RTDs in the same damped bypass
  manifold. Checked before moving them: **nothing in `layers/control/` and no gate reads the
  `thot`/`tcold` readings** — they are display + pipe colour only.
- **Subcooling fell out for free.** `subcooling_margin` is derived (`pwr_instruments.js:120`:
  `T_sat(P) − tavg`) with `noise: 0`, so its jitter *was* Tavg's. That is why the issue's table
  showed subcooling and Tavg with an identical 0.32 σ — one instrument, reported twice.
- **PRNG safety.** Changing a sigma draws no extra numbers, so the instrument noise **sequence**
  is byte-identical — only the amplitude moves. (Contrast the `noise: 0` rule further down that
  block, where *adding* a draw is what shifts every downstream instrument. That rule is about
  adding/removing instruments, not re-sizing one.)
- **Measured before/after, 60 s at steady full power, full stack, display units.** The two
  instruments left alone reproducing the issue's own figures is what says the harness matches
  the original measurement:

  | tile | σ filed | σ now | |
  |---|---|---|---|
  | Tavg °F | 0.32 | **0.087** | −73 % |
  | Subcooling °F | 0.32 | **0.087** | −73 %, derived |
  | PZR level % | 0.28 | **0.118** | −58 % |
  | Reactor power % | 0.21 | 0.205 | untouched ✔ |
  | SG level % | 0.30 | 0.309 | untouched ✔ |

- **SG level deliberately NOT matched to PZR level.** Narrow-range SG level genuinely bounces
  (boiling, shrink/swell); pressurizer level is a steady dP reading on one large vessel. The two
  sharing 0.3 was the tell that 0.3 was a copied default rather than a measurement.
- **Knock-on caught**: `tile()`'s display-resolution comment justified whole-unit digits by
  citing "sigma 0.2–0.45 across the board". That premise is now false for three of the six
  tiles, so the comment was rewritten with the new per-tile figures. The *decision* is unchanged
  — 0.09 is still close to a full 0.1 display step — but a stale premise left under a live
  decision is how the next agent gets it wrong.

**Item 3 — Tee/Cross dash rate. Root cause found; it was a constant, not a scale bug.**
Both surfaces animate `stroke-dashoffset` 250 over `dur = 10.4/speed`, and for the fittings the
`scale(1/sc)` compensation cancels exactly against the tile's viewBox mapping — so **equal `dur`
== equal on-screen rate**, and the two were simply computing different `speed`:

- fittings: `speed = (0.45 + 1.1 * flow/100) * speedMul` → **1.55** at the authored flow 100
- pipes: hard 1.0, with the authored `p.speed` **dropped on the floor** in `buildPipes()`

So every fitting ran 55 % fast — dashes slipping a full period against the pipe every ~1.9 s,
which is exactly the visible stepping. Fix: one shared `StdPipe.dashSpeed(flowPct, speedMul)`
where the authored default on **either** surface is exactly 1.0, used by `buildPipes()`,
`comp_tee.js` and `comp_cross.js`. Verified in the DOM: 7/7 fittings and 26/27 pipes now at
`10.4s`.

- **The 27th pipe is deliberate and worth knowing about.** `pms2ktjq4ma` (SG hot-in → surge tee)
  carries `speed: 1.05` — the only authored speed on the board, and almost certainly a stray
  slider nudge. Now that authored speed is honoured it runs 5 % fast against the tee it joins
  (a period every ~21 s, vs ~1.9 s before). Kept honoured rather than special-cased: silently
  dropping authored data is half of what made this confusing. **Owner action: zero it in the
  builder on the next export.**

**Drive-by, forced by the manual maintenance rule.** A config change requires
`gen_manual_reference.js` + `pack_manuals.js`. Regenerating showed the sigma edits produce **no**
manual diff (the PWR entry is a reference-only stub — its `normal_values` instrument snapshots
are RBMK/BWR only). What it *did* surface was pre-existing staleness from `e9dc316`:
`cw_inlet_temp` had never been regenerated into `ui/manual_data.js`, and landed as a raw
unlabelled id. Given an `IND` entry and regenerated. `run_procedures` 22/22, `run_checklist` 24/24.

### 2026-07-27b — Three small issues (#189, #142, #156), and what measuring each one changed about it  ✅🔬

A batch of three "easy" items. All three turned out to be filed slightly wrong, and in each
case the *measurement* is the part worth keeping — the code change is small.

**#189 — the campaign validator's two latent holes.** Filed as (1) validation is
campaign-gated so an unwired scenario gets none, and (2) `checkTrigger` has no `default:` so a
typo'd trigger type passes silently.

- **Hole 1 confirmed, and it was wider than filed.** Four static passes walk the campaign
  tree; *two of them* (`beat vocabulary, registers, endpoints` and `auto_channels`) walked
  `acts` only, so a **bonus** mission was skipped as well. Measured: 36 scenarios, 0 unwired,
  but **`pwr_sg_flood` is bonus-only** and was getting no beat-id-uniqueness, register or
  `level_complete` check at all. All four passes now walk `RD.SCENARIOS` directly. Nothing
  needed the campaign id — a scenario carries its own `plant_id`.
- **Hole 2 was half wrong.** The issue said a typo'd type "passes validation silently". It
  does not, for `b.trigger` and branch triggers: the legality pass at `run_campaign.js:164`
  already checks `TRIGGERS.indexOf(tr.type)`. What it never does is **descend into
  `gate.until` or `all`/`any` sub-triggers**, and the reference pass that *does* descend had
  no `default:` arm. So the hole is real but lives in a different place than filed. The
  default arm asserts membership in the existing `TRIGGERS` vocabulary rather than
  `false` — `scram` and `manual` are legal and field-less, and fall through to it.
- **Proved by injection, old vs new** (HR10 — the whole point is that these checks were
  vacuous, so "it still passes" proves nothing). Ran the **real** Part 1 code, sliced at the
  Part 2 marker, against deliberately corrupted scenarios:

  | injected defect | pre-fix runner | post-fix runner |
  |---|---|---|
  | dangling `goto` in an unwired scenario | **passes — missed entirely** | caught |
  | typo'd type on a `gate.until` | **passes — missed entirely** | caught |
  | typo'd type in an `all`/`any` sub-trigger | caught (legality pass) | caught twice |
  | dup beat id + missing register on a bonus-only scenario | **both missed** | both caught |

  Clean: **51/51, 2930 → 3024 checks**, no reds. The +94 is the bonus scenario plus the new
  default arm.

**#142 — instructor save/restore drops progress.** Confirmed at `instructor_layer.js:880,926`
(`accStreak: 0` hardcoded on both restore paths) and `_actionsSinceBeat` absent from
`saveState()` entirely.

- **The consequence is a softlock, not a cosmetic reset**, and that is worth naming because
  the issue filed it as "progress tracking resets". `_actionsSinceBeat` is the *only* record
  that an operator command descended since the last beat fired, which is exactly what an
  `operator_action` trigger fires on. Perform the action → save → restore, and the beat is
  still armed with nothing left to satisfy it. On a one-shot action there is no again. Three
  authored beats trigger this way (`pwr_feedback.stabilized`, `pwr_load_follow.complete`,
  `pwr_protection.stabilizing`), and the save path is not just the save button — auto
  checkpoints and **rewind** go through it.
- `accStreak` is the milder half: up to `ACC_STABLE_N` = 5 evaluations of credit lost.
- Both now round-trip; absent fields default to the old values, so **pre-#142 saves load and
  behave exactly as before** — asserted, not assumed.
- **Gated, and the gate was validated against the old code.** New test in `run_m6`
  (16/16 94 → **17/17 102**). Against the pre-fix instructor **5 of its 8 checks fail**,
  including the softlock itself; the legacy-save check passes on **both** versions, which is
  what makes it a backward-compatibility assertion rather than decoration.

**#156 — kernel generality leaks. Both halves were stale; one is fixed, one should not be.**

- **The `_stepBang` half is already fixed.** `control_kernel.js:961-985` has no plant field,
  and carries the comment *"busyNote: optional per-plant status suffix (HR3 — no plant fields
  here)"*. The audit item dates from 2026-07-16.
- **The leak moved.** `charging_pump_running` is now in **`_stepConc`** (`:1007`), introduced
  with the boron batch-dose work — i.e. the same HR3 leak was re-created in new code after
  the old one was cleaned. Fixed the same way the kernel already solved it: a plant-supplied
  `pausedWhen` predicate + `pausedNote`, mirroring `busyNote`. Behaviour is bit-identical —
  `pausedNote` reproduces the old string and the unit comes from `def.sp.unit` (`'ppm'`).
  The kernel's `control_state &&` null guard was carried *into the hook*, deliberately: moving
  a guarded read into plant code is a silent way to turn a null check into a throw.
- **The `clip()` half is not HR3, and it is now a recorded won't-fix** (owner ruling,
  #156 closed `status-deliberate`, flag **F13**). HR3 is *"plant-specific behavior is data,
  not hardcoded logic"*; four identical one-line clamps in four IIFEs is DRY, not HR3, and
  the issue conflates them. **Measured before deciding: `clip` is the ONLY duplicated
  helper** — `crossed`/`rodGroup`/`valueFieldFor` are kernel-only, `_tsat`/`trefProgram` are
  PWR physics, `alarms`/`forVersion` are RBMK. So a shared-utils file would exist to hold one
  60-character pure function, at the cost of either a load-order coupling (`control_kernel.js`
  loads **after** all three plant modules, so `RD.*.clip` resolves only at call time) or
  editing ~19 test-runner load lists plus `shell.html` and the `test_*.html` pages.
  **Revisit trigger:** a second shared helper.
- **The recurrence is the real finding, and it is spun out as #227.** The rule was stated
  *in the file*, the fix pattern existed *in the file*, and the violation still came back and
  shipped — because nothing gates it. Measured for that issue: 13 plant-specific identifier
  sites in the kernel today, in three groups — the boron cluster (`bang`/`conc` kinds, which
  the kernel's own comment at `:1024-1025` calls *"a conc-kind plant coupling"*, i.e. accepted
  but never recorded as a decision), `valueFieldFor`'s command vocabulary (`:62-67`), and one
  false positive worth remembering: **`:952` matched because `orm` is a substring of
  `'n`*`orm`*`al'`** — so any such check needs a curated identifier list, not substrings.

**Addendum — the HR3 guard (#227) and what verifying the backlog turned up.**

- **`test/run_hr3.js` built — runner #22, 0.2 s, static.** The design choice worth keeping: the
  plant vocabulary is **derived from the three engines**, not hand-listed, and the discrimination
  falls out of the data — *a token all three plants define is a shared concept, not a plant
  specific*, so `scrammed`/`rod_groups`/`power_pct` need no allow-list entry and never will.
  Everything else needs a written reason. Validated by injection: the exact #156 leak → caught;
  a fresh RBMK leak → caught; a stale allow-list entry → caught. It caught **three couplings I
  had missed by hand**. **Limitation, learned the honest way:** my first RBMK injection did NOT
  trip it, and the guard was right — I had written `instruments.orm`, and the real field is
  `orm_display`. It matches real plant names, not invented ones.
- **Two latent bugs found on its first run → #228, recorded not fixed** (both RBMK/BWR-facing).
  The sharper one: the `__true_flow__` trip sentinel reads `pump_flow_pct`, which is
  **`undefined` on RBMK and BWR** → `undefined/100` = NaN → `crossed(NaN,…)` is false, so a
  future RBMK/BWR flow trip on that sentinel would **never fire and never say so**. Both plants
  are flow-critical. Also `reset_rps` is sent by the kernel but handled only by `pwr_engine.js`.
- **The backlog is roughly half stale — verify before working.** Of #158's seven residue items,
  **five were already fixed or had moved**; three of the survivors have a real reason the
  2026-07-16 audit did not see (`set_lpi` is a live deprecated alias with save-file
  compatibility). **Two of the three "reasons" did not survive contact — including one I had
  just written into this log.** (a) *"renaming `act5` orphans `rd_progress` keys"* is **false**:
  `rd_progress` only ever holds `completed_scenarios`, `completed_procedures` and `hook_done`,
  all keyed by SCENARIO id; act ids are used only to iterate and render (`app.js:1322, :1358`)
  and are never persisted. Renamed to `act6`, nothing to migrate. (b) `buildTraining`'s standing
  *"accepted — do not re-fix"* is **not an owner ruling** — it lives in
  `PWR_SHIP_REVIEW_PLAN.md`, whose own header reads *"Created: 2026-07-19 (Fable) · Executor:
  Opus"*, i.e. one agent instructing another, committed under the owner's name because that is
  how agent work lands. It had also been overtaken twice (it "accepts" `dampInstruments`, since
  retired under #217, and `clip()`, ruled on separately). Renamed to `refreshMissionSelect`.
  Fixed the two that were genuinely mechanical: the `dampInstruments` no-op
  stub + dead call site, and a **new** instance of the #156 pattern — `simulation_service.js:404`
  claimed *"a manual scram never sets rps"*, which `control_kernel.js:204-207` stopped being
  true; corrected, not collapsed, since the two reads still differ under an ATWS.
- **`instruments.rps_scrammed` cannot fail** — it is a `status:` passthrough copied by
  `_copyStatus` after the instrument loop, and `_applyFailure` only runs over `SOURCE` ids. So
  it is identically `true_state.scrammed` on all three plants, and the remaining HR1 swaps at
  `app.js:3310/3433` are **conformance cosmetics with zero behaviour delta**. Worth doing; not
  worth claiming as a bug fix.
- **#161(b) fixed, and it had spread.** Measured: PWR ops is **21/21 with ZERO fails**; all 11
  reds are 7 RBMK + 4 BWR, and the deliberate C2 red is *one of the RBMK seven*, not a twelfth
  item. Naming **P4** as an open target was wrong — and the wrong list had since been **copied
  verbatim into `run_all.js`'s note**, so the authority file was asserting it too. Both
  corrected together, with the measurement and its date inline. #161 stays open for (d) only:
  `OPS_TUNING_REPORT.md` is still the 2026-07-06 body and needs a real refresh, not a
  number-swap.

**Addendum 2 — the instruction corpus was audited and cut, on an owner ruling.**

Asked to confirm or revoke five standing directives, the owner could not identify any of them
as his, and said: *"I think we have too many instructions in this project and it's starting to
confuse the coding agents and gum up the works."* Measured: **~229,000 words of docs carrying
~650 "do not / never / by design" phrases**, and `CLAUDE.md` — the first file every agent reads
— was **7,462 words**, most of it fifteen stacked history entries duplicating this log.

- **Four-line precedence rule added to `CLAUDE.md`**, which retires the other ~647 directives
  without auditing them one by one: (1) only `CONTEXT.md` Hard Rules + `CLAUDE.md` bind;
  (2) `Diagnostic/`, `BUILD_DECISIONS.md`, `Manuals/` are **record, not policy**; (3) **plans
  expire when executed**; (4) no date + verbatim owner quote ⇒ **advisory**.
- **`CLAUDE.md` cut 690 → 432 lines, 7,462 → 3,786 words** *(OWNER RULING, 2026-07-27:
  "Execute the cut.")*. Verified first that this log is a **strict superset** of what was
  removed — 7 entries for 07-25 against `CLAUDE.md`'s 5, 3-for-3 on 07-24 — so no content was
  destroyed, only a second copy.
- **Attribution is now mandatory** (`CONTEXT.md` §3, and on the canonical label issue #61):
  `OWNER RULING (YYYY-MM-DD): "<their words>"`, or it is *your* recommendation and must be
  labelled as such — including when approved, e.g. *"Claude's reasoning, owner-approved
  2026-07-27 ('Do as you suggest')"*. F13 was rewritten this way retroactively; the first
  draft said only "ruled won't-fix", which is the failure mode even though the owner did agree.
- **Revoked:** `PWR_SHIP_REVIEW_PLAN.md` stamped **EXECUTED — historical record, not policy**
  *(OWNER RULING, 2026-07-27: "Yes. Marking done.")*; Amendment A1's *"do not chase P4 without a new
  ruling"* **revoked as moot** (PWR ops measures 21/21, zero fails); the C2 "Ruling: ship as a
  documented limitation" **struck as a third copy** of #153 + its deliberately-red probe; the
  unattributed *"Owner scope rulings … out of scope — do not add"* **downgraded** to "not
  planned; propose with a reason".
- **Two stale-and-still-binding statements struck**, both of which would have misled the next
  reader: `pwr_control.js:68` said *"currently OFF … THIS PLANT DOES NOT HAVE IT"* about P-9
  while `pwr_config.js:763` had it `true` — the comment narrating how a stale claim hardened
  into "by design" had itself gone stale the same way — and `BUILD_DECISIONS.md:494`'s
  *"deliberately left at 1.5 MPa"* against a config reading **4.14**.
- **#229 filed** — P3-9 (decay heat undercounted through an un-scrammed runback) was blocked
  by the A1 citation, not by a decision. Re-verified still open: the MD-5 fix broadened the
  gate to `scrammed || _P < _decay` and its own comment says that is *"identical to the old
  form … whenever P > decay (all at-power operation)"* — precisely P3-9's regime.

**#210 closed — the promised seed sweep, finally run.** `pwr_rod_auto` on 7 seeds, peak SG
level vs the 90 % P-14 trip: range **79.76 – 85.90**, spread **6.14**, mean 83.16, **worst
margin 4.10 points, 0 scrams, 7/7 completed**. The filed 86.8 % is worse than anything measured
today — the plant moved under the issue (#210's own `minDelta` fix, then #219's dump
reference). Not a knife-edge, but the spread exceeds the worst-case margin, so the margin is
noise-dominated: recorded as a watch item, deliberately not tuned, since tuning against an
unobserved seed is fitting to noise. **Process lesson:** the first attempt burned 78 minutes
and produced nothing because it printed only after all seeds finished *and* was piped through
`tail` — stream per-iteration output from the start on any long sweep.

### 2026-07-27 — backlog sweep (8 issues closed) + #219: the dump reference was the bug, not the latch  ✅🔬

**#219 — the steam-dump load-rejection latch, reviewed with fresh eyes as asked.** Measured
by building the variants and running them against the three cases the mechanism was fitted
to *plus* edge cases it had never seen (`reject_39`/`reject_41`, a 4×15 MWe staircase, a slow
60 MWe ramp).

- **The arm survives.** Removing it: **6.5 % dump at steady full power forever**, and a
  deliberate rod withdrawal overcools into a **114 %** power runup. Not a fudge.
- **The arm signal is better than its author believed.** `load_rejected_mwe` is a first-order
  reference minus the target — a **washout/high-pass filter**, i.e. a rate-of-decrease
  detector by construction. That is C-7 class in structure. `(40 MWe, 60 s)` therefore encodes
  a rate: a step > 40 MWe, or a ramp > ~40 MWe/min. Nothing said so; now in the config.
- **The reference was the actual defect.** Pinned to the no-load anchor, the Tavg error is
  ~13 °C against an 8 °C band at full power — **saturated whenever the plant is at power**, so
  the demand carried no event-size information and the mismatch **cap existed to put it back
  by hand**. This plant already had the right reference: the sliding program the rod
  controller runs (`pwr_control.js trefProgram`, SS-2). The dump now shares it → demand is
  proportional on its own, **cap deleted**. 41 MWe rejection: capped **102.7 %** power (the
  dump overcooled and MTC ran power up — the very thing the cap was for), programmed+uncapped
  **99.2 %**. Turbine trip unchanged by construction (load→0 ⇒ program collapses to no-load).
- **HR1:** programmed on the steam-flow INSTRUMENT via a new `_ins_steam_flow` stash (a stash
  of an existing reading — no extra draw on the instrument PRNG stream).
- **Left open for a ruling, now measured instead of implied:** the 40 MWe arm is a **cliff**
  (39 MWe → no arm, Tavg **318.9 °C, PORV lifts**; 41 MWe → caught, 304.5) and is **blind to
  staircases** (60 MWe as 4×15 never arms, Tavg 319.0). Neither is fixed by moving the number —
  an arm low enough to catch a 15 MWe cut leaves the dump venting forever (power ends 99.7 %
  instead of 85 %, defeating EV-11). Written into `dump_load_reject_mwe`.
- **The config comment described the ABANDONED design** (arm on the power/load mismatch —
  attempt 1, the one that tripped `pwr_boron`), not the shipped washout. Corrected.
- `verify_e2e_ui` turbine-trip sample **120 s → 240 s**, and now asserts feed **tracks** steam
  within 15 gpm rather than merely exceeding 30. At 120 s the SG is still coming off the
  post-trip swell so feed is legitimately 0 — the old failure message blamed the channel for
  reading governor flow when STEAM FLOW read 80 gpm with the governor shut. Because this issue
  is *about* fitting mechanisms to tests, the new sample point was validated on **both** old
  and new physics (old 67 vs 66, new 64 vs 64) before adopting it.

**Backlog sweep, same day.** Closed **#119** (the in-sim Plant & Mission picker offered RBMK/BWR
as live cards — clicking one switched to a board that was never built; now greyed + inert,
`?engine=` still reaches them for dev), **#127** (no desktop-only notice), **#145** (owner
ruling: **RHR everywhere, DHR retired** from every user-facing surface + 15 instruments that
printed their raw id as their name), **#159** (audit script wrote to a dead agent scratch dir),
**#200** (a stuck-open spray valve healed itself the moment you touched SPRAY AUTO — the failure
was written into the operator's *demand* field; now `s.spray_stuck`, mirroring `porv_stuck`,
with a save migration), and **#143/#144/#155** verified already-fixed with only stale flags left
(`BUILD_DECISIONS` F4 and F5 both marked RESOLVED).

**Two recurring lessons.** (1) *Tests shaped around the bug*: TR-11 drove `stuck_open_spray`
through the one command form the broken override intercepted, with a comment saying the
defeating forms were deliberately unpinned; `verify_e2e_ui` pinned a transient. Both now guard
the real claim. (2) *Flags outlive their fixes*: three issues were open only because
`BUILD_DECISIONS`/`ISSUES_AND_FINDINGS` rows were never updated — #144 was filed against a
field that had been in the contract all along.

**Filed:** #224 (STEP_UI map stale vs the re-authored procedures, 33 mismatches, and its auditor
is not in the gate), #225 (**41 of 82** PWR `getTrueState` fields undocumented in CONTEXT §6.3,
and nothing guards it — found while closing #144).

All 21 runners at baseline; `run_pwr` 199 → **200 checks** (save_migration pins the #200
conversion), `BASELINES` updated.

### 2026-07-26f — P-9 adopted; noise moved to per-indication; the back-catalogue audited  ✅🔬

Three linked threads, all from one owner instruction: **"err toward doing it the way real
plants do — this is an educational sim after all."**

**HR9 written, then amended.** New Hard Rule (`CONTEXT.md` §3): *the plant is the ground truth;
content follows the plant, never the reverse*, with a one-way authority order. As first written
it had this plant's identity **outranking** prototypicality — the owner inverted that. Identity
choices are now **named departures**, legitimate only if ruled on, recorded, **and declared as
simplifications where they understate reality**. A standing clause was added on the owner's
instruction — *question the owner's own decisions, they may rest on stale premises* — deliberately
scoped as **targeted, not a standing re-audit**: raise a ruling only with a specific reason to
doubt its premise. Also: **record the premise, not just the verdict.**

**The audit (#216).** Four parallel passes over `BUILD_DECISIONS`, the diagnostics, every source
comment, and all 262 commits. Mostly compliant *before HR9 existed* — the dominant pattern is
content being rewritten to fit the plant, and baseline hygiene is **clean** (no baseline ever
lowered, no xfail ever added to absorb a plant change). One serious violation, fully laundered:

> P-9 reactor trip on turbine trip was implemented 2026-07-18, **broke `pwr_msiv`**, and was
> narrowed for that reason; the realistic version was deferred because *"it would require
> re-authoring `pwr_msiv` around a reactor trip"*. The absence then hardened into *"this plant
> has no turbine-trip reactor trip by design"* — **a line I wrote myself**, in the #211 session,
> without checking its provenance — and that claim was used in #215 to reject adding the trip.

`TR-8`'s genuine *"physics, not anticipation"* ruling **postdates the scoping by three days**, so
it rationalised the gap rather than causing it. The mechanism was two doc lines (`CONTEXT` §11,
`pwr_config` header) reading as if content could arbitrate tuning; both now name the physics
acceptance suites and say campaign/procedures/checklists **are not arbiters**.

**P-9 adopted (#216).** Built default-off first so the ruling rested on a measurement — blast
radius 4 runners, far smaller than the 2026-07-18 deferral implied. The catalog was pinning the
**wrong event**: `TR-1` injected a *turbine trip* while its own text described a *load rejection*.
Split — **TR-1** = load rejection, turbine on line, dump catches it, no scram; **TR-1b** = turbine
trip above P-9, scram in 0.5 s. `run_behavior` 35 → **36, no band relaxed**.

That split exposed a real gap **independent of P-9**: the fast-open dump armed on `turbine_tripped`
alone, though its comment said *"a turbine trip / load rejection"*. Now armed on either — full load
rejection Tavg peak **319.5 → 305.2 °C**, PORV lift gone, dump 98 %. **The arming logic took three
attempts and I do not trust it (#219, flagged for fresh eyes):** arming on the power/load mismatch
tripped `pwr_boron` (a deliberate power *rise* looks identical to a load *fall*); arming on load-fall
alone dropped the dump mid-ride (Tavg 345 °C); correct is a latch — arm on fall, hold on mismatch.
**I arrived at that shape by iterating against failing tests, which is HR9's own anti-pattern one
level up.**

**Then P-9's own defect.** I shipped it `blockable` with a redundant permissive on top of its
`above_p9` condition. Measured: **defeatable at full power**; auto-blocked below P-9 *on top of*
already being bypassed; and a startup-time block recorded as **manual**, which survives
auto-reinstate — silently carrying a defeated reactor trip to full power. **`run_all` was green
throughout.** Fixed by deleting the redundancy: `above_p9` *is* the bypass. Defeating it is an
instructor action (#222), not a board control.

**Noise (#217).** Owner: *"some of the indications were dancing around too much."* Measured,
"dancing" is noise relative to the **display step** — `fw_flow`/`steam_flow` sat at **10×** their
1 gpm step, `boron_analyzer` 4×, three more ~3× — while `pzr_level`/`sg_level`/`tavg`/valve
positions were **already in the sweet spot** and `power_range`/`mwe_output`/`condenser_vacuum` were
**already too quiet**. Nine misbehaved; the global 0.25 scaler punished all twenty-five.
`instrument_noise_scale` retired to **1.0**; sigma set per indication against its display step.

**Removed the UI display damping** (`app.js dampInstruments`): a *second* lag on top of the engine's
sim-time lag, **frame-rate dependent** (no `dt` term — HR6), and attenuating ~3×, which would have
forced every sigma inflated 3× — and those sigmas are what a `noisy` **failure** multiplies.

Two findings recorded at their sites: **`power_range` carries a constant ABSOLUTE sigma across a
0–200 % span**, so a value that looks live at 100 % is ruinous at 1 % (it broke
`pwr_startup_challenge`) — held deliberately quiet, chosen for the low-power case; and **PI-8's
"true level lags indicated" is not resolvable from one sample** (0.16 % lag vs the channel noise),
so it now bounds the difference instead of pretending to see through it. **Noise that hides the
indicated-vs-true gap works against the point of the sim** — which is why levels were pulled back.

**Open from this session:** #218 (content re-authoring — `pwr_msiv`'s decision window is gone;
`pwr_heatup` measured at **106 % power with the turbine offline**, four times its own stated band),
#219 (the dump latch), #220 (unsourced real-plant claims, incl. whether a 105 % dump is defensible),
#221 (audit programme — **protection first, pilot before committing**), #222 (trips page), #214,
#217 part 2 (per-instrument PRNG streams, then the six frozen instruments).


### 2026-07-26e — The board asked you to match a number it never showed (#206 closed)  ✅🔬

Picked up #206's last open half: *"any standing manual feed-pump demand overfills the SG —
decide whether `set_feed_pump_speed` should be this unforgiving, or whether the pump demand
should be rate-limited / level-trimmed when no channel is engaged."*

**Re-measured first, and the filed framing did not survive it.** The issue swept a standing
demand 0–30 % across the ascent and found *every value 2–30 %* flooding past 90 % to a P-14
trip. On the shipped lineup today (post `sg_steam_flow` and post `minDelta`):

| standing pump | at 6 % power | at 100 % power |
|---|---|---|
| 0 % | drains to ~19 %, AFW catches it | drains to **0 %**, scram @195 s |
| 5 % | **holds 52.8 % — stable** | drains to 0 %, scram @299 s (at 50 %) |
| 8 % | parks 87.6 %, SG LVL HI, no trip | — |
| 10–50 % | floods >90 %, feed isolation + turbine trip | drains to 0 %, scram @206–241 s |
| 95 % | — | drains to 22.1 %, SG LVL LO |
| **100 %** | — | **holds 65.0 % flat for 30 min** |
| 105 % | — | floods to 90.8 %, P-14 scram @1112 s |

**The failure direction inverts with power, and there is nothing wrong with the pump.** It is
a fixed-demand device; the value that holds level is simply **steam flow** — ~5 % at 6 %
power, ~100 % at 100 % power. Set it right and level holds indefinitely. The original "every
value floods" reading was an artifact of sweeping *low* demands during a *rising*-power ascent.

*(Aside worth keeping: no scram at 6 % power is correct, not a miss — `p14_reactor_trip` is
gated on the `above_p9` ≥50 % permissive, so SG hi-hi below P-9 isolates feed and trips the
turbine without scramming. `pwr_control.js:63-65`.)*

**So the defect is informational.** Board inventory (verified, not assumed): the board carries
`fw_flow` as SG FEED RATE in gpm — and **no steam flow indication of any kind**. The string
`sg_steam_flow` appeared **nowhere under `ui/`**. The player was asked to match a quantity that
was not on the board; all they could see was level, which is the **integral** of the error and
therefore always a late cue. Worse, the tolerance is tight — at full power the workable window
is ~100 ± 2 %, and the set box's ▲▼ step is ±20 gpm = ±2 %, so **one click is the whole margin**.

**Owner ruling: add the indication, do not soften the control.** Rate-limiting or level-trimming
a MANUAL pump would make manual not manual — the plant would quietly rescue the player and the
lesson (feed must match steam) would be lost. New **STEAM FLOW** readout, `EXTRA_ITEMS` in
`pwr_board_wiring.js` (re-export-safe), placed directly above SG FEED RATE, right-anchored to
**the same column** and on **the same gpm scale**, so matching is a visual comparison.

**The wiring detail that is the whole point:** it reads **`sg_steam_flow`** (turbine + dump +
safeties), *not* `steam_flow` (governor only). Measured through a turbine trip: governor **0 %**,
dump **98 %**, STEAM FLOW **983 gpm**, feed tracking at 984, level 66 %. Wired to `steam_flow`
the box would read ~0 while the generator boiled hard through the dump — the same blind spot
that had the three-element channel commanding zero feed through a turbine trip (2026-07-26c).
`verify_e2e_ui.js` now trips the turbine and fails with that exact message if the number
collapses with the governor, so it cannot be quietly rewired.

Manual §9.2 rewritten around the pair (feed = steam → steady; feed < steam → falling; level
tells you what already happened, the mismatch tells you what is about to), plus the honest
warning that no single standing value is safe at all powers. `pack_manuals.js` re-run.

**Found and NOT fixed** → filed separately: the automation channels' `note` strings are
**rendered nowhere in the shipped UI**. The Automate tab was removed (`shell.html:150`) and
`renderAutomate` early-returns (`app.js:1969-1970`), so `feed_sg`'s *"at minimum output — no
authority to correct"* — added in #210 precisely so a saturated channel would stop claiming
"holding" — is invisible to players, as is *"off — main feedwater isolated (AFW has the SGs)"*,
which fires while the AUTO lamp silently goes dark with no on-screen reason.

### 2026-07-26d — Four PWR fixes off the back of the layer audit (#207, #210, #211)  ✅🔬

All four came out of #209's finding that the gates certified a lineup nobody plays. With the
harness on the shipped lineup, real defects became visible.

**#210 — the PID output deadband stranded a residual demand forever.** `minDelta` exists to
suppress chatter in the INTERIOR of a channel's range; it was also suppressing the last small
step onto a **rail**. The feed channel wanted `u = 0` having last sent `0.13 %` pump, and
`|0 − 0.13| < 1.0`, so it never sent again — a 0.13 % feed demand standing against a generator
with nothing boiling it off. TRUE level 65.0 → 75.8 % across `pwr_heatup`'s holds, on to ~90 %,
then collapsing through the 17 % lo-lo when the dump opened. **Not noise, not physics — a
latched controller output.** Fixed: reaching a bound is a state change, always send it.

Same family as the anti-windup ratchet already documented at `control_kernel.js:878-883`
(*"instrument-noise excursions then trickle positive output forever"*). **This area has now
produced two distinct slow-fill bugs by different mechanisms** — worth suspicion next time
something fills quietly.

Also killed a **stale note**: the channel reported `holding` — which means *error inside the
deadband* — while 25 points off setpoint with no authority to correct. Now
*"at minimum output — no authority to correct"*, the honest answer for a feed controller that
cannot pump water OUT.

**The knife-edge is gone, and that mattered more than the defect.** 8 independent noise streams
through `pwr_heatup`: Tavg spread **0.01 °C**, SG level spread **1.42 points**, no scram and no
critical alarm in any run. Before, the same procedure flipped between passing 19/19 and
scramming on lo-lo purely on noise ordering — which is exactly what a stranded integrator does:
it turns a zero-mean perturbation into a permanent bias sized by wherever the noise left it.

**#207 — AFW latches, and now holds level in the GREEN.** The latch half was already true (the
M4 actuation's pump demand has no reset). What was not latched was the FLOW: the proportional
hold ran full flow below 20 tapering to zero at 28 — a control band lying **entirely inside the
amber 17–30 zone** — so an AFW-only generator settled at 25.1 % with SG LVL LO standing forever.
Now 32/8, settling at **37.1 %**. Measurement trap worth remembering: AFW is only 0.15 of rated,
so the approach is slow — a 40-minute probe read 27.9 % across three different targets and
looked like a plateau when all three were still climbing. Use ≥90 minutes.

**#211 — the board was silent while the plant overcooled.** In the shipped MANUAL lineup the
governor sits at the operator's load setpoint and never moves, so cutting reactor power on rods
alone leaves the turbine an unthrottled heat sink: Tavg **304 → 247 °C** on a daily load cycle,
**304 → 130 °C** (still falling) on a normal shutdown — with **no alarm and no trip anywhere**.
`load_mode.js` had computed the signal HR1-correctly all along and `Manuals/09` had documented
the annunciator all along; `sg_imbalance_active` simply never reached the instrument layer, so
no alarm *could* read it. Three lines, each with a home already. **LOAD IMBAL** (Panel B,
caution) now fires at the 4 MWe threshold — measured t=176 s, Tavg still 303.3 °C, ~50 degrees
before trouble. Owner ruling: **annunciated, not protected** — this plant has no turbine-trip
reactor trip by design and a low-Tavg trip would fire on legitimate cooldowns. Recorded in
BUILD_DECISIONS so the absence reads as a decision.

**Two routes into Mode 1 disagreed** — the free-play preset gave MANUAL (target matched), the
startup checklist's `connect_grid` gave FOLLOW. Owner ruling: keep MANUAL. The checklist now
takes load control after synchronising (`set_load_mode`, so the setpoint stays where FOLLOW left
it — measured imbalance 0.9 MWe, no alarms).

**Gates:** `run_all.js` **OK, 20 runners at baseline** throughout. `run_procedures` 100 → 101,
`run_procedures_stack` 154 → 155 and its xfails 9 → **6** (all remaining are RBMK/BWR, #208).


### 2026-07-26c — The feed controller could not see the steam dump (#206)  ✅🔬

Started on #206 (`pwr_heatup` broken under the stack). Three procedure defects, and underneath
them a control-layer bug worth more than the issue that surfaced it.

**The bug.** `feed_sg`'s element 2 (feedforward) and element 3 (mismatch trim) read the
`steam_flow` instrument = `steam_flow_normalized` = **governor/turbine flow only**. With the
turbine offline or tripped the dump carries the steam and that reads ~0, so the three-element
controller commanded **zero feed while the SG boiled down**. `pwr_steam_generator.js:139-143`
had already named the hazard in prose — *"after a turbine trip the dump still draws, and feed
must follow THAT or the ride-out silently drains the SG (FG-4)"* — and `load_mode.js:87` had
been fixed to match `steam_out_total`. The M4 channel never was. Fixed with a new
**`sg_steam_flow`** instrument (main-steam-line transmitter: turbine + dump + safeties).
Measured, full-load turbine trip under the stack:

| | before | after |
|---|---|---|
| feed flow | 0.667 → 0 (AFW only) | **0.977, tracking the dump** |
| SG level after the ride | **0.0 %** | **64.9 %** |
| follow-on alarms | `sg_level_low` @22 s, `sg_level_lolo` + `reactor_trip` @28 s | **none** |
| plant | scrammed | 98 % power, riding out |

That is TR-1/TR-2/TR-3 territory — every ride-out where the dump carries decay heat.

**Three landmines while wiring it, all worth remembering.**

1. **An appended instrument must have `noise: 0`.** The rule is written at
   `pwr_config.js:602-606` and I shipped 0.01 anyway. The instrument PRNG is a *continuous
   cross-step stream*, so one extra Box-Muller draw per tick shifts every downstream
   instrument's noise from that step on. It moved three marginal endpoints: `run_behavior`
   TR-12b's SG safety lift (9.31 → **9.24 MPa** — a 0.8 % miss), `run_campaign`
   `pwr_rod_auto`'s override (SG reached the 90 % P-14 trip at t=615 instead of peaking
   86.8 %), and `run_m5`. Zero sigma ⇒ `_gauss` returns without drawing ⇒ byte-identical.
   The comment now says so at the site, because "same lag/noise/range as steam_flow" is
   exactly the edit a future reader would make.
2. **A new instrument's source must exist in `getTrueState()`, not just in state.** `SOURCE`
   maps id → *true_state* field; an undefined source latches NaN in the lag buffer
   permanently. Also seeded in `_buildState` and `_migrateState` (old saves).
3. **`run_m5`'s "further alarms did fire" was a precondition, not a target.** It guarded the
   real assertion (*a new alarm on an already-lit board does NOT snap fast-forward*), and the
   alarms it borrowed were the post-trip SG drain — i.e. the defect was the alarm source.
   First repair used `inject_failure`, which is **itself** an attention stop: it snapped to 1×
   on the same cycle as the alarm it caused, so every later alarm arrived at 1× where the rule
   already forbids snapping — vacuous again, differently. Now uses an operator command
   (`set_feed_pump_speed pct:0`), which annunciates `sg_level_low` two cycles later **still at
   60×**, genuinely exercising the assertion.

**`pwr_heatup` procedure defects (all invisible below M4).** It never blocked the startup net
it deliberately walks into — the heatup's heat source *is* 10–30 % fission and the IR trip sits
at ~20 %, so it scrammed at step 11 with Tavg at 108.8 °C. Blocks can be set **proactively**
while a trip is unasserted (`setTripBlock` at `control_kernel.js:409`) and survive auto-reinstate
via `manualTripBlocks`, so they go in cold, before the ascent. It set a standing 30 % manual feed
demand instead of engaging Feed AUTO (SG to 94.5 %, `sg_level_hihi`). And it left the turbine in
FOLLOW, so once the SG could finally make steam the governor took ~46 % of it and the ride
stalled at 240 °C — `cold_shutdown` returns an **empty** `getStartupLineup()`, so nothing puts
load control anywhere. Now: Tavg **50 → 297 °C**, secondary bottled to **8.20 MPa**, Mode 3.
Also relaxed step 14's `tavg_c > 305`, which demanded an 8 °C overshoot **above** the no-load
anchor and contradicted its own step target ("~300 °C"); it now reads `> 295`.

**Residual, still #206, now precisely characterised.** Across the heatup's long low-power holds
the SG fills on a persistent **~0.001-normalized feed trickle against zero steam demand** —
TRUE narrow 65.0 → 75.8 % with `fw` pinned at 0.001, climbing to ~90 % over the ride. When the
dump finally opens the generator boils and the accumulated inventory swings the other way:
level collapses through the 17 % lo-lo and scrams. The channel reports "holding" throughout
because it is saturated at u=0 — it cannot pump water *out*. **It is knife-edge**: the same run
held 65 % and passed 19/19 under a different instrument-noise ordering. 3 strict xfails.

**Gates:** `run_all.js` **OK, 20 runners at baseline**. `run_procedures_stack` xfails 13 → **9**.

### 2026-07-26b — Full-stack procedure gate; the layer-depth audit it triggered  ✅🔬

Built `test/run_procedures_stack.js` (runner #20) to close the gap named in the entry below.
Auditing the rest of the suite for the same shape turned up a larger one.

**The gate.** Replays every authored procedure through `SimulationService` (M4+M5+M6) rather than
engine-direct. It asserts the **same** `acc`/`saw`/`guard` predicates as `run_procedures.js`, so any
divergence is attributable to the stack and nothing else — then adds four assertions only the stack
can make:

1. every step command **accepted** — not `{type:'error'}` (unknown action) nor `{type:'blocked'}`
   (interlock refusal). Engine-direct swallows both silently.
2. **no unexpected scram** in a normal-category procedure — the #202 item-6 class.
3. **no critical alarm standing at the end** — the #202 item-5 class, a procedure that "completes"
   into a degraded plant.
4. declared `auto_channels` actually engaged at the end.

Emergency/accident categories are exempt from 2–3, and a scram at-or-after a step that *commands*
one is expected (a shutdown procedure scrams on purpose) — both were false positives in the first
draft, caught by `bwr_shutdown`/`rbmk_shutdown` reporting their own deliberate trips. Runs at 10×
accel (1 s protection granularity — see #153) in **4.1 s**. `--lineup=bare` runs the noDefaults
lineup campaign missions use.

**Baseline: 22/22 · 154/154 with 13 strict xfails.** `pwr_startup` passes and reproduces the
engine-direct numbers exactly, which is the parity signal the design wanted.

**Finding — `pwr_heatup` (7 xfails, #206).** Richer than the earlier probe showed: it is **scrammed
at step 11 by INTERMEDIATE RANGE HIGH**. The heatup uses controlled fission at ~10–30 % power as its
heat source (its own caution says so) and never blocks the startup net — *the same defect as #202
item 6*, in the procedure that runs immediately before it. Tavg ends at **108.8 °C** (the heatup
never happens), plant_mode 4 not 3, `reactor_trip` + `sg_level_hihi` standing. Engine-direct there
is no RPS to trip and no M4 feed channel, so `run_procedures` passes it 100 %.

**Finding — six RBMK/BWR procedures diverge (6 xfails, #208).** Recorded, **not fixed** (plants on
hold). Both `rbmk_raise_power` variants land just short of their own target (50.2/50.5 vs `> 51`),
both `rbmk_mcp_trip` variants overshoot their post-trip ceiling by different amounts (25.27 pre vs
12.26 post), and `bwr_startup` reaches **0 %** power under the stack against 19.9 % engine-direct —
that last one is not a near-miss, something in M4 blocks the ascent outright (cf. #179).

**The bigger finding — verified, not inferred (#209, priority-high).**

```
stepAutomation   → 1 production caller: simulation_service.js:176
engageDefaults   → 1 production caller: simulation_service.js:152
getStartupLineup → 1 production caller: simulation_service.js:156-159
set_auto_channel → 0 occurrences in ops_pwr.js, behavior_pwr.js, ops_harness.js
```

So **every runner below M5 runs with the automation-channel runtime never ticking and no channel
engaged**, and without the free-play lineup. `feed_sg` (*"replaces coupled feed as the level
backbone"*), `cvcs_makeup` and `boron_conc` are all `defaultOn` in the shipped app. `run_ops` and
`run_behavior` hold a real `ControlFailureLayer` and *look* full-stack — they are engine+M4. So:

- **`run_behavior`** certifies every steady-state band and ride-out shape in
  `PWR_BEHAVIOR_CATALOG.md` on SG level carried by the engine's coupled-feed fallback, not the
  three-element controller that ships. The catalog rows that are *about* the controller can't run
  at all — `feed_sg`'s `offWhen: feedwater_isolated` stand-down (CC-3 / P-4 post-trip handoff) has
  no code path there. ~45 truth assertions vs ~6 instrument ones, so an HR1-class instrument defect
  cannot redden the battery that polices plant feel.
- **`run_ops`** arbitrates the `[tune]` knobs — 2 h endurance, 8 h xenon, the 100→50→100 daily
  cycle — i.e. exactly the slow evolutions where controller wind-up and channel↔manual handoff
  appear, with the controller runtime stopped. Its header comment *"exactly as in the assembled
  sim"* is now false; it was true before the channels moved into the kernel and the lineup moved
  into `selectPlant`. **Tuning targets in `OPS_TUNING_REPORT.md` are set against a plant that does
  not ship.**
- **`run_meltdown`** is deliberately a fuel-temperature gate, which is fine for MD-1/2/3 — but
  MD-4 ("stuck PORV *with HPI* → protected") and MD-8 ("depressurize-to-flood → survivable") are
  *protection* claims proven with HPI hand-set, because auto-ECCS is off by construction
  (`meltdown_pwr.js:18-21`). A regression in an SI setpoint or the P-11 permissive turns a
  documented-survivable path lethal for every player while this stays 8/8; `run_pwr`'s ECCS suites
  command injection by hand too, so nothing else catches it either.

Cheapest fix (in #209): give `ops_harness.js` `engageDefaults()` at construction and
`stepAutomation(dt)` in its drive loop, in M5's tick order — one change fixes both gates, but
expect band drift, so it wants its own pass. The layer table is now in CLAUDE.md so the next agent
does not have to rediscover it.

**Gates:** `run_all.js` **OK, 20 runners at baseline**. New `BASELINES` entry only; nothing else
moved.

### 2026-07-26 — Startup-checklist playtest sweep: six defects, three spun off (issue #202)  ✅🔬

Owner playtest of the Mode 3 → Mode 1 checklist rebuilt in #197/#134, filed as six numbered
items. All six fixed; measuring two of them uncovered three larger defects that were filed
rather than folded in. Also closed the two quick UI reports filed alongside it (#201, #192).

**Item 1 — step 3 never checked off.** The 1/M plot's points live in `ui/panels/one_over_m.js`,
not in the snapshot, so there is no instrument for `acc` to grade and no command for the
cmd-watch to see — the step could only ever be ticked by hand. Fixed by making the action
visible: "Plot point" now emits **`plot_1m_point`**, an operator action with no plant effect
that `InstructorLayer.handleCommand` consumes (M4 would reject it as an unknown command) after
the checklist/follow cmd-watch has recorded it. Never gated — taking a reading is an
observation. Sent only on a point that was actually recorded, so a refused press (SR
de-energized, no counts) does not tick the step.

**Item 2 — hover brought the panel to the front.** `.ckl-glow`/`.instr-glow` in `shell.css:1103`
carry `z-index: 5`. Board tiles carry an authored stacking order (panels auto, buttons/values 1,
`reactorVessel` 2 — `pwr_board.js:640,653`) **and deliberately overlap**: the vessel art is
authored to read in front of the CONTROL/SHUTDOWN GROUP panels beneath it. Glowing a panel
therefore pulled it out in front of the vessel and its neighbours. Pinned the authored layer in
`pwr_board.css` (which loads after `shell.css`, so it wins). Ruled out: `.ckl-glow`'s
`position: relative` does **not** fight `.bd-tile { position: absolute }` — same specificity,
`pwr_board.css` is later.

**Item 3 — reactivity in the checklist (owner ruling: remove completely).** ρ in pcm is truth,
not an instrument (HR1), yet six approach steps graded on `reactivity_pcm` **and**
`renderChecklist` (`app.js:1101`) prints the acceptance predicate verbatim — so the board told
the player to watch a reading that does not exist on it, and even labelled it *"no instrument
twin — true value"*. Re-expressed on **source-range count rate**, measured per step: **620 /
1 000 / 1 800 / 3 300 / 6 200 cps** (observed 701 / 1 105 / 2 011 / 3 744 / 6 999, ~10 % margin).
Step 1 moved to `tavg_c ~ 297`. No step's `hl` names Reactivity any more. Cautions still discuss
reactivity as a *concept* — that is operator training, not a fiction readout.

**Item 4 — ROD INS LIMIT lit for the whole startup.** `pwr_config.js` said *"Power-dependent
insertion limit"* and `pwr_engine.js:185` implemented `steps <= 30 % of max` — a flat floor the
power dependence was never built for. 30 % of 912 = **274 steps**, and the ascent crosses into
Mode 1 at **244**. Measured bank positions: HZP 0 %, end-of-startup **26.8 %**, `5_percent`
preset **62 %**, full power **92 %** — and 92 % across the *whole* load range (follow mode moves
load on Tavg/boron feedback, not rods). New `_insertionLimitSteps()`: not applicable below
`insertion_limit_min_power_pct` 5 %, then linear from `lo_pct` 5 to `hi_pct` 70 at 100 % power
(three new `[tune]` constants). Result: null / 6 % / 70 % against banks of 0 / 62 / 92 — the alarm
now means *"the bank is abnormally deep for this power"*. Recomputed every tick, so the
`max_steps` rescale in `loadState` no longer needs its own recompute. Also un-freezes the
automatic rod channel, which refuses to insert below the limit (`control_kernel.js:916`) —
**that path is auto-only; manual insertion was never blocked**, which is why the level-off step
worked at all.

**Item 5 — SG level dangerously low, never recovered.** `pwr_startup` commanded **no feedwater at
all** (programmatic check over every step; the `prereq`/`cautions` never mention the SG). With
nothing regulating level, AFW picks it up at 20 % and its proportional hold pins it:
`0.15·(28−L)/8 = 0.124` at 12.4 % power ⇒ **L = 21.4 %**, matching the measurement exactly, and
flat for a further 30 min. **The AFW band (20–28 %) lies entirely inside the amber zone
(17–30 %)** — the plant parks in the yellow by construction. Fixed by a new **step 3: engage the
three-element Feed AUTO channel** while level is still 65 %, because the channel *captures* level
as its setpoint (`pwr_control.js:456`) — engage it late and it captures a bad number. Verified
under the **full stack** (the engine-only `run_procedures` cannot see this):

| lineup | before | after |
|---|---|---|
| A `noDefaults` (campaign / walkthroughs) | 46.8 % | **65.7 %** |
| B free-play defaults | 65.3 % | **65.0 %** |
| C free-play, feed pump poked first | **21.4 %** (standing amber alarm) | **70.9 %** |

**Item 6 — trip blocks.** Two new steps after the 5 % crossing, once above P-10: block `ir_high`
then `pr_low_setpoint`. The startup net ladders P-10 (10 %) < IR high (20 %) < PR low setpoint
(25 %), so continuing the ascent without them scrams at 20 %. Found while wiring it that a
checklist step is checked off by *any* command of the same family, so the two blocks would tick
each other — added a `trip_id` discriminator alongside the existing `failure_id` one, factored
into a new `_cmdEvidence()` used by both the checklist and follow watches.

**Harness note.** Three of the new step commands never reach an engine (`plot_1m_point`
instructor-side, `set_trip_block` and `set_auto_channel` M4-side). `run_procedures` drives
engines *directly*, below M4, so it now skips them via a documented `NON_ENGINE_ACTIONS` list —
`hold`/`acc`/`saw` still run. **This is the gate gap worth naming:** `run_procedures` could not
have caught item 5 or item 6, and it is the second time a procedure has been green at engine
level and broken under the stack. Noted in #206.

**Also fixed (owner reports filed alongside):**
- **#201** — release version by the logo. New hand-edited `site/release.js`
  (`window.RD_RELEASE = "Alpha 1.6.1"`), distinct from the `RD_VERSION` git-SHA deploy stamp,
  which `site/stamp_version.js` overwrites at build. Bump it *with* the `changelog.html` entry.
- **#192** — the pressurizer cutaway mapped its water band onto the LVL strip's 160–470 px span,
  so it read as a copy of the gauge. Now spans the inner dome apex (106) to the inner dish floor
  (541), derived from the `inner` path so it tracks the art; the strip keeps 160–470 as its own
  instrument span. Heater rods re-pinned to absolute pixels so widening the band did not drag
  them into the dish. Both verified by screenshot, not just by gate.

**Spun off — real defects found while measuring, deliberately not fixed here:**
- **#205** (medium) `pwr_startup` never dilutes boron, so Mode 1 is reached with the bank at
  26.8 % withdrawn where the 6 %-power preset sits at 62 %. This is the *honest* half of what the
  insertion-limit alarm was reporting; the flat floor was the defect, the deep bank is real.
- **#206** (high) `pwr_heatup` reaches **95.4 % SG level at step 8 under the full stack** and
  never pressurises or goes critical — invisible to `run_procedures`. Separately, **every**
  non-zero standing feed-pump demand 2–30 % overfills to a P-14 trip + scram. The two compound:
  heatup ends with the pump at 30 %, so heatup → startup back-to-back starts in the overfeed
  branch with `feed_sg` in MAN.
- **#207** (needs-ruling) the AFW hold band lying inside the amber zone, per item 5 above.

**Gates:** `node test/run_all.js` → **AGGREGATE GATE: OK, 19 runners at baseline**, no `BASELINES`
edits needed. `run_procedures` held **22/22 · 100/100** across three added steps (the new steps
carry no `acc`), `run_behavior` 35/0, `run_pwr` 32/32, `run_campaign` 51/51, `verify_e2e_ui` PASS,
`verify_manual_follow` 84 checks. Single tracked red `run_ops` 59/68 unchanged.

### 2026-07-25 — PI-9 retired on measurement; the MSIV made real (issue #199)  ✅🔬

Owner ruling on the PI-9 question raised by #131 — *"SI on low steam-line pressure: add it or
retire it?"* — decided by three measurements rather than by preference, plus a second ruling that
came out of the same investigation.

**Ruling 1 — PI-9 RETIRED (catalog §10).** The interlock's job in a real plant is *reactivity*:
boron in before an overcooled core with a strong negative MTC walks back to criticality, with the
most reactive rod stuck out. Three findings:

| # | Question | Measurement |
|---|---|---|
| 1 | Can this core return to power? | **No.** SLB against the MAXIMUM stuck rod (`STUCK_ROD_MAX_FRAC` 0.4 × `rod_worth_total` 8500 = **3,400 pcm held**) ends at **ρ = −9,604 pcm**, power 0.000 % — ~3× the held worth in spare margin. At sev 1.0, ρ = −27,252. The job does not exist. |
| 2 | Would adding it help? | **It harms.** Prototype (`steam_pressure` low @ 4.14 → `set_hpi`): SI fires at **47 s** into a primary that never lost a drop; **inventory pegs at the 120 % tank cap** by t=300 s, level 88 %, PZR LVL HI annunciated, and stays there. An automatic that floods an intact plant. |
| 3 | Is the severe case uncovered? | **No.** At sev 1.0 the primary does crash (0.11 MPa) and the **accumulators fire at 243 s**, dumping fully — boron 734 → 2500 ppm. Passive ECCS already covers the only case where injection could matter. |

The `PI-9` probe stays as the **fence**: it asserts the absence, so adding the interlock reddens
the gate and re-opens the ruling deliberately instead of drifting past it.

**Ruling 2 — the MSIV now isolates a downstream steam line break.** Found while answering
ruling 1, and the bigger defect of the two. `pwr_steam_generator.js:176` applied the break as an
**unconditional** pressure sink that never read valve position, so the operator's one lever on the
casualty did nothing — while `Manuals/07:552` said *"MSIV Close **if it terminates break (as
modeled)**"* and the catalog's TR-12 row claimed *"MSIV limits"*. Measured before the fix, closing
the MSIV 60 s into an SLB gave **SGp 0.10 MPa, Tavg 105.6 °C** — identical to leaving it open.

Fixed by modelling break **location**, which is the real-plant distinction and the honest one for
a single-generator plant:

- **`steam_line_break`** (existing id) = **downstream**, turbine hall. The valve stands between
  generator and break, so shutting it ends the blowdown: SGp **5.59 → 9.02 MPa**, code safeties
  lift, Tavg recovers to **305.8 °C** — i.e. it becomes the TR-5 bottled-SG condition.
- **`steam_line_break_upstream`** (new) = inside containment, between generator and valve. No
  isolation this plant owns reaches it: **5.59 → 0.10 MPa**, Tavg 105.4, MSIV or not. A multi-loop
  crew isolates the faulted SG and steams the intact ones; **this plant has one generator**, so
  that answer does not exist here. Say so rather than fake it.

With the MSIV left alone both variants are **bit-identical to the old model**, so `TR-12`, `PI-9`
and the ops/campaign SLB paths are untouched — the new behaviour only appears when someone shuts
the valve, which previously did nothing.

`pwr_slb` switched to the **upstream** variant: its arc is "you cannot stop the cooldown, only
shut the reactor down", and its `waiting` branch needs the blowdown to keep draining the
pressurizer to the low-level trip — a player who shut the MSIV mid-scenario would now terminate
the casualty and strand the story. Its prose said *"isolate the affected steam generator"*
(multi-loop thinking); both endpoint texts now explain **why** isolation is unavailable here and
that a downstream break would be a different casualty.

Save contract: `_fail.steam_break` gains `upstream`; `_migrateState` defaults legacy saves to
**downstream** (the only thing they can hold), so a restored mid-break save gains a working MSIV.
Pinned in the engine's `save_migration` test.

Docs corrected rather than patched around: catalog TR-12 row (both the false "MSIV limits" **and**
the false "trip + SI"), PI-9 → §10 with the measurements, rulings log, `Manuals/07` PWR-E19
(rewritten around the location split, +E19u index/severity rows, + a model-honesty note on the
absent SI and unmodelled PTS), `Manuals/01` + `03` MSIV purpose, and the `close_msiv` blurb in
`tools/gen_manual_reference.js`. Both manual pipelines regenerated (`pack_manuals.js`,
`gen_manual_reference.js`).

New probe **`TR-12b`** (`run_behavior` 34 → **35**) runs both legs off the same command and
severity, differing only in which side of the valve the pipe failed on. Closes the
`Manuals/ISSUES_AND_FINDINGS.md` I-33 concern about thin single-SG isolation logic.

### 2026-07-25 — The behavior battery's own coverage gaps closed (issue #131)  ✅🔬

`run_behavior` printed **30 pass / 0 xfail / 0 fail**, which reads as full coverage. It was
green partly because four catalogued behaviours were **never probed** — `PI-3`, `PI-8`,
`PI-9` sat at `todo` in the `COVERAGE` map and `TR-11` carried an unwritten "end-state pin".
A green gate that omits its own known gaps is worse than a red one, because it stops anyone
looking. Battery now **34 pass / 0 xfail**, coverage-todo list **empty**.

The issue text said `PI-3`/`PI-8` were blocked on an "interlock build". Stale — the catalog
had marked both **DONE (P4/P5)** and the setpoints are in `Manuals/09_SETPOINTS_LIMITS.md`.
Only the probes were missing. What the writing turned up:

**PI-3 — the trip is real but invisible by its reason string.** `si_trip` (12.4 MPa) sits
**0.01 MPa** under `lo_press` (12.41), and `_evalTrips` builds `last_trip_reason` as
`instrument + ' ' + direction` (`control_kernel.js:320`) — so both report
`'primary_pressure low'` and no depressurization can distinguish them. PI-3 is only
observable in the **blocked** case, which is exactly the catalog's note that a cooldown must
block *both*. Probe drives a `stuck_porv_open` depressurization three ways: lo_press blocked
alone → still scrams at 7.5 s (si_trip did it, level 52.9 % so not a level trip in disguise);
both blocked → pressure walks through 12.4 to 11.98 MPa unscrammed **but SI still actuates**
(blocking a trip does not disable the ESF — worth teaching); and the P-11 permissive
auto-blocks both at a `cold_shutdown` init and auto-reinstates them at 13.99 MPa on heatup.

**PI-8 — pinned the number, not just the behaviour.** `CA-4` already pins the two
behaviours (a sensed overfill trips; a stuck-low sensor defeats the single channel). The new
probe pins the **setpoint and the ordering**: trip fires at **indicated 97.05 %** (HR1 — the
instrument, not truth, which lagged at 97.34), the 75 % caution leads it by **102 s**, and the
FG-4 ride-out swell peaks at **57.8 %** — enormous headroom, not the ~94 % the catalog
predicted at P4.

**PI-9 — verified, and the answer is that the signal does not exist.** → **issue #199**
(owner ruling). No `steam_pressure` row in `PWR_ACTUATIONS` at all. On an SLB (sev 0.8) the
secondary blows down to **0.10 MPa** — an order of magnitude below the classic ~4.1 MPa /
600 psi setpoint — while `hpi_active` stays false for 900 s. No back door either: the
pressurizer holds the primary at 15.2–15.4 MPa while the loop crash-cools to **105 °C**, so
the 12.4 MPa actuation never sees its setpoint. End state is a primary at 105 °C and
15.4 MPa, **240 °C subcooled**, inventory 100 %. Currently harmless — the safety function is
reactivity, not inventory, and `TR-12` separately pins that shutdown margin covers the
overcooling insertion. Probe asserts that measured state, so adding the interlock reddens it
deliberately rather than silently. (Noted in #199 and not chased: a 240 °C-subcooled primary
held at full pressure is textbook **PTS**, which this model has no consequence for.)

**TR-11 — the catalog row was stale, and the end state is the opposite of what it says.**
The row ("slow depressurization, heaters lose, low-P trip unless isolated") predates the
**P5 spray capacity cap**. Measured under the cap: valve pegged at its 12 % cap, pressure
droops 15.41 → **15.33 MPa** and parks, heaters hold at **36.8 %** duty — no trip, no alarm,
for 30 min. A stuck-open spray valve is a **nuisance, not a casualty**. Catalog row struck
through and re-stated (superseded by the §12 ruling, not by this session's opinion).

**Found on the way — `stuck_open_spray` is defeated by two of its three command forms**
→ **issue #200**. The kernel maps `override_value: true` onto the field
`valueFieldFor('set_spray')` = `open`, but the engine resolves `auto` > `pct` > `open`
(`pwr_engine.js:668`). So SPRAY OFF `{open:false}` → stuck open ✓, while SPRAY AUTO
`{auto:true}` and the % slider `{pct:0}` **silently clear the failure** ✗ — and all three are
live board controls (`ui/app.js:2204/2223`). A player reaching for SPRAY AUTO, the natural
response, un-breaks the valve. Consequence today is ~0.08 MPa, hence `priority-low`; the
defect is in the mechanism. TR-11 deliberately drives the form that works and does **not**
pin the broken precedence, so the fix will not have to fight a test.

Files: `test/behavior_pwr.js` (+4 probes, `COVERAGE` map), `test/run_all.js` (`BASELINES`
30 → 34), `Blueprint/PWR_BEHAVIOR_CATALOG.md` (TR-11 + PI-9 rows). All 19 runners at
baseline.

### 2026-07-25 — 1/M approach rebuilt: three points is 79 steps short (issue #197)  ✅🔬

**Owner report:** *"Only plotting 3 points doesn't get you close enough to the correct rod
withdrawal step for criticality."* Confirmed and quantified.

The panel (`ui/panels/one_over_m.js`) least-squares over the **trailing 3 points**
(`FIT_WINDOW = 3`), x = fraction withdrawn, y = C₀/C, prediction at y = 0. Replaying the
checklist's own schedule from `hot_zero_power` — **true criticality ≈ step 224**:

| points plotted | at step | 1/M | predicted crit | error |
|---|---|---|---|---|
| 2 | 120 | 0.7069 | 409 | **+185** |
| 3 | 190 | 0.3314 | 303 | **+79** |
| …with a finer schedule | | | | |
| 4 | 200 | 0.2537 | 247 | +23 |
| 5 | 215 | 0.1321 | 235 | +11 |
| 6 | 223 | 0.0728 | **232** | **+8** |

The bias is **structural, not a bug**: early points sit in the flat toe of the rod-worth
S-curve, so the trend is too shallow and extrapolates long. `fit()`'s own comment already
documents this — it is why the window is trailing rather than all-points. The cure is more
points with **shrinking bursts**, so the trailing window ends up on the steep part of the
curve. It converges monotonically **from above** — always reading slightly high, the safe
side for "stop short of the prediction and creep".

**Fixed.** `pwr_startup` approach rebuilt around six points (`+120, +50, +30, +15, +8`),
and each approach step is now self-contained — *withdraw, settle, plot* — rather than
alternating withdraw-steps with plot-steps. Each step states what the prediction should read
there, so the player watches it walk down instead of trusting the first number; the caution
now says outright that an early estimate is an **upper bound, not a target**. The last
plotted point lands at ρ = −15 pcm, just subcritical — exactly where plotting should stop
and creeping should start.

Tail retuned for the shorter remaining distance: creep **+44 → +11**. Replayed: creep →
2.86 % (Mode 2), level off → **2.37 %** (Mode 2), raise → 12.43 % (Mode 1), grid → 12.5 MWe.
**Every phase peaks ≤ 0.89 DPM** — still under the 1.0 DPM alarm and the 1.5 DPM block set
the same day.

**Gates:** `run_procedures` **22/22, 97 → 100 checks** (`BASELINES` updated); all 19 runners
at baseline. Probe: scratchpad `probe_oom.js` (mirrors the panel's fit exactly and bisects
the engine for the true critical step).

### 2026-07-25 — S3 RESOLVED: the startup overshoot was the recipe, not the physics  ✅🔬

**Issue #134 ("after criticality the plant coasts to ~20 % power even when leveled").** The
S3 backlog row hypothesized *"a stronger low-power Doppler bite or gentler mid-curve
differential rod worth."* **Both were wrong**, and chasing either would have destabilized
the tuned Mode-5→1 heatup for nothing. The plant is fully controllable at the point of
adding heat; what lands it at 20 % is how the reactivity comes back out.

**The measurement that settled it** (scratchpad `probe_s3*.js`, `hot_zero_power` →
approach → level off → 1 h hands-off, rods then frozen):

| level-off method | leveled at | settles |
|---|---|---|
| continuous drive-in at Norm, released when SUR nulls | 3.77 % | **3.5 %** |
| same, gentler approach | 2.02 % | **1.8 %** |
| tap −1 step / 10 s | 3.77 % | 10.3 % |
| tap −1 step / 5 s from a brisk approach | 13.4 % | 19.8 % **+ IR-high scram** |

Same plant, same rod worth, same Doppler. The *only* variable is whether the accumulated
reactivity is removed in one drive or in taps — and the plant runs while you tap. Below the
point of adding heat there is no temperature feedback to hold you anywhere, so power goes
wherever the residual ρ takes it; sustaining even a gentle 1 DPM ramp means carrying
**~+200 pcm**, and all of it has to come back out.

**Three real defects, all of them downstream of that:**

1. **The shipped checklist codified the overshoot.** `ui/manual_procedures.js` step 9
   withdrew `+45` (≈ +430 pcm) and step 10 took back only `−8` (≈ −76 pcm). Its stated
   target was *"power steady, ~5–15 %"* and its acceptance was `power_pct > 5` — **landing
   above 5 % was a pass condition.** Replayed: **14.63 %**, holding 14.0 % an hour later
   (this is the "~15 %" the status line advertised).
2. **The checklist blamed the model for it** — *"this trainer lumps all control rods into
   one group with only Doppler feedback, so power OVERSHOOTS"*. Disproved above.
3. **The startup-rate protection was inert.** SUR HI alarm 2.0 DPM, rod-withdrawal block
   2.5 DPM. On the run that coasted to 19.8 % and tripped, **peak SUR was 1.82 DPM** — no
   alarm, no block, zero refused commands. SUR saturates near 1.4–1.8 DPM across a wide band
   of positive ρ (2.5 DPM ⇒ ~10 s period ⇒ ρ ≈ +400 pcm), so the setpoint sat above anything
   a startup reaches. It was a prompt-criticality backstop (its own comment says ~0.55 $)
   wearing a startup-rate label.

**Fixes** (owner ruling: target the 1–3 % band, and retune the rate protection):

- `layers/control/pwr_control.js` — SUR HI alarm **2.0 → 1.0 DPM**; rod-withdrawal block
  **2.5 → 1.5 DPM, clears 1.5 → 0.8**. Caution first, then the physical stop, both inside
  the ≤1 DPM the checklist already teaches.
- `ui/manual_procedures.js` `pwr_startup` — approach rebalanced (`+120 / +70 / +44 slow`,
  creep hold 150 → **600 s**, because three decades at ≤1 DPM genuinely takes ~10 min); the
  level-off is now **one decisive `−6` at Norm** with the technique spelled out; and
  **crossing the 5 % boundary is a new step of its own** (`+16 slow`) instead of something
  the ascent does to you. Replayed: creep → 1.30 % (Mode 2), level → **1.47 %** (Mode 2),
  raise → 12.43 % (Mode 1), grid → 12.5 MWe. **Every phase peaks ≤ 0.92 DPM**, so the
  by-the-book ascent never touches the new block.
- `scenarios/pwr_startup_challenge.js` + `test/run_campaign.js` — both routes re-probed.
  A *continuous* pull no longer runs away (the block interrupts it at ~+54 pcm), so the
  overshoot card is now reached the way a player actually reaches it: in **bites** taken
  while the rate sits under the block (7 × 40 steps banks ~+256 pcm, coasts to 12.6 %) —
  a sharper form of the scenario's own line, *the inhibit can freeze your hand but it
  cannot subtract*. The win line now arrests at **Slow**: with only ~54 pcm in, a Norm
  arrest removes ~30 pcm/s and drives through zero to −17 pcm, decaying out the *bottom*
  of the band.
- Setpoint prose synced in `Manuals/03/04/06/09` (repacked via `tools/pack_manuals.js`),
  `Blueprint/BUILD_DECISIONS.md`, `Blueprint/M4 control failure.md`.

**Gates:** all 19 runners at baseline. `run_procedures` **22/22, 96 → 97 checks** (the new
step; `BASELINES` updated). `run_campaign` held at **51/51** after the two drivers were
re-probed — they were tuned to the old interlock and legitimately had to move.

**Backlog:** S3 → **RESOLVED**. Note for whoever revisits this: the equilibrium map is
fine — one step ≈ 0.55 % power at the point of adding heat — so rod granularity is *not*
the lever. The lever is always how fast the excess comes out.

### 2026-07-25 — Gate honesty pass + the feed/steam clip asymmetry (S11)  ✅🔬

**Six issues closed, two gates repaired, one physics bug fixed, one aggregate gate built.**

**S11 RESOLVED — coupled feed clipped at 1.2 vs a governor clipped at 1.0** (`engines/load_mode.js`,
issue #130). Reproduced first: on `hot_full_power` in manual load, a sustained above-rated ask
walks SG level 65 → 89 % and scrams on `sg_level high` — 36 s at 1.3x, 61 s at 1.10x, 112 s at
1.05x; 1.00x and below are stable. Cause exactly as suspected: the governor clamps steam to rated
(`pwr_steam_generator.js:199`) while the coupling fed 1.2, a permanent imbalance nothing can null.
The 1.2 was the feed pump's runout capacity (`pwr_engine` `setFeed`, 0..120 %) reused as a *demand*
ceiling. Fixed by capping coupled feed at rated. **Scoped per-plant** via
`opts.maxCoupledFeedFrac` — capping the shared default moved `run_bwr` to 14/15 and those plants
are on hold, so PWR passes 1.0 and RBMK/BWR keep 1.2 until reopened. Untouched: the pump clamp
(deliberate overfeed still possible), the disconnected branch (matches an actual draw that can
exceed rated), and EV-11 (feed still tracks the load TARGET, so a slider move still shows its
transient mismatch — the new test asserts this explicitly). Regression pin:
`run_pwr load_above_rated_hold`, verified failing without the fix and banded against the *shipping*
high-SG setpoint rather than a literal.

**Two stale-scale defects fell out of it** (both from the ~1000 → 100 MWe rescale, both masked;
filed as #193 to sweep for more):
- `run_m6` Path 2 was **passing for the wrong reason** — it issued `set_steam_demand 600` where
  `pwr_lower_power` authors 60, a 6x ask, and only completed because the overfeed *scrammed the
  plant*, which is what drove power under the step's 98 % acceptance. Now 60; completes on the
  rods at t=8 s.
- `run_pwr load_mode_follow` asserted `load_target_mwe < 950` — vacuously true since the rescale
  (actual 86). Rebanded against rated + a real tracks-power check.

**`node test/run_all.js` is now THE gate** (#147). 19 runners vs a `BASELINES` map, ~5.7 min
(`--fast` skips the two Playwright gates, ~2.5 min). Exit codes alone were not enough — `run_ops`
exits 1 at 59/68 *and* at 55/68 — so each runner also carries a scraped tally baseline. Drift is
**symmetric**: scoring better than baseline fails too, so a red turning green must be acknowledged.
A discovered runner with no baseline entry fails the gate, so a new suite cannot go unlisted the way
`run_e2e_controls` did. **Baselines are now data, not prose** — that is the structural half of #161,
whose premise this confirmed (CLAUDE.md listed `run_m5` 19/19 while its own status text said 18/19;
truth is 18/19).

**Both UI-harness reds in §3.2 fixed:**
- `verify_manual_follow` **FAILED (30) → PASS (84 checks)** (#149). One line: it probed
  `RD.PwrSynoptic.isMounted()`, and the retired module still loads so the global exists but never
  mounts — all 30 PWR bar-checks were false negatives. `RD.PwrBoard` has the same API.
- `verify_e2e_ui` **FAIL → PASS (16 screenshots)** (#148). Two bugs, and *neither* was the retired
  synoptic probe this log blamed at UI-1 — that text was wrong, the file never referenced
  `PwrSynoptic`. (1) `REQUIRED_ACTS` demanded 14 `data-act` buttons the board path deliberately
  never emits (`ui/app.js:3413`, `:3459-3460` return before `populateControlBar`); replaced with 21
  board labels probed through `RD.PwrBoard.revealControl()` — the same path Instructor highlights
  use, so a broken label now fails both together. (2) the manual-units block clicked
  `[data-msec="setpoints"]`, renamed to `09_setpoints_limits` by the manual-md unification.

**A regression the red gate had been hiding.** Fixing (2) surfaced that the packed manual **does not
honour the units toggle at all** — `renderManualMd` (`ui/app.js:2813-2816`) caches on
`engineKey|docId` with no units key and renders markdown authored in SI, so it reads 1200 °C either
way while the gauges convert. That is **#111**, and it is a *regression*: the old structured manual
converted, and `verify_e2e_ui` asserted it (2192 °F vs 1200 °C). The unification dropped the
capability and staled the assertion in one stroke. Pinned as a **strict xfail** in the harness —
it errors with "promote this and close #111" the moment the manual starts converting.

**Four issues closed as stale, verified against source** — worth knowing the board was carrying
dead weight: **#78** (ECCS/HPI + AFW AUTO — fully working: `pwr_control.js:81-98`,
`control_kernel.js:121-133`, board triads at `pwr_board_wiring.js:103-109`; `run_autoctl` 20/20 and
`run_ops` asserts both auto-starts), **#128** and **#129** (both HR1 violations, both fixed by
`5e540c5` on 2026-07-16 — `pwr_steam_generator.js:54` reads `_ins_sg_level`, `load_mode.js:74` reads
`_ins_power_pct`), **#152** (the campaign `goto` validator shipped in `a171af8`; measured 137 gotos /
0 dangling, 503 triggers / 0 unrecognized; `wait_for_trigger` is a documented alias, not an unknown
token). #128/#129 sharing one fix commit suggests the whole #12x-13x batch was filed off a
pre-July-16 tree and deserves the same scrutiny before anyone works it.

Filed: **#189** (validator holes split from #152), **#191** (CI needs a ruling — Playwright is
vendored with no `package.json`), **#193** (rescale sweep).

### 2026-07-25 — PWR indication audit: 4 fiction readouts fixed; gap list filed  ✅🔬
Triggered by the owner asking what a real plant indicates for reactivity/startup, and whether
the ρ readout should be moved somewhere that reads as educational. Full inventory taken of
every PWR indication (5 surfaces: vital gauge strip, board diagram, strip chart, alarm panel,
Reactivity Computer + 1/M plot).

**Headline finding (no code change — owner ruling pending, filed as an issue).** The board's
`REACTIVITY … pcm` item sits *inside the NIS panel* (`pwr_board_wiring.js` VALUES item
`imro6rdwwdn`, coords 471,240) flanked by `INTER RANGE` / `SOURCE RANGE` / `STARTUP RATE` —
all genuine modeled instruments — with **no visual distinction**, while the engine comment at
`pwr_engine.js:406-411` already states real PWRs have no ρ gauge. A correctly-framed home
already exists (Sim tab → REACTIVITY COMPUTER, `ui/shell.html:166-168`). Recommendation: delete
the board copy, give the freed NIS slot to **POWER RANGE %** (modeled at `pwr_config.js:547`
but with *no board numeric at all* — digits exist only on the vital strip), leaving the panel
reading SR/IR/PR + SUR = the real channel set. Blocker: checklist highlight vocabulary points
at the ρ readout; `run_checklist` must stay 24/24.

**Fixed this session (4 readouts displaying fiction):**

| Readout | Was | Now |
|---|---|---|
| SIT N₂ pressure | hard-coded `640 psig` — `pwr_board_wiring.js` `accN2Psi` read `true_state.accumulator_pressure_mpa`, **never exported** by `getTrueState()` | real N₂ cover-gas pressure (new field) |
| SG FEED RATE | `control_state.feed_pump_speed_pct × 10` — pump *demand* | measured `instruments.fw_flow × GPM_FEED` |
| CONDENSATE POLISHER | hard-coded string `'NORMAL'` | `IN SERVICE`/`STANDBY` from `instruments.condensate_pump_running` |
| Net reactivity ρ | `+-0 pcm` — `sgn()` tested the *string* from `toFixed(0)`; `"-0"` coerces to `-0` and passes `>= 0` | `+0 pcm` |

**New physics — accumulator N₂ cover gas** (`pwr_primary.js` `stepAccumulators`, new `[tune]`
constant `accumulator_gas_frac: 0.35` at `pwr_config.js`). Gas expands isothermally into the
volume the discharged water vacates: `P = P0·Vg0/(Vg0 + Vdischarged)`. Indication only — the
injection driving head is still `accumulator_trip_mpa`, so no scenario physics moved. Curve:

| fill | 100 % | 75 % | 50 % | 25 % | 0 % |
|---|---|---|---|---|---|
| psi | 600 | 350 | 247 | 191 | 156 |

Old saves lack the field; `accN2Psi` now returns `null` (dash) rather than fabricating a value.

**Also removed:** dead comma-expression `CS(s).eccs_mode,` in the accumulator-status formatter
(`pwr_board_wiring.js`) — evaluated and discarded.

**Deferred to the UI revamp** — filed as **GitHub #122** (indication gaps) and **#123**
(radiation + containment); bodies drafted in `inbox/ISSUE_pwr_indication_gaps.md` and
`ISSUE_radiation_monitoring.md`. (`gh` was installed per-user later the same session — see
`CLAUDE.md` § Issue tracking; every agent-touched issue carries the `Claude` label.) Key
deferred items: the ρ move above; the strip
chart plots `true_state` for every trace because the Realistic toggle is `disabled`
(`ui/shell.html:173`) — a **larger** truth/instrument leak than the ρ readout, sitting directly
under a lagged gauge strip with nothing saying so; heatup/cooldown rate
(`tavg_rate_c_per_hr`) and plant mode (`plant_mode_name`) both computed every step and never
displayed; **core damage never annunciated** (`fuel_damaged`/`melted`/`destruction_cause` have
zero UI consumers — you can melt the core and the board says nothing); board hard-codes US
units and ignores the display toggle (`pwr_board_wiring.js:19-24`) — owner wants it toggleable,
deferred because it spans ~30 formatters plus the editable setpoint boxes' bounds and
parse-back.

**Scope — not planned** *(downgraded 2026-07-27 from "**Owner scope rulings** … out of scope —
do not add". Asked directly, the owner could not confirm he made that call, and the entry
carried no date or quote, so under the attribution rule in `CONTEXT.md` it is advisory, not
binding. The scope guidance is still good; the prohibition was never his to enforce.)*
Rod deviation (step counter vs RPI), generator electrical indications
(MVAR/volts/frequency/breaker), AFD/ΔI and QPTR are **not planned** — propose one with a
reason if you want it, rather than treating the omission as settled. Radiation monitoring +
containment instrumentation deferred to its own issue.

**Modeled but unused, decision pending:** `accumulator_flow`, `primary_leak_flow` (LOCA/SGTR
break flow has no readout anywhere), `condensate_flow`; plus status booleans `rhr_active`,
`rhr_valve_open`, `safety_relief_active`, `sg_safety_open` (SG code safeties pop invisibly).

**Gates** — all at baseline: `run_pwr` 31/31, `run_scenarios` 3/3, `run_m7` OK, `run_m4` 18/18,
`run_m6` 16/16, `run_meltdown` 8/8, `run_behavior` 30/0/0, `run_campaign` 51/51,
`run_checklist` 24/24, `run_procedures` 22/22, `run_e2e_controls` 28/30, `run_ops` 59/68,
`run_m5` 18/19 (pre-existing).

### 2026-07-25 — Rod-speed first-step bug: stale `step_accumulator` (all three plants)  ✅
**Report:** "moving rods in/out, the reactivity indication changes instantly even with rod
speed set to slow."

**Investigation.** The suspicion (reactivity computed from *demanded* rather than *actual*
rod position) was wrong, and worth recording as ruled out: `_rodReactivity` reads `g.steps`
only (`pwr_engine.js:74`); `nudge_target` is never in the reactivity path. Speed → velocity
in steps/s (`pwr_engine.js:564-568`, `:577-578`), position integrated with `dt`
(`:169-178`). Nothing writes a demanded position into `g.steps`. Two real causes:

1. **The bug — `g.step_accumulator` was never cleared by a new rod command.** It is
   initialized (`pwr_engine.js:54`,`:60`) and cleared on reset (`:1358`), but `rod_nudge` /
   `rod_start` cleared `coast_remaining_s`, `velocity` and `nudge_target` and left the
   fraction behind. A held **fast** drive strands it as high as 0.96; the next **slow** tap
   then lands its step in 0.08 s instead of 1.88 s. Measured, engine-direct:

   | case | first step at | expected |
   |---|---|---|
   | slow +1 from rest | 1.88 s | 1.88 s ✅ |
   | normal +1 from rest | 0.32 s | 0.31 s ✅ |
   | fast +1 from rest | 0.22 s | 0.21 s ✅ |
   | **slow +1 after a fast drive** | **0.08 s** ❌ | 1.88 s |

2. **Not a bug — the jump size is speed-independent by design.** Position is quantized to
   whole steps (`:172`) and the ρ readout is unfiltered true state (`getTrueState`
   `pwr_engine.js:466` → `ui/app.js:682`, `pwr_synoptic.js:950`; there is no reactivity
   entry in `pwr_instruments.js`). One tap therefore produces one discrete ρ jump of
   *identical* magnitude at every speed — 2.8 pcm at the cold-shutdown rod position,
   ~9 pcm in the critical band per the `max_steps: 912` retune note
   (`pwr_config.js:499-512`). Speed changes only the latency before the jump. Bug 1 was
   removing even that latency, which is what made it read as instant.

**Fix.** `if (!g.velocity) g.step_accumulator = 0;` in `rod_nudge` and `rod_start`, in
`pwr_engine.js`, `bwr_engine.js` and `rbmk_engine.js` (owner explicitly reopened BWR/RBMK
for this one fix).

**Why the `!g.velocity` guard, not an unconditional reset** — the automatic rod channel
re-issues `rod_nudge` on a `period: 5.0` cadence with `maxStep: 8`
(`pwr_control.js:365`), and 8 steps at slow (0.533 steps/s) takes 15 s. An unconditional
clear would discard up to a full step of real travel every 5 s during automatic control.
The guard is also the physically honest rule: a stopped drive starts clean, a moving drive
is mid-step.

**Owner ruling — do NOT smooth the ρ display.** Proposed and rejected: the reactivity
readout is the sim's designated *truth overlay* (labelled "not a plant instrument",
`pwr_synoptic.js:364`) and filtering it would blur exactly the instruments-vs-truth line
HR1 exists to draw. The step is also physically right — real bank differential worth.
Motion feedback already exists (`↑`/`↓` at `pwr_synoptic.js:983`, "withdrawing"/"inserting"
at `ui/app.js:3126`) and was simply being skipped past by the bug. If a slow drive still
feels wrong, the honest levers are `max_steps` (the step quantum) or `rods.speeds` — not a
cosmetic filter.

**Gates** — all at baseline: `run_pwr` 31/31, `run_bwr` 15/15, `run_rbmk` 23/23,
`run_autoctl` 20/20, `run_m4` 18/18, `run_m6` 16/16, `run_behavior` 30/0/0,
`run_meltdown` 8/8, `run_campaign` 51/51, `run_scenarios` 3/3, `run_procedures` 22/22,
`run_checklist` 24/24, `run_e2e_controls` 28/30 (baseline), `run_ops` 59/68 (baseline),
`run_m5` 18/19 (pre-existing rewind red, re-verified on clean HEAD this session).

### 2026-07-24 — MD-6 FIXED: time-dependent SG dryout depletion (dry + unfed bundle loses its residual)  ✅
The deferred meltdown-battery defect (total loss of feed+AFW parked the primary at ~297 °C
forever) is resolved structurally. Probing killed the level-threshold idea before it started:
**TR-2's recoverable loss of MFW also fully dries the SG** (wide hits 0.0 at ~62 s, secondary
pressure at the 0.10 MPa floor) before AFW rebuilds it — the physical difference from MD-6 is
only that **AFW is feeding the bundle** through the dry transit. So the fix keys on feed, not
level (3 files):
- `pwr_steam_generator.stepSecondary` steps a new state **`s.sg_dry_deplete`** (0..1): grows
  toward 1 with τ `sg_dryout_deplete_tau` (300 s) while wide < `sg_dryout_wide_pct` (30) AND
  `feedwater_flow` < `sg_dryout_feed_eps` (0.01); decays with τ `sg_dryout_rewet_tau` (45 s)
  otherwise — AFW wets the tubes even while the pool level is still rebuilding (real AFW
  physics, and the TR-2/MD-6 differentiator).
- `pwr_thermal.stepCoolant` scales the steam-side residual:
  `residual_eff = sg_dryout_residual × (1 − sg_dry_deplete)` (explicit coupling, previous
  step). `sg_dryout_residual` itself stays 0.02.
- `pwr_config.js`: the 3 new `[tune]` constants next to the dryout pair; the KNOWN-GAP comment
  replaced by the model note.
Result: MD-6 heats to **Tavg 366 °C**, lifts the PZR safeties, boils to 0 % inventory, fuel
damage @ 2835 s, melt @ 6250 s (`thermal_melt`). **TR-2 is bit-identical** (peak 15.88 MPa —
deplete never engages with AFW running), TR-3's PORV still lifts, FG-4 ride-out untouched
(wet SG ⇒ deplete = 0 in every other scenario). Old saves migrate (missing field defaults to
0 at every use site). `test/meltdown_pwr.js` XFAIL list is now **empty**.
- **Gates:** run_meltdown **8/8** (was 7/1), behavior 30/0/0 , pwr 31/31, scenarios 3/3, ops
  59/68 (same 9 documented RBMK/BWR reds), campaign 51/51, procedures 22/22, autoctl 20/20,
  checklist 24/24, m4 18/18, m5 18/19 (pre-existing rewind red), m6 16/16, m7 OK, e2e 28/30
  (pre-existing).

### 2026-07-24 — Meltdown-path battery: 4 core-damage defects found; 2 fixed, 1 reframed, 1 deferred  🔬✅
Owner stress-tested the physics "to find different paths to meltdown" and reported **all
meltdown paths have major issues.** Investigated the fuel-damage endpoint (`pwr_thermal.checkDamage`:
> 1200 °C damage, > 2800 °C melt) across the classic routes, built a new **strict-xfail gate**, then
(owner: "fix all") worked the list:
- **New files:** `test/meltdown_pwr.js` (battery `RD.MeltdownPWR`) + `test/run_meltdown.js` (runner,
  same PASS/XFAIL/FAIL/XPASS semantics as `run_behavior`). Writes `Diagnostic/MELTDOWN_REPORT.md`.
  Engine-direct via `RD.PWRScenarioTests.Harness` (the deterministic flagship_tmi harness).
- **Now 7 pass / 1 xfail** (was 4/4). Working paths (green): MD-1 large-break LOCA no-ECCS → melt,
  MD-2 TMI small-break → melt, MD-3 SBO → melt, MD-4 HPI recovery holds (negative control).
- **MD-5 FIXED (highest value)** — ATWS+LOCA was *benign* (uncovered core froze at 1250 °C) because
  decay heat was gated on the scram flag: `_Q_total = _P + (scrammed ? decay : 0)`. In an ATWS
  fission collapses from moderator loss, not a scram, so decay was never switched on. Made the term
  scram-agnostic: `_P + ((scrammed || _P < decay) ? decay : 0)` (`pwr_engine.js:248`) — identical
  when scrammed or at power (post-scram tail + normal ops unchanged), only adds the missing source in
  the unscrammed-fission-collapse regime. Now melts @ 1480 s. **1-line, 0 regressions.**
- **MD-7 FIXED** — `destruction_cause` was set on `engine.s` but omitted from the `getTrueState`
  return; added it (`pwr_engine.js:~449`). Melts now report `thermal_melt`.
- **MD-8 REFRAMED (not a bug)** — turned out to be the intended TMI lesson: a small break holds high
  pressure (decay heat pins Psat above the accumulator arming point), so HPI alone can't quite hold
  it and the operator must DEPRESSURIZE to arm accumulators/LPI (feed-and-bleed). Probed: passive
  HPI → damage @ ~19 min, but depressurize-to-flood → survives (sev 0.05-0.30 all protected). Test
  rewritten to assert the intended EOP recovery. The *passive* non-monotonicity (small break damages,
  medium self-depressurizes and refloods) is a known lumped-HPI simplification, recorded as info +
  flagged for owner review — not a hard fail.
- **MD-6 DEFERRED (genuine defect, structural)** — total loss of feed+AFW parks the primary at
  ~297 °C forever: a sustained dry SG stays a perfect heat sink (trip-open dump pins t_secondary
  ~190 °C low, 0.02 residual passes full decay heat). NO single-knob fix — lowering
  `sg_dryout_residual` heats MD-6 out but breaks TR-2 (the pre-AFW dip on a recoverable loss of MFW
  pushes peak pressure 15.88 → 16.25 MPa, over the < 16.20 band) at any residual below ~0.015, while
  MD-6 needs ≤ 0.006. Real fix is structural (limit the steam dump to actual steam generation, or
  time-dependent dryout depletion) — a secondary-model rework over the tuned load-rejection ride-out.
  Reverted the residual to 0.02; held red as the single xfail. Full detail in §3.4.
- **Gates:** all baselines held (pwr 31/31, behavior 30/0, ops 59/68, campaign 51/51, procedures
  22/22, autoctl 20/20, m4-m7, e2e 28/30, checklist 24/24). run_meltdown **7/1**.

### 2026-07-24 — Live-checklist revamp: 1/M startup + step-hover highlights + compact picker  ✅
Owner playtested the Mode 3 → Mode 1 board checklist: "lacking many steps… the biggest gap was
there's no instructions for the 1/M plot." Also asked that hovering a step highlight the relevant
controls/indications, and that the procedure picker list checklists without dumping every step.
**Three changes:**
1. **`pwr_startup` rebuilt (8 → 12 steps), 1/M-first** (`ui/manual_procedures.js`). Old flow secured
   SR *before* the withdrawal (defeating 1/M, which needs SR counts) and did one 300-step burst →
   ~48 % overshoot. New flow: set the 1/M baseline → two Norm bursts with a re-plot between each
   (SR = 500 → 707 → 2470 cps, all below the 5e4 amber caution) → **SR→IR handoff** (P-6 is
   satisfied from cold: IR instrument ≈ 8e-9 > 1e-10, so securing SR is *not* blocked, and SR never
   nears the 1e5 trip) → +45 slow to criticality → −8 slow to arrest the overshoot → connect grid.
   Lands ~15 % power (probed engine-direct **and** through the full SimulationService: no block, no
   trip, checklist completes). Every acc has wide margin (see `run_procedures` trace). `manual_ui_map`
   STEP_UI indices moved to `{i:3 Control Bank},{i:7 SR detector}`.
2. **Step-hover highlights** (`ui/app.js` `glowLabels`/`stepHlLabels` + `renderChecklist`; new
   `.ckl-glow` green preview class in `shell.css`). Hovering a `.ckl-step` glows every control +
   indication the step names, reusing `RD.PwrBoard.revealControl`. Steps carry an explicit `hl`
   list (controls **and** readouts — e.g. `['1/M Plot Tool','Source Range']`, `['Control Bank',
   'Startup Rate','Reactivity']`); absent that, it falls back to the step's own `control` string.
   New **indication vocabulary** added to `CONTROL_LABEL_MAP` (Reactivity, Startup Rate, Tavg, Plant
   Pressure, SG Level, Source/Intermediate Range, 1/M Plot Tool) + control aliases so the heatup
   checklist's `control` strings resolve (Boron control, RCP Run/Stop, Dump SP, Pressure SP,
   Accumulator valve). Board-only — not campaign labels, so no SYN_CONTROL_MAP parity needed.
   `obs()` gained a 4th `hl` arg. Headless-Edge smoke: 12/12 steps hoverable, step-3 glows 3 tiles /
   step-2 glows 2, all clear on mouseout, **zero console errors**.
3. **Compact Procedures (live) menu** (`ui/app.js` `mProcCard(pr, collapse)`): the selection page
   tucks steps into a `<details>` ("▸ Show the N steps") so it reads as a checklist list, not a step
   dump. `.m-step` DOM still emitted (collapsed) so `verify_manual_follow` still resolves. Accident
   walkthroughs pass `collapse=false` (steps are their content).
**Gates:** run_procedures **22/22** (96/96, was 95), run_checklist **24/24**, run_m6 **16/16**,
run_campaign **51/51** (2932), run_pwr 31/31, run_m4 18/18, run_autoctl 20/20. `run_m5` **18/19** —
the 1 red (rewind bit-exact) is **pre-existing, verified on clean HEAD via git-stash** (docs claim
19/19; that's stale — this change doesn't touch physics/PRNG/service). No manual repack (procedures
render live from `manual_procedures.js`, not packed). Manuals 03/04/09 still narrate 1/M/SR→IR
conceptually — a prose refresh to match the new step granularity is a nice-to-have, not done.

### 2026-07-23 — Boron analyzer removed from the UI (owner ruling; chemistry-first teaching)  ✅
Owner changed course after the sample build: boronometers are sometimes fitted but the industry
doesn't RELY on them — teach chemistry sampling instead. **UI-only removal; all code kept for
restore** (each spot carries a dated comment): board analyzer readout `imrmtp2alpy` spliced out
in `extraItems()` + 'ACTUAL' label relabeled 'CHEM' + `bdBoronChem` moved into the old spot
(1011,880 @18); synoptic CVCS B-row readout + learning dual removed; `app.js` boron trend series
commented out (future: re-add as stepped `boron_sample` history); Automate tab pv hidden via new
generic `pvDisplay:false` def flag (kernel `getAutomationState` nulls entry.pv) — the channel
still READS the analyzer internally for engage-capture/re-anchor ("the panel knows roughly what's
in the loop"). Manuals: 03 §7.5 rewritten chemistry-first ("no live boron meter — grab samples +
dose bookkeeping, like the industry"), instrument table row → `boron_sample (CHEM)`; 04 minimal
line-fixes (precaution + N09 step + subcritical-confirm step). **Training overhaul deferred to
Opus — full worklist at backlog S12.** Gates: pwr 31/31, autoctl 20/20, m4 18/18, m5 19/19,
m6 16/16, m6ph 8/8, m7 OK, ops pwr 21/21, behavior 30/0/0, campaign 51/51, procedures 22/22,
checklist 24/24, e2e 28/30 (same 2), scenarios 3/3; headless board screenshot verified.

### 2026-07-23 — Boron chemistry sample (owner-approved: auto + manual SAMPLE button)  ✅
Follow-on to the batch-dose rework (AskUserQuestion ruling: auto sample on dose completion +
manual button). Engine: `take_boron_sample` command → `_boron_sample_timer` (lab turnaround
`reactivity.boron_sample_lab_s = 60` [tune], compressed from real 30–60 min) → result =
**mixed (`boron_reactive`) concentration rounded to 1 ppm** — deterministic, NO PRNG draw (the
noise stream must not shift); exposed as instrument STATUS fields `boron_sample` /
`boron_sample_pending` / `boron_sample_seq` (status pass-through, not a lagged spec). Kernel
(`_stepConc`): a completed dose auto-issues the sample (confirmatory chemistry); a FRESH result
while idle **re-baselines** — books AND `c.sp` snap to the lab number (prevents both stale-books
doses and phantom doses toward an old target; mid-dose results latch but don't apply); seq latches
on engage/first-eval so stale results never fire. `dose_remaining` added to the automation
snapshot for totalizer readouts. UI: board EXTRA_ITEMS `bdBoronSample` (CHEM SAMPLE button, lit
while lab busy) + `bdBoronChem` (readout), BORON CONTROL box grown 85→115 via extraItems();
status value appends `DILUTING 12→`; synoptic CVCS gets Dose + Chem rows and a Sample button
(`boron-sample` act). Probed (full stack): manual sample posts ~60 s and re-baselines
(762→822 after a +180 freehand, no phantom dose); dose completion auto-confirms (10 ppm ask →
lab 724 = target); legacy saves (fields stripped) migrate clean, zero drift. **Gotcha:**
`assembleSnapshot().instruments` ALIASES the live reading object — a probe that stores snapshots
and prints later reads current values, not captured ones (bit this session; capture primitives).
Headless Edge: CHEM SAMPLE click → SAMPLING… → result renders; panel screenshots verified.
Gates: pwr 31/31, autoctl 20/20, m4 18/18, m5 19/19, m6 16/16, m6ph 8/8, m7 OK, ops pwr 21/21,
behavior 30/0/0, campaign 51/51, procedures 22/22, checklist 24/24, e2e 28/30 (same 2), scenarios
3/3. Manuals 03 §7.5 CHEM SAMPLE block; repacked.

### 2026-07-23 — Boron batch-dose rework (S8 + S9 fixed; owner-approved design)  ✅
Owner: "power change doesn't follow the dilution change." Diagnosis (probes: engine-direct
OpsHarness + full-stack SimulationService, free-play defaults) → **S8–S11**. Owner asked how real
plants do it → ruling: implement **real makeup-panel batch semantics**. Rework (`control_kernel.js
_stepConc` + `pwr_control.js` def): a new target ppm computes a dose vs the channel's **bookkept
concentration** and meters it feedforward at `rate` 0.05 ppm/s (was 0.5 — ~real-plant ×2),
**stopped by the flow totalizer**, never chasing the 45 s-lagged analyzer; no deadband (`db`
dropped — 1 ppm board nudges execute); books re-anchor from the filtered analyzer only when a NEW
target finds them stale > `reAnchorPpm` 15 (ECCS boration); dose pauses with the charging pump
(same gate as the engine's injection); batch state (`concMode/concBasis/concLastSp`) rides
save/rewind, old saves load with no phantom dose (absent → books = saved target). Side effect
worth keeping: a spent totalizer doesn't dilute against ECCS boration toward a stale target (the
old seek did). Probed: 1 ppm ask → −0.95 delivered; 25 ppm ask → −25.0 exact, Pmax 102.6 % (was
118 % + high-flux scram), Tavg absorbs ~0.45 °C/ppm; pump-pause/resume, MAN-override, mid-dose
save/load all clean. **S10** (at rated, dilution moves Tavg not power — authentic) addressed as
teaching text: Manuals 03 §7.5 batch-dose block + "dilution moves Tavg, not power" note; 02 §7.2
channel row; WIRING_REFERENCE.md updated; manuals regenerated + repacked. **S11 still open**
(coupled-feed 1.2 vs governor 1.0 clip → SG overfill when feed_sg is OFF) — *[resolved later,
2026-07-25, #130; left as written here since this is the historical entry]*. Engine mixing-lag fix
(07-23) verified working; power still leads the analyzer ~15 s (mix τ 30 vs analyzer lag 45) —
matters far less now that doses are slow. Gates: autoctl 20/20, m4 18/18, m5 19/19, m6 16/16,
m6ph 8/8, m7 OK, pwr 31/31, behavior 30/0/0, ops pwr 21/21, campaign 51/51, procedures 22/22,
checklist 24/24, e2e 28/30 (same 2 pre-existing reds), scenarios 3/3, manual_follow 30 fails
(= baseline).
Owner: Mode-5 setpoint 350→600 psi pressurized "almost instantly." Probed: **K_heater 0.55 MPa/s
at full demand** (its job: transient-holding authority — the SGTR plateau consumes all of it), so
a 1.73 MPa setpoint step completed in ~3 s. Fix: **upward setpoint slew** — the effective control
target (`s._pressure_sp_eff`, `pwr_pressurizer.effectiveSetpoint`) walks up at
`setpoint_pressurize_slew_mpa_s = 0.02` [tune]; the commanded `pressure_setpoint` (display) is
untouched; DOWN is immediate; and the slew binds only the portion **above current pressure** —
an operator freezing a depressurization at "current + 0.3" must stop the pull-down NOW (the
first cut regressed `ops_sgtr_managed` into bulk voiding exactly there). Heater INDICATION reads
vs the commanded setpoint (runs 100 % during a pressurization) while the dP term uses the slewed
target (`s._heater_dp_frac`) — real-plant feel: heaters flat out, thermal pace. Seeded at init
(both IC paths) + `_migrateState`; **seed-at-first-step was a bug** (a cmd before the first
engine step became the seed → instant jump). Probed: 350→600 psi now 80 s; cold→NOP ≈ 11 min sim.
**Fallout fixed:** `pwr_return_to_mode1` timed out — its `arrive_mode1` beat needed true Tavg
> 298 while the no-load anchor is ~297 (razor edge crossed only by power-spike flicker; the
slew's ~10-min timing shift + slightly higher xenon made the spikes miss). Gate → 296 (matches
`pwr_mode5_to_mode3`'s 295 convention).
**Checklists (owner ask):** new `pwr_heatup` (Mode 5 → Mode 3) — RCP start, dump-SP restore,
slewed pressurization (hold 720), accumulators, feed 30 %, SR→IR, bulk+fine rod approach, then a
**dilution ride** (`set_boron_adjust −0.12` for 4300 s — one command = a smooth ramp the MTC
self-regulates; rod-chunk trims spiked to 158 % in prototyping) to Tavg ~314, rods-in + borate →
lands 297.2 °C / Mode 3 / −7.4 k pcm. Feed too low dries the SG and the heatup runs away
(prototype hit Tavg 366 — keep ride power ≤ ~35 %). `pwr_startup` extended to Mode 1
(title/purpose, +3 steps: 5 % boundary obs, `connect_grid` → 51 MWe, plant_mode ~1);
`campaign_data` teaches + crosswalk/alignment docs updated; manual_ui_map indexes safe (steps
appended, never inserted). Gates: procedures **22/22** (95/95), checklist 24/24, campaign 51/51,
run_pwr 31/31, behavior 30/0/0, ops PWR 21/21, autoctl 20/20, m4–m7 green.

### 2026-07-23 — fine-step rod drive: 228 → 912 steps (owner: startup granularity)  ✅
Owner startup playtest: criticality at ~61 steps, ONE step jumped power 0 → ~10 % — no granular
control in the critical region. Probed (scratchpad `rod_probe.js`): ~**36 pcm/step (~5.5 ¢)** at
the crossing (static crit step 56 xenon-free); at the point of adding heat one step ≈ +4 %
equilibrium power with ~2× transient overshoot → matches the report. Root cause: the single lumped
bank carries the full 8500 pcm a real plant spreads over ~4 banks × 228 steps (real bank-D
differential worth is ~5–15 pcm/step). The earlier `rod_worth_curve_flatten` (see entry below) was
already maxed at 0.8 — the flatten can't fix a quantization problem.
**Fix — subdivide the drive ×4, preserve all dynamics:** `rods.max_steps` 228 → **912**, `speeds`
×4 in steps/s (slow 0.533 / normal 3.2 / fast 4.8 — identical fraction-of-travel per second), so
the ONLY change is a 4× finer quantum: **9.0 pcm/step (~1.4 ¢)** at the crossing (probed, crit
step 224). Everything absolute-step-scaled moved with it: `ROD_RUNAWAY_RATE_MAX` 6 → 24 steps/s +
`continuous_rod_withdrawal` severity_meta (max 24 / default 12); `rods_tavg` channel gain 0.4 →
1.6, maxStep 2 → 8 (same authority in travel); PWR rod_nudge literals ×4 across engine drivers,
ops/behavior/campaign/checklist/m6-follow drivers, `pwr_sg_flood` setup, and the PWR
`manual_procedures` (75→300, 6→24, −10→−40); board tap stays `steps:1` (that IS the granularity
win). **Save migration** in `loadState`: rod groups rescale steps by max_steps ratio (same
fraction of travel → same reactivity). Board `/228` readout units → `/912` patched re-export-safe
in `extraItems()` (generated `pwr_board_data.js` untouched); 1/M panel reads max_steps from the
snapshot (default bumped). Docs: Manuals 03/04/09 + M1 spec §7/§16, CONTEXT contract comment,
M8/new_diagram_controls/WIRING_REFERENCE; manuals repacked. RBMK/BWR untouched (own 228 configs;
their `manual_procedures` step counts deliberately NOT scaled). Considered and rejected: lowering
`rod_worth_total` (breaks Mode-5→1 heatup + at-power authority, only ~2× gain), true multi-bank
overlap (right long-term shape, way bigger blast radius — deferred, unchanged from the prior
ruling). Gates: run_pwr 31/31, behavior 30/0/0, ops PWR 21/21, autoctl 20/20, m4 18/18, m5 19/19,
m6 16/16, m6ph 8/8, campaign 51/51, procedures 21/21, checklist 24/24, scenarios 3/3, m7 OK,
e2e 28/30 (same 2 pre-existing F12 reds), rbmk 23/23, bwr 15/15. Headless board check: `/912` live.

### 2026-07-23 — boron mixing lag + rod-worth-curve flatten (owner feel)  ✅
Owner: (1) borate/dilute swung power ~instantly while the boron indication lagged — power keyed
off `s.boron_ppm` (injected) with NO mixing lag, while `boron_analyzer` lags 45 s. Fix: new
`reactivity.boron_mix_tau_s = 30`; engine holds `s.boron_reactive` (first-order lag of `boron_ppm`,
initialized in `_trimToCritical`, saved via the whole-`s` deep-copy) and `_totalReactivity` uses it.
Probed: reactive-boron now leads the analyzer ~15 s (was ~45 s) and power changes over ~30 s.
**Gotcha:** the lag broke `pwr_boron` — that demo steers a razor ~2 °C Tavg band with fast
open-loop boron (rate 2), so `rate×tau` overshoots the band. Owner ruling (AskUserQuestion): enable
the lag + rework the demo. Reworked its two decision branches to gate on **operator_action + a 45 s
settle** (lag-independent) instead of exact Tavg crossings — teaches the same feel. (2) Low-power rod
touchiness: single control group carries the whole ~8500 pcm, so ~48 pcm/step near criticality.
Reducing `rod_worth_total` breaks the Mode-5→1 heatup (needs the worth to reach power); instead added
`reactivity.rod_worth_curve_flatten` scaling `scruve`'s sinusoid (`scruve(pos, K)`), flattening the
peak while keeping the integral. 0.8 is the strongest the tuned startup tolerates (~10 % gentler
peak; 0.5–0.7 break `pwr_return_to_mode1`). A bigger cut needs rod banking/overlap (owner deferred).
Gates all green (run_pwr 31/31, campaign 51/51, behavior 30/0/0, ops 59/68 baseline, autoctl 20/20,
m4–m6, procedures 21/21).

### 2026-07-23 — indication noise halved + board hover glow  ✅
Owner asks (with issue #113, already-fixed 1 MW load step — verified, no change). (1) **Cut
indication noise in half**: new `PWR_CONFIG.instrument_noise_scale = 0.5`, applied to `spec.noise`
at the two gauss draws in `pwr_instruments.update` (constructor reads it → `this.noiseScale`). PRNG
draw ORDER/COUNT unchanged (one draw per instrument), so saves/rewinds/scenarios stay deterministic;
only noise MAGNITUDE drops. Regressed 2 razor-edge ops probes (`run_ops` 59→57): `ops_pwr`
cooldown "subcooling never lost" (true min −0.4 vs >0) and SGTR "inventory ≥55 %" (54.8 vs 55) — both
because the probes' own coarse control reacts to the steadier indicated values, shifting the trajectory
a few tenths across an infinitesimal threshold (behavior physically unchanged). Fix: gave those two
checks documented physical tolerances (subcooling > −1 °C; inventory > 54 %) — a real loss reads many
units, not tenths. `run_ops` back to 59/68 baseline, PWR probes green. (2) **Board hover glow**: cyan
`:hover` box-shadow on `.bd-btn`/`.bd-pop button`/`.bd-num-frame` + drop-shadow on `.bd-scram`
(`pwr_board.css`) — the clickable HTML controls now glow like the valves/PORV already did (those are the
only clickable components; pumps are ART-only/suppressed, condenser non-interactive). Gates all green.


### 2026-07-23 — TMI-2 Part 1 rework (issue #105)  ✅
Owner playtest → GitHub issue #105 (7 items). Two owner rulings (`AskUserQuestion`): Part 1
becomes **guided hands-on** (player performs the historical actions, supervisor takes over on
`inaction`; outcome stays historical), and pacing is **smoothly compressed, no skip buttons**.
Changes: `scenarios/pwr_tmi2_p1.js` reworked (operator_action/inaction branches for
secure-HPI + isolation, phase `watchGate(until,msg)` rails, `beat.speed:6` compression, "gone
SOLID" callout); `layers/simulation_service.js` `_authoredSpeed` flag so an authored FF rides
through the alarm cascade instead of snapping to 1× on each new alarm (scram/failure still
hard-stop); board `pwr_board_wiring.js` PORV reads `true_state.porv_open` (stuck-open valve
visibly vents + flows while the demand lamp stays "closed"), tailpipe gauge goes amber >100 °C,
discharge pipes added to `PIPE_TEMP`; `pwr_board.css` `.bd-maint-tag` now hangs OVER the valve.
#4 "never went solid" was legibility, not physics (probe: `pzr_level_pct` pegs 100 % ~t196–670).
Full rationale in `Blueprint/BUILD_DECISIONS.md` (2026-07-23 entry). Gates green: run_campaign
51/51, run_m5 19/19, run_m6 16/16, run_autoctl 20/20, run_pwr 31/31, run_m4 18/18, run_m7 OK,
run_procedures 21/21, board_check 54/0; both Part-1 paths reach core-damage headlessly.

### 2026-07-22 — ECCS pump merge — change plan drafted (awaiting owner approval)  ⏸
Owner reversed the dedicated-ECCS-pump ruling (it was written on faulty info; real Westinghouse
charging pumps ARE the high-head SI pumps). Decision: combine makeup + high-head HPI into one
pump ("one pump, two speeds"), keep LPI/RHR as its own pump, no throttle valve in the diagram.
Grounded change plan written to **`Blueprint/ECCS_PUMP_MERGE_PLAN.md`** (verified board state:
two adjacent pump glyphs, HPI panel is the only injection control, NO board RHR card — RHR is
auto). Recommends **Option B**: the HPI panel becomes the Safety-Injection actuation driving
BOTH pumps (charging/HPI high-head immediately; RHR/LPI low-head once depressurized), LPI stays
automatic → no new card. Full file/symbol change-list + 4 open decisions (D1 Option A vs B, D2
loss-of-charging-pump coupling, D3 labels, D4 hpi_flow_hh/lh snapshot fields). **Not yet
implemented** — pending owner sign-off on D1–D4.

### 2026-07-22 — Audit: hunt for other flow-scale/node mistakes (PWR)  ✅ clean
**Owner request:** in light of the CVCS bug (a cold-leg flow scaled against the whole primary
volume), review the PWR code for other instances of the same class.
**Method:** traced every term that enters an accumulation (integration), checking two axes per
term — the **spatial node** it draws on and the **magnitude scale** it uses.
**Finding — no second instance.** The complete primary mass balance
(`pwr_primary.stepInventory`): charging/letdown (now `×cvcs_inventory_gain`, cold-leg node) —
fixed; HPI/LPI, accumulators (accident scale, cold-leg node), PORV/safety/leak (accident scale)
— all deliberately calibrated and node-correct. Spray and RHR are correctly *excluded* from the
balance (internal recirculation, no net inventory). Confirmed by grep that charging/letdown enter
an accumulation in **exactly one place**, so the gain can't be bypassed. The *correct* version of
the pattern is already present: heat-to-SG (`h_sg·flow_frac`) and pzr spray
(`spray_flow_frac·flow_frac`) both scale with cold-leg flow — what letdown was missing. Secondary
side is internally consistent (feed/steam/dump/AFW/relief all on one rated-flow basis). Instrument
model, boron chemistry (direct ppm/s rate), and xenon/iodine don't share the hazard.
**The one seam RESOLVED by plant design (owner ruling 2026-07-22).** I had noted CVCS charging and
HPI as "the same physical pumps on different scales." Owner ruling: **this plant's ECCS/HPI has its
OWN dedicated pump** (RWST-sourced SI train), separate from the small CVCS charging pump — already
realized in code (independent `hpi_active` vs `charging_pump_running` flags, own `set_hpi` command,
own `hpi_discharge_pressure`) and in the UI (the board's dedicated ECCS pump element). So the
different flow scales are *physically correct*, not a compromise: a large SI pump simply delivers
far more than a small make-up pump. Comments in `pwr_primary.injectionFlowInv` + `pwr_config.js
emergency` reframed from "charging-pump head" to the dedicated ECCS train. **No physics change.**

### 2026-07-22 — P7 CVCS drain rate + associated behaviors (PWR)  ✅
**Owner report:** letdown drains the pressurizer far too fast to respond to.
**Root cause:** CVCS shared the lumped accident inventory scale, so ~20 gpm letdown read as
~2 %/s of pzr level.
**Fixed:**
- New `cvcs_inventory_gain` (0.012) puts CVCS charging/letdown on their own scale in the
  mass balance. Uncompensated orifice-A drain now **~2.2 %/min** (probe
  `ops_cvcs_pzr_drain_rate` green: 15 % drop in ~417 s). AUTO servo re-tuned to match with a
  damped level error (`cvcs_charge_per_level` 0.001→0.01, new `cvcs_level_filter_tau` 20 s).
- **SGTR re-anchored** (`leak_scale` 0.12→0.03): the old "2× charging_max" premise died with
  the rescale, and AUTO charging had been silently acting as a second HPI (the EOP scenario
  only passed because of it). Full rupture now ≈ ½ HPI rated; still forces trip + SI + EOP,
  and the single-SG EOP wins the inventory race honestly.
- **SI on pzr_level lo-lo (12 %)** added — closes P1(b). The smaller leak lets the heaters
  hold pressure, so the pressure-only SI path never fired while inventory drained. New ESF
  actuation rides the `hpi` arm; TMI untouched (its deceived level reads *high*).
- `ops_sgtr_managed` EOP script gained real SI-termination criteria (subcooling **and** level
  recovered). Removed dead `cvcs_makeup_gain` + stale `_charging_actual`.
**Docs:** BUILD_DECISIONS "P7 CVCS↔inventory retune", OPS_TUNING_REPORT update 2026-07-22b,
CHANGELOG, Manuals 03/06/09 (repacked). **Commit:** `ed51104` on `develop`.
**Gate delta:** ops-PWR 20→**21/21** (P7 green); e2e_controls 27→**28/30**.

### Earlier resolved (pre-log, captured for continuity)
Distilled from `Diagnostic/OPS_TUNING_REPORT.md` + `BUILD_DECISIONS.md`:
- **CVCS bumpless AUTO→MANUAL transfer + 17 % letdown isolation** (2026-07-21) — a single
  MANUAL toggle used to drain the plant; letdown could empty it. Fixed before P7 addressed
  the underlying *rate*.
- **P1** SGTR leak scaling / auto-SI, **P2** steam-dump capacity cap, **P3** normal-shutdown
  forgiveness (CVCS holds programmed level), **P6** spray Psat floor — all resolved in the
  2026-07-19 PWR ops-tuning pass.
- **C1** high-flux trip could never fire (meter clip) — PWR/BWR `power_range`→`[0,200]`.
- **C3/C4** scram recovery + manual-scram RPS latch — `reset_rps` path landed; behavior
  probe PI-7 and the ops `abuse_scram_then_recover` confirm.

---

## Part 3 — Known & suspected issues backlog

Ordered roughly by priority. **Acceptance test** = the red probe (or check) that turns green
when it's fixed. RBMK/BWR items are the bulk of the remaining ops-suite reds.

### 3.1 Live `run_ops` failures (9 — all RBMK/BWR + 1 deliberate)

| ID | Plant | Symptom | Suspected cause | Knob(s) / location | Acceptance |
|---|---|---|---|---|---|
| **R1** | RBMK | Post-1986 core still steam-explodes on the Chernobyl sequence — the "same sequence is survivable" design intent fails | Void-driven excursion outruns the 12-s insertion once the power trip finally fires | Add a short-period/SUR trip (post only); or harden void saturation; or lower post `MAX_PROMPT_GROWTH` — `rbmk_config.js` + `rbmk_control.js` | `abuse_chernobyl_post` "must be survivable" |
| **R2** | RBMK | Drum level dynamics ~5–10× too fast (90 s 50 % FW dip crashes 50→7 %, pegs 100 % on restore) | `K_drum_level` too high; no feed-follows-steam trim | `K_drum_level` (4.0) ~5× down; consider auto feed trim — `rbmk_config.js` | `ops_feedwater_dip_pre` + `_post` (50 ±8 recovery) |
| **R3** | RBMK | Post fine control knife-edged — honest maneuvering hits the 110 % trip / ends ramps at 94 % | Tight post margins (partly authentic) + coarse rod step | Higher Doppler damping or a 'fine' rod speed — `rbmk_config.js` | `ops_flow_reduction_post` |
| **B2** | BWR | No pressure regulator: any power drop collapses vessel pressure into the 5.52 MPa low trip | Turbine follows power/fixed-load, not pressure — real BWR is pressure-priority | Add a behavioral pressure-regulator load mode (steam draw holds `vessel_p_rated`) — `engines/bwr` + `load_mode.js` | `ops_recirc_pump_trip` (settle ~40–50 % on nat-circ) |
| **B3** | BWR | RCIC/HPCI lose to post-trip boiloff — level falls to ~0.6 % hands-off; the authored `bwr_sbo_rcic` procedure can't meet its own step | Injection capacity too low vs boiloff/level gain | Raise `rcic_flow_normalized`/`hpci_flow_normalized` or lower `K_vessel_level` — `bwr_config.js` | `ops_lofw_handsoff` + `run_procedures` (bwr_sbo_rcic) |
| **B4** | BWR | Depressurization paths stall above the LPCI window (manual SRV / ADS never reach <1.03 MPa) | Blowdown-vs-decay-steam balance; SRV time constant | `srv_manual_tau` (150), blowdown balance, or `lpci_threshold_pressure` — `bwr_config.js` | `ops_sbo_managed` depressurization check |
| **B5** | BWR | Stuck-open SRV blows vessel down, level→0, but **LPCI never auto-starts** (gated only on `ads_open`) | Missing low-level + low-pressure LPCI permissive | Add the permissive path — `bwr_control.js` actuations | `abuse_srv_stuck_walkaway` level-defense |
| **C2** | RBMK | Protection latency grows with time acceleration — 256× rod runaway → steam explosion where 1× trips cleanly | M5 evaluates M4 once per broadcast (wall cadence) | Evaluate trips inside the physics-step loop (every N sim-sec) or auto-drop accel on new alarm — `simulation_service.tick()` | `abuse_accel_latency` [post] (**deliberately RED** until fixed — same outcome 1× vs 256×) |

> C2 is PWR/BWR-tolerable already (their excursions are slower — both `abuse_accel_latency`
> pass); the RBMK post case is the sharp one and is held as an intentional red so the
> regression can't go stale.

### 3.2 Test-suite / UI-harness reds (pre-existing, not physics)

| ID | Symptom | Suspected cause | Fix direction | Status |
|---|---|---|---|---|
| **F12** — **RESOLVED 2026-07-25** (#150) | `run_e2e_controls` 28/30 -> 35/35: (a) PZR spray manual set reaches engine only 12 (want ≥45); (b) "CVCS auto make-up holds inventory vs leak ≥98 %" | (a) spray-demand reach drifted; (b) stale expectation — severity-1.0 SGTR is now 0.03 frac/s (~40× CVCS make-up), so "auto holds ≥98 %" isn't physical | **Neither was a regression.** (a) spray has an owner-ruled flow cap (`spray_flow_max` 0.12, CC-5) applied to the operator override too, so 12 IS the cap — now asserts below-cap passthrough + at-cap clamping, read from config. (b) rebuilt as differential checks (OFF stops charging / ON commands it / auto measurably slows the loss). A third check that was PASSING was also meaningless: it compared `charging_flow` to `leak_flow` directly, which are different scales (`cvcs_inventory_gain` 0.012 vs 1:1). | **RESOLVED 2026-07-25 (#150)** — 35/35. Raised #194: in mass terms CVCS covers a constant ~24 % of any leak, so none is ever held — **that last claim is RETRACTED (2026-07-29m, #194): the ~24 % was a 40 s reading of an 83 s control loop, measured in CYCLES mistaken for seconds. CVCS holds every leak inside its authority at ~100 % coverage. Now 39/39.** |
| **UI-1** | `verify_e2e_ui` FAIL — pwr/primary board controls "not found" by the harness | **This suspected cause was WRONG** — the file never referenced `RD.PwrSynoptic`. Real causes: (a) `REQUIRED_ACTS` demanded 14 `data-act` buttons the board path deliberately never emits (`ui/app.js:3413`, `:3459-3460` return before `populateControlBar`); (b) the manual-units block clicked `[data-msec="setpoints"]`, renamed `09_setpoints_limits` by the manual-md unification | Probe 21 board labels via `RD.PwrBoard.revealControl()` (same path Instructor highlights use); re-point the manual section | **RESOLVED 2026-07-25 (#148)** — PASS (16 screenshots). Surfaced #111: the packed manual ignores the units toggle entirely, now a strict xfail here |
| **UI-2** | `verify_manual_follow` 30 PWR bar-checks fail | Retired-`PwrSynoptic`-probe — correct for THIS file: it probed `RD.PwrSynoptic.isMounted()`, and the retired module still loads (global exists) but never mounts, so every PWR bar-check was a false negative | Swap to `RD.PwrBoard` (identical `isMounted`/`revealControl` API) | **RESOLVED 2026-07-25 (#149)** — one line; FAILED (30) → PASS (84 checks), delta verified against the pre-fix file |

### 3.3 Suspected / oddities (not hard failures — watch or investigate)

Pulled from `OPS_TUNING_REPORT.md` §P7 / §4–6; none currently fail a gate, but each is a
real smell worth a look during this effort.

| ID | Plant | Observation | Why it might matter |
|---|---|---|---|
| **S1** | PWR | `abuse_porv_walkaway` end state shows inventory 120 % (clip at `mass_max`) with pzr level 7 % — the overfill/level bookkeeping disagree | **ANSWERED 2026-07-30j (#249): it is the clip, and the clip is load-bearing.** `mass_max` 1.2 is 3.4× the sourced physical headroom (5.8 % of RCS volume — BVPS-2 Table 5.1-1 + WTSM 3.2 Table 3.2-2), and it pins indicated pzr level at exactly 88.00 % on any quench, so the plant **cannot read water-solid on injection**. Injection-verified; see the session entry. **RESOLVED 2026-07-31 (#136 closed).** The retune was ruled and landed *(OWNER RULING, 2026-07-30: "249 - fit it.")* — `level_per_mass_surplus` 300 → **776**, fitted to the pressurizer steam space as 5.8 % of RCS volume. Re-measured on this probe: the end state is now **120.0 % inventory / 100.0 % level** — solid, and the two gauges agree. The clip is still what pins inventory at 120 %, and that remains load-bearing and correct; what changed is that indicated level can now express the surplus instead of pinning at 88.00 %. **Now ASSERTED**, not just observed: `abuse_porv_walkaway` gained a both-gauges-agree check (run_ops 334 → 335 passed), because the two numbers had been printed on an `info` line every run and asserted on none — which is the whole reason this survived. Reddens by injection at 88.0 % on the pre-#249 gain |
| **S14** (#273) | PWR | **The by-the-book Mode 3 → Mode 5 cooldown dumps all four accumulators.** Measured endpoint: `accum_vol=0.0 %`, `boron=2310 ppm` (SIT charge is 2,500), `inv=120.00 %` clipped. Nothing tells the player to isolate them — **zero** "accumulator" mentions in `ui/campaign_data.js` or `Manuals/05_MODE_TRANSITIONS.md` | Found 2026-07-30j while working #249. The cooldown crosses the 600 psi (4.14 MPa) SIT arming pressure with the discharge valve still open. Invisible until now because the 88 % level pin (S1) kept the overfill below the 97 % high-level trip — the `pwr_mode3_to_mode5` "arrived UNscrammed" check has been passing **for the wrong reason (HR10)**. The engine's own driver isolates correctly (`pwr_engine.js:1833`); the heatup procedure re-opens a lineup the cooldown never establishes (`ui/manual_procedures.js:58`) |
| **S2** | PWR | **RESOLVED (2026-07-31, issue #135)** — and this row was right where the GitHub issue was wrong. The window was **2.9 s**, not ~4, and #135 filed it as "a setpoint/lag question… not a physics change", which was arithmetically impossible: the setpoints are 13 points apart, so at the old drain rate no spacing could buy more than a few seconds. "Slowing SG boil-down" was the correct instinct and "slightly" understated it 3.6×. `K_sg_level` **5.0 → 1.37**, fitted to Ginna UFSAR Table 15.2-4 (ADAMS ML20339A101): 35 s from feed loss to lo-lo trip. Window now **11.6 s**. Pinned by TR-14 | Was: too fast for a player to react — consider slowing SG boil-down slightly |
| **S3** | PWR | **RESOLVED (2026-07-25, issue #134)** — and the suspicion in this row was wrong. Not a physics/rod-worth problem: the plant parks at 1.8–3.5 % when the excess reactivity is removed in ONE drive, and at 10–20 % when it is tapped out. The real causes were the checklist recipe (+45/−8, target "5–15 %", `acc: power_pct > 5`), a caution that blamed the lumped core for it, and an inert rate protection (alarm 2.0 / block 2.5 DPM against a peak of 1.82). See session entry | Was: startup feel — maybe a stronger low-power Doppler bite or gentler mid-curve differential rod worth |
| **S4** | PWR | 50 % xenon swing may be a touch small (peak ~106 % vs ~113 % on the daily cycle) | Fine for v1; note if xenon scenarios feel flat |
| **S5** | RBMK | Zero-flow aftermath too forgiving — post-trip fuel sits ~570 °C indefinitely, never dries out/damages | Real consequence is boil-off→dryout over tens of minutes; scale `h_fc` with channel flow at decay levels |
| **S6** | RBMK | EPS bypass — verify M4 actually honors `eps_bypassed` in `_evalTrips` (was cosmetic; a `disable_auto_trips` effect now exists — confirm it inhibits auto-trips for the Chernobyl sequence) | The historical sequence can't be walked if bypass doesn't suppress trips |
| **S7** | BWR | High-level (L8) protection + startup rod-block absent (overfeed to 150 % pegs 100 % with no alarm/trip) | Siblings (PWR/RBMK) have both; add at least a `vessel_level_high` alarm |
| **S8** | PWR | **RESOLVED (2026-07-23)** — batch-dose rework removed the deadband entirely; 1 ppm board nudges now execute (probed −0.95 ppm delivered). See session entry | Was: board arrows nudge 1 ppm but `boron_conc` deadband ±8 ppm swallowed target changes ≤ 8 ppm |
| **S9** | PWR | **RESOLVED (2026-07-23)** — `boron_conc` no longer seeks the lagged analyzer: a new target meters a feedforward dose stopped by a flow totalizer (real makeup-panel semantics), rate 0.5 → 0.05 ppm/s. Probed: 25 ppm ask delivers −25.0 exactly, power peaks 102.6 % (was 118 % + scram) | Was: seek on the 45 s-lagged analyzer over-delivered ~50 % and spiked/scrammed the plant |
| **S10** | PWR | At 100 % with the governor at rated, steady-state power ALWAYS returns to ~100 % after dilution — Tavg absorbs it (+~0.45 °C/ppm). AUTHENTIC PWR physics (probed 2026-07-23), but reads as "boron does nothing" from the board | Teaching-surface gap, not a bug: nothing on the board tells the player boron moves Tavg (not power) when the turbine is pinned at rated |
| **S11** — **RESOLVED 2026-07-25** (#130, see session log) | PWR | Load-coupled feed (feed_sg channel OFF, `load_mode.js` follow branch) clips feed at 1.2 while the governor clips steam at 1.0 — any power excursion above rated integrates SG level up (probed 65→89 %) until an `sg_level high` scram minutes later, looking unrelated to its cause | Hidden in default free play (feed_sg defaultOn holds level) but live whenever feed is manual/failed; fix = clip coupled feed to the governor's deliverable or feed on `steam_out_total` in follow mode too |
| **S13** | PWR | ATWS **at power** with heat sink intact (failure_to_scram + continuous_rod_withdrawal) self-limits at ~756 °C on Doppler and never damages; may be too benign vs a real ATWS overpressure/PCT event | Lower priority than the MD-x set; revisit after the decay-heat gate (MD-5) is fixed, since that changes every uncovered-core outcome |

### 3.4 PWR meltdown-path physics defects (found 2026-07-24 — owner playtest "all meltdown paths have major issues")

New gate: **`node test/run_meltdown.js`** (battery `test/meltdown_pwr.js`, strict-xfail). Now
**8 pass / 0 xfail / 0 fail** (was 4/4 at discovery). MD-5 + MD-7 fixed, MD-8 reframed, MD-6
fixed 2026-07-24 (dryout depletion). Report auto-writes to `Diagnostic/MELTDOWN_REPORT.md`.

| ID | Symptom | Root cause | Fix / location | Status |
|---|---|---|---|---|
| **MD-5** | ATWS + LOCA (worst real accident: full-power core + no coolant) was **benign** — the uncovered core froze at ~1250 °C and never melted | Decay heat gated on the scram flag: `_Q_total = _P + (scrammed ? decay : 0)`. In an ATWS fission collapses from moderator loss (uncovery), not a scram, so decay was never switched on | Scram-agnostic: `_P + ((scrammed || _P < decay) ? decay : 0)` (`pwr_engine.js:248`) — unchanged when scrammed or at power; only adds the missing source on unscrammed fission collapse | **RESOLVED (2026-07-24)** — melts @ 1480 s, 0 regressions |
| **MD-7** | On a confirmed melt the operator-facing true state reported `destruction_cause = undefined` | The field is set on `engine.s` (`checkDamage`) but was omitted from the `getTrueState()` return block | Added `destruction_cause: s.destruction_cause` (`pwr_engine.js:~449`) | **RESOLVED (2026-07-24)** |
| **MD-8** | With PASSIVE full ECCS, LOCA survival is **non-monotonic** — a small break (sev 0.05-0.10) damages while a medium (0.20) refloods | By DESIGN: a small break holds high pressure (decay heat pins Psat above the 4.14 MPa accumulator arming point — the TMI inventory/void lesson), so HPI alone can't quite hold it and the operator must DEPRESSURIZE to arm accumulators/LPI (feed-and-bleed EOP). Passive-band non-monotonicity is a known lumped-HPI simplification | Test **reframed** to assert the intended depressurize-to-flood recovery (sev 0.05-0.20 all survive with it); passive band recorded as info | **RESOLVED-as-reframed (2026-07-24)**. *Open for owner review:* whether to also make the passive small-break case monotonic (would need HPI strengthening, which conflicts with the deliberate SGTR-outruns-HPI balance) |
| **MD-6** | Total loss of heat sink (MFW+AFW, no makeup) parks the primary at **~297 °C forever** instead of heating to the PZR safeties, boiling off, and uncovering (TMI-without-recovery) | A **sustained dry SG stays a perfect heat sink**: the trip-open steam dump vents to the condenser and pins `t_secondary` ~190 °C below Tavg, so the 0.02 residual conductance still passes the full decay-heat load with no secondary-inventory limit | **NO single-knob tune** — lowering `sg_dryout_residual` heats MD-6 out (works ≤ 0.006) but deepens the pre-AFW dip on a recoverable loss of MFW → TR-2 peak 15.88 → 16.25 MPa (band < 16.20) at any residual below ~0.015. Real fix is structural: **time-dependent dryout DEPLETION** — probing showed TR-2 *also* fully dries its SG (wide 0.0 @ 62 s) before AFW rebuilds it, so no level threshold separates the cases; the differentiator is that TR-2's bundle is being FED through the dry transit. New state `s.sg_dry_deplete` (stepped in `pwr_steam_generator.stepSecondary`): grows τ 300 s while dry AND unfed (`feedwater_flow < sg_dryout_feed_eps`), rewets τ 45 s on any feed; `pwr_thermal.stepCoolant` scales the residual by (1 − deplete). Constants `sg_dryout_deplete_tau / rewet_tau / feed_eps` in `pwr_config.js` | **RESOLVED (2026-07-24)** — MD-6 heats to Tavg 366 °C, boils down, damage @ 2835 s, melt @ 6250 s; TR-2 bit-identical (15.88 MPa peak), all gates held |

> The plant modeled normal ops and the flagship TMI path well, but the *space of ways to actually
> damage the core* was ungated until now. MD-5 (the owner-flagged "worst accident is benign") was a
> one-line, zero-regression fix. MD-6 needed the dedicated secondary-model effort (dryout
> depletion, fixed 2026-07-24) — the battery is now fully green with an empty XFAIL list.

| **S12** | PWR | **TRAINING OVERHAUL WORKLIST (owner: Opus does this later; trainings need a major overhaul anyway).** Boron analyzer was UI-REMOVED 2026-07-23 (chemistry sampling is the teaching tool); training content still *narrates* the analyzer. Complete inventory of what to rework: **(a)** `scenarios/pwr_boron.js` beats at lines ~36 and ~47 — "the boron analyzer shows the number" / "watch the boron analyzer creeping down"; re-teach as dose-order + CHEM SAMPLE confirmation (the scenario's decision logic already gates on operator_action + settle, not the analyzer — text-only change); **(b)** `layers/instructor_layer.js` line ~45 maps `boron_ppm → boron_analyzer` for beat conditions — still FUNCTIONAL (instrument exists, just undisplayed) but consider re-keying teaching beats to `boron_sample` or true-state; **(c)** `ui/campaign_data.js` mission 7 (`pwr_boron`) teaches-line "boron vs rods: chemistry for the long game" — fine, but the mission should introduce the sampling ritual; **(d)** Manuals 04 PWR-N09 got minimal line-fixes only (steps now say "confirm with a chem sample") — the full procedure should teach the batch-dose + sample workflow properly; **(e)** any walkthrough/checklist prose that says "watch the boron ppm fall" live (checklists key on `boron_ppm` acceptance checks — functional, fine). UI restore path if ever wanted: `pwr_board_wiring.js` extraItems() splice + 'CHEM' relabel, `pwr_synoptic.js` B-row comment, `app.js` boron series comment, `pvDisplay:false` on the channel def — all one-line reverts, instrument untouched | Teaching-content debt, not a defect; the sim mechanics are already sample-first |

---

## Pointers (authoritative sources — don't duplicate, curate)

- **Dense rationale / decisions:** `Blueprint/BUILD_DECISIONS.md` (Open Flags table + dated entries).
- **Ops-probe findings (the original C/P/R/B catalog):** `Diagnostic/OPS_TUNING_REPORT.md`.
- **Behavior-catalog gaps:** `Diagnostic/BEHAVIOR_GAP_REPORT.md` (auto-generated by `run_behavior`).
- **User-visible changes:** `CHANGELOG.md`.
- **Manual issues:** `Manuals/ISSUES_AND_FINDINGS.md`.
- **As-built numbers always win over prose** — read the engine/config, not the docs, when a
  number is in doubt (README rule).
