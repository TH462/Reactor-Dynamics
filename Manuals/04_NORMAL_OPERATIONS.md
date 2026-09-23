# 04 — Normal Operating Procedures

**Document:** PWR-NOP-01  
**Plant:** Pressurized Water Reactor (PWR)  
**Revision:** 22  

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
1. Plant in **Mode 5, Cold Shutdown**: subcritical, RCS **122 °F (50 °C)**, **363 psi (2.50 MPa)**, RHR in service, RCPs secured, both banks in, **pressurizer heaters OFF and the spray in hand and shut** (as PWR-N12 leaves them on the cooldown) — the `cold_shutdown` initial condition (**09 §11.0**; restored 2026-08-31, #524; the pressure-control lineup added 2026-09-04, #624). Starting from **Mode 4, Hot Shutdown** (`hot_shutdown`) works identically from step 2, and it arrives the same way — heaters off, spray in hand — so **step 5b is an action from either start**, not a check.
2. RHR aligned for shutdown cooling.
3. SI accumulators **isolated** (correct Mode 5 lineup — plant is below cover-gas pressure).
4. Generator **off line**.
5. **Both rod banks fully inserted** — control bank *and* shutdown bank. This is the Mode 5 lineup; the shutdown bank is withdrawn as **step 2a below**, not before.

### Precautions and limitations

| Type | Text |
|------|------|
| **CAUTION** | Do **not** withdraw the **control** bank or dilute. Hot Standby is hot **and** subcritical. The **shutdown** bank is a different matter — it is withdrawn at step 2a, and withdrawing it is not a step toward criticality but a prerequisite for one. |
| **WARNING** | **The shutdown bank is IN when you arrive, and it is worth 3676 pcm.** Measured on this engine (2026-08-31): Mode 5 holds ρ = **−5809 pcm** on **918 ppm** with both banks inserted; withdrawing the shutdown bank alone takes that to roughly **−2100 pcm** and the plant is still deeply subcritical — but you have just spent most of the margin that was buying you time against an unattended dilution. Withdraw it deliberately, verify shutdown margin first, and do not leave a dilution running. |
| **CAUTION** | Keep the steam generator **bottled** — turbine off, dumps shut — **for the climb, and only for the climb**. Opening dump early removes pump heat faster than the pumps can put it in: a small demand (about 5 %) is roughly ten times pump-heat generation, and it does not trim the heatup — it reverses it, measured at **−263 °F/hr (−146 °C/hr)** anywhere above about 302 °F (150 °C). Below roughly **219.2 °F (104 °C)** the same 5 % only *arrests* the climb; the secondary has too little steam to carry more. **Once the secondary reaches the 1020 psi (7.03 MPa) no-load anchor the bottle has to be handed to the dumps** — that is step 8b, and skipping it leaves the atmospheric dump valve as the heat sink (see the WARNING below). |
| **WARNING** | **Place the steam dumps in AUTO at the top of the ride (step 8b), or the plant's heat sink is an overpressure relief valve.** The dumps hold the secondary at the **1020 psi (7.03 MPa)** no-load anchor only in **steam-pressure mode**, and the cold plant boots with the dump controller **out of service** — pressing AUTO is what selects that mode, because the turbine is tripped (**03** §12.3). Miss it and the secondary climbs past the anchor until the **atmospheric dump valve** relieves at **1042 psig**, and *that* valve becomes the heat sink for the rest of the heatup: measured on this plant, Tavg parks at **551.6 °F (288.7 °C)** with the valve modulating **7–9 %** — **4.4 °F (2.4 °C) above the no-load band, venting to atmosphere** — against **547.2 °F (286.2 °C)** and 1005 psig with AUTO in, the valve shut and the condenser dumps carrying **0.4–2.9 %**. Nothing alarms; the plant simply runs hot on a relief. And if that valve ever carries *more* than pump heat (measured, forced to 100 % during the pressurization): the RCS contracts, pressurizer level falls **25.0 → 14.2 % in 2.5 min**, the **17 %** low-level cut sheds the heaters **157.8 → 0 kW**, and pressure falls **1687 → 1598 psia** and never reaches setpoint. |
| **CAUTION** | Rate control at these powers: **secure the RCP** to slow or hold the heatup — measured, the rate falls to **0.004 °F/hr (0.002 °C/hr)**, i.e. the heatup simply stops. This plant models one lumped RCP (see **PWR-N13** scope note), so securing it removes *all* forced flow and uncouples the steam generator; on a multi-loop plant you would secure one pump of four. Do not use the dump as a fine throttle. |
| **WARNING** | **Re-align SI accumulators DURING the pressurization (step 6), not after it.** They must be open once RCS pressure is above their **665 psia (4.58 MPa)** cover gas, and the hard stop is the **1600 psig** valve-power lock (≈1615 psia / 11.14 MPa) — power is removed from the valve operator above it and the board refuses the click by name. **Re-measured on the shipped STAGED route 2026-09-18 (#593/#626): the window is about 79 plant-minutes wide** — cover gas crossed at **~0.91 plant-h** from the start of the procedure, the LCO's 1000 psig point at **~1.61 plant-h**, the lock at **~2.23 plant-h**. *(The "about 14 plant-minutes wide, cover gas at +9 min, 1000 psi at +23 min, NOP at ~1.8 plant-hours" printed here until then was the old SINGLE-STAGE pressurization, where one Pressure SP command to 2235 psi drove straight through the whole band; on the staged route the heaters stop at the 1700 psi box floor and nothing passes 1615 psia until step 9.)* There is **no automatic open** — re-alignment is an operator action. Skip it and the plant reaches power with no passive injection. Basis: NUREG-1431 Rev 4.0 **LCO 3.5.1** (OPERABLE in MODE 3 with RCS pressure > ~1000 psig) and the isolation counterpart on cooldown (**SR 3.4.12.3**). |
| **NOTE** | RHR auto-isolates above its **585 psig (4.03 MPa)** autoclosure interlock as you pressurize — expected. That is a *separate* setpoint from the **425 psig (2.93 MPa)** block-open permissive that governs putting RHR *in* service. Both are sourced: WTSM §5.1 (ML11223A219), *"prevent the valves from being opened unless the reactor coolant system pressure is less than 425 psig … automatically close when the reactor coolant system pressure increases to approximately 585 psig."* **The letdown cross-connect goes with it.** On shutdown cooling letdown runs from RHR through HCV-128, not through the letdown orifices; when that suction shuts, the orifices are the only path out of the RCS and they must already be in service — that is step 5a, and it is why it comes before the pressurization and not after. |
| **NOTE** | This procedure runs on **real plant rates** — the training time-compression of the pressurization and boron clocks was retired (#419). Ride the long legs at time acceleration; every plant-hour and rate printed here is a real plant-time figure. |

### Procedure

| Step | MODE | Action | Control | Acceptance |
|------|------|--------|---------|------------|
| 1 | Mode 5 | Confirm cold plant: Tavg ~122 °F (50 °C), P ~363 psi (2.5 MPa), subcritical, RHR in service, RCPs secured | (observe) | Tavg < 203 °F (95 °C); Mode 5 |
| 2 | 5 → 4 | **Start RCPs** (RCP → Run). Forced flow is the heat source and couples the SG | RCP Run/Stop | Pump flow ~100 % |
| 2a | 5 / 4 | **WITHDRAW THE SHUTDOWN BANK to fully out.** Drive it in manual bank control; full travel is 627 steps and takes about **9 plant-minutes** at Fast (8.7, measured). It stays out for every mode above this one and only ever moves again on a trip | Shutdown Bank | Bank at **627 / 627** |
| 3 | 5 / 4 | **Confirm the turbine is TRIPPED and the generator is off the grid — nothing to press.** The cold plant boots with TRIP lit and OUTPUT 0 MWe, and that is what the live walkthrough checks (`turbine_tripped`). If LOAD reads anything but 0, press **UNLOAD** — which is not TRIP: UNLOAD walks the load setting to zero, TRIP shuts the steam valves. Do not reconnect | Turbine Load (observe) | **TRIP** lit; OUTPUT 0 MWe |
| 4 | 5 / 4 | Engage **Feed AUTO** — three-element regulates to the programmed 65 % level (it walks there from wherever level stands) | Feed Pumps | Feed AUTO engaged |
| 5 | 5 / 4 | **Confirm the steam dump is SHUT and its setpoint already reads the no-load anchor — there is nothing to type here.** Measured on the shipped `cold_shutdown` boot (2026-09-18, #626): `steam_dump_setpoint` is **1020 psi (7.03 MPa)** out of the box — Ginna's sourced 1005 psig no-load point (#419) — with CLOSE lit and status **MANUAL**. The live walkthrough VERIFIES this step rather than commanding it; a "Set Dump SP" action stood here until 2026-09-18 and typed a number the plant was already on. The setpoint is where the dumps will hold the secondary, but **nothing reaches the valves until AUTO is pressed at step 8b** — the controller reads the box in steam-pressure mode only (**03** §12.3) | Steam Dump (observe) | **CLOSE** lit, status **MANUAL**, DUMP SETPOINT 1020 psi (7.03 MPa) |
| 5a | 5 / 4 | **Place BOTH letdown orifices in service — A+B 7 % on the LETDOWN card.** The cold plant arrives with them **out** and letdown running on the RHR cross-connect (**03** §7.3); the next step's climb autocloses that suction at **585 psig (4.03 MPa)** and from there the orifices are the only way out, while charging and seal injection keep coming in. Both, not one: measured on this engine, orifice A alone parks step 6 at **628 psi (4.33 MPa)** — *below* the **665 psia (4.58 MPa)** accumulator cover gas step 7 needs — where A+B reaches **709 psi (4.89 MPa)**. Basis: WTSM ch. 19 App. 19-1, *"Prior to reaching 350 °F (176.7 °C) in the RCS … Terminate residual heat removal letdown to the CVCS"*, and *"At this time, all reactor coolant letdown is through the normal letdown orifices of the chemical and volume control system"* | Letdown Orifices (CVCS) | A **and** B in service (A+B 7 % lit) |
| 5b | 5 / 4 | **Place pressurizer pressure control in service — AUTO on PZR SPRAY first, then AUTO on PZR HEATERS.** (Spray first is the live walkthrough's order and it is the safer one: the spray is armed before anything is making pressure.) The cold plant arrives with the heaters **off** and the spray **in hand and shut**, which is where PWR-N12 leaves them (**03** §7.1/§7.2). Nothing at all happens until this is done: measured on this engine, dialling the Pressure SP with the heaters off moves the plant **0.05 psi in 10 plant-minutes** at **0 kW**, against **+133 psi (0.92 MPa)** at **157.8 kW** once AUTO is pressed. The spray is the only way pressure comes back **down** if the heaters overshoot, and the RCPs are running from step 2 so it has head behind it. Basis: WTSM ch. 19, *"All groups of pressurizer heaters are energized to raise the pressurizer water temperature to saturation."* | Pressurizer Spray, then Heaters (PZR) | AUTO lit on **both** PZR SPRAY and PZR HEATERS |
| 6 | 5 → 4 | **STAGE 1 of the pressurization — and it has no dial.** Pressing AUTO under HEATER at step 5b *is* the command: the cold plant boots with SET PZR PRESSURE already on the box's floor, **1700 psi (11.72 MPa)**, so the heaters go to full power and drive pressure there. **Do not raise the box yet** — stage 2 is step 9, after the secondary is bottled, and taking it early re-arms a standing safety-injection signal (see the WARNING below). Measured on the shipped route: 665 psia at **~0.91 plant-h**, 1000 psi at **~1.61**, the box floor reached at **~2.30**, where pressure then sits for the rest of the climb. RHR isolates on the way past its **585 psig (4.03 MPa)** autoclosure interlock — the same setpoint as the NOTE above, quoted absolute there and gauge here; one interlock, not two. **As pressure passes 665 psia, do step 7 without leaving this step** | Pressure SP (observe) | P climbing; PRIMARY PRESSURE parks near 1700 psi (11.72 MPa) |
| 7 | Mode 4 | **Open SI accumulator discharge isolation** (re-align) *while pressure is above the **665 psia (4.58 MPa)** cover gas and below the **1600 psig** valve-power lock (≈1615 psia / 11.14 MPa)* — see the WARNING. Measured on the shipped route, that window runs **0.91 → 2.23 plant-h and is about 79 plant-minutes wide**; the board also drops the clock to 1× at 665 psia and holds it there until the valve is open, so it is hard to ride past. NUREG-1431 LCO 3.5.1 wants them operable above ~1000 psig, which the plant passes at **~1.61 plant-h** — so aim to be done before then, not merely before the lock. Verify SIT fill on ECCS side | Accumulator valve | Valve open; opened below the 1600 psig lock |
| 8 | 4 → 3 | Monitor heatup: Tavg and rate, SG pressure tracking Psat(Tavg), PZR level swelling, **reactivity still negative**. No rod motion. Arrive at no-load band | (observe) | Tavg ≥ 541.4 °F (283 °C); Mode 3; ρ ≪ 0; power ~0 |
| 8a | Mode 3 | **Confirm the letdown transfer happened**: RHR suction autoclosed during the ride, and letdown is still flowing — which at this pressure can only be the orifices you placed in service at step 5a. An orifice passes more the harder you push on it: **10.0 gpm (0.63 kg/s)** here against **11.7 gpm (0.74 kg/s)** once the plant reaches 2235 psi (15.41 MPa). If letdown reads **zero**, the orifices are shut and the plant is filling — put them in service before the second pressurization | (observe) | RHR **out**; LETDOWN FLOW **> 0** |
| 8b | Mode 3 | **Press AUTO on the STEAM DUMP card — the condenser dumps take over the heat sink.** The turbine is tripped, so AUTO selects **steam-pressure mode** and the dumps modulate to hold the **Dump SP** you confirmed at step 5 (**03** §12.3; WTSM §11.2 — steam-pressure mode is the heatup, cooldown and hot-standby mode). It goes in **here**, not at step 5: in pressure mode the controller does nothing until the header reaches the setpoint, which happens at the *end* of the ride, so an earlier press has no observable effect for plant-hours. It also costs overshoot — measured, selecting the mode at 275 psig winds the controller's integrator to its clip and the dumps then do not crack until **1023 psig** against **1005 psig** when the mode is selected at the anchor; 18 psi, still 17 psi under the atmospheric dump valve, so this is a preference for a press you can see, not a safety requirement. **Skip this step and read the WARNING above** | Steam Dump | **AUTO** lit, status reading **PRESS**; atmospheric dump valve **shut**; steam pressure on the **1020 psi (7.03 MPa)** anchor |
| 9 | Mode 3 | **STAGE 2 — raise SET PZR PRESSURE to 2235 psi (15.41 MPa), normal operating pressure.** Only now, with the dumps in AUTO and the header bottled on the 1020 psi (7.03 MPa) anchor, is it safe to cross the **P-11 permissive (1972 psi / 13.60 MPa)**: below the anchor the steam side is still under the **327.7 psi (2.26 MPa)** low-steam-pressure SI setpoint, and crossing P-11 there reinstates a STANDING safety-injection signal on a healthy plant — SI actuates, the heaters shed 157.8 kW → 0, and the pressurization parks at ~1922 psi (13.25 MPa) for good. Measured on the shipped route, the second half is **fast**: **1713 → 2176 psi (11.81 → 15.00 MPa) in 21 plant-minutes** at full heaters | Pressure SP | P > 2176 psi (15.00 MPa) |

### Acceptance (Mode 3 declared)
- RCS at NOP T/P class: P ≈ **2235 psi (15.41 MPa)**, Tavg at no-load band ≈ **546.8 °F (286 °C)** — measured on the shipped plant with the dumps in AUTO, **547.2 °F (286.2 °C)**.
- **Heat sink is the condenser dumps, not a relief**: STEAM DUMP status **PRESS**, dumps carrying **0.4–2.9 %**, steam header on the **1020 psi (7.03 MPa)** anchor (1005 psig), **atmospheric dump valve shut**. A plant sitting at 551.6 °F (288.7 °C) with that valve at 7–9 % is a plant that never got step 8b.
- Reactor **subcritical** (measured arrival on this plant: ρ = **−3399 pcm** on **~918 ppm**, control bank still fully inserted at 0 of 627 steps; re-measured 2026-09-14, #749, and re-confirmed by the 2026-09-18 end-to-end replay at **−3400 pcm on 917.8 ppm**. The **−2772 pcm on 857 ppm** printed here until then was wrong twice over — 857 ppm is the RETIRED engine’s cold-shutdown target, and −2772 is this plant at 857 ppm evaluated 10 °F above its no-load point. The shipped `cold_shutdown` boots at **917.8 ppm** and PWR-N01 dilutes nothing, so ~918 ppm is what arrives).
- **Shutdown bank fully withdrawn** (step 2a) — this is the state every mode above Mode 5 assumes, and PWR-N03 cannot reach criticality without it.
- Accumulators **aligned**.
- Ready for **PWR-N02** (lineup) then **PWR-N03** (approach to criticality).

> **You arrive at cold-shutdown boron, and it is NOT the boron the approach to criticality
> assumes.** The heatup dilutes nothing — **~918 ppm in, ~918 ppm out**. That is ~199 ppm above the
> **719 ppm** that puts criticality at the reference position, and measured (2026-09-14, #749) it
> moves the critical rod position from **208 steps to 490** — far outside the ±750 pcm acceptance
> band (**88–297**) the estimate is checked against. **PWR-N02 step 15 is the dilution that closes
> it**, and it takes **~88 plant-minutes**. Do not carry cold-shutdown boron into PWR-N03.

### Expected heatup performance
Pump heat only — no rod motion, no dilution. Heat source is RCP work (about 0.55 % of rated core heat at full flow) plus pressurizer heaters.

**Mode boundaries on this plant are by Tavg:** Mode 5 ≤ **199.4 °F (93 °C)**, Mode 3 ≥
**350.6 °F (177 °C)**, Mode 4 between them — so on the way *up* 350 °F is the Mode 4 → 3
boundary, not the Mode 5 → 4 one.

**Re-measured on the SHIPPED plant, 2026-09-18 (#593).** Everything below replaces a table taken
on the RETIRED engine on 2026-08-02, whose Mode 4 entry (18 plant-min) and steady rate
(30 °F/hr) were both a different plant. Conditions, stamped: the **`pwr_heatup` walkthrough
replayed END TO END** through `RD.SimulationService` on `selectPlant('pwr2', 'cold_shutdown')`,
**full stack (M4+M5+M6)**, **free-play default lineup**, **seed 42**, **10× acceleration**
(1.0 s of sim per tick), **no settle — t = 0 is the first tick of step 1**. All **31** of the
replay's own acceptance and guard checks passed.

**The clock below is the PLAYER'S route, not the replay's.** The authored hold on the ride step is
40,000 s, so the replay went on holding for another 5.2 plant-hours after its own 542 °F
acceptance was met; a player advances the moment the tile reads the target. Every row is the time
the condition was first TRUE.

**The pressurization is STAGED, and stage 1 needs no dial.** The `cold_shutdown` plant boots with
the Pressure SP box already on its floor, measured at **1700 psi (11.72 MPa)** — the bottom of its own
1700–2501 psi (11.72–17.24 MPa) span — so putting the heaters in AUTO *is* stage 1. It has to stay there until the
secondary is bottled on the 1020 psi (7.03 MPa) anchor, because crossing the **P-11 permissive
(1972 psi / 13.60 MPa)** with steam pressure still under the **327.7 psi (2.26 MPa)** low-steam-pressure
SI setpoint auto-reinstates a STANDING safety-injection signal: SI actuates on a healthy plant,
the heaters shed (157.8 kW → 0) and the pressurization parks at **~1922 psi (13.25 MPa)** for good *(that failure path is inherited from the 2026-09-05 replay, #629 — the 2026-09-18 run walked the staged sequence and never provoked it)*.

| Milestone | Plant time | Notes |
|-----------|-----------|--------|
| Start, Mode 5, Cold Shutdown | 0 | **122.0 °F (50.0 °C)**, **363 psi (2.50 MPa)**, **917.8 ppm**, ρ = **−5807 pcm**, both banks fully inserted |
| Shutdown bank out at 627 / 627 | **~0.16 plant-h** | 9.3 plant-minutes at Fast from a single click (step 2a) |
| Heaters and spray in AUTO — **stage 1 begins** | ~0.20 plant-h | No dial to turn: the Pressure SP box is already on its 1700 psi (11.72 MPa) floor |
| **Mode 4 entry** (199.4 °F (93 °C)) | **~0.85 plant-h** | 648 psi (4.47 MPa), ρ = **−2312 pcm**. The retired table said 18 plant-minutes; it is **51** |
| Accumulator window **OPENS** — 665 psia (4.58 MPa) cover gas | **~0.91 plant-h** | 205.2 °F (96.2 °C). The clock drops itself to 1× here and holds until the valve is open |
| …passes 1000 psi (6.895 MPa), the LCO 3.5.1 point | ~1.61 plant-h | 263.4 °F (128.6 °C) |
| Accumulator window **CLOSES** — 1600 psig valve-power lock | **~2.23 plant-h** | 1616 psi (11.14 MPa), 313.4 °F (156.3 °C). **The window is ~79 plant-minutes wide** — the "about 14 plant-minutes" in older revisions was the single-stage ride and does not apply |
| Stage 1 tops out on the box floor | ~2.30 plant-h | 1700 psi (11.72 MPa), 319.7 °F (159.8 °C); pressure then sits there for the rest of the climb |
| **Mode 3 entry** (350 °F (176.7 °C)) | **~2.69 plant-h** | 1727 psi (11.91 MPa), ρ = **−2735 pcm**. Still deeply subcritical |
| Ride step's target, **541.4 °F (283 °C)** | **~5.83 plant-h** | 1713 psi (11.81 MPa), steam header 973 psi (6.71 MPa), ρ = **−3371 pcm** |
| Steam dumps to AUTO (step 8b) | **~5.83 plant-h** on the player's route | Tavg first reaches the 546.8 °F (286.0 °C) no-load figure at ~5.95 plant-h. **This replay held on instead of pressing AUTO**, so it shows what skipping step 8b costs: Tavg climbed to **551.6 °F (288.7 °C)** on the atmospheric dump valve by ~6.1 plant-h and sat there for six plant-hours; pressing AUTO pulled it back to **547.2 °F (286.2 °C)** on the condenser dumps. Both endpoints measured in this one run |
| **Stage 2** — Pressure SP to 2235 psi, NOP reached | **+21 plant-minutes** | 1713 → 2176 psi (11.81 → 15.00 MPa) at full heaters (157.8 kW); the second half of the pressurization is *fast*, not slow |
| Arrival | **≈ 6.2 plant-h** total — DERIVED | 5.83 plant-h to the ride's target plus the 21 plant-minutes of stage 2; the replay itself took 13.57 plant-h because of the authored hold, so this sum is arithmetic on two measured legs, not a measured end-to-end clock. End state, measured: 547.2 °F (286.2 °C), 2245 psi (15.48 MPa), **917.8 ppm** undiluted, ρ = **−3400 pcm**, control bank never moved |

**Rate.** The pumps warm the cold plant fastest and then fade as the ΔT to the no-load anchor
closes: measured per quarter plant-hour, **98.4 °F/hr (54.7 °C/hr)** average over the first
15 minutes, 91.6 in the second quarter, 84.3 by 1 plant-h, 61.4 by 4, and 46.0 by 6.
End to end, 122.0 → 541.4 °F in 5.83 plant-hours is **71.9 °F/hr (39.9 °C/hr)** average.
⚠ **The worst single minute of the run is the FIRST one, at 110.4 °F/hr (61.3 °C/hr)** — over the
sourced 100 °F/hr RCS limit (§5.0), for about a minute as the pumps come up on a 122 °F plant.
Nothing else in the ride approaches it. The 567 °F (297.2 °C) endpoint printed in older revisions
and in **05** §Phase A was the retired engine's Tavg-mode ride and is not this plant's.

To slow or hold the climb, secure the RCP — measured, the rate falls to **0.004 °F/hr**. Do not
use the steam dump as a fine throttle: at 5 % it reverses the heatup at **−263 °F/hr (−146 °C/hr)**.
That is a *demanded* dump position, which this plant does not offer anyway (**03** §12.3) — it is not
an argument against step 8b, where the dumps are in AUTO on a setpoint the secondary has already
reached and carry only the **0.4–2.9 %** the pumps are adding.

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
| **CAUTION** | **Boron is a prerequisite, not an observation.** Step 8 samples it and step 15 adjusts it. A plant that arrived here from **PWR-N01** is at cold-shutdown boron (**~918 ppm**) and is *not* ready to start — see step 15. |
| **NOTE** | **Dilute HOT, never cold.** This is the whole reason the dilution lives here in Mode 3 and not at the end of the heatup: critical boron with the bank inserted is **811 ppm at 122 °F** but only **619 ppm at 546.8 °F** (**09 §7.5**), so a figure that is comfortably subcritical hot is critical cold. Reaching the no-load temperature *before* you dilute is what makes the dilution safe. |
| **NOTE** | Speed for the following approach should allow SUR to be followed (typically 1×–10×). |

### Procedure

| Step | Action | Indication | Acceptance |
|------|--------|------------|------------|
| 1 | Confirm subcritical | Reactivity / power | ρ < 0; power near source equilibrium |
| 2 | Confirm hot operating temperature | Tavg | ≈ **546.8 °F (286 °C)** no-load class |
| 3 | Confirm primary pressure | PZR / plant pressure | ≈ **2235 psi (15.41 MPa)** |
| 4 | Confirm subcooling healthy | Subcooling | Green / tens of °F of margin |
| 5 | Confirm RCPs running | RCP / flow | Flow ~100 % |
| 6 | Confirm control bank fully inserted | Rod control | Position at bottom |
| 7 | **Confirm shutdown bank parked withdrawn.** It should already be out — **PWR-N01 step 2a** withdrew it during the heatup. If it is **in** (you arrived here by trip rather than by heatup, and the trip dropped it), verify shutdown margin and withdraw it **now**, before any control-bank motion. It is worth **3676 pcm** and PWR-N03 cannot reach criticality with it inserted | Shutdown bank | Fully out, 627 / 627 |
| 8 | **Sample boron and record it** — there is no live meter, and the number depends on how you reached Mode 3. Two normal arrivals: **~918 ppm** from a **PWR-N01** heatup (cold-shutdown boron, undiluted — the shipped `cold_shutdown` boots at 917.8 ppm and PWR-N15 borates to 920), **~719 ppm** on a plant already lined up at Hot Standby (the `hot_zero_power` preset boots at 718.9 ppm) | CHEM SAMPLE | Result logged; it is the **E** input to the ECC (**09 §7.5.2**) |
| 9 | Confirm Source Range energized and counting | SR | SR On; hundreds of counts per second |
| 10 | Confirm Intermediate Range available for handoff | IR | IR on scale or ready as power rises |
| 11 | Confirm SG heat sink | SG level | ~65 %; not LO-LO |
| 12 | Confirm turbine off line / 0 MWe | Turbine | Disconnected or zero load |
| 13 | Review annunciators; clear spurious | Alarm panel | Board understood |
| 14 | Confirm SI accumulators aligned if coming from heatup | Accumulator valve | Open (if heatup was done by the book) |
| 15 | **Adjust boron to the estimated critical condition.** Work the ECC (**09 §7.5.2**) for the critical rod position you intend, then borate or dilute to it with charging **On**. For the reference startup — criticality at **208 steps (33 % withdrawn)** — the target is **719 ppm**. Note the direction: you choose the position, then move **boron** until the core is critical there | CVCS Borate/Dilute + CHEM SAMPLE | Sample confirms the ECC boron; ρ ≈ **−1137 pcm** with the bank still in |

### Step 15 — the dilution, and why it is a step and not a note

**Measured full stack** (re-measured 2026-09-14, #749). At the **719 ppm** Hot Standby hold the
reactor sits at **ρ = −1137 pcm** with the bank in, and withdrawing the control bank to
**about 208 steps** brings it critical — that is the reference position. Diluting there from a
**PWR-N01** arrival (**~918 ppm**, ρ = **−3399 pcm**) takes **~88 plant-minutes**: measured end to
end, 850 ppm at +28 min, 800 at +50, 760 at +68, 740 at +78, 725 at +85. Boron differential worth
over that span is **11.38 pcm/ppm**, and the 719 ppm hold is **path-independent** — borate away
from it and dilute back and the plant returns to **−1141 pcm** against the **−1137 pcm** it boots
at, and the 918 → 719 dilution ends at **−1138.8**.

> **Why the old numbers here were wrong, and it was not a stale plant.** This section printed
> criticality at **223 steps** and ρ = **−1257 pcm**, and PWR-N03 printed a **226–238** band, a
> **111–310** acceptance band and **8.1 pcm/step**. All of them came from one place:
> `test/run_reactivity.js` was evaluating this plant at the **BEAVRS / Watts Bar hot-zero-power
> physics-test anchor — 557.0 °F (291.67 °C) and 2248 psi (15.5 MPa)** — the benchmark the kinetics model is
> *calibrated* against, not an operating point. The plant's own no-load point is
> **547.0 °F (286.1 °C) / 2235 psi (15.41 MPa)**, ten degrees colder, and dρ/dT here is
> **−11.6 pcm/°F**. Evaluate at 557 °F and 223, −1257, −2772, 400, 111–310 and 8.06 all fall out
> to four figures; evaluate at the plant's own point and you get 207–208, −1136, −2707, 392,
> 88–297 and 7.76. The gate was real, tight, and pointed at the wrong temperature — and it stayed
> green while it published the answer. It now takes its temperature from the hottest row of the
> **09 §7.5** table it has just verified against the plant.
>
> **207 or 208 — both are this plant.** Statically at the table's 546.8 °F anchor the crossing is
> at 207; measured full stack the plant settles ~0.25 °F above its boot T-avg and it is at 208.
> **One control-bank step is 0.66 °F of T-avg here**, so a step of spread is the honest width of
> the answer. ρ is **−1.8 pcm at 207** and **+5.8 pcm at 208** on the settled plant.
>
> **The instrument declaration lands on the same step.** Rods held still for 900 s: the startup
> rate reaches 0.000 at 203, still *decays* (0.112 → 0.020) at 207, and settles *positive* at
> 0.033–0.043 with power climbing at 208. The live walkthrough's creep used to land on **226**
> (15 slow steps from 211) — eighteen steps past critical, and not a measurement of anything. Since
> #750 it lands on **213**, five steps past, and the burst that plotted a point at 211 is gone.

**Skip the dilution and the numbers in PWR-N03 stop being true.** Measured at the **~918 ppm** you
arrive with, the bank does not go critical until **490 of 627 steps (78 % withdrawn)** — **282
steps above** the reference position and **193 above the upper edge** of the ±750 pcm acceptance
band (**88–297 steps**) that **09 §7.5.1** tells you to stop and re-work the estimate at. (At the
**857 ppm** this section assumed until 2026-09-14 — the retired engine's cold-shutdown target, not
this plant's — it is **392 steps**.) The 1/M burst sizes in PWR-N03 are sized for the 719 ppm plant
and will walk you past the band without ever looking wrong.

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
1. **PWR-N02** complete — **including step 15**, the boron adjustment to the ECC. If you came from a **PWR-N01** heatup and skipped it you are ~138 ppm high and every number below is wrong.
2. Estimated Critical Condition (ECC) worked for **this** Tavg and **this** boron — see **09 §7.5**. Acceptance band for a good ECC is roughly ±750 pcm.
3. RCPs running; SR energized; Feed AUTO recommended before POAH.

> **The worked example below is for the reference startup: 719 ppm, bank fully inserted, Tavg at
> the no-load band.** There the core first goes critical at **about 208 of 627 steps (33 %
> withdrawn)** — 207 statically, 208 on the settled plant, one step being 0.66 °F of T-avg — and
> the ±750 pcm band is **88–297 steps** (re-measured 2026-09-14, #749). **The board says so on the
> same step**: stop the rods at 208 and the startup rate settles positive with the count rate still
> climbing; stop one step lower and it decays. **These are not constants of the plant —
> they are the answer for one boron.** Re-work the ECC for the boron you actually sampled; the 1/M
> plot closes on your prediction, it does not replace it.
>
> **And read the position as the ANSWER, not the instruction.** While the reactor is subcritical the
> source range count rate is the reactivity indication and the bank position is not; the position
> becomes the better indication only once you are critical (Ginna UFSAR §7.7.3.1, ML20339A027).
> The steps below are cued on the instruments for that reason, and the numbers in the burst table
> are what a correct approach *lands on*, not targets to drive to.

### Precautions and limitations

| Type | Text |
|------|------|
| **CAUTION** | Target SUR ≤ **1 DPM** (SUR HI at 1 DPM). **Nothing blocks withdrawal on rate** — the alarm is the only rate cue and the rate is yours to control. Withdrawal blocks on **flux**: the intermediate range rod stop at **20 % current equivalent**, until the **intermediate range trip** is blocked at P-10 — the same press. Insertion is never blocked. |
| **CAUTION** | Plot **enough 1/M points**. Early predictions always read high (flat toe of the worth curve), and the first two land far past the true critical position; five points close on it. A sixth is one too many — it is taken past criticality, which is the one thing the approach exists to avoid (#750). **Never** withdraw straight to the first prediction. |
| **CAUTION** | One fine step near the band is **7.76 pcm — 1.19 ¢** (re-measured 2026-09-14, #749: 7.764 pcm/step over the fifteen steps above critical; 7.67 averaged over 205–215, min 7.32, max 8.29). The **8.1 — 1.24 ¢** printed here until 2026-09-14 is the same window computed at a benchmark anchor 10 °F above this plant’s no-load point — see PWR-N02 §Step 15. **This is not the bank average**, which is 6.49 pcm/step, and it is not the cent, which is 6.50 pcm on this plant (β_eff 650.2 pcm). All three are near 6.5–8 and only the first applies here. Final approach: **Slow**, single steps. |
| **CAUTION** | **Criticality is declared on the instruments, not on the bank position.** Stop the rods; if the count rate keeps rising and SUR stays positive with nothing moving, the core is critical. WTSM 19.3 (ML11223A342): *"Supercriticality is indicated by a constant positive startup rate and steadily increasing source range count rate with no control rod withdrawal."* Record the rod position, boron and Tavg **after**. |
| **NOTE** | **Source Range secures itself at 1e5 cps** — no switch, and no source-range trip on this plant. **P-6** (IR ≥ **1e-10 A**) is where the intermediate range comes into use, roughly 32× lower; watch it come on scale well before the source range goes dark. If it has not, stop the rise and diagnose. |
| **NOTE** | Below the point of adding heat there is almost no temperature feedback — excess reactivity keeps driving power until you take it out. |

### Procedure

| Step | Action | Control | Acceptance |
|------|--------|---------|------------|
| 1 | Confirm Mode 3: subcritical, Tavg ≈ 546.8 °F (286 °C), P ≈ 2235 psi (15.41 MPa), RCPs on | (observe) | ρ < 0; Mode 3 |
| 2 | Confirm SR counting; IR ready | NIS | SR > ~1.0e2 (100 counts per second) |
| 3 | Engage Feed AUTO at ~65 % if not already | Feed Pumps | AUTO engaged |
| 4 | Capture 1/M baseline (plot point 1) **before** any rod motion | 1/M Plot | Baseline logged |
| 5 | Withdraw Control Bank in **decreasing** bursts; settle; plot after each (points 2–5) | Control Bank + 1/M | Count rate rising; prediction walks down |
| 6 | When IR on scale and below SR high caution: **SR detector OFF** | SR detector | SR de-energized; IR carries indication |
| 7 | Creep to critical at **Slow** (single steps); watch SUR and period | Control Bank | Critical; SUR ≤ 1 DPM; period long |
| 8 | Hold low power (Mode 2 band ≤ 5 %); let Doppler settle; trim | Rods | Stable Mode 2, Startup |

### Typical 1/M burst sizes — **the 719 ppm reference startup**, bank starting fully inserted

**The count rate is the cue; the step column is what the burst lands on.** Withdraw, **stop**, let
the counts settle to the value in the third column, then plot. The bursts shorten every time
because the rods get more valuable as you go: 4.15 pcm/step off the bottom against 7.76 pcm/step in
the critical band. At a different boron the whole ladder moves — re-scale it to your own ECC
rather than reading it as the plant's burst pattern.

| Burst | Steps (Norm) | Settle to | Lands near | Role |
|-------|--------------|-----------|-----------|------|
| 1 | 94 | > 7.0e2 (700 counts per second) | 94 | First overestimate |
| 2 | 63 | > 1.4e3 (1,400 counts per second) | 157 | Still late |
| 3 | 31 | > 3.0e3 (3,000 counts per second) | 188 | Entering steep worth |
| 4 | 14 | > 7.0e3 (7,000 counts per second) | 202 | **The last plotted point**, ρ = **−36 pcm** — five bank steps short of criticality, which crosses zero at **207–208** |
| Creep | ~11 Slow | SUR positive, rods stopped | 213 | Where criticality actually happens, and where it is confirmed on the instruments. It leaves **+46 pcm** of excess above critical, and below the point of adding heat nothing takes that back out for you: stop short of the 1/M prediction (≈ 211) and read the startup rate, which settles near **0.15 DPM** |

> **There used to be a fifth burst, and it went critical.** It was 9 steps to bank 211, plotting
> the last 1/M point at **ρ = +33 pcm** — on a core that was already critical, which is the one
> thing a 1/CR approach exists to avoid — and the creep beyond it left **148 pcm**. Measured and
> filed 2026-09-14 (#749); removed the same day *(OWNER RULING, 2026-09-14, #750: "I think there's
> one too many 1/m plot steps. If we remove one it doesn't change the indicated criticality rod
> step and it will let us slowly approach criticality for a lower point which will help reduce
> overshoot.")*. The prediction the panel reads at the end of the approach moves **213 → 211**
> against a true critical of **208** — two steps lower, two steps closer, and on the conservative
> side. The climb that follows is gentler for it: power arrests on its own near **4 %** instead of
> running through Mode 1 to **10.7 %**.

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
| **NOTE** | IR/PR trip blocks are allowed only above **P-10 (8 %)** — by then you are already Mode 1 if power > 5 %. |
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

> **ROLL AT 10–15 % POWER, NOT AT 2–5 %.** *"To minimize primary plant transients, the turbine is
> rolled with reactor power between 10 and 15 percent"* — WTSM §19.3 (ADAMS **ML11223A342**); its
> App 19-1 sequences the same thing, raising power until the dumps pass 10–15 % of full-load steam
> flow (step 17), blocking the IR-high (25 %) and then the PR-low (35 %) trips above P-10 (steps 18–19), and *then*
> accelerating and synchronizing (step 21). The reason is the steam balance: at 10–15 % the dumps
> are already passing that flow, so as the governor valves open the dumps modulate shut and
> **total steam flow barely changes** — Tavg, SG heat transfer and feed flow all stay put.
> Synchronize at 2–5 % and there is no dump flow to trade away, so the load pickup is a step
> demand on the primary.
>
> **This chapter said "Mode 2, ≤ 5 %" until 2026-08-12, and the plant never did.** The shipped
> `pwr_startup` walkthrough has always raised power to ~12 % and blocked both trips before pressing
> Connect Grid — gated by `run_procedures_stack`. The manual contradicted a passing gate; the
> manual was the wrong one.

### Scope note — synchronization is ATOMIC here **[sim, approx]**
This plant has **no turbine roll and no no-load speed hold**. A real unit rolls the machine off
the turning gear on no-load steam, holds rated speed off line, and synchronizes before the
generator breaker closes. Here there is no no-load steam admission model, so an unloaded rotor
with no steam coasts to rest, and one press of **FOLLOW** or **MAN** does the whole sequence at
once.

**What the real evolution actually looks like** — worth knowing, because it is *not* the
hand-throttled synchroscope drill it is often described as. On an EHC machine the operator
selects a **speed setpoint** from a short list of pushbuttons — *Close Valves, 100, 800, 1500,
**1800 RPM**, Overspeed Test* — together with an **acceleration rate**; on the SLOW rate the
roll to 1800 rpm takes about **30 minutes**. As the machine approaches rated, the EHC's speed
control section takes over and **holds no-load speed automatically**. Synchronizing may be done
by the operator or, in coordinated control, initiated automatically; once the breaker closes the
system **shifts to load control on its own**. So the operator's real job is *selecting a target
speed and a rate and supervising the roll* — which is much closer to how this plant's **Pressure
SP** and **Dump SP** boxes already work than to matching needles on a scope.

*(Sources: Westinghouse Technology Systems Manual §11.3 / §19.0, ADAMS ML11223A295 /
ML11223A342; the speed-setpoint list is from GE EHC documentation, ML11258A318. These are search
index extracts — the NRC document server refuses direct retrieval — so they are cited at this
manual's weaker evidence class, per **12** §8.)*

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
| **CAUTION** | **Synchronizing is ONE action on this plant, and there is no roll to do first.** Coming up from Mode 5 the generator is off line with the rotor at rest. Pressing **FOLLOW** or **MAN** takes it from there to synchronized and loaded in a single step — measured, the rotor goes to **1800 rpm** and load picks up matched to reactor power. See the scope note above: real turbine roll is not modelled. |
| **CAUTION** | **A load-slider move will not recover a TRIPPED machine.** Both FOLLOW and MAN clear a prior turbine trip (they route through `connect_grid`, vacuum permitting); the slider alone does not. Measured after a scram: selecting a load mode by itself leaves the rotor at **0 rpm and 0 MWe** with the trip still latched. If the generator card looks unresponsive, that is what you are seeing — press **FOLLOW** or **MAN**. |
| **NOTE** | **Follow** tracks reactor power; **Manual** sets MWe. Synchronize in **FOLLOW** — the turbine chases the reactor while you get on line — then take **MAN** once loaded, which is the lineup the rest of this manual assumes. Measured on a 4.7 % plant: FOLLOW picks up **5.26 MWe** matched to power; going straight to MAN synchronizes but leaves the load target at **0 MWe** until you move the slider. |
| **NOTE** | The **OFF** lamp lights on either an open breaker *or* a tripped turbine — read **TURB TRIP** to tell a planned offline from a trip (**03** §12.1). |

### Procedure

| Step | Action | Control | Acceptance |
|------|--------|---------|------------|
| 1 | Verify condenser vacuum healthy | Condenser | Above trip region |
| 2 | Verify MSIV **Open** | Steam | MSIV open |
| 2a | **Raise reactor power to 10–15 % BEFORE synchronizing**, and block the startup trips on the way (IR HIGH at 25 %, then PR LOW SETPOINT at 35 % — in that order, both available above P-10). Do not roll at 2–5 % | Control Bank · Trip Blocks | Power 10–15 %; both blocks in |
| 3 | **Put the turbine on line: press FOLLOW** on the generator selector. It synchronizes and picks up load matched to reactor power — the reactor's heat now has somewhere to go besides the steam dump | Turbine — Connect Grid | Rotor 1800 rpm; MWe > 0; OFF lamp out |
| 3a | Take load control: press **MAN**. The setpoint stays where FOLLOW left it, already matched to the power you are making | Turbine Load | MAN; setpoint matched |
| 4 | Raise Turbine Load in steps toward a low MWe target consistent with reactor power | Turbine Load | MWe rises; steam flow rises |
| 5 | Match reactor power with rods (or Follow) so SG level stays controlled | Rods / Follow | No SG LO-LO / HI flood |
| 6 | Confirm Feed AUTO holding | Feed | AUTO engaged |
| 7 | When power > 5 %: declare **Mode 1, At Power** | (observe) | Mode 1 |
| 8 | Trim Tavg onto program with the bank, in MAN — there is no automatic rod control on this plant (**03 §14.3**) | Rods | Tavg on program, held by hand |

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
| 6 | Near HFP: bank **~96.7 % withdrawn (606 of 627 steps)** at equilibrium xenon; trim boron for critical hold | CVCS / rods | Power ~100 %; P ≈ 2235 psi (15.41 MPa); SG ~65 %; PZR ~61.5 % |
| 7 | Hold Tavg on program with the bank as load settles — rod control is MANUAL here (**03 §14.3**) | Rods | Tavg on program; power steady |

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
- **A load INCREASE ramps at 5 % of rated per minute — 5 MWe/min** (**09** §10.0). What you dial
  lands on the board at once; the machine takes a minute for every 5 MWe. Trim rods against the
  megawatts the generator is actually making, not against the number you typed, and expect a
  20 MWe leg to be four minutes of walking. The ramp is there because a load increase delivered
  instantly shrinks the pressurizer onto its **17 %** low-level isolation (**12** §7.3).
- **Above the P-9 interlock, a turbine trip is a reactor trip — not a ride-out.** It arms at
  power ≥ **50 %** with the steam dumps available, ≥ **8 %** if they are not — condenser lost,
  vacuum or MSIV shut (**09** §2.0; engine `P9` permissive, sourced Ginna TS Bases B 3.3.1).
  Below P-9 there is no reactor trip; the steam dump carries the transient instead. A turbine
  trip with the dumps also gone leaves nothing to hold power — watch condenser vacuum and MSIV
  status through the leg, not just MWe.

### Procedure

| Step | Action | Control | Acceptance |
|------|--------|---------|------------|
| 1 | Withdraw Control Bank in short bursts | Rods | Small steady power rise |
| 2 | Raise Turbine Load to new MWe — the target walks up at 5 MWe/min | Turbine Load | Higher MWe settled after the ramp |
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
| **NOTE** | A load **reduction is not ramped** — it takes effect at once, any size (**09** §10.0). Only increases walk. A large enough cut arms the C-7 loss-of-load steam dump, as does **UNLOAD**. |

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
| **NOTE** | Boron is slow vs rods. Concentration is known by **chemistry sample** (a real 30-minute lab turnaround), not a live meter. |
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
- High pressure approaches the PORV — which lifts **100 psi (0.69 MPa) above your setpoint**, so **2335 psi (16.099 MPa)** at the nominal 2235 psi (15.41 MPa) — and then the safeties at a fixed **2500 psi (17.24 MPa)**.

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
| 1 | Read PZR level (~**61.5 %** at HFP; program rises with load) | PZR level | Known |
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
| **WARNING** | Do **not** stop RCP at power except by drill/emergency — low-flow trip fires in ~2 s at **90 %** of rated flow (blocked below P-7 / 8 %). |
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
| **WARNING** | **Block SI before you depressurize (step 1a).** The cooldown walks the primary down through the **1715 psi (11.824 MPa)** SI actuation setpoint, and an unblocked SI actuation reads that as a LOCA. Measured with SI left armed: the pumps inject, boron ends at **2500 ppm** instead of the 920 ppm cold-shutdown figure, and the cold injection cools the plant about **ten times faster than you are asking for** — 546.8 °F to 199.4 °F (286 → 93 °C) in **23 plant-minutes** against a 90 °F/hr programme. |
| **WARNING** | **Isolate SI accumulators** at **1000 psi (6.895 MPa)** before cover-gas **665 psia (4.58 MPa)**. Nothing automatic shuts them. Failure dumps all four (empty SITs, boron dragged toward 2500 ppm, water-solid Mode 5). Basis: NUREG-1431 **LCO 3.5.1** / **SR 3.4.12.3**. |
| **WARNING** | **Block BOTH low-pressure reactor trips (steps 1c/1d), not just SI.** Two entries in the trip table watch reactor coolant pressure downward: the **low-pressure reactor trip** at **1775 psi (12.24 MPa)** and the **reactor trip on safety injection** at the **1715 psi (11.824 MPa)** SI setpoint. Taking HPI/LPI to OFF stops the *pumps* and leaves both trips armed. Neither block is available until pressure is inside the **P-11** permissive (below **1972 psi / 13.6 MPa**), which is why step 1b lowers the Pressure SP first. Measured with the blocks missed: the plant scrams about five plant-minutes into the first leg, the resulting turbine trip drives the steam dump into its Tavg-error mode, and the cooldown runs away at **−551 °F/hr (−306 °C/hr)**. Measured with only the low-pressure trip blocked: it scrams anyway, one step later. |
| **NOTE** | The SI block of step 1a stops the *pumps*. It does nothing to the passive accumulators — those are a separate, manual isolation at step 4 — and nothing to the two reactor trips above. All three are needed. |
| **NOTE** | RHR is placed in service in the low-pressure band (the **440 psi (3.03 MPa)** block-open interlock on this plant — the sourced 425 psig). Commercial SOPs place RHR near intermediate temperature and pressure (often on the order of ~350 °F / ~350 psig). |
| **NOTE** | Secure RCPs once RHR carries the cooldown so the SG is not the only sink. |
| **NOTE** | **The ~90 °F/hr (50 °C/hr) used throughout this procedure is THIS PLANT'S programmed rate; the LIMIT it sits inside is 100 °F/hr and is sourced** — *"Do not exceed a heatup rate of 100 °F/hr in the pressurizer or 100 °F/hr in the RCS"* (WTSM App 19-1, ML11223A342) and the RCS design cycles at *"<100 °F/hr"* (WTSM §3.2 Table 3.2-10, ML11223A213); Tech Spec basis NUREG-1431 LCO 3.4.3 *(OWNER RULING, 2026-08-09: "100 F/hr TS + 50 admin")*. This NOTE claimed no source existed until 2026-08-12 — see §5.0. What remains true is that 90 °F/hr is a **programme**, not a limit, and that the pressure–temperature curves LCO 3.4.3 actually derives from are not modelled here. |

### Procedure

| Step | MODE | Action | Control | Acceptance |
|------|------|--------|---------|------------|
| 1 | Mode 3 | Borate to the cold-shutdown boron — **920 ppm** on this plant, which is the figure the walkthrough's own BORON command types (re-measured 2026-09-18, #751). It is chosen to close the operating cycle: the `cold_shutdown` initial condition boots at **917.8 ppm**, so a cooldown that ends at 920 ppm hands the next **PWR-N01** heatup the plant it expects. Measured full stack from `hot_zero_power`, **718.9 → 920 ppm takes ~67 plant-minutes** at a flat **3.0 ppm/min** make-up rate (measured twice — a scripted ride and the walkthrough replay, both 67 min; **boration and dilution are NOT the same rate on this plant** — dilution runs ~2.2 ppm/min, #749). **What 920 ppm buys, cold:** critical boron at 122 °F (50 °C) with the control bank in and the shutdown bank out is **811 ppm** (**09 §7.5**), so 920 ppm is **109 ppm** above it — about **2230 pcm** at the cold differential worth of 20.46 pcm/ppm. The replay's own cold end measures **ρ = −2325 pcm** at 197.2 °F (91.8 °C) in that rod configuration. **That is the boron's contribution alone — it is not the SHUTDOWN MARGIN**, which is computed with all rods assumed inserted (**09 §7.5.3**). If you got here through PWR-N14 the trip also dropped the shutdown bank, worth another **3676 pcm**, so the plant you arrive at in Mode 5 sits deeply shut down. (**857 ppm** stood here until 2026-09-18 and was the RETIRED engine's cooldown target; so did a **806 ppm** cold critical figure that this plant has never had.) | CVCS Borate | Boron at **920 ppm** before any cooling |
| 1a | Mode 3 | **Block SI at the Trip Blocks panel** — `si_trip`. See the WARNING. It is refused above **P-11**, so the pressure setpoint (step 1b) comes down first. **Taking HPI/LPI to OFF is NOT this step**: there is no ESF arm on this plant (**03 §17.4**), so switching the pumps off leaves the actuation live and it will start them again at 1715 psi (11.824 MPa) | Trip Blocks | SI actuation BLOCKED |
| 1b | Mode 3 | Lower the **Pressure SP to 1900 psi (13.10 MPa)** — the figure the walkthrough types, and it is chosen to put you inside the **P-11** permissive (below 1972 psi / 13.60 MPa), which is what makes 1c/1d possible at all. Measured, the plant crosses P-11 at **1.45 plant-h** and the blocks go in at **1.50**. *(The **1901 psi** that stood here until 2026-09-18 was derived as saturation plus 63 °F (35 °C) off the RETIRED engine's 566.6 °F Mode 3; this plant's Mode 3 is 547 °F and the same arithmetic gives ~1640 psi, below the box's own 1700 psi floor — so the derivation never applied here. Subcooling on this route is not "held" at a margin either: measured, it runs **83.6 °F (46.4 °C) at the start of the walk to 286.2 °F (159.0 °C) at the end of it** and only collapses to 13.7 °F (7.6 °C) at the cold end, because the pressure walk deliberately lags the temperature walk — step 3.)* | Pressure SP | Pressure below 1972 psi (13.60 MPa) |
| 1c | Mode 3 | **Block the low-pressure reactor trip** (1775 psi / 12.24 MPa) | Trip Blocks | Trip BLOCKED |
| 1d | Mode 3 | **Block the reactor trip on safety injection** (1715 psi / 11.824 MPa) — a second trip on the same channel | Trip Blocks | Trip BLOCKED |
| 2 | 3 → 4 | **First verify the dumps are in steam-pressure mode — AUTO lit, status PRESS** (**03** §12.3). The Dump SP box is read **only** in that mode, so on a plant that is not in it the whole walk below moves a number that reaches nothing. The Hot Standby preset boots in pressure mode; a plant you heated up yourself is in it only if **PWR-N01** step 8b was done. Then **walk Dump SP and Pressure SP down TOGETHER along the saturation curve**, at the cooldown rate — Dump SP to Psat(target Tavg), Pressure SP to Psat(target Tavg + subcooling margin). Four legs on the dump, from this plant's **1020 psi (7.03 MPa)** no-load anchor: **1020 → 641 → 400 → 241 → 120 psi** (7.03 → 4.42 → 2.76 → 1.66 → 0.83 MPa), which is the ramp the walkthrough drives (re-measured from the shipped route 2026-09-18, #593 — the old **1194 → 814 → 580 → 347 → 197 psi** was the retired engine's). The pressurizer walk is **two** legs, not four, because the Pressure SP box bottoms out: **2235 → 1900 psi** here and **1900 → 1700 psi** at step 5 — the box's own floor, 1700 psi (11.72 MPa) — after which pressure comes down on spray alone. Measured, the dump walk takes **~2.7 plant-hours** (1.51 → 4.17 plant-h) and carries Tavg **547 → 350 °F (286 → 177 °C)**. Maintain AFW/feed for SG level | Dump SP / Pressure SP / Feed | Tavg falling at the programmed rate; subcooling held |
| 3 | Mode 4 | Keep the pressure walk-down *behind* the temperature — spray as needed, subcooling positive throughout | Pressure SP / Spray | P falling controlled; subcooling > 0 |
| 4 | Mode 4 | **Close accumulator discharge.** The window is narrow and it is bounded at BOTH ends: power is removed from the valve operator above **1600 psig** (≈1615 psia / 11.14 MPa — TS Bases B 3.5.1, and the engine refuses the click by name), and the tanks discharge once pressure falls through their **665 psia (4.58 MPa)** cover gas. Measured on the shipped route (2026-09-18, #593): the lock clears at **4.60 plant-h**, 1000 psi passes **3.7 plant-minutes** later and cover gas **8.6 plant-minutes** later — so **the whole window is about 8.6 plant-minutes wide** and the walkthrough shuts the valve inside it at ~1030 psi. The 1000 psi figure that stood here alone is the LCO 3.5.1 OPERABILITY point, not the interlock | Accumulator valve | Valve shut; SIT fill holds at 100 % |
| 5 | Mode 4 | Below the **440 psi (3.03 MPa)** RHR block-open interlock: **set the HX split to ~7 % FIRST**, then place **RHR On**. The split arrives at 100 % from the at-power lineup and 100 % onto a 379.4 °F (193 °C) plant is a **−1517.4 °F/hr (−843 °C/hr)** shock *(that figure is inherited and was not re-measured in the 2026-09-18 pass)*. **The live walkthrough does it the other way round — ALIGN, then trim to 7 % — and gets away with it because both commands land in the same instant and the plant is at 341.8 °F (172.1 °C) by then, not 379 °F: measured, the worst single minute after alignment is −133.3 °F/hr (−74.1 °C/hr).** A human cannot press two buttons in the same instant, so **split-first is still the instruction here**; the walkthrough's order is not a licence to align at 100 % and go looking for the HX card | RHR HX / RHR | RHR active; rate still on programme |
| 6 | 4 → 5 | **Secure RCPs** once RHR carries heat — but **LEAVE THE PRESSURIZER SPRAY RUNNING.** With the heaters off and the Pressure SP dial already on its 1700 psi floor, spray is the only pressure control left, and the pressurizer shell is still hot metal: measured, shutting it at 274.7 °F (134.8 °C) gave back **181 kW** into a 425 °F (218.3 °C) fluid and drove pressure **+33 psi/min** until the 585 psig RHR autoclosure shut the suction valve at 610 psig, which the 425 psig open permissive then refused to re-open (#729). From here the **HX split is the rate control** — walk it **7 → 12 %**: 25 % measures **−193 °F/hr (−107 °C/hr)**, over the 100 °F/hr limit, while 12 % holds **−95 °F/hr (−53 °C/hr)** worst and **−74 °F/hr (−41 °C/hr)** average | RCP Stop / RHR HX | Flow to RHR path; spray still on; rate inside 100 °F/hr |
| 6b | Mode 5 | **Then** shut the spray, once the plant is cold. Measured: at Mode 5 shutting it moves pressure **+1 psi per 5 plant-minutes**, against +33 psi/min at 274.7 °F (134.8 °C) | Spray | SPRAY OFF; pressure steady and low |
| 7 | Mode 5 | Arrive cold (≤ ~199.4 °F (93 °C)), depressurized, RHR in service, accumulators isolated | (observe) | Mode 5 |

> **Step 2 is a ramp, not a chase — and not a staircase either.** Both wrong ways have been
> measured, and the lesson holds — but **⚠ the four rate figures in this block were taken on the
> RETIRED engine (2026-08-02) and have NOT been re-measured** (#593 re-measured the milestone
> table and the setpoint legs above, not these). The tell is the **566.6 °F (297 °C)** start
> temperature they run from: this plant's Mode 3 is **547.1 °F (286.2 °C)**, measured. Read them
> as the shape of the two failure modes, not as this plant's numbers.
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

**The cadence is part of the answer, and it is executable.** The table below is read off the
**`pwr_cooldown` walkthrough** (`ui/manual_procedures.js`, `manual_ref: PWR-N15`) replayed end to
end through the full M4+M5+M6 stack. **What a gate checks and what this table says are not the
same claim:** `test/run_checklist_pwr2.js` drives this walkthrough on every run and asserts every
step's acceptance and guard — so the ROUTE is gated — but no runner asserts the plant-times
below, and `test/run_procedures_stack.js` skips pwr2 outright (`if (profKey === 'pwr2') return`).
These are a transcription of one dated replay. Run it at a different rate and every row moves;
that is the point of a programmed cooldown.

**Re-measured on the SHIPPED plant, 2026-09-18 (#593).** Everything below replaces a table taken
on the RETIRED engine in 2026-08-02, which started at 566.6 °F on 683 ppm — neither of which is
this plant. Conditions, stamped: the **`pwr_cooldown` walkthrough replayed END TO END** through
`RD.SimulationService` on `selectPlant('pwr2', 'hot_zero_power')`, **full stack (M4+M5+M6)**,
**free-play default lineup**, **seed 42**, **10× acceleration** (1.0 s of sim per tick),
**no settle — t = 0 is the first tick of step 1**. All **32** of the replay's own acceptance and
guard checks passed, so these are milestones of a route the player can actually walk.
**The clock is the replay's authored holds, and on this leg that is close to but not identical to a
player's**: the boration step's acceptance (880 ppm) is met at **0.90 plant-h** while its hold runs
to **1.08**, so a player who advances on the tile arrives at every row below up to about
**0.2 plant-h** early. Unlike the heatup, no hold here overruns its acceptance by hours.

| Milestone | Plant time | Notes |
|-----------|-----------|--------|
| Start, Mode 3, Hot Standby | 0 | **547.1 °F (286.2 °C)**, **2235 psi (15.41 MPa)**, **718.9 ppm**, ρ = **−1139 pcm**, steam header on the **1020 psi (7.03 MPa)** anchor |
| Boration to the cold-shutdown boron complete, **920 ppm** | **~1.11 plant-h** | 3.0 ppm/min, 67 plant-minutes; ρ = **−3414 pcm**. **Cooling does not start until this is done** |
| SI blocked, both low-pressure reactor trips blocked | **~1.50 plant-h** | Inside **P-11**, which the plant reaches at **1.45 plant-h** / 1972 psi (13.60 MPa); Tavg still 547 °F |
| Dump-SP walk begins — Tavg starts down | **~1.51 plant-h** | Four legs, **1020 → 641 → 400 → 241 → 120 psi**; the walk runs to **4.17 plant-h** |
| **Mode 4 entry** (350 °F (176.7 °C)) | **~4.11 plant-h** | 1925 psi (13.27 MPa), ρ = **−2772 pcm** |
| Heaters off, spray to MANUAL 50 % | ~4.59 plant-h | The Pressure SP box is already on its **1700 psi (11.72 MPa)** floor; spray is the only pressure control left |
| Isolate accumulators — window **8.6 plant-minutes** wide | **~4.60 – 4.74 plant-h** | Opens when the **1600 psig** valve-power lock clears (1615 psia / 11.14 MPa) at 4.60, shuts before the **665 psia (4.58 MPa)** cover gas at 4.74; Tavg 341.6 °F (172.0 °C), SIT inventory still 100 % |
| RHR permissive reached, **440 psi (3.03 MPa)** | **~4.82 plant-h** | Tavg **341.9 °F (172.2 °C)** — close to the commercial ~350 °F / ~350 psig practice in the NOTE above |
| RHR aligned at 7 % HX split, RCPs secured | **~5.00 plant-h** | RHR carries the heat from here; the split then walks 7 → 12 % |
| Cold end, **Mode 5** (199.4 °F (93 °C)) | **~6.99 plant-h** | **15 psi (0.10 MPa)**, boron **919.6 ppm**, ρ = **−2325 pcm**, accumulators **100 % full and isolated**, RHR on at 12 % split, RCPs off, shutdown bank out at 627/627 and the control bank in at 0 |
| Walkthrough ends | ~7.04 plant-h | 197.2 °F (91.8 °C), 14 psi (0.10 MPa), 13.7 °F (7.6 °C) of subcooling. **It does NOT end on the `cold_shutdown` preset's 363 psi (2.50 MPa)** — that claim stood here until 2026-09-18 and is 349 psi wrong; this route depressurizes essentially to atmospheric |

Measured rate, over 60-second windows binned by quarter plant-hour:
**−67 to −87 °F/hr (−37 to −48 °C/hr)** through the secondary-led legs,
with a worst single minute of **−107.5 °F/hr (−59.7 °C/hr)**; and
**−53 to −81 °F/hr (−29 to −45 °C/hr)** on the RHR leg,
with a worst single minute of **−133.3 °F/hr (−74.1 °C/hr)** just after the suction opens. End to end, 547.2 °F to
199.4 °F in 5.50 plant-hours is **−63.3 °F/hr (−35.2 °C/hr)** average. Between the two there is a
**deliberate plateau** — Tavg holds at ~341.6 °F (172.0 °C) from 4.11 to 5.03 plant-h while the
pressure walk, the accumulator isolation and the RHR alignment happen with the secondary already
stalled at its own saturation. The walkthrough's own runaway guard is
**−1080 °F/hr (−600 °C/hr)** (`tavg_rate_c_per_hr`, read off the authored procedure — the
−270 °F/hr printed here until 2026-09-18 was never that guard's value): every known way to lose
control of this evolution is far beyond it (see the injection table in
`Diagnostic/TUNING_LOG.md`). If the
accumulators are left open through 665 psia (4.58 MPa) they dump; if SI is left armed the
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
| Tavg | ≈ 547.0 – 580.1 °F (286.1 – 304.5 °C) (no-load → full-power program; #647, 2026-09-11) |
| PZR level | ~61.5 % |
| SG level | ~65 % |
| Subcooling | ~73.8 °F (41 °C) |
| Control bank | **~96.7 % withdrawn (606 of 627 steps)** — the sourced full-power position, **09** §11.0 |

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
| Heatup / cooldown plant-time milestones | **PWR-N01** and **PWR-N15** expected performance — both MEASURED full stack, conditions stamped with the table, re-measured on the shipped plant 2026-09-18 (#593) by replaying each walkthrough end to end. **The ROUTE is gated** — `test/run_checklist_pwr2.js` drives both walkthroughs and asserts every step's acceptance and guard — but **no runner asserts the plant-times in those tables**, and `run_procedures_stack` skips pwr2 entirely. Treat them as a dated transcription, not a gate |
| RCS heatup / cooldown-rate limit | **SOURCED — 100 °F/hr.** *"Do not exceed a heatup rate of 100 °F/hr in the pressurizer or 100 °F/hr in the RCS"* (Westinghouse Technology Systems Manual App 19-1, NRC ADAMS **ML11223A342**), and WTSM §3.2 Table 3.2-10 lists the RCS design cycles as *"Heatup at <100 °F/hr — 200; Cooldown at <100 °F/hr — 200"* (**ML11223A213**). Tech Spec basis: NUREG-1431 **LCO 3.4.3**. *(OWNER RULING, 2026-08-09, on #398: "100 F/hr TS + 50 admin" — adopt the sourced limit as the hard number, keep ~50 °F/hr as a soft administrative target.)* This table said **"UNVERIFIED — no source found"** until 2026-08-12, four months after the number, the sources and the ruling had all landed in the engine and on the board — the board's Heatup Rate tile has annunciated at ±100 °F/hr since #375. The **90 °F/hr (50 °C/hr)** used throughout PWR-N15 is this plant's programmed rate and sits inside the limit; that part was always true. |
| Shutdown-bank withdrawal is an operator evolution, not an initial condition | *"The shutdown banks are always in the fully withdrawn position during power operations and are moved into this position at a fixed speed in manual bank control prior to criticality"* — WTSM §8.1.1, NRC ADAMS **ML11223A252**. Verified on the Mode 5 → 4 leg (App 19-1 A.12) and required complete within 15 minutes of control-bank withdrawal (App 19-1 C.7), **ML11223A342**. Implemented as **PWR-N01 step 2a** 2026-08-12. |
