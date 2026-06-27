# M2 — RBMK Engine

**Build this module from `CONTEXT.md` + this file alone.** No other module is required.
This is the complete specification for the Chernobyl-type RBMK engine: its two versions
(pre-/post-1986) in one engine, its kinetics core with the prompt-criticality fast-path, the
nonlinear amplified void coefficient, the ORM, the pre-1986 positive scram effect, the two
destruction paths, its built-in instrument model, its protection/failure configuration, the
Chernobyl sequence it must make possible, and the scenario test suite that is its acceptance
gate.

`CONTEXT.md` already defines the hard rules, the snapshot/command contract, the field
vocabulary, scope, the time step, determinism, and conventions. **Do not re-derive those;
rely on them.** This file adds the RBMK implementation. **[tune]** marks starting points the
scenario tests (§19) arbitrate; unmarked values are fixed.

This is the engine whose correctness matters most for its flagship scenario, because the
entire educational payload is reproducing — in simplified but faithful form — how the
reactor's own physics turned a shutdown action into a catastrophe, and how the post-accident
fixes prevented it. The engine makes **no control decisions** (HR2); it computes physics,
exposes direct controls, and produces both true state and instrument readings.

---

## 1. The Build Target

Per `CONTEXT.md §7`, this module produces `engines/rbmk/`:

| File | Contents |
|------|----------|
| `rbmk_engine.js` | The `RBMKEngine` class **and** `RBMKScenarioTests` (§19) |
| `rbmk_config.js` | A shared base config + `pre_chernobyl` / `post_chernobyl` variants (§4, HR8) — every [tune] value, operating points, the trip/alarm/failure definitions of §14 |
| `rbmk_kinetics.js` | Point-kinetics core + prompt fast-path (§3), the nonlinear void coefficient + ORM stability factor (§5), the displacer / positive scram effect (§5.4), prompt-excursion + destruction (§11) |
| `rbmk_instruments.js` | The RBMK instrument model (§13) — instrument set, lag/noise/range/failure, ORM as a computed reading |
| `rbmk_thermal.js` | Channel flow + MCP, void, steam-drum pressure/level, graphite temperature, fuel temperature + dryout, decay heat (§8) |
| `rbmk_rods.js` | Rod system, the version-specific insertion behavior, scram, ORM computation (§9, §12) |
| `rbmk_protection.js` | RBMK trip/actuation/alarm definitions as data (§14) — read by M4 |

The **contract surface** the engine must expose (consumed by M4/M5): step by `dt_effective`;
report true state; produce instrument readings; accept the RBMK commands from
`CONTEXT.md §6.7`; save/restore complete state (§18); run its scenario suite (§19).

### The RBMK in one line

The **unstable** reactor (see `CONTEXT.md §5`). Graphite moderator, water coolant in
individual pressure tubes; water acts as a neutron *absorber*, so boiling (voids) *raises*
reactivity — a positive void coefficient. RBMK-1000: rated ≈ **3200 MWt**, operating pressure
≈ **7.0 MPa**. Carries **pre-1986 and post-1986** versions selected by `design_version`.
Host of Chernobyl — an accident of *design*; the comparison (pre destroyed, post safe) is the
lesson, and the engine's most important capability.

---

## 2. Units Convention

Contract fields use the RBMK suffixes from `CONTEXT.md §6.3` — temperatures in **°C**
(`fuel_temp_c`, `graphite_temp_avg_c`), pressure in **MPa**, void as a **fraction** (0–1),
flow as **% rated**, ORM in **equivalent rods**. Feedback coefficients are per Kelvin (= per
°C difference), which here aligns with the °C contract — convenient. Energy deposition rate is
in **cal/g/s**.

---

## 3. Point Kinetics Core (the RBMK's own copy) — with the prompt fast-path

The RBMK carries its own copy of the six-group integrator. It is identical to the other
engines **except** for `Λ` and the **prompt-criticality fast-path**, which the RBMK alone
needs — its accident crosses prompt critical, where the standard Euler step understates the
rise because the prompt doubling time is shorter than the timestep.

**Six-group delayed-neutron parameters** (U-235; fixed):

| Group | βᵢ | λᵢ (s⁻¹) |
|------:|----------|---------|
| 1 | 0.000215 | 0.0124 |
| 2 | 0.001424 | 0.0305 |
| 3 | 0.001274 | 0.111 |
| 4 | 0.002568 | 0.301 |
| 5 | 0.000748 | 1.14 |
| 6 | 0.000273 | 3.01 |

