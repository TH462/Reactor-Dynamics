# PWR board wiring reference (authoritative — from live snapshot 2026-07-20)

Dumped from `SimulationService({plant_id:'pwr', initial_state:'hot_full_power'}).getSnapshot()`.
ctx.unit selects display unit system ('si' or 'us'); board authored in US customary
(psi/°F/gpm) but engine is SI, so value items convert.

## snapshot.instruments (SI)
| id | unit | notes |
|----|------|-------|
| power_range | % rated | |
| tavg, thot, tcold | °C | leg temps + average |
| primary_pressure | MPa | RCS reference pressure |
| pzr_level | % | pressurizer level |
| sg_level | % | SG narrow-range level |
| steam_flow, fw_flow | norm (~0–1.2) | |
| mwe_output | MW | generator output |
| turbine_rpm | rpm | rated 1800 |
| condenser_vacuum | kPa | |
| charging_flow, letdown_flow | normalized (~0–0.12) | true CVCS flows |
| steam_pressure | MPa | SG secondary |
| boron_analyzer | ppm | lagged boron |
| governor_valve | % | turbine gov position (lagged) |
| hpi_flow, accumulator_flow | normalized | |
| steam_dump_valve | % | dump valve position |
| primary_leak_flow | normalized | break flow |
| startup_rate | DPM | |
| porv_tailpipe_temp | °C | PORV outflow temp (TMI diagnostic) |
| source_range | cps-equiv | |
| intermediate_range | A (chamber current) | |
| porv_indicator | 'closed'/'open' | COMMANDED, not actual (TMI) |
| subcooling_margin | °C | |
| **booleans** | | rps_scrammed, rcp_running, hpi_active, station_blackout, steam_demand_low, rod_at_limit, sr_energized, msiv_open, sg_safety_open, above_p9, afw_active, afw_pump_running, rhr_active, rhr_valve_open, accumulators_discharging, condenser_cooling_available, safety_relief_active, rcp_cavitating |

No dedicated instruments for: AFW flow (gpm), HPI/AFW discharge pressure, condensate polisher,
steam temperature, generator governor % separate from governor_valve. Board shows these as
derived/static — see wiring notes.

## snapshot.control_state
rod_groups[]: {id:'control_rods'|'shutdown_rods', steps, max_steps(228), position_pct, moving,
  direction, speed, insertion_limit_steps, at_insertion_limit}
porv_demand('closed'/'open'), porv_block_open(bool)
heater_power_pct, spray_valve_pct, heater_auto, spray_auto, pressure_setpoint(MPa)
charging_flow_normalized, letdown_orifice_a, letdown_orifice_b, letdown_flow_normalized,
  charging_pump_running, cvcs_auto, boron_adjust
feed_pump_speed_pct, feedwater_flow_pct, feed_auto_coupled
steam_demand_mwe, load_mode('follow'/'manual'), load_target_mwe
steam_dump_pct, steam_dump_auto, steam_dump_setpoint, governor_valve_pct
hpi_active, rhr_active, rhr_valve_open, rhr_hx_fraction, eccs_mode('off'/...)
afw_throttle_pct, sr_energized, msiv_open
pumps[]: [{id:'rcp', running, flow_pct}]

## snapshot.rps_state
{scrammed, last_trip_reason, trip_blocks:{<trip_id>:bool}}
Blockable trips: lo_press, lo_flow, ir_high, pr_low_setpoint (only these 4).
trip_blocks keys present = currently-blocked. At full power ir_high+pr_low_setpoint are blocked
(above P-10); lo_press/lo_flow permissives unmet at power so cannot be blocked there.

## metadata
{sim_time, running(bool), time_acceleration, wall_time, plant_id, design_version}

## Commands (engine.applyCommand via ctx.cmd)
- Rods: `rod_start {group_id, direction:±1, speed:'slow'|'normal'|'fast'}`, `rod_stop {group_id}`,
  `rod_nudge {group_id, steps, speed}`, `rod_stop_all`. group_id: 'control_rods'|'shutdown_rods'.
- Scram: `scram`. (No reset command — reset via reinit; treat SCRAM reset as no-op/withdraw.)
- Heater: `set_heater {auto:true}` | `set_heater {power_pct}`.
- Spray: `set_spray {auto:true}` | `set_spray {pct}` | `set_spray {open:bool}`.
- Pressure setpoint: `set_pressure_setpoint {mpa}`.
- PORV: `open_porv` / `close_porv`; block valve `open_block_valve`/`close_block_valve`.
- Accumulator isolation: `open_accumulator_valve`/`close_accumulator_valve`.
- HPI/LPI: `set_hpi {active}`; AUTO re-arm `set_esf_auto {system:'hpi', auto:true}`.
- AFW: `set_afw {active}`; throttle `set_afw_flow {pct}`; AUTO `set_esf_auto {system:'afw', auto:true}`.
- RHR: `set_rhr {active}`; AUTO `set_esf_auto {system:'rhr', auto:true}`; `set_rhr_hx {pct|fraction}`.
- CVCS: `set_charging_flow {normalized}`, `set_charging_pump {running}`, `set_cvcs_auto {active}`,
  `set_letdown_orifices {a:bool, b:bool}` (off / A / B / A+B), `set_boron_adjust {rate}` (ppm/s +borate/-dilute).
- Steam dump: `set_steam_dump {mode:'auto'|'open'|'closed'}` | `{pct}`; `set_steam_dump_setpoint {mpa}`.
- Turbine/load: `set_load_mode {mode:'follow'|'manual'|...}`, `set_load_target {mwe}`,
  `set_steam_demand {mwe}`, `disconnect_grid`, `connect_grid`, `trip_turbine`.
- Feed: `set_feed_pump_speed {pct}`, `feed_pump_nudge {delta_pct}`, `set_feed_coupled {active}` (AUTO 3-element).
- MSIV: `open_msiv`/`close_msiv`. RCP: `set_rcp {running}`. SR detector: `set_sr_detector {on}`.
- Trip blocks: `set_trip_block {trip_id, blocked}` (control-kernel level, via ctx.cmd).
- ESF AUTO arms: `set_esf_auto {system:'hpi'|'afw'|'rhr', auto:true}`.

## GAPS (no engine backing today — see task #6)
- Condensate pump on/off (no command; pump is not an inventory actor). → visual only or add.
- Condensate polisher status (behavioral; no state). → static NORMAL.
- SG feed rate as gpm number: engine uses feed_pump_speed_pct (0–120). Map gpm→pct.
- Boron "Setting" gpm field vs ppm field: charging gpm vs boron target ppm. boron target has no
  engine field — engine uses boron_adjust rate. Need ON/OFF+target→rate translation (task #6).
- Generator FOLLOW/MAN/OFF: FOLLOW=set_load_mode{follow}; MAN=set_load_mode{manual}; OFF=disconnect_grid.
- AFW/HPI discharge pressure + flow (gpm) indications: no instruments → derive from active status
  (show rated when active, — when not) or add instruments (task #6).
