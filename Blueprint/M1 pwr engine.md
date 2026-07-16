# M1 — PWR Engine

**Build this module from `CONTEXT.md` + this file alone.** No other module is required.
This is the complete specification for the Pressurized Water Reactor engine: its kinetics
core, its thermal-hydraulics, its built-in instrument model, its protection/alarm/failure
configuration, the Three Mile Island sequence it must make possible, and the scenario test
suite that is its acceptance gate.

`CONTEXT.md` already defines the things common to every module — the hard rules, the
snapshot/command contract, the named field vocabulary, the scope boundaries, the time step,
determinism, and conventions. **Do not re-derive those here; rely on them.** This file adds
the PWR implementation. Where a value is marked **\[tune]**, it is a starting point; the
scenario tests (§14) are the final arbiter. Values not marked \[tune] are fixed.

The engine makes **no control decisions** (HR2) and never reads its own instruments to
decide anything — it computes physics, exposes direct controls, and produces both true state
and instrument readings. Trips, actuation, and alarms are the Control \& Failure Layer's job
(M4); this engine only defines them as *data* (§9) and exposes the instruments they read.

\---

## 1\. The Build Target

Per the file structure in `CONTEXT.md §7`, this module produces `engines/pwr/`:

|File|Contents|
|-|-|
|`pwr\_engine.js`|The `PWREngine` class (the simulator object) **and** `PWRScenarioTests` (§14)|
|`pwr\_config.js`|All PWR parameters as a structured config object (HR8) — every \[tune] value, operating points; the §9 trip/alarm/failure definitions attach onto it (`RD.PWR\_CONFIG.protection`) from the control layer|
|`pwr\_instruments.js`|The PWR instrument model (§8) — the instrument set, lag/noise/range/failure behavior, derived subcooling, the PORV commanded-vs-actual indicator|
|`pwr\_thermal.js`|Fuel + coolant temperatures, subcooling, void, fuel-damage endpoint (§6.1–6.3, §6.9)|
|`pwr\_pressurizer.js`|Pressurizer pressure, heater/spray, PORV + safety valves, surge line and level — the TMI level behavior (§6.4)|
|`pwr\_primary.js`|Primary loop temperatures, inventory + voiding, pumps + coastdown (§6.5–6.6)|
|`pwr\_steam\_generator.js`|SG heat transfer, level, steam pressure/flow, feedwater + AFW, turbine + condenser (§6.7–6.8)|

*(as built)* There is no `pwr\_protection.js`: the §9 trip/actuation/alarm/failure definitions
moved in-stack with the control-layer split — they live in `layers/control/pwr\_control.js`,
which attaches them onto `RD.PWR\_CONFIG.protection` (the engine's failure dispatch reads them
there).

Internal structure within these files is yours. The **contract surface** the engine must
expose (consumed by M4/M5): step the sim by `dt\_effective`; report true state; produce
instrument readings; accept the PWR commands from `CONTEXT.md §6.7`; save and restore
complete state (§13); run its scenario suite (§14).

### The PWR in one line

The stable, intuitive reactor (see `CONTEXT.md §5`). Negative feedbacks oppose change; it
self-regulates. Operating point: primary ≈ **15.41 MPa**, coolant average ≈ **304 °C**, full
electrical output ≈ **1000 MWe**. One control rod group + one shutdown group. Host of Three
Mile Island — an accident of *information*, which is why the PORV indicator must be able to
lie while the subcooling margin tells the truth.

\---

## 2\. Units Convention

Contract fields use the suffixed units from `CONTEXT.md §6.3` — PWR temperatures in **°C**,
pressures in **MPa**, levels in **%**, flows **normalized to rated**. Internally, track
each quantity in one consistent unit and convert only at the snapshot boundary.

One subtlety to keep straight: the **feedback coefficients** (Doppler, MTC) are given per
Kelvin (`K⁻¹`), i.e. per unit *temperature difference* (1 K = 1 °C = 1.8 °F of difference).
The **fuel-damage thresholds** are given in °C (1200 / 2800 °C ≈ 2192 / 5072 °F). Because the
feedback coefficients are \[tune], the precise internal unit is less important than
consistency — the engine works in **SI throughout** (°C, MPa), applies the per-K (= per-°C)
coefficients to temperature differences directly, and reports `fuel\_temp\_c`, `tavg\_c`,
`thot\_c`, `tcold\_c` in °C in the snapshot (the UI converts for display, M8).

\---

## 3\. Point Kinetics Core (the PWR's own copy)

The PWR carries its own copy of the six-group point-kinetics integrator. (Each engine does;
there is no shared kinetics file. The three copies are identical except for `Λ` and the
RBMK's prompt fast-path, which the **PWR does not have** — it never reaches prompt
criticality under any in-scope scenario.)

**The equations** — power (normalized to rated) and six delayed-neutron precursor groups:

```
dP/dt   = \[(ρ − β) / Λ] · P + Σᵢ λᵢ Cᵢ
dCᵢ/dt  = (βᵢ / Λ) · P − λᵢ Cᵢ        for i = 1..6
```

Integrate with first-order **Euler** at the engine's `dt\_effective` (see `CONTEXT.md §4`):
`x\_new = x\_old + (dx/dt)·dt`. Floor power at 0: `P = max(0, P + dP\_dt·dt)`.

**Six-group delayed-neutron parameters** (U-235; fixed, do not change):

|Group|βᵢ|λᵢ (s⁻¹)|
|-:|-|-|
|1|0.000215|0.0124|
|2|0.001424|0.0305|
|3|0.001274|0.111|
|4|0.002568|0.301|
|5|0.000748|1.14|
|6|0.000273|3.01|

**β = 0.006502** (sum). **Λ = 0.01 s** (PWR prompt neutron generation time; fixed).

**Precursor initialization** at full-power equilibrium: `Cᵢ = (βᵢ / λᵢ)·P₀ / Λ` with
`P₀ = 1.0`. At zero power all precursors are 0.

**No prompt fast-path.** Standard Euler kinetics is sufficient for the PWR at the 0.02 s
step; `ρ` stays well below `β` in every scenario.

**Constant neutron source *(as built)*.** A fixed source term `kinetics.source = 1.0e-6`
(normalized power/s) **\[tune]** is added to `dP/dt`, giving the subcritical core its 1/M
multiplication (`P\_eq = source·Λ/(−ρ)`) so the approach to criticality is visible on the
source-range instruments instead of silent until critical (`pwr\_engine.js`
`\_stepKinetics`). Sized so the `hot\_zero\_power` shutdown margin (−1000 pcm) equilibrates at
exactly that state's P₀ = 1e-6; negligible at power.

### Decay heat (persists after scram)

Two-term model with a production term toward the equilibrium fraction for the **current**
power, so it builds while the reactor runs and persists/decays after shutdown (the heat
source behind TMI core damage and post-shutdown cooling):

```javascript
dH1/dt = H1\_0 \* lambda\_1 \* P - lambda\_1 \* H1     // fast component  (equilibrium H1\_0·P)
dH2/dt = H2\_0 \* lambda\_2 \* P - lambda\_2 \* H2     // slow component  (equilibrium H2\_0·P)
H\_total = H1 + H2
```

*(as built)* This production-toward-equilibrium form, tracking power continuously, **replaces
the old switch-on-at-scram form**: a reactor that has been at power a while already carries
\~7 % decay heat at the moment of scram, while a just-started (subcritical) core carries \~none
(`pwr\_engine.js` `\_stepDecay`).

Equilibrium components: `H1\_0 = 0.05`, `H2\_0 = 0.02` (→ 7% of rated at P = 1).
`lambda\_1 = 0.0005` s⁻¹, `lambda\_2 = 0.00002` s⁻¹ **\[tune]**.

Total heat driving the thermal model: `Q\_total = P\_fission + H\_total` **when scrammed**;
during operation `Q\_total = P\_fission` alone — the decay component is treated as embedded in
P (rated power is total thermal) — and after scram the fission term collapses and `H\_total`
is the residual source *(as built — `pwr\_engine.js` step 4)*.

\---

## 4\. Reactivity Feedbacks

Net reactivity each step is the sum (computed from the *previous* step's temperatures/states
— standard explicit coupling, `CONTEXT.md §11`):

```
ρ\_total = ρ\_excess + ρ\_rods + ρ\_doppler + ρ\_moderator + ρ\_xenon + ρ\_boron
```

These negative feedbacks are what make the PWR stable; the steady-state test (§14) confirms
they balance so the plant holds critical at the operating point. Set `T\_fuel\_ref` and
`T\_coolant\_ref` (the rated-power reference temperatures) so the feedbacks net to the steady
critical condition at `hot\_full\_power`.

*(as built)* `ρ\_excess = 0.10` (`rho\_excess`, `pwr\_config.js`) **\[tune]** is the core's
excess reactivity, held down by boron/rods/xenon at the operating point. At reset the
reference temps are set to the settled hot-full-power temperatures (so Doppler/MTC read zero
there and act purely perturbatively on a transient), then **boron is trimmed so the net
reactivity is exactly critical** for the named state (`\_trimToCritical`, `pwr\_engine.js`) —
or leaves a −1000 pcm subcritical margin for `hot\_zero\_power`.

**Doppler** (prompt, always negative — the fast self-stabilizer):

```
ρ\_doppler = α\_D · (T\_fuel − T\_fuel\_ref)        α\_D = −2.5e−5 K⁻¹   \[tune]
```

**Moderator temperature coefficient** (PWR-specific; negative across the operating range):

```
ρ\_MTC = α\_MTC · (T\_coolant − T\_coolant\_ref)    α\_MTC = −3.3e−5 K⁻¹ \[tune]
```

**Boron** (dissolved absorber, adjusted slowly via CVCS charging/letdown):

```
ρ\_boron = −boron\_worth\_per\_ppm · boron\_ppm     boron\_worth\_per\_ppm = 1.0e−4 \[tune]
```

`boron\_ppm` is a state variable changed at a rate set by the operator's `set\_charging\_flow` /
`set\_letdown\_flow` commands.

**Control rods** (SCRUVE S-curve worth — rods least effective near fully in/out, most in the
middle):

