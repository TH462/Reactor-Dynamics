# PWR Feel-Tuning Plan — "Its Own Plant" (DRAFT for owner red-line)

**Status: v1.0 — APPROVED by owner 2026-07-20 ("Looks good"). Supersedes the execution
order in PWR_BEHAVIOR_CATALOG.md v2.0 §7. Phase 0 executed same day: Item-1 machinery
committed, ops SGTR subcooling check converted to strict xfail, shift-exam thresholds
re-probed for the program physics — all gates green (pwr 31/31, ops 20/20+1 known,
autoctl 20/20, m5 19/19, behavior 13 pass/6 xfail/0 unexpected, campaign 51/51).**

## 0. Direction (owner rulings, 2026-07-20)

The generic-Westinghouse-4-loop target numbers are dropped. This is **its own plant**:

1. **Identity: ~100 MWe / ~300 MWt single-loop experimental PWR.** Current primary
   thermodynamic operating point kept (~15.41 MPa, Tavg ≈ 300 °C class, existing
   setpoint ladder) — the rating and all human-facing flows change via the units/ratings
   layer, not the physics.
2. **Item-1 uncommitted work: keep the machinery, retarget the numbers.** Consistent
   steady-state init (anchor + derived secondary pressure), Tref-program hook, and the
   xenon-IC fix are committed as infrastructure; the 292→306 °C anchors are placeholders
   until Phase 3 picks this plant's own map.
3. **Trip character: ride-out plant.** Steam dump is upsized to ~100 % capacity; a turbine
   trip is a transient the operator manages, not an automatic scram. Reactor trips are
   reserved for genuine limits (pressure, flux, SG lo-lo, low flow, SI).
4. **TMI-2 module stays canon.** The sequence (loss of feed → SG dry-out → repressurize →
   PORV lift → stuck-open → void/level deception → pump cavitation → block-valve save)
   is a required behavior of this plant, retold at its scale. Times re-tune; causality
   and order do not.

**Design principle:** feel is set by *ratios of capacities*, not absolute numbers —
dump/steam-flow, spray/insurge, charging/leak, AFW/decay-heat, no-load-anchor/shrink.
Physics invariants (saturation coupling, heat balance, MTC sign, xenon, decay heat,
pressure-ladder ordering) are non-negotiable; ratios are the feel knobs; labels live in
the ratings table.

## 1. What the single-loop ruling actually costs (audit)

Good news: the engine **already is** a single-loop lumped model — one RCP
(`pwr_engine.js` `pumps: [{id:'rcp'}]`), one lumped SG, one MSIV, one steam line. The
4-loop framing only exists in comments, labels, and two catalog items. Consequences:

| Area | Change |
|---|---|
| TR-4 "trip of 1 of N RCPs" | **Retired.** Loss of *the* RCP at power → low-flow trip (existing 0.25 threshold, re-labeled). No partial-flow ride-out state exists. |
| PI-6 (P-8 single-loop low-flow trip) | **Moot — dropped.** |
| SGTR EOP | **Re-shaped.** With one SG you cannot "isolate the faulted SG and steam the others." The EOP becomes: trip + SI → **depressurize primary below SG pressure to kill the leak** → cooldown to RHR. The ops SGTR scenario is re-authored to this shape in Phase 5. |
| Loss of the RCP / natural circ | Sharper on a single-loop plant (no other loops to carry). Existing behavior (trip on low flow; SBO unsurvivable-by-design teaching point) already matches — document as character. |
| Cleanup | Retire "4-loop" comments (`pump_heat_frac`, loop-ΔP notes), scenario names, manual/instructor text, board labels — Phase 6, alongside the ratings table. |

## 2. Feel goals by regime (the catalog-v3 spine)

Each goal below becomes a catalog-v3 section; every goal gets pinned by a named probe.

- **FG-1 Startup:** deliberate and procedural — 1/M discipline, SR→IR→PR ladder,
  hours-scale heatup. *Already the sim's strength; carry forward unchanged.*
