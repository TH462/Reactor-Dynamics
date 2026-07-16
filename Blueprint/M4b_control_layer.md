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
channels: [ ChannelDef ]     // automation channels (§3)
```

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
  trim(ctx)?, standby(ctx, layer)?, standbyNote?, sp {…}`. Emits bounded
  `rod_nudge`s; never steps against the raw error sign.
- `kind: 'bang'` — boron trim: `hi/lo` engage and `hiStop/loStop` release
  thresholds on control-rod position, `rate` (ppm/s), `requires`.

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
