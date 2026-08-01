# 04 — Normal Operating Procedures

**Document:** PWR-NOP-01  
**Plant:** Pressurized Water Reactor (PWR)  
**Revision:** 2  

---

## 1.0 Purpose

Provide **normal operating procedures (NOPs)** for the Reactor⚛️Dynamics PWR in commercial plant format: purpose, applicability, prerequisites, precautions, steps with acceptance criteria, and outcome.

**Master MODE paths** (detail of each leg is in this chapter; path orchestration is in **05**):
- **PWR-T20** — Mode 5, Cold Shutdown → Mode 1, At Power
- **PWR-T21** — Mode 1, At Power → Mode 5, Cold Shutdown
- **PWR-T03** — Mode 3, Hot Standby → Mode 1, At Power (N03 → N04 → N05 → N06)

Commercial heatup practice (Westinghouse technology training outline) is subcritical heatup and pressurization from cold to Hot Standby, then a separate evolution from Mode 3 to power. **PWR-N01** is that cold-to-hot leg on reactor coolant pump heat.

**Related:** **03** Controls and Indications · **05** Mode Transitions · **06** Alarm Response · **09** Setpoints and Limits · **12** Simulation Physics

## 2.0 Procedure index

Numbered in **plant sequence**.

### A. Startup path (Mode 5 → Mode 1)

| ID | Title | MODE | Scope |
|----|-------|------|-------|
| PWR-N01 | Heatup Mode 5 → Mode 3 (pump heat) | 5 → 4 → 3 | [sim] |
| PWR-N01a | Nuclear heatup Mode 5 → Mode 3 (training variant) | 5 → 4 → 3 | [sim] |
| PWR-N02 | Mode 3 lineup / prerequisites | Mode 3 | [sim] |
| PWR-N03 | Approach to criticality (Mode 3 → Mode 2) | 3 → 2 | [sim] |
| PWR-N04 | Mode 2 low-power operation & POAH | Mode 2 | [sim] |
| PWR-N05 | Turbine roll & generator synchronization | 2 → 1 | [sim] |
| PWR-N06 | Power ascension Mode 1 to 100 % | Mode 1 | [sim] |

### B. At-power maneuvers

| ID | Title | MODE | Scope |
|----|-------|------|-------|
| PWR-N07 | Raise power | Mode 1 | [sim] |
| PWR-N08 | Lower power | Mode 1 | [sim] |

### C. Continuous control

| ID | Title | MODE | Scope |
|----|-------|------|-------|
| PWR-N09 | Boron & reactivity (incl. xenon) | 1–3 | [sim] |
| PWR-N10 | Pressurizer pressure | 1–3 | [sim] |
| PWR-N11 | Pressurizer level (CVCS) | 1–3 | [sim] |
| PWR-N12 | SG level & feedwater | 1–2 | [sim] |
| PWR-N13 | Reactor Coolant Pump (RCP) | 1–3 | [sim, approx] |

### D. Shutdown path (Mode 1 → Mode 5)

| ID | Title | MODE | Scope |
|----|-------|------|-------|
| PWR-N14 | Normal shutdown Mode 1 → Mode 3 | 1 → 3 | [sim] |
| PWR-N15 | Cooldown Mode 3 → Mode 5 (RHR) | 3 → 4 → 5 | [sim] |

---

## PWR-N01 — Heatup Mode 5, Cold Shutdown → Mode 3, Hot Standby (pump heat) **[sim]**

### Purpose
Heat and pressurize the RCS from **Mode 5, Cold Shutdown** through **Mode 4, Hot Shutdown** to **Mode 3, Hot Standby** with the reactor **subcritical throughout**. Heat source is **reactor coolant pump work** (and pressurizer heaters), not fission.

### Applicability
- Plant in **Mode 5, Cold Shutdown**.
- Master path: **PWR-T20** Phase A.

### Prerequisites
1. Plant in Mode 5: subcritical, RCS cold (~122 °F / 50 °C class), depressurized (~363 psi / 2.5 MPa).
2. RHR aligned for shutdown cooling.
3. SI accumulators **isolated** (correct Mode 5 lineup — plant is below cover-gas pressure).
4. Generator **off line**.

### Precautions and limitations

