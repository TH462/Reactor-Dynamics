# 05 — Mode Transition Procedures

**Document:** PWR-MT-01  
**Title:** Plant MODE Transitions (Mode One through Mode Six)  
**Revision:** 1  

---

## 1.0 Purpose

Define commercial-style **plant MODES** (Mode One … Mode Six) for this trainer and provide procedures to move the unit between them — including the full path **Mode Five → Mode One** and **Mode One → Mode Five**.

Also covers **turbine load modes** (Follow / Manual / Disconnected), **AUTO/MAN** control, **ESF arms**, and **NIS / trip blocks**. Those are **not** plant MODE numbers.

**Related:** `04_NORMAL_OPERATIONS.md` (N procedures referenced below).

---

## 2.0 Plant MODE definitions

These MODES follow the commercial PWR (Westinghouse-style Tech Spec) structure, adapted to SI units and this trainer’s physics.

| MODE | Spoken name | Commercial name | Reactivity | Thermal power | RCS average temperature (class) | Trainer support |
|------|-------------|-----------------|------------|---------------|---------------------------------|-----------------|
| **1** | **Mode One** | Power Operation | Critical (keff ≥ 0.99) | **> 5 %** | Hot (≥ ~177 °C / 350 °F class) | **[sim]** |
| **2** | **Mode Two** | Startup | Critical | **≤ 5 %** | Hot | **[sim]** |
| **3** | **Mode Three** | Hot Standby | Subcritical (keff < 0.99) | ≈ 0 | Hot (NOP T/P ≈ 304 °C / 15.41 MPa) | **[sim]** |
| **4** | **Mode Four** | Hot Shutdown | Subcritical | ≈ 0 | Intermediate (between cold and hot) | **[narr]** / post-trip cooling path |
| **5** | **Mode Five** | Cold Shutdown | Subcritical | ≈ 0 | Cold (≤ ~93 °C / 200 °F class) | **[narr]** only |
| **6** | **Mode Six** | Refueling | Deep subcritical | ≈ 0 | Cold; vessel head not fully tensioned | **Out of scope** |

### 2.1 Simulator initial-condition mapping

| Free Play / engine state | Plant MODE |
|--------------------------|------------|
| `hot_full_power` | **Mode One** (≈ 100 % — full-power Mode One) |
| `50_percent` | **Mode One** (partial-power Mode One) |
| Critical, power ≤ 5 % | **Mode Two** |
| `hot_zero_power` (Hot Standby) | **Mode Three** |
| Post-SCRAM, still hot | **Mode Three** (hot shutdown board; still Mode Three by temperature class) |
| Cool / depressurized on RHR story | **Mode Four** → **Mode Five** **[narr]** |

### 2.2 What this trainer can actually step through

| Path segment | Scope |
|--------------|--------|
| Mode Three → Mode Two → Mode One | Fully **[sim]** |
| Mode One → Mode Two → Mode Three | Fully **[sim]** |
| Mode Five → Mode Four → Mode Three | **[narr]** (no cold IC / heatup rate) |
| Mode Three → Mode Four → Mode Five | **[narr]** (no cooldown rate) |
| Mode Six | Not modeled |

**NOTE:** You can still **train the full commercial story** Mode Five → Mode One → Mode Five by reading the **[narr]** segments, then driving every **[sim]** segment on the board.

### 2.3 Turbine load modes (not plant MODES)

| Load mode | Behavior |
|-----------|----------|
| **Follow** | Electrical load tracks reactor power (lag ~45 s) |
| **Manual** | Operator sets MWe |
| **Disconnected** | 0 MWe; SCRAM forces this |

Do **not** say “Mode One” for Follow or “Mode Five” for Disconnected.

---

## 3.0 Master path — Mode Five to Mode One

**Procedure ID:** PWR-T20  
**Title:** Startup from Mode Five (Cold Shutdown) to Mode One (Power Operation)  
**Purpose:** Take the unit from cold shutdown conditions up to power operation.

### Overview

