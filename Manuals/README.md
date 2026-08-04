# Reactor⚛️Dynamics — PWR Operator’s Manual Set

**Plant:** Pressurized Water Reactor (PWR)  
**Trainer:** Reactor⚛️Dynamics educational plant simulator  
**Document set:** Commercial-style operating manuals for training use  
**Revision:** 25  
**Date:** 2026-08-03  
**Date:** 2026-07-30  

---

## Purpose

This folder contains the **operator’s manuals** for the PWR unit of Reactor⚛️Dynamics. They are written in the style of commercial nuclear power plant operating manuals: numbered procedures, prerequisites, precautions, step-by-step actions, and acceptance criteria.

They cover:

1. How to **use the simulator** (HMI, plant MODES, missions, tools).
2. How to **operate the plant** (every control, normal evolutions, **Mode 1, At Power** through **Mode 5, Cold Shutdown** transitions).
3. How to **respond** to alarms, upsets, and accidents (including Three Mile Island).

**Primary operator paths:** take the plant **Mode 5, Cold Shutdown → Mode 1, At Power** (cold shutdown to power operation) and **Mode 1, At Power → Mode 5, Cold Shutdown** (power operation to cold shutdown). See `05_MODE_TRANSITIONS.md` procedures **PWR-T20** and **PWR-T21**.

These manuals are training documentation derived from `Blueprint/` design specs, the as-built engines/control layer, and the validated procedure data (`ui/manual_procedures.js`). **They are the PWR operator's manual** — the in-app Manual renders these same files (packed by `tools/pack_manuals.js`), so an edit here is an edit to the product. They are **not** licensing basis documents for a real nuclear plant.

---

## Document map

| File | Title | Use when… |
|------|--------|-----------|
| [`00_REVISION_HISTORY.md`](00_REVISION_HISTORY.md) | Revision history | Checking document status |
| [`01_GENERAL_DESCRIPTION.md`](01_GENERAL_DESCRIPTION.md) | Plant general description | Learning what a PWR is and how this plant is modeled |
| [`02_SIMULATOR_USER_GUIDE.md`](02_SIMULATOR_USER_GUIDE.md) | Simulator user guide | Starting the trainer, UI layout, free play vs missions |
| [`03_CONTROLS_AND_INDICATIONS.md`](03_CONTROLS_AND_INDICATIONS.md) | Controls & indications | Operating any individual control or reading any gauge |
| [`04_NORMAL_OPERATIONS.md`](04_NORMAL_OPERATIONS.md) | Normal operating procedures | Startup, power ops, shutdown, system control procedures |
| [`05_MODE_TRANSITIONS.md`](05_MODE_TRANSITIONS.md) | MODE transition procedures | Mode 5, Cold Shutdown↔Mode 1, At Power, Mode 3, Hot Standby↔Mode 1, At Power, load/AUTO |
| [`06_ALARM_RESPONSE.md`](06_ALARM_RESPONSE.md) | Alarm response procedures | Responding to each annunciator |
| [`07_ABNORMAL_EMERGENCY.md`](07_ABNORMAL_EMERGENCY.md) | Abnormal & emergency procedures | Managing every modeled failure |
| [`08_ACCIDENT_TMI.md`](08_ACCIDENT_TMI.md) | Accident study — TMI-2 | Studying the 1979 accident of information |
| [`09_SETPOINTS_LIMITS.md`](09_SETPOINTS_LIMITS.md) | Setpoints & limits | Looking up trips, actuations, alarms, normal values |
| [`10_GLOSSARY.md`](10_GLOSSARY.md) | Glossary | Looking up acronyms and terms |
| [`11_CAMPAIGN_CROSSWALK.md`](11_CAMPAIGN_CROSSWALK.md) | Campaign ↔ manuals map | Matching missions to N/T/E procedures |
| [`12_SIM_PHYSICS.md`](12_SIM_PHYSICS.md) | Simulation physics & model scope | Asking what the sim actually computes, what it simplifies, and what it does not model at all |
| [`CAMPAIGN_MODE_ALIGNMENT_SPEC.md`](CAMPAIGN_MODE_ALIGNMENT_SPEC.md) | Campaign change spec | What to change in campaign code (not done yet) |
| [`CAMPAIGN_MANUAL_DISCREPANCIES.md`](CAMPAIGN_MANUAL_DISCREPANCIES.md) | Discrepancies log | Manuals vs campaign gaps |
| [`ISSUES_AND_FINDINGS.md`](ISSUES_AND_FINDINGS.md) | Issues & findings log | Known sim/doc/code gaps found while writing these manuals |

