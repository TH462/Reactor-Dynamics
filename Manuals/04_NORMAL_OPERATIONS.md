# 04 — Normal Operating Procedures

**Document:** PWR-NOP-01  
**Plant:** Pressurized Water Reactor (PWR)  
**Revision:** 14  

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
| PWR-N01 | Heatup Mode 5, Cold Shutdown → Mode 3, Hot Standby (pump heat) | 5 → 4 → 3 | [sim] |
| PWR-N02 | Mode 3, Hot Standby — plant lineup | Mode 3 | [sim] |
| PWR-N03 | Approach to criticality (Mode 3, Hot Standby → Mode 2, Startup) | 3 → 2 | [sim] |
| PWR-N04 | Mode 2, Startup — low-power operation and POAH | Mode 2 | [sim] |
| PWR-N05 | Turbine roll and generator synchronization (Mode 2 → Mode 1) | 2 → 1 | [sim] |
| PWR-N06 | Power ascension Mode 1, At Power to 100 % | Mode 1 | [sim] |

### B. At-power maneuvers

| ID | Title | MODE | Scope |
|----|-------|------|-------|
| PWR-N07 | Power maneuvering — raise power (Mode 1, At Power) | Mode 1 | [sim] |
| PWR-N08 | Power maneuvering — lower power (Mode 1, At Power) | Mode 1 | [sim] |

### C. Continuous control

| ID | Title | MODE | Scope |
|----|-------|------|-------|
| PWR-N09 | Boron and reactivity management (including xenon) | 1–3 | [sim] |
| PWR-N10 | Pressurizer pressure control | 1–3 | [sim] |
| PWR-N11 | Pressurizer level control (CVCS) | 1–3 | [sim] |
| PWR-N12 | Steam generator level and feedwater control | 1–2 | [sim] |
| PWR-N13 | Reactor coolant pump (RCP) operation | 1–3 | [sim, approx] |

### D. Shutdown path (Mode 1 → Mode 5)

