# 02 — Simulator User Guide

**Document:** PWR-SIM-01  
**Title:** Reactor⚛️Dynamics — PWR Trainer Operation  
**Revision:** 11  

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
2. Confirm the board fills the plant area with its **vital-parameter tiles** across the top, and that the right column shows the Instructor, the tool tabs, and the System Scanner.
3. If the plant is not PWR, open **Plant & Mission** and select the **Pressurized Water Reactor**.

### 2.3 First actions (recommended)

| Step | Action |
|------|--------|
| 1 | Click the mission/status line or open **Plant & Mission** |
| 2 | Select **PWR** |
| 3 | Choose **Free Play** or a training mission |
| 4 | Select initial condition: **Hot Full Power**, **50 % Power**, **Hot Standby** (Mode 3), or **Cold Shutdown** (Mode 5) |
| 5 | Press **Play** if paused; set speed **1×** until familiar |

---

## 3.0 Board layout (PWR)

The PWR uses a **single full-plant synoptic board** as the sole control surface — one stage
carrying the plant mimic, its control cards, and the vital-parameter tiles. **There is no view
switcher and no separate gauge strip**: the tiles are part of the board. The legacy multi-view
plant display with its own gauge strip applies to RBMK/BWR only.

```
┌─ PWR BOARD (one stage) ─────────────────────────────────────┐┌ Sim clock / Play / Speed ─┐
│ [Power][Tavg][Subcool][Pressure][PZR Lvl][SG Lvl]  ← tiles  ││ 📖 Manual  ? Help         │
│                                                             │├ Instructor ───────────────┤
│              PLANT MIMIC + CONTROL CARDS                    ││ commentary / gates        │
│   (rod control, PZR, CVCS, ECCS/RHR/AFW, SG feed,           │├ Tools ────────────────────┤
│    steam dump, turbine-generator, condenser cooling …)      ││ Operate  Inject Failure   │
│                                                             ││ Graph  Physics  Settings  │
├──────────────────────────────┬──────────────────────────────┤├ System Scanner ───────────┤
│ Strip chart (trends)         │ Alarm panel                  ││ hover = name; click = full │
└──────────────────────────────┴──────────────────────────────┘└───────────────────────────┘
```

### 3.1 Vital-parameter tiles

Six tiles across the top of the board. Each shows the reading, a short trend trace, and the
**seven protection regions** behind it — trip · alarm · acceptable · NORMAL · acceptable ·
alarm · trip — drawn from the plant's live protection tables, so a retune moves the tile with
it. Always instrument readings, never truth (HR1).

| Tile | Meaning |
|------|---------|
| REACTOR POWER | Neutron power, % rated |
| AVG COOLANT TEMPERATURE | Tavg — the band tracks the sliding Tavg program |
| SUBCOOLING MARGIN | Margin to boiling — **TMI truth-teller** |
| PRIMARY PRESSURE | RCS pressure; the green band is the pressurizer's own control band |
| PRESSURIZER LEVEL | Pressurizer water level, % |
| STEAM GENERATOR LEVEL | SG narrow-range level, % |

**Units follow Settings → Units** (§7.6): US customary (psi / °F) or SI (MPa / °C), tiles and
strip chart together.

### 3.2 Board cards (control homes)

The cards are laid out around the mimic. **Nothing on the board is tabbed** — every card is
visible at once, which is the point of a single-stage board.

| Card | Primary controls |
|------|------------------|
| **REACTOR / ROD CONTROL** | Control bank Raise/Lower, rod speed, nudge, SCRAM (+ RPS reset) |
| **CONTROL** / **SHUTDOWN** | Control-bank and shutdown-bank position, insertion limit |
| **NUCLEAR INSTRUMENTATION (NIS)** | Source/intermediate range, SUR, reactivity, period, SR detector, trip blocks, 1/M plot |
| **PRESSURIZER** (+ **HEATER**, **SPRAY**) | Pressure, Pressure SP, heaters, spray, level |
| **CHARGING** / **LETDOWN** / **BORON** | Charging pump and flow, CVCS Inventory Control AUTO, letdown orifices, borate/dilute and boron target |
| **ECCS** (×2) / **RHR** / **AFW** / **AUX FEED WATER** | HPI/LPI, RHR alignment and HX flow split, AFW pump and throttle, ESF AUTO re-arm |
| **SIT** | Accumulator status — passive, discharge indication only |
| **STEAM GEN FEED** | SG level, steam flow / feed flow matched pair, feed pump, MSIV |
| **STEAM DUMP** | Dump valve position, Dump SP, AUTO/MANUAL |
| **TURBINE-GENERATOR** | Load mode (Follow / Manual / Off), Turbine Load MWe, main breaker, RPM/MWe |
| **CONDENSER COOLING** | Condenser vacuum, circulating-water inlet temperature |