---

## Conventions used in these manuals

### Procedure numbering

| Prefix | Meaning | Example |
|--------|---------|---------|
| **PWR-N##** | Normal operations | PWR-N03 Approach to criticality |
| **PWR-T##** | Plant MODE transitions | PWR-T03 Mode 3, Hot Standby → Mode 1, At Power; PWR-T20 Mode 5, Cold Shutdown → Mode 1, At Power |
| **PWR-C##** | Control / system procedure | PWR-C10 Pressurizer pressure control |
| **PWR-A##** | Alarm response | PWR-A09 LO SUBCOOL |
| **PWR-E##** | Abnormal / emergency (failure response) | PWR-E01 Loss of main feedwater |
| **PWR-X##** | Accident case study | PWR-X01 Three Mile Island |

### Callouts

| Callout | Meaning |
|---------|---------|
| **WARNING** | Action or condition that can lead to core damage, trip, or severe plant upset |
| **CAUTION** | Action that can damage equipment, trip the unit, or violate a training limit |
| **NOTE** | Clarifying information; not a required action |
| **[sim]** | Fully step-followable in this trainer |
| **[narr]** | Narrative / context only — not step-followable on the board |

### Plant MODES (commercial numbering)

**Convention:** always write **Mode N, Name** (example: **Mode 1, At Power**).

| MODE | Full form | Criteria (trainer) | Trainer |
|------|-----------|--------------------|---------|
| **1** | **Mode 1, At Power** | Critical, power **> 5 %**, RCS hot | [sim] |
| **2** | **Mode 2, Startup** | Critical, power **≤ 5 %**, RCS hot | [sim] |
| **3** | **Mode 3, Hot Standby** | Subcritical, RCS hot | [sim] |
| **4** | **Mode 4, Hot Shutdown** | Subcritical, intermediate T | [sim] |
| **5** | **Mode 5, Cold Shutdown** | Subcritical, cold | [sim] — a Free Play initial condition |
| **6** | **Mode 6, Refueling** | Head detensioned / refueling | Out of scope |

Do **not** confuse plant MODES with **turbine load modes** (Follow / Manual / Disconnected).

**Campaign alignment:** the live “Zero to Operator” campaign does not yet use this naming or Mode 5 path. Required code changes are specified in [`CAMPAIGN_MODE_ALIGNMENT_SPEC.md`](CAMPAIGN_MODE_ALIGNMENT_SPEC.md). Mission ↔ procedure map: [`11_CAMPAIGN_CROSSWALK.md`](11_CAMPAIGN_CROSSWALK.md).

### Units

**These manuals quote US customary units first, with SI in parentheses** — `2235 psi (15.41 MPa)`, `579.2 °F (304 °C)`. US first because that is what the PWR board reads; SI alongside because that is what the engine computes in, and what every setpoint in the source is written in.

| Quantity | US | SI | Conversion |
|----------|----|----|------------|
| Pressure | **psi** (absolute) | MPa | × 145.038, whole psi |
| Temperature | **°F** | °C | × 9/5 + 32, 1 dp |
| Temperature **difference** | **°F** | °C | **× 9/5, no offset** — 1 dp |
| Condenser vacuum | **inHg** | kPa | × 0.2953, 1 dp |
| Level, power, flow | % / normalized — no conversion | | |