**β = 0.006502** (fixed). **Λ = 0.0005 s** (RBMK; fixed — graphite-moderated, far shorter
than the PWR's). Precursor init at equilibrium: `Cᵢ = (βᵢ/λᵢ)·P₀/Λ`.

**Kinetics with the prompt fast-path:**
```javascript
if (rho > beta && !scrammed_complete) {
    // Prompt critical: power rises on the prompt timescale — apply the prompt-jump growth
    const prompt_excess = rho - beta;
    let growth = Math.exp(prompt_excess / Lambda * dt);
    growth = Math.min(growth, MAX_PROMPT_GROWTH_PER_STEP);   // cap prevents numeric blowup
    P = P * growth;
} else {
    // Standard kinetics
    const dP_dt = ((rho - beta) / Lambda) * P + sum(lambda_i * C_i);
    P = Math.max(0.0, P + dP_dt * dt);
}
// precursors advance every step regardless:
// dCi_dt = (beta_i/Lambda)*P - lambda_i*Ci ;  Ci = Ci + dCi_dt*dt
```
`MAX_PROMPT_GROWTH_PER_STEP` **[tune]**: **pre = 80.0**, **post = 5.0**. The cap allows a
violent excursion (pre) while keeping the post version — which must never reach prompt
critical under operator-accessible conditions — numerically tame. This cap is one of the
levers that makes the pre version excurse and the post version not.

### Decay heat
Two-term exponential, identical form to the other engines (the post-scram heat source):
`H_total = H1 + H2`, at scram `H1_0 = 0.05`, `H2_0 = 0.02`, `lambda_1 = 0.0005`,
`lambda_2 = 0.00002` s⁻¹ **[tune]**. `Q_total = P_fission + H_total`.

---

## 4. The Two Versions (one engine, base + overrides)

The engine carries two configurations selected by `design_version`
(`"pre_chernobyl"` | `"post_chernobyl"`), organized as a shared base with each version
overriding what differs (HR8; the RBMK is its own config family — it shares nothing with the
PWR or BWR). For **two mechanisms** the difference is *functional*, not just numeric: the void
coefficient behavior (§5.3) and the control-rod insertion behavior (§5.4).

| Aspect | pre_chernobyl | post_chernobyl |
|---|---|---|
| Void coefficient | Large positive, strongly amplified at low power / high xenon / high void | Reduced — still positive but manageable, far less amplification |
| Control-rod tips | Graphite displacers — initial insertion **adds** reactivity (positive scram effect) | Modified — **no** positive reactivity on insertion |
| Shutdown speed | Slow, ~18 s full insertion | Faster, ~12 s, with a fast-acting subset |
| Fixed absorbers | Few | Additional permanent absorbers |
| Minimum ORM | 15 rods (violated at the accident) | 43 rods (raised, enforced) |
| `MAX_PROMPT_GROWTH` | 80.0 | 5.0 |

Running the same Chernobyl scenario on each version is the engine's central teaching device:
**pre is destroyed; post shuts down safely.** Both outcomes must be faithfully reachable just
by selecting the version.

---

## 5. Reactivity Feedbacks

```
ρ_total = ρ_rods + ρ_doppler + ρ_void + ρ_xenon + ρ_graphite
```
Note what is **absent** vs the PWR: no moderator-temperature coefficient and no boron
(graphite is the moderator; the moderator feedback here is the slow graphite term). The
**void term is the centerpiece** and the primary tuning target for the accident.

### 5.1 Doppler (prompt, negative — weaker than the PWR)
```
ρ_doppler = α_D · (T_fuel − T_fuel_ref)        α_D = −1.0e−5 K⁻¹   [tune]
```

### 5.2 Graphite temperature feedback (slow, slightly **positive**)
The graphite has large thermal mass and its own — slightly destabilizing — feedback:
```
ρ_graphite = α_graphite · (graphite_temp_avg_c − graphite_temp_ref)
```
`α_graphite = +1.5e−4 K⁻¹`, `graphite_temp_ref = 500 °C` **[tune]**. (Graphite thermal
dynamics in §8.5.)

### 5.3 Void coefficient — the central mechanism (nonlinear, state-dependent)
As void rises, reactivity rises (positive coefficient). Critically, the **strength is not
constant** — it amplifies under exactly the accident conditions (low power, high xenon, high
void), and these amplifications **compound**:
```javascript
function alpha_void_effective(P, xenon_fraction, void_fraction, cfg) {
    const alpha_base   = cfg.alpha_void_base;                                  // pre 0.005, post 0.001
    const power_factor = 1.0 + cfg.alpha_void_low_power_gain * Math.max(0, 0.20 - P) / 0.20;  // pre 2.5, post 0.8
    const xenon_factor = 1.0 + cfg.alpha_void_xenon_gain     * Math.max(0, xenon_fraction - 1.0); // pre 0.8, post 0.3
    const void_factor  = 1.0 + cfg.alpha_void_high_void_gain * Math.max(0, void_fraction - 0.30);  // pre 1.2, post 0.4
    return alpha_base * power_factor * xenon_factor * void_factor;
}
```
`xenon_fraction = xenon / X_eq` (1.0 = equilibrium). The **ORM stability penalty** multiplies
the effective coefficient — low ORM means lost capacity to oppose the excursion (§9):
```javascript
function orm_stability_factor(orm, cfg) {
    if (orm >= cfg.orm_rated) return 1.0;
    if (orm >= cfg.orm_min)
        return 1.0 + cfg.orm_instability_gain * (cfg.orm_rated - orm) / cfg.orm_rated;
    const deficit = cfg.orm_min - orm;
    return 1.0
         + cfg.orm_instability_gain * (cfg.orm_rated - cfg.orm_min) / cfg.orm_rated
         + cfg.orm_critical_gain * Math.pow(deficit, 1.5);
}
ρ_void = alpha_void_effective(P, xenon/X_eq, void_fraction, cfg)
       * orm_stability_factor(orm, cfg)
       * (void_fraction - void_ref);
```
`void_ref = 0.30` (reference operating void) **[tune]**; `orm_instability_gain = 1.5`,
`orm_critical_gain = 0.8`, `orm_rated` ≈ the full-rod ORM, `orm_min` = 15 (pre) / 43 (post)
**[tune]**. For **post**, `alpha_base` and the gains are far smaller (table above), so the
same conditions do not run away. **This void feedback — especially its amplification at
accident conditions — is the primary tuning target: tune it until pre excurses and post does
not.**

### 5.4 Control-rod reactivity and the positive scram effect (version-functional)
RBMK rod reactivity is the **sum of individual rod contributions** as a function of each rod's
insertion depth `z` (meters from fully withdrawn). It does **not** use the PWR/BWR SCRUVE.

**pre_chernobyl — the graphite displacer (positive scram effect):** as a fully-withdrawn rod
begins to insert, its graphite displacer enters the lower water column *before* the absorber,
displacing water — and because water absorbs neutrons here, that *adds* reactivity locally
before the absorber arrives to remove it:
```javascript
function rho_displacer_pre(z, cfg) {           // per rod, pre-1986
    const z_water = cfg.z_water_m;             // lower water column ~1.25 m
    const k_disp  = cfg.k_disp;                // [tune] 0.008
    const L_abs   = cfg.L_abs_m;               // absorber length ~7.0 m
    if (z <= z_water) return  k_disp * Math.sin(Math.PI * z / z_water);   // POSITIVE region
    else              return -k_disp * (z - z_water) / L_abs;             // negative (absorber in core)
}
```
This is **the defining horror**: under the accident conditions, pressing emergency shutdown
briefly *increases* reactivity at the bottom of the core. `k_disp = 0.008` **[tune]**.

**post_chernobyl — no positive region.** Insertion is negative from the start (modified rods,
added absorbers):
```javascript
function rho_rod_post(z, cfg) { return -cfg.k_abs * (z / cfg.L_abs_m); }   // monotonic negative; k_abs [tune]
```

Total rod reactivity = Σ over all rods of the per-rod function at that rod's insertion depth,
using the version-appropriate function.

### 5.5 Xenon (shared form)
```javascript
dI_dt = gamma_I * P - lambda_I * I
dX_dt = lambda_I * I + gamma_X * P - lambda_X * X - sigma_phi * P * X
ρ_xenon = -xenon_worth * (X / X_eq)
```
`gamma_I = 0.061`, `gamma_X = 0.003`, `lambda_I = 2.87e−5`, `lambda_X = 2.09e−5` (fixed);
`sigma_phi = 2.0e−5` **[tune]**, `xenon_worth = 0.025` **[tune]**;
`X_eq = (lambda_I·gamma_I/lambda_I + gamma_X)/(lambda_X + sigma_phi)`. Xenon feeds back into
the void amplification (§5.3) — the high-xenon accident state is part of what makes the void
feedback dangerous.

---

## 6. Per-Step Computation Order

1. Total reactivity (rods incl. displacer, Doppler, void with ORM factor, xenon, graphite — §5).
2. Advance kinetics (with prompt fast-path if `ρ > β`) → new power (§3).
3. Advance xenon/iodine (§5.5).
4. Heat generation = fission + decay heat (§3).
5. Advance fuel temperature, with dryout degradation (§8.6).
6. Advance graphite temperature (§8.5).
7. Advance void fraction from power and channel flow (§8.2).
8. Advance steam-drum pressure (§8.3) and drum level (§8.4).
9. Advance channel flow — MCP / coastdown (§8.1).
10. Compute ORM from rod positions (§9).
11. Compute energy-deposition rate; check destruction — thermal melt and prompt steam
    explosion (§11).
12. **Update instruments from the new true state** (§13), then the ORM display reading.

---

## 7. (reserved — see §8 for thermal-hydraulics)

---

## 8. Thermal-Hydraulics — boiling pressure tubes

The critical runaway chain this models: reduced flow → more boiling → higher void → (positive
coefficient) → more reactivity → more power → more boiling.

### 8.1 Channel flow and MCP coupling
```javascript
if (mcp_running) channel_flow_pct += (mcp_speed_pct - channel_flow_pct) / mcp_spinup_tau   * dt;
else             channel_flow_pct += (0.0          - channel_flow_pct) / mcp_coastdown_tau * dt;
channel_flow_pct = clip(channel_flow_pct, 0.0, 120.0);
```
`mcp_spinup_tau = 5.0` s, `mcp_coastdown_tau = 10.0` s **[tune]**. The coastdown is central to
the accident: when pumps coast down, flow falls, void rises, and (positive coefficient)
reactivity rises.

### 8.2 Void fraction
```javascript
void_target = clip(P / (channel_flow_pct / 100.0) * void_scale_rbmk, 0.0, 0.90);
void_fraction_avg += (void_target - void_fraction_avg) / void_response_tau * dt;
```
`void_scale_rbmk = 0.35` (rated power at rated flow → ~30–35 % void), `void_response_tau = 2.0`
s **[tune]**.

### 8.3 Steam-drum pressure (the RBMK's pressure-setting component)
```javascript
steam_gen_rate = P * steam_gen_per_power;
dDrumP_dt = (steam_gen_rate - steam_to_turbine - relief_flow) * K_drum_pressure;
steam_pressure_mpa += dDrumP_dt * dt;
```
`steam_gen_per_power = 1.0`, `K_drum_pressure = 0.0207` MPa/imbalance, operating 7.0 MPa,
relief valves open at 8.0 MPa **[tune]**.

### 8.4 Steam-drum level
```javascript
dDrumLevel_dt = (feedwater_flow - steam_to_turbine) * K_drum_level;
drum_level_pct = clip(drum_level_pct + dDrumLevel_dt * dt, 0, 100);
```
`K_drum_level = 4.0` **[tune]**.

### 8.5 Graphite temperature (large thermal mass, slow)
```javascript
dGraphiteT_dt = (P * graphite_heat_frac
                 - h_graphite_coolant * (graphite_temp_avg_c - coolant_temp_c)) / graphite_heat_capacity;
graphite_temp_avg_c += dGraphiteT_dt * dt;
```
`graphite_heat_frac = 0.05`, `h_graphite_coolant = 0.01` s⁻¹, `graphite_heat_capacity = 20.0`
(responds slowly) **[tune]**. Feeds `ρ_graphite` (§5.2).

### 8.6 Fuel temperature with dryout
```javascript
if (void_fraction_avg > 0.85 && channel_flow_pct < 30.0) h_fc_effective = h_fc_rbmk * 0.1;  // dryout — transfer collapses
else                                                      h_fc_effective = h_fc_rbmk;
dTf_dt = P * heat_gen_coeff_rbmk - h_fc_effective * (fuel_temp_c - coolant_temp_c);
fuel_temp_c += dTf_dt * dt;
```
`h_fc_rbmk = 0.04` s⁻¹, `heat_gen_coeff_rbmk` tuned so rated power gives an appropriate fuel
temperature **[tune]**. Excessive flow reduction or the excursion itself drives dryout → fuel
temperature rises sharply (the `channel_dryout` failure §14 forces this).

---

## 9. ORM — the critical precondition

The Operational Reactivity Margin: the shutdown capacity currently inserted, in equivalent
rods. Low ORM means the reactor has lost much of its capacity to absorb an excursion **and**
amplifies the void feedback (§5.3). At Chernobyl ORM was driven far below the minimum.
```javascript
function get_orm(rod_groups, cfg) {
    const total_worth = sum(g.worth_pcm for g of rod_groups if g.function in ("control","manual"));
    let orm = 0.0;
    for (const g of rod_groups) {
        if (!["control","manual"].includes(g.function)) continue;
        const withdrawn_fraction = g.position / g.max_steps;
        const group_equiv_rods = (g.worth_pcm / total_worth) * cfg.total_rod_count;
        orm += withdrawn_fraction * group_equiv_rods;
    }
    return orm;
}
```
`total_rod_count = 211` (fixed). ORM alarm fires when `get_orm() < min_orm_rods`:
**15 (pre)**, **43 (post)**. ORM is reported both as `orm_equiv_rods` (true) and via the
`orm_display` instrument (§13), and it couples into the physics (§5.3) — it is not merely a
displayed number.

---

## 10. (positive scram effect — see §5.4)

The positive scram effect, the amplified void feedback, and the low ORM together turn the
scram into the trigger of the excursion in the pre-1986 scenario. They are tuned together
(§5.3, §5.4, §3) so that initiating shutdown under accident conditions produces a **power rise
before destruction** on the pre version, and a safe fall on the post version.

---

## 11. Prompt Excursion and the Two Destruction Paths

Under accident conditions the compounding positive feedbacks drive `ρ` past prompt critical
(`ρ > β`), where the prompt fast-path (§3) lets power rise violently. The model represents
destruction by **two** mechanisms — check both each step:

```javascript
function check_destruction(e, cfg) {
    if (e.melted) return true;
    // Path A — gradual thermal melt (loss of cooling / dryout over time)
    if (e.fuel_temp_c > cfg.melt_threshold_c) {          // 2800 °C
        e.melted = true; e.destruction_cause = "thermal_melt"; return true;
    }
    // Path B — prompt steam explosion (rapid, intense energy deposition)
    if (e.energy_deposition_rate > cfg.steam_explosion_threshold) {  // [tune] 280 cal/g/s
        e.melted = true; e.destruction_cause = "steam_explosion"; e.steam_explosion_occurred = true; return true;
    }
    return false;
}
```
Energy-deposition rate — a rolling 0.5 s exponential moving average of power (so only a
*sustained, intense* spike trips it):
```javascript
instant_rate = P * energy_deposition_scale;        // cal/g/s, [tune] scale 0.42 (folds in rated MWt)
const tau = 0.5, alpha = dt / (tau + dt);
energy_deposition_rate = alpha * instant_rate + (1 - alpha) * energy_deposition_rate;
```
`energy_deposition_scale` and `steam_explosion_threshold` are **tuned together** so that the
pre-1986 prompt excursion crosses the threshold (`destruction_cause = "steam_explosion"`)
while the post-1986 version never does. **The pre-1986 accident must reach destruction by the
prompt steam-explosion path; the post-1986 version must not.**

**On magnitude and honesty (for the Instructor, M6).** A lumped point-kinetics model cannot
reproduce the historical ~100× magnitude — that required the three-dimensional spatial
behavior of a large core. It will understate the peak. This is expected. What must be
faithful is **direction and outcome**: the shutdown action makes the reactor worse, power
rises sharply, the core is destroyed. The §19 test requires a clear excursion (power well
above its pre-shutdown level) and destruction — **not** the historical magnitude.

---

## 12. Rod System and Emergency Protection

Control rods (operator-moved) and shutdown/emergency-protection rods (driven in on trip).
Motion mechanics as in `CONTEXT.md §6.5` (228 steps, the same stepping accumulator). Rod
reactivity uses §5.4 (version-specific), **not** SCRUVE.

**Scram / AZ-5.** The emergency shutdown (`manual_scram`, the historical AZ-5) initiates full
insertion. Insertion time: **pre = 18.0 s** (slow magnetic jack), **post = 12.0 s** (improved
drive, with a fast-acting subset) **[tune]**. On the pre version the early insertion carries
the positive scram effect (§5.4).

**EPS bypass.** The emergency protection system's automatic trips (M4) can be **bypassed**
(`set_eps_bypass {active}` → `eps_bypassed` true), as they were during the test preceding the
accident. The engine must support this so the scenario can place the reactor in its historical
pre-accident state with auto-protection disabled.

---

## 13. The Instrument Model (built-in plant system)

RBMK instruments are part of this engine. Same machinery as every plant (lag/noise/range/
failure, advanced inside the step in simulated time, HR6; trips/alarms/gauges read these, not
truth, HR1). Failure modes (stuck/drift/dead/noisy) via `set_instrument_failure` /
`clear_instrument_failure`.

First-order lag `alpha = dt/(lag+dt); reading += alpha*(true - reading)`; then Gaussian noise
`+ gaussianRandom(0, sigma)` (seedable PRNG, part of saved state); then range clamp.

**The ORM display is a *computed* reading** (from rod positions, §9) — present it as the
`orm_display` instrument with no lag/noise. It is one of the most important readings the
operator watches.

Because `orm_display` bypasses the lag/noise pipeline, route it through a **failure-override step
after computation** so it can still be failed — this backs the `orm_indicator_failure` failure (§14),
the Chernobyl information failure. **The physics keeps using the true ORM** (§5.3, §9); only the
display is corrupted:
```javascript
orm_display = get_orm(rod_groups, this.cfg);                                    // true computed ORM
orm_display = this.instruments.applyFailureOverride("orm_display", orm_display); // stuck/drift/dead/noisy
```
Failure-mode parameterization (as elsewhere): `stuck` with no value freezes at the reading **at
injection time** (stuck-at-current); `drift` carries a `rate` (units/s, sim time) accumulated into an
`offset`; `noisy` carries a `scale`. These join the saved instrument-failure state (§18).

**RBMK instrument set:**

| instrument_id | measures | lag (s) | noise σ | range |
|---|---|---|---|---|
| `power_range` | power % | 0.5 | 0.5 % | 0–120 % |
| `steam_pressure` | MPa | 0.5 | 0.014 MPa | 0–10.3 MPa |
| `drum_level` | % | 2.0 | 0.5 % | 0–100 % |
| `channel_flow` | % rated | 1.0 | 1.0 % | 0–120 % |
| `void_fraction` | fraction | 1.0 | 0.01 | 0–1.0 |
| `fuel_temp` | °C | 4.0 | 5.0 °C | 0–2000 °C |
| `orm_display` | equiv rods | 0.0 | 0.0 | 0–211 |

Status readings the protection/alarm config also reads: `rps_scrammed`, `eps_bypassed`,
`orm_alarm_active`. Instrument internal state (lag buffers, active failures, PRNG state) is
part of save/restore (§18).

---

## 14. Protection, Alarms, Failures (data — read by M4)

RBMK protection is **version-specific** — the pre-1986 reactor historically had fewer
automatic trips. All read instruments (HR1); when `eps_bypassed`, the auto-trips are disabled.

```javascript
RBMK_TRIPS_PRE = [
    ("power_range",    "high", 120.0,  "scram"),   // % rated
    ("steam_pressure", "high", 8.0, "scram"),   // MPa — drum overpressure
    ("drum_level",     "low",  10.0,   "scram"),   // %
];
RBMK_TRIPS_POST = RBMK_TRIPS_PRE.concat([
    ("power_range",    "high", 110.0,  "scram"),   // tighter power trip
    ("void_fraction",  "high", 0.80,   "scram"),   // added void trip
]);
```
RBMK alarms (added to the standard reactor/primary set; the ORM threshold is version-specific):
```javascript
RBMK_ALARMS = [
  ("orm_low",    "orm_display",  "low",     15.0, "critical","A","Operating Reactivity Margin Too Low","ORM LO"),  // pre minimum
  ("orm_low",    "orm_display",  "low",     43.0, "critical","A","Operating Reactivity Margin Too Low","ORM LO"),  // post minimum
  ("eps_bypass", "eps_bypassed", "is_true", null, "warning", "A","Emergency Protection Bypassed","EPS BYPASS"),
];
```
Failures (kind per HR7 — physics-parameter effects are implemented in this engine; command-override
are intercepted in M4; instrument by the instrument model (§13); `block` uses M4's command-block
effect). `severity_meta` (engineering-unit slider metadata, schema in M4) is inlined on every
`severity_scales` failure.
```javascript
RBMK_FAILURES = {
  mcp_trip:       { type:"physics_parameter", effect:"coast_down_mcp", display:"MCP Trip" },
  eps_bypass:     { type:"physics_parameter", effect:"disable_auto_trips", display:"EPS Bypass Active" },
  channel_dryout: { type:"physics_parameter", effect:"reduce_h_fc", severity_scales:"h_fc_reduction_fraction",
                    severity_meta:{ label:"Dryout Severity", unit:"% heat-transfer loss", min:0, max:90, default:50 }, display:"Channel Dryout" },

  loss_of_feedwater:     { type:"command_override", intercepts:["set_feedwater_flow"], override_value:0.0, display:"Loss of Feedwater" },
  partial_mcp_trip:      { type:"physics_parameter", effect:"coast_down_mcp", severity_scales:"pumps_lost_fraction",
                           severity_meta:{ label:"Pumps Lost", unit:"% of pumps", min:0, max:75, default:50 }, display:"Partial MCP Trip / Flow Runback" },
  orm_indicator_failure: { type:"instrument", instrument_id:"orm_display", mode:"stuck", display:"ORM Indicator Failed (reads safe)" },
  failure_to_scram:      { type:"command_override", intercepts:["scram","manual_scram"], effect:"block", display:"AZ-5 Failure to Insert" },
  stuck_rods_on_scram:   { type:"physics_parameter", effect:"stuck_control_rod", severity_scales:"worth_fraction_held",
                           severity_meta:{ label:"Rod Worth Held", unit:"% of total", min:0, max:40, default:20 }, display:"Rods Stuck Mid-Insertion" },
  continuous_rod_withdrawal:{ type:"physics_parameter", effect:"rod_withdrawal_runaway", severity_scales:"withdraw_rate",
                           severity_meta:{ label:"Withdrawal Rate", unit:"steps/s", min:0, max:6, default:3 }, display:"Continuous Rod Withdrawal" },
  pressure_tube_rupture: { type:"physics_parameter", effect:"channel_rupture", severity_scales:"rupture_size",
                           severity_meta:{ label:"Break Size", unit:"% effective area", min:0, max:100, default:30 }, display:"Pressure Tube Rupture" },
  void_sensor_failure:   { type:"instrument", instrument_id:"void_fraction", mode:"stuck", display:"Void Fraction Sensor Stuck" },
};
```
The engine exposes the hooks these need: an MCP-coastdown trigger (§8.1), the `eps_bypassed`
flag that M4's trip evaluation respects, and an `h_fc` reduction for forced dryout (§8.6). The
newer physics-parameter effects are implemented in §14.1; `failure_to_scram` uses M4's command-
`block` effect; `partial_mcp_trip` reuses the MCP coastdown.

### 14.1 Physics-parameter failure effects — implementation

Two effects that *look* like the PWR's are not: `stuck_control_rod` is a **positional stall** (the
positive scram effect, §5.4, makes *where* a rod stalls matter), and `rod_withdrawal_runaway` uses
the **opposite position sign** (RBMK `position↑ = inserted`, §9). `channel_rupture` is the only
fully new term. `[tune]` arbitrated by §19.

