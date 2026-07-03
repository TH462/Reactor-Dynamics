# M1 — PWR Engine

**Build this module from `CONTEXT.md` + this file alone.** No other module is required.
This is the complete specification for the Pressurized Water Reactor engine: its kinetics
core, its thermal-hydraulics, its built-in instrument model, its protection/alarm/failure
configuration, the Three Mile Island sequence it must make possible, and the scenario test
suite that is its acceptance gate.

`CONTEXT.md` already defines the things common to every module — the hard rules, the
snapshot/command contract, the named field vocabulary, the scope boundaries, the time step,
determinism, and conventions. **Do not re-derive those here; rely on them.** This file adds
the PWR implementation. Where a value is marked **[tune]**, it is a starting point; the
scenario tests (§14) are the final arbiter. Values not marked [tune] are fixed.

The engine makes **no control decisions** (HR2) and never reads its own instruments to
decide anything — it computes physics, exposes direct controls, and produces both true state
and instrument readings. Trips, actuation, and alarms are the Control & Failure Layer's job
(M4); this engine only defines them as *data* (§9) and exposes the instruments they read.

---

## 1. The Build Target

Per the file structure in `CONTEXT.md §7`, this module produces `engines/pwr/`:

| File | Contents |
|------|----------|
| `pwr_engine.js` | The `PWREngine` class (the simulator object) **and** `PWRScenarioTests` (§14) |
| `pwr_config.js` | All PWR parameters as a structured config object (HR8) — every [tune] value, operating points, the trip/alarm/failure definitions of §9 |
| `pwr_instruments.js` | The PWR instrument model (§8) — the instrument set, lag/noise/range/failure behavior, derived subcooling, the PORV commanded-vs-actual indicator |
| `pwr_thermal.js` | Fuel + coolant temperatures, subcooling, void, fuel-damage endpoint (§6.1–6.3, §6.9) |
| `pwr_pressurizer.js` | Pressurizer pressure, heater/spray, PORV + safety valves, surge line and level — the TMI level behavior (§6.4) |
| `pwr_primary.js` | Primary loop temperatures, inventory + voiding, pumps + coastdown (§6.5–6.6) |
| `pwr_steam_generator.js` | SG heat transfer, level, steam pressure/flow, feedwater + AFW, turbine + condenser (§6.7–6.8) |
| `pwr_protection.js` | The PWR trip, actuation, and alarm definitions as data (§9) — read by M4 |

Internal structure within these files is yours. The **contract surface** the engine must
expose (consumed by M4/M5): step the sim by `dt_effective`; report true state; produce
instrument readings; accept the PWR commands from `CONTEXT.md §6.7`; save and restore
complete state (§13); run its scenario suite (§14).

### The PWR in one line

The stable, intuitive reactor (see `CONTEXT.md §5`). Negative feedbacks oppose change; it
self-regulates. Operating point: primary ≈ **15.41 MPa**, coolant average ≈ **304 °C**, full
electrical output ≈ **1000 MWe**. One control rod group + one shutdown group. Host of Three
Mile Island — an accident of *information*, which is why the PORV indicator must be able to
lie while the subcooling margin tells the truth.

---

## 2. Units Convention

Contract fields use the suffixed units from `CONTEXT.md §6.3` — PWR temperatures in **°C**,
pressures in **MPa**, levels in **%**, flows **normalized to rated**. Internally, track
each quantity in one consistent unit and convert only at the snapshot boundary.

One subtlety to keep straight: the **feedback coefficients** (Doppler, MTC) are given per
Kelvin (`K⁻¹`), i.e. per unit *temperature difference* (1 K = 1 °C = 1.8 °F of difference).
The **fuel-damage thresholds** are given in °C (1200 / 2800 °C ≈ 2192 / 5072 °F). Because the
feedback coefficients are [tune], the precise internal unit is less important than
consistency — the engine works in **SI throughout** (°C, MPa), applies the per-K (= per-°C)
coefficients to temperature differences directly, and reports `fuel_temp_c`, `tavg_c`,
`thot_c`, `tcold_c` in °C in the snapshot (the UI converts for display, M8).

---

## 3. Point Kinetics Core (the PWR's own copy)

The PWR carries its own copy of the six-group point-kinetics integrator. (Each engine does;
there is no shared kinetics file. The three copies are identical except for `Λ` and the
RBMK's prompt fast-path, which the **PWR does not have** — it never reaches prompt
criticality under any in-scope scenario.)

**The equations** — power (normalized to rated) and six delayed-neutron precursor groups:

```
dP/dt   = [(ρ − β) / Λ] · P + Σᵢ λᵢ Cᵢ
dCᵢ/dt  = (βᵢ / Λ) · P − λᵢ Cᵢ        for i = 1..6
```

Integrate with first-order **Euler** at the engine's `dt_effective` (see `CONTEXT.md §4`):
`x_new = x_old + (dx/dt)·dt`. Floor power at 0: `P = max(0, P + dP_dt·dt)`.

**Six-group delayed-neutron parameters** (U-235; fixed, do not change):

| Group | βᵢ | λᵢ (s⁻¹) |
|------:|----------|---------|
| 1 | 0.000215 | 0.0124 |
| 2 | 0.001424 | 0.0305 |
| 3 | 0.001274 | 0.111 |
| 4 | 0.002568 | 0.301 |
| 5 | 0.000748 | 1.14 |
| 6 | 0.000273 | 3.01 |

**β = 0.006502** (sum). **Λ = 0.01 s** (PWR prompt neutron generation time; fixed).

**Precursor initialization** at full-power equilibrium: `Cᵢ = (βᵢ / λᵢ)·P₀ / Λ` with
`P₀ = 1.0`. At zero power all precursors are 0.

**No prompt fast-path.** Standard Euler kinetics is sufficient for the PWR at the 0.02 s
step; `ρ` stays well below `β` in every scenario.

### Decay heat (persists after scram)

Two-term exponential, initialized at scram (the heat source behind TMI core damage and
post-shutdown cooling):

```javascript
dH1/dt = -lambda_1 * H1     // fast component
dH2/dt = -lambda_2 * H2     // slow component
H_total = H1 + H2
```
At scram: `H1_0 = 0.05`, `H2_0 = 0.02` (→ 7% of rated). `lambda_1 = 0.0005` s⁻¹,
`lambda_2 = 0.00002` s⁻¹ **[tune]**.

Total heat driving the thermal model: `Q_total = P_fission + H_total`. After scram the
fission term collapses and `H_total` persists.

---

## 4. Reactivity Feedbacks

Net reactivity each step is the sum (computed from the *previous* step's temperatures/states
— standard explicit coupling, `CONTEXT.md §11`):

```
ρ_total = ρ_rods + ρ_doppler + ρ_moderator + ρ_xenon + ρ_boron
```

These negative feedbacks are what make the PWR stable; the steady-state test (§14) confirms
they balance so the plant holds critical at the operating point. Set `T_fuel_ref` and
`T_coolant_ref` (the rated-power reference temperatures) so the feedbacks net to the steady
critical condition at `hot_full_power`.

