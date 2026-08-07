# 12 — Simulation Physics & Model Scope

**Document:** PWR-SP-12  
**Plant:** **SLS-100** (Single Loop Simulated, ≈ 100 MWe / ≈ 300 MWt)  
**Revision:** 14  

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

The SLS-100 is a **lumped-parameter, real-time behavioural model**. It is not a full-scope replica of a licensed reactor, and it is not a computational-fluid or nodal-thermal-hydraulic code.

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

A **four-term exponential** model with a production term, so decay heat **builds while the reactor runs** and persists after a scram. The four groups are a fit to the published decay-heat standard rather than chosen constants — see the note below on where the curve comes from:

| Component | Fraction at scram | Decay constant | Time constant |
|---|---|---|---|
| Fast | 0.05 | 5 × 10⁻⁴ s⁻¹ | ≈ 33 min |
| Slow | 0.02 | 2 × 10⁻⁵ s⁻¹ | ≈ 14 h |

A core that has been at power carries **≈ 6.2 %** decay heat at scram. A core that has just been started carries almost none — which is why a fresh startup and a post-trip plant behave completely differently with the same rod position.

> **Where this curve comes from.** The four groups are fitted to the published decay-heat
> standard — ANSI/ANS 5.1-1971 fission-product decay as tabulated by the NRC (ADAMS
> ML050910161 Table 8-3), plus actinide decay from ADAMS ML021720702 Table 2 — with the
> ×1.2 Appendix K margin **removed**, because that margin belongs to a licensing
> calculation and this is a simulator of a plant. The fit is within **5 %** of that curve
> from 1 second to 28 hours after shutdown. Before 2026-08-05 the model used two groups
> and ran as much as **2.4× high** through the ten-minute-to-half-hour band, which is
> where most casualties in this trainer play out — so post-trip timings here are
> noticeably longer than they used to be, and closer to a real plant's.

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

Hot and cold legs are **derived**, not independent: `ΔT = 59.4 °F (33 °C) at rated`, scaled by **total core heat / flow**, split symmetrically about Tavg. The split is **capped so the hot leg can never exceed saturation** — subcooled liquid cannot superheat. Any enthalpy rise beyond that cap is carried as core boiling instead of more temperature. Since Rev 14 the published legs are **transported**: they lag that algebraic split on the loop-transit timescale (a couple of seconds at full flow, stretching to minutes at natural-circulation flows), so a scram's ΔT collapse takes tens of seconds on the board — the way leg RTDs downstream of real pipe actually answer — instead of arriving in one computational step. The departure-from-nucleate-boiling datum deliberately keeps the *untransported* core-exit value (§10.7).

**"Total core heat" means fission PLUS the decay tail, and the distinction only shows after a trip.** The two are equal at steady power, so at power it makes no difference which you name. It makes all the difference afterwards: a scrammed core is still rejecting **~7 % of rated heat**, and heat leaving through the legs requires a temperature rise across them. Measured on this plant at three minutes after a manual trip with the pumps running, the split is **3.93 °F (2.18 °C)** — small, positive, and shrinking with the decay tail; at thirty minutes it is **2.35 °F (1.31 °C)**. Lose the reactor coolant pumps and the same heat has to leave through far less flow, so the split **opens** to about **37.4 °F (20.8 °C)**.

That is why *"is the hot leg above the cold leg?"* is a live question after a trip and not a formality: it is the operator's direct read on whether the core is still being cooled by flow. Until **2026-08-03** this trainer scaled the split by **fission power alone**, which made the post-trip ΔT read exactly zero and left the indicated legs so close together that the *cold* leg read hotter roughly half the time. If you find a screenshot or an older note showing the legs together after a trip, that is the defect, not the plant.

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

A separate node models the **peak cladding temperature of the exposed upper region**: steam-cooled only, heating at the local decay-heat rate scaled by the uncovered fraction **plus the heat of zirconium oxidation** (below), cooled weakly toward saturation. When the core re-covers it quenches back on a ~2-minute reflood timescale.

#### Zirconium-steam oxidation — the second heat source

Above about **2012 °F (1100 °C)** the zirconium cladding burns in steam: `Zr + 2H₂O → ZrO₂ + 2H₂`. This is what carried the TMI-2 and Fukushima cores from *hot* to *melting* faster than decay heat alone can, and the hot node models it.

**Why it matters more than the extra degrees suggest: it reverses the direction of the escalation.** Decay heat *falls* with time, so a core heating on decay heat alone climbs more and more slowly. Oxidation heat *rises* with temperature — steeply. The rate roughly **doubles every 120 °F (66.7 °C)**, so once the crossover is passed the core supplies its own escalation and restoring decay-heat-level cooling is no longer enough to stop it.

The crossover sits where the regulatory limit does. At **2200 °F (1204.4 °C)** — the 10 CFR 50.46 peak-cladding-temperature limit, and near enough this trainer's own cladding-failure threshold — the oxidation heat equals the decay heat **8 hours after shutdown**. Measured on this plant:

| Peak cladding temperature | Oxidation heat, as a multiple of the 8-hour decay heat |
|---|---|
| 2192 °F (1200 °C) | 1.0× |
| 2372 °F (1300 °C) | 2.6× |
| 2732 °F (1500 °C) | 13.3× |
| 3632 °F (2000 °C) | 228× |

The reaction is **self-limiting as well as self-accelerating**: the oxide layer it forms is protective, so the rate falls as the layer thickens. The oxide never un-forms, so a node that is re-wetted and later uncovered again oxidises more slowly than it did the first time.

Measured effect on an unmitigated large-break loss of coolant with no emergency injection: cladding failure to fuel melt went from **22.7 minutes to 8.1 minutes**, and the successive 720 °F (400 °C) bands went from taking *longer* each time (218 / 334 / 378 / 428 s) to taking *less* (184 / 172 / 86 / 40 s).

> **NOTE — what this does not model.** The heat goes onto the peak node only, not the whole uncovered region, and the **hydrogen** it produces is counted only as oxide growth rather than as a mass or a combustible inventory — the containment building now exists (§12.4d) but the H₂ mass is not yet tracked in it (staged, §13). The reaction is **never steam-starved**, and that is not a shortcut: 10 CFR 50 Appendix K requires exactly that — *"The reaction shall be assumed not to be steam limited."*

#### Above about 3452 °F (1900 °C), "peak cladding temperature" stops meaning cladding