PORV, block valve, RCPs, MSIV and the safety valves live **on the mimic itself** rather than
on a card — click the component. `03_CONTROLS_AND_INDICATIONS.md` is the per-control reference.

### 3.3 Right column

| Region | Function |
|--------|----------|
| **Sim controls** | Play/Pause, speed 1× / 10× / 60× / 600× / 3600×, Manual, Help, Contact, and **Board focus (⛶)** — hides this column and enlarges the board |
| **Plant & mission line** | Always visible under the sim controls: what is running now; click to change it (§5.0) |
| **Instructor** | Scenario commentary, gates, walkthrough step grading |
| **Tools** | **Operate · Inject Failure · Graph · Physics · Settings** (§7.0) |
| **System Scanner** | **The inspection surface — hover anything to name it; click the block to expand it** (§3.4) |

### 3.4 System Scanner — the inspection surface

The Scanner answers "what is this?" in **two tiers**, and it covers the whole board: every
card, control, component and indication, plus the shell chrome, the vital-parameter tiles and
the active alarm tiles.

| Tier | How | What you get |
|------|-----|--------------|
| **Collapsed** | Point at anything | The name and one sentence — what the thing does |
| **Expanded** | **Click the Scanner block**, then point | The full account: how it behaves, what it is wired to, and the trap that catches people |

Expanded entries carry a **📖 Manual** link that opens the on-screen Operator's Manual **at
the exact section documenting that item** — the fastest route from "what is this knob" to the
procedure that uses it. The collapsed/expanded choice is remembered between sessions.

Alarm-tile detail is **generated from the plant's own protection table**, so it states the
real setpoint in your selected units and cannot drift from a retune.

**NOTE:** hovering does **not** ring or highlight the element. The only glows on the board are
the Instructor's (blue) and the checklist's step preview (green) — both of which point at
something you did *not* choose to look at.

---

## 4.0 Sim controls and keyboard shortcuts

### 4.1 Time control

| Control | Effect |
|---------|--------|
| **Play / Pause** | Start or freeze simulated time (diagram freezes when paused) |
| **Speed** | Discrete acceleration: 1×, 10×, 60×, 600×, 3600× |
| **NOTE** | Physics timestep stays 0.02 s; acceleration runs more steps per wall-clock second |

**CAUTION:** High speed during approach to criticality or load rejection can leave you behind the plant. Use 1×–10× for startups and transients until proficient.

**Fast-forward dropout.** Acceleration snaps back to **1×** when something arrives that you
have to look at: a **reactor trip**, a **new equipment failure**, or the **first alarm on an
otherwise quiet board**. A toast names the reason. Alarms that follow while the board is
*already* lit do **not** drop the clock — inside a casualty those are the consequences you
are already working, and stopping for each one would make fast-forward useless exactly when
a long evolution (cooldown, boration, decay-heat wait) needs it. Standing alarms therefore
suppress alarm dropouts for as long as they stand; a trip or a new failure still gets
through. Turn the whole behavior off at **Settings → Fast-forward dropout**.

### 4.2 Keyboard (global)

| Key | Action |
|-----|--------|
| **Space** | Play / Pause (when not focused on a hold-button) |
| **A** | Acknowledge all alarms |
| **M** | Open / close Operator’s Manual overlay |
| **?** | Help overlay |
| **Esc** | Close overlays |

### 4.3 Destructive control arming

**SCRAM** is the one control on the PWR board that arms. It is a **two-press CONFIRM** with a
**3 s** arm window: the first press reads `CONFIRM`, a second press inside the window trips the
reactor, and letting the window expire disarms it with no action taken.

After the trip the same button becomes the **RPS reset** — it reads `PRESS TO RESET`, or names
what is blocking the reset when the plant is not ready (see `03` §3.5.1). The reset is refused
until the rods are seated.

**NOTE:** every **other** control on the board acts on a **single press**, including ones with
real consequences — **MSIV Close**, **PORV Block Valve Isolate**, and taking the generator
**Off** (the planned offline). Read the control before you click it; there is no second-chance
prompt. Save first (§11.0) if you are experimenting.