```javascript
function scruve(pos\_norm) {            // pos\_norm: 0 = fully inserted, 1 = fully withdrawn
    return pos\_norm - Math.sin(2\*Math.PI\*pos\_norm) / (2\*Math.PI);
}
// position\_withdrawn\_normalized = steps / max\_steps  (0 in, 1 out)
ρ\_rods = -rod\_worth\_total \* scruve(1.0 - position\_withdrawn\_normalized);
// 0 when fully withdrawn, maximally negative when fully inserted
```

`rod\_worth\_total = 0.085` (total control-group worth, \~8500 pcm) **\[tune]**. Sum the control
group and (when inserted on scram) the shutdown group — shutdown-group worth
`rod\_worth\_shutdown = 0.10` **\[tune]** *(as built, `pwr\_config.js`)*.

**Xenon** (slow neutron poison, evolving over hours; iodine-135 → xenon-135):

```javascript
// Normalized: I and X in units of equilibrium xenon at full power
dI\_dt = gamma\_I \* P - lambda\_I \* I
dX\_dt = lambda\_I \* I + gamma\_X \* P - lambda\_X \* X - sigma\_phi \* P \* X
ρ\_xenon = -xenon\_worth \* (X / X\_eq)
```

Constants: `gamma\_I = 0.061`, `gamma\_X = 0.003`, `lambda\_I = 2.87e−5` s⁻¹,
`lambda\_X = 2.09e−5` s⁻¹ (fixed); `sigma\_phi = 2.0e−5` s⁻¹ **\[tune]**;
`xenon\_worth = 0.025` **\[tune]**. Equilibrium (at P=1): `I\_eq = gamma\_I/lambda\_I`,
`X\_eq = (lambda\_I·I\_eq + gamma\_X)/(lambda\_X + sigma\_phi)`.

\---

## 5\. Per-Step Computation Order

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
16. Compute the derived `subcooling\_margin` instrument from instrument P and T (§8).

\---

## 6\. Thermal-Hydraulics

### 6.1 Fuel temperature

```javascript
// h\_fc degrades on DNB and on core uncovery (see §6.5)
dTf\_dt = P \* heat\_gen\_coeff - h\_fc\_effective \* (T\_fuel - T\_coolant);
T\_fuel = T\_fuel + dTf\_dt \* dt;
```

`heat\_gen\_coeff = 19.45` (≈ h\_fc·389 → \~389 °C fuel-above-coolant at rated) **\[tune]**.
`h\_fc = 0.05` s⁻¹ (normal); `h\_fc\_dnb = 0.004` s⁻¹ during departure from nucleate boiling
**\[tune]**. **DNB triggers when the hot-leg (core-exit) subcooling margin falls to
`dnb\_margin\_c = 8.0 °C`** **\[tune]** *(as built — real DNB (DNBR < 1.3) occurs subcooled,
before bulk boiling, and the hot channel dries out first; judging the margin at the core exit
is what makes DNB reachable at power, where bulk Tavg never nears saturation —
`pwr\_thermal.js` `hFcEffective`)*. Then `h\_fc\_effective = h\_fc\_dnb`; otherwise
`h\_fc\_effective = h\_fc` (further degraded on uncovery, §6.5).

**Flux-driven core boiling *(as built)*.** The raw hot-leg enthalpy rise can pass saturation
at power (steam-line break / loss of flow): `thot` is clamped at `T\_sat` and the exit
overshoot drives a core void fraction `core\_void\_fraction` toward equilibrium
(`void\_flux\_gain = 0.02` /°C, `void\_flux\_max = 0.8`, `void\_flux\_tau = 3.0` s, all
**\[tune]**) — a regime distinct from the inventory-driven TMI void of §6.5, combined by
degrading heat transfer only, and deliberately **not** wired into the pressurizer level
couplings (`pwr\_thermal.js`, `pwr\_primary.js`; config `pwr\_config.js thermal.void\_flux\_\*`).

### 6.2 Coolant temperature (two-node) and legs

```javascript
Q\_fuel\_to\_coolant = h\_fc \* (T\_fuel - Tavg);
Q\_coolant\_to\_sg   = h\_sg \* flow\_frac \* (Tavg - T\_secondary);   // T\_secondary from §6.7
dTavg\_dt = (Q\_fuel\_to\_coolant - Q\_coolant\_to\_sg) / coolant\_heat\_capacity;
Tavg = Tavg + dTavg\_dt \* dt;

delta\_T = delta\_T\_rated \* P / Math.max(flow\_frac, 0.1);        // saturates at low flow
T\_hot  = Tavg + delta\_T / 2.0;
T\_cold = Tavg - delta\_T / 2.0;
```

`h\_sg = 0.6` s⁻¹, `coolant\_heat\_capacity = 20.0`, `delta\_T\_rated = 33 °C` **\[tune]** *(as
built — re-scaled together so the energy in/out balances at rated with a realistic coolant
time constant)*. The `max(flow\_frac, 0.1)` floor represents heat building locally when flow
is lost (drives the low-flow temperature excursion).

**RCP pump heat *(as built)*.** The pumps' shaft work is deposited in the coolant node:
`Q\_pump = heat\_gen\_coeff · pump\_heat\_frac · flow\_frac` with `pump\_heat\_frac = 0.0055`
(\~0.55 % of rated core heat at full flow) **\[tune]** — the real no-load heat source when the
heat sink is isolated. It is netted back out of the SG steam-side balance (treated as
blowdown/ambient losses) so the turbine draws steam for core power only (`pwr\_thermal.js`,
`pwr\_steam\_generator.js`).

### 6.3 Subcooling — two distinct computations (important)

There are **two** subcooling numbers and they must not be confused:

* **True subcooling** (physics) — drives voiding (§6.5). Uses **true** P and Tavg:
`true\_subcooling = T\_sat(P\_true) − Tavg\_true`.
* **Indicated subcooling margin** (the `subcooling\_margin` instrument) — what the operator
sees, what trips/alarms read. Derived from **instrument** P and T per HR1 (§8.6), so it
inherits their lag and any failure. This is the parameter that tells the truth at TMI even
while the PORV indicator lies.

Saturation temperature (good to ±2 °C over the PWR range):

```javascript
function T\_sat\_celsius(P\_MPa) {
    const P\_MPa = P\_MPa / 145.038;
    return 179.47 \* Math.pow(P\_MPa, 0.239) - 273.15;   // °C
}
```

### 6.4 Pressurizer (pressure, heater/spray, PORV, safety valves, level)

Pressure evolves from the steam/water balance:

```javascript
dP\_dt = (heater\_power\_frac \* K\_heater
         - spray\_eff        \* K\_spray             // spray scales with primary flow (RCP suction)
         - porv\_flow        \* K\_porv\_relief
         - safety\_flow      \* K\_safety\_relief
         - leak\_flow        \* K\_leak\_depressurize // break blowdown (LOCA/SGTR)
         + K\_surge \* dTavg\_dt);                   // thermal insurge raises pressure
// single-phase: dP\_dt += P\_restore\_rate\_gain \* (P\_equilibrium - P\_MPa)   // gentle self-restore
// two-phase (primary voided): dP\_dt += K\_sat\_pull \* (P\_sat(Tavg) - P\_MPa) // collapse toward saturation
P\_MPa = P\_MPa + dP\_dt \* dt;
```

`K\_heater = 0.55`, `K\_spray = 1.7`, `K\_porv\_relief = 300.0`, `K\_safety\_relief = 300.0`,
`K\_surge = 1.0` (MPa-rate units), equilibrium 15.41 MPa **\[tune]** *(as built — gains
re-derived for the MPa scale; the relief gains are large because the valves vent the
pressurizer STEAM space, so a small mass flow has a big pressure effect — the pressure gain
and the inventory-loss gain `porv\_flow\_max` are decoupled)*.

*(as built)* Two additional dP/dt terms: `K\_sat\_pull = 1.5` pulls a voided (two-phase)
primary toward `P\_sat(Tavg)` so subcooling → 0, and `K\_leak\_depressurize = 10.0` blows the
RCS down on a primary break (unlike CVCS letdown, a controlled bleed at pressure) — what
pushes a large break into the ECCS/accumulator band while a small PORV break floors higher
(TMI). Both **\[tune]** (`pwr\_pressurizer.js`).

Heater/spray automatic behavior (proportional; operator may override via `set\_heater` /
`set\_spray`):

```javascript
const err = P\_setpoint - P\_MPa;              // P\_setpoint = 15.41 MPa
if (err > 0) { heater\_power\_frac = clip(err/heater\_band\_mpa, 0, 1); spray\_flow\_frac = 0; }
else         { heater\_power\_frac = 0; spray\_flow\_frac = clip(-err/spray\_band\_mpa, 0, 1); }
```

Bands 0.207/0.345 MPa **\[tune]**.

PORV and spring-loaded safety valves (`porv\_open` is the **actual** valve state — see the
stuck-open failure §9 and the lying indicator §8.5):

```javascript
// PORV actual position: commanded demand (open\_porv/close\_porv), unless stuck open
porv\_open   = porv\_stuck || (porv\_demand === 'open');
dP\_ratio    = Math.sqrt(Math.max(0, (P\_MPa - P\_containment) / P\_flow\_ref));  // P\_flow\_ref = 15.41
porv\_flow   = (porv\_open \&\& block\_valve\_open) ? porv\_flow\_max \* dP\_ratio : 0;
// Safety valves: COMMANDED state (open\_pzr\_safety / close\_pzr\_safety) — the control
// layer's actuation pops them at safety\_open\_mpa and reseats at safety\_reseat\_mpa.
safety\_flow = safety\_open ? safety\_flow\_max \* dP\_ratio : 0;
```

*(as built)* The engine does **not** auto-actuate the PORV (HR2) — automatic open/close is
the Control Layer's actuation (`layers/control/pwr\_control.js`), which reads the pressure
instrument and issues `open\_porv` / `close\_porv` against `porv\_open\_mpa = 16.20` /
`porv\_close\_mpa = 15.86` MPa (config values consumed by the control layer, not the engine —
`pwr\_pressurizer.js` only resolves the commanded demand and the stuck failure). The earlier
snippet's 2235/2350/2485/2400 constants were psia residue; all setpoints are MPa.