The trainer carries **two** endpoints — cladding failure at 2192 °F (1200 °C) and fuel melt at 5072 °F (2800 °C) — and **nothing in between**. A real core has several distinct material events in that gap, and this model passes through all of them as a solid:

| Real event | Temperature |
|---|---|
| Control-rod silver-indium-cadmium molten | 1520.6 °F (827 °C) — *below our damage endpoint* |
| Control-rod failure and first relocation | 2240.6–2600.6 °F (1227–1427 °C) |
| **Zircaloy melts**, and molten Zircaloy dissolves UO₂ | 3194.6–3590.6 °F (1757–1977 °C) |
| UO₂ liquefied by that dissolution, below its own melting point | from 4580.6 °F (2527 °C) |
| Pure UO₂ melting point | 5120.6 °F (2827 °C) |

*(Source: OECD/NEA CSNI-R(2000)21 §2 — "UO2 fuel can be liquefied at temperatures well below (up to 300 K or even more) its melting point (3100 K) by dissolution in molten Zircaloy (melting point 2030 to 2250 K, depending upon oxygen content)".)*

Two consequences for reading the board. **The peak-cladding readout is a peak core-material temperature above about 3452 °F (1900 °C)** — it will show figures far above anything zirconium survives as a solid, and it should not be quoted as a cladding temperature there. And **the melt endpoint is late**: it fires at the pure UO₂ melting point, where a real core liquefies several hundred degrees earlier by dissolution.

This is deliberate rather than overlooked. Everything above the cladding-failure endpoint is **after** the point where the trainer has anything left to teach — the core is lost, no operator action remains, and the simulation ends at fuel damage in any case. Staged degradation, relocation and blockage modelling belong with containment and source-term modelling (§13), not on their own.

Damage is judged at the **peak** of the two nodes, because damage is local before it is average:

| Endpoint | Threshold |
|---|---|
| Cladding failure (`fuel_damaged`) | **2192 °F (1200 °C)** |
| Fuel melt (`melted`) | **5072 °F (2800 °C)** |

The simulation **ends at fuel damage**. Containment pressure, temperature and sump exist (§12.4d); there is no source term and no release (§13).

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

