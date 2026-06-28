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

**Status:** M1 ✅ · M4 ✅ · M5 ✅ · M6·PH ✅ · M7 ✅ · M8 🔶 visual shell · (next: wire M8 to M5)

---

## Open Flags (live)

| # | Module | Flag | Severity | Status |
|---|--------|------|----------|--------|
| F1 | M1 | Criticality uses an explicit `rho_excess` + operating-temp references instead of the spec's "set reference temps" mechanism (which yields non-physical refs). Will M2/M3 reuse this pattern? | design | **open** — confirm before M2 |
| F2 | M1 | `sg_overfeed` failure `override_value: 1.2` is applied to `set_feedwater_flow {pct}` (0–100), so it underfeeds (1.2%) rather than overfeeds (~120%). Untested, not flagship. | data bug | **open** |
| F3 | M1/M4 | The M1/M4 seam: command-override failures' persistent effects live in the engine (M1), while interception lives in M4. M4 forwards *and* intercepts. M7 will scrutinize this. | seam | **open** — validate in M7 |
| F4 | M4 | `degraded_hpi` is typed `command_override` but its real effect is an engine HPI-flow multiplier (the spec itself flags this, M4 §7). Implemented via the engine hook. | taxonomy | **open** (spec-acknowledged) |
| F5 | M1 | `fuel_damaged` (cladding failure at 1200 °C) is internal, not in the §6.3 `true_state` contract. Consumers must use `fuel_temp_c`/`melted`. | contract | **open** — confirm M6/M8 don't need it |
| F6 | M5 | Acceleration is realized as fixed-0.02 s step **count**, not by scaling `dt` (CONTEXT §4's literal `dt_effective` diverges — verified). Every engine (M2/M3) must stay stable at 0.02 s; the service never hands them a larger dt. | deviation | **open** — applies to M2/M3 too |

---

## Cross-cutting decisions (apply to all modules)

| Topic | Decision | Why |
|-------|----------|-----|
| **Module system** | Global-namespace scripts: each file is an IIFE attaching to `globalThis.RD`. No ES modules, no build step. | User choice. Works under `file://` *and* when served (ES modules break on `file://` in Chrome), and `require()` in Node shares `globalThis`, so the same files run in the test harness with no shim. |
| **Test harnesses** | Both a Node CLI runner (`test/run_*.js`) and a browser page (`test_*.html`). | User choice. Node gives a fast tuning loop I can run directly; the browser page matches the browser-only ethos for the user to confirm. |
| **Units** | SI/MPa internal everywhere, per CONTEXT §11. | User-confirmed. The M1 code snippets had psia residue (see M1 deviations); reconciled to MPa. |
| **Repo** | Commits go directly to `main`, one per module. | Matches the linear, single-developer build (the scaffold was committed to `main`); each module is an independent, test-gated unit. |
| **Load order** | `config → protection → thermal → pressurizer → primary → steam_generator → instruments → engine`, then layers. | The engine captures `RD.pwr*` helper namespaces at IIFE-eval time, so its dependencies must load first. Encoded in `index.html`, `test_pwr.html`, and the Node runners. |

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
- **Decay heat only summed into `Q_total` when scrammed.** At power the fission term dominates; the
  two-term decay model is initialized at scram. Simplification, adequate for in-scope scenarios.
- **Shutdown-group worth** added (`rod_worth_shutdown=0.10`) — the spec says "sum the shutdown group"
  but gives no worth; chosen for shutdown margin.
- **Initial states** are built by computing the equilibrium temps analytically from the heat balance,
  then **trimming boron to exact criticality** (HFP references captured once on first HFP build).
  `hot_zero_power` is left subcritical by a fixed margin (rods inserted + boron).
- **PRNG:** mulberry32 with a single `uint32` state; Gaussian noise via Box–Muller. The state is part of
  save/restore (CONTEXT §4) — verified bit-exact in the save/restore test.

### Notes
- `fuel_damaged` is internal (not a §6.3 field) — **Flag F5**.
- `sg_overfeed` value units look wrong — **Flag F2**.

---

## M4 — Control & Failure Layer

**File:** `layers/control_failure_layer.js`
**Validation:** integration smoke test `node test/run_m4.js` → 10/10 suites, 31/31 checks
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

## M8 — User Interface (visual shell only, so far)

**Files:** `ui/shell.html` · `ui/shell.css` · `ui/shell.js`
**Status:** a **static, mock-data visual prototype** for iterating on look & layout *before* wiring
it to the live snapshot (M5). Not the real M8 — nothing is connected to the engine; every value is a
placeholder. Open `ui/shell.html` directly in a browser (no server needed).

### What it is / isn't

- **Is:** the full M8 §2 region layout (vital-few gauge strip, four control sections, numeric-placeholder
  synoptic, strip chart, alarm panel, sim controls, Instructor panel, Tools Block with all five tabs,
  System Scanner), styled with the exact §15 palette and the five alarm-category hues, with light
  interactivity (tab switching, the SCRAM guard-cover + 3 s countdown, Scanner hover, segmented toggles,
  speed + fast-forward badge, live Failures-tab sliders).
- **Isn't:** wired to M5; no `subscribe(render)`, no commands, no real plant profile. The fixed
  aspect-ratio lock (M8 §2.2/§19) is approximated with flex for now (noted in `shell.css`).
- **Separate from `index.html`** — the shell is a throwaway-style prototype kept apart from the real app
  shell (which loads the engine + layers). The real M8 will live in `ui/app.js` + `diagram/` + `panels/`
  per M8 §19 and render from the snapshot.

### Decisions

- **Iterate-first approach** (user request): build the visuals as a standalone mock so layout/look can be
  judged and changed rapidly, then replace placeholder values with snapshot bindings.
- **Alarm-category palette** chosen here (data will drive it later): reactivity `#C084FC`, coolant
  `#38BDF8`, power `#FBBF24`, instrument `#2DD4BF`, safety_system `#F472B6` — distinct/legible per §8.1.

## Change log

- **M1** built and committed (`a18c85f`). Suite 11/11.
- **M4** built and committed (`1ae7245`). Smoke 10/10. Added `category` to PWR failure data;
  M1 suite re-confirmed green after the edit.
- **This file** created after M1+M4 to capture the above; keep updating per "How to maintain".
- **M5** built. Smoke 12/12. Fixed-dt step-count acceleration (Flag F6); default pass-through
  Instructor slot; full stack (engine ↔ M4 ↔ instructor) runs end to end. M1/M4 re-confirmed green.
- **M6·PH** built. Tests 8/8. Real pass-through Instructor module in the slot; M5 aligned to the
  `setRegister` interface and prefers `RD.InstructorLayer`. Swap-invariant confirmed (free-play
  unchanged). All four suites (M1/M4/M5/M6·PH) green.
- **M7** built. Positive 31/31 integration checks + negative teeth test (sabotaged HR1 → caught).
  Validates the assembled stack's wiring through M5's interface. All five suites (M1/M4/M5/M6·PH/M7)
  green. Physics gate (M1) + wiring gate (M7) both pass → the PWR system is correct per CONTEXT §9.