- **FG-2 Steady state & load-follow:** the plant holds itself. Tavg **monotonically
  rises** with load along this plant's own program (proposed starting point: shallow,
  ~297 °C no-load → ~304 °C full — a small plant with a relatively large SG needs less
  ΔT growth; exact anchors picked by feel in Phase 3). All-auto load-follow 100→50→100
  completes hands-off. Manual rod-only downpower sags Tavg below program — kept as a
  teachable consequence, not a bug.
- **FG-3 Pressurizer level:** *physical.* Level = f(inventory, thermal expansion) + void
  term only at saturation (CC-10 rework). Level-rises-with-load then **emerges** from the
  Tavg program — the v2.0 "level program" (SS-5) reduces to a CVCS setpoint curve
  consistent with physics.
- **FG-4 Turbine trip / load rejection (the ride-out signature):** turbine trip at 100 % →
  dump catches full steam flow, Tavg settles to the no-load anchor, **no reactor trip**;
  operator recovers at their own pace. 50 % load rejection is a non-event.
- **FG-5 Reactor trip:** dramatic but fair. Visible SG shrink and dump burst; pressure
  dips and heaters recover within ~5 min; MFW isolates on trip + low Tavg and **AFW takes
  the handoff** (CC-3) with a visible note. Shrink depth is an explicit taste knob (no-load
  anchor + `K_sg_level`/dump rate) — Phase 4 demos two tunings for the owner to pick.
- **FG-6 Casualty ladder (graduated severity):** small leaks are masked by CVCS and show
  up only as trend deviations (teaches trend reading); a full SGTR **overwhelms** charging
  (~2× charging_max → leak_scale ≈ 0.12) and forces trip + SI; SBLOCA/TMI runs the canon
  deception. Severity ordering: seal leak < small SGTR < charging capacity < full SGTR < SBLOCA.
- **FG-7 Protection philosophy: minimal and legible.** Every trip traceable to an
  indication the operator can see. Keep the existing ladder + add only *physical* items;
  no anticipatory trips (that's the big-plant compromise this plant doesn't need).

## 3. Interlock re-scope (vs. v2.0 ruling "add all PI-1…PI-8")

| Item | v2.0 | Now | Why |
|---|---|---|---|
| PI-1 reactor trip on turbine trip | add | **DROP** | Ride-out plant; 100 % dump removes the reason it exists. |
| PI-2 AMSAC turbine trip on lo-lo SG | add | **DROP** | Loss of feed → SG lo-lo trips the *reactor* → turbine trips via existing reactor→turbine link. Path already closes. |
| PI-3 reactor trip on SI | add | **KEEP** | Physical: SI means a real casualty is in progress. |
| PI-4 AFW start on loss of both MFW | add | **KEEP** | Physical heat-sink protection. |
| PI-5 FW isolation on SI + on trip w/ low Tavg (P-4) | add | **KEEP** | Bundled with CC-3 handoff (FG-5). |
| PI-6 P-8 single-loop low-flow | add | **DROP (moot)** | Single loop; existing low-flow trip covers loss of the RCP. |
| PI-7 RPS reset path + scram latch | add | **KEEP** | Operability, not philosophy. |
| PI-8 high pzr level trip (~92 %) | add | **KEEP** | Backstop for CA-4; physical limit. |
| Steam dump capacity | 50 % cap | **→ ~100 %** | The ride-out enabler (FG-4). Setpoint = Psat(no-load anchor), moves with Phase 3. |

## 4. Execution phases

Each phase ends with: suites green (strict-xfail convention), findings recorded, owner
check-in only where a taste call is flagged.

- **Phase 0 — Approve this plan.** Then commit the Item-1 machinery as-is on `develop`
  (anchors marked placeholder in commit message). Convert the known-RED ops SGTR
  subcooling check to an explicit xfail pointing at Phase 5 (it gets re-authored anyway).
  Confirming re-runs: run_pwr, run_behavior, run_autoctl, run_m5.
