/*
 * pwr_protection.js — PWR protection / actuation / alarm / failure definitions
 * as data (M1 §9; HR1/HR3/HR8). Consumed by the Control & Failure Layer (M4);
 * the engine itself acts on none of it — it only exposes the instruments these
 * rules read and the controls they drive.
 *
 * All setpoints read INSTRUMENTS (HR1), in SI units (MPa / °C / % / normalized),
 * with the single documented exception `__true_flow__` (no flow instrument in v1).
 * Attaches RD.PWR_CONFIG.protection (and RD.PWR_PROTECTION) once pwr_config.js
 * has defined RD.PWR_CONFIG.
 */
;(function (RD) {
  'use strict';

  // Trips — { instrument, direction, setpoint, action }. Any trip scrams.
  var PWR_TRIPS = [
    { instrument: 'power_range',      direction: 'high', setpoint: 120.0,  action: 'scram' }, // % rated
    { instrument: 'tavg',             direction: 'high', setpoint: 335.0,  action: 'scram' }, // °C
    { instrument: 'primary_pressure', direction: 'high', setpoint: 16.44,  action: 'scram' }, // MPa
    { instrument: 'primary_pressure', direction: 'low',  setpoint: 12.41,  action: 'scram' }, // MPa
    { instrument: 'pzr_level',        direction: 'low',  setpoint: 12.0,   action: 'scram' }, // %
    { instrument: 'sg_level',         direction: 'low',  setpoint: 12.0,   action: 'scram' }, // %
    { instrument: '__true_flow__',    direction: 'low',  setpoint: 0.25,   action: 'scram' }, // HR1 exception
  ];

  // Auto-actuation — reads instruments, issues commands (which pass through M4
  // interception, so a stuck PORV defeats the reclose).
  var PWR_ACTUATIONS = [
    { instrument: 'primary_pressure', direction: 'high', setpoint: 16.20,
      action: 'open_porv', reset_below: 15.86, reset_action: 'close_porv' },
    { instrument: 'primary_pressure', direction: 'low',  setpoint: 11.03,
      action: 'set_hpi', active: true, reset_action: 'set_hpi', reset_active: false },
    { instrument: 'sg_level',         direction: 'low',  setpoint: 20.0,
      action: 'set_afw', active: true },
    // Low-Pressure Injection permissive — auto-starts LPI once primary pressure
    // falls into the LPI band (large-break / late-LOCA territory; ≈400 psia).
    { instrument: 'primary_pressure', direction: 'low',  setpoint: 2.76,
      action: 'set_lpi', active: true },
    // Residual Heat Removal permissive — auto-aligns RHR for cooldown once the
    // reactor is tripped and depressurized into the RHR band.
    { instrument: 'primary_pressure', direction: 'low',  setpoint: 3.45,
      action: 'set_rhr', active: true, condition: 'rps_scrammed' },
  ];

  // Alarms — every alarm setpoint is less extreme than the matching trip so the
  // alarm warns first; lo_lo escalates lo. Panel A = reactor/primary, B = secondary/systems.
  // { id, instrument, direction, setpoint, priority, panel, label_learning, label_industry }
  var PWR_ALARMS_A = [
    { id: 'reactor_trip',      instrument: 'rps_scrammed',     direction: 'is_true', setpoint: null,  priority: 'critical', panel: 'A', label_learning: 'Reactor Trip',                     label_industry: 'REACTOR TRIP' },
    { id: 'high_flux',         instrument: 'power_range',      direction: 'high',    setpoint: 108.0, priority: 'critical', panel: 'A', label_learning: 'High Neutron Flux',                label_industry: 'HI FLUX' },
    { id: 'high_tavg',         instrument: 'tavg',             direction: 'high',    setpoint: 312.2, priority: 'warning',  panel: 'A', label_learning: 'High Coolant Temperature',        label_industry: 'HI TAVG' },
    { id: 'pzr_pressure_high', instrument: 'primary_pressure', direction: 'high',    setpoint: 15.86, priority: 'warning',  panel: 'A', label_learning: 'Pressurizer Pressure High',       label_industry: 'PZR PRESS HI' },
    { id: 'pzr_pressure_low',  instrument: 'primary_pressure', direction: 'low',     setpoint: 14.82, priority: 'warning',  panel: 'A', label_learning: 'Pressurizer Pressure Low',        label_industry: 'PZR PRESS LO' },
    { id: 'pzr_pressure_lolo', instrument: 'primary_pressure', direction: 'low',     setpoint: 12.41, priority: 'critical', panel: 'A', label_learning: 'Pressurizer Pressure Very Low',   label_industry: 'PZR PRESS LO LO' },
    { id: 'porv_open',         instrument: 'porv_indicator',   direction: 'is_open', setpoint: null,  priority: 'warning',  panel: 'A', label_learning: 'Pressure Relief Valve Open',      label_industry: 'PORV OPEN' },
    { id: 'sur_high',          instrument: 'startup_rate',     direction: 'high',    setpoint: 2.0,   priority: 'caution',  panel: 'A', label_learning: 'Startup Rate High',               label_industry: 'SUR HI' },
    { id: 'subcooling_low',    instrument: 'subcooling_margin', direction: 'low',    setpoint: 11.1,  priority: 'warning',  panel: 'A', label_learning: 'Low Subcooling Margin',           label_industry: 'LO SUBCOOL' },
    { id: 'subcooling_lost',   instrument: 'subcooling_margin', direction: 'low',    setpoint: 0.0,   priority: 'critical', panel: 'A', label_learning: 'Subcooling Lost — Coolant Boiling', label_industry: 'SUBCOOL LOST' },
    { id: 'pzr_level_high',    instrument: 'pzr_level',        direction: 'high',    setpoint: 75.0,  priority: 'caution',  panel: 'A', label_learning: 'Pressurizer Level High',          label_industry: 'PZR LVL HI' },
    { id: 'pzr_level_low',     instrument: 'pzr_level',        direction: 'low',     setpoint: 25.0,  priority: 'warning',  panel: 'A', label_learning: 'Pressurizer Level Low',           label_industry: 'PZR LVL LO' },
    { id: 'pzr_level_lolo',    instrument: 'pzr_level',        direction: 'low',     setpoint: 12.0,  priority: 'critical', panel: 'A', label_learning: 'Pressurizer Level Very Low',      label_industry: 'PZR LVL LO LO' },
    { id: 'rod_limit',         instrument: 'rod_at_limit',     direction: 'is_true', setpoint: null,  priority: 'warning',  panel: 'A', label_learning: 'Control Rods — Insertion Limit',  label_industry: 'ROD INS LIMIT' },
  ];
  var PWR_ALARMS_B = [
    { id: 'sg_level_high',  instrument: 'sg_level',         direction: 'high',     setpoint: 75.0, priority: 'caution',  panel: 'B', label_learning: 'Steam Generator Level High',     label_industry: 'SG LVL HI' },
    { id: 'sg_level_low',   instrument: 'sg_level',         direction: 'low',      setpoint: 30.0, priority: 'warning',  panel: 'B', label_learning: 'Steam Generator Level Low',      label_industry: 'SG LVL LO' },
    { id: 'sg_level_lolo',  instrument: 'sg_level',         direction: 'low',      setpoint: 12.0, priority: 'critical', panel: 'B', label_learning: 'Steam Generator Level Critical Low', label_industry: 'SG LVL LO LO' },
    { id: 'rcp_trip',       instrument: 'rcp_running',      direction: 'is_false', setpoint: null, priority: 'critical', panel: 'B', label_learning: 'Reactor Coolant Pump Trip',     label_industry: 'RCP TRIP' },
    { id: 'hpi_active',     instrument: 'hpi_active',       direction: 'is_true',  setpoint: null, priority: 'status',   panel: 'B', label_learning: 'Emergency Cooling Active',       label_industry: 'HPI ACTIVE' },
    { id: 'sbo',            instrument: 'station_blackout', direction: 'is_true',  setpoint: null, priority: 'critical', panel: 'B', label_learning: 'Station Blackout — AC Power Lost', label_industry: 'SBO' },
    { id: 'turbine_trip',   instrument: 'steam_demand_low', direction: 'is_true',  setpoint: null, priority: 'warning',  panel: 'B', label_learning: 'Turbine Trip / Low Steam Demand', label_industry: 'TURB TRIP' },
    { id: 'cond_vac_low',   instrument: 'condenser_vacuum', direction: 'low',      setpoint: 84.7, priority: 'caution',  panel: 'B', label_learning: 'Condenser Vacuum Low',           label_industry: 'COND VAC LO' },
    { id: 'cond_vac_trip',  instrument: 'condenser_vacuum', direction: 'low',      setpoint: 74.5, priority: 'warning',  panel: 'B', label_learning: 'Condenser Vacuum Trip Level',    label_industry: 'COND VAC TRIP' },
  ];

  // Failures (kind per HR7). physics_parameter → implemented in the engine;
  // command_override / block → intercepted in M4; instrument → applied by the
  // instrument model (§8). severity_meta is the M4 slider metadata; category
  // groups the failure for the UI Failures tab (M4 §10).
  var PWR_FAILURES = {
    stuck_porv_open:             { type: 'command_override', category: 'coolant', intercepts: ['close_porv'], override: 'open_porv', display: 'PORV Stuck Open' },
    porv_indicator_stuck_closed: { type: 'instrument', category: 'instrument', instrument_id: 'porv_indicator', mode: 'stuck', stuck_value: 'closed', display: 'PORV Indicator Stuck Closed' },
    loss_of_feedwater:           { type: 'command_override', category: 'power', intercepts: ['set_feedwater_flow'], override_value: 0.0, display: 'Loss of Main Feedwater' },
    turbine_trip:                { type: 'command_override', category: 'power', intercepts: ['set_steam_demand', 'set_load_target', 'connect_grid'], override_value: 0.0, display: 'Turbine Trip' },
    loss_of_offsite_power:       { type: 'physics_parameter', category: 'power', effect: 'coast_down_pumps', display: 'Loss of Offsite Power' },
    station_blackout:            { type: 'physics_parameter', category: 'power', effect: 'full_blackout', display: 'Station Blackout' },
    sgtr:                        { type: 'physics_parameter', category: 'coolant', effect: 'primary_leak', severity_scales: 'leak_rate',
                                   severity_meta: { label: 'Leak Rate', unit: '% rated flow', min: 0, max: 8, default: 3 }, display: 'Steam Generator Tube Rupture' },
    rcp_trip:                    { type: 'physics_parameter', category: 'coolant', effect: 'stop_pump', display: 'RCP Trip' },
    loss_of_condenser_vacuum:    { type: 'physics_parameter', category: 'power', effect: 'vacuum_decay', display: 'Loss of Condenser Vacuum' },
    degraded_hpi:                { type: 'command_override', category: 'safety_system', intercepts: ['set_hpi'], severity_scales: 'hpi_flow_multiplier',
                                   severity_meta: { label: 'HPI Capacity', unit: '% rated', min: 0, max: 100, default: 50, invert: true }, display: 'Degraded HPI' },
    // afw_failure carries NO command interception: the block is the engine's
    // afw_blocked state (the tagged-shut discharge valves, HR7 physics-side).
    // set_afw still descends so the PUMP demand latches — the run lights honestly
    // show the pumps running while the shut valves deliver zero flow (TMI-2).
    afw_failure:                 { type: 'command_override', category: 'safety_system', display: 'Auxiliary Feedwater Failure' },
    failure_to_scram:            { type: 'command_override', category: 'safety_system', intercepts: ['scram'], effect: 'block', display: 'Failure to Scram (ATWS)' },
    stuck_open_spray:            { type: 'command_override', category: 'coolant', intercepts: ['set_spray'], override_value: true, display: 'Pressurizer Spray Stuck Open' },
    failed_pzr_heaters:          { type: 'command_override', category: 'coolant', intercepts: ['set_heater'], override_value: 0.0, display: 'Pressurizer Heaters Failed' },
    sg_overfeed:                 { type: 'command_override', category: 'power', intercepts: ['set_feedwater_flow'], override_value: 1.2, display: 'SG Overfeed / Overcooling' },
    large_loca:                  { type: 'physics_parameter', category: 'coolant', effect: 'primary_leak', severity_scales: 'leak_rate',
                                   severity_meta: { label: 'Break Size', unit: '% rated flow', min: 0, max: 50, default: 20 }, display: 'Large LOCA (Cold-Leg Break)' },
    continuous_rod_withdrawal:   { type: 'physics_parameter', category: 'reactivity', effect: 'rod_withdrawal_runaway', severity_scales: 'withdraw_rate',
                                   severity_meta: { label: 'Withdrawal Rate', unit: 'steps/s', min: 0, max: 6, default: 3 }, display: 'Continuous Rod Withdrawal' },
    stuck_rod_on_scram:          { type: 'physics_parameter', category: 'reactivity', effect: 'stuck_control_rod', severity_scales: 'worth_fraction_held',
                                   severity_meta: { label: 'Rod Worth Held', unit: '% of total', min: 0, max: 40, default: 20 }, display: 'Control Rod Stuck on Scram' },
    steam_line_break:            { type: 'physics_parameter', category: 'power', effect: 'secondary_depressurize', severity_scales: 'break_size',
                                   severity_meta: { label: 'Break Size', unit: '% effective area', min: 0, max: 100, default: 30 }, display: 'Main Steam Line Break' },
    tavg_sensor_failure:         { type: 'instrument', category: 'instrument', instrument_id: 'tavg', mode: 'drift', display: 'Tavg Sensor Drifting' },
    pzr_level_sensor_stuck:      { type: 'instrument', category: 'instrument', instrument_id: 'pzr_level', mode: 'stuck', display: 'Pressurizer Level Sensor Stuck' },
  };

  // Interlocks (M4 §4b) — condition-latched command blocks, from instruments
  // (HR1). The rod-withdrawal block is the startup-forgiveness guard: when the
  // startup rate runs high the plant stops outward rod motion and refuses more
  // withdrawal until the rate settles — insertion always works. Real PWR rod
  // stops behave exactly this way; here the setpoint (~0.55 $) also keeps a
  // hasty trainee out of prompt-critical territory.
  var PWR_INTERLOCKS = [
    { instrument: 'startup_rate', direction: 'high', setpoint: 2.5, clears_below: 1.5,
      blocks: ['rod_start', 'rod_nudge'], withdrawal_only: true,
      on_engage: { action: 'rod_stop_all' },
      message_learning: 'Rod withdrawal blocked — the reactor is already speeding up too fast (startup rate high). Let the rate settle below 1.5 DPM, then continue. You can always insert.',
      message_industry: 'ROD WITHDRAWAL BLOCK: SUR ≥ 2.5 DPM. Withdrawal inhibited until SUR < 1.5 DPM. Insertion available.' },
  ];

  var PWR_PROTECTION = {
    trips: PWR_TRIPS,
    actuations: PWR_ACTUATIONS,
    alarms: PWR_ALARMS_A.concat(PWR_ALARMS_B),
    alarms_panel_a: PWR_ALARMS_A,
    alarms_panel_b: PWR_ALARMS_B,
    failures: PWR_FAILURES,
    interlocks: PWR_INTERLOCKS,
  };

  RD.PWR_PROTECTION = PWR_PROTECTION;
  if (RD.PWR_CONFIG) RD.PWR_CONFIG.protection = PWR_PROTECTION;

})(globalThis.RD || (globalThis.RD = {}));
