# 02 — Simulator User Guide

**Document:** PWR-SIM-01  
**Title:** Reactor⚛️Dynamics — PWR Trainer Operation  
**Revision:** 0  

---

## 1.0 Purpose

Provide step-by-step instructions to launch the simulator, navigate the human-machine interface (HMI), select plant modes and missions, and use trainer tools without modifying plant state incorrectly.

---

## 2.0 Starting the simulator

### 2.1 Requirements

- Modern desktop browser (desktop is the design target; mobile is not supported).
- No installation, server, or WebAssembly required for normal use.

### 2.2 Launch

1. Open `index.html` in the project root, **or** serve the folder with a static server:
   - `npx serve .`
   - `python -m http.server` / `python3 -m http.server`
2. Confirm the plant control area, gauge strip, and right-column controls appear.
3. If the plant is not PWR, open **Plant & Mission** and select the **Pressurized Water Reactor**.

### 2.3 First actions (recommended)

| Step | Action |
|------|--------|
| 1 | Click the mission/status line or open **Plant & Mission** |
| 2 | Select **PWR** |
| 3 | Choose **Free Play** or a training mission |
| 4 | Select initial condition: **Hot Full Power**, **50 % Power**, or **Hot Standby** |
| 5 | Press **Play** if paused; set speed **1×** until familiar |

---

## 3.0 Board layout (PWR)

The PWR uses a **single full-plant synoptic diagram** as the sole control surface (margin cards + embedded panels). Legacy multi-view switchers apply to RBMK/BWR only.

```
┌─ Vital-few gauges ──────────────────────────────────────────┐┌ Sim clock / Play / Speed ─┐
│ Power · Grid · Press · Tavg · PZR Lvl · SG Lvl · Subcool    ││ 📖 Manual  ? Help         │
├─────────────────────────────────────────────────────────────┤├ Instructor ───────────────┤
│                                                             ││ commentary / gates        │
│              PWR SYNOPTIC DIAGRAM                           │├ Tools ────────────────────┤
│   (margin cards + CVCS / accumulator panels on equipment)   ││ Failures Automate Graph   │
│                                                             ││ Sim Settings Dev          │
├──────────────────────────────┬──────────────────────────────┤├ System Scanner ───────────┤
│ Strip chart (trends)         │ Alarm panel                  ││ hover descriptions        │
└──────────────────────────────┴──────────────────────────────┘└───────────────────────────┘
```

### 3.1 Vital-few gauge strip

Headline instruments (always instrument readings):

| Gauge | Meaning |
|-------|---------|
| Reactor Power | Neutron power, % rated |
| Grid Match | Electrical / load context |
| Primary Pressure | RCS pressure (MPa) |
| Tavg | Average primary temperature |
| PZR Level | Pressurizer water level % |
| SG Level | Steam Generator level % |
| Subcooling | Margin to boiling (°C) — **TMI truth-teller** |

### 3.2 Synoptic margin cards (control homes)

| Card / panel | Primary controls |
|--------------|------------------|
| **Rod Control** | Control bank Raise/Lower/Stop, speed, SCRAM; shutdown bank display |
| **Power & Reactivity** | Power, Tavg, ΔT, SUR, **subcooling bar** |
| **PZR Pressurizer** | Pressure, heaters, spray, level |
| **Relief Valves** | PORV open/close, block valve isolate, safety status |
| **Primary Flow & Inventory** | Flow / inventory context |
| **CVCS panel** (embedded) | Charging pump, charge/letdown, AUTO make-up, borate/dilute |
| **Emergency Cooling** (tabs) | HPI/LPI, AFW, RHR + ESF AUTO re-arm |
| **RCP** | Coolant pump status / start-stop (as modeled) |
| **SG Level** | Level, steam pressure |
| **Steam & Flow** | Steam/feed flows, feed pump, MSIV |
| **Turbine-Generator** | Load mode, MWe target, steam dump, RPM/MWe |
| **Condenser** | Vacuum, cooling availability |
| **Plant Status** | Scram / SBO / plant-level flags |
| **Accumulators** (embedded) | Discharge status only (passive) |

### 3.3 Right column

| Region | Function |
|--------|----------|
| **Sim controls** | Play/Pause, speed 1× / 10× / 60× / 600× / 3600×, Save, Manual, Help |
| **Instructor** | Scenario commentary, gates, walkthrough step grading |
| **Tools** | Failures, Automate, Graph, Sim, Settings, Dev |
| **System Scanner** | Short description of hovered element |

