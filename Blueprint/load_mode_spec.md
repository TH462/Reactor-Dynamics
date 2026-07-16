# Load Mode — Turbine / Feed Simplification Spec

**Status:** Implemented (Phases A–C)  
**Plants:** PWR, RBMK, BWR  
**Module:** `engines/load_mode.js` + per-engine hooks

---

## 1. Problem

Players had **two decoupled knobs** (turbine load MWe + feedwater %) that must stay matched to reactor power. Diagnostic replays (`Diagnostic/rd_diag_*_pwr.json`) showed rod insertions with **load stuck ~1000 MWe** while power fell → SG level rose → false PZR LO-LO trips. Root cause: **control model**, not player error.

## 2. Design decisions (user-confirmed)

| Question | Decision |
|----------|----------|
| Do SCRAMs drop load in real plants? | **Yes (PWR/BWR/RBMK protection scrams):** reactor trip → turbine trip / load rejection (~0 MWe). Spec: **on scram → `load_mode = 'disconnected'`** + turbine trip. |
| Manual load control | **Slider** (0–rated MWe), not preset buttons. |
| Scope | **All three plant engines** with the same three modes. |

## 3. Player mental model

> *"How hard are we pushing the generator?"*

Feedwater **auto-tracks** load in normal ops (`feed_auto_coupled: true`). Advanced/failure play can still use `set_feedwater_flow` (decouples feed).

## 4. Modes

| Mode | Behavior |
|------|----------|
| **follow** (default) | `load_target_mwe` tracks `power × mwe_rated` with first-order lag (`load_follow_tau` ≈ 45 s). Feed coupled. |
| **manual** | Operator sets `load_target_mwe` via slider. Feed coupled unless decoupled. |
| **disconnected** | 0 MWe — grid breaker open / turbine trip. Feed → 0 when coupled. |

## 5. Per-step algorithm

```
each step (before secondary/BOP balance):
  if load_mode == disconnected:
    load_target = 0; apply load + coupled feed
  else if load_mode == follow:
    load_target += α × (power_mwe − load_target)   // α = dt/(τ+dt)
    apply load + coupled feed
  else manual:
    apply load_target + coupled feed

  load_imbalance_mwe = power_mwe − load_target_mwe
  sg_imbalance_active = |load_imbalance_mwe| > 40 MW
```

On **scram**: `LoadMode.disconnect(s, tripTurbine)`.

## 6. Per-plant field mapping

| Concept | PWR | RBMK | BWR |
|---------|-----|------|-----|
| Load demand | `turbine_demand_frac`, `steam_demand_mwe`, `generator_load` | `steam_to_turbine` | `turbine_load_frac`, `steam_flow_normalized` |
| Feed demand | `feed_pump_speed_pct` (commanded) → `feedwater_demand_frac` | `feedwater_normalized` | `feedwater_normalized` |
| Rated MWe | `cfg.turbine.mwe_rated` | `cfg.turbine.mwe_rated` | `cfg.mwe_rated` |
| Level instrument | `sg_level_pct` | `drum_level_pct` | `vessel_level_pct` |

*(as built)* The PWR coupling no longer writes `feedwater_demand_frac` directly: `setFeed`
(`_loadModeOpts`, `pwr_engine.js`) writes the feed pump's **commanded speed**
`feed_pump_speed_pct`, and the first-order feed-pump inertia (`feed_pump_tau`,
`pwr_steam_generator.js`) produces the delivered `feedwater_demand_frac` downstream.

## 7. Commands

### New

| Command | Params | Effect |
|---------|--------|--------|
| `set_load_mode` | `{ mode: 'follow' \| 'manual' \| 'disconnected' }` | Switch mode; disconnected trips turbine. |
| `set_load_target` | `{ mwe }` | Sets target; forces **manual** mode. |
| `disconnect_grid` | — | `disconnected` + trip. |
| `connect_grid` | — | `follow` mode; re-latch turbine if vacuum OK. |

### Legacy (retained)

| Command | Maps to |
|---------|---------|
| `set_steam_demand {mwe}` (PWR) | manual + `set_load_target` |
| `set_turbine_load {mwe}` (RBMK/BWR) | manual + `set_load_target` |
| `set_feedwater_flow {pct}` | feed-pump speed command (PWR, as built); sets `feed_auto_coupled = false` |
| `breaker-open` / `breaker-close` (UI) | disconnect / connect_grid |

## 8. UI (Phase B)

### PWR synoptic (`pwr_synoptic.js`)

- **Turbine-Generator card:** mode seg (Follow | Manual | Disconnected) + **range slider** for manual load.
- **Steam & Flow card:** hide feed demand % when coupled; show read-only "tracks load".
- **SG card:** `▲ filling` / `▼ draining` when `sg_imbalance_active`.

### RBMK / BWR (`app.js` PROFILES)

- **Turbine & Grid** (or Turbine & Feed): same mode seg + slider; feed hidden when coupled.

## 9. Implementation phases

| Phase | Deliverable | Status |
|-------|-------------|--------|
| **A** | Follow + coupled feed; default at reset; hide feed slider | ✅ |
| **B** | Manual / Disconnected, slider, SG imbalance annunciator, scram→disconnect | ✅ |
| **C** | Instructor micro-scenario `pwr_sg_flood` + hook commentary + procedure notes | ✅ |

## 10. Phase C — `pwr_sg_flood` scenario

Short guided beat: player in **manual** at 1000 MWe, inserts rods; SG level climbs; instructor asks *"What control did you forget?"* Answer: load mode / turbine load should follow power (or disconnect on trip).

## 11. Test plan

1. **Follow at HFP:** rod bank insert 20% over 120 s → `sg_level_pct` stays &lt; 85% (no runaway fill).
2. **Scram:** `load_mode === 'disconnected'`, `steam_demand_mwe === 0` within 5 s.
3. **Manual mismatch:** manual 1000 MWe at 50% power → `sg_imbalance_active` true, level rises.
4. **Legacy:** `set_steam_demand` / `set_turbine_load` still work.
5. **RBMK/BWR:** same follow coupling on `drum_level` / `vessel_level`.

## 12. Files touched

| File | Change |
|------|--------|
| `engines/load_mode.js` | **NEW** shared step/disconnect |
| `engines/pwr/pwr_engine.js` | state, step, commands, scram, contract |
| `engines/rbmk/rbmk_engine.js` | same |
| `engines/bwr/bwr_engine.js` | same |
| `layers/control_failure_layer.js` | intercept `set_load_target` |
| `ui/diagram/pwr_synoptic.js` | turbine card UI, SG warning |
| `ui/app.js` | ACTS, PROFILES (RBMK/BWR) |
| `ui/shell.html`, `test_*.html`, `test/run_*.js` | script load order |
| `scenarios/pwr_sg_flood.js` | **NEW** Phase C |
| `scenarios/pwr_hook.js` | scram beat notes load rejection |
| `Blueprint/BUILD_DECISIONS.md` | decision log entry |
| `Blueprint/CONTEXT.md` | §6.7 command + state additions |

## 13. SCRAM realism note

In US PWR/BWR designs, **reactor trip interlocks turbine trip** (load rejection to house load or zero). Feedwater may continue briefly on auto level control; this sim couples feed to load for teaching clarity — AFW/RHR cover loss-of-feed transients. RBMK: AZ-5 scram normally trips turbine; Chernobyl test is a special case (turbine run-down), not modeled as default.