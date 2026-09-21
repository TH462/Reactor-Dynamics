# 12 — Simulation Physics & Model Scope

**Document:** PWR-SP-12  
**Plant:** **SLS-100** (Single Loop Simulated, ≈ 100 MWe / ≈ 300 MWt)  
**Revision:** 21  

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

On the **PLAY** tier (1× to 60×) the engine is stepped at **0.02 s and only 0.02 s**. Time acceleration does **not** hand the engine a bigger `dt` — it runs **more 0.02 s steps per wall-clock second**. Every plant behaviour is therefore identical at 1× and at 60×; only the wall-clock pacing changes.

The **WARP** tier (600× and 3600×) is the one declared exception: the **same physics stepped at 0.5 s**. It exists for the evolutions whose clock is hours — xenon, decay heat, boron, a heatup — and it is bounded by measurement. Over a sim hour in five regimes (steady full power; a scram then decay heat and xenon; hot zero power; hot shutdown; cold shutdown) every channel stays inside its own instrument noise of the 0.02 s plant: worst **5 psi (0.034 MPa)** of pressure, **0.07 °F (0.04 °C)** of Tavg, **0.3 %** of pressurizer level, **0.0003 %** of xenon. It works because the kinetics is solved exactly (a matrix exponential, not Euler), the fuel and the instrument lags are analytic, xenon's fastest constant is 4 × 10⁻⁵ /s, and the loop sub-steps itself to its own Courant limit. It stops working between 0.5 s and 1.0 s — at a 1.0 s step the quiet plant trips itself at 18 minutes — which is why WARP refuses a plant in a transient and lets go the moment one begins (see **02** §4.1).

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
| Λ (prompt generation time) | **2.0 × 10⁻⁵ s** |
| Delayed groups | 6, λ from 0.0124 to 3.01 s⁻¹ |

Λ is the **physical** prompt generation time. An earlier engine carried 0.01 s — 500 times that — because its explicit integrator was only stable with it; the equations here are integrated in closed form instead (a matrix exponential each step), so the real value is used. It matters to more than the prompt response: the subcritical source level below scales with Λ.

There is **no spatial flux shape**. The whole core is one point. This is the single largest simplification in the model, and its consequences are stated in §12.1.

### 4.2 The neutron source

A small constant source term is present at all times, representing the startup sources every real core carries. It is what gives a subcritical core its **1/M behaviour**: at equilibrium, power sits at `source · Λ / (−ρ)`, so power and startup rate respond visibly to every rod step during the approach to criticality instead of the core sitting dark until it is too late. It is also why a tripped reactor levels off at a low, steady indication instead of falling for ever.

| Parameter | Value |
|---|---|
| Source (fraction of rated power per second) | **1.0988 × 10⁻⁶** |
| …derived from an installed source strength of | 5 × 10⁸ neutrons/s |
| …over this plant's rated neutron population | 4.55 × 10¹⁴ neutrons |

The source strength itself is the one **unverified** figure in the block: no reference in the source set gives an assembly total for a startup source, so it is chosen to place the shutdown indication where the plant's own instrument setpoints say it belongs — the intermediate range reads under the **P-6** permissive at Hot Standby and crosses it partway up the control bank.

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
next to the hot end, was critical at 274 °F (134.4 °C)**, and diluting toward it in a Mode 5 →
Mode 1 run took the reactor critical cold. **On the retired engine that ended in a source-range
high-flux trip; this plant has no such trip** (**09** §2.0, NOT MODELLED — 1e5 cps is this
plant's source-range *de-energization* point, and it sits 1.5 decades above the P-6 permissive
that would block the trip anyway). The same defect today would announce itself on the
annunciators — **SUR HI** at 1 DPM, then **SR HI FLUX** at 5e4 cps — and be arrested by the
intermediate-range high-flux **rod stop at 20 % current equivalent**, with nothing scramming
until the intermediate-range **trip at 25 %**.

**Rod worth follows an S-curve** — least effective near fully in or fully out, most effective mid-core — with the peak deliberately flattened to about 90 % of the textbook curve. The reason is a teaching one: the single lumped bank carries the **full control worth that a real plant spreads over four banks**, so an unflattened curve made one step near the critical band worth far more than a real bank-D step.

**Boron reactivity lags the boron you inject.** Injected concentration changes immediately; the *core* concentration that drives reactivity follows through a **30-second mixing lag** (roughly one loop transit). Power therefore moves in step with the boron *indication*, not ahead of it.

> **NOTE.** Reactivity in pcm, startup rate in DPM, and reactor period in seconds are all available as **indications** — a reactivity computer and rate meters. None of them feeds a protection trip. Real PWRs have no direct reactivity gauge; these are engineering tools, and the model says so.

### 4.4 Startup rate and period are derived, not measured

