# M4 — Control & Failure Layer

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

Per `CONTEXT.md §7`, this module produces `layers/control_failure_layer.js` — the
`ControlFailureLayer` (general machinery). It is constructed with (or handed) the selected
plant's protection config (the `*_TRIPS`, `*_ACTUATIONS`, `*_ALARMS`, `*_FAILURES` data
objects from the active engine module) and a handle to the engine below it. It contains **no
plant-specific literals** — the code that evaluates a trip does not contain `2385`; it reads
the setpoint from the config (HR3).

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
    const value = (trip.instrument_id === "__true_flow__")
        ? engine.getTrueState().flow_frac          // documented HR1 exception
        : instruments[trip.instrument_id];
    if (crossed(value, trip.direction, trip.setpoint) && !rps.scrammed) {
        rps.scrammed = true;
        rps.last_trip_reason = trip;               // for the snapshot / alarm
        issueCommand({ action: "scram" });         // descends, through interception
    }
}
// crossed(): "high" → value > setpoint ; "low" → value < setpoint
```
Once scrammed, the reactor stays scrammed until a `reset` (a new initial state) — a trip does
not silently clear. The set of trips is **version-aware** where the plant is (the RBMK has
`RBMK_TRIPS_PRE` vs `RBMK_TRIPS_POST`, M2 §14; this layer is handed the right set for the
selected `design_version`). When `eps_bypassed` is true (RBMK), the auto-trips are disabled —
the layer honors that flag, which is exactly the historical pre-accident condition.

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
    if (act.reset_below !== undefined && value > act.reset_below && act.fired) {
        act.fired = false;
        if (act.reset_action) issueCommand({ action: act.reset_action });   // e.g. close_porv
    }
}
```

**The critical interaction with failures (this is how TMI works):** an automatic actuation
issues a command, and that command passes through the **same failure-interception path** as an
operator command (§7). So when the PORV is stuck open, the automatic command to close it
(`close_porv`, fired by the reset-below-2300 rule) is intercepted and ignored — exactly as an
operator's close would be. Neither the plant nor the operator can shut the stuck valve.

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
only in other parameters (the eroding subcooling margin).

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
`CONTEXT.md §6.7`), reports them in the snapshot's `active_failures`, and **routes each by
kind** (HR7):

- **`command_override`** → **handled here.** When active, this layer intercepts the named
  commands and substitutes the failed behavior (§7). A stuck-open PORV receives `open_porv`
  regardless of what was commanded; a failed rod will not move; a tripped turbine will not
  respond to demand.
- **`physics_parameter`** → **requested from the engine.** A leak, a tube rupture, loss of
  offsite power, an MCP coastdown change the *physics*; there is no command to intercept, so
  the engine owns them. This layer asks the engine to apply/clear the named effect (e.g.
  `coast_down_pumps`, `primary_leak`, `full_blackout`, `stop_rcic`).
- **`instrument`** → **requested from the engine's instrument model.** Because each plant's
  instrument model is built into its engine, an instrument failure (stuck/drift/dead/noisy) is
  applied there. This layer translates the failure into the engine's
  `set_instrument_failure {instrument_id, mode, value}` / `clear_instrument_failure`
  (`CONTEXT.md §6.7`). (Example: `porv_indicator_stuck_closed`, M1 §9.)

`severity` (0.0–1.0) scales failures that declare a `severity_scales` field (e.g. a tube
rupture's leak rate, degraded HPI's flow multiplier). This layer performs the command-override
interception **each cycle** for every active command-override failure.

**Re-inject = severity update.** Injecting a failure that is already active **updates its severity**
in place (idempotent on identity; it does not create a second instance). This is what lets the UI's
Failures-tab slider adjust an active failure's magnitude live (M8).

**Clear reverses by kind.** `clear_failure` removes a `command_override` from the active set
(interception stops); for a `physics_parameter` it calls the engine's clear for the named effect; for
an `instrument` it issues `clear_instrument_failure`. `clear_all_failures` clears every kind.

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
        else if (f.effect)              return applyFailureEffect(f);              // e.g. stop_pump
        else break;                                                               // matched but no transform → pass through
    }
    engine.applyCommand(command);   // only now does it reach the engine
}
```
Automatic actuations (§4) and trip scrams (§3) are issued **through this same
`handleCommand`**, so a command-override failure intercepts them just as it intercepts an
operator's command. This single interception point is what makes a stuck valve defeat both the
operator's and the plant's attempts to close it — the mechanism the TMI scenario is built on.
The engine is reached **only** through this path; the UI never calls the engine directly
(HR5).

**The `block` effect.** A `command_override` with `effect:"block"` **drops** the intercepted command
— no engine call, no substitution. This is how a failure defeats `scram` / `trigger_ads` /
`start_lpci` (ATWS, ADS-failure, LPCI-failure). `applyFailureEffect` treats `"block"` as a no-op for
completeness, but the short-circuit above is what drops it.

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

> `degraded_hpi` (`severity_scales:"hpi_flow_multiplier"` over `set_hpi {active}`) cannot be expressed
> as an `override_value` — it needs a small engine HPI-flow multiplier hook (i.e. it is really
> `physics_parameter`). Flagged for resolution.

---

## 8. The Config Schema (what this layer's machinery reads)

The shapes below are generic; the concrete per-plant instances live in the engine modules.
This layer's evaluators are written against these shapes (HR3).

```javascript
// Trip: any firing → scram. instrument_id "__true_flow__" is the documented HR1 exception.
TripDef       = ( instrument_id, direction: "high"|"low", setpoint: number, action: "scram" )

// Actuation: issue a command when the condition is met; optional reset and gate condition.
ActuationDef  = ( instrument_id, direction, setpoint, action,
                  reset_below?: number, reset_action?: string, condition?: string )

// Alarm: condition + priority + panel + two register labels. setpoint is null for boolean kinds.
AlarmDef      = ( id, instrument, direction: "high"|"low"|"is_true"|"is_false"|"is_open",
                  setpoint: number|null, priority: "critical"|"warning"|"caution"|"status",
                  panel: "A"|"B", label_learning, label_industry )

// Failure: routed by `type` (§6). `effect:"block"` (command_override) drops the command (§7).
// `severity_meta` (optional) accompanies any `severity_scales` failure: engineering-unit metadata
// the UI's Failures tab renders as a slider (the wire value stays 0–1).
FailureDef    = { type: "command_override",  intercepts: [string], override?: string,
                                             override_value?: any, effect?: string,
                                             severity_scales?: string, severity_meta?: SeverityMeta, display: string }
              | { type: "physics_parameter", effect: string, severity_scales?: string, severity_meta?: SeverityMeta, display: string }
              | { type: "instrument",        instrument_id, mode: string, stuck_value?: any, display: string }

SeverityMeta  = { label: string, unit: string, min: number, max: number, default: number, invert?: boolean }
// UI mapping (wire is always severity 0–1; engineering is display-only):
//   displayValue = invert ? max - severity*(max-min) : min + severity*(max-min)
//   severity     = clamp(invert ? (max-displayValue)/(max-min) : (displayValue-min)/(max-min), 0, 1)
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
4. **Alarms** (§5) — evaluate every condition; advance each alarm's lifecycle.
5. **Assemble this layer's snapshot sections** for M5: `rps_state` (`scrammed`,
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