*(as built — 2026-07-16 design ruling)* The spring safety valves are **no longer
mechanical-in-engine**: valve pop/reseat is a **control decision**. The control layer's
actuation reads the `primary\_pressure` **instrument** and commands `open\_pzr\_safety` at
`safety\_open\_mpa = 17.13` MPa / `close\_pzr\_safety` below `safety\_reseat\_mpa = 16.55` MPa
(setpoints still live in the engine config — single source). The engine keeps only the valve
state and the flow hydraulics (`safety\_flow` while open), so a stuck-safety-valve failure or
a lying pressure instrument can now reach the safeties like any other actuation.

`porv\_flow\_max = 0.0035` *(as built — slow, TMI-realistic inventory loss)*,
`safety\_flow\_max = 0.10`, `P\_containment = 0.103` MPa **\[tune]**.

**PORV block/isolation valve (B1 — built, folded in).** A manually-operated block valve
upstream of the PORV gates **all** PORV flow: `porv\_flow` is zeroed (relief *and* inventory
loss) when `block\_valve\_open` is false, even while the PORV itself is stuck open. This is the
real TMI recovery action — isolating a stuck-open PORV. Commands `open\_block\_valve` /
`close\_block\_valve`; `porv\_block\_open` in `control\_state`. Default open (no effect until the
operator closes it). The spring safety valves are unaffected (separate discharge path — the
block valve gates only the PORV line).

**Pressurizer level — the TMI deception.** When the PORV is stuck open and the primary is
boiling, steam pushes liquid *into* the pressurizer, raising its level **even as total
inventory falls**. This is what misled the 1979 operators into throttling injection.

```javascript
thermal\_surge = K\_thermal\_surge \* dTavg\_dt;              // expansion/contraction
void\_surge    = K\_void\_surge   \* primary\_void\_fraction;  // voiding pushes liquid up
surge\_in\_rate = thermal\_surge + void\_surge;
dPzrLevel\_dt  = (surge\_in\_rate
                 - porv\_flow   \* level\_loss\_per\_flow
                 - safety\_flow \* level\_loss\_per\_flow) \* K\_level;
pzr\_level\_pct = clip(pzr\_level\_pct + dPzrLevel\_dt \* dt, 0, 100);
```

`K\_thermal\_surge = 2.0` *(as built — 12 was too aggressive on rod maneuvers)*,
**`K\_void\_surge = 40.0`** (strong — tune so pzr level *rises* as
primary voiding begins while inventory falls), `level\_loss\_per\_flow = 8.0`, `K\_level = 1.0`
**\[tune]**. *The TMI scenario test asserts pressurizer level rises while core inventory
falls; tune `K\_void\_surge` until this holds.* The PORV/safety discharge simply leaves the
primary inventory (§6.5); no discharge-tank model in v1.

**PORV tailpipe temperature *(as built)*.** The discharge line downstream of the PORV and
code safeties carries a temperature state `tailpipe\_temp\_c` (`stepTailpipe`,
`pwr\_pressurizer.js`): warm at baseline (`tailpipe\_ambient\_c = 82` °C — the seat has always
leaked a little, historically true at TMI-2), heating toward `tailpipe\_hot\_c = 150` °C with
`tailpipe\_heat\_tau = 30` s while any relief flow passes, and cooling back over
`tailpipe\_cool\_tau = 900` s once isolated (all **\[tune]**, config `tailpipe\_\*`). Exposed as
the `porv\_tailpipe\_temp` instrument — the honest-but-unalarmed indication that reveals a
stuck-open PORV.

### 6.5 Primary inventory and voiding

```javascript
dm\_dt = (charging\_flow + hpi\_flow + accumulator\_flow
         - letdown\_flow - porv\_flow - safety\_flow - leak\_flow);
primary\_mass = clip(primary\_mass + dm\_dt \* dt, 0.0, 1.2);   // 1.0 = full
// (as built — the never-driven safety\_injection\_flow hook is gone; injection is the
// HPI/LPI curve + accumulators of §6.9, nothing else feeds the balance)
```

When the primary reaches saturation **(using true values)** and inventory is dropping, steam
voids form:

```javascript
true\_subcooling = T\_sat(P\_true) - Tavg\_true;
primary\_void\_fraction = (true\_subcooling <= 0 \&\& primary\_mass < 1.0)
    ? clip((1.0 - primary\_mass) \* void\_gain, 0, 1) : 0;
```

`void\_gain = 3.0` **\[tune]**. Uncovery thresholds: `< 0.85` core voiding begins; `< 0.70`
top of core uncovers; `< 0.50` significant uncovery → heat transfer degrades:

```javascript
if (primary\_mass < 0.50) h\_fc\_effective = h\_fc \* (primary\_mass / 0.50);  // → 0
```

This is the damage endpoint of the TMI-without-injection branch (fuel temp rises toward
melt).

**Chemical \& Volume Control System (CVCS) — built, folded in.** The charging/letdown terms
above are the CVCS. **Charging** injects into the cold leg (inventory in, and it carries the
boron); it requires the **charging pump** (`set\_charging\_pump {running}`) and is set manually
(`set\_charging\_flow`) or by an **auto make-up** mode (`set\_cvcs\_auto {active}`) that modulates
charging up to `charging\_max` to hold inventory — compensating identified leakage (`cvcs\_makeup\_gain`).
**Letdown** (`set\_letdown\_flow`) removes inventory. **Boron chemistry is decoupled** from the net
charging−letdown flow (the earlier coupling was non-physical): borate/dilute change concentration
directly via `set\_boron\_adjust {rate}` (ppm/s, + borate / − dilute), gated on the charging pump —
`boron\_ppm += boron\_adjust·dt`. Safety injection is HPI (§6.9). Auto make-up defaults **off** so
the flagship/TMI behavior is unchanged; `charging\_max` (0.06) is sized to cover normal leakage but
not a LOCA. Spray takes suction from the cold leg after the RCP (§6.4), so its effect scales with
primary flow. Config: `boron\_adjust\_rate`, `cvcs\_makeup\_gain`, `charging\_max` (§15) — the
legacy `boron\_rate` entry (dead since the borate/dilute decoupling) is removed *(as built)*.

### 6.6 Reactor coolant pumps and flow

```javascript
if (pump\_running) flow\_frac += (1.0 - flow\_frac) / pump\_spinup\_tau   \* dt;
else              flow\_frac += (natural\_circ\_flow - flow\_frac) / pump\_coastdown\_tau \* dt;
flow\_frac = clip(flow\_frac, 0.0, 1.0);
```

`pump\_spinup\_tau = 3.0` s, `pump\_coastdown\_tau = 8.0` s, `natural\_circ\_flow = 0.0` (v1 does
not model PWR natural circulation — flow goes to zero on loss of all pumps; documented
simplification) **\[tune]**. The **low-flow trip** reads true flow (`\_\_true\_flow\_\_ < 0.25`),
the one documented HR1 exception — there is no flow instrument in v1 (§9).

### 6.7 Steam generators and secondary side

```javascript
T\_secondary = T\_sat(steam\_pressure\_mpa);           // secondary boils at its sat temp
Q\_sg = h\_sg \* flow\_frac \* (Tavg - T\_secondary);      // (same term as §6.2)
steam\_generation\_rate = Q\_sg / latent\_heat\_secondary;

dSGLevel\_dt = (feedwater\_flow - steam\_flow) \* K\_sg\_level;
sg\_level\_pct = clip(sg\_level\_pct + dSGLevel\_dt \* dt, 0, 100);

dSteamP\_dt = (steam\_generation\_rate - steam\_flow) \* K\_steam\_pressure;
steam\_pressure\_mpa = steam\_pressure\_mpa + dSteamP\_dt \* dt;
steam\_flow = (governor\_valve\_pct/100) \* steam\_flow\_rated \* (steam\_pressure\_mpa / steam\_p\_rated);
```

`latent\_heat\_secondary = 19.45` *(as built — normalizes `steam\_generation\_rate` to \~1.0 at
rated)*, `K\_sg\_level = 5.0`, `K\_steam\_pressure = 2.0`, `steam\_p\_rated = 5.65` MPa,
`steam\_flow\_rated = 1.0` **\[tune]**. The true SG level here has no shrink/swell — that is
added in the instrument model (§8.4).

**Turbine governor valve (EHC) *(as built)*.** Steam admission is modulated by a governor
valve `governor\_valve\_pct` with a first-order stroke (`governor\_tau = 2.0` s, config
`turbine.governor\_tau` **\[tune]**). The valve **target is pressure-compensated** (demand ÷
P/P\_rated, clamped fully open) so steady-state delivered steam equals the load demand at any
secondary pressure — the valve strokes open as pressure falls, like a real governor holding
load; the `governor\_valve` instrument follows the position (`pwr\_steam\_generator.js`).

**MSIV and SG code safety valves *(as built)*.** A main steam isolation valve gates both
downstream paths (turbine steam and dump-to-condenser): commands `open\_msiv` / `close\_msiv`,
state `msiv\_open`; closing it with the generator loaded **trips the turbine** (real plants:
MSIV closure = turbine trip) and the SG bottles up. Upstream of the MSIV, the SG code
safeties are the backstop above the 8.90 steam-dump setpoint. *(as built — 2026-07-16 design
ruling)* Their pop/reseat is a **control decision**, same treatment as the pressurizer
safeties (§6.4): the control layer's actuation reads the `steam\_pressure` **instrument** and
commands `open\_sg\_safety` above `sg\_safety\_open\_mpa = 9.31` MPa / `close\_sg\_safety` below
`sg\_safety\_reseat\_mpa = 9.0` (setpoints in the engine config — single source). The engine
keeps the hydraulics: proportional flow between reseat and pop while commanded open, capacity
`sg\_safety\_flow\_max = 1.2` **\[tune]** (`pwr\_steam\_generator.js`, `pwr\_engine.js`).

**Grid / load behavior *(as built)*.** Turbine load and coupled feedwater are integrated via
the shared `engines/load\_mode.js` (see `load\_mode\_spec.md`): `load\_mode`
(follow/manual/disconnected), `load\_target\_mwe`, `sg\_imbalance\_active`; commands
`set\_load\_mode`, `set\_load\_target`, `connect\_grid` / `disconnect\_grid`. A scram
disconnects the grid and trips the turbine. *(as built)* The SG-imbalance **annunciator**
reads **indicated** power — the engine stashes the previous step's `power\_range` reading and
`load\_mode.js` compares it against the load target (HR1: an annunciator is an indication,
not physics) — while the load-follow **tracking** stays on true power: the turbine extracts
what the reactor actually makes.

