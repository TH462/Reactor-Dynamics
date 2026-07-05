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
|`pwr\_config.js`|All PWR parameters as a structured config object (HR8) — every \[tune] value, operating points, the trip/alarm/failure definitions of §9|
|`pwr\_instruments.js`|The PWR instrument model (§8) — the instrument set, lag/noise/range/failure behavior, derived subcooling, the PORV commanded-vs-actual indicator|
|`pwr\_thermal.js`|Fuel + coolant temperatures, subcooling, void, fuel-damage endpoint (§6.1–6.3, §6.9)|
|`pwr\_pressurizer.js`|Pressurizer pressure, heater/spray, PORV + safety valves, surge line and level — the TMI level behavior (§6.4)|
|`pwr\_primary.js`|Primary loop temperatures, inventory + voiding, pumps + coastdown (§6.5–6.6)|
|`pwr\_steam\_generator.js`|SG heat transfer, level, steam pressure/flow, feedwater + AFW, turbine + condenser (§6.7–6.8)|
|`pwr\_protection.js`|The PWR trip, actuation, and alarm definitions as data (§9) — read by M4|

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

### Decay heat (persists after scram)

Two-term exponential, initialized at scram (the heat source behind TMI core damage and
post-shutdown cooling):

```javascript
dH1/dt = -lambda\_1 \* H1     // fast component
dH2/dt = -lambda\_2 \* H2     // slow component
H\_total = H1 + H2
```

At scram: `H1\_0 = 0.05`, `H2\_0 = 0.02` (→ 7% of rated). `lambda\_1 = 0.0005` s⁻¹,
`lambda\_2 = 0.00002` s⁻¹ **\[tune]**.

Total heat driving the thermal model: `Q\_total = P\_fission + H\_total`. After scram the
fission term collapses and `H\_total` persists.

\---

## 4\. Reactivity Feedbacks

Net reactivity each step is the sum (computed from the *previous* step's temperatures/states
— standard explicit coupling, `CONTEXT.md §11`):

```
ρ\_total = ρ\_rods + ρ\_doppler + ρ\_moderator + ρ\_xenon + ρ\_boron
```

These negative feedbacks are what make the PWR stable; the steady-state test (§14) confirms
they balance so the plant holds critical at the operating point. Set `T\_fuel\_ref` and
`T\_coolant\_ref` (the rated-power reference temperatures) so the feedbacks net to the steady
critical condition at `hot\_full\_power`.

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
group and (when inserted on scram) the shutdown group.

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

`heat\_gen\_coeff` chosen so rated power gives ≈ 389 °C fuel-above-coolant **\[tune]**.
`h\_fc = 0.05` s⁻¹ (normal); `h\_fc\_dnb = 0.004` s⁻¹ during departure from nucleate boiling
**\[tune]**. **DNB triggers when the subcooling margin drops below zero** (coolant reaches
saturation). Then `h\_fc\_effective = h\_fc\_dnb`; otherwise `h\_fc\_effective = h\_fc` (further
degraded on uncovery, §6.5).

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

`h\_sg = 0.06` s⁻¹, `coolant\_heat\_capacity = 1.0`, `delta\_T\_rated = 33 °C` **\[tune]**. The
`max(flow\_frac, 0.1)` floor represents heat building locally when flow is lost (drives the
low-flow temperature excursion).

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
         - spray\_flow\_frac  \* K\_spray
         - porv\_flow        \* K\_porv\_relief
         - safety\_flow      \* K\_safety\_relief
         - surge\_out\_rate   \* K\_surge
         + P\_restore\_rate);                 // small self-restoring term toward equilibrium
