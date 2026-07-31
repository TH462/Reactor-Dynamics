# 04 — Normal Operating Procedures

**Document:** PWR-NOP-01  
**Plant:** Pressurized Water Reactor (PWR)  
**Revision:** 21  

---

## 1.0 Purpose

Provide step-followable **normal operating procedures** for the Reactor⚛️Dynamics PWR across commercial **plant MODES**. Fully simulated work centers on **Mode 3, Hot Standby**, **Mode 2, Startup**, and **Mode 1, At Power**. **Mode 4, Hot Shutdown** / **Mode 5, Cold Shutdown** heatup and cooldown are now **[sim]** from the `cold_shutdown` initial condition, with time-compressed rates (missions `pwr_mode5_to_mode3` / `pwr_return_to_mode1` / `pwr_mode3_to_mode5`).

**Master MODE paths:** `05_MODE_TRANSITIONS.md` — **PWR-T20** (Mode 5, Cold Shutdown → Mode 1, At Power), **PWR-T21** (Mode 1, At Power → Mode 5, Cold Shutdown).

## 2.0 Procedure index

| ID | Title | MODE focus | Scope |
|----|-------|------------|-------|
| PWR-N01 | Prerequisites & plant lineup (Mode 3, Hot Standby) | Mode 3, Hot Standby | [sim] |
| PWR-N02 | Approach to criticality (Mode 3, Hot Standby → Mode 2, Startup) | 3 → 2 | [sim] |
| PWR-N03 | Heatup Mode 5, Cold Shutdown → Mode 3, Hot Standby | 5 → 4 → 3 | [sim] |
| PWR-N04 | Mode 2, Startup low-power operation & POAH | Mode 2, Startup | [sim] |
| PWR-N05 | Turbine roll & generator synchronization | Mode 2, Startup → One | [sim] |
| PWR-N06 | Power ascension in Mode 1, At Power to 100 % | Mode 1, At Power | [sim] |
| PWR-N07 | Power maneuvering — raise power (Mode 1, At Power) | Mode 1, At Power | [sim] |
| PWR-N08 | Power maneuvering — lower power (Mode 1, At Power) | Mode 1, At Power | [sim] |
| PWR-N09 | Boron & reactivity management (incl. xenon) | Mode 1, At Power–Three | [sim] |
| PWR-N10 | Pressurizer pressure control | Mode 1, At Power–Three | [sim] |
| PWR-N11 | Pressurizer level control (CVCS) | Mode 1, At Power–Three | [sim] |
| PWR-N12 | Steam Generator level & feedwater control | Mode 1, At Power–Two | [sim] |
| PWR-N13 | Reactor Coolant Pump (RCP) operation | Mode 1, At Power–Three | [sim, approx] |
| PWR-N14 | Normal shutdown Mode 1, At Power → Mode 3, Hot Standby | 1 → 3 | [sim] |
| PWR-N15 | Cooldown Mode 3, Hot Standby → Mode 5, Cold Shutdown (RHR) | 3 → 4 → 5 | [sim] |

**Related:** MODE transitions → `05_MODE_TRANSITIONS.md`. Control details → `03_CONTROLS_AND_INDICATIONS.md`. Setpoints → `09_SETPOINTS_LIMITS.md`.

---

## PWR-N01 — Prerequisites & plant lineup (Mode 3, Hot Standby)

### Purpose
Verify the plant is correctly lined up in **Mode 3, Hot Standby** before approach to criticality.

### Applicability
Initial condition **Hot Standby** (`hot_zero_power`) = **Mode 3, Hot Standby**, or post-trip recovery to hot, subcritical conditions (still Mode 3 by temperature class).

### Prerequisites
- Simulator running; plant = PWR.
- Free Play or mission allowing operator control.

### Precautions
- Do not withdraw rods until N01 checks complete.
- Confirm no unexpected active failures unless the drill requires them.

### Procedure

