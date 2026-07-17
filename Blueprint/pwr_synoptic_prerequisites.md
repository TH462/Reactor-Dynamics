# PWR Synoptic — Engine & Instrument Pre-requisites

**Audience:** Engine implementer (Opus) — **complete before** Fable builds the synoptic UI.

**UI spec:** `Blueprint/new_diagram_controls.md` (diagram, cards, embedded panels, HR1 presentation).

**Rule:** Fable reads **`snapshot.instruments`**, §8.8 **status booleans** (in the instruments block), and **`control_state`** for commands. Realistic mode must **never** use `true_state` for board numbers or animation. If the UI needs a quantity, it must exist here first.

---

## 1. Completion gate (run before handing to Fable)

| Check | Command / action |
|-------|------------------|
| PWR scenarios | `node test/run_pwr.js` → **11/11** (TMI suite must not regress) |
| Data contract | `node test/run_m7.js` passes |
| E2E controls | `node test/run_e2e_controls.js` — new commands wired |
| M4 actuation | `node test/run_m4.js` if AUTO paths touch protection |
| Save/restore | Mid-transient save with CVCS + ECCS active; restore within instrument lag tolerance |

**Spot-check** at `hot_full_power` then under transient:

1. `instruments.charging_flow` can **differ** from `control_state.charging_flow_normalized` when `cvcs_auto` compensates leakage (lagged **true** flow, not setpoint).
2. `instruments.boron_analyzer` lags `true_state.boron_ppm` after `set_boron_adjust`.
3. `instruments.governor_valve` tracks load / admission changes.
4. Large-break or blowdown: `accumulators_discharging` true + `instruments.accumulator_flow` > 0 while tanks discharge.
5. `afw_active`, `rhr_active`, `lpi_active` appear in **`snapshot.instruments`** (status), not only `true_state`.

---

## 2. Recommended build order

Dependencies — do not skip (1–2) before UI-critical paths:

1. **§8.8 instruments + status** (§3–4) — unblocks CVCS panel, SG pressure, governor bow-tie, ECCS animations.
2. **Animation HR1 extras** (§5) — safety relief, leak, steam dump position.
3. **CVCS flow instruments** — required before AUTO make-up validation.
4. **Governor physics** — `governor_valve_pct` modulates steam admission; instrument follows.
5. **RHR** — rename `set_dhr` → `set_rhr`, physics, `rhr_active`.
6. **LPI + accumulators** — physics, commands, flow instruments, finite accumulator volume.
7. **Broader AUTO** (M4) — feedwater, CVCS make-up, steam dump, RHR/LPI permissives, governor (HR2: engine never decides for the operator).
8. **Contract docs** — `CONTEXT.md` §6.3 / §6.7; M1 §8.8 table; note in `BUILD_DECISIONS.md` if used.

---

## 3. M1 §8.8 — new lagged instruments

Add to `engines/pwr/pwr_config.js` `instruments` and `pwr_instruments.js` `SOURCE`.

| `instrument_id` | Source field | Range / units (suggested) | Lag (s) | Notes |
|-----------------|--------------|---------------------------|---------|-------|
| `charging_flow` | `charging_flow` (normalized, true) | 0–0.12 | 2.0 | Tracks AUTO make-up; **≠** setpoint |
| `letdown_flow` | `letdown_flow` (normalized, true) | 0–0.12 | 2.0 | |
| `steam_pressure` | `steam_pressure_mpa` | per SG op band | 0.5 | SG secondary |
| `boron_analyzer` | `boron_ppm` | 0–2500 ppm | 30–60 | Chemistry sample — slower than P/T |
| `governor_valve` | `governor_valve_pct` | 0–100 % | 0.3 | Turbine admission valve |
| `lpi_flow` | `lpi_flow_normalized` (new) | 0–1.2 | 1.0 | LPI injection line |
| `accumulator_flow` | `accumulator_flow_normalized` (new) | 0–1.2 | 0.5 | Passive injection |
| `steam_dump_valve` | `steam_dump_frac` or valve % (new) | 0–100 % | 0.3 | Bypass to condenser — Animation HR1 |
| `primary_leak_flow` | `leak_flow` normalized (new) | 0–1.0 | 0.2 | LOCA/SGTR spray — Animation HR1 |

Tune noise/range in implementation; scenario tests arbitrate \[tune] values.

**Setpoint vs indication:** `control_state.charging_flow_normalized` / `letdown_flow_normalized` remain **commands**. UI shows setpoint and `instruments.charging_flow` / `letdown_flow` side by side.

---

## 4. M1 §8.8 — new status booleans

Add to `pwr_config.js` `instruments.status` and ensure `_copyStatus` / `_instrExtras` in `pwr_engine.js` populate them into **`instruments.reading`** every step (same as `hpi_active` today).

| Status id | Source (sim state) | UI use |
|-----------|-------------------|--------|
| `afw_active` | `s.afw_active` | AFW line animation |
| `rhr_active` | `s.rhr_active` (new) | RHR loop dashes |
| `lpi_active` | `s.lpi_active` (new) | LPI line + card |
| `accumulators_discharging` | passive discharge active (new) | Tank panel + discharge line |
| `condenser_cooling_available` | `s.condenser_cooling_available` | Cooling tower / condenser CW |
| `safety_relief_active` | `s.safety_flow > 0` or `s.safety_open` (new) | Relief animation when safeties lift (PORV indicator may lie) |

