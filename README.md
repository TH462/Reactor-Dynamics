# Reactor⚛️Dynamics

An educational, browser-based nuclear power plant simulator. It models three reactor
types — a **PWR** (Pressurized Water Reactor), an **RBMK** (Chernobyl-type), and a
**BWR** (Boiling Water Reactor) — accurately enough to teach real plant behavior and to
reproduce the conditions behind the three most famous nuclear accidents: **Three Mile
Island**, **Chernobyl**, and **Fukushima**.

It runs entirely in the browser as vanilla JavaScript — no server, no downloads, no
WebAssembly, no framework, no build step — so it works in restricted institutional
environments.

**Defining design principle:** operators interact with **instrument readings** that can
lag, drift, and fail — never with the true physical state. The gap between what is *true*
and what is *indicated* is what makes the accident scenarios meaningful (at TMI a valve
indicator read "closed" while the valve was stuck open). This is Hard Rule 1; see
`Blueprint/CONTEXT.md`.

---

## Start here (this is the map)

This README is the front door. **You do not need to read everything** — find your task
below and go straight to the authoritative source for it.

| If you want to… | Read / run |
|---|---|
| **Understand the whole system** | This file, then `Blueprint/CONTEXT.md` (interfaces, hard rules, data contract). |
| **Understand *why* it's built this way** | `Blueprint/DESIGN_COMPANION.md` (vision, rationale, deliberate exclusions, v2 roadmap). |
| **Build or modify a module** | `Blueprint/CONTEXT.md` **plus that one module's spec** (`Blueprint/M1`–`M8`) — and nothing else. |
| **Know what changed recently** | `CHANGELOG.md` (skimmable) → `Blueprint/BUILD_DECISIONS.md` (dense engineering rationale, tuning, gate tallies). |
| **Operate the plant / look up a control, setpoint, or procedure** | `Manuals/` — start at `Manuals/README.md` (commercial-format PWR operator manuals). |
| **Pick up the active tuning / bug-fixing effort** | `Diagnostic/TUNING_LOG.md` — the session-continuity record: current status, the tuning toolbox (knobs + tests + workflow), a dated worklog, and the full backlog of known & suspected issues. **Read this first when continuing tuning work.** |
| **See current known issues, tuning gaps, playtest findings** | `Diagnostic/` (`TUNING_LOG.md`, `SPEC_AUDIT_*.md`, `OPS_TUNING_REPORT.md`, `PLAYTEST_REPORT.md`) and `Manuals/ISSUES_AND_FINDINGS.md`. |
| **Tune plant behavior (the physics "knobs")** | Each plant's **`[tune]`-annotated constants** in `engines/<plant>/<plant>_config.js` (PWR 89, RBMK 27, BWR 37 — the file header explains the convention: `[tune]` values are starting points arbitrated by the scenario suite; un-marked values are fixed). Protection/alarm/failure setpoints are data too, in `layers/control/<plant>_control.js`. Validate a change with `test/run_ops.js` (behavior probes) and `test/run_behavior.js`; open tuning targets are tracked in `Diagnostic/OPS_TUNING_REPORT.md`, and the live worklog + toolbox is `Diagnostic/TUNING_LOG.md`. |
| **Run the simulator** | Open `index.html` (the ReactorDynamics.com landing page — Operate the PWR from there), or `ui/shell.html` directly — see below. |
| **Run the tests** | `node test/run_<suite>.js` — see below. |

> There is no `CLAUDE.md`. **This README is the orientation document for coding agents**
> (Claude and others). When in doubt about a number, prefer the as-built engine/config
> values over prose docs.

> **Coding agents — RBMK and BWR are on hold.** Do **not** implement, tune, refactor,
> extend, or "fix while you're here" the RBMK or BWR engines, controls, scenarios, UI,
> or their tests. All active work is **PWR only** until the PWR is finished and the owner
> reopens those plants. Touching them wastes tokens; leave known RBMK/BWR reds and
> backlog items alone unless the owner explicitly asks. Shared code is fine to change
> for a PWR need — do not start RBMK/BWR-specific work.