The wider two-press convention belongs to the **classic control-bar panels** the RBMK and BWR
still use, where breaker-open, PORV block close, ADS and SLC all arm. The PWR board replaced
that bar, and only SCRAM carried the idiom across.

---

## 5.0 Plant & Mission window

Entry: the plant & mission status line under the sim controls, or **Operate** tab → **Change**.

### 5.1 Selection order

1. **Plant** — PWR / RBMK (pre or post) / BWR  
2. **Mode** — Free Play, campaign mission, or scenario  
3. **Initial condition** — for Free Play: Hot Full Power, 50 % Power, Hot Standby (Mode 3), Cold Shutdown (Mode 5)  

### 5.2 Free Play vs training

| Mode | Use |
|------|-----|
| **Free Play** | Operator-driven; inject failures from the **Inject Failure** tab; practice procedures |
| **Campaign missions** | Guided “Zero to Operator” curriculum (Acts I–VI) |
| **Scenarios** | Flagship / library scripts (TMI, protection tours, etc.) |
| **Procedure walkthroughs** | Step-graded from authored procedures |

### 5.3 Initial conditions (PWR Free Play) and plant MODES

| State ID | Label | Plant MODE | Board meaning |
|----------|-------|------------|---------------|
| `hot_full_power` | Hot Full Power | **Mode 1, At Power** | Critical ~100 %, ~100 MWe |
| `50_percent` | 50 % Power | **Mode 1, At Power** | Critical mid-power (> 5 %) |
| `hot_zero_power` | Hot Standby | **Mode 3, Hot Standby** | Subcritical, hot T/P, control bank in, SR on |
| `cold_shutdown` | Cold Shutdown | **Mode 5, Cold Shutdown** | Subcritical, RCS ~122 °F (50 °C) / ~363 psi (2.5 MPa), **RCPs secured**, **RHR in service**, SR on, PZR level 30 % |

**NOTE:** **Mode 5, Cold Shutdown is a Free Play initial condition and the whole Mode 5 ↔ Mode 1 path is simulated** on integrated physics — start at Cold Shutdown and take the plant to power with **PWR-T20**, or run **PWR-T21** the other way. Mode 4, Hot Shutdown is the transit between them and is simulated too. Heatup and cooldown are **time-compressed**: the evolution is real, its duration is not. See `05_MODE_TRANSITIONS.md` and `12_SIM_PHYSICS.md` §14.

**NOTE:** the engine also carries a `5_percent` state used by scenarios and the reference tables in `09` §11.0. It is **not** offered in the Free Play picker.

---

## 6.0 Display modes (Learning vs Realistic)

| Mode | What you see |
|------|----------------|
| **Learning** | Full teaching visuals, SUR, deception duals (Indicated vs Actual on the PORV when relevant), contextual xenon/fuel chips. The strip chart traces the **true physics** |
| **Realistic** | Quiet board — indications and status only, no teaching overlays. The strip chart traces the **instruments**, so a failed sensor lies on the trend exactly as it does on the gauge |
| **Physics Overlay** | Learning only — reactivity (pcm), period, inventory, void, etc., drawn **on the board**. Not the same thing as the **Physics tab** (§7.5), which is always available and is a panel of its own |

**These are set by the CONTENT, not by you.** There is no display-mode selector: the Settings
tab holds units, fast-forward dropout and About, and nothing else. A scenario declares the mode
it needs, and the **TMI-2 module is the reason the mechanism exists** — Parts 1 and 3 run
**Realistic**, so the board and the trend both keep the deception, and Part 2 switches to
**Learning** so the reveal can show you the physics underneath. Free Play always runs Learning.

Automatic protection and the alarms read the **instruments in both modes** (HR1). The mode
changes what is *drawn*; it never changes what the plant decides.

**WARNING:** in Realistic mode the PORV indicator can lie with **no** dual Actual column and
**no** relief animation — exactly as at TMI-2. The tailpipe temperature is your only honest
tell. Run the **TMI-2 module** (campaign Act V, missions 27–29) to practise it — see
`08_ACCIDENT_TMI.md`. You cannot reach that board state from Free Play.

---

## 7.0 Tools tabs

**There are five:** **Operate · Inject Failure · Graph · Physics · Settings.** Plant automation
is not among them — it lives on the board (§7.3).

### 7.1 Operate

