# 09 — Setpoints, Limits, and Normal Values

**Document:** PWR-SP-01  
**Title:** Operating Limits and Protection Setpoints — PWR  
**Revision:** 17  
**Source:** As-built `pwr_control.js`, `pwr_config.js`; normal values captured from the live engine  

**NOTE:** Values are trainer setpoints (SI). Real US plant Tech Specs differ.

**Plant MODES:** Mode 1, At Power = Power Operation (power > 5 %); Mode 2, Startup = Startup (critical ≤ 5 %); Mode 3, Hot Standby = Hot Standby; **Mode 5, Cold Shutdown is simulated and is the cold end of this plant** — `cold_shutdown` and `hot_shutdown` are Free Play initial conditions and the Mode 5 ↔ Mode 1 heatup/cooldown runs on integrated physics (#524, landed 2026-08-31). See `05_MODE_TRANSITIONS.md`.

---

## 1.0 Normal operating point — Mode 1, At Power (Hot Full Power)

| Parameter | Nominal | MODE |
|-----------|---------|------|
| Reactor power | **100 %** | Mode 1, At Power |
| Electrical output | **≈ 100 MWe** | Mode 1, At Power |
| Primary pressure | **2235 psi (15.41 MPa)** | Mode 1, At Power |
| Tavg | **≈ 577.7 °F (303.2 °C)** | Mode 1, At Power |
| Thot / Tcold | **≈ 607.2 / 548.2 °F** (319.6 / 286.8 °C) (ΔT ≈ 59.0 °F / 32.8 °C) | Mode 1, At Power |
| Pressurizer level | **≈ 57 %** | Mode 1, At Power |
| Steam Generator level | **≈ 65 %** | Mode 1, At Power |
| Secondary steam pressure | **≈ 808 psi (5.57 MPa)** — measured on a settled ride; Ginna's sourced 810 psig full-load outlet is the anchor it was tuned to (#419 wave 3) | Mode 1, At Power |
| Subcooling margin | **≈ 45 °F** (25 °C) | Mode 1, At Power |
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
| Power range (high) | high | **118 %** | Full-power high flux. The 103 % rod stop (§2.0) sits below it, so the stop acts first |
| Power range (low setpoint) | high | **35 %** | Startup; blockable above P-10 |
| Tavg | high | **NOT MODELLED** | A real plant trips on high average coolant temperature. This one does not — the overtemperature ΔT trip below covers the same ground here, on the sourced Table 15.0-7 equation. Kept so the contrast is visible, not because the plant will act on it |
| Primary pressure | high | **2425 psi (16.72 MPa)** | |
| Primary pressure | low | **1775 psi (12.24 MPa)** | |
| PZR level | low | **NOT MODELLED** | A real plant trips the reactor on low pressurizer level. This one does not: the 17 % letdown-isolation and heater cut (§6.0, annunciated **PZR LTDN ISOL**) is the only low-level action, and the plant will keep running below it. Kept so the contrast is visible |
| SG level | low | **17 %** | Lo-lo; the same signal auto-starts AFW (single-signal, as in the real plant) |
| SG level (P-14) | high | **90 %** | High-high; reactor trip via P-9, condition **≥50 % power** |
| **Turbine trip (P-9)** | turbine tripped | — | **Reactor trip on turbine trip**, condition **≥50 % power** (P-9). Above P-9 a turbine trip scrams the reactor *immediately* — it is not a ride-out. Below P-9 there is no reactor trip and the steam dump carries the transient. A **planned offline** (generator OFF / `disconnect_grid`) is **not** a turbine trip and never arms this — see `03` §12.1 |
| RCS loop flow | low | **87 % of rated** | Low-flow trip; reads the `loop_flow` elbow-tap channel. Blockable below **P-7 (10 % power)**, auto-reinstates above. Real Westinghouse setpoint. **One channel, not 2-of-3** — see `12` §10.7 for that departure and what it costs |
| Source range | high | **1e5 cps** | When SR energized |
| Intermediate range | high | **25 % (2.08e-3 A)** | Startup; blockable above P-10, and the SAME press clears the 20 % rod stop below. **This row read 1.67e-3 A / “~20 %” until #601** — the retired plant’s number, and it was the ROD STOP’s setpoint written into the TRIP’s row. Same channel, two setpoints: the stop at 20 % acts first, this trip at 25 % is what happens if it does not hold. Sourced: WTSM 12.2 §12.2.3.3 (ML11223A301) — *“the current output from at least one of the two intermediate range channels indicates greater than the equivalent of 25% power”*. Ginna publishes no number for this Function (UFSAR ch15 §B: *“a pre-selected, manually adjustable setpoint”*), so the generic Westinghouse figure is the sourced one |
| Primary pressure (SI trip, PI-3) | low | **1715 psi (11.824 MPa)** | Reactor trip on safety injection; blockable below P-11 (1973 psi (13.6 MPa)), auto-reinstates |
| PZR level (PI-8) | high | **87 %** | Going-solid backstop, and it is the anchor plant's figure rather than the four-loop 92 %. Armed above P-7; the 70 % alarm warns first |
| **Overtemperature ΔT (OTΔT)** | low margin | **variable (calculated)** | **Core protection against departure from nucleate boiling.** Compares indicated loop ΔT against a setpoint that MOVES with average temperature and reactor coolant pressure — the same ΔT is safe at one condition and a trip at another, which is what no single-parameter trip can see. **Cannot be blocked** (WTSM 12.2 Table 12.2-1, *"No Interlocks"*). Board readout: **core ΔT margin**, NIS card |
| **Overpower ΔT (OPΔT)** | low margin | **variable (calculated)** | **Core protection against excessive heat rate in the fuel** (kW/ft). Same loop-ΔT signal, compensated for average temperature only. **Cannot be blocked.** Its design-basis events include the **steam line break** — before it existed, a 30 % break held the core at 114 % power for thirty minutes with no reactor trip |

### Permissives / blocks

| Name | Value | Effect |
|------|-------|--------|
| **P-6** | IR ≥ **1e-10 A** | Allows SR de-energize |
| **P-9** | Power ≥ **50 %** | Arms the **reactor trip on turbine trip** and the P-14 reactor trip; also gates the loss-of-MFW AFW start |
| **P-7** | Power ≥ **10 %** | Arms the **low-flow reactor trip**; below it the trip may be blocked (RCPs are secured in Mode 5, where RHR provides circulation) and it auto-reinstates above |
| **P-10** | Power ≥ **8 %** | Allows IR/PR low-setpoint trip blocks. Note this is NOT the same threshold as P-7 above — the two are 8 % and 10 % on this plant and are easy to conflate |
| **P-11** | Pressure ≥ **1973 psi (13.6 MPa)** | Below it the SI trip may be blocked; auto-reinstates above |
| **P-12** | Tavg low **532.4 °F (278 °C)** | LO TAVG annunciator (`PWR-A29`) — ~14.4 °F (8 °C) below the 546.8 °F (286 °C) no-load anchor (#419 wave 3; Ginna's numeric P-12 is in its TS proper, fetch owed) |
| SR re-energize block | IR ≥ **1e-6 A** | Protects SR detector |

### Rod withdrawal interlocks — the four rod stops

| Rod stop | Blocks withdrawal when | Notes |
|---|---|---|
| **Power range high flux** | power range power > **103 %** | Not blockable. Sits below the 118 % high-setting trip: the stop acts first, the trip is what happens if it does not hold |
| **Intermediate range high flux** | intermediate range > **20 % current equivalent** | **Blockable at P-10, on the INTERMEDIATE RANGE trip’s own control** — one press takes the 25 % trip and this stop together. It rode the 35 % low-setting flux trip’s control until #601, which was the wrong lever: WTSM 12.2 lists P-10’s functions as two separate operator actions, *“1. Allows the operator to manually block the intermediate range high flux trip and the C-1 rod stop, 2. Allows the operator to manually block the low setpoint power range high flux trip”*. That block is the power-ascension step, and it is why this stop is a startup interlock rather than an at-power one |
| **Overtemperature ΔT** | OTΔT margin ≤ **3 % of rated ΔT** (clears above 6 %) | Also drives the turbine runback — see below |
| **Overpower ΔT** | OPΔT margin ≤ **3 % of rated ΔT** (clears above 6 %) | Also drives the turbine runback |
| **Insertion** | never blocked, by any of them | |

**All four are sourced together**, WTSM 8.1 §8.1.7.3 (ML11223A252), *Manual Rod Withdrawal Stops*,
and corroborated on the anchor plant — Ginna UFSAR ch7 (ML20339A027): *"The overpower rod stops
are initiated by one-out-of-four high nuclear flux of 103 %; one-out-of-two high flux at 20 %
current equivalent power; two-out-of-four high overtemperature delta T at 3 % of rated loop T
below trip setpoints; and high overpower delta T at 3 % of rated."*

**Pressing WITHDRAW into a standing rod stop is refused, and the refusal names which stop.**
Inward motion still takes — that is the source's own scope, quoted at the end of this section.

> **There is no startup-rate rod stop, and this table used to say there was** (#572). It listed a
> withdrawal block at **1.5 DPM** clearing below **0.8**, and the SUR readout on the board painted
> a red band there. No source in the corpus contains such an interlock; the figure came from the
> retired engine's control tables, which the board was still reading. **Measured before the fix:
> the plant ran to 10.00 DPM — 6.7× the band it was painting — across 90 consecutive withdrawal
> commands with none refused**, and stopped only at a reactor trip. The band is gone. The **SUR HI
> alarm at 1 DPM is real and stays**: it is an annunciator, not an interlock, and it is still the
> right thing to watch on a startup.

**The ΔT rod stops are the OTΔT / OPΔT trip's own early warning**, three percent before it fires, and they annunciate as **OTΔT ROD STOP** / **OPΔT ROD STOP** on Panel A. Sourced: WTSM 12.2 §12.2.3.7–.8 and Table 12.2-2 rows C-3/C-4 — *"Loop ΔT > (OTΔT reactor trip setpoint − 3%)… Stops control rod outward motion (manual & automatic) and initiates a turbine runback."* **The turbine runback is built** (#318), and it is the half that acts rather than refuses. When the ΔT margin has HELD below the rod stop for about **8.5 seconds** — a brief dip does not count, and that delay stands in for the two-out-of-four loop voting a single-loop plant cannot have — the plant reduces the **generator load target** by **5 % of rated in about 1.5 seconds, then holds it steady for 28.5 seconds and looks again** — if the condition has not cleared, another 5 % in the next 30-second interval, and so on. You will see the number in the Generator Load box drop in steps with nobody touching it. It does **not** put the load back afterwards; that is yours to do once the condition is fixed. It never touches the reactor: it reduces LOAD, and the core follows the load down through the moderator coefficient, which is why it works and also why it is not instant. Sourced: WTSM 11.3 *Westinghouse Electrohydraulic Control System* (ML11223A295), Turbine Runbacks — *"the EHC system reduces load at 200%/min for 1.5 sec (a 5% load change), then holds the load constant for 28.5 sec. If the runback condition has not cleared, the load will be reduced by another 5% in the next 30-sec interval."* Measured on this plant: a **15 % steam line break** takes two steps to 90 MWe and becomes a ride-out instead of a reactor trip, while a **30 % break** and a continuous rod withdrawal still trip — they outrun the coupling the runback works through. Like every rod stop here, it blocks **withdrawal only** — *"The rods can always be inserted into the core using either manual or automatic rod control"* (WTSM 8.1 §8.1.7.3).

---

## 3.0 Engineered safety & automatic actuations

> **A NOTE ON psi vs psig, because this set mixes the two conventions and the difference is
> real.** Every pressure printed in this manual set is **absolute (psia)** — it is a conversion of
> the engine's MPa, which is absolute. Real Westinghouse documentation quotes pressurizer
> setpoints in **gauge (psig)**, and the two differ by one atmosphere, **14.7 psi**.
>
> The consequence is a small internal inconsistency, declared here rather than silently carried.
> Our nominal **2235 psi** takes the real plant's *2235 psig* and reads it as absolute — so it is
> 14.7 psi below the real operating point.
>
> **The PORV is not affected, because it is not a converted number at all.** It lifts **100 psi
> above whatever the pressure setpoint is**, which is the real plant's own nominal-to-PORV margin
> taken directly, so the margin is exactly **100 psi** and stays 100 psi wherever you put the
> setpoint. What the sourced **2335 psig** figure gives us is the valve's *rating* point — the
> pressure at which "179,000 lb/hr" is the flow — not its lift point. (Before 2026-08-30 this
> paragraph claimed a fixed 2350 psi PORV and a 115 psi margin; that was the retired engine's.)
>
> **This is not being "fixed" by moving 2235.** That number is the pressure anchor of the whole
> plant — every equilibrium, initial condition, alarm band and scenario is referenced to it — and
> re-anchoring it 14.7 psi to buy 15 psi of margin fidelity would re-baseline the entire model for
> no behavioural gain. Recorded 2026-08-12 so the next reader who spots the mismatch finds the
> reason instead of the discrepancy. Real values for reference (WTSM 10.2, **ML11223A287**):
> nominal **2235 psig**, spray starts **2260 psig**, spray full open **2310 psig**, PORV
> **2335 psig**, safeties **2485 psig**.

| Function | Instrument | Direction | Setpoint | Reset / notes |
|----------|------------|-----------|----------|---------------|
| Open PORV | primary_pressure | high | **Press SP + 100 psi (0.69 MPa)** — not a fixed number | Reseat at **SP + 85 psi (0.586 MPa)**, a 15 psi (0.103 MPa) deadband. At the **2235 psi (15.41 MPa)** nominal setpoint that is **2335 psi (16.099 MPa)** open, **2320 psi (15.996 MPa)** shut. It reads the **indicated** channel, so a failed pressure instrument moves it |
| Open PZR safety | primary_pressure | high | **2500 psi (17.24 MPa)** | Reseat **5 %** below, at **2375 psi (16.375 MPa)** — the reseat *fraction* is sourced (Ginna ch15 Model 1: "did not reseat until the pressure dropped 5% below the opening setpoint"). Reads **true** pressure, not the channel: a spring valve cannot be fooled by an instrument |
| HPI start (Safety Injection) | primary_pressure | low | **1715 psi (11.824 MPa)** | **There is no ESF arm to set** — this actuation is not defeatable, it latches, and securing the pumps needs the reset permissive (**03 §17.4**). Arrives with the low-pressure trip |
| HPI start (SI on low steam pressure) | steam_pressure | low | **328 psi (2.26 MPa)** | The secondary-side entry to the same SI latch — a steam-line depressurization actuates injection without the primary ever reaching 1715 psi (11.824 MPa). **This row was missing from the manual entirely until 2026-08-30** |
| HPI start (SI on high-high steam flow) | sg_steam_flow | high | **1.55** of rated | Third entry to the SI latch |
| HPI start (SI on PZR level lo-lo) | pzr_level | low | **NOT MODELLED** | A real plant carries an inventory-protecting SI path that fires on level even while the heaters hold pressure. **This plant's engineered-safeguards list has exactly three entries and this is not one of them**, so on a slow inventory loss nothing starts injection until pressure itself reaches 1715 psi (11.824 MPa). Kept because the coupling is real operator knowledge — level and pressure are not the same signal — and because knowing which of the two your plant actually watches is the point. Formerly documented as live at **12 %**, re-arming above **20 %**; rides the HPI arm |
| Letdown isolation | pzr_level | low | **17 %** indicated | **This row declared the function absent until 2026-09-04, and was wrong** — it contradicted §2.0's own PZR-level row and the engine, which has carried this isolation all along (`pwr2_pressurizer`, `LEVEL.low_cut_pct`). At **17 %** indicated pressurizer level the plant isolates letdown to stop the leak-out path making a low level worse, and it stops **both** letdown paths: the orifices *and* the RHR-to-CVCS cross-connect. Annunciated **PZR LTDN ISOL** (§4.0); the same 17 % also cuts the pressurizer heaters (§6.0). **It does not move your orifice selection and it does not restore itself.** The latch clears when level recovers past **20 %**, but letdown stays shut until you re-select an orifice by hand — the restoration is an operator act (WTSM §4.1.3.1, ML11223A214: *"The letdown orifice isolation valves automatically close on low pressurizer level"*, and nothing in that chapter re-opens them). Response: **06** PWR-A13a. ⚠ Whether the real interlock reaches HCV-128 (the cross-connect) or only the normal-line valves is **unverified**; this plant stops both, by ruling |
| Feedwater isolation (on SI) | primary_pressure | low | **1715 psi (11.824 MPa)** | **Sourced 32 s delay behind the LATCHED SI signal** (Ginna Table 15.0-6, "Feedwater Isolation Delay from SI … 32.0"), and it is *held* time, not edge — a reset that clears SI inside the 32 s cancels the isolation. There is no HPI arm for it to ride |
| **Atmospheric dump (ADV)** | steam_pressure | high | **1055 psi (7.272 MPa)** — the sourced 1040 psig | **SHIPS IN AUTO.** Vents to atmosphere, upstream of the MSIV and independent of the condenser: this is the cooldown path when the condenser is gone. In AUTO it holds a bottled generator at the setpoint instead of on the 1099 psi (7.58 MPa) code safeties — but capping pressure is not a cooldown; lower the setpoint or open the valve for that. Full open at 1078 psi (7.43 MPa); capacity 10 % of rated steam flow. Sourced twice over (#419 wave 3): the WTSM §7.1.3.3 placement rule — *"approximately half the difference between the no-load steam generator pressure and the lowest set pressure of the safety valves"*, which on the Ginna ladder (1020 → 1099 psi) is 1060 — and Ginna's own ARV solenoid band, 1005–1060 psig (UFSAR ch 10), which brackets it; capacity is the same section's *"approximately 10% of the rated steam flow … from each steam generator"*. Setpoint box clamps to the same 29–1099 psi band as the Dump SP. Cools well past the 100 °F/hr limit at full open — see `12` §12.18 |
| **Main steam line isolation (MSLI)** | steam_pressure | low | **NOT MODELLED** | **The main steam isolation valve on this plant closes only when you close it.** There is no automatic isolation signal of any kind — not on low steam pressure, not on steam flow, not on containment pressure. The valve itself is real (**03 §17.5**), and so is the reasoning about *when* a steam line wants isolating; what is absent is anything that does it for you. Formerly documented as a rate-compensated **600 psi (4.14 MPa)** leg in coincidence with `sg_steam_flow` **> 1.25** of rated |
| **MSLI (containment leg)** | containment_pressure | high | **NOT MODELLED** | Same absence as the row above, by the other signal. Formerly documented at **44.7 psi (0.308 MPa)** absolute — the sourced **30 psig** hi-hi |
| **SI backup (containment)** | containment_pressure | high | **NOT MODELLED** | The high-energy-line-break backup, which starts injection on building pressure when the primary has not yet fallen far enough to. This plant's three engineered-safeguards entries are all primary- or steam-side, so **a break that pressurizes containment without depressurizing the loop starts nothing.** Formerly documented at **18.1 psi (0.125 MPa)** absolute — the sourced **3.5 psig** |
| **Containment spray** | containment_pressure | high | **NOT MODELLED** | The building has no sprays. `pwr2_containment` declares it in its own header and the plant publishes `ctmt_spray_demand` and `ctmt_spray_active` as permanently false, so the absence is machine-readable rather than a silence. Containment pressure and temperature are real and rise on a large break; **nothing brings them back down but the building's passive heat sink.** Formerly documented as auto-only on the **44.7 psi (0.308 MPa)** hi-hi |
| **Fan coolers, safety realign** | hpi_active | is_true | **NOT MODELLED** | Same declaration, same fields (`ctmt_fan_safety`, `ctmt_fan_active`). Ginna TS B 3.6.6 has the containment recirculation fans auto-start on safety injection; here fan cooling is folded into the passive heat sink and there is no realign to see |
| **H₂ recombiners, auto-start** | ctmt_h2_pct | high | **NOT MODELLED** | `ctmt_recomb_demand` and `ctmt_recomb_active` are declared static false. **Containment hydrogen itself is real** — it is computed from the oxidation and published as `ctmt_h2_pct` — so it accumulates on a damaged core and nothing removes it. Formerly documented as starting at **0.5 % vol** and securing at **0.2 % vol** |
| **H₂ flammability alarm** | ctmt_h2_pct | high | **4.1 % vol** | The sourced lower flammability limit of hydrogen in air (NUREG-1431 Bases). Alarm only (PWR-A40) — nothing actuates on it; the response is at the core |
| **H₂ ignition (the burn)** | true concentration | high | **NOT MODELLED** | `ctmt_h2_burned` is declared static zero: hydrogen reaches the flammability limit on this plant and **does not ignite**. Formerly documented as a one-time deflagration at **8.0 % vol** — a bracketed template value corroborated by TMI-2's estimated 7.9 % (GEND-061). The alarm above still tells you the mixture got there, which is the operator-relevant half |
| AFW start | sg_level | low | **17 %** | Same signal as the lo-lo reactor trip (single-signal). **There is no arm to set** — the actuation is inside the engine, no operator command disarms it, and the board AUTO button is a lamp (**03 §17.4**) |
| AFW start (loss of MFW, PI-4) | fw_flow | low | **0.10** normalized | Above P-9 (≥50 % power) |
| MFW isolation + AFW start (P-4) | tavg | low | **552.2 °F (289 °C)** | Condition: reactor tripped — the post-trip MFW→AFW handoff; computed as the no-load anchor + 5.4 °F (3 °C), so it moved with the #419 wave-3 anchor |
| SR re-energize assist | intermediate_range | low | **1e-10 A** | Actuation path as configured |
| Open SG safety | steam_pressure | high | **1099 psi (7.58 MPa)** | Reseat **1063 psi (7.33 MPa)**. The pop is Ginna's first-lift MSSV, 1085 psig (UFSAR ch 10 §10.3.2.4); the single modeled valve carries the sourced bank capacity (0.84× rated) at that first-lift point (#419 wave 3) |
| Turbine trip (vacuum) | condenser_vacuum | low | **22 inHg (74.5 kPa)** | Reset region **25 inHg (84.7 kPa)** |
| Turbine trip (overspeed) | turbine_rpm | high | **1980 RPM** | Reset below ~**1800 RPM**. **CONFIGURED BUT NOT REACHABLE in this simulator** — there is no turbine roll model, so the rotor is either pinned at rated by the grid or coasting down. Measured peak: **1800 RPM** on line in Follow, **1800** in Manual with a 2×-rated MWe demand, **1799** with the MSIVs shut and the breaker closed. Declared at **12** §12.14; pinned by `run_reachability` B3 |
| Turbine trip (SG hi-hi / P-14) | sg_level | high | **90 %** | Re-arm below **85 %** |
| Steam dump (pressure mode) | steam_pressure | high | **1020 psi (7.03 MPa)** | = Ginna's sourced 1005 psig no-load point (TS Bases B 3.3.2) = Psat(546.8 °F (286 °C)), the no-load Tavg anchor; capacity **28 %** of rated steam flow — Ginna's own (UFSAR ch 10; #419 D1, adopted after the full-rejection ride-out measured survivable at it). **This is the value in the Dump SP box, and it is read only in this mode. The mode is SELECTED, not permanent**: pressing STEAM DUMP AUTO with the turbine **tripped** selects it — heatup, cooldown, hot standby (WTSM §11.2; `03` §12.3, #629). The cold plant boots with the controller out of service, so on a heatup the selection is an operator action |
| Steam dump (trip-open mode) | tavg error | — | opens on the Tavg error above the no-load reference, full demand ~14.4 °F (8 °C) above it | Inside **Tavg mode**, which is what AUTO selects with the turbine **on line**. On turbine trip; needs the condenser (unavailable on lost vacuum / MSIV shut). **It cannot serve a heatup**: the controller opens only above the **557 °F (291.67 °C)** no-load reference, which is above the atmospheric dump valve's relief point below, so a plant left in Tavg mode while heating up rides that valve instead (#629) |
| Spray flow cap | — | — | **12 %** of full spray flow | Sized for step insurges; cannot suppress a loss-of-heat-sink repressurization |
| Main feedwater isolation (P-14) | sg_level | high | **90 %** | Latches (manual restore); AFW unaffected. Re-arm below **85 %** |

### HPI pump curve (merged HPI/LPI)

- High-head trickle against operating pressure.  
- **Two pumps, two curves.** High-head shutoff **1390 psi (9.58 MPa)**, reaching its full **300 gpm** only below about **515 psi (3.55 MPa)**; low-head shutoff **215 psi (1.48 MPa)**, delivering **1200 gpm** near atmospheric. Injection that looks inert at high pressure is the pump curve, not a fault.  

### AFW delivery

- Delivered flow = capacity × throttle × level-hold taper near target.  
- **AFW latches.** Once it auto-starts on low steam-generator level it keeps feeding until
  an operator secures it — it does not stop by itself. Deciding when to secure it is the
  operator's call, and it should not be left running once a trusted heat sink is back.  
- **Level hold: full flow below 32 %, tapering to zero at 40 %.** Against decay-heat steam
  draw an AFW-only generator settles around **37 %** — inside the normal green band, clear
  of the 30 % SG LVL LO alarm. The approach is slow (AFW is rated 86.2 gpm against main feed), so
  expect level to take the best part of an hour to walk back up from a low-level start.  

---

## 4.0 Alarm setpoints

### Panel A — Reactor / primary

| ID | Name | Instrument | Dir | Setpoint | Priority |
|----|------|------------|-----|----------|----------|
| reactor_trip | REACTOR TRIP | rps_scrammed | true | — | critical |
| high_flux | HI FLUX | power_range | high | **108 %** | critical |
| high_tavg | HI TAVG | tavg | high | **594 °F (312.2 °C)** | warning |
| low_tavg | LO TAVG (P-12) | tavg | low | **532.4 °F (278 °C)** | warning † |
| cooldown_rate_high | RCS COOLDOWN RATE HI | tavg_rate | low | **−100 °F/hr (−55.6 °C/hr)** | warning |
| heatup_rate_high | RCS HEATUP RATE HI | tavg_rate | high | **100 °F/hr (55.6 °C/hr)** | warning |
| pzr_pressure_high | PZR PRESS HI | primary_pressure | high | **2300 psi (15.86 MPa)** | warning |
| pzr_pressure_low | PZR PRESS LO | primary_pressure | low | **2149 psi (14.82 MPa)** | warning † |
| pzr_pressure_lolo | PZR PRESS LO LO | primary_pressure | low | **1800 psi (12.41 MPa)** | critical † |
| porv_open | PORV OPEN | porv_indicator | open | — | warning |
| sur_high | SUR HI | startup_rate | high | **1 DPM** | caution |
| sr_high_flux | SR HI FLUX | source_range | high | **5e4 cps** | caution |
| subcooling_low | LO SUBCOOL | subcooling_margin | low | **20 °F** (11.1 °C) | warning |
| subcooling_lost | SUBCOOL LOST | subcooling_margin | low | **0 °F** (0 °C) | critical |
| pzr_level_high | PZR LVL HI | pzr_level | high | **75 %** | caution |
| pzr_level_low | PZR LVL LO | pzr_level_dev | low | **20 % below program** | warning |
| pzr_level_cutoff | PZR LTDN ISOL | pzr_level | low | **17 %** | warning |
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
| hpi_active | SAFETY INJECTION | hpi_active | true | — | critical |
| sbo | SBO | station_blackout | true | — | critical |
| turbine_trip | TURB TRIP | steam_demand_low | true | — | warning † |
| load_imbalance | LOAD IMBAL | sg_imbalance_active | true | > **4 %** of rated (4 MWe) | caution |
| msiv_closed | MSIV SHUT | msiv_open | false | — | warning |
| sg_press_high | SG PRESS HI | steam_pressure | high | **1063 psi (7.33 MPa)** | caution |
| cond_vac_low | COND VAC LO | condenser_vacuum | low | **25 inHg (84.7 kPa)** | caution |
| cond_vac_trip | COND VAC TRIP | condenser_vacuum | low | **22 inHg (74.5 kPa)** | warning |
| rcp_cavitation | RCP CAVITATION | rcp_cavitating | true | — | warning |
| accum_aligned | SI ACCUM ALIGNED &lt; 1000 PSI | primary_pressure | low | **1000 psi (6.895 MPa)** § | caution |

**§ The only annunciator gated on a LINEUP as well as a reading.** It requires the accumulator discharge isolation valve indication (`accum_valve_open`) to read **open** as well as pressure to be below setpoint, so a correctly-isolated Mode 5 plant — which sits below this pressure indefinitely — never sees it. The setpoint is where **LCO 3.5.1** stops requiring the accumulators OPERABLE (*"MODE 3 with RCS pressure &gt; [1000] psig"*) and LTOP **SR 3.4.12.3** starts requiring them isolated, leaving 400 psi (2.76 MPa) above their cover gas. **There is no autoclose interlock and that is deliberate** — see **06 PWR-A32**.

**§ RHR — the suction valve has TWO setpoints, and the autoclose is the higher one.** The valve will not **open** above **440 psi (3.03 MPa)** — the sourced **425 psig**, WTSM §5.1. That is the block-open permissive: a **gate on your open command**, not a trigger, because there is no RHR start actuation (#453). A standing-open valve **autocloses** only once pressure rises back above **600 psi (4.14 MPa)**. Both are sourced. NUREG-0933 **Issue 99, "RCS/RHR Suction Line Valve Interlock on PWRs" (Rev. 3)**: *"Two basic features are incorporated in the interlock design: (1) an automatic closure signal on high RCS pressure (typically 600 psig), and (2) a block of the manual open signal at a lower RCS pressure (typically 425 psig)."* The Westinghouse Technology Systems Manual **§5.1** (ADAMS **ML11223A219**) gives the same structure for valves 8701/8702 — open block 425 psig, autoclose ~585 psig.

**Why the gap matters to you.** Between the two setpoints the valve stays where it is. That is what keeps a plant hunting around the permissive from chattering the valve — and since **nothing re-opens it but you** (**06 PWR-A33**), a spurious closure is permanent until you act. Until 2026-07-31 this plant used one constant for both jobs, so the deadband was zero: a cooldown whose pressure-control setpoint sat at **409 psi (2.82 MPa)** aligned RHR, rebounded nine psi, auto-closed, and never recovered. **Practical consequence:** do not read "below 400 psi" as the condition for *keeping* RHR — it is the condition for *getting* it. Once aligned you have to reach **600 psi (4.14 MPa)** to lose it.

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
| Heater low-level cutoff / restore | **17 % / 20 %** indicated PZR level |
| Heater bank elevation | **5 % – 15 %** TRUE PZR level (unverified estimate; the elevation is sourced, the two figures are this plant's). Delivered heat scales with the wetted fraction of the band — entirely below the cutoff above, so it is reachable only when the level channel is lying |
| Heater ESF load shed | **safety injection** signal or **loss of offsite power** — latched; cleared only by an operator heater action, not by securing injection |
| Spray proportional band | **50 psi (0.345 MPa)** |

---

## 7.0 Rod drive

| Parameter | Value |
|-----------|-------|
| Control bank max steps | **627** fully withdrawn (fine-step drive). Differential worth is **4.15 pcm/step off the bottom, 8.82 peak at mid-travel, 6.49 averaged over the bank**; **in the startup critical band it is 8.1 pcm/step = 1.24 ¢**. ⚠ Do not quote the bank average as the critical-band figure: this plant's cent is **6.50 pcm** (β_eff 650.2) and its bank average is **6.49 pcm/step**, two unrelated quantities that happen to coincide, and neither is the value that applies during the approach to criticality |
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
     cell against RD.pwr2.kinetics.criticalBoron at 2235 psi (15.41 MPa), so this cannot go
     stale without reddening a gate. Do not hand-edit the numbers.

     ⚠ IT WAS GATED AGAINST THE WRONG PLANT until 2026-09-03 (#618). This comment used to
     say "pwr_engine's own reactivity model" — the RETIRED engine, which no public build
     ships (#523) — and run_reactivity.js hard-coded COLS = [0, 228, 456, 684, 912], the
     retired 912-step bank. So the table sat on the retired plant's scale for months with
     a GREEN gate agreeing with it, which is exactly why nobody caught it: the check was
     real, the tolerance was 1 ppm, and it was measuring the wrong plant. If you repoint a
     manual table at a new engine, repoint its gate in the same change. -->

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

| Tavg | bank IN (0) | 25 % (157) | 50 % (314) | 75 % (470) | ARO (627) |
|---|---|---|---|---|---|
| 122 °F (50.0 °C) | 811 | 849 | 910 | 971 | 1010 |
| 200 °F (93.3 °C) | 797 | 837 | 901 | 965 | 1005 |
| 250 °F (121.1 °C) | 786 | 827 | 894 | 961 | 1002 |
| 300 °F (148.9 °C) | 772 | 816 | 886 | 955 | 999 |
| 350 °F (176.7 °C) | 755 | 802 | 876 | 949 | 996 |
| 400 °F (204.4 °C) | 734 | 784 | 863 | 942 | 992 |
| 450 °F (232.2 °C) | 707 | 761 | 848 | 934 | 988 |
| 500 °F (260.0 °C) | 670 | 730 | 827 | 922 | 983 |
| 545 °F (285.0 °C) | 622 | 690 | 800 | 908 | 977 |
| 546.8 °F (286.0 °C) | 619 | 688 | 798 | 908 | 977 |

*(Re-measured 2026-09-03 on the **shipped** engine, `RD.pwr2.kinetics.criticalBoron`, against the
627-step bank. It previously described the RETIRED engine's 912-step bank, and so did the gate that
was supposed to catch the drift — see the note below. The bank-IN and ARO columns barely moved; the
25 % and 75 % columns did, because this plant's worth curve is a different shape:
`curve_flatten` 0.36, the four-bank overlap program of WTSM 8.1 §8.1.5.4.)*

**Every cell is computed at normal operating pressure, 2235 psi (15.41 MPa)**, including the cold
rows — which is a stated simplification, not a claim that a 122 °F plant is at 2235 psi. Boron is
a density coupling, so pressure moves these numbers: the same 122 °F bank-IN cell reads **818 ppm**
at a realistic cold-shutdown 363 psi (2.5 MPa) against **811 ppm** here, and the spread is largest
in the bank-IN column and smallest at ARO. **Read the cold rows for the temperature lesson in
§7.5.1, not as a dilution target for a depressurized plant.**

**Differential boron worth (pcm/ppm).** It is **larger cold** — denser water carries more
boron atoms per unit volume — so the same dilution buys more reactivity at 122 °F than at
power. Use the value for the temperature you are actually at.

| Tavg | 122 °F | 250 °F | 350 °F | 450 °F | 545 °F | 566.6 °F |
|---|---|---|---|---|---|---|
| pcm/ppm | 20.46 | 18.77 | 16.89 | 14.48 | 11.45 | 10.59 |

**Control-bank integral worth** (pcm added, withdrawing from fully inserted). The curve is
an S: least effective at either end, most effective mid-travel.

| Position | 10 % | 25 % | 35 % | 50 % | 65 % | 75 % | 90 % | ARO |
|---|---|---|---|---|---|---|---|---|
| steps | 63 | 157 | 219 | 314 | 408 | 470 | 564 | 627 |
| pcm added | 271 | 786 | 1232 | 2038 | 2836 | 3282 | 3797 | 4068 |

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
this plant's lumped bank the **719 ppm reference startup goes critical at 223 steps**, and that
gives a band of roughly **111 to 310 steps** (measured 2026-09-03). Criticality outside that band
means the estimate was wrong — stop and re-work it, do not keep pulling.

**The band is checked against, not steered to.** WTSM 19.0 (ML11223A342) Appendix 19-1 step 11
gives the response, and it is not a rod adjustment: if the bank goes critical below the 0 %-power
insertion limit, reinsert all control rods to the bottom, recompute the estimated critical boron,
borate to it, and withdraw again. NUREG-1431 Rev 4 Bases B 3.1.6 is explicit that the estimate
*"could be substantially in error"* — it is a prediction with an acceptance band, never a target.

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

### 7.5.3 SHUTDOWN MARGIN — and why it is not the number the board shows you

**SDM is computed with ALL RODS ASSUMED INSERTED** except the single highest-worth rod, which is
assumed stuck fully withdrawn. It is a *calculated* quantity, not a reading: it answers *"if the
reactor tripped right now, how far subcritical would it be?"* — which is a different question
from *"how far subcritical is it right now?"*

This manual set said "cold shutdown margin" for the second quantity until 2026-08-12. The two
coincided only because the shutdown bank used to be parked withdrawn in Mode 5, which it no
longer is (**04** PWR-N01 step 2a). Measured on this plant at cold shutdown, 857 ppm:

| Quantity | Value | What it is |
|---|---|---|
| Net reactivity, banks as they sit | **−4676 pcm** | both banks in — what the plant *is* |
| Net reactivity, shutdown bank withdrawn | **−1000 pcm** | after PWR-N01 step 2a |
| Boron's own contribution | **~1000 pcm** | the trim target the initial condition is solved to |
| Shutdown bank worth | **3676 pcm** | the margin a trip restores |

**The operational point.** Withdrawing the shutdown bank does not make the plant unsafe — it is
still 1000 pcm subcritical — but it spends the margin that was buying you *time*. Measured: an
unattended dilution at the plant's make-up rate takes **79 minutes** to reach criticality with the
bank in, and trips the source range **inside the hour** with it out. That is what a shutdown
margin is for, and it is why the real procedure verifies it before the bank moves
(**ML11223A342** App 19-1 A.12 / C.8).

**Applicability:** NUREG-1431 **LCO 3.1.1** — MODE 2 with k_eff < 1.0, and MODES 3, 4, 5.
Commercial practice keeps boron sufficient for at least **1 % Δk/k** (WTSM 19.2.1).

## 8.0 Operator training limits (authored standards)

| Parameter | Training target |
|-----------|-----------------|
| SUR on approach | ≤ **1 DPM** — the SUR HI alarm sits exactly there, and it is the ONLY rate cue: nothing blocks withdrawal on rate (§2.0) |
| Reactor period | ≥ **30 s** preferred on startup range |
| Power ramp ceiling | ~**10 %/min** class where achievable |
| Load imbalance (SG annunciator) | &gt; ~**4 MWe** mismatch (4 % of rated) → filling/draining cue. Annunciated as **LOAD IMBAL** (Panel B, caution) — see §4. Reducing reactor power without walking the turbine load setpoint down is the usual cause in MANUAL, and it overcools the primary; the annunciator is the only thing that tells you. |

---

## 9.0 Nuclear instrumentation scaling (reference)

| Detector | Scaling note |
|----------|--------------|
| Source range | ~**500 cps** class at HZP source equilibrium; high scale ~1e6 cps near low power |
| Intermediate range | Full scale ~**1e-3 A** near ~12 % power (“maxes out ~10 %”) |
| Power range | 0–120 % calibrated scale; **instrument reads to 200 %** so a pegged meter can still cross the 118 % high-flux trip (strict `crossed()`) |

---

## 10.0 Load mode parameters

| Parameter | Value / behavior |
|-----------|------------------|
| Rated MWe | **100** |
| Dispatch modes | **One** — the operator's load target. There is no Follow or Disconnected selector; the machine is taken off line with **UNLOAD** (**03** §12.1) |
| **Load-target ramp rate — RAISES ONLY** | **5 % of rated per minute = 5 MWe/min**, applied to a load **increase**. What you type is the dialled target and lands on the board at once; the effective target the turbine sees walks up toward it at this rate. 0 → 100 MWe is a **20-minute** ramp. [sourced] Ginna UFSAR chapter 10, section 10.1.2.1 (ML20339A040) |
| **Load reductions** | **NOT RATE-LIMITED — a cut takes effect at once, any size.** Three reasons: a decrease *swells* the pressurizer rather than shrinking it into the 17 % cut, so it is the safe direction; it is the retired plant's own ruled design; and limiting it would put the dial's reduction rate exactly on C-7's arming threshold (row below), taking the graded steam-dump ride-out away from the operator. The source's *"similar step and ramp load reductions are possible"* is a statement of what the machine can absorb, not a limit on the operator |
| **Step load change** | **NOT MODELLED.** The same source allows a **10 % of rated** step; a raise ramps in all cases, deliberately — one rule rather than two regimes (**12** §12.0) |
| Ramp exemptions | Every reduction; the **OTΔT/OPΔT runback** (200 %/min, and it carries the dial down with it); a **turbine trip**; and **UNLOAD** |
| C-7 loss-of-load dump arming | On a decrease **faster than 5 %/min** (§3.0) — the *same* sourced number as the raise ramp. Because reductions are not limited, **a dial cut still arms it**, as does **UNLOAD** |

---

## 11.0 Normal values by initial condition

Expected readings at each named engine initial condition, captured from the live engine after
settling **70 s at 10x, the same for every column** — the low-power states are still walking their pressure up at 6 s, which is how the old table came to quote a hot-standby pressure 9 psi (0.06 MPa) light. **These six are the whole list** and the engine refuses any other name, but only **four** are on the Free Play picker: `hot_full_power`, `50_percent`, `hot_zero_power` and `cold_shutdown`. `hot_shutdown` and `low_power` are **engine-only** — real, loadable by the gates and the checklists, not offered to the player.

> **`low_power` is where the startup checklist hands you the plant** (added 2026-09-04, #624 item 28). It is the only initial condition whose control bank is **off its top stop** — **227 of 627 steps** — which is what an at-power plant actually looks like: Ginna UFSAR §15.4.5.1.1 (ML20339A101), *"the reactor is operated with the RCCAs inserted only far enough to permit load follow."* Every other at-power column boots on the stop, so a rod withdrawal in those states is a no-op.

> **MODE 5 EXISTS (#524, landed 2026-08-31).** The water-property floor moved from 14.5 psi (0.1 MPa) to **0.29 psi (0.002 MPa)**, so a steam generator can sit at ambient — the `cold_shutdown` column below is a real, loadable state whose secondary rides at **1.8 psi (0.0127 MPa)**, saturation at the plant's own 123 °F (50.6 °C). The cold end of the ladder is **Mode 5, Cold Shutdown** — 122 °F (50 °C), 363 psi (2.50 MPa) at boot, RHR in service, reactor coolant pumps secured, **turbine tripped, both main feed pumps secured with level control in MANUAL**, **pressurizer heaters OFF and spray in hand and shut** (#624, 2026-09-04), both banks in. `5_percent` remains the retired engine's and is **refused by name**.
> **`hot_shutdown` IS NOT ON THE FREE PLAY MENU** *(OWNER RULING, 2026-09-02: "A")*. The column
> stays because the initial condition is real, is booted by three gates, and is the reference for
> what a Mode 4 plant should read — but the player cannot select it. Measured when the question was
> put: Mode 4 and Mode 5 differ in exactly **one** independent quantity — temperature.
> 250 °F (121.1 °C) against 122 °F (50.0 °C); 105 of 122 true-state fields are identical
> and the whole lineup is the same, so the two were one choice the player could not act on. Modes 2 and 4 are
> transitions — you reach them by operating, which is why neither is a preset.

healthy board after selecting an IC, and as the "what should this read?" reference during
evolutions. At steady state the **indicated** values track these true values through each
instrument's lag and noise (see `03_CONTROLS_AND_INDICATIONS.md` §16.0) — a mismatch that
persists is either a transient in progress or a failed instrument.

| Parameter | `hot_full_power` | `50_percent` | `low_power` | `hot_zero_power` | `hot_shutdown` | `cold_shutdown` |
|---|---|---|---|---|---|---|
| Plant MODE | At Power (1) | At Power (1) | **At Power (1)** — *engine only, not on the Free Play menu* | Hot Standby (3) | **Hot Shutdown (4)** — *engine only, not on the Free Play menu* | **Cold Shutdown (5)** |
| Reactor power (%) | 99.6 | 49.6 | 11.0 | ~0 (source) | ~0 (source) | ~0 (source) |
| Generator output (MWe) | 100.0 | 50.0 | 10.0 | 0 | 0 | 0 |
| Control bank (steps of 627) | 627 | 627 | **227** | 0 | 0 | 0 |
| Tavg °F (°C) | 577.7 (303.2) | 566.7 (296.9) | 558.7 (292.6) | 547.2 (286.2) | 250.4 (121.3) | 123.0 (50.6) |
| T-hot / T-cold °F (°C) | 607.2 / 548.2 (319.6 / 286.8) | 582.1 / 551.4 (305.6 / 288.6) | 562.2 / 555.2 (294.5 / 290.7) | 547.2 / 547.2 (286.2 / 286.2) | 250.4 / 250.5 (121.3 / 121.4) | 123.0 / 123.0 (50.6 / 50.6) |
| Primary pressure psi (MPa) | 2235 (15.41) | 2235 (15.41) | 2240 (15.447) | 2246 (15.482) | 364 (2.510) | 363 (2.500) |
| Subcooling margin °F (°C) | 45 (25) | 70 (39) | 90 (50) | 105 (58.5) | 186 (103.6) | 313 (174.2) |
| PZR level (%) | 57 | 40 | 27 | 25 | 25 | 25 |
| SG level (%) | 65 | 65 | 65 | 65 | 65 | 66 |
| SG / steam pressure psi (MPa) | 808 (5.57) | 943 (6.50) | 1062 (7.32) | 1020 (7.03) | 30 (0.207) | 1.8 (0.0127) |
| Steam / feed flow (norm.) | 1.00 | 0.50 | 0.10 | 0 | 0 | 0 |
| Fuel average temp °F (°C) | 1292 (700) | 896 (480) | 628 (331.1) | 547 (286.1) | 250 (121.1) | 123 (50.5) |
| Decay heat (%) | 6.23 | 3.11 | 0.68 | ~0 | ~0 | ~0 |
| Xenon (% of equilibrium) | 100 | 66 | 19 | 0 | 0 | 0 |
| Boron (ppm) | 626 | 774 | 669 | 719 | 894 | 918 |
| Net reactivity (pcm) | 0 | 0 | 0 | ≈ −1141 | ≈ −5635 | ≈ −5809 |
| Source range (cps) | 0 (de-energized) | 0 (de-energized) | 0 (de-energized) | ≈ 501 | ≈ 101 | ≈ 98 |
| Intermediate range (A) | ≈ 8.3e-3 | ≈ 4.1e-3 | ≈ 9.2e-4 | ≈ 1.6e-11 | ≈ 3.2e-12 | ≈ 3.2e-12 |
| SR detector | OFF | OFF | OFF | Energized | Energized | Energized |
| Condenser vacuum (kPa) | 93.2 | 98.0 | 99.8 | 100.1 | 100.1 | 100.1 |
| Turbine | Latched, on line | Latched, on line | Latched, on line | Latched, off line | **TRIPPED** | **TRIPPED** |
| Turbine speed (RPM) | 1800 | 1800 | 1800 | 0 | 0 | 0 |
| Main feed pumps | Both running | Both running | Both running | Both running | **Both secured** | **Both secured** |
| Feed control mode | AUTO (three-element) | AUTO (three-element) | AUTO (three-element) | AUTO (three-element) | **MANUAL, 0 %** | **MANUAL, 0 %** |
| Pressurizer heaters | AUTO | AUTO | AUTO | AUTO | **OFF** | **OFF** |
| Pressurizer spray | AUTO | AUTO | AUTO | AUTO | **MANUAL, shut** | **MANUAL, shut** |
| MSIV | Open | Open | Open | Open | Open | Open |
| RHR | Out of service | Out of service | Out of service | Out of service | **In service** | **In service** |
| ECCS mode indicator | standby | standby | standby | standby | **RHR** | **RHR** |

Notes:

- **PZR level rides the Tavg program** (1.39 %/°F, 2.5 %/°C, 55 % at full-power Tavg): the level column
  IS the program — do not "correct" a 38 % level at low power, it is where the program wants it.
- **Steam pressure rides the load**: full-power 819 psi (5.65 MPa) up to the 1194 psi (8.23 MPa) no-load point
  (= Psat of the 566.6 °F (297 °C) no-load Tavg anchor).
- **Boron differs per IC by design** (rod position and xenon differ); the `hot_zero_power`
  value is low because the control bank is fully inserted and xenon-free ≈ criticality is
  held down by rods, not boron.
- `hot_shutdown` starts with RCPs secured, RHR aligned, both banks in, the SR detector energized and (since 2026-09-04, #624) the pressurizer heaters off with the spray in hand — the cooldown's own lineup throughout, with the P-11 blocks already taken. PWR-N12 turns the heaters off at its depressurization step, **before** the RHR alignment that makes the plant Mode 4, so a Mode 4 reached by the book already has them off. See `05_MODE_TRANSITIONS.md` PWR-T20 for the climb out, and read its Mode 5 steps against the note above.
- **BOTH cold columns boot with pressurizer pressure control OUT OF SERVICE** (added 2026-09-04,
  #624). Heaters **OFF**, spray **in hand and shut** — the lineup PWR-N12 leaves behind, so a preset
  and a plant you cooled down yourself finally read the same. Neither is a degraded state; measured
  untouched for 60 plant-minutes, `cold_shutdown` moves
  **362.6 psia (2.500 MPa) → 362.9 psia (2.502 MPa)** (+0.3 psi/hr) and `hot_shutdown`
  **364.0 psia (2.510 MPa) → 364.2 psia (2.511 MPa)** (+0.2 psi/hr). Putting it back in service is
  **PWR-N01 step 5b**, from either start, and until you do the Pressure SP is inert — 0.05 psi in 10
  plant-minutes against +133 psi (0.92 MPa) with the heaters in AUTO.
- **Two Primary pressure cells moved with it, and both were reading the same artefact**:
  `cold_shutdown` **368 → 363 psi (2.537 → 2.500 MPa)** and `hot_shutdown`
  **369 → 364 psi (2.545 → 2.510 MPa)**. Neither old figure was that state's settled pressure — each
  was the AUTO ladder walking its own preset off its construction point during this table's
  70-second settle, at **+11.7 psi/hr** and **+12.2 psi/hr** respectively. With the heaters off both
  columns read what the initial condition is actually built at. `hot_shutdown` was left in AUTO for
  about an hour on the day of the change, on the reading that the ruling named the Mode 5 lineup;
  the measurement above is what took it across.

---

## 12.0 Related documents

- `06_ALARM_RESPONSE.md`  
- `04_NORMAL_OPERATIONS.md`  
- `07_ABNORMAL_EMERGENCY.md`  