`SUR (dpm) = 26.06 · (Ṗ/P)` and `period (s) = P/Ṗ`, both computed from the **smoothed** power rate. They are well defined only above a very small power floor. The plant carries a *separate* startup-rate **instrument** — a lagged, noisy twin of that proxy, 2-second lag — and it is that instrument, not the proxy, that the **SUR HI** annunciator reads at **1 DPM**. **It feeds no interlock.** The retired engine blocked rod withdrawal on it at 1.5 DPM; this plant does not, and no document in the corpus describes a startup-rate rod stop (#572). Measured on a runaway withdrawal from hot zero power (2026-09-18, #665; full stack, normal drive speed **0.800 steps/s**, times relative to the start of withdrawal): SUR HI comes in at **267 s** — 1.66 s behind the true rate, which is the meter's own lag and nothing else — and withdrawal then continues uninterrupted to the intermediate-range flux rod stop at **338 s**. *(A 2026-09-08 pass, #661, filed 367 s / 442 s against engine simTime including a 60 s settle, at the drive speed then in force, 0.702 steps/s — both changed since; see `Diagnostic/PWR2_HARNESS_RECONCILIATION_2026-09-18.md`.)*

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
| Travel | **627 steps** |
| Speeds | slow **8** steps/min · normal **48** · fast **72** — slow and fast sourced to WTSM 8.1's rod speed program (its minimum, and its mechanical maximum); normal unverified |
| Overrun on release | ~1 s of continued travel, then the latch catches |
| Scram insertion | control 2.5 s · shutdown 2.0 s, constant-rate (gravity) |
| Insertion limit | **power-dependent**: none below 5 % power, ramping to 70 % withdrawn at 100 % |

The fine 627-step drive exists so that one step in the critical band is worth **7.76 pcm (1.19 ¢)** — re-measured 2026-09-14 (#749); the 8.1 printed here until then was this plant evaluated at a benchmark anchor 10 °F above its no-load point — rather than the ~36 pcm lurch a coarse drive gave. The whole profile runs **4.15 to 8.82 pcm/step**, inside the sourced 4–12 band (NRC HRTD WAT 05, ML11216A094); the shape is the four-bank overlap program of WTSM 8.1 §8.1.5.4 collapsed onto one lumped bank.

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

> **NOTE — what this does not model.** The heat goes onto the peak node only, not the whole uncovered region. The **hydrogen** the reaction produces IS tracked as a combustible inventory in the containment building (§12.4e — **generation only: this plant has no recombiners and no burn**, and nothing removes what accumulates), in exact proportion to the oxidation heat: the same reaction event yields 190 kJ and 2 mol of H₂ per mol of zirconium, so the two cannot disagree. Generation inherits this node's limits — it stops at the melt endpoint (real accidents make most of their hydrogen during melt progression; ours cannot) and is zero on a covered core. The reaction is **never steam-starved**, and that is not a shortcut: 10 CFR 50 Appendix K requires exactly that — *"The reaction shall be assumed not to be steam limited."*

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

The simulation **ends at fuel damage**. Containment pressure, temperature, sump and hydrogen exist (§12.4d, §12.4e); there is no source term and no release (§13).

---

### 5.6 The metal has heat capacity too

Every one of the eleven primary control volumes carries the **mass of its own metal wall**, at the temperature that metal is actually at — not at the temperature of the water inside it. The pipe walls, the reactor vessel shell and heads, the core barrel, the steam-generator tubes and the pump casing are all in the ledger.

**Measured on this plant: the metal is 43 484 kJ/K against the coolant's 93 855 kJ/K — 46 % as much heat capacity as the water it contains.** That is not a correction; it is a third of the system's total stored heat.

**What it changes for you.** Heat you take out of the coolant during a cooldown comes partly back out of the steel, so a cooldown at a fixed dump duty takes **about 1.4× longer** than the water alone would suggest. A **scram is almost unaffected** — Tavg falls 0.4 % less over the first 30 seconds — and the reason is the thing worth carrying: a wall gives up its heat only as fast as heat can *conduct out of it*. A steam-generator tube is 0.05 in (1.27 mm) thick and answers in seconds. The reactor vessel shell is **4.5 in (114 mm)** thick and its own diffusion time is around **21 minutes**, so a 30-second transient reaches only its inner face while a two-hour cooldown reaches all of it. **The thicker the metal, the slower it argues with you, and the longer it keeps arguing.**

This is also why the plant does not go cold when the pumps stop. The wall-side heat-transfer film falls with flow, but it has a **natural-circulation floor** rather than going to zero — which is exactly the condition under which stored wall heat matters most.

**Trust class, and one thing to know.** The pipe and tube masses are derived from sourced wall-thickness data and the plant's own geometry (the implied tube-bore volume reproduces the model's steam-generator node to **0.015 %**, and nothing was fitted to make that happen). The **reactor vessel and internals are DERIVED ESTIMATES** — the vessel from a standard pressure-vessel thickness formula, the internals and supports from a flat engineering estimate — and they are the largest single term, about a quarter of the metal. Treat the vessel number as *Indicative* (§14.0). **The fuel and cladding are not part of this** — they are modelled separately (§5.5) and counting them here would double them.

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

Inventory is a **fraction** (1.0 = full), exposed as `core_inventory_pct`. The 1.2 ceiling
is a **numerical guard, not physics** — the plant arrests a solid fill at ~109.3 % on the
pressurizer geometry, well clear of it (§12.4c).

**Every flow runs on one real scale** (Rev 14 — this section previously described a
deliberate two-scale split with charging and letdown compressed ×0.012; the accident
re-clock retired it and this chapter had not caught up). Leaks, relief, ECCS, accumulators,
charging and letdown all move real fractions-per-second against the reactor coolant system's
own inventory. Real-plant flow comparisons are legitimate — the caveat that used to sit here
calling them a category error described the retired split.

The **charging and letdown ratings are not dialled in; they are derived** from the plant's
volume against Ginna's sourced rates, so they move when the geometry moves and there is no
second copy of them to drift. As built today:

| | rating | basis |
|---|---|---|
| Reactor coolant system volume | **857.9 ft³ (6,418 gal / 24.29 m³)** | the component ledger, 9.2 % of it unattributed and declared |
| Charging, maximum | **26.3 gpm** | Ginna's 180 gpm scaled by the volume ratio 0.1462 |
| Charging, normal balance | **6.7 gpm** | Ginna's 46 gpm, same ratio |
| Seal injection | **5 gpm** | unscaled — a per-pump rating, and this plant has one pump |
| Letdown, orifice A nominal | **11.7 gpm** | pressure-driven, see below |
| Auxiliary feedwater, both pumps | **86.2 gpm** | Ginna's 510 gpm scaled by power, 300/1,775 |

> **These are smaller than the figures Rev 16 and earlier quoted** (60 gpm charging, 30 gpm
> letdown, 100 gpm auxiliary feedwater), and the older numbers were the **retired** engine's —
> a different plant with a different declared volume. Nothing about the plant got weaker; the
> manual caught up with the plant the simulator runs.
>
> **Rev 19's own charging/letdown figures were themselves 14.6 % high** (30.1/7.7/12.7 gpm)
> *(#679, fixed 2026-09-10)*: the volume ratio divided our RCS volume, which **includes** the
> pressurizer, by Ginna's sourced 5,123 ft³, which its own UFSAR states **excludes** its
> pressurizer (ML20339A101). Fixed on a total-inventory basis — Ginna's pressurizer (747 ft³,
> from its Tech Spec Bases, ML20339A221) is now in the denominator too, so both sides carry
> theirs.

An uncompensated orifice-A drain still walks pressurizer level down about 15 points in roughly
five minutes.

**Letdown is pressure-driven, not commanded.** Two fixed orifices, each independently in or out; each passes flow proportional to √(cold-leg pressure − 300 psi (2.07 MPa) backpressure — the orifice discharges to the letdown heat exchanger and volume control tank, not to atmosphere). So letdown **tails off toward zero as the RCS depressurises on a cooldown** — it is not a constant you dial in.

**On shutdown cooling the orifices are not the letdown path at all.** With the residual heat removal (RHR) system in service, letdown runs through the **HCV-128 RHR-to-CVCS cross-connect**, which the model carries at the normal letdown magnitude — **11.7 gpm (0.74 kg/s)** — independently of the orifice lineup, so a **Mode 5, Cold Shutdown** plant with both orifices out is still letting down. Sourced: WTSM ch. 19 (ML11223A342), *"Coolant removal is accomplished by letdown, primarily from the residual heat removal system (RHR) … Letdown is via the RHR-to-CVCS cross-connect valve HCV-128"*, and *"While the plant is in this configuration, HCV-128 … is fully open … letdown flow via this piping is extremely low"*; NUREG-1431 Rev 4 Bases (ML12100A228), *"During LTOP MODES, the RHR System is operated for decay heat removal and low pressure letdown control."* The path closes with the RHR suction at **585 psig (4.03 MPa)** on a heatup, and the **17 %** low-level protective isolate stops it and the orifices together (**09** §3.0). Until 2026-09-04 the cross-connect was gated on the operator's orifice fraction, so shutting the orifices shut it too — and the cold plant then went solid on its own seal injection with a correct-looking shut lineup on the board: measured, **+10.2 points of pressurizer level and 363 → 385 psi (2.50 → 2.65 MPa) in 20 plant-minutes**.

**Charging in AUTO holds programmed pressurizer level**, reading the *indicated* level and the *indicated* Tavg through a 20-second damping filter. The program is sourced from the Westinghouse Technology Systems Manual §10.3 (ML11223A290), which derives its 61.5 % full-power endpoint from coolant thermal expansion alone between no-load and full-power Tavg — but that derivation is only *part* of this plant's mechanism. Measured across a full Mode 5, Cold Shutdown to Mode 1, At Power heatup: thermal expansion supplies 491 of the 754 kg (1,082 of 1,662 lbm) the pressurizer must gain to reach the programmed 61.5 %, and charging supplies the remaining 263 kg (579 lbm), automatically and with margin (peak demand 13.4 of 30.1 gpm available). The cause is geometry: this plant's loop-to-pressurizer volume ratio (4.82) is smaller than the anchor plant's (6.86), so the same expansion fills proportionally less of a proportionally larger vessel. The program and the *indicated* level still track together — so a heat-up raises level and setpoint together, and thermal expansion still can never read as a leak — but the level program is not a pure thermal-expansion line on this plant; it is expansion plus automatic charging (#680). A leak still makes itself up because it lowers the level; no leak detection is involved.

### 6.4 Emergency injection

**One merged HPI/LPI system on a dedicated ECCS pump train** (RWST-sourced — *not* the CVCS charging pump doing double duty). One command, one flag, a **two-segment pump curve**:

| Segment | Shutoff head | Character |
|---|---|---|
| High head | **1390 psi (9.58 MPa)** | Low flow, and it reaches its full **300 gpm** only below about **515 psi (3.55 MPa)**. **At the 2235 psi (15.41 MPa) operating point it delivers nothing at all** — its shutoff is 845 psi (5.83 MPa) below the plant it is meant to inject into, so a stuck-open PORV that holds pressure high keeps injection out |
| Low head | **215 psi (1.48 MPa)** | High flow — **1200 gpm** near atmospheric; dominates in a large LOCA, and only there |

**Accumulators** are passive, borated, and **finite**. They arm at **665 psia (4.58 MPa)** (the real core-flood-tank / SIT normal cover pressure, **650 psig** — WTSM T5.2-2; this manual set prints absolute, so the same number reads 665 psia) through a check valve in series with a motor-operated isolation valve, and they deplete as they inject. Their nitrogen cover-gas pressure is computed and indicated as the tank empties — but it is **indication only**: injection is gated on cold-leg pressure against the fixed arming setpoint.

**All emergency injection water is borated to 2500 ppm** and mixes into the core concentration, so ECCS injection adds negative reactivity — the shutdown-margin role of borated safety injection. It also enters at **104 °F (40 °C)**, removing sensible heat as it mixes (§5.4).

**RHR** takes suction from the **hot leg** through a valve on **two interlock setpoints**: it can only be opened below **440 psi (3.03 MPa)** — the sourced 425 psig — and **auto-closes** only once pressure climbs back above **600 psi (4.14 MPa)**, the sourced 585 psig. The ~200 psi (1.38 MPa) of deadband is prototypical (NUREG-0933 Issue 99: autoclose typically 600 psig against a block-open at 425 psig) and it is what stops the valve chattering on a plant hunting near the lower setpoint. It recirculates — hot leg → heat exchanger → cold leg — so it changes no inventory. Cooldown rate is throttled by the heat-exchanger flow split, and its sink temperature **moves with circulating-water temperature**, so warm circ water raises the floor a cooldown can reach.

**Shutdown cooling and low-head injection are the same pumps in two alignments, and you can only be in one.** The RHR pumps *are* the low-head half of the merged HPI/LPI system above. In the **injection** alignment they take suction from the refueling water tank and discharge to the cold legs, and their heat exchangers have **no cooling water** — WTSM 5.2 §5.2.4.5 (ML11223A220): *"Upon receipt of a safety injection actuation signal, the RHR pumps start and recirculate water through the **uncooled** RHR heat exchangers."* In the **shutdown-cooling** alignment they take hot-leg suction through valves 8701/8702 and their heat exchangers reject to circulating water. WTSM 5.1 §5.1.4.1 puts the two functions as *"independent of any engineered safety features function"*, and Ginna TS Bases B 3.5.3 has them actively interfering — being on shutdown cooling **degrades** the ECCS function. **So placing RHR in service is refused while safety injection is running**, and the board says why. Secure injection first. See §12.20 for what that refusal is and is not.

### 6.5 Two kinds of void, kept apart

| Void | Cause | Where it bites |
|---|---|---|
| **Inventory-driven** (`primary_void_fraction`) | Bulk reaches saturation as inventory is lost — post-scram, low power | The pressurizer saturation pull and the **TMI level deception** |
| **Flux-driven** (`core_void_fraction`) | Core exit passes saturation at full inventory — steam-line break, loss of flow at power | The **DNB heat-transfer collapse** |

These are separate states with separate calibrations on purpose. Combining them would let the flux term corrupt the TMI pressurizer deception.

---

## 7.0 Pressurizer

### 7.1 Pressure

Pressure comes out of a **two-region energy balance**, not an integrator with per-effect gains *(rewritten 2026-08-29, #584 — the "signed sum of effective coefficients" this paragraph used to describe is the retired engine's)*. The vessel carries a compressed-steam region over a stratified liquid: heater joules go into the bottom of the liquid, spray condenses into the steam space, the surge line exchanges mass and enthalpy with the hot leg, and pressure is whatever state that balance lands at — there is no pressure "gain" anywhere in it to tune. One calibrated constant governs the interface: a **30 s condensation/de-superheat time constant**, declared open and fitted to a single sourced case — Ginna UFSAR Table 15.2-1 Case 2's 5.4 s ride to the 2425 psi (16.72 MPa) trip, which the model runs in 5.9 s at τ = 30 s (§12.5).

Three behaviours are worth understanding at the board:

**A surge is a volume displacement, and the pressurizer does not know what caused it.** Coolant expanding or contracting with Tavg displaces liquid into or out of the pressurizer; so does gaining or losing RCS inventory, because a subcooled loop is incompressible everywhere else and the pressurizer is the only place with a free surface. Both drive the same term. What that means at the board: **a loss of inventory shows up on pressure and on subcooling margin, not only on pressurizer level** — and make-up or safety injection pushes all three back the other way. Until 2026-08-04 only the thermal driver was modelled, so a leak that emptied the pressurizer and scrammed the plant moved pressure 5 psi (0.034 MPa) and subcooling 0.2 °F (0.1 °C).

**Spray cannot pull below core-exit saturation.** Its authority tapers to zero across a 435 psi (3 MPa) band above the saturation pressure of the *hot leg*. Below that the core exit flashes and boiling — not pressure control — takes over. This is self-limiting: on a real cooldown the hot leg falls too, so the floor tracks down and spray keeps working.

**Spray is capacity-limited to 12 % of full flow.** It is sized for step insurges, not for a loss-of-heat-sink repressurisation. A TMI-style heat-up **outruns the spray and lifts the PORV** — as it must.

**A raised pressure setpoint slews; a lowered one takes effect at once.** Heating a large subcooled pressurizer to a higher saturation point takes time regardless of heater margin, so the effective target walks up at 3 psi (0.02 MPa)/s (a full cold-to-NOP pressurization ≈ 11 simulated minutes). Depressurisation is spray- and cooling-limited on its own and needs no slew.

**The heaters sit low in the vessel and lose authority as the level falls past them.** The bank occupies a band from about **5 % to 15 % level**, and delivered heat scales with the fraction of that band under water — half covered, half the heat; below the bank, none. The elevation itself is sourced (the heaters are *"direct-immersion, tubular-sheath type … located in the lower portion of the pressurizer vessel"*); the two percentages are this plant's own estimate, derived from its vessel volume on a tall-and-slender shape, and are **unverified** — no reference in the source set gives a bundle length or a vessel height. What they *are* pinned to is an ordering: the band sits entirely below the 17 % heater cutoff, because that cutoff exists to de-energize the bank **before** it uncovers.

The band is therefore unreachable on a healthy plant, and that is the point of it. It becomes the only thing bounding the damage when **the level channel lies** — a stuck transmitter fools the cutoff exactly as it fools the operator, the bank stays energized in steam, and the heater indication keeps reading full because it reads electrical power. See `03_CONTROLS_AND_INDICATIONS.md` §5.2.

### 7.2 Saturation pinning

When the primary voids, **or** whenever the saturation pressure of Tavg exceeds actual pressure, the model switches regimes: pressure is **pulled to Psat(Tavg)** rather than allowed to fall below it. A liquid cannot superheat, and a model that let pressure crash below saturation would report impossible negative subcooling.

The consequence for the operator is the important part: **in the saturated regime you depressurise by cooling, not by spraying.**

**With a loop break open, the pin weakens and the blowdown carries on toward the building (Rev 13).** The pin models closed-system flashing — steam made by the flash holds pressure at saturation. A hole in the loop lets that steam *leave*, so as void grows the pin loses authority and a vent term carries pressure past Psat toward the **live containment backpressure**: on a full-size break the RCS now bottoms near the building pressure instead of flooring at the saturation pressure of the hot remnant, which is the real blowdown shape — "the pressure has equalized with the pressure inside the containment. At this time the blowdown phase … has ended" (WTSM 5.0 §5.0.1.1). Two boundaries are deliberate: the RCS can never be pulled *below* the building it discharges into (connected volumes equalize, they do not cross), and the weakening is **path-scoped** — a stuck-open relief valve is not a loop hole (its discharge is the valve's own metered flow, so the TMI erosion keeps the full pin), and a tube rupture discharges into the steam generator, not the containment. Steam-space breaks and no-break boiling behave exactly as before. What remains declared rather than modeled: injection has no transport delay, so full equalization with the building and a prolonged core uncovery cannot both occur — the model keeps the uncovery (the accident arc the simulator teaches) and accepted a blowdown floor a little above the building. **That residual has since closed** (re-measured 2026-08-08 during the #425 containment work, before and after it, both the same): the full-size break now bottoms at 14.8 psi (0.102 MPa) absolute against a 14.7 psi (0.101 MPa) building — equalization within a fraction of a psi, with the uncovery arc intact. The floor declared at Rev 13 as "116 psi (0.80 MPa)" belongs to the plant of that date; the #385 pressurizer-node and #408 real-flow work closed it in passing.

### 7.3 Level is a liquid VOLUME, held on a charging programme

*(rewritten 2026-09-18, #708, against the shipped engine. Everything this subsection said before
belonged to the RETIRED engine's inventory node — `pzr_mass_frac` as a driver, and the calibration
constants `level_per_mass` 776, `level_per_void` 375.33 and `level_per_tavg` 1.62. **This plant has
none of them**, so the load-ramp figures, the void arithmetic and the surge-line split have all been
re-measured or struck. The #677 stale-content banner that stood here is replaced by the pass it
asked for. Every figure below was taken with `test/measure_stack.js --plant=pwr2` — full stack
(M4 + M5 + M6), free-play lineup, 10 plant-minutes of settle, seed 4242.)*

**There is no level calibration on this plant.** The gauge reads `100 × V_liq / V_pzr` — the liquid
actually standing in the 147.5 ft³ (4.176 m³) vessel, over the vessel's volume. Level therefore
falls straight out of the two-region state §7.1 solves for pressure: each region's volume is its
mass over its density at the solved pressure, and the *slack* the regions no longer fill is the
surge. Nothing converts a temperature, a void fraction or a mass fraction into points of level
through a slope, because there is no slope to convert with — **the equation of state is the
calibration.** `pzr_mass_frac` survives as an indication (the vessel's share of total primary mass,
**0.1034** measured at full power), but here it is an *output* of that solve, never an input to it.

The lesson that carries over from the old mechanism unchanged: **level is a volume, and a volume is
not an inventory.** What changed is that it is now a volume by construction rather than by
calibration.

**The programme, and the ladder round it.** Charging holds level on a programme **linear in Tavg**,
from **25 %** at the no-load Tavg of 547.0 °F (286.11 °C) to **61.5 %** at this plant's full-power
Tavg of 580.1 °F (304.5 °C). The two percentages are sourced (Westinghouse Technology Systems
Manual §10.3, ML11223A290); the two temperatures are this plant's own. A proportional-plus-integral
controller compares the *indicated* level against that programme and varies charging demand —
letdown is a constant in the lineup the source describes, so inventory is trimmed by charging alone
(§6.3). The programme reference itself runs through a **25 s lag**: it stands for the thermal
expansion of the whole coolant mass, which cannot follow an RTD's noise, and without it the
charging controller chased instrument noise across a large part of its range at steady full power —
which is what *"charging in AUTO doesn't hold the pressurizer level"* looks like from the board.
(`engines/pwr2/pwr2_pressurizer.js` records that trade and flags that its own figures were taken at
a pre-#645 programme slope, so read them as the shape, not as this plant's current numbers.)

Measured at each end, from its own initial condition:

| initial condition | Tavg | programme | level |
|---|---|---|---|
| `hot_full_power`, 100 MWe | 580.3 °F (304.6 °C) | 61.50 % | **61.5 %** |
| `low_power`, 10 MWe | 550.3 °F (287.9 °C) | 28.7 % | **28.7 %** |
| `hot_zero_power`, 0 MWe | 547.3 °F (286.3 °C) | 25.3 % | **25.3 %** |

**The programme clamps at 25 % and never goes below it** — which matters, because Tavg *can*: see
the load ramp below.

The ladder around the programme is sourced (§10.3.4 of the same manual) and every step is in the
engine (**09** §3.0):

| level | what it does |
|---|---|
| **programme + 5 %** | backup heaters energize — anticipatory, because the insurge water is colder and will drop pressure |
| **70 %** | high-level alarm |
| **87 %** | **high pressurizer level reactor trip** — Ginna's 650 ft³ point, at-power only, 2.0 s delay |
| **17 %** | letdown isolates **and every heater is cut**. It does not restore itself: the latch clears above 20 %, but an orifice must be re-selected by hand |

**RAISING LOAD IS A PRESSURIZER TRANSIENT, and that is why the load dial ramps UP (#624).** Raise
turbine load and the steam generator draws more heat, Tavg falls, the loop contracts, and the
difference comes *out* of the pressurizer. Charging can answer it — at **26.3 gpm** against an
**11.7 gpm** letdown lineup (§6.3) — but only at charging's rate, so what decides whether the plant
stays on programme is how fast the disturbance arrives, not how good the level controller is.

Measured on the shipped plant from `low_power` (10 MWe on the grid — the state the startup
checklist hands you), dialling **30 MWe** with the rods left in MANUAL where the free-play lineup
puts them, on the sourced **5 %/min** raise ramp (**09** §10.0) — **5 MWe/min**, so four minutes to
deliver:

| | |
|---|---|
| **Tavg** | 550.3 °F (287.9 °C) → **534.9 °F (279.4 °C)** at 4 min 40 s, a **15.4 °F (8.6 °C)** swing, settling at 536.0 °F (280.0 °C) |
| **level** | 28.7 % → **21.7 %** at 4 min (**21.5 %** indicated) — **4.7 points clear of the 17 % cut** |
| **recovery** | back on programme within about **10 minutes**, and flat there for the next two hours |

**And the programme it returns to is its 25 % floor, not the 28.7 % it left.** With the rods in
MANUAL the reactor answers the load through moderator feedback alone, so Tavg settles about 11 °F (6.1 °C)
*below* the no-load anchor the programme is drawn from and the programme sits on its clamp.
That is the honest reading of a part-load plant on this lineup; it is not a level fault.

The lesson is the Tier A one and it is not about the controller: **an operator cannot step load up
on a real machine, and a plant that let them made a first-order coupling look like a broken level
loop.** Before the ramp existed the same 20 MWe delivered instantly took true level to **16.92 %**,
through the cut; the ramp-rate series taken with it — 30 %/min still at the cut, 10 %/min 18.29 %,
5 %/min 21.52 %, 2.5 %/min 22.92 % — is recorded in `engines/pwr2/pwr2_shell.js` (#624,
2026-09-04, this engine). The sourced rate is the slowest of them that keeps any margin at all.

**LOWERING load runs the same coupling backwards, which is why it is NOT ramped.** Less steam
drawn, Tavg rises, the loop expands, and the pressurizer **swells** — toward the 87 % high-level
trip, which no dispatch move approaches. There is nothing for a rate limit to protect, and there is
something to lose: the **C-7** loss-of-load steam dump arms on a decrease *faster than 5 %/min*
(**09** §3.0), the same number as the raise ramp, so a symmetric limiter would put the dial exactly
on the interlock's threshold and the operator could never produce the loss-of-load transient at all.
It was built symmetric first and measured, 100 MWe to 0: an instant cut takes the C-7 rate signal to
**49.99 %/min** and arms; a 5 %/min walk converges on **4.999773 %/min** against a strict
*greater-than* and never arms. Reductions are therefore instantaneous, and both routes to the graded
ride-out — the dial and **UNLOAD** — stay live.

**THE THREE MILE ISLAND DECEPTION IS STILL HERE, and on this plant the gauge PEGS.** It is no
longer arithmetic: when the loop saturates its fluid expands — the same mass occupies more volume —
and the only free surface in the system is the pressurizer, so liquid is pushed up the surge line.
No calibrated void slope is involved and none exists. The deception is what the equation of state
does once you take the subcooling away.

Measured from `hot_full_power` with the PORV opened by hand and left open — TMI-2's own
configuration, a discharge out of the pressurizer *steam space* — at 10× so protection is evaluated
every second:

| time | level | core inventory | void fraction | subcooling |
|---|---|---|---|---|
| 0 s | 61.4 % | 100.0 % | 0 | 42.5 °F (23.6 °C) |
| 1 min 31 s | **41.9 %** — the bottom | 98.7 % | 0 | 28.5 °F (15.85 °C) |
| 2 min 31 s | 59.0 % | 98.4 % | 0 | **0.7 °F (0.4 °C)** |
| 3 min 30 s | **100 %** | 98.3 % | 0.138 | 0 |
| 20 min | **100 %** | **83.2 %** | 0.294 | 0 |

Read the first two rows against the last three. While the loop is subcooled the gauge does what you
expect — inventory falls, level falls. The moment subcooling reaches zero the gauge reverses,
climbs to **full**, and then **stays pegged at 100 % for the next sixteen minutes while the plant
loses another fifteen points of inventory.** The retired engine expressed this as a net slope of
roughly +350 % of level per inventory fraction lost; this one does not express it as a slope at all
— it simply runs out of gauge.

**Indicated level rises while inventory falls, and nowhere outside the saturated regime does it do
that.** The gauge is not lying. It is telling the truth about a quantity that has stopped meaning
what you think it means — and the indication that told the truth the whole way through is in the
last column: **subcooling margin reached zero before the level ever turned.**

**It does not need a break at all.** Measured on a station blackout with auxiliary feedwater failed
— no break anywhere — level pegs at **100 %** from 1 h 15 min and holds there while core inventory
falls from 93 % to **28 %** and the core uncovers completely.

**A hole in the LOOP does the opposite, and there is no partial lift on this plant.** The retired
engine divided each displacement between the surge line and the hole by their admittances
(WCAP-16009-NP-A §11-4-5) and so gave a small loop break a partial lift; PWR2 has no such split — a
loop break takes mass out of the loop nodes and the pressurizer answers through the shared volume
solve. Measured from `hot_full_power`, cold-leg breaks of three sizes:

| break area | what the gauge does |
|---|---|
| **0.002 m²** (the failure panel's large LOCA) | **0.05 % at 21 s, 0 by 1 min 21 s** — and empty for the rest of the ride while inventory falls to 17 % |
| **2 × 10⁻⁴ m²** | **0 by 2 minutes**, empty while inventory falls to 28 % |
| **2 × 10⁻⁵ m²** (severity 0.01 on the leak scale) | walks down *with* inventory — 61.4 % → 14.3 % in 12 minutes and on to empty — no lift, and no void forms at all |

So on this plant the deception belongs to the paths TMI-2 actually had: **a discharge out of the
pressurizer steam space, or a loop that boils with no break in it.** A hole in the loop empties the
gauge. The direction and the lesson are the sourced ones — *"the potential exists, under certain
accident or transient conditions, to have a water level in the pressurizer simultaneously with the
reactor vessel not full of water"* (IE Bulletin 79-06A, April 1979, the same bulletin that ordered
safety injection actuated on pressure *"regardless of the pressurizer level"*, and whose July
supplement 79-06C describes the running-pump small-break regime this simulator's sweeps ride). The
magnitudes are this plant's own. **Do not read the partial-lift behaviour the previous revision
described off this plant — it is not here.**

### 7.4 Relief valves and the tailpipe

| Valve | Opens | Closes / reseats |
|---|---|---|
| **PORV** | pressure setpoint **+100 psi (0.69 MPa)** — **2335 psi (16.099 MPa)** at the 2235 psi (15.41 MPa) nominal | **+85 psi (0.586 MPa)** — **2320 psi (15.996 MPa)** at nominal |
| **Spring safeties** | **2500 psi (17.24 MPa)** — the 2485 psig nominal | **2375 psi (16.375 MPa)** — 5 % below, the sourced reseat fraction |

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
| **Steam-pressure mode** | Modulates to hold the steam header on the **Dump SP** — this plant's no-load anchor, **1020 psi (7.03 MPa)** (**09** §3.0). This is the heatup / cooldown / hot-standby mode, and the only mode in which the setpoint box is read |
| **Tavg mode** | The at-power program: the dumps are shut on programme and open on the Tavg error above the no-load reference, which is what catches a load rejection or a turbine trip (**armed**, below) |
| **Fast Tavg-error mode** (**armed**, inside Tavg mode) | On a turbine trip, or a load rejection past the arm, drives open on Tavg error immediately |

**The two modes are EXCLUSIVE, and the operator selects one — pressure mode is not "always".** One AUTO button does the selecting and **the turbine latch decides which mode it gives you**: tripped → steam-pressure, on line → Tavg. Sourced: WTSM §11.2 (ML11223A294), *"Tavg mode at power, steam pressure mode at hot standby / startup / cooldown"*; the trip relay (C-8) is the same signal the plant already uses to auto-select the turbine-trip controller *inside* Tavg mode, so the operator's selector rides the latch the source rides. **Why it matters — and the ordering that used to be the reason has INVERTED, re-measured 2026-09-08 (#646).** Tavg mode's turbine-trip controller opens on the error above the no-load reference, and that reference moved to **547 °F (286.11 °C)** when the plant re-anchored to Ginna's own programmed no-load average coolant temperature (#508, #645). It now sits **4.2 °F (2.3 °C) *below*** the atmospheric dump valve's 1040 psig (7.17 MPa) relief point, which saturates at **551.2 °F (288.4 °C)** — where before the re-anchor it sat 5.9 °F (3.3 °C) *above* it. Measured on the **PWR-N01** heatup itself, cold plant to Mode 3, Hot Standby plus two plant-hours of hands-off park, advancing at the player's own pace:

| Steam dump lineup on the heatup | Parks at | Steam header | ATMOS DUMP | Condenser dumps | Vented to atmosphere, 2 h |
|---|---|---|---|---|---|
| Steam-pressure mode — what **AUTO** gives you with the turbine tripped | 547.2 °F (286.2 °C) | 1005 psig (7.03 MPa) | **shut** | 0–3.4 % | **0 lbm** |
| Tavg mode | 547.4 °F (286.3 °C) | 1006 psig (7.04 MPa) | **shut** | 0.1–2.5 % | **0 lbm** |
| Never selected — the cold plant's own boot lineup | 551.6 °F (288.7 °C) | 1042 psig (7.29 MPa) | **8.1 %** | 0 % | **11,005 lbm (4,992 kg)** |

So *"Tavg mode is a dump that never opens on a heating plant"* is no longer true of this plant: **both** modes hold the heatup off the atmospheric valve, and they park within **0.2 °F (0.1 °C)** of each other. What actually vents to the sky is a dump that was never put in service at all — which is exactly what the cold initial condition boots (`dump_mode` **off**), and what the old unconditional AUTO → Tavg mapping was indistinguishable from, because below 557 °F that controller had no output.

**Steam-pressure mode is still what AUTO selects on a tripped turbine — for the sourced reason, not that one.** WTSM §11.2 assigns the modes that way, and pressure mode is the **only** mode that reads the **Dump SP** box: walking that setpoint down is how a cooldown is driven, and Tavg mode has no setpoint to walk — it would hold the plant on the no-load knot and nothing else. Before #629 the box was an orphan on every plant a player produced rather than loaded. **PWR-N01** step 8b is where the selection happens.

> **⚠ THE CAPACITY AND REJECTION FIGURES IN THE REST OF THIS SECTION ARE THE RETIRED ENGINE'S AND HAVE NOT BEEN RE-MEASURED.** The shipped plant's dump capacity is **28 % of rated steam flow** — Ginna's own, sourced, and the number **09** §3.0 prints — not the 40 % below. Read the rejection ladder as the shape of the event, not as this plant's percentages. *(Noted 2026-09-05 while correcting the mode table above, #629; re-measuring the ladder is separate work.)*

Capacity is **40 % of rated steam flow** — the prototypical Westinghouse value, sized for a **50 % loss of load**: 40 % into the condenser plus roughly a 10 % reduction from the reactor itself. Measured on this plant, a 100 → 50 MWe rejection saturates the dump at 40 % and runs the core back toward the 50 % the secondary is asking for, with no trip and nothing lifting. (An earlier revision said the core 'settles at 89.3 %' — that figure was taken with rod control in manual, a lineup the shipped plant does not use.)

Past that the dump is at its stop and the reactor has to shed the difference. A **full** load rejection from 100 % still does not scram, but the ladder runs: dump saturated, core running back to ~46 % on moderator feedback, average coolant temperature peaking near **608 °F (320 °C)**, the **PORV lifting** at 2350 psi (16.20 MPa) as the designed backstop, and the steam generator safeties just reaching their setpoint. A real plant of this class does not ride out a full rejection either — its design case is 50 % — so this is the plant telling you the truth about where its margins end.

Capacity is also exactly what **cannot** save a loss-of-feed event, where the drying steam generator stops absorbing heat no matter what the dump vents.

The fast mode's reference Tavg is **programmed on turbine load** — the same sliding program the rod controller uses — so the two cannot drift apart.

> **WARNING — a declared, deliberate cliff, and since Rev 14 it is a THERMAL cliff.** The fast mode arms on a **rate**: a step load rejection must exceed **40 MWe**, or a ramp must exceed roughly 40 MWe/min. On the Rev 14 plant the steam generator's liquid soaks a sub-threshold rejection slowly enough that pressurizer spray keeps up, so the excursion is carried by **temperature**, not pressure — measured: a **39 MWe rejection does not arm** and Tavg runs to 600.1 °F (315.6 °C) hands-off, roughly **20 °F past program**, with pressure held 95.7 psi (0.66 MPa) clear of the PORV; **41 MWe arms and is caught** at 582.4 °F (305.8 °C) on program. Your cue is the **Tavg/Tref deviation**, not a relief lift. (Pre-Rev-14, the compressed secondary bottled in seconds and the uncaught side ran to the PORV setpoint — that was the clock's rendering, and older screenshots will show it.) **Rod control in AUTO does not absorb the excursion**: engaging it still climbs ~15 °F past program (593.2 °F / 311.8 °C measured), and its 39 MWe cut undershoots ~15 points deeper than a caught 41 MWe cut — the smaller upset is still the worse plant. (The shipped lineup has the rods in **MANUAL** — see `03` §14.3.) The arm is also **blind to staircases** — 60 MWe delivered as four 15 MWe steps never arms at all.
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

**AFW is rated at 86.2 gpm** for both pumps together — Ginna's sourced 510 gpm (one 170 gpm motor-driven pump plus a turbine-driven pump at twice that) scaled by power, 300/1,775. (Through Rev 16 this read "15 % of rated feed capacity", which was the retired engine's normalisation against a different plant's feed rating.) It auto-starts on the **17 % low-low** narrow-range level — the same signal that trips the reactor (single-signal, as in the real plant; #380 retired the 3-point offset this plant used to carry). It **latches**: the pump demand has no reset and stands until the operator secures it, as in a real plant. Delivery is capacity × **operator throttle** — the flow control valves, one set downstream of both pumps.

**Where the level hold lives differs between the two engines, and it matters.** The retired engine holds level *inside* the steam generator model — a built-in proportional taper, full flow below 32 %, shut by 40 %, which the operator cannot leave. **The current plant holds it in the control layer instead**, as the `afw_level` automation channel: full flow below **28 %** of narrow range, tapering shut by **38 %**, about a sourced target of **33 ± 5 %** (Westinghouse Technology Systems Manual §19.0, ML11223A342 — *"maintain steam generator levels at 33 ± 5 % narrow-range level indication … by throttling"*). The difference is the point: **you can take that channel to MANUAL and throttle by hand**, which is what a real operator does — *"it is necessary to throttle AFW flow to control RCS temperature at this point"* (WAT 05 Transients, ML11216A094). Either way the hold senses **the level instrument** — so a failed level sensor fools the AFW regulator exactly as it fools you.

**And the generator has a top.** Above the top of the narrow range the separators stop keeping up and the export starts carrying liquid into the steam lines; by the top of the wide range the shell is water-solid and passes whatever is fed to it. Carryover is what turns unthrottled aux feed into an *"excessive cooldown of the primary system"* (R.E. Ginna Technical Specification Bases, ML20339A221), and the **high-high level turbine trip at 90 % narrow range** gets the machine off the line before the water arrives (Westinghouse Technology Systems Manual §3.2, ML11223A213). Measured with the valves left wide open through a loss of offsite power: the generator pins at **245 %** of its nominal inventory and the primary cools **190 °F (105.6 °C)** in five hours.

**Feedwater carries enthalpy.** The heat crossing the tube bundle first raises feed to saturation, then boils it — so overfeeding cools the generator and drops its pressure (the classic overcooling signature, with a small power rise on moderator feedback), and cold auxiliary feedwater is a **genuine heat sink**: at decay-heat levels, full AFW flow absorbs more heat than crosses the tubes, steam generation stops, and the plant is pulled below the no-load anchor until the level hold throttles the flow back. Main feed is modelled at a **constant final feed temperature of 435.2 °F (224 °C)** — since Rev 14 the top of the R.E. Ginna UFSAR's sourced 390–435 °F final-feed band (the earlier 440.6 °F sat just above it) — and the regenerative heater train is still not modelled, so feed temperature does not fall at part load (declared, §12.16).

> **Where that sentence stops being true: 363 psi (2.50 MPa).** "Raises feed to saturation, then boils it" assumes the feed is *colder* than the shell. Saturated water at 363 psia is 435.2 °F — exactly the modelled feed temperature — so **below that steam-generator pressure the constant-temperature main feed is the hotter stream and adds heat instead of absorbing it.** It is small and short-lived (§12.16 measures 0.7–2.6 MJ over about two minutes on a fast secondary blowdown, peaking at 120 kW), because the level controller shuts the regulating valve as the generator empties. Auxiliary feedwater is unaffected — it arrives at ~70 °F condensate-storage-tank temperature and is a heat sink at every pressure. Below 363 psia, read the heat sink as **AFW**, not main feed.

**AFW pumps can run against a shut discharge valve.** When they do, discharge pressure sits at **shutoff head, 1204 psia (8.3 MPa)** rather than at the generator pressure they feed. That distinction is the tell separating "AFW blocked" from "AFW not started" — and it is the TMI-2 pumps-running/valves-shut condition. **It is not only a casualty picture**: the level controller throttles the flow control valve shut whenever the narrow-range level sits above its 33 ± 5 % band, so an ordinary post-trip ride with the pumps started early spends a large fraction of its time here — measured 496.6 s of the first 1100 s. A delivering pump reads the generator pressure itself: this plant has no pump head-flow curve (§12.16), so the gauge models the two **ends** of the curve, shutoff and the injection point, with no line drawn between them and no discharge margin added. The shutoff head itself is **unverified** — no auxiliary-feedwater pump curve or shutoff figure appears in the source corpus.

### 8.5 The MSIV and SG safeties

**SG code safeties are upstream of the MSIV** (pop 1099 psi (7.58 MPa), reseat 1063 psi (7.33 MPa)), above the 1020 psi (7.03 MPa) dump setpoint. They are the relief that remains when the generator is bottled — and they are **self-actuating spring valves**: the pop and reseat act on the steam pressure itself, not on an instrument channel, so a failed steam-pressure transmitter changes what the gauge reads, never whether the valves lift.

**The steam lines isolate automatically on a break.** High steam flow **coincident with** low steam pressure shuts the MSIV without any operator action — measured on the current plant, a large break isolates **within a few seconds** (+2 to +3 s on a full- or 80 %-area break). The low-pressure leg is **rate-compensated**, as the real 600 psig channel is ("rate sensitive" — a lead/lag unit ahead of the bistable): on a fast blowdown the compensated signal crosses the 600 psi (4.14 MPa) setpoint while raw pressure is still far above it, in proportion to how fast it is falling. The generator then bottles up and recovers toward thermal equilibrium with the primary instead of blowing down. It takes both signals together: a cooldown drives steam pressure far below the setpoint and does *not* isolate, because flow stays low — and its steps are slow, so the rate compensation adds almost nothing; a bottled generator pegs the flow transmitter through its own safeties and does *not* isolate, because pressure is high. **You cannot reopen the valve while the isolation is sealed in** — the board refuses it until the generator has re-pressurized, at which point reopening becomes your deliberate call on a plant you can see has recovered.

The isolation **cannot tell where the break is**, and neither can a real one: it fires identically on an upstream break, where shutting the valve changes nothing because the break is on the generator's side of it. **There is NO containment-pressure leg on this plant** *(corrected 2026-09-18, #672 — the third isolation path this paragraph used to claim was built in the retired engine and never travelled)*: nothing anywhere reads the building's pressure, so a break inside containment that never spikes steam flow isolates nothing. Proved by injection — on a large LOCA the building passes the sourced 30 psig high-high at about two and a half minutes and `msiv_open` never moves (§12.17). Two parts of the real function remain declared: the steam-flow setpoint is fixed where a real one is programmed on turbine load, which means this plant under-protects at low load (§12.19); and **the flow/pressure coincidence above is not reachable from the failure panel**, because this engine has no steam-line break to produce it (`engines/pwr2/pwr2_shell.js` refuses both `secondary_depressurize` verbs with *"no steam-line break model yet"*). ⚠ **The isolation timings in the paragraph above were measured on the retired engine and have NOT been re-measured here** — and **09** §3.0, which has been re-measured against this one, records main steam line isolation as NOT MODELLED on every signal. Treat the automatic isolation as unverified until that disagreement is settled; the valve itself is real and closes when you close it.

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

### 10.5 Shrink and swell — NOT MODELLED

**This plant does not model shrink and swell**, and the reason is structural rather than an
omission: the steam generator is a single lumped shell with **no recirculation ratio, no
downcomer and no separator** (§8.1). Swell is a *downcomer* measurement artefact — the level tap
reads a column whose density changes when boiling rate changes — and with no downcomer there is
nothing to produce it.

On a real unit this is one of the things that makes feedwater control hard: a load increase
raises steam flow *and* momentarily raises indicated level, so the level signal argues for LESS
feed at the moment more is needed, and the control system is built to ignore it for a few seconds.
Here, indicated level moves only when the shell's mass moves.

**One consequence is worth knowing**, because it shows up in the feed controller: that controller
carries a sourced five-second lag on its level input whose stated purpose is to ride out swell
(WAT 05 §5.3.2). On this plant it is guarding against something that cannot happen. Measured
during #590, removing it changes the loop's behaviour by about **5 %** — it is nearly inert, and
it is kept because the controller's *structure* is the sourced one.

### 10.6 Log-scale nuclear instruments

Source range (counts/s) and intermediate range (chamber amps) carry their lag and noise **in the log domain**, so a decade of lag is a decade at any level and noise sigma is in decades. Source range reads zero when its high voltage is de-energised.

### 10.7 RCS loop flow — and why the trip that reads it changed

Until 2026-07-29 the **low-flow reactor trip read true flow**, because no flow instrument had ever been built. It was the last exception in the plant, and it meant the single most safety-significant trip could not lag, could not drift, and could not be fooled — so it could not be *taught*. It now reads `loop_flow`, an ordinary instrument with lag and injectable failures, and **there is no exception left**: every trip and actuation on this plant reads an indication.

**RCS Loop Flow** is modelled on the real measurement: **elbow taps** on the crossover-leg 90° elbow, reading the differential pressure between the inner and outer radius of the bend, with ΔP ∝ flow². Nothing is inserted into the flow path. Real accuracy figures for this channel are ±10 % absolute, with trip-point repeatability around ±1 %.

The **setpoint is 87 % of rated, blocked below P-7 (8 % power)**. Measured on this plant, an RCP trip from full power: indicated flow crosses the setpoint at **3.7 s**, the trip fires at **4.6 s** on the sourced one-second delay, and the core **never voids at all** — peak void fraction **0.000**, indicated subcooling bottoming at **38.4 °F (21.3 °C)**. The trip does its job with margin to spare, which is the un-dramatic answer and the true one.

**One departure remains, and it is deliberate: this plant has ONE flow channel**, where a real Westinghouse unit has **three detectors per loop and trips on 2-of-3**. That follows from the plant being single-loop and from every other protection function here being single-channel too — but be clear about what it costs, because it is the thing this event is built to teach:

> A **stuck-high flow transmitter defeats the low-flow trip completely.** Measured with the channel frozen at 100 % and the pump tripped: **RCS Flow - Low never actuates at all**, and what stops the event is **Overpower ΔT at 8.5 s** — a different channel, a different instrument, catching the *consequence* rather than the cause. 2-of-3 coincidence exists precisely to stop one lying transmitter from doing this.
>
> **Note what this plant does NOT do**, because the difference is the point: the core still does not void (peak 0.000) and peak fuel reaches **1292 °F (700 °C)**, far below any damage threshold. The ΔT protection is fast enough here that a lying flow channel costs about four seconds and a different trip, not a damaged core. On a plant with weaker ΔT protection the same lie is far more expensive.

*(These two figures are read from the protection layer directly, which is where the trip logic lives; the board's own channels are published through the reused instrument layer and are one step removed from them.)*
### 10.8 Pressurizer pressure is ONE channel too — and its two failure directions do opposite things

**DECLARED SIMPLIFICATION** *(OWNER RULING, 2026-09-19: "2: declared simplification")*. **This plant carries one pressurizer-pressure channel.** A real Westinghouse unit separates the *controlling* channel from the *protection* channels and acts on coincidence, so one lying transmitter can neither cause nor defeat a protective action:

> "The same sensors (PT-429, PT-430, and PT-431) provide input to the Pressurizer Pressure-High and -Low trips and the Overtemperature ΔT trip with the exception that the Pressurizer Pressure-Low and Overtemperature ΔT trips also receive input from PT-449. Since the Pressurizer Pressure channels are also used for other control functions, **the actuation logic must be able to withstand an input failure to the control system**, which may then require the protection function actuation, and a single failure in the other channels providing the protection function actuation." — Ginna Technical Specification Bases B 3.3.1 (ML20339A221); the Pressurizer Pressure-Low LCO requires **four** channels.

The training manual for the same failure makes the separation visible: on a real unit the controlling channel failing high sends the *control* system to maximum spray while "the decreasing pressure on **the three 'good' channels** is lowering the Overtemperature ΔT trip and runback setpoints" — the protection keeps telling the truth and eventually trips the plant (Westinghouse Technology Advanced Manual, WAT 05 *Transients*, ML11216A094, Transient 5.41, *Controlling Pressurizer Pressure Channel Fails High*, p. 5-131).

**Here there is no second channel to be right.** This is the same departure §10.7 declares for RCS loop flow, and it is the wider one, because more hangs off this channel than any other on the board:

| What reads the pressurizer-pressure channel | What it does |
|---|---|
| Heater and spray proportional ladder | Holds pressure on the operator's setpoint |
| **PORV automatic lift**, at setpoint **+100 psi (+0.69 MPa)** | The first stage of the relief ladder (§7.4) |
| **Pressurizer Pressure — High** reactor trip | Trips the reactor |
| **Pressurizer Pressure — Low** reactor trip | Trips the reactor |
| **Safety injection on low pressurizer pressure** | Starts injection; sheds the pressurizer heaters |
| The pressure term of the **Overtemperature ΔT** setpoint | Biases a different trip |

Indicated subcooling margin inherits it as well (§10.2).

**What this does NOT reach: the code safety valves.** They read **true** pressure unconditionally and lift at **2485 psig (2500 psia / 17.24 MPa)**, with no isolation and no operator lever (§7.4, §11.0). **A lying pressure channel costs this plant the FIRST stage of its relief ladder — not its overpressure protection.**

#### What each failure direction actually costs

Measured 2026-09-19, full stack (control, service and instructor layers), initial condition *hot full power*, instrument seed 7, sampled every 0.5 s. The event is the sourced overpressure case — a complete loss of steam load with **no** anticipatory reactor trip (Ginna UFSAR ch15 §15.2.2): turbine tripped, main feedwater lost, steam dump closed, the turbine-trip reactor trip failed.

| Pressure channel | PORV lifts? | High-pressure reactor trip? | Code safeties? | Peak TRUE pressure |
|---|---|---|---|---|
| **Healthy** | yes, at **4.0 s**, then cycles | no — the PORV holds pressure below it | never lift | **2357 psia (16.25 MPa)** at 4.0 s |
| **Dead** (rails to zero) | no | — the plant already tripped at **2.0 s** on pressurizer pressure **LOW** | never lift | **2304 psia (15.89 MPa)** at 4.0 s |
| **Stuck** at its healthy 2237 psia (15.43 MPa) | **no** | **no** | **lift at 7.5 s**, and again at 11 s | **2497 psia (17.22 MPa)** at 16.0 s |

**The two failure directions are not symmetric, and that is the lesson.** A channel that fails **low** is fail-safe on this plant: measured on an otherwise healthy plant at full power with no other fault, a dead pressurizer-pressure channel **trips the reactor at 2.0 s** on pressurizer pressure low, actuates **safety injection**, and **sheds the pressurizer heaters** — before anything else has happened. What the operator gets is a violent, obvious and entirely spurious event.

A channel **stuck at a plausible number** is the expensive one. Nothing annunciates, the gauge reads normal, and the two automatic actions that would have answered the transient — the PORV lift and the high-pressure reactor trip — are both blind, because they are the same channel. The plant rides **140 psi (0.965 MPa)** higher than it otherwise would and parks on its code safeties. That is where a single-channel design ends up when its single channel lies, and it is exactly the single failure the Technical Specification Bases quoted above requires a real plant's logic to withstand.

#### What the player sees

The **PZR PRESS** gauge sits still. **PORV OPEN never annunciates**, because the valve genuinely never opens. What moves is everything that is *not* on that channel — average coolant temperature, steam pressure, pressurizer level, and the code-safety indication, which comes up at 7.5 s in the case above. **The instrument that is lying is the one that looks calmest**, and the symptom is not any single reading but the pressure, level and temperature channels ceasing to agree with one another.



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
| 12.4c | **Water-solid: the surge stiffens and SPRAY STOPS WORKING — relief and the heaters keep their bubbled-plant gains** *(new 2026-08-04, #346; spray added #347 — before this, a solid RCS taking safety injection did not repressurize at all: the surplus mass was discarded at a numerical ceiling and pressure sat flat while ECCS ran on)* | When the pressurizer goes water-solid the only compressible volume in the RCS is gone, so an insurge compresses **liquid** and the pressure gain steps up to the bulk modulus (≈ 1.3 GPa, ~4× the bubbled gain). **Spray also loses all authority** — it controls pressure by condensing the steam bubble, and there is none — which is modelled because it turned out to be load-bearing rather than cosmetic: with spray still credited, it pinned pressure 164 psi below the code-safety setpoint and the safeties could not lift at all. **Break blowdown was added to the regime 2026-08-05 (#361)**: on a liquid break the depressurization term is a bubbled-plant mechanism — liquid leaves, the bubble expands to fill the space, pressure falls — so with no bubble it is switched off and the break's mass moves pressure through the bulk modulus alone, which it was already doing. Counted twice, it held the plant about 2000 psi below the relief band, emergency injection never terminated, and inventory ran to the numerical ceiling. **Relief joined the regime with the proportional valve (Rev 14 — this row previously declared it deferred)**: at solid the per-unit-mass relief gain steps to the bulk modulus exactly as the surge's does, because with real valve mass flows the bubbled-plant gain could no longer pass unterminated injection and inventory walked to the numerical ceiling by a fourth road. What is still **not** modelled: the heaters have no bubble to flash but keep their normal-operation gain — unobservable in this regime (pressure sits above their setpoint) and ruled (F14). The historical caution stands: an earlier relief-only correction *on the old valve scale* was measured worse than nothing — it dropped the relieving equilibrium ~145 psi and un-deadheaded the injection | **Minor, and it errs toward calm.** A real solid plant is *harder* to control than this one: relief is stronger per unit mass and heater response is weaker. The lesson is intact and is the one that matters — **going solid costs you the pressurizer as a pressure controller.** Spray does nothing, the heaters cannot help, and the relief valve becomes your pressure control whether you wanted it or not. Do not read the cycling *rate* as a real-plant figure. |
| 12.4d | **Containment is one lumped volume that only ever heats and pressurises — there are NO engineered safeguards in it** *(row REWRITTEN 2026-09-18, #672, against the shipped engine. It previously described containment spray on the sourced 30 psig high-high, a fan-cooler safety realign on any safety injection, an unblockable 3.5 psig safety-injection backup, a steam-line-isolation leg and an upstream steam-line-break source term. **All of that belonged to the retired engine**; this plant inherited the prose and none of the machinery)* | A real containment is a large dry volume with structural heat sinks, containment spray, fan coolers, a pressurizer relief tank (PRT) between the relief valves and the atmosphere, and a recirculation sump. Here it is an ideal-gas air mass of fixed size under whatever steam the break has delivered and not condensed — pressure is the two partial pressures summed (Dalton), temperature comes from the energy the break delivered against the atmosphere's heat capacity, and a liquid sump sits under it. Two anchors are **sourced**, both Ginna UFSAR ch15 (ML20339A101): the **1.0 × 10⁶ ft³ net free volume**, scaled to this plant on the same volume ratio the CVCS uses so the two cannot drift apart, and the pre-accident condition **125 °F (51.7 °C) at 1.0 psig** — which is what the board reads on every initial condition, measured, 15.70 psia (0.1082 MPa) and 125.0 °F. What is **NOT BUILT**, each because no document in any lane's corpus carries its capacity: **no containment spray, no fan coolers, no recombiners.** `ctmt_spray_demand`, `ctmt_spray_active`, `ctmt_fan_safety`, `ctmt_fan_active`, `ctmt_recomb_demand` and `ctmt_recomb_active` are **registered statics** in `engines/pwr2/pwr2_true_state.js` — permanently false, so the absence is machine-readable rather than a silence. **Nothing actuates on containment pressure at all**: no safety-injection backup, no steam-line isolation (**09** §2.0 and §3.0 carry all three as NOT MODELLED; §12.17 below). Also absent: the PRT, so relief and safety discharge go **straight to the containment atmosphere**; sump recirculation and any sump geometry, so `containment_sump_pct` is an honest display scale (100 % = the whole primary inventory) and not a level; and a **structural heat sink**, which real walls use to absorb a large fraction of the blowdown energy in the first minute. There is **no design pressure and no failure pressure** either — the only candidate in the corpus is NUREG-1431's bracketed `[44.1] psig`, a template placeholder a licensee fills in, and this plant declines to invent one | **Know which way it errs, and know it has no way down.** With no structural heat sink this **OVERSTATES** peak pressure and temperature — the same direction as the break model's declared ~2×, so the two compound rather than cancel. The shape is right where it matters: pressure peaks on the hot early blowdown, and a steam generator tube rupture correctly reads **nothing**, because that break discharges into the steam generator — the one leak containment cannot see. What is different from the previous revision is the ending. **This containment has no heat removal, so it never comes back down.** Measured full stack on a large LOCA: 15.70 psia (0.1082 MPa) at the break, **82.9 psia (0.5717 MPa) — 68.2 psig — ten minutes later and still climbing**, having crossed the 30 psig point the previous revision said summoned spray at about two and a half minutes with `ctmt_spray_active`, `ctmt_fan_active` and `msiv_open` all unmoved. A station blackout with auxiliary feedwater failed does the same thing slowly: **62.2 psia (0.4291 MPa) — 47.5 psig — at three hours**, building at 274.3 °F (134.6 °C). **There are no containment controls on the board in this build either**, so there is nothing you can do about it from the panel; the annunciators and the Physics tab are the window. Do not read the psig values as a licensing calculation, and do not expect a recovery. |
| 12.4e | **Hydrogen is generated and it ACCUMULATES — nothing removes it, and it never burns** *(row REWRITTEN 2026-09-18, #672. It previously described transport on a fitted time constant, auto-starting recombiners, and a ruled one-time TMI-2-style deflagration with a ~27.5 psi (0.190 MPa) spike. None of that is in the shipped engine)* | The generation is real and sourced, and that half is unchanged: hydrogen comes from the same Baker-Just reaction event as the cladding oxidation heat — Zr + 2 H₂O → ZrO₂ + 2 H₂, two moles of hydrogen and 190 kJ per mole of zirconium (GEND-061 §4.3; 10 CFR 50 Appendix K mandates Baker-Just for *"hydrogen generation"* by name) — so the inventory and the heat cannot disagree. `ctmt_h2_pct` is a **LIVE** field: the oxidised clad mass turned into moles and taken as a mole fraction against the containment atmosphere's own tracked air and vapour (`engines/pwr2/pwr2_true_state.js`), with **no fitted absolute scale and no transport time constant** — the concentration is the stoichiometry over the building's own gas ledger, so the two anchors the old row balanced a fitted constant between are not needed. What is **NOT BUILT**: the **recombiners** (`ctmt_recomb_demand` / `ctmt_recomb_active`, registered statics, permanently false — existence is sourced, WTSM 5.0 and NUREG-0737 II.E.4.1, but no capacity figure exists in any lane's corpus) and the **burn** (`ctmt_h2_burned`, a registered static **0**). Hydrogen on this plant reaches the flammability limit and **does not ignite**, so there is no ignition point, no consumed fraction, no pressure spike, no gas-temperature excursion and no one-time latch left to declare. The **4.1 v/o** lower flammability limit is still live as an ALARM and is alarm-only — nothing actuates on it (**09** §5.0) | **Know what is lost and what still teaches.** Lost: TMI-2's burn, the single sharp spike the crew first read as electrical noise, and the slow-tail lesson the recombiners carried. What remains is the harder half and it is honest — **hydrogen accumulates and there is nothing in the building that removes it.** Measured full stack on a station blackout with auxiliary feedwater failed: the cladding climbs from 654.9 °F (346.1 °C) to **3156.8 °F (1736 °C)** over three hours as the core uncovers completely, and `ctmt_h2_pct` reaches **2.23 % by volume** at the point the fuel-damage latch sets and the simulation ends (§13.0) — still short of the 4.1 % alarm on that path. **Generation is strongly path-dependent, because the reaction self-gates on temperature, and knowing which paths reach it is the operator-relevant part.** On the Three Mile Island walkthrough's own ride the cladding reads **555 °F (290.6 °C) at 94 % uncovered** (`Blueprint/PWR2_VALIDATION.md` §83; **08** §6.0 declares it) — at 572 °F (300 °C) the Baker-Just law integrates to 0.07 mg/cm² in a *year* — so that ride makes no hydrogen whatever. The homogeneous-core defect behind that (§5.5) is the gap this whole chain hangs from. Do not quote this plant's hydrogen percentages or its clock as real-plant figures. |
| 12.5 | **Pressurizer is a two-region vessel with ONE calibrated interface constant** *(rewritten 2026-08-29, #584 — the old row, "effective coefficients, not two-phase thermodynamics", described the retired engine)* | Flash evaporation, condensation and subcooled surge into the steam space are computed by a real two-region energy balance (§7.1); what is calibrated rather than derived is the interface's 30 s time constant — fitted to one sourced case, Ginna UFSAR Table 15.2-1 Case 2 — and the shell's condensation film (#587). | **No.** The TMI-critical level rise during voiding falls out of the mechanism itself, and the one fitted constant is declared where it lives. |
| 12.15 | **Heater pressure authority runs about 10 % above the sourced rating — not 347×** *(re-measured 2026-08-29, #584, on the shipped engine; the 347× departure was the retired engine’s heater control gain and left with it)* | WTSM 3.2 (ML11223A213) rates the real heaters at 1794 kW, *"capable of raising the temperature of the pressurizer and its contents at approximately 55 °F/hr (30.6 °C/hr)"* — 0.23 psi/s (1.59 kPa/s) at the design point. The shipped plant puts the scaled bank’s 157.8 kW into the two-region energy balance (§7.1) and the measured full-bank slew is **0.2539 psi/s (1.75 kPa/s)** — 2246 psi (15.486 MPa) to 2276 psi (15.69 MPa) over 120 s from a settled design point, spray blocked. Pressure follows from the joules; there is no authority multiplier for a gain to inflate. | **No.** The +10 % is the two-region model’s honest arithmetic, not a control gain — direction, ordering and magnitude are all usable at the board. The old row’s consequence (*"about 1 °F of subcooling at the 17 % heater cutoff against roughly 9 °F at the sourced rating"*) was measured on the retired engine and is struck with it. |
| 12.6 | **No sensor redundancy or voting** | Real plants use ~3 channels with 2-of-3 voting; one failed sensor cannot trip or block a trip alone | **Yes — instrument failures are *more* impactful here.** That is arguably better teaching, but it is not prototypical. |
| 12.7 | **Xenon has no spatial oscillation** | Xenon power tilts swinging around a large core over hours | **No** at this plant size. Total inventory suppression is modelled. |
| 12.8 | **Turbine and condenser are behavioural** | Stage efficiencies, feedwater heaters, hotwell level | **No.** Trip and vacuum-loss behaviour is right; the thermodynamic detail is not part of any lesson. |
| 12.9 | **Steam-dump load-rejection arm is a bistable — there is a cliff — and it disarms itself** | A rejection just under 40 MWe gets no fast dump; staircased rejections never arm. And once armed, the fast mode stands down on its own when the reactor catches the load — a real one stays armed until an operator turns a RESET selector | **Yes — see the warning in §8.3.** Ruled and declared, not a defect. The real arm is far more sensitive (a 10 % step), affordable only because a human de-arms it; the blunt arm and the auto-clear are one trade, and any change takes both | 
| 12.10 | **Boron chemistry is an idealised mixing model** | Blender dynamics, volume-control-tank mixing, real makeup-flow chemistry | **No, and it is no longer compressed** — this row said "2 ppm/s, grab sample in 60 s" through Rev 16 and both figures were the retired engine's. There is no rate constant at all now: the achievable rate is the mass balance's own, inflow × (tank ppm − reactor coolant ppm) ÷ mass, clamped by the 2,500 ppm boric-acid tank. Measured at 626 ppm and full charging, a saturating demand delivers **0.047 ppm/s borating and 0.026 ppm/s diluting** — so boration slows as you approach the tank and dilution runs fast at high boron and slow at low. The grab sample takes a real **30-minute** lab turnaround. |
| 12.11 | **One control group and one shutdown group** | Multi-bank sequencing, programmed overlap, bank overlap indication, core maps | **Not for operating**, but the single bank carries the *whole* control worth, which is why its worth curve is deliberately flattened (§4.3). |
| 12.12 | **Pressurizer level is geometric, not a calibrated span — and there is no surge-line/break flow split** *(second half added 2026-09-18, #708)* | Reference-leg behaviour and a true narrow/wide calibration. Also missing: the **admittance split** between the surge line and a loop break that the retired engine carried (WCAP-16009-NP-A §11-4-5), which gave a small loop break a *partial* level lift. Here level is `V_liq / V_pzr` out of the shared volume solve (§7.3), so a loop break simply empties the gauge — measured at three break sizes | **Know the one behaviour it costs.** The Three Mile Island level deception is intact and stronger on the paths TMI-2 actually had — a discharge out of the pressurizer steam space, or a loop boiling with no break — where the gauge **pegs at 100 %** while inventory falls (§7.3). What is gone is the partial lift on a *loop* break: here any hole in the loop drains the gauge. Note none of this applies to SG level, which *does* have a real narrow/wide window (§8.1). |
| 12.16 | **Final feedwater temperature is constant** *(new 2026-08-05, #372 — feed used to carry no enthalpy at all; value SOURCED Rev 14)* | Real final feed temperature falls with load as extraction-steam heating fades; here it is 435.2 °F (224 °C) at every load — since Rev 14 the top of the Ginna UFSAR's 390–435 °F final-feed band, where the earlier 440.6 °F sat just above it — and the feedwater-heater train and moisture-separator reheaters do not exist as components. Loss-of-feedwater-heating — a standard overcooling transient — therefore remains unreachable, and part-load overcooling from cold feed is milder than the real plant's. **And below 363 psi (2.50 MPa) in the steam generator the sign inverts:** 435.2 °F feed is then *hotter* than the shell's saturated water, so main feed stops absorbing heat and starts adding it. Measured on a fast secondary blowdown from hot standby, the window is short and self-limiting — **0.7 to 2.6 MJ over about two minutes, peaking at 120 kW (0.04 % of rated)** — because the level controller shuts the regulating valve as the generator empties. It is a declared artefact of having no feedwater-heater train, not a mechanism to fly against. | No, on both counts. Overfeed and AFW cues read correctly; don't expect a feed-heater casualty to exist, and don't read the sub-363-psia sign flip as plant behaviour. |
| 12.17 | **NOTHING on this plant reads containment pressure — no isolation, no injection, no spray** *(filed 2026-08-05 as #370, "nothing reads containment pressure"; revised 2026-08-06; declared CLOSED at #386 stage 2 on 2026-08-08 — and **RE-OPENED 2026-09-18, #672**, because that closure was built in the retired engine and never travelled to the one the site runs)* | A real plant isolates the steam lines on a high-high containment pressure signal — ML11223A310, isolation on *"a high-high containment pressure signal or high steam flow coincident with…"* — and starts safety injection on the building's own evidence. This plant has neither. Containment pressure and temperature are computed and indicated, and **no protective function anywhere reads them.** Proved by injection rather than by a source read: on a large LOCA the building passes the sourced 30 psig high-high at about two and a half minutes and reaches 68.2 psig by ten, with `msiv_open` still **true**, `ctmt_spray_active` **false** and `ctmt_fan_active` **false** throughout. **09** §2.0 and §3.0 carry the three NOT MODELLED rows | **A break inside containment that never spikes steam flow isolates nothing, and a break that pressurizes the building without depressurizing the loop starts nothing.** The gauge is a report, not a signal. Still declared alongside it: §12.19. |
| 12.19 | **The steam-flow isolation setpoint is fixed, not programmed on turbine load** *(new 2026-08-05, #370)* | The real setpoint slides with turbine load, so it stays sensitive at any power. Ours is a fixed fraction of RATED flow. | **Yes, at low power.** A break that is large *relative to the load* need not reach the fixed setpoint when the plant is well below full power, so it may not isolate automatically. At power the separation is wide and measured. Below about half load, treat the MSIV as your lever, not the plant's. |
| 12.18 | **The atmospheric dump valve is sourced now — this row records what closed it** *(new 2026-08-05, #371 as "size is not sourced"; narrowed 2026-08-06; CLOSED at #419 wave 3, when the whole ladder became Ginna's)* | Capacity 0.10 of rated steam flow is WTSM §7.1.3.3's own per-generator figure; the 1060 psi (7.31 MPa) setpoint is that section's placement rule applied to the Ginna ladder **and** sits inside Ginna's own ARV solenoid band (1005–1060 psig, UFSAR ch 10). Automatic modulation was already prototypical. What remains an engineering choice is only the single-valve lumping. | **One behavior still matters.** Losing the condenser does not start a cooldown by itself — AUTO caps steam pressure at the setpoint but the plant stays hot, so you must lower the setpoint or open the valve. And once open, it cools **much faster than the 100 °F/hr limit** — throttle it, and watch the cooldown-rate meter (**A34**). |
| 12.14 | **No turbine roll or no-load speed hold — and the overspeed trip therefore cannot fire** | The whole off-line half of a real startup: rolling off the turning gear, holding rated speed on no-load steam, and synchronising before the breaker closes. On a real EHC machine that is a *setpoint-and-rate* evolution (select 1800 RPM and an acceleration rate; SLOW takes ~30 min), not a hand-throttled one — see **04** PWR-N05. | **Yes, for one procedure and one trip.** PWR-N05's synchronisation is **one action**: the rotor goes from rest to 1800 RPM and picks up load in a single press of FOLLOW or MAN, and measured, the plant barely notices (Tavg moves 0.1 °F, steam pressure 1196 → 1194 psi). And the **1980 RPM overspeed trip in §09 is configured but unreachable** — the rotor is either pinned at rated by the grid or coasting down, so nothing can drive it there. Do not read "no overspeed trip occurred" as evidence about a real machine. |
| 12.20 | **One `RHR` control stands for two alignments of one set of pumps — so the trainer REFUSES the align during injection, and that refusal is not a plant interlock** *(new 2026-08-12, #458 — before this, aligning RHR into a running loss-of-coolant accident gave the plant full shutdown cooling)* | A real plant runs the RHR pumps in two mutually exclusive lineups: **injection** (suction from the refueling water tank, discharge to the cold legs, heat exchangers **uncooled** — WTSM 5.2 §5.2.4.5, ML11223A220) and **shutdown cooling** (hot-leg suction through 8701/8702, heat exchangers on component cooling water — WTSM 5.1, ML11223A219, which calls the cooldown function *"independent of any engineered safety features function"*). It leaves the first for the second by hand, at the **sump swap-over on refueling-water-tank depletion**, and *"the cold-leg recirculation lineup is completed by opening the component cooling water supplies to the RHR heat exchangers"*. This trainer has **one** `rhr_active` flag for both lineups and **no refueling-water-tank inventory**, so it can never reach that swap-over — its accidents stay in the injection phase for ever. The refusal is therefore the model declining to be in two lineups at once. **It is not an interlock and is not presented as one**: no document in any lane's corpus gives 8701/8702 a safety-injection inhibit, only the pressure permissive and the autoclosure, both of which are modelled and unchanged | **Know exactly what it costs you.** What you lose is the *real* exit from a loss-of-coolant accident — long-term core cooling through the RHR heat exchangers after the swap to the containment sump — because the tank that triggers it does not exist here. What you gain is the honest half: **shutdown cooling is not available to you during an accident, and securing injection is the decision that opens it.** Measured before the fix, aligning RHR into a large break removed **8.8×** the plant's decay heat from heat exchangers that in that lineup have no cooling water, with the primary at **79 % void** — a centrifugal pump on steam. Do not read "secure injection and you get cooling" as the real plant's sequence; a real crew opens component cooling water to the heat exchangers, and securing injection is not what does it. |
| 12.13 | **Cold-plant mass bookkeeping is normalised** | The real cold-plant mass surplus | Level in the cold modes rests on a program floor standing in for CVCS keeping the pressurizer on span. Visible only in Mode 5. |
| 12.21 | **The load dial ramps on a RAISE only, and the sourced 10 % step allowance is not modelled** *(new 2026-09-04, #624 / #619 item 24 — before this the dial did not ramp at all, and a 20 MWe change arrived in zero time)* | Ginna UFSAR chapter 10, section 10.1.2.1 (ML20339A040) allows the machine *both* a **10 % of full power step** and a **5 % of full power per minute ramp**. This plant enforces the ramp on **increases only** (**09** §10.0): dial a higher target and the effective load walks up at **5 MWe/min**; dial a lower one and it lands at once. A step allowance would be a second regime needing its own measurement — 10 % of rated is 10 MWe delivered instantly, a third of the disturbance that caused this issue — and one rule the operator can hold in their head was preferred. The asymmetry is deliberate and is argued in §7.3: the raise is the direction that shrinks the pressurizer, and limiting the cut as well would put the dial on the C-7 interlock's own threshold. | **Know the one consequence.** Small load **increases** take longer here than on the real machine — a 10 MWe raise is two minutes rather than a step — so do not read this plant's ramp times as a dispatch limit. Reductions behave as they always did, so the C-7 graded ride-out is still reachable from the dial as well as from **UNLOAD** (**03** §12.2). |
| 12.22 | **The BORON CHEM tile is a LIVE continuous boron reading, and a real control room has no such display** *(new 2026-09-11, #698 — before this the tile posted a periodic lab grab-sample result and the board carried a SAMPLE button to request one)* | **This is a DECLARED DEPARTURE from prototypicality, not a claim about real plants, and the source it departs from is unchanged.** Ginna UFSAR §7.7 (ML20339A027) states verbatim: *"There is no provision for a direct continuous visual display of primary coolant boron concentration."* No measurement weakens that, and none was taken against it — this reverses a **2026-09-03** decline that was made **on that citation** *(OWNER RULING, 2026-09-10: "All decisions as recommended.", ratifying option B)*, and the reversal is a **weighting choice**: a control that produces a number 30 plant-minutes later, on a board where every other reading is instantaneous, and that exactly one authored step ever asked the player to press, loses more to player complexity than it buys in chemistry realism. What the tile now shows is the `boron_analyzer` channel — the same signal the boron dose controller has always used as its process variable, previously kept off every display. Measured on this plant diluting **88.4 ppm over 60 plant-minutes**, the reading trails true loop boron by at most **2.08 ppm** (typically 1.0–1.5), against the **88 ppm** the grab sample was stale by at the end of that same hour. The SAMPLE button and the lab-turnaround model are gone from the board; the sample COMMAND survives, because a completed dose still uses it to re-baseline its totalizer. | **Only in what you may cite it as.** Operationally it is simpler, not harder: the target box is the ask, CHEM is the answer, and you can watch a dose converge instead of inferring it. What you must not do is read this board as evidence about a real control room — a real crew works boron from periodic samples and knows their number is hours old, and the habit of *dosing on a stale number* is the one thing this departure stops teaching. If you want that lesson, it is **03** §7.5's to tell, not the tile's. |

---

## 13.0 What is not modelled at all

If you expect one of these and cannot find it, it is not hidden — it does not exist.

**Containment and consequences**
- The containment **building** is modelled — one lumped air/steam volume over a liquid sump, on Ginna's sourced free volume and pre-accident condition (§12.4d) — and it has **NO engineered safeguards at all**: no spray, no fan coolers, no recombiners, no safety-injection backup and no steam-line-isolation leg, because no document in any lane's corpus carries their capacities. Their contract fields are **registered statics**, permanently false, so the absence is machine-readable (`engines/pwr2/pwr2_true_state.js`). **Nothing reads containment pressure** (§12.17). **Hydrogen is real and accumulates** — generated by the cladding oxidation itself and published as `ctmt_h2_pct` — but nothing removes it and **it never ignites**: `ctmt_h2_burned` is a registered static 0, so the one-time TMI-2-style burn is not modelled (§12.4e). Also still missing: a pressurizer relief tank, sump recirculation and sump geometry, a structural heat sink, an oxygen ledger, local hydrogen pocketing and igniters. **All of it is automatic or absent — there are no containment controls on the board in this build** (owner ruling, pending the board redesign); the annunciators and the Physics tab are the window. *(Rewritten 2026-09-18, #672 — this bullet previously credited the retired engine's stage 2 and stage 3: spray on the 30 psig high-high, fan-cooler realign on safety injection, the 3.5 psig backup, a steam-line-isolation leg, an upstream steam-line-break source term, auto-starting recombiners and the ruled burn.)*
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
- No protection-margin governor on time acceleration — fast-forward dropout (**02** §4.1) drops the clock on a trip, a new failure or a first alarm, and WARP lets go on a rate excursion, but nothing slows you for merely approaching a setpoint

---

## 14.0 How much to trust a number

| Class | Trust | Examples |
|---|---|---|
| **Structural** — fixed physical constants and real-plant setpoints | High | β and Λ, six-group delayed data, fuel damage/melt thresholds, PORV and safety setpoints, the 665 psia (4.58 MPa) accumulator arming pressure, the 400 psi (2.76 MPa) RHR block-open permissive and its 600 psi (4.14 MPa) autoclose |
| **Calibrated** — arbitrated by the physics acceptance suites | Directionally right, magnitude roughly right | Heat-transfer coefficients, decay-heat constants, level coefficients, dump and AFW capacities |
| **Compressed** — deliberately faster than reality for training | Right in behaviour, wrong in duration | **This class has largely emptied** (#408 put the accident-inventory family — ECCS injection included — on the real Ginna scale; #419 retired the Mode 5↔1 pacing: the pressurisation slew now runs the sourced 0.23 psi/s heater rate, the boron rate is a derived physical ceiling, and the grab-sample turnaround is a real 30-minute lab). What remains: the **cooldown depressurisation rate** — see §14.1 |
| **Indicative** — display flavour derived from normalised internals | Illustrative | The RCS flow conversion (**≈ 34 500 gpm** at cold-leg conditions — see the note below). **The charging, letdown and auxiliary-feedwater ratings left this class** and are now *Derived*: §6.3 carries them (26.3 gpm charging, 11.7 gpm letdown, 86.2 gpm auxiliary feedwater), each computed from this plant's volume or power against a sourced Ginna rate rather than read off a display scale |

> **NOTE.** The plant's absolute ratings — ≈ 300 MWt, ≈ 100 MWe, one loop, one SG, one RCP — are a **design choice**, not a measurement of any real unit. The SLS-100 is its own plant.

> **NOTE — the RCS flow figure was CORRECTED in Rev 17, and it is worth knowing why.** This row
> read **24 000 gpm** from the first revision until 2026-08-14. That figure was not derived from
> anything: it disagreed with this plant's *own* ruled identity by about 1.5×. Take the ruled
> numbers — 300 MWt, 610 °F hot leg, 550 °F cold leg, 2235 psia — and the energy balance
> `Q = ṁ·Δh` gives a rise of **185 Btu/lb (185.4 kJ/kg)** across the core and therefore
> **3 590 lbm/s (1 630 kg/s)**, which is **≈ 34 500 gpm** at cold-leg density. Nothing in the
> simulator could detect the disagreement, because the model has no physical mass flow to check
> it against — it runs on a normalised flow fraction. That is exactly why the figure sat wrong
> for so long, and it is the defect that opened the physics-engine rewrite (**#479**).
>
> **A volumetric flow is meaningless without a temperature**, because the water expands as it
> heats: the same 3 590 lbm/s reads ≈ 34 500 gpm cold-leg, ≈ 36 100 gpm at T-avg, and
> ≈ 38 200 gpm hot-leg. Real plants quote cold-leg, and so does this row now. **The mass flow is
> the unambiguous number** — quote that one if it matters.
>
> This row stays **Indicative**, and the class is the point: the value is now consistent with the
> plant's identity, but the current model still does not *compute* a flow. It is a label on a
> normalised fraction, not a measurement.

### 14.1 The one Compressed rate left worth knowing by name

*(This section named two others when it was written. **ECCS injection pacing** — once 22–440×
real — was retired by #408, which put the whole accident-inventory family on the sourced Ginna
scale: injection now runs a real pump-segment model with shutoff heads, so time-to-recover
numbers from injection transients ARE plant numbers. The **Mode 5↔1 pacing family** —
pressurisation slew, boron rates, lab turnaround — was retired by #419: those now run sourced
or derived real rates, ridden at time acceleration.)*

**Cooldown depressurisation is compressed, and it narrows one cue.** A real plant takes a good part of an hour to walk from 1000 psi (6.895 MPa) to the accumulators' 665 psia (4.58 MPa) cover gas. Driven briskly here, that band is crossed in about **1 minute of plant time** — measured full-stack. That is the entire window between the **SI ACCUM ALIGNED** annunciator (**06 PWR-A32**) coming in and the first accumulator discharge. At 30× time acceleration it is a couple of seconds of wall clock. **What this means for you:** isolate the accumulators on schedule at 1000 psi as the procedure says (**PWR-N15** step 3, **05** Phase C step C3) rather than waiting for the annunciator to prompt you, and slow the acceleration through that band. The cue is a backstop, not a timer you can run against.

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
