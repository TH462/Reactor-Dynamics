# 12 — Simulation Physics & Model Scope

**Document:** PWR-SP-12  
**Plant:** **SLX-100** (Single-Loop eXperimental, ≈ 100 MWe / ≈ 300 MWt)  
**Revision:** 4  

---

## 1.0 Purpose

This document states **what the simulator actually computes**, what it deliberately simplifies, and what it does not model at all. It is the honest-scope chapter of the manual set.

It exists because every other document in this set describes the plant as though it were real. That is the right way to learn to operate it — but an operator who trusts a trainer needs to know where the trainer stops being a plant. Three questions are answered here:

1. **What is modeled, and how?** (§3–§10)
2. **Where is the model simple, and does that simplicity change what I should do?** (§12)
3. **What is missing entirely, so that an indication I expect will never appear?** (§13)

**This chapter is descriptive, not procedural.** Nothing here is a required action. It is written for the operator who wants to know why the plant behaves as it does, and for the instructor who has to answer "would a real plant do that?"

> **NOTE — the golden rule of this document.** Where the model understates reality, this chapter says so plainly. Where the model is *right in mechanism but approximate in magnitude*, it says that too. Those are different claims and they are kept apart.

---

## 2.0 What kind of model this is

The SLX-100 is a **lumped-parameter, real-time behavioural model**. It is not a full-scope replica of a licensed reactor, and it is not a computational-fluid or nodal-thermal-hydraulic code.

| Property | This simulator |
|---|---|
| Spatial resolution | **None.** One core, one coolant loop, one steam generator, one turbine. Every quantity is a single lumped value. |
| Neutronics | **Point kinetics**, six delayed-neutron groups |
| Thermal-hydraulics | Coupled **lumped nodes** (fuel, cladding hot node, coolant, secondary) with tuned heat-transfer coefficients |
| Fluid properties | **Correlations**, not steam tables (see §5.1) |
| Integration | **Explicit Euler**, fixed step |
| Time step | **0.02 s of simulated time**, always |
| Determinism | **Fully deterministic**, including instrument noise (seeded PRNG) |
| Runs in | Vanilla JavaScript in the browser — no server, no downloads |

### 2.1 Fixed time step, and what time acceleration really does

The engine is stepped at **0.02 s and only 0.02 s**. Time acceleration does **not** hand the engine a bigger `dt` — it runs **more 0.02 s steps per wall-clock second**. Every plant behaviour is therefore identical at 1× and at 60×; only the wall-clock pacing changes.

This matters in two places an operator can feel:

- **Instrument lag is in simulated time.** A 4-second Tavg lag is 4 simulated seconds at any acceleration, so at 60× it passes in about 1/15 of a wall-clock second. Fast-forwarding does not make the board more truthful; it makes the lie go by faster.
- **You can outrun your own reactions, not the physics.** Acceleration does not destabilise the model. It removes your thinking time.

### 2.2 Explicit coupling — everything is one step behind

Systems are stepped **in a fixed order** (§3), and where two systems feed each other, the second one reads the **previous step's** value. One step is 0.02 s, so this is invisible in normal operation. It is the reason the model stays stable without iterative solving, and it is a real (if tiny) property of the plant you are operating.

The same principle is used deliberately in a much more visible way: **in-plant automatic regulators sense through their instruments, not through truth** (§10.4). The AFW level-hold valve, the CVCS charging servo and the steam-dump temperature program all read the *previous step's indication*. A failed level transmitter therefore fools the automatic controller exactly as it fools you.

### 2.3 Determinism

The same starting state plus the same commands always produces the same run — including the gauge jitter, which comes from a seeded pseudo-random generator whose state is part of every save. A rewind or a reload resumes the *same* run, not a similar one.

> **CAUTION.** Because instrument noise is one continuous stream shared by every gauge, the model is sensitive to *how many* random numbers are drawn per step, not just how large they are. This is a modelling constraint, not an operating one — but it is why gauge behaviour is reproducible to the digit.

---

## 3.0 The computation order

One 0.02 s step, **top to bottom in the order shown**. Understanding this order explains most "why did that happen before this?" questions.

The `#` column is the engine's own step number, which is not always sequential — inventory (9) is computed *before* pressurizer level (8) on purpose, so the level reflects this step's voiding rather than last step's.

| # | Step | Notes |
|---|---|---|
| 0 | Rod motion | Positions move *before* reactivity is read |
| 1 | Total reactivity | Rods + Doppler + moderator + boron + xenon + excess |
| 2 | Point kinetics | → new neutron power |
| 3 | Xenon / iodine | |
| 4 | Decay heat, then total core heat | `Q_total = P·(1 − f₀) + decay inventory` |
| 5 | Fuel temperature | |
| 6 | Coolant temperature, hot/cold legs, true subcooling | |
| 7 | Pressurizer pressure | heaters, spray, PORV, safeties, saturation |
| 7b | Loop pressure distribution | cold leg / hot leg / pump suction |
| 7c | RCP cavitation | from the suction-node margin |
| 9 | Primary inventory and voiding | CVCS, ECCS, accumulators, leaks, relief |
| 9b | RHR valve interlock, ECCS mode | |
| 8 | Pressurizer level | derived, not integrated (§7.3) |
| 8b | PORV tailpipe temperature | |
| 10 | Reactor coolant pump flow | spin-up / coastdown |
| 10b | Load mode | turbine load and coupled feed |
| 11 | Secondary: SG level, steam pressure and flow, feed and AFW | |
| 12 | Turbine and condenser | |
| 13 | Boron chemistry and mixing lag | |
| 14 | Exposed-cladding hot node, then damage/melt check | |
| 15 | **Instruments** | last — every gauge reads the state just computed |

Instruments are updated **last**, from the state the step just produced, and then lagged. Nothing in the plant reads an instrument value computed in the same step.

---

## 4.0 Neutronics

### 4.1 Point kinetics

Standard point-kinetics equations with **six delayed-neutron groups** (U-235 data, fixed):

| Parameter | Value |
|---|---|
| β (total delayed fraction) | **0.006502** |
| Λ (prompt generation time) | **0.01 s** |
| Delayed groups | 6, λ from 0.0124 to 3.01 s⁻¹ |

There is **no spatial flux shape**. The whole core is one point. This is the single largest simplification in the model, and its consequences are stated in §12.1.

### 4.2 The neutron source

