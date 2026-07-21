# 05 — Mode Transition Procedures

**Document:** PWR-MT-01  
**Title:** Plant MODE Transitions (Mode 1, At Power through Mode 6, Refueling)  
**Revision:** 2  

---

## 1.0 Purpose

Define commercial-style **plant MODES** (Mode 1, At Power … Mode 6, Refueling) for this trainer and provide procedures to move the unit between them — including the full path **Mode 5, Cold Shutdown → Mode 1, At Power** and **Mode 1, At Power → Mode 5, Cold Shutdown**.

Also covers **turbine load modes** (Follow / Manual / Disconnected), **AUTO/MAN** control, **ESF arms**, and **NIS / trip blocks**. Those are **not** plant MODE numbers.

**Related:** `04_NORMAL_OPERATIONS.md` (N procedures referenced below).

---

## 2.0 Plant MODE definitions

These MODES follow the commercial PWR (Westinghouse-style Tech Spec) structure, adapted to SI units and this trainer’s physics.

| MODE | Spoken name | Commercial name | Reactivity | Thermal power | RCS average temperature (class) | Trainer support |
|------|-------------|-----------------|------------|---------------|---------------------------------|-----------------|
| **1** | **Mode 1, At Power** | Power Operation | Critical (keff ≥ 0.99) | **> 5 %** | Hot (≥ ~177 °C / 350 °F class) | **[sim]** |
| **2** | **Mode 2, Startup** | Startup | Critical | **≤ 5 %** | Hot | **[sim]** |
| **3** | **Mode 3, Hot Standby** | Hot Standby | Subcritical (keff < 0.99) | ≈ 0 | Hot (NOP T/P ≈ 297 °C no-load / 15.41 MPa) | **[sim]** |
| **4** | **Mode 4, Hot Shutdown** | Hot Shutdown | Subcritical | ≈ 0 | Intermediate (between cold and hot) | **[sim]** (transit during heatup/cooldown) |
| **5** | **Mode 5, Cold Shutdown** | Cold Shutdown | Subcritical | ≈ 0 | Cold (≤ ~93 °C / 200 °F class) | **[sim]** — `cold_shutdown` initial condition |
| **6** | **Mode 6, Refueling** | Refueling | Deep subcritical | ≈ 0 | Cold; vessel head not fully tensioned | **Out of scope** |

### 2.1 Simulator initial-condition mapping

| Free Play / engine state | Plant MODE |
|--------------------------|------------|
| `hot_full_power` | **Mode 1, At Power** (≈ 100 % — full-power Mode 1) |
| `50_percent` | **Mode 1, At Power** (partial-power Mode 1) |
| Critical, power ≤ 5 % | **Mode 2, Startup** |
| `hot_zero_power` (Hot Standby) | **Mode 3, Hot Standby** |
| `5_percent` | **Mode 1, At Power** (low-power ~6 %, just above the 5 % boundary) |
| `cold_shutdown` | **Mode 5, Cold Shutdown** (cold, depressurized, RHR in service, subcritical) |
| Post-SCRAM, still hot | **Mode 3, Hot Standby** (hot shutdown board; still Mode 3 by temperature class) |
| Cool / depressurized on RHR | **Mode 4, Hot Shutdown** → **Mode 5, Cold Shutdown** **[sim]** |

### 2.2 What this trainer can actually step through

| Path segment | Scope |
|--------------|--------|
| Mode 3, Hot Standby → Mode 2, Startup → Mode 1, At Power | Fully **[sim]** |
| Mode 1, At Power → Mode 2, Startup → Mode 3, Hot Standby | Fully **[sim]** |
| Mode 5, Cold Shutdown → Mode 4, Hot Shutdown → Mode 3, Hot Standby | **[sim]** — start from `cold_shutdown`, pressurize + start RCPs, take critical and heat to NOP |
| Mode 3, Hot Standby → Mode 4, Hot Shutdown → Mode 5, Cold Shutdown | **[sim]** — borate, cool the secondary, depressurize, place RHR, secure RCPs |
| Mode 6, Refueling | Not modeled |