| Type | Text |
|------|------|
| **CAUTION** | Do **not** withdraw rods or dilute. Hot Standby is hot **and** subcritical. |
| **CAUTION** | Keep the steam generator **bottled** (turbine off, dumps shut). Opening dump removes pump heat faster than the pumps can put it in. A small manual dump demand (about 5 %) is roughly ten times pump-heat generation and cools at about **−83 °F/hr (−46 °C/hr)**. |
| **CAUTION** | Rate control at these powers: **secure an RCP** to slow or hold the heatup (rate falls to essentially zero). Do not use the dump as a fine throttle. |
| **WARNING** | **Re-align SI accumulators** once RCS is above **600 psi (4.14 MPa)** cover gas and before **1000 psi (6.895 MPa)**. There is **no automatic open** — re-alignment is an operator action. Skip this and the plant reaches power with no passive injection. Basis: NUREG-1431 Rev 4.0 **LCO 3.5.1** (OPERABLE in MODE 3 with RCS pressure > ~1000 psig) and the isolation counterpart on cooldown (**SR 3.4.12.3**). |
| **NOTE** | RHR auto-isolates above its **400 psi (2.76 MPa)** suction interlock as you pressurize — expected. |
| **NOTE** | Training time is accelerated; heatup **plant hours** and rates in this procedure are real plant-time figures. |

### Procedure

| Step | MODE | Action | Control | Acceptance |
|------|------|--------|---------|------------|
| 1 | Mode 5 | Confirm cold plant: Tavg ~122 °F (50 °C), P ~363 psi (2.5 MPa), subcritical, RHR in service, RCPs secured | (observe) | Tavg < 203 °F (95 °C); Mode 5 |
| 2 | 5 → 4 | **Start RCPs** (RCP → Run). Forced flow is the heat source and couples the SG | RCP Run/Stop | Pump flow ~100 % |
| 3 | 5 / 4 | Confirm generator **disconnected** (Disconnect Grid if needed). Do not reconnect | Turbine Load | Load mode disconnected; 0 MWe |
| 4 | 5 / 4 | Engage **Feed AUTO** at cold SG level (~65 %) so three-element captures the right setpoint | Feed Pumps | Feed AUTO engaged |
| 5 | 5 / 4 | Set **Dump SP** to no-load anchor **1194 psi (8.23 MPa)**; leave dump **shut** | Dump SP | SP set; dump demand ~0 |
| 6 | 5 → 4 | Raise **Pressure SP** to **2235 psi (15.41 MPa)**. Heaters pressurize; RHR isolates past 400 psi (2.76 MPa) | Pressure SP | P > 2176 psi (15.0 MPa) |
| 7 | Mode 4 | **Open SI accumulator discharge isolation** (re-align). Verify SIT fill on ECCS side | Accumulator valve | Valve open; P already > 600 psi (4.14 MPa) |
| 8 | 4 → 3 | Monitor heatup: Tavg and rate, SG pressure tracking Psat(Tavg), PZR level swelling, **reactivity still negative**. No rod motion. Arrive at no-load band | (observe) | Tavg ≥ 545 °F (285 °C); Mode 3; ρ ≪ 0; power ~0 |

### Acceptance (Mode 3 declared)
- RCS at NOP T/P class: P ≈ **2235 psi (15.41 MPa)**, Tavg at no-load band ≈ **566.6 °F (297 °C)**.
- Reactor **subcritical** (typical arrival on this plant: ρ ≈ **−2800 pcm** on ~857 ppm, control bank still fully inserted).
- Accumulators **aligned**.
- Ready for **PWR-N02** (lineup) then **PWR-N03** (approach to criticality).

### Expected heatup performance
With no rod motion: pressure reaches NOP within about **20 plant-minutes**; Mode 3 entry (~350 °F (176.7 °C)) in about **4.7 plant-hours**; **546.8 °F (286.0 °C)** at about **10.7 plant-hours**; settles near **567.0 °F (297.2 °C)** at about **11.3 plant-hours**. Steady heatup rate after the first hour is about **32 °F/hr (17.8 °C/hr)**. Heat source is RCP work (about 0.55 % of rated core heat at full flow) plus pressurizer heaters.

### Outcome
Mode 3, Hot Standby — hot, pressurized, subcritical, zero rod motion.

---

## PWR-N01a — Nuclear heatup Mode 5 → Mode 3 (training variant) **[sim]**

### Purpose
Reach the same **Mode 3** end state as **PWR-N01**, but heat with **deliberate low-power fission** (criticality cold, dilution ride, insert and borate back). **Training only** — not the commercial heatup.

### Applicability
- Training / practice only (approach, trip blocks, dilution discipline). Not the commercial heatup path.

### Prerequisites
Same Mode 5 plant condition as **PWR-N01**; charging available for boron adjust.

### Precautions and limitations