```javascript
this._fail = {
  stuck_rod:       { active:false, frac:0, z_stuck:0 },   // frac of control/manual rods stalled; z_stuck in metres
  rod_runaway:     { active:false, rate:0 },              // steps/s of withdrawal
  channel_rupture: { active:false, size:0 },              // 0..1
};
applyPhysicsFailure(effect, severity = 1.0) {
  switch (effect) {
    case "stuck_control_rod":      this._fail.stuck_rod = { active:true, frac: STUCK_ROD_MAX_FRAC * severity, z_stuck: this.cfg.z_water_m * 0.5 }; break; // displacer peak [tune]
    case "rod_withdrawal_runaway": this._fail.rod_runaway = { active:true, rate: ROD_RUNAWAY_RATE_MAX * severity }; break; // [tune] ~6 steps/s
    case "channel_rupture":        this._fail.channel_rupture = { active:true, size: severity }; break;
    case "partial_mcp_trip":       this.mcp_speed_pct = 100.0 * (1.0 - PARTIAL_MCP_MAX_LOSS * severity); break;            // reuse, [tune]
  }
}
clearPhysicsFailure(effect) { /* .active = false; partial_mcp_trip → mcp_speed_pct = 100 */ }
```

**`stuck_control_rod` — positional stall (§5.4).** Split the control/manual rod worth into a stalled
fraction pinned at `z_stuck` and the rest at live depth. The §5.4 per-rod function is
version-specific, so the consequence diverges with no special-casing — on **pre**, rods pinned at
`z_water/2` (the displacer-reactivity peak) each contribute `+k_disp` that AZ-5 cannot remove; on
**post**, `rho_rod_post(z_stuck)` is negative (merely reduced worth):
```javascript
function controlRodReactivity() {
    let rho = 0;
    const perRod = (this.version === "pre_chernobyl") ? rho_displacer_pre : rho_rod_post;   // §5.4
    for (const g of controlAndManualGroups) {
        const z_live = depthFromPosition(g.position, this.cfg);
        if (this._fail.stuck_rod.active) {
            const stalled = this._fail.stuck_rod.frac * g.rod_count;
            rho += stalled * perRod(this._fail.stuck_rod.z_stuck, this.cfg) + (g.rod_count - stalled) * perRod(z_live, this.cfg);
        } else { rho += g.rod_count * perRod(z_live, this.cfg); }
    }
    return rho;
}
```