**Doppler** (prompt, always negative — the fast self-stabilizer):
```
ρ_doppler = α_D · (T_fuel − T_fuel_ref)        α_D = −2.5e−5 K⁻¹   [tune]
```

**Moderator temperature coefficient** (PWR-specific; negative across the operating range):
```
ρ_MTC = α_MTC · (T_coolant − T_coolant_ref)    α_MTC = −3.3e−5 K⁻¹ [tune]
```

**Boron** (dissolved absorber, adjusted slowly via CVCS charging/letdown):
```
ρ_boron = −boron_worth_per_ppm · boron_ppm     boron_worth_per_ppm = 1.0e−4 [tune]
```
`boron_ppm` is a state variable changed at a rate set by the operator's `set_charging_flow` /
`set_letdown_flow` commands.

**Control rods** (SCRUVE S-curve worth — rods least effective near fully in/out, most in the
middle):
```javascript
function scruve(pos_norm) {            // pos_norm: 0 = fully inserted, 1 = fully withdrawn
    return pos_norm - Math.sin(2*Math.PI*pos_norm) / (2*Math.PI);
}
// position_withdrawn_normalized = steps / max_steps  (0 in, 1 out)
ρ_rods = -rod_worth_total * scruve(1.0 - position_withdrawn_normalized);
// 0 when fully withdrawn, maximally negative when fully inserted
```
`rod_worth_total = 0.085` (total control-group worth, ~8500 pcm) **[tune]**. Sum the control
group and (when inserted on scram) the shutdown group.

**Xenon** (slow neutron poison, evolving over hours; iodine-135 → xenon-135):
```javascript
// Normalized: I and X in units of equilibrium xenon at full power
dI_dt = gamma_I * P - lambda_I * I
dX_dt = lambda_I * I + gamma_X * P - lambda_X * X - sigma_phi * P * X
ρ_xenon = -xenon_worth * (X / X_eq)
```
Constants: `gamma_I = 0.061`, `gamma_X = 0.003`, `lambda_I = 2.87e−5` s⁻¹,
`lambda_X = 2.09e−5` s⁻¹ (fixed); `sigma_phi = 2.0e−5` s⁻¹ **[tune]**;
`xenon_worth = 0.025` **[tune]**. Equilibrium (at P=1): `I_eq = gamma_I/lambda_I`,
`X_eq = (lambda_I·I_eq + gamma_X)/(lambda_X + sigma_phi)`.

---

## 5. Per-Step Computation Order

Compute in this dependency order each step (internal code organization is yours; this is the
data dependency, not a structure prescription):

1. Total reactivity from current state (rods, Doppler, MTC, xenon, boron — §4).
2. Advance point kinetics → new power (§3).
3. Advance xenon/iodine (§4).
4. Heat generation = fission power + decay heat (§3).
5. Advance fuel temperature (§6.1).
6. Advance coolant average temperature; derive hot/cold legs (§6.2).
7. Advance primary pressure — pressurizer (§6.4).
8. Advance pressurizer level and SG level (§6.4, §6.7).
9. Advance primary inventory; check voiding/uncovery (§6.5).
10. Advance flows — pumps, coastdown (§6.6).
11. Advance SG steam pressure/flow, feedwater/AFW (§6.7).
12. Advance turbine/condenser (§6.8).
13. Apply emergency cooling effects (HPI/AFW) where active (§6.9).
14. Check fuel damage / melt (§6.10).
15. **Update instruments from the new true state** (§8) — last, so readings reflect this
    step's truth, lagged.
16. Compute the derived `subcooling_margin` instrument from instrument P and T (§8).

---

## 6. Thermal-Hydraulics

### 6.1 Fuel temperature

```javascript
// h_fc degrades on DNB and on core uncovery (see §6.5)
dTf_dt = P * heat_gen_coeff - h_fc_effective * (T_fuel - T_coolant);
T_fuel = T_fuel + dTf_dt * dt;
```
`heat_gen_coeff` chosen so rated power gives ≈ 389 °C fuel-above-coolant **[tune]**.
`h_fc = 0.05` s⁻¹ (normal); `h_fc_dnb = 0.004` s⁻¹ during departure from nucleate boiling
**[tune]**. **DNB triggers when the subcooling margin drops below zero** (coolant reaches
saturation). Then `h_fc_effective = h_fc_dnb`; otherwise `h_fc_effective = h_fc` (further
degraded on uncovery, §6.5).

### 6.2 Coolant temperature (two-node) and legs

```javascript
Q_fuel_to_coolant = h_fc * (T_fuel - Tavg);
Q_coolant_to_sg   = h_sg * flow_frac * (Tavg - T_secondary);   // T_secondary from §6.7
dTavg_dt = (Q_fuel_to_coolant - Q_coolant_to_sg) / coolant_heat_capacity;
Tavg = Tavg + dTavg_dt * dt;

delta_T = delta_T_rated * P / Math.max(flow_frac, 0.1);        // saturates at low flow
T_hot  = Tavg + delta_T / 2.0;
T_cold = Tavg - delta_T / 2.0;
```
`h_sg = 0.06` s⁻¹, `coolant_heat_capacity = 1.0`, `delta_T_rated = 33 °C` **[tune]**. The
`max(flow_frac, 0.1)` floor represents heat building locally when flow is lost (drives the
low-flow temperature excursion).

### 6.3 Subcooling — two distinct computations (important)

There are **two** subcooling numbers and they must not be confused:

- **True subcooling** (physics) — drives voiding (§6.5). Uses **true** P and Tavg:
  `true_subcooling = T_sat(P_true) − Tavg_true`.
- **Indicated subcooling margin** (the `subcooling_margin` instrument) — what the operator
  sees, what trips/alarms read. Derived from **instrument** P and T per HR1 (§8.6), so it
  inherits their lag and any failure. This is the parameter that tells the truth at TMI even
  while the PORV indicator lies.

Saturation temperature (good to ±2 °C over the PWR range):
```javascript
function T_sat_celsius(P_MPa) {
    const P_MPa = P_MPa / 145.038;
    return 179.47 * Math.pow(P_MPa, 0.239) - 273.15;   // °C
}
```

### 6.4 Pressurizer (pressure, heater/spray, PORV, safety valves, level)

Pressure evolves from the steam/water balance:
```javascript
dP_dt = (heater_power_frac * K_heater
         - spray_flow_frac  * K_spray
         - porv_flow        * K_porv_relief
         - safety_flow      * K_safety_relief
         - surge_out_rate   * K_surge
         + P_restore_rate);                 // small self-restoring term toward equilibrium
P_MPa = P_MPa + dP_dt * dt;
```
`K_heater = 8.0`, `K_spray = 25.0`, `K_porv_relief = 40.0`, `K_safety_relief = 60.0`,
`K_surge = 0.103` (MPa-rate units), equilibrium 15.41 MPa **[tune]**.