A small constant source term is present at all times. It is what gives a subcritical core its **1/M behaviour**: at equilibrium, power sits at `source · Λ / (−ρ)`, so power and startup rate respond visibly to every rod step during the approach to criticality instead of the core sitting dark until it is too late.

This is a real feature of real startup instrumentation, and it is why the 1/M plot in this trainer works.

### 4.3 The reactivity balance

Net reactivity is the sum of six terms:

| Term | Coefficient | In operator units |
|---|---|---|
| Core excess | `rho_excess` = 0.087544 | +8754 pcm, held down by boron/rods/xenon |
| Control + shutdown rods | worth 0.04068 / 0.03676 | 4068 / 3676 pcm (all RCCAs **7744 pcm**) |
| **Doppler** (fuel temperature) | −2.5 × 10⁻⁵ K⁻¹ | ≈ **−1.39 pcm/°F** (−2.5 pcm/°C) of fuel |
| **Moderator** (density-shaped) | see §4.3.1 | **−1 pcm/°F cold → −3 pcm/°F hot** at operating boron |
| Boron (direct term) | 1.0 × 10⁻⁴ per ppm | ≈ **−10 pcm/ppm**, plus the density coupling below |
| Xenon | worth 0.025 | 2500 pcm at equilibrium |

The Doppler coefficient is **referenced to the settled full-power condition**, so it is exactly
zero there and acts purely as a stabilising perturbation on a transient. That is a modelling
convenience, not a claim that a real core has zero defect at power. The moderator term shares
the same reference.

**Every number in this table is either sourced to a real-plant document or solved from one, and
`test/run_reactivity.js` pins the sourced ones.** The rod worths are the measured values in
WTSM 2.2 *Reactivity Balance Calculations* (ML11216A051) Table 2.2-1 for a real Westinghouse
4-loop — all control banks 4068 pcm, all shutdown banks 3676 pcm, all RCCAs 7744 pcm.
`rho_excess` has no direct observable, so it is **solved** rather than tuned: it is whatever
makes hot-zero-power all-rods-out critical boron come out at **975 ppm**, the figure measured in
the BEAVRS / Watts Bar Unit 1 Cycle 1 hot-zero-power physics tests.

> **DECLARED DEPARTURE — boron at power reads low against a real plant.** This plant runs
> **618 ppm** at full power. A real Westinghouse 4-loop at 100 EFPD runs **750 ppm** (the
> worked exercise in WTSM 2.2, ML11216A051). The difference is not an error and it is not
> hidden: our figure is *derived*, not fitted. Walk it from the one measured anchor — hot
> zero power, all rods out, **975 ppm** — and the terms are Doppler −990 pcm, moderator
> −186, control bank to its 92 % operating position −76, and equilibrium xenon −2500, for
> −3752 pcm net, which is 357 ppm at 10.5 pcm/ppm. 975 − 357 = 618, against the engine's
> 618 — the 14 ppm residual is the moderator term being linearised over that boron change.
> `test/run_reactivity.js` gates this derivation.
>
> **Most of the gap is xenon.** Our equilibrium xenon worth is 2500 pcm, which is 250 ppm of
> boron on its own, and it is a `[tune]` value rather than a measurement. The rest is that
> the 975 ppm anchor is beginning-of-life with no xenon while the 750 ppm comparable is
> 100 effective full-power days in — different burnup, so not the same quantity. Pinning
> boron at power would need a *measured* hot-full-power anchor; the BEAVRS benchmark
> publishes its HFP critical boron only as a figure, so we do not have one. Tracked in #263.

### 4.3.1 The moderator coefficient is not a constant

Moderator reactivity tracks moderator **density**, not temperature:

> ρ_mod(T, B) = `mod_coeff` · (1 − B / 1400) · ( d(T) − d(T_ref) )

where *d* is relative water density (a cubic in °C fitted to IAPWS-IF97 at 2248 psi (15.5 MPa)).
The moderator temperature coefficient is the slope of that, so it **steepens on its own as the
plant heats** — because the density derivative does — and **weakens as boron rises**, because
boric acid expanding out of the core is a positive contribution that partly cancels the
moderator loss. Both behaviours are sourced to WTSM 2.1 *Reactor Physics Review* (ML11223A207)
§2.1.6.2 and Figure 2.1-8, which states that at 500 °F unborated water gives −17 pcm/°F, that
500 ppm gives −8 pcm/°F at the same temperature, and that above roughly **1400 ppm the
coefficient goes positive**. This plant peaks near 1100 ppm, so it never reaches that.

| Tavg | 0 ppm | 900 ppm |
|---|---|---|
| 122 °F (50 °C) | −10.3 pcm/°F | −0.9 pcm/°F |
| 350 °F (176.7 °C) | −19.3 pcm/°F | −1.7 pcm/°F |
| 566.6 °F (297 °C) | −38.5 pcm/°F | −3.4 pcm/°F |

**Two consequences fall out of the model rather than being tuned in.** Differential boron worth
is **larger cold** — 19.9 pcm/ppm at 122 °F against 10.5 pcm/ppm at power — because denser water
carries more boron atoms per unit volume. And **critical boron falls only gently** across a
heatup: 806 ppm cold to 588 ppm hot with the control bank inserted, 1011 ppm to 975 ppm all-rods
out. That is why boron is held roughly constant through a heatup and the dilution is done hot,
which is what a real startup does.

Before this was corrected, a single constant of −11.1 pcm/°F was applied from 122 °F to 579 °F.
It integrated to a **−4944 pcm** moderator defect over the heatup — 494 ppm of dilution to buy
back, a third of it charged below 274 °F — and it collapsed critical boron from 819 ppm cold to
263 ppm hot. The practical consequence, and how it was found: **600 ppm, a value that looks safe
next to the hot end, was critical at 274 °F**, and diluting toward it in a Mode 5 → Mode 1 run
took the reactor critical cold and tripped it on source-range high flux.

**Rod worth follows an S-curve** — least effective near fully in or fully out, most effective mid-core — with the peak deliberately flattened to about 90 % of the textbook curve. The reason is a teaching one: the single lumped bank carries the **full control worth that a real plant spreads over four banks**, so an unflattened curve made one step near the critical band worth far more than a real bank-D step.

**Boron reactivity lags the boron you inject.** Injected concentration changes immediately; the *core* concentration that drives reactivity follows through a **30-second mixing lag** (roughly one loop transit). Power therefore moves in step with the boron *indication*, not ahead of it.

