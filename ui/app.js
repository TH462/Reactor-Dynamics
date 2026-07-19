/* ============================================================================
 * app.js — Reactor⚛️Dynamics control-room UI, wired to the live stack.
 *
 * Builds a SimulationService (M5) and renders each broadcast snapshot. The UI is
 * PLANT-DRIVEN: a profile (PROFILES[plant]) supplies the gauges, numeric grid,
 * strip-chart series, and controls for the active reactor, so the same shell
 * drives the PWR, the RBMK (pre/post-1986), and the BWR. The Plant & Mission
 * window (Sim tab) picks the plant + mode (free play / campaign / scenario /
 * walkthrough); switching calls service.selectPlant() and rebuilds the
 * plant-specific UI.
 *
 * Gauges/numeric read snapshot.instruments (HR1); controls issue commands down
 * the stack (HR5); alarms render from snapshot.alarms; the true-state overlay
 * reads snapshot.true_state on request. The board follows the "quiet board"
 * philosophy — color is spent only on deviation from normal.
 * ========================================================================== */
(function () {
  'use strict';
  var RD = globalThis.RD;
  var $ = function (id) { return document.getElementById(id); };

  // ----------------------------------------------------------- UI state
  var ui = {
    units: 'US',            // 'US' | 'SI'
    register: 'learning',   // 'learning' | 'industry'
    overlay: 'instruments', // 'instruments' | 'true' | 'both'
    diagMode: 'learning',   // synoptic: 'learning' (M8 Education) | 'realistic'
    physOverlay: false,     // synoptic: Physics Overlay toggle (Learning only)
    rodSpeed: 'normal',
    window: 300,            // strip-chart seconds
    series: {},             // per-plant; defaults set on plant load
    plant: 'pwr',           // active plant_id
    engineKey: 'pwr',       // active engine selector key
    initState: 'hot_full_power',
    view: 'diagram',        // plant-display active view
    pdAck: {},              // operator-acknowledged auto-actuations (ECCS/AFW → green)
    pdOp: {},               // operator-initiated systems (start green directly)
    ctlVals: {},            // last value typed into each control-bar number input (id → value), so the shared bar doesn't revert on view switch
    manualSection: 'overview', // active section in the Operator's Manual overlay
    follow: null,           // { id, idx } — a procedure being followed in the Instructor block
  };
  var service, latest = null, lastScrammed = false;
  // Operator automation now lives IN-STACK (layers/control/control_kernel.js);
  // the Automate tab is a pure face over snapshot.automation, issuing
  // set_auto_channel / set_auto_setpoint commands like any operator action.
  var chartBuf = [];        // { t, ins }
  var gaugeHist = {};       // id -> [raw values]
  var smoothed = {};        // id -> display-damped instrument value
  var DISPLAY_DAMP_K = 0.18;

  // ----------------------------------------------------------- unit conversion
  function conv(v, dim) {
    if (v == null) return v;
    if (ui.units === 'SI') return v;
    switch (dim) {
      case 'pressure': return v * 145.038;     // MPa → psia
      case 'temp':     return v * 9 / 5 + 32;   // °C → °F
      case 'tempdiff': return v * 9 / 5;        // °C difference → °F difference
      case 'vacuum':   return v * 0.2953;       // kPa → inHg
      default:         return v;
    }
  }
  function unit(dim) {
    var si = { pressure: 'MPa', temp: '°C', tempdiff: '°C', vacuum: 'kPa' };
    var us = { pressure: 'psi', temp: '°F', tempdiff: '°F', vacuum: 'inHg' };
    return (ui.units === 'SI' ? si : us)[dim] || '';
  }
  function dispP(mpa) { return mpa == null ? '—' : conv(mpa, 'pressure').toFixed(0) + ' ' + unit('pressure'); }
  function dispT(c) { return c == null ? '—' : conv(c, 'temp').toFixed(0) + ' ' + unit('temp'); }
  function dispTd(c) { return c == null ? '—' : conv(c, 'tempdiff').toFixed(0) + ' ' + unit('tempdiff'); }
  function dispV(kpa) { return kpa == null ? '—' : conv(kpa, 'vacuum').toFixed(1) + ' ' + unit('vacuum'); }
  // inverse of conv() — display units back to SI (Automate setpoint inputs)
  function invConv(v, dim) {
    if (v == null || ui.units === 'SI') return v;
    switch (dim) {
      case 'pressure': return v / 145.038;
      case 'temp':     return (v - 32) * 5 / 9;
      case 'tempdiff': return v * 5 / 9;
      case 'vacuum':   return v / 0.2953;
      default:         return v;
    }
  }
  function bool(v, onWord, offWord) { return { b: !!v, t: v ? (onWord || 'yes') : (offWord || 'no') }; }
  function pct(v, dp) { return v == null ? '—' : (v).toFixed(dp == null ? 0 : dp) + ' %'; }
  function pctOf(frac, dp) { return frac == null ? '—' : (frac * 100).toFixed(dp == null ? 0 : dp) + ' %'; }

  // ====================================================================== engines
  // Selector key → plant + design_version + default initial state, plus the
  // display copy for the Plant & Mission window's plant cards.
  var ENGINES = {
    pwr:       { plant: 'pwr',  dv: null,              init: 'hot_full_power',
                 label: 'PWR', sub: 'Pressurized Water Reactor',
                 desc: 'The stable, self-regulating starting point. Separate primary and steam loops. Home of the Three Mile Island story.' },
    rbmk_pre:  { plant: 'rbmk', dv: 'pre_chernobyl',   init: 'full_power',
                 label: 'RBMK pre-1986', sub: 'Chernobyl-type · original design',
                 desc: 'Graphite-moderated, positive void coefficient, graphite-tipped rods — the design that failed at Chernobyl.' },
    rbmk_post: { plant: 'rbmk', dv: 'post_chernobyl',  init: 'full_power',
                 label: 'RBMK post-1986', sub: 'Chernobyl-type · retrofitted',
                 desc: 'The same machine after the post-accident fixes. Run the same transient here and compare the outcome.' },
    bwr:       { plant: 'bwr',  dv: null,              init: 'full_power',
                 label: 'BWR', sub: 'Boiling Water Reactor',
                 desc: 'Boils water right in the core, steam straight to the turbine. Steam-driven safety systems — home of the Fukushima story.' },
  };

  // ====================================================================== profiles
  // Each plant supplies: gauges (vital strip), numeric (diagram grid), series
  // (strip-chart), controls (tabbed control strip), initStates, and a scram label.
  var PROFILES = {

    // ------------------------------------------------------------------ PWR
    pwr: {
      scram: 'REACTOR SCRAM', scramShort: 'SCRAM',
      initStates: [['hot_full_power', 'Hot Full Power'], ['50_percent', '50 % Power'], ['hot_zero_power', 'Hot Standby']],
      defaultSeries: { power: true, tavg: true, pressure: true, sg_level: true },
      gauges: [
        { id: 'power',   label: 'Reactor Power', lead: true, raw: function (s) { return s.instruments.power_range; }, units: '%', min: 0, max: 120, caution: 108, danger: 118, dp: 1 },
        { id: 'press',   label: 'Primary Pressure', raw: function (s) { return s.instruments.primary_pressure; }, dim: 'pressure', min: 0, max: 20.7, caution: 16.2, danger: 16.44, dp: 0 },
        { id: 'tavg',    label: 'Avg Coolant Temp (Tavg)', raw: function (s) { return s.instruments.tavg; }, dim: 'temp', min: 250, max: 343, caution: 312, danger: 335, dp: 0 },
        { id: 'pzr',     label: 'Pressurizer Level (PZR)', raw: function (s) { return s.instruments.pzr_level; }, units: '%', min: 0, max: 100, caution_lo: 25, danger_lo: 12, dp: 0 },
        { id: 'sg',      label: 'Steam Generator Level (SG)', raw: function (s) { return s.instruments.sg_level; }, units: '%', min: 0, max: 100, caution_lo: 30, danger_lo: 12, dp: 0 },
        { id: 'subcool', label: 'Subcooling Margin', raw: function (s) { return s.instruments.subcooling_margin; }, dim: 'tempdiff', min: -28, max: 83, caution_lo: 11, danger_lo: 0, dp: 0 },
      ],
      series: [
        { id: 'power',    label: 'Power %',  c: '#6a90b0', get: function (i) { return i.power_range; }, range: [0, 120], dHi: 118, fmt: function (v) { return v.toFixed(0) + '%'; } },
        { id: 'tavg',     label: 'Tavg',     c: '#b07830', get: function (i) { return i.tavg; }, range: [270, 330], dHi: 335, fmt: function (v) { return conv(v, 'temp').toFixed(0) + '°'; } },
        { id: 'pressure', label: 'Pressure', c: '#507048', get: function (i) { return i.primary_pressure; }, range: [10, 17], dHi: 16.44, fmt: function (v) { return conv(v, 'pressure').toFixed(0); } },
        { id: 'sg_level', label: 'SG Level', c: '#806890', get: function (i) { return i.sg_level; }, range: [0, 100], dLo: 12, fmt: function (v) { return v.toFixed(0) + '%'; } },
        { id: 'pzr_level',label: 'PZR Level',c: '#507878', get: function (i) { return i.pzr_level; }, range: [0, 100], dLo: 12, fmt: function (v) { return v.toFixed(0) + '%'; } },
        { id: 'subcool',  label: 'Subcool',  c: '#707060', get: function (i) { return i.subcooling_margin; }, range: [-10, 60], dLo: 0, fmt: function (v) { return conv(v, 'tempdiff').toFixed(0) + '°'; } },
        { id: 'mwe',      label: 'Output MW',c: '#506880', get: function (i) { return i.mwe_output; }, range: [0, 1100], fmt: function (v) { return v.toFixed(0); } },
      ],
    },

    // ------------------------------------------------------------------ RBMK
    rbmk: {
      scram: 'AZ-5 SCRAM', scramShort: 'AZ-5',
      initStates: [['full_power', 'Full Power'], ['low_power_xenon', 'Low Power + Xenon (accident)']],
      defaultSeries: { power: true, void: true, steam_p: true, orm: true },
      gauges: [
        { id: 'power',   label: 'Reactor Power', lead: true, raw: function (s) { return s.instruments.power_range; }, units: '%', min: 0, max: 120, caution: 110, danger: 120, dp: 1 },
        { id: 'steam_p', label: 'Steam Pressure',   raw: function (s) { return s.instruments.steam_pressure; }, dim: 'pressure', min: 0, max: 10.3, caution: 7.6, danger: 8.0, dp: 1 },
        { id: 'drum',    label: 'Steam Drum Level',    raw: function (s) { return s.instruments.drum_level; }, units: '%', min: 0, max: 100, caution_lo: 20, danger_lo: 10, dp: 0 },
        { id: 'flow',    label: 'Channel Flow',  raw: function (s) { return s.instruments.channel_flow; }, units: '%', min: 0, max: 120, caution_lo: 50, dp: 0 },
        { id: 'void',    label: 'Core Void Fraction', raw: function (s) { return s.instruments.void_fraction; }, units: '%', mul: 100, min: 0, max: 1, caution: 0.7, danger: 0.8, dp: 0 },
        { id: 'orm',     label: 'Operating Reactivity Margin (ORM)', raw: function (s) { return s.instruments.orm_display; }, units: '', min: 0, max: 80, caution_lo: 30, danger_lo: 15, dp: 0 },
      ],
      series: [
        { id: 'power',   label: 'Power %',   c: '#6a90b0', get: function (i) { return i.power_range; }, range: [0, 120], dHi: 120, fmt: function (v) { return v.toFixed(0) + '%'; } },
        { id: 'void',    label: 'Void',      c: '#b07830', get: function (i) { return i.void_fraction * 100; }, range: [0, 90], dHi: 80, fmt: function (v) { return v.toFixed(0) + '%'; } },
        { id: 'steam_p', label: 'Steam P',   c: '#507048', get: function (i) { return i.steam_pressure; }, range: [5, 9], dHi: 8.0, fmt: function (v) { return conv(v, 'pressure').toFixed(0); } },
        { id: 'drum',    label: 'Drum Lvl',  c: '#806890', get: function (i) { return i.drum_level; }, range: [0, 100], dLo: 10, fmt: function (v) { return v.toFixed(0) + '%'; } },
        { id: 'flow',    label: 'Flow',      c: '#507878', get: function (i) { return i.channel_flow; }, range: [0, 120], dLo: 30, fmt: function (v) { return v.toFixed(0) + '%'; } },
        { id: 'orm',     label: 'ORM',       c: '#707060', get: function (i) { return i.orm_display; }, range: [0, 80], dLo: 15, fmt: function (v) { return v.toFixed(0); } },
        { id: 'fuel',    label: 'Fuel °',    c: '#506880', get: function (i) { return i.fuel_temp; }, range: [200, 2000], dHi: 1500, fmt: function (v) { return conv(v, 'temp').toFixed(0) + '°'; } },
      ],
      numeric: [
        { title: 'Reactor / Core', rows: [
          { k: 'Power', inst: function (s) { return s.instruments.power_range.toFixed(1) + ' %'; }, truth: function (s) { return s.true_state.power_pct.toFixed(1) + ' %'; } },
          { k: 'AR Rods (auto group)', inst: function (s) { return bankStat(s, 'auto'); } },
          { k: 'Fuel Temp', inst: function (s) { return dispT(s.instruments.fuel_temp); }, truth: function (s) { return dispT(s.true_state.fuel_temp_c); } },
          { k: 'Graphite Temp', truth: function (s) { return dispT(s.true_state.graphite_temp_avg_c); } },
          { k: 'Decay Heat', truth: function (s) { return s.true_state.decay_heat_pct.toFixed(1) + ' %'; } },
          { k: 'Scrammed', inst: function (s) { return bool(s.rps_state.scrammed, 'YES', 'no'); } },
        ] },
        { title: 'Reactivity & ORM', rows: [
          { k: 'Operating Reactivity Margin (ORM)', inst: function (s) { return s.instruments.orm_display.toFixed(1) + ' rods'; }, truth: function (s) { return s.true_state.orm_equiv_rods.toFixed(1) + ' rods'; } },
          { k: 'ORM Alarm', inst: function (s) { return bool(s.instruments.orm_alarm_active, 'YES', 'no'); } },
          { k: 'Void Fraction', inst: function (s) { return pctOf(s.instruments.void_fraction); }, truth: function (s) { return pctOf(s.true_state.void_fraction_avg); } },
          { k: 'Reactivity', truth: function (s) { return (s.true_state.reactivity_pcm >= 0 ? '+' : '') + s.true_state.reactivity_pcm.toFixed(0) + ' pcm'; } },
          { k: 'Xenon', truth: function (s) { return s.true_state.xenon_pct_eq.toFixed(0) + ' % eq'; } },
        ] },
        { title: 'Steam Drum', rows: [
          { k: 'Steam Pressure', inst: function (s) { return dispP(s.instruments.steam_pressure); }, truth: function (s) { return dispP(s.true_state.steam_pressure_mpa); } },
          { k: 'Drum Level', inst: function (s) { return s.instruments.drum_level.toFixed(0) + ' %'; }, truth: function (s) { return s.true_state.drum_level_pct.toFixed(0) + ' %'; } },
        ] },
        { title: 'Coolant Channels', rows: [
          { k: 'Channel Flow', inst: function (s) { return s.instruments.channel_flow.toFixed(0) + ' %'; }, truth: function (s) { return s.true_state.channel_flow_pct.toFixed(0) + ' %'; } },
        ] },
        { title: 'Protection & Status', rows: [
          { k: 'Emergency Protection Bypassed (EPS)', inst: function (s) { return bool(s.instruments.eps_bypassed, 'YES', 'no'); } },
          { k: 'Energy Deposition Rate', truth: function (s) { return s.true_state.energy_deposition_rate.toFixed(0) + ' cal/g/s'; } },
          { k: 'Destruction', truth: function (s) { return bool(s.true_state.melted, (s.true_state.destruction_cause || 'MELTED').toUpperCase().replace('_', ' '), 'none'); } },
        ] },
      ],
      controls: [
        { key: 'reactor', label: 'Reactor Core', groups: [ROD_DRIVE('control_rods'), ROD_SPEED(), SHUTDOWN_DRIVE('shutdown_rods')] },
        { key: 'coolant', label: 'Coolant Circuit', groups: [
          { l: 'MCP / Channel Flow', hint: 'Main Circulation Pumps — channel flow setpoint. Lower flow ⇒ more void ⇒ (positive coefficient) more power.', num: { id: 'rbmkFlow', min: 0, max: 120, value: 100, act: 'rbmk-flow-set', setL: 'Set %' } },
          { l: 'Feedwater', num: { id: 'rbmkFeed', min: 0, max: 100, value: 100, act: 'rbmk-feed-set', setL: 'Set %' } },
        ] },
        { key: 'protection', label: 'Protection', groups: [
          { l: 'Emergency Protection (EPS)', emergency: 1, hint: 'EPS Bypass — disables the automatic trips (as during the test before the accident). AZ-5 still works.', seg: [{ l: 'Active', act: 'eps-off', on: 1, run: 1 }, { l: 'Bypassed', act: 'eps-on', warn: 1 }] },
        ] },
      ],
    },

    // ------------------------------------------------------------------ BWR
    bwr: {
      scram: 'REACTOR SCRAM', scramShort: 'SCRAM',
      initStates: [['full_power', 'Full Power'], ['post_scram_sbo', 'Post-Scram Station Blackout (Fukushima)']],
      defaultSeries: { power: true, level: true, vessel_p: true, recirc: true },
      gauges: [
        { id: 'power',    label: 'Reactor Power', lead: true, raw: function (s) { return s.instruments.power_range; }, units: '%', min: 0, max: 120, caution: 108, danger: 118, dp: 1 },
        { id: 'vessel_p', label: 'Vessel Pressure',  raw: function (s) { return s.instruments.vessel_pressure; }, dim: 'pressure', min: 0, max: 10.3, caution: 7.24, danger: 7.58, dp: 1 },
        { id: 'level',    label: 'Vessel Level',  raw: function (s) { return s.instruments.vessel_level; }, units: '%', min: 0, max: 100, caution_lo: 30, danger_lo: 10, dp: 0 },
        { id: 'recirc',   label: 'Recirculation Flow',   raw: function (s) { return s.instruments.recirc_flow; }, units: '%', min: 0, max: 120, dp: 0 },
        { id: 'void',     label: 'Core Void Fraction',     raw: function (s) { return s.instruments.core_void_fraction; }, units: '%', mul: 100, min: 0, max: 1, caution: 0.6, danger: 0.7, dp: 0 },
        { id: 'steam',    label: 'Steam Flow',    raw: function (s) { return s.instruments.steam_flow; }, units: '%', mul: 100, min: 0, max: 1.2, dp: 0 },
      ],
      series: [
        { id: 'power',    label: 'Power %',  c: '#6a90b0', get: function (i) { return i.power_range; }, range: [0, 120], dHi: 118, fmt: function (v) { return v.toFixed(0) + '%'; } },
        { id: 'level',    label: 'Level',    c: '#b07830', get: function (i) { return i.vessel_level; }, range: [0, 100], dLo: 10, fmt: function (v) { return v.toFixed(0) + '%'; } },
        { id: 'vessel_p', label: 'Vessel P', c: '#507048', get: function (i) { return i.vessel_pressure; }, range: [0, 8], dHi: 7.58, fmt: function (v) { return conv(v, 'pressure').toFixed(0); } },
        { id: 'recirc',   label: 'Recirc',   c: '#806890', get: function (i) { return i.recirc_flow; }, range: [0, 120], fmt: function (v) { return v.toFixed(0) + '%'; } },
        { id: 'void',     label: 'Void',     c: '#507878', get: function (i) { return i.core_void_fraction * 100; }, range: [0, 90], dHi: 70, fmt: function (v) { return v.toFixed(0) + '%'; } },
        { id: 'steam',    label: 'Steam',    c: '#707060', get: function (i) { return i.steam_flow * 100; }, range: [0, 120], fmt: function (v) { return v.toFixed(0) + '%'; } },
        { id: 'fw',       label: 'Feed',     c: '#506880', get: function (i) { return i.fw_flow * 100; }, range: [0, 120], fmt: function (v) { return v.toFixed(0) + '%'; } },
      ],
      numeric: [
        { title: 'Reactor / Core', rows: [
          { k: 'Power', inst: function (s) { return s.instruments.power_range.toFixed(1) + ' %'; }, truth: function (s) { return s.true_state.power_pct.toFixed(1) + ' %'; } },
          { k: 'Fuel Temp', truth: function (s) { return dispT(s.true_state.fuel_temp_c); } },
          { k: 'Core Void', inst: function (s) { return pctOf(s.instruments.core_void_fraction); }, truth: function (s) { return pctOf(s.true_state.core_void_fraction); } },
          { k: 'Decay Heat', truth: function (s) { return s.true_state.decay_heat_pct.toFixed(1) + ' %'; } },
          { k: 'Scrammed', inst: function (s) { return bool(s.rps_state.scrammed, 'YES', 'no'); } },
        ] },
        { title: 'Vessel', rows: [
          { k: 'Pressure', inst: function (s) { return dispP(s.instruments.vessel_pressure); }, truth: function (s) { return dispP(s.true_state.vessel_pressure_mpa); } },
          { k: 'Water Level', inst: function (s) { return s.instruments.vessel_level.toFixed(0) + ' %'; }, truth: function (s) { return s.true_state.vessel_level_pct.toFixed(0) + ' %'; } },
          { k: 'Steam Flow', inst: function (s) { return pctOf(s.instruments.steam_flow); } },
          { k: 'Feedwater Flow', inst: function (s) { return pctOf(s.instruments.fw_flow); } },
        ] },
        { title: 'Recirculation', rows: [
          { k: 'Recirc / Core Flow', inst: function (s) { return s.instruments.recirc_flow.toFixed(0) + ' %'; }, truth: function (s) { return s.true_state.recirc_flow_pct.toFixed(0) + ' %'; } },
        ] },
        { title: 'Safety Systems', rows: [
          { k: 'RCIC', inst: function (s) { return bool(s.instruments.rcic_status, 'running', 'off'); } },
          { k: 'HPCI', inst: function (s) { return bool(s.true_state.hpci_running, 'running', 'off'); } },
          { k: 'ADS', inst: function (s) { return bool(s.instruments.ads_open, 'OPEN', 'closed'); } },
          { k: 'LPCI', inst: function (s) { return bool(s.true_state.lpci_running, 'running', 'off'); } },
          { k: 'Core Spray', inst: function (s) { return bool(s.true_state.lpcs_running, 'running', 'off'); } },
          { k: 'Manual SRV', inst: function (s) { return bool(s.true_state.srv_manual_open, 'OPEN', 'closed'); } },
          { k: 'SLC (boron)', inst: function (s) { return bool(s.true_state.slc_active, 'active', 'standby'); } },
          { k: 'SLC Tank', truth: function (s) { return s.true_state.slc_tank_pct.toFixed(0) + ' %'; } },
          { k: 'Battery', truth: function (s) { return s.true_state.battery_charge_pct.toFixed(0) + ' %'; } },
        ] },
        { title: 'Status', rows: [
          { k: 'Station Blackout', inst: function (s) { return bool(s.instruments.station_blackout, 'YES', 'no'); } },
          { k: 'Destruction', truth: function (s) { return bool(s.true_state.melted, (s.true_state.destruction_cause || 'MELTED').toUpperCase().replace('_', ' '), 'none'); } },
        ] },
      ],
      controls: [
        { key: 'reactor', label: 'Reactor Core', groups: [ROD_DRIVE('control_rods'), ROD_SPEED(), SHUTDOWN_DRIVE('shutdown_rods')] },
        { key: 'recirc', label: 'Recirculation', groups: [
          { l: 'Recirc Drive Flow', hint: 'Recirculation flow — the BWR\'s main power control. More flow sweeps out voids ⇒ more power.', num: { id: 'bwrRecirc', min: 0, max: 48, value: 40, act: 'bwr-recirc-set', setL: 'Set %' } },
        ] },
        { key: 'safety', label: 'Safety Systems', groups: [
          { l: 'RCIC (steam-driven)', emergency: 1, hint: 'Reactor Core Isolation Cooling — steam-driven injection, runs without AC. Auto-starts on low level.', seg: [{ l: 'On', act: 'rcic-on', run: 1 }, { l: 'Off', act: 'rcic-off', on: 1 }] },
          { l: 'HPCI (steam-driven)', emergency: 1, hint: 'High-Pressure Coolant Injection — higher-capacity steam-driven injection.', seg: [{ l: 'On', act: 'hpci-on', run: 1 }, { l: 'Off', act: 'hpci-off', on: 1 }] },
          { l: 'ADS (depressurize)', emergency: 1, hint: 'Automatic Depressurization — blows the vessel down so low-pressure injection can begin. The key decision.', seg: [{ l: 'Trigger', act: 'trigger-ads', warn: 1 }] },
          { l: 'LPCI (low-press inject)', emergency: 1, hint: 'Low-Pressure Coolant Injection — large flow, works only after depressurization.', seg: [{ l: 'Start', act: 'start-lpci', run: 1 }] },
          { l: 'Core Spray (LPCS)', emergency: 1, hint: 'Low-Pressure Core Spray — sprays water onto the fuel from above; works once depressurized (same window as LPCI).', seg: [{ l: 'Start', act: 'start-lpcs', run: 1 }] },
          { l: 'Manual SRV (depressurize)', emergency: 1, hint: 'Manual safety/relief valve — controlled vessel depressurization to reach the low-pressure injection window when ADS/HPCI are unavailable.', seg: [{ l: 'Open', act: 'srv-open', warn: 1 }, { l: 'Close', act: 'srv-close', on: 1 }] },
          { l: 'Standby Liquid Control (SLC)', emergency: 1, hint: 'Standby Liquid Control — injects boron to shut the reactor down even if the rods will NOT insert (the ATWS mitigation).', seg: [{ l: 'Initiate', act: 'slc-initiate', warn: 1 }] },
        ] },
        { key: 'turbine', label: 'Turbine & Feed', groups: [
          { l: 'Turbine Load Target', num: { id: 'bwrMwe', min: 0, max: 1100, value: 1000, act: 'bwr-turbine-set', setL: 'Set MW' } },
          { l: 'Feedwater', num: { id: 'bwrFeed', min: 0, max: 100, value: 100, act: 'bwr-feed-set', setL: 'Set %' } },
        ] },
      ],
    },
  };

  // shared control-group factories (rods are a uniform command across plants)
  function ROD_DRIVE(group) {
    return { l: 'Control Bank', hint: 'Rod motion — HOLD Withdraw / Insert to drive the control bank at the selected speed; release to stop.',
      seg: [{ l: 'Withdraw', hold: 'rod-withdraw' }, { l: 'Insert', hold: 'rod-insert' }] };
  }
  function ROD_SPEED() {
    return { l: 'Rod Speed', hint: 'Rod speed — slow / normal / fast drive rate.',
      seg: [{ l: 'Slow', act: 'rodspeed-slow' }, { l: 'Norm', act: 'rodspeed-normal', on: 1 }, { l: 'Fast', act: 'rodspeed-fast' }],
      extra: [{ l: '+1', act: 'rod-nudge-out', title: 'withdraw 1 step' }, { l: '−1', act: 'rod-nudge-in', title: 'insert 1 step' }] };
  }
  // The shutdown / emergency-protection bank — normally parked fully withdrawn and
  // driven fully in automatically on a SCRAM. It IS operable (real startup pulls it
  // out first, a controlled shutdown drives it in), but the scram always overrides.
  function SHUTDOWN_DRIVE(group) {
    return { l: 'Shutdown Bank', emergency: 1,
      hint: 'Shutdown / scram bank — normally parked fully withdrawn. HOLD Insert to drive it in (adds shutdown margin, drops power), Withdraw to park it back out. A SCRAM drives it fully in automatically and overrides you.',
      seg: [{ l: 'Withdraw', hold: 'srod-withdraw' }, { l: 'Insert', hold: 'srod-insert' }] };
  }
  // RBMK Automatic Regulator (AR) — the fine power-regulation group, normally
  // run by the Automate channel; AUTO/MAN here mirrors that channel, and taking
  // the drive buttons switches it to MAN (manual control — the pre-Chernobyl
  // condition). The seg's on-state is synced from the channel each broadcast.
  function AR_DRIVE() {
    return { l: 'AR Rods (Auto Regulator)',
      hint: 'Automatic Regulator — the RBMK\'s fine power-control rods (~2 pcm/step vs the manual bank\'s ~35). AUTO holds power at the Automate-tab setpoint; MAN (or holding a drive button) is taking manual control, as the operators had before the Chernobyl test.',
      seg: [{ l: 'Auto', act: 'ar-auto', arsync: 'on' }, { l: 'Man', act: 'ar-man', arsync: 'off' },
            { l: 'Withdraw', hold: 'arod-withdraw' }, { l: 'Insert', hold: 'arod-insert' }] };
  }

  function prof() { return PROFILES[ui.plant]; }
  function rodGroup(s, fn) { return s.control_state.rod_groups.filter(function (x) { return x.function === fn; })[0]; }

  // Alarm → system category (UI-side keyword map across the three plants).
  function alarmCategory(id) {
    if (/flux|power|rod|orm|reactivity|az/.test(id)) return 'reactivity';
    if (/press|subcool|pzr|rcp|void|drum|vessel|level|flow|coolant/.test(id)) return 'coolant';
    if (/sg|turbine|cond|tavg|steam|recirc/.test(id)) return 'power';
    if (/sensor|indicator/.test(id)) return 'instrument';
    return 'safety_system';
  }

  // ============================================================ build static DOM
  function buildGauges() {
    var strip = $('gaugeStrip'); strip.innerHTML = ''; gaugeHist = {};
    prof().gauges.forEach(function (g) {
      var el = document.createElement('div');
      el.className = 'gauge' + (g.lead ? ' lead' : '');
      el.setAttribute('data-scanner-hint', g.label + ' — reads the instrument (lagged/noisy/fallible), not the true value.');
      el.innerHTML =
        '<div class="g-label"><span>' + g.label + '</span><span class="g-trend trend-flat" data-trend></span></div>' +
        '<div class="g-value" data-val>—</div>' +
        '<svg class="g-spark" viewBox="0 0 100 14" preserveAspectRatio="none"><polyline data-spark fill="none" stroke="#56657a" stroke-width="1.5"/></svg>' +
        '<div class="g-band"><span class="g-fill" data-fill style="display:none"></span><span class="needle" data-needle style="left:0%"></span></div>';
      el.id = 'gauge-' + g.id;
      strip.appendChild(el);
      gaugeHist[g.id] = [];
    });
  }

  function ctlGroup(g) {
    var el = document.createElement('div');
    el.className = 'cg' + (g.emergency ? ' emergency' : '');
    var inner = '<span class="cg-l">' + g.l + '</span><div class="cg-controls">';
    if (g.seg) {
      inner += '<div class="seg"' + (g.hint ? ' data-scanner-hint="' + esc(g.hint) + '"' : '') + '>';
      g.seg.forEach(function (b) {
        var attr = b.hold ? ' data-hold="' + b.hold + '"' : ' data-act="' + b.act + '"';   // hold = momentary (press-and-hold)
        if (b.arsync) attr += ' data-arsync="' + b.arsync + '"';   // AUTO/MAN mirror of an Automate channel (synced per broadcast)
        inner += '<button class="' + (b.on ? 'on ' : '') + (b.run ? 'run' : b.warn ? 'warn' : '') + '"' + attr + '>' + b.l + '</button>';
      });
      inner += '</div>';
      (g.extra || []).forEach(function (b) { inner += '<button class="btn" data-act="' + b.act + '"' + (b.title ? ' title="' + esc(b.title) + '"' : '') + '>' + b.l + '</button>'; });
    }
    if (g.num) {   // a control may have a slider AND buttons (e.g. a manual % + Auto)
      var n = g.num, cur = (ui.ctlVals[n.id] != null ? ui.ctlVals[n.id] : n.value);
      inner += '<input class="num-input mono" id="' + n.id + '" type="number" min="' + n.min + '" max="' + n.max + '" value="' + cur + '">' +
        '<button class="btn" data-act="' + n.act + '">' + (n.setL || 'Set') + '</button>';
    }
    inner += '</div>';
    el.innerHTML = inner;
    return el;
  }
  function esc(s) { return String(s).replace(/"/g, '&quot;'); }

  function buildGraphParams() {
    var box = $('graphParams'); box.innerHTML = '';
    prof().series.forEach(function (s) {
      var row = document.createElement('label'); row.className = 'param-row';
      row.innerHTML = '<input type="checkbox" data-series="' + s.id + '"' + (ui.series[s.id] ? ' checked' : '') + '>' +
        '<i style="background:' + s.c + '"></i>' + s.label;
      box.appendChild(row);
    });
  }

  function buildFailures() {
    var list = $('failList'); list.innerHTML = '';
    var cat = service.layer.getFailureCatalog();
    cat.forEach(function (f) {
      var row = document.createElement('div'); row.className = 'fail-row'; row.id = 'fail-' + f.id;
      var catShort = f.category === 'safety_system' ? 'safety' : f.category;
      var html = '<div class="fail-head"><button class="fail-toggle" data-fail="' + f.id + '">Inject</button>' +
        '<span class="fail-name">' + f.display + '</span><span class="fail-cat ' + f.category + '">' + catShort + '</span></div>';
      if (f.severity_meta) {
        var m = f.severity_meta;
        html += '<div class="fail-slider"><input type="range" min="0" max="100" value="' +
          Math.round((m.default - m.min) / (m.max - m.min) * 100) + '" data-sevfor="' + f.id + '">' +
          '<span class="sv mono" data-svlabel="' + f.id + '">' + m.label + ': ' + m.default + ' ' + m.unit + '</span></div>';
        row.setAttribute('data-meta', JSON.stringify(m));
      }
      row.innerHTML = html; list.appendChild(row);
    });
  }

  // ---- Advanced instrument failure (Failures tab) — fail any single instrument
  // while the plant behind it stays real (the HR1 teaching tool): stuck / drift /
  // noisy / dead via set_instrument_failure {instrument_id, mode, value}. The
  // snapshot doesn't surface per-instrument failure state, so the applied list is
  // tracked UI-side and reset with the plant (an engine reset clears them anyway).
  var advFailed = {};
  var ADV_MODES = {
    stuck: { vlabel: 'Freeze at', note: 'instrument units — blank = freeze at the current reading' },
    drift: { vlabel: 'Rate', note: 'instrument units per second (e.g. 0.05)', def: 0.05 },
    noisy: { vlabel: 'Multiplier', note: '× normal sensor noise (e.g. 5)', def: 5 },
    dead: null,   // no value — the reading bottoms out at range minimum
  };
  function buildAdvFail() {
    advFailed = {};
    var p = $('advFailPanel'); if (!p) return;
    var mp = manualProfile();
    var inds = (mp && mp.indications && mp.indications.length)
      ? mp.indications
      : Object.keys((latest && latest.instruments) || {}).map(function (k) { return { id: k, name: k }; });
    var opts = inds.map(function (i) { return '<option value="' + esc(i.id) + '">' + mesc(i.name || i.id) + '</option>'; }).join('');
    p.innerHTML =
      '<div class="row"><span class="k">Instrument</span><select id="advInstr">' + opts + '</select></div>' +
      '<div class="row"><span class="k">Mode</span><select id="advMode">' +
        '<option value="stuck">Stuck — frozen at a value</option>' +
        '<option value="drift">Drift — creeps away from truth</option>' +
        '<option value="noisy">Noisy — jitters around truth</option>' +
        '<option value="dead">Dead — bottoms out</option></select></div>' +
      '<div class="row" id="advValRow"><span class="k" id="advValLbl">Freeze at</span>' +
        '<input class="num-input mono" id="advVal" type="number" step="any"><span class="note" id="advValNote"></span></div>' +
      '<div class="actions"><button class="btn" id="advApply">Inject</button><button class="btn" id="advClearOne">Clear this instrument</button></div>' +
      '<div class="active-list" id="advActive"></div>';
    syncAdvVal();
  }
  function syncAdvVal() {
    var mode = $('advMode') ? $('advMode').value : 'stuck';
    var m = ADV_MODES[mode], row = $('advValRow');
    if (!row) return;
    row.style.display = m ? '' : 'none';
    if (m) {
      $('advValLbl').textContent = m.vlabel;
      $('advValNote').textContent = m.note;
      $('advVal').value = m.def != null ? m.def : '';
    }
  }
  function renderAdvActive() {
    var el = $('advActive'); if (!el) return;
    var ids = Object.keys(advFailed);
    el.textContent = ids.length
      ? '⚠ Failed: ' + ids.map(function (id) { return id + ' (' + advFailed[id] + ')'; }).join(', ')
      : '';
  }
  function advFailAction(apply) {
    var id = $('advInstr') && $('advInstr').value; if (!id) return;
    if (!apply) {
      cmd({ action: 'clear_instrument_failure', instrument_id: id });
      delete advFailed[id]; renderAdvActive(); return;
    }
    var mode = $('advMode').value, m = ADV_MODES[mode];
    var c = { action: 'set_instrument_failure', instrument_id: id, mode: mode };
    if (m) {
      var v = parseFloat($('advVal').value);
      if (!isNaN(v)) c.value = v;
      else if (mode !== 'stuck') c.value = m.def;   // stuck: blank = current reading
    }
    cmd(c);
    advFailed[id] = mode; renderAdvActive();
  }

  // What's running now (plant + free-play/scenario/walkthrough) — shown in the
  // Sim tab summary AND the always-visible status line under the sim controls
  // (the main-screen entry point to the Plant & Mission window). Called every
  // instructor render, so it's guarded to touch the DOM only on change.
  var lastSimSummary = null;
  function updateSimSummary() {
    var lbl = $('simPlantLbl'); if (!lbl) return;
    var e = ENGINES[ui.engineKey] || {};
    var plant = e.label || ui.engineKey;
    var mode;
    if (ui.scenario) {
      var sc = (RD.SCENARIOS || {})[ui.scenario];
      mode = 'Scenario — ' + ((sc && sc.title) || ui.scenario);
    } else if (ui.follow) {
      var pr = curFollowProc();
      mode = 'Walkthrough — ' + ((pr && pr.title) || ui.follow.id);
    } else {
      var st = (prof().initStates.filter(function (s) { return s[0] === ui.initState; })[0] || [])[1] || ui.initState;
      mode = 'Free Play — ' + st;
    }
    var key = plant + '|' + mode;
    if (key === lastSimSummary) return;
    lastSimSummary = key;
    lbl.textContent = plant;
    $('simModeLbl').textContent = mode;
    var st2 = $('simStatusText'); if (st2) st2.textContent = plant + ' · ' + mode;
  }

  // ============================================================ display damping
  function dampInstruments(s) {
    if (s.metadata.time_acceleration >= 60) { smoothed = {}; return; }
    var src = s.instruments, out = {}, k = DISPLAY_DAMP_K;
    for (var id in src) {
      var v = src[id];
      if (typeof v === 'number' && isFinite(v)) {
        smoothed[id] = (smoothed[id] == null) ? v : smoothed[id] + k * (v - smoothed[id]);
        out[id] = smoothed[id];
      } else out[id] = v;
    }
    s.instruments = out;
  }

  // ============================================================ render snapshot
  function render(s) {
    latest = s;
    dampInstruments(s);
    $('clock').textContent = 'T+' + hms(s.metadata.sim_time);
    $('clock').classList.toggle('running', s.metadata.running);
    $('clock').classList.toggle('accel', s.metadata.time_acceleration > 1);

    // Cross-plant transition guard: when a scenario switches the plant (e.g.
    // a ?scenario= deep link), the new plant's first snapshots can land while
    // ui.plant / the gauge-chart profile still describe the old one — every
    // profile-bound reader would throw on the foreign instrument set. Catch
    // up the UI instead of rendering the mismatch.
    var snapPlant = s.metadata.plant_id;
    if (snapPlant && ui.plant && snapPlant !== ui.plant) { afterPlantChange(); return; }

    applyUiPolicy(s);
    renderGauges(s);
    renderAlarms(s); renderInstructor(s); renderReactimeter(s); renderFailures(s);
    updateSimSummary();
    // alarm tint on the CSF gauge strip while anything is unacknowledged
    $('gaugeStrip').classList.toggle('alarm-tint', s.alarms.some(function (a) { return a.state === 'active_unacknowledged'; }));
    // auto-switch to Diagram the moment a scram fires (legacy views only).
    // Reads the rps_scrammed STATUS INSTRUMENT (HR1) — it reflects manual
    // scrams too, unlike rps_state.scrammed which latches only on trips.
    var scramInd = !!(s.instruments.rps_scrammed != null ? s.instruments.rps_scrammed : s.rps_state.scrammed);
    if (ui.plant !== 'pwr' && scramInd && !lastScrammed && ui.view !== 'diagram') setView('diagram');
    renderPlantDisplay(s);
    lastScrammed = scramInd;

    // Time moved backwards (a rewind, or a walkthrough/scenario reset): drop the
    // branch of history that no longer exists and snap the gauge smoothing —
    // easing a display value across a time jump shows numbers that were never real.
    if (chartBuf.length && chartBuf[chartBuf.length - 1].t > s.metadata.sim_time + 1e-9) smoothed = {};
    while (chartBuf.length && chartBuf[chartBuf.length - 1].t > s.metadata.sim_time + 1e-9) chartBuf.pop();
    chartBuf.push({ t: s.metadata.sim_time, ins: Object.assign({}, s.instruments) });
    var cutoff = s.metadata.sim_time - ui.window;
    while (chartBuf.length > 2 && chartBuf[0].t < cutoff) chartBuf.shift();
    drawChart();
  }

  function gaugeState(g, raw) {
    if (g.danger != null && raw >= g.danger) return 'alarm';
    if (g.danger_lo != null && raw <= g.danger_lo) return 'alarm';
    if (g.caution != null && raw >= g.caution) return 'warn';
    if (g.caution_lo != null && raw <= g.caution_lo) return 'warn';
    return 'normal';
  }
  function renderGauges(s) {
    prof().gauges.forEach(function (g) {
      var root = $('gauge-' + g.id); if (!root) return;
      var raw;
      // A cross-plant transition (e.g. a ?scenario= deep link that switches
      // the plant) can deliver one snapshot from the NEW plant to the OLD
      // profile's gauges — read defensively or the whole render pass dies.
      try { raw = g.raw(s); } catch (e) { raw = null; }
      if (raw == null || isNaN(raw)) { root.querySelector('[data-val]').textContent = '—'; return; }
      var st = gaugeState(g, raw);
      root.classList.toggle('warn', st === 'warn');
      root.classList.toggle('alarm', st === 'alarm');
      var disp = g.dim ? conv(raw, g.dim) : raw * (g.mul || 1);
      var units = g.dim ? unit(g.dim) : g.units;
      root.querySelector('[data-val]').innerHTML = disp.toFixed(g.dp) + '<span class="g-units"> ' + units + '</span>';
      var frac = (raw - g.min) / (g.max - g.min), cf = Math.max(0, Math.min(1, frac));
      root.querySelector('[data-needle]').style.left = (cf * 100) + '%';
      // single dim bar track; colored fill (to the needle) only when in a band
      var fill = root.querySelector('[data-fill]');
      if (st !== 'normal') { fill.style.display = 'block'; fill.style.width = (cf * 100) + '%'; fill.style.background = st === 'alarm' ? 'var(--bar-alarm)' : 'var(--bar-warn)'; }
      else fill.style.display = 'none';
      // trend + sparkline
      var h = gaugeHist[g.id]; h.push(raw); if (h.length > 40) h.shift();
      var tr = root.querySelector('[data-trend]');
      if (h.length > 4) {
        var d = h[h.length - 1] - h[h.length - 5], thr = Math.abs(g.max - g.min) * 0.002;
        tr.textContent = d > thr ? '▲' : d < -thr ? '▼' : '▶';
        tr.className = 'g-trend ' + (d > 0 ? 'trend-up' : d < 0 ? 'trend-down' : 'trend-flat');
      }
      var mn = Math.min.apply(null, h), mx = Math.max.apply(null, h), rng = (mx - mn) || 1;
      var pts = h.map(function (v, i) { return (i / Math.max(1, h.length - 1) * 100).toFixed(1) + ',' + (13 - (v - mn) / rng * 12).toFixed(1); }).join(' ');
      root.querySelector('[data-spark]').setAttribute('points', pts);
    });
  }

  // Quiet board: color reserved for DEVIATION. Abnormal (open/stopped/yes) → red;
  // off-normal-but-not-failed actuation (active/on) → amber; everything normal
  // (closed/running/no/off/standby) stays dim. No green for "currently fine".
  function boolClass(word) {
    var w = String(word).toLowerCase();
    if (/open|stopped|yes/.test(w)) return 'q-alarm';
    if (/^active$|^on$/.test(w)) return 'q-caution';
    return 'q-normal';
  }

  function renderReactimeter(s) {
    var t = s.true_state;
    var sgn = function (v) { return (v >= 0 ? '+' : '') + v; };
    $('rxReactivity').textContent = t.reactivity_pcm != null ? sgn(t.reactivity_pcm.toFixed(0)) + ' pcm' : '— pcm';
    var per = t.reactor_period_s;
    $('rxPeriod').textContent = per == null ? '— (PWR only)' : (!isFinite(per) || Math.abs(per) > 9999) ? '∞ (steady)' : per.toFixed(0) + ' s';
  }

  function renderAlarms(s) {
    var stack = $('alarmStack');
    var active = s.alarms.filter(function (a) { return a.state !== 'clear'; });
    var prio = { critical: 0, warning: 1, caution: 2, status: 3 };
    active.sort(function (a, b) { return (prio[a.priority] - prio[b.priority]); });
    var nUnack = active.filter(function (a) { return a.state === 'active_unacknowledged'; }).length;
    var title = $('alarmTitle');
    if (title) title.textContent = nUnack ? 'Alarms (' + nUnack + ')' : 'Alarms';
    if (!active.length) { stack.innerHTML = '<div class="alarm-empty">— no active alarms —</div>'; return; }
    stack.innerHTML = active.map(function (a) {
      var cat = alarmCategory(a.id);
      var sev = a.priority === 'critical' ? 'crit' : a.priority === 'warning' ? 'warn' : '';
      var unack = a.state === 'active_unacknowledged' ? ' unack' : '';
      var glyph = a.priority === 'critical' ? '⚠' : a.priority === 'warning' ? '△' : '●';
      // Unacknowledged tiles carry an explicit ACK chip — the whole tile is the
      // click target, but the affordance must be visible without the scanner.
      var chip = unack ? '<span class="ack-chip">ACK</span>' : '';
      return '<div class="alarm-tile ' + sev + unack + ' cat-' + cat + '" data-ack="' + a.id +
        '" data-scanner-hint="' + esc(a.tile_label) + ' — ' + a.priority + ' alarm (' + cat + '). Reads the instrument; click to acknowledge.">' +
        '<div class="bar"></div><div class="body"><div class="label">' + a.tile_label +
        '</div><div class="meta">' + cat + ' · ' + a.priority + ' · ' + a.state.replace('active_', '') + '</div></div>' +
        chip + '<div class="glyph">' + glyph + '</div></div>';
    }).join('');
  }

  // The Instructor can change time acceleration (beat `speed` — fast-forward in,
  // drop out at a set point); keep the speed seg + FF badge honest.
  var SPEED_SNAP_MSG = {
    scram: 'Dropped to real time — reactor trip',
    failure: 'Dropped to real time — equipment failure',
    alarm: 'Dropped to real time — new alarm',
  };
  var lastSpeedSync = null;
  function syncSpeedUI(s) {
    var v = s && s.metadata ? s.metadata.time_acceleration : null;
    // Attention stop (M5): a plant event snapped fast-forward back to real time.
    // Toast the reason so the operator knows why the clock changed under them.
    var snap = s && s.metadata ? s.metadata.speed_snap : null;
    if (snap) showToast(SPEED_SNAP_MSG[snap.reason] || 'Dropped to real time', 'error');
    if (v == null || v === lastSpeedSync) return;
    lastSpeedSync = v;
    var seg = $('speed');
    if (seg) seg.querySelectorAll('[data-speed]').forEach(function (b) { b.classList.toggle('on', +b.getAttribute('data-speed') === v); });
    var fb = $('ffBadge');
    if (fb) { var fast = v >= 600; fb.style.display = fast ? 'block' : 'none'; if (fast) fb.textContent = '⚡ ' + v + '×'; }
  }

  // ---- Scenario ui_policy (TMI-2 M5) — a scenario may drive the synoptic mode
  // (Realistic quiet board vs Learning full-color), the physics overlay, and the
  // maintenance-tag prop. The player's own Settings choices are saved on entry
  // and restored when the scenario unloads.
  var uiPolicyPrev = null;
  function applyUiPolicy(s) {
    var active = s.instructor && s.instructor.scenario_id;
    var ip = active ? s.instructor.ui_policy : null;
    var syn = ip && ip.synoptic;
    if (syn) {
      if (!uiPolicyPrev) uiPolicyPrev = { diagMode: ui.diagMode, physOverlay: ui.physOverlay };
      var want = syn === 'realistic' ? 'realistic' : 'learning';
      var wantOv = want === 'learning' && !!ip.overlay;
      if (ui.diagMode !== want || ui.physOverlay !== wantOv) {
        ui.diagMode = want; ui.physOverlay = wantOv; syncOverlayRow();
      }
    } else if (uiPolicyPrev) {
      ui.diagMode = uiPolicyPrev.diagMode; ui.physOverlay = uiPolicyPrev.physOverlay;
      uiPolicyPrev = null; syncOverlayRow();
    }
    // Scenario prop: the maintenance tag over the AFW valve indication. Hidden
    // once its interaction is granted (the tag comes off the valve).
    if (RD.PwrSynoptic && RD.PwrSynoptic.setTag) {
      var tagId = ip && ip.tag;
      var chat = s.instructor && s.instructor.chat;
      var granted = !!(tagId && chat && chat.interactions && chat.interactions[tagId] &&
                       chat.interactions[tagId].granted);
      RD.PwrSynoptic.setTag(tagId || null, !!tagId && !granted);
    }
  }

  var lastInstrMsg = null;
  // Commentary min-dwell (playtest fix): the instructor layer keeps only its
  // LATEST message, so a fast beat sequence used to replace a card mid-read
  // and the text was gone for good. The UI now holds each card until a
  // ~220 wpm reader could finish it (capped at 16 s) and queues later cards
  // in arrival order. Blocked-command feedback bypasses the dwell — the
  // player just clicked and the answer must be immediate.
  var msgHold = { shown: null, at: 0, queue: [], bypass: false };
  function msgDwellS(t) { return Math.min(16, String(t).trim().split(/\s+/).length / 3.7 + 0.8); }
  function resetInstrFlow() { msgHold.shown = null; msgHold.at = 0; msgHold.queue = []; msgHold.bypass = false; lastInstrMsg = null; }
  // The instructor card's button rows are contextual — a button that can act is
  // shown, one that can't doesn't exist on screen (no false affordances):
  //   follow   → the walkthrough nav row (Prev / Next / Rewind / ↺ / ✕)
  //   scenario → the Acknowledge (continue) + Rewind row
  //   chat / level-complete / free play → neither (those render their own buttons)
  function syncInstrNav(mode) {
    var nav = $('instrNav'), ack = $('instrAckRow');
    if (nav) nav.hidden = mode !== 'follow';
    if (ack) ack.hidden = mode !== 'scenario';
  }
  function renderInstructor(s) {
    // Rewind is live whenever a checkpoint exists (beats / follow steps / sandbox).
    var noCp = !(service && service.checkpoints && service.checkpoints.length);
    document.querySelectorAll('[data-fnav="rewind"]').forEach(function (rw) { rw.disabled = noCp; });
    var crw = $('chartRewindBtn');
    if (crw) crw.disabled = noCp;
    syncSpeedUI(s);
    renderHighlight(s);
    updateSimSummary();   // status line follows scenario/walkthrough transitions (change-guarded)
    // Follow state is derived FROM the snapshot (the Instructor owns it); ui.follow
    // is just a synced mirror. This survives start_follow's internal plant reset,
    // save/load restores, and anything else that broadcasts mid-transition.
    var fb = s.instructor && s.instructor.follow;
    if (fb) { ui.follow = { id: fb.procedure_id }; syncInstrNav('follow'); renderFollow(s); return; }
    if (ui.follow) ui.follow = null;              // the snapshot says the follow ended
    // Chat-mode scenarios (TMI-2 M5): a scrolling multi-speaker transcript
    // replaces the single-slot commentary card. Level-complete renders inline.
    if (s.instructor && s.instructor.chat) { syncInstrNav('chat'); renderChat(s); return; }
    if (chatState.sid) resetChat();
    var lc = s.instructor && s.instructor.level_complete;
    if (lc) { syncInstrNav('lc'); msgHold.queue = []; msgHold.shown = null; renderLevelComplete(s, lc); return; }
    syncInstrNav(ui.scenario ? 'scenario' : 'idle');
    lastLcKey = null;
    var cur = $('instrCurrent');
    var msg = (s.instructor && s.instructor.message) ? s.instructor.message : null;
    if (msg && msg !== lastInstrMsg) {
      if (msgHold.bypass) { msgHold.queue = []; msgHold.shown = null; msgHold.bypass = false; }
      if (msg !== msgHold.shown && msgHold.queue.indexOf(msg) === -1) {
        msgHold.queue.push(msg);
        if (msgHold.queue.length > 3) msgHold.queue.shift();   // never lag reality by more than 3 cards
      }
    }
    lastInstrMsg = msg;
    var now = Date.now() / 1000;
    var dwellMet = !msgHold.shown || (now - msgHold.at) >= msgDwellS(msgHold.shown);
    if (msgHold.queue.length && dwellMet) {
      msgHold.shown = msgHold.queue.shift();
      msgHold.at = now;
      cur.textContent = msgHold.shown; cur.classList.remove('instr-standby');
      setFocus('instructor');
    } else if (!msg && !msgHold.queue.length && dwellMet) {
      if (msgHold.shown !== null || cur.textContent !== 'Standing by…') {
        msgHold.shown = null;
        cur.textContent = 'Standing by…'; cur.classList.add('instr-standby');
      }
    }
  }

  // ============================================================ chat mode (TMI-2 M5)
  // Renders instructor.chat: a persistent multi-speaker transcript with an
  // in-fiction shift clock, elapsed-time dividers on AUTHORED time skips only,
  // and the pending beat's chat button (acknowledge or fast-forward).
  // Lines REVEAL ONE AT A TIME on a real-time reading cadence (conversation,
  // not a dump) — display-only pacing; the engine's log is untouched.
  var chatState = { sid: null, shown: 0, nextAt: 0, instantThrough: 0, rev: -1, reg: null, storySec: null, lastT: null, btnKey: null, skipBid: null, lcKey: null };
  function resetChat() {
    chatState = { sid: null, shown: 0, nextAt: 0, instantThrough: 0, rev: -1, reg: null, storySec: null, lastT: null, btnKey: null, skipBid: null, lcKey: null };
    var card = $('instructorCard');
    if (card) card.classList.remove('chat-mode');
  }
  var CHAT_SPEAKERS = {
    sup: 'Shift Supervisor', supx: 'Shift Supervisor', aux: 'Aux Operator',
    chief: 'Chief', sys: 'ANNUNCIATOR', player: 'You',
  };
  // In-fiction wall clock: the shift picks up at 03:53 — the real TMI-2 turbine
  // trip landed at 04:00:37, seven minutes into anyone's coffee. The clock runs
  // on the authored STORY timeline (beat `story_min` anchors) so the historical
  // durations survive the sim's compression — the "it took 80 minutes" numbers
  // are part of the lesson (Spec §2.2 guardrail). Entries without an anchor
  // advance the story clock by elapsed sim time since the previous entry.
  function chatStorySec(e) {
    if (e.story != null) {
      chatState.storySec = e.story * 60;
    } else if (chatState.storySec != null && chatState.lastT != null) {
      chatState.storySec += Math.max(0, e.t - chatState.lastT);
    } else {
      chatState.storySec = 0;
    }
    chatState.lastT = e.t;
    return chatState.storySec;
  }
  function chatClock(storySec) {
    var secs = 3 * 3600 + 53 * 60 + Math.max(0, storySec);
    var h = Math.floor(secs / 3600) % 24, m = Math.floor((secs % 3600) / 60);
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }
  function chatGapText(gapSec) {
    var min = Math.round(gapSec / 60);
    if (min >= 55) {
      var hr = Math.round(min / 30) / 2;
      return 'about ' + (hr === Math.floor(hr) ? hr : hr.toFixed(1)) + ' hour' + (hr > 1 ? 's' : '') + ' pass' + (hr > 1 ? '' : 'es');
    }
    return min < 2 ? 'a couple of minutes pass' : 'about ' + min + ' minutes pass';
  }
  function chatLineHtml(e) {
    var txt = e[ui.register] || e.learning || '';
    var prevStory = chatState.storySec;
    var story = chatStorySec(e);
    var h = '';
    // Elapsed-time dividers ONLY on authored skips (beat `time_skip: true`) —
    // an ordinary continuous conversation never shows an artificial time jump,
    // however far the story clock drifts (the timestamps carry the drift).
    if (e.skip && prevStory != null && (story - prevStory) > 90) {
      h += '<div class="chat-gap">⏱ ' + mesc(chatGapText(story - prevStory)) + '</div>';
    }
    h += '<div class="chat-line chat-' + mesc(e.speaker) + '">' +
      '<span class="chat-meta">' + chatClock(story) + ' · ' + mesc(CHAT_SPEAKERS[e.speaker] || e.speaker) + '</span>' +
      '<span class="chat-txt">' + mesc(txt) + '</span></div>';
    return h;
  }
  // Reading cadence for the one-at-a-time reveal (~220 wpm), clamped so short
  // annunciator callouts don't flash past and long lines don't stall the flow.
  function chatDwellS(e) {
    var w = String(e.learning || '').trim().split(/\s+/).length;
    return Math.min(7, Math.max(1.0, w / 3.7 + 0.4));
  }
  function chatPendingBeat(s) {
    var sid = s.instructor.scenario_id, bid = s.instructor.current_beat_id;
    var sc = sid && RD.SCENARIOS ? RD.SCENARIOS[sid] : null;
    if (!sc || bid == null) return null;
    var beats = sc.beats || [];
    for (var i = 0; i < beats.length; i++) if (beats[i].id === bid) return beats[i];
    return null;
  }
  function renderChat(s) {
    var chat = s.instructor.chat;
    var sid = s.instructor.scenario_id;
    var card = $('instructorCard');
    var cur = $('instrCurrent');
    var rebuild = chatState.sid !== sid || chatState.reg !== ui.register ||
      chat.log.length < chatState.shown || !$('chatLog');
    if (rebuild) {
      var freshConversation = chatState.sid !== sid && chat.log.length <= 4;
      resetChat();
      chatState.sid = sid; chatState.reg = ui.register;
      // Backlog policy: a rebuild over existing history (register switch, a
      // restored save) shows the past instantly and paces only what follows;
      // a genuinely new conversation paces from its first line.
      chatState.instantThrough = freshConversation ? 0 : Math.max(0, chat.log.length - 1);
      cur.classList.remove('instr-standby');
      cur.innerHTML = '<div class="chat-log" id="chatLog"></div><div class="chat-btns" id="chatBtns"></div>';
      if (card) card.classList.add('chat-mode');
    }
    var logEl = $('chatLog');
    // One-at-a-time reveal on a real-time reading cadence. Player-outgoing
    // bubbles appear immediately (they ARE the player's click); everything
    // else waits its turn behind the line being read.
    var now = Date.now() / 1000;
    var revealed = false;
    while (chatState.shown < chat.log.length) {
      var e = chat.log[chatState.shown];
      var instant = chatState.shown < chatState.instantThrough || e.speaker === 'player';
      if (!instant && now < chatState.nextAt) break;
      logEl.insertAdjacentHTML('beforeend', chatLineHtml(e));
      chatState.shown++;
      chatState.nextAt = now + (instant ? 0.8 : chatDwellS(e));
      revealed = true;
    }
    if (revealed) {
      logEl.scrollTop = logEl.scrollHeight;
      setFocus('instructor');
    }
    chatState.rev = chat.rev;
    var unrevealed = chatState.shown < chat.log.length;
    // Buttons / level-complete zone under the transcript — held back until the
    // conversation has fully played out (no acknowledging unread dialogue).
    var btns = $('chatBtns');
    if (unrevealed) {
      if (chatState.btnKey !== '__revealing__') { chatState.btnKey = '__revealing__'; btns.innerHTML = ''; }
      return;
    }
    var lc = s.instructor.level_complete;
    if (lc) {
      var lcKey = lc.title + '|' + lc.outcome + '|' + (lc.actions || []).join(',');
      if (lcKey !== chatState.lcKey) {
        chatState.lcKey = lcKey; chatState.btnKey = null;
        recordCompletion();
        var ab = (lc.actions || []).map(function (a) {
          var lbl = a === 'continue' ? 'Continue' : a === 'retry' ? '↺ Retry' : '⏪ Rewind';
          return '<button class="btn" data-lc="' + a + '">' + lbl + '</button>';
        }).join(' ');
        btns.innerHTML = '<div class="lc-panel"><div class="lc-title">🏁 ' + mesc(lc.title) + '</div>' +
          (lc.outcome ? '<div class="m-note">' + mesc(lc.outcome) + '</div>' : '') +
          '<div class="lc-actions">' + ab + '</div></div>';
        logEl.scrollTop = logEl.scrollHeight;
      }
      return;
    }
    chatState.lcKey = null;
    var beat = chatPendingBeat(s);
    var cb = beat && beat.chat_button;
    var bid = beat ? beat.id : null;
    if (chatState.skipBid && chatState.skipBid !== bid) chatState.skipBid = null;
    var key = bid + '|' + (cb ? cb.style : '') + '|' + ui.register + '|' + (chatState.skipBid === bid);
    if (key === chatState.btnKey) return;
    chatState.btnKey = key;
    if (!cb || (cb.style === 'skip' && chatState.skipBid === bid)) {
      btns.innerHTML = (cb && cb.style === 'skip')
        ? '<div class="chat-ff">⏩ running ahead — the board will pull us back</div>' : '';
      return;
    }
    var label = cb['label_' + ui.register] || cb.label || (cb.style === 'skip' ? 'Wait' : 'Ready');
    btns.innerHTML = '<button class="btn chat-btn chat-btn-' + mesc(cb.style || 'ack') +
      '" data-chatbtn="' + mesc(cb.style || 'ack') + '" data-chatspeed="' + (cb.speed || 60) + '">' +
      mesc(label) + '</button>';
  }
  function chatButtonAction(style, speed) {
    chatState.nextAt = 0;   // the click says "read" — release the reveal queue
    if (style === 'skip') {
      var s = latest, beat = s && s.instructor && chatPendingBeat(s);
      chatState.skipBid = beat ? beat.id : null;
      chatState.btnKey = null;
      cmd({ action: 'set_speed', value: speed || 60 });
      if (latest) renderChat(latest);
      return;
    }
    cmd({ action: 'instructor_continue' });
  }

  // ---- Instructor highlight (Gameplay §5) — glow the control the current beat /
  // follow step points at, auto-revealing the tab or view that hides it (F8 fix).
  var lastHighlightKey = null;
  function renderHighlight(s) {
    var hl = s && s.instructor && s.instructor.highlight;
    var key = hl ? JSON.stringify(hl) : null;
    if (key === lastHighlightKey) return;
    lastHighlightKey = key;
    document.querySelectorAll('.instr-glow').forEach(function (el) { el.classList.remove('instr-glow'); });
    if (!hl) return;
    var el = null;
    if (hl.control_label) {
      el = ui.plant === 'pwr'
        ? (RD.PwrSynoptic && RD.PwrSynoptic.isMounted() ? RD.PwrSynoptic.revealControl(hl.control_label) : null)
        : findPdControl(hl.control_label, hl.view);
    }
    if (!el && hl.instrument_id) el = $('gauge-' + hl.instrument_id);
    if (el) el.classList.add('instr-glow');
  }
  // Locate a control group on the RBMK/BWR plant display by its .cg-l label,
  // switching to the owning view tab when it is not on the active one.
  function findPdControl(label, viewHint) {
    if (label === 'SCRAM' || label === 'AZ-5') return $('pdScram');
    function onBar() {
      var els = document.querySelectorAll('#pdCtlRow .cg-l');
      for (var i = 0; i < els.length; i++) if (els[i].textContent.trim() === label) return els[i].closest('.cg');
      return null;
    }
    var el = onBar();
    if (el) return el;
    var views = viewHint ? [viewHint] : ['primary', 'secondary'];
    for (var v = 0; v < views.length; v++) {
      var groups = viewControls(views[v]);
      for (var g = 0; g < groups.length; g++) {
        if (groups[g].l === label) { setView(views[v]); return onBar(); }
      }
    }
    return null;
  }

  // ---- Level Complete (Gameplay §7.3) — a scenario/walkthrough finished; offer
  // Continue (dismiss) / Retry / Rewind per the beat's authored action set.
  var lastLcKey = null;
  function renderLevelComplete(s, lc) {
    var key = lc.title + '|' + lc.outcome + '|' + (lc.actions || []).join(',');
    if (key === lastLcKey) return;      // keep the buttons stable across renders
    lastLcKey = key;
    recordCompletion();                 // progression (hook flag, completed lists)
    var btns = (lc.actions || []).map(function (a) {
      var lbl = a === 'continue' ? 'Continue' : a === 'retry' ? '↺ Retry' : '⏪ Rewind';
      return '<button class="btn" data-lc="' + a + '">' + lbl + '</button>';
    }).join(' ');
    // The endpoint beat's commentary used to be covered instantly by this
    // panel — every mission's payoff paragraph went unread (playtest fix).
    var msg = s && s.instructor && s.instructor.message;
    var cur = $('instrCurrent'); cur.classList.remove('instr-standby');
    cur.innerHTML = (msg ? '<div class="lc-msg">' + mesc(msg) + '</div>' : '') +
      '<div class="lc-panel"><div class="lc-title">🏁 ' + mesc(lc.title) + '</div>' +
      (lc.outcome ? '<div class="m-note">' + mesc(lc.outcome) + '</div>' : '') +
      '<div class="lc-actions">' + btns + '</div></div>';
    setFocus('instructor');
  }
  function levelCompleteAction(a) {
    // Reset the commentary queue on rewind: without this, cards from the
    // abandoned timeline churn through the dwell queue after each press
    // (seen in the az5 rematch playthrough).
    if (a === 'rewind') { lastLcKey = null; resetInstrFlow(); cmd({ action: 'rewind', steps: 1 }); return; }
    if (a === 'retry') {
      lastLcKey = null;
      if (ui.follow) { followRetry(); return; }
      if (ui.scenario) { startScenario(ui.scenario); return; }
      return;
    }
    // continue — if this was a campaign mission, chain straight into the next
    // one (the Learn→Apply loop stays unbroken); otherwise dismiss to free play.
    lastLcKey = null;
    var finished = ui.scenario || (ui.follow && ui.follow.id);
    if (ui.follow) { ui.follow = null; cmd({ action: 'stop_follow' }); }
    else { ui.scenario = null; cmd({ action: 'stop_scenario' }); }
    var c = campaign();
    if (c && finished && campaignMissions(c).some(function (m) { return m.id === finished; })) {
      var nxt = campaignFrontier();
      if (nxt) { startMission(nxt); buildTraining(); return; }
    }
    if (latest) renderInstructor(latest);
  }
  // Retry a walkthrough — start_follow itself resets to the procedure's `from` state.
  function followRetry() {
    var pr = curFollowProc(); if (!pr) return;
    chartBuf = []; smoothed = {};
    cmd({ action: 'start_follow', procedure_id: pr.id });
    buildAutomate();
    setFocus('instructor', true);
  }

  // ---- Progression persistence (Gameplay §7.5) — one localStorage key,
  // guarded for file:// and storage-disabled environments.
  function progress() {
    try { return JSON.parse(localStorage.getItem('rd_progress')) || {}; } catch (e) { return {}; }
  }
  function saveProgress(patch) {
    try {
      var p = progress();
      Object.keys(patch).forEach(function (k) { p[k] = patch[k]; });
      localStorage.setItem('rd_progress', JSON.stringify(p));
    } catch (e) { /* progression simply doesn't persist */ }
  }
  function recordCompletion() {
    var p = progress();
    if (ui.scenario) {
      var cs = p.completed_scenarios || [];
      if (cs.indexOf(ui.scenario) === -1) cs.push(ui.scenario);
      var patch = { completed_scenarios: cs };
      if (ui.scenario === 'pwr_hook') patch.hook_done = true;
      saveProgress(patch);
    } else if (ui.follow) {
      var cp = p.completed_procedures || [];
      if (cp.indexOf(ui.follow.id) === -1) { cp.push(ui.follow.id); saveProgress({ completed_procedures: cp }); }
    }
    buildTraining();
  }

  // ---- Campaign (Path 3 wrapper — Blueprint/pwr_training_campaign.md) ----
  // Missions reference scenarios / procedures by id; completion derives from
  // the same rd_progress record recordCompletion() already writes. Every
  // mission is playable from the start (user direction, 2026-07-07): the
  // campaign is a recommended ORDER with progress markers, not a gate.
  // Helpers take an optional engine key so the Plant & Mission window can show
  // a plant that isn't the active one; default is the running engine.
  function campaign(key) { return (RD.CAMPAIGNS || {})[ENGINES[key || ui.engineKey].plant] || null; }
  function campaignMissions(c) {
    var out = [];
    (c.acts || []).forEach(function (a) { a.missions.forEach(function (m) { out.push(m); }); });
    return out;
  }
  function missionArtifact(m, key) {
    if (m.kind === 'scenario') return (RD.SCENARIOS || {})[m.id] || null;
    return (((RD.MANUAL_PROCEDURES || {})[key || ui.engineKey]) || []).filter(function (x) { return x.id === m.id; })[0] || null;
  }
  function missionDone(m, p) {
    var list = m.kind === 'scenario' ? (p.completed_scenarios || []) : (p.completed_procedures || []);
    return list.indexOf(m.id) !== -1;
  }
  function startMission(m) {
    if (m.kind === 'scenario') startScenario(m.id); else followProcedure(m.id);
  }
  // The next incomplete mission (the "frontier"), or null when all complete.
  function campaignFrontier(key) {
    var c = campaign(key); if (!c) return null;
    var p = progress();
    var ms = campaignMissions(c);
    for (var i = 0; i < ms.length; i++) if (!missionDone(ms[i], p)) return ms[i];
    return null;
  }
  function campaignHtml(key) {
    var c = campaign(key);
    if (!c) return '<div class="m-note">No campaign for this plant yet — try the PWR.</div>';
    var p = progress();
    var ms = campaignMissions(c);
    var doneCount = ms.filter(function (m) { return missionDone(m, p); }).length;
    var frontier = null;
    var h = '<div class="camp-head"><div class="camp-title">' + mesc(c.title) + '</div>' +
      '<div class="m-note">' + mesc(c.tagline) + '</div>' +
      '<div class="camp-progress"><span class="mono">' + doneCount + ' / ' + ms.length + ' missions</span>' +
      '<div class="camp-bar"><div class="camp-fill" style="width:' + (ms.length ? Math.round(100 * doneCount / ms.length) : 0) + '%"></div></div></div>';
    if (doneCount < ms.length) h += '<button class="btn camp-continue" data-camp-continue="1">▶ ' + (doneCount ? 'Continue campaign' : 'Begin campaign') + '</button>';
    else h += '<div class="camp-done">🏆 Campaign complete — Senior Reactor Operator</div>';
    h += '</div>';
    (c.acts || []).forEach(function (a) {
      h += '<div class="camp-act">' + mesc(a.title) + '</div>';
      a.missions.forEach(function (m) {
        var art = missionArtifact(m, key);
        var title = m.title || (art && art.title) || m.id;
        var done = missionDone(m, p);
        // Everything is playable from the start (user direction): the campaign
        // is a recommended ORDER, not a gate. The frontier marker (▶) still
        // shows "you are here"; undone later missions get ○.
        var isFrontier = !done && !frontier; if (isFrontier) frontier = m;
        var mark = done ? '✓' : (isFrontier ? '▶' : '○');
        h += '<div class="camp-mission' + (done ? ' done' : isFrontier ? ' next' : '') + '">' +
          '<span class="camp-mark">' + mark + '</span>' +
          '<span class="camp-mtitle">' + mesc(title) + '</span>' +
          (m.teaches ? '<span class="camp-teaches">' + mesc(m.teaches) + '</span>' : '') +
          '<button class="btn" data-camp-start="' + m.kind + ':' + m.id + '">' + (done ? '↺ Replay' : '▶ Start') + '</button>' +
          '</div>';
      });
    });
    if (c.bonus && c.bonus.length) {
      h += '<div class="camp-act">Bonus</div>';
      c.bonus.forEach(function (m) {
        var art = missionArtifact(m, key);
        h += '<div class="camp-mission">' +
          '<span class="camp-mark">★</span>' +
          '<span class="camp-mtitle">' + mesc((art && art.title) || m.id) + '</span>' +
          (m.teaches ? '<span class="camp-teaches">' + mesc(m.teaches) + '</span>' : '') +
          '<button class="btn" data-camp-start="' + m.kind + ':' + m.id + '">▶ Start</button>' +
          '</div>';
      });
    }
    return h;
  }

  // ============================================== Plant & Mission window
  // The plant + mode selector (Sim tab → ⚛️ Plant & Mission…). Selection order:
  // pick the plant (left column), then the mode (Free Play / Campaign /
  // Scenarios / Walkthroughs), then the specific start. Nothing changes in the
  // running sim until a start button is pressed.
  var msel = { engine: 'pwr', mode: 'free', init: null };
  function openMissionSelect() {
    msel.engine = ui.engineKey;
    msel.init = ui.initState;
    renderMissionSelect();
    $('missionOverlay').hidden = false;
  }
  function closeMissionSelect() { $('missionOverlay').hidden = true; }
  // Legacy name, still the "training lists changed" refresh hook (completion
  // marks, active-scenario card): re-render the window if it's open.
  function buildTraining() {
    if (!$('missionOverlay').hidden) renderMissionSelect();
  }
  function scenariosFor(key) {
    var e = ENGINES[key];
    return Object.keys(RD.SCENARIOS || {}).filter(function (id) {
      var s = RD.SCENARIOS[id];
      if (s.plant_id !== e.plant) return false;
      // RBMK scenarios pin a design version; show each under its own card only
      if (e.plant === 'rbmk' && s.design_version && s.design_version !== e.dv) return false;
      return true;
    });
  }
  function procsFor(key) {
    return ((RD.MANUAL_PROCEDURES || {})[key] || []).filter(function (x) { return !x.narrative; });
  }
  function renderMissionSelect() {
    // Step 1 — the plant column
    $('mpPlants').innerHTML = Object.keys(ENGINES).map(function (k) {
      var e = ENGINES[k];
      return '<div class="mplant-card' + (k === msel.engine ? ' on' : '') + '" data-mplant="' + k + '">' +
        '<div class="mplant-name">' + mesc(e.label) + (k === ui.engineKey ? ' <span class="mplant-live">● active</span>' : '') + '</div>' +
        '<div class="mplant-sub">' + mesc(e.sub) + '</div>' +
        '<div class="mplant-desc">' + mesc(e.desc) + '</div></div>';
    }).join('');
    // Step 2 — the mode tabs
    var modes = [['free', 'Free Play'], ['campaign', 'Campaign'], ['scenarios', 'Scenarios'], ['walkthroughs', 'Walkthroughs']];
    $('mpModes').innerHTML = modes.map(function (m) {
      return '<button class="' + (msel.mode === m[0] ? 'on' : '') + '" data-mmode="' + m[0] + '">' + m[1] + '</button>';
    }).join('');
    // Step 3 — the mode's content
    $('mpContent').innerHTML =
      msel.mode === 'free'      ? mpFree() :
      msel.mode === 'campaign'  ? mpCampaign() :
      msel.mode === 'scenarios' ? mpScenarios() : mpWalkthroughs();
  }
  function mpFree() {
    var e = ENGINES[msel.engine];
    var states = PROFILES[e.plant].initStates;
    if (!states.some(function (s) { return s[0] === msel.init; })) msel.init = e.init;
    var h = '<div class="m-note">Free Play — the plant is yours: no script, no grading, every control live. Pick the starting condition.</div>' +
      '<div class="g-section-title" style="margin-top:12px">Starting condition</div>';
    h += states.map(function (s) {
      return '<div class="init-row' + (s[0] === msel.init ? ' on' : '') + '" data-minit="' + s[0] + '">' +
        '<span class="init-dot">' + (s[0] === msel.init ? '◉' : '○') + '</span><span>' + mesc(s[1]) + '</span></div>';
    }).join('');
    h += '<button class="btn mp-start" data-mfree="1">▶ Start Free Play — ' + mesc(e.label) + '</button>';
    return h;
  }
  function mpCampaign() {
    return '<div class="m-note" data-scanner-hint="Campaign — the guided path from first scram to a full qualification, in the recommended order. Completed missions stay replayable.">The guided path — zero to operator, in order. Every mission stays replayable.</div>' +
      campaignHtml(msel.engine);
  }
  function mpScenarios() {
    var p = progress();
    var doneS = p.completed_scenarios || [];
    var ids = scenariosFor(msel.engine);
    var h = '<div class="m-note">Instructor-led situations — one lesson each, played on this plant.</div>';
    return h + (ids.length ? ids.map(function (id) {
      var s = RD.SCENARIOS[id];
      var active = ui.scenario === id;
      return '<div class="tr-card' + (active ? ' active' : '') + '">' +
        '<div class="tr-head"><span class="tr-title">' + (doneS.indexOf(id) !== -1 ? '✓ ' : '') + mesc(s.title) + '</span></div>' +
        (s.description ? '<div class="m-note">' + mesc(s.description) + '</div>' : '') +
        '<div class="tr-actions">' + (active
          ? '<button class="btn" data-trstop="1">■ Stop scenario</button>'
          : '<button class="btn" data-trstart="' + id + '">▶ Start</button>') + '</div></div>';
    }).join('') : '<div class="m-note">No scenarios for this plant yet.</div>');
  }
  function mpWalkthroughs() {
    var p = progress();
    var procs = procsFor(msel.engine);
    var doneP = p.completed_procedures || [];
    var h = '<div class="m-note">Follow a real procedure step by step — the Instructor checks each step off the instruments.</div>';
    return h + (procs.map(function (x) {
      return '<div class="tr-row"><span class="tr-ptitle">' + (doneP.indexOf(x.id) !== -1 ? '✓ ' : '') + mesc(x.title) + '</span>' +
        '<button class="btn" data-follow="' + x.id + '">▶ Follow</button></div>';
    }).join('') || '<div class="m-note">No procedures for this plant.</div>');
  }
  // Starting a plant-bound mission (campaign mission / walkthrough) from the
  // window may first need the window's plant to become the active one.
  // Scenarios don't: start_scenario resets to its own plant.
  function ensureEngine(key) { if (ui.engineKey !== key) switchEngine(key); }

  // ---- Scenario lifecycle (Plant & Mission window / level-complete Retry / ?scenario=) ----
  function startScenario(id) {
    var sc = RD.SCENARIOS && RD.SCENARIOS[id];
    if (!sc) return;
    ui.follow = null;
    ui.scenario = id;
    service.stop(); $('playBtn').textContent = '▶'; $('playBtn').classList.add('paused');
    service.handleCommand({ action: 'start_scenario', scenario_id: id });
    afterPlantChange();          // the scenario may have switched the plant
    // (M5's start_scenario starts from a clean automation board and applies the
    // authored auto_channels preset itself — the channel runtime is in-stack.)
    diagReset('scenario', { scenario_id: id });
    resetInstrFlow();            // fresh mission → fresh commentary queue
    resetChat();                 // fresh transcript state (chat-mode scenarios)
    setFocus('instructor', true);
    service.handleCommand({ action: 'play' });
    $('playBtn').textContent = '⏸'; $('playBtn').classList.remove('paused');
  }

  // ---- "Follow in Instructor" (Path 2): the Instructor (M6) runs the procedure —
  // auto-advance, instrument-first grading, strict gating. The UI just renders
  // the snapshot's instructor.follow block; step text comes from the same
  // RD.MANUAL_PROCEDURES artifact the Instructor loaded.
  function curFollowProc() { return ui.follow ? ((RD.MANUAL_PROCEDURES || {})[ui.engineKey] || []).filter(function (x) { return x.id === ui.follow.id; })[0] : null; }
  // Instructor content starts from a clean automation board and applies its own
  // authored auto_channels preset — M5 handles both inside start_scenario /
  // start_follow (the channel runtime lives in the control layer now).
  function followProcedure(id) {
    var procs = (RD.MANUAL_PROCEDURES || {})[ui.engineKey] || [];
    if (!procs.filter(function (x) { return x.id === id; })[0]) return;
    // start_follow resets the plant to the procedure's `from` state and loads it;
    // ui.follow syncs from the resulting snapshot in renderInstructor. Fresh
    // timeline → fresh trend history and gauge smoothing.
    chartBuf = []; smoothed = {};
    cmd({ action: 'start_follow', procedure_id: id });
    buildAutomate();
    resetInstrFlow();            // fresh walkthrough → fresh commentary queue
    closeManual(); setFocus('instructor', true);
    if (latest) renderInstructor(latest);
  }
  // Rewind entry point (Instructor card ⏪ + strip-chart ⏪): during instructed
  // content it steps back one authored checkpoint; in free play it opens the
  // pick-a-moment mode on the strip chart (sandbox checkpoints every 15 sim-s).
  function rewindPressed() {
    if (ui.follow || ui.scenario) { resetInstrFlow(); cmd({ action: 'rewind', steps: 1 }); return; }
    toggleRewindPick();
  }
  function toggleRewindPick(on) {
    ui.rewindPick = on != null ? !!on : !ui.rewindPick;
    var chart = document.querySelector('.strip-chart');
    if (chart) chart.classList.toggle('rewind-pick', ui.rewindPick);
    var hint = $('rewindHint'); if (hint) hint.hidden = !ui.rewindPick;
    if (ui.rewindPick) {
      // Freeze the target: picking a moment on a moving graph is a carnival game.
      service.stop(); $('playBtn').textContent = '▶'; $('playBtn').classList.add('paused');
      latest = service.assembleSnapshot(); render(latest);
    } else if (latest) drawChart();
  }
  function rewindPickClick(e) {
    if (!ui.rewindPick) return;
    var cps = (service && service.checkpoints) || [];
    if (!cps.length || chartBuf.length < 2) { toggleRewindPick(false); return; }
    var rect = document.querySelector('.chart-plot').getBoundingClientRect();
    var frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    var t0 = chartBuf[0].t, t1 = chartBuf[chartBuf.length - 1].t;
    var tPick = t0 + frac * (t1 - t0);
    var best = 0, bd = Infinity;
    for (var i = 0; i < cps.length; i++) {
      var d = Math.abs(cps[i].metadata.sim_time - tPick);
      if (d < bd) { bd = d; best = i; }
    }
    toggleRewindPick(false);
    // exact: the pick names a specific checkpoint — M5 must not apply the
    // repeated-press walk-back clamp to it (playtest follow-up).
    cmd({ action: 'rewind', steps: cps.length - best, exact: true });
  }

  function followNav(d) {
    // Rewind works in any context (walkthrough, scenario, or free play).
    if (d === 'rewind') { rewindPressed(); return; }
    if (!ui.follow) {
      // Next outside a walkthrough = "Continue" for a scenario's manual beats.
      if (d === 'next') cmd({ action: 'instructor_continue' });
      return;
    }
    if (d === 'stop') { ui.follow = null; cmd({ action: 'stop_follow' }); renderInstructor(latest || { instructor: {} }); return; }
    cmd({ action: 'follow_nav', dir: d });
    if (latest) renderFollow(latest);
  }
  function renderFollow(s) {
    var f = s && s.instructor && s.instructor.follow;
    if (!f) return;                       // renderInstructor only routes here when present
    var pr = curFollowProc();
    if (!pr) {                            // profile mismatch (e.g. mid plant-restore) — no recursion
      $('instrPrev').innerHTML = 'Following: <b>' + mesc(f.procedure_id) + '</b> — step ' + (f.step_index + 1) + ' of ' + f.step_total;
      return;
    }
    var n = f.step_total, st = pr.steps[f.step_index] || {};
    $('instrPrev').innerHTML = 'Following: <b>' + mesc(pr.title) + '</b> — step ' + (f.step_index + 1) + ' of ' + n;
    if (f.done) {
      var lc = s.instructor.level_complete || { title: pr.title, outcome: pr.outcome || '', actions: ['continue', 'retry'] };
      renderLevelComplete(s, lc);
      return;
    }
    lastLcKey = null;
    var meta = [];
    if (st.control) meta.push('Control: <b>' + mesc(st.control) + '</b>');
    if (st.target) meta.push('Target: ' + mesc(st.target));
    var acc = '';
    if (st.acc) {
      var met = !!f.acc_met;   // graded by the Instructor — instruments first (HR1)
      var via = f.graded_by === 'instrument' ? 'reading the instrument' : f.graded_by === 'true_state' ? 'no instrument twin — true value' : null;
      acc = '<div class="m-note">✓ when ' + mesc(st.acc.p) + ' ' + (OPSYM[st.acc.op] || st.acc.op) + ' ' + mesc(st.acc.v) +
        (met ? ' <span style="color:var(--running)">✓ met</span>' : ' <span class="muted">…not yet</span>') +
        (via ? ' <span class="muted">· ' + via + '</span>' : '') + '</div>';
    }
    // Wrong-action commentary (strict gating): the Instructor's message during a
    // follow is the gate feedback — shown under the step until the user complies.
    var warn = s.instructor.message ? '<div class="m-note" style="color:var(--caution)">🎓 ' + mesc(s.instructor.message) + '</div>' : '';
    var cur = $('instrCurrent'); cur.classList.remove('instr-standby');
    cur.innerHTML = mesc(st.text) + (meta.length ? '<div class="m-note" style="margin-top:4px">' + meta.join(' &nbsp;·&nbsp; ') + '</div>' : '') + acc + warn +
      (st.note ? '<div class="m-note" style="color:var(--muted)">' + mesc(st.note) + '</div>' : '');
  }
  // Focus model: a strict accordion in free play (exactly one of instructor /
  // tools expanded), but while instructed content is live (scenario, walkthrough,
  // chat) the two SPLIT the column instead of stealing from each other — live
  // guidance must never vanish because the player opened the Graph tab, and a
  // new chat line must not slam a tool shut mid-use. `user` marks an explicit
  // click (persona header), which still maximizes the instructor.
  function setFocus(which, user) {
    var instr = $('instructorCard'), tools = $('toolsCard'); if (!instr || !tools) return;
    var live = !!(ui.scenario || ui.follow || chatState.sid);
    var iExp, tExp;
    if (which === 'instructor') {
      iExp = true;
      tExp = (live && !user) ? tools.classList.contains('expanded') : false;
    } else {
      tExp = true;
      iExp = live;
    }
    instr.classList.toggle('expanded', iExp);
    instr.classList.toggle('collapsed', !iExp);
    tools.classList.toggle('expanded', tExp);
    tools.classList.toggle('collapsed', !tExp);
  }

  function renderFailures(s) {
    var act = {}; s.active_failures.forEach(function (f) { act[f.id] = f; });
    document.querySelectorAll('.fail-row').forEach(function (row) {
      var id = row.id.replace('fail-', ''), on = !!act[id];
      row.classList.toggle('active', on);
      var btn = row.querySelector('.fail-toggle'); if (btn) btn.textContent = on ? 'Clear' : 'Inject';
      var sl = row.querySelector('[data-sevfor]');
      if (sl && on && act[id].severity != null && document.activeElement !== sl) {
        var m = JSON.parse(row.getAttribute('data-meta'));
        sl.value = Math.round(act[id].severity * 100);
        row.querySelector('[data-svlabel="' + id + '"]').textContent = m.label + ': ' + Math.round(m.min + act[id].severity * (m.max - m.min)) + ' ' + m.unit;
      }
    });
  }

  // ============================================================ strip chart
  function seriesAlarmed(ser) {
    if (!latest) return false;
    var v = ser.get(latest.instruments);
    if (ser.dHi != null && v >= ser.dHi) return true;
    if (ser.dLo != null && v <= ser.dLo) return true;
    return false;
  }
  function lighten(hex) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return 'rgb(' + Math.round(r + (255 - r) * 0.6) + ',' + Math.round(g + (255 - g) * 0.6) + ',' + Math.round(b + (255 - b) * 0.6) + ')';
  }
  function drawChart() {
    var svg = $('chartCanvas'), floats = $('chartFloats'), W = 400, H = 120;
    var active = prof().series.filter(function (s) { return ui.series[s.id]; });
    $('chartLegend').innerHTML = active.map(function (s) {
      return '<span class="leg" style="color:' + s.c + '"><i style="background:' + s.c + '"></i>' + s.label + ' <b>' + s.range[0] + '–' + s.range[1] + '</b></span>';
    }).join('');
    if (chartBuf.length < 2) { svg.innerHTML = ''; if (floats) floats.innerHTML = ''; return; }
    var t0 = chartBuf[0].t, t1 = chartBuf[chartBuf.length - 1].t, span = (t1 - t0) || 1;
    var html = '';
    // horizontal gridlines — kept very dark so they recede behind the traces
    [30, 60, 90].forEach(function (y) { html += '<line x1="0" y1="' + y + '" x2="' + W + '" y2="' + y + '" stroke="#0f1217" stroke-width="0.5" vector-effect="non-scaling-stroke"/>'; });
    var lastY = [];
    active.forEach(function (ser) {
      var lo = ser.range[0], hi = ser.range[1], rng = (hi - lo) || 1, ly = 0;
      var pts = chartBuf.map(function (b) {
        var x = (b.t - t0) / span * W;
        var f = Math.max(0, Math.min(1, (ser.get(b.ins) - lo) / rng));
        var y = H - 8 - f * (H - 16); ly = y;
        return x.toFixed(1) + ',' + y.toFixed(1);
      }).join(' ');
      var hot = seriesAlarmed(ser);
      html += '<polyline points="' + pts + '" fill="none" stroke="' + (hot ? lighten(ser.c) : ser.c) + '" stroke-width="' + (hot ? 2.4 : 1.5) + '" vector-effect="non-scaling-stroke"/>';
      lastY.push({ ser: ser, y: ly, hot: hot, val: ser.get(chartBuf[chartBuf.length - 1].ins) });
    });
    // Rewind-pick mode: mark every checkpoint inside the window as a jump target.
    if (ui.rewindPick && service && service.checkpoints) {
      service.checkpoints.forEach(function (cp) {
        var t = cp.metadata.sim_time;
        if (t < t0 || t > t1) return;
        var x = ((t - t0) / span * W).toFixed(1);
        html += '<line class="cp-mark" x1="' + x + '" y1="0" x2="' + x + '" y2="' + H + '" stroke="#7ab0ff" stroke-width="1" stroke-dasharray="3,3" vector-effect="non-scaling-stroke"/>' +
                '<circle cx="' + x + '" cy="6" r="2.5" fill="#7ab0ff"/>';
      });
    }
    svg.innerHTML = html;
    drawFloats(lastY, H);
    // low-profile x-axis
    var ax = $('chartXAxis'); ax.innerHTML = '';
    for (var i = 0; i <= 5; i++) {
      var rel = (t0 + span * i / 5) - t1;
      var sp = document.createElement('span'); sp.textContent = rel === 0 ? '0' : Math.round(rel) + 's'; ax.appendChild(sp);
    }
    $('chartWindowLbl').textContent = '−' + hms(ui.window).slice(3);
  }

  // Live floating value labels at the right edge, one per trace, color-coded and
  // spread vertically so they never overlap (move with each line).
  function drawFloats(items, H) {
    var floats = $('chartFloats'); if (!floats) return;
    if (!items.length) { floats.innerHTML = ''; return; }
    // y in % of plot height; collision-spread with a min gap.
    var GAP = 11; // percent
    items.forEach(function (it) { it.pct = Math.max(2, Math.min(98, it.y / H * 100)); });
    items.sort(function (a, b) { return a.pct - b.pct; });
    for (var i = 1; i < items.length; i++) if (items[i].pct < items[i - 1].pct + GAP) items[i].pct = items[i - 1].pct + GAP;
    // if the stack overflowed the bottom, push the whole column up
    var overflow = items[items.length - 1].pct - 98;
    if (overflow > 0) for (var j = 0; j < items.length; j++) items[j].pct = Math.max(2, items[j].pct - overflow);
    floats.innerHTML = items.map(function (it) {
      var col = it.hot ? lighten(it.ser.c) : it.ser.c;
      return '<span class="cfloat" style="top:' + it.pct.toFixed(1) + '%;color:' + col + '">' + it.ser.fmt(it.val) + '</span>';
    }).join('');
  }

  // ============================================================ commands
  function cmd(c) {
    // A chat interaction click (e.g. the maintenance tag) is the player acting —
    // release the transcript's reading dwell so the exchange answers promptly.
    if (c && c.action === 'instructor_interact') chatState.nextAt = 0;
    var r = service.handleCommand(c);
    if (diag) {
      diag.commands.push({ t: latest && latest.metadata ? latest.metadata.sim_time : 0, command: c, blocked: !!(r && r.type === 'blocked'), error: !!(r && r.type === 'error') });
      if (diag.commands.length > 2000) diag.commands.shift();
    }
    // The command was blocked, not executed — show why. Instructor gates focus
    // the Instructor card (its commentary carries the message); plant interlocks
    // (M4, e.g. the rod-withdrawal block) flash theirs in the scanner bar.
    if (r && r.type === 'blocked') {
      if (r.code === 'INTERLOCK' && r.message) $('scanner').innerHTML = '<strong>⛔ ' + mesc(r.message) + '</strong>';
      else { msgHold.bypass = true; setFocus('instructor'); }   // gate feedback jumps the dwell queue
      latest = service.assembleSnapshot(); render(latest);
    }
    if (!service.running) { latest = service.assembleSnapshot(); render(latest); }
    return r;
  }
  // The classic control strip and the plant-display controls reuse the same input
  // ids (feedSet, mweSet, …) — read the VISIBLE one (the inactive layout's copy is
  // display:none, so its offsetParent is null).
  function inputVal(id) {
    var els = document.querySelectorAll('[id="' + id + '"]');
    for (var i = 0; i < els.length; i++) if (els[i].offsetParent !== null) return +els[i].value;
    return els.length ? +els[els.length - 1].value : 0;
  }

  // ============================================================ Automate tab
  // A pure face over snapshot.automation (the in-stack channel runtime in the
  // Control Layer): toggles and setpoint edits send set_auto_channel /
  // set_auto_setpoint down the stack; readouts render from each broadcast.
  function autoSnap() { return latest || service.assembleSnapshot(); }
  function autoChans(s) { return (s && s.automation && s.automation.channels) || []; }
  function autoChan(s, id) {
    var ch = autoChans(s);
    for (var i = 0; i < ch.length; i++) if (ch[i].id === id) return ch[i];
    return null;
  }

  function buildAutomate() {
    var list = $('autoList'), master = $('autoMaster');
    if (!list) return;
    var chans = autoChans(autoSnap());
    master.innerHTML =
      '<span class="k">Automatic control</span>' +
      '<span><button class="btn" data-autoall="on" data-scanner-hint="All Auto — engages every automation channel for this plant (setpoints capture the current readings).">All auto</button> ' +
      '<button class="btn" data-autoall="off" data-scanner-hint="All Manual — disengages every automation channel; each control freezes where automation left it.">All manual</button></span>';
    var html = '', lastGroup = null;
    chans.forEach(function (c) {
      if (c.group !== lastGroup) { html += '<div class="g-section-title" style="margin-top:10px">' + mesc(c.group) + '</div>'; lastGroup = c.group; }
      html += '<div class="auto-row" data-autorow="' + c.id + '" data-scanner-hint="' + esc(c.label + ' — ' + c.hint) + '">' +
        '<button class="auto-tog" data-autotog="' + c.id + '">MAN</button>' +
        '<div class="auto-main"><div class="auto-name">' + mesc(c.label) + '</div>' +
        '<div class="auto-read mono" data-autoread="' + c.id + '">—</div></div>';
      if (c.setpoint_meta) {
        html += '<div class="auto-spbox"><span class="auto-splbl">SP</span>' +
          '<input class="num-input mono auto-sp" data-autosp="' + c.id + '" type="number" step="' + (c.setpoint_meta.step || 1) + '" disabled>' +
          '<span class="auto-spunit" data-autospu="' + c.id + '"></span></div>';
      }
      html += '</div>';
    });
    list.innerHTML = html;
    if (latest) renderAutomate(latest);
  }

  function autoSpUnit(c) { return c.setpoint_meta ? (c.setpoint_meta.dim ? unit(c.setpoint_meta.dim) : (c.setpoint_meta.unit || '')) : ''; }
  function autoFmtPv(c, v, dp) {
    if (v == null || !isFinite(v)) return '—';
    var dim = c.setpoint_meta && c.setpoint_meta.dim;
    return (dim ? conv(v, dim) : v).toFixed(dp != null ? dp : (c.setpoint_meta ? c.setpoint_meta.dp : 0));
  }

  function renderAutomate(s) {
    var list = $('autoList');
    if (!list || !list.firstChild) return;
    // Sync any AUTO/MAN mirror segs on the plant display (RBMK AR card) to the
    // rod channel's true state — the seg is a second face of the same channel.
    var arc = autoChan(s, 'rods_power');
    if (arc) {
      var on = arc.engaged;
      document.querySelectorAll('[data-arsync]').forEach(function (b) {
        b.classList.toggle('on', (b.getAttribute('data-arsync') === 'on') === on);
        b.classList.toggle('run', b.getAttribute('data-arsync') === 'on' && on);
      });
    }
    autoChans(s).forEach(function (c) {
      var on = c.engaged;
      var row = list.querySelector('[data-autorow="' + c.id + '"]'); if (!row) return;
      row.classList.toggle('on', on);
      var tog = row.querySelector('[data-autotog]');
      tog.textContent = on ? 'AUTO' : 'MAN';
      tog.classList.toggle('on', on);
      var read = row.querySelector('[data-autoread]');
      if (c.kind === 'mode') {
        read.textContent = on ? 'engaged (plant-side control)' : 'manual';
      } else {
        var txt = c.kind === 'bang'
          ? 'rods ' + autoFmtPv(c, c.pv, 0) + ' % out'
          : autoFmtPv(c, c.pv) + (on && c.setpoint != null ? ' → ' + autoFmtPv(c, c.setpoint) : '') + ' ' + autoSpUnit(c);
        if (on && c.note) txt += ' · ' + c.note;
        read.textContent = txt;
      }
      if (c.setpoint_meta) {
        var inp = row.querySelector('[data-autosp]'), un = row.querySelector('[data-autospu]');
        inp.disabled = !on;
        un.textContent = autoSpUnit(c);
        if (document.activeElement !== inp) {
          inp.value = (on && c.setpoint != null) ? autoFmtPv(c, c.setpoint) : '';
          // display-side bounds so the browser spinner respects the channel range
          inp.min = autoFmtPv(c, c.setpoint_meta.min); inp.max = autoFmtPv(c, c.setpoint_meta.max);
        }
      }
    });
  }

  function bindAutomate() {
    var pane = document.querySelector('[data-pane="automate"]');
    if (!pane) return;
    pane.addEventListener('click', function (e) {
      var all = e.target.closest('[data-autoall]');
      if (all) {
        cmd({ action: 'set_auto_channel', channel_id: 'all', engaged: all.getAttribute('data-autoall') === 'on' });
        renderAutomate(service.assembleSnapshot()); return;
      }
      var b = e.target.closest('[data-autotog]');
      if (b) {
        var id = b.getAttribute('data-autotog');
        var c = autoChan(autoSnap(), id); if (!c) return;
        cmd({ action: 'set_auto_channel', channel_id: id, engaged: !c.engaged });
        renderAutomate(service.assembleSnapshot());
      }
    });
    pane.addEventListener('change', function (e) {
      var inp = e.target.closest('[data-autosp]');
      if (!inp) return;
      var id = inp.getAttribute('data-autosp'), c = autoChan(autoSnap(), id); if (!c) return;
      var v = parseFloat(inp.value);
      if (isNaN(v)) return;
      cmd({ action: 'set_auto_setpoint', channel_id: id, value: (c.setpoint_meta && c.setpoint_meta.dim) ? invConv(v, c.setpoint_meta.dim) : v });
      renderAutomate(service.assembleSnapshot());
    });
  }

  // ============================================================ session diagnosis (Dev tab)
  // Records the session at 1 Hz (true-state samples), plus alarm transitions,
  // scram edges, and every issued command; "Diagnosis JSON" bundles it all with
  // a full service.saveState() so an AI (or a human) can replay what happened.
  // Schema matches the Diagnostic/rd_diag_*.json exports (schema_version 1.0).
  var DIAG_FIELDS = {
    pwr: ['power_pct', 'tavg_c', 'thot_c', 'tcold_c', 'pressure_mpa', 'pzr_level_pct', 'sg_level_pct', 'steam_flow_normalized', 'fw_flow_normalized', 'steam_pressure_mpa'],
    rbmk: ['power_pct', 'fuel_temp_c', 'graphite_temp_avg_c', 'void_fraction_avg', 'reactivity_pcm', 'xenon_pct_eq', 'steam_pressure_mpa', 'drum_level_pct', 'channel_flow_pct'],
    bwr: ['power_pct', 'fuel_temp_c', 'vessel_pressure_mpa', 'vessel_level_pct', 'core_void_fraction', 'recirc_flow_pct', 'decay_heat_pct']
  };
  var diag = null;
  function diagEvent(t, type, detail) {
    diag.events.push({ t: t, type: type, detail: detail });
    if (diag.events.length > 5000) diag.events.shift();
  }
  function diagReset(reason, meta) {
    var t = latest && latest.metadata ? latest.metadata.sim_time : 0;
    diag = { reason: reason, meta: meta || null, startSim: t, lastT: t, nextT: Math.floor(t), samples: [], events: [], commands: [], lastAlarms: null, lastScrammed: false };
    diagEvent(t, 'session_start', { reason: reason, meta: meta || null });
  }
  function diagSample(s, t) {
    var ts = s.true_state || {}, row = { t: t, accel: s.metadata.time_acceleration };
    var F = DIAG_FIELDS[ui.plant] || DIAG_FIELDS.pwr;
    for (var i = 0; i < F.length; i++) if (typeof ts[F[i]] === 'number') row['true_' + F[i]] = ts[F[i]];
    diag.samples.push(row);
    if (diag.samples.length > 14400) diag.samples.shift();   // ~4 h at 1 Hz
  }
  function diagTick(s) {
    if (!diag || !s || !s.metadata) return;
    var t = s.metadata.sim_time;
    if (t < diag.lastT - 0.001) {          // rewind / replay — drop the recorded future
      var keep = function (e) { return e.t <= t + 0.001; };
      diag.samples = diag.samples.filter(keep); diag.events = diag.events.filter(keep); diag.commands = diag.commands.filter(keep);
      diag.nextT = Math.floor(t);
      diagEvent(t, 'time_rewind', { to: t });
    }
    diag.lastT = t;
    var byId = {};
    for (var i = 0; i < s.alarms.length; i++) {
      var a = s.alarms[i]; byId[a.id] = a.state;
      var was = diag.lastAlarms ? diag.lastAlarms[a.id] : a.state;
      if (diag.lastAlarms === null || was !== a.state) diagEvent(t, 'alarm', { id: a.id, state: a.state, was: was });
    }
    diag.lastAlarms = byId;
    var sc = !!(s.rps_state && s.rps_state.scrammed);
    if (sc && !diag.lastScrammed) {
      var reason = (s.rps_state.last_trip_reason || 'unknown');
      diagEvent(t, 'scram', { trip_reason: reason }); diagEvent(t, 'trip_reason', { reason: reason });
    }
    diag.lastScrammed = sc;
    if (t >= diag.nextT || !diag.samples.length) { diagSample(s, t); diag.nextT = Math.floor(t) + 1; }
    var el = $('diagSessionInfo');
    if (el) el.textContent = ui.plant + ' · ' + diag.reason + ' · ' + t.toFixed(0) + ' s · ' + diag.samples.length + ' samples';
  }
  function exportDiag() {
    if (!diag) return;
    var s = latest || service.assembleSnapshot(); var t = s.metadata.sim_time;
    diagSample(s, t);                                        // final partial-second sample
    var iso = new Date().toISOString();
    var bundle = {
      schema_version: '1.0', kind: 'reactor_dynamics_diagnosis', exported_at: iso,
      manifest: {
        plant_id: ui.plant, design_version: s.metadata.design_version || null, engine_key: ui.engineKey,
        initial_state: ui.initState,
        scenario_id: (s.instructor && s.instructor.scenario_id) || null,
        follow_procedure_id: (s.instructor && s.instructor.follow && s.instructor.follow.procedure_id) || null,
        session_start_reason: diag.reason, session_start_meta: diag.meta,
        session_start_sim_time: diag.startSim, exported_sim_time: t,
        seed: service.seed, sample_hz: 1
      },
      timeseries: diag.samples, events: diag.events, commands: diag.commands,
      snapshot_end: service.saveState()
    };
    var notesEl = $('diagNotes'), notes = notesEl && notesEl.value.trim();
    if (notes) bundle.notes = notes;
    var stamp = iso.slice(0, 16).replace(/:/g, '');          // 2026-07-07T0046
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(bundle)], { type: 'application/json' }));
    a.download = 'rd_diag_' + stamp + '_' + ui.plant + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }

  var ACTS = {
    scram: function () { cmd({ action: 'scram' }); },
    'export-diag': function () { exportDiag(); },
    'ack-all': function () { cmd({ action: 'acknowledge_all_alarms' }); },
    // rods — uniform across plants (+withdraw / −insert)
    'rod-raise': function () { cmd({ action: 'rod_start', group_id: 'control_rods', direction: 1, speed: ui.rodSpeed }); },
    'rod-lower': function () { cmd({ action: 'rod_start', group_id: 'control_rods', direction: -1, speed: ui.rodSpeed }); },
    'rod-nudge-out': function () { cmd({ action: 'rod_nudge', group_id: 'control_rods', steps: 1, speed: ui.rodSpeed }); },
    'rod-nudge-in': function () { cmd({ action: 'rod_nudge', group_id: 'control_rods', steps: -1, speed: ui.rodSpeed }); },
    'rodspeed-slow': function () { ui.rodSpeed = 'slow'; }, 'rodspeed-normal': function () { ui.rodSpeed = 'normal'; }, 'rodspeed-fast': function () { ui.rodSpeed = 'fast'; },
    // Shutdown (scram) bank — one click drives it the whole way out or in at fast
    // speed (not held): steps is far past max_steps so rod_nudge's target clips
    // to the end of travel and drives there, same rate-limited motion as a hold.
    'sdbank-withdraw': function () { cmd({ action: 'rod_nudge', group_id: 'shutdown_rods', steps: 1000, speed: 'fast' }); },
    'sdbank-insert': function () { cmd({ action: 'rod_nudge', group_id: 'shutdown_rods', steps: -1000, speed: 'fast' }); },
    // PWR
    'rcp-run': function () { cmd({ action: 'clear_failure', failure_id: 'rcp_trip' }); },
    'rcp-stop': function () { cmd({ action: 'inject_failure', failure_id: 'rcp_trip', severity: 1 }); },
    // CVCS — boron chemistry (decoupled), charging pump, letdown valve, auto make-up
    'borate': function () { cmd({ action: 'set_boron_adjust', rate: 2 }); },
    'dilute': function () { cmd({ action: 'set_boron_adjust', rate: -2 }); },
    'boron-hold': function () { cmd({ action: 'set_boron_adjust', rate: 0 }); },
    'charge-pump-on': function () { cmd({ action: 'set_charging_pump', running: true }); },
    'charge-pump-off': function () { cmd({ action: 'set_charging_pump', running: false }); },
    'charge-set': function () { cmd({ action: 'set_charging_flow', normalized: inputVal('chargeSet') / 1000 }); },
    // Letdown: two independent orifices (off / A / B / A+B). Each toggle preserves the
    // other orifice (the engine command only touches the field it's given). Flow is
    // pressure-driven off the cold-leg node, not a commanded setpoint.
    'letdown-a-in': function () { cmd({ action: 'set_letdown_orifices', a: true }); },
    'letdown-a-out': function () { cmd({ action: 'set_letdown_orifices', a: false }); },
    'letdown-b-in': function () { cmd({ action: 'set_letdown_orifices', b: true }); },
    'letdown-b-out': function () { cmd({ action: 'set_letdown_orifices', b: false }); },
    'cvcs-auto': function () { cmd({ action: 'set_cvcs_auto', active: true }); },
    'cvcs-manual': function () { cmd({ action: 'set_cvcs_auto', active: false }); },
    'eccs-on': function () { ui.pdOp.eccs = true; cmd({ action: 'set_hpi', active: true }); }, 'eccs-off': function () { cmd({ action: 'set_hpi', active: false }); },
    'eccs-auto': function () { cmd({ action: 'set_esf_auto', system: 'hpi', auto: true }); },
    'afw-auto': function () { cmd({ action: 'set_esf_auto', system: 'afw', auto: true }); },
    'afw-flow-set': function () { cmd({ action: 'set_afw_flow', pct: inputVal('afwFlowSet') }); },
    // NIS: SR detector switch (P-6 interlocked) + startup-trip block toggles (P-10 gated)
    'sr-on': function () { cmd({ action: 'set_sr_detector', on: true }); },
    'sr-off': function () { cmd({ action: 'set_sr_detector', on: false }); },
    'block-ir': function () { var b = (latest && latest.rps_state && latest.rps_state.trip_blocks) || {}; cmd({ action: 'set_trip_block', trip_id: 'ir_high', blocked: !b.ir_high }); },
    'block-pr25': function () { var b = (latest && latest.rps_state && latest.rps_state.trip_blocks) || {}; cmd({ action: 'set_trip_block', trip_id: 'pr_low_setpoint', blocked: !b.pr_low_setpoint }); },
    'one-over-m': function () { if (RD.OneOverM) RD.OneOverM.open(); },
    'heat-on': function () { cmd({ action: 'set_heater', power_pct: 100 }); }, 'heat-off': function () { cmd({ action: 'set_heater', power_pct: 0 }); },
    'heat-auto': function () { cmd({ action: 'set_heater', auto: true }); }, 'heat-set': function () { cmd({ action: 'set_heater', power_pct: inputVal('heatSet') }); },
    'spray-open': function () { cmd({ action: 'set_spray', open: true }); }, 'spray-auto': function () { cmd({ action: 'set_spray', auto: true }); },
    'spray-set': function () { cmd({ action: 'set_spray', pct: inputVal('spraySet') }); },
    'feed-start': function () { cmd({ action: 'set_feed_pump_speed', pct: 100 }); }, 'feed-stop': function () { cmd({ action: 'set_feed_pump_speed', pct: 0 }); },
    'feed-set': function () { cmd({ action: 'set_feed_pump_speed', pct: inputVal('feedSet') }); },
    'feed-nudge-up': function () { cmd({ action: 'feed_pump_nudge', delta_pct: 2 }); },
    'feed-nudge-dn': function () { cmd({ action: 'feed_pump_nudge', delta_pct: -2 }); },
    'afw-start': function () { ui.pdOp.afw = true; cmd({ action: 'set_afw', active: true }); }, 'afw-stop': function () { cmd({ action: 'set_afw', active: false }); },
    // MSIV: a real PWR valve (open_msiv/close_msiv); on the BWR still the
    // msiv_closure failure toggle (its engine models isolation as a failure).
    'msiv-open': function () {
      if (ui.plant === 'bwr') cmd({ action: 'clear_failure', failure_id: 'msiv_closure' });
      else if (ui.plant === 'pwr') cmd({ action: 'open_msiv' });
    },
    'msiv-close': function (b) {
      if (ui.plant === 'bwr') cmd({ action: 'inject_failure', failure_id: 'msiv_closure' });
      else if (ui.plant === 'pwr') armedConfirm(b, function () { cmd({ action: 'close_msiv' }); });
    },
    'spray-off': function () { cmd({ action: 'set_spray', open: false }); },
    // load mode (engines/load_mode.js) — Follow tracks reactor power; Manual uses the slider; Off drops the grid
    'load-follow': function () { cmd({ action: 'set_load_mode', mode: 'follow' }); },
    'load-manual': function () { cmd({ action: 'set_load_mode', mode: 'manual' }); },
    'load-disconnect': function () { cmd({ action: 'disconnect_grid' }); },
    'breaker-close': function () { cmd({ action: 'set_steam_demand', mwe: 1000 }); },
    'breaker-open': function (b) { armedConfirm(b, function () { cmd({ action: 'set_steam_demand', mwe: 0 }); }); },
    'mwe-set': function () { cmd({ action: 'set_steam_demand', mwe: inputVal('mweSet') }); },
    'porv-block-open': function () { cmd({ action: 'open_block_valve' }); },
    'porv-block-close': function (b) { armedConfirm(b, function () { cmd({ action: 'close_block_valve' }); }); },
    'dump-auto': function () { cmd({ action: 'set_steam_dump', mode: 'auto' }); },
    'dump-open': function () { cmd({ action: 'set_steam_dump', mode: 'open' }); },
    'dump-close': function () { cmd({ action: 'set_steam_dump', mode: 'closed' }); },
    'porv-open': function () { cmd({ action: 'open_porv' }); }, 'porv-close': function () { cmd({ action: 'close_porv' }); },
    'dhr-on': function () { cmd({ action: 'set_dhr', active: true }); }, 'dhr-off': function () { cmd({ action: 'set_dhr', active: false }); },
    // synoptic emergency card: RHR — AUTO re-arms the ESF actuation (a manual
    // On/Off flips it to MANUAL, like the HPI and AFW arms).
    'rhr-auto': function () { cmd({ action: 'set_esf_auto', system: 'rhr', auto: true }); },
    'rhr-on': function () { cmd({ action: 'set_rhr', active: true }); }, 'rhr-off': function () { cmd({ action: 'set_rhr', active: false }); },
    'dump-set': function () { cmd({ action: 'set_steam_dump', pct: inputVal('dumpSet') }); },
    // RBMK
    'rbmk-flow-set': function () { cmd({ action: 'set_channel_flow', pct: inputVal('rbmkFlow') }); },
    'rbmk-feed-set': function () { cmd({ action: 'set_feedwater_flow', pct: inputVal('rbmkFeed') }); },
    'rbmk-turbine-set': function () { cmd({ action: 'set_turbine_load', mwe: inputVal('rbmkMwe') }); },
    'eps-on': function () { cmd({ action: 'set_eps_bypass', active: true }); }, 'eps-off': function () { cmd({ action: 'set_eps_bypass', active: false }); },
    // PWR rod control AUTO/MAN — mirrors the Automate tab's rods_tavg channel
    // (T-ref captures the current indicated Tavg on engage).
    'prod-auto': function () { cmd({ action: 'set_auto_channel', channel_id: 'rods_tavg', engaged: true }); renderAutomate(service.assembleSnapshot()); },
    'prod-man': function () { cmd({ action: 'set_auto_channel', channel_id: 'rods_tavg', engaged: false }); renderAutomate(service.assembleSnapshot()); },
    // AR AUTO/MAN — mirrors the Automate tab's 'AR Rods → Power' channel
    'ar-auto': function () { cmd({ action: 'set_auto_channel', channel_id: 'rods_power', engaged: true }); renderAutomate(service.assembleSnapshot()); },
    'ar-man': function () { arManual(); cmd({ action: 'rod_stop', group_id: 'auto_rods' }); },
    'rbmk-eccs-on': function () { cmd({ action: 'set_eccs', active: true }); }, 'rbmk-eccs-off': function () { cmd({ action: 'set_eccs', active: false }); },
    // BWR
    'bwr-recirc-set': function () { cmd({ action: 'set_recirc_flow', pct: inputVal('bwrRecirc') }); },
    'rcic-on': function () { cmd({ action: 'set_rcic', active: true }); }, 'rcic-off': function () { cmd({ action: 'set_rcic', active: false }); },
    'ic-on': function () { cmd({ action: 'set_ic', active: true }); }, 'ic-off': function () { cmd({ action: 'set_ic', active: false }); },
    'hpci-on': function () { cmd({ action: 'set_hpci', active: true }); }, 'hpci-off': function () { cmd({ action: 'set_hpci', active: false }); },
    'trigger-ads': function (b) { armedConfirm(b, function () { cmd({ action: 'trigger_ads' }); }); },
    'start-lpci': function () { cmd({ action: 'start_lpci' }); },
    'slc-initiate': function (b) { armedConfirm(b, function () { cmd({ action: 'initiate_slc' }); }); },
    'start-lpcs': function () { cmd({ action: 'start_lpcs' }); }, 'stop-lpcs': function () { cmd({ action: 'stop_lpcs' }); },
    'slc-stop': function () { cmd({ action: 'stop_slc' }); },
    'srv-open': function () { cmd({ action: 'open_srv_manual' }); },
    'srv-close': function () { cmd({ action: 'close_srv_manual' }); },
    'bwr-turbine-set': function () { cmd({ action: 'set_turbine_load', mwe: inputVal('bwrMwe') }); },
    'bwr-feed-set': function () { cmd({ action: 'set_feedwater_flow', pct: inputVal('bwrFeed') }); },
    // lifecycle
    'save': function () { downloadSave(); }, 'load': function () { $('loadFile').click(); }, 'reset': function () { doReset(); }, 'export-csv': function () { exportCsv(); },
  };

  // Press-and-hold controls (rod drive): pointerdown starts motion at the selected
  // speed, release (anywhere) stops it. The rods then move as the sim steps — at
  // the same rate the smooth +1/−1 nudge uses.
  //
  // Control-bank Raise/Lower are also tap-or-hold: pointerdown arms a single-step
  // nudge (armRodTap) instead of driving immediately; if released within
  // TAP_HOLD_MS it fires as a 1-step nudge, otherwise the timer promotes it to a
  // continuous hold-drive, same as before.
  var TAP_HOLD_MS = 220;
  var HOLD = {
    'rod-withdraw': function () { armRodTap('control_rods', 1); },
    'rod-insert': function () { armRodTap('control_rods', -1); },
    'srod-withdraw': function () { startHoldRod('shutdown_rods', 1); },
    'srod-insert': function () { startHoldRod('shutdown_rods', -1); },
    // RBMK AR rods: manual drive first takes the channel to MAN (touching the
    // AR in manual IS taking manual control), then drives the group.
    'arod-withdraw': function () { arManual(); startHoldRod('auto_rods', 1); },
    'arod-insert': function () { arManual(); startHoldRod('auto_rods', -1); },
  };
  function arManual() {
    var c = autoChan(autoSnap(), 'rods_power');
    if (c && c.engaged) { cmd({ action: 'set_auto_channel', channel_id: 'rods_power', engaged: false }); renderAutomate(service.assembleSnapshot()); }
  }
  var holdingGroup = null, pendingRodTap = null;
  function startHoldRod(group, direction) { holdingGroup = group; cmd({ action: 'rod_start', group_id: group, direction: direction, speed: ui.rodSpeed }); }
  function armRodTap(group, direction) {
    pendingRodTap = { group: group, direction: direction, timer: setTimeout(function () {
      pendingRodTap = null; startHoldRod(group, direction);
    }, TAP_HOLD_MS) };
  }
  function endHold() {
    document.querySelectorAll('.holding').forEach(function (x) { x.classList.remove('holding'); });
    if (pendingRodTap) {
      clearTimeout(pendingRodTap.timer);
      cmd({ action: 'rod_nudge', group_id: pendingRodTap.group, steps: pendingRodTap.direction, speed: ui.rodSpeed });
      pendingRodTap = null;
      return;
    }
    if (!holdingGroup) return;
    cmd({ action: 'rod_stop', group_id: holdingGroup }); holdingGroup = null;
  }

  // Two-press confirm for destructive plant actions (the SCRAM idiom): first
  // press arms the button — it reads CONFIRM? for 3 s — second press fires.
  // One confirmation language board-wide; replaces the native confirm() popups.
  var armedBtn = null, armedTimer = null;
  function disarmConfirm() {
    if (armedTimer) { clearTimeout(armedTimer); armedTimer = null; }
    if (armedBtn) {
      armedBtn.classList.remove('armed');
      if (armedBtn.hasAttribute('data-armlabel')) armedBtn.textContent = armedBtn.getAttribute('data-armlabel');
      armedBtn.removeAttribute('data-armlabel');
    }
    armedBtn = null;
  }
  function armedConfirm(btn, fn) {
    if (!btn) { fn(); return; }                       // no button context — act directly
    if (armedBtn === btn) { disarmConfirm(); fn(); return; }
    disarmConfirm();
    armedBtn = btn;
    btn.setAttribute('data-armlabel', btn.textContent);
    btn.textContent = 'CONFIRM?'; btn.classList.add('armed');
    armedTimer = setTimeout(disarmConfirm, 3000);
  }

  // App-level feedback toast (save confirmations, bad file errors) — transient,
  // top of the plant area. Plant/instructor feedback keeps its own channels
  // (scanner = interlocks, instructor card = gate feedback).
  var toastTimer = null;
  function showToast(msg, kind) {
    var t = $('appToast');
    if (!t) {
      t = document.createElement('div'); t.id = 'appToast'; t.className = 'app-toast';
      document.querySelector('.plant-area').appendChild(t);
    }
    t.textContent = msg;
    t.className = 'app-toast show' + (kind === 'error' ? ' error' : '');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, kind === 'error' ? 5000 : 2500);
  }

  function bindCommands() {
    document.body.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (b && ACTS[b.getAttribute('data-act')]) { ACTS[b.getAttribute('data-act')](b); return; }
      var ack = e.target.closest('[data-ack]');
      if (ack) cmd({ action: 'acknowledge_alarm', alarm_id: ack.getAttribute('data-ack') });
    });
    document.body.addEventListener('pointerdown', function (e) {
      var b = e.target.closest('[data-hold]'); if (!b) return;
      var h = HOLD[b.getAttribute('data-hold')]; if (!h) return;
      e.preventDefault(); b.classList.add('holding'); h();
    });
    // Keyboard path for the press-and-hold controls (rod drive): Space/Enter on
    // a focused hold button drives while held, releases on keyup — mirrors the
    // pointer handlers, which never fire for keyboard users.
    document.body.addEventListener('keydown', function (e) {
      if (e.repeat || (e.key !== ' ' && e.key !== 'Enter')) return;
      var b = e.target.closest && e.target.closest('[data-hold]'); if (!b) return;
      var h = HOLD[b.getAttribute('data-hold')]; if (!h) return;
      e.preventDefault(); b.classList.add('holding'); h();
    });
    document.body.addEventListener('keyup', function (e) {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      if (e.target.closest && e.target.closest('[data-hold]')) endHold();
    });
    // remember control-bar setpoints so the shared bar shows the live value (not the
    // hardcoded default) when you leave and return to a view
    document.body.addEventListener('input', function (e) {
      var inp = e.target.closest('#pdCtlRow input.num-input'); if (!inp || !inp.id) return;
      ui.ctlVals[inp.id] = inp.value;
    });
    document.addEventListener('pointerup', endHold);
    document.addEventListener('pointercancel', endHold);
    window.addEventListener('blur', endHold);
    $('failList').addEventListener('click', function (e) {
      var b = e.target.closest('.fail-toggle'); if (!b) return;
      var id = b.getAttribute('data-fail'), row = $('fail-' + id);
      if (row.classList.contains('active')) cmd({ action: 'clear_failure', failure_id: id });
      else cmd({ action: 'inject_failure', failure_id: id, severity: sevOf(id) });
    });
    $('failList').addEventListener('input', function (e) {
      var sl = e.target.closest('[data-sevfor]'); if (!sl) return;
      var id = sl.getAttribute('data-sevfor'), row = $('fail-' + id), m = JSON.parse(row.getAttribute('data-meta'));
      row.querySelector('[data-svlabel="' + id + '"]').textContent = m.label + ': ' + Math.round(m.min + (+sl.value / 100) * (m.max - m.min)) + ' ' + m.unit;
      if (row.classList.contains('active')) cmd({ action: 'inject_failure', failure_id: id, severity: sevOf(id) });
    });
    // Advanced instrument failure — the expander + its panel actions.
    $('advExpToggle').addEventListener('click', function () {
      var p = $('advFailPanel'); p.hidden = !p.hidden;
      this.classList.toggle('open', !p.hidden);
      this.textContent = (p.hidden ? '▸' : '▾') + ' Advanced instrument failure (instrument × mode × value)';
      if (!p.hidden && !p.innerHTML) buildAdvFail();
    });
    $('advFailPanel').addEventListener('change', function (e) { if (e.target.id === 'advMode') syncAdvVal(); });
    $('advFailPanel').addEventListener('click', function (e) {
      if (e.target.id === 'advApply') advFailAction(true);
      else if (e.target.id === 'advClearOne') advFailAction(false);
    });
  }
  function sevOf(id) { var sl = document.querySelector('[data-sevfor="' + id + '"]'); return sl ? +sl.value / 100 : 1; }

  // ============================================================ lifecycle/UI
  function bindUI() {
    $('tabbar').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-tab]'); if (!b) return;
      $('tabbar').querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
      document.querySelectorAll('.tabpane').forEach(function (p) { p.classList.toggle('on', p.getAttribute('data-pane') === b.getAttribute('data-tab')); });
      setFocus('tools');
    });
    var persona = document.querySelector('.instructor .persona');
    if (persona) persona.addEventListener('click', function () { setFocus('instructor', true); });
    // generic segmented active state (delegated so rebuilt controls keep working)
    document.body.addEventListener('click', function (e) {
      var btn = e.target.closest('.seg button'); if (!btn) return;
      var seg = btn.closest('.seg'); seg.querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); }); btn.classList.add('on');
    });
    $('playBtn').addEventListener('click', function () {
      if (service.running) { service.stop(); $('playBtn').textContent = '▶'; $('playBtn').classList.add('paused'); }
      else { service.start(); $('playBtn').textContent = '⏸'; $('playBtn').classList.remove('paused'); }
    });
    $('speed').addEventListener('click', function (e) {
      var b = e.target.closest('[data-speed]'); if (!b) return;
      var v = +b.getAttribute('data-speed'); cmd({ action: 'set_speed', value: v });
      var fast = v >= 600; $('ffBadge').style.display = fast ? 'block' : 'none'; if (fast) $('ffBadge').textContent = '⚡ ' + v + '×';
    });
    // Settings → Values Display (Instruments / True / Both) drives the legacy All view.
    var oseg = $('overlaySeg2');
    if (oseg) oseg.addEventListener('click', function (e) { var b = e.target.closest('[data-overlay]'); if (!b) return; ui.overlay = b.getAttribute('data-overlay'); syncSeg('[data-overlay]', ui.overlay, 'overlay'); if (latest && ui.plant !== 'pwr') renderPdAll(latest); });
    // Settings → Diagram Mode (Education = Learning | Realistic) + Physics Overlay (Learning only) — PWR synoptic
    var mseg = $('modeSeg');
    if (mseg) mseg.addEventListener('click', function (e) {
      var b = e.target.closest('[data-mode]'); if (!b) return;
      ui.diagMode = b.getAttribute('data-mode');
      if (ui.diagMode === 'realistic') ui.physOverlay = false;
      syncOverlayRow();
      if (latest) render(latest);
    });
    var pseg = $('physSeg');
    if (pseg) pseg.addEventListener('click', function (e) {
      var b = e.target.closest('[data-phys]'); if (!b) return;
      ui.physOverlay = b.getAttribute('data-phys') === 'on';
      if (latest) render(latest);
    });
    syncOverlayRow();
    $('registerSeg').addEventListener('click', function (e) { var b = e.target.closest('[data-register]'); if (!b) return; ui.register = b.getAttribute('data-register'); cmd({ action: 'set_register', value: ui.register }); });
    $('unitsSeg').addEventListener('click', function (e) { var b = e.target.closest('[data-units]'); if (!b) return; applyUnitsMode(b.getAttribute('data-units')); });
    $('graphParams').addEventListener('change', function (e) { var cb = e.target.closest('input[data-series]'); if (!cb) return; ui.series[cb.getAttribute('data-series')] = cb.checked; drawChart(); });
    $('graphWindow').addEventListener('click', function (e) { var b = e.target.closest('[data-win]'); if (!b) return; ui.window = +b.getAttribute('data-win'); drawChart(); });
    $('loadFile').addEventListener('change', function (e) {
      var f = e.target.files[0]; if (!f) return; var r = new FileReader();
      r.onload = function () { try { var st = JSON.parse(r.result); service.loadState(st); afterPlantChange(); diagReset('restore', { engine_key: ui.engineKey }); showToast('State loaded — ' + f.name); } catch (err) { showToast('Not a valid save file: ' + f.name, 'error'); } };
      r.readAsText(f);
    });
    // --- plant-display wiring ---
    $('viewTabs').addEventListener('click', function (e) { var b = e.target.closest('[data-view]'); if (b) setView(b.getAttribute('data-view')); });
    // status-bar slot click = acknowledge an auto-actuation (red → green)
    $('statusBar').addEventListener('click', function (e) { var sl = e.target.closest('.sys-slot'); if (!sl) return; ui.pdAck[sl.getAttribute('data-slot')] = true; if (latest) renderStatusBar(latest); });
    // All-view overlay seg
    $('viewArea').addEventListener('click', function (e) { var b = e.target.closest('#pdOverlaySeg [data-overlay]'); if (!b) return; ui.overlay = b.getAttribute('data-overlay'); syncSeg('[data-overlay]', ui.overlay, 'overlay'); if (latest) renderPdAll(latest); });
    setupPdScram();
    // --- Operator's Manual overlay ---
    $('manualBtn').addEventListener('click', openManual);
    $('manualClose').addEventListener('click', closeManual);
    $('manualOverlay').addEventListener('click', function (e) { if (e.target === $('manualOverlay')) closeManual(); });
    $('manualNav').addEventListener('click', function (e) { var b = e.target.closest('[data-msec]'); if (!b) return; ui.manualSection = b.getAttribute('data-msec'); renderManual(); });
    $('manualContent').addEventListener('click', function (e) { var b = e.target.closest('[data-follow]'); if (!b) return; followProcedure(b.getAttribute('data-follow')); });
    // Manual table filter (glossary / indications) — hides non-matching rows.
    $('manualContent').addEventListener('input', function (e) {
      if (e.target.id !== 'mFilter') return;
      var q = e.target.value.trim().toLowerCase();
      $('manualContent').querySelectorAll('.m-table tr').forEach(function (tr) {
        if (tr.querySelector('th')) return;   // keep header rows
        tr.style.display = (!q || tr.textContent.toLowerCase().indexOf(q) !== -1) ? '' : 'none';
      });
    });
    // Both button rows (walkthrough nav + scenario Acknowledge/Rewind) carry
    // data-fnav buttons — listen at the card so one handler covers them.
    $('instructorCard').addEventListener('click', function (e) { var b = e.target.closest('[data-fnav]'); if (!b) return; followNav(b.getAttribute('data-fnav')); });
    // Acknowledge = the scenario "Continue" (a manual beat trigger). Clicking it
    // also releases the commentary dwell — the reader said they're done reading.
    $('instrAck').addEventListener('click', function () { msgHold.at = 0; cmd({ action: 'instructor_continue' }); });
    // Level Complete actions (Continue / Retry / Rewind) render inside the card.
    $('instructorCard').addEventListener('click', function (e) {
      var cb = e.target.closest('[data-chatbtn]');
      if (cb) { chatButtonAction(cb.getAttribute('data-chatbtn'), +cb.getAttribute('data-chatspeed') || 60); return; }
      var b = e.target.closest('[data-lc]'); if (!b) return; levelCompleteAction(b.getAttribute('data-lc'));
    });
    // Plant & Mission window: plant / mode / start-condition picks re-render in
    // place; the start buttons close the window and launch.
    $('missionBtn').addEventListener('click', openMissionSelect);
    $('simStatus').addEventListener('click', openMissionSelect);   // the always-visible entry point
    $('missionClose').addEventListener('click', closeMissionSelect);
    // Help overlay — the one-screen "how this control room works" guide.
    $('helpBtn').addEventListener('click', function () { $('helpOverlay').hidden = false; });
    $('helpClose').addEventListener('click', function () { $('helpOverlay').hidden = true; });
    $('helpOverlay').addEventListener('click', function (e) { if (e.target === $('helpOverlay')) $('helpOverlay').hidden = true; });
    $('missionOverlay').addEventListener('click', function (e) {
      if (e.target === $('missionOverlay')) { closeMissionSelect(); return; }
      var pc = e.target.closest('[data-mplant]');
      if (pc) {
        msel.engine = pc.getAttribute('data-mplant');
        msel.init = ENGINES[msel.engine].init;
        renderMissionSelect(); return;
      }
      var mm = e.target.closest('[data-mmode]');
      if (mm) { msel.mode = mm.getAttribute('data-mmode'); renderMissionSelect(); return; }
      var ir = e.target.closest('[data-minit]');
      if (ir) { msel.init = ir.getAttribute('data-minit'); renderMissionSelect(); return; }
      if (e.target.closest('[data-mfree]')) {
        closeMissionSelect(); switchEngine(msel.engine, msel.init); return;
      }
      var cc = e.target.closest('[data-camp-continue]');
      if (cc) {
        var fm = campaignFrontier(msel.engine);
        if (fm) { closeMissionSelect(); if (fm.kind !== 'scenario') ensureEngine(msel.engine); startMission(fm); buildTraining(); }
        return;
      }
      var cs = e.target.closest('[data-camp-start]');
      if (cs) {
        var kv = cs.getAttribute('data-camp-start').split(':');
        closeMissionSelect();
        if (kv[0] !== 'scenario') ensureEngine(msel.engine);
        startMission({ kind: kv[0], id: kv[1] }); buildTraining(); return;
      }
      var st = e.target.closest('[data-trstart]');
      if (st) { closeMissionSelect(); startScenario(st.getAttribute('data-trstart')); buildTraining(); return; }
      if (e.target.closest('[data-trstop]')) {
        ui.scenario = null; cmd({ action: 'stop_scenario' }); buildTraining();
        if (latest) renderInstructor(latest); return;
      }
      var f = e.target.closest('[data-follow]');
      if (f) { closeMissionSelect(); ensureEngine(msel.engine); followProcedure(f.getAttribute('data-follow')); }
    });
    // First-run Hook invitation (prompted, never forced — Gameplay §7.1).
    $('hookStart').addEventListener('click', function () { $('hookPrompt').hidden = true; startScenario('pwr_hook'); buildTraining(); });
    $('hookSkip').addEventListener('click', function () { $('hookPrompt').hidden = true; saveProgress({ hook_done: true }); });
    // Global keyboard shortcuts (documented in the ? help card). Skipped while
    // typing in a field or holding a modifier; Space is left alone when a
    // button/control has focus so native activation (incl. rod hold) still works.
    var SPEED_KEYS = { '1': 1, '2': 10, '3': 60, '4': 600, '5': 3600 };
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (!$('manualOverlay').hidden) closeManual();
        if (!$('missionOverlay').hidden) closeMissionSelect();
        if (!$('helpOverlay').hidden) $('helpOverlay').hidden = true;
        if (ui.rewindPick) toggleRewindPick(false);
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key === ' ') {
        if (t && (t.tagName === 'BUTTON' || t.closest && t.closest('[data-hold]'))) return;   // native activation wins
        e.preventDefault(); $('playBtn').click(); return;
      }
      if (SPEED_KEYS[e.key]) {
        var sb = document.querySelector('#speed [data-speed="' + SPEED_KEYS[e.key] + '"]');
        if (sb) sb.click(); return;
      }
      if (e.key === 'a' || e.key === 'A') { cmd({ action: 'acknowledge_all_alarms' }); return; }
      if (e.key === 'm' || e.key === 'M') { $('manualOverlay').hidden ? openManual() : closeManual(); return; }
      if (e.key === '?') { $('helpOverlay').hidden = !$('helpOverlay').hidden; return; }
    });
    // Strip-chart rewind: the ⏪ by the scrubber + click-to-pick on the plot.
    // The scrubber track is the same affordance — clicking the timeline opens
    // pick-a-moment mode (it used to be decoration that looked draggable).
    $('chartRewindBtn').addEventListener('click', function () { rewindPressed(); });
    $('scrubTrack').addEventListener('click', function () {
      if (service && service.checkpoints && service.checkpoints.length) toggleRewindPick();
    });
    document.querySelector('.chart-plot').addEventListener('click', rewindPickClick);
    // System Scanner — hover OR tap (touch devices have no hover; a click on
    // any hinted element also explains it, alongside whatever the click does).
    function scannerShow(e) {
      var el = e.target.closest('[data-scanner-hint]'); if (!el) return;
      var hint = el.getAttribute('data-scanner-hint'), dash = hint.indexOf(' — ');
      $('scanner').innerHTML = dash > -1 ? '<strong>' + hint.slice(0, dash) + '</strong>' + hint.slice(dash) : hint;
    }
    document.body.addEventListener('mouseover', scannerShow);
    document.body.addEventListener('click', scannerShow);
  }
  function syncSeg(sel, val, attr) { document.querySelectorAll(sel).forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-' + attr) === val); }); }
  // Physics Overlay control exists only in Learning (Education) mode — Realistic hides it entirely.
  // Values Display drives only the legacy RBMK/BWR All view — on the PWR the
  // synoptic owns its truth presentation, so the row is hidden (an on-screen
  // setting must never silently do nothing).
  function syncOverlayRow() {
    var row = $('overlayRow'); if (row) row.style.display = ui.diagMode === 'realistic' ? 'none' : '';
    var vr = $('valuesRow'); if (vr) vr.style.display = ui.plant === 'pwr' ? 'none' : '';
    syncSeg('[data-mode]', ui.diagMode, 'mode');
    syncSeg('[data-phys]', ui.physOverlay ? 'on' : 'off', 'phys');
  }
  function applyUnitsMode(units) {
    ui.units = units;
    syncSeg('[data-units]', units, 'units');
    if (latest) render(latest);
    if ($('manualOverlay') && !$('manualOverlay').hidden) renderManual();
  }

  // ============================================================ Operator's Manual (Phase 3)
  // Renders RD.MANUAL (generated reference + normal values) and RD.MANUAL_PROCEDURES
  // (authored + engine-validated) for the active plant, register-aware.
  var MANUAL_SECTIONS = [
    { id: 'overview', label: 'Overview' }, { id: 'procedures', label: 'Procedures' },
    { id: 'accidents', label: 'Accidents' }, { id: 'alarms', label: 'Alarm Response' },
    { id: 'controls', label: 'Controls' }, { id: 'indications', label: 'Indications' },
    { id: 'setpoints', label: 'Setpoints & Limits' }, { id: 'normal', label: 'Normal Values' },
    { id: 'failures', label: 'Failures' }, { id: 'glossary', label: 'Glossary' },
  ];
  function mesc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function manualProfile() { return (RD.MANUAL || {})[ui.engineKey]; }
  var OPSYM = { '>': '≥', '<': '≤', '>=': '≥', '<=': '≤', '~': '≈' };   // acceptance display
  // Dimension of a dimensioned instrument-id / true_state field so the manual
  // converts to the active unit setting (US/SI) like the board. Everything else
  // (%, normalized, rods, MWe, RPM, cal/g/s) is unit-neutral and shown as-is.
  var MDIM = {
    primary_pressure: 'pressure', steam_pressure: 'pressure', vessel_pressure: 'pressure',
    tavg: 'temp', thot: 'temp', tcold: 'temp', fuel_temp: 'temp', condenser_vacuum: 'vacuum', subcooling_margin: 'tempdiff',
    pressure_mpa: 'pressure', steam_pressure_mpa: 'pressure', vessel_pressure_mpa: 'pressure',
    tavg_c: 'temp', thot_c: 'temp', tcold_c: 'temp', fuel_temp_c: 'temp', graphite_temp_avg_c: 'temp',
    condenser_vacuum_kpa: 'vacuum', subcooling_c: 'tempdiff',
  };
  function mval(key, val, dp) {   // → { v:displayString, u:unitLabel } converted to active units
    return fmtManualCell(key, val, dp);
  }
  var MANUAL_U_DIM = { '°C': 'temp', 'C': 'temp', '°F': 'temp', 'MPa': 'pressure', 'psi': 'pressure', 'psia': 'pressure', 'kPa': 'vacuum', 'inHg': 'vacuum' };
  function unitStrToDim(u) { return MANUAL_U_DIM[u] || null; }
  function fmtManualCell(instrumentOrDim, val, dp) {   // instrument id, dim name, or SI unit label (°C, MPa, …)
    dp = dp == null ? 1 : dp;
    if (val == null) return { v: '—', u: '' };
    var dim = MDIM[instrumentOrDim] || unitStrToDim(instrumentOrDim);
    if (dim == null || (typeof val !== 'number' && typeof val !== 'string')) return { v: String(val), u: '' };
    if (typeof val === 'string') {
      if (val.indexOf('/') >= 0) {
        var parts = val.split('/').map(function (s) { return s.trim(); });
        var cv = parts.map(function (p) {
          var n = parseFloat(p);
          return isNaN(n) ? p : conv(n, dim).toFixed(dp);
        });
        return { v: cv.join(' / '), u: unit(dim) };
      }
      var pref = /^([<>=]+)\s*([\d.]+)$/.exec(val.trim());
      if (pref) {
        var pn = parseFloat(pref[2]);
        if (!isNaN(pn)) return { v: pref[1] + ' ' + conv(pn, dim).toFixed(dp), u: unit(dim) };
      }
      var lone = parseFloat(val);
      if (!isNaN(lone) && String(lone) === val.trim()) return { v: conv(lone, dim).toFixed(dp), u: unit(dim) };
      return { v: val, u: '' };
    }
    return { v: conv(val, dim).toFixed(dp), u: unit(dim) };
  }
  function fmtManualStr(instrumentOrDim, val, dp) {
    var sp = fmtManualCell(instrumentOrDim, val, dp);
    return sp.v + (sp.u ? ' ' + sp.u : '');
  }

  function openManual() { if (!manualProfile()) { showToast('Manual data not loaded.', 'error'); return; } $('manualOverlay').hidden = false; renderManual(); }
  function closeManual() { $('manualOverlay').hidden = true; }

  function renderManual() {
    var p = manualProfile(); if (!p) return;
    $('manualTitle').textContent = "Operator’s Manual — " + p.name;
    $('manualNav').innerHTML = MANUAL_SECTIONS.map(function (s) {
      return '<button data-msec="' + s.id + '" class="' + (ui.manualSection === s.id ? 'on' : '') + '">' + s.label + '</button>';
    }).join('');
    var fn = { overview: mOverview, procedures: mProcedures, accidents: mAccidents, alarms: mAlarms,
      controls: mControls, indications: mIndications, setpoints: mSetpoints, normal: mNormal, failures: mFailures,
      glossary: mGlossary }[ui.manualSection] || mOverview;
    $('manualContent').innerHTML = fn(p);
    $('manualContent').scrollTop = 0;
  }

  // shared procedure step + card renderers (single integrated voice, rich steps)
  function mStep(st, i) {
    var h = '<div class="m-step"><div class="n">' + (i + 1) + '</div><div>';
    h += '<div class="m-act">' + mesc(st.text) + '</div>';
    var meta = [];
    if (st.control) meta.push('<span class="m-pill">' + mesc(st.control) + '</span>');
    if (st.target) meta.push('<span class="m-target">Target: ' + mesc(st.target) + '</span>');
    if (st.acc) meta.push('<span class="m-acc">✓ when ' + mesc(st.acc.p) + ' ' + (OPSYM[st.acc.op] || st.acc.op) + ' ' + mesc(st.acc.v) + '</span>');
    if (st.saw) meta.push('<span class="m-acc">✓ observe ' + mesc(st.saw.p) + ' ' + (OPSYM[st.saw.op] || st.saw.op) + ' ' + mesc(st.saw.v) + '</span>');
    if (meta.length) h += '<div class="m-meta">' + meta.join(' ') + '</div>';
    if (st.note) h += '<div class="m-note">' + mesc(st.note) + '</div>';
    return h + '</div></div>';
  }
  function mProcCard(pr) {
    var h = '<div class="m-card"><div class="m-h">' + mesc(pr.title) + ' <span class="m-pill">' + mesc(pr.category) + '</span>' +
      '<button class="btn m-follow" data-follow="' + mesc(pr.id) + '">▶ Follow in Instructor</button></div>';
    h += '<div class="m-sub">Start from: ' + mesc(pr.from) + '</div>';
    if (pr.purpose) h += '<p style="margin:8px 0">' + mesc(pr.purpose) + '</p>';
    if (pr.prereq && pr.prereq.length) h += '<div class="m-sub2">Prerequisites</div><ul class="m-ul">' + pr.prereq.map(function (x) { return '<li>' + mesc(x) + '</li>'; }).join('') + '</ul>';
    if (pr.cautions && pr.cautions.length) h += '<div class="m-caution">' + pr.cautions.map(function (c) { return '⚠ ' + mesc(c); }).join('<br>') + '</div>';
    (pr.steps || []).forEach(function (st, i) { h += mStep(st, i); });
    if (pr.outcome) h += '<div class="m-outcome">✔ Outcome: ' + mesc(pr.outcome) + '</div>';
    return h + '</div>';
  }

  function mOverview(p) {
    var h = '<h2>' + mesc(p.name) + '</h2>';
    h += '<p class="one-liner">' + mesc(p.one_liner) + '</p>';
    h += '<p>' + mesc(p.overview) + '</p>';
    h += '<p class="muted">Units: ' + mesc(p.authentic_units) + '</p>';
    h += '<h3>Operating states</h3><table class="m-table"><tr><th>State</th><th>Description</th></tr>';
    for (var k in p.normal_values) h += '<tr><td class="mono">' + mesc(k) + '</td><td>' + mesc(p.normal_values[k].label) + '</td></tr>';
    return h + '</table>';
  }

  function mProcedures(p) {
    var procs = ((RD.MANUAL_PROCEDURES || {})[ui.engineKey] || []).filter(function (x) { return x.category !== 'accident'; });
    if (!procs.length) return '<p class="muted">No procedures authored for this plant yet.</p>';
    var order = ['startup', 'power', 'control', 'shutdown', 'emergency'];
    procs = procs.slice().sort(function (a, b) { return order.indexOf(a.category) - order.indexOf(b.category); });
    var h = '<h2>Procedures</h2>';
    procs.forEach(function (pr) { h += mProcCard(pr); });
    return h;
  }

  function mAccidents(p) {
    var accs = ((RD.MANUAL_PROCEDURES || {})[ui.engineKey] || []).filter(function (x) { return x.category === 'accident'; });
    if (!accs.length) return '<p class="muted">No accident walkthrough for this plant.</p>';
    var h = '<h2>Accident Walkthroughs</h2>';
    accs.forEach(function (pr) { h += mProcCard(pr); });
    return h;
  }

  function mAlarms(p) {
    var ar = p.alarm_response || [];
    if (!ar.length) return '<p class="muted">No alarms for this plant.</p>';
    var order = ['critical', 'warning', 'caution', 'status'], groups = {};
    ar.forEach(function (a) { (groups[a.priority] = groups[a.priority] || []).push(a); });
    var h = '<h2>Alarm Response</h2><p class="muted">What each annunciator means and what to do. Highest priority first.</p>';
    order.forEach(function (pr) {
      if (!groups[pr]) return;
      h += '<h3><span class="m-pill m-prio-' + pr + '">' + pr + '</span></h3>';
      h += '<table class="m-table"><tr><th>Alarm</th><th>What it means</th><th>Response</th></tr>';
      groups[pr].forEach(function (a) {
        h += '<tr><td>' + mesc(a.name) + '</td><td>' + mesc(a.means || '—') + '</td><td>' + mesc(a.response) + '</td></tr>';
      });
      h += '</table>';
    });
    return h;
  }

  function mControls(p) {
    var groups = {}; p.controls.forEach(function (c) { (groups[c.group] = groups[c.group] || []).push(c); });
    var h = '<h2>Controls</h2><p class="muted">The on-screen controls for this plant and what each does.</p>';
    Object.keys(groups).forEach(function (g) {
      h += '<h3>' + mesc(g) + '</h3><table class="m-table"><tr><th>Control</th><th>What it does</th></tr>';
      groups[g].forEach(function (c) {
        h += '<tr><td><b>' + mesc(c.control) + '</b></td><td>' + mesc(c.uses) + '</td></tr>';
      });
      h += '</table>';
    });
    return h;
  }

  function mIndications(p) {
    var h = '<h2>Indications</h2>' + mFilterBox('Filter readings…') +
      '<table class="m-table"><tr><th>Reading</th><th>What it shows</th><th>Unit</th><th>Range</th><th>Linked alarms</th></tr>';
    p.indications.forEach(function (ind) {
      var dim = MDIM[ind.id], unitStr = dim ? unit(dim) : (ind.unit || '');
      var rng = '—';
      if (ind.range) rng = dim ? (conv(ind.range[0], dim).toFixed(0) + '–' + conv(ind.range[1], dim).toFixed(0)) : (ind.range[0] + '–' + ind.range[1]);
      h += '<tr><td><b>' + mesc(ind.name) + '</b></td><td>' + mesc(ind.measures) + (ind.derived ? ' <span class="muted">(derived)</span>' : '') + '</td><td>' + mesc(unitStr) + '</td><td class="mono">' + mesc(rng) + '</td><td class="muted">' + mesc((ind.alarms || []).join(', ')) + '</td></tr>';
    });
    return h + '</table>';
  }

  function mSetpoints(p) {
    var s = p.setpoints, h = '<h2>Setpoints &amp; Limits</h2>';
    h += '<h3>Reactor-protection trips (scram)</h3><table class="m-table"><tr><th>Instrument</th><th>Dir</th><th>Setpoint</th><th>Action</th></tr>';
    s.trips.forEach(function (t) { h += '<tr><td class="mono">' + mesc(t.instrument) + '</td><td>' + mesc(t.direction) + '</td><td class="mono">' + mesc(fmtManualStr(t.instrument, t.setpoint, 1)) + '</td><td>' + mesc(t.action) + '</td></tr>'; });
    h += '</table>';
    if (s.actuations && s.actuations.length) {
      h += '<h3>Engineered-safety actuations</h3><table class="m-table"><tr><th>Instrument</th><th>Dir</th><th>Setpoint</th><th>Action</th><th>Condition</th></tr>';
      s.actuations.forEach(function (a) { h += '<tr><td class="mono">' + mesc(a.instrument) + '</td><td>' + mesc(a.direction) + '</td><td class="mono">' + mesc(fmtManualStr(a.instrument, a.setpoint, 1)) + '</td><td>' + mesc(a.action) + '</td><td class="muted">' + mesc(a.condition || '') + '</td></tr>'; });
      h += '</table>';
    }
    h += '<h3>Alarms</h3><table class="m-table"><tr><th>Alarm</th><th>Instrument</th><th>Setpoint</th><th>Priority</th></tr>';
    s.alarms.forEach(function (a) { var spStr = a.setpoint == null ? '—' : fmtManualStr(a.instrument, a.setpoint, 1); h += '<tr><td>' + mesc(a.name) + '</td><td class="mono">' + mesc(a.instrument) + '</td><td class="mono">' + mesc(spStr) + '</td><td><span class="m-pill m-prio-' + mesc(a.priority) + '">' + mesc(a.priority) + '</span></td></tr>'; });
    h += '</table>';
    h += '<h3>Safety limits</h3><table class="m-table"><tr><th>Limit</th><th>Value</th><th>Note</th></tr>';
    (p.safety_limits || []).forEach(function (l) {
      var dp = (l.u === '°C' || l.u === 'MPa') ? (typeof l.v === 'number' && l.v >= 100 ? 0 : 1) : 1;
      h += '<tr><td>' + mesc(l.name) + '</td><td class="mono">' + mesc(fmtManualStr(l.u, l.v, dp)) + '</td><td class="muted">' + mesc(l.note) + '</td></tr>';
    });
    return h + '</table>';
  }

  function mGlossary(p) {
    var h = '<h2>Glossary</h2>' + mFilterBox('Filter terms…') + '<table class="m-table"><tr><th>Term</th><th>Meaning</th></tr>';
    (p.glossary || []).forEach(function (g) { h += '<tr><td><b>' + mesc(g.acronym) + '</b></td><td>' + mesc(g.term) + '</td></tr>'; });
    return h + '</table>';
  }
  // Client-side row filter for the manual's long tables (glossary, indications).
  function mFilterBox(placeholder) {
    return '<input class="num-input m-filter" id="mFilter" type="text" placeholder="' + esc(placeholder) + '">';
  }

  // Value formatting for the Normal Values tables, per the CONTEXT display
  // conventions: normalized flows and void fractions show ×100 with a % sign,
  // _pct fields get their % sign, and the reactivity/BOP proxies get their
  // domain units. Dimensioned fields (pressure/temp/vacuum) convert via mval.
  function tsCell(f, x) {
    if (/_normalized$/.test(f) || /^(leak_flow|charging_flow_actual|letdown_flow_actual|steam_to_turbine)$/.test(f) ||
        f === 'void_fraction_avg' || f === 'core_void_fraction') return Math.round(x * 100) + ' %';
    if (/_pct(_eq)?$/.test(f)) return Math.round(x * 10) / 10 + ' %';
    if (/_pcm$/.test(f)) return Math.round(x) + ' pcm';
    if (/_dpm$/.test(f)) return Math.round(x * 100) / 100 + ' DPM';
    if (f === 'reactor_period_s') return (!isFinite(x) || Math.abs(x) >= 1e6) ? 'steady' : Math.round(x * 10) / 10 + ' s';
    if (f === 'turbine_rpm') return Math.round(x) + ' RPM';
    if (f === 'mwe_output' || /_mwe$/.test(f)) return Math.round(x) + ' MWe';
    if (/_ppm$/.test(f)) return Math.round(x) + ' ppm';
    if (f === 'orm_equiv_rods') return Math.round(x * 10) / 10 + ' rods';
    var m = mval(f, x, 1); return m.v + (m.u ? ' ' + m.u : '');
  }
  function mNormal(p) {
    var h = '<h2>Normal Values</h2><p class="muted">Representative readings captured from the engine at each state (operating states settled to steady; startup / accident states near their initial condition).</p>';
    // Board-language labels for the raw true_state field ids (generated with the
    // manual). An unlabelled field shows its raw id — visible, not hidden.
    var labels = p.ts_labels || {};
    for (var k in p.normal_values) {
      var nv = p.normal_values[k], ts = nv.true_state;
      h += '<h3>' + mesc(k) + ' <span style="text-transform:none;letter-spacing:0;color:var(--muted)">— ' + mesc(nv.label) + '</span></h3>';
      h += '<table class="m-table"><tr><th>Parameter</th><th>Value</th></tr>';
      Object.keys(ts).forEach(function (f) {
        var lbl = labels[f] ? '<td>' + mesc(labels[f]) + '</td>' : '<td class="mono">' + mesc(f) + '</td>';
        if (typeof ts[f] === 'boolean') { h += '<tr>' + lbl + '<td class="mono">' + (ts[f] ? 'yes' : 'no') + '</td></tr>'; return; }
        if (typeof ts[f] !== 'number') return;
        h += '<tr>' + lbl + '<td class="mono">' + mesc(tsCell(f, ts[f])) + '</td></tr>';
      });
      h += '</table>';
    }
    return h;
  }

  function mFailures(p) {
    var groups = {}; p.failures.forEach(function (f) { (groups[f.category || 'other'] = groups[f.category || 'other'] || []).push(f); });
    var h = '<h2>Failures</h2><p class="muted">Injectable faults for abnormal / emergency training (Failures tab). Grouped by system category.</p>';
    Object.keys(groups).forEach(function (g) {
      h += '<h3>' + mesc(g) + '</h3><table class="m-table"><tr><th>Failure</th><th>id</th><th>Severity range</th></tr>';
      groups[g].forEach(function (f) {
        var sev = f.severity_meta ? (f.severity_meta.label + ': ' + f.severity_meta.min + '–' + f.severity_meta.max + ' ' + (f.severity_meta.unit || '')) : '—';
        h += '<tr><td>' + mesc(f.display) + '</td><td class="mono">' + mesc(f.id) + '</td><td class="muted">' + mesc(sev) + '</td></tr>';
      });
      h += '</table>';
    });
    return h;
  }

  // Plant-display SCRAM: 2-click arm (CONFIRM within 3 s), then fire.
  function setupPdScram() {
    var btn = $('pdScram'), timer = null;
    btn.addEventListener('click', function () {
      if (btn.classList.contains('fired')) return;
      if (btn.classList.contains('armed')) { btn.classList.remove('armed'); if (timer) clearTimeout(timer); btn.textContent = prof().scramShort; cmd({ action: 'scram' }); return; }
      btn.classList.add('armed'); btn.textContent = 'CONFIRM';
      // auto-disarm after 3 s — but don't overwrite a "SCRAMMED" label if the plant
      // tripped from another cause while armed
      timer = setTimeout(function () { if (btn.classList.contains('fired')) return; btn.classList.remove('armed'); btn.textContent = prof().scramShort; }, 3000);
    });
  }

  // Switch engine (PWR / RBMK pre / RBMK post / BWR): select the plant + version,
  // then rebuild every plant-specific surface. `init` is the optional starting
  // condition (Plant & Mission → Free Play); default is the engine's own.
  function switchEngine(key, init) {
    var e = ENGINES[key]; if (!e) return;
    ui.engineKey = key; ui.plant = e.plant; ui.initState = init || e.init;
    ui.scenario = null; ui.follow = null;   // a manual plant switch ends instructed content
    ui.series = Object.assign({}, prof().defaultSeries);
    service.stop(); $('playBtn').textContent = '▶'; $('playBtn').classList.add('paused');
    service.handleCommand({ action: 'reset', plant_id: e.plant, initial_state: ui.initState, design_version: e.dv });
    rebuildPlantUI();
    diagReset('plant_change', { engine_key: key, initial_state: ui.initState });
  }

  function rebuildPlantUI() {
    chartBuf = []; smoothed = {};
    buildGauges(); buildGraphParams(); updateSimSummary(); buildFailures();
    // The control layer already reset its channels and engaged the plant's
    // normal lineup (M5 selectPlant → engageDefaults); the tab just rebuilds.
    buildAutomate();
    buildPlantDisplay();
    syncOverlayRow();   // per-plant settings rows (Values Display is legacy-view only)
    buildAdvFail();     // advanced instrument-failure panel follows the active plant
    var ps = $('pdScram'); if (ps && !ps.classList.contains('fired') && !ps.classList.contains('armed')) ps.textContent = prof().scramShort;
    buildTraining();   // walkthrough list follows the active plant
    latest = service.assembleSnapshot(); render(latest);
    if (!$('manualOverlay').hidden) renderManual();   // keep the manual in sync on plant switch
  }

  // After load: derive the plant from the restored snapshot, set the selector, rebuild.
  function afterPlantChange() {
    var snap = service.assembleSnapshot();
    ui.plant = snap.metadata.plant_id;
    var dv = snap.metadata.design_version;
    ui.engineKey = ui.plant === 'rbmk' ? (dv === 'post_chernobyl' ? 'rbmk_post' : 'rbmk_pre') : ui.plant;
    ui.series = Object.assign({}, prof().defaultSeries);
    rebuildPlantUI();
  }

  function doReset() {
    if (!confirm('Reset to ' + ui.initState + '? Current run is lost.')) return;
    ui.scenario = null; ui.follow = null;   // a plant reset ends instructed content
    service.stop();
    service.handleCommand({ action: 'reset', plant_id: ui.plant, initial_state: ui.initState, design_version: ENGINES[ui.engineKey].dv });
    $('playBtn').textContent = '▶'; $('playBtn').classList.add('paused');
    rebuildPlantUI();
  }
  function downloadSave() {
    var data = JSON.stringify(service.saveState(), null, 2);
    var url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    var a = document.createElement('a'); a.href = url; a.download = 'reactor_save.json'; a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    showToast('State saved — reactor_save.json');
  }
  function exportCsv() {
    var cols = prof().series.filter(function (s) { return ui.series[s.id]; });
    var head = ['sim_time'].concat(cols.map(function (c) { return c.id; })).join(',');
    var rows = chartBuf.map(function (b) { return [b.t.toFixed(2)].concat(cols.map(function (c) { return c.get(b.ins).toFixed(3); })).join(','); });
    var url = URL.createObjectURL(new Blob([head + '\n' + rows.join('\n')], { type: 'text/csv' }));
    var a = document.createElement('a'); a.href = url; a.download = 'reactor_trend.csv'; a.click();
  }
  function hms(sec) {
    sec = Math.max(0, Math.floor(sec));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return [h, m, s].map(function (x) { return String(x).padStart(2, '0'); }).join(':');
  }

  // ============================================================ PLANT DISPLAY
  // The swappable redesign: a system status bar + a 4-view switcher (Diagram /
  // Primary / Secondary / All) in place of the classic control strip + synoptic.
  // Reuses the same control-group renderer (ctlGroup) and display helpers.

  var BADGE_TEXT = {
    rcp: { running: 'RUNNING', caution: 'DEGRADED', alarm: 'TRIPPED' },
    mcp: { running: 'RUNNING', caution: 'REDUCED', alarm: 'LOST' },
    recirc: { running: 'RUNNING', caution: 'NAT CIRC', alarm: 'LOST' },
    eccs: { running: 'ACTUATED', caution: 'DEGRADED', alarm: 'ACTUATED' },
    porv_block: { running: 'OPEN', caution: 'OPEN', alarm: 'FAILED' },
    afw: { running: 'RUNNING', caution: 'RUNNING', alarm: 'FAILED' },
    msiv: { alarm: 'ISOLATED' },
    cont_iso: { alarm: 'ISOLATED' },
    station_pwr: { caution: 'BATTERY', alarm: 'BLACKOUT' },
    eps: { caution: 'BYPASSED', alarm: 'BYPASSED' },
    slc: { running: 'INJECTING', alarm: 'FAILED' },
    rcic: { running: 'RUNNING', alarm: 'FAILED' },
    hpci: { running: 'RUNNING', alarm: 'FAILED' },
    ads: { running: 'OPEN', caution: 'OPEN' },
    lpci: { running: 'RUNNING' },
  };

  function hasFail(s, id) { return s.active_failures.some(function (f) { return f.id === id; }); }
  // ECCS/AFW auto-actuation reads ALARM (red) until the operator acknowledges it
  // (slot click) — or RUNNING (green) immediately if operator-initiated.
  function actuated(s, id, on) {
    if (!on) { ui.pdAck[id] = false; ui.pdOp[id] = false; return 'normal'; }
    return (ui.pdAck[id] || ui.pdOp[id]) ? 'running' : 'alarm';
  }
  function rg(s, fn) { var g = rodGroup(s, fn); return g ? (g.steps + ' / ' + g.max_steps) : '—'; }
  // Rod-bank readout with motion/scram status — makes the shutdown bank's state
  // (parked out, driving in, or scrammed) legible as it moves.
  function bankStat(s, fn) {
    var g = rodGroup(s, fn); if (!g) return '—';
    var base = g.steps + ' / ' + g.max_steps;
    if (g.scrammed) return base + ' · SCRAMMED';
    if (g.moving) return base + (g.direction > 0 ? ' · withdrawing' : ' · inserting');
    if (fn === 'shutdown' && g.position_pct >= 99.5) return base + ' · parked out';
    return base;
  }
  function sur(s) { var v = s.true_state.startup_rate_dpm; if (v == null) return '—'; return Math.abs(v) < 0.01 ? { dim: v.toFixed(2) + ' dpm' } : v.toFixed(2) + ' dpm'; }

  function R(k, get, opts) { var r = { k: k, get: get }; if (opts) for (var o in opts) r[o] = opts[o]; return r; }

  // control-group literals reused across the plant-display views
  function CG_ECCS() { return { l: 'ECCS', emergency: 1, hint: 'Emergency Core Cooling — high-pressure injection. AUTO actuates on low pressure.', seg: [{ l: 'Auto', act: 'eccs-auto', on: 1, run: 1 }, { l: 'On', act: 'eccs-on' }, { l: 'Off', act: 'eccs-off' }] }; }
  function CG_MSIV() { return { l: 'MSIV', hint: 'Main Steam Isolation Valve' + (ui.plant === 'bwr' ? ' — isolates main steam (closes the turbine path).' : ' — (steam-line isolation; modeled on the BWR; placeholder here).'), seg: [{ l: 'Open', act: 'msiv-open', on: 1 }, { l: 'Close', act: 'msiv-close', warn: 1 }] }; }

  // (legacy PWR partial-loop diagrams retired — the synoptic in
  //  ui/diagram/pwr_synoptic.js is the sole PWR plant display)


  var PD = {
    rbmk: {
      slots: [
        { id: 'mcp', label: 'MCP', group: 'nuclear' }, { id: 'eccs', label: 'ECCS', group: 'nuclear' }, { id: 'eps', label: 'EPS', group: 'nuclear' },
        { id: 'afw', label: 'Feed', group: 'secondary' }, { id: 'station_pwr', label: 'Stn Pwr', group: 'power' },
      ],
      state: function (s) {
        // HR1: the board colors from the INSTRUMENT (lagging/failable) where a
        // twin exists — a stuck flow channel must fool the schematic too.
        var f = s.control_state.channel_flow_setpoint_pct != null ? s.instruments.channel_flow : 100;
        return {
          mcp: f > 50 ? 'running' : (f > 10 ? 'caution' : 'alarm'),
          eccs: s.true_state.eccs_active ? 'running' : 'normal',   // no instrument twin
          eps: s.instruments.eps_bypassed ? 'caution' : 'normal',
          afw: hasFail(s, 'loss_of_feedwater') ? 'alarm' : (s.control_state.feedwater_flow_pct > 5 ? 'running' : 'caution'),
          station_pwr: 'normal',
        };
      },
      diagram: [ROD_DRIVE('control_rods'), AR_DRIVE(), { l: 'EPS', emergency: 1, hint: 'Emergency Protection bypass.', seg: [{ l: 'Active', act: 'eps-off', on: 1, run: 1 }, { l: 'Bypass', act: 'eps-on', warn: 1 }] }],
      primary: {
        sections: [
          { title: 'Reactor Core', rows: [
            R('Power', function (s) { return s.instruments.power_range.toFixed(1) + ' %'; }), R('Control Rods', function (s) { return bankStat(s, 'control'); }), R('AR Rods', function (s) { return bankStat(s, 'auto'); }), R('Shutdown Bank', function (s) { return bankStat(s, 'shutdown'); }),
            R('Startup Rate', sur), R('Fuel Temp', function (s) { return dispT(s.instruments.fuel_temp); }), R('Graphite Temp', function (s) { return dispT(s.true_state.graphite_temp_avg_c); }),
            R('Scrammed', function (s) { return bool(s.rps_state.scrammed, 'YES', 'no'); }),
          ] },
          { title: 'Reactivity & ORM', rows: [
            R('ORM', function (s) { return s.instruments.orm_display.toFixed(1) + ' rods'; }), R('ORM Alarm', function (s) { return bool(s.true_state.orm_alarm_active, 'YES', 'no'); }),
            R('Void', function (s) { return pctOf(s.instruments.void_fraction); }), R('Reactivity', function (s) { return (s.true_state.reactivity_pcm >= 0 ? '+' : '') + s.true_state.reactivity_pcm.toFixed(0) + ' pcm'; }),
            R('Xenon', function (s) { return s.true_state.xenon_pct_eq.toFixed(0) + ' %'; }),
          ] },
          { title: 'Coolant Channels', rows: [
            R('Channel Flow', function (s) { return s.instruments.channel_flow.toFixed(0) + ' %'; }), R('EPS Bypassed', function (s) { return bool(s.true_state.eps_bypassed, 'YES', 'no'); }),
            R('Emergency Core Cooling', function (s) { return bool(s.true_state.eccs_active, 'INJECTING', 'standby'); }),
          ] },
        ],
        controls: [ROD_DRIVE('control_rods'), ROD_SPEED(), AR_DRIVE(), SHUTDOWN_DRIVE('shutdown_rods'),
          { l: 'MCP / Channel Flow', num: { id: 'rbmkFlow', min: 0, max: 120, value: 100, act: 'rbmk-flow-set', setL: 'Set %' } },
          { l: 'Emergency Core Cooling (ECCS)', emergency: 1, hint: 'Injects to the fuel channels on a pressure-tube rupture / loss of coolant — makes up steam-drum level and holds a cooling-flow floor to arrest dryout.', seg: [{ l: 'On', act: 'rbmk-eccs-on', run: 1 }, { l: 'Off', act: 'rbmk-eccs-off', on: 1 }] },
          { l: 'EPS', emergency: 1, seg: [{ l: 'Active', act: 'eps-off', on: 1, run: 1 }, { l: 'Bypass', act: 'eps-on', warn: 1 }] }],
        cross: [R('Drum Level', function (s) { return s.instruments.drum_level.toFixed(0) + ' %'; }), R('Steam Press', function (s) { return dispP(s.instruments.steam_pressure); }), R('Turbine', function (s) { return pctOf(s.instruments.power_range / 100); })],
      },
      secondary: {
        sections: [
          { title: 'Steam Drum', rows: [
            R('Steam Pressure', function (s) { return dispP(s.instruments.steam_pressure); }), R('Drum Level', function (s) { return s.instruments.drum_level.toFixed(0) + ' %'; }),
          ] },
          { title: 'Turbine / Condenser', rows: [
            R('Electrical Output', function (s) { return s.instruments.mwe_output.toFixed(0) + ' MW'; }), R('Turbine RPM', function (s) { return s.instruments.turbine_rpm.toFixed(0); }),
            R('Cond. Vacuum', function (s) { return dispV(s.instruments.condenser_vacuum); }), R('Steam Dump', function (s) { return (s.control_state.steam_dump_auto ? 'auto ' : 'man ') + (s.control_state.steam_dump_pct || 0).toFixed(0) + ' %'; }),
          ] },
        ],
        controls: [
          { l: 'Feedwater', num: { id: 'rbmkFeed', min: 0, max: 100, value: 100, act: 'rbmk-feed-set', setL: 'Set %' } },
          { l: 'Turbine Load', num: { id: 'rbmkMwe', min: 0, max: 1000, value: 1000, act: 'rbmk-turbine-set', setL: 'Set MW' } },
          { l: 'Steam Dump', hint: 'Turbine bypass to the condenser — holds steam-drum pressure on a load rejection.', seg: [{ l: 'Auto', act: 'dump-auto', on: 1, run: 1 }, { l: 'Open', act: 'dump-open' }, { l: 'Closed', act: 'dump-close' }] }],
        cross: [R('Core Power', function (s) { return s.instruments.power_range.toFixed(0) + ' %'; }), R('Coolant Flow', function (s) { return s.instruments.channel_flow.toFixed(0) + ' %'; }), R('Void', function (s) { return pctOf(s.instruments.void_fraction); })],
      },
    },

    bwr: {
      slots: [
        { id: 'recirc', label: 'Recirc', group: 'nuclear' }, { id: 'rcic', label: 'RCIC', group: 'nuclear' }, { id: 'ic', label: 'IC', group: 'nuclear' }, { id: 'hpci', label: 'HPCI', group: 'nuclear' },
        { id: 'ads', label: 'ADS', group: 'nuclear' }, { id: 'lpci', label: 'LPCI', group: 'nuclear' }, { id: 'slc', label: 'SLC', group: 'nuclear' },
        { id: 'msiv', label: 'MSIV', group: 'secondary' }, { id: 'station_pwr', label: 'Stn Pwr', group: 'power' },
      ],
      state: function (s) {
        // HR1: color from INSTRUMENTS where twins exist (recirc_flow,
        // rcic_status — the failable run light, ads_open, station_blackout);
        // booleans with no twin read true_state as the only source.
        return {
          recirc: s.instruments.recirc_flow > 50 ? 'running' : (s.instruments.recirc_flow > 5 ? 'caution' : 'alarm'),
          rcic: (s.instruments.rcic_status) ? 'running' : (hasFail(s, 'rcic_failure') ? 'alarm' : 'normal'),
          ic: (s.true_state.ic_condensing) ? 'running' : (hasFail(s, 'ic_failure') ? 'alarm' : 'normal'),
          hpci: (s.true_state.hpci_running) ? 'running' : (hasFail(s, 'hpci_failure') ? 'alarm' : 'normal'),
          ads: s.instruments.ads_open ? 'running' : 'normal',
          lpci: s.true_state.lpci_running ? 'running' : 'normal',
          slc: s.true_state.slc_active ? 'running' : 'normal',
          msiv: hasFail(s, 'msiv_closure') ? 'alarm' : 'normal',
          station_pwr: s.instruments.station_blackout ? (s.true_state.battery_charge_pct > 0 ? 'caution' : 'alarm') : 'normal',
        };
      },
      diagram: [ROD_DRIVE('control_rods'), { l: 'ADS', emergency: 1, hint: 'Automatic Depressurization.', seg: [{ l: 'Trigger', act: 'trigger-ads', warn: 1 }] }, CG_MSIV()],
      primary: {
        sections: [
          { title: 'Reactor Core', rows: [
            R('Power', function (s) { return s.instruments.power_range.toFixed(1) + ' %'; }), R('Control Rods', function (s) { return bankStat(s, 'control'); }), R('Shutdown Bank', function (s) { return bankStat(s, 'shutdown'); }),
            R('Startup Rate', sur), R('Core Void', function (s) { return pctOf(s.instruments.core_void_fraction); }), R('Fuel Temp', function (s) { return dispT(s.true_state.fuel_temp_c); }),
            R('Scrammed', function (s) { return bool(s.rps_state.scrammed, 'YES', 'no'); }),
          ] },
          { title: 'Vessel', rows: [
            R('Pressure', function (s) { return dispP(s.instruments.vessel_pressure); }), R('Water Level', function (s) { return s.instruments.vessel_level.toFixed(0) + ' %'; }),
            R('Steam Flow', function (s) { return pctOf(s.instruments.steam_flow); }), R('Feedwater', function (s) { return pctOf(s.instruments.fw_flow); }),
          ] },
          { title: 'Recirculation', rows: [ R('Recirc / Core Flow', function (s) { return s.instruments.recirc_flow.toFixed(0) + ' %'; }) ] },
        ],
        controls: [ROD_DRIVE('control_rods'), ROD_SPEED(), SHUTDOWN_DRIVE('shutdown_rods'),
          { l: 'Recirc Drive', num: { id: 'bwrRecirc', min: 0, max: 48, value: 40, act: 'bwr-recirc-set', setL: 'Set %' } }],
        cross: [R('Turbine Steam', function (s) { return pctOf(s.instruments.steam_flow); }), R('Feedwater', function (s) { return pctOf(s.instruments.fw_flow); }), R('Turbine Load', function (s) { return (s.control_state.feedwater_flow_pct).toFixed(0) + ' %'; })],
      },
      secondary: {
        sections: [
          { title: 'Turbine / Condenser / Feedwater', rows: [
            R('Steam Flow', function (s) { return pctOf(s.instruments.steam_flow); }), R('Feedwater Flow', function (s) { return pctOf(s.instruments.fw_flow); }),
            R('Vessel Pressure', function (s) { return dispP(s.instruments.vessel_pressure); }),
            R('Electrical Output', function (s) { return s.instruments.mwe_output.toFixed(0) + ' MW'; }), R('Turbine RPM', function (s) { return s.instruments.turbine_rpm.toFixed(0); }),
            R('Cond. Vacuum', function (s) { return dispV(s.instruments.condenser_vacuum); }),
          ] },
          { title: 'Safety Systems', rows: [
            R('RCIC', function (s) { return bool(s.true_state.rcic_running, 'running', 'off'); }), R('Isolation Condenser', function (s) { return bool(s.true_state.ic_condensing, 'condensing', s.true_state.ic_active ? 'on' : 'off'); }), R('HPCI', function (s) { return bool(s.true_state.hpci_running, 'running', 'off'); }),
            R('ADS', function (s) { return bool(s.true_state.ads_open, 'OPEN', 'closed'); }), R('LPCI', function (s) { return bool(s.true_state.lpci_running, 'running', 'off'); }),
            R('Core Spray', function (s) { return bool(s.true_state.lpcs_running, 'running', 'off'); }), R('SLC', function (s) { return bool(s.true_state.slc_active, 'active', 'standby'); }),
            R('Battery', function (s) { return s.true_state.battery_charge_pct.toFixed(0) + ' %'; }),
          ] },
        ],
        controls: [
          { l: 'RCIC', emergency: 1, seg: [{ l: 'On', act: 'rcic-on', run: 1 }, { l: 'Off', act: 'rcic-off', on: 1 }] },
          { l: 'Isolation Condenser (IC)', emergency: 1, hint: 'Passive heat sink — condenses reactor steam and returns condensate by gravity; no AC needed (DC-powered valves). Holds the core covered on decay heat. Fukushima Unit 1 relied on one.', seg: [{ l: 'On', act: 'ic-on', run: 1 }, { l: 'Off', act: 'ic-off', on: 1 }] },
          { l: 'HPCI', emergency: 1, seg: [{ l: 'On', act: 'hpci-on', run: 1 }, { l: 'Off', act: 'hpci-off', on: 1 }] },
          { l: 'ADS', emergency: 1, seg: [{ l: 'Trigger', act: 'trigger-ads', warn: 1 }] },
          { l: 'LPCI', emergency: 1, seg: [{ l: 'Start', act: 'start-lpci', run: 1 }] },
          { l: 'Core Spray (LPCS)', emergency: 1, seg: [{ l: 'Start', act: 'start-lpcs', run: 1 }, { l: 'Stop', act: 'stop-lpcs', on: 1 }] },
          { l: 'Manual SRV', emergency: 1, seg: [{ l: 'Open', act: 'srv-open', warn: 1 }, { l: 'Close', act: 'srv-close', on: 1 }] },
          { l: 'Standby Liquid Control (SLC)', emergency: 1, seg: [{ l: 'Initiate', act: 'slc-initiate', warn: 1 }, { l: 'Stop', act: 'slc-stop', on: 1 }] },
          { l: 'Steam Dump', hint: 'Turbine bypass to the condenser (needs AC / condenser — inert in a station blackout).', seg: [{ l: 'Auto', act: 'dump-auto', on: 1, run: 1 }, { l: 'Open', act: 'dump-open' }, { l: 'Closed', act: 'dump-close' }] },
          { l: 'Turbine Load', num: { id: 'bwrMwe', min: 0, max: 1100, value: 1000, act: 'bwr-turbine-set', setL: 'Set MW' } },
          { l: 'Feedwater', num: { id: 'bwrFeed', min: 0, max: 100, value: 100, act: 'bwr-feed-set', setL: 'Set %' } }],
        cross: [R('Reactor Power', function (s) { return s.instruments.power_range.toFixed(0) + ' %'; }), R('Vessel Steam', function (s) { return pctOf(s.instruments.steam_flow); }), R('Core Void', function (s) { return pctOf(s.instruments.core_void_fraction); })],
      },
    },
  };
  function pd() { return PD[ui.plant]; }

  // ---- status bar ----
  function buildStatusBar() {
    var bar = $('statusBar'); bar.innerHTML = ''; ui.pdAck = {}; ui.pdOp = {};
    var slots = pd().slots, lastGroup = null;
    slots.forEach(function (sl) {
      if (lastGroup && sl.group !== lastGroup) bar.insertAdjacentHTML('beforeend', '<div class="bar-sep"></div>');
      lastGroup = sl.group;
      bar.insertAdjacentHTML('beforeend',
        '<div class="sys-slot" data-slot="' + sl.id + '"><span class="slot-dot"></span><span class="slot-name">' + sl.label + '</span><span class="slot-badge"></span></div>');
    });
    bar.insertAdjacentHTML('beforeend', '<span class="scram-badge" id="scramBadge">SCRAMMED</span>');
  }
  function renderStatusBar(s) {
    var states = pd().state(s);
    $('statusBar').querySelectorAll('.sys-slot').forEach(function (el) {
      var id = el.getAttribute('data-slot'), st = states[id] || 'normal';
      el.className = 'sys-slot state-' + st;
      var bt = BADGE_TEXT[id] || {}; el.querySelector('.slot-badge').textContent = bt[st] || '';
    });
    var sb = $('scramBadge'); if (sb) sb.classList.toggle('on', !!s.true_state.scrammed);
  }

  // ---- views ----
  var VIEWS = [['diagram', '⬡ Diagram'], ['primary', '⚛ Primary'], ['secondary', '♨ Secondary'], ['all', '≡ All']];
  var pdRows = {};   // view → [{el, get, subcool}]
  function buildViewSwitcher() {
    var t = $('viewTabs'); t.innerHTML = VIEWS.map(function (v) {
      return '<button class="view-btn' + (v[0] === ui.view ? ' active' : '') + '" data-view="' + v[0] + '">' + v[1] + '</button>';
    }).join('');
  }
  // A view's main content: either a plant schematic (its sensors carry the values)
  // or the parameter sections. Controls live in the shared control bar, not here.
  function buildCard(viewKey) {
    var v = pd()[viewKey], rows = [];
    if (v.diagram) { pdRows[viewKey] = rows; return v.diagram; }
    var html = '<div class="pd-sections">';
    v.sections.forEach(function (sec) {
      html += '<div class="pd-section"><h5>' + sec.title + '</h5>';
      sec.rows.forEach(function (r) { var idx = rows.length; rows.push(r); html += '<div class="pd-row' + (r.subcool ? ' subcool' : '') + '" data-pv="' + viewKey + '-' + idx + '"><span class="pk">' + r.k + '</span><span class="pv">—</span></div>'; });
      html += '</div>';
    });
    html += '</div>';
    pdRows[viewKey] = rows;
    return html;
  }
  // Controls shown in the shared control bar for the active view.
  function viewControls(v) {
    if (v === 'diagram') return pd().diagram || [];
    if (v === 'primary') return pd().primary.controls || [];
    if (v === 'secondary') return pd().secondary.controls || [];
    return [];
  }
  function populateControlBar() {
    var row = $('pdCtlRow'); if (!row) return; row.innerHTML = '';
    viewControls(ui.view).forEach(function (g) { row.appendChild(ctlGroup(g)); });
    // re-assert persisted selections on the freshly built bar (rod speed seg)
    row.querySelectorAll('[data-act^="rodspeed-"]').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-act') === 'rodspeed-' + ui.rodSpeed);
    });
  }
  function buildViews() {
    var area = $('viewArea'); pdRows = {};
    // Diagram view placeholder (RBMK/BWR keep the legacy plant display until
    // their own synoptic specs exist; the PWR mounts ui/diagram/pwr_synoptic.js)
    var diagHtml =
      '<div class="view-placeholder"><span>Plant diagram — SVG in development</span><span class="placeholder-sub">Energy flow: Reactor → ' + (ui.plant === 'bwr' ? 'Vessel → Turbine' : 'Drums → Turbine') + '</span></div>';
    var html = '';
    html += '<div class="pdview' + (ui.view === 'diagram' ? ' on' : '') + '" data-pdview="diagram">' + diagHtml + '</div>';
    html += '<div class="pdview' + (ui.view === 'primary' ? ' on' : '') + '" data-pdview="primary">' + buildCard('primary') + '</div>';
    html += '<div class="pdview' + (ui.view === 'secondary' ? ' on' : '') + '" data-pdview="secondary">' + buildCard('secondary') + '</div>';
    html += '<div class="pdview' + (ui.view === 'all' ? ' on' : '') + '" data-pdview="all">' +
      '<div class="pd-all-head"><div class="seg" id="pdOverlaySeg"><button class="on" data-overlay="instruments">Instruments</button><button data-overlay="true">True</button><button data-overlay="both">Both</button></div></div>' +
      '<div class="pd-all-grid" id="pdAllGrid"></div></div>';
    html += '<div class="ff-badge" style="display:none" id="ffBadge">⚡ 600×</div>';
    area.innerHTML = html;
    buildPdAll();
    populateControlBar();
    syncSeg('[data-overlay]', ui.overlay, 'overlay');   // All-view overlay seg reflects ui.overlay after a rebuild
  }
  // The All view mirrors the classic numeric grid.
  function buildPdAll() {
    var grid = $('pdAllGrid'); grid.innerHTML = '';
    prof().numeric.forEach(function (col, ci) {
      var c = document.createElement('div'); c.className = 'num-col';
      var html = '<h4>' + col.title + '</h4>';
      col.rows.forEach(function (r, ri) { html += '<div class="num-line" data-pdnum="' + ci + '-' + ri + '"><span class="nk">' + r.k + '</span><span class="nv" data-nv>—</span></div>'; });
      c.innerHTML = html; grid.appendChild(c);
    });
  }

  function renderPdRows(viewKey, s) {
    var rows = pdRows[viewKey]; if (!rows) return;
    rows.forEach(function (r, idx) {
      var el = document.querySelector('[data-pv="' + viewKey + '-' + idx + '"]'); if (!el) return;
      var valEl = el.querySelector('.pv');
      if (r.subcool) { renderSubcool(valEl, r.get(s)); return; }
      var v = r.get(s), cls = '';
      if (v && v.dim != null) { valEl.className = 'pv'; valEl.innerHTML = '<span class="dim-info">' + v.dim + '</span>'; return; }
      if (v && v.cls !== undefined) { valEl.textContent = v.t; cls = v.cls; }       // explicit severity
      else if (v && v.b !== undefined) { valEl.textContent = v.t; cls = boolClass(v.t); }
      else valEl.textContent = v;
      valEl.className = 'pv ' + cls;
    });
  }
  // Subcooling special treatment: bigger text, warn<22°C, alarm<11°C, SATURATED ≤0.
  function renderSubcool(el, c) {
    var st = c <= 0 ? 'alarm' : c < 11.1 ? 'alarm' : c < 22.2 ? 'warn' : '';
    var txt = dispTd(c) + (c <= 0 ? '<span class="sat-badge">SATURATED</span>' : '');
    el.className = 'pv ' + st; el.innerHTML = txt;
  }

  function renderPdAll(s) {
    var showInst = ui.overlay === 'instruments' || ui.overlay === 'both', showTruth = ui.overlay === 'true' || ui.overlay === 'both';
    prof().numeric.forEach(function (col, ci) {
      col.rows.forEach(function (r, ri) {
        var line = document.querySelector('[data-pdnum="' + ci + '-' + ri + '"]'); if (!line) return;
        var nv = line.querySelector('[data-nv]');
        var iv = r.inst ? r.inst(s) : null, tv = r.truth ? r.truth(s) : null, parts = [], cls = '';
        if (iv != null && showInst) { if (iv.b !== undefined) { parts.push(iv.t); cls = boolClass(iv.t); } else parts.push(iv); }
        if (tv != null && (showTruth || (iv == null && showInst))) {
          var ts = tv.b !== undefined ? tv.t : tv;
          if (iv == null) { parts = [ts]; if (tv.b !== undefined) cls = boolClass(tv.t); } else parts.push('<span class="true-tag">true ' + ts + '</span>');
        }
        if (iv == null && tv == null) parts = ['—'];
        if (iv == null && tv != null && !showTruth) parts = ['<span class="hidden-true">— overlay —</span>'];
        nv.innerHTML = parts.join(' '); nv.className = 'nv ' + cls;
      });
    });
  }

  function renderPlantDisplay(s) {
    // Cross-plant transition guard: a ?scenario= deep link (or any scenario
    // that switches the plant) can broadcast the NEW plant's snapshot before
    // ui.plant catches up — never feed a foreign snapshot to a display.
    var snapPlant = s && s.metadata && s.metadata.plant_id;
    if (snapPlant && snapPlant !== ui.plant) return;
    if (ui.plant === 'pwr') { RD.PwrSynoptic.render(s); return; }   // one synoptic stage — no views
    renderStatusBar(s);
    if (ui.view === 'primary' || ui.view === 'secondary') renderPdRows(ui.view, s);
    if (ui.view === 'all') renderPdAll(s);
    // pd scram button mirrors the reactor state
    var ps = $('pdScram');
    if (ps) { if (s.true_state.scrammed) { ps.classList.add('fired'); ps.classList.remove('armed'); ps.textContent = 'SCRAMMED'; } else if (!ps.classList.contains('armed')) { ps.classList.remove('fired'); ps.textContent = prof().scramShort; } }
  }

  function setView(v) {
    ui.view = v;
    $('viewTabs').querySelectorAll('.view-btn').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-view') === v); });
    $('viewArea').querySelectorAll('.pdview').forEach(function (p) { p.classList.toggle('on', p.getAttribute('data-pdview') === v); });
    populateControlBar();   // shared bar shows the active view's controls
    if (latest) renderPlantDisplay(latest);
  }

  // PWR: single full-plant synoptic (Blueprint/new_diagram_controls.md) replaces
  // the 4-view plant display. RBMK/BWR keep the legacy display until their own
  // diagram specs exist.
  function buildPlantDisplay() {
    var syn = ui.plant === 'pwr';
    document.querySelector('.app').classList.toggle('pwr-synoptic', syn);
    if (!syn && RD.PwrSynoptic && RD.PwrSynoptic.isMounted()) RD.PwrSynoptic.unmount();
    if (syn) {
      $('statusBar').innerHTML = ''; $('viewTabs').innerHTML = ''; $('pdCtlRow').innerHTML = '';
      RD.PwrSynoptic.mount($('viewArea'), {
        cmd: cmd, conv: conv, unit: unit,
        dispP: dispP, dispT: dispT, dispTd: dispTd, dispV: dispV,
        mode: function () { return ui.diagMode; },
        overlay: function () { return ui.physOverlay; },
      });
      return;
    }
    buildStatusBar(); buildViewSwitcher(); buildViews();
  }

  // ============================================================ init
  function init() {
    ui.series = Object.assign({}, PROFILES.pwr.defaultSeries);
    service = new RD.SimulationService({ seed: 0x1234 });
    service.subscribe(render);
    service.subscribe(diagTick);
    service.subscribe(renderAutomate);   // channels run in-stack; the tab just re-renders per broadcast
    if (RD.OneOverM) { RD.OneOverM.init({ getSnap: autoSnap }); service.subscribe(RD.OneOverM.tick); }
    bindUI(); bindCommands(); bindAutomate();
    // optional ?engine= override (dev convenience / sharing)
    var em = /[?&]engine=(pwr|rbmk_pre|rbmk_post|bwr)/.exec(location.search || '');
    var startKey = em ? em[1] : 'pwr', startEng = ENGINES[startKey];
    ui.engineKey = startKey; ui.plant = startEng.plant; ui.initState = startEng.init;
    ui.series = Object.assign({}, prof().defaultSeries);
    buildGauges(); buildGraphParams(); updateSimSummary();
    buildPlantDisplay();
    service.selectPlant(startEng.plant, ui.initState, startEng.dv);   // initial snapshot → render (defaults engaged in-stack)
    diagReset('init', { engine_key: startKey, initial_state: ui.initState });
    buildFailures();
    buildAutomate();
    // optional ?manual[=section] deep-link — opens the Operator's Manual on load
    var mm = /[?&]manual(?:=([a-z]+))?/.exec(location.search || '');
    if (mm) { if (mm[1]) ui.manualSection = mm[1]; openManual(); }
    // optional ?view= deep-link (diagram | primary | secondary | all — legacy plants only)
    var vm = /[?&]view=(diagram|primary|secondary|all)/.exec(location.search || '');
    if (vm && ui.plant !== 'pwr') setView(vm[1]);
    // dev conveniences for the synoptic (screenshots / acceptance checks):
    // ?mode=realistic|learning  ?phys=1  ?inject=id,id  ?ff=<sim seconds>  ?run=1
    var dm = /[?&]mode=(realistic|learning|education)/.exec(location.search || '');
    if (dm) { ui.diagMode = dm[1] === 'realistic' ? 'realistic' : 'learning'; }
    if (/[?&]phys=1/.test(location.search || '') && ui.diagMode !== 'realistic') ui.physOverlay = true;
    syncOverlayRow();
    var im = /[?&]inject=([a-z0-9_,]+)/.exec(location.search || '');
    if (im) im[1].split(',').forEach(function (id) { service.handleCommand({ action: 'inject_failure', failure_id: id, severity: 1 }); });
    var ffm = /[?&]ff=(\d+)/.exec(location.search || '');
    if (ffm) {
      var secs = Math.min(7200, +ffm[1]);
      service.handleCommand({ action: 'set_speed', value: 60 });
      service.advanceCycles(Math.ceil(secs / (60 * service.broadcastMs / 1000)));
      service.handleCommand({ action: 'set_speed', value: 1 });
    }
    if (im || ffm) { latest = service.assembleSnapshot(); render(latest); }
    // optional ?tab= deep-link — opens a Tools-Block tab (dev/screenshot convenience).
    // ?tab=training (the retired tab) opens the Plant & Mission window instead.
    var tbm = /[?&]tab=(failures|automate|graph|sim|settings|training|dev)/.exec(location.search || '');
    if (tbm) {
      if (tbm[1] === 'training') openMissionSelect();
      else { var tbtn = document.querySelector('#tabbar [data-tab="' + tbm[1] + '"]'); if (tbtn) tbtn.click(); }
    }
    // optional ?missions=1 deep-link — opens the Plant & Mission window
    // (?mmode=free|campaign|scenarios|walkthroughs picks the mode — dev/screenshots)
    var mmm = /[?&]mmode=(free|campaign|scenarios|walkthroughs)/.exec(location.search || '');
    if (mmm) msel.mode = mmm[1];
    if (/[?&]missions=1/.test(location.search || '')) openMissionSelect();
    // optional ?help=1 deep-link — opens the help guide (dev/screenshots)
    if (/[?&]help=1/.test(location.search || '')) $('helpOverlay').hidden = false;
    // optional ?auto=<id,id|all> deep-link — engages automation channels (dev convenience)
    var am = /[?&]auto=([a-z_,]+|all)/.exec(location.search || '');
    if (am) {
      if (am[1] === 'all') service.handleCommand({ action: 'set_auto_channel', channel_id: 'all', engaged: true });
      else am[1].split(',').forEach(function (id) { service.handleCommand({ action: 'set_auto_channel', channel_id: id, engaged: true }); });
      renderAutomate(service.assembleSnapshot());
    }
    if (/[?&]run=1/.test(location.search || '')) { service.start(); $('playBtn').textContent = '⏸'; $('playBtn').classList.remove('paused'); }
    // optional ?follow=<procId> deep-link — loads a procedure into the Instructor block
    var fm = /[?&]follow=([a-z0-9_]+)/.exec(location.search || '');
    if (fm) followProcedure(fm[1]);
    buildTraining();
    // optional ?scenario=<id> deep-link — starts an M6 scenario directly
    var scm = /[?&]scenario=([a-z0-9_]+)/.exec(location.search || '');
    if (scm && RD.SCENARIOS && RD.SCENARIOS[scm[1]]) { startScenario(scm[1]); buildTraining(); }
    // First-run Hook invitation (Gameplay §7.1): plain loads only — any deep link
    // (search string) or a completed/declined hook suppresses it.
    if (!location.search && !progress().hook_done && RD.SCENARIOS && RD.SCENARIOS.pwr_hook) {
      $('hookPrompt').hidden = false;
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