```
Mode Five (Cold Shutdown)          [narr]
        │  heatup / pressurize / draw PZR bubble
        ▼
Mode Four (Hot Shutdown)           [narr]
        │  continue heatup to NOP
        ▼
Mode Three (Hot Standby)           [sim]  ← Free Play starts here
        │  approach to criticality
        ▼
Mode Two (Startup)                 [sim]
        │  low-power ops, turbine roll, raise power past 5 %
        ▼
Mode One (Power Operation)         [sim]
        │  ascend to desired power (e.g. full power)
        ▼
Mode One at power (watchstanding)
```

### Phase A — Mode Five → Mode Four → Mode Three **[narr]**

| Step | Action | MODE after step |
|------|--------|-----------------|
| A1 | Plant in **Mode Five**: subcritical, RCS cold, solid or bubble per commercial practice | Mode Five |
| A2 | Fill/vent RCS; establish RCP operation when permitted; use pump heat and controlled nuclear heat | Mode Five → Four |
| A3 | Draw and control pressurizer steam bubble; place heaters/spray in automatic | Mode Four |
| A4 | Heat and pressurize toward normal operating temperature and pressure within commercial heatup limits | Mode Four |
| A5 | Reach **Mode Three**: subcritical, hot, P ≈ **15.41 MPa**, Tavg ≈ **304 °C**, heat sink available | **Mode Three** |

**Simulator:** There is no cold initial condition. **Skip Phase A in Free Play** by loading **Hot Standby** (`hot_zero_power`) = **Mode Three**. Read Phase A for commercial context only.

### Phase B — Mode Three lineup **[sim]** → PWR-N01

| Step | Action | Ref |
|------|--------|-----|
| B1 | Free Play → PWR → **Hot Standby** (Mode Three) | PWR-T01 |
| B2 | Complete Mode Three prerequisites and lineup | **PWR-N01** |
| B3 | Confirm subcritical, SR on, control bank in, RCP running, SG available | Mode Three ready |

**Acceptance:** Board is **Mode Three** (Hot Standby).

### Phase C — Mode Three → Mode Two **[sim]** → PWR-N02

| Step | Action | Ref |
|------|--------|-----|
| C1 | SR→IR handoff when P-6 met; withdraw Control Bank watching SUR | **PWR-N02** |
| C2 | Achieve criticality; hold power **≤ 5 %** | — |
| C3 | Declare **Mode Two** when critical and power ≤ 5 % | Mode Two |

**Acceptance:** Critical; power ≤ 5 %; SUR controlled → **Mode Two**.

### Phase D — Mode Two → Mode One **[sim]** → PWR-N04, N05, N06

| Step | Action | Ref |
|------|--------|-----|
| D1 | Stable low-power ops in Mode Two | **PWR-N04** |
| D2 | Turbine roll / synchronization; begin loading | **PWR-N05** |
| D3 | Raise power **above 5 %** — plant enters **Mode One** | **PWR-N06** / **N07** |
| D4 | Continue ascension to desired Mode One power (50 %, 100 %, etc.) | **PWR-N06** |
| D5 | Place normal AUTO suite (feed, PZR, optional rods, load Follow) | **PWR-T10** |

**Acceptance:** Critical, power > 5 %, turbine supporting load as intended → **Mode One**.

### Phase E — Mode One at full power (optional)

| Step | Action | Acceptance |
|------|--------|------------|
| E1 | Ascend to ~100 % / ~1000 MWe | Full-power **Mode One** |
| E2 | Verify P ≈ 15.41 MPa, SG ~65 %, PZR ~55 %, subcooling healthy | HFP band |

---

## 4.0 Master path — Mode One to Mode Five

**Procedure ID:** PWR-T21  
**Title:** Shutdown from Mode One (Power Operation) to Mode Five (Cold Shutdown)  
**Purpose:** Take the unit from power operation down to cold shutdown conditions.

### Overview