> **NOTE.** Reactivity in pcm, startup rate in DPM, and reactor period in seconds are all available as **indications** — a reactivity computer and rate meters. None of them feeds a protection trip. Real PWRs have no direct reactivity gauge; these are engineering tools, and the model says so.

### 4.4 Startup rate and period are derived, not measured

`SUR (dpm) = 26.06 · (Ṗ/P)` and `period (s) = P/Ṗ`, both computed from the **smoothed** power rate. They are well defined only above a very small power floor. The plant carries a *separate* startup-rate **instrument** — a lagged, noisy twin of that proxy — and it is that instrument, not the proxy, which feeds the rod-withdrawal interlock.

### 4.5 Decay heat

A **two-term exponential** model with a production term, so decay heat **builds while the reactor runs** and persists after a scram:

| Component | Fraction at scram | Decay constant | Time constant |
|---|---|---|---|
| Fast | 0.05 | 5 × 10⁻⁴ s⁻¹ | ≈ 33 min |
| Slow | 0.02 | 2 × 10⁻⁵ s⁻¹ | ≈ 14 h |

A core that has been at power carries **≈ 7 %** decay heat at scram. A core that has just been started carries almost none — which is why a fresh startup and a post-trip plant behave completely differently with the same rod position.

Total core heat is **prompt fission power plus the tracked decay inventory**, always. At any steady state that is exactly the neutron power. Through a fast runback it is not: the decay inventory lags on its ~33-minute tail, so several percent of thermal output persists after the flux has gone.

### 4.6 Xenon and iodine

A standard iodine → xenon chain with burnout, normalised to equilibrium xenon at full power. Total xenon inventory is modelled; **spatial xenon oscillation is not** (§13).

### 4.7 Control rods