**NOTE:** The **full commercial story** Mode 5, Cold Shutdown → Mode 1, At Power → Mode 5, Cold Shutdown is now driveable **end to end on the board** from the `cold_shutdown` initial condition. Heatup/cooldown *rates* are time-compressed (the lumped model is not wall-clock accurate), and the trainer supplies the heatup with controlled low-power nuclear heat rather than the real pump-heat-dominated ramp — see the honesty notes below.

### 2.3 Turbine load modes (not plant MODES)

| Load mode | Behavior |
|-----------|----------|
| **Follow** | Electrical load tracks reactor power (lag ~45 s) |
| **Manual** | Operator sets MWe |
| **Disconnected** | 0 MWe; SCRAM forces this |

Do **not** say “Mode 1, At Power” for Follow or “Mode 5, Cold Shutdown” for Disconnected.

---

## 3.0 Master path — Mode 5, Cold Shutdown to Mode 1, At Power

**Procedure ID:** PWR-T20  
**Title:** Startup from Mode 5, Cold Shutdown to Mode 1, At Power  
**Purpose:** Take the unit from cold shutdown conditions up to power operation.

### Overview

```
Mode 5, Cold Shutdown          [sim]  ← cold_shutdown IC
        │  heatup / pressurize / draw PZR bubble
        ▼
Mode 4, Hot Shutdown           [sim]
        │  continue heatup to NOP
        ▼
Mode 3, Hot Standby           [sim]  ← Free Play starts here
        │  approach to criticality
        ▼
Mode 2, Startup                 [sim]
        │  low-power ops, turbine roll, raise power past 5 %
        ▼
Mode 1, At Power         [sim]
        │  ascend to desired power (e.g. full power)
        ▼
Mode 1, At Power at power (watchstanding)
```

### Phase A — Mode 5, Cold Shutdown → Mode 4, Hot Shutdown → Mode 3, Hot Standby **[sim, rate-compressed]**

| Step | Action | MODE after step |
|------|--------|-----------------|
| A1 | Plant in **Mode 5, Cold Shutdown**: subcritical, RCS cold, solid or bubble per commercial practice | Mode 5, Cold Shutdown |
| A2 | Fill/vent RCS; establish RCP operation when permitted; use pump heat and controlled nuclear heat | Mode 5, Cold Shutdown → Four |
| A3 | Draw and control pressurizer steam bubble; place heaters/spray in automatic | Mode 4, Hot Shutdown |
| A4 | Heat and pressurize toward normal operating temperature and pressure within commercial heatup limits | Mode 4, Hot Shutdown |
| A5 | Reach **Mode 3, Hot Standby**: subcritical, hot, P ≈ **15.41 MPa**, Tavg ≈ **297 °C** (no-load program), heat sink available | **Mode 3, Hot Standby** |

**Simulator:** Phase A is now driveable — load the **`cold_shutdown`** initial condition (**Mode 5, Cold Shutdown**) and perform the heatup: raise the pressurizer setpoint to draw up to NOP pressure (`set_pressure_setpoint`), start the RCPs (`set_rcp`), keep the turbine offline so the SG bottles to no-load, then take the control bank out gently (watch SUR) to hold low power and heat the RCS to NOP. Or **skip Phase A** by loading **Hot Standby** (`hot_zero_power`) = **Mode 3, Hot Standby**. Heatup *rate* is time-compressed and the heat source is controlled low-power nuclear heat, not the real pump-heat ramp.

### Phase B — Mode 3, Hot Standby lineup **[sim]** → PWR-N01

| Step | Action | Ref |
|------|--------|-----|
| B1 | Free Play → PWR → **Hot Standby** (Mode 3, Hot Standby) | PWR-T01 |
| B2 | Complete Mode 3, Hot Standby prerequisites and lineup | **PWR-N01** |
| B3 | Confirm subcritical, SR on, control bank in, RCP running, SG available | Mode 3, Hot Standby ready |

**Acceptance:** Board is **Mode 3, Hot Standby** (Hot Standby).

### Phase C — Mode 3, Hot Standby → Mode 2, Startup **[sim]** → PWR-N02

