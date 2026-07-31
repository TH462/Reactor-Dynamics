/*
 * rbmk_control.js — the RBMK's control layer, as data (HR1/HR3/HR7/HR8).
 *
 * Everything plant-specific the Control Layer kernel (control_kernel.js) runs
 * for the RBMK: protection trips, alarms, failure definitions, and interlocks
 * (originally engines/rbmk/rbmk_protection.js, M2 §14). The engine acts on none
 * of it — it only exposes the instruments these rules read and the
 * controls/hooks they drive.
 *
 * RBMK protection is VERSION-SPECIFIC (the pre-1986 reactor historically had
 * fewer automatic trips, and the ORM minimum differs). forVersion() returns the
 * concrete pre/post protection block. All setpoints read INSTRUMENTS (HR1); when
 * `eps_bypassed`, the kernel disables the auto-trips.
 *
 * Attaches RD.RBMK_CONTROL (and the legacy RD.RBMK_PROTECTION). Loads before
 * rbmk_config.js so forVersion() can stitch the protection block onto the
 * version config.
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
  // to sequence); reactor protection is trip-to-scram only.
  var ACTUATIONS = [];

  // Mechanical protections moved in-stack (2026-07 ruling): relief-valve pops
  // and turbine trips are CONTROL decisions reading instruments, so they can be
  // manipulated and failed like every other actuation. Setpoints derive from
  // the engine config (single source — the engine keeps the valve hydraulics).
  // Built lazily: this module loads BEFORE rbmk_config.js, but forVersion() is
  // called at engine construction, after RD.RBMK_CONFIG exists. These values
  // all live in the shared BASE (identical pre/post).
  function mechanicalActuations() {
    var base = (RD.RBMK_CONFIG && RD.RBMK_CONFIG.base) || {};
    var th = base.thermal || {}, tb = base.turbine || {};
    return [
      // Steam-drum relief valves: pop / reseat on the drum-pressure instrument.
      { instrument: 'steam_pressure', direction: 'high', setpoint: th.drum_relief_mpa || 8.0,
        action: 'open_relief_valve', reset_below: th.drum_relief_reseat_mpa || 7.8,
        reset_action: 'close_relief_valve' },
      // Turbine protection: low condenser vacuum, and overspeed. reset_below
      // re-arms the latch once the reading recovers (no reset command — a trip
      // is one-way; the operator restores the machine via connect_grid).
      { instrument: 'condenser_vacuum', direction: 'low', setpoint: tb.vacuum_trip_kpa || 74.5,
        action: 'trip_turbine', reset_below: 84.7 },
      { instrument: 'turbine_rpm', direction: 'high', setpoint: tb.rpm_overspeed_trip || 3300.0,
        action: 'trip_turbine', reset_below: tb.rpm_rated || 3000.0 },
    ];
  }

  // Alarms — added to the standard reactor/primary set. The ORM threshold is the
  // version minimum. { id, instrument, direction, setpoint, priority, panel,
  // label_learning, label_industry }. Panel A = reactor/reactivity, B = systems.
  function alarms(orm_min) {
    return {
      a: [
        { id: 'reactor_trip',   instrument: 'rps_scrammed',  direction: 'is_true', setpoint: null,    priority: 'critical', panel: 'A', category: 'safety_system', label_learning: 'Reactor Scram (AZ-5)',                 label_industry: 'AZ-5 SCRAM' },
        { id: 'high_power',     instrument: 'power_range',   direction: 'high',    setpoint: 110.0,   priority: 'critical', panel: 'A', category: 'reactivity', label_learning: 'High Reactor Power',                    label_industry: 'HI POWER' },
        { id: 'orm_low',        instrument: 'orm_display',   direction: 'low',     setpoint: orm_min, priority: 'critical', panel: 'A', category: 'reactivity', label_learning: 'Operating Reactivity Margin Too Low',   label_industry: 'ORM LO' },
        { id: 'sur_high',       instrument: 'startup_rate',  direction: 'high',    setpoint: 3.0,     priority: 'caution',  panel: 'A', category: 'reactivity', label_learning: 'Startup Rate High',                     label_industry: 'SUR HI' },
        { id: 'void_high',      instrument: 'void_fraction', direction: 'high',    setpoint: 0.70,    priority: 'warning',  panel: 'A', category: 'coolant', label_learning: 'High Coolant Voiding',                  label_industry: 'HI VOID' },
        { id: 'fuel_temp_high', instrument: 'fuel_temp',     direction: 'high',    setpoint: 1500.0,  priority: 'warning',  panel: 'A', category: 'reactivity', label_learning: 'High Fuel Temperature',                 label_industry: 'HI FUEL T' },
      ],
      b: [
        { id: 'steam_press_high', instrument: 'steam_pressure', direction: 'high',    setpoint: 7.6,  priority: 'warning',  panel: 'B', category: 'power', label_learning: 'Steam Drum Pressure High',     label_industry: 'DRUM PRESS HI' },
        { id: 'steam_press_low',  instrument: 'steam_pressure', direction: 'low',     setpoint: 6.4,  priority: 'warning',  panel: 'B', category: 'power', label_learning: 'Steam Drum Pressure Low',      label_industry: 'DRUM PRESS LO' },
        { id: 'drum_level_low',   instrument: 'drum_level',     direction: 'low',     setpoint: 20.0, priority: 'warning',  panel: 'B', category: 'coolant', label_learning: 'Steam Drum Level Low',         label_industry: 'DRUM LVL LO' },
        { id: 'drum_level_lolo',  instrument: 'drum_level',     direction: 'low',     setpoint: 10.0, priority: 'critical', panel: 'B', category: 'coolant', label_learning: 'Steam Drum Level Critical Low', label_industry: 'DRUM LVL LO LO' },
        { id: 'flow_low',         instrument: 'channel_flow',   direction: 'low',     setpoint: 50.0, priority: 'warning',  panel: 'B', category: 'coolant', label_learning: 'Low Coolant Flow',            label_industry: 'LO FLOW' },
        { id: 'eps_bypass',       instrument: 'eps_bypassed',   direction: 'is_true', setpoint: null, priority: 'warning',  panel: 'B', category: 'safety_system', label_learning: 'Emergency Protection Bypassed', label_industry: 'EPS BYPASS' },
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
    turbine_trip:          { type: 'physics_parameter', category: 'power', effect: 'trip_turbine', display: 'Turbine Trip' },
    loss_of_condenser_vacuum: { type: 'physics_parameter', category: 'power', effect: 'vacuum_decay', display: 'Loss of Condenser Vacuum' },
  };

  // Interlocks (M4 §4b) — condition-latched command blocks from instruments
  // (HR1). The rod-withdrawal block on high startup rate mirrors the real RBMK's
  // period protection, deliberately tuned LESS protective than the PWR's
  // (engage 4.0 vs 2.5 DPM): the RBMK's instability is part of its curriculum,
  // and the block exists to keep normal startups honest, not to sand off the
  // design's character. Both versions carry it (period protection predates 1986).
  var INTERLOCKS = [
    { instrument: 'startup_rate', direction: 'high', setpoint: 4.0, clears_below: 2.5,
      blocks: ['rod_start', 'rod_nudge'], withdrawal_only: true,
      on_engage: { action: 'rod_stop_all' },
      message_learning: 'Rod withdrawal blocked — the reactor is speeding up too fast (startup rate high). Let the rate settle below 2.5 DPM, then continue. You can always insert.',
      message_industry: 'ROD WITHDRAWAL BLOCK: SUR ≥ 4.0 DPM. Withdrawal inhibited until SUR < 2.5 DPM. Insertion available.' },
  ];

  // Automation channels (kernel §11) — shared by both design versions.
  function clip(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }

  var CHANNELS = [
    { id: 'rods_power', kind: 'rods', group: 'Reactor',
      label: 'AR Rods → Power (automatic regulator)',
      hint: 'The RBMK\'s Automatic Regulator — a small, fine-stepped rod group (~2 pcm/step vs the manual bank\'s ~35) holding indicated power at the setpoint. Starts in AUTO (the plant\'s normal lineup), capturing the current power; switching it to MAN is taking manual control — the pre-accident condition at Chernobyl. When it runs out of travel, re-center it with the manual bank (or engage the re-center channel).',
      group_id: 'auto_rods', offOnScram: true,
      // AUTO by default (free play / plant load) — but only where the state
      // parks the AR with authority (mid-range). Startup and the Chernobyl
      // precondition start it fully withdrawn → stays MAN (historical, and
      // automation must not run the startup or fight the accident setup).
      defaultOn: function (s) {
        if (s.rps_state && s.rps_state.scrammed) return false;
        if (s.true_state && (s.true_state.scrammed || s.true_state.melted)) return false;
        var gs = s.control_state.rod_groups;
        for (var i = 0; i < gs.length; i++) {
          if (gs[i].id !== 'auto_rods') continue;
          var ins = 100 - gs[i].position_pct;
          return ins >= 20 && ins <= 80;
        }
        return false;
      },
      pv: function (s) { return s.instruments.power_range; },
      sp: { capture: function (s) { return s.instruments.power_range; }, min: 1, max: 110, unit: '%', dp: 1, step: 1 },
      pvTau: 2.0,   // power_range noise σ0.5 ≈ the AR's per-step worth — filter or it hunts noise
      gain: 4.0, db: 0.5, maxStep: 6, period: 3.0, fastAt: 2.0, kd: 6, spSlew: 0.1 },

    { id: 'ar_recenter', kind: 'rods', group: 'Reactor',
      label: 'Manual bank → AR re-center',
      hint: 'Re-centers the Automatic Regulator with the manual bank (real RBMK practice): when the AR nears either end of its travel, single manual-bank steps hand the standing reactivity burden back to the coarse rods so the AR keeps fine authority. Watch the ORM — the manual bank is what it counts.',
      group_id: 'control_rods', offOnScram: true, requires: 'rods_power',
      // PV = AR INSERTED % (100 − position_pct): mid-range = 50. Only acts
      // outside ±25 of mid (the deadband), one slow step per period.
      pv: function (s) {
        var gs = s.control_state.rod_groups;
        for (var i = 0; i < gs.length; i++) if (gs[i].id === 'auto_rods') return 100 - gs[i].position_pct;
        return null;
      },
      sp: { capture: function () { return 50; }, min: 30, max: 70, unit: '% ins', dp: 0, step: 5 },
      gain: 0.04, db: 25.0, maxStep: 1, period: 15.0, fastAt: 1e9, kd: 0 },

    { id: 'feed_drum', kind: 'pid', group: 'Coolant Circuit',
      label: 'Feedwater → Drum level',
      hint: 'Feedwater controller — power feedforward plus level trim holds steam-drum level at the setpoint. Engaging takes feedwater off the load coupling.',
      pv: function (s) { return s.instruments.drum_level; },
      ff: function (s) { return clip(s.instruments.power_range, 0, 110); },
      cmd: function (u) { return { action: 'set_feedwater_flow', pct: u }; },
      uMin: 0, uMax: 110, kp: 1.5, ki: 0.03, db: 0.3, minDelta: 1.0, period: 3.0, pvTau: 1.5,
      sp: { capture: function (s) { return s.instruments.drum_level; }, min: 40, max: 90, unit: '%', dp: 0, step: 1 } },

    { id: 'grid_follow', kind: 'mode', group: 'Balance of Plant',
      label: 'Turbine / grid (load follow)',
      hint: 'Load-follow — turbine steam load tracks reactor power. Turn OFF to set turbine load yourself.',
      isOn: function (cs) { return cs.load_mode === 'follow'; },
      engage: function () { return [{ action: 'set_load_mode', mode: 'follow' }]; },
      disengage: function () { return [{ action: 'set_load_mode', mode: 'manual' }]; } },

    { id: 'steam_dump', kind: 'mode', group: 'Balance of Plant',
      label: 'Steam dump (turbine bypass)',
      hint: 'Automatic steam dump — holds drum pressure on a load rejection. Manual = freeze at the current valve position.',
      isOn: function (cs) { return !!cs.steam_dump_auto; },
      engage: function () { return [{ action: 'set_steam_dump', mode: 'auto' }]; },
      disengage: function (s) { return [{ action: 'set_steam_dump', pct: s.control_state.steam_dump_pct || 0 }]; } },
  ];

  function forVersion(version) {
    var orm_min = (version === 'post_chernobyl') ? 43.0 : 15.0;
    var trips = (version === 'post_chernobyl') ? TRIPS_POST : TRIPS_PRE;
    var al = alarms(orm_min);
    return {
      design_version: version,
      trips: trips,
      actuations: ACTUATIONS.concat(mechanicalActuations()),
      alarms: al.a.concat(al.b),
      alarms_panel_a: al.a,
      alarms_panel_b: al.b,
      failures: FAILURES,
      interlocks: INTERLOCKS,
      orm_min: orm_min,
      channels: CHANNELS,
    };
  }

  RD.RBMK_CONTROL = { forVersion: forVersion, FAILURES: FAILURES };
  RD.RBMK_PROTECTION = RD.RBMK_CONTROL;   // legacy name

})(globalThis.RD || (globalThis.RD = {}));
