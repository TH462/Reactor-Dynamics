# Changelog

All notable, user-visible changes to Reactor Dynamics are logged here. Format loosely
follows [Keep a Changelog](https://keepachangelog.com/); newest entries on top.

For the dense engineering rationale behind each change (spec deviations, tuning, gate
tallies) see `Blueprint/BUILD_DECISIONS.md` — this file is the skimmable summary.

## [Unreleased]

### Added
- **Regression tests for the recent PWR reworks.** An audit found several recently-added features were
  exercised but never *asserted*, so a regression would have passed silently. Added dedicated guards:
  - **§14 engine suite (`run_pwr` 20→25):** `eccs_boration` (injection raises core boron toward the
    RWST source; no-injection control stays flat; accumulators borate; no overshoot), `loop_pressure_nodes`
    (node ordering, flow² offset scaling, coastdown collapse to a single pressure), `letdown_orifice_lineup`
    (the four-state lineup ≈0/3/4/7 %, √ΔP pressure-driven tail-off, deprecated `set_letdown_flow` alias),
    `save_migration` (a pre-rework save gains `pressure_setpoint`/`steam_dump_setpoint` defaults, migrates a
    legacy `letdown_flow` to an orifice lineup, folds `lpi_active`→`hpi_active`, seeds the loop nodes), and
    `mode5_controls` (pressure-setpoint tracking, RCP start/stop, steam-dump-setpoint secondary cooldown).
  - **`run_m5` attention stops:** added the **alarm** trigger and the crucial **non-trigger** case — a
    commanded power/load maneuver must *not* snap fast-forward (only unbidden events do), guarding
    fast-forward from being made useless during normal maneuvering.
  - **Shared `checkSanity` (every ops probe):** loop-pressure-node ordering, `boron_ppm ≥ 0`, and primary
    inventory bounds now hold as passive invariants across all PWR ops scenarios (guarded so RBMK/BWR skip).
  - Gates: `run_pwr` **25/25**, `run_m5` **19/19** (72 checks), ops **53/66** (unchanged scenarios, +60
    invariant checks), `run_m7` **OK**, campaign **47/47**, RBMK **23/23** / BWR **12/12** unaffected.

- **Borated emergency injection (PWR) — ECCS and accumulators now carry boron into the core.** The
  emergency-injection water was pure inventory: HPI/LPI and the accumulators added coolant mass but
  never changed core boron, so the negative-reactivity **shutdown-margin** role of borated safety
  injection was absent. Now every emergency-injection source delivers water at **`eccs_boron_ppm`
  (2500 ppm, the RWST/SIT concentration)** and it **mixes into `boron_ppm`** by perfect-mixing
  transport — `dC/dt = q_inj·(C_eccs − C)/m` in `pwr_primary.stepInventory` — so injection **raises
  core boron and adds negative reactivity**, exactly as borated ECCS/accumulator water holds a
  reflooded core subcritical during a LOCA. The `boron_analyzer` readout now reflects this. Losses
  (letdown/break/relief) leave at the current concentration and don't change it. CVCS borate/dilute
  stays a separate idealized direct-rate channel. **Not modeled:** boil-off boron concentration (the
  lumped loss term doesn't distinguish boil-off from leakage). Verified: a large-break LOCA with SI
  drives boron 747 → ~2050 ppm (≈ −13000 pcm); no-injection control stays flat. PWR engine **20/20**,
  scenarios **3/3**, campaign **47/47**, `run_autoctl` **20/20**, `run_m5` **19/19**, ops probes at
  **53/66** baseline (no regressions).

- **RCP cavitation (PWR) — the reactor coolant pumps now cavitate when the loop voids.** A running
  RCP degrades when its **suction node** approaches saturation: `suction_subcool_c = Tsat(p_pumpsuction)
  − tcold` (the lowest-pressure node, distinct from the bulk subcooling margin). Below an 8 °C onset the
  pump cavitates, severity ramping to full over 8 °C more, and **loses up to 70 % of delivered flow**
  (`flow_frac`) — a real mechanical effect, not just an indication. This is the physics behind the
  TMI-2 control room's "the pumps are objecting" cavitation noise: as the stuck-PORV LOCA drives the
  RCS to saturation, the suction margin collapses, the pumps cavitate, and coolant flow falls. A new
  **"RCP CAVITATION"** alarm annunciates, the synoptic RCP reads **CAVITATING**, and true state exposes
  `suction_subcool_c` / `rcp_cavitation_frac` / `rcp_cavitating`. Only a running pump cavitates. PWR
  engine **20/20** (new acceptance test), campaign **47/47**, `verify_e2e_ui` PASS.

- **Two-orifice letdown (PWR) — CVCS letdown is now a pressure-driven orifice lineup.** Letdown was a
  commanded normalized setpoint; it is now **two fixed orifices, each independently in/out** — four
  states **off / A / B / A+B** (`set_letdown_orifices {a, b}`). Flow is **pressure-driven** off the
  cold-leg node — `C·√(p_coldleg − 2.4 MPa)`, the 2.4 MPa being the letdown-backpressure-control-valve
  setpoint — so it **tails off as RCS pressure falls** toward that value on a cooldown, instead of
  holding a commanded constant. Nominal at NOP: A ≈ 3 %, B ≈ 4 %, A+B ≈ 7 % of rated (A+B is a net
  drain, exceeding charging, for level reduction / depressurization). The synoptic CVCS panel gains
  two orifice toggles (A / B) replacing the letdown setpoint box; the manual renames "Letdown Valve"
  → **"Letdown Orifices (CVCS)."** `set_letdown_flow {normalized}` is kept as a **deprecated alias**
  (maps to the nearest lineup) and old saves migrate (`letdown_flow` → orifice lineup by NOP-flow).
  PWR **19/19**, campaign **47/47**, `run_m5` **19/19**, synoptic **55/55**, `verify_e2e_ui` PASS.

- **Loop pressure distribution (PWR) — three primary-loop pressure nodes.** The RCS is
  incompressible liquid outside the pressurizer bubble, so pressure stays ONE dynamic state
  (`pressure_mpa`, the pressurizer/hot-leg reference) plus a **quasi-static ΔP field** set by
  pump head vs. friction — no new integration, no stiffness. `pwr_primary.computeNodePressures`
  now exposes `p_hotleg` (= `pressure_mpa`), `p_pumpsuction` (between SG and RCP — lowest), and
  `p_coldleg` (RCP→RX pump discharge — highest); both offsets scale with `flow_frac²` and collapse
  to a single pressure when the RCPs coast down. The systems tied into the loop now read the node
  they physically connect to: **ECCS/accumulator injection works against the cold-leg node** (pump
  discharge, higher than the pressurizer reference at power; converging on it as a LOCA trips the
  pumps), while RHR suction stays on the hot leg. Node pressures are true state only — the single
  `primary_pressure` instrument is unchanged (real plants have one wide-range RCS gauge, not three).
  PWR engine **19/19**, campaign **47/47**, `run_m5` **19/19**.

- **Fast-forward attention stops — the clock snaps back to real time when the operator must
  act.** Time acceleration lives in the Simulation Service (M5); it now auto-decelerates to 1×
  the moment a genuine plant event appears on the broadcast the event lands on — a **reactor
  trip / SCRAM**, a **newly injected or latched failure**, or a **newly annunciating alarm**. It
  applies to *any* fast-forward — operator-selected or beat-driven — so an authored fast-forward
  can no longer blow past a trip. (A *commanded* power/load maneuver is deliberately **not** a
  trigger: an excursion that genuinely needs attention already annunciates an alarm, which the
  alarm trigger catches, whereas an operator- or auto-channel-commanded ramp is expected change
  and must remain fast-forwardable.) The snapshot that carries the event also carries
  `metadata.speed_snap = { reason }`, and the UI toasts *why* the clock changed
  ("Dropped to real time — reactor trip"). Authored *soft* stops (pausing just before an
  operator action during a mode change) remain a content pattern: a beat with `speed: 1`.
  `run_m5` **19/19**, `run_autoctl` **20/20**.

- **Three Mode 5 ↔ Mode 1 campaign missions (PWR).** The training campaign now teaches the
  full commercial heatup/cooldown loop on the board, using the cold initial condition below:
  - **`pwr_mode5_to_mode3` — "The Big Warm-Up"** (Act II): the cold heatup — pressurize, start
    RCPs, SR→IR handoff, take the core critical, and ride a low power up to NOP, settling at
    subcritical Hot Standby.
  - **`pwr_mode3_to_mode5` — "Cooling Down"** (Act III): the controlled cooldown — borate for
    margin, cool the secondary, depressurize on subcooling, place RHR, secure the pumps.
  - **`pwr_return_to_mode1` — "Cold to Power"** (Act III): the full startup Mode 5 → Mode 1,
    closing the round trip.
  - Each mission's intro carries the honesty banner (compressed rate; controlled nuclear heat).
  - **P-7 / P-11 RPS trip bypass** (control layer): the low-pressure and low-flow reactor trips
    are now bypassable in the cold/shutdown regime (a plant that inits depressurized loads with
    them blocked; they auto-reinstate as pressure/power come up) — the real startup/shutdown
    permissives, without which a cold plant loads scrammed and can't be heated. Neutral for
    every hot initial state (a LOCA/TMI depressurization still trips).
  - PWR campaign is now **34 missions**; `run_campaign` **47/47** with a scripted-operator drive
    for each new mission.

- **Cold Shutdown (Mode 5) initial condition + full Mode 5 ↔ Mode 1 transition (PWR).** The
  engine now models a genuinely cold, depressurized plant and can be driven all the way up to
  power and back down on integrated physics — the path the manuals previously marked *"[narr]
  only — no cold IC."*
  - **New `cold_shutdown` initial state (Mode 5).** RCS cold (~50 °C) and depressurized
    (~2.5 MPa, below the 400 psi RHR interlock), subcritical with shutdown-margin boron, RHR in
    service holding the cold sink, RCPs secured (RHR provides forced circulation), SR energized,
    ~0 decay heat. Holds stably.
  - **Operator pressure setpoint.** New `set_pressure_setpoint {mpa}` — the heaters/spray now
    hold an operator-adjustable target across the full 0.1–17 MPa range (default NOP), so
    pressure holds where it is placed during heatup/cooldown instead of snapping to NOP.
  - **Secondary cooldown.** New `set_steam_dump_setpoint {mpa}` lets the operator lower the
    no-load steam-dump target so the secondary — and with it the primary, through the SG —
    cools during a cooldown.
  - **Reactor coolant pump control.** New `set_rcp {running}` starts/stops the RCPs (secured in
    cold shutdown; started for pump heat and SG coupling during heatup).
  - **Plant MODE indicator + heatup/cooldown rate.** True-state now exposes `plant_mode` (1–6)
    and `plant_mode_name` (per manual 05 §2), plus `tavg_rate_c_per_hr`.
  - **New `5_percent` initial state** — low-power Mode 1, At Power (~6 %, just above the 5 %
    Startup/At-Power boundary).
  - **Full-stack cold lineup.** A plant that initializes depressurized starts with the
    low-pressure Safety Injection ESF **disarmed** (the real P-11 SI-block lineup), so loading
    Cold Shutdown no longer spuriously floods the core. Behaviour is unchanged for every hot
    initial state (TMI included).
  - New snapshot/state fields: `pressure_setpoint`, `steam_dump_setpoint`, `plant_mode`,
    `plant_mode_name`, `tavg_rate_c_per_hr`. Save-compatible: older saves migrate
    (`pressure_setpoint ← 15.41`, `steam_dump_setpoint ← 8.90`).
  - Tests: engine `cold_shutdown_hold`, `steady_five_percent`, and `mode5_to_mode1_roundtrip`
    (drives cold→hot→cold on integrated physics); full-stack cold-IC guard in `run_m5`.

- **RHR / LPI system rework (PWR).** The Residual Heat Removal system is now modeled as
  the real shutdown-cooling loop that doubles as Low-Pressure Injection:
  - **Hot-leg suction valve with a 400 psi interlock.** `set_rhr {active}` opens/closes the
    RHR hot-leg suction valve. The valve can be opened only below **400 psi (2.76 MPa)** and
    **auto-closes** if primary pressure climbs back above it — the operator must depressurize
    into the RHR band first.
  - **Adjustable cooldown rate via the heat-exchanger flow split.** New command
    `set_rhr_hx {fraction | pct}` routes more or less of the constant RHR loop flow through
    the heat exchanger vs. the bypass, throttling cooldown *rate* without changing total flow
    or coolant inventory.
  - **Single ECCS card mode indicator.** New `eccs_mode` field (`HPI` / `LPI` / `RHR` /
    `off`) is computed engine-side each step to drive one Emergency Cooling card. **RHR** is
    indicated whenever the suction valve is open.
  - **Automated LPI on LOCA.** LPI remains the low-head/high-flow regime of the merged
    HPI/LPI pump curve, armed automatically by the 11.03 MPa Safety Injection signal (the
    LOCA signal) and delivering as the plant depressurizes — no separate operator action.
  - New snapshot fields: `rhr_valve_open`, `rhr_hx_fraction`, `eccs_mode`.

### Changed
- RHR alignment permissive moved from 3.45 MPa to the 2.76 MPa (400 psi) valve interlock;
  the control-layer auto-align setpoint tracks it.
- `set_rhr` now drives the interlocked suction valve rather than a bare active flag; RHR
  heat removal scales with the HX flow split.
- Operator manual reference regenerated; Blueprint docs updated (`M1` §6.9, `CONTEXT.md`
  §6.5/§6.7, `M4b` §3b, `pwr_synoptic_prerequisites.md`).

### Notes
- UI card layout is intentionally left as an open task; the field/command binding contract
  for the ECCS card is documented in `Blueprint/pwr_synoptic_prerequisites.md` §6.2a.
- Save-file compatible: older saves migrate (`rhr_valve_open ← rhr_active`,
  `rhr_hx_fraction ← 1.0`). `set_dhr` / `set_lpi` remain as deprecated aliases.