| Step | Action | Control / indication | Acceptance |
|------|--------|----------------------|------------|
| 1 | Confirm plant subcritical | Power & Reactivity / reactivity or power ~0 | Reactivity &lt; 0; power near source equilibrium |
| 2 | Confirm hot operating temperature | Tavg ≈ **566.6 °F (297 °C)** (no-load program point) | At operating T (NOP) |
| 3 | Confirm primary pressure | Primary pressure ≈ **2235 psi (15.41 MPa)** | Near PZR setpoint |
| 4 | Confirm subcooling healthy | Subcooling bar | Typically tens of °C; green zone |
| 5 | Confirm RCP running (forced flow) | RCP card / rcp_running | Pump running |
| 6 | Confirm control bank fully inserted | Rod Control bar | Steps ≈ 0 withdrawn (inserted) |
| 7 | Confirm shutdown bank parked out | Shutdown bank indication | Fully withdrawn (normal) |
| 8 | Confirm boron high / plant held subcritical | Chem sample (CHEM SAMPLE if stale) | Consistent with subcritical hold |
| 9 | Confirm Source Range energized | SR detector On; SR counts | SR On; counts typically hundreds of cps class |
| 10 | Confirm Intermediate Range on scale for handoff readiness | IR current | IR rising into view as power rises later; at HZP may be low |
| 11 | Confirm SG available as heat sink | SG level ~nominal; feed available | Level not LO-LO |
| 12 | Confirm turbine load disconnected or zero as expected at HZP | Turbine-Generator | ~0 MWe typical at standby |
| 13 | Clear or acknowledge spurious alarms | Alarm panel; **A** | Board understood |
| 14 | Set time acceleration **1×–10×** max for startup | Speed selector | Operator can follow SUR |

### Outcome
Plant verified in **Mode 3, Hot Standby**; ready for **PWR-N02** (enter Mode 2, Startup).

---

## PWR-N02 — Approach to criticality (Mode 3, Hot Standby → Mode 2, Startup)

### Purpose
Take the reactor from **Mode 3, Hot Standby** (subcritical, hot) to **Mode 2, Startup** (critical, power ≤ 5 %) by withdrawing Control Rods, watching Startup Rate (SUR) and reactor period.

### Applicability
[sim] From **Mode 3, Hot Standby**.

### Prerequisites
- **PWR-N01** complete (Mode 3, Hot Standby lineup).
- Control bank inserted; SR energized; RCP running.

### Precautions
| Type | Text |
|------|------|
| **CAUTION** | Withdraw in small increments. Target SUR ≤ **1 DPM**, reactor period ≥ **30 s**. |
| **CAUTION** | The fine-step drive puts one step at ≈ **1.5 ¢** near the crossing — single-step nudges at **Slow** keep SUR well under 1 DPM. Big held withdrawals through the crossing are what spike the rate. |
| **CAUTION** | Power can **overshoot** the settling point if you lead with large withdrawals: this trainer lumps all rods into one group with Doppler-only fine structure. Approach like a real plant — fine rod control, held just-critical — and let feedback settle. |
| **NOTE** | From fully inserted rods the approach takes **two to three minutes at Norm speed**; creeping the whole way at Slow takes over ten. Norm until the SUR stirs, then Slow for the crossing. |
| **WARNING** | Leave SR energized past ~1e5 cps → **SR high-flux trip**. Perform SR→IR handoff on time. |
| **NOTE** | Rod withdrawal blocks if SUR ≥ **1.5 DPM** until SUR &lt; **0.8 DPM**. Insertion always works. |

### Procedure

| Step | Action | Control | Acceptance |
|------|--------|---------|------------|
| 1 | Confirm subcritical, hot: Tavg ≈ 566.6 °F (297 °C) (no-load), P ≈ 2235 psi (15.41 MPa) | Observe | Reactivity &lt; 0 |
| 2 | Confirm SR counting (hundreds of cps class); IR on scale when required for handoff | NIS / Power card | SR &gt; ~100 cps |
| 3 | When IR ≥ **1e-10 A** (P-6), switch **SR detector OFF** | SR detector | SR de-energized; IR carries indication |
| 4 | Set Rod Speed **Norm** for bulk withdrawal; **Slow** for final approach | Rod Speed | Speed selected |
| 5 | Withdraw Control Bank in bursts; watch SUR | Control Bank Raise | SUR responds; period long |
| 6 | If period short or SUR high: stop or insert | Stop / Lower | SUR under control |
| 7 | Pass criticality; hold low power climb | Observe power, SUR | Power &gt; ~1 % with controlled rate |
| 8 | Let Doppler / MTC settle; trim rods to hold | Rods | Stable low power, no trip |