| ID | Title | MODE | Scope |
|----|-------|------|-------|
| PWR-N14 | Normal shutdown Mode 1, At Power → Mode 3, Hot Standby | 1 → 3 | [sim] |
| PWR-N15 | Cooldown Mode 3, Hot Standby → Mode 5, Cold Shutdown (RHR) | 3 → 4 → 5 | [sim] |

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
| **CAUTION** | Keep the steam generator **bottled** (turbine off, dumps shut). Opening dump removes pump heat faster than the pumps can put it in. A small manual dump demand (about 5 %) is roughly ten times pump-heat generation, and it does not trim the heatup — it reverses it, measured at **−263 °F/hr (−146 °C/hr)** anywhere above about 302 °F (150 °C). Below roughly **219.2 °F (104 °C)** the same 5 % only *arrests* the climb; the secondary has too little steam to carry more. |
| **CAUTION** | Rate control at these powers: **secure the RCP** to slow or hold the heatup — measured, the rate falls to **0.004 °F/hr (0.002 °C/hr)**, i.e. the heatup simply stops. This plant models one lumped RCP (see **PWR-N13** scope note), so securing it removes *all* forced flow and uncouples the steam generator; on a multi-loop plant you would secure one pump of four. Do not use the dump as a fine throttle. |
| **WARNING** | **Re-align SI accumulators DURING the pressurization (step 6), not after it.** They must be open once RCS pressure is above their **600 psi (4.14 MPa)** cover gas and **before 1000 psi (6.895 MPa)** — and measured on this plant that window is only about **100 seconds wide**: from the moment the Pressure SP is raised, 600 psi is crossed at **+24 s**, 1000 psi at **+122 s**, and NOP at **+3.5 min**. There is **no automatic open** — re-alignment is an operator action. Skip it and the plant reaches power with no passive injection. Basis: NUREG-1431 Rev 4.0 **LCO 3.5.1** (OPERABLE in MODE 3 with RCS pressure > ~1000 psig) and the isolation counterpart on cooldown (**SR 3.4.12.3**). |
| **NOTE** | RHR auto-isolates above its **600 psi (4.14 MPa)** autoclosure interlock as you pressurize — expected. That is a *separate* setpoint from the **400 psi (2.76 MPa)** block-open permissive that governs putting RHR *in* service (#288). |
| **NOTE** | Training time is accelerated; heatup **plant hours** and rates in this procedure are real plant-time figures. |

### Procedure

| Step | MODE | Action | Control | Acceptance |
|------|------|--------|---------|------------|
| 1 | Mode 5 | Confirm cold plant: Tavg ~122 °F (50 °C), P ~363 psi (2.5 MPa), subcritical, RHR in service, RCPs secured | (observe) | Tavg < 203 °F (95 °C); Mode 5 |
| 2 | 5 → 4 | **Start RCPs** (RCP → Run). Forced flow is the heat source and couples the SG | RCP Run/Stop | Pump flow ~100 % |
| 3 | 5 / 4 | Confirm generator **disconnected** (Disconnect Grid if needed). Do not reconnect | Turbine Load | Load mode disconnected; 0 MWe |
| 4 | 5 / 4 | Engage **Feed AUTO** at cold SG level (~65 %) so three-element captures the right setpoint | Feed Pumps | Feed AUTO engaged |
| 5 | 5 / 4 | Set **Dump SP** to no-load anchor **1194 psi (8.23 MPa)**; leave dump **shut** | Dump SP | SP set; dump demand ~0 |
| 6 | 5 → 4 | Raise **Pressure SP** to **2235 psi (15.41 MPa)** and stay on the board — the plant reaches NOP in about **3.5 plant-minutes**. RHR isolates on the way past its 600 psi (4.14 MPa) autoclosure interlock. **As pressure passes 600 psi, do step 7 without leaving this step** | Pressure SP | P > 2176 psi (15.0 MPa) |
| 7 | Mode 4 | **Open SI accumulator discharge isolation** (re-align) *while pressure is between 600 psi (4.14 MPa) and 1000 psi (6.895 MPa)* — see the WARNING. Verify SIT fill on ECCS side | Accumulator valve | Valve open; opened below 1000 psi (6.895 MPa) |
| 8 | 4 → 3 | Monitor heatup: Tavg and rate, SG pressure tracking Psat(Tavg), PZR level swelling, **reactivity still negative**. No rod motion. Arrive at no-load band | (observe) | Tavg ≥ 545 °F (285 °C); Mode 3; ρ ≪ 0; power ~0 |

### Acceptance (Mode 3 declared)
- RCS at NOP T/P class: P ≈ **2235 psi (15.41 MPa)**, Tavg at no-load band ≈ **566.6 °F (297 °C)**.
- Reactor **subcritical** (measured arrival on this plant: ρ = **−2828 pcm** on **856.8 ppm**, control bank still fully inserted at 0 of 912 steps).
- Accumulators **aligned**.
- Ready for **PWR-N02** (lineup) then **PWR-N03** (approach to criticality).

> **You arrive at cold-shutdown boron, and it is NOT the boron the approach to criticality
> assumes.** The heatup dilutes nothing — 856.8 ppm in, 856.8 ppm out. That is ~174 ppm above
> the **683 ppm** that puts criticality at the reference position, and measured it moves the
> critical rod position from **319 steps to ~561** — outside the ±750 pcm acceptance band the
> estimate is checked against. **PWR-N02 step 15 is the dilution that closes it.** Do not carry
> 857 ppm into PWR-N03.

### Expected heatup performance
Pump heat only — no rod motion, no dilution. Heat source is RCP work (about 0.55 % of rated core heat at full flow) plus pressurizer heaters.

Measured full stack from the `cold_shutdown` initial condition on the default lineup, no rod
motion. **Mode boundaries on this plant are by Tavg:** Mode 5 ≤ **199.4 °F (93 °C)**, Mode 3 ≥
**350.6 °F (177 °C)**, Mode 4 between them — so on the way *up* 350 °F is the Mode 4 → 3
boundary, not the Mode 5 → 4 one.

| Milestone | Plant time | Notes |
|-----------|-----------|--------|
| Pressurized to NOP, RCPs on | **~4 plant-min** | ~3.5 min from the Pressure SP command (≈ 8.9 psi/s / 0.061 MPa/s); RHR isolates at 600 psi (4.14 MPa) on the way up |
| **Mode 4 entry** (199.4 °F (93 °C)) | **~18 plant-min** | The plant is only ~30 °F above cold — Mode 4 arrives long before it looks hot |
| **Mode 3 entry** (350 °F (176.7 °C)) | ~4.7 plant-h | Still deeply subcritical |
| Near no-load band (~546.8 °F (286.0 °C)) | ~10.7 plant-h | Steady rate after the first hour **32.7 °F/hr (18.2 °C/hr)** |
| Settled no-load (~567.0 °F (297.2 °C)) | ~11.3 plant-h | ρ = **−2828 pcm** on **856.8 ppm**; bank still fully inserted |

To slow or hold the climb, secure the RCP — measured, the rate falls to **0.004 °F/hr**. Do not
use the steam dump as a fine throttle: at 5 % it reverses the heatup at **−263 °F/hr (−146 °C/hr)**.

### Outcome
Mode 3, Hot Standby — hot, pressurized, subcritical, zero rod motion.

---

## PWR-N02 — Mode 3, Hot Standby — plant lineup **[sim]**

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
| **CAUTION** | **Boron is a prerequisite, not an observation.** Step 8 samples it and step 15 adjusts it. A plant that arrived here from **PWR-N01** is at cold-shutdown boron (~857 ppm) and is *not* ready to start — see step 15. |
| **NOTE** | **Dilute HOT, never cold.** This is the whole reason the dilution lives here in Mode 3 and not at the end of the heatup: critical boron with the bank inserted is **806 ppm at 122 °F** but only **588 ppm at 566.6 °F** (**09 §7.5**), so a figure that is comfortably subcritical hot is critical cold. Reaching the no-load temperature *before* you dilute is what makes the dilution safe. |
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
| 8 | **Sample boron and record it** — there is no live meter, and the number depends on how you reached Mode 3. Two normal arrivals: **~857 ppm** from a **PWR-N01** heatup (cold-shutdown boron, undiluted), **~683 ppm** on a plant already lined up at Hot Standby | CHEM SAMPLE | Result logged; it is the **E** input to the ECC (**09 §7.5.2**) |
| 9 | Confirm Source Range energized and counting | SR | SR On; hundreds of cps class |
| 10 | Confirm Intermediate Range available for handoff | IR | IR on scale or ready as power rises |
| 11 | Confirm SG heat sink | SG level | ~65 %; not LO-LO |
| 12 | Confirm turbine off line / 0 MWe | Turbine | Disconnected or zero load |
| 13 | Review annunciators; clear spurious | Alarm panel | Board understood |
| 14 | Confirm SI accumulators aligned if coming from heatup | Accumulator valve | Open (if heatup was done by the book) |
| 15 | **Adjust boron to the estimated critical condition.** Work the ECC (**09 §7.5.2**) for the critical rod position you intend, then borate or dilute to it with charging **On**. For the reference startup — criticality at **319 steps (35 % withdrawn)** — the target is **683 ppm** | CVCS Borate/Dilute + CHEM SAMPLE | Sample confirms the ECC boron; ρ ≈ **−1000 pcm** with the bank still in |

### Step 15 — the dilution, and why it is a step and not a note

**Measured full stack.** From a **PWR-N01** arrival (856.8 ppm, ρ = −2828 pcm), diluting to
**683 ppm** takes **~58 plant-minutes** at the plant's make-up rate (~3 ppm/min) and lands the
reactor at **ρ = −1006 pcm** — the Hot Standby hold. Withdrawing the control bank to **319 steps**
from there gives **ρ = −2.3 pcm**: critical, on the reference position, with SUR 0.065 DPM.

**Skip it and the numbers in PWR-N03 stop being true.** Measured on the same plant at 856.8 ppm,
the bank reaches 456 steps still at ρ = −794 pcm and goes critical near **561 steps (61.5 %
withdrawn)** — **242 steps and ~1830 pcm outside** the ±750 pcm acceptance band (159–421 steps)
that **09 §7.5.1** tells you to stop and re-work the estimate at. The 1/M burst sizes in PWR-N03
are sized for the 683 ppm plant and will walk you past the band without ever looking wrong.

### Outcome
Mode 3 lineup complete, boron at the ECC — ready for **PWR-N03**.

---

## PWR-N03 — Approach to criticality (Mode 3, Hot Standby → Mode 2, Startup) **[sim]**

### Purpose
Take the reactor from **Mode 3, Hot Standby** to **Mode 2, Startup** (critical, power ≤ 5 %) by controlled rod withdrawal, using **1/M**, **SUR**, and **NIS handoff**.

### Applicability
- From Mode 3 after **PWR-N02**.
- Continues into **PWR-N04** / **PWR-N05** / **PWR-N06** on master path **PWR-T03**.

### Prerequisites
1. **PWR-N02** complete — **including step 15**, the boron adjustment to the ECC. If you came from a **PWR-N01** heatup and skipped it you are ~174 ppm high and every number below is wrong.
2. Estimated Critical Condition (ECC) worked for **this** Tavg and **this** boron — see **09 §7.5**. Acceptance band for a good ECC is roughly ±750 pcm.
3. RCPs running; SR energized; Feed AUTO recommended before POAH.

> **The worked example below is for the reference startup: 683 ppm, bank fully inserted, Tavg at
> the no-load band.** There criticality is near **319 steps (~35 % withdrawn)** and the band is
> ~159–421 steps. **These are not constants of the plant — they are the answer for one boron.**
> At 857 ppm the same bank goes critical near **561 steps** (measured). Re-work the ECC for the
> boron you actually sampled; the 1/M plot closes on your prediction, it does not replace it.

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

### Typical 1/M burst sizes — **the 683 ppm reference startup**, bank starting fully inserted

Sized to land on **319 steps**. At a different boron the target moves and so do these; re-scale
them to your own ECC rather than reading them as the plant's burst pattern.

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

## PWR-N04 — Mode 2, Startup — low-power operation and POAH **[sim]**

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

## PWR-N05 — Turbine roll and generator synchronization (Mode 2, Startup → Mode 1, At Power) **[sim]**

### Purpose
Place the turbine-generator on the grid and establish electrical output coordinated with reactor power while entering **Mode 1, At Power** (power > 5 %).

### Applicability
Reactor critical (Mode 2 or early Mode 1); condenser vacuum healthy; MSIV open.

### Scope note — synchronization is ATOMIC here **[sim, approx]**
This plant has **no turbine roll and no no-load speed hold**. A real unit rolls the machine on
no-load steam, holds rated speed off line, matches speed and phase at the synchroscope, and
*then* closes the generator breaker — four operator actions and the skill this procedure is
named for. Here there is no no-load steam admission model, so an unloaded rotor with no steam
coasts to rest, and one press of **FOLLOW** or **MAN** does the whole sequence at once.

The **generator breaker is not a separate control**: on/off line *is* the load-mode selector —
**FOLLOW** and **MAN** are on line, **OFF** is the open breaker. Everything downstream of
synchronization — motoring at zero load, planned offline vs. turbine trip, load rejection, the
P-9 interlock — is modelled properly; it is the roll and the synchroscope that are not.

### Prerequisites
- **PWR-N04** complete or concurrent.
- Condenser available; MSIV open.

### Precautions and limitations

| Type | Text |
|------|------|
| **CAUTION** | Large step loads can trip on secondary/primary upset. Step load modestly. |
| **CAUTION** | **Synchronizing is ONE action on this plant, and there is no roll to do first.** Coming up from Mode 5 the generator is off line with the rotor at rest. Pressing **FOLLOW** or **MAN** takes it from there to synchronized and loaded in a single step — measured, the rotor goes to **1800 rpm** and load picks up matched to reactor power. See the scope note below: real turbine roll is not modelled. |
| **CAUTION** | **A load-slider move will not recover a TRIPPED machine.** Both FOLLOW and MAN clear a prior turbine trip (they route through `connect_grid`, vacuum permitting); the slider alone does not. Measured after a scram: selecting a load mode by itself leaves the rotor at **0 rpm and 0 MWe** with the trip still latched. If the generator card looks unresponsive, that is what you are seeing — press **FOLLOW** or **MAN**. |
| **NOTE** | **Follow** tracks reactor power; **Manual** sets MWe. Synchronize in **FOLLOW** — the turbine chases the reactor while you get on line — then take **MAN** once loaded, which is the lineup the rest of this manual assumes. Measured on a 4.7 % plant: FOLLOW picks up **5.26 MWe** matched to power; going straight to MAN synchronizes but leaves the load target at **0 MWe** until you move the slider. |
| **NOTE** | The **OFF** lamp lights on either an open breaker *or* a tripped turbine — read **TURB TRIP** to tell a planned offline from a trip (**03** §12.1). |

### Procedure

| Step | Action | Control | Acceptance |
|------|--------|---------|------------|
| 1 | Verify condenser vacuum healthy | Condenser | Above trip region |
| 2 | Verify MSIV **Open** | Steam | MSIV open |
| 3 | **Put the turbine on line: press FOLLOW** on the generator selector. It synchronizes and picks up load matched to reactor power — the reactor's heat now has somewhere to go besides the steam dump | Turbine — Connect Grid | Rotor 1800 rpm; MWe > 0; OFF lamp out |
| 3a | Take load control: press **MAN**. The setpoint stays where FOLLOW left it, already matched to the power you are making | Turbine Load | MAN; setpoint matched |
| 4 | Raise Turbine Load in steps toward a low MWe target consistent with reactor power | Turbine Load | MWe rises; steam flow rises |
| 5 | Match reactor power with rods (or Follow) so SG level stays controlled | Rods / Follow | No SG LO-LO / HI flood |
| 6 | Confirm Feed AUTO holding | Feed | AUTO engaged |
| 7 | When power > 5 %: declare **Mode 1, At Power** | (observe) | Mode 1 |
| 8 | Optional: ROD AUTO only after Tavg is where you want it | ROD AUTO | Holding without large drive |

### Outcome
Generator carrying load; plant in **Mode 1, At Power**.

---

## PWR-N06 — Power ascension Mode 1, At Power to 100 % **[sim]**

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

## PWR-N07 — Power maneuvering — raise power (Mode 1, At Power) **[sim]**

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

## PWR-N08 — Power maneuvering — lower power (Mode 1, At Power) **[sim]**

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

## PWR-N09 — Boron and reactivity management (including xenon) **[sim]**

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

## PWR-N10 — Pressurizer pressure control **[sim]**

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

## PWR-N11 — Pressurizer level control (CVCS) **[sim]**

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

## PWR-N12 — Steam generator level and feedwater control **[sim]**

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

## PWR-N13 — Reactor coolant pump (RCP) operation **[sim, approx]**

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

## PWR-N14 — Normal shutdown Mode 1, At Power → Mode 3, Hot Standby **[sim]**

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
| **WARNING** | **Block SI before you depressurize (step 1a).** The cooldown walks the primary down through the **1798 psi (12.4 MPa)** SI actuation setpoint, and an armed HPI reads that as a LOCA. Measured with SI left armed: the pumps inject, boron ends at **2500 ppm** instead of the ~857 ppm cold-shutdown figure, and the cold injection cools the plant about **ten times faster than you are asking for** — 566.6 °F to 199.4 °F (297 → 93 °C) in **23 plant-minutes** against a 90 °F/hr programme. |
| **WARNING** | **Isolate SI accumulators** at **1000 psi (6.895 MPa)** before cover-gas **600 psi (4.14 MPa)**. Nothing automatic shuts them. Failure dumps all four (empty SITs, boron dragged toward 2500 ppm, water-solid Mode 5). Basis: NUREG-1431 **LCO 3.5.1** / **SR 3.4.12.3**. |
| **WARNING** | **Block BOTH low-pressure reactor trips (steps 1c/1d), not just SI.** Two entries in the trip table watch reactor coolant pressure downward: the **low-pressure reactor trip** at **1800 psi (12.41 MPa)** and the **reactor trip on safety injection** at the **1798 psi (12.4 MPa)** SI setpoint. Taking HPI/LPI to OFF stops the *pumps* and leaves both trips armed. Neither block is available until pressure is inside the **P-11** permissive (below **1972 psi / 13.6 MPa**), which is why step 1b lowers the Pressure SP first. Measured with the blocks missed: the plant scrams about five plant-minutes into the first leg, the resulting turbine trip drives the steam dump into its Tavg-error mode, and the cooldown runs away at **−551 °F/hr (−306 °C/hr)**. Measured with only the low-pressure trip blocked: it scrams anyway, one step later. |
| **NOTE** | The SI block of step 1a stops the *pumps*. It does nothing to the passive accumulators — those are a separate, manual isolation at step 4 — and nothing to the two reactor trips above. All three are needed. |
| **NOTE** | RHR is placed in service in the low-pressure band (~**400 psi (2.76 MPa)** block-open interlock on this plant). Commercial SOPs place RHR near intermediate temperature and pressure (often on the order of ~350 °F / ~350 psig). |
| **NOTE** | Secure RCPs once RHR carries the cooldown so the SG is not the only sink. |
| **NOTE** | **The ~90 °F/hr (50 °C/hr) figure used throughout this procedure is THIS PLANT'S programmed rate, and is UNVERIFIED as a commercial limit.** No source for a real-plant cooldown rate limit has been found for this manual set; earlier revisions called it "the commercial class" on recall, which is not evidence. Treat it as the training programme it is. Real Tech Spec RCS heatup/cooldown limits derive from the pressure–temperature curves in NUREG-1431 LCO 3.4.3, which this plant does not model. |

### Procedure

| Step | MODE | Action | Control | Acceptance |
|------|------|--------|---------|------------|
| 1 | Mode 3 | Borate to cold-shutdown margin — **~857 ppm** on this plant (806 ppm critical cold with the bank in, **09 §7.5**, plus ~1000 pcm of margin). Measured, 683 → 857 ppm takes **~58 plant-minutes** at the ~3 ppm/min make-up rate | CVCS Borate | Boron at cold SDM before any cooling |
| 1a | Mode 3 | **Block SI** — HPI/LPI to OFF. See the WARNING. Do this before the pressure setpoint moves | HPI/LPI | SI in MANUAL; HPI will not auto-actuate |
| 1b | Mode 3 | Lower the **Pressure SP to 1901 psi (13.11 MPa)** — saturation for present Tavg plus the 63 °F (35 °C) subcooling margin this cooldown holds. It also puts you inside the **P-11** permissive, which is what makes 1c/1d possible | Pressure SP | Pressure below 1972 psi (13.6 MPa) |
| 1c | Mode 3 | **Block the low-pressure reactor trip** (1800 psi / 12.41 MPa) | Trip Blocks | Trip BLOCKED |
| 1d | Mode 3 | **Block the reactor trip on safety injection** (1798 psi / 12.4 MPa) — a second trip on the same channel | Trip Blocks | Trip BLOCKED |
| 2 | 3 → 4 | **Walk Dump SP and Pressure SP down TOGETHER along the saturation curve**, at the cooldown rate — Dump SP to Psat(target Tavg), Pressure SP to Psat(target Tavg + subcooling margin). Four legs of ~46.8 °F (26 °C): **1194 → 814 → 580 → 347 → 197 psi** on the dump against **1901 → 1352 → 1004 → 641 → 395 psi** on the pressurizer. Maintain AFW/feed for SG level | Dump SP / Pressure SP / Feed | Tavg falling at the programmed rate; subcooling held |
| 3 | Mode 4 | Keep the pressure walk-down *behind* the temperature — spray as needed, subcooling positive throughout | Pressure SP / Spray | P falling controlled; subcooling > 0 |
| 4 | Mode 4 | At **1000 psi (6.895 MPa)**: **close accumulator discharge** | Accumulator valve | Valve shut; SIT fill holds |
| 5 | Mode 4 | Below the **400 psi (2.76 MPa)** RHR block-open interlock: **set the HX split to ~7 % FIRST**, then place **RHR On**. The split arrives at 100 % from the at-power lineup and 100 % onto a 379.4 °F (193 °C) plant is a **−1517.4 °F/hr (−843 °C/hr)** shock | RHR HX / RHR | RHR active; rate still on programme |
| 6 | 4 → 5 | **Secure RCPs** once RHR carries heat; from here the **HX split is the rate control**, and it has to keep RISING — walk it **7 → 25 %** as the gap to the RHR sink closes | RCP Stop / RHR HX | Flow to RHR path |
| 7 | Mode 5 | Arrive cold (≤ ~199.4 °F (93 °C)), depressurized, RHR in service, accumulators isolated | (observe) | Mode 5 |

> **Step 2 is a ramp, not a chase — and not a staircase either.** Both wrong ways have been
> measured on this plant.
>
> *Chasing* — retyping the setpoints to track whatever Tavg reads right now, in ~1-minute
> steps — is a positive feedback loop: a 55 psi (0.38 MPa) error is wider than the dump's
> 36 psi (0.25 MPa) proportional band, the dump saturates, and the plant free-falls. Driven to
> the setpoint's 29 psi (0.2 MPa) stop that is **−2340 °F/hr (−1300 °C/hr)** — from
> 566.6 °F (297 °C) to 251.6 °F (122 °C) in eight plant-minutes, which is as far as the dump
> alone can take you.
>
> *Stepping* — typing one new setpoint per leg and waiting — has the right average and the
> wrong ride. The primary trails the secondary with a time constant of about 37 s, so a step
> of ΔT bursts at roughly ΔT/τ: measured, an **18 °F (10 °C) step peaks at −1168.2 °F/hr (−649 °C/hr)**
> over its first 30 s, and a whole 46.8 °F (26 °C) leg taken at once peaks at
> **−2178 °F/hr (−1210 °C/hr)**. Holding −90 °F/hr (−50 °C/hr) with discrete steps needs them
> no larger than about **1.4 °F (0.8 °C)** — roughly 250 of them for this cooldown.
>
> So *walk* it: hold the ▼ on each setpoint box and drive both off a reference temperature
> falling at the rate you want. The dump then only ever opens as far as it must to keep up —
> measured, **2–3 % demand** against its 40 % capacity for the whole of the secondary-led ride.

### Expected cooldown performance

**The cadence is part of the answer, and it is now executable.** The table below is produced by
the **`pwr_cooldown` checklist** (`ui/manual_procedures.js`, `manual_ref: PWR-N15`), replayed
through the full M4+M5+M6 stack by `test/run_procedures_stack.js` — so it is a gate, not a
transcription. Conditions: `hot_zero_power`, free-play default lineup, seed 42, 10× acceleration,
a **programmed −90 °F/hr (−50 °C/hr)** with **63 °F (35 °C)** of subcooling held throughout. Run
it at a different rate and every row below moves; that is the point of a programmed cooldown.

| Milestone | Plant time | Notes |
|-----------|-----------|--------|
| Start Mode 3 | 0 | **566.6 °F (297 °C)**, **2235 psi (15.41 MPa)**, 683 ppm |
| Boration to cold SDM complete | ~1.0 plant-h | 857 ppm; **cooling does not start until this is done** |
| SI blocked, both reactor trips blocked | ~1.09 plant-h | 1901 psi (13.11 MPa), inside P-11 |
| Isolate accumulators at **1000 psi (6.895 MPa)** | **~2.04 plant-h** | Tavg **482.7 °F (250.4 °C)**; SIT inventory still 100 % |
| RHR permissive reached, **400 psi (2.76 MPa)** | **~3.16 plant-h** | Tavg **382.8 °F (194.9 °C)** — close to the commercial ~350 °F / ~350 psig practice in the NOTE above |
| RHR aligned, RCPs secured | ~3.19 plant-h | HX split 7 %; RHR carries the heat from here |
| **Mode 4 entry** (350 °F (176.7 °C)) | ~3.49 plant-h | 392 psi (2.70 MPa) |
| Cold end, **Mode 5** (199.4 °F (93 °C)) | **~4.89 plant-h** | boron **857 ppm**, accumulators **100 % full and isolated**, RHR on, RCPs off. The checklist runs on to **177 °F (80.5 °C)** at **363 psi (2.50 MPa)** — the `cold_shutdown` initial condition's own pressure |

Measured rate: **−85 to −100 °F/hr (−47 to −56 °C/hr)** through the secondary-led legs and
**−65 to −118 °F/hr (−36 to −66 °C/hr)** on the RHR leg. The worst transient anywhere in the
run is **−172 °F/hr (−95 °C/hr)** for about ten seconds as the RHR suction opens, which is why
the checklist's guard sits at −270 °F/hr (−150 °C/hr): every known way to lose control of this
evolution is far beyond it (see the injection table in `Diagnostic/TUNING_LOG.md`). If the
accumulators are left open through 600 psi (4.14 MPa) they dump; if SI is left armed the
pressurizer goes solid and trips the plant; if either reactor trip is left unblocked you scram
in the first leg.

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
| Heatup / cooldown plant-time milestones | **PWR-N01** and **PWR-N15** expected performance — all MEASURED full stack, cadence stated with the table. N15's is produced by the `pwr_cooldown` checklist under `test/run_procedures_stack.js`, so it is re-derived on every gate run rather than transcribed |
| RCS cooldown-rate limit | **UNVERIFIED — no source found.** The 90 °F/hr (50 °C/hr) used here is this plant's programmed training rate, not a sourced commercial limit. See the NOTE in PWR-N15. |