Heater/spray automatic behavior (proportional; operator may override via `set_heater` /
`set_spray`):
```javascript
const err = 2235 - P_MPa;
if (err > 0) { heater_power_frac = clip(err/30.0, 0, 1); spray_flow_frac = 0; }
else         { heater_power_frac = 0; spray_flow_frac = clip(-err/50.0, 0, 1); }
```
Bands 0.207/0.345 MPa **[tune]**.

PORV and spring-loaded safety valves (`porv_open` is the **actual** valve state — see the
stuck-open failure §9 and the lying indicator §8.5):
```javascript
// PORV: auto-opens at 2350, auto-closes (command) at 2300; can be stuck open
porv_flow   = porv_open   ? porv_flow_max   * Math.sqrt(Math.max(0,(P_MPa-15)/2235)) : 0;
// Safety valves: purely mechanical — open at 2485, reseat at 2400
if (P_MPa > 2485) safety_open = true;  else if (P_MPa < 2400) safety_open = false;
safety_flow = safety_open ? safety_flow_max * Math.sqrt(Math.max(0,(P_MPa-15)/2235)) : 0;
```
`porv_flow_max = 0.04`, `safety_flow_max = 0.10`, `P_containment = 0.103` MPa **[tune]**.

**PORV block/isolation valve (B1 — built, folded in).** A manually-operated block valve
upstream of the PORV gates **all** PORV flow: `porv_flow` is zeroed (relief *and* inventory
loss) when `block_valve_open` is false, even while the PORV itself is stuck open. This is the
real TMI recovery action — isolating a stuck-open PORV. Commands `open_block_valve` /
`close_block_valve`; `porv_block_open` in `control_state`. Default open (no effect until the
operator closes it). The spring safety valves are unaffected (mechanical, HR7).

**Pressurizer level — the TMI deception.** When the PORV is stuck open and the primary is
boiling, steam pushes liquid *into* the pressurizer, raising its level **even as total
inventory falls**. This is what misled the 1979 operators into throttling injection.
```javascript
thermal_surge = K_thermal_surge * dTavg_dt;              // expansion/contraction
void_surge    = K_void_surge   * primary_void_fraction;  // voiding pushes liquid up
surge_in_rate = thermal_surge + void_surge;
dPzrLevel_dt  = (surge_in_rate
                 - porv_flow   * level_loss_per_flow
                 - safety_flow * level_loss_per_flow) * K_level;
pzr_level_pct = clip(pzr_level_pct + dPzrLevel_dt * dt, 0, 100);
```
`K_thermal_surge = 12.0`, **`K_void_surge = 40.0`** (strong — tune so pzr level *rises* as
primary voiding begins while inventory falls), `level_loss_per_flow = 8.0`, `K_level = 1.0`
**[tune]**. *The TMI scenario test asserts pressurizer level rises while core inventory
falls; tune `K_void_surge` until this holds.* The PORV/safety discharge simply leaves the
primary inventory (§6.5); no discharge-tank model in v1.

### 6.5 Primary inventory and voiding

```javascript
dm_dt = (charging_flow + hpi_flow + safety_injection_flow
         - letdown_flow - porv_flow - safety_flow - leak_flow);
primary_mass = clip(primary_mass + dm_dt * dt, 0.0, 1.2);   // 1.0 = full
```
When the primary reaches saturation **(using true values)** and inventory is dropping, steam
voids form:
```javascript
true_subcooling = T_sat(P_true) - Tavg_true;
primary_void_fraction = (true_subcooling <= 0 && primary_mass < 1.0)
    ? clip((1.0 - primary_mass) * void_gain, 0, 1) : 0;
```
`void_gain = 3.0` **[tune]**. Uncovery thresholds: `< 0.85` core voiding begins; `< 0.70`
top of core uncovers; `< 0.50` significant uncovery → heat transfer degrades:
```javascript
if (primary_mass < 0.50) h_fc_effective = h_fc * (primary_mass / 0.50);  // → 0
```
This is the damage endpoint of the TMI-without-injection branch (fuel temp rises toward
melt).

**Chemical & Volume Control System (CVCS) — built, folded in.** The charging/letdown terms
above are the CVCS. **Charging** injects into the cold leg (inventory in, and it carries the
boron); it requires the **charging pump** (`set_charging_pump {running}`) and is set manually
(`set_charging_flow`) or by an **auto make-up** mode (`set_cvcs_auto {active}`) that modulates
charging up to `charging_max` to hold inventory — compensating identified leakage (`cvcs_makeup_gain`).
**Letdown** (`set_letdown_flow`) removes inventory. **Boron chemistry is decoupled** from the net
charging−letdown flow (the earlier coupling was non-physical): borate/dilute change concentration
directly via `set_boron_adjust {rate}` (ppm/s, + borate / − dilute), gated on the charging pump —
`boron_ppm += boron_adjust·dt`. Safety injection is HPI (§6.9). Auto make-up defaults **off** so
the flagship/TMI behavior is unchanged; `charging_max` (0.06) is sized to cover normal leakage but
not a LOCA. Spray takes suction from the cold leg after the RCP (§6.4), so its effect scales with
primary flow. Config: `boron_adjust_rate`, `cvcs_makeup_gain`, `charging_max` (§15).

### 6.6 Reactor coolant pumps and flow

```javascript
if (pump_running) flow_frac += (1.0 - flow_frac) / pump_spinup_tau   * dt;
else              flow_frac += (natural_circ_flow - flow_frac) / pump_coastdown_tau * dt;
flow_frac = clip(flow_frac, 0.0, 1.0);
```
`pump_spinup_tau = 3.0` s, `pump_coastdown_tau = 8.0` s, `natural_circ_flow = 0.0` (v1 does
not model PWR natural circulation — flow goes to zero on loss of all pumps; documented
simplification) **[tune]**. The **low-flow trip** reads true flow (`__true_flow__ < 0.25`),
the one documented HR1 exception — there is no flow instrument in v1 (§9).

### 6.7 Steam generators and secondary side

```javascript
T_secondary = T_sat(steam_pressure_mpa);           // secondary boils at its sat temp
Q_sg = h_sg * flow_frac * (Tavg - T_secondary);      // (same term as §6.2)
steam_generation_rate = Q_sg / latent_heat_secondary;

dSGLevel_dt = (feedwater_flow - steam_flow) * K_sg_level;
sg_level_pct = clip(sg_level_pct + dSGLevel_dt * dt, 0, 100);

dSteamP_dt = (steam_generation_rate - steam_flow) * K_steam_pressure;
steam_pressure_mpa = steam_pressure_mpa + dSteamP_dt * dt;
steam_flow = turbine_demand_frac * steam_flow_rated * (steam_pressure_mpa / steam_p_rated);
```
`latent_heat_secondary = 1.0`, `K_sg_level = 5.0`, `K_steam_pressure = 2.0`,
`steam_p_rated = 5.65` MPa, `steam_flow_rated = 1.0` **[tune]**. The true SG level here has no
shrink/swell — that is added in the instrument model (§8.4).