| Type | Text |
|------|------|
| **WARNING** | **Critical boron is higher cold than hot.** With bank inserted: about **806 ppm** at 122 °F (50 °C) vs about **588 ppm** at 566.6 °F (297 °C) (see **09 §7.5**). Diluting cold can take a concentration that is subcritical hot into critical. Prefer Tavg above about **541 °F** before computing an estimated critical condition; if you dilute cold, the source-range high-flux trip is the last backstop. |
| **CAUTION** | Block **IR HIGH** and **PR low-setpoint** before the power ride (precautionary). |
| **CAUTION** | Secure dilution when Tavg reaches the hot band — mixing lag about 30 s. A slow dilution rate is required; if left running after the hot band, power continues to climb with the turbine offline. |
| **CAUTION** | Engage Feed AUTO early; standing manual feed floods the SG. |

### Procedure (summary)

| Phase | Action | Acceptance |
|-------|--------|------------|
| Setup | RCPs, grid off, Feed AUTO, Dump SP, Pressure SP to NOP, re-align accumulators | P at NOP; pumps on; accum open |
| Protection | SR off; block IR HIGH and PR 25 % | Blocks set |
| Criticality | Withdraw bank (bursts then creep) | ρ → 0; SUR stirs |
| Nuclear ride | Dilute slowly until Tavg in no-load band | Tavg > 563 °F (295 °C); power typically a few % |
| Shutdown margin | Secure dilution; drive bank in; borate ≥ ~900 ppm; settle | Mode 3; ρ ≪ 0 |

### Expected heatup performance
Fission heat makes this path much shorter than **PWR-N01** (pump heat only). On this plant, following the training sequence:

| Milestone | Typical plant time | Notes |
|-----------|-------------------|--------|
| Pressurized to NOP, RCPs on | ~0.2 plant-h | Same setup as N01 |
| Core critical, power climbing | ~0.5 plant-h | Still cold-to-warm (~219 °F / 104 °C class) |
| End of dilution ride (no-load Tavg) | ~1.6 plant-h | Tavg ≈ **568 °F (298 °C)**; power about **1–4 %** through the climb (peaks near **3–4 %** if dilution is secured on time); boron falls on the order of **150 ppm** from the cold inventory |
| Bank inserted, Mode 3 | ~1.7 plant-h | Subcritical again |
| Boration complete and settled | ~1.9 plant-h | Tavg ≈ **567 °F (297 °C)**; boron ≥ **~900 ppm**; large negative reactivity |

If dilution is left running past the hot band, power and temperature keep rising — secure it when Tavg enters the no-load band.

### Outcome
Mode 3 via nuclear path with shutdown margin restored. Prefer **PWR-N01** for commercial heatup.

---

## PWR-N02 — Prerequisites & plant lineup (Mode 3, Hot Standby)

### Purpose
Verify the unit is correctly lined up in **Mode 3, Hot Standby** before any approach to criticality. Commercial startups do not pull rods until the board is known.

### Applicability
- After **PWR-N01**, or any plant already in **Mode 3, Hot Standby**.
- Post-trip recovery to hot, subcritical conditions (still Mode 3 by temperature class).

### Prerequisites
- Plant in Mode 3 (or post-trip recovery still hot and subcritical).

### Precautions and limitations

| Type | Text |
|------|------|
| **CAUTION** | Do not withdraw rods until this checklist is complete. |
| **NOTE** | Speed for the following approach should allow SUR to be followed (typically 1×–10×). |

### Procedure

| Step | Action | Indication | Acceptance |
|------|--------|------------|------------|
| 1 | Confirm subcritical | Reactivity / power | ρ < 0; power near source equilibrium |
| 2 | Confirm hot operating temperature | Tavg | ≈ **566.6 °F (297 °C)** no-load class |
| 3 | Confirm primary pressure | PZR / plant pressure | ≈ **2235 psi (15.41 MPa)** |
| 4 | Confirm subcooling healthy | Subcooling | Green / tens of °F of margin |
| 5 | Confirm RCPs running | RCP / flow | Flow ~100 % |
| 6 | Confirm control bank fully inserted | Rod control | Position at bottom |
| 7 | Confirm shutdown bank parked withdrawn | Shutdown bank | Fully out (normal) |
| 8 | Confirm boron holds the plant subcritical | Chem sample | Consistent with Mode 3 hold (~683 ppm class at Hot Standby) |
| 9 | Confirm Source Range energized and counting | SR | SR On; hundreds of cps class |
| 10 | Confirm Intermediate Range available for handoff | IR | IR on scale or ready as power rises |
| 11 | Confirm SG heat sink | SG level | ~65 %; not LO-LO |
| 12 | Confirm turbine off line / 0 MWe | Turbine | Disconnected or zero load |
| 13 | Review annunciators; clear spurious | Alarm panel | Board understood |
| 14 | Confirm SI accumulators aligned if coming from heatup | Accumulator valve | Open (if heatup was done by the book) |