P\_MPa = P\_MPa + dP\_dt \* dt;
```

`K\_heater = 8.0`, `K\_spray = 25.0`, `K\_porv\_relief = 40.0`, `K\_safety\_relief = 60.0`,
`K\_surge = 0.103` (MPa-rate units), equilibrium 15.41 MPa **\[tune]**.

Heater/spray automatic behavior (proportional; operator may override via `set\_heater` /
`set\_spray`):

```javascript
const err = 2235 - P\_MPa;
if (err > 0) { heater\_power\_frac = clip(err/30.0, 0, 1); spray\_flow\_frac = 0; }
else         { heater\_power\_frac = 0; spray\_flow\_frac = clip(-err/50.0, 0, 1); }
```

Bands 0.207/0.345 MPa **\[tune]**.

PORV and spring-loaded safety valves (`porv\_open` is the **actual** valve state — see the
stuck-open failure §9 and the lying indicator §8.5):

```javascript
// PORV: auto-opens at 2350, auto-closes (command) at 2300; can be stuck open
porv\_flow   = porv\_open   ? porv\_flow\_max   \* Math.sqrt(Math.max(0,(P\_MPa-15)/2235)) : 0;
// Safety valves: purely mechanical — open at 2485, reseat at 2400
if (P\_MPa > 2485) safety\_open = true;  else if (P\_MPa < 2400) safety\_open = false;
safety\_flow = safety\_open ? safety\_flow\_max \* Math.sqrt(Math.max(0,(P\_MPa-15)/2235)) : 0;
```

`porv\_flow\_max = 0.04`, `safety\_flow\_max = 0.10`, `P\_containment = 0.103` MPa **\[tune]**.

**PORV block/isolation valve (B1 — built, folded in).** A manually-operated block valve
upstream of the PORV gates **all** PORV flow: `porv\_flow` is zeroed (relief *and* inventory
loss) when `block\_valve\_open` is false, even while the PORV itself is stuck open. This is the
real TMI recovery action — isolating a stuck-open PORV. Commands `open\_block\_valve` /
`close\_block\_valve`; `porv\_block\_open` in `control\_state`. Default open (no effect until the
operator closes it). The spring safety valves are unaffected (mechanical, HR7).

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

`K\_thermal\_surge = 12.0`, **`K\_void\_surge = 40.0`** (strong — tune so pzr level *rises* as
primary voiding begins while inventory falls), `level\_loss\_per\_flow = 8.0`, `K\_level = 1.0`
**\[tune]**. *The TMI scenario test asserts pressurizer level rises while core inventory
falls; tune `K\_void\_surge` until this holds.* The PORV/safety discharge simply leaves the
primary inventory (§6.5); no discharge-tank model in v1.

### 6.5 Primary inventory and voiding

```javascript
dm\_dt = (charging\_flow + hpi\_flow + safety\_injection\_flow
         - letdown\_flow - porv\_flow - safety\_flow - leak\_flow);
primary\_mass = clip(primary\_mass + dm\_dt \* dt, 0.0, 1.2);   // 1.0 = full
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
primary flow. Config: `boron\_adjust\_rate`, `cvcs\_makeup\_gain`, `charging\_max` (§15).

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
steam\_flow = turbine\_demand\_frac \* steam\_flow\_rated \* (steam\_pressure\_mpa / steam\_p\_rated);
```

`latent\_heat\_secondary = 1.0`, `K\_sg\_level = 5.0`, `K\_steam\_pressure = 2.0`,
`steam\_p\_rated = 5.65` MPa, `steam\_flow\_rated = 1.0` **\[tune]**. The true SG level here has no
shrink/swell — that is added in the instrument model (§8.4).

Feedwater and auxiliary feedwater:

```javascript
feedwater\_flow = main\_feedwater\_available ? feedwater\_demand\_frac : 0.0;  // lost on failure
if (afw\_active \&\& sg\_level\_pct < afw\_start\_level) feedwater\_flow += afw\_flow\_frac;
// AFW auto-start reads the INSTRUMENT (HR1) — actuation lives in M4; the engine exposes the effect
```

`afw\_flow\_frac = 0.15`, `afw\_start\_level = 20` % **\[tune]**.

**Steam dump / turbine bypass (B2 — built, folded in).** A dump path vents steam straight to
the condenser (bypassing the turbine) to control SG pressure on a turbine trip / load
rejection. **Auto** opens proportionally above `steam\_dump\_setpoint` (6.0 MPa, band 0.45) — a
basic relief-to-condenser, the same class as the pzr heater/spray auto-control (allowed by
`CONTEXT §8`); a manual override wins. The dumped steam is additional steam-out in **both** the
SG pressure and level balances (`steam\_out = steam\_flow + dump`). Command `set\_steam\_dump {mode: "auto"|"open"|"closed" | pct}`; `steam\_dump\_pct` / `steam\_dump\_auto` in `control\_state`.

### 6.8 Turbine and condenser (behavioral)

```javascript
net\_torque = steam\_flow \* torque\_per\_flow - generator\_load \* torque\_per\_load;
turbine\_rpm += (net\_torque / turbine\_inertia) \* dt;

if (condenser\_cooling\_available) dVac = (28.5 - vac) / vacuum\_restore\_tau;
else                             dVac = (5.0  - vac) / vacuum\_decay\_tau;   // slow → realistic lag
condenser\_vacuum\_kpa += dVac \* dt;

