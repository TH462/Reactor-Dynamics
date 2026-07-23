# Reactor⚛️Dynamics — Build Context

> **For humans:** vision, rationale, deliberate exclusions, simplifications catalog, and the v2 roadmap live in `DESIGN_COMPANION.md` — not here and not in the module files.

**This file is loaded into every build session.** To build any single module, read
**this file plus that one module's spec** (`modules/MX_*.md`) — and nothing else. This
file carries the shared interfaces, the non-negotiable rules, the data contract, the
scope boundaries, and the build map. Each module file carries the full implementation
spec for one buildable unit.

This document defines **what** the system is and **why** the load-bearing decisions are
what they are. It does **not** prescribe internal class structure, method signatures, or
file organization within a module — those are yours, subject to the hard rules and the
contract below. Where something is marked a **hard rule**, it is non-negotiable: break it
and an essential capability of the simulator is lost.

---

## 1. The Product, in Brief

Reactor⚛️Dynamics is an educational browser-based nuclear power plant simulator. It models
three reactor types — a **PWR** (Pressurized Water Reactor), an **RBMK** (Chernobyl-type),
and a **BWR** (Boiling Water Reactor) — accurately enough to teach real plant behavior and
to reproduce the conditions behind the three most famous nuclear accidents (Three Mile
Island, Chernobyl, Fukushima). It runs entirely in the browser as vanilla JavaScript — no
server, no downloads, no WebAssembly, no installation — so it works in restricted
institutional environments. A layered architecture separates pure physics from control
logic, scripted instructional content, and the UI.

**The single defining design principle:** operators interact with **instrument readings**
that can lag, drift, and fail — never with the true physical state. This gap between what
is true and what is indicated is what makes the accident scenarios meaningful (at Three
Mile Island a valve indicator read "closed" while the valve was stuck open). It is realized
by **Hard Rule 1** and the snapshot contract, and it drives much of the architecture.

**The audience is learners** — from curious beginners to knowledgeable enthusiasts. Every
piece of instructional content and every label exists in two registers: a **Learning**
register (plain language) and an **Industry** register (real plant terminology), switchable
at will.

### What it must feel like (for design judgment)

- **Operating a plant feels like gaining real competence** — the plant has its own physics
  and pushes back; nothing is gamified into button-pushing.
- **Being misled by an instrument feels genuinely unsettling** — and must not be softened.
  No hint, no subtle warning, no visual tell that distinguishes a stuck indicator from a
  normal one. The dissonance *is* the lesson.
- **The comparison runs are the emotional center** — the same Chernobyl conditions on the
  pre- vs post-1986 RBMK, the same Fukushima blackout with vs without intervention, the
  same hands on the same controls producing opposite outcomes.
- **Simplifications are honest** — where a lumped model understates reality, the Instructor
  says so plainly. The goal is correct understanding, not false precision.

---

## 2. Architecture: The Layer Model

A stack of layers. Each layer talks only to the layer directly below it. **Snapshots flow
up; commands flow down.**

```
┌──────────────────────────────────────────────┐
│  User Interface (M8)                          │  diagram, gauges, alarms, controls
└───────────────────┬──────────────────────────┘
                    │  commands ↓     snapshots ↑
┌───────────────────┴──────────────────────────┐
│  Test Runner Layer (M7)   (dev/test only)     │  synthetic operator, full-stack tests
└───────────────────┬──────────────────────────┘
┌───────────────────┴──────────────────────────┐
│  Instructor Layer (M6)                        │  scenario engine, commentary, gating
└───────────────────┬──────────────────────────┘
┌───────────────────┴──────────────────────────┐
│  Control & Failure Layer (M4)                 │  trips, auto-actuation, alarms,
│                                               │  failure injection, command interception
└───────────────────┬──────────────────────────┘
┌───────────────────┴──────────────────────────┐
│  Physics Engines (M0–M3)                      │  kinetics, thermal-hydraulics,
│  shared foundations + PWR / RBMK / BWR        │  plant systems, instrument modeling
└──────────────────────────────────────────────┘
```

The **Simulation Service (M5)** is the orchestration that drives the step loop and
assembles the snapshot each cycle; it sits beneath the UI/Test Runner and runs the
engine + Control & Failure Layer. In a shipped build the Test Runner is absent and the UI
connects directly to the Instructor.

**Layer responsibilities:**

- **Physics Engine** — computes what physically happens given state + a time step. Models
  instruments (true state → lagged, noisy, fallible readings). Accepts direct controls.
  Makes no judgments about what *should* happen.
- **Control & Failure Layer** — the plant's automation and the scenario's failures.
  Evaluates protection trips, engineered-safety actuation, and alarms (all from
  instruments). Injects failures; intercepts commands when a failure dictates. Its rules
  are plant-specific **data**.
- **Instructor Layer** — scripted educational content. Runs scenarios (commentary, failure
  injections, optional action gating). Not a person, not a conversational AI; a content
  engine triggered by conditions in the running sim.
- **Test Runner Layer** — a synthetic operator (dev only) that drives commands down and
  reads snapshots back, asserting integration correctness.
- **User Interface** — renders the snapshot, translates user actions into commands. Shows
  instruments by default; true state only as an explicit diagnostic overlay.

---

## 3. The Hard Rules (non-negotiable)

**HR1 — Protection and alarms read instruments, never true state.** Every automatic
decision a real plant makes from sensor data — every trip, every safety actuation, every
alarm — reads the **instrument reading**, not the true physical value. This is the rule
that makes the defining principle real; without it, a stuck indicator can't mask a real
condition and TMI can't be reproduced.

**HR2 — The physics engine makes no control decisions.** The engine computes physics. It
exposes direct controls (insert rods, open this valve, set this flow); the layer above
decides when to use them. No "if pressure high then open valve" inside the engine.

**HR3 — Plant-specific behavior is data, not hardcoded logic.** Trip setpoints, alarm
thresholds, gauge ranges, safety logic, instrument characteristics — all configuration
consumed by general code. The code that evaluates a trip does not contain `2385`; it reads
the setpoint from the plant's config.

**HR4 — The snapshot always carries both true state and instrument readings**, as distinct
sections, every cycle. The UI reads instruments; diagnostic overlays and the Test Runner
read true state. Never collapsed into one.

**HR5 — Commands flow down through the layers; the UI never reaches the engine directly.**
A command enters at the top and descends: Instructor (may gate) → Control & Failure (may
intercept) → engine. Gating and failure-interception depend on this path.

**HR6 — Instrument behavior is computed inside the engine's time step**, using the same
time delta as the physics. Lag is a *simulated-time* constant: a 4-second sensor delay is
4 seconds of simulated time regardless of time acceleration. Applied outside the step, lag
would distort under acceleration — exactly when transients are being studied.

