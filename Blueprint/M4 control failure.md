# M4 — Control & Failure Layer

> **Layout + automation update (2026-07): see `M4b_control_layer.md`.** The machinery
> now lives at `layers/control/control_kernel.js` (`RD.ControlLayer`) with per-plant
> data modules `layers/control/{pwr,rbmk,bwr}_control.js`, and additionally runs the
> operator-automation channel runtime (formerly `layers/auto_control.js`). The
> semantics specified in THIS file are unchanged and remain authoritative.

**Build this module from `CONTEXT.md` + this file alone.** No other module is required.
This is the complete specification for the layer that sits directly above the physics engine:
the plant's automation (reactor protection, engineered-safety actuation, alarms) and the
scenario's failures (injection and command interception). It is **general machinery** — the
plant-specific numbers are *data* it consumes (HR3), and each plant's trip/alarm/actuation/
failure definitions are authored in that plant's engine module (M1 §9, M2 §14, M3 §13).

`CONTEXT.md` already defines the hard rules, the snapshot/command contract, the command
catalog, the field vocabulary, scope, and conventions. **Do not re-derive those; rely on
them.** This file adds the layer's mechanism and the config *schema* it reads.

**This layer has no scenario tests of its own.** Its correctness is *integration* correctness,
validated by the Test Runner (M7) against the assembled stack — that trips and alarms read
instruments not truth, that commands route and intercept correctly, that the alarm lifecycle
works, that each plant's config is internally consistent. Build the machinery here; M7 proves
it is wired right.

---

## 1. The Build Target

This module produces `layers/control/control_kernel.js` — the `ControlLayer` (general
machinery; `RD.ControlFailureLayer` is kept only as a compatibility alias) — plus the
per-plant data modules `layers/control/{pwr,rbmk,bwr}_control.js` *(as built; the original
single-file target `layers/control_failure_layer.js` / `ControlFailureLayer` is retired —
see `M4b_control_layer.md` §1)*. The kernel is constructed with (or handed) the selected
plant's protection config (the trips / actuations / alarms / failures / interlocks / channels
data objects from the plant's control module, reached through the engine) and a handle to
the engine below it. It contains **no plant-specific literals** — the code that evaluates a
trip does not contain `2385`; it reads the setpoint from the config (HR3).

It runs **client-side in the browser** like everything else (vanilla JS, no server — any older
"server-side" framing is obsolete). It communicates by direct function calls: it reads the
engine's instrument readings, issues commands down to the engine, and provides its state to
the snapshot assembly (M5).

---

## 2. Position in the Stack and the One Rule

```
Instructor (M6) ── commands ↓ ──►  CONTROL & FAILURE LAYER (this)  ── commands ↓ ──► Engine
                                          ▲ reads engine.getInstruments() each cycle
```

Commands descend through this layer (HR5): the Instructor above may have already gated a
command; this layer may **intercept** it if a command-override failure dictates; only then
does it reach the engine. Automatic actuations this layer generates also become commands to
the engine and pass through the **same** interception.

**The defining constraint (HR1): this layer reads instrument readings, never true state.**
Every trip, every actuation, every alarm evaluates the readings an operator would see — the
lagged, noisy, possibly-failed values from the engine's instrument model. This is what makes
sensor failures meaningful and the accident scenarios faithful: a stuck instrument can
suppress an alarm that should fire (the TMI "valve open" alarm that never annunciates because
the PORV indicator reads closed) or fire a trip spuriously, and both must emerge naturally
from reading the instrument layer. The **only** documented exceptions are parameters with no
instrument in the simplified model — notably `__true_flow__` (the PWR low-flow trip, M1 §6.6):
those read true state, and they are explicit and minimal.

> *(as built — resolved 2026-07-16)* The condition gates hold HR1 with **no exceptions**:
> `_evaluateCondition` (the `condition` gate on trips/actuations, control_kernel.js) reads
> the instruments block **only** — the former true-state fallback is gone. A `*_unavailable`
> condition derives from its `*_running` **status instrument** (`!reading`), and an
> unresolvable condition evaluates **NOT-met** rather than silently arming. Every condition
> a plant module references must therefore be exposed as a status instrument — the M7
> config-consistency suite asserts every referenced condition resolves (M7 §3.6).

---

## 3. Responsibility 1 — Reactor Protection (trips)