Feedwater and auxiliary feedwater:
```javascript
feedwater_flow = main_feedwater_available ? feedwater_demand_frac : 0.0;  // lost on failure
if (afw_active && sg_level_pct < afw_start_level) feedwater_flow += afw_flow_frac;
// AFW auto-start reads the INSTRUMENT (HR1) — actuation lives in M4; the engine exposes the effect
```
`afw_flow_frac = 0.15`, `afw_start_level = 20` % **[tune]**.

**Steam dump / turbine bypass (B2 — built, folded in).** A dump path vents steam straight to
the condenser (bypassing the turbine) to control SG pressure on a turbine trip / load
rejection. **Auto** opens proportionally above `steam_dump_setpoint` (6.0 MPa, band 0.45) — a
basic relief-to-condenser, the same class as the pzr heater/spray auto-control (allowed by
`CONTEXT §8`); a manual override wins. The dumped steam is additional steam-out in **both** the
SG pressure and level balances (`steam_out = steam_flow + dump`). Command `set_steam_dump
{mode: "auto"|"open"|"closed" | pct}`; `steam_dump_pct` / `steam_dump_auto` in `control_state`.

### 6.8 Turbine and condenser (behavioral)

```javascript
net_torque = steam_flow * torque_per_flow - generator_load * torque_per_load;
turbine_rpm += (net_torque / turbine_inertia) * dt;

if (condenser_cooling_available) dVac = (28.5 - vac) / vacuum_restore_tau;
else                             dVac = (5.0  - vac) / vacuum_decay_tau;   // slow → realistic lag
condenser_vacuum_kpa += dVac * dt;

mwe_output = P * mwe_rated * (turbine_rpm / 1800.0) * (condenser_vacuum / 28.5);
```
`turbine_inertia = 50.0` (coasts slowly), rated 1800 RPM, overspeed trip 1980 RPM,
`vacuum_rated = 96.5` kPa, `vacuum_lost = 16.9`, `vacuum_restore_tau = 10` s,
`vacuum_decay_tau = 30` s, turbine trips when vacuum < 74.5 kPa, `mwe_rated = 1000` **[tune]**.
On turbine trip `generator_load = 0` and steam demand drops to zero.

### 6.9 Emergency cooling

- **High-pressure injection (HPI):** injects against pressure; flow falls as primary pressure
  rises. `set_hpi {active}` (manual) or auto-actuates on low pressure (M4). Adds to
  `dm_dt` (§6.5). Whether HPI runs is decisive in TMI. `degraded_hpi` failure scales its
  flow (§9).
- **Auxiliary feedwater:** §6.7, a secondary-side heat-removal backup.
- **Decay heat removal:** arms on shutdown once cooled/depressurized enough; `set_dhr`.

(The full ECCS — low-pressure injection, accumulators — is deferred per `CONTEXT.md §8`.)

### 6.10 Fuel damage / melt endpoint

```javascript
if (fuel_temp_c > 1200) fuel_damaged = true;            // cladding failure, FP release begins
if (fuel_temp_c > 2800) { melted = true; if (destruction_cause === "none") destruction_cause = "thermal_melt"; }
```
Thresholds fixed (1200 / 2800 °C). The PWR reaches this only via the TMI-without-injection
uncovery path (or other severe loss of cooling).

---

## 7. Rod System

Two groups (see `CONTEXT.md §6.5` for the `rod_groups` snapshot shape): a **control group**
the operator moves, and a **shutdown group** that stays fully withdrawn and only drives in on
scram (it is *not* an operator control).

```javascript
// Motion: 228 steps full travel; accumulate sub-step motion
step_accumulator += Math.abs(velocity_steps_per_s) * dt;
const dir = withdrawing ? +1 : -1;
while (step_accumulator >= 1.0) {
    position = clip(position + dir, 0, max_steps);       // 0 = fully in, 228 = fully out
    step_accumulator -= 1.0;
    if (position === 0 || position === max_steps) { velocity = 0; break; }   // stop at limits
}
```
Selectable speeds: slow 8 steps/min (0.133/s), normal 48 (0.800/s), fast 72 (1.200/s).
`max_steps = 228`.

**Insertion limits:** the control group has a power-dependent insertion limit; crossing it
sets `at_insertion_limit` (an alarm condition, §9). The shutdown group has none.

**Scram** (both groups drive in under gravity):
```javascript
velocity_steps_per_s = -(position / scram_insertion_time_s);
```
Control group **2.5 s** full travel; shutdown group **2.0 s** (slightly faster — pre-loaded)
**[tune]**. Insertion is a real over-time event — the dynamics matter for how power falls;
do not apply scram as an instantaneous reactivity change.

---

## 8. The Instrument Model (built-in plant system)

The PWR's instruments are part of this engine (treated like any other plant system). They sit
between true state and what the operator sees, and they are what realizes the defining
principle: trips, alarms, and gauges all read these, never true state (HR1). The model
advances inside the engine step using `dt_effective` (HR6), so lag is in *simulated* time and
stays correct under time acceleration.

### 8.1 First-order lag
```javascript
const alpha = dt / (lag_seconds + dt);
reading_lagged += alpha * (true_value - reading_lagged);
```
Discrete equivalent of `τ·dy/dt = x − y`.

### 8.2 Gaussian noise (seedable PRNG — part of saved state, `CONTEXT.md §4`)
```javascript
reading_noisy = reading_lagged + gaussianRandom(0.0, noise_sigma);  // independent each step
```

### 8.3 Range
Each reading pegs at its range limits — the instrument cannot indicate beyond what it can
measure.

### 8.4 Shrink-and-swell (SG level)
The SG level indication transiently moves the **wrong way** on rapid power changes:
```javascript
effective_level = true_level + swell_factor * power_rate_of_change;   // smoothed dP/dt
// the lag filter (§8.1) then acts on effective_level, so the transient appears then fades
```
`swell_factor = 0.8` (PWR SG) **[tune]**.

### 8.5 PORV position indicator — reports **commanded**, not actual
```javascript
porv_indicator = porv_commanded_open ? "open" : "closed";   // NOT porv_actually_open
```
When the PORV sticks open, the command is "close" so `porv_commanded_open = false`, but the
valve is actually open. The indicator reads **closed** while the valve is open — the TMI
deception. (The `porv_indicator_stuck_closed` failure §9 forces this independently of
command, as a distinct instrument failure.)

### 8.6 Derived: subcooling margin
`subcooling_margin` is computed from the **instrument** pressure and temperature (not true
state), so it lags and inherits their errors (§6.3). It is the diagnostic that holds the
truth at TMI while the PORV indicator lies.

### 8.7 Failure modes
Any instrument can be made to **stick** (freeze at a value), **drift** (read progressively
off), go **dead** (bottom out / read nothing), or become **excessively noisy** — via
`set_instrument_failure {instrument_id, mode, value}` / `clear_instrument_failure`. A stuck
instrument is the general form of the TMI failure.

