# 06 — Alarm Response Procedures

**Document:** PWR-ARP-01  
**Title:** Annunciator Response — PWR  
**Revision:** 5  

---

## 1.0 Purpose

Provide operator response for each modeled PWR annunciator. Alarms read **instruments** (or status booleans derived for the board). A failed sensor can suppress or falsely create alarms.

**MODE note:** Most at-power alarms apply in **Mode 1, At Power** (or Mode 2, Startup). **REACTOR TRIP** and post-trip recovery put the plant in **Mode 3, Hot Standby**.

## 2.0 Alarm philosophy

| Priority | Meaning | Operator stance |
|----------|---------|-----------------|
| **Critical** | Trip or imminent core/heat-sink threat | Immediate actions; verify automatic protection |
| **Warning** | Approaching trip or significant upset | Diagnose and correct promptly |
| **Caution** | Off-normal; may not need immediate action | Monitor; correct if trend worsens |
| **Status** | System state change (e.g. HPI running) | Verify expected vs unexpected |

**Status annunciators arrive already acknowledged.** A Status tile reports a *lineup*, not a demand for action, so the board acknowledges it for you: it comes in lit and steady rather than flashing with an ACK outstanding, it is not counted in the Alarms header, and it does not drop fast-forward back to real time. It is still on the board, still shows its real reading, and still clears itself when the condition goes away. Only Critical, Warning and Caution require your acknowledgment.

If a Status tile's condition stops being the planned state of the plant — you heat up past Mode 4, or a pump you had secured actually trips — the annunciator **escalates back to its normal priority and un-acknowledges itself**, flashing as a new alarm. An acknowledgment *you* made is never taken back.

### Mode- and lineup-dependent classification

Some conditions are a **casualty at power and the planned lineup when shut down**. A cold plant *is* cold, *is* depressurized, and its reactor coolant pumps *are* stopped — annunciating that as a depressurization with tripped pumps would bury a normal Mode 5 board under critical alarms and train the crew to ignore them.

The board therefore **reclassifies** these alarms rather than removing them. The annunciator still comes in and still shows the real reading; its **priority drops to Status** and its text changes to say why. A reclassified tile reads, e.g., `status (normally critical)`. Because it is now Status-class, it also arrives **acknowledged** — a healthy Mode 5 spawn presents five standing annunciators and asks nothing of you.

| Annunciator | Reclassified to Status when | Reads |
|-------------|------------------------------|-------|
| PZR PRESS LO (**A05**) | Mode 4 or 5 | *Pressurizer Pressure Low — expected, plant depressurized* |
| PZR PRESS LO LO (**A06**) | Mode 4 or 5 | *Pressurizer Pressure Very Low — expected, plant depressurized* |
| LO TAVG / P-12 (**A29**) | Mode 4 or 5 | *Coolant Temperature Low — expected, plant is cold* |
| TURB TRIP (**A22**) | Mode 4 or 5 | *Turbine Secured — no steam demand* |
| RCP TRIP (**A19**) | pumps stopped **by the RCP handswitch** | *Reactor Coolant Pumps Secured* |

**What this does NOT do — read this before you rely on it.**

- **Mode 3, Hot Standby is excluded.** Post-trip and hot-standby operation keeps every alarm above at full severity. A depressurization or a loss of the pumps in Mode 3 reads exactly as it always did.
- **RCP TRIP is keyed to the handswitch, not to the mode.** Securing the pumps at power reads *Secured*; a pump lost to a trip, a coastdown or a blackout reads **RCP TRIP, critical** in *any* mode, including Mode 5.
- **A real leak during a cooldown will read as Status on the pressure annunciators.** The alarms that distinguish it — **LO SUBCOOL / SUBCOOL LOST (A10/A11)** and **PZR LVL LO / LO LO (A13/A14)** — are never reclassified. In Modes 4 and 5, treat *those* as your inventory alarms; pressure alone will not tell you.

### Global immediate actions (any alarm flood)

1. **Stop** what is making it worse (stop rod withdrawal, stop load step).  
2. **Scan** vital-few strip: Power, Pressure, Tavg, PZR level, SG level, **Subcooling**.  
3. **Acknowledge** (**A** key) after you have read the first-out story.  
4. **Verify** automatic SCRAM / ESF if setpoints exceeded.  
5. Enter the matching **PWR-A##** and, if a failure is active, **PWR-E##**.