> **Natural circulation is modeled** (#325, 2026-08-04 — it was not before, and this paragraph used to warn that it was not). The steam generators sit above the core, so a hot/cold density difference drives flow once the RCPs stop — WTSM 3.2.6.3: *"The higher elevation of the steam generators relative to the reactor vessel produces a thermal driving head."* Buoyancy head scales with the loop ΔT and resistance with flow squared, and the core rise is itself heat/flow, so the two close to **flow ∝ the cube root of core heat**: measured **3.0 %** of rated at 2.2 % decay heat, falling to **2.6 %** at 1.4 %.
>
> **It needs a liquid-filled loop, and that is the important limit.** Circulation ramps to zero as the primary voids, because a voided loop has no continuous column to drive — which is why tripping the pumps into a voided loop at TMI-2 established nothing. It also does not survive losing the secondary heat sink: circulation *moves* heat to the steam generator, it does not remove it, so a loss of feed still ends in damage.
>
> **The magnitude is this plant's, not a published number.** The shape (cube root, decay heat only) is sourced; the scale is fitted — see §12.4.

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

**RHR** takes suction from the **hot leg** through a valve on **two interlock setpoints**: it can only be opened below **400 psi (2.76 MPa)**, and **auto-closes** only once pressure climbs back above **600 psi (4.14 MPa)**. The ~200 psi (1.38 MPa) of deadband is prototypical (NUREG-0933 Issue 99: autoclose typically 600 psig against a block-open at 425 psig) and it is what stops the valve chattering on a plant hunting near the lower setpoint. It recirculates — hot leg → heat exchanger → cold leg — so it changes no inventory. Cooldown rate is throttled by the heat-exchanger flow split, and its sink temperature **moves with circulating-water temperature**, so warm circ water raises the floor a cooldown can reach.

### 6.5 Two kinds of void, kept apart

| Void | Cause | Where it bites |
|---|---|---|
| **Inventory-driven** (`primary_void_fraction`) | Bulk reaches saturation as inventory is lost — post-scram, low power | The pressurizer saturation pull and the **TMI level deception** |
| **Flux-driven** (`core_void_fraction`) | Core exit passes saturation at full inventory — steam-line break, loss of flow at power | The **DNB heat-transfer collapse** |

These are separate states with separate calibrations on purpose. Combining them would let the flux term corrupt the TMI pressurizer deception.

---

## 7.0 Pressurizer

### 7.1 Pressure

Pressure is an integrator driven by a signed sum of effects — heaters up; spray, PORV flow, safety flow and break depressurisation down; and a **surge** term. Gains are in MPa/s and are **effective coefficients, not thermodynamics** (§12.5).

Three behaviours are worth understanding at the board:

**A surge is a volume displacement, and the pressurizer does not know what caused it.** Coolant expanding or contracting with Tavg displaces liquid into or out of the pressurizer; so does gaining or losing RCS inventory, because a subcooled loop is incompressible everywhere else and the pressurizer is the only place with a free surface. Both drive the same term. What that means at the board: **a loss of inventory shows up on pressure and on subcooling margin, not only on pressurizer level** — and make-up or safety injection pushes all three back the other way. Until 2026-08-04 only the thermal driver was modelled, so a leak that emptied the pressurizer and scrammed the plant moved pressure 5 psi (0.034 MPa) and subcooling 0.2 °F (0.1 °C).

**Spray cannot pull below core-exit saturation.** Its authority tapers to zero across a 435 psi (3 MPa) band above the saturation pressure of the *hot leg*. Below that the core exit flashes and boiling — not pressure control — takes over. This is self-limiting: on a real cooldown the hot leg falls too, so the floor tracks down and spray keeps working.

**Spray is capacity-limited to 12 % of full flow.** It is sized for step insurges, not for a loss-of-heat-sink repressurisation. A TMI-style heat-up **outruns the spray and lifts the PORV** — as it must.

**A raised pressure setpoint slews; a lowered one takes effect at once.** Heating a large subcooled pressurizer to a higher saturation point takes time regardless of heater margin, so the effective target walks up at 3 psi (0.02 MPa)/s (a full cold-to-NOP pressurization ≈ 11 simulated minutes). Depressurisation is spray- and cooling-limited on its own and needs no slew.

### 7.2 Saturation pinning

When the primary voids, **or** whenever the saturation pressure of Tavg exceeds actual pressure, the model switches regimes: pressure is **pulled to Psat(Tavg)** rather than allowed to fall below it. A liquid cannot superheat, and a model that let pressure crash below saturation would report impossible negative subcooling.

The consequence for the operator is the important part: **in the saturated regime you depressurise by cooling, not by spraying.**

**With a loop break open, the pin weakens and the blowdown carries on toward the building (Rev 13).** The pin models closed-system flashing — steam made by the flash holds pressure at saturation. A hole in the loop lets that steam *leave*, so as void grows the pin loses authority and a vent term carries pressure past Psat toward the **live containment backpressure**: on a full-size break the RCS now bottoms near the building pressure instead of flooring at the saturation pressure of the hot remnant, which is the real blowdown shape — "the pressure has equalized with the pressure inside the containment. At this time the blowdown phase … has ended" (WTSM 5.0 §5.0.1.1). Two boundaries are deliberate: the RCS can never be pulled *below* the building it discharges into (connected volumes equalize, they do not cross), and the weakening is **path-scoped** — a stuck-open relief valve is not a loop hole (its discharge is the valve's own metered flow, so the TMI erosion keeps the full pin), and a tube rupture discharges into the steam generator, not the containment. Steam-space breaks and no-break boiling behave exactly as before. What remains declared rather than modeled: injection has no transport delay, so full equalization with the building and a prolonged core uncovery cannot both occur — the model keeps the uncovery (the accident arc the simulator teaches) and accepts a blowdown floor a little above the building.

### 7.3 Level is derived, not integrated

Pressurizer level is a **pure function of state**:

```
level = base(Tavg)  +  mass term  +  void term
```

There is **no level integrator**, so level and inventory cannot silently drift apart.

| Term | Behaviour |
|---|---|
| `base(Tavg)` | Thermal expansion — 1.39 % level per °F (2.5 % per °C), anchored at 55 % for full-power Tavg, floored at 28 % |
| **Mass** | ±776 % per inventory fraction, the same slope in both directions — the pressurizer steam space is the only compressible volume in a subcooled loop, so inventory taken out comes out of the pressurizer and surplus packs into it at the same geometric rate |
| **Void** | **+375 % per void fraction** — saturation-gated, and since Rev 13 weighted by the discharge path (below) |

That void row is **the TMI deception, and it is arithmetic**. Void fraction itself grows at three times the inventory deficit, so in a voided state the void term contributes about **+1126 % per inventory fraction lost** against the mass term's **−776 %** — a net **rise** of roughly +350. **Indicated level rises while inventory falls** — and nowhere outside the saturated regime does it do that. The gauge is not lying. It is telling the truth about a quantity that has stopped meaning what you think it means.

**The lift needs the surge line to be the discharge path (Rev 13).** The void term models loop steam displacing liquid *up the surge line* into the pressurizer — which is what happens when the break is at or above the pressurizer steam space (the stuck-open relief valve: TMI), or when there is no break at all and the loop is boiling (loss of heat sink). With a hole in the **loop**, the displaced liquid has a second exit and the pressurizer discharges through the surge line instead — the real large-break behaviour (WCAP-16009-NP-A §11-4-5, the two-phase surge-line discharge during blowdown). The term is therefore scaled by the split between the two paths: at the failure panel's default cold-leg break the lift is cut to about an eighth, so the level gauge **empties in seconds and stays empty while the core uncovers** — where before this revision it read exactly 100 % at the moment the core top uncovered, at every break size above about 15 %. A stuck-open PORV, the code safeties and a boiling no-break loop keep the full calibrated lift: on those paths the deception is the lesson.

### 7.4 Relief valves and the tailpipe

| Valve | Opens | Closes / reseats |
|---|---|---|
| **PORV** | 2350 psi (16.20 MPa) (2350 psia) | 2300 psi (15.86 MPa) (2300 psia) |
| **Spring safeties** | 2485 psi (17.13 MPa) (2485 psia) | 2400 psi (16.55 MPa) (2400 psia) |

The **block valve** is upstream of the PORV. Closing it stops **all** flow through the PORV line — relief and inventory loss alike — regardless of PORV position. That is the TMI recovery action.

**The tailpipe tells the truth when the indicator does not.** The discharge line downstream of the PORV and safeties reads a **warm 179.6 °F (82 °C) baseline** — the seat has always leaked a little, which is historically true at TMI-2 and precisely why the crew discounted a hot tailpipe — and heats toward 302 °F (150 °C) within ~30 s whenever relief flow passes. It cools slowly, over ~15 minutes, after isolation: a hot pipe stays hot.

---

## 8.0 Secondary side

### 8.1 Steam generator level — a mass ledger, two ranges, one physical column

The state underneath the gauges is a **mass ledger** (Rev 14): the generator carries a secondary water inventory — nominal mass anchored to the R.E. Ginna UFSAR's 85,359 lbm per steam generator, scaled to this plant's power — and the flows move it on the sourced clock: **full boil-dry from nominal takes about 78 seconds at rated steaming with no feed**, which is that mass over rated steam flow. Both level ranges **derive** from the ledger through a level-geometry map: the **wide range** reads the whole vessel, and the **narrow (working) range** is the 30–75 % window of it, remapped to 0–100 %. Inside the narrow window the map reproduces the drain rate this manual has always quoted — a total loss of feed at power reaches the low-low trip in the Ginna analysis's ~35 seconds (measured here: ~40, the extra being this plant's feed-pump coastdown) — while the total inventory now honors the sourced boil-dry instead of the old level integral's implied ~162 s.

The operational consequence is unchanged: **when the narrow gauge pegs on an overfill or a dryout, the wide range keeps reading.** Narrow-range level is the working instrument; wide range is the one that still means something when things have gone wrong.

### 8.2 Steam pressure

Secondary pressure integrates the generation/steam-out imbalance on a **derived clock** (Rev 14): the gain comes from the steam space's own physics — the Ginna-anchored shell volume less the liquid, with the liquid's sensible heat dominating the capacitance — rather than a fitted constant. The operational number: a generator **bottled at sustained full generation rises ~43 psi in the first second**, inside the 35–47 psi/s band the Ginna loss-of-load analysis implies (its safety valves lift 7.0–9.4 s into a full-power loss of load), where the pre-Rev-14 model rose 223 psi in that second. Pressure is then **capped at the saturation pressure of Tavg** — the secondary is heated *by* the primary and can never sit hotter than the coolant heating it.

Between the coolant and the boiling secondary sits a **tube-bundle node** (Rev 14): the bundle's own thermal mass buffers primary↔secondary transients, so the secondary answers the primary on a real seconds-scale rather than in the same computational step. At every steady state the crossing heat is exactly what the old single conductance gave — the node adds dynamics, not a new operating map. The **hot and cold leg temperatures are transported** the same way: the legs lag the core exit and the SG outlet on the loop-transit timescale (a couple of seconds at full flow, minutes at natural-circulation flows), so a trip's ΔT collapse now takes tens of seconds on the board instead of arriving in one step.

Reverse heat transfer — a secondary hotter than the primary, e.g. starting pumps on a cold plant against an atmospheric-saturation secondary — is deliberately **poor** (5 % of forward conductance). The boiling regime that gives the SG its rated conductance only exists in one direction; backwards it is condensate-film convection.

### 8.3 Steam dump — two modes and a declared cliff

| Mode | Behaviour |
|---|---|
| **Pressure mode** (always) | Opens proportionally above the 1194 psi (8.23 MPa) no-load setpoint |
| **Fast Tavg-error mode** (**armed**) | On a turbine trip, or a load rejection past the arm, drives open on Tavg error immediately |

Capacity is **40 % of rated steam flow** — the prototypical Westinghouse value, sized for a **50 % loss of load**: 40 % into the condenser plus roughly a 10 % reduction from the reactor itself. Measured on this plant, a 100 → 50 MWe rejection saturates the dump at 40 % and runs the core back toward the 50 % the secondary is asking for, with no trip and nothing lifting. (An earlier revision said the core 'settles at 89.3 %' — that figure was taken with rod control in manual, a lineup the shipped plant does not use.)

Past that the dump is at its stop and the reactor has to shed the difference. A **full** load rejection from 100 % still does not scram, but the ladder runs: dump saturated, core running back to ~46 % on moderator feedback, average coolant temperature peaking near **608 °F (320 °C)**, the **PORV lifting** at 2350 psi (16.20 MPa) as the designed backstop, and the steam generator safeties just reaching their setpoint. A real plant of this class does not ride out a full rejection either — its design case is 50 % — so this is the plant telling you the truth about where its margins end.

Capacity is also exactly what **cannot** save a loss-of-feed event, where the drying steam generator stops absorbing heat no matter what the dump vents.

The fast mode's reference Tavg is **programmed on turbine load** — the same sliding program the rod controller uses — so the two cannot drift apart.

> **WARNING — a declared, deliberate cliff, and since Rev 14 it is a THERMAL cliff.** The fast mode arms on a **rate**: a step load rejection must exceed **40 MWe**, or a ramp must exceed roughly 40 MWe/min. On the Rev 14 plant the steam generator's liquid soaks a sub-threshold rejection slowly enough that pressurizer spray keeps up, so the excursion is carried by **temperature**, not pressure — measured: a **39 MWe rejection does not arm** and Tavg runs to 600.1 °F (315.6 °C) hands-off, roughly **20 °F past program**, with pressure held 95.7 psi (0.66 MPa) clear of the PORV; **41 MWe arms and is caught** at 582.4 °F (305.8 °C) on program. Your cue is the **Tavg/Tref deviation**, not a relief lift. (Pre-Rev-14, the compressed secondary bottled in seconds and the uncaught side ran to the PORV setpoint — that was the clock's rendering, and older screenshots will show it.) **Rod control in AUTO does not absorb the excursion**: the shipped lineup still climbs ~15 °F past program (593.2 °F / 311.8 °C measured), and its 39 MWe cut undershoots ~15 points deeper than a caught 41 MWe cut — the smaller upset is still the worse plant. The arm is also **blind to staircases** — 60 MWe delivered as four 15 MWe steps never arms at all.
>
> This is a ruled, intentional limitation, not a defect. Lowering the arm is not the fix: an arm low enough to catch an ordinary 15 MWe dispatch cut would leave the dump venting forever, holding the reactor at 100 % and destroying the load-follow behaviour. The sub-threshold rejection is a manoeuvre **you** are expected to handle, and the board's temperature program is how you see it.