Parameterization:
```javascript
if (mode === "stuck") this.failed[id] = { mode:"stuck", value: (value ?? this.reading[id]) };   // freeze at injection-time reading if no value (stuck-at-current)
if (mode === "drift") this.failed[id] = { mode:"drift", offset:0, rate: value ?? DEFAULT_DRIFT_RATE };  // units/s, sim time (HR6)
if (mode === "noisy") this.failed[id] = { mode:"noisy", scale: value ?? DEFAULT_NOISE_SCALE };
if (mode === "dead")  this.failed[id] = { mode:"dead" };

// in the per-step update, while failed:
//   stuck -> reading = value
//   drift -> offset += rate * dt;  reading = trueReading + offset        (acceleration-correct via sim time)
//   noisy -> reading = reading_lagged + gaussianRandom(0, noise_sigma * scale)
//   dead  -> reading = range_min (or last value)
```
The captured stuck `value`, accumulated drift `offset`, and `scale` join the saved
instrument-failure state (§13). Stuck-at-current lets a named sensor failure (e.g.
`tavg_sensor_failure`, `pzr_level_sensor_stuck`, §9) be config-only — the UI need not supply a value.

### 8.8 PWR instrument set
Lag in seconds, noise σ in the instrument's units. These ids are the canonical PWR instrument
vocabulary — trips, alarms, scenario triggers, and gauges reference them.

| instrument_id | measures | lag (s) | noise σ | range |
|---|---|---|---|---|
| `power_range` | power % | 0.1 | 0.2 % | 0–120 % |
| `tavg` | coolant avg temp °C | 4.0 | 0.2 °C | 232–343 °C |
| `thot` | hot leg temp °C | 4.0 | 0.2 °C | 232–343 °C |
| `tcold` | cold leg temp °C | 4.0 | 0.2 °C | 232–343 °C |
| `primary_pressure` | MPa | 0.5 | 0.014 MPa | 0–20.7 MPa |
| `pzr_level` | % | 2.0 | 0.5 % | 0–100 % |
| `sg_level` | % | 3.0 | 0.5 % | 0–100 % |
| `steam_flow` | normalized | 1.0 | 0.01 | 0–1.2 |
| `fw_flow` | normalized | 1.0 | 0.01 | 0–1.2 |
| `mwe_output` | MWe | 0.2 | 1.0 MWe | 0–1300 |
| `porv_indicator` | open/closed | 0.1 | — | boolean |
| `subcooling_margin` | °C | derived | derived | −28–83 °C |
| `turbine_rpm` | RPM | 0.5 | 2.0 RPM | 0–2000 |
| `condenser_vacuum` | kPa | 5.0 | 0.34 kPa | 0–102 kPa |

Status readings the protection/alarm config also reads (booleans/states, no lag/noise):
`rps_scrammed`, `rcp_running`, `hpi_active`, `station_blackout`, `steam_demand_low`,
`rod_at_limit`.

The instrument model's internal state (every lag buffer, every active instrument failure, the
PRNG state) is part of save/restore (§13).

### 8.9 Reactivity proxies (reactivity computer / SUR / period — built, folded in)

Real PWRs have **no direct reactivity gauge** — operators infer reactivity from neutron-flux
trends. `getTrueState()` exposes three derived reactivity fields for an explicitly-labeled
**reactivity computer** (an engineering tool, not a board gauge) and the operator-facing
proxies: `reactivity_pcm` (= net ρ · 1e5), `startup_rate_dpm` (= 26.06 · Ṗ/P), and
`reactor_period_s` (= P/Ṗ). SUR/period are well-defined only above a small power floor. These
are **display/derived only and never fed to protection** (HR1) — additive to the §6.3
contract, so M7's data-contract suite is unaffected.

---

## 9. Protection, Actuation, Alarms, Failures (data — read by M4)

Defined here as the PWR's configuration (HR3/HR8) and consumed by the Control & Failure Layer
(M4). The engine does not act on them; it exposes the instruments they read and the controls
they drive. All trips/actuations/alarms read **instruments** (HR1), with the one documented
true-flow exception.

**Trips** — `(instrument_id, direction, setpoint, action)`; any trip scrams:
```javascript
PWR_TRIPS = [
    ("power_range",      "high", 120.0,  "scram"),   // % rated
    ("tavg",             "high", 335.0,  "scram"),  // °C
    ("primary_pressure", "high", 16.44, "scram"),  // MPa
    ("primary_pressure", "low",  12.41, "scram"),  // MPa
    ("pzr_level",        "low",  12.0,   "scram"),   // %
    ("sg_level",         "low",  12.0,   "scram"),   // %
    ("__true_flow__",    "low",  0.25,   "scram"),   // documented HR1 exception: no flow instrument in v1
];
```

**Auto-actuation** — reads instruments, issues commands (which pass through M4's interception,
so a stuck PORV defeats the reclose):
```javascript
PWR_ACTUATIONS = [
    ("primary_pressure", "high", 16.20, "open_porv",  reset_below=15.86, reset_action="close_porv"),
    ("primary_pressure", "low",  11.03, "set_hpi"),    // issued as {action:"set_hpi", active:true}; reset would issue active:false
    ("sg_level",         "low",  20.0,   "set_afw"),    // issued as {action:"set_afw", active:true}
];
```

**Alarms** — `(id, instrument, direction, setpoint, priority, panel, label_learning,
label_industry)`. Rule: every alarm setpoint is *less* extreme than the matching trip so the
alarm warns first; `lo_lo` escalates `lo` (M4/M7 enforce). Panel A = reactor/primary,
Panel B = secondary/systems.