Feedwater and auxiliary feedwater:

```javascript
// FEED PUMP (as built): commanded speed reaches delivered demand through a first-order
// pump inertia. The load coupling, the operator (set\_feed\_pump\_speed / feed\_pump\_nudge),
// or a control channel writes feed\_pump\_speed\_pct.
feedwater\_demand\_frac += ((feed\_pump\_speed\_pct/100) - feedwater\_demand\_frac) / feed\_pump\_tau \* dt;
feedwater\_flow = main\_feedwater\_available ? feedwater\_demand\_frac : 0.0;  // lost on failure

// AFW (as built): proportional level hold × operator throttle — replaces the old hard
// start-level cutoff (same equilibrium, without the on/off chatter). The hold senses
// level through the SG LEVEL INSTRUMENT (the previous step's reading, stashed by the
// engine as \_ins\_sg\_level) — a failed level sensor fools the AFW regulator exactly as
// it fools the operator (HR1).
sensed\_level = \_ins\_sg\_level != null ? \_ins\_sg\_level : sg\_level\_pct;
hold = clip((afw\_level\_target + afw\_level\_band - sensed\_level) / afw\_level\_band, 0, 1);
if (afw\_active) feedwater\_flow += afw\_flow\_frac \* afw\_throttle\_frac \* hold;
// AFW auto-start reads the INSTRUMENT (HR1) — actuation lives in M4; the engine exposes the effect
```

`afw\_flow\_frac = 0.15`, `afw\_level\_target = 20` %, `afw\_level\_band = 8` %,
`feed\_pump\_tau = 8.0` s **\[tune]** (`pwr\_steam\_generator.js`; `afw\_start\_level = 20` %
remains as the M4 auto-start setpoint). Manual feed commands (`set\_feed\_pump\_speed`,
`feed\_pump\_nudge`, legacy `set\_feedwater\_flow`) set `feed\_auto\_coupled = false`,
decoupling feed from load; `set\_feed\_coupled {active}` re-couples it (`pwr\_engine.js`).

**AFW pump demand vs delivered flow *(as built — TMI-2)*.** `set\_afw {active}` sets the pump
demand (`afw\_pump\_demand` — the run lights, always honest); flow reaches the SGs only while
not blocked (`afw\_blocked`, the tagged-shut discharge valves of the `afw\_failure` failure) —
`afw\_active = afw\_pump\_demand \&\& !afw\_blocked`. Demand latches through a block, so
clearing it restores flow with the pumps already running, as in 1979. `set\_afw\_flow {pct}`
sets the operator throttle `afw\_throttle\_frac` (`pwr\_engine.js`).

**Steam dump / turbine bypass (B2 — built, folded in).** A dump path vents steam straight to
the condenser (bypassing the turbine) to control SG pressure on a turbine trip / load
rejection. **Auto** opens proportionally above `steam\_dump\_setpoint` (8.90 MPa, band 0.25)
*(as built — the setpoint is deliberately the NO-LOAD secondary saturation pressure, Tsat ≈
no-load Tavg \~303 °C: with no steam draw the secondary saturates up to it and the dump holds
it there, so hot standby holds its own temperature — the real steam-dump-in-pressure-mode
behavior)* — a basic relief-to-condenser, the same class as the pzr heater/spray auto-control
(allowed by `CONTEXT §8`); a manual override wins. The dumped steam is additional steam-out in **both** the
SG pressure and level balances (`steam\_out = steam\_flow + dump`). Command `set\_steam\_dump {mode: "auto"|"open"|"closed" | pct}`; `steam\_dump\_pct` / `steam\_dump\_auto` in `control\_state`.

### 6.8 Turbine and condenser (behavioral)

```javascript
if (synced) {          // grid-connected: the grid holds the generator at rated speed
    turbine\_rpm += (rpm\_rated - turbine\_rpm) / sync\_tau \* dt;   // sync\_tau = 0.5 s (config)
} else {               // free: coast down on lost steam, or overspeed if steam keeps flowing
    net\_torque = steam\_flow \* torque\_per\_flow - generator\_load \* torque\_per\_load;
    turbine\_rpm += (net\_torque / turbine\_inertia) \* dt;
}

if (condenser\_cooling\_available) dVac = (vacuum\_rated - vac) / vacuum\_restore\_tau;   // 96.5 kPa
else                             dVac = (vacuum\_lost  - vac) / vacuum\_decay\_tau;     // 16.9 kPa; slow → realistic lag
condenser\_vacuum\_kpa += dVac \* dt;

mwe\_output = P \* mwe\_rated \* (turbine\_rpm / rpm\_rated) \* (condenser\_vacuum\_kpa / vacuum\_rated);
```

*(as built)* The vacuum terms and the MWe normalization are in kPa against
`vacuum\_rated = 96.5` (the earlier 28.5/5.0 inHg forms were unit residue), and a
**grid-synced** generator (`generator\_load > 0`, not tripped) is speed-held at
rated rpm with time constant `sync\_tau = 0.5` s (config `turbine.sync\_tau`) — the free
net-torque branch applies only off the grid (`pwr\_steam\_generator.js` `stepTurbine`).

*(as built — 2026-07-16 design ruling)* Turbine **protection is a control decision**: the
low-vacuum and overspeed trips moved out of the engine into control-layer actuations that
read the `condenser\_vacuum` / `turbine\_rpm` **instruments** and issue the `trip\_turbine`
command (setpoints from the engine config — single source). The engine only spins the
machine — the synced branch no longer gates on vacuum, and nothing in `stepTurbine` trips
anything. A tripped turbine is now a command-level event, uniformly interceptable/failable.

`turbine\_inertia = 50.0` (coasts slowly), rated 1800 RPM, overspeed trip 1980 RPM,
`vacuum\_rated = 96.5` kPa, `vacuum\_lost = 16.9`, `vacuum\_restore\_tau = 10` s,
`vacuum\_decay\_tau = 30` s, low-vacuum trip setpoint 74.5 kPa (actuated by the control
layer), `mwe\_rated = 1000` **\[tune]**.
On turbine trip `generator\_load = 0`, steam demand drops to zero, and `load\_mode` goes to
`'disconnected'` *(as built — grid/load behavior is integrated via `engines/load\_mode.js`,
see `load\_mode\_spec.md`)*.

### 6.9 Emergency cooling

* **Emergency injection — merged HPI/LPI *(as built)*.** One system, one command
(`set\_hpi {active}`; `set\_lpi` retained as a deprecated alias), one two-segment pump curve
(`injectionFlowInv`, `pwr\_primary.js`): a high-head/low-flow segment (shutoff head
`hpi\_pressure\_ref = 16.44` MPa, `hpi\_flow\_max = 0.06` inventory-frac/s) plus a
low-head/high-flow segment (shutoff head `lpi\_pressure\_ref = 4.5` MPa, capacity
`lpi\_flow\_max = 1.0` × `lpi\_inventory\_gain = 0.10`), all **\[tune]**
(`pwr\_config.js emergency.\*`). Flow rises as pressure falls: at TMI pressures only the
high-head segment is in play (numerically the old standalone HPI — the flagship is
untouched); in a large LOCA the low-head segment dominates. Adds to `dm\_dt` (§6.5);
exposed as `hpi\_flow\_normalized` (delivered / combined rated) and the `hpi\_flow`
instrument (§8.8). Whether it runs is decisive in TMI; `degraded\_hpi` scales the whole
curve (§9). Auto-actuates on low pressure (M4).
* **Accumulators *(as built)*.** Passive borated tanks (`stepAccumulators`,
`pwr\_primary.js`) discharge into the cold leg once primary pressure falls below
`accumulator\_trip\_mpa = 1.5` MPa (proportional below it), with finite capacity that
depletes (`accumulator\_capacity = 2.5` inventory fractions, `accumulator\_flow\_max = 1.0`,
`accumulator\_inventory\_gain = 0.12`) **\[tune]** — no operator command, pressure-driven
only. The arming pressure is deliberately below the small-break/TMI pressure floor
(\~1.8–2.3 MPa), reserving accumulator action for a genuine large-break LOCA rather than
masking the TMI inventory/void lesson. State: `accumulator\_flow\_normalized`,
`accumulators\_discharging`, `accumulator\_volume\_pct`.
* **Auxiliary feedwater:** §6.7, a secondary-side heat-removal backup.
* **Residual heat removal (RHR — renamed from DHR) *(as built)*.** Low-pressure decay-heat
cooldown loop: alignable only below `rhr\_permissive\_mpa = 3.45` MPa with condenser cooling
available; when active it draws the coolant node toward `rhr\_sink\_c = 50` °C with gain
`rhr\_gain = 0.03` **\[tune]** (`pwr\_thermal.js`; config `emergency.rhr\_\*`). Command
`set\_rhr {active}` (`set\_dhr` retained as an alias); status boolean `rhr\_active`.

*(as built — the earlier "LPI and accumulators are deferred" note no longer holds; the
full ECCS ladder — HPI/LPI curve, passive accumulators, RHR — is in.)*

### 6.10 Fuel damage / melt endpoint

```javascript
if (fuel\_temp\_c > 1200) fuel\_damaged = true;            // cladding failure, FP release begins
if (fuel\_temp\_c > 2800) { melted = true; if (destruction\_cause === "none") destruction\_cause = "thermal\_melt"; }
```

Thresholds fixed (1200 / 2800 °C). The PWR reaches this only via the TMI-without-injection
uncovery path (or other severe loss of cooling).

\---

## 7\. Rod System

Two groups (see `CONTEXT.md §6.5` for the `rod\_groups` snapshot shape): a **control group**
the operator moves, and a **shutdown group** normally parked fully withdrawn that always drives
fully in on scram. The shutdown group **is operable** (the operator may drive it in for extra
shutdown margin, or park it back out — real startup withdraws it first) via the same
`rod\_start`/`rod\_stop`/`rod\_nudge` commands with `group\_id: "shutdown\_rods"`; a **scram always
overrides** operator motion and drives it fully in. The control-group operating position is
**per-state data** (`initial\_states\[name].rod\_op\_pct`) so the starting rod position tracks the
starting power — at 50 % the control bank sits visibly deeper than at full power, with boron
re-trimmed to keep the point critical.