**The dump's mass flow carries the steam pressure** — a valve on a blown-down generator passes little, however far open it is, so a deep cooldown self-arrests as pressure approaches the setpoint you asked for rather than running to the model floor. **There is no automatic rate limiter on a dump cooldown**: the board gives you a cooldown-rate meter and the **RCS COOLDOWN RATE HI** annunciator at the 100 °F/hr class limit (**A34**), and holding the plant inside it is your job.

**There are two steam paths, and only one of them needs the condenser.** The turbine bypass dumps to the condenser and dies with it. The **atmospheric dump valves (ADV)** vent to atmosphere, sit upstream of the isolation valve, and work whether the condenser is there or not — they are the cooldown path when it is gone. Measured: with the condenser lost and the ADV opened, the plant cools from 579.2 °F (304 °C) to about 370.4 °F (188 °C) and reaches shutdown-cooling entry temperature; with the ADV left shut it holds hot at the safety band indefinitely, which is what this simulator did before the valves existed.

**The ADV ships in AUTO** *(changed 2026-08-06; it shipped SHUT when the valves were built in #371)*, so it modulates on its own to hold steam pressure at its setpoint, the way a real plant's atmospheric dumps do. Three consequences worth knowing.

First, **AUTO caps pressure — it does not cool the plant.** A bottled generator settles just above the 1272 psi (8.77 MPa) setpoint — measured 1276 psi (8.80 MPa), the valve holding about 13 % open — instead of parking on its 1350 psi (9.31 MPa) code safeties, but it stays hot: measured with the condenser lost, Tavg holds at 576.5 °F (302.5 °C) indefinitely. Starting a cooldown still means lowering the ADV setpoint or opening the valve.

Second, **an available ADV now catches even the fast transient** (Rev 14). With the tube-bundle node buffering the bottling burst, an MSIV closure at power peaks at **1345 psi (9.27 MPa) — five psi under the code-safety pop — with the ADV wide open**, and the safeties stay seated: the correct relief hierarchy, the controllable valve ahead of the spring backstop. The code safeties earn their keep on the night the ADV is **not** there — tagged out, failed, or air-lost — which is exactly the premise the "Bottle the Boiler" mission now states on its card: with the ADV out of service, the closure pops the safeties at ~43 seconds and they carry the bottled generator. Coming *up* from a blown-down break there is no spike either way, and the generator holds thermal equilibrium with the primary (steam pressure tracking the saturation pressure of Tavg) as decay heat re-warms them together.

Third, **a fully-open ADV cools far faster than the technical-specification limit** — measured at about 630 °F/hr initially, six times the 100 °F/hr limit (re-measured after the decay-heat refit lowered the opposing decay load) — so the cooldown-rate meter and the **RCS COOLDOWN RATE HI** annunciator (**A34**) are live equipment during this evolution, and throttling to stay inside the limit is the skill.

### 8.4 Feedwater, AFW, and the isolation chain

Main feedwater requires the **condensate pump**, an available **condenser**, and an **open MSIV** — the feed pumps are steam-driven off the main line downstream of the MSIV, and the condensate pump draws from the hotwell. Any of the three closes the chain: heat-sink loss → main feed loss → SG inventory falls → low-low level trip. **The ride-out plant trips on a genuine limit, never on anticipation.**

**AFW** is 15 % of rated feed capacity, auto-starting on 20 % narrow-range level. It **latches**: the pump demand has no reset and stands until the operator secures it, as in a real plant. Delivery is capacity × operator throttle × a built-in proportional level hold (full flow below 32 %, tapering to zero by 40 %), and the hold senses **the level instrument** — so a failed level sensor fools the AFW regulator exactly as it fools you.

**Feedwater carries enthalpy.** The heat crossing the tube bundle first raises feed to saturation, then boils it — so overfeeding cools the generator and drops its pressure (the classic overcooling signature, with a small power rise on moderator feedback), and cold auxiliary feedwater is a **genuine heat sink**: at decay-heat levels, full AFW flow absorbs more heat than crosses the tubes, steam generation stops, and the plant is pulled below the no-load anchor until the level hold throttles the flow back. Main feed is modelled at a **constant final feed temperature of 435.2 °F (224 °C)** — since Rev 14 the top of the R.E. Ginna UFSAR's sourced 390–435 °F final-feed band (the earlier 440.6 °F sat just above it) — and the regenerative heater train is still not modelled, so feed temperature does not fall at part load (declared, §12.16).

**AFW pumps can run against a shut discharge valve.** When they do, discharge pressure sits at **shutoff head** rather than at SG-plus-margin. That distinction is the tell separating "AFW blocked" from "AFW not started" — and it is the TMI-2 pumps-running/valves-shut condition.

### 8.5 The MSIV and SG safeties

**SG code safeties are upstream of the MSIV** (pop 1350 psi (9.31 MPa), reseat 9.0), above the 1194 psi (8.23 MPa) dump setpoint. They are the relief that remains when the generator is bottled — and they are **self-actuating spring valves**: the pop and reseat act on the steam pressure itself, not on an instrument channel, so a failed steam-pressure transmitter changes what the gauge reads, never whether the valves lift.

**The steam lines isolate automatically on a break.** High steam flow **coincident with** low steam pressure shuts the MSIV without any operator action — measured on the current plant, a full-area break isolates about **two minutes in** (the sourced 600 psig-class low-pressure leg sits deep, so the crossing honestly takes that long; the held-flow coincidence latch is what lets the collapsed flow spike still count when pressure arrives), and the generator then bottles up and recovers toward thermal equilibrium with the primary instead of blowing down. It takes both signals together: a cooldown drives steam pressure far below the setpoint and does *not* isolate, because flow stays low; a bottled generator pegs the flow transmitter through its own safeties and does *not* isolate, because pressure is high. **You cannot reopen the valve while the isolation is sealed in** — the board refuses it until the generator has re-pressurized, at which point reopening becomes your deliberate call on a plant you can see has recovered.

The isolation **cannot tell where the break is**, and neither can a real one: it fires identically on an upstream break, where shutting the valve changes nothing because the break is on the generator's side of it. Two parts of the real function are not built and are declared: there is no containment-pressure isolation path — this plant now *has* a containment pressure (§12.4d), but no protective actuation reads it yet (§12.17) — and the steam-flow setpoint is fixed where a real one is programmed on turbine load, which means this plant under-protects at low load (§12.19).

A **main steam line break is gated by break location.** A break *downstream* of the MSIV is isolable — shutting the valve stops the blowdown dead, and that is the operator's one real lever. A break *upstream*, between the SG and the valve, is on the wrong side of every isolation this single-loop plant owns and blows the generator down regardless.

### 8.6 The turbine governor and stop valves

The governor valve target is **pressure-compensated**: demand divided by the upstream pressure ratio, clamped fully open. At steady state the delivered steam therefore equals the demand at any secondary pressure — the valve strokes open as pressure falls and closes down as it rises, like a real governor holding load.

**On a turbine trip the stop (throttle) valves slam shut in a fraction of a second** — a separate spring-closed path, redundant with the governor, as on the real machine. A tripped turbine therefore stops drawing steam essentially instantly, and the stored-energy burst that follows a trip from full power is real: primary pressure spikes briefly toward the PORV setpoint — the designed backstop — before feedwater heat uptake, the steam dump and the scram catch the plant.

---

## 9.0 Turbine, condenser and generator

These are **behavioural, not thermodynamic**. There are no stage efficiencies, no feedwater heater train, no hotwell level.

Electrical output is a product of factors:

```
MWe = (turbine steam admission) × 100 MWe × (rpm / 1800) × (vacuum / rated vacuum)
```

A disconnected or tripped generator produces zero regardless of shaft speed.

**The first factor is what the turbine is ADMITTED, not what the reactor makes** — governor
position, not core power. The two are the same number in steady state and diverge in exactly
the states that matter: through a load rejection the steam dump vents the difference to the
condenser, so electrical output falls with the *turbine's* steam while core power is still
coming down. Read against core power instead, a 50 MWe demand at full power indicated
**98.8 MWe** with the dump at 48 % — the operator asked for 50 and the gauge said 99.

**Condenser vacuum is genuinely modelled against circulating-water temperature.** The condenser pulls exhaust down to saturation at the condensing temperature, which sits a terminal difference above the circ-water outlet — and the temperature rise across the tubes grows with load, so the derate bites hardest at full power. Warm circ water means less vacuum, less output at the same steam flow, and a shorter walk to the vacuum trip. Cold circ water buys vacuum **above** nameplate: the winter uprate is real here, capped at a practical condenser floor.

**The rotor coasts down on windage and bearing friction** toward rest when tripped or unloaded. Synchronised to the grid, it holds rated speed at any load, because a synchronous machine does.

**There is no turbine roll and no no-load speed hold, so the rotor never turns off line** (§12.14). A real machine is rolled to rated speed on no-load steam and held there ready to synchronise; here an unloaded rotor with no steam simply coasts to rest, and going on line takes it from wherever it is to rated in one step. The consequence to know is that **shaft speed is never an independent variable**: it is 1800 when synchronised, falling when not, and nothing in between that you can drive.

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

**The temperature side reads the hotter of two channels (Rev 13): the loop bulk and a core-exit thermocouple.** On a covered core the two are the same number by construction and the margin behaves exactly as it always has. Over an uncovering core the exit channel reads the steam superheating against the exposed cladding, so the margin goes hard negative and **SUBCOOL LOST** lights while the bulk — by then quenched cold by injection — would have read comfort. This is the post-TMI inadequate-core-cooling instrumentation, as required: the indication "must cover the full range from normal operation to complete core uncovery", displayed as "the highest of all operable thermocouples" (NUREG-0737, Item II.F.2 and its Attachment 1; the channel's 200–1800 °F range is that attachment's figure). Being an instrument, the thermocouple can fail like any other — a channel failed low hands the margin back to the bulk datum, which is the pre-Rev-13 gauge exactly.

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

The **setpoint is the real one — 90 % of rated, blocked below P-7 (10 % power)**. Adopted 2026-07-29, replacing an unsourced 25 % / 5 % pair. Measured on an RCP trip from full power: the indication crosses 90 % at **1.8 s** and DNB onset is at **10.9 s**, so the trip now fires about nine seconds *before* the core exit reaches DNB. The old 25 % setpoint fired at 16.2 s — about five seconds *after* it. Its entire practical effect was to let DNB happen.

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
| 12.2 | **One lumped loop, one SG, one RCP** | Loop-to-loop asymmetry, individual SG isolation, single-loop transients | **No** — the plant genuinely *is* single-loop by design. This is the SLS-100's identity, not a compromise. |
| 12.3 | **Two-term decay heat** | Full ANS 5.1 accuracy; the two-term form is ~20 % accurate over hours to days | **No.** Decay heat exists, demands cooling for hours, and drives every long transient. |
| 12.4 | **Natural-circulation MAGNITUDE is fitted, not sourced** *(rewritten 2026-08-04, #325 — this row used to read "No natural circulation")* | The mechanism and its scaling are sourced (WTSM 3.2.6.3, ML11223A213); the flow **coefficient** is fitted to this plant's own energy balance, because no primary for the magnitude could be obtained. The "2–5 %" this manual quoted before was uncited inherited prose and is **not** the anchor | **Minor.** The lessons that depend on natural circulation — that a loss of offsite power is survivable, that it needs a liquid loop, and that it still needs a heat sink — are all shape, not scale. Do not quote this plant's percentage as a real-plant figure. |
| 12.4b | **Break discharge is an orifice law, not the Moody critical-flow model** *(new 2026-08-04, #334 — before this, a break flowed at a CONSTANT rate that never varied with pressure at all)* | 10 CFR 50 Appendix K I.C.1.b requires the discharge rate to come from the Moody model, applied as a *discharge coefficient on the postulated break area*. Moody's critical mass flux depends on stagnation pressure **and enthalpy**; this plant has one lumped primary node and tracks no steam quality at the break, so there is nothing to evaluate it against. Break flow here is the incompressible orifice law, flow ∝ **√Δp** against the **live containment pressure** (#386 stage 1 — the backpressure used to be a fixed 14.5 psi (0.1 MPa) constant; §12.4d) — the same form the manual's letdown orifices use | **Know which way it errs.** √Δp falls off **faster** than Moody does once the discharge flashes to two-phase, so a real break stays **stronger for longer** than this one as the plant blows down. The *shape* is right and it is what matters operationally — the break weakens as you depressurize, which is why closing the pressure difference is the response to a tube rupture, and why an RCS at containment pressure has stopped discharging. Do not read a time-to-empty off this plant as a real-plant figure. |
| 12.4c | **Water-solid: the surge stiffens and SPRAY STOPS WORKING — relief and the heaters keep their bubbled-plant gains** *(new 2026-08-04, #346; spray added #347 — before this, a solid RCS taking safety injection did not repressurize at all: the surplus mass was discarded at a numerical ceiling and pressure sat flat while ECCS ran on)* | When the pressurizer goes water-solid the only compressible volume in the RCS is gone, so an insurge compresses **liquid** and the pressure gain steps up to the bulk modulus (≈ 1.3 GPa, ~4× the bubbled gain). **Spray also loses all authority** — it controls pressure by condensing the steam bubble, and there is none — which is modelled because it turned out to be load-bearing rather than cosmetic: with spray still credited, it pinned pressure 164 psi below the code-safety setpoint and the safeties could not lift at all. **Break blowdown was added to the regime 2026-08-05 (#361)**: on a liquid break the depressurization term is a bubbled-plant mechanism — liquid leaves, the bubble expands to fill the space, pressure falls — so with no bubble it is switched off and the break's mass moves pressure through the bulk modulus alone, which it was already doing. Counted twice, it held the plant about 2000 psi below the relief band, emergency injection never terminated, and inventory ran to the numerical ceiling. What is still **not** modelled: a solid pressurizer's relief valves pass water rather than steam, and the heaters have no bubble to flash, so both keep their normal-operation gains. The relief-only version of that correction was built and measured, and it is *worse* than leaving both alone — it drops the relieving equilibrium ~145 psi, which un-deadheads the emergency injection and lets it out-run the relief valve again | **Minor, and it errs toward calm.** A real solid plant is *harder* to control than this one: relief is stronger per unit mass and heater response is weaker. The lesson is intact and is the one that matters — **going solid costs you the pressurizer as a pressure controller.** Spray does nothing, the heaters cannot help, and the relief valve becomes your pressure control whether you wanted it or not. Do not read the cycling *rate* as a real-plant figure. |
| 12.4d | **Containment is one lumped volume with a flash-gated steam inventory** *(new 2026-08-05, #386 stage 1 — before this there was no containment at all: the break discharged into a fixed 14.5 psi (0.1 MPa) forever and relief into a fixed 14.9 psi (0.103 MPa))* | A real containment is a large dry volume with structural heat sinks, containment spray, fan coolers, a pressurizer relief tank (PRT) between the relief valves and the atmosphere, and a recirculation sump. Here: one steam inventory behind a **flash fraction** (hot break liquid partly flashes to steam — cp·ΔT/h_fg — an h_fg/cp span of 972 °F (540 °C) — while cold spill rains straight to the sump), one passive condensation time constant standing in for every structural heat sink, relief discharging **directly to the atmosphere** (no PRT), a sump that indicates but does not recirculate (no refueling-water storage tank inventory exists to swap from), and a pressure stiffness that is **fitted rather than computed from a free volume** — no document in the corpus gives one. The fit: the full-size break peaks at ⅔ of a **60 psig design pressure** inferred from spray actuating “at approximately half of design pressure” (WTSM 5.0, ML11223A218) with the spray setpoint at 30 psig (WTSM 12.3, ML11223A310) | **Know which way it errs.** The pressure SHAPE is right — it peaks on the hot early blowdown and decays as the emergency-injection quench takes the source below flashing — and a steam generator tube rupture correctly reads **nothing**, because that break discharges into the steam generator: the one leak containment cannot see. But with no spray or fan coolers yet, nothing brings pressure down except the passive sink, and **no protection actuates on containment pressure**. Do not read the psig values as a licensing calculation. |
| 12.5 | **Pressurizer uses effective coefficients, not two-phase thermodynamics** | Flash evaporation, condensation, subcooled surge into a steam space | **No.** Directions and magnitudes are right, and the TMI-critical level rise during voiding is fully captured. |
| 12.15 | **Heater authority is far above the real one, so pressure droops LESS than it should during a loss of inventory** *(new 2026-08-04, #337; re-stated 2026-08-07, #419 — the Mode 5↔1 time compression that once framed this as "27×" is retired, so the departure now stands alone at its full size)* | WTSM 3.2 (ML11223A213) rates the real heaters at 1794 kW, *"capable of raising the temperature of the pressurizer and its contents at approximately 55 °F/hr"* — 0.23 psi/s (1.6e-3 MPa/s), and since #419 the plant's own pressurization slew runs exactly that sourced rate. The heater CONTROL authority, however, is 80 psi/s (0.55 MPa/s) — about **347×** the sourced rating. | **Yes, in one direction, and it is deliberate.** The surge itself is modelled (§7.1), so pressure and subcooling *do* respond to inventory — but the heaters rebalance against them, so the cue is smaller than a real plant's. A leak that drives the pressurizer to its 17 % heater cutoff costs about **1 °F** of subcooling margin here against roughly **9 °F** at the sourced heater rating. Treat the *direction and ordering* as the lesson, never the magnitude. The value is RULED (F14, re-affirmed 2026-08-07 on current numbers) — it is what lets this plant ride out a full load rejection without a trip. |
| 12.6 | **No sensor redundancy or voting** | Real plants use ~3 channels with 2-of-3 voting; one failed sensor cannot trip or block a trip alone | **Yes — instrument failures are *more* impactful here.** That is arguably better teaching, but it is not prototypical. |
| 12.7 | **Xenon has no spatial oscillation** | Xenon power tilts swinging around a large core over hours | **No** at this plant size. Total inventory suppression is modelled. |
| 12.8 | **Turbine and condenser are behavioural** | Stage efficiencies, feedwater heaters, hotwell level | **No.** Trip and vacuum-loss behaviour is right; the thermodynamic detail is not part of any lesson. |
| 12.9 | **Steam-dump load-rejection arm is a bistable — there is a cliff — and it disarms itself** | A rejection just under 40 MWe gets no fast dump; staircased rejections never arm. And once armed, the fast mode stands down on its own when the reactor catches the load — a real one stays armed until an operator turns a RESET selector | **Yes — see the warning in §8.3.** Ruled and declared, not a defect. The real arm is far more sensitive (a 10 % step), affordable only because a human de-arms it; the blunt arm and the auto-clear are one trade, and any change takes both | 
| 12.10 | **Boron chemistry is an idealised rate** | Blender dynamics, VCT mixing, real makeup-flow chemistry | **No**, but note the compressed time scale: borating/diluting runs at 2 ppm/s, and a grab sample returns in 60 s against a real lab's 30–60 min. |
| 12.11 | **One control group and one shutdown group** | Multi-bank sequencing, programmed overlap, bank overlap indication, core maps | **Not for operating**, but the single bank carries the *whole* control worth, which is why its worth curve is deliberately flattened (§4.3). |
| 12.12 | **Pressurizer level is geometric, not a calibrated span** | Reference-leg behaviour and a true narrow/wide calibration | **No.** Note this does **not** apply to SG level, which *does* have a real narrow/wide window (§8.1). |
| 12.16 | **Final feedwater temperature is constant** *(new 2026-08-05, #372 — feed used to carry no enthalpy at all; value SOURCED Rev 14)* | Real final feed temperature falls with load as extraction-steam heating fades; here it is 435.2 °F (224 °C) at every load — since Rev 14 the top of the Ginna UFSAR's 390–435 °F final-feed band, where the earlier 440.6 °F sat just above it — and the feedwater-heater train and moisture-separator reheaters do not exist as components. Loss-of-feedwater-heating — a standard overcooling transient — therefore remains unreachable, and part-load overcooling from cold feed is milder than the real plant's. | No. Overfeed and AFW cues read correctly now; just don't expect a feed-heater casualty to exist. |
| 12.17 | **The steam lines isolate on flow-plus-pressure only — nothing reads containment pressure** *(new 2026-08-05, #370; revised 2026-08-06 — the premise changed under it)* | A real plant also isolates on high-high containment pressure. This simulator **does** have a containment pressure now (§12.4d, #386 stage 1), so the signal exists — but **no protective actuation is wired to it yet**; every containment-pressure trip and isolation is staged under #386 stage 2. Until then, that half of the real logic has something to sense and still does not sense it. | **In one case.** A break whose signature would be containment pressurization *without* high steam flow — a small break inside containment — will not isolate here. Large breaks, the ones that matter, isolate on the flow-and-pressure coincidence. |
| 12.19 | **The steam-flow isolation setpoint is fixed, not programmed on turbine load** *(new 2026-08-05, #370)* | The real setpoint slides with turbine load, so it stays sensitive at any power. Ours is a fixed fraction of RATED flow. | **Yes, at low power.** A break that is large *relative to the load* need not reach the fixed setpoint when the plant is well below full power, so it may not isolate automatically. At power the separation is wide and measured. Below about half load, treat the MSIV as your lever, not the plant's. |
| 12.18 | **The atmospheric dump valves' size is not sourced** *(new 2026-08-05, #371; narrowed 2026-08-06 when the shipped lineup went SHUT → AUTO, which retired the other half of this departure)* | Their capacity comes from the plant's design in a real plant. `adv_max` 0.10 of rated steam flow and the 1247 psi (8.60 MPa) setpoint are engineering choices — no document in this simulator's source set names an atmospheric dump capacity for a plant of this size. The *automatic* half is no longer a departure: they modulate on their own now, as a real plant's do. | **Yes, in one way that matters.** Losing the condenser does not start a cooldown by itself — AUTO caps steam pressure at the setpoint but the plant stays hot, so you must lower the setpoint or open the valve. And once open, it cools **much faster than the 100 °F/hr limit** — throttle it, and watch the cooldown-rate meter (**A34**). |
| 12.14 | **No turbine roll or no-load speed hold — and the overspeed trip therefore cannot fire** | The whole off-line half of a real startup: rolling off the turning gear, holding rated speed on no-load steam, and synchronising before the breaker closes. On a real EHC machine that is a *setpoint-and-rate* evolution (select 1800 RPM and an acceleration rate; SLOW takes ~30 min), not a hand-throttled one — see **04** PWR-N05. | **Yes, for one procedure and one trip.** PWR-N05's synchronisation is **one action**: the rotor goes from rest to 1800 RPM and picks up load in a single press of FOLLOW or MAN, and measured, the plant barely notices (Tavg moves 0.1 °F, steam pressure 1196 → 1194 psi). And the **1980 RPM overspeed trip in §09 is configured but unreachable** — the rotor is either pinned at rated by the grid or coasting down, so nothing can drive it there. Do not read "no overspeed trip occurred" as evidence about a real machine. |
| 12.13 | **Cold-plant mass bookkeeping is normalised** | The real cold-plant mass surplus | Level in the cold modes rests on a program floor standing in for CVCS keeping the pressurizer on span. Visible only in Mode 5. |

---

## 13.0 What is not modelled at all

If you expect one of these and cannot find it, it is not hidden — it does not exist.

**Containment and consequences**
- The containment **building** is modelled as of #386 stage 1 (2026-08-05): one lumped volume with pressure, temperature and a sump level, receiving break and relief discharge and feeding back as the live backpressure the break and relief √Δp laws discharge against (§12.4d). What it does **not** yet have: heat-removal systems (containment spray, fan coolers) and any protection actuation on its pressure — both staged next under #386
- No hydrogen **inventory** or combustion — the zirconium-steam reaction that produces it **is** modelled as a heat source on the cladding hot node (§5.5), but the H₂ mass is not yet tracked in the building (staged, #386 stage 3)
- No fission-product release, no source term, no dose, no radiation monitors
- **The simulation ends at fuel damage.** Consequences beyond it are described in training commentary, never simulated

**Reactor physics**
- No spatial or nodal kinetics — no axial or radial power shape
- No fuel burnup, no cycle depletion, no reactivity drift over a cycle
- No spatial xenon oscillation
- No fission-product poisoning beyond xenon (no samarium)

**Thermal-hydraulics**
- Natural-circulation magnitude fitted rather than sourced (§12.4) — the mechanism itself IS modeled
- No steam-table property model — correlations only (§5.1)
- No boron plate-out, boron dilution accidents, or boil-off boron concentration (steam carries no boron in reality; the loss term here is lumped)
- No pressurizer relief tank or rupture disk — the stuck PORV and the lying indicator are the lesson; the tank filling and rupturing is not modelled

**Balance of plant**
- No turbine roll, no no-load speed hold, and no synchroscope — synchronising is one action and the generator breaker is not a separate control (§12.14, **04** PWR-N05)
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
| **Structural** — fixed physical constants and real-plant setpoints | High | β and Λ, six-group delayed data, fuel damage/melt thresholds, PORV and safety setpoints, the 600 psi (4.14 MPa) accumulator arming pressure, the 400 psi (2.76 MPa) RHR block-open permissive and its 600 psi (4.14 MPa) autoclose |
| **Calibrated** — arbitrated by the physics acceptance suites | Directionally right, magnitude roughly right | Heat-transfer coefficients, decay-heat constants, level coefficients, dump and AFW capacities |
| **Compressed** — deliberately faster than reality for training | Right in behaviour, wrong in duration | **This class has largely emptied** (#408 put the accident-inventory family — ECCS injection included — on the real Ginna scale; #419 retired the Mode 5↔1 pacing: the pressurisation slew now runs the sourced 0.23 psi/s heater rate, the boron rate is a derived physical ceiling, and the grab-sample turnaround is a real 30-minute lab). What remains: the **cooldown depressurisation rate** — see §14.1 |
| **Indicative** — display flavour derived from normalised internals | Illustrative | The gpm conversions (24 000 gpm RCS flow, 60 gpm charging, 30 gpm letdown, 100 gpm AFW) |

> **NOTE.** The plant's absolute ratings — ≈ 300 MWt, ≈ 100 MWe, one loop, one SG, one RCP — are a **design choice**, not a measurement of any real unit. The SLS-100 is its own plant.

### 14.1 The one Compressed rate left worth knowing by name

*(This section named two others when it was written. **ECCS injection pacing** — once 22–440×
real — was retired by #408, which put the whole accident-inventory family on the sourced Ginna
scale: injection now runs a real pump-segment model with shutoff heads, so time-to-recover
numbers from injection transients ARE plant numbers. The **Mode 5↔1 pacing family** —
pressurisation slew, boron rates, lab turnaround — was retired by #419: those now run sourced
or derived real rates, ridden at time acceleration.)*

**Cooldown depressurisation is compressed, and it narrows one cue.** A real plant takes a good part of an hour to walk from 1000 psi (6.895 MPa) to the accumulators' 600 psi (4.14 MPa) cover gas. Driven briskly here, that band is crossed in about **1 minute of plant time** — measured full-stack. That is the entire window between the **SI ACCUM ALIGNED** annunciator (**06 PWR-A32**) coming in and the first accumulator discharge. At 30× time acceleration it is a couple of seconds of wall clock. **What this means for you:** isolate the accumulators on schedule at 1000 psi as the procedure says (**PWR-N15** step 3, **05** Phase C step C3) rather than waiting for the annunciator to prompt you, and slow the acceleration through that band. The cue is a backstop, not a timer you can run against.

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