### Outcome
Reactor in **Mode 2, Startup** (critical, controlled power ≤ 5 %); ready for **PWR-N04** / **PWR-N05**. When power later exceeds **5 %**, the plant enters **Mode 1, At Power**.

---

## PWR-N03 — Heatup Mode 5, Cold Shutdown → Mode 3, Hot Standby **[sim]**

### Purpose
Commercial heatup from **Mode 5, Cold Shutdown** through **Mode 4, Hot Shutdown** to **Mode 3, Hot Standby**. This is now **driveable on the board**: a `cold_shutdown` initial condition ships, and the heatup runs on integrated physics with time-compressed rates (mission `pwr_mode5_to_mode3`, master path **PWR-T20**). See **05_MODE_TRANSITIONS §3.0** for the transition detail.

### Sequence (simulated, rates compressed)

| Step | MODE | Action |
|------|------|--------|
| 1 | **Mode 5, Cold Shutdown** | Start from the `cold_shutdown` IC: subcritical, RCS cold (~363 psi (2.5 MPa)), RCPs secured, RHR aligned for shutdown cooling |
| 2 | Mode 5, Cold Shutdown → **Mode 4, Hot Shutdown** | **Start the RCPs** (RCP → Run) — this is the heat source, and the SG needs the flow to see it; **raise the Pressure SP** toward NOP (2235 psi (15.41 MPa)) so the heaters pressurize (RHR auto-isolates above its 400 psi (2.76 MPa) interlock, removing the cold sink) |
| 3 | **Mode 4, Hot Shutdown** | Keep the turbine off line and the dumps shut so the SG stays **bottled** — heat crossing the tubes then has nowhere to go but into secondary pressure, which rides up with Tavg. Monitor Tavg and its rate; **no rod motion, the reactor stays subcritical** |
| 4 | **Mode 4, Hot Shutdown** | **Re-align the SI accumulators.** Once RCS pressure is above their **600 psi (4.14 MPa)** cover gas, open the discharge isolation valve. They must be aligned before **1000 psi (6.895 MPa)** — above that they are required OPERABLE (NUREG-1431 LCO 3.5.1) |
| 5 | → **Mode 3, Hot Standby** | Arrive at NOP T/P (2235 psi (15.41 MPa), Tavg ≈ 548 °F (286.7 °C)) hot and still subcritical. Nothing to insert or borate — the bank never came out |