The reactor protection system is the set of automatic trips that scram the reactor when a
monitored **instrument** reading crosses a safety limit. Each trip watches one reading and
fires when it crosses its setpoint in a defined direction. **Any** trip firing scrams the
reactor — this layer issues a `scram` command to the engine (which drives the shutdown rods
in), sets `rps_state.scrammed = true`, and records `last_trip_reason`.

Evaluation (each cycle, against the current instrument readings):
```javascript
for (const trip of plantTrips) {
    const value = (trip.instrument === "__true_flow__")
        ? engine.getTrueState().pump_flow_pct / 100      // documented HR1 exception
        : instruments[trip.instrument];
    if (crossed(value, trip.direction, trip.setpoint) && !rps.scrammed) {
        rps.scrammed = true;
        rps.last_trip_reason = trip.instrument + " " + trip.direction;   // a string, for the snapshot / alarm
        issueCommand({ action: "scram" });               // descends, through interception
    }
}
// crossed(): "high" → value > setpoint ; "low" → value < setpoint
```
*(as built: trips with a `condition` gate or an active manual block are skipped first —
M4b §2/§3c.)*
Once scrammed, the reactor stays scrammed until a `reset` (a new initial state) — a trip does
not silently clear. The set of trips is **version-aware** where the plant is (the RBMK has
`RBMK_TRIPS_PRE` vs `RBMK_TRIPS_POST`, M2 §14; this layer is handed the right set for the
selected `design_version`). The RBMK's EPS bypass — the historical pre-accident condition —
is *(as built)* not a flag this layer reads — the kernel never consults `eps_bypassed`. The
mechanism is the `eps_bypass` **failure** (`type: physics_parameter`,
`effect: disable_auto_trips`, rbmk_control.js), forwarded to the engine like any other
physics failure (§6); the engine owns the bypassed state, and the `eps_bypassed` status
instrument drives the EPS BYPASS alarm.

---

## 4. Responsibility 2 — Engineered Safety Actuation

Beyond scramming, the plant automatically operates safety systems when instrument conditions
demand. These actuations also read instruments and are defined per plant as data (the
`*_ACTUATIONS` lists). Each actuation, when its condition is met, issues a command to the
engine; some have a **reset** condition that issues a counter-command when the parameter
recovers; some have an extra **condition** gate (e.g. `ads_open`, `hpci_unavailable`).

```javascript
for (const act of plantActuations) {
    const value = instruments[act.instrument_id];
    const gateOk = !act.condition || evaluateCondition(act.condition);   // e.g. "ads_open", "hpci_unavailable"
    if (gateOk && crossed(value, act.direction, act.setpoint) && !act.fired) {
        act.fired = true;
        issueCommand({ action: act.action });                // open_porv / set_hpi / set_rcic / trigger_ads / ...
    }
    // Reset when the value returns to the SAFE side of reset_below — direction-aware:
    // below it for a "high" actuation, above it for a "low" one. (The earlier spec's
    // `value > reset_below` was inverted for high-direction actuations and made the
    // PORV actuation fire-and-reset in the same pass, flapping open/close.)
    if (act.reset_below !== undefined && act.fired && value != null) {
        const safe = act.direction === "high" ? value < act.reset_below : value > act.reset_below;
        if (safe) {
            act.fired = false;
            if (act.reset_action) issueCommand({ action: act.reset_action });   // e.g. close_porv
        }
    }
}
```

**The critical interaction with failures (this is how TMI works):** an automatic actuation
issues a command, and that command passes through the **same failure-interception path** as an
operator command (§7). So when the PORV is stuck open, the automatic command to close it
(`close_porv`, fired by the reset-below-2300 rule) is intercepted and ignored — exactly as an
operator's close would be. Neither the plant nor the operator can shut the stuck valve.

**Mechanical-protection actuations *(as built — 2026-07-16 design ruling)*.** Relief-valve
pop/reseat and turbine trips are **control decisions**, moved out of all three engines into
this layer's actuation data so they can be manipulated and failed like everything else. The
engines keep valve state + flow hydraulics and expose the commands; setpoints are derived
from each engine's config (single source). Per plant:

- **PWR** (pwr_control.js): pressurizer spring safeties — `open_pzr_safety` at 17.13 MPa /
  reset `close_pzr_safety` below 16.55 on `primary_pressure`. The SG code safeties left this
  list with #369 (audit #297 F2): they are engine-native on TRUE steam pressure now, because a
  spring safety senses nothing, and an instrument-actuated one was defeatable by a single
  stuck transmitter.