- **Plant** and **Mode** readouts, and **Change** — the Plant & Mission window (§5.0).
- **Reset** — return to the selected initial condition.
- **Features** — optional plant features for the current session.
- **Save / Load** — write or restore a plant state as JSON.

### 7.2 Inject Failure

- Browse injectable failures by category (coolant, power, safety, reactivity, instrument).
- Inject / clear failures for drills.
- Severity sliders where provided (SGTR leak rate, LOCA size, rod runaway rate, etc.).

See `07_ABNORMAL_EMERGENCY.md` for response procedures per failure.

### 7.3 Plant automation (board AUTO controls — not a tab)

Per-channel **AUTO / MAN** controllers that read **instruments** and issue plant
commands. They live on the board's control cards (there is no separate tab):
**STEAM GEN FEED → AUTO** (three-element SG level), **ROD AUTO** on the rod-control
card (Tavg), **BORON → ON** (target ppm), **STEAM DUMP → AUTO**, **CHARGING → AUTO**.

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

### 7.4 Graph

Strip / multi-parameter trends for post-event review and slow transients (xenon, boron).
Pick which parameters plot under **Plot parameters**.

**What the trend traces** depends on the display mode the content set (§6.0). In **Learning**
it plots the **true physics** — sensor noise is not a lesson, and a clean trace is what makes a
slow trend readable. In **Realistic** it plots the **instruments**, so a failed or drifting
sensor shows up on the trend exactly as it does on the gauge, and must be caught by
cross-checking diverse indications (see PWR-E20/E21/E22 in `07_ABNORMAL_EMERGENCY.md`).
Alarms and automatic protection read the instruments in **both** modes (HR1) — the mode
changes what is *drawn*, never what the plant decides.

The vertical scale auto-ranges to round numbers and is then **held**: it re-scales only when
a trace leaves the band, so a line does not change shape once it has been drawn. A trace
brightens when its parameter is in an alarm band. Chart units follow **Settings → Units**,
the same selection the board tiles use.

### 7.5 Physics

**The true plant state, behind the instruments.** Everything on this tab is what the
simulator is actually computing — no lag, no noise, and a failed sensor does not change a
single figure on it. It is an engineering display, not a second board: nothing here alarms,
nothing here is what protection reads, and a real control room has none of it.

Rows are chosen for what the board **cannot** show — quantities with no instrument at all,
or none wired to a readout — and are ordered along the energy path. Five groups:

| Group | What is in it |
|-------|---------------|
| **Reactivity** | Net reactivity (pcm) · fuel temperature (the Doppler driver) · xenon (% eq) · true RCS boron |
| **Core heat** | Fission power · decay heat (% and MWt) · **total core heat** · peak clad temperature · core void fraction |
| **Primary coolant** | Core ΔT (hot − cold) · true subcooling margin · heatup/cooldown rate · RCS inventory · loop void fraction · loop flow |
| **Loop pressure** | Hot leg (the pressurizer datum) · cold leg (pump discharge) · pump suction · suction subcooling · RCP cavitation · primary leak flow |
| **Heat sink & output** | Steam − feed mismatch · turbine steam demand · gross electrical · cycle efficiency |

Three of those repay a second look:

- **Fission power is not total core heat.** The first is the chain reaction alone; the second
  adds the decay tail. At steady power they are the same number, which is why one gauge is
  enough on a real board — but a scram drops fission through the floor while the core is still
  making about **7 %** of rated. The plant is cooled against the second figure, never the first.
- **The loop pressure split.** There is no per-node pressure gauge on this plant; the single
  primary-pressure instrument reads the hot-leg/pressurizer datum. The cold leg runs highest
  (pump discharge — the ECCS and letdown datum) and the pump suction lowest, and at power the
  spread is about **80 psi (0.55 MPa)** end to end. It is why the pump suction flashes and
  cavitates before anything on the board says so.
- **Values marked in colour** are states that should read exactly zero on a healthy plant —
  voiding, RCP cavitation, leak flow — or that have crossed a threshold the engine itself
  uses (clad temperature against the fuel-damage limit; subcooling against saturation). This
  is not an alarm system. The alarm panel is the alarm system.

**Use it after a transient, not during one.** Operating from the true values instead of the
instruments teaches the wrong habit and skips the lesson the sensor-failure drills exist for
(PWR-E20/E21/E22 in `07_ABNORMAL_EMERGENCY.md`). Reading it afterwards to find out *why* the
plant did what it did is the point.