---

## 4.0 Sim controls and keyboard shortcuts

### 4.1 Time control

| Control | Effect |
|---------|--------|
| **Play / Pause** | Start or freeze simulated time (diagram freezes when paused) |
| **Speed** | Discrete acceleration: 1×, 10×, 60×, 600×, 3600× |
| **NOTE** | Physics timestep stays 0.02 s; acceleration runs more steps per wall-clock second |

**CAUTION:** High speed during approach to criticality or load rejection can leave you behind the plant. Use 1×–10× for startups and transients until proficient.

### 4.2 Keyboard (global)

| Key | Action |
|-----|--------|
| **Space** | Play / Pause (when not focused on a hold-button) |
| **A** | Acknowledge all alarms |
| **M** | Open / close Operator’s Manual overlay |
| **?** | Help overlay |
| **Esc** | Close overlays |

### 4.3 Destructive control arming

Critical actions use **two-press CONFIRM?** (≈ 3 s arm window):

- SCRAM (cover open + confirm pattern on rod card)
- Breaker open / grid disconnect (as applicable)
- MSIV Close
- PORV Block Valve Isolate
- Other armed actions per UI

**NOTE:** First click arms; second click within the timeout fires. Timeout disarms without action.

---

## 5.0 Plant & Mission window

Entry: status line under sim controls, or **Sim** tab → Plant & Mission.

### 5.1 Selection order

1. **Plant** — PWR / RBMK (pre or post) / BWR  
2. **Mode** — Free Play, campaign mission, or scenario  
3. **Initial condition** — for Free Play: Hot Full Power, 50 % Power, Hot Standby  

### 5.2 Free Play vs training

| Mode | Use |
|------|-----|
| **Free Play** | Operator-driven; inject failures from Failures tab; practice procedures |
| **Campaign missions** | Guided “Zero to Operator” curriculum (Acts I–VI) |
| **Scenarios** | Flagship / library scripts (TMI, protection tours, etc.) |
| **Procedure walkthroughs** | Step-graded from authored procedures |

### 5.3 Initial conditions (PWR Free Play) and plant MODES

| State ID | Label | Plant MODE | Board meaning |
|----------|-------|------------|---------------|
| `hot_full_power` | Hot Full Power | **Mode 1, At Power** | Critical ~100 %, ~100 MWe |
| `50_percent` | 50 % Power | **Mode 1, At Power** | Critical mid-power (> 5 %) |
| `hot_zero_power` | Hot Standby | **Mode 3, Hot Standby** | Subcritical, hot T/P, control bank in, SR on |

**NOTE:** There is **no Mode 5, Cold Shutdown** initial condition. Mode 5, Cold Shutdown → Mode 3, Hot Standby is **[narr]** only. To practice **Mode 5, Cold Shutdown → Mode 1, At Power**, read **PWR-T20** Phase A, then start Free Play in **Mode 3, Hot Standby** and continue Phases B–E on the board. See `05_MODE_TRANSITIONS.md`.

---

## 6.0 Display modes (Learning vs Realistic)

| Mode | What you see |
|------|----------------|
| **Learning** | Full teaching visuals, SUR, deception duals (Indicated vs Actual on PORV/boron when relevant), contextual xenon/fuel chips |
| **Realistic** | Quiet board — indications and status only; no physics teaching overlays |
| **Physics Overlay** | Learning only — reactivity (pcm), period, inventory, void, etc. |

**Settings** tab holds register (Learning / Industry terminology), units, and related options.

**WARNING:** In Realistic mode, the PORV indicator can lie with **no** dual Actual column and **no** relief animation — exactly as at TMI. Practice there before qualification exams.

---

## 7.0 Tools tabs

### 7.1 Failures

- Browse injectable failures by category (coolant, power, safety, reactivity, instrument).
- Inject / clear failures for drills.
- Severity sliders where provided (SGTR leak rate, LOCA size, rod runaway rate, etc.).

See `07_ABNORMAL_EMERGENCY.md` for response procedures per failure.

### 7.2 Automate

Per-channel **AUTO / MAN** controllers that read **instruments** and issue plant commands:

| Channel (label) | Holds / drives |
|-----------------|----------------|
| Rod control → Tavg (AUTO) | Control rods to hold Tavg setpoint |
| Boron concentration (target) | Batch-doses boron to a target ppm (metered, totalizer-stopped — see 03 §7.5) |
| Boron → rod position trim | Bang-bang boron trim |
| Pressurizer pressure | Heaters + spray mode |
| CVCS make-up | Inventory make-up |
| Feed pump → SG level (three-element) | SG level |
| Steam dump | Bypass mode |
| Turbine / grid (load follow) | Load follow mode |