### Outcome
Mode 3 lineup complete — ready for **PWR-N03**.

---

## PWR-N03 — Approach to criticality (Mode 3, Hot Standby → Mode 2, Startup) **[sim]**

### Purpose
Take the reactor from **Mode 3, Hot Standby** to **Mode 2, Startup** (critical, power ≤ 5 %) by controlled rod withdrawal, using **1/M**, **SUR**, and **NIS handoff**.

### Applicability
- From Mode 3 after **PWR-N02**.
- Continues into **PWR-N04** / **PWR-N05** / **PWR-N06** on master path **PWR-T03**.

### Prerequisites
1. **PWR-N02** complete.
2. Estimated Critical Condition (ECC) worked for **this** Tavg and boron — see **09 §7.5**. At Hot Standby with bank inserted (~683 ppm class), criticality is near **~319 steps** (~35 % withdrawn). Acceptance band for a good ECC is roughly ±750 pcm (~159–421 steps on this plant).
3. RCPs running; SR energized; Feed AUTO recommended before POAH.

### Precautions and limitations

| Type | Text |
|------|------|
| **CAUTION** | Target SUR ≤ **1 DPM** (SUR HI at 1 DPM). Rod withdrawal blocks at **1.5 DPM** until SUR < **0.8 DPM**. Insertion is never blocked. |
| **CAUTION** | Plot **enough 1/M points**. Early predictions always read high (flat toe of the worth curve). Two points can predict ~711 vs true ~319; six points land within a handful of steps. **Never** withdraw straight to the first prediction. |
| **CAUTION** | One fine step near the band is ~**1 ¢ (6.5–6.7 pcm)**. Final approach: **Slow**, single steps. |
| **WARNING** | Secure **Source Range** before ~1e5 cps (SR high-flux trip). Handoff when **P-6** is met (IR ≥ **1e-10 A**). |
| **NOTE** | Below the point of adding heat there is almost no temperature feedback — excess reactivity keeps driving power until you take it out. |

### Procedure

| Step | Action | Control | Acceptance |
|------|--------|---------|------------|
| 1 | Confirm Mode 3: subcritical, Tavg ≈ 566.6 °F (297 °C), P ≈ 2235 psi (15.41 MPa), RCPs on | (observe) | ρ < 0; Mode 3 |
| 2 | Confirm SR counting; IR ready | NIS | SR > ~100 cps |
| 3 | Engage Feed AUTO at ~65 % if not already | Feed Pumps | AUTO engaged |
| 4 | Capture 1/M baseline (plot point 1) **before** any rod motion | 1/M Plot | Baseline logged |
| 5 | Withdraw Control Bank in **decreasing** bursts; settle; plot after each (points 2–6) | Control Bank + 1/M | Count rate rising; prediction walks down |
| 6 | When IR on scale and below SR high caution: **SR detector OFF** | SR detector | SR de-energized; IR carries indication |
| 7 | Creep to critical at **Slow** (single steps); watch SUR and period | Control Bank | Critical; SUR ≤ 1 DPM; period long |
| 8 | Hold low power (Mode 2 band ≤ 5 %); let Doppler settle; trim | Rods | Stable Mode 2, Startup |

### Typical 1/M burst sizes (Hot Standby, bank starting fully inserted)

| Burst | Steps (Norm) | Role |
|-------|--------------|------|
| 1 | 138 | First overestimate |
| 2 | 90 | Still late |
| 3 | 44 | Entering steep worth |
| 4 | 22 | Inside ~12 steps |
| 5 | 12 | Working prediction |
| Creep | ~26 Slow | To critical, then a small excess for a gentle rise toward ~1 % |

### Outcome
**Mode 2, Startup** — critical, power ≤ 5 %. Ready for **PWR-N04** / **PWR-N05**.

---

## PWR-N04 — Mode 2, Startup low-power operation & Point of Adding Heat (POAH)

### Purpose
Operate stably in **Mode 2, Startup** (critical, ≤ 5 %) and recognize the **point of adding heat** — when fission heat exceeds losses and Tavg begins to respond.

### Applicability
After **PWR-N03**; before or during early turbine roll.

### Prerequisites
- Mode 2 per N03.
- SG inventory available; Feed AUTO preferred.

### Precautions and limitations

| Type | Text |
|------|------|
| **CAUTION** | Controllers are soft at very low power — prefer manual attention to rods and feed until POAH. |
| **NOTE** | IR/PR trip blocks are allowed only above **P-10 (10 %)** — by then you are already Mode 1 if power > 5 %. |
| **NOTE** | Crossing **> 5 %** while critical enters **Mode 1, At Power**. |

