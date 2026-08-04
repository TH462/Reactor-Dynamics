# 09 — Setpoints, Limits, and Normal Values

**Document:** PWR-SP-01  
**Title:** Operating Limits and Protection Setpoints — PWR  
**Revision:** 4  
**Source:** As-built `pwr_control.js`, `pwr_config.js`; normal values captured from the live engine  

**NOTE:** Values are trainer setpoints (SI). Real US plant Tech Specs differ.

**Plant MODES:** Mode 1, At Power = Power Operation (power > 5 %); Mode 2, Startup = Startup (critical ≤ 5 %); Mode 3, Hot Standby = Hot Standby; **Mode 4, Hot Shutdown and Mode 5, Cold Shutdown are simulated** — `cold_shutdown` is a Free Play initial condition and the full heatup/cooldown runs on integrated physics. See `05_MODE_TRANSITIONS.md`.

---

## 1.0 Normal operating point — Mode 1, At Power (Hot Full Power)

| Parameter | Nominal | MODE |
|-----------|---------|------|
| Reactor power | **100 %** | Mode 1, At Power |
| Electrical output | **≈ 100 MWe** | Mode 1, At Power |
| Primary pressure | **2235 psi (15.41 MPa)** | Mode 1, At Power |
| Tavg | **≈ 579.2 °F (304 °C)** | Mode 1, At Power |
| Thot / Tcold | **≈ 609.8 / 550.4 °F** (321 / 288 °C) (ΔT ≈ 59.4 °F / 33 °C) | Mode 1, At Power |
| Pressurizer level | **≈ 55 %** | Mode 1, At Power |
| Steam Generator level | **≈ 65 %** | Mode 1, At Power |
| Secondary steam pressure | **≈ 819 psi (5.65 MPa)** | Mode 1, At Power |
| Subcooling margin | **≈ 73.8 °F** (41 °C) | Mode 1, At Power |
| Control bank position | **≈ 92 %** withdrawn | Mode 1, At Power |
| Core inventory | **100 %** | Mode 1, At Power |
| Decay heat (after long power run) | **≈ 7 %** at scram instant | — |

### Mode 3, Hot Standby — Hot Standby (typical)

| Parameter | Nominal |
|-----------|---------|
| Power | ~**1e-6** normalized (source equilibrium) |
| Control bank | Fully inserted |
| Subcritical margin | ~**−1000 pcm** class |
| SR detector | Energized |
| T/P | Operating (hot) — still **Mode 3, Hot Standby**, not Mode 5, Cold Shutdown |
| Free Play IC | `hot_zero_power` |

---

## 2.0 Reactor Protection System (RPS) trips → SCRAM

| Instrument / condition | Direction | Setpoint | Notes |
|------------------------|-----------|----------|-------|
| Power range (high) | high | **120 %** | Full-power high flux |
| Power range (low setpoint) | high | **25 %** | Startup; blockable above P-10 |
| Tavg | high | **635 °F (335 °C)** | |
| Primary pressure | high | **2384 psi (16.44 MPa)** | |
| Primary pressure | low | **1800 psi (12.41 MPa)** | |
| PZR level | low | **12 %** | |
| SG level | low | **17 %** | Lo-lo; AFW auto-starts just above (20 %) |
| SG level (P-14) | high | **90 %** | High-high; reactor trip via P-9, condition **≥50 % power** |
| **Turbine trip (P-9)** | turbine tripped | — | **Reactor trip on turbine trip**, condition **≥50 % power** (P-9). Above P-9 a turbine trip scrams the reactor *immediately* — it is not a ride-out. Below P-9 there is no reactor trip and the steam dump carries the transient. A **planned offline** (generator OFF / `disconnect_grid`) is **not** a turbine trip and never arms this — see `03` §12.1 |
| RCS loop flow | low | **90 % of rated** | Low-flow trip; reads the `rcs_flow` elbow-tap channel. Blockable below **P-7 (10 % power)**, auto-reinstates above. Real Westinghouse setpoint. **One channel, not 2-of-3** — see `12` §10.7 for that departure and what it costs |
| Source range | high | **1e5 cps** | When SR energized |
| Intermediate range | high | **1.67e-3 A** | ~20 % class over-range; blockable above P-10 |
| Primary pressure (SI trip, PI-3) | low | **1798 psi (12.4 MPa)** | Reactor trip on safety injection; blockable below P-11 (1973 psi (13.6 MPa)), auto-reinstates |
| PZR level (PI-8) | high | **97 %** | Going-solid backstop; the 75 % alarm warns first |
| **Overtemperature ΔT (OTΔT)** | low margin | **variable (calculated)** | **Core protection against departure from nucleate boiling.** Compares indicated loop ΔT against a setpoint that MOVES with average temperature and reactor coolant pressure — the same ΔT is safe at one condition and a trip at another, which is what no single-parameter trip can see. **Cannot be blocked** (WTSM 12.2 Table 12.2-1, *"No Interlocks"*). Board readout: **core ΔT margin**, NIS card |
| **Overpower ΔT (OPΔT)** | low margin | **variable (calculated)** | **Core protection against excessive heat rate in the fuel** (kW/ft). Same loop-ΔT signal, compensated for average temperature only. **Cannot be blocked.** Its design-basis events include the **steam line break** — before it existed, a 30 % break held the core at 114 % power for thirty minutes with no reactor trip |