```
Mode One (Power Operation)         [sim]
        │  reduce power / off-load turbine
        ▼
Mode Two (Startup)                 [sim]  (optional plateau ≤ 5 %)
        │  SCRAM or full insertion
        ▼
Mode Three (Hot Standby)           [sim]
        │  decay heat removal; begin cooldown story
        ▼
Mode Four (Hot Shutdown)           [narr]
        │  continue cooldown / depressurize; RHR
        ▼
Mode Five (Cold Shutdown)          [narr]
```

### Phase A — Mode One → Mode Two / Mode Three **[sim]**

| Step | Action | Ref |
|------|--------|-----|
| A1 | In **Mode One**, reduce Turbine Load and reactor power in steps | **PWR-N08** |
| A2 | Optional: hold briefly in **Mode Two** (critical, ≤ 5 %) | — |
| A3 | Take turbine to 0 MWe / Disconnected | Turbine-Generator |
| A4 | SCRAM (or controlled shutdown then trip) | **PWR-N14** |
| A5 | Confirm subcritical, hot, heat sink available → **Mode Three** | **PWR-T06** |

**Acceptance:** Reactor shut down; RCS still hot → **Mode Three**.

### Phase B — Mode Three hold **[sim]**

| Step | Action | Acceptance |
|------|--------|------------|
| B1 | Maintain SG level (feed or AFW) for decay heat | Heat sink held |
| B2 | Hold PZR pressure/level; subcooling healthy | Stable Mode Three |
| B3 | Leave HPI/AFW ESF arms intentional | Known ESF state |

This is the deepest **fully simulated** shutdown state.

### Phase C — Mode Three → Mode Four → Mode Five **[narr]**

| Step | Action | MODE after step |
|------|--------|-----------------|
| C1 | Borate to cold-shutdown margin (commercial) | Mode Three |
| C2 | Cooldown and depressurize within limits using steam dump / AFW / secondary | Mode Four |
| C3 | Place **RHR/DHR** in service when pressure/temperature permit | Mode Four |
| C4 | Continue to cold conditions (Tavg ≤ ~93 °C class) | **Mode Five** |
| C5 | Secure secondary as appropriate; solid plant / cold solid per commercial practice | Mode Five |

**Simulator:** Execute what exists — AFW, RHR On when permissives allow, inventory control — but **do not expect** a timed cold end state. **PWR-N15** is the narrative companion.

---

## 5.0 Individual MODE transition procedures

### PWR-T01 — Enter Free Play in Mode Three

| Step | Action |
|------|--------|
| 1 | Plant & Mission → **PWR** → Free Play |
| 2 | Initial condition **Hot Standby** |
| 3 | Confirm **Mode Three**: subcritical, hot, SR on, control bank inserted |
| 4 | Speed 1×; Play; perform **PWR-N01** |

### PWR-T02 — Enter Free Play in Mode One

| Step | Action |
|------|--------|
| 1 | Plant & Mission → **PWR** → Free Play |
| 2 | **Hot Full Power** or **50 % Power** |
| 3 | Confirm **Mode One**: critical, power > 5 %, MWe as expected |
| 4 | Note turbine load mode (default Follow) |

### PWR-T03 — Mode Three → Mode One (sim path)

| Step | Transition | Procedure |
|------|------------|-----------|
| 1 | Mode Three → Mode Two | **PWR-N02** |
| 2 | Mode Two low-power hold | **PWR-N04** |
| 3 | Turbine on line | **PWR-N05** |
| 4 | Power > 5 % → **Mode One** | **PWR-N06** |
| 5 | Desired Mode One power | **PWR-N07** / N06 |
| 6 | AUTO suite | **PWR-T10** |

**Abort:** Uncontrolled SUR → insert rods; any RPS trip → **PWR-T06** (remain/return Mode Three).

### PWR-T04 — Mode One → Mode Three (controlled)

| Step | Action | Ref |
|------|--------|-----|
| 1 | Reduce power (still Mode One while > 5 %) | **PWR-N08** |
| 2 | Pass ≤ 5 % critical → **Mode Two** (optional hold) | — |
| 3 | Off-load turbine; SCRAM | **PWR-N14** |
| 4 | Stabilize hot, subcritical → **Mode Three** | **PWR-T06** |

### PWR-T05 — Mode One power increase (stay in Mode One)