### Procedure

| Step | Action | Acceptance |
|------|--------|------------|
| 1 | Hold power in Mode 2 band (≤ 5 %) with small rod trims | SUR near 0; power stable ≤ 5 % |
| 2 | Confirm Tavg and pressure near NOP | P ≈ 2235 psi (15.41 MPa); Tavg near no-load |
| 3 | Confirm SG level held (Feed AUTO or careful manual) | Level not LO |
| 4 | Observe POAH: Tavg begins to rise with power; secondary steam demand increases | Heat addition visible |
| 5 | When ready for load: proceed to **PWR-N05**; declare Mode 1 when power > 5 % | Ready for turbine / Mode 1 |

### Outcome
Stable Mode 2; operator recognizes POAH; ready to roll turbine.

---

## PWR-N05 — Turbine roll & generator synchronization (Mode 2 → Mode 1) **[sim]**

### Purpose
Place the turbine-generator on the grid and establish electrical output coordinated with reactor power while entering **Mode 1, At Power** (power > 5 %).

### Applicability
Reactor critical (Mode 2 or early Mode 1); condenser vacuum healthy; MSIV open.

### Prerequisites
- **PWR-N04** complete or concurrent.
- Condenser available; MSIV open.

### Precautions and limitations

| Type | Text |
|------|------|
| **CAUTION** | Large step loads can trip on secondary/primary upset. Step load modestly. |
| **NOTE** | **Follow** tracks reactor power; **Manual** sets MWe. After synchronization, prefer **Manual** until power and load are matched and stable. |

### Procedure

| Step | Action | Control | Acceptance |
|------|--------|---------|------------|
| 1 | Verify condenser vacuum healthy | Condenser | Above trip region |
| 2 | Verify MSIV **Open** | Steam | MSIV open |
| 3 | Select load mode **Manual** (or Follow if intentionally matching) | Turbine | Mode set |
| 4 | Raise Turbine Load in steps toward a low MWe target consistent with reactor power | Turbine Load | MWe rises; steam flow rises |
| 5 | Match reactor power with rods (or Follow) so SG level stays controlled | Rods / Follow | No SG LO-LO / HI flood |
| 6 | Confirm Feed AUTO holding | Feed | AUTO engaged |
| 7 | When power > 5 %: declare **Mode 1, At Power** | (observe) | Mode 1 |
| 8 | Optional: ROD AUTO only after Tavg is where you want it | ROD AUTO | Holding without large drive |

### Outcome
Generator carrying load; plant in **Mode 1, At Power**.

---

## PWR-N06 — Power ascension in Mode 1, At Power to 100 %

### Purpose
Raise reactor power and electrical output to full-power Mode 1 (~**100 MWe**) by coordinating rods, boron, and turbine load.

### Applicability
Mode 1 (or completing entry via N05).

### Prerequisites
- Turbine on line or Follow available.
- SG level control understood (**PWR-N12**).

### Precautions and limitations

| Type | Text |
|------|------|
| **CAUTION** | Keep power ramps modest (training guideline ~**10 %/min** class ceiling where achievable). |
| **CAUTION** | Secure SR if still energized; manage IR/PR blocks only above P-10. |
| **NOTE** | During sustained rise, xenon burns out (positive reactivity) — trim boron/rods. |

### Procedure

| Step | Action | Control | Acceptance |
|------|--------|---------|------------|
| 1 | Establish target ladder (e.g. 25 → 50 → 75 → 100 %) | Plan | Targets known |
| 2 | Withdraw Control Bank in small bursts **or** dilute slowly | Rods / Dilute | Power rising controlled |
| 3 | Raise Turbine Load to match (Manual) **or** use Follow | Turbine / Follow | MWe tracks power |
| 4 | Hold at each plateau; check Tavg, pressure, SG level, subcooling | (observe) | Stable board |
| 5 | Re-engage feed AUTO and PZR AUTO as needed | AUTO controls | Controllers holding |
| 6 | Near HFP: bank ~92 % withdrawn; trim boron for critical hold | CVCS / rods | Power ~100 %; P ≈ 2235 psi (15.41 MPa); SG ~65 %; PZR ~55 % |
| 7 | Optional: ROD AUTO + load FOLLOW for steady operation | ROD AUTO · FOLLOW | Hands-off hold |

### Outcome
Full-power **Mode 1, At Power** equilibrium.

---

## PWR-N07 — Power maneuvering — raise power (Mode 1)