### Panel layout

| Panel | Systems |
|-------|---------|
| **A** | Reactor / primary / nuclear |
| **B** | Secondary / turbine / support systems |

---

## 3.0 Alarm index

| ID | Annunciator | Priority | Panel |
|----|-------------|----------|-------|
| PWR-A01 | REACTOR TRIP | critical | A |
| PWR-A02 | HI FLUX | critical | A |
| PWR-A03 | HI TAVG | warning | A |
| PWR-A04 | PZR PRESS HI | warning | A |
| PWR-A05 | PZR PRESS LO | warning | A |
| PWR-A06 | PZR PRESS LO LO | critical | A |
| PWR-A07 | PORV OPEN | warning | A |
| PWR-A08 | SUR HI | caution | A |
| PWR-A09 | SR HI FLUX | caution | A |
| PWR-A10 | LO SUBCOOL | warning | A |
| PWR-A11 | SUBCOOL LOST | critical | A |
| PWR-A12 | PZR LVL HI | caution | A |
| PWR-A13 | PZR LVL LO | warning | A |
| PWR-A14 | PZR LVL LO LO | critical | A |
| PWR-A15 | ROD INS LIMIT | warning | A |
| PWR-A16 | SG LVL HI | caution | B |
| PWR-A16b | SG LVL HI HI | critical | B |
| PWR-A17 | SG LVL LO | warning | B |
| PWR-A18 | SG LVL LO LO | critical | B |
| PWR-A19 | RCP TRIP | critical | B |
| PWR-A20 | HPI/LPI ACTIVE | status | B |
| PWR-A21 | SBO | critical | B |
| PWR-A22 | TURB TRIP | warning | B |
| PWR-A23 | MSIV SHUT | warning | B |
| PWR-A24 | SG PRESS HI | caution | B |
| PWR-A25 | COND VAC LO | caution | B |
| PWR-A26 | COND VAC TRIP | warning | B |
| PWR-A27 | RCP CAVITATION | warning | B |
| PWR-A28 | LOAD IMBAL | caution | B |
| PWR-A29 | LO TAVG (P-12) | warning | A |
| PWR-A30 | CHG FLOW HI | caution | A |
| PWR-A31 | PZR LVL DEV LO | caution | A |
| PWR-A32 | SI ACCUM ALIGNED &lt; 1000 PSI | caution | B |

---

## PWR-A01 — Reactor Trip (REACTOR TRIP)

| Field | Content |
|-------|---------|
| **Setpoint / logic** | `rps_scrammed` true |
| **Means** | Reactor Protection System has shut the reactor down (or manual SCRAM completed). |
| **Automatic actions** | Rods drive in; load → Disconnected |
| **Immediate operator actions** | 1) Verify power falling and rods inserting. 2) Verify turbine load rejected. 3) Ensure heat sink (SG level / AFW). 4) Check pressure, inventory, subcooling. 5) Diagnose cause (first-out / failures). |
| **If not expected** | Manual SCRAM if power not falling; treat as ATWS path (**PWR-E13**). |
| **Recovery** | Stabilize Hot Shutdown (**PWR-T06**). Clear the tripping condition, then reset the RPS at the SCRAM control (**03 §3.5.1**) — the reset is permissive-gated and its caption names whatever is holding it. Do not hasty restart. |

---

## PWR-A02 — High Neutron Flux (HI FLUX)

| Field | Content |
|-------|---------|
| **Setpoint** | Power range ≥ **108 %** (alarm); trip at **120 %** |
| **Means** | Neutron power high. |
| **Actions** | 1) Stop withdrawal. 2) Insert rods. 3) Reduce turbine load if overcooling/power mismatch. 4) If rising through trip, expect/verify SCRAM. |
| **Related** | Continuous rod withdrawal failure **PWR-E17** |

---

## PWR-A03 — High Coolant Temperature (HI TAVG)

| Field | Content |
|-------|---------|
| **Setpoint** | Tavg ≥ **594 °F (312.2 °C)** (alarm); trip **635 °F (335 °C)** |
| **Means** | Average coolant temperature high — often load rejection, loss of heat sink, or power high vs steam demand. |
| **Actions** | 1) Check power vs MWe / steam flow. 2) Check SG level and feed. 3) Insert rods / reduce power. 4) Restore heat sink (AFW if needed). 5) Verify pressure not also high. |

