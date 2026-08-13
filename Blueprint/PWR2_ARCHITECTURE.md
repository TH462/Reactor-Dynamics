# PWR2 — a new PWR engine, built forward

**Status:** architecture, 2026-08-13. Build not started beyond Layer 0.
**Issue:** #479.

*(OWNER DIRECTIVE, 2026-08-13: "I want a full new engine. We should design it in a logical
fashion. An advantage to a new engine is that we don't screw up the current, mostly working
one. We save the current one as a reference.")*

## The rule that governs everything below

**`engines/pwr/` IS NOT TOUCHED.** Not "mostly not touched" — not at all. It is the
reference plant for every A/B measurement, and a reference that drifts is not a reference.
Any change to it invalidates every divergence number taken before that change.

Corollary: **PWR2 may not reuse anything from `engines/pwr/` by import or copy.** No module
system exists here (globals on `RD`), so the isolation is by namespace and by discipline.
Copying a function in means inheriting a fitted constant with its derivation lost — which
is the exact failure #479 exists to end.

- Directory: **`engines/pwr2/`**, files `pwr2_*.js`, matching the repo's plant-prefix rule.
- Namespace: **`RD.pwr2`**, a single object. `RD.pwr*` (old) is untouched and both can be
  loaded into one process simultaneously — which is what makes the A/B harness possible.

---

## The design rule: everything has a parent

Every number in PWR2 is one of exactly three kinds, and **each carries its kind in a
comment at its definition site**:

| Kind | Meaning | Allowed to change how? |
|---|---|---|
| `[ruled]` | The plant's identity (300 MWt, 2235 psia, 321/288 °C). | Owner ruling only. |
| `[derived]` | Computed from `[ruled]` values or other `[derived]` ones by a stated law. | By fixing the derivation, never by hand. |
| `[sourced]` | A real-plant figure with an ADAMS/UFSAR citation at the definition. | By a better citation. |

**There is no fourth kind. `[tune]` does not exist in PWR2.** A number nobody can derive or
cite is a number nobody can check, and ~90 of them are why the current plant cannot answer
"is this right?" — only "does this pass?". Where a value genuinely must be chosen (a layout
length, a design velocity target), it is `[derived]` **from a stated design-practice rule**,
and the rule is written next to it.

---

## Build order — strict dependency layers

Each layer is fully testable with **only the layers beneath it**. Nothing reaches upward.
A layer is not started until the one below it has a green runner.

```
L6  Casualties            breaks/leaks as junctions onto any node
L5  Systems               pressurizer, CVCS, ECCS, RHR, SG secondary
L4  Sources & sinks       core power (kinetics + decay), SG duty, pump work
L3  Plant topology        THE SLS-100 wiring: which nodes, which junctions
L2  Node & junction       generic conservation primitives
L1  Geometry              volumes, elevations, wall masses, areas  (data only)
L0  Water properties      h, rho, T_sat, h_fg, cp                  (pure functions)
```

### L0 — Water properties  *(pure functions, no state)*
The foundation, and **the single thing whose absence made the old engine unfalsifiable.**
`engines/pwr/` has one property function — `T_sat(P)` as a bare power-law fit — and no
enthalpy or density at all. Without `h(T,P)` there is no energy balance to check, so
`coolant_heat_capacity` had to be a fitted normalized rate rather than a mass times a
specific heat.

Needs: `T_sat(P)`, `P_sat(T)`, `h_l(T,P)`, `h_v(P)`, `h_fg(P)`, `rho_l(T,P)`, `rho_v(P)`,
`cp_l(T,P)`. Range: 0.1–17 MPa, 20–350 °C. Correlations fitted to steam tables, each with
its **stated accuracy** and a self-test asserting it against published table points.
Not IAPWS-97 in full — an educational sim does not need it — but honest about error.

**Gate:** `test/run_pwr2_water.js` — every function against published steam-table values,
with the claimed accuracy as the assertion.

### L1 — Geometry  *(data only, no behaviour)*
`Blueprint/PWR_DESIGN_BASIS.md` made machine-readable: per node volume, centroid
elevation, wall metal mass, wetted area, flow area; per junction resistance and Δz.

**Gate:** the volume ledger closes — components sum to the declared RCS volume within a
stated tolerance, RPV share lands in the real-plant band, loop transit time from L1 volume
and L4 flow lands in 10–12 s. *These are the §7 cross-checks of the design basis, run as
assertions instead of written in a table.*

### L2 — Node & junction primitives  *(the conservation core)*
The generic node: state `{m, h, T_wall[]}`, fixed `{V, z, M_wall, A}`.
The generic junction: `{from, to, ṁ, K, Δz}`.

```
dm/dt      = Σṁ_in − Σṁ_out
d(m·h)/dt  = Σṁ_in·h_in − Σṁ_out·h_out + Q_wall + Q_src
M·cp·dT_w/dt = −Q_wall
```

Enthalpy is the state, not temperature — advection is then the state variable moving, and
energy conservation becomes checkable. Nodes carry a per-node `plug | stirred` flag (pipes
transport, plena mix — `PWR_LOOP_GEOMETRY.md` §6) and a wall-lump count.

**Gate:** `test/run_pwr2_nodes.js` — **mass and energy conservation to machine precision on
a closed loop with no sources.** This is the assertion the current engine cannot make in
any form, and it is the whole point of the rebuild.

### L3 — Plant topology
The SLS-100 wiring: RPV (downcomer / lower plenum / core / upper plenum), hot leg, SG
primary, crossover, RCP, cold leg — plus the pressurizer's surge line as a **junction**
onto the hot-leg node (`PWR_LOOP_GEOMETRY.md` §6: the surge line has negligible capacity,
so it is resistance + elevation, not a node).

**Gate:** topology is closed — every node reachable, every junction's endpoints exist,
total volume equals L1's ledger.

### L4 — Sources & sinks
Core power (kinetics + decay heat), SG heat removal, RCP work as a **located** source in
the pump node (not a `pump_heat_frac` of core heat), ambient loss.

**Gate:** at steady full power the plant reproduces its **`[ruled]`** identity — 321/288 °C
legs, 33 °C ΔT, 300 MWt — from geometry and properties alone, with **nothing fitted to make
it do so.** If it misses, the derivation is wrong and gets fixed; the number does not get
nudged. *(This gate is what a `[tune]` constant exists to defeat, which is why there are
none.)*

### L5 — Systems
Pressurizer (**coordinate with #472** — its rebuild is the design input, do not duplicate
or pre-empt it), CVCS, ECCS, RHR, SG secondary.

### L6 — Casualties
Breaks as junctions onto **any** node — which makes break *location* physics rather than a
scalar severity: cold-leg break ECCS bypass, crossover break loop-seal drain, SGTR
containment bypass. `PWR_LOOP_GEOMETRY.md` §7.

---

## The A/B harness

Built once L4 exists (the first point at which both plants can be asked the same question),
as `test/run_pwr2_ab.js`. Loads **both** engines, runs matched scenarios, reports a
divergence table per variable.

**It is a MEASUREMENT, not a gate — and this distinction is load-bearing.** The repo's
existing refactor precedent (#393, `chart_math`, 235 frames replayed) had the claim
*"nothing changed"*, making replay a regression harness. **Here the claim is the opposite:
things should change.** So this harness reports; it never passes or fails.

Adjudication is **HR9** — the plant is ground truth, and a `[derived]` number outranks a
fitted one — applied **one divergence at a time** (the standing "adjudicate reds ONE AT A
TIME" rule, at scale). A divergence table read as pass/fail would either bless every change
or reject every change, and both are wrong.

---

## Interaction with the current gates

`test/run_all.js` **auto-discovers `test/run_*.js` and fails on any runner with no
BASELINES entry** — so each PWR2 runner needs its baseline added in the same change that
adds the runner. PWR2 runners are additive; **no existing baseline moves**, because
`engines/pwr/` does not move.

---

## Open, needing an owner call before L5

- **Sequencing against #472** (pressurizer rebuild, live on `workbench`). L5 needs its
  design as input. L0–L4 are clear of it entirely.
- **The endgame.** Does PWR2 eventually *replace* `engines/pwr/`, or ship beside it? This
  does not block L0–L4 and should not be decided early — the divergence table is the
  evidence that decision wants, and it does not exist yet.
- **The UNSOURCED design-practice constants** in `PWR_DESIGN_BASIS.md` §§2–3 (power density,
  lattice coolant fraction, downcomer gap, plena heights) are recalled, not cited. They are
  load-bearing for L1's ledger. An evidence pass is owed before L1's gate can reject
  anything.
