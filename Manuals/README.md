# Reactor⚛️Dynamics — PWR Operator’s Manual Set

**Plant:** Pressurized Water Reactor (PWR)  
**Trainer:** Reactor⚛️Dynamics educational plant simulator  
**Document set:** Commercial-style operating manuals for training use  
**Revision:** 24  
**Date:** 2026-10-02  

---

## Purpose

This folder contains the **operator’s manuals** for the PWR unit of Reactor⚛️Dynamics. They are written in the style of commercial nuclear power plant operating manuals: numbered procedures, prerequisites, precautions, step-by-step actions, and acceptance criteria.

They cover:

1. How to **use the simulator** (HMI, plant MODES, missions, tools).
2. How to **operate the plant** (every control, normal evolutions, **Mode 1, At Power** through **Mode 5, Cold Shutdown** transitions).
3. How to **respond** to alarms, upsets, and accidents (including Three Mile Island).

**Primary operator paths:** take the plant **Mode 4, Hot Shutdown → Mode 1, At Power** and **Mode 1, At Power → Mode 5, Cold Shutdown** (power operation to cold shutdown). See `05_MODE_TRANSITIONS.md` procedures **PWR-T20** and **PWR-T21**.

These manuals are written from the simulator as it is built, and they are the operator's manual for this plant: the in-app Manual shows exactly this text. They are training documents, **not** licensing basis documents for a real nuclear plant.

---

## Document map

| Chapter | Use when… |
|---------|-----------|
| [01 · Plant general description](01_GENERAL_DESCRIPTION.md) | Learning what a PWR is and how this plant is modeled |
| [02 · Simulator user guide](02_SIMULATOR_USER_GUIDE.md) | Starting the trainer, the board layout, Free Play, Walkthroughs and Lessons |
| [03 · Controls & indications](03_CONTROLS_AND_INDICATIONS.md) | Operating any individual control or reading any gauge |
| [04 · Normal operating procedures](04_NORMAL_OPERATIONS.md) | Startup, power operation, shutdown, system control procedures |
| [05 · Mode transition procedures](05_MODE_TRANSITIONS.md) | Mode 5, Cold Shutdown ↔ Mode 1, At Power; Mode 3, Hot Standby ↔ Mode 1, At Power; load changes |
| [06 · Alarm response procedures](06_ALARM_RESPONSE.md) | Responding to each annunciator |
| [07 · Abnormal & emergency procedures](07_ABNORMAL_EMERGENCY.md) | Managing every failure you can inject |
| [08 · Accident study — TMI-2](08_ACCIDENT_TMI.md) | Studying the 1979 accident |
| [09 · Setpoints & limits](09_SETPOINTS_LIMITS.md) | Looking up trips, actuations, alarms, normal values |
| [10 · Glossary](10_GLOSSARY.md) | Looking up acronyms and terms |
| [11 · Campaign ↔ manuals map](11_CAMPAIGN_CROSSWALK.md) | Matching missions to procedures |
| [12 · Simulation physics & model scope](12_SIM_PHYSICS.md) | Asking what the sim actually computes, what it simplifies, and what it does not model at all |
| [Revision history](00_REVISION_HISTORY.md) | Checking what changed in the manual set |

---

## Conventions used in these manuals

### Procedure numbering

| Prefix | Meaning | Example |
|--------|---------|---------|
| **PWR-N##** | Normal operations | PWR-N03 Approach to criticality |
| **PWR-T##** | Plant MODE transitions | PWR-T03 Mode 3, Hot Standby → Mode 1, At Power; PWR-T20 Mode 4, Hot Shutdown → Mode 1, At Power |
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
| **5** | **Mode 5, Cold Shutdown** | Subcritical, cold | [sim] |
| **6** | **Mode 6, Refueling** | Head detensioned / refueling | Out of scope |

Do **not** confuse plant MODES with **turbine load modes** (Follow / Manual / Disconnected).