- **RBMK** (rbmk_control.js): drum relief — `open_relief_valve` at 8.0 MPa /
  `close_relief_valve` below 7.8 on `steam_pressure` (built lazily at `forVersion()`, after
  the config loads).
- **BWR** (bwr_control.js): SRVs — `open_relief_valve` at 7.58 MPa / `close_relief_valve`
  below 7.44 on `vessel_pressure`.
- **All three**: turbine low-vacuum (`condenser_vacuum` < 74.5 kPa) and overspeed
  (`turbine_rpm` > overspeed setpoint) trips issuing `trip_turbine` — `reset_below` only
  re-arms the latch (a trip is one-way; no reset command).

These use the standard `reset_below` hysteresis and issue commands **through the same
interception** — so a stuck-safety-valve failure (intercepting `close_pzr_safety` /
`close_relief_valve`) is now authorable exactly like the stuck PORV.

---

## 4b. Responsibility 2b — Interlocks *(as built)*

Interlocks are condition-latched **command blocks**, defined per plant as data (the
`interlocks` config list) and evaluated in the kernel (control_kernel.js). They are distinct
from failures: the plant is protecting itself, not malfunctioning, so a blocked command
returns a labelled refusal to the caller instead of being silently dropped.

Mechanics:

- **Engagement with hysteresis.** Each interlock watches one **instrument** (HR1): it
  engages when the reading crosses `setpoint` in `direction`, and clears only when the
  reading returns past `clears_below` (high-direction) / `clears_above` (low-direction) —
  defaulting to the setpoint when no clear threshold is given.
- **`withdrawal_only`** — blocks only *outward* rod motion: `rod_start` with
  `direction > 0` and `rod_nudge` with `steps > 0`; insertion always passes.
- **`on_engage`** — an optional side-command issued (through the internal command path) the
  moment the interlock engages, e.g. `{ action: "rod_stop_all" }` to stop rods already in
  motion.
- **`blocks_when { field, equals }`** — a parameter predicate: block only the matching form
  of a command (e.g. only `set_sr_detector {on:false}`), letting the opposite form through.
- **Register-aware refusal.** A blocked command returns
  `{ type: "blocked", code: "INTERLOCK", message }`, choosing `message_learning` or
  `message_industry` per the current register. Automation channel outputs receive the same
  refusal and surface it in the channel note.

Interlock evaluation runs in the per-cycle pass (§9); the block check runs in
`handleCommand` (§7), *before* failure interception. Latched engagement state is saved and
restored (`interlockActive`).

**Shipped interlock data** *(as built)*:

- **PWR** (pwr_control.js): (a) rod-withdrawal block on high startup rate — engages at
  SUR ≥ 1.5 DPM, clears below 0.8, `withdrawal_only`, `on_engage: rod_stop_all`; (b) the
  P-6 pair on `set_sr_detector` — below P-6 (IR < 1e-10 A) the source-range detector cannot
  be **de**-energized (`blocks_when {on:false}` — you'd go blind), and above 1e-6 A it
  cannot be **re**-energized (`blocks_when {on:true}` — it would burn out the counter;
  clears below 1e-10).
- **RBMK** (rbmk_control.js): rod-withdrawal block on high startup rate — engages at
  4.0 DPM, clears below 2.5, `withdrawal_only`, `on_engage: rod_stop_all`; deliberately less
  protective than the PWR's (the RBMK's instability is part of its curriculum). Both design
  versions carry it.
- **BWR**: no interlocks in v1.

---

## 5. Responsibility 3 — Alarms

The plant annunciates alarms — instrument conditions warranting attention. Each alarm is
defined as data (the `*_ALARMS` lists): a condition (an instrument reading crossing a
threshold, or a status reading becoming true), a **priority**, a **panel**, and **two labels**
(Learning and Industry registers). This layer evaluates every alarm each cycle and maintains
each alarm's state through a simple lifecycle.

**Lifecycle state machine** (per alarm):
```
CLEAR ──(condition true)──►            ACTIVE_UNACKNOWLEDGED
ACTIVE_UNACKNOWLEDGED ──(acknowledge)─► ACTIVE_ACKNOWLEDGED
ACTIVE_ACKNOWLEDGED   ──(condition clears)─► CLEAR
ACTIVE_UNACKNOWLEDGED ──(condition clears before ack)─► CLEAR
```
Acknowledgment is an operator command this layer handles (`acknowledge_alarm {alarm_id}` and
`acknowledge_all_alarms`, `CONTEXT.md §6.7`): it moves matching `ACTIVE_UNACKNOWLEDGED` alarms
to `ACTIVE_ACKNOWLEDGED` while the condition persists.