**`rod_withdrawal_runaway` (§12).** Drive the control group out — **decrease** position (RBMK
`position↑ = inserted`, §9), which raises `ρ_rods` (§5.4) **and lowers ORM** (§9): a double
destabilization the PWR lacks. AZ-5 reverses it (drives position up) unless `stuck_rods_on_scram` is
also active.
```javascript
if (this._fail.rod_runaway.active)
    controlGroup.position = Math.max(0, controlGroup.position - this._fail.rod_runaway.rate * dt);  // operator commands ineffective while active
```

**`channel_rupture` — new term.** Place after the void (§8.2), drum-level (§8.4), and channel-flow
(§8.1) updates. A pressure tube bursts: local flashing → void up, inventory lost → drum level down,
coolant diverted → flow down. The rising void feeds the positive coefficient (§5.3); sustained high
void + low flow trips dryout (§8.6) → fuel temp toward the melt path. Distinct from `mcp_trip`: it
*loses inventory*.
```javascript
if (this._fail.channel_rupture.active) {
    const s = this._fail.channel_rupture.size;
    void_fraction_avg = Math.min(0.90, void_fraction_avg + RUPTURE_VOID_RATE  * s * dt);  // [tune] ~0.05 /s
    drum_level_pct    = Math.max(0,    drum_level_pct    - RUPTURE_LEVEL_RATE * s * dt);   // [tune] ~8 %/s
    channel_flow_pct  = Math.max(0,    channel_flow_pct  - RUPTURE_FLOW_RATE  * s * dt);   // [tune] ~15 %/s
}
```