> **Step 4 is yours, and nothing does it for you.** The `cold_shutdown` lineup ships with the
> accumulators **isolated** — correct for Mode 5, since the plant sits below their cover gas —
> and **re-alignment is deliberately procedural: there is no automatic open signal** *(OWNER
> RULING, 2026-07-30: "lets leave opening of the accumulators to the procedure instead of auto
> opening them.")*. Skip it and you reach Mode 1 with **no passive injection**, and the board
> will not tell you: the **SI ACCUM ALIGNED** annunciator (**06 PWR-A32**) is the cue for the
> *cooldown*, and it is silent on exactly this case because the tanks being shut is what it
> checks for. Verify valve position and SIT fill on the ECCS side of the board before you
> declare Mode 3. Cooldown counterpart: **PWR-N15** step 3.

**Simulator note:** the heat source for heatup is the **reactor coolant pumps** — `pump_heat_frac`, 0.55 % of rated core heat at full flow — plus the pressurizer heaters, and the core **never goes critical**. Measured on the as-built plant with no rod motion: Mode 4 (200 °F / 93.3 °C) at 0.28 plant-hours, Mode 3 (548 °F / 286.7 °C) at **10.71 plant-hours**, averaging **39.8 °F/hr (22.1 °C/hr)** and settling to a steady **~32 °F/hr (17.8 °C/hr)** after the first hour. What is compressed is the **wall clock** (time acceleration), not the evolution: the plant-hours are real. The first hour reads 111.5 °F/hr because the pressurization itself is fast, not because the pump-heat ramp is. The pressurizer **Pressure SP** and steam-dump **Dump SP** controls, RCP Run/Stop, and the `plant_mode` state are all as-built.

> **Rate control.** The steam dump is a **coarse** lever at these powers: measured, a 5 % manual dump demand is roughly ten times pump-heat generation and reverses the heatup at −83 °F/hr. To slow or hold a heatup, secure an RCP — measured, that takes the rate to 0.1 °F/hr.

### Outcome
Operator drives Mode 5, Cold Shutdown → Mode 3, Hot Standby on the board and arrives subcritical-and-hot at Hot Standby (the board **PWR-N01** begins from).

---

## PWR-N04 — Mode 2, Startup low-power operation & Point of Adding Heat (POAH)

### Purpose
Operate stably in **Mode 2, Startup** (critical, ≤ 5 %) and through the early climb; recognize when fission heat exceeds losses (POAH concept). Crossing **> 5 %** enters **Mode 1, At Power**.

### Prerequisites
- **Mode 2, Startup** per **PWR-N02**.
- Heat sink available (SG inventory).

### Precautions
- At very low power, instruments and controllers may be less “stiff”; prefer manual attention to rods and feed.
- Do not rush IR/PR trip blocks until above **P-10** (10 %) — by then you are already in **Mode 1, At Power**.

### Procedure

| Step | Action | Acceptance |
|------|--------|------------|
| 1 | Hold power in Mode 2, Startup band (≤ 5 %) with small rod trims | SUR near 0; power stable ≤ 5 % |
| 2 | Confirm Tavg and pressure near NOP | P ≈ 2235 psi (15.41 MPa); Tavg near operating |
| 3 | Confirm SG level held (manual feed or three-element AUTO if reliable) | SG level not LO |
| 4 | When raising toward Mode 1, At Power: above **10 %**, block IR high / PR low-setpoint as required | Blocks allowed only above P-10 |
| 5 | Proceed to turbine roll (**PWR-N05**); declare **Mode 1, At Power** when power > 5 % | Ready for load / Mode 1, At Power |

### Outcome
Stable Mode 2, Startup; ready to roll turbine and enter Mode 1, At Power.

---

## PWR-N05 — Turbine roll & generator synchronization (Mode 2, Startup → Mode 1, At Power)

### Purpose
Place the turbine-generator on the grid and establish electrical output coordinated with reactor power while leaving **Mode 2, Startup** for **Mode 1, At Power** (power > 5 %).

### Prerequisites
- Reactor critical (**Mode 2, Startup** or already **Mode 1, At Power**).
- Condenser vacuum healthy.
- MSIV open.

### Precautions
| Type | Text |
|------|------|
| **CAUTION** | Large step load changes can trip on secondary/primary upset (load rejection). Step load modestly. |
| **NOTE** | Load mode **Follow** tracks reactor power; **Manual** sets MWe directly. |

### Procedure

| Step | Action | Control | Acceptance |
|------|--------|---------|------------|
| 1 | Verify condenser vacuum above trip region | Condenser card | Vacuum healthy |
| 2 | Verify MSIV **Open** | Steam & Flow | MSIV open |
| 3 | Select load mode **Manual** (or Follow if already matching power) | Turbine-Generator | Mode set |
| 4 | Raise Turbine Load in steps toward a low MWe target consistent with reactor power | Turbine Load | MWe rises; steam flow rises |
| 5 | Match reactor power with rods (or Follow mode) so SG level stays controlled | Rods / Follow | No SG LO-LO / HI flood |
| 6 | Place feed on **three-element AUTO** when stable | STEAM GEN FEED → AUTO | AUTO holding SG level |
| 7 | Optionally engage **ROD AUTO (Tavg)** only after Tavg is where you want it | ROD AUTO (rod card) | Holding without large drive |

### Outcome
Generator carrying load; plant in or entering **Mode 1, At Power**; nuclear–electric coordinated.

---

## PWR-N06 — Power ascension in Mode 1, At Power to 100 %

### Purpose
In **Mode 1, At Power**, raise reactor power and electrical output to full-power Mode 1 (~**100 MWe**) by coordinating rods, boron, and turbine load.

### Prerequisites
- **Mode 1, At Power** (or completing entry via N05); turbine on line or load Follow available.
- SG level control understood (**PWR-N12**).

### Precautions
- Keep power ramp modest (training guideline ~**10 %/min** class ceiling where achievable).
- Secure SR before high count trip; manage IR/PR blocks above P-10.
- Watch xenon: during sustained rise, xenon burns out (positive reactivity) — trim boron/rods.

### Procedure

| Step | Action | Control | Acceptance |
|------|--------|---------|------------|
| 1 | Establish target ladder (e.g. 25 → 50 → 75 → 100 %) | Plan | Targets known |
| 2 | Withdraw Control Bank in small bursts **or** dilute slowly | Rods / CVCS Dilute | Power rising controlled |
| 3 | Raise Turbine Load to match (Manual) **or** use Follow | Turbine Load / Follow | MWe tracks power |
| 4 | Hold at each plateau; check Tavg, pressure, SG level, subcooling | Observe | Stable board |
| 5 | Re-engage feed AUTO and PZR AUTO as needed | Board AUTO controls | Controllers holding |
| 6 | At ~92 % control bank withdrawn / HFP equilibrium, trim boron for critical hold | CVCS / rods | Power ~100 %; P ≈ 2235 psi (15.41 MPa); SG ~65 %; PZR ~55 % |
| 7 | Optionally place ROD AUTO and load FOLLOW for steady operation | ROD AUTO · FOLLOW | Hands-off hold |

### Outcome
Full-power **Mode 1, At Power** equilibrium ready for normal maneuvering or watchstanding.

---

## PWR-N07 — Power maneuvering — raise power (Mode 1, At Power)

### Purpose
Increase reactor power and electrical output within **Mode 1, At Power** from a partial-power plateau.

### Prerequisites
- **Mode 1, At Power**: critical, power > 5 %, turbine on line, stable.

### Precautions
- Rods **lead** up; turbine **follows**.
- Let temperatures and xenon follow; avoid SUR alarms.

### Procedure

| Step | Action | Control | Target / acceptance |
|------|--------|---------|---------------------|
| 1 | Withdraw Control Rods a few steps (short bursts) | Rod Speed + Raise | Small steady power rise |
| 2 | Raise Turbine Load to the new electrical target | Turbine Load | e.g. higher MWe settled |
| 3 | Verify SG level and PZR pressure/level | SG / PZR | Within normal bands |
| 4 | Trim with rods or dilute if xenon/burnup requires | Rods / Dilute | Power holds |

### Outcome
Stable higher power and MWe.

---

## PWR-N08 — Power maneuvering — lower power (Mode 1, At Power)

### Purpose
Reduce reactor power and load within **Mode 1, At Power** (or down through Mode 2, Startup toward Mode 3, Hot Standby).

### Prerequisites
- **Mode 1, At Power** (or Mode 2, Startup), turbine on line.

### Precautions
| Type | Text |
|------|------|
| **CAUTION** | Turbine **leads** down; rods trim. |
| **CAUTION** | SG level may **swell** on load drop — do not overfeed. |
| **NOTE** | After a large down-power, xenon builds over hours (use time accel carefully). |

### Procedure

| Step | Action | Control | Target / acceptance |
|------|--------|---------|---------------------|
| 1 | Reduce Turbine Load to new MWe | Turbine Load | Lower MWe |
| 2 | Insert Control Rods (bursts) and/or borate | Rods / Borate | Power falling to target |
| 3 | Watch SG level; use feed AUTO or manual trim | Feed | Level ~65 % class |
| 4 | Stabilize Tavg and pressure | PZR / rods | Quiet board |

### Outcome
Stable lower power plateau.

---

## PWR-N09 — Boron & reactivity management (including xenon)

### Purpose
Use Chemical & Volume Control System (CVCS) boron and rods for long- and short-term reactivity control; manage xenon transients.

### Prerequisites
- Charging pump available; CVCS panel accessible.

### Precautions
- Boron changes are **slow** relative to rods; concentration is known by **chemistry sample** (~60 s compressed lab turnaround), not a live meter.
- Charging pump must be **On** for borate/dilute.
- Post-trip / post-downpower xenon peak can prevent easy restart (trainer honesty: no full RPS reset cold restart path).

### Procedure — routine boron adjust

| Step | Action | Acceptance |
|------|--------|------------|
| 1 | Charging pump **On**; BORON CONTROL **On** | Pump running; channel engaged |
| 2 | Set a boron **target** — higher to borate (power down / more margin), lower to dilute (power up). The batch dose meters the change and stops at the target (see 03 §7.5) | Dose delivering |
| 3 | Watch power/Tavg respond; confirm the new concentration with a **CHEM SAMPLE** (no live boron meter) | Expected direction |
| 4 | Let the dose complete; finish with rod trim | Stable criticality |

### Procedure — xenon awareness

| Step | Action | Acceptance |
|------|--------|------------|
| 1 | After down-power or scram, note expected xenon **build** (hours) | Learning xenon chip / time |
| 2 | Use time acceleration only if you can still manage the board | No surprise trip |
| 3 | Compensate rising xenon with rods out or dilute **if** power ops continue | Power holds |
| 4 | After peak, xenon decays; insert rods or borate to avoid power rise | No unplanned power increase |

### Outcome
Operator can balance rods (fast, local) vs boron (slow, bulk) and anticipate xenon.

---

## PWR-N10 — Pressurizer pressure control

### Purpose
Hold primary pressure near **2235 psi (15.41 MPa)** using heaters (raise) and spray (lower).

### Prerequisites
- PZR at normal level band; RCP running for effective spray.

### Precautions
- Low pressure erodes **subcooling**.
- High pressure approaches PORV (**2350 psi (16.20 MPa)**) and safeties (**2485 psi (17.13 MPa)**).

### Procedure

| Step | Action | Control | Acceptance |
|------|--------|---------|------------|
| 1 | Read primary pressure | PZR card | Know current P |
| 2 | Prefer **AUTO** heaters/spray for steady ops | Heaters/Spray AUTO | Holding near 2235 psi (15.41 MPa) |
| 3 | To **lower** P: open spray (manual) briefly | PZR Spray | Pressure decreasing |
| 4 | To **raise** P: energize heaters | PZR Heaters | Pressure increasing |
| 5 | Return to AUTO | AUTO | Stable |

### Outcome
Pressure controllable; subcooling protected.

---

## PWR-N11 — Pressurizer level control (CVCS)

### Purpose
Control pressurizer level / primary inventory with charging and letdown.

### Prerequisites
- CVCS panel available.

### Precautions
- Do not chase TMI-like **false high level** during a LOCA — see emergency procedures.
- AUTO make-up modulates charging to inventory; MANUAL for deliberate moves.

### Procedure

| Step | Action | Control | Acceptance |
|------|--------|---------|------------|
| 1 | Read PZR level (normal ~**55 %** at HFP) | PZR level | Known |
| 2 | To **raise** level: increase charging and/or reduce letdown | CVCS | Level rising |
| 3 | To **lower** level: increase letdown and/or reduce charging | CVCS | Level falling |
| 4 | Place CVCS inventory **AUTO** for watchstanding | CVCS AUTO | Holding |

### Outcome
Level controllable under normal (non-voiding) conditions.

---

## PWR-N12 — Steam Generator level & feedwater control

### Purpose
Control SG water level with the feed pump; understand three-element AUTO as the normal driver.

### Prerequisites
- Main feed available; reactor at power preferred for three-element behavior.

### Precautions
| Type | Text |
|------|------|
| **CAUTION** | Shrink/swell — indicated level can move the wrong way briefly. |
| **CAUTION** | Any manual Feed Pump command takes three-element to **MANUAL**. |
| **CAUTION** | Power down with feed left high → **SG flood**. Match feed to load or re-engage AUTO. |

### Procedure — manual skill

| Step | Action | Control | Acceptance |
|------|--------|---------|------------|
| 1 | Read SG level (~**65 %**) and feed status line (AUTO vs MANUAL) | SG / Steam & Flow | Known driver |
| 2 | Raise feed pump % to raise level; lower to reduce | Feed Pump Set % / nudge | Level responds |
| 3 | Re-engage **STEAM GEN FEED → AUTO** | Board | AUTO holding |

### Procedure — normal automatic

| Step | Action | Acceptance |
|------|--------|------------|
| 1 | Engage three-element AUTO at stable power | Level ~65 % |
| 2 | Maneuver load with Follow or matched Manual | No sustained filling/draining annunciator |

### Outcome
SG level controlled; operator understands MANUAL override semantics.

---

## PWR-N13 — Reactor Coolant Pump (RCP) operation **[approx]**

### Purpose
Describe RCP operation and limitations in this trainer.

### Modeling note
Single representative RCP. Start/stop maps approximately to clearing or injecting loss-of-flow conditions; full multi-loop outage procedures are simplified.

### Precautions
- **Do not** stop RCP at power except for drill/emergency direction — low flow trips the reactor within about two seconds.
- Flow indication is **one channel**. If the pump is gone and the flow gauge disagrees, believe the pump: the trip reads that same gauge and will not fire. See `12` §10.7.
- Spray effectiveness requires flow.

### Procedure — verify running (normal)

| Step | Action | Acceptance |
|------|--------|------------|
| 1 | Confirm RCP running indication | rcp_running true |
| 2 | Confirm primary ΔT and flow-related behavior normal | Thermal board OK |

### Procedure — if RCP trips (see also PWR-E02)

| Step | Action | Acceptance |
|------|--------|------------|
| 1 | Confirm the automatic reactor trip on low flow (RCS flow < 90 %, ~2 s) | Scrammed |
| 1a | **If it did not come, trip manually and do not wait.** The low-flow trip is a SINGLE channel — cross-check RCP status, Tavg and subcooling margin against the flow indication | Scrammed |
| 2 | Remove turbine load if not already disconnected | 0 MWe |
| 3 | Establish decay heat removal (natural circulation / AFW as needed) | Core safe |

### Outcome
Operator treats RCP as critical for at-power forced flow.

---

## PWR-N14 — Normal shutdown Mode 1, At Power → Mode 3, Hot Standby

### Purpose
Shut the reactor down from **Mode 1, At Power** (or Mode 2, Startup) to **Mode 3, Hot Standby** (Hot Standby); maintain decay-heat removal. First half of **PWR-T21** (Mode 1, At Power → Mode 5, Cold Shutdown).

### Prerequisites
- **Mode 1, At Power** or **Mode 2, Startup**.

### Precautions
| Type | Text |
|------|------|
| **WARNING** | Decay heat (~**7 %** of rated after a power run, decaying) continues after SCRAM — keep a heat sink. |
| **NOTE** | SCRAM forces turbine load mode **Disconnected** (not a plant MODE number). |
| **NOTE** | While power remains > 5 % and critical, you are still **Mode 1, At Power**. After SCRAM, hot and subcritical → **Mode 3, Hot Standby**. |

### Procedure

| Step | Action | Control | Acceptance |
|------|--------|---------|------------|
| 1 | Reduce Turbine Load toward 0 (optional controlled down-power first via N08) | Turbine Load | Load falling; may pass Mode 2, Startup if still critical ≤ 5 % |
| 2 | Insert rods by SCRAM (or controlled full insertion then trip) | **SCRAM** | Power collapsing |
| 3 | Confirm REACTOR TRIP; power &lt; ~5 % | Alarms / power | Shutdown nuclear |
| 4 | Confirm turbine disconnected; steam demand ~0 | Turbine card | Disconnected |
| 5 | Maintain SG level with feed or **AFW** as required | Feed / AFW | Heat sink present |
| 6 | Hold PZR pressure/level; leave subcooling healthy | PZR / CVCS | **Mode 3, Hot Standby** board |
| 7 | Monitor decay heat indication if available (overlay / Learning) | Observe | Decay heat &gt; 0 |

### Outcome
**Mode 3, Hot Standby** — reactor shut down, hot; decay heat being removed. Continue to Mode 5, Cold Shutdown via **PWR-N15** / **PWR-T21** (driveable, rate-compressed).

---

## PWR-N15 — Cooldown Mode 3, Hot Standby → Mode 5, Cold Shutdown (RHR) **[sim]**

### Purpose
Cooldown from **Mode 3, Hot Standby** through **Mode 4, Hot Shutdown** to **Mode 5, Cold Shutdown**. This is now **driveable on the board** to a genuine cold (Mode 5) end state — only the cooldown **rates** are time-compressed (mission `pwr_mode3_to_mode5`). Completes master path **PWR-T21**.

### What is [sim]
- Decay heat model active after power history.
- **AFW** for secondary heat sink when main feed unavailable.
- **RHR** control exists for low-pressure residual heat removal when permissives met (scrammed + low pressure band ~**400 psi (2.76 MPa)** / 400 psi for auto arm, tied to the suction-valve autoclosure interlock).
- HPI/LPI and accumulators for inventory under low pressure / LOCA conditions.

### Narrative commercial path (Mode 3, Hot Standby → Mode 5, Cold Shutdown)

| Step | MODE | Action |
|------|------|--------|
| 1 | **Mode 3, Hot Standby** | Hot standby/shutdown; borate to cold-shutdown margin |
| 2 | → **Mode 4, Hot Shutdown** | Cooldown/depressurize within limits (steam dump / AFW / secondary) |
| 3 | **Mode 4, Hot Shutdown** | **Isolate the SI accumulators** passing **1000 psi (6.895 MPa)**, before RCS pressure reaches their **600 psi (4.14 MPa)** cover gas |
| 4 | **Mode 4, Hot Shutdown** | Place **RHR** in service; continue cooldown |
| 5 | → **Mode 5, Cold Shutdown** | RCS cold (≤ ~199.4 °F (93 °C) class); cold shutdown lineup |
| 6 | Mode 5, Cold Shutdown | Refueling (**Mode 6, Refueling**) is **out of scope** |

> **Step 3 is the one operators skip.** The accumulators are passive — nitrogen behind a check
> valve — and the SI block you set entering the cooldown blocks *pumps*, not these tanks.
> Nothing automatic shuts them. Ride past 600 psi (4.14 MPa) with the discharge valve open and
> all four dump: the plant reaches Mode 5 water-solid, the SITs read empty, and RCS boron is
> dragged toward the 2500 ppm tank charge, so any LOCA drill from that state has no passive
> injection. Real plants isolate here under administrative control, not on an automatic signal
> (NUREG-1431 Rev 4.0 LCO 3.5.1 applies in *"MODE 3 with RCS pressure > [1000] psig"*; LTOP
> SR 3.4.12.3 *"Verify each accumulator is isolated."*). **PWR-T20 / 05 Phase A step A5**
> re-aligns them on the heatup.

### Simulator practice
1. After **PWR-N14** (Mode 3, Hot Standby), keep AFW/feed maintaining SG level.  
2. Borate to cold-shutdown margin; **lower the Dump SP** to vent the SG and cool the primary; **lower the Pressure SP** to bring pressure down with spray.  
3. Passing **1000 psi (6.895 MPa)** on the way down, **isolate the SI accumulators** — shut the discharge valve on the ECCS side of the board (`close_accumulator_valve`). Confirm the SIT fill and cover-gas indications hold steady afterwards.  
4. Below the ~400 psi (2.76 MPa) interlock, place **RHR** in service (auto-arms) and **secure the RCPs** to decouple the SG; ride the plant down to a genuine Mode 5 cold end state (rate compressed).

### Outcome
Operator can narrate Mode 3, Hot Standby → Mode 5, Cold Shutdown; understands decay-heat obligation and trainer limits.

---

## 3.0 Quick reference — Mode 1, At Power full-power band (HFP)

| Parameter | Approx. normal | MODE |
|-----------|----------------|------|
| Power | 100 % | Mode 1, At Power |
| MWe | 1000 | Mode 1, At Power |
| Primary pressure | 2235 psi (15.41 MPa) | Mode 1, At Power–Three |
| Tavg | ≈ 566.6 – 579.2 °F (297 – 304 °C) (no-load → full-power program) | Mode 1, At Power–Three (hot) |
| PZR level | ~55 % | Mode 1, At Power |
| SG level | ~65 % | Mode 1, At Power |
| Subcooling | ~73.8 °F (41 °C) | Mode 1, At Power |
| Control bank | ~92 % withdrawn | Mode 1, At Power |

---

## 4.0 Related documents

- `05_MODE_TRANSITIONS.md`  
- `03_CONTROLS_AND_INDICATIONS.md`  
- `06_ALARM_RESPONSE.md`  
- `07_ABNORMAL_EMERGENCY.md`  