Units follow **Settings → Units** (§7.6). RBMK and BWR have no physics panel authored yet.

### 7.6 Settings

- **Units** — US customary or SI, applied to the board tiles, the setpoint boxes, the readouts
  and the strip chart together.
- **Fast-forward dropout** — on / off (§4.1).
- **About** — Disclaimer, License, and Changelog (in-app; works offline in the portable build).

There is no display-mode, terminology or physics-overlay selector here — see §6.0.

---

## 8.0 Alarms and Instructor

### 8.1 Alarm panel

- Alarms stack when active; color/priority coded (critical / warning / caution / status).
- **Point** at an alarm for the Scanner account of it — including the **real setpoint**, read
  from the plant's protection table in your selected units (§3.4). Pointing does not highlight
  anything on the board.
- **Click** a tile to acknowledge that alarm; **A** acknowledges all.
- **Status**-class tiles arrive already acknowledged — they report a lineup, not a demand for action. See `06_ALARM_RESPONSE.md` §2.0.

**Philosophy:** Alarms read instruments. A stuck sensor can **hide** a real condition or create a false one.

### 8.2 Instructor panel

During missions:

- Read the commentary. The plant vocabulary is authored in two registers — **Learning**
  (plain language) and **Industry** (real plant terminology) — but the shipped board runs
  **Learning** throughout: there is no register selector, and the industry labels sit in the
  data against a future option. Alarm tiles are the visible case; `06_ALARM_RESPONSE.md`
  carries both names for every card.
- Follow **gates** — some actions blocked until the lesson allows them.
- Procedure walkthroughs show step index and acceptance met/not met.
- **Level complete** offers continue / retry / rewind when provided.

**NOTE:** Rewind restores a checkpoint; use it after a failed recovery or softlock.

---

## 9.0 On-screen Operator’s Manual

- **M** or 📖 opens the integrated manual for the active plant.
- **The in-app manual IS this document set.** It renders the same commercial-format chapters
  you are reading now — Read Me First, `01`–`12`, and the revision history — so there is no
  second, thinner in-product reference to keep track of.
- The **📖 Manual** link in an expanded Scanner entry (§3.4) opens it **at the relevant
  section**, which is usually faster than navigating the chapter list.

---

## 10.0 Recommended first-session checklist

| # | Task | Reference |
|---|------|-----------|
| 1 | Launch PWR Free Play at Hot Full Power (**Mode 1, At Power**) | §2, §5 |
| 2 | Identify Power, Pressure, Tavg, Subcool, SG level | §3.1 |
| 3 | Practice SCRAM arming on Rod card (do not fire yet) | §4.3 |
| 4 | Select **MAN** on the generator card → set load ≈ **90 MWe**; observe steam flow / Tavg | `03`, `05` |
| 5 | Restore Follow | `05` |
| 6 | Pause; open Manual (M); find trip setpoints | `09` |
| 7 | Load Hot Standby (**Mode 3, Hot Standby**); practice criticality → **Mode 2, Startup** | PWR-N03, **PWR-T03** |
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
| **Clear failures** | **Inject Failure** tab — end a drill without a full reset |

---

## 12.0 Training campaign overview (optional path)

Campaign **“Zero to Operator”** (six acts, **34 missions** plus one bonus) takes a novice from board familiarization through TMI and a senior operator exam. Recommended order is the campaign list; Free Play is always available. The mission-by-mission map, with the procedure each one exercises, is `11_CAMPAIGN_CROSSWALK.md`.

| Act | Missions | Theme |
|-----|----------|-------|
| I | 3 | The Machine — energy path, chain reaction |
| II | 6 | The Physics — criticality, feedback, xenon, boron |
| III | 12 | The Controls — pressure, feed, rods AUTO, load follow, automation |
| IV | 8 | When Things Go Wrong — protection, LOFW, RCP, LOCA-class drills |
| V | 3 | Three Mile Island — the TMI-2 module (Parts 1–3) |
| VI | 2 | The Reckoning — compressed TMI + qualification exam |

Details: `Blueprint/pwr_training_campaign.md` (design) and Plant & Mission UI (runtime).

---

## 13.0 Related documents

- `01_GENERAL_DESCRIPTION.md`  
- `03_CONTROLS_AND_INDICATIONS.md`  
- `04_NORMAL_OPERATIONS.md`  
- `ISSUES_AND_FINDINGS.md`  
