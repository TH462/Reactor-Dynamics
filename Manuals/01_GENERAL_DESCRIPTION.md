# 01 — Plant General Description

**Document:** PWR-GD-01  
**Plant:** Pressurized Water Reactor (PWR)  
**Plant:** **SLX-100** (Single-Loop eXperimental, 100 MWe)
**Rating:** ≈ 100 MWe / ≈ 300 MWt — a compact **single-loop experimental PWR** (one reactor coolant pump, one U-tube steam generator, one main steam line). Small and generously margined by design: the ~105 % steam dump rides out a full load rejection, and reactor trips are reserved for genuine limits.  
**Revision:** 0  

---

## 1.0 Purpose

This document describes the Reactor⚛️Dynamics PWR unit: design concept, major systems, operating modes, and deliberate simplifications. Operators should read this before free-play or procedure training.

---

## 2.0 Design concept

A **Pressurized Water Reactor** keeps primary coolant water under high pressure so it **does not boil** in the core. Heat is transferred through **Steam Generators (SG)** into a separate secondary loop that produces steam for the turbine-generator.

| Parameter | Nominal (hot full power) |
|-----------|---------------------------|
| Electrical output | ≈ **100 MWe** |
| Primary pressure | **2235 psi (15.41 MPa)** |
| Average coolant temperature (Tavg) | ≈ **579.2 °F (304 °C)** |
| Hot leg / cold leg | ≈ 609.8 / 550.4 °F (321 / 288 °C) (ΔT ≈ 59.4 °F / 33 °C at rated) |
| Pressurizer (PZR) level | ≈ **55 %** |
| Steam Generator level | ≈ **65 %** |
| Secondary steam pressure | ≈ **819 psi (5.65 MPa)** |
| Subcooling margin | ≈ **73.8 °F** (41 °C) |

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
| **RHR** | Residual heat removal when cool and depressurized |

**Simplification:** Single lumped primary loop (one representative RCP/SG), uniform primary pressure (no leg ΔP model).

### 4.3 Secondary / Balance of Plant (BOP)

| System | Function |
|--------|----------|
| **Steam Generator** | Heat sink and steam source |
| **Main feed / feed pump** | Maintains SG level (manual or three-element AUTO) |
| **AFW** | Auxiliary Feedwater when main feed is lost |
| **MSIV** | Isolates SG from turbine — and from a steam line break downstream of it (PWR-E19) |
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

## 5.0 Plant MODES (Mode 1, At Power through Mode 6, Refueling)

This trainer uses **commercial PWR MODE numbers**. In prose, say **Mode 1, At Power**, **Mode 2, Startup**, … **Mode 6, Refueling**.

| MODE | Spoken name | Name | Definition (trainer) | Free Play / notes |
|------|-------------|------|----------------------|-------------------|
| **1** | **Mode 1, At Power** | Power Operation | Critical, thermal power **> 5 %**, RCS hot | `hot_full_power`, `50_percent` **[sim]** |
| **2** | **Mode 2, Startup** | Startup | Critical, power **≤ 5 %**, RCS hot | After approach to criticality **[sim]** |
| **3** | **Mode 3, Hot Standby** | Hot Standby | Subcritical, RCS hot at NOP T/P | `hot_zero_power` **[sim]** |
| **4** | **Mode 4, Hot Shutdown** | Hot Shutdown | Subcritical, intermediate RCS temperature | Heatup / cooldown transit **[sim]** |
| **5** | **Mode 5, Cold Shutdown** | Cold Shutdown | Subcritical, RCS cold | `cold_shutdown` **[sim]** — a Free Play initial condition |
| **6** | **Mode 6, Refueling** | Refueling | Head detensioned / refueling | **Out of scope** |

**Full commercial paths** (see `05_MODE_TRANSITIONS.md`) — both run **on integrated physics**, end to end on the board:

- **Mode 5, Cold Shutdown → Mode 1, At Power** — procedure **PWR-T20**, starting from the `cold_shutdown` initial condition.  
- **Mode 1, At Power → Mode 5, Cold Shutdown** — procedure **PWR-T21**, down to a cold, depressurized plant on RHR.  

**NOTE:** heatup and cooldown are deliberately **time-compressed** — the evolution is real, its duration is not. See `12_SIM_PHYSICS.md` §14.

**Sim-only everyday path:** Mode 3, Hot Standby ↔ Mode 1, At Power (**PWR-T03** / **PWR-T04**).

Post-trip with the plant still hot is still **Mode 3, Hot Standby** by temperature class (subcritical, hot), even though crews often say “hot shutdown.”

---

## 6.0 Turbine load modes (not plant MODES)

Independent of plant MODE, the generator has three **load modes**:

| Load mode | Behavior |
|-----------|----------|
| **Follow** (default) | Turbine load tracks reactor power (lagged); feed often coupled |
| **Manual** | Operator sets MWe target; feed remains coupled unless decoupled |
| **Disconnected** | 0 MWe — grid open / turbine trip; SCRAM forces this |

**Rule of thumb:** Rods lead up; turbine leads down. Mismatch floods or drains the SG.

These are **never** called Mode 1, At Power / Mode 5, Cold Shutdown.

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
| RCS loops | Multi-loop with individual RCPs | Single lumped loop — and this plant genuinely *is* single-loop |
| Cold ops (Mode 5 / Mode 4) | Multi-hour heatup/cooldown | **[sim]** on integrated physics — Free Play can start in **Mode 5, Cold Shutdown**; the full loop is **PWR-T20** / **PWR-T21**. Pacing is deliberately time-compressed. |
| Containment / dose | Full models | Not modeled — the simulation ends at fuel damage |
| Instrument channels | Redundant trains | Single sensors (can fail) — so instrument failures bite *harder* here than in a voting plant |
| Point kinetics | Spatial power shape | Point model (lumped) |
| Decay heat | Detailed groups | Two-term model (~7 % at scram after power run) |
| Natural circulation | 2–5 % flow on pump loss | **Not modeled** — flow decays to zero, so loss of flow is *more* severe here than reality |

Where the model understates reality, training commentary and these manuals say so.

**This table is a summary.** The full account — what the engine actually computes, every deliberate simplification, and everything that is not modeled at all — is `12_SIM_PHYSICS.md`.

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
