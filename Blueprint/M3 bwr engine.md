# M3 — BWR Engine

**Build this module from `CONTEXT.md` + this file alone.** No other module is required.
This is the complete specification for the Boiling Water Reactor engine: its flow-controlled
power via the negative void feedback, its vessel/boiling/recirculation thermal-hydraulics, the
steam-driven safety systems (RCIC/HPCI) that run without AC power, the depressurize-and-inject
path (ADS/LPCI), the station-blackout battery limit, its built-in instrument model, its
protection/failure configuration, the Fukushima sequence it must make possible, and the
scenario test suite that is its acceptance gate.

`CONTEXT.md` already defines the hard rules, the snapshot/command contract, the field
vocabulary, scope, the time step, determinism, and conventions. **Do not re-derive those;
rely on them.** This file adds the BWR implementation. **[tune]** marks starting points the
scenario tests (§17) arbitrate; unmarked values are fixed. The engine makes **no control
decisions** (HR2).

---

## 1. The Build Target

Per `CONTEXT.md §7`, this module produces `engines/bwr/`:

| File | Contents |
|------|----------|
| `bwr_engine.js` | The `BWREngine` class **and** `BWRScenarioTests` (§17) |
| `bwr_config.js` | All BWR parameters as structured config (HR8) — every [tune] value, operating points, the trip/alarm/failure definitions of §13 |
| `bwr_instruments.js` | The BWR instrument model (§11) — instrument set, lag/noise/range/failure, vessel-level shrink-and-swell |
| `bwr_vessel.js` | Vessel pressure, level + boiloff, boiling/void, fuel temperature, fuel-damage endpoint (§6) |
| `bwr_recirculation.js` | Recirculation drive flow, jet pumps, natural circulation, the turbine-trip transient (§7) |
| `bwr_safety_systems.js` | RCIC, HPCI, ADS, LPCI, the SBO battery limit, the uncovery timeline (§9) |
| `bwr_protection.js` | BWR trip/actuation/alarm definitions as data (§13) — read by M4 |

The **contract surface** (consumed by M4/M5): step by `dt_effective`; report true state;
produce instrument readings; accept the BWR commands from `CONTEXT.md §6.7`; save/restore
complete state (§16); run its scenario suite (§17).

### The BWR in one line

The **stable, flow-controlled** reactor (see `CONTEXT.md §5`). Boils water directly in the
core; steam goes straight to the turbine (direct cycle, no steam generators). Water-moderated
→ **negative** void coefficient. Power is controlled substantially by **recirculation flow**.
Operating pressure ≈ **7.03 MPa**, lower than the PWR because the water is meant to boil. Host
of Fukushima — an accident of *sustained support*; the comparison (with vs without
depressurize-and-inject) is the lesson. Its **safety systems are the most important teaching
content.**

---

## 2. Units Convention

Contract fields use the BWR suffixes from `CONTEXT.md §6.3` — temperature in **°C**
(`fuel_temp_c`), pressure in **MPa**, level in **%**, void as a **fraction** (0–1), flows in
**% rated** (recirc demand) or **normalized to rated** (steam/feedwater). Feedback coefficients per Kelvin (= per
°C). Fuel-damage thresholds 1200 / 2800 °C.

---

## 3. Point Kinetics Core (the BWR's own copy)

The BWR carries its own copy of the six-group integrator — identical to the others **except**
`Λ`. The BWR is stable and **never reaches prompt criticality** under any in-scope scenario,
so it has **no prompt fast-path** (standard Euler kinetics throughout).

**Six-group parameters** (U-235; fixed):

| Group | βᵢ | λᵢ (s⁻¹) |
|------:|----------|---------|
| 1 | 0.000215 | 0.0124 |
| 2 | 0.001424 | 0.0305 |
| 3 | 0.001274 | 0.111 |
| 4 | 0.002568 | 0.301 |
| 5 | 0.000748 | 1.14 |
| 6 | 0.000273 | 3.01 |

**β = 0.006502** (fixed). **Λ = 0.00005 s** (BWR; fixed — shortest of the three, light-water
moderated boiling core). Precursor init at equilibrium `Cᵢ = (βᵢ/λᵢ)·P₀/Λ`. Standard kinetics:
`dP_dt = ((ρ−β)/Λ)·P + Σ λᵢCᵢ`; `P = max(0, P + dP_dt·dt)`.

### Decay heat
Two-term exponential, identical form (the heat source that drives Fukushima after scram):
`H_total = H1 + H2`, at scram `H1_0 = 0.05`, `H2_0 = 0.02`, `lambda_1 = 0.0005`,
`lambda_2 = 0.00002` s⁻¹ **[tune]**. `Q_total = P_fission + H_total`. **Decay heat is what
boils the vessel dry after RCIC fails — getting its hours-scale magnitude roughly right is part
of getting the Fukushima timeline right.**

---

## 4. Reactivity Feedbacks

```
ρ_total = ρ_rods + ρ_doppler + ρ_void + ρ_xenon
```
No MTC, no boron, no graphite. The **void feedback is dominant for control and is negative** —
the opposite of the RBMK — which is what makes flow control stable and self-limiting.

**Doppler** (prompt, negative):
```
ρ_doppler = α_D · (T_fuel − T_fuel_ref)        α_D = −2.0e−5 K⁻¹   [tune]
```

**Void** (negative — the stabilizer and the basis of flow control):
```
ρ_void = α_void · (void_fraction − void_ref)   α_void = −0.15, void_ref = 0.40   [tune]
```
As void rises (more boiling, or less flow), reactivity falls. Increase flow → sweep out voids →
raise power → rising power makes more void → settles at a new balance. No runaway. This
negative coefficient is what the steady/flow tests (§17) confirm.

**Control rods** (SCRUVE, as the PWR — bottom-entry hydraulic, fast scram §10):
```javascript
function scruve(pos_norm) { return pos_norm - Math.sin(2*Math.PI*pos_norm)/(2*Math.PI); }
ρ_rods = -rod_worth_total * scruve(1.0 - position_withdrawn_normalized);
```
`rod_worth_total = 0.10` **[tune]**.