```javascript
PWR_ALARMS_A = [
  ("reactor_trip",      "rps_scrammed",     "is_true", null,   "critical","A","Reactor Trip","REACTOR TRIP"),
  ("high_flux",         "power_range",      "high",    108.0,  "critical","A","High Neutron Flux","HI FLUX"),
  ("high_tavg",         "tavg",             "high",    312.2,  "warning", "A","High Coolant Temperature","HI TAVG"),
  ("pzr_pressure_high", "primary_pressure", "high",    15.86, "warning", "A","Pressurizer Pressure High","PZR PRESS HI"),
  ("pzr_pressure_low",  "primary_pressure", "low",     14.82, "warning", "A","Pressurizer Pressure Low","PZR PRESS LO"),
  ("pzr_pressure_lolo", "primary_pressure", "low",     12.41, "critical","A","Pressurizer Pressure Very Low","PZR PRESS LO LO"),
  ("porv_open",         "porv_indicator",   "is_open", null,   "warning", "A","Pressure Relief Valve Open","PORV OPEN"),
  ("subcooling_low",    "subcooling_margin","low",     11.1,   "warning", "A","Low Subcooling Margin","LO SUBCOOL"),
  ("subcooling_lost",   "subcooling_margin","low",     0.0,    "critical","A","Subcooling Lost — Coolant Boiling","SUBCOOL LOST"),
  ("pzr_level_high",    "pzr_level",        "high",    75.0,   "caution", "A","Pressurizer Level High","PZR LVL HI"),
  ("pzr_level_low",     "pzr_level",        "low",     25.0,   "warning", "A","Pressurizer Level Low","PZR LVL LO"),
  ("pzr_level_lolo",    "pzr_level",        "low",     12.0,   "critical","A","Pressurizer Level Very Low","PZR LVL LO LO"),
  ("rod_limit",         "rod_at_limit",     "is_true", null,   "warning", "A","Control Rods — Insertion Limit","ROD INS LIMIT"),
];
PWR_ALARMS_B = [
  ("sg_level_high",  "sg_level",        "high",    75.0,  "caution", "B","Steam Generator Level High","SG LVL HI"),
  ("sg_level_low",   "sg_level",        "low",     30.0,  "warning", "B","Steam Generator Level Low","SG LVL LO"),
  ("sg_level_lolo",  "sg_level",        "low",     12.0,  "critical","B","Steam Generator Level Critical Low","SG LVL LO LO"),
  ("rcp_trip",       "rcp_running",     "is_false",null,  "critical","B","Reactor Coolant Pump Trip","RCP TRIP"),
  ("hpi_active",     "hpi_active",      "is_true", null,  "status",  "B","Emergency Cooling Active","HPI ACTIVE"),
  ("sbo",            "station_blackout","is_true", null,  "critical","B","Station Blackout — AC Power Lost","SBO"),
  ("turbine_trip",   "steam_demand_low","is_true", null,  "warning", "B","Turbine Trip / Low Steam Demand","TURB TRIP"),
  ("cond_vac_low",   "condenser_vacuum","low",     84.7,  "caution", "B","Condenser Vacuum Low","COND VAC LO"),
  ("cond_vac_trip",  "condenser_vacuum","low",     74.5,  "warning", "B","Condenser Vacuum Trip Level","COND VAC TRIP"),
];
```

**Failures** (kind per HR7 — physics-parameter failures live in this engine; command-override
failures are listed here but intercepted in M4):
```javascript
PWR_FAILURES = {
  // command_override = intercepted in M4; physics_parameter = implemented in §9.1;
  // instrument = applied by the instrument model (§8); block = uses M4's command-block effect.
  // severity_meta (engineering-unit slider metadata, schema in M4) is inlined on every severity_scales failure.
  // category ∈ reactivity|coolant|power|instrument|safety_system is carried on every failure
  //   (built, folded in — M4 §10 needs it; per HR3 it is plant data, so it lives here, not in M4).
  stuck_porv_open:            { type:"command_override", intercepts:["close_porv"], override:"open_porv", display:"PORV Stuck Open" },
  porv_indicator_stuck_closed:{ type:"instrument", instrument_id:"porv_indicator", mode:"stuck", stuck_value:"closed", display:"PORV Indicator Stuck Closed" },
  loss_of_feedwater:          { type:"command_override", intercepts:["set_feedwater_flow"], override_value:0.0, display:"Loss of Main Feedwater" },
  turbine_trip:               { type:"command_override", intercepts:["set_steam_demand"],   override_value:0.0, display:"Turbine Trip" },
  loss_of_offsite_power:      { type:"physics_parameter", effect:"coast_down_pumps", display:"Loss of Offsite Power" },
  station_blackout:           { type:"physics_parameter", effect:"full_blackout", display:"Station Blackout" },
  sgtr:                       { type:"physics_parameter", effect:"primary_leak", severity_scales:"leak_rate",
                                severity_meta:{ label:"Leak Rate", unit:"% rated flow", min:0, max:8, default:3 }, display:"Steam Generator Tube Rupture" },
  rcp_trip:                   { type:"physics_parameter", effect:"stop_pump", display:"RCP Trip" },
  loss_of_condenser_vacuum:   { type:"physics_parameter", effect:"vacuum_decay", display:"Loss of Condenser Vacuum" },
  degraded_hpi:               { type:"command_override", intercepts:["set_hpi"], severity_scales:"hpi_flow_multiplier",
                                severity_meta:{ label:"HPI Capacity", unit:"% rated", min:0, max:100, default:50, invert:true }, display:"Degraded HPI" },

  afw_failure:            { type:"command_override", intercepts:["set_afw"], override_value:false, display:"Auxiliary Feedwater Failure" },
  failure_to_scram:       { type:"command_override", intercepts:["scram"], effect:"block", display:"Failure to Scram (ATWS)" },
  stuck_open_spray:       { type:"command_override", intercepts:["set_spray"], override_value:true, display:"Pressurizer Spray Stuck Open" },
  failed_pzr_heaters:     { type:"command_override", intercepts:["set_heater"], override_value:0.0, display:"Pressurizer Heaters Failed" },
  sg_overfeed:            { type:"command_override", intercepts:["set_feedwater_flow"], override_value:1.2, display:"SG Overfeed / Overcooling" },
  large_loca:             { type:"physics_parameter", effect:"primary_leak", severity_scales:"leak_rate",
                            severity_meta:{ label:"Break Size", unit:"% rated flow", min:0, max:50, default:20 }, display:"Large LOCA (Cold-Leg Break)" },
  continuous_rod_withdrawal:{ type:"physics_parameter", effect:"rod_withdrawal_runaway", severity_scales:"withdraw_rate",
                            severity_meta:{ label:"Withdrawal Rate", unit:"steps/s", min:0, max:6, default:3 }, display:"Continuous Rod Withdrawal" },
  stuck_rod_on_scram:     { type:"physics_parameter", effect:"stuck_control_rod", severity_scales:"worth_fraction_held",
                            severity_meta:{ label:"Rod Worth Held", unit:"% of total", min:0, max:40, default:20 }, display:"Control Rod Stuck on Scram" },
  steam_line_break:       { type:"physics_parameter", effect:"secondary_depressurize", severity_scales:"break_size",
                            severity_meta:{ label:"Break Size", unit:"% effective area", min:0, max:100, default:30 }, display:"Main Steam Line Break" },
  tavg_sensor_failure:    { type:"instrument", instrument_id:"tavg", mode:"drift", display:"Tavg Sensor Drifting" },
  pzr_level_sensor_stuck: { type:"instrument", instrument_id:"pzr_level", mode:"stuck", display:"Pressurizer Level Sensor Stuck" },
};
```
The physics-parameter effects (`coast_down_pumps`, `full_blackout`, `primary_leak` as a
`leak_flow` term in §6.5, `vacuum_decay`) are implemented in this engine; the
command-override failures are implemented by M4 intercepting the named commands. The engine
must expose the hooks these effects need (a leak-flow term, a pumps-coastdown trigger, a
condenser-cooling-available flag). The newer physics-parameter effects
(`rod_withdrawal_runaway`, `stuck_control_rod`, `secondary_depressurize`) are implemented in
§9.1; `failure_to_scram` uses M4's command-`block` effect; `large_loca` reuses the `primary_leak`
term at higher severity.

### 9.1 Physics-parameter failure effects — implementation