---

## PWR-A04 — Pressurizer Pressure High (PZR PRESS HI)

| Field | Content |
|-------|---------|
| **Setpoint** | ≥ **2300 psi (15.86 MPa)** |
| **Means** | Primary pressure high — toward PORV. |
| **Actions** | 1) Verify spray AUTO/manual available (RCP running). 2) Reduce heat input (rods in / power). 3) Check load rejection / loss of steam demand. 4) Expect PORV auto-open near **2350 psi (16.20 MPa)**. |

---

## PWR-A05 — Pressurizer Pressure Low (PZR PRESS LO)

| Field | Content |
|-------|---------|
| **Setpoint** | ≤ **2149 psi (14.82 MPa)** |
| **Means** | Primary pressure low — subcooling at risk. |
| **Actions** | 1) Energize heaters. 2) Secure excessive spray. 3) Check PORV/safety path and block valve. 4) Check leak / HPI need. 5) Watch subcooling. |

---

## PWR-A06 — Pressurizer Pressure Very Low (PZR PRESS LO LO)

| Field | Content |
|-------|---------|
| **Setpoint** | ≤ **1800 psi (12.41 MPa)** (also low-pressure SCRAM) |
| **Means** | Dangerously low RCS pressure. |
| **Actions** | 1) Verify SCRAM. 2) Verify **HPI** actuation (~1798 psi (12.4 MPa) AUTO if armed). 3) Isolate stuck PORV with **block valve** if indicated. 4) Stop spray. 5) Do not throttle HPI on PZR level alone. → **PWR-E07**, **E09** |

---

## PWR-A07 — Pressure Relief Valve Open (PORV OPEN)

| Field | Content |
|-------|---------|
| **Logic** | `porv_indicator` shows open |
| **Means** | PORV is **indicated** open. Indicator can **lie closed** when actually open. |
| **Actions** | 1) If pressure still high, opening may be proper — wait for reseat ~**2300 psi (15.86 MPa)**. 2) If should be shut: command **PORV Close**. 3) Cross-check **subcooling**, pressure trend, **tailpipe temperature**. 4) If leak continues → **Isolate block valve** (**PWR-E07**). |

---

## PWR-A08 — Startup Rate High (SUR HI)

| Field | Content |
|-------|---------|
| **Setpoint** | SUR ≥ **1 DPM** |
| **Means** | Power rising quickly. |
| **Actions** | 1) Stop withdrawal. 2) Insert if needed. 3) Expect withdrawal interlock at **1.5 DPM**. 4) Resume only when SUR &lt; **0.8 DPM**. |

---

## PWR-A09 — Source Range Count Rate High (SR HI FLUX)

| Field | Content |
|-------|---------|
| **Setpoint** | Alarm **5e4 cps**; trip **1e5 cps** when SR energized |
| **Means** | SR counts high — handoff overdue. |
| **Actions** | 1) If IR on scale (P-6), **SR Off**. 2) If not on scale, stop power rise and diagnose. |

---

## PWR-A10 — Low Subcooling Margin (LO SUBCOOL)

| Field | Content |
|-------|---------|
| **Setpoint** | Subcooling ≤ **20 °F** (11.1 °C) |
| **Means** | Approaching boiling in primary. |
| **Actions** | 1) Raise pressure (heaters) and/or lower temperature (power/load). 2) Check for leak / open relief. 3) Prepare HPI. 4) **Trust this over a single PORV light.** |

---

## PWR-A11 — Subcooling Lost (SUBCOOL LOST)

| Field | Content |
|-------|---------|
| **Setpoint** | Subcooling ≤ **0 °F** (0 °C) |
| **Means** | Coolant at/above saturation — boiling / voiding. |
| **Actions** | 1) Verify SCRAM if not already. 2) **HPI On** — do not throttle on high PZR level. 3) Isolate stuck PORV path. 4) Restore heat sink. 5) Treat as LOCA-class event. → **PWR-E07**, **E09**, **X01** |

---

## PWR-A12 — Pressurizer Level High (PZR LVL HI)