**Xenon** (shared form):
```javascript
dI_dt = gamma_I*P - lambda_I*I
dX_dt = lambda_I*I + gamma_X*P - lambda_X*X - sigma_phi*P*X
ρ_xenon = -xenon_worth * (X / X_eq)
```
`gamma_I=0.061`, `gamma_X=0.003`, `lambda_I=2.87e−5`, `lambda_X=2.09e−5` (fixed);
`sigma_phi=2.0e−5`, `xenon_worth=0.025` **[tune]**.

---

## 5. Per-Step Computation Order

1. Total reactivity (rods, Doppler, void, xenon — §4).
2. Advance kinetics → new power (§3).
3. Advance xenon/iodine (§4).
4. Heat generation = fission + decay heat (§3).
5. Advance fuel temperature (§6.4).
6. Advance core flow — recirc / jet pumps / natural circulation (§7.1–7.2).
7. Advance void fraction from power and core flow (§6.3).
8. Advance vessel pressure (§6.1), applying any turbine-trip void collapse (§7.3).
9. Advance safety-system effects — RCIC/HPCI/ADS/LPCI, battery depletion (§9).
10. Advance vessel level — feedwater + injections − steam − boiloff (§6.2).
11. Check fuel damage / melt (§6.5).
12. **Update instruments from the new true state** (§11).

---

## 6. The Vessel — pressure, level, boiling, fuel

### 6.1 Vessel pressure
```javascript
steam_gen_rate = P * steam_gen_per_power_bwr;
// steam_dump = turbine bypass to the condenser (§12), gated on condenser availability.
dVesselP_dt = (steam_gen_rate - steam_flow - steam_dump - relief_flow) * K_vessel_pressure;
vessel_pressure_mpa += dVesselP_dt * dt;
```
`steam_gen_per_power_bwr = 1.0`, `K_vessel_pressure = 0.0172` MPa/imbalance, operating 7.03 MPa,
relief/safety valves open at 7.58 MPa **[tune]**. (Steam source is `Q_total` = fission + decay,
so a scrammed core still boils and pressurizes into the reliefs. The `steam_dump` term — turbine
bypass to the condenser — is only active when the condenser is available; §12.)

### 6.2 Vessel water level (the central safety parameter) + boiloff
```javascript
dVesselLevel_dt = (feedwater_flow + rcic_flow + hpci_flow + lpci_flow
                   - steam_flow - boiloff_rate) * K_vessel_level;
vessel_level_pct = clip(vessel_level_pct + dVesselLevel_dt * dt, 0, 100);

// Decay heat boils away inventory when injection cannot keep up:
boiloff_rate = (H_total) / (latent_heat_bwr * vessel_water_mass);
```
`K_vessel_level = 5.0`, `latent_heat_bwr = 1.0`, `vessel_water_mass = 1.0` **[tune]**. **Tune
`vessel_water_mass` together with `rcic_flow_normalized` (§9.1) so the Fukushima timeline is
right: RCIC holds level for hours; after RCIC fails the core uncovers (level < 20 %) within
2–4 hours.** Keeping the core covered is the whole safety story.

**Isolation Condenser (IC) — built (Fukushima Unit 1).** A *passive* heat sink: it condenses
reactor steam in an elevated pool and returns the condensate by gravity, removing decay heat with
**no AC and no fresh-water injection**. `set_ic {active}`. While condensing (`ic_condensing`) it
(a) lowers vessel pressure at `ic_condense_rate·(P − P_ambient)` and (b) conserves inventory —
`stepVesselLevel` zeroes boiloff, so the core stays covered on decay heat alone. Its valves are
**DC-powered**, so on battery depletion in a station blackout the IC closes (`ic_active → false`) and
boiloff resumes — the Unit-1 sequence. Failure `ic_failure` shuts the valves. Gated by the
`isolation_condenser` acceptance test (level held ~50 % for hours, then uncovers once DC is lost).

### 6.3 Void fraction (drives the negative feedback)
```javascript
void_target = clip(P / (core_flow_pct / 100.0) * void_scale_factor, 0.0, 0.95);
core_void_fraction += (void_target - core_void_fraction) / void_response_tau_bwr * dt;
```
`void_scale_factor = 0.45` (rated power at rated flow → ~40 % void), `void_response_tau_bwr = 1.5`
s **[tune]**.

### 6.4 Fuel temperature
```javascript
dTf_dt = P * heat_gen_coeff_bwr - h_fc_bwr * (fuel_temp_c - coolant_temp_c);
fuel_temp_c += dTf_dt * dt;
```
`h_fc_bwr = 0.05` s⁻¹ (normal), `heat_gen_coeff_bwr` tuned for appropriate rated fuel temp
**[tune]**. When the core uncovers (low vessel level), heat transfer degrades and fuel
temperature rises toward damage — the uncovery endpoint.

### 6.5 Fuel damage / melt
```javascript
if (fuel_temp_c > 1200) fuel_damaged = true;     // cladding failure
if (fuel_temp_c > 2800) { melted = true; if (destruction_cause === "none") destruction_cause = "thermal_melt"; }
```
The BWR reaches this only via the Fukushima uncovery path (no prompt excursion — there is no
positive-feedback runaway).

---

## 7. Recirculation, Jet Pumps, Natural Circulation, Turbine Trip

### 7.1 Core flow via jet pumps
The recirculation pumps drive jet pumps; core flow exceeds the drive flow because the jet pumps
entrain additional flow:
```javascript
if (recirc_pump_running) {
    drive_flow = recirc_pump_speed_pct / 100.0;        // operator setpoint (set_recirc_flow)
    core_flow_pct = drive_flow * (1.0 + jet_pump_m_ratio) * 100.0;
} else {
    core_flow_pct = natural_circ_flow_bwr(P, core_void_fraction);   // §7.2
}
core_flow_pct = clip(core_flow_pct, 0.0, 120.0);
```
`jet_pump_m_ratio = 1.5` (core flow ≈ 2.5× drive) **[tune]**. Pump coastdown on loss of recirc
uses `tau_coastdown = 6.0` s (then natural circulation takes over) **[tune]**.