### Permissives / blocks

| Name | Value | Effect |
|------|-------|--------|
| **P-6** | IR ≥ **1e-10 A** | Allows SR de-energize |
| **P-9** | Power ≥ **50 %** | Arms the **reactor trip on turbine trip** and the P-14 reactor trip; also gates the loss-of-MFW AFW start |
| **P-7** | Power ≥ **10 %** | Arms the **low-flow reactor trip**; below it the trip may be blocked (RCPs are secured in Mode 5, where RHR provides circulation) and it auto-reinstates above |
| **P-10** | Power ≥ **10 %** | Allows IR/PR low-setpoint trip blocks |
| **P-11** | Pressure ≥ **1973 psi (13.6 MPa)** | Below it the SI trip may be blocked; auto-reinstates above |
| **P-12** | Tavg low **552.2 °F (289 °C)** | LO TAVG annunciator (`PWR-A29`) |
| SR re-energize block | IR ≥ **1e-6 A** | Protects SR detector |

### Rod withdrawal interlock

| Parameter | Value |
|-----------|-------|
| Block withdrawal when SUR ≥ | **1.5 DPM** |
| Clear when SUR &lt; | **0.8 DPM** |
| **Block withdrawal when OTΔT or OPΔT margin ≤** | **3 % of rated ΔT** (clears above 6 %) |
| Insertion | Always allowed |

**The ΔT rod stops are the OTΔT / OPΔT trip's own early warning**, three percent before it fires, and they annunciate as **OTΔT ROD STOP** / **OPΔT ROD STOP** on Panel A. Sourced: WTSM 12.2 §12.2.3.7–.8 and Table 12.2-2 rows C-3/C-4 — *"Loop ΔT > (OTΔT reactor trip setpoint − 3%)… Stops control rod outward motion (manual & automatic) and initiates a turbine runback."* **The turbine runback is built** (#318), and it is the half that acts rather than refuses. When the ΔT margin has HELD below the rod stop for about **8.5 seconds** — a brief dip does not count, and that delay stands in for the two-out-of-four loop voting a single-loop plant cannot have — the plant reduces the **generator load target** by **5 % of rated in about 1.5 seconds, then holds it steady for 28.5 seconds and looks again** — if the condition has not cleared, another 5 % in the next 30-second interval, and so on. You will see the number in the Generator Load box drop in steps with nobody touching it. It does **not** put the load back afterwards; that is yours to do once the condition is fixed. It never touches the reactor: it reduces LOAD, and the core follows the load down through the moderator coefficient, which is why it works and also why it is not instant. Sourced: WTSM 11.3 *Westinghouse Electrohydraulic Control System* (ML11223A295), Turbine Runbacks — *"the EHC system reduces load at 200%/min for 1.5 sec (a 5% load change), then holds the load constant for 28.5 sec. If the runback condition has not cleared, the load will be reduced by another 5% in the next 30-sec interval."* Measured on this plant: a **15 % steam line break** takes two steps to 90 MWe and becomes a ride-out instead of a reactor trip, while a **30 % break** and a continuous rod withdrawal still trip — they outrun the coupling the runback works through. Like every rod stop here, it blocks **withdrawal only** — *"The rods can always be inserted into the core using either manual or automatic rod control"* (WTSM 8.1 §8.1.7.3).

