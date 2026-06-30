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
    rodSpeed: 'normal',
    window: 300,            // strip-chart seconds
    series: {},             // per-plant; defaults set on plant load
    plant: 'pwr',           // active plant_id
    engineKey: 'pwr',       // active engine selector key
    initState: 'hot_full_power',
    view: 'primary',        // plant-display active view
    pdAck: {},              // operator-acknowledged auto-actuations (ECCS/AFW → green)
    pdOp: {},               // operator-initiated systems (start green directly)
  };
  var service, latest = null, lastScrammed = false;
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
  function gridMatch(s) {
    var d = s.control_state.steam_demand_mwe || 0;
    if (d <= 1) return 0;
    return Math.min(100, (s.true_state.mwe_output / d) * 100);
  }
  var PROFILES = {

    // ------------------------------------------------------------------ PWR
    pwr: {
      scram: 'REACTOR SCRAM', scramShort: 'SCRAM',
      initStates: [['hot_full_power', 'Hot Full Power'], ['50_percent', '50 % Power'], ['hot_zero_power', 'Hot Zero Power']],
      defaultSeries: { power: true, tavg: true, pressure: true, sg_level: true },
      gauges: [
        { id: 'power',   label: 'Reactor Power', lead: true, raw: function (s) { return s.instruments.power_range; }, units: '%', min: 0, max: 120, caution: 108, danger: 118, dp: 1 },
        { id: 'press',   label: 'Primary Press', raw: function (s) { return s.instruments.primary_pressure; }, dim: 'pressure', min: 0, max: 20.7, caution: 16.2, danger: 16.44, dp: 0 },
        { id: 'tavg',    label: 'Tavg',          raw: function (s) { return s.instruments.tavg; }, dim: 'temp', min: 250, max: 343, caution: 312, danger: 335, dp: 0 },
        { id: 'pzr',     label: 'PZR Level',     raw: function (s) { return s.instruments.pzr_level; }, units: '%', min: 0, max: 100, caution_lo: 25, danger_lo: 12, dp: 0 },
        { id: 'sg',      label: 'SG Level',      raw: function (s) { return s.instruments.sg_level; }, units: '%', min: 0, max: 100, caution_lo: 30, danger_lo: 12, dp: 0 },
        { id: 'subcool', label: 'Subcool',       raw: function (s) { return s.instruments.subcooling_margin; }, dim: 'tempdiff', min: -28, max: 83, caution_lo: 11, danger_lo: 0, dp: 0 },
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
      numeric: [
        { title: 'Reactor / Core', rows: [
          { k: 'Power', inst: function (s) { return s.instruments.power_range.toFixed(1) + ' %'; }, truth: function (s) { return s.true_state.power_pct.toFixed(1) + ' %'; } },
          // E2 — SUR carries no information at steady power; grey it to near-invisible until it moves.
          { k: 'Startup Rate', inst: function (s) { var v = s.true_state.startup_rate_dpm; return Math.abs(v) < 0.01 ? '<span class="dim-info">' + v.toFixed(2) + ' dpm</span>' : v.toFixed(2) + ' dpm'; } },
          { k: 'Fuel Temp', truth: function (s) { return dispT(s.true_state.fuel_temp_c); } },
          { k: 'Decay Heat', truth: function (s) { return s.true_state.decay_heat_pct.toFixed(1) + ' %'; } },
          { k: 'Scrammed', inst: function (s) { return bool(s.rps_state.scrammed, 'YES', 'no'); } },
        ] },
        { title: 'Primary & PZR', rows: [
          { k: 'Pressure', inst: function (s) { return dispP(s.instruments.primary_pressure); }, truth: function (s) { return dispP(s.true_state.pressure_mpa); } },
          { k: 'Tavg', inst: function (s) { return dispT(s.instruments.tavg); }, truth: function (s) { return dispT(s.true_state.tavg_c); } },
          { k: 'T-hot / T-cold', inst: function (s) { return dispT(s.instruments.thot) + ' / ' + dispT(s.instruments.tcold); } },
          { k: 'PZR Level', inst: function (s) { return s.instruments.pzr_level.toFixed(0) + ' %'; }, truth: function (s) { return s.true_state.pzr_level_pct.toFixed(0) + ' %'; } },
          { k: 'Subcooling', inst: function (s) { return dispTd(s.instruments.subcooling_margin); }, truth: function (s) { return dispTd(s.true_state.subcooling_c); } },
          { k: 'PORV', inst: function (s) { return bool(s.instruments.porv_indicator === 'open', 'OPEN', 'closed'); }, truth: function (s) { return bool(s.true_state.porv_open, 'OPEN', 'closed'); } },
          { k: 'PORV Block Valve', inst: function (s) { return s.control_state.porv_block_open ? 'open' : 'isolated'; } },
          { k: 'Boron', truth: function (s) { return s.true_state.boron_ppm.toFixed(0) + ' ppm'; } },
        ] },
        { title: 'Steam Generators', rows: [
          { k: 'SG Level', inst: function (s) { return s.instruments.sg_level.toFixed(0) + ' %'; }, truth: function (s) { return s.true_state.sg_level_pct.toFixed(0) + ' %'; } },
          { k: 'Steam Flow', inst: function (s) { return pctOf(s.instruments.steam_flow); } },
          { k: 'Feedwater Flow', inst: function (s) { return pctOf(s.instruments.fw_flow); } },
          { k: 'AFW', inst: function (s) { return bool(s.true_state.afw_active, 'on', 'off'); } },
        ] },
        { title: 'Turbine / Condenser', rows: [
          { k: 'Grid Match', inst: function (s) { return gridMatch(s).toFixed(1) + ' %'; } },
          { k: 'Output', inst: function (s) { return s.instruments.mwe_output.toFixed(0) + ' MW'; } },
          { k: 'Turbine RPM', inst: function (s) { return s.instruments.turbine_rpm.toFixed(0); } },
          { k: 'Cond. Vacuum', inst: function (s) { return dispV(s.instruments.condenser_vacuum); } },
          { k: 'Steam Dump', inst: function (s) { return (s.control_state.steam_dump_auto ? 'auto ' : 'man ') + s.control_state.steam_dump_pct.toFixed(0) + ' %'; } },
          { k: 'Main Breaker', inst: function (s) { return bool(s.control_state.steam_demand_mwe > 1, 'closed', 'open'); } },
        ] },
        { title: 'Emergency & Inventory', rows: [
          { k: 'Core Inventory', truth: function (s) { return s.true_state.core_inventory_pct.toFixed(0) + ' %'; } },
          { k: 'RCP', inst: function (s) { return bool(s.instruments.rcp_running, 'running', 'STOPPED'); } },
          { k: 'HPI / ECCS', inst: function (s) { return bool(s.instruments.hpi_active, 'active', 'standby'); } },
          { k: 'Station Blackout', inst: function (s) { return bool(s.instruments.station_blackout, 'YES', 'no'); } },
        ] },
      ],
      controls: [
        { key: 'reactor', label: 'Reactor Core', groups: [ROD_DRIVE('control_rods'), ROD_SPEED()] },
        { key: 'primary', label: 'Primary Inventory', groups: [
          { l: 'Reactor Coolant Pumps (RCP)', hint: 'Reactor Coolant Pumps — force primary flow. Stopping them collapses flow.', seg: [{ l: 'Run', act: 'rcp-run', on: 1, run: 1 }, { l: 'Stop', act: 'rcp-stop' }] },
          { l: 'Chemical Shim (Boron)', hint: 'Chemical Shim — adjusts dissolved boron (a neutron absorber) to trim reactivity slowly.', seg: [{ l: 'Borate', act: 'borate' }, { l: 'Off', act: 'boron-off', on: 1 }, { l: 'Dilute', act: 'dilute' }] },
          { l: 'PORV Block Valve', hint: 'PORV block (isolation) valve — closing it isolates a stuck-open PORV even when the indicator lies "closed". The key TMI recovery action.', seg: [{ l: 'Open', act: 'porv-block-open', on: 1 }, { l: 'Isolate', act: 'porv-block-close', warn: 1 }] },
          { l: 'Emergency Core Cooling (ECCS)', emergency: 1, hint: 'Emergency Core Cooling — high-pressure injection. AUTO actuates on low pressure.', seg: [{ l: 'Auto', act: 'eccs-auto', on: 1, run: 1 }, { l: 'On', act: 'eccs-on' }, { l: 'Off', act: 'eccs-off' }] },
          { l: 'PZR Heaters', seg: [{ l: 'Auto', act: 'heat-auto', on: 1, run: 1 }, { l: 'On', act: 'heat-on' }, { l: 'Off', act: 'heat-off' }] },
          { l: 'PZR Spray', seg: [{ l: 'Auto', act: 'spray-auto', on: 1, run: 1 }, { l: 'Open', act: 'spray-open' }] },
        ] },
        { key: 'steam', label: 'Steam Generators', groups: [
          { l: 'Feed Pumps', seg: [{ l: 'Start', act: 'feed-start', on: 1, run: 1 }, { l: 'Stop', act: 'feed-stop' }] },
          { l: 'Auxiliary Feed Water (AFW)', emergency: 1, hint: 'Auxiliary Feed Water — backup feed after a loss of main feedwater.', seg: [{ l: 'Start', act: 'afw-start' }, { l: 'Stop', act: 'afw-stop', on: 1 }] },
          { l: 'Feed Reg Valve', num: { id: 'feedSet', min: 0, max: 100, value: 100, act: 'feed-set', setL: 'Set %' } },
        ] },
        { key: 'turbine', label: 'Turbine & Grid', groups: [
          { l: 'Main Breaker', hint: 'Main Breaker — the grid connection.', seg: [{ l: 'Closed', act: 'breaker-close', on: 1, run: 1 }, { l: 'Open', act: 'breaker-open' }] },
          { l: 'Steam Dump (to condenser)', hint: 'Steam dump / turbine bypass — vents steam to the condenser to control SG pressure on a turbine trip or load rejection. Auto opens above a pressure setpoint.', seg: [{ l: 'Auto', act: 'dump-auto', on: 1, run: 1 }, { l: 'Open', act: 'dump-open' }, { l: 'Closed', act: 'dump-close' }] },
          { l: 'Turbine Load Target', num: { id: 'mweSet', min: 0, max: 1100, value: 1000, act: 'mwe-set', setL: 'Set MW' } },
        ] },
      ],
    },

    // ------------------------------------------------------------------ RBMK
    rbmk: {
      scram: 'AZ-5 SCRAM', scramShort: 'AZ-5',
      initStates: [['full_power', 'Full Power'], ['low_power_xenon', 'Low Power + Xenon (accident)']],
      defaultSeries: { power: true, void: true, steam_p: true, orm: true },
      gauges: [
        { id: 'power',   label: 'Reactor Power', lead: true, raw: function (s) { return s.instruments.power_range; }, units: '%', min: 0, max: 120, caution: 110, danger: 120, dp: 1 },
        { id: 'steam_p', label: 'Steam Press',   raw: function (s) { return s.instruments.steam_pressure; }, dim: 'pressure', min: 0, max: 10.3, caution: 7.6, danger: 8.0, dp: 1 },
        { id: 'drum',    label: 'Drum Level',    raw: function (s) { return s.instruments.drum_level; }, units: '%', min: 0, max: 100, caution_lo: 20, danger_lo: 10, dp: 0 },
        { id: 'flow',    label: 'Channel Flow',  raw: function (s) { return s.instruments.channel_flow; }, units: '%', min: 0, max: 120, caution_lo: 50, dp: 0 },
        { id: 'void',    label: 'Core Void',     raw: function (s) { return s.instruments.void_fraction; }, units: '%', mul: 100, min: 0, max: 1, caution: 0.7, danger: 0.8, dp: 0 },
        { id: 'orm',     label: 'ORM (rods)',    raw: function (s) { return s.instruments.orm_display; }, units: '', min: 0, max: 80, caution_lo: 30, danger_lo: 15, dp: 0 },
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
          { k: 'ORM (indicated)', inst: function (s) { return s.instruments.orm_display.toFixed(1) + ' rods'; }, truth: function (s) { return s.true_state.orm_equiv_rods.toFixed(1) + ' rods'; } },
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
          { k: 'EPS Bypassed', inst: function (s) { return bool(s.true_state.eps_bypassed, 'YES', 'no'); } },
          { k: 'Energy Dep.', truth: function (s) { return s.true_state.energy_deposition_rate.toFixed(0) + ' cal/g/s'; } },
          { k: 'Destruction', truth: function (s) { return bool(s.true_state.melted, (s.true_state.destruction_cause || 'MELTED').toUpperCase().replace('_', ' '), 'none'); } },
        ] },
      ],
      controls: [
        { key: 'reactor', label: 'Reactor Core', groups: [ROD_DRIVE('control_rods'), ROD_SPEED()] },
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
        { id: 'vessel_p', label: 'Vessel Press',  raw: function (s) { return s.instruments.vessel_pressure; }, dim: 'pressure', min: 0, max: 10.3, caution: 7.24, danger: 7.58, dp: 1 },
        { id: 'level',    label: 'Vessel Level',  raw: function (s) { return s.instruments.vessel_level; }, units: '%', min: 0, max: 100, caution_lo: 30, danger_lo: 10, dp: 0 },
        { id: 'recirc',   label: 'Recirc Flow',   raw: function (s) { return s.instruments.recirc_flow; }, units: '%', min: 0, max: 120, dp: 0 },
        { id: 'void',     label: 'Core Void',     raw: function (s) { return s.instruments.core_void_fraction; }, units: '%', mul: 100, min: 0, max: 1, caution: 0.6, danger: 0.7, dp: 0 },
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
        { key: 'reactor', label: 'Reactor Core', groups: [ROD_DRIVE('control_rods'), ROD_SPEED()] },
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
    } else if (g.num) {
      var n = g.num;
      inner += '<input class="num-input mono" id="' + n.id + '" type="number" min="' + n.min + '" max="' + n.max + '" value="' + n.value + '">' +
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

    renderGauges(s);
    renderAlarms(s); renderInstructor(s); renderReactimeter(s); renderFailures(s);
    // alarm tint on the CSF gauge strip while anything is unacknowledged
    $('gaugeStrip').classList.toggle('alarm-tint', s.alarms.some(function (a) { return a.state === 'active_unacknowledged'; }));
    // auto-switch to Diagram the moment a scram fires, then render the plant display
    if (s.true_state.scrammed && !lastScrammed && ui.view !== 'diagram') setView('diagram');
    renderPlantDisplay(s);
    lastScrammed = !!s.true_state.scrammed;

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
      var raw = g.raw(s);
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
    $('rxSur').textContent = t.startup_rate_dpm != null ? sgn(t.startup_rate_dpm.toFixed(2)) + ' dpm' : '— (PWR only)';
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

  var lastInstrMsg = null;
  function renderInstructor(s) {
    var cur = $('instrCurrent');
    var msg = (s.instructor && s.instructor.message) ? s.instructor.message : null;
    if (msg) { cur.textContent = msg; cur.classList.remove('instr-standby'); }
    else { cur.textContent = 'Standing by…'; cur.classList.add('instr-standby'); }
    if (msg && msg !== lastInstrMsg) setFocus('instructor');
    lastInstrMsg = msg;
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
  function cmd(c) { service.handleCommand(c); if (!service.running) { latest = service.assembleSnapshot(); render(latest); } }
  // The classic control strip and the plant-display controls reuse the same input
  // ids (feedSet, mweSet, …) — read the VISIBLE one (the inactive layout's copy is
  // display:none, so its offsetParent is null).
  function inputVal(id) {
    var els = document.querySelectorAll('[id="' + id + '"]');
    for (var i = 0; i < els.length; i++) if (els[i].offsetParent !== null) return +els[i].value;
    return els.length ? +els[els.length - 1].value : 0;
  }

  var ACTS = {
    scram: function () { cmd({ action: 'scram' }); },
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
    'borate': function () { cmd({ action: 'set_charging_flow', normalized: 0.15 }); cmd({ action: 'set_letdown_flow', normalized: 0 }); },
    'dilute': function () { cmd({ action: 'set_letdown_flow', normalized: 0.15 }); cmd({ action: 'set_charging_flow', normalized: 0 }); },
    'boron-off': function () { cmd({ action: 'set_charging_flow', normalized: 0 }); cmd({ action: 'set_letdown_flow', normalized: 0 }); },
    'eccs-on': function () { ui.pdOp.eccs = true; cmd({ action: 'set_hpi', active: true }); }, 'eccs-off': function () { cmd({ action: 'set_hpi', active: false }); }, 'eccs-auto': function () {},
    'heat-on': function () { cmd({ action: 'set_heater', power_pct: 100 }); }, 'heat-off': function () { cmd({ action: 'set_heater', power_pct: 0 }); }, 'heat-auto': function () {},
    'spray-open': function () { cmd({ action: 'set_spray', open: true }); }, 'spray-auto': function () { cmd({ action: 'set_spray', open: false }); },
    'feed-start': function () { cmd({ action: 'set_feedwater_flow', pct: 100 }); }, 'feed-stop': function () { cmd({ action: 'set_feedwater_flow', pct: 0 }); },
    'feed-set': function () { cmd({ action: 'set_feedwater_flow', pct: inputVal('feedSet') }); },
    'afw-start': function () { ui.pdOp.afw = true; cmd({ action: 'set_afw', active: true }); }, 'afw-stop': function () { cmd({ action: 'set_afw', active: false }); },
    'msiv-open': function () { if (ui.plant === 'bwr') cmd({ action: 'clear_failure', failure_id: 'msiv_closure' }); },
    'msiv-close': function () { if (ui.plant === 'bwr') cmd({ action: 'inject_failure', failure_id: 'msiv_closure' }); },
    'breaker-close': function () { cmd({ action: 'set_steam_demand', mwe: 1000 }); },
    'breaker-open': function () { if (confirm('Open the main breaker (disconnect from grid)?')) cmd({ action: 'set_steam_demand', mwe: 0 }); },
    'mwe-set': function () { cmd({ action: 'set_steam_demand', mwe: inputVal('mweSet') }); },
    'porv-block-open': function () { cmd({ action: 'open_block_valve' }); },
    'porv-block-close': function () { if (confirm('Isolate the PORV (close the block valve)? Stops all PORV flow.')) cmd({ action: 'close_block_valve' }); },
    'dump-auto': function () { cmd({ action: 'set_steam_dump', mode: 'auto' }); },
    'dump-open': function () { cmd({ action: 'set_steam_dump', mode: 'open' }); },
    'dump-close': function () { cmd({ action: 'set_steam_dump', mode: 'closed' }); },
    // RBMK
    'rbmk-flow-set': function () { cmd({ action: 'set_channel_flow', pct: inputVal('rbmkFlow') }); },
    'rbmk-feed-set': function () { cmd({ action: 'set_feedwater_flow', pct: inputVal('rbmkFeed') }); },
    'eps-on': function () { cmd({ action: 'set_eps_bypass', active: true }); }, 'eps-off': function () { cmd({ action: 'set_eps_bypass', active: false }); },
    // BWR
    'bwr-recirc-set': function () { cmd({ action: 'set_recirc_flow', pct: inputVal('bwrRecirc') }); },
    'rcic-on': function () { cmd({ action: 'set_rcic', active: true }); }, 'rcic-off': function () { cmd({ action: 'set_rcic', active: false }); },
    'hpci-on': function () { cmd({ action: 'set_hpci', active: true }); }, 'hpci-off': function () { cmd({ action: 'set_hpci', active: false }); },
    'trigger-ads': function () { if (confirm('Actuate ADS — blow the vessel down to enable low-pressure injection?')) cmd({ action: 'trigger_ads' }); },
    'start-lpci': function () { cmd({ action: 'start_lpci' }); },
    'slc-initiate': function () { if (confirm('Initiate Standby Liquid Control (boron)? Shuts the reactor down even if the rods fail to insert.')) cmd({ action: 'initiate_slc' }); },
    'start-lpcs': function () { cmd({ action: 'start_lpcs' }); },
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
    'rod-withdraw': function () { cmd({ action: 'rod_start', group_id: 'control_rods', direction: 1, speed: ui.rodSpeed }); },
    'rod-insert': function () { cmd({ action: 'rod_start', group_id: 'control_rods', direction: -1, speed: ui.rodSpeed }); },
  };
  var holding = false;
  function endHold() { if (!holding) return; holding = false; cmd({ action: 'rod_stop', group_id: 'control_rods' }); document.querySelectorAll('.holding').forEach(function (x) { x.classList.remove('holding'); }); }

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
      e.preventDefault(); holding = true; b.classList.add('holding'); h();
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
    // Settings → Values Display (Instruments / True / Both) drives the All view.
    var oseg = $('overlaySeg2');
    if (oseg) oseg.addEventListener('click', function (e) { var b = e.target.closest('[data-overlay]'); if (!b) return; ui.overlay = b.getAttribute('data-overlay'); syncSeg('[data-overlay]', ui.overlay, 'overlay'); if (latest) renderPdAll(latest); });
    $('registerSeg').addEventListener('click', function (e) { var b = e.target.closest('[data-register]'); if (!b) return; ui.register = b.getAttribute('data-register'); cmd({ action: 'set_register', value: ui.register }); });
    $('unitsSeg').addEventListener('click', function (e) { var b = e.target.closest('[data-units]'); if (!b) return; ui.units = b.getAttribute('data-units'); if (latest) render(latest); });
    $('graphParams').addEventListener('change', function (e) { var cb = e.target.closest('input[data-series]'); if (!cb) return; ui.series[cb.getAttribute('data-series')] = cb.checked; drawChart(); });
    $('graphWindow').addEventListener('click', function (e) { var b = e.target.closest('[data-win]'); if (!b) return; ui.window = +b.getAttribute('data-win'); drawChart(); });
    $('initState').addEventListener('change', function () { ui.initState = $('initState').value; });
    $('engineSel').addEventListener('change', function () { switchEngine($('engineSel').value); });
    $('loadFile').addEventListener('change', function (e) {
      var f = e.target.files[0]; if (!f) return; var r = new FileReader();
      r.onload = function () { try { var st = JSON.parse(r.result); service.loadState(st); afterPlantChange(); } catch (err) { alert('Bad save file'); } };
      r.readAsText(f);
    });
    // --- plant-display wiring ---
    $('viewTabs').addEventListener('click', function (e) { var b = e.target.closest('[data-view]'); if (b) setView(b.getAttribute('data-view')); });
    // status-bar slot click = acknowledge an auto-actuation (red → green)
    $('statusBar').addEventListener('click', function (e) { var sl = e.target.closest('.sys-slot'); if (!sl) return; ui.pdAck[sl.getAttribute('data-slot')] = true; if (latest) renderStatusBar(latest); });
    // All-view overlay seg
    $('viewArea').addEventListener('click', function (e) { var b = e.target.closest('#pdOverlaySeg [data-overlay]'); if (!b) return; ui.overlay = b.getAttribute('data-overlay'); syncSeg('[data-overlay]', ui.overlay, 'overlay'); if (latest) renderPdAll(latest); });
    setupPdScram();
    document.body.addEventListener('mouseover', function (e) {
      var el = e.target.closest('[data-scanner-hint]'); if (!el) return;
      var hint = el.getAttribute('data-scanner-hint'), dash = hint.indexOf(' — ');
      $('scanner').innerHTML = dash > -1 ? '<strong>' + hint.slice(0, dash) + '</strong>' + hint.slice(dash) : hint;
    });
  }
  function syncSeg(sel, val, attr) { document.querySelectorAll(sel).forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-' + attr) === val); }); }

  // Plant-display SCRAM: 2-click arm (CONFIRM within 3 s), then fire.
  function setupPdScram() {
    var btn = $('pdScram'), timer = null;
    btn.addEventListener('click', function () {
      if (btn.classList.contains('fired')) return;
      if (btn.classList.contains('armed')) { btn.classList.remove('armed'); if (timer) clearTimeout(timer); btn.textContent = 'SCRAM'; cmd({ action: 'scram' }); return; }
      btn.classList.add('armed'); btn.textContent = 'CONFIRM';
      timer = setTimeout(function () { btn.classList.remove('armed'); btn.textContent = 'SCRAM'; }, 3000);
    });
  }

  // Switch engine (PWR / RBMK pre / RBMK post / BWR): select the plant + version,
  // then rebuild every plant-specific surface.
  function switchEngine(key) {
    var e = ENGINES[key]; if (!e) return;
    ui.engineKey = key; ui.plant = e.plant; ui.initState = e.init;
    ui.series = Object.assign({}, prof().defaultSeries);
    service.stop(); $('playBtn').textContent = '▶'; $('playBtn').classList.add('paused');
    service.handleCommand({ action: 'reset', plant_id: e.plant, initial_state: e.init, design_version: e.dv });
    rebuildPlantUI();
  }

  function rebuildPlantUI() {
    chartBuf = []; smoothed = {};
    buildGauges(); buildGraphParams(); buildInitStates(); buildFailures();
    buildPlantDisplay();
    latest = service.assembleSnapshot(); render(latest);
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
  function sur(s) { var v = s.true_state.startup_rate_dpm; if (v == null) return '—'; return Math.abs(v) < 0.01 ? { dim: v.toFixed(2) + ' dpm' } : v.toFixed(2) + ' dpm'; }

  function R(k, get, opts) { var r = { k: k, get: get }; if (opts) for (var o in opts) r[o] = opts[o]; return r; }

  // control-group literals reused across the plant-display views
  function CG_ECCS() { return { l: 'ECCS', emergency: 1, hint: 'Emergency Core Cooling — high-pressure injection. AUTO actuates on low pressure.', seg: [{ l: 'Auto', act: 'eccs-auto', on: 1, run: 1 }, { l: 'On', act: 'eccs-on' }, { l: 'Off', act: 'eccs-off' }] }; }
  function CG_MSIV() { return { l: 'MSIV', hint: 'Main Steam Isolation Valve' + (ui.plant === 'bwr' ? ' — isolates main steam (closes the turbine path).' : ' — (steam-line isolation; modeled on the BWR; placeholder here).'), seg: [{ l: 'Open', act: 'msiv-open', on: 1 }, { l: 'Close', act: 'msiv-close', warn: 1 }] }; }

  var PD = {
    pwr: {
      slots: [
        { id: 'rcp', label: 'RCP', group: 'nuclear' }, { id: 'eccs', label: 'ECCS', group: 'nuclear' }, { id: 'porv_block', label: 'PORV Blk', group: 'nuclear' },
        { id: 'afw', label: 'AFW', group: 'secondary' }, { id: 'msiv', label: 'MSIV', group: 'secondary' }, { id: 'cont_iso', label: 'Cont. Iso', group: 'secondary' },
        { id: 'station_pwr', label: 'Stn Pwr', group: 'power' },
      ],
      state: function (s) {
        return {
          rcp: s.instruments.rcp_running ? 'running' : 'alarm',
          eccs: hasFail(s, 'degraded_hpi') ? 'caution' : actuated(s, 'eccs', s.instruments.hpi_active),
          porv_block: s.true_state.porv_stuck ? 'alarm' : (s.true_state.porv_open ? 'caution' : 'normal'),
          afw: hasFail(s, 'afw_failure') ? 'alarm' : actuated(s, 'afw', s.true_state.afw_active),
          msiv: 'normal', cont_iso: 'normal',
          station_pwr: s.instruments.station_blackout ? 'alarm' : 'normal',
        };
      },
      diagram: [ROD_DRIVE('control_rods'), CG_ECCS(), CG_MSIV()],
      primary: {
        sections: [
          { title: 'Reactor Core', rows: [
            R('Power', function (s) { return s.instruments.power_range.toFixed(1) + ' %'; }),
            R('Control Bank', function (s) { return rg(s, 'control'); }), R('Shutdown Bank', function (s) { return rg(s, 'shutdown'); }),
            R('Startup Rate', sur), R('Scrammed', function (s) { return bool(s.rps_state.scrammed, 'YES', 'no'); }),
            R('Decay Heat', function (s) { return s.true_state.decay_heat_pct.toFixed(1) + ' %'; }), R('Fuel Temp', function (s) { return dispT(s.true_state.fuel_temp_c); }),
          ] },
          { title: 'RCS', rows: [
            R('T-hot', function (s) { return dispT(s.instruments.thot); }), R('T-cold', function (s) { return dispT(s.instruments.tcold); }), R('Tavg', function (s) { return dispT(s.instruments.tavg); }),
            R('RCP', function (s) { return bool(s.instruments.rcp_running, 'running', 'STOPPED'); }), R('Boron', function (s) { return s.true_state.boron_ppm.toFixed(0) + ' ppm'; }),
          ] },
          { title: 'Pressurizer', rows: [
            R('Pressure', function (s) { return dispP(s.instruments.primary_pressure); }), R('PZR Level', function (s) { return s.instruments.pzr_level.toFixed(0) + ' %'; }),
            R('Subcooling', function (s) { return s.instruments.subcooling_margin; }, { subcool: 1 }),
            R('PORV', function (s) { return bool(s.instruments.porv_indicator === 'open', 'OPEN', 'closed'); }),
            R('PORV Block', function (s) { var o = s.control_state.porv_block_open; return { t: o ? 'open' : 'ISOLATED', cls: o ? 'q-normal' : 'q-caution' }; }),
          ] },
        ],
        controls: [ROD_DRIVE('control_rods'), ROD_SPEED(),
          { l: 'Boron', seg: [{ l: 'Borate', act: 'borate' }, { l: 'Off', act: 'boron-off', on: 1 }, { l: 'Dilute', act: 'dilute' }] },
          { l: 'PZR Heaters', seg: [{ l: 'Auto', act: 'heat-auto', on: 1, run: 1 }, { l: 'Off', act: 'heat-off' }] },
          { l: 'PZR Spray', seg: [{ l: 'Auto', act: 'spray-auto', on: 1, run: 1 }, { l: 'On', act: 'spray-open' }] },
          { l: 'RCP', seg: [{ l: 'Run', act: 'rcp-run', on: 1, run: 1 }, { l: 'Stop', act: 'rcp-stop' }] },
          { l: 'PORV Block', seg: [{ l: 'Open', act: 'porv-block-open', on: 1 }, { l: 'Isolate', act: 'porv-block-close', warn: 1 }] }],
        cross: [R('SG Level', function (s) { return s.instruments.sg_level.toFixed(0) + ' %'; }), R('Feedwater', function (s) { return pctOf(s.instruments.fw_flow); }),
          R('AFW', function (s) { return bool(s.true_state.afw_active, 'on', 'off'); }), R('Output', function (s) { return s.instruments.mwe_output.toFixed(0) + ' MW'; })],
      },
      secondary: {
        sections: [
          { title: 'Steam Generators / Feedwater', rows: [
            R('SG Level', function (s) { return s.instruments.sg_level.toFixed(0) + ' %'; }), R('Steam Flow', function (s) { return pctOf(s.instruments.steam_flow); }),
            R('Feedwater Flow', function (s) { return pctOf(s.instruments.fw_flow); }), R('AFW', function (s) { return bool(s.true_state.afw_active, 'running', 'standby'); }),
            R('Feed Reg', function (s) { return s.control_state.feedwater_flow_pct.toFixed(0) + ' %'; }),
          ] },
          { title: 'Turbine / Condenser', rows: [
            R('Output', function (s) { return s.instruments.mwe_output.toFixed(0) + ' MW'; }), R('Turbine RPM', function (s) { return s.instruments.turbine_rpm.toFixed(0); }),
            R('Cond. Vacuum', function (s) { return dispV(s.instruments.condenser_vacuum); }), R('Main Breaker', function (s) { return bool(s.control_state.steam_demand_mwe > 1, 'closed', 'open'); }),
            R('Grid Match', function (s) { return gridMatch(s).toFixed(1) + ' %'; }), R('Steam Dump', function (s) { return (s.control_state.steam_dump_auto ? 'auto ' : 'man ') + s.control_state.steam_dump_pct.toFixed(0) + ' %'; }),
          ] },
        ],
        controls: [
          { l: 'Feed Pumps', seg: [{ l: 'Start', act: 'feed-start', on: 1, run: 1 }, { l: 'Stop', act: 'feed-stop' }] },
          { l: 'AFW', emergency: 1, seg: [{ l: 'Start', act: 'afw-start' }, { l: 'Stop', act: 'afw-stop', on: 1 }] },
          { l: 'Feed Reg', num: { id: 'feedSet', min: 0, max: 100, value: 100, act: 'feed-set', setL: 'Set %' } },
          { l: 'Steam Dump', hint: 'Steam dump / turbine bypass to condenser.', seg: [{ l: 'Auto', act: 'dump-auto', on: 1, run: 1 }, { l: 'Open', act: 'dump-open' }, { l: 'Closed', act: 'dump-close' }] },
          CG_MSIV(),
          { l: 'Turbine Load', num: { id: 'mweSet', min: 0, max: 1100, value: 1000, act: 'mwe-set', setL: 'Set MW' } },
          { l: 'Main Breaker', seg: [{ l: 'Closed', act: 'breaker-close', on: 1, run: 1 }, { l: 'Open', act: 'breaker-open' }] }],
        cross: [R('Reactor Power', function (s) { return s.instruments.power_range.toFixed(0) + ' %'; }), R('Tavg', function (s) { return dispT(s.instruments.tavg); }), R('Primary Press', function (s) { return dispP(s.instruments.primary_pressure); })],
      },
    },

    rbmk: {
      slots: [
        { id: 'mcp', label: 'MCP', group: 'nuclear' }, { id: 'eps', label: 'EPS', group: 'nuclear' },
        { id: 'afw', label: 'Feed', group: 'secondary' }, { id: 'station_pwr', label: 'Stn Pwr', group: 'power' },
      ],
      state: function (s) {
        var f = s.control_state.channel_flow_setpoint_pct != null ? s.true_state.channel_flow_pct : 100;
        return {
          mcp: f > 50 ? 'running' : (f > 10 ? 'caution' : 'alarm'),
          eps: s.true_state.eps_bypassed ? 'caution' : 'normal',
          afw: hasFail(s, 'loss_of_feedwater') ? 'alarm' : (s.control_state.feedwater_flow_pct > 5 ? 'running' : 'caution'),
          station_pwr: 'normal',
        };
      },
      diagram: [ROD_DRIVE('control_rods'), { l: 'EPS', emergency: 1, hint: 'Emergency Protection bypass.', seg: [{ l: 'Active', act: 'eps-off', on: 1, run: 1 }, { l: 'Bypass', act: 'eps-on', warn: 1 }] }],
      primary: {
        sections: [
          { title: 'Reactor Core', rows: [
            R('Power', function (s) { return s.instruments.power_range.toFixed(1) + ' %'; }), R('Control Rods', function (s) { return rg(s, 'control'); }),
            R('Fuel Temp', function (s) { return dispT(s.instruments.fuel_temp); }), R('Graphite Temp', function (s) { return dispT(s.true_state.graphite_temp_avg_c); }),
            R('Scrammed', function (s) { return bool(s.rps_state.scrammed, 'YES', 'no'); }),
          ] },
          { title: 'Reactivity & ORM', rows: [
            R('ORM', function (s) { return s.instruments.orm_display.toFixed(1) + ' rods'; }), R('ORM Alarm', function (s) { return bool(s.true_state.orm_alarm_active, 'YES', 'no'); }),
            R('Void', function (s) { return pctOf(s.instruments.void_fraction); }), R('Reactivity', function (s) { return (s.true_state.reactivity_pcm >= 0 ? '+' : '') + s.true_state.reactivity_pcm.toFixed(0) + ' pcm'; }),
            R('Xenon', function (s) { return s.true_state.xenon_pct_eq.toFixed(0) + ' %'; }),
          ] },
          { title: 'Coolant Channels', rows: [
            R('Channel Flow', function (s) { return s.instruments.channel_flow.toFixed(0) + ' %'; }), R('EPS Bypassed', function (s) { return bool(s.true_state.eps_bypassed, 'YES', 'no'); }),
          ] },
        ],
        controls: [ROD_DRIVE('control_rods'), ROD_SPEED(),
          { l: 'MCP / Channel Flow', num: { id: 'rbmkFlow', min: 0, max: 120, value: 100, act: 'rbmk-flow-set', setL: 'Set %' } },
          { l: 'EPS', emergency: 1, seg: [{ l: 'Active', act: 'eps-off', on: 1, run: 1 }, { l: 'Bypass', act: 'eps-on', warn: 1 }] }],
        cross: [R('Drum Level', function (s) { return s.instruments.drum_level.toFixed(0) + ' %'; }), R('Steam Press', function (s) { return dispP(s.instruments.steam_pressure); }), R('Turbine', function (s) { return pctOf(s.instruments.power_range / 100); })],
      },
      secondary: {
        sections: [
          { title: 'Steam Drum', rows: [
            R('Steam Pressure', function (s) { return dispP(s.instruments.steam_pressure); }), R('Drum Level', function (s) { return s.instruments.drum_level.toFixed(0) + ' %'; }),
          ] },
          { title: 'Turbine', rows: [ R('Channel Flow', function (s) { return s.instruments.channel_flow.toFixed(0) + ' %'; }) ] },
        ],
        controls: [{ l: 'Feedwater', num: { id: 'rbmkFeed', min: 0, max: 100, value: 100, act: 'rbmk-feed-set', setL: 'Set %' } }],
        cross: [R('Core Power', function (s) { return s.instruments.power_range.toFixed(0) + ' %'; }), R('Coolant Flow', function (s) { return s.instruments.channel_flow.toFixed(0) + ' %'; }), R('Void', function (s) { return pctOf(s.instruments.void_fraction); })],
      },
    },

    bwr: {
      slots: [
        { id: 'recirc', label: 'Recirc', group: 'nuclear' }, { id: 'rcic', label: 'RCIC', group: 'nuclear' }, { id: 'hpci', label: 'HPCI', group: 'nuclear' },
        { id: 'ads', label: 'ADS', group: 'nuclear' }, { id: 'lpci', label: 'LPCI', group: 'nuclear' }, { id: 'slc', label: 'SLC', group: 'nuclear' },
        { id: 'msiv', label: 'MSIV', group: 'secondary' }, { id: 'station_pwr', label: 'Stn Pwr', group: 'power' },
      ],
      state: function (s) {
        return {
          recirc: s.true_state.recirc_flow_pct > 50 ? 'running' : (s.true_state.recirc_flow_pct > 5 ? 'caution' : 'alarm'),
          rcic: (s.true_state.rcic_running) ? 'running' : (hasFail(s, 'rcic_failure') ? 'alarm' : 'normal'),
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
            R('Power', function (s) { return s.instruments.power_range.toFixed(1) + ' %'; }), R('Control Rods', function (s) { return rg(s, 'control'); }),
            R('Core Void', function (s) { return pctOf(s.instruments.core_void_fraction); }), R('Fuel Temp', function (s) { return dispT(s.true_state.fuel_temp_c); }),
            R('Scrammed', function (s) { return bool(s.rps_state.scrammed, 'YES', 'no'); }),
          ] },
          { title: 'Vessel', rows: [
            R('Pressure', function (s) { return dispP(s.instruments.vessel_pressure); }), R('Water Level', function (s) { return s.instruments.vessel_level.toFixed(0) + ' %'; }),
            R('Steam Flow', function (s) { return pctOf(s.instruments.steam_flow); }), R('Feedwater', function (s) { return pctOf(s.instruments.fw_flow); }),
          ] },
          { title: 'Recirculation', rows: [ R('Recirc / Core Flow', function (s) { return s.instruments.recirc_flow.toFixed(0) + ' %'; }) ] },
        ],
        controls: [ROD_DRIVE('control_rods'), ROD_SPEED(),
          { l: 'Recirc Drive', num: { id: 'bwrRecirc', min: 0, max: 48, value: 40, act: 'bwr-recirc-set', setL: 'Set %' } }],
        cross: [R('Turbine Steam', function (s) { return pctOf(s.instruments.steam_flow); }), R('Feedwater', function (s) { return pctOf(s.instruments.fw_flow); }), R('Turbine Load', function (s) { return (s.control_state.feedwater_flow_pct).toFixed(0) + ' %'; })],
      },
      secondary: {
        sections: [
          { title: 'Turbine / Feedwater', rows: [
            R('Steam Flow', function (s) { return pctOf(s.instruments.steam_flow); }), R('Feedwater Flow', function (s) { return pctOf(s.instruments.fw_flow); }),
            R('Vessel Pressure', function (s) { return dispP(s.instruments.vessel_pressure); }),
          ] },
          { title: 'Safety Systems', rows: [
            R('RCIC', function (s) { return bool(s.true_state.rcic_running, 'running', 'off'); }), R('HPCI', function (s) { return bool(s.true_state.hpci_running, 'running', 'off'); }),
            R('ADS', function (s) { return bool(s.true_state.ads_open, 'OPEN', 'closed'); }), R('LPCI', function (s) { return bool(s.true_state.lpci_running, 'running', 'off'); }),
            R('Core Spray', function (s) { return bool(s.true_state.lpcs_running, 'running', 'off'); }), R('SLC', function (s) { return bool(s.true_state.slc_active, 'active', 'standby'); }),
            R('Battery', function (s) { return s.true_state.battery_charge_pct.toFixed(0) + ' %'; }),
          ] },
        ],
        controls: [
          { l: 'RCIC', emergency: 1, seg: [{ l: 'On', act: 'rcic-on', run: 1 }, { l: 'Off', act: 'rcic-off', on: 1 }] },
          { l: 'HPCI', emergency: 1, seg: [{ l: 'On', act: 'hpci-on', run: 1 }, { l: 'Off', act: 'hpci-off', on: 1 }] },
          { l: 'ADS', emergency: 1, seg: [{ l: 'Trigger', act: 'trigger-ads', warn: 1 }] },
          { l: 'LPCI', emergency: 1, seg: [{ l: 'Start', act: 'start-lpci', run: 1 }] },
          { l: 'Core Spray', emergency: 1, seg: [{ l: 'Start', act: 'start-lpcs', run: 1 }] },
          { l: 'Manual SRV', emergency: 1, seg: [{ l: 'Open', act: 'srv-open', warn: 1 }, { l: 'Close', act: 'srv-close', on: 1 }] },
          { l: 'SLC', emergency: 1, seg: [{ l: 'Initiate', act: 'slc-initiate', warn: 1 }] },
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
  function paramRowHTML(idx) { return '<div class="pd-row" data-pdrow="' + idx + '"><span class="pk"></span><span class="pv"></span></div>'; }
  function buildCard(viewKey) {
    var v = pd()[viewKey], html = '<div class="pd-card">', rows = [];
    html += '<div class="pd-sections">';
    v.sections.forEach(function (sec) {
      html += '<div class="pd-section"><h5>' + sec.title + '</h5>';
      sec.rows.forEach(function (r) { var idx = rows.length; rows.push(r); html += '<div class="pd-row' + (r.subcool ? ' subcool' : '') + '" data-pv="' + viewKey + '-' + idx + '"><span class="pk">' + r.k + '</span><span class="pv">—</span></div>'; });
      html += '</div>';
    });
    html += '</div>';
    // controls
    html += '<div class="pd-controls" id="pdctl-' + viewKey + '"></div>';
    // cross-indication strip
    html += '<div class="cross-strip"><span class="cross-label">Cross-check</span>';
    (v.cross || []).forEach(function (r) { var idx = rows.length; rows.push(r); r._cross = true; html += '<span class="cross-item" data-pv="' + viewKey + '-' + idx + '"><span class="cross-param-name">' + r.k + '</span><span class="cross-param-val">—</span></span>'; });
    html += '</div></div>';
    pdRows[viewKey] = rows;
    return html;
  }
  function buildViews() {
    var area = $('viewArea'); pdRows = {};
    var html = '';
    // Diagram
    html += '<div class="pdview' + (ui.view === 'diagram' ? ' on' : '') + '" data-pdview="diagram">' +
      '<div class="view-placeholder"><span>Plant diagram — SVG in development</span><span class="placeholder-sub">Energy flow: Reactor → ' + (ui.plant === 'bwr' ? 'Vessel → Turbine' : (ui.plant === 'rbmk' ? 'Drums → Turbine' : 'SGs → Turbine → Condenser')) + '</span>' +
      '<div class="pd-diagram-controls" id="pddiag"></div></div></div>';
    // Primary / Secondary cards
    html += '<div class="pdview' + (ui.view === 'primary' ? ' on' : '') + '" data-pdview="primary">' + buildCard('primary') + '</div>';
    html += '<div class="pdview' + (ui.view === 'secondary' ? ' on' : '') + '" data-pdview="secondary">' + buildCard('secondary') + '</div>';
    // All params — reuse the numeric columns
    html += '<div class="pdview' + (ui.view === 'all' ? ' on' : '') + '" data-pdview="all">' +
      '<div class="pd-all-head"><div class="seg" id="pdOverlaySeg"><button class="on" data-overlay="instruments">Instruments</button><button data-overlay="true">True</button><button data-overlay="both">Both</button></div></div>' +
      '<div class="pd-all-grid" id="pdAllGrid"></div></div>';
    area.innerHTML = html;
    // mount controls (built once; reuse ctlGroup)
    pd().primary.controls.forEach(function (g) { $('pdctl-primary').appendChild(ctlGroup(g)); });
    pd().secondary.controls.forEach(function (g) { $('pdctl-secondary').appendChild(ctlGroup(g)); });
    pd().diagram.forEach(function (g) { $('pddiag').appendChild(ctlGroup(g)); });
    buildPdAll();
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
      var valEl = el.querySelector(r._cross ? '.cross-param-val' : '.pv');
      if (r.subcool) { renderSubcool(valEl, r.get(s)); return; }
      var v = r.get(s), cls = '';
      if (v && v.dim != null) { el.querySelector('.pv').className = 'pv'; valEl.innerHTML = '<span class="dim-info">' + v.dim + '</span>'; return; }
      if (v && v.cls !== undefined) { valEl.textContent = v.t; cls = v.cls; }       // explicit severity
      else if (v && v.b !== undefined) { valEl.textContent = v.t; cls = boolClass(v.t); }
      else valEl.textContent = v;
      if (!r._cross) valEl.className = 'pv ' + cls;
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
    renderStatusBar(s);
    if (ui.view === 'primary' || ui.view === 'secondary') renderPdRows(ui.view, s);
    if (ui.view === 'all') renderPdAll(s);
    // pd scram button mirrors the reactor state
    var ps = $('pdScram');
    if (ps) { if (s.true_state.scrammed) { ps.classList.add('fired'); ps.classList.remove('armed'); ps.textContent = 'SCRAMMED'; } else if (!ps.classList.contains('armed')) { ps.classList.remove('fired'); ps.textContent = 'SCRAM'; } }
  }

  function setView(v) {
    ui.view = v;
    $('viewTabs').querySelectorAll('.view-btn').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-view') === v); });
    $('viewArea').querySelectorAll('.pdview').forEach(function (p) { p.classList.toggle('on', p.getAttribute('data-pdview') === v); });
    if (latest) renderPlantDisplay(latest);
  }

  function buildPlantDisplay() { buildStatusBar(); buildViewSwitcher(); buildViews(); }

  // ============================================================ init
  function init() {
    ui.series = Object.assign({}, PROFILES.pwr.defaultSeries);
    service = new RD.SimulationService({ seed: 0x1234 });
    service.subscribe(render);
    bindUI(); bindCommands();
    // optional ?engine= override (dev convenience / sharing)
    var em = /[?&]engine=(pwr|rbmk_pre|rbmk_post|bwr)/.exec(location.search || '');
    var startKey = em ? em[1] : 'pwr', startEng = ENGINES[startKey];
    ui.engineKey = startKey; ui.plant = startEng.plant; ui.initState = startEng.init;
    ui.series = Object.assign({}, prof().defaultSeries);
    buildGauges(); buildGraphParams(); buildInitStates();
    buildPlantDisplay();
    $('engineSel').value = startKey;
    service.selectPlant(startEng.plant, ui.initState, startEng.dv);   // initial snapshot → render
    buildFailures();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