### 7.2 Natural circulation (safety-relevant)
The BWR sustains meaningful flow by natural convection even without pumps, at reduced power:
```javascript
function natural_circ_flow_bwr(P, void_fraction) {
    return clip(natural_circ_coeff * Math.sqrt(Math.max(P, 0)) * 100.0, 0.0, 40.0);
}
```
`natural_circ_coeff = 0.30` (~25–35 % flow at moderate power — enough to keep the core cooled
at reduced power without forced flow) **[tune]**. On loss of forced flow at low power, flow
establishes here rather than going to zero.

### 7.3 Turbine-trip transient (characteristic)
On turbine trip, steam flow drops to zero suddenly → vessel pressure rises → rising pressure
**collapses voids** → collapsing voids *add* reactivity (the negative void coefficient working
in reverse) → a brief power rise, before protection/relief respond:
```javascript
if (vessel_pressure_mpa > vessel_p_rated) {
    void_collapse = (vessel_pressure_mpa - vessel_p_rated) * void_collapse_coeff;
    core_void_fraction = clip(core_void_fraction - void_collapse, 0.0, 0.95);
    // the brief power rise emerges automatically through ρ_void (§4)
}
```
`void_collapse_coeff = 0.145` per MPa **[tune]**. The §17 test asserts this transient occurs.

---

## 8. (reserved — see §9 for safety systems)

---

## 9. The Safety Systems — the heart of Fukushima

The model must represent these and their limits, because Fukushima is fundamentally about them.

### 9.1 RCIC — steam-driven core cooling (runs without AC power)
RCIC uses **reactor steam** to drive a pump injecting water back into the vessel. Its defining
property — and the reason it bought hours at Fukushima — is that it runs on **battery-backed
control power and the reactor's own steam**, no AC needed.
```javascript
if (rcic_running && vessel_pressure_mpa > rcic_min_pressure) {
    rcic_flow = rcic_flow_normalized;                 // adds to vessel level (§6.2)
    vessel_pressure_mpa -= rcic_steam_consumption * pressure_sensitivity * dt;  // consumes steam
}
```
`rcic_flow_normalized ≈ 0.01`, `rcic_steam_consumption ≈ 0.002`, `rcic_min_pressure = 0.69`
MPa **[tune]**. **Auto-starts** when `vessel_level < rcic_start_level = 50 %` and battery (DC)
or AC power is available. **Stops** when vessel pressure < 0.69 MPa (steam too low to drive the
turbine) **or** the battery is depleted (§9.4).

### 9.2 HPCI — higher-capacity steam-driven injection
A larger version of the same idea for more demanding conditions; auto-starts on lower level
(§13). Same no-AC property.

### 9.3 ADS — automatic depressurization (the decision point's enabler)
Relief valves that rapidly lower vessel pressure when actuated (`trigger_ads`). This matters
because low-pressure injection can only inject once pressure is low enough — **depressurizing is
the deliberate action that opens the door to LPCI**, and the key decision in the scenario.
```javascript
if (ads_open) {
    dVesselP_dt = -(vessel_pressure_mpa - P_ambient) / ads_depressurization_tau;
    vessel_pressure_mpa += dVesselP_dt * dt;
}
```
`ads_depressurization_tau = 600` s (reaches the LPCI threshold in ~10 min) **[tune]**.

### 9.4 LPCI — low-pressure injection (works only after depressurization)
```javascript
if (lpci_running && vessel_pressure_mpa < lpci_threshold_pressure) {   // 1.03 MPa
    lpci_flow = lpci_flow_normalized;                                    // large, adds to level
}
```
`lpci_threshold_pressure = 1.03` MPa, `lpci_flow_normalized ≈ 0.05` **[tune]**. Together with
ADS, this is the path that keeps the Fukushima core covered.

### 9.5 Station blackout and the battery limit
```javascript
// Station blackout: all AC lost — recirc pumps and main feedwater (need AC) are gone;
//                   RCIC/HPCI (no AC) continue on battery + steam.
// Battery: a fixed-duration limit (v1 simplification — not load-modeled). Represent the
//          charge as a linear timer so the field and alarm have something real to show:
if (station_blackout) {
    sbo_elapsed += dt;
    battery_charge_pct = clip(100.0 * (1.0 - sbo_elapsed / (battery_duration_hours * 3600.0)), 0, 100);
    if (battery_charge_pct <= 0.0) rcic_running = false;   // battery depleted → RCIC fails, injection stops
}
```
`battery_duration_hours = 8.0` (the Fukushima-relevant figure) **[tune]**. (This is the
deliberate v1 simplification — a fixed grace window, then loss of cooling. The `battery_low`
alarm fires at 20 %.)

### 9.6 Core uncovery and damage
Once injection stops (RCIC failed, no ADS+LPCI), decay heat boils away inventory unopposed
(§6.2): level falls, the core uncovers (level < 20 %), fuel temperature rises, damage follows.
**The timeline from cooling-loss to uncovery (2–4 hours) is a tuning target** (§6.2).

### 9.7 Standby Liquid Control — SLC (D1 — built, folded in)

Sodium-pentaborate injection that shuts the reactor down via **negative reactivity even if the
rods will not insert** — the ATWS mitigation. A negative reactivity term `ρ_slc =
−slc_worth · slc_injected` ramps in as boron mixes (`slc_ramp_tau`) while the tank drains
(`slc_tank_drain_s`); the injected boron persists (stays in the core) after `stop_slc`.
```javascript
if (slc_active && slc_tank_pct > 0) {
    slc_injected += (1 - slc_injected) / slc_ramp_tau * dt;
    slc_tank_pct  = max(0, slc_tank_pct - 100 / slc_tank_drain_s * dt);
}
ρ_slc = -slc_worth * slc_injected;     // added to ρ_total (§4)
```
`slc_worth = 0.09`, `slc_ramp_tau = 45` s, `slc_tank_drain_s = 300` s **[tune]**. Commands
`initiate_slc` / `stop_slc`; `slc_active` / `slc_tank_pct` in `true_state` + `control_state`.
Verified: with `failure_to_scram` active (rods stay withdrawn), SLC drives power 100 % → ~0.2 %.