### Purpose
Increase power and MWe within Mode 1 from a partial-power plateau.

### Prerequisites
Mode 1: critical, power > 5 %, turbine on line, stable.

### Precautions
- Rods **lead** up; turbine **follows**.
- Avoid SUR alarms; let Tavg and xenon follow.

### Procedure

| Step | Action | Control | Acceptance |
|------|--------|---------|------------|
| 1 | Withdraw Control Bank in short bursts | Rods | Small steady power rise |
| 2 | Raise Turbine Load to new MWe | Turbine Load | Higher MWe settled |
| 3 | Verify SG level and PZR P/level | SG / PZR | Normal bands |
| 4 | Trim rods or dilute if xenon requires | Rods / Dilute | Power holds |

### Outcome
Stable higher power and MWe.

---

## PWR-N08 — Power maneuvering — lower power (Mode 1)

### Purpose
Reduce power and load within Mode 1 (or toward Mode 2 / Mode 3).

### Prerequisites
Mode 1 (or Mode 2) with turbine on line.

### Precautions and limitations

| Type | Text |
|------|------|
| **CAUTION** | Turbine **leads** down; rods trim. |
| **CAUTION** | SG level may **swell** on load drop — do not overfeed. |
| **NOTE** | After a large down-power, xenon builds over hours. |

### Procedure

| Step | Action | Control | Acceptance |
|------|--------|---------|------------|
| 1 | Reduce Turbine Load to new MWe | Turbine Load | Lower MWe |
| 2 | Insert rods (bursts) and/or borate | Rods / Borate | Power to target |
| 3 | Watch SG level; Feed AUTO or manual trim | Feed | Level ~65 % class |
| 4 | Stabilize Tavg and pressure | PZR / rods | Quiet board |

### Outcome
Stable lower plateau.

---

## PWR-N09 — Boron & reactivity management (including xenon)

### Purpose
Use CVCS boron and rods for long- and short-term reactivity control; manage xenon.

### Prerequisites
Charging pump available.

### Precautions and limitations

| Type | Text |
|------|------|
| **NOTE** | Boron is slow vs rods. Concentration is known by **chemistry sample** (~60 s compressed lab), not a live meter. |
| **NOTE** | Charging must be **On** for borate/dilute. |
| **CAUTION** | Mixing lag ~30 s — stop early, do not chase. |

### Procedure — routine boron adjust

| Step | Action | Acceptance |
|------|--------|------------|
| 1 | Charging pump On; boron control engaged | Pump running |
| 2 | Set boron **target** (higher = borate / more margin; lower = dilute / more power) | Dose delivering |
| 3 | Watch power/Tavg; confirm with **CHEM SAMPLE** | Expected direction |
| 4 | Let dose complete; finish with rod trim | Stable |

### Procedure — xenon awareness

| Step | Action | Acceptance |
|------|--------|------------|
| 1 | After down-power or scram, expect xenon **build** (hours) | Anticipated |
| 2 | Use time acceleration only if the board remains manageable | No surprise trip |
| 3 | Compensate rising xenon with rods out or dilute if staying at power | Power holds |
| 4 | After peak, xenon decays — insert rods or borate to avoid power rise | No unplanned power increase |

### Outcome
Operator balances rods (fast) vs boron (slow) and anticipates xenon.

---

## PWR-N10 — Pressurizer pressure control

### Purpose
Hold primary pressure near **2235 psi (15.41 MPa)** with heaters (raise) and spray (lower).

### Prerequisites
PZR in normal level band; RCP running for effective spray.

### Precautions
- Low pressure erodes **subcooling**.
- High pressure approaches PORV **2350 psi (16.20 MPa)** and safeties **2485 psi (17.13 MPa)**.

### Procedure

| Step | Action | Control | Acceptance |
|------|--------|---------|------------|
| 1 | Read primary pressure | PZR | Know current P |
| 2 | Prefer **AUTO** heaters/spray for steady ops | Heaters/Spray AUTO | Holding near 2235 psi (15.41 MPa) |
| 3 | To **lower** P: spray briefly | PZR Spray | P decreasing |
| 4 | To **raise** P: energize heaters | PZR Heaters | P increasing |
| 5 | Return to AUTO | AUTO | Stable |

### Outcome
Pressure controllable; subcooling protected.

---

## PWR-N11 — Pressurizer level control (CVCS)

### Purpose
Control PZR level / primary inventory with charging and letdown.

### Prerequisites
CVCS available.

### Precautions
- Do not chase TMI-like **false high level** during a LOCA — see emergency procedures.
- AUTO make-up modulates charging; MANUAL for deliberate moves.