---

## Project status

> **Keep this section current.** When you finish work that changes what is built, working,
> or broken, update the status line and the gate baselines below in the same change. This
> is the at-a-glance truth for the next agent. The dense, append-only version lives in
> `Blueprint/BUILD_DECISIONS.md` (Status line + Open Flags table) — update both.

_Last updated: 2026-07-22 (P7 CVCS↔inventory retune — letdown/charging off the accident scale,
SGTR re-anchored to ½ HPI, SI-on-pzr-level-lo-lo ESF added; see `Diagnostic/OPS_TUNING_REPORT.md`
update 2026-07-22b)._

**Layers**
- **Physics engines complete** — PWR (M1) ✅, RBMK (M2) ✅, BWR (M3) ✅. All three have
  full balance-of-plant (turbine/condenser/generator + electrical output). The PWR now
  models a **Cold Shutdown (Mode 5) initial condition** and the **full Mode 5 ↔ Mode 1
  heatup/cooldown on integrated physics** (previously `[narr]`-only) — see `CHANGELOG.md`.
- **Stack complete** — Control (M4) ✅, Simulation Service (M5, +rewind) ✅, Instructor
  (M6) ✅ (beat engine, Path-2 follow, TMI flagship, rewind, highlights, Hook + Training),
  Test Runner (M7) ✅.
- **UI (M8): functional alpha, PWR only** 🟦 — M8 and the M4 control UI are not yet
  extended to RBMK/BWR.

**Known open work** (details in `Diagnostic/` + `Manuals/ISSUES_AND_FINDINGS.md` +
`BUILD_DECISIONS.md` Open Flags)
- Chernobyl / Fukushima **flagship scenarios** and the campaign wrapper for RBMK/BWR.
- Extend the **M8 UI / M4 control surface to RBMK + BWR**.
- **Campaign ↔ Mode-5 alignment: done** — strings use *Mode N, Name*, and three missions
  (`pwr_mode5_to_mode3`, `pwr_mode3_to_mode5`, `pwr_return_to_mode1`) drive the full Mode 5 ↔ 1
  loop on the board (`Manuals/CAMPAIGN_MODE_ALIGNMENT_SPEC.md` §2–3). `11_CAMPAIGN_CROSSWALK.md`
  verified current (Rev 1, 34 missions + bonus) in the 2026-07-19 review.
- **Mode-5 controls now exposed in the UI** (pre-ship review): RCP **Run/Stop** (`set_rcp`),
  **Pressure SP** and **Dump SP** setpoint boxes. Remaining polish: a `plant_mode` text
  indicator and an explicit `eccs_mode` readout (nice-to-have; the missions are playable
  without them).
- **ECCS card UI layout** open (contract in `Blueprint/pwr_synoptic_prerequisites.md`).

**Current gate baselines** (a change should keep these at or above baseline — see
_Definition of done_): PWR engine suite **31/31**, BWR **15/15**, RBMK **23/23**, campaign
**51/51**, `run_m4` **18/18**, `run_m5` **19/19**, `run_m6` **16/16**, `run_autoctl` **20/20**,
`run_behavior` **30/0/0**, `run_e2e_controls` **28/30** (2 pre-existing F12 reds — a PZR-spray
reach check and the CVCS-auto-vs-severity-1.0-SGTR "holds ≥98 %" expectation, both stale;
the third F12 red turned green with the 2026-07-22 P7 retune), `run_procedures` **21/21**
(1 strict known-fail, B3), `run_checklist` **24/24**, `verify_e2e_ui` **FAIL (pre-existing,
verified on clean HEAD 4df8ac5 — pwr/primary board controls not found by the harness; same
family as the `verify_manual_follow` PwrSynoptic-probe staleness, follow-up)**,
`verify_manual_follow` **84** (30 pre-existing PWR bar-check fails, documented 2026-07-21),
M7 **OK**, ops probes **59/68**, PWR **21/21** (every FAIL is a documented RBMK/BWR tuning
target with a hard acceptance check — P4, R1/R2/R3, B2/B3/B4/B5, and the deliberately-red
C2 accel-latency check; **P7 resolved 2026-07-22** — CVCS letdown/charging now enter the
mass balance through `cvcs_inventory_gain`, an uncompensated 20 gpm letdown walks the pzr
down ~2 %/min; see `Diagnostic/OPS_TUNING_REPORT.md` update 2026-07-22b).

