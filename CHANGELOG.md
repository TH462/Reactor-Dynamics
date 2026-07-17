# Changelog

All notable, user-visible changes to Reactor Dynamics are logged here. Format loosely
follows [Keep a Changelog](https://keepachangelog.com/); newest entries on top.

For the dense engineering rationale behind each change (spec deviations, tuning, gate
tallies) see `Blueprint/BUILD_DECISIONS.md` — this file is the skimmable summary.

## [Unreleased]

### Added
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
