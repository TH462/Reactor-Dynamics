# 10 — Glossary

**Document:** PWR-GL-01  
**Revision:** 22  

Terms used in the PWR manuals and on the simulator board. Acronym first, then plain meaning.

---

## Plant MODES

**Convention:** write **Mode N, Name** (example: **Mode 1, At Power**).

| MODE | Full form | Short definition |
|------|-----------|------------------|
| **1** | **Mode 1, At Power** | Critical, thermal power **> 5 %**, RCS hot |
| **2** | **Mode 2, Startup** | Critical, power **≤ 5 %**, RCS hot |
| **3** | **Mode 3, Hot Standby** | Subcritical, RCS hot (NOP T/P) |
| **4** | **Mode 4, Hot Shutdown** | Subcritical, intermediate RCS temperature |
| **5** | **Mode 5, Cold Shutdown** | Subcritical, RCS cold |
| **6** | **Mode 6, Refueling** | Cold, vessel head not fully tensioned (out of scope here) |

**Mode 5, Cold Shutdown → Mode 1, At Power** and **Mode 1, At Power → Mode 5, Cold Shutdown** master procedures: `05_MODE_TRANSITIONS.md` (**PWR-T20**, **PWR-T21**).

**Not plant MODES:** turbine load modes Follow / Manual / Disconnected.

---

## A

| Term | Definition |
|------|------------|
| **AC / DC** | Alternating-current / direct-current electrical power. |
| **AFW** | Auxiliary Feedwater — backup water supply to the Steam Generators when main feed is lost. |
| **ATWS** | Anticipated Transient Without Scram — event where the reactor should trip but rods fail to insert fully. |
| **AUTO / MAN** | Automatic / manual control of a plant channel. AUTO reads instruments and issues commands to hold a setpoint; MAN leaves control to the operator. |

## B–C

| Term | Definition |
|------|------------|
| **Borate / Dilute** | Raise / lower dissolved boron concentration via CVCS (adds / removes negative reactivity) — done by setting the BORON CONTROL target ppm (batch dose), not a live meter seek. |
| **CHEM SAMPLE / chemistry sample** | RCS grab sample analyzed by the lab; the result (posted after a compressed ~60 s turnaround) is the authoritative boron ppm — there is no online boron meter on the board. |
| **BOP** | Balance of Plant — turbine, condenser, feedwater, and related secondary systems. |
| **CVCS** | Chemical & Volume Control System — charging, letdown, boron adjust, inventory make-up. |
| **Critical / Criticality** | Steady chain reaction: reactivity ≈ 0; power neither grows nor dies away on its own. |
| **Cold Shutdown** | RCS cool and depressurized, RHR carrying the heat sink — **Mode 5, Cold Shutdown**. **[sim]**: a Free Play initial condition, and the full path to and from power runs on integrated physics (**PWR-T20** / **PWR-T21**). |

## D

| Term | Definition |
|------|------------|
| **Decay heat** | Heat from radioactive decay after fission stops (~7 % of rated after a power run, then falling). |
| **RHR** | Residual Heat Removal — the low-pressure system that removes leftover decay heat after shutdown. |
| **DNB** | Departure from Nucleate Boiling — heat-transfer crisis; fuel temperature rises sharply. |
| **Doppler** | Negative reactivity feedback from hotter fuel absorbing more neutrons (prompt stabilizer). |
| **DPM** | Decades Per Minute — unit of Startup Rate (one decade = factor of ten in power). |

## E–F

| Term | Definition |
|------|------------|
| **ECCS** | Emergency Core Cooling System — here, merged HPI/LPI plus passive accumulators. |
| **ESF** | Engineered Safety Features — systems such as HPI and AFW with AUTO/MAN arms. |
| **Follow (load mode)** | Turbine electrical load automatically tracks reactor power. |

## H

| Term | Definition |
|------|------------|
| **Heat sink** | Where core heat goes — primarily the Steam Generators (secondary water/steam). |
| **Hot Full Power (HFP)** | ~100 % power, ~100 MWe, equilibrium — full-power **Mode 1, At Power**. |
| **Hot Standby** | Subcritical, hot, at operating temperature and pressure — **Mode 3, Hot Standby**. |
| **Hot Shutdown** | Subcritical with RCS not yet cold — commercial **Mode 4, Hot Shutdown**. **[sim]**: the trainer derives it from power, reactivity and Tavg, so it is what the board declares while transiting between Mode 3 and Mode 5. A post-trip board still at operating temperature is Mode 3, Hot Standby by temperature class. |
| **Cold Shutdown** | Subcritical and cold — **Mode 5, Cold Shutdown**. **[sim]** — see the Cold Shutdown entry under **C**. |
| **HPI / LPI** | High- / Low-Pressure Injection — merged emergency injection with a two-segment pump curve. |
| **HR1** | Simulator hard rule: protection and alarms read **instruments**, never true state. |