---

## Running it

No build step. Either open `index.html` (the public landing page — the PWR card opens
the control room at `ui/shell.html?engine=pwr`), open `ui/shell.html` directly, or
serve the folder with any static server:

```
npx serve .
# or
python3 -m http.server
```

The control-room UI is `ui/shell.html` (loads the engines + layers and wires them through
`ui/app.js`). Standalone engine test pages: `test_pwr.html`, `test_rbmk.html`,
`test_bwr.html`.

## Running the tests

Tests are plain Node CLI runners (no framework, no `package.json`). The engine and layer
files are global-namespace scripts that attach to `globalThis.RD`; `require()` executes
them into a shared global.

```
node test/run_pwr.js            # PWR scenario suite (all)
node test/run_pwr.js <name>     # one scenario by key, e.g. flagship_tmi
node test/run_rbmk.js           # RBMK suite
node test/run_bwr.js            # BWR suite
node test/run_scenarios.js      # all flagship + library scenarios
node test/run_campaign.js       # PWR training campaign gate (structural + functional)
node test/run_autoctl.js        # control-layer automation gate
node test/run_ops.js            # engine-under-M4 ops probes (FAILs = tuning targets)
node test/run_m4.js … run_m7.js # per-layer stack tests
node test/run_e2e_controls.js   # service-level control plumbing (recently-added controls)
node test/run_procedures.js     # manual procedures replay (strict known-fails annotated)
```

`test/ops_*.js`, `test/*_harness.js`, and `test/verify_*.js` are supporting harnesses.
Ops-probe FAILs are tuning targets, tracked in `Diagnostic/OPS_TUNING_REPORT.md`.
`run_e2e_controls.js` and `run_procedures.js` are PART OF THE GATE LIST — both drifted
red unnoticed once because they weren't listed here (2026-07-19 review).

## Definition of done

A change is not finished until the gates it touches are green (at or above the baselines in
_Project status_). Runners print `PASS`/`FAIL` per test and a final tally.

- **Any engine or scenario change** → the affected `run_<plant>.js` and `run_scenarios.js`.
- **Control-layer change** → `run_autoctl.js` **and** `run_m4.js`; check `run_ops.js` for
  regressions (don't turn a `PASS` into a `FAIL`; remaining FAILs are pre-existing tuning
  targets).
- **Scenario / campaign / instructor change** → `run_campaign.js` (must stay **51/51**),
  `run_m6.js`, `run_procedures.js`.
- **UI change** → `run` the app and drive the affected flow (see `/run` and the headless
  Edge workflow); `verify_e2e_ui.js` must stay **PASS**.
- **Snapshot/contract or save-format change** → old saves must still migrate (see the
  migration notes pattern in `CHANGELOG.md`); re-run `run_m7.js`.
- **Then update** `CHANGELOG.md`, the `Project status` section above, and
  `Blueprint/BUILD_DECISIONS.md` if a decision or flag changed.
- **On release (merge `develop` → `main`)** → add the player-facing `changelog.html`
  entry with the next **`Alpha X.Y.Z`** version, per _Branching & workflow → Website
  changelog & version numbers_.

---

## Branching & workflow