### Procedure

| Step | Action | Control | Acceptance |
|------|--------|---------|------------|
| 1 | Read PZR level (~**55 %** at HFP; program rises with load) | PZR level | Known |
| 2 | Raise level: increase charging and/or reduce letdown | CVCS | Level rising |
| 3 | Lower level: increase letdown and/or reduce charging | CVCS | Level falling |
| 4 | Place inventory AUTO for watchstanding | CVCS AUTO | Holding |

### Outcome
Level controllable under normal (non-voiding) conditions.

---

## PWR-N12 — Steam Generator level & feedwater control

### Purpose
Control SG level with feed; use three-element AUTO as the normal driver.

### Prerequisites
Main feed available; reactor at power preferred for three-element behavior.

### Precautions and limitations

| Type | Text |
|------|------|
| **CAUTION** | Shrink/swell — indicated level can move the wrong way briefly. |
| **CAUTION** | Any manual Feed Pump command takes three-element to **MANUAL**. |
| **CAUTION** | Power down with feed left high → **SG flood**. Match feed to load or re-engage AUTO. |

### Procedure — manual skill

| Step | Action | Control | Acceptance |
|------|--------|---------|------------|
| 1 | Read SG level (~**65 %**) and AUTO/MAN status | SG / Feed | Known driver |
| 2 | Raise feed % to raise level; lower to reduce | Feed Pump | Level responds |
| 3 | Re-engage **STEAM GEN FEED → AUTO** | Board | AUTO holding |

### Procedure — normal automatic

| Step | Action | Acceptance |
|------|--------|------------|
| 1 | Engage three-element AUTO at stable power | Level ~65 % |
| 2 | Maneuver load with Follow or matched Manual | No sustained fill/drain annunciator |

### Outcome
SG level controlled; MANUAL override semantics understood.

---

## PWR-N13 — Reactor Coolant Pump (RCP) operation **[approx]**

### Purpose
Operate and recognize limits of the (lumped) RCP model.

### Scope note
This plant models a single representative RCP. Multi-loop outage procedures are simplified.

### Precautions and limitations

| Type | Text |
|------|------|
| **WARNING** | Do **not** stop RCP at power except by drill/emergency — low-flow trip fires in ~2 s at **90 %** of rated flow (blocked below P-7 / 10 %). |
| **CAUTION** | Flow is **one channel**. If the pump is gone and the gauge disagrees, believe the pump — the trip reads that gauge. See `12` §10.7. |
| **NOTE** | Spray effectiveness requires flow. On heatup, RCPs **are** the heat source (N01). |

### Procedure — verify running (normal)

| Step | Action | Acceptance |
|------|--------|------------|
| 1 | Confirm RCP running | Running true |
| 2 | Confirm flow and thermal board normal | Flow ~100 % |

### Procedure — if RCP trips (see also **PWR-E02**)

| Step | Action | Acceptance |
|------|--------|------------|
| 1 | Confirm automatic reactor trip on low flow | Scrammed |
| 1a | If it did not trip, **trip manually** — single channel | Scrammed |
| 2 | Remove turbine load if not already disconnected | 0 MWe |
| 3 | Establish decay-heat removal (NC / AFW as needed) | Core safe |

### Outcome
RCP treated as critical for at-power forced flow and for pump-heat heatup.

---

## PWR-N14 — Normal shutdown Mode 1 → Mode 3, Hot Standby **[sim]**

### Purpose
Shut down from **Mode 1** (or Mode 2) to **Mode 3, Hot Standby**; maintain decay-heat removal. First half of **PWR-T21**.

### Prerequisites
Mode 1 or Mode 2.

### Precautions and limitations

| Type | Text |
|------|------|
| **WARNING** | Decay heat continues after SCRAM (~7 % of rated after a power run, decaying) — keep a heat sink. |
| **NOTE** | SCRAM forces turbine **Disconnected**. |
| **NOTE** | While power > 5 % and critical → still Mode 1. After SCRAM, hot and subcritical → Mode 3. |

### Procedure

| Step | Action | Control | Acceptance |
|------|--------|---------|------------|
| 1 | Optional: controlled down-power via **PWR-N08** | Turbine / rods | Load falling |
| 2 | SCRAM (or controlled insertion then trip) | **SCRAM** | Power collapsing |
| 3 | Confirm REACTOR TRIP; power collapsing through 5 % | Alarms / power | Shutdown nuclear |
| 4 | Confirm turbine disconnected | Turbine | Disconnected |
| 5 | Maintain SG level with feed or **AFW** | Feed / AFW | Heat sink present |
| 6 | Hold PZR P/level; subcooling healthy | PZR / CVCS | Mode 3 board |
| 7 | Monitor decay heat | (observe) | Decay heat > 0 |