**HR7 — Failures are of two kinds and live in two places.** A failure that modifies a
physical parameter with no operator control (leak, tube rupture, loss of offsite power) is
**physics** and lives in the **engine**. A failure that overrides/ignores a command (stuck
valve, failed rod, tripped turbine) is **command-level** and lives in the **Control &
Failure Layer**, where commands pass through. *(as built — 2026-07-16 design ruling)*
Mechanical relief-valve pop/reseat and turbine protection (low vacuum, overspeed) are
implemented as **control-layer actuations** reading instruments and issuing commands; the
engine keeps only valve state + flow hydraulics. So HR7's "stuck valve / tripped turbine =
command-level" now applies **uniformly** — even the spring safeties are interceptable.

**HR8 — In v1, plant parameters live in code, not external files.** Each plant's parameters
are structured configuration **objects** in JavaScript. No config file system, loader, or
inheritance scheme (beyond the RBMK's internal pre/post sharing). HR3 still applies — the
parameters are data, just expressed in JS — so a future externalization is an extraction,
not a redesign.

---

## 4. The Time Step and Determinism

**Each step, in order:** advance the physics, then update the instruments from the new true
state. Then the Simulation Service assembles the snapshot from the post-step state and sends
it up.

- **Physics timestep:** `dt = 0.02 s` (50 Hz). **Integration:** first-order Euler
  throughout (`x_new = x_old + (dx/dt)·dt`). Do not use higher-order methods. *(As-built
  refinement, Flag F6: still first-order everywhere, but the neutron-kinetics update deviates
  where explicit Euler was numerically insufficient — the BWR uses an implicit prompt-jump
  form (explicit Euler diverges at its Λ = 5e-5), and the RBMK applies an exponential
  prompt-growth fast-path when ρ > β. The PWR and all non-kinetics physics remain plain
  explicit Euler.)*
- **Time acceleration:** realized as **more fixed-dt steps per broadcast**, never a larger dt.
  *(As-built deviation, Flag F6: the original rule handed the engine
  `dt_effective = dt · time_acceleration`, but explicit Euler is only proven stable at 0.02 s —
  60× gave dt = 1.2 s and blew up. The engine still does **not** know or apply the acceleration
  factor itself; HR6 holds because every time constant is sim-time.)*
- **Snapshot cadence:** normally every 100 ms (10 Hz); during an active transient every
  50 ms (20 Hz). "Active transient" = power change > 1%/interval, or pressure change
  > 0.14 MPa/interval, or any alarm newly firing (thresholds scaled from their original
  500 ms reference interval, so the *rate* that flips into transient mode is unchanged).
  Cadence affects how much sim-time passes between snapshots, never the integrity of a
  snapshot. *(Originally specified 500 ms / 200 ms; the build renders faster for a smoother
  live UI — same data, higher frame rate.)*

**Determinism:** given the same starting state and command sequence, the simulation produces
the same result. The only permitted variation is instrument noise, from a **seedable** PRNG
whose state is part of the saved state. The physics contains no hidden randomness.

---

## 5. The Three Plants (conceptual)

- **PWR — Pressurized Water Reactor.** The stable, intuitive reactor; the user's starting
  point. High-pressure primary water (no boiling) carries heat to steam generators that
  boil a separate secondary loop. Negative feedbacks (Doppler, moderator temperature) make
  it self-regulating. **One control rod group + one shutdown group** (a deliberate
  simplification). Hosts **Three Mile Island** — an accident of *information* (a stuck-open
  PORV with an indicator reading closed).
- **RBMK — Chernobyl-type.** The unstable reactor. Graphite-moderated, water-cooled in
  individual pressure tubes. Water acts as a neutron **absorber**, so boiling (voids)
  *increases* reactivity — a **positive void coefficient**. Pre-1986 rods had graphite tips
  causing a **positive scram effect** (insertion briefly adds reactivity). The **ORM**
  (Operational Reactivity Margin) governs how vulnerable it is. Carries **pre-1986 and
  post-1986 versions in one engine** via a flag. Hosts **Chernobyl** — an accident of
  *design*; the comparison (pre destroyed, post safe) is the core lesson.
- **BWR — Boiling Water Reactor.** Stable like the PWR but boils water directly in the core
  and sends steam straight to the turbine (direct cycle). Water-moderated → **negative void
  coefficient**. Power is controlled substantially by **recirculation flow**. Its **passive,
  steam-driven safety systems** (run without AC power) are the heart of **Fukushima** — an
  accident of *sustained support*; the comparison (with vs without depressurize-and-inject)
  is the lesson.

The famous accidents are **scenarios, not separate plants**. The plant a user learns is the
plant the accident happens on.

---

## 6. THE DATA CONTRACT (snapshot up, commands down)

This is the stable interface between the simulator and everything above it. **These names
are used everywhere — snapshot assembly, UI, Test Runner, Instructor — and must be
consistent. Use exactly these names. Do not invent new ones.** Equations and per-plant
config are *not* here; they live in the engine modules. What is here is the shared
vocabulary.

### 6.1 Why both truth and indication

The system must always be able to compare what is true against what is indicated — the UI to
optionally reveal truth as a teaching overlay, the Test Runner to verify instruments
correctly reflect (or correctly fail to reflect) reality, the Instructor to build lessons on
the divergence. Both views are present in every snapshot (HR4). Collapsing them makes the
defining principle unobservable and untestable.

### 6.2 Snapshot shape (top level)

```javascript
snapshot = {
    "type": "state",
    "schema_version": "1.0",
    "metadata": {
        "sim_time":          number,   // seconds of simulated time
        "running":           bool,
        "time_acceleration": number,   // 1.0 = real time
        "wall_time":         string,   // ISO 8601 UTC
        "plant_id":          string,   // "pwr" | "rbmk" | "bwr"
        "design_version":    string,   // "pre_chernobyl" | "post_chernobyl" | null
    },
    "true_state":      { ... },        // plant-specific, §6.3 — TRUE physics (never the operator's primary reading)
    "instruments":     { ... },        // keyed by instrument_id — lagged, noisy, possibly-failed readings (what the UI shows, what trips/alarms read)
    "control_state":   { ... },        // §6.5 — commanded positions/settings
    "alarms":          [ ... ],        // list of alarm objects, §6.6
    "active_failures": [ ... ],        // currently injected failure ids
    "rps_state": {
        "scrammed":          bool,
        "last_trip_reason":  string | null,
        "trip_blocks":       { "<trip_id>": true },   // manually blocked startup trips (PWR: ir_high, pr_low_setpoint; P-10 gated, auto-reinstated below it)
    },
    "automation": {                        // the Control Layer's channel runtime (per-plant channels as data)
        "channels": [ {
            "id": string, "group": string, "label": string, "hint": string,
            "kind": "mode" | "pid" | "rods" | "bang",
            "engaged": bool,               // mode channels derive this from control_state (the plant's truth)
            "setpoint": number | null,     // SI-internal; UI converts for display
            "setpoint_meta": { "min", "max", "unit", "dp", "step", "dim" } | absent,
            "pv": number | null,           // the channel's process variable (an instrument reading)
            "note": string,                // controller status ("holding", "off — reactor scrammed", …)
            "standby": bool
        } ],
        "esf": { "<system_id>": "auto" | "manual" } | absent,   // ESF AUTO/MAN arms (PWR: hpi, afw)
    },
    "instructor": {
        "message":           string | null,
        "message_register":  string | null,   // "learning" | "industry"
        // M6 extensions — emitted whenever the real Instructor occupies the slot
        // (fixed shape: keys always present, null when inactive). The message-only
        // two-key block above is the minimal contract (M6·PH / fallback / mocks).
        "ui_policy":  { "register": string, "highlights": bool } | null,
        "highlight":  {                        // control/gauge the current beat or follow step points at
            "view": string | null,             // owning view hint (RBMK/BWR plant display)
            "control_label": string | null,    // the on-screen control-group label
            "instrument_id": string | null     // gauge-strip highlight
        } | null,
        "follow": {                            // Path 2: active procedure walkthrough
            "procedure_id": string, "step_index": int, "step_total": int,
            "acc_met": bool,                   // acceptance graded instrument-first (HR1)
            "graded_by": "instrument" | "true_state" | null,
            "done": bool
        } | null,
        "level_complete": {                    // scenario / walkthrough finished
            "title": string, "outcome": string,           // outcome in the selected register
            "actions": [ "continue" | "retry" | "rewind" ]
        } | null,
    },
}
```

The `instruments` section is keyed by `instrument_id` and includes **derived** readings
(e.g. `subcooling_margin`) computed from *other instrument readings* — never from true
state (HR1), so they inherit the lag and error of their inputs. **The canonical per-plant
instrument-id list lives with each engine module** (the ids referenced by that plant's
trips, alarms, and scenario triggers); the `true_state` fields below are the parallel
physical-quantity vocabulary.

### 6.3 true_state fields, per plant

**PWR:**
```javascript
"true_state": {
    "power_pct": number, "tavg_c": number, "thot_c": number, "tcold_c": number,
    "pressure_mpa": number, "pzr_level_pct": number, "sg_level_pct": number,
    "steam_flow_normalized": number, "fw_flow_normalized": number, "mwe_output": number,
    "subcooling_c": number,           // derived from TRUE P and T (diagnostic; the operator's value is the instrument)
    "core_inventory_pct": number,     // primary coolant mass
    "fuel_temp_c": number, "decay_heat_pct": number, "xenon_pct_eq": number, "boron_ppm": float,
    "porv_open": bool,                // actual valve position
    "porv_stuck": bool, "hpi_active": bool, "hpi_flow_normalized": float, "afw_active": bool,   // hpi_* = the ONE merged HPI/LPI emergency-injection system (two-segment pump curve; flow normalized to combined rated)
    "afw_pump_running": bool,         // AFW PUMP demand (run lights, honest) — distinct from delivered flow afw_active; the TMI-2 pumps-running/valves-shut split
    "afw_flow_normalized": float,     // TRUE delivered AFW flow (capacity × throttle × level hold; 0 when blocked)
    "porv_tailpipe_temp_c": number,   // PORV discharge/quench-tank line temperature — warm baseline (seat leakage), hot while relief flows; feeds instruments.porv_tailpipe_temp (the TMI-2 tell)
    "fuel_damaged": bool,             // latched when fuel exceeds fuel_damage_c — scenario outcome-grading hook
    "pump_running": bool, "pump_flow_pct": number, "station_blackout": bool,
    "turbine_rpm": float, "condenser_vacuum_kpa": number,
    "scrammed": bool, "melted": bool, "steam_demand_mwe": float,
    "steam_pressure_mpa": number,     // secondary/SG pressure (surfaced for the UI loop diagram)
    "condenser_cooling_available": bool,   // condenser heat-sink availability (also §8.8 status)
    "reactivity_pcm": float, "startup_rate_dpm": float, "reactor_period_s": float,  // reactivity proxies — reactivity computer / SUR / period; display/derived only, NEVER fed to trips (HR1). The PWR carries a startup_rate INSTRUMENT (lagged/noisy twin of the SUR proxy) that feeds the rod-withdrawal interlock — an M4 command block with its own annunciator, not a protection trip.
    "sr_counts_cps": float, "ir_amps": float, "sr_energized": bool,   // nuclear instrumentation: Source Range counts (0 when de-energized; feeds the log instrument source_range + the 1e5 cps startup trip), Intermediate Range chamber current (feeds intermediate_range), SR switch state
    "msiv_open": bool, "sg_safety_open": bool,   // main steam isolation valve + SG code safeties (upstream of the MSIV)
    // Synoptic additions (governor / ECCS / CVCS true flows — feed the §8.8 instruments; additive):
    "governor_valve_pct": number,     // turbine admission valve position, 0–100 %
    "charging_flow_actual": float,    // TRUE CVCS charging (0 with pump off; AUTO-modulated) — feeds instruments.charging_flow, ≠ setpoint
    "letdown_flow_actual": float,     // TRUE CVCS letdown — feeds instruments.letdown_flow
    "leak_flow": float,               // primary break flow, normalized (LOCA/SGTR) — feeds instruments.primary_leak_flow
    "steam_dump_valve_pct": number,   // steam-dump/bypass valve position, 0–100 % — feeds instruments.steam_dump_valve
    "accumulators_discharging": bool, "accumulator_flow_normalized": float, "accumulator_volume_pct": number,  // passive accumulators (finite volume)
    "rhr_active": bool, "rhr_valve_open": bool, "eccs_mode": string,   // RHR (formerly DHR) aligned = hot-leg suction valve open; eccs_mode = "HPI"|"LPI"|"RHR"|"off" for the ECCS card
}
```

**RBMK:**
```javascript
"true_state": {
    "power_pct": float, "fuel_temp_c": float, "void_fraction_avg": number,
    "steam_pressure_mpa": float, "drum_level_pct": float, "channel_flow_pct": number,
    "graphite_temp_avg_c": float, "decay_heat_pct": float, "xenon_pct_eq": float,
    "orm_equiv_rods": number, "orm_alarm_active": bool, "eps_bypassed": bool,
    "scrammed": bool, "melted": bool,
    "destruction_cause": string,      // "none" | "thermal_melt" | "steam_explosion"
    "steam_explosion_occurred": bool, "energy_deposition_rate": number,  // cal/g/s
    "design_version": string,         // "pre_chernobyl" | "post_chernobyl"
    "reactivity_pcm": float, "startup_rate_dpm": float, "reactor_period_s": float,  // reactivity proxies; display/derived only, never fed to trips (HR1). Like the PWR, a startup_rate INSTRUMENT twin feeds the rod-withdrawal interlock (an M4 command block, not a trip).
    // Balance of plant (turbine / condenser / generator — full-scope operation):
    "steam_to_turbine": float,        // operator turbine steam load, normalized (1.0 = rated)
    "mwe_output": float, "turbine_rpm": float, "condenser_vacuum_kpa": number, "turbine_tripped": bool,
}
```

**BWR:**
```javascript
"true_state": {
    "power_pct": float, "fuel_temp_c": float, "core_void_fraction": number,
    "vessel_pressure_mpa": float, "vessel_level_pct": number,
    "steam_flow_normalized": float, "fw_flow_normalized": float, "recirc_flow_pct": float,
    "decay_heat_pct": float, "xenon_pct_eq": float,
    "rcic_running": bool, "hpci_running": bool, "ads_open": bool, "lpci_running": bool,
    "lpcs_running": bool,              // low-pressure core spray (D4)
    "srv_manual_open": bool,           // operator manual SRV depressurization (D6)
    "slc_active": bool, "slc_tank_pct": number,   // Standby Liquid Control — boron ATWS mitigation (D1)
    "station_blackout": bool, "battery_charge_pct": number,
    "scrammed": bool, "melted": bool, "destruction_cause": string,
    "reactivity_pcm": float, "startup_rate_dpm": float, "reactor_period_s": float,  // reactivity proxies; display/derived only, never fed to protection (HR1)
    // Balance of plant (turbine / condenser / generator — full-scope operation):
    "mwe_output": float, "turbine_rpm": float, "condenser_vacuum_kpa": number, "turbine_tripped": bool,
}
```

### 6.5 control_state shape

```javascript
"control_state": {
    "rod_groups": [
        {
            "id": string,            // "control_rods", "shutdown_rods", ...
            "name": string, "function": string,   // "control" | "shutdown"
            "steps": int, "max_steps": int,        // per plant config (PWR 912 fine steps; RBMK/BWR 228)
            "position_pct": number,  // 0–100, 100 = fully withdrawn
            "moving": bool, "direction": int,      // +1 withdraw, -1 insert, 0 stopped
            "speed": string,         // "slow" | "normal" | "fast"
            "scrammed": bool,
            "insertion_limit_steps": int | null, "at_insertion_limit": bool,
        }
    ],
    // PWR-specific:
    "porv_demand": string,           // "open" | "closed"
    "porv_block_open": bool,          // PORV block/isolation valve (B1 — TMI recovery)
    "heater_power_pct": float, "spray_valve_pct": float,
    "heater_auto": bool, "spray_auto": bool,   // pressurizer controls in engine auto (override null) — Automate tab state

    "charging_flow_normalized": float,   // CVCS charging SETPOINT (command) — under AUTO the true flow (instruments.charging_flow) modulates away from this
    "letdown_flow_normalized": float,    // CVCS letdown setpoint
    "feed_pump_speed_pct": float,        // PWR feed pump commanded speed (three-element channel / coupling / manual)
    "feedwater_flow_pct": float, "steam_demand_mwe": float,   // feedwater_flow_pct: deprecated PWR mirror of pump delivery
    "hpi_active": bool, "rhr_active": bool,   // operator-actuated ECCS / cooldown (set_hpi — the merged HPI/LPI — / set_rhr)
    "rhr_valve_open": bool, "rhr_hx_fraction": float, "eccs_mode": string,   // RHR hot-leg valve state; HX flow split 0–1; ECCS card mode: "HPI"|"LPI"|"RHR"|"off"
    "afw_throttle_pct": float,                // AFW throttle position (set_afw_flow)
    "sr_energized": bool, "msiv_open": bool,  // SR detector switch; main steam isolation valve
    "governor_valve_pct": float,     // turbine admission valve % (engine-driven; read-only readout)
    "steam_dump_pct": float, "steam_dump_auto": bool,   // steam dump / turbine bypass (B2)
    "pumps": [ { "id": string, "running": bool, "flow_pct": float } ],
    // RBMK-specific:
    "channel_flow_setpoint_pct": number, "eps_bypassed": bool,
    // BWR-specific:
    "recirc_flow_setpoint_pct": number, "ads_armed": bool, "slc_active": bool,
    // RBMK + BWR balance-of-plant (turbine load + steam dump — full-scope operation):
    "turbine_load_mwe": float, "steam_dump_pct": float, "steam_dump_auto": bool,
    // Shared where applicable: "feedwater_flow_pct" (RBMK/BWR feedwater demand).
}
```

### 6.6 Alarm object

```javascript
{
    "id": string,
    "state": string,        // "clear" | "active_unacknowledged" | "active_acknowledged"
    "priority": string,     // "critical" | "warning" | "caution" | "status"
    "panel": string,        // "A" | "B"
    "tile_label": string,   // selected by current register (learning | industry)
}
```

### 6.7 Command catalog (descend the stack, HR5)

A command names an action and carries its parameters. The UI, Instructor, and Test Runner
all issue these by name.

**Simulation lifecycle:**
```
play
pause
reset               { plant_id, initial_state, design_version? }   // design_version for the RBMK (pre/post-1986); null/omitted otherwise
set_speed           { value }                 // time acceleration factor
save_state
load_state          { state }
set_register        { value: "learning" | "industry" }
```
**Instructor / training lifecycle (M6 — handled by M5's control plane):**
```
start_scenario      { scenario_id }           // resolve RD.SCENARIOS[id] → reset plant → instructor.load
stop_scenario                                  // unload; clears the rewind ring
start_follow        { procedure_id }          // Path 2: resets the plant to the procedure's `from` state,
                                               // then the Instructor runs the RD.MANUAL_PROCEDURES procedure
stop_follow                                    // unload; clears the rewind ring
rewind              { steps?: 1, scope?: "full" | "world" }   // restore an in-memory checkpoint
                                               // full = incl. instructor progress (retry a decision)
                                               // world = plant only; the Instructor narrates on
                                               // ring: authored checkpoints per beat/step while content is
                                               // loaded; every 15 sim-s in free play (sandbox rewind)
follow_nav          { dir: "next"|"prev"|"restart" }   // descends; consumed by the Instructor in a follow
instructor_continue                            // the "Continue" click for `manual` beat triggers; consumed by the Instructor
```
**Rod control (all plants):**
```
rod_nudge           { group_id, steps }        // +withdraw, -insert
rod_start           { group_id, direction, speed }
rod_stop            { group_id }
rod_stop_all
scram
```
**PWR plant control:**
```
set_steam_demand    { mwe }
set_feed_pump_speed { pct }                    // feed pump commanded speed, 0–120 (delivered flow follows via pump inertia)
feed_pump_nudge     { delta_pct }              // manual nudge of the pump speed (the ▲/▼ buttons)
set_feedwater_flow  { pct }                    // DEPRECATED PWR alias for set_feed_pump_speed (still a real command on RBMK/BWR)
set_heater          { power_pct }
set_spray           { open }
open_porv
close_porv
set_hpi             { active }                 // the merged HPI/LPI system; manual use disarms its ESF auto
set_afw             { active }                 // AFW pumps; manual use disarms the AFW ESF auto
set_afw_flow        { pct }                    // AFW throttle, 0–100 % of capacity (also disarms the AFW auto)
set_esf_auto        { system: "hpi"|"afw"|"rhr", auto }   // re-arm (or disarm) an ESF system's auto-actuation
set_rhr             { active }                 // RHR hot-leg suction VALVE (doubles as LPI cooldown) — open honored only < 2.76 MPa (400 psi), auto-closes above it (was DHR)
set_rhr_hx          { fraction | pct }         // RHR heat-exchanger flow split (0–1 / 0–100 %) — throttles cooldown RATE; total flow & inventory unchanged
set_dhr             { active }                 // deprecated one-release alias for set_rhr (save-file compatibility)
set_lpi             { active }                 // DEPRECATED alias for set_hpi (HPI+LPI merged into one system; save-file compatibility)
set_charging_flow   { normalized }             // CVCS charging SETPOINT (manual) — inventory in (cold leg); instruments.charging_flow shows the true flow
set_letdown_flow    { normalized }             // CVCS letdown setpoint (Isolate = set 0)
set_charging_pump   { running }                // CVCS charging pump on/off
set_cvcs_auto       { active }                 // CVCS auto make-up (holds inventory / compensates leakage)
set_boron_adjust    { rate }                   // CVCS boron: + borate, − dilute, 0 hold (ppm/s; needs charging pump)
open_block_valve                               // PORV block/isolation valve (B1)
close_block_valve                              // isolates a stuck-open PORV
set_sr_detector     { on }                     // Source Range detector high voltage (P-6 interlocked both ways)
set_trip_block      { trip_id, blocked }       // block/unblock a blockable startup trip (P-10 gated; auto-reinstates below)
open_msiv                                      // Main Steam Isolation Valve — restore the steam path
close_msiv                                     // isolate main steam (trips a loaded turbine; SG bottles to its code safeties)
set_steam_dump      { mode: "auto"|"open"|"closed" | pct }   // turbine bypass to condenser (B2)
open_pzr_safety                                // pressurizer spring safeties — issued by the control-layer
close_pzr_safety                               //   actuation (pop 17.13 / reseat 16.55 MPa); engine keeps hydraulics
open_sg_safety                                 // SG code safeties — control-layer actuation
close_sg_safety                                //   (pop 9.31 / reseat 9.0 MPa)
```
**RBMK plant control:**
```
set_channel_flow    { pct }                    // MCP flow setpoint
set_feedwater_flow  { pct }
set_eps_bypass      { active }
set_eccs            { active }                 // Emergency Core Cooling — channel make-up on a pressure-tube rupture
manual_scram                                   // AZ-5 equivalent
set_turbine_load    { mwe }                    // turbine steam load → electrical output (BOP)
set_steam_dump      { mode: "auto"|"open"|"closed" | pct }   // turbine bypass to condenser (BOP)
open_relief_valve                              // steam-drum relief — issued by the control-layer
close_relief_valve                             //   actuation (pop 8.0 / reseat 7.8 MPa); engine keeps hydraulics
```
**BWR plant control:**
```
set_recirc_flow     { pct }
set_feedwater_flow  { pct }
set_turbine_load    { mwe }
trigger_ads
start_lpci
set_rcic            { active }                 // manual override; auto-start is default
set_ic              { active }                 // Isolation Condenser — passive heat sink, no AC (Fukushima U1); DC-valve, lost on battery depletion
set_hpci            { active }                 // higher-capacity steam-driven injection; auto-actuated (no manual control in v1)
initiate_slc                                   // Standby Liquid Control — boron shutdown (ATWS mitigation, D1)
stop_slc
start_lpcs                                      // low-pressure core spray (D4)
stop_lpcs
open_srv_manual                                // operator manual SRV depressurization (D6)
close_srv_manual
set_steam_dump      { mode: "auto"|"open"|"closed" | pct }   // turbine bypass to condenser (BOP; gated on condenser availability)
open_relief_valve                              // SRV auto relief — issued by the control-layer
close_relief_valve                             //   actuation (pop 7.58 / reseat 7.44 MPa); engine keeps hydraulics
```
**Shared plant control (all plants):**
```
trip_turbine                                   // turbine protection — issued by the control-layer low-vacuum /
                                               // overspeed actuations (2026-07-16 ruling: relief pops and turbine
                                               // trips are CONTROL decisions reading instruments; the engines
                                               // keep valve state + flow hydraulics and expose these commands,
                                               // so the protections can be manipulated and failed)
set_feed_coupled    { active }                 // re-couple feedwater to load (the init default;
                                               // set_feedwater_flow uncouples).
set_auto_channel    { channel_id, engaged }    // engage/disengage a Control Layer automation channel
                                               // (channel_id "all" = every channel). Engaging captures
                                               // the setpoint from the current instrument reading.
set_auto_setpoint   { channel_id, value }      // edit an engaged channel's setpoint (SI-internal units)
```
**Failure injection:**
```
inject_failure      { failure_id, severity }   // severity 0.0–1.0
clear_failure       { failure_id }
clear_all_failures
set_instrument_failure   { instrument_id, mode, value }
clear_instrument_failure { instrument_id }
```
**Alarm control:**
```
acknowledge_alarm       { alarm_id }
acknowledge_all_alarms
```

### 6.8 Command interface mechanics

No HTTP, no WebSocket. Commands are direct JavaScript function calls down the stack:

```javascript
instructorLayer.handleCommand({ action: "rod_nudge", group_id: "control_rods", steps: -1 });
//   → controlFailureLayer.handleCommand(command)   (may gate / intercept)
//      → engine.applyCommand(command)              (executes as direct physical control)
```
Errors return as `{ type: "error", code: "COMMAND_ERROR", message, received }`.

### 6.9 Named initial states (each plant must support)

- **PWR:** `hot_full_power` (100%, equilibrium) · `hot_zero_power` (subcritical, hot, at
  operating T/P) · `50_percent`.
- **RBMK:** `full_power` (100%) · `50_percent` (stable partial-power maneuvering point,
  healthy ORM) · `hot_startup` (subcritical hot standby — approach-to-criticality start) ·
  `low_power_xenon` (~7% power, xenon ≈ 135% of equilibrium, ORM ≈ 7.5 — the Chernobyl
  precondition).
- **BWR:** `full_power` (100%) · `50_percent` (stable partial power at reduced recirc) ·
  `hot_startup` (subcritical hot standby — approach-to-criticality start) · `post_scram_sbo`
  (scrammed, station blackout active, RCIC just started — the Fukushima starting point).

---

## 7. Technology, File Structure, Deployment

**Browser-only. Vanilla JavaScript. No server, no build step, no WebAssembly, no
framework.** The physics, all layers, and the UI are vanilla JS in a single browser tab,
communicating by direct function calls and a shared snapshot object. (Any reference to
"server-side physics" in older prose is obsolete — there is no server.)

```
Physics engines:  Vanilla JavaScript (ES2020+)
UI:               HTML5, CSS3, Vanilla JavaScript
Diagrams:         hand-authored SVG manipulated by vanilla JS
No framework / no build step / no server / no WebAssembly / no database
Save/load:        JSON downloaded/uploaded via browser file APIs
```

**Canonical file structure** (the modules map onto this):

```
reactor_dynamics/
├── index.html
├── engines/                                                                  // no shared engine module
│   ├── pwr/      { pwr_engine.js, pwr_config.js, pwr_instruments.js,         ← M1
│   │              pwr_thermal.js, pwr_pressurizer.js, pwr_primary.js,
│   │              pwr_steam_generator.js }
│   ├── rbmk/     { rbmk_engine.js, rbmk_config.js, rbmk_instruments.js,      ← M2
│   │              rbmk_kinetics.js, rbmk_thermal.js, rbmk_rods.js }
│   └── bwr/      { bwr_engine.js, bwr_config.js, bwr_instruments.js,         ← M3
│                  bwr_vessel.js, bwr_recirculation.js, bwr_safety_systems.js }
├── layers/
│   ├── control/                                                              ← M4
│   │   ├── control_kernel.js   (generic trip/actuation/alarm/failure machinery)
│   │   ├── pwr_control.js      (PWR trips/actuations/alarms/failures/interlocks — data)
│   │   ├── rbmk_control.js     (RBMK, version-aware pre/post; loads before rbmk_config)
│   │   └── bwr_control.js      (BWR)
│   ├── simulation_service.js   (step loop, snapshot assembly, save/restore)  ← M5
│   ├── instructor_layer.js     (M6·PH pass-through stub now; real M6 later)  ← M6·PH → M6
│   └── test_runner.js          (dev only)                                    ← M7
├── scenarios/   { pwr_tmi.js, rbmk_chernobyl.js, bwr_fukushima.js }          ← M6 (real, with the engine)
└── ui/          { app.js, diagram/, panels/, test_panel/ }                   ← M8
```

Each engine carries `*ScenarioTests` alongside its engine (e.g. `PWRScenarioTests` in
`pwr_engine.js`). Diagrams are hand-authored SVGs delivered separately; the UI is built
around a fixed placeholder region and a component manifest (see M8). **Deployment** is
copying the static files to any web host (CDN, GitHub Pages, any static host).

**Development:** serve with any static server (`npx serve .`, `python3 -m http.server`) or
open `index.html` directly. No compilation, bundling, or transpilation in v1.

---

## 8. v1 Scope — and What NOT to Build

v1 is deliberately contained: **three plants with fixed configurations** (the RBMK carrying
its pre/post version switch), **single-session / single-user** with local save+load,
**manual-first operation** (automatic *protection* is in scope; operator-selectable
automatic *control* — the Control Layer's per-plant automation channels, an explicit
2026-07 scope extension — defaults off except each plant's normal lineup and always yields
to manual action), and **the three flagship scenarios plus a library of smaller ones**
(format defined; the full library grows over time).

**Do not build the following in v1** (each is a reasonable future addition, intentionally
deferred — resist the instinct to build outward before the core is solid):

- Plant configuration *file* system / loader / inheritance, a plant editor, or custom plants.
- User-facing profile testing, shareable validation reports, a plant-creation wizard, or a
  community plant library. (The dev-only Test Runner serves the developer.)
- Multi-user, accounts, authentication, cloud persistence, classroom infrastructure.
- Server-side or WebAssembly physics. (v1 is browser-side vanilla JS — this is the target,
  nothing to defer here.)
- ~~Automatic *control* systems~~ — **built (2026-07 scope extension, user direction):**
  per-plant automation channels in the Control Layer (rod T-avg hold, three-element
  feedwater, AR power hold, recirc/pressure PIDs, ESF AUTO/MAN arms) — see
  `M4b_control_layer.md`.
- Multi-bank rod systems and sequencing, Bank Overlap Unit display, core map view. (All
  were TMI-2-specific; with one control group they have no place.)
- Pressurizer discharge tank and rupture disk. (The stuck PORV + lying indicator are fully
  modeled; the discharge tank is secondary.)
- Sensor redundancy / voting, containment modeling, fuel burnup, thermodynamic
  turbine/condenser detail. (PWR low-pressure injection was later merged into the one
  HPI/LPI system, and passive accumulators were built — both post-v1-plan extensions.)
- Automatic fast-forward dropout. (In v1 the user sets time acceleration manually.)

### Physics simplifications the Instructor must acknowledge

v1's physics is lumped and behavioral — correct in direction and rough magnitude, validated
by the scenario tests. The simplifications below are intentional; the ones marked
**[tell user]** must be voiced by the Instructor in the relevant scenario (this is part of
the product's honesty, see M6):

- **[tell user] Point kinetics — no spatial neutron distribution.** The whole core is one
  point. The Chernobyl excursion was a localized bottom-of-core runaway; the lumped model
  understates the peak (simulated peak « historical ~100× rated). *Mechanism and outcome are
  faithful; only magnitude is understated.* The Chernobyl scenario must say so.
- **[tell user] No sensor redundancy.** One instrument per parameter, so a single stuck
  sensor affects everything downstream — making failures more impactful than in a real
  (voted) plant. Acceptable and arguably more educational; optionally acknowledged.
- **[tell user] Levels are geometric fill, not calibrated instrument spans.** Level `%` is
  simple geometric fill (0 = empty, 100 = full); real plants display a calibrated **narrow-range**
  span around the operating point (plus a separate wide range). The shrink-and-swell *indication*
  effect is still modeled — it lives in the instrument, not the calibration — so the level reading
  can still move the wrong way on a pressure transient; only the narrow/wide-range calibration is
  simplified away.
- **[tell user] No containment model.** The simulation ends at fuel damage; subsequent
  containment events (the Chernobyl explosion, Fukushima hydrogen explosions) are described
  in commentary, not modeled.
- Lumped decay heat (two-term exponential, ~20% accurate over hours), lumped single steam
  generator (PWR) / single channel (RBMK), gain-coefficient pressurizer, timed BWR battery
  depletion (not charge-tracked), fixed jet-pump M-ratio, no xenon spatial oscillations, no
  fuel burnup, behavioral turbine/condenser. These are not user-visible enough to require
  acknowledgment but are all candidates for v2.

---

## 9. How Correctness Is Defined (two gates)

Two non-overlapping test systems. Both must pass.

- **Engine scenario tests (own physics correctness).** Each engine carries a suite of
  self-contained routines that drive it through the behaviors it must exhibit — steady
  operation, control response, shutdown, transients, the **flagship accident**, and
  save/restore — and assert the results. They **call the engine directly, bypassing every
  layer above**. *When an engine's suite passes, its physics is done.* The physics
  parameters are best-estimate starting points (`[tune]` in the math); you bring the engine
  up, run the suite, read which behaviors are off, adjust the responsible parameter, repeat.
  The test output is written to make this loop fast (expected vs observed, likely cause).
  **The suites are the behavioral contract.** Each engine's flagship acceptance criteria
  live in that engine's module (M1/M2/M3).
- **The Test Runner (owns integration correctness).** A synthetic operator that drives
  commands down the full stack and reads snapshots back, asserting the layers are wired
  correctly: snapshot complete and well-shaped, instruments genuinely differ from truth,
  **trips/alarms read instruments not truth** (the highest-value checks — stick an
  instrument past a setpoint with truth safe → must trip; drive truth past a setpoint with
  the instrument safe → must not trip), commands route and intercept correctly, alarm
  lifecycle works, configuration is internally consistent. It exists **only in
  development**. Spec in M7.

**The accident sequences are NOT re-run through the Test Runner.** If the engine tests pass
and the wiring is confirmed correct, the accidents work. Re-running physics through a layer
that adds no physics is testing the same thing twice. The two gates are designed to be
non-overlapping: one owns physics, the other owns wiring.

---

## 10. The Module Map and Build Order

Read `CONTEXT.md` + one module file to build that module. **Each engine (M1–M3) is
completely self-contained** — it builds from `CONTEXT.md` and its own module file alone,
with no dependency on any other module. Each carries its **own copy of the point-kinetics
core** (six-group integrator, decay heat, xenon — authored identically across the three,
kept consistent by spec rather than by a shared file), its **own instrument model** (built
in as a plant system), its thermal-hydraulics, plant systems, config, save/restore, and
scenario tests. There is no shared engine module and no shared engine code.

| Module | Directory | What it builds |
|--------|-----------|----------------|
| **M1** | `engines/pwr` | The PWR engine end to end: point-kinetics core, **its own instrument model** (PWR instrument set + lag/noise/range/failure behavior + derived subcooling), PWR physics (feedbacks, pressurizer, primary loop + inventory, steam generators, turbine/condenser, emergency cooling), PWR protection/alarm/failure config, save/restore, and the **Three Mile Island** acceptance suite. |
| **M2** | `engines/rbmk` | The RBMK engine end to end: kinetics core + RBMK prompt-criticality fast-path, **its own instrument model** (incl. ORM as a computed reading), RBMK physics (nonlinear/amplified void coefficient, ORM, the pre-1986 positive scram effect, two destruction paths, pressure-tube TH + graphite), pre/post versions, config, save/restore, and the **Chernobyl** acceptance + comparison suite. |
| **M3** | `engines/bwr` | The BWR engine end to end: kinetics core, **its own instrument model** (incl. vessel-level swell), BWR physics (negative void feedback, vessel + boiling, recirculation/jet pumps/natural circulation, the steam-driven safety systems RCIC/HPCI/ADS/LPCI, the timed battery limit, uncovery timeline), config, save/restore, and the **Fukushima** acceptance + comparison suite. |
| **M4** | `layers/control` | The Control Layer: a general **kernel** (`control_kernel.js`) for reactor protection, engineered-safety actuation, alarms (lifecycle), failure injection, and **command interception** — reading instruments (HR1), routing failures by kind (HR7) — plus **per-plant control modules** (`pwr_control.js`, `rbmk_control.js`, `bwr_control.js`) carrying each plant's trips/actuations/alarms/failures/interlocks as data (HR3). |
| **M5** | `layers/simulation_service` | The step loop, snapshot assembly, lifecycle (play/pause/reset/speed), plant selection, and save/restore — including the per-engine instrument state (lag buffers, failure state, PRNG seed) for exact-fidelity restore and determinism. |
| **M6·PH** | `layers/instructor_layer.js` | **Placeholder Instructor — temporary scaffold.** A transparent pass-through occupying the Instructor's slot so the stack can be wired and tested before the real Instructor is designed. Passes commands straight down (no gating), runs no beats, emits no commentary, tracks the selected register, and writes an empty `instructor` block (`message: null`). Same interface the real M6 implements, so M6 replaces it with no changes above or below. Built right after M5. |
| **M6** | `layers/instructor` + `scenarios` | **The real Instructor (design pending).** The scenario engine (beats, triggers, branching, gating, two-register commentary) and the three flagship scenarios. Surfaces the **[tell user]** simplification acknowledgments. Drops into M6·PH's slot when ready. |
| **M7** | `layers/test_runner` | The full-stack validation harness and its specific checks (the protection-boundary checks above being the most important). Runs against the assembled stack with M6·PH in place. Dev only. |
| **M8** | `ui` | The control-room UI: the fixed screen layout, the plant diagram (placeholder + component manifest strategy), gauges (with trend + optional true-state overlay), the two-panel alarm annunciator, the controls, the two registers, simulation/time controls, and the dev Test Panel. Runs against the stack with M6·PH (free-play) until the real M6 lands. |

**Build order** (the acceptance gate makes physics provable in isolation before assembly):

1. **M1 → M2 → M3.** Build each engine; tune until its scenario suite passes. When M3
   passes, the physics layer is complete and proven.
2. **M4**, then **M5** — now there is an assembled stack to step and snapshot.
3. **M6·PH** — drop the placeholder Instructor into the command path so the stack is
   complete end to end (commands route all the way down; snapshots come all the way up).
4. **M7** — validate the wiring of the assembled stack.
5. **M8** — the UI, in free-play against the stack.
6. **M6** — the real Instructor and the flagship scenarios, replacing M6·PH, whenever its
   design is ready (it does not block 3–5).

### Cross-module dependencies (the only seams)

- **M4 consumes each plant's protection config.** The kernel holds the general machinery and
  the config *schema*; the concrete per-plant trip/alarm/actuation/failure definitions live
  in `layers/control/<plant>_control.js` (authored against each engine's instrument set, and
  attached onto that engine's config so `engine.getProtectionConfig()` serves them).
- **Instrument IDs are defined alongside each plant's protection config** (an alarm
  referencing `subcooling_margin` requires that id to exist). The `true_state` vocabulary and
  snapshot *shape* are here in CONTEXT; the per-plant instrument-id lists are in M1–M3.
  M6/M7/M8 reference the engine modules for those ids.

---

## 11. Conventions

- **Flows (taxonomy).** *Actual* flows are **normalized to rated** (1.0 = rated) and carry the
  `_normalized` suffix — every flow in a mass/level balance uses this one scale, so the balance
  terms are dimensionally uniform (this is why `dm_dt` and `dVesselLevel_dt` can sum feedwater,
  injection, steam, and boil-off directly). *Control demands/positions* — what the operator sets —
  are in **% of rated** (`_pct`). Power `P` is normalized fission power (1.0 = rated). Flows are
  **displayed as % of rated** and are **unit-system-neutral** (like power and level): the units
  toggle does not touch them. Absolute mass-flow display (kg/s / gpm) is deferred to v2 — it would
  need a per-flow rated magnitude to denormalize.
- **Units — SI internal, everywhere.** The engine, the configs, the Control & Failure Layer,
  the snapshot, and every setpoint/threshold are **SI throughout**: pressure in **MPa**,
  temperature in **°C**, condenser vacuum in **kPa**, level/power as **%**, flows normalized to
  rated (see *Flows* above), reactivity coefficients per **K** (= per °C), MW for
  electrical/thermal power. (Two deliberate non-SI carve-outs, both below: reactivity in Δk/k
  fraction, and energy deposition in cal/g.) Match the §6.3 field suffixes exactly (`_mpa`,
  `_c`, `_kpa`, `_pct`, `_normalized`). The internal unit system is invisible to the player —
  see the display rule next — so it is chosen for consistency, not authenticity.
- **Units — display is the player's choice (UI only).** The UI carries a global units toggle
  (**SI** ↔ **US customary**), structurally like the register toggle: it converts values for
  display only and **never** touches the engine, the setpoints, or any protective decision
  (HR1), so determinism is unaffected. The default is whatever the player picks; there is no
  plant-imposed default. Because the authentic operating units differ by plant (a US PWR is read
  in psia/°F; the RBMK and BWR in MPa/°C), the UI shows a small note next to the affected
  readouts indicating which system is *authentic for the current plant* — informational only;
  the player may use either (UI: M8; the Instructor also voices this once per plant: M6). The
  toggle converts only the genuinely-dimensioned readouts — **pressure, temperature, condenser
  vacuum**; flows, power, level, and RPM are unit-system-neutral and render identically in both.
- **Reactivity (units).** Reactivity is **Δk/k fraction** internally everywhere — ρ, β, the
  feedback coefficients (per-K, i.e. Δk/k per K), and rod worths are all fractions, so the
  kinetics `((ρ−β)/Λ)·P + Σλᵢcᵢ` is dimensionally uniform across all three engines. **pcm** and
  **dollars** are *display/derived only* (1 pcm = 1e−5 Δk/k; 1 $ = β). Where a value is shown in
  pcm — M1's rod worth (`0.085`, ≈ 8500 pcm) or M2's per-group `worth_pcm` (which feeds the ORM
  rod-equivalent **ratio**, where the unit cancels) — it is a presentation of the same fraction
  and is never fed back into the kinetics in pcm.
- **Energy deposition (units).** The prompt-excursion energy metric stays in **cal/g** (rate in
  cal/g/s) — the domain-standard unit for fuel-failure thresholds in reactivity accidents — and
  is the one deliberate numeric exception to SI-internal. Do not convert it.
- **Snapshot field presence.** At runtime the snapshot's `true_state` and `instruments` carry
  **only the active plant's** fields (the per-plant sets in §6.3 and the engine instrument
  lists), **not** a union across plants with nulls. Consumers (UI gauges M8, Instructor triggers
  M6) must read only the active plant's fields and must not assume another plant's fields exist.
- **Instrument ids vs value fields.** Instrument ids are **unit-neutral names** (`tavg`,
  `primary_pressure`, `vessel_pressure`, `steam_flow`); the snapshot/`true_state` *value* fields
  carry the representation suffix (`_mpa`, `_c`, `_kpa`, `_pct`, `_normalized`). Do not add a unit
  suffix to an instrument id, or drop the suffix from a value field — the units pass and the UI's
  display layer both depend on this split.
- **Display formatting (representation → screen).** `_pct` fields are stored 0–100 and shown
  directly as %. Fields stored as a **0–1 fraction or normalized value** — void
  (`void_fraction_avg` / `core_void_fraction`) and the `_normalized` flows — are shown **×100
  with a % sign** (e.g. "Core Void 42 %", feedwater "85 % of rated"). Dimensioned readouts
  (pressure, temperature, vacuum) are converted by the units toggle above. Every such transform
  is **display-only** — the stored value never changes — and the true-state overlay shows the
  true value in the **same on-screen format** as the indicated one, so indicated-vs-true stays a
  like-for-like comparison.
- **Tuning:** values labeled `[tune]` in a module's math are starting points; the scenario
  tests are the final arbiter. Values not labeled are fixed constants — do not change them.
- **Naming:** snapshot fields, command names, and instrument ids are a fixed contract — use
  the exact names in §6 (and the per-plant instrument ids in the engine modules). Do not
  invent variants.
- **Explicit coupling:** the kinetics use the reactivity computed at the start of the step
  (from the previous step's temperatures/states). Standard explicit coupling, stable at
  0.02 s.

---

## 12. The Operator's Manuals (and the rule that keeps them true)

Each plant has an **operator's manual** — one authoritative, **single-voice** document (technical
terms spelled out with their acronym, e.g. "Steam Generator (SG)", "Startup Rate (SUR)") that a
user follows to operate the plant through every phase, plus alarm-response, per-failure emergency
procedures, and the flagship accident walkthroughs. The manuals are **the source of truth for the
Instructor (M6)**: every procedure step carries a machine-checkable **acceptance predicate** that
both the validation harness and the Instructor gate/grade on — one artifact, no second copy.

**Where it lives:**
- `Blueprint/OPERATOR_MANUAL_PLAN.md` — the manual spec: content model, the procedure schema, the
  full per-plant procedure list, and build status.
- `tools/gen_manual_reference.js` → `ui/manual_data.js` (`RD.MANUAL`) — the **generated** reference
  half (controls, indications, setpoints/limits, normal-value baselines, glossary), extracted from
  the live engine configs + a settling run so it cannot drift.
- `ui/manual_procedures.js` (`RD.MANUAL_PROCEDURES`) — the **authored, engine-validated** procedures.
- `test/run_procedures.js` — validates every procedure step's acceptance against the engine.
- `ui/app.js` (+ `shell.html`/`shell.css`) — the in-sim manual panel.

**HARD MAINTENANCE RULE — if you change the sim, update the manuals.** Any change that affects what
the manual states MUST update the manual in the same change:
- Change a **config value** (setpoint, trip/alarm threshold, instrument range, operating point,
  named state, safety limit) → **re-run `node tools/gen_manual_reference.js`** so `RD.MANUAL`
  matches, and adjust any procedure target/acceptance that depended on it.
- Add/rename/remove a **control, command, instrument, failure, or initial state** → update the
  authored layer (control/indication/alarm text, glossary) in the generator and the affected
  procedures; re-run the generator and **`node test/run_procedures.js`** (must stay green).
- Change **physics/tuning** that moves a validated behavior (a procedure's target no longer
  achievable, a new hazard) → update the affected procedures and their acceptance predicates and
  re-validate.
- Add a term/acronym anywhere in the **UI** → add it to that plant's **glossary**.

A manual that disagrees with the running sim is a defect: the Instructor would gate on a false
premise. Treat the procedure suite and the generator as part of the acceptance gate for any
sim-facing change.