| Step | Action | Ref |
|------|--------|-----|
| C1 | SR→IR handoff when P-6 met; withdraw Control Bank watching SUR | **PWR-N02** |
| C2 | Achieve criticality; hold power **≤ 5 %** | — |
| C3 | Declare **Mode 2, Startup** when critical and power ≤ 5 % | Mode 2, Startup |

**Acceptance:** Critical; power ≤ 5 %; SUR controlled → **Mode 2, Startup**.

### Phase D — Mode 2, Startup → Mode 1, At Power **[sim]** → PWR-N04, N05, N06

| Step | Action | Ref |
|------|--------|-----|
| D1 | Stable low-power ops in Mode 2, Startup | **PWR-N04** |
| D2 | Turbine roll / synchronization; begin loading | **PWR-N05** |
| D3 | Raise power **above 5 %** — plant enters **Mode 1, At Power** | **PWR-N06** / **N07** |
| D4 | Continue ascension to desired Mode 1, At Power power (50 %, 100 %, etc.) | **PWR-N06** |
| D5 | Place normal AUTO suite (feed, PZR, optional rods, load Follow) | **PWR-T10** |

**Acceptance:** Critical, power > 5 %, turbine supporting load as intended → **Mode 1, At Power**.

### Phase E — Mode 1, At Power at full power (optional)

| Step | Action | Acceptance |
|------|--------|------------|
| E1 | Ascend to ~100 % / ~100 MWe | Full-power **Mode 1, At Power** |
| E2 | Verify P ≈ 15.41 MPa, SG ~65 %, PZR ~55 %, subcooling healthy | HFP band |

---

## 4.0 Master path — Mode 1, At Power to Mode 5, Cold Shutdown

**Procedure ID:** PWR-T21  
**Title:** Shutdown from Mode 1, At Power to Mode 5, Cold Shutdown  
**Purpose:** Take the unit from power operation down to cold shutdown conditions.

### Overview

```
Mode 1, At Power         [sim]
        │  reduce power / off-load turbine
        ▼
Mode 2, Startup                 [sim]  (optional plateau ≤ 5 %)
        │  SCRAM or full insertion
        ▼
Mode 3, Hot Standby           [sim]
        │  decay heat removal; begin cooldown story
        ▼
Mode 4, Hot Shutdown           [sim]
        │  continue cooldown / depressurize; RHR
        ▼
Mode 5, Cold Shutdown          [sim]  ← genuine cold end state
```

### Phase A — Mode 1, At Power → Mode 2, Startup / Mode 3, Hot Standby **[sim]**

| Step | Action | Ref |
|------|--------|-----|
| A1 | In **Mode 1, At Power**, reduce Turbine Load and reactor power in steps | **PWR-N08** |
| A2 | Optional: hold briefly in **Mode 2, Startup** (critical, ≤ 5 %) | — |
| A3 | Take turbine to 0 MWe / Disconnected | Turbine-Generator |
| A4 | SCRAM (or controlled shutdown then trip) | **PWR-N14** |
| A5 | Confirm subcritical, hot, heat sink available → **Mode 3, Hot Standby** | **PWR-T06** |

**Acceptance:** Reactor shut down; RCS still hot → **Mode 3, Hot Standby**.

### Phase B — Mode 3, Hot Standby hold **[sim]**

| Step | Action | Acceptance |
|------|--------|------------|
| B1 | Maintain SG level (feed or AFW) for decay heat | Heat sink held |
| B2 | Hold PZR pressure/level; subcooling healthy | Stable Mode 3, Hot Standby |
| B3 | Leave HPI/AFW ESF arms intentional | Known ESF state |

This is the deepest **fully simulated** shutdown state.

### Phase C — Mode 3, Hot Standby → Mode 4, Hot Shutdown → Mode 5, Cold Shutdown **[sim, rate-compressed]**

| Step | Action | MODE after step |
|------|--------|-----------------|
| C1 | Borate to cold-shutdown margin (commercial) | Mode 3, Hot Standby |
| C2 | Cooldown and depressurize within limits using steam dump / AFW / secondary | Mode 4, Hot Shutdown |
| C3 | Place **RHR/DHR** in service when pressure/temperature permit | Mode 4, Hot Shutdown |
| C4 | Continue to cold conditions (Tavg ≤ ~93 °C class) | **Mode 5, Cold Shutdown** |
| C5 | Secure secondary as appropriate; solid plant / cold solid per commercial practice | Mode 5, Cold Shutdown |