**Condition evaluation** — like trips, alarms read **instruments**:
```javascript
function alarmActive(alarm, instruments) {
    switch (alarm.direction) {
        case "high":     return instruments[alarm.instrument] > alarm.setpoint;
        case "low":      return instruments[alarm.instrument] < alarm.setpoint;
        case "is_true":  return instruments[alarm.instrument] === true;
        case "is_false": return instruments[alarm.instrument] === false;
        case "is_open":  return instruments[alarm.instrument] === "open";
    }
}
```
A stuck instrument suppresses or spuriously raises an alarm — and that is correct and
important. The TMI scenario depends on it: because `porv_indicator` reads `"closed"`, the
`porv_open` alarm (`is_open`) does **not** annunciate, while the true situation reveals itself
only in other parameters (the eroding subcooling margin). Boolean-status alarms are the
common case for equipment state — e.g. the PWR `msiv_closed` alarm watches the `msiv_open`
status instrument with `is_false` *(as built, pwr_control.js)*.

**Priorities** — `critical` | `warning` | `caution` | `status` — drive how the UI presents the
alarm (M8). **Parent/child escalation:** where a parameter has a `lo`/`lo_lo` pair (same
instrument, more extreme threshold), the `lo_lo` is the critical escalation and should be
treated as firing only once its `lo` sibling is active. **Label selection:** the alarm object
in the snapshot carries a single `tile_label` chosen by the current register (the layer tracks
the selected register from `set_register`, `CONTEXT.md §6.7`).

**Alarm object written to the snapshot** (shape per `CONTEXT.md §6.6`):
```javascript
{ id, state, priority, panel, tile_label }
```

---

## 6. Responsibility 4 — Failures

Failures introduce abnormal conditions (on scenario cue from the Instructor, or in free-play).
This layer **holds the active failure set**, injects and clears failures
(`inject_failure {failure_id, severity}`, `clear_failure`, `clear_all_failures`,
`CONTEXT.md §6.7`) and reports them in the snapshot's `active_failures`.

