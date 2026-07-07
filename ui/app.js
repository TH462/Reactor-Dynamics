/* ============================================================================
 * app.js — Reactor⚛️Dynamics control-room UI, wired to the live stack.
 *
 * Builds a SimulationService (M5) and renders each broadcast snapshot. The UI is
 * PLANT-DRIVEN: a profile (PROFILES[plant]) supplies the gauges, numeric grid,
 * strip-chart series, and controls for the active reactor, so the same shell
 * drives the PWR, the RBMK (pre/post-1986), and the BWR. The engine selector
 * (Sim tab) calls service.selectPlant() and rebuilds the plant-specific UI.
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
  var autoCtl = null;       // RD.AutoControl — operator automation (Automate tab)
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
  // Selector key → plant + design_version + default initial state.
  var ENGINES = {
    pwr:       { plant: 'pwr',  dv: null,              init: 'hot_full_power' },
    rbmk_pre:  { plant: 'rbmk', dv: 'pre_chernobyl',   init: 'full_power' },
    rbmk_post: { plant: 'rbmk', dv: 'post_chernobyl',  init: 'full_power' },
    bwr:       { plant: 'bwr',  dv: null,              init: 'full_power' },
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
          { k: 'Fuel Temp', inst: function (s) { return dispT(s.instruments.fuel_temp); }, truth: function (s) { return dispT(s.true_state.fuel_temp_c); } },
          { k: 'Graphite Temp', truth: function (s) { return dispT(s.true_state.graphite_temp_avg_c); } },
          { k: 'Decay Heat', truth: function (s) { return s.true_state.decay_heat_pct.toFixed(1) + ' %'; } },
          { k: 'Scrammed', inst: function (s) { return bool(s.rps_state.scrammed, 'YES', 'no'); } },
        ] },
        { title: 'Reactivity & ORM', rows: [
          { k: 'Operating Reactivity Margin (ORM)', inst: function (s) { return s.instruments.orm_display.toFixed(1) + ' rods'; }, truth: function (s) { return s.true_state.orm_equiv_rods.toFixed(1) + ' rods'; } },
          { k: 'ORM Alarm', inst: function (s) { return bool(s.true_state.orm_alarm_active, 'YES', 'no'); } },
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
          { k: 'Emergency Protection Bypassed (EPS)', inst: function (s) { return bool(s.true_state.eps_bypassed, 'YES', 'no'); } },
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
          { k: 'RCIC', inst: function (s) { return bool(s.true_state.rcic_running, 'running', 'off'); } },
          { k: 'HPCI', inst: function (s) { return bool(s.true_state.hpci_running, 'running', 'off'); } },
          { k: 'ADS', inst: function (s) { return bool(s.true_state.ads_open, 'OPEN', 'closed'); } },
          { k: 'LPCI', inst: function (s) { return bool(s.true_state.lpci_running, 'running', 'off'); } },
          { k: 'Core Spray', inst: function (s) { return bool(s.true_state.lpcs_running, 'running', 'off'); } },
          { k: 'Manual SRV', inst: function (s) { return bool(s.true_state.srv_manual_open, 'OPEN', 'closed'); } },
          { k: 'SLC (boron)', inst: function (s) { return bool(s.true_state.slc_active, 'active', 'standby'); } },
          { k: 'SLC Tank', truth: function (s) { return s.true_state.slc_tank_pct.toFixed(0) + ' %'; } },
          { k: 'Battery', truth: function (s) { return s.true_state.battery_charge_pct.toFixed(0) + ' %'; } },
        ] },
        { title: 'Status', rows: [
          { k: 'Station Blackout', inst: function (s) { return bool(s.true_state.station_blackout, 'YES', 'no'); } },
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

  function buildInitStates() {
    var sel = $('initState'); if (!sel) return;
    sel.innerHTML = prof().initStates.map(function (s) { return '<option value="' + s[0] + '">' + s[1] + '</option>'; }).join('');
    sel.value = ui.initState;
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

    renderGauges(s);
    renderAlarms(s); renderInstructor(s); renderReactimeter(s); renderFailures(s);
    // alarm tint on the CSF gauge strip while anything is unacknowledged
    $('gaugeStrip').classList.toggle('alarm-tint', s.alarms.some(function (a) { return a.state === 'active_unacknowledged'; }));
    // auto-switch to Diagram the moment a scram fires (legacy views only)
    if (ui.plant !== 'pwr' && s.true_state.scrammed && !lastScrammed && ui.view !== 'diagram') setView('diagram');
    renderPlantDisplay(s);
    lastScrammed = !!s.true_state.scrammed;

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
    if (!active.length) { stack.innerHTML = '<div class="alarm-empty">— no active alarms —</div>'; return; }
    stack.innerHTML = active.map(function (a) {
      var cat = alarmCategory(a.id);
      var sev = a.priority === 'critical' ? 'crit' : a.priority === 'warning' ? 'warn' : '';
      var unack = a.state === 'active_unacknowledged' ? ' unack' : '';
      var glyph = a.priority === 'critical' ? '⚠' : a.priority === 'warning' ? '△' : '●';
      return '<div class="alarm-tile ' + sev + unack + ' cat-' + cat + '" data-ack="' + a.id +
        '" data-scanner-hint="' + esc(a.tile_label) + ' — ' + a.priority + ' alarm (' + cat + '). Reads the instrument; click to acknowledge.">' +
        '<div class="bar"></div><div class="body"><div class="label">' + a.tile_label +
        '</div><div class="meta">' + cat + ' · ' + a.priority + ' · ' + a.state.replace('active_', '') + '</div></div>' +
        '<div class="glyph">' + glyph + '</div></div>';
    }).join('');
  }

  // The Instructor can change time acceleration (beat `speed` — fast-forward in,
  // drop out at a set point); keep the speed seg + FF badge honest.
  var lastSpeedSync = null;
  function syncSpeedUI(s) {
    var v = s && s.metadata ? s.metadata.time_acceleration : null;
    if (v == null || v === lastSpeedSync) return;
    lastSpeedSync = v;
    var seg = $('speed');
    if (seg) seg.querySelectorAll('[data-speed]').forEach(function (b) { b.classList.toggle('on', +b.getAttribute('data-speed') === v); });
    var fb = $('ffBadge');
    if (fb) { var fast = v >= 600; fb.style.display = fast ? 'block' : 'none'; if (fast) fb.textContent = '⚡ ' + v + '×'; }
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
  function renderInstructor(s) {
    // Rewind is live whenever a checkpoint exists (beats / follow steps / sandbox).
    var noCp = !(service && service.checkpoints && service.checkpoints.length);
    var rw = document.querySelector('[data-fnav="rewind"]');
    if (rw) rw.disabled = noCp;
    var crw = $('chartRewindBtn');
    if (crw) crw.disabled = noCp;
    syncSpeedUI(s);
    renderHighlight(s);
    // Follow state is derived FROM the snapshot (the Instructor owns it); ui.follow
    // is just a synced mirror. This survives start_follow's internal plant reset,
    // save/load restores, and anything else that broadcasts mid-transition.
    var fb = s.instructor && s.instructor.follow;
    if (fb) { ui.follow = { id: fb.procedure_id }; renderFollow(s); return; }
    if (ui.follow) ui.follow = null;              // the snapshot says the follow ended
    var lc = s.instructor && s.instructor.level_complete;
    if (lc) { msgHold.queue = []; msgHold.shown = null; renderLevelComplete(s, lc); return; }
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
    autoStandDown();
    cmd({ action: 'start_follow', procedure_id: pr.id });
    autoPreset(pr.auto_channels);
    setFocus('instructor');
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
  // the same rd_progress record recordCompletion() already writes. Sequential
  // unlock; bonus missions unlock with the final act; ?campaign=unlock for dev.
  function campaign() { return (RD.CAMPAIGNS || {})[ui.plant] || null; }
  function campaignMissions(c) {
    var out = [];
    (c.acts || []).forEach(function (a) { a.missions.forEach(function (m) { out.push(m); }); });
    return out;
  }
  function missionArtifact(m) {
    if (m.kind === 'scenario') return (RD.SCENARIOS || {})[m.id] || null;
    return (((RD.MANUAL_PROCEDURES || {})[ui.engineKey]) || []).filter(function (x) { return x.id === m.id; })[0] || null;
  }
  function missionDone(m, p) {
    var list = m.kind === 'scenario' ? (p.completed_scenarios || []) : (p.completed_procedures || []);
    return list.indexOf(m.id) !== -1;
  }
  function campaignUnlockAll() { return /[?&]campaign=unlock/.test(location.search || ''); }
  function startMission(m) {
    if (m.kind === 'scenario') startScenario(m.id); else followProcedure(m.id);
  }
  // The next incomplete mission (the "frontier"), or null when all complete.
  function campaignFrontier() {
    var c = campaign(); if (!c) return null;
    var p = progress();
    var ms = campaignMissions(c);
    for (var i = 0; i < ms.length; i++) if (!missionDone(ms[i], p)) return ms[i];
    return null;
  }
  function buildCampaign() {
    var host = $('trainingCampaign');
    if (!host) return;
    var c = campaign();
    if (!c) { host.innerHTML = '<div class="m-note">No campaign for this plant yet — try the PWR.</div>'; return; }
    var p = progress(), unlockAll = campaignUnlockAll();
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
        var art = missionArtifact(m);
        var title = m.title || (art && art.title) || m.id;
        var done = missionDone(m, p);
        var isFrontier = !done && !frontier; if (isFrontier) frontier = m;
        var locked = !done && !isFrontier && !unlockAll;
        var mark = done ? '✓' : (locked ? '🔒' : '▶');
        h += '<div class="camp-mission' + (done ? ' done' : locked ? ' locked' : ' next') + '">' +
          '<span class="camp-mark">' + mark + '</span>' +
          '<span class="camp-mtitle">' + mesc(title) + '</span>' +
          (m.teaches ? '<span class="camp-teaches">' + mesc(m.teaches) + '</span>' : '') +
          (!locked ? '<button class="btn" data-camp-start="' + m.kind + ':' + m.id + '">' + (done ? '↺ Replay' : '▶ Start') + '</button>' : '') +
          '</div>';
      });
    });
    if (c.bonus && c.bonus.length) {
      var actsDone = doneCount >= ms.length - (c.acts[c.acts.length - 1].missions.length);
      h += '<div class="camp-act">Bonus</div>';
      c.bonus.forEach(function (m) {
        var art = missionArtifact(m);
        var locked2 = !actsDone && !unlockAll;
        h += '<div class="camp-mission' + (locked2 ? ' locked' : '') + '">' +
          '<span class="camp-mark">' + (locked2 ? '🔒' : '★') + '</span>' +
          '<span class="camp-mtitle">' + mesc((art && art.title) || m.id) + '</span>' +
          (m.teaches ? '<span class="camp-teaches">' + mesc(m.teaches) + '</span>' : '') +
          (!locked2 ? '<button class="btn" data-camp-start="' + m.kind + ':' + m.id + '">▶ Start</button>' : '') +
          '</div>';
      });
    }
    host.innerHTML = h;
  }

  // ---- Training tab: scenario picker + walkthrough list (Gameplay §3.1) ----
  function buildTraining() {
    buildCampaign();
    var sc = $('trainingScenarios'), pr = $('trainingProcedures');
    if (!sc) return;
    var p = progress();
    var doneS = p.completed_scenarios || [];
    var ids = Object.keys(RD.SCENARIOS || {});
    sc.innerHTML = ids.length ? ids.map(function (id) {
      var s = RD.SCENARIOS[id];
      var badge = (s.plant_id || '').toUpperCase() + (s.design_version === 'pre_chernobyl' ? ' pre-86' : s.design_version === 'post_chernobyl' ? ' post-86' : '');
      var active = ui.scenario === id;
      return '<div class="tr-card' + (active ? ' active' : '') + '">' +
        '<div class="tr-head"><span class="tr-title">' + (doneS.indexOf(id) !== -1 ? '✓ ' : '') + mesc(s.title) + '</span><span class="tr-badge">' + badge + '</span></div>' +
        (s.description ? '<div class="m-note">' + mesc(s.description) + '</div>' : '') +
        '<div class="tr-actions">' + (active
          ? '<button class="btn" data-trstop="1">■ Stop scenario</button>'
          : '<button class="btn" data-trstart="' + id + '">▶ Start</button>') + '</div></div>';
    }).join('') : '<div class="m-note">No scenarios loaded.</div>';
    if (pr) {
      var procs = ((RD.MANUAL_PROCEDURES || {})[ui.engineKey] || []).filter(function (x) { return !x.narrative; });
      var doneP = p.completed_procedures || [];
      pr.innerHTML = procs.map(function (x) {
        return '<div class="tr-row"><span class="tr-ptitle">' + (doneP.indexOf(x.id) !== -1 ? '✓ ' : '') + mesc(x.title) + '</span>' +
          '<button class="btn" data-follow="' + x.id + '">▶ Follow</button></div>';
      }).join('') || '<div class="m-note">No procedures for this plant.</div>';
    }
  }

  // ---- Scenario lifecycle (Training tab / level-complete Retry / ?scenario=) ----
  function startScenario(id) {
    var sc = RD.SCENARIOS && RD.SCENARIOS[id];
    if (!sc) return;
    ui.follow = null;
    ui.scenario = id;
    service.stop(); $('playBtn').textContent = '▶'; $('playBtn').classList.add('paused');
    service.handleCommand({ action: 'start_scenario', scenario_id: id });
    afterPlantChange();          // the scenario may have switched the plant
    autoPreset(sc.auto_channels);   // authored preset: put listed systems on auto so the mission can focus the player
    diagReset('scenario', { scenario_id: id });
    resetInstrFlow();            // fresh mission → fresh commentary queue
    setFocus('instructor');
    service.handleCommand({ action: 'play' });
    $('playBtn').textContent = '⏸'; $('playBtn').classList.remove('paused');
  }

  // ---- "Follow in Instructor" (Path 2): the Instructor (M6) runs the procedure —
  // auto-advance, instrument-first grading, strict gating. The UI just renders
  // the snapshot's instructor.follow block; step text comes from the same
  // RD.MANUAL_PROCEDURES artifact the Instructor loaded.
  function curFollowProc() { return ui.follow ? ((RD.MANUAL_PROCEDURES || {})[ui.engineKey] || []).filter(function (x) { return x.id === ui.follow.id; })[0] : null; }
  // Instructor content must start from a clean board: reset every automation
  // channel to MANUAL (mode toggles keep reflecting the plant) so an engaged
  // controller can't perform the player's steps or trip gate feedback. The
  // scenario path gets this for free (startScenario → rebuildPlantUI); the
  // walkthrough path resets the plant in place, so it needs it explicitly.
  function autoStandDown() { if (autoCtl) { autoCtl.setPlant(ui.plant); buildAutomate(); } }
  // Authored automation preset (scenario.auto_channels / procedure.auto_channels):
  // engage the listed channels after the content's plant reset, so a mission can
  // hand the player one or two controls and put the rest of the plant on auto.
  function autoPreset(ids) {
    if (!autoCtl || !ids || !ids.length) return;
    var s = service.assembleSnapshot();
    ids.forEach(function (cid) { if (autoCtl.get(cid)) autoCtl.toggle(cid, true, s); });
    renderAutomate(service.assembleSnapshot());
  }
  function followProcedure(id) {
    var procs = (RD.MANUAL_PROCEDURES || {})[ui.engineKey] || [];
    if (!procs.filter(function (x) { return x.id === id; })[0]) return;
    // start_follow resets the plant to the procedure's `from` state and loads it;
    // ui.follow syncs from the resulting snapshot in renderInstructor. Fresh
    // timeline → fresh trend history and gauge smoothing.
    chartBuf = []; smoothed = {};
    autoStandDown();
    cmd({ action: 'start_follow', procedure_id: id });
    autoPreset((procs.filter(function (x) { return x.id === id; })[0] || {}).auto_channels);
    resetInstrFlow();            // fresh walkthrough → fresh commentary queue
    closeManual(); setFocus('instructor');
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
  function setFocus(which) {
    var instr = $('instructorCard'), tools = $('toolsCard'); if (!instr || !tools) return;
    instr.classList.toggle('expanded', which === 'instructor');
    instr.classList.toggle('collapsed', which !== 'instructor');
    tools.classList.toggle('expanded', which === 'tools');
    tools.classList.toggle('collapsed', which !== 'tools');
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
  // Operator automation (layers/auto_control.js): per-control AUTO/MAN toggles.
  // Controllers read the broadcast snapshot's instruments and send commands
  // down the stack like any operator action — silently (no blocked-command UI
  // feedback; a blocked auto command just shows as a note on its row).
  function cmdAuto(c) {
    var r = service.handleCommand(c);
    if (diag) {
      diag.commands.push({ t: latest && latest.metadata ? latest.metadata.sim_time : 0, command: c, auto: true, blocked: !!(r && r.type === 'blocked'), error: !!(r && r.type === 'error') });
      if (diag.commands.length > 2000) diag.commands.shift();
    }
    return r;
  }

  function autoSnap() { return latest || service.assembleSnapshot(); }

  function buildAutomate() {
    var list = $('autoList'), master = $('autoMaster');
    if (!list || !autoCtl) return;
    master.innerHTML =
      '<span class="k">Automatic control</span>' +
      '<span><button class="btn" data-autoall="on" data-scanner-hint="All Auto — engages every automation channel for this plant (setpoints capture the current readings).">All auto</button> ' +
      '<button class="btn" data-autoall="off" data-scanner-hint="All Manual — disengages every automation channel; each control freezes where automation left it.">All manual</button></span>';
    var html = '', lastGroup = null;
    autoCtl.channels().forEach(function (c) {
      var d = c.def;
      if (d.group !== lastGroup) { html += '<div class="g-section-title" style="margin-top:10px">' + mesc(d.group) + '</div>'; lastGroup = d.group; }
      html += '<div class="auto-row" data-autorow="' + d.id + '" data-scanner-hint="' + esc(d.label + ' — ' + d.hint) + '">' +
        '<button class="auto-tog" data-autotog="' + d.id + '">MAN</button>' +
        '<div class="auto-main"><div class="auto-name">' + mesc(d.label) + '</div>' +
        '<div class="auto-read mono" data-autoread="' + d.id + '">—</div></div>';
      if (d.sp) {
        html += '<div class="auto-spbox"><span class="auto-splbl">SP</span>' +
          '<input class="num-input mono auto-sp" data-autosp="' + d.id + '" type="number" step="' + (d.sp.step || 1) + '" disabled>' +
          '<span class="auto-spunit" data-autospu="' + d.id + '"></span></div>';
      }
      html += '</div>';
    });
    list.innerHTML = html;
    if (latest) renderAutomate(latest);
  }

  function autoSpUnit(d) { return d.sp ? (d.sp.dim ? unit(d.sp.dim) : (d.sp.unit || '')) : ''; }
  function autoFmtPv(d, v, dp) {
    if (v == null || !isFinite(v)) return '—';
    var dim = d.sp && d.sp.dim;
    return (dim ? conv(v, dim) : v).toFixed(dp != null ? dp : (d.sp ? d.sp.dp : 0));
  }

  function renderAutomate(s) {
    var list = $('autoList');
    if (!list || !autoCtl || !list.firstChild) return;
    autoCtl.channels().forEach(function (c) {
      var d = c.def, on = autoCtl.isEngaged(c, s);
      var row = list.querySelector('[data-autorow="' + d.id + '"]'); if (!row) return;
      row.classList.toggle('on', on);
      var tog = row.querySelector('[data-autotog]');
      tog.textContent = on ? 'AUTO' : 'MAN';
      tog.classList.toggle('on', on);
      var read = row.querySelector('[data-autoread]');
      if (d.kind === 'mode') {
        read.textContent = on ? 'engaged (plant-side control)' : 'manual';
      } else {
        var pv = c.pvNow != null ? c.pvNow : (d.pv ? d.pv(s) : null);
        var txt = d.kind === 'bang'
          ? 'rods ' + autoFmtPv(d, pv, 0) + ' % out'
          : autoFmtPv(d, pv) + (on && c.sp != null ? ' → ' + autoFmtPv(d, c.sp) : '') + ' ' + autoSpUnit(d);
        if (on && c.note) txt += ' · ' + c.note;
        read.textContent = txt;
      }
      if (d.sp) {
        var inp = row.querySelector('[data-autosp]'), un = row.querySelector('[data-autospu]');
        inp.disabled = !on;
        un.textContent = autoSpUnit(d);
        if (document.activeElement !== inp) {
          inp.value = (on && c.sp != null) ? autoFmtPv(d, c.sp) : '';
          // display-side bounds so the browser spinner respects the channel range
          inp.min = autoFmtPv(d, d.sp.min); inp.max = autoFmtPv(d, d.sp.max);
        }
      }
    });
  }

  function bindAutomate() {
    var pane = document.querySelector('[data-pane="automate"]');
    if (!pane) return;
    pane.addEventListener('click', function (e) {
      var all = e.target.closest('[data-autoall]');
      if (all && autoCtl) {
        if (all.getAttribute('data-autoall') === 'on') autoCtl.engageAll(autoSnap());
        else autoCtl.disengageAll(autoSnap());
        renderAutomate(autoSnap()); return;
      }
      var b = e.target.closest('[data-autotog]');
      if (b && autoCtl) {
        var id = b.getAttribute('data-autotog');
        var c = autoCtl.get(id); if (!c) return;
        var s = autoSnap();
        autoCtl.toggle(id, !autoCtl.isEngaged(c, s), s);
        renderAutomate(autoSnap());
      }
    });
    pane.addEventListener('change', function (e) {
      var inp = e.target.closest('[data-autosp]');
      if (!inp || !autoCtl) return;
      var id = inp.getAttribute('data-autosp'), c = autoCtl.get(id); if (!c) return;
      var v = parseFloat(inp.value);
      if (isNaN(v)) return;
      autoCtl.setSetpoint(id, c.def.sp.dim ? invConv(v, c.def.sp.dim) : v);
      renderAutomate(autoSnap());
    });
  }

  // Per-broadcast hook: controllers act, then the tab's readouts refresh.
  function autoTick(s) {
    if (!autoCtl) return;
    autoCtl.step(s);
    renderAutomate(s);
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
    'rod-stop': function () { cmd({ action: 'rod_stop', group_id: 'control_rods' }); },
    'rod-nudge-out': function () { cmd({ action: 'rod_nudge', group_id: 'control_rods', steps: 1, speed: ui.rodSpeed }); },
    'rod-nudge-in': function () { cmd({ action: 'rod_nudge', group_id: 'control_rods', steps: -1, speed: ui.rodSpeed }); },
    'rodspeed-slow': function () { ui.rodSpeed = 'slow'; }, 'rodspeed-normal': function () { ui.rodSpeed = 'normal'; }, 'rodspeed-fast': function () { ui.rodSpeed = 'fast'; },
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
    'letdown-set': function () { cmd({ action: 'set_letdown_flow', normalized: inputVal('letdownSet') / 1000 }); },
    'letdown-isolate': function () { cmd({ action: 'set_letdown_flow', normalized: 0 }); },
    'cvcs-auto': function () { cmd({ action: 'set_cvcs_auto', active: true }); },
    'cvcs-manual': function () { cmd({ action: 'set_cvcs_auto', active: false }); },
    'eccs-on': function () { ui.pdOp.eccs = true; cmd({ action: 'set_hpi', active: true }); }, 'eccs-off': function () { cmd({ action: 'set_hpi', active: false }); }, 'eccs-auto': function () {},
    'heat-on': function () { cmd({ action: 'set_heater', power_pct: 100 }); }, 'heat-off': function () { cmd({ action: 'set_heater', power_pct: 0 }); },
    'heat-auto': function () { cmd({ action: 'set_heater', auto: true }); }, 'heat-set': function () { cmd({ action: 'set_heater', power_pct: inputVal('heatSet') }); },
    'spray-open': function () { cmd({ action: 'set_spray', open: true }); }, 'spray-auto': function () { cmd({ action: 'set_spray', auto: true }); },
    'spray-set': function () { cmd({ action: 'set_spray', pct: inputVal('spraySet') }); },
    'feed-start': function () { cmd({ action: 'set_feedwater_flow', pct: 100 }); }, 'feed-stop': function () { cmd({ action: 'set_feedwater_flow', pct: 0 }); },
    'feed-set': function () { cmd({ action: 'set_feedwater_flow', pct: inputVal('feedSet') }); },
    'afw-start': function () { ui.pdOp.afw = true; cmd({ action: 'set_afw', active: true }); }, 'afw-stop': function () { cmd({ action: 'set_afw', active: false }); },
    'msiv-open': function () { if (ui.plant === 'bwr') cmd({ action: 'clear_failure', failure_id: 'msiv_closure' }); },
    'msiv-close': function () { if (ui.plant === 'bwr') cmd({ action: 'inject_failure', failure_id: 'msiv_closure' }); },
    'spray-off': function () { cmd({ action: 'set_spray', open: false }); },
    // load mode (engines/load_mode.js) — Follow tracks reactor power; Manual uses the slider; Off drops the grid
    'load-follow': function () { cmd({ action: 'set_load_mode', mode: 'follow' }); },
    'load-manual': function () { cmd({ action: 'set_load_mode', mode: 'manual' }); },
    'load-disconnect': function () { cmd({ action: 'disconnect_grid' }); },
    'breaker-close': function () { cmd({ action: 'set_steam_demand', mwe: 1000 }); },
    'breaker-open': function () { if (confirm('Open the main breaker (disconnect from grid)?')) cmd({ action: 'set_steam_demand', mwe: 0 }); },
    'mwe-set': function () { cmd({ action: 'set_steam_demand', mwe: inputVal('mweSet') }); },
    'porv-block-open': function () { cmd({ action: 'open_block_valve' }); },
    'porv-block-close': function () { if (confirm('Isolate the PORV (close the block valve)? Stops all PORV flow.')) cmd({ action: 'close_block_valve' }); },
    'dump-auto': function () { cmd({ action: 'set_steam_dump', mode: 'auto' }); },
    'dump-open': function () { cmd({ action: 'set_steam_dump', mode: 'open' }); },
    'dump-close': function () { cmd({ action: 'set_steam_dump', mode: 'closed' }); },
    'porv-open': function () { cmd({ action: 'open_porv' }); }, 'porv-close': function () { cmd({ action: 'close_porv' }); },
    'dhr-on': function () { cmd({ action: 'set_dhr', active: true }); }, 'dhr-off': function () { cmd({ action: 'set_dhr', active: false }); },
    // synoptic emergency card: RHR / LPI (AUTO = leave to the automatic actuation)
    'rhr-auto': function () {}, 'rhr-on': function () { cmd({ action: 'set_rhr', active: true }); }, 'rhr-off': function () { cmd({ action: 'set_rhr', active: false }); },
    'lpi-auto': function () {}, 'lpi-on': function () { cmd({ action: 'set_lpi', active: true }); }, 'lpi-off': function () { cmd({ action: 'set_lpi', active: false }); },
    'dump-set': function () { cmd({ action: 'set_steam_dump', pct: inputVal('dumpSet') }); },
    // RBMK
    'rbmk-flow-set': function () { cmd({ action: 'set_channel_flow', pct: inputVal('rbmkFlow') }); },
    'rbmk-feed-set': function () { cmd({ action: 'set_feedwater_flow', pct: inputVal('rbmkFeed') }); },
    'rbmk-turbine-set': function () { cmd({ action: 'set_turbine_load', mwe: inputVal('rbmkMwe') }); },
    'eps-on': function () { cmd({ action: 'set_eps_bypass', active: true }); }, 'eps-off': function () { cmd({ action: 'set_eps_bypass', active: false }); },
    'rbmk-eccs-on': function () { cmd({ action: 'set_eccs', active: true }); }, 'rbmk-eccs-off': function () { cmd({ action: 'set_eccs', active: false }); },
    // BWR
    'bwr-recirc-set': function () { cmd({ action: 'set_recirc_flow', pct: inputVal('bwrRecirc') }); },
    'rcic-on': function () { cmd({ action: 'set_rcic', active: true }); }, 'rcic-off': function () { cmd({ action: 'set_rcic', active: false }); },
    'ic-on': function () { cmd({ action: 'set_ic', active: true }); }, 'ic-off': function () { cmd({ action: 'set_ic', active: false }); },
    'hpci-on': function () { cmd({ action: 'set_hpci', active: true }); }, 'hpci-off': function () { cmd({ action: 'set_hpci', active: false }); },
    'trigger-ads': function () { if (confirm('Actuate ADS — blow the vessel down to enable low-pressure injection?')) cmd({ action: 'trigger_ads' }); },
    'start-lpci': function () { cmd({ action: 'start_lpci' }); },
    'slc-initiate': function () { if (confirm('Initiate Standby Liquid Control (boron)? Shuts the reactor down even if the rods fail to insert.')) cmd({ action: 'initiate_slc' }); },
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
  var HOLD = {
    'rod-withdraw': function () { startHoldRod('control_rods', 1); },
    'rod-insert': function () { startHoldRod('control_rods', -1); },
    'srod-withdraw': function () { startHoldRod('shutdown_rods', 1); },
    'srod-insert': function () { startHoldRod('shutdown_rods', -1); },
  };
  var holdingGroup = null;
  function startHoldRod(group, direction) { holdingGroup = group; cmd({ action: 'rod_start', group_id: group, direction: direction, speed: ui.rodSpeed }); }
  function endHold() { if (!holdingGroup) return; cmd({ action: 'rod_stop', group_id: holdingGroup }); holdingGroup = null; document.querySelectorAll('.holding').forEach(function (x) { x.classList.remove('holding'); }); }

  function bindCommands() {
    document.body.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (b && ACTS[b.getAttribute('data-act')]) { ACTS[b.getAttribute('data-act')](); return; }
      var ack = e.target.closest('[data-ack]');
      if (ack) cmd({ action: 'acknowledge_alarm', alarm_id: ack.getAttribute('data-ack') });
    });
    document.body.addEventListener('pointerdown', function (e) {
      var b = e.target.closest('[data-hold]'); if (!b) return;
      var h = HOLD[b.getAttribute('data-hold')]; if (!h) return;
      e.preventDefault(); b.classList.add('holding'); h();
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
    if (persona) persona.addEventListener('click', function () { setFocus('instructor'); });
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
    $('initState').addEventListener('change', function () { ui.initState = $('initState').value; });
    $('engineSel').addEventListener('change', function () { switchEngine($('engineSel').value); });
    $('loadFile').addEventListener('change', function (e) {
      var f = e.target.files[0]; if (!f) return; var r = new FileReader();
      r.onload = function () { try { var st = JSON.parse(r.result); service.loadState(st); afterPlantChange(); diagReset('restore', { engine_key: ui.engineKey }); } catch (err) { alert('Bad save file'); } };
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
    document.querySelector('.instr-nav').addEventListener('click', function (e) { var b = e.target.closest('[data-fnav]'); if (!b) return; followNav(b.getAttribute('data-fnav')); });
    // Level Complete actions (Continue / Retry / Rewind) render inside the card.
    $('instructorCard').addEventListener('click', function (e) { var b = e.target.closest('[data-lc]'); if (!b) return; levelCompleteAction(b.getAttribute('data-lc')); });
    // Training tab: scenario Start/Stop + procedure Follow buttons.
    document.querySelector('[data-pane="training"]').addEventListener('click', function (e) {
      var cc = e.target.closest('[data-camp-continue]');
      if (cc) { var fm = campaignFrontier(); if (fm) { startMission(fm); buildTraining(); } return; }
      var cs = e.target.closest('[data-camp-start]');
      if (cs) {
        var kv = cs.getAttribute('data-camp-start').split(':');
        startMission({ kind: kv[0], id: kv[1] }); buildTraining(); return;
      }
      var st = e.target.closest('[data-trstart]');
      if (st) { startScenario(st.getAttribute('data-trstart')); buildTraining(); return; }
      if (e.target.closest('[data-trstop]')) {
        ui.scenario = null; cmd({ action: 'stop_scenario' }); buildTraining();
        if (latest) renderInstructor(latest); return;
      }
      var f = e.target.closest('[data-follow]');
      if (f) { followProcedure(f.getAttribute('data-follow')); }
    });
    // First-run Hook invitation (prompted, never forced — Gameplay §7.1).
    $('hookStart').addEventListener('click', function () { $('hookPrompt').hidden = true; startScenario('pwr_hook'); buildTraining(); });
    $('hookSkip').addEventListener('click', function () { $('hookPrompt').hidden = true; saveProgress({ hook_done: true }); });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (!$('manualOverlay').hidden) closeManual();
      if (ui.rewindPick) toggleRewindPick(false);
    });
    // Strip-chart rewind: the ⏪ by the scrubber + click-to-pick on the plot.
    $('chartRewindBtn').addEventListener('click', function () { rewindPressed(); });
    document.querySelector('.chart-plot').addEventListener('click', rewindPickClick);
    document.body.addEventListener('mouseover', function (e) {
      var el = e.target.closest('[data-scanner-hint]'); if (!el) return;
      var hint = el.getAttribute('data-scanner-hint'), dash = hint.indexOf(' — ');
      $('scanner').innerHTML = dash > -1 ? '<strong>' + hint.slice(0, dash) + '</strong>' + hint.slice(dash) : hint;
    });
  }
  function syncSeg(sel, val, attr) { document.querySelectorAll(sel).forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-' + attr) === val); }); }
  // Physics Overlay control exists only in Learning (Education) mode — Realistic hides it entirely.
  function syncOverlayRow() {
    var row = $('overlayRow'); if (row) row.style.display = ui.diagMode === 'realistic' ? 'none' : '';
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

  function openManual() { if (!manualProfile()) { alert('Manual data not loaded.'); return; } $('manualOverlay').hidden = false; renderManual(); }
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
    var h = '<h2>Indications</h2><table class="m-table"><tr><th>Reading</th><th>What it shows</th><th>Unit</th><th>Range</th><th>Linked alarms</th></tr>';
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
    var h = '<h2>Glossary</h2><table class="m-table"><tr><th>Term</th><th>Meaning</th></tr>';
    (p.glossary || []).forEach(function (g) { h += '<tr><td><b>' + mesc(g.acronym) + '</b></td><td>' + mesc(g.term) + '</td></tr>'; });
    return h + '</table>';
  }

  function mNormal(p) {
    var h = '<h2>Normal Values</h2><p class="muted">Representative readings captured from the engine at each state (operating states settled to steady; startup / accident states near their initial condition).</p>';
    for (var k in p.normal_values) {
      var nv = p.normal_values[k], ts = nv.true_state;
      h += '<h3>' + mesc(k) + ' <span style="text-transform:none;letter-spacing:0;color:var(--muted)">— ' + mesc(nv.label) + '</span></h3>';
      h += '<table class="m-table"><tr><th>Parameter (true state)</th><th>Value</th></tr>';
      Object.keys(ts).forEach(function (f) {
        if (typeof ts[f] === 'boolean') { h += '<tr><td class="mono">' + mesc(f) + '</td><td class="mono">' + mesc(ts[f]) + '</td></tr>'; return; }
        if (typeof ts[f] !== 'number') return;
        var m = mval(f, ts[f], 1);
        h += '<tr><td class="mono">' + mesc(f) + '</td><td class="mono">' + mesc(m.v + (m.u ? ' ' + m.u : '')) + '</td></tr>';
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
  // then rebuild every plant-specific surface.
  function switchEngine(key) {
    var e = ENGINES[key]; if (!e) return;
    ui.engineKey = key; ui.plant = e.plant; ui.initState = e.init;
    ui.scenario = null; ui.follow = null;   // a manual plant switch ends instructed content
    ui.series = Object.assign({}, prof().defaultSeries);
    service.stop(); $('playBtn').textContent = '▶'; $('playBtn').classList.add('paused');
    service.handleCommand({ action: 'reset', plant_id: e.plant, initial_state: e.init, design_version: e.dv });
    rebuildPlantUI();
    diagReset('plant_change', { engine_key: key, initial_state: e.init });
  }

  function rebuildPlantUI() {
    chartBuf = []; smoothed = {};
    buildGauges(); buildGraphParams(); buildInitStates(); buildFailures();
    if (autoCtl) { autoCtl.setPlant(ui.plant); buildAutomate(); }   // fresh plant → all channels back to manual
    buildPlantDisplay();
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
    $('engineSel').value = ui.engineKey;
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
        var f = s.control_state.channel_flow_setpoint_pct != null ? s.true_state.channel_flow_pct : 100;
        return {
          mcp: f > 50 ? 'running' : (f > 10 ? 'caution' : 'alarm'),
          eccs: s.true_state.eccs_active ? 'running' : 'normal',
          eps: s.true_state.eps_bypassed ? 'caution' : 'normal',
          afw: hasFail(s, 'loss_of_feedwater') ? 'alarm' : (s.control_state.feedwater_flow_pct > 5 ? 'running' : 'caution'),
          station_pwr: 'normal',
        };
      },
      diagram: [ROD_DRIVE('control_rods'), { l: 'EPS', emergency: 1, hint: 'Emergency Protection bypass.', seg: [{ l: 'Active', act: 'eps-off', on: 1, run: 1 }, { l: 'Bypass', act: 'eps-on', warn: 1 }] }],
      primary: {
        sections: [
          { title: 'Reactor Core', rows: [
            R('Power', function (s) { return s.instruments.power_range.toFixed(1) + ' %'; }), R('Control Rods', function (s) { return bankStat(s, 'control'); }), R('Shutdown Bank', function (s) { return bankStat(s, 'shutdown'); }),
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
        controls: [ROD_DRIVE('control_rods'), ROD_SPEED(), SHUTDOWN_DRIVE('shutdown_rods'),
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
        return {
          recirc: s.true_state.recirc_flow_pct > 50 ? 'running' : (s.true_state.recirc_flow_pct > 5 ? 'caution' : 'alarm'),
          rcic: (s.true_state.rcic_running) ? 'running' : (hasFail(s, 'rcic_failure') ? 'alarm' : 'normal'),
          ic: (s.true_state.ic_condensing) ? 'running' : (hasFail(s, 'ic_failure') ? 'alarm' : 'normal'),
          hpci: (s.true_state.hpci_running) ? 'running' : (hasFail(s, 'hpci_failure') ? 'alarm' : 'normal'),
          ads: s.true_state.ads_open ? 'running' : 'normal',
          lpci: s.true_state.lpci_running ? 'running' : 'normal',
          slc: s.true_state.slc_active ? 'running' : 'normal',
          msiv: hasFail(s, 'msiv_closure') ? 'alarm' : 'normal',
          station_pwr: s.true_state.station_blackout ? (s.true_state.battery_charge_pct > 0 ? 'caution' : 'alarm') : 'normal',
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
    autoCtl = RD.AutoControl ? new RD.AutoControl(cmdAuto) : null;
    if (autoCtl) service.subscribe(autoTick);   // after render: `latest` is current when controllers act
    bindUI(); bindCommands(); bindAutomate();
    // optional ?engine= override (dev convenience / sharing)
    var em = /[?&]engine=(pwr|rbmk_pre|rbmk_post|bwr)/.exec(location.search || '');
    var startKey = em ? em[1] : 'pwr', startEng = ENGINES[startKey];
    ui.engineKey = startKey; ui.plant = startEng.plant; ui.initState = startEng.init;
    ui.series = Object.assign({}, prof().defaultSeries);
    buildGauges(); buildGraphParams(); buildInitStates();
    buildPlantDisplay();
    $('engineSel').value = startKey;
    service.selectPlant(startEng.plant, ui.initState, startEng.dv);   // initial snapshot → render
    diagReset('init', { engine_key: startKey, initial_state: ui.initState });
    buildFailures();
    if (autoCtl) { autoCtl.setPlant(ui.plant); buildAutomate(); }
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
    // optional ?tab= deep-link — opens a Tools-Block tab (dev/screenshot convenience)
    var tbm = /[?&]tab=(failures|automate|graph|sim|settings|training|dev)/.exec(location.search || '');
    if (tbm) { var tbtn = document.querySelector('#tabbar [data-tab="' + tbm[1] + '"]'); if (tbtn) tbtn.click(); }
    // optional ?auto=<id,id|all> deep-link — engages automation channels (dev convenience)
    var am = /[?&]auto=([a-z_,]+|all)/.exec(location.search || '');
    if (am && autoCtl) {
      var asnap = service.assembleSnapshot();
      if (am[1] === 'all') autoCtl.engageAll(asnap);
      else am[1].split(',').forEach(function (id) { autoCtl.toggle(id, true, asnap); });
      renderAutomate(asnap);
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