**Simulator:** This is now driveable to a genuine cold end state: borate for shutdown margin, lower the steam-dump setpoint (`set_steam_dump_setpoint`) to cool the secondary and with it the primary, depressurize in step (`set_pressure_setpoint`, spray) keeping subcooling positive, place **RHR On** below the 2.76 MPa interlock, and **secure the RCPs** (`set_rcp`) so RHR draws the RCS to cold. Once RHR carries the cooldown, set its pace with **RHR Cooldown Rate (HX flow split)** (`set_rhr_hx`) — walk it up to hold the ~**50 °C/h** cooldown limit rather than opening full-through-the-exchanger on a hot plant. The cold end state matches the `cold_shutdown` IC. Cooldown *rate* is time-compressed. **PWR-N15** is the companion procedure.

---

## 5.0 Individual MODE transition procedures

### PWR-T01 — Enter Free Play in Mode 3, Hot Standby

| Step | Action |
|------|--------|
| 1 | Plant & Mission → **PWR** → Free Play |
| 2 | Initial condition **Hot Standby** |
| 3 | Confirm **Mode 3, Hot Standby**: subcritical, hot, SR on, control bank inserted |
| 4 | Speed 1×; Play; perform **PWR-N01** |

### PWR-T02 — Enter Free Play in Mode 1, At Power

| Step | Action |
|------|--------|
| 1 | Plant & Mission → **PWR** → Free Play |
| 2 | **Hot Full Power** or **50 % Power** |
| 3 | Confirm **Mode 1, At Power**: critical, power > 5 %, MWe as expected |
| 4 | Note turbine load mode (default Follow) |

### PWR-T03 — Mode 3, Hot Standby → Mode 1, At Power (sim path)

| Step | Transition | Procedure |
|------|------------|-----------|
| 1 | Mode 3, Hot Standby → Mode 2, Startup | **PWR-N02** |
| 2 | Mode 2, Startup low-power hold | **PWR-N04** |
| 3 | Turbine on line | **PWR-N05** |
| 4 | Power > 5 % → **Mode 1, At Power** | **PWR-N06** |
| 5 | Desired Mode 1, At Power power | **PWR-N07** / N06 |
| 6 | AUTO suite | **PWR-T10** |

**Abort:** Uncontrolled SUR → insert rods; any RPS trip → **PWR-T06** (remain/return Mode 3, Hot Standby).

### PWR-T04 — Mode 1, At Power → Mode 3, Hot Standby (controlled)

| Step | Action | Ref |
|------|--------|-----|
| 1 | Reduce power (still Mode 1, At Power while > 5 %) | **PWR-N08** |
| 2 | Pass ≤ 5 % critical → **Mode 2, Startup** (optional hold) | — |
| 3 | Off-load turbine; SCRAM | **PWR-N14** |
| 4 | Stabilize hot, subcritical → **Mode 3, Hot Standby** | **PWR-T06** |

### PWR-T05 — Mode 1, At Power power increase (stay in Mode 1, At Power)

Raise power within Mode 1, At Power (e.g. 50 % → 100 %). See **PWR-N06** / **N07**. MODE number does not change.

### PWR-T06 — Mode 1, At Power (or Two) → Mode 3, Hot Standby by trip

| Step | Action |
|------|--------|
| 1 | Verify SCRAM — rods in, power falling |
| 2 | Verify turbine **Disconnected** |
| 3 | Heat sink: SG level / **AFW** |
| 4 | Inventory / subcooling / HPI as needed |
| 5 | Declare **Mode 3, Hot Standby** when subcritical and RCS still hot |

### PWR-T20 — Mode 5, Cold Shutdown → Mode 1, At Power

See **§3.0** (full master path).

### PWR-T21 — Mode 1, At Power → Mode 5, Cold Shutdown

See **§4.0** (full master path).

### PWR-T22 — Mode 2, Startup → Mode 3, Hot Standby (reject startup)