Mission ↔ procedure map: [11 · Campaign ↔ manuals map](11_CAMPAIGN_CROSSWALK.md).

### Units

**These manuals quote US customary units first, with SI in parentheses** — `2235 psi (15.41 MPa)`, `579.2 °F (304 °C)`. US first because that is what the PWR board reads; SI alongside because that is what the engine computes in, and what every setpoint in the source is written in.

| Quantity | US | SI | Conversion |
|----------|----|----|------------|
| Pressure | **psi** — always absolute | MPa | × 145.038, whole psi |
| Temperature | **°F** | °C | × 9/5 + 32, 1 dp |
| Temperature **difference** | **°F** | °C | **× 9/5, no offset** — 1 dp |
| Condenser vacuum | **inHg** | kPa | × 0.2953, 1 dp |
| Level, power, flow | % / normalized — no conversion | | |

**Every pressure is absolute.** The board and these manuals write **psi** and mean absolute pressure — the accumulator nitrogen, the containment and the steam generator included. A real plant's gauges mostly read **psig**, about 14.7 psi lower; where a manual quotes a real-plant document's number it keeps that document's **psig** and says so.

**The difference row is not a footnote.** Subcooling margin, leg ΔT, DNB margin, control deadbands and cooldown *rates* are temperature **differences**: this plant at full power carries a subcooling margin of about **42.7 °F** (23.7 °C) — applying the absolute rule instead would print **74.7 °F** and make a thin margin look comfortable.

Reactivity (pcm, Δk/k), startup rate (DPM), counts (cps), currents (A) and time have no US/SI distinction and are quoted once.

### Instruments vs truth

**You operate from instruments.** Gauges, alarms, and automatic protection read **instrumented** values (with lag, noise, and possible failure). True physical state is available only as an explicit diagnostic overlay. This is deliberate — it is how Three Mile Island is teachable.

### Control names

Controls are named by their **on-screen labels**. Internal command names appear only in the command cross-reference at the end of chapter 03.

---

## Recommended reading order

**New operator (first session)**

1. **02** Simulator user guide — get the board running  
2. **01** Plant general description — the plant and the **Mode 1–6** naming  
3. **03** Controls & indications (skim)  
4. **05** Mode transitions — **PWR-T20** (Mode 5, Cold Shutdown → Mode 1, At Power) and **PWR-T03** (Mode 3, Hot Standby → Mode 1, At Power)  
5. **04** Normal operations — N01–N02, N04–N06, N14  

**Mode 5, Cold Shutdown → Mode 1, At Power → Mode 5, Cold Shutdown (the full story)**

1. **05** §3.0 **PWR-T20** (Mode 5, Cold Shutdown → Mode 1, At Power)  
2. Operate in Mode 1, At Power (**04** power procedures)  
3. **05** §4.0 **PWR-T21** (Mode 1, At Power → Mode 5, Cold Shutdown)  

**Before free-play power maneuvers (Mode 1, At Power)**

- **03** (turbine load modes, feed, rods, CVCS)  
- **04** power raise/lower, boron  
- **09** setpoints  

**Before failure drills (typically Mode 1, At Power)**

- **06** alarm philosophy  
- **07** the matching failure  
- **08** if running TMI  

---

## Where the numbers come from

Every number in this set is meant to match the simulator. Where a manual and the board disagree, the board is right and the manual is stale: tell us with **Feedback** in the top bar.

---

## Scope disclaimer

| In scope | Out of scope / narrative only |
|----------|-------------------------------|
| Mode 5, Cold Shutdown through full power, and back | Mode 6, Refueling |
| Reactivity, pressure, level, feed, turbine | More than one reactor coolant loop (this plant has one) |
| Every injectable failure, TMI, and the containment response | Offsite dose / source-term / release models |
| ESF auto arms, RPS trips | Real-plant Tech Specs / licensing |

This is an **educational lumped-parameter plant**, not a full-scope replica of a licensed US PWR.