**Rules:**

- Engaging captures current reading as setpoint (editable).
- **Manual operator action** on that control typically forces **MAN**.
- Failed sensors **fool** automation (HR1).
- Rod/power channels drop out on scram where configured.

### 7.3 Graph

Strip / multi-parameter trends for post-event review and slow transients (xenon, boron).

### 7.4 Sim

- Save / load state (JSON).
- Reset plant.
- Plant & Mission entry.
- Other session utilities.

### 7.5 Settings

- Learning / Industry register (board labels).
- Unit display preferences.
- Diagram / teaching mode options.

### 7.6 Dev

Developer diagnostics — not required for operator training. Treat as out-of-scope for normal ops unless instructed.

---

## 8.0 Alarms and Instructor

### 8.1 Alarm panel

- Alarms stack when active; color/priority coded (critical / warning / caution / status).
- Hover an alarm to highlight related diagram components.
- **A** acknowledges all.

**Philosophy:** Alarms read instruments. A stuck sensor can **hide** a real condition or create a false one.

### 8.2 Instructor panel

During missions:

- Read commentary (Learning or Industry register).
- Follow **gates** — some actions blocked until the lesson allows them.
- Procedure walkthroughs show step index and acceptance met/not met.
- **Level complete** offers continue / retry / rewind when provided.

**NOTE:** Rewind restores a checkpoint; use it after a failed recovery or softlock.

---

## 9.0 On-screen Operator’s Manual

- **M** or 📖 opens the integrated manual for the active plant.
- Sections include Overview, Procedures, Accidents, Alarm Response, Controls, Indications, Setpoints, Normal Values, Failures, Glossary.
- This `Manuals/` folder is the expanded commercial-format library.

---

## 10.0 Recommended first-session checklist

| # | Task | Reference |
|---|------|-----------|
| 1 | Launch PWR Free Play at Hot Full Power (**Mode 1, At Power**) | §2, §5 |
| 2 | Identify Power, Pressure, Tavg, Subcool, SG level | §3.1 |
| 3 | Practice SCRAM arming on Rod card (do not fire yet) | §4.3 |
| 4 | Set load mode Manual → 900 MWe; observe steam flow / Tavg | `03`, `05` |
| 5 | Restore Follow | `05` |
| 6 | Pause; open Manual (M); find trip setpoints | `09` |
| 7 | Load Hot Standby (**Mode 3, Hot Standby**); practice criticality → **Mode 2, Startup** | PWR-N02, **PWR-T03** |
| 8 | Raise above 5 % into **Mode 1, At Power**; then shut down to Mode 3, Hot Standby | PWR-N06, N14 |
| 9 | Read **PWR-T20** / **PWR-T21** for Mode 5, Cold Shutdown ↔ Mode 1, At Power full story | `05` |
| 10 | Inject Loss of Feedwater in Mode 1, At Power; practice AFW | PWR-E01 |

---

## 11.0 Save, reset, and recovery

| Action | When |
|--------|------|
| **Save** | Before risky free-play experiments |
| **Load** | Restore a saved JSON state |
| **Reset** | Return to selected initial condition |
| **Rewind** | Mission checkpoint restore after failure |
| **Clear failures** | Failures tab — end a drill without full reset |

---

## 12.0 Training campaign overview (optional path)

Campaign **“Zero to Operator”** (six acts, ~31 missions) takes a novice from board familiarization through TMI and a senior operator exam. Recommended order is the campaign list; Free Play is always available.

| Act | Theme |
|-----|--------|
| I | The Machine — energy path, chain reaction |
| II | The Physics — criticality, feedback, xenon, boron |
| III | The Controls — pressure, feed, rods AUTO, load follow, automation |
| IV | When Things Go Wrong — protection, LOFW, RCP, LOCA-class drills |
| V | TMI-2 multi-part module |
| VI | Reckoning — compressed TMI + qualification |

Details: `Blueprint/pwr_training_campaign.md` (design) and Plant & Mission UI (runtime).

---

## 13.0 Related documents

- `01_GENERAL_DESCRIPTION.md`  
- `03_CONTROLS_AND_INDICATIONS.md`  
- `04_NORMAL_OPERATIONS.md`  
- `ISSUES_AND_FINDINGS.md`  