**Commit ongoing work to `develop`, not `main`.** `develop` is the active
integration branch where day-to-day commits land; `main` is the stable/release
branch. Do not commit straight to `main`.

- **New work** → branch from / commit on `develop`.
- **Releasing** → merge `develop` → `main` and push both. Do this only when the
  work is at a done state (gates green — see _Definition of done_). **Immediately
  before the merge, add the website changelog entry + version number — see below.**
- Keep `develop` current with `main` (fast-forward) before starting a new change so
  history stays linear.

### Website changelog & version numbers

The public site has a **player-facing** changelog at **`changelog.html`** — separate
from the developer `CHANGELOG.md`. **Every release gets a version number and a
`changelog.html` entry. This is a required release step, not optional — do it as part
of the merge, without being asked.**

- **When** — immediately *before* you merge `develop` → `main` (work done, gates green).
  One entry per release.
- **Version number** — format **`Alpha MAJOR.MINOR.PATCH`** (e.g. `Alpha 1.1.1`). The
  **next release is `Alpha 1.0.1`**. Find the last version in the top entry of
  `changelog.html` and **increment the LAST segment** each release (`1.0.1` → `1.0.2`
  → …); bump the minor for a notable feature group and the major for a big milestone
  (owner's call).
- **The entry** — add a new `<article class="log-entry">` at the TOP of the log
  (newest-first), carrying: the **version** (`<span class="log-ver mono">Alpha X.Y.Z</span>`),
  the **date** (visible text *and* the `datetime="YYYY-MM-DD"` attribute), and a brief,
  **player-facing** summary (added / changed / fixed tags). Write for players, not the
  repo — copy the template in the file's `ADDING AN ENTRY` comment.
- **Not** the same as the `RD_VERSION` deploy stamp (`site/version.js` — the git SHA
  Vercel stamps at build time). That's an automatic build artifact; the `Alpha X.Y.Z`
  number is the human release version.

---

## Architecture

A layered stack — **snapshots flow up, commands flow down**; each layer talks only to the
one directly below it:

```
User Interface (M8)
        │  commands ↓   snapshots ↑
Test Runner (M7, dev/test only)
Instructor Layer (M6 / M6·PH)
Control & Failure Layer (M4)
Physics Engines (PWR M1 / RBMK M2 / BWR M3)
```

The **Simulation Service (M5)** drives the step loop and assembles each snapshot. The
control layer owns instrument-based *actuations* (trips, relief/ESF logic); the engines
own pure hydraulics/physics.

## Project layout

```
Reactor_Dynamics/
├── index.html                     → ReactorDynamics.com landing page (site/, about/feedback/privacy.html)
├── README.md                      ← you are here (the map)
├── CHANGELOG.md                   ← user-visible change log
├── engines/
│   ├── pwr/      ← M1  PWR engine (hosts Three Mile Island)
│   ├── rbmk/     ← M2  RBMK engine, pre/post-1986 (hosts Chernobyl)
│   ├── bwr/      ← M3  BWR engine (hosts Fukushima)
│   └── load_mode.js               ← shared turbine load-mode model
├── layers/
│   ├── control/                   ← M4  kernel + per-plant control modules
│   ├── simulation_service.js      ← M5
│   ├── instructor_layer.js        ← M6·PH → M6
│   └── test_runner.js             ← M7  (dev only)
├── scenarios/                     ← M6  flagship + library scenarios (pwr_*, rbmk_*, bwr_*)
├── ui/          { app.js, shell.html, diagram/, panels/, test_panel/,   ← M8
│                  manual_data.js, manual_procedures.js, manual_md.js,
│                  md_render.js, campaign_data.js }
├── test/                          ← Node CLI runners + harnesses
├── tools/                         ← build tooling (gen_manual_reference.js, pack_manuals.js)
├── Blueprint/                     ← the authoritative specification (see below)
├── Manuals/                       ← THE PWR operator manual (renders in-app via pack_manuals.js)
└── Diagnostic/                    ← audit / tuning / playtest reports
```

---

## The specification (`Blueprint/`)

The authoritative spec. **To build a module, read `CONTEXT.md` plus that one module's
spec — nothing else.**

- `CONTEXT.md` — shared interfaces, hard rules, the data contract, scope, build map
  (loaded into every build session).
- `DESIGN_COMPANION.md` — vision, rationale, deliberate exclusions, v2 roadmap.
- `M1`–`M8` module files — full implementation spec for each buildable unit.
- `M4b_control_layer.md`, `M5_*`, `M6*` — expanded specs for the control, service, and
  instructor layers.
- `BUILD_DECISIONS.md` — running log of what was decided and why during the build.
- Feature specs: `pwr_synoptic_prerequisites.md`, `pwr_training_campaign.md`,
  `load_mode_spec.md`, `new_diagram_controls.md`, `OPERATOR_MANUAL_PLAN.md`.

**Build order:** M1→M2→M3 (engines, each tuned until its scenario suite passes) → M4 → M5
→ M6·PH (placeholder instructor; stack complete end-to-end) → M7 (validate wiring) → M8
(UI) → M6 (real instructor + flagship scenarios, replacing M6·PH).

---

## Code conventions (how the code is wired)

Read this before editing any source file — the wiring is deliberate and easy to break.

- **No module system. Do not add `import` / `export` / `require` to source files.** Every
  file in `engines/`, `layers/`, `scenarios/`, and `ui/` is a plain global-namespace
  script that attaches to `globalThis.RD`. In the browser they load via `<script>` tags in
  order; the Node test runners call `require()` only to *execute* each file into the shared
  global. Adding ES-module or CommonJS syntax inside a source file breaks both load paths.
- **Load order matters.** `pwr_config.js` / control modules load before the engine files
  that consume them (see the ordered list in any `test/run_*.js` and in `ui/shell.html`).
- **File naming.** Plant-specific files are prefixed `pwr_` / `rbmk_` / `bwr_`; the module
  a file belongs to (M1–M8) is called out in _Project layout_ above.
- **Hard Rules are non-negotiable.** Before changing engine behavior or the data contract,
  read the numbered **Hard Rules (HR1–HR7)** in `Blueprint/CONTEXT.md`. Breaking one
  removes an essential capability (HR1 = instruments-vs-truth; HR5 = commands only ever
  flow down through the service).
- **Snapshot / save compatibility is a contract.** New snapshot fields must migrate older
  saves — follow the migration-note pattern in `CHANGELOG.md`.

### Authoritative vs. scratch

Source of truth: `engines/`, `layers/`, `scenarios/`, `ui/`, `test/`, `tools/` (code) and
`Blueprint/`, `Manuals/`, `CHANGELOG.md` (docs). **Not** source of truth — don't mine these
for intent: `terminals/` (raw session logs), `inbox/` (handoff drafts), `mcps/`,
`node_modules/`, and the `Diagnostic/*.json` dumps (the `.md` reports there are curated).

## Domain conventions

- **Instruments vs truth.** Gauges, alarms, and automatic protection read *instrumented*
  values (lag, noise, possible failure). True state is available only as an explicit
  diagnostic overlay. Never soften the gap — the dissonance is the lesson.
- **Two registers.** Every label and instructional string exists in a **Learning**
  register (plain language) and an **Industry** register (real plant terminology).
- **Units.** SI internally (MPa, °C, %). The UI has a display-unit toggle.
- **Plant MODES** use commercial numbering, written **Mode N, Name** (e.g. *Mode 1, At
  Power*). Do not confuse with turbine load modes (Follow / Manual / Disconnected).
- **This is an educational lumped-parameter plant,** not a full-scope replica of a
  licensed reactor. Where a simplification understates reality, say so plainly.
