# M5 — Simulation Service & Runtime

**Build this module from `CONTEXT.md` + this file alone.** No other module is required.
This is the orchestration that makes the simulator *run*: the physics step loop, snapshot
assembly, the simulation lifecycle (play / pause / reset / speed), plant selection, save and
restore, and determinism. It sits beneath the UI / Test Runner / Instructor and drives the
engine + Control & Failure Layer each cycle. It is the in-browser equivalent of a server's run
loop — except there is no server (vanilla JS, `CONTEXT.md §7`).

`CONTEXT.md` already defines the snapshot/command contract, the field vocabulary, the time
step, determinism, the named initial states, and conventions. **Do not re-derive those; rely
on them.** This file adds the orchestration. Like M4, this module has **no scenario tests of
its own** — the Test Runner (M7) drives the assembled stack through this service and validates
the result.

---

## 1. The Build Target

Per `CONTEXT.md §7`, this module produces `layers/simulation_service.js` — the
`SimulationService`. It holds the active engine (one of M1–M3), the Control & Failure Layer
(M4), and a handle to whatever occupies the Instructor slot above it (the placeholder M6·PH or
the real M6). It runs the step loop, assembles and broadcasts the snapshot, routes simulation
commands, and serializes/restores the whole simulation.

There is **one simulation at a time** in the browser tab — no multi-user infrastructure, no
accounts, no concurrent simulations (v1 scope, `CONTEXT.md §8`).

---

## 2. Position and Role

```
UI (M8) / Test Runner (M7)
        │  plant commands ↓                          snapshots ↑
        ▼                                                 │
   Instructor (M6 / M6·PH) ─► Control & Failure (M4) ─► Engine (M1–M3)
        ▲────────────────── SimulationService (this) ────┘
        drives the step loop, assembles the snapshot, owns the lifecycle
```

The service is the conductor. It does not compute physics, evaluate protection, or script
content — it advances the engine, asks the Control & Failure Layer to evaluate, gathers every
section of the snapshot, and broadcasts the result. It also owns everything *about the run
itself*: starting and stopping, time acceleration, plant selection, and save/restore.

---

## 3. The Step Loop (the core)

The physics advances at a fixed **50 Hz** (`dt = 0.02 s`); the UI is updated at a slower
**broadcast** cadence. Each broadcast, the service runs the inner physics steps, asks the
Control & Failure Layer to evaluate the new instruments, assembles the snapshot, and emits it:

```javascript
const PHYSICS_DT = 0.02;            // 50 Hz physics
let broadcastInterval = 500;        // ms; 2 Hz normal, 200 ms (5 Hz) during a transient (§7)
let timeAcceleration = 1.0;
let running = false;

function stepLoop() {
    if (!running) return;
    const dtEffective       = PHYSICS_DT * timeAcceleration;   // engine is handed this; it does NOT re-apply acceleration
    const stepsPerBroadcast = Math.round(broadcastInterval / PHYSICS_DT);

    for (let i = 0; i < stepsPerBroadcast; i++) {
        engine.step(dtEffective);                              // §4 of CONTEXT: physics then instruments, inside the step
    }
    controlFailureLayer.evaluate(engine.getInstruments());     // trips/actuations/alarms on the new readings (HR1)

    const snapshot = assembleSnapshot();                       // §5 — assemble first so the Instructor can read it
    instructor.step(snapshot, simTime);                        // evaluate beats on the assembled snapshot (no-op for M6·PH);
    snapshot.instructor = instructor.getMessage();             //   its commands take effect next cycle; fold its message in now
    broadcast(snapshot);                                       // to the UI's render() / a registered callback
    simTime += stepsPerBroadcast * dtEffective;
    updateBroadcastCadence(snapshot);                          // §7 transient detection
}

setInterval(stepLoop, broadcastInterval);   // or requestAnimationFrame-driven; either is fine
```

Because every time constant (instrument lag, decay, thermal response, the BWR battery window)
is computed in **simulated** time inside the engine step (HR6), the readings and timelines stay
correct under any acceleration — a 4-second sensor lag is 4 seconds of sim time whether that
passes in 4 wall-clock seconds or a fraction of one.

---

## 4. Snapshot Assembly

Once per broadcast, after the step, the service assembles the complete snapshot
(`CONTEXT.md §6.2`) by gathering each section from its owner. It never invents data; it
collects what the layers below produce.

