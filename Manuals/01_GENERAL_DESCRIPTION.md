# 01 — Plant General Description

**Document:** PWR-GD-01  
**Plant:** Pressurized Water Reactor (PWR)  
**Rating:** ≈ 1000 MWe  
**Revision:** 0  

---

## 1.0 Purpose

This document describes the Reactor⚛️Dynamics PWR unit: design concept, major systems, operating modes, and deliberate simplifications. Operators should read this before free-play or procedure training.

---

## 2.0 Design concept

A **Pressurized Water Reactor** keeps primary coolant water under high pressure so it **does not boil** in the core. Heat is transferred through **Steam Generators (SG)** into a separate secondary loop that produces steam for the turbine-generator.

| Parameter | Nominal (hot full power) |
|-----------|---------------------------|
| Electrical output | ≈ **1000 MWe** |
| Primary pressure | **15.41 MPa** |
| Average coolant temperature (Tavg) | ≈ **304 °C** |
| Hot leg / cold leg | ≈ 321 / 288 °C (ΔT ≈ 33 °C at rated) |
| Pressurizer (PZR) level | ≈ **55 %** |
| Steam Generator level | ≈ **65 %** |
| Secondary steam pressure | ≈ **5.65 MPa** |
| Subcooling margin | ≈ **41 °C** |

**Why high primary pressure?** Subcooling margin (how far the coolant is from boiling) is the plant’s guarantee that the primary stays liquid. Lose pressure or overheat the coolant, and boiling (voids) begins — the lesson behind Three Mile Island.

---

## 3.0 Energy path (what the operator is controlling)

```
FISSION HEAT (core)
    → Primary coolant (hot leg → SG U-tubes → cold leg → RCP → core)
    → Steam Generator (secondary boils; loops never mix)
    → Main steam → Turbine-Generator → Grid (MWe)
    → Condenser → Feed pumps → SG
```

**Pressurizer (PZR)** sits on the hot leg: heaters raise pressure, spray lowers it, and the Power-Operated Relief Valve (PORV) with block valve protects / can mislead.

**Negative feedbacks** (Doppler and Moderator Temperature Coefficient) make the plant self-regulating: hotter fuel and hotter moderator reduce reactivity. Power tends to follow steam demand.

---

## 4.0 Major systems

### 4.1 Reactor core and reactivity control

| System | Function |
|--------|----------|
| **Control bank** | Operable rods — withdraw to add reactivity, insert to remove |
| **Shutdown bank** | Parked fully withdrawn at power; drives in on SCRAM only (read-only to operator) |
| **Boron (CVCS chemical shim)** | Dissolved neutron absorber — borate lowers power, dilute raises power (slow) |
| **Nuclear Instrumentation (NIS)** | Source Range (SR), Intermediate Range (IR), Power Range (PR) |

**Simplification:** One control group + one shutdown group (no multi-bank overlap sequencing).

### 4.2 Reactor Coolant System (RCS) / primary

| System | Function |
|--------|----------|
| **RCP** | Forced circulation; spray effectiveness depends on RCP flow |
| **Pressurizer** | Pressure control (heaters / spray / PORV / spring safeties) |
| **CVCS** | Charging, letdown, boron adjust, inventory make-up |
| **HPI/LPI** | Merged emergency injection (high-head trickle, high volume at low pressure) |
| **Accumulators** | Passive injection when primary pressure falls low enough |
| **RHR / DHR** | Residual / decay heat removal when cool and depressurized |

**Simplification:** Single lumped primary loop (one representative RCP/SG), uniform primary pressure (no leg ΔP model).

### 4.3 Secondary / Balance of Plant (BOP)

| System | Function |
|--------|----------|
| **Steam Generator** | Heat sink and steam source |
| **Main feed / feed pump** | Maintains SG level (manual or three-element AUTO) |
| **AFW** | Auxiliary Feedwater when main feed is lost |
| **MSIV** | Isolates SG from turbine |
| **Turbine-generator** | Electrical output; load modes Follow / Manual / Disconnected |
| **Steam dump** | Bypass steam to condenser on load rejection |
| **Condenser** | Vacuum must be healthy or turbine trips |

### 4.4 Protection and safety automation

