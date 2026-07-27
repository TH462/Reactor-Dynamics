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
| **`run_all`** | **OK (21 runners)** | **THE aggregate gate — `node test/run_all.js`; baselines are data in its `BASELINES` map, not prose** |
| `run_procedures_stack` | **22/22 (155/155)** | NEW 2026-07-26b — procedures through M4+M5+M6. **6** strict xfails, all RBMK/BWR (#208); the 7 `pwr_heatup` xfails cleared 2026-07-26c/d (#206, #210) |
| `run_meltdown_stack` | **3/3 (21/21)** | NEW 2026-07-26d (#209) — the core-damage casualties driven **hands off** on the shipped lineup; asserts the automatic chain fires unprompted |
| `run_pwr` | **32/32** | PWR engine-direct (+`load_above_rated_hold`, the #130 pin) |
| `run_rbmk` | **23/23** | |
| `run_bwr` | **15/15** | |
| `run_behavior` | **35 / 0 xfail / 0 fail** | PWR behavior catalog — coverage-todo list **empty** (#131); +TR-12b MSIV break isolation (#199) |
| `run_ops` | **57/68** | 2026-07-26d: harness rewired to the SHIPPED lineup (#209), so two PWR probes that silently assumed load-follow now command it; 11 open = RBMK/BWR + 1 deliberate red (see backlog) |
| `run_m4`..`run_m7` | **19** / **19** / **17** / OK | stack layers — all green. m6 16 → 17 on 2026-07-27b (#142), a save/restore test for the instructor's operator-action memory. m5's rewind red RESOLVED 2026-07-25 (#151): `lastInstruments` was not rebuilt on restore, so every blockable trip reported `asserted=false` |
| `run_autoctl` | **20/20** | |
| `run_scenarios` | **3/3** | flagships |
| `run_campaign` | **51/51** (3024) | 2930 → 3024 on 2026-07-27b (#189) — the static passes now walk `RD.SCENARIOS` directly, so unwired and bonus-only scenarios are validated too |
| `run_procedures` | **22/22 (101/101)** | engine-direct — see the layer table in CLAUDE.md before trusting it for anything M4 decides |
| `run_meltdown` | **8/8** | PWR core-damage paths — all resolved; MD-6 fixed 2026-07-24 (time-dependent dryout depletion, §3.4) |
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
- **Protection cadence scales with acceleration** (C2). M5 evaluates M4 once per broadcast,
  so at 256× the RPS checks the plant every ~13 sim-seconds — slow to catch fast excursions.
- **Meter range vs trip setpoint** (C1). `crossed()` is strict (`value > setpoint`); a meter
  that clips *at* its trip setpoint can never fire it. PWR/BWR `power_range` widened to
  `[0,200]` for exactly this.

---

## Part 2 — Session log (newest first)

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

**Owner scope rulings:** rod deviation (step counter vs RPI), generator electrical indications
(MVAR/volts/frequency/breaker), AFD/ΔI and QPTR are **out of scope** — do not add. Radiation
monitoring + containment instrumentation deferred to its own issue.

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
| **F12** — **RESOLVED 2026-07-25** (#150) | `run_e2e_controls` 28/30 -> 35/35: (a) PZR spray manual set reaches engine only 12 (want ≥45); (b) "CVCS auto make-up holds inventory vs leak ≥98 %" | (a) spray-demand reach drifted; (b) stale expectation — severity-1.0 SGTR is now 0.03 frac/s (~40× CVCS make-up), so "auto holds ≥98 %" isn't physical | **Neither was a regression.** (a) spray has an owner-ruled flow cap (`spray_flow_max` 0.12, CC-5) applied to the operator override too, so 12 IS the cap — now asserts below-cap passthrough + at-cap clamping, read from config. (b) rebuilt as differential checks (OFF stops charging / ON commands it / auto measurably slows the loss). A third check that was PASSING was also meaningless: it compared `charging_flow` to `leak_flow` directly, which are different scales (`cvcs_inventory_gain` 0.012 vs 1:1). | **RESOLVED 2026-07-25 (#150)** — 35/35. Raised #194: in mass terms CVCS covers a constant ~24 % of any leak, so none is ever held |
| **UI-1** | `verify_e2e_ui` FAIL — pwr/primary board controls "not found" by the harness | **This suspected cause was WRONG** — the file never referenced `RD.PwrSynoptic`. Real causes: (a) `REQUIRED_ACTS` demanded 14 `data-act` buttons the board path deliberately never emits (`ui/app.js:3413`, `:3459-3460` return before `populateControlBar`); (b) the manual-units block clicked `[data-msec="setpoints"]`, renamed `09_setpoints_limits` by the manual-md unification | Probe 21 board labels via `RD.PwrBoard.revealControl()` (same path Instructor highlights use); re-point the manual section | **RESOLVED 2026-07-25 (#148)** — PASS (16 screenshots). Surfaced #111: the packed manual ignores the units toggle entirely, now a strict xfail here |
| **UI-2** | `verify_manual_follow` 30 PWR bar-checks fail | Retired-`PwrSynoptic`-probe — correct for THIS file: it probed `RD.PwrSynoptic.isMounted()`, and the retired module still loads (global exists) but never mounts, so every PWR bar-check was a false negative | Swap to `RD.PwrBoard` (identical `isMounted`/`revealControl` API) | **RESOLVED 2026-07-25 (#149)** — one line; FAILED (30) → PASS (84 checks), delta verified against the pre-fix file |

### 3.3 Suspected / oddities (not hard failures — watch or investigate)

Pulled from `OPS_TUNING_REPORT.md` §P7 / §4–6; none currently fail a gate, but each is a
real smell worth a look during this effort.

| ID | Plant | Observation | Why it might matter |
|---|---|---|---|
| **S1** | PWR | `abuse_porv_walkaway` end state shows inventory 120 % (clip at `mass_max`) with pzr level 7 % — the overfill/level bookkeeping disagree | A level/inventory contradiction is exactly the class of bug the derived-level rework was meant to kill; worth confirming it's just the clip |
| **S2** | PWR | LOFW warning-to-trip window is only ~4 s (`ops_loss_of_feedwater_handsoff`) | Too fast for a player to react — consider slowing SG boil-down slightly |
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