| Field | Content |
|-------|---------|
| **Setpoint** | ≥ **75 %** |
| **Means** | PZR level high — could be charging excess, heatup, **or void surge (TMI trap)**. |
| **Actions** | 1) Check subcooling and pressure. 2) If subcooling OK: reduce charging / increase letdown. 3) If subcooling bad: **suspect LOCA/void** — do **not** secure HPI for level alone. |

---

## PWR-A13 — Pressurizer Level Low (PZR LVL LO)

| Field | Content |
|-------|---------|
| **Setpoint** | ≤ **25 %** |
| **Means** | Inventory low or cooldown contraction. |
| **Actions** | 1) Increase charging; isolate letdown if needed. 2) Check for leak. 3) Watch for LO-LO trip at **12 %**. |

---

## PWR-A14 — Pressurizer Level Very Low (PZR LVL LO LO)

| Field | Content |
|-------|---------|
| **Setpoint** | ≤ **12 %** (SCRAM + auto SI) |
| **Means** | Critical inventory indication. |
| **Actions** | 1) Verify SCRAM. 2) Verify **HPI auto-actuation** (SI initiates on PZR level lo-lo when the HPI arm is AUTO). 3) Maximize charging. 4) Find inventory loss. |

---

## PWR-A15 — Control Rods — Insertion Limit (ROD INS LIMIT)

| Field | Content |
|-------|---------|
| **Logic** | Control bank at/below insertion limit |
| **Means** | Rods too deep for current power — inadequate rod worth margin concept. |
| **Actions** | 1) Borate or reduce power. 2) Withdraw only within procedures. 3) Do not ignore during power ops. |

---

## PWR-A16 — Steam Generator Level High (SG LVL HI)

| Field | Content |
|-------|---------|
| **Setpoint** | ≥ **75 %** |
| **Means** | SG overfeed or load cut with feed high. |
| **Actions** | 1) Reduce feed pump / verify three-element. 2) Match turbine load to power. 3) Avoid turbine water-induction risk mindset (even if not fully modeled). |

---

## PWR-A16b — Steam Generator Level High-High (SG LVL HI HI) — P-14

| Field | Content |
|-------|---------|
| **Setpoint** | ≥ **88 %** (alarm); **P-14 protection at 90 %** |
| **Means** | Overfeed / level swell approaching the moisture-carryover limit. |
| **P-14 actuation (90 %)** | Automatic **turbine trip** + **main-feedwater isolation** (AFW keeps feeding), and a **reactor trip** if **≥50 % power** (P-9). |
| **Actions** | 1) Expect turbine trip + feed isolation + SCRAM. 2) Verify feed isolated and AFW carrying the heat sink. 3) Restore main feed only after level is controlled. → **PWR-E03 / PWR-E01** |

---

## PWR-A17 — Steam Generator Level Low (SG LVL LO)

| Field | Content |
|-------|---------|
| **Setpoint** | ≤ **30 %** |
| **Means** | Heat sink degrading. |
| **Actions** | 1) Raise feed. 2) Check main feed failures. 3) Prepare AFW. 4) Expect AFW AUTO ~**20 %** if armed. |

---

## PWR-A18 — Steam Generator Level Critical Low (SG LVL LO LO)

| Field | Content |
|-------|---------|
| **Setpoint** | ≤ **17 %** (SCRAM) |
| **Means** | Heat sink critical. |
| **Actions** | 1) Verify SCRAM. 2) **AFW Start** immediately. 3) Turbine load off. → **PWR-E01** |

---

## PWR-A19 — Reactor Coolant Pump Trip (RCP TRIP)

| Field | Content |
|-------|---------|
| **Logic** | `rcp_running` false |
| **Means** | Loss of forced primary flow. |
| **Actions** | 1) Verify automatic low-flow SCRAM. 2) Manual SCRAM if not tripped. 3) Load off. 4) Natural circulation / AFW for decay heat. → **PWR-E02** |

---

## PWR-A20 — Emergency Injection Active (HPI/LPI ACTIVE)

| Field | Content |
|-------|---------|
| **Logic** | `hpi_active` true |
| **Means** | Emergency injection running (auto or manual). |
| **Actions** | 1) If expected (low pressure / LOCA): leave running; monitor subcooling/inventory. 2) If unexpected: diagnose pressure instruments and ESF arm. 3) Do not secure early on rising PZR level alone during LOCA. |

