# M4b — The Control Layer (kernel + per-plant modules + automation runtime)

> Supersedes the file-layout half of `M4 control failure.md` and documents the
> automation channel runtime added 2026-07. The M4 spec's *semantics* (trips,
> actuations, alarms, failures, interlocks, interception, precedence) are
> unchanged and still authoritative — read it first. This document covers what
> moved, what was added, and the schema for the new parts.

## 1. Layout

```
layers/control/
├── control_kernel.js   RD.ControlLayer (alias RD.ControlFailureLayer)
│                       — generic machinery: trips / ESF actuations / alarms /
│                         interlocks / failure interception (M4 spec §2–§7)
│                         + the automation channel runtime (§3 below)
├── pwr_control.js      RD.PWR_CONTROL   — the PWR's protection + channels (data)
├── rbmk_control.js     RD.RBMK_CONTROL  — version-aware (forVersion), loads before rbmk_config
└── bwr_control.js      RD.BWR_CONTROL   — the BWR's protection + channels (data)
```

Each per-plant module also attaches the legacy names (`RD.<P>_PROTECTION`,
`RD.<P>_CONFIG.protection`) because the engines' failure dispatch reads
`cfg.protection.failures`. The kernel still reaches the per-plant data through
`engine.getProtectionConfig()` — M5's wiring is unchanged in shape.

## 2. Config schema additions

On top of the M4 spec's `trips / actuations / alarms / failures / interlocks`,
a plant's protection config may carry:

```
channels:              [ ChannelDef ]        // automation channels (§3)
esf_systems:           [ EsfSystemDef ]      // AUTO/MAN arms over ESF actuations (§6)
trip_block_permissive: { instrument, direction, setpoint }   // P-10 (§7)
```

Trip/actuation/interlock extensions (all optional, all data):

```
TripDef      += id?          // referenced by set_trip_block
             +  condition?   // trip evaluates only while it holds (same resolver
                             //   as actuation conditions — e.g. 'sr_energized')
             +  blockable?   // manually blockable while the permissive holds (§7)
ActuationDef += arm?         // ESF system id — evaluates only while armed (§6)
             +  params?      // extra command parameters carried on fire
                             //   (e.g. set_sr_detector { on: true })
InterlockDef += blocks_when? // { field, equals } — block only the matching form
                             //   of the command (e.g. only set_sr_detector {on:false})
```

**Mechanical-protection actuations** *(as built — 2026-07-16 design ruling)*: each per-plant
module also carries the relief-valve pop/reseat and turbine low-vacuum/overspeed trip
actuations moved out of the engines (PWR pzr + SG safeties; RBMK drum relief; BWR SRV; all
three `trip_turbine`). They are ordinary `ActuationDef` data — `reset_below` hysteresis,
setpoints derived from the engine config (single source), commands descending through
interception like everything else, so a stuck-safety-valve failure is authorable. Full
per-plant listing: M4 §4. Condition gates *(as built)* read instruments ONLY — no true-state
fallback; unresolvable conditions evaluate NOT-met (M4 §2; M7 §3.6 asserts resolution).

## 3. The automation channel runtime

Formerly `layers/auto_control.js` — a UI-side synthetic operator stepped once
per broadcast, whose state lived outside save files. It now runs INSIDE the
control layer:

- **Cadence.** M5 calls `layer.stepAutomation(dt)` once per physics step
  (before `engine.step`). Channels evaluate every `AUTO_DT = 0.1` sim-s — the
  1× broadcast rate of the old layer — so behavior is identical at 1× and
  **acceleration-independent** everywhere else. All the old fast-forward
  machinery (FAST_ACCEL, fastFallback, dbFast, fastBudget) is deleted: at a
  fixed sim-time cadence every regime is the slow regime.