(`partial_mcp_trip` is reuse — driving `mcp_speed_pct` down; §8.1 settles flow at the reduced level
instead of coasting to zero.) `clear_failure` reverses each effect.

---

## 15. Named Initial States

- **`full_power`** — 100 % power, all systems normal: rods at operating positions (ORM at its
  rated value), xenon at equilibrium, full channel flow, drums at 7.0 MPa / nominal level.
- **`low_power_xenon`** — **the Chernobyl precondition**: ~7 % power, xenon at **135 % of
  equilibrium**, most rods withdrawn so **ORM ≈ 7.5** (far below either minimum), channel flow
  reduced (raising void). Ready to run the scenario. The version (`design_version`) is
  selected alongside.

---

## 16. The Chernobyl Sequence the Engine Must Make Possible

The Instructor scripts it (M6); the engine must make it physically reproducible on both
versions. The §19 flagship test drives this directly.

1. The reactor is placed in its accident-precondition state (`low_power_xenon` + auto
   protection bypassed via `set_eps_bypass`): low power, elevated xenon, ORM dangerously below
   minimum, flow reduced (raising void).
2. Emergency shutdown is initiated (`manual_scram`) — rods begin to insert.
3. **pre_chernobyl:** the positive scram effect (§5.4) adds reactivity as rods begin inserting;
   combined with the amplified void feedback (§5.3) and the low ORM, `ρ` crosses prompt
   critical; power excurses sharply (prompt fast-path, §3); the core is destroyed by prompt
   **steam explosion** (§11).
