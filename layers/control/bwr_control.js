/*
 * bwr_control.js — the BWR's control layer, as data (HR1/HR3/HR7/HR8).
 *
 * Everything plant-specific the Control Layer kernel (control_kernel.js) runs
 * for the BWR: protection trips, engineered-safety actuation, alarms, and
 * failure definitions (originally engines/bwr/bwr_protection.js, M3 §13). The
 * engine acts on none of it — it only exposes the instruments these rules read,
 * the controls they drive, and the actuation-gate status readings (§11) the
 * kernel's evaluateCondition resolves.
 *
 * All setpoints read INSTRUMENTS (HR1), SI units. Attaches RD.BWR_CONTROL, plus
 * the legacy names RD.BWR_PROTECTION and RD.BWR_CONFIG.protection; loads after
 * bwr_config.js.
 */
;(function (RD) {
  'use strict';

  // Trips — any trip scrams.
  var BWR_TRIPS = [
    { instrument: 'power_range',     direction: 'high', setpoint: 120.0, action: 'scram' }, // %
    { instrument: 'vessel_pressure', direction: 'high', setpoint: 7.58,  action: 'scram' }, // MPa
    { instrument: 'vessel_pressure', direction: 'low',  setpoint: 5.52,  action: 'scram' }, // MPa (LOCA)
    { instrument: 'vessel_level',    direction: 'low',  setpoint: 10.0,  action: 'scram' }, // %
  ];

  // Engineered-safety auto-actuation. Gated actuations carry a `condition` that
  // M4's evaluateCondition resolves against the engine's status readings (§11).
  var BWR_ACTUATIONS = [
    // RCIC level start sits BELOW the nominal 50% band: at 50.0 the instrument
    // noise (σ 0.5) around the 50.0 operating level hair-triggered RCIC within
    // seconds of every run (found by the ops suite — test/run_ops.js).
    { instrument: 'vessel_level',    direction: 'low', setpoint: 45.0, action: 'set_rcic',   active: true },
    // fw_flow is a NORMALIZED instrument (0–1.2 of rated): the old 5.0 setpoint
    // was a %-units slip that made `flow < 5.0` always true — RCIC always on.
    { instrument: 'fw_flow',         direction: 'low', setpoint: 0.05, action: 'set_rcic',   active: true }, // nearly no feedwater
    { instrument: 'vessel_level',    direction: 'low', setpoint: 30.0, action: 'set_hpci',   active: true },
    { instrument: 'vessel_level',    direction: 'low', setpoint: 15.0, action: 'trigger_ads', condition: 'hpci_unavailable' },
    { instrument: 'vessel_pressure', direction: 'low', setpoint: 1.03, action: 'start_lpci',  condition: 'ads_open' },
  ];

  // Alarms — every alarm setpoint less extreme than the matching trip. Panel A =
  // reactor/vessel, B = systems.
  var BWR_ALARMS_A = [
    { id: 'reactor_trip',      instrument: 'rps_scrammed',     direction: 'is_true', setpoint: null, priority: 'critical', panel: 'A', label_learning: 'Reactor Scram',                  label_industry: 'REACTOR SCRAM' },
    { id: 'vessel_level_low',  instrument: 'vessel_level',     direction: 'low',     setpoint: 30.0, priority: 'warning',  panel: 'A', label_learning: 'Vessel Level Low',               label_industry: 'VESSEL LVL LO' },
    { id: 'vessel_level_lolo', instrument: 'vessel_level',     direction: 'low',     setpoint: 10.0, priority: 'critical', panel: 'A', label_learning: 'Vessel Level Critical Low',      label_industry: 'VESSEL LVL LO LO' },
    { id: 'vessel_press_hi',   instrument: 'vessel_pressure',  direction: 'high',    setpoint: 7.24, priority: 'warning',  panel: 'A', label_learning: 'Vessel Pressure High',           label_industry: 'VESSEL PRESS HI' },
    { id: 'vessel_press_lo',   instrument: 'vessel_pressure',  direction: 'low',     setpoint: 5.86, priority: 'warning',  panel: 'A', label_learning: 'Vessel Pressure Low',            label_industry: 'VESSEL PRESS LO' },
    { id: 'high_power',        instrument: 'power_range',      direction: 'high',    setpoint: 108.0, priority: 'critical', panel: 'A', label_learning: 'High Reactor Power',            label_industry: 'HI POWER' },
  ];
  var BWR_ALARMS_B = [
    { id: 'rcic_running',  instrument: 'rcic_status',      direction: 'is_true',  setpoint: null, priority: 'status',   panel: 'B', label_learning: 'RCIC Running',                label_industry: 'RCIC RUNNING' },
    { id: 'sbo',           instrument: 'station_blackout', direction: 'is_true',  setpoint: null, priority: 'critical', panel: 'B', label_learning: 'Station Blackout — AC Power Lost', label_industry: 'SBO' },
    { id: 'battery_low',   instrument: 'battery_pct',      direction: 'low',      setpoint: 20.0, priority: 'warning',  panel: 'B', label_learning: 'Battery Power Low',           label_industry: 'BATT LO' },
  ];

  // Failures (kind per HR7). physics_parameter → implemented in the engine;
  // command_override / block → intercepted in M4; instrument → instrument model.
  var BWR_FAILURES = {
    rcic_failure:        { type: 'physics_parameter', category: 'safety_system', effect: 'stop_rcic', display: 'RCIC Failure' },
    hpci_failure:        { type: 'physics_parameter', category: 'safety_system', effect: 'stop_hpci', display: 'HPCI Failure' },
    ic_failure:          { type: 'physics_parameter', category: 'safety_system', effect: 'stop_ic', display: 'Isolation Condenser Failure (valves shut)' },
    station_blackout:    { type: 'physics_parameter', category: 'power', effect: 'full_blackout_bwr', display: 'Station Blackout' },
    loss_of_feedwater:   { type: 'command_override', category: 'coolant', intercepts: ['set_feedwater_flow'], override_value: 0.0, display: 'Loss of Feedwater' },
    turbine_trip:        { type: 'command_override', category: 'power', intercepts: ['set_turbine_load', 'set_load_target', 'connect_grid'], override_value: 0.0, display: 'Turbine Trip' },
    failure_to_scram:    { type: 'command_override', category: 'safety_system', intercepts: ['scram'], effect: 'block', display: 'Failure to Scram (ATWS)' },
    ads_failure:         { type: 'command_override', category: 'safety_system', intercepts: ['trigger_ads'], effect: 'block', display: 'ADS Failure (won’t open)' },
    lpci_failure:        { type: 'command_override', category: 'safety_system', intercepts: ['start_lpci'], effect: 'block', display: 'LPCI Failure' },
    recirc_pump_trip:    { type: 'physics_parameter', category: 'coolant', effect: 'coast_down_recirc', display: 'Recirculation Pump Trip' },
    loss_of_condenser_vacuum: { type: 'physics_parameter', category: 'power', effect: 'vacuum_decay', display: 'Loss of Condenser Vacuum' },
    srv_stuck_open:      { type: 'physics_parameter', category: 'coolant', effect: 'stuck_relief_open', severity_scales: 'relief_area',
                           severity_meta: { label: 'Break Size', unit: '% effective area', min: 0, max: 100, default: 30 }, display: 'Safety/Relief Valve Stuck Open' },
    early_battery_failure: { type: 'physics_parameter', category: 'power', effect: 'degrade_battery', severity_scales: 'battery_duration_fraction',
                           severity_meta: { label: 'Battery Life', unit: '% of 8 h', min: 100, max: 25, default: 60, invert: true }, display: 'Early Battery Depletion' },
    vessel_level_sensor_failure: { type: 'instrument', category: 'instrument', instrument_id: 'vessel_level', mode: 'stuck', display: 'Vessel Level Sensor Stuck' },
    msiv_closure:        { type: 'command_override', category: 'power', intercepts: ['set_turbine_load'], override_value: 0.0, display: 'MSIV Closure' },
  };

  var BWR_PROTECTION = {
    trips: BWR_TRIPS,
    actuations: BWR_ACTUATIONS,
    alarms: BWR_ALARMS_A.concat(BWR_ALARMS_B),
    alarms_panel_a: BWR_ALARMS_A,
    alarms_panel_b: BWR_ALARMS_B,
    failures: BWR_FAILURES,
  };

  RD.BWR_CONTROL = { protection: BWR_PROTECTION };
  RD.BWR_PROTECTION = BWR_PROTECTION;                              // legacy name
  if (RD.BWR_CONFIG) RD.BWR_CONFIG.protection = BWR_PROTECTION;

})(globalThis.RD || (globalThis.RD = {}));