**The difference row is not a footnote.** Subcooling margin, leg ΔT, DNB margin, control deadbands and cooldown *rates* are temperature **differences**: a subcooling margin of **73.8 °F** (41 °C) is what a healthy plant shows — applying the absolute rule instead would print 105.8 °F and make a thin margin look comfortable. Both forms appear in these manuals and both are checked mechanically — see below.

Reactivity (pcm, Δk/k), startup rate (DPM), counts (cps), currents (A) and time have no US/SI distinction and are quoted once.

**Every US (SI) pair is verified by `node test/run_manual_units.js`**, which re-derives the US value from the SI value and fails on any arithmetic error, any missing partner, and any temperature *difference* converted with the absolute rule. If you edit a number here, run it.

**The convention is not just the manual's — it is the operator's, so it holds wherever the plant quotes a number to the player.** The same gate enforces it in the **live checklist and procedure steps** (`ui/manual_procedures.js`) and the **System Scanner's inspection copy** (`ui/diagram/board/pwr_board_inspect.js`): a step target reads *1194 psi (8.23 MPa)*, the PORV entry reads *2350 psi (16.20 MPa)*, the rod-AUTO deadband reads *±1.4 °F (±0.8 °C)*.

Two things stay SI, deliberately: **engine command payloads** (`cmd: { mpa: 8.23 }` is an argument, not a reading) and **developer comments** in those source files.

### Instruments vs truth

**You operate from instruments.** Gauges, alarms, and automatic protection read **instrumented** values (with lag, noise, and possible failure). True physical state is available only as an explicit diagnostic overlay. This is deliberate — it is how Three Mile Island is teachable.

### Control names

Controls are named by their **on-screen labels**, not internal command IDs. Internal commands appear only in appendix notes for developers/instructors.

---

## Recommended reading order

**New operator (first session)**

1. `02_SIMULATOR_USER_GUIDE.md` — get the board running  
2. `01_GENERAL_DESCRIPTION.md` — plant + **Modes 1–6** naming  

3. `03_CONTROLS_AND_INDICATIONS.md` (skim)  
4. `05_MODE_TRANSITIONS.md` — **PWR-T20** (Mode 5, Cold Shutdown → Mode 1, At Power) and **PWR-T03** (Mode 3, Hot Standby → Mode 1, At Power on the sim)  
5. `04_NORMAL_OPERATIONS.md` — N01–N02, N04–N06, N14  

**Mode 5, Cold Shutdown → Mode 1, At Power → Mode 5, Cold Shutdown (full commercial story)**

1. `05` §3.0 **PWR-T20** (Mode 5, Cold Shutdown → Mode 1, At Power)  
2. Operate in Mode 1, At Power (`04` power procedures)  
3. `05` §4.0 **PWR-T21** (Mode 1, At Power → Mode 5, Cold Shutdown)  

**Before free-play power maneuvers (Mode 1, At Power)**

- `03` (turbine load modes, feed, rods, CVCS)  
- `04` power raise/lower, boron/xenon  
- `09` setpoints  

**Before failure drills (typically Mode 1, At Power)**

- `06` alarm philosophy  
- `07` matching failure  
- `08` if running TMI  

---

## Relationship to in-product manuals

The live simulator also has an on-screen **Operator’s Manual** (`M` key / 📖 button) built from generated reference data and validated procedures. This `Manuals/` set is the **external, commercial-format** training library: broader narrative, mode transitions, full failure set, and commercial procedure formatting. Where numbers disagree, prefer engine/config values and note the discrepancy in `ISSUES_AND_FINDINGS.md`.

---

## Scope disclaimer

| In scope | Out of scope / narrative only |
|----------|-------------------------------|
| Hot Standby and at-power operations | Cold shutdown heatup/cooldown *rates* |
| Reactivity, pressure, level, feed, turbine | Multi-loop individual RCS loops (lumped model) |
| All modeled failures and TMI | Full containment / hydrogen / offsite dose models |
| ESF auto arms, RPS trips | Real-plant Tech Specs / licensing |

This is an **educational lumped-parameter plant**, not a full-scope replica of a licensed US PWR.