## I–L

| Term | Definition |
|------|------------|
| **Instrument / Indication** | What the operator sees — lagged, noisy, possibly failed — not necessarily truth. |
| **IR** | Intermediate Range — compensated ion chamber (amperes) from SR handoff up to ~10 % power. |
| **LOCA** | Loss-Of-Coolant Accident — primary coolant escaping the RCS. |
| **LOFW** | Loss Of Feedwater — main feed to the SGs lost. |
| **Load rejection** | Sudden loss of electrical load / turbine trip; steam demand collapses. |

## M–O

| Term | Definition |
|------|------------|
| **MSIV** | Main Steam Isolation Valve — isolates Steam Generators from the turbine. |
| **MTC** | Moderator Temperature Coefficient — in a PWR, negative: hotter water → less reactivity. |
| **MWe / MWt** | Megawatts electric (grid) / megawatts thermal (reactor heat). |
| **Natural circulation** | Flow driven by density difference after pumps stop — weaker than forced RCP flow. |
| **NOP** | Normal Operating Pressure/Temperature (hot operating conditions). |

## P

| Term | Definition |
|------|------------|
| **P-6** | Permissive: IR on scale (≥ 1e-10 A) — allows securing the Source Range detector. |
| **P-10** | Nuclear at-power permissive (~10 %) — allows blocking certain startup trips. |
| **pcm** | Percent millirho — unit of reactivity (1 pcm = 10⁻⁵ Δk/k). |
| **POAH** | Point of Adding Heat — power level where fission heat exceeds system losses. |
| **PORV** | Power-Operated Relief Valve — controllable RCS pressure relief on the pressurizer. |
| **PORV block valve** | Isolation valve upstream of the PORV; closes the relief line if the PORV sticks open. |
| **PR** | Power Range — main power % neutron channels at power. |
| **Primary / RCS** | Reactor Coolant System — high-pressure water loop through the core. |
| **PWR** | Pressurized Water Reactor. |
| **PZR** | Pressurizer — steam/water vessel that sets primary pressure. |

## R

| Term | Definition |
|------|------------|
| **RCP** | Reactor Coolant Pump — forced circulation in the primary loop. |
| **Reactivity (ρ)** | Tendency of the chain reaction to grow (+) or shrink (−); critical ≈ 0. |
| **Reactor period** | Time for power to change by a factor of e (~2.72); long period = slow change. |
| **RPS** | Reactor Protection System — automatic SCRAM logic. |
| **Rod bank (control)** | Operable control rods for reactivity control. |
| **Rod bank (shutdown)** | Scram rods, normally fully withdrawn; drive in on SCRAM. |

## S

| Term | Definition |
|------|------------|
| **SBLOCA** | Small-Break LOCA — e.g. stuck-open PORV. |
| **SBO** | Station Blackout — loss of all AC power (as modeled). |
| **SCRAM** | Rapid full insertion of control rods — emergency/automatic shutdown. |
| **Secondary** | Steam side: SG secondary, turbine, condenser, feedwater. |
| **Setpoint (SP)** | Value an automatic controller holds; often captured from the current reading when AUTO engages. |
| **SG** | Steam Generator — heat exchanger boiling secondary water using primary heat. |
| **SGTR** | Steam Generator Tube Rupture — primary-to-secondary leak. |
| **Shrink and swell** | Indicated SG level moves “wrong way” briefly on fast power/load changes. |
| **SR** | Source Range — startup neutron counter (counts per second). |
| **Subcooling margin** | How far primary coolant is below boiling temperature at current pressure — TMI truth-teller. |
| **SUR** | Startup Rate — how fast power is changing, in decades per minute (DPM). |

## T–X

| Term | Definition |
|------|------------|
| **Tavg** | Average primary coolant temperature. |
| **Thot / Tcold** | Hot-leg / cold-leg temperatures. |
| **TMI** | Three Mile Island (1979 accident). |
| **True state** | Actual physics values in the model — hidden from normal operator view. |
| **Void / void fraction** | Steam bubbles in the coolant; reduce heat transfer; affect inventory presentation. |
| **Xenon (Xe-135)** | Strong neutron-absorbing fission product; builds after power drops; decays over hours. |

---

## Related documents

- `01_GENERAL_DESCRIPTION.md`  
- `09_SETPOINTS_LIMITS.md`  
- In-product Manual → Glossary section  