### 9.8 Low-Pressure Core Spray — LPCS (D4 — built, folded in)

A low-pressure spray onto the fuel, mirroring LPCI: injects only below the LPCI pressure
threshold, adding to the vessel level balance (§6.2). Gives a second low-pressure injection path.
```javascript
if (lpcs_running && vessel_pressure_mpa < lpci_threshold_pressure) lpcs_flow = lpcs_flow_normalized;
```
`lpcs_flow_normalized ≈ 0.04` **[tune]**. Commands `start_lpcs` / `stop_lpcs`; `lpcs_running` in
the contract; blocked by an (optional) `lpcs_blocked`.

### 9.9 Manual SRV depressurization (D6 — built, folded in)

An operator-opened relief valve for **controlled** depressurization — slower than ADS but fast
enough to out-vent decay steam to reach the < 1.03 MPa injection window, enabling a second,
operator-driven recovery path (**manual SRV → LPCS**) alongside ADS + LPCI.
```javascript
if (srv_manual_open) vessel_pressure_mpa += -(vessel_pressure_mpa - P_ambient) / srv_manual_tau * dt;
```
`srv_manual_tau = 150` s **[tune]**. Commands `open_srv_manual` / `close_srv_manual`;
`srv_manual_open` in the contract.

---

## 10. Rods and Scram