---

## PWR-A21 — Station Blackout (SBO)

| Field | Content |
|-------|---------|
| **Logic** | `station_blackout` true |
| **Means** | AC power lost (as modeled). |
| **Actions** | 1) Verify SCRAM / trip state. 2) Establish AFW if available. 3) Natural circulation mindset. 4) Recognize severe training challenge — see **PWR-E05**. |

---

## PWR-A22 — Turbine Trip / Low Steam Demand (TURB TRIP)

| Field | Content |
|-------|---------|
| **Logic** | `steam_demand_low` true |
| **Means** | Turbine not accepting load / tripped. |
| **Actions** | 1) **Above 50 % power (P-9), expect an automatic REACTOR TRIP with the turbine trip** — confirm it and go to the post-trip response. 2) Below P-9, expect reactor power/Tavg response and match or scram as conditions require. 3) Steam dump for pressure. 4) Control SG level. → **PWR-E03** |
| **NOTE** | A **planned offline** (generator **OFF**) is not a turbine trip and does not arm P-9. |

---

## PWR-A23 — Main Steam Isolated (MSIV SHUT)

| Field | Content |
|-------|---------|
| **Logic** | `msiv_open` false |
| **Means** | MSIV closed — SG bottled. |
| **Actions** | 1) Expect turbine trip and SG pressure rise toward safeties. 2) Reactor trip if heat sink lost. 3) AFW for inventory. → MSIV transient **PWR-E19** related |

---

## PWR-A24 — Steam Generator Pressure High (SG PRESS HI)

| Field | Content |
|-------|---------|
| **Setpoint** | ≥ **1305 psi (9.0 MPa)** (alarm); SG safeties ~**1350 / 1305 psi** (9.31 / 9.0 MPa) open/reseat |
| **Means** | Secondary pressure high — often MSIV shut or loss of steam path. |
| **Actions** | 1) Steam dump if available. 2) Reduce reactor power / verify trip. 3) Do not overfeed dry SG without procedure. |

---

## PWR-A25 — Condenser Vacuum Low (COND VAC LO)

| Field | Content |
|-------|---------|
| **Setpoint** | ≤ **25 inHg (84.7 kPa)** |
| **Means** | Vacuum degrading. |
| **Actions** | 1) Reduce load. 2) Check vacuum failure injection. 3) Prepare for turbine trip. |

---

## PWR-A26 — Condenser Vacuum Trip Level (COND VAC TRIP)

| Field | Content |
|-------|---------|
| **Setpoint** | ≤ **22 inHg (74.5 kPa)** |
| **Means** | Turbine protection vacuum trip region. |
| **Actions** | 1) Verify turbine trip. 2) Control reactor/SG. → **PWR-E10** |

---

## PWR-A28 — Reactor/Turbine Load Imbalance (LOAD IMBAL)

| Field | Content |
|-------|---------|
| **Logic** | `sg_imbalance_active` true — indicated reactor power and turbine load differ by more than **4 % of rated (4 MWe)** |
| **Means** | The reactor and the turbine are not making and taking the same amount of steam, so the steam generator is **filling** (load above power) or **draining** (power above load). In MANUAL load control the turbine sits at whatever load setpoint you last gave it, so changing reactor power alone always produces this. |
| **Actions** | 1) Compare reactor power against generator output. 2) In MANUAL, walk the load setpoint to match the power you are at — or put load control in FOLLOW. 3) Watch Tavg: a sustained imbalance with the turbine high **overcools** the primary, and there is no trip that will stop it. 4) Watch SG level, which is moving in the direction the imbalance names. |

---

## PWR-A27 — Reactor Coolant Pump Cavitation (RCP CAVITATION)

| Field | Content |
|-------|---------|
| **Logic** | `rcp_cavitating` true — suction-node subcooling `Tsat(P_suction) − Tcold` below ~14.4 °F (8 °C) on a running pump |
| **Means** | The RCS is approaching saturation at the pump suction — the pumps are drawing two-phase fluid, losing head and flow. A voiding / depressurizing primary. **Not** an instrument fault — believe it. |
| **Actions** | 1) Cross-check **LO SUBCOOL / SUBCOOL LOST** and pressurizer pressure — treat as loss of subcooling. 2) Suspect a LOCA / stuck-open relief path; do **not** secure injection for level alone. 3) Restore subcooling (inject, arrest depressurization). 4) Per site EOPs, trip the RCPs if subcooling cannot be restored (avoid running cavitating pumps). → **PWR-E07 / X01** |