---

## 3.0 Engineered safety & automatic actuations

| Function | Instrument | Direction | Setpoint | Reset / notes |
|----------|------------|-----------|----------|---------------|
| Open PORV | primary_pressure | high | **2350 psi (16.20 MPa)** | Close/reseat **2300 psi (15.86 MPa)** |
| Open PZR safety | primary_pressure | high | **2485 psi (17.13 MPa)** | Reseat **2400 psi (16.55 MPa)** |
| HPI start (Safety Injection) | primary_pressure | low | **1798 psi (12.4 MPa)** | ESF arm must be AUTO; arrives with the low-pressure trip |
| HPI start (SI on PZR level lo-lo) | pzr_level | low | **12 %** | Inventory-protecting SI path — fires with the 12 % low-level trip even if the heaters are holding pressure; re-arms above **20 %**; rides the HPI arm |
| Letdown isolation | pzr_level | low | **17 %** | Closes both letdown orifices before the 12 % low-level trip; re-arms above **20 %**; restoration is a deliberate operator action (no auto-reopen) |
| Feedwater isolation (on SI) | primary_pressure | low | **1798 psi (12.4 MPa)** | Rides the HPI arm (PI-5) |
| AFW start | sg_level | low | **20 %** | ESF arm must be AUTO |
| AFW start (loss of MFW, PI-4) | fw_flow | low | **0.10** normalized | Above P-9 (≥50 % power) |
| MFW isolation + AFW start (P-4) | tavg | low | **572 °F (300 °C)** | Condition: reactor tripped — the post-trip MFW→AFW handoff |
| RHR start | primary_pressure | low | **400 psi (2.76 MPa)** | Condition: scrammed; ties to the RHR suction-valve **block-open** permissive, not the autoclose — see **§ RHR** below |
| SR re-energize assist | intermediate_range | low | **1e-10 A** | Actuation path as configured |
| Open SG safety | steam_pressure | high | **1350 psi (9.31 MPa)** | Reseat **1305 psi (9.0 MPa)** |
| Turbine trip (vacuum) | condenser_vacuum | low | **22 inHg (74.5 kPa)** | Reset region **25 inHg (84.7 kPa)** |
| Turbine trip (overspeed) | turbine_rpm | high | **1980 RPM** | Reset below ~**1800 RPM**. **CONFIGURED BUT NOT REACHABLE in this simulator** — there is no turbine roll model, so the rotor is either pinned at rated by the grid or coasting down. Measured peak: **1800 RPM** on line in Follow, **1800** in Manual with a 2×-rated MWe demand, **1799** with the MSIVs shut and the breaker closed. Declared at **12** §12.14; pinned by `run_reachability` B3 |
| Turbine trip (SG hi-hi / P-14) | sg_level | high | **90 %** | Re-arm below **85 %** |
| Steam dump (pressure mode) | steam_pressure | high | **1194 psi (8.23 MPa)** | = Psat(566.6 °F (297 °C)), the no-load Tavg anchor; capacity **40 %** of rated steam flow (prototypical — sized for a 50 % loss of load with a ~10 % reactor step) |
| Steam dump (trip-open mode) | tavg error | — | opens on the Tavg error above the no-load reference, full demand ~14.4 °F (8 °C) above it | On turbine trip; needs the condenser (unavailable on lost vacuum / MSIV shut) |
| Spray flow cap | — | — | **12 %** of full spray flow | Sized for step insurges; cannot suppress a loss-of-heat-sink repressurization |
| Main feedwater isolation (P-14) | sg_level | high | **90 %** | Latches (manual restore); AFW unaffected. Re-arm below **85 %** |

### HPI pump curve (merged HPI/LPI)

- High-head trickle against operating pressure.  
- High volume once depressurized (low-head region ~**653 psi (4.5 MPa)** class shutoff transition).  

### AFW delivery

- Delivered flow = capacity × throttle × level-hold taper near target.  
- **AFW latches.** Once it auto-starts on low steam-generator level it keeps feeding until
  an operator secures it — it does not stop by itself. Deciding when to secure it is the
  operator's call, and it should not be left running once a trusted heat sink is back.  