M4 routes `physics_parameter` failures here on `inject_failure {failure_id, severity}` /
`clear_failure`. The new effects are held in a small `_fail` object and applied each step alongside
the existing effects. `[tune]` values are arbitrated by §14.

```javascript
this._fail = {
  rod_runaway: { active:false, rate:0 },        // steps/s
  stuck_rod:   { active:false, worth_held:0 },  // fraction of rod_worth_total
  steam_break: { active:false, size:0 },        // 0..1
};
applyPhysicsFailure(effect, severity = 1.0) {
  switch (effect) {
    case "rod_withdrawal_runaway": this._fail.rod_runaway = { active:true, rate: ROD_RUNAWAY_RATE_MAX * severity }; break; // [tune] ~6 steps/s
    case "stuck_control_rod":      this._fail.stuck_rod   = { active:true, worth_held: STUCK_ROD_MAX_FRAC  * severity }; break; // [tune] ~0.4
    case "secondary_depressurize": this._fail.steam_break = { active:true, size: severity }; break;
  }
}
clearPhysicsFailure(effect) { /* set the matching .active = false */ }
```

**`rod_withdrawal_runaway`** — in the rod-motion update (§7, before reactivity §4). Drives the
control group out, overriding operator demand; the rest of §4 turns rising withdrawal into rising
power. Scram still works (it drives the shutdown group, untouched) — so the lesson is *scram to stop
it*.
```javascript
if (this._fail.rod_runaway.active) {
    controlGroup.steps  = Math.min(controlGroup.max_steps, controlGroup.steps + this._fail.rod_runaway.rate * dt);
    controlGroup.moving = true; controlGroup.direction = +1;   // operator rod_nudge/rod_stop ineffective while active
}
```

**`stuck_control_rod`** — in the rod-reactivity computation (§4). Adds the held-out worth back,
**scaled by how inserted the group is**, so it is inert at full power and maximal once scrammed in
(a clean run and a stuck-rod run are identical until the scram, then diverge):
```javascript
let rho_rods = computeRodReactivity();                         // existing §4
if (this._fail.stuck_rod.active) {
    const insertedFrac = 1.0 - position_withdrawn_normalized;  // 0 withdrawn, 1 inserted
    rho_rods += this._fail.stuck_rod.worth_held * rod_worth_total * insertedFrac;
}
```

**`secondary_depressurize`** — in the SG steam-pressure update (§6.7). Blows down secondary
pressure; the overcooling return-to-power rides the existing MTC path automatically (lower
`T_secondary` → more primary heat removal → lower `Tavg` → positive `ρ_MTC`):
```javascript
if (this._fail.steam_break.active) {
    steam_pressure_mpa -= STEAM_BREAK_RATE * this._fail.steam_break.size * dt;  // [tune] ~0.5 MPa/s at full size
    steam_pressure_mpa  = Math.max(steam_pressure_mpa, 0.1);
}
```

`clear_failure` reverses each effect (sets `.active = false`); the engine resumes normal behavior.

---

## 10. Named Initial States

The engine must construct these (driven by the `reset {plant_id:"pwr", initial_state}`
command, `CONTEXT.md §6.7`):

- **`hot_full_power`** — 100 % power at equilibrium, all systems normal: rods at their
  operating position, boron trimmed, xenon at equilibrium, precursors at equilibrium,
  primary 15.41 MPa / Tavg ≈ 304 °C, SG/pzr levels nominal, full flow, turbine at 1800 RPM /
  1000 MWe. The steady-state test (§14) runs from here.
- **`hot_zero_power`** — subcritical, hot, at operating temperature and pressure, near-zero
  power (precursors ≈ 0).
- **`50_percent`** — stable 50 % power operation.

---

## 11. The Three Mile Island Sequence the Engine Must Make Possible