---

## PWR-A29 — Low Coolant Temperature (LO TAVG / P-12)

| Field | Content |
|-------|---------|
| **Setpoint** | Tavg ≤ **552.2 °F** (289 °C) — the **P-12** line, ~14.4 °F (8 °C) below the no-load Tavg program |
| **Means** | The primary is below the hot operating band. At power or at hot standby this is an **overcooling** transient: excess steam demand, a stuck-open dump or relief path, or an overfed steam generator. Moderator feedback adds positive reactivity as the primary cools, so an unattended overcool raises power. |
| **Deliberately not a trip** | A PWR does not scram on low Tavg. The real cold-side protections are this permissive and low-temperature overpressure protection — neither is a reactor trip. |
| **Actions** | 1) Find the steam path that is taking too much heat: steam dump position, PORV / SG safeties, turbine load against reactor power (**A28**). 2) Isolate or close it. 3) Watch power — Tavg falling with power *rising* is the overcool feeding itself. 4) Cross-check pressure and subcooling; a cooling primary shrinks and drops pressurizer level. |
| **In Mode 4 or 5** | **Expected.** A cooldown is meant to take Tavg here, so the annunciator reclassifies to **Status** and reads *"expected, plant is cold"* (§2.0). |

---

## PWR-A30 — Charging Flow High (CHG FLOW HI)

| Field | Content |
|-------|---------|
| **Setpoint** | Charging flow ≥ **60 % of maximum** |
| **Means** | The chemical and volume control system is making up more than it normally does. Charging is a **level controller**: it only works this hard because pressurizer level is being pulled down. Something is taking inventory out of the reactor coolant system. |
| **Why this alarm exists** | A leak small enough for charging to keep up is **held indefinitely** and moves level only a per cent or two — far above the **PZR LVL LO** alarm at 25 %, which never comes in. Without this annunciator the plant would lose inventory silently with make-up near its limit. This is the one that tells you to look. |
| **Automatic actions** | None. Charging is already responding; that response *is* the indication. |
| **Immediate operator actions** | 1) Confirm level is at or below its program (**A31** if the deviation is large). 2) Check letdown is not isolated or throttled — the same alarm comes in if charging is making up for letdown that was shut. 3) Look for the leak: containment sump and humidity, pressurizer relief tank pressure and temperature (a weeping PORV or safety), steam generator activity (**PWR-E05**, tube leak). 4) Log the charging demand and trend it — a rising demand at steady load means a growing leak. |
| **If not expected** | Treat as unidentified reactor coolant leakage. If charging reaches its maximum and level still falls, make-up has lost the leak — see **A31** and **PWR-E04**. |
| **Watch for** | Deliberate level changes. Raising the level setpoint, or drawing a pressurizer bubble, sends charging high for a legitimate reason. Check what was asked for before hunting a leak. |

---

## PWR-A31 — Pressurizer Level Below Program (PZR LVL DEV LO)

| Field | Content |
|-------|---------|
| **Setpoint** | Indicated level ≥ **10 %** below its programmed value |
| **Means** | **Make-up is no longer holding.** Level is programmed against Tavg, so it is *supposed* to move on a load change — this alarm measures the gap between where level is and where the program says it should be, which only opens when mass is actually leaving the system faster than charging replaces it. |
| **Why a deviation and not a low level** | Level legitimately swings more than eight percentage points across a normal load change, so any absolute setpoint tight enough to catch a leak early would come in every time load moved. The deviation does not move on load at all. It also beats **PZR LVL LO** to the condition: this alarm comes in while absolute level is still around 28 %. |
| **Automatic actions** | None at this alarm. Charging is already at or near maximum. |
| **Immediate operator actions** | 1) Verify charging at maximum and letdown isolated — recover any make-up capacity that is being wasted. 2) Confirm subcooling margin and pressure; falling level with falling pressure is a leak, falling level with rising pressure is not. 3) Enter **PWR-E04** (loss of reactor coolant). 4) Prepare for safety injection if level continues down toward **PZR LVL LO LO** at 12 %. |
| **Companion alarm** | **A30** normally comes in first and stays in. **A30 alone** = a leak inside make-up authority, held. **A30 with A31** = make-up has lost it. That pair is the diagnosis. |
| **If A31 comes in without A30** | Charging is *not* working hard, so this is probably not a leak — suspect the level or Tavg instrument, or charging isolated. Cross-check level against the wide-range indication and Tavg against the loop temperatures. |