- **Level hold: full flow below 32 %, tapering to zero at 40 %.** Against decay-heat steam
  draw an AFW-only generator settles around **37 %** — inside the normal green band, clear
  of the 30 % SG LVL LO alarm. The approach is slow (AFW is only 15 % of rated feed), so
  expect level to take the best part of an hour to walk back up from a low-level start.  

---

## 4.0 Alarm setpoints

### Panel A — Reactor / primary

| ID | Name | Instrument | Dir | Setpoint | Priority |
|----|------|------------|-----|----------|----------|
| reactor_trip | REACTOR TRIP | rps_scrammed | true | — | critical |
| high_flux | HI FLUX | power_range | high | **108 %** | critical |
| high_tavg | HI TAVG | tavg | high | **594 °F (312.2 °C)** | warning |
| low_tavg | LO TAVG (P-12) | tavg | low | **552.2 °F (289 °C)** | warning † |
| pzr_pressure_high | PZR PRESS HI | primary_pressure | high | **2300 psi (15.86 MPa)** | warning |
| pzr_pressure_low | PZR PRESS LO | primary_pressure | low | **2149 psi (14.82 MPa)** | warning † |
| pzr_pressure_lolo | PZR PRESS LO LO | primary_pressure | low | **1800 psi (12.41 MPa)** | critical † |
| porv_open | PORV OPEN | porv_indicator | open | — | warning |
| sur_high | SUR HI | startup_rate | high | **1 DPM** | caution |
| sr_high_flux | SR HI FLUX | source_range | high | **5e4 cps** | caution |
| subcooling_low | LO SUBCOOL | subcooling_margin | low | **20 °F** (11.1 °C) | warning |
| subcooling_lost | SUBCOOL LOST | subcooling_margin | low | **0 °F** (0 °C) | critical |
| pzr_level_high | PZR LVL HI | pzr_level | high | **75 %** | caution |
| pzr_level_low | PZR LVL LO | pzr_level | low | **25 %** | warning |
| pzr_level_lolo | PZR LVL LO LO | pzr_level | low | **12 %** | critical |
| rod_limit | ROD INS LIMIT | rod_at_limit | true | — | warning |
| otdt_approach | OTΔT ROD STOP | otdt_margin | low | **3 % of rated ΔT** | warning |
| opdt_approach | OPΔT ROD STOP | opdt_margin | low | **3 % of rated ΔT** | warning |

### Panel B — Secondary / systems

| ID | Name | Instrument | Dir | Setpoint | Priority |
|----|------|------------|-----|----------|----------|
| sg_level_hihi | SG LVL HI HI | sg_level | high | **88 %** | critical |
| sg_level_high | SG LVL HI | sg_level | high | **75 %** | caution |
| sg_level_low | SG LVL LO | sg_level | low | **30 %** | warning |
| sg_level_lolo | SG LVL LO LO | sg_level | low | **17 %** | critical |
| rcp_trip | RCP TRIP | rcp_running | false | — | critical ‡ |
| hpi_active | HPI/LPI ACTIVE | hpi_active | true | — | status |
| sbo | SBO | station_blackout | true | — | critical |
| turbine_trip | TURB TRIP | steam_demand_low | true | — | warning † |
| load_imbalance | LOAD IMBAL | sg_imbalance_active | true | > **4 %** of rated (4 MWe) | caution |
| msiv_closed | MSIV SHUT | msiv_open | false | — | warning |
| sg_press_high | SG PRESS HI | steam_pressure | high | **1305 psi (9.0 MPa)** | caution |
| cond_vac_low | COND VAC LO | condenser_vacuum | low | **25 inHg (84.7 kPa)** | caution |
| cond_vac_trip | COND VAC TRIP | condenser_vacuum | low | **22 inHg (74.5 kPa)** | warning |
| rcp_cavitation | RCP CAVITATION | rcp_cavitating | true | — | warning |
| accum_aligned | SI ACCUM ALIGNED &lt; 1000 PSI | primary_pressure | low | **1000 psi (6.895 MPa)** § | caution |

**§ The only annunciator gated on a LINEUP as well as a reading.** It requires the accumulator discharge isolation valve indication (`accum_valve_open`) to read **open** as well as pressure to be below setpoint, so a correctly-isolated Mode 5 plant — which sits below this pressure indefinitely — never sees it. The setpoint is where **LCO 3.5.1** stops requiring the accumulators OPERABLE (*"MODE 3 with RCS pressure &gt; [1000] psig"*) and LTOP **SR 3.4.12.3** starts requiring them isolated, leaving 400 psi (2.76 MPa) above their cover gas. **There is no autoclose interlock and that is deliberate** — see **06 PWR-A32**.