4. **post_chernobyl:** the same initiation produces no positive scram effect, the void feedback
   is too weak to run away, and the reactor shuts down safely — power falls, no destruction.

The two outcomes from the identical scenario are the entire lesson; both must be faithfully
reachable by selecting the version.

---

## 17. The Contract Surface (for M4/M5)

`step(dt_effective)`; `getTrueState()` → the RBMK `true_state` block (`CONTEXT.md §6.3`, incl.
`void_fraction_avg`, `orm_equiv_rods`, `orm_alarm_active`, `eps_bypassed`,
`destruction_cause`, `steam_explosion_occurred`, `energy_deposition_rate`, `design_version`);
`getInstruments()` → §13 (incl. computed `orm_display`); `getControlState()` →
`CONTEXT.md §6.5` rod groups; `applyCommand(command)` for the RBMK commands in
`CONTEXT.md §6.7` (`set_channel_flow`, `set_feedwater_flow`, `set_eps_bypass`, `manual_scram`,
rod commands); `saveState()`/`loadState()` (§18); the scenario suite (§19). The engine never
evaluates trips/alarms or assembles the snapshot.

---

## 18. Save and Restore

`saveState()` captures everything affecting future behavior so a restore continues
identically: kinetics (P, six Cᵢ), xenon/iodine, all thermal states (fuel/graphite temps,
drum pressure/level), void, channel flow, rod positions/motion, `design_version`, the
destruction state (`melted`, `destruction_cause`, `steam_explosion_occurred`), the
`energy_deposition_rate` EMA state, active failures and `eps_bypassed` — and the instrument
model's internal state (lag buffers, active instrument failures, PRNG state). Omitting the EMA
state or lag buffers would diverge a replay. The §19 save/restore test asserts exact fidelity.