```javascript
// Motion: 228 steps full travel; accumulate sub-step motion
step\_accumulator += Math.abs(velocity\_steps\_per\_s) \* dt;
const dir = withdrawing ? +1 : -1;
while (step\_accumulator >= 1.0) {
    position = clip(position + dir, 0, max\_steps);       // 0 = fully in, 228 = fully out
    step\_accumulator -= 1.0;
    if (position === 0 || position === max\_steps) { velocity = 0; break; }   // stop at limits
}
```

Selectable speeds: slow 8 steps/min (0.133/s), normal 48 (0.800/s), fast 72 (1.200/s).
`max\_steps = 228`.

**Insertion limits:** the control group has a power-dependent insertion limit; crossing it
sets `at\_insertion\_limit` (an alarm condition, §9). The shutdown group has none.

**Scram** (both groups drive in under gravity):

```javascript
velocity\_steps\_per\_s = -(position / scram\_insertion\_time\_s);
```

Control group **2.5 s** full travel; shutdown group **2.0 s** (slightly faster — pre-loaded)
**\[tune]**. Insertion is a real over-time event — the dynamics matter for how power falls;
do not apply scram as an instantaneous reactivity change.

\---

## 8\. The Instrument Model (built-in plant system)

The PWR's instruments are part of this engine (treated like any other plant system). They sit
between true state and what the operator sees, and they are what realizes the defining
principle: trips, alarms, and gauges all read these, never true state (HR1). The model
advances inside the engine step using `dt\_effective` (HR6), so lag is in *simulated* time and
stays correct under time acceleration.

### 8.1 First-order lag

```javascript
const alpha = dt / (lag\_seconds + dt);
reading\_lagged += alpha \* (true\_value - reading\_lagged);
```

Discrete equivalent of `τ·dy/dt = x − y`.

### 8.2 Gaussian noise (seedable PRNG — part of saved state, `CONTEXT.md §4`)

```javascript
reading\_noisy = reading\_lagged + gaussianRandom(0.0, noise\_sigma);  // independent each step
```

### 8.3 Range

Each reading pegs at its range limits — the instrument cannot indicate beyond what it can
measure.

### 8.4 Shrink-and-swell (SG level)

The SG level indication transiently moves the **wrong way** on rapid power changes:

```javascript
effective\_level = true\_level + swell\_factor \* power\_rate\_of\_change;   // smoothed dP/dt
// the lag filter (§8.1) then acts on effective\_level, so the transient appears then fades
```

`swell\_factor = 0.8` (PWR SG) **\[tune]**.

### 8.5 PORV position indicator — reports **commanded**, not actual

```javascript
porv\_indicator = porv\_commanded\_open ? "open" : "closed";   // NOT porv\_actually\_open
```

When the PORV sticks open, the command is "close" so `porv\_commanded\_open = false`, but the
valve is actually open. The indicator reads **closed** while the valve is open — the TMI
deception. (The `porv\_indicator\_stuck\_closed` failure §9 forces this independently of
command, as a distinct instrument failure.)

### 8.6 Derived: subcooling margin

`subcooling\_margin` is computed from the **instrument** pressure and temperature (not true
state), so it lags and inherits their errors (§6.3). It is the diagnostic that holds the
truth at TMI while the PORV indicator lies.

### 8.7 Failure modes

Any instrument can be made to **stick** (freeze at a value), **drift** (read progressively
off), go **dead** (bottom out / read nothing), or become **excessively noisy** — via
`set\_instrument\_failure {instrument\_id, mode, value}` / `clear\_instrument\_failure`. A stuck
instrument is the general form of the TMI failure.

Parameterization:

```javascript
if (mode === "stuck") this.failed\[id] = { mode:"stuck", value: (value ?? this.reading\[id]) };   // freeze at injection-time reading if no value (stuck-at-current)
if (mode === "drift") this.failed\[id] = { mode:"drift", offset:0, rate: value ?? DEFAULT\_DRIFT\_RATE };  // units/s, sim time (HR6)
if (mode === "noisy") this.failed\[id] = { mode:"noisy", scale: value ?? DEFAULT\_NOISE\_SCALE };
if (mode === "dead")  this.failed\[id] = { mode:"dead" };

// in the per-step update, while failed:
//   stuck -> reading = value
//   drift -> offset += rate \* dt;  reading = trueReading + offset        (acceleration-correct via sim time)
//   noisy -> reading = reading\_lagged + gaussianRandom(0, noise\_sigma \* scale)
//   dead  -> reading = range\_min (or last value)
```

The captured stuck `value`, accumulated drift `offset`, and `scale` join the saved
instrument-failure state (§13). Stuck-at-current lets a named sensor failure (e.g.
`tavg\_sensor\_failure`, `pzr\_level\_sensor\_stuck`, §9) be config-only — the UI need not supply a value.

### 8.8 PWR instrument set

Lag in seconds, noise σ in the instrument's units. These ids are the canonical PWR instrument
vocabulary — trips, alarms, scenario triggers, and gauges reference them.

|instrument\_id|measures|lag (s)|noise σ|range|
|-|-|-|-|-|
|`power\_range`|power %|0.1|0.2 %|0–120 %|
|`tavg`|coolant avg temp °C|4.0|0.2 °C|232–343 °C|
|`thot`|hot leg temp °C|4.0|0.2 °C|232–343 °C|
|`tcold`|cold leg temp °C|4.0|0.2 °C|232–343 °C|
|`primary\_pressure`|MPa|0.5|0.014 MPa|0–20.7 MPa|
|`pzr\_level`|%|2.0|0.5 %|0–100 %|
|`sg\_level`|%|3.0|0.5 %|0–100 %|
|`steam\_flow`|normalized|1.0|0.01|0–1.2|
|`fw\_flow`|normalized|1.0|0.01|0–1.2|
|`mwe\_output`|MWe|0.2|1.0 MWe|0–1300|
|`porv\_indicator`|open/closed|0.1|—|boolean|
|`subcooling\_margin`|°C|derived|derived|−28–83 °C|
|`turbine\_rpm`|RPM|0.5|2.0 RPM|0–2000|
|`condenser\_vacuum`|kPa|5.0|0.34 kPa|0–102 kPa|
|`charging\_flow`|normalized (TRUE flow, ≠ setpoint)|2.0|0.001|0–0.12|
|`letdown\_flow`|normalized (TRUE flow)|2.0|0.001|0–0.12|
|`steam\_pressure`|SG secondary MPa|0.5|0.02 MPa|0–10.5 *(as built — top of range = no-load saturation + margin)*|
|`boron\_analyzer`|ppm (chemistry sample)|45|4 ppm|0–2500|
|`governor\_valve`|turbine admission %|0.3|0.3 %|0–100|
|`hpi\_flow`|merged HPI/LPI injection, normalized to combined rated *(as built — renamed in place from `lpi\_flow`, PRNG order preserved)*|1.0|0.005|0–1.2|
|`accumulator\_flow`|normalized|0.5|0.005|0–1.2|
|`steam\_dump\_valve`|bypass valve %|0.3|0.3 %|0–100|
|`primary\_leak\_flow`|normalized (break)|0.2|0.002|0–1.0|
|`startup\_rate`|SUR, dpm|2.0|0.02|−5–10|
|`porv\_tailpipe\_temp`|PORV discharge line °C (§6.4)|10.0|1.5 °C|0–250|
|`source\_range`|SR counts/s — log scale, lag/noise per decade (§8.10)|0.5|0.02 dec|1–1e6|
|`intermediate\_range`|IR detector amps — log scale (§8.10)|0.5|0.02 dec|1e−11–2e−3|

Synoptic additions (`pwr\_synoptic\_prerequisites.md`): CVCS flow indications track the **TRUE** sim
flow, not the command setpoint (`instruments.charging\_flow` ≠ `control\_state.charging\_flow\_normalized`
under AUTO make-up); `boron\_analyzer` is the Realistic-board boron readout (`boron\_ppm` stays
Learning-only); `governor\_valve` follows the admission valve that modulates steam flow.

Status readings the protection/alarm config also reads (booleans/states, no lag/noise):
`rps\_scrammed`, `rcp\_running`, `hpi\_active`, `station\_blackout`, `steam\_demand\_low`,
`rod\_at\_limit`, `sr\_energized`, `msiv\_open`, `sg\_safety\_open`, and the synoptic additions
`afw\_active`, `afw\_pump\_running`, `rhr\_active`, `accumulators\_discharging`,
`condenser\_cooling\_available`, `safety\_relief\_active` *(as built — `lpi\_active` dropped
with the HPI/LPI merge)*.

The instrument model's internal state (every lag buffer, every active instrument failure, the
PRNG state) is part of save/restore (§13).

### 8.9 Reactivity proxies (reactivity computer / SUR / period — built, folded in)

Real PWRs have **no direct reactivity gauge** — operators infer reactivity from neutron-flux
trends. `getTrueState()` exposes three derived reactivity fields for an explicitly-labeled
**reactivity computer** (an engineering tool, not a board gauge) and the operator-facing
proxies: `reactivity\_pcm` (= net ρ · 1e5), `startup\_rate\_dpm` (= 26.06 · Ṗ/P), and
`reactor\_period\_s` (= P/Ṗ). SUR/period are well-defined only above a small power floor. These
are **display/derived only and never fed to protection** (HR1) — additive to the §6.3
contract, so M7's data-contract suite is unaffected.

### 8.10 Startup nuclear instrumentation (SR / IR) *(as built)*

