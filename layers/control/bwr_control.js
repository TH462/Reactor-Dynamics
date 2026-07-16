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

  // Automation channels (kernel §11).
  function clip(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }

  var BWR_CHANNELS = [
    { id: 'recirc_power', kind: 'pid', group: 'Reactor',
      label: 'Recirculation → Power',
      hint: 'Recirc flow controller — modulates drive flow to hold indicated power at the setpoint (the BWR\'s normal power control). Rods stay yours unless the trim channel is on.',
      offOnScram: true,
      pv: function (s) { return s.instruments.power_range; },
      cmd: function (u) { return { action: 'set_recirc_flow', pct: u }; },
      init: function (s) { return s.control_state.recirc_flow_setpoint_pct; },
      // spSlew ramps power-setpoint changes (~0.15 %/s): an instant recirc step
      // collapses steam flow and trips the plant on low vessel pressure.
      uMin: 0, uMax: 48, kp: 0.35, ki: 0.02, db: 0.3, minDelta: 0.2, period: 2.0, pvTau: 1.5, spSlew: 0.15,
      sp: { capture: function (s) { return s.instruments.power_range; }, min: 5, max: 110, unit: '%', dp: 1, step: 1 } },

    { id: 'rods_trim', kind: 'rods', group: 'Reactor',
      label: 'Control Rods → Power (coarse trim)',
      hint: 'Slow, wide-deadband rod trim — steps in only when recirculation is saturated or off automatic (one BWR rod step is worth several % power). Fine control belongs to recirculation.',
      group_id: 'control_rods', offOnScram: true,
      pv: function (s) { return s.instruments.power_range; },
      sp: { capture: function (s) { return s.instruments.power_range; }, min: 5, max: 110, unit: '%', dp: 1, step: 1 },
      // One mid-travel BWR rod step ≈ several % power: while the engaged recirc
      // channel still has drive-flow authority, the trim must NOT fire (probed:
      // a single noise-triggered step at 600× ran power to 112% and the
      // pressure controller chased it into the low-pressure trip).
      standby: function (s, layer) {
        var rc = layer.byId.recirc_power;
        if (!rc || !rc.engaged) return false;
        var u = s.control_state.recirc_flow_setpoint_pct;
        return u > 2 && u < 46;
      },
      standbyNote: 'standing by — recirc has authority',
      gain: 0.3, db: 5.0, maxStep: 1, period: 12.0, fastAt: 1e9, kd: 8 },

    { id: 'feed_level', kind: 'pid', group: 'Vessel',
      label: 'Feedwater → Vessel level',
      hint: 'Feedwater controller — steam-flow feedforward plus level trim holds vessel water level at the setpoint. Engaging takes feedwater off the load coupling.',
      pv: function (s) { return s.instruments.vessel_level; },
      ff: function (s) { return clip(s.instruments.steam_flow * 100, 0, 120); },
      cmd: function (u) { return { action: 'set_feedwater_flow', pct: u }; },
      uMin: 0, uMax: 120, kp: 2.0, ki: 0.04, db: 0.3, minDelta: 1.0, period: 3.0, pvTau: 1.5,
      sp: { capture: function (s) { return s.instruments.vessel_level; }, min: 40, max: 90, unit: '%', dp: 0, step: 1 } },

    { id: 'turbine_pressure', kind: 'pid', group: 'Balance of Plant',
      label: 'Turbine load → Vessel pressure',
      hint: 'Turbine pressure control (the real BWR governor mode) — turbine load modulates to hold vessel pressure, so power maneuvers on recirc/rods don\'t drain the vessel into the low-pressure trip. Turn OFF to set turbine load yourself.',
      pv: function (s) { return s.instruments.vessel_pressure; },
      cmd: function (u) { return { action: 'set_turbine_load', mwe: u }; },
      init: function (s) { return s.control_state.load_target_mwe; },
      // Reverse-acting (more load → pressure falls): negative gains.
      uMin: 0, uMax: 1150, kp: -600, ki: -12, db: 0.015, minDelta: 12, period: 2.0, pvTau: 1.5,
      sp: { capture: function (s) { return s.instruments.vessel_pressure; }, min: 6.0, max: 7.4, dim: 'pressure', unit: 'MPa', dp: 2, step: 0.05 } },

    { id: 'steam_dump', kind: 'mode', group: 'Balance of Plant',
      label: 'Steam dump (turbine bypass)',
      hint: 'Automatic steam dump — sheds excess steam to the condenser on a load rejection (needs AC / condenser). Manual = freeze at the current valve position.',
      isOn: function (cs) { return !!cs.steam_dump_auto; },
      engage: function () { return [{ action: 'set_steam_dump', mode: 'auto' }]; },
      disengage: function (s) { return [{ action: 'set_steam_dump', pct: s.control_state.steam_dump_pct || 0 }]; } },
  ];

  var BWR_PROTECTION = {
    trips: BWR_TRIPS,
    actuations: BWR_ACTUATIONS,
    alarms: BWR_ALARMS_A.concat(BWR_ALARMS_B),
    alarms_panel_a: BWR_ALARMS_A,
    alarms_panel_b: BWR_ALARMS_B,
    failures: BWR_FAILURES,
    channels: BWR_CHANNELS,
  };

  RD.BWR_CONTROL = { protection: BWR_PROTECTION };
  RD.BWR_PROTECTION = BWR_PROTECTION;                              // legacy name
  if (RD.BWR_CONFIG) RD.BWR_CONFIG.protection = BWR_PROTECTION;

})(globalThis.RD || (globalThis.RD = {}));
