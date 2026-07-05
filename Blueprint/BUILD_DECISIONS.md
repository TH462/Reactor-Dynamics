# Reactor⚛️Dynamics — Build Decisions, Deviations & Flags

**Purpose.** A running log of every non-obvious choice made while building the modules:
decisions the spec left to the implementer, deliberate **deviations** from the literal spec
(with the reason), and **open flags** to revisit. The spec files (`CONTEXT.md`, `M1`–`M8`)
remain the source of truth for *intent*; this file records *what was actually built and why*
where the two differ or where judgment was exercised.

**How to maintain (read this before editing).**
- Append, don't rewrite history. When a flag is resolved, move it to the relevant module's
  "Resolved" note rather than deleting it.
- Every entry: a one-line claim, then the *why*. Reference `file:symbol` where it helps.
- Update the **Open Flags** table at the top whenever a flag is opened or closed.
- Keep it skimmable: tables and short bullets, not prose.

**Status:** M1 ✅ · M2 ✅ · M3 ✅ · M4 ✅ · M5 ✅ · M6·PH ✅ · M7 ✅ · M8 🟦 functional alpha (PWR) · **all three engines proven — physics layer complete** · **RBMK+BWR now have full balance-of-plant (turbine/condenser/generator + electrical output) for PWR-parity full-scope operation** (RBMK 20/20·129, BWR 10/10·63) · **blueprint reconciled to code — CONTEXT + M1/M2/M3 now describe all built engine/contract additions (BOP, block valve, SLC/LPCS/SRV, reactivity proxies, 50% states); UI/[tune] deviations remain logged below** · (next: M6, or extend M8/M4 to RBMK+BWR)

---

## Open Flags (live)