| Step | Action |
|------|--------|
| 1 | From Mode 2, Startup, insert rods or SCRAM |
| 2 | Confirm subcritical |
| 3 | Hold hot → **Mode 3, Hot Standby** |

### PWR-T23 — Mode 3, Hot Standby → Mode 2, Startup only (criticality practice)

| Step | Action |
|------|--------|
| 1 | **PWR-N01** then **PWR-N02** |
| 2 | Hold power ≤ 5 % |
| 3 | Do not enter Mode 1, At Power until ready |

---

## 6.0 Turbine load mode transitions (at Mode 1, At Power)

These change **grid/turbine** state, not plant MODE (you remain Mode 1, At Power if still critical > 5 %).

### PWR-T07 — Follow → Manual

1. Select **Manual** on Turbine-Generator.  
2. Set MWe near current output, then ramp slowly.  
3. Match reactor power; keep feed AUTO.  

**CAUTION:** Large step cuts can trip the plant back toward Mode 3, Hot Standby.

### PWR-T08 — Manual → Follow

1. Stabilize power.  
2. Select **Follow**.  
3. Confirm load tracks reactor power.  

### PWR-T09 — → Disconnected

1. Prefer power reduction first if controlled.  
2. Disconnect / turbine trip / or SCRAM.  
3. If SCRAM: plant → **Mode 3, Hot Standby**; load Disconnected.  

---

## 7.0 Control and ESF mode transitions

### PWR-T10 — Normal AUTO suite in Mode 1, At Power

| Channel | State |
|---------|-------|
| Feed → SG level | AUTO |
| PZR pressure | AUTO |
| CVCS make-up | AUTO |
| Turbine | Follow or Manual per dispatch |
| Rods → Tavg | AUTO optional (capture T-ref carefully) |
| Steam dump | AUTO |
| HPI / AFW ESF | AUTO unless testing |

### PWR-T11 — Single channel AUTO → MANUAL

Operate underlying control or select MAN; re-engage AUTO when stable.

### PWR-T12 — ESF MANUAL → re-arm AUTO

Press AUTO on Emergency card after manual intervention. Standing start conditions may fire immediately.

### PWR-T13 — SR → IR handoff (Mode 3, Hot Standby / Mode 2, Startup startup)

IR ≥ 1e-10 A (P-6) → SR Off. Required before Mode 2, Startup power rise trips SR.

### PWR-T14 — Startup trip blocks (entering Mode 1, At Power)

Above **P-10 (10 %)** — already Mode 1, At Power — block IR high / PR 25 % low-setpoint as needed. Auto-reinstate below P-10.

### PWR-T15 — Learning ↔ Realistic display

Training display only; does not change plant MODE.

---

## 8.0 Transition map

```
 Mode 6, Refueling     OUT OF SCOPE
        │
 Mode 5, Cold Shutdown ──────── [sim] heatup ─────────┐
        ▲                                                 │
        │ [sim] cooldown                                  ▼
 Mode 4, Hot Shutdown ◄─────────────────────── Mode 3, Hot Standby  [sim]
        ▲                                                 │
        │                                                 │ N02 [sim]
        │                                                 ▼
        │                                          Mode 2, Startup  [sim]
        │                                                 │
        │ N14 / trip                                      │ N04–N06 [sim]
        │                                                 ▼
        └─────────────── Mode 1, At Power  [sim] ── full power
```

**Operator goal paths:**

| Goal | Procedure |
|------|-----------|
| Cold to power | **PWR-T20** Mode 5, Cold Shutdown → Mode 1, At Power |
| Power to cold | **PWR-T21** Mode 1, At Power → Mode 5, Cold Shutdown |
| Hot standby to power (sim-only) | **PWR-T03** Mode 3, Hot Standby → Mode 1, At Power |
| Power to hot standby (sim-only) | **PWR-T04** Mode 1, At Power → Mode 3, Hot Standby |

---

## 9.0 Related documents

- `04_NORMAL_OPERATIONS.md` — N01–N15 aligned to MODES  
- `01_GENERAL_DESCRIPTION.md` — MODE table  
- `09_SETPOINTS_LIMITS.md` — Mode 1, At Power / Mode 3, Hot Standby normals  
- `10_GLOSSARY.md` — MODE definitions  