**Routing, as built** (control_kernel.js `injectFailure` / `clearFailure`; the kernel header's
M1/M4 seam note documents this): the layer does **not** switch on `kind` when injecting.
Every inject/clear is forwarded to the engine as a generic
`{ action: "inject_failure", failure_id, severity }` / `{ action: "clear_failure", failure_id }`,
and the **engine's failure dispatch routes by kind** — it implements the persistent state of
every failure: physics flags (`primary_leak`, `full_blackout`, `coast_down_pumps`, …),
instrument failures (stuck/drift/dead), and the persistent side of command-override failures
(`porv_stuck`, `main_feedwater_available`, `hpi_flow_multiplier` — the "hooks these effects
need", M1 §9). **Additionally**, the layer retains every active `command_override` entry
locally so it can intercept commands *in flight* (§7) — including the plant's own
auto-actuation and scram commands, which engine state alone cannot catch. The two halves are
complementary, never contradictory. The per-kind meaning is unchanged (HR7):

- **`command_override`** — interception happens here (§7): a stuck-open PORV receives
  `open_porv` regardless of what was commanded; a tripped turbine will not respond to demand;
  the BWR `msiv_closure` forces `set_turbine_load` to 0 (`override_value`) — steam isolated,
  the turbine takes nothing *(as built, bwr_control.js)*.
- **`physics_parameter`** — the engine owns the effect end-to-end; there is no command to
  intercept.
- **`instrument`** — the engine's instrument model applies the stuck/drift/dead behavior.
  (Direct `set_instrument_failure {instrument_id, mode, value}` / `clear_instrument_failure`
  commands are also forwarded straight to the engine.)

`severity` (0.0–1.0) scales failures that declare a `severity_scales` field (e.g. a tube
rupture's leak rate, degraded HPI's flow multiplier). This layer performs the command-override
interception **each cycle** for every active command-override failure.

**Default severity *(as built)*.** When `inject_failure` carries no `severity`, the default
is derived from the failure's `severity_meta` as `(default − min) / (max − min)`, clamped
0–1 — the **same normalization the UI slider uses**, so a bare inject lands at the slider's
default position. Inverted metas (`min > max`, e.g. the PWR `degraded_hpi` capacity meta)
fall out of the same formula. The layer-held severity and the severity forwarded to the
engine are now the **same number** (a defaulted severity used to forward 1.0 while the layer
held default/max).

**Re-inject = severity update.** Injecting a failure that is already active **updates its severity**
in place (idempotent on identity; it does not create a second instance). This is what lets the UI's
Failures-tab slider adjust an active failure's magnitude live (M8).

**Clear is uniform** *(as built)*: `clear_failure` removes the entry from the layer's active
set (interception stops for a `command_override`) and forwards
`{ action: "clear_failure", failure_id }` to the engine, whose dispatch reverses the
persistent effect by kind. `clear_all_failures` clears every active failure the same way.

---

## 7. The Command Path and Interception Mechanics

A command reaching this layer (already past any Instructor gating) is handled as:
```javascript
handleCommand(command) {
    // Layer-control commands are handled here and never reach the engine:
    switch (command.action) {
        case "acknowledge_alarm":        return this.acknowledgeAlarm(command.alarm_id);   // §5
        case "acknowledge_all_alarms":   return this.acknowledgeAllAlarms();                // §5
        case "inject_failure":           return this.injectFailure(command);                // §6 (re-inject updates severity)
        case "clear_failure":            return this.clearFailure(command.failure_id);      // §6
        case "clear_all_failures":       return this.clearAllFailures();                    // §6
        case "set_register":             this.register = command.value; return;             // alarm tile labels
        case "set_instrument_failure":                                                      // forwarded to the engine's instrument model
        case "clear_instrument_failure": return engine.applyCommand(command);
    }
    // Plant commands then pass through interception — at most ONE command_override applies, in injection order:
    for (const f of activeFailures) {
        if (f.type !== "command_override" || !f.intercepts.includes(command.action)) continue;
        if (f.effect === "block")       return;                                   // DROP — no engine call, no substitute (ATWS / ADS-fail / LPCI-fail)
        if (f.override)                 { command = { action: f.override }; break; }            // e.g. close_porv → open_porv
        else if ("override_value" in f) { command = withValue(command, f, f.override_value); break; }  // severity folded in (below)
        else break;   // matched, no transform → pass through ('block' is the only real override effect)
    }
    engine.applyCommand(command);   // only now does it reach the engine
}
```
*(as built: the layer-control switch also consumes the M4b commands — `set_auto_channel`,
`set_auto_setpoint`, `set_esf_auto`, `set_trip_block` — and the interlock block check (§4b)
runs after the switch, before failure interception.)*

Automatic actuations (§4) and trip scrams (§3) are issued **through this same
`handleCommand`**, so a command-override failure intercepts them just as it intercepts an
operator's command. This single interception point is what makes a stuck valve defeat both the
operator's and the plant's attempts to close it — the mechanism the TMI scenario is built on.
The engine is reached **only** through this path; the UI never calls the engine directly
(HR5).

**The `block` effect.** A `command_override` with `effect:"block"` **drops** the intercepted command
— no engine call, no substitution. This is how a failure defeats `scram` / `trigger_ads` /
`start_lpci` (ATWS, ADS-failure, LPCI-failure). *(as built)* `block` is the **only**
`command_override` effect that exists in any plant's data; the former non-block `effect`
branch and its `_applyFailureEffect` no-op are removed. Anything
that stops equipment — e.g. `stop_pump` (the PWR `rcp_trip`) — is a `physics_parameter`
effect owned by the engine and never reaches this loop.

**Precedence.** When multiple active `command_override` failures intercept the same action, the
**first in injection order wins** and the loop stops (the `break`s); later ones do not compound it.
This resolves contradictory overrides on one action (e.g. `loss_of_feedwater` →0 vs `sg_overfeed`
→1.2).

**Severity folding.** `withValue(command, f, value)` replaces the command's value-bearing field, and
when the failure declares `severity_scales` it scales the value by the failure's severity:
`value * (severityOf(f.id) ?? 1.0)`. (`valueFieldFor(action)` maps the action to its parameter name,
since these differ: `pct` / `active` / `normalized` / `mwe`.)

**The ATWS truth-gap (correct, not a bug).** A `block` on `scram` produces a faithful split: the
trip logic (§3) still *fires* — it sets `rps_state.scrammed = true` and records the reason (the trip
*signal* is present) — but the `scram` command it issues is blocked here, so the engine never inserts
the rods (`true_state.scrammed` stays `false`, power does not fall). The snapshot then shows
indication ("tripped") diverging from truth (reactor not shut down) — the exact teaching gap of an
anticipated-transient-without-scram. Surface it; do not add a path that reads around it.

> *(resolved, as built)* The old self-flag — `degraded_hpi` "is really `physics_parameter`" —
> is closed: `degraded_hpi` and `afw_failure` are now typed `physics_parameter` (effects
> `degrade_hpi` / `block_afw`, PWR engine). They intercepted nothing as `command_override`s;
> their persistent physical states (a degraded pump curve; tagged-shut AFW discharge valves)
> are engine-owned per HR7.

---

## 8. The Config Schema (what this layer's machinery reads)

The shapes below are generic; the concrete per-plant instances live in the engine modules.
This layer's evaluators are written against these shapes (HR3).

```javascript
// Trip: any firing → scram. The `instrument` field name is uniform across trips,
// actuations, and alarms (as built). instrument "__true_flow__" is the documented HR1
// exception. M4b adds id? / condition? / blockable? (startup trips).
TripDef       = ( instrument, direction: "high"|"low", setpoint: number, action: "scram" )

// Actuation: issue a command when the condition is met; optional reset and gate condition.
// `active` / `reset_active` (as built) attach an {active} parameter to the fire / reset
// command — how the PWR HPI actuation sends set_hpi {active:true} and resets with
// set_hpi {active:false}. M4b adds arm? (ESF AUTO/MAN) and params? (parameter carry).
ActuationDef  = ( instrument, direction, setpoint, action,
                  reset_below?: number, reset_action?: string, condition?: string,
                  active?: boolean, reset_active?: boolean )

// Interlock (§4b): condition-latched command block with hysteresis and a register-aware
// refusal. M4b adds blocks_when? ({ field, equals } parameter predicate).
InterlockDef  = ( instrument, direction, setpoint, clears_below?|clears_above?: number,
                  blocks: [action], withdrawal_only?: boolean, on_engage?: command,
                  message_learning, message_industry )

// Alarm: condition + priority + panel + two register labels. setpoint is null for boolean kinds.
AlarmDef      = ( id, instrument, direction: "high"|"low"|"is_true"|"is_false"|"is_open",
                  setpoint: number|null, priority: "critical"|"warning"|"caution"|"status",
                  panel: "A"|"B", label_learning, label_industry )

// Failure: routed by `type` (§6). `effect:"block"` (command_override) drops the command (§7).
// `category` (as built: carried by every failure; exposed by the failure catalog, §10)
// groups the failure for the UI Failures tab.
// `severity_meta` (optional) accompanies any `severity_scales` failure: engineering-unit metadata
// the UI's Failures tab renders as a slider (the wire value stays 0–1).
FailureDef    = { type: "command_override",  category, intercepts: [string], override?: string,
                                             override_value?: any, effect?: string,
                                             severity_scales?: string, severity_meta?: SeverityMeta, display: string }
              | { type: "physics_parameter", category, effect: string, severity_scales?: string, severity_meta?: SeverityMeta, display: string }
              | { type: "instrument",        category, instrument_id, mode: string, stuck_value?: any, display: string }

SeverityMeta  = { label: string, unit: string, min: number, max: number, default: number }
// UI mapping (wire is always severity 0–1; engineering is display-only):
//   displayValue = min + severity*(max-min)
//   severity     = clamp((displayValue-min)/(max-min), 0, 1)
// (as built) An INVERTED meta is encoded as min > max (e.g. PWR degraded_hpi
// { label:'HPI Capacity', min:100, max:0, default:50 }: severity 0 → 100 % capacity,
// 1 → 0 %) — the formulas above handle it unchanged. The kernel's default-severity
// derivation (§6) uses the same normalization. A legacy `invert` flag may still appear
// in older metas but is consumed by nothing.
```

The boolean **status readings** referenced by trips/alarms (`rps_scrammed`, `rcp_running`,
`station_blackout`, `eps_bypassed`, `battery_pct`, `steam_demand_low`, `rod_at_limit`,
`rcic_status`, …) are provided by the engine in its instruments block (each engine module
lists them); this layer reads them like any other instrument.

---

## 9. The `evaluate()` Cycle and What This Layer Writes

The Simulation Service (M5) calls this layer once per broadcast cycle with the engine's current
instrument readings (`controlFailureLayer.evaluate(engine.getInstruments())`). In one
evaluation, in order:

1. **Command-override interception** is already in force (applied per command as they arrive,
   §7; the active set is held here).
2. **Trips** (§3) — evaluate; on any firing, scram and record the reason.
3. **Actuations** (§4) — evaluate; issue/reset commands (through interception).
4. **Interlocks** (§4b) — advance each interlock's engage/clear latch against the current
   readings (the block itself is applied per command in `handleCommand`). *(as built)*
5. **Alarms** (§5) — evaluate every condition; advance each alarm's lifecycle.
6. **Assemble this layer's snapshot sections** for M5: `rps_state` (`scrammed`,
   `last_trip_reason`), `alarms` (the list of alarm objects), and `active_failures` — each entry as
   `{ id, severity }` (severity `null` for non-scaling failures), so a restored/loaded run and the
   UI's Failures-tab sliders reflect the actual magnitude of each active failure, not only what the
   current session injected. Per `CONTEXT.md §6.2`, these sections are populated by this layer.