Bottom-entry, hydraulically-driven control rods (unlike the top-entry PWR/RBMK). Motion
mechanics as `CONTEXT.md §6.5` (228 steps). Rod reactivity uses SCRUVE (§4). **Scram is fast —
3.0 s full travel** (hydraulic drive, faster than the PWR's gravity drop) **[tune]**. Power
falls sharply on scram.

---

## 11. The Instrument Model (built-in plant system)

BWR instruments are part of this engine. Same machinery as every plant (lag/noise/range/
failure, advanced inside the step in simulated time, HR6; trips/alarms/gauges read these, not
truth, HR1). Failure modes via `set_instrument_failure` / `clear_instrument_failure`.

First-order lag → Gaussian noise (seedable PRNG, part of saved state) → range clamp.

**Vessel-level shrink-and-swell:** the vessel level indication transiently moves the **wrong
way** on rapid pressure changes (a pressure rise collapses voids, dropping apparent level):
```javascript
effective_level = true_level + swell_factor * power_rate_of_change;   // lag then acts on this
```
`swell_factor = 1.2` (BWR vessel) **[tune]**.

**BWR instrument set:**

| instrument_id | measures | lag (s) | noise σ | range |
|---|---|---|---|---|
| `power_range` | power % | 0.1 | 0.2 % | 0–120 % |
| `vessel_pressure` | MPa | 0.5 | 0.014 MPa | 0–10.3 MPa |
| `vessel_level` | % | 2.0 | 0.5 % | 0–100 % |
| `recirc_flow` | % rated | 1.0 | 1.0 % | 0–120 % |
| `steam_flow` | normalized | 1.0 | 0.01 | 0–1.2 |
| `fw_flow` | normalized | 1.0 | 0.01 | 0–1.2 |
| `core_void_fraction` | fraction | 1.0 | 0.01 | 0–1.0 |
| `turbine_rpm` | RPM | 0.5 | 2.0 RPM | 0–2200 | *(BOP §12.1)* |
| `condenser_vacuum` | kPa | 5.0 | 0.34 kPa | 0–102 | *(BOP §12.1)* |
| `mwe_output` | MWe | 0.5 | 1.0 MWe | 0–1300 | *(BOP §12.1)* |
| `rcic_status` | running/stopped | 0.0 | — | boolean |

Status readings the protection/alarm config also reads: `rps_scrammed`, `station_blackout`,
`battery_pct` (from `battery_charge_pct`). Instrument internal state (lag buffers, active
failures, PRNG state) is part of save/restore (§16).

**Actuation gate readings (required).** `BWR_ACTUATIONS` (§13) gates ADS on `hpci_unavailable` and
LPCI on `ads_open`, so the engine must also expose these as status readings M4's `evaluateCondition`
can resolve — otherwise ADS never auto-actuates and `ads_failure`/`lpci_failure` have nothing to
block:
```javascript
ads_open:         this.ads_open,                          // already in true_state (§16) — surfaced here for M4 too
hpci_unavailable: (!this.hpci_running && (this.hpci_failed || vessel_pressure_mpa < hpci_min_pressure)),  // HPCI not running and failed or unable to run
```
(`hpci_min_pressure` is HPCI's steam-drive cutoff — a `[tune]` parameter parallel to
`rcic_min_pressure` (0.69 MPa, §9.1); define it with HPCI in §9.2 and list it in §19.)

**Failure-mode parameterization.** `stuck` with no value freezes at the reading **at injection time**
(stuck-at-current — backs `vessel_level_sensor_failure`, §13; during the uncovery branch a stuck
level sensor hides the falling level, the BWR's headline information failure); `drift` carries a
`rate` (units/s, sim time); `noisy` carries a `scale`. These join the saved instrument-failure state
(§16). The physics keeps using true level; only the indication is corrupted.

---

## 12. Pressure and Level Control (direct-cycle coupling)

Because the cycle is direct, core power changes immediately affect steam production and thus
pressure and level — tighter coupling than the PWR's indirect cycle. Pressure control is via
steam flow to the turbine (`set_turbine_load`) and relief valves; level control is via
feedwater (`set_feedwater_flow`). The turbine-trip transient (§7.3) is the characteristic
expression of this coupling.

### 12.1 Balance of plant — turbine / condenser / generator (built, folded in)

So the BWR can be operated **full-scope** (electrical output, turbine trip/coastdown, condenser
vacuum) like the PWR, the engine carries a behavioral turbine/condenser/generator, mirroring the
PWR (`M1 §6.8`). Direct cycle: `steam_flow_normalized` **is** the steam drawn by the turbine, so
electrical output tracks it (reactor power the turbine doesn't take is dumped/relieved). 1800 rpm.
```javascript
condenser_vacuum_kpa += ((cooling_available ? vacuum_rated : vacuum_lost) - condenser_vacuum_kpa) / tau * dt;
if (condenser_vacuum_kpa < vacuum_trip_kpa) tripTurbine();     // steam_flow_normalized = 0
synced = !turbine_tripped && !turbine_blocked && steam_flow_normalized > 0 && condenser_vacuum_kpa >= vacuum_trip_kpa;
if (synced) turbine_rpm += (rpm_rated - turbine_rpm) / 0.5 * dt;
else        turbine_rpm += (steam_flow_normalized*torque_per_flow*rpm_rated - windage*turbine_rpm) / turbine_inertia * dt;
mwe_output = steam_flow_normalized * mwe_rated * (turbine_rpm/rpm_rated) * (condenser_vacuum_kpa/vacuum_rated);
```
`rpm_rated = 1800`, `rpm_overspeed_trip = 1980`, `turbine_inertia = 50`, `windage = 1.0`,
`vacuum_rated = 96.5` kPa, `vacuum_lost = 16.9`, `vacuum_trip_kpa = 74.5`,
`vacuum_restore_tau/decay_tau = 10/30` s; `mwe_rated = 1100` (top-level) **[tune]**.

**Steam dump / turbine bypass** (§6.1): auto-opens above `steam_dump_setpoint = 7.25` MPa
(band 0.30 — ordered above rated 7.03 so the §7.3 void-collapse transient still fires, and below
the SRV relief 7.58), a manual override wins. **Gated on `condenser_cooling_available`** — inert
during **station blackout** (no AC → no condenser), so the SRVs alone hold vessel pressure and
keep RCIC's steam drive alive: **the Fukushima timeline is unchanged**. `condenser_cooling_available`
is set false by `post_scram_sbo`, `full_blackout_bwr`, and `loss_of_condenser_vacuum`. Command
`set_steam_dump {mode: "auto"|"open"|"closed" | pct}`. Added to `true_state`: `mwe_output`,
`turbine_rpm`, `condenser_vacuum_kpa`, `turbine_tripped` (additive to `CONTEXT §6.3`).

---

## 13. Protection, Actuation, Alarms, Failures (data — read by M4)

All read instruments (HR1).
```javascript
BWR_TRIPS = [
    ("power_range",     "high", 120.0,  "scram"),   // %
    ("vessel_pressure", "high", 7.58, "scram"),  // MPa
    ("vessel_pressure", "low",  5.52,  "scram"),  // MPa (loss of coolant)
    ("vessel_level",    "low",  10.0,   "scram"),   // %
];
BWR_ACTUATIONS = [
    ("vessel_level",    "low", 50.0,  "set_rcic"),     // {action:"set_rcic", active:true}
    ("fw_flow",         "low", 5.0,   "set_rcic"),     // nearly no feedwater
    ("vessel_level",    "low", 30.0,  "set_hpci"),     // {action:"set_hpci", active:true}
    ("vessel_level",    "low", 15.0,  "trigger_ads",  condition="hpci_unavailable"),
    ("vessel_pressure", "low", 1.03, "start_lpci",   condition="ads_open"),
];
BWR_ALARMS = [
    ("vessel_level_low",   "vessel_level",    "low",     30.0,   "warning", "A","Vessel Level Low","VESSEL LVL LO"),
    ("vessel_level_lo_lo", "vessel_level",    "low",     10.0,   "critical","A","Vessel Level Critical Low","VESSEL LVL LO LO"),
    ("vessel_press_hi",    "vessel_pressure", "high",    7.24, "warning", "A","Vessel Pressure High","VESSEL PRESS HI"),
    ("rcic_running",       "rcic_status",     "is_true", null,   "status",  "B","RCIC Running","RCIC RUNNING"),
    ("sbo",                "station_blackout","is_true", null,   "critical","B","Station Blackout","SBO"),
    ("battery_low",        "battery_pct",     "low",     20.0,   "warning", "B","Battery Power Low","BATT LO"),
];
```
Failures (kind per HR7 — `severity_meta`, engineering-unit slider metadata with schema in M4, is
inlined on every `severity_scales` failure):
```javascript
BWR_FAILURES = {
  rcic_failure:     { type:"physics_parameter", effect:"stop_rcic", display:"RCIC Failure" },
  hpci_failure:     { type:"physics_parameter", effect:"stop_hpci", display:"HPCI Failure" },
  station_blackout: { type:"physics_parameter", effect:"full_blackout_bwr", display:"Station Blackout" },
  loss_of_feedwater:{ type:"command_override", intercepts:["set_feedwater_flow"], override_value:0.0, display:"Loss of Feedwater" },
  turbine_trip:     { type:"command_override", intercepts:["set_turbine_load"],   override_value:0.0, display:"Turbine Trip" },

  failure_to_scram: { type:"command_override", intercepts:["scram"], effect:"block", display:"Failure to Scram (ATWS)" },
  ads_failure:      { type:"command_override", intercepts:["trigger_ads"], effect:"block", display:"ADS Failure (won't open)" },
  lpci_failure:     { type:"command_override", intercepts:["start_lpci"], effect:"block", display:"LPCI Failure" },
  recirc_pump_trip: { type:"physics_parameter", effect:"coast_down_recirc", display:"Recirculation Pump Trip" },
  loss_of_condenser_vacuum: { type:"physics_parameter", effect:"vacuum_decay", display:"Loss of Condenser Vacuum" },  // BOP (§12.1)
  srv_stuck_open:   { type:"physics_parameter", effect:"stuck_relief_open", severity_scales:"relief_area",
                      severity_meta:{ label:"Break Size", unit:"% effective area", min:0, max:100, default:30 }, display:"Safety/Relief Valve Stuck Open" },
  early_battery_failure:{ type:"physics_parameter", effect:"degrade_battery", severity_scales:"battery_duration_fraction",
                      severity_meta:{ label:"Battery Life", unit:"% of 8 h", min:100, max:25, default:60, invert:true }, display:"Early Battery Depletion" },
  vessel_level_sensor_failure:{ type:"instrument", instrument_id:"vessel_level", mode:"stuck", display:"Vessel Level Sensor Stuck" },
  msiv_closure:     { type:"command_override", intercepts:["set_turbine_load"], override_value:0.0, display:"MSIV Closure" },
};
```
The engine implements the physics-parameter effects (`stop_rcic`, `stop_hpci`,
`full_blackout_bwr` → drop AC: lose recirc + main feedwater, start the battery timer §9.5; and the
newer effects in §13.1); M4 intercepts the command-override failures. `block`-tagged failures use
M4's command-block effect (ADS/LPCI/scram dropped). `lpci_failure` blocks `start_lpci`, which carries
both the manual command and the auto-actuation (both route through M4).

### 13.1 Physics-parameter failure effects — implementation

One new term (`stuck_relief_open`), one timer scalar (`degrade_battery`), one reuse
(`coast_down_recirc`). `[tune]` arbitrated by §18.

```javascript
this._fail = {
  srv_stuck_open: { active:false, area:0 },             // 0..1 effective relief area
  battery:        { active:false, duration_factor:1 },  // scales battery_duration_hours
  // coast_down_recirc toggles recirc_pump_running directly — no _fail entry
};
applyPhysicsFailure(effect, severity = 1.0) {
  switch (effect) {
    case "stuck_relief_open": this._fail.srv_stuck_open = { active:true, area: severity }; break;
    case "degrade_battery":   this._fail.battery = { active:true, duration_factor: 1.0 - BATTERY_MAX_DEGRADE * severity }; break; // [tune] ~0.75
    case "coast_down_recirc": this.recirc_pump_running = false; break;
  }
}
clearPhysicsFailure(effect) { /* .active=false / duration_factor=1 / recirc_pump_running=true */ }
```

**`stuck_relief_open` — new term (§6.1 + §6.2).** A relief valve sticks open independent of ADS:
continuous blowdown drops pressure and the escaping steam is lost inventory. **The interaction is
the lesson and needs no special-casing** — as pressure falls below `rcic_min_pressure` (0.69 MPa),
the §9.1 guard stops RCIC on its own, so a stuck SRV silently defeats the system holding the core
covered (and can drag pressure under the LPCI threshold):
```javascript
// after §6.1:
if (this._fail.srv_stuck_open.active) {
    const s = this._fail.srv_stuck_open.area;
    const blow = SRV_BLOWDOWN_COEFF * s * (vessel_pressure_mpa - P_ambient);     // [tune]
    vessel_pressure_mpa = Math.max(P_ambient, vessel_pressure_mpa - blow * dt);
}
// in the §6.2 dVesselLevel_dt balance, add an inventory sink:
//   - (this._fail.srv_stuck_open.active ? SRV_INVENTORY_RATE * this._fail.srv_stuck_open.area : 0)   // [tune]
```

**`degrade_battery` — timer scalar (§9.5).** Scale the effective battery duration so RCIC fails
before the 8 h window. Injecting mid-SBO recomputes the charge against the shorter duration, so it
steps down at injection (a fault discovered partway through):
```javascript
const eff_hours = battery_duration_hours * (this._fail.battery.active ? this._fail.battery.duration_factor : 1.0);
battery_charge_pct = clip(100.0 * (1.0 - sbo_elapsed / (eff_hours * 3600.0)), 0, 100);
if (battery_charge_pct <= 0.0) rcic_running = false;
```

**`coast_down_recirc` — reuse (§7.1).** `recirc_pump_running = false` → drive flow coasts down over
`tau_coastdown` (6 s) → natural circulation (§7.2). At power this is a characteristic **power
runback** (core flow ↓ → void ↑ → negative void coefficient lowers power, settling at natural-circ).
`clear_failure` reverses each effect.

---

## 14. Named Initial States

- **`full_power`** — 100 % power, all systems normal: rods at operating positions, full recirc
  flow, vessel 7.03 MPa / nominal level, xenon at equilibrium, turbine drawing rated steam.
- **`50_percent`** *(built, folded in)* — stable partial power for maneuvering practice: reduced
  recirc drive (`recirc_pct ≈ 19` → core flow ~48 %) so the **negative void feedback** settles
  power near 50 % (tuned); ~half electrical output. Matches the PWR's `50_percent` envelope. (The
  BWR trims `rho_excess` ONCE at full power, so this state relies on flow, not a per-state trim.)
- **`hot_startup`** *(built, folded in)* — subcritical hot standby / approach-to-criticality
  start: low power (~2 %), flow established. **Special-cased in `reset()`:** because the fixed
  full-power `void_ref` (0.45) imposes a large *positive* void reactivity at low void (which would
  self-drive any low-power state to the flow/void balance — there is no stable near-zero point
  under the base trim), the startup state alone **pins `void_ref` at its low operating void and
  trims critical there** (mirroring the RBMK's per-state pinning), then inserts the control group
  a subcritical margin (BWR `steps` = withdrawn, so *decrease* steps). The operator withdraws to
  criticality and ascends (raising recirc to climb), watching `startup_rate_dpm`. **Every other
  state keeps the base full-power trim unchanged**, so `full_power` / `50_percent` /
  `post_scram_sbo` and the Fukushima flagship are intact. The engine exposes `startup_rate_dpm`
  (= 26.06·Ṗ/P) and `reactor_period_s` (= P/Ṗ) in `true_state` (built, additive — like the PWR).
- **`post_scram_sbo`** — **the Fukushima start**: scrammed (decay heat continuing), station
  blackout active (no AC; recirc and main feedwater gone), RCIC just started and holding level.
  Ready to run the scenario.

---

## 15. The Fukushima Sequence the Engine Must Make Possible

The Instructor scripts it (M6); the engine must make it physically reproducible, including both
outcomes, and **get the timeline approximately right** (hours of grace, then a window to
uncovery). Time acceleration (`set_speed`) is used to move through the hours.

1. Reactor at power; a scram succeeds — chain reaction stops, decay heat continues.
2. **Station blackout** simultaneously — all AC lost; recirc and main feedwater gone.
3. RCIC auto-starts on low level and, on battery control power + reactor steam, holds vessel
   level. The core stays covered. **This holds for hours — the grace window.**
4. The batteries deplete (§9.5). RCIC fails. Injection stops.
5. Decay heat boils away inventory unopposed; level falls; within a further window the core
   uncovers (< 20 %) and damage begins.

Parallel teaching run (the intervention):

6. After RCIC fails, the operators actuate ADS (`trigger_ads`), lowering vessel pressure; once
   below the LPCI threshold, LPCI injects (`start_lpci`), restoring level and keeping the core
   covered. **Same accident, different action, core saved.**

Both outcomes — damage without the intervention, saved with it — must be reachable from the
same start.

---

## 16. The Contract Surface (for M4/M5)

`step(dt_effective)`; `getTrueState()` → the BWR `true_state` block (`CONTEXT.md §6.3`, incl.
`core_void_fraction`, `rcic_running`, `hpci_running`, `ads_open`, `lpci_running`,
`lpcs_running`, `srv_manual_open`, `slc_active`, `slc_tank_pct` (§9.7–9.9),
`station_blackout`, `battery_charge_pct`, `destruction_cause`, `reactivity_pcm`, and the BOP
fields `mwe_output`/`turbine_rpm`/`condenser_vacuum_kpa`/`turbine_tripped` (§12.1));
`getInstruments()` → §11 (incl. the BOP instruments); `getControlState()` → `CONTEXT.md §6.5`
(rod groups + `recirc_flow_setpoint_pct`, `ads_armed`, `slc_active`, `feedwater_flow_pct`,
`turbine_load_mwe`, `steam_dump_pct`/`steam_dump_auto`); `applyCommand(command)` for the BWR
commands in `CONTEXT.md §6.7` (`set_recirc_flow`, `set_feedwater_flow`, `set_turbine_load`,
`trigger_ads`, `start_lpci`, `set_rcic`, `set_hpci`, `initiate_slc`/`stop_slc`,
`start_lpcs`/`stop_lpcs`, `open_srv_manual`/`close_srv_manual`, `set_steam_dump`, rod commands);
`saveState()`/`loadState()` (§17); the scenario suite (§18). The engine never evaluates
trips/alarms or assembles the snapshot.

---

## 17. Save and Restore

`saveState()` captures everything affecting future behavior so a restore continues identically:
kinetics (P, six Cᵢ), xenon/iodine, fuel temperature, vessel pressure/level, void, core/recirc
flow, rod positions/motion, every safety-system state (`rcic_running`, `hpci_running`,
`ads_open`, `lpci_running`, plus `lpcs_running`, `srv_manual_open`, and SLC `slc_active` /
`slc_injected` / `slc_tank_pct`, §9.7–9.9), the BOP state (`turbine_rpm`, `condenser_vacuum_kpa`,
`turbine_tripped`, `condenser_cooling_available`, `steam_dump_override`; §12.1),
`station_blackout` and the **SBO battery timer** (`sbo_elapsed` /
`battery_charge_pct`), active failures — and the instrument model's internal state (lag
buffers, active instrument failures, PRNG state). Omitting the battery timer or lag buffers
would diverge a replay. The §17 save/restore test asserts exact fidelity. "Active failures" includes
the §13.1 `_fail` state (`_fail.srv_stuck_open`, `_fail.battery`); `recirc_pump_running` and the SBO
timer are already saved. Run the §18 save/restore test **mid-`stuck_relief_open`** and **with
`degrade_battery` active** to catch a missing `_fail` field. (Note: scenarios run
under time acceleration; because all time constants are in simulated time, HR6, the battery
window and uncovery timeline stay correct regardless of acceleration.)

---

## 18. Acceptance — the BWR Scenario Test Suite

**This suite is the acceptance gate and the precise behavioral contract.** Build with the
[tune] starting values, run the suite, read which behaviors are off, adjust, repeat. Tests
live on the engine (`BWRScenarioTests`) and call it directly.

**Steady operation.** From `full_power`: power, vessel pressure/level, void hold within bands;
reactivity ≈ critical; stable. *Confirms the feedbacks balance.*

**Flow-control behavior (the BWR's signature).** Increase recirculation flow → voids swept out →
power **rises** and settles at a new balance (no runaway); decrease flow → power **falls** and
settles. Direction correct, stable, self-limiting. *Confirms the negative void coefficient and
flow control.* Failure here points at `α_void` / `void_scale_factor`.

**Natural circulation.** On loss of forced flow at reduced power, core flow establishes at a
meaningful natural-circulation value (not zero) and the core stays cooled. *Confirms §7.2.*

**Turbine-trip transient.** Trip the turbine → vessel pressure spikes → voids collapse → a brief
power rise → protection/relief respond. The §7.3 transient occurs. *Confirms the characteristic
direct-cycle behavior.*

**Shutdown.** Fast scram (3.0 s) → power falls sharply; decay heat persists. *Confirms fast
scram and decay heat.*

**Flagship — Fukushima (both outcomes, the comparison).** The most important test, run under
time acceleration:
- From `post_scram_sbo` (scram + simultaneous SBO): RCIC auto-starts on low level and **holds
  the core covered for hours without AC power** (vessel level stays up while RCIC runs).
- The **batteries deplete** after ~8 h (§9.5) → RCIC fails → injection stops → decay heat boils
  off inventory → **the core moves toward uncovery** (level falls below 20 %) within a further
  2–4 h, and damage begins (fuel temp rises). This is the **damage** branch.
- **Intervention branch:** after RCIC fails, actuate ADS → vessel depressurizes → once below
  the LPCI threshold, LPCI injects → **vessel level stabilizes and the core is saved**
  (`melted` never set).
- The **comparison test** runs both branches from the same start and asserts the divergent
  outcomes — core damaged without the intervention, core saved with it (taken in time).
  *This validates the engine's central educational purpose.*

Tuning guidance the test output should point at: RCIC failing too soon → the `battery_duration`
or grace-window parameter; uncovery arriving too fast/slow after RCIC fails → `vessel_water_mass`
vs `boiloff` (decay heat); LPCI not restoring level → `ads_depressurization_tau` /
`lpci_threshold_pressure` / `lpci_flow_normalized`.

**Physics-level failure behavior.** `rcic_failure` / `hpci_failure` stop those systems;
`station_blackout` drops AC (recirc + main feedwater lost, RCIC continues, battery timer
starts). Each changes the physics correctly. The §13.1 effects: *SRV stuck open* — pressure and
level fall, and once pressure < `rcic_min_pressure` RCIC flow ceases even with `rcic_running`, so
uncovery accelerates; *degrade battery* — from `post_scram_sbo`, RCIC fails well before 8 h, earlier
uncovery; *recirc pump trip* — at power, core flow coasts to natural circulation, void rises, power
runs back and settles; *vessel level stuck* — during uncovery the reading freezes while true level
falls. *Actuation gates (wiring, via §11):* drive level down with HPCI unavailable → ADS
auto-actuates; `ads_open` true → LPCI arms below threshold; then inject `ads_failure` → `trigger_ads`
blocked → `ads_open` stays false → LPCI never fires → uncovery.

**Startup / approach-to-criticality (§14 `hot_startup` — built, folded in).** From `hot_startup`:
the reactor sits **subcritical** (ρ < 0) near zero power; withdrawing the control group takes it
critical and into a controlled ascension (`startup_rate_dpm` goes positive) with no destruction.
*(Suite: `startup`.)*

**Balance of plant (§12.1 — built, folded in).** From `full_power`: electrical output ≈ rated
MWe (1100) with the turbine synced at 1800 rpm and rated condenser vacuum; MWe tracks the
`set_turbine_load` command; a `turbine_trip` collapses MWe and coasts the turbine down while the
steam dump opens (condenser available); `loss_of_condenser_vacuum` decays vacuum below the trip
and trips the turbine; the `50_percent` state holds ~50 % power and ~half MWe, stable; and — the
Fukushima-preserving check — from `post_scram_sbo` the condenser/dump is **unavailable**
(`steam_dump_frac == 0`) so the SRVs hold pressure. *(Suite: `balance_of_plant`.)*

**Save and restore.** Save mid-blackout (RCIC running, battery partly depleted), restore into a
fresh engine, confirm the run continues identically — including the battery timer and instrument
lag/noise state. Run this **with a failure active** (mid-`stuck_relief_open` / degraded battery) to
confirm the §13.1 `_fail` state round-trips.

When this suite passes — including the flagship hold-then-uncover sequence and the
with/without-intervention comparison — the BWR physics is done and correct.

---

## 19. BWR Starting Parameters ([tune] — collected)

| Parameter | Start | Tune against |
|---|---|---|
| `Λ` (BWR) | 0.00005 s | fixed |
| `α_D` (Doppler) | −2.0e−5 K⁻¹ | steady state |
| `α_void` | −0.15 | flow-step test |
| `void_ref` | 0.40 | steady void |
| `rod_worth_total` | 0.10 | rod worth, criticality |
| `xenon_worth / sigma_phi` | 0.025 / 2.0e−5 | xenon transient |
| `H1_0/λ1, H2_0/λ2` | 0.05/5e−4, 0.02/2e−5 | post-scram cooling, **Fukushima timeline** |
| `h_fc_bwr` | 0.05 s⁻¹ | fuel temperature |
| `heat_gen_coeff_bwr` | (→ appropriate fuel temp) | fuel temperature |
| `void_scale_factor` | 0.45 | void at rated conditions |
| `void_response_tau_bwr` | 1.5 s | void lag |
| `K_vessel_pressure` | 2.5 | vessel pressure |
| `K_vessel_level` | 5.0 | vessel level |
| `latent_heat_bwr / vessel_water_mass` | 1.0 / 1.0 | **uncovery timeline** (with RCIC flow) |
| `jet_pump_m_ratio` | 1.5 | core flow vs drive flow |
| `natural_circ_coeff` | 0.30 | natural circulation |
| `tau_coastdown` (recirc) | 6.0 s | pump trip transient |
| `void_collapse_coeff` | 0.145 /MPa | turbine-trip transient |
| `rcic_flow_normalized` | 0.01 | **core-coverage duration** |
| `rcic_steam_consumption` | 0.002 | RCIC steam draw |
| `rcic_min_pressure` | 0.69 MPa | RCIC steam cutoff |
| `rcic_start_level` | 50 % | RCIC auto-start |
| `battery_duration_hours` | 8.0 h | **RCIC runtime / grace window** |
| `ads_depressurization_tau` | 600 s | ADS depressurization timing |
| `lpci_threshold_pressure` | 1.03 MPa | ADS + LPCI intervention timing |
| `lpci_flow_normalized` | 0.05 | LPCI injection |
| `lpcs_flow_normalized` | 0.04 | LPCS core spray (D4, §9.8) |
| `srv_manual_tau` | 150 s | manual SRV depressurization (D6, §9.9) |
| `slc_worth / slc_ramp_tau / slc_tank_drain_s` | 0.09 / 45 s / 300 s | Standby Liquid Control (D1, §9.7) |
| `swell_factor` (vessel) | 1.2 | vessel level indication transient |
| **BOP (§12.1):** `rpm_rated / rpm_overspeed_trip` | 1800 / 1980 rpm | turbine speed / overspeed |
| `turbine_inertia / windage / torque_per_flow` | 50 / 1.0 / 1.0 | turbine coastdown |
| `vacuum_rated / vacuum_lost / vacuum_trip_kpa` | 96.5 / 16.9 / 74.5 kPa | condenser |
| `vacuum_restore_tau / vacuum_decay_tau` | 10 / 30 s | vacuum response/lag |
| `steam_dump_setpoint / band / max` | 7.25 MPa / 0.30 / 1.0 | turbine bypass (condenser-gated) |

**Operating points / fixed:** vessel 7.03 MPa, relief 7.58 MPa; `max_steps` 228; scram 3.0 s;
melt 2800 °C (damage onset 1200 °C); trip/alarm setpoints per §13; `post_scram_sbo` preset:
scrammed + SBO + RCIC running.