```javascript
function assembleSnapshot() {
    return {
        type: "state",
        schema_version: "1.0",
        metadata: {
            sim_time: simTime, running, time_acceleration: timeAcceleration,
            wall_time: new Date().toISOString(),
            plant_id: activePlantId,                 // "pwr" | "rbmk" | "bwr"
            design_version: activeDesignVersion,     // "pre_chernobyl" | "post_chernobyl" | null
        },
        true_state:      engine.getTrueState(),      // the engine's true physics
        instruments:     engine.getInstruments(),    // lagged/noisy/failed readings (incl. derived, e.g. subcooling_margin)
        control_state:   engine.getControlState(),   // rod groups + plant-specific control settings
        rps_state:       controlFailureLayer.getRpsState(),        // { scrammed, last_trip_reason }
        alarms:          controlFailureLayer.getAlarms(),          // list of alarm objects
        active_failures: controlFailureLayer.getActiveFailures(),  // active failure ids
        instructor:      instructor.getMessage(),    // { message, message_register }  (null/empty for M6·PH)
    };
}
```

Both **truth and indication** are always present as distinct sections (HR4): the UI reads
instruments + control + alarms; the diagnostic overlay and the Test Runner read true_state.
Collapsing them would make the defining principle unobservable and untestable, so the service
must keep them separate.

---

## 5. Command Routing

The service is the single command entry point for the runtime. It routes by category:

- **Simulation-lifecycle commands** it handles itself: `play`, `pause`, `reset`, `set_speed`,
  `save_state`, `load_state` (`CONTEXT.md §6.7`, §6 and §9 below).
- **Plant / operator commands** (`rod_*`, `scram`, the plant controls, `inject_failure` /
  `clear_failure`, `acknowledge_alarm`, …) it forwards to the **top of the layer stack** — the
  Instructor slot — which descends them through gating → interception → engine (HR5). The
  service does **not** call the engine directly for these.
- **`set_register`** is dispatched to the layers that consume it: the Instructor (commentary
  register) and the Control & Failure Layer (alarm tile labels). The service also records it
  for the UI.

This keeps HR5 intact: every plant command passes through the Instructor and Control & Failure
Layer, so scenario gating and failure interception always apply. (Whatever sits in the
Instructor slot — the real M6 or the placeholder M6·PH — receives the forward; the service
does not care which.)

---

## 6. Lifecycle and Plant Selection

- **`play` / `pause`** — set `running` and start/stop the loop.
- **`set_speed {value}`** — set `timeAcceleration`. Discrete steps surfaced by the UI:
  1× / 2× / 5× / 10× / 60× (the user sets these manually; **no auto-dropout in v1**,
  `CONTEXT.md §8`).
- **`reset {plant_id, initial_state, design_version?}`** — **plant selection / full reset.**
  Performed in order:
  1. **Construct the selected engine** (PWR / RBMK / BWR; for the RBMK with the requested
     `design_version`) and **extract its protection config** — the `*_TRIPS` / `*_ACTUATIONS` /
     `*_ALARMS` / `*_FAILURES` data objects (version-correct for the RBMK, M1 §9 / M2 §14 / M3 §13).
  2. **Construct (or replace) the Control & Failure Layer** (M4), passing it that config and a
     handle to the new engine. On a plant *change*, the previous engine and M4 are **torn down and
     rebuilt** — M4 holds no plant state of its own, so it is always reconstructed for the active
     plant rather than reconfigured in place.
  3. **Wire the stack** — engine ↔ M4 ↔ the current Instructor slot (M6·PH or M6) — so commands
     descend through the right instances and instrument readings ascend through them.
  4. Have the engine **load the named initial state** (the engine owns these — M1 §10, M2 §15,
     M3 §14; the RBMK's `low_power_xenon` and the BWR's `post_scram_sbo` are the scenario
     preconditions), **reset `simTime` to 0**, then **assemble and broadcast the initial snapshot**
     so the UI renders the starting condition immediately, before the loop runs.

  Loading the right engine + config for the selected plant is the service's job.

---

## 7. Time Acceleration and Transient Cadence

The metadata reports the current acceleration; snapshots arrive at a display-suitable cadence
regardless. The service switches the broadcast interval between **normal (500 ms / 2 Hz)** and
**transient (200 ms / 5 Hz)** based on what just changed:

```javascript
function isActiveTransient(snapshot, prev) {
    return Math.abs(snapshot.true_state.power_pct - prev.power_pct) > 1.0          // % per interval
        || Math.abs(snapshot.true_state.pressure_like - prev.pressure_like) > 0.14  // MPa per interval
        || anyAlarmNewlyFiring(snapshot, prev);
}
```
(Use the plant's primary pressure field — `pressure_mpa` / `steam_pressure_mpa` /
`vessel_pressure_mpa`.) The metadata may carry a signal when the run shifts cadence; in v1 the
service does **not** auto-drop the user's acceleration — it only tightens the snapshot cadence
so a fast transient is still rendered smoothly.

---

## 8. Save and Restore

Without a server, save/restore work through browser file APIs — JSON downloaded and uploaded.
The service serializes the **complete** simulation so a restored run continues *identically*:

```javascript
function saveState() {
    const state = {
        schema_version: "1.0",
        metadata: { sim_time: simTime, time_acceleration: timeAcceleration,
                    plant_id: activePlantId, design_version: activeDesignVersion },
        engine:         engine.saveState(),                 // physics + instrument lag buffers + noise PRNG state (the bulk)
        control_failure: controlFailureLayer.saveState(),   // active failures, alarm states, rps state
        instructor:     instructor.saveState(),             // current beat / scenario progress (trivial for M6·PH)
    };
    download(JSON.stringify(state, null, 2), `reactor_save_${Date.now()}.json`);
}

function loadState(state) {
    // reconstruct the right engine + config for state.metadata, then:
    engine.loadState(state.engine);
    controlFailureLayer.loadState(state.control_failure);
    instructor.loadState(state.instructor);
    simTime = state.metadata.sim_time;
    timeAcceleration = state.metadata.time_acceleration;
}
```

The bulk of the state is the engine's, and it **must** include the instrument model's internal
state — every lag buffer and the noise PRNG state — and, where applicable, timers like the
BWR's SBO battery countdown (M3 §17). If those were omitted, a restore would show a transient
the original never had, and any replay would diverge. Save fidelity must be exact; the engine
save/restore tests (each engine's §) already assert this at the engine level.

`save_state` triggers the download; `load_state` opens a file picker, reads the JSON, and
restores. (Implementation: `Blob` + object URL for download; `<input type="file">` + `FileReader`
for load.)

---

## 9. Determinism

Given the same starting state and the same sequence of commands, the simulation must produce
the same result (`CONTEXT.md §4`). The **only** permitted source of variation is instrument
noise, drawn from a **seedable** PRNG whose state is part of the saved engine state — so a
restored simulation continues with the same noise sequence it would have had uninterrupted. The
physics itself contains no hidden randomness. The service must not introduce any: no wall-clock
-dependent physics, no unseeded randomness. (Wall time appears only in `metadata.wall_time`, a
display value, never in the physics.)

---

## 10. The Interface (for M7 / M8)

Capabilities required (names yours):
- `handleCommand(command)` — the single runtime entry point (routes per §5).
- `start()` / `stop()` and the loop (§3).
- `subscribe(callback)` / a render hook — to broadcast each assembled snapshot (the UI's
  `render`, or the Test Runner reading the same snapshots the UI would).
- `selectPlant(plant_id, initial_state, design_version?)` (the `reset` path, §6).
- `saveState()` / `loadState(state)` (§8).
- Construction/wiring of the stack: engine ↔ Control & Failure Layer ↔ Instructor slot, with
  the service driving from above.

The Test Runner (M7) drives the simulation through **this same interface and reads the same
snapshots the UI would**, so it exercises exactly what the UI exercises — which is itself a
confirmation that the snapshot exposes everything a consumer needs.

---

## 11. Runtime Context

Everything runs in one browser tab as vanilla JS (`CONTEXT.md §7`): the engine, the Control &
Failure Layer, the Instructor, this service, and the UI, communicating by direct function
calls and the shared snapshot object — no WebSocket, no server process, no IPC. The
snapshot-and-command contract is identical to what it would be across a network; the
implementation just happens to be in-process. **Deployment** is copying the static files to any
host; this service needs no runtime environment, database, or server endpoints (save/load
replace what a server's save/load endpoints would do). For development, the files are served by
any static server or opened directly.