"Active failures" includes the §14.1 physics-parameter failure state (`_fail.stuck_rod`,
`_fail.rod_runaway`, `_fail.channel_rupture`); "active instrument failures" includes the
`orm_display` override state and each failure's captured stuck `value` / drift `offset` / noise
`scale` (§13). `mcp_speed_pct` is already saved. Run the §19 save/restore test **mid-`channel_rupture`**
and **mid-stall** to catch a missing `_fail` field.

---

## 19. Acceptance — the RBMK Scenario Test Suite

**This suite is the acceptance gate and the precise behavioral contract**, run for **both
versions**. Build with the [tune] starting values, run the suite, read which behaviors are
off, adjust, repeat. Tests live on the engine (`RBMKScenarioTests`) and call it directly.

**Steady operation.** From `full_power` (each version): power, void, pressures, drum level
hold within bands; reactivity ≈ critical; nothing drifts or oscillates. *Confirms the
feedbacks balance at the operating point even with the positive void term.*

**Control / void response.** A **flow** change drives power via the void feedback in the right
direction and settles: reducing channel flow raises void → (positive coefficient) raises power
→ settles at a new balance (no runaway at normal conditions); increasing flow lowers it. Rod
motion changes power correctly. *Confirms the void feedback sign/magnitude and stability away
from accident conditions.*

**Shutdown (non-accident).** From a safe state, `manual_scram` brings power down; rods insert
over the version time (18 s pre / 12 s post); decay heat persists. *Confirms scram dynamics
and decay heat.*

**ORM.** ORM computes correctly from rod positions; the `orm_display` reading tracks it; the
ORM alarm fires below the version minimum (15 / 43); low ORM measurably amplifies the void
feedback (§5.3). *Confirms the ORM computation, alarming, and physics coupling.*

**Version-correct rod behavior.** Trace rod reactivity vs insertion from fully withdrawn:
**pre** shows an initial **positive** region (the positive scram effect) before going strongly
negative; **post** is negative from the start. *This is the functional version difference — it
must be present pre and absent post.* A pre test that fails to show the positive region points
at `k_disp` / `z_water`.