| Property | Value |
|---|---|
| Groups | **One control group, one shutdown group** |
| Travel | **912 steps** (equivalent to 4 × 228 — a real bank's total travel) |
| Speeds | slow ≈ 32 steps/min · normal ≈ 192 · fast ≈ 288 |
| Overrun on release | ~1 s of continued travel, then the latch catches |
| Scram insertion | control 2.5 s · shutdown 2.0 s, constant-rate (gravity) |
| Insertion limit | **power-dependent**: none below 5 % power, ramping to 70 % withdrawn at 100 % |

The fine 912-step drive exists so that one step near the critical band is worth about 9 pcm (≈ 1.4 ¢) — real bank-D differential worth — rather than the ~36 pcm lurch a coarse drive gave.

The **rod insertion limit is a curve, not a floor**, because the limit exists to protect shutdown margin *at power*. During a startup the bank is deliberately deep and boron holds the margin, so a fixed floor would annunciate continuously through every ascent and mean nothing.

---

## 5.0 Core and coolant thermal model

### 5.1 Fluid properties are correlations

Saturation temperature is a single power-law fit:

```
T_sat(°C) = 179.47 · P(MPa)^0.239
```

It matches steam tables to **±3.6 °F (±2 °C) over 725 – 2466 psi (5 – 17 MPa)** — the range the RCS and the steam generator actually live in. Outside that range it is wrong, and the model knows it: **the condenser uses a completely separate low-temperature correlation** (an Antoine form), because at a few kPa the power-law fit is off by nearly an order of magnitude.

There are **no enthalpy tables, no density tables, and no two-phase property model**. Every "flashing", "condensing" or "voiding" behaviour in this plant is an effective coefficient calibrated to produce the right direction and the right rough magnitude.

### 5.2 Nodes

| Node | What it represents |
|---|---|
| **Fuel** | Bulk (whole-core-average) fuel temperature; ≈ 700.2 °F (389 °C) above coolant at rated |
| **Exposed cladding** | Peak cladding temperature of the *uppermost, uncovered* fuel — see §5.5 |
| **Coolant** | One average coolant temperature (Tavg), with hot/cold legs derived from it |
| **Secondary** | SG saturation temperature from secondary pressure |

Hot and cold legs are **derived**, not independent: `ΔT = 59.4 °F (33 °C) at rated`, scaled by power/flow, split symmetrically about Tavg. The split is **capped so the hot leg can never exceed saturation** — subcooled liquid cannot superheat. Any enthalpy rise beyond that cap is carried as core boiling instead of more temperature.

### 5.3 Heat transfer, and the four ways it degrades

Fuel-to-coolant heat transfer is a single coefficient that **collapses** under three conditions, and coolant-to-SG heat transfer under a fourth:

| Degradation | Trigger | Effect |
|---|---|---|
| **DNB** | Hot-leg (core exit) subcooling falls to 14.4 °F (8 °C) | Fuel→coolant coefficient drops by more than 10× |
| **Core uncovery** | Inventory below 50 % | Coefficient falls toward zero, proportionally |
| **Partial uncovery** | Inventory between 70 % and 50 % | The exposed-cladding node heats (§5.5) |
| **SG tube-bundle dryout** | Wide-range SG level below 30 % | Coolant→SG heat transfer falls to a small steam-side residual |

**DNB is judged at the core exit, not at Tavg.** That is what makes it reachable at power during a steam-line break or a loss of flow, where the bulk average never approaches saturation.

**The dry steam generator is the TMI mechanism, and it depletes.** A freshly dried bundle keeps a small residual conductance (film moisture, steam-side convection). If it stays dry **and unfed**, that residual itself decays away over about 5 minutes — a sustained total loss of feed genuinely loses the heat sink. Any feedwater at all, main or auxiliary, rewets the bundle in about 45 seconds. This is why a *recoverable* loss of main feed with AFW running transits a dry SG without consequence, while the same dip with AFW blocked repressurises the primary to the PORV.

### 5.4 What heats and cools the coolant node

| Term | Direction |
|---|---|
| Fuel → coolant | in |
| **RCP shaft work** (≈ 0.55 % of rated at full flow) | in |
| Coolant → steam generator | out |
| **RHR** heat exchanger, when aligned | out |
| **Cold ECCS injection quench** (RWST/accumulator water at 104 °F (40 °C)) | out |
| **Break blowdown flash cooling** | out |

Two of these deserve comment.

**RCP heat is real and it matters at no load.** With the heat sink isolated, the pumps alone heat the plant. Their loss slightly speeds a post-trip cooldown. It is also *netted out of the steam side* — the behavioural turbine draws steam for core power only.

**Break blowdown flash cooling is what makes break size matter.** Coolant leaving a break carries enthalpy away and the remaining inventory flashes to replace it. On a **small** break, decay heat dominates this term, Tavg holds a hot plateau, and saturation pressure pins the RCS well above the accumulator setpoint — which is exactly why TMI-2's operators had to *deliberately* depressurise to reach core-flood-tank pressure. On a **large** break, this term dominates, Tavg falls toward containment saturation, and pressure follows it down through the ECCS band.

> **NOTE.** This term keys on **break flow only**. A stuck-open PORV vents the steam space and produces no break flow, so the flagship TMI path is untouched by it.

### 5.5 The exposed-cladding hot node

The bulk fuel node averages the **whole** core. A core held *partially* uncovered — inventory between 70 % and 50 % — therefore read as fully cooled and could sit there indefinitely, while at TMI-2 exactly that condition failed the cladding and melted part of the core in under an hour.

A separate node models the **peak cladding temperature of the exposed upper region**: steam-cooled only, heating at the local decay-heat rate scaled by the uncovered fraction, cooled weakly toward saturation. When the core re-covers it quenches back on a ~2-minute reflood timescale.

Damage is judged at the **peak** of the two nodes, because damage is local before it is average:

| Endpoint | Threshold |
|---|---|
| Cladding failure (`fuel_damaged`) | **2192 °F (1200 °C)** |
| Fuel melt (`melted`) | **5072 °F (2800 °C)** |

The simulation **ends at fuel damage**. There is no containment, no source term, no release (§13).

---

## 6.0 Primary system

### 6.1 One pressure state, three pressures

The RCS is incompressible liquid everywhere except the pressurizer bubble, so there is exactly **one dynamic pressure state** — the pressurizer/hot-leg reference — plus a **quasi-static** pressure field that is pure algebra over that state and pump flow:

| Node | Offset at rated flow | Who reads it |
|---|---|---|
| Hot leg | reference (0) | Pressurizer surge line, RHR suction |
| Cold leg | **+44 psi (0.30 MPa)** | ECCS, accumulators, letdown |
| Pump suction | **−36 psi (0.25 MPa)** | RCP cavitation |

Both offsets scale with flow² and **collapse to zero when the pumps coast down**. Implied pump head at rated is about 80 psi (0.55 MPa) (~80 psi).

There is only **one pressure gauge**, and it reads the reference. The node pressures are true state, not indications.

### 6.2 Reactor coolant pumps

One pump. Spin-up time constant 3 s, coastdown 8 s.

> **WARNING — no natural circulation.** `natural_circ_flow = 0`. When the pump stops, flow decays to **zero**, not to the 2–5 % a real PWR would establish. Loss-of-flow events in this trainer are therefore **more severe than reality**, not less. See §12.4.

**Cavitation is modelled and it bites.** The pump suction is the lowest-pressure node and sees cold-leg-temperature water, so it saturates first as the loop voids. Below 14.4 °F (8 °C) of suction subcooling the running pump begins to cavitate, reaching full severity 14.4 °F (8 °C) further down, and **loses up to 70 % of its delivered flow** — a mechanical effect, not just an indication. This is the TMI-2 "the pumps were objecting" phenomenon. A stopped pump does not cavitate.

### 6.3 Inventory

Inventory is a **fraction** (1.0 = full), clipped to a 1.2 ceiling, exposed as `core_inventory_pct`.

Flows enter the mass balance on **two different scales**, deliberately:

| Scale | Flows | Why |
|---|---|---|
| **Accident scale**, 1:1 | Leaks, PORV/safety relief, HPI/LPI, accumulators | Tuned for accident pacing |
| **CVCS scale**, × 0.012 | Charging, letdown | Tens of gpm against a whole RCS |

Without that split, a 30 gpm letdown bleed would read as ~3 % of total inventory per second and drain the pressurizer in seconds. With it, an uncompensated orifice-A drain walks pressurizer level down about **2 % per minute** — minutes to notice and respond, which is the intended feel.

Because the two scales are independent, **no single RCS volume reconciles them** — the gpm figures below are pacing flavour attached to the CVCS scale, and comparing them with real-plant flows or Tech Spec leakage limits is a category error, not a fidelity gap to close.

**Letdown is pressure-driven, not commanded.** Two fixed orifices, each independently in or out; each passes flow proportional to √(cold-leg pressure − 348 psi (2.4 MPa) backpressure). So letdown **tails off toward zero as the RCS depressurises on a cooldown** — it is not a constant you dial in.

**Charging in AUTO holds programmed pressurizer level**, reading the *indicated* level and the *indicated* Tavg through a 20-second damping filter. The level program and the physical thermal-expansion line are the **same line**, by construction — so a heat-up raises level and setpoint together, and thermal expansion can never read as a leak. A leak makes itself up because it lowers the level; no leak detection is involved.

### 6.4 Emergency injection

**One merged HPI/LPI system on a dedicated ECCS pump train** (RWST-sourced — *not* the CVCS charging pump doing double duty). One command, one flag, a **two-segment pump curve**:

| Segment | Shutoff head | Character |
|---|---|---|
| High head | **2384 psi (16.44 MPa)** | Low flow; the only segment in play at TMI pressures |
| Low head | **653 psi (4.5 MPa)** | High flow; dominates in a large LOCA |

**Accumulators** are passive, borated, and **finite**. They arm at **600 psi (4.14 MPa)** (600 psi — the real core-flood-tank / SIT cover-gas setpoint) through a check valve in series with a motor-operated isolation valve, and they deplete as they inject. Their nitrogen cover-gas pressure is computed and indicated as the tank empties — but it is **indication only**: injection is gated on cold-leg pressure against the fixed arming setpoint.

**All emergency injection water is borated to 2500 ppm** and mixes into the core concentration, so ECCS injection adds negative reactivity — the shutdown-margin role of borated safety injection. It also enters at **104 °F (40 °C)**, removing sensible heat as it mixes (§5.4).

**RHR** takes suction from the **hot leg** through a valve interlocked to 400 psi (2.76 MPa) (400 psi): it can only be opened below that pressure and **auto-closes** if pressure climbs back above it. It recirculates — hot leg → heat exchanger → cold leg — so it changes no inventory. Cooldown rate is throttled by the heat-exchanger flow split, and its sink temperature **moves with circulating-water temperature**, so warm circ water raises the floor a cooldown can reach.

### 6.5 Two kinds of void, kept apart

| Void | Cause | Where it bites |
|---|---|---|
| **Inventory-driven** (`primary_void_fraction`) | Bulk reaches saturation as inventory is lost — post-scram, low power | The pressurizer saturation pull and the **TMI level deception** |
| **Flux-driven** (`core_void_fraction`) | Core exit passes saturation at full inventory — steam-line break, loss of flow at power | The **DNB heat-transfer collapse** |

These are separate states with separate calibrations on purpose. Combining them would let the flux term corrupt the TMI pressurizer deception.

---

## 7.0 Pressurizer

### 7.1 Pressure

Pressure is an integrator driven by a signed sum of effects — heaters up; spray, PORV flow, safety flow and break depressurisation down; thermal expansion of the loop as a surge term. Gains are in MPa/s and are **effective coefficients, not thermodynamics** (§12.5).

Two behaviours are worth understanding at the board:

**Spray cannot pull below core-exit saturation.** Its authority tapers to zero across a 435 psi (3 MPa) band above the saturation pressure of the *hot leg*. Below that the core exit flashes and boiling — not pressure control — takes over. This is self-limiting: on a real cooldown the hot leg falls too, so the floor tracks down and spray keeps working.

**Spray is capacity-limited to 12 % of full flow.** It is sized for step insurges, not for a loss-of-heat-sink repressurisation. A TMI-style heat-up **outruns the spray and lifts the PORV** — as it must.

**A raised pressure setpoint slews; a lowered one takes effect at once.** Heating a large subcooled pressurizer to a higher saturation point takes time regardless of heater margin, so the effective target walks up at 3 psi (0.02 MPa)/s (a full cold-to-NOP pressurization ≈ 11 simulated minutes). Depressurisation is spray- and cooling-limited on its own and needs no slew.

### 7.2 Saturation pinning

When the primary voids, **or** whenever the saturation pressure of Tavg exceeds actual pressure, the model switches regimes: pressure is **pulled to Psat(Tavg)** rather than allowed to fall below it. A liquid cannot superheat, and a model that let pressure crash below saturation would report impossible negative subcooling.

The consequence for the operator is the important part: **in the saturated regime you depressurise by cooling, not by spraying.**

### 7.3 Level is derived, not integrated

Pressurizer level is a **pure function of state**:

```
level = base(Tavg)  +  mass term  +  void term
```

There is **no level integrator**, so level and inventory cannot silently drift apart.

| Term | Behaviour |
|---|---|
| `base(Tavg)` | Thermal expansion — 1.39 % level per °F (2.5 % per °C), anchored at 55 % for full-power Tavg, floored at 28 % |
| Mass **deficit** | −100 % per inventory fraction — a deficit draws down the whole loop (shallow) |
| Mass **surplus** | −300 % per inventory fraction — surplus packs into the steam space, the only compressible volume: the "going solid" regime |
| **Void** | **+150 % per void fraction** — and it is saturation-gated |

That last row is **the TMI deception, and it is arithmetic**. Void fraction itself grows at three times the inventory deficit, so in a voided state the void term contributes about **+450 % per inventory fraction lost** against the mass term's **−100 %** — a net **rise** of roughly +350. **Indicated level rises while inventory falls** — and nowhere outside the saturated regime does it do that. The gauge is not lying. It is telling the truth about a quantity that has stopped meaning what you think it means.

### 7.4 Relief valves and the tailpipe

| Valve | Opens | Closes / reseats |
|---|---|---|
| **PORV** | 2350 psi (16.20 MPa) (2350 psia) | 2300 psi (15.86 MPa) (2300 psia) |
| **Spring safeties** | 2485 psi (17.13 MPa) (2485 psia) | 2400 psi (16.55 MPa) (2400 psia) |

The **block valve** is upstream of the PORV. Closing it stops **all** flow through the PORV line — relief and inventory loss alike — regardless of PORV position. That is the TMI recovery action.

**The tailpipe tells the truth when the indicator does not.** The discharge line downstream of the PORV and safeties reads a **warm 179.6 °F (82 °C) baseline** — the seat has always leaked a little, which is historically true at TMI-2 and precisely why the crew discounted a hot tailpipe — and heats toward 302 °F (150 °C) within ~30 s whenever relief flow passes. It cools slowly, over ~15 minutes, after isolation: a hot pipe stays hot.

---

## 8.0 Secondary side

### 8.1 Steam generator level — two ranges, one physical column

The **wide range** is the integrated inventory over the whole vessel, clamped only at the physical bounds. The **narrow (working) range is derived from it** as the 30–75 % window of the wide range, remapped to 0–100 %.

The operational consequence: **when the narrow gauge pegs on an overfill or a dryout, the wide range keeps reading.** Narrow-range level is the working instrument; wide range is the one that still means something when things have gone wrong.

### 8.2 Steam pressure

Secondary pressure integrates the difference between steam generation and total steam out, and is then **capped at the saturation pressure of Tavg**. The secondary is heated *by* the primary and can never sit hotter than the coolant heating it. Without that cap, a marginal-ΔT bottling artefact let the integrating SG out-heat the primary during every cold pressurisation.

Reverse heat transfer — a secondary hotter than the primary, e.g. starting pumps on a cold plant against an atmospheric-saturation secondary — is deliberately **poor** (5 % of forward conductance). The boiling regime that gives the SG its rated conductance only exists in one direction; backwards it is condensate-film convection.

### 8.3 Steam dump — two modes and a declared cliff

| Mode | Behaviour |
|---|---|
| **Pressure mode** (always) | Opens proportionally above the 1194 psi (8.23 MPa) no-load setpoint |
| **Fast Tavg-error mode** (**armed**) | On a turbine trip, or a load rejection past the arm, drives open on Tavg error immediately |

Capacity is **40 % of rated steam flow** — the prototypical Westinghouse value, sized for a **50 % loss of load**: 40 % into the condenser plus roughly a 10 % reduction from the reactor itself. Measured on this plant, a 100 → 50 MWe rejection saturates the dump at 40 % and settles the core at 89.3 %, with no trip and nothing lifting.

Past that the dump is at its stop and the reactor has to shed the difference. A **full** load rejection from 100 % still does not scram, but the ladder runs: dump saturated, core running back to ~46 % on moderator feedback, average coolant temperature peaking near **608 °F (320 °C)**, the **PORV lifting** at 2350 psi (16.20 MPa) as the designed backstop, and the steam generator safeties just reaching their setpoint. A real plant of this class does not ride out a full rejection either — its design case is 50 % — so this is the plant telling you the truth about where its margins end.

Capacity is also exactly what **cannot** save a loss-of-feed event, where the drying steam generator stops absorbing heat no matter what the dump vents.

The fast mode's reference Tavg is **programmed on turbine load** — the same sliding program the rod controller uses — so the two cannot drift apart.

> **WARNING — a declared, deliberate cliff.** The fast mode arms on a **rate**: a step load rejection must exceed **40 MWe**, or a ramp must exceed roughly 40 MWe/min. Measured: a **39 MWe rejection does not arm** and lifts the PORV (Tavg 606 °F (318.9 °C)); **41 MWe arms and is caught** (Tavg 580.1 °F (304.5 °C)). It is also **blind to staircases** — 60 MWe delivered as four 15 MWe steps never arms at all.
>
> This is a ruled, intentional limitation, not a defect. Lowering the arm is not the fix: an arm low enough to catch an ordinary 15 MWe dispatch cut would leave the dump venting forever, holding the reactor at 100 % and destroying the load-follow behaviour. The sub-threshold rejection is a manoeuvre **you** are expected to handle, and the PORV is the honest backstop when you don't.

### 8.4 Feedwater, AFW, and the isolation chain

Main feedwater requires the **condensate pump**, an available **condenser**, and an **open MSIV** — the feed pumps are steam-driven off the main line downstream of the MSIV, and the condensate pump draws from the hotwell. Any of the three closes the chain: heat-sink loss → main feed loss → SG inventory falls → low-low level trip. **The ride-out plant trips on a genuine limit, never on anticipation.**

**AFW** is 15 % of rated feed capacity, auto-starting on 20 % narrow-range level. It **latches**: the pump demand has no reset and stands until the operator secures it, as in a real plant. Delivery is capacity × operator throttle × a built-in proportional level hold (full flow below 32 %, tapering to zero by 40 %), and the hold senses **the level instrument** — so a failed level sensor fools the AFW regulator exactly as it fools you.

**AFW pumps can run against a shut discharge valve.** When they do, discharge pressure sits at **shutoff head** rather than at SG-plus-margin. That distinction is the tell separating "AFW blocked" from "AFW not started" — and it is the TMI-2 pumps-running/valves-shut condition.

### 8.5 The MSIV and SG safeties

**SG code safeties are upstream of the MSIV** (pop 1350 psi (9.31 MPa), reseat 9.0), above the 1194 psi (8.23 MPa) dump setpoint. They are the relief that remains when the generator is bottled.

A **main steam line break is gated by break location.** A break *downstream* of the MSIV is isolable — shutting the valve stops the blowdown dead, and that is the operator's one real lever. A break *upstream*, between the SG and the valve, is on the wrong side of every isolation this single-loop plant owns and blows the generator down regardless.

### 8.6 The turbine governor

The governor valve target is **pressure-compensated**: demand divided by the upstream pressure ratio, clamped fully open. At steady state the delivered steam therefore equals the demand at any secondary pressure — the valve strokes open as pressure falls and closes down as it rises, like a real governor holding load.

---

## 9.0 Turbine, condenser and generator

These are **behavioural, not thermodynamic**. There are no stage efficiencies, no feedwater heater train, no hotwell level.

Electrical output is a product of factors:

```
MWe = (core power) × 100 MWe × (rpm / 1800) × (vacuum / rated vacuum)
```

A disconnected or tripped generator produces zero regardless of shaft speed.

**Condenser vacuum is genuinely modelled against circulating-water temperature.** The condenser pulls exhaust down to saturation at the condensing temperature, which sits a terminal difference above the circ-water outlet — and the temperature rise across the tubes grows with load, so the derate bites hardest at full power. Warm circ water means less vacuum, less output at the same steam flow, and a shorter walk to the vacuum trip. Cold circ water buys vacuum **above** nameplate: the winter uprate is real here, capped at a practical condenser floor.

**The rotor coasts down on windage and bearing friction** toward rest when tripped or unloaded. Synchronised to the grid, it holds rated speed at any load, because a synchronous machine does.

---

## 10.0 Instruments — the layer between truth and you

This is the part of the model the whole trainer is built around. **Trips, alarms, automatic actuations, scenario triggers and every gauge read instruments — never true state.**

### 10.1 What an instrument does to a value

In order: **first-order lag → noise → range clipping → active failure**.

| Property | Notes |
|---|---|
| **Lag** | Per instrument, in simulated seconds (Tavg 4 s; primary pressure 0.5 s; power range 0.1 s) |
| **Noise** | Per instrument sigma, sized so visible jitter is roughly 0.3–0.6 of the readout's display step |
| **Range** | Hard clip. A gauge pegged at its limit **cannot cross it** — which is why trip setpoints must sit inside the range |
| **Failure** | `stuck` · `drift` · `noisy` · `dead` |

Noise is **not** simple white noise. It is a correlated random walk with a configurable correlation time, so readings *wander* rather than jumping the full width of their band between samples — and it **tapers with signal**, so a secured pump's flow indication sits at a still zero instead of hunting around it.

> **NOTE — where damping lives.** Measurement noise (the sensor wobbles, the process is steady) stays uncorrelated in the plant model, and the calm look of the board comes from the **indicator's own damping**, which is a display property. Process noise — where the thing genuinely is moving, as narrow-range SG level genuinely does — is correlated in the plant, because a controller really does see it. Damping *that* at the indicator would be lying about the plant.

### 10.2 Derived indications inherit their inputs' faults

**Subcooling margin is computed from the instrument pressure and the instrument temperature** — never from truth. It therefore inherits their lag and any failure. This is deliberate and it is the whole TMI lesson: subcooling margin is the most trustworthy single number on the board *and* it is still an instrument.

### 10.3 The PORV indicator reports the command, not the valve

The indicator shows **commanded** state. A stuck-open PORV with a "closed" indication is not a bug and not an instrument failure — it is the plant as built, and it is the flagship deception.

### 10.4 Automatic controls sense through instruments too

The AFW level-hold valve, the CVCS charging servo and its level program, and the steam-dump Tavg program all read **indications**, one step old. A failed transmitter mis-programs the automatics exactly as it misleads the operator.

### 10.5 Shrink and swell

SG narrow-range level indication moves **the wrong way** on a fast power change before the lag lets it settle. This lives in the *indication*, not in the physical level.

### 10.6 Log-scale nuclear instruments

Source range (counts/s) and intermediate range (chamber amps) carry their lag and noise **in the log domain**, so a decade of lag is a decade at any level and noise sigma is in decades. Source range reads zero when its high voltage is de-energised.

### 10.7 RCS loop flow — and why the trip that reads it changed

Until 2026-07-29 the **low-flow reactor trip read true flow**, because no flow instrument had ever been built. It was the last exception in the plant, and it meant the single most safety-significant trip could not lag, could not drift, and could not be fooled — so it could not be *taught*. It now reads `rcs_flow`, an ordinary instrument with lag and injectable failures, and **there is no exception left**: every trip and actuation on this plant reads an indication.

**RCS Loop Flow** is modelled on the real measurement: **elbow taps** on the crossover-leg 90° elbow, reading the differential pressure between the inner and outer radius of the bend, with ΔP ∝ flow². Nothing is inserted into the flow path. Real accuracy figures for this channel are ±10 % absolute, with trip-point repeatability around ±1 %.

The **setpoint is the real one — 90 % of rated, blocked below P-7 (10 % power)**. Adopted 2026-07-29, replacing an unsourced 25 % / 5 % pair. Measured on an RCP trip from full power: the indication crosses 90 % at **1.8 s** and DNB onset is at **10.9 s**, so the trip now fires about nine seconds *before* the hot channel can boil. The old 25 % setpoint fired at 16.2 s — about five seconds *after* it. Its entire practical effect was to let DNB happen.

**One departure remains, and it is deliberate: this plant has ONE flow channel**, where a real Westinghouse unit has **three detectors per loop and trips on 2-of-3**. That follows from the plant being single-loop and from every other protection function here being single-channel too — but be clear about what it costs, because it is the thing this event is now built to teach:

> A **stuck-high flow transmitter defeats the low-flow trip completely.** Measured, with the channel stuck at 100 % and the pump tripped: DNB onset at 9 s, core void peaking at 0.60, fuel reaching ~1706 °F (930 °C) against a damage threshold of 2192 °F (1200 °C), and the reactor finally scrammed at **~35 s on HIGH PRIMARY PRESSURE** — a different channel, a different instrument, catching a *consequence*. RCS Flow - Low never actuates at all. 2-of-3 coincidence exists precisely to stop one lying transmitter from doing this.

The surviving indication in that event is **subcooling margin**, which falls to 11.2 °F (6.2 °C) — below its 19.8 °F (11 °C) caution — while the flow gauge still reads 100 %. That is the cross-check the scenario asks for; see `04` PWR-N13 and `06` PWR-E02.

---

## 11.0 What the engine does *not* decide

The physics engine models **hydraulics and thermodynamics**. It makes **no control decisions**. This boundary is deliberate and it has an operating consequence.

| Lives in the **engine** | Lives in the **control layer** |
|---|---|
| Valve flow while open | *When* a valve opens — including **relief-valve and code-safety logic** |
| Turbine rotor dynamics | The turbine **trip** decision (low vacuum, overspeed) |
| Pump flow and coastdown | Trip setpoints, ESF actuation, permissives, interlocks |
| Heat transfer, inventory | Alarm setpoints and classification |

**Even mechanical relief logic lives in the control layer**, reading the pressure *instrument* against the pop and reseat setpoints. That is a design ruling, not an oversight: it means relief behaviour can be manipulated and failed like everything else on the plant.

All protection setpoints, permissives and alarm bands are **data**, listed in `09_SETPOINTS_LIMITS.md`. They are not repeated here.

---

## 12.0 Deliberate simplifications

Each of these is intentional, acceptable for the educational purpose, and stated so you can judge when it matters.

| # | Simplification | What it misses | Does it change what you should do? |
|---|---|---|---|
| 12.1 | **Point kinetics — no spatial flux** | Local power peaking, axial tilts, flux redistribution on rod motion | **No** for this plant. The mechanisms are faithful; only spatial *magnitude* effects are absent. |
| 12.2 | **One lumped loop, one SG, one RCP** | Loop-to-loop asymmetry, individual SG isolation, single-loop transients | **No** — the plant genuinely *is* single-loop by design. This is the SLX-100's identity, not a compromise. |
| 12.3 | **Two-term decay heat** | Full ANS 5.1 accuracy; the two-term form is ~20 % accurate over hours to days | **No.** Decay heat exists, demands cooling for hours, and drives every long transient. |
| 12.4 | **No natural circulation** | Real PWRs establish 2–5 % flow on pump loss, removing decay heat | **Yes, in one direction: loss-of-flow is more severe here than reality.** Never take this trainer's pump-loss behaviour as a bound on a real plant's. |
| 12.5 | **Pressurizer uses effective coefficients, not two-phase thermodynamics** | Flash evaporation, condensation, subcooled surge into a steam space | **No.** Directions and magnitudes are right, and the TMI-critical level rise during voiding is fully captured. |
| 12.6 | **No sensor redundancy or voting** | Real plants use ~3 channels with 2-of-3 voting; one failed sensor cannot trip or block a trip alone | **Yes — instrument failures are *more* impactful here.** That is arguably better teaching, but it is not prototypical. |
| 12.7 | **Xenon has no spatial oscillation** | Xenon power tilts swinging around a large core over hours | **No** at this plant size. Total inventory suppression is modelled. |
| 12.8 | **Turbine and condenser are behavioural** | Stage efficiencies, feedwater heaters, hotwell level | **No.** Trip and vacuum-loss behaviour is right; the thermodynamic detail is not part of any lesson. |
| 12.9 | **Steam-dump load-rejection arm is a bistable — there is a cliff** | A rejection just under 40 MWe gets no fast dump; staircased rejections never arm | **Yes — see the warning in §8.3.** Ruled and declared, not a defect. |
| 12.10 | **Boron chemistry is an idealised rate** | Blender dynamics, VCT mixing, real makeup-flow chemistry | **No**, but note the compressed time scale: borating/diluting runs at 2 ppm/s, and a grab sample returns in 60 s against a real lab's 30–60 min. |
| 12.11 | **One control group and one shutdown group** | Multi-bank sequencing, programmed overlap, bank overlap indication, core maps | **Not for operating**, but the single bank carries the *whole* control worth, which is why its worth curve is deliberately flattened (§4.3). |
| 12.12 | **Pressurizer level is geometric, not a calibrated span** | Reference-leg behaviour and a true narrow/wide calibration | **No.** Note this does **not** apply to SG level, which *does* have a real narrow/wide window (§8.1). |
| 12.13 | **Cold-plant mass bookkeeping is normalised** | The real cold-plant mass surplus | Level in the cold modes rests on a program floor standing in for CVCS keeping the pressurizer on span. Visible only in Mode 5. |

---

## 13.0 What is not modelled at all

If you expect one of these and cannot find it, it is not hidden — it does not exist.

**Containment and consequences**
- No containment building, pressure, temperature or sump
- No hydrogen generation, no combustion
- No fission-product release, no source term, no dose, no radiation monitors
- **The simulation ends at fuel damage.** Consequences beyond it are described in training commentary, never simulated

**Reactor physics**
- No spatial or nodal kinetics — no axial or radial power shape
- No fuel burnup, no cycle depletion, no reactivity drift over a cycle
- No spatial xenon oscillation
- No fission-product poisoning beyond xenon (no samarium)

**Thermal-hydraulics**
- No natural circulation (§12.4)
- No steam-table property model — correlations only (§5.1)
- No boron plate-out, boron dilution accidents, or boil-off boron concentration (steam carries no boron in reality; the loss term here is lumped)
- No pressurizer relief tank or rupture disk — the stuck PORV and the lying indicator are the lesson; the tank filling and rupturing is not modelled

**Balance of plant**
- No feedwater heater train, no extraction stages, no hotwell level
- No secondary chemistry, no condenser tube leaks
- No grid model — the grid is an infinite bus that accepts what you generate
- No electrical distribution model beyond station-blackout as a state

**Instrumentation and control**
- No channel redundancy or 2-of-3 voting (§12.6)
- No rod bank sequencing, overlap unit, or core map display

**Everything else**
- No multi-user operation, no accounts, no cloud state
- No auto-detection of a developing transient to drop time acceleration — you set the speed and you reduce it

---

## 14.0 How much to trust a number

| Class | Trust | Examples |
|---|---|---|
| **Structural** — fixed physical constants and real-plant setpoints | High | β and Λ, six-group delayed data, fuel damage/melt thresholds, PORV and safety setpoints, the 600 psi (4.14 MPa) accumulator arming pressure, the 400 psi (2.76 MPa) RHR interlock |
| **Calibrated** — arbitrated by the physics acceptance suites | Directionally right, magnitude roughly right | Heat-transfer coefficients, decay-heat constants, level coefficients, dump and AFW capacities |
| **Compressed** — deliberately faster than reality for training | Right in behaviour, wrong in duration | Boron adjust rate, grab-sample turnaround, cold-plant pressurisation slew, mode-transition pacing, **ECCS injection pacing** and **cooldown depressurisation rate** — see §14.1 |
| **Indicative** — display flavour derived from normalised internals | Illustrative | The gpm conversions (24 000 gpm RCS flow, 60 gpm charging, 30 gpm letdown, 100 gpm AFW) |

> **NOTE.** The plant's absolute ratings — ≈ 300 MWt, ≈ 100 MWe, one loop, one SG, one RCP — are a **design choice**, not a measurement of any real unit. The SLX-100 is its own plant.

### 14.1 Two Compressed rates worth knowing by name

Both were previously undeclared, which made them read as fidelity rather than as choices.

**ECCS injection pacing is 22–440× real.** Emergency injection refills the reactor coolant system far faster than any real high-pressure charging or safety-injection train could. The rate is a single normalised inventory gain, not a pump curve against system head, so it does not slow as the system refills the way a real train does. **What this means for you:** the *sequence* is right — injection starts on its actuation setpoint, it borates the coolant, it recovers level and subcooling — but **any time-to-recover number from an injection transient is not a plant number.** Do not read "level recovered in two minutes" as anything but "level recovered". The behaviour to learn from is the TMI one: what injection does to indicated pressurizer level, and why that indication can mislead you into throttling it.

**Cooldown depressurisation is compressed too, and it narrows one cue.** A real plant takes a good part of an hour to walk from 1000 psi (6.895 MPa) to the accumulators' 600 psi (4.14 MPa) cover gas. Driven briskly here, that band is crossed in about **1 minute of plant time** — measured full-stack. That is the entire window between the **SI ACCUM ALIGNED** annunciator (**06 PWR-A32**) coming in and the first accumulator discharge. At 30× time acceleration it is a couple of seconds of wall clock. **What this means for you:** isolate the accumulators on schedule at 1000 psi as the procedure says (**PWR-N15** step 3, **05** Phase C step C3) rather than waiting for the annunciator to prompt you, and slow the acceleration through that band. The cue is a backstop, not a timer you can run against.

---

## 15.0 Verifying a claim in this document

Everything here is derived from the as-built engine, not from prose. If you want to check a number:

| Question | Where the answer lives |
|---|---|
| A physics coefficient, capacity or time constant | `engines/pwr/pwr_config.js` — values marked `[tune]` are calibrated; unmarked values are fixed |
| A protection setpoint, permissive, interlock or alarm band | `layers/control/pwr_control.js`, and `09_SETPOINTS_LIMITS.md` for the operator-facing table |
| How a mechanism is actually computed | `engines/pwr/pwr_thermal.js`, `pwr_pressurizer.js`, `pwr_primary.js`, `pwr_steam_generator.js`, `pwr_instruments.js` |
| The step order and the reactivity balance | `engines/pwr/pwr_engine.js` |
| What the plant is *required* to do | `Blueprint/PWR_BEHAVIOR_CATALOG.md` and the behaviour acceptance suite |

**Where a document and the engine disagree, the engine is right.** Report the discrepancy.

---

## 16.0 Related documents

- `01_GENERAL_DESCRIPTION.md` — the plant as an operator meets it; §8.0 summarises the simplifications this chapter details
- `02_SIMULATOR_USER_GUIDE.md` — using the trainer, time acceleration, free play vs missions
- `03_CONTROLS_AND_INDICATIONS.md` — every control and every gauge
- `09_SETPOINTS_LIMITS.md` — trips, actuations, alarms, normal values
- `08_ACCIDENT_TMI.md` — the accident this plant's deception mechanisms exist to teach
- `10_GLOSSARY.md` — terms and acronyms
