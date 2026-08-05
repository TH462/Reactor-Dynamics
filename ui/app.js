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
    inspectExpanded: false, // System Scanner expanded to its detail tier (#96); restored from localStorage
  };
  var service, latest = null, lastScrammed = false;
  // Operator automation now lives IN-STACK (layers/control/control_kernel.js);
  // the Automate tab is a pure face over snapshot.automation, issuing
  // set_auto_channel / set_auto_setpoint commands like any operator action.
  var chartBuf = [];        // { t, v:{serId:instrumentVal}, tv:{serId:trueVal} } — one value per plotted series
  var chartRange = {};      // id -> { lo, hi } — peak-hold auto-range (expands fast, re-tightens slow)
  var gaugeHist = {};       // id -> [{ t, v }]
  var gaugeTrend = {};      // id -> -1|0|1 — latched trend-arrow state (#237 hysteresis)
  // Fraction of the strip-chart plot width the traces occupy; the remaining right
  // gutter holds the live value chips (see drawChart / drawFloats / rewindPickClick).
  var CHART_PLOT_FRAC = 0.86;
  var CHART_RECORD_SEC = 1800;   // keep 30 min of history; the chart DISPLAYS only ui.window of it
  var CHART_SAMPLE_SEC = 0.5;    // …at most one row per 0.5 s of SIM time — see the record path
  var CHART_SHRINK_FRAMES = 40;  // frames a trace must sit well inside its band before the axis zooms in (~4 s)
  var smoothed = {};        // id -> display-damped instrument value

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
  // Signed fixed-point — a reactivity, a cooldown rate and a mass-balance mismatch
  // all read wrong without the sign. The rounding guard is not cosmetic: a critical
  // reactor sits a hair either side of zero, and toFixed(0) on -0.004 prints "-0",
  // which reads as "slightly subcritical" when it means "exactly on".
  function sgnFix(v, dp) {
    if (v == null || !isFinite(v)) return '—';
    dp = dp == null ? 0 : dp;
    if (Math.abs(v) < 0.5 * Math.pow(10, -dp)) v = 0;
    return (v > 0 ? '+' : '') + v.toFixed(dp);
  }
  // Pressure for the Physics tab, with the decimals the UNIT needs rather than the
  // ones the instrument needs (#238's quantisation trap). 1 psi is a sensible step;
  // 1 MPa is 145 of them, and rounding there collapses the whole loop pressure
  // SPLIT — 2235/2279/2199 psi all print as "15 MPa" — which is the one thing that
  // group exists to show.
  function physP(mpa) { return mpa == null ? '—' : conv(mpa, 'pressure').toFixed(ui.units === 'SI' ? 2 : 0) + ' ' + unit('pressure'); }
  // Temperature DIFFERENCE without the "-0" artefact. A subcooling margin sitting
  // a hundredth of a degree below saturation is 0, not "-0 °F" — the minus sign is
  // the only thing on that line, and it is noise.
  function physTd(c) {
    if (c == null) return '—';
    var v = conv(c, 'tempdiff');
    return (Math.abs(v) < 0.5 ? 0 : v).toFixed(0) + ' ' + unit('tempdiff');
  }
  // % of rated thermal → MW. The rating lives in ONE place (identity.mwt_rated);
  // read it rather than restating it, or this is the next number to drift.
  function mwtOf(pctRated) {
    var id = RD.PWR_CONFIG && RD.PWR_CONFIG.identity;
    return ((pctRated || 0) / 100) * ((id && id.mwt_rated) || 0);
  }
  function fuelDamageC() {
    var th = RD.PWR_CONFIG && RD.PWR_CONFIG.thermal;
    return (th && th.fuel_damage_c) || 1200;
  }
  // "should be exactly zero on a healthy plant" — voiding, cavitation, leakage
  // Physics-tab row colour for a quantity that should be ZERO on a healthy plant
  // (voiding, uncovery, oxidation heat, cavitation, leakage). Zero is not "no news" for
  // these — it is the criterion being MET, so it reads green rather than grey
  // *(OWNER DIRECTIVE, 2026-08-04: "make these physics numbers follow the indication
  // color scheme (grey, green, yellow, red, etc.)")*. Grey is reserved for rows with no
  // health criterion at all; see the .phys-grp block in shell.css for why that split is
  // what makes green mean anything.
  function nzCls(key) { return function (t) { return (t[key] || 0) > 0 ? 'q-caution' : 'q-ok'; }; }
  // Rod bank out of control_state, for the `ctl` chart series. `rod_groups` is an ARRAY of
  // records, not a map, so a chart accessor cannot index it — and a missing bank must come
  // back null rather than throw, because these run once per broadcast for 30 plant-minutes.
  function rodGrp(cs, id) {
    var g = cs && cs.rod_groups;
    if (!g) return null;
    for (var i = 0; i < g.length; i++) if (g[i].id === id) return g[i];
    return null;
  }

  // ====================================================================== engines
  // Selector key → plant + design_version + default initial state, plus the
  // display copy for the Plant & Mission window's plant cards.
  // `soon: true` = the physics engine is complete but the M8 board / M4 control
  // surface is not extended to it yet, so the card is shown greyed and is not
  // selectable. The ?engine= dev override still reaches them deliberately.
  var ENGINES = {
    pwr:       { plant: 'pwr',  dv: null,              init: 'hot_full_power',
                 label: 'PWR', sub: 'Pressurized Water Reactor',
                 desc: 'The stable, self-regulating starting point. Separate primary and steam loops. Home of the Three Mile Island story.' },
    rbmk_pre:  { plant: 'rbmk', dv: 'pre_chernobyl',   init: 'full_power', soon: true,
                 label: 'RBMK pre-1986', sub: 'Chernobyl-type · original design',
                 desc: 'Graphite-moderated, positive void coefficient, graphite-tipped rods — the design that failed at Chernobyl.' },
    rbmk_post: { plant: 'rbmk', dv: 'post_chernobyl',  init: 'full_power', soon: true,
                 label: 'RBMK post-1986', sub: 'Chernobyl-type · retrofitted',
                 desc: 'The same machine after the post-accident fixes. Run the same transient here and compare the outcome.' },
    bwr:       { plant: 'bwr',  dv: null,              init: 'full_power', soon: true,
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
      initStates: [['hot_full_power', 'Hot Full Power'], ['50_percent', '50 % Power'], ['hot_zero_power', 'Hot Standby (Mode 3)'], ['cold_shutdown', 'Cold Shutdown (Mode 5)']],
      defaultSeries: { power: true, tavg: true, pressure: true, sg_level: true },
      // `instr` names the snapshot instrument the gauge reads — the key into the
      // generated manual reference (RD.MANUAL indications) that the inspection
      // block quotes range, lag and driven alarms from (#96).
      gauges: [
        { id: 'power',   label: 'Reactor Power', lead: true, instr: 'power_range', raw: function (s) { return s.instruments.power_range; }, units: '%', min: 0, max: 120, caution: 108, danger: 118, dp: 1 },
        { id: 'press',   label: 'Primary Pressure', instr: 'primary_pressure', raw: function (s) { return s.instruments.primary_pressure; }, dim: 'pressure', min: 0, max: 20.7, caution: 16.2, danger: 16.44, dp: 0 },
        { id: 'tavg',    label: 'Avg Coolant Temp (Tavg)', instr: 'tavg', raw: function (s) { return s.instruments.tavg; }, dim: 'temp', min: 250, max: 343, caution: 312, danger: 335, dp: 0,
          // Auto-ranging: the operating band [250-343] when hot; a wide LOW-RANGE scale
          // [30-260] when cold (Mode 5 / heatup-cooldown) so one gauge covers both. 8°C
          // hysteresis around the operating minimum avoids flicker while crossing.
          autorange: function (raw) {
            if (this._wide == null) this._wide = raw < 246;
            this._wide = raw < (this._wide ? 254 : 246);
            return this._wide
              ? { min: 30, max: 260, caution: null, danger: null, caution_lo: null, danger_lo: null, label: 'Avg Coolant Temp (Tavg) · LOW RANGE' }
              : { min: 250, max: 343, caution: 312, danger: 335, label: 'Avg Coolant Temp (Tavg)' };
          } },
        { id: 'pzr',     label: 'Pressurizer Level (PZR)', instr: 'pzr_level', raw: function (s) { return s.instruments.pzr_level; }, units: '%', min: 0, max: 100, caution_lo: 25, danger_lo: 12, dp: 0 },
        { id: 'sg',      label: 'Steam Generator Level (SG)', instr: 'sg_level', raw: function (s) { return s.instruments.sg_level; }, units: '%', min: 0, max: 100, caution_lo: 30, danger_lo: 12, dp: 0 },
        { id: 'subcool', label: 'Subcooling Margin', instr: 'subcooling_margin', raw: function (s) { return s.instruments.subcooling_margin; }, dim: 'tempdiff', min: -28, max: 83, caution_lo: 11, danger_lo: 0, dp: 0 },
      ],
      // `get` reads the INSTRUMENT (lag + noise + injectable sensor failures); `tru`
      // reads the same quantity from true_state. The chart picks between them per
      // chartSource() — physics in Learning, instruments in Realistic, so the
      // PWR-E20/E21/E22 sensor-failure drills still bite where the manual says they do.
      //
      // THREE KINDS OF SERIES, and the accessors are what distinguish them — there is no
      // "kind" flag, because the accessor set already says everything:
      //   get + tru   an instrumented quantity. Realistic traces the channel, Learning
      //               traces the physics, and a failed transmitter separates them.
      //   tru only    a quantity with NO instrument on this plant (decay heat, xenon,
      //               voiding, the loop pressure split, core damage). `seriesVal` falls
      //               back to truth in BOTH modes for these, because there is nothing
      //               else to show — the alternative was a blank trace in Realistic.
      //   ctl only    a COMMANDED position (rod steps, heater, spray, dump, setpoints).
      //               Not an instrument and not physics: it is what the operator asked
      //               for, identical in both modes *(OWNER, 2026-08-03: "add rod steps
      //               and other controls like pzr heater, spray, etc. to the graph
      //               list")*. These are the inputs; everything above them is the
      //               response, and being able to overlay the two is the point.
      //
      // `grp` GROUPS the checklist and the order below IS the display order *(OWNER,
      // 2026-08-03: "organize the graph list in an intelligent order and group them in
      // groups")*. The order is the ENERGY PATH, the same spine the Physics tab uses:
      // neutrons → core damage → primary coolant → the loop pressure split → steam and
      // feed → turbine and output → and finally the controls that drive all of it.
      series: [
        // ---------------------------------------------------------------- reactor core
        { id: 'power',    grp: 'Reactor core', label: 'Power %',  c: '#6a90b0', get: function (i) { return i.power_range; }, tru: function (t) { return t.power_pct; }, range: [0, 120], dHi: 118, fmt: function (v) { return v.toFixed(0) + '%'; } },
        { id: 'sur',      grp: 'Reactor core', label: 'Startup Rate', c: '#c0913e', get: function (i) { return i.startup_rate; }, tru: function (t) { return t.startup_rate_dpm; }, range: [-2, 3], fmt: function (v) { return v.toFixed(1) + ' DPM'; } },
        // Net reactivity has no instrument — the board shows it as a true-state teaching
        // quantity beside the period, and this is the same number over time.
        { id: 'rho',      grp: 'Reactor core', label: 'Reactivity', c: '#d08fc0', tru: function (t) { return t.reactivity_pcm; }, range: [-500, 500], fmt: function (v) { return v.toFixed(0) + ' pcm'; } },
        // xenon has no instrument at all — it is true state in both modes
        { id: 'xenon',    grp: 'Reactor core', label: 'Xenon',    c: '#b05a8a', get: function (i) { return i.xenon_pct_eq; }, tru: function (t) { return t.xenon_pct_eq; }, range: [0, 250], fmt: function (v) { return v.toFixed(0) + '% eq'; } },
        // Boron trend (RCS boron reading). Re-added as a plottable graph option
        // 2026-07-24 (owner request); the board itself still shows boron via the
        // chemistry SAMPLE mechanic, not a live boronometer.
        { id: 'boron',    grp: 'Reactor core', label: 'Boron',    c: '#9a7ab8', get: function (i) { return i.boron_analyzer; }, tru: function (t) { return t.boron_ppm; }, range: [0, 1400], fmt: function (v) { return v.toFixed(0) + ' ppm'; } },
        { id: 'fuel_temp',grp: 'Reactor core', label: 'Fuel Temp (Doppler)', c: '#c07850', tru: function (t) { return t.fuel_temp_c; }, range: [200, 1300], fmt: function (v) { return conv(v, 'temp').toFixed(0) + unit('temp'); } },
        { id: 'decay',    grp: 'Reactor core', label: 'Decay Heat', c: '#a08850', tru: function (t) { return t.decay_heat_pct; }, range: [0, 8], fmt: function (v) { return v.toFixed(2) + '%'; } },
        // TOTAL core heat, not fission — the two are equal by construction at steady
        // power and diverge completely after a scram (#315). Plotting it against `power`
        // is the clearest way to see that.
        { id: 'core_heat',grp: 'Reactor core', label: 'Total Core Heat', c: '#8a7040', tru: function (t) { return t.core_heat_pct; }, range: [0, 120], fmt: function (v) { return v.toFixed(1) + '%'; } },

        // ---------------------------------------------------------------- core damage
        { id: 'clad_temp',grp: 'Core damage', label: 'Peak Clad Temp', c: '#d05a3e', tru: function (t) { return t.clad_temp_c; }, range: [200, 1400], dHi: 1200, fmt: function (v) { return conv(v, 'temp').toFixed(0) + unit('temp'); } },
        { id: 'core_void',grp: 'Core damage', label: 'Core Void', c: '#8fb0d0', tru: function (t) { return t.core_void_fraction * 100; }, range: [0, 100], fmt: function (v) { return v.toFixed(1) + '%'; } },
        { id: 'uncovered',grp: 'Core damage', label: 'Core Uncovered', c: '#c04a6a', tru: function (t) { return t.core_uncovered_frac * 100; }, range: [0, 100], dHi: 1, fmt: function (v) { return v.toFixed(0) + '%'; } },
        { id: 'zirc',     grp: 'Core damage', label: 'Zr Oxidation Heat', c: '#e07030', tru: function (t) { return t.zirc_heat_pct; }, range: [0, 5], dHi: 0.01, fmt: function (v) { return v.toFixed(2) + '%'; } },

        // ---------------------------------------------------------------- primary coolant
        { id: 'tavg',     grp: 'Primary coolant', label: 'Tavg',     c: '#b07830', get: function (i) { return i.tavg; }, tru: function (t) { return t.tavg_c; }, range: [270, 330], dHi: 335, fmt: function (v) { return conv(v, 'temp').toFixed(0) + unit('temp'); } },
        { id: 'thot',     grp: 'Primary coolant', label: 'Hot Leg',  c: '#c0563e', get: function (i) { return i.thot; }, tru: function (t) { return t.thot_c; }, range: [270, 335], fmt: function (v) { return conv(v, 'temp').toFixed(0) + unit('temp'); } },
        { id: 'tcold',    grp: 'Primary coolant', label: 'Cold Leg', c: '#4a86c0', get: function (i) { return i.tcold; }, tru: function (t) { return t.tcold_c; }, range: [260, 320], fmt: function (v) { return conv(v, 'temp').toFixed(0) + unit('temp'); } },
        // Loop ΔT. INSTRUMENTED (both legs are), so it keeps a `get` — and #315 is
        // exactly why it is worth plotting: the indicated split put the cold leg above
        // the hot leg in 48.3 % of post-trip samples before that fix.
        { id: 'loop_dt',  grp: 'Primary coolant', label: 'Loop ΔT',  c: '#9a6ab0', get: function (i) { return i.thot - i.tcold; }, tru: function (t) { return t.thot_c - t.tcold_c; }, range: [0, 45], fmt: function (v) { return conv(v, 'tempdiff').toFixed(1) + unit('tempdiff'); } },
        { id: 'pressure', grp: 'Primary coolant', label: 'Pressure', c: '#507048', get: function (i) { return i.primary_pressure; }, tru: function (t) { return t.pressure_mpa; }, range: [10, 17], dHi: 16.44, fmt: function (v) { return conv(v, 'pressure').toFixed(0) + ' ' + unit('pressure'); } },
        { id: 'subcool',  grp: 'Primary coolant', label: 'Subcool',  c: '#707060', get: function (i) { return i.subcooling_margin; }, tru: function (t) { return t.subcooling_c; }, range: [-10, 60], dLo: 0, fmt: function (v) { return conv(v, 'tempdiff').toFixed(0) + unit('tempdiff'); } },
        { id: 'pzr_level',grp: 'Primary coolant', label: 'PZR Level',c: '#507878', get: function (i) { return i.pzr_level; }, tru: function (t) { return t.pzr_level_pct; }, range: [0, 100], dLo: 12, fmt: function (v) { return v.toFixed(0) + '%'; } },
        // RCS loop flow (#247). The PWR was the only plant with no flow trend at all —
        // RBMK has Channel Flow and BWR has Recirc Flow — which is what an unbuilt
        // instrument looks like from the UI side. dLo marks the low-flow trip setpoint.
        { id: 'rcs_flow', grp: 'Primary coolant', label: 'RCS Flow', c: '#5a8a9a', get: function (i) { return i.rcs_flow; }, tru: function (t) { return t.pump_flow_pct; }, range: [0, 120], dLo: 90, fmt: function (v) { return v.toFixed(0) + '%'; } },
        { id: 'inventory',grp: 'Primary coolant', label: 'RCS Inventory', c: '#4a9a70', tru: function (t) { return t.core_inventory_pct; }, range: [0, 105], dLo: 90, fmt: function (v) { return v.toFixed(1) + '%'; } },
        { id: 'loop_void',grp: 'Primary coolant', label: 'Loop Void', c: '#7090b8', tru: function (t) { return t.primary_void_fraction * 100; }, range: [0, 100], dHi: 1, fmt: function (v) { return v.toFixed(1) + '%'; } },
        { id: 'leak',     grp: 'Primary coolant', label: 'Leak Flow', c: '#b8604a', tru: function (t) { return t.leak_flow * 100; }, range: [0, 30], dHi: 0.01, fmt: function (v) { return v.toFixed(2) + '%'; } },
        // Heatup / cooldown rate — the number the Mode 5↔1 procedures are written around
        // (the 100 °F/hr technical-specification class limit, and #310's ramped cooldown).
        { id: 'tavg_rate',grp: 'Primary coolant', label: 'Heatup Rate', c: '#c8a050', tru: function (t) { return t.tavg_rate_c_per_hr; }, range: [-60, 60], fmt: function (v) { return conv(v, 'tempdiff').toFixed(0) + unit('tempdiff') + '/hr'; } },

        // ---------------------------------------------------------------- loop pressure
        // There is ONE pressure instrument and it reads the hot-leg/pressurizer datum, so
        // the whole three-node split is true-state only. It is why the cold leg reaches an
        // ECCS setpoint before the gauge does, and why the pump suction cavitates first.
        { id: 'p_cold',   grp: 'Loop pressure', label: 'Cold Leg Press', c: '#6aa0c8', tru: function (t) { return t.p_coldleg; }, range: [0, 18], fmt: function (v) { return conv(v, 'pressure').toFixed(0) + ' ' + unit('pressure'); } },
        { id: 'p_suct',   grp: 'Loop pressure', label: 'Pump Suction Press', c: '#4a7090', tru: function (t) { return t.p_pumpsuction; }, range: [0, 18], fmt: function (v) { return conv(v, 'pressure').toFixed(0) + ' ' + unit('pressure'); } },
        { id: 'suct_sub', grp: 'Loop pressure', label: 'Suction Subcool', c: '#8a9070', tru: function (t) { return t.suction_subcool_c; }, range: [-10, 80], dLo: 0, fmt: function (v) { return conv(v, 'tempdiff').toFixed(0) + unit('tempdiff'); } },
        { id: 'cavit',    grp: 'Loop pressure', label: 'RCP Cavitation', c: '#d0704a', tru: function (t) { return t.rcp_cavitation_frac * 100; }, range: [0, 100], dHi: 0.01, fmt: function (v) { return v.toFixed(0) + '%'; } },

        // ---------------------------------------------------------------- steam & feed
        { id: 'steam_p',  grp: 'Steam & feed', label: 'Steam P',  c: '#60789a', get: function (i) { return i.steam_pressure; }, tru: function (t) { return t.steam_pressure_mpa; }, range: [0, 10], dHi: 8.0, fmt: function (v) { return conv(v, 'pressure').toFixed(0) + ' ' + unit('pressure'); } },
        { id: 'sg_level', grp: 'Steam & feed', label: 'SG Level', c: '#806890', get: function (i) { return i.sg_level; }, tru: function (t) { return t.sg_level_pct; }, range: [0, 100], dLo: 12, fmt: function (v) { return v.toFixed(0) + '%'; } },
        { id: 'steam_flow',grp: 'Steam & feed', label: 'Steam Flow',c: '#8a9a5a', get: function (i) { return i.steam_flow * 100; }, tru: function (t) { return t.steam_flow_normalized * 100; }, range: [0, 120], fmt: function (v) { return v.toFixed(0) + '%'; } },
        { id: 'fw_flow',  grp: 'Steam & feed', label: 'Feed Flow',c: '#4a8a86', get: function (i) { return i.fw_flow * 100; }, tru: function (t) { return t.fw_flow_normalized * 100; }, range: [0, 120], fmt: function (v) { return v.toFixed(0) + '%'; } },
        { id: 'afw_flow', grp: 'Steam & feed', label: 'AFW Flow', c: '#5aa8a0', get: function (i) { return i.afw_flow * 100; }, tru: function (t) { return t.afw_flow_normalized * 100; }, range: [0, 40], fmt: function (v) { return v.toFixed(1) + '%'; } },
        // The SG's own mass balance: steam out (turbine + dump + safeties) minus TOTAL
        // feed (main + AFW). Positive means the level is on its way down, which is the
        // thing a level trace only tells you after it has already happened.
        { id: 'sg_bal',   grp: 'Steam & feed', label: 'Steam − Feed', c: '#b09050', tru: function (t) { return (t.steam_out_total - t.fw_flow_normalized) * 100; }, range: [-30, 30], fmt: function (v) { return v.toFixed(1) + '%'; } },

        // ---------------------------------------------------------------- turbine & output
        { id: 'mwe',      grp: 'Turbine & output', label: 'Output MW',c: '#506880', get: function (i) { return i.mwe_output; }, tru: function (t) { return t.mwe_output; }, range: [0, 110], fmt: function (v) { return v.toFixed(0) + ' MWe'; } },
        { id: 'demand',   grp: 'Turbine & output', label: 'Steam Demand MW', c: '#7a90a8', tru: function (t) { return t.steam_demand_mwe; }, range: [0, 110], fmt: function (v) { return v.toFixed(0) + ' MWe'; } },
        { id: 'gov',      grp: 'Turbine & output', label: 'Governor Valve', c: '#90a860', get: function (i) { return i.governor_valve; }, tru: function (t) { return t.governor_valve_pct; }, range: [0, 100], fmt: function (v) { return v.toFixed(0) + '%'; } },
        { id: 'rpm',      grp: 'Turbine & output', label: 'Turbine RPM', c: '#a09070', get: function (i) { return i.turbine_rpm; }, tru: function (t) { return t.turbine_rpm; }, range: [0, 2000], fmt: function (v) { return v.toFixed(0) + ' rpm'; } },
        // Gross electrical over TOTAL core heat — the honest denominator (#315), not
        // fission power, or the number goes to infinity after a scram.
        { id: 'eff',      grp: 'Turbine & output', label: 'Cycle Efficiency', c: '#8a8a5a', tru: function (t) { var q = mwtOf(t.core_heat_pct); return q > 1 ? t.mwe_output / q * 100 : null; }, range: [0, 45], fmt: function (v) { return v.toFixed(1) + '%'; } },
        { id: 'vacuum',   grp: 'Turbine & output', label: 'Condenser Vacuum', c: '#6080a0', get: function (i) { return i.condenser_vacuum; }, tru: function (t) { return t.condenser_vacuum_kpa; }, range: [0, 100], dLo: 74.5, fmt: function (v) { return v.toFixed(1) + ' kPa'; } },

        // ---------------------------------------------------------------- controls
        // COMMANDED positions, not readings. Plotted against everything above them, these
        // are what turn a trend into a cause: rod steps beside Tavg, spray and heater
        // beside pressure, dump beside steam flow.
        { id: 'rod_steps',grp: 'Controls', label: 'Control Rod Steps', c: '#5ac0a0', ctl: function (c) { var g = rodGrp(c, 'control_rods'); return g ? g.steps : null; }, range: [0, 912], fmt: function (v) { return v.toFixed(0) + ' st'; } },
        { id: 'sd_steps', grp: 'Controls', label: 'Shutdown Rod Steps', c: '#3a8070', ctl: function (c) { var g = rodGrp(c, 'shutdown_rods'); return g ? g.steps : null; }, range: [0, 912], fmt: function (v) { return v.toFixed(0) + ' st'; } },
        { id: 'heater',   grp: 'Controls', label: 'PZR Heater', c: '#d09040', ctl: function (c) { return c.heater_power_pct; }, range: [0, 100], fmt: function (v) { return v.toFixed(0) + '%'; } },
        { id: 'spray',    grp: 'Controls', label: 'PZR Spray', c: '#50a8d0', ctl: function (c) { return c.spray_valve_pct; }, range: [0, 100], fmt: function (v) { return v.toFixed(0) + '%'; } },
        { id: 'dump',     grp: 'Controls', label: 'Steam Dump', c: '#a0b850', ctl: function (c) { return c.steam_dump_pct; }, range: [0, 100], fmt: function (v) { return v.toFixed(0) + '%'; } },
        { id: 'feed_pump',grp: 'Controls', label: 'Feed Pump Speed', c: '#40988a', ctl: function (c) { return c.feed_pump_speed_pct; }, range: [0, 120], fmt: function (v) { return v.toFixed(0) + '%'; } },
        // Charging and letdown are INSTRUMENTED (both have flow indications on the CVCS
        // card), so they keep a `get` — they sit here because the operator sets them.
        { id: 'charging', grp: 'Controls', label: 'Charging Flow', c: '#7ab0d8', get: function (i) { return i.charging_flow * 100; }, tru: function (t) { return t.charging_flow_actual * 100; }, range: [0, 20], fmt: function (v) { return v.toFixed(2) + '%'; } },
        { id: 'letdown',  grp: 'Controls', label: 'Letdown Flow', c: '#b87a90', get: function (i) { return i.letdown_flow * 100; }, tru: function (t) { return t.letdown_flow_actual * 100; }, range: [0, 20], fmt: function (v) { return v.toFixed(2) + '%'; } },
        { id: 'load_tgt', grp: 'Controls', label: 'Load Target MW', c: '#8898b8', ctl: function (c) { return c.load_target_mwe; }, range: [0, 110], fmt: function (v) { return v.toFixed(0) + ' MWe'; } },
        { id: 'press_sp', grp: 'Controls', label: 'Pressure Setpoint', c: '#70a070', ctl: function (c) { return c.pressure_setpoint; }, range: [0, 18], fmt: function (v) { return conv(v, 'pressure').toFixed(0) + ' ' + unit('pressure'); } },
        { id: 'dump_sp',  grp: 'Controls', label: 'Dump Setpoint', c: '#a0a860', ctl: function (c) { return c.steam_dump_setpoint; }, range: [0, 10], fmt: function (v) { return conv(v, 'pressure').toFixed(0) + ' ' + unit('pressure'); } },
      ],
      // ------------------------------------------------------------ Physics tab
      // TRUE plant state — HR1's sanctioned explicit diagnostic overlay, NOT a
      // second set of gauges. Every row reads true_state; nothing here drives
      // anything, and no row is an instrument.
      //
      // WHAT EARNS A ROW: the bias is toward quantities the BOARD CANNOT SHOW —
      // no instrument exists for them, or none is wired to a readout. Measured
      // against the board's own reads (the IN()/TS() calls in pwr_board_wiring.js):
      // fuel and clad temperature, decay heat, xenon, both void fractions, RCS
      // inventory, the three-node loop pressure split, suction subcooling, RCP
      // cavitation, leak flow and cycle efficiency have no board readout at all.
      // A few board-visible anchors stay where a group would otherwise be
      // incoherent (fission power, MWe out) — they are the denominators the rest
      // of the group is read against.
      //
      // ORDER IS THE ENERGY PATH: neutrons → fuel → coolant → pressure boundary →
      // heat sink and output. Read top to bottom and you have walked the plant.
      //
      // `cls` marks states that should be ZERO on a healthy plant (voiding,
      // cavitation, leakage) or that have a threshold already in the code
      // (fuel_damage_c; the 22.2/11.1 °C subcooling steps are renderSubcool's).
      // It is not a second alarm system — the alarm panel is the alarm panel.
      physics: [
        { title: 'Reactivity', rows: [
          { k: 'Net reactivity',
            hint: 'the net excess reactivity of the core, in per cent mille (pcm) — hundred-thousandths of a reactivity unit.',
            detail: 'Zero is critical: power is steady. Positive and power is climbing, negative and it is falling, and how FAST depends on how far from zero — which is what the PERIOD readout on the board turns into seconds. This is a computed diagnostic, not a plant instrument; a real plant infers reactivity from rate meters and rod worth curves.',      v: function (t) { return sgnFix(t.reactivity_pcm, 0) + ' pcm'; } },
          { k: 'Fuel temp (Doppler)',
            hint: 'average fuel pellet temperature, the input to the Doppler reactivity feedback.',
            detail: 'Fuel runs far hotter than the coolant around it because the heat has to cross the pellet, the gap and the cladding to get out. As it heats, resonance absorption in uranium-238 broadens and swallows more neutrons — the Doppler effect — which is prompt negative feedback and the first thing that arrests a power excursion, acting in milliseconds, long before the moderator or the operator can.', v: function (t) { return dispT(t.fuel_temp_c); } },
          { k: 'Xenon',
            hint: 'xenon-135 poisoning, as a percentage of its equilibrium worth at the current power.',
            detail: 'Xenon-135 is the strongest neutron absorber the core makes. It builds from iodine-135 decay and burns out under flux, so it lags power by hours: after a power reduction it PEAKS several hours later, and if it out-runs your available rod and boron worth the reactor cannot be restarted until it decays — the xenon precluded window. 100 % means it has settled at the value that power sustains.',               v: function (t) { return t.xenon_pct_eq.toFixed(0) + ' % eq'; } },
          { k: 'RCS boron',
            hint: 'boron concentration in the Reactor Coolant System (RCS), in parts per million (ppm).',
            detail: 'Boron is the slow, plant-wide reactivity control: it holds down the excess reactivity of fresh fuel so the control rods can stay nearly withdrawn and available. Adding boron (borating) is negative reactivity, adding pure water (diluting) is positive. It moves over minutes to hours through the Chemical and Volume Control System (CVCS), which is why rods, not boron, answer a transient.',           v: function (t) { return t.boron_ppm.toFixed(0) + ' ppm'; } },
        ] },
        // MEASURED, and the reason this group is split three ways: `power_pct` is
        // FISSION power alone. A few seconds into a 20 %-of-rated cold-leg LOCA it
        // read 11.0 MWt while decay heat was 21.0 MWt — a core apparently making
        // less heat than its own decay tail. `core_heat_pct` is the sum the thermal
        // paths actually burn (31.2 MWt in that same sample), and it is the honest
        // denominator for efficiency.
        { title: 'Core heat', rows: [
          { k: 'Fission power',
            hint: 'heat from fission alone, in megawatts thermal (MWt).',
            detail: 'This is what the nuclear instruments read and what the reactor trip acts on — and it is NOT the total heat the core is making. The moment the rods drop, fission collapses in seconds while the decay tail keeps going, so immediately after a scram this number reads far BELOW the decay heat row underneath it. Anything treating reactor power as core thermal power is wrong from the instant of the trip.',      v: function (t) { return mwtOf(t.power_pct).toFixed(1) + ' MWt'; } },
          { k: 'Decay heat',
            hint: 'heat from the decay of fission products, as a percentage of rated and in megawatts thermal (MWt).',
            detail: 'The heat you cannot switch off. Immediately after a trip from full power it is about 6–7 % of rated, falls to a few per cent within minutes and to around 1 % after a day — but it never reaches zero, which is why a shut-down core still needs a heat sink and why losing one is a real accident rather than an inconvenience.',         v: function (t) { return t.decay_heat_pct.toFixed(2) + ' % · ' + mwtOf(t.decay_heat_pct).toFixed(1) + ' MWt'; } },
          { k: 'Total core heat',
            hint: 'fission plus decay heat — the heat the coolant actually has to carry away, in megawatts thermal (MWt).',
            detail: 'This is the honest denominator for cycle efficiency and the number the loop temperature split is computed from. At steady power it is equal to fission power by construction, which is exactly why the difference is invisible in normal operation and matters enormously after a trip.',    v: function (t) { return mwtOf(t.core_heat_pct).toFixed(1) + ' MWt'; } },
          { k: 'Core void (boiling)',
            hint: 'the fraction of the core coolant channel that is steam rather than water.',
            detail: 'Zero on a healthy Pressurized Water Reactor (PWR) — the whole point of holding the primary at about 2235 pounds per square inch (psi) is to keep the coolant liquid all the way through the core. Anything above zero means the coolant is boiling where it should not, heat transfer off the fuel is degrading, and the subcooling margin has already gone.', v: function (t) { return pctOf(t.core_void_fraction, 1); }, cls: nzCls('core_void_fraction') },
        ] },
        // ------------------------------------------------------ core damage (2026-08-03)
        // Added on the owner's ask ("the physics tab should also show core damage"), and
        // split out of Core heat rather than appended to it because these four rows are a
        // CHAIN and read as one: inventory falls → the top of the core is steam-cooled →
        // zirconium oxidation adds its own heat → the peak temperature crosses a threshold
        // and the run is over. Before this the panel showed the SYMPTOM (peak clad
        // temperature) and the VERDICT (nothing — `fuel_damaged` was not on the panel at
        // all) with the mechanism in between missing entirely.
        //
        // Two of the four are new true_state (`core_uncovered_frac`, `zirc_heat_pct`) —
        // they were locals inside `stepCladding` and had no instrument, no board readout
        // and no way to be plotted. MEASURED on a 0.8 large LOCA: uncovery reaches 100 %
        // by 50 s and the oxidation term climbs 0.077 → 0.943 % of rated between 50 s and
        // 400 s while the decay tail is FALLING, which is the whole #238 point and was
        // invisible.
        { title: 'Core damage', rows: [
          // MEASURED: on a covered core `stepCladding` floors the hot node at the
          // fuel temperature, so clad == fuel at power (both 693 °C / 1280 °F at
          // HFP) and sits far above the hot leg — a "clad above coolant" rule
          // cautions the whole time. The node only SEPARATES from the fuel once
          // uncovery starts (#213), which is the state worth marking; the alarm
          // step is checkDamage's own criterion, fuel_damage_c.
          { k: 'Peak clad temp',
            hint: 'the hottest fuel cladding temperature in the core, at the top of the hot channel.',
            detail: 'While the core is covered the cladding sits at the fuel temperature and this tracks it. Once the water level falls below the top of the core the uncovered part is cooled by steam instead of water, the cladding separates from the fuel node and runs away upward. This is the number core damage is judged on, because damage is local before it is average.',     v: function (t) { return dispT(t.clad_temp_c); },
            cls: function (t) { return t.clad_temp_c >= fuelDamageC() ? 'q-alarm' : t.clad_temp_c > t.fuel_temp_c + 1 ? 'q-caution' : 'q-ok'; } },
          { k: 'Core uncovered',
            hint: 'the fraction of the core the model treats as steam-cooled rather than water-cooled.',
            detail: 'Zero while the Reactor Coolant System (RCS) inventory keeps the core covered. It ramps up as inventory falls past the top of the active fuel and reaches 100 % at significant uncovery. It is the first link in the damage chain: uncovery, then zirconium oxidation heat, then a cladding temperature excursion.',     v: function (t) { return pctOf(t.core_uncovered_frac, 1); }, cls: nzCls('core_uncovered_frac') },
          { k: 'Zr oxidation heat',
            hint: 'heat released by zirconium–steam oxidation of the cladding, as a percentage of rated and in megawatts thermal (MWt).',
            detail: 'Above roughly 2200 °F (1200 °C) the zirconium cladding reacts with steam, producing zirconium dioxide, hydrogen and a great deal of heat. It is the reason a damaged core ACCELERATES: the reaction rate rises with temperature while the decay tail is falling, so the core heats itself faster and faster once it starts. The hydrogen is the other product, and it is what exploded at Three Mile Island Unit 2 and at Fukushima.',  v: function (t) { return t.zirc_heat_pct.toFixed(2) + ' % · ' + mwtOf(t.zirc_heat_pct).toFixed(2) + ' MWt'; },
            cls: nzCls('zirc_heat_pct') },
          // The endpoint, and it reports MARGIN while the core is intact rather than just
          // "no". A boolean that is false for the entire run teaches nothing; the distance
          // to `fuel_damage_c` is the number that moves. Both latches are read (melt first
          // — `melted` implies `fuel_damaged`), and the criterion is checkDamage's own:
          // the max of the hot node and the bulk node, because damage is local before it
          // is average.
          { k: 'Core damage',
            hint: 'how much margin is left to fuel damage, or the damage state once it has happened.',
            detail: 'While the core is intact this reports the temperature margin from the peak node to the damage criterion, which is the number that actually moves — a boolean that reads "no" all run teaches nothing. Once damage or melt latches it stays latched, because neither un-happens.', v: function (t) {
              if (t.melted) return 'CORE MELT · ' + String(t.destruction_cause || 'thermal_melt').replace(/_/g, ' ');
              var peak = t.clad_temp_c > t.fuel_temp_c ? t.clad_temp_c : t.fuel_temp_c;
              if (t.fuel_damaged) return 'FUEL DAMAGE · peak ' + dispT(peak);
              return 'intact · ' + physTd(fuelDamageC() - peak) + ' to damage';
            },
            cls: function (t) {
              if (t.melted || t.fuel_damaged) return 'q-alarm';
              var peak = t.clad_temp_c > t.fuel_temp_c ? t.clad_temp_c : t.fuel_temp_c;
              return peak > fuelDamageC() - 200 ? 'q-caution' : 'q-ok';
            } },
        ] },
        { title: 'Primary coolant', rows: [
          { k: 'Core ΔT (hot − cold)',
            hint: 'the temperature rise the coolant picks up crossing the core — hot leg minus cold leg.',
            detail: 'For a fixed flow this is directly proportional to the heat the core is making, which is why it is the input to the Overtemperature and Overpower Delta-T reactor trips. It runs about 59 °F (33 °C) at full power and near zero on a shut-down plant with the pumps running. Lose flow and it OPENS even though power has not changed.',   v: function (t) { return physTd(t.thot_c - t.tcold_c); } },
          { k: 'Subcooling margin',
            hint: 'how far the coolant is below its own boiling point at the current pressure.',
            detail: 'The single most important number on a Pressurized Water Reactor (PWR) during an accident, and the one that tells you whether you still have a solid water loop. Positive means liquid; zero means the coolant is at saturation and will flash to steam anywhere pressure dips. Emergency procedures are written around keeping it, and losing it is what turns a leak into a loss-of-coolant accident.',      v: function (t) { return physTd(t.subcooling_c) + (t.subcooling_c <= 0 ? ' · SATURATED' : ''); },
            cls: function (t) { return t.subcooling_c < 11.1 ? 'q-alarm' : t.subcooling_c < 22.2 ? 'q-caution' : 'q-ok'; } },
          { k: 'Heatup / cooldown rate',
            hint: 'the rate average coolant temperature is moving, per hour.',
            detail: 'Limited by the Reactor Pressure Vessel (RPV) itself: the thick steel wall heats and cools from the inside first, so a fast change puts the inner surface in tension against the outer. Technical Specifications cap it at 100 °F/hr (55.6 °C/hr) in each direction, and a controlled cooldown is spent holding that number, not chasing it.', v: function (t) { return sgnFix(conv(t.tavg_rate_c_per_hr, 'tempdiff'), 0) + ' ' + unit('tempdiff') + '/hr'; } },
          { k: 'RCS inventory',
            hint: 'how much water is in the Reactor Coolant System (RCS), as a percentage of the normal full mass.',
            detail: 'The mass balance behind everything else. Above 100 % the plant is being over-filled and heads toward going solid; below it the pressurizer level and then the subcooling margin follow it down. It is TRUE mass, not a gauge — there is no plant instrument that reads it, which is exactly why pressurizer level has to be inferred from and cross-checked against everything else.',          v: function (t) { return t.core_inventory_pct.toFixed(1) + ' %'; },
            cls: function (t) { return t.core_inventory_pct < 90 ? 'q-alarm' : t.core_inventory_pct < 99 ? 'q-caution' : 'q-ok'; } },
          { k: 'Loop void (inventory)',
            hint: 'the steam fraction in the loop as a whole, outside the core channel.',
            detail: 'Zero on an intact plant. Steam in the loop breaks natural circulation, defeats the Reactor Coolant Pumps (RCPs) and makes pressurizer level lie — a voiding primary pushes water UP into the pressurizer, so level rises while the plant is losing inventory. That is the deception at the heart of the Three Mile Island accident.',  v: function (t) { return pctOf(t.primary_void_fraction, 1); }, cls: nzCls('primary_void_fraction') },
          { k: 'RCS loop flow',
            hint: 'coolant flow through the loop, as a percentage of rated flow.',
            detail: '100 % with the Reactor Coolant Pumps (RCPs) running. Stop them and it does not fall to zero: buoyancy between the hot and cold legs keeps a few per cent circulating — natural circulation — which is enough to carry decay heat to the steam generator but nothing like enough for power operation.',          v: function (t) { return t.pump_flow_pct.toFixed(0) + ' %'; } },
          // The passive shot, and how much of it is left. The ECCS card shows HPI flow,
          // discharge pressure and alignment; nothing anywhere shows accumulator
          // inventory, so a player who has dumped the tanks has no way to know it.
          { k: 'Accumulator inventory',
            hint: 'water remaining in the passive accumulator tanks, and their nitrogen pressure.',
            detail: 'The accumulators are the passive shot: nitrogen-pressurized tanks that dump into the cold leg on their own the moment Reactor Coolant System (RCS) pressure falls below their check valves, with no power, no signal and no operator. They fire once. Once they are empty the core is on pumped Emergency Core Cooling System (ECCS) injection alone, and nothing else on the board says how much is left.',  v: function (t) { return t.accumulator_volume_pct.toFixed(0) + ' % · ' + physP(t.accumulator_pressure_mpa); },
            cls: function (t) { return t.accumulator_volume_pct < 1 ? 'q-alarm' : t.accumulator_volume_pct < 99 ? 'q-caution' : 'q-ok'; } },
        ] },
        // There are no per-node pressure GAUGES on this plant — the one
        // primary_pressure instrument reads the hot-leg/pressurizer datum. The
        // split is why the cold leg reaches an ECCS setpoint before the gauge does
        // and why the pump suction cavitates first.
        { title: 'Loop pressure', rows: [
          { k: 'Hot leg (pzr datum)',
            hint: 'pressure at the hot leg, where the pressurizer connects — the datum the one pressure gauge reads.',
            detail: 'The plant has a single primary pressure instrument and it reads here. Every other pressure below is computed from this one plus the pump head and the loop losses, and none of them has a gauge.',     v: function (t) { return physP(t.p_hotleg); } },
          { k: 'Cold leg (pump disch)',
            hint: 'pressure at the Reactor Coolant Pump (RCP) discharge, the high point of the loop.',
            detail: 'The pump adds head, so the cold leg sits above the pressurizer datum by roughly the pump differential. It matters because Emergency Core Cooling System (ECCS) injection and the accumulator check valves see THIS pressure, not the one on the gauge — so injection can start or stop at a pressure the board never displays.',   v: function (t) { return physP(t.p_coldleg); } },
          { k: 'Pump suction',
            hint: 'pressure at the Reactor Coolant Pump (RCP) suction, the low point of the loop.',
            detail: 'The lowest pressure anywhere in the primary, which makes it the first place the coolant can flash. If pressure falls here to the saturation pressure of the water arriving, the pump cavitates.',            v: function (t) { return physP(t.p_pumpsuction); } },
          { k: 'Suction subcooling',
            hint: 'how far the water arriving at the Reactor Coolant Pump (RCP) is below boiling, at the suction pressure.',
            detail: 'The margin that actually protects the pumps, and it is always smaller than the loop subcooling margin above, because the suction is the lowest pressure in the system. It reaches zero before the bulk coolant does — the pumps are the first thing a depressurization threatens.',      v: function (t) { return physTd(t.suction_subcool_c); },
            cls: function (t) { return t.suction_subcool_c <= 0 ? 'q-alarm' : t.suction_subcool_c < 11.1 ? 'q-caution' : 'q-ok'; } },
          { k: 'RCP cavitation',
            hint: 'how badly the Reactor Coolant Pumps (RCPs) are cavitating, as a fraction.',
            detail: 'Zero on a healthy plant. Above zero the pumps are passing steam bubbles that collapse violently against the impeller: flow falls off, the pumps are being damaged, and procedures call for tripping them and going to natural circulation rather than running them to destruction.',          v: function (t) { return pctOf(t.rcp_cavitation_frac, 0); }, cls: nzCls('rcp_cavitation_frac') },
          { k: 'Primary leak flow',
            hint: 'coolant leaving the Reactor Coolant System (RCS) through a break or a leak, as a fraction of rated flow.',
            detail: 'Zero on an intact plant. Discharge is not fixed — a break is an AREA, so flow falls as the system depressurizes, which is why a large break is violent early and slows as it empties.',       v: function (t) { return pctOf(t.leak_flow, 2); }, cls: nzCls('leak_flow') },
        ] },
        // fw_flow_normalized is TOTAL feed (main + AFW — pwr_steam_generator.js:83),
        // and steam_out_total is everything leaving the SG (turbine + dump + safeties),
        // so the difference is the SG's mass balance: positive = boiling off faster
        // than it is being fed, i.e. the level is going down.
        { title: 'Heat sink & output', rows: [
          { k: 'Steam − feed mismatch',
            hint: 'steam leaving the steam generator minus feedwater going in, as a percentage of rated.',
            detail: 'The steam generator mass balance in one number. Positive means it is boiling off faster than it is being fed and level is falling; negative means it is filling. It is element 2 and 3 of the three-element feedwater controller and the reason that controller can anticipate a load change instead of chasing level after the fact.', v: function (t) { return sgnFix((t.steam_out_total - t.fw_flow_normalized) * 100, 1) + ' %'; } },
          { k: 'Turbine steam demand',
            hint: 'what the turbine is asking the steam generator for, in megawatts electric (MWe).',
            detail: 'The secondary side sets the pace on a Pressurized Water Reactor (PWR): open the turbine valves and the extra steam draw cools the primary, average temperature falls, and the negative moderator coefficient raises reactor power on its own. The reactor follows the turbine, not the other way round.',  v: function (t) { return t.steam_demand_mwe.toFixed(1) + ' MWe'; } },
          { k: 'Gross electrical',
            hint: 'generator output in megawatts electric (MWe), before station loads.',
            detail: 'What the machine is actually putting on the grid. It reads the TURBINE, not the core — the two diverge whenever the generator breaker is open or steam is going to the dump valves instead of the turbine.',      v: function (t) { return t.mwe_output.toFixed(1) + ' MWe'; } },
          { k: 'Cycle efficiency',
            hint: 'electrical output divided by total core heat.',
            detail: 'About a third on a Pressurized Water Reactor (PWR) — saturated steam at roughly 1000 pounds per square inch (psi) simply cannot do better, which is why a plant making around 100 megawatts electric (MWe) is burning three times that in the core. It collapses after a trip because the core keeps making decay heat with nothing taking load off it.',      v: function (t) { var q = mwtOf(t.core_heat_pct); return q > 1 ? (t.mwe_output / q * 100).toFixed(1) + ' %' : '—'; } },
        ] },
      ],
      // ------------------------------------------------------- Inject Failure grouping
      // *(OWNER DIRECTIVE, 2026-08-04: "organize the list of failures into logical
      // groupings.")* The order is the SAME ENERGY-PATH SPINE as the Graph list and the
      // Physics tab — reactivity → coolant → pressure boundary → heat sink → support —
      // with instruments as the diagnostic tail, so the three lists read alike.
      //
      // This does NOT use the catalog's own `category`, deliberately. Those five values
      // exist to colour the badge and to type the failure for the control layer, and they
      // group badly for a player: `power` holds eight unrelated things (main feedwater, the
      // turbine, offsite power, a station blackout, condenser vacuum, SG overfeed and BOTH
      // steam line breaks), while `safety_system` is the default for anything untyped. The
      // badge still shows the category — the grouping is a separate question from the tag.
      //
      // Membership is HAND-MAINTAINED, which is the #224 trap, so `buildFailures` renders
      // anything missing from this table under a trailing heading rather than dropping it.
      // A new failure therefore SHOWS UP misfiled instead of disappearing, and
      // `run_inspect` asserts every catalog entry is placed.
      failGroups: [
        { title: 'Reactivity & rods',        ids: ['continuous_rod_withdrawal', 'stuck_rod_on_scram', 'failure_to_scram'] },
        { title: 'Reactor coolant system',   ids: ['large_loca', 'sgtr', 'rcp_seal_leak', 'stuck_porv_open', 'rcp_trip'] },
        { title: 'Pressurizer & pressure',   ids: ['stuck_open_spray', 'failed_pzr_heaters'] },
        { title: 'Steam & feedwater',        ids: ['loss_of_feedwater', 'sg_overfeed', 'steam_line_break', 'steam_line_break_upstream'] },
        { title: 'Turbine & condenser',      ids: ['turbine_trip', 'loss_of_condenser_vacuum'] },
        { title: 'Electrical & safeguards',  ids: ['loss_of_offsite_power', 'station_blackout', 'degraded_hpi', 'afw_failure'] },
        { title: 'Instruments',              ids: ['porv_indicator_stuck_closed', 'tavg_sensor_failure', 'pzr_level_sensor_stuck', 'pzr_level_sensor_low'] },
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

  // Alarm → system family, for the tile's meta line and the scanner hint. Tiles do
  // not colour-code by it (priority carries the colour: red / amber / grey).
  //
  // AUTHORED DATA since #157 — it used to be keyword-matched off the alarm id here,
  // which was wrong for 13 of the PWR's 33. The failure was quiet and self-inflicted:
  // `charging_high` fell through every rule to 'safety_system' because the word "flow"
  // lives in its LABEL (CHG FLOW HI) and the matcher read the id; `sur_high` did the
  // same on both PWR and RBMK; `sg_press_high` matched "press" and was filed under
  // coolant despite being secondary steam. Renaming an alarm silently re-categorised it.
  //
  // No fallback on purpose. A missing category renders as '—' and `run_contract.js` fails,
  // rather than a guess quietly standing in for authored data — the whole defect here
  // was a plausible-looking guess nobody could see was wrong.
  function alarmCategory(a) { return (a && a.category) || '—'; }

  // ---- inspection copy for generated surfaces (#96) ------------------------
  // Gauges and alarm tiles are built from data, so their detail text is built
  // from the same data: the generated manual reference (RD.MANUAL — measures,
  // range, lag, alarms per instrument) and the plant's protection table (alarm
  // instrument, direction, setpoint). Authoring either by hand would be a second
  // copy of numbers that already exist, and it would go stale on the next retune.
  // Keyed by engine first, plant second: the RBMK ships as two engine keys
  // (rbmk_pre / rbmk_post) over one plant's reference data.
  function manualRef() { return (RD.MANUAL || {})[ui.engineKey] || (RD.MANUAL || {})[ui.plant] || null; }
  function manualIndication(id) {
    var m = manualRef(), list = m && m.indications;
    if (!list) return null;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  // Does the packed manual for the active plant carry this document? Only the PWR
  // manual set is written, so the citation link has to be conditional.
  function manualDoc(id) {
    var mm = (RD.MANUAL_MD || {})[ui.engineKey] || (RD.MANUAL_MD || {})[ui.plant];
    return !!(mm && (mm.docs || []).some(function (d) { return d.id === id; }));
  }
  function alarmSpecs() {
    var c = RD[String(ui.plant).toUpperCase() + '_CONTROL'];
    return (c && c.protection && c.protection.alarms) || [];
  }
  function alarmSpec(id) {
    var a = alarmSpecs();
    for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i];
    return null;
  }
  // The dimension an instrument's value converts on, so a quoted range or setpoint
  // follows the operator's US/SI selection instead of always reading SI.
  //
  // The GAUGE is asked first, because the manual reference records subcooling
  // margin's unit as '°C' when it is a temperature DIFFERENCE — converting it as
  // an absolute put the subcooling range at "−18 to 181 °F" instead of "−50 to
  // 149". The gauge already carries the right dimension for exactly this reason.
  function instrDim(instrId, u) {
    var gs = prof().gauges || [];
    for (var i = 0; i < gs.length; i++) if (gs[i].instr === instrId && gs[i].dim) return gs[i].dim;
    return u === 'MPa' ? 'pressure' : u === '°C' ? 'temp' : u === 'kPa' ? 'vacuum' : null;
  }
  function fmtInstrValue(v, u, instrId) {
    var dim = instrDim(instrId, u);
    if (dim) return conv(v, dim).toFixed(dim === 'pressure' ? 0 : 1) + ' ' + unit(dim);
    return String(v) + (u ? ' ' + u : '');
  }
  function gaugeDetail(g) {
    var ind = g.instr ? manualIndication(g.instr) : null, bits = [];
    if (ind) {
      if (ind.measures) bits.push(ind.measures);
      if (ind.range) bits.push('Indicating range ' + fmtInstrValue(ind.range[0], ind.unit, g.instr) +
                               ' to ' + fmtInstrValue(ind.range[1], ind.unit, g.instr) + '.');
      if (ind.lag_s) bits.push('About ' + ind.lag_s + ' s of instrument lag — it trails the plant.');
      if (ind.alarms && ind.alarms.length) {
        bits.push('Drives ' + ind.alarms.map(function (id) {
          var sp = alarmSpec(id);
          return sp ? (sp.label_industry || sp.label_learning || id) : id;
        }).join(', ') + '.');
      }
    }
    bits.push('The coloured bands are the alarm and trip setpoints. The needle reads the ' +
              'instrument, which can be stuck, drifting or dead while the plant behind it is ' +
              'fine — and the reverse (HR1).');
    return bits.join(' ');
  }
  // Fuller account of an active alarm (M8 §11): what condition brought it in,
  // sourced per-alarm from the plant's own protection table.
  function alarmDetail(a) {
    var sp = alarmSpec(a.id), out = [];
    if (sp) {
      var ind = manualIndication(sp.instrument);
      var name = (ind && ind.name) || sp.instrument;
      var dir = { high: 'rises to', low: 'falls to', is_true: 'goes true',
                  is_open: 'shows open', is_false: 'goes false' }[sp.direction] || 'reaches';
      out.push('Comes in when ' + name + ' ' + dir +
               (sp.setpoint != null ? ' ' + fmtInstrValue(sp.setpoint, ind && ind.unit, sp.instrument) : '') + '.');
      out.push('Annunciated off the INSTRUMENT: a failed transmitter can bring this in with the ' +
               'plant healthy, or stay dark with the plant in trouble.');
    }
    if (a.base_priority) {
      out.push('Normally classed ' + a.base_priority + ' — shown lower here because this condition ' +
               'is the planned state of the plant in this mode or lineup.');
    }
    out.push('Click the tile to acknowledge; acknowledging silences the tile, it does not fix ' +
             'anything. The response procedure is in Alarm Response.');
    return out.join(' ');
  }

  // ============================================================ build static DOM
  function buildGauges() {
    var strip = $('gaugeStrip'); strip.innerHTML = ''; gaugeHist = {}; gaugeTrend = {};
    prof().gauges.forEach(function (g) {
      var el = document.createElement('div');
      el.className = 'gauge' + (g.lead ? ' lead' : '');
      el.setAttribute('data-scanner-hint', g.label + ' — reads the instrument (lagged/noisy/fallible), not the true value.');
      // Detail tier (#96): built from the generated manual reference rather than
      // authored twice — range, lag and the alarms this instrument drives are
      // already recorded there, per instrument, for every plant.
      el.setAttribute('data-scanner-detail', gaugeDetail(g));
      if (manualDoc('03_controls_and_indications')) {
        el.setAttribute('data-scanner-doc', '03_controls_and_indications');
        el.setAttribute('data-scanner-sec', '16.0');       // indication catalog
      }
      el.innerHTML =
        '<div class="g-label"><span>' + g.label + '</span><span class="g-trend trend-flat" data-trend></span></div>' +
        '<div class="g-valrow">' +
          '<div class="g-value" data-val>—</div>' +
          '<svg class="g-spark" viewBox="0 0 100 14" preserveAspectRatio="none"><polyline data-spark fill="none" stroke="#56657a" stroke-width="1.5"/></svg>' +
        '</div>' +
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

  // The plot checklist, GROUPED by `series[].grp` *(OWNER, 2026-08-03: "organize the graph
  // list in an intelligent order and group them in groups")*. Group order is first-seen
  // order in the profile, so the array IS the display order and there is no second list to
  // keep in step — add a series in the right place and it lands in the right group.
  // A profile with no `grp` (RBMK/BWR) renders exactly as it did: one ungrouped run.
  function buildGraphParams() {
    var box = $('graphParams'); box.innerHTML = '';
    var groups = {};                       // group name -> its container element
    prof().series.forEach(function (s) {
      var host = box;
      if (s.grp) {
        if (!groups[s.grp]) {
          var g = document.createElement('div'); g.className = 'param-grp';
          var hd = document.createElement('div'); hd.className = 'param-grp-h'; hd.textContent = s.grp;
          g.appendChild(hd); box.appendChild(g);
          groups[s.grp] = g;
        }
        host = groups[s.grp];
      }
      var row = document.createElement('label'); row.className = 'param-row';
      row.innerHTML = '<input type="checkbox" data-series="' + s.id + '"' + (ui.series[s.id] ? ' checked' : '') + '>' +
        '<i style="background:' + s.c + '"></i>' + s.label;
      host.appendChild(row);
    });
  }

  // ------------------------------------------------------------- physics tab
  // Built once per plant, updated from the same snapshot as everything else —
  // but ONLY while the pane is actually on screen. The rows are formatted
  // strings, so a hidden pane would burn ~24 of them a frame for nobody.
  // Element references are cached at build time: the frame path does no DOM
  // queries at all (the All-view grid re-queries per row per frame, and this
  // pane updates on every broadcast, fast-forward included).
  var physRows = [];   // [{ el, row }] in profile order
  function buildPhysics() {
    var box = $('physicsPane'); if (!box) return;
    physRows = [];
    var groups = prof().physics;
    if (!groups) {
      // RBMK/BWR: no panel authored (those plants are on hold). Say so rather
      // than showing an empty box that reads like a broken tab.
      box.innerHTML = '<div class="phys-none">No physics panel is built for this plant yet.</div>';
      return;
    }
    // Every row carries its own System Scanner copy (#350 item 3). The panel is the one
    // place on the board where the numbers are UNDER-THE-HOOD physics rather than gauges —
    // fuel temperature, xenon, void fraction, oxidation heat — so it is precisely the list
    // a player is least able to interpret from the label alone, and it was the only surface
    // in the shell with no inspection copy at all. `hint`/`detail` are authored beside the
    // formatter in `prof().physics` so the two cannot drift apart, and `run_inspect` fails
    // if a row ships without them.
    var html = '';
    groups.forEach(function (g) {
      html += '<div class="phys-grp"><h4>' + g.title + '</h4>';
      g.rows.forEach(function (r) {
        // The block splits the summary on ' — ', so the row key becomes the title.
        var hint = r.hint ? ' data-scanner-hint="' + esc(r.k + ' — ' + r.hint) + '"' : '';
        var det = r.detail ? ' data-scanner-detail="' + esc(r.detail) + '"' : '';
        html += '<div class="num-line"' + hint + det + '><span class="nk">' + r.k +
                '</span><span class="nv">—</span></div>';
      });
      html += '</div>';
    });
    box.innerHTML = html;
    var cells = box.querySelectorAll('.nv'), n = 0;
    groups.forEach(function (g) { g.rows.forEach(function (r) { physRows.push({ el: cells[n++], row: r }); }); });
  }
  function physicsVisible() {
    var card = $('toolsCard'), pane = document.querySelector('.tabpane[data-pane="physics"]');
    return !!(pane && pane.classList.contains('on') && card && !card.classList.contains('collapsed'));
  }
  function renderPhysics(s) {
    if (!physRows.length || !physicsVisible()) return;
    var t = s.true_state; if (!t) return;
    physRows.forEach(function (p) {
      var txt, cls = '';
      // A row that throws is a missing true_state field on this plant, not a
      // reason to take the whole frame down with it.
      try { txt = p.row.v(t, s); cls = p.row.cls ? p.row.cls(t, s) : ''; } catch (e) { txt = '—'; }
      // A MISSING value gets no state colour. `cls` is computed from true_state and can
      // come back 'q-ok' (green) or 'q-alarm' (red) for a row whose value renders as an
      // em-dash — a field this plant has not published yet, which is the normal state for
      // one broadcast at t=0 (measured: clad_temp_c is absent at t=0 and reads 1280 °F /
      // 693 °C by the first sample). A green dash asserts "this criterion is satisfied"
      // about a number nobody has, which is worse than saying nothing.
      var missing = (txt == null || txt === '—');
      p.el.textContent = missing ? '—' : txt;
      p.el.className = 'nv' + (missing ? '' : ' ' + cls);
    });
  }

  // Order the catalog into the profile's `failGroups`, with a trailing catch-all.
  // NOTHING MAY VANISH: the membership table is hand-maintained, so a failure absent from
  // it renders under "Other" rather than being silently dropped — the #224 shape, where a
  // list-driven view quietly under-covers the artifact it is meant to present. A plant with
  // no table (RBMK/BWR, on hold) gets one unlabelled group and the old flat behaviour.
  function groupFailures(cat) {
    var groups = prof().failGroups;
    if (!groups) return [{ title: null, rows: cat }];
    var byId = {}; cat.forEach(function (f) { byId[f.id] = f; });
    var placed = {}, out = [];
    groups.forEach(function (g) {
      var rows = [];
      g.ids.forEach(function (id) { if (byId[id]) { rows.push(byId[id]); placed[id] = true; } });
      if (rows.length) out.push({ title: g.title, rows: rows });
    });
    var rest = cat.filter(function (f) { return !placed[f.id]; });
    if (rest.length) out.push({ title: 'Other', rows: rest });
    return out;
  }

  function buildFailures() {
    var list = $('failList'); list.innerHTML = '';
    groupFailures(service.layer.getFailureCatalog()).forEach(function (g) {
      if (g.title) {
        var h = document.createElement('div');
        h.className = 'fail-grp'; h.textContent = g.title;
        list.appendChild(h);
      }
      g.rows.forEach(function (f) { list.appendChild(buildFailRow(f)); });
    });
  }

  function buildFailRow(f) {
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
    row.innerHTML = html;
    return row;
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
  // RETIRED 2026-07-26 (#217). This applied a per-FRAME EMA to every instrument and
  // replaced s.instruments wholesale, so the whole board read damped values. Three
  // reasons it had to go:
  //
  //   1. It is a SECOND lag. The engine already models instrument lag properly —
  //      inside the physics step, on sim time (HR6). This one sat on top of it,
  //      uncontrolled and undocumented in any spec.
  //   2. It has no `dt` term, so the damping is FRAME-RATE DEPENDENT: a 120 Hz display
  //      damps twice as fast as a 60 Hz one. Instrument dynamics must be sim-time
  //      correct (HR6) — that is the whole reason lag lives in the engine step.
  //   3. It attenuated noise ~3x, so every sigma had to be inflated ~3x to survive it.
  //      Those same sigmas are what a `noisy` sensor FAILURE multiplies, so the
  //      inflation would have made failures wilder too. Tuning the physics to defeat a
  //      UI filter is backwards.
  //
  // Noise is now set per indication at the source (pwr_config instrument table), sized
  // against each readout's display step. One knob, in one place, sim-time correct.
  //
  // The no-op stub and its call site are gone as of 2026-07-27b (#158): an empty
  // function that every reader has to open the file to understand is worse than no
  // function. This comment is the part worth keeping — it says why the board does
  // NOT damp, which is the question someone will eventually come here to ask.

  // ============================================================ render snapshot
  // Rendering is coalesced onto requestAnimationFrame. The sim broadcasts from a
  // setTimeout (up to 20 Hz during a transient), and the per-tick DOM work is heavy
  // — the strip chart re-emits its whole SVG (and the value chips) via innerHTML
  // every frame. Mutating the DOM off the browser's paint cycle let the compositor
  // present a frame mid-rebuild on real GPUs, which showed up as the changing
  // numbers / chart / clock "strobing" — dispersing and reappearing — on the hosted
  // build, while software-rendered headless looked fine. Deferring the actual DOM
  // pass to rAF guarantees each frame is fully built before it composites, and
  // collapses multiple broadcasts landing within one frame into a single paint.
  // `latest` is still assigned synchronously so chat/command code reading it is
  // unaffected. The board (RD.PwrBoard) never had this problem — it updates SVG
  // attributes surgically rather than rebuilding markup — but it rides along fine.
  var _renderRaf = 0, _renderSnap = null;
  var _raf = window.requestAnimationFrame ? window.requestAnimationFrame.bind(window)
                                          : function (f) { return setTimeout(f, 16); };
  function render(s) {
    latest = s;
    _renderSnap = s;
    if (_renderRaf) return;                 // a paint is already queued — it will use the latest snap
    _renderRaf = _raf(function () {
      _renderRaf = 0;
      var snap = _renderSnap; _renderSnap = null;
      if (snap) renderNow(snap);
    });
  }
  function renderNow(s) {
    // `rawIns` used to mean "captured BEFORE display damping". There is no damping
    // any more (#217), so it is simply the instruments — kept as a named local
    // because the chart paths below read it a few times (#158).
    var rawIns = s.instruments;
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
    renderAlarms(s); renderInstructor(s); renderFailures(s);
    updateSimSummary();
    // alarm tint on the CSF gauge strip while anything is unacknowledged
    $('gaugeStrip').classList.toggle('alarm-tint', s.alarms.some(function (a) { return a.state === 'active_unacknowledged'; }));
    // auto-switch to Diagram the moment a scram fires (legacy views only).
    // Reads the rps_scrammed STATUS INSTRUMENT (HR1) — it reflects manual
    // scrams too, unlike rps_state.scrammed which latches only on trips.
    var scramInd = !!(s.instruments.rps_scrammed != null ? s.instruments.rps_scrammed : s.rps_state.scrammed);
    if (ui.plant !== 'pwr' && scramInd && !lastScrammed && ui.view !== 'diagram') setView('diagram');
    renderPlantDisplay(s);
    renderPhysics(s);
    lastScrammed = scramInd;

    // Time moved backwards (a rewind, or a walkthrough/scenario reset): drop the
    // branch of history that no longer exists and snap the gauge smoothing —
    // easing a display value across a time jump shows numbers that were never real.
    if (chartBuf.length && chartBuf[chartBuf.length - 1].t > s.metadata.sim_time + 1e-9) smoothed = {};
    while (chartBuf.length && chartBuf[chartBuf.length - 1].t > s.metadata.sim_time + 1e-9) chartBuf.pop();
    // Record ONE VALUE PER SERIES per sample — instrument in `v`, true state in `tv` —
    // rather than a copy of the whole instrument + true_state dicts. The chart only ever
    // reads the plotted quantities, and the buffer holds 30 min of SIM TIME, so keeping
    // the full dicts cost ~100 MB (and carrying truth alongside would have doubled it).
    // Both sources are recorded regardless of the current mode, so toggling
    // Learning↔Realistic re-traces the history it already has instead of starting over.
    //
    // DECIMATED to CHART_SAMPLE_SEC, and that is not an optimisation — it is what makes
    // the 2026-08-03 series expansion affordable. MEASURED at the buffer's cap (1800 s of
    // sim time at the 10 Hz normal broadcast = 18000 rows): 16 series cost 10.2 MB and 51
    // cost **75.8 MB**, because the cost is per stored property and the series list
    // tripled. Two changes bring it back:
    //   · this gate — one row per 0.5 s of SIM time rather than one per broadcast, so the
    //     cap is 3600 rows instead of 18000. It is keyed on sim time, not on a broadcast
    //     COUNT, so it is invariant under timeAcceleration and under the 100→50 ms
    //     transient cadence: at any acceleration above 5× the sim already advances more
    //     than 0.5 s per broadcast and nothing is dropped at all.
    //   · chartSample only writing the sides a series actually HAS (see there).
    // Re-measured after both: **8.8 MB** for 51 series — LESS than the 10.2 MB the old
    // 16-series buffer cost, with three times the quantities. The resolution cost is nil
    // in practice: the widest window is 1800 s across ~400 px of plot, so 2 Hz is still
    // ~9x oversampled, and the preseed writes at 5 s intervals either way.
    var lastT = chartBuf.length ? chartBuf[chartBuf.length - 1].t : null;
    if (lastT != null && s.metadata.sim_time - lastT < CHART_SAMPLE_SEC) { drawChart(); return; }
    var one = chartSample(rawIns, s.true_state, s.control_state);
    var sv = one.v, stv = one.tv;
    // #237 (owner): presets start with 30 minutes of history so the graphs are populated —
    // the plant has been RUNNING, it didn't just appear. A fresh buffer (boot, reset, plant
    // switch, mission start — anything that cleared chartBuf) seeds the full record window,
    // and the cutoff trim below retires that tail as real history accrues.
    //
    // The seed is FLAT here and then replaced with a REAL 30-minute run, computed off the
    // main thread and swapped in when ready *(OWNER, 2026-08-01: "when you make preset starts,
    // run them for 30 minutes to fill up the graph with real data before saving")*. Flat-first
    // is deliberate: the real run costs ~2 s of wall clock, and paying that synchronously
    // would freeze boot, every reset, every plant switch and every mission start. See
    // ensurePreseed. (sv/stv are frozen after this call, so sharing one object per row is safe.)
    if (!chartBuf.length) {
      for (var pt = s.metadata.sim_time - CHART_RECORD_SEC; pt < s.metadata.sim_time; pt += 5) {
        chartBuf.push({ t: pt, v: sv, tv: stv });
      }
      ensurePreseed(s.metadata.sim_time);
    }
    chartBuf.push({ t: s.metadata.sim_time, v: sv, tv: stv });
    var cutoff = s.metadata.sim_time - CHART_RECORD_SEC;   // retain 30 min regardless of the display window
    while (chartBuf.length > 2 && chartBuf[0].t < cutoff) chartBuf.shift();
    drawChart();
  }

  // ---- ONE chart sample -------------------------------------------------------------
  // Extracted so the live recorder and the 30-minute preseed below cannot disagree about
  // what a row contains. Records ONE VALUE PER SERIES — instrument in `v`, true state in
  // `tv` — rather than a copy of the whole instrument + true_state dicts: the chart only
  // ever reads the ~15 plotted quantities and the buffer holds 30 min at frame rate, so
  // keeping the full dicts cost ~100 MB (and carrying truth alongside would have doubled
  // it). Both sources are recorded regardless of the current mode, so toggling
  // Learning↔Realistic re-traces the history it already has instead of starting over.
  // A series supplies `get` (instrument), `tru` (true state), `ctl` (commanded position),
  // or some combination — see the PROFILES comment.
  //
  // ONLY THE SIDES THAT EXIST ARE STORED, which is half of the 2026-08-03 memory fix: a
  // row's cost is per stored property, and writing `null` into `v` for the 19 series that
  // have no instrument at all cost exactly as much as a real number. A `ctl` series lands
  // in `v` alone — a demanded valve position has no instrument-vs-truth split to preserve,
  // and `seriesTruth` returns false for it because it declares no `tru`. Absent keys read
  // back as undefined, which `seriesVal` already treats as "no sample".
  function chartSample(rawIns, trueState, ctlState) {
    var chartIns = rawIns;   // RAW instruments — no display smoothing on the chart
    if (trueState && trueState.xenon_pct_eq != null) {
      // xenon has no instrument; carry the true value so the series can plot in both modes
      chartIns = Object.assign({}, rawIns); chartIns.xenon_pct_eq = trueState.xenon_pct_eq;
    }
    var v = {}, tv = {};
    function num(x) { return (x == null || !isFinite(x)) ? null : x; }
    prof().series.forEach(function (ser) {
      if (ser.ctl) {
        var c = null; if (ctlState) { try { c = ser.ctl(ctlState); } catch (e0) { c = null; } }
        v[ser.id] = num(c);
        return;
      }
      if (ser.get) { var a; try { a = ser.get(chartIns); } catch (e) { a = null; } v[ser.id] = num(a); }
      if (ser.tru && trueState) { var b; try { b = ser.tru(trueState); } catch (e2) { b = null; } tv[ser.id] = num(b); }
    });
    return { v: v, tv: tv };
  }

  // ---- REAL 30-minute trend preseed (owner, 2026-08-01) -------------------------------
  // "when you make preset starts, run them for 30 minutes to fill up the graph with real
  // data before saving". The graphs used to open on 360 IDENTICAL flat samples, so a fresh
  // plant showed a ruler-straight line where a running plant shows instrument texture.
  //
  // WHAT THIS CHANGES, honestly: the initial conditions are constructed as TRUE steady
  // states (`_buildState` derives the secondary temps so each preset is genuinely settled),
  // so 30 real minutes is a NOISY FLAT LINE, not a different shape — measured at
  // hot_full_power: power 99.78–100.2 %, Tavg 304.0–304.2 °C, pzr level 54.6–55.3 %. The
  // gain is that it reads as a plant that has been running, plus the genuine slow drifts
  // (xenon, boron) a synthetic seed cannot have.
  //
  // WHY IT IS ASYNC AND CACHED. A 30-plant-minute full-stack run measured 1874 ms, and a
  // fresh chart buffer happens on boot, reset, plant switch AND every mission start —
  // paying that synchronously would freeze all four. So: seed flat immediately (above),
  // compute the real trace in setTimeout slices, swap it in, and cache it per
  // plant+design-version+initial-state for the session, because the answer is identical
  // every time that triple repeats.
  // `pendingT0` is tracked separately from the run because the SAME preset can be re-seeded
  // while its trace is still computing (reset to the same IC, a mission restart). The trace
  // is still valid — the preset has not changed — but it must land against the NEW seed
  // time, so ensurePreseed updates this and the completion reads it rather than closing over
  // the t0 it started with.
  var preseed = { cache: {}, runningKey: null, pendingT0: 0 };
  function preseedKey() {
    var e = ENGINES[ui.engineKey] || {};
    return ui.plant + '|' + (e.dv || '') + '|' + ui.initState;
  }
  // Splice a computed trace into the synthetic tail. `t0` is the sim time the buffer was
  // seeded at, so rows land on [t0 − CHART_RECORD_SEC, t0) and anything the live recorder
  // has added since (t ≥ t0) is preserved untouched.
  function applyPreseed(rows, t0, key) {
    // The world may have moved while we were computing: a reset, a plant switch, a rewind
    // or another seed. Any of those makes this trace the wrong answer — drop it silently.
    if (key !== preseedKey() || !chartBuf.length) return;
    var live = chartBuf.filter(function (r) { return r.t >= t0 - 1e-9; });
    if (!live.length) return;                      // buffer was cleared out from under us
    var seeded = [];
    for (var i = 0; i < rows.length; i++) {
      var t = t0 - CHART_RECORD_SEC + i * 5;
      if (t >= t0) break;
      seeded.push({ t: t, v: rows[i].v, tv: rows[i].tv });
    }
    chartBuf = seeded.concat(live);
    drawChart();
  }
  function ensurePreseed(t0) {
    if (!RD.SimulationService) return;
    var key = preseedKey();
    if (preseed.cache[key]) { applyPreseed(preseed.cache[key], t0, key); return; }
    preseed.pendingT0 = t0;
    if (preseed.runningKey === key) return;        // already computing — the new t0 is enough
    preseed.runningKey = key;
    var e = ENGINES[ui.engineKey] || {};
    var probe;
    try {
      // A SEPARATE service — never the live one. Default lineup (no `noDefaults`), so the
      // trace is the plant a player actually gets, including the channels that are
      // `defaultOn` (rod control since #289).
      probe = new RD.SimulationService({ seed: 0x51EED });
      probe.selectPlant(ui.plant, ui.initState, e.dv || undefined, undefined);
      probe.running = true;
      probe.timeAcceleration = 10;                 // 1.0 sim-s per broadcast → 5 s every 5 ticks
      probe.attentionStops = false;                // nobody is watching a background run
    } catch (err) { preseed.runningKey = null; return; }
    var rows = [], ticks = 0;
    // 40 ticks per slice, not 120. Measured, a tick costs ~1.04 ms, so 40 is ~42 ms of work
    // — under the ~50 ms a user perceives as a stutter — where 120 would be ~125 ms of
    // visible jank, fifteen times over, while the plant is live behind it.
    var TICKS = CHART_RECORD_SEC, SLICE = 40;
    (function step() {
      if (preseed.runningKey !== key) return;      // superseded — abandon this run
      for (var n = 0; n < SLICE && ticks < TICKS; n++, ticks++) {
        var snap = probe.tick();
        if (ticks % 5 === 0 && snap) rows.push(chartSample(snap.instruments, snap.true_state, snap.control_state));
      }
      if (ticks < TICKS) { setTimeout(step, 0); return; }
      preseed.cache[key] = rows;
      preseed.runningKey = null;
      applyPreseed(rows, preseed.pendingT0, key);
    })();
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
      // Auto-ranging gauge: a gauge may pick a different scale/bands from the reading
      // (e.g. Tavg swaps to a wide LOW-RANGE scale in cold shutdown to save a second gauge).
      var eff = g.autorange ? Object.assign({}, g, g.autorange(raw) || {}) : g;
      var lblSpan = root.querySelector('.g-label span');
      if (lblSpan && eff.label && lblSpan.textContent !== eff.label) lblSpan.textContent = eff.label;
      var st = gaugeState(eff, raw);
      root.classList.toggle('warn', st === 'warn');
      root.classList.toggle('alarm', st === 'alarm');
      var disp = g.dim ? conv(raw, g.dim) : raw * (g.mul || 1);
      var units = g.dim ? unit(g.dim) : g.units;
      root.querySelector('[data-val]').innerHTML = disp.toFixed(g.dp) + '<span class="g-units"> ' + units + '</span>';
      var frac = (raw - eff.min) / (eff.max - eff.min), cf = Math.max(0, Math.min(1, frac));
      root.querySelector('[data-needle]').style.left = (cf * 100) + '%';
      // single dim bar track; colored fill (to the needle) only when in a band
      var fill = root.querySelector('[data-fill]');
      if (st !== 'normal') { fill.style.display = 'block'; fill.style.width = (cf * 100) + '%'; fill.style.background = st === 'alarm' ? 'var(--bar-alarm)' : 'var(--bar-warn)'; }
      else fill.style.display = 'none';
      // trend + sparkline — keep a rolling 1-minute (sim-time) window, not a fixed
      // sample count, so the mini chart spans the same minute at any time-accel.
      var h = gaugeHist[g.id], now = s.metadata.sim_time;
      while (h.length && h[h.length - 1].t > now + 1e-9) h.pop();   // drop samples ahead of us (rewind)
      // fresh gauge → seed its 60 s sparkline flat at the current value (#237,
      // same steady-state preseed as the strip chart; also settles the trend arrow)
      if (!h.length) for (var ps = now - 60; ps < now; ps += 5) h.push({ t: ps, v: raw });
      h.push({ t: now, v: raw });
      while (h.length > 1 && h[0].t < now - 60) h.shift();          // 60 s window
      // #237: deadband + hysteresis on the trend arrow. The old rule (0.2 % of
      // range over 5 samples) lit ▲/▼ from noise-scale drift at steady state —
      // and an arrow that is sometimes lit at steady state teaches players to
      // ignore arrows. New rule: light only when the DISPLAYED value has moved
      // at least one least-significant display digit across the whole 60 s
      // window; clear again below half that (re-entry hysteresis) or when the
      // drift direction flips, so a value dithering on the boundary can't strobe.
      var tr = root.querySelector('[data-trend]');
      if (h.length > 4) {
        var dNow = g.dim ? conv(h[h.length - 1].v, g.dim) : h[h.length - 1].v * (g.mul || 1);
        var dThen = g.dim ? conv(h[0].v, g.dim) : h[0].v * (g.mul || 1);
        var dd = dNow - dThen, stepU = Math.pow(10, -(g.dp || 0));
        var t0 = gaugeTrend[g.id] || 0, t1 = t0;
        if (dd >= stepU) t1 = 1;
        else if (dd <= -stepU) t1 = -1;
        else if (Math.abs(dd) < stepU * 0.5 || (t0 === 1 && dd < 0) || (t0 === -1 && dd > 0)) t1 = 0;
        gaugeTrend[g.id] = t1;
        tr.textContent = t1 > 0 ? '▲' : t1 < 0 ? '▼' : '▶';
        tr.className = 'g-trend ' + (t1 > 0 ? 'trend-up' : t1 < 0 ? 'trend-down' : 'trend-flat');
      }
      var vals = h.map(function (p) { return p.v; });
      var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals), rng = (mx - mn) || 1;
      var pts = h.map(function (p, i) { return (i / Math.max(1, h.length - 1) * 100).toFixed(1) + ',' + (13 - (p.v - mn) / rng * 12).toFixed(1); }).join(' ');
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

  // Reactivity ρ and reactor period live on the PWR Physics Diagram (under
  // REACTIVITY), not in the Operate tab.

  // Friendly cause for the Reactor Trip alarm, keyed by rps_state.last_trip_reason
  // ("<instrument> <direction>", set in control_kernel on the first trip to fire).
  // Falls back to a cleaned-up raw string so a newly-added trip still reads sensibly.
  var TRIP_CAUSE = {
    'power_range high':        'Hi Neutron Flux',
    'source_range high':       'Source Range Hi Flux',
    'intermediate_range high': 'Intermediate Range Hi Flux',
    'tavg high':               'Hi Coolant Temp (Tavg)',
    'primary_pressure high':   'Hi RCS Pressure',
    'primary_pressure low':    'Lo RCS Pressure',
    'pzr_level low':           'Lo Pressurizer Level',
    'sg_level low':            'Lo SG Level',
    'sg_level high':           'Hi SG Level (P-14)',
    'rcs_flow low':            'Lo RCS Flow',
    'manual scram':            'Manual Trip'
  };
  function tripCauseLabel(reason) {
    if (!reason) return null;
    if (TRIP_CAUSE[reason]) return TRIP_CAUSE[reason];
    return reason.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim()
      .replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  // #237: annunciation timestamps. The snapshot's alarm records carry state but not
  // WHEN each came in, and post-event diagnosis ("did SG level high precede the
  // trip?") needs the sequence — so the UI stamps first-seen sim time per alarm.
  // Re-annunciation re-stamps (the entry clears when the alarm does), and a rewind
  // that lands before a stamp discards it (a stamp from the abandoned future).
  var alarmSeen = {};
  function alarmClock(t) {
    t = Math.max(0, Math.floor(t));
    var h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
    return 'T+' + (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (sec < 10 ? '0' : '') + sec;
  }
  function renderAlarms(s) {
    var stack = $('alarmStack');
    var now = s.metadata ? s.metadata.sim_time : 0;
    var active = s.alarms.filter(function (a) { return a.state !== 'clear'; });
    var liveIds = {};
    active.forEach(function (a) {
      liveIds[a.id] = true;
      if (alarmSeen[a.id] == null || alarmSeen[a.id] > now + 1e-9) alarmSeen[a.id] = now;
    });
    Object.keys(alarmSeen).forEach(function (id) { if (!liveIds[id]) delete alarmSeen[id]; });
    // Severity keeps the triage order; WITHIN a severity, newest first — the
    // stamps carry the exact sequence either way.
    var prio = { critical: 0, warning: 1, caution: 2, status: 3 };
    active.sort(function (a, b) {
      var d = prio[a.priority] - prio[b.priority];
      return d !== 0 ? d : (alarmSeen[b.id] || 0) - (alarmSeen[a.id] || 0);
    });
    var nUnack = active.filter(function (a) { return a.state === 'active_unacknowledged'; }).length;
    var title = $('alarmTitle');
    if (title) title.textContent = nUnack ? 'Alarms (' + nUnack + ')' : 'Alarms';
    if (!active.length) { stack.innerHTML = '<div class="alarm-empty">— no active alarms —</div>'; return; }
    stack.innerHTML = active.map(function (a) {
      var cat = alarmCategory(a);
      var sev = a.priority === 'critical' ? 'crit' : a.priority === 'warning' ? 'warn' : '';
      var unack = a.state === 'active_unacknowledged' ? ' unack' : '';
      var glyph = a.priority === 'critical' ? '⚠' : a.priority === 'warning' ? '△' : '●';
      // Unacknowledged tiles carry an explicit ACK chip — the whole tile is the
      // click target, but the affordance must be visible without the scanner.
      var chip = unack ? '<span class="ack-chip">ACK</span>' : '';
      // Reactor Trip is the one alarm whose cause the operator can't read off the
      // tile — append the first-out trip reason (why it scrammed) from the RPS state.
      var label = a.tile_label;
      if (a.id === 'reactor_trip') {
        var cause = tripCauseLabel(s.rps_state && s.rps_state.last_trip_reason);
        if (cause) label += ' — ' + cause;
      }
      var stamp = alarmSeen[a.id] != null ? alarmClock(alarmSeen[a.id]) : '';
      // Mode/lineup-reclassified tile (#240): the control layer dropped this
      // alarm's urgency because the condition is the planned state of the plant.
      // NUREG-0700 §4.3.6-3 warns that personnel can misread an alarm when they
      // do not realise a mode-defined change took effect, so the tile says what
      // it is NORMALLY classed as — the reworded label already says why.
      var prioTxt = a.priority + (a.base_priority ? ' (normally ' + a.base_priority + ')' : '');
      // Inspection (#96): the tile carries both tiers. The summary is the tile's
      // own facts; the detail says what condition brought it in, from the plant's
      // protection table, and cites the alarm-response manual.
      var docAttr = manualDoc('06_alarm_response')
        ? ' data-scanner-doc="06_alarm_response" data-scanner-sec="3.0"' : '';
      return '<div class="alarm-tile ' + sev + unack + '" data-ack="' + a.id +
        '" data-scanner-hint="' + esc(label) + ' — ' + prioTxt + ' alarm (' + cat + '), annunciated ' + stamp + ' sim time. Reads the instrument; click to acknowledge."' +
        ' data-scanner-detail="' + esc(alarmDetail(a)) + '"' + docAttr + '>' +
        '<div class="bar"></div><div class="body"><div class="label">' + label +
        '</div><div class="meta">' + cat + ' · ' + prioTxt + ' · ' + a.state.replace('active_', '') +
        (stamp ? ' · <span class="alarm-t mono">' + stamp + '</span>' : '') + '</div></div>' +
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
  // Settings → Fast-forward dropout. The service owns the policy (HR5: it arrives by
  // command like everything else); the UI just mirrors what the snapshot reports.
  var attnStops = true;
  var lastSpeedSync = null;
  function syncSpeedUI(s) {
    var v = s && s.metadata ? s.metadata.time_acceleration : null;
    // Attention stop (M5): a plant event snapped fast-forward back to real time.
    // Toast the reason so the operator knows why the clock changed under them.
    var snap = s && s.metadata ? s.metadata.speed_snap : null;
    if (snap) showToast(SPEED_SNAP_MSG[snap.reason] || 'Dropped to real time', 'error');
    var as = s && s.metadata ? s.metadata.attention_stops : null;
    if (as != null && as !== attnStops) { attnStops = as; syncSeg('[data-attn]', as ? 'on' : 'off', 'attn'); }
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
  var failuresLocked = false;   // ui_policy.failures === 'locked' — the scenario owns failures (#237)
  function applyUiPolicy(s) {
    var active = s.instructor && s.instructor.scenario_id;
    var ip = active ? s.instructor.ui_policy : null;
    // Authored scenarios can lock the Failures tab: a player injecting "PORV Stuck
    // Open" mid-TMI desyncs the plant from the story the beats are scripting. The
    // tab stays visible (honesty about what the trainer is doing) but inert, with
    // a note. Free play is untouched — no scenario, no lock.
    var lock = !!(ip && ip.failures === 'locked');
    if (lock !== failuresLocked) {
      failuresLocked = lock;
      var pane = document.querySelector('.tabpane[data-pane="failures"]');
      if (pane) {
        pane.classList.toggle('fail-locked', lock);
        var note = pane.querySelector('.fail-locked-note');
        if (lock && !note) {
          note = document.createElement('div');
          note.className = 'fail-locked-note';
          note.textContent = '🔒 The scenario owns failures — injections are disabled until it ends.';
          pane.insertBefore(note, pane.firstChild);
        }
        if (!lock && note) note.remove();
      }
    }
    var syn = ip && ip.synoptic;
    if (syn) {
      if (!uiPolicyPrev) uiPolicyPrev = { diagMode: ui.diagMode, physOverlay: ui.physOverlay };
      var want = syn === 'realistic' ? 'realistic' : 'learning';
      var wantOv = want === 'learning' && !!ip.overlay;
      if (ui.diagMode !== want || ui.physOverlay !== wantOv) {
        // The mode also swaps what the strip chart traces (physics vs instruments) —
        // TMI-2 p1/p3 run Realistic so the chart keeps the deception, p2 runs Learning
        // so the reveal can show the physics. Re-fit the axes across the swap.
        if (ui.diagMode !== want) chartRange = {};
        ui.diagMode = want; ui.physOverlay = wantOv;
      }
    } else if (uiPolicyPrev) {
      ui.diagMode = uiPolicyPrev.diagMode; ui.physOverlay = uiPolicyPrev.physOverlay;
      uiPolicyPrev = null;
    }
    // Scenario prop: the maintenance tag over the AFW valve indication. Hidden
    // once its interaction is granted (the tag comes off the valve).
    var pwrDisp = RD.PwrBoard;
    if (pwrDisp && pwrDisp.setTag) {
      var tagId = ip && ip.tag;
      var chat = s.instructor && s.instructor.chat;
      var granted = !!(tagId && chat && chat.interactions && chat.interactions[tagId] &&
                       chat.interactions[tagId].granted);
      pwrDisp.setTag(tagId || null, !!tagId && !granted);
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
  // Multi-use panel title: Instructor (default free play), Checklist, Procedure,
  // scenario title, or a speaking role when the content carries one.
  function setInstrRole(title) {
    var roleEl = $('instrRole') || document.querySelector('#instructorCard .persona .role');
    if (roleEl) roleEl.textContent = title || 'Instructor';
  }
  var IDLE_INSTR_HTML =
    '<div class="instr-idle">' +
    '<p class="instr-idle-lead">Free play — operate the plant on the left. This panel is your coach and checklist host.</p>' +
    '<ol class="instr-idle-list">' +
    '<li><b>Play</b> starts the clock (or click SIMULATION PAUSED on the board).</li>' +
    '<li><b>System Scanner</b> (below) — hover anything on the board for what it is.</li>' +
    '<li><b>Checklists</b> (Operate tab) — interactive procedures that check themselves off the instruments.</li>' +
    '<li><b>Manual</b> — full operator reference and written procedures.</li>' +
    '<li><b>Plant &amp; Mission</b> (under the clock) — starting condition and guided training.</li>' +
    '</ol>' +
    '<p class="instr-idle-more">More help: <button type="button" class="btn linkish" data-open-help="1">Help</button> · ' +
    '<button type="button" class="btn linkish" data-open-tour="1">Quick tour</button> · ' +
    'advanced failures under <b>Inject Failure</b>.</p>' +
    '</div>';
  function showIdleInstructor() {
    setInstrRole('Instructor');
    var cur = $('instrCurrent');
    if (!cur) return;
    cur.classList.add('instr-standby');
    cur.innerHTML = IDLE_INSTR_HTML;
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
    // Checklist picker row: free play only — anything instructed owns the card.
    var cklRow = $('instrCklRow');
    if (cklRow) {
      var cklBusy = !!(ui.scenario || (s.instructor && (s.instructor.follow || s.instructor.chat ||
        s.instructor.checklist || s.instructor.level_complete)));
      cklRow.hidden = cklBusy || !flagOn('checklists');
      if (cklBusy) { var cm = $('cklMenu'); if (cm) cm.hidden = true; }
    }
    var fb = s.instructor && s.instructor.follow;
    if (fb) {
      ui.follow = { id: fb.procedure_id };
      syncInstrNav('follow');
      var prF = ((RD.MANUAL_PROCEDURES || {})[ui.engineKey] || []).filter(function (x) { return x.id === fb.procedure_id; })[0];
      setInstrRole(prF && prF.title ? prF.title : 'Procedure');
      renderFollow(s);
      return;
    }
    if (ui.follow) ui.follow = null;              // the snapshot says the follow ended
    // Chat-mode scenarios (TMI-2 M5): a scrolling multi-speaker transcript
    // replaces the single-slot commentary card. Level-complete renders inline.
    if (s.instructor && s.instructor.chat) { syncInstrNav('chat'); renderChat(s); return; }
    if (chatState.sid) resetChat();
    // Auto-checklist (Path 3): chat-style bubble list, one bubble per step,
    // checking itself off the instruments while the operator plays on.
    var ckb = s.instructor && s.instructor.checklist;
    if (ckb) {
      syncInstrNav('ckl');
      var prC = ((RD.MANUAL_PROCEDURES || {})[ui.engineKey] || []).filter(function (x) { return x.id === ckb.procedure_id; })[0];
      setInstrRole(prC && prC.title ? ('Checklist · ' + prC.title) : 'Checklist');
      renderChecklist(s, ckb);
      return;
    }
    if (cklState.key) resetCkl();
    var lc = s.instructor && s.instructor.level_complete;
    if (lc) { syncInstrNav('lc'); msgHold.queue = []; msgHold.shown = null; setInstrRole('Instructor'); renderLevelComplete(s, lc); return; }
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
      setInstrRole(ui.scenario ? 'Instructor' : 'Instructor');
      cur.textContent = msgHold.shown; cur.classList.remove('instr-standby');
      // No focus steal (#237): the collapsed card already shows this line
      // one-line ellipsized — cue the header and let the player expand.
      instrAttention();
    } else if (!msg && !msgHold.queue.length && dwellMet) {
      if (msgHold.shown !== null || !cur.querySelector('.instr-idle')) {
        msgHold.shown = null;
        showIdleInstructor();
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
    setInstrRole('Instructor');
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
      // The persona header stays visible in chat mode now (#237) — it is the
      // collapse affordance and the mid-scenario orientation line. It shows the
      // SCENE (scenario title), never a speaker: the transcript's per-line
      // headers carry who is talking, and a fixed speaker up top would lie
      // whenever anyone else speaks (instructor-vs-supervisor register rule).
      var sc0 = sid && RD.SCENARIOS ? RD.SCENARIOS[sid] : null;
      setInstrRole((sc0 && sc0.title) ? sc0.title : 'Scenario');
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
      // No focus steal per line (#237) — the scenario's opening already expanded
      // the card (startScenario). If the player has since collapsed it, cue.
      var iCard = $('instructorCard');
      if (iCard && !iCard.classList.contains('expanded')) { instrAttention(); iCard.querySelector('.instr-current').scrollTop = 1e6; }
    }
    chatState.rev = chat.rev;
    var unrevealed = chatState.shown < chat.log.length;
    // Buttons / level-complete zone under the transcript — held back until the
    // conversation has fully played out (no acknowledging unread dialogue).
    var btns = $('chatBtns');
    if (unrevealed) {
      // #237: transcript-level catch-up. The reading cadence is right for first
      // play, but replays/rewinds re-pace old dialogue — one tap dumps the rest
      // of the pending lines instantly. Display-only: the engine log is untouched.
      if (chatState.btnKey !== '__revealing__') {
        chatState.btnKey = '__revealing__';
        btns.innerHTML = '<button class="btn ghost chat-reveal-all" data-chatrevealall="1" ' +
          'data-scanner-hint="Reveal all — show the rest of this conversation at once instead of line-by-line.">⏩ reveal all</button>';
      }
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

  // ============================================================ auto-checklists (Path 3)
  // Renders instructor.checklist as a chat-style bubble list: every step is a
  // bubble; done steps carry the check, the active step shows its live
  // acceptance status and a manual override. Step text comes from the same
  // RD.MANUAL_PROCEDURES artifact the Instructor graded it from.
  var cklState = { key: null };
  function resetCkl() {
    if (!cklState.key) return;
    cklState = { key: null };
    var card = $('instructorCard'); if (card) card.classList.remove('chat-mode');
    var cur = $('instrCurrent'); if (cur) cur.textContent = '';
  }
  function renderChecklist(s, ck) {
    var cur = $('instrCurrent'), card = $('instructorCard');
    var pr = ((RD.MANUAL_PROCEDURES || {})[ui.engineKey] || []).filter(function (x) { return x.id === ck.procedure_id; })[0];
    if (!pr) { cur.textContent = 'Checklist: ' + ck.procedure_id; return; }   // mid plant-restore mismatch
    var key = [ck.procedure_id, (ck.steps_done || []).map(function (d) { return d ? 1 : 0; }).join(''),
      ck.step_index, ck.acc_met ? 1 : 0, ck.graded_by || '', ck.complete ? 1 : 0, ui.register].join('|');
    if (key === cklState.key) return;
    var firstBuild = !cklState.key;
    cklState.key = key;
    card.classList.add('chat-mode');
    cur.classList.remove('instr-standby');
    var h = '<div class="ckl-log" id="cklLog">';
    h += '<div class="ckl-head"><b>' + mesc(pr.title) + '</b>' +
      '<div class="m-note">Auto-checklist — steps check themselves off the instruments while you operate.</div></div>';
    for (var i = 0; i < pr.steps.length; i++) {
      var st = pr.steps[i];
      var done = !!(ck.steps_done && ck.steps_done[i]);
      var active = !ck.complete && i === ck.step_index;
      var cls = done ? 'ckl-done' : active ? 'ckl-active' : 'ckl-pend';
      var hoverable = stepHlLabels(st) ? ' ckl-hoverable' : '';
      h += '<div class="ckl-step ' + cls + hoverable + '" data-ckl-step="' + i + '"><div class="ckl-ico">' + (done ? '✓' : active ? '▸' : '○') + '</div><div class="ckl-body">';
      h += '<div class="ckl-txt">' + (i + 1) + '. ' + mesc(st.text) + '</div>';
      if (done && ck.done_by && ck.done_by[i] === 'manual') h += '<div class="ckl-sub">checked by hand</div>';
      if (active) {
        var bits = [];
        if (st.control) bits.push('Control: <b>' + mesc(st.control) + '</b>');
        if (st.target) bits.push('Target: ' + mesc(st.target));
        if (bits.length) h += '<div class="ckl-sub">' + bits.join(' &nbsp;·&nbsp; ') + '</div>';
        if (st.acc) {
          var via = ck.graded_by === 'instrument' ? 'reading the instrument' : ck.graded_by === 'true_state' ? 'no instrument twin — true value' : null;
          h += '<div class="ckl-sub">✓ when ' + mesc(st.acc.p) + ' ' + (OPSYM[st.acc.op] || st.acc.op) + ' ' + mesc(st.acc.v) +
            (ck.acc_met ? ' <span style="color:var(--running)">met</span>' : ' <span class="muted">…not yet</span>') +
            (via ? ' <span class="muted">· ' + via + '</span>' : '') + '</div>';
        }
        if (st.note) h += '<div class="ckl-sub muted">' + mesc(st.note) + '</div>';
        h += '<button class="btn ckl-mark" data-ckl-check="' + i + '">✓ Mark done</button>';
      }
      h += '</div></div>';
    }
    if (ck.complete) {
      h += '<div class="ckl-complete"><b>Checklist complete</b>' +
        (pr.outcome ? '<div class="m-note">' + mesc(pr.outcome) + '</div>' : '') + '</div>';
    }
    h += '</div>';
    h += '<div class="ckl-btns"><button class="btn" data-ckl-stop="1">' + (ck.complete ? 'Close' : 'End checklist') + '</button></div>';
    cur.innerHTML = h;
    // Step hover → glow the controls/indications the step names (its `hl` list) on
    // the plant display, reusing the Instructor highlight vocabulary (revealControl).
    Array.prototype.forEach.call(cur.querySelectorAll('.ckl-step'), function (el) {
      var st2 = pr.steps[+el.getAttribute('data-ckl-step')];
      var labs = st2 && stepHlLabels(st2);
      if (!labs) return;
      el.addEventListener('mouseenter', function () { glowLabels(labs); });
      el.addEventListener('mouseleave', clearHoverGlow);
    });
    var log = $('cklLog');
    if (log) {
      if (ck.complete) log.scrollTop = log.scrollHeight;
      else if (!firstBuild) { var act = log.querySelector('.ckl-active'); if (act) act.scrollIntoView({ block: 'nearest' }); }
    }
    if (firstBuild) setFocus('instructor');
  }
  // Labels a checklist step points at on hover: its explicit `hl` list when
  // authored (controls + indications), else a fallback to the step's own `control`
  // field (skipping the "(observe…)" placeholders that name no on-board control).
  function stepHlLabels(st) {
    if (st.hl && st.hl.length) return st.hl;
    if (st.control && !/^\(observe/i.test(st.control)) return [st.control];
    return null;
  }
  // Hover-preview glow for checklist steps: glow every control/indication label a
  // step names. Separate class from the Instructor beat glow (.instr-glow) so a
  // transient hover never wipes an active beat highlight.
  function glowLabels(labels) {
    clearHoverGlow();
    if (!labels || !labels.length) return;
    var board = (RD.PwrBoard && RD.PwrBoard.isMounted()) ? RD.PwrBoard : null;
    labels.forEach(function (lab) {
      var el = ui.plant === 'pwr' ? (board ? board.revealControl(lab) : null) : findPdControl(lab);
      if (el) el.classList.add('ckl-glow');
    });
  }
  function clearHoverGlow() {
    document.querySelectorAll('.ckl-glow').forEach(function (el) { el.classList.remove('ckl-glow'); });
  }
  // Picker menu (free-play instructor card): every non-narrative procedure for
  // the active plant can run as a checklist.
  function toggleCklMenu(force) {
    var menu = $('cklMenu'); if (!menu) return;
    var show = force != null ? !!force : menu.hidden;
    if (show) {
      var procs = ((RD.MANUAL_PROCEDURES || {})[ui.engineKey] || []).filter(function (x) {
        return !x.narrative && flagOn('procedure:' + x.id);
      });
      menu.innerHTML = procs.length ? procs.map(function (p) {
        return '<button data-ckl-start="' + mesc(p.id) + '"><span class="ckl-cat">' + mesc(p.category) + '</span>' + mesc(p.title) + '</button>';
      }).join('') : '<div class="m-note">No procedures for this plant.</div>';
    }
    menu.hidden = !show;
  }
  function startChecklist(id) {
    cmd({ action: 'start_checklist', procedure_id: id });
    setFocus('instructor', true);
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
      var pwrDisp2 = (RD.PwrBoard && RD.PwrBoard.isMounted()) ? RD.PwrBoard : null;
      el = ui.plant === 'pwr'
        ? (pwrDisp2 ? pwrDisp2.revealControl(hl.control_label) : null)
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
    // Rewind from a failure card opens the picker like every other ⏪ (#137), so
    // escaping back to the decision point is one click on it rather than repeated
    // presses walking backwards. The commentary queue is dropped at the pick.
    if (a === 'rewind') { lastLcKey = null; rewindPressed(); return; }
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
      if (nxt) { startMission(nxt); refreshMissionSelect(); return; }
    }
    if (latest) renderInstructor(latest);
  }
  // Retry a walkthrough — start_follow itself resets to the procedure's `from` state.
  function followRetry() {
    var pr = curFollowProc(); if (!pr) return;
    chartBuf = []; smoothed = {}; seriesHot = {};
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
    refreshMissionSelect();
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
  // Gated missions are skipped: "Continue campaign" must never start something
  // this channel does not offer (#241).
  function campaignFrontier(key) {
    var c = campaign(key); if (!c) return null;
    var p = progress();
    var ms = campaignMissions(c).filter(missionOn);
    for (var i = 0; i < ms.length; i++) if (!missionDone(ms[i], p)) return ms[i];
    return null;
  }
  function campaignHtml(key) {
    var c = campaign(key);
    if (!c) return '<div class="m-note">No campaign for this plant yet — try the PWR.</div>';
    var p = progress();
    // Progress counts what is OFFERED, so "12 / 12 missions" stays true on a
    // channel that ships a subset rather than reading as a permanent shortfall.
    var ms = campaignMissions(c).filter(missionOn);
    if (!ms.length) return soonPanel('campaign');
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
      var acted = a.missions.filter(missionOn);
      if (!acted.length) return;          // an act with nothing offered is not an empty heading
      h += '<div class="camp-act">' + mesc(a.title) + '</div>';
      acted.forEach(function (m) {
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
    var bonus = (c.bonus || []).filter(missionOn);
    if (bonus.length) {
      h += '<div class="camp-act">Bonus</div>';
      bonus.forEach(function (m) {
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
  // Called whenever something that the mission window displays has changed
  // (completion marks, the active-scenario card): re-render it if it is open.
  // Was `buildTraining`, a leftover from the retired Training tab — renamed
  // 2026-07-27b (#158) now that it does exactly one thing and says so.
  function refreshMissionSelect() {
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
  // ---- Feature flags (#241) — what THIS channel offers -------------------
  // Gated content is still in the build; the window simply does not list it,
  // and an area with nothing left to list says COMING SOON in its place rather
  // than showing an empty tab. Resolution lives in site/flags.js; if that file
  // is absent (an old harness page) everything falls back to visible, which is
  // the pre-#241 behaviour.
  function flagOn(id) { return !RD.Flags || RD.Flags.on(id); }
  function missionOn(m) { return flagOn(m.kind + ':' + m.id); }
  function soonPanel(area) {
    return '<div class="mp-soon"><div class="mp-soon-tag">COMING SOON</div>' +
      '<div class="m-note">' + mesc(RD.Flags ? RD.Flags.soon(area) : '') + '</div></div>';
  }
  function renderMissionSelect() {
    // Step 1 — the plant column
    $('mpPlants').innerHTML = Object.keys(ENGINES).map(function (k) {
      var e = ENGINES[k];
      return '<div class="mplant-card' + (k === msel.engine ? ' on' : '') + (e.soon ? ' soon' : '') + '"' +
        ' data-mplant="' + k + '"' + (e.soon ? ' aria-disabled="true" title="Control room under construction"' : '') + '>' +
        '<div class="mplant-name">' + mesc(e.label) + (k === ui.engineKey ? ' <span class="mplant-live">● active</span>' : '') + '</div>' +
        '<div class="mplant-sub">' + mesc(e.sub) + '</div>' +
        '<div class="mplant-desc">' + mesc(e.desc) + '</div>' +
        (e.soon ? '<div class="mplant-soon">COMING SOON</div>' : '') + '</div>';
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
    if (!flagOn('free_play')) return soonPanel('free_play');
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
    if (!flagOn('campaign')) return soonPanel('campaign');
    return '<div class="m-note" data-scanner-hint="Campaign — the guided path from first scram to a full qualification, in the recommended order. Completed missions stay replayable.">The guided path — zero to operator, in order. Every mission stays replayable.</div>' +
      campaignHtml(msel.engine);
  }
  function mpScenarios() {
    if (!flagOn('scenarios')) return soonPanel('scenarios');
    var p = progress();
    var doneS = p.completed_scenarios || [];
    var all = scenariosFor(msel.engine);
    var ids = all.filter(function (id) { return flagOn('scenario:' + id); });
    // Authored-but-gated is COMING SOON; genuinely none authored keeps its own line.
    if (all.length && !ids.length) return soonPanel('scenarios');
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
    if (!flagOn('walkthroughs')) return soonPanel('walkthroughs');
    var p = progress();
    var all = procsFor(msel.engine);
    var procs = all.filter(function (x) { return flagOn('procedure:' + x.id); });
    if (all.length && !procs.length) return soonPanel('walkthroughs');
    var doneP = p.completed_procedures || [];
    var h = '<div class="m-note">Follow a real procedure step by step — the Instructor checks each step off the instruments.</div>';
    return h + (procs.map(function (x) {
      return '<div class="tr-row"><span class="tr-ptitle">' + (doneP.indexOf(x.id) !== -1 ? '✓ ' : '') + mesc(x.title) + '</span>' +
        (flagOn('checklists') ? '<button class="btn" data-checklist="' + x.id + '" title="Run as a passive checklist against the live plant">📋</button>' : '') +
        '<button class="btn" data-follow="' + x.id + '">▶ Follow</button></div>';
    }).join('') || '<div class="m-note">No procedures for this plant.</div>');
  }

  // ============================================== Features window (#241)
  // The development toggle board: every flag in site/flags.js, its stage, and
  // what this browser currently resolves it to. Toggles write localStorage
  // OVERRIDES — they change what you see, never what the site ships; the stage
  // column is the shipped answer and only a code edit moves it.
  //
  // "View as" re-resolves the whole app against another channel, which is the
  // one thing worth doing before a release: look at develop as the public will.
  function openFeaturePanel() { renderFeaturePanel(); $('featureOverlay').hidden = false; }
  function closeFeaturePanel() { $('featureOverlay').hidden = true; }
  // Item labels come off the artifacts, not a second copy in the registry.
  function flagLabel(id) {
    var e = RD.Flags.entry(id);
    if (e && e.kind === 'area') return e.label || id;
    var kind = id.split(':')[0], key = id.split(':')[1];
    if (kind === 'scenario') { var s = (RD.SCENARIOS || {})[key]; return s ? s.title : key; }
    var procs = RD.MANUAL_PROCEDURES || {};
    for (var k in procs) {
      var hit = procs[k].filter(function (x) { return x.id === key; })[0];
      if (hit) return hit.title;
    }
    return key;
  }
  function flagPlant(id) {
    var key = id.indexOf(':') === -1 ? '' : id.split(':')[1];
    var m = /^(pwr|rbmk|bwr)_/.exec(key);
    return m ? m[1].toUpperCase() : '';
  }
  function renderFeaturePanel() {
    var F = RD.Flags, ids = F.ids();
    var ch = F.channel(), base = F.baseChannel();
    var ovCount = Object.keys(F.overrides()).length;
    var h = '<div class="m-note">What this build <em>offers</em>. Everything listed is in the bundle either way — a <span class="fl-stage fl-preview">preview</span> feature is playable here and hidden from the public site until it has been vetted and its line in <span class="mono">site/flags.js</span> moves to <span class="fl-stage fl-public">public</span>.</div>';
    h += '<div class="fl-bar"><span class="k">This build</span><span class="mono">' + mesc(base) + '</span>' +
      '<span class="k">View as</span><div class="seg" id="flChannel">' +
      F.CHANNELS.map(function (c) {
        return '<button class="' + (c === ch ? 'on' : '') + '" data-flch="' + c + '">' + c + '</button>';
      }).join('') + '</div>' +
      '<button class="btn" data-flreset="1"' + (ovCount ? '' : ' disabled') + '>Clear ' + ovCount + ' override' + (ovCount === 1 ? '' : 's') + '</button></div>';
    if (ch !== base) h += '<div class="fl-warn">⚠ Viewing as <b>' + mesc(ch) + '</b> — this is not what this build is. Clear it to get back.</div>';
    var urlOv = Object.keys(F.urlOverrides());
    if (urlOv.length) h += '<div class="fl-warn">⚠ <span class="mono">?flags=</span> in the URL is overriding ' +
      mesc(urlOv.join(', ')) + ' for this page load — it outranks the switches below. Drop it from the URL to use them.</div>';

    var groups = [];
    function group(title, list) { if (list.length) groups.push({ title: title, ids: list }); }
    group('Features', ids.filter(function (id) { return F.entry(id).kind === 'area'; }));
    ['PWR', 'RBMK', 'BWR'].forEach(function (pl) {
      group(pl + ' — scenarios', ids.filter(function (id) { return id.indexOf('scenario:') === 0 && flagPlant(id) === pl; }));
      group(pl + ' — procedures', ids.filter(function (id) { return id.indexOf('procedure:') === 0 && flagPlant(id) === pl; }));
    });
    groups.forEach(function (g) {
      h += '<div class="g-section-title" style="margin-top:12px">' + mesc(g.title) + '</div>';
      g.ids.forEach(function (id) {
        var st = F.stage(id), ov = F.override(id), live = F.on(id);
        h += '<div class="fl-row' + (live ? '' : ' off') + '">' +
          '<button class="fl-sw' + (live ? ' on' : '') + '" data-flid="' + mesc(id) + '" role="switch" aria-checked="' + live + '" title="Override this flag in this browser">' +
          (live ? 'ON' : 'OFF') + '</button>' +
          '<span class="fl-name">' + mesc(flagLabel(id)) + '</span>' +
          '<span class="fl-id mono">' + mesc(id) + '</span>' +
          '<span class="fl-stage fl-' + mesc(st) + '">' + mesc(st) + '</span>' +
          (ov != null ? '<span class="fl-ov" data-flclear="' + mesc(id) + '" title="Clear this override">overridden ✕</span>' : '') +
          '</div>';
      });
    });
    $('featureContent').innerHTML = h;
  }
  // A flag change can move anything the window or manual lists, so re-render both.
  function featureChanged() {
    renderFeaturePanel();
    refreshMissionSelect();
    if (!$('manualOverlay').hidden) renderManual();
  }
  function initFeaturePanel() {
    if (!RD.Flags) return;
    // Static shell copy that promises a gated feature (the help overlay's
    // "where everything lives") swaps to an honest line — same mechanism the
    // landing page uses.
    RD.Flags.applyDom(document);
    // Off the public channel the row is simply there; on it, ?flags=1 is the way
    // in (checking a preview feature on the live site is a real need).
    var show = RD.Flags.baseChannel() !== 'public' || /[?&]flags=/.test(location.search || '');
    $('featureRow').hidden = !show;
    $('featureBtn').addEventListener('click', openFeaturePanel);
    $('featureClose').addEventListener('click', closeFeaturePanel);
    $('featureOverlay').addEventListener('click', function (e) { if (e.target === $('featureOverlay')) closeFeaturePanel(); });
    $('featureContent').addEventListener('click', function (e) {
      var sw = e.target.closest('[data-flid]');
      if (sw) { var id = sw.getAttribute('data-flid'); RD.Flags.setOverride(id, !RD.Flags.on(id)); featureChanged(); return; }
      var cl = e.target.closest('[data-flclear]');
      if (cl) { RD.Flags.setOverride(cl.getAttribute('data-flclear'), null); featureChanged(); return; }
      var chb = e.target.closest('[data-flch]');
      if (chb) {
        var pick = chb.getAttribute('data-flch');
        RD.Flags.viewAs(pick === RD.Flags.baseChannel() ? null : pick);   // picking your own channel clears the simulation
        featureChanged(); return;
      }
      if (e.target.closest('[data-flreset]')) { RD.Flags.clearOverrides(); featureChanged(); }
    });
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
    $('playBtn').textContent = '⏸'; $('playBtn').classList.remove('paused'); $('playBtn').classList.remove('attention');
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
    chartBuf = []; smoothed = {}; seriesHot = {};
    cmd({ action: 'start_follow', procedure_id: id });
    buildAutomate();
    resetInstrFlow();            // fresh walkthrough → fresh commentary queue
    closeManual(); setFocus('instructor', true);
    if (latest) renderInstructor(latest);
  }
  // Rewind entry point (Instructor card ⏪, strip-chart ⏪, scrub track, failure
  // card ⏪). It ALWAYS opens pick-a-moment mode on the strip chart — there is no
  // one-step rewind any more (#137, OWNER 2026-07-31: "I don't think there should
  // be a rewind one step button. Make the user pick from the checkpoints on the
  // graph."). Inside a scenario or walkthrough the marks are the authored
  // checkpoints (one per beat / follow step) rather than free-play's periodic
  // ones, so the same gesture lands you on a decision point.
  function rewindPressed() { toggleRewindPick(); }
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
    // traces occupy only the left CHART_PLOT_FRAC of the plot (right gutter = value chips)
    var frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / (rect.width * CHART_PLOT_FRAC)));
    // The SAME extent drawChart plotted the marks against. This used to read the
    // whole chartBuf (up to CHART_RECORD_SEC) while the plot drew ui.window, so at
    // the default 5-minute window with 30 minutes of history a click resolved to a
    // moment ~6× further back than the one under the cursor.
    var ext = chartExtent(), t0 = ext.t0, t1 = ext.t1;
    var tPick = t0 + frac * (t1 - t0);
    var best = 0, bd = Infinity;
    for (var i = 0; i < cps.length; i++) {
      var d = Math.abs(cps[i].metadata.sim_time - tPick);
      if (d < bd) { bd = d; best = i; }
    }
    toggleRewindPick(false);
    // Drop the commentary queue: without this, cards from the abandoned timeline
    // churn through the dwell queue after the jump (az5 rematch playthrough).
    resetInstrFlow();
    // exact: the pick names a specific checkpoint — M5 must not apply the
    // consecutive-rewind walk-back clamp to it (playtest follow-up).
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
  // Focus model (#237 rework). Free play keeps the strict accordion (exactly one
  // of {instructor, tools} expanded); while instructed content is live the PLAYER
  // owns the layout and all three states are reachable — instructor max, 50/50
  // split, tools max — via the persona header (toggles the instructor card) and
  // the tab strip (expands the tools; clicking the ACTIVE tab again collapses
  // them). The instructor never expands itself on a message any more: new content
  // while collapsed cues the header badge + a brief glow instead (instrAttention).
  // setFocus remains only as the CONTENT-TRANSITION entry point — scenario /
  // walkthrough / checklist start, level-complete, strict-gate feedback — where
  // the named card taking the column is what the player's own action asked for.
  // Invariant (applyFocus): at least one card is always expanded.
  function isLive() { return !!(ui.scenario || ui.follow || chatState.sid || cklState.key); }
  function applyFocus(iExp, tExp) {
    var instr = $('instructorCard'), tools = $('toolsCard'); if (!instr || !tools) return;
    if (!iExp && !tExp) iExp = true;
    instr.classList.toggle('expanded', iExp);
    instr.classList.toggle('collapsed', !iExp);
    // `mini` (#350 item 19) is a sub-state of collapsed and cannot survive an expansion:
    // the card would take its flex share while still hiding its body. This is the choke
    // point every expansion goes through — the header toggle, the tab strip, a scenario
    // taking focus — so clearing it here covers the paths toggleInstructorCard does not.
    if (iExp && instr.classList.contains('mini')) { instr.classList.remove('mini'); setMinGlyph(); }
    tools.classList.toggle('expanded', tExp);
    tools.classList.toggle('collapsed', !tExp);
    if (iExp) clearInstrAttention();
    // Keep the transcript sliver pinned to its latest lines when the chat card
    // collapses (the collapsed chat card shows the tail, not the top).
    var cur = $('instrCurrent'); if (cur) cur.scrollTop = cur.scrollHeight;
    // The Physics pane only paints while it is visible, and this is the one choke
    // point every reveal goes through (tab click, card expand, accordion). Without
    // it, opening Physics on a PAUSED plant shows em-dashes until a broadcast that
    // never comes.
    if (tExp && latest) renderPhysics(latest);
  }
  function setFocus(which) {
    applyFocus(which === 'instructor', which !== 'instructor');
  }
  // Persona header: the always-visible collapse/expand affordance (it survives
  // chat mode now). Collapsing hands the column to the tools; expanding splits
  // while live and takes the column in free play (accordion).
  function toggleInstructorCard() {
    var instr = $('instructorCard'), tools = $('toolsCard'); if (!instr || !tools) return;
    var iExp = instr.classList.contains('expanded'), tExp = tools.classList.contains('expanded');
    if (iExp) applyFocus(false, true);
    else applyFocus(true, isLive() ? tExp : false);
  }
  // ---- the third state: FULLY minimized (#350 item 19) -----------------------------
  // *(OWNER DIRECTIVE, 2026-08-04: "Need button to be able to fully minimize instructor
  // block.")* The minimize button is a LADDER, not a toggle: expanded -> collapsed (header
  // plus a one-line preview) -> mini (header only). Two presses take the card down to a
  // 22 px strip and hand the whole column to the tools.
  //
  // The header is deliberately what survives, rather than removing the card: it carries the
  // unseen-content badge, which is the only signal that the instructor has said anything
  // while minimized. A card that vanished entirely would need a separate restore control
  // somewhere else on the shell, and the player would have no reason to look for it.
  function minimizeInstructor() {
    var c = $('instructorCard'); if (!c) return;
    if (c.classList.contains('expanded')) { toggleInstructorCard(); return; }
    if (!c.classList.contains('mini')) { c.classList.add('mini'); setMinGlyph(); }
  }
  function restoreInstructor() {
    var c = $('instructorCard'); if (!c) return;
    c.classList.remove('mini'); setMinGlyph();
    if (!c.classList.contains('expanded')) toggleInstructorCard();
  }
  // The glyph says what the NEXT press does, which is the only way a three-state control
  // is legible: '−' while there is still something to fold away, '▣' once it is folded.
  function setMinGlyph() {
    var c = $('instructorCard'), b = $('instrMinBtn'); if (!c || !b) return;
    var mini = c.classList.contains('mini');
    b.textContent = mini ? '▣' : '−';
    b.title = mini ? 'Restore instructor panel' : 'Minimize instructor panel';
    b.setAttribute('aria-label', b.title);
    b.setAttribute('data-scanner-hint', mini
      ? 'Restore — bring the instructor panel back so its messages are visible again.'
      : 'Minimize — fold the instructor panel down a step. Press it twice to leave only the header, which still shows the unread badge.');
  }

  // Tab strip: expand the tools (split while live, accordion in free play);
  // re-clicking the already-active tab collapses them back to the strip.
  function focusTools(activeAgain) {
    var instr = $('instructorCard'), tools = $('toolsCard'); if (!instr || !tools) return;
    if (activeAgain && tools.classList.contains('expanded')) { applyFocus(true, false); return; }
    applyFocus(isLive() ? instr.classList.contains('expanded') : false, true);
  }
  // #237 attention cue: new instructor content while the card is collapsed gets a
  // count badge + glow on the header (same grammar as the board's TRIP BLOCKS
  // badge) instead of stealing the column. Cleared when the player expands.
  var instrUnseen = 0;
  function instrAttention() {
    var card = $('instructorCard'); if (!card || card.classList.contains('expanded')) return;
    instrUnseen++;
    var b = $('instrBadge');
    if (b) { b.hidden = false; b.textContent = instrUnseen > 9 ? '9+' : String(instrUnseen); }
    card.classList.remove('instr-attn');
    void card.offsetWidth;   // restart the pulse animation for each new line
    card.classList.add('instr-attn');
  }
  function clearInstrAttention() {
    instrUnseen = 0;
    var b = $('instrBadge'); if (b) b.hidden = true;
    var card = $('instructorCard'); if (card) card.classList.remove('instr-attn');
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
  // WHAT THE CHART TRACES. Learning plots the PHYSICS (true_state) — instrument noise
  // is not a lesson, it just makes a trend unreadable. Realistic plots the INSTRUMENTS,
  // so a drifting Tavg or a stuck PZR level channel (PWR-E20/E21/E22) still shows up
  // as an honest disagreement between the chart and the other indications. This is a
  // display choice only: alarms and protection read instruments in both modes (HR1).
  // A series with no `tru` (RBMK/BWR) always traces its instrument.
  function chartTruth() { return ui.diagMode !== 'realistic'; }
  // Truth is used in Learning mode, AND whenever the series has no `get` at all — a
  // quantity with no instrument on this plant (decay heat, voiding, the loop pressure
  // split, core damage) has nothing else to trace, and the alternative is a blank line in
  // Realistic. That is not a softening of HR1: it is the same explicit diagnostic overlay
  // the Physics tab is, and it is visible as such because those series carry no channel.
  function seriesTruth(ser) { return !!ser.tru && (chartTruth() || !ser.get); }
  function seriesVal(ser, sample) {
    var src = seriesTruth(ser) ? sample.tv : sample.v;
    var v = src ? src[ser.id] : null;
    return (v == null || !isFinite(v)) ? null : v;
  }
  // Alarm emphasis on a trace. Latching with a release deadband (5 % of the distance
  // back into the band): a value sitting exactly on its setpoint used to strobe the
  // whole polyline once per frame.
  var seriesHot = {};   // id -> bool, held between frames
  function seriesAlarmed(ser) {
    if (!latest) return false;
    var v = null;
    try {
      if (ser.ctl) v = ser.ctl(latest.control_state || {});
      else if (seriesTruth(ser) && latest.true_state) v = ser.tru(latest.true_state);
      else if (ser.get) v = ser.get(latest.instruments);
    } catch (e) { v = null; }
    if (v == null || !isFinite(v)) return !!seriesHot[ser.id];
    var full = Math.abs(ser.range[1] - ser.range[0]) || 1, dead = full * 0.05;
    var was = !!seriesHot[ser.id], hot = was;
    if (ser.dHi != null) hot = was ? (v >= ser.dHi - dead) : (v >= ser.dHi);
    if (ser.dLo != null) hot = was ? (v <= ser.dLo + dead) : (v <= ser.dLo);
    seriesHot[ser.id] = hot;
    return hot;
  }
  // Alarm tint. 0.6 toward white washed every series out to near-grey — a "white line"
  // that no longer identified its own series. 0.28 keeps the hue; the stroke width and
  // the value chip carry the rest of the emphasis.
  function lighten(hex) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return 'rgb(' + Math.round(r + (255 - r) * 0.28) + ',' + Math.round(g + (255 - g) * 0.28) + ',' + Math.round(b + (255 - b) * 0.28) + ')';
  }
  // 1-2-5 ladder — the axis only ever lands on a round number, so a re-fit is a single
  // visible step instead of a continuous creep.
  function niceStep(raw) {
    if (!(raw > 0) || !isFinite(raw)) return 1;
    var e = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / e;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * e;
  }

  /* --------------------------------------------- one lane per series (offset) --
     Every series auto-ranges independently onto the SAME plot height, so a steady
     plant centres all of them and draws four flat lines in one place, using none of
     the top or bottom of the chart. Each series therefore gets a FIXED vertical lane
     — from its position in the active list, not from what the other traces happen to
     be doing — and its band is slid onto that lane when the band is fitted.

     Fixed is the whole point: there is nothing to search, nothing to re-shuffle and no
     way for two traces to trade places, so a line cannot move unless its own axis
     re-fits. Lanes come out evenly spaced across the plot — top-to-bottom in the order
     the series are listed — and the slide is clamped so the data never leaves the band.
     That clamp is also why no flatness test is needed: a trace already filling its band
     has no slack and simply stays where it is (it needs the room to show its shape),
     a flat one has half a band either way and slides the whole distance. */
  var LANE_LO = 0.14, LANE_HI = 0.86;   // lane centres span this much of the plot
  function laneOf(i, n) { return n < 2 ? 0.5 : LANE_HI - i * (LANE_HI - LANE_LO) / (n - 1); }

  // The plot's x extent — ONE definition, because drawChart and the rewind picker
  // must agree on it. Normally the strip-chart window: the axis always spans the
  // full ui.window and data enters at the right, scrolling left, rather than the
  // span growing until it fills. t1 is the latest sample; t0 is exactly one window
  // behind it.
  //
  // In rewind-pick mode it WIDENS to cover the whole checkpoint ring (#137). On a
  // real-time checkpoint cadence a fast-forward lays its checkpoints hours of sim
  // apart, while the widest window is 30 min — so at any speed worth rewinding
  // through, every reachable checkpoint sat off the left edge and the picker had
  // nothing to click. The traces then occupy only the right-hand sliver, which is
  // honest: chartBuf keeps CHART_RECORD_SEC of trend and no more.
  function chartExtent() {
    if (!chartBuf.length) return { t0: 0, t1: 0, span: 1 };
    var t1 = chartBuf[chartBuf.length - 1].t;
    var t0 = t1 - ui.window;
    var cps = ui.rewindPick && service ? (service.checkpoints || []) : [];
    if (cps.length) {
      var oldest = cps[0].metadata.sim_time;
      // a margin so the oldest mark is not welded to the axis and stays clickable
      if (oldest < t0) t0 = oldest - (t1 - oldest) * 0.04;
    }
    if (t1 - t0 < 1e-6) t0 = t1 - 1;
    return { t0: t0, t1: t1, span: t1 - t0 };
  }

  function drawChart() {
    var svg = $('chartCanvas'), floats = $('chartFloats'), W = 400, H = 120;
    var active = prof().series.filter(function (s) { return ui.series[s.id]; });
    if (chartBuf.length < 2) {
      chartRange = {};   // no data → forget held ranges so the next fit starts clean
      $('chartLegend').innerHTML = active.map(function (s) {
        return '<span class="leg" style="color:' + s.c + '"><i style="background:' + s.c + '"></i>' + s.label + ' <b>' + s.range[0] + '–' + s.range[1] + '</b></span>';
      }).join('');
      svg.innerHTML = ''; if (floats) floats.innerHTML = ''; return;
    }
    var ext = chartExtent(), t1 = ext.t1, t0 = ext.t0, span = ext.span;
    var PW = W * CHART_PLOT_FRAC;   // traces stop short of the right edge; value chips live in the gutter
    var html = '';
    // Downsample the VISIBLE window [t0, t1] into fixed TIME buckets — one per plot
    // pixel. chartBuf holds up to 30 min (thousands of points at 10–20 Hz) but only
    // ui.window shows; bucketing keeps drawChart O(pixels), and — unlike index-stride
    // sampling — is STABLE as the window scrolls: a sample stays in the same time
    // bucket, so the line doesn't change shape as it moves left. Averaging the
    // sub-pixel samples per bucket also makes a noisy trace readable — this is
    // pixel-resolution downsampling, NOT temporal smoothing (there's no lag).
    var startI = 0;
    while (startI < chartBuf.length - 1 && chartBuf[startI].t < t0) startI++;
    var NB = Math.max(2, Math.round(PW));   // one bucket per plot pixel
    var ranges = {}, seriesMeans = {};
    // Realistic traces the raw instrument, so it still carries sensor noise. Bucket
    // averaging alone thins out at short windows (fewer samples per bucket), so smooth
    // over a FIXED TIME width instead — the trace reads the same at 1 min and 30 min.
    // Truth needs none of this: the physics has no noise to remove.
    var secPerBucket = span / NB;
    var SMOOTH_SEC = 3;
    var kSmooth = chartTruth() ? 0 : Math.min(12, Math.floor(SMOOTH_SEC / Math.max(1e-6, secPerBucket) / 2));
    active.forEach(function (ser, si) {
      var sum = {}, cnt = {}, tsum = {};    // sparse per-bucket accumulators
      for (var j = startI; j < chartBuf.length; j++) {
        var val = seriesVal(ser, chartBuf[j]);
        if (val == null || !isFinite(val)) continue;
        var bk = Math.floor((chartBuf[j].t - t0) / span * NB);
        if (bk < 0) bk = 0; else if (bk >= NB) bk = NB - 1;
        if (cnt[bk] === undefined) { sum[bk] = 0; cnt[bk] = 0; tsum[bk] = 0; }
        sum[bk] += val; cnt[bk] += 1; tsum[bk] += chartBuf[j].t;
      }
      var means = [];
      for (var bk2 = 0; bk2 < NB; bk2++) {
        if (cnt[bk2] === undefined) continue;
        means.push({ t: tsum[bk2] / cnt[bk2], v: sum[bk2] / cnt[bk2] });
      }
      // centred moving average — zero net lag, unlike an EWMA (a drifting or stuck
      // sensor survives it untouched; only the per-sample jitter goes)
      if (kSmooth > 0 && means.length > 2 * kSmooth) {
        var sm = new Array(means.length);
        for (var m = 0; m < means.length; m++) {
          var a = Math.max(0, m - kSmooth), z = Math.min(means.length - 1, m + kSmooth), acc = 0;
          for (var q = a; q <= z; q++) acc += means[q].v;
          sm[m] = { t: means[m].t, v: acc / (z - a + 1) };
        }
        means = sm;
      }
      var vmin = Infinity, vmax = -Infinity;
      means.forEach(function (p) { if (p.v < vmin) vmin = p.v; if (p.v > vmax) vmax = p.v; });
      seriesMeans[ser.id] = means;
      // STABLE auto-range. The old model eased lo/hi toward the data every frame, which
      // re-projected the WHOLE trace every frame — history that had already been drawn
      // kept sliding and changing shape. The axis now sits on a 1-2-5 ladder and is HELD:
      // it only re-fits when the data leaves the band, or when the data has been small
      // inside it for a sustained dwell. Between re-fits every drawn point is frozen.
      var full = Math.abs(ser.range[1] - ser.range[0]) || 1;
      // Minimum zoom, so a dead-flat line doesn't fill the plot with rounding: a tenth
      // of full scale, and a fortieth for the slow-moving boron trend.
      var minSpan = full * ((ser.id === 'boron') ? 0.025 : 0.1);
      var h = chartRange[ser.id];
      var fits = h && isFinite(vmin) && vmin >= h.lo && vmax <= h.hi;
      var band = h ? (h.hi - h.lo) : 0;
      var need = Math.max(vmax - vmin, minSpan) * 1.3;   // 30 % headroom so a drifting line doesn't re-fit every few seconds
      var lane = laneOf(si, active.length);
      // Zoom back in only once the band is MUCH wider than a fresh fit would be (after a
      // transient has scrolled away), and only after a dwell. Comparing against `need` —
      // rather than against the minimum span — matters: a band that already equals its
      // fresh fit must not keep re-fitting to the identical numbers forever.
      var tooSmall = fits && band > need * 1.6;
      if (h) h.small = tooSmall ? (h.small || 0) + 1 : 0;
      if (!isFinite(vmin) || !isFinite(vmax)) {
        ranges[ser.id] = h ? [h.lo, h.hi] : [ser.range[0], ser.range[1]];
        return;
      }
      // The lane belongs to the series' slot in the list, so it is the same on every
      // fit for the life of the selection — re-fitting can change a trace's ZOOM but
      // never which lane it lives in.
      if (!h || !fits || h.small > CHART_SHRINK_FRAMES || h.lane !== si + '/' + active.length) {
        var step = niceStep(need / 4);
        var c = (vmin + vmax) / 2;
        h = { lo: Math.floor((c - need / 2) / step) * step, hi: Math.ceil((c + need / 2) / step) * step,
              small: 0, lane: si + '/' + active.length };
        if (h.hi - h.lo < step) h.hi = h.lo + step;
        // Don't spend plot height on values the quantity can't take — a level axis
        // running to −50 % reads as broken. Only clamps where the data allows it.
        var rLo = Math.min(ser.range[0], ser.range[1]), rHi = Math.max(ser.range[0], ser.range[1]);
        var inRange = h.lo >= rLo - 1e-9 && h.hi <= rHi + 1e-9;
        if (h.lo < rLo && vmin >= rLo) { h.lo = rLo; inRange = true; }
        if (h.hi > rHi && vmax <= rHi) { h.hi = rHi; inRange = true; }
        // Slide onto this series' lane. Measure from where the trace ACTUALLY sits —
        // rounding the limits onto the ladder leaves it off centre, so assuming 0.5 here
        // put traces in the wrong lane entirely. Shifting the band UP in value moves the
        // trace DOWN the plot. Clamped so the data never leaves the band, which is what
        // lets this work with no flatness test: a trace already filling its band has no
        // slack, clamps to zero and stays put; a flat one slides the whole way.
        var wide = h.hi - h.lo;
        var shift = (c - h.lo) - lane * wide;
        var up = vmin - h.lo, dn = vmax - h.hi;               // dn ≤ 0 ≤ up
        if (inRange) { up = Math.min(up, rHi - h.hi); dn = Math.max(dn, rLo - h.lo); }
        shift = Math.max(dn, Math.min(up, shift));
        h.lo += shift; h.hi += shift;
        chartRange[ser.id] = h;
      }
      ranges[ser.id] = [h.lo, h.hi];
    });
    // legend reflects the current (dynamic) range each line is scaled to.
    // Bounds render through the series' own fmt — the same conversion + unit suffix
    // the float chips use — so the legend agrees with the chips in either display
    // unit (it used to print raw internal SI beside imperial chips, #235).
    $('chartLegend').innerHTML = active.map(function (s) {
      var r = ranges[s.id];
      return '<span class="leg" style="color:' + s.c + ';margin-right:10px"><i style="background:' + s.c + '"></i>' + s.label + ' <b>' + s.fmt(r[0]) + '–' + s.fmt(r[1]) + '</b></span>';
    }).join('');
    // horizontal gridlines — barely visible, thin; recede behind the traces
    [20, 40, 60, 80, 100].forEach(function (y) { html += '<line x1="0" y1="' + y + '" x2="' + W + '" y2="' + y + '" stroke="#1e2831" stroke-width="0.5" vector-effect="non-scaling-stroke"/>'; });
    var lastY = [];
    active.forEach(function (ser) {
      var r = ranges[ser.id], lo = r[0], hi = r[1], rng = (hi - lo) || 1, ly = 0;
      var pts = seriesMeans[ser.id].map(function (m) {
        var x = (m.t - t0) / span * PW;
        var f = Math.max(0, Math.min(1, (m.v - lo) / rng));
        var y = H - 8 - f * (H - 16); ly = y;
        return x.toFixed(1) + ',' + y.toFixed(1);
      }).join(' ');
      var hot = seriesAlarmed(ser);
      html += '<polyline points="' + pts + '" fill="none" stroke="' + (hot ? lighten(ser.c) : ser.c) + '" stroke-width="' + (hot ? 2.4 : 1.5) + '" vector-effect="non-scaling-stroke"/>';
      var mm = seriesMeans[ser.id];
      lastY.push({ ser: ser, y: ly, hot: hot, val: mm.length ? mm[mm.length - 1].v : seriesVal(ser, chartBuf[chartBuf.length - 1]) });
    });
    // Rewind-pick mode: mark every checkpoint inside the window as a jump target.
    if (ui.rewindPick && service && service.checkpoints) {
      service.checkpoints.forEach(function (cp) {
        var t = cp.metadata.sim_time;
        if (t < t0 || t > t1) return;
        var x = ((t - t0) / span * PW).toFixed(1);
        html += '<line class="cp-mark" x1="' + x + '" y1="0" x2="' + x + '" y2="' + H + '" stroke="#7ab0ff" stroke-width="1" stroke-dasharray="3,3" vector-effect="non-scaling-stroke"/>' +
                '<circle cx="' + x + '" cy="6" r="2.5" fill="#7ab0ff"/>';
      });
    }
    svg.innerHTML = html;
    drawFloats(lastY, H);
    // low-profile x-axis
    var ax = $('chartXAxis'); ax.innerHTML = '';
    // Seconds read fine over a 30-min window; a rewind-pick span can be many hours
    // of sim, where "−72000s" is unreadable. Switch to h:mm:ss past ten minutes.
    var axLong = span > 600;
    for (var i = 0; i <= 5; i++) {
      var rel = (t0 + span * i / 5) - t1;
      var sp = document.createElement('span');
      sp.textContent = rel === 0 ? '0' : '−' + (axLong ? hms(-rel) : Math.round(-rel) + 's');
      ax.appendChild(sp);
    }
    $('chartWindowLbl').textContent = '−' + (span > 3600 ? hms(span) : hms(span).slice(3));
  }

  // Live floating value labels at the right edge, one per trace, color-coded and
  // spread vertically so they never overlap (move with each line).
  var _cfloatH = 0;   // measured chip height in px, cached after the first paint
  function drawFloats(items, H) {
    var floats = $('chartFloats'); if (!floats) return;
    if (!items.length) { floats.innerHTML = ''; return; }
    // The minimum separation has to come from the chip's REAL height. It was a fixed 11 %,
    // which on the shipped 174 px gutter is 19.1 px against a 21 px chip — so any time two
    // traces came close enough for the spread rule to fire, the chips it had just
    // "separated" still overlapped by a couple of pixels and the numbers were unreadable.
    // Measured once from the DOM and cached; the fallback matches the current styling.
    var hostH = floats.clientHeight || H || 1;
    var chipH = _cfloatH || 21;
    var GAP = Math.min(45, ((chipH + 3) / hostH) * 100);   // percent, always > one chip
    // `top` positions the chip's TOP edge, so the last slot has to leave room for its height
    // or the bottom chip hangs out of the gutter.
    var MIN = 0, MAX = Math.max(MIN, 100 - (chipH / hostH) * 100);
    items.forEach(function (it) { it.pct = Math.max(MIN, Math.min(MAX, it.y / H * 100)); });
    items.sort(function (a, b) { return a.pct - b.pct; });
    for (var i = 1; i < items.length; i++) if (items[i].pct < items[i - 1].pct + GAP) items[i].pct = items[i - 1].pct + GAP;
    // Shift the WHOLE column by ONE offset. The old version clamped each item with
    // Math.max(2, …) while pushing up, which could collapse the gap between the top two
    // items — i.e. the overflow fix could itself create the overlap it was preventing.
    var overflow = items[items.length - 1].pct - MAX;
    if (overflow > 0) for (var j = 0; j < items.length; j++) items[j].pct -= overflow;
    // If that pushed the top out, the column genuinely does not fit — distribute evenly so
    // the chips stay stacked and legible rather than piling up against the top edge.
    if (items[0].pct < MIN) {
      var step = (MAX - MIN) / Math.max(1, items.length - 1);
      for (var k = 0; k < items.length; k++) items[k].pct = MIN + k * step;
    }
    floats.innerHTML = items.map(function (it) {
      var col = it.hot ? lighten(it.ser.c) : it.ser.c;
      return '<span class="cfloat" style="top:' + it.pct.toFixed(1) + '%;color:' + col + '">' + it.ser.fmt(it.val) + '</span>';
    }).join('');
    if (!_cfloatH) {
      var first = floats.firstChild;
      if (first && first.offsetHeight) _cfloatH = first.offsetHeight;
    }
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
      if (r.code === 'INTERLOCK' && r.message) inspectFlash('⛔ Blocked', r.message);
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
    var el = null;
    for (var i = 0; i < els.length; i++) if (els[i].offsetParent !== null) { el = els[i]; break; }
    if (!el && els.length) el = els[els.length - 1];
    if (!el) return 0;
    var v = +el.value;
    // Bound-clamp typed values (owner ruling 2026-07-21): HTML min/max only
    // STYLE an out-of-range number input — they don't stop it. Clamp at this
    // single choke point and write the clamped value back so the operator sees
    // exactly what the plant accepted. NaN falls to the low bound.
    var lo = el.min !== '' && el.min != null ? +el.min : null;
    var hi = el.max !== '' && el.max != null ? +el.max : null;
    if (isNaN(v)) v = lo != null ? lo : 0;
    if (lo != null && v < lo) v = lo;
    if (hi != null && v > hi) v = hi;
    if (String(v) !== el.value) el.value = v;
    return v;
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
  function buildDiagBundle() {
    if (!diag) return null;
    var s = latest || service.assembleSnapshot(); var t = s.metadata.sim_time;
    diagSample(s, t);                                        // final partial-second sample
    var bundle = {
      schema_version: '1.0', kind: 'reactor_dynamics_diagnosis', exported_at: new Date().toISOString(),
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
    return bundle;
  }
  function downloadJSON(obj, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(obj)], { type: 'application/json' }));
    a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }
  function exportDiag() {
    var bundle = buildDiagBundle();
    if (!bundle) return;
    var stamp = bundle.exported_at.slice(0, 16).replace(/:/g, '');   // 2026-07-07T0046
    downloadJSON(bundle, 'rd_diag_' + stamp + '_' + ui.plant + '.json');
  }
  // Player feedback (💬). This was an in-app form that packaged a JSON report as a
  // download, against a planned POST /api/feedback that was never built — so the
  // file landed in the player's downloads folder and nowhere else. It is now just
  // the address (owner, 2026-07-29); the diagnostics bundle is still offered
  // separately, to attach by hand.
  var FEEDBACK_EMAIL = 'reactordynamics@gmail.com';
  function copyFeedbackEmail() {
    var status = $('fbStatus');
    function ok() { status.className = 'fb-msg'; status.textContent = 'Address copied.'; }
    // No clipboard API (older browser, or a non-secure origin — the control room
    // runs happily from file://, where navigator.clipboard is undefined). Select
    // the address instead, so ⌘/Ctrl-C still works and the failure is visible.
    function fallback() {
      var el = $('fbMail'), sel = window.getSelection && window.getSelection();
      if (sel && el && document.createRange) {
        var r = document.createRange(); r.selectNodeContents(el);
        sel.removeAllRanges(); sel.addRange(r);
        status.className = 'fb-msg'; status.textContent = 'Address selected — press Ctrl-C to copy.';
      } else {
        status.className = 'fb-msg err'; status.textContent = 'Copy failed — the address is ' + FEEDBACK_EMAIL;
      }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(FEEDBACK_EMAIL).then(ok, fallback);
    } else fallback();
  }

  var ACTS = {
    scram: function () { cmd({ action: 'scram' }); },
    'export-diag': function () { exportDiag(); },
    'ack-all': function () {
      // #237: a flood ack shouldn't be silent — say how many just went quiet.
      var n = latest ? latest.alarms.filter(function (a) { return a.state === 'active_unacknowledged'; }).length : 0;
      cmd({ action: 'acknowledge_all_alarms' });
      if (n > 0) showToast(n + ' alarm' + (n === 1 ? '' : 's') + ' acknowledged');
    },
    // rods — uniform across plants (+withdraw / −insert)
    'rod-raise': function () { cmd({ action: 'rod_start', group_id: 'control_rods', direction: 1, speed: ui.rodSpeed }); },
    'rod-lower': function () { cmd({ action: 'rod_start', group_id: 'control_rods', direction: -1, speed: ui.rodSpeed }); },
    'rod-nudge-out': function () { cmd({ action: 'rod_nudge', group_id: 'control_rods', steps: 1, speed: ui.rodSpeed }); },
    'rod-nudge-in': function () { cmd({ action: 'rod_nudge', group_id: 'control_rods', steps: -1, speed: ui.rodSpeed }); },
    'rodspeed-slow': function () { ui.rodSpeed = 'slow'; }, 'rodspeed-normal': function () { ui.rodSpeed = 'normal'; }, 'rodspeed-fast': function () { ui.rodSpeed = 'fast'; },
    // Shutdown (scram) bank — one click drives it the whole way out or in at fast
    // speed (not held): steps is far past max_steps so rod_nudge's target clips
    // to the end of travel and drives there, same rate-limited motion as a hold.
    'sdbank-withdraw': function () { cmd({ action: 'rod_nudge', group_id: 'shutdown_rods', steps: 4000, speed: 'fast' }); },
    'sdbank-insert': function () { cmd({ action: 'rod_nudge', group_id: 'shutdown_rods', steps: -4000, speed: 'fast' }); },
    // PWR
    // RCP start/stop is the real pump command (set_rcp) — starting the pumps is the
    // FIRST operator action of the Mode-5→3 heatup and the Mode-5→1 startup, and the
    // old clear_failure/inject_failure wiring could not start a pump secured in cold
    // shutdown (nothing sends set_rcp{running:true}; clearing a stop_pump failure is a
    // no-op — "pumps stay off until restarted"). Run also clears any RCP-trip failure so
    // it doubles as the trip recovery; Stop is a clean operator stop (rcp_running drives
    // every RCP indicator, so the board stays truthful either way).
    'rcp-run': function () { cmd({ action: 'clear_failure', failure_id: 'rcp_trip' }); cmd({ action: 'set_rcp', running: true }); },
    'rcp-stop': function () { cmd({ action: 'set_rcp', running: false }); },
    // CVCS — boron chemistry (decoupled), charging pump, letdown valve, auto make-up
    'borate': function () { cmd({ action: 'set_boron_adjust', rate: 2 }); },
    'dilute': function () { cmd({ action: 'set_boron_adjust', rate: -2 }); },
    'boron-hold': function () { cmd({ action: 'set_boron_adjust', rate: 0 }); },
    'boron-sample': function () { cmd({ action: 'take_boron_sample' }); },   // RCS grab sample → lab result after turnaround
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
    // Mode-5/heatup-cooldown pressure-control setpoint (MPa); engine clamps to the relief band.
    'press-sp-set': function () { cmd({ action: 'set_pressure_setpoint', mpa: inputVal('pressSpSet') }); },
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
    // Rated ask on breaker close — read from the active plant's config (SLS-100 = 100 MWe).
    'breaker-close': function () { var r = (RD['PWR_CONFIG'] && ui.plant === 'pwr') ? RD.PWR_CONFIG.turbine.mwe_rated : (ui.plant === 'bwr' ? 1100 : 1000); cmd({ action: 'set_steam_demand', mwe: r }); },
    'breaker-open': function (b) { armedConfirm(b, function () { cmd({ action: 'set_steam_demand', mwe: 0 }); }); },
    'mwe-set': function () { cmd({ action: 'set_steam_demand', mwe: inputVal('mweSet') }); },
    'porv-block-open': function () { cmd({ action: 'open_block_valve' }); },
    'porv-block-close': function (b) { armedConfirm(b, function () { cmd({ action: 'close_block_valve' }); }); },
    'dump-auto': function () { cmd({ action: 'set_steam_dump', mode: 'auto' }); },
    'dump-open': function () { cmd({ action: 'set_steam_dump', mode: 'open' }); },
    'dump-close': function () { cmd({ action: 'set_steam_dump', mode: 'closed' }); },
    'porv-open': function () { cmd({ action: 'open_porv' }); }, 'porv-close': function () { cmd({ action: 'close_porv' }); },
    // (No dhr-on/dhr-off handlers: nothing emits them. The set_dhr COMMAND alias
    // still lives in the engine/kernel as a save-file contract — pinned by
    // run_e2e_controls — but the UI speaks RHR only. #145)
    // synoptic emergency card: RHR — AUTO re-arms the ESF actuation (a manual
    // On/Off flips it to MANUAL, like the HPI and AFW arms).
    'rhr-auto': function () { cmd({ action: 'set_esf_auto', system: 'rhr', auto: true }); },
    'rhr-on': function () { cmd({ action: 'set_rhr', active: true }); }, 'rhr-off': function () { cmd({ action: 'set_rhr', active: false }); },
    'dump-set': function () { cmd({ action: 'set_steam_dump', pct: inputVal('dumpSet') }); },
    // No-load steam-dump pressure setpoint (MPa) — lowered on a cooldown; engine clamps to the SG-safety band.
    'dump-sp-set': function () { cmd({ action: 'set_steam_dump_setpoint', mpa: inputVal('dumpSpSet') }); },
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
      var again = b.classList.contains('on');   // re-click of the active tab = collapse toggle (#237)
      $('tabbar').querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
      document.querySelectorAll('.tabpane').forEach(function (p) { p.classList.toggle('on', p.getAttribute('data-pane') === b.getAttribute('data-tab')); });
      focusTools(again);
    });
    // Persona header (now visible in every mode, chat included): collapse/expand
    // via the header or the explicit minimize button (top-right). stopPropagation
    // so the card-level expand below doesn't immediately re-expand a card the
    // header just collapsed.
    var personaEl = document.querySelector('#instructorCard .persona');
    if (personaEl) personaEl.addEventListener('click', function (e) {
      e.stopPropagation();
      // Minimize is the dedicated collapse affordance while expanded; clicking the
      // rest of the header still toggles (expand from collapsed / collapse from expanded).
      if (e.target.closest('#instrMinBtn')) { minimizeInstructor(); return; }
      // The header toggles; from FULLY minimized it restores rather than collapsing
      // further, which would be a dead click on the only control left.
      if ($('instructorCard').classList.contains('mini')) { restoreInstructor(); return; }
      toggleInstructorCard();
    });
    // Expand a collapsed instructor by clicking anywhere on the collapsed card.
    // When expanded, this is a no-op so the card's own buttons (Acknowledge,
    // chat, level-complete) still work normally.
    $('instructorCard').addEventListener('click', function () {
      var c = $('instructorCard');
      if (c.classList.contains('mini')) { restoreInstructor(); return; }
      if (c.classList.contains('collapsed')) toggleInstructorCard();
    });
    // generic segmented active state (delegated so rebuilt controls keep working)
    document.body.addEventListener('click', function (e) {
      var btn = e.target.closest('.seg button'); if (!btn) return;
      var seg = btn.closest('.seg'); seg.querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); }); btn.classList.add('on');
    });
    $('playBtn').addEventListener('click', function () {
      if (service.running) { service.stop(); $('playBtn').textContent = '▶'; $('playBtn').classList.add('paused'); }
      else { service.start(); $('playBtn').textContent = '⏸'; $('playBtn').classList.remove('paused'); $('playBtn').classList.remove('attention'); }
    });
    $('speed').addEventListener('click', function (e) {
      var b = e.target.closest('[data-speed]'); if (!b) return;
      // The ⚡ badge is syncSpeedUI's job (it runs off the snapshot and null-guards
      // the element). This handler used to set it too, unguarded — and the PWR shell
      // has no #ffBadge, so every speed click threw before the segment could repaint.
      cmd({ action: 'set_speed', value: +b.getAttribute('data-speed') });
    });
    // Settings: Units only under Display (#277 removed Values / Terminology /
    // Physics Overlay). RBMK/BWR All-view Instruments/True/Both still lives on
    // the plant display itself (#pdOverlaySeg). Register + physOverlay keep
    // their defaults; stack still accepts set_register for tests.
    $('unitsSeg').addEventListener('click', function (e) { var b = e.target.closest('[data-units]'); if (!b) return; applyUnitsMode(b.getAttribute('data-units')); });
    var aseg = $('attnSeg');
    if (aseg) aseg.addEventListener('click', function (e) {
      var b = e.target.closest('[data-attn]'); if (!b) return;
      attnStops = b.getAttribute('data-attn') === 'on';
      cmd({ action: 'set_attention_stops', value: attnStops });
    });
    $('graphParams').addEventListener('change', function (e) { var cb = e.target.closest('input[data-series]'); if (!cb) return; ui.series[cb.getAttribute('data-series')] = cb.checked; drawChart(); });
    $('graphWindow').addEventListener('click', function (e) { var b = e.target.closest('[data-win]'); if (!b) return; ui.window = +b.getAttribute('data-win'); chartRange = {}; drawChart(); });
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
    $('manualContent').addEventListener('click', function (e) {
      // Cross-document links inside the packed markdown manual.
      var dl = e.target.closest('[data-doc]');
      if (dl) {
        e.preventDefault();
        var mm = mdManual();
        var doc = mm && mm.docs.filter(function (d) { return d.file === dl.getAttribute('data-doc'); })[0];
        if (doc) { ui.manualSection = doc.id; renderManual(); }
        else showToast('That document is not part of the packed manual.', 'error');
        return;
      }
      var c = e.target.closest('[data-checklist]');
      if (c) { closeManual(); startChecklist(c.getAttribute('data-checklist')); return; }
      var b = e.target.closest('[data-follow]'); if (!b) return; followProcedure(b.getAttribute('data-follow'));
    });
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
      var ra = e.target.closest('[data-chatrevealall]');
      if (ra) {
        chatState.instantThrough = Number.MAX_SAFE_INTEGER;   // everything pending reveals as backlog
        chatState.nextAt = 0;
        if (latest) renderChat(latest);
        return;
      }
      var b = e.target.closest('[data-lc]'); if (!b) return; levelCompleteAction(b.getAttribute('data-lc'));
    });
    // Auto-checklists: picker in Operate (free play) + bubble-list buttons on the card.
    var cklPicker = $('instrCklRow');
    if (cklPicker) cklPicker.addEventListener('click', function (e) {
      var st = e.target.closest('[data-ckl-start]');
      if (st) { toggleCklMenu(false); startChecklist(st.getAttribute('data-ckl-start')); return; }
      if (e.target.closest('#cklOpenBtn')) toggleCklMenu();
    });
    $('instructorCard').addEventListener('click', function (e) {
      var mk = e.target.closest('[data-ckl-check]');
      if (mk) { cmd({ action: 'checklist_check', index: +mk.getAttribute('data-ckl-check') }); return; }
      if (e.target.closest('[data-ckl-stop]')) cmd({ action: 'stop_checklist' });
    });
    // Plant & Mission window: plant / mode / start-condition picks re-render in
    // place; the start buttons close the window and launch.
    $('missionBtn').addEventListener('click', openMissionSelect);
    $('simStatus').addEventListener('click', openMissionSelect);   // the always-visible entry point
    $('missionClose').addEventListener('click', closeMissionSelect);
    initFeaturePanel();          // Features — development toggles (#241)
    // Help + quick tour (also offered from SIMULATION PAUSED on the board).
    $('helpBtn').addEventListener('click', function () { $('helpOverlay').hidden = false; });
    $('helpClose').addEventListener('click', function () { $('helpOverlay').hidden = true; });
    $('helpOverlay').addEventListener('click', function (e) { if (e.target === $('helpOverlay')) $('helpOverlay').hidden = true; });
    if ($('helpTourBtn')) $('helpTourBtn').addEventListener('click', function () {
      $('helpOverlay').hidden = true; openTour(0);
    });
    initTour();
    // Contact (email) overlay — status line resets each open. RD_VERSION is stamped
    // at deploy time and may be absent when opened straight off disk.
    $('fbBtn').addEventListener('click', function () {
      $('fbStatus').textContent = '';
      $('fbVer').textContent = (typeof window.RD_VERSION === 'string' && window.RD_VERSION)
        ? 'Build ' + window.RD_VERSION + ' — quoting this in a bug report says exactly which version you were on.'
        : '';
      $('feedbackOverlay').hidden = false;
    });
    $('fbClose').addEventListener('click', function () { $('feedbackOverlay').hidden = true; });
    $('feedbackOverlay').addEventListener('click', function (e) { if (e.target === $('feedbackOverlay')) $('feedbackOverlay').hidden = true; });
    $('fbCopy').addEventListener('click', copyFeedbackEmail);
    $('fbDiag').addEventListener('click', function () { exportDiag(); });
    // About docs (#259) — Settings → Disclaimer / License / Changelog. Content is
    // packed into RD.SITE_DOCS so the portable single-file build has them offline.
    (function initSiteDocs() {
      function openSiteDoc(id) {
        var docs = (RD && RD.SITE_DOCS) || {};
        var d = docs[id];
        if (!d) return;
        $('docTitle').textContent = d.title || id;
        $('docBody').innerHTML = d.html || '';
        $('docBody').scrollTop = 0;
        $('docOverlay').hidden = false;
      }
      function closeSiteDoc() { $('docOverlay').hidden = true; }
      var settingsPane = document.querySelector('[data-pane="settings"]');
      if (settingsPane) {
        settingsPane.addEventListener('click', function (e) {
          var b = e.target.closest('[data-site-doc]');
          if (!b) return;
          openSiteDoc(b.getAttribute('data-site-doc'));
        });
      }
      if ($('docClose')) $('docClose').addEventListener('click', closeSiteDoc);
      if ($('docOverlay')) {
        $('docOverlay').addEventListener('click', function (e) {
          if (e.target === $('docOverlay')) closeSiteDoc();
        });
      }
      // Logo version chip — same changelog the Settings button opens.
      if ($('logoVer')) {
        $('logoVer').style.cursor = 'pointer';
        $('logoVer').title = 'Release version — open the changelog';
        $('logoVer').addEventListener('click', function () { openSiteDoc('changelog'); });
      }
    })();
    // Instructor idle links (Help / Tour) — delegated so re-rendered HTML works.
    $('instructorCard').addEventListener('click', function (e) {
      if (e.target.closest('[data-open-help]')) { e.preventDefault(); $('helpOverlay').hidden = false; return; }
      if (e.target.closest('[data-open-tour]')) { e.preventDefault(); openTour(0); return; }
    });
    // Board focus — hides the right simulator panel and tucks the time controls
    // into the chart/alarms strip so the plant diagram gets the full width.
    (function () {
      var appEl = document.querySelector('.app');
      var simControls = document.querySelector('.sim-controls');
      var rightColEl = document.querySelector('.right-col');
      var demoBtn = $('demoBtn');
      if (!appEl || !simControls || !rightColEl || !demoBtn) return;
      var hidden = false;
      demoBtn.addEventListener('click', function () {
        hidden = !hidden;
        var midCol = document.querySelector('.bottom-row');
        if (hidden) {
          appEl.classList.add('sim-hidden');
          if (midCol) midCol.insertBefore(simControls, midCol.firstChild);  // time controls → left end of the strip
          demoBtn.classList.add('on');
          demoBtn.title = 'Exit board focus — show the side panel';
        } else {
          appEl.classList.remove('sim-hidden');
          rightColEl.insertBefore(simControls, rightColEl.firstChild);      // time controls → back atop the right panel
          demoBtn.classList.remove('on');
          demoBtn.title = 'Board focus — hide the side panel and enlarge the plant diagram';
        }
      });
    })();
    $('missionOverlay').addEventListener('click', function (e) {
      if (e.target === $('missionOverlay')) { closeMissionSelect(); return; }
      var pc = e.target.closest('[data-mplant]');
      if (pc) {
        // Plants whose control room isn't built yet are shown but not selectable.
        if (ENGINES[pc.getAttribute('data-mplant')].soon) return;
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
        if (fm) { closeMissionSelect(); if (fm.kind !== 'scenario') ensureEngine(msel.engine); startMission(fm); refreshMissionSelect(); }
        return;
      }
      var cs = e.target.closest('[data-camp-start]');
      if (cs) {
        var kv = cs.getAttribute('data-camp-start').split(':');
        closeMissionSelect();
        if (kv[0] !== 'scenario') ensureEngine(msel.engine);
        startMission({ kind: kv[0], id: kv[1] }); refreshMissionSelect(); return;
      }
      var st = e.target.closest('[data-trstart]');
      if (st) { closeMissionSelect(); startScenario(st.getAttribute('data-trstart')); refreshMissionSelect(); return; }
      if (e.target.closest('[data-trstop]')) {
        ui.scenario = null; cmd({ action: 'stop_scenario' }); refreshMissionSelect();
        if (latest) renderInstructor(latest); return;
      }
      var ckq = e.target.closest('[data-checklist]');
      if (ckq) { closeMissionSelect(); ensureEngine(msel.engine); startChecklist(ckq.getAttribute('data-checklist')); return; }
      var f = e.target.closest('[data-follow]');
      if (f) { closeMissionSelect(); ensureEngine(msel.engine); followProcedure(f.getAttribute('data-follow')); }
    });
    // Global keyboard shortcuts (documented in Help). Skipped while typing
    // in a field or holding a modifier; Space is left alone when a button has
    // focus so native activation (incl. rod hold) still works.
    var SPEED_KEYS = { '1': 1, '2': 10, '3': 60, '4': 600, '5': 3600 };
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (!$('manualOverlay').hidden) closeManual();
        if (!$('missionOverlay').hidden) closeMissionSelect();
        if (!$('helpOverlay').hidden) $('helpOverlay').hidden = true;
        if (tourOn) closeTour();
        if (!$('featureOverlay').hidden) closeFeaturePanel();
        if (!$('feedbackOverlay').hidden) $('feedbackOverlay').hidden = true;
        if ($('docOverlay') && !$('docOverlay').hidden) $('docOverlay').hidden = true;
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
      // ↑/↓ drive the control rods: Up = withdraw, Down = insert. Press-and-hold to
      // drive continuously (at the S/M/F speed); a quick tap moves one step — the board's
      // rod machine owns the tap-vs-hold decision, so we just relay down/up here.
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        if (ui.plant !== 'pwr' || !RD.PwrBoard || !RD.PwrBoard.isMounted()) return;
        e.preventDefault();
        if (e.repeat) return;   // key auto-repeat: the hold is already running
        RD.PwrBoard.driveRod('control_rods', e.key === 'ArrowUp' ? 1 : -1, true);
        return;
      }
    });
    // Release the rod drive when the arrow key comes up (parity with button release).
    document.addEventListener('keyup', function (e) {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      if (RD.PwrBoard && RD.PwrBoard.driveRod) RD.PwrBoard.driveRod('control_rods', 0, false);
    });
    // Safety net: if the window loses focus mid-hold (alt-tab, etc.) the keyup can be
    // lost — force the rod drive to release so the rods never keep driving on their own.
    window.addEventListener('blur', function () {
      if (RD.PwrBoard && RD.PwrBoard.driveRod) RD.PwrBoard.driveRod('control_rods', 0, false);
    });
    // Strip-chart rewind: the ⏪ by the scrubber + click-to-pick on the plot.
    // The scrubber track is the same affordance — clicking the timeline opens
    // pick-a-moment mode (it used to be decoration that looked draggable).
    $('chartRewindBtn').addEventListener('click', function () { rewindPressed(); });
    $('scrubTrack').addEventListener('click', function () {
      if (service && service.checkpoints && service.checkpoints.length) toggleRewindPick();
    });
    document.querySelector('.chart-plot').addEventListener('click', rewindPickClick);
    // System Scanner / inspection block — hover OR tap (touch devices have no
    // hover; a click on any hinted element also explains it, alongside whatever
    // the click does). See the inspect* helpers below for the two tiers.
    document.body.addEventListener('mouseover', function (e) { inspectAt(e); });
    document.body.addEventListener('click', function (e) { inspectAt(e); });
    var sp = $('scannerPanel');
    if (sp) sp.addEventListener('click', function (e) {
      var m = e.target.closest && e.target.closest('[data-scan-doc]');
      if (m) {
        e.stopPropagation();                      // the link is not an expand click
        openManualAt(m.getAttribute('data-scan-doc'), m.getAttribute('data-scan-sec'));
        return;
      }
      inspectExpand();
    });
    inspectExpand(loadInspectExpanded());         // restore the operator's last choice
  }

  // ============================================ System Scanner / inspection (#96)
  // One surface, two tiers. COLLAPSED it is the one-line summary of whatever the
  // cursor is over; EXPANDED the same hover also gives the full description, says
  // when the copy describes the enclosing card rather than the part, and links the
  // manual section that documents the object.
  //
  // NO HOVER HIGHLIGHT (OWNER DIRECTIVE, 2026-07-28: "when mousing over something
  // to have it show in the system scanner it should not highlight the object being
  // moused over. the white box that now appears around objects the mouse is over is
  // very annoying."). The first cut ringed the hovered object, per the merged issue
  // text in #69. In use it is noise: the pointer is already the pointer, and a ring
  // that follows it across a dense board flickers on every control you pass over.
  // The Instructor's blue glow and the checklist's green preview glow stay — those
  // point at something you did NOT choose, which is the case that needs a marker.
  //
  // Copy comes from two places, deliberately: the PWR board resolves through the
  // driver's inspect registry (plant knowledge, keyed by diagram item id), while
  // everything else in the shell carries `data-scanner-hint` / `-detail` inline —
  // the M8 §11 mechanism, which needs no manifest for chrome that has no plant
  // meaning. Nothing here reads a live value, so there is nothing to be stuck or
  // misleading (HR1 does not apply to a surface with no instruments on it).
  var inspectCur = null;        // the entry the block is describing

  function loadInspectExpanded() {
    try { return localStorage.getItem('rd_inspect_expanded') === '1'; } catch (e) { return false; }
  }
  // What is under the pointer, as an inspection entry (or null for "nothing to say").
  function inspectResolve(e) {
    var t = e.target;
    if (!t || !t.closest) return null;
    // The block never describes ITSELF. Two reasons, both found by driving it:
    // pointing at the panel would wipe the description you are in the middle of
    // reading, and — worse — the pointer has to cross the panel to reach the
    // manual link, so re-rendering on the way there detached the button before
    // the click landed. Hovering the block leaves it exactly as it is.
    if (t.closest('#scannerPanel')) return null;
    var board = (RD.PwrBoard && RD.PwrBoard.isMounted() && RD.PwrBoard.inspect) ? RD.PwrBoard : null;
    if (board && t.closest('.pwr-board-stage')) {
      // Tiles carry data-item, so any click target inside a control resolves to
      // the control. The reactor vessel is pointer-events:none so the rod buttons
      // beneath stay reachable (pwr_board buildStage) — over it the event lands on
      // the bare stage, and geometry answers instead.
      var id = board.itemIdFor(t) || board.itemIdAt(e.clientX, e.clientY);
      var info = id ? board.inspect(id) : null;
      if (info) {
        return { key: 'item:' + (info.id || id), title: info.title, brief: info.brief,
                 detail: info.detail, doc: info.doc, sec: info.sec,
                 inherited: !!info.inherited,
                 // Carry the board item id so the RENDER can ask for this control's live
                 // automation-channel status every paint (#214). Resolving the status
                 // here instead would pin it to the instant the pointer arrived, and the
                 // block does not re-resolve while the pointer sits still.
                 liveItem: id };
      }
    }
    var el = t.closest('[data-scanner-hint]');
    if (!el) return null;
    var hint = el.getAttribute('data-scanner-hint'), dash = hint.indexOf(' — ');
    return { key: 'hint:' + hint,
             title: dash > -1 ? hint.slice(0, dash) : null,
             brief: dash > -1 ? hint.slice(dash + 3) : hint,
             detail: el.getAttribute('data-scanner-detail') || null,
             doc: el.getAttribute('data-scanner-doc') || null,
             sec: el.getAttribute('data-scanner-sec') || null,
             inherited: false };
  }
  function inspectAt(e) {
    var res = inspectResolve(e);
    // Persistence (§11): pointing at nothing keeps the last description on screen
    // rather than blanking the block, so it stays readable while you act on it.
    if (!res) return;
    if (inspectCur && inspectCur.key === res.key) return;
    inspectCur = res;
    inspectRender();
  }
  // The live automation-channel status for whatever the block is describing (#214),
  // or null. Read fresh from `latest` on every render — see inspectLiveTick.
  var _liveLast = null;
  function inspectLive() {
    var it = inspectCur;
    if (!it || !it.liveItem || !latest) return null;
    if (!(RD.PwrBoard && RD.PwrBoard.isMounted() && RD.PwrBoard.liveNote)) return null;
    return RD.PwrBoard.liveNote(it.liveItem, latest);
  }
  function inspectRender() {
    var box = $('scanner'); if (!box) return;
    var it = inspectCur;
    if (!it) { box.innerHTML = '<span class="idle">Hover or tap anything to see what it does.</span>'; return; }
    var h = it.title ? '<strong>' + mesc(it.title) + '</strong> — ' + mesc(it.brief) : mesc(it.brief);
    // What this control's channel is doing RIGHT NOW, above the authored copy. The
    // stand-down cases are the whole point: an unlit AUTO lamp says the channel is off
    // but never why, and 'off — main feedwater isolated (AFW has the SGs)' is the
    // sentence that turns a mystery dropout into a lesson.
    var live = inspectLive();
    _liveLast = live ? live.text : null;      // render is the one place this is stamped
    if (live) {
      h += '<span class="scan-live' + (live.engaged ? ' on' : '') + '">' + mesc(live.text) + '</span>';
    }
    if (ui.inspectExpanded) {
      if (it.detail) h += '<div class="scan-detail">' + mesc(it.detail) + '</div>';
      var meta = [];
      // An inherited entry describes the CARD, not the part under the cursor. Say
      // so — a group summary read as a per-item one is a quiet lie about coverage.
      if (it.inherited) meta.push('<span class="scan-hint">Describes this card as a whole.</span>');
      if (it.doc) {
        meta.push('<button class="scan-manual" data-scan-doc="' + esc(it.doc) + '" data-scan-sec="' +
                  esc(it.sec || '') + '">Manual' + (it.sec ? ' §' + mesc(it.sec) : '') + '</button>');
      }
      if (meta.length) h += '<div class="scan-meta">' + meta.join('') + '</div>';
    }
    box.innerHTML = h;
  }
  // Per-broadcast refresh, and ONLY while a live entry is on screen (#214). The block
  // otherwise repaints on pointer-move alone, so a channel that stood itself down while
  // the operator held the pointer over its AUTO button would have gone on reporting the
  // state it was in when they arrived. Re-rendering unconditionally would instead fight
  // the persistence rule above (§11: pointing at nothing keeps the last description) and
  // repaint the block ten times a second for no reason, so this is gated on there being
  // something live to say, and on the text having actually changed.
  function inspectLiveTick() {
    var live = inspectLive();
    if ((live ? live.text : null) === _liveLast) return;
    inspectRender();                          // which re-stamps _liveLast
  }
  // A one-off message that takes over the block — an interlock refusing a command.
  // It goes through the same state as a hover so expanding does not silently
  // replace it with whatever was last inspected, and the next hover clears it.
  function inspectFlash(title, msg) {
    inspectCur = { key: 'flash:' + msg, title: title, brief: msg, detail: null, inherited: false };
    inspectRender();
  }
  function inspectExpand(force) {
    ui.inspectExpanded = force != null ? !!force : !ui.inspectExpanded;
    var p = $('scannerPanel'); if (p) p.classList.toggle('expanded', ui.inspectExpanded);
    var b = $('scannerToggle');
    if (b) {
      b.textContent = ui.inspectExpanded ? 'Summary only' : 'Full description';
      b.setAttribute('aria-expanded', String(ui.inspectExpanded));
    }
    try { localStorage.setItem('rd_inspect_expanded', ui.inspectExpanded ? '1' : '0'); } catch (e) {}
    inspectRender();
  }
  // Open the Operator's Manual on the document an inspection entry cites, and
  // scroll to its numbered section. Headings render as "7.3 Letdown Orifices…",
  // so the section number is the anchor — matched on a whole number segment so
  // §9.1 cannot land on §9.10.
  function openManualAt(docId, sec) {
    if (docId) ui.manualSection = docId;
    openManual();
    if (!sec) return;
    var content = $('manualContent'); if (!content) return;
    var hs = content.querySelectorAll('h1,h2,h3,h4,h5');
    for (var i = 0; i < hs.length; i++) {
      var txt = hs[i].textContent.trim();
      if (txt.indexOf(sec) !== 0) continue;
      // whole-segment match: "9.1" must not land on "9.10 …"
      if (/^\s*$/.test(txt.charAt(sec.length))) { hs[i].scrollIntoView({ block: 'start' }); return; }
    }
  }
  function syncSeg(sel, val, attr) { document.querySelectorAll(sel).forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-' + attr) === val); }); }

  // ---- Quick tour: coach-marks (highlight target + tip beside it) ----------
  // Not a centered modal — each step points at a real control so a newcomer
  // can find it on the board.
  var TOUR_STEPS = [
    {
      sel: '#viewArea',
      place: 'right',
      title: 'The plant',
      body: '<p>This diagram <b>is</b> the plant. Operate rods, pumps, valves, ' +
        'feed, and the turbine here — not in a separate menu.</p>'
    },
    {
      sel: '#gaugeStrip',
      place: 'bottom',
      title: 'Vital gauges',
      body: '<p>Power, temperature, subcooling, pressure, and levels — the ' +
        'readings you watch first. They turn amber/red when something is off.</p>'
    },
    {
      sel: '.alarm-panel',
      place: 'left',
      title: 'Alarms',
      body: '<p>Annunciators read instruments, so a failed channel can raise one — or ' +
        'withhold one. Click a tile to acknowledge. Empty is good news.</p>'
    },
    {
      sel: '.strip-chart',
      place: 'top',
      title: 'Trends &amp; rewind',
      body: '<p>Multi-parameter strip chart. <b>Rewind</b> restores an earlier ' +
        'plant state so you can try again — failure is not game over.</p>'
    },
    {
      sel: '#instructorCard',
      place: 'left',
      title: 'Instructor',
      body: '<p>Free-play coaching lives here. The title changes when a checklist, ' +
        'procedure, or scenario is running. Expand the card to read more.</p>',
      prep: function () {
        var c = $('instructorCard');
        if (c) { c.classList.remove('collapsed'); c.classList.add('expanded'); }
      }
    },
    {
      sel: '#toolsCard',
      place: 'left',
      title: 'Operate &amp; tools',
      body: '<p><b>Operate</b> — plant, mode, checklists, reset, save/load. ' +
        '<b>Inject Failure</b> when you are ready for casualties. ' +
        '<b>Graph</b> and <b>Settings</b> for trends and units.</p>',
      prep: function () {
        var t = document.querySelector('#tabbar [data-tab="operate"]');
        if (t) t.click();
      }
    },
    {
      sel: '#cklOpenBtn',
      place: 'left',
      title: 'Checklists',
      body: '<p>Interactive procedures that check themselves off the instruments. ' +
        'Best next step after this tour — hover a step to glow the controls it names.</p>',
      prep: function () {
        // Checklists live in Operate now — expand tools and show the picker.
        applyFocus(false, true);
        var t = document.querySelector('#tabbar [data-tab="operate"]');
        if (t) t.click();
        if (typeof flagOn === 'function' && flagOn('checklists')) {
          var row = $('instrCklRow');
          if (row) row.hidden = false;
        }
      },
      // If checklists are gated off or the button is not visible, use Operate.
      fallback: '#toolsCard'
    },
    {
      sel: '#manualBtn',
      place: 'bottom',
      title: 'Manual',
      body: '<p>Full operator manuals: controls, procedures, alarms, and setpoints. ' +
        'Same plant you are sitting.</p>'
    },
    {
      sel: '#simStatus',
      place: 'bottom',
      title: 'Plant &amp; Mission',
      body: '<p>Starting condition and guided content. Switching restarts the plant ' +
        'from a clean initial state.</p>'
    },
    {
      sel: '#scannerPanel',
      place: 'left',
      title: 'System Scanner',
      body: '<p>Hover anything on the board. Summary first; <b>Full description</b> ' +
        'for detail and a Manual link.</p>'
    },
    {
      sel: '#playBtn',
      place: 'bottom',
      title: 'Press Play when ready',
      body: '<p>Starts the clock. The pause overlay (and this tour) leave when you ' +
        'run. Use <b>Help</b> anytime; open a <b>Checklist</b> to practice a procedure.</p>'
    }
  ];
  var tourIdx = 0;
  var tourLiveEl = null;
  var tourOn = false;

  function tourElVisible(el) {
    if (!el) return false;
    if (el.closest && el.closest('[hidden]')) return false;
    var r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  }
  function tourResolveEl(step) {
    if (!step) return null;
    var el = step.sel ? document.querySelector(step.sel) : null;
    if (!tourElVisible(el) && step.fallback) el = document.querySelector(step.fallback);
    return tourElVisible(el) ? el : null;
  }

  function tourClearLive() {
    if (tourLiveEl) {
      tourLiveEl.classList.remove('tour-target-live');
      tourLiveEl = null;
    }
  }

  function openTour(i) {
    if (!$('tourRoot')) return;
    tourIdx = Math.max(0, Math.min(TOUR_STEPS.length - 1, i || 0));
    tourOn = true;
    $('tourRoot').hidden = false;
    document.body.classList.add('tour-active');
    renderTour();
  }
  function closeTour() {
    tourOn = false;
    tourClearLive();
    if ($('tourRoot')) $('tourRoot').hidden = true;
    document.body.classList.remove('tour-active');
  }
  function placeTourTip(target, place) {
    var tip = $('tourTip'), spot = $('tourSpot');
    if (!tip || !spot) return;
    var pad = 6;
    var r = target.getBoundingClientRect();
    var tw = Math.min(320, window.innerWidth - 24);
    var th = tip.offsetHeight || 160;
    // Spotlight box
    spot.style.top = Math.max(0, r.top - pad) + 'px';
    spot.style.left = Math.max(0, r.left - pad) + 'px';
    spot.style.width = Math.min(window.innerWidth, r.width + pad * 2) + 'px';
    spot.style.height = Math.min(window.innerHeight, r.height + pad * 2) + 'px';
    spot.hidden = false;

    var gap = 12;
    var top, left;
    var prefer = place || 'bottom';
    // Preferred side, then flip if it would leave the viewport.
    function fit(side) {
      if (side === 'bottom') {
        top = r.bottom + gap; left = r.left + r.width / 2 - tw / 2;
      } else if (side === 'top') {
        top = r.top - th - gap; left = r.left + r.width / 2 - tw / 2;
      } else if (side === 'left') {
        top = r.top + r.height / 2 - th / 2; left = r.left - tw - gap;
      } else { // right
        top = r.top + r.height / 2 - th / 2; left = r.right + gap;
      }
    }
    fit(prefer);
    if (left < 8) left = 8;
    if (left + tw > window.innerWidth - 8) left = window.innerWidth - tw - 8;
    if (top < 8) {
      if (prefer === 'top') fit('bottom');
      top = Math.max(8, top);
    }
    if (top + th > window.innerHeight - 8) {
      if (prefer === 'bottom') fit('top');
      top = Math.min(top, window.innerHeight - th - 8);
      top = Math.max(8, top);
    }
    tip.style.width = tw + 'px';
    tip.style.top = top + 'px';
    tip.style.left = left + 'px';
  }
  function renderTour() {
    if (!tourOn || !$('tourRoot')) return;
    var step = TOUR_STEPS[tourIdx];
    if (!step) { closeTour(); return; }
    tourClearLive();
    try { if (step.prep) step.prep(); } catch (e) {}
    // Allow layout (expand card / show checklist) to settle before measuring.
    requestAnimationFrame(function () {
      if (!tourOn) return;
      var el = tourResolveEl(step);
      if (!el) {
        // Skip missing targets rather than stalling the tour.
        if (tourIdx < TOUR_STEPS.length - 1) { tourIdx++; renderTour(); }
        else closeTour();
        return;
      }
      try { el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); } catch (e2) {}
      el.classList.add('tour-target-live');
      tourLiveEl = el;
      if ($('tourTitle')) $('tourTitle').textContent = step.title;
      if ($('tourBody')) $('tourBody').innerHTML = step.body;
      if ($('tourProg')) $('tourProg').textContent = (tourIdx + 1) + ' / ' + TOUR_STEPS.length;
      var prev = $('tourPrev'), next = $('tourNext');
      if (prev) prev.disabled = tourIdx <= 0;
      if (next) next.textContent = tourIdx >= TOUR_STEPS.length - 1 ? 'Done' : 'Next →';
      // Second frame: after scroll/expand, tip height is known.
      requestAnimationFrame(function () {
        if (!tourOn || !tourLiveEl) return;
        placeTourTip(tourLiveEl, step.place);
      });
    });
  }
  function initTour() {
    if (!$('tourRoot')) return;
    $('tourPrev').addEventListener('click', function () {
      if (tourIdx > 0) { tourIdx--; renderTour(); }
    });
    $('tourNext').addEventListener('click', function () {
      if (tourIdx >= TOUR_STEPS.length - 1) closeTour();
      else { tourIdx++; renderTour(); }
    });
    $('tourSkip').addEventListener('click', closeTour);
    $('tourScrim').addEventListener('click', closeTour);
    window.addEventListener('resize', function () {
      if (tourOn) renderTour();
    });
  }
  function applyUnitsMode(units) {
    ui.units = units;
    syncSeg('[data-units]', units, 'units');
    if (latest) render(latest);
    if ($('manualOverlay') && !$('manualOverlay').hidden) renderManual();
  }
  // The units toggle is GLOBAL again as of #238. It was scoped from #237 (owner call
  // 2026-07-28) until 2026-08-01: the PWR board rendered US customary at every readout, so
  // a global SI selection put SI chart chips beside US board readouts — an actively
  // inconsistent display, worse than no toggle — and the SI position was disabled while the
  // PWR was active. The board has its own display-unit layer now (UNIT_FAMILIES in
  // pwr_board_wiring.js, fed by the ctx.units accessor below), so both halves move together
  // and there is nothing left to scope. This function stays because it also has to CLEAR the
  // disabled state and tooltip on a session that stored them, and because the scope may come
  // back for a plant whose board has no such layer — RBMK/BWR still render through conv().
  function syncUnitsScope() {
    var seg = $('unitsSeg'); if (!seg) return;
    var siBtn = seg.querySelector('[data-units="SI"]'); if (!siBtn) return;
    siBtn.disabled = false;
    siBtn.title = '';
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

  function mdManual() { return (RD.MANUAL_MD || {})[ui.engineKey]; }
  function openManual() { if (!mdManual() && !manualProfile()) { showToast('Manual data not loaded.', 'error'); return; } $('manualOverlay').hidden = false; renderManual(); }
  function closeManual() { $('manualOverlay').hidden = true; }

  function renderManual() {
    // Plants with a packed markdown manual (Manuals/*.md via tools/pack_manuals.js)
    // render the real operator documents; the generated RD.MANUAL reference is
    // the fallback for plants that don't have one yet (RBMK / BWR).
    if (mdManual()) { renderManualMd(mdManual()); return; }
    var p = manualProfile(); if (!p || p.reference_only) return;
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

  // ---- Markdown manual (the Manuals/*.md operator set, packed) --------------
  // The documents are the single source; Procedures / Accidents stay LIVE from
  // RD.MANUAL_PROCEDURES (they carry the follow / checklist buttons).
  var mdocCache = {};   // "engineKey|docId" → rendered html
  function renderManualMd(mm) {
    $('manualTitle').textContent = "Operator’s Manual — " + (mm.plant_label || 'Plant');
    var live = [{ id: 'procedures', label: 'Procedures (live)' }, { id: 'accidents', label: 'Accident Walkthroughs (live)' }];
    var validSec = live.some(function (s) { return s.id === ui.manualSection; }) ||
      mm.docs.some(function (d) { return d.id === ui.manualSection; });
    if (!validSec) ui.manualSection = mm.docs[0].id;
    $('manualNav').innerHTML = mm.docs.map(function (d) {
      return '<button data-msec="' + mesc(d.id) + '" class="' + (ui.manualSection === d.id ? 'on' : '') + '">' + mesc(d.label) + '</button>';
    }).join('') + '<div class="mnav-sep">Instructor</div>' + live.map(function (s) {
      return '<button data-msec="' + s.id + '" class="' + (ui.manualSection === s.id ? 'on' : '') + '">' + s.label + '</button>';
    }).join('');
    var h;
    if (ui.manualSection === 'procedures') h = mProcedures();
    else if (ui.manualSection === 'accidents') h = mAccidents();
    else {
      var doc = mm.docs.filter(function (d) { return d.id === ui.manualSection; })[0];
      var ckey = ui.engineKey + '|' + doc.id;
      if (!mdocCache[ckey]) mdocCache[ckey] = '<div class="mdoc">' + RD.mdToHtml(doc.md) + '</div>';
      h = mdocCache[ckey];
    }
    $('manualContent').innerHTML = h;
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
  // collapse: on the Procedures (live) selection page the steps are tucked into a
  // <details> so the list stays a scannable menu of checklists — the steps appear
  // when you actually Follow/run one (or expand). Accident walkthroughs pass false
  // (there the steps ARE the content). The .m-step DOM is still emitted either way.
  function mProcCard(pr, collapse) {
    // The manual's PROSE is reference material and always readable; the two
    // buttons are the instructed experiences, so they follow their flags (#241).
    // A gated procedure therefore reads normally here — it just cannot be driven.
    var item = 'procedure:' + pr.id;
    var h = '<div class="m-card"><div class="m-h">' + mesc(pr.title) + ' <span class="m-pill">' + mesc(pr.category) + '</span>' +
      (flagOn('walkthroughs') && flagOn(item) ? '<button class="btn m-follow" data-follow="' + mesc(pr.id) + '">▶ Follow in Instructor</button>' : '') +
      (flagOn('checklists') && flagOn(item) ? '<button class="btn m-follow" data-checklist="' + mesc(pr.id) + '" title="Run as a passive checklist against the live plant — no reset, steps auto-check off the instruments">📋 Checklist</button>' : '') + '</div>';
    h += '<div class="m-sub">Start from: ' + mesc(pr.from) + '</div>';
    if (pr.purpose) h += '<p style="margin:8px 0">' + mesc(pr.purpose) + '</p>';
    if (pr.prereq && pr.prereq.length) h += '<div class="m-sub2">Prerequisites</div><ul class="m-ul">' + pr.prereq.map(function (x) { return '<li>' + mesc(x) + '</li>'; }).join('') + '</ul>';
    if (pr.cautions && pr.cautions.length) h += '<div class="m-caution">' + pr.cautions.map(function (c) { return '⚠ ' + mesc(c); }).join('<br>') + '</div>';
    var stepsHtml = (pr.steps || []).map(function (st, i) { return mStep(st, i); }).join('');
    if (collapse && stepsHtml) {
      h += '<details class="m-steps"><summary class="m-steps-sum">▸ Show the ' + (pr.steps || []).length + ' steps</summary>' + stepsHtml + '</details>';
    } else {
      h += stepsHtml;
    }
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
    var driveable = flagOn('walkthroughs') || flagOn('checklists');
    var h = '<h2>Procedures</h2><p class="muted">' + (driveable
      ? 'Pick a procedure to Follow (guided, resets the plant) or run as a live 📋 Checklist against the plant as it sits. Expand a card to preview its steps.'
      : 'The written procedures for this plant. Expand a card to read its steps — the guided walkthroughs that drive them are still in review.') + '</p>';
    procs.forEach(function (pr) { h += mProcCard(pr, true); });
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
    chartBuf = []; smoothed = {}; seriesHot = {};
    syncUnitsScope();
    buildGauges(); buildGraphParams(); buildPhysics(); updateSimSummary(); buildFailures();
    // The control layer already reset its channels and engaged the plant's
    // normal lineup (M5 selectPlant → engageDefaults); the tab just rebuilds.
    buildAutomate();
    buildPlantDisplay();
    buildAdvFail();     // advanced instrument-failure panel follows the active plant
    var ps = $('pdScram'); if (ps && !ps.classList.contains('fired') && !ps.classList.contains('armed')) ps.textContent = prof().scramShort;
    refreshMissionSelect();   // walkthrough list follows the active plant
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
    // export what the chart is actually showing (seriesVal), so the CSV and the trace agree
    var rows = chartBuf.map(function (b) { return [b.t.toFixed(2)].concat(cols.map(function (c) { var v = seriesVal(c, b); return (v == null || !isFinite(v)) ? '' : v.toFixed(3); })).join(','); });
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

  // (legacy PWR partial-loop diagrams retired — the V2 board in
  //  ui/diagram/board/ is the sole PWR plant display)


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
    // their own board specs exist; the PWR mounts ui/diagram/board/pwr_board.js)
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
    if (ui.plant === 'pwr') { RD.PwrBoard.render(s); return; }   // one learning-board stage — no views
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
  // The strip chart + alarms (.bottom-row) sit UNDER the diagram, inside .plant-area,
  // for every plant — which is where the static markup already puts them, so this is
  // now just a guard that keeps them there.
  //
  // They used to be reparented out to a middle grid column for PWR (diagram |
  // chart+alarms | sim panel). The V2 board reclaimed that space: it carries its own
  // vital-parameter tile strip across the top, so the middle column was competing with
  // the diagram for width while duplicating what the tiles already showed. Two columns
  // (diagram over chart+alarms | sim panel) gives the board the room it needs and puts
  // the trend directly beneath the plant it is trending. Idempotent.
  function positionBottomRow() {
    var plant = document.querySelector('.plant-area');
    var bottom = document.querySelector('.bottom-row');
    if (!plant || !bottom) return;
    if (bottom.parentNode !== plant) plant.appendChild(bottom);
  }

  function buildPlantDisplay() {
    var syn = ui.plant === 'pwr';
    document.querySelector('.app').classList.toggle('pwr-synoptic', syn);
    positionBottomRow(syn);
    if (!syn) {
      if (RD.PwrBoard && RD.PwrBoard.isMounted()) RD.PwrBoard.unmount();
    }
    if (syn) {
      $('statusBar').innerHTML = ''; $('viewTabs').innerHTML = ''; $('pdCtlRow').innerHTML = '';
      RD.PwrBoard.mount($('viewArea'), {
        cmd: cmd, conv: conv, unit: unit,
        dispP: dispP, dispT: dispT, dispTd: dispTd, dispV: dispV,
        // The board's display-unit layer reads this and nothing else (#238). It is an
        // ACCESSOR, not a value: the board is mounted once and re-rendered thereafter, so a
        // captured 'US' would freeze the board in whichever mode it was mounted in. The
        // conv/unit/disp* helpers above have been passed since the board was built and are
        // still unused by it — the board converts through its own families, which know about
        // flow and gpm and these do not.
        units: function () { return ui.units; },
        mode: function () { return ui.diagMode; },
        overlay: function () { return ui.physOverlay; },
        // #237 (owner): the SIMULATION PAUSED veil is clickable to resume. Route
        // through the play button so its ▶/⏸ state stays the single source of truth.
        resume: function () { if (!service.running) $('playBtn').click(); },
        // Quick tour from the pause overlay (newcomer path).
        openTour: function () { openTour(0); },
      });
      return;
    }
    buildStatusBar(); buildViewSwitcher(); buildViews();
  }

  // ============================================================ init
  function init() {
    // Release version by the logo (site/release.js). Stays blank if the file is
    // missing rather than printing a placeholder that could go stale unnoticed.
    if ($('logoVer')) $('logoVer').textContent = window.RD_RELEASE || '';
    ui.series = Object.assign({}, PROFILES.pwr.defaultSeries);
    service = new RD.SimulationService({ seed: 0x1234 });
    service.subscribe(render);
    service.subscribe(diagTick);
    service.subscribe(renderAutomate);   // channels run in-stack; the tab just re-renders per broadcast
    service.subscribe(inspectLiveTick);  // #214: keep a displayed channel status from freezing
    if (RD.OneOverM) { RD.OneOverM.init({ getSnap: autoSnap, cmd: cmd }); service.subscribe(RD.OneOverM.tick); }
    bindUI(); bindCommands(); bindAutomate();
    // optional ?engine= override (dev convenience / sharing)
    var em = /[?&]engine=(pwr|rbmk_pre|rbmk_post|bwr)/.exec(location.search || '');
    var startKey = em ? em[1] : 'pwr', startEng = ENGINES[startKey];
    ui.engineKey = startKey; ui.plant = startEng.plant; ui.initState = startEng.init;
    // optional ?init=<state> override (dev convenience) — one of the plant's presets
    var initm = /[?&]init=([a-z0-9_]+)/.exec(location.search || '');
    if (initm && (prof().initStates || []).some(function (s) { return s[0] === initm[1]; })) ui.initState = initm[1];
    ui.series = Object.assign({}, prof().defaultSeries);
    syncUnitsScope();
    buildGauges(); buildGraphParams(); buildPhysics(); updateSimSummary();
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
    var tbm = /[?&]tab=(failures|graph|sim|settings|training)/.exec(location.search || '');
    if (tbm) {
      if (tbm[1] === 'training') openMissionSelect();
      else {
        var tabId = tbm[1] === 'sim' ? 'operate' : tbm[1];
        var tbtn = document.querySelector('#tabbar [data-tab="' + tabId + '"]');
        if (tbtn) tbtn.click();
      }
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
    if (/[?&]run=1/.test(location.search || '')) { service.start(); $('playBtn').textContent = '⏸'; $('playBtn').classList.remove('paused'); $('playBtn').classList.remove('attention'); }
    // optional ?follow=<procId> deep-link — loads a procedure into the Instructor block
    var fm = /[?&]follow=([a-z0-9_]+)/.exec(location.search || '');
    if (fm) followProcedure(fm[1]);
    refreshMissionSelect();
    // optional ?scenario=<id> deep-link — starts an M6 scenario directly
    var scm = /[?&]scenario=([a-z0-9_]+)/.exec(location.search || '');
    if (scm && RD.SCENARIOS && RD.SCENARIOS[scm[1]]) { startScenario(scm[1]); refreshMissionSelect(); }
    // Free-play Instructor idle coaching (Help / Checklists / tour pointers).
    showIdleInstructor();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