### Outcome
**Mode 3, Hot Standby** — shut down, hot. Continue to Mode 5 via **PWR-N15**.

---

## PWR-N15 — Cooldown Mode 3 → Mode 5, Cold Shutdown (RHR) **[sim]**

### Purpose
Cool and depressurize from **Mode 3** through **Mode 4** to **Mode 5**. Completes master path **PWR-T21**. Training time is accelerated; plant-time rates and endpoints apply.

### Applicability
After **PWR-N14** or any hot, subcritical plant.

### Prerequisites
- Mode 3 (hot, subcritical).
- Heat sink available (SG / AFW).

### Precautions and limitations

| Type | Text |
|------|------|
| **WARNING** | **Isolate SI accumulators** at **1000 psi (6.895 MPa)** before cover-gas **600 psi (4.14 MPa)**. Nothing automatic shuts them. Failure dumps all four (empty SITs, boron dragged toward 2500 ppm, water-solid Mode 5). Basis: NUREG-1431 **LCO 3.5.1** / **SR 3.4.12.3**. |
| **NOTE** | SI block entering cooldown blocks *pumps*, not passive tanks. |
| **NOTE** | RHR is placed in service in the low-pressure band (~**400 psi (2.76 MPa)** interlock on this plant). Commercial SOPs place RHR near intermediate temperature and pressure (often on the order of ~350 °F / ~350 psig). |
| **NOTE** | Secure RCPs once RHR carries the cooldown so the SG is not the only sink. |

### Procedure

| Step | MODE | Action | Control | Acceptance |
|------|------|--------|---------|------------|
| 1 | Mode 3 | Borate to cold-shutdown margin | CVCS Borate | Boron rising toward cold SDM |
| 2 | 3 → 4 | Lower **Dump SP** to cool secondary/primary; maintain AFW/feed for SG level | Dump SP / Feed | Tavg falling; heat sink present |
| 3 | Mode 4 | Lower **Pressure SP**; use spray as needed; keep subcooling | Pressure SP / Spray | P falling controlled |
| 4 | Mode 4 | At **1000 psi (6.895 MPa)**: **close accumulator discharge** | Accumulator valve | Valve shut; SIT fill holds |
| 5 | Mode 4 | Below RHR interlock: place **RHR On**; set HX split for cooldown pace (~90 °F/h / 50 °C/h class limit) | RHR / RHR HX | RHR active |
| 6 | 4 → 5 | **Secure RCPs** once RHR carries heat | RCP Stop | Flow to RHR path |
| 7 | Mode 5 | Arrive cold (≤ ~200 °F (93.3 °C) class), depressurized, RHR in service | (observe) | Mode 5 |

### Outcome
**Mode 5, Cold Shutdown** — cold, depressurized, RHR in service. Accumulators remain isolated until **PWR-N01** re-aligns on the next heatup.

---

## 3.0 Quick reference — Mode 1 full-power band (HFP)

| Parameter | Approx. normal |
|-----------|----------------|
| Power | 100 % |
| Electrical | **≈ 100 MWe** |
| Primary pressure | **2235 psi (15.41 MPa)** |
| Tavg | ≈ 566.6 – 579.2 °F (297 – 304 °C) (no-load → full-power program) |
| PZR level | ~55 % |
| SG level | ~65 % |
| Subcooling | ~73.8 °F (41 °C) |
| Control bank | ~92 % withdrawn |

---

## 4.0 Related documents

- **05** Mode Transition Procedures — master paths T20 / T21 / T03  
- **03** Controls and Indications  
- **06** Alarm Response Procedures  
- **07** Abnormal and Emergency Operating Procedures  
- **09** Setpoints, Limits, and Normal Values  
- **12** Simulation Physics & Model Scope  

## 5.0 References

| Topic | Reference |
|-------|-----------|
| Commercial heatup subcritical; Mode 5→4→3 then Mode 3→ power | Westinghouse Technology Manual heatup outline (NRC ADAMS **ML023040286**) |
| Accumulator OPERABLE / isolate on cooldown | NUREG-1431 Rev 4.0 **LCO 3.5.1**, **SR 3.4.12.3** |
| RHR placement near intermediate T/P on cooldown | Commercial SOP practice (e.g. plant procedures of the form in NRC ADAMS **ML13310A240**) |
| Critical boron, ECC, and 1/M practice values | **09 §7.5** |
| Heatup plant-time rates and milestones | **PWR-N01** and **PWR-N01a** expected performance |