Existing status (unchanged): `rps_scrammed`, `rcp_running`, `hpi_active`, `station_blackout`, `steam_demand_low`, `rod_at_limit`.

---

## 5. Animation HR1 — physics the UI must drive without `true_state`

These exist so Fable can animate in **Realistic** mode per `new_diagram_controls.md`:

| Visual | Instrument / status |
|--------|---------------------|
| PORV relief spray | `porv_indicator === 'open'` |
| Safety valve relief | `safety_relief_active` |
| Primary leak spray | `primary_leak_flow` > 0 or break status |
| Charging / letdown pipe dashes | `instruments.charging_flow` / `letdown_flow` |
| Charging pump spin | `instruments.charging_flow` + `charging_pump_running` |
| RCP spin | `rcp_running` (existing) |
| Governor bow-tie | `instruments.governor_valve` |
| Steam dump bypass | `instruments.steam_dump_valve` |
| Accumulator discharge | `accumulators_discharging` + `instruments.accumulator_flow` |
| LPI / HPI lines | `lpi_active` / `hpi_active` + flow instruments |

---

## 6. Physics & commands — system deliverables

### 6.1 RHR (replace DHR) — *(as built, RHR/LPI rework)*

| Item | Detail |
|------|--------|
| Command | `set_rhr { active }` — hot-leg suction **valve** open/close; `set_dhr` deprecated alias |
| Command | `set_rhr_hx { fraction \| pct }` — HX flow split, throttles cooldown **rate** |
| User-facing text | **RHR** everywhere (not DHR) |
| Physics | Suction from the **hot leg** through a valve interlocked to primary pressure — opens only < **2.76 MPa (400 psi)**, **auto-closes** above it. Recirculates hot leg → HX → cold leg via the LPI pump (no net inventory). Heat removed = `rhr_gain × rhr_hx_fraction × (Tavg − 50 °C)`; needs condenser cooling. See `M1` §6.9 |
| State | `rhr_active`, `rhr_valve_open`, `rhr_hx_fraction` (all in `true_state`; `rhr_active`/`rhr_valve_open` also in instrument status) |

### 6.2 LPI (Low-Pressure Injection) — *(as built: merged into HPI)*

| Item | Detail |
|------|--------|
| Command | **No separate command** — LPI is the low-head/high-flow regime of the merged HPI/LPI (`set_hpi`, `set_lpi` alias). Fully automated: armed by the 11.03 MPa Safety Injection (LOCA) signal, delivers as the plant depressurizes below the 4.5 MPa low-head shutoff |
| State | `hpi_active`, `hpi_flow_normalized` in `true_state`; instrument `hpi_flow` |

### 6.2a ECCS card — as-built UI binding contract (backend done; card is the open UI task)

One "Emergency Cooling" card with a **mode indicator** driven by `true_state.eccs_mode`
∈ `{ "HPI", "LPI", "RHR", "off" }` (derived engine-side each step — the UI does not
compute it). Bindings:

| Card element | Bind to | Command |
|------|------|------|
| **Mode badge** | `true_state.eccs_mode` | — (read-only; `RHR` shows whenever the valve is open) |
| HPI/LPI On·Off·Auto | status `hpi_active`; arm `automation.esf.hpi` | `set_hpi {active}` / `set_esf_auto {system:'hpi'}` |
| HPI/LPI flow readout | instrument `hpi_flow` (0–1 combined rated) | — |
| **RHR valve** Open·Close·Auto | status `rhr_valve_open`; arm `automation.esf.rhr` | `set_rhr {active}` / `set_esf_auto {system:'rhr'}` — greys out / refused ≥ 400 psi |
| **RHR cooldown-rate** throttle | control_state `rhr_hx_fraction` (0–1) | `set_rhr_hx {pct}` |

RHR mode is active on the card exactly when `rhr_valve_open` is true. The valve
Open control should reflect the 400 psi interlock (disabled above it; a standing-open
valve auto-closes, so the indicator follows `rhr_valve_open`).

### 6.3 Accumulators

| Item | Detail |
|------|--------|
| Command | Passive — no operator open/close |
| Physics | Finite borated volume; discharge into cold leg when primary pressure below trip; depletes over time |
| State | `accumulators_discharging`, `accumulator_flow_normalized`, optional `accumulator_volume_pct` in `true_state` |
| Instrument | `accumulator_flow`; status `accumulators_discharging` |

### 6.4 Turbine governor

| Item | Detail |
|------|--------|
| Problem today | `steam_flow` tied directly to demand × pressure — no admission valve |
| Deliverable | `governor_valve_pct` (0–100) modulates admission between SG pressure, valve, and `steam_demand` |
| Expose | `true_state.governor_valve_pct`, `control_state` if manual override needed, `instruments.governor_valve` |
| AUTO | Governor tracks `set_steam_demand` / load — M4 may assist; HR2 unchanged |

