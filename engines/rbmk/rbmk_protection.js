/*
 * rbmk_protection.js — RBMK protection / alarm / failure definitions as data
 * (M2 §14; HR1/HR3/HR7/HR8). Consumed by the Control & Failure Layer (M4); the
 * engine acts on none of it — it only exposes the instruments these rules read
 * and the controls/hooks they drive.
 *
 * RBMK protection is VERSION-SPECIFIC (the pre-1986 reactor historically had
 * fewer automatic trips, and the ORM minimum differs). forVersion() returns the
 * concrete pre/post protection block. All setpoints read INSTRUMENTS (HR1); when
 * `eps_bypassed`, M4 disables the auto-trips.
 *
 * Attaches RD.RBMK_PROTECTION. Loads before rbmk_config.js so forVersion() can
 * stitch the protection block onto the version config.
 */
;(function (RD) {
  'use strict';

  // Trips — { instrument, direction, setpoint, action }. Any trip scrams.
  var TRIPS_PRE = [
    { instrument: 'power_range',    direction: 'high', setpoint: 120.0, action: 'scram' }, // % rated
    { instrument: 'steam_pressure', direction: 'high', setpoint: 8.0,   action: 'scram' }, // MPa — drum overpressure
    { instrument: 'drum_level',     direction: 'low',  setpoint: 10.0,  action: 'scram' }, // %
  ];
  // The post-1986 reactor added a tighter power trip and a void trip.
  var TRIPS_POST = TRIPS_PRE.concat([
    { instrument: 'power_range',    direction: 'high', setpoint: 110.0, action: 'scram' }, // tighter power trip
    { instrument: 'void_fraction',  direction: 'high', setpoint: 0.80,  action: 'scram' }, // added void trip
  ]);

  // RBMK has no engineered-safety auto-actuation in v1 (no PWR-style ECCS valves
  // to sequence); protection is trip-to-scram only.
  var ACTUATIONS = [];

  // Alarms — added to the standard reactor/primary set. The ORM threshold is the
  // version minimum. { id, instrument, direction, setpoint, priority, panel,
  // label_learning, label_industry }. Panel A = reactor/reactivity, B = systems.
  function alarms(orm_min) {
    return {
      a: [
        { id: 'reactor_trip',   instrument: 'rps_scrammed',  direction: 'is_true', setpoint: null,    priority: 'critical', panel: 'A', label_learning: 'Reactor Scram (AZ-5)',                 label_industry: 'AZ-5 SCRAM' },
        { id: 'high_power',     instrument: 'power_range',   direction: 'high',    setpoint: 110.0,   priority: 'critical', panel: 'A', label_learning: 'High Reactor Power',                    label_industry: 'HI POWER' },
        { id: 'orm_low',        instrument: 'orm_display',   direction: 'low',     setpoint: orm_min, priority: 'critical', panel: 'A', label_learning: 'Operating Reactivity Margin Too Low',   label_industry: 'ORM LO' },
        { id: 'void_high',      instrument: 'void_fraction', direction: 'high',    setpoint: 0.70,    priority: 'warning',  panel: 'A', label_learning: 'High Coolant Voiding',                  label_industry: 'HI VOID' },
        { id: 'fuel_temp_high', instrument: 'fuel_temp',     direction: 'high',    setpoint: 1500.0,  priority: 'warning',  panel: 'A', label_learning: 'High Fuel Temperature',                 label_industry: 'HI FUEL T' },
      ],
      b: [
        { id: 'steam_press_high', instrument: 'steam_pressure', direction: 'high',    setpoint: 7.6,  priority: 'warning',  panel: 'B', label_learning: 'Steam Drum Pressure High',     label_industry: 'DRUM PRESS HI' },
        { id: 'steam_press_low',  instrument: 'steam_pressure', direction: 'low',     setpoint: 6.4,  priority: 'warning',  panel: 'B', label_learning: 'Steam Drum Pressure Low',      label_industry: 'DRUM PRESS LO' },
        { id: 'drum_level_low',   instrument: 'drum_level',     direction: 'low',     setpoint: 20.0, priority: 'warning',  panel: 'B', label_learning: 'Steam Drum Level Low',         label_industry: 'DRUM LVL LO' },
        { id: 'drum_level_lolo',  instrument: 'drum_level',     direction: 'low',     setpoint: 10.0, priority: 'critical', panel: 'B', label_learning: 'Steam Drum Level Critical Low', label_industry: 'DRUM LVL LO LO' },
        { id: 'flow_low',         instrument: 'channel_flow',   direction: 'low',     setpoint: 50.0, priority: 'warning',  panel: 'B', label_learning: 'Low Coolant Flow',            label_industry: 'LO FLOW' },
        { id: 'eps_bypass',       instrument: 'eps_bypassed',   direction: 'is_true', setpoint: null, priority: 'warning',  panel: 'B', label_learning: 'Emergency Protection Bypassed', label_industry: 'EPS BYPASS' },
      ],
    };
  }

  // Failures (kind per HR7). physics_parameter → implemented in this engine;
  // command_override / block → intercepted in M4; instrument → applied by the
  // instrument model (§13). severity_meta is M4 slider metadata; category groups
  // the failure for the UI Failures tab.
  var FAILURES = {
    mcp_trip:              { type: 'physics_parameter', category: 'coolant', effect: 'coast_down_mcp', display: 'MCP Trip' },
    eps_bypass:            { type: 'physics_parameter', category: 'safety_system', effect: 'disable_auto_trips', display: 'EPS Bypass Active' },
    channel_dryout:        { type: 'physics_parameter', category: 'coolant', effect: 'reduce_h_fc', severity_scales: 'h_fc_reduction_fraction',
                             severity_meta: { label: 'Dryout Severity', unit: '% heat-transfer loss', min: 0, max: 90, default: 50 }, display: 'Channel Dryout' },
    loss_of_feedwater:     { type: 'command_override', category: 'coolant', intercepts: ['set_feedwater_flow'], override_value: 0.0, display: 'Loss of Feedwater' },
    partial_mcp_trip:      { type: 'physics_parameter', category: 'coolant', effect: 'partial_mcp_trip', severity_scales: 'pumps_lost_fraction',
                             severity_meta: { label: 'Pumps Lost', unit: '% of pumps', min: 0, max: 75, default: 50 }, display: 'Partial MCP Trip / Flow Runback' },
    orm_indicator_failure: { type: 'instrument', category: 'instrument', instrument_id: 'orm_display', mode: 'stuck', display: 'ORM Indicator Failed (reads safe)' },
    failure_to_scram:      { type: 'command_override', category: 'safety_system', intercepts: ['scram', 'manual_scram'], effect: 'block', display: 'AZ-5 Failure to Insert' },
    stuck_rods_on_scram:   { type: 'physics_parameter', category: 'reactivity', effect: 'stuck_control_rod', severity_scales: 'worth_fraction_held',
                             severity_meta: { label: 'Rod Worth Held', unit: '% of total', min: 0, max: 40, default: 20 }, display: 'Rods Stuck Mid-Insertion' },
    continuous_rod_withdrawal: { type: 'physics_parameter', category: 'reactivity', effect: 'rod_withdrawal_runaway', severity_scales: 'withdraw_rate',
                             severity_meta: { label: 'Withdrawal Rate', unit: 'steps/s', min: 0, max: 6, default: 3 }, display: 'Continuous Rod Withdrawal' },
    pressure_tube_rupture: { type: 'physics_parameter', category: 'coolant', effect: 'channel_rupture', severity_scales: 'rupture_size',
                             severity_meta: { label: 'Break Size', unit: '% effective area', min: 0, max: 100, default: 30 }, display: 'Pressure Tube Rupture' },
    void_sensor_failure:   { type: 'instrument', category: 'instrument', instrument_id: 'void_fraction', mode: 'stuck', display: 'Void Fraction Sensor Stuck' },
  };

  function forVersion(version) {
    var orm_min = (version === 'post_chernobyl') ? 43.0 : 15.0;
    var trips = (version === 'post_chernobyl') ? TRIPS_POST : TRIPS_PRE;
    var al = alarms(orm_min);
    return {
      design_version: version,
      trips: trips,
      actuations: ACTUATIONS,
      alarms: al.a.concat(al.b),
      alarms_panel_a: al.a,
      alarms_panel_b: al.b,
      failures: FAILURES,
      orm_min: orm_min,
    };
  }

  RD.RBMK_PROTECTION = { forVersion: forVersion, FAILURES: FAILURES };

})(globalThis.RD || (globalThis.RD = {}));