| Layer | Role |
|-------|------|
| **RPS (Reactor Protection)** | SCRAM on trip setpoints (reads instruments) |
| **ESF arms (HPI, AFW, RHR)** | AUTO or MANUAL; manual action disarms AUTO until re-armed |
| **Alarms** | Annunciate before / with trips; read instruments only |
| **Interlocks** | e.g. rod withdrawal blocked on high Startup Rate (SUR) |

---

## 5.0 Plant MODES (Mode One through Mode Six)

This trainer uses **commercial PWR MODE numbers**. In prose, say **Mode One**, **Mode Two**, … **Mode Six**.

| MODE | Spoken name | Name | Definition (trainer) | Free Play / notes |
|------|-------------|------|----------------------|-------------------|
| **1** | **Mode One** | Power Operation | Critical, thermal power **> 5 %**, RCS hot | `hot_full_power`, `50_percent` **[sim]** |
| **2** | **Mode Two** | Startup | Critical, power **≤ 5 %**, RCS hot | After approach to criticality **[sim]** |
| **3** | **Mode Three** | Hot Standby | Subcritical, RCS hot at NOP T/P | `hot_zero_power` **[sim]** |
| **4** | **Mode Four** | Hot Shutdown | Subcritical, intermediate RCS temperature | Cooldown path **[narr]** |
| **5** | **Mode Five** | Cold Shutdown | Subcritical, RCS cold | **[narr]** only — no cold IC |
| **6** | **Mode Six** | Refueling | Head detensioned / refueling | **Out of scope** |

**Full commercial paths** (see `05_MODE_TRANSITIONS.md`):

- **Mode Five → Mode One** — procedure **PWR-T20** (heatup narrative, then sim from Mode Three).  
- **Mode One → Mode Five** — procedure **PWR-T21** (sim down to Mode Three, then cooldown narrative).  

**Sim-only everyday path:** Mode Three ↔ Mode One (**PWR-T03** / **PWR-T04**).

Post-trip with the plant still hot is still **Mode Three** by temperature class (subcritical, hot), even though crews often say “hot shutdown.”

---

## 6.0 Turbine load modes (not plant MODES)

Independent of plant MODE, the generator has three **load modes**:

| Load mode | Behavior |
|-----------|----------|
| **Follow** (default) | Turbine load tracks reactor power (lagged); feed often coupled |
| **Manual** | Operator sets MWe target; feed remains coupled unless decoupled |
| **Disconnected** | 0 MWe — grid open / turbine trip; SCRAM forces this |

**Rule of thumb:** Rods lead up; turbine leads down. Mismatch floods or drains the SG.

These are **never** called Mode One / Mode Five.

---

## 7.0 What the operator never sees by default

| Hidden / diagnostic | Why it matters |
|---------------------|----------------|
| True `porv_open` vs commanded `porv_indicator` | TMI deception |
| True core inventory / void fraction | Level can rise while inventory falls |
| Fuel temperature (raw) | Shown only as contextual status in Learning mode |
| Physics Overlay fields | Reactivity pcm, period, etc. — Learning + overlay |

**Golden rule:** Trust **subcooling margin** and diverse indications more than any single light.

---

## 8.0 Deliberate simplifications (honest scope)

| Topic | Real plant | This trainer |
|-------|------------|--------------|
| Rod banks | Multiple banks + overlap | One control + one shutdown |
| RCS loops | Multi-loop with individual RCPs | Single lumped loop |
| Cold ops (Mode Five / Four) | Multi-hour heatup/cooldown | **[narr]** only — Free Play starts Mode Three |
| Containment / dose | Full models | Not modeled |
| Instrument channels | Redundant trains | Single sensors (can fail) |
| Point kinetics | Spatial power shape | Point model (lumped) |
| Decay heat | Detailed groups | Two-term model (~7 % at scram after power run) |

Where the model understates reality, training commentary and these manuals say so.

---

## 9.0 Flagship accident

**Three Mile Island Unit 2 (1979)** is hosted on this plant. Root teaching theme: **an accident of information** — a stuck-open PORV with an indicator that read closed, pressurizer level that rose while inventory fell, and operators who throttled High-Pressure Injection (HPI) based on the wrong story.

See `08_ACCIDENT_TMI.md` and procedure **PWR-X01**.

---

## 10.0 Related documents

- `02_SIMULATOR_USER_GUIDE.md` — using the trainer  
- `03_CONTROLS_AND_INDICATIONS.md` — board inventory  
- `09_SETPOINTS_LIMITS.md` — numbers  
- `10_GLOSSARY.md` — terms  
