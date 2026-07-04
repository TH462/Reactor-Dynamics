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
    view: 'diagram',        // plant-display active view
    pdAck: {},              // operator-acknowledged auto-actuations (ECCS/AFW → green)
    pdOp: {},               // operator-initiated systems (start green directly)
    ctlVals: {},            // last value typed into each control-bar number input (id → value), so the shared bar doesn't revert on view switch
    manualSection: 'overview', // active section in the Operator's Manual overlay
    follow: null,           // { id, idx } — a procedure being followed in the Instructor block
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
          { k: 'Avg Coolant Temp (Tavg)', inst: function (s) { return dispT(s.instruments.tavg); }, truth: function (s) { return dispT(s.true_state.tavg_c); } },
          { k: 'Hot-Leg / Cold-Leg Temp', inst: function (s) { return dispT(s.instruments.thot) + ' / ' + dispT(s.instruments.tcold); } },
          { k: 'Pressurizer Level (PZR)', inst: function (s) { return s.instruments.pzr_level.toFixed(0) + ' %'; }, truth: function (s) { return s.true_state.pzr_level_pct.toFixed(0) + ' %'; } },
          { k: 'Subcooling', inst: function (s) { return dispTd(s.instruments.subcooling_margin); }, truth: function (s) { return dispTd(s.true_state.subcooling_c); } },
          { k: 'Relief Valve (PORV)', inst: function (s) { return bool(s.instruments.porv_indicator === 'open', 'OPEN', 'closed'); }, truth: function (s) { return bool(s.true_state.porv_open, 'OPEN', 'closed'); } },
          { k: 'Relief Block Valve (PORV)', inst: function (s) { return s.control_state.porv_block_open ? 'open' : 'isolated'; } },
          { k: 'Boron', truth: function (s) { return s.true_state.boron_ppm.toFixed(0) + ' ppm'; } },
          { k: 'Charging / Letdown (CVCS)', inst: function (s) { return (s.control_state.charging_flow_normalized * 100).toFixed(1) + ' / ' + ((s.control_state.letdown_flow_normalized || 0) * 100).toFixed(1) + ' %'; } },
          { k: 'CVCS Mode', inst: function (s) { return (s.control_state.cvcs_auto ? 'AUTO make-up' : 'manual') + (s.control_state.charging_pump_running === false ? ' · pump OFF' : ''); } },
        ] },
        { title: 'Steam Generators', rows: [
          { k: 'Steam Generator Level (SG)', inst: function (s) { return s.instruments.sg_level.toFixed(0) + ' %'; }, truth: function (s) { return s.true_state.sg_level_pct.toFixed(0) + ' %'; } },
          { k: 'Steam Flow', inst: function (s) { return pctOf(s.instruments.steam_flow); } },
          { k: 'Feedwater Flow', inst: function (s) { return pctOf(s.instruments.fw_flow); } },
          { k: 'Aux Feedwater (AFW)', inst: function (s) { return bool(s.true_state.afw_active, 'on', 'off'); } },
        ] },
        { title: 'Turbine / Condenser', rows: [
          { k: 'Grid Match', inst: function (s) { return gridMatch(s).toFixed(1) + ' %'; } },
          { k: 'Output', inst: function (s) { return s.instruments.mwe_output.toFixed(0) + ' MW'; } },
          { k: 'Turbine RPM', inst: function (s) { return s.instruments.turbine_rpm.toFixed(0); } },
          { k: 'Condenser Vacuum', inst: function (s) { return dispV(s.instruments.condenser_vacuum); } },
          { k: 'Steam Dump', inst: function (s) { return (s.control_state.steam_dump_auto ? 'auto ' : 'man ') + s.control_state.steam_dump_pct.toFixed(0) + ' %'; } },
          { k: 'Main Breaker', inst: function (s) { return bool(s.control_state.steam_demand_mwe > 1, 'closed', 'open'); } },
        ] },
        { title: 'Emergency & Inventory', rows: [
          { k: 'Core Inventory', truth: function (s) { return s.true_state.core_inventory_pct.toFixed(0) + ' %'; } },
          { k: 'Reactor Coolant Pumps (RCP)', inst: function (s) { return bool(s.instruments.rcp_running, 'running', 'STOPPED'); } },
          { k: 'High-Pressure Injection (HPI/ECCS)', inst: function (s) { return bool(s.instruments.hpi_active, 'active', 'standby'); } },
          { k: 'Station Blackout', inst: function (s) { return bool(s.instruments.station_blackout, 'YES', 'no'); } },
        ] },
      ],
      controls: [
        { key: 'reactor', label: 'Reactor Core', groups: [ROD_DRIVE('control_rods'), ROD_SPEED(), SHUTDOWN_DRIVE('shutdown_rods')] },
        { key: 'primary', label: 'Primary Inventory', groups: [
          { l: 'Reactor Coolant Pumps (RCP)', hint: 'Reactor Coolant Pumps — force primary flow. Stopping them collapses flow.', seg: [{ l: 'Run', act: 'rcp-run', on: 1, run: 1 }, { l: 'Stop', act: 'rcp-stop' }] },
          { l: 'Chemical Shim (Boron)', hint: 'Chemical Shim — adjusts dissolved boron (a neutron absorber) to trim reactivity slowly.', seg: [{ l: 'Borate', act: 'borate' }, { l: 'Off', act: 'boron-off', on: 1 }, { l: 'Dilute', act: 'dilute' }] },
          { l: 'PORV Block Valve', hint: 'PORV block (isolation) valve — closing it isolates a stuck-open PORV even when the indicator lies "closed". The key TMI recovery action.', seg: [{ l: 'Open', act: 'porv-block-open', on: 1 }, { l: 'Isolate', act: 'porv-block-close', warn: 1 }] },
          { l: 'Emergency Core Cooling (ECCS)', emergency: 1, hint: 'Emergency Core Cooling — high-pressure injection. AUTO actuates on low pressure.', seg: [{ l: 'Auto', act: 'eccs-auto', on: 1, run: 1 }, { l: 'On', act: 'eccs-on' }, { l: 'Off', act: 'eccs-off' }] },
          { l: 'Pressurizer Heaters (PZR)', hint: 'Pressurizer heaters raise primary pressure. Auto holds the setpoint; the slider is a manual power %.', num: { id: 'heatSet', min: 0, max: 100, value: 0, act: 'heat-set', setL: 'Set %' }, seg: [{ l: 'Auto', act: 'heat-auto', on: 1, run: 1 }] },
          { l: 'Pressurizer Spray (PZR)', hint: 'Pressurizer spray lowers primary pressure. It draws from the cold leg after the Reactor Coolant Pump (RCP), so it needs RCP flow. Auto holds the setpoint; the slider is a manual valve %.', num: { id: 'spraySet', min: 0, max: 100, value: 0, act: 'spray-set', setL: 'Set %' }, seg: [{ l: 'Auto', act: 'spray-auto', on: 1, run: 1 }] },
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
    if (ui.follow) { renderFollow(s); return; }   // following a manual procedure
    var cur = $('instrCurrent');
    var msg = (s.instructor && s.instructor.message) ? s.instructor.message : null;
    if (msg) { cur.textContent = msg; cur.classList.remove('instr-standby'); }
    else { cur.textContent = 'Standing by…'; cur.classList.add('instr-standby'); }
    if (msg && msg !== lastInstrMsg) setFocus('instructor');
    lastInstrMsg = msg;
  }

  // ---- "Follow in Instructor": step through a manual procedure while operating ----
  function curFollowProc() { return ui.follow ? ((RD.MANUAL_PROCEDURES || {})[ui.engineKey] || []).filter(function (x) { return x.id === ui.follow.id; })[0] : null; }
  function accMet(ts, c) { var v = ts[c.p]; switch (c.op) { case '>': return v > c.v; case '<': return v < c.v; case '>=': return v >= c.v; case '<=': return v <= c.v; case '~': return Math.abs(v - c.v) <= (c.tol || 0); } return false; }
  function followProcedure(id) {
    var procs = (RD.MANUAL_PROCEDURES || {})[ui.engineKey] || [];
    if (!procs.filter(function (x) { return x.id === id; })[0]) return;
    ui.follow = { id: id, idx: 0 };
    closeManual(); setFocus('instructor'); renderFollow(latest);
  }
  function followNav(d) {
    var pr = curFollowProc(); if (!pr) { ui.follow = null; return; }
    if (d === 'stop') { ui.follow = null; renderInstructor(latest || { instructor: {} }); return; }
    var n = pr.steps.length;
    if (d === 'next') ui.follow.idx = Math.min(n - 1, ui.follow.idx + 1);
    else if (d === 'prev') ui.follow.idx = Math.max(0, ui.follow.idx - 1);
    else if (d === 'restart') ui.follow.idx = 0;
    renderFollow(latest);
  }
  function renderFollow(s) {
    var pr = curFollowProc(); if (!pr) { ui.follow = null; return; }
    var n = pr.steps.length, st = pr.steps[ui.follow.idx] || {};
    $('instrPrev').innerHTML = 'Following: <b>' + mesc(pr.title) + '</b> — step ' + (ui.follow.idx + 1) + ' of ' + n;
    var meta = [];
    if (st.control) meta.push('Control: <b>' + mesc(st.control) + '</b>');
    if (st.target) meta.push('Target: ' + mesc(st.target));
    var acc = '';
    if (st.acc) {
      var met = (s && s.true_state) ? accMet(s.true_state, st.acc) : false;
      acc = '<div class="m-note">✓ when ' + mesc(st.acc.p) + ' ' + (OPSYM[st.acc.op] || st.acc.op) + ' ' + mesc(st.acc.v) +
        (met ? ' <span style="color:var(--running)">✓ met</span>' : ' <span class="muted">…not yet</span>') + '</div>';
    }
    var cur = $('instrCurrent'); cur.classList.remove('instr-standby');
    cur.innerHTML = mesc(st.text) + (meta.length ? '<div class="m-note" style="margin-top:4px">' + meta.join(' &nbsp;·&nbsp; ') + '</div>' : '') + acc +
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
    // Settings → Values Display (Instruments / True / Both) drives the All view.
    var oseg = $('overlaySeg2');
    if (oseg) oseg.addEventListener('click', function (e) { var b = e.target.closest('[data-overlay]'); if (!b) return; ui.overlay = b.getAttribute('data-overlay'); syncSeg('[data-overlay]', ui.overlay, 'overlay'); if (latest) renderPdAll(latest); });
    $('registerSeg').addEventListener('click', function (e) { var b = e.target.closest('[data-register]'); if (!b) return; ui.register = b.getAttribute('data-register'); cmd({ action: 'set_register', value: ui.register }); });
    $('unitsSeg').addEventListener('click', function (e) { var b = e.target.closest('[data-units]'); if (!b) return; applyUnitsMode(b.getAttribute('data-units')); });
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
    // --- Operator's Manual overlay ---
    $('manualBtn').addEventListener('click', openManual);
    $('manualClose').addEventListener('click', closeManual);
    $('manualOverlay').addEventListener('click', function (e) { if (e.target === $('manualOverlay')) closeManual(); });
    $('manualNav').addEventListener('click', function (e) { var b = e.target.closest('[data-msec]'); if (!b) return; ui.manualSection = b.getAttribute('data-msec'); renderManual(); });
    $('manualContent').addEventListener('click', function (e) { var b = e.target.closest('[data-follow]'); if (!b) return; followProcedure(b.getAttribute('data-follow')); });
    document.querySelector('.instr-nav').addEventListener('click', function (e) { var b = e.target.closest('[data-fnav]'); if (!b) return; followNav(b.getAttribute('data-fnav')); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('manualOverlay').hidden) closeManual(); });
    document.body.addEventListener('mouseover', function (e) {
      var el = e.target.closest('[data-scanner-hint]'); if (!el) return;
      var hint = el.getAttribute('data-scanner-hint'), dash = hint.indexOf(' — ');
      $('scanner').innerHTML = dash > -1 ? '<strong>' + hint.slice(0, dash) + '</strong>' + hint.slice(dash) : hint;
    });
  }
  function syncSeg(sel, val, attr) { document.querySelectorAll(sel).forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-' + attr) === val); }); }
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
    ui.series = Object.assign({}, prof().defaultSeries);
    service.stop(); $('playBtn').textContent = '▶'; $('playBtn').classList.add('paused');
    service.handleCommand({ action: 'reset', plant_id: e.plant, initial_state: e.init, design_version: e.dv });
    rebuildPlantUI();
  }

  function rebuildPlantUI() {
    chartBuf = []; smoothed = {};
    buildGauges(); buildGraphParams(); buildInitStates(); buildFailures();
    buildPlantDisplay();
    var ps = $('pdScram'); if (ps && !ps.classList.contains('fired') && !ps.classList.contains('armed')) ps.textContent = prof().scramShort;
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

  // PWR primary-loop schematic (from pwr_primary_loop_diagram_v2.html) — its own
  // slider sim is dropped; sensor tspans + visuals are driven from the snapshot
  // by renderDiagram(). Wrapped in .pd-diagram so its CSS vars stay scoped.
  var PWR_DIAGRAM_SVG =
    '<div class="pd-diagram"><svg class="loop" id="loop" viewBox="40 108 821 360" preserveAspectRatio="xMidYMid meet">' +
      '<path class="pipe-case" d="M250,300 H670"/>' +
      '<path class="pipe-case thin" d="M430,300 V257"/>' +
      '<path class="pipe-case" d="M670,405 H250"/>' +
      '<path class="pipe-case" d="M250,300 H205"/>' +
      '<path class="pipe-case" d="M250,405 H205"/>' +
      '<path class="pipe-case" d="M180,405 V315" stroke-width="7"/>' +
      '<path class="flow" d="M180,405 V315" stroke="url(#gradCore)"/>' +
      '<path class="flow" d="M205,300 H670" stroke="var(--warm)"/>' +
      '<path class="flow" d="M430,300 V259" stroke="var(--warm)" style="animation-duration:3.4s;opacity:.5;"/>' +
      '<path class="flow" d="M670,405 H205" stroke="var(--cool)"/>' +
      '<defs>' +
        '<linearGradient id="gradCore" x1="0" y1="405" x2="0" y2="315" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#6a9dc0"/><stop offset="1" stop-color="#c98a5a"/></linearGradient>' +
        '<linearGradient id="gradTube" x1="0" y1="300" x2="0" y2="405" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#c98a5a" class="tubeWarmStop"/><stop offset="0.55" stop-color="#7a7a78"/><stop offset="1" stop-color="#6a9dc0"/></linearGradient>' +
        '<clipPath id="pzrClip"><rect x="402" y="161" width="56" height="94" rx="8"/></clipPath>' +
        '<clipPath id="sgClip"><rect x="672" y="172" width="116" height="261" rx="14"/></clipPath>' +
      '</defs>' +
      '<rect class="vessel" x="128" y="250" width="104" height="205" rx="24"/>' +
      '<rect class="vessel-inner" x="150" y="305" width="60" height="130" rx="3"/>' +
      '<line class="fuel" x1="160" y1="312" x2="160" y2="430"/><line class="fuel" x1="170" y1="312" x2="170" y2="430"/><line class="fuel" x1="180" y1="312" x2="180" y2="430"/><line class="fuel" x1="190" y1="312" x2="190" y2="430"/><line class="fuel" x1="200" y1="312" x2="200" y2="430"/>' +
      '<text class="comp-label" x="180" y="282" text-anchor="middle">Reactor</text>' +
      '<text class="comp-sub" x="180" y="293" text-anchor="middle">RPV / Core</text>' +
      '<rect x="112" y="360" width="9" height="40" rx="2" fill="#10171f" stroke="#3a5870" stroke-width=".8"/>' +
      '<rect class="rod-track" x="172" y="170" width="16" height="84" rx="3"/>' +
      '<rect id="rodFill" class="rod-fill" x="174" y="176" width="12" height="40" rx="2"/>' +
      '<rect id="rodCap" class="rod-cap" x="172" y="170" width="16" height="6" rx="2"/>' +
      '<text class="comp-sub" x="180" y="164" text-anchor="middle" style="fill:#5a7488;">rods</text>' +
      '<rect class="vessel" x="400" y="159" width="60" height="98" rx="10"/>' +
      '<g clip-path="url(#pzrClip)"><rect class="steam-space" x="402" y="161" width="56" height="94"/><rect class="water" id="pzrWater" x="402" y="205" width="56" height="50"/><path class="surface" id="pzrSurface" d="M402,205 H458"/></g>' +
      '<text class="comp-label" x="430" y="211" text-anchor="middle" style="fill:#5a7488;">PZR</text>' +
      '<path class="pipe-case thin" d="M430,159 V137" stroke-width="5"/>' +
      '<polygon class="valve" points="423,147 437,147 430,155"/><polygon class="valve" points="423,141 437,141 430,135"/><circle cx="430" cy="133" r="3" class="valve"/>' +
      '<rect class="vessel" x="670" y="170" width="120" height="265" rx="16"/>' +
      '<g clip-path="url(#sgClip)"><rect class="steam-space" x="672" y="172" width="116" height="261"/><rect class="water" id="sgWater" x="672" y="250" width="116" height="183"/><path class="surface" id="sgSurface" d="M672,250 H788"/></g>' +
      '<text class="comp-label" x="730" y="200" text-anchor="middle">Steam Gen</text>' +
      '<text class="comp-sub" x="730" y="211" text-anchor="middle">U-tube · heat exchanger</text>' +
      '<g id="tubeBundle"></g>' +
      '<path class="sec-arrow" d="M730,170 V140"/><polygon points="726,146 734,146 730,138" fill="#46586a"/><text class="sec-label" x="730" y="132" text-anchor="middle">steam → turbine</text>' +
      '<path class="sec-arrow" d="M824,360 H792"/><polygon points="798,356 798,364 790,360" fill="#46586a"/><text class="sec-label" x="828" y="363" text-anchor="start">feed</text>' +
      '<circle class="pump-body" cx="440" cy="405" r="18"/>' +
      '<g id="pumpRotor"><line class="pump-vane" x1="440" y1="405" x2="440" y2="390"/><line class="pump-vane" x1="440" y1="405" x2="453" y2="413"/><line class="pump-vane" x1="440" y1="405" x2="427" y2="413"/></g>' +
      '<circle cx="440" cy="405" r="3" fill="#3a5870"/><text class="comp-sub" x="440" y="436" text-anchor="middle" style="fill:#5a7488;">RCP</text>' +
      '<g class="sensors">' +
        '<g class="sensor"><circle class="tap" cx="116" cy="380" r="2.4"/><path class="leader" d="M102,236 V380 H116"/><rect class="lbl-box" x="56" y="206" width="92" height="30" rx="4"/><text class="lbl-name" x="63" y="217">Reactor Power</text><text class="lbl-val" x="63" y="231"><tspan id="vPower">100.1</tspan><tspan class="lbl-unit"> %</tspan></text></g>' +
        '<g class="sensor"><rect class="lbl-box" x="56" y="150" width="92" height="42" rx="4"/><text class="lbl-name" x="63" y="161">Rod Position</text><text class="lbl-val" x="63" y="175"><tspan id="vRod">8</tspan><tspan class="lbl-unit"> % ins</tspan></text><text class="lbl-note" x="63" y="186">withdrawn = power up</text></g>' +
        '<g class="sensor"><circle class="tap" cx="232" cy="345" r="2.4"/><path class="leader" d="M232,345 V378 H246"/><rect class="lbl-box" x="246" y="364" width="112" height="30" rx="4"/><text class="lbl-name" x="253" y="375">Subcooling</text><text class="lbl-val derived" x="253" y="389"><tspan id="vSub">74</tspan><tspan class="lbl-unit" id="uSub"> °F</tspan></text><text class="lbl-note" x="300" y="389">computed</text></g>' +
        '<g class="sensor tmi"><circle class="tap" cx="160" cy="345" r="2.4"/><path class="leader" d="M160,345 H246 V332"/><rect class="lbl-box" x="246" y="320" width="112" height="40" rx="4"/><text class="lbl-name" x="253" y="331">Core Inventory</text><text class="lbl-val" x="253" y="345"><tspan id="vInv">full</tspan></text><text class="lbl-note" x="253" y="356">reads at vessel — not PZR</text></g>' +
        '<g class="sensor"><line class="tap-tick" x1="394" y1="195" x2="406" y2="195"/><circle class="tap" cx="400" cy="195" r="2.4"/><path class="leader" d="M400,195 V160 H366"/><rect class="lbl-box" x="274" y="145" width="92" height="30" rx="4"/><text class="lbl-name" x="281" y="156">Primary Press</text><text class="lbl-val" x="281" y="170"><tspan id="vPress">2235</tspan><tspan class="lbl-unit" id="uPress"> psi</tspan></text></g>' +
        '<g class="sensor"><line class="tap-tick" x1="394" y1="229" x2="406" y2="229"/><circle class="tap" cx="400" cy="229" r="2.4"/><path class="leader" d="M400,229 H352 V210"/><rect class="lbl-box" x="274" y="195" width="78" height="30" rx="4"/><text class="lbl-name" x="281" y="206">PZR Level</text><text class="lbl-val" x="281" y="220"><tspan id="vPzr">55</tspan><tspan class="lbl-unit"> %</tspan></text></g>' +
        '<g class="sensor"><circle class="tap" cx="430" cy="133" r="2.4"/><path class="leader" d="M430,133 H486"/><rect class="lbl-box" x="486" y="118" width="96" height="30" rx="4"/><text class="lbl-name" x="493" y="129">PORV / Block</text><text class="lbl-val" x="493" y="143"><tspan id="vPorv">closed</tspan></text></g>' +
        '<g class="sensor"><line class="tap-tick" x1="540" y1="294" x2="540" y2="306"/><circle class="tap" cx="540" cy="300" r="2.4"/><path class="leader" d="M540,300 V325 H516"/><rect class="lbl-box" x="424" y="320" width="92" height="30" rx="4"/><text class="lbl-name" x="431" y="331">T-hot · hot leg</text><text class="lbl-val" x="431" y="345"><tspan id="vThot">609</tspan><tspan class="lbl-unit" id="uThot"> °F</tspan></text></g>' +
        '<g class="sensor"><line class="tap-tick" x1="540" y1="399" x2="540" y2="411"/><circle class="tap" cx="540" cy="405" r="2.4"/><path class="leader" d="M540,405 V443 H500"/><rect class="lbl-box" x="500" y="428" width="96" height="30" rx="4"/><text class="lbl-name" x="507" y="439">T-cold · cold leg</text><text class="lbl-val" x="507" y="453"><tspan id="vTcold">549</tspan><tspan class="lbl-unit" id="uTcold"> °F</tspan></text></g>' +
        '<g class="sensor"><line class="tap-tick" x1="664" y1="250" x2="676" y2="250"/><circle class="tap" cx="670" cy="250" r="2.4"/><path class="leader" d="M670,250 H626 V236"/><rect class="lbl-box" x="572" y="236" width="78" height="30" rx="4"/><text class="lbl-name" x="579" y="247">SG Level</text><text class="lbl-val" x="579" y="261"><tspan id="vSg">65</tspan><tspan class="lbl-unit"> %</tspan></text></g>' +
        '<g class="sensor"><circle class="tap" cx="440" cy="423" r="2.4"/><path class="leader" d="M440,423 V443 H392"/><rect class="lbl-box" x="300" y="428" width="92" height="30" rx="4"/><text class="lbl-name" x="307" y="439">RCP Flow</text><text class="lbl-val" x="307" y="453"><tspan id="vFlow">100</tspan><tspan class="lbl-unit"> %</tspan></text></g>' +
      '</g>' +
    '</svg></div>';

  // Build the SG tube bundle (vertical heat-exchanger tubes) into #tubeBundle once.
  function buildDiagramBundle() {
    var bundle = document.getElementById('tubeBundle'); if (!bundle || bundle.childNodes.length) return;
    var ns = 'http://www.w3.org/2000/svg', top = 300, bot = 405, xL = 690, xR = 752, xs = [];
    for (var x = xL; x <= xR; x += 10.3) xs.push(Math.round(x));
    function add(cls, d, stroke, sw, dash, op) {
      var p = document.createElementNS(ns, 'path');
      if (cls) p.setAttribute('class', cls); p.setAttribute('fill', 'none');
      p.setAttribute('stroke', stroke); p.setAttribute('stroke-width', sw); p.setAttribute('stroke-linecap', 'round');
      if (dash) p.setAttribute('stroke-dasharray', dash); if (op != null) p.setAttribute('opacity', op);
      p.setAttribute('d', d); bundle.appendChild(p);
    }
    xs.forEach(function (x) { add('', 'M' + x + ',' + top + ' V' + bot, '#243140', '3.2'); });
    add('', 'M670,300 H' + xR, '#2a3744', '4'); add('flow', 'M670,300 H' + xR, 'var(--warm)', '4', null, '0.45');
    add('', 'M670,' + bot + ' H' + xR, '#2a3744', '4'); add('flow', 'M' + xR + ',' + bot + ' H670', 'var(--cool)', '4', null, '0.45');
    xs.forEach(function (x) { add('tube-flow', 'M' + x + ',' + top + ' V' + bot, 'url(#gradTube)', '3', '4 8'); });
  }

  // Drive the diagram's sensor readouts + visuals from the snapshot.
  function renderDiagram(s) {
    var ins = s.instruments, t = s.true_state, cs = s.control_state;
    var cg = cs.rod_groups.filter(function (g) { return g.function === 'control'; })[0];
    var rodIns = cg ? Math.max(0, Math.min(100, 100 - cg.position_pct)) : 0;
    var flow = (t.pump_flow_pct || 0) / 100;
    function tx(id, v) { var e = document.getElementById(id); if (e) e.textContent = v; }
    tx('vPower', ins.power_range.toFixed(1));
    tx('vRod', Math.round(rodIns));
    tx('vSub', Math.max(0, Math.round(conv(ins.subcooling_margin, 'tempdiff')))); tx('uSub', ' ' + unit('tempdiff'));
    tx('vInv', flow < 0.04 ? 'static' : (t.core_inventory_pct >= 99 ? 'full' : Math.round(t.core_inventory_pct) + '%'));
    tx('vPress', Math.round(conv(ins.primary_pressure, 'pressure'))); tx('uPress', ' ' + unit('pressure'));
    tx('vPzr', Math.round(ins.pzr_level));
    tx('vPorv', ins.porv_indicator === 'open' ? 'OPEN' : (cs.porv_block_open ? 'closed' : 'isolated'));
    tx('vThot', Math.round(conv(ins.thot, 'temp'))); tx('uThot', ' ' + unit('temp'));
    tx('vTcold', Math.round(conv(ins.tcold, 'temp'))); tx('uTcold', ' ' + unit('temp'));
    tx('vSg', Math.round(ins.sg_level));
    tx('vFlow', Math.round(flow * 100));
    // animation speed / stopped from flow
    var loop = document.getElementById('loop'); if (!loop) return;
    if (flow < 0.04) loop.classList.add('stopped');
    else { loop.classList.remove('stopped'); setVarQ(loop, '--flow-dur', durS(1.05 / flow, 0.35, 7)); setVarQ(loop, '--spin-dur', durS(0.7 / flow, 0.25, 4)); }
    // warm tint by hot-leg temp (in °F)
    var thotF = ins.thot * 9 / 5 + 32, warmAmt = Math.min(1, Math.max(0, (thotF - 549) / 160));
    var warmCol = 'rgb(' + Math.round(180 + warmAmt * 55) + ',' + Math.round(135 - warmAmt * 35) + ',' + Math.round(88 - warmAmt * 18) + ')';
    var dwrap = document.querySelector('[data-pdview="primary"] .pd-diagram'); if (dwrap) dwrap.style.setProperty('--warm', warmCol);
    document.querySelectorAll('[data-pdview="primary"] .tubeWarmStop').forEach(function (st) { st.setAttribute('stop-color', warmCol); });
    // rod fill, PZR + SG water levels
    var rf = document.getElementById('rodFill'); if (rf) rf.setAttribute('height', (12 + rodIns / 100 * 72).toFixed(1));
    var pzr = Math.max(0, Math.min(1, ins.pzr_level / 100)), pB = 255, pH = 94, wy = pB - pzr * pH;
    setA('pzrWater', 'y', wy.toFixed(1)); setA('pzrWater', 'height', (pB - wy).toFixed(1)); setA('pzrSurface', 'd', 'M402,' + wy.toFixed(1) + ' q14,-2 28,0 t28,0');
    var sg = Math.max(0, Math.min(1, ins.sg_level / 100)), sB = 433, sH = 261, sy = sB - sg * sH;
    setA('sgWater', 'y', sy.toFixed(1)); setA('sgWater', 'height', (sB - sy).toFixed(1)); setA('sgSurface', 'd', 'M672,' + sy.toFixed(1) + ' q29,-2 58,0 t58,0');
  }
  function setA(id, a, v) { var e = document.getElementById(id); if (e) e.setAttribute(a, v); }

  // PWR secondary-loop schematic (from pwr_secondary_loop_diagram_v2.html). IDs are
  // prefixed `sec`/`sv` so they don't collide with the primary diagram (both cards
  // live in the DOM at once). Wired by renderSecDiagram().
  var PWR_SEC_DIAGRAM_SVG =
    '<div class="pd-diagram"><svg class="loop" id="secLoop" viewBox="40 40 1018 449" preserveAspectRatio="xMidYMid meet">' +
      '<path class="pipe-case" d="M210,150 V120 H700"/>' +
      '<path class="pipe-case" d="M820,200 V250"/>' +
      '<path class="pipe-case" d="M820,422 V450 H560"/>' +
      '<path class="pipe-case thin" d="M560,450 V330 H250"/>' +
      '<path class="flow steam-dash" d="M210,150 V120 H700" stroke="var(--steam)"/>' +
      '<path class="flow steam-dash" d="M820,200 V250" stroke="var(--wet)"/>' +
      '<path class="flow" d="M820,422 V450 H560" stroke="var(--cond)"/>' +
      '<path class="flow" d="M560,450 V330 H250" stroke="var(--cond)"/>' +
      '<defs>' +
        '<clipPath id="secSgClip"><rect x="132" y="152" width="116" height="261" rx="14"/></clipPath>' +
        '<clipPath id="secCondClip"><rect x="702" y="252" width="236" height="170" rx="10"/></clipPath>' +
        '<clipPath id="secTurbClip"><path d="M700,108 L820,92 L820,200 L700,184 Z"/></clipPath>' +
        '<linearGradient id="secGradCondTube" x1="0" y1="298" x2="0" y2="382" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#84a2b2"/><stop offset="0.6" stop-color="#6a8a9a"/><stop offset="1" stop-color="#5e92ac"/></linearGradient>' +
      '</defs>' +
      '<rect class="vessel" x="130" y="150" width="120" height="265" rx="16"/>' +
      '<g clip-path="url(#secSgClip)"><rect class="steam-space" x="132" y="152" width="116" height="261"/><rect class="water" id="secSgWater" x="132" y="250" width="116" height="163"/><path class="surface" id="secSgSurface" d="M132,250 H248"/>' +
        '<line x1="160" y1="285" x2="160" y2="400" stroke="#2a3744" stroke-width="2" stroke-dasharray="3 6"/><line x1="176" y1="285" x2="176" y2="400" stroke="#2a3744" stroke-width="2" stroke-dasharray="3 6"/><line x1="192" y1="285" x2="192" y2="400" stroke="#2a3744" stroke-width="2" stroke-dasharray="3 6"/><line x1="208" y1="285" x2="208" y2="400" stroke="#2a3744" stroke-width="2" stroke-dasharray="3 6"/><line x1="224" y1="285" x2="224" y2="400" stroke="#2a3744" stroke-width="2" stroke-dasharray="3 6"/></g>' +
      '<text class="comp-label" x="190" y="200" text-anchor="middle">Steam Gen</text><text class="comp-sub" x="190" y="211" text-anchor="middle">secondary side</text>' +
      '<path class="pipe-case thin" d="M130,350 H100" stroke="#2a3744"/><text class="sec-label" x="94" y="353" text-anchor="end" style="fill:#52687c;">↤ primary</text>' +
      '<path class="vessel" d="M700,108 L820,92 L820,200 L700,184 Z"/>' +
      '<line x1="700" y1="146" x2="820" y2="146" stroke="#3a5870" stroke-width="1.4"/><g id="secTurbineRotor" clip-path="url(#secTurbClip)"></g>' +
      '<text class="comp-label" x="760" y="86" text-anchor="middle">Turbine</text>' +
      '<circle class="vessel" cx="868" cy="146" r="22"/><text class="comp-sub" x="868" y="150" text-anchor="middle" style="fill:#52687c;">GEN</text>' +
      '<line class="pipe-case thin" x1="820" y1="146" x2="846" y2="146"/><path class="sec-arrow" d="M890,146 H924"/><polygon points="918,142 918,150 926,146" fill="#46586a"/><text class="sec-label" x="930" y="149" text-anchor="start">grid</text>' +
      '<rect class="vessel" x="700" y="250" width="240" height="172" rx="12"/>' +
      '<g clip-path="url(#secCondClip)"><rect class="steam-space" x="702" y="252" width="236" height="170"/><rect class="water" id="secCondWater" x="702" y="386" width="236" height="36"/><path class="surface" id="secCondSurface" d="M702,386 H938"/><g id="secCondTubes"></g></g>' +
      '<text class="comp-label" x="820" y="272" text-anchor="middle">Condenser</text><text class="comp-sub" x="820" y="283" text-anchor="middle">heat exchanger</text>' +
      '<path class="sec-arrow" d="M700,408 H668"/><polygon points="674,404 674,412 666,408" fill="#46586a"/><text class="sec-label" x="662" y="411" text-anchor="end">CW out</text>' +
      '<path class="sec-arrow" d="M972,408 H940"/><polygon points="946,404 946,412 938,408" fill="#46586a"/><text class="sec-label" x="978" y="411" text-anchor="start">CW in</text>' +
      '<circle class="pump-body" cx="700" cy="450" r="16"/><g id="secCondPump"><line class="pump-vane" x1="700" y1="450" x2="700" y2="437"/><line class="pump-vane" x1="700" y1="450" x2="711" y2="457"/><line class="pump-vane" x1="700" y1="450" x2="689" y2="457"/></g><circle cx="700" cy="450" r="2.6" fill="#3a5870"/><text class="comp-sub" x="700" y="476" text-anchor="middle" style="fill:#52687c;">Cond Pump</text>' +
      '<rect class="vessel" x="392" y="318" width="40" height="24" rx="6"/><text class="comp-sub" x="412" y="334" text-anchor="middle" style="fill:#52687c;">FW Htr</text>' +
      '<circle class="pump-body" cx="320" cy="330" r="15"/><g id="secFeedPump"><line class="pump-vane" x1="320" y1="330" x2="320" y2="318"/><line class="pump-vane" x1="320" y1="330" x2="331" y2="337"/><line class="pump-vane" x1="320" y1="330" x2="309" y2="337"/></g><circle cx="320" cy="330" r="2.6" fill="#3a5870"/><text class="comp-sub" x="320" y="358" text-anchor="middle" style="fill:#52687c;">Feed Pump</text>' +
      '<g class="sensors">' +
        '<g class="sensor"><line class="tap-tick" x1="430" y1="114" x2="430" y2="126"/><circle class="tap" cx="430" cy="120" r="2.4"/><path class="leader" d="M430,120 V80"/><rect class="lbl-box" x="386" y="50" width="88" height="30" rx="4"/><text class="lbl-name" x="393" y="61">Steam Flow</text><text class="lbl-val" x="393" y="75"><tspan id="svSteam">100</tspan><tspan class="lbl-unit"> %</tspan></text></g>' +
        '<g class="sensor"><line class="tap-tick" x1="244" y1="190" x2="256" y2="190"/><circle class="tap" cx="250" cy="190" r="2.4"/><path class="leader" d="M250,190 H294"/><rect class="lbl-box" x="294" y="175" width="92" height="30" rx="4"/><text class="lbl-name" x="301" y="186">Steam Press</text><text class="lbl-val" x="301" y="200"><tspan id="svSteamP">850</tspan><tspan class="lbl-unit" id="svUSteamP"> psi</tspan></text></g>' +
        '<g class="sensor"><line class="tap-tick" x1="244" y1="290" x2="256" y2="290"/><circle class="tap" cx="250" cy="290" r="2.4"/><path class="leader" d="M250,290 H300"/><rect class="lbl-box" x="300" y="276" width="78" height="30" rx="4"/><text class="lbl-name" x="307" y="287">SG Level</text><text class="lbl-val" x="307" y="301"><tspan id="svSg">65</tspan><tspan class="lbl-unit"> %</tspan></text></g>' +
        '<g class="sensor"><circle class="tap" cx="760" cy="146" r="2.4"/><path class="leader" d="M760,146 V80 H810"/><rect class="lbl-box" x="802" y="50" width="86" height="30" rx="4"/><text class="lbl-name" x="809" y="61">Turbine RPM</text><text class="lbl-val" x="809" y="75"><tspan id="svRpm">1800</tspan></text></g>' +
        '<g class="sensor"><circle class="tap" cx="868" cy="168" r="2.4"/><path class="leader" d="M868,168 V202 H928"/><rect class="lbl-box" x="920" y="188" width="84" height="30" rx="4"/><text class="lbl-name" x="927" y="199">Output</text><text class="lbl-val" x="927" y="213"><tspan id="svMw">1000</tspan><tspan class="lbl-unit"> MW</tspan></text></g>' +
        '<g class="sensor"><line class="tap-tick" x1="820" y1="256" x2="820" y2="268"/><circle class="tap" cx="820" cy="262" r="2.4"/><path class="leader" d="M820,262 V232 H952"/><rect class="lbl-box" x="944" y="240" width="98" height="30" rx="4"/><text class="lbl-name" x="951" y="251">Cond. Vacuum</text><text class="lbl-val" x="951" y="265"><tspan id="svVac">28.5</tspan><tspan class="lbl-unit" id="svUVac"> inHg</tspan></text></g>' +
        '<g class="sensor"><line class="tap-tick" x1="820" y1="404" x2="820" y2="416"/><circle class="tap" cx="820" cy="404" r="2.4"/><path class="leader" d="M820,404 V440 H952"/><rect class="lbl-box" x="944" y="440" width="96" height="30" rx="4"/><text class="lbl-name" x="951" y="451">Hotwell Temp</text><text class="lbl-val" x="951" y="465"><tspan id="svHot">102</tspan><tspan class="lbl-unit" id="svUHot"> °F</tspan></text></g>' +
        '<g class="sensor"><line class="tap-tick" x1="480" y1="324" x2="480" y2="336"/><circle class="tap" cx="480" cy="330" r="2.4"/><path class="leader" d="M480,330 V300 H440"/><rect class="lbl-box" x="394" y="276" width="98" height="30" rx="4"/><text class="lbl-name" x="401" y="287">Feedwater Flow</text><text class="lbl-val" x="401" y="301"><tspan id="svFeed">100</tspan><tspan class="lbl-unit"> %</tspan></text></g>' +
      '</g>' +
    '</svg></div>';

  function buildSecDiagramExtras() {
    var ns = 'http://www.w3.org/2000/svg';
    var tubes = document.getElementById('secCondTubes');
    if (tubes && !tubes.childNodes.length) {
      for (var x = 724; x <= 916; x += 24) {
        var t = document.createElementNS(ns, 'path'); t.setAttribute('class', 'tube-flow');
        t.setAttribute('d', 'M' + x + ',298 V382'); t.setAttribute('stroke', 'url(#secGradCondTube)'); t.setAttribute('stroke-dasharray', '3 7');
        tubes.appendChild(t);
      }
    }
    var rotor = document.getElementById('secTurbineRotor');
    if (rotor && !rotor.childNodes.length) {
      for (var bx = 684; bx <= 840; bx += 15) {
        var ln = document.createElementNS(ns, 'line'); ln.setAttribute('class', 'turbine-blade');
        var tt = Math.max(0, Math.min(1, (bx - 700) / 120)), half = 18 + tt * 22;
        ln.setAttribute('x1', bx); ln.setAttribute('y1', (146 - half).toFixed(0)); ln.setAttribute('x2', bx); ln.setAttribute('y2', (146 + half).toFixed(0));
        rotor.appendChild(ln);
      }
    }
  }

  function renderSecDiagram(s) {
    var ins = s.instruments, t = s.true_state;
    var load = Math.max(0, ins.steam_flow || 0);   // turbine steam flow (normalized)
    function tx(id, v) { var e = document.getElementById(id); if (e) e.textContent = v; }
    tx('svSteam', Math.round(load * 100));
    tx('svSteamP', Math.round(conv(t.steam_pressure_mpa, 'pressure'))); tx('svUSteamP', ' ' + unit('pressure'));
    tx('svSg', Math.round(ins.sg_level));
    tx('svRpm', Math.round(ins.turbine_rpm));
    tx('svMw', Math.round(ins.mwe_output));
    tx('svVac', conv(ins.condenser_vacuum, 'vacuum').toFixed(1)); tx('svUVac', ' ' + unit('vacuum'));
    var vacFrac = Math.max(0, Math.min(1, ins.condenser_vacuum / 96.5));
    var hotC = ((80 + (1 - vacFrac) * 60) - 32) * 5 / 9;   // derived hotwell temp
    tx('svHot', Math.round(conv(hotC, 'temp'))); tx('svUHot', ' ' + unit('temp'));
    tx('svFeed', Math.round((ins.fw_flow || 0) * 100));
    var loop = document.getElementById('secLoop'); if (!loop) return;
    if (load < 0.04) loop.classList.add('stopped');
    else {
      loop.classList.remove('stopped');
      setVarQ(loop, '--flow-dur', durS(1.05 / load, 0.35, 7));
      setVarQ(loop, '--spin-dur', durS(0.6 / load, 0.2, 4));
      setVarQ(loop, '--blade-dur', durS(0.32 / load, 0.12, 2));
    }
    var sg = Math.max(0, Math.min(1, ins.sg_level / 100)), sB = 413, sH = 261, sy = sB - sg * sH;
    setA('secSgWater', 'y', sy.toFixed(1)); setA('secSgWater', 'height', (sB - sy).toFixed(1)); setA('secSgSurface', 'd', 'M132,' + sy.toFixed(1) + ' q29,-2 58,0 t58,0');
  }

  function durS(x, lo, hi) { return Math.max(lo, Math.min(hi, x)).toFixed(2) + 's'; }
  // Set a CSS custom property only when it actually changes. Re-setting an
  // animation-duration var every broadcast restarts the keyframe clock and makes
  // the flow dashes stutter; guarding the write keeps steady-state animations smooth.
  function setVarQ(el, name, val) {
    if (!el._vq) el._vq = {};
    if (el._vq[name] === val) return;
    el._vq[name] = val; el.style.setProperty(name, val);
  }

  // PWR full-plant schematic (from pwr_full_plant_diagram_v2.html) for the Diagram
  // view. Ids prefixed `fp`/`fv` (a third diagram alongside primary/secondary).
  var PWR_FULL_DIAGRAM_SVG =
    '<div class="pd-diagram"><svg class="loop" id="fpLoop" viewBox="40 92 1160 394" preserveAspectRatio="xMidYMid meet">' +
      '<line class="boundary" x1="600" y1="110" x2="600" y2="418"/>' +
      '<path class="pipe-case" d="M250,250 H540"/><path class="pipe-case thin" d="M400,250 V207"/><path class="pipe-case" d="M540,355 H205"/><path class="pipe-case" d="M250,250 H205"/><path class="pipe-case" d="M250,355 H205"/><path class="pipe-case" d="M180,345 V270" stroke-width="6"/>' +
      '<path class="flow pri" d="M180,345 V270" stroke="url(#fpGradCore)"/><path class="flow pri" d="M205,250 H540" stroke="var(--warm)"/><path class="flow pri" d="M400,250 V211" stroke="var(--warm)" style="animation-duration:3.4s;opacity:.5;"/><path class="flow pri" d="M540,355 H205" stroke="var(--cool)"/>' +
      '<path class="pipe-case" d="M600,170 V140 H840 V220"/><path class="pipe-case" d="M960,250 V290"/><path class="pipe-case" d="M960,420 V450 H720"/><path class="pipe-case thin" d="M720,450 V320 H600"/>' +
      '<path class="flow sec steam-dash" d="M600,170 V140 H840 V220" stroke="var(--steam)"/><path class="flow sec steam-dash" d="M960,250 V290" stroke="var(--wet)"/><path class="flow sec" d="M960,420 V450 H720" stroke="var(--cond)"/><path class="flow sec" d="M720,450 V320 H600" stroke="var(--cond)"/>' +
      '<defs>' +
        '<linearGradient id="fpGradCore" x1="0" y1="345" x2="0" y2="270" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#6a9dc0"/><stop offset="1" stop-color="#c98a5a"/></linearGradient>' +
        '<linearGradient id="fpGradTube" x1="0" y1="250" x2="0" y2="355" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#c98a5a" class="tubeWarmStop"/><stop offset="0.55" stop-color="#7a7a78"/><stop offset="1" stop-color="#6a9dc0"/></linearGradient>' +
        '<linearGradient id="fpGradCondTube" x1="0" y1="312" x2="0" y2="392" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#84a2b2"/><stop offset="0.6" stop-color="#6a8a9a"/><stop offset="1" stop-color="#5e92ac"/></linearGradient>' +
        '<clipPath id="fpPzrClip"><rect x="372" y="142" width="56" height="66" rx="6"/></clipPath><clipPath id="fpSgClip"><rect x="542" y="172" width="116" height="218" rx="14"/></clipPath><clipPath id="fpCondClip"><rect x="842" y="292" width="236" height="130" rx="10"/></clipPath><clipPath id="fpTurbClip"><path d="M840,198 L960,184 L960,278 L840,264 Z"/></clipPath>' +
      '</defs>' +
      '<rect class="vessel" x="128" y="200" width="104" height="205" rx="24"/><rect class="vessel-inner" x="150" y="255" width="60" height="130" rx="3"/>' +
      '<line class="fuel" x1="160" y1="262" x2="160" y2="380"/><line class="fuel" x1="170" y1="262" x2="170" y2="380"/><line class="fuel" x1="180" y1="262" x2="180" y2="380"/><line class="fuel" x1="190" y1="262" x2="190" y2="380"/><line class="fuel" x1="200" y1="262" x2="200" y2="380"/>' +
      '<text class="comp-label" x="180" y="232" text-anchor="middle">Reactor</text><text class="comp-sub" x="180" y="243" text-anchor="middle">RPV / Core</text>' +
      '<rect x="112" y="290" width="9" height="40" rx="2" fill="#10171f" stroke="#3a5870" stroke-width=".7"/>' +
      '<rect class="rod-track" x="172" y="120" width="16" height="84" rx="3"/><rect id="fpRodFill" class="rod-fill" x="174" y="126" width="12" height="40" rx="2"/><rect id="fpRodCap" class="rod-cap" x="172" y="120" width="16" height="6" rx="2"/><text class="comp-sub" x="180" y="114" text-anchor="middle" style="fill:#5a7488;">rods</text>' +
      '<rect class="vessel" x="370" y="140" width="60" height="68" rx="8"/><g clip-path="url(#fpPzrClip)"><rect class="steam-space" x="372" y="142" width="56" height="66"/><rect class="water" id="fpPzrWater" x="372" y="178" width="56" height="30"/><path class="surface" id="fpPzrSurface" d="M372,178 H428"/></g>' +
      '<text class="comp-label" x="400" y="180" text-anchor="middle" style="fill:#5a7488;">PZR</text><path class="pipe-case thin" d="M400,140 V120" stroke-width="5"/><polygon class="valve" points="394,130 406,130 400,138"/><circle cx="400" cy="118" r="2.6" class="valve"/>' +
      '<rect class="vessel" x="540" y="170" width="120" height="222" rx="14"/><g clip-path="url(#fpSgClip)"><rect class="steam-space" x="542" y="172" width="116" height="218"/><rect class="water" id="fpSgWater" x="542" y="250" width="116" height="140"/><path class="surface" id="fpSgSurface" d="M542,250 H658"/></g>' +
      '<text class="comp-label" x="600" y="192" text-anchor="middle">Steam Gen</text><text class="comp-sub" x="600" y="430" text-anchor="middle">primary ⇄ secondary</text><g id="fpTubeBundle"></g>' +
      '<path class="vessel" d="M840,198 L960,184 L960,278 L840,264 Z"/><line x1="840" y1="236" x2="960" y2="236" stroke="#3a5870" stroke-width="1.4"/><g clip-path="url(#fpTurbClip)"><g id="fpTurbineRotor"></g></g>' +
      '<text class="comp-label" x="900" y="176" text-anchor="middle">Turbine</text><circle class="vessel" cx="1008" cy="252" r="20"/><text class="comp-sub" x="1008" y="255" text-anchor="middle" style="fill:#52687c;">GEN</text>' +
      '<line class="pipe-case thin" x1="960" y1="252" x2="988" y2="252"/><path class="sec-arrow" d="M1028,252 H1062"/><polygon points="1056,248 1056,256 1064,252" fill="#46586a"/><text class="sec-label" x="1068" y="255" text-anchor="start">grid</text>' +
      '<rect class="vessel" x="840" y="290" width="240" height="135" rx="12"/><g clip-path="url(#fpCondClip)"><rect class="steam-space" x="842" y="292" width="236" height="131"/><rect class="water" id="fpCondWater" x="842" y="396" width="236" height="27"/><path class="surface" id="fpCondSurface" d="M842,396 H1078"/><g id="fpCondTubes"></g></g>' +
      '<text class="comp-label" x="888" y="306" text-anchor="middle">Condenser</text><path class="sec-arrow" d="M840,410 H812"/><polygon points="818,406 818,414 810,410" fill="#46586a"/><text class="sec-label" x="806" y="413" text-anchor="end">CW</text>' +
      '<circle class="pump-body" cx="400" cy="355" r="17"/><g id="fpRcp"><line class="pump-vane" x1="400" y1="355" x2="400" y2="341"/><line class="pump-vane" x1="400" y1="355" x2="412" y2="362"/><line class="pump-vane" x1="400" y1="355" x2="388" y2="362"/></g><circle cx="400" cy="355" r="3" fill="#3a5870"/><text class="comp-sub" x="400" y="384" text-anchor="middle" style="fill:#5a7488;">RCP</text>' +
      '<circle class="pump-body" cx="840" cy="450" r="15"/><g id="fpCondPump"><line class="pump-vane" x1="840" y1="450" x2="840" y2="438"/><line class="pump-vane" x1="840" y1="450" x2="851" y2="456"/><line class="pump-vane" x1="840" y1="450" x2="829" y2="456"/></g><circle cx="840" cy="450" r="2.6" fill="#3a5870"/><text class="comp-sub" x="840" y="476" text-anchor="middle" style="fill:#52687c;">Cond Pump</text>' +
      '<circle class="pump-body" cx="720" cy="385" r="13"/><g id="fpFeedPump"><line class="pump-vane" x1="720" y1="385" x2="720" y2="375"/><line class="pump-vane" x1="720" y1="385" x2="729" y2="391"/><line class="pump-vane" x1="720" y1="385" x2="711" y2="391"/></g><circle cx="720" cy="385" r="2.4" fill="#3a5870"/><text class="comp-sub" x="720" y="408" text-anchor="middle" style="fill:#52687c;">Feed Pump</text>' +
      '<rect class="vessel" x="640" y="308" width="38" height="22" rx="5"/><text class="comp-sub" x="659" y="323" text-anchor="middle" style="fill:#52687c;">FW Htr</text>' +
      '<g class="sensors">' +
        '<g class="sensor"><rect class="lbl-box" x="56" y="108" width="92" height="38" rx="4"/><text class="lbl-name" x="63" y="119">Rod Position</text><text class="lbl-val" x="63" y="132"><tspan id="fvRod">8</tspan><tspan class="lbl-unit"> % ins</tspan></text><text class="lbl-note" x="63" y="142">withdrawn = power up</text></g>' +
        '<g class="sensor"><circle class="tap" cx="116" cy="310" r="2.2"/><path class="leader" d="M102,186 V310 H116"/><rect class="lbl-box" x="56" y="156" width="92" height="30" rx="4"/><text class="lbl-name" x="63" y="167">Reactor Power</text><text class="lbl-val" x="63" y="181"><tspan id="fvPower">100</tspan><tspan class="lbl-unit"> %</tspan></text></g>' +
        '<g class="sensor tmi"><circle class="tap" cx="160" cy="300" r="2.2"/><path class="leader" d="M160,300 V286 H246"/><rect class="lbl-box" x="246" y="272" width="108" height="36" rx="4"/><text class="lbl-name" x="253" y="283">Core Inventory</text><text class="lbl-val" x="253" y="296"><tspan id="fvInv">full</tspan></text><text class="lbl-note" x="253" y="305">reads at vessel — not PZR</text></g>' +
        '<g class="sensor"><circle class="tap" cx="232" cy="315" r="2.2"/><path class="leader" d="M232,315 V330 H246"/><rect class="lbl-box" x="246" y="315" width="108" height="28" rx="4"/><text class="lbl-name" x="253" y="325">Subcooling</text><text class="lbl-val derived" x="253" y="338"><tspan id="fvSub">74</tspan><tspan class="lbl-unit" id="fvUSub"> °F</tspan></text><text class="lbl-note" x="298" y="338">computed</text></g>' +
        '<g class="sensor"><line class="tap-tick" x1="364" y1="170" x2="376" y2="170"/><circle class="tap" cx="370" cy="170" r="2.2"/><path class="leader" d="M370,170 H336"/><rect class="lbl-box" x="244" y="155" width="92" height="30" rx="4"/><text class="lbl-name" x="251" y="166">Primary Press</text><text class="lbl-val" x="251" y="180"><tspan id="fvPress">2235</tspan><tspan class="lbl-unit" id="fvUPress"> psi</tspan></text></g>' +
        '<g class="sensor"><line class="tap-tick" x1="364" y1="195" x2="376" y2="195"/><circle class="tap" cx="370" cy="195" r="2.2"/><path class="leader" d="M370,195 H336"/><rect class="lbl-box" x="258" y="190" width="78" height="28" rx="4"/><text class="lbl-name" x="265" y="200">PZR Level</text><text class="lbl-val" x="265" y="213"><tspan id="fvPzr">55</tspan><tspan class="lbl-unit"> %</tspan></text></g>' +
        '<g class="sensor"><circle class="tap" cx="400" cy="118" r="2.2"/><path class="leader" d="M400,118 H456"/><rect class="lbl-box" x="456" y="104" width="92" height="28" rx="4"/><text class="lbl-name" x="463" y="114">PORV / Block</text><text class="lbl-val" x="463" y="127"><tspan id="fvPorv">closed</tspan></text></g>' +
        '<g class="sensor"><line class="tap-tick" x1="490" y1="244" x2="490" y2="256"/><circle class="tap" cx="490" cy="250" r="2.2"/><path class="leader" d="M490,250 V272 H452"/><rect class="lbl-box" x="406" y="272" width="92" height="28" rx="4"/><text class="lbl-name" x="413" y="282">T-hot · hot leg</text><text class="lbl-val" x="413" y="295"><tspan id="fvThot">609</tspan><tspan class="lbl-unit" id="fvUThot"> °F</tspan></text></g>' +
        '<g class="sensor"><line class="tap-tick" x1="490" y1="349" x2="490" y2="361"/><circle class="tap" cx="490" cy="355" r="2.2"/><path class="leader" d="M490,355 V378"/><rect class="lbl-box" x="436" y="378" width="96" height="28" rx="4"/><text class="lbl-name" x="443" y="388">T-cold · cold leg</text><text class="lbl-val" x="443" y="401"><tspan id="fvTcold">549</tspan><tspan class="lbl-unit" id="fvUTcold"> °F</tspan></text></g>' +
        '<g class="sensor"><circle class="tap" cx="400" cy="372" r="2.2"/><path class="leader" d="M400,372 V392 H352"/><rect class="lbl-box" x="300" y="378" width="92" height="28" rx="4"/><text class="lbl-name" x="307" y="388">RCP Flow</text><text class="lbl-val" x="307" y="401"><tspan id="fvFlow">100</tspan><tspan class="lbl-unit"> %</tspan></text></g>' +
        '<g class="sensor"><line class="tap-tick" x1="534" y1="250" x2="546" y2="250"/><circle class="tap" cx="540" cy="250" r="2.2"/><path class="leader" d="M540,250 H516 V228"/><rect class="lbl-box" x="438" y="200" width="78" height="28" rx="4"/><text class="lbl-name" x="445" y="210">SG Level</text><text class="lbl-val" x="445" y="223"><tspan id="fvSg">65</tspan><tspan class="lbl-unit"> %</tspan></text></g>' +
        '<g class="sensor"><line class="tap-tick" x1="720" y1="134" x2="720" y2="146"/><circle class="tap" cx="720" cy="140" r="2.2"/><path class="leader" d="M720,140 V128"/><rect class="lbl-box" x="676" y="100" width="88" height="28" rx="4"/><text class="lbl-name" x="683" y="110">Steam Flow</text><text class="lbl-val" x="683" y="123"><tspan id="fvSteam">100</tspan><tspan class="lbl-unit"> %</tspan></text></g>' +
        '<g class="sensor"><circle class="tap" cx="900" cy="236" r="2.2"/><path class="leader" d="M900,236 V150 H942"/><rect class="lbl-box" x="934" y="136" width="86" height="28" rx="4"/><text class="lbl-name" x="941" y="146">Turbine RPM</text><text class="lbl-val" x="941" y="159"><tspan id="fvRpm">1800</tspan></text></g>' +
        '<g class="sensor"><circle class="tap" cx="1008" cy="232" r="2.2"/><path class="leader" d="M1008,232 V218 H1068"/><rect class="lbl-box" x="1060" y="204" width="84" height="28" rx="4"/><text class="lbl-name" x="1067" y="214">Output</text><text class="lbl-val" x="1067" y="227"><tspan id="fvMw">1000</tspan><tspan class="lbl-unit"> MW</tspan></text></g>' +
        '<g class="sensor"><line class="tap-tick" x1="1040" y1="296" x2="1040" y2="308"/><circle class="tap" cx="1040" cy="302" r="2.2"/><path class="leader" d="M1040,302 V288 H1088"/><rect class="lbl-box" x="1088" y="274" width="96" height="28" rx="4"/><text class="lbl-name" x="1095" y="284">Cond. Vacuum</text><text class="lbl-val" x="1095" y="297"><tspan id="fvVac">28.5</tspan><tspan class="lbl-unit" id="fvUVac"> inHg</tspan></text></g>' +
        '<g class="sensor"><line class="tap-tick" x1="690" y1="320" x2="690" y2="332"/><circle class="tap" cx="690" cy="326" r="2.2"/><path class="leader" d="M690,326 V440 H680"/><rect class="lbl-box" x="580" y="440" width="100" height="28" rx="4"/><text class="lbl-name" x="587" y="450">Feedwater Flow</text><text class="lbl-val" x="587" y="463"><tspan id="fvFeed">100</tspan><tspan class="lbl-unit"> %</tspan></text></g>' +
      '</g>' +
    '</svg></div>';

  function buildFullDiagramExtras() {
    var ns = 'http://www.w3.org/2000/svg';
    var b = document.getElementById('fpTubeBundle');
    if (b && !b.childNodes.length) {
      var xs = []; for (var x = 560; x <= 640; x += 11.4) xs.push(Math.round(x));
      function add(p, cls, d, stroke, sw, dash, op) { var e = document.createElementNS(ns, 'path'); if (cls) e.setAttribute('class', cls); e.setAttribute('fill', 'none'); e.setAttribute('stroke', stroke); e.setAttribute('stroke-width', sw); e.setAttribute('stroke-linecap', 'round'); if (dash) e.setAttribute('stroke-dasharray', dash); if (op != null) e.setAttribute('opacity', op); e.setAttribute('d', d); p.appendChild(e); }
      xs.forEach(function (x) { add(b, '', 'M' + x + ',250 V355', '#243140', '2.8'); });
      add(b, '', 'M540,250 H640', '#2a3744', '4'); add(b, 'flow pri', 'M540,250 H640', 'var(--warm)', '4', null, '0.45');
      add(b, '', 'M640,355 H540', '#2a3744', '4'); add(b, 'flow pri', 'M640,355 H540', 'var(--cool)', '4', null, '0.45');
      xs.forEach(function (x) { add(b, 'tube-flow pri', 'M' + x + ',250 V355', 'url(#fpGradTube)', '2.8', '4 8'); });
    }
    var ct = document.getElementById('fpCondTubes');
    if (ct && !ct.childNodes.length) {
      for (var cx = 866; cx <= 1054; cx += 24) { var t = document.createElementNS(ns, 'path'); t.setAttribute('class', 'tube-flow sec'); t.setAttribute('d', 'M' + cx + ',312 V392'); t.setAttribute('stroke', 'url(#fpGradCondTube)'); t.setAttribute('stroke-dasharray', '3 7'); ct.appendChild(t); }
    }
    var rot = document.getElementById('fpTurbineRotor');
    if (rot && !rot.childNodes.length) {
      for (var bx = 824; bx <= 980; bx += 15) { var ln = document.createElementNS(ns, 'line'); ln.setAttribute('class', 'turbine-blade'); var tt = Math.max(0, Math.min(1, (bx - 840) / 120)), half = 16 + tt * 20; ln.setAttribute('x1', bx); ln.setAttribute('y1', (236 - half).toFixed(0)); ln.setAttribute('x2', bx); ln.setAttribute('y2', (236 + half).toFixed(0)); rot.appendChild(ln); }
    }
  }

  function renderFullDiagram(s) {
    var ins = s.instruments, t = s.true_state, cs = s.control_state;
    var cg = cs.rod_groups.filter(function (g) { return g.function === 'control'; })[0];
    var rodIns = cg ? Math.max(0, Math.min(100, 100 - cg.position_pct)) : 0;
    var flow = (t.pump_flow_pct || 0) / 100, load = Math.max(0, ins.steam_flow || 0);
    function tx(id, v) { var e = document.getElementById(id); if (e) e.textContent = v; }
    tx('fvPower', Math.round(ins.power_range)); tx('fvRod', Math.round(rodIns));
    tx('fvSub', Math.max(0, Math.round(conv(ins.subcooling_margin, 'tempdiff')))); tx('fvUSub', ' ' + unit('tempdiff'));
    tx('fvInv', flow < 0.04 ? 'static' : (t.core_inventory_pct >= 99 ? 'full' : Math.round(t.core_inventory_pct) + '%'));
    tx('fvPress', Math.round(conv(ins.primary_pressure, 'pressure'))); tx('fvUPress', ' ' + unit('pressure'));
    tx('fvPzr', Math.round(ins.pzr_level));
    tx('fvPorv', ins.porv_indicator === 'open' ? 'OPEN' : (cs.porv_block_open ? 'closed' : 'isolated'));
    tx('fvThot', Math.round(conv(ins.thot, 'temp'))); tx('fvUThot', ' ' + unit('temp'));
    tx('fvTcold', Math.round(conv(ins.tcold, 'temp'))); tx('fvUTcold', ' ' + unit('temp'));
    tx('fvFlow', Math.round(flow * 100)); tx('fvSg', Math.round(ins.sg_level));
    tx('fvSteam', Math.round(load * 100)); tx('fvRpm', Math.round(ins.turbine_rpm)); tx('fvMw', Math.round(ins.mwe_output));
    tx('fvVac', conv(ins.condenser_vacuum, 'vacuum').toFixed(1)); tx('fvUVac', ' ' + unit('vacuum'));
    tx('fvFeed', Math.round((ins.fw_flow || 0) * 100));
    var loop = document.getElementById('fpLoop'); if (!loop) return;
    if (flow < 0.04) loop.classList.add('stopped-pri');
    else { loop.classList.remove('stopped-pri'); setVarQ(loop, '--flow-dur', durS(1.05 / flow, 0.35, 7)); setVarQ(loop, '--spin-pri', durS(0.7 / flow, 0.25, 4)); }
    if (load < 0.04) loop.classList.add('stopped-sec');
    else { loop.classList.remove('stopped-sec'); setVarQ(loop, '--flow-dur-sec', durS(1.05 / load, 0.35, 7)); setVarQ(loop, '--spin-sec', durS(0.6 / load, 0.2, 4)); setVarQ(loop, '--blade-dur', durS(0.32 / load, 0.12, 2)); }
    var thotF = ins.thot * 9 / 5 + 32, warmAmt = Math.min(1, Math.max(0, (thotF - 549) / 160));
    var warmCol = 'rgb(' + Math.round(180 + warmAmt * 55) + ',' + Math.round(135 - warmAmt * 35) + ',' + Math.round(88 - warmAmt * 18) + ')';
    var dwrap = document.querySelector('[data-pdview="diagram"] .pd-diagram'); if (dwrap) dwrap.style.setProperty('--warm', warmCol);
    document.querySelectorAll('[data-pdview="diagram"] .tubeWarmStop').forEach(function (st) { st.setAttribute('stop-color', warmCol); });
    setA('fpRodFill', 'height', (12 + rodIns / 100 * 72).toFixed(1));
    var pzr = Math.max(0, Math.min(1, ins.pzr_level / 100)), pB = 208, pH = 66, wy = pB - pzr * pH;
    setA('fpPzrWater', 'y', wy.toFixed(1)); setA('fpPzrWater', 'height', (pB - wy).toFixed(1)); setA('fpPzrSurface', 'd', 'M372,' + wy.toFixed(1) + ' q14,-1.6 28,0 t28,0');
    var sg = Math.max(0, Math.min(1, ins.sg_level / 100)), gB = 390, gH = 218, gy = gB - sg * gH;
    setA('fpSgWater', 'y', gy.toFixed(1)); setA('fpSgWater', 'height', (gB - gy).toFixed(1)); setA('fpSgSurface', 'd', 'M542,' + gy.toFixed(1) + ' q29,-2 58,0 t58,0');
  }

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
      plantDiagram: PWR_FULL_DIAGRAM_SVG,   // full-loop schematic for the Diagram view
      primary: {
        diagram: PWR_DIAGRAM_SVG,   // SVG primary-loop schematic replaces the param sections
        sections: [
          { title: 'Reactor Core', rows: [
            R('Power', function (s) { return s.instruments.power_range.toFixed(1) + ' %'; }),
            R('Control Bank', function (s) { return bankStat(s, 'control'); }), R('Shutdown Bank', function (s) { return bankStat(s, 'shutdown'); }),
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
        controls: [ROD_DRIVE('control_rods'), ROD_SPEED(), SHUTDOWN_DRIVE('shutdown_rods'),
          { l: 'Boron (Reactivity) — CVCS', hint: 'Chemical & Volume Control System boron: Borate adds boron (lowers power), Dilute removes it (raises power). Needs the charging pump running.', seg: [{ l: 'Borate', act: 'borate' }, { l: 'Hold', act: 'boron-hold', on: 1 }, { l: 'Dilute', act: 'dilute' }] },
          { l: 'Charging Pump (CVCS)', hint: 'Charging pump — injects coolant into the cold leg (raises inventory; carries boron). Slider = manual %.', num: { id: 'chargeSet', min: 0, max: 100, value: 0, act: 'charge-set', setL: 'Set %' }, seg: [{ l: 'On', act: 'charge-pump-on', on: 1, run: 1 }, { l: 'Off', act: 'charge-pump-off' }] },
          { l: 'Letdown Valve (CVCS)', hint: 'Letdown valve — removes coolant from the Reactor Coolant System (lowers inventory). Slider = manual %.', num: { id: 'letdownSet', min: 0, max: 100, value: 0, act: 'letdown-set', setL: 'Set %' }, seg: [{ l: 'Isolate', act: 'letdown-isolate', on: 1 }] },
          { l: 'CVCS Inventory Control', hint: 'Auto makes up identified leakage by modulating charging to hold inventory; Manual = you set charging/letdown.', seg: [{ l: 'Auto', act: 'cvcs-auto', run: 1 }, { l: 'Manual', act: 'cvcs-manual', on: 1 }] },
          { l: 'Pressurizer Heaters (PZR)', hint: 'Pressurizer heaters raise primary pressure. Auto holds the setpoint; the slider is a manual power %.', num: { id: 'heatSet', min: 0, max: 100, value: 0, act: 'heat-set', setL: 'Set %' }, seg: [{ l: 'Auto', act: 'heat-auto', on: 1, run: 1 }] },
          { l: 'Pressurizer Spray (PZR)', hint: 'Pressurizer spray lowers primary pressure. It draws from the cold leg after the Reactor Coolant Pump (RCP), so it needs RCP flow. Auto holds the setpoint; the slider is a manual valve %.', num: { id: 'spraySet', min: 0, max: 100, value: 0, act: 'spray-set', setL: 'Set %' }, seg: [{ l: 'Auto', act: 'spray-auto', on: 1, run: 1 }] },
          { l: 'Reactor Coolant Pumps (RCP)', seg: [{ l: 'Run', act: 'rcp-run', on: 1, run: 1 }, { l: 'Stop', act: 'rcp-stop' }] },
          { l: 'Relief Valve (PORV)', hint: 'Manually open/close the Power-Operated Relief Valve to drop primary pressure. Its indicator shows the COMMANDED position, which can differ from reality (the TMI trap).', seg: [{ l: 'Open', act: 'porv-open', warn: 1 }, { l: 'Close', act: 'porv-close', on: 1 }] },
          { l: 'PORV Block Valve', seg: [{ l: 'Open', act: 'porv-block-open', on: 1 }, { l: 'Isolate', act: 'porv-block-close', warn: 1 }] },
          { l: 'Decay-Heat Removal (DHR)', emergency: 1, hint: 'Decay-Heat / Residual-Heat Removal — removes residual heat after shutdown, once cool and depressurized.', seg: [{ l: 'On', act: 'dhr-on', run: 1 }, { l: 'Off', act: 'dhr-off', on: 1 }] }],
        cross: [R('SG Level', function (s) { return s.instruments.sg_level.toFixed(0) + ' %'; }), R('Feedwater', function (s) { return pctOf(s.instruments.fw_flow); }),
          R('AFW', function (s) { return bool(s.true_state.afw_active, 'on', 'off'); }), R('Output', function (s) { return s.instruments.mwe_output.toFixed(0) + ' MW'; })],
      },
      secondary: {
        diagram: PWR_SEC_DIAGRAM_SVG,   // SVG secondary-loop schematic replaces the param sections
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
            R('Core Void', function (s) { return pctOf(s.instruments.core_void_fraction); }), R('Fuel Temp', function (s) { return dispT(s.true_state.fuel_temp_c); }),
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
    // Diagram view: full-loop schematic where available, else a placeholder
    var diagHtml = pd().plantDiagram ? pd().plantDiagram :
      '<div class="view-placeholder"><span>Plant diagram — SVG in development</span><span class="placeholder-sub">Energy flow: Reactor → ' + (ui.plant === 'bwr' ? 'Vessel → Turbine' : (ui.plant === 'rbmk' ? 'Drums → Turbine' : 'SGs → Turbine → Condenser')) + '</span></div>';
    var html = '';
    html += '<div class="pdview' + (ui.view === 'diagram' ? ' on' : '') + '" data-pdview="diagram">' + diagHtml + '</div>';
    html += '<div class="pdview' + (ui.view === 'primary' ? ' on' : '') + '" data-pdview="primary">' + buildCard('primary') + '</div>';
    html += '<div class="pdview' + (ui.view === 'secondary' ? ' on' : '') + '" data-pdview="secondary">' + buildCard('secondary') + '</div>';
    html += '<div class="pdview' + (ui.view === 'all' ? ' on' : '') + '" data-pdview="all">' +
      '<div class="pd-all-head"><div class="seg" id="pdOverlaySeg"><button class="on" data-overlay="instruments">Instruments</button><button data-overlay="true">True</button><button data-overlay="both">Both</button></div></div>' +
      '<div class="pd-all-grid" id="pdAllGrid"></div></div>';
    html += '<div class="ff-badge" style="display:none" id="ffBadge">⚡ 600×</div>';
    area.innerHTML = html;
    if (pd().plantDiagram) buildFullDiagramExtras();   // full-loop tube bundle / blades (once)
    if (pd().primary.diagram) buildDiagramBundle();    // SG tube bundle (once)
    if (pd().secondary.diagram) buildSecDiagramExtras();// condenser tubes + turbine blades (once)
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
    renderStatusBar(s);
    if (ui.view === 'primary' || ui.view === 'secondary') renderPdRows(ui.view, s);
    if (ui.view === 'diagram' && pd().plantDiagram) renderFullDiagram(s);
    if (ui.view === 'primary' && pd().primary.diagram) renderDiagram(s);
    if (ui.view === 'secondary' && pd().secondary.diagram) renderSecDiagram(s);
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
    // optional ?manual[=section] deep-link — opens the Operator's Manual on load
    var mm = /[?&]manual(?:=([a-z]+))?/.exec(location.search || '');
    if (mm) { if (mm[1]) ui.manualSection = mm[1]; openManual(); }
    // optional ?view= deep-link (diagram | primary | secondary | all)
    var vm = /[?&]view=(diagram|primary|secondary|all)/.exec(location.search || '');
    if (vm) setView(vm[1]);
    // optional ?follow=<procId> deep-link — loads a procedure into the Instructor block
    var fm = /[?&]follow=([a-z0-9_]+)/.exec(location.search || '');
    if (fm) followProcedure(fm[1]);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