- **State travels with the plant.** Engaged flags, setpoints, integrators, PV
  filters live in `saveState().automation` (keyed by channel **id**, so config
  reordering can't misalign a save; absent key = all channels MAN). Rewind now
  restores controller dynamics exactly (the old layer reset them).
- **HR compliance.** Channel PVs read instruments (HR1). Outputs descend
  through the layer's own `handleCommand` (HR5) — failure interception and
  interlocks apply to automation exactly as to the operator; a stuck sensor
  fools the controller like it fools a human. Channel defs are per-plant data
  (HR3).
- **The `_internal` flag.** Every command the layer itself issues (channel
  outputs, trip scrams, ESF actuations, interlock on_engage) goes through
  `_sendInternal`, which raises `this._internal` for the descent. Operator
  commands arrive with the flag down. This is how the layer distinguishes
  "the plant did it" from "the operator did it" (manual-override disengage
  below; the ESF AUTO/MAN arms build on the same flag).
- **Derivative estimation is time-based.** The PV low-pass uses `pvTau` and
  the damped derivative a fixed ~2 s time constant — a per-sample smoothing
  factor would make the kd damping term cadence-dependent (probed: at 0.1 s
  evaluation the raw difference quotient's noise drowned the rod error and the
  Tavg loop limit-cycled).

### ChannelDef

Common: `id, kind, group, label, hint`, optional `offOnScram` (stand down on
scram/melt, visibly), `requires` (channel id that must be engaged), `defaultOn(ctx)`
(the plant's normal lineup — engaged by `engageDefaults()` on free-play plant
selection), `manual_overrides: [actions]` (an operator command in this list
disengages the channel — rod actions only match when `group_id` matches).

Callbacks receive a snapshot-shaped **ctx** the kernel assembles from the
engine: `{ instruments, control_state, true_state, rps_state, metadata }`.

- `kind: 'mode'` — passthrough for engine-internal autos.
  `isOn(control_state)`, `engage(ctx) → [cmds]`, `disengage(ctx) → [cmds]`.
  The step loop skips them; displayed state derives from the plant.
- `kind: 'pid'` — `pv(ctx)`, `cmd(u) → command`, `uMin/uMax, kp, ki, db,
  minDelta, period, pvTau?, spSlew?`, `ff(ctx)?` feedforward, `init(ctx)?`
  integrator preload (bumpless), `sp {capture(ctx), min, max, unit, dp, step, dim?}`.
- `kind: 'rods'` — `group_id, pv(ctx), gain, db, maxStep, period, fastAt, kd?,
  speeds?, trim(ctx)?, standby(ctx, layer)?, standbyNote?, sp {…}`. Emits bounded
  `rod_nudge`s; never steps against the raw error sign. `speeds` *(as built)* is
  an error-proportional variable-speed ladder — `[{above, speed}]`, ascending
  (Westinghouse-style: bigger |error| → faster drive); when present it replaces
  the two-speed `fastAt` threshold. The PWR `rods_tavg` channel uses
  `[{0.8 slow}, {2.0 normal}, {4.0 fast}]` (pwr_control.js).
- `kind: 'bang'` — boron trim: `hi/lo` engage and `hiStop/loStop` release
  thresholds on control-rod position, `rate` (ppm/s), `requires`, and an
  optional `busyNote(ctx)` data callback appended to the channel note while
  borating/diluting *(as built — the charging-pump status suffix moved out of
  the kernel into the PWR `boron_trim` def; HR3: no plant fields in the kernel)*.

### Commands (consumed by the kernel, never forwarded)

```
set_auto_channel   { channel_id | "all", engaged }
set_auto_setpoint  { channel_id, value }          // clipped to sp.min/max
```

### Snapshot section (assembled by M5 every cycle)

```
automation: { channels: [ { id, group, label, hint, kind, engaged,
                            setpoint, setpoint_meta?, pv, note, standby } ] }
```

## 3b. ESF AUTO/MAN arms ("M4b ESF arms" in code comments)

`EsfSystemDef = { id, label, commands: [actions] }`. Each system starts ARMED;
`arm`-tagged actuations evaluate only while armed. A **non-internal** command
listed on the system flips it to MANUAL (the operator took it by hand — the
plant's own actuations are `_internal` and exempt). `set_esf_auto {system,
auto:true}` re-arms and clears that system's `actuationFired` latches, so a
STANDING start condition re-fires immediately — the point of re-arming.
State: `automation.esf` in the snapshot, `esf` in the save (absent = armed).

**The PWR ESF actuation set** *(as built, pwr_control.js)* — three arms:
`hpi` (HPI/LPI emergency injection, over `set_hpi`/`set_lpi`), `afw`
(auxiliary feedwater, over `set_afw`/`set_afw_flow`), and `rhr` (residual
heat removal, over `set_rhr`/`set_dhr`).

- **Merged HPI/LPI** — one actuation, primary pressure < 11.03 MPa →
  `set_hpi {active:true}` (reset `{active:false}`), `arm: 'hpi'`. The old
  separate 2.76 MPa `set_lpi` actuation is **deleted**: HPI/LPI is one merged
  system, and the low-head/high-flow LPI regime follows physically from the
  two-segment pump curve — no second actuation needed.
- **AFW** — SG level < 20 % → `set_afw {active:true}`, `arm: 'afw'`.
- **RHR cooldown permissive** — primary pressure < 2.76 MPa (400 psi, matching
  the engine's `rhr_valve_interlock_mpa`) with `condition: 'rps_scrammed'`
  auto-**opens the RHR hot-leg suction valve** (`set_rhr {active:true}`) once the
  reactor is tripped and depressurized into the RHR band. The setpoint tracks the
  engine interlock deliberately: the engine refuses the open above it, so a higher
  actuation setpoint would silently no-op. *(as built)* Armed, `arm: 'rhr'` — a
  manual `set_rhr`/`set_dhr` flips the system to MANUAL, and the synoptic's RHR
  **Auto** button re-arms it via `set_esf_auto {system:'rhr'}`. `set_rhr_hx` (the
  HX flow-split cooldown-rate throttle) is deliberately **not** an arm command —
  throttling cooldown rate must not disarm the valve auto-open.

## 3c. Blockable startup trips ("M4b trip blocks" in code comments)

`set_trip_block {trip_id, blocked}` — refused (register-aware `blocked` result)
unless `trip_block_permissive` is satisfied against the CURRENT instruments
(P-10). While blocked, the trip is skipped. Blocks **auto-reinstate** the moment
the permissive drops (Westinghouse convention). A layer constructed — or an old
save loaded — with the permissive already satisfied starts with every blockable
trip blocked: the real at-power lineup (without it, every at-power state
insta-trips on the startup net). State: `rps_state.trip_blocks` in the snapshot,
`trip_blocks` in the save. M7's "each trip warns first" invariant exempts
blockable trips (their warning is the blocking procedure).

**The PWR startup NIS trip net** *(as built, pwr_control.js)* — the concrete
data behind the mechanism above:

- `sr_high` — source-range high flux, 1e5 cps (≈ 0.02 % power); gated
  `condition: 'sr_energized'`, so it is live only while the SR detector is
  energized (secure the SR during the SR→IR handoff — or trip). Not blockable.
- `ir_high` — intermediate-range high flux, 1.67e-3 A (chamber current ≈ 20 %
  power); `blockable`.
- `pr_low_setpoint` — power-range LOW SETPOINT, 25 % (vs the 120 % full-power
  trip); `blockable`. The at-power backstop of the net.
- `trip_block_permissive` = power_range > 10 % (P-10). The net ladders
  P-10 (10 %) < IR trip (20 %) < PR low setpoint (25 %): stop the ascent above
  P-10, block both, then continue — miss the blocks and the net trips you.
  Blocks auto-reinstate below P-10.
- A companion actuation auto **re-energizes the SR** when the IR falls below
  P-6 (1e-10 A): `set_sr_detector {on:true}` via `params` — deep in shutdown the
  operator gets the count rate back. (The P-6 interlock pair guarding manual
  `set_sr_detector` is M4 §4b.)

## 4. Lifecycle rules (M5)

- `selectPlant` (free play / `reset`) → fresh layer, then `engageDefaults()`
  (e.g. the RBMK AR engages in AUTO at power). Pass `{ noDefaults: true }` to
  skip.
- `start_scenario` / `start_follow` → plant reset with `noDefaults`, then the
  authored `auto_channels` preset is applied via `set_auto_channel` commands
  (a walkthrough without a `from` state gets an explicit disengage-all
  instead). The clean-board rule lives in M5 now, not the UI.
- File load / rewind → `layer.loadState` restores channel state exactly.

## 5. The Automate tab (M8)

A pure face: renders `snapshot.automation`, sends the two commands above.
`data-arsync` segs (RBMK AR card) mirror the `rods_power` channel's engaged
state from the same snapshot section. `?auto=<ids|all>` deep link sends
commands. No automation object exists UI-side.

## 6. Validation

`test/run_autoctl.js` (19 suites): per-plant hold/maneuver bands, HR1
instrument-lie probe, scram stand-down, RBMK AR default lineup + re-center,
3600× holds (channels stay engaged — no plant-side handoff), automation
save/load round-trip, rewind dynamics restore. Plus `run_m4/m5/m7`,
`run_campaign` (auto_channels resolution + functional missions), `run_ops`.