- **Phase 1 — Catalog v3 rewrite.** Feel-first: FG sections above replace the ±15 %-of-
  Westinghouse bands. Band columns become "this plant's number — minted at Phase 7
  freeze." Owner red-lines v3 before tuning starts.
- **Phase 2 — Foundations: CC-10 physical level.** Probes written *first* (CA-3/CA-4
  depths, TMI void deception, normal-ops level↔inventory tracking), then the rework:
  level derived from inventory + expansion + saturation-gated void term; independent
  level integrator and `_mass<=1.0` stopgap deleted. Riskiest single change — done early,
  isolated, heavily probed.
- **Phase 3 — Steady-state map & maneuvering.** Pick this plant's anchors (start
  ~297→304), derive dump setpoint, CVCS level-setpoint curve on top of physical level,
  re-band load-follow/ramp/autoctl expectations. Owner taste check: does load-follow
  *feel* right (authority, tempo)?
- **Phase 4 — Trip & post-trip feel.** Dump → 100 % + ride-out probe (turbine trip @100 %,
  no scram — replaces TR-1's assertion). CC-3 MFW→AFW handoff + PI-4/PI-5. Shrink-depth
  demo (two anchor/K_sg_level tunings) → owner picks. PI-3/7/8 added. Post-trip pressure
  recovery band pinned.
- **Phase 5 — Casualty ladder.** Spray flow cap sized so the TMI repressurization *wins*
  (PORV lifts) while a normal step insurge is still arrested. SGTR leak_scale → ~0.12 with
  battery severities re-picked (CC-8/CC-10/CA-3 stay inside CVCS capacity by design);
  single-SG SGTR EOP re-authored (depressurize-to-stop-leak). SI setpoint raise toward
  ~12.4 MPa *checked against TMI story clock* — TMI canon wins if they conflict. TMI-2
  module re-timed (CA-1).
- **Phase 6 — Identity & units layer.** Ratings table: 100 MWe / ~300 MWt, single loop,
  RCS flow, charging/letdown gpm, feed/steam flow, PORV/safety/dump capacities — consumed
  by UI readouts, manuals, instructor text, battery band checks. Retire 4-loop text
  everywhere (engine comments, board labels, beats, manuals). Plant gets a name (owner's
  call — short list to be offered). CHANGELOG entries per behavior change.
- **Phase 7 — Freeze.** Character bands minted from tuned golden runs (owner signs off on
  feel first, then numbers are pinned ±band). Catalog v3 → FROZEN. Full matrix:
  run_pwr, run_behavior, run_ops pwr, run_autoctl, run_m5, run_campaign (all 51 gates,
  beat text updated).

## 5. How behaviors get pinned (test philosophy)

Two probe tiers in `test/run_behavior.js`, same strict-xfail convention:

1. **Invariant probes** — plant-agnostic physics truths that must never move: Tavg map
   monotonic; heat-balance closure ±2 %; pressure-ladder ordering (op point < PORV <
   safeties; PORV lifts before high-P trip); saturation coupling (SG pressure =
   Psat(steam temp)); severity ordering of FG-6; xenon peak timing; level↔inventory
   tracking outside void regimes. These are written in Phases 1–2 and are permanent.
2. **Character probes** — this plant's own numbers (anchor temps, shrink depth, recovery
   times, ride-out margins), pinned only at Phase 7 after the owner approves the feel.
   Until then they exist as *direction/ordering* checks so tuning isn't chasing bands
   that are about to move.

Rule preserved from v2.0: every FG gets at least one probe; FAIL/GAP land as strict
xfails; any silent fix XPASSes red.

## 6. Owner decisions still open (deliberately deferred to their phase)

- Exact Tavg anchors (Phase 3, felt via load-follow).
- Post-trip shrink depth (Phase 4, picked from a two-tuning demo).
- Plant name + board labeling (Phase 6).
- SI setpoint final value if the ~12.4 target fights the TMI clock (Phase 5; canon wins).