**§ RHR — the suction valve has TWO setpoints, and the autoclose is the higher one.** The valve will not **open** above **400 psi (2.76 MPa)** (the block-open permissive, and what the RHR start actuation above is keyed to); a standing-open valve **autocloses** only once pressure rises back above **600 psi (4.14 MPa)**. Both are sourced. NUREG-0933 **Issue 99, "RCS/RHR Suction Line Valve Interlock on PWRs" (Rev. 3)**: *"Two basic features are incorporated in the interlock design: (1) an automatic closure signal on high RCS pressure (typically 600 psig), and (2) a block of the manual open signal at a lower RCS pressure (typically 425 psig)."* The Westinghouse Technology Systems Manual **§5.1** (ADAMS **ML11223A219**) gives the same structure for valves 8701/8702 — open block 425 psig, autoclose ~585 psig.

**Why the gap matters to you.** Between the two setpoints the valve stays where it is. That is what keeps a plant hunting around 400 psi from chattering the valve — and because the automatic entry permissive is **one-shot** (**06 PWR-A33**), a single spurious closure would be permanent. Until 2026-07-31 this plant used one constant for both jobs, so the deadband was zero: a cooldown whose pressure-control setpoint sat at **409 psi (2.82 MPa)** aligned RHR, rebounded nine psi, auto-closed, and never recovered. **Practical consequence:** do not read "below 400 psi" as the condition for *keeping* RHR — it is the condition for *getting* it. Once aligned you have to reach **600 psi (4.14 MPa)** to lose it.

**Setpoints do not move with plant mode — priorities do.** Every setpoint above is fixed in every mode. What changes is **classification**: the annunciators marked **†** drop to **Status** in **Mode 4 or 5**, where the condition is the planned lineup rather than a casualty, and **‡** drops to Status whenever the pumps were stopped **by the handswitch** rather than lost. The alarm still comes in and still reads its instrument; the priority, the wording, and — because Status-class annunciators arrive pre-acknowledged — the ACK demand are what change. Full table, the exclusions, and what it does *not* cover: **06 §2.0**.

---

## 5.0 Safety / damage limits (physics)

| Limit | Value | Meaning |
|-------|-------|---------|
| Fuel cladding damage | **2192 °F (1200 °C)** | Fission-product release begins (model) |
| Fuel melt | **5072 °F (2800 °C)** | Core melt (model) |
| Core uncovery heat-transfer collapse | Inventory &lt; **~50 %** | Fuel-to-coolant coupling degrades |
| DNB entry (hot-leg subcooling) | **~14.4 °F** (8 °C) margin | Heat transfer degrades toward DNB regime |

---

## 6.0 Pressurizer control bands (AUTO)

| Parameter | Value |
|-----------|-------|
| Pressure setpoint | **2235 psi (15.41 MPa)** |
| Heater proportional band | **30 psi (0.207 MPa)** |
| Spray proportional band | **50 psi (0.345 MPa)** |

---

## 7.0 Rod drive

| Parameter | Value |
|-----------|-------|
| Control bank max steps | **912** fully withdrawn (fine-step drive; one step ≈ 6.5 pcm ≈ 1 ¢ in the startup critical band) |
| Speed slow / normal / fast | **0.533 / 3.20 / 4.80 steps/s** (32 / 192 / 288 steps/min — same fraction-of-travel rates as the pre-fine-step drive) |
| Scram insertion time (control) | **~2.5 s** full travel |
| Scram insertion time (shutdown) | **~2.0 s** |
| Insertion limit (RIL) | **Power-dependent.** Not applicable below **5 %** power; above it the % withdrawn floor ramps linearly from **5 %** to **70 %** at 100 % power (≈ 10 % withdrawn at 12 % power, 70 % at full power). Drives the ROD INS LIMIT alarm and stops the automatic rod channel inserting further. The bank sits at 92 % withdrawn across the load range, so the limit means "the bank is abnormally deep for this power" |
| Control worth (total group) | **4068 pcm** (`rod_worth_total = 0.04068`) — WTSM 2.2 Table 2.2-1, all control banks |
| Shutdown worth (total group) | **3676 pcm** (`rod_worth_shutdown = 0.03676`) — same source, all shutdown banks; all RCCAs together **7744 pcm** |