---

## PWR-A32 — Accumulators Still Lined Up (SI ACCUM ALIGNED &lt; 1000 PSI)

| Field | Content |
|-------|---------|
| **Setpoint** | Primary pressure below **1000 psi (6.895 MPa)** **and** the accumulator discharge isolation valve still **open** |
| **Means** | The safety-injection accumulators are aligned to the reactor coolant system and pressure has entered the band where they should be isolated. They are **passive**: nitrogen behind a check valve. Nothing automatic shuts them, and the safety-injection block set entering a cooldown blocks **pumps**, not these tanks. |
| **Why gated on the valve** | Pressure alone is not the condition. A Mode 5 plant is below this setpoint all day with the tanks correctly isolated, and an alarm on pressure alone would stand in permanently and be normalized. This one clears the moment you isolate — and never comes in at all if you isolate on schedule. |
| **Automatic actions** | **None, deliberately.** There is no autoclose interlock. Real plants power these valves *open* and remove control power to prevent inadvertent closure; the closure is the operator's, made off this indication. An automatic closure keyed on falling pressure would also shut them during a **LOCA**, which is precisely when they must inject. |
| **Immediate operator actions** | **On a planned cooldown:** isolate the accumulators — shut the discharge isolation valve on the ECCS side of the board. Confirm SIT fill and cover-gas pressure hold steady afterwards. See **PWR-N15** step 3 and **05** Phase C step C3. |
| **On a LOCA or unplanned depressurization** | **Do not isolate.** The same annunciator here means passive injection is about to start, which is the design intent. The tile states a lineup, not an order — deciding which situation you are in is the point of it. |
| **If it stays in after you isolate** | The valve did not shut. Check its position indication; the alarm reads valve position, not the command. |
| **If you see it with the tanks already empty** | It came in about **1 minute of plant time** before the first discharge on a brisk cooldown, and it stays lit afterwards. Lit tile plus SIT fill at 0 % is the post-mortem: this is why the tanks emptied and why RCS boron rose toward the 2500 ppm accumulator charge. |
| **Watch for** | **Time acceleration.** That ~1 plant-minute of warning is a couple of seconds of wall clock at 30×. Cooldown rates in this trainer are compressed (see **12** §14) — slow down through the band rather than relying on reaction time. |
| **What this tile does NOT cover** | **The heatup.** There is no annunciator for accumulators left *isolated* on the way up, and no automatic open signal — re-alignment is an operator action. This tile is silent in that case, because shut tanks are the condition it clears on. **PWR-N01** step 7 (re-align accumulators) is the step that catches it. |

---

## 4.0 Multi-alarm patterns (quick diagnosis)

| Pattern | Suspect |
|---------|---------|
| SG LVL LO → LO LO + REACTOR TRIP | Loss of feed (**E01**) |
| RCP TRIP + REACTOR TRIP | Loss of flow (**E02**) |
| PORV OPEN or **no PORV alarm** + LO SUBCOOL + PZR LVL HI | Stuck PORV / TMI (**E07**, **X01**) |
| RCP CAVITATION + LO SUBCOOL / SUBCOOL LOST | Primary voiding — RCS at saturation (**E07**, **X01**) |
| TURB TRIP + HI TAVG + PZR PRESS HI | Load rejection (**E03**) |
| PZR PRESS LO LO + HPI ACTIVE + inventory drop | LOCA (**E09**) |
| COND VAC LO → TURB TRIP | Vacuum event (**E10**) |

---

## 5.0 Related documents

- `07_ABNORMAL_EMERGENCY.md`  
- `09_SETPOINTS_LIMITS.md`  
- `08_ACCIDENT_TMI.md`  
