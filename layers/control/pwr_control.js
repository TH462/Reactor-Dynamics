/*
 * pwr_control.js — the PWR's control layer, as data (HR1/HR3/HR8).
 *
 * Everything plant-specific the Control Layer kernel (control_kernel.js) runs
 * for the PWR: protection trips, engineered-safety actuation, alarms, failure
 * definitions, and interlocks (originally engines/pwr/pwr_protection.js, M1 §9).
 * The engine itself acts on none of it — it only exposes the instruments these
 * rules read and the controls they drive.
 *
 * All setpoints read INSTRUMENTS (HR1), in SI units (MPa / °C / % / normalized),
 * with the single documented exception `__true_flow__` (no flow instrument in v1).
 * Attaches RD.PWR_CONTROL, plus the legacy names RD.PWR_PROTECTION and
 * RD.PWR_CONFIG.protection (the engine's failure dispatch reads the latter);
 * loads after pwr_config.js.
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
      action: 'set_hpi', active: true, reset_action: 'set_hpi', reset_active: false, arm: 'hpi' },
    { instrument: 'sg_level',         direction: 'low',  setpoint: 20.0,
      action: 'set_afw', active: true, arm: 'afw' },
    // (The old 2.76 MPa set_lpi actuation is gone: HPI/LPI is one merged system
    // armed by the 11.03 MPa set_hpi actuation above — the low-head/high-flow
    // regime follows physically from the two-segment pump curve.)
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
    { id: 'hpi_active',     instrument: 'hpi_active',       direction: 'is_true',  setpoint: null, priority: 'status',   panel: 'B', label_learning: 'Emergency Injection Active',     label_industry: 'HPI/LPI ACTIVE' },
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
    loss_of_feedwater:           { type: 'command_override', category: 'power', intercepts: ['set_feedwater_flow', 'set_feed_pump_speed', 'feed_pump_nudge'], override_value: 0.0, display: 'Loss of Main Feedwater' },
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
    sg_overfeed:                 { type: 'command_override', category: 'power', intercepts: ['set_feedwater_flow', 'set_feed_pump_speed'], override_value: 120, display: 'SG Overfeed / Overcooling' },   // 120 % pump speed (was 1.2 — a pct-units slip)
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

  // Automation channels (kernel §11) — operator-selectable controllers the
  // control layer runs at physics rate. Kinds: mode (passthrough to an
  // engine-internal auto), pid, rods, bang. Callbacks receive a snapshot-shaped
  // ctx { instruments, control_state, true_state, rps_state, metadata }; all
  // read INSTRUMENTS (HR1). Groups are display sections in the Automate tab.
  function clip(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }

  var PWR_CHANNELS = [
    { id: 'rods_tavg', kind: 'rods', group: 'Reactor',
      label: 'Rod control → Tavg (AUTO)',
      hint: 'Automatic rod control — on engage it captures T-ref from the CURRENT indicated Tavg, then holds it: a Tavg−Tref mismatch (e.g. after a turbine load change) computes the required rod direction and a Westinghouse-style variable speed (bigger error → faster drive), locking up inside a ±0.8 °C (±1.5 °F) deadband. Any manual rod motion takes it back to MAN.',
      group_id: 'control_rods', offOnScram: true,
      manual_overrides: ['rod_nudge', 'rod_start'],   // operator rod motion on this group → MAN
      pv: function (s) { return s.instruments.tavg; },
      // T-ref := indicated Tavg at engage (HR1) — editable afterwards.
      sp: { capture: function (s) { return s.instruments.tavg; }, min: 285, max: 315, dim: 'temp', unit: '°C', dp: 1, step: 0.5 },
      // Two-term control like a real rod controller: a DOMINANT steam-vs-power
      // mismatch term (power chases the turbine draw — fast, self-stable, the
      // real system's power-mismatch channel) with the Tavg−Tref error as the
      // slow trim. Tavg integrates the mismatch, so a Tavg-dominant loop
      // limit-cycles for minutes; mismatch-dominant glides.
      trim: function (s) { return 1.25 * (s.instruments.steam_flow * 100 - s.instruments.power_range); },
      // ±0.8 °C (±1.5 °F) lockup band; error-proportional speed ladder [tune].
      speeds: [{ above: 0.8, speed: 'slow' }, { above: 2.0, speed: 'normal' }, { above: 4.0, speed: 'fast' }],
      gain: 0.4, db: 0.8, maxStep: 2, period: 5.0, fastAt: 4.0, kd: 5, spSlew: 0.05 },

    { id: 'boron_trim', kind: 'bang', group: 'Reactor',
      label: 'Boron → rod position trim',
      hint: 'CVCS chemistry trim — borates when the auto rods sit too deep, dilutes when they run out of travel, so rod control keeps its authority through xenon and load drifts. Needs the rod channel engaged and the charging pump running.',
      requires: 'rods_tavg', offOnScram: true,
      hi: 96.0, lo: 55.0, hiStop: 90.0, loStop: 62.0, rate: 0.5 },

    { id: 'pzr_pressure', kind: 'mode', group: 'Primary',
      label: 'Pressurizer pressure (heaters + spray)',
      hint: 'Returns the pressurizer heaters and spray to their proportional automatic control holding ~2235 psia. Manual = both freeze at their current output.',
      isOn: function (cs) { return !!(cs.heater_auto && cs.spray_auto); },
      engage: function () { return [{ action: 'set_heater', auto: true }, { action: 'set_spray', auto: true }]; },
      disengage: function (s) {
        var cs = s.control_state;
        return [{ action: 'set_heater', power_pct: cs.heater_power_pct }, { action: 'set_spray', pct: cs.spray_valve_pct }];
      } },

    { id: 'cvcs_makeup', kind: 'mode', group: 'Primary',
      label: 'CVCS make-up (inventory)',
      hint: 'Automatic make-up — charging modulates to hold primary inventory (compensates letdown and identified leakage).',
      isOn: function (cs) { return !!cs.cvcs_auto; },
      engage: function () { return [{ action: 'set_cvcs_auto', active: true }]; },
      disengage: function () { return [{ action: 'set_cvcs_auto', active: false }]; } },

    { id: 'feed_sg', kind: 'pid', group: 'Secondary',
      label: 'Feed pump → SG level (three-element)',
      hint: 'Three-element feedwater control — steam-generator level (element 1) plus the steam-flow vs feed-flow mismatch (elements 2 & 3) drive the feed pump speed. Engaging takes the pump off the load coupling; a manual pump command (nudge/set) takes the channel back to MAN.',
      pv: function (s) { return s.instruments.sg_level; },
      ff: function (s) { return clip(s.instruments.steam_flow * 100, 0, 120); },       // element 2: steam flow sets the base demand
      trim: function (s) { return 25 * (s.instruments.steam_flow - s.instruments.fw_flow); },   // element 3: steam−feed mismatch anticipation [tune]
      cmd: function (u) { return { action: 'set_feed_pump_speed', pct: u }; },
      manual_overrides: ['set_feed_pump_speed', 'feed_pump_nudge', 'set_feedwater_flow'],
      defaultOn: function () { return true; },   // the PWR's normal free-play lineup (replaces coupled feed as the level backbone)
      uMin: 0, uMax: 120, kp: 1.5, ki: 0.03, db: 0.3, minDelta: 1.0, period: 3.0, pvTau: 1.5,
      sp: { capture: function (s) { return s.instruments.sg_level; }, min: 30, max: 80, unit: '%', dp: 0, step: 1 } },

    { id: 'steam_dump', kind: 'mode', group: 'Secondary',
      label: 'Steam dump (turbine bypass)',
      hint: 'Automatic pressure-mode steam dump — opens proportionally above the no-load setpoint (carries a load rejection). Manual = freeze at the current valve position.',
      isOn: function (cs) { return !!cs.steam_dump_auto; },
      engage: function () { return [{ action: 'set_steam_dump', mode: 'auto' }]; },
      disengage: function (s) { return [{ action: 'set_steam_dump', pct: s.control_state.steam_dump_pct || 0 }]; } },

    { id: 'grid_follow', kind: 'mode', group: 'Secondary',
      label: 'Turbine / grid (load follow)',
      hint: 'Load-follow — turbine demand tracks reactor power (feedwater couples to load). Turn OFF to set grid demand yourself and let the other channels chase it.',
      isOn: function (cs) { return cs.load_mode === 'follow'; },
      engage: function () { return [{ action: 'set_load_mode', mode: 'follow' }]; },
      disengage: function () { return [{ action: 'set_load_mode', mode: 'manual' }]; } },
  ];

  // ESF AUTO/MAN arms (kernel §12): each system is ARMED for its auto-actuation
  // by default; any of the listed OPERATOR commands flips it to MANUAL, and
  // set_esf_auto re-arms it (a standing condition then re-fires).
  var PWR_ESF_SYSTEMS = [
    { id: 'hpi', label: 'HPI/LPI emergency injection', commands: ['set_hpi', 'set_lpi'] },
    { id: 'afw', label: 'Auxiliary feedwater',         commands: ['set_afw', 'set_afw_flow'] },
  ];

  var PWR_PROTECTION = {
    trips: PWR_TRIPS,
    actuations: PWR_ACTUATIONS,
    alarms: PWR_ALARMS_A.concat(PWR_ALARMS_B),
    alarms_panel_a: PWR_ALARMS_A,
    alarms_panel_b: PWR_ALARMS_B,
    failures: PWR_FAILURES,
    interlocks: PWR_INTERLOCKS,
    channels: PWR_CHANNELS,
    esf_systems: PWR_ESF_SYSTEMS,
  };

  RD.PWR_CONTROL = { protection: PWR_PROTECTION };
  RD.PWR_PROTECTION = PWR_PROTECTION;                              // legacy name
  if (RD.PWR_CONFIG) RD.PWR_CONFIG.protection = PWR_PROTECTION;    // engine failure dispatch reads this

})(globalThis.RD || (globalThis.RD = {}));