---

---

## 7.5 Estimated Critical Condition (ECC) — reference data

<!-- ECC-BCRIT-TABLE: generated from the engine; test/run_reactivity.js verifies every
     cell against pwr_engine's own reactivity model, so this table cannot go stale
     without reddening a gate. Do not hand-edit the numbers. -->

> **What pins this curve.** Two independent anchors, and they constrain different
> things. **Shape** — the boron dependence — is *measured*: the BEAVRS / Watts Bar U1
> Cycle 1 HZP physics tests (OSTI 1991715, Table IV) report isothermal temperature
> coefficients at three boron concentrations (975 ppm → −1.75 pcm/°F, 902 → −4.65,
> 810 → −8.01), which put the moderator coefficient's zero crossing at **986 ppm**.
> **Level** — the ARO critical boron at hot zero power — is also measured, at
> **975 ppm** from the same tests. **Magnitude** is measured too: both parameters are
> least-squares fitted to those same three points *(OWNER RULING, 2026-07-30: "for 263
> item 1 fit the measurement.")*, which **supersedes** the earlier 2026-07-21 ruling
> pinning the full-power coefficient at −20 pcm/°C. The plant runs **−26.8 pcm/°C**
> there now, and reproduces all three measured coefficients to within 0.09 pcm/°F
> instead of missing two of them by 0.88 and 1.64. `test/run_reactivity.js` checks
> every one of them, and nothing in this curve is set by preference any more.

**Critical boron concentration (ppm) by Tavg and control-bank position**, shutdown bank
withdrawn, no xenon, zero power:

| Tavg | bank IN (0) | 25 % (228) | 50 % (456) | 75 % (684) | ARO (912) |
|---|---|---|---|---|---|
| 122 °F (50.0 °C) | 806 | 832 | 909 | 986 | 1011 |
| 200 °F (93.3 °C) | 792 | 819 | 900 | 980 | 1007 |
| 250 °F (121.1 °C) | 782 | 809 | 893 | 976 | 1004 |
| 300 °F (148.9 °C) | 769 | 797 | 885 | 972 | 1001 |
| 350 °F (176.7 °C) | 753 | 783 | 875 | 967 | 997 |
| 400 °F (204.4 °C) | 732 | 764 | 863 | 961 | 993 |
| 450 °F (232.2 °C) | 705 | 740 | 847 | 954 | 989 |
| 500 °F (260.0 °C) | 668 | 707 | 826 | 945 | 984 |
| 545 °F (285.0 °C) | 619 | 663 | 799 | 934 | 978 |
| 566.6 °F (297.0 °C) | 588 | 635 | 781 | 928 | 975 |

**Differential boron worth (pcm/ppm).** It is **larger cold** — denser water carries more
boron atoms per unit volume — so the same dilution buys more reactivity at 122 °F than at
power. Use the value for the temperature you are actually at.

| Tavg | 122 °F | 250 °F | 350 °F | 450 °F | 545 °F | 566.6 °F |
|---|---|---|---|---|---|---|
| pcm/ppm | 19.86 | 18.32 | 16.65 | 14.33 | 11.32 | 10.51 |

**Control-bank integral worth** (pcm added, withdrawing from fully inserted). The curve is
an S: least effective at either end, most effective mid-travel.

| Position | 10 % | 25 % | 35 % | 50 % | 65 % | 75 % | 90 % | ARO |
|---|---|---|---|---|---|---|---|---|
| steps | 91 | 228 | 319 | 456 | 593 | 684 | 821 | 912 |
| pcm added | 102 | 499 | 1003 | 2034 | 3065 | 3569 | 3966 | 4068 |

### 7.5.1 Reading the table — and the one rule that matters

> **WARNING — do not dilute toward a hot boron figure while the plant is cold.** Read the
> first column of the table again: with the bank inserted, critical boron is **806 ppm at
> 122 °F** and only **588 ppm at 566.6 °F**. A number that is comfortably subcritical hot is
> **critical, or worse, cold.** This is not a modelling quirk — cold water is a better
> moderator, so a cold core needs *more* poison to stay shut down. Reaching Mode 3 at the
> no-load temperature **before** you dilute is what makes the dilution safe.
>
> This is exactly how the real procedure handles it. WTSM 2.2 *Reactivity Balance
> Calculations* (ML11216A051), Attachment 2.2-1, note on line O: *"Since T avg is required to
> be >541°F, the reactivity change from moderator temperature is considered negligible."* A
> real ECC is only ever computed **hot**, which is why a real operator never faces this
> question. Our plant will let you drive it cold and dilute anyway; the source-range
> high-flux trip at 1e5 cps is the backstop, and it is the last one.

**The acceptance band.** Attachment 2.2-1 line Q brackets the prediction at **±750 pcm**
around the estimated critical position, or the rod insertion limit, whichever is tighter. On
this plant's lumped bank a mid-travel critical point near **318 steps** gives a band of
roughly **159 to 421 steps**. Criticality outside that band means the estimate was wrong —
stop and re-work it, do not keep pulling.

### 7.5.2 The calculation

Adapted from WTSM 2.2 Attachment 2.2-1 (Delta Rho Method). Work from a **last known critical
condition**; every line is a reactivity difference between then and the startup you are
planning.

| Line | Quantity | Source |
|---|---|---|
| A | Bank worth at the desired startup critical position | §7.5 integral-worth table |
| B | Bank worth at the last known critical condition | same table |
| C | **C = A − B** | |
| D | Power defect at the last known critical condition, × (−1) | §11.0 by initial condition |
| E | Present boron | CHEM SAMPLE (there is no live boron meter) |
| F | Boron at the last known critical condition | records |
| G | Differential boron worth **at your present Tavg** | §7.5 boron-worth table |
| H | **H = (E − F) × G** | |
| I / J / K | Xenon at startup / at last critical / **K = I − J** | 2500 pcm at equilibrium full power |
| O | **O = C + D + H + K** | the reactivity change needed |
| P | **P = O / G** — positive means **borate**, negative means **dilute** | |

> **NOTE.** The real worksheet also carries samarium (lines L–N) and drops the moderator term
> because Tavg is required above 541 °F. This plant does not model samarium separately, and it
> *will* let you sit below 541 °F — so if you are cold, the moderator term is **not**
> negligible and the §7.5 table, not this worksheet, is your reference.

## 8.0 Operator training limits (authored standards)

| Parameter | Training target |
|-----------|-----------------|
| SUR on approach | ≤ **1 DPM** — the SUR HI alarm sits exactly there and withdrawal blocks at 1.5 DPM |
| Reactor period | ≥ **30 s** preferred on startup range |
| Power ramp ceiling | ~**10 %/min** class where achievable |
| Load imbalance (SG annunciator) | &gt; ~**4 MWe** mismatch (4 % of rated) → filling/draining cue. Annunciated as **LOAD IMBAL** (Panel B, caution) — see §4. Reducing reactor power without walking the turbine load setpoint down is the usual cause in MANUAL, and it overcools the primary; the annunciator is the only thing that tells you. |

---

## 9.0 Nuclear instrumentation scaling (reference)

| Detector | Scaling note |
|----------|--------------|
| Source range | ~**500 cps** class at HZP source equilibrium; high scale ~1e6 cps near low power |
| Intermediate range | Full scale ~**1e-3 A** near ~12 % power (“maxes out ~10 %”) |
| Power range | 0–120 % calibrated scale; **instrument reads to 200 %** so a pegged meter can still cross the 120 % high-flux trip (strict `crossed()`) |

---

## 10.0 Load mode parameters

| Parameter | Value / behavior |
|-----------|------------------|
| Load follow time constant | ~**45 s** |
| Rated MWe | **100** |
| SCRAM → load mode | **Disconnected** |
| Manual set target | Forces **manual** mode |

---

## 11.0 Normal values by initial condition

Expected readings at each named engine initial condition, captured from the live engine after
settling (60 s at the steady-power states, 5 s otherwise). Four are offered in the Free Play
picker — `hot_full_power`, `50_percent`, `hot_zero_power`, `cold_shutdown`; **`5_percent` is
scenario-only** and is listed here as a reference point for low-power work. Use this table to verify a
healthy board after selecting an IC, and as the "what should this read?" reference during
evolutions. At steady state the **indicated** values track these true values through each
instrument's lag and noise (see `03_CONTROLS_AND_INDICATIONS.md` §16.0) — a mismatch that
persists is either a transient in progress or a failed instrument.

| Parameter | `hot_full_power` | `50_percent` | `5_percent` | `hot_zero_power` | `cold_shutdown` |
|---|---|---|---|---|---|
| Plant MODE | At Power (1) | At Power (1) | At Power (1) | Hot Standby (3) | Cold Shutdown (5) |
| Reactor power (%) | 100 | ≈ 50 | ≈ 6 | ~0 (source) | ~0 |
| Generator output (MWe) | 100 | ≈ 50 | ≈ 6 | 0 | 0 |
| Tavg °F (°C) | 579.2 (304) | ≈ 572 (300) | ≈ 566.6 (297) | 566.6 (297) | 122 (50) |
| T-hot / T-cold °F (°C) | 609.8 / 550.4 (321 / 288) | 588.2 / 557.6 (309 / 292) | 568.4 / 564.8 (298 / 296) | 566.6 / 566.6 (297 / 297) | 122 / 122 (50 / 50) |
| Primary pressure psi (MPa) | 2235 (15.41) | 2235 (15.41) | 2235 (15.41) | 2235 (15.41) | 363 (2.50) |
| Subcooling margin (°C) | ≈ 41 | ≈ 45 | ≈ 48 | ≈ 48 | ≈ 173 |
| PZR level (%) | 55 | ≈ 46 | ≈ 38 | ≈ 37 | 30 |
| SG level (%) | 65 | ≈ 64 | ≈ 65 | 65 | 65 |
| SG / steam pressure psi (MPa) | 819 (5.65) | ≈ 986 (6.8) | ≈ 1160 (8.0) | 1194 (8.23) | ≈ 15 (0.1) |
| Steam / feed flow (norm.) | 1.00 | 0.50 | 0.06 | 0 | 0 |
| Fuel average temp °F (°C) | ≈ 1279.4 (693) | ≈ 924.8 (496) | ≈ 609.8 (321) | 566.6 (297) | 122 (50) |
| Decay heat (%) | 7.0 | 3.5 | ≈ 0.4 | ≈ 0.5 | ~0 |
| Xenon (% of equilibrium) | 100 | ≈ 66 | ≈ 11 | 0 | 0 |
| Boron (ppm) | ≈ 747 | ≈ 837 | ≈ 846 | ≈ 363 | ≈ 919 |
| Net reactivity (pcm) | 0 | 0 | ≈ 0 | ≈ −1000 | ≈ −1000 |
| Source range (cps) | 0 (de-energized) | 0 (de-energized) | 0 (de-energized) | ≈ 500 | ≈ 500 |
| Intermediate range (A) | ≈ 8e-3 | ≈ 4e-3 | ≈ 5e-4 | ≈ 8e-9 | ≈ 8e-9 |
| SR detector | OFF | OFF | OFF | Energized | Energized |
| Condenser vacuum (kPa) | ≈ 96.5 | ≈ 96.5 | ≈ 96.5 | ≈ 96.5 | ≈ 96.5 |
| Turbine speed (RPM) | 1800 | 1800 | 1800 | 1800 | 1800 |
| MSIV | Open | Open | Open | Open | Open |
| RHR | Out of service | Out of service | Out of service | Out of service | **In service** |
| ECCS mode indicator | off | off | off | off | **RHR** |

Notes:

- **PZR level rides the Tavg program** (1.39 %/°F, 2.5 %/°C, 55 % at full-power Tavg): the level column
  IS the program — do not "correct" a 38 % level at low power, it is where the program wants it.
- **Steam pressure rides the load**: full-power 819 psi (5.65 MPa) up to the 1194 psi (8.23 MPa) no-load point
  (= Psat of the 566.6 °F (297 °C) no-load Tavg anchor).
- **Boron differs per IC by design** (rod position and xenon differ); the `hot_zero_power`
  value is low because the control bank is fully inserted and xenon-free ≈ criticality is
  held down by rods, not boron.
- `cold_shutdown` starts with RCPs secured, RHR aligned, and the SR detector energized —
  see `05_MODE_TRANSITIONS.md` PWR-T20 for the climb out.

---

## 12.0 Related documents

- `06_ALARM_RESPONSE.md`  
- `04_NORMAL_OPERATIONS.md`  
- `07_ABNORMAL_EMERGENCY.md`  