Trip/alarm latency follows the cadence at which M5 calls `evaluate()` (normal 2 Hz, transient
5 Hz, `CONTEXT.md §4`); the caller owns the cadence.

---

## 10. The Interface (for M5/M6/M7)

Capabilities required (names yours):
- `handleCommand(command)` — accept a command descending the stack, apply interception (§7),
  pass to the engine; also the entry point for `acknowledge_alarm` / `acknowledge_all_alarms`,
  `inject_failure` / `clear_failure` / `clear_all_failures` / `set_register` /
  `set_instrument_failure` / `clear_instrument_failure`.
- `evaluate(instruments)` — run the per-cycle evaluation (§9).
- Provide the snapshot sections — `rps_state`, `alarms`, `active_failures` (each `{ id, severity }`) — to M5.
- **`saveState()` / `loadState(state)`** — serialize/restore the layer's runtime state (active
  failures with their severities, alarm lifecycle states, `rps_state`); required by M5's save/restore
  (M5 §8). M4 holds no plant config of its own, so on a plant change it is reconstructed rather than
  restored across plants.
- **Expose the active plant's failure catalog** for the UI's Failures tab, so it builds itself
  instead of hardcoding three plants' entries — for each failure: `{ id, display, category,
  severity_meta? }`, where `category ∈ "reactivity"|"coolant"|"power"|"instrument"|"safety_system"`.
  Rebuilt on every plant change.
- Construction with the selected plant's protection config (version-correct for the RBMK) and
  the engine handle.

---

## 11. Configuration Consistency (must hold; M7 verifies)

The per-plant config this layer consumes must be internally coherent. These properties are the
config author's responsibility (in the engine modules) and are checked by the Test Runner
(M7) without a simulation run:

- Every instrument referenced by a trip, actuation, or alarm **exists** in the plant's
  instrument set.
- Every trip/actuation **condition gate resolves to a status instrument** (directly, or via
  the `*_unavailable` → `*_running` derivation) — the kernel evaluates conditions from
  instruments only (§2), so an unresolvable condition would never arm *(as built)*.
- Every numeric setpoint lies **within** its instrument's range.
- For a shared parameter, the **trip setpoint is more extreme than the matching alarm
  setpoint** — the alarm warns before the trip fires (e.g. PWR high-Tavg alarm 312 °C, trip
  335 °C).
- `lo_lo` thresholds are more extreme than their `lo` siblings.
- Gauge caution/danger zones (M8) align with the alarm setpoints.

This layer should not crash on a malformed config; but the intent is that M7 catches such
authoring mistakes before they manifest as confusing behavior.

---

## 12. The Boundary, Restated

This layer is the plant's decision-maker, and it decides from **what the instruments say**. The
engine below computes physics and makes no decisions (HR2). The layers above (Instructor, Test
Runner, UI) issue commands that pass down through it (HR5). Its rules are plant-specific
**data**, not hardcoded logic (HR3). And it never, for its protective and alarm decisions,
reads true physical state — only instruments (HR1), bar the minimal documented exceptions. Hold
these and the accident scenarios are faithful; break the instrument-reading rule and they
become impossible.