### 6.5 CVCS (instruments only if physics exists)

Physics for charging/letdown/AUTO already in `pwr_primary.js`. **Add lagged flow instruments** (§3). Verify AUTO make-up raises `instruments.charging_flow` above setpoint when inventory low.

### 6.6 Boron analyzer

| Item | Detail |
|------|--------|
| Instrument | `boron_analyzer` only boron readout on Realistic board |
| Learning | UI shows § Deception dual with `boron_ppm` — engine exposes both |
| Do not | Add `boron_ppm` to §8.8 as a board instrument |

### 6.7 Broader AUTO (M4 + engine)

Minimum for synoptic v1:

- CVCS auto make-up (`set_cvcs_auto`) — already present; validate with flow instruments.
- Steam dump auto (`set_steam_dump { mode: "auto" }`) — already present.
- Feedwater AUTO — if drawn on Steam & Flow card, engine/M4 path must exist or UI marks MANUAL only.
- RHR / LPI permissives — auto-start rules in M4 reading instruments (HR1).

---

## 7. `true_state` additions (CONTEXT §6.3 — additive)

Add to PWR block (names may match implementation):

```javascript
"governor_valve_pct": number,
"lpi_flow_normalized": number,
"lpi_active": bool,           // if not status-only
"accumulator_flow_normalized": number,
"rhr_active": bool,           // if not status-only
"accumulator_volume_pct": number,  // optional, for depletion teaching
```

Keep existing fields; do not remove `boron_ppm`, `steam_pressure_mpa`, etc.

---

## 8. Explicitly do NOT add

| Item | Reason |
|------|--------|
| `core_inventory` instrument | Not on real boards; Learning uses `true_state.core_inventory_pct` only |
| `boron_ppm` instrument | Realistic uses analyzer only |
| Distributed leg pressure | Out of diagram v1 scope |

---

## 9. Files to touch (typical)

| File | Changes |
|------|---------|
| `engines/pwr/pwr_config.js` | New instruments, status, tuning, ECCS/RHR/LPI/accumulator params |
| `engines/pwr/pwr_instruments.js` | SOURCE map, status copy |
| `engines/pwr/pwr_engine.js` | Commands, state init, save/restore, `_instrExtras` |
| `engines/pwr/pwr_primary.js` | LPI/accumulator injection, inventory |
| `engines/pwr/pwr_steam_generator.js` | Governor admission, RHR hook if SG-side |
| `engines/pwr/pwr_pressurizer.js` | Optional `safety_open` exposure for status |
| `engines/pwr/pwr_protection.js` | Alarms/actuation for new systems if needed |
| `Blueprint/CONTEXT.md` | §6.3, §6.7 commands |
| `Blueprint/M1 pwr engine.md` | §8.8 table (optional sync) |
| `test/run_e2e_controls.js` | New command paths |
| `test/run_pwr.js` | Optional: large-LOCA + accumulator scenario |

---

## 10. Fable handoff artifact (produce when done)

Short **Snapshot Field List** for UI wiring — confirm in PR or comment:

**Instruments (numeric):** existing §8.8 set **plus** `charging_flow`, `letdown_flow`, `steam_pressure`, `boron_analyzer`, `governor_valve`, `lpi_flow`, `accumulator_flow`, `steam_dump_valve`, `primary_leak_flow`, `subcooling_margin`, …

**Instruments (status):** existing **plus** `afw_active`, `rhr_active`, `lpi_active`, `accumulators_discharging`, `condenser_cooling_available`, `safety_relief_active`

**Control state (commands):** per `CONTEXT.md` §6.7 including `set_rhr`, `set_lpi`; setpoints separate from indications for CVCS.

**Learning-only `true_state`:** `boron_ppm`, `porv_open`, `core_inventory_pct`, `subcooling_c`, `xenon_pct_eq`, etc. — UI spec in `new_diagram_controls.md` § Learning readouts.

Attach one **example snapshot JSON** at `hot_full_power` and one mid-transient (e.g. CVCS auto + leak, or TMI failures).

---

## 11. UI mapping reference (why each item exists)

| Pre-req | Diagram / panel (`new_diagram_controls.md`) |
|---------|---------------------------------------------|
| `charging_flow` / `letdown_flow` | `pwCvcsPanel` setpoint + indication |
| `boron_analyzer` | `pwCvcsPanel` boron row |
| `governor_valve` | `pwGovValve` bow-tie |
| `steam_pressure` | SG Heat Transfer card |
| `rhr_active` | `pwRhrLoop` |
| `lpi_active` + `lpi_flow` | `pwLpiLine` |
| `accumulators_discharging` + `accumulator_flow` | `pwAccumulatorPanel` + discharge line |
| `afw_active` | `pwAfwLine` |
| `condenser_cooling_available` | `pwCoolingTower` / condenser |
| `rcp_running` | RCP card + loop dashes (no new instrument required) |

---

## 12. Large LOCA scope

When LPI + accumulators pass acceptance here, large-break recovery is in scope for the synoptic era (`new_diagram_controls.md`). Until this file’s §1 gate passes, **do not start** Fable diagram implementation.