mwe\_output = P \* mwe\_rated \* (turbine\_rpm / 1800.0) \* (condenser\_vacuum / 28.5);
```

`turbine\_inertia = 50.0` (coasts slowly), rated 1800 RPM, overspeed trip 1980 RPM,
`vacuum\_rated = 96.5` kPa, `vacuum\_lost = 16.9`, `vacuum\_restore\_tau = 10` s,
`vacuum\_decay\_tau = 30` s, turbine trips when vacuum < 74.5 kPa, `mwe\_rated = 1000` **\[tune]**.
On turbine trip `generator\_load = 0` and steam demand drops to zero.

### 6.9 Emergency cooling

* **High-pressure injection (HPI):** injects against pressure; flow falls as primary pressure
rises. `set\_hpi {active}` (manual) or auto-actuates on low pressure (M4). Adds to
`dm\_dt` (§6.5). Whether HPI runs is decisive in TMI. `degraded\_hpi` failure scales its
flow (§9).
* **Auxiliary feedwater:** §6.7, a secondary-side heat-removal backup.
* **Decay heat removal:** arms on shutdown once cooled/depressurized enough; `set\_dhr`.

(The full ECCS — low-pressure injection, accumulators — is deferred per `CONTEXT.md §8`.)

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
|`steam\_pressure`|SG secondary MPa|0.5|0.02 MPa|0–8.0|
|`boron\_analyzer`|ppm (chemistry sample)|45|4 ppm|0–2500|
|`governor\_valve`|turbine admission %|0.3|0.3 %|0–100|
|`lpi\_flow`|normalized|1.0|0.005|0–1.2|
|`accumulator\_flow`|normalized|0.5|0.005|0–1.2|
|`steam\_dump\_valve`|bypass valve %|0.3|0.3 %|0–100|
|`primary\_leak\_flow`|normalized (break)|0.2|0.002|0–1.0|

Synoptic additions (`pwr\_synoptic\_prerequisites.md`): CVCS flow indications track the **TRUE** sim
flow, not the command setpoint (`instruments.charging\_flow` ≠ `control\_state.charging\_flow\_normalized`
under AUTO make-up); `boron\_analyzer` is the Realistic-board boron readout (`boron\_ppm` stays
Learning-only); `governor\_valve` follows the admission valve that modulates steam flow.

Status readings the protection/alarm config also reads (booleans/states, no lag/noise):
`rps\_scrammed`, `rcp\_running`, `hpi\_active`, `station\_blackout`, `steam\_demand\_low`,
`rod\_at\_limit`, and the synoptic additions `afw\_active`, `rhr\_active`, `lpi\_active`,
`accumulators\_discharging`, `condenser\_cooling\_available`, `safety\_relief\_active`.

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
];
```

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
  degraded\_hpi:               { type:"command\_override", intercepts:\["set\_hpi"], severity\_scales:"hpi\_flow\_multiplier",
                                severity\_meta:{ label:"HPI Capacity", unit:"% rated", min:0, max:100, default:50, invert:true }, display:"Degraded HPI" },

  afw\_failure:            { type:"command\_override", intercepts:\["set\_afw"], override\_value:false, display:"Auxiliary Feedwater Failure" },
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
`leak\_flow` term in §6.5, `vacuum\_decay`) are implemented in this engine; the
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
bypassing every layer above (integration is M7's job, not this).

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
* *Loss of condenser vacuum* → vacuum decays slowly → turbine trips at < 74.5 kPa.

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
|`heat\_gen\_coeff`|(→ \~389 °C fuel rise)|fuel temperature|
|`h\_sg`|0.06 s⁻¹|primary→secondary transfer|
|`delta\_T\_rated`|33 °C|hot/cold leg split|
|`pump\_spinup\_tau` / `pump\_coastdown\_tau`|3.0 / 8.0 s|pump transients|
|`K\_heater / K\_spray`|8.0 / 25.0|pressure control|
|`K\_porv\_relief / K\_safety\_relief`|40.0 / 60.0|relief response|
|`K\_surge`|15.0|pressure-level coupling|
|`porv\_flow\_max / safety\_flow\_max`|0.04 / 0.10|relief capacity|
|`K\_thermal\_surge`|12.0|normal pzr level|
|**`K\_void\_surge`**|**40.0**|**TMI rising-level test**|
|`level\_loss\_per\_flow / K\_level`|8.0 / 1.0|pzr level|
|`void\_gain`|3.0|primary voiding onset|
|`K\_sg\_level`|5.0|SG level|
|`K\_steam\_pressure`|2.0|secondary pressure|
|`steam\_p\_rated`|5.65 MPa|secondary operating point|
|`afw\_flow\_frac / afw\_start\_level`|0.15 / 20 %|AFW backup|
|`turbine\_inertia`|50.0|turbine coastdown|
|`vacuum\_rated / vacuum\_lost`|96.5 / 16.9 kPa|condenser|
|`vacuum\_restore\_tau / vacuum\_decay\_tau`|10 / 30 s|vacuum response/lag|
|`mwe\_rated`|1000 MWe|electrical output|
|`swell\_factor` (SG)|0.8|SG level indication transient|

**Operating points / fixed setpoints:** primary 15.41 MPa, Tavg ≈ 304 °C, secondary 5.65 MPa,
1800 RPM / 1000 MWe; PORV open 16.20 / reset 15.86; safety open 17.13 / reseat 16.55;
`P\_containment` 0.103 MPa; `max\_steps` 228; scram 2.5 s (control) / 2.0 s (shutdown); fuel
damage 1200 °C, melt 2800 °C; trip/alarm setpoints per §9.