Raise power within Mode One (e.g. 50 % → 100 %). See **PWR-N06** / **N07**. MODE number does not change.

### PWR-T06 — Mode One (or Two) → Mode Three by trip

| Step | Action |
|------|--------|
| 1 | Verify SCRAM — rods in, power falling |
| 2 | Verify turbine **Disconnected** |
| 3 | Heat sink: SG level / **AFW** |
| 4 | Inventory / subcooling / HPI as needed |
| 5 | Declare **Mode Three** when subcritical and RCS still hot |

### PWR-T20 — Mode Five → Mode One

See **§3.0** (full master path).

### PWR-T21 — Mode One → Mode Five

See **§4.0** (full master path).

### PWR-T22 — Mode Two → Mode Three (reject startup)

| Step | Action |
|------|--------|
| 1 | From Mode Two, insert rods or SCRAM |
| 2 | Confirm subcritical |
| 3 | Hold hot → **Mode Three** |

### PWR-T23 — Mode Three → Mode Two only (criticality practice)

| Step | Action |
|------|--------|
| 1 | **PWR-N01** then **PWR-N02** |
| 2 | Hold power ≤ 5 % |
| 3 | Do not enter Mode One until ready |

---

## 6.0 Turbine load mode transitions (at Mode One)

These change **grid/turbine** state, not plant MODE (you remain Mode One if still critical > 5 %).

### PWR-T07 — Follow → Manual

1. Select **Manual** on Turbine-Generator.  
2. Set MWe near current output, then ramp slowly.  
3. Match reactor power; keep feed AUTO.  

**CAUTION:** Large step cuts can trip the plant back toward Mode Three.

### PWR-T08 — Manual → Follow

1. Stabilize power.  
2. Select **Follow**.  
3. Confirm load tracks reactor power.  

### PWR-T09 — → Disconnected

1. Prefer power reduction first if controlled.  
2. Disconnect / turbine trip / or SCRAM.  
3. If SCRAM: plant → **Mode Three**; load Disconnected.  

---

## 7.0 Control and ESF mode transitions

### PWR-T10 — Normal AUTO suite in Mode One

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

### PWR-T13 — SR → IR handoff (Mode Three / Mode Two startup)

IR ≥ 1e-10 A (P-6) → SR Off. Required before Mode Two power rise trips SR.

### PWR-T14 — Startup trip blocks (entering Mode One)

Above **P-10 (10 %)** — already Mode One — block IR high / PR 25 % low-setpoint as needed. Auto-reinstate below P-10.

### PWR-T15 — Learning ↔ Realistic display

Training display only; does not change plant MODE.

---

## 8.0 Transition map

```
 Mode Six (Refueling)     OUT OF SCOPE
        │
 Mode Five (Cold Shutdown) ──────── [narr] heatup ────────┐
        ▲                                                 │
        │ [narr] cooldown                                 ▼
 Mode Four (Hot Shutdown) ◄─────────────────────── Mode Three (Hot Standby)  [sim]
        ▲                                                 │
        │                                                 │ N02 [sim]
        │                                                 ▼
        │                                          Mode Two (Startup)  [sim]
        │                                                 │
        │ N14 / trip                                      │ N04–N06 [sim]
        │                                                 ▼
        └─────────────── Mode One (Power Operation)  [sim] ── full power
```

**Operator goal paths:**

| Goal | Procedure |
|------|-----------|
| Cold to power | **PWR-T20** Mode Five → Mode One |
| Power to cold | **PWR-T21** Mode One → Mode Five |
| Hot standby to power (sim-only) | **PWR-T03** Mode Three → Mode One |
| Power to hot standby (sim-only) | **PWR-T04** Mode One → Mode Three |

---

## 9.0 Related documents

- `04_NORMAL_OPERATIONS.md` — N01–N15 aligned to MODES  
- `01_GENERAL_DESCRIPTION.md` — MODE table  
- `09_SETPOINTS_LIMITS.md` — Mode One / Mode Three normals  
- `10_GLOSSARY.md` — MODE definitions  