| # | Module | Flag | Severity | Status |
|---|--------|------|----------|--------|
| F1 | M1 | Criticality uses an explicit `rho_excess` + operating-temp references instead of the spec's "set reference temps" mechanism (which yields non-physical refs). Will M2/M3 reuse this pattern? | design | **RESOLVED (M2, confirmed M3)** — yes, all three. M2 trims rho_excess per-state with pinned Doppler/graphite/void refs; M3 (also boron-free) pins Tf_ref/void_ref at full power and trims rho_excess ONCE as a fixed core constant (so post_scram_sbo comes out subcritical). The pattern is now the house style for boron-free criticality. |
| F2 | M1 | `sg_overfeed` failure `override_value: 1.2` is applied to `set_feedwater_flow {pct}` (0–100), so it underfeeds (1.2%) rather than overfeeds (~120%). Untested, not flagship. | data bug | **open** |
| F3 | M1/M4 | The M1/M4 seam: command-override failures' persistent effects live in the engine (M1), while interception lives in M4. M4 forwards *and* intercepts. M7 will scrutinize this. | seam | **open** — validate in M7 |
| F4 | M4 | `degraded_hpi` is typed `command_override` but its real effect is an engine HPI-flow multiplier (the spec itself flags this, M4 §7). Implemented via the engine hook. | taxonomy | **open** (spec-acknowledged) |
| F5 | M1 | `fuel_damaged` (cladding failure at 1200 °C) is internal, not in the §6.3 `true_state` contract. Consumers must use `fuel_temp_c`/`melted`. | contract | **open** — confirm M6/M8 don't need it |
| F6 | M5 | Acceleration is realized as fixed-0.02 s step **count**, not by scaling `dt` (CONTEXT §4's literal `dt_effective` diverges — verified). Every engine (M2/M3) must stay stable at 0.02 s; the service never hands them a larger dt. | deviation | **RESOLVED** — all three stable at 0.02 s. M2 fine with explicit Euler. **M3 needed an IMPLICIT prompt term** (its Λ=5e-5 makes explicit Euler unstable at 0.02 s: dt·β/Λ=2.6>2 — see M3 D1); still first-order, so the fixed-0.02 s contract holds for every engine. The service never needs a smaller dt. |
| F7 | M8 | Alarm system-category (left-bar color, M8 §8.5) is derived UI-side by keyword (`alarmCategory()`), because M1's alarm data has no `category`. Should move into the plant profile alongside `tile_label`/`scanner_hint`. | data | **open** — add to engine alarm config |
| F9 | M5/M6·PH/M7 | Integration tests assert `rod_nudge` reaches the engine **instantly** (`210 → 200`), but the engine now does a **rate-limited nudge** (drives a `nudge_target` over sim time — the "rod control reworked" change). The one-step assertion sees `210→210` and fails. **Pre-existing** (reproduces on clean HEAD; unrelated to the BOP work) — the stale check needs to step the sim forward after nudging. | test | **open** — fix the 3 integration tests to run the sim after `rod_nudge` |
| F8 | M8 | Control sections were made a **tabbed strip** (one section shown at a time), a user-directed deviation from M8 §5 ("always visible — not tabs, not collapsible"), to keep the control band skinny. Revisit whether tabbing the controls is acceptable for the real Instructor (M6) flow, where a scenario may need to highlight a control in a non-active tab. | deviation | **open** — confirm vs M6 highlight system |

---

## Cross-cutting decisions (apply to all modules)

| Topic | Decision | Why |
|-------|----------|-----|
| **Module system** | Global-namespace scripts: each file is an IIFE attaching to `globalThis.RD`. No ES modules, no build step. | User choice. Works under `file://` *and* when served (ES modules break on `file://` in Chrome), and `require()` in Node shares `globalThis`, so the same files run in the test harness with no shim. |
| **Test harnesses** | Both a Node CLI runner (`test/run_*.js`) and a browser page (`test_*.html`). | User choice. Node gives a fast tuning loop I can run directly; the browser page matches the browser-only ethos for the user to confirm. |
| **Units** | SI/MPa internal everywhere, per CONTEXT §11. | User-confirmed. The M1 code snippets had psia residue (see M1 deviations); reconciled to MPa. |
| **Repo** | Commits go directly to `main`, one per module. | Matches the linear, single-developer build (the scaffold was committed to `main`); each module is an independent, test-gated unit. |
| **Load order** | `config → protection → thermal → pressurizer → primary → steam_generator → instruments → engine`, then layers. | The engine captures `RD.pwr*` helper namespaces at IIFE-eval time, so its dependencies must load first. Encoded in `index.html`, `test_pwr.html`, and the Node runners. |

---

## M1 — PWR Engine

**Files:** `engines/pwr/{pwr_config, pwr_protection, pwr_thermal, pwr_pressurizer, pwr_primary,
pwr_steam_generator, pwr_instruments, pwr_engine}.js`
**Acceptance:** `node test/run_pwr.js` → 11/11 suites, 51/51 checks.

### Deviations from the literal spec (with reason)

| # | Spec said | Built instead | Why |
|---|-----------|---------------|-----|
| D1 | `T_sat(P_MPa) = 179.47·P^0.239 / 145.038 − 273.15` (and redeclares its param) | `T_sat(P_MPa) = 179.47·P^0.239` (°C directly) | The `/145.038` (psi→MPa) and `−273.15` (K→°C) were residue from a psia/Kelvin draft. Dropping both reproduces steam tables to ±2 °C over 5–17 MPa (15.41 MPa → 345 °C). The bare form is correct. |
| D2 | Criticality via "set `T_fuel_ref`/`T_coolant_ref` so feedbacks net to critical" | References pinned **at** the operating temps (Doppler/MTC = 0 there, purely stabilizing on transients) **plus** an explicit `rho_excess` constant that boron is trimmed against | With the given tiny feedback coeffs (α≈−3e−5/K), the pure-reference mechanism needs references hundreds–thousands of K above operating to supply the positive reactivity that balances negative rod/boron/xenon worth — non-physical. The excess-reactivity term is the standard, physical way; same end (critical at HFP, correct power-coefficient sign). **→ Flag F1.** |
| D3 | Fuel source `P·heat_gen_coeff`; coolant input `h_fc·(Tf−Tavg)` (§6.1/6.2) | Fuel source `Q_total·heat_gen_coeff` (fission+decay); both nodes use `h_fc_effective` | Post-scram decay heat must keep the fuel hot (the TMI uncovery heatup), so the source is total heat. Using `h_fc_eff` on both nodes conserves energy through DNB/uncovery (less heat reaches coolant as coupling degrades → fuel accumulates). |
| D4 | PORV "auto-opens at 2350, auto-closes at 2300" (in the engine snippet) | Engine PORV follows **commanded** demand + stuck flag only; the 16.20/15.86 MPa auto-open/reclose live in M4 actuation (and the §14 test emulates the actuation) | HR2: the engine makes no control decisions. The spring **safety** valves (mechanical, 17.13/16.55) stay in the engine — they are physics, not control (HR7). |
| D5 | Bare turbine integrator `rpm += net_torque/inertia·dt` (§6.8) | Grid holds synchronous speed while synced; the free integrator runs only after a turbine trip | The bare integrator drifts off 1800 rpm at steady state; a synchronous generator is grid-locked. The free integrator is retained for coastdown/overspeed after trip. |
| D6 | Several `[tune]` thermal coeffs (`h_sg=0.06`, `latent_heat_secondary=1.0`, `K_void_surge`, the pressurizer K's in mixed units) | Re-derived for energy balance: `h_sg≈0.6`, `latent_heat_secondary≈19.45`, `heat_gen_coeff≈19.45`; PORV relief gain decoupled from mass-loss; `P_restore_rate_gain` dropped to 0.02 | The literal starting values don't balance the steady-state heat equation (heat-in ≫ heat-out) and the pressurizer K's were psia-scaled. These are `[tune]` and arbitrated by §14; retuned until steady state holds and the transients behave. |

### Modeling decisions (spec left open)

- **Two-phase saturation pull** (`K_sat_pull`, `pwr_pressurizer.stepPressure`): once the primary voids,
  pressure is driven toward `P_sat(Tavg)` so subcooling → 0 — the physical truth of a saturated
  system and what makes indicated subcooling erode at TMI.
- **PORV pressure vs mass decoupled:** `K_porv_relief=300` (large — the valve vents the *steam* space,
  big pressure effect) but `porv_flow_max=0.0035` (small — slow inventory loss, TMI-realistic). One
  `porv_flow` term, two gains.
- **Decay heat tracks power continuously** (refined after alpha feedback). The two-term model gained a
  production term toward the equilibrium fraction `H₀·P`, and is **pre-loaded at startup** to that
  equilibrium — so an operating reactor already carries ~7% decay heat (3.5% at 50%, ~0 cold/subcritical),
  and it persists/decays after scram exactly as before (6.85% at 60 s). Replaces the old "switch on only
  at scram" form (which displayed 0% during operation). `Q_total` still embeds decay in `P` during
  operation (rated = total) and adds it as the residual source once scrammed; steady state and the §14
  suite are unchanged.
- **Shutdown-group worth** added (`rod_worth_shutdown=0.10`) — the spec says "sum the shutdown group"
  but gives no worth; chosen for shutdown margin.
- **Initial states** are built by computing the equilibrium temps analytically from the heat balance,
  then **trimming boron to exact criticality** (HFP references captured once on first HFP build).
  `hot_zero_power` is left subcritical by a fixed margin (rods inserted + boron).
- **PRNG:** mulberry32 with a single `uint32` state; Gaussian noise via Box–Muller. The state is part of
  save/restore (CONTEXT §4) — verified bit-exact in the save/restore test.

### Notes
- `fuel_damaged` is internal (not a §6.3 field) — **Flag F5**.
- `sg_overfeed` value units look wrong — **Flag F2**.

### Synoptic prerequisites (`develop`) — engine + instruments for the new PWR diagram
Implements `Blueprint/pwr_synoptic_prerequisites.md` so Fable can wire the synoptic from
`snapshot.instruments` + status booleans + `control_state` (no `true_state` on the Realistic board).
- **9 new §8.8 instruments** (lagged): `charging_flow`, `letdown_flow`, `steam_pressure`,
  `boron_analyzer`, `governor_valve`, `lpi_flow`, `accumulator_flow`, `steam_dump_valve`,
  `primary_leak_flow`. New SOURCE keys are **appended** so existing instruments keep their PRNG
  draw order — no perturbation to prior scenario/save-restore values.
- **6 new status booleans** in `instruments.reading` (via `_instrExtras`/`_copyStatus`):
  `afw_active`, `rhr_active`, `lpi_active`, `accumulators_discharging`,
  `condenser_cooling_available`, `safety_relief_active` (= `safety_open || safety_flow>0`).
- **CVCS setpoint vs indication split:** `s.charging_setpoint` (command) is separated from
  `s.charging_flow` (TRUE flow). `control_state.charging_flow_normalized` = setpoint;
  `instruments.charging_flow` ← true `charging_flow_actual` (0 with pump off; AUTO-modulated), so
  indication ≠ setpoint under auto make-up.
- **Governor** (`pwr_steam_generator.stepSecondary`): `governor_valve_pct` tracks load demand
  (first-order, `turbine.governor_tau`) and modulates `steam_flow = (gov/100)·steam_flow_rated·
  (P_sec/P_rated)`. At steady state gov/100 = demand, so rated flow is unchanged — no regression.
- **RHR (was DHR):** `set_rhr {active}` (+ one-release `set_dhr` alias → `rhr_active`); real physics
  in `stepCoolant` — a heat sink toward `rhr_sink_c`, gated on `pressure < rhr_permissive_mpa` +
  condenser cooling (dormant at power). `s.dhr_active` renamed `s.rhr_active`.
- **LPI:** `set_lpi {active}` + injection-vs-pressure curve (`lpiFlowNormalized`); M4 auto-starts on
  low pressure. **Accumulators:** passive, discharge below `accumulator_trip_mpa` with finite
  `accumulator_capacity` that depletes (`accumulator_volume_pct`). Both scale to inventory via
  per-system gains.
- **Break blowdown depressurization** (`pwr_pressurizer.stepPressure`, `K_leak_depressurize`): a
  primary break (`s.leak_flow`) now depressurizes the RCS (previously leaks only bled inventory, per
  the CONTEXT primary-pressure note). This brings **large LOCA into scope** — a large break crashes
  pressure into the ECCS band so LPI + accumulators actuate; the small PORV break (TMI) is unaffected
  (`leak_flow=0` there). **Accumulator arming pressure tuned to 1.5 MPa** (below realistic ~4.14 MPa):
  this v1 single-pressure model over-depressurizes a *small* break (TMI floors ~2.3 MPa / ~1.8 MPa
  in the damage branch), so a realistic setpoint would spuriously refill the TMI transient and mask
  the inventory/void lesson; the low arming pressure reserves accumulator action for genuine large
  breaks. Documented at the param.
- **M4 auto-permissives** added: low-pressure LPI auto-start (2.76 MPa) and RHR auto-align
  (3.45 MPa, gated on `rps_scrammed`). Safe setpoints — never reached in the existing suites.
- Gate green: **PWR 12/12** (TMI not regressed), **M7 31/31 + teeth**, **E2E 25/25** (set_rhr/set_lpi
  + CVCS indication + large-LOCA ECCS), **M4 10/10**; save/restore bit-exact mid-LOCA with LPI +
  accumulators + CVCS-auto active. Contracts synced: CONTEXT §6.3/§6.5/§6.7, M1 §8.8.

---

## M2 — RBMK Engine

**Files:** `engines/rbmk/{rbmk_config, rbmk_protection, rbmk_kinetics, rbmk_thermal, rbmk_rods,
rbmk_instruments, rbmk_engine}.js`
**Acceptance:** `node test/run_rbmk.js` → **18/18 suites, 99/99 checks** (both versions). Browser
page `test_rbmk.html`. Load order: `protection → config → kinetics → thermal → rods → instruments
→ engine` (protection before config so `forVersion()` stitches the version protection in; engine
captures `RD.rbmk*` helper namespaces at IIFE-eval, so they precede it).

### Deviations from the literal spec (with reason)

| # | Spec said | Built instead | Why |
|---|-----------|---------------|-----|
| D1 | `ρ_total = ρ_rods + ρ_doppler + ρ_void + ρ_xenon + ρ_graphite` (no excess term); `void_ref = 0.30` fixed | Added a trimmed **`rho_excess`** term; Doppler/graphite refs **pinned at full-power operating temps**; **`void_ref` pinned at each state's operating void** | Reuses the M1 D2 / **Flag F1** pattern (now resolved). The RBMK has no boron — with partially-inserted rods (negative) + equilibrium xenon (negative) and every feedback zero at its reference, nothing sums to critical; an excess term is unavoidable. **Pinning `void_ref` was also load-bearing for stability:** with the spec's fixed 0.30 vs the ~0.04 low-power operating void, ρ_void carries a large *negative* standing offset, and the power-dependent amplification shrinking that offset as power rises is itself a spurious positive feedback — the reactor ran away at `low_power_xenon` with no scram. Pinning makes the amplified coefficient act on the void *change* (the real accident mechanism). |
| D2 | `energy_deposition_scale = 0.42`, `void_response_tau = 2.0`, `α_D = −1.0e−5`, `alpha_void_base` pre `0.005`, `k_disp` pre `0.008` | Retuned: `scale = 4.0`, `void_tau = 1.0`, `α_D = −3.0e−5`, `alpha_void_base` pre `0.0025`, `k_disp` pre `0.05` | All `[tune]`, arbitrated by §19. The literal starting set produced *either* a spontaneous low-power runaway *or* (after the D1 fix) a pre excursion that fizzled at ~16 % and a violently-oscillating full-power flow response. The retune (below) makes pre cross prompt critical and destroy by **steam explosion**, post shut down safely, and full-power maneuvering stable — for both versions. |
| D3 | Internal rod `position` with `position↑ = inserted` (§9/§14.1) **and** contract `position_pct` with `100 = withdrawn` (CONTEXT §6.5) | Internal `steps` = **insertion** (0 withdrawn, max inserted); `getControlState` emits contract `position_pct = 100·(1−steps/max)` and a withdrawn-based `steps` | The two conventions are genuinely opposite (the spec says so). Keeping insertion internally makes ORM (`= inserted fraction · 211`), the displacer depth `z`, and the §14.1 runaway/stall signs all natural; the inversion happens only at the contract boundary. |

### The accident-tuning chain (how pre excurses / post is safe — the heart of M2)

The pre/post divergence comes from **three** levers acting in sequence at `low_power_xenon` (ORM ≈ 7.5, xenon 135 %, EPS bypassed); they were co-tuned until pre destroys and post does not:
1. **Displacer trigger (`k_disp`).** Control rods sit nearly withdrawn (ORM low ⇒ `z ≈ 0.29 m`, inside the 1.25 m water column). On AZ-5 they insert *through* the column; the peak−start Δρ ≈ `k_disp·0.34` must clear β (0.0065) by enough to drive a **hard** prompt spike *before* ORM rises out of the high-amplification band and the rods exit the column (~1.5 s window). `k_disp = 0.05` (pre) / `0` (post) — the functional version difference.
2. **Void sustain (amplified coefficient + faster `void_tau`).** The spike drives void up; the ORM-penalty × low-power × xenon amplification (here ~6× at ORM 12) makes rising void self-reinforcing. `void_tau` cut 2.0→1.0 so void catches the spike before the displacer fades.
3. **Destruction (`energy_deposition_scale`).** The milder (post-stability-retune) excursion peaks ~37 000 % with fuel only ~1070 °C, so the **thermal-melt** path (2800 °C) never fires — destruction must come from the **steam-explosion** EMA. `scale = 4.0` lifts the peak EMA (~384) clear of the 280 threshold while non-accident energy stays ~4 and post stays negligible, so there is no melt/explosion race and post never triggers.
- **Full-power stability** (the opposing constraint): `alpha_void_base` cut 0.005→0.0025 and `α_D` strengthened −1e−5→−3e−5 so a 20 % flow reduction settles ~+3 % instead of oscillating 285 %↔66 %. The accident still excurses because its amplification is ~6× and it is displacer-*triggered*, not base-coefficient-driven.

### Modeling decisions (spec left open)

- **Two rod groups, one carries the accident.** `control_rods` (function `control`, in ORM, version per-rod function incl. the displacer) + `shutdown_rods` (function `shutdown`, **pure absorber both versions**, not in ORM). The displacer/positive-scram effect lives only in the control rods (the historical graphite-tipped manual rods); the AZ emergency rods are clean absorbers — so a full-power scram (control rods already past the water column) is unconditionally safe, while a low-power scram (control rods in the column) triggers the excursion. `rod_count` is a lumped worth-scaling factor (control 1.0, shutdown 0.2), decoupled from the ORM `total_rod_count = 211`.
- **Heat source** mirrors M1: fission embedded in `P` during operation, decay added as the residual once scrammed (`Q_total = P + (scrammed ? H : 0)`) — keeps rated fuel temp right and the post-scram fuel hot.
- **`steam_to_turbine`** is a fixed load (= initial power), not power-tracking — so an excursion outruns the turbine draw and drum pressure rises into the reliefs / `steam_pressure` trip, rather than the load magically absorbing the spike.
- **Coolant temp** is `T_sat(steam_pressure)` (the channel water boils at drum pressure, ~286 °C at 7.0 MPa), feeding fuel/graphite coupling.
- **`MAX_PROMPT_GROWTH`** caps per-step prompt growth (pre 80 / post 5) as the §3 numeric backstop; a `_P ≤ 1e9` clamp and freezing kinetics once `melted` prevent post-destruction NaNs.
- **PRNG / save-restore** identical machinery to M1 (mulberry32, Box–Muller; lag buffers + failures + RNG state saved). Save/restore verified bit-exact mid-`channel_rupture` + mid-stall + instrument-drift, for both versions.
- **Protection is version-specific data** (`forVersion`): pre has 3 trips, post adds the tighter power trip + void trip; ORM alarm setpoint 15 (pre) / 43 (post). No engineered-safety auto-actuation (RBMK is trip-to-scram in v1).
- **`rho_excess` is trimmed PER-STATE** here (each named state, each version, trimmed to ρ=0 at its operating point) — both `full_power` and `low_power_xenon` start critical, which is correct (operators held criticality at low power before AZ-5). This differs from M3, which trims once (the BWR's `post_scram_sbo` must be *subcritical*). The pre/post trims differ because the rod/void terms differ by design.
- **`K_drum_pressure = 0.0207`** — the spec gives two values (§8.3 inline `0.0207`, §20 table `3.0`); took the detailed-section value (the §20 table looks like leftover from a different scaling, same pattern as the BWR's `K_vessel_pressure`). Steady state is insensitive (balanced imbalance → 0); it only sets pressure-transient speed, and the reliefs/trip cap the excursion regardless.
- **Contract addition — `reactivity_pcm`** in `true_state` (= `_rho·1e5`), additive beyond CONTEXT §6.3, mirroring M1's reactivity-computer field. Additive only, so M7's data-contract suite is unaffected; M8/M4 (when extended to RBMK) can surface it as a reactimeter reading, never a board gauge / never fed to protection (HR1).

### Notes / open items
- **F1 resolved** here (see flag table). **F6** confirmed for M2 (stable at 0.02 s).
- The `low_power_xenon` precondition is *metastable*, not a stable equilibrium — it sits at ρ≈0 until perturbed, and a sufficiently large upward nudge (the scram, on pre) runs away. This is faithful to the physics but means scenario scripts (M6) must drive it deliberately; free-running it for very long will eventually drift (xenon burnout).

---

## M3 — BWR Engine

**Files:** `engines/bwr/{bwr_config, bwr_protection, bwr_vessel, bwr_recirculation,
bwr_safety_systems, bwr_instruments, bwr_engine}.js`
**Acceptance:** `node test/run_bwr.js` → **9/9 suites, 47/47 checks**. Browser page
`test_bwr.html`. Load order: `config → protection → vessel → recirculation → safety_systems →
instruments → engine`. The Fukushima flagship runs ~17 h of plant time at 0.02 s (~3 M steps
across its branches) — the whole suite runs in ~10 s.

### Deviations from the literal spec (with reason)

| # | Spec said | Built instead | Why |
|---|-----------|---------------|-----|
| D1 | "No prompt fast-path (standard Euler kinetics throughout)" (§3) | **Implicit (prompt-jump) Euler** for the prompt term: `P=(P+dt·ΣλC)/(1−dt·(ρ−β)/Λ)` | The BWR's Λ=5e-5 makes the prompt mode decay at β/Λ≈130 s⁻¹; **explicit** Euler is unstable at dt=0.02 (dt·β/Λ=2.6>2) — it blows up even at ρ=0, and even the scrammed `post_scram_sbo` diverged. The implicit form is still **first-order** (CONTEXT §11 forbids only *higher*-order methods) and is unconditionally stable for ρ<β — exactly the BWR's envelope (it never reaches prompt critical, §3). **Resolves Flag F6** for M3. |
| D2 | `rho_total = ρ_rods+ρ_doppler+ρ_void+ρ_xenon` (no excess term); `void_ref=0.40` fixed; `K_vessel_pressure` 0.0172 (§6.1) / 2.5 (§19 table) | Added a trimmed **`rho_excess`** (fixed core constant, full-power-critical, no per-state retrim); Tf_ref/void_ref pinned at the full-power operating point; **`K_vessel_pressure=0.5`** | Same F1 boron-free criticality pattern as M1/M2 — but trimmed ONCE (not per-state) so `post_scram_sbo` (rods fully in) comes out genuinely subcritical. The §19 table's `K_vessel_pressure=2.5` made decay-heat steam pressurize so fast it pinned vessel pressure at the relief setpoint and **ADS could never depressurize against it** (the whole intervention branch failed); 0.5 lets ADS win while still giving a sharp turbine-trip transient. |
| D3 | `ads_depressurization_tau=600 s`, `vessel_water_mass=1.0`, `rcic_flow_normalized=0.01` (§19) | `ads_tau=120 s`; `vessel_water_mass=7.0` (rcic stays 0.01) | All `[tune]`, arbitrated by §18. At 600 s ADS stalled ~3 MPa (decay steam out-vented it near the threshold) — a real ADS blows down in minutes, so 120 s. `vessel_water_mass=7` is the knob that sets the **uncovery timeline** (below); rcic_flow then matches early boiloff so RCIC holds. |

### The Fukushima timeline — how the hours-scale story is tuned (the heart of M3)

The §18 flagship is the acceptance centerpiece; the numbers were tuned so the timeline is
*approximately* right (the spec's explicit goal):
- **boiloff = `H_total/(latent·vessel_water_mass)`, gated to `scrammed`.** Gating off at power
  keeps full-power level stable (the normal steam/feedwater balance holds it); after scram it
  becomes the inventory threat. `vessel_water_mass=7` makes early-decay (7 %) boiloff ≈ the RCIC
  flow (0.01), so **RCIC holds the core covered** (level pegs ~100 %) through the grace window.
- **Battery: linear timer, `battery_duration_hours=8`** → at ~8 h depletes → RCIC (and HPCI) lose
  DC control power and stop. Observed: level falls 100 %→20 % in **~3 h** (within the spec's 2–4 h),
  then to 0; fuel then heats (h_fc collapses on uncovery) to the 1200 °C damage onset by ~14 h.
- **Intervention branch:** after RCIC fails, ADS (`trigger_ads`, fast 120 s blowdown) drops vessel
  pressure below the 1.03 MPa LPCI threshold in minutes; LPCI (0.05, large) then refills the
  vessel → **core saved, no damage**. Same start, opposite outcome — the lesson.

### Modeling decisions (spec left open)

- **Engine never auto-starts the safety systems (HR2).** Auto-start (RCIC at level<50, HPCI<30,
  ADS<15 gated `hpci_unavailable`, LPCI gated `ads_open`) is M4 **actuation data** (§13); the
  flagship test emulates it in a `runActuated` helper (as M1's TMI test emulated RPS/PORV). The
  engine computes only the running EFFECTS and the physical stop-limits (steam-pressure cutoff,
  battery depletion).
- **`K_vessel_pressure`-driven decay steam** sets vessel pressure post-scram; relief at 7.58 MPa
  holds it there (SRVs cycling), which keeps RCIC's steam drive available — until ADS or a stuck
  SRV pulls it down (and below `rcic_min_pressure` RCIC stops on its own, the §13.1 lesson).
- **Recirc drive flow RAMPS toward the setpoint** (`tau_recirc=8 s`, pump inertia). An instantaneous
  flow jump swung the void hard enough to push ρ→β in one step (numerically violent, physically
  wrong); the ramp keeps flow maneuvering gradual. The BWR's flow→power coupling is genuinely
  strong (it IS the control mechanism), so a full-range flow push moves power a lot — the test
  asserts it *settles*, not a magnitude.
- **Core-uncovery heat-transfer collapse:** below `uncover_level_pct=20`, `h_fc` fades as
  `level²` toward a near-zero floor (`0.00005`), so once the core is uncovered decay heat
  accumulates and fuel heats to damage — the only path the BWR reaches fuel damage (no prompt
  excursion).
- **Rods** are bottom-entry but use the standard contract convention (steps=withdrawn, SCRUVE
  worth) like the PWR — only the 3 s fast hydraulic scram differs. PRNG / save-restore machinery
  identical to M1/M2; save/restore verified bit-exact mid-blackout with `srv_stuck_open` +
  degraded battery + an instrument drift.
- **`full_blackout_bwr` also closes the MSIV** (sets `steam_flow=0`, `turbine_blocked`) — a
  deliberate addition beyond the spec's "drop AC: lose recirc + main feedwater" (§13). Without it,
  after scram the turbine kept drawing steam while the core only made decay steam, so vessel
  pressure *crashed* below `rcic_min_pressure` and RCIC couldn't run. MSIV closure on loss of power
  is real plant behavior and is what lets decay steam build pressure to keep RCIC's drive alive.
  (`post_scram_sbo` already starts steam-isolated; this fixes the *injected* SBO path.)
- **Recirc operating point + command band.** Full-power recirc setpoint is **40 %** drive (not
  100): the 2.5× jet-pump multiplier makes core flow ≈ 100 % there (void ≈ 0.45). Because core flow
  caps at 120 %, `set_recirc_flow` is **clamped to 0–48 %** (drive above 48 % is wasted) — the
  operator's usable recirc band.
- **Contract addition — `reactivity_pcm`** in `true_state` (additive, like M1/M2). **`mwe_rated`
  (1100 MWe)** added to config so `set_turbine_load {mwe}` maps to a steam fraction (`mwe/mwe_rated`).
- **Vessel-pressure steam source = `Q_total`** (fission + decay), so a scrammed core still boils
  (decay) and pressurizes into the reliefs — the same `Q_total` that gates boiloff, kept consistent.

### Notes
- **F1 confirmed, F6 resolved** here (see flag table).
- The actuation-gate status readings (`ads_open`, `hpci_unavailable`) are surfaced for M4's
  `evaluateCondition`; the `actuation_gates` test exercises the gate logic engine-side (ADS gated
  on hpci_unavailable, LPCI on ads_open, and `ads_failure` blocking the chain).

---

## M4 — Control & Failure Layer

**File:** `layers/control_failure_layer.js`
**Validation:** integration smoke test `node test/run_m4.js` → 10/10 suites, 31/31 checks
(a **dev** check; full validation is M7's job, per M4 §2).

### Decisions & deviations

| # | Topic | Decision | Why |
|---|-------|----------|-----|
| C1 | **M1/M4 seam** | M4 **forwards** every `inject_failure`/`clear_failure` to the engine **and** holds command-override failures to intercept commands in flight | M1 implements each failure's *persistent state* in the engine (the "hooks", M1 §9) — e.g. `loss_of_feedwater` must stop feedwater whether or not a command is sent, which per-command interception alone can't do. M4 still intercepts (transform/block, incl. the plant's own auto-actuation/scram commands). Complementary, never contradictory. **→ Flag F3.** |
| C2 | **`__true_flow__` trip** | Reads `engine.getTrueState().pump_flow_pct / 100` | M1's `true_state` exposes `pump_flow_pct`, not the `flow_frac` named in M4 §3; same quantity, /100. The one documented HR1 exception. |
| C3 | **`last_trip_reason`** | Stored as `"<instrument> <direction>"` (e.g. `"sg_level low"`) | CONTEXT §6.2 types it `string`; a terse, human-readable descriptor. |
| C4 | **lo/lo_lo escalation** | A low alarm with a less-extreme low sibling on the same instrument fires only when the sibling's condition also holds | Implements M4 §5. Auto-satisfied by threshold ordering, but the guard is explicit for robustness. |
| C5 | **Alarm snapshot list** | Every alarm is emitted each cycle with its current `state` (including `clear`) | The UI annunciator (M8) is a fixed tile set; it needs all tiles, lit by `state`/`priority`. |
| C6 | **`evaluateCondition` default** | Unknown gate conditions evaluate **true** (permissive) | The PWR uses no actuation gate conditions; the evaluator is built generic for the BWR's `ads_open`/`hpci_unavailable` (M3). |
| C7 | **Failure `category`** | Added a `category` field to the PWR failure **data** (`pwr_protection.js`) | M4 §10's catalog needs `category ∈ reactivity\|coolant\|power\|instrument\|safety_system`; per HR3 it is plant data, so it lives in the engine config, not in M4. |
| C8 | **`degraded_hpi`** | Routed to the engine's `hpi_flow_multiplier` hook; its `set_hpi` interception is a pass-through | The spec (M4 §7) flags it as "really physics_parameter". **→ Flag F4.** |

---

## M5 — Simulation Service & Runtime

**File:** `layers/simulation_service.js`
**Validation:** integration smoke test `node test/run_m5.js` → 12/12 suites, 35/35 checks
(a **dev** check driving the full PWR stack; full validation is M7's job).

### Deviations from the literal spec (with reason)

| # | Spec said | Built instead | Why |
|---|-----------|---------------|-----|
| D1 | Engine handed `dt_effective = 0.02·time_acceleration`; loop runs a fixed step count of that dt (§3) | Engine always stepped at **fixed 0.02 s**; acceleration = **more steps per broadcast** | M1's Euler kinetics is only stable at 0.02 s and diverges at large dt (verified: 60× → dt 1.2 s blows up to 1e6 %). Step-count acceleration keeps every step stable and deterministic; at 1× it is identical to the spec (25 steps × 0.02 s / 500 ms). **→ Flag F6** (binds M2/M3). |
| D2 | `stepsPerBroadcast = broadcastInterval / PHYSICS_DT` (§3) | `round(accel · (broadcastMs/1000) / 0.02)` | The literal formula is dimensionally off (500 ms / 0.02 s = 25000, not 25); converted ms→s and folded acceleration into the count per D1. |

### Modeling decisions (spec left open)

- **Default pass-through Instructor** built into M5 (`DefaultInstructor`) as the slot's default occupant
  so the stack runs and is testable **before M6·PH lands**. It forwards commands to M4, runs no beats,
  emits `{message:null}`, tracks the register. M6·PH/M6 replace it via `opts.instructor` with no change
  to M5. (This is *not* M6·PH — that's a separate module/file.)
- **`set_register` dispatch:** the service sends it directly to **both** the Instructor and M4 (each
  consumes it; neither forwards it onward), and records `activeRegister` for the UI — per §5.
- **Save/restore split:** `saveState()` returns the state object and `loadState(state)` consumes one;
  the browser file-API wrappers (download / `<input type=file>`) are deferred to M8. Keeps the core
  logic deterministic and headless-testable (and is what M7 drives).
- **Loop mechanism:** a self-rescheduling `setTimeout` (so a cadence change applies on the next tick),
  with `tick()` / `advanceCycles(n)` exposed for synchronous, timer-free, deterministic test driving.
- **Transient detection** uses the plant's primary pressure field via a `primaryPressure()` helper
  (`pressure_mpa` / `steam_pressure_mpa` / `vessel_pressure_mpa`), per §7's "pressure_like".

## M6·PH — Placeholder Instructor

**File:** `layers/instructor_layer.js`
**Validation:** `node test/run_m6ph.js` → 8/8 suites, 18/18 checks.

A transparent pass-through occupying the Instructor slot (free-play): forwards commands straight
down to M4 (no gating), runs no beats, emits `{message:null}`, tracks the register. Implements the
exact interface the real M6 will, so M6 replaces this file's internals with no change to M4/M5/M7/M8.

### Decisions

- **`setRegister(value)` interface (vs routing `set_register` through `handleCommand`).** Per the
  M6·PH §3 interface, M5 dispatches the register via `instructor.setRegister(value)` and separately to
  M4. M5 was updated to this (it previously sent `set_register` through the instructor's
  `handleCommand`). `handleCommand` is now purely transparent.
- **M5's slot resolution:** injected instructor → else `RD.InstructorLayer` (M6·PH) if loaded → else
  M5's built-in `DefaultInstructor` fallback. The fallback now mirrors M6·PH exactly and exists only so
  M5 has zero hard dependency on the slot implementation (the swap-invariant test confirms identical
  free-play either way). Load order: `instructor_layer.js` before `simulation_service.js`.
- **`connect(layer)` added** to the instructor (beyond the spec's constructor-injection) so M5 can
  re-point the slot at the rebuilt M4 on a plant change without reconstructing scenario state.

## M7 — Test Runner Layer (dev-only)

**File:** `layers/test_runner.js`
**Validation:** `node test/run_m7.js` → positive 31/31 integration checks across 6 suites, **plus** a
negative "teeth" test that sabotages HR1 (trips read true state) and confirms the protection-boundary
suite catches it (3 failures reported). Exit 0 only when both hold.

A synthetic operator driving the assembled stack through M5's command interface and reading the
broadcast snapshots — validating WIRING, not physics (accident sequences are not re-run, per §2/§4).
Suites: `data_contract`, `instrument_vs_truth`, `protection_boundary` (the two HR1 boundary checks —
highest value), `command_flow`, `alarm_behavior`, `config_consistency`.

### Decisions

- **Config access for §3.6 is sanctioned, true-state access is not.** Assertions read only the
  snapshot + command interface (no engine internals), **except** the config-consistency suite, which
  reads `service.layer.config` (protection data) and `service.engine.cfg.instruments` (instrument
  specs) — explicitly the spec's intent ("by reading the config"). The snapshot already carries
  `true_state` (HR4), so the protection-boundary checks compare truth vs indication from the snapshot.
- **"Trip warns first" is existence, not universality.** §3.6's "trip more extreme than the matching
  alarm" is checked as *there exists* a less-extreme same-instrument/direction alarm — because a
  critical `lo_lo` alarm legitimately **coincides** with the trip (e.g. PWR `pzr_pressure_lolo` 12.41
  MPa == the low-pressure trip). The `lo`-level warning is what must precede the trip. `__true_flow__`
  is exempt (no instrument-based alarm).
- **Built-in negative self-test.** `run_m7.js` monkey-patches `_evalTrips` to read true state and
  confirms the gate fails — a gate that can't fail proves nothing. (Lives in the harness, not the
  shipped TestRunner.)
- **Driving:** `advanceCycles`/`runSeconds` step the loop synchronously and read the returned/broadcast
  snapshot — deterministic, timer-free, exactly what the UI would see.

## M8 — User Interface (functional alpha, PWR)

**Files:** `ui/shell.html` (page) · `ui/app.js` (wiring) · `ui/shell.css` (look). Root `index.html`
forwards here. **Open `ui/shell.html`** in a browser — it loads the engine + layers and runs live.

**Status:** a **working control room wired to the live stack** (M1 + M4 + M5 + M6·PH). Started as a
static mock (commit `308b133`); now `app.js` builds a `SimulationService`, `subscribe(render)`s, renders
each snapshot, and issues commands. Alpha = PWR only + a few deliberate simplifications (below).

### What works
- **Gauges + numeric placeholder** read `snapshot.instruments` (HR1); needle/trend/sparkline live.
- **Controls issue real commands** down the stack: SCRAM (guard-cover + 3 s arm), rods (raise/stop/lower/
  ±1 nudge/speed), RCP (run=clear `rcp_trip` / stop=inject it), boron borate/dilute/off, ECCS `set_hpi`,
  heaters/spray, feed `set_feedwater_flow`, AFW `set_afw`, breaker/turbine `set_steam_demand`.
- **Alarms** render from `snapshot.alarms` (sorted critical-first, system-color bar + severity flash;
  click to acknowledge; gauge-strip tint while unacked). **Failures tab** built from M4's catalog with
  engineering-unit sliders; inject/clear reconcile off `active_failures` (never optimistic).
- **Strip chart**: live rolling buffer, **Graph-tab parameter toggles**, low-profile time x-axis,
  per-series auto-scale, window selector, CSV export. **Lifecycle**: play/pause, speed (1–3600×, FF
  badge), reset to a chosen initial state, save/load JSON. **Settings**: register (`set_register`),
  units (US↔SI display convert), true-state overlay (Instruments/True/Both).

### Decisions / deviations (alpha)
- **Layout fix (user):** Instructor and Tools boxes use `flex: 1 1 0` (basis 0), so switching tabs never
  resizes either box; overflowing tab content scrolls inside a fixed-height `.tab-body`.
- **Acceleration via the wired M5** uses fixed-dt step-count (Flag F6) — stable to 3600×.
- **Alarm category is UI-side** (`alarmCategory()` keyword map) for the left-bar color, because M1's alarm
  data carries no `category` (M8 §8.5 wants it in the profile). **→ new Flag F7.**
- **A few controls are approximations** of CONTEXT §6.7: RCP run/stop maps to clear/inject `rcp_trip`
  (no pump-start command exists); Heater/Spray/ECCS "Auto" are no-ops (the engine has no command to
  *clear* a manual override back to auto); boron borate/dilute drive charging/letdown. EDG is visual.
- **`ui/shell.html` is the entry** (self-contained, `../engines`/`../layers` paths). The §19 `diagram/`
  `panels/` split is deferred — alpha keeps markup in one page driven by `app.js`.
- **Alarm palette** (also used by Failures categories): reactivity `#C084FC`, coolant `#38BDF8`, power
  `#FBBF24`, instrument `#2DD4BF`, safety_system `#F472B6`.

## Change log

- **M1** built and committed (`a18c85f`). Suite 11/11.
- **M3** built. Suite **9/9 · 47 checks** (`node test/run_bwr.js`, browser `test_bwr.html`).
  Flow-controlled BWR with negative void feedback; vessel/boiling/recirc TH; the steam-driven
  safety systems (RCIC/HPCI/ADS/LPCI) + the SBO battery timer; the **Fukushima** flagship runs the
  full hold-then-uncover timeline (RCIC holds ~8 h, uncovery ~3 h after battery depletion, damage)
  vs the ADS+LPCI intervention (core saved) — the comparison. Needed an **implicit prompt term**
  (Λ=5e-5 → explicit Euler unstable at 0.02 s; resolves F6) and a faster ADS + lower vessel-pressure
  gain so depressurization beats decay steam. **Physics layer complete — all three engines proven**
  (PWR 11/11·51, RBMK 18/18·99, BWR 9/9·47, all re-confirmed green).
- **M2** built. Suite **18/18 · 99 checks**, both versions (`node test/run_rbmk.js`, browser
  `test_rbmk.html`). Two versions in one engine via `design_version`; reuses the F1 excess/pinned-
  reference pattern (and extends it to `void_ref`, which proved load-bearing for low-power
  stability). Accident co-tuned: pre crosses prompt critical via the displacer + amplified void →
  **steam explosion**; post shuts down safely; full-power maneuvering stable. PWR suite re-confirmed
  green (11/11 · 51 — no shared code touched). **F1 resolved**, **F6** confirmed for M2.
- **M4** built and committed (`1ae7245`). Smoke 10/10. Added `category` to PWR failure data;
  M1 suite re-confirmed green after the edit.
- **This file** created after M1+M4 to capture the above; keep updating per "How to maintain".
- **M5** built. Smoke 12/12. Fixed-dt step-count acceleration (Flag F6); default pass-through
  Instructor slot; full stack (engine ↔ M4 ↔ instructor) runs end to end. M1/M4 re-confirmed green.
- **M6·PH** built. Tests 8/8. Real pass-through Instructor module in the slot; M5 aligned to the
  `setRegister` interface and prefers `RD.InstructorLayer`. Swap-invariant confirmed (free-play
  unchanged). All four suites (M1/M4/M5/M6·PH) green.
- **M7** built. Positive 31/31 integration checks + negative teeth test (sabotaged HR1 → caught).
  Validates the assembled stack's wiring through M5's interface. All five suites (M1/M4/M5/M6·PH/M7)
  green. Physics gate (M1) + wiring gate (M7) both pass → the PWR system is correct per CONTEXT §9.
- **M8 visual shell** (`308b133`): static mock-data prototype for layout iteration.
- **M8 functional alpha**: wired `ui/app.js` to the live stack — gauges/numeric read instruments,
  controls issue commands, alarms/instructor/strip-chart render from snapshots; Graph-tab param toggles,
  low-profile x-axis, units/register/overlay, failures, save/load/reset. Tab switching no longer resizes
  the Instructor/Tools split (flex-basis 0 + scroll). New Flag F7 (alarm category belongs in profile).
  Engine/layer suites unaffected (all five green); UI field-contract spot-checked against a live snapshot.
- **Broadcast cadence raised** to 10 Hz normal / 20 Hz transient (was 2 Hz / 5 Hz) for a smoother live
  UI — cheap, data identical. Transient thresholds scaled by interval (constant rate sensitivity). Added
  CSS tween on gauge needles + rod bars so they glide between frames. M5 cadence tests made
  cadence-agnostic. (CONTEXT §4's 2/5 Hz is the *minimum* viable cadence; rendering faster is a display
  choice that doesn't touch determinism.)
- **M8 quiet-board redesign pass (user, responsive + control-room HF):** based on the "dark/quiet
  board" philosophy (EPRI 1003662, NUREG-0700, ISA-18.2) — mute the normal, surface the abnormal.
  - **Equal-width control panels (the "Reactor Core too wide" bug):** `.control-sections` was
    `repeat(4, 1fr)` = `repeat(4, minmax(auto,1fr))`; the dense rod cluster's intrinsic width refused
    to shrink and stole space. Fixed to `repeat(4, minmax(0,1fr))` + `.section{min-width:0}` + wrap on
    `.ctl-row`. Now genuinely equal regardless of content.
  - **Responsive:** dropped the `.plant-area{min-width:760px}` floor at ≤1200px (it forced horizontal
    scroll on mid-size monitors); gauge strip wraps; stacked column fallback at ≤860px. No media
    queries existed before.
  - **Controls-only panels:** stripped all five embedded readouts (control/shutdown bank steps, boron,
    feed %, turbine MW) out of the panels — every one already exists in the diagram numeric grid, so no
    info lost. `renderControls()` reduced to the SCRAM button + alarm tint. Rod position bars removed
    from the panel (position still shown as steps in the numeric grid; can relocate a visual bar into
    the diagram block if wanted).
  - **Sidebar cards focus model:** instructor + tools are now expand/collapse cards — exactly one
    expanded at a time. Collapsed instructor shows only its latest message; collapsed tools shows only
    its tab strip (clicking a tab expands+selects). Clicking the supervisor header focuses it; a new
    instructor message auto-pops it open. Replaces the old fixed 50/50 `flex:1 1 0` split.
  - **Reactivity (user decision: "SUR on board + reactimeter tool"):** real PWRs have NO direct ρ gauge
    (high-confidence research finding) — operators infer reactivity from neutron-flux trends. Engine
    `getTrueState()` now exposes `reactivity_pcm` (= `_rho`·1e5), `startup_rate_dpm` (= 26.06·Ṗ/P) and
    `reactor_period_s` (= P/Ṗ). Added a **Startup Rate** gauge to the vital bar (the authentic operator
    proxy) and an explicitly-labeled **Reactivity Computer** (reactimeter, pcm/SUR/period) in the
    Training tab — framed as a reactor-engineering tool, NOT a board gauge.
  - **Quiet-board color (hybrid):** running/normal status muted (new `--running-muted` teal) so a calm
    board reads "all normal"; amber caution and saturated/flashing red (alarms/trips) kept fully
    salient. Applied to `.seg button.on.run` and numeric `bool-on`.
  - All engine/wiring suites re-confirmed green (PWR 11/11·51, M7 31/31 + teeth). Snapshot contract is
    additive (three new `true_state` fields), so M7's data-contract suite is unaffected.
- **Redesign follow-up (user):** (1) **Rod-position bars relocated into the diagram block** — a
  `.rod-position` strip atop the synoptic shows both banks (bar + step readout); the duplicate Control
  Bank/Shutdown Bank text rows were removed from the numeric grid. Keeps panels controls-only while
  restoring the at-a-glance rod visual as *information* in the diagram. (2) **Color muting pushed
  further:** generic selected `.seg button.on` cyan → muted teal-slate; gauge-band normal zone and rod
  fills → muted; caution-amber and trip-red stay salient.
- **Quiet-board palette pass + A/B layout harness (`develop` branch).** Per a user concept scan,
  retuned the M8 §15 palette toward a stricter quiet board: near-black backgrounds
  (`--bg-plant #0E1216`, body `#070A0C`), muted-by-default text, and color spent only on the
  abnormal. Control toggles became **outline chips** (`.seg button.on` = thin ring, not a filled
  block); **green = energized/armed** (`.on.run`: RCP run, feed start, breaker closed, and now the
  AUTO/armed states for ECCS / PZR heaters / spray), **amber = caution**, **red = alarm/trip** only.
  Speed selector de-saturated to a cyan outline (the clock still goes amber on time-accel).
  - **Diagram vertical-shrink fix shipped as two switchable variants** (so the user can A/B live
    before we commit): the synoptic was the lone `flex:1` shock-absorber in the plant column and got
    crushed by greedy neighbors (gauge-strip wrap, `bottom-row 30%`, control `min-height:150`) plus
    the relocated rod-position strip. **Layout A "Fit"** rebalances the budget (one-row gauges,
    shorter panels, `synoptic flex:2 min-height:260`, trimmed bottom row) — fits the window, clips on
    very short screens. **Layout B "Fixed"** implements M8 §2.2 (plant area holds `min-height:768`,
    `.app` scrolls instead of squishing) — synoptic always full height. Selected by a class on `.app`.
  - **A, B, and C all rejected (user) and REMOVED** — the whole variant harness (Dev-tab dropdown,
    `.layout-*` CSS, `applyVariant`/localStorage) is gone. A/B only reshuffled the vertical budget; C
    compacted the cards but still wasn't skinny enough, because four side-by-side sections are tall by
    construction.
  - **Final: TABBED CONTROL STRIP (`.control-strip`).** The four sections are stacked behind a tab bar
    (`#ctlTabs`, panes `.ctl-pane[data-cpane]`); only one shows at a time, its controls laid out as
    label-over-control groups (`.cg`) flowing horizontally across the **full** strip width. The band
    drops to ~one row (~95 px), giving the synoptic (`min-height:280`) and the chart/alarm row room
    without scroll or squish. **Deviates from M8 §5** ("always visible — not tabs, not collapsible") —
    a deliberate, user-directed HMI change. **→ Flag F8.** The Dev tab itself stays (placeholder for
    future dev tools); the §15 quiet-board palette and green-armed AUTO chips from this pass remain.
  - **New "Dev" tab** in the Tools Block (§10, dev-only surface) hosting the first dev tool: a **UI
    Layout (A/B) dropdown** (`#uiVariant`) that swaps the layout class and persists to `localStorage`
    (`rd_ui_variant`, guarded for `file://` storage blocks). Restored before first paint in `init()`.
  - All five suites (PWR/M4/M5/M6·PH/M7) re-confirmed green — UI-only change, no stack contact.
- **Rod banks relocated + display damping (user feedback, `develop`).**
  - **Rod-bank bars moved under the Reactor/Core numeric column** (was a full-width strip across the
    top of the synoptic). `buildNumeric()` appends a compact `.rod-mini` block (label + step readout
    over a thin bar) to column 0; same ids (`rodControlFill`/`Limit`/`Readout`, `rodShutdownFill`/
    `Readout`) so `renderRodBars()` is unchanged. Also reclaims ~70 px of vertical space in the diagram.
  - **Display damping for instrument jitter.** User noticed gauges/numbers/chart jump every frame —
    correctly identified as the instrument noise (`pwr_config` noise sigmas, re-randomized each step
    and shown at the 10–20 Hz broadcast cadence). The noise STAYS in the data (HR1 — a stuck/failed
    instrument must still mislead; trips/alarms read the raw reading engine-side). The UI now damps only
    the **displayed** value with a per-frame EMA (`DISPLAY_DAMP_K = 0.18`), exactly like real indicator
    needle-damping / digital filtering. Done in `dampInstruments()` at the top of `render()`, into a
    **copy** of `s.instruments` (which aliases the engine's live reading object — must not mutate;
    would corrupt engine state and saves). Skipped at ≥60× (signal then outruns the noise; damping
    would only lag). Reset on reset/load. Gauges, numeric grid, and strip chart all calm as a result.
- **SCRAM pulled into its own always-visible box (user).** With the controls now tabbed (Flag F8),
  SCRAM would vanish on non-Reactor tabs — unacceptable for an emergency control. Moved it out of the
  reactor pane into a dedicated `.scram-box` pinned to the **right edge of the control strip**
  (`.control-strip` is now `flex-direction:row` → `.ctl-main` tabs/panes + `.scram-box`), so it's
  reachable from any tab. New quiet-board color states: cover-down = **dull green** stripes (calm,
  armed/ready); cover lifted = **dull red** exposed button; **scrammed (manual or auto) = bright-red
  flashing** via a `.scram-wrap.scrammed` class (forces the indicator visible regardless of cover
  state) + `scram-flash` keyframes. Cover lift/3 s-arm/timeout behavior unchanged.
- **"Color is reserved" palette pass (user directive).** The board was equally bright everywhere, so
  an alarm had nowhere louder to go. Reworked so DIM is the resting state and color = status:
  - **Vital gauges:** value is dim blue-white `#a8b8c8` over dim labels `#4a5a6a` at rest; the renderer
    adds `.warn` (amber) / `.alarm` (red + `gauge-alarm-flash`) from each gauge's own
    `caution`/`danger` config thresholds (not hardcoded; gauges without thresholds stay dim). Sparkline
    muted to `#56657a`.
  - **SCRAM guard cover:** now nearly invisible at rest (dark `#10151a` bg, dim-green border/text) — no
    siren — and only the *fired* state is the bright-red flash (unchanged).
  - **Strip-chart traces:** recolored to muted, hue-distinct TRACKING tones (amber/blue/steel/purple/
    violet/green/olive). A trace **brightens + thickens when its parameter hits alarm** (`seriesAlarmed`
    reuses the mapped vital gauge's `danger` threshold; `lighten()` pulls the muted hue toward white) —
    the contrast against the calm baseline is the signal.
  - **Failure category pills:** dropped the saturated fills for low-saturation tinted backgrounds +
    brighter hue text (they classify, they don't warn).
  - **Diagram header decluttered:** removed the Education/Realistic and Instruments/True/Both segs from
    the synoptic header; both remain under the Settings tab (the diagram one was `overlaySeg`; Settings
    keeps `overlaySeg2`, bindUI tolerates the missing id).
  - Alarm annunciator left as the (user-approved) dark-at-rest list; the four-state lifecycle styling is
    already in place. All five suites green (UI-only).
- **Legibility + info-hierarchy pass (user).**
  - **Vital strip trimmed to the six headline gauges** (Reactor Power, Primary Pressure, Tavg, PZR
    Level, SG Level, Subcool) — the parameters scanned continuously. **Startup Rate** moved to the
    diagram's Reactor/Core column and **Grid Match** to the Turbine/Condenser column (both secondary:
    SUR matters mainly on transients, Grid Match is a turbine/grid metric). Fewer gauges also lets the
    strip breathe / read bigger.
  - **Bigger text where it counts:** diagram numeric grid 12→13 px (headers 11→12, rod readout 11→12);
    control-strip controls up (seg/btn 12 px, tabs 12 px, num-inputs 12 px, labels 11 px). General text
    palette nudged a touch brighter (`--text` `#E4E9EE`, `--text-2` `#98A3AF`, `--muted` `#69757F`);
    gauge dim value/label brightened slightly (`#b6c4d2` / `#5a6b7c`) while staying recessed.
  - **Control strip now uniform height across tabs:** `.ctl-pane` is `flex-wrap:nowrap` + `min-height`
    + vertically centered, so every section renders as one same-height row (overflow scrolls
    horizontally rather than growing the strip) — switching tabs no longer resizes the strip.
- **Strip-chart legibility + chrome (user).** (1) Legend now doubles as a **minimal, color-coded
  per-parameter scale** — each entry shows the trace label + its plot range `[min–max]` in the trace's
  own color (interpretation of "color-coded x-axis for each parameter"; ranges are the native plot
  scale). (2) The three horizontal gridlines made **hairline + non-scaling** (`stroke-width:0.5`,
  `vector-effect:non-scaling-stroke`, dim `#1b1f25`) so they stop competing with the parameter traces;
  traces also got `non-scaling-stroke` for crisp, consistent weight under the stretched viewBox.
  (3) Removed the **Elapsed** row from the Sim tab (the top-bar clock already shows sim time; dropped
  the `simElapsed` render line too). (4) Top-right logo **spelled out** "Reactor⚛️Dynamics" (was R⚛️D).
- **Two alpha-feedback fixes:** (1) decay heat now tracks power + is pre-loaded (see M1 modeling
  decisions) so an operating reactor shows ~7%, not 0. (2) Strip-chart bug: `getInstruments()` returns
  the engine's *live, mutated* reading object, so the chart was buffering one shared reference (every
  point showed the latest value). The UI now copies instrument values into the buffer and plots each
  series against a fixed range (auto-scaling had amplified steady-state noise to full height).
- **Quiet-board color refactor as a swappable A/B variant (user, `develop`).** Per a supplied
  color-refactor spec ("color is reserved exclusively for deviation from normal"), added a **Dev-tab
  dropdown** (`#uiVariant`, Current ↔ "Quiet Board (new)") that swaps a `variant-quiet` class on
  `.app`; persisted to `localStorage` (`rd_ui_variant`, guarded for `file://`), with a `?variant=`
  URL override for sharing/screenshots. **This re-introduces a Dev-tab variant selector** (the layout
  A/B harness was removed earlier — Flag F8 changelog); this one swaps *color treatment*, not layout.
  Selecting "Current" applies zero overrides, so the existing board is untouched — true A/B. The new
  variant implements the spec's six changes, almost entirely as CSS scoped under `.app.variant-quiet`
  plus three small JS hooks:
  - **(1) gauge bars** — the rainbow gradient track becomes a single dim track (`--bar-track-normal`);
    a colored fill (`g-fill`, set in `renderGauges`) appears to the needle *only* in a warn/alarm band.
    **(2) status words** — `classifyBool()` switches to `quietBoolClass()` in quiet mode: normal
    (closed/running/no/off/standby) → dim `--clr-status-normal` (no more green), abnormal
    (open/stopped/yes) → red, off-normal-but-not-failed (HPI active / AFW on) → amber. **(4) traces** —
    each `SERIES` gained a `qcolor` (the spec `--trace-*` muted palette); `traceColor()` picks per
    variant for the chart, legend, and Graph-tab swatches. **(3) SCRAM**, **(5) value text**,
    **(6) card tint**, and trend-arrow coloring are pure CSS keyed off the existing `.gauge.warn/.alarm`
    classes (same logic that already drove value-text color — so the deviation path is the proven one).
  - Deliberately **not** done: the transient green-on-clear flash (spec's `--status-cleared`, lower
    priority — the load-bearing rule "never green for currently-fine" is satisfied); the failure
    category pills (spec marks them a separate task / DO NOT CHANGE). Verified by headless-Chrome
    screenshots of both variants (quiet board reads calm at steady state; SCRAM fired → bright-red
    flash). Engine/layer suites untouched (UI-only).
- **Quiet board kept, A/B harness removed; multi-plant UI + layout/graph upgrades (user, `develop`).**
  After approving the quiet board, the user asked to drop the old look and keep quiet only — so the
  `variant-quiet` scoping was unscoped into the base rules, the Dev-tab variant dropdown / `localStorage`
  / `?variant=` override were removed, and `boolClass()` now always returns the quiet `q-*` classes
  (the old rainbow `.g-band` gradient and green `.nv.bool-on` are gone). The board is quiet-only.
  - **Multi-plant, data-driven UI.** `app.js` was refactored from PWR-hardcoded to a `PROFILES`
    table (pwr / rbmk / bwr) supplying each plant's gauges, numeric grid, strip-chart series, and
    **controls** (the tabbed control strip is now built from the profile, not static HTML). An
    **engine dropdown in the Sim tab** (`#engineSel`: PWR · RBMK pre-1986 · RBMK post-1986 · BWR)
    calls `switchEngine()` → `service.selectPlant(plant, init, design_version)` and rebuilds every
    plant-specific surface (gauges/numeric/controls/series/initial-states/failures). The M5 engine
    registry + per-plant M4 rebuild already supported this; the UI just drives it. RBMK pre/post are
    one plant with two `design_version`s. A `?engine=` URL override mirrors the old `?variant=` for
    testing/sharing. Verified by headless screenshots of all three plants (correct gauges, numeric,
    controls, and per-plant failure catalogs; AZ-5 label on the RBMK scram).
  - **Per-plant indications/controls** map to each contract: RBMK gets the ORM gauge + Reactivity/ORM
    column + MCP-flow/EPS-bypass controls; BWR gets vessel level/pressure + the RCIC/HPCI/ADS/LPCI
    safety-system column and controls + battery. Rod commands are uniform across plants (+withdraw /
    −insert), so one set of rod acts serves all three. `scram` works for all (the RBMK accepts it as
    AZ-5). Gauge state logic gained **low-side** thresholds (`caution_lo`/`danger_lo`) for level/ORM,
    and a display multiplier (`mul`) for void.
  - **Layout:** the diagram block (`.synoptic`) is now **fixed height** (`flex:0 0 340px`) and the
    chart/alarm strip (`.bottom-row`) **stretches** to fill the slack (was the reverse).
  - **Graph:** horizontal gridlines darkened to near-background (`#0f1217`) so they recede; added
    **live floating value labels** at the right edge — one per active trace, color-coded to the line,
    positioned at the line's current y and **collision-spread** (min-gap pass + overflow push-up) so
    they never overlap. Rendered as an HTML overlay (`.chart-floats`) over a new `.chart-plot` wrapper
    (the SVG viewBox is stretched, so SVG text would distort). Engine/layer suites re-confirmed green
    (UI-only; PWR 11/11, RBMK 18/18, BWR 9/9).
- **Improvement-punchlist pass (user, `develop`).** Worked the supplied punchlist; status by group:
  - **Group A (quiet-board color)** was already implemented in the prior two passes (A1 status words,
    A2 single-track gauge bars, A3 muted traces, A5 trend arrows, A6 value text, A7 card tint). Only
    **A4** needed alignment — the SCRAM fired state now uses the spec palette exactly (`#1a0600` /
    `#b03020` / `#e04020`, `0.5 s step-end` opacity flash). **E2** (grey the Startup-Rate row to
    near-invisible when `|SUR|<0.01` — no info at power) and **E4** (desaturated failure-category
    pills, the exact spec hexes) also done.
  - **B1 · PWR PORV block valve** (closed-loop gap, the key TMI recovery). **Engine extension:**
    `pwr_pressurizer.relief()` gates all PORV flow on a new `block_valve_open` state (default open);
    closing it zeroes relief AND inventory loss even while the PORV is stuck open. New commands
    `open_block_valve` / `close_block_valve`; `porv_block_open` in `control_state`. UI control on the
    Primary Inventory tab + a `PORV Block Valve` indication. Verified: stuck-PORV `porv_flow` 0.0025 →
    0 on isolate, inventory stops falling. PWR suite still 11/11·51.
  - **D1 · BWR Standby Liquid Control** (HIGH-priority ATWS mitigation). **Engine extension:** a
    negative reactivity term `ρ_slc = −slc_worth·slc_injected` (worth 0.09) that ramps in (`slc_ramp_tau`)
    and drains the tank; shuts the reactor down independently of the rods. New commands `initiate_slc`
    / `stop_slc`; `slc_active`/`slc_tank_pct` in `true_state`+`control_state`. UI control on Safety
    Systems + `SLC` / `SLC Tank` indications. Verified: with `failure_to_scram` active (rods stay
    withdrawn at 148 steps), SLC drives power 100 % → 0.2 %. BWR suite still 9/9·47.
  - **C1 · RBMK AZ-5 positive scram effect — VERIFIED MODELED (no change).** The graphite-displacer
    positive spike IS the centerpiece of M2 (`k_disp=0.05`, `rho_displacer_pre`); from `low_power_xenon`
    the AZ-5 insertion drives ρ from 0 to ~+0.017 (≈ 2.6 β) before the absorber arrives — squarely in
    the punchlist's "~+2–3 β" — and is what makes the pre-1986 flagship excurse. Confirmed, not broken.
  - **Command-contract extension note.** `open_block_valve`/`close_block_valve` (PWR) and
    `initiate_slc`/`stop_slc` (BWR) are **new commands beyond CONTEXT §6.7** — added because the
    punchlist explicitly requested the controls and the §6.7 set lacked them. Additive only (defaults
    leave existing behavior unchanged; all suites green). Fold into §6.7 when the blueprint is updated.
    **RESOLVED — folded into CONTEXT §6.7 + M1/M3 (see "Blueprint reconciliation" entry below).**
  - **DEFERRED TO v2 (user decision).** **B4** containment pressure, **D2** suppression-pool (torus)
    temp, **D3** torus level, **D5** drywell pressure all require a containment / suppression-pool model
    that **CONTEXT §8 explicitly excludes** ("No containment model … described in commentary, not
    modeled"). Faking static gauges would violate the honesty principle; the user chose to defer these
    to v2 rather than expand v1 scope.
  - **B2 / D4 / D6 done (closed-loop controls, user "do these first").**
    - **B2 · PWR steam dump / turbine bypass.** `pwr_steam_generator.stepSecondary` adds a dump path
      that vents steam to the condenser (extra steam-out in the pressure + level balance): **Auto**
      opens proportionally above `steam_dump_setpoint` (6.0 MPa) — a basic relief-to-condenser, the
      same class as the allowed pzr heater/spray auto-control — with a manual override. New command
      `set_steam_dump {mode:auto|open|closed | pct}`; `steam_dump_pct`/`steam_dump_auto` in
      `control_state`. UI on Turbine & Grid + indication. Verified: after a turbine trip, auto dump caps
      SG pressure at ~6.4 MPa vs ~12.2 MPa with the dump closed.
    - **D4 · BWR Core Spray (LPCS).** Mirrors LPCI — injects below `lpci_threshold_pressure`; `lpcs_flow`
      added to the vessel level balance. Command `start_lpcs`/`stop_lpcs`; `lpcs_running` in the contract.
    - **D6 · BWR manual SRV.** Operator-opened controlled depressurization (`srv_manual_tau=150 s` —
      slower than ADS's 120 s but fast enough to out-vent the decay steam below the 1.03 MPa injection
      window). Commands `open_srv_manual`/`close_srv_manual`; `srv_manual_open` in the contract.
      Verified end-to-end: with HPCI unavailable after RCIC fails, **manual SRV → LPCS** depressurizes
      to 0.82 MPa, LPCS engages, and the core is saved — a second, operator-driven Fukushima recovery
      path alongside ADS+LPCI. All suites still green (PWR 11/11, BWR 9/9, RBMK 18/18).
    - These add more commands beyond §6.7 (`set_steam_dump`, `start_lpcs`/`stop_lpcs`,
      `open_srv_manual`/`close_srv_manual`) — additive, defaults inert; fold into §6.7 on the next
      blueprint update. **RESOLVED — folded into CONTEXT §6.7 + M1/M3 (see "Blueprint reconciliation"
      entry below).**
  - **STILL queued (feasible, not yet done).** B3 MSIV, C2 per-trip EPS-bypass granularity, E1 ISA-18.1
    "cleared-unacknowledged" alarm state (M4 lifecycle), and UI-only E3 CSF sublabels, C3 MCP-count
    indicator (engine tracks `mcp_running` bool, not a count — would be an approximation), C4 AR-mode
    indicator (v1 is manual-only; §8 excludes auto-control).
- **Plant-Display layout — a second swappable UI variant (user spec, `develop`).** Per the "Plant
  Display Redesign" spec, added a Dev-tab **UI Layout** selector (`#uiLayout`: "Control Room (current)"
  ↔ "Plant Display (new)") that toggles a `layout-plantdisplay`/`layout-classic` class on `.app`;
  persisted to `localStorage` (`rd_ui_layout`), with a `?layout=` URL override. The classic board is
  untouched under `layout-classic`. The new layout keeps the CSF gauge bar, strip chart, alarm panel,
  and right sidebar, and replaces the tabbed control strip + synoptic table with:
  - **System Status Bar** — per-plant fixed slots (4 states: normal dim / running green / caution amber
    / alarm red-flash) with badges and group separators, rebuilt on engine switch; a right-aligned
    `SCRAMMED` badge. **ECCS/AFW auto-actuation reads ALARM (red) until the operator acknowledges it**
    (click the slot → green) or RUNNING immediately if operator-initiated (`ui.pdAck`/`ui.pdOp`).
  - **View switcher** — Diagram / Primary / Secondary / All, default **Primary**, **auto-switches to
    Diagram on scram**; an always-visible compact 2-click-arm SCRAM at the right (emergency reach from
    any view).
  - **Diagram** view: placeholder until the SVG ships, plus the critical-only controls per §5 (rods,
    ECCS/EPS/ADS, MSIV). **Primary/Secondary** cards: per-plant sections + full controls + a dim
    cross-indication strip (the other side's heat-removal-relevant params). **All** view: the numeric
    grid with its own Instruments/True/Both overlay toggle. **Subcooling** gets the §9 special treatment
    (larger text, warn <22 °C / alarm <11 °C / `SATURATED` ≤0). PWR/RBMK/BWR all mapped.
  - Implementation notes: views build once (controls via the shared `ctlGroup`; param value-slots
    updated each frame) so number inputs keep focus. A `{t,cls}` row form was added for explicit
    per-row severity (e.g. PORV-block "open" must NOT read as the PORV-open alarm). Unmodeled
    slots/controls (MSIV on PWR/RBMK, Cont. Iso) stay dim/`normal` — no faked state (MSIV is wired
    only on the BWR via `msiv_closure`). Engine/layer suites untouched (UI-only).
- **Plant Display promoted to the ONLY UI; rod control reworked (user, `develop`).** The user approved
  the Plant Display, so the classic Control Room was removed entirely: the tabbed control strip + the
  synoptic numeric grid (and their `buildControls`/`buildNumeric`/`renderNumeric`/`renderRodBars`/
  `renderControls`/`setupScramCover` functions, the `scram-box`/guard-cover, the Dev-tab UI-Layout
  selector, and the `localStorage`/`?layout=` mechanism) are gone. Plant Display is now unconditional
  (the `layout-*` classes were dropped). The Settings → Values Display toggle now drives the All view;
  the FF badge moved into the view area.
  - **Rod control — press-and-hold + smooth nudge (Flag F8-adjacent, ENGINE change).** Withdraw/Insert
    are now **hold-to-move** (pointerdown → `rod_start` at the selected speed, release anywhere →
    `rod_stop`); the Stop button is gone; rod speed (Slow/Norm/Fast) stays. The instant `+1/−1` was
    replaced by a **rate-limited nudge**: `rod_nudge {steps,speed}` now sets a `nudge_target` and drives
    toward it at the rod velocity instead of snapping, so a single step takes the same time as a held
    drive and is **sim-time-correct under time acceleration** (a wall-clock UI timer would mis-fire).
    Implemented identically in all three engines' `_stepRods`/`applyCommand` (RBMK keeps its inverted
    insertion sign); `nudge_target` is cleared on scram/`rod_start`/`rod_stop` and round-trips in
    save/restore (it lives on the rod group). Caveat: rods only move while the sim is **running** (no
    time passes when paused) — acceptable since operating implies play. All scenario suites still green
    (the `control_response`/`physics_failures` tests that nudge rods run long enough to reach the
    target): PWR 11/11·51, RBMK 18/18·99, BWR 9/9·47. Verified the hold drives the bank (210→213 in 5 s
    at normal speed, power 100→101.7 %).
- **PWR primary-loop SVG diagram wired into the Primary view (user, `develop`).** Took the animated
  schematic from `pwr_primary_loop_diagram_v2.html` and embedded it in the **PWR** Primary view, above
  the controls, **replacing the parameter sections** there (`buildCard` renders `pd.primary.diagram`
  instead of `.pd-sections` when present; RBMK/BWR keep their sections — the diagram is PWR-only). The
  source file's slider/`requestAnimationFrame` sim is dropped; instead `renderDiagram(s)` drives the
  sensor `tspan`s (Power, Rod-ins, Subcool, Inventory, Press, PZR/SG level, PORV, T-hot/T-cold, RCP
  flow — all from the snapshot, unit-toggle-aware), the rod-gauge fill, the PZR + SG water levels, the
  flow-animation speed / `.stopped` state and pump spin (from `pump_flow_pct`), and the hot-leg warm
  tint (from T-hot) — called each broadcast while the Primary view is active. The schematic's CSS is
  scoped under `.pd-diagram` (its `--text`/`--border`/etc. vars clashed with the shell's), the SG tube
  bundle is built once (`buildDiagramBundle`), and the SVG is height-capped (240 px) so the controls
  fit below. UI-only; suites untouched.
- **PWR secondary-loop SVG diagram wired into the Secondary view (user, `develop`).** Same treatment
  for `pwr_secondary_loop_diagram_v2.html` → the **PWR** Secondary view (Steam Gen → turbine + generator
  → condenser → condensate/feed pumps), replacing its parameter sections; `renderSecDiagram(s)` drives
  Steam Flow, Steam Press, SG level, Turbine RPM, Output MW, Cond. Vacuum, Hotwell Temp (derived from
  vacuum), Feedwater Flow, the SG water level, and the flow/turbine-blade/pump animation speed. Both
  cards live in the DOM at once, so the secondary diagram's element ids are **prefixed `sec`/`sv`** to
  avoid colliding with the primary diagram's (both use `#loop`, `#sgWater`, `vSg`, …). One additive
  engine field: PWR `getTrueState()` now exposes **`steam_pressure_mpa`** (the engine computed it but
  never surfaced it) — the data-contract is additive-only, PWR suite still 11/11·51. Both diagrams are
  **PWR-only** (`pd.<view>.diagram` is set only on the PWR profile); RBMK/BWR Primary AND Secondary
  views keep their parameter sections (verified — nothing to "revert", they were never given a
  diagram). RBMK 18/18, BWR 9/9 untouched.
- **Plant-display layout overhaul + PWR full-loop diagram in the Diagram view (user, `develop`).**
  Restructured the plant-display so the **Diagram view stretches** to fill the vertical budget and the
  schematic is large/legible with no scroll bar. Changes: (1) the view switcher moved from a horizontal
  bar to a **vertical strip on the left** (`.view-switcher`, `flex:0 0 96px`, buttons stacked); (2) the
  view stack (`.view-area` + a shared `.pd-controlbar`) is wrapped in `.main-area` (`flex:1`) so it
  grows, with the chart/alarm `.bottom-row` now a fixed band (`flex:0 0 196px`); (3) the **SCRAM button
  is pinned to the right of one shared control bar** that is always visible — `populateControlBar()`
  rebuilds `#pdCtlRow` with the **active view's** controls on each `setView()` (Diagram→critical
  controls, Primary/Secondary→their control sets, All→none), replacing the old per-card `.pd-controls`;
  (4) per-view controls and the cross-check strip were removed from the cards (`buildCard` now returns
  only the diagram or the `.pd-sections` grid, which flex-fills the panel); (5) diagram SVGs fill the
  stretched area (`.pd-diagram svg.loop { height:100% }`, was a 240 px cap) and the scoped diagram
  fonts were bumped (~+15–25 %, e.g. `.lbl-val` 13→15 px) for legibility; the right column was narrowed
  (`flex 1 1 340`, max 380) to give the diagram more width. New file
  `pwr_full_plant_diagram_v2.html` integrated as `PD.pwr.plantDiagram` (the full primary+secondary loop)
  with **`fp`/`fv`-prefixed ids** (a third diagram coexisting with the primary/secondary ones, which
  reuse `#loop`/`#sgWater`/`vPower`…); `buildFullDiagramExtras()` builds its SG tube bundle / condenser
  tubes / turbine blades once, and `renderFullDiagram(s)` drives all 16 sensors (primary + secondary),
  the rod/PZR/SG levels, the two independent flow domains (`stopped-pri`/`stopped-sec` + separate
  `--flow-dur`/`--flow-dur-sec` + pump/blade speeds) and the warm tint — scoped to
  `[data-pdview="diagram"]`. `renderDiagram`'s warm-tint query was likewise scoped to
  `[data-pdview="primary"]` (three `.pd-diagram` now match). Default view is now **Diagram**. RBMK/BWR
  Diagram views keep the "SVG in development" placeholder (full-loop diagram is PWR-only). UI-only;
  PWR 11/11·51, RBMK 18/18·99, BWR 9/9·47 still green.
- **UI review pass: diagram polish + control-bar state fixes (user, `develop`).** Thorough
  correctness review of the plant-display UI (headless interaction harness + a read-only code audit).
  Diagram changes (all three PWR schematics): (1) **smoother motion** — added `transition: y/height .16s`
  on `.water`/`.rod-fill` and `transition: d .16s` on `.surface` so level/rod geometry interpolates
  between the 10–20 Hz broadcasts instead of snapping; and a `setVarQ()` guard so animation-duration
  CSS vars (`--flow-dur*`, `--spin*`, `--blade-dur`) are only rewritten when they actually change
  (re-setting them every frame restarted the dash keyframes → stutter); `durS()` coarsened to 2 dp.
  (2) **full-diagram layout** — turbine assembly raised 12 px so it no longer touches the condenser
  (polygon/clip/shaft/blades/label/RPM-tap); **Feedwater Flow** label moved down clear of the SG;
  **T-cold** label shifted left off the SG corner. (3) **tighter crop + centering** — viewBoxes set to
  the measured content bounding boxes (via `getBBox`): primary `40 108 821 360`, secondary
  `40 40 1018 449`, full `40 92 1160 394` — trims the dead side margins and centers each in its panel
  (also renders ~13 % larger). Correctness fixes from the audit: (A) the shared control bar is rebuilt
  per view, which **reverted typed setpoints** (Feed Reg/Turbine Load/recirc…) and the **rod-speed
  selection** to their hardcoded defaults on every view switch — now persisted (`ui.ctlVals` keyed by
  input id, re-applied in `ctlGroup`; rod-speed seg re-asserted in `populateControlBar`). (B) the
  **All-view overlay segment** (Instruments/True/Both) desynced from `ui.overlay` after an engine
  rebuild — `buildViews` now calls `syncSeg`. (C) removed the dead `_cross` branch in `renderPdRows`
  (the cross-strip was already gone). (D) the SCRAM auto-disarm timer no longer clobbers a "SCRAMMED"
  label if the plant trips from another cause while the button is armed. Verified by harness: view
  switch repopulates the bar (3/7/7/0 groups), SCRAM arms→fires, all 3 engines switch (slots 7/4/8),
  setpoint `42` + rod-speed Fast + overlay True all survive round-trips; no JS errors. UI-only;
  PWR 11/11·51, RBMK 18/18·99, BWR 9/9·47 still green.
- **RBMK + BWR balance-of-plant / electrical output — PWR-parity full-scope operation (user, `develop`).**
  Audit finding: both engines modeled reactor→coolant (+BWR safety systems) well but **stopped at the
  steam boundary** — no turbine/generator/condenser, no `mwe_output`, so they couldn't be operated
  full-scope like the PWR (which models turbine RPM+grid-sync, condenser vacuum, MWe, steam dump). The
  RBMK's `steam_to_turbine` was a *fixed* load with no `set_turbine_load`; the BWR's `set_turbine_load`
  set only a steam fraction. Added a behavioral turbine/condenser/generator to **both**, mirroring the
  PWR §6.8, plus a partial-power operating state each. **Additive & inert by default** — every existing
  suite re-confirmed green before new tests (RBMK 18/18, BWR 9/9), then extended.
  - **Shared model (mirrors `pwr_steam_generator.stepTurbine`):** grid-synced turbine holds rated speed;
    free-spinning it is driven by admitted steam and braked by windage (coasts down on a trip);
    condenser vacuum restores/decays on `condenser_cooling_available`; low-vacuum & overspeed trips.
    `mwe_output = steam_load · mwe_rated · (rpm/rated) · (vac/vac_rated)` — **electrical output tracks the
    steam actually drawn by the turbine** (a direct/drum cycle: reactor power the turbine doesn't take is
    dumped/relieved), so MWe follows load, not raw fission power. A **turbine bypass / steam dump** vents
    excess steam to the condenser to hold pressure on a load rejection.
  - **RBMK** (`rbmk_thermal.stepTurbine`/`tripTurbine`, `rbmk_config.turbine`): `steam_to_turbine` is
    now the operator load (default = P0, so the accident physics is byte-identical when untouched — the
    excursion still outruns the fixed draw). New commands `set_turbine_load {mwe}` / `set_steam_dump`;
    `turbine`/`mwe_rated=1000`/3000 rpm (50 Hz); steam dump auto @7.5 MPa (ordered below the 7.6 alarm /
    8.0 relief); instruments `turbine_rpm`/`condenser_vacuum`/`mwe_output`; new `50_percent` init state
    (orm 70, flow 80); new failures `turbine_trip` (trip_turbine) + `loss_of_condenser_vacuum`
    (vacuum_decay). **Suite 20/20 · 129** (was 18/18·99) — added `bop_pre`/`bop_post`.
  - **BWR** (`bwr_vessel.stepTurbine`/`tripTurbine`, `bwr_config.turbine`): `steam_flow_normalized` is the
    turbine draw; added rpm/vacuum/`mwe_output` (1800 rpm, `mwe_rated=1100`) and the steam dump — **gated
    on `condenser_cooling_available`** so it is **inert in station blackout** (no AC → no condenser), which
    is load-bearing: the SRVs alone hold vessel pressure and keep RCIC's steam drive alive → the
    **Fukushima timeline is unchanged**. `condenser_cooling_available=false` set on `full_blackout_bwr` and
    `post_scram_sbo`. New `50_percent` state runs reduced recirc (`recirc_pct:19` → power settles ~50% via
    the negative void feedback; tuned). New failure `loss_of_condenser_vacuum`; `set_steam_dump` command;
    dump setpoint 7.25 (above rated 7.03 so the §7.3 void-collapse transient still fires, below SRV 7.58).
    **Suite 10/10 · 63** (was 9/9·47) — added `balance_of_plant`. §7.3 turbine-trip transient preserved.
  - **New commands beyond CONTEXT §6.7** (additive; fold into §6.7 on next blueprint update, as with
    the earlier B2/D4/D6 additions): RBMK `set_turbine_load` + `set_steam_dump`; BWR `set_steam_dump`
    (`set_turbine_load` already existed). New `true_state`/`control_state` fields are additive-only, so
    M7's data-contract suite is unaffected; M4 picks up the two new per-engine failures as data (HR3).
  - **Discovered a pre-existing red gate → Flag F9.** M5/M6·PH/M7 each have one stale `rod_nudge`
    integration check (expects instant nudge; engine now rate-limits) — reproduces on clean HEAD,
    unrelated to this work. PWR 11/11·51 and M4 10/10 still green.
- **Blueprint reconciliation — folded all built engine/contract additions into the specs (user, `develop`).**
  Per "update the blueprint to match the code," folded every additive feature already built (and
  previously only logged here) into the source-of-truth specs, so `CONTEXT.md` + `M1/M2/M3` now
  describe what's actually built. **Scope:** engine + contract additions only; UI (M8) and pure `[tune]`
  deviations stay recorded here (this log remains the history/rationale, per "keep as historical record").
  - **CONTEXT.md** — `§6.3` true_state: PWR `steam_pressure_mpa` + reactivity proxies
    (`reactivity_pcm`/`startup_rate_dpm`/`reactor_period_s`); RBMK `reactivity_pcm` + BOP
    (`steam_to_turbine`/`mwe_output`/`turbine_rpm`/`condenser_vacuum_kpa`/`turbine_tripped`); BWR
    `lpcs_running`/`srv_manual_open`/`slc_active`/`slc_tank_pct`/`reactivity_pcm` + the same BOP fields.
    `§6.5` control_state: PWR `porv_block_open`/steam-dump; an RBMK-specific block; BWR `slc_active`; the
    shared `turbine_load_mwe`/steam-dump. `§6.7` command catalog: PWR `open/close_block_valve`,
    `set_steam_dump`; RBMK `set_turbine_load`, `set_steam_dump`; BWR `initiate/stop_slc`,
    `start/stop_lpcs`, `open/close_srv_manual`, `set_steam_dump`. `§6.9` named states: RBMK + BWR
    `50_percent`. **→ resolves the standing "fold into §6.7 on next blueprint update" note** for B1/B2
    (PWR block valve/steam dump), D1/D4/D6 (BWR SLC/LPCS/SRV), and the RBMK/BWR BOP commands.
  - **M1 (PWR)** — §6.4 PORV block/isolation valve (B1); §6.7 steam dump / turbine bypass (B2); new §8.9
    reactivity proxies (reactivity computer / SUR / period); §9 note that every failure carries `category` (C7).
  - **M2 (RBMK)** — §8.3 updated (`steam_to_turbine` = operator load, not fixed; steam-dump term); new §8.7
    turbine/condenser/generator BOP; §13 instrument table (+turbine_rpm/condenser_vacuum/mwe_output); §14
    `turbine_trip`/`loss_of_condenser_vacuum` failures + `category`; §15 `50_percent`; §17 contract list;
    §19 BOP acceptance paragraph; §20 params (turbine block).
  - **M3 (BWR)** — §6.1 steam-dump term; new §9.7 SLC (D1) / §9.8 LPCS (D4) / §9.9 manual SRV (D6); new
    §12.1 turbine/condenser/generator BOP (condenser-gated dump — Fukushima-preserving); §11 instrument
    table (+BOP); §13 `loss_of_condenser_vacuum`; §14 `50_percent`; §16 contract list; §17 save/restore
    list; §18 BOP acceptance paragraph; §19 params (LPCS/SRV/SLC/BOP).
  - **Not folded (by design):** `[tune]` value deviations (e.g. RBMK D2 retunes, BWR D2 `K_vessel_pressure`),
    load-order/module-system notes, and all M8 UI changes — these remain here as the built-vs-intent record.
    Flags F1–F8 unchanged; F9 (stale `rod_nudge` integration check) still open. No code changed; specs only.
- **Operator-manual enablers — SUR/period + startup states (user, `develop`).** Groundwork for building
  a full operator's manual per plant (data-driven: generated reference + engine-validated procedures).
  - **SUR / reactor period on RBMK + BWR (Phase 0a).** `getTrueState()` now exposes `startup_rate_dpm`
    (= 26.06·Ṗ/P) and `reactor_period_s` (= P/Ṗ) on all three engines (was PWR-only), from the smoothed
    power rate. RBMK gained the `_power_rate`/`_prev_power_pct` tracking BWR already had. Additive to the
    contract. Enables approach-to-criticality documentation.
  - **RBMK `hot_startup` subcritical state (Phase 0b) — WORKS.** Low power, no xenon, flow established;
    trimmed critical per-state at `orm_target`, then the control group is inserted `subcrit_margin_steps`
    (25) further so it starts SUBCRITICAL (no boron — the margin is rod position). Slow rod withdrawal →
    critical → controlled ascension to power, positive SUR, no runaway, **both versions**. Test-gated:
    `startup_pre`/`startup_post` (RBMK suite now **22/22 · 141**). The per-state `void_ref` pinning is what
    makes this clean (no standing void offset).
  - **BWR `hot_startup` — NOT PROVIDED (physics-model limitation, honest omission).** The BWR pins a single
    full-power `void_ref` (0.45); at startup (low void) the void reactivity is strongly positive, so the
    reactor self-drives to the **~44 % flow/void balance regardless of rod position** — no stable
    near-zero-power-with-flow point exists (verified across rod insertions 3–65 %). A real cold approach-to-
    criticality would need a **power-dependent `void_ref`** — a deferred physics upgrade that would require
    re-tuning against the flow-control + Fukushima suites. Documented in `bwr_config` and left out rather
    than faked (honesty principle). **→ open decision: accept (BWR manual starts from an operating point +
    a voiced simplification) vs. invest in the void-model upgrade.** BWR 10/10·63, PWR 11/11·51 green.
  - **RESOLVED (user chose: invest in the void-model upgrade).** Implemented as a **targeted
    per-state `void_ref` pinning scoped to the startup state only** — not a global tracking
    reference (probing showed that destabilized the proven flow-control / 50 % behaviors). In
    `BWREngine.reset()`: for a `subcritical` init state, pin `void_ref` at the state's low
    operating void and trim critical there (RBMK pattern), then insert the control group a margin
    (BWR `steps` = withdrawn → *decrease* steps). Every other state keeps the base full-power trim,
    so `full_power` / `50_percent` / `post_scram_sbo` and the Fukushima flagship are byte-identical.
    Added `hot_startup` to `bwr_config` + a `startup` acceptance test. **BWR now 11/11 · 69**; RBMK
    22/22 · 141 (`startup_pre`/`startup_post`); PWR 11/11 · 51. Specs synced (CONTEXT §6.3/§6.9,
    M2 §15/§19, M3 §14/§18).
- **Operator's manual — reference generator (Phase 0c + 1, `develop`).** `tools/gen_manual_reference.js`
  emits `ui/manual_data.js` (→ `RD.MANUAL`), the data-driven source for the coming in-sim help panel
  (and a later printable). **Reference sections are GENERATED from the live engine configs + a settling
  run so they can't drift:** setpoints/limits ← protection (trips/actuations/alarms); indications ←
  instrument set (ranges/lag) + linked alarms; failures ← failure catalog (display/category/severity);
  **normal values** ← running each named state and capturing true + indicated readings (operating states
  settle 60 s; transient/subcritical states captured near their initial condition). A hand-authored
  **both-register** (learning + industry) layer supplies control effects, indication meanings, plant
  overviews, and safety limits. Keyed by profile: `pwr`, `rbmk_pre`, `rbmk_post`, `bwr` (mirrors the UI
  engine selector). Re-run after any engine/config change. Verified: PWR full power reads 100 %/15.41
  MPa/1000 MWe/747 ppm/ρ≈0; RBMK `hot_startup` reads subcritical; BWR 1100 MWe. Phase 2 (authored +
  engine-validated procedures) and Phase 3 (M8 help panel) still to come.
- **Operator's manual — normal procedures, authored + engine-validated (Phase 2 part 1, `develop`).**
  `ui/manual_procedures.js` (→ `RD.MANUAL_PROCEDURES`, keyed pwr/rbmk_pre/rbmk_post/bwr) holds
  **authored, both-register** procedures as structured steps (command + hold), each with a
  **declarative `validate` block**. `test/run_procedures.js` drives every procedure through its engine
  from the stated initial state and asserts the outcome — so nothing ships unproven. **12/12 · 34
  checks**: per profile a startup / raise-power / shutdown. Validation supports `final` (end-state
  predicates), `never_melted`, `saw` (a condition held at least once — e.g. SUR>0 during ascension),
  and `never` (a condition that must never occur — e.g. `fuel_temp_c >= 1200`, proving no fuel damage).
  - **Honest simplification surfaced (startup overshoot).** Approach-to-criticality can't be held at a
    fine low power in the lumped models — RBMK/BWR climb gently (slow, per-state-pinned) but the **PWR
    overshoots** (single lumped control group, Doppler-only prompt feedback, no fine trim), settling
    high after a spike (fuel stays < 1200 °C — no damage). The procedure voices this plainly (real
    approach-to-criticality is finer and neutron-source-driven) rather than faking a clean hold. The
    validated claims are the robust, honest ones: subcritical start → positive SUR → power rises → no
    fuel damage.
  - **Phase 2 part 2 — emergency procedures, accident walkthroughs, alarm response (`develop`).**
    Added to `ui/manual_procedures.js`: an **engine-validated emergency procedure per plant** (PWR loss
    of main feedwater → trip + AFW; RBMK MCP trip → AZ-5; BWR station blackout → RCIC) and the **three
    flagship accident walkthroughs** as *narrative* procedures (PWR TMI, RBMK Chernobyl pre/post
    comparison, BWR Fukushima). The harness (`test/run_procedures.js`) skips `narrative` procedures
    (marked `NARR`) — the accidents' physics is owned by each engine's flagship acceptance suite
    (CONTEXT §9), not re-run through the manual harness. **Procedures 16/16 · 43 checks** (3 startup +
    3 power + 4 shutdown... ) plus 4 narrative accidents. Alarm response: authored both-register
    cause+action guidance in the generator (`ALARM_RESPONSE`, `buildAlarmResponse`), attached as
    `RD.MANUAL[profile].alarm_response` (authored for key alarms; priority-based default otherwise).
    Panel gained **Accidents** and **Alarm Response** sections (`mAccidents`, `mAlarms`); Procedures now
    excludes accidents. Verified by headless-Edge screenshots (PWR Alarm Response, BWR Fukushima
    walkthrough). Engine suites unaffected (PWR 11/11, RBMK 22/22, BWR 11/11). **The operator's manual
    is now feature-complete for v1** (reference + normal + emergency + accidents + alarm response, both
    registers, in-sim panel); only the printable export remains (deferred).
- **Operator's manual — in-sim help panel (Phase 3, `develop`).** A full-screen **Operator's Manual**
  overlay in M8, opened by a `📖 Manual` button in the sim controls (or the `?manual[=section]`
  deep-link). Renders `RD.MANUAL` + `RD.MANUAL_PROCEDURES` for the **active engine profile**
  (`ui.engineKey` → pwr/rbmk_pre/rbmk_post/bwr) and is **register-aware** (its Learning/Industry toggle
  drives the global `set_register`). Left-nav sections: Overview, Procedures, Controls, Indications,
  Setpoints & Limits, Normal Values, Failures. Procedures show the "validated by the engine" note,
  per-step actions/notes/command hints; setpoints/alarms show color-coded priority pills; all tables
  are generated from the live data. Re-renders on plant switch. Files: `ui/shell.html` (button +
  overlay + script loads), `ui/shell.css` (`.manual-*` styles), `ui/app.js` (`openManual`/`renderManual`
  + section renderers `mOverview`…`mFailures`, using local `mesc`/`mreg` to avoid clashing with the
  existing attribute-only `esc`). Verified by headless-Edge screenshots (PWR overview/setpoints, RBMK
  pre-1986 procedures) — renders correctly, on-theme, profile- and register-aware. UI-only; engine and
  procedure suites unaffected (PWR 11/11, RBMK 22/22, BWR 11/11, procedures 12/12).
  - **Remaining for the manual:** Phase 2 part 2 (alarm-response + abnormal/emergency + accident
    walkthroughs), and a later printable export (deferred per user).
- **Operator's manual v2 — single integrated voice + actionable, Instructor-grade procedures (`develop`).**
  Per user feedback the manual was redesigned from a two-register toggle into ONE authoritative
  operating manual, and made the **source of truth for the Instructor (M6)**. Plan: `Blueprint/
  OPERATOR_MANUAL_PLAN.md`. Decisions (locked with the user): single integrated voice (spell out +
  acronym, e.g. "Steam Generator (SG)"); on-screen control names in procedures with the internal
  command API moved to a **Dev/Commands** appendix; **every step carries `control` + `target` +
  a machine-checkable `acceptance` predicate** (the same predicate the harness asserts and M6 will
  gate/grade on — one artifact); cold startup / RCP warmup / cooldown are **out of physics scope**
  (engine starts hot) and marked narrative.
  - **Generator (`tools/gen_manual_reference.js`)** rewritten to single voice: overviews, controls
    (`control`/`uses`/`command`), indications (`name`/`measures`), alarm-response (`means`/`response`),
    and a per-plant **Glossary**. No `_learning`/`_industry` split. Regenerated `ui/manual_data.js`.
  - **Procedure schema (`ui/manual_procedures.js`)** rewritten: `{id,category,title,purpose,from,
    prereq[],cautions[],steps[],guard,outcome}`; step `{text,control,target,cmd,hold,acc,saw,note}`.
    **Harness (`test/run_procedures.js`)** checks each step's `acc`/`saw` + proc `guard` — **21/21 ·
    73 checks (4 narrative)**. PWR authored richly as the template (startup w/ SUR ≤ 1 DPM & period
    ≥ 30 s, raise/lower power, pressure & SG-level control, shutdown, loss-of-feedwater, RCP trip,
    **stuck-PORV recovery via block valve**, TMI). RBMK/BWR ported to the new schema (rich authoring
    of their full normal + failure sets is the next phase).
  - **Panel refit (`ui/app.js`, `ui/shell.html`, `ui/shell.css`)**: dropped the manual register
    toggle; renders integrated voice, rich steps (control chip + Target + "✓ when" acceptance +
    cautions + outcome), controls-by-label, and added **Glossary** and **Dev/Commands** sections.
    Verified by headless-Edge screenshots (Procedures, Controls, Glossary). Engine suites unaffected
    (PWR 11/11, RBMK 22/22, BWR 11/11).
  - **Next (phased):** rich RBMK & BWR normal procedures with targets/acceptance; full per-plant
    failure procedures (decision: every modeled failure); humanize the `✓ when` param labels; then
    the M6 Instructor consumes `acc`/`guard` directly.
- **CONTEXT §12 + manual maintenance rule; manual polish; linear scram (`develop`).**
  - **CONTEXT.md §12** added: documents the operator's manuals (single-voice; source of truth for
    M6) and a **HARD MAINTENANCE RULE** — any sim change that affects the manual must re-run
    `tools/gen_manual_reference.js`, update procedures, re-run `test/run_procedures.js`, and add new
    UI acronyms to the glossary. The procedure suite + generator are part of the acceptance gate for
    sim-facing changes.
  - **Manual panel:** removed the meta/filler notes (accidents "validated by the acceptance suite…"
    text, procedures dev note) and the **Dev/Commands tab** (coder-only; the command mapping stays in
    `RD.MANUAL[*].controls[].command` data + the plan doc). Register toggle already gone (v2 single voice).
  - **Scram made linear (PWR + BWR).** Reported "rods didn't go down on scram" — engine was correct
    (rods DID insert, power fell) but PWR/BWR scram velocity was exponential (`steps/t`) so rods
    asymptoted toward fully-in (crawl near the end) rather than reaching it. Changed to constant rate
    (`max_steps/t`): PWR rods now reach fully-in in 2.5 s (92%→0%), decisive/visible. RBMK was already
    linear. Suites green (PWR 11/11, RBMK 22/22, BWR 11/11, procedures 21/21). The diagram rod
    indicator IS wired to `position_pct` (renderFullDiagram); a view-specific refresh check is folded
    into the Group-A UI pass.
  - **Plan for the batch (user-confirmed):** do **Group A UI fixes first** (scram rod-display verify,
    PZR heater + manual spray sliders w/ cold-leg suction, acronym spell-out "Full Name (ACRONYM)"
    across the UI, manual auto-units, glossary=all-acronyms, "Follow in Instructor" button on
    procedures/accidents/failures), then a **control audit**, then **full CVCS** (charging pump +
    letdown valve + boron + safety injection + leakage make-up), then **new aux systems** (BWR
    Isolation Condenser, RBMK ECCS) + extra failure modes. Q&A on turbine/condenser/TCV/steam-dump/
    behavior recorded in session.
  - **Group A progress (`develop`):** **A1** scram made linear (done, above). **A3** acronym spell-out —
    gauges (top bar) and numeric-grid labels across all plants now "Full Name (Acronym)" (e.g. "Avg
    Coolant Temp (Tavg)", "Pressurizer Level (PZR)", "Operating Reactivity Margin (ORM)"); controls
    already followed the convention. **A4** the manual now converts dimensioned values to the active
    unit toggle (US/SI) — normal values, indication ranges, trip/alarm setpoints (via `MDIM`/`mval`
    reusing the board's `conv`/`unit`); alarm names show "Learning (INDUSTRY)". **A5** glossary
    expanded (added DPM, MWe/MWt, ECCS) to cover UI acronyms; regenerated. Suites green (PWR 11/11,
    procedures 21/21). **Remaining Group A:** A2 (PZR heater + manual spray sliders, spray from the
    cold leg) and A6 ("Follow in Instructor" button on procedures/accidents/failures).
  - **Group A complete (`develop`).** **A6** — each procedure/accident card has a "▶ Follow in
    Instructor" button; it loads the procedure into the Shift-Supervisor block and steps through it
    (Prev/Next/Restart/Stop), showing each step's text, Control, Target, and a LIVE "✓ when … met /
    not yet" acceptance check against the current snapshot — so the user follows it while operating.
    `ui.follow` state; `renderInstructor` defers to `renderFollow` when following; `?follow=<id>`
    deep-link. **A2** — Pressurizer Heaters and Pressurizer Spray are now manual **% sliders + Auto**
    (ctlGroup renders slider AND buttons); `set_heater {auto}` / `set_spray {auto|pct}` engine
    support; **spray draws from the cold leg after the RCP** — spray effectiveness scales with primary
    `flow_frac` (no RCP flow → no spray). The live control bar lives in the **PD** per-view control
    lists (PROFILES.controls is legacy); updated the PD Primary list. Suites green (PWR 11/11, RBMK
    22/22, BWR 11/11, procedures 21/21). Added `?view=` deep-link. **Next:** control audit (B), then
    full CVCS (C), then new aux systems (BWR Isolation Condenser, RBMK ECCS) + extra failures.
  - **Group B — control audit (`develop`).** Cross-referenced each plant's engine operator commands
    against the live PD control lists + the `ACTS` map. **Findings & fixes (modeled command with no UI
    control, or BOP not surfaced):**
    - **RBMK:** `set_turbine_load` and `set_steam_dump` had NO UI, and the BOP readouts (electrical
      output, turbine RPM, condenser vacuum) weren't shown anywhere — the RBMK made 1000 MW invisibly.
      Added a **Turbine / Condenser** readout section + **Turbine Load** and **Steam Dump** controls to
      the secondary view.
    - **BWR:** `set_steam_dump` had no UI; `stop_slc` / `stop_lpcs` had start-only controls; BOP
      readouts not shown. Added **Steam Dump** control, **Stop** on Core Spray + SLC, and electrical
      output / turbine RPM / condenser vacuum readouts to the secondary view.
    - **PWR:** `set_dhr` (Decay-Heat Removal) and manual `open_porv`/`close_porv` had no UI. Added a
      **Decay-Heat Removal (DHR)** control and a manual **Relief Valve (PORV)** Open/Close control to
      the primary view; renamed RCP control to the spelled-out form.
    - New `ACTS`: `rbmk-turbine-set`, `porv-open`/`porv-close`, `dhr-on`/`dhr-off`, `slc-stop`,
      `stop-lpcs`. All map to existing engine commands. Verified by headless screenshots (RBMK/BWR
      secondary, PWR primary). Suites green (PWR 11/11, RBMK 22/22, BWR 11/11, procedures 21/21).
    - **Noted, not changed:** PWR "MSIV" is a labeled placeholder (MSIV not modeled on the PWR — only
      the BWR has `msiv_closure`); left as-is with its "placeholder here" hint. A real PWR MSIV is a
      candidate for the aux-systems phase.
  - **Group C — full CVCS (PWR, `develop`).** Modeled the Chemical & Volume Control System as operator
    systems. **Boron chemistry decoupled** from net charging−letdown (the old
    `boron_ppm += boron_rate·(charging−letdown)` was non-physical): new `boron_adjust` (ppm/s) driven by
    `set_boron_adjust {rate}` (+borate/−dilute/0 hold), gated on the charging pump. **Charging pump**
    (`set_charging_pump {running}`, gates charging + boration), **letdown valve** (existing
    `set_letdown_flow` + Isolate), and **auto make-up** (`set_cvcs_auto {active}`) that modulates
    charging to hold primary inventory up to `charging_max` — leakage compensation. Config
    `boron_adjust_rate`/`cvcs_makeup_gain`/`charging_max` (pwr_config); logic in `pwr_primary.stepInventory`;
    `set_charging_flow` now also drops auto (manual override). Safety injection = HPI (existing). Spray
    already draws from the cold leg after the RCP (Group A). **Auto make-up defaults OFF** and
    `charging_max` (0.06) covers normal leakage but not a LOCA, so the flagship/TMI behavior is intact
    (PWR 11/11). UI: PWR primary gains Boron (Borate/Hold/Dilute), Charging Pump (On/Off + slider),
    Letdown Valve (slider + Isolate), and CVCS Inventory Control (Auto/Manual); numeric grid shows
    Charging/Letdown + CVCS Mode. New commands beyond CONTEXT §6.7 (`set_charging_pump`,
    `set_cvcs_auto`, `set_boron_adjust`) folded into §6.7 + M1 §6.5 + regenerated `RD.MANUAL` (per the
    §12 maintenance rule). Verified: borate 747→807 ppm drops power to 39 %; auto make-up holds
    inventory ~99 % against a leak that otherwise drains to 0 %. Suites green (PWR 11/11, RBMK 22/22,
    BWR 11/11, procedures 21/21). **Next:** new aux systems — BWR Isolation Condenser, RBMK ECCS + extra
    failure modes.
  - **New auxiliary systems (`develop`).**
    - **BWR Isolation Condenser (IC)** — the passive heat sink Fukushima Unit 1 relied on. `set_ic
      {active}`; while condensing it lowers vessel pressure (`ic_condense_rate`) and conserves inventory
      (`bwr_vessel.stepVesselLevel` zeroes boiloff), holding the core covered on decay heat with **no AC
      and no injection**. DC-valve: on battery depletion in an SBO the IC closes (`ic_active→false`) and
      boiloff resumes — the Unit-1 story. Failure `ic_failure` (valves shut). UI: control + readout +
      status slot on the BWR secondary. New acceptance test `isolation_condenser` (BWR 12/12): level
      held ~50 % for hours, then uncovers once DC is lost.
    - **RBMK ECCS** — Emergency Core Cooling for a pressure-tube rupture. `set_eccs {active}` (engine
      step 9c, after the rupture drain): makes up steam-drum level (`eccs_level_rate`) and holds a
      cooling-flow floor (`eccs_flow_floor`), arresting the drain/dryout. UI: control + readout + status
      slot on the RBMK primary. New acceptance test `eccs` (RBMK 23/23): rupture drains the drum, ECCS
      recovers level and holds the flow floor.
    - Specs updated per the §12 rule: config (`bwr_config.safety.ic_condense_rate`,
      `rbmk_config.thermal.eccs_level_rate`/`eccs_flow_floor`); contracts; CONTEXT §6.7 (`set_ic`,
      `set_eccs`); M2 §8 + M3 §6.2; regenerated `RD.MANUAL` (BWR 20 controls / 15 failures incl. IC;
      RBMK gains ECCS control + glossary). Suites green (PWR 11/11, RBMK 23/23, BWR 12/12, procedures
      21/21). The RBMK/BWR failure catalogs were already broad (14 / 15 modes); no further failures
      added this pass beyond `ic_failure`.
  - **Rod control: per-state positions + operable shutdown bank (`develop`).** Fixes the report
    "rods always start fully withdrawn no matter the starting state" and the ask to model the
    shutdown group properly.
    - **Per-state control-rod position.** The control-group operating position is now per-state
      data (`initial_states[name].rod_op_pct`, % withdrawn) instead of one fixed
      `control_op_position_pct` for every state, so the starting rod position tracks starting
      power. **PWR:** 50 % now sits at 78 % withdrawn vs 92 % at full power (boron auto-re-trims
      via `_trimToCritical`; 50 % holds ~50 % with sane boron ~696 ppm). **RBMK:** 50 %
      `orm_target` 70→90 → 57.5 % withdrawn vs 66.7 % at full power, ORM healthy (89.8, above both
      `orm_min`s), holds 50 % (both versions); `rho_excess` auto-re-trims per state. **BWR:
      deliberately NOT changed** — a BWR maneuvers with recirc flow, not rods (CONTEXT §5), and its
      `rho_excess` is a fixed full-power constant with a void-equilibrium 50 % point; deepening the
      rods was both physically misleading and numerically fragile (per-state trim makes rod depth
      cosmetic; no-trim needs a recirc knife-edge near runaway), so the BWR keeps rods at the
      operating position and drops recirc to 19 %. Documented in `bwr_config`/`bwr_engine` comments.
    - **Operable shutdown bank.** The shutdown / RBMK-AZ group (previously "not an operator
      control", M1 §7) is now operable via the existing `rod_start`/`rod_stop`/`rod_nudge` with
      `group_id: "shutdown_rods"` — the engines already routed to any group. A **scram always
      overrides** (the per-step scram velocity re-asserts insertion every tick; verified the AZ bank
      fully inserts over its 18 s scram despite the operator spamming Withdraw). UI: a "Shutdown
      Bank" hold-pill (Withdraw/Insert) on every plant's Reactor Core + Plant-Display control bars;
      the hold mechanism now tracks the held group so release stops the right one; Control/Shutdown
      bank readouts show motion/scram status. M1 §7 note updated to reflect the deviation.
    - **Other rod issue found + fixed.** The M5/M6·PH/M7 "rod_nudge reached the engine" checks were
      **pre-existing failures** — they asserted an *instant* nudge, but a nudge drives to its target
      at rod speed (M1 §7). Fixed the tests to step the sim until the target is reached (they now
      pass; the engine was correct).
    - Specs/manual per the §12 rule: `RD.MANUAL` regenerated (RBMK 50 % ORM baseline 70.3→89.8; new
      "Shutdown bank" glossary term all plants); `test/manual_ui_map.js` mirror gains "Shutdown
      Bank". Suites green (PWR 11/11, RBMK 23/23, BWR 12/12, M4 10/10, M5 12/12, M6·PH 8/8, M7
      31/31, E2E 20/20, procedures 21/21, control audit + manual-follow PASS).
