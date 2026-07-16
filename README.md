# Reactor⚛️Dynamics

An educational, browser-based nuclear power plant simulator. It models three reactor
types — a **PWR** (Pressurized Water Reactor), an **RBMK** (Chernobyl-type), and a
**BWR** (Boiling Water Reactor) — accurately enough to teach real plant behavior and to
reproduce the conditions behind the three most famous nuclear accidents: **Three Mile
Island**, **Chernobyl**, and **Fukushima**.

It runs entirely in the browser as vanilla JavaScript — no server, no downloads, no
WebAssembly, no installation — so it works in restricted institutional environments.

**Defining design principle:** operators interact with **instrument readings** that can
lag, drift, and fail — never with the true physical state. The gap between what is *true*
and what is *indicated* is what makes the accident scenarios meaningful.

## Running it

No build step. Either open `index.html` directly, or serve the folder with any static
server:

```
npx serve .
# or
python3 -m http.server
```

## Architecture

A layered stack — snapshots flow up, commands flow down:

```
User Interface (M8)
        │  commands ↓   snapshots ↑
Test Runner (M7, dev/test only)
Instructor Layer (M6 / M6·PH)
Control & Failure Layer (M4)
Physics Engines (PWR M1 / RBMK M2 / BWR M3)
```

The **Simulation Service (M5)** drives the step loop and assembles each snapshot.

## Project layout

```
reactor_dynamics/
├── index.html
├── engines/
│   ├── pwr/      ← M1  PWR engine (hosts Three Mile Island)
│   ├── rbmk/     ← M2  RBMK engine, pre/post-1986 (hosts Chernobyl)
│   └── bwr/      ← M3  BWR engine (hosts Fukushima)
├── layers/
│   ├── control/                   ← M4  kernel + per-plant control modules
│   ├── simulation_service.js      ← M5
│   ├── instructor_layer.js        ← M6·PH → M6
│   └── test_runner.js             ← M7  (dev only)
├── scenarios/                     ← M6  flagship + library scenarios
└── ui/          { app.js, diagram/, panels/, test_panel/ }   ← M8
```

## Build order

1. **M1 → M2 → M3** — build each engine; tune until its scenario suite passes.
2. **M4** then **M5** — assembled stack to step and snapshot.
3. **M6·PH** — placeholder pass-through Instructor; stack complete end to end.
4. **M7** — validate the wiring.
5. **M8** — the UI, free-play against the stack.
6. **M6** — the real Instructor and flagship scenarios, replacing M6·PH.

## Spec

The authoritative specification lives in `Blueprint/`:

- `CONTEXT.md` — shared interfaces, hard rules, the data contract, scope, build map
  (loaded into every build session).
- `DESIGN_COMPANION.md` — vision, rationale, deliberate exclusions, v2 roadmap.
- `M1`–`M8` module files — full implementation spec for each buildable unit.

To build a module, read `CONTEXT.md` plus that one module's spec — and nothing else.