**Flagship — Chernobyl, both versions (the comparison).** The most important test:
- **pre_chernobyl** from the accident preconditions (§16) with EPS bypassed → on
  `manual_scram`, reactivity crosses prompt critical, **power rises clearly above its
  pre-shutdown level** (the excursion), and the core is **destroyed** with
  `destruction_cause = "steam_explosion"` and `steam_explosion_occurred = true`. (Magnitude is
  *not* asserted — only a clear excursion and destruction.)
- **post_chernobyl** under **identical** conditions → power **falls**, no excursion, **no
  destruction** (`melted` never set). Safe shutdown.
- The **comparison test** runs both from the same preconditions and asserts the divergent
  outcomes — pre destroyed, post safe. *This validates the engine's central educational
  purpose.*

Tuning guidance the test output should point at: a pre case that fails to excurse → the void
amplification (§5.3) or the positive scram effect (§5.4) is too weak, or `MAX_PROMPT_GROWTH`
too low; a post case that excurses → those are too strong for the post variant; destruction
that never triggers → `steam_explosion_threshold` / `energy_deposition_scale` mistuned.

**Physics-level failure behavior.** `mcp_trip` coasts the pumps (flow falls, void rises);
`channel_dryout` collapses heat transfer (fuel temp rises); `eps_bypass` disables the
auto-trips. Each changes the physics correctly. The §14.1 effects, run for both versions where the
version difference is the point: *stuck control rod (pre)* — AZ-5 from the accident preconditions
with a stalled fraction leaves a positive rod contribution and worsens the excursion vs a clean
scram; *(post)* — only reduced worth, reactor still shuts down. *rod runaway* — control-group
position decreases monotonically, `ρ` rises while ORM falls, `manual_scram` reverses it. *channel
rupture* — void up, drum level and flow down, reactivity rises on pre, sustained → dryout → fuel-temp
rise. *ORM indicator failure* — stick `orm_display` safe, drive true ORM low; the reading holds while
`orm_equiv_rods` drops and the void amplification (§5.3) still uses the true value. *partial MCP trip*
— flow settles at a reduced level, not zero.

**Save and restore.** Save mid-excursion-buildup, restore into a fresh engine, confirm the run
continues identically — including the energy-deposition EMA and instrument lag/noise state. Run this
**with a failure active** (mid-`channel_rupture` and mid-stall) to confirm the §14.1 `_fail` state
round-trips.

When this suite passes for both versions — including the flagship excursion/destruction and
the pre/post comparison — the RBMK physics is done and correct.

---

## 20. RBMK Starting Parameters ([tune] — collected; pre / post where they differ)

| Parameter | Start (pre / post) | Tune against |
|---|---|---|
| `Λ` (RBMK) | 0.0005 s | fixed |
| `MAX_PROMPT_GROWTH` | 80.0 / 5.0 | excursion magnitude / post tameness |
| `α_D` (Doppler) | −1.0e−5 K⁻¹ | steady state |
| `α_graphite` | +1.5e−4 K⁻¹ | slow moderator feedback |
| `graphite_temp_ref` | 500 °C | graphite feedback reference |
| `alpha_void_base` | 0.005 / 0.001 | **Chernobyl excursion / post safe** |
| `alpha_void_low_power_gain` | 2.5 / 0.8 | low-power amplification |
| `alpha_void_xenon_gain` | 0.8 / 0.3 | high-xenon amplification |
| `alpha_void_high_void_gain` | 1.2 / 0.4 | high-void amplification |
| `void_ref` | 0.30 | steady void |
| `orm_instability_gain / orm_critical_gain` | 1.5 / 0.8 | ORM stability penalty |
| `min_orm_rods` | 15 / 43 | ORM alarm + penalty onset |
| `k_disp` (displacer) | 0.008 / 0.0 | **positive scram effect** |
| `z_water_m / L_abs_m` | ~1.25 / ~7.0 | displacer profile |
| `k_abs` (post rod worth) | [tune] | post rod insertion worth |
| `void_scale_rbmk` | 0.35 | void at rated conditions |
| `void_response_tau` | 2.0 s | void lag |
| `mcp_spinup_tau / mcp_coastdown_tau` | 5.0 / 10.0 s | flow transients |
| `K_drum_pressure / K_drum_level` | 3.0 / 4.0 | drum pressure / level |
| `steam_gen_per_power` | 1.0 | steam generation |
| `graphite_heat_frac` | 0.05 | graphite heating |
| `h_graphite_coolant` | 0.01 s⁻¹ | graphite cooling |
| `graphite_heat_capacity` | 20.0 | graphite thermal mass |
| `h_fc_rbmk` | 0.04 s⁻¹ | fuel temperature |
| `heat_gen_coeff_rbmk` | (→ appropriate fuel temp) | fuel temperature |
| `steam_explosion_threshold` | 280 cal/g/s | destruction path |
| `energy_deposition_scale` | 0.42 | destruction path (co-tuned with threshold) |
| `xenon_worth / sigma_phi` | 0.025 / 2.0e−5 | xenon transient |
| `H1_0/λ1, H2_0/λ2` | 0.05/5e−4, 0.02/2e−5 | post-scram cooling |

**Operating points / fixed:** rated ≈ 3200 MWt, drum 7.0 MPa, drum relief 8.0 MPa;
`total_rod_count` 211; `max_steps` 228; scram 18 s (pre) / 12 s (post); melt 2800 °C;
trip/alarm setpoints per §14; `low_power_xenon` preset: ~7 % power, xenon 135 %, ORM ≈ 7.5.