Detector signals proportional to normalized power (`pwr\_engine.js` step 14b):
`sr\_counts\_cps = nis.k\_sr · P` — counted only while the source-range detector high
voltage is energized (`sr\_energized`, toggled by `set\_sr\_detector {on}`; the P-6
energize/de-energize interlock lives in the control layer) — and `ir\_amps = nis.k\_ir · P`.
Scaling `nis.k\_sr = 5.0e8` cps and `nis.k\_ir = 8.333e-3` A per unit normalized power
**\[tune]** (`pwr\_config.js nis`), sized so the `hot\_zero\_power` source equilibrium
(P = 1e-6) reads \~500 cps and the IR calibrated band tops out \~12 % power ("maxes out
around 10 %"). Exposed as the **log-scale** `source\_range` / `intermediate\_range`
instruments (lag and noise act per decade; a de-energized SR reads the range floor) plus
the `startup\_rate` (SUR, dpm) rate meter — see §8.8; `sr\_energized` is a status boolean.

\---

## 9\. Protection, Actuation, Alarms, Failures (data — read by M4)

Defined here as the PWR's configuration (HR3/HR8) and consumed by the Control \& Failure Layer
(M4). The engine does not act on them; it exposes the instruments they read and the controls
they drive. All trips/actuations/alarms read **instruments** (HR1), with the one documented
true-flow exception.

**Trips** — `(instrument\_id, direction, setpoint, action)`; any trip scrams:

```javascript
PWR\_TRIPS = \[
    ("power\_range",      "high", 120.0,  "scram"),   // % rated
    ("tavg",             "high", 335.0,  "scram"),  // °C
    ("primary\_pressure", "high", 16.44, "scram"),  // MPa
    ("primary\_pressure", "low",  12.41, "scram"),  // MPa
    ("pzr\_level",        "low",  12.0,   "scram"),   // %
    ("sg\_level",         "low",  12.0,   "scram"),   // %
    ("\_\_true\_flow\_\_",    "low",  0.25,   "scram"),   // documented HR1 exception: no flow instrument in v1
];
```

**Auto-actuation** — reads instruments, issues commands (which pass through M4's interception,
so a stuck PORV defeats the reclose):

```javascript
PWR\_ACTUATIONS = \[
    ("primary\_pressure", "high", 16.20, "open\_porv",  reset\_below=15.86, reset\_action="close\_porv"),
    ("primary\_pressure", "low",  11.03, "set\_hpi"),    // issued as {action:"set\_hpi", active:true}; reset would issue active:false
    ("sg\_level",         "low",  20.0,   "set\_afw"),    // issued as {action:"set\_afw", active:true}
    // (as built — 2026-07-16 ruling) mechanical protections moved in-stack: relief pops
    // and turbine trips are CONTROL decisions. Setpoints derive from the engine config
    // (single source); commands descend through interception like everything else.
    ("primary\_pressure", "high", 17.13, "open\_pzr\_safety", reset\_below=16.55, reset\_action="close\_pzr\_safety"),
    ("steam\_pressure",   "high", 9.31,  "open\_sg\_safety",  reset\_below=9.0,   reset\_action="close\_sg\_safety"),
    ("condenser\_vacuum", "low",  74.5,  "trip\_turbine",    reset\_below=84.7),  // re-arm only — a trip is one-way
    ("turbine\_rpm",      "high", 1980.0,"trip\_turbine",    reset\_below=1800.0),
];
```

*(as built)* The mechanical-protection actuations give the engine four new commands —
`trip\_turbine`, `open\_pzr\_safety`/`close\_pzr\_safety`, `open\_sg\_safety`/`close\_sg\_safety`
(catalogued in `CONTEXT.md §6.7`): the engine keeps valve state + flow hydraulics and the
control layer decides.

**Alarms** — `(id, instrument, direction, setpoint, priority, panel, label\_learning, label\_industry)`. Rule: every alarm setpoint is *less* extreme than the matching trip so the
alarm warns first; `lo\_lo` escalates `lo` (M4/M7 enforce). Panel A = reactor/primary,
Panel B = secondary/systems.

```javascript
PWR\_ALARMS\_A = \[
  ("reactor\_trip",      "rps\_scrammed",     "is\_true", null,   "critical","A","Reactor Trip","REACTOR TRIP"),
  ("high\_flux",         "power\_range",      "high",    108.0,  "critical","A","High Neutron Flux","HI FLUX"),
  ("high\_tavg",         "tavg",             "high",    312.2,  "warning", "A","High Coolant Temperature","HI TAVG"),
  ("pzr\_pressure\_high", "primary\_pressure", "high",    15.86, "warning", "A","Pressurizer Pressure High","PZR PRESS HI"),
  ("pzr\_pressure\_low",  "primary\_pressure", "low",     14.82, "warning", "A","Pressurizer Pressure Low","PZR PRESS LO"),
  ("pzr\_pressure\_lolo", "primary\_pressure", "low",     12.41, "critical","A","Pressurizer Pressure Very Low","PZR PRESS LO LO"),
  ("porv\_open",         "porv\_indicator",   "is\_open", null,   "warning", "A","Pressure Relief Valve Open","PORV OPEN"),
  ("subcooling\_low",    "subcooling\_margin","low",     11.1,   "warning", "A","Low Subcooling Margin","LO SUBCOOL"),
  ("subcooling\_lost",   "subcooling\_margin","low",     0.0,    "critical","A","Subcooling Lost — Coolant Boiling","SUBCOOL LOST"),
  ("pzr\_level\_high",    "pzr\_level",        "high",    75.0,   "caution", "A","Pressurizer Level High","PZR LVL HI"),
  ("pzr\_level\_low",     "pzr\_level",        "low",     25.0,   "warning", "A","Pressurizer Level Low","PZR LVL LO"),
  ("pzr\_level\_lolo",    "pzr\_level",        "low",     12.0,   "critical","A","Pressurizer Level Very Low","PZR LVL LO LO"),
  ("rod\_limit",         "rod\_at\_limit",     "is\_true", null,   "warning", "A","Control Rods — Insertion Limit","ROD INS LIMIT"),
];
PWR\_ALARMS\_B = \[
  ("sg\_level\_high",  "sg\_level",        "high",    75.0,  "caution", "B","Steam Generator Level High","SG LVL HI"),
  ("sg\_level\_low",   "sg\_level",        "low",     30.0,  "warning", "B","Steam Generator Level Low","SG LVL LO"),
  ("sg\_level\_lolo",  "sg\_level",        "low",     12.0,  "critical","B","Steam Generator Level Critical Low","SG LVL LO LO"),
  ("rcp\_trip",       "rcp\_running",     "is\_false",null,  "critical","B","Reactor Coolant Pump Trip","RCP TRIP"),
  ("hpi\_active",     "hpi\_active",      "is\_true", null,  "status",  "B","Emergency Cooling Active","HPI ACTIVE"),
  ("sbo",            "station\_blackout","is\_true", null,  "critical","B","Station Blackout — AC Power Lost","SBO"),
  ("turbine\_trip",   "steam\_demand\_low","is\_true", null,  "warning", "B","Turbine Trip / Low Steam Demand","TURB TRIP"),
  ("cond\_vac\_low",   "condenser\_vacuum","low",     84.7,  "caution", "B","Condenser Vacuum Low","COND VAC LO"),
  ("cond\_vac\_trip",  "condenser\_vacuum","low",     74.5,  "warning", "B","Condenser Vacuum Trip Level","COND VAC TRIP"),
];
```

**Failures** (kind per HR7 — physics-parameter failures live in this engine; command-override
failures are listed here but intercepted in M4):

```javascript
PWR\_FAILURES = {
  // command\_override = intercepted in M4; physics\_parameter = implemented in §9.1;
  // instrument = applied by the instrument model (§8); block = uses M4's command-block effect.
  // severity\_meta (engineering-unit slider metadata, schema in M4) is inlined on every severity\_scales failure.
  // category ∈ reactivity|coolant|power|instrument|safety\_system is carried on every failure
  //   (built, folded in — M4 §10 needs it; per HR3 it is plant data, so it lives here, not in M4).
  stuck\_porv\_open:            { type:"command\_override", intercepts:\["close\_porv"], override:"open\_porv", display:"PORV Stuck Open" },
  porv\_indicator\_stuck\_closed:{ type:"instrument", instrument\_id:"porv\_indicator", mode:"stuck", stuck\_value:"closed", display:"PORV Indicator Stuck Closed" },
  loss\_of\_feedwater:          { type:"command\_override", intercepts:\["set\_feedwater\_flow"], override\_value:0.0, display:"Loss of Main Feedwater" },
  turbine\_trip:               { type:"command\_override", intercepts:\["set\_steam\_demand"],   override\_value:0.0, display:"Turbine Trip" },
  loss\_of\_offsite\_power:      { type:"physics\_parameter", effect:"coast\_down\_pumps", display:"Loss of Offsite Power" },
  station\_blackout:           { type:"physics\_parameter", effect:"full\_blackout", display:"Station Blackout" },
  sgtr:                       { type:"physics\_parameter", effect:"primary\_leak", severity\_scales:"leak\_rate",
                                severity\_meta:{ label:"Leak Rate", unit:"% rated flow", min:0, max:8, default:3 }, display:"Steam Generator Tube Rupture" },
  rcp\_trip:                   { type:"physics\_parameter", effect:"stop\_pump", display:"RCP Trip" },
  loss\_of\_condenser\_vacuum:   { type:"physics\_parameter", effect:"vacuum\_decay", display:"Loss of Condenser Vacuum" },
  // (as built) degraded\_hpi and afw\_failure are PHYSICS-side (HR7): persistent physical
  // states in the engine (a degraded pump curve; tagged-shut AFW discharge valves), not
  // command interceptions — the old command\_override typing intercepted nothing (the M4 §7
  // self-flag, now resolved). degraded\_hpi's severity\_meta encodes the capacity↔severity
  // inversion with min > max (severity 0 → 100 % capacity, 1 → 0 %), so the slider label
  // reads true delivered capacity; the old \`invert\` flag was consumed by nothing.
  degraded\_hpi:               { type:"physics\_parameter", effect:"degrade\_hpi", severity\_scales:"hpi\_flow\_multiplier",
                                severity\_meta:{ label:"HPI Capacity", unit:"% rated", min:100, max:0, default:50 }, display:"Degraded HPI" },

  // set\_afw still descends so the PUMP demand latches — the run lights honestly show the
  // pumps running while the shut valves deliver zero flow (TMI-2, §6.7).
  afw\_failure:            { type:"physics\_parameter", effect:"block\_afw", display:"Auxiliary Feedwater Failure" },
  failure\_to\_scram:       { type:"command\_override", intercepts:\["scram"], effect:"block", display:"Failure to Scram (ATWS)" },
  stuck\_open\_spray:       { type:"command\_override", intercepts:\["set\_spray"], override\_value:true, display:"Pressurizer Spray Stuck Open" },
  failed\_pzr\_heaters:     { type:"command\_override", intercepts:\["set\_heater"], override\_value:0.0, display:"Pressurizer Heaters Failed" },
  sg\_overfeed:            { type:"command\_override", intercepts:\["set\_feedwater\_flow"], override\_value:1.2, display:"SG Overfeed / Overcooling" },
  large\_loca:             { type:"physics\_parameter", effect:"primary\_leak", severity\_scales:"leak\_rate",
                            severity\_meta:{ label:"Break Size", unit:"% rated flow", min:0, max:50, default:20 }, display:"Large LOCA (Cold-Leg Break)" },
  continuous\_rod\_withdrawal:{ type:"physics\_parameter", effect:"rod\_withdrawal\_runaway", severity\_scales:"withdraw\_rate",
                            severity\_meta:{ label:"Withdrawal Rate", unit:"steps/s", min:0, max:6, default:3 }, display:"Continuous Rod Withdrawal" },
  stuck\_rod\_on\_scram:     { type:"physics\_parameter", effect:"stuck\_control\_rod", severity\_scales:"worth\_fraction\_held",
                            severity\_meta:{ label:"Rod Worth Held", unit:"% of total", min:0, max:40, default:20 }, display:"Control Rod Stuck on Scram" },
  steam\_line\_break:       { type:"physics\_parameter", effect:"secondary\_depressurize", severity\_scales:"break\_size",
                            severity\_meta:{ label:"Break Size", unit:"% effective area", min:0, max:100, default:30 }, display:"Main Steam Line Break" },
  tavg\_sensor\_failure:    { type:"instrument", instrument\_id:"tavg", mode:"drift", display:"Tavg Sensor Drifting" },
  pzr\_level\_sensor\_stuck: { type:"instrument", instrument\_id:"pzr\_level", mode:"stuck", display:"Pressurizer Level Sensor Stuck" },
};
```

The physics-parameter effects (`coast\_down\_pumps`, `full\_blackout`, `primary\_leak` as a
`leak\_flow` term in §6.5, `vacuum\_decay`, `degrade\_hpi`, `block\_afw`) are implemented in this engine; the
command-override failures are implemented by M4 intercepting the named commands. The engine
must expose the hooks these effects need (a leak-flow term, a pumps-coastdown trigger, a
condenser-cooling-available flag). The newer physics-parameter effects
(`rod\_withdrawal\_runaway`, `stuck\_control\_rod`, `secondary\_depressurize`) are implemented in
§9.1; `failure\_to\_scram` uses M4's command-`block` effect; `large\_loca` reuses the `primary\_leak`
term at higher severity.

### 9.1 Physics-parameter failure effects — implementation

M4 routes `physics\_parameter` failures here on `inject\_failure {failure\_id, severity}` /
`clear\_failure`. The new effects are held in a small `\_fail` object and applied each step alongside
the existing effects. `\[tune]` values are arbitrated by §14.

```javascript
this.\_fail = {
  rod\_runaway: { active:false, rate:0 },        // steps/s
  stuck\_rod:   { active:false, worth\_held:0 },  // fraction of rod\_worth\_total
  steam\_break: { active:false, size:0 },        // 0..1
};
applyPhysicsFailure(effect, severity = 1.0) {
  switch (effect) {
    case "rod\_withdrawal\_runaway": this.\_fail.rod\_runaway = { active:true, rate: ROD\_RUNAWAY\_RATE\_MAX \* severity }; break; // \[tune] \~6 steps/s
    case "stuck\_control\_rod":      this.\_fail.stuck\_rod   = { active:true, worth\_held: STUCK\_ROD\_MAX\_FRAC  \* severity }; break; // \[tune] \~0.4
    case "secondary\_depressurize": this.\_fail.steam\_break = { active:true, size: severity }; break;
  }
}
clearPhysicsFailure(effect) { /\* set the matching .active = false \*/ }
```

**`rod\_withdrawal\_runaway`** — in the rod-motion update (§7, before reactivity §4). Drives the
control group out, overriding operator demand; the rest of §4 turns rising withdrawal into rising
power. Scram still works (it drives the shutdown group, untouched) — so the lesson is *scram to stop
it*.

```javascript
if (this.\_fail.rod\_runaway.active) {
    controlGroup.steps  = Math.min(controlGroup.max\_steps, controlGroup.steps + this.\_fail.rod\_runaway.rate \* dt);
    controlGroup.moving = true; controlGroup.direction = +1;   // operator rod\_nudge/rod\_stop ineffective while active
}
```

**`stuck\_control\_rod`** — in the rod-reactivity computation (§4). Adds the held-out worth back,
**scaled by how inserted the group is**, so it is inert at full power and maximal once scrammed in
(a clean run and a stuck-rod run are identical until the scram, then diverge):

```javascript
let rho\_rods = computeRodReactivity();                         // existing §4
if (this.\_fail.stuck\_rod.active) {
    const insertedFrac = 1.0 - position\_withdrawn\_normalized;  // 0 withdrawn, 1 inserted
    rho\_rods += this.\_fail.stuck\_rod.worth\_held \* rod\_worth\_total \* insertedFrac;
}
```

**`secondary\_depressurize`** — in the SG steam-pressure update (§6.7). Blows down secondary
pressure; the overcooling return-to-power rides the existing MTC path automatically (lower
`T\_secondary` → more primary heat removal → lower `Tavg` → positive `ρ\_MTC`):

```javascript
if (this.\_fail.steam\_break.active) {
    steam\_pressure\_mpa -= STEAM\_BREAK\_RATE \* this.\_fail.steam\_break.size \* dt;  // \[tune] \~0.5 MPa/s at full size
    steam\_pressure\_mpa  = Math.max(steam\_pressure\_mpa, 0.1);
}
```

`clear\_failure` reverses each effect (sets `.active = false`); the engine resumes normal behavior.

\---

## 10\. Named Initial States

The engine must construct these (driven by the `reset {plant\_id:"pwr", initial\_state}`
command, `CONTEXT.md §6.7`):

* **`hot\_full\_power`** — 100 % power at equilibrium, all systems normal: rods at their
operating position, boron trimmed, xenon at equilibrium, precursors at equilibrium,
primary 15.41 MPa / Tavg ≈ 304 °C, SG/pzr levels nominal, full flow, turbine at 1800 RPM /
1000 MWe. The steady-state test (§14) runs from here.
* **`hot\_zero\_power`** — subcritical, hot, at operating temperature and pressure, near-zero
power (precursors ≈ 0).
* **`50\_percent`** — stable 50 % power operation.

\---

## 11\. The Three Mile Island Sequence the Engine Must Make Possible

The engine does **not** script TMI (that is the Instructor's job, M6); it must make the
sequence physically reproducible and reach both outcomes from the same start. The §14
flagship test drives this directly (injecting the failures and the injection state) and
asserts the physics.

1. Plant at power, stable (`hot\_full\_power`).
2. Main feedwater lost (`loss\_of\_feedwater`) → SG level falls → heat removal degrades →
reactor trips on low SG level.
3. Primary pressure rises → PORV opens automatically at 2350.
4. PORV sticks open (`stuck\_porv\_open`) **and** its indicator sticks closed
(`porv\_indicator\_stuck\_closed`). Pressure now falls as coolant escapes — but to an
operator the indicator says the valve reseated.
5. Coolant is lost through the open valve → `core\_inventory\_pct` falls; primary reaches
saturation and voids form; **pressurizer level rises even as inventory falls** (§6.4); the
**instrument-derived subcooling margin erodes toward zero** while the PORV indicator keeps
lying.
6. Outcome forks on injection:

   * **HPI run** → inventory maintained, core stays covered, fuel temperature stays safe.
   * **HPI throttled/off** (as in 1979) → inventory falls below 0.50 → heat transfer degrades
→ fuel temperature rises toward melt → core damage.

Both outcomes must be physically reachable from the identical initiating sequence.

\---

## 12\. The Contract Surface (for M4/M5)

The engine exposes (names are yours; capabilities are required): `step(dt\_effective)`;
`getTrueState()` → the PWR `true\_state` block (`CONTEXT.md §6.3`); `getInstruments()` → the
`instruments` block (§8.8, derived `subcooling\_margin` included); `getControlState()` → the
`control\_state` block (`CONTEXT.md §6.5`, PWR-specific fields); `applyCommand(command)` for
every PWR command in `CONTEXT.md §6.7` (executed as a direct physical control — no decisions);
`saveState()` / `loadState(state)` (§13); and the scenario suite (§14). The engine reports
`active\_failures` it is carrying. It never assembles the snapshot or evaluates trips/alarms —
that is M5/M4.

\---

## 13\. Save and Restore

`saveState()` captures everything that affects future behavior so a restored run continues
**identically**: kinetics state (P, all six Cᵢ), xenon/iodine (I, X), all thermal states
(fuel/coolant temps, pressures, levels), inventory and void, flows, boron, rod positions and
motion, turbine/condenser state, active failures — and the **instrument model's internal
state**: every lag buffer, every active instrument failure, and the noise PRNG state. If lag
buffers or PRNG state were omitted, a restore would show a transient the original never had
and any replay would diverge. The save/restore scenario test (§14) asserts exact fidelity.

"Active failures" includes the physics-parameter failure state of §9.1 (`\_fail.rod\_runaway`,
`\_fail.stuck\_rod`, `\_fail.steam\_break`); "every active instrument failure" includes each failure's
captured stuck `value`, accumulated drift `offset`, and noise `scale` (§8.7). The §14 save/restore
test must be run **with a failure active** — the only way to catch a missing `\_fail` field or an
unsaved drift offset.

\---

## 14\. Acceptance — the PWR Scenario Test Suite

**This suite is the acceptance gate and the precise behavioral contract.** Build the engine
with the \[tune] starting values, run the suite, read which behaviors are off, adjust the
responsible parameter, repeat until it passes. Each test sets up an initial condition, runs
forward issuing commands at chosen times, and asserts checkable conditions; on failure it
prints expected-vs-observed and points at the likely cause so the tuning loop is fast. The
tests live on the engine (`PWRScenarioTests` in `pwr\_engine.js`) and call it directly,
bypassing every layer above (integration is M7's job, not this). *(as built)* The engine
test `Harness` **emulates M4's mechanical-protection actuations** (`autoM4`, 0.1 s cadence,
reads instruments — safety-valve pop/reseat and the turbine trips, which moved to the
control layer per the 2026-07-16 ruling), so the engine-only physics tests keep the
assembled plant's protections.

**Steady operation.** From `hot\_full\_power`, run minutes of sim time: power, pressure, Tavg,
pzr/SG levels stay within tight bands; reactivity stays ≈ critical; nothing drifts or
oscillates. Repeat at `50\_percent`. *Confirms the feedbacks balance and the plant is trimmed.*
A drift here points at feedback mistuning (Doppler/MTC/rod worth/reference temps).

**Control response.** Withdraw the control group a few steps → power rises and the plant
re-settles at a higher point; insert → power falls and re-settles. Direction correct,
magnitude reasonable, stable. *Confirms rod worth sign/magnitude and feedback response.*

**Shutdown.** Scram from power: power falls sharply as rods insert over \~2.5 s (not
instantaneously); after fission collapses, decay heat persists as a real, decaying heat
source (\~7 % initially). *Confirms scram dynamics and the decay-heat model.*

**Transients.** Each produces the right progression and fires the right trip:

* *Loss of main feedwater* → SG level falls → trip on low SG level; AFW behavior present.
* *RCP trip / loss of flow* → flow coasts down (τ≈8 s) → low-flow trip; Tavg/delta\_T respond.
* *Turbine trip* → steam demand → 0 → secondary pressure transient → trip if warranted.
* *Loss of condenser vacuum* → vacuum decays slowly → the (emulated) control-layer actuation
trips the turbine at < 74.5 kPa — the assertion allows for the vacuum instrument's lag.

**Flagship — Three Mile Island.** The most important test. Drive the §11 sequence directly,
controlling the valve-failure and injection states, and assert the physical outcomes:

* After `stuck\_porv\_open` + `porv\_indicator\_stuck\_closed`: `porv\_indicator` reads **closed**
while the valve is truly open; the `porv\_open` alarm does **not** annunciate.
* `core\_inventory\_pct` **falls** while `pzr\_level\_pct` **rises** (the misleading level).
* The instrument-derived `subcooling\_margin` **erodes toward/below zero** while the indicator
keeps lying.
* **Recovery branch:** with HPI run in time, inventory is maintained and the core stays
covered (`core\_inventory` stays above the damage threshold; `fuel\_temp` stays safe;
`melted` never set).
* **Damage branch:** with HPI throttled/off, inventory falls below 0.50, fuel temperature
rises toward melt, and damage occurs.
A failure to show the rising-pzr-level / falling-inventory divergence points at
`K\_void\_surge`; a subcooling margin that does not erode points at the voiding/inventory
coupling.

**Physics-level failure behavior.** Physics-parameter failures change the physics correctly
(an `sgtr` primary leak drains inventory; `loss\_of\_offsite\_power` coasts the pumps). The
command-override mechanism is exercised at the engine boundary (a stuck-open PORV ignores a
`close\_porv`) to confirm the hook works; the full instrument-vs-trip interaction is M7's job.
The §9.1 effects each have a check: *continuous rod withdrawal* — the control group withdraws
monotonically and power rises despite a `rod\_stop`, and `scram` halts it; *stuck rod on scram* —
post-scram decay is shallower / residual power higher than a clean scram; *steam line break* —
steam pressure and `Tavg` fall and `ρ\_MTC` turns positive (overcooling return-to-power). Instrument
modes: a *stuck-at-current* `tavg` holds at its injection value while true Tavg moves; a *drifting*
`primary\_pressure` diverges linearly from a steady truth.

**Save and restore.** Save mid-transient, restore into a fresh engine, and confirm the
restored run continues **identically** to one never interrupted — including instrument lag
state and noise sequence. Run this **with a failure active** (e.g. mid-`steam\_line\_break`) as well,
to confirm the §9.1 `\_fail` state and drift offsets round-trip. *Confirms determinism and save
completeness.*

When this suite passes, the PWR physics is done and correct — regardless of how the code was
structured to get there.

\---

## 15\. PWR Starting Parameters (\[tune] — collected)

|Parameter|Start|Tune against|
|-|-|-|
|`Λ` (PWR)|0.01 s|fixed|
|`α\_D` (Doppler)|−2.5e−5 K⁻¹|steady state, rod step|
|`α\_MTC`|−3.3e−5 K⁻¹|stability, power coefficient|
|`boron\_worth\_per\_ppm`|1.0e−4|steady criticality|
|`rod\_worth\_total`|0.085|rod worth, criticality|
|`xenon\_worth`|0.025|xenon transient|
|`sigma\_phi`|2.0e−5 s⁻¹|xenon equilibrium|
|`H1\_0 / λ1`|0.05 / 0.0005 s⁻¹|post-scram cooling|
|`H2\_0 / λ2`|0.02 / 0.00002 s⁻¹|post-scram cooling (hours)|
|`h\_fc` / `h\_fc\_dnb`|0.05 / 0.004 s⁻¹|temp response / DNB|
|`heat\_gen\_coeff`|19.45 (→ \~389 °C fuel rise)|fuel temperature|
|`h\_sg`|0.6 s⁻¹|primary→secondary transfer|
|`coolant\_heat\_capacity`|20.0|coolant time constant|
|`delta\_T\_rated`|33 °C|hot/cold leg split|
|`pump\_spinup\_tau` / `pump\_coastdown\_tau`|3.0 / 8.0 s|pump transients|
|`K\_heater / K\_spray`|0.55 / 1.7|pressure control|
|`K\_porv\_relief / K\_safety\_relief`|300.0 / 300.0|relief response (steam-space venting — decoupled from inventory loss)|
|`K\_surge`|1.0|pressure-level coupling|
|`K\_sat\_pull / K\_leak\_depressurize`|1.5 / 10.0|two-phase sat-pull / break blowdown|
|`porv\_flow\_max / safety\_flow\_max`|0.0035 / 0.10|relief capacity (TMI-realistic loss rate)|
|`K\_thermal\_surge`|2.0|normal pzr level|
|**`K\_void\_surge`**|**40.0**|**TMI rising-level test**|
|`level\_loss\_per\_flow / K\_level`|8.0 / 1.0|pzr level|
|`void\_gain`|3.0|primary voiding onset|
|`K\_sg\_level`|5.0|SG level|
|`K\_steam\_pressure`|2.0|secondary pressure|
|`steam\_p\_rated`|5.65 MPa|secondary operating point|
|`afw\_flow\_frac / afw\_start\_level`|0.15 / 20 %|AFW backup|
|`afw\_level\_target / afw\_level\_band`|20 % / 8 %|AFW proportional level hold|
|`feed\_pump\_tau`|8.0 s|feed-pump speed→flow inertia|
|`latent\_heat\_secondary`|19.45|steam-rate normalization (\~1.0 at rated)|
|`sg\_safety open / reseat / flow\_max`|9.31 / 9.0 MPa / 1.2|bottled-SG backstop (MSIV shut)|
|`steam\_dump\_setpoint / band`|8.90 / 0.25 MPa|no-load pressure hold|
|`governor\_tau`|2.0 s|EHC valve stroke|
|`turbine\_inertia`|50.0|turbine coastdown|
|`sync\_tau`|0.5 s|grid pull-in to rated speed when synced|
|`vacuum\_rated / vacuum\_lost`|96.5 / 16.9 kPa|condenser|
|`vacuum\_restore\_tau / vacuum\_decay\_tau`|10 / 30 s|vacuum response/lag|
|`mwe\_rated`|1000 MWe|electrical output|
|`swell\_factor` (SG)|0.8|SG level indication transient|
|`rho\_excess`|0.10|excess reactivity / criticality trim|
|`rod\_worth\_shutdown`|0.10|shutdown margin|
|`kinetics.source`|1.0e−6|1/M approach; HZP equilibrium|
|`pump\_heat\_frac`|0.0055|RCP heat — no-load heat-up|
|`dnb\_margin\_c`|8.0 °C|DNB onset (hot-leg exit)|
|`void\_flux\_gain / max / tau`|0.02 /°C / 0.8 / 3.0 s|flux-driven core boiling|
|`tailpipe ambient / hot / heat\_tau / cool\_tau`|82 / 150 °C / 30 / 900 s|PORV tailpipe tell|
|`hpi\_flow\_max / hpi\_pressure\_ref`|0.06 / 16.44 MPa|high-head injection segment|
|`lpi\_flow\_max·lpi\_inventory\_gain / lpi\_pressure\_ref`|0.10 / 4.5 MPa|low-head injection segment|
|`accumulator trip / flow / gain / capacity`|1.5 MPa / 1.0 / 0.12 / 2.5|passive injection|
|`rhr\_permissive\_mpa / rhr\_sink\_c / rhr\_gain`|3.45 MPa / 50 °C / 0.03|RHR cooldown|
|`nis.k\_sr / nis.k\_ir`|5.0e8 cps / 8.333e−3 A|SR/IR detector scaling|

**Operating points / fixed setpoints:** primary 15.41 MPa, Tavg ≈ 304 °C, secondary 5.65 MPa,
1800 RPM / 1000 MWe; PORV open 16.20 / reclose 15.86 (control-layer actuation data — the
engine's PORV is command-driven, §6.4); safety open 17.13 / reseat 16.55 and SG safety
open 9.31 / reseat 9.0 (likewise control-layer actuation data since the 2026-07-16 ruling —
the engine's valves are command-driven); vacuum trip 74.5 kPa / overspeed 1980 RPM
(control-layer `trip\_turbine` actuations);
`P\_containment` 0.103 MPa; `max\_steps` 228; scram 2.5 s (control) / 2.0 s (shutdown); fuel
damage 1200 °C, melt 2800 °C; trip/alarm setpoints per §9.