The engine does **not** script TMI (that is the Instructor's job, M6); it must make the
sequence physically reproducible and reach both outcomes from the same start. The §14
flagship test drives this directly (injecting the failures and the injection state) and
asserts the physics.

1. Plant at power, stable (`hot_full_power`).
2. Main feedwater lost (`loss_of_feedwater`) → SG level falls → heat removal degrades →
   reactor trips on low SG level.
3. Primary pressure rises → PORV opens automatically at 2350.
4. PORV sticks open (`stuck_porv_open`) **and** its indicator sticks closed
   (`porv_indicator_stuck_closed`). Pressure now falls as coolant escapes — but to an
   operator the indicator says the valve reseated.
5. Coolant is lost through the open valve → `core_inventory_pct` falls; primary reaches
   saturation and voids form; **pressurizer level rises even as inventory falls** (§6.4); the
   **instrument-derived subcooling margin erodes toward zero** while the PORV indicator keeps
   lying.
6. Outcome forks on injection:
   - **HPI run** → inventory maintained, core stays covered, fuel temperature stays safe.
   - **HPI throttled/off** (as in 1979) → inventory falls below 0.50 → heat transfer degrades
     → fuel temperature rises toward melt → core damage.

Both outcomes must be physically reachable from the identical initiating sequence.

---

## 12. The Contract Surface (for M4/M5)

The engine exposes (names are yours; capabilities are required): `step(dt_effective)`;
`getTrueState()` → the PWR `true_state` block (`CONTEXT.md §6.3`); `getInstruments()` → the
`instruments` block (§8.8, derived `subcooling_margin` included); `getControlState()` → the
`control_state` block (`CONTEXT.md §6.5`, PWR-specific fields); `applyCommand(command)` for
every PWR command in `CONTEXT.md §6.7` (executed as a direct physical control — no decisions);
`saveState()` / `loadState(state)` (§13); and the scenario suite (§14). The engine reports
`active_failures` it is carrying. It never assembles the snapshot or evaluates trips/alarms —
that is M5/M4.

---

## 13. Save and Restore

`saveState()` captures everything that affects future behavior so a restored run continues
**identically**: kinetics state (P, all six Cᵢ), xenon/iodine (I, X), all thermal states
(fuel/coolant temps, pressures, levels), inventory and void, flows, boron, rod positions and
motion, turbine/condenser state, active failures — and the **instrument model's internal
state**: every lag buffer, every active instrument failure, and the noise PRNG state. If lag
buffers or PRNG state were omitted, a restore would show a transient the original never had
and any replay would diverge. The save/restore scenario test (§14) asserts exact fidelity.

"Active failures" includes the physics-parameter failure state of §9.1 (`_fail.rod_runaway`,
`_fail.stuck_rod`, `_fail.steam_break`); "every active instrument failure" includes each failure's
captured stuck `value`, accumulated drift `offset`, and noise `scale` (§8.7). The §14 save/restore
test must be run **with a failure active** — the only way to catch a missing `_fail` field or an
unsaved drift offset.

---

## 14. Acceptance — the PWR Scenario Test Suite

**This suite is the acceptance gate and the precise behavioral contract.** Build the engine
with the [tune] starting values, run the suite, read which behaviors are off, adjust the
responsible parameter, repeat until it passes. Each test sets up an initial condition, runs
forward issuing commands at chosen times, and asserts checkable conditions; on failure it
prints expected-vs-observed and points at the likely cause so the tuning loop is fast. The
tests live on the engine (`PWRScenarioTests` in `pwr_engine.js`) and call it directly,
bypassing every layer above (integration is M7's job, not this).

**Steady operation.** From `hot_full_power`, run minutes of sim time: power, pressure, Tavg,
pzr/SG levels stay within tight bands; reactivity stays ≈ critical; nothing drifts or
oscillates. Repeat at `50_percent`. *Confirms the feedbacks balance and the plant is trimmed.*
A drift here points at feedback mistuning (Doppler/MTC/rod worth/reference temps).

**Control response.** Withdraw the control group a few steps → power rises and the plant
re-settles at a higher point; insert → power falls and re-settles. Direction correct,
magnitude reasonable, stable. *Confirms rod worth sign/magnitude and feedback response.*

**Shutdown.** Scram from power: power falls sharply as rods insert over ~2.5 s (not
instantaneously); after fission collapses, decay heat persists as a real, decaying heat
source (~7 % initially). *Confirms scram dynamics and the decay-heat model.*

**Transients.** Each produces the right progression and fires the right trip:
- *Loss of main feedwater* → SG level falls → trip on low SG level; AFW behavior present.
- *RCP trip / loss of flow* → flow coasts down (τ≈8 s) → low-flow trip; Tavg/delta_T respond.
- *Turbine trip* → steam demand → 0 → secondary pressure transient → trip if warranted.
- *Loss of condenser vacuum* → vacuum decays slowly → turbine trips at < 74.5 kPa.

**Flagship — Three Mile Island.** The most important test. Drive the §11 sequence directly,
controlling the valve-failure and injection states, and assert the physical outcomes:
- After `stuck_porv_open` + `porv_indicator_stuck_closed`: `porv_indicator` reads **closed**
  while the valve is truly open; the `porv_open` alarm does **not** annunciate.
- `core_inventory_pct` **falls** while `pzr_level_pct` **rises** (the misleading level).
- The instrument-derived `subcooling_margin` **erodes toward/below zero** while the indicator
  keeps lying.
- **Recovery branch:** with HPI run in time, inventory is maintained and the core stays
  covered (`core_inventory` stays above the damage threshold; `fuel_temp` stays safe;
  `melted` never set).
- **Damage branch:** with HPI throttled/off, inventory falls below 0.50, fuel temperature
  rises toward melt, and damage occurs.
A failure to show the rising-pzr-level / falling-inventory divergence points at
`K_void_surge`; a subcooling margin that does not erode points at the voiding/inventory
coupling.

**Physics-level failure behavior.** Physics-parameter failures change the physics correctly
(an `sgtr` primary leak drains inventory; `loss_of_offsite_power` coasts the pumps). The
command-override mechanism is exercised at the engine boundary (a stuck-open PORV ignores a
`close_porv`) to confirm the hook works; the full instrument-vs-trip interaction is M7's job.
The §9.1 effects each have a check: *continuous rod withdrawal* — the control group withdraws
monotonically and power rises despite a `rod_stop`, and `scram` halts it; *stuck rod on scram* —
post-scram decay is shallower / residual power higher than a clean scram; *steam line break* —
steam pressure and `Tavg` fall and `ρ_MTC` turns positive (overcooling return-to-power). Instrument
modes: a *stuck-at-current* `tavg` holds at its injection value while true Tavg moves; a *drifting*
`primary_pressure` diverges linearly from a steady truth.

**Save and restore.** Save mid-transient, restore into a fresh engine, and confirm the
restored run continues **identically** to one never interrupted — including instrument lag
state and noise sequence. Run this **with a failure active** (e.g. mid-`steam_line_break`) as well,
to confirm the §9.1 `_fail` state and drift offsets round-trip. *Confirms determinism and save
completeness.*

When this suite passes, the PWR physics is done and correct — regardless of how the code was
structured to get there.

---

## 15. PWR Starting Parameters ([tune] — collected)

| Parameter | Start | Tune against |
|---|---|---|
| `Λ` (PWR) | 0.01 s | fixed |
| `α_D` (Doppler) | −2.5e−5 K⁻¹ | steady state, rod step |
| `α_MTC` | −3.3e−5 K⁻¹ | stability, power coefficient |
| `boron_worth_per_ppm` | 1.0e−4 | steady criticality |
| `rod_worth_total` | 0.085 | rod worth, criticality |
| `xenon_worth` | 0.025 | xenon transient |
| `sigma_phi` | 2.0e−5 s⁻¹ | xenon equilibrium |
| `H1_0 / λ1` | 0.05 / 0.0005 s⁻¹ | post-scram cooling |
| `H2_0 / λ2` | 0.02 / 0.00002 s⁻¹ | post-scram cooling (hours) |
| `h_fc` / `h_fc_dnb` | 0.05 / 0.004 s⁻¹ | temp response / DNB |
| `heat_gen_coeff` | (→ ~389 °C fuel rise) | fuel temperature |
| `h_sg` | 0.06 s⁻¹ | primary→secondary transfer |
| `delta_T_rated` | 33 °C | hot/cold leg split |
| `pump_spinup_tau` / `pump_coastdown_tau` | 3.0 / 8.0 s | pump transients |
| `K_heater / K_spray` | 8.0 / 25.0 | pressure control |
| `K_porv_relief / K_safety_relief` | 40.0 / 60.0 | relief response |
| `K_surge` | 15.0 | pressure-level coupling |
| `porv_flow_max / safety_flow_max` | 0.04 / 0.10 | relief capacity |
| `K_thermal_surge` | 12.0 | normal pzr level |
| **`K_void_surge`** | **40.0** | **TMI rising-level test** |
| `level_loss_per_flow / K_level` | 8.0 / 1.0 | pzr level |
| `void_gain` | 3.0 | primary voiding onset |
| `K_sg_level` | 5.0 | SG level |
| `K_steam_pressure` | 2.0 | secondary pressure |
| `steam_p_rated` | 5.65 MPa | secondary operating point |
| `afw_flow_frac / afw_start_level` | 0.15 / 20 % | AFW backup |
| `turbine_inertia` | 50.0 | turbine coastdown |
| `vacuum_rated / vacuum_lost` | 96.5 / 16.9 kPa | condenser |
| `vacuum_restore_tau / vacuum_decay_tau` | 10 / 30 s | vacuum response/lag |
| `mwe_rated` | 1000 MWe | electrical output |
| `swell_factor` (SG) | 0.8 | SG level indication transient |

**Operating points / fixed setpoints:** primary 15.41 MPa, Tavg ≈ 304 °C, secondary 5.65 MPa,
1800 RPM / 1000 MWe; PORV open 16.20 / reset 15.86; safety open 17.13 / reseat 16.55;
`P_containment` 0.103 MPa; `max_steps` 228; scram 2.5 s (control) / 2.0 s (shutdown); fuel
damage 1200 °C, melt 2800 °C; trip/alarm setpoints per §9.
